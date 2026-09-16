/* Prüfstand für Migration 0151 — „Serie im Auswahl-Modus" + die
   Antwort-Sperre von Mathoria. Echt gerechnet in pglite, Stubs wie in
   0136…0149.

   Zweistufig wie 0140/0141/0142/0146/0148/0149: erst laufen
   0130…0149 — dort steht die Serie im Auswahl-Modus dauerhaft auf
   null —, dann kommt 0151 obendrauf. Nur so ist der Unterschied
   belegt und nicht bloß behauptet.

   Die Kernzusagen:
     1. VOR 0151 bringen zwanzig richtige Antworten im Auswahl-Modus
        NULL Serie und NULL Wahlen. Das ist Sönkes Meldung.
     2. NACH 0151 zählt die Serie dort mit, und der Takt ist 5/20:
        die 5., 10. und 15. Antwort bringen je eine Wahl, die 20.
        bringt zwei.
     3. Der TIPP-Modus bleibt bei 3/12 — 0148/0149 unangetastet.
     4. wi_streak_goals ist die einzige Quelle, und `big` ist in
        beiden Modi ein Vielfaches von `step` (sonst fiele der große
        Schlag auf eine Antwort ohne Wahl).
     5. Ein Fehler im Auswahl-Modus setzt Serie und Wahlen auf null.
     6. Die Sperre misst TEMPO, nicht Fehler: eine bedachte falsche
        Antwort kostet gar nichts (vorher 2 s), eine schnelle erst ab
        dem dritten Mal — dann 1, 2, 3, 4, 5, 5 Sekunden.
     7. Eine bedachte Antwort löscht den Zähler, eine schnelle
        RICHTIGE lässt ihn stehen.
     8. Ein Tipp WÄHREND der Sperre wird abgewiesen und zählt nicht
        als Fehlversuch.
     9. Die Uhr der neuen Aufgabe beginnt erst, wenn die Sperre
        abgelaufen ist.
    10. Die Zwischenstufe im Tipp-Modus (acht Vorschläge) startet
        eine neue Uhr — sonst führe die Sperre dort nie.
    11. wi_view reicht streak_goals durch.
    12. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0151_wordisland_choice_streak_lock.mjs */
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

const BIS_0149 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0149) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0149 laufen durch —\n');

/* ── Ein Raum mit 8 Kindern und vier Völkern, Modus „auswählen" ──
   Genau der Modus, um den es geht: hier stand die Serie bisher still. */
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
const setze = (mode) => one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
                            [CODE, [schule], 4, 900, 'de_en', mode]);
await setze('choice');

