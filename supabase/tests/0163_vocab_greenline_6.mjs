/* Prüfstand für 0163 — Green Line 2, Jahrgang 6.
   Echt gerechnet in pglite, Stubs wie in 0136…0159.

   0160 hat Band 1 gebracht, 0163 bringt Band 2. Das Neue daran ist
   nicht die Menge, sondern dass es ab jetzt ZWEI Inselschlüssel
   gibt: en:5 und en:6. Genau daran hängt die Inselwelt, in der je
   Jahrgang ein Archipel steht.

   Die Kernzusagen:
     1. Der Bestand steht vollständig: 15 Kapitel, 45 Stationen,
        1089 Wortpaare — und zwar MITGELIEFERT (owner_id null).
     2. Er steht in Buchreihenfolge, und darin die Abschnitte.
     3. ZWEI Inseln: Band 1 auf en:5, Band 2 auf en:6, und kein
        Kapitel liegt auf beiden.
     4. Die gleichnamigen Kapitel der beiden Bände („Media smart 1",
        „Across cultures 1") sind verschiedene Zeilen — die Nummern
        werden aus Insel UND Kürzel gerechnet.
     5. Ein zweiter Lauf ändert nichts, und die Stationen behalten
        ihre Nummer (der Lernstand hängt daran).
     6. Die LÜCKE IM BUCH: „respect" steht im PDF ohne
        Stationskürzel. Es gehört ins Check-in von Unit 4 und darf
        keine eigene Station bekommen (LUECKEN in greenline.mjs).
     7. Band 1 bleibt unangetastet — 0163 fasst en:5 nicht an.
     8. Antworten werden richtig benotet, auch quer über die Bände.

   Aufruf:  node supabase/tests/0163_vocab_greenline_6.mjs */
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
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
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

const BIS_0162 = [
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
  '0161_vocab_test_units_out.sql', '0162_vocab_greenline_5_hello.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0162) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0162 laufen durch —\n');

/* Band 1 vor dem zweiten Band festhalten. Zusage 7 vergleicht
   damit; ein Abzug VORHER ist die einzige Art, „unangetastet"
   wirklich zu belegen. */
const band1Vorher = await one(`select
  (select count(*) from vocab_units where island_key = 'en:5') u,
  (select count(*) from vocab_sets s join vocab_units v on v.id = s.unit_id
    where v.island_key = 'en:5') s,
  (select count(*) from vocab_items i join vocab_sets s on s.id = i.set_id
    join vocab_units v on v.id = s.unit_id where v.island_key = 'en:5') i`);

await run(mig('0163_vocab_greenline_6.sql'), '0163');
console.log('— 0163 läuft durch —\n');

const SCHULE = 'd0000000-0000-4000-8000-000000000001';
const L      = 'e0000000-0000-4000-8000-000000000001';
await db.exec(`
  insert into schools (id, slug) values ('${SCHULE}','mps');
  insert into profiles (id, school_id) values ('${L}','${SCHULE}');
  insert into _who (uid) values ('${L}');
`);

/* ══ 1) Der Bestand ════════════════════════════════════════════ */
const kapitel = await alle(`
  select u.title, u.sort_order, u.grade, u.island_key, u.owner_id, u.school_id,
         count(distinct s.id) stationen,
         count(i.id) woerter
    from vocab_units u
    join vocab_sets s on s.unit_id = u.id
    left join vocab_items i on i.set_id = s.id
   where u.grade = 6
   group by u.id, u.title, u.sort_order, u.grade, u.island_key, u.owner_id, u.school_id
   order by u.sort_order`);

const summe = f => kapitel.reduce((n, k) => n + Number(k[f]), 0);
ok('fünfzehn Kapitel', kapitel.length === 15, kapitel.length + '');
ok('45 Stationen', summe('stationen') === 45, summe('stationen') + '');
ok('1089 Wortpaare', summe('woerter') === 1089, summe('woerter') + '');
ok('mitgeliefert — kein Kapitel gehört jemandem',
   kapitel.every(k => k.owner_id === null && k.school_id === null));

/* ══ 2) Buchreihenfolge ════════════════════════════════════════ */
ok('die Kapitel stehen wie im Buch',
   kapitel.map(k => k.title).join(' | ') ===
   ['Welcome back!', 'Unit 1 — The new boy', 'Media smart 1', 'Across cultures 1',
    'Unit 2 — London: Wow!', 'Unit 3 — Star of the internet', 'Across cultures 2',
    'Unit 4 — What’s your sport?', 'Unit 5 — Scotland, here we come!',
    'Text 1', 'Text 2', 'Text 3', 'Text 4', 'Text 5', 'Text 6'].join(' | '),
   kapitel.map(k => k.title).join(' · '));

