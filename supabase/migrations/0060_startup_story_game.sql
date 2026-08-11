-- ══════════════════════════════════════════════════════════════
-- Migration 0060 — Startup Story (game18) in der games-Tabelle
-- ══════════════════════════════════════════════════════════════
-- Ohne diesen Eintrag liefert unlock_game('game18', ...) für ein-
-- geloggte User 'game_not_found', was der Client als 'wrong_password'
-- anzeigt. Der GAME_ACCESS-Hash in GameHub/config.js gilt nur für
-- Gäste (nicht eingeloggte User).
--
-- Stand: nur Kachel + Passwort-Gate, noch keine Progress-/Kreatur-
-- Integration (kein submit_game_result, kein Highscore-Key).
--
-- Passwort: "social dilemma"
-- SHA-256:  498b3fb17a911158715ec626e8b95b76bf23a2bcbc1fbc7c54853fc4e540da47
-- ══════════════════════════════════════════════════════════════

insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game18', 3, 'S3 Startup Story', 'Startup Story', '🚀',
   '498b3fb17a911158715ec626e8b95b76bf23a2bcbc1fbc7c54853fc4e540da47',
   false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
