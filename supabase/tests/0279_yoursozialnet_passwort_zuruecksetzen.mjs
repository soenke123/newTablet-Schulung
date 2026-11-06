/* Prüfstand für Migration 0279 — YourSozialNet: Admins setzen Passwörter zurück.

   Die Kernzusagen:
     1. Admin setzt das Passwort eines Users zurück: 6 Ziffern, als bcrypt
        gespeichert, Anmelden mit dem neuen geht, mit dem alten nicht,
        alte Sitzungen sind weg.
     2. Auch das Passwort eines anderen Admins.
     3. Normale User dürfen es nicht ('not_admin'), das eigene Konto nicht
        ('self'), Testkonten der Lehrkraft nur die Lehrkraft ('forbidden').
     4. Die Lehrkraft darf es in jedem Netzwerk ihres Raums, auch ohne Konto.

   Aufruf:  node supabase/tests/0279_yoursozialnet_passwort_zuruecksetzen.mjs */
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
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

await as(T1);
let r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
await as(null);
const HUB = (await call(`sh_found('tokA', 'Mias Netz', 'bell')`)).hub;
const SA = (await call(`sh_register('tokA', $1, 'admin', 'pw1234', 'Mia')`, [HUB])).session;
const SB = (await call(`sh_register('tokA', $1, 'leon', 'pw1234', 'Leon')`, [HUB])).session;
const SC = (await call(`sh_register('tokA', $1, 'ida', 'pw1234', 'Ida')`, [HUB])).session;
await db.query(`update sh_users set role = 'admin' where hub_id = $1 and username = 'ida'`, [HUB]);
const id = async n => (await one(`select id from sh_users where hub_id = $1 and username = $2`, [HUB, n])).id;
const LEON = await id('leon'), IDA = await id('ida'), ADMIN = await id('admin');
const pw = async uid => (await one(`select password from sh_users where hub_id = $1 and id = $2`, [HUB, uid])).password;

/* 1  Admin setzt einen User zurück */
const vorher = await pw(LEON);
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SA, LEON]);
ok('1  Admin setzt Passwort zurück: 6 Ziffern', r.ok && /^\d{6}$/.test(r.password) && r.username === 'leon', JSON.stringify(r));
const neu = r.password;
const hash = await pw(LEON);
ok('1  gespeichert als bcrypt-Hash, nicht im Klartext', /^\$2a\$08\$.{53}$/.test(hash) && hash !== vorher && !hash.includes(neu), hash);
r = await call(`sh_enter('tokA', null, $1, $2)`, [HUB, SB]);
ok('1  alte Sitzung des Users ist weg', !r.me, JSON.stringify(r.me));
r = await call(`sh_login('tokA', $1, 'leon', 'pw1234')`, [HUB]);
ok('1  altes Passwort geht nicht mehr', r.error === 'wrong_login', JSON.stringify(r));
r = await call(`sh_login('tokA', $1, 'leon', $2)`, [HUB, neu]);
ok('1  neues Passwort geht', r.ok && r.session, JSON.stringify(r));
const SB2 = r.session;

/* 2  auch andere Admins */
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SA, IDA]);
ok('2  Admin setzt anderen Admin zurück', r.ok && /^\d{6}$/.test(r.password), JSON.stringify(r));
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SC, ADMIN]);
ok('2  … deren alte Sitzung ist weg, also kein Zugriff mehr', !r.ok, JSON.stringify(r));

/* 3  Grenzen */
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SB2, ADMIN]);
ok('3  normaler User → not_admin', r.error === 'not_admin', JSON.stringify(r));
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SA, ADMIN]);
ok('3  eigenes Konto → self', r.error === 'self', JSON.stringify(r));
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, 999)`, [HUB, SA]);
ok('3  unbekannter User → not_found', r.error === 'not_found', JSON.stringify(r));
r = await call(`sh_user_pw_reset('tokB', null, $1, null, $2)`, [HUB, LEON]);
ok('3  fremdes Gerät ohne Sitzung → hub_private', r.error === 'hub_private', JSON.stringify(r));

/* 4  Lehrkraft */
await as(T1);
r = await call(`sh_register(null, $1, 'frau_t_test', 'test99', null, null, null, null, null, null, null, null, $2)`, [HUB, CODE]);
ok('4  Lehrkraft legt Testkonto an', r.ok, JSON.stringify(r));
const TEST = await id('frau_t_test');
r = await call(`sh_user_pw_reset(null, $1, $2, null, $3)`, [CODE, HUB, ADMIN]);
ok('4  Lehrkraft ohne Konto setzt den Admin zurück', r.ok && /^\d{6}$/.test(r.password), JSON.stringify(r));
const ADMIN_PW = r.password;
r = await call(`sh_user_pw_reset(null, $1, $2, null, $3)`, [CODE, HUB, TEST]);
ok('4  Lehrkraft setzt ihr Testkonto zurück', r.ok, JSON.stringify(r));
await as(null);
const SA2 = (await call(`sh_login('tokA', $1, 'admin', $2)`, [HUB, ADMIN_PW])).session;
r = await call(`sh_user_pw_reset('tokA', null, $1, $2, $3)`, [HUB, SA2, TEST]);
ok('4  Admin setzt Testkonto der Lehrkraft nicht zurück → forbidden', r.error === 'forbidden', JSON.stringify(r));

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
