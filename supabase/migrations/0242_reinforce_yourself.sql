-- ══════════════════════════════════════════════════════════════
-- Migration 0242 — Reinforce Yourself (neuer MPSkill, Beta)
-- ══════════════════════════════════════════════════════════════
-- Sechzehnter Skill: Reinforcement Learning zum Selbermachen. Kommt
-- aus dem GameHub (S2 Reinforce Yourself!, game14) und passt als
-- Werkzeug für den Unterricht besser hierher — ohne Begleiter, ohne
-- Zwischen-Quizze, ohne Punkte. Drei Phasen:
--   1  Trainingsphase mit Einführung
--   2  Umgebung A (Brettspiel) und Umgebung B (Aliens)
--   3  Sandbox mit Entscheidungsbaum
--
-- Wie Tiny LM (0210): jede Person trainiert ihre eigene KI, der Stand
-- liegt im Gerät. Die Lehrkraft teilt die Phasen nach und nach mit der
-- Klasse (skill_room_state.data.phases, fehlt = nur Phase 1) — dafür
-- reicht skill_room_set_state, es gibt keine eigenen Tabellen und keine
-- neuen Funktionen.
--
-- Das Spiel im GameHub bleibt vorerst stehen.
--
-- sort_order 33: im Fach Informatik zwischen Tiny LM (32) und
-- SQL Studio (34).
-- ══════════════════════════════════════════════════════════════

insert into skill_tools (id, title, blurb, icon, folder, subject, multi_room, limits, active, sort_order) values
  ('reinforce', 'Reinforce Yourself',
   'Werde selbst zur KI: Ohne Regeln zu kennen, lernst du nur durch Belohnung '
   'und Bestrafung — und probierst das Gelernte danach in zwei Umgebungen und '
   'in der Sandbox aus. Die Lehrkraft gibt die Phasen nach und nach frei.',
   '🤖', 'ReinforceYourself', 'Informatik', true,
   '{}'::jsonb, true, 33)
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
