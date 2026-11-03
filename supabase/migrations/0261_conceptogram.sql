-- ══════════════════════════════════════════════════════════════
-- 0261 · Skill „Diagramm" heißt jetzt „Conceptogram"
-- ══════════════════════════════════════════════════════════════
-- Nur Anzeige: Titel und Kacheltext. id 'diagramm', Ordner Diagramm/
-- und die Tabellen dg_* bleiben. Nimmt außerdem 0259 zurück — die
-- Diagrammart heißt wieder „Wirkungsgefüge" (id 'wirkung').
-- Idempotent, kein DROP.
-- ══════════════════════════════════════════════════════════════

update skill_tools
   set title = 'Conceptogram',
       blurb = 'Mindmaps, Wirkungsgefüge, Klassen- und Objektdiagramme zeichnen – '
               'einfach wie auf Papier. Die Lehrkraft holt zwei Ergebnisse nebeneinander an den Beamer.'
 where id = 'diagramm';
