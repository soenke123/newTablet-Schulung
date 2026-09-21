-- ══════════════════════════════════════════════════════════════
-- Migration 0164 — SlideEffect (game21) in der games-Tabelle
-- ══════════════════════════════════════════════════════════════
-- Das Schätzspiel am Ende der Season 3. Ohne diese Zeile hängt es an
-- drei Stellen gleichzeitig in der Luft, und jede davon sieht im
-- Browser aus wie ein Netzfehler:
--
--   sync_game_state       → 'game_not_found', der Spielstand käme nie
--                           auf den Server (nur localStorage).
--   set_cluster_game_open → 'game_not_found', die Lehrkraft kann die
--                           Kachel für ihren Kurs nicht freischalten.
--   award_game_bonbons    → kein Tor, aber ohne Freischaltung auch
--                           keine Bonbons.
--
-- password_hash bleibt null: Spiel-Passwörter sind seit der Kurs-
-- Freischaltung (Migration 0070) ersatzlos entfallen. requires_login
-- ist eine Beschreibung, kein Riegel — Season 3 ist ohnehin nur mit
-- Konto erreichbar.
-- ══════════════════════════════════════════════════════════════

insert into games (id, season, folder, title, icon, password_hash, requires_login, active) values
  ('game21', 3, 'S3 Slideeffect', 'SlideEffect', '🎚️', null, true, true)
on conflict (id) do update set
  season         = excluded.season,
  folder         = excluded.folder,
  title          = excluded.title,
  icon           = excluded.icon,
  password_hash  = excluded.password_hash,
  requires_login = excluded.requires_login,
  active         = excluded.active;
