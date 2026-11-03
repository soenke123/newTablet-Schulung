-- ══════════════════════════════════════════════════════════════
-- 0259 · Diagramm: „Wirkungsgefüge" heißt jetzt „Concept Map"
-- ══════════════════════════════════════════════════════════════
-- Nur der Kacheltext. Die Diagrammart behält intern die id 'wirkung'
-- (dg_work.kind, settings.kind), damit gespeicherte Diagramme und
-- angelegte Räume weiterlaufen. Idempotent, kein DROP.
-- ══════════════════════════════════════════════════════════════

update skill_tools
   set blurb = 'Mindmaps, Concept Maps, Klassen- und Objektdiagramme zeichnen – '
               'einfach wie auf Papier. Die Lehrkraft holt zwei Ergebnisse nebeneinander an den Beamer.'
 where id = 'diagramm';
