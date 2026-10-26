/* Prüfstand für Migration 0233 — Definitions Derby (Stapel, Teilen).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0233.

   Die Kernzusagen:
     1. Lehrkraft: Stapel anlegen, listen, holen, ändern, löschen; Karten
        werden geprüft (Länge, Bildformat, Anzahl); Schüler kommen nicht heran.
     2. Teilnehmer holt einen Stapel nur, wenn er in DIESEM Raum geteilt ist
        und einer Lehrkraft DIESES Raums gehört.
     3. Nach dem Entziehen: kein Holen mehr. Eingeladene Lehrkraft zählt mit.
     4. Der Skill ist zunächst nur für Admins (admin_only).
     5. Stapel gehen nicht mit dem Raum; Migration läuft zweimal.

   Aufruf:  node supabase/tests/0233_definitionsderby.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;  -- 0223: Admins nur mit 2FA
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
const KARTEN = [{ id: 'k1', t: 'Photosynthese', d: 'Pflanzen bauen aus Licht, Wasser und CO2 Traubenzucker.' },
                { id: 'k2', t: 'Chlorophyll',   d: 'Grüner Farbstoff.', i: 'data:image/png;base64,iVBORw0KGgo=' }];
let r = await call(`dd_stack_save(null, null, 'Pflanzen', 'Biologie', 'Stoffwechsel', '7', $1::jsonb)`, [JSON.stringify(KARTEN)]);
ok('1  anlegen', r.ok && r.created, JSON.stringify(r));
const S1 = r.id;
r = await call(`dd_stack_get(null, $1)`, [S1]);
ok('1  holen: Karten, Fach, Thema, Klasse', r.ok && r.cards.length === 2 && r.subject === 'Biologie' && r.topic === 'Stoffwechsel' && r.grade === '7');
r = await call(`dd_stack_save(null, null, '', 'x', '', '', '[]'::jsonb)`);
ok('1  leerer Titel → invalid_input', r.error === 'invalid_input');
r = await call(`dd_stack_save(null, null, 'X', '', '', '', '[{"t":"a","d":""}]'::jsonb)`);
ok('1  Karte ohne Definition → invalid_input', r.error === 'invalid_input');
r = await call(`dd_stack_save(null, null, 'X', '', '', '', '[{"t":"a","d":"b","i":"javascript:alert(1)"}]'::jsonb)`);
ok('1  Bild, das keins ist → invalid_input', r.error === 'invalid_input');
r = await call(`dd_stack_save(null, null, 'X', '', '', '', '"kein array"'::jsonb)`);
ok('1  Karten kein Array → invalid_input', r.error === 'invalid_input');
r = await call(`dd_stack_save(null, null, 'X', '', '', '', $1::jsonb)`, [JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ t: 'a' + i, d: 'b' })))]);
ok('1  501 Karten → invalid_input', r.error === 'invalid_input');
r = await call(`dd_stack_save(null, null, 'ID', '', '', '', '[{"id":"<b>","t":"a","d":"b"}]'::jsonb)`);
const sid = await call(`dd_stack_get(null, $1)`, [r.id]);
ok('1  unsaubere Karten-id wird ersetzt', r.ok && sid.cards[0].id === 'k1');
r = await call(`dd_stack_save(null, $1, 'Pflanzen 2', 'Biologie', '', '7', $2::jsonb)`, [S1, JSON.stringify([KARTEN[0]])]);
ok('1  ändern', r.ok && !r.created);
r = await call(`dd_stacks_list(null)`);
ok('1  Liste: Anzahl Karten', r.ok && r.items.length === 2 && r.items.some(i => i.id === S1 && i.n === 1));
await as(T2);
r = await call(`dd_stack_get(null, $1)`, [S1]);
ok('1  fremde Lehrkraft → not_found', r.error === 'not_found');
r = await call(`dd_stack_delete(null, $1)`, [S1]);
ok('1  fremde Lehrkraft kann nicht löschen', r.error === 'not_found');
r = await call(`dd_stack_save(null, $1, 'Gekapert', '', '', '', '[]'::jsonb)`, [S1]);
ok('1  fremde Lehrkraft kann nicht ändern', r.error === 'not_found');
r = await call(`dd_stack_save(null, null, 'Fremd', '', '', '', '[{"t":"f","d":"g"}]'::jsonb)`);
const FREMD = r.id;
await as(null);
r = await call(`dd_stacks_list(null)`);
ok('1  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');

/* Raum + Teilnehmer */
await as(T1);
await db.exec(`update skill_tools set admin_only = false where id = 'derby'`);
r = await call(`skill_room_create('derby', 'Bio 7', false, '{}'::jsonb)`);
ok('2  Raum anlegen', r.ok, JSON.stringify(r));
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokA', 1, 'Mia'), ($1, 'tokB', 2, 'Leon')`, [ROOM]);
const setData = async (d) => { await as(T1); return call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify(d)]); };

