/* Prüfstand für Migration 0220 — SQL Studio, nur für Admins.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0220.

   Die Kernzusagen:
     1. Der Skill steht in skill_tools, admin_only = true.
     2. Lesen (Policy): Lehrkraft und Gast sehen ihn nicht, Admins schon;
        andere Skills sieht die Lehrkraft weiter.
     3. Raum anlegen: Lehrkraft wird abgewiesen, Admin bekommt einen Raum.
     4. Andere Skills: die Lehrkraft legt weiter Räume an.
     5. Migration läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0220_sqlstudio.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;  -- 0223: Admins nur mit 2FA
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


const T1 = 'e0000000-0000-4000-8000-0000000000b1';  // Lehrkraft
const AD = 'e0000000-0000-4000-8000-0000000000b2';  // Admin
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, AD]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status)
                values ($1, $3, 't1', 'T1', 'active', 'approved'),
                       ($2, $3, 'ad', 'AD', 'active', 'none')`, [T1, AD, SCHOOL]);
await db.query(`update profiles set is_admin = true where id = $1`, [AD]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };

/* 1 */
const row = await one(`select title, folder, active, admin_only from skill_tools where id = 'sqlstudio'`);
ok('1  sqlstudio steht in skill_tools', row && row.folder === 'SQLStudio' && row.active === true, JSON.stringify(row));
ok('1  admin_only = true', row && row.admin_only === true);

/* 2 — Policy, als Rolle authenticated mit RLS */
await db.exec(`grant usage on schema public to authenticated, anon`);
const visible = async (u, role) => {
  await as(u);
  await db.exec(`set role ${role}`);
  try { return (await db.query(`select id from skill_tools`)).rows.map(r => r.id); }
  finally { await db.exec(`reset role`); }
};
let ids = await visible(T1, 'authenticated');
ok('2  Lehrkraft sieht sqlstudio nicht', !ids.includes('sqlstudio'), ids.join(','));
ok('2  Lehrkraft sieht andere Skills weiter', ids.includes('tinylm'));
ids = await visible(null, 'anon');
ok('2  Gast sieht sqlstudio nicht', !ids.includes('sqlstudio'));
ids = await visible(AD, 'authenticated');
ok('2  Admin sieht sqlstudio', ids.includes('sqlstudio'));

/* 3 — Raum anlegen */
await as(T1);
let err = null;
try { await one(`select skill_room_create('sqlstudio', 'Test', false, '{}'::jsonb) v`); } catch (e) { err = e.message; }
ok('3  Lehrkraft: Raum wird abgewiesen', err && err.includes('tool_admin_only'), err || 'kein Fehler');
await as(AD);
let r = (await one(`select skill_room_create('sqlstudio', 'Test', false, '{}'::jsonb) v`)).v;
ok('3  Admin bekommt einen Raum', r.ok === true && r.code, JSON.stringify(r).slice(0, 160));

/* 4 — andere Skills unberührt */
await as(T1);
r = (await one(`select skill_room_create('tinylm', 'Test', false, '{}'::jsonb) v`)).v;
ok('4  Lehrkraft legt weiter Tiny-LM-Räume an', r.ok === true, JSON.stringify(r).slice(0, 160));

/* 5 */
let twice = true;
try { await db.exec(mig('0220_sqlstudio.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('5  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
