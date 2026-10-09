/* Prüfstand für Migration 0207 — Knowledge Stack: 40 statt 36 Wesen.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0207.

   Die Kernzusagen:
     1. ks_join nimmt die neuen Wesen 36…39 an und speichert sie so.
     2. Darüber wird weiter geklemmt (99 → 39, -3 → 0).
     3. Die Prüfregel an ks_players lässt 39 zu, 40 nicht.
     4. Die Migration läuft zweimal (die Prüfregel steht danach einmal).

   Aufruf:  node supabase/tests/0207_knowledgestack_40_wesen.mjs */
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

const T = 'e0000000-0000-4000-8000-000000000001';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status)
                values ($1, $2, 'lk', 'Frau L', 'approved')`, [T, SCHOOL]);
const ROOM = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                         values ('KSWSXX', 'knowledgestack', $1, $2, 'Quiz') returning id`, [T, SCHOOL])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tok1', 1, 'Mia')`, [ROOM]);

const join = async (cid, skin = 0) =>
  (await one(`select ks_join('tok1', null, $1::smallint, $2::smallint) v`, [cid, skin])).v;
const wesen = async () => (await one(`select creature_id, skin_idx from ks_players where participant_id =
  (select id from skill_participants where token = 'tok1')`));

/* ══ 1. Die neuen Wesen ══════════════════════════════════════════ */
for (const cid of [36, 37, 38, 39]) {
  const r = await join(cid, 2);
  const w = await wesen();
  ok(`1  Wesen ${cid} wird gespeichert`, r.ok === true && w.creature_id === cid && w.skin_idx === 2, JSON.stringify([r, w]));
}
ok('1  die alten bleiben wählbar (35)', (await join(35)).ok === true && (await wesen()).creature_id === 35);

/* ══ 2. Klemmen ══════════════════════════════════════════════════ */
await join(99);
ok('2  99 → 39', (await wesen()).creature_id === 39);
await join(-3);
ok('2  -3 → 0', (await wesen()).creature_id === 0);

/* ══ 3. Prüfregel ════════════════════════════════════════════════ */
const pid = (await one(`select id from skill_participants where token = 'tok1'`)).id;
let fehler = null;
try { await db.query(`update ks_players set creature_id = 39 where participant_id = $1`, [pid]); }
catch (e) { fehler = e.message; }
ok('3  39 geht direkt in die Tabelle', fehler === null, fehler || '');
fehler = null;
try { await db.query(`update ks_players set creature_id = 40 where participant_id = $1`, [pid]); }
catch (e) { fehler = e.message; }
ok('3  40 nicht', fehler !== null && /creature_id_check/.test(fehler), fehler || '');

/* ══ 4. Zweimal ══════════════════════════════════════════════════ */
let zweimal = null;
try { await db.exec(mig('0207_knowledgestack_40_wesen.sql')); } catch (e) { zweimal = e.message; }
ok('4  0207 läuft zweimal', zweimal === null, zweimal || '');
const regeln = (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint
  where conrelid = 'public.ks_players'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%creature_id%'`)).rows;
ok('4  … und es gibt genau eine Prüfregel für creature_id', regeln.length === 1, JSON.stringify(regeln));
ok('4  … sie lautet 0…39', regeln.length === 1 && /creature_id >= 0\) AND \(creature_id <= 39/.test(regeln[0].d), regeln[0] && regeln[0].d);

console.log(fails ? `\n${fails} FEHLER.` : '\nAlles gut.');
process.exit(fails ? 1 : 0);
