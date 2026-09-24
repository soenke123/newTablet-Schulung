/* Prüfstand für Migration 0169 — Apostroph, „(= …)" und der leere Topf.
   Echt gerechnet in pglite, Stubs wie in 0136…0168.

   Zweistufig, und das ist hier der halbe Prüfstand: erst laufen
   0130…0168 samt dem ECHTEN Lehrwerk (0160 Band 1, 0163 Band 2).
   Dort wird der gemeldete Fehler nachgestellt — „I'd like to" mit
   dem geraden Apostroph ist NICHT richtig. Erst danach kommt 0169
   obendrauf. Eine Zusage, die vorher schon grün wäre, prüft nichts.

   Geübt wird an den Wörtern, die im Buch stehen, und nicht an
   erfundenen: die ganze Entscheidung („(= …) ist eine zweite
   Antwort, jede andere Klammer ist eine Auskunft") ist aus dem
   Bestand abgelesen und muss an ihm gelten.

   Die Zusagen im Einzelnen:
     1. Vor 0169 gibt es vocab_forms nicht — und „I'd like to"
        (gerader Apostroph) gilt nicht, „I would like to" erst recht
        nicht.
     2. Nach 0169 zählt jede Apostroph-Schreibweise, auch gar keine.
     3. Der Inhalt von „(= …)" ist eine zweite richtige Antwort.
     4. Jede ANDERE Klammer bleibt eine Auskunft: „bei
        Uhrzeitangaben" ist keine Vokabel.
     5. vocab_forms liefert genau die Formen, die es soll.
     6. GENAU EINE Kachel stimmt — in vocab_choices wie in
        vocab_spellings (feedback_free_constant_double_answer).
     7. Kurze Formen bekommen keine geerbte Milde: „TV" bleibt
        streng, obwohl „television" im selben Eintrag steht.
     8. wi_solo_chosen unterscheidet drei Zustände am Schlüssel.
     9. Was vorher [] hieß, heißt nach 0169 wieder „alles".
    10. Ein leerer Topf dreht die Runde nicht weiter.
    11. Die Migration läuft zweimal (ohne den Aufräum-Block noch
        einmal auszuführen — der ist im zweiten Lauf gegenstandslos).

   Aufruf:  node supabase/tests/0169_vocab_apostroph.mjs           */
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
const one  = async (sql, params) => (await db.query(sql, params)).rows[0];
const alle = async (sql, params) => (await db.query(sql, params)).rows;

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

const BIS_0168 = [
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
  '0159_vocab_lehrwerk.sql', '0160_vocab_greenline_5.sql',
  '0161_vocab_test_units_out.sql', '0162_vocab_greenline_5_hello.sql',
  '0163_vocab_greenline_6.sql', '0165_wordisland_ruins_balance.sql',
  '0166_wordisland_island_size.sql', '0167_wordisland_round_end_timer.sql',
  '0168_wordisland_trainer_island.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0168) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0168 laufen durch —\n');

/* ── Die Wörter, an denen alles hängt ─────────────────────────
   Aus dem Bestand gesucht und nicht eingefügt: wenn das Lehrwerk
   sie eines Tages anders schreibt, soll dieser Prüfstand das
   merken und nicht an seiner eigenen Kopie vorbeiprüfen. */
const wortMit = async (muster) => {
  const r = await one(
    `select id, term, translation from vocab_items where translation like $1 limit 1`, [muster]);
  if (!r) { console.error(`\nIm Bestand fehlt ein Wort wie ${muster}`); process.exit(1); }
  return r;
};
const wortMitTerm = async (muster) => {
  const r = await one(
    `select id, term, translation from vocab_items where term like $1 limit 1`, [muster]);
  if (!r) { console.error(`\nIm Bestand fehlt ein Wort wie ${muster}`); process.exit(1); }
  return r;
};

