/* Prüfstand für Migration 0229 — Anzeigename beim Ändern wie bei der Registrierung.
   Echt gerechnet in pglite auf der ganzen Kette.

   Aufruf:  node supabase/tests/0229_anzeigename_zeichen.mjs */
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

const S = (await one(`insert into schools (slug, name) values ('aaa', 'A') returning id`)).id;
const U = 'e0000000-0000-4000-8000-000000000b01';
await db.query(`insert into auth.users (id) values ($1)`, [U]);
await db.query(`insert into profiles (id, school_id, account_name, display_name) values ($1, $2, 'u', 'Alt')`, [U, S]);
await db.query(`insert into _who values ($1)`, [U]);
const set = async n => (await one(`select update_display_name($1) r`, [n])).r;

for (const n of ['<svg onload=alert(1)>', '<img src=x onerror=1>', 'Mia"onmouseover', "Leon's", 'a&b', 'Tab\there']) {
  const r = await set(n);
  ok(`abgelehnt: ${JSON.stringify(n)}`, r.ok === false && r.error === 'invalid_chars', JSON.stringify(r));
}
for (const n of ['Mia', 'Jürgen Öztürk', 'max.m_1-b', 'Ä Ö Ü ß']) {
  const r = await set(n);
  ok(`erlaubt: ${n}`, r.ok === true && r.display_name === n, JSON.stringify(r));
}
ok('Längenprüfung unverändert', (await set('x')).error === 'invalid_length');

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
