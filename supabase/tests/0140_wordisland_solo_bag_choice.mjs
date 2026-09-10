/* Prüfstand für Migration 0140 — der Beutel im Auswahl-Modus.
   Echt gerechnet in pglite, Stubs wie in 0136/0138/0139.

   Der Aufbau ist zweistufig, damit der FEHLER selbst mitgeprüft
   wird: erst laufen 0130…0139, und da steht der Beutel still; dann
   kommt 0140 obendrauf, und er leert sich. Ein Prüfstand, der nur
   den Endzustand kennt, ginge auch dann durch, wenn 0140 gar nicht
   eingespielt wäre.

   Sechs Zusagen:
     1. Vor 0140: 90 richtige Antworten im Auswahl-Modus nehmen dem
        Beutel keine einzige Kopie.
     2. Nach 0140: dieselben Antworten leeren ihn — die Runde endet.
     3. Der Rundenzähler zählt dabei sichtbar herunter.
     4. Die Punkte ändern sich nicht: +1 mit Hilfe, −1 falsch.
     5. Im Tipp-Modus wirft „mit Hilfe" weiter eine Kopie zurück.
     6. Ein Fehler im Auswahl-Modus verlängert die Runde nicht.

   Aufruf:  node supabase/tests/0140_wordisland_solo_bag_choice.mjs  */
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
                 '0139_wordisland_solo_points.sql']) {
  await run(mig(f), f.slice(0, 4));
}
console.log('— 0130 … 0139 laufen durch —\n');

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
    ('${R1}','rt-anon-3', 3, 'Lea');
