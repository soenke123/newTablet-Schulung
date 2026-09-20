/* Prüfstand für 0159 + 0160 — das Lehrwerk zieht ein.
   Echt gerechnet in pglite, Stubs wie in 0136…0154.

   0159 räumt zwei Dinge weg, die mit drei Beispiellisten niemandem
   auffielen; 0160 bringt Green Line 1 mit (907 Wortpaare). Geprüft
   wird beides zusammen, weil 0160 die erste Migration ist, die 0159
   wirklich braucht.

   Die Kernzusagen:
     1. Der Bestand steht vollständig: 9 Kapitel, 33 Stationen,
        907 Wortpaare — und zwar MITGELIEFERT (owner_id null).
     2. Er steht in BUCHREIHENFOLGE: Hello!, Unit 1, Media smart 1,
        Unit 2, … und darin Check-in, Station 1–3, Story, Check-out.
     3. Er liegt auf EINER Insel: alle Kapitel tragen en:5, wie die
        Test-Units aus 0150.
     4. Ein zweiter Lauf ändert nichts (Idempotenz) — und was ein
        Kind gelernt hat, überlebt ihn.
     5. vocab_norm: „Ich bin aus …" gilt mit und ohne Punkte,
        „skates (pl)" auch als „skates", und alles aus 0130 gilt
        weiter.
     6. Die Nebenformen zählen: „Woher kommen Sie?" ist richtig,
        obwohl im Buch „Woher kommst du?" steht.
     7. wi_ensure_board legt in einen NEUEN Raum genau EINE Station
        statt aller sechsunddreißig.

   Aufruf:  node supabase/tests/0159_vocab_lehrwerk.mjs */
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

const BIS_0158 = [
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
  '0157_wordisland_sets_push.sql', '0158_wordisland_view_restore.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0158) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0158 laufen durch —\n');

await run(mig('0159_vocab_lehrwerk.sql'), '0159');
await run(mig('0160_vocab_greenline_5.sql'), '0160');
console.log('— 0159 und 0160 laufen durch —\n');

const SCHULE = 'd0000000-0000-4000-8000-000000000001';
const L      = 'e0000000-0000-4000-8000-000000000001';
await db.exec(`
  insert into schools (id, slug) values ('${SCHULE}','mps');
  insert into profiles (id, school_id) values ('${L}','${SCHULE}');
  insert into _who (uid) values ('${L}');
`);

/* ══ 1) Der Bestand ════════════════════════════════════════════ */
const zahl = async sql => Number((await one(`select (${sql}) k`)).k);

const kapitel = await alle(`
  select u.title, u.sort_order, u.grade, u.island_key, u.owner_id,
         count(distinct s.id) stationen,
         count(i.id) woerter
    from vocab_units u
    join vocab_sets s on s.unit_id = u.id
    left join vocab_items i on i.set_id = s.id
   where u.grade = 5 and u.title <> 'Test'
   group by u.id, u.title, u.sort_order, u.grade, u.island_key, u.owner_id
   order by u.sort_order`);

ok('neun Kapitel', kapitel.length === 9, kapitel.length + '');
ok('33 Stationen',
   kapitel.reduce((n, k) => n + Number(k.stationen), 0) === 33);
ok('907 Wortpaare',
   kapitel.reduce((n, k) => n + Number(k.woerter), 0) === 907,
   kapitel.reduce((n, k) => n + Number(k.woerter), 0) + '');
ok('mitgeliefert — kein Kapitel gehört jemandem',
   kapitel.every(k => k.owner_id === null));

/* ══ 2) Buchreihenfolge ════════════════════════════════════════ */
ok('die Kapitel stehen wie im Buch',
   kapitel.map(k => k.title).join(' | ') ===
   ['Hello! (Grundschulübergang)', 'Unit 1 — A new school', 'Media smart 1',
    'Unit 2 — At home', 'Across cultures 1', 'Unit 3 — Our Greenwich',
    'Across cultures 2', 'Unit 4 — Happy Birthday', 'Trailer'].join(' | '),
   kapitel.map(k => k.title).join(' · '));

