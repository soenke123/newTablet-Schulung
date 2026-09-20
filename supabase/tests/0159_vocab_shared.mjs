/* Prüfstand für Migration 0159 — das Lehrwerk gehört der Schule.
   Echt gerechnet in pglite, Stubs wie in 0136…0154.

   Die Kernzusagen:
     1. Die dritte Sichtbarkeit trägt: die Kollegin DERSELBEN Schule
        sieht den geteilten Satz, die Lehrkraft einer anderen nicht.
     2. Geteilt ist nicht „meins": `mine` bleibt '0', auch für den
        Besitzer — im Pult steht der Bestand damit unter „Units" und
        trägt kein Löschzeichen.
     3. Die Kollegin darf ihn auch WÄHLEN. Das ist der eigentliche
        Zweck: ohne wi_room_setup sähe sie ihn und bekäme ihn nicht.
     4. Gelöscht wird er über die Oberfläche von niemandem, auch
        nicht vom Besitzer.
     5. Das Kontingent von 40 eigenen Listen zählt den Schulbestand
        nicht mit.
     6. vocab_norm: „Ich bin aus …" gilt mit und ohne Punkte,
        „skates (pl)" auch als „skates" — und alles aus 0130 gilt
        weiter.
     7. Jahrgang 5 landet auf derselben Insel wie die Test-Units
        (`en:5`) — es bleibt bei EINER.
     8. Die Migration läuft zweimal (Idempotenz).

   Aufruf:  node supabase/tests/0159_vocab_shared.mjs */
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

await run(mig('0159_vocab_shared.sql'), '0159');
await run(mig('0159_vocab_shared.sql'), '0159 (zweiter Lauf)');
console.log('— 0159 läuft zweimal durch —\n');

const MPS   = 'd0000000-0000-4000-8000-000000000001';
const ANDRE = 'd0000000-0000-4000-8000-000000000002';
const A     = 'e0000000-0000-4000-8000-000000000001';   // spielt das Buch ein
const B     = 'e0000000-0000-4000-8000-000000000002';   // Kollegin, gleiche Schule
const C     = 'e0000000-0000-4000-8000-000000000003';   // andere Schule
const RAUM_B = 'b0000000-0000-4000-8000-0000000000b1';

await db.exec(`
  insert into schools (id, slug) values ('${MPS}','mps'), ('${ANDRE}','hogwarts');
  insert into profiles (id, school_id) values
    ('${A}','${MPS}'), ('${B}','${MPS}'), ('${C}','${ANDRE}');
  insert into _who (uid) values ('${A}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${RAUM_B}','BBBBBB','${B}','${MPS}','Raum der Kollegin');
`);

const wer = uid => db.exec(`update _who set uid = ${uid ? `'${uid}'` : 'null'}`);

/* Das Lehrwerk, so wie das erzeugte Skript es anlegt: eine Unit mit
   Jahrgang, zwei Stationen, Besitzer A, geteilt. Daneben eine private
   Liste von A — sie ist die Gegenprobe zu allem hier. */
const UNIT = 'c0000000-0000-4000-8000-00000000u001'.replace('u', '0');
const ST1  = 'c0000000-0000-4000-8000-000000000101';
const ST2  = 'c0000000-0000-4000-8000-000000000102';
const PRIV = 'c0000000-0000-4000-8000-000000000201';

await db.exec(`
  insert into vocab_units (id, title, lang_from, lang_to, grade, sort_order,
                           owner_id, school_id, shared)
    values ('${UNIT}', 'Unit 1 — A new school', 'de', 'en', 5, 2, '${A}', '${MPS}', true);
  insert into vocab_sets (id, title, lang_from, lang_to, unit_id, sort_order,
                          owner_id, school_id, shared) values
    ('${ST1}', 'Check-in',  'de', 'en', '${UNIT}', 1, '${A}', '${MPS}', true),
    ('${ST2}', 'Station 1', 'de', 'en', '${UNIT}', 2, '${A}', '${MPS}', true);
  insert into vocab_units (id, title, lang_from, lang_to, sort_order, owner_id, school_id)
    values ('${PRIV}', 'Klassenarbeit Dienstag', 'de', 'en', 0, '${A}', '${MPS}');
  insert into vocab_sets (id, title, lang_from, lang_to, unit_id, sort_order, owner_id, school_id)
    values ('${PRIV}', 'Klassenarbeit Dienstag', 'de', 'en', '${PRIV}', 1, '${A}', '${MPS}');
  insert into vocab_items (set_id, term, translation, alt, alt_term, sort_order) values
    ('${ST1}', 'Ich bin aus …', 'I''m from …', '{}', '{}', 1),
    ('${ST1}', 'Inlineskates', 'skates (pl)', '{}', '{Rollschuhe}', 2),
    ('${ST2}', 'Freund', 'friend', '{}', '{Freundin}', 1),
    ('${PRIV}', 'Kuchen', 'cake', '{pie}', '{}', 1);
`);

