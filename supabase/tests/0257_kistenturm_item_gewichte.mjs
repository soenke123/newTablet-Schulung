/* Prüfstand für Migration 0257 — Kistenturm: weniger zerstörende Items, mehr Maxi/Mini/Möwen.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0257.

   Aufruf:  node supabase/tests/0257_kistenturm_item_gewichte.mjs */
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

async function game(teams) {
  await call(`dd_storm_room_reset($1)`, [CODE]);
  await call(`dd_storm_room_setup($1, $2, 40, 0, $3::jsonb)`, [CODE, teams, JSON.stringify([S])]);
  await call(`dd_storm_room_start($1)`, [CODE]);
  await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
  await call(`dd_storm_room_get($1, 0)`, [CODE]);
}
const draws = async (t, n) => { const c = {}; for (let i = 0; i < n; i++) { const it = await call(`dd_storm_draw($1, $2)`, [ROOM, t]); c[it] = (c[it] || 0) + 1; } return c; };
const share = (c, ks) => ks.reduce((a, k) => a + (c[k] || 0), 0) / Object.values(c).reduce((a, b) => a + b, 0);
const BAD = ['sturm', 'bus', 'boom'];

/* 4 Teams: Platz 1 · 2 (vorn) · 3 (hinten) · 4 (Letzter) */
await game(4);
await boxes(0, N(0, 20)); await boxes(1, N(1, 15)); await boxes(2, N(2, 10)); await boxes(3, N(3, 5));
const first = await draws(0, 400), front = await draws(1, 800), back = await draws(2, 800), last = await draws(3, 800);
ok('1  Erster: nie Sturm, Bus, Boom', BAD.every(k => !first[k]), JSON.stringify(first));
ok('1  vordere Hälfte: Sturm+Bus+Boom unter 10 % (Soll 5 %)', share(front, BAD) < 0.10, JSON.stringify(front));
ok('1  hintere Hälfte: Sturm+Bus+Boom unter 18 % (Soll 10 %)', share(back, BAD) < 0.18, JSON.stringify(back));
ok('1  Letzter: Sturm+Bus+Boom unter 40 % (Soll 31 %)', share(last, BAD) < 0.40, JSON.stringify(last));
ok('1  vordere Hälfte: Möwe, Maxi, Mini zusammen über 45 % (Soll 52 %)', share(front, ['moewe', 'moewe3', 'maxi', 'mini']) > 0.45);
ok('1  hintere Hälfte (Platz 3, Teatime 5): Klauen + Maxi/Mini über 45 % (Soll 52 %)', share(back, ['moewe', 'moewe3', 'maxi', 'mini']) > 0.45);
ok('1  Letzter: 3 Möwen am häufigsten', Object.entries(last).every(([k, n]) => k === 'moewe3' || n < last.moewe3), JSON.stringify(last));
ok('1  Letzter: weiter nie Möwe, Mini, Maxi, Eis, Bonus, Stein', ['moewe', 'mini', 'maxi', 'eis', 'bonus', 'stein'].every(k => !last[k]));
ok('1  Bus seltener als Maxi in der hinteren Hälfte', (back.bus || 0) * 2 < (back.maxi || 0));

let twice = true;
try { await db.exec(mig('0257_kistenturm_item_gewichte.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('2  0257 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
