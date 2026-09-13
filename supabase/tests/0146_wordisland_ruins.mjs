/* Prüfstand für Migration 0146 — die Ruinen im Mehrspieler.
   Echt gerechnet in pglite, Stubs wie in 0136…0145.

   Zweistufig wie die Prüfstände zu 0140/0141/0142: erst laufen
   0130…0145 — da sind Ruinen bloße Zahlen —, dann kommt 0146
   obendrauf. Nur so ist der ÜBERGANG prüfbar, und zwar an der
   Stelle, die im Betrieb wehtut: eine Insel, die schon steht.

   Die Zusagen in Worten:
     1.  Vor 0146 gibt es weder ruin_kind noch `ruins` in wi_view.
     2.  Der Altbestand (ruin_value 1..3) wird zu kleinen Ruinen —
         keine halben Orte, die in der Wertung verschwinden.
     3.  Eine frische Insel trägt genau 1 Schatten, 1 Licht, 1 Arena
         und je drei bis fünf Tore und Klos.
     4.  Die drei Großen liegen innen, alle halten Abstand — zu
         einander und zu jedem Landeplatz.
     5.  Die Herzen stehen so, wie wi_ruin_def es sagt.
     6.  Der Zufallsgriff berührt in 200 Zügen keine einzige Ruine.
     7.  Ein Klo fällt mit der zweiten Wahl, nicht mit der ersten —
         und steht dem nächsten Angreifer sofort wieder voll da.
     8.  Erst der Treffer deckt auf, was dort steht (`revealed`).
     9.  Die Arena schenkt drei Wahlen, der Deckel hält bei sechs.
     10. Der Lichttempel schützt genau fünf eigene Frontfelder und
         keines über zwei Herzen hinaus.
     11. Ein geschütztes Feld schluckt einen Zufallsgriff.
     12. Der Schattentempel vernebelt sieben Felder, verschont den
         Landeplatz und stellt eine Ruine im Kranz auf Anfang.
     13. Die Wertung ist die Summe der Wertigkeiten.
     14. wi_view trägt `ruins` und `hearts` in Kartenlänge, die Karte
         selbst nur die Klasse.
     15. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0146_wordisland_ruins.mjs  */
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
  token text unique, seat int not null, name text,
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

const BIS_0145 = [
  '0130_vocab_content.sql', '0131_wordisland_game.sql', '0133_wordisland_lobby.sql',
  '0134_wordisland_back_to_lobby.sql', '0135_wordisland_eight_factions.sql',
  '0136_wordisland_solo.sql', '0137_wordisland_solo_pgcrypto.sql',
  '0138_wordisland_solo_stats.sql', '0139_wordisland_solo_points.sql',
  '0140_wordisland_solo_bag_choice.sql', '0141_wordisland_solo_pass_percent.sql',
  '0142_wordisland_solo_units.sql', '0143_wordisland_solo_avatar.sql',
  '0145_wordisland_solo_level.sql'
];

await run(STUBS, 'Stubs');
for (const f of BIS_0145) await run(mig(f), f.slice(0, 4));
console.log('— 0130 … 0145 laufen durch —\n');

/* ── Ein Raum mit 12 Kindern und vier Völkern ───────────────── */
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
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,12) g;
`);

const schule = (await one(`select id from vocab_sets where title='Schule'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5) v`, [CODE, [schule], 4, 600, 'de_en']);

const starte = async () => {
  const r = (await one(`select wi_room_start($1) v`, [CODE])).v;
  await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                  where room_id='${ROOM}'`);
  await one(`select wi_view($1, true) v`, ['tok1']);   // countdown → running
  return r;
};

/* ══ Stufe 1: die Welt vor 0146 ════════════════════════════════ */
await starte();

const hatSpalte = async (t, s) => n((await one(
  `select count(*) k from information_schema.columns
    where table_name = $1 and column_name = $2`, [t, s])).k) > 0;

