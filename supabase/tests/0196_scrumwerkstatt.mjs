/* Prüfstand für Migration 0196 — Scrum Werkstatt im Raum.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0196.

   Die Kernzusagen:
     1. Wer noch nicht gewählt hat, ist „undecided" und darf nichts
        schreiben. Mitglied bekommt einen Code, Beobachter keinen.
     2. Beobachter → Mitglied geht, Mitglied → Beobachter nicht.
     3. skill_room_recover: derselbe Token über den Code, auch bei
        geschlossener Tür und nach dem Entfernen; falsche Codes nicht.
        Nur service_role darf ihn aufrufen.
     4. scrum_save: Nummern vergibt der Server, Versionen werden
        geprüft (Konflikt schreibt NICHTS), Beobachter dürfen nicht.
     5. Nur ein laufender Sprint; „abschließen + neu starten" in einem
        Aufruf geht.
     6. scrum_view mit p_have lässt bekannte Objekte ohne data.
     7. Burndown: heutiger Stand des laufenden Sprints wird geschrieben.
     8. Rollen: PO/SM je einmal; Lehrkraft sieht alle Codes, kann neu
        vergeben; fremde Lehrkraft sieht nichts.
     9. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0196_scrumwerkstatt.mjs */
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

const tool = await one(`select * from skill_tools where id = 'scrum'`);
ok('0  skill_tools: scrum mit Ordner ScrumWerkstatt, 30 Räume', tool && tool.folder === 'ScrumWerkstatt' && tool.max_rooms === 30);

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('SCRUMA', 'scrum', $1, $2, 'Team A') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 5) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok, have) => call(`scrum_view($1, $2)`, [tok, have ? JSON.stringify(have) : null]);
const save = (tok, ops) => call(`scrum_save($1, $2)`, [tok, JSON.stringify(ops)]);
const pid = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;

/* ══ 1. Wählen ═══════════════════════════════════════════════════ */
let v = await view('t1');
ok('1  scrum_view läuft, me.kind ist null', v.ok && v.me.kind === null, JSON.stringify(v).slice(0, 120));
ok('1  alle fünf stehen unter undecided', v.undecided.length === 5);
ok('1  ohne Wahl kein Schreiben',
   (await save('t1', [{ op: 'put', kind: 'product', id: 'main', v: 0, data: { name: 'X' } }])).error === 'read_only');
const e1 = await call(`scrum_enter('t1', 'member')`);
ok('1  t1 wird Mitglied und bekommt einen 8-stelligen Code', e1.ok && /^[2-9A-HJ-NP-Z]{8}$/.test(e1.key), JSON.stringify(e1));
const e2 = await call(`scrum_enter('t2', 'member')`);
const e3 = await call(`scrum_enter('t3', 'observer')`);
ok('1  t3 wird Beobachter ohne Code', e3.ok && !e3.key);
v = await view('t1');
ok('1  zwei Mitglieder, ein Beobachter, zwei unentschieden',
   v.members.length === 2 && v.observers.length === 1 && v.undecided.length === 2);
ok('1  der eigene Code steht in me.key, fremde Codes nirgends',
   v.me.key === e1.key && !JSON.stringify(v.members).includes(e2.key));
ok('1  der Beobachter sieht keinen Code', (await view('t3')).me.key === null);

/* ══ 2. Wechsel ══════════════════════════════════════════════════ */
ok('2  Mitglied → Beobachter geht nicht', (await call(`scrum_enter('t1', 'observer')`)).error === 'already_member');
const e4 = await call(`scrum_enter('t4', 'observer')`);
const e4b = await call(`scrum_enter('t4', 'member')`);
ok('2  Beobachter → Mitglied geht und bringt einen Code', e4.ok && e4b.ok && e4b.key && e4b.kind === 'member');
await call(`scrum_enter('t4', 'observer')`).then(r => ok('2  … und zurück nicht mehr', r.error === 'already_member'));

/* ══ 3. Wiedereinstieg ═══════════════════════════════════════════ */
await db.exec(`update skill_rooms set join_open = false where id = '${R}'`);
const rec = await call(`skill_room_recover($1)`, [e1.key.slice(0, 4) + '-' + e1.key.slice(4).toLowerCase()]);
ok('3  Code mit Bindestrich und klein geschrieben: derselbe Token, Tür zu egal',
   rec.ok && rec.token === 't1' && rec.room?.code === 'SCRUMA', JSON.stringify(rec).slice(0, 100));
