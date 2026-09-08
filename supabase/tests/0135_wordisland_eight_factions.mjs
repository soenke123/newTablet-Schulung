/* Prüfstand für Migration 0135 — acht Völker statt sechs, echt
   gerechnet in pglite. Stubs wie in 0134.

   Geprüft wird genau das, was zwischen „die Wappenreihe zeigt acht"
   und „acht spielen wirklich mit" steht: die drei Deckel in der
   Datenbank. Vorher müssen sieben und acht ABGELEHNT werden — sonst
   bestätigt der Test nur, dass etwas durchgeht, das ohnehin
   durchging.

   Und danach eine ganze Runde mit acht: die Landeplätze sind die
   Stelle, an der es kippen könnte. wi_build_island sucht sie nach
   Winkel mit Mindestabstand, und bei acht Völkern wird der eng. */
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
/* 24 Kinder: bei acht Völkern sind das Dreiergruppen — die Größe,
   in der Sönke das einsetzen will, und gleichzeitig die kleinste,
   bei der acht Gruppen überhaupt Sinn ergeben. */
await db.exec(`
  insert into schools (id, slug) values ('d0000000-0000-4000-8000-000000000001','mps');
  insert into profiles (id, school_id) values ('${T}','d0000000-0000-4000-8000-000000000001');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','d0000000-0000-4000-8000-000000000001','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,24) g;
`);

const norm  = async j => (await one(`select wi_normalize_factions($1::jsonb) v`, [j])).v;
const setF  = async j => (await one(`select wi_room_set_factions($1, $2::jsonb) v`, [CODE, j])).v;
const board = async () => await one(`select team_count, factions from wi_boards where room_id = $1`, [ROOM]);
const js    = v => JSON.stringify(v);

const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
await one(`select wi_room_setup($1, $2) v`, [CODE, [schule]]);

/* ── Vor 0135: sechs ist die Decke ──────────────────────────── */
console.log('— vor 0135 —');
ok('sieben Völker werden abgelehnt', await norm('[0,1,2,3,4,5,6]') === null);
ok('acht Völker werden abgelehnt',   await norm('[0,1,2,3,4,5,6,7]') === null);
ok('sechs gehen schon immer',        js(await norm('[0,1,2,3,4,5]')) === '[0,1,2,3,4,5]');
let r = await setF('[0,1,2,3,4,5,6,7]');
ok('und die Auswahl kommt nicht durch', r.ok !== true, js(r));

/* ── 0135 ───────────────────────────────────────────────────── */
await run(mig('0135_wordisland_eight_factions.sql'), '0135');
console.log('\n— nach 0135 —');

ok('Volk 6 ist eine Zahl', js(await norm('[0,6]')) === '[0,6]');
ok('Volk 7 ist eine Zahl', js(await norm('[0,7]')) === '[0,7]');
ok('acht Völker gehen',    js(await norm('[0,1,2,3,4,5,6,7]')) === '[0,1,2,3,4,5,6,7]');

/* Die Decke ist VERSCHOBEN, nicht weg. Ohne diese vier Zusagen
   bewiese der Test nur, dass die Prüfung durchlässiger geworden
   ist — und das wäre sie auch, wenn ich sie versehentlich ganz
   ausgehängt hätte. */
ok('neun Völker bleiben abgelehnt', await norm('[0,1,2,3,4,5,6,7,8]') === null);
ok('Volk 8 bleibt abgelehnt',       await norm('[0,8]') === null);
ok('eines allein bleibt abgelehnt', await norm('[3]') === null);
ok('Krimskrams bleibt abgelehnt',
   await norm('["2",3]') === null && await norm('[2.5,3]') === null &&
   await norm('[-1,3]') === null);
ok('Doppelte fallen weiter zusammen', js(await norm('[7,7,2]')) === '[2,7]');

r = await setF('[0,1,2,3,4,5,6,7]');
ok('acht Völker lassen sich wählen', r.ok === true, js(r));
let b = await board();
ok('team_count steht auf acht', b.team_count === 8, String(b.team_count));
ok('die Völker stehen drin',    js(b.factions) === '[0,1,2,3,4,5,6,7]', js(b.factions));

/* ── Und eine ganze Runde mit acht ──────────────────────────── */
r = (await one(`select wi_room_start($1) v`, [CODE])).v;
ok('Runde mit acht startet', r.ok === true, js(r));

/* Der Kern. wi_build_island sucht die Landeplätze nach Winkel mit
   einem Mindestabstand und hat für den Fall, dass die Küste keinen
   hergibt, einen zweiten Durchgang OHNE. Ohne den käme bei acht
   Völkern auf einer schmalen Insel das letzte Volk nicht an Land —
   und das fiele erst in der Klasse auf. */
const homes = await all(`select owner_team from wi_tiles
                          where room_id = $1 and is_home order by owner_team`, [ROOM]);
ok('acht Landeplätze', homes.length === 8, String(homes.length));
ok('jedes Volk genau einen',
   js(homes.map(h => h.owner_team)) === '[0,1,2,3,4,5,6,7]', js(homes.map(h => h.owner_team)));

const slots = await all(`select distinct team_index from wi_players
                          where room_id = $1 order by 1`, [ROOM]);
ok('24 Kinder auf acht Gruppen verteilt',
   js(slots.map(s => s.team_index)) === '[0,1,2,3,4,5,6,7]', js(slots.map(s => s.team_index)));

const teams = (await one(`select wi_teams_json($1, 8) v`, [ROOM])).v;
ok('die Tafel zeigt acht Völker', Array.isArray(teams) && teams.length === 8,
   String(Array.isArray(teams) ? teams.length : teams));

/* ── Zweiter Lauf ───────────────────────────────────────────── */
await run(mig('0135_wordisland_eight_factions.sql'), '0135 (2. Lauf)');
ok('zweiter Lauf ändert nichts',
   js(await norm('[0,1,2,3,4,5,6,7]')) === '[0,1,2,3,4,5,6,7]' && await norm('[0,8]') === null);
/* Und die Regeln heißen weiter, wie sie hießen: die nächste
   Migration, die daran will, sucht sie unter diesem Namen. */
ok('die Prüfregeln behalten ihre Namen',
   (await all(`select conname from pg_constraint
                where conrelid='public.wi_boards'::regclass
                  and conname in ('wi_boards_team_count_check','wi_boards_factions_len_ck')`)).length === 2);

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
