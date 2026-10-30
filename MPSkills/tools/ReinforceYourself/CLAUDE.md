# Reinforce Yourself (MPSkill, Migration 0242, Beta)

Reinforcement Learning zum Selbermachen. Kommt aus dem GameHub
(`GameHub/S2 Reinforce Yourself!`, game14); dort steht das Spiel vorerst
noch unverändert. Hier **ohne** Begleiter/Kreatur, **ohne** die
Zwischen-Quizze und **ohne** Punkte/Gewinn-Bildschirme.

## Drei Phasen

1. **Trainingsphase** – Einführung „Was ist Reinforcement Learning?“ (infografik.png),
   dann als KI spielen: Zustände K0x.., Aktionen E0x.., nur Sieg/Niederlage als Rückmeldung.
   Gewichte in `ry.bsch_w`, Siege/Niederlagen in `ry.bsch_s`.
2. **Umgebung A** (Brettspiel) und **Umgebung B** (Aliens) – das Gelernte anwenden,
   Lernen eingefroren (`learningFrozen`).
3. **Sandbox** – beide Spiele gleichzeitig + Entscheidungsbaum, Einstellungen ⚙.
   Die Erklärung kommt nur beim ersten Öffnen von selbst (`ry.sb_intro`), danach über „Erklärung“.

Keine eigene Freischaltung mehr (früher: Gewinnrate 2,5 : 1 + Quiz). Die **Lehrkraft**
steuert, welche Phasen die Klasse öffnen darf.

## Raum

- `tool.js` rahmt `index.html` ein wie Tiny LM (`?raum=lehrer|schueler`, Schaufenster `?demo=1`).
- Freigabe: `skill_room_state.data.phases` (fehlt = nur Phase 1), geschrieben über
  `skill_room_set_state` – keine eigenen Tabellen.
- Botschaften: hinein `ry:cmd {phases}`, heraus `ry:ready`, `ry:phases {phases}`.
- Lehrkraft sieht alle Phasen offen und unter jeder Phase den Schalter
  „Mit der Klasse teilen/geteilt“. Schüler sehen nicht geteilte Phasen gesperrt (🔒);
  wird eine Phase entzogen, während man drin ist, geht es zurück zur Übersicht.
- Allein geöffnet (ohne `?raum=`) ist alles offen.

## Gerät

Alles liegt im localStorage unter `ry.*` (getrennt vom GameHub-Spiel auf derselben Herkunft).
„Alles zurücksetzen“ unten in der Übersicht löscht den Stand.

## Daten / Werkzeuge

Spielbaum (T_NODES/T_EDGES/T_TERM), Kantentexte und Bilder (`Sprites/Knoten/K0x...png`)
wie im Original. `generate_data.js`, `verify_tree.js`, `renumber.js`, `kantentexte.md`,
`bauernschach_spielbaum.html` sind die Hilfswerkzeuge aus dem Original-Ordner.

Prüfstand: `supabase/tests/0242_reinforce_yourself.mjs`.
