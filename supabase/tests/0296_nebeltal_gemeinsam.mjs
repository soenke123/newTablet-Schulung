/* Prüfstand für Migration 0296 — Nebeltal gemeinsam spielen.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0296.

   Die Kernzusagen:
     1. „Gemeinsam spielen“ setzt skill_room_state.data.mp (Signal an die Tablets) und lässt
        data.levels (Freigaben) stehen; „aus“ setzt mp = 0.
     2. Jedes Tablet bekommt beim ersten Kontakt eine eigene Schalfarbe und steht in der Lobby.
     3. Level 8: bis 8 Personen EIN Team, ab 9 zwei möglichst gleich große; Welten verteilt
        (zusammen immer 8, wer „spielt 2“ hat, bekommt die übrigen zuerst); Spätzugang ins kleinste Team.
     4. Level 7: Paare, bei ungerader Zahl eine Person allein mit beiden Welten.
     5. Lehrkraft verschiebt Personen (volles Team = team_full), neues Team mit −1.
     6. Runde: start → intro (nur Anwesende spielen mit) → go → countdown → running;
        Werte nur für eigene Welten; Level 1–6 endet, wenn alle fertig sind.
     7. Tablets sehen fremde Endstände erst am Ende und Werte nur des eigenen Teams.
     8. Fremder Raum / falscher Token / Schüler kann nt_room_act nicht.
     9. 0296 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0296_nebeltal_gemeinsam.mjs */
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
const A = 'e0000000-0000-4000-8000-0000000296a1', B = 'e0000000-0000-4000-8000-0000000296b1';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 'nt_ad2', 'Admin', 'active', 'approved', true),
                       ($2, $3, 'nt_lk2', 'Andere', 'active', 'approved', true)`, [A, B, SCHOOL]);
const as = async who => { await db.query(`delete from _who`); if (who) await db.query(`insert into _who values ($1)`, [who]); };

await as(A);
const room = (await one(`select skill_room_create('nebeltal', 'Info 10', false, '{}'::jsonb) v`)).v;
ok('0  Raum angelegt', room && room.ok, JSON.stringify(room));
const CODE = room.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;

const act = async (a, args = {}, who = A) => { await as(who); return (await one(`select nt_room_act($1, $2, $3::jsonb) v`, [CODE, a, JSON.stringify(args)])).v; };
const get = async () => { await as(A); return (await one(`select nt_room_get($1) v`, [CODE])).v; };
const play = async (tok, p = {}) => { await as(null); return (await one(`select nt_play($1, $2::jsonb) v`, [tok, JSON.stringify(p)])).v; };

// Teilnehmer anlegen
const TOK = [];
const addKid = async (i) => {
  const t = 'tok-nt-' + i;
  await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, t, i, 'Kind ' + i]);
  TOK[i] = t;
};
for (let i = 1; i <= 10; i++) await addKid(i);

/* 1 */
await as(A);
await one(`select skill_room_set_state($1, null, '{"levels":[1,2]}'::jsonb) v`, [CODE]);
const off0 = await play(TOK[1]);
ok('1  aus: Tablet bekommt phase off', off0.ok && off0.phase === 'off', JSON.stringify(off0));
const on = await act('on');
ok('1  an: Lobby', on.ok && on.phase === 'lobby', JSON.stringify(on).slice(0, 200));
let st = (await one(`select data from skill_room_state where room_id = $1`, [ROOM])).data;
ok('1  data.mp = 1, data.levels bleibt', st.mp === 1 && JSON.stringify(st.levels) === '[1,2]', JSON.stringify(st));

/* 2 */
for (let i = 1; i <= 9; i++) await play(TOK[i]);
let v = await play(TOK[1]);
ok('2  Lobby sieht 9 Pinguine', v.people.length === 9, v.people.length);
const cols = new Set(v.people.map(p => p.c));
ok('2  9 verschiedene Schalfarben', cols.size === 9, [...cols].join(','));
v = await play(TOK[1], { pos: [0.3, 0.7] });
const me1 = v.people.find(p => p.n === 'Kind 1');
ok('2  Position wird gemerkt', Math.abs(me1.x - 0.3) < 1e-4 && Math.abs(me1.y - 0.7) < 1e-4, JSON.stringify(me1));

/* 3 */
let r = await act('level', { n: 8 });
ok('3  Level 8 gewählt', r.ok && r.level === 8);
const teamsOf = s => {
  const m = {};
  for (const p of s.people) if (p.t !== null && p.on) (m[p.t] = m[p.t] || []).push(p);
  return Object.values(m);
};
let T = teamsOf(r);
ok('3  9 Personen → 2 Teams (5/4)', T.length === 2 && T.map(t => t.length).sort().join() === '4,5', T.map(t => t.length).join());
const slotsOk = t => t.flatMap(p => p.s).sort((a, b) => a - b).join() === '0,1,2,3,4,5,6,7';
ok('3  jedes Team hat genau die 8 Welten', T.every(slotsOk), JSON.stringify(T.map(t => t.map(p => p.s))));
// 8 Personen → ein Team
await db.query(`update nt_players set seen_at = now() - interval '1 minute' where participant_id = (select id from skill_participants where token = $1)`, [TOK[9]]);
r = await act('balance');
T = teamsOf(r);
ok('3  8 Personen → EIN Team mit je einer Welt', T.length === 1 && T[0].length === 8 && T[0].every(p => p.s.length === 1), T.map(t => t.length).join());
// Spätzugang
await play(TOK[9]);
await play(TOK[10]);
r = await get();
T = teamsOf(r);
ok('3  Spätzugang: neues Team, weil das erste voll ist', T.length === 2 && T.map(t => t.length).sort().join() === '2,8', T.map(t => t.length).join());
ok('3  kleines Team: je 4 Welten', T.find(t => t.length === 2).every(p => p.s.length === 4));
// spielt 2
await act('size', { n: 4 });           // 10 Personen → 3 Teams 4/3/3
r = await get();
T = teamsOf(r);
ok('3  Teamgröße 4: 10 → 4/3/3', T.map(t => t.length).sort().join() === '3,3,4', T.map(t => t.length).join());
const t3 = T.find(t => t.length === 3);
const last = t3[t3.length - 1];
r = await act('dbl', { pid: last.id, on: true });
const lastNow = r.people.find(p => p.id === last.id);
ok('3  „spielt 2“ bekommt die übrigen Welten zuerst', lastNow.d === true && lastNow.s.length === 3 && lastNow.s[0] === 0, JSON.stringify(lastNow.s));

/* 4 */
r = await act('level', { n: 7 });
T = teamsOf(r);
ok('4  Level 7: 10 Personen → 5 Paare', T.length === 5 && T.every(t => t.length === 2 && t.every(p => p.s.length === 1)), T.map(t => t.length).join());
await db.query(`update nt_players set seen_at = now() - interval '1 minute' where participant_id = (select id from skill_participants where token = $1)`, [TOK[10]]);
r = await act('balance');
T = teamsOf(r);
const solo = T.find(t => t.length === 1);
ok('4  ungerade (9): eine Person allein mit beiden Welten', T.length === 5 && solo && solo[0].s.join() === '0,1', T.map(t => t.length).join());

/* 5 */
const pair = T.find(t => t.length === 2);
r = await act('move', { pid: solo[0].id, team: pair[0].t });
ok('5  volles Paar: team_full', r.ok === false && r.error === 'team_full', JSON.stringify(r));
r = await act('move', { pid: pair[0].id, team: -1 });
const moved = r.people.find(p => p.id === pair[0].id);
const left = r.people.find(p => p.id === pair[1].id);
ok('5  neues Team mit −1, Zurückgebliebener spielt beide Welten', moved.t > 4 && moved.s.join() === '0,1' && left.s.join() === '0,1', JSON.stringify([moved, left].map(p => [p.t, p.s])));
r = await act('move', { pid: moved.id, team: left.t });
ok('5  zurück ins Paar', r.people.find(p => p.id === moved.id).t === left.t);
{
  const P2 = teamsOf(r).filter(t => t.length === 2);
  const a1 = P2[0][0], b1 = P2[1][0];
  r = await act('swap', { a: a1.id, b: b1.id });
  ok('5  tauschen: beide wechseln das Team', r.people.find(p => p.id === a1.id).t === b1.t && r.people.find(p => p.id === b1.id).t === a1.t);
}

/* 6 */
r = await act('start');
ok('6  start → intro', r.ok && r.phase === 'intro', r.phase);
const inRound = r.people.filter(p => p.in).length;
ok('6  nur Anwesende spielen mit (9)', inRound === 9, inRound);
v = await play(TOK[1], { ready: true });
ok('6  bereit gemeldet', v.me.r === true);
r = await act('go');
ok('6  go → countdown', r.phase === 'countdown');
await db.query(`update nt_rounds set countdown_ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
r = await get();
ok('6  countdown → running, Ende nach Zeit gesetzt', r.phase === 'running' && r.ends_at, r.phase);
const k1 = r.people.find(p => p.n === 'Kind 1');
const mine = k1.s[0], other = mine === 0 ? 1 : 0;
v = await play(TOK[1], { vals: { [mine]: [1.5, -2], [other]: [9, 9] } });
const me = v.people.find(p => p.n === 'Kind 1');
ok('6  Werte nur für die eigene Welt', me.v[String(mine)] && !me.v[String(other)], JSON.stringify(me.v));
// Partner sieht die Werte, andere Teams nicht
const partner = v.people.find(p => p.t === k1.t && p.id !== k1.id);
const stranger = v.people.find(p => p.t !== k1.t && p.in);
const vP = partner ? (await play(TOK[+partner.n.split(' ')[1]])).people.find(p => p.id === k1.id).v : null;
const vS = (await play(TOK[+stranger.n.split(' ')[1]])).people.find(p => p.id === k1.id).v;
ok('7  Partner sieht meine Werte, fremdes Team nicht', vP && vP[String(mine)] && vS === null, JSON.stringify([vP, vS]));
await db.query(`update nt_rounds set ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
r = await get();
ok('6  Level 7 endet nach Zeit', r.phase === 'ended', r.phase);
const vEnd = (await play(TOK[+stranger.n.split(' ')[1]])).people.find(p => p.id === k1.id).v;
ok('7  am Ende sehen alle die Werte', vEnd && vEnd[String(mine)], JSON.stringify(vEnd));

// Level 3: Ende, wenn alle fertig sind
await play(TOK[10]);
r = await act('level', { n: 3 });
ok('6  Level 3: keine Teams', r.people.every(p => p.t === null));
r = await act('start'); r = await act('go');
await db.query(`update nt_rounds set countdown_ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
r = await get();
const players = r.people.filter(p => p.in);
ok('6  running ohne Zeitende', r.phase === 'running' && !r.ends_at && players.length === 10, players.length);
v = await play(TOK[1], { res: { s: 3.2, x: 1, z: 2 } });
const other2 = (await play(TOK[2])).people.find(p => p.n === 'Kind 1');
ok('7  fremder Endstand vor dem Ende unsichtbar', other2.res === null && other2.f === true, JSON.stringify(other2));
for (let i = 2; i <= 9; i++) await play(TOK[i], { res: { s: i } });
r = await get();
ok('6  einer fehlt noch → läuft weiter', r.phase === 'running');
v = await play(TOK[10], { res: { s: 1 } });
ok('6  alle fertig → vorbei', v.phase === 'ended', v.phase);
ok('7  am Ende alle Endstände sichtbar', v.people.filter(p => p.in && p.res).length === 10);
r = await act('lobby');
ok('6  zurück in die Lobby', r.phase === 'lobby');

/* 8 */
r = await act('level', { n: 2 }, B);
ok('8  fremde Lehrkraft: not_found', r.ok === false && r.error === 'not_found', JSON.stringify(r));
r = await play('falsch');
ok('8  falscher Token: unknown_token', r.ok === false && r.error === 'unknown_token');
let denied = false;
try { await db.query(`set role anon`); await db.query(`select nt_room_act('X', 'on', '{}'::jsonb)`); } catch (e) { denied = /permission/.test(e.message); }
await db.query(`reset role`);
ok('8  anon darf nt_room_act nicht ausführen', denied);
denied = false;
try { await db.query(`set role anon`); await db.query(`select nt_play('x', '{}'::jsonb)`); denied = true; } catch (e) { denied = false; }
await db.query(`reset role`);
ok('8  anon darf nt_play ausführen', denied);

r = await act('off');
st = (await one(`select data from skill_room_state where room_id = $1`, [ROOM])).data;
ok('1  aus: data.mp = 0', r.phase === 'off' && st.mp === 0 && JSON.stringify(st.levels) === '[1,2]', JSON.stringify(st));

/* 9 */
let twice = true;
try { await db.exec(mig('0296_nebeltal_gemeinsam.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('9  0296 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
