-- ══════════════════════════════════════════════════════════════
-- Migration 0155 — Bubble Bounce (game17) von Season 3 → Season 2
-- ══════════════════════════════════════════════════════════════
-- Inhaltlich passt das Spiel besser zu Season 2.
-- Änderungen:
--   • games.season: 3 → 2
--   • games.folder: 'S3 BubbleBounce' → 'S2 BubbleBounce'
-- Der Admin liest gamesBySeason live aus der games-Tabelle,
-- daher reicht dieser UPDATE für die korrekte Admin-Ansicht.
-- ══════════════════════════════════════════════════════════════

update games
set
  season = 2,
  folder = 'S2 BubbleBounce'
where id = 'game17';
