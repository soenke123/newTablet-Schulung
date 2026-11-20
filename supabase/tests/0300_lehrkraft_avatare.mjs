/* Prüfstand für Migration 0300 — Profilbilder für Lehrkräfte, alles für den Volladmin.
   Echt gerechnet in pglite auf der ganzen Kette.

   Zusagen:
     1. Knowledge Stack: je beendetem Quiz mit Antworten ein neues Wesen für
        Besitzerin UND eingeladene Lehrkraft; erst alle 40, dann Gold; dann nichts mehr.
     2. Quiz ohne Antworten bringt nichts.
     3. Mathoria / Wordisland / Kistenturm: je Rundenende ein Bild, Wordisland
        erst alle _1, dann _4, dann Gold.
     4. Nebeltal gemeinsam: Lehrkraft bekommt 3D-Pinguin + Level-Bild.
     5. Schüler bekommen nichts Zusätzliches.
     6. mps_my_avatars: all = true nur beim Volladmin.

   Aufruf:  node supabase/tests/0300_lehrkraft_avatare.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });
await db.exec(`
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;`);

let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`); };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); } catch (e) { if (f.startsWith('0087')) continue; console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const T = 'e0000000-0000-4000-8000-0000000000c1';   // Besitzerin
const T2 = 'e0000000-0000-4000-8000-0000000000c2';  // eingeladen
const S = 'e0000000-0000-4000-8000-0000000000c3';   // Schüler
const ADM = 'e0000000-0000-4000-8000-0000000000c4'; // Volladmin
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
for (const u of [T, T2, S, ADM]) await db.query(`insert into auth.users (id) values ($1)`, [u]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status) values
  ($1, $5, 't', 'T', 'active', 'approved'), ($2, $5, 't2', 'T2', 'active', 'approved'),
  ($3, $5, 's', 'S', 'active', 'none'), ($4, $5, 'adm', 'ADM', 'active', 'none')`, [T, T2, S, ADM, SCHOOL]);
await db.query(`update profiles set is_superadmin = true where id = $1`, [ADM]);

const has = async (u, like) => (await db.query(`select avatar_id from mps_avatar_unlocks where user_id = $1 and avatar_id like $2 order by 1`, [u, like])).rows.map(x => x.avatar_id);
let n = 0;
async function room(tool) {
  n++;
  const r = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title) values ($1, $2, $3, $4, 'R') returning id`,
    ['RAUM' + 'ABCDEFGH'[n] + 'Z', tool, T, SCHOOL])).id;
  await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [r, T2]);
  const p = (await one(`insert into skill_participants (room_id, token, seat, name, user_id) values ($1, $2, 1, 'S', $3) returning id`, [r, 'tok' + n, S])).id;
  return { r, p };
}

/* 1–2 Knowledge Stack */
const K = await room('knowledgestack');
await db.query(`insert into ks_boards (room_id, phase) values ($1, 'reveal')`, [K.r]);
await db.query(`insert into ks_players (participant_id, room_id, creature_id, score) values ($1, $2, 0, 0)`, [K.p, K.r]);
const ksRound = async () => {
  await db.query(`update ks_boards set phase = 'lobby' where room_id = $1`, [K.r]);
  await db.query(`update ks_boards set phase = 'ended' where room_id = $1`, [K.r]);
};
await ksRound();
ok('2  Quiz ohne Antwort: Lehrkraft bekommt nichts', (await has(T, 'mps_knowledgestack_%')).length === 0);
await db.query(`insert into ks_answers (room_id, question_idx, participant_id, chosen_idx, is_correct) values ($1, 0, $2, 0, true)`, [K.r, K.p]);
await ksRound();
ok('1  eine Runde → je ein Wesen für beide Lehrkräfte',
  (await has(T, 'mps_knowledgestack_%')).length === 1 && (await has(T2, 'mps_knowledgestack_%')).length === 1);
for (let i = 0; i < 39; i++) await ksRound();
let t = await has(T, 'mps_knowledgestack_%');
ok('1  nach 40 Runden alle 40 Wesen, noch kein Gold', t.length === 40 && !t.some(x => x.endsWith('_gold')), t.length);
await ksRound();
t = await has(T, 'mps_knowledgestack_%_gold');
ok('1  Runde 41 → erstes Gold', t.length === 1, JSON.stringify(t));
for (let i = 0; i < 45; i++) await ksRound();
ok('1  voll: 80 und nicht mehr', (await has(T, 'mps_knowledgestack_%')).length === 80);
ok('5  Schüler hat nur sein Wesen', JSON.stringify(await has(S, 'mps_knowledgestack_%')) === '["mps_knowledgestack_puddl"]', JSON.stringify(await has(S, 'mps_knowledgestack_%')));