const liste = async () => (await one(`select vocab_sets_list() v`)).v;
const titel = l => (l.sets || []).map(s => s.title);

/* ══ 1) Wer sieht was ══════════════════════════════════════════ */
await wer(B);
const beiB = await liste();
ok('die Kollegin sieht das geteilte Lehrwerk',
   titel(beiB).includes('Check-in') && titel(beiB).includes('Station 1'),
   titel(beiB).join(' · '));
ok('… aber nicht die private Liste der Kollegin A',
   !titel(beiB).includes('Klassenarbeit Dienstag'));
ok('… und die drei mitgelieferten Sätze weiterhin',
   titel(beiB).some(t => t.includes('Schule')));

await wer(C);
const beiC = await liste();
ok('die andere Schule sieht das Lehrwerk NICHT',
   !titel(beiC).includes('Check-in'), titel(beiC).join(' · '));
ok('… wohl aber die mitgelieferten Sätze',
   titel(beiC).some(t => t.includes('Schule')));

/* ══ 2) Geteilt ist nicht „meins" ══════════════════════════════ */
await wer(A);
const beiA = await liste();
const ci = (beiA.sets || []).find(s => s.title === 'Check-in');
const priv = (beiA.sets || []).find(s => s.title === 'Klassenarbeit Dienstag');
ok('der Besitzer sieht den geteilten Satz nicht als „meins"', ci && ci.mine === '0',
   ci && ci.mine);
ok('seine private Liste dagegen schon', priv && priv.mine === '1', priv && priv.mine);
ok('die Unit fährt mit (Titel, Jahrgang, Station)',
   ci && ci.utitle === 'Unit 1 — A new school' && ci.grade === 5 && ci.station === 1,
   JSON.stringify(ci && [ci.utitle, ci.grade, ci.station]));

/* ══ 3) Hineinsehen darf, wer sie sieht ════════════════════════ */
const woerter = async set => (await one(`select vocab_set_words($1) v`, [set])).v;
await wer(B);
const wB = await woerter(ST1);
ok('die Kollegin darf in die Wörter sehen', wB.ok === true && wB.words.length === 2,
   JSON.stringify(wB).slice(0, 90));
const wBpriv = await woerter(PRIV);
ok('in die fremde private Liste nicht', wBpriv.ok === false && wBpriv.error === 'not_found');
await wer(C);
const wC = await woerter(ST1);
ok('die andere Schule auch nicht', wC.ok === false && wC.error === 'not_found');

/* ══ 4) Und WÄHLEN darf sie ihn auch ═══════════════════════════ */
/* Ohne diesen Abschnitt wäre die ganze Migration Fassade: die Liste
   zeigte die Station, und der Raum bliebe leer. */
await wer(B);
const setup = await one(
  `select wi_room_setup('BBBBBB', array['${ST1}','${PRIV}']::uuid[]) v`);
ok('wi_room_setup nimmt die Wahl an', setup.v.ok === true, JSON.stringify(setup.v));

const imRaum = (await db.query(
  `select set_id from wi_room_sets where room_id = '${RAUM_B}'`)).rows.map(r => r.set_id);
ok('die geteilte Station liegt im Raum', imRaum.includes(ST1), imRaum.join(' · '));
ok('die fremde private Liste NICHT', !imRaum.includes(PRIV));

