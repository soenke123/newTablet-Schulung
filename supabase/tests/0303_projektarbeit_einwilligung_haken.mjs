/* Prüfstand für Migration 0303 — Projektarbeit: Einwilligung als drei
   Haken (1 zu zweit · 2 zu dritt · 4 allein nach Hause).

   Die Kernzusagen:
     1. Werte aus 0302 werden umgerechnet: 1 (zu dritt) → 2,
        2 (zu zweit) → 1, 3 (allein) → 4, 0 bleibt 0.
     2. Ein zweiter Lauf von 0303 rechnet nichts doppelt um.
     3. pa_room_consent nimmt 0–7, 8 ist invalid_input.

   Aufruf:  node supabase/tests/0303_projektarbeit_einwilligung_haken.mjs */
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
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
const VOR = FILES.filter(f => f < '0303'), AB = FILES.filter(f => f >= '0303');
for (const f of VOR) {
  try { await db.exec(mig(f)); }
  catch (e) { if (BEKANNT.has(f.slice(0, 4))) continue; console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
}
console.log(`— 0001 … ${VOR.at(-1).slice(0, 4)} laufen durch —\n`);

const T = 'e0000000-0000-4000-8000-000000000001';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status)
                values ($1, $2, 'lk', 'Frau LK', 'approved')`, [T, SCHOOL]);
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 4) g`);
const P = {};
for (let i = 1; i <= 4; i++) P[i] = (await one(`select id from skill_participants where token = $1`, ['t' + i])).id;
await db.query('insert into _who values ($1)', [T]);
// Stand nach 0302: Kind 1 keine, 2 zu dritt, 3 zu zweit, 4 allein
for (const [i, n] of [[1, 0], [2, 1], [3, 2], [4, 3]]) await call(`pa_room_consent('PRJEKT', $1, $2)`, [P[i], n]);
const vals = async () => Promise.all([1, 2, 3, 4].map(async i =>
  (await one(`select consent from pa_seats where participant_id = $1`, [P[i]])).consent));

for (const f of AB) await db.exec(mig(f));
ok('1  umgerechnet: keine 0 · zu dritt 2 · zu zweit 1 · allein 4', JSON.stringify(await vals()) === '[0,2,1,4]', JSON.stringify(await vals()));
await db.exec(mig('0303_projektarbeit_einwilligung_haken.sql'));
ok('2  zweiter Lauf ändert nichts', JSON.stringify(await vals()) === '[0,2,1,4]', JSON.stringify(await vals()));
ok('3  6 = zu dritt + allein nach Hause, 7 = alle drei', (await call(`pa_room_consent('PRJEKT', $1, 6)`, [P[1]])).ok
   && (await call(`pa_room_consent('PRJEKT', $1, 7)`, [P[2]])).ok);
ok('3  8 → invalid_input', (await call(`pa_room_consent('PRJEKT', $1, 8)`, [P[1]])).error === 'invalid_input');
ok('3  6 bleibt stehen', (await vals())[0] === 6);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
