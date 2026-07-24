-- ══════════════════════════════════════════════════════════════
-- Migration 0057 — Bubble Bounce (game17) in der games-Tabelle
-- ══════════════════════════════════════════════════════════════
-- Ohne diesen Eintrag liefert unlock_game('game17', ...) für ein-
-- geloggte User 'game_not_found', was der Client als 'wrong_password'
-- anzeigt. Der GAME_ACCESS-Hash in GameHub/config.js gilt nur für
-- Gäste (nicht eingeloggte User).
--
-- Passwort: "Just4Fun"
-- SHA-256:  143d9b39f43e4cb468a95238047aa6674d6ef735748170599e9a8a0fc55a0cc7
-- ══════════════════════════════════════════════════════════════

insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game17', 3, 'S3 BubbleBounce', 'Bubble Bounce', '🫧',
   '143d9b39f43e4cb468a95238047aa6674d6ef735748170599e9a8a0fc55a0cc7',
   false, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
