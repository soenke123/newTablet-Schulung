/* Prüfstand für Migration 0147 — der Tag beginnt in Berlin.

   Der Fehler war kein Rechenfehler, sondern ein Zeitzonenfehler:
   geschrieben wurde auf den Berliner Kalendertag, gelesen mit
   `current_date` — und das ist der Tag der SITZUNG (bei Supabase
   UTC). Zwischen Mitternacht und 2 Uhr unserer Zeit liegen die
   beiden einen Tag auseinander, und genau dann stand im
   Balkendiagramm noch Sonntag.

   ── Wie man das prüft, ohne bis Mitternacht zu warten ──────────
   Nicht die Uhr wird gestellt, sondern die Zeitzone der Sitzung.
   Zwei Extreme reichen:

     Etc/GMT+12  = UTC−12, also 14 Stunden HINTER Berlin
     Etc/GMT-12  = UTC+12, also 10 Stunden VOR Berlin

   Eine der beiden steht zu JEDEM Zeitpunkt auf einem anderen
   Kalendertag als Berlin (ist es in Berlin vor 14 Uhr, die erste;
   danach die zweite). Der Prüfstand sucht sich deshalb nicht die
   passende aus — er verlangt von BEIDEN dasselbe Ergebnis. Was in
   beiden Extremen stimmt, stimmt auch in den zwei Stunden, um die
   es wirklich geht.

   Sechs Zusagen:
     1. Vor 0147 kennt der Server wi_solo_today nicht.
     2. Es GIBT die Abweichung: in mindestens einer der beiden
        Zeitzonen ist current_date ≠ wi_solo_today(). Ohne diesen
        Nachweis prüften die folgenden Zusagen ins Leere.
     3. wi_solo_today() ist in jeder Sitzungszeitzone derselbe Tag.
     4. Schreiben und Lesen meinen denselben Tag: was
        wi_solo_time_tick verbucht, sieht wi_solo_level_avg_secs —
        in jeder Zeitzone.
     5. Das Balkendiagramm endet auf dem heutigen Tag (der letzte
        Balken ist der, den das Gerät hervorhebt) und hat sieben
        Einträge — in jeder Zeitzone.
     6. Die alte Fassung wäre hier durchgefallen (Gegenprobe mit
        dem Rumpf aus 0145), und die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0147_wordisland_solo_day_berlin.mjs  */
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
                 '0143_wordisland_solo_avatar.sql', '0145_wordisland_solo_level.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0145 laufen durch —\n');

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

/* Die zwei Extreme. Zu jedem Zeitpunkt steht mindestens eine davon
   auf einem anderen Kalendertag als Berlin — welche, hängt von der
   Uhrzeit ab, und genau deshalb werden beide geprüft. */
const ZONEN = ['UTC', 'Etc/GMT+12', 'Etc/GMT-12'];
const inZone = async (tz, sql, params) => {
  await db.exec(`set timezone = '${tz}'`);
  return one(sql, params);
};

/* ── 1 · Vorher gibt es wi_solo_today nicht ─────────────────── */
ok('1 · vor 0147 kennt der Server wi_solo_today nicht',
   (await one(`select count(*)::int n from pg_proc where proname = 'wi_solo_today'`)).n === 0);

/* ── 6a · Gegenprobe: die ALTE Fassung, unter eigenem Namen ───
   Wörtlich der Rumpf aus 0145 (mit current_date). Sie bleibt
   stehen und wird am Ende gegen die neue gehalten — ein Prüfstand,
   der nur zeigt, dass die neue Fassung richtig rechnet, sagt
   nichts darüber, ob die alte falsch lag. */
await run(`
  create or replace function wi_solo_avg_alt_0145(p_learner uuid)
    returns numeric stable set search_path = public language sql as $$
    with days as (
      select gs::date as day, coalesce(a.active_seconds, 0) as secs
        from generate_series(current_date - 6, current_date, interval '1 day') gs
        left join wi_solo_daily_active a
               on a.learner_id = p_learner and a.day = gs::date
    ), ranked as (
      select secs, row_number() over (order by secs asc, day asc) as rn from days
    )
    select coalesce(avg(secs) filter (where rn > 1), 0) from ranked;
  $$;`, 'Gegenprobe 0145');

console.log('\n— jetzt 0147 —\n');
await run(mig('0147_wordisland_solo_day_berlin.sql'), '0147');

