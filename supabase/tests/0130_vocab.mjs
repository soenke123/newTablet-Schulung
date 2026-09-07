/* Prüfstand für Migration 0130 — echtes Postgres in node (pglite).
   Stubs für alles, was aus früheren Migrationen kommt. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
-- gen_random_uuid() ist seit PG13 eingebaut; pgcrypto bringt pglite nicht mit.
create schema if not exists auth;
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_rooms (id uuid primary key default gen_random_uuid());
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references skill_rooms(id) on delete cascade,
  seat int not null default 1);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
create role service_role;
create role authenticated;
create role anon;
`;

const ok = (label, cond, extra = '') =>
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

/* Fehler klein halten: pglite hängt bei einem Abbruch den halben
   Bundle-Stack an die Ausnahme, und der verdeckt die eine Zeile,
   auf die es ankommt. */
const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint)     console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle:  ${sql.slice(Math.max(0, e.position - 220), Number(e.position) + 80)}`);
    process.exit(1);
  }
};

await run(STUBS, 'Stubs');
await run(readFileSync(`${REPO}/supabase/migrations/0130_vocab_content.sql`, 'utf8'), '0130');
console.log('— Migration 0130 läuft durch —\n');

/* ── Normalisierer ─────────────────────────────────────────── */
const norm = async (s) => (await one('select vocab_norm($1) v', [s])).v;
ok('Artikel fällt weg',        await norm('das Haus') === 'haus');
ok('to fällt weg',             await norm('to go') === 'go');
ok('the fällt weg',            await norm('The House') === 'house');
ok('ß wird ss',                await norm('Straße') === 'strasse');
ok('Umlaut bleibt',            await norm('Häuser') === 'häuser');
ok('Satzzeichen weg',          await norm('  Haus. ') === 'haus');

/* ── Levenshtein ───────────────────────────────────────────── */
const lev = async (a, b) => (await one('select vocab_lev($1,$2) v', [a, b])).v;
ok('lev house/hous = 1',       await lev('house', 'hous') === 1);
ok('lev house/house = 0',      await lev('house', 'house') === 0);
ok('lev kitten/sitting = 3',   await lev('kitten', 'sitting') === 3);
ok('lev leer',                 await lev('', 'abc') === 3);

/* ── Prüfer ────────────────────────────────────────────────── */
const item = async (term) =>
  (await one('select id from vocab_items where term = $1', [term])).id;
const grade = async (id, dir, input) =>
  (await one('select vocab_grade($1,$2,$3) g', [id, dir, input])).g;

const haus = await item('das Haus');
ok('house = exact',            await grade(haus, 'de_en', 'house') === 'exact');
ok('House = exact',            await grade(haus, 'de_en', '  House ') === 'exact');
ok('the house = exact',        await grade(haus, 'de_en', 'the house') === 'exact');
ok('hous = near',              await grade(haus, 'de_en', 'hous') === 'near');
ok('table = miss',             await grade(haus, 'de_en', 'table') === 'miss');
ok('leer = miss',              await grade(haus, 'de_en', '   ') === 'miss');
ok('rück: Haus = exact',       await grade(haus, 'en_de', 'Haus') === 'exact');
ok('rück: das Haus = exact',   await grade(haus, 'en_de', 'das Haus') === 'exact');
// „Hauser" ist für „Haus" kein Vertipper, sondern ein anderes Wort —
// zwei Zeichen bei vier ist zu viel. Der Umlaut-Fall gehört an ein
// Wort, bei dem nur die Punkte fehlen.
ok('rück: Hauser = miss',      await grade(haus, 'en_de', 'Hauser') === 'miss');
const kueche = await item('die Küche');
ok('Umlaut fehlt = near',      await grade(kueche, 'en_de', 'Kuche') === 'near');
ok('Umlaut da = exact',        await grade(kueche, 'en_de', 'Küche') === 'exact');

const schueler = await item('der Schüler');
ok('alt: student = exact',     await grade(schueler, 'de_en', 'student') === 'exact');
ok('alt: pupil = exact',       await grade(schueler, 'de_en', 'pupil') === 'exact');

const ei = await item('das Ei');
ok('kurzes Wort: ego = miss',  await grade(ei, 'de_en', 'ego') === 'miss', `(bekommen: ${await grade(ei, 'de_en', 'ego')})`);
const oma = await item('die Großmutter');
ok('langes Wort: grandmoter = near', await grade(oma, 'de_en', 'grandmoter') === 'near');

/* ── Schreibweisen ─────────────────────────────────────────── */
const spell = async (correct, typed) =>
  (await one('select vocab_spellings($1,$2) s', [correct, typed])).s;
for (const [w, t] of [['house', 'hous'], ['grandmother', 'grandmoter'], ['egg', 'eg'], ['school', 'shool']]) {
  const s = await spell(w, t);
  const hits = [];
  for (const c of s) if ((await norm(c)) === (await norm(w))) hits.push(c);
  ok(`spellings ${w}: genau eine richtig`, hits.length === 1, `[${s.join(' | ')}]`);
  ok(`spellings ${w}: getippte dabei`, s.includes(t));
  ok(`spellings ${w}: mind. 3 Optionen`, s.length >= 3);
}

/* ── Auswahl aus Wörtern ───────────────────────────────────── */
const sets = (await db.query(`select array_agg(id) a from vocab_sets`)).rows[0].a;
const ch = (await one('select vocab_choices($1,$2,$3,$4) c', [sets, haus, 'de_en', 8])).c;
ok('choices: 8 Optionen', ch.length === 8, `[${ch.join(' | ')}]`);
let right = 0;
for (const c of ch) if ((await norm(c)) === 'house') right++;
ok('choices: genau eine richtig', right === 1);

/* ── Wiedervorlage ─────────────────────────────────────────── */
await db.exec(`insert into skill_rooms (id) values ('b0000000-0000-4000-8000-000000000001');
               insert into skill_participants (id, room_id) values
                 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001');`);
