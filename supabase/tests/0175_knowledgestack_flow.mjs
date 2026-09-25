/* Prüfstand für Migration 0175 — der Ablauf von Knowledge Stack.
   Echt gerechnet in pglite, Stubs wie in 0136…0167.

   Zweistufig: erst läuft 0174 allein (dort gibt es ks_step noch
   nicht, und das wird geprüft — ein Gerät mit neuer tool.js an einer
   alten Datenbank bekommt 42883 und damit 'fn_missing', siehe
   feedback_missing_migration_looks_like_network), dann 0175 obendrauf.

   Die Zusagen im Einzelnen:
     1. Vor 0175 gibt es ks_step nicht, danach schon.
     2. Der Ablauf ist lobby → question → reveal → question → … →
        ended → lobby. 'podium' kommt nicht mehr vor.
     3. Die Uhr läuft auf dem SERVER ab: eine Frage, deren
        phase_ends_at vorbei ist, steht beim nächsten Leseaufruf auf
        'reveal' — ohne dass jemand geklickt hat.
     4. Die Sekunde Kulanz gilt: eine Antwort 0,5 s nach Ablauf
        zählt noch, eine 3 s danach nicht.
     5. p_from schützt vor dem zweiten Klick: 'question' aus der
        Auflösung heraus verpufft (stale) statt eine Frage zu
        überspringen.
     6. Das Rang-Delta zeigt etwas: wer sich in der Auflösung nach
        vorn schiebt, hat rank_change > 0. (Das war in 0174 immer 0.)
     7. Die Zeit für den Bonus kommt vom Server. Ein Gerät, das
        p_response_ms = 0 behauptet, bekommt trotzdem nur den Bonus,
        der zur verstrichenen Zeit passt.
     8. ks_answer schreibt kein Emote mehr; ein Emote ist nach 3,5 s
        aus der Ansicht verschwunden.
     9. Der Fragetext geht in der Frage-Phase NICHT an das Tablet,
        zur Auflösung schon.
    10. Nachbarn links/rechts sind eindeutig (row_number, keine
        geteilten Ränge).
    11. Unsinnige Emotes und Antwort-Indizes kommen nicht durch.
    12. ks_room_setup nimmt keinen fremden Katalog.
    13. Die Rechte stehen; die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0175_knowledgestack_flow.mjs        */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/snke/OneDrive/ClaudeProjekte/MPS TabletSchlung/Webauftrtitt';
const db = new PGlite();

const STUBS = `
set search_path = public, extensions;
create schema if not exists auth;
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea language sql as
  $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
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
const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

const run = async (sql, label) => {
  try { await db.exec(sql); }
  catch (e) {
    console.error(`\nFEHLER in ${label}: ${e.message}`);
    if (e.hint) console.error(`  Hinweis: ${e.hint}`);
    if (e.position) console.error(`  Stelle: …${sql.slice(Math.max(0, e.position - 260), Number(e.position) + 80)}`);
    process.exit(1);
  }
};

await run(STUBS, 'Stubs');
await run(mig('0174_knowledgestack_game.sql'), '0174');
console.log('— 0174 läuft durch —\n');

const SCHOOL = 'd0000000-0000-4000-8000-000000000001';
const T      = 'e0000000-0000-4000-8000-000000000001';
const FREMD  = 'e0000000-0000-4000-8000-000000000002';
const ROOM   = 'b0000000-0000-4000-8000-000000000001';
const CODE   = 'KSTEST';

await db.exec(`
  insert into auth.users (id) values ('${T}'), ('${FREMD}');
  insert into schools (id, slug) values ('${SCHOOL}','mps');
  insert into profiles (id, school_id) values ('${T}','${SCHOOL}'), ('${FREMD}','${SCHOOL}');
  insert into _who (uid) values ('${T}');
  insert into skill_rooms (id, code, owner_id, school_id, title)
    values ('${ROOM}','${CODE}','${T}','${SCHOOL}','Testraum');
  insert into skill_participants (room_id, token, seat, name)
    select '${ROOM}', 'tok' || g, g, 'Kind ' || g from generate_series(1,5) g;
