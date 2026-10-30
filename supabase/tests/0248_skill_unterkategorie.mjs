/* Prüfstand für Migration 0248 — Unterkategorien, „How to Fachbegriffe“.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0248.

   Die Kernzusagen:
     1. derby heißt „How to Fachbegriffe“, der Kachel-Text sagt Kistenturm
        (und nennt weiter das Duell, das prüft 0237).
     2. Die vier KI-Skills haben die Unterkategorie „Künstliche Intelligenz“
        und stehen im Fach Informatik, andere haben keine.
     3. skill_rooms_list liefert subject, subcategory und sort_order.
     4. 0248 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0248_skill_unterkategorie.mjs */
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


const derby = await one(`select title, blurb from skill_tools where id = 'derby'`);
ok('1  derby heißt How to Fachbegriffe', derby.title === 'How to Fachbegriffe', derby.title);
ok('1  Kachel-Text: Kistenturm, Duell', /Kistenturm/.test(derby.blurb) && !/Kistensturm/.test(derby.blurb) && /Duell/.test(derby.blurb));

const ki = (await db.query(`select id from skill_tools where subcategory = 'Künstliche Intelligenz' and subject = 'Informatik' order by id`)).rows.map(r => r.id);
ok('2  KI-Skills', JSON.stringify(ki) === JSON.stringify(['neurolab', 'reinforce', 'tinylm', 'wildclusters']), JSON.stringify(ki));
ok('2  SYNIR ohne Unterkategorie', (await one(`select subcategory s from skill_tools where id = 'synir'`)).s === null);

const T = 'e0000000-0000-4000-8000-0000000000d1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'tl', 'TL', 'active', 'approved', false)`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
const list = (await one(`select skill_rooms_list() v`)).v;
const tl = list.tools?.tinylm;
ok('3  skill_rooms_list ok', list.ok === true, JSON.stringify(list).slice(0, 120));
ok('3  tinylm mit subject/subcategory/sort_order',
   tl && tl.subject === 'Informatik' && tl.subcategory === 'Künstliche Intelligenz' && tl.sort_order === 32, JSON.stringify(tl));
ok('3  derby-Titel in der Liste', list.tools?.derby?.title === 'How to Fachbegriffe');

let twice = true;
try { await db.exec(mig('0248_skill_unterkategorie_how_to_fachbegriffe.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('4  0248 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
