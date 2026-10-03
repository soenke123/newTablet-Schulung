/* Prüfstand für Migration 0187 — online, offline, stillgelegt, entfernt.
   Echt gerechnet in pglite, und zwar auf der GANZEN Kette 0001…0187:
   0187 fasst die generische Schicht, Kingdoms, Wordisland und
   Knowledge Stack zugleich an, und jede davon hat ihre eigene
   Vorgeschichte.

   Bekannte Abweichungen von Supabase, die hier still übergangen
   werden (sie liegen vor 0187 und haben mit ihr nichts zu tun):
     · 0087 — pglite lehnt „drop not null" auf einer Spalte im
       Primärschlüssel ab, die Migration löst den Schlüssel erst danach.

   Die Kernzusagen:
     1. Ein stillgelegtes Gerät bleibt anwesend (skill_sig frischt
        last_seen_at auf) — „stillgelegt" und „offline" sind
        unterscheidbar.
     2. skill_room_remove: nur die Besitzerin; danach 'removed' aus
        skill_sig UND skill_view, raus aus der Teilnehmerliste, raus
        aus „Meine Räume", Stilllegung aufgehoben, nichts gelöscht.
     3. Zurück per Token (skill_room_return) oder per User-ID
        (skill_room_join) — derselbe Platz.
     4. skill_absent_json: stillgelegt + offline ist offline.
     5. Kingdoms: offline_members und blocked_members getrennt.
     6. Wordisland: Offline-Kinder bekommen beim Start kein Volk, ein
        Nachzügler landet im kleinsten Volk.
     7. Knowledge Stack: die Lobby-Wiese zeigt nur Anwesende.
     8. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0187_skill_participant_status.mjs */
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
console.log('— 0001 … 0187 laufen durch —\n');

/* ── Lehrkraft, Schule, drei Räume ─────────────────────────────── */
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

/* ══ 1. Stillgelegt bleibt anwesend ═════════════════════════════ */
const R1 = await raum('GENRCA', 'wordcloud');
await kinder(R1, 'g', 4);
await sperre('g1');
await offline('g1');
const s1 = (await one(`select skill_sig('g1') v`)).v;
ok('1  skill_sig antwortet einem stillgelegten Gerät weiter mit blocked', s1.error === 'blocked');
const frisch = (await one(`select last_seen_at > now() - interval '10 seconds' f from skill_participants where token='g1'`)).f;
ok('1  … und frischt dabei last_seen_at auf', frisch === true);

/* ══ 2. Entfernen ════════════════════════════════════════════════ */
await db.exec(`insert into skill_room_entries (room_id, participant_id, kind, payload)
               select '${R1}', id, 'entry', '{"text":"Hallo"}' from skill_participants where token='g2'`);
await db.exec(`update skill_participants set user_id = '${KID}' where token='g2'`);
await sperre('g2');

await als(OTHER);
ok('2  eine fremde Lehrkraft kann nicht entfernen',
   (await one(`select skill_room_remove('GENRCA', $1) v`, [await pid('g2')])).v.error === 'not_found');
await als(T);
const rm = (await one(`select skill_room_remove('GENRCA', $1) v`, [await pid('g2')])).v;
ok('2  die Besitzerin kann entfernen', rm.ok === true, JSON.stringify(rm));
ok('2  skill_sig sagt removed', (await one(`select skill_sig('g2') v`)).v.error === 'removed');
ok('2  skill_view sagt removed', (await one(`select skill_view('g2') v`)).v.error === 'removed');
const g2 = await one(`select blocked, left_at, removed_at,
                             last_seen_at < now() - interval '90 seconds' as off
                        from skill_participants where token='g2'`);
ok('2  Stilllegung aufgehoben, left_at gesetzt, sofort offline',
   g2.blocked === false && g2.left_at && g2.removed_at && g2.off === true);
const leute = (await one(`select skill_people_json($1) v`, [R1])).v;
ok('2  in der Teilnehmerliste steht das Kind nicht mehr',
   leute.length === 3 && !leute.some(p => p.name === 'Kind 2'), names(leute));
ok('2  sein Beitrag steht noch',
   Number((await one(`select count(*) n from skill_room_entries where room_id=$1`, [R1])).n) === 1);
ok('2  zweimal entfernen geht nicht (not_found)',
   (await one(`select skill_room_remove('GENRCA', $1) v`, [await pid('g2')])).v.error === 'not_found');
ok('2  skill_view eines anderen Kindes läuft weiter',
   (await one(`select skill_view('g3') v`)).v.ok === true);

/* ══ 3. Zurück ═══════════════════════════════════════════════════ */
const zur = (await one(`select skill_room_join('GENRCA', null, $1) v`, [KID])).v;
ok('3  angemeldet: skill_room_join findet denselben Platz', zur.ok && zur.rejoined && zur.seat === 2);
ok('3  … und removed_at ist weg',
   (await one(`select removed_at from skill_participants where token='g2'`)).removed_at === null);
ok('3  skill_sig läuft wieder', (await one(`select skill_sig('g2') v`)).v.ok === true);

await db.exec(`update skill_rooms set join_open = false where id='${R1}'`);
await one(`select skill_room_remove('GENRCA', $1) v`, [await pid('g3')]);
const back = (await one(`select skill_room_return('g3') v`)).v;
ok('3  ohne Anmeldung: skill_room_return mit dem Token, auch bei geschlossenem Beitritt',
   back.ok && back.seat === 3, JSON.stringify(back).slice(0, 80));
ok('3  skill_view läuft wieder', (await one(`select skill_view('g3') v`)).v.ok === true);
ok('3  ein unbekannter Token kommt nicht zurück',
   (await one(`select skill_room_return('gibtsnicht') v`)).v.error === 'unknown_token');

