/* Prüfstand für Migration 0301 — NeuroLab: Netze an die Lehrkraft senden.
   Echt gerechnet in pglite auf der ganzen Kette.
     1. Schüler sendet, Lehrkraft sieht Eingang mit Name + Szenario; erneut senden überschreibt.
     2. Zeigen holt das Netz; fremde Lehrkraft und falscher Token kommen nicht heran.
     3. Löschen nimmt es nur aus der Liste (Netz des anderen Schülers bleibt).
     4. Ungültiges Szenario / zu groß abgelehnt; Raum weg → alles weg.
   Aufruf:  node supabase/tests/0301_neurolab_eingang.mjs */
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
let r = await call(`skill_room_create('neurolab', 'KI 9a', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);


const NET = { layers: [{ count: 1, neurons: [{ type: 'sigmoid', weights: [1, -1], bias: 0.5 }] }], numInputs: 2 };

await as(null);
r = await call(`nl_send('tokA', 'gates', $1::jsonb)`, [JSON.stringify(NET)]);
ok('1  senden', r.ok === true, JSON.stringify(r));
await call(`nl_send('tokB', 'gates', $1::jsonb)`, [JSON.stringify(NET)]);
await call(`nl_send('tokA', 'custom', $1::jsonb)`, [JSON.stringify(NET)]);
await as(T1);
r = await call(`nl_inbox_list($1)`, [CODE]);
ok('1  Eingang: 3 Einträge mit Name + Szenario', r.ok && r.items.length === 3 && r.items.some(i => i.from === 'Mia' && i.scenario === 'custom'), JSON.stringify(r));
ok('1  Liste ohne Netz', r.items.every(i => i.payload === undefined));
await as(null);
await call(`nl_send('tokA', 'gates', $1::jsonb)`, [JSON.stringify({ ...NET, numInputs: 3 })]);
await as(T1);
r = await call(`nl_inbox_list($1)`, [CODE]);
ok('1  erneut senden überschreibt', r.items.length === 3);
const IDA = r.items.find(i => i.from === 'Mia' && i.scenario === 'gates').id;
const IDB = r.items.find(i => i.from === 'Leon').id;

r = await call(`nl_inbox_get($1, $2)`, [CODE, IDA]);
ok('2  Zeigen: Netz der neuesten Fassung', r.ok && r.payload.numInputs === 3 && r.from === 'Mia' && r.scenario === 'gates');
await as(T2);
r = await call(`nl_inbox_list($1)`, [CODE]);
ok('2  fremde Lehrkraft: not_found', r.error === 'not_found');
r = await call(`nl_inbox_get($1, $2)`, [CODE, IDA]);
ok('2  fremde Lehrkraft holt nichts', r.error === 'not_found');
await as(null);
r = await call(`nl_send('falsch', 'gates', $1::jsonb)`, [JSON.stringify(NET)]);
ok('2  falscher Token', r.error === 'unknown_token');
r = await call(`nl_send('tokA', 'quatsch', $1::jsonb)`, [JSON.stringify(NET)]);
ok('4  ungültiges Szenario', r.error === 'invalid_input');
r = await call(`nl_send('tokA', 'gates', $1::jsonb)`, [JSON.stringify({ x: 'a'.repeat(310000) })]);
ok('4  zu groß', r.error === 'payload_too_big');

await as(T1);
r = await call(`nl_inbox_delete($1, $2)`, [CODE, IDA]);
r = await call(`nl_inbox_list($1)`, [CODE]);
ok('3  gelöscht: nur aus dem Eingang', r.items.length === 2 && r.items.some(i => i.id === IDB));
await as(null);
r = await call(`nl_send('tokA', 'gates', $1::jsonb)`, [JSON.stringify(NET)]);
ok('3  Schüler kann danach neu senden', r.ok);

await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('4  Raum weg → Eingang weg', (await one(`select count(*)::int n from nl_inbox`)).n === 0);
await db.exec(mig('0301_neurolab_eingang.sql'));
ok('4  Migration läuft zweimal', true);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
