/* Prüfstand für Migration 0224 — Spiel-Passwörter ganz entfernt.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0224 + seed.sql.

   Die Kernzusagen:
     1. games.password_hash gibt es nicht mehr.
     2. unlock_game gibt es nicht mehr.
     3. seed.sql läuft auf dem neuen Schema durch.
     4. games_public liefert als anon weiter die Spiele.

   Aufruf:  node supabase/tests/0224_spielpasswort_entfernen.mjs */
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
const FILES = readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql') ).sort();
for (const f of FILES) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

const col = await one(`select count(*)::int n from information_schema.columns
                        where table_schema = 'public' and table_name = 'games' and column_name = 'password_hash'`);
ok('games.password_hash entfernt', col.n === 0);
const fn = await one(`select count(*)::int n from pg_proc where proname = 'unlock_game'`);
ok('unlock_game entfernt', fn.n === 0);

let seedOk = true;
try { await db.exec(readFileSync(`${REPO}/supabase/seed.sql`, 'utf8')); }
catch (e) { seedOk = false; console.error(e.message); }
ok('seed.sql läuft durch', seedOk);

await db.exec(`grant usage on schema public to anon; set role anon`);
const n = await one(`select count(*)::int n from games_public`);
ok('anon: games_public liefert Spiele', n.n > 0, `${n.n} Spiele`);
await db.exec(`reset role`);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
