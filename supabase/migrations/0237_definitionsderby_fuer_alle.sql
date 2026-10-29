-- ══════════════════════════════════════════════════════════════
-- Migration 0237 — Definitions Derby für alle Lehrkräfte
-- ══════════════════════════════════════════════════════════════
-- Sönke 29.10.2026: „mach es nicht nur für Admins sichtbar“.
-- 0233 hat den Skill mit admin_only = true eingetragen (wie SQL Studio
-- 0220); admin_only steht dort bewusst nicht im on-conflict-Teil, ein
-- erneutes Einspielen von 0233 dreht es also nicht wieder zu.
--
-- Dazu der Text der Kachel auf den heutigen Stand (die Lernformen
-- statt „später Memory, Activity und Rennen“).
--
-- Prüfstand: supabase/tests/0237_definitionsderby_fuer_alle.mjs.
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

update skill_tools set
  admin_only = false,
  blurb = 'Begriffe und Definitionen als Karten: Lehrkräfte legen Stapel an (mit Bildern, per Text oder '
          'Karte für Karte) und teilen sie mit der Klasse. Gelernt wird mit Übersicht, Karteikarten, '
          'einer Insel voller Wesen, Memory und dem Duell zu zweit an einem Tablet.'
where id = 'derby';