/* ══ 5) Löschen geht nicht — auch nicht für den Besitzer ═══════ */
await wer(A);
const weg = await one(`select vocab_set_delete($1) v`, [ST1]);
ok('der Besitzer kann den Schulbestand nicht löschen',
   weg.v.ok === false && weg.v.error === 'not_found', JSON.stringify(weg.v));
ok('… und die Station steht noch',
   Number((await one(`select count(*) k from vocab_sets where id = $1`, [ST1])).k) === 1);

const wegPriv = await one(`select vocab_set_delete($1) v`, [PRIV]);
ok('seine eigene Liste löscht er weiterhin', wegPriv.v.ok === true, JSON.stringify(wegPriv.v));
ok('… und ihr leeres Dach geht mit',
   Number((await one(`select count(*) k from vocab_units where id = $1`, [PRIV])).k) === 0);

/* ══ 6) Das Kontingent zählt den Schulbestand nicht ════════════ */
/* 45 geteilte Sätze auf dem Konto von A — ein Jahrgang sind 33, zwei
   wären darüber. Danach muss ein eigener Import immer noch gehen. */
await db.exec(`
  insert into vocab_sets (title, lang_from, lang_to, unit_id, sort_order,
                          owner_id, school_id, shared)
  select 'Station ' || g, 'de', 'en', '${UNIT}', 10 + g, '${A}', '${MPS}', true
    from generate_series(1, 45) g;
`);
const imp = await one(
  `select vocab_set_import('Eigene Liste', E'Haus\they house') v`);
ok('ein eigener Import geht trotz 47 geteilter Sätze', imp.v.ok === true,
   JSON.stringify(imp.v));

/* Die Grenze gilt aber weiter, wo sie gemeint war. */
await db.exec(`
  insert into vocab_sets (title, lang_from, lang_to, owner_id, school_id)
  select 'Eigene ' || g, 'de', 'en', '${A}', '${MPS}' from generate_series(1, 45) g;
`);
const imp2 = await one(`select vocab_set_import('Noch eine', E'Tür\tdoor') v`);
ok('bei 40 EIGENEN Listen ist weiterhin Schluss',
   imp2.v.ok === false && imp2.v.error === 'quota_exceeded', JSON.stringify(imp2.v));

/* ══ 7) vocab_norm — Punkte und Klammern ═══════════════════════ */
const norm = async s => (await one(`select vocab_norm($1) v`, [s])).v;
ok('Auslassungspunkte fallen weg', await norm('Ich bin aus …') === 'ich bin aus',
   await norm('Ich bin aus …'));
ok('drei Punkte genauso', await norm('Ich bin aus ...') === 'ich bin aus');
ok('Klammerzusatz fällt weg', await norm('skates (pl)') === 'skates',
   await norm('skates (pl)'));
ok('auch mitten im Wort', await norm('gym(nasium)') === 'gym', await norm('gym(nasium)'));
ok('Artikel und „to" weiterhin (0130)',
   await norm('das Haus') === 'haus' && await norm('to be') === 'be');
ok('ß wird ss, Umlaute bleiben (0130)',
   await norm('Straße') === 'strasse' && await norm('Häuser') === 'häuser');

const item = await one(
  `select id from vocab_items where set_id = $1 and term = 'Ich bin aus …'`, [ST1]);
const note = async (dir, eingabe) =>
  (await one(`select vocab_grade($1, $2, $3) v`, [item.id, dir, eingabe])).v;
ok('„Ich bin aus …" gilt MIT Punkten', await note('en_de', 'Ich bin aus …') === 'exact');
ok('… und ohne', await note('en_de', 'Ich bin aus') === 'exact');
const skates = await one(
  `select id from vocab_items where set_id = $1 and term = 'Inlineskates'`, [ST1]);
ok('„skates" gilt für „skates (pl)"',
   (await one(`select vocab_grade($1,'de_en','skates') v`, [skates.id])).v === 'exact');

/* ══ 8) Eine Insel ═════════════════════════════════════════════ */
const inseln = (await db.query(
  `select distinct island_key from vocab_units where grade = 5 order by 1`)).rows
  .map(r => r.island_key);
ok('Lehrwerk und Test-Units teilen sich en:5',
   inseln.length === 1 && inseln[0] === 'en:5', inseln.join(' · '));

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
