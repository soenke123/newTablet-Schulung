/* Prüfstand für Migration 0165 — „ein Herz weniger, doppelt so viele".
   Echt gerechnet in pglite, Stubs wie in 0136…0158.

   Zweistufig wie 0140/0141/0146/0148/0149/0158: erst laufen
   0130…0158 — dort hat der Lichttempel vier Herzen und eine große
   Insel trägt eIf Orte —, dann kommt 0165 obendrauf. Nur so ist der
   Unterschied belegt und nicht bloß behauptet.

   ⚠️ 0159…0163 bleiben draußen. Sie bringen das Lehrwerk und werfen
   dabei die drei Testlisten aus 0130 hinaus (0161) — genau die, auf
   denen dieser Prüfstand seinen Raum aufmacht. Mit den Ruinen haben
   sie nichts zu tun.

   Die Zusagen im Einzelnen:
     1. VOR 0165: Lichttempel 4 Herzen, Klo 1 — und eine Insel von
        rund 430 Feldern trägt elf Orte.
     2. NACH 0165: 3/3/2/1/0 Herzen, und dieselbe Insel trägt
        zweiundzwanzig. Das ist Sönkes „doppelt so viele".
     3. Jede der fünf Arten kommt auf der großen Insel vor, die drei
        großen ZWEIMAL.
     4. Auf einer kleinen Insel bleibt es bei je einem großen Ort —
        dort ist nicht die Zahl das Problem, sondern der Platz.
     5. Die Abstände halten: keine zwei Orte näher als zwei Felder,
        keiner näher als anderthalb an einem Landeplatz.
     6. Die Insel selbst ist unverändert: Felderzahl in der alten
        Größenordnung, ein Landeplatz je Volk.
     7. Ein Klo fällt mit EINER freien Wahl (0 Herzen) und gehört
        danach dem Volk — aufgedeckt, nicht halb.
     8. Ein Lichttempel kostet vier Wahlen statt fünf.
     9. Laufende Inseln: vier Herzen werden auf drei gedeckelt, zwei
        bleiben zwei (nur nach unten).
    10. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0165_wordisland_ruins_balance.mjs  */
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

/* ── Ein Raum mit vier Völkern ───────────────────────────────── */
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

const schule = (await one(`select id from vocab_sets where title like '%Schule%'`)).id;
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE, [schule], 4, 900, 'de_en', 'type']);

/* Die Insel wird nicht über wi_room_start gebaut, sondern geradeheraus:
   so steht die GRÖSSE im Prüfstand und nicht in der Zahl der
   angemeldeten Kinder. 27 Kinder × 10 Minuten × 1,6 = rund 430 Felder,
   also genau die Insel, über die Sönke geredet hat. */
const GROSS = [4, 27, 600];
const KLEIN = [4, 4, 120];

const baue = async ([teams, leute, secs]) =>
  n((await one(`select wi_build_island($1,$2,$3,$4) v`, [ROOM, teams, leute, secs])).v);

const orte = async () => {
  const rows = await all(
    `select ruin_kind k, count(*)::int c from wi_tiles
      where room_id=$1 and ruin_kind is not null group by 1 order by 1`, [ROOM]);
  const o = {}; let summe = 0;
  for (const r of rows) { o[r.k] = n(r.c); summe += n(r.c); }
  o._ = summe;
  return o;
};
const spur = o => ['klo', 'tor', 'arena', 'licht', 'schatten']
  .map(k => `${k}:${o[k] || 0}`).join(' ') + ` = ${o._}`;

const defs = async () => {
  const o = {};
  for (const k of ['klo', 'tor', 'arena', 'licht', 'schatten']) {
    o[k] = n((await one(`select hearts_full from wi_ruin_def($1)`, [k])).hearts_full);
  }
  return o;
};

/* ══ Stufe 1: die Welt vor 0165 ════════════════════════════════ */
const hVor = await defs();
ok('vor 0165: Lichttempel und Schattentempel haben vier Herzen',
   hVor.licht === 4 && hVor.schatten === 4, JSON.stringify(hVor));
