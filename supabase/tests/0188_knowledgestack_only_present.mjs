/* Prüfstand für Migration 0188 — Knowledge Stack: im ganzen Spiel
   nur, wer da ist (online und nicht stillgelegt).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0188 (Stubs und
   bekannte Abweichungen wie im Prüfstand 0187).

   Die Kernzusagen:
     1. Lobby: auf der Wiese nur Anwesende, darunter offline/stillgelegt.
     2. Quiz: Rangliste, Wand und Antwortzählung ohne Stillgelegte und
        Offline-Kinder — in jeder Phase.
     3. Tablet: Rang, Nachbarn und player_count unter Anwesenden.
     4. Stilllegen ändert die Beamer-Signatur.
     5. Wer wieder freigegeben wird, steht mit seinen Punkten wieder da.
     6. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0188_knowledgestack_only_present.mjs */
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
console.log('— 0001 … 0188 laufen durch —\n');

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
const get  = async () => (await one(`select ks_room_get('KNWSTK') v`)).v;
const sig  = async () => (await one(`select ks_room_sig('KNWSTK') v`)).v.sig;
const seats = (arr) => (arr || []).map(p => p.seat).join(',');
const nick = (arr) => (arr || []).map(p => p.nickname).join(',');

/* ══ 1. Lobby ════════════════════════════════════════════════════ */
await sperre('k2'); await offline('k3');
let g = await get();
ok('1  ks_room_get läuft', g.ok === true, g.error || '');
ok('1  Wiese: Kind 1, 4, 5', seats(g.players) === '1,4,5', seats(g.players));
ok('1  offline: Kind 3, stillgelegt: Kind 2',
   names(g.offline_members) === 'Kind 3' && names(g.blocked_members) === 'Kind 2');

/* ══ 2. Quiz ═════════════════════════════════════════════════════ */
// Alle wieder da, Quiz starten, alle antworten richtig.
await sperre('k2', false);
await db.exec(`update skill_participants set last_seen_at = now() where room_id = '${R}'`);
const st = (await one(`select ks_step('KNWSTK', 'lobby') v`)).v;
ok('2  Quiz gestartet', st.ok && st.phase === 'question', JSON.stringify(st));
await db.exec(`update ks_boards set phase_ends_at = now() + interval '8 seconds' where room_id = '${R}'`);
const q = (await one(`select options, correct_idx from ks_questions q join ks_boards b on b.catalog_id = q.catalog_id
                       where b.room_id = $1 order by q.sort_order, q.id limit 1`, [R]));
for (const t of ['k1', 'k2', 'k3', 'k4', 'k5']) {
  const a = (await one(`select ks_answer($1, 0, $2::smallint, 0) v`, [t, q.correct_idx])).v;
  if (!a.ok) ok(`2  ${t} antwortet`, false, JSON.stringify(a));
}
g = await get();
ok('2  vor dem Stilllegen: 5 Spieler, 5 Antworten', g.players.length === 5 && g.answers_total === 5,
   `${g.players.length}/${g.answers_total}`);

const s0 = await sig();
await sperre('k2'); await offline('k3');
ok('4  Stilllegen/Offline ändert ks_room_sig', (await sig()) !== s0);

g = await get();
ok('2  Frage: Wand ohne Kind 2 und 3', seats(g.players) === '1,4,5', seats(g.players));
ok('2  Frage: Antwortzählung ohne Kind 2 und 3', g.answers_total === 3, String(g.answers_total));
await one(`select ks_step('KNWSTK', 'question') v`);
g = await get();
ok('2  Auflösung: Rangliste ohne Kind 2 und 3',
   g.leaderboard.length === 3 && !nick(g.leaderboard).match(/Kind [23]/), nick(g.leaderboard));
ok('2  Auflösung: Plätze lückenlos 1…3', g.leaderboard.map(p => p.rank).join(',') === '1,2,3');
await one(`select ks_finish('KNWSTK') v`);
g = await get();
ok('2  Siegerehrung: Wand und Treppchen ohne Kind 2 und 3',
   seats(g.players) === '1,4,5' && !nick(g.leaderboard).match(/Kind [23]/));

/* ══ 3. Tablet ═══════════════════════════════════════════════════ */
const v1 = (await one(`select ks_view('k1') v`)).v;
ok('3  player_count zählt nur Anwesende', Number(v1.player_count) === 3, String(v1.player_count));
const all5 = [];
for (const t of ['k1', 'k4', 'k5']) all5.push((await one(`select ks_view($1) v`, [t])).v);
const nb = all5.flatMap(v => [v.neighbor_before, v.neighbor_after]).filter(Boolean).map(n => n.nickname);
ok('3  kein Nachbar ist Kind 2 oder 3', !nb.some(n => /Kind [23]/.test(n)), nb.join(','));
ok('3  Ränge 1…3', all5.map(v => v.me.rank).sort().join(',') === '1,2,3', all5.map(v => v.me.rank).join(','));

/* ══ 5. Zurück ═══════════════════════════════════════════════════ */
await sperre('k2', false);
await db.exec(`update skill_participants set last_seen_at = now() where token = 'k2'`);
g = await get();
const k2 = (g.players || []).find(p => p.seat === 2);
ok('5  freigegeben: Kind 2 steht mit seinen Punkten wieder da', k2 && k2.score > 0, JSON.stringify(k2));

/* ══ 6. Zweimal ══════════════════════════════════════════════════ */
try {
  await db.exec(mig('0188_knowledgestack_only_present.sql'));
  ok('6  0188 läuft ein zweites Mal', (await get()).ok === true);
} catch (e) {
  ok('6  0188 läuft ein zweites Mal', false, e.message);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
