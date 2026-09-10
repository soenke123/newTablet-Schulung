/* Prüfstand für Migration 0139 — Punkte, Rückschritt, Beutel.
   Echt gerechnet in pglite, Stubs wie in 0136/0138.

   Der Aufbau ist mit Absicht zweistufig: erst laufen 0130…0138 und
   es wird MIT DER ALTEN WÄHRUNG geübt, dann kommt 0139 obendrauf.
   Nur so ist die Umrechnung des Bestands (ein Fach = drei Punkte)
   überhaupt prüfbar — und sie ist die eine Stelle, an der ein
   Fehler stillschweigend Lernstand von Wochen halbierte.

   Zwölf Zusagen:
     1. Ein Fach aus der alten Welt wird zu drei Punkten.
     2. Auf Anhieb getippt: +3.
     3. Mit Hilfe: +1 — und dreimal mit Hilfe ist eine Stufe.
     4. Der Modus „auswählen" ist IMMER „mit Hilfe".
     5. Falsch kostet 3 Punkte in BEIDEN Richtungen.
     6. Das Tier fällt dabei um genau eine Stufe.
     7. Im Auswahl-Modus kostet falsch nur 1 Punkt, auch in beiden.
     8. Die Stufe des Tiers bleibt das Minimum beider Richtungen.
     9. Im Beutel liegt jedes Wort mindestens einmal — ein Ei drei-,
        ein funkelndes Tier einmal.
    10. Ein Fehler wirft zwei Kopien zurück, Hilfe eine.
    11. Ist der Beutel leer, beginnt eine neue Runde — und alles
        liegt wieder drin.
    12. Der Rundenstand zählt WÖRTER, nicht Richtungen.

   Aufruf:  node supabase/tests/0139_wordisland_solo_points.mjs     */
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
await one(`select wi_solo_settings($1, $2::uuid[], 'de_en', 'type') v`, [TOK, [SCHULE]]);

const WOERTER = await all(
  `select id from vocab_items where set_id = $1 order by id`, [SCHULE]);
const ANZ = WOERTER.length;

/* ── 1. Der Bestand aus der alten Welt ──────────────────────── */
// Zwei Fächer in beiden Richtungen, mit der Fassung von 0136
// gebucht — genau so, wie es in der echten Datenbank steht.
const ALT = WOERTER[0].id;
for (const d of ['de_en', 'en_de']) {
  await one(`select wi_solo_record($1, $2, $3, true)`, [LID, ALT, d]);
  await one(`select wi_solo_record($1, $2, $3, true)`, [LID, ALT, d]);
}
const vorher = await one(
  `select box from wi_solo_progress where learner_id = $1 and item_id = $2 and dir = 'de_en'`,
  [LID, ALT]);
ok('Vorbereitung: das alte Fach steht auf 2', n(vorher.box) === 2, js(vorher));

await run(mig('0139_wordisland_solo_points.sql'), '0139');
console.log('— 0139 läuft durch —\n');

const nachher = await one(
  `select points, box from wi_solo_progress where learner_id = $1 and item_id = $2 and dir = 'de_en'`,
  [LID, ALT]);
ok('ein Fach wird zu drei Punkten', n(nachher.points) === 6, js(nachher));
const stufeAlt = await one(`select stage from wi_solo_stages($1, $2)`, [LID, ALT]);
ok('und die Stufe des Tiers bleibt, was sie war', n(stufeAlt.stage) === 2, js(stufeAlt));

/* ── Werkzeuge ──────────────────────────────────────────────── */
const dran = () => one(
  `select current_item i, current_dir d, current_stage s from wi_solo_learners where id = $1`, [LID]);
const loesung = async () => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [LID])).a;
const antwort = async v => (await one(`select wi_solo_answer($1, $2) v`, [TOK, v])).v;
const punkte = async (item, dir) => n((await one(
  `select points from wi_solo_progress where learner_id = $1 and item_id = $2 and dir = $3`,
  [LID, item, dir]) || { points: 0 }).points);
const stufe = async item => n((await one(`select stage from wi_solo_stages($1, $2)`, [LID, item])).stage);
const beutel = async (item, dir) => n((await one(
  `select offen from wi_solo_bag_open($1, $2) where dir = $3`, [LID, item, dir])).offen);
const entsperren = () => db.exec(`update wi_solo_learners set lock_until = null where id = '${LID}'`);
// Eine Aufgabe von Hand stellen. Der Antwortweg zieht sonst ein
// zufälliges Wort, und die Rechnung unten will ein bestimmtes.
const stelle = (item, dir, stage) => db.exec(
  `update wi_solo_learners set current_item = '${item}', current_dir = '${dir}',
          current_stage = '${stage}', current_options = '{}', lock_until = null
    where id = '${LID}'`);

