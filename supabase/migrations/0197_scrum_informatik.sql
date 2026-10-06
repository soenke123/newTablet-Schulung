-- ═══════════════════════════════════════════════════════════════
-- 0197 — Scrum Werkstatt: Kachel unter „Informatik"
-- ═══════════════════════════════════════════════════════════════
-- Sönke (06.10.2026): Die Scrum Werkstatt gehört in die Kategorie
-- Informatik, nicht unter „Fächerübergreifend". subject ist die
-- Überschrift der Kachelgruppe im Sortiment (0089).
-- 0196 trägt den neuen Wert ebenfalls, damit ein erneuter Lauf von
-- 0196 ihn nicht zurückdreht. Mehrfach ausführbar.
-- ═══════════════════════════════════════════════════════════════

update skill_tools
   set subject = 'Informatik'
 where id = 'scrum';
