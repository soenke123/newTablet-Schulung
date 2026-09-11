/* Prüfstand für Migration 0143 — das eigene Volk auf der Insel.
   Echt gerechnet in pglite, Stubs wie in 0136…0142.

   Zweistufig wie die Prüfstände zu 0140/0141/0142: erst laufen
   0130…0142 (da gibt es wi_solo_avatar noch nicht), dann kommt 0143
   obendrauf. Nur so ist auch die Aussage „vorher fehlt sie" geprüft
   — und genau die trägt im Werkzeug den Hinweis „merkt sich gerade
   nur dieses Gerät".

   Acht Zusagen:
     1. Vor 0143 gibt es wi_solo_avatar nicht.
     2. Danach steht das Volk in settings.faction — und wi_solo_view
        trägt es mit, ohne dass dort etwas geändert werden musste.
     3. Voreingestellt ist GAR NICHTS: eine frische Insel hat kein
        `faction`. Das Gerät setzt die Brokkoli-Giraffen, nicht der
        Server — sonst gäbe es zwei Orte für dieselbe Voreinstellung.
     4. Alle acht Nummern gehen, −1/8/null nicht (invalid_input),
        und ein abgelehnter Aufruf ändert nichts.
     5. Die anderen Einstellungen (sets, dir, mode) überleben.
     6. Die laufende AUFGABE überlebt ebenfalls — das ist der
        Unterschied zu wi_solo_settings, und er ist der Grund für die
        eigene Funktion.
     7. Ein fremder Token ist not_found.
     8. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0143_wordisland_solo_avatar.mjs  */
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
                 '0139_wordisland_solo_points.sql', '0140_wordisland_solo_bag_choice.sql',
                 '0141_wordisland_solo_pass_percent.sql', '0142_wordisland_solo_units.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0142 laufen durch —\n');

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

const tok = (await one(`select wi_solo_claim($1, null) v`, ['rt-anon-1'])).v.token;
const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;

const stand = async () => (await one(
  `select settings, current_item, pass_done from wi_solo_learners where id = $1`, [lid]));
const avatar = async (t, f) => (await one(`select wi_solo_avatar($1, $2) v`, [t, f])).v;

/* ── 1 · Vorher gibt es die Funktion nicht ──────────────────── */
const vorher = await one(
  `select count(*)::int n from pg_proc where proname = 'wi_solo_avatar'`);
ok('1 · vor 0143 kennt der Server wi_solo_avatar nicht', vorher.n === 0);

console.log('\n— jetzt 0143 —\n');
await run(mig('0143_wordisland_solo_avatar.sql'), '0143');

/* ── 3 · Frische Insel hat kein Volk ────────────────────────── */
const frisch = await stand();
ok('3 · eine frische Insel trägt KEIN faction (das Gerät setzt die Voreinstellung)',
   frisch.settings.faction === undefined, js(frisch.settings));

/* ── 2 · Setzen, lesen, und wi_solo_view trägt es mit ────────── */
const r5 = await avatar(tok, 5);
ok('2a · das Volk lässt sich setzen', r5.ok === true && r5.settings.faction === 5, js(r5));
ok('2b · und steht danach in der Zeile', (await stand()).settings.faction === 5);
const v = (await one(`select wi_solo_view($1) v`, [tok])).v;
ok('2c · wi_solo_view trägt es mit — ohne eigene Änderung dort',
   v.learner.settings.faction === 5, js(v.learner.settings));

/* ── 5 · Die anderen Einstellungen überleben ────────────────── */
await one(`select wi_solo_settings($1, $2::uuid[], $3, $4) v`, [tok, [SCHULE], 'en_de', 'choice']);
await avatar(tok, 7);
const nach = (await stand()).settings;
ok('5 · sets, dir und mode überleben den Volkswechsel',
   nach.faction === 7 && nach.dir === 'en_de' && nach.mode === 'choice'
   && js(nach.sets) === js([SCHULE]), js(nach));

/* ── 4 · Alle acht gehen, alles andere nicht ────────────────── */
let alleAcht = true;
for (let i = 0; i < 8; i++) {
  const r = await avatar(tok, i);
  if (!(r.ok && r.settings.faction === i)) alleAcht = false;
}
ok('4a · alle acht Völker werden angenommen', alleAcht);

const daneben = [];
for (const f of [-1, 8, 99, null]) {
  const r = await avatar(tok, f);
  daneben.push(r.error);
}
ok('4b · −1, 8, 99 und null sind invalid_input',
   daneben.every(e => e === 'invalid_input'), js(daneben));
ok('4c · und der abgelehnte Aufruf hat nichts geändert',
   (await stand()).settings.faction === 7);

/* ── 6 · Die laufende Aufgabe bleibt stehen ─────────────────── */
await one(`select wi_solo_start($1) v`, [tok]);
const mitAufgabe = await stand();
ok('6a · es liegt eine Aufgabe an', !!mitAufgabe.current_item);
await avatar(tok, 1);
const danach = await stand();
ok('6b · der Volkswechsel wirft sie NICHT weg (anders als wi_solo_settings)',
   danach.current_item === mitAufgabe.current_item, js([mitAufgabe.current_item, danach.current_item]));
ok('6c · und lässt den Rundenzähler in Ruhe',
   danach.pass_done === mitAufgabe.pass_done);
/* Die Gegenprobe zur Begründung im Kopf der Migration: dieselbe
   Stelle über wi_solo_settings angefasst, und die Aufgabe ist weg. */
await one(`select wi_solo_settings($1, null, $2, null) v`, [tok, 'mixed']);
ok('6d · Gegenprobe: wi_solo_settings wirft sie sehr wohl weg',
   (await stand()).current_item === null);

/* ── 7 · Fremder Token ──────────────────────────────────────── */
ok('7 · ein fremder Token ist not_found',
   (await avatar('gibt-es-nicht', 3)).error === 'not_found');

/* ── 8 · Zweimal einspielen ─────────────────────────────────── */
await run(mig('0143_wordisland_solo_avatar.sql'), '0143 (zweites Mal)');
ok('8 · die Migration läuft zweimal', (await stand()).settings.faction === 1);

console.log(fails ? `\n${fails} FEHLER\n` : '\nalles grün\n');
process.exit(fails ? 1 : 0);
