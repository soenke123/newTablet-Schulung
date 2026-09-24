/* Prüfstand für den Lehrwerkswechsel — 0170 räumt ab, 0171/0172/0173
   bringen Green Line G9 1–3. Echt gerechnet in pglite, Stubs wie in
   0136…0169.

   Dreistufig, und das ist der halbe Prüfstand: erst laufen 0130…0169
   samt dem ALTEN Bestand (0160 Band 1, 0163 Band 2). Dort wird ein
   Kind eingerichtet, das auf diesen Wörtern übt — mit Freigespieltem,
   mit einer Stationsauswahl, mit Lernstand und mit einem angefangenen
   Rundenbalken. Erst dann kommt 0170 darüber, und erst dann der neue
   Inhalt. Eine Zusage, die schon vorher grün wäre, prüft nichts.

   Die Zusagen im Einzelnen:
     1. Vorher: der alte Bestand steht da, 61 Zeichen passen nicht
        in vocab_items, das Kind übt.
     2. Nach 0170 ist der alte Bestand weg — samt allem, was daran
        hing (Lernstand, Freigespieltes, Raumauswahl).
     3. Die EIGENE Liste einer Lehrkraft für Klasse 6 überlebt. Der
        Löschbefehl nennt Nummern und nicht „alles mit grade 6".
     4. Die laufende Aufgabe wird zu null statt zu einem Fehler.
     5. ⚠️ Die Kernzusage: das Kind sitzt danach NICHT in einer
        Sackgasse. `settings->'sets'` zeigte auf gelöschte Stationen;
        ohne den Aufräum-Block hieße das seit 0169 „nichts gewählt",
        und auch eine neue Freischaltung brächte nichts mehr.
     6. Wer noch eine lebende Station gewählt hat, behält seine
        Auswahl.
     7. Der Rundenbalken fängt bei null an.
     8. Die neue Längengrenze: 120 geht, 121 nicht.
     9. Am Ende stehen GENAU DREI Inseln: en:5, en:6, en:7.
    10. Die Zahlen stimmen (Kapitel, Stationen, Wortpaare je Band).
    11. Die Stationen stehen in Buchreihenfolge — nicht in einer
        erfundenen.
    12. Die sechs langen Einträge sind da (die, die vorher still
        weggefallen sind).
    13. Keine Nummer des neuen Bestands gleicht einer des alten.
    14. 0169 gilt auch auf dem neuen Inhalt: „BC (= before Christ)".
    15. Ein Kind bekommt aus dem neuen Bestand wieder Aufgaben.
    16. Alle vier Migrationen laufen zweimal.

   Aufruf:  node supabase/tests/0170_vocab_lehrwerkwechsel.mjs      */
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
const zahl = async (sql, params) => Number((await one(sql, params)).n);

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
/* Geht der Befehl schief, ist das hier die ANTWORT und kein Abbruch —
   zwei Zusagen prüfen genau das (die Längengrenze). */
const geht = async (sql) => {
  try { await db.exec(sql); return true; } catch { return false; }
};

const BIS_0169 = [
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
  '0168_wordisland_trainer_island.sql', '0169_vocab_apostroph_und_leerer_topf.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0169) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0169 laufen durch —\n');


/* ══ Stufe 1: die Welt vor dem Wechsel ═════════════════════════ */

const ALT_UNIT   = 'b535cb16-66f3-4c5a-8e69-7c9471212c90';   // Unit 1 — A new school
const ALT_UNIT_6 = 'e95eb07e-4c2c-4b01-87b6-d1e2cc5b28e0';   // Unit 1 — The new boy

ok('1a  der alte Bestand steht da',
   await zahl(`select count(*) n from vocab_units where id in ($1, $2)`,
              [ALT_UNIT, ALT_UNIT_6]) === 2);

const altWoerter = await zahl(`select count(*) n from vocab_items`);
ok('1b  … mit seinen Wörtern', altWoerter > 1500, `${altWoerter}`);

/* 61 Zeichen — die Grenze, an der sechs echte Einträge gescheitert
   sind. Ein eigener Satz dafür, damit der Versuch nichts kaputt
   macht, was später gezählt wird. */
const SET_ALT_5 = (await one(
  `select s.id from vocab_sets s where s.unit_id = $1 order by s.sort_order limit 1`,
  [ALT_UNIT])).id;
