-- ══════════════════════════════════════════════════════════════
-- Migration 0222 — games.password_hash nicht mehr öffentlich lesbar
-- ══════════════════════════════════════════════════════════════
-- 0002 hat `grant select on games to anon, authenticated` gesetzt.
-- Die Policy games_select_public filtert nur ZEILEN (active = true),
-- keine Spalten — damit konnte jeder mit dem öffentlichen anon-Key
-- per /rest/v1/games?select=password_hash die Hashes holen. Die sind
-- ungesalzenes SHA-256 (0004 check_game_password), kurze Passwörter
-- sind damit in Sekunden geknackt. Der View games_public war als
-- Schutz gedacht, ersetzt aber nicht das Recht auf die Tabelle.
--
-- Jetzt: Spaltenrechte statt Tabellenrecht. Alles außer
-- password_hash bleibt lesbar — games_public (security_invoker)
-- funktioniert weiter, und die Prüfung des Passworts läuft wie
-- bisher in check_game_password (security definer, sieht den Hash).
--
-- REGEL: Bekommt games eine neue Spalte, die der Browser lesen soll,
-- gehört sie unten in die Liste. Neue Spalten sind sonst unsichtbar
-- (sicherer Standard).
--
-- Prüfstand: supabase/tests/0222_games_hash_verbergen.mjs
-- ══════════════════════════════════════════════════════════════

revoke select on games from anon, authenticated;

grant select (id, season, folder, title, icon, requires_login, active,
              created_at, cluster_managed, starter_pool)
  on games to anon, authenticated;

-- Die api/-Functions arbeiten mit service_role (0215 nennt games nicht,
-- weil api/ die Tabelle nicht direkt liest). Unverändert.
