/* Prüfstand für Migration 0166 — die Insel aus dem Nebel-Anteil.
   Echt gerechnet in pglite, Stubs wie in 0136…0165.

   Zweistufig: erst laufen 0130…0158 und 0165 (dort gilt noch
   „1,6 Felder je Kind und Minute"), dann kommt 0166 obendrauf.

   Die Kernzusage ist keine Feldzahl, sondern ein VERHÄLTNIS: die
   Insel hat so viele Felder, wie in einem Drittel der Runde
   Antworten fallen. Dieselbe Zusage gilt für 8 wie für 30 Kinder und
   für 5 wie für 20 Minuten — Kinder und Minuten kürzen sich aus der
   Rechnung heraus. Genau das wird hier geprüft und nicht „146".

   ⚠️ Der Umriss ist gewürfelt: eine einzelne Insel schwankt um
   mehrere Prozent. Gemessen wird der MITTELWERT aus vielen Würfen.

   Die Zusagen im Einzelnen:
     1. Der Nebel ist nach rund einem Drittel der Runde weg — bei
        jeder Kinderzahl und jeder Dauer.
     2. Die Insel ist deutlich kleiner als vorher (die Testrunde mit
        22 Kindern über 10 Minuten: rund 400 → rund 146).
     3. Doppelte Zeit = doppelte Insel, doppelt so viele Kinder =
        doppelte Insel. Linear, nicht nur „größer".
     4. ⚠️ Die Zahl der VÖLKER ändert die Größe nicht. Sie geht nur
        in den Mindestabstand der Landeplätze ein.
     5. Der Boden von 80 Feldern greift bei kleinen Runden, der
        Deckel greift praktisch nie mehr.
     6. Die Insel bleibt eine Insel: ein Landeplatz je Volk, alles
        hängt zusammen, das Raster schneidet nichts ab.
     7. Eine Klassenrunde trägt zwei Arenen, zwei Licht- und zwei
        Schattentempel (Schwelle 140 statt 320) und ingesamt rund
        einen Ort je zehn bis fünfzehn Felder.
     8. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0166_wordisland_island_size.mjs  */
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
  token text unique, seat int not null, name text, blocked boolean not null default false,
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
const all = async (sql, params) => (await db.query(sql, params)).rows;
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

const BIS_0165 = [
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
  '0165_wordisland_ruins_balance.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0165) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0158 + 0165 laufen durch —\n');

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

const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE, [schule], 4, 900, 'de_en', 'type']);

const WUERFE = 7;
const baue = async (teams, leute, min) =>
  n((await one(`select wi_build_island($1,$2,$3,$4) v`, [ROOM, teams, leute, min * 60])).v);
const mittel = async (teams, leute, min) => {
  let s = 0;
  for (let i = 0; i < WUERFE; i++) s += await baue(teams, leute, min);
  return s / WUERFE;
};

/* Sönkes Testrunde: 22 Kinder, vier Völker, zehn Minuten. */
const KLASSE = [4, 22, 10];

/* ══ Stufe 1: die Welt vor 0166 ════════════════════════════════ */
const vorher = await mittel(...KLASSE);
console.log(`  vorher:  22 Kinder × 10 min → ${vorher.toFixed(0)} Felder\n`);

/* ══ Stufe 2: 0166 ═════════════════════════════════════════════ */
await run(mig('0166_wordisland_island_size.sql'), '0166');
console.log('— 0166 läuft durch —\n');

const nachher = await mittel(...KLASSE);
console.log(`  nachher: 22 Kinder × 10 min → ${nachher.toFixed(0)} Felder\n`);

/* ── 1) Der Nebel-Anteil ─────────────────────────────────────
   DIE Zusage. „Antworten in der Runde" ist Kinder × 2 × Minuten
   (c_antworten in der Migration); ein Drittel davon soll die Insel
   groß sein. Geprüft wird über mehrere Klassengrößen und Dauern —
   erst das belegt, dass sich Kinder und Minuten wirklich
   herauskürzen und die Zahl nicht zufällig für einen Fall passt. */
const ANTW = 2.0;
for (const [leute, min] of [[22, 10], [30, 10], [24, 20], [16, 15], [30, 20]]) {
  const f = await mittel(4, leute, min);
  const antworten = leute * ANTW * min;
  const anteil = f / antworten;
  ok(`${leute} Kinder × ${min} min: Nebel nach rund einem Drittel weg`,
     anteil > 0.28 && anteil < 0.39,
     `${f.toFixed(0)} Felder von ${antworten} Antworten = ${(anteil * 100).toFixed(0)} %`);
}

/* ── 2) Die Testrunde selbst ─────────────────────────────────── */
ok('Sönkes Runde: aus rund 400 Feldern werden rund 150',
   nachher > 130 && nachher < 170 && nachher < vorher * 0.45,
   `${vorher.toFixed(0)} → ${nachher.toFixed(0)}`);

/* ── 3) Linear in beiden Richtungen ──────────────────────────── */
const a = await mittel(4, 24, 10);
const b = await mittel(4, 24, 20);
const c = await mittel(4, 12, 20);
ok('doppelte Zeit, doppelte Insel',
   b / a > 1.85 && b / a < 2.15, `${a.toFixed(0)} → ${b.toFixed(0)}`);
