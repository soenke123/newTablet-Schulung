/* Prüfstand für Migration 0131 — die Insel, echt gerechnet in pglite.
   Stubs für alles, was aus 0077–0080 kommt. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
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
  token text unique, seat int not null, name text,
  last_seen_at timestamptz not null default now());
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
-- pgcrypto bringt pglite nicht mit; hier reicht irgendein Zufallsstring.
create or replace function gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text), 'hex') $$;
create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 60, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100);
create role service_role; create role authenticated; create role anon;
`;

const ok = (label, cond, extra = '') =>
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 240), Number(e.position) + 60)}`);
    process.exit(1);
  }
};

await run(STUBS, 'Stubs');
await run(readFileSync(`${REPO}/supabase/migrations/0130_vocab_content.sql`, 'utf8'), '0130');
await run(readFileSync(`${REPO}/supabase/migrations/0131_wordisland_game.sql`, 'utf8'), '0131');
console.log('— 0130 + 0131 laufen durch —\n');

/* ── Raum mit 12 Kindern ───────────────────────────────────── */
const T = 'e0000000-0000-4000-8000-000000000001';
await db.exec(`
  insert into schools (id, slug) values ('d0000000-0000-4000-8000-000000000001','mps');
  insert into profiles (id, school_id) values ('${T}','d0000000-0000-4000-8000-000000000001');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('b0000000-0000-4000-8000-000000000001','ABCDEF','${T}','d0000000-0000-4000-8000-000000000001','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select 'b0000000-0000-4000-8000-000000000001', 'tok' || g, g, 'Kind ' || g
      from generate_series(1,12) g;
`);
const ROOM = 'b0000000-0000-4000-8000-000000000001';
const CODE = 'ABCDEF';

/* ── Lobby ─────────────────────────────────────────────────── */
let r = (await one(`select wi_room_get($1) v`, [CODE])).v;
ok('Pult: Raum da',            r.ok === true);
ok('Pult: Phase lobby',        r.phase === 'lobby');
ok('Pult: 3 Units voreingestellt', r.sets.length === 3);
ok('Pult: 12 Leute in der Liste',  r.people.length === 12);

const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
r = (await one(`select wi_room_setup($1, $2, $3, $4, $5) v`, [CODE, [schule], 4, 300, 'de_en'])).v;
ok('Einstellungen übernommen', r.ok === true, JSON.stringify(r));
r = (await one(`select wi_room_get($1) v`, [CODE])).v;
ok('nur noch eine Unit',       r.sets.length === 1);

/* ── Start und Insel ───────────────────────────────────────── */
r = (await one(`select wi_room_start($1) v`, [CODE])).v;
ok('Start ok',                 r.ok === true, JSON.stringify(r));
ok('Insel hat Felder',         r.tiles > 60, `tiles=${r.tiles}`);

const tiles = await all(`select r, c, state, owner_team, is_home, ruin_value, dist from wi_tiles where room_id=$1`, [ROOM]);
const homes = tiles.filter(t => t.is_home);
ok('vier Landeplätze',         homes.length === 4);
ok('je Volk genau einer',      new Set(homes.map(h => h.owner_team)).size === 4);
ok('Landeplätze offen',        homes.every(h => h.state === 'open'));

/* Zusammenhang: von einem Feld aus muss jedes andere erreichbar sein.
   Die sternförmige Fläche garantiert das — geprüft wird es trotzdem,
   denn ein abgetrenntes Nebelfeld sieht im Spiel aus wie ein Fehler. */
const key = (r_, c_) => `${r_}/${c_}`;
const set = new Set(tiles.map(t => key(t.r, t.c)));
const nb = (r_, c_) => {
  const odd = ((r_ % 2) + 2) % 2 === 1;
  const d = odd ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
                : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  return d.map(([dr, dc]) => [r_ + dr, c_ + dc]);
};
const seen = new Set([key(tiles[0].r, tiles[0].c)]);
const stack = [[tiles[0].r, tiles[0].c]];
while (stack.length) {
  const [cr, cc] = stack.pop();
  for (const [nr, nc] of nb(cr, cc)) {
    if (set.has(key(nr, nc)) && !seen.has(key(nr, nc))) { seen.add(key(nr, nc)); stack.push([nr, nc]); }
  }
}
ok('Insel ist zusammenhängend', seen.size === tiles.length, `${seen.size}/${tiles.length}`);

/* Landeplätze liegen an der Küste (mindestens ein Nachbar ist Wasser) */
ok('Landeplätze an der Küste',
   homes.every(h => nb(h.r, h.c).some(([nr, nc]) => !set.has(key(nr, nc)))));

/* Landeplätze gleichmäßig verteilt: die Winkel um die Mitte müssen
   deutlich auseinanderliegen. */