/* ══ 4. skill_absent_json ════════════════════════════════════════ */
// g1: stillgelegt + online (seit 1), g4: offline, g2: stillgelegt + offline
await sperre('g2'); await offline('g2'); await offline('g4');
const abs = (await one(`select skill_absent_json($1) v`, [R1])).v;
ok('4  offline: Kind 2 (stillgelegt + offline) und Kind 4',
   names(abs.offline) === 'Kind 2,Kind 4', names(abs.offline));
ok('4  stillgelegt: nur Kind 1', names(abs.blocked) === 'Kind 1', names(abs.blocked));

/* ══ 5. Kingdoms ═════════════════════════════════════════════════ */
const R2 = await raum('KNGDMS', 'clash-of-math');
await kinder(R2, 'c', 6);
await sperre('c2');            // online + stillgelegt
await offline('c3');           // offline
await sperre('c4'); await offline('c4');   // stillgelegt + offline → offline
await one(`select skill_room_remove('KNGDMS', $1) v`, [await pid('c5')]);
const cg = (await one(`select clash_room_get('KNGDMS') v`)).v;
ok('5  clash_room_get läuft', cg.ok === true, cg.error || '');
ok('5  offline_members: Kind 3 und Kind 4', names(cg.offline_members) === 'Kind 3,Kind 4', names(cg.offline_members));
ok('5  blocked_members: Kind 2', names(cg.blocked_members) === 'Kind 2', names(cg.blocked_members));
const vorschau = await all(`select participant_id from clash_preview_teams($1)`, [R2]);
ok('5  verteilt werden nur Kind 1 und Kind 6', vorschau.length === 2, `${vorschau.length}`);
await als(OTHER);
ok('5  eine fremde Lehrkraft sieht nichts',
   (await one(`select clash_room_get('KNGDMS') v`)).v.ok !== true);
await als(T);

/* ══ 6. Wordisland ═══════════════════════════════════════════════ */
const R3 = await raum('WRDSLD', 'wordisland');
await kinder(R3, 'w', 8);
const set = (await one(`select id from vocab_sets order by title limit 1`)).id;
const setup = (await one(`select wi_room_setup('WRDSLD', $1, 2, 600, 'de_en', 'type') v`, [[set]])).v;
ok('6  wi_room_setup läuft', setup.ok === true, JSON.stringify(setup));
await offline('w7'); await offline('w8'); await sperre('w6');
const st = (await one(`select wi_room_start('WRDSLD') v`)).v;
ok('6  wi_room_start läuft', st.ok === true, JSON.stringify(st));
const rows = await all(`select p.token, w.team_index from wi_players w
                          join skill_participants p on p.id = w.participant_id
                         where w.room_id = $1 order by p.seat`, [R3]);
ok('6  verteilt: Kind 1 … 5, nicht 6 (stillgelegt), nicht 7/8 (offline)',
   rows.map(r => r.token).join(',') === 'w1,w2,w3,w4,w5', rows.map(r => r.token).join(','));
const koepfe = (await one(`select wi_teams_json($1, 2) v`, [R3])).v.map(t => t.people);
ok('6  Kopfzahl 3+2', koepfe.join('+') === '3+2', koepfe.join('+'));
// Kind 7 kommt online: Nachzügler ins kleinste Volk (Volk 1 mit zwei Kindern)
await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second' where room_id='${R3}'`);
await one(`select wi_view('w7', false) v`);
const w7 = await one(`select w.team_index from wi_players w join skill_participants p on p.id = w.participant_id where p.token='w7'`);
ok('6  Nachzügler Kind 7 landet im kleinsten Volk', w7 && Number(w7.team_index) === 1, JSON.stringify(w7));
const v7 = (await one(`select wi_view('w7', false) v`)).v;
ok('6  … und bekommt eine Vokabel', v7.ok === true && v7.me && v7.me.task, JSON.stringify(v7.me && v7.me.task).slice(0, 60));
await one(`select skill_room_remove('WRDSLD', $1) v`, [await pid('w1')]);
const wg = (await one(`select wi_room_get('WRDSLD', false) v`)).v;
ok('6  wi_room_get: entferntes Kind 1 fehlt', !wg.people.some(p => p.seat === 1) && wg.room_total === 7,
   `room_total=${wg.room_total}`);

/* ══ 7. Knowledge Stack ══════════════════════════════════════════ */
const R4 = await raum('KNWSTK', 'knowledgestack');
await kinder(R4, 'k', 4);
for (const t of ['k1', 'k2', 'k3', 'k4']) await one(`select ks_join($1, null, 0::smallint, 0::smallint) v`, [t]);
await sperre('k2'); await offline('k3');
const kg = (await one(`select ks_room_get('KNWSTK') v`)).v;
ok('7  ks_room_get läuft', kg.ok === true, kg.error || '');
ok('7  auf der Wiese: Kind 1 und Kind 4',
   (kg.players || []).map(p => p.seat).join(',') === '1,4', (kg.players || []).map(p => p.seat).join(','));
ok('7  offline_members: Kind 3, blocked_members: Kind 2',
   names(kg.offline_members) === 'Kind 3' && names(kg.blocked_members) === 'Kind 2',
   names(kg.offline_members) + ' / ' + names(kg.blocked_members));

/* ══ 8. Zweimal ══════════════════════════════════════════════════ */
try {
  await db.exec(mig('0187_skill_participant_status.sql'));
  ok('8  0187 läuft ein zweites Mal', true);
  ok('8  … und der Vorbau ruft weiter die alte Fassung',
     (await one(`select clash_room_get('KNGDMS') v`)).v.ok === true
     && (await one(`select skill_view('g1') v`)).v.error === 'blocked');
} catch (e) {
  ok('8  0187 läuft ein zweites Mal', false, e.message);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
