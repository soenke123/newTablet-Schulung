/* Prüfstand für Migration 0141 — der Balken der Runde.
   Echt gerechnet in pglite, Stubs wie in 0136/0138/0139/0140.

   Zweistufig wie der Prüfstand zu 0140, damit auch hier der
   AUSGANGSZUSTAND mitgeprüft wird: erst laufen 0130…0140 — da gibt
   es `pct` noch gar nicht —, dann kommt 0141 obendrauf.

   Acht Zusagen:
     1. Vor 0141 kennt wi_solo_pass kein `pct`.
     2. Danach: frische Runde = 0 %, und der Nenner sind KOPIEN.
     3. Jede richtige Antwort hebt den Anteil — 90 Antworten lang
        ohne einen einzigen Stillstand. Genau das konnte die alte
        Anzeige nicht (sie stand fünf von sechs Antworten still).
     4. Auch eine falsche Antwort hebt ihn, solange mehr als die
        Hälfte der Runde offen ist.
     5. Am Ende der Runde steht er auf genau 100 %.
     6. Die neue Runde fängt wieder bei 0 % an.
     7. Andere Units setzen den Zähler zurück, ein anderer MODUS
        nicht.
     8. `offen`/`gesamt` zählen weiter Wörter, und die Migration
        läuft zweimal.

   Aufruf:  node supabase/tests/0141_wordisland_solo_pass_percent.mjs  */
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
const js = v => JSON.stringify(v);
const n = v => Number(v);

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
                 '0137_wordisland_solo_pgcrypto.sql', '0138_wordisland_solo_stats.sql',
                 '0139_wordisland_solo_points.sql',
                 '0140_wordisland_solo_bag_choice.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0140 laufen durch —\n');

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
    ('${R1}','rt-anon-1', 1, 'Mia'),
    ('${R1}','rt-anon-2', 2, 'Ben'),
    ('${R1}','rt-anon-3', 3, 'Lea'),
    ('${R1}','rt-anon-4', 4, 'Nia');