ok('vor 0165: das Klo hat eines', hVor.klo === 1, JSON.stringify(hVor));

const nVor = await baue(GROSS);
const oVor = await orte();
ok('vor 0165: die große Insel hat rund 430 Felder', nVor > 380 && nVor < 500, String(nVor));
ok('vor 0165: elf Orte — drei große und acht kleine',
   oVor._ === 11 && oVor.arena === 1 && oVor.licht === 1 && oVor.schatten === 1,
   spur(oVor));

/* ══ Stufe 2: 0165 ═════════════════════════════════════════════ */
await run(mig('0165_wordisland_ruins_balance.sql'), '0165');
console.log('\n— 0165 läuft durch —\n');

const hNach = await defs();
ok('nach 0165: jede Ruine hat genau ein Herz weniger',
   ['klo', 'tor', 'arena', 'licht', 'schatten'].every(k => hNach[k] === hVor[k] - 1),
   JSON.stringify(hNach));
ok('nach 0165: das Klo steht bei null — eine Wahl genügt',
   hNach.klo === 0, String(hNach.klo));
ok('die Wertigkeiten sind unangetastet geblieben',
   n((await one(`select value from wi_ruin_def('tor')`)).value) === 10 &&
   n((await one(`select value from wi_ruin_def('arena')`)).value) === 4);

const nNach = await baue(GROSS);
const oNach = await orte();
/* „Doppelt so viele" ist keine Verdopplung der alten Formel, sondern
   eine DICHTE (ein Ort je rund zwanzig Felder) — auf der Insel, über
   die Sönke geredet hat, kommt beides aufs selbe heraus. Deshalb ein
   Fenster und keine feste Zahl: die Feldzahl schwankt von Wurf zu
   Wurf (der Umriss ist gewürfelt), und eine Zusage auf „genau 22"
   wäre in jedem dritten Lauf rot, ohne dass sich etwas geändert hat. */
ok('nach 0165: dieselbe Insel trägt doppelt so viele Orte',
   oNach._ >= 2 * oVor._ && oNach._ <= 2 * oVor._ + 3,
   `${oVor._} → ${oNach._}   (${spur(oNach)})`);
ok('die drei großen Arten liegen zweimal auf der Insel',
   oNach.arena === 2 && oNach.licht === 2 && oNach.schatten === 2, spur(oNach));
ok('Tore und Klos gleich oft, und mindestens doppelt so oft wie vorher',
   oNach.tor === oNach.klo && oNach.tor >= 2 * oVor.tor, spur(oNach));
ok('ein Ort je rund zwanzig Felder',
   nNach / oNach._ > 15 && nNach / oNach._ < 25, (nNach / oNach._).toFixed(1));
ok('die Insel selbst ist dieselbe geblieben',
   Math.abs(nNach - nVor) < 120 && nNach > 380, `${nVor} → ${nNach}`);
ok('jedes Volk hat genau einen Landeplatz',
   (await all(`select owner_team t, count(*)::int c from wi_tiles
                where room_id=$1 and is_home group by 1`, [ROOM]))
     .every(r => n(r.c) === 1) &&
   n((await one(`select count(*)::int c from wi_tiles where room_id=$1 and is_home`, [ROOM])).c) === 4);

/* ── Die Abstände ────────────────────────────────────────────
   Der zweite Anlauf in wi_build_island darf auf zwei Felder
   herunter, aber keinen Schritt weiter: zwei Ruinen auf
   benachbarten Feldern wären EIN Ort mit zwei Bildern. */
const engste = n((await one(
  `select coalesce(min(wi_tile_gap(a.r,a.c,b.r,b.c)),9)::real g
     from wi_tiles a join wi_tiles b
       on b.room_id=a.room_id and (b.r,b.c) <> (a.r,a.c) and b.ruin_kind is not null
    where a.room_id=$1 and a.ruin_kind is not null`, [ROOM])).g);