ok('vor 0146: keine Spalte ruin_kind', !(await hatSpalte('wi_tiles', 'ruin_kind')));
ok('vor 0146: kein shadow_pick',       !(await hatSpalte('wi_players', 'shadow_pick')));
let v = (await one(`select wi_view($1, true) v`, ['tok1'])).v;
ok('vor 0146: wi_view ohne `ruins`',   v.ruins === undefined, JSON.stringify(Object.keys(v)));

const altBestand = n((await one(
  `select count(*) k from wi_tiles where room_id=$1 and ruin_value > 0`, [ROOM])).k);
ok('vor 0146: Lichtpunkte liegen da',  altBestand >= 6, `${altBestand}`);

/* ══ Stufe 2: 0146 ═════════════════════════════════════════════ */
await run(mig('0146_wordisland_ruins.sql'), '0146');
console.log('\n— 0146 läuft durch —\n');

const alt = await all(`select ruin_kind, ruin_value, hearts from wi_tiles
                        where room_id=$1 and ruin_value > 0`, [ROOM]);
ok('Altbestand wird zu kleinen Ruinen',
   alt.length === altBestand && alt.every(x => x.ruin_kind === 'tor' || x.ruin_kind === 'klo'),
   `${alt.length} Stück`);
ok('Altbestand bekommt passende Herzen',
   alt.every(x => (x.ruin_kind === 'tor' ? n(x.hearts) === 2 && n(x.ruin_value) === 10
                                         : n(x.hearts) === 1 && n(x.ruin_value) === 5)));

/* ── Eine frische Insel ─────────────────────────────────────── */
await one(`select wi_room_to_lobby($1) v`, [CODE]);
await starte();

const R = n((await one(`select radius from wi_boards where room_id=$1`, [ROOM])).radius);
const tiles = await all(`select r, c, state, owner_team, is_home, ruin_kind, ruin_value,
                                hearts, revealed, dist
                           from wi_tiles where room_id=$1`, [ROOM]);
const ruinen = tiles.filter(t => t.ruin_kind);
const zahl = k => ruinen.filter(t => t.ruin_kind === k).length;

ok('genau ein Schattentempel',  zahl('schatten') === 1, `${zahl('schatten')}`);
ok('genau ein Lichttempel',     zahl('licht') === 1,    `${zahl('licht')}`);
ok('genau eine Arena',          zahl('arena') === 1,    `${zahl('arena')}`);
ok('drei bis fünf Torbögen',    zahl('tor') >= 3 && zahl('tor') <= 5, `${zahl('tor')}`);
ok('drei bis fünf Klos',        zahl('klo') >= 3 && zahl('klo') <= 5, `${zahl('klo')}`);

const gross = ruinen.filter(t => ['arena', 'licht', 'schatten'].includes(t.ruin_kind));
ok('die drei Großen liegen innen',
   gross.every(t => Number(t.dist) <= 0.62 * R),
   gross.map(t => `${t.ruin_kind} ${Number(t.dist).toFixed(1)}/${R}`).join(' '));

const gap = (a, b) => Math.hypot((a.c + 0.5 * (a.r % 2)) - (b.c + 0.5 * (b.r % 2)),
                                 (a.r - b.r) * 0.8660254);
ok('Ruinen halten Abstand',
   ruinen.every(a => ruinen.every(b => a === b || gap(a, b) >= 2.4)));
const homes = tiles.filter(t => t.is_home);
ok('Ruinen halten Abstand zu den Landeplätzen',
   ruinen.every(a => homes.every(h => gap(a, h) >= 1.5)));
ok('keine Ruine auf einem Landeplatz', ruinen.every(t => !t.is_home));

