/* Prüfstand für Migration 0201 — Projektarbeit: Lernen am anderen Ort.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0201.

   Die Kernzusagen:
     1. Ein Antrag braucht Datum (nicht in der Vergangenheit), Ort und
        mindestens eine Person aus der eigenen Gruppe; Fremde fallen raus.
     2. Jedes Mitglied der Gruppe darf einen offenen Antrag ändern; der
        Urheber bleibt, sentAt/sentByName zeigen, wer zuletzt geschickt hat.
     3. Abgelehnt → überarbeiten und neu abschicken: wieder offen, die
        Ablehnung steht als prevDecision daneben. Abgelehnt → löschen geht.
     4. Genehmigt → fest: weder ändern noch löschen.
     5. Einwilligung: nur die Lehrkraft, 0…2, sichtbar in Team und Übersicht.
     6. pa_room_get liefert die Anträge für heute je Gruppe.
     7. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0201_projektarbeit_ausserhaus.mjs */
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
const view = (tok) => call(`pa_view($1, null)`, [tok]);
const save = (tok, ops) => call(`pa_save($1, $2)`, [tok, JSON.stringify(ops)]);
const tsave = (g, ops) => call(`pa_room_save('PRJEKT', $1, $2)`, [g, JSON.stringify(ops)]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 6; i++) P[i] = await pid('t' + i);
const TODAY = (await one(`select ((now() at time zone 'Europe/Berlin')::date)::text d`)).d;
const YESTERDAY = (await one(`select ((now() at time zone 'Europe/Berlin')::date - 1)::text d`)).d;

