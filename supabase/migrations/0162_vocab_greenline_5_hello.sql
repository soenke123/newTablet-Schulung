-- ══════════════════════════════════════════════════════════════
-- Migration 0162 — Das erste Kapitel heißt nur „Hello!"
-- ══════════════════════════════════════════════════════════════
-- 0160 hat das Auftaktkapitel von Green Line 1 „Hello!
-- (Grundschulübergang)" genannt. Der Zusatz stammt aus dem
-- Inhaltsverzeichnis des Verlags und erklärt der LEHRKRAFT, wofür
-- das Kapitel da ist — in der Unit-Leiste der Insel ist er nur
-- lang: er drängt die Stufenpunkte in die nächste Zeile und wird
-- dort, wo es eng wird, ohnehin abgeschnitten
-- („Hello! (Grundschul…"). Sönke, 20.09.2026: „die erste Unit
-- Hello (Grundschul…) soll nur Hello heißen".
--
-- Nur der Titel. Die Nummer bleibt dieselbe, also bleiben auch die
-- Stationen, die Wörter und jeder Lernstand daran hängen.
--
-- ⚠️ Auch in der Quelle geändert, sonst holt der nächste Lauf des
-- Erzeugers den alten Titel zurück (0160 schreibt mit
-- `on conflict do update set title = excluded.title`):
-- MPSkills/tools/wordisland/tools/greenline.mjs, Tabelle BUCH.
--
-- Kein DROP.
-- ══════════════════════════════════════════════════════════════

update vocab_units
   set title = 'Hello!'
 where id = 'a72c8599-b342-4b2d-a80c-b2530b7bcbe7';