ok('halb so viele Kinder, halbe Insel',
   c / b > 0.45 && c / b < 0.55, `${b.toFixed(0)} → ${c.toFixed(0)}`);

/* ── 4) ⚠️ Die Völker ändern nichts ──────────────────────────
   Sönkes Vermutung vom 22.09.2026 („ich dachte, es ist an der Zahl
   der Teams gemessen") — sie ist es nicht, und das soll so bleiben:
   ein Volk ist keine Arbeitsmenge, es sind dieselben Kinder in
   anderen Gruppen. Ohne diese Zusage fällt es niemandem auf, wenn
   jemand p_teams in die Rechnung zieht. */
const zwei = await mittel(2, 22, 10);
const acht = await mittel(8, 22, 10);
ok('zwei Völker bekommen dieselbe Insel wie acht',
   Math.abs(zwei - acht) / zwei < 0.12,
   `${zwei.toFixed(0)} · ${acht.toFixed(0)}`);
ok('… und beide haben je Volk genau einen Landeplatz',
   n((await one(`select count(*)::int c from wi_tiles where room_id=$1 and is_home`, [ROOM])).c) === 8);

/* ── 5) Boden und Deckel ─────────────────────────────────────── */
const klein = await mittel(4, 4, 5);
ok('kleine Runden fallen auf den Boden von 80 Feldern',
   klein > 70 && klein < 100, klein.toFixed(0));
const gross = await mittel(6, 30, 20);
ok('und der Deckel greift nicht mehr (30 Kinder × 20 min)',
   gross < 500, gross.toFixed(0));

/* ── 6) Die Insel ist eine Insel ─────────────────────────────── */
const zahl = await baue(...KLASSE);
ok('jedes Volk hat genau einen Landeplatz',
   n((await one(`select count(*)::int c from wi_tiles where room_id=$1 and is_home`, [ROOM])).c) === 4);
const zusammen = n((await one(`
  with recursive start as (select r, c from wi_tiles where room_id=$1 order by r, c limit 1),
  flut as (
    select r, c from start
    union
    select t.r, t.c from wi_tiles t join flut f
      on t.room_id=$1 and exists (select 1 from wi_neighbors(f.r, f.c) x
                                   where x.r=t.r and x.c=t.c)
  )
  select count(*)::int c from flut`, [ROOM])).c);
ok('alle Felder hängen zusammen', zusammen === zahl, `${zusammen} von ${zahl}`);
const oben = n((await one(`
  select count(*) filter (where r = (select min(r) from wi_tiles where room_id=$1))::int o
    from wi_tiles where room_id=$1`, [ROOM])).o);
ok('die oberste Zeile ist eine Kuppe und keine Kante',
   oben < Math.sqrt(zahl) / 2, `${oben} Felder`);

/* ── 7) Die Orte ─────────────────────────────────────────────── */
const orte = async () => {
  const rows = await all(`select ruin_kind k, count(*)::int c from wi_tiles
                           where room_id=$1 and ruin_kind is not null group by 1`, [ROOM]);
  const o = { _: 0 };
  for (const r of rows) { o[r.k] = n(r.c); o._ += n(r.c); }
  return o;
};
const o1 = await orte();
ok('die Klassenrunde trägt jede große Art zweimal (Schwelle 140)',
   o1.arena === 2 && o1.licht === 2 && o1.schatten === 2,
   JSON.stringify(o1));
ok('dazu je vier Tore und Klos',
   o1.tor === 4 && o1.klo === 4, JSON.stringify(o1));
ok('macht rund einen Ort je zehn bis fünfzehn Felder',
   zahl / o1._ > 8 && zahl / o1._ < 16, (zahl / o1._).toFixed(1));

const kleinN = await baue(4, 4, 5);
const o2 = await orte();
ok('auf der kleinsten Insel bleibt es bei je einem großen Ort',
   o2.arena === 1 && o2.licht === 1 && o2.schatten === 1,
   `${kleinN} Felder · ${JSON.stringify(o2)}`);

/* Die Abstände halten auch bei vierzehn Orten auf 146 Feldern. */
await baue(...KLASSE);
const engste = n((await one(
  `select coalesce(min(wi_tile_gap(a.r,a.c,b.r,b.c)),9)::real g
     from wi_tiles a join wi_tiles b
       on b.room_id=a.room_id and (b.r,b.c) <> (a.r,a.c) and b.ruin_kind is not null
    where a.room_id=$1 and a.ruin_kind is not null`, [ROOM])).g);
ok('keine zwei Orte liegen näher als zwei Felder beieinander',
   engste >= 1.99, engste.toFixed(2));

/* ── 8) Zweimal einspielen ───────────────────────────────────── */
await run(mig('0166_wordisland_island_size.sql'), '0166 (zweites Mal)');
const nochmal = await mittel(...KLASSE);
ok('die Migration läuft zweimal und baut danach dieselbe Größe',
   Math.abs(nochmal - nachher) / nachher < 0.15,
   `${nachher.toFixed(0)} → ${nochmal.toFixed(0)}`);

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
