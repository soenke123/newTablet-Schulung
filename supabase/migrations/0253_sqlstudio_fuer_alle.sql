-- ══════════════════════════════════════════════════════════════
-- Migration 0253 — SQL Studio für alle Lehrkräfte
-- ══════════════════════════════════════════════════════════════
-- Sönke 31.10.2026: „sql studio kann ruhig öffentlich sein, nicht nur
-- Admins“. 0220 hat den Skill mit admin_only = true eingetragen (wie
-- Definitions Derby, das 0237 freigegeben hat). admin_only steht in 0220
-- nicht im on-conflict-Teil, ein erneutes Einspielen dreht es also nicht
-- wieder zu. Der „Beta“-Sticker kommt aus MPSkills/tools.js, nicht aus
-- der Datenbank.
--
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

update skill_tools set admin_only = false where id = 'sqlstudio';
