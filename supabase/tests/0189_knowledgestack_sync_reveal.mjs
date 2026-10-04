/* Prüfstand für Migration 0189 — Knowledge Stack: Antworten auf allen
   Geräten im selben Augenblick.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0189 (Stubs wie
   im Prüfstand 0188).

   Die Kernzusagen:
     1. ks_sig / ks_room_sig liefern server_now (Uhrabgleich), die
        Signatur selbst bleibt, wie sie war.
     2. ks_answer: mehr als 1 s vor dem Aufdecken → reading_phase;
        knapp davor → angenommen mit 0 ms; die Zeit ist die
        Gerätezeit, eingefasst in [Serverzeit − 1,5 s, Serverzeit].
     3. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0189_knowledgestack_sync_reveal.mjs */
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
const all = async (sql, params) => (await db.query(sql, params)).rows;
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');
const BEKANNT = new Set(['0087']);

await db.exec(STUBS);
for (const f of readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log('— 0001 … 0189 laufen durch —\n');

/* ── Lehrkraft, Schule, ein Raum ───────────────────────────────── */
const T     = 'e0000000-0000-4000-8000-000000000001';
const OTHER = 'e0000000-0000-4000-8000-000000000002';
const KID   = 'e0000000-0000-4000-8000-000000000003';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [T, OTHER, KID]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $4, 'lehrer', 'Lehrer'), ($2, $4, 'andere', 'Andere'),
                       ($3, $4, 'kind', 'Kind')`, [T, OTHER, KID, SCHOOL]);
const als = async (uid) => { await db.query('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const raum = async (code, tool) => (await one(
  `insert into skill_rooms (code, tool_id, owner_id, school_id, title)
   values ($1, $2, $3, $4, $1) returning id`, [code, tool, T, SCHOOL])).id;
const kinder = async (room, prefix, n) => db.exec(
  `insert into skill_participants (room_id, token, seat, name)
   select '${room}', '${prefix}' || g, g, 'Kind ' || g from generate_series(1, ${n}) g`);
const offline = (tok) => db.exec(
  `update skill_participants set last_seen_at = now() - interval '5 minutes' where token = '${tok}'`);
const sperre = (tok, on = true) => db.exec(
  `update skill_participants set blocked = ${on}, blocked_at = ${on ? 'now()' : 'null'} where token = '${tok}'`);
const pid = async (tok) => (await one(`select id from skill_participants where token = $1`, [tok])).id;
const names = (arr) => (arr || []).map(x => typeof x === 'string' ? x : x.name).join(',');

const R = await raum('KNWSTK', 'knowledgestack');
await kinder(R, 'k', 5);
for (const t of ['k1', 'k2', 'k3', 'k4', 'k5']) await one(`select ks_view($1) v`, [t]);


/* ══ 1. Uhrproben in den Signaturen ═════════════════════════════ */
const rs = (await one(`select ks_room_sig('KNWSTK') v`)).v;
const ts = (await one(`select ks_sig('k1') v`)).v;
const jetzt = Date.now();
ok('1  ks_room_sig: server_now', rs.ok && Math.abs(new Date(rs.server_now) - jetzt) < 5000, rs.server_now);
ok('1  ks_sig: server_now', ts.ok && Math.abs(new Date(ts.server_now) - jetzt) < 5000, ts.server_now);
ok('1  sig selbst unverändert (keine Uhr darin)', !String(ts.sig).includes('T') && ts.sig.split(':').length === 9, ts.sig);

/* ══ 2. Antworten rund ums Aufdecken ════════════════════════════ */
const st = (await one(`select ks_step('KNWSTK', 'lobby') v`)).v;
ok('2  Quiz gestartet', st.ok && st.phase === 'question', JSON.stringify(st));
const lim = (await one(`select q.time_limit_sec t from ks_questions q join ks_boards b on b.catalog_id = q.catalog_id
                         where b.room_id = $1 order by q.sort_order, q.id limit 1`, [R])).t;
const q = await one(`select correct_idx from ks_questions q join ks_boards b on b.catalog_id = q.catalog_id
                      where b.room_id = $1 order by q.sort_order, q.id limit 1`, [R]);
// Aufdecken in X Sekunden (negativ: liegt X Sekunden zurück)
const aufdecken = (sek) => db.exec(
  `update ks_boards set phase_ends_at = now() + (${lim} + ${sek}) * interval '1 second' where room_id = '${R}'`);
const antw = async (tok, ms) => (await one(`select ks_answer($1, 0, $2::smallint, $3) v`, [tok, q.correct_idx, ms])).v;

await aufdecken(3);
let a = await antw('k1', 0);
ok('2  3 s vor dem Aufdecken: reading_phase', a.ok === false && a.error === 'reading_phase', JSON.stringify(a));

await aufdecken(0.5);
a = await antw('k1', 0);
ok('2  0,5 s vor dem Aufdecken: angenommen, zählt als sofort', a.ok && a.response_ms === 0, JSON.stringify(a));

await aufdecken(-5);
a = await antw('k2', 4000);
ok('2  Gerät 4,0 s, Server ~5 s: Gerätezeit gilt', a.ok && a.response_ms === 4000, JSON.stringify(a));
a = await antw('k3', 0);
ok('2  Gerät 0 s, Server ~5 s: höchstens 1,5 s darunter',
   a.ok && a.response_ms >= 3400 && a.response_ms <= 3700, JSON.stringify(a));
a = await antw('k4', 9000);
ok('2  Gerät 9 s, Server ~5 s: nie mehr als die Serverzeit',
   a.ok && a.response_ms >= 4900 && a.response_ms <= 5300, JSON.stringify(a));
a = await antw('k5', null);
ok('2  ohne Gerätezeit: Serverzeit', a.ok && a.response_ms >= 4900 && a.response_ms <= 5300, JSON.stringify(a));
const p2 = (await one(`select points_awarded from ks_answers a join skill_participants sp on sp.id = a.participant_id
                        where sp.token = 'k2'`)).points_awarded;
const p4 = (await one(`select points_awarded from ks_answers a join skill_participants sp on sp.id = a.participant_id
                        where sp.token = 'k4'`)).points_awarded;
ok('2  schneller heißt mehr Punkte', p2 > p4, `${p2} > ${p4}`);

/* ══ 3. Zweimal ══════════════════════════════════════════════════ */
try {
  await db.exec(mig('0189_knowledgestack_sync_reveal.sql'));
  ok('3  0189 läuft ein zweites Mal', (await one(`select ks_sig('k1') v`)).v.ok === true);
} catch (e) {
  ok('3  0189 läuft ein zweites Mal', false, e.message);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
