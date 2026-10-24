/* Prüfstand für Migration 0218 — Profilbilder aus Wild Clusters,
   Balance of Nature und Knowledge Stack (mit Gold).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0218.

     1. Wild Clusters: Phase 3 → alle zehn Tiere, auch für Lehrkräfte
        und wer sich später anmeldet.
     2. Balance of Nature: geteilte Szenarien → ihre Figuren.
     3. Knowledge Stack: Ende → eigenes Wesen für alle mit Antwort,
        Gold nur für Platz 1 (Punkte > 0, mind. zwei Anwesende).
     4. Konto-Reset (0209) räumt ab.

   Aufruf:  node supabase/tests/0218_mps_avatare_skills.mjs */
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

const A = 'e0000000-0000-4000-8000-0000000000c1';  // Schüler A
const B = 'e0000000-0000-4000-8000-0000000000c2';  // Schüler B
const T = 'e0000000-0000-4000-8000-0000000000c3';  // Lehrkraft (Besitzer)
const C = 'e0000000-0000-4000-8000-0000000000c4';  // eingeladene Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [A, B, T, C]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status)
                values ($1, $5, 'a', 'A', 'active'), ($2, $5, 'b', 'B', 'active'),
                       ($3, $5, 't', 'T', 'active'), ($4, $5, 'c', 'C', 'active')`,
               [A, B, T, C, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); await db.query(`insert into _who values ($1)`, [u]); };
const mine = async u => { await as(u); return (await one(`select mps_my_avatars() as r`)).r.avatars.map(x => x.id).sort(); };
const reset = () => db.exec(`delete from mps_avatar_unlocks`);

async function room(code, tool) {
  return (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                     values ($1, $2, $3, $4, 'R') returning id`, [code, tool, T, SCHOOL])).id;
}
const seat = async (r, n, uid) => (await one(
  `insert into skill_participants (room_id, token, seat, name, user_id)
   values ($1, $2, $3, $4, $5) returning id`, [r, r + n, n, 'S' + n, uid])).id;
const state = (r, phase, data) => db.query(
  `insert into skill_room_state (room_id, phase, data) values ($1, $2, $3)
   on conflict (room_id) do update set phase = excluded.phase, data = excluded.data`,
  [r, phase, JSON.stringify(data)]);

/* 1 Wild Clusters */
const W = await room('WWWWWW', 'wildclusters');
await seat(W, 1, A);
await seat(W, 2, null);
await db.query(`insert into skill_room_teachers (room_id, user_id) values ($1, $2)`, [W, C]);
await state(W, 2, {});
ok('1  Phase 2: noch nichts', (await mine(A)).length === 0);
await state(W, 3, { rw: false, ra: false });
ok('1  Phase 3: A hat alle zehn Tiere', (await mine(A)).length === 10, JSON.stringify(await mine(A)));
ok('1  Besitzer und eingeladene Lehrkraft auch', (await mine(T)).length === 10 && (await mine(C)).length === 10);
await state(W, 3, { rw: true, ra: true });
ok('1  erneutes Schreiben: keine Dubletten', (await one(`select count(*)::int n from mps_avatar_unlocks where user_id = $1`, [A])).n === 10);
const late = await seat(W, 3, null);
await db.query(`update skill_participants set user_id = $1 where id = $2`, [B, late]);
ok('1  später angemeldet: B bekommt sie nach', (await mine(B)).length === 10);
await reset();

/* 2 Balance of Nature */
const N = await room('NNNNNN', 'balance');
await seat(N, 1, A);
await state(N, 1, { shared: [] });
ok('2  nichts geteilt: nichts', (await mine(A)).length === 0);
await state(N, 1, { shared: [2] });
ok('2  Szenario 2: Adler + Laufvogel', JSON.stringify(await mine(A)) === '["mps_balance_adler","mps_balance_laufvogel"]', JSON.stringify(await mine(A)));
await state(N, 1, { shared: [2, 1] });
ok('2  + Szenario 1: Wolf + Hirsch dazu', (await mine(A)).length === 4);
await state(N, 1, { shared: [4] });
ok('2  Szenario 4: alle zwölf', (await mine(A)).length === 12, String((await mine(A)).length));
await state(N, 1, { shared: ['x', 9] });
ok('2  Unsinn in shared bricht nichts', (await mine(A)).length === 12);
await reset();

/* 3 Knowledge Stack */
const K = await room('KKKKKK', 'knowledgestack');
await db.query(`insert into ks_boards (room_id, phase) values ($1, 'reveal')`, [K]);
const pA = await seat(K, 1, A);
const pB = await seat(K, 2, B);
const pG = await seat(K, 3, null);
const pX = await seat(K, 4, T);   // in der Lobby, nie geantwortet
const player = (p, cid, score) => db.query(
  `insert into ks_players (participant_id, room_id, creature_id, score) values ($1, $2, $3, $4)`, [p, K, cid, score]);
await player(pA, 0, 900);    // Puddl
await player(pB, 39, 400);   // Howl
await player(pG, 5, 1200);   // Gast gewinnt …
await player(pX, 7, 0);
const answer = p => db.query(
  `insert into ks_answers (room_id, question_idx, participant_id, chosen_idx, is_correct) values ($1, 0, $2, 0, true)`, [K, p]);
await answer(pA); await answer(pB); await answer(pG);
await db.query(`update ks_boards set phase = 'ended' where room_id = $1`, [K]);
ok('3  A bekommt sein Wesen', JSON.stringify(await mine(A)) === '["mps_knowledgestack_puddl"]', JSON.stringify(await mine(A)));
ok('3  B bekommt Howl', JSON.stringify(await mine(B)) === '["mps_knowledgestack_howl"]');
ok('3  nie geantwortet: nichts', (await mine(T)).length === 0);
ok('3  Gast gewinnt: kein Gold für jemand anderen', (await one(`select count(*)::int n from mps_avatar_unlocks where avatar_id like '%_gold'`)).n === 0);

await db.query(`update ks_boards set phase = 'lobby' where room_id = $1`, [K]);
await db.query(`update ks_players set score = 0 where participant_id = $1`, [pG]);
await db.query(`update ks_boards set phase = 'ended' where room_id = $1`, [K]);
ok('3  A ist Erste: Puddl in Gold', JSON.stringify(await mine(A)) === '["mps_knowledgestack_puddl","mps_knowledgestack_puddl_gold"]', JSON.stringify(await mine(A)));
ok('3  B (Zweiter) kein Gold', (await mine(B)).length === 1);

await reset();
await db.query(`update skill_participants set last_seen_at = now() - interval '1 hour' where id <> $1 and room_id = $2`, [pA, K]);
await db.query(`update ks_boards set phase = 'lobby' where room_id = $1`, [K]);
await db.query(`update ks_boards set phase = 'ended' where room_id = $1`, [K]);
ok('3  allein anwesend: Wesen ja, Gold nein', JSON.stringify(await mine(A)) === '["mps_knowledgestack_puddl"]', JSON.stringify(await mine(A)));

/* 4 Konto-Reset */
await db.query(`select account_reset_content($1)`, [A]);
ok('4  Konto-Reset räumt ab', (await mine(A)).length === 0);

console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);
