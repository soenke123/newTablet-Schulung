/* Prüfstand für Migration 0249 — Kistensturm: Item-Linien unten dichter, neue Gewichte, Mini/Maxi 40 s.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0249.

   Aufruf:  node supabase/tests/0249_kistensturm_itemlinien_gewichte.mjs */
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

const T = 'e0000000-0000-4000-8000-0000000000a1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status) values ($1, $2, 'lk', 'LK', 'active', 'approved')`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
let r = await call(`skill_room_create('derby', 'Bio', false, '{}'::jsonb)`);
const CODE = r.code, ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const S = (await call(`dd_stack_save(null, null, 'Zelle', '', '', '', '[{"t":"Kern","d":"Mitte"}]'::jsonb)`)).id;
for (let i = 0; i < 8; i++) await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, 'tok' + i, i + 1, 'K' + i]);

/* Helfer: Turm und Items direkt setzen, Antworten ohne 1,2-s-Sperre */
const boxes = (t, arr) => db.query(`select dd_storm_put($1, $2, $3::jsonb)`, [ROOM, t, JSON.stringify(arr)]);
const N = (t, n) => Array.from({ length: n }, () => ({ k: 'n', t }));
const give = (t, it) => db.query(`update dd_storm_teams set items = $3::jsonb where room_id = $1 and team = $2`, [ROOM, t, JSON.stringify([it])]);
const tokOf = async t => (await one(`select p.token from dd_storm_players pl join skill_participants p on p.id = pl.participant_id where pl.team = $1 order by p.seat limit 1`, [t])).token;
const team = async t => one(`select * from dd_storm_teams where room_id = $1 and team = $2`, [ROOM, t]);
const H = async t => Number((await team(t)).height);
const ans = async (t, okv) => { await db.exec(`update dd_storm_players set last_ok_at = null`); return call(`dd_storm_answer($1, $2, 0)`, [await tokOf(t), okv]); };
// seit 0247 darf nur der Halter des Items einsetzen (items_who), sonst die erste Person
const holderTok = async t => { const w = (await team(t)).items_who?.[0];
  return w ? (await one(`select token from skill_participants where id = $1`, [w])).token : tokOf(t); };
const use = async t => call(`dd_storm_use($1, 0, 0)`, [await holderTok(t)]);
const kinds = async t => (await team(t)).boxes.map(b => b.k).join('');

const below = async (often, goal, h) => (await one(`select dd_storm_lines_below($1, $2, $3) v`, [often, goal, h])).v;
ok('1  normal: 5 Linien, 3 unter 50 %', await below(false, 40, 40) === 5 && await below(false, 40, 19.9) === 3);
ok('1  häufig: 10 Linien, 6 unter 50 %', await below(true, 40, 40) === 10 && await below(true, 40, 19.9) === 6);
ok('1  Ziel 40, normal: Linien bei 6 · 12 · 18 · 26 · 34', await below(false, 40, 5.9) === 0 && await below(false, 40, 6) === 1
   && await below(false, 40, 18) === 3 && await below(false, 40, 25.9) === 3 && await below(false, 40, 34) === 5);

async function game(teams) {
  await call(`dd_storm_room_reset($1)`, [CODE]);
  await call(`dd_storm_room_setup($1, $2, 40, 0, $3::jsonb)`, [CODE, teams, JSON.stringify([S])]);
  await call(`dd_storm_room_start($1)`, [CODE]);
  await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
  await call(`dd_storm_room_get($1, 0)`, [CODE]);
}
const draws = async (t, n) => { const c = {}; for (let i = 0; i < n; i++) { const it = await call(`dd_storm_draw($1, $2)`, [ROOM, t]); c[it] = (c[it] || 0) + 1; } return c; };

/* 2 Gewichte, 4 Teams: Platz 1 · 2 (vorn) · 3 (hinten) · 4 (Letzter) */
await game(4);
await boxes(0, N(0, 20)); await boxes(1, N(1, 15)); await boxes(2, N(2, 10)); await boxes(3, N(3, 5));
const last = await draws(3, 600), third = await draws(2, 600), first = await draws(0, 300);
ok('2  Letzter: nie Möwe, Mini, Maxi, Eis, Bonus, Stein', ['moewe', 'mini', 'maxi', 'eis', 'bonus', 'stein'].every(k => !last[k]), JSON.stringify(last));
ok('2  Letzter: 3 Möwen, Sturm, Boom, Bus kommen', ['moewe3', 'sturm', 'boom', 'bus'].every(k => last[k] > 40), JSON.stringify(last));
ok('2  Platz 3: Teatime am häufigsten (Gewicht 5)', Object.entries(third).every(([k, n]) => k === 'tea' || n < third.tea), JSON.stringify(third));
ok('2  Erster: nur Bonus, Stein, Maxi, Eis, Kuddelmuddel', Object.keys(first).every(k => ['bonus', 'stein', 'maxi', 'eis', 'kuddel'].includes(k)), JSON.stringify(first));

/* 3 Item beim Überqueren der neuen Linie (Ziel 40 → Linie bei 6) */
await boxes(3, N(3, 5)); await db.exec(`update dd_storm_teams set items = '[]', line_max = 0 where team = 3`);
await ans(3, true);
ok('3  Höhe 5 → 6 überquert die erste Linie → Item', (await team(3)).items.length === 1 && (await team(3)).line_max === 1);

/* 4 Maxi und Mini dauern 40 s */
await give(3, 'maxi'); await use(3);
const mx = (await one(`select extract(epoch from maxi_until - now()) s from dd_storm_teams where room_id = $1 and team = 3`, [ROOM])).s;
ok('4  Maxi: 40 Sekunden', mx > 38 && mx <= 40.5, String(mx));
await give(3, 'mini'); await use(3);
const mn = (await one(`select extract(epoch from mini_until - now()) s from dd_storm_teams where room_id = $1 and team = 2`, [ROOM])).s;
ok('4  Mini: 40 Sekunden beim Team davor', mn > 38 && mn <= 40.5, String(mn));

let twice = true;
try { await db.exec(mig('0249_kistensturm_itemlinien_gewichte.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('5  0249 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