`);
const SCHULE = (await one(`select id from vocab_sets where title = 'Schule'`)).id;
const ZUHAUS = (await one(`select id from vocab_sets where title <> 'Schule' order by title limit 1`)).id;
await db.exec(`insert into wi_room_sets (room_id, set_id) values
                 ('${R1}','${SCHULE}'), ('${R1}','${ZUHAUS}')`);

async function insel(rt, richtung, modus, sets = [SCHULE]) {
  const tok = (await one(`select wi_solo_claim($1, null) v`, [rt])).v.token;
  const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;
  await one(`select wi_solo_settings($1, $2::uuid[], $3, $4) v`, [tok, sets, richtung, modus]);
  return { tok, lid };
}
const loesung = async lid => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [lid])).a;
const pass = async lid => (await one(`select wi_solo_pass($1) v`, [lid])).v;
const frei = lid => db.exec(`update wi_solo_learners set lock_until = null where id = '${lid}'`);
const done = async lid => n((await one(
  `select pass_done d from wi_solo_learners where id = $1`, [lid])).d);

/* ── 1. Vor 0141 gibt es die Zahl nicht ─────────────────────── */
const mia = await insel('rt-anon-1', 'de_en', 'choice');
await one(`select wi_solo_start($1) v`, [mia.tok]);
const alt = await pass(mia.lid);
ok('OHNE 0141 kennt der Rundenstand kein „pct"',
   alt.pct === undefined && n(alt.offen) === 30, js(alt));

/* ── 0141 ───────────────────────────────────────────────────── */
await run(mig('0141_wordisland_solo_pass_percent.sql'), '0141');
console.log('\n— 0141 läuft durch —\n');

/* ── 2. Der Anfang: 0 %, und der Nenner sind Kopien ──────────── */
// Eine Richtung, 30 Wörter, alle auf Stufe Ei: 90 Kopien. Genau
// so viele Antworten muss der Balken brauchen — und nicht 30.
const ben = await insel('rt-anon-2', 'de_en', 'choice');
await one(`select wi_solo_start($1) v`, [ben.tok]);
const start = await pass(ben.lid);
ok('die frische Runde steht bei 0 %', n(start.pct) === 0, js(start.pct));
ok('und der Nenner sind 90 Kopien, nicht 30 Wörter',
   n(start.kopien) === 90 && n(start.erledigt) === 0 && n(start.gesamt) === 30, js(start));

/* ── 3. Jede Antwort hebt ihn — 90-mal hintereinander ────────── */
// DIE Zusage dieser Migration. Sönke: „ein % balken, der dann bei
// jeder Vokabel etwas hoch geht." Ein einziger Stillstand ist ein
// Fehlschlag, nicht ein Rundungsproblem.
let vor = 0, stillstand = 0, zurueck = 0, kleinster = 100;
for (let i = 0; i < 90; i++) {
  await frei(ben.lid);
  await one(`select wi_solo_answer($1, $2) v`, [ben.tok, await loesung(ben.lid)]);
  const jetzt = n((await pass(ben.lid)).pct);
  if (i < 89) {
    if (jetzt === vor) stillstand++;
    if (jetzt < vor) zurueck++;
    kleinster = Math.min(kleinster, jetzt - vor);
  }
  vor = jetzt;
}
ok('90 richtige Antworten, 90-mal ein Schritt nach vorn',
   stillstand === 0 && zurueck === 0, js({ stillstand, zurueck }));
ok('und der kleinste Schritt ist noch sichtbar (über einem Zehntel)',
   kleinster >= 0.1, js(kleinster));

/* ── 5./6. Rundenende und Neuanfang ─────────────────────────── */
// Die 90. Antwort leert den Beutel; wi_solo_next dreht die Runde
// weiter und stellt den Zähler auf null. Gemessen wird deshalb VOR
// dem Weiterdrehen, an einem eigenen Kind.
const lea = await insel('rt-anon-3', 'de_en', 'choice');
await one(`select wi_solo_start($1) v`, [lea.tok]);
for (let i = 0; i < 89; i++) {
  await frei(lea.lid);
  await one(`select wi_solo_answer($1, $2) v`, [lea.tok, await loesung(lea.lid)]);
}
const vorletzt = await pass(lea.lid);
ok('eine Kopie vor Schluss steht der Balken kurz vor 100 %',
   n(vorletzt.kopien) === 1 && n(vorletzt.pct) > 98 && n(vorletzt.pct) < 100, js(vorletzt));

await frei(lea.lid);
await one(`select wi_solo_answer($1, $2) v`, [lea.tok, await loesung(lea.lid)]);
const neu = await pass(lea.lid);
ok('die letzte Antwort dreht die Runde weiter', n(neu.no) === 2, js(neu.no));
ok('und der Balken fängt wieder bei 0 % an',
   n(neu.pct) === 0 && n(neu.erledigt) === 0, js(neu));

/* ── 4. Auch der Fehler bringt den Balken voran ─────────────── */
// Im Tipp-Modus legt er zwei Kopien zurück, wo er eine genommen
// hat — die Runde wird also länger. Solange mehr als die Hälfte
// offen ist, wiegt der eigene Schritt trotzdem schwerer. (Später
// nicht mehr; dafür stockt der Balken im Gerät, statt zu fallen.)
const nia = await insel('rt-anon-4', 'de_en', 'type');
await one(`select wi_solo_start($1) v`, [nia.tok]);
for (let i = 0; i < 10; i++) {
  await frei(nia.lid);
  await one(`select wi_solo_answer($1, $2) v`, [nia.tok, await loesung(nia.lid)]);
}
const vorFalsch = await pass(nia.lid);
await frei(nia.lid);
// Zweimal daneben: der erste Versuch schickt nur die Auswahl von
// acht Wörtern („choice"), gewertet wird erst der zweite.
await one(`select wi_solo_answer($1, $2) v`, [nia.tok, 'völlig daneben']);
await frei(nia.lid);
await one(`select wi_solo_answer($1, $2) v`, [nia.tok, 'völlig daneben']);
const nachFalsch = await pass(nia.lid);
ok('eine falsche Antwort macht die Runde länger',
   n(nachFalsch.kopien) > n(vorFalsch.kopien),
   js([n(vorFalsch.kopien), n(nachFalsch.kopien)]));
ok('und bringt den Balken trotzdem voran (erste Hälfte)',
   n(nachFalsch.pct) > n(vorFalsch.pct), js([vorFalsch.pct, nachFalsch.pct]));

/* ── 7. Andere Units, anderer Beutel ────────────────────────── */
const vorWechsel = await done(nia.lid);
ok('Vorbereitung: der Zähler steht auf mehr als null', vorWechsel > 0, js(vorWechsel));

await one(`select wi_solo_settings($1, null::uuid[], null, 'choice') v`, [nia.tok]);
ok('ein anderer MODUS lässt den Zähler stehen — der Beutel bleibt derselbe',
   await done(nia.lid) === vorWechsel, js(await done(nia.lid)));

await one(`select wi_solo_settings($1, $2::uuid[], null, null) v`, [nia.tok, [ZUHAUS]]);
ok('andere Units setzen ihn zurück', await done(nia.lid) === 0, js(await done(nia.lid)));
await one(`select wi_solo_start($1) v`, [nia.tok]);
const frisch = await pass(nia.lid);
ok('die neue Unit fängt deshalb bei 0 % an, nicht bei einem Drittel',
   n(frisch.pct) === 0, js(frisch));

/* ── 8. Wörter bleiben Wörter, und zweimal läuft auch ───────── */
ok('`gesamt` zählt weiter Wörter und deckt sich mit der Insel',
   n(frisch.gesamt) === n((await one(
     `select count(*) c from vocab_items where set_id = $1`, [ZUHAUS])).c),
   js([n(frisch.gesamt)]));

const vorLauf2 = await pass(ben.lid);
await run(mig('0141_wordisland_solo_pass_percent.sql'), '0141 (2. Lauf)');
ok('die Migration läuft zweimal und ändert dabei nichts',
   js(await pass(ben.lid)) === js(vorLauf2), js(vorLauf2));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