const SOLL = { klo: 1, tor: 2, arena: 3, licht: 4, schatten: 4 };
const WERT = { klo: 5, tor: 10, arena: 4, licht: 5, schatten: 5 };
ok('Herzen und Wertigkeit stehen wie in wi_ruin_def',
   ruinen.every(t => n(t.hearts) === SOLL[t.ruin_kind] && n(t.ruin_value) === WERT[t.ruin_kind]));
ok('frische Ruinen sind noch geheim', ruinen.every(t => t.revealed === false));

/* ── Der Zufallsgriff lässt Ruinen in Ruhe ──────────────────── */
// 200 Züge für alle vier Völker, die Vier-Sekunden-Sperre jeweils
// zurückgedreht — sonst prüft die Schleife nur, wie schnell sie ist.
for (let i = 0; i < 200; i++) {
  await db.exec(`update wi_tiles set updated_at = now() - interval '10 seconds'
                  where room_id='${ROOM}'`);
  await one(`select wi_take_tile($1, $2) v`, [ROOM, i % 4]);
}
const angefasst = await all(
  `select ruin_kind, owner_team, hearts, revealed from wi_tiles
    where room_id=$1 and ruin_kind is not null
      and (owner_team is not null or revealed or hearts < $2)`,
  [ROOM, 1]);
ok('200 Zufallsgriffe berühren keine Ruine', angefasst.length === 0,
   angefasst.map(x => x.ruin_kind).join(' '));
const genommen = n((await one(
  `select count(*) k from wi_tiles where room_id=$1 and owner_team is not null`, [ROOM])).k);
ok('… haben aber Land genommen', genommen > 4, `${genommen} Felder in Besitz`);

/* ── Bühne für den Kampf ────────────────────────────────────── */
// Ein Kind, sein Volk, sein Landeplatz. Die Ruine legen wir an einen
// Nachbarn davon: so ist die Bedingung „nur am eigenen Rand" erfüllt,
// ohne dass der Test vom Zufall der Insel abhängt.
const ich = await one(`select participant_id, team_index from wi_players
                        join skill_participants p on p.id = participant_id
                       where p.token = 'tok1'`);
const TEAM = n(ich.team_index);
const nb = (r, c) => {
  const odd = ((r % 2) + 2) % 2 === 1;
  const d = odd ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
                : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
  return d.map(([dr, dc]) => [r + dr, c + dc]);
};
const feld = async (r, c) => await one(
  `select * from wi_tiles where room_id=$1 and r=$2 and c=$3`, [ROOM, r, c]);

const heim = homes.find(h => n(h.owner_team) === TEAM);

// ⚠️ Die Bühne hängt NICHT am Landeplatz. Der liegt an der Küste, und
// auf einer Landzunge hat er zwei Nachbarn statt sechs — ein Prüfstand,
// der davon abhängt, fällt bei jeder vierten Insel um. Genommen wird
// deshalb ein Feld im Landesinneren mit allen sechs Nachbarn.
const drin = new Set(tiles.map(t => `${t.r}/${t.c}`));
const frei = (r, c) => {
  const t = tiles.find(x => n(x.r) === r && n(x.c) === c);
  return t && !t.is_home;
};
const basis = tiles.find(t => !t.is_home && !t.ruin_kind &&
  nb(n(t.r), n(t.c)).every(([r2, c2]) => drin.has(`${r2}/${c2}`) && frei(r2, c2)));
ok('ein Feld im Landesinneren gefunden', !!basis,
   basis ? `${basis.r}/${basis.c}` : 'keins');
const drumherum = nb(n(basis.r), n(basis.c));

// Zurück auf Anfang: Nebel, kein Besitzer, keine Ruine. Die 200 Züge
// von eben haben hier gewütet.
const putz = async (r, c) => db.query(
  `update wi_tiles set state='fog', owner_team=null, ruin_kind=null, ruin_value=0,
          hearts=0, revealed=false, updated_at = now() - interval '10 seconds'
    where room_id=$1 and r=$2 and c=$3 and not is_home`, [ROOM, r, c]);
