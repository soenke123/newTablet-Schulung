/* Prüfstand für Migration 0247 — Kistensturm: Item reihum, Gleichstand = mehrere Sieger.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0247.

   Aufruf:  node supabase/tests/0247_kistensturm_item_reihum_gleichstand.mjs */
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

await call(`dd_storm_room_setup($1, 4, 10, 0, $2::jsonb)`, [CODE, JSON.stringify([S])]);
await call(`dd_storm_room_start($1)`, [CODE]);
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
await call(`dd_storm_room_get($1, 0)`, [CODE]);
const members = async t => (await db.query(`select p.id, p.token from dd_storm_players pl join skill_participants p on p.id = pl.participant_id where pl.team = $1 order by p.seat`, [t])).rows;
const m0 = await members(0);
ok('0  Team 0 hat zwei Personen', m0.length === 2);

/* 1 Item reihum */
await give(0, 'bonus');
let w = (await team(0)).items_who;
ok('1  erstes Item: Halter = erste Person', w.length === 1 && w[0] === m0[0].id, JSON.stringify(w));
await db.exec(`update dd_storm_teams set items = items || '["maxi"]'::jsonb where team = 0`);
w = (await team(0)).items_who;
ok('1  zweites Item: Halter = zweite Person', w.length === 2 && w[1] === m0[1].id, JSON.stringify(w));
r = await call(`dd_storm_use($1, 0, 0)`, [m0[1].token]);
ok('1  andere Person darf Fach 0 nicht einsetzen', r.result === 'not_yours' && (await team(0)).items.length === 2);
ok('1  Ansicht schickt die Halter (iw)', JSON.stringify(r.teams[0].iw) === JSON.stringify(w));
r = await call(`dd_storm_use($1, 1, 0)`, [m0[1].token]);
ok('1  eigenes Fach einsetzen geht', r.result === 'ok' && r.used === 'maxi');
w = (await team(0)).items_who;
ok('1  Fach und Halter gehen zusammen raus', (await team(0)).items.length === 1 && w.length === 1 && w[0] === m0[0].id, JSON.stringify(w));
await db.exec(`update dd_storm_teams set items = items || '["bonus"]'::jsonb where team = 0`);
ok('1  drittes Item: wieder die erste Person (reihum)', (await team(0)).items_who[1] === m0[0].id);
await db.query(`update skill_participants set last_seen_at = now() - interval '5 minutes' where id = $1`, [m0[0].id]);
r = await call(`dd_storm_use($1, 0, 0)`, [m0[1].token]);
ok('1  Halter ist weg → jemand anderes darf', r.result === 'ok');
await db.query(`update skill_participants set last_seen_at = now() where id = $1`, [m0[0].id]);
await db.query(`update skill_participants set last_seen_at = now() - interval '5 minutes' where id = $1`, [m0[1].id]);
await db.exec(`update dd_storm_teams set items = '["bonus"]'::jsonb, items_who = '[]'::jsonb, item_turn = 1 where team = 0`);
ok('1  wer nicht da ist, wird übersprungen', (await team(0)).items_who[0] === m0[0].id);
await db.query(`update skill_participants set last_seen_at = now() where id = $1`, [m0[1].id]);
await db.exec(`update dd_storm_teams set items = '[]'::jsonb where team = 0`);
ok('1  leer → keine Halter', (await team(0)).items_who.length === 0);

/* 2 Gleichstand */
await boxes(0, N(0, 4)); await boxes(1, N(1, 4)); await boxes(2, N(2, 2)); await boxes(3, []);
await call(`dd_storm_room_stop($1)`, [CODE]);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('2  Gleichstand beim Beenden: beide gewinnen', JSON.stringify(r.winners) === '[0,1]' && r.winner_team === 0, JSON.stringify(r.winners));
await call(`dd_storm_room_reset($1)`, [CODE]);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('2  Nochmal: Siegerliste leer', r.winners === null && r.winner_team === null);
await call(`dd_storm_room_start($1)`, [CODE]);
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
await call(`dd_storm_room_get($1, 0)`, [CODE]);
await boxes(0, N(0, 3)); await boxes(1, N(1, 5)); await boxes(2, N(2, 5)); await boxes(3, N(3, 1));
await db.exec(`update dd_storm_boards set ends_at = now() - interval '1 second'`);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('2  Zeitende mit Gleichstand: Team 1 und 2', r.phase === 'ended' && JSON.stringify(r.winners) === '[1,2]', JSON.stringify(r.winners));
await call(`dd_storm_room_reset($1)`, [CODE]);
await call(`dd_storm_room_start($1)`, [CODE]);
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
await call(`dd_storm_room_get($1, 0)`, [CODE]);
await boxes(0, N(0, 9)); await boxes(1, N(1, 9));
await ans(0, true);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('2  Ziel erreicht: nur dieses Team', JSON.stringify(r.winners) === '[0]');

let twice = true;
try { await db.exec(mig('0247_kistensturm_item_reihum_gleichstand.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('3  0247 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
