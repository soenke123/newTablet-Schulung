/* Prüfstand für Migration 0227 — Fotos nach 30 Tagen, Protokoll der Löschläufe.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Fertig-Datum vor mehr als 30 Tagen: Fotos weg, photos_expired = n,
        Text bleibt, version und pa_rooms.rev steigen.
     2. Fertig-Datum vor 10 Tagen oder in der Zukunft: Fotos bleiben.
     3. Kein Fertig-Datum: zählt die letzte Aktivität im Raum (31 Tage → weg).
     4. Bilder im Projektziel bleiben, andere Arten unberührt.
     5. skill_cleanup protokolliert (täglich/beiläufig), meldet 'photos',
        alte Protokollzeilen (> 90 Tage) gehen.
     6. admin_cleanup_status: Admin sieht die Läufe, Lehrkraft/Schüler nicht;
        ohne pg_cron ist 'cron' null.
     7. Rechte: pa_photo_cleanup für niemanden, admin_cleanup_status nur
        authenticated, cleanup_runs ohne Grants.
     8. Wächter „geht mit dem Raum“: jeder Fremdschlüssel auf skill_rooms
        oder skill_participants löscht mit (CASCADE) oder lässt los (SET
        NULL); Spalten room_id/participant_id/user_id/owner_id ohne
        Fremdschlüssel nur, wo es Absicht ist (ERLAUBT_OHNE_FK). Ein
        abgelaufener Raum mit Backup und Mail-Ausgang hinterlässt nach
        skill_cleanup in keiner Tabelle eine Zeile.

   Aufruf:  node supabase/tests/0227_loeschfristen_fotos_protokoll.mjs */
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

const S1 = (await one(`insert into schools (slug, name) values ('aaa', 'Schule A') returning id`)).id;
const T1 = 'e0000000-0000-4000-8000-0000000000a1';  // Lehrkraft
const VA = 'e0000000-0000-4000-8000-0000000000a2';  // Volladmin
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, VA]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status)
                values ($1, $3, 't1', 'T1', 'approved'), ($2, $3, 'va', 'VA', 'none')`, [T1, VA, S1]);
await db.query(`update profiles set is_admin = true, is_superadmin = true where id = $1`, [VA]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(200);
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Ein Raum je Fall, damit „letzte Aktivität“ je Fall stimmt.
let codeN = 0;
async function setup(label, { due, lastActiveDaysAgo = 0 }) {
  const code = 'PH' + 'ABCDEFGH'[codeN++] + 'XYZ';
  const room = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title, last_active_at)
                           values ($1, 'projekt', $2, $3, $4, now() - ($5 || ' days')::interval) returning id`,
                          [code, T1, S1, label, String(lastActiveDaysAgo)])).id;
  await db.query(`insert into pa_rooms (room_id) values ($1) on conflict do nothing`, [room]);
  const grp = (await one(`insert into pa_groups (room_id, no, plan_open) values ($1, 1, true) returning id`, [room])).id;
  const goal = { title: 'Ziel', images: [PHOTO] };
  if (due) goal.due = due;
  await db.query(`insert into pa_items (room_id, group_id, kind, item_id, data) values
                   ($1, $2, 'goal', 'main', $3),
                   ($1, $2, 'log',  'l1',   $4),
                   ($1, $2, 'log',  'l2',   $5),
                   ($1, $2, 'task', 't1',   $6)`,
    [room, grp, JSON.stringify(goal),
     JSON.stringify({ text: 'Exkursion', photos: [PHOTO, PHOTO] }),
     JSON.stringify({ text: 'ohne Fotos' }),
     JSON.stringify({ title: 'Aufgabe', photos: [PHOTO] })]);
  return { room, grp };
}
const log = async (grp, id) => one(`select data, version from pa_items where group_id = $1 and kind = 'log' and item_id = $2`, [grp, id]);
const rev = async room => (await one(`select rev from pa_rooms where room_id = $1`, [room])).rev;

const A = await setup('alt', { due: day(-31) });
const B = await setup('frisch', { due: day(-10) });
const C = await setup('zukunft', { due: day(20) });
const D = await setup('ohne Datum, still', { lastActiveDaysAgo: 31 });
const E = await setup('ohne Datum, aktiv', { lastActiveDaysAgo: 5 });
const revA0 = await rev(A.room);

// 5: skill_cleanup ohne Aufrufer = täglich
await as(null);
await db.query(`insert into cleanup_runs (ran_at, source, result) values (now() - interval '91 days', 'täglich', '{}')`);
const res = (await one(`select skill_cleanup(5000) r`)).r;
ok('skill_cleanup meldet photos = 2 (Fall A und D)', res.photos === 2, JSON.stringify(res));

// 1
const a1 = await log(A.grp, 'l1');
ok('A: Fotos weg', !('photos' in a1.data));
ok('A: photos_expired = 2, Text bleibt', a1.data.photos_expired === 2 && a1.data.text === 'Exkursion');
ok('A: version gestiegen', a1.version === 2);
ok('A: pa_rooms.rev gestiegen', (await rev(A.room)) > revA0);
// 2
ok('B (Fertig vor 10 Tagen): Fotos bleiben', (await log(B.grp, 'l1')).data.photos.length === 2);
ok('C (Fertig in Zukunft): Fotos bleiben', (await log(C.grp, 'l1')).data.photos.length === 2);
// 3
ok('D (kein Datum, 31 Tage still): Fotos weg', !('photos' in (await log(D.grp, 'l1')).data));
ok('E (kein Datum, aktiv): Fotos bleiben', (await log(E.grp, 'l1')).data.photos.length === 2);
// 4
const g = await one(`select data from pa_items where group_id = $1 and kind = 'goal'`, [A.grp]);
ok('A: Bilder im Projektziel bleiben', g.data.images.length === 1);
const t = await one(`select data, version from pa_items where group_id = $1 and kind = 'task'`, [A.grp]);
ok('A: andere Arten unberührt', t.data.photos.length === 1 && t.version === 1);
ok('A: Eintrag ohne Fotos unberührt', (await log(A.grp, 'l2')).version === 1);

