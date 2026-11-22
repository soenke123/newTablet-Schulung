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
| `js/neuron.js` | Bereich 1: „Wie arbeitet ein Neuron?“ (7 Schritte, `makeNeuron` mit + / − an jedem Wert, Rechnung `calcHTML`, Ebene `makePlane`, Modelle `ABS`/`PENG`) + „Alle Neuronen“ (Karten + Detail an den Pinguinen, nutzt `activations` aus app.js) |
| `js/daten.js` | Greifvögel (echte Messwerte) |
| `js/karte.js` | Bereich 2: Tal 12 × 10 km für „Das Revier der Wildkatzen“ – Grenzen `TRUTH`, Kameras `YEAR1`/`ALL`/`NOISY`/`TEST`, `makeMap` (Canvas: Gitter, Kameras als Dreieck/Kreis wie Teil 1, Geraden mit Nummer `num`, Fadenkreuz `at`, ziehbare Griffe `handles`, `tapCam`, `rings`, gelbe Fläche, gemalte Landschaft `reveal`) |
| `js/revier.js` | Bereich 2: „Das Revier der Wildkatzen“ (Kachel `v-revier`, 3 Schritte, Arbeitsblatt; nutzt `NLNeuron.makeNeuron`/`calcHTML` aus neuron.js) |
| `js/rechnen.js` | Bereich 2: „Netz durchrechnen“ (Kachel `v-rechnen`, wie Sönkes AB, Drucken) |
| `netz.css` | Übersicht-Ergänzungen, Szenario-Wahl, Revier, Rechnen, Druck der Blätter |
| `neuron.png` | altes Bild des Neurons – seit 20.11.2026 (2. Fassung) nicht mehr eingebunden |
| `Regen und Sonne.csv` | Beispiel-CSV fürs Hochladen (auch im Layout-Prüfstand) |
| `tool.js` | Brücke zum Raum (iframe, Höhe, Freigaben) |
| `js/theme.js` | Hell/Dunkel für gezeichnete Teile: setzt feste SVG-Farben (fill/stroke-Attribute) per Beobachter auf `var(--…)` um, `NLTheme.c('#hex', rolle)` für Canvas, Ereignis `nl:theme-redraw` |
| `showroom-optik.html` | Showroom der Optik (Heute · Vorschlag A · Vorschlag B, Zustände, Feld mit echtem XOR-Training) — A ist umgesetzt |
| `showroom-start.html` | Showroom der Startseite (22.11.2026: A Lernweg · B Labor · C Netz als Menü) — umgesetzt ist A mit dem dunklen Kopf aus B |
| `img/` | Sönkes Wildkatzen (`katze_steht/_sitzt/_laeuft.png` Original, `img/frei/*.webp` zugeschnitten); `katze_laeuft` auf der Startseite, die anderen für das Revier gedacht |

## Startseite: vier Kacheln (22.11.2026, ersetzt die drei Bereiche unten)

**Aussehen (22.11.2026 abends, `showroom-start.html`, Sönke: „Kopf von B, sonst A“):** dunkler Kopf „NeuroLab“ mit leuchtendem Netz
(bleibt in Hell UND Dunkel dunkel, Kopfzeile geht auf der Startseite mit, `.brand` dort ausgeblendet) · darunter, in den Kopf hineinragend,
der Lernweg 1 → 2 → 3 (Neuronen · Wildkatzen · Lernen) als Karten mit SVG-Bild oben (`SCENE` in start.js, Farben über `.hs-*` in netz.css,
Bewegung aus bei reduzierten Animationen/`data-motion="low"`), Kicker, Text, Chips, „Los →“; Teilen-Knopf oben rechts im Bild · „Frei bauen“
quer und orange als Spielwiese darunter. Keine Pinguine auf der Startseite; Karte 2 zeigt Sönkes laufende Wildkatze. Karten bleiben
`.tile[data-id]`, „Alle Neuronen“ bleibt `.tile-sub[data-open="n-typen"]` (Schaufenster/Tests). Nummern 1–3 stehen fest, auch wenn ein Schüler nur einen Teil sieht.

