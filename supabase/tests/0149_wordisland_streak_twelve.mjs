/* Prüfstand für Migration 0149 — „jede vierte Serie zählt doppelt".
   Echt gerechnet in pglite, Stubs wie in 0136…0148.

   Zweistufig wie 0140/0141/0142/0146/0148: erst laufen 0130…0148 —
   dort bringt AUCH die zwölfte Serie nur eine Wahl —, dann kommt 0149
   obendrauf. Nur so ist der Unterschied belegt und nicht bloß
   behauptet: dieselbe Antwortfolge muss vorher anders ausgehen als
   nachher.

   Die Kernzusage in einem Satz: zwölf richtige Antworten am Stück
   bringen VORHER vier Wahlen und NACHHER fünf — und die vier
   Zwischenstufen (3, 6, 9) bleiben dabei unverändert bei einer.

   Die Zusagen im Einzelnen:
     1. VOR 0149 bringt die zwölfte Antwort eine Wahl wie jede dritte.
     2. NACH 0149 bringt sie zwei — und nur sie.
     3. Die Antworten dazwischen bringen weiterhin gar keine und
        nehmen weiter Land (0148 bleibt unangetastet).
     4. Der Deckel hält bei sechs, auch beim doppelten Schritt.
     5. Ein Fehler setzt Serie und Wahlen auf null; der Takt beginnt
        danach wieder bei 1 — und der Zwölferschritt mit ihm.
     6. Mit Hilfe richtig zählt nicht für die Serie: 0 % 12 darf
        keine zwei Wahlen schenken.
     7. Beim ÜBEN gibt es weder Wahl noch Feld.
     8. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0149_wordisland_streak_twelve.mjs  */
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
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
/* ⚠️ In SCHEMA extensions — siehe 0136/0137. */
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
const n = v => Number(v);

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

const BIS_0148 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0148) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0148 laufen durch —\n');

/* ── Ein Raum mit 8 Kindern und vier Völkern, Modus „tippen" ──
   Der Modus muss ausdrücklich 'type' sein: die Serie zählt nur sofort
   richtige Antworten IM TIPP-MODUS, im Auswahl-Modus wäre sie dauerhaft
   null und der Prüfstand grün, ohne je etwas zu prüfen. */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const ROOM   = 'b0000000-0000-4000-8000-000000000001';
const CODE   = 'ABCDEF';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,8) g;
`);

const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE, [schule], 4, 900, 'de_en', 'type']);

const starte = async () => {
  await one(`select wi_room_start($1) v`, [CODE]);
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id='${ROOM}'`);
  await one(`select wi_view($1, true) v`, ['tok1']);   // countdown → running
};
await starte();

/* ── Das Werkzeug ────────────────────────────────────────────
   Wörtlich aus 0148: Lösung VOR der Antwort lesen, Sperren
   zurückdrehen, den Rückgabewert lesen und nicht die Tabelle — das
   ist die Zahl, die im Gerät ankommt. */
const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;
const spieler = async () => one(
  `select streak, picks, current_item i, current_dir d, current_stage s, team_index
     from wi_players where participant_id = $1`, [P1]);
const loesung = async (p) => (await one(`select (vocab_answers($1,$2))[1] a`, [p.i, p.d])).a;
const antworte = async (text) => {
  await db.exec(`update wi_players set lock_until = null where participant_id = '${P1}'`);
  await db.exec(`update wi_tiles set updated_at = now() - interval '10 seconds'
                  where room_id = '${ROOM}'`);
  return (await one(`select wi_answer($1,$2) v`, ['tok1', text])).v;
};
const richtig = async () => antworte(await loesung(await spieler()));
const meine = async () => n((await one(
  `select count(*) k from wi_tiles where room_id=$1 and owner_team=$2`,
  [ROOM, (await spieler()).team_index])).k);
const zurueck = () => db.exec(
  `update wi_players set streak = 0, picks = 0 where participant_id = '${P1}'`);

/* ZWÖLF richtige Antworten am Stück, und nach jeder: wie viele Wahlen
   hat das Kind jetzt? Zwölf und nicht neun — bei neun käme der
   zweite Schlag des Taktes gar nicht vor, und der Prüfstand wäre vor
   wie nach 0149 derselbe. */
const zwoelfmal = async () => {
  await zurueck();
  const spur = [];
  for (let i = 0; i < 12; i++) {
    const a = await richtig();
    if (a.result !== 'correct') { spur.push('?'); continue; }
    spur.push(n(a.picks));
  }
  return spur;
};

/* ══ Stufe 1: die Welt vor 0149 ════════════════════════════════ */
const vorher = await zwoelfmal();
ok('vor 0149: der Takt steht (3, 6, 9 → je eine Wahl)',
   vorher[2] === 1 && vorher[5] === 2 && vorher[8] === 3, vorher.join(' '));
ok('vor 0149: auch die ZWÖLFTE bringt nur eine — das ist die Meldung',
   vorher[11] === 4, vorher.join(' '));

/* ══ Stufe 2: 0149 ═════════════════════════════════════════════ */
await run(mig('0149_wordisland_streak_twelve.sql'), '0149');
console.log('\n— 0149 läuft durch —\n');

const nachher = await zwoelfmal();
ok('nach 0149: die zwölfte Antwort bringt ZWEI Wahlen auf einmal',
   nachher[11] === 5 && nachher[10] === 3, nachher.join(' '));