const EINUNDSECHZIG = 'x'.repeat(61);
ok('1c  vorher passen 61 Zeichen NICHT in vocab_items',
   !(await geht(`insert into vocab_items (set_id, term, translation, sort_order)
                 values ('${SET_ALT_5}', 'Probe61', '${EINUNDSECHZIG}', 9001)`)));

/* ── Ein Kind, das auf dem alten Bestand übt ─────────────────── */
const SET_ALT_A = SET_ALT_5;
const SET_ALT_B = (await one(
  `select s.id from vocab_sets s where s.unit_id = $1 order by s.sort_order limit 1`,
  [ALT_UNIT_6])).id;

/* ── Und eine EIGENE Liste einer Lehrkraft, ebenfalls Klasse 6 ──
   Sie ist der Grund, warum 0170 Nummern nennt und nicht „grade 6". */
await db.exec(`
  insert into schools (id, slug) values ('55555555-0000-4000-8000-000000000001', 'mps')
    on conflict (id) do nothing;
  insert into profiles (id, school_id) values
    ('66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001')
    on conflict (id) do nothing;
  insert into vocab_units (id, title, lang_from, lang_to, grade, sort_order, owner_id, school_id)
    values ('77777777-0000-4000-8000-000000000001', 'Klassenarbeit Dienstag', 'de', 'en', 6, 1,
            '66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001')
    on conflict (id) do nothing;
  insert into vocab_sets (id, title, lang_from, lang_to, level, unit_id, sort_order,
                          owner_id, school_id)
    values ('77777777-0000-4000-8000-000000000002', 'Liste 1', 'de', 'en', '6',
            '77777777-0000-4000-8000-000000000001', 1,
            '66666666-0000-4000-8000-000000000001', '55555555-0000-4000-8000-000000000001')
    on conflict (id) do nothing;
  insert into vocab_items (set_id, term, translation, sort_order)
    values ('77777777-0000-4000-8000-000000000002', 'Beispiel', 'example', 1)
    on conflict do nothing;
`);
const SET_EIGEN = '77777777-0000-4000-8000-000000000002';

const KIND      = '11111111-0000-4000-8000-000000000001';   // übt nur auf dem Lehrwerk
const KIND_MIX  = '11111111-0000-4000-8000-000000000002';   // hat auch die eigene Liste
await db.exec(`
  insert into wi_solo_learners (id, token, settings, pass_done) values
    ('${KIND}',     'tokbuch', jsonb_build_object('sets', to_jsonb(array['${SET_ALT_A}','${SET_ALT_B}'])), 17),
    ('${KIND_MIX}', 'tokmix',  jsonb_build_object('sets', to_jsonb(array['${SET_ALT_A}','${SET_EIGEN}'])),  4)
  on conflict (id) do update set settings = excluded.settings, pass_done = excluded.pass_done;
  insert into wi_solo_sets (learner_id, set_id) values
    ('${KIND}', '${SET_ALT_A}'), ('${KIND}', '${SET_ALT_B}'),
    ('${KIND_MIX}', '${SET_ALT_A}'), ('${KIND_MIX}', '${SET_EIGEN}')
  on conflict do nothing;
`);

/* Lernstand: ein paar Tiere auf der Insel. Über die echte Funktion
   und nicht per insert — sonst prüft der Prüfstand seine eigene
   Vorstellung von der Tabelle. */
const woerterAlt = await alle(
  `select id from vocab_items where set_id = $1 order by sort_order limit 5`, [SET_ALT_A]);
for (const w of woerterAlt) {
  await db.query(`select wi_solo_points($1, $2, 'de_en', 3, true)`, [KIND, w.id]);
  await db.query(`select wi_solo_points($1, $2, 'en_de', 3, true)`, [KIND, w.id]);
}
ok('1d  das Kind hat Lernstand',
   await zahl(`select count(*) n from wi_solo_progress where learner_id = $1`, [KIND]) === 10);

await db.query(`select wi_solo_next($1)`, [KIND]);
const aufgabeVor = await one(`select current_item from wi_solo_learners where id = $1`, [KIND]);
ok('1e  … und eine Aufgabe vor sich', aufgabeVor.current_item !== null);
ok('1f  … und übt auf zwei Stationen',
   await zahl(`select coalesce(array_length(wi_solo_chosen($1), 1), 0) n`, [KIND]) === 2);