`);
const SCHULE = (await one(`select id from vocab_sets where title = 'Schule'`)).id;
await db.exec(`insert into wi_room_sets (room_id, set_id) values ('${R1}','${SCHULE}')`);

// Eine Insel je Prüfung: die drei Läufe dürfen sich nicht in die
// Quere kommen, und ein Beutel gehört ohnehin genau einem Kind.
async function insel(rt, richtung, modus) {
  const tok = (await one(`select wi_solo_claim($1, null) v`, [rt])).v.token;
  const lid = (await one(`select id from wi_solo_learners where token = $1`, [tok])).id;
  await one(`select wi_solo_settings($1, $2::uuid[], $3, $4) v`,
            [tok, [SCHULE], richtung, modus]);
  return { tok, lid };
}
const loesung = async lid => (await one(
  `select (vocab_answers(l.current_item, l.current_dir))[1] a
     from wi_solo_learners l where l.id = $1`, [lid])).a;
const pass = async lid => (await one(`select wi_solo_pass($1) v`, [lid])).v;
const kopien = async lid => n((await one(
  `select coalesce(sum(offen), 0) s from wi_solo_bag_open($1, null)`, [lid])).s);
const beutel = async (lid, item, dir) => n((await one(
  `select offen from wi_solo_bag_open($1, $2) where dir = $3`, [lid, item, dir])).offen);
const frei = lid => db.exec(`update wi_solo_learners set lock_until = null where id = '${lid}'`);
const stelle = (lid, item, dir, stage) => db.exec(
  `update wi_solo_learners set current_item = '${item}', current_dir = '${dir}',
          current_stage = '${stage}', current_options = '{}', lock_until = null
    where id = '${lid}'`);

// Richtig antworten, so oft wie gesagt. Im Auswahl-Modus stellt
// wi_solo_next die Frage schon als 'choice' — es genügt also, die
// Lösung zu schicken.
async function richtig(tok, lid, mal) {
  for (let i = 0; i < mal; i++) {
    await frei(lid);
    await one(`select wi_solo_answer($1, $2) v`, [tok, await loesung(lid)]);
  }
}

/* ── 1. Der Fehler, so wie er in der Datenbank steht ─────────── */
// Eine Richtung, damit die Rechnung von Hand nachvollziehbar
// bleibt: 30 Wörter × 3 Kopien = 90 Antworten bis zum leeren Beutel.
const mia = await insel('rt-anon-1', 'de_en', 'choice');
await one(`select wi_solo_start($1) v`, [mia.tok]);
const vorher = await kopien(mia.lid);
ok('Vorbereitung: 90 Kopien liegen im Beutel', vorher === 90, js(vorher));

await richtig(mia.tok, mia.lid, 90);
const stand0139 = await pass(mia.lid);
ok('OHNE 0140 nimmt keine einzige richtige Antwort eine Kopie heraus',
   await kopien(mia.lid) === 90, js(await kopien(mia.lid)));
ok('und der Rundenzähler steht nach 90 Antworten unverändert da',
   n(stand0139.no) === 1 && n(stand0139.offen) === 30, js(stand0139));

/* ── 0140 ───────────────────────────────────────────────────── */
await run(mig('0140_wordisland_solo_bag_choice.sql'), '0140');
console.log('\n— 0140 läuft durch —\n');

/* ── 2. Derselbe Lauf, jetzt mit 0140 ───────────────────────── */
const ben = await insel('rt-anon-2', 'de_en', 'choice');
await one(`select wi_solo_start($1) v`, [ben.tok]);
ok('Vorbereitung: wieder 90 Kopien', await kopien(ben.lid) === 90);

await richtig(ben.tok, ben.lid, 30);
const nach30 = await pass(ben.lid);
ok('nach 30 richtigen sind 30 Kopien weg', await kopien(ben.lid) === 60,
   js(await kopien(ben.lid)));
ok('und der Rundenzähler zählt sichtbar herunter',
   n(nach30.no) === 1 && n(nach30.offen) < 30, js(nach30));

await richtig(ben.tok, ben.lid, 60);
const nach90 = await pass(ben.lid);
ok('nach 90 richtigen ist die Runde durch', n(nach90.no) === 2, js(nach90));
ok('und die neue Runde liegt wieder voll da', n(nach90.offen) === 30, js(nach90));

/* ── 3. Die Punkte bleiben, wie sie waren ───────────────────── */
// 0140 fasst nur den Beutel an. Wäre versehentlich auch v_delta
// mitgewandert, hätte sich der ganze Auswahl-Modus verteuert.
const lea = await insel('rt-anon-3', 'de_en', 'choice');
const W = (await one(`select id from vocab_items where set_id = $1 order by id limit 1`,
                     [SCHULE])).id;
await stelle(lea.lid, W, 'de_en', 'choice');
let r = (await one(`select wi_solo_answer($1, $2) v`, [lea.tok, await loesung(lea.lid)])).v;
ok('richtig gewählt bringt weiter genau einen Punkt und heißt „mit Hilfe"',
   r.delta === 1 && r.helped === true && r.points === 1, js([r.delta, r.helped, r.points]));

/* ── 4. Ein Fehler im Auswahl-Modus verlängert nichts ────────── */
await stelle(lea.lid, W, 'de_en', 'choice');
const vorFalsch = await beutel(lea.lid, W, 'de_en');
r = (await one(`select wi_solo_answer($1, $2) v`, [lea.tok, 'daneben'])).v;
ok('falsch gewählt kostet weiter einen Punkt', r.delta === -1, js(r.delta));
ok('und lässt den Beutel stehen, statt ihn wachsen zu lassen',
   await beutel(lea.lid, W, 'de_en') === vorFalsch,
   js([vorFalsch, await beutel(lea.lid, W, 'de_en')]));

/* ── 5. Der Tipp-Modus bleibt unangetastet ──────────────────── */
// Dort ist die Hilfe die AUSNAHME, und die Rückgabe ihr Preis.
// Diese Zusage aus 0139 darf 0140 nicht mitgenommen haben.
await one(`select wi_solo_settings($1, null::uuid[], null, 'type') v`, [lea.tok]);
const W2 = (await one(`select id from vocab_items where set_id = $1 order by id offset 1 limit 1`,
                      [SCHULE])).id;

await stelle(lea.lid, W2, 'de_en', 'type');
const vorTippen = await beutel(lea.lid, W2, 'de_en');
await one(`select wi_solo_answer($1, $2) v`, [lea.tok, await loesung(lea.lid)]);
ok('getippt und richtig nimmt eine Kopie',
   await beutel(lea.lid, W2, 'de_en') === vorTippen - 1,
   js([vorTippen, await beutel(lea.lid, W2, 'de_en')]));

await stelle(lea.lid, W2, 'de_en', 'choice');
const vorHilfe = await beutel(lea.lid, W2, 'de_en');
r = (await one(`select wi_solo_answer($1, $2) v`, [lea.tok, await loesung(lea.lid)])).v;
ok('im Tipp-Modus wirft „mit Hilfe" weiter eine Kopie zurück',
   r.helped === true && await beutel(lea.lid, W2, 'de_en') === vorHilfe,
   js([vorHilfe, await beutel(lea.lid, W2, 'de_en')]));

/* ── 6. Zweiter Lauf ────────────────────────────────────────── */
const vorLauf2 = await kopien(ben.lid);
await run(mig('0140_wordisland_solo_bag_choice.sql'), '0140 (2. Lauf)');
ok('die Migration läuft zweimal und ändert dabei nichts',
   await kopien(ben.lid) === vorLauf2, js([vorLauf2, await kopien(ben.lid)]));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
