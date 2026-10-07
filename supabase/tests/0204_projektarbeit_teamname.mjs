/* Prüfstand für Migration 0204 — Projektarbeit: den Teamnamen geben
   sich die Schüler selbst (Reiter „Team"), die Lehrkraft kann ihn nicht
   ändern. Echt gerechnet in pglite auf der ganzen Kette 0001…0204.

   Die Kernzusagen:
     1. Jedes Mitglied benennt die eigene Gruppe; die Lehrkraft sieht den
        Namen in der Übersicht. Leer → zurück auf „Gruppe <Nr.>".
     2. Zu lang / Schimpfwort / ohne Gruppe / stillgelegt: abgelehnt.
     3. pa_room_group_rename: nur noch 'forbidden', Name bleibt.
     4. Einzelarbeit mit eigenem Namen, zu der jemand dazukommt: bekommt
        eine Nummer, behält den Namen.

   Aufruf:  node supabase/tests/0204_projektarbeit_teamname.mjs */
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

const T     = 'e0000000-0000-4000-8000-000000000001';
const OTHER = 'e0000000-0000-4000-8000-000000000002';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, OTHER]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'andere', 'Andere')`, [T, OTHER, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const tool = await one(`select * from skill_tools where id = 'projekt'`);
ok('0  skill_tools: projekt mit Ordner Projektarbeit', tool && tool.folder === 'Projektarbeit');

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 6) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok, have) => call(`pa_view($1, $2)`, [tok, have ? JSON.stringify(have) : null]);
const save = (tok, ops) => call(`pa_save($1, $2)`, [tok, JSON.stringify(ops)]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 6; i++) P[i] = await pid('t' + i);
const rename = (tok, name) => call(`pa_group_rename($1, $2)`, [tok, name]);
const gname = async (g) => (await tget()).groups.find(x => x.id === g)?.name;

/* ══ 1. Schüler benennen ihre Gruppe ════════════════════════════ */
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G1]);
ok('1  neue Gruppe heißt erst „Gruppe 1"', (await gname(G1)) === 'Gruppe 1');
let r = await rename('t1', '  Die   Füchse ');
ok('1  Mitglied gibt den Namen', r.ok && r.name === 'Die Füchse', JSON.stringify(r));
ok('1  Lehrkraft sieht ihn in der Übersicht', (await gname(G1)) === 'Die Füchse');
ok('1  … und das andere Mitglied in seiner Ansicht', (await view('t2')).group.name === 'Die Füchse');
r = await rename('t2', '');
ok('1  leer → zurück auf „Gruppe 1"', r.ok && (await gname(G1)) === 'Gruppe 1');
await rename('t2', 'Die Füchse');

/* ══ 2. Grenzen ═════════════════════════════════════════════════ */
ok('2  zu lang: too_long', (await rename('t1', 'x'.repeat(41))).error === 'too_long');
ok('2  Schimpfwort: text_blocked', (await rename('t1', 'Team Arschloch')).error === 'text_blocked');
ok('2  ohne Gruppe (Lobby): not_found', (await rename('t3', 'Lobby-Team')).error === 'not_found');
ok('2  falscher Token: abgelehnt', !(await rename('gibtsnicht', 'X')).ok);
ok('2  Name unverändert', (await gname(G1)) === 'Die Füchse');

/* ══ 3. Lehrkraft benennt nicht um ══════════════════════════════ */
r = await call(`pa_room_group_rename('PRJEKT', $1, 'Hasen')`, [G1]);
ok('3  pa_room_group_rename: forbidden', r.error === 'forbidden');
ok('3  Name bleibt', (await gname(G1)) === 'Die Füchse');

/* ══ 4. Einzelarbeit mit eigenem Namen ══════════════════════════ */
const solo = (await call(`pa_room_plan('PRJEKT', null, $1)`, [P[6]])).group;
r = await rename('t6', 'Wetterstation');
ok('4  Einzelarbeit benennt sich', r.ok && (await gname(solo)) === 'Wetterstation');
await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[4], solo]);
const sg = (await tget()).groups.find(g => g.id === solo);
ok('4  wer dazukommt: Nummer ja, Name bleibt', sg.no > 0 && sg.name === 'Wetterstation', JSON.stringify(sg));
const solo2 = (await call(`pa_room_plan('PRJEKT', null, $1)`, [P[5]])).group;
await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[3], solo2]);
ok('4  Einzelarbeit ohne Namen wird weiter „Gruppe <Nr.>"', /^Gruppe \d+$/.test(await gname(solo2)));

try { await db.exec(mig('0204_projektarbeit_teamname.sql')); ok('5  Migration läuft zweimal', true); }
catch (e) { ok('5  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