/* ══ Stufe 2: 0170 ═════════════════════════════════════════════ */
await run(mig('0170_vocab_lehrwerkwechsel.sql'), '0170');
console.log('\n— 0170 läuft durch —\n');

/* ── Zusage 2: der alte Bestand ist weg ──────────────────────── */
ok('2a  die alten Kapitel sind weg',
   await zahl(`select count(*) n from vocab_units where id in ($1, $2)`,
              [ALT_UNIT, ALT_UNIT_6]) === 0);
ok('2b  ihre Stationen auch',
   await zahl(`select count(*) n from vocab_sets where id in ($1, $2)`,
              [SET_ALT_A, SET_ALT_B]) === 0);
ok('2c  der Lernstand des Kindes ist mitgegangen',
   await zahl(`select count(*) n from wi_solo_progress where learner_id = $1`, [KIND]) === 0);
ok('2d  das Freigespielte auch',
   await zahl(`select count(*) n from wi_solo_sets where learner_id = $1`, [KIND]) === 0);

/* ── Zusage 3: die eigene Liste überlebt ─────────────────────── */
ok('3a  die eigene Liste der Lehrkraft steht noch',
   await zahl(`select count(*) n from vocab_units where id = '77777777-0000-4000-8000-000000000001'`) === 1);
ok('3b  … mit ihrer Station',
   await zahl(`select count(*) n from vocab_sets where id = $1`, [SET_EIGEN]) === 1);
ok('3c  … und ihrem Wort',
   await zahl(`select count(*) n from vocab_items where set_id = $1`, [SET_EIGEN]) === 1);

/* ── Zusage 4: die laufende Aufgabe wird null ────────────────── */
const aufgabeNach = await one(`select current_item from wi_solo_learners where id = $1`, [KIND]);
ok('4   die laufende Aufgabe ist null und kein Fehler', aufgabeNach.current_item === null);

/* ── Zusage 5: keine Sackgasse ───────────────────────────────── */
ok('5a  die tote Auswahl ist weg',
   await zahl(`select count(*) n from wi_solo_learners where id = $1 and settings ? 'sets'`,
              [KIND]) === 0);
/* Der eigentliche Beweis: eine neue Freischaltung wirkt wieder.
   Ohne den Aufräum-Block bliebe hier 0 stehen, für immer. */
await db.exec(`insert into wi_solo_sets (learner_id, set_id)
               values ('${KIND}', '${SET_EIGEN}') on conflict do nothing`);
ok('5b  eine neue Freischaltung kommt wieder an',
   await zahl(`select coalesce(array_length(wi_solo_chosen($1), 1), 0) n`, [KIND]) === 1);

/* ── Zusage 6: wer eine lebende Station hatte, behält sie ────── */
ok('6a  die gemischte Auswahl bleibt bestehen',
   await zahl(`select count(*) n from wi_solo_learners where id = $1 and settings ? 'sets'`,
              [KIND_MIX]) === 1);
ok('6b  … und zeigt auf die überlebende Station',
   await zahl(`select coalesce(array_length(wi_solo_chosen($1), 1), 0) n`, [KIND_MIX]) === 1);

/* ── Zusage 7: der Rundenbalken ──────────────────────────────── */
ok('7   pass_done steht überall auf null',
   await zahl(`select count(*) n from wi_solo_learners where pass_done <> 0`) === 0);

/* ── Zusage 8: die neue Längengrenze ─────────────────────────── */
ok('8a  120 Zeichen gehen jetzt',
   await geht(`insert into vocab_items (set_id, term, translation, sort_order)
               values ('${SET_EIGEN}', 'Probe120', '${'x'.repeat(120)}', 9002)`));
ok('8b  121 nicht',
   !(await geht(`insert into vocab_items (set_id, term, translation, sort_order)
                 values ('${SET_EIGEN}', 'Probe121', '${'x'.repeat(121)}', 9003)`)));
await db.exec(`delete from vocab_items where term = 'Probe120'`);


/* ══ Stufe 3: der neue Bestand ═════════════════════════════════ */
await run(mig('0171_vocab_greenline_g9_5.sql'), '0171');
await run(mig('0172_vocab_greenline_g9_6.sql'), '0172');
await run(mig('0173_vocab_greenline_g9_7.sql'), '0173');
console.log('\n— 0171 … 0173 laufen durch —\n');

