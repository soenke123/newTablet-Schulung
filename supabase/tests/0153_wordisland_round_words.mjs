/* Prüfstand für Migration 0153 — „Diese Wörter" heißt: die Wörter
   DIESER Runde. Echt gerechnet in pglite, Stubs wie in 0136…0152.

   Zweistufig: erst laufen 0130…0152 — dort summiert wi_hard_words den
   Karteikasten des ganzen Raums, und ein Wort aus Runde 1 steht nach
   Runde 2 immer noch da —, dann kommt 0153 obendrauf. Das ist genau
   Sönkes Meldung („hier stehen seit Tagen die gleichen Worte"), und
   sie ist nur belegt, wenn beide Fassungen gelaufen sind.

   Die Kernzusagen:
     1. VOR 0153 trägt die Auswertung der ZWEITEN Runde das Wort, das
        in der ERSTEN danebenging.
     2. NACH 0153 nicht mehr: die Liste zeigt nur die laufende Runde.
     3. Ein Start leert die Strichliste.
     4. Ein Wort, für das zweimal getippt wurde (Tippen → Auswahl),
        zählt EINEN Strich — wie in 0138.
     5. Zweimal dasselbe Wort gerissen = wrong 2.
     6. Üben zwischen zwei Runden (phase <> running) zählt nicht mit.
     7. `scope` sagt 'round'.
     8. Der Deckel von 20 nimmt die HÄUFIGSTEN zwanzig, nicht
        zwanzig beliebige (der Fehler aus 0131).
     9. Der Karteikasten (vocab_progress) bleibt unangetastet.
    10. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0153_wordisland_round_words.mjs */
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
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
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

