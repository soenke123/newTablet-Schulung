/* Prüfstand für Migration 0184 — GameHub-Pause pro Kurs. Echt gerechnet in pglite.

   Zusagen:
     1. Schüler darf nicht pausieren (not_admin).
     2. Schuladmin pausiert/entpausiert Kurse der eigenen Schule.
     3. Schuladmin darf Kurse einer fremden Schule nicht schalten (no_cluster).
     4. Volladmin darf jeden Kurs schalten.
     5. Schüler des pausierten Kurses sieht get_my_cluster_pause() = true,
        Schüler eines anderen Kurses false.
     6. Admins sind nie betroffen (false), auch nicht in einem pausierten Kurs.
     7. Wiederholtes Pausieren datiert paused_at nicht neu.
     8. Fortsetzen setzt paused_at zurück; ohne Login ist die Antwort false.

   Aufruf:  node supabase/tests/0184_cluster_pause.mjs  */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite({ extensions: { pgcrypto } });

const STUBS = `
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create role service_role; create role authenticated; create role anon;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(join(MIG, f), 'utf8');

/* Eine Funktion samt Grants wortgleich aus einer Migration ziehen, damit der
   Test die echte Definition prüft statt einer Kopie. */
const fn = (file, name) => {
  const src = mig(file);
  const re = new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i');
  const m = src.match(re);
  if (!m) { console.error(`Funktion ${name} nicht in ${file} gefunden`); process.exit(1); }
  return m[0];
};

await run(STUBS, 'Stubs');
await run(mig('0001_init.sql'), '0001');
await run(mig('0002_rls.sql'), '0002');
await run(`alter table profiles add column if not exists is_superadmin boolean not null default false;`, 'Spalte is_superadmin');
await run(fn('0053_multi_school_admins.sql', 'is_superadmin'), 'is_superadmin()');
await run(fn('0053_multi_school_admins.sql', 'is_any_admin'), 'is_any_admin()');
await run(fn('0062_board.sql', 'board_target_cluster'), 'board_target_cluster()');
await run(mig('0184_cluster_pause.sql'), '0184');
await run(mig('0184_cluster_pause.sql'), '0184 (idempotent, 2. Lauf)');
console.log('— Migrationen laufen durch —\n');

const S1 = 'd0000000-0000-4000-8000-000000000001';
const S2 = 'd0000000-0000-4000-8000-000000000002';
const C1 = 'c0000000-0000-4000-8000-000000000001'; // Schule 1
const C2 = 'c0000000-0000-4000-8000-000000000002'; // Schule 1
const C3 = 'c0000000-0000-4000-8000-000000000003'; // Schule 2
const STUDENT1 = 'e0000000-0000-4000-8000-000000000001'; // C1
const STUDENT2 = 'e0000000-0000-4000-8000-000000000002'; // C2
const SCHOOLADMIN = 'e0000000-0000-4000-8000-000000000003'; // Schule 1
const SUPER = 'e0000000-0000-4000-8000-000000000004';

await run(`
  insert into schools (id, slug, name) values ('${S1}','s1','Schule 1'), ('${S2}','s2','Schule 2');
  insert into clusters (id, school_id, name, season) values
    ('${C1}','${S1}','K1',1), ('${C2}','${S1}','K2',1), ('${C3}','${S2}','K3',1);
  insert into auth.users (id) values ('${STUDENT1}'),('${STUDENT2}'),('${SCHOOLADMIN}'),('${SUPER}');
  insert into profiles (id, school_id, cluster_id, account_name, display_name, status, is_admin, is_superadmin) values
    ('${STUDENT1}','${S1}','${C1}','s1','S1','active',false,false),
    ('${STUDENT2}','${S1}','${C2}','s2','S2','active',false,false),
    ('${SCHOOLADMIN}','${S1}',null,'sa','SA','active',true,false),
    ('${SUPER}','${S1}',null,'su','SU','active',true,true);
