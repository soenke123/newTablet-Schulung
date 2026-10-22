/* Prüfstand für Migration 0219 — Knowledge Stack „gemeinsam erstellen".
   Echt gerechnet in pglite auf der ganzen Kette 0001…0219.

   Die Kernzusagen:
     1. Entwürfe gibt es nur im Modus „create"; im Quiz-Raum → not_create_mode.
     2. Ein Kind sichert, lädt, listet und löscht nur EIGENE Entwürfe;
        der Inhalt kommt so zurück, wie er gesichert wurde.
     3. Senden legt einen privaten Katalog der Raum-Besitzerin an:
        „<Titel> von <Name>", folder = Raumtitel, mit kind/scale.
        ks_catalogs_list zeigt ihn der Lehrkraft mit `folder`,
        dem Kind nicht.
     4. Erneut senden ersetzt die Fassung bei der Lehrkraft; hat sie sie
        gelöscht, entsteht eine neue.
     5. Kaputte Skala → bad_scale, nichts angelegt.
     6. ks_room_drafts: nur Lehrkräfte des Raums, zählt Entwürfe/Gesendetes.
     7. Raum weg → Entwürfe weg, der gesendete Katalog bleibt.
     8. Die Migration läuft zweimal.

   Aufruf:  node supabase/tests/0219_knowledgestack_gemeinsam_erstellen.mjs */
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
const v = async (sql, params) => (await one(sql, params)).v;
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
console.log('— 0001 … 0219 laufen durch —\n');

const T  = 'e0000000-0000-4000-8000-000000000001';   // Lehrkraft, Besitzerin
const T2 = 'e0000000-0000-4000-8000-000000000002';   // fremde Lehrkraft
const SCHOOL = (await one(`select id from schools limit 1`))?.id
  ?? (await one(`insert into schools (slug, name) values ('mps', 'MPS') returning id`)).id;
for (const [id, n] of [[T, 'lehrer'], [T2, 'fremd']]) {
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  await db.query(`insert into profiles (id, school_id, account_name, display_name)
                  values ($1, $2, $3, $3)`, [id, SCHOOL, n]);
}
const als = async uid => { await db.exec('delete from _who'); if (uid) await db.query('insert into _who values ($1)', [uid]); };
await als(T);

const room = async (code, title, mode) => (await one(
  `insert into skill_rooms (code, tool_id, owner_id, school_id, title, settings)
   values ($1, 'knowledgestack', $2, $3, $4, $5::jsonb) returning id`,
  [code, T, SCHOOL, title, JSON.stringify(mode ? { mode } : {})])).id;
const R  = await room('ERSTEL', '7a Bio', 'create');
const RQ = await room('QVZZEN', '7a Quiz', null);
await db.exec(`insert into skill_participants (room_id, token, seat, name) values
  ('${R}', 'c1', 1, 'Mia'), ('${R}', 'c2', 2, null), ('${RQ}', 'q1', 1, 'Leon')`);

/* ══ 1. Nur im Modus „create" ════════════════════════════════════ */
let r = await v(`select ks_drafts_list('q1') v`);
ok('1  Quiz-Raum: keine Entwürfe', r.ok === false && r.error === 'not_create_mode', JSON.stringify(r));
r = await v(`select ks_draft_save('q1', null, 'x', '{}'::jsonb) v`);
ok('1  Quiz-Raum: nicht sichern', r.ok === false && r.error === 'not_create_mode');
r = await v(`select ks_drafts_list('gibtsnicht') v`);
ok('1  fremder Token', r.ok === false && r.error === 'unknown_token');

/* ══ 2. Sichern, laden, nur eigene ═══════════════════════════════ */
const INHALT = { subject: 'Biologie', questions: [
  { kind: 'mc', question_text: 'Wie viele Beine hat ein Käfer?', options: ['4', '6', '8', '10'],
    correct_idx: 1, correct_indices: [1], time_limit_sec: 20 },
  { kind: 'scale', question_text: 'Wie alt wird eine Schildkröte?', scale: { min: '0', max: '200', target: '', unit: 'Jahre' } }
] };
const s1 = await v(`select ks_draft_save('c1', null, 'Insekten', $1::jsonb) v`, [JSON.stringify(INHALT)]);
ok('2  neuer Entwurf (auch halbfertig)', s1.ok && s1.id, JSON.stringify(s1));
const s2 = await v(`select ks_draft_save('c1', null, 'Zweites', '{"questions":[]}'::jsonb) v`);
ok('2  zweiter Entwurf', s2.ok && s2.id !== s1.id);
let l = await v(`select ks_drafts_list('c1') v`);
ok('2  Liste: zwei, mit Fragenzahl', l.ok && l.drafts.length === 2
   && l.drafts.find(d => d.id === s1.id).count === 2, JSON.stringify(l.drafts));
