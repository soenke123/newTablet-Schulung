/* Prüfstand für Migration 0168 — die Trainer-Insel der Lehrkraft.
   Echt gerechnet in pglite, Stubs wie in 0136…0167.

   Zweistufig: erst laufen 0130…0158, DORT gibt es die Funktion noch
   nicht (und das wird geprüft — ein Gerät mit neuer tool.js an einer
   alten Datenbank bekommt 42883 und damit im Browser 'fn_missing',
   siehe feedback_missing_migration_looks_like_network), dann kommt
   0168 obendrauf.

   Die Zusagen im Einzelnen:
     1. Vor 0168 gibt es wi_room_solo_claim nicht.
     2. Die Lehrkraft des Raums bekommt genau die Stationen DIESES
        Raums auf ihre Insel, und `from_room` zeigt auf den Raum.
     3. Die Zeile ist die KONTO-Insel: user_id gesetzt, token null.
        Das ist der Kern der Entscheidung vom 23.09.2026 — kein
        dritter Datensatz neben Konto und Gerät.
     4. Idempotent: zweiter Aufruf added = 0, keine Dubletten, immer
        nur eine Insel-Zeile je Lehrkraft.
     5. Additiv: kommt eine Station im Raum dazu, kommt sie auch auf
        die Insel — und die alte bleibt liegen.
     6. Die Insel des Kindes bleibt unberührt. Zwei Wege, die sich
        nie treffen (0136): Token-Insel und Konto-Insel.
     7. Ein Raum ohne Stationen ist ok:true mit words:0 — und legt
        KEINE Insel-Zeile an. ⚠️ Dabei gefunden: einen solchen Raum
        muss man HERSTELLEN. `wi_ensure_board` legt einem frischen
        Brett schon Stationen hinein (0131 alle öffentlichen, seit
        0159 die erste) — ein neu angelegter Raum hat also nie null
        Wörter, der Fall entsteht erst durch Abwählen.
     8. Fremde Lehrkraft und unbekannter Code: 'not_found'.
     9. Die Rechte stehen: authenticated ja, anon nein.
    10. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0168_wordisland_trainer_island.mjs  */
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
/* ⚠️ In SCHEMA extensions — siehe 0136/0137. Ein Stub in public
   täuschte Grün vor (feedback_pgcrypto_lives_in_extensions). */
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
const ROOM2  = 'b0000000-0000-4000-8000-000000000002';
const CODE   = 'ABCDEF';
const CODE2  = 'GHJKLM';

await db.exec(`
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}'), ('${FREMD}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum'),
           ('${ROOM2}','${CODE2}','${FREMD}','${SCHOOL}','Raum ohne Woerter');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,6) g;
`);

const setzeSets = async (titel) => {
  const ids = (await db.query(
    `select id from vocab_sets where title = any($1) order by title`, [titel])).rows.map(r => r.id);
  await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
            [CODE, ids, 4, 900, 'de_en', 'type']);
  return ids;
};
const schule = await setzeSets(['Station 1 — Schule']);
ok('Vorbereitung: der Raum hat eine Station', schule.length === 1, JSON.stringify(schule));

/* ══ Stufe 1: die Welt vor 0168 ════════════════════════════════ */
const gibtEs = async () => n((await one(
  `select count(*)::int c from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname='wi_room_solo_claim'`)).c);
ok('vor 0168 gibt es wi_room_solo_claim nicht', await gibtEs() === 0);

/* ── Das Kind holt sich vorher seine GERÄTE-Insel ─────────────
   Abgemeldet, also auth.uid() = null — genau so sitzt ein Kind am
   Klassensatz-Tablet. Diese Insel darf die Lehrkraft später nicht
   berühren (Zusage 6). */
await db.exec(`update _who set uid = null`);
const kind = await one(`select wi_solo_claim($1, $2) v`, ['tok1', null]);
ok('Vorbereitung: das Kind hat eine Geräte-Insel',
   kind.v.ok === true && n(kind.v.added) === 1 && !!kind.v.token, JSON.stringify(kind.v));
const kindToken = kind.v.token;
await db.exec(`update _who set uid = '${T}'`);

/* ══ Stufe 2: 0168 ═════════════════════════════════════════════ */
await run(mig('0168_wordisland_trainer_island.sql'), '0168');
console.log('\n— 0168 läuft durch —\n');
ok('… und danach schon', await gibtEs() === 1);

const claim = (code = CODE) =>
  one(`select wi_room_solo_claim($1) v`, [code]).then(r => r.v);
const inselVon = (uid) => one(
  `select id, token, user_id from wi_solo_learners where user_id = $1`, [uid]);
const setsVon = (learner) => db.query(
  `select s.title, ss.from_room from wi_solo_sets ss join vocab_sets s on s.id = ss.set_id
    where ss.learner_id = $1 order by s.title`, [learner]).then(r => r.rows);

/* ── Der erste Klick auf „Trainer-Insel zeigen" ──────────────── */
const r1 = await claim();
ok('die Lehrkraft bekommt die Station des Raums',
   r1.ok === true && n(r1.added) === 1 && n(r1.words) > 0, JSON.stringify(r1));

const iT = await inselVon(T);
ok('es ist die KONTO-Insel: user_id gesetzt, kein Token',
   !!iT && iT.user_id === T && iT.token === null, JSON.stringify(iT));

const sT = await setsVon(iT.id);
ok('genau die Station des Raums liegt darauf, mit from_room',
   sT.length === 1 && sT[0].title === 'Station 1 — Schule' && sT[0].from_room === ROOM,
   JSON.stringify(sT));