const LIKE   = await wortMit('%like to%(= I would like to)%');   // „Ich möchte …"
const TV     = await wortMit('TV (= television)%');
const SKATES = await wortMit('%(pl)%');
const UHR    = await wortMitTerm('%(bei Uhrzeitangaben)%');      // deutsche Seite

// Der Klammerinhalt, so wie er wirklich dasteht — nicht wie ich
// ihn mir merke.
const inKlammern = s => (s.match(/\(([^)]*)\)/) || [, ''])[1];
const ohneKlammer = s => s.replace(/\s*\([^)]*\)\s*/, ' ').trim();

console.log(`Geprüft wird an:  ${LIKE.term}  →  ${LIKE.translation}`);
console.log(`                  ${TV.term}  →  ${TV.translation}`);
console.log(`                  ${UHR.term}  →  ${UHR.translation}\n`);

const note = async (item, dir, eingabe) =>
  (await one(`select vocab_grade($1, $2, $3) g`, [item, dir, eingabe])).g;

/* ══ Stufe 1: die Welt vor 0169 ════════════════════════════════ */
const gibtForms = async () => Number((await one(
  `select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'vocab_forms'`)).n);

ok('1a  vor 0169 gibt es vocab_forms nicht', await gibtForms() === 0);

const vorherGerade = await note(LIKE.id, 'de_en', "I'd like to …");
ok('1b  vor 0169 ist der gerade Apostroph NICHT richtig',
   vorherGerade !== 'exact', vorherGerade);
const vorherLang = await note(LIKE.id, 'de_en', 'I would like to');
ok('1c  vor 0169 zählt die Fassung aus der Klammer nicht',
   vorherLang !== 'exact', vorherLang);

/* Ein Lernender, der heute mit `sets: []` dasteht — das hieß bis
   0169 „alles". Er muss VOR der Migration angelegt werden, sonst
   prüft Zusage 9 nichts. */
const SET_A = (await one(`select id from vocab_sets order by title limit 1`)).id;
const SET_B = (await one(`select id from vocab_sets order by title offset 1 limit 1`)).id;
await db.exec(`
  insert into wi_solo_learners (id, token, settings) values
    ('11111111-0000-4000-8000-000000000001', 'tokalt',  jsonb_build_object('sets', '[]'::jsonb)),
    ('11111111-0000-4000-8000-000000000002', 'toknorm', '{}'::jsonb)
  on conflict (id) do update set settings = excluded.settings;
  insert into wi_solo_sets (learner_id, set_id) values
    ('11111111-0000-4000-8000-000000000001', '${SET_A}'),
    ('11111111-0000-4000-8000-000000000001', '${SET_B}'),
    ('11111111-0000-4000-8000-000000000002', '${SET_A}'),
    ('11111111-0000-4000-8000-000000000002', '${SET_B}')
  on conflict do nothing;
`);
const alt = 'select array_length(wi_solo_chosen($1), 1)';
ok('1d  vorbereitet: [] heißt heute „alles"',
   Number((await one(`${alt} n`, ['11111111-0000-4000-8000-000000000001'])).n) === 2);

/* ══ Stufe 2: 0169 obendrauf ═══════════════════════════════════ */
await run(mig('0169_vocab_apostroph_und_leerer_topf.sql'), '0169');
console.log('\n— 0169 läuft durch —\n');

ok('2a  vocab_forms ist da', await gibtForms() === 1);

/* ── Zusage 2: jede Apostroph-Schreibweise ───────────────────── */
const SCHREIBWEISEN = [
  ["I'd like to …",  'gerader Apostroph (Tablet-Tastatur)'],
  ['I’d like to …',  'typografischer Apostroph (so steht es im Buch)'],
  ['I`d like to',    'Gravis'],
  ['I´d like to',    'Akut'],
  ['Id like to',     'gar keiner'],
  ['id like to',     'klein und ohne']
];
for (const [ein, wie] of SCHREIBWEISEN) {
  ok(`2   „${ein}" (${wie})`, await note(LIKE.id, 'de_en', ein) === 'exact');
}