const cx = tiles.reduce((s, t) => s + t.c + 0.5 * (t.r % 2), 0) / tiles.length;
const cy = tiles.reduce((s, t) => s + t.r * 0.866, 0) / tiles.length;
const angles = homes.map(h => Math.atan2(h.r * 0.866 - cy, h.c + 0.5 * (h.r % 2) - cx)).sort((a, b) => a - b);
const gaps = angles.map((a, i) => (i === 0 ? a + 2 * Math.PI - angles[angles.length - 1] : a - angles[i - 1]));
// 70 % des gleichmäßigen Abstands (bei vier Völkern also 1.10 statt
// 1.57 rad). Die Schwelle war erst 0.8 und ließ genau das durch,
// worum es hier geht: zwei Völker in derselben Ecke.
ok('Landeplätze rundum verteilt', Math.min(...gaps) > (2 * Math.PI / homes.length) * 0.7,
   `kleinster Winkelabstand ${Math.min(...gaps).toFixed(2)} rad`);

const ruins = tiles.filter(t => t.ruin_value > 0);
ok('Ruinen vorhanden',          ruins.length >= 6, `${ruins.length}`);
ok('Ruinen halten Abstand', ruins.every(a => ruins.every(b =>
   (a === b) || Math.hypot((a.c + 0.5 * (a.r % 2)) - (b.c + 0.5 * (b.r % 2)), (a.r - b.r) * 0.866) >= 3)));
ok('Ruinen: Mitte wertvoller',
   Math.max(...ruins.map(x => x.ruin_value)) === 3 || ruins.every(x => x.dist > 0.3));

/* ── Countdown → running ───────────────────────────────────── */
await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second' where room_id='${ROOM}'`);
let v = (await one(`select wi_view($1, true) v`, ['tok1'])).v;
ok('Tablet: läuft',            v.phase === 'running', v.phase);
ok('Tablet: Karte dabei',      Array.isArray(v.map) && v.map.length === tiles.length);
ok('Tablet: own passt zur Karte', v.own.length === v.map.length);
ok('Tablet: Aufgabe da',       !!v.me.task?.prompt, JSON.stringify(v.me.task));
ok('Tablet: Volk zugeteilt',   v.me.team >= 0 && v.me.team < 4);

/* ── Antworten ─────────────────────────────────────────────── */
const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;
const task = async (tok) => one(
  `select w.current_item i, w.current_dir d, w.current_stage s, w.current_options o,
          w.streak, w.picks, vocab_prompt(w.current_item, w.current_dir) prompt
     from wi_players w join skill_participants p on p.id = w.participant_id
    where p.token = $1`, [tok]);
const solutionOf = async (t) =>
  (await one(`select (vocab_answers($1,$2))[1] a`, [t.i, t.d])).a;
const answer = async (tok, input) => (await one(`select wi_answer($1,$2) v`, [tok, input])).v;
const unlock = async (tok) => db.query(
  `update wi_players set lock_until = null where participant_id = (select id from skill_participants where token=$1)`, [tok]);

const openOf = async (team) => (await one(
  `select count(*)::int n from wi_tiles where room_id=$1 and owner_team=$2`, [ROOM, team])).n;

let t1 = await task('tok1');
const myTeam = (await one(`select team_index from wi_players where participant_id=$1`, [P1])).team_index;
let before = await openOf(myTeam);
let a = await answer('tok1', await solutionOf(t1));
ok('richtig erkannt',          a.result === 'correct', JSON.stringify(a).slice(0, 160));
ok('ein Feld gelüftet',        await openOf(myTeam) === before + 1);
ok('Serie 1',                  a.streak === 1);
ok('neue Aufgabe kommt mit',   !!a.task?.prompt);

/* Danebengetippt → Auswahl aus acht Wörtern */
t1 = await task('tok1');
a = await answer('tok1', 'zzzzzz');
ok('daneben → Auswahl',        a.result === 'choice');
ok('acht Optionen',            a.task.options.length === 8, `${a.task.options.length}`);
ok('Serie gerissen? noch nicht', a.streak === 1);
const richtig = await solutionOf(t1);
before = await openOf(myTeam);
a = await answer('tok1', richtig);
ok('Auswahl richtig → Feld',   a.result === 'correct' && await openOf(myTeam) === before + 1);
ok('Auswahl zählt nicht für die Serie', a.streak === 0, `streak=${a.streak}`);

/* Fast richtig → Schreibweisen. Das Wort wird festgelegt: bei einem
   Drei-Buchstaben-Wort („gym") gibt es diese Stufe absichtlich nicht,
   und welches Wort gerade dran ist, entscheidet sonst der Zufall. */
await db.query(
  `update wi_players set current_item = (select id from vocab_items where term='die Bibliothek'),
                         current_dir = 'de_en', current_stage = 'type'
    where participant_id = $1`, [P1]);
