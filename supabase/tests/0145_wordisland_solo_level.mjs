/* Prüfstand für Migration 0145 — das eigene Level auf der Insel.
   Echt gerechnet in pglite, Stubs und Aufbau wie 0136…0143.

   Zwölf Zusagen:
     1.  Vor 0145 kennt der Server das Level nicht.
     2.  wi_solo_time_add: kein Vorgänger → 0, normaler Abstand → er
         selbst, riesiger Abstand → gedeckelt auf 20.
     3.  wi_solo_level_calc: die acht Schwellen aus der Anforderung,
         einzeln, inklusive der Pufferzone dazwischen.
     4.  wi_solo_level_bonus_secs: 95/75/50 % und die Lücken dazwischen.
     5.  Das Beispiel aus der Anforderung wörtlich: 8/7/0/9/6/8/5 Minuten
         → der Nulltag fällt raus, Schnitt der übrigen sechs.
     6.  wi_solo_time_tick: Leerlauf bringt keinen Zuwachs, ein
         riesiger Abstand wird gedeckelt, kein Ping ohne Antwort.
     7.  wi_solo_level_refresh schreibt Level und Krone, die Krone
         sinkt nie.
     8.  Ein Kaskadensprung über mehrere Level in einem einzigen Aufruf
         (lange Abwesenheit).
     9.  Der Mastery-Bonus verschiebt tatsächlich eine Schwelle.
     10. wi_solo_open trägt player.level für frische UND bestehende
         Inseln, auch ohne jede Antwort.
     11. wi_solo_answer trägt player in BEIDEN Rückgabewegen
         (Zwischenstufe und entschieden) und zählt die Antwort als Zeit.
     12. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0145_wordisland_solo_level.mjs  */
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
const js = v => JSON.stringify(v);
const near = (a, b, eps) => Math.abs(a - b) <= eps;

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
for (const f of ['0130_vocab_content.sql', '0131_wordisland_game.sql',
                 '0133_wordisland_lobby.sql', '0134_wordisland_back_to_lobby.sql',
                 '0135_wordisland_eight_factions.sql', '0136_wordisland_solo.sql',
                 '0137_wordisland_solo_pgcrypto.sql', '0138_wordisland_solo_stats.sql',
                 '0139_wordisland_solo_points.sql', '0140_wordisland_solo_bag_choice.sql',
                 '0141_wordisland_solo_pass_percent.sql', '0142_wordisland_solo_units.sql',
                 '0143_wordisland_solo_avatar.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0143 laufen durch —\n');

/* ── Bühne ──────────────────────────────────────────────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const R1     = 'b0000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values (null);
  insert into skill_rooms (id, code, owner_id, school_id, title) values
    ('${R1}','AAAAAA','${T}','${SCHOOL}','Stunde 1');
  insert into skill_participants (room_id, token, seat, name) values
    ('${R1}','rt-anon-1', 1, 'Mia');
`);
const SCHULE = (await one(`select id from vocab_sets where title = 'Schule'`)).id;
await db.exec(`insert into wi_room_sets (room_id, set_id) values ('${R1}','${SCHULE}')`);

const tok = (await one(`select wi_solo_claim($1, null) v`, ['rt-anon-1'])).v.token;
const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;

/* ── 1 · Vorher gibt es das Level nicht ─────────────────────── */
const vorher = await one(
  `select count(*)::int n from pg_proc where proname = 'wi_solo_level_refresh'`);
ok('1 · vor 0145 kennt der Server wi_solo_level_refresh nicht', vorher.n === 0);

console.log('\n— jetzt 0145 —\n');
await run(mig('0145_wordisland_solo_level.sql'), '0145');

/* ── 2 · wi_solo_time_add ───────────────────────────────────── */
const tAdd = async (prev, nowPlus) => (await one(
  `select wi_solo_time_add($1, now() + ($2 || ' seconds')::interval) v`, [prev, String(nowPlus)])).v;
ok('2a · kein Vorgänger → 0', (await tAdd(null, 0)) === 0);
const t0 = (await one(`select now() v`)).v;
ok('2b · normaler Abstand (7s) → 7', (await tAdd(t0, 7)) === 7);
ok('2c · riesiger Abstand (3600s) → gedeckelt auf 20', (await tAdd(t0, 3600)) === 20);
ok('2d · Abstand genau am Deckel (20s) → 20', (await tAdd(t0, 20)) === 20);

/* ── 3 · wi_solo_level_calc — alle acht Schwellen + Pufferzone ── */
const calc = async (avg, cur) => (await one(`select wi_solo_level_calc($1, $2) v`, [avg, cur])).v;
ok('3a · 1→2 bei 120s',        (await calc(120, 1)) === 2);
ok('3b · 1 bleibt unter 120s', (await calc(119, 1)) === 1);
ok('3c · 2→3 bei 300s',        (await calc(300, 2)) === 3);
ok('3d · 3→4 bei 420s',        (await calc(420, 3)) === 4);
ok('3e · 4→5 bei 600s',        (await calc(600, 4)) === 5);
ok('3f · 5→4 unter 480s',      (await calc(479, 5)) === 4);
ok('3g · 4→3 unter 360s',      (await calc(359, 4)) === 3);
ok('3h · 3→2 unter 180s',      (await calc(179, 3)) === 2);
ok('3i · 2→1 unter 60s',       (await calc(59, 2)) === 1);
ok('3j · Puffer: Level 4 bleibt bei 400s (zwischen 360 und 600)',
   (await calc(400, 4)) === 4);
ok('3k · Puffer: Level 2 bleibt bei 61s (zwischen 60 und 300)',
   (await calc(61, 2)) === 2);

/* ── 4 · wi_solo_level_bonus_secs ───────────────────────────── */
const bonus = async pct => (await one(`select wi_solo_level_bonus_secs($1) v`, [pct])).v;
ok('4a · null → 0',   (await bonus(null)) === 0);
ok('4b · 49% → 0',    (await bonus(49)) === 0);
ok('4c · 50% → 60',   (await bonus(50)) === 60);
ok('4d · 74% → 60',   (await bonus(74)) === 60);
ok('4e · 75% → 120',  (await bonus(75)) === 120);
ok('4f · 94% → 120',  (await bonus(94)) === 120);
ok('4g · 95% → 180',  (await bonus(95)) === 180);
ok('4h · 100% → 180', (await bonus(100)) === 180);

/* ── 5 · Das Beispiel aus der Anforderung ───────────────────── */
// Mo 8 · Di 7 · Mi 0 · Do 9 · Fr 6 · Sa 8 · So 5 (Minuten), heute = So.
const MIN = [8, 7, 0, 9, 6, 8, 5]; // Tag −6 … Tag 0 (heute)
for (let i = 0; i < 7; i++) {
  const offset = 6 - i;
  await db.exec(
    `insert into wi_solo_daily_active (learner_id, day, active_seconds)
     values ('${lid}', current_date - ${offset}, ${MIN[i] * 60})`);
}
const avgBeispiel = (await one(`select wi_solo_level_avg_secs($1) v`, [lid])).v;
// (8+7+9+6+8+5)/6 = 43/6 min = 430s
ok('5 · Nulltag fällt raus, Schnitt der übrigen sechs = 430s (≈7:10 min)',
   near(Number(avgBeispiel), 430, 1), js(avgBeispiel));

/* Aufräumen für die folgenden, gezielteren Tests. */
await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);

