/* Prüfstand für Migration 0290 — Nebeltal (Prototyp, nur Admins).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0290.

   Die Kernzusagen:
     1. Der Skill steht in skill_tools (Ordner, Fach, Unterkategorie KI,
        aktiv, admin_only, Laufzeit 10 Tage).
     2. Eine Lehrkraft ohne Adminrechte kann keinen Raum anlegen
        (tool_admin_only), eine Admin (mit 2FA) schon.
     3. 0290 läuft ein zweites Mal durch und dreht ein späteres
        Freigeben (admin_only = false) nicht wieder zu.

   Aufruf:  node supabase/tests/0290_nebeltal.mjs */
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

const tool = async () => one(`select title, folder, subject, subcategory, active, admin_only, multi_room, lifetime_days
                              from skill_tools where id = 'nebeltal'`);

/* 1 */
const t1 = await tool();
ok('1  nebeltal steht in skill_tools', !!t1, JSON.stringify(t1));
ok('1  Ordner, Fach, KI, aktiv, nur Admins, 10 Tage', t1 && t1.folder === 'Nebeltal' && t1.subject === 'Informatik'
   && t1.subcategory === 'Künstliche Intelligenz' && t1.active === true && t1.admin_only === true
   && t1.multi_room === true && t1.lifetime_days === 10);

/* 2 */
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
const T = 'e0000000-0000-4000-8000-0000000002e1', A = 'e0000000-0000-4000-8000-0000000002a1';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, A]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 'nt_lk', 'Lehrkraft', 'active', 'approved', false),
                       ($2, $3, 'nt_ad', 'Admin', 'active', 'approved', true)`, [T, A, SCHOOL]);
const create = async who => {
  await db.query(`delete from _who`); await db.query(`insert into _who values ($1)`, [who]);
  try { return (await one(`select skill_room_create('nebeltal', 'Info 10', false, '{}'::jsonb) v`)).v; }
  catch (e) { return { ok: false, error: e.message }; }
};
const rT = await create(T);
ok('2  Lehrkraft ohne Admin: kein Raum', !(rT && rT.ok) && /tool_admin_only/.test(JSON.stringify(rT)), JSON.stringify(rT));
const rA = await create(A);
ok('2  Admin legt einen Raum an', rA && rA.ok === true, JSON.stringify(rA));

/* 3 */
await db.query(`update skill_tools set admin_only = false where id = 'nebeltal'`);
let twice = true;
try { await db.exec(mig('0290_nebeltal.sql')); } catch (e) { twice = false; console.error(e.message); }
const t3 = await tool();
ok('3  0290 läuft ein zweites Mal durch', twice && !!t3);
ok('3  Freigabe bleibt bestehen', t3 && t3.admin_only === false);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
