/* Prüfstand für Migration 0289 — YourSozialNet: Konto mit MPSkills verknüpfen.

   Die Kernzusagen:
     1. Registrieren mit p_mps: Konto ohne Passwort, verknüpft mit auth.uid();
        in der Spalte password steht nur der Platzhalter, Anmelden damit geht nie.
     2. Ohne MPSkills-Anmeldung kein p_mps ('not_signed_in'); je Netzwerk nur
        ein verknüpftes Konto ('mps_linked').
     3. sh_mps_me nennt Accountname, Anzeigename und die verknüpften Netzwerke.
     4. sh_login_mps: Anmelden ohne Passwort, auch auf einem anderen Tablet in
        einem fremden Netzwerk; nicht verknüpft → 'mps_not_linked'; gesperrt → 'hub_locked'.
     5. sh_mps_link verknüpft ein bestehendes Konto; fremd verknüpftes → 'mps_other'.
     6. mps_user steht nicht im Schnappschuss; Konto gelöscht → Verknüpfung weg.
     7. Benutzernamen mit Bindestrich und ab 2 Zeichen, auch per SQL.

   Aufruf:  node supabase/tests/0289_yoursozialnet_mpskills_konto.mjs */
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

/* 2  ohne Anmeldung kein p_mps */
r = await call(`sh_register(p_token => 'tokA', p_hub => $1, p_username => 'admin', p_name => 'Mia', p_mps => true)`, [HUB]);
ok('2  ohne MPSkills-Anmeldung → not_signed_in', r.error === 'not_signed_in', JSON.stringify(r));

/* 3  sh_mps_me */
r = await call(`sh_mps_me('tokA', null)`);
ok('3  ohne Anmeldung: signed_in false', r.ok && r.signed_in === false, JSON.stringify(r));
await as(M1);
r = await call(`sh_mps_me('tokA', null)`);
ok('3  angemeldet: Accountname + Anzeigename, noch kein Netzwerk', r.signed_in && r.account === 'mia-s' && r.display === 'Mia S.' && r.nets.length === 0, JSON.stringify(r));

/* 1  registrieren mit p_mps */
r = await call(`sh_register(p_token => 'tokA', p_hub => $1, p_username => 'mia-s', p_name => 'Mia S.', p_mps => true)`, [HUB]);
ok('1  Admin-Konto mit MPSkills, ohne Passwort, mit Bindestrich', r.ok && r.admin && r.session, JSON.stringify(r));
const SA = r.session;
let u = await one(`select * from sh_users where hub_id = $1 and username = 'mia-s'`, [HUB]);
ok('1  verknüpft, Platzhalter statt Passwort', u.mps_user === M1 && u.password === '(MPSkills-Konto)', JSON.stringify(u));
r = await call(`sh_login('tokA', $1, 'mia-s', '(MPSkills-Konto)')`, [HUB]);
ok('1  Platzhalter taugt nicht als Passwort', r.error === 'wrong_login', JSON.stringify(r));
r = await call(`sh_login('tokA', $1, 'mia-s', '')`, [HUB]);
ok('1  leeres Passwort auch nicht', r.error === 'wrong_login', JSON.stringify(r));
r = await call(`sh_register(p_token => 'tokA', p_hub => $1, p_username => 'mia2', p_mps => true)`, [HUB]);
ok('2  zweites verknüpftes Konto im selben Netzwerk → mps_linked', r.error === 'mps_linked', JSON.stringify(r));
r = await call(`sh_mps_me('tokA', null)`);
ok('3  Netzwerk steht in nets', r.nets.length === 1 && r.nets[0].hub === HUB && r.nets[0].username === 'mia-s', JSON.stringify(r));

/* 7  Benutzernamen */
r = await call(`sh_register('tokA', $1, 'jo', 'pw1234')`, [HUB]);
ok('7  zwei Zeichen gehen', r.ok, JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'leon-k', 'pw1234', 'Leon')`, [HUB]);
ok('7  Bindestrich mit Passwort geht', r.ok, JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'mia!', 'pw1234')`, [HUB]);
ok('7  Ausrufezeichen nicht', r.error === 'invalid_username', JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'x', 'pw1234')`, [HUB]);
ok('7  ein Zeichen nicht', r.error === 'invalid_username', JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'ohnepw', '')`, [HUB]);
ok('7  ohne p_mps bleibt das Passwort Pflicht', r.error === 'invalid_password', JSON.stringify(r));
const JO = (await one(`select id from sh_users where hub_id = $1 and username = 'jo'`, [HUB])).id;
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: JO }, row: { username: 'jo-neu' } }])]);
ok('7  per SQL: Bindestrich geht', r.ok, JSON.stringify(r));
r = await call(`sh_db_apply('tokA', null, $1, $2, $3::jsonb)`, [HUB, SA, JSON.stringify([{ t: 'users', op: 'update', key: { id: JO }, row: { username: 'jo neu' } }])]);
ok('7  per SQL: Leerzeichen nicht', r.error === 'db_rejected' && /Bindestrich/.test(r.message), JSON.stringify(r));