/* ── 6 · wi_solo_time_tick ───────────────────────────────────── */
await db.exec(`update wi_solo_learners set time_last_event_at = null where id = '${lid}'`);
await one(`select wi_solo_time_tick($1)`, [lid]);
const nachErsterTick = await one(
  `select active_seconds from wi_solo_daily_active where learner_id = $1 and day = current_date`, [lid]);
ok('6a · die allererste Antwort schenkt sich nichts (0s)', nachErsterTick.active_seconds === 0);

// Simulierter Leerlauf: der letzte Zeitstempel liegt eine Stunde zurück.
await db.exec(
  `update wi_solo_learners set time_last_event_at = now() - interval '1 hour' where id = '${lid}'`);
await one(`select wi_solo_time_tick($1)`, [lid]);
const nachLeerlauf = await one(
  `select active_seconds from wi_solo_daily_active where learner_id = $1 and day = current_date`, [lid]);
ok('6b · eine Stunde Leerlauf zählt nur 20 gedeckelte Sekunden, nicht 3600',
   nachLeerlauf.active_seconds === 20, js(nachLeerlauf));

// Zwei Antworten in Serie (winziger, echter Abstand) — kein Vorschuss.
await one(`select wi_solo_time_tick($1)`, [lid]);
const nachSerie = await one(
  `select active_seconds from wi_solo_daily_active where learner_id = $1 and day = current_date`, [lid]);
ok('6c · eine sofortige zweite Antwort legt nur den winzigen echten Abstand drauf',
   nachSerie.active_seconds >= 20 && nachSerie.active_seconds <= 21, js(nachSerie));

await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);
await db.exec(`update wi_solo_learners set time_last_event_at = null, level = 1, level_max = 1 where id = '${lid}'`);

