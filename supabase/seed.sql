-- ══════════════════════════════════════════════════════════════
-- Seed — Startdaten für die Lernwelt
-- ══════════════════════════════════════════════════════════════
-- Idempotent: kann mehrfach ausgeführt werden ohne zu duplizieren.
-- Ausführen NACH 0001_init.sql im SQL-Editor.
-- ══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- Schulen
-- ─────────────────────────────────────────────────────────────
insert into schools (slug, name) values
  ('mps', 'MPS')
on conflict (slug) do nothing;


-- ─────────────────────────────────────────────────────────────
-- Games — gespiegelt aus GameHub/script.js (GAMES_CONFIG)
--         (ohne Passwörter — Spalte password_hash entfällt mit 0224)
-- ─────────────────────────────────────────────────────────────
-- Season 1
insert into games (id, season, folder, title, icon, requires_login, active) values
  ('game7',  1, 'S1 EscapeGame',              'Escape the Rules',       '🔐', false, true),
  ('game3',  1, 'S1 DateiformatQuiz',         'Daten-Quiz',             '📁', false, true),
  ('game8',  1, 'S1 Projekt_FINAL_v7_NEU',    'Projekt_FINAL_v7_NEU',   '🗂️', false, true),
  ('game9',  1, 'S1 Fokusflow',               'Fokusflow',              '🎯', false, true),
  ('game10', 1, 'S1 The Algorithm',           'The Algorithm',          '⚙️', false, true),
  ('game11', 1, 'S1 10finger Blindschreiben', 'Tip Turbo Kids',         '⌨️', false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Season 2
insert into games (id, season, folder, title, icon, requires_login, active) values
  ('game12', 2, 'S2 Quellen Tinder',      'Quellen-Tinder',      '🃏', false, true),
  ('game15', 2, 'S2 LLMaster',            'LLMaster',            '💬', false, true),
  ('game14', 2, 'S2 Reinforce Yourself!', 'Reinforce Yourself!', '🤖', false, true),
  ('game17', 2, 'S2 BubbleBounce',        'Bubble Bounce',        '🫧', false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Season 3
insert into games (id, season, folder, title, icon, requires_login, active) values
  ('game16', 3, 'S3 LegiTrainer',   'Legi-Trainer',  '🌈', false, true),
  ('game18', 3, 'S3 Startup Story', 'Startup Story', '🚀', false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Easter-Egg: 1337.html — Login-Pflicht, kein Passwort, kein regulärer Season-Content.
-- cluster_managed = false (Migration 0072): das Spiel gehört nicht dem
-- Kurs-Schalter. Es erschließt sich über die Atari-Zahlenreihe, nicht
-- über eine Freischaltung durch die Lehrkraft.
insert into games (id, season, folder, title, icon, requires_login, active, cluster_managed) values
  ('game1337', 1, '', 'Atari-1337', '📡', true, true, false)
on conflict (id) do update set
  requires_login  = excluded.requires_login,
  cluster_managed = excluded.cluster_managed;

-- Reinforce Yourself (game14) ist seit Migration 0252 kein Hub-Spiel mehr
-- (jetzt MPSkills-Skill 'reinforce'). Die Zeile bleibt für Altbestände
-- (game_state), gehört aber nicht mehr dem Kurs-Schalter.
update games set cluster_managed = false where id = 'game14';