ok('nach 0149: 3, 6 und 9 bringen weiter je eine',
   nachher[2] === 1 && nachher[5] === 2 && nachher[8] === 3, nachher.join(' '));
ok('nach 0149: die acht dazwischen bringen keine',
   [0, 1].every(i => nachher[i] === 0) &&
   [3, 4].every(i => nachher[i] === 1) &&
   [6, 7].every(i => nachher[i] === 2) &&
   [9, 10].every(i => nachher[i] === 3), nachher.join(' '));

/* Der Unterschied in einer Zeile — genau das, was Sönke gemeldet hat. */
ok('zwölf richtige: vorher vier Wahlen, nachher fünf',
   vorher[11] === 4 && nachher[11] === 5, `${vorher[11]} → ${nachher[11]}`);

/* Eine Antwort ohne Wahl darf weiter nicht folgenlos sein: 0148 bleibt
   unangetastet, sie nimmt ein zufälliges Nachbarfeld. */
await zurueck();
const vorFeld = await meine();
const a1 = await richtig();
const a2 = await richtig();
ok('nach 0149: die beiden ersten Antworten nehmen Land', !!a1.tile && !!a2.tile,
   JSON.stringify(a1.tile));
const a3 = await richtig();
ok('nach 0149: Antwort 3 nimmt KEIN Feld, sondern die Wahl',
   !a3.tile && n(a3.picks) === 1, `tile=${JSON.stringify(a3.tile)} picks=${a3.picks}`);
ok('nach 0149: zwei Felder sind dazugekommen', (await meine()) >= vorFeld + 2,
   `${vorFeld} → ${await meine()}`);

/* Der Deckel: er gilt auch für den doppelten Schritt. Mit fünf
   offenen Wahlen in die zwölfte Serie → sechs und nicht sieben. */
await db.exec(`update wi_players set streak = 11, picks = 5 where participant_id = '${P1}'`);
const gedeckelt = await richtig();
ok('der Deckel hält bei sechs, auch beim Zwölferschritt',
   n(gedeckelt.picks) === 6, `5 → ${gedeckelt.picks}`);
await db.exec(`update wi_players set streak = 11, picks = 2 where participant_id = '${P1}'`);
const gewachsen = await richtig();
ok('zwei offene Wahlen + Serie 12 = vier', n(gewachsen.picks) === 4,
   `2 → ${gewachsen.picks}`);

/* Ein Fehler setzt beides auf null — und damit beginnt auch der
   Zwölferschritt wieder von vorn. */
await zurueck();
await richtig(); await richtig();
const daneben = await antworte('zzzzzzzzzz');       // → Auswahl
ok('daneben → Auswahl', daneben.result === 'choice', daneben.result);
const falsch = await antworte('immer-noch-falsch'); // → entschieden falsch
ok('Fehler setzt Serie und Wahlen auf null',
   n(falsch.streak) === 0 && n(falsch.picks) === 0,
   `streak=${falsch.streak} picks=${falsch.picks}`);

/* ⚠️ Die Falle der Migration: mit Hilfe richtig setzt die Serie auf
   null, und `0 % 12` ist 0. Ohne `streak > 0` schenkte ausgerechnet
   diese Antwort ZWEI Wahlen. */
await zurueck();
await richtig(); await richtig();
const p = await spieler();
const sol = await loesung(p);
await antworte('zzzzzzzzzz');                        // Auswahl geht auf
const ausWahl = await antworte(sol);                 // richtig, aber mit Hilfe
ok('mit Hilfe richtig: keine Wahl, auch keine doppelte',
   ausWahl.result === 'correct' && n(ausWahl.streak) === 0 && n(ausWahl.picks) === 0,
   `${ausWahl.result} streak=${ausWahl.streak} picks=${ausWahl.picks}`);

/* Beim ÜBEN (die Runde läuft nicht) gibt es weder Feld noch Wahl.
   Genommen wird dafür die abgelaufene Runde und nicht der Weg über
   wi_room_to_lobby: der räumt current_item mit ab (0134), und dann
   antwortet das Kind ins Leere (`not_found`) — der Block wäre grün,
   ohne je einen Takt geprüft zu haben. */
await db.exec(`update wi_boards set ends_at = now() - interval '1 second'
                where room_id = '${ROOM}'`);
await one(`select wi_view($1) v`, ['tok1']);
ok('die Runde ist vorbei',
   (await one(`select phase from wi_boards where room_id=$1`, [ROOM])).phase === 'ended',
   (await one(`select phase from wi_boards where room_id=$1`, [ROOM])).phase);
await zurueck();
await db.exec(`update wi_players set streak = 11 where participant_id = '${P1}'`);
const uebt = await richtig();
ok('beim Üben bringt auch die zwölfte Serie nichts',
   !uebt.tile && n(uebt.picks) === 0 && n(uebt.streak) === 12,
   `tile=${JSON.stringify(uebt.tile)} picks=${uebt.picks} streak=${uebt.streak}`);

/* ── Zweimal laufen lassen ──────────────────────────────────── */
await run(mig('0149_wordisland_streak_twelve.sql'), '0149 (2. Lauf)');
await starte();
const nochmal = await zwoelfmal();
ok('0149 läuft zweimal und ändert nichts',
   nochmal[2] === 1 && nochmal[8] === 3 && nochmal[11] === 5, nochmal.join(' '));

console.log(`\n${fails ? fails + ' FEHLER' : 'alles grün'}`);
process.exit(fails ? 1 : 0);
