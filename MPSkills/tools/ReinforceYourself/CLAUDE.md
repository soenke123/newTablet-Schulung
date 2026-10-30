# Reinforce Yourself (MPSkill, Migration 0242, Beta)

Reinforcement Learning zum Selbermachen. Kommt aus dem GameHub
(`GameHub/S2 Reinforce Yourself!`, game14); dort steht das Spiel vorerst
noch unverändert. Hier **ohne** Begleiter/Kreatur, **ohne** die
Zwischen-Quizze und **ohne** Punkte/Gewinn-Bildschirme.

## Vier Phasen (Reiter 1–4, intern 0–3)

0. **Gegen die KI** (Reiter 1, seit 30.10.2026) – Tic-Tac-Toe gegen eine KI, die aus jeder
   Partie lernt: erst spielt man GEGEN die KI, danach (Training) IST man die KI. Lernen wie
   MENACE (Perlen je Stellung, gedrehte/gespiegelte Stellungen = eine Schachtel; Start 4/3/2/1/1
   Perlen je nach Zahl eigener Steine, Sieg +3, Unentschieden +1, Niederlage −1). „Gedanken der KI“
   zeigt vor ihrem Zug die Wahrscheinlichkeit je Feld, rechts Zähler, Lernkurve (Bilanz
   Siege − Niederlagen + Ergebnis-Kästchen je Partie) und „Das lernt die KI aus der letzten
   Partie“ (je KI-Zug vorher → nachher). Kein Text, keine Aufgaben. Gerät: `ry.ttt_brain`,
   `ry.ttt_hist`, `ry.ttt_last`, `ry.ttt_first`, `ry.ttt_think`; „KI vergessen lassen“ löscht nur das.
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
  (Phase 2 oben mit Umschalter Umgebung A/B), keine Kachel-Übersicht mehr. Phase 1 merkt sich
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