/* 6  Schnappschuss */
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [HUB, SA]);
ok('6  mps_user steht nicht im Schnappschuss', r.ok && !JSON.stringify(r).includes(M1) && !r.tables.users.cols.includes('mps_user'), JSON.stringify(r.tables.users.cols));

/* 4  anderes Tablet */
r = await call(`sh_enter('tokB', null, $1, null)`, [HUB]);
ok('4  fremdes Tablet ohne Sitzung kommt nicht rein', r.error === 'hub_private', JSON.stringify(r));
r = await call(`sh_mps_me('tokB', null)`);
ok('4  auf dem anderen Tablet: Netzwerk über das Konto gefunden', r.nets.length === 1 && r.nets[0].name === 'Mias Netz', JSON.stringify(r));
r = await call(`sh_login_mps('tokB', null, $1)`, [HUB]);
ok('4  Anmelden ohne Passwort auf dem anderen Tablet', r.ok && r.session && r.username === 'mia-s', JSON.stringify(r));
r = await call(`sh_enter('tokB', null, $1, $2)`, [HUB, r.session]);
ok('4  … und die Sitzung trägt ins Netzwerk', r.ok && r.me && r.me.username === 'mia-s', JSON.stringify(r.me));
await as(M2);
r = await call(`sh_login_mps('tokB', null, $1)`, [HUB]);
ok('4  nicht verknüpft → mps_not_linked', r.error === 'mps_not_linked', JSON.stringify(r));
await as(null);
r = await call(`sh_login_mps('tokB', null, $1)`, [HUB]);
ok('4  ohne Anmeldung → not_signed_in', r.error === 'not_signed_in', JSON.stringify(r));

/* 5  nachträglich verknüpfen */
r = await call(`sh_login_net('tokB', 'Mias Netz', 'leon-k', 'pw1234')`);
ok('5  Leon meldet sich mit Passwort an', r.ok, JSON.stringify(r));
const SL = r.session;
r = await call(`sh_mps_link('tokB', null, $1, $2)`, [HUB, SL]);
ok('5  ohne MPSkills-Anmeldung → not_signed_in', r.error === 'not_signed_in', JSON.stringify(r));
await as(M2);
r = await call(`sh_mps_link('tokB', null, $1, null)`, [HUB]);
ok('5  ohne Sitzung → hub_private', r.error === 'hub_private', JSON.stringify(r));
r = await call(`sh_mps_link('tokB', null, $1, $2)`, [HUB, SL]);
ok('5  verknüpft', r.ok && r.username === 'leon-k', JSON.stringify(r));
r = await call(`sh_login_mps('tokB', null, $1)`, [HUB]);
ok('5  danach Anmelden ohne Passwort', r.ok && r.username === 'leon-k', JSON.stringify(r));
r = await call(`sh_login_net('tokB', 'Mias Netz', 'leon-k', 'pw1234')`);
ok('5  das alte Passwort geht weiter', r.ok, JSON.stringify(r));
await as(M1);
r = await call(`sh_mps_link('tokB', null, $1, $2)`, [HUB, SL]);
ok('5  fremd verknüpftes Konto → mps_other', r.error === 'mps_other', JSON.stringify(r));

/* 4  gesperrt */
await db.query(`update sh_hubs set locked = true where id = $1`, [HUB]);
r = await call(`sh_login_mps('tokA', null, $1)`, [HUB]);
ok('4  gesperrtes Netzwerk → hub_locked', r.error === 'hub_locked', JSON.stringify(r));
r = await call(`sh_mps_me('tokA', null)`);
ok('4  … und taucht in nets nicht auf', r.nets.length === 0, JSON.stringify(r));
await db.query(`update sh_hubs set locked = false where id = $1`, [HUB]);

/* 6  Konto gelöscht */
await db.query(`delete from auth.users where id = $1`, [M2]);
u = await one(`select mps_user from sh_users where hub_id = $1 and username = 'leon-k'`, [HUB]);
ok('6  MPSkills-Konto gelöscht → Verknüpfung weg, Netzwerk-Konto bleibt', u && u.mps_user === null, JSON.stringify(u));

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