ok('keine zwei Orte liegen näher als zwei Felder beieinander',
   engste >= 1.99, engste.toFixed(2));

const amHaus = n((await one(
  `select coalesce(min(wi_tile_gap(a.r,a.c,h.r,h.c)),9)::real g
     from wi_tiles a join wi_tiles h on h.room_id=a.room_id and h.is_home
    where a.room_id=$1 and a.ruin_kind is not null`, [ROOM])).g);
ok('kein Ort liegt einem Landeplatz näher als anderthalb Felder',
   amHaus >= 1.49, amHaus.toFixed(2));

/* ── Die kleine Insel ────────────────────────────────────────
   Achtzig Felder sind der Boden (wi_build_island deckelt dort).
   Verdoppelt werden dürfen die großen Orte hier NICHT — sechs
   Tempel auf achtzig Feldern wären keine Ziele mehr, sondern
   Möblierung. */
const nKlein = await baue(KLEIN);
const oKlein = await orte();
ok('die kleine Insel bleibt bei je einem großen Ort',
   oKlein.arena === 1 && oKlein.licht === 1 && oKlein.schatten === 1,
   `${nKlein} Felder — ${spur(oKlein)}`);
ok('und sie ist nicht zugestellt (höchstens jedes sechste Feld)',
   oKlein._ <= nKlein / 6, `${oKlein._} von ${nKlein}`);
ok('alle fünf Arten kommen vor',
   ['klo', 'tor', 'arena', 'licht', 'schatten'].every(k => (oKlein[k] || 0) >= 1),
   spur(oKlein));

/* ── Bestand: die Herzen werden gedeckelt ────────────────────
   Nur nach unten. Der Deckel steht am Ende der Migration; geprüft
   wird er, indem eine Ruine von Hand auf den ALTEN Stand gesetzt
   und die Migration noch einmal gefahren wird. */
await db.exec(`
  update wi_tiles set hearts = 4
   where room_id = '${ROOM}' and ruin_kind = 'licht';
  update wi_tiles set hearts = 2
   where room_id = '${ROOM}' and ruin_kind = 'schatten';
`);
await run(mig('0165_wordisland_ruins_balance.sql'), '0165 (2. Lauf)');
const bestand = await all(
  `select ruin_kind k, min(hearts)::int lo, max(hearts)::int hi
     from wi_tiles where room_id=$1 and ruin_kind in ('licht','schatten')
    group by 1 order by 1`, [ROOM]);
const licht = bestand.find(r => r.k === 'licht');
const schatten = bestand.find(r => r.k === 'schatten');
ok('ein stehender Lichttempel geht von vier Herzen auf drei',
   n(licht.hi) === 3, JSON.stringify(licht));
ok('ein angeschlagener Schattentempel behält seine zwei',
   n(schatten.lo) === 2 && n(schatten.hi) === 2, JSON.stringify(schatten));

/* ══ Und jetzt wirklich spielen ════════════════════════════════
   Die Zahlen sind das eine, der Preis in freien Wahlen das andere.
   Gebaut wird eine Bühne im LANDESINNEREN: ein Landeplatz liegt an
   der Küste und hat auf einer Landzunge zwei Nachbarn statt sechs —
   daran ist der Prüfstand von 0146 bei jeder vierten Insel gefallen. */
await baue(GROSS);
const P1 = (await one(`select id from skill_participants where token='tok1'`)).id;
await one(`select wi_room_start($1) v`, [CODE]);
await db.exec(`update wi_boards set countdown_ends_at = now() - interval '1 second'
                where room_id='${ROOM}'`);
await one(`select wi_view($1, true) v`, ['tok1']);
const TEAM = n((await one(`select team_index t from wi_players where participant_id=$1`, [P1])).t);

/* Ein Feld mit sechs Nachbarn, keiner davon Landeplatz oder Ruine. */
const buehne = await one(`
  select t.r, t.c from wi_tiles t
   where t.room_id = $1 and not t.is_home and t.ruin_kind is null
     and (select count(*) from wi_neighbors(t.r, t.c) g
           join wi_tiles w on w.room_id = t.room_id and w.r = g.r and w.c = g.c
          where not w.is_home and w.ruin_kind is null) = 6
   order by random() limit 1`, [ROOM]);

