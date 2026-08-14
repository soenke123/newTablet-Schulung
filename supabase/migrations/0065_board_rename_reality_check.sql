-- ══════════════════════════════════════════════════════════════
-- Migration 0065 — aus „Zukunftsboard" wird „Reality Check"
-- ══════════════════════════════════════════════════════════════
-- Reine Umbenennung der Anzeige, kein Schema-Eingriff. Die Einheit
-- fragt nicht nach der Zukunft, sondern danach, was KI und Social
-- Media JETZT mit uns machen — „Zukunftsboard" hat den falschen
-- Zeitpunkt behauptet. games.title steht im Admin-Panel (Fortschritts-
-- und Season-Listen), deshalb muss die Umbenennung auch hierhin.
--
-- Bewusst NICHT angefasst:
--   • id 'game19' und folder 'S3 Zukunftsboard' — das sind Adressen,
--     keine Beschriftung. Ein Ordner-Umzug träfe GAMES_CONFIG, die
--     unlock-Wege und jeden Link, ohne dass irgendwer etwas davon
--     hätte.
--   • board_notes.kind = 'fakt' — der Wert steckt in Check-Constraints
--     und in jedem Board-RPC aus 0062–0064. Im Frontend heißt diese
--     Kartenart seit der Umbenennung „Recherche", weil man im Netz
--     auch Müll findet und das Wort das Urteil nicht vorwegnehmen
--     soll. Der gespeicherte Wert bleibt, wie er ist.
-- ══════════════════════════════════════════════════════════════

update games
   set title = 'Reality Check'
 where id = 'game19';