const u2 = await alle(`
  select s.title, s.sort_order from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.title = 'Unit 2 — London: Wow!' order by s.sort_order`);
ok('und die Abschnitte einer Unit auch',
   u2.map(s => s.title).join(' | ') ===
   ['Check-in', 'Station 1', 'Station 2', 'Station 3', 'Story', 'Unit task', 'Check-out'].join(' | '),
   u2.map(s => s.title).join(' · '));

/* Die Texte am Bandende haben keine Abschnitte und werden deshalb
   eine Unit am Stück (0150) — bis auf „Text 6", der im Buch selbst
   zwei Stationen führt. */
const t1 = await alle(`
  select s.title from vocab_sets s join vocab_units u on u.id = s.unit_id
   where u.title = 'Text 1' and u.grade = 6`);
ok('ein Text ohne Abschnitte ist eine Unit am Stück',
   t1.length === 1 && t1[0].title === 'Text 1', JSON.stringify(t1));

/* ══ 3) Zwei Inseln ════════════════════════════════════════════ */
const inseln = (await alle(
  `select island_key, count(*) n from vocab_units
    where grade in (5,6) group by island_key order by 1`));
ok('Band 2 liegt auf en:6',
   kapitel.every(k => k.island_key === 'en:6'));
ok('und es sind jetzt genau zwei Inseln',
   inseln.length === 2 && inseln[0].island_key === 'en:5'
     && inseln[1].island_key === 'en:6',
   inseln.map(i => i.island_key + '×' + i.n).join(' · '));

/* Jedes Wort hängt über genau EINE Unit an genau EINER Insel — das
   ist die Voraussetzung dafür, dass ein Tier eine Heimat hat. */
const heimatlos = Number((await one(`
  select count(*) k from vocab_items i
    join vocab_sets s on s.id = i.set_id
   where s.unit_id is null`)).k);
ok('kein Wort ohne Unit — jedes Tier hat eine Heimat', heimatlos === 0,
   heimatlos + '');

/* ══ 4) Gleiche Namen, verschiedene Zeilen ═════════════════════ */
/* „Media smart 1" und „Across cultures 1/2" stehen in BEIDEN
   Bänden. Die Nummern werden aus Insel UND Kürzel gerechnet — käme
   der Bandname nicht vor, hinge Band 2 am Lernstand von Band 1. */
for (const t of ['Media smart 1', 'Across cultures 1', 'Across cultures 2']) {
  const zwei = await alle(
    `select island_key from vocab_units where title = $1 order by island_key`, [t]);
  ok(`„${t}" gibt es in beiden Bänden, als zwei Zeilen`,
     zwei.length === 2 && zwei[0].island_key === 'en:5' && zwei[1].island_key === 'en:6',
     zwei.map(z => z.island_key).join(' · '));
}

/* ══ 5) Zweiter Lauf ═══════════════════════════════════════════ */
const vorher = await one(`select
  (select count(*) from vocab_units where grade = 6) u,
  (select count(*) from vocab_sets)  s,
  (select count(*) from vocab_items) i,
  (select s2.id from vocab_sets s2 join vocab_units v on v.id = s2.unit_id
    where v.title = 'Text 1' and v.grade = 6) text1`);

await run(mig('0163_vocab_greenline_6.sql'), '0163 (zweiter Lauf)');

const nachher = await one(`select
  (select count(*) from vocab_units where grade = 6) u,
  (select count(*) from vocab_sets)  s,
  (select count(*) from vocab_items) i,
  (select s2.id from vocab_sets s2 join vocab_units v on v.id = s2.unit_id
    where v.title = 'Text 1' and v.grade = 6) text1`);

ok('der zweite Lauf legt nichts doppelt an',
   vorher.u === nachher.u && vorher.s === nachher.s && vorher.i === nachher.i,
   `${vorher.u}/${vorher.s}/${vorher.i} → ${nachher.u}/${nachher.s}/${nachher.i}`);
ok('… und die Stationen behalten ihre Nummer (der Lernstand hängt daran)',
   vorher.text1 === nachher.text1);

/* ══ 6) Die Lücke im Buch ══════════════════════════════════════ */
/* Auf Seite 18 steht „respect / Respekt" unter U4 OHNE
   Stationskürzel, direkt über dem Check-in-Block. Ohne den Eintrag
   in LUECKEN (greenline.mjs) bekäme dieses eine Wort eine eigene
   Station, die den Titel der Unit trägt und vor dem Check-in steht.
   Drei Zusagen, weil jede für sich kippen kann. */
