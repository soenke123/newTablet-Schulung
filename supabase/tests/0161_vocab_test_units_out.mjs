/* Prüfstand für Migration 0161 — die Test-Units gehen von Bord.
   Echt gerechnet in pglite, Stubs wie in 0136…0160.

   Eine Löschung prüft man nicht daran, dass hinterher weg ist, was
   weg sein soll — das ist der leichte Teil. Man prüft sie daran,
   was sie MITNIMMT und was sie STEHEN LÄSST. Deshalb lernt hier
   erst ein Kind auf den Test-Wörtern, sitzt in einer Aufgabe und
   hat sie auf seiner Insel; dann wird gelöscht.

   Die Kernzusagen:
     1. Die drei Listen, ihr Dach und ihre 90 Wörter sind weg.
     2. Was daran hing, geht mit: Karteikasten, Langzeit-Fach,
        Freigespieltes, Raumauswahl, Strichliste.
     3. Die laufende Aufgabe wird NULL und nicht zum Fehler — mitten
        in der Stunde zerreißt nichts.
     4. Green Line bleibt vollständig und unberührt.
     5. Ein Kind, dessen Insel danach leer ist, bringt die Rechnungen
        nicht zum Absturz (Division durch null).
     6. Ein neuer Raum bekommt jetzt die erste Station des Buchs.
     7. Zweiter Lauf (Idempotenz).

   Aufruf:  node supabase/tests/0161_vocab_test_units_out.mjs */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
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
  blocked boolean not null default false,
  blocked_at timestamptz,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create table if not exists _teach (yes boolean);
insert into _teach (yes) values (true);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select coalesce((select yes from _teach limit 1), false) $$;
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
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
const zahl = async sql => Number((await one(`select (${sql}) k`)).k);

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 240), Number(e.position) + 60)}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

const BIS_0160 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql', '0150_vocab_units.sql',
  '0151_wordisland_choice_streak_lock.sql', '0152_wordisland_blocked_out.sql',
  '0153_wordisland_round_words.sql', '0154_vocab_set_words.sql',
  '0157_wordisland_sets_push.sql', '0158_wordisland_view_restore.sql',
  '0159_vocab_lehrwerk.sql', '0160_vocab_greenline_5.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0160) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0160 laufen durch —\n');

const SCHULE = 'd0000000-0000-4000-8000-000000000001';
const L      = 'e0000000-0000-4000-8000-000000000001';
const RAUM   = 'f0000000-0000-4000-8000-000000000001';
const KIND   = 'f0000000-0000-4000-8000-000000000002';
const TEST1  = 'a0000000-0000-4000-8000-000000000001';
const DACH   = 'b0000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into schools (id, slug) values ('${SCHULE}','mps');
  insert into profiles (id, school_id) values ('${L}','${SCHULE}');
  insert into _who (uid) values ('${L}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${RAUM}','TESTAA','${L}','${SCHULE}','Alter Raum');
  insert into skill_participants (id, room_id, token, seat, name)
    values ('${KIND}','${RAUM}','tok-kind',1,'Mia');
`);

/* Ein Kind, das auf den Test-Wörtern gelernt hat: es sitzt in einer
   Aufgabe, hat einen Karteikasten, eine Insel mit der Liste darauf
   und ein Langzeit-Fach. Genau das, was beim Löschen mitgehen muss. */
const wort = (await one(
  `select id from vocab_items where set_id = $1 order by sort_order limit 1`, [TEST1])).id;
const lerner = (await one(`select wi_solo_create() l`)).l.id
  || (await one(`select id from wi_solo_learners order by created_at desc limit 1`)).id;

await db.exec(`
  select wi_ensure_board('${RAUM}');
  -- Der Raum hat BEIDES gewählt: die alte Testliste und eine Station
  -- aus dem Buch. Nur so zeigt sich hinterher, dass die Löschung die
  -- Auswahl nicht einfach leerräumt.
  insert into wi_room_sets (room_id, set_id) values ('${RAUM}','${TEST1}')
    on conflict do nothing;
  insert into wi_players (participant_id, room_id, team_index, current_item, current_dir)
    values ('${KIND}','${RAUM}', 0, '${wort}', 'de_en');
  insert into vocab_progress (participant_id, item_id, dir, box, seen)
    values ('${KIND}','${wort}','de_en', 2, 5);
  insert into wi_solo_sets (learner_id, set_id, from_room)
    values ('${lerner}','${TEST1}','${RAUM}');
  insert into wi_solo_progress (learner_id, item_id, dir, box, seen)
    values ('${lerner}','${wort}','de_en', 3, 9);
  insert into wi_round_words (room_id, item_id) values ('${RAUM}','${wort}')
    on conflict do nothing;
  update wi_solo_learners set current_item = '${wort}', current_dir = 'de_en'
   where id = '${lerner}';