/* ── 2 · Die Abweichung gibt es wirklich ────────────────────── */
const abw = [];
for (const tz of ZONEN) {
  const r = await inZone(tz, `select current_date::text c, wi_solo_today()::text b`);
  if (r.c !== r.b) abw.push(`${tz}: ${r.c} ≠ ${r.b}`);
}
ok('2 · in mindestens einer Sitzungszeitzone ist current_date ≠ wi_solo_today()',
   abw.length > 0, abw.join(' | ') || 'nirgends — der Prüfstand liefe ins Leere');

/* ── 3 · wi_solo_today ist überall derselbe Tag ─────────────── */
const tage = [];
for (const tz of ZONEN) {
  tage.push((await inZone(tz, `select wi_solo_today()::text v`)).v);
}
ok('3 · wi_solo_today() liefert in jeder Sitzungszeitzone denselben Tag',
   new Set(tage).size === 1, js(tage));
const HEUTE = tage[0];

/* ── 4 · Schreiben und Lesen meinen denselben Tag ───────────── */
for (const tz of ZONEN) {
  await db.exec(`set timezone = '${tz}'`);
  await db.exec(`delete from wi_solo_daily_active where learner_id = '${lid}'`);

  /* Eine Antwort verbuchen — genau wie wi_solo_answer es tut: erst
     ein Vorgänger-Zeitpunkt, dann der Tick, der den Abstand
     verbucht (10 Sekunden, unter dem Deckel von 20). */
  await db.exec(`
    update wi_solo_learners set time_last_event_at = now() - interval '10 seconds'
     where id = '${lid}'`);
  await db.exec(`select wi_solo_time_tick('${lid}')`);

  const zeile = await one(
    `select day::text d, active_seconds s from wi_solo_daily_active where learner_id = $1`, [lid]);
  ok(`4a · [${tz}] die Zeile steht auf dem Berliner Tag`,
     zeile && zeile.d === HEUTE, js(zeile));

  /* Der Kern. 10 Sekunden auf einem von sieben Tagen, der
     schwächste fällt heraus → 10/6 Sekunden Schnitt. Sieht die
     Rechnung den Tag NICHT, kommt 0 heraus. */
  const avg = (await one(`select wi_solo_level_avg_secs($1)::float8 v`, [lid])).v;
  ok(`4b · [${tz}] der Schnitt sieht die eben verbuchte Zeit`,
     Math.abs(avg - 10 / 6) < 0.001, `avg=${avg}`);
}

/* ── 5 · Das Balkendiagramm endet heute ─────────────────────── */
for (const tz of ZONEN) {
  const h = (await inZone(tz, `select wi_solo_level_history($1) v`, [tok])).v;
  ok(`5a · [${tz}] sieben Balken`, h.ok === true && h.days.length === 7, js(h.days && h.days.length));
  const letzter = h.days[h.days.length - 1];
  /* Der Client hebt den LETZTEN Balken als „heute" hervor
     (ladeVolkHistorie in tool.js). Steht dort gestern, leuchtet
     der falsche Wochentag — genau Sönkes Befund. */
  ok(`5b · [${tz}] der letzte Balken ist heute`, letzter.day === HEUTE,
     `${letzter.day} statt ${HEUTE}`);
  ok(`5c · [${tz}] und trägt die verbuchte Zeit`, letzter.secs === 10, js(letzter));
  ok(`5d · [${tz}] „Tage dabei" ist mindestens 1`,
     h.totals.total_days >= 1, js(h.totals));
}

/* ── 6b · Die alte Fassung wäre hier durchgefallen ───────────── */
const altFehler = [];
for (const tz of ZONEN) {
  const r = await inZone(tz,
    `select wi_solo_avg_alt_0145($1)::float8 a, wi_solo_level_avg_secs($1)::float8 n`, [lid]);
  if (Math.abs(r.a - r.n) > 0.001) altFehler.push(`${tz}: alt=${r.a} neu=${r.n}`);
}
ok('6b · die alte Fassung (current_date) rechnet in mindestens einer Zeitzone anders',
   altFehler.length > 0, altFehler.join(' | ') || 'kein Unterschied — Zusage 2 nachsehen');

/* ── 6c · Zweimal einspielen ─────────────────────────────────── */
await db.exec(`set timezone = 'UTC'`);
await run(mig('0147_wordisland_solo_day_berlin.sql'), '0147 (zweites Mal)');
ok('6c · die Migration läuft zweimal',
   (await one(`select count(*)::int n from pg_proc where proname = 'wi_solo_today'`)).n === 1);

console.log(fails ? `\n${fails} FEHLER\n` : '\nalles grün\n');
process.exit(fails ? 1 : 0);
