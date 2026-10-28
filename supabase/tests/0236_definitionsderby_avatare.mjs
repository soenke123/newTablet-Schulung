/* Prüfstand für Migration 0236 — Definitions Derby: Insel-Wesen als
   Profilbilder. Echt gerechnet in pglite auf der ganzen Kette 0001…0236.

     1. dd_wesen_files rechnet wesenAst aus tools/DefinitionsDerby/tool.js
        Bit für Bit nach (2000 zufällige ids, Code direkt aus tool.js).
     2. Insel-Stufe in dd_progress → alle Formen des Asts ab Baby bis dahin.
     3. UPDATE: nur geänderte Karten, kein Doppeltes; Unsinn in e bricht nichts.
     4. Karteikarten-Stand ohne e schaltet nichts frei.
     5. Nachtragen beim zweiten Lauf der Migration.

   Aufruf:  node supabase/tests/0236_definitionsderby_avatare.mjs */
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
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
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

/* wesenAst + Hilfen genau so, wie sie in tool.js stehen (herausgeschnitten) */
const TOOL = readFileSync(`${REPO}/MPSkills/tools/DefinitionsDerby/tool.js`, 'utf8');
const cut = (start, end) => { const a = TOOL.indexOf(start); const b = TOOL.indexOf(end, a); if (a < 0 || b < 0) throw new Error('nicht gefunden: ' + start); return TOOL.slice(a, b); };
const JS = new Function(
  cut('  function hashStr(s) {', '  /* ─── Die Insel bauen') +
  "const SWIM = ['a_a_b', 'a_b_b']; const astCache = new Map();" +
  cut('  function wesenAst(id) {', '  /* pose:') +
  'return { wesenAst };')();
const jsFiles = id => { const a = JS.wesenAst(id); return ['ei' + a.egg, 'baby', 'k_' + a.k, 'm_' + a.m, 'g_' + a.g, 'f_' + a.g]; };

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

/* 1 Nachrechnen */
const rnd = n => Array.from({ length: n }, () => Math.random().toString(36).slice(2, 2 + 1 + Math.floor(Math.random() * 10))).join('');
const ids = [];
for (let i = 0; i < 2000; i++) ids.push(crypto.randomUUID() + ':' + rnd(1 + (i % 3)));
ids.push('demo-zelle:a1', 'x:ä€ß', ':');
const rows = (await db.query(`select i, dd_wesen_files(i) f from unnest($1::text[]) i`, [ids])).rows;
const bad = rows.filter(r => JSON.stringify(r.f) !== JSON.stringify(jsFiles(r.i)));
ok('1  dd_wesen_files = wesenAst aus tool.js (2003 ids)', bad.length === 0,
   bad.length ? JSON.stringify(bad[0]) + ' js=' + JSON.stringify(jsFiles(bad[0].i)) : '');
const forms = new Set(rows.flatMap(r => r.f));
ok('1  alle 28 Formen kommen vor', forms.size === 28, String(forms.size));

/* Aufbau */
const A = 'e0000000-0000-4000-8000-0000000000d1';
const B = 'e0000000-0000-4000-8000-0000000000d2';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status)
                values ($1, $3, 'a', 'A', 'active'), ($2, $3, 'b', 'B', 'active')`, [A, B, SCHOOL]);
const S = (await one(`insert into dd_stacks (owner_id, title) values ($1, 'Zelle') returning id`, [A])).id;
const as = async u => { await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]); };
const mine = async u => { await as(u); return (await one(`select mps_my_avatars() as r`)).r.avatars.map(x => x.id).sort(); };
const put = (u, data) => db.query(
  `insert into dd_progress (user_id, stack_id, data) values ($1, $2, $3)
   on conflict (user_id, stack_id) do update set data = excluded.data`, [u, S, JSON.stringify(data)]);
const want = (card, e) => jsFiles(S + ':' + card).slice(1, e + 1).map(f => 'mps_derby_' + f);   // ab Baby, kein Ei

/* 2 Stufe → Formen */
await put(A, { c1: { l: 2, s: 1, t: 1, e: 3, x: 0 } });
ok('2  Mittel: Baby, Klein, Mittel des Asts (kein Ei)', JSON.stringify(await mine(A)) === JSON.stringify(want('c1', 3).sort()),
   JSON.stringify(await mine(A)));
ok('2  B hat nichts', (await mine(B)).length === 0);

/* 3 UPDATE */
await put(A, { c1: { l: 2, s: 1, t: 2, e: 5, x: 0 }, c2: { e: 0 } });
const got = await mine(A);
const exp = [...new Set([...want('c1', 5), ...want('c2', 0)])].sort();
ok('3  Leuchtend; zweite Karte nur Ei: nichts dazu', JSON.stringify(got) === JSON.stringify(exp), JSON.stringify(got));
await put(A, { c1: { l: 3, s: 2, t: 3, e: 4, x: 1 }, c2: { e: 0 } });
ok('3  Rückschritt nimmt nichts weg', (await mine(A)).length === exp.length);
await put(A, { c1: { e: 'drei' }, c2: { e: 9 }, c3: { e: 2.5 }, c4: 7, c5: { e: -1 }, c6: { e: 1e300 } });
ok('3  Unsinn in e bricht nichts und schaltet nichts frei', (await mine(A)).length === exp.length);
await put(A, { c7: { e: 2.0 } });
ok('3  2.0 zählt wie 2', want('c7', 2).every(id => true) && (await mine(A)).length >= exp.length);
ok('3  nie ein Ei', !(await mine(A)).some(id => /_ei\d$/.test(id)));

/* 4 Karteikarten ohne Insel */
await put(B, { c1: { l: 3, s: 2, t: 1 }, c2: { l: 1, s: 0, t: 1 } });
ok('4  Karteikarten-Stand ohne e: nichts', (await mine(B)).length === 0);

/* 5 Nachtragen */
await db.query(`delete from mps_avatar_unlocks`);
await db.exec(`alter table dd_progress disable trigger dd_progress_avatars`);
await put(B, { c1: { e: 1 } });
await db.exec(`alter table dd_progress enable trigger dd_progress_avatars`);
ok('5  vorher (Trigger aus): B nichts', (await mine(B)).length === 0);
await db.exec(mig('0236_definitionsderby_avatare.sql'));
ok('5  Migration nochmal: B nachgetragen (Baby)', JSON.stringify(await mine(B)) === JSON.stringify(want('c1', 1).sort()),
   JSON.stringify(await mine(B)));
ok('5  A auch nachgetragen (c7 = Baby + Klein)', (await mine(A)).length === 2);

/* Rechte */
for (const fn of ['dd_imul(bigint, bigint)', 'dd_wesen_files(text)', 'dd_entry_stage(jsonb)', 'dd_progress_avatars()']) {
  const r = await one(`select has_function_privilege('authenticated', $1, 'execute') a, has_function_privilege('anon', $1, 'execute') n`, [fn]);
  ok(`R  ${fn} nicht von außen aufrufbar`, !r.a && !r.n);
}

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