// Gruppe 1: Kind 1, 2, 3 — Planungsraum offen. Kind 4 + 5: Gruppe 2.
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_assign('PRJEKT', $1, $2)`, [P[3], G1]);
await call(`pa_room_plan('PRJEKT', $1)`, [G1]);
const G2 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[5], P[4]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G2]);

/* ══ 1. Pflichtfelder ════════════════════════════════════════════ */
const req = (extra) => Object.assign({ date: TODAY, place: 'Stadtbibliothek', who: [P[1], P[2]], activity: 'Recherche' }, extra);
let r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ date: '' }) }]);
ok('1  ohne Datum: date_missing', r.error === 'date_missing');
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ date: '2099-02-31' }) }]);
ok('1  Datum, das es nicht gibt: date_missing', r.error === 'date_missing', JSON.stringify(r));
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ date: YESTERDAY }) }]);
ok('1  Datum in der Vergangenheit: date_past', r.error === 'date_past');
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ place: '  ' }) }]);
ok('1  ohne Ort: place_missing', r.error === 'place_missing');
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ who: [P[4]] }) }]);
ok('1  nur Leute aus einer anderen Gruppe: who_missing', r.error === 'who_missing');
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req({ who: [P[1], P[4], P[1]] }) }]);
const a1 = r.items && r.items[0];
ok('1  Antrag für heute gestellt, Fremde und Doppelte fallen raus',
   r.ok && a1.data.status === 'open' && JSON.stringify(a1.data.who) === JSON.stringify([P[1]])
   && a1.data.at && a1.data.sentAt && a1.data.by === P[1], JSON.stringify(r).slice(0, 200));

/* ══ 2. Die Gruppe ändert ════════════════════════════════════════ */
r = await save('t2', [{ op: 'put', kind: 'request', id: 'a', v: 1, data: req({ who: [P[1], P[2]], place: 'Zuhause bei Kind 2' }) }]);
ok('2  ein anderes Mitglied ändert den offenen Antrag', r.ok && r.items[0].data.place === 'Zuhause bei Kind 2'
   && r.items[0].data.who.length === 2);
ok('2  Urheber bleibt, zuletzt geschickt von Kind 2', r.items[0].data.by === P[1] && r.items[0].data.sentByName === 'Kind 2'
   && r.items[0].data.at === a1.data.at);
r = await save('t4', [{ op: 'put', kind: 'request', id: 'a', v: 2, data: req({ who: [P[4]] }) }]);
ok('2  Gruppe 2 schreibt nur in ihren eigenen Planungsraum (eigene Version 0 ≠ 2)', r.error === 'conflict');

/* ══ 3. Abgelehnt → überarbeiten ═════════════════════════════════ */
let cur = (await view('t1')).items.find(i => i.kind === 'request' && i.id === 'a');
r = await tsave(G1, [{ op: 'put', kind: 'request', id: 'a', v: cur.v,
     data: Object.assign({}, cur.data, { status: 'rejected', decision: 'Bitte genauer: wann zurück?' }) }]);
ok('3  Lehrkraft lehnt ab', r.ok && r.items[0].data.status === 'rejected' && r.items[0].data.decidedAt);
r = await save('t3', [{ op: 'put', kind: 'request', id: 'a', v: r.items[0].v,
     data: Object.assign({}, r.items[0].data, { activity: 'Recherche, zurück um 11:30', status: 'approved' }) }]);
ok('3  überarbeitet und neu geschickt: wieder offen, Ablehnung als prevDecision',
   r.ok && r.items[0].data.status === 'open' && r.items[0].data.prevDecision === 'Bitte genauer: wann zurück?'
   && !('decision' in r.items[0].data) && !('decidedAt' in r.items[0].data), JSON.stringify(r).slice(0, 300));
r = await save('t3', [{ op: 'put', kind: 'request', id: 'a', v: r.items[0].v, data: r.items[0].data }]);
ok('3  noch einmal geändert: prevDecision bleibt', r.ok && r.items[0].data.prevDecision === 'Bitte genauer: wann zurück?');
let tv = await tget();
ok('3  rote Zahl zählt den neu geschickten Antrag', tv.groups.find(g => g.id === G1).open_requests === 1);

r = await save('t1', [{ op: 'put', kind: 'request', id: 'b', v: 0, data: req({ date: '2099-03-01' }) }]);
r = await tsave(G1, [{ op: 'put', kind: 'request', id: 'b', v: 1, data: Object.assign({}, r.items[0].data, { status: 'rejected' }) }]);
r = await save('t2', [{ op: 'del', kind: 'request', id: 'b', v: 2 }]);
ok('3  abgelehnter Antrag lässt sich löschen', r.ok);

/* ══ 4. Genehmigt → fest ═════════════════════════════════════════ */
cur = (await view('t1')).items.find(i => i.kind === 'request' && i.id === 'a');
r = await tsave(G1, [{ op: 'put', kind: 'request', id: 'a', v: cur.v,
     data: Object.assign({}, cur.data, { status: 'approved', decision: 'Viel Erfolg!' }) }]);
ok('4  Lehrkraft genehmigt', r.ok && r.items[0].data.status === 'approved');
const vA = r.items[0].v;
ok('4  genehmigt: ändern geht nicht',
   (await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: vA, data: req() }])).error === 'decided');
ok('4  genehmigt: löschen geht nicht',
   (await save('t2', [{ op: 'del', kind: 'request', id: 'a', v: vA }])).error === 'decided');
ok('4  Stundeneinträge gehören weiter dem Urheber',
   (await save('t1', [{ op: 'put', kind: 'log', id: 'l1', v: 0, data: { date: TODAY, text: 'x' } }])).ok
   && (await save('t2', [{ op: 'put', kind: 'log', id: 'l1', v: 1, data: { date: TODAY, text: 'y' } }])).error === 'not_yours');

/* ══ 5. Einwilligung ═════════════════════════════════════════════ */
ok('5  Stufe 2 für Kind 1', (await call(`pa_room_consent('PRJEKT', $1, 2)`, [P[1]])).ok);
ok('5  Stufe 1 für Kind 6 (noch nie geöffnet)', (await call(`pa_room_consent('PRJEKT', $1, 1)`, [P[6]])).ok);
ok('5  Stufe 3 gibt es nicht', (await call(`pa_room_consent('PRJEKT', $1, 3)`, [P[1]])).error === 'invalid_input');
let v = await view('t2');
ok('5  die Gruppe sieht die Stufen ihrer Mitglieder',
   v.group.members.find(m => m.id === P[1]).consent === 2 && v.group.members.find(m => m.id === P[2]).consent === 0);
await als(null);
ok('5  ohne Anmeldung: not_authenticated', (await call(`pa_room_consent('PRJEKT', $1, 2)`, [P[2]])).error === 'not_authenticated');
await als(OTHER);
ok('5  fremde Lehrkraft: not_found', (await call(`pa_room_consent('PRJEKT', $1, 2)`, [P[2]])).error === 'not_found');
await als(T);

/* ══ 6. Heute ════════════════════════════════════════════════════ */
r = await save('t4', [{ op: 'put', kind: 'request', id: 'z', v: 0, data: { date: TODAY, place: 'Park', who: [P[4], P[5]], activity: 'Fotos' } }]);
tv = await tget();
const g1 = tv.groups.find(g => g.id === G1), g2 = tv.groups.find(g => g.id === G2);
ok('6  Gruppe 1: ein genehmigter Antrag für heute mit Kind 1 + 2',
   g1.today_requests.length === 1 && g1.today_requests[0].status === 'approved' && g1.today_requests[0].who.length === 2);
ok('6  Gruppe 2: ein offener Antrag für heute', g2.today_requests.length === 1 && g2.today_requests[0].status === 'open'
   && g2.today_requests[0].place === 'Park');
ok('6  Einwilligung in der Übersicht', tv.people.find(p => p.id === P[1]).consent === 2
   && tv.people.find(p => p.id === P[6]).consent === 1 && tv.people.find(p => p.id === P[3]).consent === 0);
ok('6  Datum von heute in der Übersicht', tv.today === TODAY);

/* ══ 7. Wiederholung ═════════════════════════════════════════════ */
try { await db.exec(mig('0201_projektarbeit_ausserhaus.sql')); ok('7  Migration läuft zweimal', true); }
catch (e) { ok('7  Migration läuft zweimal', false, e.message); }
ok('7  Einwilligung überlebt die Wiederholung', (await tget()).people.find(p => p.id === P[1]).consent === 2);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
