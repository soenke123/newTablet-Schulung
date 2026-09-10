/* Prüfstand für Migration 0136 — die eigene Insel, echt gerechnet
   in pglite. Stubs wie in 0135.

   Sieben Zusagen, und alle sieben sind Stellen, an denen ein Fehler
   erst Monate später auffiele:

     1. Der Beitritt legt Units ADDITIV an und ist idempotent.
        (Ein zweiter Lauf, der die Liste ersetzt statt ergänzt,
        sähe am ersten Tag genauso aus wie der richtige.)
     2. Ein abgelaufener Raum nimmt die Freischaltung NICHT mit.
        Das ist der ganze Zweck der Migration.
     3. Falsch antworten kostet EINE Stufe, nicht alle.
     4. Die Stufe eines Tiers ist das Minimum beider Richtungen.
     5. Eine fremde Unit kommt durch wi_solo_settings nicht herein.
     6. Angemeldet gewinnt gegen den Geräte-Token — und die beiden
        Inseln bleiben getrennt.
     7. Ohne Raum keine Insel: wi_solo_open legt nichts an.

   Aufruf:  node supabase/tests/0136_wordisland_solo.mjs            */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
/* Der Suchpfad der SITZUNG wie in Supabase. Spalten-Defaults (etwa
   wi_boards.broadcast_key in 0131) lösen ihre Funktionsnamen beim
   create table auf, nicht beim Einfügen — die brauchen extensions
   hier, nicht im Kopf einer Funktion. */
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
/* ⚠️ In SCHEMA extensions, nicht in public — wie in Supabase, wo
   pgcrypto dort installiert ist. Das ist keine Kosmetik: stand der
   Stub in public, funktionierte hier auch eine Funktion mit
   \`set search_path = public\`, die in der echten Datenbank mit
   42883 „function gen_random_bytes(integer) does not exist"
   abbricht. Genau so ist 0136 am 10.09.2026 grün durchgelaufen und
   beim ersten Raumbeitritt gescheitert (Nachbesserung 0137).
   Ein Stub, der großzügiger ist als der Ernstfall, prüft nichts. */
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
await run(mig('0130_vocab_content.sql'), '0130');
await run(mig('0131_wordisland_game.sql'), '0131');
await run(mig('0133_wordisland_lobby.sql'), '0133');
await run(mig('0134_wordisland_back_to_lobby.sql'), '0134');
await run(mig('0135_wordisland_eight_factions.sql'), '0135');
await run(mig('0136_wordisland_solo.sql'), '0136');
/* 0137 gehört zwingend dazu: erst sie gibt wi_solo_create den
   Suchpfad, mit dem sie pgcrypto findet. Ohne diese Zeile bricht
   die allererste Zusage unten ab — und zwar mit genau dem Fehler,
   den Sönke am 10.09.2026 im Browser hatte. */
await run(mig('0137_wordisland_solo_pgcrypto.sql'), '0137');
console.log('— 0130 … 0137 laufen durch —\n');

/* ── Bühne: zwei Räume einer Lehrkraft, zwei Units ──────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const KIND   = 'e0000000-0000-4000-8000-000000000002';
const R1     = 'b0000000-0000-4000-8000-000000000001';
const R2     = 'b0000000-0000-4000-8000-000000000002';
/* Eigener Raum fürs angemeldete Kind. Er MUSS getrennt sein: R1
   wird weiter unten gelöscht (Zusage 2), und mit ihm verschwände
   sein Teilnehmer — der Konto-Beitritt liefe dann ins Leere und
   Zusage 6 prüfte nichts. */
const R3     = 'b0000000-0000-4000-8000-000000000003';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}'), ('${KIND}','${SCHOOL}');
  insert into _who (uid) values (null);
  insert into skill_rooms (id, code, owner_id, school_id, title) values
    ('${R1}','AAAAAA','${T}','${SCHOOL}','Stunde 1'),
    ('${R2}','BBBBBB','${T}','${SCHOOL}','Stunde 2'),
    ('${R3}','CCCCCC','${T}','${SCHOOL}','Stunde 3');
  insert into skill_participants (room_id, token, seat, name) values
    ('${R1}','rt-anon-1', 1, 'Mia'),
    ('${R2}','rt-anon-2', 1, 'Mia'),
    ('${R3}','rt-konto',  1, 'Ben');
