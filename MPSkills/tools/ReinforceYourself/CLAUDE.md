# Reinforce Yourself (MPSkill, Migration 0242, Beta)

Reinforcement Learning zum Selbermachen. Kommt aus dem GameHub
(früher `GameHub/S2 Reinforce Yourself!`, game14); dort ist das Spiel
seit Migration 0252 entfernt (Kachel weg, Ordner gelöscht, game14 bleibt
nur für Altbestände an Kreaturen/Münzen als `retired` in GAMES_CONFIG).
Hier **ohne** Begleiter/Kreatur, **ohne** die
Zwischen-Quizze und **ohne** Punkte/Gewinn-Bildschirme.

## Aufbau (seit 31.10.2026: Startseite mit Kacheln statt Reitern)

Startseite (`screen-home`, Umbau 31.10.2026): zwei Bereiche mit Kacheln.

- **1 „Du trainierst die KI“** – zwei Kacheln: „Was ist Reinforcement Learning?“ (öffnet das Fenster `#rl-dialog` mit der Erklärung „Wie lernt eine KI durch Belohnung?“: infografik.png + Text, die vier Kästen KI-Agent · Umgebung · Belohnung · Lernen in deren Farben, `.rl-cycle`; kein Teil, nicht teilbar, immer offen, `.tile-info` ohne `data-part`) und `ttt` (Gegen die KI).
- **2 „Du lernst wie eine KI“** – Ablauf mit Pfeilen: `train` (Training) →
  `envA` (Brett) / `envB` (Aliens) im gestrichelten Kasten „Training anwenden“ →
  `sandbox` („Verstehen“).

Nicht freigegebene Kacheln sieht die Klasse nur als graue Fläche mit Schloss – weder Bild noch Name (`.tile.is-locked`, Bild/Text per visibility:hidden).

Wenig Text (Wunsch 31.10.2026): Kacheln nur Bild + Name, keine Phasen-Nummern, keine
Untertitel unter den Bereichen, kein Erklärsatz für die Lehrkraft, kein Fußsatz.

Kachel antippen = `openPart(p, true)`: Teil öffnen + Aufgaben-Fenster (`showTask`, Texte und
Bildleiste in `TASKS`, kurz). Kopfzeile im Teil: „‹ Übersicht“ (`goHome`), Bereich + Name,
„Aufgabe“ (holt das Fenster wieder), „Zurücksetzen“. Der zuletzt offene Teil steht in
`ry.part` (nach Neuladen geht es dorthin zurück; Startseite löscht ihn). Kein Umschalter A/B
mehr, keine eigene Einführungsseite im Training (die Erklärung steht auf der Startseite).

Die Teile:

- **ttt – Gegen die KI**: Tic-Tac-Toe gegen eine KI, die aus jeder Partie lernt.
  Je Stellung kennt die KI ihre Möglichkeiten, gedrehte/gespiegelte Züge = EINE Möglichkeit.
  Jede ist offen, Siegzug (★, hat direkt gewonnen) oder Verlustzug (✕ grau, danach hat der Gegner
  direkt gewonnen). Nach der Partie wird NUR der letzte KI-Zug markiert (`tttLearn`, seit 31.10.2026):
  Sieg → Siegzug, Niederlage → Verlustzug (sind dadurch in der Stellung alle Möglichkeiten
  Verlustzüge, wird auch der KI-Zug davor gestrichen, rückwärts weiter), Unentschieden → nichts. Wahl (`tttProbs`): gibt es einen
  Siegzug, nimmt die KI ihn zu 100 %, sonst zufällig unter den offenen, Verlustzüge nie (alles
  Verlustzüge → blind raten). Früher: alle Züge eines Sieges markiert (dreifach gewichtet) und Zähler
  „Gestrichen“ – entfernt, war nicht verständlich.
  „Möglichkeiten der KI“ (Mini-Bretter je KI-Zug, Auswahl läuft sichtbar zufällig, Legende
  gewählt · gewinnt direkt · verliert direkt), Spielfeld, Zähler (KI-Siege · Unentschieden · Deine
  Siege) + Lernkurve. Ansicht seit 31.10.2026 auf EINE Bildschirmhöhe (`--ttt-h`, Spielfeldgröße
  `--bsz` aus der Höhe gerechnet), die Seite scrollt nicht: breit (> 820 px) Spielfeld + Lernkurve
  links, Möglichkeiten rechts über die ganze Höhe; schmal (Handy/Tablet hoch) Spielfeld oben,
  darunter die Möglichkeiten (so hoch wie Platz ist), unten Zähler als Farbpunkt + Zahl neben
  kleiner Lernkurve (`compact` in `tttChart`). Nur der Kasten der Möglichkeiten scrollt und steht
  immer unten bei der aktuellen Entscheidung (`tttScrollPath`, kein scrollIntoView der Seite).
  Unter ca. 460 px Höhe (Handy quer) darf die Seite scrollen. Zwei Lernkurven je „wer beginnt“ (für die KI zwei verschiedene Spiele): `tttHists = {ki, du}`, angezeigt wird die zum Umschalter passende, Zähler ebenso; jede Partie merkt sich `ttt.first`, „+50 Runden Optimal“ spielt mit dem eingestellten Anfang. Gerät: `ry.ttt3_brain`, `ry.ttt3_hist` (`{ki:[], du:[]}`, alte Liste wird verworfen), `ry.ttt3_game`, `ry.ttt_first`
  (die alten `ry.ttt2_*` werden beim Laden gelöscht); „KI vergessen lassen“ löscht nur das.
