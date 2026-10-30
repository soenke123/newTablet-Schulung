/* Prüfstand für Migration 0240 — Definitions Derby: Kistensturm mit Items.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0240.

   Geprüft: Einstellungen in der Lobby, Kisten als Liste (unten hinein),
   Item-Linien (jedes Überqueren zählt, seit 0241; „häufig“ doppelt), Ziehen nach Platz
   (der Erste bekommt keine Angriffe), alle zwölf Items, Sieg durch ein
   Item, Migration zweimal.

   Aufruf:  node supabase/tests/0240_definitionsderby_kistensturm_items.mjs */
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

/* 1 Einstellungen */
r = await call(`dd_storm_room_items($1, null, true, '["boom","quatsch"]'::jsonb)`, [CODE]);
ok('1  Items einstellen', r.ok, JSON.stringify(r));
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('1  häufig an, Boom aus, Unsinn verworfen', r.items_often === true && r.items_on === true && JSON.stringify(r.items_off) === '["boom"]');
await call(`dd_storm_room_items($1, null, false, '[]'::jsonb)`, [CODE]);
await call(`dd_storm_room_setup($1, 4, 10, 0, $2::jsonb)`, [CODE, JSON.stringify([S])]);
await call(`dd_storm_room_start($1)`, [CODE]);
r = await call(`dd_storm_room_items($1, false, null, null)`, [CODE]);
ok('1  nach dem Start keine Item-Einstellungen mehr', r.error === 'not_allowed');
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
await call(`dd_storm_room_get($1, 0)`, [CODE]);

/* 2 Kisten als Liste */
r = await ans(0, true);
ok('2  Antwort = Kiste unten, Liste in der Ansicht', r.teams[0].b[0] === 'n0' && Number(r.teams[0].h) === 1, JSON.stringify(r.teams[0]));

/* 3 Item-Linien (Ziel 10 → Linien bei 2, 4, 6, 8) */
r = await ans(0, true);
ok('3  Linie bei 2 → ein Item, Ereignis get', r.teams[0].it.length === 1 && r.events.some(e => e.k === 'get' && e.t === 0), JSON.stringify(r.teams[0]));
await boxes(0, N(0, 1));
await ans(0, true);
ok('3  Linie nach Verlust wieder überquert → neues Item (0241: Linie gilt immer)', (await team(0)).items.length === 2);
await db.exec(`update dd_storm_teams set items = '[]' where team = 0`);
await ans(0, true);
ok('3  weiter wachsen ohne neue Linie → kein Item', (await team(0)).items.length === 0);
await boxes(0, N(0, 9));
await db.exec(`update dd_storm_teams set line_max = 1 where team = 0`);
await ans(0, false);
await db.exec(`select dd_storm_award('${ROOM}', 0)`);
ok('3  höchstens 2 Items auf Vorrat', (await team(0)).items.length === 2);
await db.exec(`update dd_storm_teams set items = '[]' where team = 0`);
await boxes(0, N(0, 4));
ok('3  Höhe sinkt → Linie sinkt mit (line_max = 2 bei Höhe 4)', (await team(0)).line_max === 2);
await boxes(0, N(0, 4));
ok('3  genau auf der Linie gelandet → kein Item', (await team(0)).items.length === 0);

