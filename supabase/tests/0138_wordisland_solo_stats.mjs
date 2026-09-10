/* Prüfstand für Migration 0138 — die Chronik einer Vokabel, echt
   gerechnet in pglite. Stubs wie in 0136.

   Fünf Zusagen. Alle fünf sind Stellen, an denen ein Fehler eine
   Tabelle erzeugte, die PLAUSIBEL aussieht und trotzdem falsch ist —
   und das ist die schlimmste Sorte, weil niemand nachrechnet:

     1. Auf Anhieb getippt zählt als `clean`, nicht als `helped`.
     2. Erst über die Auswahl zählt als `helped` — und das Vorkommen
        zählt EINMAL, obwohl zwei Antworten geschickt wurden.
     3. Falsch zählt weder das eine noch das andere.
     4. seen = clean + helped + wrong. Immer, über alle Zeilen.
     5. Die beiden Richtungen zählen getrennt, und wi_solo_task_json
        trägt sie in der Reihenfolge der drei Spalten ans Gerät.

   Aufruf:  node supabase/tests/0138_wordisland_solo_stats.mjs      */
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
const all = async (sql, params) => (await db.query(sql, params)).rows;
const js = v => JSON.stringify(v);

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

await run(STUBS, 'Stubs');
for (const f of ['0130_vocab_content.sql', '0131_wordisland_game.sql',
                 '0133_wordisland_lobby.sql', '0134_wordisland_back_to_lobby.sql',
                 '0135_wordisland_eight_factions.sql', '0136_wordisland_solo.sql',
                 '0137_wordisland_solo_pgcrypto.sql', '0138_wordisland_solo_stats.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0138 laufen durch —\n');

/* ── Bühne ──────────────────────────────────────────────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const R1     = 'b0000000-0000-4000-8000-000000000001';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values (null);
  insert into skill_rooms (id, code, owner_id, school_id, title) values
    ('${R1}','AAAAAA','${T}','${SCHOOL}','Stunde 1');
  insert into skill_participants (room_id, token, seat, name) values
    ('${R1}','rt-anon-1', 1, 'Mia');
`);
const SCHULE = (await one(`select id from vocab_sets where title = 'Schule'`)).id;
await db.exec(`insert into wi_room_sets (room_id, set_id) values ('${R1}','${SCHULE}')`);

const TOK = (await one(`select wi_solo_claim('rt-anon-1', null) v`)).v.token;
const LID = (await one(`select id from wi_solo_learners where token = $1`, [TOK])).id;

/* Eine Richtung, ein Modus — sonst prüft der Antwortweg unten mal
   das eine und mal das andere, und der Prüfstand wüfelt mit. */
await one(`select wi_solo_settings($1, $2::uuid[], 'de_en', 'type') v`, [TOK, [SCHULE]]);

/* ── Werkzeuge ──────────────────────────────────────────────── */
const dran = () => one(
  `select current_item i, current_dir d from wi_solo_learners where id = $1`, [LID]);
const loesung = async () => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [LID])).a;
const antwort = async v => (await one(`select wi_solo_answer($1, $2) v`, [TOK, v])).v;
const zeile = async (item, dir) => await one(
  `select clean, helped, wrong, seen from wi_solo_progress
    where learner_id = $1 and item_id = $2 and dir = $3`, [LID, item, dir]);
// Die Sperre nach einer falschen Antwort steht dem Prüfstand im Weg
// und sonst niemandem — sie hat ihren eigenen Test in 0136.
const entsperren = () => db.exec(`update wi_solo_learners set lock_until = null where id = '${LID}'`);

/* ── 1. Auf Anhieb ──────────────────────────────────────────── */
await one(`select wi_solo_start($1) v`, [TOK]);
let a = await dran();
let r = await antwort(await loesung());
ok('richtig getippt → correct', r.result === 'correct', js(r.result));
let z = await zeile(a.i, a.d);
ok('auf Anhieb zählt als „richtig"',
   Number(z.clean) === 1 && Number(z.helped) === 0 && Number(z.wrong) === 0, js(z));
ok('und als EIN Vorkommen', Number(z.seen) === 1, js(z));

/* ── 2. Erst mit Hilfe ──────────────────────────────────────── */
await entsperren();
a = await dran();
r = await antwort('xyzqwertz');
ok('daneben getippt → Auswahl aus acht Wörtern',
   r.result === 'choice' && (r.task.options || []).length === 8, js(r.result));
z = await zeile(a.i, a.d);
ok('die Zwischenstufe zählt GAR NICHT', z === undefined || Number(z.seen) === 0, js(z));

