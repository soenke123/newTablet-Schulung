/* Prüfstand für Migration 0186 — Knowledge Stack: Fotos je Frage,
   Quiz vorzeitig beenden, Quiz neu starten.
   Echt gerechnet in pglite, Stubs wie in 0175/0176.
*/
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
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
  for (const f of ['0174_knowledgestack_game.sql', '0175_knowledgestack_flow.sql',
                   '0176_knowledgestack_editor.sql', '0178_knowledgestack_timing_reading.sql',
                   '0186_knowledgestack_photos_abort.sql']) {
    await db.exec(mig(f));
  }
  console.log('— 0174, 0175, 0176, 0178, 0186 eingespielt —\n');

  const u1 = 'e0000000-0000-4000-8000-000000000001';
  const u2 = 'e0000000-0000-4000-8000-000000000002';
  await db.query(`insert into auth.users (id, email) values ($1, 'l1@schule.de'), ($2, 'l2@schule.de')`, [u1, u2]);

  const BILD = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
  const qs = [
    { question_text: 'Was zeigt das Foto?', options: ['Baum', 'Haus', 'Auto', 'Hund'],
      correct_idx: 1, correct_indices: [1], time_limit_sec: 10, explanation: null,
      image: BILD, image_name: 'haus.jpg' },
    { question_text: 'Ohne Foto', options: ['a', 'b', 'c', 'd'],
      correct_idx: 0, correct_indices: [0], time_limit_sec: 10, explanation: null },
    { question_text: 'Dritte', options: ['a', 'b', 'c', 'd'],
      correct_idx: 0, correct_indices: [0], time_limit_sec: 10, explanation: null }
  ];

  const rCode = 'FOTO01';
  const roomId = (await db.query(
    `insert into skill_rooms (code, owner_id, title) values ($1, $2, 'Klasse 7b') returning id`,
    [rCode, u1])).rows[0].id;

  // 1) Speichern mit p_code (so ruft es der Beamer: presenterActions hängt p_code an)
  let catId;
  await asUser(u1, async () => {
    const r = (await db.query(
      `select ks_catalog_save(p_code => $1, p_catalog_id => null, p_title => 'Fotoquiz',
                              p_subject => 'Kunst', p_questions => $2::jsonb) as res`,
      [rCode, JSON.stringify(qs)])).rows[0].res;
    ok('ks_catalog_save mit p_code speichert', r.ok === true && r.count === 3, JSON.stringify(r));
    catId = r.catalog_id;

    const g = (await db.query(`select ks_catalog_get(p_code => $1, p_catalog_id => $2) as res`,
      [rCode, catId])).rows[0].res;
    ok('ks_catalog_get mit p_code liefert das Bild', g.ok && g.questions[0].image === BILD);
    ok('… und den Dateinamen', g.questions[0].image_name === 'haus.jpg');
    ok('Frage ohne Foto: image null', g.questions[1].image === null && g.questions[1].image_name === null);

    const zuGross = JSON.stringify([{ question_text: 'x', options: ['a', 'b'], correct_idx: 0,
      image: 'data:image/jpeg;base64,' + 'A'.repeat(1600000) }]);
    const z = (await db.query(`select ks_catalog_save(null, 'Zu groß', 'Kunst', $1::jsonb) as res`,
      [zuGross])).rows[0].res;
    ok('Zu großes Bild wird abgelehnt (image_too_big)', z.ok === false && z.error === 'image_too_big');
    const keinBild = JSON.stringify([{ question_text: 'x', options: ['a', 'b'], correct_idx: 0,
      image: 'javascript:alert(1)' }]);
    const k = (await db.query(`select ks_catalog_save(null, 'Kein Bild', 'Kunst', $1::jsonb) as res`,
      [keinBild])).rows[0].res;
    ok('Nicht-Bild als image wird abgelehnt', k.ok === false && k.error === 'image_too_big');

    const s = (await db.query(`select ks_room_setup($1, $2) as res`, [rCode, catId])).rows[0].res;
    ok('Raum auf das Fotoquiz eingestellt', s.ok === true);
  });

  await db.query(`insert into skill_participants (room_id, token, seat, name) values
    ($1, 'tA', 1, 'Anna'), ($1, 'tB', 2, 'Ben')`, [roomId]);
  await db.query(`select ks_view('tA')`);
  await db.query(`select ks_view('tB')`);

  // 2) Start → Frage 1 mit Foto
  await asUser(u1, async () => {
    const st = (await db.query(`select ks_step($1, 'lobby') as res`, [rCode])).rows[0].res;
    ok('Quiz gestartet', st.phase === 'question');
    const rg = (await db.query(`select ks_room_get($1) as res`, [rCode])).rows[0].res;
    ok('ks_room_get: has_image = true', rg.question.has_image === true);
    ok('ks_room_get: Bild selbst NICHT in der Ansicht', !JSON.stringify(rg).includes('base64'));
    const im = (await db.query(`select ks_room_image($1) as res`, [rCode])).rows[0].res;
    ok('ks_room_image liefert das Foto', im.ok && im.image === BILD && im.qid === rg.question.qid);
  });
  await asUser(u2, async () => {
    const im = (await db.query(`select ks_room_image($1) as res`, [rCode])).rows[0].res;
    ok('Fremde Lehrkraft bekommt kein Foto', im.ok === false && im.error === 'not_found');
  });

  const tv = (await db.query(`select ks_view('tA') as res`)).rows[0].res;
  ok('Tablet (ks_view): kein Bild, kein has_image',
    !JSON.stringify(tv).includes('base64') && !('has_image' in (tv.question || {})));

  // Antworten (nach der Vorlesezeit): phase_ends_at so verschieben, dass die Vorlesezeit vorbei ist
  await db.query(`update ks_boards set phase_ends_at = now() + interval '8 seconds' where room_id = $1`, [roomId]);
  const a = (await db.query(`select ks_answer('tA', 0, 1::smallint, 0) as res`)).rows[0].res;
  ok('Anna antwortet richtig', a.ok && a.is_correct === true, JSON.stringify(a));

  // 3) Vorzeitig beenden aus der Frage
  await asUser(u1, async () => {
    const f = (await db.query(`select ks_finish($1) as res`, [rCode])).rows[0].res;
    ok('ks_finish: Phase ended', f.ok && f.phase === 'ended');
    const rg = (await db.query(`select ks_room_get($1) as res`, [rCode])).rows[0].res;
    ok('Siegerehrung: Anna vorn mit Punkten',
      rg.phase === 'ended' && rg.leaderboard[0].nickname === 'Anna' && rg.leaderboard[0].score > 0);
    const f2 = (await db.query(`select ks_finish($1) as res`, [rCode])).rows[0].res;
    ok('ks_finish in ended: verpufft (stale)', f2.ok && f2.stale === true);
  });
  const tv2 = (await db.query(`select ks_view('tA') as res`)).rows[0].res;
  ok('Tablet sieht ended', tv2.phase === 'ended');

  // 4) Neustart
  await asUser(u1, async () => {
    const r = (await db.query(`select ks_restart($1) as res`, [rCode])).rows[0].res;
    ok('ks_restart: wieder Frage 1', r.ok && r.phase === 'question' && r.idx === 0, JSON.stringify(r));
    const rg = (await db.query(`select ks_room_get($1) as res`, [rCode])).rows[0].res;
    ok('Neustart: alle Punkte auf 0', rg.players.every(p => p.score === 0));
    ok('Neustart: keine Antworten mehr', rg.answers_total === 0);

    // Neustart mitten in der Auflösung von Frage 2
    await db.query(`select ks_step($1, 'question')`, [rCode]);
    await db.query(`select ks_step($1, 'reveal')`, [rCode]);
    await db.query(`select ks_step($1, 'question')`, [rCode]);
    let b = (await db.query(`select phase, current_q_idx from ks_boards where room_id = $1`, [roomId])).rows[0];
    ok('Vorbereitung: Auflösung von Frage 2', b.phase === 'reveal' && b.current_q_idx === 1);
    const r2 = (await db.query(`select ks_restart($1) as res`, [rCode])).rows[0].res;
    ok('ks_restart aus reveal: Frage 1', r2.ok && r2.phase === 'question' && r2.idx === 0);

    // Beenden aus der Auflösung
    await db.query(`select ks_step($1, 'question')`, [rCode]);
    const f = (await db.query(`select ks_finish($1) as res`, [rCode])).rows[0].res;
    ok('ks_finish aus reveal: ended', f.ok && f.phase === 'ended');
  });

  await asUser(u2, async () => {
    const r = (await db.query(`select ks_restart($1) as res`, [rCode])).rows[0].res;
    ok('Fremde Lehrkraft kann nicht neu starten', r.ok === false);
    const f = (await db.query(`select ks_finish($1) as res`, [rCode])).rows[0].res;
    ok('Fremde Lehrkraft kann nicht beenden', f.ok === false);
  });

  // 5) Löschen mit p_code
  await asUser(u1, async () => {
    const r = (await db.query(`select ks_catalog_delete(p_code => $1, p_catalog_id => $2) as res`,
      [rCode, catId])).rows[0].res;
    ok('ks_catalog_delete mit p_code', r.ok === true);
  });

  await db.exec(mig('0186_knowledgestack_photos_abort.sql'));
  ok('Migration 0186 läuft zweimal fehlerfrei durch (idempotent)', true);

  console.log(`\nFertig: ${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

run().catch(e => {
  console.error('Unerwarteter Fehler:', e);
  process.exit(1);
});