/* 4 Ziehen nach Platz: der Erste bekommt keine Angriffe */
await boxes(0, N(0, 6)); await boxes(1, N(1, 4)); await boxes(2, N(2, 2)); await boxes(3, []);
const leader = new Set(), last = new Set();
for (let i = 0; i < 300; i++) { leader.add(await call(`dd_storm_draw($1, 0)`, [ROOM])); last.add(await call(`dd_storm_draw($1, 3)`, [ROOM])); }
const ATT = ['moewe', 'moewe3', 'mini', 'sturm', 'tea', 'boom', 'bus'];
ok('4  Erster: nie Möwe, Boom, Bus, Teatime …', ATT.every(a => !leader.has(a)), [...leader].join(','));
ok('4  Letzter: bekommt auch Boom/Bus/3 Möwen, nie Stein', last.has('boom') && last.has('bus') && last.has('moewe3') && !last.has('stein'), [...last].join(','));
ok('4  Kuddelmuddel kann jeder bekommen', leader.has('kuddel') && last.has('kuddel'));
await db.exec(`update dd_storm_boards set items_off = '["kuddel"]'`);
const off = new Set(); for (let i = 0; i < 100; i++) off.add(await call(`dd_storm_draw($1, 3)`, [ROOM]));
ok('4  ausgeschaltetes Item kommt nicht', !off.has('kuddel'));
await db.exec(`update dd_storm_boards set items_off = '[]'`);

/* 5 Die Items — Ausgang: Türme 6/4/2/0, Ziel 10 */
const reset = async () => { await boxes(0, N(0, 6)); await boxes(1, N(1, 4)); await boxes(2, N(2, 2)); await boxes(3, []);
  await db.exec(`update dd_storm_teams set items = '[]', line_max = 9, maxi_until = null, mini_until = null, tea_until = null; update dd_storm_boards set storm_until = null`); };
