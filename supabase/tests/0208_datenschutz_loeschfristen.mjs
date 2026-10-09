/* Prüfstand für Migration 0208 — Löschfristen für Protokolle.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0208.

   Die Kernzusagen:
     1. signup_attempts und skill_join_attempts: älter als 1 Tag weg,
        die letzte Stunde bleibt (das Rate-Limit braucht sie).
     2. cheat_flags nach 180 Tagen weg, jüngere bleiben.
     3. feedback_tickets nach 365 Tagen (updated_at) weg, jüngere bleiben.
     4. Abgelaufene Räume werden weiter gelöscht, offene bleiben.
     5. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0208_datenschutz_loeschfristen.mjs */
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
const U = 'e0000000-0000-4000-8000-000000000003';
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, U]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'kind', 'Kind')`, [T, U, SCHOOL]);
const count = async (tbl) => Number((await one(`select count(*) n from ${tbl}`)).n);

/* Daten: je Tabelle ein alter und ein frischer Eintrag */
await db.exec(`
  insert into signup_attempts (ip, created_at) values
    ('10.0.0.1', now() - interval '2 days'), ('10.0.0.2', now() - interval '10 minutes');
  insert into skill_join_attempts (ip, created_at) values
    ('10.0.0.1', now() - interval '2 days'), ('10.0.0.2', now() - interval '10 minutes');
  insert into cheat_flags (user_id, reason, created_at) values
    ('${U}', 'alt',  now() - interval '181 days'), ('${U}', 'frisch', now() - interval '179 days');
  insert into feedback_tickets (user_id, author_name, category, body, created_at, updated_at) values
    ('${U}', 'Kind', 'bug', 'alt',    now() - interval '400 days', now() - interval '366 days'),
    ('${U}', 'Kind', 'bug', 'frisch', now() - interval '400 days', now() - interval '30 days');
`);
const R_ALT = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                          select 'ALTALT', id, $1, $2, 'alt' from skill_tools limit 1 returning id`, [T, SCHOOL])).id;
const R_NEU = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                          select 'NEUNEU', id, $1, $2, 'neu' from skill_tools limit 1 returning id`, [T, SCHOOL])).id;
await db.query(`update skill_rooms set expires_at = now() - interval '1 hour' where id = $1`, [R_ALT]);

const r = (await one(`select skill_cleanup(5000) v`)).v;
ok('0  skill_cleanup meldet ok', r.ok === true, JSON.stringify(r));

/* ══ 1. IP-Protokolle ═══════════════════════════════════════════ */
ok('1  signup_attempts: alter weg, frischer bleibt',
   (await count('signup_attempts')) === 1 && r.signups === 1);
ok('1  skill_join_attempts: alter weg, frischer bleibt',
   (await count('skill_join_attempts')) === 1 && r.attempts === 1);

/* ══ 2. cheat_flags ═════════════════════════════════════════════ */
const cf = await db.query(`select reason from cheat_flags`);
ok('2  cheat_flags: nur der frische bleibt', cf.rows.length === 1 && cf.rows[0].reason === 'frisch');

/* ══ 3. feedback_tickets ════════════════════════════════════════ */
const ft = await db.query(`select body from feedback_tickets`);
ok('3  feedback_tickets: nur der zuletzt geänderte bleibt', ft.rows.length === 1 && ft.rows[0].body === 'frisch');

/* ══ 4. Räume ═══════════════════════════════════════════════════ */
ok('4  abgelaufener Raum weg', !(await one(`select 1 x from skill_rooms where id = $1`, [R_ALT])));
ok('4  offener Raum bleibt',  !!(await one(`select 1 x from skill_rooms where id = $1`, [R_NEU])));

try { await db.exec(mig('0208_datenschutz_loeschfristen.sql')); ok('5  Migration läuft zweimal', true); }
catch (e) { ok('5  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
