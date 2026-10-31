# Reinforce Yourself (MPSkill, Migration 0242, Beta)

Reinforcement Learning zum Selbermachen. Kommt aus dem GameHub
(`GameHub/S2 Reinforce Yourself!`, game14); dort steht das Spiel vorerst
noch unverändert. Hier **ohne** Begleiter/Kreatur, **ohne** die
Zwischen-Quizze und **ohne** Punkte/Gewinn-Bildschirme.

## Aufbau (seit 31.10.2026: Startseite mit Kacheln statt Reitern)

Startseite (`screen-home`): oben die Erklärung „Wie lernt eine KI durch Belohnung?“
(infografik.png + 4 Schritte Beobachten · Handeln · Feedback · Lernen), darunter zwei Bereiche:

- **1 „Du trainierst die KI“** – Kachel `ttt` (Phase 1, Gegen die KI).
- **2 „Du lernst wie eine KI“** – Ablauf mit Pfeilen: `train` (Phase 2, Training) →
  `envA` (Phase 3 · A, Brett) / `envB` (Phase 3 · B, Aliens) im gestrichelten Kasten
  „Training anwenden“ → `sandbox` (Phase 4, Verstehen).

Kachel antippen = `openPart(p, true)`: Teil öffnen + Aufgaben-Fenster (`showTask`, Texte und
Bildleiste in `TASKS`, kurz). Kopfzeile im Teil: „‹ Übersicht“ (`goHome`), Bereich + Name,
„Aufgabe“ (holt das Fenster wieder), „Zurücksetzen“. Der zuletzt offene Teil steht in
`ry.part` (nach Neuladen geht es dorthin zurück; Startseite löscht ihn). Kein Umschalter A/B
mehr, keine eigene Einführungsseite im Training (die Erklärung steht auf der Startseite).

Die Teile:

- **ttt – Gegen die KI**: Tic-Tac-Toe gegen eine KI, die aus jeder Partie lernt.
  Je Stellung kennt die KI ihre Möglichkeiten, gedrehte/gespiegelte Züge = EINE Möglichkeit.
  Jede ist offen, markiert (★, führte zum Sieg) oder gestrichen (grau, führte zur Niederlage).
  Wahl zufällig unter den nicht gestrichenen, markierte zählen dreifach. Sieg → alle KI-Züge der
  Partie markiert; Niederlage → letzter KI-Zug gestrichen, sind dadurch alle Möglichkeiten einer
  Stellung gestrichen, auch der Zug davor (rückwärts weiter); Unentschieden → nichts (`tttLearn`).
  Rechts „Möglichkeiten der KI“ (Mini-Bretter je KI-Zug, Auswahl läuft sichtbar zufällig), links
  Spielfeld + Zähler + Lernkurve (sticky). Gerät: `ry.ttt2_brain`, `ry.ttt2_hist`, `ry.ttt2_game`,
  `ry.ttt_first`; „KI vergessen lassen“ löscht nur das.
- **train – Training**: als KI spielen: Zustände K0x.., Aktionen E0x.., nur Sieg/Niederlage
  als Rückmeldung. Gewichte in `ry.bsch_w`, Siege/Niederlagen in `ry.bsch_s`.
- **envA / envB – Umgebung A (Brettspiel) und B (Aliens)**: das Gelernte anwenden,
  Lernen eingefroren (`learningFrozen`).
- **sandbox**: beide Spiele gleichzeitig + Entscheidungsbaum, Einstellungen ⚙. Die
  Sandbox-Erklärung kommt nicht mehr von selbst (statt dessen die Aufgabe), nur über
  „Was kann ich hier machen?“.

**„+50 Runden (nur Lehrkraft)“** (`.btn-teach`, nur `body.is-teacher`): in ttt (`tttPlay50`:
KI gegen Zufallsgegner, Anfang je Partie gewürfelt, Lernkurve wächst um 50) und im Training
(`trainPlay50`: Weiß zufällig, die KI wählt gewichtet nach `getW`, `applyDiscountedRewards` wie
in `finish`). Ohne Anzeige, danach Meldung unten (`ryToast`) – zum Besprechen des Lerneffekts.

Keine eigene Freischaltung (früher: Gewinnrate 2,5 : 1 + Quiz). Die **Lehrkraft** steuert,
welche Kacheln die Klasse öffnen darf.

## Raum

- `tool.js` rahmt `index.html` ein wie Tiny LM (`?raum=lehrer|schueler`, Schaufenster `?demo=1`).
- Freigabe: `skill_room_state.data.parts` = Liste aus `ttt`, `train`, `envA`, `envB`, `sandbox`
  (fehlt = nur `ttt`), geschrieben über `skill_room_set_state` – keine eigenen Tabellen.
  Ältere Räume mit `data.phases` (0 ttt, 1 train, 2 beide Umgebungen, 3 sandbox) rechnet
  tool.js um; beim nächsten Teilen wird `phases` durch `parts` ersetzt.
- **envA, envB und sandbox ergeben nur mit dem Training Sinn**: `normParts` (in tool.js und
  index.html gleich) nimmt `train` immer mit, sobald eins davon geteilt ist; Training entziehen
  nimmt sie mit weg. Die Umgebungen sind einzeln teilbar.
- Botschaften: hinein `ry:cmd {parts}`, heraus `ry:ready`, `ry:parts {parts}`.
- Lehrkraft sieht alle Kacheln, darunter „Teilen“ (grün = geteilt, beim Training „Geteilt ·
  gehört dazu“, solange eine Umgebung/Sandbox geteilt ist). Schüler sehen alle Kacheln, nicht
  geteilte ausgegraut mit Schloss; ohne Freigabe ein Hinweis auf der Startseite. Wird der offene
  Teil entzogen, springt die Seite zur Startseite.
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
