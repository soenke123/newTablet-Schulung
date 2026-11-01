-- ══════════════════════════════════════════════════════════════
-- Migration 0252 — Reinforce Yourself verlässt den GameHub
-- ══════════════════════════════════════════════════════════════
-- Seit Migration 0242 ist Reinforce Yourself ein MPSkills-Skill
-- (id 'reinforce'). Das alte Spiel im GameHub (game14, Season 2,
-- Ordner „S2 Reinforce Yourself!") ist entfernt.
--
-- Die Zeile in `games` wird bewusst NICHT gelöscht und bleibt
-- active = true:
--   * game_state, game_saves, highscores … hängen mit
--     ON DELETE CASCADE an games(id). Ein DELETE nähme den
--     Schülerinnen und Schülern Kreatur, Wachstum und Münzen weg,
--     die sie dort verdient haben.
--   * sync_game_state nimmt nur aktive Spiele an. Die Kreatur aus
--     game14 lebt im Hub weiter (Galerie, Wachstumstrank) und muss
--     sich weiter speichern lassen.
--
-- Stattdessen cluster_managed = false (Merkmal aus 0072): damit ist
-- game14 raus aus der Freischalt-Matrix im Admin-Panel, aus
-- „Season komplett auf" (set_cluster_season_access) und aus der
-- Cluster-Starthilfe (apply_cluster_bonus, 0073/0076 — kein neues
-- Baby-Monster mehr für eine Kachel, die es nicht gibt). Der Hub
-- zeigt die Kachel nicht mehr (GAMES_CONFIG retired: true).
--
-- Keine neue Funktion, kein DROP, idempotent.
-- ══════════════════════════════════════════════════════════════

update games set cluster_managed = false where id = 'game14';

-- Freischaltungen für ein Spiel, das niemand mehr schalten kann,
-- zählen sonst in der „Offen"-Spalte des Admin-Panels mit (wie 0072).
delete from cluster_unlocked_games where game_id = 'game14';