**Neuronen** (`n-wie` + Knopf „Alle Neuronen“) · **Wildkatzen** (`v-revier`) · **Lernen** (`trainieren`, Szenarien Gatter/Ziffer/Zielscheibe/Vögel
in `#scen-picker`, ohne CSV) · **Frei** (`b-frei`: Lernfeld mit Szenario `custom`, also freie Schichten + CSV-Upload + Training; eigener Stand
`neuron-sim-v2-frei`, `freeMode` in app.js; `scenarioAllowed` trennt: Lernen nie `custom`, Frei nur `custom`; Freigabe hängt an `b-frei`).
„Netz durchrechnen“ (`v-rechnen`, js/rechnen.js) hat KEINE Kachel mehr (Sönke: nur Übung auf dem Arbeitsblatt); Datei bleibt. Build/Run ohne Szenario
ist nicht mehr erreichbar (Area `bauen` im Feld bleibt im Code). `sc-eigene` ist aus dem Szenario-Wahl-Fenster entfernt. ⚠️ `tests/raum.e2e.mjs`
kennt noch die alte Startseite (v-rechnen, b-frei als Build/Run, sc-eigene) und muss angepasst werden.

## Phasen Build · Learn · Test (22.11.2026, Stufe 1)

Lernen und Frei (Area `lernen`) haben jetzt dieselben drei Phasen: **Build** (Schichten/Neuronen, Typ; Gewicht an der Kante und Bias antippen = `openValuePop`,
Feld mit − / + und Eintippen, keine Regler; `makePM`) · **Learn** (nur Training, Struktur gesperrt, Eingänge/Ausgänge vom Szenario) · **Test** (Eingaben mit
`makePM`, Schritt 1). Kopf: `#btn-build/#btn-learn/#btn-run` (Run heißt „Test“). Kein Szenario-Menü mehr im Lernfenster; Wechsel nur über „Szenario wählen“
(`start.js`: leaveArea + enterArea). Jedes Szenario hat sein Netz: `localStorage neuron-sim-v2-sc-<key>` (`scKey`, Frei = `custom`).
**Stufe 2 (Migration 0301, Prüfstand `supabase/tests/0301_neurolab_eingang.mjs`, Browser `tests/eingang.e2e.mjs`):** Schüler: Knopf `#btn-send`
„An Lehrkraft senden“ nur in Learn/Test (`canSend`, Raum + Szenario) → RPC `nl_send(p_token, p_scenario, p_payload)`; Tabelle `nl_inbox` je Teilnehmer + Szenario
eine Zeile (erneut senden überschreibt), Payload = `exportNet()` = `serializeState()` (Netz, Gewichte, Bias, Eingaben, Szenario, CSV-Daten), ≤ 300 KB, 400/Raum.
Lehrkraft: Knopf „Eingang“ `#btn-inbox` mit Zähler (Abfrage alle 6 s), Fenster `#inbox` mit Name · Szenario · Zeit, **Zeigen** (`nl_inbox_get` →
`App.openShared`: Kopie mit `viewOnly`, nichts wird im Gerät gespeichert, Titel „Mia · Logik-Gatter“, alle drei Phasen bedienbar) und **Löschen**
(`nl_inbox_delete`, nur aus ihrer Liste, Schüler behält sein Netz). Brücke: iframe ↔ `tool.js` mit `nl:rpc` / `nl:rpc:res` (nur die vier nl_*-Namen).
Freigaben in `0225_rechte_freigaben.json` eingetragen.

## Drei Bereiche (alter Stand der Startseite, Übersicht neu 21.11.2026)

Die Übersicht (Sönke 21.11.2026): **1** eine Kachel „Wie arbeitet ein Neuron?“ mit dem Knopf „Alle Neuronen ›“
darauf (`.tile-sub[data-open="n-typen"]`; `n-typen` hat keine eigene Kachel, `usable('n-typen')` = `usable('n-wie')`,
Teilen von `n-wie` teilt/entzieht beide) · **2** „Vom Neuron zum Netz“ (Bereichs-id bleibt `bauen`): Revier der
Wildkatzen · Netz durchrechnen · Freies Bauen · **3** „Netze trainieren“ als EIN Knopf `.tile[data-id="trainieren"]`
(zählt für die Lehrkraft „x von 5 Szenarien geteilt“); die Szenarien wählt man im Modus (`#scen-picker`, Karten
`.tile[data-id="sc-…"]`, dort auch Teilen je Szenario; Knopf „Szenario wählen“ `#btn-scen` in der Kopfzeile; vom
Übersichts-Knopf aus erscheint die Wahl immer, beim Wiederherstellen nicht; `where.sc` merkt das letzte).
Ansicht `netz` (`#netz-page`) für Revier und Rechnen.

