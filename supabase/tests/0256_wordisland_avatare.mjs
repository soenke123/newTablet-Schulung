/* Prüfstand für Migration 0256 — Myth of Wordisland: Profilbilder.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0256.

     1. Völker: 1. Sieg → _1, 2. Sieg → _4, Verlierer und Gäste nichts,
        Volk = factions[winner_team] in der Reihenfolge von tool.js.
     2. Gold: zwei Siege + level_max 5 — in beiden Reihenfolgen.
     3. Nachmelden: Anmeldung nach dem Sieg zählt die Runde, aber nur einmal.
     4. Echsen: wi_echse_avatars würfelt wie neuesTier in tool.js
        (über viele ids verglichen), Stufe aus wi_solo_progress,
        Geräte-Inseln bekommen nichts.
     5. Jede vergebene id steht im Katalog von avatars.js, jede Datei liegt im Ordner.
     6. Siege überleben das Löschen des Raums, gehen mit dem Konto.

   Aufruf:  node supabase/tests/0256_wordisland_avatare.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const T = 'e0000000-0000-4000-8000-0000000000a1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status) values ($1, $2, 'lk', 'LK', 'active', 'approved')`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const r0 = await call(`skill_room_create('wordisland', 'Englisch', false, '{}'::jsonb)`);
const ROOM = (await one(`select id from skill_rooms where code = $1`, [r0.code])).id;

const U = [0, 1, 2, 3].map(i => `e0000000-0000-4000-8000-00000000010${i}`);
for (const [i, u] of U.entries()) {
  await db.query(`insert into auth.users (id) values ($1)`, [u]);
  await db.query(`insert into profiles (id, school_id, account_name, display_name, status) values ($1, $2, $3, $3, 'active')`, [u, SCHOOL, 's' + i]);
}
// Sitze: s0, s1 in Team 0 · s2 in Team 1 · s3 erst Gast in Team 0 · ein Gast in Team 1
const P = [];
const seats = [[U[0], 0], [U[1], 0], [U[2], 1], [null, 0], [null, 1]];
for (const [i, [u, team]] of seats.entries()) {
  const p = (await one(`insert into skill_participants (room_id, token, seat, name, user_id) values ($1, $2, $3, $4, $5) returning id`, [ROOM, 'tok' + i, i + 1, 'K' + i, u])).id;
  await db.query(`insert into wi_players (participant_id, room_id, team_index) values ($1, $2, $3)`, [p, ROOM, team]);
  P.push(p);
}
await db.query(`insert into wi_boards (room_id) values ($1) on conflict (room_id) do nothing`, [ROOM]);

const mine = async (u, like = 'mps_wordisland_%') => (await db.query(`select avatar_id from mps_avatar_unlocks where user_id = $1 and avatar_id like $2 order by 1`, [u, like])).rows.map(x => x.avatar_id);
const crew = u => mine(u, 'mps_wordisland_%\\_%').then(a => a.filter(x => !x.includes('echse')));
let round = 0;
async function win(team, factions) {
  round++;
  await db.query(`update wi_boards set phase = 'lobby', winner_team = null, factions = $2::jsonb, team_count = $3,
                    started_at = null, ended_at = null where room_id = $1`, [ROOM, JSON.stringify(factions), factions.length]);
  await db.query(`update wi_boards set phase = 'running', started_at = now() + make_interval(mins => $2) where room_id = $1`, [ROOM, round]);
  await db.query(`update wi_boards set phase = 'ended', ended_at = now(), winner_team = $2 where room_id = $1`, [ROOM, team]);
}

/* 1 Völker */
// Team 0 spielt Volk 1 (Robo-Enten = blue), Team 1 Volk 6 (Wolken-Piraten = rosa)
await win(0, [1, 6]);
ok('1  erster Sieg: s0 bekommt Robo-Enten Stufe 1', JSON.stringify(await crew(U[0])) === '["mps_wordisland_blue_1"]', JSON.stringify(await crew(U[0])));
ok('1  erster Sieg: s1 auch', JSON.stringify(await crew(U[1])) === '["mps_wordisland_blue_1"]');
ok('1  Verlierer s2 bekommt nichts', (await crew(U[2])).length === 0);
await win(1, [1, 6]);
ok('1  Sieg Team 1 mit Volk 6 → rosa (Wolken-Piraten)', JSON.stringify(await crew(U[2])) === '["mps_wordisland_rosa_1"]', JSON.stringify(await crew(U[2])));
await win(1, [3, 7]);
ok('1  Volk 7 → magenta (Spuk-Einhorn)', JSON.stringify(await crew(U[2])) === '["mps_wordisland_magenta_1","mps_wordisland_rosa_1"]', JSON.stringify(await crew(U[2])));
await win(0, [1, 6]);
ok('1  zweiter Sieg mit demselben Volk → Stufe 4', JSON.stringify(await crew(U[0])) === '["mps_wordisland_blue_1","mps_wordisland_blue_4"]', JSON.stringify(await crew(U[0])));
ok('1  kein Gold ohne Level 5', !(await crew(U[0])).some(x => x.endsWith('_gold')));
await db.query(`update wi_boards set winner_team = 0 where room_id = $1`, [ROOM]);
ok('1  derselbe Sieger noch einmal geschrieben zählt nicht doppelt',
   (await one(`select count(*)::int n from wi_team_wins where user_id = $1`, [U[0]])).n === 2);