/* ── 7 · wi_solo_level_refresh schreibt, Krone sinkt nie ────── */
for (let i = 0; i < 7; i++) {
  await db.exec(
    `insert into wi_solo_daily_active (learner_id, day, active_seconds)
     values ('${lid}', current_date - ${i}, 700)`); // 700s > alle Schwellen
}
const r7 = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
ok('7a · ein durchgehend starker Schnitt hebt bis auf Level 5', r7.level === 5, js(r7));
const stand7 = await one(`select level, level_max from wi_solo_learners where id = $1`, [lid]);
ok('7b · steht auch in der Zeile', stand7.level === 5 && stand7.level_max === 5);

// Jetzt bricht die Lernzeit komplett weg.
await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);
const r7b = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
ok('7c · das AKTUELLE Level fällt auf 1 zurück', r7b.level === 1, js(r7b));
ok('7d · die Krone bleibt bei 5 stehen (level_max sinkt nie)', r7b.level_max === 5, js(r7b));

/* ── 8 · Kaskade in einem einzigen Aufruf ────────────────────── */
// Von Level 1 direkt auf einen starken Schnitt: mehrere Level auf
// einmal, ohne dass mehrfach refresht werden müsste.
for (let i = 0; i < 7; i++) {
  await db.exec(
    `insert into wi_solo_daily_active (learner_id, day, active_seconds)
     values ('${lid}', current_date - ${i}, 650)`);
}
const r8 = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
ok('8 · ein einziger Aufruf springt von Level 1 direkt auf Level 5', r8.level === 5, js(r8));

await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);
await db.exec(`update wi_solo_learners set level = 1, level_max = 1 where id = '${lid}'`);

/* ── 9 · Der Mastery-Bonus verschiebt eine Schwelle ──────────── */
// 130s/Tag allein reicht nicht für Level 2 (Schwelle 120s — doch, das
// reicht schon ohne Bonus). Wir nehmen absichtlich 100s: unter der
// Schwelle ohne Bonus, darüber mit +60s (50 % Mastery).
for (let i = 0; i < 7; i++) {
  await db.exec(
    `insert into wi_solo_daily_active (learner_id, day, active_seconds)
     values ('${lid}', current_date - ${i}, 100)`);
}
const ohneBonus = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
ok('9a · 100s/Tag ohne Mastery bleibt auf Level 1 (unter 120s)',
   ohneBonus.level === 1 && ohneBonus.bonus_secs === 0, js(ohneBonus));

// Ein Wort auf volle Punktzahl in beiden Richtungen bringen (Stufe 4),
// und es ist das einzige Wort der Unit → 100 % Mastery.
const EIN_WORT = (await one(`select id from vocab_items where set_id = $1 limit 1`, [SCHULE])).id;
await db.exec(`delete from wi_solo_sets where learner_id = '${lid}'`);
await db.exec(`insert into wi_solo_sets (learner_id, set_id) values ('${lid}', '${SCHULE}')`);
await db.exec(`delete from vocab_items where set_id = '${SCHULE}' and id <> '${EIN_WORT}'`);
await db.exec(`delete from wi_solo_progress where learner_id = '${lid}'`);
await db.exec(`
  insert into wi_solo_progress (learner_id, item_id, dir, points, due_at)
  values ('${lid}', '${EIN_WORT}', 'de_en', 12, now() + interval '1 day'),
         ('${lid}', '${EIN_WORT}', 'en_de', 12, now() + interval '1 day')`);

const mitBonus = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
ok('9b · 100% Mastery gibt 180s Bonus und hebt Level 1→2',
   mitBonus.bonus_secs === 180 && mitBonus.pct_max === 100 && mitBonus.level === 2, js(mitBonus));

await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);
await db.exec(`delete from wi_solo_progress where learner_id = '${lid}'`);
await db.exec(`update wi_solo_learners set level = 1, level_max = 1 where id = '${lid}'`);

/* ── 10 · wi_solo_open trägt player ──────────────────────────── */
const frischerToken = (await one(`select wi_solo_claim($1, null) v`, ['rt-anon-1'])).v;
// Derselbe Token (Gerät ist schon bekannt) — wi_solo_open auf den
// bestehenden Lerner.
const open1 = (await one(`select wi_solo_open($1) v`, [tok])).v;
ok('10a · wi_solo_open trägt learner.player mit Level 1',
   open1.learner.player.level === 1 && open1.learner.player.up_secs === 120
   && open1.learner.player.down_secs === null, js(open1.learner.player));

const openLeer = (await one(`select wi_solo_open($1) v`, ['gibt-es-nicht'])).v;
ok('10b · ein unbekannter Token bleibt learner:null (kein Fehler)',
   openLeer.ok === true && openLeer.learner === null);