/* ── 2. Auf Anhieb getippt ──────────────────────────────────── */
const W1 = WOERTER[1].id;
await stelle(W1, 'de_en', 'type');
let r = await antwort(await loesung());
ok('richtig getippt → correct', r.result === 'correct', js(r.result));
ok('und bringt drei Punkte', r.delta === 3 && r.points === 3, js([r.delta, r.points]));
ok('es zählt NICHT als „mit Hilfe"', r.helped === false, js(r.helped));
ok('das Tier bleibt trotzdem ein Ei — die Gegenrichtung fehlt',
   await stufe(W1) === 0, js(await stufe(W1)));

/* ── 3. Mit Hilfe ───────────────────────────────────────────── */
const W2 = WOERTER[2].id;
await stelle(W2, 'de_en', 'type');
r = await antwort('xyzqwertz');
ok('daneben getippt → Auswahl aus acht Wörtern',
   r.result === 'choice' && (r.task.options || []).length === 8, js(r.result));
ok('die Zwischenstufe bucht nichts', await punkte(W2, 'de_en') === 0);

await stelle(W2, 'de_en', 'choice');
r = await antwort(await loesung());
ok('dann richtig gewählt → correct mit Hilfe',
   r.result === 'correct' && r.helped === true, js([r.result, r.helped]));
ok('und bringt genau einen Punkt', r.delta === 1 && r.points === 1, js([r.delta, r.points]));

/* Sönkes Kernregel: dreimal mit Hilfe ist einmal gekonnt. */
for (const d of ['de_en', 'en_de']) {
  for (let i = 0; i < 3; i++) {
    await stelle(W2, d, 'choice');
    await antwort(await loesung());
  }
}
const pW2 = [await punkte(W2, 'de_en'), await punkte(W2, 'en_de')];
ok('dreimal mit Hilfe in beide Richtungen …', js(pW2) === js([4, 3]), js(pW2));
ok('… und das Tier ist geschlüpft', await stufe(W2) === 1, js(await stufe(W2)));

/* Die Gegenprobe: zweimal reicht NICHT. */
const W3 = WOERTER[3].id;
for (const d of ['de_en', 'en_de']) {
  for (let i = 0; i < 2; i++) {
    await stelle(W3, d, 'choice');
    await antwort(await loesung());
  }
}
ok('zweimal mit Hilfe reicht nicht', await stufe(W3) === 0,
   js([await punkte(W3, 'de_en'), await punkte(W3, 'en_de')]));

/* ── 4. Falsch: beide Richtungen, genau eine Stufe ──────────── */
const W4 = WOERTER[4].id;
for (const d of ['de_en', 'en_de']) {
  for (let i = 0; i < 2; i++) {
    await stelle(W4, d, 'type');
    await antwort(await loesung());
  }
}
ok('Vorbereitung: beide Richtungen auf 6 Punkten',
   await punkte(W4, 'de_en') === 6 && await punkte(W4, 'en_de') === 6);
ok('das Tier ist gewachsen', await stufe(W4) === 2);

await stelle(W4, 'de_en', 'choice');
r = await antwort('immernochfalsch');
ok('falsche Wahl → wrong', r.result === 'wrong', js(r.result));
ok('kostet drei Punkte …', r.delta === -3 && r.points === 3, js([r.delta, r.points]));
ok('… und zwar in BEIDEN Richtungen', await punkte(W4, 'en_de') === 3,
   js(await punkte(W4, 'en_de')));
ok('das Tier fällt um genau eine Stufe',
   r.level_before === 2 && r.level_after === 1, js([r.level_before, r.level_after]));
ok('die Lösung steht dabei', typeof r.solution === 'string' && r.solution.length > 0);

/* Der Boden: aus einem Ei kann nichts mehr herausfallen. */
const W5 = WOERTER[5].id;
await stelle(W5, 'de_en', 'choice');
await antwort('daneben');
ok('ein Wort auf null bleibt auf null',
   await punkte(W5, 'de_en') === 0 && await stufe(W5) === 0);

/* ── 5. Der Auswahl-Modus ist der sanfte ────────────────────── */
await one(`select wi_solo_settings($1, null::uuid[], null, 'choice') v`, [TOK]);
const W6 = WOERTER[6].id;
for (const d of ['de_en', 'en_de']) {
  for (let i = 0; i < 2; i++) {
    await stelle(W6, d, 'type');
    await antwort(await loesung());
  }
}
ok('Vorbereitung: Stufe 2 in beiden Richtungen', await stufe(W6) === 2);

