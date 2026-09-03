# Wild Clusters – Unbekanntes Ökosystem

Lernspiel zum **unüberwachten Lernen / Clustering**. Schülerinnen und Schüler beobachten später
unbekannte Tiere in einer Top-Down-Welt und gruppieren sie allein anhand ihres Verhaltens.

**Aktueller Stand: Phase 3 – Gruppieren.** Alle acht Arten der Tiersimulation laufen (Ente,
Barsch, Reh, Wildschwein, Kaninchen, Fledermaus, Dachs, Fuchs), und die Signale lassen sich per
Ziehen zu Clustern zusammenfassen. Bewertet wird noch nicht.

## Starten

`index.html` per Doppelklick öffnen. Kein Server, kein Build, keine Abhängigkeiten –
deshalb klassische `<script>`-Tags mit `WL`-Namespace statt ES-Modulen (`import` scheitert
unter `file://` an der CORS-Policy).

## Im Unterricht

Wild Clusters ist zugleich ein Skill der **MPSkills**-Seite. Die Lehrkraft macht dort einen Raum
auf, die Klasse kommt über Code oder QR herein – und dann steuert der Raum, was auf den Tablets
passiert:

* **Drei Welten** stehen zur Wahl (`I` `II` `III` oben in der Kopfzeile) – und **jede Person
  bekommt andere**. Nebenan zu schauen hilft also nicht; die Frage „wen hast du zusammengelegt?"
  ist nur an der eigenen Karte zu beantworten. Wer die Welt wechselt, findet seine Gruppen beim
  Zurückwechseln wieder vor.
* **Drei Phasen**, und weiter schaltet nur die Lehrkraft:
  1. **Gruppieren** – Tag 1–5, verdeckte Sicht. Es gibt nichts als Bewegung.
  2. **Nachzügler** – Tag 6–10. Fünf Fremde sind dazugekommen und stehen als eigenes Cluster da.
  3. **Auflösung** – die Landschaft und die Tiere werden sichtbar. Jetzt zeigt sich, ob in einer
     Gruppe wirklich nur Rehe lagen. Ab hier darf auch ein eigener Seed eingetippt werden.
* **Am Beamer** sieht die Lehrkraft dieselbe Karte (drei eigene Welten zum Vorführen), dazu ein
  Steuerpult: Phase weiter, neue Welten für alle, und den **Stand der Klasse** – eine Zeile je
  Person:

  ```
  Mia     Welt I (2 Cluster) · Welt II (4 Cluster, gerade hier) · Welt III (–)     ▸
  ```

  Ein Tipp auf die Zeile legt vorne genau das auf, was diese Person **gerade** vor sich hat –
  ihre Welt mit ihren Gruppen. Ein **freier Modus** hebt alle Sperren auf, ohne dass die Klasse
  etwas davon merkt.

Allein geöffnet ändert sich nichts an dem, was unten steht: dann gibt es weiter Seed-Feld,
„Neue Welt", alle Tasten und den Knopf „Nächster Tag".

## Bedienung

| Aktion | Desktop | Tablet / Handy |
|---|---|---|
| Verschieben | Ziehen | Ein Finger |
| Zoomen | Mausrad, Doppelklick | Zwei Finger, Doppeltipp |
| Gesamtansicht | Taste `R` oder „Ansicht zurücksetzen" | Button, Doppeltipp |
| Tier verfolgen | Anklicken | Antippen |
| Signale gruppieren | Kachel auf Kachel ziehen | Kachel waagerecht auf Kachel ziehen |
| Aus dem Cluster lösen | In den freien Bereich ziehen | dito |
| Zeit an/aus | Leertaste | Play-Knopf |
| Eine Stunde / ein Tag springen | `←` `→` bzw. mit `Shift` | Zeitleiste ziehen |
| Offene ↔ verdeckte Sicht | Taste `V` oder „Verdeckte Sicht" | Button |
| Spuren an/aus | Taste `S` oder „Ohne Spuren" | Button |
| Sprite ↔ neutrale Form | Taste `N` | – |
| Kontrollanzeige | Taste `D` | – |

