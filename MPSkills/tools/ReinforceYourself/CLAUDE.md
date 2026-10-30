# Reinforce Yourself (MPSkill, Migration 0242, Beta)

Reinforcement Learning zum Selbermachen. Kommt aus dem GameHub
(`GameHub/S2 Reinforce Yourself!`, game14); dort steht das Spiel vorerst
noch unverändert. Hier **ohne** Begleiter/Kreatur, **ohne** die
Zwischen-Quizze und **ohne** Punkte/Gewinn-Bildschirme.

## Vier Phasen (Reiter 1–4, intern 0–3)

0. **Gegen die KI** (Reiter 1, seit 30.10.2026) – Tic-Tac-Toe gegen eine KI, die aus jeder
   Partie lernt: erst spielt man GEGEN die KI, danach (Training) IST man die KI. Je Stellung kennt
   die KI ihre Möglichkeiten, gedrehte/gespiegelte Züge = EINE Möglichkeit. Jede ist offen,
   markiert (★, führte zum Sieg) oder gestrichen (grau, führte zur Niederlage). Wahl zufällig unter
   den nicht gestrichenen, markierte zählen dreifach. Sieg → alle KI-Züge der Partie markiert;
   Niederlage → letzter KI-Zug gestrichen, sind dadurch alle Möglichkeiten einer Stellung
   gestrichen, auch der Zug davor (rückwärts weiter); Unentschieden → nichts.
   Rechts „Möglichkeiten der KI“: je KI-Zug eine Reihe Mini-Bretter (gleichwertige Felder blass),
   die Auswahl läuft sichtbar zufällig darüber; nach der Partie wird markiert/ausgegraut.
   „Gedanken der KI“ = Prozent auf dem Brett und unter den Möglichkeiten. Darunter Zähler (inkl.
   gestrichene Züge) und Lernkurve (Bilanz Siege − Niederlagen + Ergebnis-Kästchen je Partie).
   Kein Text, keine Aufgaben. Gerät: `ry.ttt2_brain`, `ry.ttt2_hist`, `ry.ttt2_game`,
   `ry.ttt_first`, `ry.ttt_think`; „KI vergessen lassen“ löscht nur das.
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
- Freigabe: `skill_room_state.data.phases` mit den internen Nummern 0–3 (fehlt = nur Phase 0 „Gegen die KI“), geschrieben über
  `skill_room_set_state` – keine eigenen Tabellen.
- Botschaften: hinein `ry:cmd {phases}`, heraus `ry:ready`, `ry:phases {phases}`.
- Aufbau wie die anderen Skills: Kopfzeile mit Reitern 1 Gegen die KI · 2 Training · 3 Umgebungen · 4 Sandbox
  (Reiter 3 oben mit Umschalter Umgebung A/B), keine Kachel-Übersicht mehr. Phase 1 merkt sich
  Einführung/Training, Phase 2 die Umgebung, die zuletzt offene Phase steht in `ry.phase`.
- Lehrkraft sieht alle Reiter und daneben das Teilen-Symbol (gefüllt = geteilt), wie bei
  Tiny LM/Definitions Derby. Schüler sehen nur geteilte Reiter; ohne geteilte Phase eine
  Wartekarte; wird die offene Phase entzogen, springt die Seite in die nächste erlaubte.
- Farben/Schrift = MPSkills (Tokens als `--mp-*` aus MPSkills/style.css, Outfit lokal),
  Hell/Dunkel vom Rahmen (`data-theme`), allein vom Gerät. Umgebung A (Brett, beige) und
  B (Aliens, lila) behalten ihre eigenen Welten, der Baum in der Sandbox bleibt eine dunkle Tafel
  (auf der Leinwand fest gezeichnet).
- Allein geöffnet (ohne `?raum=`) ist alles offen.

## Gerät

Alles liegt im localStorage unter `ry.*` (getrennt vom GameHub-Spiel auf derselben Herkunft).
„Zurücksetzen“ rechts in der Kopfzeile löscht den Stand.

## Daten / Werkzeuge

Spielbaum (T_NODES/T_EDGES/T_TERM), Kantentexte und Bilder (`Sprites/Knoten/K0x...png`)
wie im Original. `generate_data.js`, `verify_tree.js`, `renumber.js`, `kantentexte.md`,
`bauernschach_spielbaum.html` sind die Hilfswerkzeuge aus dem Original-Ordner.

Prüfstand: `supabase/tests/0242_reinforce_yourself.mjs`.