for (const [r, c] of drumherum) await putz(r, c);

// Die Basis gehört dem Volk — daran hängt „nur am eigenen Rand".
const basisUns = async () => db.query(
  `update wi_tiles set state='open', owner_team=$2, ruin_kind=null, ruin_value=0,
          hearts=0, revealed=false, updated_at = now() - interval '10 seconds'
    where room_id=$1 and r=$3 and c=$4`, [ROOM, TEAM, n(basis.r), n(basis.c)]);
await basisUns();

const setzeRuine = async (r, c, art) => db.query(
  `update wi_tiles t set ruin_kind=$4, ruin_value=d.value, hearts=d.hearts_full,
          revealed=false, state='fog', owner_team=null,
          updated_at = now() - interval '10 seconds'
     from wi_ruin_def($4) d
    where t.room_id=$1 and t.r=$2 and t.c=$3`, [ROOM, r, c, art]);
const gibPicks = async k => db.query(
  `update wi_players set picks=$2, shadow_pick=0 where participant_id=$1`, [ich.participant_id, k]);
const pick = async (r, c) => (await one(
  `select wi_pick_tile($1,$2,$3) v`, ['tok1', r, c])).v;

/* ── Ein Klo fällt mit der zweiten Wahl ─────────────────────── */
const [kr, kc] = drumherum[0];
await setzeRuine(kr, kc, 'klo');
await gibPicks(6);

let p = await pick(kr, kc);
ok('Klo: erste Wahl ist ein Treffer', p.ok === true && p.tile.result === 'hit', JSON.stringify(p));
ok('Klo: Treffer nimmt ein Herz',     n(p.tile.hearts) === 0);
ok('Klo: gehört noch niemandem',      (await feld(kr, kc)).owner_team === null);
ok('Klo: der Treffer deckt auf',      (await feld(kr, kc)).revealed === true);
ok('Klo: die Wahl ist verbraucht',    n(p.picks) === 5, `${p.picks}`);

p = await pick(kr, kc);
ok('Klo: zweite Wahl nimmt es ein',   p.ok === true && p.tile.result === 'taken', JSON.stringify(p));
let t0 = await feld(kr, kc);
ok('Klo: gehört jetzt dem Volk',      n(t0.owner_team) === TEAM && t0.state === 'open');
ok('Klo: steht wieder voll da',       n(t0.hearts) === 1, `${t0.hearts}`);
ok('Klo: hat keine Fähigkeit',        p.effect === null || p.effect.kind === 'klo');

p = await pick(kr, kc);
ok('das eigene Feld greift man nicht an', p.ok === false && p.error === 'own_tile', JSON.stringify(p));

/* ── Die Arena schenkt drei Wahlen ──────────────────────────── */
const [ar, ac] = drumherum[1];
await setzeRuine(ar, ac, 'arena');
await gibPicks(4);
for (let i = 0; i < 3; i++) {
  p = await pick(ar, ac);
  ok(`Arena: Treffer ${i + 1} von 3`, p.ok === true && p.tile.result === 'hit');
}
p = await pick(ar, ac);
ok('Arena: der vierte Schlag nimmt sie ein', p.ok === true && p.tile.result === 'taken');
ok('Arena: Fähigkeit gemeldet',       p.effect && p.effect.kind === 'arena', JSON.stringify(p.effect));
ok('Arena: drei Wahlen geschenkt',    n(p.picks) === 0 && n((await one(
   `select picks from wi_players where participant_id=$1`, [ich.participant_id])).picks) === 3,
   `picks nach der Einnahme`);

await gibPicks(6);
await db.exec(`update wi_tiles set updated_at = now() - interval '10 seconds' where room_id='${ROOM}'`);
const [a2r, a2c] = drumherum[2];
await setzeRuine(a2r, a2c, 'arena');
for (let i = 0; i < 4; i++) { await pick(a2r, a2c); }
ok('Arena: der Deckel hält bei sechs',
   n((await one(`select picks from wi_players where participant_id=$1`, [ich.participant_id])).picks) <= 6);

