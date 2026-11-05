/* Prüfstand für Migration 0275 — YourSozialNet: das Klassen-Netz als App.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Nur Klassen-Netze haben einen Schlüssel (32 Hex); im Raum steht er in hub.app_key.
     2. sh_app_info liefert Name/Logo/Schalter nur mit dem richtigen Schlüssel.
     3. Über die Adresse ('app:<schlüssel>'): anmelden ja, registrieren nein,
        nur dieses eine Netzwerk; Sitzung aus dem Raum gilt dort auch.
     4. Bremse: nach 30 Fehlversuchen in 10 Minuten 'busy'.
     5. Gesperrt / Raum abgelaufen gilt auch dort; Migration zweimal.

   Aufruf:  node supabase/tests/0275_yoursozialnet_app.mjs */
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

const T1 = 'e0000000-0000-4000-8000-0000000000e1';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T1]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 't1', 'T1', 'active', 'approved', true)`, [T1, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const PNG = Buffer.from('fakewebp').toString('base64');

await as(T1);
let r = await call(`skill_room_create('socialhub', 'Info 9', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
r = await call(`skill_room_create('socialhub', 'Info 10', false, '{}'::jsonb)`);
const CODE2 = r.code;
const ROOM2 = (await one(`select id from skill_rooms where code = $1`, [CODE2])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values
  ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon'), ($2, 'tokX', 1, 'Fremd')`, [ROOM, ROOM2]);


await as(T1);
r = await call(`sh_found(null, 'Klasse 9b', 'mesh', null, 'auto', $1, true)`, [CODE]);
const CLS = r.hub;
r = await call(`sh_found(null, 'Mein Netz', 'rocket', null, 'auto', $1)`, [CODE]);
const OWN = r.hub;
await call(`sh_register(null, $1, 'lehrer', 'geheim1', 'Frau T', null, null, null, null, null, null, null, $2)`, [CLS, CODE]);
r = await call(`sh_found(null, 'Klasse 10', 'bell', null, 'auto', $1, true)`, [CODE2]);
const CLS2 = r.hub;

/* 1  Schlüssel */
const KEY = (await one(`select app_key from sh_hubs where id = $1`, [CLS])).app_key;
const KEY2 = (await one(`select app_key from sh_hubs where id = $1`, [CLS2])).app_key;
ok('1  Klassen-Netz hat einen Schlüssel (32 Hex), eigenes Netzwerk nicht',
   /^[0-9a-f]{32}$/.test(KEY) && KEY !== KEY2 && (await one(`select app_key from sh_hubs where id = $1`, [OWN])).app_key === null);
await as(null);
r = await call(`sh_home('tokA')`);
ok('1  Schüler im Raum bekommt den Schlüssel mit', r.ok && r.hubs[0].app_key === KEY, JSON.stringify(r.hubs[0]));

/* 2  sh_app_info */
r = await call(`sh_app_info($1)`, [KEY]);
ok('2  sh_app_info: Name, Logo, Schalter', r.ok && r.hub.id === CLS && r.hub.name === 'Klasse 9b' && r.hub.logo === 'mesh' && r.state && r.state.upload === true && r.state.reveal === false, JSON.stringify(r));
r = await call(`sh_app_info($1)`, ['0'.repeat(32)]);
ok('2  falscher Schlüssel → app_not_found', r.error === 'app_not_found', JSON.stringify(r));
r = await call(`sh_app_info($1)`, ["' or 1=1 --"]);
ok('2  Unsinn → app_not_found', r.error === 'app_not_found', JSON.stringify(r));

/* 3  über die Adresse */
const APP = 'app:' + KEY;
r = await call(`sh_enter($1, null, $2, null)`, [APP, CLS]);
ok('3  App-Adresse: hinein ohne Raum, nicht angemeldet, nicht Admin, alle Tabellen',
   r.ok && r.me === null && !r.admin && !r.teacher && !r.founder && r.tables.includes('views'), JSON.stringify(r));
r = await call(`sh_enter($1, null, $2, null)`, [APP, OWN]);
ok('3  … aber nur in dieses eine Netzwerk', r.error === 'hub_not_found', JSON.stringify(r));
r = await call(`sh_enter($1, null, $2, null)`, ['app:' + '0'.repeat(32), CLS]);
ok('3  falscher Schlüssel → app_not_found', r.error === 'app_not_found', JSON.stringify(r));
r = await call(`sh_register($1, $2, 'fremd', 'pw1234')`, [APP, CLS]);
ok('3  Registrieren über die Adresse → register_in_room', r.error === 'register_in_room', JSON.stringify(r));
r = await call(`sh_register('tokA', $1, 'mia', 'pw1234', 'Mia')`, [CLS]);
ok('3  im Raum registrieren geht', r.ok, JSON.stringify(r));
const SROOM = r.session;
r = await call(`sh_enter($1, null, $2, $3)`, [APP, CLS, SROOM]);
ok('3  Sitzung aus dem Raum gilt auch über die Adresse', r.ok && r.me && r.me.username === 'mia', JSON.stringify(r).slice(0, 200));
r = await call(`sh_login($1, $2, 'mia', 'falsch')`, [APP, CLS]);
ok('3  falsches Passwort → wrong_login', r.error === 'wrong_login', JSON.stringify(r));
r = await call(`sh_login($1, $2, 'mia', 'pw1234')`, [APP, CLS]);
ok('3  Anmelden über die Adresse', r.ok && r.session, JSON.stringify(r));
const SAPP = r.session;
const row = await one(`select participant_id, teacher_id from sh_sessions where token = $1`, [SAPP]);
ok('3  Sitzung hängt an keinem Gerät', row.participant_id === null && row.teacher_id === null);
r = await call(`sh_enter($1, null, $2, $3)`, [APP, CLS, SAPP]);
ok('3  angemeldet über die Adresse', r.ok && r.me.username === 'mia' && !r.admin, JSON.stringify(r).slice(0, 200));
r = await call(`sh_media_put($1, $2, $3, $4, $4, 'image/webp')`, [APP, CLS, SAPP, PNG]);
ok('3  Bild hochladen', r.ok, JSON.stringify(r));
r = await call(`sh_photo_post($1, $2, $3, $4, 'Aus der App', '["app"]'::jsonb)`, [APP, CLS, SAPP, r.name]);
ok('3  Foto posten', r.ok, JSON.stringify(r));
r = await call(`sh_like($1, $2, $3, 1, true)`, [APP, CLS, SAPP]);
ok('3  liken', r.ok, JSON.stringify(r));
r = await call(`sh_track($1, $2, $3, null, '{"os":"Android"}'::jsonb, null, '[]'::jsonb, false, null, null)`, [APP, CLS, SAPP]);
ok('3  Analytics laufen auch in der App', r.ok && r.tracked === true, JSON.stringify(r));
r = await call(`sh_enter('tokB', null, $1, $2)`, [CLS, SAPP]);
ok('3  App-Sitzung gilt im Raum auf einem anderen Gerät nicht', r.ok && r.me === null, JSON.stringify(r).slice(0, 120));
r = await call(`sh_db_snapshot($1, null, $2, $3)`, [APP, CLS, SAPP]);
ok('3  normaler User: kein Schnappschuss über die Adresse', r.error === 'not_admin', JSON.stringify(r).slice(0, 120));
r = await call(`sh_home($1)`, [APP]);
ok('3  sh_home über die Adresse verrät keine anderen Netzwerke', r.ok === false || (r.hubs.every(h => h.id === CLS)), JSON.stringify(r).slice(0, 200));
r = await call(`sh_logout($1, $2, $3)`, [APP, CLS, SAPP]);
r = await call(`sh_enter($1, null, $2, $3)`, [APP, CLS, SAPP]);
ok('3  Abmelden über die Adresse', r.ok && r.me === null);

/* 4  Bremse */
for (let i = 0; i < 30; i++) await call(`sh_login($1, $2, 'mia', 'x' || $3)`, [APP, CLS, String(i)]);
r = await call(`sh_login($1, $2, 'mia', 'pw1234')`, [APP, CLS]);
ok('4  nach 30 Fehlversuchen → busy (auch mit richtigem Passwort)', r.error === 'busy', JSON.stringify(r));
r = await call(`sh_login('tokA', $1, 'mia', 'pw1234')`, [CLS]);
ok('4  im Raum geht es trotzdem', r.ok, JSON.stringify(r));
await db.query(`update sh_hubs set app_fail_since = now() - interval '11 minutes' where id = $1`, [CLS]);
r = await call(`sh_login($1, $2, 'mia', 'pw1234')`, [APP, CLS]);
ok('4  nach 10 Minuten wieder offen', r.ok, JSON.stringify(r));

/* 5  gesperrt, abgelaufen, zweimal */
await as(T1);
await call(`sh_hub_lock($1, $2, true)`, [CODE, CLS]);
await as(null);
r = await call(`sh_enter($1, null, $2, null)`, [APP, CLS]);
ok('5  gesperrt → hub_locked', r.error === 'hub_locked', JSON.stringify(r));
r = await call(`sh_app_info($1)`, [KEY]);
ok('5  sh_app_info meldet gesperrt', r.ok && r.hub.locked === true);
await db.query(`update skill_rooms set expires_at = now() - interval '1 minute' where id = $1`, [ROOM]);
r = await call(`sh_enter($1, null, $2, null)`, [APP, CLS]);
ok('5  Raum abgelaufen → room_gone', r.error === 'room_gone', JSON.stringify(r));
r = await call(`sh_app_info($1)`, [KEY]);
ok('5  sh_app_info: room_gone', r.error === 'room_gone', JSON.stringify(r));
let twice = true;
try { await db.exec(mig('0274_yoursozialnet_klassennetz.sql')); await db.exec(mig('0275_yoursozialnet_app.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('5  Migrationen 0274/0275 laufen ein zweites Mal durch', twice);
ok('5  Schlüssel bleibt beim zweiten Lauf', (await one(`select app_key from sh_hubs where id = $1`, [CLS])).app_key === KEY);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