let g = await v(`select ks_draft_get('c1', $1) v`, [s1.id]);
ok('2  laden: Inhalt wie gesichert', g.ok && g.draft.title === 'Insekten'
   && g.draft.questions[1].scale.unit === 'Jahre' && g.draft.subject === 'Biologie', JSON.stringify(g).slice(0, 200));
ok('2  anderes Kind sieht ihn nicht', (await v(`select ks_draft_get('c2', $1) v`, [s1.id])).error === 'not_found');
ok('2  anderes Kind ändert ihn nicht',
   (await v(`select ks_draft_save('c2', $1, 'weg', '{}'::jsonb) v`, [s1.id])).error === 'not_found');
ok('2  anderes Kind löscht ihn nicht',
   (await v(`select ks_draft_delete('c2', $1) v`, [s1.id])).error === 'not_found');
r = await v(`select ks_draft_save('c1', $1, 'Insekten!', $2::jsonb) v`, [s1.id, JSON.stringify(INHALT)]);
ok('2  ändern', r.ok && (await v(`select ks_draft_get('c1', $1) v`, [s1.id])).draft.title === 'Insekten!');
ok('2  löschen', (await v(`select ks_draft_delete('c1', $1) v`, [s2.id])).ok
   && (await v(`select ks_drafts_list('c1') v`)).drafts.length === 1);
r = await v(`select ks_draft_save('c1', null, 'x', $1::jsonb) v`,
  [JSON.stringify({ questions: [{ image: 'data:image/jpeg;base64,' + 'A'.repeat(8100000) }] })]);
ok('2  zu groß → draft_too_big', r.ok === false && r.error === 'draft_too_big');

/* ══ 3. Senden ═══════════════════════════════════════════════════ */
const QS = [
  { kind: 'mc', question_text: 'Wie viele Beine hat ein Käfer?', options: ['4', '6', '8', '10'],
    correct_idx: 1, correct_indices: [1], time_limit_sec: 20 },
  { kind: 'scale', question_text: 'Wie alt wird eine Schildkröte?', options: [],
    scale: { min: 0, max: 200, target: 120, unit: 'Jahre', step: 1 }, time_limit_sec: 30 },
  { kind: 'tf', question_text: 'Spinnen sind Insekten.', options: ['', ''], correct_idx: 1, correct_indices: [1] }
];
const send = (tok, id, title, qs) => v(`select ks_draft_send($1, $2, $3, 'Biologie', $4::jsonb) v`,
  [tok, id, title, JSON.stringify(qs)]);
// Gesendet wird als Kind — ohne Anmeldung
await als(null);
let sd = await send('c1', s1.id, 'Insekten', QS);
ok('3  senden', sd.ok && sd.count === 3 && sd.replaced === false, JSON.stringify(sd));
const cat = await one(`select * from ks_catalogs where id = $1`, [sd.catalog_id]);
ok('3  gehört der Lehrkraft, privat', cat.owner_id === T && cat.visibility === 'private');
ok('3  Titel „… von Mia"', cat.title === 'Insekten von Mia', cat.title);
ok('3  Ordner = Raumtitel', cat.folder === '7a Bio' && cat.from_room === R);
const qk = (await db.query(`select kind, scale, options from ks_questions where catalog_id = $1 order by sort_order`,
  [sd.catalog_id])).rows;
ok('3  Fragetypen bleiben', qk.map(q => q.kind).join(',') === 'mc,scale,tf'
   && Number(qk[1].scale.target) === 120 && JSON.stringify(qk[2].options) === '["Wahr","Falsch"]',
   JSON.stringify(qk));
l = await v(`select ks_drafts_list('c1') v`);
ok('3  Entwurf: gesendet, nicht geändert', l.drafts[0].sent_at && l.drafts[0].changed === false);

const ohneName = await v(`select ks_draft_save('c2', null, 'Pflanzen', '{}'::jsonb) v`);
sd = await send('c2', ohneName.id, 'Pflanzen', QS.slice(0, 1));
ok('3  ohne Namen: „von Tablet 2"', sd.ok && sd.title === 'Pflanzen von Tablet 2', sd.title);

await als(T);
let kl = await v(`select ks_catalogs_list() v`);
const imKatalog = kl.catalogs.filter(c => c.folder === '7a Bio').map(c => c.title).sort();
ok('3  Lehrkraft: im Katalog mit folder', imKatalog.join('|') === 'Insekten von Mia|Pflanzen von Tablet 2',
   JSON.stringify(imKatalog));
