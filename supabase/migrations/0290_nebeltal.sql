-- ══════════════════════════════════════════════════════════════
-- Migration 0290 — Nebeltal (neuer MPSkill, Prototyp, nur Admins)
-- ══════════════════════════════════════════════════════════════
-- Sönke 14.11.2026: Spiel, in dem man lernt, wie ein neuronales Netz
-- lernt — auf einer 3D-Welt den tiefsten Punkt suchen, man sieht nur,
-- wo man gerade steht. Erst frei suchen, dann mit Bergab-Pfeil
-- (Gradient), dann springen mit Lernrate, zuletzt ist die Landschaft
-- der Fehler eines echten Modells. „Soll erstmal einfach nur für
-- Admins sichtbar sein.“
--
-- Wie SQL Studio (0220): admin_only = true → Kachel nur für Admins
-- (Policy skill_tools_select_public), Anlegen nur für Admins (Trigger
-- skill_rooms_admin_only). Seit 0223 zählt Admin nur mit 2FA in der
-- Sitzung.
--
-- Keine Tabellen, keine Funktionen: jede Person spielt im Gerät,
-- die Welt-Nummer macht die Landschaft auf allen Tablets gleich.
--
-- Freigeben für alle später:
--   update skill_tools set admin_only = false where id = 'nebeltal';
-- admin_only steht deshalb bewusst NICHT im on-conflict-Teil (wie 0233).
--
-- sort_order 31: im Fach Informatik · Künstliche Intelligenz direkt
-- hinter NeuroLab (30), vor Tiny LM (32). Laufzeit-Vorgabe 10 Tage
-- wie die anderen KI-Spiele (Wild Clusters, Tiny LM, Reinforce).
-- Mehrfach ausführbar.
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, subcategory, multi_room, limits, active, admin_only, sort_order, lifetime_days) values
  ('nebeltal', 'Nebeltal',
   'Suche im Nebel den tiefsten Punkt einer Landschaft – so, wie eine KI beim Lernen ihren Fehler '
   'kleiner macht. Vom freien Suchen bis zur Lernrate.',
   '🌫️', 'Nebeltal', 'Informatik', 'Künstliche Intelligenz', true,
   '{}'::jsonb, true, true, 31, 10)
on conflict (id) do update set
  title         = excluded.title,
  blurb         = excluded.blurb,
  icon          = excluded.icon,
  folder        = excluded.folder,
  subject       = excluded.subject,
  subcategory   = excluded.subcategory,
  multi_room    = excluded.multi_room,
  limits        = excluded.limits,
  active        = excluded.active,
  sort_order    = excluded.sort_order,
  lifetime_days = excluded.lifetime_days;
