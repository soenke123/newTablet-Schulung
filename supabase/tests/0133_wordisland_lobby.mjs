/* Prüfstand für Migration 0133 — die Kingdoms-Lobby in Wordisland,
   echt gerechnet in pglite. Stubs wie in 0131_wordisland.mjs.

   Geprüft wird das, was die Oberfläche nicht selbst erfinden kann:
   welche Völker mitspielen, wer in der eigenen Gruppe sitzt, wer
   gerade am Tablet ist — und dass eine geänderte Völkerzahl keine
   Kinder in einem Slot zurücklässt, den es nicht mehr gibt. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
create schema if not exists auth;
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique, owner_id uuid, school_id uuid, title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references skill_rooms(id) on delete cascade,
  token text unique, seat int not null, name text,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
create or replace function gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text), 'hex') $$;
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 60, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create role service_role; create role authenticated; create role anon;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 240), Number(e.position) + 60)}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

await run(STUBS, 'Stubs');
await run(mig('0130_vocab_content.sql'), '0130');
await run(mig('0131_wordisland_game.sql'), '0131');

/* ── Ein Raum, der die Migration NOCH NICHT kennt ─────────────
   Er wird vor 0133 angelegt und bekommt eine ungewöhnliche
   Völkerzahl (5). Danach muss factions genau das enthalten, was der
   Raum vorher anzeigte: Volk = Slot. */
const T = 'e0000000-0000-4000-8000-000000000001';
const ROOM = 'b0000000-0000-4000-8000-000000000001';
const CODE = 'ABCDEF';
await db.exec(`
  insert into schools (id, slug) values ('d0000000-0000-4000-8000-000000000001','mps');
  insert into profiles (id, school_id) values ('${T}','d0000000-0000-4000-8000-000000000001');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','d0000000-0000-4000-8000-000000000001','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,12) g;
`);
await one(`select wi_room_get($1) v`, [CODE]);              // legt das Board an
await db.exec(`update wi_boards set team_count = 5 where room_id='${ROOM}'`);

await run(mig('0133_wordisland_lobby.sql'), '0133');
console.log('— 0130 + 0131 + 0133 laufen durch —\n');

/* ── Nachrüsten bestehender Räume ──────────────────────────── */
let b = await one(`select factions, team_count from wi_boards where room_id=$1`, [ROOM]);
ok('Bestandsraum: factions = Volk ist Slot',
   JSON.stringify(b.factions) === '[0,1,2,3,4]', JSON.stringify(b.factions));

/* ── wi_normalize_factions ─────────────────────────────────── */
const norm = async (j) => (await one(`select wi_normalize_factions($1::jsonb) v`, [JSON.stringify(j)])).v;
ok('normalisiert: sortiert und ohne Wiederholung',
   JSON.stringify(await norm([5, 0, 5, 2])) === '[0,2,5]');
ok('normalisiert: eines ist zu wenig',      (await norm([3])) === null);
ok('normalisiert: sieben gibt es nicht',    (await norm([0, 1, 2, 3, 4, 5, 6])) === null);
ok('normalisiert: Volk 6 gibt es nicht',    (await norm([0, 6])) === null);
ok('normalisiert: Bruchzahlen raus',        (await norm([0, 2.5])) === null);
ok('normalisiert: kein Feld',               (await norm({ a: 1 })) === null);

/* ── Völker wählen ─────────────────────────────────────────── */
const setFac = async (j, code = CODE) =>
  (await one(`select wi_room_set_factions($1, $2::jsonb) v`, [code, JSON.stringify(j)])).v;

let r = await setFac([4, 0, 5]);
ok('Wappen-Auswahl übernommen', r.ok === true && r.team_count === 3, JSON.stringify(r));
ok('Auswahl kommt sortiert zurück', JSON.stringify(r.factions) === '[0,4,5]');
b = await one(`select factions, team_count from wi_boards where room_id=$1`, [ROOM]);
ok('team_count zieht mit', b.team_count === 3 && JSON.stringify(b.factions) === '[0,4,5]');

let teams = await all(`select team_index, count(*)::int n from wi_players where room_id=$1 group by team_index order by 1`, [ROOM]);
ok('Klasse neu verteilt auf drei Slots',
   teams.length === 3 && teams.every(t => t.team_index < 3), JSON.stringify(teams));
ok('gleichmäßig verteilt', Math.max(...teams.map(t => t.n)) - Math.min(...teams.map(t => t.n)) <= 1,
   JSON.stringify(teams));

/* Nur tauschen, nicht zählen: die Aufstellung darf sich NICHT ändern —
   sonst steht die Klasse nach einem Klick auf ein anderes Wappen
   plötzlich in anderen Gruppen. */
