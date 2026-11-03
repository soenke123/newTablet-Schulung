/* Prüfstand für Migration 0260 — Diagramm: Teilen in beide Richtungen.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Die Lehrkraft sieht ein Diagramm erst, wenn die Person es teilt;
        Entziehen nimmt es wieder weg. Die Liste verrät nur Name und Art.
     2. Anfrage der Lehrkraft: Tablet sieht sie, Ja = teilen, Nein = declined;
        höchstens alle 30 s fragen; fremde Lehrkraft kann nicht fragen.
     3. Die Lehrkraft gibt ihr Diagramm an die Klasse (rev zählt), das Tablet
        sieht nur Kopfdaten im Poll und holt es auf Wunsch; zurücknehmen geht.
     4. Raum weg → alles weg. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0260_diagramm_teilen.mjs */
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


await as(T1);
let r = await call(`skill_room_create('diagramm', 'Info 9a', false, '{"kind":"klasse"}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
const DOC = { v: 1, kind: 'klasse', nodes: [{ id: 'n1', type: 'class', t: 'Auto' }], edges: [] };

/* 1  Schüler → Lehrkraft: erst nach Teilen sichtbar */
await as(null);
r = await call(`dg_mine_share('tokA', true)`);
ok('1  teilen ohne Diagramm → not_found', r.error === 'not_found');
await call(`dg_mine_put('tokA', $1::jsonb, 'Fahrzeuge', 'klasse')`, [JSON.stringify(DOC)]);
await call(`dg_mine_put('tokB', $1::jsonb, 'Geheim', 'klasse')`, [JSON.stringify(DOC)]);
r = await call(`dg_mine_get('tokA')`);
ok('1  neu: nicht geteilt', r.ok && r.shared === false && r.ask === null, JSON.stringify(r));
await as(T1);
r = await call(`dg_class_list($1)`, [CODE]);
const A = r.items.find(i => i.person === 'Mia'), B = r.items.find(i => i.person === 'Leon');
ok('1  Liste: nicht geteilt ohne Titel/Bausteine', A.shared === false && A.title === '' && A.nodes === null && A.rev === 0, JSON.stringify(A));
r = await call(`dg_class_get($1, $2)`, [CODE, A.participant]);
ok('1  nicht geteilt → not_shared', r.error === 'not_shared');
await as(null);
r = await call(`dg_mine_share('tokA', true)`);
ok('1  teilen', r.ok && r.shared === true);
await as(T1);
r = await call(`dg_class_get($1, $2)`, [CODE, A.participant]);
ok('1  geteilt → Lehrkraft sieht es', r.ok && r.title === 'Fahrzeuge' && r.doc.nodes.length === 1);
r = await call(`dg_class_list($1)`, [CODE]);
ok('1  Liste: geteilt mit Titel', r.items.find(i => i.person === 'Mia').title === 'Fahrzeuge');
await as(null);
await call(`dg_mine_share('tokA', false)`);
await as(T1);
r = await call(`dg_class_get($1, $2)`, [CODE, A.participant]);
ok('1  entzogen → not_shared', r.error === 'not_shared');

/* 2  Anfrage */
r = await call(`dg_class_ask($1, $2)`, [CODE, B.participant]);
ok('2  fragen', r.ok && r.ask === 'open');
r = await call(`dg_class_ask($1, $2)`, [CODE, B.participant]);
ok('2  gleich noch einmal → too_fast', r.error === 'too_fast');
await as(null);
r = await call(`dg_mine_poll('tokB')`);
ok('2  Tablet sieht die Anfrage', r.ok && r.ask === 'open' && r.shared === false && r.teacher === null, JSON.stringify(r));
r = await call(`dg_mine_answer('tokB', false)`);
r = await call(`dg_mine_poll('tokB')`);
ok('2  Nein → declined, nicht geteilt', r.ask === 'declined' && r.shared === false);
await db.query(`update dg_work set ask_at = now() - interval '1 minute' where ask is not null`);
await as(T1);
r = await call(`dg_class_ask($1, $2)`, [CODE, B.participant]);
ok('2  nach 30 s erneut fragen', r.ok);
await as(null);
await call(`dg_mine_answer('tokB', true)`);
r = await call(`dg_mine_poll('tokB')`);
ok('2  Ja → geteilt, Anfrage weg', r.shared === true && r.ask === null);
await as(T2);
r = await call(`dg_class_ask($1, $2)`, [CODE, B.participant]);
ok('2  fremde Lehrkraft fragt nicht', r.error === 'not_found');

/* 3  Lehrkraft → Klasse */
await as(T1);
r = await call(`dg_class_share($1, $2::jsonb, 'Vorlage', 'mindmap')`, [CODE, JSON.stringify({ v: 1, kind: 'mindmap', nodes: [{ id: 'c', type: 'center', t: 'Thema' }], edges: [] })]);
ok('3  an die Klasse geben', r.ok && r.rev === 1);
r = await call(`dg_class_share($1, $2::jsonb, 'Vorlage 2', 'mindmap')`, [CODE, JSON.stringify({ v: 1, nodes: [] })]);
ok('3  noch einmal → rev 2', r.ok && r.rev === 2);
r = await call(`dg_class_share($1, '[1]'::jsonb, 'x', 'mindmap')`, [CODE]);
ok('3  kein Objekt → invalid_input', r.error === 'invalid_input');
r = await call(`dg_class_list($1)`, [CODE]);
ok('3  Liste kennt das geteilte', r.teacher && r.teacher.rev === 2 && r.teacher.title === 'Vorlage 2');
await as(null);
r = await call(`dg_mine_poll('tokA')`);
ok('3  Tablet sieht rev + Titel, nicht das Diagramm', r.teacher.rev === 2 && r.teacher.title === 'Vorlage 2' && !('doc' in r.teacher));
r = await call(`dg_mine_teacher_get('tokA')`);
ok('3  Tablet holt es', r.ok && r.kind === 'mindmap' && Array.isArray(r.doc.nodes));
await as(T2);
r = await call(`dg_class_share($1, '{}'::jsonb, 'x', 'mindmap')`, [CODE]);
ok('3  fremde Lehrkraft teilt nicht', r.error === 'not_found');
await as(T1);
r = await call(`dg_class_unshare($1)`, [CODE]);
await as(null);
r = await call(`dg_mine_poll('tokA')`);
ok('3  zurückgenommen', r.teacher === null);
r = await call(`dg_mine_teacher_get('tokA')`);
ok('3  dann nichts mehr zu holen', r.error === 'not_found');

/* 4  Aufräumen, zweimal */
await as(T1);
await call(`dg_class_share($1, '{}'::jsonb, 'x', 'mindmap')`, [CODE]);
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('4  Raum weg → alles weg', (await one(`select (select count(*) from dg_work) + (select count(*) from dg_shared) n`)).n == 0);
let twice = true;
try { await db.exec(mig('0260_diagramm_teilen.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('4  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
