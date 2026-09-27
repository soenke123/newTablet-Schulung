-- ══════════════════════════════════════════════════════════════
-- Migration 0177 — Lehrkräfte können je Skill 10 Räume öffnen
-- ══════════════════════════════════════════════════════════════
-- Bisher lag die Standard-Obergrenze (max_rooms) bei 5 Räumen,
-- und einzelne Skills (wie KnowledgeStack oder Wordisland) waren
-- über multi_room = false sogar auf genau 1 Raum beschränkt.
--
-- Im Schulalltag unterrichten Lehrkräfte mehrere parallele
-- Klassen und Kurse und bereiten Räume im Voraus vor. Deshalb:
-- 1. Standard-Limit max_rooms wird von 5 auf 10 angehoben.
-- 2. multi_room wird standardmäßig auf true gesetzt.
-- 3. Alle existierenden Skills in skill_tools werden auf
--    multi_room = true und max_rooms = 10 gesetzt.
-- ══════════════════════════════════════════════════════════════

alter table skill_tools
  alter column max_rooms set default 10;

alter table skill_tools
  alter column multi_room set default true;

update skill_tools
   set multi_room = true,
       max_rooms  = 10;

comment on column skill_tools.max_rooms is
  'Obergrenze LEBENDER Räume je (Lehrkraft, Tool) — Entscheidung 27.09.2026: 10. '
  'Abgelaufene und Testräume zählen nicht mit. Gelesen in skill_room_create.';

comment on column skill_tools.multi_room is
  'Darf eine Lehrkraft mehrere Räume dieses Tools parallel haben? true = bis zu max_rooms (10).';
