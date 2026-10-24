/* Prüfstand für Migration 0222 — games.password_hash nicht öffentlich.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0222.

   Die Kernzusagen:
     1. anon/authenticated dürfen password_hash NICHT lesen.
     2. Alle anderen Spalten von games bleiben lesbar.
     3. games_public liefert als anon weiter Zeilen.
     4. select * auf games scheitert als anon (Hash nicht erreichbar).
     5. unlock_game (0004) prüft das Passwort weiter richtig.

   Aufruf:  node supabase/tests/0222_games_hash_verbergen.mjs */
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

// 1 + 2: Spaltenrechte
for (const role of ['anon', 'authenticated']) {
  const r = await one(`select has_column_privilege($1, 'games', 'password_hash', 'select') as h,
                              has_table_privilege($1, 'games', 'select') as t`, [role]);
  ok(`${role}: password_hash nicht lesbar`, r.h === false);
  ok(`${role}: kein Tabellenrecht auf games`, r.t === false);
  const cols = (await db.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'games' and column_name <> 'password_hash'`)).rows;
  const blind = [];
  for (const { column_name } of cols) {
    const c = await one(`select has_column_privilege($1, 'games', $2, 'select') as p`, [role, column_name]);
    if (!c.p) blind.push(column_name);
  }
  ok(`${role}: alle anderen Spalten lesbar`, blind.length === 0, blind.join(', '));
}

// Testspiel mit Passwort
await db.exec(`insert into games (id, season, folder, title, password_hash, active)
               values ('gtest', 1, 'x', 'Test', encode(digest('geheim', 'sha256'), 'hex'), true)
               on conflict (id) do update set password_hash = excluded.password_hash, active = true`);

// 3 + 4: als anon abfragen
await db.exec(`grant usage on schema public to anon`);
await db.exec(`set role anon`);
const v = await one(`select count(*)::int as n from games_public where id = 'gtest'`);
ok('anon: games_public liefert das Spiel', v.n === 1);
const sel = await one(`select title from games where id = 'gtest'`);
ok('anon: erlaubte Spalten direkt lesbar', sel.title === 'Test');
let blocked = false;
try { await db.query(`select password_hash from games`); } catch (e) { blocked = /permission denied/.test(e.message); }
ok('anon: select password_hash → permission denied', blocked);
blocked = false;
try { await db.query(`select * from games`); } catch (e) { blocked = /permission denied/.test(e.message); }
ok('anon: select * → permission denied', blocked);
await db.exec(`reset role`);

// 5: Passwortprüfung über die RPC (security definer, sieht den Hash)
const U = 'e0000000-0000-4000-8000-0000000000c1';
await db.exec(`insert into auth.users (id) values ('${U}');
               insert into _who values ('${U}')`);
const S = (await one(`insert into schools (slug, name) values ('zz', 'Schule Z') returning id`)).id;
await db.query(`insert into profiles (id, school_id, account_name, display_name) values ($1, $2, 'u1', 'U1')`, [U, S]);
const bad  = await one(`select unlock_game('gtest', 'falsch') as r`);
const good = await one(`select unlock_game('gtest', 'geheim') as r`);
ok('unlock_game: falsches Passwort → wrong_password', bad.r?.error === 'wrong_password', JSON.stringify(bad.r));
ok('unlock_game: richtiges Passwort → ok',             good.r?.ok === true, JSON.stringify(good.r));

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
