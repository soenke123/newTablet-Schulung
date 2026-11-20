# NeuroLab neu — Konzept (Entwurf 20.11.2026)

> **Abgelöst (20.11.2026, abends).** Die Neufassung nach diesem Plan (eigenes Feld, viele feste
> Aufgaben, Andocken, Stationen) war Sönke zu weit weg vom alten NeuroLab und zu gesteuert. Stattdessen
> ist das **alte NeuroLab zurück und verbessert** (siehe CLAUDE.md): Startseite mit drei Bereichen —
> „Wie funktioniert ein Neuron?“ (kurz: Bild, Ausprobieren, EINE Impulsaufgabe + Liste aller
> Neuronen-Typen) · „Netze bauen“ (freies Feld, Build · Run, keine Szenarien) · „Netze trainieren“
> (Szenario legt Ein-/Ausgänge fest, Schichten/Neuronen frei, verschiebbares Lernfenster, CSV-Upload
> bleibt). Übernommen aus diesem Plan: Freigaben je Bereich/Kachel, Greifvögel, Druckauswahl.
> Der Rest unten ist nur noch Hintergrund.

Ziel: NeuroLab auf das Niveau von Nebeltal / Reinforce Yourself / Tiny LM bringen.
Mehr Struktur, die die Lehrkraft vorgibt, neue Szenarien, klare Trennung von
**Aufbau** und **Training**, und eine eigene Seite zum Neuron.

## 1. Was heute hakt

| Problem | Ursache |
|---|---|
| Build · Run · Lernen wirken wie drei gleichrangige Modi, sind aber zwei Themen | „Run“ gehört zum Aufbau (vorwärts rechnen), „Lernen“ zum Training — beide teilen sich „Build“ |
| Bei XOR/AND usw. muss man die richtige Neuron-Reihenfolge treffen | Ausgänge sind Positionen (`outputIndices`, „L0N0 = AND“), nicht Plätze, an die man etwas hängt |
| Keine Führung | Ein leeres Feld mit Dropdown; die Lehrkraft kann nichts freigeben oder sperren |
| Wirkt wie ein Werkzeug, nicht wie ein MPSkills-Skill | Kein Startbildschirm, kein Lernpfad, kein Dark Mode, keine Bilder, keine Tour |
| Das Neuron selbst wird nirgends erklärt | Popups mit Formeln, aber kein Ort zum Erarbeiten |

## 2. Neue Gliederung: drei Bereiche statt drei Knöpfe

Startseite wie Nebeltal: **Lernpfad** (Vorgabe) | **Freie Nutzung**, Lehrkraft schaltet um,
Tablets folgen (`skill_room_state.data.view`). Jede Kachel teilt die Lehrkraft einzeln
(Teilen-Symbol → `data.parts`, sonst Schloss) — dieselbe Mechanik wie Reinforce/Nebeltal,
keine Migration nötig.

```
 ① DAS NEURON          ② NETZE BAUEN                 ③ NETZE TRAINIEREN
 (verstehen)           (Gewichte von Hand)            (das Netz stellt sie selbst ein)
 ─────────────         ────────────────────           ─────────────────────────────
 Erklärseite mit       Bauen  →  Testen               Bauen  →  Trainieren
 Stationen             Rätsel mit festen Ausgängen    Daten · Fehler · Lernrate
```

- **Bauen** gibt es in beiden Bereichen, aber mit klarem Unterschied:
  - in ② heißt der zweite Schritt **Testen** (heute „Run“): die ganze Wertetabelle läuft
    durch, jede Zeile bekommt ✓/✗. Rätsel gelöst = alle Zeilen ✓ → Stern.
  - in ③ heißt er **Trainieren** (heute „Lernen“): Gewichte sind nicht mehr von Hand
    einstellbar (nur ansehen), stattdessen Lernrate, Start/Pause, Schritt, Fehlerkurve.
- Der Kopf zeigt immer den Bereich + die Aufgabe: „Netze bauen · Rätsel 3: XOR“
  mit „‹ Übersicht“ und „Aufgabe“ (wie Reinforce).

## 3. Feste Ausgänge zum Andocken (Kernänderung)

Jedes Szenario legt seine Ausgänge fest. Sie stehen rechts als **Steckplätze** und
gehören zum Szenario, nicht zum Netz:

```
 Eingänge        Hidden            Ausgänge (fest)
 ( A )──┐      ┌─[ N ]─────────●──▶ [ AND  ]  Soll: 0 0 0 1
        ├──────┤                    [ OR   ]  ◌  (leer — Neuron hierher ziehen)
 ( B )──┘      └─[ N ]──●──────────▶ [ XOR  ]
```

- Man zieht vom Ausgangspunkt eines Neurons (●) eine Leitung auf einen Steckplatz
  (oder antippt Neuron → Steckplatz, fürs Tablet). Reihenfolge der Neuronen ist egal.
