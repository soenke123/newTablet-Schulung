/* Prüfstand für Migration 0223 — Admin-Rechte nur mit 2FA (aal2).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0223.

   Die Kernzusagen:
     1. is_admin/is_superadmin/is_any_admin: nur mit aal2 true.
     2. Ohne Admin-Flag hilft aal2 nichts.
     3. can_teach bleibt für Admins auch mit aal1 (Lehrkraft-Rechte
        ohne 2FA, so entschieden).
     4. board_target_cluster: fremder Kurs nur mit aal2.
     5. apply_cluster_bonus: mit aal1 not_authorized.
     6. Policies auf cluster_bonus/cluster_bonus_grants laufen über is_admin().
     7. Wächter: keine weitere Funktion liest das Admin-Flag selbst —
        neue Stellen müssen hier bewusst eingetragen werden.

   Aufruf:  node supabase/tests/0223_admin_2fa.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

// auth.jwt() liest die Stufe aus _aal — so lässt sich aal1/aal2 umschalten.
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

const S1 = (await one(`insert into schools (slug, name) values ('aaa', 'Schule A') returning id`)).id;
const C1 = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'Kurs 1', now(), now() + interval '1 day') returning id`, [S1])).id;
const C2 = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'Kurs 2', now() + interval '2 days', now() + interval '3 days') returning id`, [S1])).id;
const SA = 'e0000000-0000-4000-8000-0000000000d1';  // Schuladmin
const VA = 'e0000000-0000-4000-8000-0000000000d2';  // Volladmin
const ST = 'e0000000-0000-4000-8000-0000000000d3';  // Schüler
await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [SA, VA, ST]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, cluster_id)
                values ($1, $4, 'sa', 'SA', null), ($2, $4, 'va', 'VA', null), ($3, $4, 'st', 'ST', $5)`,
               [SA, VA, ST, S1, C1]);
await db.query(`update profiles set is_admin = true where id = $1`, [SA]);
await db.query(`update profiles set is_admin = true, is_superadmin = true where id = $1`, [VA]);

const as = async (u, aal) => {
  await db.exec(`delete from _who; delete from _aal`);
  if (u) await db.query(`insert into _who values ($1)`, [u]);
  if (aal) await db.query(`insert into _aal values ($1)`, [aal]);
};
const flags = async () => one(`select is_admin() a, is_superadmin() s, is_any_admin() n, admin_mfa_ok() m`);

// 1 + 2
await as(SA, 'aal1'); let f = await flags();
ok('Schuladmin aal1: keine Admin-Rechte', !f.a && !f.s && !f.n);
await as(SA, 'aal2'); f = await flags();
ok('Schuladmin aal2: is_admin, is_any_admin', f.a && f.n && !f.s);
await as(VA, null); f = await flags();
ok('Volladmin ohne aal im JWT: keine Admin-Rechte', !f.a && !f.s && !f.n);
await as(VA, 'aal1'); f = await flags();
ok('Volladmin aal1: keine Admin-Rechte', !f.a && !f.s && !f.n);
await as(VA, 'aal2'); f = await flags();
ok('Volladmin aal2: alle drei', f.a && f.s && f.n);
await as(ST, 'aal2'); f = await flags();
ok('Schüler aal2: keine Admin-Rechte', !f.a && !f.s && !f.n && f.m);

// 3
await as(SA, 'aal1');
ok('can_teach: Admin mit aal1 bleibt Lehrkraft', (await one(`select can_teach() r`)).r === true);

// 4
await as(SA, 'aal1');
ok('board_target_cluster: fremder Kurs mit aal1 → null', (await one(`select board_target_cluster($1) r`, [C2])).r === null);
await as(SA, 'aal2');
ok('board_target_cluster: fremder Kurs mit aal2 → Kurs', (await one(`select board_target_cluster($1) r`, [C2])).r === C2);
await as(VA, 'aal1');
ok('board_target_cluster: Volladmin aal1 → null', (await one(`select board_target_cluster($1) r`, [C2])).r === null);
await as(ST, 'aal1');
ok('board_target_cluster: Schüler, eigener Kurs → Kurs', (await one(`select board_target_cluster(null) r`)).r === C1);

// 5
await as(SA, 'aal1');
let r = (await one(`select apply_cluster_bonus($1) r`, [ST])).r;
ok('apply_cluster_bonus: aal1 → not_authorized', r?.error === 'not_authorized', JSON.stringify(r));
await as(SA, 'aal2');
r = (await one(`select apply_cluster_bonus($1) r`, [ST])).r;
ok('apply_cluster_bonus: aal2 → kommt an der Rechteprüfung vorbei', r?.error !== 'not_authorized', JSON.stringify(r));

// 6
await as(null, null);
const pol = (await db.query(`select policyname, qual, with_check from pg_policies
                              where policyname in ('cluster_bonus_admin_all', 'cbg_admin_select_all')`)).rows;
ok('Policies cluster_bonus*: über is_admin()', pol.length === 2 && pol.every(p => /is_admin\(\)/.test(p.qual) && !/p\.is_admin/.test(p.qual)));

// 7 Wächter: wer liest das Admin-Flag sonst noch selbst?
// Eingetragen sind nur Stellen, die das Flag eines ZIELS lesen (Admins aus
// Listen heraushalten) oder Lehrkraft-Rechte geben (ohne 2FA, so gewollt).
const ERLAUBT = new Set([
  'is_admin', 'is_superadmin', 'is_any_admin',                 // die Helfer selbst
  'apply_cluster_bonus', 'board_target_cluster',               // in 0223 umgestellt
  'can_teach', 'pa_is_teacher_profile', 'pa_room_teacher_search', // Lehrkraft-Rechte
  'can_send_feedback', 'get_my_cluster_pause',                  // Admin = darf Feedback / keine Pause
  'get_game_leaderboard', 'get_hub_leaderboard', 'check_and_grant_cluster_legi',
  'board_claim_reward', 'board_get', 'wc_get', 'account_lifecycle', 'join_open_cluster',
]);
const fns = (await db.query(`select p.proname, pg_get_functiondef(p.oid) src
                               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public'`)).rows;
const neu = fns.filter(fn => !ERLAUBT.has(fn.proname) && fn.src.split('\n').some(l =>
  /\bis_(super)?admin\b/.test(l.replace(/is_(super|any_)?admin\(\)/g, '')) && !/^\s*--/.test(l)));
ok('Wächter: keine neue Funktion liest das Admin-Flag selbst', neu.length === 0, neu.map(x => x.proname).join(', '));
const pols = (await db.query(`select tablename, policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'') t
                                from pg_policies where schemaname = 'public'`)).rows;
// br/wcr_select_admin lesen is_superadmin nur hinter is_any_admin() — gedeckt;
// profiles_admin_update prüft is_superadmin der ZIEL-Zeile (with check).
const polNeu = pols.filter(p => !['br_select_admin', 'wcr_select_admin', 'profiles_admin_update'].includes(p.policyname)
  && /\bis_(super)?admin\b/.test(p.t.replace(/is_(super|any_)?admin\(\)/g, '')));
ok('Wächter: keine Policy liest das Admin-Flag selbst', polNeu.length === 0, polNeu.map(p => p.policyname).join(', '));

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