/* ── Der Lichttempel schützt fünf Frontfelder ───────────────── */
// Genug eigenes Land, damit „fünf" überhaupt eine Auswahl ist: der
// Landeplatz, sein Umfeld und dessen Nachbarn.
const meine = [];
for (const [r, c] of drumherum) meine.push([r, c]);
for (const [r, c] of drumherum) {
  for (const [r2, c2] of nb(r, c)) {
    if (await feld(r2, c2) && !meine.some(([a, b]) => a === r2 && b === c2)) meine.push([r2, c2]);
  }
}
for (const [r, c] of meine) {
  await db.query(`update wi_tiles set state='open', owner_team=$4, ruin_kind=null, ruin_value=0,
                         hearts=0, revealed=false
                   where room_id=$1 and r=$2 and c=$3 and not is_home`, [ROOM, r, c, TEAM]);
}
const eigene = n((await one(
  `select count(*) k from wi_tiles where room_id=$1 and owner_team=$2`, [ROOM, TEAM])).k);
ok('das Volk hat genug Land für den Test', eigene >= 8, `${eigene} Felder`);

// Ein Feld steht schon auf zwei Herzen — es darf kein drittes bekommen.
const [vr, vc] = meine[0];
await db.query(`update wi_tiles set hearts=2 where room_id=$1 and r=$2 and c=$3`, [ROOM, vr, vc]);

const [lr, lc] = meine[meine.length - 1];
await db.query(`update wi_tiles set state='fog', owner_team=null where room_id=$1 and r=$2 and c=$3`,
               [ROOM, lr, lc]);
await setzeRuine(lr, lc, 'licht');
await gibPicks(6);
for (let i = 0; i < 5; i++) { p = await pick(lr, lc); }
ok('Lichttempel: fünf Schläge nehmen ihn ein', p.ok === true && p.tile.result === 'taken',
   JSON.stringify(p.tile));
ok('Lichttempel: Fähigkeit gemeldet', p.effect && p.effect.kind === 'licht', JSON.stringify(p.effect));
ok('Lichttempel: genau fünf Felder geschützt', n(p.effect.guarded) === 5, `${p.effect && p.effect.guarded}`);

const geschuetzt = await all(
  `select r, c, hearts from wi_tiles where room_id=$1 and owner_team=$2
     and ruin_kind is null and hearts > 0`, [ROOM, TEAM]);
ok('Lichttempel: kein Feld über zwei Herzen',
   geschuetzt.every(x => n(x.hearts) <= 2), geschuetzt.map(x => x.hearts).join(''));
ok('Lichttempel: das volle Feld blieb außen vor',
   n((await feld(vr, vc)).hearts) === 2);
// Front heißt: mindestens ein Nachbar ist Nebel oder fremd.
let alleFront = true;
for (const g of geschuetzt) {
  if (n(g.hearts) !== 1) continue;                 // das vorbelegte Feld nicht
  let front = false;
  for (const [r2, c2] of nb(n(g.r), n(g.c))) {
    const u = await feld(r2, c2);
    if (u && (u.state === 'fog' || n(u.owner_team) !== TEAM)) front = true;
  }
  if (!front) alleFront = false;
}
ok('Lichttempel: geschützt wird an der Front', alleFront);

/* ── Ein Schild schluckt einen Zufallsgriff ─────────────────── */
const schild = geschuetzt.find(g => n(g.hearts) === 1);
const gegner = (TEAM + 1) % 4;
// Die Bühne muss eng sein, sonst prüft sie etwas anderes: „Nebel
// zuerst" gilt weiter, ein Volk mit Nebel am Rand kommt also gar
// nicht bis zum geschützten Feld. Deshalb gehört dem Gegner ALLES
// außer diesem einen Feld — dann ist es der einzige Kandidat.
// (Landeplätze sind ohnehin unantastbar, wi_border lässt sie aus.)
await db.query(
  `update wi_tiles set state='open', owner_team=$2, ruin_kind=null, ruin_value=0,
          hearts=0, revealed=false, updated_at = now() - interval '10 seconds'
    where room_id=$1 and not is_home and not (r=$3 and c=$4)`,
  [ROOM, gegner, n(schild.r), n(schild.c)]);