const respect = await alle(`
  select s.title stitel, u.title utitel from vocab_items i
    join vocab_sets s on s.id = i.set_id
    join vocab_units u on u.id = s.unit_id
   where i.term = 'Respekt' and u.grade = 6`);
ok('„Respekt" steht genau einmal in Band 2', respect.length === 1,
   JSON.stringify(respect));
ok('… und zwar im Check-in von Unit 4',
   respect.length === 1 && respect[0].utitel === 'Unit 4 — What’s your sport?'
     && respect[0].stitel === 'Check-in',
   respect.length ? respect[0].utitel + ' · ' + respect[0].stitel : '—');

const u4 = await alle(`
  select s.title, count(i.id) n from vocab_sets s
    join vocab_units u on u.id = s.unit_id
    left join vocab_items i on i.set_id = s.id
   where u.title = 'Unit 4 — What’s your sport?' and u.grade = 6
   group by s.id, s.title, s.sort_order order by s.sort_order`);
ok('… Unit 4 hat keine Station, die wie die Unit heißt',
   !u4.some(s => s.title === 'Unit 4 — What’s your sport?'),
   u4.map(s => s.title).join(' · '));
ok('… und ihr Check-in zählt 36 Wörter',
   u4.length && Number(u4[0].n) === 36,
   u4.length ? u4[0].title + ':' + u4[0].n : '—');

/* ══ 7) Band 1 bleibt unangetastet ═════════════════════════════ */
const band1 = await one(`select
  (select count(*) from vocab_units where island_key = 'en:5') u,
  (select count(*) from vocab_sets s join vocab_units v on v.id = s.unit_id
    where v.island_key = 'en:5') s,
  (select count(*) from vocab_items i join vocab_sets s on s.id = i.set_id
    join vocab_units v on v.id = s.unit_id where v.island_key = 'en:5') i`);
ok('Band 1 steht Zeile für Zeile unverändert da',
   band1.u === band1Vorher.u && band1.s === band1Vorher.s && band1.i === band1Vorher.i,
   `${band1Vorher.u}/${band1Vorher.s}/${band1Vorher.i} → ${band1.u}/${band1.s}/${band1.i}`);
ok('… also weiter neun Kapitel, 33 Stationen, 907 Wörter',
   Number(band1.u) === 9 && Number(band1.s) === 33 && Number(band1.i) === 907,
   `${band1.u}/${band1.s}/${band1.i}`);

/* ══ 8) Wie das Kind antwortet ═════════════════════════════════ */
const note = async (term, dir, eingabe, grade) => {
  const r = await one(`
    select i.id from vocab_items i
      join vocab_sets s on s.id = i.set_id
      join vocab_units u on u.id = s.unit_id
     where i.term = $1 and u.grade = $2 limit 1`, [term, grade]);
  if (!r) return 'WORT FEHLT';
  return (await one(`select vocab_grade($1,$2,$3) v`, [r.id, dir, eingabe])).v;
};
ok('„respect" für Respekt',   await note('Respekt', 'de_en', 'respect', 6) === 'exact');
ok('„lake" für See',          await note('See', 'de_en', 'lake', 6) === 'exact');
ok('„house" ist für See falsch',
   await note('See', 'de_en', 'house', 6) === 'miss');

/* ══ 9) Das Pult sieht beide Bände ═════════════════════════════ */
const liste = (await one(`select vocab_sets_list() v`)).v;
ok('vocab_sets_list zeigt 33 + 45 Stationen',
   liste.ok === true && liste.sets.length === 78, String(liste.sets && liste.sets.length));
/* Die Reihenfolge entscheidet, wie beide Oberflächen gruppieren:
   erst Jahrgang, dann Unit, dann Station (0150). Stünde Band 2 vor
   Band 1, stünde in der Leiste Klasse 6 oben. */
const grades = liste.sets.map(s => s.grade);
ok('… Band 1 vor Band 2',
   grades.indexOf(6) > grades.lastIndexOf(5),
   `letzte 5 bei ${grades.lastIndexOf(5)}, erste 6 bei ${grades.indexOf(6)}`);
/* ⚠️ Gesucht wird über den TITEL und nicht über `station === 1`:
   die Stationsnummer ist der Platz im Buch (STATION in
   greenline.mjs), und Platz 1 gehört dem Check-in. „Welcome back!"
   hat keins, seine „Station 1" trägt also die 2. */
const wb = liste.sets.find(s => s.utitle === 'Welcome back!' && s.title === 'Station 1');
ok('… mit Unit, Jahrgang, Insel und Stationsnummer',
   wb && wb.grade === 6 && wb.island === 'en:6' && wb.station === 2 && wb.count === 34,
   JSON.stringify(wb && [wb.grade, wb.island, wb.station, wb.count]));

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