await stelle(W6, 'de_en', 'choice');
r = await antwort(await loesung());
ok('im Auswahl-Modus ist auch die richtige Antwort „mit Hilfe"',
   r.helped === true && r.delta === 1, js([r.helped, r.delta]));

await stelle(W6, 'de_en', 'choice');
r = await antwort('daneben');
ok('und ein Fehler kostet dort nur einen Punkt', r.delta === -1, js(r.delta));
ok('auch das trifft beide Richtungen', await punkte(W6, 'en_de') === 5,
   js([await punkte(W6, 'de_en'), await punkte(W6, 'en_de')]));
ok('die Stufe hält das aus', await stufe(W6) === 1,
   js([await punkte(W6, 'de_en'), await punkte(W6, 'en_de')]));
await one(`select wi_solo_settings($1, null::uuid[], null, 'type') v`, [TOK]);

/* ── 6. Der Beutel ──────────────────────────────────────────── */
await one(`select wi_solo_settings($1, null::uuid[], 'mixed', 'type') v`, [TOK]);
const alleOffen = await all(`select * from wi_solo_bag_open($1, null)`, [LID]);
ok('im Beutel liegt jedes Wort in beiden Richtungen',
   alleOffen.length === ANZ * 2, `${alleOffen.length} statt ${ANZ * 2}`);

/* „Jedes Wort mindestens einmal" ist eine Zusage über eine RUNDE
   und nicht über einen Zeitpunkt: auf Mias Insel sind oben schon
   zwanzig Antworten gefallen, und ein Paar mit 0 Kopien heißt dort
   „in dieser Runde erledigt" — genau so soll es sein. Geprüft wird
   deshalb an einer frischen Insel. */
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               values ('${R1}','rt-anon-2', 2, 'Ben')`);
const TOK2 = (await one(`select wi_solo_claim('rt-anon-2', null) v`)).v.token;
const LID2 = (await one(`select id from wi_solo_learners where token = $1`, [TOK2])).id;
await one(`select wi_solo_settings($1, $2::uuid[], 'mixed', 'type') v`, [TOK2, [SCHULE]]);
const frisch = await all(`select * from wi_solo_bag_open($1, null)`, [LID2]);
ok('eine frische Insel: jedes Wort in beiden Richtungen, und jedes dreimal',
   frisch.length === ANZ * 2 && frisch.every(z => n(z.offen) === 3),
   js(frisch.filter(z => n(z.offen) !== 3).slice(0, 3)));

const NEU = WOERTER[ANZ - 1].id;
ok('ein Wort, das nie dran war, liegt dreimal drin', await beutel(NEU, 'de_en') === 3);

// Ein funkelndes Tier von Hand: 12 Punkte in beiden Richtungen.
const GOLD = WOERTER[ANZ - 2].id;
for (const d of ['de_en', 'en_de']) {
  await one(`select wi_solo_points($1, $2, $3, 12, true)`, [LID, GOLD, d]);
  await one(`select wi_solo_bag($1, $2, $3, 99)`, [LID, GOLD, d]);
}
await db.exec(`update wi_solo_progress set pass_no = 0
                where learner_id = '${LID}' and item_id = '${GOLD}'`);
ok('ein funkelndes Tier liegt nur einmal drin', await beutel(GOLD, 'de_en') === 1,
   js([await stufe(GOLD), await beutel(GOLD, 'de_en')]));

// Überfällig: dieselbe Zeile, aber der Termin ist durch.
await db.exec(`update wi_solo_progress set due_at = now() - interval '1 day'
                where learner_id = '${LID}' and item_id = '${GOLD}' and dir = 'de_en'`);
ok('überfällig legt eine Kopie dazu', await beutel(GOLD, 'de_en') === 2);

/* ── 7. Rückwurf ────────────────────────────────────────────── */
const W7 = WOERTER[7].id;
await stelle(W7, 'de_en', 'type');
const vorErst = await beutel(W7, 'de_en');
await antwort(await loesung());
ok('richtig getippt nimmt eine Kopie aus dem Beutel',
   await beutel(W7, 'de_en') === vorErst - 1, js([vorErst, await beutel(W7, 'de_en')]));

await stelle(W7, 'de_en', 'choice');
const vorHilfe = await beutel(W7, 'de_en');
await antwort(await loesung());
ok('mit Hilfe wirft eine Kopie zurück (verbraucht 1, legt 1 dazu)',
   await beutel(W7, 'de_en') === vorHilfe, js([vorHilfe, await beutel(W7, 'de_en')]));

await stelle(W7, 'de_en', 'choice');
const vorFalsch = await beutel(W7, 'de_en');
await antwort('daneben');
ok('falsch wirft zwei zurück', await beutel(W7, 'de_en') === vorFalsch + 1,
   js([vorFalsch, await beutel(W7, 'de_en')]));

/* ── 8. Die neue Runde ──────────────────────────────────────── */
const runde1 = (await one(`select wi_solo_pass($1) v`, [LID])).v;
ok('der Rundenstand zählt WÖRTER, nicht Richtungen',
   n(runde1.gesamt) === ANZ, js(runde1));
ok('und in Runde 1 ist noch fast alles offen',
   n(runde1.offen) === ANZ && n(runde1.no) === 1, js(runde1));

// Den Beutel leerräumen: jede Zeile auf null, und für jedes Wort,
// das noch keine hat, eine anlegen. Sonst liegen die ungeübten
// Wörter mit ihren drei Kopien weiter drin — zu Recht.
await db.exec(`
  insert into wi_solo_progress (learner_id, item_id, dir, points, pass_no, pass_left)
  select '${LID}', i.id, d, 0, 1, 0
    from vocab_items i cross join unnest(array['de_en','en_de']) d
   where i.set_id = '${SCHULE}'
     and not exists (select 1 from wi_solo_progress p
                      where p.learner_id = '${LID}' and p.item_id = i.id and p.dir = d);
  update wi_solo_progress set pass_no = 1, pass_left = 0 where learner_id = '${LID}';
