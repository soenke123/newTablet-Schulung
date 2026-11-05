/* Prüfstand für Migration 0274 — YourSozialNet: das Klassen-Netz.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Nur die Lehrkraft erstellt es, eins je Raum; ihr eigenes Netzwerk geht trotzdem.
     2. Jeder Schüler des Raums sieht es und kann sich registrieren (normaler User);
        wer nicht im Raum ist, kommt nicht hinein.
     3. Es hat immer alle Tabellen – die eigenen Netzwerke bleiben bei data.tables.
     4. Keine Dummy-Daten: weder beim Anlegen noch über sh_dummy_load.
     5. Lehrkraft-Admin, Rolle per SQL, Raum weg → weg, Migration zweimal.

   Aufruf:  node supabase/tests/0274_yoursozialnet_klassennetz.mjs */
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

/* 1  Erstellen */
await as(null);
r = await call(`sh_found('tokA', 'Klasse 9b', 'mesh', null, 'auto', null, true)`);
ok('1  Schüler erstellt kein Klassen-Netz', r.error === 'not_allowed', JSON.stringify(r));
await as(T1);
r = await call(`sh_found(null, 'Klasse 9b', 'mesh', null, 'auto', $1, true)`, [CODE]);
ok('1  Lehrkraft erstellt das Klassen-Netz', r.ok && r.hub, JSON.stringify(r));
const CLS = r.hub;
r = await call(`sh_found(null, 'Noch eins', 'bell', null, 'auto', $1, true)`, [CODE]);
ok('1  zweites Klassen-Netz im Raum → already_founded', r.error === 'already_founded', JSON.stringify(r));
r = await call(`sh_found(null, 'Mein Netz', 'rocket', null, 'auto', $1)`, [CODE]);
ok('1  eigenes Netzwerk der Lehrkraft geht trotzdem', r.ok, JSON.stringify(r));
const OWN = r.hub;
r = await call(`sh_found(null, 'Mein Zweites', 'rocket', null, 'auto', $1)`, [CODE]);
ok('1  zweites eigenes → already_founded', r.error === 'already_founded', JSON.stringify(r));
r = await call(`sh_home(null, $1)`, [CODE]);
ok('1  Lehrkraft-Start: mine = eigenes, class = Klassen-Netz, Liste mit „Klassen-Netz“',
   r.ok && r.mine === OWN && r.class === CLS && r.hubs.length === 2 && r.hubs[0].id === OWN
   && r.hubs[1].id === CLS && r.hubs[1].class === true && r.hubs[1].person === 'Klassen-Netz' && r.hubs[1].mine === false, JSON.stringify(r));
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, CLS]);
ok('1  Lehrkraft: Gründerin ohne Konto → needs_admin', r.ok && r.founder && r.needs_admin && r.hub.class === true, JSON.stringify(r));
r = await call(`sh_register(null, $1, 'lehrer', 'geheim1', 'Frau T', null, null, null, null, null, null, null, $2)`, [CLS, CODE]);
ok('1  erstes Konto der Lehrkraft wird Admin', r.ok && r.admin === true, JSON.stringify(r));
r = await call(`sh_enter(null, $1, $2, null)`, [CODE, CLS]);
ok('1  Lehrkraft bleibt angemeldet (Sitzung von selbst)', r.ok && r.me && r.me.username === 'lehrer' && r.session, JSON.stringify(r));

/* 2  Schüler */
await as(null);
r = await call(`sh_home('tokA')`);
ok('2  Schüler sieht das Klassen-Netz, mine bleibt leer', r.ok && r.class === CLS && r.mine === null && r.hubs.length === 1 && r.hubs[0].id === CLS && r.hubs[0].class === true, JSON.stringify(r));
r = await call(`sh_enter('tokA', null, $1, null)`, [CLS]);
ok('2  Schüler darf hinein (kein hub_private), ist nicht Admin',
   r.ok && !r.admin && !r.founder && r.me === null, JSON.stringify(r));
ok('2  … und sieht alle Tabellen, obwohl im Raum keine erstellt ist',
   ['photos', 'follows', 'likes', 'comments', 'tags', 'photo_tag', 'sessions', 'views'].every(t => r.tables.includes(t)) && !r.tables.includes('comment_likes'), JSON.stringify(r.tables));