1. **Wie funktioniert ein Neuron?** — Kacheln `n-wie` und `n-typen`. `n-wie` = **„Wie arbeitet ein Neuron?“** (5. Fassung,
   Sönke 20.11.2026 abends) in sieben Schritten, Leiste `.nn-step[data-step]`, Weiter/Zurück unten. Grundsatz: EIN Neuron
   als Komponente `makeNeuron(m, o)` (HTML über einem SVG für Leitungen, Fläche 720 × 285, Schrift wächst mit `cqw`),
   **keine Schieberegler daneben**: jeder Wert (x₁ x₂ w₁ w₂ b) hat rechts neben der Zahl ein kleines **+ über −**
   (`.nw-pms`, gedrückt halten = weiter); die Zahl antippen öffnet **direkt daneben einen senkrechten Regler** (`.nw-pop`
   mit `.nw-vs`, selbst gebaut: ziehen/antippen, Pfeiltasten = Reglerschritt, Bild auf/ab = ±-Schritt; schließt beim
   Tippen daneben). Darunter **immer die Rechnung** (`calcHTML(m, show)`): oben die Buchstaben, darunter an derselben
   Stelle die Zahlen, Formel-Schrift KaTeX (lokal `fonts/katex-math-3f1a2b.css`), Farben wie im Neuron: x orange `--in` ·
   w türkis `--accent` · b indigo `--bias` · y gold. Die „Blackbox“ ist nur ein Bild: Noch nicht Aufgedecktes ist **da,
   aber grau und im Nebel** (`data-show` 1–4, `data-part`, CSS-Übergang, vom vorigen Stand aus aufgedeckt, `lastShow`).
   **Zwei Modelle** (Zustand + Grenzen `lim` + Ebene `dom/ticks/snap`): `ABS` (Schritte 1–6, Zahlen −5 … 5) und `PENG`
   (Schritt 7 + „Alle Neuronen“: **30 echte Adelie-/Zügelpinguine**, Schnabellänge/-höhe in mm aus Nebeltal
   `js/welt.js` PENG_A/PENG_C, ausgesucht, dass eine Gerade sie trennt, z. B. w = (1, −1), b = −25; die Länge allein
   reicht nicht; Start w = (0,5; 0,5), b = −30 → 25 von 30). Schritte: 1 `bio` Nervenzelle ↔ Neuron nur zum Ansehen
   (`fixed` + `many`: vier Eingänge x₁–x₄ und „⋮“ ohne Zahlen, gerechnet wird nur mit x₁/x₂; Teil antippen = beide Seiten hervorgehoben) · 2 `in` (Text: „als Beispiel nur zwei Eingänge“) · 3 `w` („multipliziert“, Leitung dick/dünn, rot =
   negativ) · 4 `b` Summe & Bias (dazugezählt, kein Schwellen-Messer) · 5 `act` Treppe mit Punkt bei z · 6 `line`
   Neuron links, Ebene rechts (`makePlane(m)`: Punkt ziehen = Eingänge, Gerade schieben = Bias, runde Griffe drehen =
   Gewichte; gerechnet in Einheiten je Achse, damit es auch bei ungleich langen Achsen stimmt) · 7 `data` „Ein Neuron
   trifft eine Entscheidung“: Pinguine (Zügel = goldenes Dreieck, soll feuern; Adelie = Kreis), Bilder aus
   `../Nebeltal/img/frei/`, Pinguin antippen = Eingabe, „x von 30 richtig“, „Das Wichtigste“, darunter Karte `.nn-next`
   „Das war das einfachste Neuron: das Perzeptron – welche gibt es noch?“ mit Knopf zu `n-typen` (nur wenn freigegeben).
   **Keine Logik-Gatter (UND/XOR) und keine Sperber auf dieser Seite.** `n-typen` „Alle Neuronen“: Übersicht = je Typ eine
   Karte `.nt-card` (große Kurve `bigCurve` mit Achsen und Werten, Ausgabe, Formel der Aktivierung groß `.nt-formula` aus `F_TXT`, EIN Satz `KURZ`; nichts zum Einsatz – „Für komplexe Netze“ `DEEP` (0–3 Punkte + Satz) steht nur im Detail; Sönke: Übersicht sonst zu viel Text). Karten gleich breit (auto-fit), Formel immer einzeilig (Schrift wird per JS verkleinert, bis sie passt). Detail: Überschrift + Text nur in der linken Spalte (Diagramm beginnt oben), Formel klein im Neuron unter der Aktivierung (`.nw-fform`, nur `typed`), Rumpf leicht in der Typ-Farbe; antippen = Detail wie Schritt 7 mit diesem Typ (`PENG.type`,
   Neuron `typed`: Typ-Name + Kurve in Typ-Farbe, Ausgabe als Zahl, Sigmoid „x % Zügel“; Ebene färbt nach der Ausgabe:
   gold = positiv, grau = negativ, Stärke = Größe), oben Chips zum Umschalten (Gewichte bleiben → Unterschied sehen),
   Text `ANDERS` je Typ (die Gerade ist bei allen dieselbe, anders ist, was herauskommt) + Wofür/Achtung aus `INFO`.
   Neue Typen: in `activations`, `ORDER`, `INFO`, `KURZ`, `ANDERS`, `DEEP`, `FY`/`F_TXT` (js/neuron.js) eintragen.
