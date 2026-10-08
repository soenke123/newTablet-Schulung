/* Prüfstand für Migration 0206 — Projektarbeit: bis zu drei Fotos an
   einem Eintrag der Dokumentation. Echt gerechnet in pglite auf der
   ganzen Kette 0001…0206.

   Die Kernzusagen:
     1. Ein Schüler speichert einen Eintrag mit drei Fotos (je ~150 KB).
     2. Vier Fotos, kein Bild, falsches Format: invalid_input.
     3. Die Lehrkraft löscht ein Foto (pa_room_save), der Eintrag bleibt.
     4. Export und Backups enthalten keine Fotos.
     5. Andere Arten bleiben bei 24 000 Byte.

   Aufruf:  node supabase/tests/0206_projektarbeit_fotos.mjs */
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
const rsave = (g, ops) => call(`pa_room_save('PRJEKT', $1, $2)`, [g, JSON.stringify(ops)]);
const item = async (tok, kind, id) => (await view(tok)).items.find(i => i.kind === kind && i.id === id);

const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G1]);

const pic = n => 'data:image/jpeg;base64,' + 'A'.repeat(n);
const PH = [pic(150000), pic(150001), pic(150002)];
const log = (photos, v = 0) => [{ op: 'put', kind: 'log', id: 'l1', v,
  data: { date: '2026-10-08', text: 'Im Museum', who: [P[1], P[2]], photos } }];

/* ══ 1. Drei Fotos ══════════════════════════════════════════════ */
let r = await save('t1', log(PH));
ok('1  Eintrag mit drei Fotos gespeichert', r.ok, JSON.stringify(r).slice(0, 200));
let it = await item('t2', 'log', 'l1');
ok('1  das andere Mitglied sieht drei Fotos', it && it.data.photos.length === 3);
const v1 = it.v;

/* ══ 2. Grenzen ═════════════════════════════════════════════════ */
r = await save('t1', log(PH.concat(pic(10)), v1));
ok('2  vier Fotos: invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await save('t1', log(['javascript:alert(1)'], v1));
ok('2  kein Bild: invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await save('t1', log('data:image/jpeg;base64,AAAA', v1));
ok('2  keine Liste: invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await save('t1', log([pic(250000), pic(250000), pic(250000)], v1));
ok('2  zu groß insgesamt: payload_too_big', r.error === 'payload_too_big', JSON.stringify(r));
ok('2  Eintrag unverändert', (await item('t1', 'log', 'l1')).v === v1);

/* ══ 3. Lehrkraft löscht ein Foto ═══════════════════════════════ */
const cur = (await tget(G1)).items.find(i => i.kind === 'log' && i.id === 'l1');
r = await rsave(G1, [{ op: 'put', kind: 'log', id: 'l1', v: cur.v,
  data: Object.assign({}, cur.data, { photos: cur.data.photos.slice(1) }) }]);
ok('3  Lehrkraft entfernt ein Foto', r.ok, JSON.stringify(r).slice(0, 200));
it = await item('t1', 'log', 'l1');
ok('3  zwei Fotos übrig, Text und Urheber bleiben', it.data.photos.length === 2 && it.data.text === 'Im Museum'
  && it.data.by === P[1] && it.data.who.length === 2, JSON.stringify(Object.assign({}, it.data, { photos: undefined })));

/* ══ 4. Export und Backup ohne Fotos ════════════════════════════ */
const ex = await call(`pa_room_export('PRJEKT', $1)`, [G1]);
const exLog = ex.data.projects[0].items.find(i => i.kind === 'log');
ok('4  Export: Eintrag da, Fotos nicht', exLog && exLog.data.text === 'Im Museum' && !('photos' in exLog.data));
await call(`pa_snapshot($1, 'vorher')`, [R]);
const bk = await one(`select data from pa_backups where room_id = $1 order by created_at desc limit 1`, [R]);
ok('4  Backup ohne Fotos', !JSON.stringify(bk.data).includes('base64'));

/* ══ 5. Andere Arten unverändert ═══════════════════════════════ */
r = await save('t1', [{ op: 'put', kind: 'task', id: 't1', v: 0, data: { title: 'x', text: 'y'.repeat(30000) } }]);
ok('5  task über 24 000 Byte: payload_too_big', r.error === 'payload_too_big', JSON.stringify(r));

try { await db.exec(mig('0206_projektarbeit_fotos.sql')); ok('6  Migration läuft zweimal', true); }
catch (e) { ok('6  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
