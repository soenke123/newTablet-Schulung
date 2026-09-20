-- ══════════════════════════════════════════════════════════════
-- Migration 0161 — Die Test-Units gehen von Bord
-- ══════════════════════════════════════════════════════════════
-- 0130 hat drei Beispiellisten mitgebracht (Schule, Zuhause, Essen,
-- je 30 Wörter), 0150 hat sie unter ein Dach namens „Test" gehängt.
-- Sie waren Platzhalter für den Tag, an dem echter Inhalt kommt —
-- der war der 20.09.2026, und mit 0160 stehen 907 Wortpaare aus dem
-- eingeführten Englischbuch daneben.
--
-- Zwei Bestände nebeneinander sind einer zu viel: im Pult stünde
-- „Test · Station 1 — Schule" zwischen den Kapiteln des Buchs, und
-- auf der Insel wären dreißig Tiere aus einer Liste, die niemand
-- mehr unterrichtet.
--
-- ── Was dabei mitgeht ─────────────────────────────────────────
-- ⚠️ Alles, was an diesen Wörtern hängt — und das ist Absicht
-- (Sönke, 20.09.2026: „Bestehende Vokabeln bei Usern nehmen wir
-- einfach raus"). Die Fremdschlüssel erledigen es von allein:
--
--   vocab_sets        über unit_id            → cascade
--   vocab_items       über set_id             → cascade
--   vocab_progress    über item_id            → cascade  (Karteikasten im Raum)
--   wi_solo_progress  über item_id            → cascade  (Langzeit-Fach der Insel)
--   wi_solo_sets      über set_id             → cascade  (Freigespieltes)
--   wi_room_sets      über set_id             → cascade  (Auswahl laufender Räume)
--   wi_round_words    über item_id            → cascade  (Strichliste der Runde)
--   wi_players.current_item      → set null   (0131)
--   wi_solo_learners.current_item → set null  (0136)
--
-- Die beiden letzten sind der Grund, warum das auch MITTEN in einer
-- Stunde nichts zerreißt: wer gerade eines dieser Wörter vor sich
-- hat, bekommt statt eines Fehlers die nächste Aufgabe.
--
-- Ein Kind, dessen Insel nur aus diesen dreißig Wörtern bestand,
-- steht danach bei null und bekommt seinen Bestand neu, sobald
-- seine Lehrkraft das erste Mal Stationen aus dem Buch wählt. Die
-- Rechnungen auf der Insel halten das aus — `pass_percent` (0141)
-- und `wi_solo_level_refresh` (0145) teilen beide durch
-- `nullif(…, 0)`.
--
-- ── Warum Löschen und nicht Verstecken ────────────────────────
-- Ein Merker „nicht mehr anzeigen" hätte die Wörter in jeder
-- Abfrage als Sonderfall hinterlassen, und die Tiere auf den Inseln
-- wären geblieben — sichtbar, aber ohne Wort dahinter. Weg ist
-- ehrlicher als versteckt.
--
-- Kein DROP: hier verschwinden ZEILEN und keine Strukturen. 0130 und
-- 0150 bleiben unangetastet — wer die Datenbank neu aufsetzt, legt
-- die drei Listen an und räumt sie hier wieder ab. Das ist ein Lauf
-- zu viel und dafür eine Migration weniger, die rückwirkend die
-- Geschichte ändert.
--
-- Idempotent von Natur aus: beim zweiten Lauf findet `delete`
-- nichts mehr.
-- ══════════════════════════════════════════════════════════════


-- Erst die drei Stationen selbst. Ihre Nummern stehen seit 0130
-- fest; sie hier zu nennen statt „alles unter dem Dach Test" zu
-- löschen, ist der Unterschied zwischen einer gezielten und einer
-- mutigen Anweisung.
delete from vocab_sets where id in (
  'a0000000-0000-4000-8000-000000000001',   -- Station 1 — Schule
  'a0000000-0000-4000-8000-000000000002',   -- Station 2 — Zuhause
  'a0000000-0000-4000-8000-000000000003'    -- Station 3 — Essen
);

-- Dann das Dach aus 0150. Es ist jetzt leer; stehen bliebe sonst
-- eine Unit ohne eine einzige Station — genau die Leerhülse, gegen
-- die vocab_set_delete seit 0150 vorgeht.
delete from vocab_units where id = 'b0000000-0000-4000-8000-000000000001';


-- Eine Sicherung für den Fall, dass jemand eine dieser Listen
-- inzwischen an eine andere Unit gehängt hat: ein mitgeliefertes
-- Dach ohne Stationen ist immer ein Rest und nie Absicht.
delete from vocab_units u
 where u.owner_id is null
   and not exists (select 1 from vocab_sets s where s.unit_id = u.id);
