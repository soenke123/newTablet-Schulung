# NeuroLab — CLAUDE.md

Neuronale Netze zum Anfassen (MPSkills, Informatik · Künstliche Intelligenz).
**Neu gebaut am 20.11.2026**: Das alte Einzelprogramm (Build · Run · Lernen, `app.js` mit 4 700 Zeilen,
CSV-Upload) ist ersetzt. Plan und Begründung stehen in `PLAN_NEUROLAB_NEU.md`.

## Aufbau

Eigene Seite im `<iframe>` (wie Reinforce Yourself), `tool.js` ist nur die Brücke zum Raum.

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst: Kopfzeile, drei Bildschirme (home · neuron · work), Editor, Druckansicht, Dialog |
| `css/nl.css` | ganzes Aussehen, MPSkills-Farben, Hell/Dunkel vom Rahmen (`data-theme`), `@media print` |
| `js/netz.js` | Rechenmodell **ohne DOM**: forward, gradients, apply, evaluate, randomize (läuft auch unter Node) |
| `js/daten.js` | Greifvögel (echte Messwerte) und Zielscheibe |
| `js/szenarien.js` | Bereiche (`AREAS`) und alle Aufgaben (`S`) |
| `js/feld.js` | das Netz als SVG: Kanten, Neuronen, feste Ausgänge, Andocken, Bau-Knöpfe |
| `js/plot.js` | Diagramme: Fläche (2D, eine Gerade je Neuron), Würfel (3D, Ebenen, drehbar), Kurve, Fehlerkurve |
| `js/neuron.js` | Bereich 1 „Das Neuron“: sechs Stationen mit Aufgabe, die sich selbst prüft |
| `js/druck.js` | Druckansicht (nur Lehrkraft/allein) mit Auswahl, was aufs Blatt kommt |
| `js/app.js` | Startseite, Freigaben, Arbeitsfläche, Editor, Testen, Training, Zeitlupe, Speicher |

## Drei Bereiche

1. **Das Neuron** (`n1`–`n6`): Nervenzelle → Neuron · Gewichte · Summe & Bias · Aktivierung · Gerade · Netz (Quiz).
2. **Netze bauen** (`b-*`): Schritt *Aufbauen* (Neuronen/Schichten, Gewichte, Andocken) → *Testen*
   (Werte fließen, Wertetabelle mit ✓/✗ bzw. Trefferquote). Gewichte stellt man von Hand ein, in beiden Schritten.
   Vorgaben je Aufgabe in `rules`: `acts` (erlaubte Aktivierung), `maxNeurons`, `maxLayers`, `fixed` (Aufbau steht).
3. **Netze trainieren** (`t-*`): Schritt *Aufbauen* (nur Aufbau + Aktivierung + Andocken, Gewichte gewürfelt) →
   *Trainieren* (Lernrate, Tempo, Fehlerkurve, Training/Test richtig, Zeitlupe). Jede Bau-Änderung würfelt neu.

**Feste Ausgänge**: Jede Aufgabe legt `outputs` fest. Im Netz hängt `outputs[k].src = { l, n }` — die Reihenfolge
der Neuronen ist egal (das war das Problem bei XOR/AND im alten NeuroLab). Andocken: Punkt rechts am Neuron
auf den Ausgang ziehen, ODER Punkt antippen und dann Ausgang antippen, ODER im Editor „An Ausgang andocken“.
Ein Neuron hängt höchstens an einem Ausgang, darf aber zugleich weiterleiten. Fehler/Training nur an
angeschlossenen Ausgängen.

**Greifvögel** (`daten.js`): Datensatz „Hawks“ (Cornell College, Lake MacBride, Iowa; R-Paket Stat2Data),
45 je Gruppe, Messfehler entfernt. Gruppen: Eckschwanzsperber ♂ · ♀ · Rundschwanzsperber · Rotschwanzbussard —
sie liegen wie Perlen auf einer Kette, deshalb: 1 Gerade (Bussard/Sperber), 2 Geraden (Vogel in der Mitte),
3 Geraden (vier Gruppen), mit Schwanzlänge Ebenen im Raum. Jeder vierte Vogel ist Testvogel (`test: true`),
bei Trainings-Aufgaben zählt für den Stern die Test-Trefferquote.

## Raum und Freigaben

`?raum=lehrer|schueler` (sonst allein, alles offen), `?demo=1` = Schaufenster (alles offen, Speicher nur im
Arbeitsspeicher, `sc.demo()` liefert fertig aufgebaute Netze).
`skill_room_state.data.parts` = Bereichs-ids + Kachel-ids. Offen für die Klasse, wenn Bereich UND Kachel geteilt
sind. Fehlt `parts`: nur „Das Neuron“. Bereich teilen nimmt alle seine Kacheln mit, wenn noch keine geteilt ist.
Botschaften: `nl:ready` (heraus), `nl:cmd {parts}` (hinein), `nl:parts {parts}` (Lehrkraft teilt). Keine Migration.
**Kachel-ids nie umbenennen** — sie stehen in laufenden Räumen.

## Speicher (je Gerät)

`nl.sc.<id>` Netz + Schritt + Trainingsstand · `nl.done` Sterne · `nl.where` letzte Seite · `nl.seen.<id>`
Aufgabe gezeigt · `nl.print` Druck-Auswahl. Der alte Schlüssel `neuron-sim-v2` wird nicht mehr gelesen.

## Druckansicht

Knopf „Druck“ (nicht für Schüler). Auswahl: Überschrift, Aufgabentext, Gewichte (Zahlen · Lücken · ohne),
Bias (dto.), Aktivierung (echte Funktion · nur „f(z)“), Ausgänge/Leitungen, Eingabewerte, Werte z/y der
ausgewählten Zeile, Schwarz-weiß, Wertetabelle (Spalte „ist“ leer/ausgefüllt/ohne), Diagramm. A4 über `@media print`.

## Neue Aufgabe

Eintrag in `szenarien.js` mit `add({...})` und die id in `AREAS[..].items`; `art` = Kachelbild (in `app.js art()`).
Für Trainings-Aufgaben in `tests/netz.test.mjs` eine `train(...)`-Zeile ergänzen, damit das Ziel erreichbar bleibt.

## Prüfstände

- `node MPSkills/tools/NeuroLab/tests/netz.test.mjs` — Rechenmodell, Andocken, alle Trainings-Ziele erreichbar
- `node MPSkills/tools/NeuroLab/tests/raum.e2e.mjs` — Browser: Freigaben Lehrkraft/Klasse, Andocken (Ziehen +
  Antippen), Testen, Training, Zeitlupe, Druck, Station 5, hochkant (`FOTOS=1` → `tests/fotos/`, nicht einchecken)

Schaufenster: `MPSkills/preview/neurolab.js` (klickt nur über `.tile[data-id]`, `#steps`, `#train-go`,
`#slow-btn`, `#slow-next`, `#back`, liest `#stat-test` — diese ids nicht umbenennen).