`);

const setId = async t => (await one(`select id from vocab_sets where title = $1`, [t])).id;
const SCHULE = await setId('Schule');
const sets = await all(`select id, title from vocab_sets order by title`);
const ZWEITE = sets.find(s => s.id !== SCHULE).id;
const DRITTE = sets.find(s => s.id !== SCHULE && s.id !== ZWEITE).id;

await db.exec(`
  insert into wi_room_sets (room_id, set_id) values ('${R1}','${SCHULE}');
  insert into wi_room_sets (room_id, set_id) values ('${R2}','${ZWEITE}');
  insert into wi_room_sets (room_id, set_id) values ('${R3}','${SCHULE}');
`);

const anmelden = async uid => db.exec(`update _who set uid = ${uid ? `'${uid}'` : 'null'}`);

/* ── 7. Ohne Raum keine Insel ───────────────────────────────── */
let r = (await one(`select wi_solo_open($1) v`, ['gibtsnicht'])).v;
ok('unbekannter Token → keine Insel, kein Fehler', r.ok === true && r.learner === null, js(r));
ok('und es wurde nichts angelegt',
   Number((await one(`select count(*) n from wi_solo_learners`)).n) === 0);

/* ── 1. Der Beitritt spielt frei, additiv und idempotent ────── */
r = (await one(`select wi_solo_claim('rt-anon-1', null) v`)).v;
ok('Beitritt legt die Insel an', r.ok === true && !!r.token, js(r));
const TOK = r.token;
const wörterSchule = Number((await one(
  `select count(*) n from vocab_items where set_id = $1`, [SCHULE])).n);
ok('die Wörter von Unit 1 sind da', Number(r.words) === wörterSchule,
   `${r.words} / ${wörterSchule}`);

r = (await one(`select wi_solo_claim('rt-anon-1', $1) v`, [TOK])).v;
ok('zweiter Beitritt fügt nichts doppelt hinzu', Number(r.added) === 0, js(r));
ok('und legt keine zweite Insel an',
   Number((await one(`select count(*) n from wi_solo_learners`)).n) === 1);

r = (await one(`select wi_solo_claim('rt-anon-2', $1) v`, [TOK])).v;
const wörterZwei = Number((await one(
  `select count(*) n from vocab_items where set_id = any($1)`, [[SCHULE, ZWEITE]])).n);
ok('zweiter Raum legt Unit 2 DAZU', Number(r.added) === 1 && Number(r.words) === wörterZwei,
   js(r));

r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('die Insel nennt beide Units', (r.learner.sets || []).length === 2, js(r.learner?.sets));
ok('alle Wörter sind Eier',
   Number((await one(`select count(*) n from wi_solo_stages(
     (select id from wi_solo_learners where token = $1)) where stage > 0`, [TOK])).n) === 0);
ok('der Startwert der Insel steht fest', Number.isInteger(r.learner.seed));

/* ── 2. Der abgelaufene Raum nimmt nichts mit ───────────────── */
await db.exec(`delete from skill_rooms where id = '${R1}'`);
r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('gelöschter Raum → Units bleiben stehen', (r.learner.sets || []).length === 2,
   js((r.learner?.sets || []).map(s => s.title)));
ok('nur die Herkunftsnotiz ist weg',
   Number((await one(`select count(*) n from wi_solo_sets
     where learner_id = (select id from wi_solo_learners where token = $1)
       and from_room is null`, [TOK])).n) === 1);

/* ── 4. Stufe = Minimum beider Richtungen ───────────────────── */
const LID = (await one(`select id from wi_solo_learners where token = $1`, [TOK])).id;
const ITEM = (await one(
  `select id from vocab_items where set_id = $1 order by sort_order limit 1`, [SCHULE])).id;
const stufe = async () => Number((await one(
  `select stage from wi_solo_stages($1, $2)`, [LID, ITEM])).stage);

await one(`select wi_solo_record($1, $2, 'de_en', true)`, [LID, ITEM]);
ok('eine Richtung richtig → das Tier bleibt ein Ei', await stufe() === 0);
await one(`select wi_solo_record($1, $2, 'en_de', true)`, [LID, ITEM]);
ok('beide Richtungen richtig → es schlüpft', await stufe() === 1);

for (const d of ['de_en', 'en_de']) {
  for (let i = 0; i < 3; i++) await one(`select wi_solo_record($1, $2, $3, true)`, [LID, ITEM, d]);
}
ok('ausgewachsen nach beidseitigem Üben', await stufe() === 4, String(await stufe()));

/* ── 3. Falsch kostet EINE Stufe ────────────────────────────── */
await one(`select wi_solo_record($1, $2, 'de_en', false)`, [LID, ITEM]);
ok('falsch → eine Stufe zurück, nicht aufs Ei', await stufe() === 3, String(await stufe()));
ok('das Fach der anderen Richtung bleibt stehen',
   Number((await one(`select box from wi_solo_progress
     where learner_id = $1 and item_id = $2 and dir = 'en_de'`, [LID, ITEM])).box) === 4);

const fach = async () => Number((await one(`select box from wi_solo_progress
  where learner_id = $1 and item_id = $2 and dir = 'de_en'`, [LID, ITEM])).box);
for (let i = 0; i < 6; i++) await one(`select wi_solo_record($1, $2, 'de_en', false)`, [LID, ITEM]);
ok('und unter null geht es nicht', await fach() === 0, String(await fach()));

/* ── 5. Fremde Units kommen nicht herein ────────────────────── */
r = (await one(`select wi_solo_settings($1, $2::uuid[]) v`, [TOK, [DRITTE]])).v;
ok('eine nie freigespielte Unit fällt heraus',
   r.ok === true && js(r.settings.sets) === '[]', js(r.settings));
ok('und geübt wird dann wieder auf allem',
   (await one(`select array_length(wi_solo_chosen($1), 1) n`, [LID])).n === 2);

r = (await one(`select wi_solo_settings($1, $2::uuid[]) v`, [TOK, [ZWEITE]])).v;
ok('eine freigespielte Unit lässt sich wählen', js(r.settings.sets) === js([ZWEITE]), js(r.settings));
ok('und dann wird nur auf ihr geübt',
   (await one(`select array_length(wi_solo_chosen($1), 1) n`, [LID])).n === 1);
ok('das Wort aus Unit 1 kommt jetzt nicht mehr dran',
   (await all(`select item_id from wi_solo_pick_next($1)`, [LID]))
     .every(x => x.item_id !== ITEM));

r = (await one(`select wi_solo_settings($1, null, 'quer') v`, [TOK])).v;
ok('eine erfundene Richtung wird abgelehnt', r.ok === false && r.error === 'invalid_input', js(r));
r = (await one(`select wi_solo_settings($1, null, 'en_de', 'choice') v`, [TOK])).v;
ok('Richtung und Modus lassen sich setzen',
   r.settings.dir === 'en_de' && r.settings.mode === 'choice', js(r.settings));

/* Zurück auf gemischt und tippen, sonst prüft der Antwortweg unten
   die Auswahl statt der dreistufigen Prüfung. */
await one(`select wi_solo_settings($1, $2::uuid[], 'mixed', 'type') v`, [TOK, [SCHULE, ZWEITE]]);

/* ── Der Antwortweg ─────────────────────────────────────────── */
r = (await one(`select wi_solo_start($1) v`, [TOK])).v;
ok('üben fängt mit einer Aufgabe an', r.ok === true && !!r.task?.prompt, js(r.task));
ok('die Aufgabe nennt Wort und Stufe',
   !!r.task.item && Number.isInteger(r.task.level), js(r.task));
ok('aber niemals die Lösung',
   !Object.keys(r.task).some(k => ['solution', 'answer', 'translation'].includes(k)),
   js(Object.keys(r.task)));

const lösung = async () => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.token = $1`, [TOK])).a;

