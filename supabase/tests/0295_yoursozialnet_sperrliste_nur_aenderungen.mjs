/* Prüfstand für Migration 0295 — YourSozialNet: Sperrliste bei SQL nur über geänderte Werte.

   Die Kernzusagen:
     1. UPDATE users SET role = 'admin' über alle Zeilen geht, auch wenn bei
        einem User ein alter Wert (hier die E-Mail) auf der Sperrliste steht.
     2. Wer einen gesperrten Wert NEU hineinschreibt, scheitert weiter –
        bei UPDATE wie bei INSERT; die Meldung nennt Tabelle, Spalte und id.

   Aufruf:  node supabase/tests/0295_yoursozialnet_sperrliste_nur_aenderungen.mjs */
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

const T1 = 'e0000000-0000-4000-8000-0000000000e1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T1]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 't1', 'T1', 'active', 'approved', true)`, [T1, SCHOOL]);
const M1 = 'e0000000-0000-4000-8000-0000000000a1';
const M2 = 'e0000000-0000-4000-8000-0000000000a2';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [M1, M2]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status)
                values ($1, $3, 'mia-s', 'Mia S.', 'active'), ($2, $3, 'leon', 'Leon K.', 'active')`, [M1, M2, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

await as(T1);
let r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
await as(null);
const HUB = (await call(`sh_found('tokA', 'Mias Netz', 'bell')`)).hub;


await as(null);
r = await call(`sh_register('tokA', $1, 'admin', 'pw1234', 'Mia')`, [HUB]);
ok('Admin-Konto angelegt', r.ok && r.admin, JSON.stringify(r));
const SA = r.session;
r = await call(`sh_register('tokA', $1, 'lisa', 'pw1234', 'Lisa', 'heil.lisa@example.de')`, [HUB]);
ok('User mit E-Mail heil.lisa@… (E-Mail prüft sh_register nicht)', r.ok, JSON.stringify(r));
const rows = (await db.query(`select to_jsonb(u) - 'hub_id' - 'participant_id' - 'teacher_id' - 'mps_user' j from sh_users u where hub_id = $1 order by id`, [HUB])).rows.map(x => x.j);
const LISA = rows.find(x => x.username === 'lisa');
r = await one(`select sh_bad($1) v`, [Object.entries(LISA).filter(([k, v]) => k !== 'password' && v != null).map(([, v]) => v).join(' ')]);
ok('so hätte die alte Prüfung (ganze Zeile) angeschlagen', r.v === true);
ok('E-Mail steht drin', LISA.email === 'heil.lisa@example.de', JSON.stringify(LISA));

/* 1  ganze Zeilen wie js/db.js diff, nur role geändert */
const ops = rows.map(x => ({ t: 'users', op: 'update', key: { id: x.id }, row: { ...x, role: 'admin', created_at: '2026-11-16 10:00:00' } }));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify(ops)]);
ok('1  UPDATE users SET role = admin geht trotz altem Sperrwort', r.ok && r.done === rows.length, JSON.stringify(r));
const roles = (await db.query(`select role::text from sh_users where hub_id = $1`, [HUB])).rows.map(x => x.role);
ok('1  alle sind admin', roles.every(x => x === 'admin'), JSON.stringify(roles));

/* 2  neue gesperrte Werte bleiben gesperrt */
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: LISA.id }, row: { ...LISA, bio: 'heil' } }])]);
ok('2  UPDATE mit neuem Sperrwort → abgelehnt, Spalte + id genannt', r.error === 'db_rejected' && /gesperrtes Wort/.test(r.message) && /bio/.test(r.message) && r.message.includes('id ' + LISA.id), JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 99, username: 'neu', password: '', email: 'heil.x@example.de' } }])]);
ok('2  INSERT mit Sperrwort → abgelehnt', r.error === 'db_rejected' && /email/.test(r.message), JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'insert', row: { id: 98, username: 'neu', password: '', email: 'neu@example.de' } }])]);
ok('2  INSERT ohne Sperrwort geht', r.ok, JSON.stringify(r));

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