await reset(); await give(3, 'bonus'); r = await use(3);
ok('5  Bonus: 2 goldene Kisten', (await kinds(3)) === 'gg' && await H(3) === 2 && r.used === 'bonus');
await reset(); await give(2, 'stein'); await use(2);
ok('5  Stein unten hinein', (await kinds(2)) === 'snn');
await reset(); await give(1, 'moewe'); await use(1);
r = (await one(`select data from dd_storm_events where room_id = $1 and kind = 'use' order by seq desc limit 1`, [ROOM])).data;
// seit 0246: die geklaute Kiste trägt die Farbe des neuen Teams, die Möwe am Beamer noch die alte
ok('5  Möwe: Team davor −1, eigenes +1, Kiste in eigener Farbe', await H(0) === 5 && await H(1) === 5 && (await team(1)).boxes.at(-1).t === 1 && r.b0.t === 0);
await reset(); await boxes(0, [...N(0, 5), { k: 's', t: 0 }]); await give(1, 'moewe'); await use(1);
ok('5  Möwe nimmt keinen Stein (der bleibt oben liegen)', (await kinds(0)) === 'nnnns' && (await team(1)).boxes.at(-1).k === 'n');
await reset(); await give(3, 'moewe3'); r = await use(3);
ok('5  3 Möwen: alle drei davor −1, Letzter +3', await H(0) === 5 && await H(1) === 3 && await H(2) === 1 && await H(3) === 3);
await reset(); await give(3, 'maxi'); await use(3); await ans(3, true);
ok('5  Maxi: nächste Kiste doppelt hoch', (await kinds(3)) === 'x' && await H(3) === 2);
await reset(); await give(3, 'mini'); r = await use(3); await ans(2, true); await ans(0, true);
ok('5  Mini: 2 Teams davor bekommen halbe Kisten, der Erste nicht', (await kinds(2)).startsWith('m') && await H(2) === 2.5 && (await kinds(0)).startsWith('n'), JSON.stringify(r.events.at(-1)?.d));
await reset(); await boxes(2, N(2, 1)); await give(3, 'sturm'); await use(3);
await ans(0, false); await ans(2, false);
ok('5  Sturm: über Stufe 1 kostet ein Fehler die oberste Kiste', await H(0) === 5);
ok('5  Sturm: auf Stufe 1 (Höhe < Ziel/5) passiert nichts', await H(2) === 1);
await reset(); await give(3, 'tea'); r = await use(3);
const tea = await ans(0, true);
ok('5  Teatime: die ersten beiden sind gesperrt', tea.result === 'tea' && (await ans(1, true)).result === 'tea' && (await ans(2, true)).result === 'ok');
await reset(); await boxes(0, [{ k: 'x', t: 0 }, { k: 'x', t: 0 }, ...N(0, 4)]); await give(3, 'bus'); await use(3);
ok('5  Bus: unten weg bis Höhe 5 (Maxi zählt doppelt)', (await kinds(0)) === 'nnn' && await H(1) === 0 && await H(2) === 0, String(await H(0)));
await reset(); await give(3, 'boom'); await use(3);
ok('5  Boom: der Erste verliert 5 Kisten', await H(0) === 1);
await reset(); await boxes(0, [...N(0, 3), { k: 's', t: 0 }, ...N(0, 2)]); await give(3, 'boom'); await use(3);
ok('5  Boom: Stein wird zerstört, schützt darunter', (await kinds(0)) === 'nnn');
await db.exec(`update dd_storm_boards set goal = 60`);   // damit 5 Antworten nicht gewinnen
await reset(); await give(3, 'eis'); r = await use(3);
const victim = r.events.at(-1).d.tg[0];
ok('5  Eis landet ganz unten bei einem anderen Team (seit 0245)', victim !== 3 && (await team(victim)).boxes[0].k === 'i');
for (let i = 0; i < 5; i++) await ans(victim, true);
ok('5  Eis: 5 richtige in Folge → taut zur Kiste', !(await kinds(victim)).includes('i'));
await reset(); await give(3, 'eis'); r = await use(3);
const v2 = r.events.at(-1).d.tg[0], before = (await team(v2)).boxes.length;
await ans(v2, true); await ans(v2, false);
await db.exec(`update dd_storm_boards set goal = 10`);
// seit 0245: nur die neuen Kisten unter dem Eis rutschen weg, die alten bleiben
ok('5  Eis: Fehler → nur die neuen Kisten rutschen weg', (await team(v2)).boxes.length === before && !(await kinds(v2)).includes('i'), String((await team(v2)).boxes.length) + ' von ' + before);
await reset(); await boxes(1, [{ k: 'x', t: 1 }, ...N(1, 3)]); await give(3, 'kuddel');
const all0 = (await one(`select string_agg(e->>'k', '' order by e->>'k') s from dd_storm_teams t, jsonb_array_elements(t.boxes) e where room_id = $1`, [ROOM])).s;
await use(3);
const cnt = await Promise.all([0, 1, 2, 3].map(async t => (await team(t)).boxes.length));
const all1 = (await one(`select string_agg(e->>'k', '' order by e->>'k') s from dd_storm_teams t, jsonb_array_elements(t.boxes) e where room_id = $1`, [ROOM])).s;
ok('5  Kuddelmuddel: jedes Team behält seine Anzahl, keine Kiste geht verloren', cnt.join() === '6,4,2,0' && all0 === all1);
const colors = await Promise.all([0, 1, 2, 3].map(async t => (await team(t)).boxes.every(b => b.t === t)));
ok('5  Kuddelmuddel: jede Kiste in der Farbe ihres neuen Teams (0246)', colors.every(Boolean));

/* 6 Sieg durch ein Item */
await reset(); await boxes(0, N(0, 9)); await give(0, 'bonus'); r = await use(0);
ok('6  Bonus über das Ziel → gewonnen', r.phase === 'ended' && r.winner_team === 0);
r = await use(0);
ok('6  danach kein Item mehr', r.result === 'not_running');

/* 7 Items aus */
await call(`dd_storm_room_reset($1)`, [CODE]);
await call(`dd_storm_room_items($1, false, null, null)`, [CODE]);
await call(`dd_storm_room_start($1)`, [CODE]);
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
await call(`dd_storm_room_get($1, 0)`, [CODE]);
for (let i = 0; i < 4; i++) await ans(0, true);
ok('7  Items aus → keine Items', (await team(0)).items.length === 0 && await H(0) >= 2);

let twice = true;
try { await db.exec(mig('0240_definitionsderby_kistensturm_items.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('8  0240 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