const starte = async () => {
  await one(`select wi_room_start($1) v`, [CODE]);
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id='${ROOM}'`);
  await one(`select wi_view($1, true) v`, ['tok1']);   // countdown → running
};
await starte();

/* ── Das Werkzeug ────────────────────────────────────────────
   Wörtlich aus 0148/0149, mit einem Zusatz: `antworte` darf die
   Sperre NICHT blind wegräumen, sobald sie der Gegenstand der
   Prüfung ist. Deshalb zwei Wege — `antworte` (ohne Sperre, für den
   Serien-Teil) und `roh` (mit allem, für den Sperr-Teil). */
const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;
/* ⚠️ OHNE q_shown_at — die Spalte gibt es in Stufe 1 noch nicht, und
   ein Prüfstand, der an seiner eigenen Hilfsabfrage zerbricht, prüft
   die erste Hälfte gar nicht. Für die Uhr gibt es `uhr()` weiter
   unten, und die wird erst nach 0151 gerufen. */
const spieler = async () => one(
  `select streak, picks, current_item i, current_dir d, current_stage s, team_index,
          lock_until
     from wi_players where participant_id = $1`, [P1]);
const uhr = async () => one(
  `select lock_until, q_shown_at from wi_players where participant_id = $1`, [P1]);
const loesung = async (p) => (await one(`select (vocab_answers($1,$2))[1] a`, [p.i, p.d])).a;
const feldFrei = () => db.exec(`update wi_tiles set updated_at = now() - interval '10 seconds'
                                 where room_id = '${ROOM}'`);
const roh = async (text) => {
  await feldFrei();
  return (await one(`select wi_answer($1,$2) v`, ['tok1', text])).v;
};
const antworte = async (text) => {
  await db.exec(`update wi_players set lock_until = null where participant_id = '${P1}'`);
  return roh(text);
};
const richtig = async () => antworte(await loesung(await spieler()));
/* fast_wrong gibt es erst ab Stufe 2 — vorher wäre die Spalte im
   UPDATE ein Syntaxfehler. */
let nach0151 = false;
const zurueck = () => db.exec(
  `update wi_players set streak = 0, picks = 0, lock_until = null
          ${nach0151 ? ', fast_wrong = 0' : ''}
    where participant_id = '${P1}'`);
const meine = async () => n((await one(
  `select count(*) k from wi_tiles where room_id=$1 and owner_team=$2`,
  [ROOM, (await spieler()).team_index])).k);

/* Zwanzig richtige Antworten am Stück, und nach jeder: wie viele
   Wahlen hat das Kind jetzt? Zwanzig, weil erst dort der große
   Schlag des Taktes vorkommt. */
const zwanzigmal = async () => {
  await db.exec(`update wi_players set streak = 0, picks = 0 where participant_id = '${P1}'`);
  const spur = [];
  for (let i = 0; i < 20; i++) {
    const a = await richtig();
    spur.push(a.result === 'correct' ? n(a.picks) : '?');
  }
  return spur;
};

/* ══ Stufe 1: die Welt vor 0151 ════════════════════════════════ */
const vorher = await zwanzigmal();
ok('vor 0151: im Auswahl-Modus bringen 20 richtige Antworten KEINE Wahl',
   vorher.every(v => v === 0), vorher.join(' '));
ok('vor 0151: die Serie steht dabei still',
   n((await spieler()).streak) === 0, `streak=${(await spieler()).streak}`);

/* Die alte Sperre: JEDER Fehler kostet, auch der bedachte. Die
   Antwort kommt hier nach beliebig langem Nachdenken — vor 0151 sieht
   der Server das gar nicht, er zählt nur den Fehler. */
await zurueck();
const altFalsch = await roh('zzzzzzzzzz');
ok('vor 0151: auch eine bedachte falsche Antwort sperrt zwei Sekunden',
   n(altFalsch.locked_for) === 2, `locked_for=${altFalsch.locked_for}`);

/* ══ Stufe 2: 0151 ═════════════════════════════════════════════ */
await run(mig('0151_wordisland_choice_streak_lock.sql'), '0151');
nach0151 = true;
console.log('\n— 0151 läuft durch —\n');

/* ── Der Takt steht an einem Ort ──────────────────────────────── */
const gType   = (await one(`select wi_streak_goals('type') v`)).v;
const gChoice = (await one(`select wi_streak_goals('choice') v`)).v;
ok('wi_streak_goals: tippen 3/12', n(gType.step) === 3 && n(gType.big) === 12,
   JSON.stringify(gType));
ok('wi_streak_goals: auswählen 5/20', n(gChoice.step) === 5 && n(gChoice.big) === 20,
   JSON.stringify(gChoice));
ok('big ist in BEIDEN Modi ein Vielfaches von step — sonst fiele der große '
   + 'Schlag auf eine Antwort ohne Wahl',
   n(gType.big) % n(gType.step) === 0 && n(gChoice.big) % n(gChoice.step) === 0);
ok('und in beiden Modi ist es jede VIERTE Serie',
   n(gType.big) / n(gType.step) === 4 && n(gChoice.big) / n(gChoice.step) === 4);

/* ── Die Serie im Auswahl-Modus ───────────────────────────────── */
await zurueck();
const nachher = await zwanzigmal();
ok('nach 0151: die 5. Antwort bringt die erste Wahl',
   nachher[4] === 1 && nachher[3] === 0, nachher.join(' '));
ok('nach 0151: 10 und 15 bringen je eine weitere',
   nachher[9] === 2 && nachher[14] === 3, nachher.join(' '));
ok('nach 0151: die ZWANZIGSTE bringt zwei auf einmal',
   nachher[19] === 5 && nachher[18] === 3, nachher.join(' '));
ok('nach 0151: die Antworten dazwischen bringen keine',
   [0, 1, 2, 3].every(i => nachher[i] === 0) &&
   [5, 6, 7, 8].every(i => nachher[i] === 1) &&
   [15, 16, 17, 18].every(i => nachher[i] === 3), nachher.join(' '));

/* Der Unterschied in einer Zeile — genau das, was Sönke gemeldet hat. */
ok('zwanzig richtige im Auswahl-Modus: vorher null Wahlen, nachher fünf',
   vorher[19] === 0 && nachher[19] === 5, `${vorher[19]} → ${nachher[19]}`);

/* Eine Antwort ohne Wahl nimmt weiter ein zufälliges Feld. */
await zurueck();
const vorFeld = await meine();
const a1 = await richtig();
ok('nach 0151: eine gewöhnliche richtige Antwort nimmt Land',
   !!a1.tile && n(a1.streak) === 1, JSON.stringify(a1.tile));
await richtig(); await richtig(); await richtig();
const a5 = await richtig();
ok('nach 0151: Antwort 5 nimmt KEIN Feld, sondern die Wahl',
   !a5.tile && n(a5.picks) === 1, `tile=${JSON.stringify(a5.tile)} picks=${a5.picks}`);
ok('nach 0151: vier Felder sind dazugekommen', (await meine()) >= vorFeld + 4,
   `${vorFeld} → ${await meine()}`);

/* Ein Fehler setzt beides auf null. */
await zurueck();
await richtig(); await richtig();
const falsch = await antworte('zzzzzzzzzz');
ok('im Auswahl-Modus ist eine falsche Antwort sofort entschieden',
   falsch.result === 'wrong', falsch.result);
ok('Fehler setzt Serie und Wahlen auf null',
   n(falsch.streak) === 0 && n(falsch.picks) === 0,
   `streak=${falsch.streak} picks=${falsch.picks}`);

/* Der Deckel hält auch hier bei sechs. */
await db.exec(`update wi_players set streak = 19, picks = 5, lock_until = null
                where participant_id = '${P1}'`);
const gedeckelt = await richtig();
ok('der Deckel hält bei sechs, auch beim Zwanzigerschritt',
   n(gedeckelt.picks) === 6, `5 → ${gedeckelt.picks}`);

/* ── Der Tipp-Modus bleibt, wie er war ────────────────────────── */
await one(`select wi_room_end($1) v`, [CODE]);
await one(`select wi_room_to_lobby($1) v`, [CODE]);
await setze('type');
await starte();
await zurueck();
const tippSpur = [];
for (let i = 0; i < 12; i++) {
  const a = await richtig();
  tippSpur.push(a.result === 'correct' ? n(a.picks) : '?');
}
ok('Tipp-Modus: der Takt ist weiter 3 …',
   tippSpur[2] === 1 && tippSpur[5] === 2 && tippSpur[8] === 3, tippSpur.join(' '));
ok('Tipp-Modus: … und die zwölfte bringt weiter zwei (0149 unangetastet)',
   tippSpur[11] === 5, tippSpur.join(' '));

/* ⚠️ Mit Hilfe richtig zählt weiter nicht — 0 % 5 wie 0 % 3 ist 0. */
await zurueck();
await richtig(); await richtig();
const pHilf = await spieler();
const solHilf = await loesung(pHilf);
await antworte('zzzzzzzzzz');                 // Auswahl geht auf
const ausWahl = await antworte(solHilf);      // richtig, aber mit Hilfe
ok('mit Hilfe richtig: keine Serie, keine Wahl',
   ausWahl.result === 'correct' && n(ausWahl.streak) === 0 && n(ausWahl.picks) === 0,
   `${ausWahl.result} streak=${ausWahl.streak} picks=${ausWahl.picks}`);

/* ── Die Zwischenstufe startet eine neue Uhr ──────────────────── */
await zurueck();
await db.exec(`update wi_players set q_shown_at = now() - interval '30 seconds'
                where participant_id = '${P1}'`);
await antworte('zzzzzzzzzz');                 // → Auswahl
const nachStufe = await uhr();
ok('die acht Vorschläge starten eine neue Uhr (sonst führe die Sperre im '
   + 'Tipp-Modus nie)',
   new Date(nachStufe.q_shown_at).getTime() > Date.now() - 5000,
   String(nachStufe.q_shown_at));

/* ══ Die Sperre — sie misst Tempo, nicht Fehler ═══════════════ */
await one(`select wi_room_end($1) v`, [CODE]);
await one(`select wi_room_to_lobby($1) v`, [CODE]);
await setze('choice');
await starte();

/* „bedacht" und „ohne Hinsehen" werden über q_shown_at gestellt —
   das ist genau die Zahl, gegen die der Server misst. */
const langsam = () => db.exec(`update wi_players set q_shown_at = now() - interval '9 seconds'
                                where participant_id = '${P1}'`);
const schnell = () => db.exec(`update wi_players set q_shown_at = now()
                                where participant_id = '${P1}'`);
const frei    = () => db.exec(`update wi_players set lock_until = null
                                where participant_id = '${P1}'`);
const fw      = async () => n((await one(
  `select fast_wrong f from wi_players where participant_id = $1`, [P1])).f);

/* Eine BEDACHTE falsche Antwort kostet gar nichts mehr. */
await zurueck();
await langsam();
const bedacht = await roh('zzzzzzzzzz');
ok('nach 0151: eine bedachte falsche Antwort sperrt NICHT (vorher 2 s)',
   n(bedacht.locked_for) === 0 && (await fw()) === 0,
   `locked_for=${bedacht.locked_for} fast_wrong=${await fw()}`);

/* Schnelle Fehler: die ersten zwei frei, dann 1, 2, 3, 4, 5, 5. */
await zurueck();
const spurSperre = [];
for (let i = 0; i < 8; i++) {
  await frei();
  await schnell();
  const a = await roh('zzzzzzzzzz');
  spurSperre.push(n(a.locked_for));
}
ok('schnelle Fehler: zwei frei, dann 1, 2, 3, 4, 5 — und der Deckel hält',
   JSON.stringify(spurSperre) === JSON.stringify([0, 0, 1, 2, 3, 4, 5, 5]),
   spurSperre.join(' '));

/* Eine bedachte Antwort löscht den Zähler — das ist der Ausweg. */
await frei();
await langsam();
await roh('zzzzzzzzzz');
ok('eine bedachte Antwort löscht den Zähler', (await fw()) === 0, `fast_wrong=${await fw()}`);

/* ⚠️ Eine schnelle RICHTIGE lässt ihn stehen — sonst holt sich ein
   Ratender nach jedem Zufallstreffer seine Freiversuche zurück. */
await zurueck();
await frei(); await schnell(); await roh('zzzzzzzzzz');
await frei(); await schnell(); await roh('zzzzzzzzzz');
await frei(); await schnell(); await roh('zzzzzzzzzz');
const vorTreffer = await fw();
await frei();
await schnell();
const treffer = await roh(await loesung(await spieler()));
ok('eine schnelle RICHTIGE Antwort lässt den Zähler stehen',
   treffer.result === 'correct' && (await fw()) === vorTreffer && n(treffer.locked_for) === 0,
   `${vorTreffer} → ${await fw()}`);

/* Ein Tipp WÄHREND der Sperre ist keine Antwort. */
await zurueck();
for (let i = 0; i < 4; i++) { await frei(); await schnell(); await roh('zzzzzzzzzz'); }
const gesperrt = await fw();
const abgewiesen = await roh('zzzzzzzzzz');
ok('ein Tipp während der Sperre wird abgewiesen',
   abgewiesen.ok === false && abgewiesen.error === 'too_fast' && n(abgewiesen.locked_for) > 0,
   JSON.stringify(abgewiesen));
ok('… und zählt NICHT als Fehlversuch (sonst käme niemand wieder heraus)',
   (await fw()) === gesperrt, `${gesperrt} → ${await fw()}`);

/* Die Uhr der neuen Aufgabe beginnt erst nach der Sperre. */
const p = await uhr();
const rest = (new Date(p.lock_until).getTime() - Date.now()) / 1000;
const vorlauf = (new Date(p.q_shown_at).getTime() - Date.now()) / 1000;
ok('die Uhr der neuen Aufgabe läuft erst ab dem Ende der Sperre',
   vorlauf > rest - 1.5 && vorlauf > 0.5,
   `Sperre ${rest.toFixed(1)}s, Uhr in ${vorlauf.toFixed(1)}s`);

/* ── wi_view reicht den Takt durch ────────────────────────────── */
await db.exec(`update wi_players set lock_until = null where participant_id = '${P1}'`);
const v = (await one(`select wi_view($1) v`, ['tok1'])).v;
ok('wi_view trägt streak_goals des eingestellten Modus',
   v.streak_goals && n(v.streak_goals.step) === 5 && n(v.streak_goals.big) === 20,
   JSON.stringify(v.streak_goals));
const aG = await richtig();
ok('wi_answer trägt sie ebenfalls mit',
   aG.streak_goals && n(aG.streak_goals.step) === 5, JSON.stringify(aG.streak_goals));

/* ── wi_room_to_lobby räumt den Zähler weg ────────────────────── */
await db.exec(`update wi_players set fast_wrong = 4 where room_id = '${ROOM}'`);
await one(`select wi_room_end($1) v`, [CODE]);
await one(`select wi_room_to_lobby($1) v`, [CODE]);
ok('zurück in die Lobby räumt fast_wrong weg',
   n((await one(`select coalesce(max(fast_wrong),0) m from wi_players where room_id=$1`,
                [ROOM])).m) === 0);

/* ── Zweimal einspielen ───────────────────────────────────────── */
await run(mig('0151_wordisland_choice_streak_lock.sql'), '0151 (zweites Mal)');
ok('die Migration läuft zweimal', true);

console.log(`\n${fails === 0 ? 'ALLES GRÜN' : fails + ' FEHLER'}`);
process.exit(fails === 0 ? 0 : 1);