const vorher = await all(`select participant_id, team_index from wi_players where room_id=$1 order by 1`, [ROOM]);
r = await setFac([1, 4, 5]);
const nachher = await all(`select participant_id, team_index from wi_players where room_id=$1 order by 1`, [ROOM]);
ok('Volk getauscht, Gruppen bleiben stehen',
   JSON.stringify(vorher) === JSON.stringify(nachher));

ok('Unsinn wird abgelehnt', (await setFac([9, 9])).error === 'invalid_factions');
ok('fremder Raum: keine Auskunft', (await setFac([0, 1], 'ZZZZZZ')).error === 'not_found');

/* ── Die Lobby am Pult ─────────────────────────────────────── */
// Ein Kind war lange nicht am Gerät, eines war noch nie da.
await db.exec(`
  update skill_participants set last_seen_at = now() - interval '5 minutes' where token='tok3';
  insert into skill_participants (room_id, token, seat, name) values ('${ROOM}','tok13',13,'Spät');
`);
let g = (await one(`select wi_room_get($1) v`, [CODE])).v;
ok('Pult: factions dabei',   JSON.stringify(g.factions) === '[1,4,5]');
ok('Pult: Kopfzahlen',       g.room_total === 13 && g.online_count === 12,
   `${g.online_count}/${g.room_total}`);
const drei = g.people.find(p => p.name === 'Kind 3');
ok('Pult: Abwesender ist markiert', drei.online === false);
ok('Pult: Anwesender ist markiert', g.people.find(p => p.name === 'Kind 1').online === true);
ok('Pult: Nachzügler ohne Volk',    g.people.find(p => p.name === 'Spät').team === null);
ok('Pult: teams so lang wie factions', g.teams.length === 3, JSON.stringify(g.teams));

/* ── Die Wartetafel am Tablet ──────────────────────────────── */
let v = (await one(`select wi_view($1) v`, ['tok1'])).v;
ok('Tablet: factions dabei',  JSON.stringify(v.factions) === '[1,4,5]');
ok('Tablet: team_count dabei', v.team_count === 3);
ok('Tablet: eigenes Volk',    v.me.team >= 0 && v.me.team < 3);
ok('Tablet: eigene Gruppe hat Namen',
   Array.isArray(v.my_team_members) && v.my_team_members.length >= 3,
   JSON.stringify(v.my_team_members));
ok('Tablet: genau ein „du"',
   v.my_team_members.filter(m => m.me).length === 1);
ok('Tablet: „du" ist der Aufrufer',
   v.my_team_members.find(m => m.me).name === 'Kind 1');
ok('Tablet: Gruppe stimmt mit der Kopfzahl überein',
   v.my_team_members.length === v.teams.find(t => t.i === v.me.team).people,
   `${v.my_team_members.length} vs ${JSON.stringify(v.teams)}`);
ok('Tablet: Abwesenheit steht dabei',
   v.my_team_members.every(m => typeof m.online === 'boolean'));
ok('Tablet: online_count dabei', v.online_count >= 1 && v.room_total === 13);
ok('Tablet: keine fremden Namen',
   !JSON.stringify(v.teams).includes('Kind '));

/* ── Nach dem Start ist die Wahl zu ────────────────────────── */
const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
await one(`select wi_room_setup($1, $2) v`, [CODE, [schule]]);
r = (await one(`select wi_room_start($1) v`, [CODE])).v;
ok('Start ok', r.ok === true, JSON.stringify(r));
ok('Start verteilt alle 13 Kinder',
   (await one(`select count(*)::int n from wi_players where room_id=$1`, [ROOM])).n === 13);
ok('drei Landeplätze',
   (await one(`select count(*)::int n from wi_tiles where room_id=$1 and is_home`, [ROOM])).n === 3);
ok('Wappen-Auswahl nach dem Start gesperrt',
   (await setFac([0, 1, 2, 3])).error === 'phase_locked');

/* ── Zweiter Lauf ──────────────────────────────────────────── */
const facVor = (await one(`select factions from wi_boards where room_id=$1`, [ROOM])).factions;
await run(mig('0133_wordisland_lobby.sql'), '0133 (2. Lauf)');
ok('Zweiter Lauf lässt die Auswahl stehen',
   JSON.stringify((await one(`select factions from wi_boards where room_id=$1`, [ROOM])).factions)
   === JSON.stringify(facVor));
ok('Zweiter Lauf lässt die Insel stehen',
   (await one(`select count(*)::int n from wi_tiles where room_id=$1`, [ROOM])).n > 60);

/* Ein NEUER Raum bekommt den Vorgabewert — vier Völker, wie team_count. */
await db.exec(`
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('b0000000-0000-4000-8000-000000000002','GHIJKL','${T}','d0000000-0000-4000-8000-000000000001','Zweiter');
`);
g = (await one(`select wi_room_get($1) v`, ['GHIJKL'])).v;
ok('Neuer Raum: vier Völker voreingestellt',
   JSON.stringify(g.factions) === '[0,1,2,3]' && g.team_count === 4, JSON.stringify(g.factions));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
