/* Prüfstand für Migration 0235 — Projektarbeit: Tätigkeitsbuch der
   Lehrkräfte. Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Nur Lehrkräfte des Raums (Besitzer + Eingeladene) lesen und
        schreiben; Fremde und Schüler-Accounts nicht.
     2. Gespeichert wird je Feld: zwei Lehrkräfte an zwei Gruppen
        überschreiben sich nicht. Leerer Text entfernt das Feld.
     3. Nur 'general' oder Gruppen DIESES Raums; aufgelöste Gruppe:
        vorhandener Text bleibt lesbar (Label) und änderbar.
     4. Neueste Kachel oben; Datum änderbar; löschen; geht mit dem Raum.

   Aufruf:  node supabase/tests/0235_projektarbeit_taetigkeitsbuch.mjs */
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

const OWNER = 'e0000000-0000-4000-8000-000000000001';
const CO    = 'e0000000-0000-4000-8000-000000000002';   // wird eingeladen
const NOT   = 'e0000000-0000-4000-8000-000000000003';   // keine Lehrkraft
const FAR   = 'e0000000-0000-4000-8000-000000000004';   // Lehrkraft, andere Schule
const THIRD = 'e0000000-0000-4000-8000-000000000005';   // dritte Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
const SCHOOL2 = (await one(`insert into schools (slug, name) values ('andere', 'Andere Schule') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)`, [OWNER, CO, NOT, FAR, THIRD]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status) values
  ($1, $6, 'besitzer', 'Frau Besitzer', 'approved'),
  ($2, $6, 'kollege',  'Herr Kollege',  'approved'),
  ($3, $6, 'schueler', 'Kollo Schüler', 'none'),
  ($4, $7, 'fern',     'Herr Kollfern', 'approved'),
  ($5, $6, 'dritte',   'Frau Dritte',   'approved')`, [OWNER, CO, NOT, FAR, THIRD, SCHOOL, SCHOOL2]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [OWNER, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 4) g`);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const view = (tok) => call(`pa_view($1, null)`, [tok]);
const tget = (g) => call(`pa_room_get('PRJEKT', $1)`, [g || null]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 4; i++) P[i] = await pid('t' + i);


await als(OWNER);
await call(`pa_room_teacher_add('PRJEKT', $1)`, [CO]);
const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
const G2 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[4], P[3]])).group;
ok('0  zwei Gruppen', !!G1 && !!G2);

/* ══ 1. Wer darf ═════════════════════════════════════════════ */
let r = await call(`pa_room_tlog_get('PRJEKT')`);
ok('1  leer am Anfang', r.ok && r.entries.length === 0, JSON.stringify(r));
r = await call(`pa_room_tlog_add('PRJEKT', null)`);
ok('1  Besitzer legt Kachel an (heute)', r.ok && r.entry.day === (await one(`select current_date::text d`)).d, JSON.stringify(r));
const E1 = r.entry.id;
await als(NOT);
ok('1  Schüler-Account: nicht lesen', (await call(`pa_room_tlog_get('PRJEKT')`)).error === 'not_found');
ok('1  Schüler-Account: nicht schreiben', (await call(`pa_room_tlog_set('PRJEKT', $1, null, 'general', 'x', null)`, [E1])).error === 'not_found');
await als(FAR);
ok('1  fremde Lehrkraft: nicht lesen', (await call(`pa_room_tlog_get('PRJEKT')`)).error === 'not_found');
await als(null);
ok('1  ohne Anmeldung: nein', (await call(`pa_room_tlog_get('PRJEKT')`)).error === 'not_authenticated');