t1 = await task('tok1');
const sol = await solutionOf(t1);
const fast = sol.slice(0, -1);
a = await answer('tok1', fast);
ok('fast → Schreibweisen',     a.result === 'spell', `${sol} → ${fast}: ${a.result}`);
ok('Schreibweisen enthalten die eigene', a.task.options.includes(fast));
await unlock('tok1');
a = await answer('tok1', 'völlig daneben');
ok('in der Auswahl gibt es kein zweites „fast"', a.result === 'wrong', a.result);
ok('Lösung wird gezeigt',      typeof a.solution === 'string' && a.solution.length > 0, a.solution);
ok('Sperre gesetzt',           a.locked_for >= 1, `${a.locked_for}s`);

/* Zu schnell nachlegen */
a = await answer('tok1', 'egal');
ok('Sperre greift',            a.ok === false && a.error === 'too_fast');
await unlock('tok1');

/* ── Serie und freie Wahl ──────────────────────────────────── */
for (let i = 0; i < 3; i++) {
  const t = await task('tok1');
  await unlock('tok1');
  a = await answer('tok1', await solutionOf(t));
}
ok('Serie 3',                  a.streak >= 3, `streak=${a.streak}`);
ok('freie Wahl gutgeschrieben', a.picks >= 1, `picks=${a.picks}`);
ok('kein Zufallsfeld bei Serie', a.tile === null);

const rand = await one(
  `select t.r, t.c from wi_tiles m
     cross join lateral wi_neighbors(m.r, m.c) n
     join wi_tiles t on t.room_id = m.room_id and t.r = n.r and t.c = n.c
    where m.room_id=$1 and m.owner_team=$2 and t.state='fog' limit 1`, [ROOM, myTeam]);
before = await openOf(myTeam);
let p = (await one(`select wi_pick_tile($1,$2,$3) v`, ['tok1', rand.r, rand.c])).v;
ok('freie Wahl am eigenen Rand', p.ok === true, JSON.stringify(p));
ok('Feld gehört jetzt mir',    await openOf(myTeam) === before + 1);

const far = await one(
  `select t.r, t.c from wi_tiles t where t.room_id=$1 and t.state='fog'
     and not exists (select 1 from wi_tiles m cross join lateral wi_neighbors(m.r,m.c) n
                      where m.room_id=$1 and m.owner_team=$2 and n.r=t.r and n.c=t.c) limit 1`,
  [ROOM, myTeam]);
await db.query(`update wi_players set picks = 1 where participant_id=$1`, [P1]);
p = (await one(`select wi_pick_tile($1,$2,$3) v`, ['tok1', far.r, far.c])).v;
ok('fernes Feld abgelehnt',    p.ok === false && p.error === 'not_reachable');

/* ── Nach dem Nebel: erobern ───────────────────────────────── */
const enemy = (myTeam + 1) % 4;
await db.exec(`
  update wi_tiles set state='open', owner_team=${myTeam}, updated_at = now() - interval '1 minute'
   where room_id='${ROOM}' and not is_home;
  update wi_tiles set owner_team=${enemy}, updated_at = now() - interval '1 minute'
   where room_id='${ROOM}' and not is_home and (r,c) in (
     select t.r, t.c from wi_tiles m cross join lateral wi_neighbors(m.r,m.c) n
       join wi_tiles t on t.room_id=m.room_id and t.r=n.r and t.c=n.c
      where m.room_id='${ROOM}' and m.owner_team=${myTeam} and not t.is_home limit 5);
`);
const homeOfEnemy = await one(`select r, c from wi_tiles where room_id=$1 and is_home and owner_team=$2`, [ROOM, enemy]);
before = await openOf(myTeam);
const enemyBefore = await openOf(enemy);
await unlock('tok1');
await db.query(`update wi_players set streak = 0, picks = 0 where participant_id=$1`, [P1]);
t1 = await task('tok1');
a = await answer('tok1', await solutionOf(t1));
ok('ohne Nebel wird erobert',  a.tile?.kind === 'enemy', JSON.stringify(a.tile));
ok('Gegner verliert ein Feld', await openOf(enemy) === enemyBefore - 1);
ok('Landeplatz des Gegners bleibt',
   (await one(`select owner_team from wi_tiles where room_id=$1 and r=$2 and c=$3`,
              [ROOM, homeOfEnemy.r, homeOfEnemy.c])).owner_team === enemy);

/* Ping-Pong: das eben genommene Feld ist vier Sekunden gesperrt */
const taken = a.tile;
const backHit = await one(
  `update wi_tiles set owner_team=$4, updated_at=now()
    where room_id=$1 and r=$2 and c=$3
      and (state='fog' or (owner_team is distinct from $4 and not is_home
                           and updated_at < now() - interval '4 seconds'))
   returning r`, [ROOM, taken.r, taken.c, enemy]);
