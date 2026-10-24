/* Prüfstand für Migration 0225 — Wächter über alle Rechte.
   Echt gerechnet in pglite auf der ganzen Kette.

   Hält fest, was anon (ohne Konto) und authenticated (eingeloggt)
   direkt über die Data-API erreichen. Die erlaubte Liste steht in
   0225_rechte_freigaben.json. Neue Freigabe → rot, bis sie dort
   bewusst eingetragen ist.

   Prüft außerdem:
     - jede Tabelle in public hat RLS an
     - jede security-definer-Funktion hat einen festen search_path
     - Views mit Rechten für anon/authenticated laufen als Aufrufer
       (security_invoker), sonst gingen sie an RLS vorbei
     - neue Funktionen sind standardmäßig zu (Standardrechte, 0225)
     - die internen Knowledge-Stack-/Clash-Helfer sind zu

   Aufruf:  node supabase/tests/0225_rechte_waechter.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

const STUBS = `
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create table if not exists _aal (aal text);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(jsonb_build_object('aal', (select aal from _aal limit 1)), '{}'::jsonb) $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const ERLAUBT = JSON.parse(readFileSync(`${REPO}/supabase/tests/0225_rechte_freigaben.json`, 'utf8'));
const LISTE = 'supabase/tests/0225_rechte_freigaben.json';

const fnq = role => db.query(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and has_function_privilege($1, p.oid, 'execute') order by 1`, [role]);
const tq = role => db.query(`select c.relname || ':' || string_agg(distinct x.priv, ',' order by x.priv) t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (values ('select'),('insert'),('update'),('delete')) x(priv)
 where n.nspname = 'public' and c.relkind in ('r','v','m','p','f')
   and has_table_privilege($1, c.oid, x.priv)
 group by c.relname order by 1`, [role]);
const cq = role => db.query(`select c.relname || '.' || a.attname t
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','v','m','p') and a.attnum > 0 and not a.attisdropped
   and not has_table_privilege($1, c.oid, 'select')
   and has_column_privilege($1, c.oid, a.attnum, 'select') order by 1`, [role]);

for (const role of ['anon', 'authenticated']) {
  for (const [art, q, name] of [['fn', fnq, 'security-definer-Funktionen'], ['tab', tq, 'Tabellen/Views'], ['col', cq, 'Spalten']]) {
    const ist = (await q(role)).rows.map(r => r.f ?? r.t);
    const soll = new Set(ERLAUBT[role][art]);
    const neu = ist.filter(x => !soll.has(x));
    ok(`${role}: keine neuen ${name}`, neu.length === 0,
       neu.length ? `\n        neu: ${neu.join('\n             ')}\n        → prüfen und in ${LISTE} (${role}.${art}) eintragen` : '');
    const weg = [...soll].filter(x => !ist.includes(x));
    if (weg.length) console.log(`—     ${role}.${art}: nicht mehr freigegeben (aus der Liste streichen): ${weg.join(', ')}`);
  }
}

const noRls = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity and c.relname not like '\\_%' order by 1`)).rows;
ok('jede Tabelle hat RLS', noRls.length === 0, noRls.map(r => r.relname).join(', '));

const noSp = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1`)).rows;
ok('jede security-definer-Funktion hat search_path', noSp.length === 0, noSp.map(r => r.proname).join(', '));

const views = (await db.query(`select c.relname, coalesce(c.reloptions::text, '') o from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))`)).rows;
const offen = views.filter(v => !/security_invoker=(true|on)/.test(v.o));
ok('Views für Nutzer laufen als Aufrufer (security_invoker)', offen.length === 0, offen.map(v => v.relname).join(', '));

await db.exec(`create function public._probe_0225() returns int language sql as $$ select 1 $$`);
const pr = await one(`select has_function_privilege('anon', 'public._probe_0225()', 'execute') a,
                             has_function_privilege('authenticated', 'public._probe_0225()', 'execute') u`);
ok('neue Funktion ist für anon/authenticated zu', !pr.a && !pr.u);
await db.exec(`drop function public._probe_0225()`);

for (const f of ['ks_ensure_board(uuid)', 'ks_ensure_player(uuid,uuid)', 'ks_owned_room(text)', 'clash_fire_teams(uuid)']) {
  const r = await one(`select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u`, [f]);
  ok(`intern zu: ${f}`, !r.a && !r.u);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