Der Seed steht in der Adresszeile (`#seed=482917`) – so lässt sich dieselbe Welt teilen.
Gleicher Seed erzeugt exakt dieselbe Welt **und denselben Tagesverlauf der Tiere**.

### Verdeckte Sicht

Der Knopf „Verdeckte Sicht" nimmt der Karte alles weg, was die Antwort verrät: keine Landschaft,
keine Objekte, keine Tierbilder, keine Baue. Übrig bleibt ein **einheitlicher Hintergrund**, der
nur noch die Tageszeit zeigt – dunkelblau in der Nacht, hell gelb am Tag, mit weichem Übergang
durch die Dämmerung – und darauf die Tiere als **gleich große Silhouetten mit gleich langer
Linie**. Wer hier gruppiert, gruppiert nach Verhalten.

Die Farben verraten nichts: jedes Tier hat seine eigene, und sie gehört seiner **Kachelnummer**,
nicht seiner Art. Verborgen wird die Art, nicht das Verhalten – Flug (am Schatten) und die Form
der Spur bleiben sichtbar, denn genau danach soll gruppiert werden.

Alles andere bleibt: Zeitleiste, Auswahl, Signalliste, Cluster und das Ausblenden einzelner Tiere.
Der Knopf schaltet jederzeit zurück, ohne dass etwas neu gerechnet wird.

### Ohne Spuren

Der Knopf daneben nimmt die Bewegungsspuren weg. Die Spur zeigt fünf Tage auf einmal; ohne sie
sieht man, was ein Tier **gerade** tut und ob mehrere zusammen unterwegs sind. Beide Knöpfe sind
voneinander unabhängig.

In der offenen Sicht bleibt dann nur das Tier – **ohne Farbe**, denn ein farbiger Fleck wäre der
letzte Rest einer Gruppierung, die die Karte in diesem Moment gerade nicht zeigen soll. In der
verdeckten Sicht bleibt der **Farbpunkt** mit seiner Kachelnummer: dort ist er alles, was ein Tier
von einem anderen unterscheidet.

## Signale und Cluster

Rechts neben der Karte steht ein Raster aus Kacheln, eine je Tier – ein **Signal**. Die Kachel
zeigt nichts als eine Nummer und eine Farbe. Keine Art, kein Bild, keine Artfarbe: eine
Farbcodierung nach Art wäre die Lösung der Aufgabe.

* **Die Nummern sind sortiert, die Tiere dahinter nicht.** Intern liegen die Tiere nach Arten
  geordnet vor; ungemischt stünden die Artgruppen als Blöcke untereinander. Die Mischung kommt
  aus dem Seed – dieselbe Welt zeigt in jeder Klasse dieselbe „17".
* **Die Farbe ist das Band zur Karte.** Dieselbe Farbe trägt dort die Spur und das Tier.
* **Ziehen gruppiert.** Kachel auf Kachel ergibt ein Cluster; weitere Kacheln und ganze Cluster
  lassen sich hineinziehen, einzelne Tiere wieder heraus. Alle Mitglieder eines Clusters tragen
  dessen Farbe, und die Farbe des **Ziels** gewinnt – ein wachsender Haufen bleibt derselbe Haufen.
* **Ablegen im freien Bereich löst wieder auf**: ein einzelnes Signal verlässt sein Cluster, ein
  ganzes Cluster zerfällt.
* **Das Auge blendet aus**: je Kachel, je Cluster, oder über der Liste alles auf einmal.
  Ausgeblendet heißt vollständig weg – Sprite, Spur und Bau – und nicht mehr antippbar.

## Die Zeit

Ein Tag dauert **5 Minuten**, eine Welt umfasst **5 Tage**. Diese 5 Tage werden beim Aufbau der
Welt in einem Zug durchgerechnet und aufgezeichnet – erst danach beginnt das Abspielen. Deshalb
lässt sich auf **jeden** Zeitpunkt springen, auch vorwärts, und die Bewegungsspur eines Tieres
liegt in voller Länge vor.

* **1×** – ein Tag in 5 Minuten
* **5×** – ein Tag in einer Minute
* **25×** – die vollen 5 Tage in einer Minute

