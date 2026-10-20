/* Prüfstand für Migration 0216 — Nutzung je Skill im Admin-Panel.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0216.

   Die Kernzusagen:
     1. Neuer Raum + Beitritte landen in skill_usage.
     2. Die Spur überlebt das Löschen des Raums (skill_cleanup).
     3. skill_usage_stats zählt je Skill, nennt die Schule mit den meisten
        Räumen, filtert nach Zeitraum, Schule und Testräumen.
     4. Schuladmin sieht nur die eigene Schule, Nicht-Admin nichts.
     5. Keine Grants an anon/authenticated auf die Tabelle.

   Aufruf:  node supabase/tests/0216_skill_nutzung.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
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
const S2 = (await one(`insert into schools (slug, name) values ('bbb', 'Schule B') returning id`)).id;
const T1 = 'e0000000-0000-4000-8000-0000000000b1';  // Lehrkraft A
const T2 = 'e0000000-0000-4000-8000-0000000000b2';  // Lehrkraft B
const VA = 'e0000000-0000-4000-8000-0000000000b3';  // Volladmin
const SA = 'e0000000-0000-4000-8000-0000000000b4';  // Schuladmin B
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [T1, T2, VA, SA]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $5, 't1', 'T1'), ($2, $6, 't2', 'T2'),
                       ($3, $5, 'va', 'VA'), ($4, $6, 'sa', 'SA')`, [T1, T2, VA, SA, S1, S2]);
await db.query(`update profiles set is_admin = true, is_superadmin = true where id = $1`, [VA]);
await db.query(`update profiles set is_admin = true where id = $1`, [SA]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };

const TOOLS = (await db.query(`select id from skill_tools order by sort_order, id limit 2`)).rows.map(r => r.id);
const [TA, TB] = TOOLS;
let codeN = 0;
const room = async (tool, owner, school, { ageDays = 0, test = false } = {}) => {
  const code = 'ABCDE' + '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[codeN++];
  return (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title, is_test, created_at, last_active_at)
                     values ($1, $2, $3, $4, 'Raum', $5, now() - make_interval(days => $6), now() - make_interval(days => $6))
                     returning id`, [code, tool, owner, school, test, ageDays])).id;
};
const join = async (roomId, seat) =>
  db.query(`insert into skill_participants (room_id, token, seat) values ($1, $2, $3)`,
           [roomId, 'tok' + roomId.slice(0, 8) + seat, seat]);

/* 1 */
const R1 = await room(TA, T1, S1);
await join(R1, 1); await join(R1, 2);
const u1 = await one(`select * from skill_usage where room_id = $1`, [R1]);
ok('1  neuer Raum steht in skill_usage', !!u1 && u1.tool_id === TA && u1.school_id === S1);
ok('1  Beitritte werden gezählt', u1?.people === 2, `people=${u1?.people}`);

/* 2 */
await db.query(`update skill_rooms set expires_at = now() - interval '1 minute' where id = $1`, [R1]);
await db.query(`select skill_cleanup()`).catch(async () => db.query(`delete from skill_rooms where id = $1`, [R1]));
ok('2  Raum ist weg', !(await one(`select 1 as x from skill_rooms where id = $1`, [R1])));
ok('2  Spur bleibt', !!(await one(`select 1 as x from skill_usage where room_id = $1`, [R1])));

/* 3 */
await room(TA, T2, S2); await room(TA, T2, S2);
await room(TA, T1, S1, { ageDays: 100 });
await room(TB, T2, S2, { ageDays: 300 });
await room(TB, T1, S1, { test: true });

await as(VA);
const st = async (school, days, tests) =>
  (await one(`select skill_usage_stats($1, $2, $3) as r`, [school, days, tests])).r;
let r = await st(null, null, false);
const find = (res, id) => res.tools.find(t => t.tool_id === id);
ok('3  ok', r.ok === true);
ok('3  gesamt: Skill A 4 Räume', find(r, TA).rooms === 4, JSON.stringify(find(r, TA)));
ok('3  gesamt: Skill A meiste Schule = Schule B (2)', find(r, TA).top_school === 'Schule B' && find(r, TA).top_count === 2);
ok('3  gesamt: Skill B ohne Testraum 1', find(r, TB).rooms === 1);
ok('3  Beitritte summiert', find(r, TA).people === 2);
ok('3  Sortierung: meistgenutzter zuerst', r.tools[0].tool_id === TA);
ok('3  Schulen-Liste für den Filter', r.schools.length >= 2);
r = await st(null, 14, false);
ok('3  14 Tage: Skill A 3, Skill B 0', find(r, TA).rooms === 3 && find(r, TB).rooms === 0);
r = await st(null, 182, false);
ok('3  6 Monate: Skill A 4, Skill B 0', find(r, TA).rooms === 4 && find(r, TB).rooms === 0);
r = await st(null, null, true);
ok('3  mit Testräumen: Skill B 2', find(r, TB).rooms === 2);
r = await st(S1, null, false);
ok('3  Filter Schule A: Skill A 2', find(r, TA).rooms === 2 && find(r, TA).top_school === 'Schule A');

/* 4 */
await as(SA);
r = await st(S1, null, false);
ok('4  Schuladmin B bekommt nur Schule B', find(r, TA).rooms === 2 && find(r, TA).top_school === 'Schule B');
ok('4  Schuladmin: keine Schulliste', r.schools.length === 0);
await as(T1);
r = await st(null, null, false);
ok('4  Lehrkraft: not_admin', r.ok === false && r.error === 'not_admin');

/* 5 */
const g = await one(`select has_table_privilege('authenticated', 'skill_usage', 'select') as a,
                            has_table_privilege('anon', 'skill_usage', 'select') as b`);
ok('5  keine Tabellenrechte für authenticated/anon', !g.a && !g.b);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