/* ── Zusage 3: die Fassung aus „(= …)" ───────────────────────── */
ok('3a  „I would like to" ist richtig',
   await note(LIKE.id, 'de_en', 'I would like to') === 'exact');
ok('3b  „television" ist richtig für „TV (= television)"',
   await note(TV.id, 'de_en', 'television') === 'exact');
ok('3c  „TV" ist es weiterhin auch',
   await note(TV.id, 'de_en', 'TV') === 'exact');

/* ── Zusage 4: jede andere Klammer bleibt eine Auskunft ──────── */
ok(`4a  „${inKlammern(UHR.term)}" ist keine Vokabel`,
   await note(UHR.id, 'en_de', inKlammern(UHR.term)) === 'miss');
ok(`4b  „${ohneKlammer(UHR.term)}" schon`,
   await note(UHR.id, 'en_de', ohneKlammer(UHR.term)) === 'exact');
ok(`4c  „${inKlammern(SKATES.translation)}" ist keine Vokabel`,
   await note(SKATES.id, 'de_en', inKlammern(SKATES.translation)) === 'miss');
ok(`4d  „${ohneKlammer(SKATES.translation)}" schon`,
   await note(SKATES.id, 'de_en', ohneKlammer(SKATES.translation)) === 'exact');

/* ── Zusage 5: vocab_forms liefert genau das ─────────────────── */
const formen = async s => (await one(`select vocab_forms($1) f`, [s])).f;
const f1 = await formen('TV (= television)');
ok('5a  „TV (= television)" hat zwei Formen',
   f1.length === 2 && f1.includes('tv') && f1.includes('television'), JSON.stringify(f1));
const f2 = await formen('skates (pl)');
ok('5b  „skates (pl)" hat eine', f2.length === 1 && f2[0] === 'skates', JSON.stringify(f2));
const f3 = await formen("don't");
ok('5c  ein Apostroph mitten im Wort faellt weg',
   f3.length === 1 && f3[0] === 'dont', JSON.stringify(f3));
const f4 = await formen('I’d like to … (= I would like to)');
ok('5d  Buchfassung: „id like to" und „i would like to"',
   f4.length === 2 && f4.includes('id like to') && f4.includes('i would like to'),
   JSON.stringify(f4));

/* ── Zusage 6: GENAU EINE Kachel stimmt ──────────────────────── */
/* Der Fall, den die Änderung an vocab_choices abfängt, muss
   HERGESTELLT werden: „television" als eigenes Wort in derselben
   Station wie „TV (= television)". Im Buch stehen sie nicht
   zusammen — und ein Prüfstand, der auf den Zufall des Bestands
   wartet, prüft irgendwann nichts mehr. */
const TVSET = (await one(`select set_id from vocab_items where id = $1`, [TV.id])).set_id;
await db.exec(`
  insert into vocab_items (set_id, term, translation, sort_order)
  values ('${TVSET}', 'Fernsehgeraet', 'television', 999)
  on conflict do nothing;
`);
let doppelt = 0;
for (let i = 0; i < 40; i++) {
  const opts = (await one(`select vocab_choices(array[$1]::uuid[], $2, 'de_en', 8) o`,
                          [TVSET, TV.id])).o;
  let richtig = 0;
  for (const o of opts) if (await note(TV.id, 'de_en', o) === 'exact') richtig++;
  if (richtig !== 1) doppelt++;
}
ok('6a  vocab_choices: in 40 Ziehungen immer genau eine richtige Kachel',
   doppelt === 0, `${doppelt} Ausreißer`);

const sp = (await one(`select vocab_spellings($1, $2) s`,
                      [TV.translation, 'televison'])).s;
let spRichtig = 0;
for (const s of sp) if (await note(TV.id, 'de_en', s) === 'exact') spRichtig++;
ok('6b  vocab_spellings: genau eine Fassung ist richtig',
   spRichtig === 1, JSON.stringify(sp));