const BIS_0152 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql', '0150_vocab_units.sql',
  '0151_wordisland_choice_streak_lock.sql', '0152_wordisland_blocked_out.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0152) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0152 laufen durch —\n');

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
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,4) g;
`);

/* Seit 0150 heißen die Stationen „Station n — …". */
const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE, [schule], 4, 900, 'de_en', 'type']);

const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;

const starte = async () => {
  await one(`select wi_room_start($1) v`, [CODE]);
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id='${ROOM}'`);
  await one(`select wi_view($1, true) v`, ['tok1']);   // countdown → running
};
const zurLobby = async () => {
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '2 seconds'
                  where room_id='${ROOM}' and phase = 'countdown'`);
  await one(`select wi_room_get($1, false) v`, [CODE]);
  await db.exec(`update wi_boards set ends_at = now() - interval '1 second'
                  where room_id='${ROOM}' and phase = 'running'`);
  await one(`select wi_room_get($1, false) v`, [CODE]);
  return one(`select wi_room_to_lobby($1) v`, [CODE]);
};

const spieler = () => one(
  `select current_item i, current_dir d, current_stage s from wi_players
    where participant_id = $1`, [P1]);
const loesung = async (p) => (await one(`select (vocab_answers($1,$2))[1] a`, [p.i, p.d])).a;
const frei = () => db.exec(
  `update wi_players set lock_until = null, q_shown_at = now() - interval '1 minute'
    where participant_id = '${P1}';
   update wi_tiles set updated_at = now() - interval '10 seconds' where room_id = '${ROOM}'`);
const sende = async (text) => { await frei(); return (await one(`select wi_answer($1,$2) v`, ['tok1', text])).v; };

/* Eine ganze falsche Antwort. Im Tipp-Modus sind das ZWEI Aufrufe:
   der erste landet in der Zwischenstufe (acht Vorschläge), erst der
   zweite ist entschieden. Genau daran hängt Zusage 4. */
const daneben = async () => {
  const wort = (await one(`select term from vocab_items i
     join wi_players w on w.current_item = i.id where w.participant_id = $1`, [P1])).term;
  let a = await sende('qqqqzzzz');
  if (a.result === 'spell' || a.result === 'choice') a = await sende('qqqqzzzz');
  return wort;
};
const richtig = async () => {
  const p = await spieler();
  return sende(await loesung(p));
};
const hart = async () => (await one(`select wi_hard_words($1) v`, [CODE])).v;
const woerter = (h) => (h.words || []).map(w => w.term);

/* ══ Stufe 1: die Welt vor 0153 ════════════════════════════════ */
await starte();
const rundeEins = await daneben();
const h1 = await hart();
ok('vor 0153: das gerissene Wort steht in der Auswertung',
   woerter(h1).includes(rundeEins), woerter(h1).join(', '));

await zurLobby();
await starte();
await richtig();                       // Runde 2 läuft sauber
const h2 = await hart();
ok('vor 0153: es steht auch noch in der Auswertung der ZWEITEN Runde — Sönkes Meldung',
   woerter(h2).includes(rundeEins), woerter(h2).join(', '));

/* ══ Stufe 2: 0153 ═════════════════════════════════════════════ */
await run(mig('0153_wordisland_round_words.sql'), '0153');
console.log('\n— 0153 läuft durch —\n');

const h3 = await hart();
ok('nach 0153 sagt die Antwort, worüber gezählt wurde',
   h3.scope === 'round', String(h3.scope));
ok('nach 0153 ist die laufende Runde leer — es ging noch nichts daneben',
   (h3.words || []).length === 0, woerter(h3).join(', '));

/* ── Ein Fehler in dieser Runde ───────────────────────────────── */
const jetzt = await daneben();
const h4 = await hart();
ok('das Wort dieser Runde steht drin', woerter(h4).includes(jetzt), woerter(h4).join(', '));
ok('das Wort der ERSTEN Runde nicht mehr',
   !woerter(h4).includes(rundeEins) || rundeEins === jetzt,
   `alt=${rundeEins} neu=${jetzt}`);

const strich = await one(
  `select seen, wrong from wi_round_words rw join vocab_items i on i.id = rw.item_id
    where rw.room_id = $1 and i.term = $2`, [ROOM, jetzt]);
ok('eine Aufgabe = EIN Strich, auch wenn zweimal getippt wurde',
   n(strich.seen) === 1 && n(strich.wrong) === 1,
   `seen=${strich.seen} wrong=${strich.wrong}`);

/* ── Zweimal dasselbe Wort reißen ─────────────────────────────── */
let nochmal = null;
for (let i = 0; i < 40 && nochmal !== jetzt; i++) {
  const w = (await one(`select term from vocab_items i
     join wi_players w on w.current_item = i.id where w.participant_id = $1`, [P1])).term;
  if (w === jetzt) { nochmal = await daneben(); break; }
  await richtig();
}
if (nochmal === jetzt) {
  const s2 = await one(
    `select wrong from wi_round_words rw join vocab_items i on i.id = rw.item_id
      where rw.room_id = $1 and i.term = $2`, [ROOM, jetzt]);
  ok('zweimal gerissen = wrong 2', n(s2.wrong) === 2, `wrong=${s2.wrong}`);
} else {
  ok('zweimal gerissen = wrong 2', false, '(das Wort kam nicht wieder — Beutel zu groß?)');
}

/* ── Üben zwischen zwei Runden zählt nicht ────────────────────── */
await zurLobby();
/* wi_room_to_lobby räumt die laufende Aufgabe ab (0134). Die
   Einzelübung holt sie sich beim nächsten Abruf wieder — ohne diese
   Zeile stünde hier gar kein Wort, und der Prüfstand zerbräche an
   seiner eigenen Hilfsabfrage statt etwas zu prüfen. */
await one(`select wi_view($1, false) v`, ['tok1']);
const vorUeben = n((await one(`select count(*) k from wi_round_words where room_id=$1`, [ROOM])).k);
await daneben();                       // phase = 'lobby' → v_solo
const nachUeben = n((await one(`select count(*) k from wi_round_words where room_id=$1`, [ROOM])).k);
ok('Üben zwischen zwei Runden geht NICHT in die Auswertung der Runde',
   vorUeben === nachUeben, `${vorUeben} → ${nachUeben}`);
ok('… wohl aber in den Karteikasten',
   n((await one(`select count(*) k from vocab_progress where participant_id=$1`, [P1])).k) > 0);

/* ── Der Start leert die Strichliste ──────────────────────────── */
await starte();
ok('ein neuer Start leert die Strichliste',
   n((await one(`select count(*) k from wi_round_words where room_id=$1`, [ROOM])).k) === 0);

/* ── Der Deckel nimmt die HÄUFIGSTEN zwanzig ──────────────────
   25 erfundene Wörter mit absteigender Fehlerzahl. Vor dem Fix stand
   `limit 20` ohne order by in der inneren Abfrage — dann kamen
   zwanzig beliebige heraus, und „am häufigsten" war geraten. */
await db.exec(`
  insert into vocab_items (set_id, term, translation, sort_order)
  select '${schule}', 'Testwort ' || lpad(g::text, 2, '0'), 'testword ' || g, 900 + g
    from generate_series(1, 25) g;
  insert into wi_round_words (room_id, item_id, seen, wrong)
  select '${ROOM}', i.id, 30, 30 - (i.sort_order - 900)
    from vocab_items i where i.set_id = '${schule}' and i.sort_order > 900;
`);
const h5 = await hart();
ok('der Deckel liefert genau zwanzig', (h5.words || []).length === 20,
   String((h5.words || []).length));
ok('… und zwar die mit den meisten Fehlern (29 … 10)',
   n(h5.words[0].wrong) === 29 && n(h5.words[19].wrong) === 10,
   `${h5.words[0].wrong} … ${h5.words[19].wrong}`);
ok('… absteigend sortiert',
   h5.words.every((w, i) => i === 0 || n(h5.words[i - 1].wrong) >= n(w.wrong)));

/* ── Zweimal ──────────────────────────────────────────────────── */
await run(mig('0153_wordisland_round_words.sql'), '0153 (zweiter Lauf)');
ok('die Migration läuft zweimal', true);

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
