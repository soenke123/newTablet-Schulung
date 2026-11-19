-- ══════════════════════════════════════════════════════════════
-- Migration 0298 — Nebeltal für alle Lehrkräfte + Reihenfolge KI
-- ══════════════════════════════════════════════════════════════
-- Sönke 19.11.2026: „Bitte mache den Skill Nebeltal öffentlich
-- einsehbar … wir brauchen wieder die interaktive Kachel und die
-- Vorschau. Wir müssen auch die Reihenfolge ändern der Skills im
-- KI-Bereich: Reinforce Yourself · Wild Clusters · NeuroLab ·
-- Nebeltal · Tiny LM.“
--
-- 1. admin_only = false (wie SQL Studio 0253, YourSozialNet 0283).
--    In 0290 steht admin_only bewusst nicht im on-conflict-Teil, ein
--    erneutes Einspielen dreht es also nicht wieder zu. Kachel-Standbild
--    und Schaufenster kommen aus MPSkills/preview/nebeltal.js.
-- 2. sort_order in Informatik · Künstliche Intelligenz neu: 30–34.
--    Der kleinste Wert der Unterkategorie bleibt 30, die Lage der
--    Gruppe im Fach Informatik ändert sich also nicht (Cäsar 40 …).
--    Vorher: NeuroLab 30, Nebeltal 31, Tiny LM 32, Reinforce 33,
--    Wild Clusters 50.
--
-- Prüfstand: supabase/tests/0298_nebeltal_fuer_alle.mjs
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

update skill_tools set admin_only = false where id = 'nebeltal';

update skill_tools t set sort_order = v.o
  from (values ('reinforce', 30), ('wildclusters', 31), ('neurolab', 32),
               ('nebeltal', 33), ('tinylm', 34)) as v(id, o)
 where t.id = v.id;