/* ── Zusage 7: kurze Form bleibt streng ──────────────────────── */
/* „TV" ist zwei Zeichen, Toleranz 0. Wäre die Toleranz aus der
   längsten Form des Eintrags gerechnet, hätte „TV" zwei freie
   Zeichen — und jedes zweibuchstabige Wort wäre „fast richtig". */
ok('7a  „TX" ist nicht fast richtig für „TV"',
   await note(TV.id, 'de_en', 'TX') === 'miss');
ok('7b  „televison" dagegen schon (ein Zeichen in 10)',
   await note(TV.id, 'de_en', 'televison') === 'near');

/* ── Zusage 8: drei Zustände am Schlüssel ────────────────────── */
const L = '11111111-0000-4000-8000-000000000002';
const wieviel = async id => Number((await one(
  `select coalesce(array_length(wi_solo_chosen($1), 1), 0) n`, [id])).n);

await db.exec(`update wi_solo_learners set settings = '{}'::jsonb where id = '${L}'`);
ok('8a  kein Schlüssel „sets" → alles Freigespielte', await wieviel(L) === 2);

await db.exec(`update wi_solo_learners
                  set settings = jsonb_build_object('sets', to_jsonb(array['${SET_A}']))
                where id = '${L}'`);
ok('8b  eine gewählt → eine', await wieviel(L) === 1);

await db.exec(`update wi_solo_learners
                  set settings = jsonb_build_object('sets', '[]'::jsonb)
                where id = '${L}'`);
ok('8c  leer gewählt → KEINE', await wieviel(L) === 0);

/* Und der Weg dahin über die Funktion, die das Gerät ruft. */
const gesetzt = await one(`select wi_solo_settings('toknorm', array[]::uuid[]) v`);
ok('8d  wi_solo_settings nimmt ein leeres Array an', gesetzt.v.ok === true);
ok('8e  … und danach ist der Topf leer', await wieviel(L) === 0);

/* ── Zusage 9: der Aufräum-Block ─────────────────────────────── */
ok('9   wer vorher [] hatte, übt weiter auf allem',
   await wieviel('11111111-0000-4000-8000-000000000001') === 2);

/* ── Zusage 10: leerer Topf dreht die Runde nicht ────────────── */
const runde = async id => Number((await one(
  `select pass_no from wi_solo_learners where id = $1`, [id])).pass_no);
const vorher = await runde(L);
for (let i = 0; i < 5; i++) await db.query(`select wi_solo_next($1)`, [L]);
ok('10a  pass_no bleibt stehen', await runde(L) === vorher,
   `${vorher} → ${await runde(L)}`);
const zeile = await one(`select current_item from wi_solo_learners where id = $1`, [L]);
ok('10b  und es steht keine Aufgabe da', zeile.current_item === null);

/* Gegenprobe: mit einer Station läuft es wie bisher. */
await db.exec(`update wi_solo_learners
                  set settings = jsonb_build_object('sets', to_jsonb(array['${SET_A}']))
                where id = '${L}'`);
await db.query(`select wi_solo_next($1)`, [L]);
const zeile2 = await one(`select current_item from wi_solo_learners where id = $1`, [L]);
ok('10c  mit einer Station kommt wieder ein Wort', zeile2.current_item !== null);

/* ── Zusage 11: zweimal ──────────────────────────────────────── */
await run(mig('0169_vocab_apostroph_und_leerer_topf.sql'), '0169 (zweiter Lauf)');
ok('11a  die Migration läuft zweimal',
   await note(LIKE.id, 'de_en', "I'd like to") === 'exact');
ok('11b  der Aufraeum-Block ist im zweiten Lauf gegenstandslos',
   (await alle(`select 1 from wi_solo_learners
                 where id = '11111111-0000-4000-8000-000000000001'
                   and settings ? 'sets'`)).length === 0);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
