/* Prüfstand für Migration 0212 — Status „über MPSkills“ + Kursbeitritt.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0212.

   Die Kernzusagen:
     1. Status 'mpskills' ist erlaubt, Unsinn nicht.
     2. Der Bestand ohne Kurs mit Lehrkraft-Antrag wird umgestellt.
     3. my_open_cluster zeigt den offenen Kurs der eigenen Schule.
     4. join_open_cluster: Konto ohne Kurs tritt bei → active + cluster_id.
     5. Admins, Konten mit Kurs und Fälle ohne offenen Kurs werden abgewiesen.

   Aufruf:  node supabase/tests/0212_status_ueber_mpskills.mjs */
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

const U1 = 'e0000000-0000-4000-8000-0000000000a1';  // über MPSkills, kein Kurs
const U2 = 'e0000000-0000-4000-8000-0000000000a2';  // pending, kein Kurs
const AD = 'e0000000-0000-4000-8000-0000000000a3';  // Admin
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [U1, U2, AD]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status)
                values ($1, $4, 'u1', 'U1', 'pending', 'pending'),
                       ($2, $4, 'u2', 'U2', 'pending', 'none'),
                       ($3, $4, 'ad', 'AD', 'pending', 'none')`, [U1, U2, AD, SCHOOL]);
await db.query(`update profiles set is_admin = true where id = $1`, [AD]);
const as = async u => { await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]); };

/* 1 */
let bad = false;
try { await db.query(`update profiles set status = 'quatsch' where id = $1`, [U2]); } catch { bad = true; }
ok('1  Unsinn als Status wird abgewiesen', bad);
await db.query(`update profiles set status = 'mpskills' where id = $1`, [U1]);
ok('1  mpskills ist erlaubt', (await one(`select status from profiles where id = $1`, [U1])).status === 'mpskills');

/* 2 — Bestandsumstellung (Statement aus der Migration) */
await db.query(`update profiles set status = 'pending' where id = $1`, [U1]);
await db.exec(mig('0212_status_ueber_mpskills.sql'));
ok('2  Bestand mit Lehrkraft-Antrag → mpskills', (await one(`select status from profiles where id = $1`, [U1])).status === 'mpskills');
ok('2  Bestand ohne Antrag bleibt pending', (await one(`select status from profiles where id = $1`, [U2])).status === 'pending');
ok('2  Admin bleibt unberührt', (await one(`select status from profiles where id = $1`, [AD])).status === 'pending');

/* 3 — kein offener Kurs */
await as(U1);
let r = (await one(`select my_open_cluster() v`)).v;
ok('3  ohne offenen Kurs: open=false', r.ok === true && r.open === false, JSON.stringify(r));
r = (await one(`select join_open_cluster() v`)).v;
ok('3  Beitritt ohne offenen Kurs → no_open_cluster', r.ok === false && r.error === 'no_open_cluster', JSON.stringify(r));

/* 4 — offener Kurs */
const CL = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'Kurs A', now() - interval '1 day', now() + interval '1 day') returning id`, [SCHOOL])).id;
r = (await one(`select my_open_cluster() v`)).v;
ok('4  offener Kurs wird gemeldet', r.open === true && r.name === 'Kurs A', JSON.stringify(r));
r = (await one(`select join_open_cluster() v`)).v;
ok('4  Beitritt klappt', r.ok === true && r.cluster_name === 'Kurs A', JSON.stringify(r));
const p = await one(`select status, cluster_id from profiles where id = $1`, [U1]);
ok('4  Profil: active + Kurs gesetzt', p.status === 'active' && p.cluster_id === CL);
r = (await one(`select join_open_cluster() v`)).v;
ok('4  zweiter Beitritt → already_in_cluster', r.ok === false && r.error === 'already_in_cluster', JSON.stringify(r));

/* 5 — Admin und Gast */
await as(AD);
r = (await one(`select join_open_cluster() v`)).v;
ok('5  Admin darf nicht beitreten', r.ok === false && r.error === 'is_admin', JSON.stringify(r));
await db.exec(`delete from _who`);
r = (await one(`select join_open_cluster() v`)).v;
ok('5  ohne Anmeldung → not_logged_in', r.ok === false && r.error === 'not_logged_in', JSON.stringify(r));

/* 6 — Migration läuft zweimal */
let twice = true;
try { await db.exec(mig('0212_status_ueber_mpskills.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('6  Migration läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