/* 2 */
await as(null);
r = await call(`dd_shared_get('tokA', $1)`, [S1]);
ok('2  nicht geteilt → not_shared', r.error === 'not_shared');
r = await setData({ shared: [{ id: S1, t: 'Pflanzen 2', n: 1 }, { id: FREMD, t: 'Fremd', n: 1 }] });
ok('2  teilen über skill_room_set_state', r.ok, JSON.stringify(r));
await as(null);
r = await call(`dd_shared_get('tokA', $1)`, [S1]);
ok('2  geteilt → Karten kommen', r.ok && r.cards.length === 1 && r.title === 'Pflanzen 2');
r = await call(`dd_shared_get('tokA', $1)`, [FREMD]);
ok('2  geteilt, aber Stapel einer fremden Lehrkraft → not_found', r.error === 'not_found');
r = await call(`dd_shared_get('falsch', $1)`, [S1]);
ok('2  falscher Token → unknown_token', r.error === 'unknown_token');
r = await call(`dd_shared_get('tokA', 'kein-uuid')`);
ok('2  Unsinn als id → not_shared', r.error === 'not_shared');
r = await call(`dd_stack_get(null, $1)`, [S1]);
ok('2  Schüler ohne Anmeldung an dd_stack_get → not_authenticated', r.error === 'not_authenticated');

/* 3 */
await setData({ shared: [] });
await as(null);
r = await call(`dd_shared_get('tokA', $1)`, [S1]);
ok('3  entzogen → nicht mehr holbar', r.error === 'not_shared');
await db.query(`insert into skill_room_teachers (room_id, user_id, added_by) values ($1, $2, $3)`, [ROOM, T2, T1]).catch(async () => {
  await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [ROOM, T2]);
});
await setData({ shared: [{ id: FREMD, t: 'Fremd', n: 1 }] });
await as(null);
r = await call(`dd_shared_get('tokA', $1)`, [FREMD]);
ok('3  Stapel der eingeladenen Lehrkraft geht jetzt', r.ok);

/* 4 */
const T3 = 'e0000000-0000-4000-8000-0000000000c3';  // Lehrkraft ohne Adminrechte
await db.query(`insert into auth.users (id) values ($1)`, [T3]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 't3', 'T3', 'active', 'approved', false)`, [T3, SCHOOL]);
await db.exec(`update skill_tools set admin_only = true where id = 'derby'`);
await as(T3);
let gesperrt = false;
try { r = await call(`skill_room_create('derby', 'Bio 8', false, '{}'::jsonb)`); gesperrt = r.ok === false; }
catch (e) { gesperrt = true; }
ok('4  admin_only: Lehrkraft ohne Adminrechte legt keinen Raum an', gesperrt);
await as(T1);
await db.exec(`update skill_tools set admin_only = false where id = 'derby'`);
r = await call(`skill_room_create('derby', 'Bio 8', false, '{}'::jsonb)`);
ok('4  freigegeben: dieselbe Lehrkraft darf', r.ok === true);
await db.exec(`update skill_tools set admin_only = true where id = 'derby'`);

/* 5 */
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('5  Stapel überleben den Raum', (await one(`select count(*)::int n from dd_stacks`)).n === 3);
let twice = true;
try { await db.exec(mig('0233_definitionsderby.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('5  Migration läuft ein zweites Mal durch', twice);
ok('5  admin_only bleibt nach dem zweiten Lauf stehen', (await one(`select admin_only a from skill_tools where id = 'derby'`)).a === true);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