await win(1, [2, 6]);
await win(0, [2, 6]);   // s0: Brokkoli 1×, Robo 2× (Siege mit verschiedenen Völkern zählen getrennt)
ok('1  Siege je Volk getrennt: Brokkoli nur Stufe 1',
   (await crew(U[0])).includes('mps_wordisland_green_1') && !(await crew(U[0])).includes('mps_wordisland_green_4'));

/* 2 Gold */
await db.query(`insert into wi_solo_learners (user_id, level, level_max) values ($1, 4, 4)`, [U[0]]);
ok('2  Level 4 reicht nicht', !(await crew(U[0])).some(x => x.endsWith('_gold')));
await db.query(`update wi_solo_learners set level = 5, level_max = 5 where user_id = $1`, [U[0]]);
ok('2  Level 5 erreicht → Gold nur für das Volk mit zwei Siegen',
   JSON.stringify((await crew(U[0])).filter(x => x.endsWith('_gold'))) === '["mps_wordisland_blue_4_gold"]', JSON.stringify(await crew(U[0])));
// andere Reihenfolge: s1 hat Level 5 schon, gewinnt danach zum zweiten Mal
await db.query(`insert into wi_solo_learners (user_id, level, level_max) values ($1, 3, 5)`, [U[1]]);
ok('2  s1: zwei Robo-Siege, neue Insel schon mit Level 5 → Gold sofort', (await crew(U[1])).includes('mps_wordisland_blue_4_gold'), JSON.stringify(await crew(U[1])));
ok('2  s1: Okto-Pferdchen noch ohne Sieg → nichts davon', !(await crew(U[1])).some(x => x.includes('tuerkis')));
await win(0, [5, 6]); await win(0, [5, 6]);
ok('2  s1: Krone schon da, zwei Siege mit Okto-Pferdchen → Gold', (await crew(U[1])).includes('mps_wordisland_tuerkis_4_gold'), JSON.stringify(await crew(U[1])));

/* 3 Nachmelden */
await win(0, [4, 6]);
ok('3  Gast bekommt nichts', (await db.query(`select 1 from wi_team_wins w join skill_participants p on p.user_id = w.user_id where p.id = $1`, [P[3]])).rows.length === 0);
await db.query(`update skill_participants set user_id = $1 where id = $2`, [U[3], P[3]]);
ok('3  nach Anmeldung zählt der Sieg der Runde', JSON.stringify(await crew(U[3])) === '["mps_wordisland_lila_1"]', JSON.stringify(await crew(U[3])));
await db.query(`update skill_participants set user_id = null where id = $1`, [P[3]]);
await db.query(`update skill_participants set user_id = $1 where id = $2`, [U[3], P[3]]);
ok('3  zweimal anmelden zählt nicht doppelt', (await one(`select count(*)::int n from wi_team_wins where user_id = $1`, [U[3]])).n === 1);

/* 4 Echsen */
const hashKey = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 1; };
const VAR2 = ['', 'a', 'b'], VAR3 = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'e'];
const jsForms = (id, st) => {
  const h = hashKey(id), v2 = VAR2[(h >>> 8) % 3], v3 = VAR3[(h >>> 14) % 8], r = [];
  if (st >= 1) r.push('echse1');
  if (st >= 2 && v2 === 'b') r.push('echse2b', 'echse2b_snooze');
  if (st >= 4 && 'bcd'.includes(v3)) r.push('echse4' + v3);
  if (st >= 4 && v3 === 'e') r.push('echse4e_swim');
  return r;
};
const ids = (await db.query(`select gen_random_uuid()::text id from generate_series(1, 400)`)).rows.map(r => r.id);
let diff = 0;
const seen = new Set();
for (const id of ids) for (const st of [0, 1, 2, 3, 4]) {
  const sq = (await one(`select wi_echse_avatars($1, $2) a`, [id, st])).a;
  const js = jsForms(id, st);
  js.forEach(x => seen.add(x));
  if (JSON.stringify(sq) !== JSON.stringify(js)) { if (!diff) console.log('   erster Unterschied', id, st, sq, js); diff++; }
}
ok(`4  SQL würfelt wie tool.js (${ids.length} ids × 5 Stufen)`, diff === 0, `${diff} Unterschiede`);
ok('4  alle sieben Echsen kommen vor', seen.size === 7, [...seen].join(','));