r = await antwort(await loesung());
ok('dann richtig gewählt → correct', r.result === 'correct', js(r.result));
z = await zeile(a.i, a.d);
ok('das zählt als „mit Hilfe"',
   Number(z.helped) === 1 && Number(z.clean) === 0, js(z));
/* Der Kern dieser Zusage: ZWEI Antworten, EIN Vorkommen. Gezählt
   wird, wie oft das Wort dran war — nicht, wie oft getippt wurde. */
ok('und immer noch als EIN Vorkommen', Number(z.seen) === 1, js(z));

/* ── 3. Gar nicht ───────────────────────────────────────────── */
await entsperren();
a = await dran();
await antwort('xyzqwertz');
r = await antwort('immernochfalsch');
ok('falsche Wahl → wrong', r.result === 'wrong', js(r.result));
z = await zeile(a.i, a.d);
ok('falsch zählt weder als richtig noch als mit Hilfe',
   Number(z.clean) === 0 && Number(z.helped) === 0 && Number(z.wrong) === 1, js(z));

/* ── 4. Die Summe muss aufgehen ─────────────────────────────── */
const schief = await all(
  `select item_id, dir, clean, helped, wrong, seen from wi_solo_progress
    where seen <> clean + helped + wrong`);
ok('seen = richtig + mit Hilfe + falsch, über alle Zeilen',
   schief.length === 0, js(schief.slice(0, 3)));

/* ── 5. Zwei Richtungen, zwei Zeilen ────────────────────────── */
const ITEM = a.i;
await entsperren();
// Die Gegenrichtung von Hand — der Antwortweg oben steht auf de_en
// fest, und genau darum geht es: die andere Zeile darf sich davon
// NICHT bewegt haben.
await one(`select wi_solo_record($1, $2, 'en_de', true)`, [LID, ITEM]);
await one(`select wi_solo_tally($1, $2, 'en_de', true, false)`, [LID, ITEM]);
await one(`select wi_solo_record($1, $2, 'en_de', true)`, [LID, ITEM]);
await one(`select wi_solo_tally($1, $2, 'en_de', true, true)`, [LID, ITEM]);

const de = await zeile(ITEM, 'de_en');
const en = await zeile(ITEM, 'en_de');
ok('die Gegenrichtung hat ihre eigenen Zahlen',
   Number(en.clean) === 1 && Number(en.helped) === 1 && Number(en.seen) === 2, js(en));
ok('und die erste Richtung ist davon unberührt',
   Number(de.wrong) === 1 && Number(de.clean) === 0 && Number(de.seen) === 1, js(de));

/* Und so kommen sie beim Gerät an: ein Feld je Richtung, darin die
   drei Zahlen in der Reihenfolge der drei Spalten. */
await db.exec(`update wi_solo_learners
                  set current_item = '${ITEM}', current_dir = 'de_en',
                      current_stage = 'type', current_options = '{}'
                where id = '${LID}'`);
const task = (await one(
  `select wi_solo_task_json(l) v from wi_solo_learners l where l.id = $1`, [LID])).v;
ok('die Aufgabe trägt die Zahlen mit',
   js(task.stats?.de_en) === js([0, 0, 1]) && js(task.stats?.en_de) === js([1, 1, 2]),
   js(task.stats));
ok('und immer noch nicht die Lösung',
   !Object.keys(task).some(k => ['solution', 'answer', 'translation'].includes(k)),
   js(Object.keys(task)));

/* Ein Wort, das noch nie dran war, hat keine Zeile — und darf
   deshalb auch keine erfinden. Das Gerät liest das leere Feld als
   drei Nullen. */
const NEU = (await one(
  `select id from vocab_items where set_id = $1 and id <> $2 limit 1`, [SCHULE, ITEM])).id;
await db.exec(`update wi_solo_learners set current_item = '${NEU}' where id = '${LID}'`);
const leer = (await one(
  `select wi_solo_task_json(l) v from wi_solo_learners l where l.id = $1`, [LID])).v;
ok('ein ungeübtes Wort meldet eine leere Übersicht', js(leer.stats) === '{}', js(leer.stats));

/* ── Zweiter Lauf ───────────────────────────────────────────── */
await run(mig('0138_wordisland_solo_stats.sql'), '0138 (2. Lauf)');
const nochmal = await zeile(ITEM, 'en_de');
ok('die Migration läuft zweimal — und zählt nichts zurück',
   Number(nochmal.clean) === 1 && Number(nochmal.seen) === 2, js(nochmal));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
