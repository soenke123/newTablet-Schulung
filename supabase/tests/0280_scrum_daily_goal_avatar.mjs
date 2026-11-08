/* Prüfstand für Migration 0280 — Scrum Werkstatt: Konto-Profilbild,
   Label nur selbst, gemeinsame Daily-Uhr, Schreibsperre am Product Goal.
   Echt gerechnet in pglite auf der ganzen Kette.

   Aufruf:  node supabase/tests/0280_scrum_daily_goal_avatar.mjs */
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
create publication supabase_realtime;
`);

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const BEKANNT = new Set(['0087']);
for (const f of readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8')); }
  catch (e) { if (BEKANNT.has(f.slice(0, 4))) continue; console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
}
console.log('— alle Migrationen laufen durch —\n');

const T = 'e0000000-0000-4000-8000-000000000a01';
const K = 'e0000000-0000-4000-8000-000000000a02';
const S = (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, K]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values ($1, $2, 'l', 'Frau L', 'approved')`, [T, S]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, avatar_id) values ($1, $2, 'k', 'Kim', 'mps_derby_baby')`, [K, S]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('SCRUMX', 'scrum', $1, $2, 'Team X') returning id`, [T, S])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 3) g`);
await db.query(`update skill_participants set user_id = $1 where token = 't1'`, [K]);
await call(`scrum_enter('t1', 'member')`);
await call(`scrum_enter('t2', 'member')`);
await call(`scrum_enter('t3', 'observer')`);
const P1 = (await one(`select id from skill_participants where token = 't1'`)).id;
const P2 = (await one(`select id from skill_participants where token = 't2'`)).id;

// 1 Profilbild
let v = await call(`scrum_view('t2', null)`);
const m1 = v.members.find(m => m.id === P1), m2 = v.members.find(m => m.id === P2);
ok('Ansicht: Mitglied mit Konto → account_avatar aus profiles', m1.account_avatar === 'mps_derby_baby', JSON.stringify(m1));
ok('Ansicht: ohne Konto → account_avatar null', m2.account_avatar === null);
ok('Ansicht: hochgeladenes Bild kommt nicht mehr mit', !('avatar' in m1));
ok('Ansicht: daily + now dabei', v.daily && v.daily.left === 300 && v.daily.run === false && typeof v.now === 'number');

// 2 Label
let r = await call(`scrum_member_update('t1', $1, $2)`, [P2, JSON.stringify({ label: 'fremd' })]);
ok('Label an fremder Karte → not_yours', r.error === 'not_yours', JSON.stringify(r));
r = await call(`scrum_member_update('t1', $1, $2)`, [P1, JSON.stringify({ label: 'Design' })]);
ok('Label an eigener Karte → ok', r.ok === true);
r = await call(`scrum_member_update('t1', $1, $2)`, [P2, JSON.stringify({ role: 'po' })]);
ok('Rolle an fremder Karte → weiter ok (das Team verteilt Rollen)', r.ok === true);
r = await call(`scrum_member_update('t3', $1, $2)`, [P2, JSON.stringify({ role: 'sm' })]);
ok('Beobachter → read_only', r.error === 'read_only');
await als(T);
r = await call(`scrum_room_member_update('SCRUMX', $1, $2)`, [P2, JSON.stringify({ label: 'von L' })]);
ok('Lehrkraft ändert Label → ok', r.ok === true);
await als(null);

// 3 Daily
const rev0 = (await one(`select rev from scrum_rooms where room_id = $1`, [R])).rev;
r = await call(`scrum_daily('t1', 'start')`);
ok('Daily start → läuft', r.ok && r.daily.run === true && r.daily.left === 300);
ok('Daily: Revision steigt (alle holen den Stand)', (await one(`select rev from scrum_rooms where room_id = $1`, [R])).rev > rev0);
// 20 s zurückdatieren
await db.query(`update scrum_rooms set daily = jsonb_set(daily, '{at}', to_jsonb((daily->>'at')::bigint - 20000)) where room_id = $1`, [R]);
r = await call(`scrum_daily('t2', 'pause')`);
ok('Daily pause → Rest vom Server gerechnet (~280 s)', r.daily.run === false && Math.abs(r.daily.left - 280) < 1.5, JSON.stringify(r.daily));
r = await call(`scrum_daily('t1', 'turn', $1)`, [P1]);
ok('Daily turn: P1 redet', r.daily.turn === P1);
r = await call(`scrum_daily('t1', 'turn', $1)`, [P2]);
ok('Daily turn: P2 → P1 abgehakt', r.daily.turn === P2 && r.daily.spoke.includes(P1));
r = await call(`scrum_daily('t3', 'start')`);
ok('Daily: Beobachter darf nicht', r.error === 'read_only');
r = await call(`scrum_daily('t1', 'turn', $1)`, ['e0000000-0000-4000-8000-0000000000ff']);
ok('Daily turn: Fremde id → not_found', r.error === 'not_found');
await als(T);
r = await call(`scrum_room_daily('SCRUMX', 'reset')`);
ok('Daily reset durch Lehrkraft', r.ok && r.daily.left === 300 && r.daily.spoke.length === 0 && r.daily.turn === null);
await als(null);
v = await call(`scrum_view('t3', null)`);
ok('Beobachter sieht die Uhr', v.daily.left === 300);

// 4 Goal-Sperre
const sig = async () => (await call(`scrum_sig('t3')`)).sig;
const s0 = await sig();
r = await call(`scrum_goal_edit('t1', true)`);
ok('Goal: P1 greift die Sperre', r.ok === true, JSON.stringify(r));
ok('Goal: Signatur ändert sich', (await sig()) !== s0);
v = await call(`scrum_view('t2', null)`);
ok('Goal: andere sehen, wer schreibt', v.goal_edit && v.goal_edit.name === 'Kind 1' && v.goal_edit.key === 'p:' + P1, JSON.stringify(v.goal_edit));
r = await call(`scrum_goal_edit('t2', true)`);
ok('Goal: P2 → goal_busy mit Name', r.error === 'goal_busy' && r.name === 'Kind 1');
const goalV = async () => (await one(`select version from scrum_items where room_id = $1 and kind = 'product' and item_id = 'goal'`, [R]))?.version || 0;
r = await call(`scrum_save('t2', $1)`, [JSON.stringify([{ op: 'put', kind: 'product', id: 'goal', v: await goalV(), data: { goal: '', images: [] } }])]);
ok('Goal: P2 speichert leeres Goal → goal_busy (nichts überschrieben)', r.error === 'goal_busy');
r = await call(`scrum_save('t1', $1)`, [JSON.stringify([{ op: 'put', kind: 'product', id: 'goal', v: await goalV(), data: { goal: '<p>Ziel</p>', images: [] } }])]);
ok('Goal: P1 (hält Sperre) speichert', r.ok === true, JSON.stringify(r));
r = await call(`scrum_save('t2', $1)`, [JSON.stringify([{ op: 'put', kind: 'story', id: 's1', v: 0, data: { id: 's1', title: 'x', status: 'todo' } }])]);
ok('Goal-Sperre bremst andere Objekte nicht', r.ok === true);
await als(T);
r = await call(`scrum_room_goal_edit('SCRUMX', true)`);
ok('Goal: Lehrkraft → goal_busy', r.error === 'goal_busy');
await als(null);
r = await call(`scrum_goal_edit('t2', false)`);
v = await call(`scrum_view('t2', null)`);
ok('Goal: fremdes Freigeben ändert nichts', v.goal_edit && v.goal_edit.name === 'Kind 1');
r = await call(`scrum_goal_edit('t1', false)`);
v = await call(`scrum_view('t2', null)`);
ok('Goal: Freigeben → niemand schreibt', v.goal_edit === null);
r = await call(`scrum_goal_edit('t2', true)`);
ok('Goal: P2 greift, bekommt aktuellen Stand mit', r.ok && r.goal && r.goal.data.goal === '<p>Ziel</p>', JSON.stringify(r));
await db.query(`update scrum_rooms set goal_editor_until = now() - interval '1 second' where room_id = $1`, [R]);
v = await call(`scrum_view('t1', null)`);
ok('Goal: abgelaufene Sperre zählt nicht', v.goal_edit === null);
await als(T);
r = await call(`scrum_room_goal_edit('SCRUMX', true)`);
ok('Goal: Lehrkraft greift nach Ablauf', r.ok === true);
v = await call(`scrum_view('t1', null)`);
ok('Goal: Name der Lehrkraft', v.goal_edit && v.goal_edit.name === 'Frau L' && v.goal_edit.key === 'owner');
r = await call(`scrum_room_save('SCRUMX', $1)`, [JSON.stringify([{ op: 'put', kind: 'product', id: 'goal', v: await goalV(), data: { goal: '<p>L</p>', images: [], goalLocked: true } }])]);
ok('Goal: Lehrkraft (hält Sperre) speichert', r.ok === true, JSON.stringify(r));
await als(null);

console.log(fails ? `\n${fails} FEHLER` : '\nalles gut');
process.exit(fails ? 1 : 0);