2. **Vom Neuron zum Netz** (21.11.2026) — Grundsatz (Sönke): nicht ziehen und probieren, sondern **rechnen und
   sehen, was wo zusammenhängt**; keine UND/XOR-Begriffe (die gehören zu „Netze trainieren“).
   - `v-revier` **„Das Revier der Wildkatzen“** (`js/revier.js` + `js/karte.js`, Stand `localStorage nl.revier`, `v: 3` –
     ältere Stände werden verworfen): Försterin Jana, Wildtierkameras auf ganzen km (x₁ Osten, x₂ Norden).
     **3. Fassung (22.11.2026, Sönke: „Zahlen und Weights genau wie in der vorherigen Phase, auch die Bedienung“):**
     dieselben Bausteine UND dieselbe Bedienung wie „Wie arbeitet ein Neuron?“ – links das echte Neuron
     `NLNeuron.makeNeuron(m)` (editierbar: + / − und senkrechter Regler am Zahlenfeld, Grenzen in `model()`: w ±4 (0,5 / 0,05),
     b ±30 (1 / 0,25), x₁/x₂ = Kamera), darunter `calcHTML`, rechts die Karte; KEINE eigenen Eingabefelder mehr. Drei Schritte
     (die frühere „Kameras prüfen“-Aufgabe ist im Hilfe-Beispiel aufgegangen; Schritt-ids `fluss` · `stadt` · `jahr`, `jahr` bleibt
     wegen preview/neurolab.js):
     **1 Der Fluss** (29 Kameras `YEAR1`: weit verteilt, locker = jede zweite Kreuzung, im Süden ohne Revier): ① Die Kinder ziehen
     die Griffe **P und Q** auf der Karte (karte.js `handles`, rasten auf ganzen km ein); die **Funktionsgleichung**
     x₂ = m·x₁ + n steht sofort daneben (`eqOf`/`eqBox`, Brüche, senkrecht = x₁ = c). ② Umstellen → w₁, w₂, b im Neuron einstellen.
     **Prüfen**: die Gerade des Perzeptrons (und gelb) wird NUR gezeichnet, wenn alle Kameras stimmen UND die Gerade durch P und Q
     geht (Toleranz 0,45 km); Rückmeldung: durch P/Q?, Bleistiftlinie trennt?, falsche Seite → mal −1, x von 29. Werte oder Griffe
     ändern = Gerade wieder weg. Kamera antippen = Neuron rechnet sie (`tapCam`). **Hilfe: Beispiel** (`helpPanel`): Gerade durch
     (2|6) und (6|2) durchgerechnet mit festem Neuron w = (1, 1), b = −8.
     **2 Ein Jahr später** (80 Kameras `ALL`; Straße und Stadt kommen dazu, die Katzen halten 2 km Abstand: Stadt gemalt ab
     x₁ + x₂ > 17, das Revier endet bei 15): dieselbe Aufgabe dreimal. Netz-Bild `.rv-net` (Eingänge → Perzeptrons → Ausgang,
     „＋ Perzeptron“ antippen oder hineinziehen, max. 6); Perzeptron antippen = Kasten mit ① Gerade ziehen (Griffe in seiner Farbe)
     + Gleichung, ② Neuron einstellen (EIN Neuron-Objekt, wird umgefüllt), **Prüfen** (`checkHid`: alle Dreiecke auf der gelben
     Seite, ≥ 3 Kreise abgetrennt, durch P und Q) – erst dann ist es im Netz und seine Gerade eingezeichnet (`x.ok`). Das
     Fluss-Neuron aus Schritt 1 ist schon dabei, wenn es auch hier passt. Ausgang: v₁…vₙ und b mit `miniVal` (Zahl wie im Neuron,
     antippen = eintippen, + / −). Alle 80 richtig → Karte deckt sich auf (`paintLand`). „Musterlösung laden“ als kleiner Link.
     **3 Zu genau gelernt** (Overfitting zum Anfassen statt Kims Netz): fünf Ausreißer `OUTLIERS` (orange); jeder bekommt auf
     Antippen (Karte oder Chip) ein **Merk-Neuron** = Kreis r 0,85 km, in dem dessen Antwort gilt (`judgeWith`); Karten „Dein Netz“ /
     „Mit Merk-Neuronen“ (alte Kameras 75 → 80/80), Frage „Wird es auch bei neuen Kameras perfekt sein?“, „Neue Kameras aufstellen“
     (`TEST`: dein Netz 70/70, mit 5 Merk-Neuronen 59/70), Kurve alte/neue Kameras je Anzahl Merk-Neuronen (`drawCurve`, Punkt =
     aktueller Stand), Kasten Overfitting. `K.kim` bleibt in karte.js, wird nicht mehr benutzt. Knopf **„Arbeitsblatt“** unten in
     der Mitte (nicht Schüler): 3 Seiten (Karte ohne Landschaft + Aufgaben 1–4 + Lösungsseite), `#rv-print` + `html.rv-print-on`.
   - `v-rechnen` **„Netz durchrechnen“** (`js/rechnen.js`, wie Sönkes AB): Stufen „Ein Neuron“ (3 Eingänge,
     Perzeptron/Linear/ReLU) · „Ein Netz“ (3 → 3 → 1: Perzeptron, Sigmoid, ReLU gemischt, Ausgang linear, manchmal
     fehlt eine Leitung) · „Rückwärts“ (lineares Neuron, z gegeben, ein Gewicht „?“). Ganze Zahlen; Sigmoid ± 0,01,
     Ausgang dahinter ± 0,02. Prüfen · Lösung zeigen · Neue Aufgabe · Drucken (nicht Schüler, leere Felder).
   - `b-frei` **Freies Bauen** — das freie Feld, **Build · Run**, keine Szenarien. Eingänge 0–10,
   beliebig viele Schichten (bis `MAX_LAYERS` = 8, Spalte „+ Schicht“, leere Schicht „× Schicht entfernen“).