/* ── Zusage 9: genau drei Inseln ─────────────────────────────── */
const inseln = (await alle(
  `select distinct island_key k from vocab_units where owner_id is null order by 1`))
  .map(r => r.k);
ok('9   am Ende stehen genau drei Inseln',
   JSON.stringify(inseln) === JSON.stringify(['en:5', 'en:6', 'en:7']),
   JSON.stringify(inseln));

/* ── Zusage 10: die Zahlen ───────────────────────────────────── */
const ERWARTET = { 5: [10, 41, 827], 6: [11, 51, 1119], 7: [12, 44, 815] };
for (const [jg, [kap, st, wp]] of Object.entries(ERWARTET)) {
  const r = await one(`
    select (select count(*) from vocab_units u
             where u.grade = $1 and u.owner_id is null)                         as kapitel,
           (select count(*) from vocab_sets s
              join vocab_units u on u.id = s.unit_id
             where u.grade = $1 and u.owner_id is null)                         as stationen,
           (select count(*) from vocab_items i
              join vocab_sets s  on s.id = i.set_id
              join vocab_units u on u.id = s.unit_id
             where u.grade = $1 and u.owner_id is null)                         as woerter`, [jg]);
  ok(`10  Jahrgang ${jg}: ${kap} Kapitel, ${st} Stationen, ${wp} Wortpaare`,
     Number(r.kapitel) === kap && Number(r.stationen) === st && Number(r.woerter) === wp,
     `${r.kapitel}/${r.stationen}/${r.woerter}`);
}

/* ── Zusage 11: Stationen in Buchreihenfolge ─────────────────── */
/* Green Line G9 1, Unit 2 „I'm new at TTS": im Inhaltsverzeichnis
   steht Check-in 36 · Station 1 38 · Station 2 42 · Skills 45 ·
   Unit task 46 · Story 48 · Action UK! 50 · Check-out 51. Die
   Station „Skills" trägt dort kein einziges neues Wort, deshalb
   fehlt sie in der Liste — die ÜBRIGEN müssen aber in genau dieser
   Folge stehen. Mit der alten festen Tabelle (Story vor Unit task)
   käme eine andere heraus. */
const u2 = (await alle(`
  select s.title from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.grade = 5 and u.title like 'Unit 2 %'
   order by s.sort_order`)).map(r => r.title);
ok('11a Green Line G9 1, Unit 2 steht in Buchreihenfolge',
   JSON.stringify(u2) === JSON.stringify(
     ['Check-in', 'Station 1', 'Station 2', 'Unit task', 'Story', 'Action UK!', 'Check-out']),
   JSON.stringify(u2));

/* Band 2, Unit 3 „London is amazing!": dort steht Action UK! (52)
   VOR Skills (53) — der Fall, an dem jede feste Tabelle scheitert. */
const u3 = (await alle(`
  select s.title from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.grade = 6 and u.title like 'Unit 3 %'
   order by s.sort_order`)).map(r => r.title);
ok('11b Band 2, Unit 3: Action UK! steht VOR Skills',
   u3.indexOf('Action UK!') >= 0 && u3.indexOf('Action UK!') < u3.indexOf('Skills'),
   JSON.stringify(u3));

/* Und die Lücke aus dem Buch: „to stay in touch (with)" steht in
   Band 2, Unit 5 ohne Kürzel über dem Check-in. Ohne den Eintrag in
   LUECKEN bekäme es eine eigene Station, die den Titel der Unit
   trägt — und die stünde vor dem Check-in. */
const u5erste = (await alle(`
  select s.title from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.grade = 6 and u.title like 'Unit 5 %'
   order by s.sort_order limit 1`)).map(r => r.title)[0];
ok('11c Band 2, Unit 5 fängt mit dem Check-in an', u5erste === 'Check-in', String(u5erste));
ok('11d … und das Titelwort steckt darin',
   await zahl(`select count(*) n from vocab_items i
                 join vocab_sets s  on s.id = i.set_id
                 join vocab_units u on u.id = s.unit_id
                where u.grade = 6 and u.title like 'Unit 5 %'
                  and s.title = 'Check-in'
                  and i.translation like 'to stay in touch%'`) === 1);