- Ein Steckplatz nimmt genau ein Neuron; ein Neuron kann auch Zwischen-Neuron
  bleiben UND (bei XOR in Hidden) gleichzeitig weiterleiten.
- Steckplatz zeigt Name, aktuellen Wert und Soll (in ② Wertetabelle als Mini-Spalte).
- Datenmodell: `outputs: [{ key:'and', label:'AND', neuron: {l:0,n:2} | null }]`
  statt `outputIndices`. Training rechnet den Fehler nur an belegten Plätzen.
- Leerer Platz = gelber Hinweis „Noch kein Neuron angeschlossen“.

## 4. ① Das Neuron — Erklärseite zum Erarbeiten

Eigene Seite mit Stationen (Bild + kurzer Text + interaktives Mini-Neuron je Station):

1. **Vom Nervenzelle zum Neuron** — Bild Nervenzelle ↔ Kreis (Dendriten = Eingänge, Axon = Ausgang)
2. **Gewichte** — zwei Eingänge, Regler am Gewicht, Balken „wie wichtig“
3. **Summe** — z = w₁x₁ + w₂x₂, Zahlen laufen sichtbar zusammen
4. **Bias / Schwellenwert** — „wie leicht feuert das Neuron?“
5. **Aktivierungsfunktion** — Stufe, Sigmoid, ReLU als Kurve mit Punkt, der mitläuft
6. **Ein Neuron = eine Gerade** — Brücke zu ③: zwei Eingänge als Fläche, das Neuron teilt sie

**Lehrkraft verteilt die Stationen** (das meinst du mit „bestimmen, welche Schüler was
bekommen“, wenn ich dich richtig verstehe):
- *Alle alles* (Standard), oder
- *Gruppenpuzzle*: Lehrkraft legt 2–5 Expertengruppen an, jedes Tablet bekommt
  eine Station (automatisch reihum oder per Ziehen der Namen), danach „Alle
  Stationen freigeben“ für die Stammgruppe.
  Speicherung in `data.neuron = { mode:'puzzle', groups:{...}, assign:{participant:station} }`
  → braucht nur die Teilnehmerliste, keine eigene Tabelle.
- Jede Station endet mit einer Mini-Aufgabe („Stelle die Gewichte so ein, dass …“) ✓.

## 5. ② Netze bauen — Szenarien (Gewichte von Hand)

Rätsel mit fester Wertetabelle, aufsteigend; Lehrkraft gibt frei, optional sperrt sie
Teile (z. B. „Aktivierung fest: Stufe“, „höchstens 1 Neuron“):

| # | Rätsel | Eingänge → feste Ausgänge | Lernziel |
|---|---|---|---|
| 1 | Freibad? | Sonne, Ferien → Ja/Nein | ein Neuron = Entscheidung mit Gewichten |
| 2 | AND, OR, NOT | A, B → AND · OR · NOT A | Bias als Schwelle |
| 3 | Mehrheit | A, B, C → „mind. 2 von 3“ | Gewichte gleich, Schwelle verschieben |
| 4 | Rauchmelder | Rauch, Hitze, Kochen → Alarm | negatives Gewicht = hemmend |
| 5 | XOR | A, B → XOR | geht nicht mit einem Neuron → Hidden nötig |
| 6 | Halbaddierer | A, B → Summe · Übertrag | zwei Ausgänge, Neuronen wiederverwenden |
| 7 | 7-Segment | 7 Segmente → „ist gerade?“ / Ziffer | viele Eingänge |

Jedes Rätsel: Wertetabelle rechts, ✓ je Zeile, Stern bei Erfolg, Tipp-Knopf (gestuft).
Bonus-Wertung „mit wie wenigen Neuronen?“.

## 6. ③ Netze trainieren — Szenarien

### 6a. Neu: „Arten trennen“ (Trennlinien) — Herzstück
Wie „Pinguine sortieren“ in Nebeltal, aber andere Tiere, damit es eine Verbindung gibt
und keine Wiederholung ist. **Umgesetzt: Greifvögel** (echte Daten „Hawks“, Lake MacBride/Iowa: Eckschwanzsperber ♂/♀,
Rundschwanzsperber, Rotschwanzbussard; Flügel, Gewicht, Schwanz).

Bildschirm zweigeteilt:
- links das Netz (wie heute, mit festen Ausgängen „Hecht“ / „Brasse“ / …)
- rechts das **Diagramm** (Länge × Höhe), Punkte = Fische mit Bildchen, Hintergrund
  eingefärbt nach Vorhersage, **jedes Neuron der ersten Schicht = eine Linie**
  in seiner Farbe. Neuron antippen → seine Linie leuchtet; Linie ziehen → Gewichte ändern sich mit.

