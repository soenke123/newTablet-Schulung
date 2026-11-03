/* Prüfstand für Migration 0258 — Diagramm (MPSkill „diagramm“).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0258.

   Die Kernzusagen:
     1. Teilnehmer speichert und holt sein eigenes Diagramm; rev zählt hoch.
     2. Falsche Art / kein Objekt / zu groß → abgelehnt.
     3. Lehrkraft (Besitzerin oder eingeladen) sieht Liste + holt Diagramme,
        eine fremde Lehrkraft nicht; anon kommt an die Klasse nicht heran.
     4. Stillgelegt → blocked. Raum weg → Diagramme weg. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0258_diagramm.mjs */
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

ok('0  Skill steht in der Registry', (await one(`select count(*)::int n from skill_tools where id = 'diagramm' and folder = 'Diagramm'`)).n === 1);

await as(T1);
let r = await call(`skill_room_create('diagramm', 'Bio 8b', false, '{"kind":"wirkung"}'::jsonb)`);
ok('0  Raum anlegen', r.ok, JSON.stringify(r));
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, null)`, [ROOM]);

/* 1 */
await as(null);
r = await call(`dg_mine_get('tokA')`);
ok('1  noch nichts gespeichert → doc null', r.ok && r.doc === null, JSON.stringify(r));
const DOC = { v: 1, nodes: [{ id: 'n1', t: 'Wald' }, { id: 'n2', t: 'Regen' }], edges: [{ id: 'e1', a: 'n1', b: 'n2', s: '+' }] };
r = await call(`dg_mine_put('tokA', $1::jsonb, 'Wasserkreislauf', 'wirkung')`, [JSON.stringify(DOC)]);
ok('1  speichern', r.ok && r.rev === 1, JSON.stringify(r));
r = await call(`dg_mine_put('tokA', $1::jsonb, 'Wasserkreislauf', 'wirkung')`, [JSON.stringify(DOC)]);
ok('1  zweites Speichern → rev 2', r.ok && r.rev === 2);
r = await call(`dg_mine_get('tokA')`);
ok('1  holen', r.ok && r.doc.nodes.length === 2 && r.title === 'Wasserkreislauf' && r.kind === 'wirkung');
r = await call(`dg_mine_put('tokB', $1::jsonb, '', 'mindmap')`, [JSON.stringify({ nodes: [] })]);
ok('1  zweite Person', r.ok);

/* 2 */
r = await call(`dg_mine_put('tokA', $1::jsonb, 'x', 'torte')`, [JSON.stringify(DOC)]);
ok('2  unbekannte Art → invalid_input', r.error === 'invalid_input');
r = await call(`dg_mine_put('tokA', '[1,2]'::jsonb, 'x', 'mindmap')`);
ok('2  kein Objekt → invalid_input', r.error === 'invalid_input');
r = await call(`dg_mine_put('tokA', $1::jsonb, 'x', 'mindmap')`, [JSON.stringify({ nodes: [], big: 'x'.repeat(310000) })]);
ok('2  zu groß → payload_too_big', r.error === 'payload_too_big');
r = await call(`dg_mine_put('nix', $1::jsonb, 'x', 'mindmap')`, [JSON.stringify(DOC)]);
ok('2  fremder Token → unknown_token', r.error === 'unknown_token');

/* 3 */
// Seit 0260 sieht die Lehrkraft nur, was geteilt ist (0260_diagramm_teilen.mjs) — hier beide teilen.
await call(`dg_mine_share('tokA', true)`); await call(`dg_mine_share('tokB', true)`);
r = await call(`dg_class_list($1)`, [CODE]);
ok('3  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');
await as(T1);
r = await call(`dg_class_list($1)`, [CODE]);
ok('3  Lehrkraft sieht die Liste', r.ok && r.items.length === 2 && r.items[0].person === 'Mia' && r.items[0].nodes === 2 && r.items[0].rev === 2, JSON.stringify(r.items));
ok('3  ohne Namen → „Tablet 2“', r.items[1].person === 'Tablet 2');
ok('3  Liste ohne Inhalt', !('doc' in r.items[0]));
const PA = r.items[0].participant;
r = await call(`dg_class_get($1, $2)`, [CODE, PA]);
ok('3  Lehrkraft holt ein Diagramm', r.ok && r.doc.edges[0].s === '+');
await as(T2);
r = await call(`dg_class_list($1)`, [CODE]);
ok('3  fremde Lehrkraft → not_found', r.error === 'not_found');
r = await call(`dg_class_get($1, $2)`, [CODE, PA]);
ok('3  fremde Lehrkraft holt nichts', r.error === 'not_found');
await db.query(`insert into skill_room_teachers (room_id, user_id, added_by) values ($1, $2, $3)`, [ROOM, T2, T1]).catch(async () => {
  await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [ROOM, T2]);
});
r = await call(`dg_class_list($1)`, [CODE]);
ok('3  eingeladene Lehrkraft sieht sie', r.ok && r.items.length === 2);

/* 4 */
await db.query(`update skill_participants set blocked = true where token = 'tokB'`);
await as(null);
r = await call(`dg_mine_put('tokB', $1::jsonb, '', 'mindmap')`, [JSON.stringify({ nodes: [] })]);
ok('4  stillgelegt → blocked', r.error === 'blocked');
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('4  Raum weg → Diagramme weg', (await one(`select count(*)::int n from dg_work`)).n === 0);
let twice = true;
try { await db.exec(mig('0258_diagramm.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('4  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
