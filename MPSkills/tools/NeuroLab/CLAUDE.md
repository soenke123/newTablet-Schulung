# NeuroLab — CLAUDE.md

Neuronale Netze zum Anfassen (MPSkills, Informatik · Künstliche Intelligenz). Das **gewachsene NeuroLab**
(ein Feld mit Spalten, Neuronen als Σ | f-Kästen, Build · Run · Lernen, Zoom, verschiebbares Lernfenster,
CSV-Upload) — am 20.11.2026 **verbessert, nicht ersetzt**. Eine Neufassung mit eigenem Feld und vielen festen
Aufgaben war am selben Tag kurz online und wurde auf Sönkes Wunsch zurückgenommen (zu gesteuert, zu weit
weg vom Original; Hintergrund in `PLAN_NEUROLAB_NEU.md`).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Kopfzeile (‹ Übersicht · Bereich · Build/Run · Reset · Druck), Startseite `#home`, Neuronen-Seite `#neuron-page`, Feld `#network`, Druckauswahl `#print-opts`, Popup |
| `style.css` | Aussehen des Feldes (wie immer) |
| `start.css` | Startseite, Neuronen-Seite, Schicht-Spalte, fester Ausgang, Druckauswahl, Greifvogel-Diagramm |
| `app.js` | das Feld: Zustand, Rechnen, Backprop, Szenarien, Lernfenster, Druck, Speicher, `window.NLApp` |
| `js/start.js` | Startseite, Freigaben im Raum, Navigation (`html[data-view]` = home · neuron · lab) |
| `js/neuron.js` | Bereich 1: „So rechnet ein Neuron“ (6 Schritte) + „Alle Neuronen“ (nutzt `activations`/`fmt` aus app.js) |
| `js/daten.js` | Greifvögel (echte Messwerte) |
| `neuron.png` | altes Bild des Neurons – seit 20.11.2026 (2. Fassung) nicht mehr eingebunden |
| `Regen und Sonne.csv` | Beispiel-CSV fürs Hochladen (auch im Layout-Prüfstand) |
| `tool.js` | Brücke zum Raum (iframe, Höhe, Freigaben) |

## Drei Bereiche (Startseite)

1. **Wie funktioniert ein Neuron?** — Kacheln `n-wie` und `n-typen`. `n-wie` = „So rechnet ein Neuron“ in **sechs
   Schritten** (Sönke 20.11.2026: Anfang war zu kurz, das Bild unklar; Leiste `.nn-step[data-step]`, Weiter/Zurück unten):
   1 `bio` Nervenzelle (SVG `bioSVG`) ↔ künstliches Neuron, Teil antippen = beide Seiten hervorgehoben (`data-k` in
   `neuronSVG`: in · w · sum · b · f · out) · 2 `in` Eingänge als Kommazahlen (−5…5, nicht nur 0/1) und Gewichte, Beiträge
   als Balken · 3 `sum` Summe und Bias, Zahlenstrahl mit den drei Teilen bis z · 4 `act` Aktivierung: Typ wählen, Kurve mit
   z-Marke · 5 `line` Ein Neuron = eine Gerade: Ebene (`drawPlane`, Canvas) eingefärbt nach y′, dicke Linie z = 0, Pfeil
   zur Seite mit großem z, grüner Eingabepunkt ziehbar, Neuron daneben mit umschaltbarem Typ · 6 `task` Impulsaufgabe
   „Türsteher“ UND · ODER · XOR mit Wahrheitstafel + die vier Fälle als Punkte in der Ebene, darunter „Das Wichtigste“.
   Schritte 2–5 teilen sich EIN Neuron (`st`), die Aufgabe hat ihr eigenes (`ts`). Und `n-typen`
   (alle Neuronen: Perceptron, Linear, ReLU, Sigmoid, Tanh — gezeichnet wie im Feld, Formel, Kurve mit
   z-Regler, wofür/Achtung). Neue Typen kommen automatisch dazu, wenn sie in `activations` stehen und in
   `ORDER`/`INFO` (js/neuron.js) eingetragen werden.
2. **Netze bauen** — Kachel `b-frei`: das freie Feld, **Build · Run**, keine Szenarien. Eingänge 0–10,
   beliebig viele Schichten (bis `MAX_LAYERS` = 8, Spalte „+ Schicht“, leere Schicht „× Schicht entfernen“).