ok('3  falscher Code: not_found', (await call(`skill_room_recover('ZZZZZZZZ')`)).error === 'not_found');
ok('3  Unsinn: key_invalid', (await call(`skill_room_recover('abc')`)).error === 'key_invalid');
await one(`select skill_room_remove('SCRUMA', $1) v`, [await pid('t2')]);
ok('3  entferntes Mitglied fehlt in der Teamliste', (await view('t1')).members.every(m => m.name !== 'Kind 2'));
const rec2 = await call(`skill_room_recover($1)`, [e2.key]);
ok('3  … und kommt mit seinem Code zurück', rec2.ok && rec2.token === 't2' && (await view('t2')).ok);
const grants = await one(`select has_function_privilege('anon', 'skill_room_recover(text)', 'execute') a,
                                 has_function_privilege('service_role', 'skill_room_recover(text)', 'execute') s`);
ok('3  skill_room_recover: anon nein, service_role ja', grants.a === false && grants.s === true);

/* ══ 4. Speichern ════════════════════════════════════════════════ */
let r = await save('t1', [
  { op: 'put', kind: 'product', id: 'main', v: 0, data: { name: 'Smart Solar', goal: '<p>Ziel</p>', images: [] } },
  { op: 'put', kind: 'story', id: 'a1', v: 0, data: { title: 'Gliederung', points: 3, status: 'todo', sprint: null } },
  { op: 'put', kind: 'story', id: 'a2', v: 0, data: { title: 'Messreihe', points: 5, status: 'todo', sprint: null } }
]);
ok('4  drei Objekte auf einmal', r.ok && r.items.length === 3, JSON.stringify(r).slice(0, 100));
const keys = r.items.filter(i => i.kind === 'story').map(i => i.data.key).join(',');
ok('4  der Server vergibt US-01, US-02', keys === 'US-01,US-02', keys);
r = await save('t2', [{ op: 'put', kind: 'story', id: 'b1', v: 0, data: { title: 'Fotos', points: 2, status: 'todo' } }]);
ok('4  ein zweites Gerät bekommt US-03', r.ok && r.items[0].data.key === 'US-03');

r = await save('t1', [{ op: 'put', kind: 'story', id: 'a1', v: 1, data: { title: 'Gliederung!', points: 3, status: 'doing', key: 'US-01' } }]);
ok('4  Änderung mit richtiger Version: v=2', r.ok && r.items[0].v === 2);
r = await save('t2', [
  { op: 'put', kind: 'story', id: 'a2', v: 1, data: { title: 'Messreihe (t2)', points: 5, status: 'doing', key: 'US-02' } },
  { op: 'put', kind: 'story', id: 'a1', v: 1, data: { title: 'veraltet', points: 3, status: 'todo', key: 'US-01' } }
]);
ok('4  veraltete Version: conflict mit Objekt', r.error === 'conflict' && r.id === 'a1', JSON.stringify(r));
const a2 = await one(`select version, data->>'title' t from scrum_items where room_id = $1 and item_id = 'a2'`, [R]);
ok('4  … und NICHTS geschrieben, auch nicht a2', a2.version === 1 && a2.t === 'Messreihe');
ok('4  Beobachter dürfen nicht', (await save('t3', [{ op: 'del', kind: 'story', id: 'b1', v: 1 }])).error === 'read_only');
ok('4  zu große Story: payload_too_big',
   (await save('t1', [{ op: 'put', kind: 'story', id: 'big', v: 0, data: { title: 'x'.repeat(30000) } }])).error === 'payload_too_big');
r = await save('t1', [{ op: 'del', kind: 'story', id: 'b1', v: 1 }]);
ok('4  löschen', r.ok && !(await one(`select 1 x from scrum_items where room_id=$1 and item_id='b1'`, [R])));
await db.exec(`update skill_participants set blocked = true where token = 't4'`);
ok('4  stillgelegt: blocked', (await save('t4', [{ op: 'put', kind: 'story', id: 'z', v: 0, data: {} }])).error === 'blocked');

