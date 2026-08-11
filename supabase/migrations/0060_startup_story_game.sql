-- ══════════════════════════════════════════════════════════════
-- Migration 0060 — Startup Story (game18) in der games-Tabelle
-- ══════════════════════════════════════════════════════════════
-- Kein Passwort (password_hash null), analog zu game7. Der Zugang
-- wird allein ueber die Season-Sichtbarkeit geregelt: game18 ist
-- Season 3, taucht also nur fuer User mit Season >= 3 auf.
--
-- Stand: nur Kachel, noch keine Progress-/Kreatur-Integration
-- (kein submit_game_result, kein Highscore-Key).
-- ══════════════════════════════════════════════════════════════

insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game18', 3, 'S3 Startup Story', 'Startup Story', '🚀', null, false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
