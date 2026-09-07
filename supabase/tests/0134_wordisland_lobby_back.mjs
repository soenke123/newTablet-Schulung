/* Prüfstand für Migration 0134 — aus der Auswertung zurück in die
   Lobby, echt gerechnet in pglite. Stubs wie in 0133.

   Geprüft wird der Zustandsübergang selbst: dass er die Insel
   abräumt, die AUFSTELLUNG stehen lässt, die Einstellungen wieder
   freigibt — und dass er eine laufende Runde nicht anfasst. */
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

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

await run(STUBS, 'Stubs');
await run(mig('0130_vocab_content.sql'), '0130');
await run(mig('0131_wordisland_game.sql'), '0131');
await run(mig('0133_wordisland_lobby.sql'), '0133');
await run(mig('0134_wordisland_back_to_lobby.sql'), '0134');
console.log('— 0130 + 0131 + 0133 + 0134 laufen durch —\n');

const T    = 'e0000000-0000-4000-8000-000000000001';
const ROOM = 'b0000000-0000-4000-8000-000000000001';
const CODE = 'ABCDEF';
await db.exec(`
  insert into schools (id, slug) values ('d0000000-0000-4000-8000-000000000001','mps');
  insert into profiles (id, school_id) values ('${T}','d0000000-0000-4000-8000-000000000001');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','d0000000-0000-4000-8000-000000000001','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,9) g;
`);

const toLobby = async (code = CODE) =>
  (await one(`select wi_room_to_lobby($1) v`, [code])).v;
const board = async () =>
  await one(`select phase, winner_team, started_at, ends_at, ended_at, countdown_ends_at
               from wi_boards where room_id = $1`, [ROOM]);

/* ── Eine Runde spielen ────────────────────────────────────── */
const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
await one(`select wi_room_setup($1, $2) v`, [CODE, [schule]]);
await one(`select wi_room_set_factions($1, $2::jsonb) v`, [CODE, '[1,2,4]']);
let r = (await one(`select wi_room_start($1) v`, [CODE])).v;
ok('Runde gestartet', r.ok === true, JSON.stringify(r));

/* Mitten in der Runde ist der Weg zu. Sonst verschwände eine Arena,
   in der dreißig Kinder tippen, hinter einem Fehlgriff. */
ok('läuft noch: kein Rückweg', (await toLobby()).error === 'round_running',
   JSON.stringify(await toLobby()));

// Ein bisschen Spielstand, damit man ihn nachher vermissen kann.
await db.exec(`
  update wi_boards set phase='running', started_at=now(), ends_at=now()+interval '5 minutes'
   where room_id='${ROOM}';
  update wi_players set streak=4, picks=2, wrong_run=1, lock_until=now()+interval '9 seconds';
`);
await one(`select wi_room_end($1) v`, [CODE]);
let b = await board();
ok('Auswertung erreicht', b.phase === 'ended', b.phase);
const tilesVorher = (await one(`select count(*)::int n from wi_tiles where room_id=$1`, [ROOM])).n;
ok('Insel liegt noch da', tilesVorher > 60, String(tilesVorher));

const aufstellungVorher = (await db.query(
  `select participant_id, team_index from wi_players where room_id=$1 order by 1`, [ROOM])).rows;

/* ── Und zurück ────────────────────────────────────────────── */
r = await toLobby();
ok('Rückweg genommen', r.ok === true && r.phase === 'lobby', JSON.stringify(r));

b = await board();
ok('Phase ist Lobby',        b.phase === 'lobby');
ok('kein Sieger mehr',       b.winner_team === null);
ok('keine Uhr mehr',         b.started_at === null && b.ends_at === null &&
                             b.ended_at === null && b.countdown_ends_at === null);
ok('Insel abgeräumt',
   (await one(`select count(*)::int n from wi_tiles where room_id=$1`, [ROOM])).n === 0);

const aufstellungNachher = (await db.query(
  `select participant_id, team_index from wi_players where room_id=$1 order by 1`, [ROOM])).rows;
ok('Aufstellung bleibt stehen',
   JSON.stringify(aufstellungVorher) === JSON.stringify(aufstellungNachher));

const p = await one(`select count(*)::int n from wi_players
                      where room_id=$1 and (streak <> 0 or picks <> 0 or wrong_run <> 0
                                            or lock_until is not null or current_item is not null)`, [ROOM]);
ok('Serie, freie Wahl und Sperre sind zurückgesetzt', p.n === 0, String(p.n));

/* ── Und wieder einstellbar ────────────────────────────────── */
r = (await one(`select wi_room_set_factions($1, $2::jsonb) v`, [CODE, '[0,1]'])).v;
ok('Völker wieder wählbar', r.ok === true && r.team_count === 2, JSON.stringify(r));
r = (await one(`select wi_room_setup($1, null, null, 300) v`, [CODE])).v;
ok('Einstellungen wieder offen', r.ok === true, JSON.stringify(r));
ok('Dauer ist angekommen',
   (await one(`select duration_secs d from wi_boards where room_id=$1`, [ROOM])).d === 300);

/* p_teams ruft die Oberfläche seit 0133 nicht mehr auf — ein Gerät mit
   alt zwischengespeicherter tool.js aber schon. Dann müssen team_count
   und factions zusammenbleiben (0134). */
r = (await one(`select wi_room_setup($1, null, 4) v`, [CODE])).v;
let fb = await one(`select team_count, factions from wi_boards where room_id=$1`, [ROOM]);
ok('alte Team-Zahl zieht die Völker mit',
   r.ok === true && fb.team_count === 4 && JSON.stringify(fb.factions) === '[0,1,2,3]',
   JSON.stringify(fb));
ok('und verteilt die Klasse neu',
   (await one(`select count(distinct team_index)::int n from wi_players where room_id=$1`, [ROOM])).n === 4);
r = (await one(`select wi_room_setup($1, null, 2) v`, [CODE])).v;
fb = await one(`select team_count, factions from wi_boards where room_id=$1`, [ROOM]);
ok('kleiner werden schneidet hinten ab',
   fb.team_count === 2 && JSON.stringify(fb.factions) === '[0,1]', JSON.stringify(fb));

const g = (await one(`select wi_room_get($1, true) v`, [CODE])).v;
ok('Pult sieht die Lobby', g.phase === 'lobby');
ok('und eine leere Karte', Array.isArray(g.map) && g.map.length === 0,
   JSON.stringify((g.map || []).length));
ok('die Klasse steht in den Spalten', (g.people || []).length === 9);

/* ── Die nächste Runde ─────────────────────────────────────── */
r = (await one(`select wi_room_start($1) v`, [CODE])).v;
ok('nächste Runde startet', r.ok === true && r.tiles > 60, JSON.stringify(r));
ok('zwei Landeplätze',
   (await one(`select count(*)::int n from wi_tiles where room_id=$1 and is_home`, [ROOM])).n === 2);

/* ── Ränder ────────────────────────────────────────────────── */
ok('fremder Raum: keine Auskunft', (await toLobby('ZZZZZZ')).error === 'not_found');
await one(`select wi_room_end($1) v`, [CODE]);
await toLobby();
ok('zweimal hintereinander ist kein Fehler', (await toLobby()).ok === true);

await run(mig('0134_wordisland_back_to_lobby.sql'), '0134 (2. Lauf)');
ok('zweiter Lauf ändert nichts', (await board()).phase === 'lobby');

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