// 5 Protokoll
const runs = (await db.query(`select source, result from cleanup_runs order by ran_at desc`)).rows;
ok('Protokoll: Lauf als „täglich“ mit photos', runs[0]?.source === 'täglich' && runs[0]?.result?.photos === 2);
ok('Protokoll: Zeile älter als 90 Tage gelöscht', runs.length === 1, String(runs.length));
await as(T1);
await one(`select skill_cleanup(10) r`);
ok('Protokoll: mit Aufrufer „beiläufig“', (await one(`select source from cleanup_runs order by id desc limit 1`)).source === 'beiläufig');
ok('zweiter Lauf: nichts mehr zu tun', (await one(`select result->>'photos' p from cleanup_runs order by id desc limit 1`)).p === '0');

// 6
await as(VA);
const st = (await one(`select admin_cleanup_status() r`)).r;
ok('Admin: sieht die Läufe', st.ok && st.runs.length === 2 && st.runs[0].source === 'beiläufig');
ok('Admin: ohne pg_cron ist cron null', st.cron === null);
await as(T1);
ok('Lehrkraft: forbidden', (await one(`select admin_cleanup_status() r`)).r.error === 'forbidden');
await as(null);
ok('ohne Anmeldung: forbidden', (await one(`select admin_cleanup_status() r`)).r.error === 'forbidden');

// 7
const pr = await one(`select
  has_function_privilege('anon', 'pa_photo_cleanup(int)', 'execute') a1,
  has_function_privilege('authenticated', 'pa_photo_cleanup(int)', 'execute') a2,
  has_function_privilege('anon', 'admin_cleanup_status()', 'execute') b1,
  has_function_privilege('authenticated', 'admin_cleanup_status()', 'execute') b2,
  has_table_privilege('authenticated', 'cleanup_runs', 'select') c1,
  has_table_privilege('anon', 'cleanup_runs', 'select') c2`);
ok('pa_photo_cleanup für niemanden', !pr.a1 && !pr.a2);
ok('admin_cleanup_status nur authenticated', !pr.b1 && pr.b2);
ok('cleanup_runs ohne Grants', !pr.c1 && !pr.c2);

// 8 Wächter
const fks = (await db.query(`
  select c.conrelid::regclass::text tab, c.confrelid::regclass::text ref, c.confdeltype del
    from pg_constraint c
   where c.contype = 'f' and c.confrelid::regclass::text in ('skill_rooms', 'skill_participants')`)).rows;
const hart = fks.filter(f => !['c', 'n'].includes(f.del));
ok(`Fremdschlüssel auf Raum/Teilnehmer: alle CASCADE oder SET NULL (${fks.length})`, hart.length === 0,
   hart.map(f => `${f.tab} → ${f.ref}`).join(', '));

// Absicht, mit Grund:
const ERLAUBT_OHNE_FK = new Set([
  'skill_usage.room_id',        // 0216: anonyme Nutzungszahl, soll den Raum überleben
  'notify_mail_log.user_id',    // 0203: Mail-Bremse, wird nach 2 Tagen gelöscht
]);
const lose = (await db.query(`
  select c.relname || '.' || a.attname x
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not a.attisdropped
     and a.attname in ('room_id', 'participant_id', 'user_id', 'owner_id')
     and not exists (select 1 from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey))`)).rows
  .map(r => r.x).filter(x => !ERLAUBT_OHNE_FK.has(x));
ok('keine weiteren Raum-/Personen-Spalten ohne Fremdschlüssel', lose.length === 0, lose.join(', '));

await as(null);
await db.query(`insert into pa_backups (room_id, kind, data) values ($1, 'auto', '{}')`, [A.room]);
await db.query(`insert into pa_mail_outbox (room_id, group_id, item_id) values ($1, $2, 'r1')`, [A.room, A.grp]);
// pa_room_lifetime (0202) hält Projektarbeit-Räume ein Jahr — für den Test
// die Frist am Trigger vorbei abgelaufen setzen.
await db.exec(`alter table skill_rooms disable trigger pa_room_lifetime`);
await db.query(`update skill_rooms set expires_at = now() - interval '1 minute' where id = $1`, [A.room]);
await db.exec(`alter table skill_rooms enable trigger pa_room_lifetime`);
const del = (await one(`select skill_cleanup(5000) r`)).r;
ok('abgelaufener Raum wird gelöscht', del.rooms === 1, JSON.stringify(del));
const tabs = (await db.query(`
  select c.relname t from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and a.attname = 'room_id' and not a.attisdropped and c.relname <> 'skill_usage'`)).rows;
const rest = [];
for (const { t } of tabs) {
  const n = (await one(`select count(*)::int n from ${t} where room_id = $1`, [A.room])).n;
  if (n) rest.push(`${t}: ${n}`);
}
ok(`nach dem Löschen keine Zeile mehr in ${tabs.length} Tabellen mit room_id`, rest.length === 0, rest.join(', '));

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