`);
const leer = await all(`select * from wi_solo_bag_open($1, null) where offen > 0`, [LID]);
ok('Vorbereitung: der Beutel ist leer', leer.length === 0, `${leer.length} übrig`);

await one(`select wi_solo_next($1)`, [LID]);
const nachMischen = await dran();
const runde2 = (await one(`select wi_solo_pass($1) v`, [LID])).v;
ok('ist der Beutel leer, beginnt eine neue Runde', n(runde2.no) === 2, js(runde2));
ok('und es liegt sofort wieder alles drin', n(runde2.offen) === ANZ, js(runde2));
ok('es kommt auch prompt eine neue Frage', nachMischen.i !== null, js(nachMischen.i));

/* ── 9. Was das Gerät bekommt ───────────────────────────────── */
await stelle(W4, 'de_en', 'type');
const task = (await one(
  `select wi_solo_task_json(l) v from wi_solo_learners l where l.id = $1`, [LID])).v;
ok('die Aufgabe trägt beide Punktekonten mit',
   n(task.pts?.de_en) === 3 && n(task.pts?.en_de) === 3, js(task.pts));
ok('und den Rundenstand', n(task.pass?.no) === 2 && n(task.pass?.gesamt) === ANZ, js(task.pass));
ok('die Chronik hat jetzt VIER Zahlen',
   Array.isArray(task.stats?.de_en) && task.stats.de_en.length === 4, js(task.stats?.de_en));
ok('richtig + mit Hilfe + falsch = gesamt',
   task.stats.de_en[0] + task.stats.de_en[1] + task.stats.de_en[3] === task.stats.de_en[2],
   js(task.stats.de_en));
ok('und immer noch nicht die Lösung',
   !Object.keys(task).some(k => ['solution', 'answer', 'translation'].includes(k)),
   js(Object.keys(task)));

/* ── 10. Die Summe muss über ALLE Zeilen aufgehen ───────────── */
/* Ausgenommen ist die eine Zeile aus der alten Welt: sie wurde ganz
   oben mit der Fassung von 0136 gebucht, die `seen` zählte, aber
   clean/helped noch nicht kannte. Die Lücke ist gewollt und in 0138
   begründet — eine geratene Verteilung wäre schlimmer als eine
   ehrliche Null. Für alles, was seither gebucht wurde, muss die
   Summe aufgehen. */
const schief = await all(
  `select item_id, dir, clean, helped, wrong, seen from wi_solo_progress
    where seen <> clean + helped + wrong and item_id <> $1`, [ALT]);
ok('seen = richtig + mit Hilfe + falsch, über alle neuen Zeilen',
   schief.length === 0, js(schief.slice(0, 3)));

const ausserhalb = await all(
  `select item_id, dir, points, box from wi_solo_progress
    where points < 0 or points > 12 or box <> points / 3`);
ok('kein Konto außerhalb 0..12, und box spiegelt es',
   ausserhalb.length === 0, js(ausserhalb.slice(0, 3)));

/* ── 11. Zweiter Lauf ───────────────────────────────────────── */
const vorLauf2 = await punkte(W4, 'de_en');
await run(mig('0139_wordisland_solo_points.sql'), '0139 (2. Lauf)');
ok('die Migration läuft zweimal — und rechnet nichts doppelt um',
   await punkte(W4, 'de_en') === vorLauf2, js([vorLauf2, await punkte(W4, 'de_en')]));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