3. **Netze trainieren** — Kacheln = Szenarien (`sc-gatter`, `sc-ziffer`, `sc-ziel`, `sc-vogel`, `sc-eigene`).
   Nur Phase **Lernen**. Das Szenario legt **Eingänge** (Spalte links, gesperrt) und **Ausgänge** fest.
   **Ausgänge = eigene Spalte `.col-outputs` rechts** (2. Fassung 20.11.2026, Sönke: „ich will Input und Output haben und
   dazwischen die Schichten anlegen und dann ein Neuron an einen Out legen – AND aus Schicht 1, XOR aus Schicht 2“): je
   Ausgabe ein Steckplatz `.out-slot` (Name, Wert, Soll, × = lösen). Alle Spalten dazwischen sind gleichwertige
   Schichten („Schicht n“, Anzahl frei). Verbinden in zwei Tipps: Ausgang antippen → Neuron antippen, oder Wert-Kästchen
   am Neuron (`.out-port`) → Ausgang (`outPick`). Zuordnung `state.outMap[t] = {li, ni} | null` (gespeichert; alte Stände
   ohne outMap: letzte Schicht der Reihe nach, `defaultOutMap`), `cleanOutMap()` bei jedem render löst Verbindungen zu
   gelöschten Neuronen, `removeLayer` rückt sie nach. Ein Neuron hängt an höchstens einem Ausgang, kann aber zugleich
   weitergeben: `backwardPass` addiert Ausgangsfehler und Rückfluss aus der nächsten Schicht. Leitungen Neuron → Ausgang
   zeichnet `drawEdgeOverlay` (`.out-line`). „Leeres Netz“ = eine Schicht mit je einem Neuron pro Ausgang;
   „Bsp. Netz“ = `sc.example` (Schichten + Zuordnung, Gatter: AND/OR/NOT A aus Schicht 1, XOR aus Schicht 2) oder
   `hidden` + Ausgangsschicht. „+ Schicht“ steht immer hinter der letzten Schicht, vor den Ausgängen, und wandert mit
   dem Spaltenversatz (`data-off` an jeder Spalte, `applyColumnOffsets`). `.out-slot` zählt nicht als freie Fläche
   (`isFieldBackground`), sonst schluckt die Verschiebe-Geste den Tipp. Lernfenster frei verschiebbar wie immer.
   **Greifvögel** (`voegel`, neu): 180 echte Vögel (Datensatz „Hawks“, Lake MacBride, Iowa), Eingänge Flügel (dm)
   und Gewicht (kg), vier Ausgänge (je Art); Info-Kasten mit Diagramm, Fläche nach der Antwort des Netzes
   eingefärbt, „Richtig erkannt x von 180“.

**Leere Spalten** werden übersprungen (`prevActive`/`nextActive`): Kanten, Rechnen und Backprop gehen von der
vorigen Spalte MIT Neuronen aus. Nach jeder Änderung an der Anzahl `resyncAll()`.

## Raum und Freigaben

`?raum=lehrer|schueler` (sonst allein, alles offen), `?demo=1` = Schaufenster (alles offen, nichts gespeichert;
Lernen startet mit XOR als „Eigene Daten“, 2 → 3 → 3 → 1 tanh/sigmoid, `demoState`).
`skill_room_state.data.parts` = Bereichs-ids (`neuron` · `bauen` · `trainieren`) + Kachel-ids. Offen für die
Klasse, wenn Bereich UND Kachel geteilt sind; Bereich teilen nimmt alle Kacheln mit, wenn noch keine geteilt
ist. Fehlt `parts`: nur „Wie funktioniert ein Neuron?“. Die Szenario-Auswahl im Lernfenster zeigt nur
Freigegebenes (`scenarioAllowed`). Druck-Knopf nicht für Schüler. Botschaften: `nl:ready` (heraus),
`nl:cmd {parts}` (hinein), `nl:parts {parts}` (Lehrkraft teilt). Keine Migration.
**ids nie umbenennen** — sie stehen in laufenden Räumen.

## Speicher (je Gerät)

`neuron-sim-v2` = Netz aus „Netze bauen“ (der alte Schlüssel — wer schon ein Netz hatte, findet es dort),
`neuron-sim-v2-lernen` = Lernbereich, `nl.where` letzte Seite, `nl.print` Druckauswahl.

