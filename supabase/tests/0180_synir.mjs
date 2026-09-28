/* Prüfstand für Migration 0180 — SYNIR im Raum.
   Echt gerechnet in pglite: eigene Szenarien gehören der Person,
   freigegebene erreichen nur die Klasse des eigenen Raums, und der
   Stand eines Tablets geht nur an die eigene Lehrkraft — und gar
   nicht, solange der Bildschirm blind ist.
*/
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 150, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique, tool_id text not null, owner_id uuid not null references profiles(id),
  school_id uuid, title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references skill_rooms(id) on delete cascade,
  token text not null unique, seat int not null, name text,
  blocked boolean not null default false);
create table if not exists skill_room_state (
  room_id uuid primary key references skill_rooms(id) on delete cascade,
  phase int not null default 1, data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create role service_role; create role authenticated; create role anon;
`;

let passed = 0, failed = 0;
function ok(desc, cond, extra = '') {
  if (cond) { passed++; console.log('ok    ' + desc + (extra ? '   ' + extra : '')); }
  else      { failed++; console.error('FAIL  ' + desc + (extra ? '   ' + extra : '')); }
}

async function asUser(uid, fn) {
  await db.query('delete from _who');
  if (uid) await db.query('insert into _who values ($1)', [uid]);
  try { return await fn(); }
  finally { await db.query('delete from _who'); }
}

const q1 = async (sql, args) => (await db.query(sql, args)).rows[0].r;

async function run() {
  await db.exec(STUBS);
  const mig = readFileSync(`${REPO}/supabase/migrations/0180_synir.sql`, 'utf8');
  await db.exec(mig);
  await db.exec(mig);
  ok('Migration läuft zweimal durch', true);

  const tool = (await db.query(`select * from skill_tools where id = 'synir'`)).rows[0];
  ok('Registry-Zeile steht', tool && tool.folder === 'synir' && tool.subject === 'Informatik');

  const A = (await db.query(`insert into profiles default values returning id`)).rows[0].id;
  const B = (await db.query(`insert into profiles default values returning id`)).rows[0].id;
  const roomA = (await db.query(
    `insert into skill_rooms (code, tool_id, owner_id, title) values ('AAAAAA','synir',$1,'7b') returning id`, [A])).rows[0].id;
  const roomB = (await db.query(
    `insert into skill_rooms (code, tool_id, owner_id, title) values ('BBBBBB','synir',$1,'8c') returning id`, [B])).rows[0].id;
  const pA = (await db.query(
    `insert into skill_participants (room_id, token, seat, name) values ($1,'tokA',1,'Mia') returning id`, [roomA])).rows[0].id;
  await db.query(`insert into skill_participants (room_id, token, seat) values ($1,'tokB',1)`, [roomB]);

  const netz = { v: 2, nodes: [{ id: 'n1' }], cables: [] };

  // ── Eigene Szenarien ──────────────────────────────────────
  let r = await asUser(null, () => q1(`select synir_scenarios_list('AAAAAA') as r`));
  ok('Liste ohne Anmeldung: not_authenticated', r.error === 'not_authenticated');

  r = await asUser(A, () => q1(`select synir_scenario_save('AAAAAA', null, 'Routing', '<p>Los</p>', $1) as r`, [netz]));
  ok('A legt ein Szenario an', r.ok && r.created, JSON.stringify(r));
  const sA = r.id;

  r = await asUser(A, () => q1(`select synir_scenario_save('AAAAAA', null, '   ', '', $1) as r`, [netz]));
  ok('Leerer Name wird abgelehnt', r.error === 'invalid_input');

  r = await asUser(A, () => q1(`select synir_scenario_save('AAAAAA', $1, 'Routing 2', '<p>Neu</p>', $2) as r`, [sA, netz]));
  ok('A überschreibt das eigene', r.ok && !r.created && r.id === sA);

  r = await asUser(B, () => q1(`select synir_scenario_save('BBBBBB', $1, 'Fremd', '', $2) as r`, [sA, netz]));
  ok('B kann A\'s Szenario nicht überschreiben', r.error === 'not_found');

  r = await asUser(B, () => q1(`select synir_scenario_get('BBBBBB', $1) as r`, [sA]));
  ok('B kann A\'s Szenario nicht lesen', r.error === 'not_found');

  r = await asUser(A, () => q1(`select synir_scenario_get('AAAAAA', $1) as r`, [sA]));
  ok('A liest das eigene', r.ok && r.title === 'Routing 2' && r.aufgabe === '<p>Neu</p>' && r.netz.nodes.length === 1);

  r = await asUser(A, () => q1(`select synir_scenarios_list('ZZZZZZ') as r`));
  ok('Liste hängt an der Person, nicht am Raum', r.ok && r.items.length === 1 && r.items[0].id === sA);

  r = await asUser(B, () => q1(`select synir_scenarios_list('BBBBBB') as r`));
  ok('B sieht A\'s Szenarien nicht', r.ok && r.items.length === 0);

  const big = { v: 2, nodes: [{ id: 'x', blob: 'a'.repeat(310000) }], cables: [] };
  r = await asUser(A, () => q1(`select synir_scenario_save('AAAAAA', null, 'Groß', '', $1) as r`, [big]));
  ok('Zu großes Netz wird abgelehnt', r.error === 'payload_too_big');

  // ── Freigabe an die Klasse ────────────────────────────────
  r = await q1(`select synir_shared_get('tokA', $1) as r`, [sA]);
  ok('Nicht freigegeben: Schüler bekommt nichts', r.error === 'not_found');

  await db.query(`insert into skill_room_state (room_id, data) values ($1, $2)`,
    [roomA, { shared: [{ id: sA, t: 'Routing 2' }, { id: 'builtin:zwei', t: 'Zwei' }], blind: false }]);
  r = await q1(`select synir_shared_get('tokA', $1) as r`, [sA]);
  ok('Freigegeben: Schüler bekommt Netz und Aufgabe', r.ok && r.aufgabe === '<p>Neu</p>' && r.netz.v === 2);

  r = await q1(`select synir_shared_get('tokA', 'builtin:zwei') as r`);
  ok('Mitgelieferte kommen nicht vom Server', r.error === 'not_found');

  r = await q1(`select synir_shared_get('tokB', $1) as r`, [sA]);
  ok('Anderer Raum: nichts', r.error === 'not_found');

  // Eine Lehrkraft schreibt eine fremde ID in ihre Liste.
  await db.query(`insert into skill_room_state (room_id, data) values ($1, $2)`,
    [roomB, { shared: [{ id: sA, t: 'geklaut' }] }]);
  r = await q1(`select synir_shared_get('tokB', $1) as r`, [sA]);
  ok('Fremdes Szenario in der Liste: nichts', r.error === 'not_found');

  r = await q1(`select synir_shared_get('nix', $1) as r`, [sA]);
  ok('Unbekannter Token', r.error === 'unknown_token');

  // ── Stand der Tablets ─────────────────────────────────────
  r = await q1(`select synir_work_put('tokA', $1) as r`, [{ titel: 'Routing 2', nodes: [{ id: 'a' }, { id: 'b' }] }]);
  ok('Tablet meldet seinen Stand', r.ok);

  r = await asUser(A, () => q1(`select synir_work_list('AAAAAA') as r`));
  ok('Lehrkraft sieht die Liste', r.ok && r.items.length === 1 && r.items[0].name === 'Mia'
     && r.items[0].geraete === 2 && r.items[0].titel === 'Routing 2');

  r = await asUser(B, () => q1(`select synir_work_list('AAAAAA') as r`));
  ok('Fremde Lehrkraft: not_found', r.error === 'not_found');

  r = await asUser(A, () => q1(`select synir_work_get('AAAAAA', $1) as r`, [pA]));
  ok('Lehrkraft holt den Stand', r.ok && r.changed && r.stand.nodes.length === 2);
  const t0 = r.updated_at;

  r = await asUser(A, () => q1(`select synir_work_get('AAAAAA', $1, $2) as r`, [pA, t0]));
  ok('Nichts Neues: changed=false ohne Netz', r.ok && r.changed === false && !r.stand);

  r = await asUser(B, () => q1(`select synir_work_get('BBBBBB', $1) as r`, [pA]));
  ok('Fremder Raum: not_found', r.error === 'not_found');

  // ── Blind und gesperrt ────────────────────────────────────
  await db.query(`update skill_room_state set data = data || '{"blind":true}' where room_id = $1`, [roomA]);
  r = await q1(`select synir_work_put('tokA', $1) as r`, [{ nodes: [] }]);
  ok('Blind: Stand wird abgelehnt', r.error === 'blind');
  r = await asUser(A, () => q1(`select synir_work_get('AAAAAA', $1) as r`, [pA]));
  ok('… und der alte bleibt stehen', r.stand.nodes.length === 2);

  await db.query(`update skill_room_state set data = data || '{"blind":false}' where room_id = $1`, [roomA]);
  await db.query(`update skill_participants set blocked = true where id = $1`, [pA]);
  r = await q1(`select synir_work_put('tokA', $1) as r`, [{ nodes: [] }]);
  ok('Stillgelegt: blocked', r.error === 'blocked');
  r = await q1(`select synir_shared_get('tokA', $1) as r`, [sA]);
  ok('Stillgelegt: kein Szenario', r.error === 'blocked');
  await db.query(`update skill_participants set blocked = false where id = $1`, [pA]);

  r = await q1(`select synir_work_put('tokA', $1) as r`, [{ x: 'a'.repeat(310000) }]);
  ok('Zu großer Stand wird abgelehnt', r.error === 'payload_too_big');

  // ── Löschen ───────────────────────────────────────────────
  r = await asUser(B, () => q1(`select synir_scenario_delete('BBBBBB', $1) as r`, [sA]));
  ok('B kann A\'s Szenario nicht löschen', r.error === 'not_found');
  r = await asUser(A, () => q1(`select synir_scenario_delete('AAAAAA', $1) as r`, [sA]));
  ok('A löscht das eigene', r.ok);
  r = await q1(`select synir_shared_get('tokA', $1) as r`, [sA]);
  ok('Gelöscht: auch freigegeben nicht mehr erreichbar', r.error === 'not_found');

  console.log(`\n${passed} ok, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
