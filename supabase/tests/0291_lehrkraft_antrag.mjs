/* Prüfstand für Migration 0291 — Lehrkraft-Antrag mit Nachricht + E-Mail,
   Mail an den Volladmin, Passwort per E-Mail. Echt gerechnet in pglite.

     1. Alter Weg request_teacher_role() stellt keinen Antrag mehr.
     2. request_teacher_access: Nachricht/E-Mail Pflicht, jede Domain erlaubt.
     3. Antrag → pending, Nachricht + Adresse gespeichert, EINE Admin-Mail.
     4. Nochmal beantragen solange offen → keine zweite Mail.
     5. mps_mail_claim: ohne admin_email nichts, mit Adresse ids; done = gesendet;
        entschiedene Anträge fallen heraus.
     6. my_email_get/set: Lehrkraft ja, Schüler not_teacher.
     7. admin_teacher_requests: nur Admins, Schuladmin nur eigene Schule.
     8. teacher_request_store (Signup-Weg) für ein frisches Konto.
     9. Passwort vergessen: nur bestätigte Adresse, nicht für Admins,
        per Accountname oder E-Mail, falsche Schule nichts; Token einmal.
    10. Bremsen: 3 Links je Konto/Stunde, 20 Anfragen je IP/Stunde.
    11. Projektarbeit nimmt jetzt jede Adresse.
    12. 0291 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0291_lehrkraft_antrag.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
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

const S1 = (await one(`insert into schools (slug, name) values ('aaa', 'Schule A') returning id`)).id;
const S2 = (await one(`insert into schools (slug, name) values ('bbb', 'Schule B') returning id`)).id;
const id = n => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ST = id(1), TL = id(2), SA = id(3), VA = id(4), NEU = id(5), ST_B = id(6), OLD = id(7);
await db.query(`insert into auth.users (id) select unnest($1::uuid[])`, [[ST, TL, SA, VA, NEU, ST_B, OLD]]);
const prof = (u, s, acc, extra = {}) => db.query(
  `insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin, is_superadmin)
   values ($1, $2, $3, $3, 'mpskills', $4, $5, $6)`,
  [u, s, acc, extra.ts || 'none', !!extra.admin, !!extra.super]);
await prof(ST, S1, 'mia');
await prof(TL, S1, 'lehrerin', { ts: 'approved' });
await prof(SA, S1, 'schuladmin', { admin: true });
await prof(VA, S1, 'volladmin', { admin: true, super: true });
await prof(NEU, S1, 'neu');
await prof(ST_B, S2, 'ben');

const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const mails = async () => Number((await one(`select count(*) n from teacher_request_mail`)).n);
const status = async u => (await one(`select teacher_status s from profiles where id = $1`, [u])).s;

/* 1 */
await as(ST);
let r = await call(`request_teacher_role()`);
ok('1  alter Weg: note_required', r.error === 'note_required', JSON.stringify(r));
ok('1  bleibt none', await status(ST) === 'none');

/* 2 */
r = await call(`request_teacher_access('kurz', 'a@b.de')`);
ok('2  Nachricht zu kurz', r.error === 'note_short');
r = await call(`request_teacher_access('Ich bin Frau Muster, Mathe', '')`);
ok('2  E-Mail Pflicht', r.error === 'email_required');
r = await call(`request_teacher_access('Ich bin Frau Muster, Mathe', 'kein-at')`);
ok('2  E-Mail ungültig', r.error === 'email_invalid');
ok('2  nichts gespeichert', await mails() === 0 && await status(ST) === 'none');

/* 3 */
r = await call(`request_teacher_access('Ich bin Frau Muster, Mathe, MPS', ' Frau.Muster@GMAIL.com ')`);
ok('3  Antrag gestellt (gmail erlaubt)', r.ok === true && r.status === 'pending', JSON.stringify(r));
const e = await one(`select email, verified_at from notify_email where user_id = $1`, [ST]);
ok('3  Adresse klein + unbestätigt', e?.email === 'frau.muster@gmail.com' && e.verified_at === null);
ok('3  Nachricht in teacher_requests', (await one(`select note from teacher_requests where user_id = $1`, [ST]))?.note === 'Ich bin Frau Muster, Mathe, MPS');
ok('3  eine Admin-Mail wartet', await mails() === 1);

/* 4 */
r = await call(`request_teacher_access('Neuer Text für den Admin', 'frau.muster@gmail.com')`);
ok('4  nochmal: ok, weiter pending', r.ok && r.status === 'pending');
ok('4  keine zweite Mail', await mails() === 1);

/* 5 */
r = await call(`mps_mail_claim()`);
ok('5  ohne admin_email: nichts', r.ok && r.admin === null);
await db.exec(`update mail_settings set admin_email = 'chef@example.org'`);
ok('5  mail_due sieht die Admin-Mail', await call(`mail_due()`) === true);
r = await call(`mps_mail_claim()`);
ok('5  claim: 1 Antrag an chef', r.admin?.count === 1 && r.admin.to === 'chef@example.org', JSON.stringify(r));
ok('5  keine Personendaten im Auftrag', !/muster|mia/i.test(JSON.stringify(r)));
await call(`mps_mail_done($1)`, [{ admin: { ids: r.admin.ids, ok: true } }]);
ok('5  gesendet', (await one(`select note from teacher_request_mail`)).note === 'gesendet');
ok('5  danach nichts fällig', (await call(`mps_mail_claim()`)).admin === null);
// entschieden, bevor die Mail rausgeht → fällt heraus
await as(NEU);
await call(`request_teacher_access('Herr Neu, Physik, MPS', 'neu@schule.de')`);
await db.exec(`update profiles set teacher_status = 'approved' where id = '${NEU}'`);
ok('5  entschieden → keine Mail', (await call(`mps_mail_claim()`)).admin === null);
await db.exec(`update profiles set teacher_status = 'none' where id = '${NEU}'`);

