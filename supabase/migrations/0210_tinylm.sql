-- ══════════════════════════════════════════════════════════════
-- Migration 0210 — Tiny LM (neuer MPSkill, Beta)
-- ══════════════════════════════════════════════════════════════
-- Elfter Skill: ein Mini-Sprachmodell zum Aufschrauben. Drei Phasen
-- auf denselben Texten — Frei schreiben (n-Gramm), Frage & Antwort
-- (Nachschlagen + n-Gramm), Echtes Netz (kleines neuronales Netz,
-- live im Browser trainiert).
--
-- Wie NeuroLab (0089): jede Person arbeitet für sich, es wird NICHTS
-- geteilt. Der Raum trägt nur die Tür (Code/QR), deshalb gibt es
-- keine eigenen Tabellen und keine Einstellungen. Die Anwendung
-- steckt in einem <iframe> (tools/TinyLM/index.html) und merkt sich
-- eigene Texte und den Fortschritt im Leitfaden im localStorage des
-- Geräts.
--
-- sort_order 32: im Fach Informatik direkt hinter NeuroLab (30) —
-- erst das einzelne Neuron, dann ein ganzes Sprachmodell.
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('tinylm', 'Tiny LM',
   'Ein Mini-Sprachmodell zum Aufschrauben: Texte füttern, Wort für Wort zusehen, '
   'wie geschrieben wird, Fragen stellen und ein echtes kleines Netz trainieren. '
   'Jede Person arbeitet für sich.',
   '🤖', 'TinyLM', 'Informatik', true,
   '{}'::jsonb, true, 32)
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