/* ══ 2. Je Feld ══════════════════════════════════════════════ */
await als(OWNER);
r = await call(`pa_room_tlog_set('PRJEKT', $1, null, $2, 'Gruppe 1 gut', 'Gruppe 1 (Kind 1, Kind 2)')`, [E1, G1]);
ok('2  Besitzer schreibt Gruppe 1', r.ok && r.entry.texts[G1].t === 'Gruppe 1 gut' && r.entry.texts[G1].by === 'Frau Besitzer');
await als(CO);
r = await call(`pa_room_tlog_set('PRJEKT', $1, null, $2, '  Gruppe 2 langsam  ', 'Gruppe 2')`, [E1, G2]);
ok('2  Kollege schreibt Gruppe 2 (getrimmt)', r.ok && r.entry.texts[G2].t === 'Gruppe 2 langsam' && r.entry.texts[G2].by === 'Herr Kollege');
ok('2  … Gruppe 1 bleibt stehen', r.entry.texts[G1].t === 'Gruppe 1 gut');
r = await call(`pa_room_tlog_set('PRJEKT', $1, null, 'general', 'Allgemein', null)`, [E1]);
ok('2  Allgemeines ohne Label', r.ok && r.entry.texts.general.t === 'Allgemein' && !('l' in r.entry.texts.general));
r = await call(`pa_room_tlog_set('PRJEKT', $1, null, 'general', '', null)`, [E1]);
ok('2  leerer Text entfernt das Feld', r.ok && !('general' in r.entry.texts));
ok('2  zu lang: too_long', (await call(`pa_room_tlog_set('PRJEKT', $1, null, 'general', $2, null)`, [E1, 'x'.repeat(4001)])).error === 'too_long');

/* ══ 3. Schlüssel ════════════════════════════════════════════ */
ok('3  Fantasie-Schlüssel: not_found', (await call(`pa_room_tlog_set('PRJEKT', $1, null, 'quatsch', 'x', null)`, [E1])).error === 'not_found');
const R2 = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                       values ('ANDERS', 'projekt', $1, $2, 'Andere') returning id`, [OWNER, SCHOOL])).id;
await db.query(`insert into pa_groups (room_id, no) values ($1, 1)`, [R2]).catch(() => {});
const GX = (await one(`select id from pa_groups where room_id = $1 limit 1`, [R2]))?.id;
if (GX) ok('3  Gruppe eines anderen Raums: not_found', (await call(`pa_room_tlog_set('PRJEKT', $1, null, $2, 'x', null)`, [E1, GX])).error === 'not_found');
await als(OWNER);
ok('3  Gruppe 2 auflösen', (await call(`pa_room_group_delete('PRJEKT', $1)`, [G2])).ok);
r = await call(`pa_room_tlog_get('PRJEKT')`);
ok('3  Text der aufgelösten Gruppe bleibt mit Label', r.entries[0].texts[G2].l === 'Gruppe 2');
r = await call(`pa_room_tlog_set('PRJEKT', $1, null, $2, 'nachgetragen', null)`, [E1, G2]);
ok('3  … und bleibt änderbar (Label bleibt)', r.ok && r.entry.texts[G2].t === 'nachgetragen' && r.entry.texts[G2].l === 'Gruppe 2');

/* ══ 4. Reihenfolge, Datum, löschen, Raum weg ════════════════ */
r = await call(`pa_room_tlog_add('PRJEKT', '2026-01-05')`);
const E2 = r.entry.id;
r = await call(`pa_room_tlog_get('PRJEKT')`);
ok('4  neuester Tag oben', r.entries[0].id === E1 && r.entries[1].id === E2);
r = await call(`pa_room_tlog_set('PRJEKT', $1, '2099-01-01', null, null, null)`, [E2]);
ok('4  Datum ändern', r.ok && r.entry.day === '2099-01-01');
ok('4  … jetzt oben', (await call(`pa_room_tlog_get('PRJEKT')`)).entries[0].id === E2);
await als(CO);
ok('4  Kollege löscht Kachel', (await call(`pa_room_tlog_delete('PRJEKT', $1)`, [E2])).ok);
ok('4  zweimal löschen: not_found', (await call(`pa_room_tlog_delete('PRJEKT', $1)`, [E2])).error === 'not_found');
await db.query(`delete from skill_rooms where id = $1`, [R]);
ok('4  geht mit dem Raum', (await one(`select count(*)::int n from pa_tlog`)).n === 0);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
