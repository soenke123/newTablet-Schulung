-- ══════════════════════════════════════════════════════════════
-- Migration 0224 — Spiel-Passwörter ganz entfernen
-- ══════════════════════════════════════════════════════════════
-- Seit 0070 schaltet die Lehrkraft Spiele per Kurs-Schalter frei
-- (cluster_unlocked_games). games.password_hash und unlock_game
-- (0004) wurden nicht mehr aufgerufen, standen aber noch:
--   - unlock_game durfte jeder Eingeloggte aufrufen. Mit einem
--     Hash in der Spalte ließ sich ein Spiel damit an der Kurs-
--     Freischaltung vorbei öffnen.
--   - seed.sql trug ungesalzene SHA-256-Hashes ein (0222 hat sie
--     nur vor dem Lesen geschützt).
-- Jetzt: Funktion und Spalte weg. user_unlocked_games bleibt — es
-- ist die Grundlage des Backfills in 0070 und steht in
-- PROGRESS_TABLES (api/_utils.js).
--
-- Prüfstand: supabase/tests/0224_spielpasswort_entfernen.mjs
-- ══════════════════════════════════════════════════════════════

drop function if exists unlock_game(text, text);

alter table games drop column if exists password_hash;