/* 3 Mathoria */
const C = await room('clash-of-math');
await db.query(`insert into clash_boards (room_id, team_count, factions, mode, phase) values ($1, 2, '[1, 5]', 'pvp', 'running')`, [C.r]);
await db.query(`insert into clash_players (participant_id, team_index) values ($1, 1)`, [C.p]);
await db.query(`update clash_boards set winner_team = 0 where room_id = $1`, [C.r]);
ok('3  Mathoria: Runde zu Ende (Schüler verliert) → Lehrkraft ein Volk', (await has(T, 'mps_clash-of-math_%')).length === 1);
ok('5  Mathoria: Verlierer bekommt nichts', (await has(S, 'mps_clash-of-math_%')).length === 0);
await db.query(`update clash_boards set winner_team = 0 where room_id = $1`, [C.r]);
ok('3  gleicher Sieger nochmal geschrieben → nichts', (await has(T, 'mps_clash-of-math_%')).length === 1);
for (let i = 0; i < 10; i++) {
  await db.query(`update clash_boards set winner_team = null where room_id = $1`, [C.r]);
  await db.query(`update clash_boards set winner_team = -1 where room_id = $1`, [C.r]);
}
ok('3  Mathoria voll bei 8', (await has(T, 'mps_clash-of-math_%')).length === 8);

/* 3 Wordisland */
const W = await room('wordisland');
await db.query(`insert into wi_boards (room_id) values ($1)`, [W.r]);
await db.query(`insert into wi_players (participant_id, room_id, team_index) values ($1, $2, 0)`, [W.p, W.r]);
const wiRound = async () => {
  await db.query(`update wi_boards set winner_team = null where room_id = $1`, [W.r]);
  await db.query(`update wi_boards set winner_team = 1 where room_id = $1`, [W.r]);
};
for (let i = 0; i < 8; i++) await wiRound();
t = await has(T2, 'mps_wordisland_%');
ok('3  Wordisland: 8 Runden = alle _1', t.length === 8 && t.every(x => x.endsWith('_1')), JSON.stringify(t));
for (let i = 0; i < 8; i++) await wiRound();
t = await has(T2, 'mps_wordisland_%');
ok('3  Wordisland: dann alle _4, noch kein Gold', t.length === 16 && !t.some(x => x.endsWith('_gold')));
for (let i = 0; i < 9; i++) await wiRound();
ok('3  Wordisland: dann Gold, voll bei 24', (await has(T2, 'mps_wordisland_%_gold')).length === 8 && (await has(T2, 'mps_wordisland_%')).length === 24);

/* 3 Kistenturm */
const D = await room('derby');
await db.query(`insert into dd_storm_boards (room_id, phase, team_count) values ($1, 'running', 2)`, [D.r]);
await db.query(`insert into dd_storm_players (participant_id, room_id, team) values ($1, $2, 0)`, [D.p, D.r]);
for (let i = 0; i < 7; i++) {
  await db.query(`update dd_storm_boards set phase = 'lobby' where room_id = $1`, [D.r]);
  await db.query(`update dd_storm_boards set phase = 'ended' where room_id = $1`, [D.r]);
}
ok('3  Kistenturm: 6 Figuren nach 7 Runden', (await has(T, 'mps_derby_kt_%')).length === 6);

/* 4 Nebeltal */
const N = await room('nebeltal');
await db.query(`insert into nt_rounds (room_id, phase, level, run) values ($1, 'running', 5, 1)`, [N.r]);
await db.query(`insert into nt_players (participant_id, room_id, run) values ($1, $2, 1)`, [N.p, N.r]);
await db.query(`update nt_rounds set phase = 'ended' where room_id = $1`, [N.r]);
t = await has(T, 'mps_nebeltal_%');
ok('4  Nebeltal: 3D-Pinguin + Adelie + Zügel', JSON.stringify(t) === '["mps_nebeltal_adelie","mps_nebeltal_pinguin3d","mps_nebeltal_zuegel"]', JSON.stringify(t));

/* 6 Volladmin */
const myAll = async u => { await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]); return (await one(`select mps_my_avatars() r`)).r; };
ok('6  Volladmin: all = true', (await myAll(ADM)).all === true);
ok('6  Lehrkraft: all = false, Liste da', (await myAll(T)).all === false && (await myAll(T)).avatars.length > 0);

/* 0300 zweimal */
try { await db.exec(mig(FILES.find(f => f.startsWith('0300')))); ok('7  0300 läuft ein zweites Mal durch', true); }
catch (e) { ok('7  0300 läuft ein zweites Mal durch', false, e.message); }

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles ok');
process.exit(fails ? 1 : 0);
