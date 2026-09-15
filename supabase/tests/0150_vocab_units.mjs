/* Prüfstand für Migration 0150 — „Jahrgang → Unit → Station".
   Echt gerechnet in pglite, Stubs wie in 0136…0149.

   Zweistufig wie 0140/0141/0142/0146/0148/0149: erst laufen
   0130…0149 — dort ist die Vokabelliste flach —, DORT wird ein Kind
   angelegt, das übt und dessen Tiere wachsen, und erst danach kommt
   0150 obendrauf. Nur so ist die Kernzusage überhaupt prüfbar:

     ⚠️ Das Umhängen der drei mitgelieferten Sätze unter die Unit
        „Test" darf keinem Kind einen einzigen Lernstand kosten.

   An den Set-IDs aus 0130 hängen wi_solo_progress, wi_solo_sets und
   wi_room_sets. Wer die Sätze neu anlegt statt sie umzuhängen,
   bekommt dieselbe Oberfläche und leere Inseln — und das fällt erst
   in der Stunde auf.

   Die Zusagen in Worten:
     1. VOR 0150 gibt es weder vocab_units noch vocab_sets.unit_id.
     2. NACH 0150 hängen die drei Sätze als Station 1–3 unter „Test".
     3. KERNZUSAGE: wi_solo_progress und wi_solo_sets stehen Zeile für
        Zeile unverändert da — verglichen wird ein Abzug von vorher.
     4. Die Tiere sind noch dieselben: wi_solo_stages liefert exakt
        dieselben Stufen wie vor der Migration.
     5. island_key ist generiert, ist 'en:5' und deckt sich mit
        vocab_island_key. Von Hand setzen geht NICHT.
     6. vocab_sets_list trägt unit/utitle/grade/island/station, und
        die Sortierung stellt den Jahrgang vor das Jahrgangslose.
     7. wi_solo_open trägt dieselben Felder — UND das Level ist noch
        da (Rumpf aus 0145, nicht aus 0136).
     8. Eine eigene Liste, die es vor 0150 schon gab, ist danach eine
        Unit am Stück: ein Dach, genau eine Station.
     9. vocab_set_import legt die Unit mit an und gibt sie zurück.
    10. Ein Import ohne eine einzige lesbare Zeile lässt weder Satz
        noch Dach zurück.
    11. vocab_set_delete räumt die leer gewordene Unit ab — aber nur
        die leere.
    12. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0150_vocab_units.mjs  */
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
const one  = async (sql, params) => (await db.query(sql, params)).rows[0];
const all  = async (sql, params) => (await db.query(sql, params)).rows;
const js   = v => JSON.stringify(v);
const n    = v => Number(v);

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

/* ── Bühne ───────────────────────────────────────────────────
   Die Raum-ID bewusst NICHT b0000000-…: das ist seit 0150 die
   Test-Unit, und zwei gleiche Nummern in einer Prüfdatei liest
   niemand mehr auseinander. */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const ROOM   = 'f0000000-0000-4000-8000-000000000001';
const UNIT   = 'b0000000-0000-4000-8000-000000000001';
const S1     = 'a0000000-0000-4000-8000-000000000001';   // Schule
const S2     = 'a0000000-0000-4000-8000-000000000002';   // Zuhause
const S3     = 'a0000000-0000-4000-8000-000000000003';   // Essen

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values (null);
  insert into skill_rooms (id, code, owner_id, school_id, title) values
    ('${ROOM}','AAAAAA','${T}','${SCHOOL}','Stunde 1');
  insert into skill_participants (room_id, token, seat, name) values
    ('${ROOM}','rt-anon-1', 1, 'Mia');
  insert into wi_room_sets (room_id, set_id) values
    ('${ROOM}','${S1}'), ('${ROOM}','${S2}');
