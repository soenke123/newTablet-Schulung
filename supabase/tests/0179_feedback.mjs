/* Prüfstand für Migration 0179 — Feedback & Fragen.
   Echt gerechnet in pglite: wer senden darf, Validierung,
   Rate-Limit, und dass nur der Volladmin den Cluster-Schalter setzt.
*/
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text, name text);
create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id), name text, season int not null default 1);
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  cluster_id uuid references clusters(id),
  account_name text, display_name text, status text default 'active',
  is_admin boolean not null default false, is_superadmin boolean not null default false,
  avatar_id text, avatars_seen_at timestamptz, last_login_at timestamptz,
  teacher_status text not null default 'none',
  teacher_requested_at timestamptz, teacher_decided_at timestamptz);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function is_superadmin() returns boolean language sql stable as
  $$ select coalesce((select is_superadmin from profiles where id = auth.uid()), false) $$;
create role service_role; create role authenticated; create role anon;
`;

let passed = 0, failed = 0;
function ok(desc, cond, extra = '') {
  if (cond) { passed++; console.log('ok    ' + desc + (extra ? '   ' + extra : '')); }
  else      { failed++; console.error('FAIL  ' + desc + (extra ? '   ' + extra : '')); }
}

async function asUser(uid, fn) {
  await db.query('delete from _who');
  if (uid) await db.query('insert into _who values ($1)', [uid]);
  try { return await fn(); }
  finally { await db.query('delete from _who'); }
}

const submit = async (cat, body, page = '/x') =>
  (await db.query('select submit_feedback($1, $2, $3) as r', [cat, body, page])).rows[0].r;

async function run() {
  await db.exec(STUBS);
  const mig = readFileSync(`${REPO}/supabase/migrations/0179_feedback_tickets.sql`, 'utf8');
  await db.exec(mig);
  await db.exec(mig);   // idempotent?
  ok('Migration läuft zweimal durch', true);

  const school = (await db.query(`insert into schools (slug, name) values ('mps','MPS') returning id`)).rows[0].id;
  const clOff  = (await db.query(`insert into clusters (school_id, name) values ($1,'Kurs A') returning id`, [school])).rows[0].id;
  const clOn   = (await db.query(`insert into clusters (school_id, name) values ($1,'Kurs B') returning id`, [school])).rows[0].id;
  const mk = async (fields) => {
    const keys = Object.keys(fields);
    const r = await db.query(
      `insert into profiles (${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning id`,
      Object.values(fields));
    return r.rows[0].id;
  };
  const superA  = await mk({ school_id: school, account_name: 'boss', is_admin: true, is_superadmin: true });
  const schoolA = await mk({ school_id: school, account_name: 'sadmin', is_admin: true });
  const teacher = await mk({ school_id: school, account_name: 'lk', display_name: 'Frau Lehrer', teacher_status: 'approved' });
  const pending = await mk({ school_id: school, account_name: 'lk2', teacher_status: 'pending' });
  const stOff   = await mk({ school_id: school, cluster_id: clOff, account_name: 'kid1' });
  const stOn    = await mk({ school_id: school, cluster_id: clOn,  account_name: 'kid2' });

  // Cluster-Schalter: Schuladmin nein, Volladmin ja, service_role (uid null) ja
  await asUser(schoolA, async () => {
    let err = null;
    try { await db.query('update clusters set feedback_enabled = true where id = $1', [clOn]); }
    catch (e) { err = e.message; }
    ok('Schuladmin darf Feedback-Schalter nicht setzen', err && err.includes('feedback_flag_superadmin_only'), err || '');
    await db.query(`update clusters set name = 'Kurs B2' where id = $1`, [clOn]);
    ok('Schuladmin darf Cluster sonst weiter bearbeiten',
      (await db.query('select name from clusters where id = $1', [clOn])).rows[0].name === 'Kurs B2');
    err = null;
    try { await db.query(`insert into clusters (school_id, name, feedback_enabled) values ($1,'Kurs C',true)`, [school]); }
    catch (e) { err = e.message; }
    ok('Schuladmin darf Cluster nicht mit Schalter an anlegen', !!err);
  });
  await asUser(superA, async () => {
    await db.query('update clusters set feedback_enabled = true where id = $1', [clOn]);
  });
  ok('Volladmin setzt Feedback-Schalter',
    (await db.query('select feedback_enabled from clusters where id = $1', [clOn])).rows[0].feedback_enabled === true);
  await asUser(null, async () => {
    await db.query('update clusters set feedback_enabled = false where id = $1', [clOff]);
  });
  ok('ohne auth.uid() (service_role) keine Sperre', true);

  // user_session-Spalte
  const sess = await asUser(stOn, () => db.query('select cluster_feedback_enabled from user_session where id = $1', [stOn]));
  ok('user_session.cluster_feedback_enabled = true für Kurs B', sess.rows[0].cluster_feedback_enabled === true);

  // Berechtigungen
  const can = async (uid) => asUser(uid, async () => (await db.query('select can_send_feedback() as c')).rows[0].c);
  ok('Volladmin darf senden',          await can(superA));
  ok('Schuladmin darf senden',         await can(schoolA));
  ok('Lehrkraft (approved) darf',      await can(teacher));
  ok('Lehrkraft (pending) darf nicht', !(await can(pending)));
  ok('Schüler ohne Schalter nicht',    !(await can(stOff)));
  ok('Schüler mit Schalter darf',      await can(stOn));
  ok('ohne Login nicht',               !(await can(null)));

  await asUser(stOff, async () => {
    const r = await submit('question', 'Hallo');
    ok('submit ohne Recht → not_allowed', r.ok === false && r.error === 'not_allowed');
  });
  await asUser(null, async () => {
    const r = await submit('question', 'Hallo');
    ok('submit ohne Login → not_logged_in', r.error === 'not_logged_in');
  });

  // Validierung + Snapshot
  await asUser(teacher, async () => {
    ok('falsche Kategorie', (await submit('rant', 'x')).error === 'bad_category');
    ok('leerer Text',       (await submit('bug', '   ')).error === 'empty');
    ok('zu lang',           (await submit('bug', 'a'.repeat(4001))).error === 'too_long');
    const r = await submit('bug', '  Im Spiel 3 hängt der Timer.  ', '/GameHub/index.html');
    ok('gültige Nachricht → ok', r.ok === true && !!r.id);
  });
  const t = (await db.query('select * from feedback_tickets where user_id = $1', [teacher])).rows[0];
  ok('Autor-Snapshot = Anzeigename', t.author_name === 'Frau Lehrer');
  ok('Text getrimmt', t.body === 'Im Spiel 3 hängt der Timer.');
  ok('is_teacher gesetzt, priority leer', t.is_teacher === true && t.priority === null);
  ok('Seite gespeichert', t.page === '/GameHub/index.html');

  await asUser(stOn, async () => {
    const r = await submit('idea', 'Mehr Monster!');
    ok('Schüler mit Schalter sendet', r.ok === true);
  });
  const k = (await db.query('select * from feedback_tickets where user_id = $1', [stOn])).rows[0];
  ok('Cluster-Snapshot', k.cluster_id === clOn && k.school_id === school && k.author_name === 'kid2');

  // Rate-Limit: 1 bereits gesendet, 9 weitere ok, 11. blockiert
  await asUser(teacher, async () => {
    let allOk = true;
    for (let i = 0; i < 9; i++) allOk = allOk && (await submit('other', 'n' + i)).ok;
    ok('bis 10 pro Stunde ok', allOk);
    ok('11. in der Stunde → rate_limited', (await submit('other', 'zu viel')).error === 'rate_limited');
  });

  // updated_at-Trigger + Löschen des Users
  await db.query(`update feedback_tickets set updated_at = now() - interval '1 day' where id = $1`, [t.id]);
  await db.query(`update feedback_tickets set priority = 'high' where id = $1`, [t.id]);
  const u = (await db.query('select updated_at > now() - interval \'1 minute\' as fresh from feedback_tickets where id = $1', [t.id])).rows[0];
  ok('updated_at wird beim Bearbeiten gesetzt', u.fresh === true);
  let err = null;
  try { await db.query(`update feedback_tickets set priority = 'urgent' where id = $1`, [t.id]); }
  catch (e) { err = e.message; }
  ok('ungültige Markierung abgewiesen', !!err);
  await db.query('delete from profiles where id = $1', [stOn]);
  const orphan = (await db.query('select user_id, author_name from feedback_tickets where id = $1', [k.id])).rows[0];
  ok('User gelöscht → Ticket bleibt mit Namen', orphan.user_id === null && orphan.author_name === 'kid2');

  console.log(`\nErgebnis: ${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
