/* Prüfstand für Migration 0299 — Nebeltal: Profilbilder.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Allein: Level 1–3 → Pinguin Main, Level 5 → Adelie + Zügel, Level 8 → Esel;
        andere Level bringen nichts; nur freigegebene Level zählen (not_shared).
     2. Ohne Konto wird gemerkt; meldet man sich im Raum an, kommen die Bilder nach.
     3. Gemeinsam: Runde endet → alle, die mitgespielt haben, bekommen den 3D-Pinguin
        (+ Bild zum Level); wer nicht in der Runde war, nichts.
     4. Lehrkraft allein: nt_room_earn aufs eigene Konto; fremde Lehrkraft not_found.
     5. Raum gelöscht → nt_earned weg, Freischaltungen am Konto bleiben.
     6. 0299 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0299_nebeltal_avatare.mjs */
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

const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
const LK = 'e0000000-0000-4000-8000-0000000299a1', LK2 = 'e0000000-0000-4000-8000-0000000299a2';
const MIA = 'e0000000-0000-4000-8000-0000000299b1', LEON = 'e0000000-0000-4000-8000-0000000299b2';
await db.query(`insert into auth.users (id) values ($1), ($2), ($3), ($4)`, [LK, LK2, MIA, LEON]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status)
                values ($1, $5, 'nt_lk', 'Lehrkraft', 'active', 'approved'),
                       ($2, $5, 'nt_lk2', 'Andere', 'active', 'approved'),
                       ($3, $5, 'nt_mia', 'Mia', 'active', 'none'),
                       ($4, $5, 'nt_leon', 'Leon', 'active', 'none')`, [LK, LK2, MIA, LEON, SCHOOL]);
const as = async who => { await db.query(`delete from _who`); if (who) await db.query(`insert into _who values ($1)`, [who]); };
const mine = async uid => (await db.query(`select avatar_id from mps_avatar_unlocks where user_id = $1 order by avatar_id`, [uid])).rows.map(r => r.avatar_id.replace('mps_nebeltal_', '')).join(',');

await as(LK);
const room = (await one(`select skill_room_create('nebeltal', 'Info 10', false, '{}'::jsonb) v`)).v;
const CODE = room.code, ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const setLevels = async lv => { await as(LK); await one(`select skill_room_set_state($1, null, $2::jsonb) v`, [CODE, JSON.stringify({ levels: lv })]); };
const earn = async (tok, lv) => { await as(null); return (await one(`select nt_earn($1, $2) v`, [tok, lv])).v; };

await db.query(`insert into skill_participants (room_id, token, seat, name, user_id) values
  ($1, 'tok-mia', 1, 'Mia', $2), ($1, 'tok-leon', 2, 'Leon', null), ($1, 'tok-ada', 3, 'Ada', null)`, [ROOM, MIA]);

/* 1 */
await setLevels([1]);
let r = await earn('tok-mia', 5);
ok('1  nicht freigegeben → not_shared', !r.ok && r.error === 'not_shared', JSON.stringify(r));
r = await earn('tok-mia', 1);
ok('1  Level 1 → Pinguin Main (neu)', r.ok && JSON.stringify(r.new) === '["mps_nebeltal_main"]', JSON.stringify(r));
r = await earn('tok-mia', 1);
ok('1  nochmal: nichts Neues', r.ok && r.new.length === 0, JSON.stringify(r));
await setLevels([1, 2, 3, 4, 5, 6, 7, 8]);
r = await earn('tok-mia', 4);
ok('1  Level 4 bringt kein Bild', r.ok && r.new.length === 0);
r = await earn('tok-mia', 5);
ok('1  Level 5 → Adelie + Zügel', r.ok && r.new.length === 2, JSON.stringify(r));
r = await earn('tok-mia', 8);
ok('1  Level 8 → Esel', r.ok && JSON.stringify(r.new) === '["mps_nebeltal_esel"]');
ok('1  Mia hat 4 Bilder', (await mine(MIA)) === 'adelie,esel,main,zuegel', await mine(MIA));
r = await earn('falsch', 1);
ok('1  falscher Token', !r.ok && r.error === 'unknown_token');

/* 2 */
r = await earn('tok-leon', 2);
ok('2  ohne Konto: ok, nichts freigeschaltet', r.ok && r.new.length === 0);
ok('2  … aber gemerkt', (await one(`select count(*)::int n from nt_earned e join skill_participants p on p.id = e.participant_id where p.token = 'tok-leon'`)).n === 1);
await db.query(`update skill_participants set user_id = $1 where token = 'tok-leon'`, [LEON]);
ok('2  Anmeldung im Raum → Pinguin Main kommt nach', (await mine(LEON)) === 'main', await mine(LEON));

/* 3 */
const act = async (a, args = {}) => { await as(LK); return (await one(`select nt_room_act($1, $2, $3::jsonb) v`, [CODE, a, JSON.stringify(args)])).v; };
const play = async tok => { await as(null); return (await one(`select nt_play($1, '{}'::jsonb) v`, [tok])).v; };
await act('on');
await play('tok-mia'); await play('tok-leon');
await act('level', { n: 2 });
r = await act('start');
ok('3  Runde läuft an', r.ok && r.phase === 'intro', JSON.stringify(r).slice(0, 120));
await play('tok-ada');                            // kommt zu spät: nicht in der Runde
await db.query(`update skill_participants set user_id = $1 where token = 'tok-ada'`, [LK2]);   // (Konto nur zum Prüfen)
await act('go');
await db.query(`update nt_rounds set countdown_ends_at = now() - interval '1 second'`);
r = await act('stop');
ok('3  Runde beendet', r.ok && r.phase === 'ended', r.phase);
ok('3  Mia: + 3D-Pinguin', (await mine(MIA)) === 'adelie,esel,main,pinguin3d,zuegel', await mine(MIA));
ok('3  Leon: + 3D-Pinguin', (await mine(LEON)) === 'main,pinguin3d', await mine(LEON));
ok('3  Ada (nicht in der Runde): nichts', (await mine(LK2)) === '', await mine(LK2));
await db.query(`update skill_participants set user_id = null where token = 'tok-ada'`);

/* 4 */
await as(LK);
r = (await one(`select nt_room_earn($1, 5) v`, [CODE])).v;
ok('4  Lehrkraft Level 5 → Adelie + Zügel aufs Konto', r.ok && r.new.length === 2 && (await mine(LK)) === 'adelie,zuegel', JSON.stringify(r));
await as(LK2);
r = (await one(`select nt_room_earn($1, 5) v`, [CODE])).v;
ok('4  fremde Lehrkraft: not_found', !r.ok && r.error === 'not_found', JSON.stringify(r));
await as(null);
r = (await one(`select nt_room_earn($1, 5) v`, [CODE])).v;
ok('4  ohne Anmeldung: not_authenticated', !r.ok && r.error === 'not_authenticated');

/* 5 */
await db.query(`delete from skill_rooms where id = $1`, [ROOM]);
ok('5  Raum weg → nt_earned weg', (await one(`select count(*)::int n from nt_earned`)).n === 0);
ok('5  Bilder bleiben am Konto', (await mine(MIA)).split(',').length === 5);

/* 6 */
try { await db.exec(mig('0299_nebeltal_avatare.sql')); ok('6  0299 läuft ein zweites Mal durch', true); }
catch (e) { ok('6  0299 läuft ein zweites Mal durch', false, e.message); }

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