`);

/* Eine eigene Liste der Lehrkraft, die es VOR 0150 schon gibt.
   Sie muss die Migration als Unit am Stück überstehen (Zusage 8). */
const ALT = (await one(
  `insert into vocab_sets (title, owner_id, school_id) values ('Klassenarbeit', $1, $2)
   returning id`, [T, SCHOOL])).id;
await db.exec(
  `insert into vocab_items (set_id, term, translation, sort_order) values
     ('${ALT}', 'der Hund', 'dog', 1), ('${ALT}', 'die Katze', 'cat', 2)`);

const loesung = async lid => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [lid])).a;
const frei = lid => db.exec(`update wi_solo_learners set lock_until = null where id = '${lid}'`);

/* ── Ein Kind, das wirklich geübt hat ────────────────────────
   Ohne echten Fortschritt wäre Zusage 3 grün, ohne etwas zu prüfen:
   zwei leere Tabellen sind trivial gleich. */
const tok = (await one(`select wi_solo_claim($1, null) v`, ['rt-anon-1'])).v.token;
const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;
await one(`select wi_solo_settings($1, $2::uuid[], $3, $4) v`, [tok, [S1], 'mixed', 'type']);
await one(`select wi_solo_start($1) v`, [tok]);

/* ⚠️ Geübt wird, BIS ein Tier geschlüpft ist — nicht eine feste Zahl
   von Malen. Eine Stufe ist das MINIMUM beider Richtungen (0136), der
   Beutel zieht zufällig, und 30 Wörter liegen als Eier mit je drei
   Kopien je Richtung darin. Eine feste Zahl trifft das mal und mal
   nicht: der erste Entwurf stand auf 25 Antworten und war in einem
   von sechs Läufen rot. Spätestens nach dem Beutel (180 Kopien) ist
   jedes Wort dreimal dran gewesen, der Deckel ist also großzügig und
   wird nie erreicht. */
const geschluepft = async () => n((await one(
  `select count(*) c from wi_solo_stages($1) where stage > 0`, [lid])).c);
let schluepfer = 0;
for (let i = 0; i < 400 && schluepfer === 0; i++) {
  await frei(lid);
  const a = await loesung(lid);
  if (!a) break;
  await one(`select wi_solo_answer($1, $2) v`, [tok, a]);
  if (i % 20 === 19) schluepfer = await geschluepft();
}

const progVorher  = await all(
  `select item_id, dir, points, seen, clean, helped, wrong
     from wi_solo_progress where learner_id = $1 order by item_id, dir`, [lid]);
const setsVorher  = await all(
  `select set_id from wi_solo_sets where learner_id = $1 order by set_id`, [lid]);
const stufenVorher = await all(
  `select item_id, stage from wi_solo_stages($1) order by item_id`, [lid]);
const raumVorher  = await all(
  `select set_id from wi_room_sets where room_id = $1 order by set_id`, [ROOM]);

ok('Bühne: das Kind hat wirklich geübt', progVorher.length > 0,
   `${progVorher.length} Zeilen im Fach`);
ok('Bühne: mindestens ein Tier ist über das Ei hinaus', schluepfer > 0,
   `${schluepfer} geschlüpft`);

/* ── 1. Vor 0150 gibt es die Ebene nicht ─────────────────── */
const hatTabelle = async t => n((await one(
  `select count(*) c from information_schema.tables
    where table_schema = 'public' and table_name = $1`, [t])).c);
const hatSpalte = async (t, c) => n((await one(
  `select count(*) c from information_schema.columns
    where table_schema = 'public' and table_name = $1 and column_name = $2`, [t, c])).c);

ok('OHNE 0150 gibt es vocab_units nicht', await hatTabelle('vocab_units') === 0);
ok('OHNE 0150 hat vocab_sets keine unit_id', await hatSpalte('vocab_sets', 'unit_id') === 0);

/* ── 0150 ────────────────────────────────────────────────── */
await run(mig('0150_vocab_units.sql'), '0150');
console.log('\n— 0150 läuft durch —\n');

/* ── 2. Die drei Sätze sind Stationen geworden ───────────── */
const stationen = await all(
  `select id, title, sort_order from vocab_sets where unit_id = $1 order by sort_order`, [UNIT]);
ok('die Unit „Test" hat genau drei Stationen', stationen.length === 3,
   js(stationen.map(s => s.title)));
ok('… in der Reihenfolge Schule, Zuhause, Essen',
   stationen[0]?.id === S1 && stationen[1]?.id === S2 && stationen[2]?.id === S3,
   js(stationen.map(s => s.id?.slice(-1))));
ok('… mit sort_order 1, 2, 3',
   js(stationen.map(s => n(s.sort_order))) === js([1, 2, 3]));
ok('… und sprechenden Titeln',
   stationen[0]?.title === 'Station 1 — Schule'
   && stationen[2]?.title === 'Station 3 — Essen',
   js(stationen.map(s => s.title)));

const u = await one(`select title, grade, island_key, lang_to from vocab_units where id = $1`, [UNIT]);
ok('die Unit heißt „Test" und steht in Jahrgang 5',
   u.title === 'Test' && n(u.grade) === 5, js(u));

/* ── 3. KERNZUSAGE: kein Lernstand ist verloren ──────────── */
const progNachher = await all(
  `select item_id, dir, points, seen, clean, helped, wrong
     from wi_solo_progress where learner_id = $1 order by item_id, dir`, [lid]);
const setsNachher = await all(
  `select set_id from wi_solo_sets where learner_id = $1 order by set_id`, [lid]);
const raumNachher = await all(
  `select set_id from wi_room_sets where room_id = $1 order by set_id`, [ROOM]);

ok('⚠️ wi_solo_progress steht Zeile für Zeile unverändert da',
   js(progVorher) === js(progNachher),
   `${progVorher.length} → ${progNachher.length} Zeilen`);
ok('⚠️ wi_solo_sets steht unverändert da — die Freischaltung bleibt',
   js(setsVorher) === js(setsNachher));
ok('⚠️ wi_room_sets steht unverändert da — laufende Räume merken nichts',
   js(raumVorher) === js(raumNachher));

/* ── 4. … und die Tiere sind dieselben ───────────────────── */
const stufenNachher = await all(
  `select item_id, stage from wi_solo_stages($1) order by item_id`, [lid]);
ok('die Insel trägt exakt dieselben Tiere in denselben Stufen',
   js(stufenVorher) === js(stufenNachher),
   `${stufenVorher.length} Tiere`);

/* ── 5. Der Inselschlüssel ───────────────────────────────── */
ok('island_key der Test-Unit ist en:5', u.island_key === 'en:5', js(u.island_key));
const schluessel = await one(`select vocab_island_key($1, $2) v`, ['en', 5]);
ok('… und deckt sich mit vocab_island_key', schluessel.v === u.island_key);
const ohneJahrgang = await one(`select vocab_island_key($1, null::int) v`, ['la']);
ok('ohne Jahrgang heißt der Schlüssel la:x', ohneJahrgang.v === 'la:x', js(ohneJahrgang.v));

/* Generiert heißt: es gibt keinen zweiten Weg, sie zu füllen. Ohne
   diese Zusage wäre die Spalte eine zweite Wahrheit neben der
   Funktion, und der erste Import, der sie vergisst, legt eine Unit
   auf eine Insel, die es nicht gibt. */
let gesetzt = false;
try {
  await db.exec(`update vocab_units set island_key = 'xx:9' where id = '${UNIT}'`);
  gesetzt = true;
} catch { /* erwartet */ }
ok('island_key lässt sich NICHT von Hand setzen', !gesetzt);

/* Die Probe aufs Exempel: Jahrgang ändern zieht den Schlüssel nach. */
await db.exec(`update vocab_units set grade = 7 where id = '${UNIT}'`);
const nachUmzug = await one(`select island_key from vocab_units where id = $1`, [UNIT]);
ok('… sondern folgt dem Jahrgang von selbst', nachUmzug.island_key === 'en:7',
   js(nachUmzug.island_key));
await db.exec(`update vocab_units set grade = 5 where id = '${UNIT}'`);

/* ── 6. vocab_sets_list trägt die Unit mit ───────────────── */
await db.exec(`update _who set uid = '${T}'`);
const liste = (await one(`select vocab_sets_list() v`)).v;
ok('vocab_sets_list antwortet', liste.ok === true, js(liste.error));

const eintrag = liste.sets.find(s => s.id === S1);
ok('jeder Satz trägt seine Unit',
   eintrag?.unit === UNIT && eintrag?.utitle === 'Test',
   js({ unit: eintrag?.unit?.slice(-4), utitle: eintrag?.utitle }));
ok('… mit Jahrgang, Insel und Stationsnummer',
   n(eintrag?.grade) === 5 && eintrag?.island === 'en:5' && n(eintrag?.station) === 1,
   js({ grade: eintrag?.grade, island: eintrag?.island, station: eintrag?.station }));
ok('… und die alten Felder stehen unangetastet daneben',
   eintrag?.title === 'Station 1 — Schule' && eintrag?.mine === '0'
   && n(eintrag?.count) === 30,
   js({ mine: eintrag?.mine, count: eintrag?.count }));

/* Der Jahrgang ordnet, nicht der Text. Stünde die Sortierung auf
   einem jsonb-Feld, käme '10' vor '5' — und die jahrgangslose
   eigene Liste (99) schöbe sich zwischen die Buch-Units. */
const reihe = liste.sets.map(s => `${s.mine}/${s.grade ?? 'x'}/${s.station}`);
const idxBuch = liste.sets.findIndex(s => s.id === S3);
const idxEigen = liste.sets.findIndex(s => s.id === ALT);
ok('die mitgelieferten Units stehen vor den eigenen', idxBuch < idxEigen, js(reihe));

/* ── 7. wi_solo_open trägt dieselben Felder — und das Level ──
   ⚠️ Erst abmelden. wi_solo_resolve (0136) lässt ein Konto IMMER
   gewinnen und sieht den Token dann gar nicht mehr an — mit der
   Lehrkraft aus Zusage 6 noch in _who käme hier `learner: null`
   heraus, und das sähe aus wie ein Fehler der Migration. */
await db.exec(`update _who set uid = null`);
const offen = (await one(`select wi_solo_open($1) v`, [tok])).v;
const soloSatz = offen.learner.sets.find(s => s.id === S1);
ok('die Unit-Leiste bekommt dieselben fünf Felder',
   soloSatz?.unit === UNIT && soloSatz?.utitle === 'Test'
   && n(soloSatz?.grade) === 5 && soloSatz?.island === 'en:5'
   && n(soloSatz?.station) === 1,
   js(soloSatz));
/* ⚠️ Die Gegenprobe gegen den Rumpf-aus-der-falschen-Fassung-Fehler:
   wer wi_solo_open aus 0136 statt aus 0145 abschreibt, nimmt dem
   Kind sein Level weg, und der Rest des Prüfstands bliebe grün. */
ok('⚠️ … und `player` ist noch da (Rumpf aus 0145, nicht aus 0136)',
   offen.learner.player != null && offen.learner.player.level != null,
   js(offen.learner.player && Object.keys(offen.learner.player)));
ok('wi_solo_view erbt beides',
   (await one(`select wi_solo_view($1) v`, [tok])).v.learner.sets.length > 0);

/* ── 8. Die alte eigene Liste ist eine Unit am Stück ─────── */
const altUnit = await one(
  `select u.id, u.title, u.grade, u.owner_id,
          (select count(*) from vocab_sets x where x.unit_id = u.id) c
     from vocab_sets s join vocab_units u on u.id = s.unit_id
    where s.id = $1`, [ALT]);
ok('die schon vorhandene eigene Liste hat ein Dach bekommen',
   altUnit?.title === 'Klassenarbeit' && altUnit.owner_id === T, js(altUnit?.title));
ok('… mit genau einer Station — also am Stück', n(altUnit?.c) === 1, js(altUnit?.c));
ok('… und ohne erfundenen Jahrgang', altUnit?.grade === null, js(altUnit?.grade));

const ohneDach = n((await one(`select count(*) c from vocab_sets where unit_id is null`)).c);
ok('kein einziger Satz steht nach 0150 ohne Unit da', ohneDach === 0, js(ohneDach));

/* ── 9. Der Import legt das Dach gleich mit an ─────────────
   Wieder als Lehrkraft — Import, Löschen und die Liste sind ihre
   Funktionen, und ohne auth.uid() geben alle drei
   `not_authenticated` zurück. */
await db.exec(`update _who set uid = '${T}'`);
const imp = (await one(
  `select vocab_set_import($1, $2, null, null, 'de', 'en', null) v`,
  ['Unit 1 — Welcome', 'Hallo - hello\nder Freund - friend'])).v;
ok('Import gelingt', imp.ok === true, js(imp.error));
ok('… und gibt die Unit mit zurück', typeof imp.unit === 'string', js(imp.unit));
const impUnit = await one(
  `select u.title, u.owner_id, s.sort_order,
          (select count(*) from vocab_sets x where x.unit_id = u.id) c
     from vocab_sets s join vocab_units u on u.id = s.unit_id where s.id = $1`, [imp.set]);
ok('… die Unit trägt den Titel der Liste und gehört der Lehrkraft',
   impUnit?.title === 'Unit 1 — Welcome' && impUnit.owner_id === T, js(impUnit?.title));
ok('… mit genau einer Station auf Platz 1',
   n(impUnit?.c) === 1 && n(impUnit?.sort_order) === 1, js(impUnit));

/* ── 10. Nichts Lesbares: auch das Dach geht wieder weg ──── */
const unitsVor = n((await one(`select count(*) c from vocab_units`)).c);
const murks = (await one(
  `select vocab_set_import($1, $2, null, null, 'de', 'en', null) v`,
  ['Kaputt', 'keine Trennzeichen hier\nund hier auch nicht'])).v;
ok('ein Import ohne lesbare Zeile schlägt fehl', murks.ok === false
   && murks.error === 'no_pairs', js(murks));
const unitsNach = n((await one(`select count(*) c from vocab_units`)).c);
ok('… und lässt keine Leerhülse mit Dach zurück', unitsNach === unitsVor,
   `${unitsVor} → ${unitsNach}`);

/* ── 11. Löschen räumt nur die LEER gewordene Unit ab ────── */
const del = (await one(`select vocab_set_delete($1) v`, [imp.set])).v;
ok('die eigene Liste lässt sich löschen', del.ok === true, js(del.error));
const restUnit = n((await one(
  `select count(*) c from vocab_units where title = 'Unit 1 — Welcome'`)).c);
ok('… und ihr leeres Dach verschwindet mit', restUnit === 0, js(restUnit));

/* Eine Unit mit mehreren Stationen überlebt das Löschen einer davon.
   Sonst nähme das Entfernen einer Station das halbe Buch mit. */
const mehr = (await one(
  `select vocab_set_import($1, $2, null, null, 'de', 'en', null) v`,
  ['Zweiteilig', 'Haus - house'])).v;
await db.exec(
  `insert into vocab_sets (title, owner_id, school_id, unit_id, sort_order)
   values ('Station 2', '${T}', '${SCHOOL}', '${mehr.unit}', 2)`);
const zweite = (await one(
  `select id from vocab_sets where unit_id = $1 and sort_order = 2`, [mehr.unit])).id;
await one(`select vocab_set_delete($1) v`, [zweite]);
const lebt = n((await one(`select count(*) c from vocab_units where id = $1`, [mehr.unit])).c);
ok('eine Unit mit weiteren Stationen bleibt stehen', lebt === 1, js(lebt));

/* ── 12. Zweimal laufen ──────────────────────────────────── */
await run(mig('0150_vocab_units.sql'), '0150 (zweiter Lauf)');
const nochStationen = n((await one(
  `select count(*) c from vocab_sets where unit_id = $1`, [UNIT])).c);
const progFinal = await all(
  `select item_id, dir, points, seen, clean, helped, wrong
     from wi_solo_progress where learner_id = $1 order by item_id, dir`, [lid]);
ok('die Migration läuft zweimal', nochStationen === 3, js(nochStationen));
ok('… und der zweite Lauf legt keine Doppel-Dächer an',
   n((await one(`select count(*) c from vocab_units where title = 'Klassenarbeit'`)).c) === 1);
ok('… und rührt den Lernstand auch beim zweiten Mal nicht an',
   js(progVorher) === js(progFinal));

console.log(fails ? `\n${fails} FEHLER` : '\nAlles grün.');
process.exit(fails ? 1 : 0);