const u2 = await alle(`
  select s.title, s.sort_order from vocab_sets s
    join vocab_units u on u.id = s.unit_id
   where u.title = 'Unit 2 — At home' order by s.sort_order`);
ok('und die Abschnitte einer Unit auch',
   u2.map(s => s.title).join(' | ') ===
   ['Check-in', 'Station 1', 'Station 2', 'Station 3', 'Story', 'Unit task', 'Check-out'].join(' | '),
   u2.map(s => s.title).join(' · '));

/* Eine Unit am Stück behält ihren Namen als Station (0150): ohne das
   stünde in der Leiste eine Zeile ohne Beschriftung. */
const ms = await alle(`
  select s.title from vocab_sets s join vocab_units u on u.id = s.unit_id
   where u.title = 'Media smart 1'`);
ok('ein Kapitel ohne Abschnitte ist eine Unit am Stück',
   ms.length === 1 && ms[0].title === 'Media smart 1', JSON.stringify(ms));

/* ══ 3) Eine Insel ═════════════════════════════════════════════ */
const inseln = (await alle(
  `select distinct island_key from vocab_units where grade = 5 order by 1`))
  .map(r => r.island_key);
ok('Lehrwerk und Test-Units teilen sich en:5',
   inseln.length === 1 && inseln[0] === 'en:5', inseln.join(' · '));

/* ══ 4) Zweiter Lauf ═══════════════════════════════════════════ */
/* Der Lernstand hängt an den Satz-Nummern. Bekäme ein zweiter Lauf
   neue, wären für jedes Kind alle Tiere weg — die Nummern sind
   deshalb aus dem Inhalt gerechnet, und GENAU das wird hier
   nachgemessen. */
const vorher = await one(`select
  (select count(*) from vocab_units where grade = 5) u,
  (select count(*) from vocab_sets)  s,
  (select count(*) from vocab_items) i,
  (select s2.id from vocab_sets s2 join vocab_units v on v.id = s2.unit_id
    where v.title = 'Trailer') trailer`);

await run(mig('0159_vocab_lehrwerk.sql'), '0159 (zweiter Lauf)');
await run(mig('0160_vocab_greenline_5.sql'), '0160 (zweiter Lauf)');

const nachher = await one(`select
  (select count(*) from vocab_units where grade = 5) u,
  (select count(*) from vocab_sets)  s,
  (select count(*) from vocab_items) i,
  (select s2.id from vocab_sets s2 join vocab_units v on v.id = s2.unit_id
    where v.title = 'Trailer') trailer`);

ok('der zweite Lauf legt nichts doppelt an',
   vorher.u === nachher.u && vorher.s === nachher.s && vorher.i === nachher.i,
   `${vorher.u}/${vorher.s}/${vorher.i} → ${nachher.u}/${nachher.s}/${nachher.i}`);
ok('… und die Stationen behalten ihre Nummer (der Lernstand hängt daran)',
   vorher.trailer === nachher.trailer);

/* ══ 5) vocab_norm ═════════════════════════════════════════════ */
const norm = async s => (await one(`select vocab_norm($1) v`, [s])).v;
ok('Auslassungspunkte fallen weg', await norm('Ich bin aus …') === 'ich bin aus',
   await norm('Ich bin aus …'));
ok('drei Punkte genauso', await norm('Ich bin aus ...') === 'ich bin aus');
ok('Klammerzusatz fällt weg', await norm('skates (pl)') === 'skates',
   await norm('skates (pl)'));
ok('auch angewachsen', await norm('gym(nasium)') === 'gym', await norm('gym(nasium)'));
ok('Artikel und „to" weiterhin (0130)',
   await norm('das Haus') === 'haus' && await norm('to be') === 'be');
ok('ß wird ss, Umlaute bleiben (0130)',
   await norm('Straße') === 'strasse' && await norm('Häuser') === 'häuser');