- **train – Training**: als KI spielen: Zustände K0x.., Aktionen E0x.., nur Sieg/Niederlage
  als Rückmeldung. Gewichte in `ry.bsch_w`, Siege/Niederlagen in `ry.bsch_s`.
  „Training zurücksetzen“ (Link neben „Neue Partie“, für alle, `trainReset`) löscht nur diese beiden;
  entdeckte Knoten (`ry.*_discovered`) bleiben. Das Training färbt im Sandbox-Baum nur die Kanten der
  KI-Züge (Schwarz) grün/rot nach Gewicht (`getAlienEdgeWeight`, über `applyDiscountedRewards` gedämpft
  über die ganze Partie, nicht nur Sieg/Niederlage des letzten Zugs); Bilder der Knoten (Mini-Brett oben,
  Alien unten) kommen nur aus Umgebung A (`discoveredBrettNodes`), B (`discoveredAlienNodes`) und der Sandbox.
- **envA / envB – Umgebung A (Brettspiel) und B (Aliens)**: das Gelernte anwenden,
  Lernen eingefroren (`learningFrozen`).
- **sandbox**: beide Spiele gleichzeitig + Entscheidungsbaum, Einstellungen ⚙. Die
  Sandbox-Erklärung kommt nicht mehr von selbst (statt dessen die Aufgabe), nur über
  „Was kann ich hier machen?“.

**„+50 Runden (nur Lehrkraft)“** (`.btn-teach`, nur `body.is-teacher`): in ttt (`tttPlay50`:
Knopf „+50 Runden Optimal“: KI lernt normal gegen einen perfekten Gegner (`tttOptimal`, Minimax `tttValue` mit Merkliste, gleich gute Züge gewürfelt) – sie kann nicht gewinnen, man sieht das Lernen an immer mehr Unentschieden (Versuch: nach 300 Partien ~50 %, nach 1000 ~90 % remis gegen perfekt); vorher Zufall bzw. „Siegzug zu 80 %“; Anfang = Umschalter; am Handy steht „nur Lehrkraft“ klein darunter, Lernkurve wächst um 50) und im Training
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
- Lehrkraft sieht alle Kacheln, „Teilen“ als kleine Pille unter dem Namen neben dem Bild (grün = „Geteilt“). Schüler sehen alle Kacheln, nicht
  geteilte ausgegraut mit Schloss; ohne Freigabe „Noch nichts freigegeben.“ auf der Startseite. Wird der offene
  Teil entzogen, springt die Seite zur Startseite.
- Farben/Schrift = MPSkills (Tokens als `--mp-*` aus MPSkills/style.css, Outfit lokal),
  Hell/Dunkel vom Rahmen (`data-theme`), allein vom Gerät. Umgebung A (Brett, beige) und
  B (Aliens, lila) behalten ihre eigenen Welten, der Baum in der Sandbox bleibt eine dunkle Tafel
  (auf der Leinwand fest gezeichnet).
- Allein geöffnet (ohne `?raum=`) ist alles offen.
- **Schaufenster** (`MPSkills/preview/reinforce.js`): Kachel-Standbild „Perspektivwechsel“
  (Wunsch 31.10.2026: nicht auf Tic-Tac-Toe begrenzen, Umgebungen nicht verraten): links
  „Du trainierst die KI“ (Mensch → KI, kleines Brett, Lernkurve), rechts „Du bist die KI“
  (Zustand K0x01, Aktionen mit Gewicht, „Sieg → Aktion wird verstärkt“ beim Darüberfahren),
  CSS `.ryp-*` in MPSkills/style.css; Kacheltext (skill_tools.blurb) in Migration 0251 und Drehbuch mit der echten App im Rahmen (`?demo=1`): Startseite →
  Gegen die KI (zwei Partien als „Du“, 6 × „+50 Runden Optimal“) → Training (+50 Runden) →
  Startseite. Mit `?demo=1` ersetzt index.html den localStorage durch einen Speicher im
  Arbeitsspeicher (erstes Stück im Skript) und zeigt „+50 Runden“ (`body.is-demo`,
  `tttPlay50`/`trainPlay50` laufen bei `TEACHER || DEMO`).

## Gerät

Alles liegt im localStorage unter `ry.*` (eigener Präfix; das frühere GameHub-Spiel lag auf derselben Herkunft).
„Zurücksetzen“ rechts in der Kopfzeile löscht den Stand.

## Daten / Werkzeuge

Spielbaum (T_NODES/T_EDGES/T_TERM), Kantentexte und Bilder (`Sprites/Knoten/K0x...png`)
wie im Original. `generate_data.js`, `verify_tree.js`, `renumber.js`, `kantentexte.md`,
`bauernschach_spielbaum.html` sind die Hilfswerkzeuge aus dem Original-Ordner.

Prüfstand: `supabase/tests/0242_reinforce_yourself.mjs`.
