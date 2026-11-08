/* Prüfstand für Migration 0282 — Arbeitsmaterial.

   Die Kernzusagen:
     1. Lehrkraft des Raums liest und setzt die Häkchen ihres Kurses, eingeladene Lehrkraft auch.
     2. Andere Lehrkräfte, Schüler (ohne Konto) und Fremde kommen nicht an die Häkchen.
     3. Ungültige Häkchen werden abgelehnt, doppelte zusammengefasst.
     4. Lösungsheft: nur Admin mit 2FA lädt hoch; freigeschaltete Lehrkräfte holen es,
        nicht freigeschaltete Konten und Gäste nicht.
     5. Häkchen gehen mit dem Raum.

   Aufruf:  node supabase/tests/0282_arbeitsmaterial.mjs */
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
create table if not exists _aal (v text); insert into _aal values ('aal2');
create or replace function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', (select v from _aal limit 1)) $$;
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
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
for (const f of FILES) {
  try { await db.exec(readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8')); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);


const T1 = 'e0000000-0000-4000-8000-0000000000e1';   // Besitzerin, Admin
const T2 = 'e0000000-0000-4000-8000-0000000000e2';   // eingeladene Lehrkraft
const T3 = 'e0000000-0000-4000-8000-0000000000e3';   // andere Lehrkraft
const U4 = 'e0000000-0000-4000-8000-0000000000e4';   // Konto ohne Freischaltung
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
for (const [id, n, ts, adm] of [[T1, 't1', 'approved', true], [T2, 't2', 'approved', false], [T3, 't3', 'approved', false], [U4, 'u4', 'none', false]]) {
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                  values ($1, $2, $3, $3, 'active', $4, $5)`, [id, SCHOOL, n, ts, adm]);
}
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

await as(T1);
const CODE = (await call(`skill_room_create('socialhub', 'Info Q1', false, '{}'::jsonb)`)).code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [ROOM, T2]);

/* 1 */
let r = await call(`skill_material_marks_get($1, 'socialhub')`, [CODE]);
ok('1  Besitzerin liest: noch leer, Kursname dabei', r.ok && r.teile.length === 0 && r.title === 'Info Q1', JSON.stringify(r));
r = await call(`skill_material_marks_set($1, 'socialhub', '["I-2","II-1","II-1"]'::jsonb)`, [CODE]);
ok('1  setzen, doppelte zusammengefasst', r.ok && r.teile.length === 2, JSON.stringify(r));
r = await call(`skill_material_marks_get(lower($1), 'socialhub')`, [CODE]);
ok('1  Code klein geschrieben geht auch', r.ok && r.teile.includes('I-2') && r.teile.includes('II-1'), JSON.stringify(r));
await as(T2);
r = await call(`skill_material_marks_set($1, 'socialhub', '["I-3","II-2"]'::jsonb)`, [CODE]);
ok('1  eingeladene Lehrkraft setzt', r.ok, JSON.stringify(r));
r = await call(`skill_material_marks_get($1, 'socialhub')`, [CODE]);
ok('1  … und liest denselben Stand', r.ok && r.teile.join() === 'I-3,II-2', JSON.stringify(r));

/* 2 */
await as(T3);
r = await call(`skill_material_marks_get($1, 'socialhub')`, [CODE]);
ok('2  andere Lehrkraft → not_teacher', r.error === 'not_teacher', JSON.stringify(r));
r = await call(`skill_material_marks_set($1, 'socialhub', '[]'::jsonb)`, [CODE]);
ok('2  … darf auch nicht setzen', r.error === 'not_teacher', JSON.stringify(r));
await as(null);
r = await call(`skill_material_marks_get($1, 'socialhub')`, [CODE]);
ok('2  ohne Konto → not_logged_in', r.error === 'not_logged_in', JSON.stringify(r));
const anon = (await one(`select has_function_privilege('anon', 'skill_material_marks_get(text, text)', 'execute') v`)).v;
ok('2  anon darf die RPCs gar nicht ausführen', anon === false);

/* 3 */
await as(T1);
r = await call(`skill_material_marks_set($1, 'socialhub', '"I-1"'::jsonb)`, [CODE]);
ok('3  kein Array → bad_teile', r.error === 'bad_teile', JSON.stringify(r));
r = await call(`skill_material_marks_set($1, 'socialhub', '["<script>"]'::jsonb)`, [CODE]);
ok('3  seltsame id → bad_teile', r.error === 'bad_teile', JSON.stringify(r));
r = await call(`skill_material_marks_set($1, 'socialhub', '[1,2]'::jsonb)`, [CODE]);
ok('3  Zahlen → bad_teile', r.error === 'bad_teile', JSON.stringify(r));
r = await call(`skill_material_marks_set($1, 'Social Hub', '[]'::jsonb)`, [CODE]);
ok('3  falscher Skill-Name → bad_tool', r.error === 'bad_tool', JSON.stringify(r));

/* 4 */
const B64 = Buffer.from('%PDF-1.4 Lösungen').toString('base64');
await as(T2);
r = await call(`skill_material_file_put('socialhub', 'L.pdf', 'application/pdf', $1)`, [B64]);
ok('4  Lehrkraft lädt nicht hoch → not_admin', r.error === 'not_admin', JSON.stringify(r));
await as(T1);
await db.exec(`update _aal set v = 'aal1'`);
r = await call(`skill_material_file_put('socialhub', 'L.pdf', 'application/pdf', $1)`, [B64]);
ok('4  Admin ohne 2FA → not_admin', r.error === 'not_admin', JSON.stringify(r));
await db.exec(`update _aal set v = 'aal2'`);
r = await call(`skill_material_file_put('socialhub', 'L.pdf', 'application/pdf', $1)`, [B64]);
ok('4  Admin mit 2FA lädt hoch', r.ok && r.bytes === Buffer.from('%PDF-1.4 Lösungen').length, JSON.stringify(r));
r = await call(`skill_material_file_put('socialhub', '../x.pdf', 'application/pdf', $1)`, [B64]);
ok('4  Name mit ../ → bad_name', r.error === 'bad_name', JSON.stringify(r));
r = await call(`skill_material_file_put('socialhub', 'x.exe', 'application/x-msdownload', $1)`, [B64]);
ok('4  falscher Typ → bad_mime', r.error === 'bad_mime', JSON.stringify(r));
await as(T3);
r = await call(`skill_material_files_list('socialhub')`);
ok('4  freigeschaltete Lehrkraft sieht die Liste', r.ok && r.files.length === 1 && r.files[0].name === 'L.pdf' && !('data' in r.files[0]), JSON.stringify(r));
r = await call(`skill_material_file_get('socialhub', 'L.pdf')`);
ok('4  … und holt die Datei', r.ok && Buffer.from(r.data, 'base64').toString() === '%PDF-1.4 Lösungen', JSON.stringify(r).slice(0, 120));
r = await call(`skill_material_file_get('socialhub', 'fehlt.pdf')`);
ok('4  unbekannte Datei → not_found', r.error === 'not_found', JSON.stringify(r));
await as(U4);
r = await call(`skill_material_file_get('socialhub', 'L.pdf')`);
ok('4  Konto ohne Freischaltung → not_teacher', r.error === 'not_teacher', JSON.stringify(r));
await as(null);
r = await call(`skill_material_files_list('socialhub')`);
ok('4  ohne Konto → not_teacher', r.error === 'not_teacher', JSON.stringify(r));
const tab = (await one(`select has_table_privilege('authenticated', 'skill_material_files', 'select') v`)).v;
ok('4  keine Tabellenrechte für authenticated', tab === false);

/* 5 */
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
const n = (await one(`select count(*)::int c from skill_material_marks`)).c;
ok('5  Häkchen sind mit dem Raum weg', n === 0, String(n));

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