const stelleRuine = async (art) => {
  const nb = await one(`
    select g.r, g.c from wi_neighbors($2, $3) g
      join wi_tiles w on w.room_id = $1 and w.r = g.r and w.c = g.c
     where not w.is_home limit 1`, [ROOM, buehne.r, buehne.c]);
  await db.exec(`
    update wi_tiles set owner_team = ${TEAM}, state='open', ruin_kind = null, hearts = 0
     where room_id='${ROOM}' and r=${buehne.r} and c=${buehne.c};
    update wi_tiles
       set ruin_kind = '${art}', owner_team = null, state = 'fog', revealed = false,
           hearts = (select hearts_full from wi_ruin_def('${art}')),
           ruin_value = (select value from wi_ruin_def('${art}')),
           updated_at = now() - interval '1 minute'
     where room_id='${ROOM}' and r=${nb.r} and c=${nb.c};`);
  return nb;
};
const wahlen = (k) => db.exec(
  `update wi_players set picks = ${k} where participant_id = '${P1}'`);
const zeigeAuf = (t) => one(`select wi_pick_tile($1,$2,$3) v`, ['tok1', t.r, t.c]);

/* 7) Das Klo: EINE Wahl. */
const klo = await stelleRuine('klo');
await wahlen(3);
const kloAus = (await zeigeAuf(klo)).v;
const kloFeld = await one(
  `select owner_team t, revealed, hearts from wi_tiles
    where room_id=$1 and r=$2 and c=$3`, [ROOM, klo.r, klo.c]);
ok('ein Klo fällt mit einer einzigen freien Wahl',
   kloAus.ok === true && kloAus.tile.result === 'taken' && n(kloFeld.t) === TEAM,
   JSON.stringify(kloAus.tile));
ok('und steht dabei nicht halb da — es ist aufgedeckt',
   kloFeld.revealed === true, JSON.stringify(kloFeld));

/* 8) Der Lichttempel: vier Wahlen statt fünf. */
const tempel = await stelleRuine('licht');
await wahlen(6);
const folge = [];
for (let i = 0; i < 5; i++) {
  await db.exec(`update wi_tiles set updated_at = now() - interval '1 minute'
                  where room_id='${ROOM}' and r=${tempel.r} and c=${tempel.c}`);
  const a = (await zeigeAuf(tempel)).v;
  folge.push(a.ok ? a.tile.result : a.error);
}
ok('ein Lichttempel kostet vier Wahlen: drei Treffer, dann gehört er dir',
   folge[0] === 'hit' && folge[1] === 'hit' && folge[2] === 'hit' && folge[3] === 'taken',
   folge.join(' '));
ok('die fünfte Wahl greift ins Leere — er gehört ja schon',
   folge[4] === 'own_tile', folge.join(' '));

/* Er hat beim Einnehmen wieder volle Herzen für den NÄCHSTEN
   Angreifer — jetzt drei und nicht mehr vier. */
const nachTempel = await one(
  `select hearts from wi_tiles where room_id=$1 and r=$2 and c=$3`,
  [ROOM, tempel.r, tempel.c]);
ok('und steht dem nächsten Volk mit drei Herzen gegenüber',
   n(nachTempel.hearts) === 3, JSON.stringify(nachTempel));

/* 10) Zweimal laufen lassen — die Zahlen bleiben. */
await run(mig('0165_wordisland_ruins_balance.sql'), '0165 (3. Lauf)');
const hWieder = await defs();
ok('0165 läuft mehrfach und ändert nichts',
   JSON.stringify(hWieder) === JSON.stringify(hNach), JSON.stringify(hWieder));

console.log(`\n${fails ? fails + ' FEHLER' : 'alles grün'}`);
process.exit(fails ? 1 : 0);