/* 6 */
await as(TL);
r = await call(`my_email_get()`);
ok('6  Lehrkraft ohne Adresse', r.ok && r.allowed === true && r.email === null);
r = await call(`my_email_set('lehrerin@web.de')`);
ok('6  nachgetragen', r.ok && r.email === 'lehrerin@web.de' && r.verified === false);
r = await call(`my_email_set('lehrerin2@web.de')`);
ok('6  zu schnell wieder geändert', r.error === 'too_soon');
await as(ST_B);
ok('6  Schüler: not_teacher', (await call(`my_email_set('x@y.de')`)).error === 'not_teacher');

/* 7 */
ok('7  Schüler: not_admin', (await call(`admin_teacher_requests()`)).error === 'not_admin');
await as(VA);
r = await call(`admin_teacher_requests()`);
const row = r.rows.find(x => x.user_id === ST);
ok('7  Volladmin sieht Nachricht + Adresse', row?.note === 'Neuer Text für den Admin' && row.email === 'frau.muster@gmail.com');
await db.exec(`update profiles set school_id = '${S2}' where id = '${ST}'`);
await as(SA);
r = await call(`admin_teacher_requests()`);
ok('7  Schuladmin: fremde Schule nicht', r.ok && !r.rows.some(x => x.user_id === ST));
await db.exec(`update profiles set school_id = '${S1}' where id = '${ST}'`);

/* 8 */
await db.query(`insert into auth.users (id) values ($1)`, [id(9)]);
await prof(id(9), S1, 'frisch');
await as(null);
r = await call(`teacher_request_store($1, 'Frau Frisch, Deutsch, Grundschule X', 'frisch@schule.de')`, [id(9)]);
ok('8  Signup-Weg: pending', r.ok && r.status === 'pending');
ok('8  Admin-Mail wartet', (await call(`mps_mail_claim()`)).admin?.count === 1);
r = await call(`teacher_request_store($1, 'Ich bin der Admin hier', 'a@b.de')`, [VA]);
ok('8  Admin kann nicht beantragen', r.error === 'already_admin');

/* 9 */
r = await call(`pw_reset_request('aaa', 'lehrerin', '1.1.1.1')`);
ok('9  unbestätigte Adresse: kein Link', r.ok && r.targets.length === 0);
await db.exec(`update notify_email set verified_at = now() where user_id = '${TL}'`);
r = await call(`pw_reset_request('bbb', 'lehrerin', '1.1.1.1')`);
ok('9  falsche Schule: kein Link', r.targets.length === 0);
r = await call(`pw_reset_request('aaa', 'LEHRERIN@web.de', '1.1.1.1')`);
ok('9  per E-Mail: Link', r.targets.length === 1 && r.targets[0].account_name === 'lehrerin');
r = await call(`pw_reset_request('aaa', 'lehrerin', '1.1.1.1')`);
const tok = r.targets[0]?.token;
ok('9  per Accountname: Link', /^[0-9a-f]{48}$/.test(tok || ''));
ok('9  Token nur gehasht gespeichert', !(await one(`select 1 x from pw_resets where token_hash = $1`, [tok])));
await db.query(`insert into notify_email (user_id, email, verify_token, stop_token, verified_at)
                values ($1, 'admin@x.de', 'a1', 's1', now())`, [VA]);
ok('9  Admin: kein Link', (await call(`pw_reset_request('aaa', 'volladmin', '1.1.1.1')`)).targets.length === 0);
await db.query(`insert into notify_email (user_id, email, verify_token, stop_token, verified_at)
                values ($1, 'ben@x.de', 'a2', 's2', now())`, [ST_B]);
ok('9  Schüler: kein Link', (await call(`pw_reset_request('bbb', 'ben', '1.1.1.1')`)).targets.length === 0);
ok('9  check gültig', (await call(`pw_reset_check($1)`, [tok])).ok === true);
r = await call(`pw_reset_take($1)`, [tok]);
ok('9  einlösen', r.ok && r.user_id === TL);
ok('9  zweites Mal ungültig', (await call(`pw_reset_take($1)`, [tok])).error === 'invalid');
ok('9  check danach falsch', (await call(`pw_reset_check($1)`, [tok])).ok === false);
ok('9  Unsinn ungültig', (await call(`pw_reset_take('abc')`)).error === 'invalid');

/* 10 */
r = await call(`pw_reset_request('aaa', 'lehrerin', '2.2.2.2')`);
ok('10 3. Link in der Stunde: ja', r.targets.length === 1);
r = await call(`pw_reset_request('aaa', 'lehrerin', '2.2.2.2')`);
ok('10 4. Link in der Stunde: keiner', r.ok && r.targets.length === 0);
for (let i = 0; i < 20; i++) await call(`pw_reset_request('aaa', 'niemand', '3.3.3.3')`);
ok('10 21. Anfrage je IP: rate_limit', (await call(`pw_reset_request('aaa', 'niemand', '3.3.3.3')`)).error === 'rate_limit');

/* 11 */
ok('11 notify_email_store nimmt jede Domain', await call(`notify_email_store($1, 'x@posteo.de')`, [OLD]) === null);
ok('11 und weist Unsinn ab', await call(`notify_email_store($1, 'x@@posteo')`, [id(8)]) === 'email_invalid');

/* 12 */
await db.exec(mig('0291_lehrkraft_antrag_mail_passwort.sql'));
ok('12 läuft zweimal', (await call(`mps_mail_claim()`)).ok === true);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
