/* Prüfstand für Migration 0158 — „wi_view zurückholen".
   Echt gerechnet in pglite, Stubs wie in 0136…0154.

   Zweistufig wie 0152: erst laufen 0130…0157 — dort FEHLEN die
   Felder, das ist Sönkes Meldung („die Farben waren am Tablet und am
   Beamer unterschiedlich") —, dann kommt 0158 obendrauf. Nur so ist
   der Verlust belegt und nicht bloß behauptet.

   Der Prüfstand ist absichtlich stumpf gebaut: er vergleicht die
   SCHLÜSSELMENGE von wi_view mit einer Liste, statt einzelne Werte
   abzufragen. Genau das hätte 0157 gefangen — dort ist kein Wert
   falsch gerechnet worden, es sind Felder weggefallen.

   Die Kernzusagen:
     1. VOR 0158 fehlen wi_view acht Felder, darunter `factions`.
        Das ist die Ursache der verschiedenen Farben.
     2. NACH 0158 sind alle wieder da — und `sets_changed_at`, der
        eigentliche Zweck von 0157, steht daneben.
     3. `factions` am Tablet ist dieselbe Liste wie am Pult
        (wi_room_get). Das ist die Meldung, wörtlich geprüft.
     4. Der blocked-Riegel greift wieder: ein stillgelegtes Tablet
        bekommt 'blocked', und die eigene Gruppe enthält keine.
     5. streak_goals hängt am Modus (tippen 3/12, auswählen 5/20).
     6. ruins/hearts/shadow_pick stehen wieder in der Antwort.
     7. NEU: wi_teams_json liefert `correct` je Volk — die Summe der
        richtigen Antworten des ganzen Volkes, ohne Stillgelegte.
     8. `score` und die anderen Zahlen sind davon unberührt.
     9. Die Migration läuft zweimal (Idempotenz).

   Aufruf:  node supabase/tests/0158_wordisland_view_restore.mjs */
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

const BIS_0157 = [
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
  '0157_wordisland_sets_push.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0157) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0157 laufen durch —\n');

/* ── Ein Raum mit 8 Kindern und vier Völkern ─────────────────── */
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

/* ⚠️ Seit 0150 heißen die Stationen „Station 1 — Schule" statt
   „Schule" (0154er Prüfstand, gleiche Falle). */
const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
const setze = (modus = 'type') => one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
                                      [CODE, [schule], 4, 900, 'de_en', modus]);
await setze();

/* Die Völker sind ABSICHTLICH nicht 0,1,2,3: genau daran hängt die
   Meldung. Solange die Lehrkraft die ersten vier nimmt, fällt das
   fehlende `factions` nicht auf — der Rückfall im Gerät (Volk = Slot)
   trifft dann zufällig das Richtige. */
const VOELKER = [2, 5, 6, 7];
await one(`select wi_room_set_factions($1, $2::jsonb) v`, [CODE, JSON.stringify(VOELKER)]);

const sicht  = async (tok = 'tok1') => (await one(`select wi_view($1, false) v`, [tok])).v;
const pult   = async () => (await one(`select wi_room_get($1, false) v`, [CODE])).v;
const teams  = async (k = 4) => (await one(`select wi_teams_json($1, $2) v`, [ROOM, k])).v;

/* Die Felder, die wi_view seit 0152 zusagt, plus sets_changed_at aus
   0157. Sie stehen hier als LISTE und nicht als Einzelabfragen: ein
   weggefallenes Feld ist genau der Fehler, den 0157 gemacht hat. */
const PFLICHT = [
  'ok', 'role', 'phase', 'mode', 'streak_goals', 'teams', 'team_count',
  'factions', 'map_key', 'map', 'own', 'ruins', 'hearts', 'ends_at',
  'countdown_ends_at', 'winner_team', 'my_team_members', 'online_count',
  'room_total', 'sets_changed_at', 'me'
];
const fehlend = v => PFLICHT.filter(k => !(k in v));

/* ══ Stufe 1: die Welt nach 0157 ═══════════════════════════════
   Acht Felder sind weg — und damit stimmen die Farben nicht. */