const SET = (await one(`insert into vocab_sets (title) values ('Unit 1') returning id`)).id;
const items = [];
for (let i = 0; i < 60; i++) items.push((await one(`insert into vocab_items (set_id, term, translation) values ($1, $2, $3) returning id::text id`, [SET, 'Wort' + i, 'word' + i])).id);
const L2 = (await one(`insert into wi_solo_learners (user_id) values ($1) returning id`, [U[2]])).id;
const LG = (await one(`insert into wi_solo_learners (token) values ('geraet') returning id`)).id;
for (const L of [L2, LG]) await db.query(`insert into wi_solo_sets (learner_id, set_id) values ($1, $2)`, [L, SET]);
const echsen = u => mine(u, 'mps_wordisland_echse%');
const setPts = async (L, item, de, en) => {
  for (const [dir, pts] of [['de_en', de], ['en_de', en]])
    await db.query(`insert into wi_solo_progress (learner_id, item_id, dir, points) values ($1, $2, $3, $4)
                    on conflict (learner_id, item_id, dir) do update set points = excluded.points`, [L, item, dir, pts]);
};
await setPts(L2, items[0], 12, 2);
ok('4  nur eine Richtung weit → Stufe 0, nichts', (await echsen(U[2])).length === 0, JSON.stringify(await echsen(U[2])));
await setPts(L2, items[0], 12, 3);
ok('4  beide Richtungen 3 Punkte → geschlüpft (Echse1)', JSON.stringify(await echsen(U[2])) === '["mps_wordisland_echse1"]');
// alle Wörter auf Stufe 4 → genau die Formen, die tool.js für diese Wörter würfelt
for (const it of items) await setPts(L2, it, 12, 12);
const want = [...new Set(items.flatMap(it => jsForms(it, 4)))].map(x => 'mps_wordisland_' + x).sort();
const got = await echsen(U[2]);
ok('4  Stufe 4 bei allen Wörtern → Formen wie in tool.js', JSON.stringify(got) === JSON.stringify(want), `${got.length}/${want.length}`);
await setPts(L2, items[0], 0, 0);
ok('4  Rückfall nimmt nichts weg', (await echsen(U[2])).length === got.length);
for (const it of items.slice(0, 10)) await setPts(LG, it, 12, 12);
ok('4  Geräte-Insel: keine Zeile ohne Konto', (await one(`select count(*)::int n from mps_avatar_unlocks where user_id is null`)).n === 0);

/* 5 Katalog */
const av = readFileSync(`${REPO}/avatars.js`, 'utf8');
const block = av.slice(av.indexOf('mps_wordisland: ['), av.indexOf('\n    ],', av.indexOf('mps_wordisland: [')) + 1);
const cat = new Map([...block.matchAll(/\['([^']+)',\s*'([^']+)',\s*'[^']+'(,\s*\{\s*gold:\s*true\s*\})?\]/g)].map(m => [m[1], { file: m[2], gold: !!m[3] }]));
const ids_all = new Set();
for (const [k, v] of cat) { ids_all.add('mps_wordisland_' + k); if (v.gold) ids_all.add('mps_wordisland_' + k + '_gold'); }
const given = (await db.query(`select distinct avatar_id from mps_avatar_unlocks where avatar_id like 'mps_wordisland_%'`)).rows.map(r => r.avatar_id);
const fremd = given.filter(x => !ids_all.has(x));
ok(`5  jede vergebene id steht im Katalog (${given.length})`, fremd.length === 0, fremd.join(','));
const DIR = `${REPO}/avatare MPSkills/Wordisland`;
const fehlt = [];
for (const [, v] of cat) {
  if (!existsSync(`${DIR}/${v.file}`)) fehlt.push(v.file);
  if (v.gold && !existsSync(`${DIR}/${v.file.replace(/_avatar\.png$/, '_gold_avatar.png')}`)) fehlt.push(v.file + ' (gold)');
}
ok(`5  alle Dateien liegen im Ordner (${cat.size} Einträge)`, fehlt.length === 0, fehlt.join(', '));
const ungenutzt = readdirSync(DIR).filter(f => ![...cat.values()].some(v => v.file === f || (v.gold && v.file.replace(/_avatar\.png$/, '_gold_avatar.png') === f)));
ok('5  kein Bild im Ordner ohne Katalogeintrag', ungenutzt.length === 0, ungenutzt.join(', '));

/* 6 Raum weg, Konto weg */
const before = (await one(`select count(*)::int n from wi_team_wins`)).n;
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('6  Siege überleben den Raum', (await one(`select count(*)::int n from wi_team_wins`)).n === before && before > 0);
await db.query(`delete from profiles where id = $1`, [U[0]]);
ok('6  Siege gehen mit dem Konto', (await one(`select count(*)::int n from wi_team_wins where user_id = $1`, [U[0]])).n === 0);
const g = await one(`select has_table_privilege('authenticated', 'wi_team_wins', 'select') a, has_table_privilege('anon', 'wi_team_wins', 'select') b`);
ok('6  wi_team_wins ohne Rechte für anon/authenticated', !g.a && !g.b);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
