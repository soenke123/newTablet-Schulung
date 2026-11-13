/* Prüfstand für Migration 0288 — Projektarbeit: Schreibsperre am
   Projektziel (wie Scrum 0281). Echt gerechnet in pglite auf der ganzen
   Kette.

   Die Kernzusagen:
     1. Wer die Sperre greift, bekommt den aktuellen Stand des Ziels;
        die anderen der Gruppe sehen group.goal_edit = { name, mine:false }.
     2. Andere bekommen beim Greifen und beim Speichern goal_busy —
        auch die Lehrkraft. Andere Objekte (To-dos) speichern weiter.
     3. Freigeben geht nur mit der eigenen Sperre; nach Ablauf ist sie frei.
     4. Signatur ändert sich beim Greifen und Freigeben.
     5. Fixiertes Ziel: Schüler greifen nicht (goal_locked); stillgelegt
        → blocked; andere Gruppe sieht nichts.
     6. Zwei Lehrkräfte (0205) haben getrennte Sperren.

   Aufruf:  node supabase/tests/0288_projektarbeit_goal_sperre.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;  -- 0223: Admins nur mit 2FA
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
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8')); }
  catch (e) { if (BEKANNT.has(f.slice(0, 4))) continue; console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const OWNER = 'e0000000-0000-4000-8000-000000000001';
const CO    = 'e0000000-0000-4000-8000-000000000002';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [OWNER, CO]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values
  ($1, $3, 'besitzer', 'Frau Besitzer', 'approved'),
  ($2, $3, 'kollege',  'Herr Kollege',  'approved')`, [OWNER, CO, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [OWNER, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 5) g`);
const P = {};
for (let i = 1; i <= 5; i++) P[i] = (await one(`select id from skill_participants where token = $1`, ['t' + i])).id;
for (let i = 1; i <= 5; i++) await call(`pa_view($1, null)`, ['t' + i]);

await als(OWNER);
ok('0  zweite Lehrkraft einladen', (await call(`pa_room_teacher_add('PRJEKT', $1)`, [CO])).ok);
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_assign('PRJEKT', $1, $2, null)`, [P[3], G1]);
const G2 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[5], P[4]])).group;
ok('0  Planungsräume öffnen', (await call(`pa_room_plan('PRJEKT', $1)`, [G1])).ok && (await call(`pa_room_plan('PRJEKT', $1)`, [G2])).ok);
await als(null);

const goalV = async (g) => (await one(`select version from pa_items where group_id = $1 and kind = 'goal' and item_id = 'main'`, [g]))?.version || 0;
const putGoal = async (tok, data) => call(`pa_save($1, $2)`, [tok, JSON.stringify([{ op: 'put', kind: 'goal', id: 'main', v: await goalV(G1), data }])]);
const sig = async (tok) => (await call(`pa_sig($1)`, [tok])).sig;

// Ausgangsstand: Ziel ohne Sperre speichern geht
let r = await putGoal('t1', { title: 'Wetter', text: '<p>A</p>', due: '', images: [] });
ok('1  ohne Sperre speichern (niemand hält sie) → ok', r.ok === true, JSON.stringify(r));

const s0 = await sig('t3');
r = await call(`pa_goal_edit('t1', true)`);
ok('1  Kind 1 greift die Sperre, bekommt den Stand', r.ok && r.goal && r.goal.data.title === 'Wetter' && r.goal.v === 1, JSON.stringify(r));
ok('4  Signatur ändert sich beim Greifen', (await sig('t3')) !== s0);
let v = await call(`pa_view('t2', null)`);
ok('1  Kind 2 sieht: Kind 1 schreibt', v.group.goal_edit && v.group.goal_edit.name === 'Kind 1' && v.group.goal_edit.mine === false, JSON.stringify(v.group.goal_edit));
v = await call(`pa_view('t1', null)`);
ok('1  Kind 1 sieht: mine', v.group.goal_edit && v.group.goal_edit.mine === true);
v = await call(`pa_view('t4', null)`);
ok('5  andere Gruppe: keine Sperre', v.group.goal_edit === null);
await als(OWNER);
v = await call(`pa_room_get('PRJEKT', $1, null)`, [G1]);
ok('1  Lehrkraft sieht: Kind 1 schreibt', v.group.goal_edit && v.group.goal_edit.name === 'Kind 1' && !v.group.goal_edit.mine);
await als(null);

r = await call(`pa_goal_edit('t2', true)`);
ok('2  Kind 2 greift → goal_busy mit Name', r.error === 'goal_busy' && r.name === 'Kind 1', JSON.stringify(r));
r = await putGoal('t2', { title: '', text: '', due: '', images: [] });
ok('2  Kind 2 speichert leeres Ziel → goal_busy (nichts überschrieben)', r.error === 'goal_busy');
ok('2  Ziel steht noch', (await one(`select data->>'title' t from pa_items where group_id = $1 and kind = 'goal'`, [G1])).t === 'Wetter');
r = await call(`pa_save('t2', $1)`, [JSON.stringify([{ op: 'put', kind: 'task', id: 't1', v: 0, data: { title: 'Messen', col: 'todo' } }])]);
ok('2  Kind 2 speichert ein To-do → ok', r.ok === true, JSON.stringify(r));
await als(OWNER);
r = await call(`pa_room_save('PRJEKT', $1, $2)`, [G1, JSON.stringify([{ op: 'put', kind: 'goal', id: 'main', v: await goalV(G1), data: { title: 'Wetter', text: '', locked: true } }])]);
ok('2  Lehrkraft speichert Ziel → goal_busy', r.error === 'goal_busy');
r = await call(`pa_room_goal_edit('PRJEKT', $1, true)`, [G1]);
ok('2  Lehrkraft greift → goal_busy', r.error === 'goal_busy' && r.name === 'Kind 1');
await als(null);

r = await putGoal('t1', { title: 'Wetterstation', text: '<p>B</p>', due: '', images: [] });
ok('2  Kind 1 (hält Sperre) speichert', r.ok === true);
r = await call(`pa_goal_edit('t1', true)`);
ok('2  Kind 1 verlängert', r.ok === true);

r = await call(`pa_goal_edit('t2', false)`);
ok('3  Kind 2 gibt frei → ok, aber Sperre bleibt bei Kind 1', r.ok && (await call(`pa_view('t3', null)`)).group.goal_edit?.name === 'Kind 1');
const s1 = await sig('t3');
r = await call(`pa_goal_edit('t1', false)`);
ok('3  Kind 1 gibt frei', r.ok && (await call(`pa_view('t3', null)`)).group.goal_edit === null);
ok('4  Signatur ändert sich beim Freigeben', (await sig('t3')) !== s1);

r = await call(`pa_goal_edit('t2', true)`);
ok('3  jetzt greift Kind 2', r.ok === true && r.goal.data.title === 'Wetterstation');
await db.query(`update pa_groups set goal_editor_until = now() - interval '1 second' where id = $1`, [G1]);
ok('3  abgelaufen: niemand mehr in der Ansicht', (await call(`pa_view('t1', null)`)).group.goal_edit === null);
r = await call(`pa_goal_edit('t1', true)`);
ok('3  abgelaufen: Kind 1 kann greifen', r.ok === true);
await call(`pa_goal_edit('t1', false)`);

// Lehrkräfte
await als(OWNER);
r = await call(`pa_room_goal_edit('PRJEKT', $1, true)`, [G1]);
ok('6  Besitzerin greift', r.ok === true);
v = await call(`pa_room_get('PRJEKT', $1, null)`, [G1]);
ok('6  Besitzerin sieht: mine', v.group.goal_edit && v.group.goal_edit.mine === true && v.group.goal_edit.name === 'Frau Besitzer');
r = await call(`pa_room_save('PRJEKT', $1, $2)`, [G1, JSON.stringify([{ op: 'put', kind: 'goal', id: 'main', v: await goalV(G1), data: { title: 'Wetterstation', text: '<p>B</p>', locked: true } }])]);
ok('6  Besitzerin (hält Sperre) fixiert', r.ok === true, JSON.stringify(r));
await als(CO);
v = await call(`pa_room_get('PRJEKT', $1, null)`, [G1]);
ok('6  Kollege sieht: Frau Besitzer schreibt (nicht mine)', v.group.goal_edit && v.group.goal_edit.mine === false && v.group.goal_edit.name === 'Frau Besitzer');
r = await call(`pa_room_goal_edit('PRJEKT', $1, true)`, [G1]);
ok('6  Kollege greift → goal_busy', r.error === 'goal_busy');
await als(null);
r = await call(`pa_view('t1', null)`);
ok('1  Schüler sehen Lehrkraft-Sperre', r.group.goal_edit?.name === 'Frau Besitzer');
await als(OWNER);
await call(`pa_room_goal_edit('PRJEKT', $1, false)`, [G1]);
await als(null);

r = await call(`pa_goal_edit('t1', true)`);
ok('5  fixiertes Ziel: Schüler → goal_locked', r.error === 'goal_locked', JSON.stringify(r));
await db.query(`update skill_participants set blocked = true where token = 't4'`);
r = await call(`pa_goal_edit('t4', true)`);
ok('5  stillgelegt → blocked', r.error === 'blocked');
r = await call(`pa_goal_edit('t4', false)`);
ok('5  stillgelegt: freigeben geht', r.ok === true);
r = await call(`pa_goal_edit('nix', true)`);
ok('5  fremder Token → unknown_token', r.error === 'unknown_token');
await als(CO);
r = await call(`pa_room_goal_edit('PRJEKT', $1, true)`, ['e0000000-0000-4000-8000-0000000000ff']);
ok('5  Lehrkraft, fremde Gruppe → not_found', r.error === 'not_found');
await als(null);
r = await call(`pa_room_goal_edit('PRJEKT', $1, true)`, [G1]);
ok('5  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');

console.log(fails ? `\n${fails} FEHLER` : '\nalles gut');
process.exit(fails ? 1 : 0);