## Druckansicht

Knopf „Druck“ (Lehrkraft/allein): Spalten unsichtbar, alles auf Weiß, Lernfenster weg. Leiste „Aufs Blatt“:
Gewichte und Bias je als Zahl · Lücke · ohne, Aktivierung nur als „f(z)“ oder echt, Neuronen-Typ, Werte z/y′,
Eingabewerte; „Ausblenden“ nimmt die Leiste fürs Bildschirmfoto weg.

## Das Feld (Technik, unverändert)

**Single source of truth:** the `state` object in `app.js`. Every interaction mutates state and calls `render()`, which fully rebuilds the SVG and DOM from scratch (no partial updates).

**Two phases** (toggled via header buttons):
- `build` — edit weights, bias, connection topology, neuron type
- `run` — edit input values; neuron computes output automatically

**SVG neuron** is built entirely in JS (`renderSVG()`). Layout uses fixed logical coordinates (viewBox `0 0 500 380`). The ellipse has two clickable hit-areas (Σ left half, activation function right half) that open calculation popups.

**Feld = Fenster + Tafel (2026-08-19).** `#network` ist das Fenster (feste Höhe, `overflow:hidden`, fängt die Gesten), `#net-stage` die Tafel darin (`transform: translate()+scale()`, `transform-origin: 0 0`). Bewegt wird immer nur die Tafel als Ganzes.

*Warum keine Spalte mehr scrollt:* die Kanten liegen als **ein** SVG (`drawEdgeOverlay`) über der ganzen Tafel. Scrollte eine Spalte für sich, wanderten ihre Neuronen und die Kanten blieben liegen — die Linien zeigten ins Leere. Und weil `.col-body` seinen Inhalt zentriert, war der Überschuss oben durch Scrollen **grundsätzlich** nicht erreichbar: die ersten Neuronen einer vollen Schicht flogen aus dem Bild. Beides löst dieselbe Änderung — die Spalten wachsen mit ihrem Inhalt (kein `overflow`), die Tafel mit den Spalten, und die Ansicht zoomt darauf. Einzige Ausnahme: `.data-table-col .col-body` behält seine Leiste (an einer Tabelle hängt keine Kante, und 1500 CSV-Zeilen zögen die Tafel sonst meterhoch).

*Maßstab:* Anfang ist immer der volle Überblick, und solange `view.touched === false` zieht jedes `render()` nach — wer eine Schicht auf zehn Neuronen stellt, sieht danach das ganze Netz. Ab dem ersten eigenen Zoom gilt die eigene Wahl. Herauszoomen endet beim Überblick, `fitScale()` ist nach oben auf 1 gedeckelt (ein einzelnes Neuron wird nicht aufgeblasen). `syncStageHeight()` gibt der Tafel die Höhe, die nach dem Verkleinern gerade das Fenster ergibt — sonst schwebten die Spaltenkarten mit grauen Bändern darüber und darunter.

*Gesten:* zwei Finger schieben und zoomen zugleich (der Punkt zwischen den Fingern bleibt zwischen den Fingern), ein Finger schiebt nur auf freier Fläche (`isFieldBackground` — Neuronen und Spaltenköpfe behalten ihre eigene Geste), Strg/⌘ + Rad zoomt, das Rad allein schiebt und nur dann, wenn es etwas zu schieben gibt. Knöpfe − ⤢ + unten rechts.

⚠️ **Alle Zeiger-Listener der Gesten hängen in der CAPTURE-Phase.** Im Neuron sitzen Schaltflächen, die ihr `pointerdown` mit `stopPropagation()` abfangen (OUT-Umschalter, Eingabefelder) — beim Hochlaufen käme die Geste dort nie an, und das Feld ließe sich überall aufziehen außer dort, wo ein Neuron steht. Das war beim Bauen zweimal die Ursache.

⚠️ **`drawEdgeOverlay(net)` bekommt die TAFEL, nicht das Fenster.** Die Kanten liegen mit auf ihr und werden vom `transform` mitgezoomt — deshalb müssen sie beim Verschieben und Zoomen nicht neu gezeichnet werden. Gemessen wird in Bildschirmkoordinaten (`getBoundingClientRect`), umgerechnet über die Tafelecke und `view.scale`; Breite/Höhe des Overlays kommen aus `offsetWidth/offsetHeight` (ungezoomt). Wer dort etwas ändert, teilt Zeiger-Deltas ebenfalls durch `view.scale` — siehe `addPointerDrag` und `addColumnDrag`.

