-- ══════════════════════════════════════════════════════════════
-- Migration 0251 — Reinforce Yourself: Kacheltext „Perspektivwechsel"
-- ══════════════════════════════════════════════════════════════
-- Sönke 31.10.2026:
--   „Die erste Kachel muss mehr als nur Tic tac toe zeigen ... Aber
--    auch nicht die geheimen Umgebungen ... Der Text muss auch
--    eindeutig sagen, dass es um den Perspektivwechsel geht."
--
-- Nur der Text der Kachel (skill_tools.blurb). Der alte Text aus 0242
-- sprach noch von „Phasen" und verriet die zwei Umgebungen; der neue
-- nennt den Kern des Skills – erst trainierst du eine KI, dann bist
-- du selbst die KI – ohne ein Spiel oder eine Umgebung zu nennen.
-- Das Standbild dazu steht in MPSkills/preview/reinforce.js.
--
-- Kein DROP, keine neue Funktion, idempotent.
-- ══════════════════════════════════════════════════════════════

update skill_tools set
  blurb = 'Ein Perspektivwechsel: Erst trainierst du eine KI und siehst zu, wie sie ohne Regeln nur '
          'durch Belohnung lernt. Dann wirst du selbst zur KI – du kennst weder Spiel noch Regeln '
          'und erfährst nur, ob du gewonnen oder verloren hast.'
where id = 'reinforce';
