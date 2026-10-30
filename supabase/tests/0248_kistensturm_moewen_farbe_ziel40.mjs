/* Prüfstand für Migration 0248 — Kistensturm: 3 Möwen klauen immer 3, Kisten behalten ihre Farbe, Zielhöhe 40.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0248.

   Aufruf:  node supabase/tests/0248_kistensturm_moewen_farbe_ziel40.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
await db.exec(`
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;`);

let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); } catch (e) { if (f.startsWith('0087')) continue; console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const T = 'e0000000-0000-4000-8000-0000000000a1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status) values ($1, $2, 'lk', 'LK', 'active', 'approved')`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
let r = await call(`skill_room_create('derby', 'Bio', false, '{}'::jsonb)`);
const CODE = r.code, ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const S = (await call(`dd_stack_save(null, null, 'Zelle', '', '', '', '[{"t":"Kern","d":"Mitte"}]'::jsonb)`)).id;
for (let i = 0; i < 8; i++) await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, 'tok' + i, i + 1, 'K' + i]);

/* Helfer: Turm und Items direkt setzen, Antworten ohne 1,2-s-Sperre */
const boxes = (t, arr) => db.query(`select dd_storm_put($1, $2, $3::jsonb)`, [ROOM, t, JSON.stringify(arr)]);
const N = (t, n) => Array.from({ length: n }, () => ({ k: 'n', t }));
const give = (t, it) => db.query(`update dd_storm_teams set items = $3::jsonb where room_id = $1 and team = $2`, [ROOM, t, JSON.stringify([it])]);
const tokOf = async t => (await one(`select p.token from dd_storm_players pl join skill_participants p on p.id = pl.participant_id where pl.team = $1 order by p.seat limit 1`, [t])).token;
const team = async t => one(`select * from dd_storm_teams where room_id = $1 and team = $2`, [ROOM, t]);
const H = async t => Number((await team(t)).height);
const ans = async (t, okv) => { await db.exec(`update dd_storm_players set last_ok_at = null`); return call(`dd_storm_answer($1, $2, 0)`, [await tokOf(t), okv]); };
// seit 0247 darf nur der Halter des Items einsetzen (items_who), sonst die erste Person
const holderTok = async t => { const w = (await team(t)).items_who?.[0];
  return w ? (await one(`select token from skill_participants where id = $1`, [w])).token : tokOf(t); };
const use = async t => call(`dd_storm_use($1, 0, 0)`, [await holderTok(t)]);
const kinds = async t => (await team(t)).boxes.map(b => b.k).join('');

r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('0  neue Lobby: Zielhöhe 40, Items normal', r.goal === 40 && r.items_often === false, r.goal + ' ' + r.items_often);

async function game(teams) {
  await call(`dd_storm_room_reset($1)`, [CODE]);
  await call(`dd_storm_room_setup($1, $2, 60, 0, $3::jsonb)`, [CODE, teams, JSON.stringify([S])]);
  await call(`dd_storm_room_start($1)`, [CODE]);
  await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
  await call(`dd_storm_room_get($1, 0)`, [CODE]);
}
const lastUse = async () => (await one(`select data from dd_storm_events where room_id = $1 and kind = 'use' order by seq desc limit 1`, [ROOM])).data;

/* 1 3 Möwen mit 3 Teams: vom Letzten → 2 davor + einer doppelt */
await game(3);
await boxes(0, N(0, 6)); await boxes(1, N(1, 4)); await boxes(2, N(2, 1));
await give(2, 'moewe3'); r = await use(2);
let d = await lastUse();
ok('1  Letzter (3 Teams): immer 3 Kisten', await H(2) === 4 && d.g.length === 3, JSON.stringify(d.g?.map(x => x.t)));
ok('1  erst das nächste Team davor, dann das erste, dann wieder das nächste', JSON.stringify(d.g.map(x => x.t)) === '[1,0,1]' && await H(1) === 2 && await H(0) === 5);
ok('1  geklaute Kisten behalten ihre Farbe', (await team(2)).boxes.slice(1).map(b => b.t).join() === '1,0,1');

/* 2 Zweiter: einer davor → dreimal von dort */
await boxes(0, N(0, 6)); await boxes(1, N(1, 4)); await boxes(2, N(2, 1));
await give(1, 'moewe3'); await use(1);
d = await lastUse();
ok('2  Zweiter: dreimal vom Ersten', JSON.stringify(d.g.map(x => x.t)) === '[0,0,0]' && await H(0) === 3 && await H(1) === 7);

/* 3 davor nur Steine → von hinten */
await boxes(0, Array.from({ length: 6 }, () => ({ k: 's', t: 0 }))); await boxes(1, N(1, 4)); await boxes(2, N(2, 3));
await give(1, 'moewe3'); await use(1);
d = await lastUse();
ok('3  Erster hat nur Steine → dreimal von dahinter', JSON.stringify(d.g.map(x => x.t)) === '[2,2,2]' && await H(2) === 0 && await H(1) === 7 && await H(0) === 6, JSON.stringify(d.g.map(x => x.t)));

/* 4 Erster setzt Möwe ein → von dahinter */
await boxes(0, N(0, 6)); await boxes(1, N(1, 4)); await boxes(2, N(2, 1));
await give(0, 'moewe'); await use(0);
d = await lastUse();
ok('4  Möwe vom Ersten: eine Kiste vom Team direkt dahinter', JSON.stringify(d.g.map(x => x.t)) === '[1]' && await H(0) === 7);

/* 5 nichts zu holen → weniger, kein Fehler */
await boxes(0, N(0, 2)); await boxes(1, []); await boxes(2, []);
await give(2, 'moewe3'); r = await use(2);
ok('5  nur 2 Kisten da: 2 geklaut, kein Fehler', r.result === 'ok' && await H(2) === 2 && await H(0) === 0);

/* 6 Kuddelmuddel: Farben bleiben */
await boxes(0, N(1, 6)); await boxes(1, N(2, 3)); await boxes(2, N(0, 1));
const before = (await one(`select string_agg(e->>'t', '' order by e->>'t') s from dd_storm_teams t, jsonb_array_elements(t.boxes) e where room_id = $1`, [ROOM])).s;
await give(2, 'kuddel'); await use(2);
const after = (await one(`select string_agg(e->>'t', '' order by e->>'t') s from dd_storm_teams t, jsonb_array_elements(t.boxes) e where room_id = $1`, [ROOM])).s;
ok('6  Kuddelmuddel: jede Kiste behält ihre Farbe', before === after && before === '0111111222', before + ' → ' + after);

let twice = true;
try { await db.exec(mig('0248_kistensturm_moewen_farbe_ziel40.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('7  0248 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
