/* Prüfstand für Migration 0280 — YourSozialNet: SQL-Befehle speichern und teilen.

   Die Kernzusagen:
     1. Angemeldetes Konto speichert, ändert, sortiert, löscht eigene Befehle.
     2. Befehle hängen am Konto: andere Konten sehen sie nicht, anderes
        Gerät nach Anmelden schon; ohne Anmeldung → not_logged_in.
     3. Teilen = Kopie in den Posteingang des Raums mit dem Namen beim
        Beitreten („Mia“); Ändern/Löschen des Originals ändert die Kopie nicht.
     4. Lehrkraft hat eigene Befehle (je Raum, über alle Netzwerke) und den
        Posteingang, darf ihn leeren; Schüler sehen keinen Posteingang,
        dürfen ihn nicht löschen; Lehrkraft teilt nicht.
     5. Grenzen: leerer Befehl, zu lang, Blacklist in der Aufgabe.
     6. Mit dem Konto bzw. dem Raum gehen die Befehle weg.

   Aufruf:  node supabase/tests/0280_yoursozialnet_befehle.mjs */
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
const HUB2 = (await call(`sh_found('tokB', 'Leons Netz', 'rocket')`)).hub;
const SL = (await call(`sh_register('tokB', $1, 'admin', 'pw1234', 'Leon')`, [HUB2])).session;
const cmd = (fn, tok, hub, ses, rest = '', params = []) =>
  call(`${fn}(${tok ? `'${tok}'` : 'null'}, null, '${hub}', ${ses ? `'${ses}'` : 'null'}${rest})`, params);

/* 1  eigene Befehle */
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, 'Aufgabe 1a', 'SELECT * FROM users;'`);
ok('1  speichern', r.ok && r.item.task === 'Aufgabe 1a' && r.item.sql === 'SELECT * FROM users;', JSON.stringify(r));
const C1 = r.item.id;
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, '  Aufgabe 1b ', E'SELECT name\\nFROM users;\\n\\n'`);
const C2 = r.item.id;
ok('1  Aufgabe getrimmt, Befehl ohne Leerzeilen am Ende', r.item.task === 'Aufgabe 1b' && r.item.sql === 'SELECT name\nFROM users;', JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, '', 'SELECT 3;'`);
const C3 = r.item.id;
ok('1  ohne Aufgabe geht auch', r.ok && r.item.task === '', JSON.stringify(r));
r = await cmd('sh_cmd_list', 'tokA', HUB, SA);
ok('1  Liste in Speicher-Reihenfolge, kein Posteingang', r.ok && r.own.map(x => x.id).join() === [C1, C2, C3].join() && r.inbox === null && r.teacher === false, JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, ${C1}, 'Aufgabe 1a (neu)', 'SELECT id FROM users;'`);
ok('1  ändern', r.ok && r.item.id === C1 && r.item.task === 'Aufgabe 1a (neu)', JSON.stringify(r));
r = await cmd('sh_cmd_order', 'tokA', HUB, SA, `, $1::jsonb`, [JSON.stringify([C3, C1, C2])]);
r = await cmd('sh_cmd_list', 'tokA', HUB, SA);
ok('1  sortieren', r.own.map(x => x.id).join() === [C3, C1, C2].join(), JSON.stringify(r.own.map(x => x.id)));
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, 'Neu', 'SELECT 4;'`);
const C4 = r.item.id;
r = await cmd('sh_cmd_list', 'tokA', HUB, SA);
ok('1  Neuer kommt ans Ende', r.own.at(-1).id === C4, JSON.stringify(r.own.map(x => x.id)));
r = await cmd('sh_cmd_delete', 'tokA', HUB, SA, `, ${C4}`);
ok('1  löschen', r.ok && (await cmd('sh_cmd_list', 'tokA', HUB, SA)).own.length === 3, JSON.stringify(r));
r = await cmd('sh_cmd_order', 'tokA', HUB, SA, `, $1::jsonb`, [JSON.stringify(['x'])]);
ok('1  Reihenfolge nur mit Zahlen', r.error === 'invalid_input', JSON.stringify(r));

/* 2  am Konto */
r = await cmd('sh_cmd_list', 'tokA', HUB, SB);
ok('2  anderes Konto sieht nichts', r.ok && r.own.length === 0, JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokA', HUB, SB, `, ${C1}, 'x', 'SELECT 1;'`);
ok('2  fremden Befehl ändern → not_found', r.error === 'not_found', JSON.stringify(r));
r = await cmd('sh_cmd_delete', 'tokA', HUB, SB, `, ${C1}`);
ok('2  fremden Befehl löschen → not_found', r.error === 'not_found', JSON.stringify(r));
r = await cmd('sh_cmd_list', 'tokA', HUB, null);
ok('2  ohne Anmeldung → not_logged_in', r.error === 'not_logged_in', JSON.stringify(r));
r = await cmd('sh_cmd_list', 'tokB', HUB, null);
ok('2  fremdes Gerät ohne Sitzung → hub_private', r.error === 'hub_private', JSON.stringify(r));
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA2', 3, 'Mia')`, [ROOM]);
const SA3 = (await call(`sh_login_net('tokA2', 'Mias Netz', 'admin', 'pw1234')`)).session;
r = await cmd('sh_cmd_list', 'tokA2', HUB, SA3);
ok('2  anderes Tablet, gleiches Konto: Befehle sind da', r.ok && r.own.length === 3, JSON.stringify(r));

