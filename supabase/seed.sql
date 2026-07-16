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
--         + password_hash aus GameHub/config.js (GAME_ACCESS)
-- ─────────────────────────────────────────────────────────────
-- Season 1
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game7',  1, 'S1 EscapeGame',              'Escape the Rules',       '🔐', null,                                                                 false, true),
  ('game3',  1, 'S1 DateiformatQuiz',         'Daten-Quiz',             '📁', 'c271515d04b978b6d10041e4e754ec6525a40266ec17dafcf8ee4474960ab800', false, true),
  ('game8',  1, 'S1 Projekt_FINAL_v7_NEU',    'Projekt_FINAL_v7_NEU',   '🗂️', 'a3649c0969937aef94e1556fd5d9f3649f5d4966c90bb854a4aca56e32cc9f04', false, true),
  ('game9',  1, 'S1 Fokusflow',               'Fokusflow',              '🎯', '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58', false, true),
  ('game10', 1, 'S1 The Algorithm',           'The Algorithm',          '⚙️', '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58', false, true),
  ('game11', 1, 'S1 10finger Blindschreiben', 'Tip Turbo Kids',         '⌨️', 'dd8265590e8dcbe0be95c93961e8f3e5ed3b877d98b136e1a11e7b6827eba84e', false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Season 2
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game12', 2, 'S2 Quellen Tinder',      'Quellen-Tinder',      '🃏', '1d75fc98b5dc89c3612274e343f3271776c57ccdd8a7022650d38eea7db7cea3', false, true),
  ('game15', 2, 'S2 LLMaster',            'LLMaster',            '💬', '7625ae9cd8c2645149cb2016e7ed931638d49fd51f96b1aef9db7add759c1dd5', false, true),
  ('game14', 2, 'S2 Reinforce Yourself!', 'Reinforce Yourself!', '🤖', '71391cf2eb6d22058056461195b0134a2933352f21faa98ff9992513ac7e8fb4', false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Season 3 — Legi-Trainer (cluster-locked bis Bonbon-Ziel erreicht)
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game16', 3, 'S3 LegiTrainer', 'Legi-Trainer', '🌈', null, false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;

-- Easter-Egg: 1337.html — Login-Pflicht, kein Passwort, kein regulärer Season-Content
insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game1337', 1, '', 'Atari-1337', '📡', null, true, true)
on conflict (id) do update set
  requires_login = excluded.requires_login;
