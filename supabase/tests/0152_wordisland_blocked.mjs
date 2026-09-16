/* Prüfstand für Migration 0152 — „Stillgelegte spielen nicht mit".
   Echt gerechnet in pglite, Stubs wie in 0136…0151.

   Zweistufig wie 0140/0141/0142/0146/0148/0149/0151: erst laufen
   0130…0151 — dort bekommt ein stillgelegtes Tablet weiter sein Volk
   —, dann kommt 0152 obendrauf. Nur so ist der Unterschied belegt und
   nicht bloß behauptet.

   ⚠️ Die Spalte `blocked` kommt aus 0081 (generische Schicht) und
   nicht aus einer Wordisland-Migration. Im Stub steht sie deshalb von
   Hand — genau wie skill_rooms und skill_participants selbst.

   Die Kernzusagen:
     1. VOR 0152 bekommt ein stillgelegtes Kind beim Start ein Volk.
        Das ist Sönkes Meldung.
     2. NACH 0152 bekommt es keine wi_players-Zeile, und die anderen
        sieben verteilen sich auf die vier Völker.
     3. Die Kopfzahl je Volk (wi_teams_json) zählt nur Mitspieler.
     4. Stilllegen MITTEN in der Lobby wirkt sofort — ohne neues
        Mischen —, und Freigeben bringt dasselbe Volk zurück.
     5. wi_view weist ein gesperrtes Tablet mit 'blocked' ab, und die
        eigene Gruppe am Tablet enthält keine Gesperrten.
     6. wi_room_get zeigt sie weiter, aber mit blocked=true und ohne
        Volk.
     7. wi_room_shuffle überspringt sie ebenfalls.
     8. Der Nachzügler (wi_ensure_player) landet im kleinsten Volk,
        und „klein" zählt ohne Gesperrte.
     9. Die Insel wird für die Mitspieler gebaut, nicht für den Raum.
    10. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0152_wordisland_blocked.mjs */
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
/* blocked/blocked_at kommen aus 0081 — hier von Hand, weil die
   generische Schicht in diesem Prüfstand nicht mitläuft. */
create table if not exists skill_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references skill_rooms(id) on delete cascade,
  token text unique, seat int not null, name text,
  blocked boolean not null default false,
  blocked_at timestamptz,
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
const all = async (sql, params) => (await db.query(sql, params)).rows;
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

const BIS_0151 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql', '0146_wordisland_ruins.sql',
  '0147_wordisland_solo_day_berlin.sql', '0148_wordisland_streak_every_three.sql',
  '0149_wordisland_streak_twelve.sql', '0150_vocab_units.sql',
  '0151_wordisland_choice_streak_lock.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0151) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0151 laufen durch —\n');

/* ── Ein Raum mit 8 Kindern und vier Völkern ─────────────────── */
const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const ROOM   = 'b0000000-0000-4000-8000-000000000001';
const CODE   = 'ABCDEF';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,8) g;
`);

/* ⚠️ Seit 0150 heißen die Stationen „Station 1 — Schule" statt
   „Schule" (der Bestand wurde umgehängt, nicht neu angelegt). Ein
   Vergleich auf den alten Titel findet nichts und der Prüfstand
   zerbricht an seiner eigenen Hilfsabfrage. */
const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
const setze = () => one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
                        [CODE, [schule], 4, 900, 'de_en', 'type']);
await setze();

const sperre = (tok, on) => db.exec(
  `update skill_participants set blocked = ${on ? 'true' : 'false'},
          blocked_at = ${on ? 'now()' : 'null'}
    where token = '${tok}'`);
const zeile = async (tok) => one(
  `select w.team_index from wi_players w
     join skill_participants p on p.id = w.participant_id
    where p.token = $1`, [tok]);
const starte = async () => (await one(`select wi_room_start($1) v`, [CODE])).v;
const lauf = async () => {
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id='${ROOM}'`);
  await one(`select wi_view($1, true) v`, ['tok1']);   // countdown → running
};
/* ⚠️ wi_room_to_lobby lehnt eine LAUFENDE Runde ab (0134,
   'round_running'). Wer im Prüfstand zurück in die Lobby will, muss
   die Runde also erst ablaufen lassen — sonst steht später ein
   „phase_locked" da, das nach einem Fehler in der Migration aussieht
   und keiner ist. */
