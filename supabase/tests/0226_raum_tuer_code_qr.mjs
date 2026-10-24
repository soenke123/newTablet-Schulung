/* Prüfstand für Migration 0226 — Raum-Tür: Code mit Ablauf, QR mit Geheimnis.
   Echt gerechnet in pglite auf der ganzen Kette.

   Die Kernzusagen:
     1. Neuer Raum: eigenes Geheimnis (32 Hex), Code gilt 90 Minuten.
     2. Code abgelaufen: peek/join ohne oder mit falschem Geheimnis →
        code_expired; mit richtigem → ok.
     3. Tür zu (join_open = false): auch mit Geheimnis join_closed.
     4. Angemeldeter Teilnehmer kommt nach Ablauf ohne Geheimnis zurück.
     5. „Tür öffnen“ gibt dem Code wieder 90 Minuten.
     6. Das Geheimnis sehen nur Lehrkräfte (skill_room_get), nicht
        Schüler (Beitritts-Antwort, skill_view).
     7. Bestehende Räume bekommen beim Einspielen je ein eigenes Geheimnis.
     8. peek/join nur für service_role, skill_room_door für niemanden.

   Aufruf:  node supabase/tests/0226_raum_tuer_code_qr.mjs */
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
const run = async (list) => {
  for (const f of list) {
    try { await db.exec(mig(f)); }
    catch (e) {
      if (BEKANNT.has(f.slice(0, 4))) continue;
      console.error(`FEHLER in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
};
// Erst bis 0225, dann zwei Räume anlegen, dann den Rest — so zeigt sich,
// was 0226 mit bestehenden Räumen macht.
await run(FILES.filter(f => f.slice(0, 4) < '0226'));

const S1 = (await one(`insert into schools (slug, name) values ('aaa', 'Schule A') returning id`)).id;
const T1 = 'e0000000-0000-4000-8000-0000000000e1';  // Lehrkraft
const U1 = 'e0000000-0000-4000-8000-0000000000e2';  // angemeldeter Schüler
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, U1]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, teacher_status)
                values ($1, $3, 't1', 'T1', 'approved'), ($2, $3, 'u1', 'U1', 'none')`, [T1, U1, S1]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
// Ein gewöhnlicher Raum-Skill (Wortwolke), kein eigenständiges Werkzeug.
const TOOL = (await one(`select id from skill_tools where id = 'wordcloud'`)).id;
await as(T1);
const OLD1 = (await one(`select skill_room_create($1, 'Alt 1', null) r`, [TOOL])).r.code;
const OLD2 = (await one(`select skill_room_create($1, 'Alt 2', null) r`, [TOOL])).r.code;
if (!OLD1 || !OLD2) { console.error('Räume ließen sich nicht anlegen'); process.exit(1); }

await run(FILES.filter(f => f.slice(0, 4) >= '0226'));
console.log(`— 0001 … ${FILES.at(-1).slice(0, 4)} laufen durch —\n`);

// 7
const old = (await db.query(`select join_secret s, code_open_until u from skill_rooms where code in ($1, $2)`, [OLD1, OLD2])).rows;
ok('bestehende Räume: je ein Geheimnis', old.length === 2 && old.every(r => /^[0-9a-f]{32}$/.test(r.s)) && old[0].s !== old[1].s);
ok('bestehende Räume: Code gilt ab Einspielen 90 Min.', old.every(r => new Date(r.u) > new Date(Date.now() + 85 * 60000)));

// 1
await as(T1);
const CODE = (await one(`select skill_room_create($1, 'Neu', null) r`, [TOOL])).r.code;
const room = await one(`select join_secret s, code_open_until u from skill_rooms where code = $1`, [CODE]);
const SECRET = room.s;
ok('neuer Raum: Geheimnis 32 Hex', /^[0-9a-f]{32}$/.test(SECRET));
const mins = (new Date(room.u) - Date.now()) / 60000;
ok('neuer Raum: Code gilt ~90 Min.', mins > 89 && mins <= 90.5, mins.toFixed(1));

await as(null);
const peek = async (s) => (await one(`select skill_room_peek($1, $2) r`, [CODE, s])).r;
const join = async (name, s, u = null) => (await one(`select skill_room_join($1, $2, $3, $4) r`, [CODE, name, u, s])).r;
ok('Code offen: peek ohne Geheimnis ok', (await peek(null)).ok === true);
const j1 = await join('Mia', null, U1);
ok('Code offen: join ohne Geheimnis ok', j1.ok === true);

// 6 (Schülersicht)
ok('Beitritts-Antwort ohne Geheimnis', !JSON.stringify(j1).includes(SECRET));
const sv = (await one(`select skill_view($1) r`, [j1.token])).r;
ok('skill_view (Schüler) ohne Geheimnis', sv && !JSON.stringify(sv).includes(SECRET));

// 2
await db.query(`update skill_rooms set code_open_until = now() - interval '1 minute' where code = $1`, [CODE]);
ok('abgelaufen: peek ohne Geheimnis → code_expired', (await peek(null)).error === 'code_expired');
ok('abgelaufen: peek, Antwort verrät nichts', !('title' in (await peek(null))));
ok('abgelaufen: join ohne Geheimnis → code_expired', (await join('Leon', null)).error === 'code_expired');
ok('abgelaufen: join mit falschem Geheimnis → code_expired', (await join('Leon', '0'.repeat(32))).error === 'code_expired');
ok('abgelaufen: peek mit Geheimnis ok', (await peek(SECRET)).ok === true);
const j2 = await join('Leon', SECRET);
ok('abgelaufen: join mit Geheimnis ok', j2.ok === true && j2.rejoined === false);

// 4
const j3 = await join(null, null, U1);
ok('abgelaufen: angemeldeter Teilnehmer kommt zurück', j3.ok === true && j3.rejoined === true, JSON.stringify(j3).slice(0, 80));

// 3
await as(T1);
await one(`select skill_room_set_open($1, false) r`, [CODE]);
await as(null);
ok('Tür zu: join mit Geheimnis → join_closed', (await join('Ali', SECRET)).error === 'join_closed');

// 5
await as(T1);
const so = (await one(`select skill_room_set_open($1, true) r`, [CODE])).r;
const left = (new Date(so.code_open_until) - Date.now()) / 60000;
ok('Tür öffnen: Code wieder 90 Min. (in der Antwort)', so.ok && left > 89 && left <= 90.5, left.toFixed(1));
await as(null);
ok('Tür öffnen: join ohne Geheimnis wieder ok', (await join('Ali', null)).ok === true);
await as(T1);
const closeR = (await one(`select skill_room_set_open($1, false) r`, [CODE])).r;
ok('Tür schließen ändert den Code-Ablauf nicht', new Date(closeR.code_open_until).getTime() === new Date(so.code_open_until).getTime());

// 6 (Lehrkraft)
const g = (await one(`select skill_room_get($1) r`, [CODE])).r;
ok('skill_room_get: Geheimnis + Ablauf für die Lehrkraft', g.room.join_secret === SECRET && !!g.room.code_open_until);
await as(U1);
const g2 = (await one(`select skill_room_get($1) r`, [CODE])).r;
ok('skill_room_get: Schüler-Konto bekommt nichts', g2.ok === false && !JSON.stringify(g2).includes(SECRET));

// 8
await as(null);
const pr = await one(`select
  has_function_privilege('anon', 'skill_room_peek(text,text)', 'execute') pa,
  has_function_privilege('authenticated', 'skill_room_join(text,text,uuid,text)', 'execute') ja,
  has_function_privilege('service_role', 'skill_room_join(text,text,uuid,text)', 'execute') js,
  has_function_privilege('service_role', 'skill_room_peek(text,text)', 'execute') ps,
  has_function_privilege('authenticated', 'skill_room_door(skill_rooms,text)', 'execute') d`);
ok('peek/join nur service_role', !pr.pa && !pr.ja && pr.js && pr.ps);
ok('skill_room_door für niemanden', !pr.d);
ok('alte Signaturen weg', (await one(`select count(*)::int n from pg_proc where (proname in ('skill_room_peek','skill_room_join') and pronargs < 2) or (proname = 'skill_room_join' and pronargs = 3)`)).n === 0);

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