3. **Netze trainieren** — ein Knopf, Szenarien (`sc-gatter`, `sc-ziffer`, `sc-ziel`, `sc-vogel`, `sc-eigene`) in der Szenario-Wahl im Modus.
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
`skill_room_state.data.parts` = Bereichs-ids (`neuron` · `bauen` · `trainieren`) + Kachel-ids (`n-wie` `n-typen` ·
`v-revier` `v-rechnen` `b-frei` · `sc-*`). Räume, die vor dem 21.11.2026 nur `bauen` + `b-frei` geteilt hatten,
sehen Revier und Rechnen gesperrt, bis die Lehrkraft sie teilt. Offen für die
Klasse, wenn Bereich UND Kachel geteilt sind; Bereich teilen nimmt alle Kacheln mit, wenn noch keine geteilt
ist. Fehlt `parts`: nur „Wie funktioniert ein Neuron?“. Die Szenario-Auswahl im Lernfenster zeigt nur
Freigegebenes (`scenarioAllowed`). Druck-Knopf nicht für Schüler. Botschaften: `nl:ready` (heraus),
`nl:cmd {parts}` (hinein), `nl:parts {parts}` (Lehrkraft teilt). Keine Migration.
**ids nie umbenennen** — sie stehen in laufenden Räumen.

## Speicher (je Gerät)

`neuron-sim-v2` = Netz aus „Netze bauen“ (der alte Schlüssel — wer schon ein Netz hatte, findet es dort),
`neuron-sim-v2-lernen` = Lernbereich, `nl.where` letzte Seite (+ `sc` letztes Szenario), `nl.print` Druckauswahl,
`nl.revier` Stand im Revier der Wildkatzen.

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

## Aussehen (20.11.2026, „Vorschlag A“ aus showroom-optik.html)

- **Farben und Schriften wie Nebeltal** (Variablen in `style.css :root`: `--paper --surface --surface-2 --line --ink*
  --accent* --in* --neg* --gold* --bio*`; Space Grotesk, Zahlen in JetBrains Mono, beides lokal aus `fonts/`).
  Ein Akzent (Türkis hell / Mint dunkel); Orange = Eingänge, Rot = negative Gewichte, Gold = „feuert“ auf der
  Neuronen-Seite, Lila = Nervenzelle. Alte Namen (`--build-color`, `--learn-color` …) zeigen auf die neuen.
