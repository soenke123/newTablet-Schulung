/* Prüfstand für Migration 0167 — das Rundenende nachstellen.
   Echt gerechnet in pglite, Stubs wie in 0136…0166.

   Zweistufig: erst laufen 0130…0158, DORT gibt es die Funktion noch
   nicht (und das wird auch geprüft — ein Gerät mit neuer tool.js an
   einer alten Datenbank bekommt 42883 und damit im Browser
   'fn_missing', siehe feedback_missing_migration_looks_like_network),
   dann kommt 0167 obendrauf.

   Die Zusagen im Einzelnen:
     1. Vor 0167 gibt es wi_room_set_end nicht.
     2. Eine laufende Runde endet danach zur neuen Zeit — kürzer wie
        länger.
     3. `duration_secs` bleibt unberührt. Das ist die Zusage, die
        morgen jemand kaputtmacht: wer einmal nachjustiert, soll
        nicht die Voreinstellung aller weiteren Runden verstellt
        haben.
     4. Die neue Zeit ist wirklich das Rundenende und keine Anzeige:
        ist sie um, beendet wi_maybe_advance die Runde.
     5. Unsinnige Zahlen kommen nicht durch (null, 0, 14, 3601).
     6. Fremde Räume und fremde Lehrkräfte: 'not_found'.
     7. Lobby, Countdown und beendete Runde: 'not_running' — und der
        Countdown behält seine eigene Rechnung (ends_at entsteht erst
        beim Start und käme sonst doppelt).
     8. Die Rechte stehen: authenticated ja, anon nein.
     9. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0167_wordisland_round_end_timer.mjs  */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create table if not exists schools (id uuid primary key default gen_random_uuid(), slug text);
create table if not exists profiles (id uuid primary key default gen_random_uuid(), school_id uuid references schools(id));
create table if not exists skill_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique, owner_id uuid, school_id uuid, title text,
  expires_at timestamptz not null default now() + interval '60 days');
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references skill_rooms(id) on delete cascade,
  token text unique, seat int not null, name text, blocked boolean not null default false,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
/* ⚠️ In SCHEMA extensions — siehe 0136/0137. */
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 60, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create role service_role; create role authenticated; create role anon;
`;

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const n = v => Number(v);

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 240), Number(e.position) + 60)}`);
    process.exit(1);
  }
};
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

const BIS_0158 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql', '0150_vocab_units.sql',
  '0151_wordisland_choice_streak_lock.sql', '0152_wordisland_blocked_out.sql',
  '0153_wordisland_round_words.sql', '0154_vocab_set_words.sql',
  '0157_wordisland_sets_push.sql', '0158_wordisland_view_restore.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0158) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0158 laufen durch —\n');

const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const FREMD  = 'e0000000-0000-4000-8000-000000000002';
const ROOM   = 'b0000000-0000-4000-8000-000000000001';
const CODE   = 'ABCDEF';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}'), ('${FREMD}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,6) g;
`);

const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE, [schule], 4, 900, 'de_en', 'type']);

/* ══ Stufe 1: die Welt vor 0167 ════════════════════════════════ */
const gibtEs = async () => n((await one(
  `select count(*)::int c from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname='wi_room_set_end'`)).c);
ok('vor 0167 gibt es wi_room_set_end nicht', await gibtEs() === 0);

/* ══ Stufe 2: 0167 ═════════════════════════════════════════════ */
await run(mig('0167_wordisland_round_end_timer.sql'), '0167');
console.log('\n— 0167 läuft durch —\n');
ok('… und danach schon', await gibtEs() === 1);

/* ── Eine laufende Runde ─────────────────────────────────────
   Der Countdown dauert fünf Sekunden. Statt sie abzuwarten, wird er
   vorgestellt und der bestehende Lazy-Weg gerufen — genau das, was
   im Unterricht der nächste Takt tut. */
const starte = async () => {
  await one(`select wi_room_start($1) v`, [CODE]);
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id = '${ROOM}'`);
  await one(`select wi_maybe_advance($1) v`, [ROOM]);
};
const board = () => one(`select phase, duration_secs,
                                extract(epoch from (ends_at - now()))::int rest
                           from wi_boards where room_id=$1`, [ROOM]);
const setze = (secs, code = CODE) =>
  one(`select wi_room_set_end($1, $2) v`, [code, secs]).then(r => r.v);

await starte();
const b0 = await board();
ok('die Runde läuft und endet nach der eingestellten Dauer',
   b0.phase === 'running' && n(b0.rest) > 880 && n(b0.rest) <= 900,
   `${b0.phase} · noch ${b0.rest} s`);

