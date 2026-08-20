-- ══════════════════════════════════════════════════════════════
-- Migration 0091 — Ein Raum fasst 150 statt 60
-- ══════════════════════════════════════════════════════════════
-- Die 60 aus 0078 war für eine Klasse gerechnet, notfalls zwei. Der
-- Fall, der sie sprengt, ist aber der naheliegendste überhaupt: eine
-- Jahrgangsstufe im Forum, ein Elternabend, eine Fortbildung. Wer
-- dafür zwei Räume aufmachen muss, hat zwei Wortwolken, die nichts
-- voneinander wissen — und genau das Zusammentragen war der Zweck.
--
-- Also 150. Die Zahl ist keine technische Grenze, sondern eine
-- pädagogische: über 150 Zettel liest niemand mehr vor, und ein
-- Raum, in den jemand versehentlich die halbe Schule holt, soll
-- irgendwo aufhören. Die harte Grenze der Spalte (1..500 aus 0078)
-- bleibt unverändert stehen, sie ist der Rahmen und nicht die Regel.
--
-- ── Warum das eine Migration ist und kein UPDATE von Hand ──────
-- 0078 hat max_participants und max_rooms bewusst NICHT in das
-- do-update des Seed-Upserts genommen: wer sie für ein Tool von Hand
-- anpasst, soll das behalten dürfen. Genau deshalb ändert ein
-- erneuter Lauf von 0078/0089 auch nichts an bestehenden Zeilen —
-- und deshalb muss die neue Zahl hier ausdrücklich hin. Der neue
-- DEFAULT gilt für das nächste Tool, das UPDATE für die drei, die
-- es schon gibt.
--
-- Das UPDATE fasst nur an, was noch unter 150 steht. Wer einem Tool
-- eine höhere Zahl gegeben hat, hatte einen Grund dafür; eine
-- Migration, die eine Handanpassung nach UNTEN zieht, ist genau der
-- Fall, gegen den 0078 sich entschieden hat.
--
-- Nichts weiter zu tun: gelesen wird die Spalte in skill_room_join
-- (Platzprüfung unter `for update`) und in skill_room_peek/-_json —
-- alle drei nehmen sie zur Laufzeit aus skill_tools, keine Funktion
-- trägt die Zahl im Rumpf.
-- ══════════════════════════════════════════════════════════════

alter table skill_tools
  alter column max_participants set default 150;

update skill_tools
   set max_participants = 150
 where max_participants < 150;

comment on column skill_tools.max_participants is
  'Obergrenze Teilnehmer je Raum (17.08.2026: 60 · 19.08.2026: 150 — eine Jahrgangsstufe '
  'soll in EINEN Raum passen). Jedes Gerät zählt einzeln. Die harte Grenze der Spalte '
  'ist 500 und bleibt der Rahmen, nicht die Regel.';