/* ── Zusage 12: die sechs langen Einträge ────────────────────── */
for (const w of ['cyber bully', 'mudlark', 'kimbap', 'call-in', 'haggis', 'cream tea']) {
  ok(`12  „${w}" ist drin`,
     await zahl(`select count(*) n from vocab_items where translation = $1`, [w]) === 1);
}
const laengster = await one(
  `select term, char_length(term) l from vocab_items order by char_length(term) desc limit 1`);
ok('12x der längste Eintrag hätte die alte Grenze gesprengt',
   Number(laengster.l) > 60, `${laengster.l}: ${laengster.term}`);

/* ── Zusage 13: keine Nummer gleicht einer alten ─────────────── */
/* Die alten sind gelöscht, also lässt sich das nicht am Bestand
   ablesen — es muss gegen die Nummern von 0160/0163 geprüft werden,
   und zwar gegen die, die dieselbe STELLE bezeichnen: Jahrgang 5,
   Unit 1, Check-in. Ohne die Kennung im Schlüssel wäre das dieselbe
   uuid, und eine Auswahl, die irgendwo als blankes JSON liegt,
   zeigte nach dem Wechsel auf fremden Inhalt. */
const neuU1 = await one(
  `select id from vocab_units where grade = 5 and owner_id is null and title like 'Unit 1 %'`);
ok('13  die neue Unit 1 hat eine andere Nummer als die alte',
   neuU1.id !== ALT_UNIT, `${neuU1.id}`);

/* ── Zusage 14: 0169 gilt auf dem neuen Inhalt ───────────────── */
const bc = await one(
  `select id, term, translation from vocab_items where translation like 'BC (= before Christ)%' limit 1`);
ok('14a „BC (= before Christ)" steht im Bestand', !!bc);
if (bc) {
  ok('14b „before Christ" ist richtig',
     (await one(`select vocab_grade($1, 'de_en', 'before Christ') g`, [bc.id])).g === 'exact');
  ok('14c „BC" auch',
     (await one(`select vocab_grade($1, 'de_en', 'BC') g`, [bc.id])).g === 'exact');
}

/* ── Zusage 15: das Kind übt wieder ──────────────────────────── */
const NEU_SETS = await alle(`
  select s.id from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.grade = 5 and u.owner_id is null
   order by u.sort_order, s.sort_order limit 2`);
await db.exec(`
  delete from wi_solo_sets where learner_id = '${KIND}';
  insert into wi_solo_sets (learner_id, set_id) values
    ('${KIND}', '${NEU_SETS[0].id}'), ('${KIND}', '${NEU_SETS[1].id}')
  on conflict do nothing;
  update wi_solo_learners set settings = '{}'::jsonb where id = '${KIND}';
`);
await db.query(`select wi_solo_next($1)`, [KIND]);
const neueAufgabe = await one(
  `select current_item, current_dir from wi_solo_learners where id = $1`, [KIND]);
ok('15a das Kind bekommt wieder eine Aufgabe', neueAufgabe.current_item !== null);
const wort = await one(`select term, translation from vocab_items where id = $1`,
                       [neueAufgabe.current_item]);
ok('15b … und sie kommt aus dem neuen Bestand', !!wort, wort ? `${wort.term} → ${wort.translation}` : '');
const antwort = await one(`select wi_solo_answer($1, $2) v`, ['tokbuch', wort.translation]);
ok('15c … und eine richtige Antwort wird angenommen',
   antwort.v && antwort.v.ok === true, JSON.stringify(antwort.v && antwort.v.grade));

/* ── Zusage 16: zweimal ──────────────────────────────────────── */
for (const f of ['0170_vocab_lehrwerkwechsel.sql', '0171_vocab_greenline_g9_5.sql',
                 '0172_vocab_greenline_g9_6.sql', '0173_vocab_greenline_g9_7.sql']) {
  await run(mig(f), f.slice(0, 4) + ' (zweiter Lauf)');
}
const nachZwei = await zahl(
  `select count(*) n from vocab_items i
     join vocab_sets s  on s.id = i.set_id
     join vocab_units u on u.id = s.unit_id
    where u.owner_id is null`);
ok('16a alle vier laufen zweimal und der Bestand bleibt derselbe',
   nachZwei === 827 + 1119 + 815, `${nachZwei}`);
ok('16b die Längengrenze steht danach immer noch auf 120',
   !(await geht(`insert into vocab_items (set_id, term, translation, sort_order)
                 values ('${SET_EIGEN}', 'Probe121b', '${'x'.repeat(121)}', 9004)`)));

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