Stufen:
1. **Hecht vs. Brasse** (lang/dünn vs. hoch) — 1 Neuron, Linie von Hand ziehen, dann trainieren
2. **Barsch vs. Rotauge** — überlappt → Fehler bleibt > 0, „Daten sind nicht perfekt“
3. **Drei Arten** — 3 Ausgänge (fest), Softmax-artig „wer ist am sichersten“
4. **Eine Art in der Mitte** (z. B. mittelgroße Barsche zwischen kleinen und großen
   Fischen) — eine Linie reicht nicht → 2 Hidden-Neuronen = 2 Linien → Band.
   Gleiche Einsicht wie XOR in ②, jetzt mit Daten.
5. **Überanpassung**: Trainings- vs. Testfische (andere Farbe), zu viele Neuronen →
   Testfehler steigt wieder.

### 6b. Weitere Trainings-Szenarien
- **Logikgatter lernen** — die Rätsel aus ② jetzt vom Netz lösen lassen (Vergleich „du vs. Training“)
- **Zielscheibe** (vorhanden) — Kreis aus Linien, viele Neuronen
- **7-Segment** (vorhanden)
- **Kurve nachbauen** — Regression: Punkte einer Wurfbahn, ReLU-Knicke werden sichtbar
- **Eigene Daten** (CSV, vorhanden) — nur Freie Nutzung / Lehrkraft

### 6c. Trainieren besser sichtbar machen
- **Ein Schritt in Zeitlupe**: ein Beispiel geht durch → Fehler am Ausgang → Pfeile
  laufen rückwärts → jedes Gewicht bekommt + / − (Brücke zur Lernregel aus Nebeltal-Erarbeitung)
- Fehlerkurve + Genauigkeit in %, Epoche als „einmal alle Fische angeschaut“
- Lernrate-Regler mit Warnhinweis bei Zappeln (Verbindung zum Nebeltal-Springen)

## 7. Lehrkraft-Struktur (Zusammenfassung)

- Lernpfad mit Halten: **Einstieg** (Neuron) → **Bauen** (Rätsel 1–5) → **Übergang** (XOR
  geht nicht → Netz trainieren) → **Training** (Arten trennen 1–4) → **Vertiefung**
  (Überanpassung, Zielscheibe, eigene Daten). „i“ mit Ziel/Ablauf/Impuls nur für die Lehrkraft.
- Teilen je Kachel, Freie Nutzung zeigt alles Geteilte.
- Vorgaben je Rätsel: Aktivierung fest, max. Neuronen, Gewichte sichtbar ja/nein.
- **Klassenblick** (Etappe 3, braucht Migration): Tablets melden „Rätsel gelöst / Fehler“;
  Lehrkraft sieht eine Matrix Schüler × Aufgaben und kann ein Schülernetz an den Beamer holen.
- Arbeitsblatt-Knopf nur für die Lehrkraft (wie Wild Clusters / Reinforce).
- Druckansicht bleibt (für Klausuren).

## 8. Technik & Look

- Weiter im iframe (`?raum=lehrer|schueler`, `?demo=1`), Brücke wie Tiny LM/Reinforce
  (`postMessage` für Rolle, Theme, `data.parts`/`data.view`).
- MPSkills-Farben + Hell/Dunkel vom Rahmen, eigene Akzentfarbe, Bild je Kachel.
- `app.js` (4 700 Zeilen) aufteilen: `js/netz.js` (Rechnen, Training — ohne DOM, testbar),
  `js/feld.js` (Zeichnen, Zoom, Gesten — das Bewährte aus app.js übernehmen),
  `js/szenarien.js`, `js/neuron.js` (Erklärseite), `js/diagramm.js` (Trennlinien),
  `js/start.js` (Lernpfad/Kacheln).
- Stand je Gerät in localStorage (`nl.*`), alter Stand `neuron-sim-v2` wird nicht übernommen.
- Prüfstände: `tests/netz.test.mjs` (Vorwärts/Backprop, Steckplätze), `layout.test.mjs` bleibt.

## 9. Etappen

1. **Gerüst + Bauen**: Startseite/Lernpfad, Teilen, Steckplätze, Bauen→Testen mit Wertetabelle, Rätsel 1–6
2. **Training + Arten trennen**: Diagramm mit Linien, Fisch-Daten, Stufen 1–4, Zeitlupe
3. **Das Neuron**: Erklärseite mit 6 Stationen, Gruppenpuzzle
4. **Klassenblick** (Migration), Arbeitsblatt, Schaufenster/Tour, Avatare

## Offene Fragen an Sönke

1. Fische als „Arten“ ok — oder lieber andere Tiere (Robben, Vögel, Käfer, ausgedachte Wesen)?
2. „Lehrkraft bestimmt, welche Schüler was bekommen“ = Gruppenpuzzle (Stationen verteilen)? Oder etwas anderes?
3. Altes NeuroLab ganz ersetzen — oder als „Freies Labor“ (alles offen, CSV, Druck) behalten?
4. Mit welcher Etappe anfangen?