let vor = (await one(`select wi_solo_start($1) v`, [TOK])).v.task;
r = (await one(`select wi_solo_answer($1, $2) v`, [TOK, await lösung()])).v;
ok('richtig getippt → correct', r.result === 'correct', js(r));
ok('und das Tier ist gewachsen oder gleich geblieben',
   r.level_after >= r.level_before, `${r.level_before} → ${r.level_after}`);
ok('die nächste Aufgabe kommt gleich mit', !!r.task?.prompt);

vor = r.task;
r = (await one(`select wi_solo_answer($1, 'xyzqwertz') v`, [TOK])).v;
ok('daneben → Auswahl aus acht Wörtern',
   r.result === 'choice' && (r.task.options || []).length === 8, js(r.result));
ok('in der Auswahl gibt es kein Wachsen', r.level_after === undefined);
r = (await one(`select wi_solo_answer($1, 'immernochfalsch') v`, [TOK])).v;
ok('falsche Wahl → wrong mit Lösung', r.result === 'wrong' && !!r.solution, js(r.result));
ok('und einer Sperre', Number(r.locked_for) > 0, String(r.locked_for));
r = (await one(`select wi_solo_answer($1, 'irgendwas') v`, [TOK])).v;
ok('die Sperre greift', r.ok === false && r.error === 'too_fast', js(r));

