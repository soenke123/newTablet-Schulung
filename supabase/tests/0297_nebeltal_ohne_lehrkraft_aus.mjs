/* Prüfstand für Migration 0297 — Nebeltal: gemeinsam spielen endet ohne Lehrkraft.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0297.

     1. Lehrkraft fragt regelmäßig ab → Lobby bleibt, off_at = null.
     2. Lobby ohne Lehrkraft: off_at = letztes Lebenszeichen + 3 Min.; danach aus (data.mp = 0).
     3. Laufende Runde: geht nie von selbst aus, läuft bis zum Ende (Level 3: ohne Lehrkraft
        zählen nur anwesende Tablets); Rangliste danach 1 Min., dann aus.
     4. Neu „an“ nach dem Aus klappt sofort.
     5. Nur die Raum-Besitzerin zählt: eine andere Lehrkraft hält den Raum nicht offen.
     6. 0297 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0297_nebeltal_ohne_lehrkraft_aus.mjs */
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

const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
const A = 'e0000000-0000-4000-8000-0000000297a1', B = 'e0000000-0000-4000-8000-0000000297b1';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 'nt_ad7', 'Admin', 'active', 'approved', true),
                       ($2, $3, 'nt_lk7', 'Andere', 'active', 'approved', true)`, [A, B, SCHOOL]);
const as = async who => { await db.query(`delete from _who`); if (who) await db.query(`insert into _who values ($1)`, [who]); };

await as(A);
const room = (await one(`select skill_room_create('nebeltal', 'Info 10', false, '{}'::jsonb) v`)).v;
ok('0  Raum angelegt', room && room.ok, JSON.stringify(room));
const CODE = room.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;

const act = async (a, args = {}, who = A) => { await as(who); return (await one(`select nt_room_act($1, $2, $3::jsonb) v`, [CODE, a, JSON.stringify(args)])).v; };
const get = async () => { await as(A); return (await one(`select nt_room_get($1) v`, [CODE])).v; };
const play = async (tok, p = {}) => { await as(null); return (await one(`select nt_play($1, $2::jsonb) v`, [tok, JSON.stringify(p)])).v; };

const TOK = [];
for (let i = 1; i <= 3; i++) {
  TOK[i] = 'tok-nt7-' + i;
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, TOK[i], i, 'Kind ' + i]);
}
const age = async s => db.query(`update nt_rounds set teacher_seen_at = now() - make_interval(secs => $2) where room_id = $1`, [ROOM, s]);
const mpFlag = async () => (await one(`select data from skill_room_state where room_id = $1`, [ROOM])).data.mp;

const phaseOf = async () => (await one(`select phase from nt_rounds where room_id = $1`, [ROOM])).phase;
const sec = iso => (Date.parse(iso) - Date.now()) / 1000;

/* 1 */
let r = await act('on');
ok('1  an: Lobby', r.ok && r.phase === 'lobby');
for (let i = 1; i <= 3; i++) await play(TOK[i]);
await age(50); await get();
let v = await play(TOK[1]);
ok('1  Lehrkraft fragt ab → Lobby, off_at = null', v.phase === 'lobby' && v.off_at === null, v.phase + ' ' + v.off_at);

/* 2 */
await age(30);
v = await play(TOK[1]);
ok('2  Lobby 30 s ohne Lehrkraft: off_at in ~150 s', v.phase === 'lobby' && Math.abs(sec(v.off_at) - 150) < 5, v.off_at);
await age(170);
v = await play(TOK[1]);
ok('2  170 s: noch Lobby', v.phase === 'lobby', v.phase);
await age(181);
v = await play(TOK[2]);
ok('2  3 Min. ohne Lehrkraft: phase off', v.ok && v.phase === 'off', JSON.stringify(v).slice(0, 120));
ok('2  data.mp = 0', (await mpFlag()) === 0);

/* 4 */
r = await act('on');
ok('4  wieder an: Lobby, data.mp = 1', r.ok && r.phase === 'lobby' && (await mpFlag()) === 1);

/* 3 */
for (let i = 1; i <= 3; i++) await play(TOK[i]);
await act('level', { n: 3 });
await act('start');
r = await act('go');
await db.query(`update nt_rounds set countdown_ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
await age(600);
v = await play(TOK[1]);
ok('3  10 Min. ohne Lehrkraft: Runde läuft weiter, off_at = null', v.phase === 'running' && v.off_at === null, v.phase);
await play(TOK[1], { res: { s: 1 } });
await play(TOK[2], { res: { s: 2 } });
ok('3  Kind 3 noch nicht fertig: läuft', (await phaseOf()) === 'running');
await db.query(`update nt_players set seen_at = now() - interval '1 minute' where participant_id = (select id from skill_participants where token = $1)`, [TOK[3]]);
v = await play(TOK[1]);
ok('3  Kind 3 ausgefallen, ohne Lehrkraft: Runde endet', v.phase === 'ended', v.phase);
ok('3  Rangliste: off_at = Rundenende + 60 s', Math.abs(sec(v.off_at) - 60) < 5, v.off_at);
await db.query(`update nt_rounds set ended_at = now() - interval '55 seconds' where room_id = $1`, [ROOM]);
v = await play(TOK[1]);
ok('3  55 s nach Ende: Rangliste steht noch', v.phase === 'ended', v.phase);
await db.query(`update nt_rounds set ended_at = now() - interval '61 seconds' where room_id = $1`, [ROOM]);
v = await play(TOK[1]);
ok('3  1 Min. nach Ende: aus', v.phase === 'off' && (await mpFlag()) === 0, v.phase);

/* 3b mit Lehrkraft: ausgefallenes Gerät hält Level 3 offen (wie 0296) */
await act('on');
for (let i = 1; i <= 3; i++) await play(TOK[i]);
await act('start'); await act('go');
await db.query(`update nt_rounds set countdown_ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
await play(TOK[1], { res: { s: 1 } }); await play(TOK[2], { res: { s: 2 } });
await db.query(`update nt_players set seen_at = now() - interval '1 minute' where participant_id = (select id from skill_participants where token = $1)`, [TOK[3]]);
await get();
ok('3  mit Lehrkraft: ausgefallenes Gerät hält die Runde offen', (await phaseOf()) === 'running');
await act('stop'); await act('lobby');

/* 5 */
await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2) on conflict do nothing`, [ROOM, B]);
await age(200);
await as(B); await one(`select nt_room_get($1) v`, [CODE]);
v = await play(TOK[1]);
ok('5  andere Lehrkraft hält die Lobby nicht offen', v.phase === 'off', v.phase);

/* 6 */
try { await db.exec(mig('0297_nebeltal_ohne_lehrkraft_aus.sql')); ok('6  0297 läuft ein zweites Mal durch', true); }
catch (e) { ok('6  0297 läuft ein zweites Mal durch', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
