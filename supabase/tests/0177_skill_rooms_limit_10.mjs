/* Prüfstand für Migration 0177 — 10 Räume je Skill für Lehrkräfte.
   Echt gerechnet in pglite.
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
  code text unique,
  tool_id text not null,
  owner_id uuid not null,
  school_id uuid not null,
  title text,
  ask_names boolean not null default true,
  is_test boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now() + interval '60 days',
  created_at timestamptz not null default now()
);
create table if not exists _who (uid uuid);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who limit 1 $$;
create or replace function can_teach() returns boolean language sql stable as $$ select true $$;
create or replace function skill_gen_code() returns text language sql as $$ select upper(substr(md5(random()::text), 1, 6)) $$;
create or replace function skill_check_settings(s jsonb, l jsonb) returns text language sql as $$ select null::text $$;
create or replace function skill_touch(r uuid) returns void language sql as $$ update skill_rooms set expires_at = now() + interval '60 days' where id = r $$;
create or replace function skill_room_json(r uuid) returns jsonb language sql as $$ select jsonb_build_object('id', r) $$;

create table if not exists skill_tools (
  id text primary key, title text not null, blurb text, icon text, folder text not null,
  subject text not null default 'Fächerübergreifend',
  multi_room boolean not null default true,
  max_participants int not null default 150, max_rooms int not null default 5,
  limits jsonb not null default '{}'::jsonb, active boolean not null default true,
  sort_order int not null default 100
);
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

async function run() {
  await db.exec(STUBS);

  // Initialisiere Tools wie vor der Migration (KnowledgeStack mit multi_room = false, andere mit max_rooms = 5)
  await db.exec(`
    insert into skill_tools (id, title, blurb, icon, folder, multi_room, max_rooms) values
      ('knowledgestack', 'Knowledge Stack', 'Quiz', '🧠', 'KnowledgeStack', false, 5),
      ('wordcloud', 'Wortwolke', 'Wörter', '☁️', 'WordCloud', true, 5),
      ('wordisland', 'Word Island', 'Vokabeln', '🏝️', 'WordIsland', false, 5)
    on conflict (id) do update set multi_room = excluded.multi_room, max_rooms = excluded.max_rooms;
  `);

  // Lade skill_room_create aus 0086
  const sql0086 = readFileSync(`${REPO}/supabase/migrations/0086_skill_entry_groups.sql`, 'utf8');
  // Extrahiere skill_room_create
  const createStart = sql0086.indexOf('create or replace function skill_room_create(');
  const createEnd = sql0086.indexOf('revoke all on function skill_room_create', createStart);
  await db.exec(sql0086.slice(createStart, createEnd));

  // Erstelle Test-Schule und Lehrer
  const sRes = await db.query('insert into schools (slug) values (\'test-mps\') returning id');
  const schoolId = sRes.rows[0].id;
  const tRes = await db.query('insert into profiles (school_id) values ($1) returning id', [schoolId]);
  const teacherId = tRes.rows[0].id;

  // Vor der Migration: KnowledgeStack lässt nur 1 Raum zu
  await asUser(teacherId, async () => {
    const r1 = (await db.query('select skill_room_create(\'knowledgestack\', \'Quiz 1\') as r')).rows[0].r;
    ok('vor 0177: Raum 1 KnowledgeStack klappt', r1.ok === true);

    const r2 = (await db.query('select skill_room_create(\'knowledgestack\', \'Quiz 2\') as r')).rows[0].r;
    ok('vor 0177: Raum 2 KnowledgeStack blockiert (single_room_only)', r2.ok === false && r2.error === 'single_room_only');
  });

  // Führe Migration 0177 aus
  const mig0177 = readFileSync(`${REPO}/supabase/migrations/0177_skill_rooms_limit_10.sql`, 'utf8');
  await db.exec(mig0177);

  // Prüfe Tabellen-Zustand
  const tools = (await db.query('select id, multi_room, max_rooms from skill_tools')).rows;
  ok('alle Tools haben multi_room = true', tools.every(t => t.multi_room === true));
  ok('alle Tools haben max_rooms = 10', tools.every(t => t.max_rooms === 10));

  // Jetzt mit Migration 0177: Räume 2 bis 10 für KnowledgeStack anlegen
  await asUser(teacherId, async () => {
    for (let i = 2; i <= 10; i++) {
      const res = (await db.query('select skill_room_create(\'knowledgestack\', $1) as r', [`Quiz ${i}`])).rows[0].r;
      ok(`nach 0177: Raum ${i} KnowledgeStack klappt`, res.ok === true);
    }

    // 11. Raum KnowledgeStack muss an die Obergrenze von 10 stoßen
    const r11 = (await db.query('select skill_room_create(\'knowledgestack\', \'Quiz 11\') as r')).rows[0].r;
    ok('nach 0177: Raum 11 stößt an Obergrenze 10', r11.ok === false && r11.error === 'room_limit' && r11.max === 10 && r11.live === 10);

    // Parallel anderes Tool (wordcloud): lässt ebenfalls bis zu 10 Räume zu
    for (let i = 1; i <= 10; i++) {
      const res = (await db.query('select skill_room_create(\'wordcloud\', $1) as r', [`Wolke ${i}`])).rows[0].r;
      if (i === 1 || i === 10) {
        ok(`nach 0177: Raum ${i} WordCloud klappt unabhängig`, res.ok === true);
      }
    }
    const wc11 = (await db.query('select skill_room_create(\'wordcloud\', \'Wolke 11\') as r')).rows[0].r;
    ok('nach 0177: Raum 11 WordCloud stößt ebenfalls an Obergrenze 10', wc11.ok === false && wc11.error === 'room_limit' && wc11.max === 10);
  });

  console.log(`\nErgebnis: ${passed} bestanden, ${failed} fehlgeschlagen.`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test-Lauf abgebrochen:', err);
  process.exit(1);
});