`, 'Bühne');

const as = async (uid, f) => {
  await db.exec(`delete from _who;` + (uid ? ` insert into _who values ('${uid}');` : ''));
  return f();
};
const setPause = (uid, cluster, paused) =>
  as(uid, async () => (await one(`select set_cluster_pause($1, $2) r`, [cluster, paused])).r);
const myPause = uid => as(uid, async () => (await one(`select get_my_cluster_pause() p`)).p);
const pausedAt = async c => (await one(`select paused_at from clusters where id=$1`, [c])).paused_at;

/* 1 */
{
  const r = await setPause(STUDENT1, C1, true);
  ok('1  Schüler darf nicht pausieren', r.ok === false && r.error === 'not_admin', JSON.stringify(r));
  ok('1b Kurs bleibt unpausiert', (await pausedAt(C1)) === null);
}

/* 2 */
{
  const r = await setPause(SCHOOLADMIN, C1, true);
  ok('2a Schuladmin pausiert eigenen Kurs', r.ok === true && r.paused === true, JSON.stringify(r));
  ok('2b paused_at gesetzt', (await pausedAt(C1)) !== null);
}

/* 3 */
{
  const r = await setPause(SCHOOLADMIN, C3, true);
  ok('3  Schuladmin kann fremde Schule nicht schalten', r.ok === false && r.error === 'no_cluster', JSON.stringify(r));
  ok('3b fremder Kurs bleibt unpausiert', (await pausedAt(C3)) === null);
}

/* 4 */
{
  const r = await setPause(SUPER, C3, true);
  ok('4  Volladmin pausiert Kurs einer anderen Schule', r.ok === true, JSON.stringify(r));
  ok('4b paused_at gesetzt', (await pausedAt(C3)) !== null);
  await setPause(SUPER, C3, false);
}

/* 5 */
{
  ok('5a Schüler im pausierten Kurs → true', (await myPause(STUDENT1)) === true);
  ok('5b Schüler in anderem Kurs → false', (await myPause(STUDENT2)) === false);
}

/* 6 */
{
  await setPause(SUPER, C1, true);
  ok('6a Schuladmin ohne Kurs → false', (await myPause(SCHOOLADMIN)) === false);
  ok('6b Volladmin ohne Kurs → false', (await myPause(SUPER)) === false);
  await db.exec(`update profiles set cluster_id='${C1}' where id='${SCHOOLADMIN}'`);
  ok('6c Admin MIT Kurs in pausiertem Kurs → false', (await myPause(SCHOOLADMIN)) === false);
  await db.exec(`update profiles set cluster_id=null where id='${SCHOOLADMIN}'`);
}

/* 7 */
{
  const before = await pausedAt(C1);
  await db.exec(`update clusters set paused_at = paused_at - interval '1 hour' where id='${C1}'`);
  const aged = await pausedAt(C1);
  await setPause(SCHOOLADMIN, C1, true);
  const after = await pausedAt(C1);
  ok('7  Zweites Pausieren datiert paused_at nicht neu',
     aged.getTime() === after.getTime() && aged.getTime() < before.getTime());
}

/* 8 */
{
  const r = await setPause(SCHOOLADMIN, C1, false);
  ok('8a Fortsetzen ok', r.ok === true && r.paused === false, JSON.stringify(r));
  ok('8b paused_at zurückgesetzt', (await pausedAt(C1)) === null);
  ok('8c Schüler sieht wieder false', (await myPause(STUDENT1)) === false);
  ok('8d Ohne Login → false', (await myPause(null)) === false);
  const r2 = await setPause(null, C1, true);
  ok('8e Ohne Login kein Pausieren', r2.ok === false && r2.error === 'not_authenticated', JSON.stringify(r2));
}

console.log(fails ? `\n${fails} Prüfung(en) FEHLGESCHLAGEN` : '\nalle Prüfungen ok');
process.exit(fails ? 1 : 0);
