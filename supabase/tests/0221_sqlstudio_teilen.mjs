/* Prüfstand für Migration 0221 — SQL Studio, Etappe 2 (Teilen, Rechte, Kopien).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0221.

   Die Kernzusagen:
     1. Lehrkraft: eigene Datenbanken anlegen, listen, holen, umbenennen,
        löschen; Name je Person eindeutig; Schüler kommen nicht heran.
     2. Teilnehmer holt eine Datenbank der Lehrkraft nur, wenn sie in
        DIESEM Raum geteilt ist und einer Lehrkraft DIESES Raums gehört.
     3. Kopie speichern nur, solange geteilt; eigene (own:) nur mit create.
     4. Nach dem Entziehen: kein Speichern, kein Holen; geteilt wieder → Arbeit da.
     5. Lehrkraft sieht die Kopien der Klasse, eine fremde Lehrkraft nicht.
     6. Raum weg → Kopien weg. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0221_sqlstudio_teilen.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
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



const T1 = 'e0000000-0000-4000-8000-0000000000c1';  // Lehrkraft (Raumbesitzerin)
const T2 = 'e0000000-0000-4000-8000-0000000000c2';  // andere Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, T2]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 't1', 'T1', 'active', 'approved', true),
                       ($2, $3, 't2', 'T2', 'active', 'approved', true)`, [T1, T2, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const B64 = s => Buffer.from(s).toString('base64');

/* 1 */
await as(T1);
let r = await call(`sql_db_save(null, null, 'kino', $1, null)`, [B64('SQLite format 3\0 kino')]);
ok('1  anlegen', r.ok && r.created, JSON.stringify(r));
const KINO = r.id;
r = await call(`sql_db_save(null, null, 'KINO', $1, null)`, [B64('x')]);
ok('1  gleicher Name (Groß/klein) → name_taken', r.error === 'name_taken');
r = await call(`sql_db_save(null, null, 'mit leer', $1, null)`, [B64('x')]);
ok('1  ungültiger Name → invalid_name', r.error === 'invalid_name');
r = await call(`sql_db_save(null, null, 'kaputt', 'nicht base64 !!', null)`);
ok('1  kaputtes Base64 → invalid_input', r.error === 'invalid_input');
r = await call(`sql_db_save(null, $1, 'kino2', null, '{"pos":{}}'::jsonb)`, [KINO]);
ok('1  umbenennen ohne Inhalt', r.ok && !r.created);
r = await call(`sql_db_get(null, $1)`, [KINO]);
ok('1  holen: Name neu, Inhalt alt, Lage da', r.ok && r.name === 'kino2' && Buffer.from(r.content, 'base64').toString().endsWith('kino') && r.layout.pos);
r = await call(`sql_dbs_list(null)`);
ok('1  Liste', r.ok && r.items.length === 1 && r.items[0].size > 0);
await as(T2);
r = await call(`sql_db_get(null, $1)`, [KINO]);
ok('1  fremde Lehrkraft → not_found', r.error === 'not_found');
r = await call(`sql_db_save(null, null, 'fremd', $1, null)`, [B64('fremd')]);
const FREMD = r.id;

