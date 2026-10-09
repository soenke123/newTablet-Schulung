/* Prüfstand für Migration 0209 — Lebenszyklus der Konten.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0209.

   Die Kernzusagen:
     1. Solange lifecycle_since frisch ist, passiert niemandem etwas.
     2. 1 Jahr inaktiv: Inhalte weg, Profil + Highscores + Unterrichts-
        material bleiben, content_reset_at gesetzt; Geschenke an andere
        bleiben bei den anderen.
     3. Ein zweiter Lauf setzt nicht noch einmal zurück; wer danach
        wieder online war und erneut 1 Jahr weg ist, schon.
     4. 4 Jahre inaktiv: Konto gelöscht, Superadmin nie.
     5. Aktive Konten bleiben unberührt.
     6. touch_login gedrosselt; user_session zeigt content_reset_at.
     7. skill_cleanup ruft den Lauf mit auf; Migration läuft zweimal.

   Aufruf:  node supabase/tests/0209_konto_lebenszyklus.mjs */
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
const A  = 'e0000000-0000-4000-8000-0000000000a1';  // aktiv
const B  = 'e0000000-0000-4000-8000-0000000000b1';  // 13 Monate weg
const C  = 'e0000000-0000-4000-8000-0000000000c1';  // 5 Jahre weg
const SA = 'e0000000-0000-4000-8000-0000000000d1';  // Superadmin, 5 Jahre weg
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [A, B, C, SA]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, created_at, last_login_at)
                values ($1, $5, 'aktiv', 'Aktiv', now() - interval '6 years', now()),
                       ($2, $5, 'weg1',  'Weg1',  now() - interval '6 years', now() - interval '13 months'),
                       ($3, $5, 'weg5',  'Weg5',  now() - interval '6 years', now() - interval '5 years'),
                       ($4, $5, 'chef',  'Chef',  now() - interval '6 years', now() - interval '5 years')`,
               [A, B, C, SA, SCHOOL]);
await db.query(`update profiles set is_superadmin = true where id = $1`, [SA]);
const CL = (await one(`insert into clusters (school_id, name, opens_at, closes_at) values ($1, 'Kurs', now() - interval '1 day', now() + interval '1 day') returning id`, [SCHOOL])).id;
await db.query(`update profiles set cluster_id = $1, status = 'active'`, [CL]);

const G = (await one(`select id from games limit 1`)).id;
for (const u of [A, B, C]) {
  await db.query(`insert into game_state (user_id, game_id) values ($1, $2)`, [u, G]);
  await db.query(`insert into wallets (user_id) values ($1) on conflict do nothing`, [u]);
  await db.query(`insert into game_highscores (user_id, game_id) values ($1, $2)`, [u, G]);
  await db.query(`insert into user_game_saves (user_id, game_id, save) values ($1, $2, '{}')`, [u, G]);
  await db.query(`insert into feedback_tickets (user_id, author_name, category, body) values ($1, 'x', 'bug', 'Hallo')`, [u]);
  await db.query(`insert into notify_email (user_id, email, verify_token, stop_token) values ($1::uuid, $2 || '@mps-ki.de', 'v' || $2, 's' || $2)`, [u, u]);
}
await db.query(`insert into vocab_sets (title, owner_id, school_id) values ('Unit 1', $1, $2)`, [B, SCHOOL]);
await db.query(`insert into bonbon_gifts (giver_id, receiver_id, cluster_id, amount) values ($1, $2, $3, 1), ($2, $1, $3, 1)`, [B, A, CL]);

const n = async (tbl, u) => Number((await one(`select count(*) n from ${tbl} where ${tbl === 'profiles' ? 'id' : 'user_id'} = $1`, [u])).n);
const run = async () => (await one(`select account_lifecycle(50) v`)).v;

/* ══ 1. Frischer Stichtag ═══════════════════════════════════════ */
let r = await run();
ok('1  frischer Stichtag: niemand zurückgesetzt oder gelöscht', r.reset === 0 && r.deleted === 0, JSON.stringify(r));
ok('1  Inhalte von B noch da', (await n('game_state', B)) === 1);

await db.query(`update skill_maintenance set lifecycle_since = now() - interval '10 years'`);

/* ══ 2. Reset nach 1 Jahr ═══════════════════════════════════════ */
r = await run();
ok('2  Lauf: B und Superadmin zurückgesetzt, C gelöscht', r.reset === 2 && r.deleted === 1 && r.failed === 0, JSON.stringify(r));
ok('2  B: Profil bleibt', (await n('profiles', B)) === 1);
ok('2  B: Highscore bleibt', (await n('game_highscores', B)) === 1);
ok('2  B: Kurs bleibt (Handouts)', (await one(`select cluster_id from profiles where id = $1`, [B])).cluster_id === CL);
for (const t of ['game_state', 'wallets', 'user_game_saves', 'feedback_tickets', 'notify_email'])
  ok(`2  B: ${t} geleert`, (await n(t, B)) === 0);
ok('2  B: content_reset_at gesetzt', !!(await one(`select content_reset_at from profiles where id = $1`, [B])).content_reset_at);
ok('2  B: Unterrichtsmaterial bleibt', !!(await one(`select 1 x from vocab_sets where owner_id = $1`, [B])));
ok('2  Geschenk von B an A bleibt bei A', !!(await one(`select 1 x from bonbon_gifts where giver_id = $1 and receiver_id = $2`, [B, A])));
ok('2  Geschenk von A an B weg', !(await one(`select 1 x from bonbon_gifts where giver_id = $1 and receiver_id = $2`, [A, B])));

/* ══ 3. Kein zweiter Reset, aber nach neuer Pause schon ═════════ */
await db.query(`insert into game_state (user_id, game_id) values ($1, $2)`, [B, G]);
r = await run();
ok('3  zweiter Lauf: kein neuer Reset', r.reset === 0 && (await n('game_state', B)) === 1, JSON.stringify(r));
await db.query(`update profiles set last_login_at = now() - interval '13 months',
                                    content_reset_at = now() - interval '2 years' where id = $1`, [B]);
r = await run();
ok('3  wieder online, wieder 1 Jahr weg: erneut zurückgesetzt', r.reset === 1 && (await n('game_state', B)) === 0, JSON.stringify(r));

/* ══ 4. Löschung nach 4 Jahren ══════════════════════════════════ */
ok('4  C: Konto weg', !(await one(`select 1 x from auth.users where id = $1`, [C])) && (await n('profiles', C)) === 0);
ok('4  C: Highscores mit weg', (await n('game_highscores', C)) === 0);
ok('4  C: Feedback anonymisiert oder weg', (await n('feedback_tickets', C)) === 0);
ok('4  Superadmin bleibt', (await n('profiles', SA)) === 1);

/* ══ 5. Aktive bleiben ══════════════════════════════════════════ */
for (const t of ['game_state', 'wallets', 'feedback_tickets', 'notify_email'])
  ok(`5  A: ${t} unberührt`, (await n(t, A)) === 1);

/* ══ 6. touch_login + user_session ══════════════════════════════ */
await db.query('delete from _who'); await db.query('insert into _who values ($1)', [A]);
await db.query(`update profiles set last_login_at = now() - interval '5 minutes' where id = $1`, [A]);
const before = (await one(`select last_login_at t from profiles where id = $1`, [A])).t;
await db.query(`select touch_login()`);
ok('6  touch_login innerhalb 10 Minuten: kein Schreiben', +(await one(`select last_login_at t from profiles where id = $1`, [A])).t === +before);
await db.query(`update profiles set last_login_at = now() - interval '11 minutes' where id = $1`, [A]);
await db.query(`select touch_login()`);
ok('6  touch_login nach 11 Minuten: neu gesetzt', (await one(`select last_login_at > now() - interval '1 minute' x from profiles where id = $1`, [A])).x);
const us = await one(`select * from user_session where id = $1`, [B]);
ok('6  user_session hat content_reset_at', us && 'content_reset_at' in us && !!us.content_reset_at);

/* ══ 7. skill_cleanup + Wiederholung ════════════════════════════ */
const sc = (await one(`select skill_cleanup(5000) v`)).v;
ok('7  skill_cleanup meldet accounts', sc.ok && sc.accounts && 'reset' in sc.accounts, JSON.stringify(sc));
try { await db.exec(mig('0209_konto_lebenszyklus.sql')); ok('7  Migration läuft zweimal', true); }
catch (e) { ok('7  Migration läuft zweimal', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