await db.query(
  `update wi_tiles set state='open', owner_team=$2, hearts=1,
          updated_at = now() - interval '10 seconds'
    where room_id=$1 and r=$3 and c=$4`, [ROOM, TEAM, n(schild.r), n(schild.c)]);

const g1 = (await one(`select wi_take_tile($1,$2) v`, [ROOM, gegner])).v;
ok('ein Schild schluckt einen Zufallsgriff', g1 && g1.kind === 'guard', JSON.stringify(g1));
ok('das Schild ist danach weg, das Land nicht',
   g1 && n(g1.hearts) === 0 &&
   n((await feld(n(schild.r), n(schild.c))).owner_team) === TEAM);
await db.exec(`update wi_tiles set updated_at = now() - interval '10 seconds' where room_id='${ROOM}'`);
const g2 = (await one(`select wi_take_tile($1,$2) v`, [ROOM, gegner])).v;
ok('der nächste Griff nimmt dann das Land',
   g2 && g2.kind === 'enemy' &&
   n((await feld(n(schild.r), n(schild.c))).owner_team) === gegner, JSON.stringify(g2));

/* ── Der Schattentempel holt den Nebel zurück ───────────────── */
await basisUns();                     // der Schild-Aufbau hat sie verschenkt
const [sr, sc] = drumherum[0];
await setzeRuine(sr, sc, 'schatten');
await gibPicks(6);
for (let i = 0; i < 5; i++) { p = await pick(sr, sc); }
ok('Schattentempel: fünf Schläge nehmen ihn ein', p.ok === true && p.tile.result === 'taken');
ok('Schattentempel: ein Nebelkranz gutgeschrieben',
   p.effect && p.effect.kind === 'schatten' && n(p.shadow_pick) === 1, JSON.stringify(p));

// Zentrum: der Landeplatz des Volkes. Er MUSS stehen bleiben, seine
// Nachbarn nicht — darunter eine Ruine, die wir vorher dorthin legen.
const heimNb = [];
for (const [r, c] of nb(n(heim.r), n(heim.c))) if (await feld(r, c)) heimNb.push([r, c]);
const [rr, rc] = heimNb[0];
await setzeRuine(rr, rc, 'tor');
await db.query(`update wi_tiles set owner_team=$2, state='open', revealed=true, hearts=0
                 where room_id=$1 and r=$3 and c=$4`, [ROOM, TEAM, rr, rc]);

const vorher = n((await one(`select count(*) k from wi_tiles
                              where room_id=$1 and state='fog'`, [ROOM])).k);
const s = (await one(`select wi_shadow_strike($1,$2,$3) v`, ['tok1', n(heim.r), n(heim.c)])).v;
ok('Schattenschlag geht durch', s.ok === true, JSON.stringify(s));
ok('Schattenschlag nimmt jeden Nachbarn außer dem Landeplatz',
   n(s.fogged) === heimNb.length, `${s.fogged} von ${heimNb.length} Nachbarn`);
ok('der Landeplatz steht noch', n((await feld(n(heim.r), n(heim.c))).owner_team) === TEAM);
const torNachher = await feld(rr, rc);
ok('die Ruine im Kranz ist wieder neutral',
   torNachher.state === 'fog' && torNachher.owner_team === null);
ok('… steht wieder voll da und ist wieder geheim',
   n(torNachher.hearts) === 2 && torNachher.revealed === false);