/* Raum + Teilnehmer */
await as(T1);
r = await call(`skill_room_create('sqlstudio', 'Info 10', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
const setData = async (d) => { await as(T1); return call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify(d)]); };

/* 2 */
await as(null);
r = await call(`sql_shared_get('tokA', $1)`, [KINO]);
ok('2  nicht geteilt → not_shared', r.error === 'not_shared');
r = await setData({ shared: [{ id: KINO, t: 'Kino', r: 'use' }, { id: FREMD, t: 'Fremd', r: 'use' }, { id: 'builtin:schule', t: 'Schule', r: 'modify' }] });
ok('2  teilen über skill_room_set_state', r.ok, JSON.stringify(r));
await as(null);
r = await call(`sql_shared_get('tokA', $1)`, [KINO]);
ok('2  geteilt → Inhalt kommt', r.ok && Buffer.from(r.content, 'base64').toString().endsWith('kino'));
r = await call(`sql_shared_get('tokA', $1)`, [FREMD]);
ok('2  geteilt, aber Datenbank einer fremden Lehrkraft → not_found', r.error === 'not_found');
r = await call(`sql_shared_get('falsch', $1)`, [KINO]);
ok('2  falscher Token → unknown_token', r.error === 'unknown_token');
r = await call(`sql_db_get(null, $1)`, [KINO]);
ok('2  Schüler ohne Anmeldung an sql_db_get → not_authenticated', r.error === 'not_authenticated');

/* 3 */
r = await call(`sql_mine_put('tokA', 'builtin:schule', 'Schule', $1)`, [B64('mia-schule')]);
ok('3  Kopie einer geteilten Vorlage speichern', r.ok, JSON.stringify(r));
r = await call(`sql_mine_put('tokA', $1, 'Kino', $2)`, [KINO, B64('mia-kino')]);
ok('3  Kopie einer geteilten Lehrkraft-Datenbank speichern', r.ok);
r = await call(`sql_mine_put('tokA', 'builtin:shop', 'Shop', $1)`, [B64('x')]);
ok('3  nicht geteilt → not_shared', r.error === 'not_shared');
r = await call(`sql_mine_put('tokA', 'own:abc123', 'meine', $1)`, [B64('own')]);
ok('3  eigene ohne create → create_off', r.error === 'create_off');
await setData({ shared: [{ id: KINO, t: 'Kino', r: 'use' }, { id: 'builtin:schule', t: 'Schule', r: 'modify' }], create: true });
await as(null);
r = await call(`sql_mine_put('tokA', 'own:abc123', 'meine', $1)`, [B64('own')]);
ok('3  eigene mit create', r.ok);
r = await call(`sql_mine_put('tokA', 'own:abc124', 'mit leer', $1)`, [B64('own')]);
ok('3  eigene mit ungültigem Namen → invalid_name', r.error === 'invalid_name');
r = await call(`sql_mine_put('tokA', 'drop table x', 'x', $1)`, [B64('own')]);
ok('3  Unsinn als Schlüssel → invalid_input', r.error === 'invalid_input');
r = await call(`sql_mine_list('tokA')`);
ok('3  eigene Liste: drei Kopien', r.ok && r.items.length === 3, JSON.stringify(r.items.map(i => i.key)));
r = await call(`sql_mine_list('tokB')`);
ok('3  Leon sieht Mias Kopien nicht', r.ok && r.items.length === 0);
r = await call(`sql_mine_get('tokA', 'builtin:schule')`);
ok('3  Kopie holen', r.ok && Buffer.from(r.content, 'base64').toString() === 'mia-schule');

/* 4 */
await setData({ shared: [{ id: KINO, t: 'Kino', r: 'use' }], create: true });
await as(null);
r = await call(`sql_mine_put('tokA', 'builtin:schule', 'Schule', $1)`, [B64('nachher')]);
ok('4  entzogen → speichern abgelehnt', r.error === 'not_shared');
r = await call(`sql_mine_get('tokA', 'builtin:schule')`);
ok('4  entzogen → holen abgelehnt', r.error === 'not_shared');
await setData({ shared: [{ id: KINO, t: 'Kino', r: 'use' }, { id: 'builtin:schule', t: 'Schule', r: 'use' }], create: true });
await as(null);
r = await call(`sql_mine_get('tokA', 'builtin:schule')`);
ok('4  wieder geteilt → alte Arbeit ist da', r.ok && Buffer.from(r.content, 'base64').toString() === 'mia-schule');
r = await call(`sql_mine_delete('tokA', 'builtin:schule')`);
r = await call(`sql_mine_get('tokA', 'builtin:schule')`);
ok('4  zurücksetzen löscht die Kopie', r.error === 'not_found');

/* 5 */
await as(T1);
r = await call(`sql_class_list($1)`, [CODE]);
ok('5  Lehrkraft sieht die Kopien', r.ok && r.items.length === 2 && r.items[0].person === 'Mia', JSON.stringify(r.items));
const PA = r.items[0].participant;
r = await call(`sql_class_get($1, $2, $3)`, [CODE, PA, KINO]);
ok('5  Lehrkraft holt eine Kopie', r.ok && Buffer.from(r.content, 'base64').toString() === 'mia-kino');
await as(T2);
r = await call(`sql_class_list($1)`, [CODE]);
ok('5  fremde Lehrkraft → not_found', r.error === 'not_found');
await db.query(`insert into skill_room_teachers (room_id, user_id, added_by) values ($1, $2, $3)`, [ROOM, T2, T1]).catch(async () => {
  await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [ROOM, T2]);
});
r = await call(`sql_class_list($1)`, [CODE]);
ok('5  eingeladene Lehrkraft sieht sie', r.ok && r.items.length === 2);
await setData({ shared: [{ id: FREMD, t: 'Fremd', r: 'use' }], create: true });
await as(null);
r = await call(`sql_shared_get('tokA', $1)`, [FREMD]);
ok('5  Datenbank der eingeladenen Lehrkraft geht jetzt', r.ok);

/* 6 */
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('6  Raum weg → Kopien weg', (await one(`select count(*)::int n from sql_work`)).n === 0);
ok('6  Datenbanken der Lehrkraft bleiben', (await one(`select count(*)::int n from sql_databases`)).n === 2);
let twice = true;
try { await db.exec(mig('0221_sqlstudio_teilen.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('6  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
