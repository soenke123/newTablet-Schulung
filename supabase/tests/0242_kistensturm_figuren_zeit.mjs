/* Prüfstand für Migration 0242 — Kistensturm: Teams nach Figur, Zeit im Spiel.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0242.

   Aufruf:  node supabase/tests/0242_kistensturm_figuren_zeit.mjs */
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
for (let i = 0; i < 7; i++) await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, $2, $3, $4)`, [ROOM, 'tok' + i, i + 1, 'K' + i]);

r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('Standard: Figuren 0–3, vier Teams', JSON.stringify(r.figs) === '[0,1,2,3]' && r.team_count === 4);

const figs = async f => call(`dd_storm_room_figs($1, $2::jsonb)`, [CODE, JSON.stringify(f)]);
ok('nur eine Figur → abgelehnt', (await figs([2])).error === 'invalid_input');
ok('doppelte Figur → abgelehnt', (await figs([2, 2])).error === 'invalid_input');
ok('Figur 6 → abgelehnt', (await figs([1, 6])).error === 'invalid_input');
ok('Text → abgelehnt', (await figs(['1', 2])).error === 'invalid_input');
ok('Figuren 5, 1, 3 → ok', (await figs([5, 1, 3])).ok === true);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('sortiert gespeichert, team_count = 3', JSON.stringify(r.figs) === '[1,3,5]' && r.team_count === 3);
ok('Lobby verteilt auf drei Teams', new Set(r.people.map(p => p.t)).size === 3 && r.people.every(p => p.t >= 0 && p.t < 3));

ok('Zeit in der Lobby → abgelehnt', (await call(`dd_storm_room_timer($1, 60)`, [CODE])).error === 'not_allowed');

await call(`dd_storm_room_setup($1, null, null, null, $2::jsonb)`, [CODE, JSON.stringify([S])]);
ok('Start', (await call(`dd_storm_room_start($1)`, [CODE])).ok === true);
ok('Figuren im Spiel nicht änderbar', (await figs([0, 1])).error === 'not_allowed');
ok('genau drei Türme', Number((await one(`select count(*) n from dd_storm_teams where room_id = $1`, [ROOM])).n) === 3);
await db.query(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('läuft ohne Zeitlimit', r.phase === 'running' && r.ends_at == null);

ok('ungültige Zeit → abgelehnt', (await call(`dd_storm_room_timer($1, 2)`, [CODE])).error === 'invalid_input');
ok('3 Minuten setzen', (await call(`dd_storm_room_timer($1, 180)`, [CODE])).ok === true);
const left = Number((await one(`select extract(epoch from ends_at - now()) s from dd_storm_boards where room_id = $1`, [ROOM])).s);
ok('Rundenende in 3 Minuten', left > 170 && left <= 180, left.toFixed(1));
ok('ohne Zeitlimit zurück', (await call(`dd_storm_room_timer($1, 0)`, [CODE])).ok === true);
ok('ends_at wieder leer', (await one(`select ends_at from dd_storm_boards where room_id = $1`, [ROOM])).ends_at == null);
await call(`dd_storm_room_timer($1, 60)`, [CODE]);
await db.query(`update dd_storm_boards set ends_at = now() - interval '1 second' where room_id = $1`, [ROOM]);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('Zeit um → beendet', r.phase === 'ended');
ok('Zeit nach dem Ende → abgelehnt', (await call(`dd_storm_room_timer($1, 60)`, [CODE])).error === 'not_allowed');

await db.query(`delete from _who`);
ok('ohne Anmeldung → abgelehnt', (await call(`dd_storm_room_figs($1, '[0,1]'::jsonb)`, [CODE])).error === 'not_authenticated');
await db.query(`insert into _who values ($1)`, [T]);

await db.exec(mig(FILES.find(f => f.startsWith('0242'))));
ok('Migration zweimal', true);

console.log(fails ? `\n${fails} Fehler` : '\nalles grün');
process.exit(fails ? 1 : 0);
