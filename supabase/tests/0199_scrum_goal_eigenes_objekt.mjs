/* Prüfstand für Migration 0199 — Scrum Werkstatt: Product Goal als eigenes Objekt.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0199.

   Die Kernzusagen:
     1. Goal (product/goal) und Projekt (product/main) sind getrennte Objekte
        mit eigenen Versionen — wer am Goal schreibt, kollidiert nicht mit
        einer Änderung an 'main'.
     2. Das Backup führt beide wieder zu EINEM product-Objekt zusammen.
     3. Einspielen akzeptiert die id 'goal'; andere Produkt-ids bleiben verboten.
     4. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0199_scrum_goal_eigenes_objekt.mjs */
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

const T     = 'e0000000-0000-4000-8000-000000000001';
const OTHER = 'e0000000-0000-4000-8000-000000000002';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, OTHER]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'andere', 'Andere')`, [T, OTHER, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const tool = await one(`select * from skill_tools where id = 'scrum'`);
ok('0  skill_tools: scrum mit Ordner ScrumWerkstatt, 30 Räume', tool && tool.folder === 'ScrumWerkstatt' && tool.max_rooms === 30);

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('SCRUMA', 'scrum', $1, $2, 'Team A') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 5) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok, have) => call(`scrum_view($1, $2)`, [tok, have ? JSON.stringify(have) : null]);
const save = (tok, ops) => call(`scrum_save($1, $2)`, [tok, JSON.stringify(ops)]);
const pid = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;

const osave = (ops) => call(`scrum_room_save('SCRUMA', $1)`, [JSON.stringify(ops)]);
const backups = async () => (await call(`scrum_room_backups('SCRUMA')`)).backups;

await call(`scrum_enter('t1', 'member')`);
await call(`scrum_enter('t2', 'observer')`);

/* ══ 1. Getrennte Objekte ════════════════════════════════════════ */
let r = await osave([
  { op: 'put', kind: 'product', id: 'main', v: 0, data: { name: 'Proj', pairs: [] } },
  { op: 'put', kind: 'product', id: 'goal', v: 0, data: { goal: '<p>Ziel A</p>', images: [], goalLocked: false } },
  { op: 'put', kind: 'story', id: 'a1', v: 0, data: { id: 'a1', title: 'Eins', points: 3, status: 'todo', sprint: null } }
]);
ok('1  main und goal lassen sich anlegen', r.ok && r.items.length === 3, JSON.stringify(r).slice(0, 120));
r = await save('t1', [{ op: 'put', kind: 'product', id: 'main', v: 1, data: { name: 'Proj', pairs: [['m1', 'm2']] } }]);
ok('1  Paarung ändern (main) …', r.ok && r.items[0].v === 2);
r = await save('t1', [{ op: 'put', kind: 'product', id: 'goal', v: 1, data: { goal: '<p>Ziel B</p>', images: [] } }]);
ok('1  … und gleichzeitig am Goal schreiben: kein Konflikt', r.ok && r.items[0].v === 2, JSON.stringify(r).slice(0, 120));
r = await save('t1', [{ op: 'put', kind: 'product', id: 'goal', v: 1, data: { goal: '<p>Ziel C</p>', images: [] } }]);
ok('1  zwei am Goal mit gleicher Version: conflict', r.error === 'conflict');

/* ══ 2. Backup führt zusammen ═════════════════════════════════════ */
await view('t1');
await db.exec(`update scrum_backups set created_at = now() - interval '8 days' where room_id = '${R}'`);
await view('t1');
const bl = (await call(`scrum_room_backups('SCRUMA')`)).backups;
ok('2  Backup liegt vor', bl.length >= 1);
const bd = (await call(`scrum_room_backup_get('SCRUMA', $1)`, [bl[0].id])).data;
ok('2  product im Backup = main + goal in einem Objekt',
   bd.product.name === 'Proj' && bd.product.goal === '<p>Ziel B</p>' && Array.isArray(bd.product.images)
   && JSON.stringify(bd.product.pairs) === '[["m1","m2"]]', JSON.stringify(bd.product));

/* ══ 3. Einspielen ════════════════════════════════════════════════ */
const items = [
  { kind: 'product', id: 'main', data: { name: 'Import' } },
  { kind: 'product', id: 'goal', data: { goal: '<p>Neu</p>', images: [], goalLocked: true } },
  { kind: 'story', id: 'x1', data: { id: 'x1', title: 'Neu', points: 1, status: 'done', no: 7, key: 'US-07' } }
];
r = await call(`scrum_room_restore('SCRUMA', $1, 7, 0)`, [JSON.stringify(items)]);
const v = await view('t1');
ok('3  Einspielen mit goal-Objekt klappt',
   r.ok && v.items.some(i => i.kind === 'product' && i.id === 'goal' && i.data?.goalLocked === true), JSON.stringify(r));
const bad = async (its) => (await call(`scrum_room_restore('SCRUMA', $1, 0, 0)`, [JSON.stringify(its)])).error;
ok('3  andere Produkt-id bleibt verboten', await bad([{ kind: 'product', id: 'other', data: {} }]) === 'invalid_input');
ok('3  nach fehlerhaftem Einspielen ist alles noch da', (await view('t1')).items.some(i => i.id === 'x1'));

/* ══ 4. Zweimal ═══════════════════════════════════════════════════ */
try { await db.exec(mig('0199_scrum_goal_eigenes_objekt.sql')); ok('4  0199 läuft ein zweites Mal', true); }
catch (e) { ok('4  0199 läuft ein zweites Mal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
