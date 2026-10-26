/* Prüfstand für Migration 0234 — Definitions Derby: Lernstand im Konto.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0234.

   Die Kernzusagen:
     1. Lehrkraft: Lernstand zu eigenen Stapeln speichern, holen, listen;
        fremde Stapel und fremde Konten kommen nicht heran.
     2. Teilnehmer MIT Konto: nur für Stapel, die in seinem Raum geteilt sind;
        ohne Konto → no_account; falscher Token → unknown_token.
     3. Der Stand hängt am Konto, nicht am Raum: nach dem Raum bleibt er für
        die eigenen Stapel; Stapel weg → Stand weg.
     4. Eingaben: kein Objekt → invalid_input, zu groß → payload_too_big.
     5. 1-Jahres-Reset: dd_progress geht, dd_stacks bleiben.
     6. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0234_definitionsderby_lernstand.mjs */
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

const S1U = 'e0000000-0000-4000-8000-0000000000d1', S2U = 'e0000000-0000-4000-8000-0000000000d2';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [S1U, S2U]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status)
                values ($1, $3, 's1', 'S1', 'active'), ($2, $3, 's2', 'S2', 'active')`, [S1U, S2U, SCHOOL]);

await as(T1);
await db.exec(`update skill_tools set admin_only = false where id = 'derby'`);
let r = await call(`dd_stack_save(null, null, 'Zelle', 'Biologie', '', '7', '[{"t":"Kern","d":"Steuerzentrale"},{"t":"Ribosom","d":"Eiweiße"}]'::jsonb)`);
const ST = r.id;
await as(T2);
r = await call(`dd_stack_save(null, null, 'Fremd', '', '', '', '[{"t":"a","d":"b"}]'::jsonb)`);
const FREMD = r.id;
await as(T1);
r = await call(`skill_room_create('derby', 'Bio 7', false, '{}'::jsonb)`);
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
await db.query(`insert into skill_participants (room_id, token, seat, name, user_id) values
                ($1, 'tokS1', 1, 'Mia', $2), ($1, 'tokS2', 2, 'Leon', $3), ($1, 'tokG', 3, 'Gast', null)`, [ROOM, S1U, S2U]);

/* 1 */
const D1 = { k1: { l: 1, s: 0, t: 1000 }, k2: { l: 3, s: 2, t: 2000 } };
const SUM1 = { n: 2, c: [0, 1, 0, 1] };
r = await call(`dd_prog_put(null, $1, $2::jsonb, $3::jsonb)`, [ST, JSON.stringify(D1), JSON.stringify(SUM1)]);
ok('1  Lehrkraft speichert Lernstand zum eigenen Stapel', r.ok, JSON.stringify(r));
r = await call(`dd_prog_get(null, $1)`, [ST]);
ok('1  holen', r.ok && r.data.k2.s === 2 && r.data.k1.l === 1);
r = await call(`dd_prog_get(null, '00000000-0000-4000-8000-000000000000')`);
ok('1  unbekannter Stapel → not_found', r.error === 'not_found');
r = await call(`dd_prog_put(null, $1, '{"a":{"l":1}}'::jsonb, '{}'::jsonb)`, [FREMD]);
ok('1  fremder Stapel (ungeteilt) → not_found', r.error === 'not_found');
r = await call(`dd_prog_list(null)`);
ok('1  Liste mit Zusammenfassung', r.ok && r.items.length === 1 && r.items[0].sum.n === 2 && r.items[0].t > 0);
r = await call(`dd_prog_put(null, $1, '[1]'::jsonb, '{}'::jsonb)`, [ST]);
ok('4  Array statt Objekt → invalid_input', r.error === 'invalid_input');
r = await call(`dd_prog_put(null, $1, $2::jsonb, '{}'::jsonb)`, [ST, JSON.stringify({ x: 'a'.repeat(61000) })]);
ok('4  zu groß → payload_too_big', r.error === 'payload_too_big');
await as(null);
r = await call(`dd_prog_get(null, $1)`, [ST]);
ok('1  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');

/* 2 */
r = await call(`dd_mprog_put('tokS1', $1, '{"k1":{"l":2}}'::jsonb, '{}'::jsonb)`, [ST]);
ok('2  Teilnehmer, Stapel nicht geteilt → not_found', r.error === 'not_found');
await as(T1);
await call(`skill_room_set_state($1, null, $2::jsonb)`, [CODE, JSON.stringify({ shared: [{ id: ST, t: 'Zelle', n: 2 }, { id: FREMD, t: 'Fremd', n: 1 }] })]);
await as(null);
r = await call(`dd_mprog_put('tokS1', $1, '{"k1":{"l":2,"s":0,"t":5}}'::jsonb, '{"n":2,"c":[1,0,1,0]}'::jsonb)`, [ST]);
ok('2  Teilnehmer mit Konto, geteilt → speichert', r.ok, JSON.stringify(r));
r = await call(`dd_mprog_get('tokS1', $1)`, [ST]);
ok('2  holt den eigenen Stand', r.ok && r.data.k1.l === 2);
r = await call(`dd_mprog_get('tokS2', $1)`, [ST]);
ok('2  anderes Konto sieht Mias Stand nicht', r.ok && Object.keys(r.data).length === 0);
r = await call(`dd_mprog_put('tokS1', $1, '{"a":{"l":1}}'::jsonb, '{}'::jsonb)`, [FREMD]);
ok('2  geteilt, aber Stapel einer fremden Lehrkraft → not_found', r.error === 'not_found');
r = await call(`dd_mprog_get('tokG', $1)`, [ST]);
ok('2  Gast ohne Konto → no_account', r.error === 'no_account');
r = await call(`dd_mprog_put('tokG', $1, '{}'::jsonb, '{}'::jsonb)`, [ST]);
ok('2  Gast schreibt nichts', r.error === 'no_account');
r = await call(`dd_mprog_list('tokG')`);
ok('2  Gast: Liste → no_account', r.error === 'no_account');
r = await call(`dd_mprog_get('falsch', $1)`, [ST]);
ok('2  falscher Token → unknown_token', r.error === 'unknown_token');
r = await call(`dd_mprog_list('tokS1')`);
ok('2  Liste: genau der geteilte Stapel', r.ok && r.items.length === 1 && r.items[0].id === ST);

/* 3 */
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('3  Stand der Schülerin überlebt den Raum (hängt am Konto)', (await one(`select count(*)::int n from dd_progress where user_id = $1`, [S1U])).n === 1);
r = await (async () => { await as(S1U); return call(`dd_prog_get(null, $1)`, [ST]); })();
ok('3  …ist aber ohne Raum nicht mehr erreichbar (Stapel nicht ihrer)', r.error === 'not_found');

/* 5 */
await db.query(`select account_reset_content($1)`, [S1U]);
ok('5  Reset der Schülerin leert den Lernstand', (await one(`select count(*)::int n from dd_progress where user_id = $1`, [S1U])).n === 0);
await db.query(`select account_reset_content($1)`, [T1]);
ok('5  Reset der Lehrkraft leert ihren Lernstand', (await one(`select count(*)::int n from dd_progress where user_id = $1`, [T1])).n === 0);
ok('5  …aber ihre Stapel bleiben', (await one(`select count(*)::int n from dd_stacks where owner_id = $1`, [T1])).n === 1);

/* 3 */
await as(T1);
await call(`dd_prog_put(null, $1, '{"a":{"l":1}}'::jsonb, '{}'::jsonb)`, [ST]);
await call(`dd_stack_delete(null, $1)`, [ST]);
ok('3  Stapel gelöscht → Lernstand weg', (await one(`select count(*)::int n from dd_progress where stack_id = $1`, [ST])).n === 0);

/* 6 */
let twice = true;
try { await db.exec(mig('0234_definitionsderby_lernstand.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('6  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