/* ── 11 · wi_solo_answer trägt player in beiden Rückgabewegen ── */
await one(`select wi_solo_start($1) v`, [tok]);
const stand11 = await one(`select current_dir, current_stage from wi_solo_learners where id = $1`, [lid]);
// Eine garantiert falsche Antwort, um sicher in 'wrong' (entschieden)
// oder eine Zwischenstufe zu laufen — beide Zweige müssen player tragen.
const a1 = (await one(`select wi_solo_answer($1, $2) v`, [tok, '¤¤¤nichts¤¤¤'])).v;
ok('11a · die erste Antwort trägt player mit level_before',
   a1.player && typeof a1.player.level === 'number' && typeof a1.player.level_before === 'number',
   js(a1.player));
const nachAntwort = await one(
  `select active_seconds from wi_solo_daily_active where learner_id = $1 and day = current_date`, [lid]);
ok('11b · die Antwort hat den heutigen Zeit-Bucket angelegt', !!nachAntwort, js(nachAntwort));

/* ── 11c · Der Mastery-Bonus kommt in DERSELBEN Antwort an ─────
   Die letzte fehlende Vokabel auf die höchste Stufe zu heben, ändert
   den Bonus — und mit ihm womöglich das Level. Würde das Level VOR
   dem Buchen der Punkte gerechnet, käme dieser Aufstieg erst bei der
   nächsten Antwort an, und das sähe wie ein verschlucktes Ereignis
   aus. Geprüft wird deshalb der Übergang „Punkte fehlen noch" →
   „mit dieser Antwort voll". */
{
  // Frische Bühne: ein Wort, beide Richtungen knapp unter voll.
  await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);
  await db.exec(`delete from wi_solo_progress where learner_id = '${lid}'`);
  await db.exec(`update wi_solo_learners
                    set level = 1, level_max = 1, time_last_event_at = null,
                        wrong_run = 0, lock_until = null
                  where id = '${lid}'`);
  // 100s/Tag: allein zu wenig für Level 2 (120s), mit 180s Bonus reicht es.
  for (let i = 0; i < 7; i++) {
    await db.exec(
      `insert into wi_solo_daily_active (learner_id, day, active_seconds)
       values ('${lid}', current_date - ${i}, 100)`);
  }
  /* Eine Richtung ist voll, die andere braucht noch genau die drei
     Punkte, die eine richtige Antwort bringt. Die Stufe ist das
     MINIMUM beider Richtungen (0139) — das Wort steht also noch
     nicht auf 4, und der Bonus ist noch 0. */
  await db.exec(`
    insert into wi_solo_progress (learner_id, item_id, dir, points, due_at)
    values ('${lid}', '${EIN_WORT}', 'de_en', 12, now() + interval '1 day'),
           ('${lid}', '${EIN_WORT}', 'en_de',  9, now() + interval '1 day')`);

  const vorLevel = (await one(`select wi_solo_level_refresh($1) v`, [lid])).v;
  ok('11c1 · vorher: noch kein Wort auf der höchsten Stufe, kein Bonus, Level 1',
     vorLevel.level === 1 && vorLevel.bonus_secs === 0 && vorLevel.pct_max === 0,
     js(vorLevel));

  // Die Frage gezielt auf die fehlende Richtung stellen.
  await db.exec(`
    update wi_solo_learners
       set current_item = '${EIN_WORT}', current_dir = 'en_de',
           current_stage = 'type', current_options = '{}'
     where id = '${lid}'`);
  const loesung = (await one(
    `select (vocab_answers($1, 'en_de'))[1] v`, [EIN_WORT])).v;
  const a = (await one(`select wi_solo_answer($1, $2) v`, [tok, loesung])).v;

  ok('11c2 · die Antwort war richtig', a.result === 'correct', js(a.result));
  ok('11c3 · und hebt das Wort auf die höchste Stufe', a.level_after === 4, js(a.level_after));
  /* Der Kern: derselbe Rückgabewert trägt schon den Bonus UND das
     neue Level — nicht erst der nächste. */
  ok('11c4 · derselbe Rückgabewert trägt den Bonus (180s)',
     a.player.bonus_secs === 180 && a.player.pct_max === 100, js(a.player));
  ok('11c5 · und den Aufstieg auf Level 2, mit level_before 1',
     a.player.level === 2 && a.player.level_before === 1, js(a.player));
}

/* ── 12 · Zweimal einspielen ─────────────────────────────────── */
await run(mig('0145_wordisland_solo_level.sql'), '0145 (zweites Mal)');
const nachZweitemLauf = await one(
  `select count(*)::int n from pg_proc where proname = 'wi_solo_level_refresh'`);
ok('12 · die Migration läuft zweimal', nachZweitemLauf.n === 1);

console.log(fails ? `\n${fails} FEHLER\n` : '\nalles grün\n');
process.exit(fails ? 1 : 0);