const vorher = await sicht();
const weg = fehlend(vorher);
ok('vor 0158: wi_view fehlen Felder',
   weg.length > 0, weg.join(', '));
ok('vor 0158: darunter `factions` — das sind die falschen Farben',
   weg.includes('factions'));
ok('vor 0158: auch ruins/hearts fehlen',
   weg.includes('ruins') && weg.includes('hearts'));
ok('vor 0158: sets_changed_at ist da (der Zweck von 0157)',
   'sets_changed_at' in vorher);

/* ══ Stufe 2: 0158 ═════════════════════════════════════════════ */
await run(mig('0158_wordisland_view_restore.sql'), '0158');
console.log('\n— 0158 läuft durch —\n');

const jetzt = await sicht();
ok('nach 0158: wi_view liefert alle zugesagten Felder',
   fehlend(jetzt).length === 0, fehlend(jetzt).join(', ') || '—');
ok('nach 0158: sets_changed_at steht weiterhin da (0157 bleibt erhalten)',
   'sets_changed_at' in jetzt);

/* ── 3) Die Meldung selbst: dieselben Farben auf beiden Seiten ── */
const amPult   = (await pult()).factions.map(n);
const amTablet = jetzt.factions.map(n);
ok('nach 0158: `factions` am Tablet = `factions` am Pult',
   JSON.stringify(amPult) === JSON.stringify(amTablet),
   `Pult ${amPult.join(',')} · Tablet ${amTablet.join(',')}`);
ok('nach 0158: und es sind die gewählten Völker, nicht 0,1,2,3',
   JSON.stringify(amTablet) === JSON.stringify(VOELKER), amTablet.join(','));
ok('nach 0158: team_count kommt mit', n(jetzt.team_count) === 4);

/* ── 4) streak_goals hängt am Modus (0151) ──────────────────── */
ok('nach 0158: tippen → 3/12',
   n(jetzt.streak_goals.step) === 3 && n(jetzt.streak_goals.big) === 12,
   JSON.stringify(jetzt.streak_goals));
await setze('choice');
const imWahl = await sicht();
ok('nach 0158: auswählen → 5/20',
   n(imWahl.streak_goals.step) === 5 && n(imWahl.streak_goals.big) === 20,
   JSON.stringify(imWahl.streak_goals));
await setze('type');

/* ── 5) ruins/hearts/shadow_pick (0146) ─────────────────────────
   Ab hier läuft eine Runde. Der Start muss VOR dem blocked-Riegel
   stehen: wi_room_start ist die Stelle, die die Völker verteilt —
   ohne ihn hat noch niemand eine wi_players-Zeile, und eine Gruppe
   ohne Mitglieder beweist nichts über das Aussortieren. */
await one(`select wi_room_start($1) v`, [CODE]);
const imSpiel = await sicht();
ok('nach 0158: ruins ist eine Zeichenkette über alle Felder',
   typeof imSpiel.ruins === 'string' && imSpiel.ruins.length > 0,
   `${imSpiel.ruins.length} Zeichen`);
ok('nach 0158: hearts genauso lang wie ruins',
   typeof imSpiel.hearts === 'string' && imSpiel.hearts.length === imSpiel.ruins.length,
   `${imSpiel.hearts.length} Zeichen`);
ok('nach 0158: me.shadow_pick steht in der Antwort',
   'shadow_pick' in imSpiel.me, String(imSpiel.me.shadow_pick));

/* ── 6) Der blocked-Riegel (0152) ───────────────────────────── */
await db.exec(`update skill_participants set blocked = true, blocked_at = now()
                where token = 'tok8'`);
const gesperrt = (await one(`select wi_view($1, false) v`, ['tok8'])).v;
ok('nach 0158: ein stillgelegtes Tablet bekommt „blocked"',
   gesperrt.ok === false && gesperrt.error === 'blocked',
   JSON.stringify(gesperrt.error));

/* Wessen Gruppe ist tok8? Die eigene Gruppenliste eines Kindes aus
   demselben Volk darf es nicht mehr nennen. */
