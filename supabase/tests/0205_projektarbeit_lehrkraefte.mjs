/* Prüfstand für Migration 0205 — Projektarbeit: weitere Lehrkräfte
   einladen, Reiter „Lehrkraft-Kommentare". Echt gerechnet in pglite auf
   der ganzen Kette 0001…0205.

   Die Kernzusagen:
     1. Einladen: nur freigeschaltete Lehrkräfte derselben Schule; die
        Suche findet sie, wer schon drin ist, steht nicht in der Liste.
     2. Eingeladene Lehrkraft = gleiche Rechte wie der Besitzer
        (pa_room_*, skill_room_get/sig/set_open/update/…, Raumliste,
        Mail-Empfänger) — nur löschen darf den Raum allein der Besitzer.
     3. Austragen: den Besitzer nie; sich selbst ja. Danach kein Zugriff.
     4. Kommentare: Lehrkraft schreibt (mit Namen), Schüler der Gruppe
        sehen, haken ab und fragen nach; andere Gruppen nicht.
     5. Löschen: Lehrkraft jeden Zettel und jede Nachfrage, Schüler nur
        die eigene Nachfrage und keinen Zettel.

   Aufruf:  node supabase/tests/0205_projektarbeit_lehrkraefte.mjs */
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

const OWNER = 'e0000000-0000-4000-8000-000000000001';
const CO    = 'e0000000-0000-4000-8000-000000000002';   // wird eingeladen
const NOT   = 'e0000000-0000-4000-8000-000000000003';   // keine Lehrkraft
const FAR   = 'e0000000-0000-4000-8000-000000000004';   // Lehrkraft, andere Schule
const THIRD = 'e0000000-0000-4000-8000-000000000005';   // dritte Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
const SCHOOL2 = (await one(`insert into schools (slug, name) values ('andere', 'Andere Schule') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)`, [OWNER, CO, NOT, FAR, THIRD]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values
  ($1, $6, 'besitzer', 'Frau Besitzer', 'approved'),
  ($2, $6, 'kollege',  'Herr Kollege',  'approved'),
  ($3, $6, 'schueler', 'Kollo Schüler', 'none'),
  ($4, $7, 'fern',     'Herr Kollfern', 'approved'),
  ($5, $6, 'dritte',   'Frau Dritte',   'approved')`, [OWNER, CO, NOT, FAR, THIRD, SCHOOL, SCHOOL2]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [OWNER, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 4) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok) => call(`pa_view($1, null)`, [tok]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 4; i++) P[i] = await pid('t' + i);

/* ══ 1. Einladen ════════════════════════════════════════════════ */
await als(CO);
ok('1  vorher: Kollege sieht den Raum nicht', (await tget()).error === 'not_found');
ok('1  vorher: auch nicht über skill_room_get', (await call(`skill_room_get('PRJEKT')`)).error === 'not_found');

await als(OWNER);
let r = await call(`pa_room_teacher_search('PRJEKT', 'koll')`);
const found = (r.teachers || []).map(t => t.id);
ok('1  Suche findet die Lehrkraft der Schule', found.includes(CO), JSON.stringify(r));
ok('1  … nicht den Schüler-Account', !found.includes(NOT));
ok('1  … nicht die Lehrkraft der anderen Schule', !found.includes(FAR));
ok('1  Suche mit 1 Zeichen: leer', (await call(`pa_room_teacher_search('PRJEKT', 'k')`)).teachers.length === 0);
ok('1  „%" sucht nicht alles', (await call(`pa_room_teacher_search('PRJEKT', '%%')`)).teachers.length === 0);
ok('1  Schüler-Account einladen: not_a_teacher',
   (await call(`pa_room_teacher_add('PRJEKT', $1)`, [NOT])).error === 'not_a_teacher');
ok('1  andere Schule einladen: not_a_teacher',
   (await call(`pa_room_teacher_add('PRJEKT', $1)`, [FAR])).error === 'not_a_teacher');
r = await call(`pa_room_teacher_add('PRJEKT', $1)`, [CO]);
ok('1  Kollegen einladen', r.ok, JSON.stringify(r));
ok('1  zweimal einladen: already', (await call(`pa_room_teacher_add('PRJEKT', $1)`, [CO])).already === true);
ok('1  wer drin ist, steht nicht mehr in der Suche',
   !(await call(`pa_room_teacher_search('PRJEKT', 'koll')`)).teachers.some(t => t.id === CO));
r = await call(`pa_room_teachers_get('PRJEKT')`);
ok('1  Lehrkräfte-Liste: Besitzer zuerst, dann Kollege',
   r.ok && r.is_owner === true && r.teachers.length === 2 && r.teachers[0].owner && r.teachers[1].id === CO,
   JSON.stringify(r));
await als(NOT);
ok('1  Fremder: kein Zugriff auf die Liste', (await call(`pa_room_teachers_get('PRJEKT')`)).error === 'not_found');
ok('1  Fremder: kann niemanden einladen', (await call(`pa_room_teacher_add('PRJEKT', $1)`, [THIRD])).error === 'not_found');

/* ══ 2. Gleiche Rechte ══════════════════════════════════════════ */
await als(CO);
r = await call(`pa_room_teachers_get('PRJEKT')`);
ok('2  Kollege: is_owner false, me markiert', r.ok && r.is_owner === false && r.teachers.find(t => t.me).id === CO);
ok('2  pa_room_get', (await tget()).ok);
ok('2  pa_room_sig', (await call(`pa_room_sig('PRJEKT')`)).ok);
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
ok('2  Gruppe bilden', !!G1);
ok('2  Planungsraum öffnen', (await call(`pa_room_plan('PRJEKT', $1)`, [G1])).ok);
r = await call(`pa_room_save('PRJEKT', $1, $2)`, [G1, JSON.stringify([{ op: 'put', kind: 'task', id: 't1', v: 0, data: { title: 'A', col: 'todo' } }])]);
ok('2  im Planungsraum schreiben', r.ok, JSON.stringify(r));
ok('2  Einwilligung eintragen', (await call(`pa_room_consent('PRJEKT', $1, 2)`, [P[1]])).ok);
ok('2  Regeln ergänzen', (await call(`pa_room_rules('PRJEKT', 'Abgabe Freitag')`)).ok);
ok('2  skill_room_get', (await call(`skill_room_get('PRJEKT')`)).ok);
ok('2  skill_room_get: is_owner false', (await call(`skill_room_get('PRJEKT')`)).is_owner === false);
ok('2  skill_room_sig', (await call(`skill_room_sig('PRJEKT')`)).ok);
ok('2  Beitritt schließen', (await call(`skill_room_set_open('PRJEKT', false)`)).ok);
ok('2  verlängern', (await call(`skill_room_extend('PRJEKT')`)).ok);
ok('2  Titel ändern', (await call(`skill_room_update('PRJEKT', 'Klasse 8b neu')`)).ok);
ok('2  Kind stilllegen', (await call(`skill_room_set_blocked('PRJEKT', $1, true)`, [P[4]])).ok);
ok('2  Kind entfernen', (await call(`skill_room_remove('PRJEKT', $1)`, [P[4]])).ok);
r = await call(`skill_rooms_list()`);
const row = (r.rooms || []).find(x => x.code === 'PRJEKT');
ok('2  Raumliste: Raum steht drin, als eingeladen markiert',
   row && row.co_teacher === true && row.owner_name === 'Frau Besitzer', JSON.stringify(row));
ok('2  Raumliste: zählt nicht zur eigenen Obergrenze', r.tools.projekt.live === 0);
ok('2  selbst weitere Lehrkraft einladen', (await call(`pa_room_teacher_add('PRJEKT', $1)`, [THIRD])).ok);
ok('2  Raum löschen: nur der Besitzer', (await call(`skill_room_delete('PRJEKT')`)).ok !== true);
ok('2  … Raum ist noch da', !!(await one(`select 1 x from skill_rooms where id = $1`, [R])));
const mails = (await db.query(`select * from pa_room_teachers($1) t(uid)`, [R])).rows.map(x => x.uid);
ok('2  Mail-Empfänger: alle drei Lehrkräfte', [OWNER, CO, THIRD].every(u => mails.includes(u)), JSON.stringify(mails));
await als(OWNER);
r = await call(`skill_rooms_list()`);
ok('2  Besitzer: Raum ohne co_teacher', !(r.rooms.find(x => x.code === 'PRJEKT') || {}).co_teacher);

/* ══ 3. Austragen ═══════════════════════════════════════════════ */
await als(CO);
ok('3  Besitzer austragen: is_owner', (await call(`pa_room_teacher_remove('PRJEKT', $1)`, [OWNER])).error === 'is_owner');
ok('3  Kollege trägt die Dritte aus', (await call(`pa_room_teacher_remove('PRJEKT', $1)`, [THIRD])).ok);
r = await call(`pa_room_teacher_remove('PRJEKT')`);
ok('3  Kollege verlässt den Raum selbst', r.ok && r.self === true, JSON.stringify(r));
ok('3  danach: pa_room_get not_found', (await tget()).error === 'not_found');
ok('3  danach: skill_room_get not_found', (await call(`skill_room_get('PRJEKT')`)).error === 'not_found');
ok('3  danach: nicht mehr in der Raumliste', !(await call(`skill_rooms_list()`)).rooms.some(x => x.code === 'PRJEKT'));

/* ══ 4. Kommentare ══════════════════════════════════════════════ */
await als(OWNER);
await call(`pa_room_teacher_add('PRJEKT', $1)`, [CO]);
const G2 = (await call(`pa_room_plan('PRJEKT', null, $1)`, [P[3]])).group;   // Einzelarbeit Kind 3
await als(CO);
r = await call(`pa_room_note_add('PRJEKT', $1, '  Bitte das Ziel genauer fassen. ', 'blue')`, [G1]);
ok('4  Kollege schreibt einen Kommentar', r.ok && r.id, JSON.stringify(r));
const N1 = r.id;
ok('4  leerer Kommentar: invalid_input', (await call(`pa_room_note_add('PRJEKT', $1, '   ')`, [G1])).error === 'invalid_input');
ok('4  zu lang: too_long', (await call(`pa_room_note_add('PRJEKT', $1, $2)`, [G1, 'x'.repeat(1501)])).error === 'too_long');
await als(OWNER);
const N2 = (await call(`pa_room_note_add('PRJEKT', $1, 'Denkt an den Antrag.', 'quatsch')`, [G1])).id;
let v = await view('t1');
let notes = v.group.notes;
ok('4  Schüler sieht beide Zettel, neuester zuerst', notes.length === 2 && notes[0].id === N2, JSON.stringify(notes));
const n1 = notes.find(n => n.id === N1);
ok('4  mit Namen der Lehrkraft, Text getrimmt, Farbe', n1.authorName === 'Herr Kollege' && n1.text === 'Bitte das Ziel genauer fassen.' && n1.color === 'blue');
ok('4  unbekannte Farbe → gelb', notes[0].color === 'yellow');
ok('4  andere Gruppe sieht nichts', (await view('t3')).group.notes.length === 0);
ok('4  Lehrkraft sieht sie in pa_room_get', (await tget(G1)).group.notes.length === 2);

r = await call(`pa_note_done('t2', $1, true)`, [N1]);
ok('4  Schüler hakt ab', r.ok, JSON.stringify(r));
n1.done = (await view('t1')).group.notes.find(n => n.id === N1);
ok('4  abgehakt, mit Namen', n1.done.done === true && n1.done.doneBy === 'Kind 2');
ok('4  wieder aufmachen', (await call(`pa_note_done('t2', $1, false)`, [N1])).ok
   && (await view('t1')).group.notes.find(n => n.id === N1).done === false);
ok('4  andere Gruppe kann nicht abhaken', (await call(`pa_note_done('t3', $1, true)`, [N1])).error === 'not_found');

r = await call(`pa_note_reply('t1', $1, '  Was meinen Sie mit genauer? ')`, [N1]);
ok('4  Schüler fragt nach', r.ok, JSON.stringify(r));
ok('4  Nachfrage: Schimpfwort abgelehnt', (await call(`pa_note_reply('t1', $1, 'Arschloch')`, [N1])).error === 'text_blocked');
ok('4  Nachfrage: leer abgelehnt', (await call(`pa_note_reply('t1', $1, ' ')`, [N1])).error === 'invalid_input');
ok('4  Nachfrage: andere Gruppe nicht', (await call(`pa_note_reply('t3', $1, 'Hallo')`, [N1])).error === 'not_found');
await als(CO);
ok('4  Lehrkraft antwortet', (await call(`pa_room_note_reply('PRJEKT', $1, 'Woran erkennt ihr den Erfolg?')`, [N1])).ok);
let reps = (await view('t1')).group.notes.find(n => n.id === N1).replies;
ok('4  Verlauf: Nachfrage, dann Antwort', reps.length === 2 && reps[0].name === 'Kind 1' && !reps[0].teacher
   && reps[0].text === 'Was meinen Sie mit genauer?' && reps[1].teacher && reps[1].name === 'Herr Kollege', JSON.stringify(reps));

await db.query(`update skill_participants set blocked = true where token = 't2'`);
ok('4  stillgelegt: kein Abhaken', (await call(`pa_note_done('t2', $1, true)`, [N1])).error === 'blocked');
await db.query(`update skill_participants set blocked = false where token = 't2'`);

/* ══ 5. Löschen ═════════════════════════════════════════════════ */
ok('5  fremde Nachfrage löschen: not_yours',
   (await call(`pa_note_reply_delete('t2', $1, $2)`, [N1, reps[0].id])).error === 'not_yours');
ok('5  Antwort der Lehrkraft löschen (Schüler): not_yours',
   (await call(`pa_note_reply_delete('t1', $1, $2)`, [N1, reps[1].id])).error === 'not_yours');
ok('5  eigene Nachfrage löschen', (await call(`pa_note_reply_delete('t1', $1, $2)`, [N1, reps[0].id])).ok);
ok('5  Lehrkraft löscht die Antwort', (await call(`pa_room_note_reply_delete('PRJEKT', $1, $2)`, [N1, reps[1].id])).ok);
ok('5  Verlauf leer', (await view('t1')).group.notes.find(n => n.id === N1).replies.length === 0);
ok('5  Schüler kann Zettel nicht löschen (keine Funktion dafür)',
   !(await one(`select 1 x from pg_proc where proname = 'pa_note_delete'`)));
await als(NOT);
ok('5  Fremder löscht nicht', (await call(`pa_room_note_delete('PRJEKT', $1)`, [N1])).error === 'not_found');
await als(CO);
ok('5  Lehrkraft löscht den Zettel der anderen Lehrkraft', (await call(`pa_room_note_delete('PRJEKT', $1)`, [N2])).ok);
ok('5  … weg', (await view('t1')).group.notes.length === 1);
await als(OWNER);
await call(`pa_room_group_delete('PRJEKT', $1)`, [G1]);
ok('5  Gruppe aufgelöst: Zettel weg', !(await one(`select 1 x from pa_notes where group_id = $1`, [G1])));
ok('5  Zettel in Einzelarbeit möglich', (await call(`pa_room_note_add('PRJEKT', $1, 'Gut gemacht!')`, [G2])).ok);

try { await db.exec(mig('0205_projektarbeit_lehrkraefte.sql')); ok('6  Migration läuft zweimal', true); }
catch (e) { ok('6  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