- **Hell/Dunkel:** im Raum vom Rahmen (`data-theme` am `<html>` des Rahmens, Skript im `<head>` von index.html
  übernimmt es und beobachtet Änderungen), allein vom Gerät (`prefers-color-scheme`). **Druckansicht immer hell**
  (`body.print-mode` setzt die hellen Werte). Neue feste Farben in CSS: immer als `var(--…)`. In JS-SVGs dürfen
  Hex-Farben stehen, wenn sie in der Tabelle von `js/theme.js` stehen (sonst bleiben sie fest); Canvas über `NLTheme.c`.
- **Das Neuron** (`buildNeuronSVG`, gemeinsames Innenleben `appendNeuronFace`/`paintNeuronFace`): weißer Kasten, Typ-Name klein darüber (Mono, Versalien),
  Trennlinie bei 40 % (`SPLIT_X`): links Σ und `z = …`, rechts die **Kurve des Typs mit einem Punkt an der Stelle z**
  (z von −4 bis 4, Wertebereich `actRange`) und darunter `y′ = …`. **Die Formel steht nicht mehr im Neuron**, sondern
  im Fenster beim Antippen (und in der Druckansicht, dort weiter Σ | f(z) in zwei Hälften). Wert-Kästchen rechts
  füllt sich mit dem Wert (`outFrac`), `is-hot` (Wert über der Mitte, `isHot`) = Rand im Akzent, im Dunkeln leichtes
  Leuchten. Ausgang beim Lernen: Rahmen in der Fehlerfarbe (`errColor`), Name darüber.
- **Zahlen im Neuron, an den Kanten und in den Ausgängen:** `fmtV(n, d = 4)` = im Feld höchstens vier
  Nachkommastellen (wie früher), aber 1 statt 1,0000 und 1,3 statt 1,3000, mit Komma und echtem Minus (Sönke
  20.11.2026); auf der Neuronen-Seite `fmtV(x, 2)`. `fmt` (Punkt, 4 Stellen) bleibt für Eingabefelder, Fenster und
  Lernfenster. Kanten-Zahlen weichen Rumpf, Wert UND Bias-Zeile aus (Hindernis bis viewBox-y 140).
- **Kanten:** Farbe = Vorzeichen (Akzent +, Rot −, grau gestrichelt ≈ 0), Dicke = |w|; Beschriftung als Pille.
- **Feld:** Punktpapier, Spalten als Bahnen (nur Kopf in Mono-Versalien und feine Trennlinie), Ausgänge und
  Datentabelle bleiben Karten. Startseite: Bereiche nummeriert wie der Lernpfad in Nebeltal (CSS-Zähler), Kachel =
  Symbol im getönten Feld + Text.

## Neuron-Typen

`activations` in `app.js` — je Eintrag `fn`, `formula`, `apply`, `shortLines`, `fullName`, `color`, `derivative`.

## Prüfstände

- `node MPSkills/tools/NeuroLab/tests/layout.test.mjs` — Kästen/Kanten/Lernfenster in 7 Größen × 17 Aufbauten
  (auch 6 Schichten, leere Spalte dazwischen, Greifvögel)
- `node MPSkills/tools/NeuroLab/tests/raum.e2e.mjs` — Freigaben Lehrkraft/Klasse (n-typen hängt an n-wie, Szenario-Wahl
  im Modus), Revier der Wildkatzen ganz durch (Griffe ziehen, Gleichung, Neuron einstellen, falsche Seite, Netz 80/80, Karte, Merk-Neuronen 70 > 59), Netz
  durchrechnen, Szenario-Auswahl gefiltert,
  Schicht dazu/weg, fester Ausgang, Gatter inkl. XOR lernen, Greifvögel ≥ 93 %, Druckauswahl, Speicher je Bereich

`FOTOS=1` legt Bildschirmfotos in `tests/fotos/` ab (nicht einchecken).
Schaufenster: `MPSkills/preview/neurolab.js` (klickt `.tile[data-id]`, `.tile-sub[data-open="n-typen"]`,
`#scen-picker .tile[data-id]`, `.nn-step[data-step]`, `#btn-home`, `#btn-run`,
`#learn-btn-start`/`-pause`, liest `#learn-loss-display` — diese ids nicht umbenennen).