const volk8 = (await one(
  `select w.team_index from wi_players w
     join skill_participants p on p.id = w.participant_id
    where p.token = 'tok8'`)).team_index;
const kollege = (await one(
  `select p.token from wi_players w
     join skill_participants p on p.id = w.participant_id
    where w.team_index = $1 and p.token <> 'tok8' limit 1`, [volk8]));
if (kollege) {
  const mit = (await sicht(kollege.token)).my_team_members.map(m => m.name);
  ok('nach 0158: die eigene Gruppe nennt das stillgelegte Kind nicht',
     !mit.includes('Kind 8'), mit.join(' · '));
} else {
  ok('nach 0158: die eigene Gruppe nennt das stillgelegte Kind nicht',
     true, '(allein im Volk — nichts zu prüfen)');
}
await db.exec(`update skill_participants set blocked = false, blocked_at = null
                where token = 'tok8'`);

/* ── 7) NEU: correct je Volk ────────────────────────────────── */
const t0 = await teams();
ok('nach 0158: jedes Volk trägt ein `correct`',
   t0.every(t => 'correct' in t), JSON.stringify(t0.map(t => t.correct)));
ok('nach 0158: zu Beginn steht es überall auf 0',
   t0.every(t => n(t.correct) === 0));

/* Zwei Kinder aus verschiedenen Völkern bekommen Treffer. Direkt in
   wi_players geschrieben und nicht über wi_answer: geprüft wird die
   SUMMENBILDUNG in wi_teams_json, nicht der Antwortweg. */
const wer = await all(
  `select p.token, w.team_index from wi_players w
     join skill_participants p on p.id = w.participant_id
    order by w.team_index, p.seat`);
const ersterAus = k => wer.find(r => n(r.team_index) === k);
const a = ersterAus(0), b = ersterAus(1), c = wer.filter(r => n(r.team_index) === 0)[1];
await db.exec(`update wi_players set correct_count = 5 where participant_id =
  (select id from skill_participants where token = '${a.token}')`);
if (c) await db.exec(`update wi_players set correct_count = 3 where participant_id =
  (select id from skill_participants where token = '${c.token}')`);
await db.exec(`update wi_players set correct_count = 9 where participant_id =
  (select id from skill_participants where token = '${b.token}')`);

const t1 = await teams();
ok('nach 0158: `correct` summiert das ganze Volk',
   n(t1[0].correct) === (c ? 8 : 5), `Volk 0 = ${t1[0].correct}`);
ok('nach 0158: und trennt die Völker sauber',
   n(t1[1].correct) === 9, `Volk 1 = ${t1[1].correct}`);

/* Ein stillgelegtes Kind zählt auch hier nicht mit (0152). */
await db.exec(`update skill_participants set blocked = true, blocked_at = now()
                where token = '${b.token}'`);
const t2 = await teams();
ok('nach 0158: ein stillgelegtes Kind bringt keine Treffer ein',
   n(t2[1].correct) === 0, `Volk 1 = ${t2[1].correct}`);
await db.exec(`update skill_participants set blocked = false, blocked_at = null
                where token = '${b.token}'`);

/* ── 8) Die alten Zahlen sind unberührt ─────────────────────── */
const t3 = await teams();
ok('nach 0158: score = tiles + ruins, wie seit 0146',
   t3.every(t => n(t.score) === n(t.tiles) + n(t.ruins)),
   t3.map(t => `${t.tiles}+${t.ruins}=${t.score}`).join(' · '));
ok('nach 0158: die Kopfzahlen stehen weiter',
   t3.reduce((s, t) => s + n(t.people), 0) === 8,
   t3.map(t => t.people).join('+'));

/* ── 9) Idempotenz ──────────────────────────────────────────── */
await run(mig('0158_wordisland_view_restore.sql'), '0158 (zweiter Lauf)');
const nochmal = await sicht();
ok('die Migration läuft zweimal', fehlend(nochmal).length === 0,
   fehlend(nochmal).join(', ') || '—');

console.log(`\n${fails === 0 ? 'ALLES GRÜN' : fails + ' FEHLER'}`);
process.exit(fails === 0 ? 0 : 1);
