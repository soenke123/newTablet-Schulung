/* Prüfstand für Migration 0239 — Definitions Derby: Kistensturm.
   Echt gerechnet in pglite auf der ganzen Kette 0001…0239.

   Die Kernzusagen:
     1. Lobby: nur Lehrkräfte des Raums stellen ein; Grenzen werden geprüft;
        die Teams sind eine Vorschau der Anwesenden (reihum nach Sitzplatz),
        Stillgelegte und Abwesende fehlen.
     2. Start: ohne Stapel nicht; danach Countdown, Teams fest, Türme auf 0.
     3. Antworten zählen erst, wenn es läuft; höchstens eine je 1,2 s;
        falsch zählt nur als Fehler; jede Kiste ist ein Ereignis mit Name.
     4. Fair: im kleineren Team bringt eine Antwort mehr als eine Kiste.
     5. Spätzugang landet im kleinsten Team.
     6. Ziel erreicht → Sieg, danach zählt nichts mehr.
     7. Countdown abgelaufen → höchster Turm gewinnt, bei Gleichstand wer zuerst.
     8. Ereignisse seit p_since; Nochmal = Lobby; fremde Lehrkraft / fremder
        Raum / falsches Werkzeug kommen nicht heran; Migration zweimal.

   Aufruf:  node supabase/tests/0239_definitionsderby_kistensturm.mjs */
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