/* ── Noch einmal derselbe Klick ──────────────────────────────── */
const r2 = await claim();
ok('zweiter Aufruf: nichts kommt dazu', r2.ok === true && n(r2.added) === 0, JSON.stringify(r2));
ok('… und die Wortzahl bleibt gleich', n(r2.words) === n(r1.words),
   `${r1.words} → ${r2.words}`);
ok('… und es gibt weiterhin genau eine Insel je Lehrkraft',
   n((await one(`select count(*)::int c from wi_solo_learners where user_id = $1`, [T])).c) === 1);
ok('… und keine doppelte Station',
   (await setsVon(iT.id)).length === 1);

/* ── Die Lehrkraft nimmt eine Station dazu ──────────────────── */
await setzeSets(['Station 1 — Schule', 'Station 2 — Zuhause']);
const r3 = await claim();
const sT3 = await setsVon(iT.id);
ok('eine neue Station im Raum kommt auf die Insel',
   r3.ok === true && n(r3.added) === 1 && sT3.length === 2, JSON.stringify(r3));
/* Additiv heißt: die alte bleibt auch dann liegen, wenn der Raum sie
   irgendwann nicht mehr führt. */
await setzeSets(['Station 3 — Essen']);
const r4 = await claim();
const sT4 = await setsVon(iT.id);
ok('… und keine verschwindet wieder',
   n(r4.added) === 1 && sT4.length === 3, JSON.stringify(sT4.map(x => x.title)));

/* ── Die Insel des Kindes ───────────────────────────────────── */
const kIns = await one(`select id, token, user_id from wi_solo_learners where token = $1`, [kindToken]);
ok('die Geräte-Insel des Kindes gehört weiter dem Gerät',
   !!kIns && kIns.user_id === null, JSON.stringify(kIns));
ok('… und sie hat nur ihre eine Station — die Trainer-Insel ist eine andere',
   (await setsVon(kIns.id)).length === 1 && kIns.id !== iT.id);

/* ── Ein Raum ohne Stationen ──────────────────────────────────
   ⚠️ Den muss man HERSTELLEN: `wi_ensure_board` legt einem frischen
   Brett schon Stationen hinein — in dieser Kette (bis 0158) alle
   öffentlichen, in der echten Datenbank seit 0159 die erste. Ein neu
   angelegter Raum hat also nie null Wörter; der Fall entsteht erst,
   wenn die Lehrkraft alles abwählt. Genau das tut hier wi_room_setup
   mit einer leeren Liste. Geprüft wird darum „vorher > 0", nicht
   eine feste Zahl. */
await db.exec(`update _who set uid = '${FREMD}'`);
// Erst anfassen: das Brett (und mit ihm die Stationen) entsteht beim
// ersten Zugriff der Lehrkraft, nicht beim Anlegen des Raums.
await one(`select wi_owned_room($1) v`, [CODE2]);
const vorher = n((await one(
  `select count(*)::int c from wi_room_sets where room_id = $1`, [ROOM2])).c);
await one(`select wi_room_setup($1, $2, $3, $4, $5, $6) v`,
          [CODE2, [], 4, 900, 'de_en', 'type']);
const nachher = n((await one(
  `select count(*)::int c from wi_room_sets where room_id = $1`, [ROOM2])).c);
ok('ein frischer Raum bringt die öffentlichen Stationen schon mit, abwählen leert ihn',
   vorher > 0 && nachher === 0, `${vorher} → ${nachher}`);

const rLeer = await claim(CODE2);
ok('ein Raum ohne Wörter ist kein Fehler, aber auch keine Insel',
   rLeer.ok === true && n(rLeer.added) === 0 && n(rLeer.words) === 0, JSON.stringify(rLeer));
ok('… und es entsteht dabei KEINE Insel-Zeile',
   n((await one(`select count(*)::int c from wi_solo_learners where user_id = $1`, [FREMD])).c) === 0);

/* ── Fremde Räume, fremde Lehrkräfte ─────────────────────────── */
const rFremd = await claim(CODE);
ok('eine fremde Lehrkraft bekommt die Wörter dieses Raums nicht',
   rFremd.ok === false && rFremd.error === 'not_found', JSON.stringify(rFremd));
await db.exec(`update _who set uid = '${T}'`);
const rWeg = await claim('ZZZZZZ');
ok('einen Raum, den es nicht gibt, gibt es nicht',
   rWeg.ok === false && rWeg.error === 'not_found', JSON.stringify(rWeg));
await db.exec(`update _who set uid = null`);
const rAnon = await claim(CODE);
ok('und ohne Anmeldung gibt es keine Trainer-Insel',
   rAnon.ok === false && rAnon.error === 'not_found', JSON.stringify(rAnon));
await db.exec(`update _who set uid = '${T}'`);

/* ── Rechte ─────────────────────────────────────────────────── */
const recht = async (rolle) => (await one(
  `select has_function_privilege($1, 'wi_room_solo_claim(text)', 'execute') p`, [rolle])).p;
ok('authenticated darf ausführen', await recht('authenticated') === true);
ok('anon nicht', await recht('anon') === false);

/* ── Zweimal einspielen ─────────────────────────────────────── */
await run(mig('0168_wordisland_trainer_island.sql'), '0168 (zweites Mal)');
const r5 = await claim();
ok('die Migration läuft zweimal', r5.ok === true && n(r5.added) === 0, JSON.stringify(r5));

console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
process.exit(fails ? 1 : 0);