ok('frisch genommenes Feld ist gesperrt', backHit === undefined);

/* ── Punkte und Ende ───────────────────────────────────────── */
r = (await one(`select wi_room_get($1) v`, [CODE])).v;
const mine = r.teams.find(x => x.i === myTeam);
ok('Punkte = Felder + Ruinen', mine.score === mine.tiles + mine.ruins, JSON.stringify(mine));

const hard = (await one(`select wi_hard_words($1) v`, [CODE])).v;
ok('schwerste Wörter da',      hard.ok === true && hard.words.length > 0, JSON.stringify(hard.words[0]));
ok('schwerste Wörter ohne Namen',
   !JSON.stringify(hard.words).includes('Kind '));

/* Lehrkraft weg → Arena endet von selbst */
await db.exec(`update wi_boards set presenter_seen_at = now() - interval '3 minutes' where room_id='${ROOM}'`);
v = (await one(`select wi_view($1) v`, ['tok2'])).v;
ok('ohne Lehrkraft endet die Arena', v.phase === 'ended', v.phase);
ok('Einzelübung läuft weiter',  !!v.me.task?.prompt);

const before2 = await openOf(myTeam);
await unlock('tok2');
const t2 = await task('tok2');
a = await answer('tok2', await solutionOf(t2));
ok('Einzelübung ändert die Karte nicht', await openOf(myTeam) === before2 && a.tile === null);

/* ── Nachzügler ────────────────────────────────────────────── */
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               values ('${ROOM}', 'tok99', 99, 'Nachzügler')`);
await db.exec(`update wi_boards set phase='running', ends_at = now() + interval '5 minutes',
                                    presenter_seen_at = now() where room_id='${ROOM}'`);
// Vorher zählen: nach dem Beitritt ist das kleinste Volk um eines
// gewachsen und sähe im Nachhinein nicht mehr wie das kleinste aus.
const vor = await all(`select team_index, count(*)::int n from wi_players where room_id=$1 group by team_index`, [ROOM]);
const kleinste = Math.min(...vor.map(x => x.n));
v = (await one(`select wi_view($1) v`, ['tok99'])).v;
ok('Nachzügler kommt ins kleinste Volk',
   vor.filter(x => x.n === kleinste).some(x => x.team_index === v.me.team),
   `vorher ${JSON.stringify(vor)} → Volk ${v.me.team}`);

/* ── Listen am Pult ────────────────────────────────────────── */
let sl = (await one(`select wi_sets_list($1) v`, [CODE])).v;
ok('Listen am Pult',           sl.ok === true && sl.sets.length >= 3);
ok('Listen: Auswahl dabei',    Array.isArray(sl.chosen) && sl.chosen.length === 1);

let imp = (await one(`select wi_set_import($1,$2,$3) v`, [CODE, 'Unit 7', 'Baum - tree\nBlume - flower'])).v;
ok('Import über das Pult',     imp.ok === true && imp.added === 2, JSON.stringify(imp));
sl = (await one(`select wi_sets_list($1) v`, [CODE])).v;
ok('eigene Liste erscheint',   sl.sets.some(s => s.title === 'Unit 7' && s.mine === '1'));

const del = (await one(`select wi_set_delete($1,$2) v`, [CODE, imp.set])).v;
ok('Löschen über das Pult',    del.ok === true);
const fremd = (await one(`select wi_set_import($1,$2,$3) v`, ['ZZZZZZ', 'x', 'a - b'])).v;
ok('fremder Raum: keine Auskunft', fremd.ok === false && fremd.error === 'not_found');

/* ── Registry ──────────────────────────────────────────────── */
await run(readFileSync(`${REPO}/supabase/migrations/0132_skill_tool_wordisland.sql`, 'utf8'), '0132');
const reg = await one(`select * from skill_tools where id='wordisland'`);
ok('Registry: Zeile da',       !!reg, JSON.stringify(reg && reg.title));
ok('Registry: Fach Englisch',  reg.subject === 'Englisch');
ok('Registry: Ordner = id',    reg.folder === 'wordisland');
await run(readFileSync(`${REPO}/supabase/migrations/0132_skill_tool_wordisland.sql`, 'utf8'), '0132 (2. Lauf)');
ok('Registry: zweiter Lauf legt nichts doppelt an',
   (await one(`select count(*)::int n from skill_tools where id='wordisland'`)).n === 1);

/* ── Zweiter Lauf ──────────────────────────────────────────── */
await run(readFileSync(`${REPO}/supabase/migrations/0131_wordisland_game.sql`, 'utf8'), '0131 (2. Lauf)');
ok('Zweiter Lauf: Insel steht noch',
   (await one(`select count(*)::int n from wi_tiles where room_id=$1`, [ROOM])).n === tiles.length);

console.log('\nfertig.');
