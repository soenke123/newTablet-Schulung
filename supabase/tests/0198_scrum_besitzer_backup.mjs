/* Prüfstand für Migration 0198 — Scrum Werkstatt: Raum-Besitzer, Beobachter, Backup.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0198.

   Die Kernzusagen:
     1. Beobachter bleiben Beobachter (observer_locked).
     2. Der Raum-Besitzer schreibt Board und Kacheln wie ein Mitglied;
        fremde Lehrkräfte, Gäste und Teilnehmer nicht.
     3. Backup einmal pro Woche, nur bei Aktivität, nur bei Inhalt,
        höchstens 8 Auto-Backups je Raum.
     4. Einspielen/Zurücksetzen nur durch den Besitzer: ersetzt alles,
        legt vorher ein Backup an, vergibt höhere Versionen, hält die
        Nummernvergabe in Takt und prüft die Eingabe vor dem Schreiben.
     5. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0198_scrum_besitzer_backup.mjs */
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

const osave = (ops) => call(`scrum_room_save('SCRUMA', $1)`, [JSON.stringify(ops)]);
const backups = async () => (await call(`scrum_room_backups('SCRUMA')`)).backups;

await call(`scrum_enter('t1', 'member')`);
await call(`scrum_enter('t2', 'observer')`);

/* ══ 1. Beobachter bleibt Beobachter ═════════════════════════════ */
ok('1  Beobachter → Mitglied: observer_locked', (await call(`scrum_enter('t2', 'member')`)).error === 'observer_locked');
ok('1  derselbe Zustand nochmal: ok', (await call(`scrum_enter('t2', 'observer')`)).ok);
ok('1  Neueinsteiger können weiter wählen', (await call(`scrum_enter('t3', 'member')`)).ok);

/* ══ 2. Besitzer schreibt ════════════════════════════════════════ */
let r = await osave([
  { op: 'put', kind: 'product', id: 'main', v: 0, data: { name: 'Proj' } },
  { op: 'put', kind: 'story', id: 'a1', v: 0, data: { id: 'a1', title: 'Eins', points: 3, status: 'todo', sprint: null } }
]);
ok('2  Besitzer legt Karten an, Server vergibt US-01', r.ok && r.items[1].data.key === 'US-01', JSON.stringify(r).slice(0, 100));
r = await save('t1', [{ op: 'put', kind: 'story', id: 'a1', v: 1, data: { id: 'a1', title: 'Eins!', points: 3, status: 'doing', key: 'US-01' } }]);
ok('2  Mitglied ändert dieselbe Karte weiter (scrum_save nach Refactor)', r.ok && r.items[0].v === 2);
r = await osave([{ op: 'put', kind: 'story', id: 'a1', v: 1, data: { title: 'alt' } }]);
ok('2  Besitzer mit alter Version: conflict', r.error === 'conflict');
r = await call(`scrum_room_member_update('SCRUMA', $1, '{"role":"sm","label":"Chef"}')`, [await pid('t1')]);
ok('2  Besitzer ändert Rolle und Label einer Kachel',
   r.ok && (await view('t1')).members.find(m => m.me).role === 'sm');
ok('2  Besitzer: Beobachter-Kachel nicht änderbar',
   (await call(`scrum_room_member_update('SCRUMA', $1, '{"role":"po"}')`, [await pid('t2')])).error === 'not_found');

await als(OTHER);
ok('2  fremde Lehrkraft darf nichts davon',
   (await osave([{ op: 'del', kind: 'story', id: 'a1', v: 2 }])).error === 'not_found'
   && (await call(`scrum_room_restore('SCRUMA', '[]', 0, 0)`)).error === 'not_found'
   && (await call(`scrum_room_backups('SCRUMA')`)).error === 'not_found');
await als(null);
ok('2  ohne Anmeldung: not_authenticated', (await osave([])).error === 'not_authenticated');
await als(T);
ok('2  Teilnehmer dürfen die Besitzer-Funktionen nicht (Rechte)',
   (await one(`select has_function_privilege('anon', 'scrum_room_restore(text,jsonb,int,int)', 'execute') a,
                      has_function_privilege('authenticated', 'scrum_room_restore(text,jsonb,int,int)', 'execute') b`)).a === false);

/* ══ 3. Wöchentliches Backup ═════════════════════════════════════ */
ok('3  das Lesen im Raum hat bereits ein Auto-Backup angelegt', (await backups()).filter(b => b.kind === 'auto').length === 1);
await view('t1'); await view('t1'); await call(`scrum_room_get('SCRUMA', null)`);
ok('3  weiteres Lesen am selben Tag: kein zweites', (await backups()).filter(b => b.kind === 'auto').length === 1);
await db.exec(`update scrum_backups set created_at = now() - interval '6 days' where room_id = '${R}'`);
await view('t1');
ok('3  jünger als 7 Tage: nichts Neues', (await backups()).length === 1);
await db.exec(`update scrum_backups set created_at = now() - interval '8 days' where room_id = '${R}'`);
await view('t1');
let bl = await backups();
ok('3  älter als 7 Tage + jemand liest: neues Backup', bl.length === 2 && bl[0].kind === 'auto', JSON.stringify(bl));
const bg = await call(`scrum_room_backup_get('SCRUMA', $1)`, [bl[0].id]);
ok('3  Backup hat Export-Format mit Story, Product und Nummern',
   bg.ok && bg.data.format === 'scrum-werkstatt' && bg.data.stories.length === 1
   && bg.data.stories[0].id === 'a1' && bg.data.product.name === 'Proj' && bg.data.seq.story === 1);