/* ── 6. Konto und Gerät sind zwei Inseln ────────────────────── */
await anmelden(KIND);
r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('angemeldet: der Geräte-Token zählt nicht mehr', r.learner === null, js(r));

r = (await one(`select wi_solo_claim('rt-konto', $1) v`, [TOK])).v;
ok('der Beitritt legt eine eigene Konto-Insel an', r.ok === true, js(r));
ok('und die bekommt KEINEN Token', r.token === null, js(r.token));
ok('es gibt jetzt zwei Inseln',
   Number((await one(`select count(*) n from wi_solo_learners`)).n) === 2);

r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('die Konto-Insel kennt nur ihre eine Unit', (r.learner.sets || []).length === 1,
   js((r.learner?.sets || []).map(s => s.title)));
ok('und alles darauf ist ein Ei',
   Number(r.learner.grown) === 0 && Number(r.learner.words) === wörterSchule,
   js([r.learner.grown, r.learner.words]));

const KLID = (await one(`select id from wi_solo_learners where user_id = $1`, [KIND])).id;
ok('der Fortschritt des Geräts ist NICHT mitgekommen',
   Number((await one(`select count(*) n from wi_solo_progress where learner_id = $1`, [KLID])).n) === 0);

await anmelden(null);
r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('abgemeldet ist die Geräte-Insel unverändert wieder da',
   r.learner !== null && (r.learner.sets || []).length === 2, js(r.learner?.sets?.length));
ok('mit ihrem Fortschritt',
   Number((await one(`select count(*) n from wi_solo_progress where learner_id = $1`, [LID])).n) > 0);

/* ── Zweiter Lauf ───────────────────────────────────────────── */
await run(mig('0136_wordisland_solo.sql'), '0136 (2. Lauf)');
r = (await one(`select wi_solo_open($1) v`, [TOK])).v;
ok('zweiter Lauf lässt die Insel stehen',
   r.learner !== null && (r.learner.sets || []).length === 2, js(r.learner?.sets?.length));
ok('und die Zusagen der Tabellen behalten ihre Namen',
   (await all(`select conname from pg_constraint
                where conrelid = 'public.wi_solo_learners'::regclass
                  and conname in ('wi_solo_learners_id_needed')`)).length === 1);

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