`);

const vorher = {
  sets:   await zahl(`select count(*) from wi_room_sets where room_id = '${RAUM}'`),
  solo:   await zahl(`select count(*) from wi_solo_sets where learner_id = '${lerner}'`),
  kasten: await zahl(`select count(*) from vocab_progress where participant_id = '${KIND}'`),
  fach:   await zahl(`select count(*) from wi_solo_progress where learner_id = '${lerner}'`)
};
ok('Ausgangslage: das Kind hat auf den Test-Wörtern gelernt',
   vorher.sets === 2 && vorher.solo === 1 && vorher.kasten === 1 && vorher.fach === 1,
   JSON.stringify(vorher));

/* ══ Jetzt wird gelöscht ═══════════════════════════════════════ */
await run(mig('0161_vocab_test_units_out.sql'), '0161');
await run(mig('0161_vocab_test_units_out.sql'), '0161 (zweiter Lauf)');
console.log('— 0161 läuft zweimal durch —\n');

/* ══ 1) Weg ist weg ════════════════════════════════════════════ */
ok('die drei Test-Listen sind weg',
   await zahl(`select count(*) from vocab_sets where id in (
     '${TEST1}','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003')`) === 0);
ok('ihr Dach ist weg',
   await zahl(`select count(*) from vocab_units where id = '${DACH}'`) === 0);
ok('ihre 90 Wörter sind weg',
   await zahl(`select count(*) from vocab_items where id = '${wort}'`) === 0);
ok('keine leere mitgelieferte Unit bleibt übrig',
   await zahl(`select count(*) from vocab_units u where u.owner_id is null
                and not exists (select 1 from vocab_sets s where s.unit_id = u.id)`) === 0);

/* ══ 2) Was daran hing, geht mit ═══════════════════════════════ */
ok('der Karteikasten des Kindes ist mit weg',
   await zahl(`select count(*) from vocab_progress where participant_id = '${KIND}'`) === 0);
ok('sein Langzeit-Fach auf der Insel auch',
   await zahl(`select count(*) from wi_solo_progress where learner_id = '${lerner}'`) === 0);
ok('die Freischaltung auf seiner Insel auch',
   await zahl(`select count(*) from wi_solo_sets where learner_id = '${lerner}'`) === 0);
ok('die Testliste ist aus der Auswahl des alten Raums verschwunden',
   await zahl(`select count(*) from wi_room_sets
                where room_id = '${RAUM}' and set_id = '${TEST1}'`) === 0);
/* Die Gegenprobe, und die ist die wichtigere: eine Lehrkraft, die
   morgen früh ihren Raum aufmacht, findet ihre Auswahl aus dem Buch
   noch vor. Gelöscht wird eine Liste und nicht eine Einstellung. */
ok('… ihre Station aus dem Buch aber nicht',
   await zahl(`select count(*) from wi_room_sets where room_id = '${RAUM}'`) === 1);
ok('die Strichliste der Runde auch',
   await zahl(`select count(*) from wi_round_words where room_id = '${RAUM}'`) === 0);

/* ══ 3) Die laufende Aufgabe zerreißt nicht ════════════════════ */
/* `on delete set null` statt cascade — sonst verschwände mitten in
   der Stunde das KIND aus dem Spiel und nicht nur seine Frage. */
ok('das Kind ist noch im Spiel',
   await zahl(`select count(*) from wi_players where participant_id = '${KIND}'`) === 1);
ok('… nur seine laufende Aufgabe ist null',
   (await one(`select current_item from wi_players where participant_id = '${KIND}'`)).current_item === null);
ok('dasselbe auf der eigenen Insel',
   (await one(`select current_item from wi_solo_learners where id = '${lerner}'`)).current_item === null);

/* ══ 4) Green Line bleibt ══════════════════════════════════════ */
ok('neun Kapitel stehen noch',
   await zahl(`select count(*) from vocab_units where grade = 5`) === 9);
ok('33 Stationen', await zahl(`select count(*) from vocab_sets`) === 33);
ok('907 Wortpaare', await zahl(`select count(*) from vocab_items`) === 907,
   String(await zahl(`select count(*) from vocab_items`)));
ok('und das Pult sieht genau diese 33',
   (await one(`select vocab_sets_list() v`)).v.sets.length === 33);

/* ══ 5) Eine leere Insel rechnet weiter ════════════════════════ */
const blick = (await one(`select wi_solo_open(null) v`)).v;
ok('wi_solo_open kommt ohne ein einziges Wort zurecht', blick.ok === true,
   JSON.stringify(blick).slice(0, 100));
const player = (await one(
  `select wi_solo_level_refresh('${lerner}') v`)).v;
ok('… und die Stufenrechnung teilt nicht durch null',
   player && typeof player === 'object', JSON.stringify(player).slice(0, 80));

/* ══ 6) Ein neuer Raum ═════════════════════════════════════════ */
await db.exec(`
  insert into skill_rooms (id, code, owner_id, school_id, title)
  values ('f0000000-0000-4000-8000-0000000000aa','NEUAAA','${L}','${SCHULE}','Neuer Raum');
  select wi_ensure_board('f0000000-0000-4000-8000-0000000000aa');`);
const drin = await one(`
  select u.title utitle, s.title from wi_room_sets r
    join vocab_sets s on s.id = r.set_id
    left join vocab_units u on u.id = s.unit_id
   where r.room_id = 'f0000000-0000-4000-8000-0000000000aa'`);
ok('ein neuer Raum startet mit Hello! · Check-in',
   drin && drin.utitle === 'Hello! (Grundschulübergang)' && drin.title === 'Check-in',
   drin ? drin.utitle + ' · ' + drin.title : 'nichts');

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
