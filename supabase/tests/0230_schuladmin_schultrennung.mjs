/* Prüfstand für Migration 0230 — Schuladmins sehen nur Spieldaten der eigenen Schule.
   Echt gerechnet in pglite auf der ganzen Kette.

   Aufruf:  node supabase/tests/0230_schuladmin_schultrennung.mjs */
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

// Zweiter Lauf darf nicht abbrechen
try { await db.exec(mig('0230_schuladmin_schultrennung.sql')); ok('0230 zweiter Lauf läuft durch', true); }
catch (e) { ok('0230 zweiter Lauf läuft durch', false, e.message); }

// Zwei Schulen, je ein Kurs mit Bonus, je ein Schüler mit Spieldaten
const SA = (await one(`insert into schools (slug, name) values ('aaa', 'A') returning id`)).id;
const SB = (await one(`insert into schools (slug, name) values ('bbb', 'B') returning id`)).id;
const CA = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'KA', now() - interval '1 day', now() + interval '1 day') returning id`, [SA])).id;
const CB = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'KB', now() - interval '1 day', now() + interval '1 day') returning id`, [SB])).id;
const id = n => `e0000000-0000-4000-8000-0000000023${String(n).padStart(2, '0')}`;
const ADM = id(1), VOLL = id(2), STA = id(3), STB = id(4);
for (const [u, s, name, flags] of [
  [ADM,  SA, 'adm',  'true, false'],
  [VOLL, SA, 'voll', 'true, true'],
  [STA,  SA, 'sta',  'false, false'],
  [STB,  SB, 'stb',  'false, false'],
]) {
  await db.query(`insert into auth.users (id) values ($1)`, [u]);
  await db.query(`insert into profiles (id, school_id, account_name, display_name, is_admin, is_superadmin)
                  values ($1, $2, $3, $3, ${flags})`, [u, s, name]);
}
await db.query(`update profiles set cluster_id = $1 where id = $2`, [CA, STA]);
await db.query(`update profiles set cluster_id = $1 where id = $2`, [CB, STB]);
for (const u of [STA, STB]) {
  await db.query(`insert into wallets (user_id) values ($1)`, [u]);
  await db.query(`insert into user_collectibles (user_id, key, value) values ($1, 'x', '{}')`, [u]);
  await db.query(`insert into cheat_flags (user_id, reason) values ($1, 'test')`, [u]);
}
await db.query(`insert into cluster_bonus (cluster_id, startup_coins) values ($1, 5), ($2, 5)`, [CA, CB]);

await db.exec(`grant usage on schema public to authenticated; grant select on _who to authenticated`);
const als = async (u, fn) => {
  await db.query(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]);
  await db.exec(`set role authenticated`);
  try { return await fn(); } finally { await db.exec(`reset role`); }
};
const ids = async (tbl, col = 'user_id') =>
  (await db.query(`select ${col}::text v from ${tbl} order by 1`)).rows.map(r => r.v);

// Schuladmin
await als(ADM, async () => {
  for (const t of ['wallets', 'user_collectibles', 'cheat_flags']) {
    const v = await ids(t);
    ok(`Schuladmin: ${t} nur eigene Schule`, v.length === 1 && v[0] === STA, v.join(','));
  }
  const b = await ids('cluster_bonus', 'cluster_id');
  ok('Schuladmin: cluster_bonus nur eigener Kurs', b.length === 1 && b[0] === CA, b.join(','));
  const upd = await db.query(`update cluster_bonus set startup_coins = 999 where cluster_id = $1`, [CB]);
  ok('Schuladmin: fremden Bonus ändern → 0 Zeilen', upd.affectedRows === 0);
  const del = await db.query(`delete from cluster_bonus where cluster_id = $1`, [CB]);
  ok('Schuladmin: fremden Bonus löschen → 0 Zeilen', del.affectedRows === 0);
  const own = await db.query(`update cluster_bonus set startup_coins = 7 where cluster_id = $1`, [CA]);
  ok('Schuladmin: eigenen Bonus ändern → 1 Zeile', own.affectedRows === 1);
  let blocked = false;
  try { await db.query(`update cluster_bonus set cluster_id = $1 where cluster_id = $2`, [CB, CA]); }
  catch (e) { blocked = /row-level security|violates/.test(e.message); }
  ok('Schuladmin: eigenen Bonus auf fremden Kurs umhängen → abgelehnt', blocked);

  const rB = (await one(`select apply_cluster_bonus($1) r`, [STB])).r;
  ok('Schuladmin: apply_cluster_bonus fremde Schule → cross_school_forbidden',
     rB.error === 'cross_school_forbidden', JSON.stringify(rB));
  const rA = (await one(`select apply_cluster_bonus($1) r`, [STA])).r;
  ok('Schuladmin: apply_cluster_bonus eigene Schule → ok', rA.ok === true, JSON.stringify(rA));
});
const fremd = await one(`select startup_coins from cluster_bonus where cluster_id = $1`, [CB]);
ok('fremder Bonus unverändert', fremd.startup_coins === 5);

// Volladmin sieht und darf alles
await als(VOLL, async () => {
  ok('Volladmin: wallets beider Schulen', (await ids('wallets')).length === 2);
  ok('Volladmin: cluster_bonus beider Kurse', (await ids('cluster_bonus', 'cluster_id')).length === 2);
  const r = (await one(`select apply_cluster_bonus($1) r`, [STB])).r;
  ok('Volladmin: apply_cluster_bonus fremde Schule → ok', r.ok === true, JSON.stringify(r));
});

// Schüler sieht nur sich selbst, ohne 2FA-Stufe kein Admin
await als(STA, async () => {
  const v = await ids('wallets');
  ok('Schüler: nur eigene Geldbörse', v.length === 1 && v[0] === STA, v.join(','));
  ok('Schüler: kein cluster_bonus', (await ids('cluster_bonus', 'cluster_id')).length === 0);
});

// service_role-Weg (ohne Anmeldung, wie api/signup.js)
await db.query(`delete from _who`);
await db.query(`delete from cluster_bonus_grants where user_id = $1`, [STB]);
const sr = (await one(`select apply_cluster_bonus($1) r`, [STB])).r;
ok('ohne Anmeldung (service_role): apply_cluster_bonus → ok', sr.ok === true, JSON.stringify(sr));

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