/* ══ 6) Wie das Kind antwortet ═════════════════════════════════ */
const note = async (term, dir, eingabe) => {
  const r = await one(`select id from vocab_items where term = $1 limit 1`, [term]);
  if (!r) return 'WORT FEHLT';
  return (await one(`select vocab_grade($1,$2,$3) v`, [r.id, dir, eingabe])).v;
};
ok('„friend" für Freund',            await note('Freund', 'de_en', 'friend') === 'exact');
ok('„skates" für Inlineskates',      await note('Inlineskates', 'de_en', 'skates') === 'exact');
ok('„Ich bin aus" ohne Punkte',      await note('Ich bin aus …', 'en_de', 'Ich bin aus') === 'exact');
ok('„Ich bin aus …" mit Punkten',    await note('Ich bin aus …', 'en_de', 'Ich bin aus …') === 'exact');
ok('„Freundin" zählt als Nebenform', await note('Freund', 'en_de', 'Freundin') === 'exact');
ok('„Woher kommen Sie?" zählt auch', await note('Woher kommst du?', 'en_de', 'Woher kommen Sie?') === 'exact');
ok('„gymnasium" für Turnhalle',      await note('Turnhalle', 'de_en', 'gymnasium') === 'exact');
/* Die Gegenprobe: großzügig heißt nicht beliebig. */
ok('„house" ist für Freund weiterhin falsch',
   await note('Freund', 'de_en', 'house') === 'miss');

/* ══ 7) Ein neuer Raum ═════════════════════════════════════════ */
/* Vor 0159 kam hier ALLES Mitgelieferte herein — mit dem Lehrwerk
   wären das 36 Stationen und rund tausend Wörter in einem Raum, den
   die Lehrkraft gerade erst aufgemacht hat. */
await db.exec(`
  insert into skill_rooms (id, code, owner_id, school_id, title)
  values ('b0000000-0000-4000-8000-0000000000a1','AAAAAA','${L}','${SCHULE}','Neuer Raum')`);
await db.exec(`select wi_ensure_board('b0000000-0000-4000-8000-0000000000a1')`);

const drin = await alle(`
  select s.title, u.title utitle from wi_room_sets r
    join vocab_sets s on s.id = r.set_id
    left join vocab_units u on u.id = s.unit_id
   where r.room_id = 'b0000000-0000-4000-8000-0000000000a1'`);
ok('ein neuer Raum bekommt GENAU EINE Station', drin.length === 1,
   drin.map(d => d.utitle + ' · ' + d.title).join(' | '));
ok('… und zwar die erste des Buchs',
   drin.length === 1 && drin[0].utitle === 'Hello! (Grundschulübergang)'
     && drin[0].title === 'Check-in',
   drin.length ? drin[0].utitle + ' · ' + drin[0].title : '—');
ok('sie ist nicht leer',
   await zahl(`select count(*) from vocab_items i
                join wi_room_sets r on r.set_id = i.set_id
               where r.room_id = 'b0000000-0000-4000-8000-0000000000a1'`) > 0);

/* Die Lehrkraft wählt danach selbst — das bleibt, wie es war. */
const setup = await one(`select wi_room_setup('AAAAAA', array(
  select s.id from vocab_sets s join vocab_units u on u.id = s.unit_id
   where u.title = 'Unit 1 — A new school')) v`);
ok('sie kann eine ganze Unit wählen', setup.v.ok === true, JSON.stringify(setup.v));
ok('… und dann liegen deren sechs Stationen im Raum',
   await zahl(`select count(*) from wi_room_sets
                where room_id = 'b0000000-0000-4000-8000-0000000000a1'`) === 6);

/* ══ 8) Das Pult sieht alles ═══════════════════════════════════ */
const liste = (await one(`select vocab_sets_list() v`)).v;
ok('vocab_sets_list zeigt die 36 Stationen',
   liste.ok === true && liste.sets.length === 36, String(liste.sets && liste.sets.length));
ok('… alle als mitgeliefert, keine als „meine"',
   liste.sets.every(s => s.mine === '0'));
const ci = liste.sets.find(s => s.utitle === 'Hello! (Grundschulübergang)' && s.title === 'Check-in');
ok('… mit Unit, Jahrgang, Insel und Stationsnummer',
   ci && ci.grade === 5 && ci.island === 'en:5' && ci.station === 1 && ci.count === 18,
   JSON.stringify(ci && [ci.grade, ci.island, ci.station, ci.count]));

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
