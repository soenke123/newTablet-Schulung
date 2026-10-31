/* Prüfstand für Migration 0242 — Reinforce Yourself als MPSkill.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0242.

   Die Kernzusagen:
     1. Der Skill steht in skill_tools (Ordner, Fach, aktiv, nicht admin_only).
     2. Eine Lehrkraft ohne Adminrechte legt einen Raum an und teilt
        Phasen über skill_room_set_state (data.parts), ohne eigene Tabellen.
     3. 0242 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0242_reinforce_yourself.mjs */
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

const tool = async () => one(`select title, folder, subject, active, admin_only, multi_room from skill_tools where id = 'reinforce'`);

/* 1 */
const t1 = await tool();
ok('1  reinforce steht in skill_tools', !!t1, JSON.stringify(t1));
ok('1  Ordner, Fach, aktiv, für alle', t1 && t1.folder === 'ReinforceYourself' && t1.subject === 'Informatik'
   && t1.active === true && t1.admin_only === false && t1.multi_room === true);

/* 2 — Lehrkraft ohne Adminrechte */
const T = 'e0000000-0000-4000-8000-0000000000e1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'ry', 'RY', 'active', 'approved', false)`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
let r;
try { r = (await one(`select skill_room_create('reinforce', 'Info 9', false, '{}'::jsonb) v`)).v; }
catch (e) { r = { ok: false, error: e.message }; }
ok('2  Lehrkraft legt einen Raum an', r && r.ok === true, JSON.stringify(r));
const code = r && (r.code || (r.room && r.room.code));
let s;
try { s = (await one(`select skill_room_set_state($1, null, '{"parts":["train","envA"]}'::jsonb) v`, [code])).v; }
catch (e) { s = { ok: false, error: e.message }; }
ok('2  Training und Umgebung A geteilt', s && s.ok === true, JSON.stringify(s));
const st = await one(`select s.data from skill_room_state s join skill_rooms r on r.id = s.room_id where r.code = $1`, [code]);
ok('2  data.parts liegt im Raum', st && JSON.stringify(st.data.parts) === '["train","envA"]', JSON.stringify(st));

/* 3 */
let twice = true;
try { await db.exec(mig('0242_reinforce_yourself.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('3  0242 läuft ein zweites Mal durch', twice && !!(await tool()));

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