r = await call(`sh_register('tokA', $1, 'mia', 'pw1234', 'Mia')`, [CLS]);
ok('2  Schüler registriert sich als normaler User', r.ok && r.admin === false, JSON.stringify(r));
const SA = r.session;
r = await call(`sh_register('tokB', $1, 'leon', 'pw1234', 'Leon')`, [CLS]);
ok('2  zweiter Schüler auch', r.ok && r.admin === false, JSON.stringify(r));
const SB = r.session;
r = await call(`sh_register('tokB', $1, 'mia', 'pw1234')`, [CLS]);
ok('2  Benutzername vergeben → username_taken', r.error === 'username_taken', JSON.stringify(r));
r = await call(`sh_login('tokB', $1, 'mia', 'pw1234')`, [CLS]);
ok('2  Anmelden mit fremdem Konto auf anderem Gerät geht (wie echte Plattform)', r.ok, JSON.stringify(r));
r = await call(`sh_enter('tokX', null, $1, null)`, [CLS]);
ok('2  Schüler aus einem anderen Raum kommt nicht hinein', r.error === 'hub_not_found', JSON.stringify(r));
r = await call(`sh_home('tokX')`);
ok('2  … und sieht es nicht', r.ok && r.class === null && r.hubs.length === 0, JSON.stringify(r));
r = await call(`sh_enter('tokA', null, $1, null)`, [OWN]);
ok('2  eigenes Netzwerk der Lehrkraft bleibt privat', r.error === 'hub_private', JSON.stringify(r));

/* 3  alle Tabellen nur im Klassen-Netz */
r = await call(`sh_media_put('tokA', $1, $2, $3, $3, 'image/webp')`, [CLS, SA, PNG]);
ok('3  Bild hochladen', r.ok, JSON.stringify(r));
r = await call(`sh_photo_post('tokA', $1, $2, $3, 'Pause!', '["schule"]'::jsonb)`, [CLS, SA, r.name]);
ok('3  Foto posten ohne erstellte Tabelle im Raum', r.ok, JSON.stringify(r));
const PH = r.id ?? 1;
r = await call(`sh_like('tokB', $1, $2, $3, true, 'laugh')`, [CLS, SB, PH]);
ok('3  liken', r.ok, JSON.stringify(r));
r = await call(`sh_comment_add('tokB', $1, $2, $3, 'Cool')`, [CLS, SB, PH]);
ok('3  kommentieren', r.ok, JSON.stringify(r));
r = await call(`sh_follow('tokB', $1, $2, 1, true)`, [CLS, SB]);
ok('3  folgen', r.ok, JSON.stringify(r));
r = await call(`sh_track('tokA', $1, $2, null, '{"os":"iOS"}'::jsonb, null, '[]'::jsonb, false, null, null)`, [CLS, SA]).catch(e => ({ error: e.message }));
ok('3  Analytics laufen mit (sessions)', r.ok && r.tracked === true, JSON.stringify(r));
r = await call(`sh_feed('tokA', null, $1, $2, 'foryou')`, [CLS, SA]).catch(e => ({ error: e.message }));
ok('3  Feed zeigt das Foto mit Likes, Kommentaren und Tags', r.ok && r.items.length === 1 && r.items[0].likes === 1 && r.items[0].comments === 1 && r.items[0].tags.length === 1, JSON.stringify(r).slice(0, 300));
r = await call(`sh_found('tokA', 'Mias Netz', 'bell')`);
ok('3  Schüler erstellt sein eigenes Netzwerk daneben', r.ok, JSON.stringify(r));
const MIA = r.hub;
r = await call(`sh_register('tokA', $1, 'admin', 'pw1234')`, [MIA]);
const SM = r.session;
r = await call(`sh_enter('tokA', null, $1, $2)`, [MIA, SM]);
ok('3  eigenes Netzwerk: nur die Tabellen des Raums (users)', r.ok && r.tables.join() === 'users', JSON.stringify(r.tables));
r = await call(`sh_photo_post('tokA', $1, $2, 'img_1.webp', 'x', '[]'::jsonb)`, [MIA, SM]);
ok('3  … dort kein Posten → table_off', r.error === 'table_off', JSON.stringify(r));
r = await call(`sh_home('tokA')`);
ok('3  Schüler-Start: eigenes vorn, Klassen-Netz dahinter', r.ok && r.mine === MIA && r.class === CLS && r.hubs.length === 2 && r.hubs[0].id === MIA && r.hubs[1].id === CLS, JSON.stringify(r));

