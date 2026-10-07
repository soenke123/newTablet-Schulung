/* Prüfstand für Migration 0200 — Projektarbeit.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0200.

   Die Kernzusagen:
     1. Beim ersten pa_view: Platz in der Lobby und persönlicher Code;
        skill_room_recover bringt denselben Token zurück.
     2. Drag & Drop: Person auf Person → neue Gruppe; Person auf Gruppe →
        hinein; in die Lobby → heraus; eine Gruppe ohne Planungsraum mit
        nur noch einer Person löst sich auf.
     3. Planungsraum: erst nach pa_room_plan gibt es Inhalt und Schreiben;
        für eine Einzelperson entsteht eine Einzelarbeit.
     4. pa_save: nur die eigene Gruppe, Versionen werden geprüft.
     5. Stunden und Anträge gehören dem Urheber; ein Antrag ist offen,
        bis die Lehrkraft entscheidet, danach fest. Die rote Zahl zählt
        offene Anträge.
     6. Projektziel fixiert → Schüler können es nicht ändern.
     7. Fremde Lehrkraft sieht nichts; Migration läuft zweimal.

   Aufruf:  node supabase/tests/0200_projektarbeit.mjs */
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

const T     = 'e0000000-0000-4000-8000-000000000001';
const OTHER = 'e0000000-0000-4000-8000-000000000002';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, OTHER]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'andere', 'Andere')`, [T, OTHER, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const tool = await one(`select * from skill_tools where id = 'projekt'`);
ok('0  skill_tools: projekt mit Ordner Projektarbeit', tool && tool.folder === 'Projektarbeit');

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 6) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok, have) => call(`pa_view($1, $2)`, [tok, have ? JSON.stringify(have) : null]);
const save = (tok, ops) => call(`pa_save($1, $2)`, [tok, JSON.stringify(ops)]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 6; i++) P[i] = await pid('t' + i);

/* ══ 1. Lobby und Code ═══════════════════════════════════════════ */
let v = await view('t1');
ok('1  pa_view läuft, Person in der Lobby', v.ok && v.me.group === null && v.group === null, JSON.stringify(v).slice(0, 140));
ok('1  persönlicher Code mit 8 Zeichen', /^[2-9A-HJ-NP-Z]{8}$/.test(v.me.key || ''));
const key1 = v.me.key;
ok('1  derselbe Code beim zweiten Mal', (await view('t1')).me.key === key1);
await db.exec(`update skill_rooms set join_open = false where id = '${R}'`);
const rec = await call(`skill_room_recover($1)`, [key1]);
ok('1  Wiedereinstieg mit dem Code, auch bei geschlossener Tür', rec.ok && rec.token === 't1');
ok('1  ohne Planungsraum kein Schreiben',
   (await save('t1', [{ op: 'put', kind: 'task', id: 'a', v: 0, data: { title: 'x', col: 'todo' } }])).error === 'no_plan');
let tv = await tget();
ok('1  Lehrkraft sieht alle sechs, auch die ohne pa_view', tv.ok && tv.people.length === 6 && tv.groups.length === 0);
ok('1  Lehrkraft sieht den Code', tv.people.find(p => p.id === P[1]).key === key1);

/* ══ 2. Gruppen ziehen ═══════════════════════════════════════════ */
let a = await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]]);
ok('2  Person auf Person → neue Gruppe', a.ok && a.group);
const G1 = a.group;
tv = await tget();
ok('2  Gruppe 1 mit zwei Leuten', tv.groups.length === 1 && tv.groups[0].name === 'Gruppe 1'
   && tv.people.filter(p => p.group === G1).length === 2);
a = await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[3], G1]);
ok('2  Person auf Gruppe → hinein', a.ok && a.group === G1);
a = await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[5], P[4]]);
const G2 = a.group;
a = await call(`pa_room_assign('PRJEKT', $1)`, [P[5]]);
tv = await tget();
ok('2  zurück in die Lobby: Gruppe 2 ohne Planungsraum löst sich auf',
   a.ok && !tv.groups.some(g => g.id === G2) && tv.people.find(p => p.id === P[4]).group === null);

/* ══ 3. Planungsraum ═════════════════════════════════════════════ */
v = await view('t1');
ok('3  Schüler sieht seine Gruppe, aber noch keinen Inhalt', v.group?.id === G1 && v.group.plan_open === false && v.items.length === 0);
a = await call(`pa_room_plan('PRJEKT', $1)`, [G1]);
ok('3  Lehrkraft eröffnet den Planungsraum', a.ok && a.group === G1);
let r = await save('t1', [
  { op: 'put', kind: 'goal', id: 'main', v: 0, data: { title: 'Wetterstation', text: '<p>Ziel</p>', images: [] } },
  { op: 'put', kind: 'task', id: 'k1', v: 0, data: { title: 'Sensor kaufen', col: 'todo' } }
]);
ok('3  Schreiben im eigenen Planungsraum', r.ok && r.items.length === 2, JSON.stringify(r).slice(0, 120));
v = await view('t2');
ok('3  das zweite Mitglied sieht beides', v.items.length === 2 && v.group.members.length === 3);
const solo = await call(`pa_room_plan('PRJEKT', null, $1)`, [P[6]]);
tv = await tget();
const sg = tv.groups.find(g => g.id === solo.group);
ok('3  Einzelperson: Einzelarbeit ohne Namen', solo.ok && sg && sg.name === '' && sg.plan_open);
ok('3  t6 schreibt in seine Einzelarbeit, nicht in Gruppe 1',
   (await save('t6', [{ op: 'put', kind: 'task', id: 'k1', v: 0, data: { title: 'eigene', col: 'todo' } }])).ok);
v = await view('t1');
ok('3  … und Gruppe 1 merkt davon nichts', v.items.find(i => i.id === 'k1').data.title === 'Sensor kaufen');
a = await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[4], solo.group]);
tv = await tget();
ok('3  wer zur Einzelarbeit dazukommt, macht daraus eine Gruppe mit Nummer',
   a.ok && /^Gruppe \d+$/.test(tv.groups.find(g => g.id === solo.group).name));

/* ══ 4. Versionen ════════════════════════════════════════════════ */
r = await save('t2', [{ op: 'put', kind: 'task', id: 'k1', v: 1, data: { title: 'Sensor kaufen', col: 'doing' } }]);
ok('4  Karte verschieben (v1 → v2)', r.ok && r.items[0].v === 2);
r = await save('t3', [{ op: 'put', kind: 'task', id: 'k1', v: 1, data: { title: 'alt', col: 'done' } }]);
ok('4  veraltete Version: conflict, nichts geschrieben',
   r.error === 'conflict' && (await view('t1')).items.find(i => i.id === 'k1').data.col === 'doing');
v = await view('t1', { 'task:k1': 2 });
ok('4  p_have: bekannte Karte ohne data', v.items.find(i => i.id === 'k1').data === undefined
   && v.items.find(i => i.kind === 'goal').data);

/* ══ 5. Stunden und Anträge ══════════════════════════════════════ */
r = await save('t1', [{ op: 'put', kind: 'log', id: 'l1', v: 0, data: { date: '2026-10-07', text: 'Recherche', by: 'gefälscht' } }]);
ok('5  Stundeneintrag: Urheber setzt der Server', r.ok && r.items[0].data.by === P[1] && r.items[0].data.byName === 'Kind 1');
r = await save('t2', [{ op: 'put', kind: 'log', id: 'l1', v: 1, data: { date: '2026-10-07', text: 'überschrieben' } }]);
ok('5  fremden Stundeneintrag ändern: not_yours', r.error === 'not_yours');
r = await save('t2', [{ op: 'put', kind: 'request', id: 'q1', v: 0, data: { title: 'Mehr Zeit', text: 'Bitte', status: 'approved' } }]);
ok('5  Antrag stellen: Status ist immer offen', r.ok && r.items[0].data.status === 'open' && r.items[0].data.at);
tv = await tget();
ok('5  rote Zahl: ein offener Antrag an Gruppe 1', tv.groups.find(g => g.id === G1).open_requests === 1);
r = await call(`pa_room_save('PRJEKT', $1, $2)`, [G1, JSON.stringify([{ op: 'put', kind: 'request', id: 'q1', v: 1,
     data: Object.assign({}, r.items[0].data, { status: 'approved', decision: 'Ok bis Freitag' }) }])]);
ok('5  Lehrkraft genehmigt', r.ok && r.items[0].data.status === 'approved' && r.items[0].data.decidedAt);
tv = await tget(G1);
ok('5  … danach keine rote Zahl mehr, Inhalt in der Gruppenansicht',
   tv.groups.find(g => g.id === G1).open_requests === 0 && tv.items.length === 4 && tv.group.members[0].key);
r = await save('t2', [{ op: 'put', kind: 'request', id: 'q1', v: 2, data: { title: 'Mehr Zeit', status: 'open' } }]);
ok('5  entschiedener Antrag ist fest', r.error === 'decided');

/* ══ 6. Projektziel fixieren ═════════════════════════════════════ */
const goal = (await view('t1')).items.find(i => i.kind === 'goal');
r = await save('t1', [{ op: 'put', kind: 'goal', id: 'main', v: goal.v, data: Object.assign({}, goal.data, { locked: true }) }]);
ok('6  Schüler kann das Ziel nicht selbst fixieren', r.ok && r.items[0].data.locked === false);
r = await call(`pa_room_save('PRJEKT', $1, $2)`, [G1, JSON.stringify([{ op: 'put', kind: 'goal', id: 'main', v: r.items[0].v,
     data: Object.assign({}, goal.data, { locked: true }) }])]);
ok('6  Lehrkraft fixiert', r.ok && r.items[0].data.locked === true);
r = await save('t1', [{ op: 'put', kind: 'goal', id: 'main', v: r.items[0].v, data: { title: 'Neu' } }]);
ok('6  fixiertes Ziel: goal_locked', r.error === 'goal_locked');

/* ══ 7. Rechte, Label, Regeln, Wiederholung ══════════════════════ */
ok('7  Label im eigenen Team', (await call(`pa_member_update('t1', $1, 'Technik')`, [P[2]])).ok);
ok('7  Label in fremder Gruppe: not_found', (await call(`pa_member_update('t1', $1, 'x')`, [P[6]])).error === 'not_found');
ok('7  Regeln speichern', (await call(`pa_room_rules('PRJEKT', 'Handy bleibt in der Tasche.')`)).ok
   && (await view('t3')).room.rules === 'Handy bleibt in der Tasche.');
const rk = await call(`pa_room_rekey('PRJEKT', $1)`, [P[1]]);
ok('7  neuer Code: alter gilt nicht mehr', rk.ok && rk.key !== key1
   && (await call(`skill_room_recover($1)`, [key1])).error === 'not_found');
await als(OTHER);
ok('7  fremde Lehrkraft: not_found', (await tget()).error === 'not_found'
   && (await call(`pa_room_assign('PRJEKT', $1)`, [P[1]])).error === 'not_found');
await als(T);
ok('7  Gruppe auflösen: alle in die Lobby, Inhalt weg',
   (await call(`pa_room_group_delete('PRJEKT', $1)`, [G1])).ok
   && (await view('t1')).group === null
   && (await one(`select count(*)::int n from pa_items where group_id = $1`, [G1])).n === 0);
try { await db.exec(mig('0200_projektarbeit.sql')); ok('7  Migration läuft zweimal', true); }
catch (e) { ok('7  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