Jedes Tier zieht eine dünne Spur in seiner Signalfarbe hinter sich her; tippt man eines an, wird
seine Spur kräftig. In der offenen Sicht sind Flüge heller gezeichnet als Wege am Boden – über
5 Tage entsteht daraus das Netz aus Gewässern, Revieren und den Korridoren dazwischen.

## Aufbau

```
js/core/     rng · noise · grid · geometry · contour     allgemeine Bausteine
js/world/    config · terrain · rules · objects · validate · world
js/sim/      time · species · habitat · land · agents ·
             duck · perch · deer · boar · rabbit · bat · dachs · fox ·
             recording · tracker · simulation
js/render/   palette · shapes · camera · terrainRenderer · objectRenderer ·
             sprites · agentRenderer · renderer
js/ui/       input · debugOverlay · player · clusters · signals · app · bridge
tools/       Prüfskripte für Node (siehe unten)
tool.js      der Skill für MPSkills (Rahmen, Steuerpult) — nur dort geladen
tool.css     dazu das Aussehen des Rahmens in der MPSkills-Seite
```

`js/ui/bridge.js` ist die Verbindung zum Raum und schläft, solange keiner da ist
(`window.parent === window`). `tool.js` und `tool.css` gehören der MPSkills-Seite und werden von
`index.html` gar nicht geladen.

Generierung, Simulation, Rendering, Welt-Daten, Zufall, Regeln und UI sind bewusst getrennt.
Der fachliche Inhalt der Tiere steht nicht im Code, sondern in `data/tiere.md`;
`js/sim/species.js` bildet ihn nur ab.

### Das `world`-Objekt

Einzige Schnittstelle zwischen Generierung und allem anderen:

```
world
 ├─ terrain    grid (Uint8Array, ein Typ pro Zelle) · waterBodies · forestRegions · grasslands
 ├─ fields     distToWater · distToForest · forestDepth   (Chamfer-Distanzfelder)
 ├─ objects    trees · resources · resourcePatches · appleTrees · appleGroups · anthills
 ├─ decor      Streudetails für die Textur
 ├─ query      räumliche Abfragen (WL.Rules)
 └─ areaRatios · validation · meta · seed
```

### Das `sim`-Objekt

Entsteht einmal pro Welt aus `WL.Simulation.run(world)` und ist die Schnittstelle zwischen
Tierverhalten und Darstellung:

```
sim
 ├─ habitat     Gewässer als Lebensraum: Ufertiefe, Punkte nach Tiefe, „die andere Seite"
 ├─ agents      die Tiere (Merkmale wie Partner und bekannte Gewässer)
 ├─ recording   x/y/Zustand je Tier und Stützstelle · at(i, t) · trail(i)
 └─ features    der Merkmalsvektor aus data/tiere.md §6, gemessen auf der Aufzeichnung
```

Die Aufzeichnung ist der Kern: 5 Tage à 5 Stützstellen pro Sekunde, rund 70 KB je Tier.
Springen, Rückwärtslaufen, Zeitraffer und die vollständige Spur kosten deshalb alle dasselbe.

### Zwei Ideen, die den Rest tragen

**Raster als Wahrheit, Vektor als Bild.** Jede Zelle hat genau einen Terrain-Typ – dadurch sind
verbotene Überschneidungen (Wald × Wasser) strukturell unmöglich, und Flächenanteile sind bloßes
Zählen. Gezeichnet wird nie eine Zelle: `core/contour.js` erzeugt per Marching Squares und
Chaikin-Glättung weiche Umrisse, die bei jedem Zoom scharf bleiben.

**Ein Sub-RNG pro Schritt.** `rng.fork('trees')` liefert einen eigenständigen Generator. Ein später
ergänzter Schritt verschiebt damit nicht die Ergebnisse aller vorherigen – Seeds bleiben über
Projektphasen hinweg stabil. In der Simulation gilt dasselbe: jede Art forkt einmal, jedes Tier
noch einmal.

