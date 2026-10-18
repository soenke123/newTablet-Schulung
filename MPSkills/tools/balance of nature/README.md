# Balance of Nature – Inselökosystem

Simulation für den Biologieunterricht: Auf einer fiktiven, abgelegenen Insel lebt ein eigenes
Ökosystem. Erst beobachtet man es ungestört, dann kommen Siedler und bringen fremde Arten mit.
Das Konzept steht in [`docs/KONZEPT.md`](docs/KONZEPT.md).

**Aktueller Stand: Stufe 1, die Insel lebt.** Die Insel entsteht aus einem Seed: Küste mit
Halbinseln und Flussmündungen, Bergketten, Vulkan mit Kratersee, Seen und Flüsse, Regenschatten
hinter den Bergen und daraus die Lebensräume. Darauf leben vier heimische Arten: Zwerghirsche in
Herden, Laufvögel mit Bodennestern, Inselwölfe in Rudeln mit Revieren und Inseladler-Paare.
Dazu kommen Pflanzen und Insekten als Nahrungsschichten. Die Arten stehen in
[`data/arten.md`](data/arten.md).

## Starten

`index.html` per Doppelklick öffnen. Es gibt keinen Server, keinen Build und keine Abhängigkeiten.

| Aktion | Desktop | Tablet |
|---|---|---|
| Verschieben | Ziehen | ein Finger |
| Zoomen | Mausrad, Doppelklick | zwei Finger |
| Gesamtansicht | Taste `R` oder „Ansicht zurücksetzen“ | Button |
| Lebensraum, Nahrung oder Tier ablesen | Zeiger über die Karte | – |
| Einem Tier folgen | Tier anklicken (Ziehen oder ✕ beendet es) | Tier antippen |
| Start/Pause | Leertaste oder „Start“ | Button |
| Nahrung auf der Karte zeigen | „Karte“ oben: Nahrung (alles) oder eine Schicht | dito |

## Simulation

- **Tempo-Regler:** von „ein Tag dauert mehrere Sekunden“ (Jagden einzeln verfolgen) bis zu
  mehreren Jahren pro Sekunde. **„+1 Tag“** geht genau einen Tag weiter, **„⏩ 5 Jahre“** spult
  ohne Zeichnen vor.
- **Jahreswetter:** gute und magere Jahre, milde und harte Winter, ab und zu ein **Mastjahr** mit
  massenhaft Früchten. Es steht unter der Uhr und ist in den Diagrammen hinterlegt (gelb: Mastjahr,
  blau: harter Winter).
- **Bestand** je Art mit Jungtieren und Zahl der Gruppen, dazu Diagramme für Pflanzenfresser,
  Räuber und Nahrung (beim Überfahren werden die Werte eines Tages angezeigt) und eine Tabelle
  der Todesursachen.
- **Startbestand:** ein Regler je Art. Die empfohlenen Werte passen zur Inselgröße und sind auf
  dem Regler gelb markiert. Vor dem Start wirkt eine Änderung sofort, danach über „Neu
  starten“. „Empfohlene Werte“ setzt zurück. **„Daten herunterladen (CSV)“** liefert die
  Zeitreihe für Excel.
- Gleicher Seed und gleiche Startwerte ergeben **auf jedem Gerät** denselben Verlauf, egal wie
  schnell die Simulation läuft. Dafür nutzt das Modell eigene, exakt festgelegte
  Mathe-Funktionen (`js/core/dmath.js`).

Der Seed und die Größe stehen in der Adresszeile (`#seed=482917&size=mittel`). Gleicher Seed
bedeutet dieselbe Insel.

## Lebensräume

Neuseeland als Vorbild, mit einigen fantasievollen Zuspitzungen:

| Lebensraum | Entsteht wo |
|---|---|
| Lagune, Strand | Küste |
| Tussock-Grasland | trocken, vor allem im Regenschatten östlich der Berge |
| Buschland | mittlere Feuchte |
| Farnwald | feucht, tief bis mittelhoch |
| Moosnebelwald | feucht und hoch |
| Flachs-Sumpf | sehr feucht, flach, nahe Fluss oder See |
| Bergland, Gipfel | Bergketten und Vulkan |
| Thermalfeld | an den Flanken des Vulkans |
| See, Fluss | Senken und Abflussrinnen |

## Prüfen (Node)

```
node tools/smoketest.js 20                     # 20+ Seeds: Reproduzierbarkeit, Landanteil, Lebensräume, Laufzeit
node tools/balance.js 8 30                     # 8 Inseln × 30 Jahre: Überleben alle Arten?
node tools/balance.js 1 30 --verlauf --seed=1000   # Bestände Jahr für Jahr, Todesursachen
node tools/shot.js out.png 482917 mittel       # Screenshot der echten Seite (headless Chromium, Playwright)
node tools/shot.js out.png 482917 mittel 3.5 0.5 0.6   # vergrößerter Ausschnitt um (0.5, 0.6)
node tools/shot.js out.png 482917 mittel 1 0.5 0.5 600  # nach 600 simulierten Tagen
```

## Herkunft

Die Basis (`js/core/`, `js/render/camera.js`) stammt aus Wild Clusters
(`newTablet-Schulung/MPSkills/tools/wildclusters`), dort mit dem Namespace `WL`, hier mit `BT`.
Auch die Tierbilder in `assets/` kommen vorerst von dort (Reh, Storch, Fuchs, Bussard).