/* 4  Datenbank im Klassen-Netz */
r = await call(`sh_db_snapshot('tokA', null, $1, $2)`, [CLS, SA]);
ok('4  normaler User: kein Schnappschuss', r.ok === false, JSON.stringify(r).slice(0, 200));
await as(T1);
const ST = (await call(`sh_enter(null, $1, $2, null)`, [CODE, CLS])).session;
r = await call(`sh_db_snapshot(null, $1, $2, $3)`, [CODE, CLS, ST]);
ok('4  Lehrkraft: Schnappschuss mit allen Tabellen', r.ok && ['users', 'photos', 'likes', 'comments', 'follows', 'tags', 'photo_tag', 'sessions', 'views'].every(t => r.tables && r.tables[t]), JSON.stringify(Object.keys(r.tables || {})));
r = await call(`sh_db_apply(null, $1, $2, $3, $4::jsonb)`, [CODE, CLS, ST,
  JSON.stringify([2, 3].map(id => ({ t: 'users', op: 'update', key: { id }, row: { id, role: 'admin' } })))]);
ok('4  UPDATE users SET role = admin (über sh_db_apply)', r.ok, JSON.stringify(r));
await as(null);
r = await call(`sh_enter('tokA', null, $1, $2)`, [CLS, SA]);
ok('4  danach ist der Schüler Admin', r.ok && r.admin === true && r.me.role === 'admin', JSON.stringify(r).slice(0, 200));

/* 5  Dummy-Daten bleiben draußen */
{
  new Function(readFileSync(`${REPO}/MPSkills/tools/SocialHub/dummy/daten.js`, 'utf8'))();
  new Function(readFileSync(`${REPO}/MPSkills/tools/SocialHub/dummy/generator.js`, 'utf8'))();
  const G = globalThis.SHDummy;
  await as(T1);
  r = await call(`sh_dummy_status($1)`, [CODE2]);
  const D = G.build({ stichtag: r.stichtag, netz: '{netz}' });
  r = await call(`sh_dummy_put($1, 'users', $2::jsonb, $3::jsonb)`, [CODE2, JSON.stringify(D.users.cols), JSON.stringify(D.users.rows)]);
  ok('5  Beispiel-User für Raum 2 gespeichert', r.ok, JSON.stringify(r));
  r = await call(`sh_found(null, 'Klasse 10a', 'like', null, 'auto', $1, true)`, [CODE2]);
  const C2 = r.hub;
  r = await call(`sh_found(null, 'Mein Netz 2', 'bell', null, 'auto', $1)`, [CODE2]);
  const O2 = r.hub;
  const cnt = async h => Number((await one(`select count(*) n from sh_users where hub_id = $1`, [h])).n);
  ok('5  neues eigenes Netzwerk bekommt die Beispiel-User, das Klassen-Netz nicht', (await cnt(O2)) === D.users.rows.length && (await cnt(C2)) === 0, `${await cnt(O2)} / ${await cnt(C2)}`);
  r = await call(`sh_dummy_load($1, 'users', $2)`, [CODE2, C2]);
  ok('5  sh_dummy_load füllt das Klassen-Netz nicht', r.ok && r.rows === 0 && (await cnt(C2)) === 0, JSON.stringify(r));
  r = await call(`sh_dummy_status($1)`, [CODE2]);
  ok('5  Status zählt das Klassen-Netz nicht mit', r.ok && r.hubs[O2] && !(C2 in r.hubs), JSON.stringify(r.hubs));
}

/* 6  Sperren, Raum weg, zweimal */
await as(T1);
r = await call(`sh_hub_lock($1, $2, true)`, [CODE, CLS]);
ok("6  Lehrkraft sperrt das Klassen-Netz", r.ok, JSON.stringify(r));
await as(null);
r = await call(`sh_enter('tokB', null, $1, $2)`, [CLS, SB]);
ok('6  gesperrt → Schüler draußen', r.error === 'hub_locked', JSON.stringify(r));
await db.query(`delete from skill_rooms where id in ($1, $2)`, [ROOM, ROOM2]);
ok('6  Raum weg → Klassen-Netz weg', Number((await one(`select count(*) n from sh_hubs`)).n) === 0);
let twice = true;
try { await db.exec(mig('0274_yoursozialnet_klassennetz.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('6  Migration 0274 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