await db.exec(`update skill_rooms set title = '7a Biologie' where id = '${R}'`);
kl = await v(`select ks_catalogs_list() v`);
ok('3  folder folgt dem Raumtitel', kl.catalogs.filter(c => c.folder === '7a Biologie').length === 2);
ok('3  Lehrkraft öffnet es', (await v(`select ks_catalog_get($1) v`, [cat.id])).mine === true);
await als(T2);
kl = await v(`select ks_catalogs_list() v`);
ok('3  fremde Lehrkraft sieht es nicht', !kl.catalogs.some(c => c.id === cat.id));
await als(null);

/* ══ 4. Erneut senden ════════════════════════════════════════════ */
await v(`select ks_draft_save('c1', $1, 'Insekten', '{}'::jsonb) v`, [s1.id]);
l = await v(`select ks_drafts_list('c1') v`);
ok('4  nach dem Senden geändert', l.drafts[0].changed === true);
sd = await send('c1', s1.id, 'Insekten und Spinnen', QS.slice(0, 2));
ok('4  ersetzt die Fassung', sd.ok && sd.replaced === true && sd.catalog_id === cat.id, JSON.stringify(sd));
ok('4  nur noch zwei Fragen, neuer Titel',
   Number((await one(`select count(*) c from ks_questions where catalog_id = $1`, [cat.id])).c) === 2
   && (await one(`select title from ks_catalogs where id = $1`, [cat.id])).title === 'Insekten und Spinnen von Mia');
ok('4  keine Kopie daneben', Number((await one(`select count(*) c from ks_catalogs where from_room = $1`, [R])).c) === 2);
await db.exec(`delete from ks_catalogs where id = '${cat.id}'`);
sd = await send('c1', s1.id, 'Insekten', QS);
ok('4  gelöscht → neu angelegt', sd.ok && sd.replaced === false && sd.catalog_id !== cat.id);

/* ══ 5. Kaputte Skala ════════════════════════════════════════════ */
const vorher = Number((await one(`select count(*) c from ks_catalogs`)).c);
sd = await send('c2', ohneName.id, 'Kaputt',
  [{ kind: 'scale', question_text: 'x', scale: { min: 10, max: 5, target: 7 } }]);
ok('5  bad_scale', sd.ok === false && sd.error === 'bad_scale');
ok('5  nichts angelegt', Number((await one(`select count(*) c from ks_catalogs`)).c) === vorher);
ok('5  ohne Fragen → no_questions', (await send('c2', ohneName.id, 'Leer', [])).error === 'no_questions');
ok('5  ohne Titel → title_required', (await send('c2', ohneName.id, ' ', QS)).error === 'title_required');

/* ══ 6. Überblick der Lehrkraft ══════════════════════════════════ */
ok('6  ohne Anmeldung: not_found', (await v(`select ks_room_drafts('ERSTEL') v`)).error === 'not_found');
await als(T2);
ok('6  fremde Lehrkraft: not_found', (await v(`select ks_room_drafts('ERSTEL') v`)).error === 'not_found');
await db.exec(`insert into skill_room_teachers (room_id, user_id) values ('${R}', '${T2}')`);
ok('6  eingeladene Lehrkraft sieht den Überblick', (await v(`select ks_room_drafts('ERSTEL') v`)).ok === true);
await als(T);
const ov = await v(`select ks_room_drafts('erstel') v`);
const mia = ov.people.find(p => p.name === 'Mia');
ok('6  je Kind: Entwürfe und Gesendetes', mia && mia.drafts === 1 && mia.sent === 1
   && ov.people.find(p => p.name === 'Tablet 2').sent === 1, JSON.stringify(ov.people));
ok('6  Gesendetes', ov.mode === 'create' && ov.sent.length === 2 && ov.sig, JSON.stringify(ov.sent.map(s => s.title)));

/* ══ 7. Raum weg ═════════════════════════════════════════════════ */
await db.exec(`delete from skill_rooms where id = '${R}'`);
ok('7  Entwürfe gehen mit dem Raum', Number((await one(`select count(*) c from ks_drafts`)).c) === 0);
kl = await v(`select ks_catalogs_list() v`);
ok('7  gesendete Quizze bleiben, Ordner = alter Titel',
   kl.catalogs.filter(c => c.folder === '7a Biologie').length === 2,
   JSON.stringify(kl.catalogs.map(c => [c.title, c.folder])));

/* ══ 8. Zweimal ══════════════════════════════════════════════════ */
try {
  await db.exec(mig('0219_knowledgestack_gemeinsam_erstellen.sql'));
  kl = await v(`select ks_catalogs_list() v`);
  ok('8  0219 läuft ein zweites Mal', kl.ok && kl.catalogs.some(c => c.folder));
} catch (e) {
  ok('8  0219 läuft ein zweites Mal', false, e.message);
}

console.log(fails ? `\n${fails} FEHLGESCHLAGEN` : '\nalles grün');
process.exit(fails ? 1 : 0);