// Backups sind pro Raum getrennt, ein leerer Raum sichert nichts
const R2 = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                       values ('SCRUMB', 'scrum', $1, $2, 'Team B') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name) values ('${R2}', 'u1', 1, 'Anna')`);
await call(`scrum_enter('u1', 'member')`); await view('u1');
ok('3  leeres Projekt wird nicht gesichert',
   (await call(`scrum_room_backups('SCRUMB')`)).backups.length === 0);

// Aufräumen: nur die letzten 8 Auto-Backups bleiben
for (let i = 0; i < 10; i++) {
  await db.exec(`update scrum_backups set created_at = created_at - interval '8 days' where room_id = '${R}'`);
  await view('t1');
}
ok('3  höchstens 8 Auto-Backups', (await backups()).filter(b => b.kind === 'auto').length === 8);

/* ══ 4. Einspielen / Zurücksetzen ════════════════════════════════ */
const items = [
  { kind: 'product', id: 'main', data: { name: 'Import' } },
  { kind: 'story', id: 'x1', data: { id: 'x1', title: 'Neu', points: 1, status: 'done', no: 7, key: 'US-07' } },
  { kind: 'sprint', id: 'sp9', data: { id: 'sp9', name: 'Sprint 9', no: 9, status: 'closed' } }
];
const before = (await one(`select max(version) v from scrum_items where room_id = $1`, [R])).v;
r = await call(`scrum_room_restore('SCRUMA', $1, 3, 2)`, [JSON.stringify(items)]);
ok('4  Einspielen klappt', r.ok, JSON.stringify(r));
const now1 = await view('t1');
ok('4  Inhalt ersetzt (alte Karte weg, neue da)',
   now1.items.length === 3 && !now1.items.some(i => i.id === 'a1') && now1.items.some(i => i.id === 'x1'));
ok('4  Versionen liegen über allen früheren (kein Cache-Irrtum)', now1.items.every(i => i.v > before));
ok('4  Nummernvergabe läuft nach dem Import weiter: mindestens 7 / 9',
   now1.seq.story === 7 && now1.seq.sprint === 9, JSON.stringify(now1.seq));
ok('4  Burndown-Verlauf des alten Stands ist weg', now1.burndown.length === 0);
bl = await backups();
ok('4  vorher wurde ein Backup „vorher" angelegt', bl.some(b => b.kind === 'vorher' && b.stories === 1));
r = await save('t1', [{ op: 'put', kind: 'story', id: 'n2', v: 0, data: { title: 'nächste' } }]);
ok('4  nächste neue Karte bekommt US-08', r.ok && r.items[0].data.key === 'US-08', JSON.stringify(r).slice(0, 100));

// Rückweg: das „vorher"-Backup einspielen
const vor = bl.find(b => b.kind === 'vorher');
const vd = (await call(`scrum_room_backup_get('SCRUMA', $1)`, [vor.id])).data;
const back = [{ kind: 'product', id: 'main', data: vd.product },
  ...vd.stories.map(s => ({ kind: 'story', id: s.id, data: s })), ...vd.sprints.map(s => ({ kind: 'sprint', id: s.id, data: s }))];
r = await call(`scrum_room_restore('SCRUMA', $1, $2, $3)`, [JSON.stringify(back), vd.seq.story, vd.seq.sprint]);
ok('4  Backup zurückspielen', r.ok && (await view('t1')).items.some(i => i.id === 'a1'));

// Prüfungen
const bad = async (its) => (await call(`scrum_room_restore('SCRUMA', $1, 0, 0)`, [JSON.stringify(its)])).error;
ok('4  doppelte Id: invalid_input', await bad([items[1], items[1]]) === 'invalid_input');
ok('4  Unsinn-Art: invalid_input', await bad([{ kind: 'x', id: 'a', data: {} }]) === 'invalid_input');
ok('4  Produkt nur als main', await bad([{ kind: 'product', id: 'other', data: {} }]) === 'invalid_input');
ok('4  zwei laufende Sprints: invalid_input',
   await bad([{ kind: 'sprint', id: 'a', data: { status: 'active' } }, { kind: 'sprint', id: 'b', data: { status: 'active' } }]) === 'invalid_input');
ok('4  zu groß: payload_too_big',
   await bad([{ kind: 'story', id: 'a', data: { t: 'x'.repeat(30000) } }]) === 'payload_too_big');
ok('4  nach fehlerhaftem Einspielen ist alles noch da', (await view('t1')).items.some(i => i.id === 'a1'));

r = await call(`scrum_room_restore('SCRUMA', '[]', 0, 0)`);
const empty = await view('t1');
ok('4  Zurücksetzen (leere Liste): Projekt leer, Zähler 0', r.ok && empty.items.length === 0 && empty.seq.story === 0);
r = await save('t1', [{ op: 'put', kind: 'story', id: 'k1', v: 0, data: { title: 'wieder von vorn' } }]);
ok('4  danach beginnt es bei US-01', r.ok && r.items[0].data.key === 'US-01');

/* ══ 5. Zweimal ══════════════════════════════════════════════════ */
try { await db.exec(mig('0198_scrum_besitzer_backup.sql')); ok('5  0198 läuft ein zweites Mal', true); }
catch (e) { ok('5  0198 läuft ein zweites Mal', false, e.message); }

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