/* ── Kürzen ─────────────────────────────────────────────────── */
const r1 = await setze(180);
const b1 = await board();
ok('drei Minuten: die Antwort sagt ok und nennt das neue Ende',
   r1.ok === true && !!r1.ends_at, JSON.stringify(r1));
ok('… und die Runde endet in drei Minuten',
   n(b1.rest) > 170 && n(b1.rest) <= 180, `noch ${b1.rest} s`);
/* Die Zusage, die morgen jemand kaputtmacht. */
ok('die eingestellte Dauer bleibt, wie sie war',
   n(b1.duration_secs) === 900, String(b1.duration_secs));

/* ── Verlängern ─────────────────────────────────────────────── */
await setze(600);
const b2 = await board();
ok('es geht auch wieder hinauf', n(b2.rest) > 590 && n(b2.rest) <= 600, `noch ${b2.rest} s`);

/* ── Die neue Zeit ist wirklich das Rundenende ───────────────
   Nicht wi_room_set_end wird hier geprüft, sondern dass die Zahl,
   die es schreibt, am bestehenden Weg hängt: ist sie um, beendet
   wi_maybe_advance die Runde beim nächsten Hinsehen. Ohne diese
   Zusage könnte ends_at eine reine Anzeige sein. */
await setze(15);
await db.exec(`update wi_boards set ends_at = now() - interval '1 second'
                where room_id = '${ROOM}'`);
await one(`select wi_maybe_advance($1) v`, [ROOM]);
const b3 = await board();
ok('ist die neue Zeit um, ist die Runde vorbei', b3.phase === 'ended', b3.phase);

/* ── Phasen, in denen es nichts zu stellen gibt ──────────────── */
const rEnde = await setze(120);
ok('eine beendete Runde lässt sich nicht verlängern',
   rEnde.ok === false && rEnde.error === 'not_running', JSON.stringify(rEnde));

await one(`select wi_room_to_lobby($1) v`, [CODE]);
const rLobby = await setze(120);
ok('in der Lobby ebenso wenig',
   rLobby.ok === false && rLobby.error === 'not_running', JSON.stringify(rLobby));

await one(`select wi_room_start($1) v`, [CODE]);   // ohne Vorstellen: Countdown
const rCd = await setze(120);
ok('und im Countdown auch nicht',
   rCd.ok === false && rCd.error === 'not_running', JSON.stringify(rCd));
/* ⚠️ Der Countdown behält seine eigene Rechnung: das Ende entsteht
   erst beim Umschalten auf 'running' und würde alles hier Gesetzte
   überschreiben. Genau deshalb ist die Antwort ehrlich. */
await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                where room_id = '${ROOM}'`);
await one(`select wi_maybe_advance($1) v`, [ROOM]);
const b4 = await board();
ok('nach dem Countdown steht wieder die eingestellte Dauer',
   b4.phase === 'running' && n(b4.rest) > 880, `${b4.phase} · noch ${b4.rest} s`);

/* ── Unsinnige Zahlen ───────────────────────────────────────── */
for (const [wert, wie] of [[null, 'nichts'], [0, 'null Sekunden'],
                           [14, 'vierzehn Sekunden'], [3601, 'über eine Stunde']]) {
  const r = await setze(wert);
  ok(`${wie} kommt nicht durch`,
     r.ok === false && r.error === 'invalid_input', JSON.stringify(r));
}
const b5 = await board();
ok('und nichts davon hat das Rundenende angefasst',
   n(b5.rest) > 880, `noch ${b5.rest} s`);

/* ── Fremde Räume, fremde Lehrkräfte ─────────────────────────── */
const rWeg = await setze(120, 'ZZZZZZ');
ok('einen Raum, den es nicht gibt, gibt es nicht',
   rWeg.ok === false && rWeg.error === 'not_found', JSON.stringify(rWeg));

await db.exec(`update _who set uid = '${FREMD}'`);
const rFremd = await setze(120);
ok('eine fremde Lehrkraft darf nicht an dieser Runde drehen',
   rFremd.ok === false && rFremd.error === 'not_found', JSON.stringify(rFremd));
await db.exec(`update _who set uid = '${T}'`);
ok('die eigene darf weiterhin', (await setze(300)).ok === true);

/* ── Rechte ─────────────────────────────────────────────────── */
const recht = async (rolle) => (await one(
  `select has_function_privilege($1, 'wi_room_set_end(text,int)', 'execute') p`, [rolle])).p;
ok('authenticated darf ausführen', await recht('authenticated') === true);
ok('anon nicht', await recht('anon') === false);

/* ── Zweimal einspielen ─────────────────────────────────────── */
await run(mig('0167_wordisland_round_end_timer.sql'), '0167 (zweites Mal)');
ok('die Migration läuft zweimal', (await setze(240)).ok === true);

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
