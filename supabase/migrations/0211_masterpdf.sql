-- ══════════════════════════════════════════════════════════════
-- Migration 0211 — Master PDF Skill (neuer MPSkill, Beta, OHNE Raum)
-- ══════════════════════════════════════════════════════════════
-- Zwölfter Skill: PDF lesen und bearbeiten. Anders als alle bisherigen
-- Skills ist das KEIN Raum: es gibt nichts zu teilen und keine Tür
-- (Code/QR), die jemanden zusammenbringt. Die Seite (MPSkills/tools/Master PDF Skill/index.html)
-- wird einfach geöffnet und läuft im Browser; später kommt eine
-- Download-Version dazu.
--
-- Die Zeile steht trotzdem in skill_tools: die Registry entscheidet,
-- welche Kachel es gibt (tools.js). Dass die Kachel „Öffnen" statt
-- „+ Raum öffnen" zeigt und im Dropdown für neue Räume fehlt, steht
-- im Frontend (tools.js, `standalone`) — es ist eine Eigenschaft der
-- Auslieferung, keine der Datenbankzeile.
--
-- Fach „Fächerübergreifend" (Entscheidung 16.10.2026), sort_order 5.
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('masterpdf', 'Master PDF Skill',
   'PDFs lesen und bearbeiten — direkt im Browser, ohne Raum und ohne Anmeldung. '
   'Einfach öffnen und loslegen.',
   '📄', 'Master PDF Skill', 'Fächerübergreifend', false,
   '{}'::jsonb, true, 5)
on conflict (id) do update set
  title      = excluded.title,
  blurb      = excluded.blurb,
  icon       = excluded.icon,
  folder     = excluded.folder,
  subject    = excluded.subject,
  multi_room = excluded.multi_room,
  limits     = excluded.limits,
  active     = excluded.active,
  sort_order = excluded.sort_order;
