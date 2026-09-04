# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

**Wild Clusters** – Lernspiel zum unüberwachten Lernen / Clustering: Schülerinnen und Schüler
beobachten Tiere in einer Top-Down-Welt und gruppieren sie allein anhand ihres Verhaltens.

**Aktueller Stand: Phase 3 – Gruppieren, und das Gerüst für Phase 4.** Weltgenerator (Phase 1) und
Tiersimulation (Phase 2) stehen; die Signale lassen sich per Ziehen zu Clustern zusammenfassen
(siehe „Signale und Cluster"). Was noch fehlt, ist die Bewertung: ein Vergleich der gebildeten
Cluster mit den tatsächlichen Arten.

**Eine Welt hat in Phase 1 höchstens 40 Tiere und in Phase 2 höchstens 45.** Die Obergrenze
(`WL.POPULATION.max`) steht über den acht Artspannen und wird in `js/sim/simulation.js`
(`drawPopulation`) durchgesetzt, *bevor* ein Tier angelegt ist – siehe „Die Obergrenze des
Bestands".

**Phase 4 ist vollständig besetzt.** Die Aufzeichnung umfasst zehn Tage in zwei Aufgabenphasen mit
einem Bruch bei Tag 5 (siehe „Zwei Phasen und der Bruch bei Tag 5"); an diesem Bruch tauchen
fünf Nachzügler auf und verändern das Verhalten der vorhandenen Tiere: **drei bekannter Arten und
zwei neuer** (`WL.LATE_ARRIVALS = { known: 3, newcomer: 2 }`). **Alle drei neuen Arten stehen:
Bussard** (`js/sim/buzzard.js`), **Hecht** (`js/sim/pike.js`) und **Igel** (`js/sim/hedgehog.js`),
alle in `WL.NEW_SPECIES`. Je Welt werden **zwei** davon gezogen – wer eine messen oder ansehen
will, nagelt die Nachzügler-Liste fest (`fullWith` in `tools/simtest.js`, `--neu=<id>` in
`tools/preview.js`), und die gepinnte Art gehört dabei ans Ende der Liste (siehe „Wer als
Nachzügler dazukommt").

**Alle acht Arten sind eingebaut: Ente, Barsch, Reh, Wildschwein, Kaninchen, Fledermaus,
Dachs, Fuchs.** Die Ente hat als erstes Tier das Grundgerüst mitgebracht (Zeit, Aufzeichnung,
Abspieler, Merkmalsvektor, Tierrenderer, Wasserdomäne), der Barsch die Schwarmbewegung, Gruppen
als handelnde Einheit, getrennte Nahrungskarten je Nahrungsart und Zeichenebenen, das Reh als
erstes Landtier die Landdomäne, die Landbewegung und die Ortsnahrung, das Wildschwein als erstes
nachtaktives Tier das Wachfenster über Mitternacht, die lose Gruppe (Rotte) und das Waldstück als
Revier, das Kaninchen den festen Bau (Revierzentrum, Fluchtziel und Schlafplatz in einem) und die
erste Art ganz **ohne Nahrung**, die Fledermaus die domänenfreie Bewegung und weltweite Pools
statt eines Reviers, der Dachs das Revier als Suchraum mit Ausflügen darüber hinaus, und der Fuchs
das **Revier als abgehbare Kontur** sowie **Räuber-Beute** (`ctx.nearestPrey`, Zustand `hetzen`).
Die Tier-PNGs im Wurzelverzeichnis (`Fuchs.png`, `Reh.png`, …) werden als Sprites benutzt.

**Dazu der Hecht als zehnte Art** (`js/sim/pike.js`) – die erste, die *dauerhaft im Lebensraum
einer anderen* sitzt (fünf Tage im See des Barschschwarms) und die erste **ohne Tagesrhythmus**
(kein Wachfenster, kein Schlaf; das Lauern ist seine Ruhe, Zustand `lauern`). Er hat gezeigt, dass
**eine Abstoßungskraft in einem trägen Schwarm keinen Abstand erzeugt, sondern ein Überschießen** –
sie trieb den Barsch messbar *näher* an ihn heran und flog wieder heraus; was bleibt, ist die
Meidung bei der Zielwahl (`barsch.reaction.avoid`) und der strukturelle Abstand, den `shoreAccel`
ohnehin herstellt. Für andere Arten ist er wie der Bussard nur in einem Zustand greifbar – hier im
Sprint (`hetzen`).

**Und der Igel als elfte** (`js/sim/hedgehog.js`) – die erste Art, deren Nacht ein **Drehbuch**
ist statt eines Abwägens von Bedürfnissen (aufwachen, an Ort und Stelle fressen, trinken, umziehen,
den Rest der Nacht fressen, dort einschlafen), die erste, deren Revier aus **Punkten statt einer
Fläche** besteht (3–5 Futterplätze um einen Apfelbaum), und die einzige, die bei Gefahr
**langsamer** wird (Zustand `einrollen`, kein Fluchttempo). Er hat zwei Dinge gelehrt: **eine
Flächennahrung am Rand ihrer Fläche zu mitteln misst die Fläche und nicht den Vorrat** (ein
Waldrandplatz bekam einen festen Abschlag, weil die Nachbarzellen auf der Wiese eine 0 liefern),
und **bei einem sehr langsamen Tier ist der Weg selbst Aufenthalt** – „feste Orte" meldet für ihn
1, obwohl er 3–5 hat, weil `PLACE_MIN_DWELL` seine immer wieder abgelaufenen Wege nicht mehr als
Durchgang erkennt. Er berührt keine einzige Art direkt und verschiebt trotzdem vier, weil der Fuchs
über ihn *stolpert* (`nearestDisturber` liefert das nächste Tier, nicht das nächste relevante).

**Und der Bussard als neunte Art** (`js/sim/buzzard.js`) – die erste, die es nur in Phase 2 gibt.
Er hat den **Kreisflug** mitgebracht (Zustand `kreisen`, gerechnet im Winkel über einem festen
Mittelpunkt statt über eine Drehrate, deshalb beweisbar auf der Karte), eine Art **ohne jedes
Revier**, und den ersten **indirekten** Einfluss: er berührt nur das Kaninchen, verschiebt über den
Fuchs aber fünf Arten. Gemessen wird er als einziger auf `featuresByPhase[1]`.

**Vor jeder Arbeit an Tieren diese beiden Dateien lesen:**

* `data/tiere.md` – der Tierkatalog. Fachliche Wahrheit für `js/sim/species.js`: Arten, Anzahlen,
  Tempi, Nahrung, Sozialverhalten, Merkmalsvektor. Zahlen dort sind Startwerte, die am laufenden
  Bild justiert werden – **Änderungen wandern zurück in die Datei**, nicht nur in den Code.
* `data/tiere-workflow.md` – wie ein Tier eingebaut wird, in welcher Reihenfolge, und was pro Tier
  besprochen wird, bevor Code entsteht. Enthält auch den Stand: welches Tier ist fertig.

Tiere werden **einzeln** eingebaut: besprechen → Parameter → Test → ansehen → nachjustieren.
Erst wenn eins läuft, kommt das nächste.

## Ausführen und Prüfen

Kein Build, keine Abhängigkeiten, kein Server. `index.html` per Doppelklick öffnen.

⚠️ **`package.json` in diesem Ordner ist kein Paket, sondern ein Riegel.** Seit Wild Clusters im
Repository der Tablet-Schulung liegt, gilt für jede `.js`-Datei die `package.json` der Wurzel – und
die steht auf `"type": "module"` (richtig, denn die Vercel-Functions unter `/api/` sind ES-Module).
Die fünf Werkzeuge unter `tools/` sind CommonJS und starteten damit gar nicht mehr
(`require is not defined in ES module scope`). Die Datei hier ist die nächstgelegene und stellt für
diesen Teilbaum wieder auf CommonJS. Sie hat keine Abhängigkeiten und wird nie installiert.

```
node tools/smoketest.js    # 30 Seeds: Regeln, Flächenanteile, Reproduzierbarkeit, Konturen
node tools/rendertest.js   # Shapes/Kamera/Renderer/Tiere gegen einen Canvas-2D-Mock
node tools/simtest.js      # 10 Seeds x 5 Tage: Regeln, Raten, Reproduzierbarkeit, Merkmale
node tools/uitest.js       # Signalliste gegen einen DOM-Mock (Auswahl, Ausblenden)
node tools/roomtest.js     # ../tool.js (die MPSkills-Seite) gegen einen nachgestellten Rahmen
node tools/preview.js . preview.png 482917,839214          # PNG-Sichtprüfung ohne Browser
node tools/preview.js . preview.png 482917 --tiere         # dasselbe mit den Spuren der 5 Tage
node tools/preview.js . preview.png 482917 --tiere --art=fuchs   # nur eine Art zeichnen
node tools/preview.js . preview.png 482917 --tiere --verdeckt=0.5  # verdeckte Sicht, Daemmerung
node tools/preview.js . grob.png 482917 --tiere --grob=0.6         # Spur in der Grobheitsstufe des Browsers
node tools/preview.js . nachher.png 482917 --tiere --phase=2       # Tag 6-10, mit den Nachzuegler
node tools/preview.js . igel.png 482917 --tiere --phase=2 --neu=igel --art=igel   # eine feste neue Art
```

`--neu=<id>` nagelt eine neue Art der zweiten Phase fest, statt sie aus dem Seed ziehen zu lassen.
Ohne den Schalter ist ein Blick auf eine bestimmte Nachzügler-Art Glückssache – je Welt werden
*zwei* aus `WL.NEW_SPECIES` gezogen, bei dreien also zwei von drei Seeds.

`--phase=1` (Vorgabe) zeigt Tag 1–5, `--phase=2` die Tage 6–10 mit den Nachzüglern. Beides sind
fünf Tage und damit vergleichbar – zwei Bilder nebeneinander zeigen, was die neuen Tiere den alten
angetan haben.

`--art=<id>` rechnet weiterhin *alle* Tiere (sie beeinflussen sich gegenseitig), zeichnet aber nur
eine Art. Bei acht Arten deckt sonst eine Spur die andere zu – zwei Fehler am Fuchs waren erst so
zu sehen. Für eine Nachzügler-Art gehören beide Schalter zusammen:
`--tiere --phase=2 --art=bussard`, denn in Phase 1 gibt es sie gar nicht.

Alle laden die Browser-Skripte per `vm.runInContext` in einen Sandbox-Kontext, in dem
`window === globalThis === sandbox` gesetzt ist. **Jede neue Datei unter `js/` muss in die
`FILES`-Liste der betroffenen Tools eingetragen werden** (in derselben Reihenfolge wie in
`index.html`) – sonst schlagen die Tools mit `undefined`-Fehlern fehl. Ausgenommen ist `js/ui/`:
davon lädt nur `uitest.js` einzelne Dateien (`render/palette.js`, `ui/clusters.js`,
`ui/signals.js`), und zwar gegen einen DOM-Mock statt gegen ein Canvas – der Mock kennt
`parentNode`, `style` und `elementFromPoint`, weil das Ziehen echt durchgespielt wird, und lässt
Klicks **nach oben blubbern**, weil das Auge im Clusterkopf sitzt und der Kopf auswählt. Sein
`requestAnimationFrame` **sammelt** die Bilder, statt sie sofort auszuführen – nur so lässt sich
prüfen, dass zwanzig Fingerbewegungen ein Bild ergeben und nicht zwanzig.
**`roomtest.js` lädt gar nichts aus `js/`** – es prüft die Datei *neben* der Anwendung
(`../tool.js`, die MPSkills-Seite) und stellt dafür beide Gegenüber nach: den Rahmen (ein
`contentWindow`, das die `wc:cmd` mitschreibt, plus `fromFrame()` für `ready` · `world` ·
`clusters` · `world-pick`) und den Raum (`ctx` mit den Aktionen, `view` mit Code, Sitzplatz, Phase
und Beiträgen). Sein DOM ist bewusst ein Stummel: was `tool.js` am Pult zeichnet, ist nicht das,
was schiefgeht – schiefgehen kann, **welche Gruppierung wann in den Rahmen geht**. Genau diese
Regel steht dort (siehe „Im Raum": bewahrt werden die drei Welten des Raums und sonst nichts).
Wer den Beitrag prüft, muss die 1,5-Sekunden-Bremse abwarten (`scheduleSave`) – deshalb laufen die
letzten beiden Fälle in `setTimeout`-Ketten und nicht hintereinander weg.

`preview.js` erhält seine
Globals über eine explizite Whitelist im `sandbox`-Objekt; nutzt neuer Code z.B. `Float64Array`,
muss die dort ergänzt werden.

Einzelne Prüfung: die Tools haben keinen Testfilter. Für einen einzelnen Seed
`node tools/preview.js . out.png <seed>` – das gibt Flächen, Regionenzahlen und Verstöße aus.

`node tools/smoketest.js` beendet sich mit Exit-Code 1, sobald ein Seed einen Regelverstoß hat.
Ein Verstoß ist immer ein echter Fehler; Warnungen (Waldanteil, kleine Graslandschaft) sind
tolerierbar.

## Architektur

### Kein Modulsystem – `WL`-Namespace

`import`/`export` scheitern unter `file://` an der CORS-Policy. Deshalb: klassische `<script>`-Tags
und in jeder Datei eine IIFE nach dem Muster

```js
(function (global) {
  'use strict';
  var WL = global.WL || (global.WL = {});
  /* … */
  WL.Modulname = { … };
})(typeof window !== 'undefined' ? window : globalThis);
```

Die Ladereihenfolge in `index.html` (`core → world → render → ui`) ist die einzige
Abhängigkeitsauflösung. Neue Datei = neuer `<script>`-Tag an der richtigen Stelle **und** Eintrag in
den Tools.

### Der Datenfluss

`WL.World.generate(seed)` orchestriert alles und liefert das `world`-Objekt – die einzige
Schnittstelle zwischen Generierung, Darstellung und späterer Tier-Simulation:

```
world
 ├─ terrain    grid (Uint8Array, ein Typ pro Zelle) · waterBodies · forestRegions · grasslands
 ├─ fields     distToWater · distToForest · forestDepth   (Chamfer-Distanzfelder, in Zellen)
 ├─ objects    trees · resources · resourcePatches · appleTrees · appleGroups · anthills
 ├─ decor      Streudetails für die Textur
 ├─ query      räumliche Abfragen (WL.Rules.createQuery)
 └─ areaRatios · validation · meta · config · seed
```

Reihenfolge der Generierung in `js/world/terrain.js`: **Wasser → Wald → Gras → Boden.** Wald wird
abzüglich eines Uferstreifens um das Wasser gestempelt – die Regel „Wald × Wasser verboten" ist
damit strukturell erfüllt, nicht nur geprüft.

### Vier Prinzipien, die den Rest tragen

**Raster als Wahrheit, Vektor als Bild.** Jede Zelle hat genau einen Terrain-Typ
(`GROUND/GRASS/FOREST/WATER`), dadurch sind verbotene Überschneidungen strukturell unmöglich und
Flächenanteile bloßes Zählen. Gezeichnet wird nie eine Zelle: `core/contour.js` erzeugt per Marching
Squares + Chaikin-Glättung weiche Umrisse, `render/shapes.js` baut sie einmal pro Welt und cacht sie
in `world._shapes`.

**Ein Sub-RNG pro Schritt.** `rng.fork('trees')` liefert einen eigenständigen Generator aus
`mix(seed, hash(name))`. Ein später ergänzter Schritt verschiebt damit nicht die Ergebnisse aller
vorherigen – Seeds bleiben über Projektphasen hinweg stabil. **Niemals `Math.random()` in der
Generierung** (einzige Ausnahme: `WL.randomSeed()` für den „Neue Welt"-Button). Neue
Generierungsschritte bekommen einen eigenen `fork()`-Namen statt den Eltern-RNG weiterzubenutzen.

**Regeln an genau einer Stelle.** `js/world/rules.js` definiert `placement` (darf hier ein Baum
stehen?) und `createQuery` (was ist hier? wie weit ist Wasser?). Platzierung in `objects.js` und
Prüfung in `validate.js` greifen auf dieselbe Wahrheit zu. Neue Objekttypen bekommen ihre Regel dort
– nicht inline im Generator. `world.query` ist bewusst rasterunabhängig formuliert, weil die
spätere Tier-KI dieselben Abfragen braucht.

**Statisches Bild wird gecacht.** `render/renderer.js` zeichnet Terrain + Objekte in ein
Offscreen-Canvas und kopiert es beim Verschieben nur noch; neu gerendert wird erst, wenn der
Ausschnitt den Puffer verlässt oder der Zoom sich geändert hat. `renderer.setDynamicLayers([fn])` ist
der vorbereitete Einstiegspunkt für Tiere, Bewegungsspuren und Tag-/Nacht-Färbung – die Layer
bekommen `(ctx, world, view, scale)` in Weltkoordinaten.

**Die Spur ist der teuerste Teil des Bildes, und sie wächst mit der Zeit.** Am fünften Tag ist sie
fünfmal so lang wie am ersten – daher rührt das zähe Gefühl an Tag 4 und 5. Zwei Dinge halten das
in Grenzen:

**1. Nur so genau wie der Zoom es hergibt.** `recording.js` hält die Spur in mehreren
**Grobheitsstufen** bereit (`TRAIL_LODS`, `trailAt`), erzeugt mit **Douglas-Peucker**. Das misst den
*senkrechten Abstand zur Sehne* und nicht die Schrittlänge – darin liegt der ganze Gewinn: eine
gerade Flugbahn braucht zwei Punkte, egal wie lang sie ist. Das alte Verfahren
(`MIN_SCREEN_STEP`, Abstand zum letzten gesetzten Punkt) ließ sie vollständig stehen und griff bei
einer erlaubten Abweichung von 1 px auf **100 %** der Punkte; Douglas-Peucker kommt bei einem
*halben* Pixel mit **30 %** aus. Gewählt wird die gröbste Stufe unter `TRAIL_ERROR_PX` (0.5 px) –
weniger, als die Linie breit ist. Vereinfacht wird stückweise zwischen den Wechseln Boden ↔ Flug;
diese Punkte bleiben immer stehen, sonst verschluckt eine gerade Sehne einen kurzen Flug.

**2. Die Pfade wachsen, sie werden nicht neu gebaut.** `agentRenderer.js` legt die Streckenzüge als
**`Path2D`** ab und hängt pro Bild nur die neuen Punkte an (`trailPaths`): **~350 statt ~94 000
Punkte je Bild**. Verworfen wird der Pfad nur, wenn der Zoom eine andere Grobheitsstufe verlangt
oder die Spur kürzer geworden ist (Zurückspringen). Der Schlüssel ist die **Stufe**, nicht der Zoom
– sonst würde während jeder Pinch-Geste alles verworfen, obwohl sich an der Linie nichts ändert.

Zusammen: von ~283 000 auf ~94 000 zu rasternde Segmente, und der Pfadaufbau fällt praktisch weg.
Vergleichen lässt sich das mit `--grob=`: zwei Bilder nebeneinander, eines mit und eines ohne
Vereinfachung – sieht man den Unterschied, ist die Stufe zu grob.

Warum ein Pfad und **kein zweites Offscreen-Canvas**: die Spuren liegen halbdurchsichtig
übereinander (ein Barsch umrundet sein Gewässer fünf Tage lang). Ein einzelnes `stroke()` über den
ganzen Streckenzug ergibt dort eine gleichmäßige Fläche; stückweise nachgezogen addierte sich das
Alpha und das Knäuel liefe zu. Der wachsende Pfad behält das eine `stroke()` und damit exakt das
alte Bild – `rendertest.js` prüft das Punkt für Punkt gegen einen frisch gebauten Pfad. Wer daran
etwas ändert, muss diese Prüfung grün halten; sie ist der einzige Beleg, dass die Optimierung die
Karte nicht verändert.

### Signale und Cluster (`js/ui/signals.js`, `js/ui/clusters.js`)

Rechts neben der Karte steht ein Raster aus Kacheln, eine je Tier – **ein „Signal"**. Die Kachel
zeigt nichts als eine **Nummer** und eine **Farbe**. **Keine Art, kein Bild, keine Artfarbe:** die
Liste ist das Werkzeug der Gruppierungsaufgabe, und eine Farbcodierung nach Art wäre die Lösung.
Eine Nummer innerhalb der Art („Barsch 3") taugt hier ohnehin nicht, sie käme mehrfach vor.

**Die Oberfläche nennt keine Zahlen über die Tierwelt.** Es gibt keine Fußzeile zum ausgewählten
Tier (Art, Zustand, Tempo, feste Orte) und keinen Bestand („12 Enten · 8 Barsche") – das war die
Lösung im Klartext: der Bestand nannte Artenzahl und Gruppengrößen, die Einzelzeile die Art des
angetippten Tieres. Auch der Zähler „sichtbar/gesamt" über der Liste ist deshalb weg. Was bleibt,
ist die Anzahl der Signale in einem **selbst gebildeten** Cluster – die ist keine Auskunft über die
Welt, sondern die Rückmeldung zur eigenen Arbeit. Die gemessenen Werte selbst gibt es weiter in
`sim.features` und in der Kontrollanzeige (Taste `D`), die dem Entwickeln dient, nicht dem
Unterricht.

**Die Nummern sind sortiert, die Tiere dahinter nicht.** In `sim.agents` liegen die Tiere nach
Arten geordnet (erst alle Enten, dann alle Barsche …); ungemischt stünden die Artgruppen als
Blöcke untereinander und die Aufgabe wäre abgelesen. `sim.signalOrder` (Kachel → Tier) und
`sim.signalOf` (Tier → Kachel) kommen aus `rng.fork('signale')` in `simulation.js` – aus dem
Weltseed, damit eine Klasse über dieselbe „17" reden kann, und über einen eigenen `fork()`, damit
die Mischung keinen Tierlauf verschiebt.

**Die Farbe gehört der Nummer, nicht der Art.** `WL.PALETTE.signals.build(n)` liefert n Farben im
goldenen Winkel, alle auf dieselbe *wahrgenommene* Helligkeit gerechnet (CIE L\* 58) – sonst
verschwänden die gelben Spuren auf dem Mittagshimmel und die blauen auf dem Nachthimmel. Dieselbe
Farbe trägt auf der Karte die Spur und das Tier (`agentRenderer.setColors`, gefüttert über den
`onColors`-Rückruf); unter jeder Linie liegt ein dunkler Saum, weil eine Farbe, die einer Nummer
gehört, ihren Untergrund nicht kennt.

**Gruppiert wird per Ziehen.** Kachel auf Kachel ergibt ein Cluster, weitere Kacheln und ganze
Cluster lassen sich hineinziehen, einzelnes wieder heraus; Ablegen im freien Bereich unten löst
auf. Beim Zusammenfügen gewinnt immer die Farbe des **Ziels** – so bleibt ein wachsender Haufen
über alle Schritte derselbe Haufen. Ein Cluster aus einem einzigen Tier gibt es nicht: es zerfällt,
sobald ihm das vorletzte Mitglied entzogen wird.

**Ein Schritt zurück steht im Kopf der Liste** (`#signalUndoBtn`, dazu `Strg`/`Cmd`+`Z` in
`app.js`) – auf dem Tablet der Klasse genauso wie am Beamer, denn ein Fehlgriff passiert beiden.
Aufgehoben wird **der ganze Stand vor jedem Zug** (`panel.groups()` auf einen Stapel, `HISTORY_MAX`
50) und nicht der Zug selbst: eine Gegenbewegung zu jeder Kombination aus Zusammenfügen,
Herausziehen und dem Zerfall eines Clusters, dem das vorletzte Mitglied entzogen wurde, wäre
dieselbe Logik ein zweites Mal – und die zweite ist die, die keiner prüft. Herausziehen allein
reichte als Weg zurück nicht: wer zwei gewachsene Cluster zusammenzieht, weiß danach nicht mehr,
welche Kachel in welchem lag.

Angelegt wird ein Schritt nur, wenn wirklich etwas passiert ist (`changed` in `applyDrop`) – ein
erster Druck ohne sichtbare Wirkung sieht aus wie ein kaputter Knopf. **Drei Dinge räumen den
Stapel ab, und jedes aus einem eigenen Grund:** `setSimulation` (neue Welt – hinter derselben
Kachelnummer steckt ein anderes Tier), `applyGroups` (was von außen kommt, ist nicht der eigene
letzte Zug: Weltwechsel, Neuladen, am Beamer die Arbeit einer anderen Person) und das
Zusammenschieben der Nachzügler in `setPhase` (der Haufen ist nicht die Arbeit der Klasse und
**nicht wiederherstellbar** – `newcomersGrouped` ist ein einmaliger Marker je Welt, ein Schritt
darüber hinweg löste also eine Gruppe auf, die niemand zurückholen kann). Die **Auswahl** bleibt
beim Zurücknehmen stehen: sie ist keine Gruppierung, sondern der Blick auf die Karte, und nach
einem zurückgenommenen Zug sind genau die Tiere hervorgehoben, um die es ging.

Arbeitsteilung: **`clusters.js` ist das Modell und fasst kein DOM an** (Zugehörigkeit, Zusammen­
fügen, Herausziehen, Farbe – die Regeln, die schiefgehen können, und deshalb in `uitest.js`
prüfbar), `signals.js` ist das Ziehen und das Zeichnen. Gerechnet wird im Modell in
*Signalnummern*; nach außen spricht `signals.js` ausschließlich **Tiernummern**, damit `app.js`
nichts umrechnen muss.

**Während einer Ziehgeste steht die Uhr** (`onDrag` → `player.hold()` / `player.release()` in
`app.js`). Ein Bild der Karte zeichnet die Spuren aller Tiere; läuft der Abspieler nebenher weiter,
teilen sich Geste und Karte denselben Hauptthread und der Finger wartet. `hold`/`release` und nicht
`pause`/`play`: der Knopf soll nicht behaupten, jemand hätte gestoppt – nach dem Ablegen läuft es
weiter, wo es stand. Die Arbeit je Fingerbewegung (Schwebekasten nachführen, Ziel unter dem Finger
suchen) ist auf **ein Bild gebündelt**; ein Tablet meldet Bewegungen schneller, als der Browser
zeichnet, und `elementFromPoint` zwingt ihn jedes Mal zu einer Layoutrechnung über die ganze Liste.
Der Schwebekasten fährt per `transform` und nicht über `left`/`top`.

Gezogen wird über **Pointer-Events, nicht HTML5-Drag-and-Drop** – das kennt der Finger nicht, und
das Gerät ist ein Tablet. Die Kacheln stehen auf `touch-action: pan-y`: senkrecht scrollt weiter
die Liste, waagerecht beginnt das Ziehen. Der Klick, den der Browser nach einem Ziehen nachschiebt,
wird verschluckt (`suppressClick`) – und die Sperre wird **ganz oben im `pointerdown`** wieder
gelöst, vor jeder Abbruchbedingung, sonst bleibt sie beim Aufsetzen auf ein Auge stehen.

⚠️ **Waagerecht allein reichte nicht, und das war kein Feinschliff.** Die Cluster sammeln sich
*oben*, die freien Kacheln stehen darunter – das Ziehen, das die Aufgabe verlangt, geht damit fast
immer nach oben, und genau diese Richtung gehörte dem Blättern. Deshalb gibt es einen zweiten Weg
in die Geste: **stillhalten** (`HOLD_MS`, 220 ms, `armHold`). Der Browser hat zu diesem Zeitpunkt
nichts angefangen (der Finger stand), und ab da hält ein **nicht-passiver `touchmove`-Zuhörer** das
Blättern auf – `touch-action` allein kann das nicht mehr, die Eigenschaft wird zu Beginn der Geste
ausgewertet. Wandert der Finger vorher los, ist es ein Wisch und die Geste gehört der Liste.

Dazu sucht `dropUnder` das Ziel nicht nur genau unter dem Finger, sondern auch **14 px daneben**
(`PROBE`): zwischen zwei Kacheln liegt der freie Bereich, und der nimmt von einer freien Kachel
nichts an – ein Ablegen zwei Pixel neben dem Ziel tat deshalb gar nichts und sah aus wie ein
Aussetzer. Weitergesucht wird nur, wenn unter dem Finger nichts Zuständiges liegt; die **eigene
Kachel und das eigene Cluster sind eine Absage** (`partOfSource`) und kein Fehlgriff – der Nachbar
daneben wäre die falsche Antwort darauf.

Je Kachel zwei getrennte Bedienelemente: die Nummer wählt das Tier aus (wie ein Tipp auf das Tier
selbst), das Auge blendet es aus. Ein Cluster hat ein eigenes Auge für alle seine Mitglieder, über
der Liste blendet ein weiteres alle auf einmal aus. Die Anzahl der Tiere schwankt je Seed (36 bis
40 in Phase 1, bis 45 in Phase 2 – siehe „Die Obergrenze des Bestands"), das Raster ist deshalb
vier Spalten breit und beliebig hoch – nicht fest 4×10.

**Die Auswahl ist eine Menge, kein einzelnes Tier.** Ausgewählt heißt auf der Karte: kräftige Spur
und Ring. Eine Kachel meint ein Tier, der **Clusterkopf** alle seine Mitglieder – ein Cluster legt
man an, um zu sehen, ob die Spuren zueinander passen, und dafür muss es sich als Gruppe ansehen
lassen und nicht Mitglied für Mitglied. Der Kopf ist deshalb Griff *und* Schalter; das Auge darin
hält seinen Klick an (`stopPropagation`), sonst hinge an jedem Ausblenden auch ein Wechsel des
Blicks. **Was gezogen wird, ist ausgewählt** – beim Anfassen das Gezogene, nach dem Ablegen das,
was dabei entstanden ist: beim Zusammenfügen das ganze neue Cluster (die Frage ist ja, ob das
Hineingezogene zu den anderen passt), beim Herausziehen nur das Herausgezogene. Der Klick nach
einem Ziehen wird weiter verschluckt – sonst schaltete er die eben gesetzte Auswahl gleich wieder
ab. Ein zweiter Tipp hebt nur auf, was **genau so** schon ausgewählt war; ein Tipp auf ein
einzelnes Mitglied engt die Auswahl darauf ein, statt die ganze Gruppe vom Bild zu räumen. Ein
Tipp auf die Karte meint immer genau ein Tier, auch wenn es in einem Cluster steckt.

Ausgeblendet heißt vollständig weg: Sprite, Spur und Bau. Ein Bau verschwindet erst, wenn *alle*
seine Besitzer ausgeblendet sind (mehrere Kaninchen teilen sich einen Bau). Ein ausgeblendetes
Tier ist außerdem nicht mehr antippbar, sonst wählte ein Tipp ins Leere ein Tier aus, das gar nicht
da ist. Die Sichtbarkeit liegt im `AgentRenderer` (`setHidden`, `setAllHidden`, `isHidden`);
`signals.js` meldet nur Klicks. Die Auswahl wird an genau einer Stelle gesetzt (`setSelection` in
`js/ui/app.js`), damit Karte und Liste nie auseinanderlaufen; sie nimmt eine Tiernummer, `-1` oder
eine Liste von Tiernummern – die Karte kennt nur einzelne Tiere, die Liste auch ganze Cluster, und
beide sollen dieselbe Tür benutzen (`agentLayer.isSelected` / `selectedCount` statt eines
`selection`-Feldes).

### Offene und verdeckte Sicht

### Mit und ohne Spuren

Daneben steht „Ohne Spuren" (Taste `S`). Die Spur zeigt fünf Tage auf einmal; ohne sie sieht man,
was ein Tier *gerade* tut und ob mehrere zusammen unterwegs sind – beides gehört zur Aufgabe, und
das eine ersetzt das andere nicht. Der Schalter ist deshalb von der verdeckten Sicht unabhängig,
alle vier Kombinationen sind sinnvoll.

**Ohne Spuren verliert das Tier in der offenen Sicht auch seine Signalfarbe** (`PALETTE.agents.plain`
statt der Kachelfarbe, und kein Farbfleck unter dem Sprite): der Fleck wäre sonst der letzte Rest
einer Gruppierung auf einer Karte, die gerade nichts von ihr zeigen soll. **Verdeckt bleibt die
Farbe** – dort ist das Tier nur ein Punkt, und ohne sie wären alle gleich. Gesetzt wird das an
genau einer Stelle (`setTrails` in `js/ui/app.js` → `agentLayer.setTrails`); `drawAgent` bekommt in
diesem Fall `tint === null` und greift selbst zum farblosen Ton.

### Verdeckte Sicht

Der Knopf „Verdeckte Sicht" (Taste `V`) nimmt der Karte alles, was die Art verrät. Verdeckt heißt:
**keine Landschaft** (`renderer.setMasked` überspringt Terrain, Objekte und den Puffer – der bleibt
liegen, Zurückschalten kostet nichts), **ein einheitlicher Hintergrund**, der nur die Tageszeit
zeigt (dunkelblau ↔ hellgelb, `WL.PALETTE.masked.skyAt(daylight)`), **eine Linie ohne Trennung von
Flug und Boden**, eine **Silhouette** statt des Sprites, und für alle **dieselbe Größe**.

**Der Bau wird verdeckt nicht gezeichnet.** Er ist ein ortsfester Punkt, den nur eine Art hat –
also ein Artmerkmal, das die Kaninchen auf einen Blick aus der Aufgabe herausnähme. Ihr Verhalten
verrät sich ohnehin: die Spur läuft immer wieder auf dieselbe Stelle zu, und genau danach soll
gesucht werden.

Die Farben bleiben, aber sie gehören der Kachelnummer und nicht der Art (siehe „Signale und
Cluster"); ohne sie ließe sich eine begonnene Gruppierung auf der Karte nicht wiederfinden.
Verborgen wird die *Art*, nicht das *Verhalten* – Flug (Schatten) und die Form der Spur bleiben
sichtbar, denn genau danach soll gruppiert werden.

**Verdeckt steht an jedem Tier zusätzlich seine Kachelnummer** (`drawLabel` in
`agentRenderer.js`, gespeist aus `sim.signalOf`) – und zwar, solange **irgendetwas** verdeckt ist,
nicht nur solange die Tiere es sind. Der Fall, um den es geht, ist die Auflösung: die Lehrkraft
deckt die Tiere auf, die Landschaft bleibt zu, und jetzt steht das Bild neben der Zahl („07 ist ein
Fuchs"). Fiele die Nummer genau da weg, wäre die Zuordnung zur Kachel in dem Augenblick verloren,
in dem sie gezogen werden soll. Erst ganz offen – Landschaft *und* Tiere – ist sie weg. Verdeckt sind alle Tiere gleich groß und gleich
geformt; bei rund vierzig Signalen liegen benachbarte Farbtöne dicht genug beieinander, dass die
Farbe allein die Frage „welche Nummer ist das?" nicht mehr sicher beantwortet. Die Zahl verrät
nichts – sie ist genau die der Kachel, **gleich aufgefüllt** („07", nicht „7"), sonst wären es zwei
Nummern für dasselbe Tier. Schriftgröße und Abstand rechnen in Bildschirmpixeln geteilt durch den
Zoom, sonst wäre die Zahl herausgezoomt größer als das Tier darunter; darunter derselbe dunkle Saum
wie unter der Spur. **In der offenen Sicht bleibt die Zahl weg** – dort steht das Sprite für sich,
und vierzig Zahlen über der Landschaft wären nur Rauschen.

Den Hintergrund malt die Tierebene (`agentRenderer.js`), nicht der Renderer: sie ist die einzige,
die die Uhrzeit kennt. Der Weltrand wird deshalb in dieser Sicht erst *nach* den dynamischen
Ebenen gezogen.

**Verdeckt sind in Wahrheit zwei Schleier: die Landschaft und die Tiere.** Der Knopf schaltet
beide zusammen (`setMaskedView` → `setMaskedParts(f, f)` in `js/ui/app.js`), im Raum hebt die
Lehrkraft sie in der Auflösungsphase einzeln – „erst die Welt, dann die Tiere" ist die spannendere
Reihenfolge, und „nur die Tiere" beantwortet die Frage der Stunde, ohne zu verraten, wo sie gelebt
haben. Drei Schalter, an genau einer Stelle gesetzt (`setMaskedParts`):

| | Landschaft | Tiere |
|---|---|---|
| `renderer.setMasked(w)` | Terrain und Objekte weg | – |
| `agentLayer.setMaskedWorld(w)` | die deckende Fläche (`drawBackdrop`) | – |
| `agentLayer.setMaskedAgents(a)` | – | Silhouette + Nummer, Bau weg, Spur ungeteilt |

Die deckende Fläche hängt an der **Welt** und nicht am Tier: läge sie am Tier-Schleier, wäre die
aufgedeckte Landschaft im nächsten Bild wieder zugemalt. `agentLayer.setMasked(f)` setzt weiterhin
beide auf einmal (die Node-Werkzeuge und `preview.js` benutzen das so).

Jede Signalfarbe muss auf beiden Extremen lesbar sein, und der Verlauf dazwischen passiert
zwangsläufig genau ihre eigene Helligkeit. Deshalb liegt unter jeder Linie ein dunkler Saum
(`PALETTE.masked.halo`) – ohne ihn verschwindet die Spur in der Dämmerung. Wer an den Farben
dreht, prüft das mit `node tools/preview.js . out.png <seed> --tiere --verdeckt=0.5`; das Werkzeug
benutzt in dieser Sicht dieselben Signalfarben wie der Browser (offen dagegen weiter die Artfarben
aus `PALETTE.agents`, weil `--art=` sonst nichts mehr zeigen würde). Die Kachelnummern zeichnet
`preview.js` **nicht** – sein PNG-Schreiber kennt keine Schrift; dafür prüft `rendertest.js`, dass
verdeckt jedes sichtbare Tier genau eine Nummer bekommt und offen keine.

## Im Raum (MPSkills)

Wild Clusters ist zugleich ein **Skill** der MPSkills-Seite (Registry-Zeile: Migration 0129,
`id = 'wildclusters'`). Dort läuft es in einem `<iframe>` – wie NeuroLab, aus demselben Grund:
das Stylesheet geht auf `body` und `html`, und dreißig Dateien sprechen das Dokument direkt an.

**Es bleibt trotzdem eine Datei, die man allein öffnen kann**, und das ist die Regel, an der sich
jede Änderung hier messen lässt: `js/ui/bridge.js` prüft als Erstes `window.parent === window` und
tut ohne Rahmen gar nichts – kein Listener, kein DOM, keine Sperre.

```
MPSkills-Seite (j.html · lehrer.html)
 └─ tools/wildclusters/tool.js       Rolle, Raum-Zustand, Steuerpult, Ergebnisse
     └─ <iframe> index.html
          ▲ wc:cmd    { seed, worlds, phase, masked, locks, groups, note, full }
          ▼ wc:event  ready · world · clusters · world-pick · note · full
        js/ui/bridge.js → WILDCLUSTERS.*
```

**Drei Raumphasen, zwei Aufzeichnungsphasen.** Die Zahl im Raum meint den Abschnitt der Stunde,
die Zahl in `setPhase` das Fenster in der Aufzeichnung – sie sind nicht dasselbe:

| Pult | Raum | `setPhase` | Sicht |
|---|---|---|---|
| 1 Gruppieren | 1 | 0 (Tag 1–5) | verdeckt, erzwungen |
| 2 Nachzügler | 2 | 1 (Tag 6–10) | verdeckt, erzwungen |
| 3a Welt auflösen | 3 | 1 (Tag 6–10) | `data.rw = true` – Landschaft offen, Tiere Nummern |
| 3b Tiere aufdecken | 3 | 1 (Tag 6–10) | `data.ra = true` – Tiere offen, Nummer bleibt daneben |

**Ein eigener Seed geht auf einem Tablet erst auf, wenn die Auflösung DURCH ist**
(`freeSeedAllowed` in `tool.js`): Phase 3 **und** beide Schleier oben, Landschaft *und*
Tiere sichtbar. Nicht schon mit Phase 3 – „Neue Welt" und das Seed-Feld liegen im Rahmen
einen Fingerbreit neben den drei Welt-Knöpfen, und wer sie in 3a drückt, hat statt seiner
Gruppierung eine fremde leere Welt vor sich, während vorne aufgelöst wird. Der Ausflug in
einen gewürfelten Seed ist das, was *nach* der Stunde Spaß macht. Am Pult gilt die
Bedingung nicht: dort ist der eigene Seed das Werkzeug zum Vorführen. Nimmt die Lehrkraft
einen Schleier zurück, holt `update()` die Klasse aus dem Ausflug an ihre Welt zurück –
mit ihrer Gruppierung, denn der Wechsel geht über `push()`.

Phase 3 nimmt der Karte nichts weg, sie gibt nur den Blick frei – und zwar in zwei Hälften:
`rw` deckt die Landschaft auf, `ra` die Tiere, beide unabhängig (`maskOf(view)` in `tool.js`).
Beide fehlen anfangs, die Auflösung beginnt also mit demselben Bild wie Phase 2; erst der Griff
ans Steuerpult macht daraus ein Ereignis. Der Sichtknopf auf dem Tablet bleibt **auch hier**
gesperrt (sonst deckt das erste Kind alles auf, bevor die Frage gestellt ist) – und weil er nur
zwei Stellungen kennt, aber vier Zustände möglich sind, blendet `locks.view` ihn im Raum ganz aus.
Eine vierte Phase gibt es nicht.

**Vier Knöpfe für drei Phasen** (`STEPS` in `tool.js`): „3a" und „3b" schalten die Phase *und*
heben ihren Schleier, erst `setData`, dann `setPhase` (andersherum stünde die Klasse einen
Augenblick in der Auflösung mit noch nicht gesetztem Schleier). Ein Sprung zurück auf 1 oder 2
setzt beide Schleier zurück – sonst wäre die nächste Auflösung schon aufgelöst, bevor jemand sie
eröffnet. Eingerastet ist ein Auflösungsschritt, wenn **sein** Schleier oben ist; dass die Phase
läuft, sagt `aria-current="step"`.

**Das Pult ist eine Zeile.** Links die vier Schritte, rechts Stand der Klasse · freier Modus ·
Arbeitsblatt. Was früher darüber stand – die drei eigenen Welten mit ihren Seeds und je ein
Hinweistext pro Reihe – war Auskunft und keine Bedienung: die Welten stehen ohnehin in der
Kopfzeile des Rahmens (`renderWorlds`), und was auf einer Leinwand zählt, sind Knöpfe, die man
aus fünf Metern trifft.

**Das Arbeitsblatt** (`#wlSheet`) steht als Knopf schon da, die Adresse fehlt noch: sie kommt aus
`limits.worksheet_url` und wird nachgereicht, sobald das Blatt unter `Dokumente/` liegt (Migration
0129 begründet, warum das eine eigene Migration braucht). Bis dahin sagt der Knopf das auch – ein
Knopf, der auf ein Tippen hin nichts tut, sieht aus wie ein kaputter, und das ausgerechnet vor der
Klasse.

⚠️ **Im Rahmen fängt die Karte verdeckt an** (`WC_EMBEDDED` in `app.js`), und der Schleier wird
über die Brücke **vor** dem Weltaufbau gesetzt, nicht erst im `worldHook`. Der Aufbau ist
zweistufig (erst das Bild, dann zehn Tage Tierleben) und dauert auf einem Tablet mehrere Sekunden –
wer den Schleier danach setzt, zeigt der Klasse in genau dieser Zeit die Landschaft, die sie noch
nicht sehen soll. Beim Neuladen der Seite jedes Mal.

**Erzwungen heißt zweimal gesperrt.** Ein Knopf, den man wegnimmt, ist keine Sperre: dieselbe
Wirkung hängt an einer Taste. `bridge.js` setzt deshalb `viewModeBtn.disabled` **und** schluckt `V`
in der Capture-Phase – der Zuhörer der Anwendung hängt am `window`, ein später angemeldeter zweiter
käme dort nie vor ihm dran. Beim `#advanceBtn` reicht auch das nicht: er blendet sich bei jedem
Bild selbst wieder ein (`updateAdvanceBtn` hängt an der Zeit), also räumt ihn eine Klasse am `body`
per CSS weg.

**Zwei Sperren hängen an der Rolle statt an der Phase** (`locks.info`, `locks.details` – beide
`!isPresenter()`, in jeder Phase, auch im freien Modus):

* Das kleine **`i`** oben rechts in der Kopfzeile (`#infoBtn` → `#infoBox`) erklärt die Bedienung.
  Es steht an der Stelle des früheren Streifens am unteren Kartenrand, der bei **jedem** Weltaufbau
  aufblendete und alle Tasten aufzählte – an der falschen Stelle (quer über der Karte, auf der
  Leinwand über der Auflösung), für die falschen Leute (auf einem Tablet ist keine dieser Tasten zu
  drücken) und zum falschen Zeitpunkt. Wer die Tasten braucht, ist die Lehrkraft, und die fragt
  einmal statt bei jeder Welt. Im Raum blendet `body.wc-no-info` den Knopf auf allen anderen
  Geräten weg.
* Die **Kontrollanzeige** (Taste `D`) nennt Arten, Zustände und Merkmalswerte – die Lösung im
  Klartext. Sie hängt an **keinem Knopf**, die in der Capture-Phase geschluckte Taste ist hier also
  die ganze Sperre. Steht sie beim Eintreffen des Befehls offen, macht `WC.hideDetails()` sie zu –
  über diese Tür und nicht per `element.hidden` von außen, denn `debugOverlay.js` führt seinen
  eigenen `visible`-Zustand, und ein von außen verstecktes Fenster bräuchte danach zwei
  Tastendrücke.

**Drei Welten je PERSON, gerechnet statt gespeichert.** `seedsFor(code, seat)` in `tool.js`
(FNV-1a mit Murmur3-Schlussmischung) liefert derselben Person auf jedem Gerät und nach jedem
Neuladen dieselben drei Zahlen – und jeder anderen Person andere. Wer neben sich schaut, sieht ein
anderes Ökosystem; „welche Gruppen hast du?" ist damit nicht mit Abschreiben zu beantworten.

* `seat` kommt aus `view.me.seat`. Der Beamer hat keinen Sitzplatz und rechnet mit 0 – er bekommt
  drei eigene Welten zum Vorführen, die niemandem gehören.
* **Es gibt keinen Knopf zum Neuwürfeln.** Ein neuer Raum ist ein neuer Satz Welten, und das ist
  die ganze Bedienung; ein Knopf, der der halben Klasse mitten in der Stunde die Arbeitsgrundlage
  wegzieht, ist ein Fehler, der auf sein Auftreten wartet.
* Die Schlussmischung ist nicht Zierde: in FNV-1a hängen die *unteren* Bits fast linear an der
  Eingabe, und genau die liest `% 900000`. Ohne sie behielten zwei Welten desselben Platzes über
  Räume hinweg denselben Abstand zueinander – auf der Leinwand sieht so ein Zufall aus wie ein
  System.

Verglichen wird über den Beamer: „Stand der Klasse" zeigt **eine Zeile je Person** mit ihren drei
Welten und der Zahl der Gruppen darin. Ein Tipp legt die Welt auf, die diese Person **gerade**
ansieht (`payload.cur` + die Gruppen dazu) – und **bleibt dran**: `watchEid` merkt sich die
Beitrags-ID, `push()` liest bei jedem Poll den neuesten Stand daraus, und wenn das Kind die Welt
wechselt oder eine Gruppe zieht, geht die Leinwand mit (Verzögerung: 1,5 s Bremse beim Speichern +
bis zu 3 s Poll). Ein zweiter Tipp beendet es, eine eigene Weltwahl und der freie Modus ebenso –
zusehen und selbst steuern schließen sich aus.

**Und wer beim Zusehen selbst eine Kachel zieht, übernimmt** (`takeover`). Vorher lief diese
Arbeit ins Leere: der nächste Poll legte die Gruppierung des Kindes wieder auf, und vorne sprang
alles zurück. Erkannt wird es am Vergleich mit `sentGroups` – was zuletzt *hineingegangen* ist,
meldet der Rahmen zurück, und das darf nichts auslösen. Zwei Berichte des Rahmens sind deshalb
ausdrücklich ausgenommen:

* alles, was ein Befehl von oben auslöst (`applying` in `bridge.js` – der Wechsel in Phase 2
  schiebt die Nachzügler von selbst zusammen und meldet das, *bevor* die mitgeschickte
  Gruppierung aufgelegt ist), und
* der Bericht direkt nach einem Weltaufbau (`rebase` in `tool.js`, gesetzt beim `world`-Ereignis) –
  der ist der neue Vergleichsmaßstab und nicht die Arbeit von jemandem.

Deshalb steht `ws` mit im Beitrag: der Beamer hat den Sitzplatz der Verfasserin nicht (ein Beitrag
trägt einen Namen, keine Nummer) und könnte sonst nur „Welt 482917" sagen, nicht „Welt II".

**Vollbild** (`#wcFull`, `requestFullscreen` auf `.wl-host`): Kopfzeile, Werkzeugleiste und
Seitenfuß der MPSkills-Seite sind auf einer Leinwand nichts als Wand ohne Karte. Das Steuerpult
fährt dabei hoch und bleibt an einem Fingerbreit greifbar (`:fullscreen .wl-desk`, `translateY` +
`:hover`) – die Phase weiterzuschalten ist genau das, was auf der Leinwand ansteht, und dafür jedes
Mal das Vollbild zu verlassen wäre ein Bruch.

**Der Knopf steht im Rahmen, ganz rechts neben den drei Welten – und auf jedem Gerät**
(`renderFull` in `bridge.js`). Er lag vorher am Pult, also in genau dem Streifen, der im Vollbild
nach oben wegfährt: der Ausgang lag im Weggefahrenen, und Esc kennt nicht jede Fernbedienung. Für
die Klasse ist er neu – ein Kind, das eine Karte ansieht, will sie so groß haben wie die Leinwand
vorne.

Drei Dinge daran sind nicht offensichtlich:

* **Gedrückt im Rahmen, ausgeführt draußen** (`wc:event full` → `toggleFull`). Das Vollbild nimmt
  den ganzen Kasten (Pult **und** Rahmen), und den kennt nur die Seite; der Rahmen allein ließe das
  Pult außerhalb des Bildes.
* **Der Zustand kommt mit jedem Befehl herein** (`full: isFull()` in `push`). Von innen ist er
  nicht zu sehen – das Vollbild-Element liegt in einem anderen Dokument. Ohne die Angabe könnte
  der Knopf seinen Zustand nicht benennen, und wer mit `Esc` (oder auf dem Tablet mit der Wischgeste)
  herausgeht, hinterließe einen Knopf, der weiter „Vollbild beenden" sagt. Deshalb hängt der
  `fullscreenchange`-Zuhörer in `mount()` jetzt an **jeder** Rolle, nicht mehr nur am Pult.
* **Die Nutzergeste trägt über die Rahmengrenze.** `requestFullscreen()` verlangt eine frische
  Nutzeraktion; ein Klick in einem gleichherkünftigen `<iframe>` gilt auch im Fenster darüber
  (der Browser trägt die Aktivierung an die Vorfahren weiter), und die 5 Sekunden reichen für den
  `postMessage` dazwischen um Größenordnungen.

**Was gerade läuft, steht in der Kopfzeile des Rahmens hinter dem `i`** (`note` im Befehl,
`renderNote` in `bridge.js`): „Ansicht von Mia", „Welt von Mia — Sie ziehen selbst", „Freier
Modus". Sonst schweigt er. Vorher war das ein Kasten über der Karte unten links (`.wl-cap`) – und
lag damit genau auf dem Abspielknopf. Der Streifen steht im **Rahmen**, obwohl ihn die Seite
schickt: nur dort gibt es die Zeile, in die er gehört. Sein Knopf entscheidet nichts, er meldet
nach oben (`wc:event note`) – was „aufhören" bedeutet, weiß nur die Seite. Der Name darin geht über
`textContent` hinein und nie über `innerHTML`. Den Ausgang aus dem Vollbild und die laufende Welt
trug er früher mit; beides steht jetzt ohnehin in derselben Zeile (der Vollbild-Knopf ganz rechts,
die Welt in den drei Knöpfen daneben), und zwei ⛶ nebeneinander wären eins zu viel. Er wird deshalb
**vor** den Vollbild-Knopf gehängt (`insertBefore`), damit der ganz rechts bleibt.

**Die Gruppierung gehört zur Welt.** Sie geht über zwei neue Türen in `js/ui/signals.js`:
`panel.groups()` gibt `[{ m: Signalnummern, c: Farbe }]` heraus, `panel.applyGroups(list)` legt
genau das wieder auf. Das ist die einzige Stelle, an der diese Datei nach außen in *Signal*- und
nicht in Tiernummern spricht – begründet dort im Kommentar. Gemeldet wird sie über `onClusters`,
und zwar aus `publishColors()`: eine Kachel wechselt ihre Farbe genau dann, wenn sie ein Cluster
betritt oder verlässt, also ist das dieselbe Ursache und nicht eine zweite Liste von Aufrufstellen.

Gespeichert wird ein Beitrag je Person (`skill_room_entries`, `kind = 'gruppierung'`), und in ihm
**die drei eigenen Welten**:

```jsonc
{ "cur": 482917, "phase": 2,
  "ws": [482917, 839214, 205663],          // die eigenen drei, in ihrer Reihenfolge
  "w": { "482917": [ { "m": [3,7,12], "c": "#c8743f" } ] } }
```

**Bewahrt werden genau diese drei — und sonst nichts** (`remember` in `tool.js`, die einzige Tür
in den Bestand). Ein selbst eingetippter Seed (`freeSeedAllowed`: nach der vollständigen
Auflösung; am Pult schon in Phase 3 und im freien Modus) lässt sich genauso gruppieren, aber die Arbeit gilt nur, solange er aufliegt: er ist
ein Ausflug und keine vierte Welt. Hätte jeder abgetippte Seed Anspruch auf einen Platz, ständen
die drei, um die es geht, zwischen beliebig vielen davon — deshalb ist `MAX_WORLDS` auch **3** und
nicht mehr 5.

**Am Pult gilt dieselbe Regel, nur ohne Server.** Die Lehrkraft hat drei eigene Welten (Platz 0),
und was sie darin aufgebaut hat, steht nach einem Blick in Welt II noch da; gespeichert wird davon
nichts (`save()` und `saveLocal()` sind der Klasse vorbehalten, der Bestand lebt im Gerät). Was sie
in der Welt eines Kindes zieht, gehört dem Notizblock und ist beim nächsten Wechsel weg. Beim
**Zusehen** nimmt der Bestand ohnehin nichts auf: was der Rahmen dabei meldet, ist die Arbeit des
Kindes und ging gerade von uns hinein.

⚠️ **Eine leere Gruppierung wird nicht in den Rahmen geschickt** (`push`). Ein Weltwechsel baut die
Welt neu auf, und dabei liegt nichts – ein mitgeschicktes `[]` löschte stattdessen etwas: in Phase 2
schiebt die Anwendung beim Aufbau die Nachzügler von selbst zu einem Haufen zusammen (`setPhase` in
`js/ui/signals.js`), und `applyGroups([])` räumte genau den wieder weg. Beim Zusehen ist es
umgekehrt – dort **ist** die leere Liste der Stand des Kindes und gehört aufgelegt.

⚠️ **Der Rahmen baut auch von sich aus, und sein Bericht darüber ist keine
Gruppierung** (`restore` in `tool.js`). Seed-Feld und „Neue Welt" liegen *im*
Rahmen (ab der Auflösungsphase offen, am Pult im freien Modus); wer eine seiner
drei Welten so wieder aufmacht, hat keinen der drei Knöpfe getippt – es ging
also kein Befehl von außen hinein und mit ihm keine Gruppierung, und der
Bericht direkt danach meldet eine leere Welt. Ohne Riegel schrieb genau diese
Leere die Arbeit im Bestand tot (`remember`), und zwar endgültig: auf dem
Gerät, auf dem Server und in jeder Welt, die man danach noch aufmachte.
Deshalb wird beim **ersten** Bericht nach einem Aufbau (`rebase`) verglichen –
liegt hier eine Gruppierung zu dieser Welt und meldet der Rahmen eine andere,
wird sie *aufgelegt* statt überschrieben. Beim Zusehen gilt das nicht: dort
gehört die Welt dem Kind. `tools/roomtest.js` spielt beide Rollen durch.

⚠️ **`element.hidden = true` wirkt in `tool.css` nur, wenn es dort auch steht.** `[hidden]`
kommt aus dem Stylesheet des Browsers, und jede eigene Regel mit `display:` ist stärker – ein
`.wl-list { display: flex }` baut damit einen Kasten, der sich öffnen, aber nie wieder schließen
lässt (genau das war der „Stand der Klasse"). Deshalb die Sammelregel `…[hidden] { display: none
!important }` am Kopf der Datei: jedes Element, das `display` setzt **und** per `hidden`
geschaltet wird, gehört dort hinein.

⚠️ **Wer `tool.js` oder `tool.css` anfasst, zieht den Cache-Stempel in `MPSkills/lib/tool.js`
hoch** – und wer an `index.html` oder etwas unter `js/` arbeitet, zusätzlich das `?v=` an der
Rahmen-URL in `tool.js`. Ohne das läuft auf dem Tablet die alte Seite mit neuen Skripten, und das
sieht nicht aus wie ein alter Stand, sondern wie ein Fehler.

## Konventionen

* **Alles Zahlenwerk gehört in `js/world/config.js`** – Weltmaße, Zielverteilung, Anzahlen, Radien,
  Abstände. Keine magischen Zahlen in den Generatoren.
* Zielverteilung ist eine harte Regel: **Gras > Wald > Wasser > sichtbarer Boden.** Der Bodenanteil
  ist an den tatsächlichen Wasseranteil gekoppelt (`groundFactorOfWater`), damit die Reihenfolge bei
  jedem Seed hält. `validate.js` bricht ab, wenn sie verletzt wird.
* Kommentare und UI-Texte auf Deutsch. In `js/`-Quelldateien werden Umlaute in Kommentaren als
  ASCII geschrieben (`Flaechen`, `Baeume`); in `index.html`, CSS und README stehen echte Umlaute.
* Kommentare erklären *warum*, nicht *was* – jede Datei beginnt mit einem Kopfkommentar zu ihrer
  Rolle im Ganzen. Diesen Stil beibehalten.
* Koordinaten sind Weltunits (Welt: 1600 × 1000), nicht Pixel und nicht Zellen. `world.fields`
  liefert Zellabstände; `world.query.distToWater()` rechnet auf Weltunits um.
* ES5-Syntax (`var`, `function`) in `js/`; die Node-Tools dürfen modernes JS benutzen.

## Für die nächsten Phasen vorbereitet

`world.fields` (Durst, Deckung, Reviergrenzen), `world.query` (räumliche Abfragen ohne
Rasterkenntnis), benannte Orte mit Zentrum/Fläche/Bounding-Box in `terrain.forestRegions` /
`waterBodies` / `grasslands`, sowie bewusst wenige lokale Nester in `objects.resourcePatches` /
`appleGroups`, damit Tiere erkennbare Wege zwischen festen Orten entwickeln können.
`window.WILDCLUSTERS` (`world`, `sim`, `renderer`, `player`, `agentLayer`, `signals`, `rebuild`) hält
alles für Konsole und spätere Phasen erreichbar; `WILDCLUSTERS.signals.clusters()` gibt die gerade
gebildete Gruppierung heraus – der Einstiegspunkt für die noch fehlende Bewertung.

## Die Simulationsschicht (`js/sim/`)

**Die zehn Tage sind eine Aufnahme, kein Live-Betrieb.** `WL.Simulation.run(world)` rechnet beim
Weltaufbau 10 Tage (2 × 25 min) in einem Zug durch und legt alle 0.2 s eine Stützstelle
je Tier ab. Danach bewegt die UI nur noch einen Abspielkopf über diese Aufzeichnung. Das ist der
Grund, warum Springen, Rückwärtslaufen, Zeitraffer und die vollständige Bewegungsspur alle gleich
billig sind – und warum derselbe Seed denselben Tagesverlauf ergibt. **Kein Verhalten darf von der
Bildwiederholrate abhängen**; der Tick ist fest (1/20 s).

### Die Obergrenze des Bestands

**Höchstens 40 Tiere in Phase 1, höchstens 45 in Phase 2** (`WL.POPULATION.max` in
`js/sim/species.js`, durchgesetzt von `drawPopulation` in `js/sim/simulation.js`). Die acht
Artspannen aus `data/tiere.md` §3 sind je für sich richtig, nebeneinander ergeben sie aber bis zu
63 Tiere – und so viele namenlose Kacheln lassen sich mit dem Finger nicht mehr gruppieren.

Drei Dinge daran sind nicht offensichtlich:

* **Gedeckelt wird vor dem Anlegen, nicht danach.** Ein Tier hinterher wieder herauszunehmen risse
  es aus seinem Schwarm, seiner Rotte oder seiner Familie – bei mehreren Arten ist die Gruppe die
  handelnde Einheit, und ihre Größe steht schon in ihrem eigenen Zustand.
* **Der Wunsch jeder Art kommt aus ihrem eigenen Zufallsstrom** (`rootRng.fork(spec.id)`), an
  genau der Stelle, an der ihn früher ihr Verhaltensmodul gezogen hat – `fork()` ist rein,
  dieselbe Gabel liefert zweimal denselben ersten Wert. Eine Welt, die ohnehin unter die Grenze
  passt, ist deshalb Stützstelle für Stützstelle dieselbe wie vor der Obergrenze.
* **Engere Spannen wären der falsche Weg.** Die Summe von acht unabhängigen Ziehungen liegt fast
  immer in der Mitte; um die Spitze auf 40 zu drücken, müsste jede Spanne auf ein Drittel
  schrumpfen – jede Welt sähe gleich aus, und der Mittelwert läge bei 33 statt 40. Gemessen über
  70 Seeds liefert die Obergrenze 36–40 Tiere bei im Mittel 39.8.

Weitergereicht wird die Zahl als Klon der Art mit `count: [n, n]` (`withCount`) – dieselbe Form
wie bei den Nachzüglern. Das Verhaltensmodul zieht seine Anzahl also weiter selbst aus
`spec.count`, es bekommt nur eine Spanne der Breite eins. **Wer eine neue Art baut, muss
`spec.count` deshalb wirklich einhalten** – beim Wildschwein war das nicht so (die Anzahl ergab
sich aus `sounder.groups × sounder.size`), und es ist jetzt umgedreht: `splitIntoSounders` in
`js/sim/boar.js` leitet die Rotten aus der Gesamtzahl ab, genau wie `splitIntoSchools` beim
Barsch.

> **Eine Bestandsänderung verschiebt die Messwerte *aller* Arten, auch der unbeteiligten.** Das
> leichte Schlingern der Laufrichtung rechnet in allen Verhaltensmodulen als
> `Math.sin(ctx.time * k + agent.index)`, und `agent.index` ist die fortlaufende Nummer über alle
> Arten – ändert sich die Anzahl einer Art, verschiebt sich die Phase des Schlingerns bei allen
> späteren. Gemessen: eine geänderte Barschzahl allein ändert die Bahn jedes Rehs, Wildschweins,
> Dachses und Fuchses. Das ist kein falsches Ergebnis, aber ein unbeabsichtigter Kanal; er wäre zu
> schließen, indem die Phase beim Anlegen aus `agentRng` gezogen und im Agenten abgelegt wird
> (data/tiere.md §6). Bis dahin gilt: **nach jeder Änderung an einer Anzahl alle vier Werkzeuge
> laufen lassen, nicht nur das der geänderten Art.**

### Zwei Phasen und der Bruch bei Tag 5

Die zehn Tage zerfallen in zwei Aufgabenphasen zu je fünf (`WL.SimTime.PHASE_DAYS`,
`BREAK_SECONDS`, `phaseSamples`). **Tag 1–5** ist der Startbestand – hier wird beobachtet und
gruppiert. **Bei Tag 6** tauchen fünf Nachzügler auf (vier bekannter Arten, einer einer neuen), und
die Muster der vorhandenen Tiere ändern sich sichtbar. Das ist der Zweck, nicht ein Nebeneffekt.

**Die fünf kommen als *ein* Cluster an, in einer eigenen Farbe, und dieses Cluster ist
ausgewählt** (`panel.setPhase` in `js/ui/signals.js` → `model.formGroup` → `report`). Unter
vierzig bekannten Signalen fände man fünf neue sonst nur, indem man die Nummern von hinten
durchgeht; die zweite Aufgabe fängt aber mit der Frage an, wohin sie gehören, und die stellt sich
an ihren Spuren. Die Farbe (`WL.PALETTE.signals.newcomer`) fällt über die **Helligkeit** auf und
nicht über den Farbton: der goldene Winkel verteilt die Töne über den ganzen Kreis, ein freier Ton
ist gar nicht mehr zu haben – was keine Signalfarbe je sein kann, ist etwas anderes als CIE L\* 58
bei voller Sättigung. Zusammengeschoben wird **genau einmal je Welt**; wer sie danach
auseinandernimmt, findet sie beim nächsten Umschalten nicht wieder als Haufen vor.

Drei Eigenschaften tragen das, und jede hat einen Grund, der beim Bauen nicht offensichtlich war:

* **Ein Lauf, nicht zwei.** Tag 1–5 sind hinterher bitgleich zu dem, was die Klasse gesehen hat,
  weil es dieselbe Rechnung ist. `tools/simtest.js` prüft das Stützstelle für Stützstelle gegen
  einen Lauf mit `{ seconds: PHASE_SECONDS }`. **Zwei Fehler waren nur an dieser Prüfung zu
  sehen** und an keinem Merkmalswert: ein Lauf, der genau am Bruch endete, ließ die Nachzügler
  noch für eine einzige Stützstelle auftauchen, und die Stützstelle des Bruchs selbst wurde
  zunächst beiden Phasen zugerechnet. Wer am Bruch etwas ändert, hält diese Prüfung grün.
* **Die Nachzügler werden am Bruch *angelegt*, nicht vorher schlafen gelegt.** Ein Tier, das erst
  an Tag 6 entsteht, stellt seine Uhren auf Tag 6. Legte man es an Tag 0 an, wären am Bruch alle
  Bedürfnisse fünf Tage überfällig – es tränke und fräße sofort und liefe seinen ersten Tag anders
  als jeder Artgenosse. Ihre *Plätze* in der Aufzeichnung gibt es dagegen von Anfang an (Zustand
  `abwesend`), damit sich keine Tiernummer und keine Signalkachel verschiebt. Vor dem Bruch stehen
  sie gar nicht in `agents` – für `nearestDisturber` und `nearestPrey` sind sie damit
  **strukturell** unsichtbar und nicht durch eine Abfrage, die man vergessen kann.
* **Die Aufzeichnung ist immer wohlgeformt.** Die leeren Zeilen eines Nachzüglers bekommen am Bruch
  rückwirkend seinen Startplatz eingetragen (`recording.backfill`) – sonst steht dort (0,0), die
  linke obere Kartenecke, und jeder, der die Aufzeichnung durchläuft ohne an den Zustand zu denken,
  sieht im Augenblick der Ankunft einen Sprung über die halbe Karte. Das an jeder Lesestelle
  einzeln abzufangen wäre eine Falle, die sich bei jedem neuen Leser wiederholt.

### Wer als Nachzügler dazukommt

**Drei bekannte Arten und zwei neue** (`WL.LATE_ARRIVALS`), beide Ziehungen **ohne Zurücklegen**
(`drawDistinct` in `simulation.js`). Drei bekannte gehen in drei *verschiedene* selbst gebildete
Gruppen; zweimal dieselbe neue Art wären ein Paar und keine zwei Fremden, und der didaktische Kern
der zweiten Aufgabe wäre weg. Aus dreien zwei zu ziehen lässt alle drei Paarungen zu – Hecht + Igel
ist die schwerste Welt (beide bewegen sich wenig, und verdeckt gibt es kein Wasser; trennbar bleiben
sie über den Tagesrhythmus).

**Die Bedingung, unter der eine bekannte Art mitmachen darf, hat sich mit dem Reh geändert.**
Früher: `spawn()` darf für ein einzelnes Tier nichts anlegen, was der ganzen Art gehört. Heute:
**was der ganzen Art gehört, wird bei den Artgenossen abgeholt statt neu angelegt**
(`WL.Agents.groupsOf` / `livingOf`). Das braucht kein Flag im Kontext: die Tierliste im
spawn-Kontext ist beim Aufbau der Welt **nie** mit der eigenen Art gefüllt (eine Art sieht dort nur
die früheren), beim Nachzügler dagegen immer. Ein `spawn()` fragt nach seinesgleichen und findet
sie genau dann, wenn es spät dran ist.

Eingebaut sind damit **Ente, Reh, Kaninchen und Fledermaus**. Zwei Dinge daran waren nicht
offensichtlich:

* **Eine geerbte Gruppe muss dasselbe *Objekt* sein, nicht dieselben Zahlen.** Ein Kaninchen mit
  eigenem Bau setzt einen zweiten ortsfesten Punkt auf die Karte – `collectHomes` in
  `agentRenderer.js` unterscheidet Baue an der Objektidentität, und ein Punkt, der an Tag 6
  auftaucht, ist genau der Hinweis, den die Gruppierungsaufgabe nicht geben darf. Dasselbe gilt für
  die weltweiten Orte der Fledermaus: neu gesucht ergäben sie eine zweite Landkarte für dieselbe
  Art.
* **Absolute Uhren müssen von der Entstehungszeit aus rechnen.** Die Ente hat gar nichts
  Gemeinsames und war trotzdem nicht ganz umsonst: `nextDeparture` ist ein *Zeitpunkt*, kein
  Countdown, und ab 0 gerechnet wäre der erste Aufbruch eines Nachzüglers fünf Tage überfällig – er
  flöge im ersten Tick nach seiner Ankunft davon. Dafür steht die Entstehungszeit jetzt als
  `ctx.time` im spawn-Kontext (0 für den Startbestand, der Bruch für einen Nachzügler).

**Der Fuchs bleibt grundsätzlich draußen**, und zwar nicht aus Aufwandsgründen: sein Revier ist
keine Eigenschaft eines Fuchses, sondern eine Aufteilung der Karte nach ihrer *Anzahl* (`LAYOUT` in
`fox.js`). Da gibt es nichts abzuholen. Barsch, Wildschwein und Dachs gingen nach demselben Muster
wie das Kaninchen, sind aber noch nicht gebaut.

> **Wer eine Nachzügler-Art misst oder ansieht, setzt die gepinnte Art ans *Ende* der Liste.**
> `spawnLate` leitet den Zufallsstrom aus der **Position** ab (`fork('nachzuegler-' + tag)`) – weiter
> vorne einsortiert ist es dieselbe Art, aber ein anderes Individuum. Beim Wechsel auf
> drei-und-zwei war genau das zu sehen: der Igel rutschte von Platz 4 auf Platz 3, und zwei von zehn
> Seeds rissen eine Schwelle, ohne dass an ihm eine Zeile anders gewesen wäre. `lateListWith` in
> `tools/simtest.js` und `tools/preview.js` hält die Reihenfolge.

**Die Spur wird am Bruch gelöscht** (`recording.setWindow` mit dem Fenster aus `phaseSamples`):
Phase 2 beginnt auf leerem Blatt. Zuerst didaktisch – fünf neue Tage sind mit fünf alten
vergleichbar, zehn übereinander nicht – und nebenbei das, was das Zeichnen bezahlbar hält: nie mehr
als fünf Tage Linie auf dem Schirm, also genau die Kosten von vor der Zweiteilung.

**Der Tracker misst je Phase** (`WL.Tracker.measure(sim, phase)`, `sim.featuresByPhase`).
`sim.features` bleibt Phase 1 – das sind die justierten Werte aus `data/tiere.md` §6, und alles,
was sie bisher gelesen hat, liest unverändert weiter. Ein Tier, das in einer Phase nicht da war,
trägt `present: false` und **zählt nicht ins Artmittel**; ohne das zogen zwei noch nicht
angekommene Rehe den Grasanteil der Art von 60 auf 36 % und lösten einen Verstoß aus, ohne dass
ein einziges Reh anders gelaufen wäre.

**Jede Prüfschwelle in `tools/simtest.js` misst auf Phase 1** (der Helfer `RUN` dort setzt
`seconds` – wer `WL.Simulation.run` direkt aufruft, misst etwas anderes als die Schwelle, gegen die
er prüft). `tools/preview.js` zeichnet mit `--phase=1` (Vorgabe) oder `--phase=2`; ein Bild über
alle zehn Tage gibt es absichtlich nicht.

**Umgeschaltet wird an genau einer Stelle**: `setPhase` in `js/ui/app.js`, erreichbar als
`WILDCLUSTERS.setPhase(1)`. Sie setzt Spurfenster, Abspielbereich, Signalliste und Tierebene zugleich –
jedes einzeln ergäbe einen halb umgeschalteten Zustand.

**Ausgelöst wird es seit dem Einzug in MPSkills von der Lehrkraft** (siehe „Im Raum"): der Raum
trägt eine Phase, und die Brücke reicht sie herein. Allein geöffnet bleibt es beim Knopf
„Nächster Tag" (`#advanceBtn`), der nur am Ende der laufenden Phase erscheint; im Raum ist er weg,
weil dort nicht jeder für sich weiterschaltet.

> **Seine Sichtbarkeit hängt an der Zeit, nicht an `isPlaying()` – und das ist kein Stilfrage.**
> Der Abspieler meldet beim Anhalten den letzten Augenblick, *bevor* er stehenbleibt (`tick` in
> `player.js` ruft `emit()` vor `stop()`), `playing` steht dort also noch auf `true`; danach meldet
> er gar nichts mehr. Wer auf „steht **und** ist am Ende" prüft, bekommt den Knopf nie zu sehen.
> Über die Zeit stimmt es nebenbei auch für den, der die Zeitleiste mit dem Finger ans Ende zieht.
> `tools/uitest.js` prüft genau diesen Fall.

Ein Tag = 5 Minuten Echtzeit (`js/sim/time.js`). Zeitangaben in Tierparametern sind
Simulationsstunden, nicht Sekunden.

```
sim
 ├─ habitat     Gewaesser als Lebensraum: Ufertiefe, Punkte nach Tiefe, "andere Seite"
 ├─ land        Land als Lebensraum: begehbar, Landmassen, Stelle nach Terraintyp, Waldrand
 ├─ agents      die lebenden Tierobjekte (Endzustand nach dem Durchlauf)
 ├─ recording   x/y/state je Tier und Stützstelle · at(i,t) · trail(i)
 ├─ signalOrder Kachel -> Tier, gemischt aus rng.fork('signale')  · signalOf: die Rueckrichtung
 └─ features    der Merkmalsvektor aus data/tiere.md §6, gemessen auf der Aufzeichnung
```

Zwei Bewegungsdomänen mit demselben Ausweichfächer: `swimStep`/`steerStep` im Wasser,
`walkStep`/`roamStep` an Land. **Der Fächer reicht nur über gut ±109° – er kann einen Kurs
ablenken, aber nicht umkehren.** Ein Landtier, das `blocked` meldet, steckt in einer Sackgasse
und muss ausdrücklich umgedreht werden, sonst bleibt es dort für den Rest der Aufzeichnung
stehen.

Arbeitsteilung: `species.js` sind Zahlen (Spiegel von `data/tiere.md`), `<tier>.js` ist das
Verhalten, `agents.js` ist das, was alle Arten teilen (Streuung, Tagesform, Bewegungsschritt).
**Individuelle Streuung ist Pflicht** – ohne sie wird das Clustering später zum Ablesen.

Bei Gruppentieren gehört die Entscheidung der Gruppe, nicht dem Einzeltier: Ziel, Tempo und
Stammplatz liegen in einem gemeinsamen Objekt (`school` in `perch.js`), das erste Mitglied
aktualisiert es einmal je Tick. Individuell bleiben nur Streuung und Tagesform – zöge jedes Tier
sein eigenes Tempo, risse die Gruppe auseinander.

Der Weltgenerator wird dafür nicht angefasst. Neue Nahrung ist entweder **Flächennahrung** (ein
Wert je Zelle eines Terraintyps) oder **Ortsnahrung** (ein Vorrat je bereits vorhandenem
Weltobjekt, z.B. Apfelbaum); beides lebt in `simulation.js`, damit alle Seeds und `smoketest.js`
unberührt bleiben. **Jede Nahrungsart bekommt ihre eigene Karte** – sonst frisst eine Art der
anderen den Vorrat weg und verschiebt deren bereits justierte Merkmalswerte.

**Ein neues Tier verschiebt trotzdem die Werte der alten, sobald es ihnen begegnet.** Die
Reaktionszweige der schon eingebauten Arten laufen so lange ins Leere, bis etwas auftaucht, das
sie auslöst – das Reh am Ufer war das erste. Nach jedem neuen Tier deshalb prüfen, ob die
gemessenen Werte der vorherigen noch zu `data/tiere.md` passen, und die Datei nachziehen. Ob eine
Änderung am *Code* etwas verschoben hat, lässt sich davon getrennt nachweisen:
`WL.Simulation.run(world, { species: ['ente', 'barsch', 'reh'] })` muss die alten Zahlen exakt
liefern.

**Eine Art muss nicht fressen.** Fehlt der `forage`-Block, legt `simulation.js` für sie keine
Karte an – das Kaninchen ist so gebaut, und im Merkmalsvektor ist `food: 'keine'` ein Wert wie
jeder andere. Ortsgebundene Arten bekommen ihren festen Punkt über eine Regel in
`js/world/rules.js` (`placement.burrow`), deren Zahlen im `home`-Block der Art stehen.

**Räuber suchen, alle anderen reagieren nur.** `ctx.nearestPrey(agent, radius, ids, awakeOnly)`
ist die einzige Abfrage, die aktiv nach anderen Tieren sucht; wer Beute ist, steht als Artenliste
beim Räuber und nicht als Größenschwelle. Ausgenommen ist immer der Zustand `bau` (körperlich
unerreichbar), `schlafen` nur auf Wunsch – ein Kaninchen im Bau ist sicher, eine schlafende Ente
am Ufer nicht. **Getötet wird nichts**, die Jagd endet damit, dass die Beute weg ist; an der Beute
selbst war dafür nichts zu ändern, ihre Fluchtzweige standen schon.

**Es gibt zwei Wege, Beute zu finden, und der zweite braucht gar keine Abfrage.** Der Fuchs
*sucht* (`nearestPrey`), der Bussard *kennt* den Bau der Kaninchen als Ort und fliegt ihn einmal
am Tag an – dieselbe Bauform wie der Ameisenhügel des Dachses. Eine Zusage der Form „einmal pro
Tag" ist nur so einzuhalten: eine Suche liefert eine Rate, keinen Termin. **Wer neu jagt, setzt
außerdem `agent.flight` bewusst**: der Bussard ist nur im engen Jagdkreis für andere greifbar,
sonst für niemanden – daran hängt, welche Arten er verschiebt.

**Eine Nahrungskarte gehört der Nahrungsart, nicht der Tierart.** Zwei Arten mit derselben
Nahrung (Reh und Wildschwein bei den Nüssen) teilen sich wirklich einen Vorrat und nehmen
einander etwas weg. Wer das nicht will, gibt der zweiten Art eine eigene Nahrungsart mit eigenem
Namen – eine zweite Karte unter demselben Namen gibt es nicht. Angelegt wird die Karte von der
Art, die in `WL.SPECIES_ORDER` zuerst steht; deren `regrowPerSecond` gilt, während `eatPerSecond`
je Art wirkt.