const T1 = 'e0000000-0000-4000-8000-0000000000e1';
const T2 = 'e0000000-0000-4000-8000-0000000000e2';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1), ($2)`, [T1, T2]);
await db.query(`insert into profiles (id, school_id, account_name, display_name, status, teacher_status, is_admin)
                values ($1, $3, 'k1', 'K1', 'active', 'approved', false),
                       ($2, $3, 'k2', 'K2', 'active', 'approved', false)`, [T1, T2, SCHOOL]);
const as = async u => { await db.exec(`delete from _who`); if (u) await db.query(`insert into _who values ($1)`, [u]); };
const call = async (sql, params) => (await one(`select ${sql} v`, params)).v;

await as(T1);
let r = await call(`skill_room_create('derby', 'Bio 7', false, '{}'::jsonb)`);
ok('0  Derby-Raum anlegen', r.ok, JSON.stringify(r));
const CODE = r.code;
const ROOM = (await one(`select id from skill_rooms where code = $1`, [CODE])).id;
const S = (await call(`dd_stack_save(null, null, 'Zelle', 'Biologie', '', '7', '[{"t":"Kern","d":"Steuerzentrale"}]'::jsonb)`)).id;
// 5 Anwesende, einer stillgelegt, einer lange weg
const names = ['Mia', 'Leon', 'Ali', 'Zoe', 'Ben', 'Stillgelegt', 'Weg'];
for (let i = 0; i < names.length; i++) {
  await db.query(`insert into skill_participants (room_id, token, seat, name, blocked, last_seen_at)
                  values ($1, $2, $3, $4, $5, now() - ($6 || ' seconds')::interval)`,
    [ROOM, 'tok' + i, i + 1, names[i], i === 5, i === 6 ? '600' : '5']);
}
const tok = i => 'tok' + i;

/* 1 Lobby */
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('1  Lobby legt sich von selbst an', r.ok && r.phase === 'lobby' && r.team_count === 4 && r.goal === 20, JSON.stringify(r).slice(0, 200));
ok('1  Vorschau: 5 Anwesende, ohne Stillgelegte und Abwesende', r.people.length === 5 && !r.people.some(p => p.n === 'Stillgelegt' || p.n === 'Weg'));
r = await call(`dd_storm_room_setup($1, 2, 10, 0, $2::jsonb)`, [CODE, JSON.stringify([S])]);
ok('1  einstellen: 2 Teams, Ziel 10, Stapel', r.ok, JSON.stringify(r));
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('1  Teams reihum: Mia 0, Leon 1, Ali 0', r.team_count === 2 && r.people[0].t === 0 && r.people[1].t === 1 && r.people[2].t === 0);
ok('1  Stapel gemerkt', r.stacks.length === 1 && r.stacks[0] === S);
r = await call(`dd_storm_room_setup($1, 7, null, null, null)`, [CODE]);
ok('1  7 Teams → invalid_input', r.error === 'invalid_input');
r = await call(`dd_storm_room_setup($1, null, 4, null, null)`, [CODE]);
ok('1  Ziel 4 → invalid_input', r.error === 'invalid_input');
r = await call(`dd_storm_room_setup($1, null, null, null, '["kein-uuid"]'::jsonb)`, [CODE]);
ok('1  Stapel-id, die keine ist → invalid_input', r.error === 'invalid_input');
await as(T2);
r = await call(`dd_storm_room_setup($1, 3, null, null, null)`, [CODE]);
ok('1  fremde Lehrkraft → not_found', r.error === 'not_found');
r = await call(`dd_storm_room_start($1)`, [CODE]);
ok('1  fremde Lehrkraft startet nicht', r.error === 'not_found');
await as(null);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('1  ohne Anmeldung → not_authenticated', r.error === 'not_authenticated');

r = await call(`dd_storm_view($1, 0)`, [tok(1)]);
ok('1  Tablet in der Lobby kennt seine id und findet sein Team', r.me && r.people.find(p => p.id === r.me.id)?.t === 1);

/* 2 Start */
r = await call(`dd_storm_answer($1, true, 0)`, [tok(0)]);
ok('2  in der Lobby zählt keine Antwort', r.ok && r.result === 'not_running');
await as(T1);
await call(`dd_storm_room_setup($1, null, null, null, '[]'::jsonb)`, [CODE]);
r = await call(`dd_storm_room_start($1)`, [CODE]);
ok('2  ohne Stapel kein Start', r.error === 'no_stacks');
await call(`dd_storm_room_setup($1, null, null, null, $2::jsonb)`, [CODE, JSON.stringify([S])]);
r = await call(`dd_storm_room_start($1)`, [CODE]);
ok('2  Start', r.ok, JSON.stringify(r));
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('2  Countdown, zwei Türme bei 0, Ereignis start', r.phase === 'countdown' && r.teams.length === 2 && r.teams.every(t => t.h === 0) && r.events.some(e => e.k === 'start'));
ok('2  5 Spieler verteilt (3 + 2)', r.people.length === 5 && r.people.filter(p => p.t === 0).length === 3);
r = await call(`dd_storm_room_setup($1, 3, null, null, null)`, [CODE]);
ok('2  nach dem Start keine Einstellungen mehr', r.error === 'not_allowed');
await as(null);
r = await call(`dd_storm_answer($1, true, 0)`, [tok(0)]);
ok('2  im Countdown zählt keine Antwort', r.result === 'not_running');
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
r = await call(`dd_storm_view($1, 0)`, [tok(0)]);
ok('2  nach dem Countdown läuft es', r.phase === 'running' && r.me && r.me.t === 0, JSON.stringify(r.me));

/* 3 Antworten */
r = await call(`dd_storm_answer($1, true, 0)`, [tok(0)]);
ok('3  richtig → Kiste für Team 0', r.result === 'ok' && r.teams[0].h === 1, JSON.stringify(r.teams));
ok('3  Ereignis box mit Name und Höhe', r.events.some(e => e.k === 'box' && e.t === 0 && e.w === 'Mia' && e.h === 1));
r = await call(`dd_storm_answer($1, true, 0)`, [tok(0)]);
ok('3  gleich noch eine → too_fast, keine Kiste', r.result === 'too_fast' && r.teams[0].h === 1);
r = await call(`dd_storm_answer($1, false, 0)`, [tok(0)]);
ok('3  falsch → nur Fehler', r.result === 'wrong' && r.teams[0].h === 1 && r.me.x === 1);
r = await call(`dd_storm_answer($1, true, 0)`, [tok(5)]);
ok('3  Stillgelegter → blocked', r.error === 'blocked');

/* 4 Fair: Team 1 hat 2 Spieler, Team 0 hat 3 → 1,5 Anteile */
r = await call(`dd_storm_answer($1, true, 0)`, [tok(1)]);
ok('4  kleineres Team: eine Antwort = 1,5 → Höhe 1', r.teams[1].h === 1);
r = await call(`dd_storm_answer($1, true, 0)`, [tok(3)]);
ok('4  zweite Antwort → 3 Anteile = Höhe 3', r.teams[1].h === 3, JSON.stringify(r.teams));

/* 5 Spätzugang */
await db.query(`insert into skill_participants (room_id, token, seat, name) values ($1, 'tokNeu', 9, 'Neu')`, [ROOM]);
r = await call(`dd_storm_view('tokNeu', 0)`);
ok('5  Spätzugang im kleinsten Team (1)', r.me && r.me.t === 1, JSON.stringify(r.me));

/* 6 Sieg */
const seqBefore = r.seq;
await db.exec(`update dd_storm_teams set progress = 9, height = 9 where team = 0`);
await db.exec(`update dd_storm_players set last_ok_at = null`);
r = await call(`dd_storm_answer($1, true, $2)`, [tok(2), seqBefore]);
ok('6  Ziel erreicht → ended, Sieger Team 0', r.phase === 'ended' && r.winner_team === 0, JSON.stringify([r.phase, r.winner_team]));
// seit 0240 kommen beim Überqueren von Item-Linien noch 'get'-Ereignisse dazu
const ks = r.events.map(e => e.k).filter(k => k !== 'get');
ok('6  nur neue Ereignisse: box + win', ks.length === 2 && ks[0] === 'box' && ks[1] === 'win' && r.events.every(e => e.s > seqBefore), JSON.stringify(r.events.map(e => e.k)));
r = await call(`dd_storm_answer($1, true, 0)`, [tok(1)]);
ok('6  danach zählt nichts mehr', r.result === 'not_running');

/* 7 Countdown-Ende */
await as(T1);
r = await call(`dd_storm_room_reset($1)`, [CODE]);
ok('7  Nochmal → Lobby', r.ok && (await call(`dd_storm_room_get($1, 0)`, [CODE])).phase === 'lobby');
await call(`dd_storm_room_setup($1, 3, 50, 5, null)`, [CODE]);
r = await call(`dd_storm_room_clock($1, 5)`, [CODE]);
ok('7  0243: Countdown in der Lobby nicht möglich', r.error === 'not_allowed', JSON.stringify(r));
await call(`dd_storm_room_start($1)`, [CODE]);
await db.exec(`update dd_storm_boards set countdown_ends_at = now() - interval '1 second'`);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('7  0243: alte Lobby-Minuten zählen nicht – läuft ohne Ende', r.phase === 'running' && !r.ends_at && r.teams.length === 3, JSON.stringify([r.phase, r.ends_at]));
r = await call(`dd_storm_room_clock($1, 31)`, [CODE]);
ok('7  0243: mehr als 30 Minuten abgelehnt', r.error === 'bad_input');
r = await call(`dd_storm_room_clock($1, 5)`, [CODE]);
const endsIn = Date.parse((await call(`dd_storm_room_get($1, 0)`, [CODE])).ends_at) - Date.now();
ok('7  0243: Countdown im Spiel – Ende in 5 Minuten', r.ok && endsIn > 4.5 * 60000 && endsIn <= 5 * 60000 + 2000, String(endsIn));
r = await call(`dd_storm_room_clock($1, 0)`, [CODE]);
ok('7  0243: 0 bricht den Countdown ab', r.ok && !(await call(`dd_storm_room_get($1, 0)`, [CODE])).ends_at);
await call(`dd_storm_room_clock($1, 2)`, [CODE]);
await db.exec(`update dd_storm_teams set height = 4, reached_at = now() - interval '10 seconds' where team = 2;
               update dd_storm_teams set height = 4, reached_at = now() - interval '20 seconds' where team = 1;
               update dd_storm_teams set height = 2 where team = 0;
               update dd_storm_boards set ends_at = now() - interval '1 second'`);
r = await call(`dd_storm_room_get($1, 0)`, [CODE]);
ok('7  Zeit um → höchster Turm, bei Gleichstand der frühere (Team 1)', r.phase === 'ended' && r.winner_team === 1, JSON.stringify([r.phase, r.winner_team]));
ok('7  Ereignis time', r.events.some(e => e.k === 'time' && e.t === 1));

ok('8  Kachel-Text nennt Kistenturm (seit 0248, vorher Kistensturm) und Duell', /Kistens?turm/.test((await one(`select blurb b from skill_tools where id = 'derby'`)).b) && /Duell/.test((await one(`select blurb b from skill_tools where id = 'derby'`)).b));

/* 8 Beenden, fremde Räume, zweimal */
await call(`dd_storm_room_reset($1)`, [CODE]);
await call(`dd_storm_room_start($1)`, [CODE]);
r = await call(`dd_storm_room_stop($1)`, [CODE]);
ok('8  vorzeitig beenden, ohne Kiste kein Sieger', r.ok && (await call(`dd_storm_room_get($1, 0)`, [CODE])).winner_team === null);
r = await call(`skill_room_create('wordcloud', 'Wolke', false, '{}'::jsonb)`);
if (r.ok) {
  const r2 = await call(`dd_storm_room_get($1, 0)`, [r.code]);
  ok('8  anderes Werkzeug → not_found', r2.error === 'not_found');
}
await as(null);
r = await call(`dd_storm_view('gibtsnicht', 0)`);
ok('8  unbekannter Token', r.error === 'unknown_token');
let twice = true;
try { await db.exec(mig('0239_definitionsderby_kistensturm.sql')); } catch (e) { twice = false; console.error(e.message); }
ok('8  0239 läuft ein zweites Mal durch', twice);

console.log(fails ? `\n${fails} FEHLER` : '\nalles ok');
process.exit(fails ? 1 : 0);
