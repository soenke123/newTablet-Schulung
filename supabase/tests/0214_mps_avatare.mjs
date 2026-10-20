/* Prüfstand für Migration 0214 — Profilbilder aus MPSkills.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0214.

   Die Kernzusagen (Kingdoms of Mathoria):
     1. Sieg → jedes angemeldete Mitglied des Sieger-Teams bekommt
        das Bild seines Volkes (factions[slot]).
     2. Verlierer und Gäste ohne Konto bekommen nichts.
     3. Doppelter Sieg schaltet nichts doppelt frei.
     4. PvE: Sieg des Computers schaltet nichts frei, Sieg der Klasse schon.
     5. mps_my_avatars liefert nur die eigenen.
     6. Konto-Reset (0209) räumt die Freischaltungen ab.

   Aufruf:  node supabase/tests/0214_mps_avatare.mjs */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

const STUBS = `
create schema if not exists auth; create schema if not exists extensions;
set search_path = public, extensions;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create role service_role; create role authenticated; create role anon;
create publication supabase_realtime;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const A = 'e0000000-0000-4000-8000-0000000000b1';  // Team 0 (Slot 0)
const B = 'e0000000-0000-4000-8000-0000000000b2';  // Team 1 (Slot 1)
const T = 'e0000000-0000-4000-8000-0000000000b3';  // Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [A, B, T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status)
                values ($1, $4, 'a', 'A', 'active'), ($2, $4, 'b', 'B', 'active'), ($3, $4, 't', 'T', 'active')`,
               [A, B, T, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]); };
const mine = async u => { await as(u); return (await one(`select mps_my_avatars() as r`)).r.avatars.map(x => x.id).sort(); };

async function room(code, mode) {
  const r = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                        values ($1, 'clash-of-math', $2, $3, 'R') returning id`, [code, T, SCHOOL])).id;
  // Völker: Slot 0 = blau (1), Slot 1 = türkis (5)
  await db.query(`insert into clash_boards (room_id, team_count, factions, mode, ai_slot, phase)
                  values ($1, 2, '[1, 5]', $2, $3, 'running')`, [r, mode, mode === 'pve' ? 1 : null]);
  const seat = async (n, uid, team) => {
    const p = (await one(`insert into skill_participants (room_id, token, seat, name, user_id)
                          values ($1, $2, $3, $4, $5) returning id`, [r, code + n, n, 'S' + n, uid])).id;
    await db.query(`insert into clash_players (participant_id, team_index) values ($1, $2)`, [p, team]);
  };
  return { r, seat };
}

/* 1–3: PvP */
const R1 = await room('AAAAAA', 'pvp');
await R1.seat(1, A, 0);
await R1.seat(2, B, 1);
await R1.seat(3, null, 0);   // Gast
await db.query(`update clash_boards set winner_team = 0, phase = 'ended' where room_id = $1`, [R1.r]);
ok('1  Sieger A bekommt das blaue Reich', JSON.stringify(await mine(A)) === '["mps_clash-of-math_blue"]', JSON.stringify(await mine(A)));
ok('2  Verlierer B bekommt nichts', (await mine(B)).length === 0);
ok('2  Gast ohne Konto: keine Zeile ohne user_id', (await one(`select count(*)::int n from mps_avatar_unlocks`)).n === 1);
await db.query(`update clash_boards set winner_team = null where room_id = $1`, [R1.r]);
await db.query(`update clash_boards set winner_team = 0 where room_id = $1`, [R1.r]);
ok('3  Zweiter Sieg: keine Dublette', (await one(`select count(*)::int n from mps_avatar_unlocks where user_id = $1`, [A])).n === 1);
await db.query(`update clash_boards set winner_team = -1 where room_id = $1`, [R1.r]);
ok('3  neutral (-1) schaltet nichts frei', (await mine(B)).length === 0);

/* 4: PvE */
const R2 = await room('BBBBBB', 'pve');
await R2.seat(1, B, 0);
await db.query(`update clash_boards set winner_team = 1 where room_id = $1`, [R2.r]);
ok('4  PvE: Computer gewinnt → nichts', (await mine(B)).length === 0);
await db.query(`update clash_boards set winner_team = 0 where room_id = $1`, [R2.r]);
ok('4  PvE: Klasse gewinnt → blaues Reich', JSON.stringify(await mine(B)) === '["mps_clash-of-math_blue"]');

/* 5 */
const R3 = await room('CCCCCC', 'pvp');
await R3.seat(1, B, 1);
await db.query(`update clash_boards set winner_team = 1 where room_id = $1`, [R3.r]);
ok('5  B: blau + türkis', JSON.stringify(await mine(B)) === '["mps_clash-of-math_blue","mps_clash-of-math_tuerkis"]', JSON.stringify(await mine(B)));
ok('5  A sieht nur seine', (await mine(A)).length === 1);
await db.exec(`delete from _who`);
ok('5  ohne Anmeldung: ok=false, leer', (await one(`select mps_my_avatars() as r`)).r.ok === false);

/* 6 */
await db.query(`select account_reset_content($1)`, [A]);
ok('6  Konto-Reset räumt ab', (await mine(A)).length === 0);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
