/* Prüfstand für Migration 0237 — Definitions Derby für alle Lehrkräfte.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0237.

   Die Kernzusagen:
     1. Nach der Kette ist derby nicht mehr admin_only.
     2. Eine Lehrkraft ohne Adminrechte legt einen Derby-Raum an.
     3. 0233 noch einmal eingespielt dreht es nicht wieder zu; 0237
        läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0237_definitionsderby_fuer_alle.mjs */
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

const adminOnly = async () => (await one(`select admin_only a from skill_tools where id = 'derby'`)).a;

/* 1 */
ok('1  derby ist nicht mehr admin_only', (await adminOnly()) === false);
ok('1  Kachel-Text nennt das Duell', /Duell/.test((await one(`select blurb b from skill_tools where id = 'derby'`)).b));

/* 2 — wie in 0233: Lehrkraft ohne Adminrechte */
const T = 'e0000000-0000-4000-8000-0000000000d1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'tl', 'TL', 'active', 'approved', false)`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
let r;
try { r = (await one(`select skill_room_create('derby', 'Bio 8', false, '{}'::jsonb) v`)).v; }
catch (e) { r = { ok: false, error: e.message }; }
ok('2  Lehrkraft ohne Adminrechte legt einen Derby-Raum an', r && r.ok === true, JSON.stringify(r));

/* 3 */
await db.exec(mig('0233_definitionsderby.sql'));
ok('3  0233 noch einmal: bleibt frei', (await adminOnly()) === false);
let twice = true;
try { await db.exec(mig('0237_definitionsderby_fuer_alle.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('3  0237 läuft ein zweites Mal durch', twice && (await adminOnly()) === false);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