const zurLobby = async () => {
  // Countdown → running (wi_maybe_advance setzt dabei ein FRISCHES
  // ends_at, deshalb zwei Durchgänge und nicht einer) …
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '2 seconds'
                  where room_id='${ROOM}' and phase = 'countdown'`);
  await one(`select wi_room_get($1, false) v`, [CODE]);
  // … running → ended.
  await db.exec(`update wi_boards set ends_at = now() - interval '1 second'
                  where room_id='${ROOM}' and phase = 'running'`);
  await one(`select wi_room_get($1, false) v`, [CODE]);
  return one(`select wi_room_to_lobby($1) v`, [CODE]);
};
const koepfe = async () => {
  const v = (await one(`select wi_teams_json($1, 4) v`, [ROOM])).v;
  return v.map(t => n(t.people));
};
const summe = a => a.reduce((s, x) => s + x, 0);

/* ══ Stufe 1: die Welt vor 0152 ════════════════════════════════
   Kind 8 ist stillgelegt — und bekommt trotzdem sein Volk. */
await sperre('tok8', true);
await starte();
const vorher = await zeile('tok8');
ok('vor 0152: ein stillgelegtes Kind bekommt beim Start ein Volk',
   vorher !== undefined && vorher.team_index !== null && vorher.team_index !== undefined,
   `team=${vorher && vorher.team_index}`);
ok('vor 0152: die Kopfzahlen zählen alle acht',
   summe(await koepfe()) === 8, (await koepfe()).join('+'));

/* ══ Stufe 2: 0152 ═════════════════════════════════════════════ */
await run(mig('0152_wordisland_blocked_out.sql'), '0152');
console.log('\n— 0152 läuft durch —\n');

await zurLobby();
const inseln = {};
inseln.mitSperre = n((await starte()).tiles);

ok('nach 0152: das stillgelegte Kind bekommt KEINE Zeile',
   (await zeile('tok8')) === undefined);
const rest = await all(`select team_index from wi_players where room_id = $1`, [ROOM]);
ok('nach 0152: die anderen sieben sind verteilt',
   rest.length === 7, `${rest.length} Zeilen`);
ok('nach 0152: und zwar auf alle vier Völker',
   new Set(rest.map(r => n(r.team_index))).size === 4,
   [...new Set(rest.map(r => n(r.team_index)))].sort().join(','));
ok('nach 0152: die Kopfzahlen zählen sieben',
   summe(await koepfe()) === 7, (await koepfe()).join('+'));

/* ── Die Insel wird für die Mitspieler gebaut ─────────────────
   Vier von acht gesperrt = halb so viele Kinder. Der Deckel nach
   unten ist 80 Felder (wi_build_island), 900 Sekunden × 1,6 hält
   beide Werte darüber — sonst verglichen wir zwei Deckel. */
await zurLobby();
for (const t of ['tok5', 'tok6', 'tok7']) await sperre(t, true);
inseln.vieleSperren = n((await starte()).tiles);
ok('die Inselgröße folgt den Mitspielern, nicht dem Raum',
   inseln.vieleSperren < inseln.mitSperre,
   `${inseln.vieleSperren} < ${inseln.mitSperre}`);
for (const t of ['tok5', 'tok6', 'tok7']) await sperre(t, false);

/* ── Stilllegen mitten in der Lobby ───────────────────────────
   Die Zeile bleibt stehen (Stilllegen ist umkehrbar), aber sie zählt
   nicht mehr. Und Freigeben bringt dasselbe Volk zurück. */
await zurLobby();
await sperre('tok8', false);
await starte();
const achtVor = n((await zeile('tok8')).team_index);
const kVor = await koepfe();
await sperre('tok8', true);
const kNach = await koepfe();
ok('Stilllegen in der laufenden Lobby senkt die Kopfzahl sofort',
   summe(kNach) === summe(kVor) - 1, `${kVor.join('+')} → ${kNach.join('+')}`);
ok('die Zeile bleibt dabei stehen — Stilllegen ist umkehrbar',
   (await zeile('tok8')) !== undefined);
await sperre('tok8', false);
ok('Freigeben bringt dasselbe Volk zurück',
   n((await zeile('tok8')).team_index) === achtVor,
   `${achtVor} → ${(await zeile('tok8')).team_index}`);

/* ── wi_view ──────────────────────────────────────────────────── */
await lauf();
await sperre('tok8', true);
const gesperrt = (await one(`select wi_view($1, false) v`, ['tok8'])).v;
ok('wi_view weist ein gesperrtes Tablet mit „blocked" ab',
   gesperrt.ok === false && gesperrt.error === 'blocked', JSON.stringify(gesperrt));

/* Kind 8 und wer sonst noch in seinem Volk sitzt: in der Gruppe der
   anderen darf es nicht mehr auftauchen. */
const kamerad = (await all(
  `select p.token from wi_players w join skill_participants p on p.id = w.participant_id
    where w.room_id = $1 and w.team_index = $2 and p.token <> 'tok8'`,
  [ROOM, achtVor])).map(r => r.token);
if (kamerad.length) {
  const v = (await one(`select wi_view($1, false) v`, [kamerad[0]])).v;
  const namen = (v.my_team_members || []).map(m => m.name);
  ok('die eigene Gruppe am Tablet enthält keine Gesperrten',
     !namen.includes('Kind 8'), namen.join(', '));
} else {
  ok('die eigene Gruppe am Tablet enthält keine Gesperrten', true, '(allein im Volk)');
}

/* ── wi_room_get: da, nur eben gesperrt ───────────────────────
   Das Pult filtert NICHT: die Lehrkraft hat gerade selbst
   stillgelegt, und eine Liste, aus der jemand spurlos verschwindet,
   sieht aus wie ein Fehler. Sie bekommt stattdessen das Merkmal und
   stellt sie im Gerät in eine eigene Zeile. Kind 8 wurde hier MITTEN
   in der Runde gesperrt — seine Volkszeile steht also noch, und das
   ist Absicht (Stilllegen ist umkehrbar). */
const pult = (await one(`select wi_room_get($1, false) v`, [CODE])).v;
const acht = (pult.people || []).find(p => p.name === 'Kind 8');
ok('wi_room_get zeigt das gesperrte Kind weiter',
   !!acht, acht ? JSON.stringify(acht) : '(fehlt)');
ok('… mit blocked = true', !!acht && acht.blocked === true);
ok('… und behält sein altes Volk, solange es nur gesperrt ist',
   !!acht && acht.team !== null && acht.team !== undefined, acht && String(acht.team));
ok('alle anderen tragen blocked = false',
   (pult.people || []).filter(p => p.name !== 'Kind 8').every(p => p.blocked === false));

/* Nach einem NEUEN Start gibt es die Zeile nicht mehr — dann steht
   am Pult ausdrücklich „kein Volk". */
await zurLobby();
await starte();
const acht2 = ((await one(`select wi_room_get($1, false) v`, [CODE])).v.people || [])
  .find(p => p.name === 'Kind 8');
ok('nach einem neuen Start steht es am Pult ohne Volk',
   !!acht2 && acht2.team === null, acht2 && String(acht2.team));

/* ── wi_room_shuffle ──────────────────────────────────────────── */
await zurLobby();
const shuf = (await one(`select wi_room_shuffle($1) v`, [CODE])).v;
const nShuf = n((await one(`select count(*) k from wi_players where room_id=$1`, [ROOM])).k);
ok('wi_room_shuffle überspringt Gesperrte ebenfalls',
   shuf.ok === true && (await zeile('tok8')) === undefined && nShuf === 7,
   `${JSON.stringify(shuf)} · ${nShuf} Zeilen`);

/* ── Der Nachzügler ───────────────────────────────────────────
   Volk 0 wird künstlich vollgemacht — aber nur mit Gesperrten. Ein
   Nachzügler muss es trotzdem als das kleinste erkennen. */
await db.exec(`delete from wi_players where room_id = '${ROOM}'`);
await db.exec(`
  insert into wi_players (participant_id, room_id, team_index)
  select id, '${ROOM}', 1 from skill_participants
   where room_id = '${ROOM}' and token in ('tok2','tok3','tok4');
  insert into wi_players (participant_id, room_id, team_index)
  select id, '${ROOM}', 0 from skill_participants
   where room_id = '${ROOM}' and token in ('tok5','tok6','tok7');
  update skill_participants set blocked = true
   where room_id = '${ROOM}' and token in ('tok5','tok6','tok7');
`);
const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;
await one(`select wi_ensure_player($1, $2, 4) v`, [P1, ROOM]);
ok('der Nachzügler zählt „klein" ohne Gesperrte — Volk 0 ist leer',
   n((await zeile('tok1')).team_index) === 0,
   `team=${(await zeile('tok1')).team_index}`);

/* Und ein gesperrtes Kind bekommt über wi_ensure_player gar nichts. */
await db.exec(`delete from wi_players where room_id = '${ROOM}'`);
const P8 = (await one(`select id from skill_participants where token='tok8'`)).id;
await one(`select wi_ensure_player($1, $2, 4) v`, [P8, ROOM]);
ok('wi_ensure_player legt für ein gesperrtes Tablet keine Zeile an',
   (await zeile('tok8')) === undefined);

/* ── Zweimal ──────────────────────────────────────────────────── */
await run(mig('0152_wordisland_blocked_out.sql'), '0152 (zweiter Lauf)');
ok('die Migration läuft zweimal', true);

console.log(`\n${fails ? `${fails} FEHLER` : 'alles grün'}`);
process.exit(fails ? 1 : 0);
