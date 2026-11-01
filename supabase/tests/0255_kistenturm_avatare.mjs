/* Prüfstand für Migration 0255 — Kistenturm: Teamfigur als Profilbild.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0255.

   Aufruf:  node supabase/tests/0255_kistenturm_avatare.mjs */
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
const r0 = await call(`skill_room_create('derby', 'Bio', false, '{}'::jsonb)`);
const CODE = r0.code, ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const S = (await call(`dd_stack_save(null, null, 'Zelle', '', '', '', '[{"t":"Kern","d":"Mitte"}]'::jsonb)`)).id;

// 6 Schüler, 4 mit Konto (u0…u3), 2 Gäste
const U = [0, 1, 2, 3].map(i => `e0000000-0000-4000-8000-00000000010${i}`);
for (const [i, u] of U.entries()) {
  await db.query(`insert into auth.users (id) values ($1)`, [u]);
  await db.query(`insert into profiles (id, school_id, account_name, display_name, status) values ($1, $2, $3, $3, 'active')`, [u, SCHOOL, 's' + i]);
}
for (let i = 0; i < 6; i++) await db.query(`insert into skill_participants (room_id, token, seat, name, user_id) values ($1, $2, $3, $4, $5)`, [ROOM, 'tok' + i, i + 1, 'K' + i, U[i] ?? null]);

const KEYS = ['astro', 'lama', 'lauch', 'gameboy', 'popcorn', 'ghost'];
const mine = async u => (await db.query(`select avatar_id from mps_avatar_unlocks where user_id = $1 and avatar_id like 'mps_derby_kt_%' order by 1`, [u])).rows.map(x => x.avatar_id);
const boxes = (t, n) => db.query(`select dd_storm_put($1, $2, $3::jsonb)`, [ROOM, t, JSON.stringify(Array.from({ length: n }, () => ({ k: 'n', t })))]);
const teamOf = async u => (await one(`select pl.team from dd_storm_players pl join skill_participants p on p.id = pl.participant_id where p.user_id = $1`, [u]))?.team;
async function start() {
  await call(`dd_storm_room_start($1)`, [CODE]);
  await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
  await call(`dd_storm_room_get($1, 0)`, [CODE]);
}

/* 1 Ziel erreicht: Team 1 spielt Figur 5 (Magic Ghost), figs wird sortiert gespeichert */
await call(`dd_storm_room_setup($1, 2, 10, 0, $2::jsonb)`, [CODE, JSON.stringify([S])]);
await call(`dd_storm_room_figs($1, '[1, 5]'::jsonb)`, [CODE]);
await start();
const t = await Promise.all(U.map(teamOf));
ok('0  beide Teams haben Mitglieder mit Konto', t.includes(0) && t.includes(1), JSON.stringify(t));
await boxes(1, 9); await boxes(0, 3);
await db.exec(`update dd_storm_boards set phase = 'running'`);
const before = await Promise.all(U.map(mine));
ok('1  vor dem Sieg nichts frei', before.every(x => x.length === 0));
await boxes(1, 10);
await call(`dd_storm_check_win($1)`, [ROOM]);
const b = await one(`select phase, winners from dd_storm_boards where room_id = $1`, [ROOM]);
ok('1  Spiel zu Ende, Team 1 gewinnt', b.phase === 'ended' && JSON.stringify(b.winners) === '[1]', JSON.stringify(b));
for (const [i, u] of U.entries()) {
  const m = await mine(u);
  if (t[i] === 1) ok(`1  Sieger s${i} bekommt Magic Ghost`, JSON.stringify(m) === '["mps_derby_kt_ghost"]', JSON.stringify(m));
  else ok(`1  Verlierer s${i} bekommt nichts`, m.length === 0, JSON.stringify(m));
}
const all = (await one(`select count(*)::int n from mps_avatar_unlocks where avatar_id like 'mps_derby_kt_%'`)).n;
ok('1  Gäste ohne Konto bekommen nichts (nur Konten in der Tabelle)', all === t.filter(x => x === 1).length);

/* 2 Gleichstand beim Beenden: beide Teams, Figuren 5 und 1 */
await call(`dd_storm_room_reset($1)`, [CODE]);
await start();
const t2 = await Promise.all(U.map(teamOf));
await boxes(0, 4); await boxes(1, 4);
await call(`dd_storm_room_stop($1)`, [CODE]);
for (const [i, u] of U.entries()) {
  const m = await mine(u);
  const want = t2[i] === 0 ? 'mps_derby_kt_lama' : 'mps_derby_kt_ghost';
  ok(`2  Gleichstand: s${i} hat ${want}`, m.includes(want), JSON.stringify(m));
}

/* 3 Beenden ohne eine Kiste: keine Sieger, nichts frei */
await call(`dd_storm_room_reset($1)`, [CODE]);
await call(`dd_storm_room_figs($1, '[2, 3]'::jsonb)`, [CODE]);
await start();
await call(`dd_storm_room_stop($1)`, [CODE]);
const any23 = (await one(`select count(*)::int n from mps_avatar_unlocks where avatar_id in ('mps_derby_kt_lauch', 'mps_derby_kt_gameboy')`)).n;
ok('3  ohne Kisten kein Sieger, nichts frei', any23 === 0);

/* 4 mps_my_avatars liefert die eigenen */
const w = U[t.indexOf(1)];
await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [w]);
const my = (await one(`select mps_my_avatars() r`)).r.avatars.map(x => x.id);
ok('4  mps_my_avatars enthält Magic Ghost', my.includes('mps_derby_kt_ghost'), JSON.stringify(my));

let twice = true;
try { await db.exec(mig('0255_kistenturm_avatare.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('5  0255 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