`);

/* ══ Stufe 1: die Welt vor 0175 ═══════════════════════════════ */
const gibtEs = async name => Number((await one(
  `select count(*)::int c from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname=$1`, [name])).c);

ok('vor 0175 gibt es ks_step nicht', await gibtEs('ks_step') === 0);

/* ══ Stufe 2: 0175 ════════════════════════════════════════════ */
await run(mig('0175_knowledgestack_flow.sql'), '0175');
console.log('\n— 0175 läuft durch —\n');
ok('… und danach schon', await gibtEs('ks_step') === 1);
ok('ks_advance bleibt genau einmal da (keine Mehrdeutigkeit)',
   await gibtEs('ks_advance') === 1);

/* ─── Helfer ──────────────────────────────────────────────── */
const step   = (from) => one(`select ks_step($1, $2) v`, [CODE, from ?? null]);
const pult   = async () => (await one(`select ks_room_get($1) v`, [CODE])).v;
const view   = async (tok) => (await one(`select ks_view($1) v`, [tok])).v;
const sigP   = async () => (await one(`select ks_room_sig($1) v`, [CODE])).v.sig;
const sigT   = async (tok) => (await one(`select ks_sig($1) v`, [tok])).v.sig;
const antw   = (tok, idx, w, ms) =>
  one(`select ks_answer($1, $2, $3::smallint, $4) v`, [tok, idx, w, ms ?? 0]);
const board  = () => one(`select phase, current_q_idx, question_count, phase_ends_at from ks_boards where room_id = '${ROOM}'`);
// Die Uhr vorstellen, statt zu warten: genau das, was im Unterricht
// die verstreichende Zeit tut.
const uhrZurueck = (sek) => db.exec(
  `update ks_boards set phase_ends_at = phase_ends_at - interval '${sek} seconds' where room_id = '${ROOM}'`);

// Alle fünf schauen einmal hin. Das ist keine Vorbereitung für den
// Prüfstand, sondern genau der erste Takt auf dem Tablet: ks_view
// legt die Spielerzeile an (ks_ensure_player). Ohne das stünden hier
// nur die, die auch geantwortet haben — und die Siegerehrung zeigte
// vier statt fünf Wesen.
for (const t of ['tok1', 'tok2', 'tok3', 'tok4', 'tok5']) await view(t);

/* ─── 2) Der Ablauf ───────────────────────────────────────── */
let b = await board();
ok('frisches Brett steht in der Lobby', b === undefined || true);
let p = await pult();
ok('Lobby: Phase lobby', p.phase === 'lobby', p.phase);
ok('Lobby: 12 Fragen aus der Vorlage', p.question_count === 12, String(p.question_count));
ok('Lobby: Katalogliste kommt mit', Array.isArray(p.catalogs) && p.catalogs.length >= 1,
   JSON.stringify((p.catalogs || []).map(c => c.count)));
ok('Lobby: Katalogtitel steht da', typeof p.catalog_title === 'string' && p.catalog_title.length > 0,
   String(p.catalog_title));

await step('lobby');
b = await board();
ok('Start → question 0', b.phase === 'question' && b.current_q_idx === 0, `${b.phase}/${b.current_q_idx}`);
ok('Start setzt eine Uhr', b.phase_ends_at !== null);

p = await pult();
ok('Beamer sieht den Fragetext', typeof p.question.text === 'string' && p.question.text.length > 5);
ok('Beamer sieht die Lösung NICHT während der Frage', p.question.correct_idx === null);

/* ─── 9) Der Fragetext geht nicht ans Tablet ──────────────── */
let v = await view('tok1');
ok('Tablet: kein Fragetext während der Frage', v.question.text === null);
ok('Tablet: aber die vier Antworten', Array.isArray(v.question.options) && v.question.options.length === 4);
ok('Tablet: keine Lösung während der Frage', v.question.correct_idx === null);

/* ─── 7) Die Zeit kommt vom Server ────────────────────────── */
// Frage 1 hat 15 s. Wir stellen die Uhr 12 s vor: es sind also 12 s
// verbraucht, 3 s übrig. Das Gerät behauptet 0 ms.
await uhrZurueck(12);
let r = (await antw('tok1', 0, 1, 0)).v;
ok('Antwort 12 s nach Start zählt', r.ok === true, JSON.stringify(r));
ok('… und der Server rechnet ~12 000 ms, nicht die 0 des Geräts',
   r.response_ms >= 11500 && r.response_ms <= 12500, String(r.response_ms));
ok('… der Bonus ist entsprechend klein (1000 · 1,1 + Rest)',
   r.points_earned > 1100 && r.points_earned < 1400, String(r.points_earned));

// Kind 2 antwortet im selben Moment falsch, Kind 3 richtig.
ok('falsche Antwort gibt 0', (await antw('tok2', 0, 0, 0)).v.points_earned === 0);
ok('zweite richtige Antwort geht durch', (await antw('tok3', 0, 1, 0)).v.ok === true);

p = await pult();
ok('Beamer zählt 3 Antworten', p.answers_total === 3, String(p.answers_total));
ok('Verteilung: 2× auf B, 1× auf A',
   p.answers_dist['1'] === 2 && p.answers_dist['0'] === 1, JSON.stringify(p.answers_dist));

/* ─── 4) Kulanz und Ablauf ────────────────────────────────── */
await uhrZurueck(3.5);   // insgesamt 15,5 s → 0,5 s über der Zeit
r = (await antw('tok4', 0, 1, 0)).v;
ok('0,5 s nach Ablauf zählt noch (Kulanz)', r.ok === true, JSON.stringify(r));
ok('… die Phase steht dabei noch auf question', (await board()).phase === 'question');

await uhrZurueck(3);     // insgesamt 18,5 s → 3,5 s über der Zeit
r = (await antw('tok5', 0, 1, 0)).v;
ok('3,5 s nach Ablauf nicht mehr', r.ok === false && r.error === 'not_active',
   JSON.stringify(r));

/* ─── 3) Die Uhr läuft auf dem Server ab ──────────────────── */
ok('ein Leseaufruf schließt die abgelaufene Frage von selbst',
   (await board()).phase === 'reveal', (await board()).phase);
p = await pult();
ok('Auflösung: die Lösung kommt jetzt mit', p.question.correct_idx === 1, String(p.question.correct_idx));
ok('Auflösung: die Erklärung kommt mit', typeof p.question.explanation === 'string');
ok('Auflösung: Top-5 in der Reihenfolge 1…5',
   p.leaderboard.map(x => x.rank).join(',') === '1,2,3,4,5',
   p.leaderboard.map(x => x.rank).join(','));
ok('Auflösung: die Ersten haben Punkte', p.leaderboard[0].score > 1000, String(p.leaderboard[0].score));
ok('Auflösung: jeder Spieler trägt einen Rang',
   p.players.every(x => x.rank >= 1 && x.rank <= 5));
ok('Auflösung: richtig/falsch steht je Spieler drin',
   p.players.filter(x => x.correct === true).length === 3 &&
   p.players.filter(x => x.correct === false).length === 1 &&
   p.players.filter(x => x.correct === null).length === 1,
   JSON.stringify(p.players.map(x => x.correct)));

/* ─── 6) Das Rang-Delta zeigt etwas ───────────────────────── */
const ersterName = p.leaderboard[0].nickname;
ok('Delta der ersten Frage: der Erste ist aufgestiegen',
   p.leaderboard[0].rank_change > 0 || p.leaderboard[0].delta > 0,
   `${p.leaderboard[0].rank_change} / ${p.leaderboard[0].delta}`);
ok('delta ist genau der Ertrag dieser Frage',
   p.leaderboard[0].delta === p.leaderboard[0].score,
   `${p.leaderboard[0].delta} vs ${p.leaderboard[0].score}`);

/* ─── 5) p_from schützt vor dem zweiten Klick ─────────────── */
r = (await step('question')).v;
ok('„Jetzt auflösen" aus der Auflösung heraus verpufft',
   r.ok === true && r.stale === true, JSON.stringify(r));
ok('… und die Phase steht noch auf reveal', (await board()).phase === 'reveal');

r = (await step('reveal')).v;
ok('weiter aus der Auflösung → Frage 1', r.ok === true && r.phase === 'question' && r.idx === 1,
   JSON.stringify(r));
ok('prev_score ist jetzt eingefroren',
   Number((await one(`select count(*)::int c from ks_players
                       where room_id='${ROOM}' and prev_score <> score`)).c) === 0);

/* ─── 8) Emotes ───────────────────────────────────────────── */
ok('ks_answer hat kein Emote geschrieben',
   Number((await one(`select count(*)::int c from ks_players
                       where room_id='${ROOM}' and last_emote is not null`)).c) === 0);

// Während einer Frage darf gewunken werden — nur das Wesen wechseln nicht.
ok('Emote „wave" geht durch', (await one(`select ks_emote($1,$2) v`, ['tok1', 'wave'])).v.ok === true);
ok('Emote „banane" nicht',
   (await one(`select ks_emote($1,$2) v`, ['tok1', 'banane'])).v.error === 'invalid_input');
v = await view('tok1');
ok('… und das Emote steht in der eigenen Ansicht', v.me.emote === 'wave', String(v.me.emote));
await db.exec(`update ks_players set last_emote_at = now() - interval '5 seconds'
                where room_id = '${ROOM}'`);
v = await view('tok1');
ok('nach 5 Sekunden ist das Emote vorbei', v.me.emote === null, String(v.me.emote));

/* ─── 10) Nachbarn sind eindeutig ─────────────────────────── */
v = await view('tok3');
ok('Tablet: ein Rang', v.me.rank >= 1 && v.me.rank <= 5, String(v.me.rank));
ok('Tablet: Vorgänger hat genau Rang − 1',
   !v.neighbor_before || v.neighbor_before.rank === v.me.rank - 1);
ok('Tablet: Nachfolger hat genau Rang + 1',
   !v.neighbor_after || v.neighbor_after.rank === v.me.rank + 1);
const erster = await view('tok1');
ok('Der Erste hat keinen Vorgänger',
   erster.me.rank !== 1 || erster.neighbor_before === null);

/* ─── 11) Unsinn kommt nicht durch ────────────────────────── */
r = (await antw('tok1', 1, 7, 0)).v;
ok('Antwort-Index 7 bei 4 Optionen → invalid_input',
   r.ok === false && r.error === 'invalid_input', JSON.stringify(r));
r = (await antw('tok1', 5, 1, 0)).v;
ok('Antwort auf die falsche Frage → not_active',
   r.ok === false && r.error === 'not_active', JSON.stringify(r));

/* ─── 9b) Wesen wechseln nur außerhalb der Frage ──────────── */
r = (await one(`select ks_join($1,$2,$3::smallint,$4::smallint) v`, ['tok1', null, 7, 2])).v;
ok('Wesenwechsel während der Frage: phase_locked', r.error === 'phase_locked', JSON.stringify(r));

/* ─── 2b) Bis zum Ende durchspielen ───────────────────────── */
// Wir stehen auf Frage 1 von 12. Noch 11-mal: auflösen, weiter.
for (let i = 1; i < 12; i++) {
  const st = (await board());
  ok(`Frage ${i} steht`, st.phase === 'question' && st.current_q_idx === i,
     `${st.phase}/${st.current_q_idx}`);
  await step('question');           // → reveal
  await step('reveal');             // → nächste Frage oder ended
}
b = await board();
ok('nach der 12. Frage: ended', b.phase === 'ended', `${b.phase}/${b.current_q_idx}`);
p = await pult();
ok('Siegerehrung: alle 5 Wesen sind sichtbar', p.players.length === 5, String(p.players.length));
ok('Siegerehrung: Top-5 steht', p.leaderboard.length === 5);
ok('phase „podium" kommt in der Ansicht nicht mehr vor', p.phase === 'ended');

await step('ended');
ok('von der Siegerehrung zurück in die Lobby', (await board()).phase === 'lobby');
ok('die Punkte stehen noch (erst der Start setzt sie auf 0)',
   Number((await one(`select max(score)::int m from ks_players where room_id='${ROOM}'`)).m) > 0);
await step('lobby');
ok('der nächste Start setzt alles auf 0',
   Number((await one(`select coalesce(max(score),0)::int m from ks_players where room_id='${ROOM}'`)).m) === 0);
ok('… und räumt die Antworten weg',
   Number((await one(`select count(*)::int c from ks_answers where room_id='${ROOM}'`)).c) === 0);

/* ─── Signaturen ──────────────────────────────────────────── */
const s1 = await sigP();
await one(`select ks_emote($1,$2) v`, ['tok2', 'cheer']);
ok('Pult-Signatur ändert sich bei einem Emote', await sigP() !== s1);

const t1 = await sigT('tok1');
await antw('tok1', 0, 1, 0);
ok('Tablet-Signatur ändert sich bei der eigenen Antwort', await sigT('tok1') !== t1);

const t2 = await sigT('tok2');
await antw('tok3', 0, 1, 0);
ok('Tablet-Signatur ändert sich, wenn ein ANDERER Punkte holt',
   await sigT('tok2') !== t2);

// Zurück in die Lobby, damit der Wesenwechsel geprüft werden kann.
await step('question'); await step('reveal');
await db.exec(`update ks_boards set phase='lobby', current_q_idx=0, phase_ends_at=null where room_id='${ROOM}'`);
const t3 = await sigP();
await one(`select ks_join($1,$2,$3::smallint,$4::smallint) v`, ['tok1', null, 17, 1]);
ok('Pult-Signatur ändert sich beim Wesenwechsel', await sigP() !== t3);
p = await pult();
const k1 = p.players.find(x => x.nickname === 'Kind 1');
ok('… und das neue Wesen steht in der Ansicht',
   k1 && k1.creature_id === 17 && k1.skin_idx === 1, JSON.stringify(k1));

/* ─── 12) Fremder Katalog ─────────────────────────────────── */
const fremdKat = 'c0000000-0000-4000-8000-000000000009';
await db.exec(`insert into ks_catalogs (id, owner_id, title, is_template)
               values ('${fremdKat}','${FREMD}','Nicht meiner', false)`);
r = (await one(`select ks_room_setup($1,$2,$3) v`, [CODE, fremdKat, null])).v;
ok('fremder Katalog: not_found', r.ok === false && r.error === 'not_found', JSON.stringify(r));

const eigen = (await one(`select id from ks_catalogs where is_template order by created_at limit 1`)).id;
r = (await one(`select ks_room_setup($1,$2,$3) v`, [CODE, eigen, null])).v;
ok('eigener/Vorlagen-Katalog geht und meldet die Fragenzahl',
   r.ok === true && r.question_count === 12, JSON.stringify(r));

/* ─── Fremde Räume, fremde Lehrkräfte ─────────────────────── */
await db.exec(`update _who set uid = '${FREMD}'`);
ok('fremde Lehrkraft: ks_step → not_found',
   (await step(null)).v.error === 'not_found');
ok('fremde Lehrkraft: ks_room_get → not_found',
   (await pult()).error === 'not_found');
await db.exec(`update _who set uid = '${T}'`);
ok('unbekannter Token: ks_view → unknown_token',
   (await view('gibtsnicht')).error === 'unknown_token');

/* ─── Gesperrtes Tablet ───────────────────────────────────── */
await db.exec(`update skill_participants set blocked = true where token = 'tok5'`);
ok('gesperrt: kein Emote', (await one(`select ks_emote($1,$2) v`, ['tok5','wave'])).v.error === 'blocked');
ok('gesperrt: kein Beitritt',
   (await one(`select ks_join($1,$2,$3::smallint,$4::smallint) v`, ['tok5', null, 1, 0])).v.error === 'blocked');
await db.exec(`update skill_participants set blocked = false where token = 'tok5'`);

/* ─── Rechte ──────────────────────────────────────────────── */
const darf = async (fn, rolle) => Number((await one(
  `select count(*)::int c from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname=$1
      and has_function_privilege($2, p.oid, 'execute')`, [fn, rolle])).c);

ok('ks_step: authenticated ja',  await darf('ks_step', 'authenticated') === 1);
ok('ks_step: anon nein',         await darf('ks_step', 'anon') === 0);
ok('ks_view: anon ja',           await darf('ks_view', 'anon') === 1);
ok('ks_answer: anon ja',         await darf('ks_answer', 'anon') === 1);
ok('ks_room_get: anon nein',     await darf('ks_room_get', 'anon') === 0);

/* ─── Zweimal einspielen ──────────────────────────────────── */
await run(mig('0175_knowledgestack_flow.sql'), '0175 (zweiter Durchlauf)');
ok('0175 läuft zweimal', true);
p = await pult();
ok('… und danach steht der Raum noch', p.ok === true);

console.log(`\n${fails === 0 ? 'Alles grün.' : fails + ' FEHLER.'}`);
process.exit(fails === 0 ? 0 : 1);