const P = 'c0000000-0000-4000-8000-000000000001';
const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;

const next = await one('select * from vocab_pick_next($1, $2, $3)', [P, [schule], 'de_en']);
ok('pick_next liefert ein Wort', !!next?.item_id);

await db.query('select vocab_record($1,$2,$3,$4)', [P, haus, 'de_en', false]);
let pr = await one('select * from vocab_progress where participant_id=$1', [P]);
ok('falsch: box 0',            pr.box === 0);
ok('falsch: wrong 1',          pr.wrong === 1);
ok('falsch: bald wieder',      new Date(pr.due_at) - Date.now() < 60000);

await db.query('select vocab_record($1,$2,$3,$4)', [P, haus, 'de_en', true]);
pr = await one('select * from vocab_progress where participant_id=$1', [P]);
ok('richtig: box 1',           pr.box === 1);
ok('richtig: seen 2',          pr.seen === 2);
ok('richtig: später',          new Date(pr.due_at) - Date.now() > 60000);

const due = await one('select * from vocab_pick_next($1,$2,$3)', [P, [schule], 'de_en']);
ok('fälliges Wort kommt nicht sofort wieder', due.item_id !== haus);

/* ── Import ────────────────────────────────────────────────── */
await db.exec(`insert into schools (id, slug) values ('d0000000-0000-4000-8000-000000000001','mps');
               insert into profiles (id, school_id) values ('e0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001');
               insert into _who (uid) values ('e0000000-0000-4000-8000-000000000001');`);

const imp = await one(`select vocab_set_import('Unit 3', $1) r`, [
  'Haus - house\n' +
  'der Schüler - pupil / student\n' +
  'Tafel;board\n' +
  'Stuhl\tchair\n' +
  'Fenster=window\n' +
  'kaputte Zeile ohne Trenner\n' +
  '\n' +
  'T-Shirt - t-shirt\n'
]);
ok('Import ok',        imp.r.ok === true, JSON.stringify(imp.r));
ok('Import: 6 Paare',  imp.r.added === 6, `added=${imp.r.added}`);
ok('Import: 1 Fehler', imp.r.bad === 1);

const impItems = (await db.query(
  `select term, translation, alt from vocab_items where set_id=$1 order by sort_order`, [imp.r.set])).rows;
ok('Import: T-Shirt nicht zerlegt', impItems.some(r => r.term === 'T-Shirt' && r.translation === 't-shirt'),
   JSON.stringify(impItems.find(r => r.term === 'T-Shirt')));
ok('Import: Alternative erkannt',
   impItems.some(r => r.term === 'der Schüler' && r.alt.includes('student')));

const leer = await one(`select vocab_set_import('Leer', 'nur Unsinn') r`);
ok('Import ohne Paare: Absage', leer.r.ok === false && leer.r.error === 'no_pairs');
ok('Import ohne Paare: keine Leerhülse',
   (await one(`select count(*)::int n from vocab_sets where title='Leer'`)).n === 0);

const liste = await one('select vocab_sets_list() r');
ok('Liste: 4 Sätze', liste.r.sets.length === 4, JSON.stringify(liste.r.sets.map(s => s.title)));
ok('Liste: mitgelieferte zuerst', liste.r.sets[0].mine === '0');
ok('Liste: Anzahl stimmt', liste.r.sets.find(s => s.title === 'Schule').count === 30);

const del = await one('select vocab_set_delete($1) r', [imp.r.set]);
ok('Löschen der eigenen Liste', del.r.ok === true);
const delFremd = await one('select vocab_set_delete($1) r', [schule]);
ok('Mitgelieferte nicht löschbar', delFremd.r.error === 'not_found');

/* ── Zweiter Lauf: idempotent ──────────────────────────────── */
await db.exec(readFileSync(`${REPO}/supabase/migrations/0130_vocab_content.sql`, 'utf8'));
ok('Zweiter Lauf: immer noch 3 Units',
   (await one(`select count(*)::int n from vocab_sets where owner_id is null`)).n === 3);
ok('Zweiter Lauf: immer noch 90 Wörter',
   (await one(`select count(*)::int n from vocab_items i join vocab_sets s on s.id=i.set_id where s.owner_id is null`)).n === 90);

console.log('\nfertig.');
