/* Prüfstand für Migration 0232 — „Tür öffnen“ nach doppeltem Lauf von 0226.
   Echt gerechnet in pglite auf der ganzen Kette.

   Aufruf:  node supabase/tests/0232_raum_tuer_reparatur.mjs */
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

import { execSync } from 'node:child_process';

// Nachstellen, was live passiert ist: 0226 in der ersten Fassung
// (Commit f2f757a, ohne Schutz gegen zweiten Lauf) zweimal ausgeführt.
const ALT_0226 = execSync('git show f2f757a:supabase/migrations/0226_raum_tuer_code_qr.sql',
                          { cwd: REPO, encoding: 'utf8' });
await db.exec(STUBS);
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort();
const run = async f => {
  try { await db.exec(mig(f)); }
  catch (e) { if (!BEKANNT.has(f.slice(0, 4))) { console.error(`FEHLER in ${f}: ${e.message}`); process.exit(1); } }
};
for (const f of FILES.filter(f => f < '0226')) await run(f);
await db.exec(ALT_0226);
try { await db.exec(ALT_0226); } catch (e) { console.log('(zweiter Lauf der alten 0226:', e.message.slice(0, 60), ')'); }

const S  = (await one(`insert into schools (slug, name) values ('aaa', 'A') returning id`)).id;
const U  = 'e0000000-0000-4000-8000-000000002320';
await db.query(`insert into auth.users (id) values ($1)`, [U]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values ($1, $2, 'l', 'L', 'approved')`, [U, S]);
await db.query(`insert into _who values ($1)`, [U]);
const tool = (await one(`select id from skill_tools where id = 'wordcloud'`)).id;
const room = (await one(`select skill_room_create($1, 'T', null) r`, [tool])).r;
ok('Raum angelegt', room.ok === true, JSON.stringify(room));
const code = room.code ?? room.room?.code;

let kaputt = false;
try { await db.query(`select skill_room_set_open($1, true)`, [code]); }
catch (e) { kaputt = /multiple assignments/.test(e.message); }
ok('Fehler nachgestellt: multiple assignments to same column', kaputt);

for (const f of FILES.filter(f => f > '0226')) await run(f);
await run('0232_raum_tuer_reparatur.sql');  // zweiter Lauf schadet nicht
ok('0227 … 0232 laufen durch (0232 doppelt)', true);

await db.query(`update skill_rooms set code_open_until = now() - interval '1 minute' where code = $1`, [code]);
const r = (await one(`select skill_room_set_open($1, true) r`, [code])).r;
ok('skill_room_set_open → ok', r.ok === true && r.join_open === true, JSON.stringify(r));
const t = await one(`select code_open_until > now() + interval '89 minutes' as frisch, join_open from skill_rooms where code = $1`, [code]);
ok('Code gilt wieder 90 Minuten', t.frisch === true && t.join_open === true);
const z = (await one(`select skill_room_set_open($1, false) r`, [code])).r;
const t2 = await one(`select join_open, code_open_until > now() as noch from skill_rooms where code = $1`, [code]);
ok('Tür schließen → join_open false, Code-Frist bleibt', z.ok === true && t2.join_open === false && t2.noch === true);
const n = await one(`select count(*)::int n from regexp_matches(pg_get_functiondef('skill_room_set_open(text, boolean)'::regprocedure), 'code_open_until =', 'g')`);
ok('genau eine Zuweisung im Rumpf', n.n === 1, String(n.n));
const g = await one(`select has_function_privilege('authenticated', 'skill_room_set_open(text, boolean)', 'execute') e,
                            has_function_privilege('anon', 'skill_room_set_open(text, boolean)', 'execute') a`);
ok('authenticated darf, anon nicht', g.e === true && g.a === false);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