ok('das Recht ist verbraucht', n(s.shadow_pick) === 0);
const s2 = (await one(`select wi_shadow_strike($1,$2,$3) v`, ['tok1', n(heim.r), n(heim.c)])).v;
ok('ohne Recht kein zweiter Schlag', s2.ok === false && s2.error === 'no_shadow');
ok('vorher war weniger Nebel', vorher < n((await one(
   `select count(*) k from wi_tiles where room_id=$1 and state='fog'`, [ROOM])).k));

/* ── Die Wertung ───────────────────────────────────────────── */
await db.exec(`update wi_tiles set owner_team=null, state='fog', ruin_kind=null,
                      ruin_value=0, hearts=0 where room_id='${ROOM}' and not is_home`);
await db.query(`update wi_tiles t set ruin_kind='tor', ruin_value=d.value, hearts=d.hearts_full,
                       owner_team=$2, state='open', revealed=true
                  from wi_ruin_def('tor') d
                 where t.room_id=$1 and t.r=$3 and t.c=$4`, [ROOM, TEAM, rr, rc]);
const teams = (await one(`select wi_teams_json($1, 4) v`, [ROOM])).v;
const mein = teams.find(t => t.i === TEAM);
ok('Wertung: das Volk hat zwei Felder', n(mein.tiles) === 2, JSON.stringify(mein));
ok('Wertung: ein Torbogen bringt neun dazu', n(mein.ruins) === 9, JSON.stringify(mein));
ok('Wertung: Punkte sind die Summe der Wertigkeiten', n(mein.score) === 11, JSON.stringify(mein));

/* ── Was ans Gerät geht ────────────────────────────────────── */
v = (await one(`select wi_view($1, true) v`, ['tok1'])).v;
ok('wi_view: Karte, Besitz, Ruinen und Herzen sind gleich lang',
   v.map.length === v.own.length && v.own.length === v.ruins.length &&
   v.ruins.length === v.hearts.length, `${v.map.length}/${v.own.length}/${v.ruins.length}/${v.hearts.length}`);
ok('wi_view: der Torbogen steht im ruins-String',
   (v.ruins.match(/T/g) || []).length === 1, v.ruins.replace(/\./g, '').slice(0, 20));
ok('wi_view: seine Herzen stehen daneben',
   v.hearts[v.ruins.indexOf('T')] === '2', v.hearts[v.ruins.indexOf('T')]);
ok('wi_view: shadow_pick fährt mit', v.me.shadow_pick === 0, JSON.stringify(v.me.shadow_pick));

// Die Karte trägt die Klasse, nicht die Art: 1 für Tor/Klo, 2 für die
// drei Großen. Ein frisch gewürfeltes Board zeigt beides.
await one(`select wi_room_to_lobby($1) v`, [CODE]);
await starte();
v = (await one(`select wi_view($1, true) v`, ['tok1'])).v;
const klassen = v.map.map(x => x[2]);
ok('Karte: Klassen 0, 1 und 2 kommen vor',
   klassen.includes(0) && klassen.filter(k => k === 1).length >= 6 &&
   klassen.filter(k => k === 2).length === 3,
   `klein ${klassen.filter(k => k === 1).length}, groß ${klassen.filter(k => k === 2).length}`);
ok('Karte: im Nebel verrät nichts die Art', v.ruins === '.'.repeat(v.ruins.length));

/* ── Zweimal laufen ────────────────────────────────────────── */
await run(mig('0146_wordisland_ruins.sql'), '0146 (zweiter Lauf)');
ok('die Migration läuft zweimal', true);
v = (await one(`select wi_view($1, true) v`, ['tok1'])).v;
ok('… und danach steht die Insel unverändert da', v.map.length > 60 && v.ruins.length === v.map.length);

console.log(fails ? `\n${fails} Zusage(n) gerissen\n` : '\nalle Zusagen grün\n');
process.exit(fails ? 1 : 0);