**`#learn-group` hängt am FENSTER, nicht an der Tafel** (`renderNetwork` hängt es an `#network` an). Es ist ein Bedienfeld wie die Kopfzeile; beim Herauszoomen wären seine Knöpfe nicht mehr zu treffen. Ein `position: fixed` innerhalb eines `transform()`-Elements wäre außerdem nicht mehr am Bildschirm, sondern an der Tafel festgemacht.

**Kästen und Kanten bleiben sichtbar (2026-11-01).** Prüfstand `tests/layout.test.mjs` (Playwright, 7 Bildschirmgrößen × 17 Aufbauten): Kästen in ihrer Spalte, Lernpanel im Bild, jede eingeschaltete Verbindung hat eine Linie ≥ 1 px auf dem Schirm, die an ihren Kästen hängt, keine überdeckten Gewichts-Beschriftungen. Vor jeder Änderung am Feld laufen lassen: `node MPSkills/tools/NeuroLab/tests/layout.test.mjs` (`FOTOS=1` legt Bildschirmfotos in `tests/fotos/` ab, nicht einchecken).
- *Kanten:* jede Verbindung wird gezeichnet, Gewicht < 0,01 gestrichelt und blass (vorher fiel sie weg). Strichstärke hat eine Untergrenze in Bildschirm-Pixeln: `--nl-edge-min` auf `#net-stage`, geteilt durch den Maßstab über `--nl-inv` (pflegt `applyView`). Beschriftungen verteilt `placeEdgeLabels` ohne Überdeckung (Neuronen/Eingänge sind Hindernisse, große Gewichte zuerst, kein Platz = keine Zahl); unter Maßstab 0,6 ausgeblendet (`.edge-labels-off`), in der Druckansicht immer an.
- *Nachmessen:* `observeLayout` hängt einen ResizeObserver an Fenster und Tafel, `relayout()` passt ein und zeichnet die Kanten neu (Schrift fertig geladen, Rahmenhöhe in MPSkills, vorher unsichtbarer Reiter).
- *In der Spalte:* `clampSpacings` zieht nach jedem Aufbau verschobene Neuronen/Eingänge (spacing, translateY) zurück in den Spaltenkörper. Eingangsspalte bis 190 px, lange Namen gekürzt mit Tooltip, im Build-Modus Pille statt Kreis.
- *Lernpanel:* `placeLearnGroup` hält die Gruppe ganz im Bild (ohne eigene Position rechtsbündig), Höhe endet am unteren Rand (`--lg-max`), der Rest scrollt.

**Inline editing** uses a single shared `<input id="inline-input">` that is repositioned via `getBoundingClientRect()` and committed on Enter/blur.

## Neuron-Typen

Rumpf leicht in der Typ-Farbe getönt (`.neuron-body` fill color-mix 10 %, Sönke 20.11.2026).

`activations` in `app.js` — je Eintrag `fn`, `formula`, `apply`, `shortLines`, `fullName`, `color`, `derivative`.

## Prüfstände

- `node MPSkills/tools/NeuroLab/tests/layout.test.mjs` — Kästen/Kanten/Lernfenster in 7 Größen × 17 Aufbauten
  (auch 6 Schichten, leere Spalte dazwischen, Greifvögel)
- `node MPSkills/tools/NeuroLab/tests/raum.e2e.mjs` — Freigaben Lehrkraft/Klasse, Szenario-Auswahl gefiltert,
  Schicht dazu/weg, fester Ausgang, Gatter inkl. XOR lernen, Greifvögel ≥ 93 %, Druckauswahl, Speicher je Bereich

`FOTOS=1` legt Bildschirmfotos in `tests/fotos/` ab (nicht einchecken).
Schaufenster: `MPSkills/preview/neurolab.js` (klickt `.tile[data-id]`, `#btn-home`, `#btn-run`,
`#learn-btn-start`/`-pause`, liest `#learn-loss-display` — diese ids nicht umbenennen).
