/* Prüfstand für Migration 0287 — admin_user_rooms: in welchen Räumen ist ein Konto?
   Echt gerechnet in pglite auf der ganzen Kette.

     1. Ohne Admin-Recht: not_admin.
     2. Schüler im Raum einer Lehrkraft → Rolle member, mit Name im Raum und Lehrkraft.
     3. Konto ohne Raum (Troll-Verdacht) taucht nicht auf.
     4. Besitzerin → owner; eingeladene Lehrkraft → teacher.
     5. Verlassen/entfernt/abgelaufen stehen als Merker drin.
     6. Schuladmin sieht nur die eigene Schule, auch mit fremdem p_school.
     7. Volladmin: null = alle, Schule = nur diese.
     8. Kein Token in der Antwort.
     9. 0287 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0287_admin_user_rooms.mjs */
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
const id = n => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TL = id(1), TL2 = id(2), ST = id(3), TROLL = id(4), SA = id(5), VA = id(6), ST2 = id(7), TL_B = id(8);
await db.query(`insert into auth.users (id) select unnest($1::uuid[])`, [[TL, TL2, ST, TROLL, SA, VA, ST2, TL_B]]);
const prof = (u, s, acc, extra = {}) => db.query(
  `insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin, is_superadmin)
   values ($1, $2, $3, $3, 'active', $4, $5, $6)`,
  [u, s, acc, extra.teacher ? 'approved' : 'none', !!extra.admin, !!extra.super]);
await prof(TL, S1, 'lehrerin', { teacher: true });
await prof(TL2, S1, 'kollege', { teacher: true });
await prof(ST, S1, 'mia');
await prof(TROLL, S1, 'troll');
await prof(SA, S1, 'schuladmin', { admin: true });
await prof(VA, S1, 'volladmin', { admin: true, super: true });
await prof(ST2, S2, 'ben');
await prof(TL_B, S2, 'lehrerb', { teacher: true });

const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

await as(TL);
const R1 = (await call(`skill_room_create('knowledgestack', 'Quiz 7a', true, '{}'::jsonb)`)).code;
const R2 = (await call(`skill_room_create('wordcloud', 'Alte Wolke', true, '{}'::jsonb)`)).code;
await as(TL_B);
const RB = (await call(`skill_room_create('wordcloud', 'Wolke B', true, '{}'::jsonb)`)).code;
const rid = async c => (await one(`select id from skill_rooms where code = $1`, [c])).id;

let seat = 0;
const join = (room, u, name) => db.query(
  `insert into skill_participants (room_id, token, seat, name, user_id) values ($1, $2, $3, $4, $5)`,
  [room, 'tok' + (++seat), seat, name, u]);
await join(await rid(R1), ST, 'Mia K.');
await join(await rid(R2), ST, 'Mia');
await join(await rid(RB), ST2, 'Ben');
await db.query(`update skill_participants set left_at = now() where user_id = $1 and room_id = $2`, [ST, await rid(R2)]);
await db.query(`update skill_rooms set expires_at = now() - interval '1 day' where code = $1`, [R2]);
await db.query(`insert into skill_room_teachers (room_id, user_id, added_by) values ($1, $2, $3)`, [await rid(R1), TL2, TL]);

/* 1 */
await as(ST);
let r = await call(`admin_user_rooms()`);
ok('1  Schüler: not_admin', r.ok === false && r.error === 'not_admin', JSON.stringify(r));
await as(TL);
r = await call(`admin_user_rooms()`);
ok('1  Lehrkraft: not_admin', r.ok === false && r.error === 'not_admin');

/* 2 */
await as(SA);
r = await call(`admin_user_rooms()`);
ok('2  Schuladmin: ok', r.ok === true, JSON.stringify(r).slice(0, 200));
const mia = r.users[ST] || [];
const q = mia.find(x => x.code === R1);
ok('2  Mia sitzt im Quiz als member', q && q.role === 'member' && q.name === 'Mia K.' && q.owner === 'lehrerin',
   JSON.stringify(q));
ok('2  Werkzeug-Titel dabei', q && q.tool_id === 'knowledgestack' && !!q.tool_title);

/* 3 */
ok('3  Troll ohne Raum fehlt', !(TROLL in r.users));

/* 4 */
ok('4  Besitzerin: owner (2 Räume)', (r.users[TL] || []).filter(x => x.role === 'owner').length === 2);
ok('4  Kollege eingeladen: teacher', (r.users[TL2] || []).some(x => x.code === R1 && x.role === 'teacher'));

/* 5 */
const alt = mia.find(x => x.code === R2);
ok('5  verlassen + abgelaufen markiert', alt && alt.left === true && alt.expired === true, JSON.stringify(alt));
ok('5  laufender Raum zuerst', mia[0]?.code === R1);
await db.query(`update skill_participants set removed_at = now() where user_id = $1 and room_id = $2`, [ST, await rid(R1)]);
r = await call(`admin_user_rooms()`);
ok('5  entfernt markiert', r.users[ST].find(x => x.code === R1)?.removed === true);

/* 6 */
ok('6  Schuladmin: keine fremde Schule', !(ST2 in r.users) && !(TL_B in r.users));
r = await call(`admin_user_rooms($1)`, [S2]);
ok('6  Schuladmin mit fremdem p_school bleibt bei der eigenen', !(ST2 in r.users) && (ST in r.users));

/* 7 */
await as(VA);
r = await call(`admin_user_rooms()`);
ok('7  Volladmin null = alle', (ST in r.users) && (ST2 in r.users));
r = await call(`admin_user_rooms($1)`, [S2]);
ok('7  Volladmin Schule B = nur B', (ST2 in r.users) && !(ST in r.users));

/* 8 */
ok('8  kein Token in der Antwort', !/tok\d/.test(JSON.stringify(await call(`admin_user_rooms()`))));

/* 9 */
await db.exec(mig('0287_admin_user_rooms.sql'));
ok('9  läuft zweimal', (await call(`admin_user_rooms()`)).ok === true);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