**Die 5 Tage sind eine Aufnahme, kein Live-Betrieb.** Der Rechenschritt ist fest (1/20 s) und
hängt nie an der Bildwiederholrate. Was auf dem Bildschirm passiert, ist Abspielen – nicht
Simulieren.

## Vorbereitet für die nächsten Phasen

* `world.fields` (Abstand zu Wasser / Wald / Waldrand) ist direkt für Tierverhalten nutzbar –
  Durst, Deckung, Reviergrenzen.
* `world.query` beantwortet „was ist hier?" und „wie weit ist …?" ohne Kenntnis des Rasters.
* `world.terrain.forestRegions` / `waterBodies` / `grasslands` sind benannte Orte mit Zentrum,
  Fläche und Bounding-Box – Grundlage für Reviere und Stammrouten.
* `world.objects.resourcePatches` und `appleGroups` sind bewusst wenige, lokale Nester statt
  gleichmäßiger Streuung, damit Tiere erkennbare Wege zwischen festen Orten entwickeln können.
* `js/sim/habitat.js` liefert dasselbe für Gewässer – Barsch, Otter und Hecht benutzen es
  unverändert weiter.
* Die Darstellung ist umschaltbar: **Sprite ↔ neutrale Form** (Taste `N`). Für das fertige Spiel
  sollen die Tiere neutral aussehen, damit nach Verhalten gruppiert wird und nicht nach Vorwissen.
* `js/sim/tracker.js` schreibt den Merkmalsvektor ab dem ersten Tier mit – so ist früh sichtbar,
  ob sich zwei Arten überhaupt trennen lassen.

## Prüfen

```
node tools/smoketest.js    # 30 Seeds: Regeln, Flächenanteile, Reproduzierbarkeit
node tools/rendertest.js   # Rendering, Kamera, Tiere und Spuren gegen einen Canvas-Mock
node tools/simtest.js      # 10 Seeds à 5 Tage: Regeln, Verhaltensraten, Merkmale
node tools/preview.js . preview.png 482917,839214            # PNG-Sichtprüfung ohne Browser
node tools/preview.js . preview.png 482917 --tiere           # dasselbe mit den Spuren der 5 Tage
node tools/preview.js . preview.png 482917 --tiere --verdeckt=0.5   # verdeckte Sicht in der Dämmerung
```

`--verdeckt` zeigt dieselbe Aufzeichnung ohne Landschaft und in einer Farbe; der Wert ist die
Helligkeit (`0` Nacht, `1` Tag, `0.5` Dämmerung). Die Dämmerung ist der Fall, den man ansehen
muss: dort läuft der Himmel durch genau die Helligkeit der Spurfarbe.

Die Regeln aus der Aufgabenstellung prüft `js/world/validate.js`; das Ergebnis erscheint auch im
Debug-Overlay (Taste `D`), zusammen mit dem Merkmalsvektor der Tiere.

`simtest.js` prüft nicht nur auf Fehler, sondern auf **Raten**: bleibt die Ente auf dem Wasser,
schläft sie am Ufer, wechselt sie 2–5 Mal am Tag das Gewässer, hält ein Paar zusammen. Solche
Werte entstehen aus dem Zusammenspiel mehrerer Parameter und lassen sich nur messen, nicht
ausrechnen – deshalb ist der Test der Ort, an dem sie eingestellt werden.

## Stellschrauben

Alles Zahlenwerk der **Welt** steht in `js/world/config.js`: Weltmaße, Zielverteilung der Flächen,
Anzahl und Größe von Teichen, Wäldern, Bäumen, Ressourcennestern, Apfelbaumgruppen und
Ameisenhügeln.

Alles Zahlenwerk der **Tiere** steht in `data/tiere.md` und wird von `js/sim/species.js`
abgebildet. Ändert sich ein Wert am laufenden Bild, wandert er zurück in die Markdown-Datei –
sie bleibt die Wahrheit, nicht der Code. Die Zeitachse selbst liegt in `js/sim/time.js`.

Zielverteilung: Gras > Wald > Wasser > sichtbarer Boden. Der Bodenanteil ist an den tatsächlichen
Wasseranteil gekoppelt, damit diese Reihenfolge bei jedem Seed eingehalten wird.
