/* Prüfstand für Migration 0304 — Conceptogram: Vorlagen der Lehrkraft.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Nur Lehrkräfte (can_teach) legen Vorlagen an und sehen ihre Liste;
        ohne Anmeldung nichts.
     2. Speichern mit id überschreibt die eigene, fremde bleiben unberührt
        (not_found), ebenso holen und löschen.
     3. Prüfungen: Art, Objekt, Größe, höchstens 100 je Person.
     4. Vorlagen hängen an der Person, nicht am Raum: Raum weg → Vorlage bleibt;
        Konto weg → Vorlagen weg. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0304_diagramm_vorlagen.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
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

const T1 = 'e0000000-0000-4000-8000-0000000000d1';
const T2 = 'e0000000-0000-4000-8000-0000000000d2';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, T2]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status)
                values ($1, $3, 't1', 'T1', 'active', 'approved'),
                       ($2, $3, 't2', 'T2', 'active', 'approved')`, [T1, T2, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

const S = `insert into profiles (id, school_id, account_name, display_name, status) values ($1, $2, 's1', 'S1', 'active')`;
const S1 = 'e0000000-0000-4000-8000-0000000000d3';
await db.query(`insert into auth.users (id) values ($1)`, [S1]);
await db.query(S, [S1, SCHOOL]);
const DOC = JSON.stringify({ v: 1, kind: 'klasse', nodes: [{ id: 'n1', type: 'class', t: 'Auto' }], edges: [] });

/* 1  Wer darf */
await as(null);
let r = await call(`dg_tpl_list(null)`);
ok('1  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');
await as(S1);
r = await call(`dg_tpl_save(null, null, 'x', 'klasse', $1::jsonb)`, [DOC]);
ok('1  Schüler-Konto legt keine an', r.error === 'not_a_teacher');
r = await call(`dg_tpl_list(null)`);
ok('1  Schüler-Konto sieht keine Liste', r.error === 'not_a_teacher');
await as(T1);
r = await call(`dg_tpl_list('ABC')`);
ok('1  Lehrkraft: leere Liste', r.ok && r.items.length === 0);
r = await call(`dg_tpl_save('ABC', null, '  Fahrzeuge  ', 'klasse', $1::jsonb)`, [DOC]);
ok('1  anlegen', r.ok && r.created === true);
const ID = r.id;
r = await call(`dg_tpl_list(null)`);
ok('1  Liste: Titel getrimmt, Art, Anzahl Bausteine', r.items.length === 1 && r.items[0].title === 'Fahrzeuge' && r.items[0].kind === 'klasse' && r.items[0].nodes === 1);

/* 2  Eigene überschreiben, fremde nicht */
const DOC2 = JSON.stringify({ v: 1, kind: 'mindmap', nodes: [{ id: 'c', type: 'center', t: 'Wald' }, { id: 'a', type: 'topic', t: 'Tiere' }], edges: [] });
r = await call(`dg_tpl_save(null, $1, 'Wald', 'mindmap', $2::jsonb)`, [ID, DOC2]);
ok('2  überschreiben', r.ok && r.created === false && r.id === ID);
r = await call(`dg_tpl_get(null, $1)`, [ID]);
ok('2  holen: neuer Stand', r.ok && r.title === 'Wald' && r.kind === 'mindmap' && r.doc.nodes.length === 2);
await as(T2);
r = await call(`dg_tpl_list(null)`);
ok('2  andere Lehrkraft sieht sie nicht', r.ok && r.items.length === 0);
r = await call(`dg_tpl_get(null, $1)`, [ID]);
ok('2  … holt sie nicht', r.error === 'not_found');
r = await call(`dg_tpl_save(null, $1, 'weg', 'mindmap', $2::jsonb)`, [ID, DOC2]);
ok('2  … überschreibt sie nicht', r.error === 'not_found');
r = await call(`dg_tpl_delete(null, $1)`, [ID]);
ok('2  … löscht sie nicht', r.error === 'not_found');
await as(T1);
r = await call(`dg_tpl_get(null, $1)`, [ID]);
ok('2  noch da und unverändert', r.ok && r.title === 'Wald');

/* 3  Prüfungen */
r = await call(`dg_tpl_save(null, null, 'x', 'kreis', $1::jsonb)`, [DOC]);
ok('3  unbekannte Art → invalid_input', r.error === 'invalid_input');
r = await call(`dg_tpl_save(null, null, 'x', 'klasse', '[]'::jsonb)`);
ok('3  kein Objekt → invalid_input', r.error === 'invalid_input');
r = await call(`dg_tpl_save(null, null, 'x', 'klasse', jsonb_build_object('t', repeat('a', 300001)))`);
ok('3  zu groß → payload_too_big', r.error === 'payload_too_big');
r = await call(`dg_tpl_save(null, null, repeat('T', 200), 'klasse', $1::jsonb)`, [DOC]);
ok('3  Titel auf 80 gekürzt', r.ok && (await call(`dg_tpl_get(null, $1)`, [r.id])).title.length === 80);
await db.query(`insert into dg_templates (owner_id, title, kind, doc) select $1, 'v' || g, 'klasse', '{}'::jsonb from generate_series(1, 98) g`, [T1]);
r = await call(`dg_tpl_save(null, null, 'zu viel', 'klasse', $1::jsonb)`, [DOC]);
ok('3  höchstens 100 je Person', r.error === 'quota_exceeded' && r.max === 100);
r = await call(`dg_tpl_save(null, $1, 'Wald 2', 'mindmap', $2::jsonb)`, [ID, DOC2]);
ok('3  überschreiben geht auch dann', r.ok);
r = await call(`dg_tpl_delete(null, $1)`, [ID]);
ok('3  löschen', r.ok);
r = await call(`dg_tpl_get(null, $1)`, [ID]);
ok('3  weg', r.error === 'not_found');

/* 4  Person statt Raum, zweimal */
r = await call(`skill_room_create('diagramm', 'Info 9a', false, '{}'::jsonb)`);
await db.query(`delete from skill_rooms where code = $1`, [r.code]);
ok('4  Raum weg → Vorlagen bleiben', (await one(`select count(*) n from dg_templates where owner_id = $1`, [T1])).n == 99);
await db.query(`delete from profiles where id = $1`, [T1]);
ok('4  Konto weg → Vorlagen weg', (await one(`select count(*) n from dg_templates`)).n == 0);
ok('4  keine Rechte an der Tabelle für anon/authenticated',
   !(await one(`select has_table_privilege('authenticated', 'dg_templates', 'select') or has_table_privilege('anon', 'dg_templates', 'select') x`)).x);
ok('4  anon darf die RPCs nicht ausführen',
   !(await one(`select has_function_privilege('anon', 'dg_tpl_save(text, uuid, text, text, jsonb)', 'execute') x`)).x);
let twice = true;
try { await db.exec(mig('0304_diagramm_vorlagen.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('4  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