/* ══ 5. Sprints ══════════════════════════════════════════════════ */
r = await save('t1', [
  { op: 'put', kind: 'sprint', id: 's1', v: 0, data: { name: '', goal: 'Los', status: 'active', start: '2026-10-01', end: '2026-10-14' } },
  { op: 'put', kind: 'story', id: 'a1', v: 2, data: { title: 'Gliederung!', points: 3, status: 'doing', key: 'US-01', sprint: 's1' } },
  { op: 'put', kind: 'story', id: 'a2', v: 1, data: { title: 'Messreihe', points: 5, status: 'done', key: 'US-02', sprint: 's1' } }
]);
ok('5  Sprint 1 startet, Name vom Server', r.ok && r.items[0].data.name === 'Sprint 1' && r.items[0].data.no === 1, JSON.stringify(r).slice(0, 140));
r = await save('t2', [{ op: 'put', kind: 'sprint', id: 's2', v: 0, data: { status: 'active' } }]);
ok('5  ein zweiter laufender Sprint: sprint_active', r.error === 'sprint_active');
r = await save('t1', [
  { op: 'put', kind: 'sprint', id: 's1', v: 1, data: { name: 'Sprint 1', status: 'closed' } },
  { op: 'put', kind: 'sprint', id: 's2', v: 0, data: { status: 'active' } }
]);
ok('5  abschließen und neuen starten in einem Aufruf', r.ok && r.items[1].data.name === 'Sprint 2');

/* ══ 6. p_have ═══════════════════════════════════════════════════ */
v = await view('t1');
const have = Object.fromEntries(v.items.map(i => [`${i.kind}:${i.id}`, i.v]));
const v2 = await view('t1', have);
ok('6  ohne p_have: alles mit data', v.items.every(i => i.data));
ok('6  mit p_have: nichts mit data', v2.items.length === v.items.length && v2.items.every(i => !i.data));
have['story:a1'] = 1;
ok('6  veraltete Version kommt wieder mit data',
   (await view('t1', have)).items.find(i => i.id === 'a1').data !== undefined);

/* ══ 7. Burndown ═════════════════════════════════════════════════ */
const bd = v.burndown.find(b => b.sprint === 's1');
ok('7  Sprint 1 hat einen Burndown-Tag: 3 offen von 8', bd && bd.open === 3 && bd.total === 8, JSON.stringify(v.burndown));
ok('7  Sprint 2 (läuft, leer) auch', v.burndown.some(b => b.sprint === 's2' && b.total === 0));

/* ══ 8. Rollen und Lehrkraft ═════════════════════════════════════ */
const p1 = await pid('t1'), p2 = await pid('t2');
await call(`scrum_member_update('t1', $1, '{"role":"po","label":"Struktur"}')`, [p1]);
r = await call(`scrum_member_update('t2', $1, '{"role":"po"}')`, [p2]);
v = await view('t1');
ok('8  PO gibt es nur einmal', r.ok && v.members.filter(m => m.role === 'po').length === 1
   && v.members.find(m => m.id === p2).role === 'po' && v.members.find(m => m.id === p1).label === 'Struktur');
ok('8  Beobachter ändern keine Karte',
   (await call(`scrum_member_update('t3', $1, '{"label":"x"}')`, [p1])).error === 'read_only');
const lk = await call(`scrum_room_get('SCRUMA', null)`);
ok('8  Lehrkraft sieht alle Codes', lk.ok && lk.members.find(m => m.id === p1).key === e1.key);
const nk = await call(`scrum_room_rekey('SCRUMA', $1)`, [p1]);
ok('8  neuer Code, der alte gilt nicht mehr',
   nk.ok && nk.key !== e1.key && (await call(`skill_room_recover($1)`, [e1.key])).error === 'not_found'
   && (await call(`skill_room_recover($1)`, [nk.key])).token === 't1');
const sigA = (await call(`scrum_sig('t1')`)).sig;
await save('t1', [{ op: 'put', kind: 'product', id: 'main', v: 1, data: { name: 'Neu' } }]);
ok('8  Signatur ändert sich beim Schreiben', (await call(`scrum_sig('t1')`)).sig !== sigA);
await als(OTHER);
ok('8  fremde Lehrkraft: not_found', (await call(`scrum_room_get('SCRUMA', null)`)).error === 'not_found'
   && (await call(`scrum_room_rekey('SCRUMA', $1)`, [p1])).error === 'not_found');
await als(T);

/* ══ 9. Zweimal ══════════════════════════════════════════════════ */
try { await db.exec(mig('0196_scrumwerkstatt.sql')); ok('9  0196 läuft ein zweites Mal', true); }
catch (e) { ok('9  0196 läuft ein zweites Mal', false, e.message); }

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
