/* Prüfstand für Migration 0176 — Knowledge Stack Katalog-Editor & Mehrfach-Antworten.
   Echt gerechnet in pglite, Stubs wie in 0175.
*/
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

let passed = 0, failed = 0;
function ok(desc, cond, extra = '') {
  if (cond) {
    passed++;
    console.log('ok    ' + desc + (extra ? '   ' + extra : ''));
  } else {
    failed++;
    console.error('FAIL  ' + desc + (extra ? '   ' + extra : ''));
  }
}

async function asUser(uid, fn) {
  await db.query('delete from _who');
  await db.query('insert into _who values ($1)', [uid]);
  try { return await fn(); }
  finally {
    await db.query('delete from _who');
  }
}

const mig = f => readFileSync(`${REPO}/supabase/migrations/${f}`, 'utf8');

async function run() {
  await db.exec(STUBS);

  // 1) 0174 + 0175 + 0176 anwenden
  await db.exec(mig('0174_knowledgestack_game.sql'));
  await db.exec(mig('0175_knowledgestack_flow.sql'));
  await db.exec(mig('0176_knowledgestack_editor.sql'));
  console.log('— 0174, 0175, 0176 eingespielt —\n');

  // Test-User anlegen
  const u1 = 'e0000000-0000-4000-8000-000000000001';
  const u2 = 'e0000000-0000-4000-8000-000000000002';
  await db.query(`insert into auth.users (id, email) values ($1, 'l1@schule.de'), ($2, 'l2@schule.de')`, [u1, u2]);

  // 2) ks_catalog_save: Neues Quiz anlegen
  let catId;
  await asUser(u1, async () => {
    const qData = [
      {
        question_text: 'Welche dieser Zahlen sind Primzahlen?',
        options: ['2', '4', '7', '9'],
        correct_idx: 0,
        correct_indices: [0, 2], // 2 und 7 sind Primzahlen!
        time_limit_sec: 25,
        explanation: '2 und 7 haben nur 1 und sich selbst als Teiler.'
      },
      {
        question_text: 'Hauptstadt von Frankreich?',
        options: ['Lyon', 'Paris', 'Marseille', 'Nizza'],
        correct_idx: 1,
        correct_indices: [1],
        time_limit_sec: 15,
        explanation: 'Paris an der Seine.'
      }
    ];

    const res = await db.query(
      `select ks_catalog_save(null, 'Mathe & Geo Quiz', 'Mathematik', $1::jsonb) as res`,
      [JSON.stringify(qData)]
    );
    const r = res.rows[0].res;
    ok('ks_catalog_save legt neues Quiz an', r.ok === true && r.count === 2, JSON.stringify(r));
    catId = r.catalog_id;
  });

  // 3) ks_catalog_get: Quiz abrufen
  await asUser(u1, async () => {
    const res = await db.query(`select ks_catalog_get($1) as res`, [catId]);
    const r = res.rows[0].res;
    ok('ks_catalog_get liefert Quiz', r.ok === true && r.title === 'Mathe & Geo Quiz');
    ok('Fach ist Mathematik', r.subject === 'Mathematik');
    ok('2 Fragen geladen', r.questions && r.questions.length === 2);
    ok('Frage 1 hat correct_indices [0, 2]',
      JSON.stringify(r.questions[0].correct_indices) === '[0,2]',
      JSON.stringify(r.questions[0].correct_indices));
  });

  // 4) ks_catalog_save: Quiz aktualisieren
  await asUser(u1, async () => {
    const updatedQs = [
      {
        question_text: 'Neue Einzelfrage?',
        options: ['Ja', 'Nein', 'Vielleicht', 'Nie'],
        correct_idx: 0,
        correct_indices: [0],
        time_limit_sec: 20
      }
    ];
    const res = await db.query(
      `select ks_catalog_save($1, 'Mathe Quiz V2', 'Alles Mögliche', $2::jsonb) as res`,
      [catId, JSON.stringify(updatedQs)]
    );
    const r = res.rows[0].res;
    ok('Update des Quiz erfolgreich', r.ok === true && r.count === 1);

    const getRes = await db.query(`select ks_catalog_get($1) as res`, [catId]);
    const gr = getRes.rows[0].res;
    ok('Titel aktualisiert', gr.title === 'Mathe Quiz V2');
    ok('Fach aktualisiert auf Alles Mögliche', gr.subject === 'Alles Mögliche');
    ok('Alte Fragen wurden ersetzt (jetzt 1)', gr.questions.length === 1);
  });

  // 5) Mehrfach-Antworten im echten Spiel testen
  let multiCatId;
  await asUser(u1, async () => {
    const multiQs = [
      {
        question_text: 'Welche Tiere können fliegen?',
        options: ['Amsel', 'Hund', 'Fledermaus', 'Elefant'],
        correct_idx: 0,
        correct_indices: [0, 2], // Amsel (0) und Fledermaus (2) können fliegen
        time_limit_sec: 20,
        explanation: 'Vögel und Fledertiere können fliegen.'
      }
    ];
    const res = await db.query(
      `select ks_catalog_save(null, 'Tiere Quiz', 'Biologie', $1::jsonb) as res`,
      [JSON.stringify(multiQs)]
    );
    multiCatId = res.rows[0].res.catalog_id;
  });

  // Raum erstellen mit Lehrer 1
  const rCode = 'TEST01';
  const roomId = (await db.query(
    `insert into skill_rooms (code, owner_id, title) values ($1, $2, 'Klasse 7b') returning id`,
    [rCode, u1]
  )).rows[0].id;

  // Raum auf multiCatId einrichten
  await asUser(u1, async () => {
    const s = await db.query(`select ks_room_setup($1, $2) as res`, [rCode, multiCatId]);
    ok('Raum mit Multi-Choice-Katalog eingerichtet', s.rows[0].res.ok === true);
  });

  // 3 Schüler beitreten
  const tok1 = 'tok_schueler_1';
  const tok2 = 'tok_schueler_2';
  const tok3 = 'tok_schueler_3';

  await db.query(`insert into skill_participants (room_id, token, seat, name) values
    ($1, $2, 1, 'Anna'), ($1, $3, 2, 'Ben'), ($1, $4, 3, 'Clara')`,
    [roomId, tok1, tok2, tok3]);

  // Spiel starten (Lobby -> question)
  await asUser(u1, async () => {
    const step = await db.query(`select ks_step($1, 'lobby') as res`, [rCode]);
    ok('Quiz gestartet', step.rows[0].res.phase === 'question');
  });

  // Schüler 1 wählt Option 0 (Amsel) -> RICHTIG
  const ans1 = (await db.query(`select ks_answer($1, 0, 0::smallint, 1000) as res`, [tok1])).rows[0].res;
  ok('Schüler 1 tippt Option 0: is_correct = true', ans1.is_correct === true);

  // Schüler 2 wählt Option 2 (Fledermaus) -> AUCH RICHTIG! (weil in correct_indices [0, 2])
  const ans2 = (await db.query(`select ks_answer($1, 0, 2::smallint, 1000) as res`, [tok2])).rows[0].res;
  ok('Schüler 2 tippt Option 2: is_correct = true (Mehrfach-Haken!)', ans2.is_correct === true);

  // Schüler 3 wählt Option 1 (Hund) -> FALSCH
  const ans3 = (await db.query(`select ks_answer($1, 0, 1::smallint, 1000) as res`, [tok3])).rows[0].res;
  ok('Schüler 3 tippt Option 1: is_correct = false', ans3.is_correct === false);

  // Auflösen (question -> reveal)
  await asUser(u1, async () => {
    await db.query(`select ks_step($1, 'question') as res`, [rCode]);
  });

  // 6) ks_room_get & ks_view in reveal: correct_indices mitgegeben
  await asUser(u1, async () => {
    const rg = (await db.query(`select ks_room_get($1) as res`, [rCode])).rows[0].res;
    ok('ks_room_get liefert correct_indices [0, 2]',
      JSON.stringify(rg.question.correct_indices) === '[0,2]',
      JSON.stringify(rg.question.correct_indices));
  });

  const kv = (await db.query(`select ks_view($1) as res`, [tok1])).rows[0].res;
  ok('ks_view liefert correct_indices [0, 2]',
    JSON.stringify(kv.question.correct_indices) === '[0,2]',
    JSON.stringify(kv.question.correct_indices));

  // 7) Schutz: Fremde Lehrkraft darf fremdes Quiz nicht überschreiben
  await asUser(u2, async () => {
    const res = await db.query(
      `select ks_catalog_save($1, 'Gehackt', 'Alles Mögliche', '[]'::jsonb) as res`,
      [multiCatId]
    );
    ok('Fremde Lehrkraft bekommt not_found beim Speichern', res.rows[0].res.error === 'not_found');
  });

  // 8) ks_catalog_delete: Eigenen Katalog löschen
  await asUser(u1, async () => {
    const delRes = await db.query(`select ks_catalog_delete($1) as res`, [catId]);
    ok('Eigener Katalog erfolgreich gelöscht', delRes.rows[0].res.ok === true);

    const check = await db.query(`select ks_catalog_get($1) as res`, [catId]);
    ok('Gelöschter Katalog ist weg', check.rows[0].res.error === 'not_found');
  });

  // 9) Idempotenz von 0176
  await db.exec(mig('0176_knowledgestack_editor.sql'));
  ok('Migration 0176 läuft zweimal fehlerfrei durch (idempotent)', true);

  console.log(`\nFertig: ${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error('Unerwarteter Fehler:', e);
  process.exit(1);
});