/* 3  teilen */
r = await cmd('sh_cmd_share', 'tokA', HUB, SA, `, ${C2}`);
ok('3  teilen', r.ok, JSON.stringify(r));
r = await cmd('sh_cmd_share', 'tokA', HUB, SB, `, ${C2}`);
ok('3  fremden Befehl teilen → not_found', r.error === 'not_found', JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokB', HUB2, SL, `, null, 'Aufgabe 1b', 'SELECT username FROM users;'`);
r = await cmd('sh_cmd_share', 'tokB', HUB2, SL, `, ${r.item.id}`);
ok('3  zweiter Schüler teilt', r.ok, JSON.stringify(r));
await cmd('sh_cmd_save', 'tokA', HUB, SA, `, ${C2}, 'geändert', 'SELECT 0;'`);

/* 4  Lehrkraft */
await as(T1);
const tcmd = (fn, hub, rest = '', params = []) => call(`${fn}(null, '${CODE}', '${hub}', null${rest})`, params);
r = await tcmd('sh_cmd_list', HUB);
ok('4  Lehrkraft: Posteingang mit zwei Kopien, neueste zuerst', r.ok && r.teacher && r.inbox.length === 2 && r.inbox[0].from === 'Leon' && r.inbox[1].from === 'Mia', JSON.stringify(r.inbox));
ok('4  Kopie bleibt wie beim Teilen', r.inbox[1].task === 'Aufgabe 1b' && r.inbox[1].sql === 'SELECT name\nFROM users;' && r.inbox[1].hub === 'Mias Netz' && r.inbox[1].username === 'admin', JSON.stringify(r.inbox[1]));
ok('4  Lehrkraft: eigene Liste leer (nicht die der Schüler)', r.own.length === 0, JSON.stringify(r.own));
r = await tcmd('sh_cmd_save', HUB, `, null, 'Musterlösung 1a', 'SELECT * FROM users;'`);
ok('4  Lehrkraft speichert', r.ok, JSON.stringify(r));
const TC = r.item.id;
r = await tcmd('sh_cmd_list', HUB2);
ok('4  … und sieht ihn auch in einem anderen Netzwerk des Raums', r.own.length === 1 && r.own[0].id === TC, JSON.stringify(r.own));
r = await tcmd('sh_cmd_share', HUB, `, ${TC}`);
ok('4  Lehrkraft teilt nicht → forbidden', r.error === 'forbidden', JSON.stringify(r));
const IN = (await tcmd('sh_cmd_list', HUB)).inbox;
r = await tcmd('sh_cmd_inbox_delete', HUB, `, ${IN[0].id}`);
ok('4  Lehrkraft löscht eine Kopie', r.ok && (await tcmd('sh_cmd_list', HUB)).inbox.length === 1, JSON.stringify(r));
await as(null);
r = await cmd('sh_cmd_inbox_delete', 'tokA', HUB, SA, `, ${IN[1].id}`);
ok('4  Schüler darf den Posteingang nicht leeren', r.error === 'forbidden', JSON.stringify(r));
r = await cmd('sh_cmd_list', 'tokA', HUB, SA);
ok('4  Schüler sieht keinen Posteingang', r.inbox === null && !r.own.some(x => x.id === TC), JSON.stringify(r));
await as(T1);
r = await tcmd('sh_cmd_inbox_delete', HUB);
ok('4  „alle löschen“', r.ok && r.deleted === 1 && (await tcmd('sh_cmd_list', HUB)).inbox.length === 0, JSON.stringify(r));
await as(null);

/* 5  Grenzen */
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, 'leer', '   '`);
ok('5  leerer Befehl → invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, repeat('a', 61), 'SELECT 1;'`);
ok('5  Aufgabe zu lang → invalid_input', r.error === 'invalid_input', JSON.stringify(r));
r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, 'x', repeat('a', 4001)`);
ok('5  Befehl zu lang → invalid_input', r.error === 'invalid_input', JSON.stringify(r));
const BAD = (await one(`select word from blacklist_words limit 1`).catch(() => null))?.word;
if (BAD) {
  r = await cmd('sh_cmd_save', 'tokA', HUB, SA, `, null, $1, 'SELECT 1;'`, ['Aufgabe ' + BAD]);
  ok('5  Blacklist in der Aufgabe', r.error === 'blacklisted', JSON.stringify(r));
} else ok('5  Blacklist (keine Wörter im Prüfstand)', true);

/* 6  geht mit Konto und Raum */
await db.query(`delete from sh_users where hub_id = $1 and username = 'admin'`, [HUB]);
ok('6  Konto gelöscht → seine Befehle weg', (await one(`select count(*)::int n from sh_cmds where hub_id = $1`, [HUB])).n === 0);
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('6  Raum gelöscht → alles weg', (await one(`select (select count(*) from sh_cmds) + (select count(*) from sh_cmd_inbox) n`)).n == 0);

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
