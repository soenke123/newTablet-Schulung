/* Prüfstand für Migration 0203 — Mail an die Lehrkräfte bei neuen Anträgen.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0203 (ohne pg_net
   und pg_cron — die Migration muss trotzdem durchlaufen).

   Die Kernzusagen:
     1. Adresse nur @mps-ki.de, sonst email_domain / email_invalid;
        nur der Raum-Besitzer, nur angemeldet.
     2. Unbestätigt oder ohne Haken: kein Eintrag in der Warteschlange.
     3. Nur der Wechsel auf „offen" zählt: neu gestellt oder abgelehnt →
        neu abgeschickt. Ändern eines offenen Antrags und Anträge der
        Lehrkraft erzeugen nichts.
     4. Bündelung: erst wenn der älteste Eintrag 5 Min. alt ist, dann alle
        wartenden Anträge des Raums in einer Mail; nicht doppelt geholt.
     5. Inzwischen entschieden → keine Mail ('erledigt').
     6. Fehlschlag → nächster Lauf, nach 3 Versuchen aufgegeben.
     7. Bremse: 10 Mails je Lehrkraft und Stunde.
     8. Bestätigungsmail: wird geholt, Link bestätigt, Abmelde-Link löscht.
     9. mail_kick ohne pg_net: false, kein Fehler. Migration läuft zweimal.

   Aufruf:  node supabase/tests/0203_antrag_mail.mjs */
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
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T, OTHER]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $3, 'lehrer', 'Lehrer'), ($2, $3, 'andere', 'Andere')`, [T, OTHER, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ('PRJEKT', 'projekt', $1, $2, 'Klasse 8b') returning id`, [T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 't' || g, g, 'Kind ' || g from generate_series(1, 6) g`);
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const save  = (tok, ops) => call(`pa_save($1, $2)`, [tok, JSON.stringify(ops)]);
const tsave = (g, ops) => call(`pa_room_save('PRJEKT', $1, $2)`, [g, JSON.stringify(ops)]);
const nget  = () => call(`pa_room_notify_get('PRJEKT')`);
const nset  = (email, on, resend) => call(`pa_room_notify_set('PRJEKT', $1, $2, $3)`, [email ?? null, on ?? null, !!resend]);
const claim = () => call(`pa_mail_claim()`);
const done  = (res) => call(`pa_mail_done($1)`, [JSON.stringify(res)]);
const waiting = async () => (await one(`select count(*)::int n from pa_mail_outbox where sent_at is null`)).n;
const age = (min) => db.query(`update pa_mail_outbox set created_at = created_at - ($1 || ' minutes')::interval where sent_at is null`, [String(min)]);
const pid  = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const P = {};
for (let i = 1; i <= 6; i++) P[i] = await pid('t' + i);
const DAY = (await one(`select ((now() at time zone 'Europe/Berlin')::date + 3)::text d`)).d;
const req = (extra) => Object.assign({ date: DAY, place: 'Stadtbibliothek', who: [P[1]], activity: 'Recherche' }, extra);

const G1 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[2], P[1]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G1]);
const G2 = (await call(`pa_room_assign('PRJEKT', $1, null, $2)`, [P[4], P[3]])).group;
await call(`pa_room_plan('PRJEKT', $1)`, [G2]);
await call(`pa_group_rename('t1', 'Füchse')`);   // seit 0204 benennt die Gruppe selbst

/* ══ 1. Adresse ══════════════════════════════════════════════════ */
let r = await nget();
ok('1  am Anfang: keine Adresse, kein Haken', r.ok && r.email === null && !r.enabled && !r.verified && r.domain === 'mps-ki.de');
ok('1  fremde Domain: email_domain', (await nset('lehrer@gmail.com')).error === 'email_domain');
ok('1  Domain nur als Endung zählt: email_domain', (await nset('x@mps-ki.de.evil.com')).error === 'email_domain');
ok('1  kaputte Adresse: email_invalid', (await nset('a b@mps-ki.de')).error === 'email_invalid');
r = await nset('  Max.Muster@MPS-KI.de ', true);
ok('1  gültig: klein geschrieben, unbestätigt, Haken gesetzt',
   r.ok && r.email === 'max.muster@mps-ki.de' && r.pending && !r.verified && r.enabled, JSON.stringify(r));
ok('1  gleich danach eine andere Adresse: too_soon', (await nset('anders@mps-ki.de')).error === 'too_soon');
ok('1  Bestätigung sofort noch einmal: too_soon', (await nset(null, null, true)).error === 'too_soon');
await als(null);
ok('1  ohne Anmeldung: not_authenticated', (await nget()).error === 'not_authenticated');
await als(OTHER);
ok('1  fremde Lehrkraft: not_found', (await nset('andere@mps-ki.de', true)).error === 'not_found');
await als(T);

/* ══ 2. Unbestätigt: nichts in der Warteschlange ═════════════════ */
r = await save('t1', [{ op: 'put', kind: 'request', id: 'a', v: 0, data: req() }]);
ok('2  Antrag gestellt', r.ok, JSON.stringify(r).slice(0, 200));
ok('2  unbestätigte Adresse: keine Zeile', (await waiting()) === 0);

/* ══ 8a. Bestätigungsmail ════════════════════════════════════════ */
let c = await claim();
const vm = c.verify.find(x => x.user_id === T);
ok('8  Bestätigungsmail wird geholt', c.ok && vm && vm.email === 'max.muster@mps-ki.de' && /^[0-9a-f]{48}$/.test(vm.token) && vm.stop);
ok('8  … und kein zweites Mal', !(await claim()).verify.some(x => x.user_id === T));
await done({ verify: [{ user_id: T, ok: false }] });
ok('8  Versand fehlgeschlagen: beim nächsten Lauf wieder dabei', (await claim()).verify.some(x => x.user_id === T));
ok('8  falscher Link: not_found', (await call(`notify_email_verify('nix')`)).error === 'not_found');
r = await call(`notify_email_verify($1)`, [vm.token]);
ok('8  Link bestätigt', r.ok && !r.already && (await nget()).verified);
ok('8  zweiter Klick: already', (await call(`notify_email_verify($1)`, [vm.token])).already === true);

/* ══ 3. Wann ein Antrag zählt ════════════════════════════════════ */
r = await save('t1', [{ op: 'put', kind: 'request', id: 'b', v: 0, data: req() }]);
ok('3  neuer Antrag → eine Zeile', r.ok && (await waiting()) === 1);
r = await save('t2', [{ op: 'put', kind: 'request', id: 'b', v: 1, data: req({ place: 'Park' }) }]);
ok('3  offenen Antrag geändert → weiter eine Zeile', r.ok && (await waiting()) === 1);
await tsave(G1, [{ op: 'put', kind: 'request', id: 'L', v: 0, data: req({ status: 'open' }) }]);
ok('3  Antrag der Lehrkraft → nichts', (await waiting()) === 1);
r = await save('t3', [{ op: 'put', kind: 'request', id: 'z', v: 0, data: req({ who: [P[3]] }) }]);
ok('3  zweite Gruppe → zweite Zeile', r.ok && (await waiting()) === 2);

/* ══ 4. Bündelung ════════════════════════════════════════════════ */
c = await claim();
ok('4  nach weniger als 5 Min.: noch nichts', c.rooms.length === 0);
await age(6);
// Ein Antrag, der gerade erst kommt, fährt mit.
await save('t1', [{ op: 'put', kind: 'request', id: 'c', v: 0, data: req() }]);
c = await claim();
const room = c.rooms[0];
ok('4  dann eine Mail für den ganzen Raum mit allen drei Anträgen',
   c.rooms.length === 1 && room.items.length === 3 && room.ids.length === 3, JSON.stringify(c).slice(0, 400));
ok('4  Inhalt: Raum, Gruppe, Datum — keine Namen, kein Ort',
   room.room_code === 'PRJEKT' && room.room_title === 'Klasse 8b'
   && room.items.some(i => i.group === 'Füchse' && i.date === DAY)
   && !JSON.stringify(room.items).includes('Kind') && !JSON.stringify(room.items).includes('Park'));
ok('4  Empfänger: die bestätigte Adresse mit Abmelde-Link',
   room.to.length === 1 && room.to[0].email === 'max.muster@mps-ki.de' && room.to[0].stop);
ok('4  nicht doppelt geholt', (await claim()).rooms.length === 0);
await done({ rooms: [{ ids: room.ids, ok: true, sent_to: [T] }] });
ok('4  verschickt: nichts wartet mehr, ein Eintrag im Log',
   (await waiting()) === 0 && (await one(`select count(*)::int n from notify_mail_log`)).n === 1);
r = await save('t1', [{ op: 'put', kind: 'request', id: 'b', v: 2, data: req({ place: 'Museum' }) }]);
ok('4  offenen Antrag nach dem Versand geändert → keine neue Mail', r.ok && (await waiting()) === 0);

/* ══ 3b. Abgelehnt → neu abgeschickt ═════════════════════════════ */
let cur = await one(`select version, data from pa_items where group_id = $1 and item_id = 'b'`, [G1]);
await tsave(G1, [{ op: 'put', kind: 'request', id: 'b', v: cur.version, data: Object.assign({}, cur.data, { status: 'rejected' }) }]);
ok('3  Ablehnung durch die Lehrkraft → nichts', (await waiting()) === 0);
cur = await one(`select version, data from pa_items where group_id = $1 and item_id = 'b'`, [G1]);
r = await save('t2', [{ op: 'put', kind: 'request', id: 'b', v: cur.version, data: req({ place: 'Zoo' }) }]);
ok('3  überarbeitet neu abgeschickt → neue Zeile', r.ok && (await waiting()) === 1);
await age(6);
c = await claim();
ok('3  in der Mail als überarbeitet markiert', c.rooms[0] && c.rooms[0].items[0].resent === true);

/* ══ 6. Fehlschlag ═══════════════════════════════════════════════ */
await done({ rooms: [{ ids: c.rooms[0].ids, ok: false, error: 'smtp down' }] });
c = await claim();
ok('6  Fehlschlag: beim nächsten Lauf wieder dabei', c.rooms.length === 1);
await done({ rooms: [{ ids: c.rooms[0].ids, ok: false, error: 'smtp down' }] });
c = await claim();
await done({ rooms: [{ ids: c.rooms[0].ids, ok: false, error: 'smtp down' }] });
const gave = await one(`select sent_at, note from pa_mail_outbox order by id desc limit 1`);
ok('6  nach drei Versuchen aufgegeben', gave.sent_at && gave.note.startsWith('fehler: smtp down') && (await claim()).rooms.length === 0);

/* ══ 5. Inzwischen entschieden ═══════════════════════════════════ */
r = await save('t1', [{ op: 'put', kind: 'request', id: 'd', v: 0, data: req() }]);
await tsave(G1, [{ op: 'put', kind: 'request', id: 'd', v: 1, data: Object.assign({}, r.items[0].data, { status: 'approved' }) }]);
await age(6);
c = await claim();
const dn = await one(`select note from pa_mail_outbox where item_id = 'd'`);
ok('5  schon genehmigt: keine Mail, abgehakt', c.rooms.length === 0 && dn.note === 'erledigt');

/* ══ 7. Bremse ═══════════════════════════════════════════════════ */
await db.query(`insert into notify_mail_log (user_id) select $1 from generate_series(1, 10)`, [T]);
await save('t1', [{ op: 'put', kind: 'request', id: 'e', v: 0, data: req() }]);
await age(6);
c = await claim();
const en = await one(`select note from pa_mail_outbox where item_id = 'e'`);
ok('7  10 Mails in der letzten Stunde: diese fällt weg', c.rooms.length === 0 && en.note === 'kein_empfaenger');
await db.query(`delete from notify_mail_log`);

/* ══ 2b. Haken aus ═══════════════════════════════════════════════ */
ok('2  Haken aus', (await nset(null, false)).enabled === false);
await save('t1', [{ op: 'put', kind: 'request', id: 'f', v: 0, data: req() }]);
ok('2  ohne Haken: keine Zeile', (await waiting()) === 0);
await nset(null, true);

/* ══ 8b. Abmelden ════════════════════════════════════════════════ */
const stop = (await one(`select stop_token from notify_email where user_id = $1`, [T])).stop_token;
r = await call(`notify_email_stop($1)`, [stop]);
ok('8  Abmelde-Link: Adresse gelöscht', r.ok && r.email === 'max.muster@mps-ki.de' && (await nget()).email === null);
await save('t1', [{ op: 'put', kind: 'request', id: 'g', v: 0, data: req() }]);
ok('8  danach keine Zeile mehr', (await waiting()) === 0);
await db.query(`update notify_email set requested_at = now() - interval '5 minutes'`);
r = await nset('neu@mps-ki.de');
ok('8  neue Adresse: wieder unbestätigt', r.ok && r.pending && r.email === 'neu@mps-ki.de');
ok('8  leere Adresse löscht', (await nset('')).email === null);

/* ══ 9. Takt und Wiederholung ════════════════════════════════════ */
ok('9  mail_kick ohne pg_net: false', (await call(`mail_kick()`)) === false);
const before = (await one(`select count(*)::int n from pa_mail_outbox`)).n;
try { await db.exec(mig('0203_antrag_mail.sql')); ok('9  Migration läuft zweimal', true); }
catch (e) { ok('9  Migration läuft zweimal', false, e.message); }
ok('9  Warteschlange überlebt die Wiederholung', (await one(`select count(*)::int n from pa_mail_outbox`)).n === before);
ok('9  Haken überlebt die Wiederholung', (await one(`select enabled from pa_room_notify where room_id = $1`, [R])).enabled === true);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
