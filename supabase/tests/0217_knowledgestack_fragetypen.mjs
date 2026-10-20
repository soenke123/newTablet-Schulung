/* Prüfstand für Migration 0217 — Knowledge Stack: drei neue Fragetypen
   (Wahr/Falsch, Skala, Münzen setzen).
   Echt gerechnet in pglite auf der ganzen Kette 0001…0217.

   Die Kernzusagen:
     1. Speichern/Laden: kind und scale kommen zurück; tf hat genau zwei
        Antworten (leer → Wahr/Falsch); eine kaputte Skala → bad_scale.
     2. Wahr/Falsch läuft über ks_answer wie Auswahl.
     3. Skala: Punkte nach Nähe (genau 1000, ab 30 % der Spanne 0),
        ks_answer auf eine Skalafrage → wrong_kind, Ziel erst in der
        Auflösung sichtbar, scale_values in der Auflösung.
     4. Münzen: umsetzen bis zum Schluss, höchstens 5, Punkte erst nach
        der Frage (score bleibt während der Frage stehen, ks_view
        verrät nichts), danach 200 je richtige Münze, Münzverteilung
        am Beamer erst in der Auflösung; prev_score/delta stimmen.
     5. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0217_knowledgestack_fragetypen.mjs */
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
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
for (const f of readdirSync(`${REPO}/supabase/migrations`).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(mig(f)); }
  catch (e) {
    if (BEKANNT.has(f.slice(0, 4))) continue;
    console.error(`FEHLER in ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log('— 0001 … 0217 laufen durch —\n');

const T = 'e0000000-0000-4000-8000-000000000001';
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
await db.query(`insert into auth.users (id) values ($1)`, [T]);
await db.query(`insert into profiles (id, school_id, account_name, display_name)
                values ($1, $2, 'lehrer', 'Lehrer')`, [T, SCHOOL]);
await db.query('insert into _who values ($1)', [T]);

const CODE = 'KNWSTK';
const R = (await one(`insert into skill_rooms (code, tool_id, owner_id, school_id, title)
                      values ($1, 'knowledgestack', $2, $3, $1) returning id`, [CODE, T, SCHOOL])).id;
await db.exec(`insert into skill_participants (room_id, token, seat, name)
               select '${R}', 'k' || g, g, 'Kind ' || g from generate_series(1, 4) g`);
for (const t of ['k1', 'k2', 'k3', 'k4']) await one(`select ks_view($1) v`, [t]);

/* ══ 1. Speichern / Laden ═══════════════════════════════════════ */
const QS = [
  { kind: 'tf', question_text: 'Die Erde ist rund.', options: ['', ''], correct_idx: 0, time_limit_sec: 10 },
  { kind: 'scale', question_text: 'Wie viele Beine hat eine Spinne?', options: ['x', 'y'],
    scale: { min: 0, max: 20, target: 8, unit: 'Beine' }, time_limit_sec: 10 },
  { kind: 'bet', question_text: 'Hauptstadt von Frankreich?', options: ['Paris', 'Rom', 'Berlin', 'Madrid'],
    correct_idx: 0, correct_indices: [0], time_limit_sec: 10 },
  { question_text: 'Alte Frage ohne kind', options: ['a', 'b', 'c', 'd'], correct_idx: 2, time_limit_sec: 10 }
];
const sv = (await one(`select ks_catalog_save(null, 'Typen', 'Andere', $1::jsonb) v`, [JSON.stringify(QS)])).v;
ok('1  speichern', sv.ok && sv.count === 4, JSON.stringify(sv));
const g = (await one(`select ks_catalog_get($1) v`, [sv.catalog_id])).v;
const kinds = g.questions.map(q => q.kind).join(',');
ok('1  kind kommt zurück', kinds === 'tf,scale,bet,mc', kinds);
ok('1  tf: leer → Wahr/Falsch', JSON.stringify(g.questions[0].options) === '["Wahr","Falsch"]',
   JSON.stringify(g.questions[0].options));
ok('1  scale: min/max/target/unit', g.questions[1].scale && Number(g.questions[1].scale.target) === 8
   && g.questions[1].scale.unit === 'Beine' && g.questions[1].options.length === 0, JSON.stringify(g.questions[1]));
ok('1  mc: scale null', g.questions[3].scale === null);
const bad = (await one(`select ks_catalog_save(null, 'Kaputt', 'Andere', $1::jsonb) v`,
  [JSON.stringify([{ kind: 'scale', question_text: 'x', scale: { min: 10, max: 5, target: 7 } }])])).v;
ok('1  Skala mit Start ≥ Ende → bad_scale', bad.ok === false && bad.error === 'bad_scale', JSON.stringify(bad));
const bad2 = (await one(`select ks_catalog_save(null, 'Kaputt', 'Andere', $1::jsonb) v`,
  [JSON.stringify([{ kind: 'scale', question_text: 'x', scale: { min: 0, max: 5, target: 7 } }])])).v;
ok('1  Ziel außerhalb → bad_scale', bad2.ok === false && bad2.error === 'bad_scale');
ok('1  nichts halb gespeichert', Number((await one(`select count(*) c from ks_catalogs where title = 'Kaputt'`)).c) === 0);

ok('1  Punkte: genau = 1000', (await one(`select ks_scale_points(8, 0, 20, 8) p`)).p === 1000);
ok('1  Punkte: 30 % daneben = 0', (await one(`select ks_scale_points(14, 0, 20, 8) p`)).p === 0);
const p1 = (await one(`select ks_scale_points(9, 0, 20, 8) p`)).p;
const p3 = (await one(`select ks_scale_points(11, 0, 20, 8) p`)).p;
ok('1  Punkte fallen exponentiell', p1 > 500 && p3 < 300 && p3 > 0, `${p1} / ${p3}`);

/* ══ 2. Spielen ══════════════════════════════════════════════════ */
await one(`select ks_room_setup($1, $2) v`, [CODE, sv.catalog_id]);
const aufdecken = async () => db.exec(
  `update ks_boards set phase_ends_at = now() + 8 * interval '1 second' where room_id = '${R}'`);
const step = async (from) => (await one(`select ks_step($1, $2) v`, [CODE, from])).v;
const view = async (t) => (await one(`select ks_view($1) v`, [t])).v;
const room = async () => (await one(`select ks_room_get($1) v`, [CODE])).v;
const score = async (t) => (await one(`select p.score from ks_players p join skill_participants sp
                                       on sp.id = p.participant_id where sp.token = $1`, [t])).score;

// Frage 1: Wahr/Falsch
let st = await step('lobby');
ok('2  Quiz läuft (tf)', st.ok && st.phase === 'question');
await aufdecken();
let v = await view('k1');
ok('2  tf: kind am Tablet', v.question.kind === 'tf' && v.question.options.length === 2);
let a = (await one(`select ks_answer('k1', 0, 0::smallint, 500) v`)).v;
ok('2  tf: ks_answer richtig', a.ok && a.is_correct === true && a.points_earned > 1000, JSON.stringify(a));
a = (await one(`select ks_answer('k2', 0, 1::smallint, 500) v`)).v;
ok('2  tf: ks_answer falsch', a.ok && a.is_correct === false);
a = (await one(`select ks_answer('k3', 0, 2::smallint, 500) v`)).v;
ok('2  tf: dritte Antwort gibt es nicht', a.ok === false && a.error === 'invalid_input');
await step('question'); await step('reveal');

// Frage 2: Skala
await aufdecken();
let rg = await room();
ok('3  scale: Beamer kennt den Typ, aber nicht das Ziel',
   rg.question.kind === 'scale' && rg.question.scale && rg.question.scale.target === undefined
   && Number(rg.question.scale.max) === 20, JSON.stringify(rg.question.scale));
v = await view('k1');
ok('3  scale: Tablet kennt das Ziel nicht', v.question.scale && v.question.scale.target === undefined);
a = (await one(`select ks_answer('k1', 1, 0::smallint, 0) v`)).v;
ok('3  ks_answer auf Skala → wrong_kind', a.ok === false && a.error === 'wrong_kind', JSON.stringify(a));
const s1 = await score('k1');
a = (await one(`select ks_answer_scale('k1', 1, 8) v`)).v;
ok('3  genau getroffen', a.ok && (await score('k1')) - s1 === 1000, JSON.stringify(a));
a = (await one(`select ks_answer_scale('k1', 1, 9) v`)).v;
ok('3  nur einmal', a.ok === false && a.error === 'already_answered');
const s2 = await score('k2');
a = (await one(`select ks_answer_scale('k2', 1, 99) v`)).v;
ok('3  Wert wird geklemmt, weit weg = 0', a.ok && Number(a.value) === 20 && (await score('k2')) === s2, JSON.stringify(a));
await one(`select ks_answer_scale('k3', 1, 10) v`);
await step('question');
rg = await room();
ok('3  Auflösung: Ziel sichtbar', Number(rg.question.scale.target) === 8);
ok('3  Auflösung: alle Werte', JSON.stringify(rg.scale_values.map(Number)) === '[8,10,20]', JSON.stringify(rg.scale_values));
v = await view('k1');
ok('3  Tablet: eigener Wert und Punkte', Number(v.my_answer.value) === 8 && v.my_answer.points_awarded === 1000
   && v.my_answer.is_correct === true, JSON.stringify(v.my_answer));
v = await view('k2');
ok('3  Tablet: zu weit weg = nicht richtig', v.my_answer.is_correct === false);
await step('reveal');

// Frage 3: Münzen
await aufdecken();
const vor1 = await score('k1'), vor2 = await score('k2');
const bet = async (t, arr) => (await one(`select ks_bet($1, 2, $2::jsonb) v`, [t, JSON.stringify(arr)])).v;
a = (await one(`select ks_answer('k1', 2, 0::smallint, 0) v`)).v;
ok('4  ks_answer auf Münzfrage → wrong_kind', a.ok === false && a.error === 'wrong_kind');
a = await bet('k1', [0, 5, 0, 0]);
ok('4  setzen', a.ok && a.coins === 5 && !('points' in a) && !('is_correct' in a), JSON.stringify(a));
a = await bet('k1', [3, 1, 1, 0]);
ok('4  umsetzen', a.ok && a.coins === 5);
a = await bet('k1', [3, 3, 0, 0]);
ok('4  mehr als 5 → invalid_input', a.ok === false && a.error === 'invalid_input');
a = await bet('k1', [-1, 0, 0, 0]);
ok('4  negativ → invalid_input', a.ok === false && a.error === 'invalid_input');
a = await bet('k1', [1, 1, 1, 1, 1]);
ok('4  mehr Felder als Antworten → invalid_input', a.ok === false && a.error === 'invalid_input');
await bet('k2', [0, 2, 2, 0]);
await bet('k3', [5]);
await bet('k3', [0, 0, 0, 0]);
ok('4  alle zurück = keine Antwort',
   Number((await one(`select count(*) c from ks_answers where room_id = $1 and question_idx = 2`, [R])).c) === 2);
ok('4  Punkte noch nicht gebucht', (await score('k1')) === vor1);
v = await view('k1');
ok('4  Tablet: eigene Münzen da, aber kein richtig/falsch',
   JSON.stringify(v.my_answer.bets) === '[3,1,1,0]' && v.my_answer.is_correct === null
   && v.my_answer.points_awarded === null, JSON.stringify(v.my_answer));
ok('4  Tablet: Punktestand unverändert', v.me.score === vor1);
rg = await room();
ok('4  Beamer: Münzverteilung während der Frage geheim', JSON.stringify(rg.answers_dist) === '{}'
   && rg.answers_total === 2, JSON.stringify(rg.answers_dist));
await step('question');
rg = await room();
ok('4  Auflösung: Münzen je Antwort', rg.answers_dist['0'] === 3 && rg.answers_dist['1'] === 3
   && rg.answers_dist['2'] === 3 && rg.bet_coins === 9, JSON.stringify(rg.answers_dist));
ok('4  gebucht: 3 richtige Münzen = 600', (await score('k1')) - vor1 === 600, String((await score('k1')) - vor1));
ok('4  gebucht: keine richtige = 0', (await score('k2')) === vor2);
v = await view('k1');
ok('4  Tablet: jetzt mit Punkten', v.my_answer.points_awarded === 600 && v.my_answer.is_correct === true);
ok('4  delta zeigt die Münzpunkte', v.me.delta === 600, String(v.me.delta));
await room(); await view('k1');
ok('4  nicht doppelt gebucht', (await score('k1')) - vor1 === 600);
a = await bet('k1', [5, 0, 0, 0]);
ok('4  nach der Frage kein Umsetzen', a.ok === false && a.error === 'not_active');

// Münzen, die erst über die Uhr (ks_ensure_board) geschlossen werden
await step('reveal');
await aufdecken();
await one(`select ks_answer('k1', 3, 2::smallint, 0) v`);
await step('question');
const fin = await step('reveal');
ok('4  Ende erreicht', fin.ok && fin.phase === 'ended');

/* ══ 5. Zweimal ══════════════════════════════════════════════════ */
try {
  await db.exec(mig('0217_knowledgestack_fragetypen.sql'));
  const g2 = (await one(`select ks_catalog_get($1) v`, [sv.catalog_id])).v;
  ok('5  0217 läuft ein zweites Mal', g2.ok && g2.questions[1].kind === 'scale'
     && (await one(`select ks_view('k1') v`)).v.ok === true && (await room()).ok === true);
} catch (e) {
  ok('5  0217 läuft ein zweites Mal', false, e.message);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
