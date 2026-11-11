/* Prüfstand für Migration 0284 — Laufzeit eines Raums wählbar.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0284.

     1. Vorgaben je Skill stehen in skill_tools.lifetime_days.
     2. Anlegen ohne Angabe nimmt die Vorgabe des Skills (Quiz = 2 Tage).
     3. Anlegen mit Angabe (90) setzt Laufzeit und Frist; Unsinn → lifetime_invalid.
     4. Aktivität (skill_touch) schiebt die Frist auf jetzt + Laufzeit,
        nicht mehr pauschal auf 30 Tage — und verkürzt nichts.
     5. Verlängern um p_days, ohne Angabe um die Laufzeit, höchstens 1 Jahr.
     6. Projektarbeit: neue Räume 180 Tage, keine Jahres-Untergrenze mehr.
     7. skill_rooms_list liefert lifetime_days je Raum und je Skill.
     8. Ein Ablauf von Hand (Frist in der Vergangenheit) bleibt stehen.
     9. 0284 läuft ein zweites Mal durch.

   Aufruf:  node supabase/tests/0284_raum_laufzeit.mjs */
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


const T = 'e0000000-0000-4000-8000-0000000002f4';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $2, 'tl', 'TL', 'active', 'approved', false)`, [T, SCHOOL]);
await db.query(`insert into _who values ($1)`, [T]);

const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;
const days = async (code) => Number((await one(
  `select extract(epoch from expires_at - now()) / 86400 d from skill_rooms where code = $1`, [code])).d);
const near = (a, b) => Math.abs(a - b) < 0.01;

/* 1 */
const def = async id => (await one(`select lifetime_days d from skill_tools where id = $1`, [id]))?.d;
ok('1  Knowledge Stack 2 Tage',   (await def('knowledgestack')) === 2);
ok('1  Mathoria 2 Tage',          (await def('clash-of-math')) === 2);
ok('1  Caesar 2 Tage',            (await def('caesar')) === 2);
ok('1  Wild Clusters 10 Tage',    (await def('wildclusters')) === 10);
ok('1  Balance of Nature 30 Tage',(await def('balance')) === 30);
ok('1  SQL Studio 90 Tage',       (await def('sqlstudio')) === 90);
ok('1  Scrum 180 Tage',           (await def('scrum')) === 180);
ok('1  Projektarbeit 180 Tage',   (await def('projekt')) === 180);

/* 2 */
let r = await call(`skill_room_create('knowledgestack', 'Quiz 9b', true, '{}'::jsonb)`);
ok('2  Quiz ohne Angabe angelegt', r?.ok === true, JSON.stringify(r));
const Q = r.code;
ok('2  Quiz läuft 2 Tage', near(await days(Q), 2), String(await days(Q)));

/* 3 */
r = await call(`skill_room_create('wordcloud', 'Wolke', true, $1::jsonb, false, 90)`,
  [JSON.stringify({ groups: [{ id: 'g1', text: 'Frage?' }] })]);
ok('3  mit 90 Tagen angelegt', r?.ok === true, JSON.stringify(r));
const W = r.code;
ok('3  Frist 90 Tage', near(await days(W), 90), String(await days(W)));
ok('3  lifetime_days = 90', (await one(`select lifetime_days d from skill_rooms where code = $1`, [W])).d === 90);
r = await call(`skill_room_create('wordcloud', 'X', true, '{}'::jsonb, false, 45)`);
ok('3  45 Tage → lifetime_invalid', r?.error === 'lifetime_invalid', JSON.stringify(r));

/* 4 */
const touch = async code => {
  await db.query(`update skill_rooms set last_active_at = now() - interval '1 hour' where code = $1`, [code]);
  await db.query(`select skill_touch(id) from skill_rooms where code = $1`, [code]);
};
await db.query(`update skill_rooms set expires_at = now() + interval '1 day' where code = $1`, [Q]);
await touch(Q);
ok('4  Aktivität im Quiz: wieder 2 Tage (nicht 30)', near(await days(Q), 2), String(await days(Q)));
await touch(W);
ok('4  Aktivität verkürzt 90 Tage nicht auf 30', near(await days(W), 90), String(await days(W)));
r = await call(`skill_room_set_open($1, true)`, [Q]);
ok('4  Tür öffnen im Quiz: 2 Tage', r?.ok && near(await days(Q), 2), String(await days(Q)));

/* 5 */
r = await call(`skill_room_extend($1, 30)`, [Q]);
ok('5  Quiz um 30 Tage verlängert', r?.ok && near(await days(Q), 32), String(await days(Q)));
await touch(Q);
ok('5  danach verkürzt Aktivität nicht', near(await days(Q), 32), String(await days(Q)));
r = await call(`skill_room_extend($1)`, [W]);
ok('5  ohne Angabe: um die Laufzeit (90)', r?.ok && r.days === 90 && near(await days(W), 180), String(await days(W)));
await call(`skill_room_extend($1, 180)`, [W]);
r = await call(`skill_room_extend($1, 180)`, [W]);
ok('5  höchstens ein Jahr ab heute', r?.ok && near(await days(W), 365), String(await days(W)));
r = await call(`skill_room_extend($1, 7)`, [W]);
ok('5  7 Tage → lifetime_invalid', r?.error === 'lifetime_invalid');
// abgelaufener Raum: genau 30 Tage ab jetzt, auch bei Laufzeit 2 (Merker)
await db.query(`update skill_rooms set expires_at = now() - interval '1 hour' where code = $1`, [Q]);
r = await call(`skill_room_extend($1, 30)`, [Q]);
ok('5  Zurückholen um 30 Tage bleibt 30', r?.revived === true && near(await days(Q), 30), String(await days(Q)));

/* 6 */
let P = await call(`skill_room_create('projekt', 'Projekt 8a', true, '{}'::jsonb)`);
ok('6  Projektarbeit angelegt', P?.ok === true, JSON.stringify(P));
P = P.code;
ok('6  Projektarbeit 180 Tage (kein Jahr mehr)', near(await days(P), 180), String(await days(P)));

/* 7 */
const L = await call(`skill_rooms_list()`);
ok('7  Skill-Vorgabe in tools', L.tools?.knowledgestack?.lifetime_days === 2 && L.tools?.scrum?.lifetime_days === 180);
ok('7  Laufzeit je Raum', (L.rooms || []).find(x => x.code === W)?.lifetime_days === 90);

/* 8 */
await db.query(`update skill_rooms set expires_at = now() - interval '2 days' where code = $1`, [W]);
ok('8  Ablauf von Hand bleibt', (await days(W)) < -1.9, String(await days(W)));

/* 9 */
let twice = true;
try { await db.exec(mig('0284_raum_laufzeit.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('9  0284 läuft ein zweites Mal durch', twice && (await def('knowledgestack')) === 2);
ok('9  neue Projektarbeit bleibt bei 180',
  (await one(`select lifetime_days d from skill_rooms where code = $1`, [P])).d === 180);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
