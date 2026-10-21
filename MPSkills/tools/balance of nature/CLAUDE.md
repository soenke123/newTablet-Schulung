# CLAUDE.md

## Projekt

**Balance of Nature** (früher „Biotop“): Ökosystem-Simulation für den Biologieunterricht auf einer fiktiven Insel
(Neuseeland als Vorbild, mit fantasievollen Elementen). Die Lernenden programmieren nicht, sie
beobachten und greifen ein. Das Konzept mit den Ausbaustufen und der Begründung der
Architektur steht in `docs/KONZEPT.md`. **Vor größeren Änderungen lesen.**

Stand: Stufe 1 steht – Insel, Nahrungsfelder und vier Arten (Zwerghirsch, Laufvogel,
Inselwolf, Inseladler; dazu eingeschleppt über Karten: Schaf, Hund, Ratten als Feld) mit Herden, Rudeln, Revieren, Nestern, Adlerhorsten, Aas, Jahreszeiten.
**Vor jeder Arbeit an Tieren `data/arten.md` lesen** – dort stehen die Arten, ihre Werte und die
Mechanismen, die das Ökosystem stabil halten. Werte, die im Code geändert werden, wandern
zurück in die Datei.

Stufe 3 läuft: Der Mensch kommt mit Karten auf die Insel. **Plan, Karten und Stand in
`docs/MENSCH.md`.** Ohne gespielte Karte muss die Simulation exakt wie vorher laufen. Die Diagramme „Nahrung“ und „Zustand der Pflanzen“ messen an der unberührten Insel (`Fields.startTotal`).

Ist ein Skill in MPSkills (Migration 0213, id `balance`, Beta): `tool.js`/`tool.css` sind der Rahmen im Raum.
Mit `?raum=lehrer|schueler` zeigt die Seite nur die Insel ohne Tiere und vier feste Szenarien
(`js/ui/room.js`: 1 Wolf+Hirsch, 2 Adler+Laufvogel, 3 alle vier, 4 alle vier + Menschen). Die Lehrkraft
sieht Kacheln (Bild `assets/szenario_<n>.jpg` + große Tierbilder, i = Infos für den Unterricht), startet für
sich oder teilt/entzieht (postMessage `bon:share` → `skill_room_state.data.shared`); Schüler sehen nur die
geteilten als Karten „Szenario n“ (vorher steht auf der leeren Insel „Warte auf deine Lehrkraft …“). Im Raum
steht das Diagramm von Anfang an auf Jahresmittel, mit Umschalter auch in der Seitenleiste. Mit `?demo=1` spielt `js/ui/demo.js` das Schaufenster: volle Oberfläche mit Seitenleiste, echte Kurven
(90 Jahre Wolf/Hirsch im Zeitraffer, dann Landung, Schafweide, Ausbruch). Bestand, Diagramme und Todesursachen
zeigen nur Arten des Szenarios (`present()` in app.js: Startbestand > 0 oder je gesehen; `LineChart.setSeries`). Ohne Parameter läuft alles wie vorher.
Inseltypen (`BT.ISLAND_TYPES` in config.js, `#…&typ=`): ausgewogen (Standard), gras, wald, fels – gleicher Seed = gleiche
Küste, Berge, Flüsse, nur die Schwellen der Lebensräume verschoben (fels zusätzlich mehr/höhere Bergrücken). Messung
mit `tools/balance.js 8 30 --typ=…` steht als Kommentar an den Werten; Flächenanteile: `tools/inseltypen.js`. Kein
Szenario: Seed, „Neue Insel“ und Größe stehen im Raum immer oben; die Lehrkraft schaltet in der Auswahl „Inseltypen zur
Auswahl“ (data.types, bon:types, i daneben = Erklärung mit Messwerten), dann steht oben bei allen „Typ“; ausgeschaltet laufen alle auf der ausgewogenen Insel. Typwechsel baut die Insel neu, das laufende Szenario beginnt von vorn.
Tour im Raum (`js/ui/tour.js`, Stil in `css/room.css`, nur mit `?raum=`): Kästen direkt neben dem erklärten Stück, Rest abgedunkelt.
Lehrkraft beim Öffnen: Szenarien · Teilen · Inseltypen, dann Pause bis ein Szenario läuft (`BT.room.onReady`/`onStart`). Im
Szenario (alle): Insel · Zeit/Neustart · Bestand · Diagramme Tiere · Pflanzen · Todesursachen · Groß · [Menschen: Karten · Zahlen;
Schritt „Tiere“ nennt dann Schafe/Ratten/Hunde] · Insel einstellen · Szenarien. Gesehene Schritt-ids werden gemerkt (Lehrkraft
localStorage, Klasse sessionStorage `bon.tour.*`), ein weiteres Szenario zeigt nur neue Schritte; „Überspringen“ = gesehen; `?` oben
rechts zeigt die Tour zum aktuellen Stand ganz. Neue Bedienelemente → Schritt in `scenarioSteps` ergänzen.
Wer an `index.html`, `js/` oder `css/` arbeitet, zieht `V` in `tool.js` und die `?v=` in `index.html` hoch.

## Regeln

- **Kein Modulsystem, kein Build.** Klassische `<script>`-Tags, jede Datei eine IIFE, die an
  `BT` hängt. `import` scheitert unter `file://`. Die Ladereihenfolge in `index.html` ist die
  einzige Abhängigkeitsauflösung; eine neue Datei braucht auch einen Eintrag in `tools/load.js`.
- **Deterministisch:** Nur `BT.Rng` verwenden, nie `Math.random()` (Ausnahme:
  `BT.randomSeed()`). Jeder Generierungsschritt bekommt mit `rng.fork('name')` einen eigenen
  Sub-RNG, damit neue Schritte alte Seeds nicht verschieben.
- **Gleich auf jedem Gerät:** In `js/core`, `js/world`, `js/eco` kein `Math.sin/cos/atan2/exp/
  log/pow/hypot` – diese rundet jede Engine anders, und die Simulation läuft dann nach etwa
  einem Jahr auseinander. Stattdessen `BT.M.*` (`js/core/dmath.js`). Erlaubt sind die exakt
  festgelegten: `+ - * /`, `Math.sqrt/floor/ceil/round/min/max/abs/imul`.
- **Arten sind Daten:** Unterschiede zwischen Arten gehören in `BT.SPECIES`, nicht in
  artspezifischen Code. Das Verhalten (`js/eco/behavior.js`) gilt für alle.
- **Nach jeder Änderung an Arten oder Verhalten** `node tools/balance.js 8 30` laufen lassen.
  Ziel: mittlere Insel überlebt in den meisten Läufen mit allen Arten.
- **Raster als Wahrheit, Vektor als Bild:** `world.biome` hat genau einen Lebensraum pro
  Zelle. Gezeichnet werden geglättete Konturen (`js/render/shapes.js`), nie Zellen.
- **Modell ohne Darstellung:** `js/core`, `js/world` (und später `js/eco`) laufen in Node ohne
  DOM. Nur `js/render` und `js/ui` dürfen den Browser kennen.
- **Gelände ist veränderbar** (Rodung, Dorf, später Acker): `world.biome` ist die Natur und
  bleibt fest; die Simulation fragt den Lebensraum über `sim.biomeAt(x, y)` ab
  (`sim.landuse.ground`). Lebensraum, Deckung und Nahrung in `js/eco` immer darüber;
  `world.query.biomeAt` nur für Wasser und Küste, die sich nie ändern.

## Aufbau

```
js/core/    rng, noise, grid, geometry, contour     (aus Wild Clusters, WL -> BT)
js/world/   config.js (alle Stellschrauben, Lebensräume), island.js (Generator),
            decor.js (Streudetails), world.js (world-Objekt, query)
js/render/  palette, shapes (Konturen), camera, terrainRenderer (inkl. Reliefschattierung),
            seasonRenderer (Jahreszeiten als Farbschicht; Schnee waechst je nach Winterhaerte von den Gipfeln bergab), plantRenderer (Weidezustand:
            entsättigt die Textur, abgefressen blasser, überweidet grau), sprites, agentRenderer (Tiere kleiner als spec.size gezeichnet, Hervorhebung einer Art, Ring ums verfolgte Tier),
            humanRenderer (Schiff, Häuser, Siedler, Jäger, Sammler; Bildvarianten je Person),
            ratRenderer (Ratten als gestreute Gruppen je Weidezelle, wuseln),
            landuseRenderer (gerodete Erde, Dorfplatz, Wiese, Acker als Schicht über dem Gelände)
js/eco/     time (Kalender), species (Artentabelle, Nahrungsschichten), fields (Nahrung und
            Pflanzenzustand je Weidezelle, Überweidung), landuse (Nutzung: Erde, Dorf, Wiese, Acker
            über der Natur; sim.biomeAt), movement, cards (Kartentabelle, Pause zwischen Karten),
            humans (Schiffe, Dörfer, Häuser, Siedler, Äcker und Ernte, Weiden, Jäger, Störungsfeld,
            Karten zurücknehmen; Vorratsschiff), rats (Ratten als Feld je Weidezelle: Fressen, Junge,
            Ausbreitung, Nestraub; BT.RATS), behavior (Gruppen-Entscheidungen; Räuber fangen Ratten),
            stats, simulation (Tick/Tag, sim.play für Karten)
js/ui/      app.js (Karte, Kamera folgt einem angeklickten Tier, Zeitregler, Seitenleiste aus einklappbaren Bereichen (Zeit, Bestand, Menschen, Verlauf, Menschen auf der Insel; breit = zwei Spalten; Neustart-Fenster mit Startbestand), Kartenleiste mit + und −, Infofenster
            der Karten, Chronik, Bildpuffer, Großansicht der Diagramme), cardInfo.js (Bild im Infofenster:
            Kartenausschnitt assets/karte_<id>.png),
            charts.js (LineChart; ChartView: gemeinsamer Zeitraum und Fadenkreuz),
            room.js (Raum-Modus ?raum=, Szenarien), tour.js (Tour im Raum), demo.js (Schaufenster ?demo=1)
data/       arten.md (fachliche Wahrheit für species.js)
assets/     Tierbilder, schaf/, hund/, doerfler/ (Menschen), ratten.png (Kachel), Ratten/Ratte_1..10.png (Karte, zufällig verteilt), Schiff, Häuser, karte_<id>.png (Infofenster)
tools/      load.js (Skripte in Node laden), smoketest.js, balance.js (Abstimmung),
            invasion.js (fassen Schafe und Hunde Fuß? was erlegen Jäger? wie breiten sich Ratten aus?
            Vergleich mit/ohne Karten, parallel),
            shot.js (Playwright-Screenshot, optional nach N simulierten Tagen),
            kartenbilder.js (Bilder der Infofenster: Ausschnitte der echten Karte),
            szenariobilder.js (Bilder der Szenario-Kacheln im Raum: assets/szenario_<n>.jpg)
```

Simulation: Pro Tick zuerst gespielte Karten und Menschen, dann die Tiere. Entschieden wird je **Gruppe** (Herde, Rudel …), die Tiere folgen dem Anker der
Gruppe mit eigenem Versatz. Pro Tick: Verhalten, Bewegung, Fressen, Energie (Durst ist abgeschaltet, `thirstDays: 0`). Pro Tag:
Wachstum, Ratten (Feld), Alter, Geburt, Nester und Horste, Abwanderung, Gruppen teilen/zusammenlegen, Statistik.

Generator-Reihenfolge in `island.js`: Form → Relief → Feuchte (ohne Gewässer) → Wasser
(Priority-Flood, Seen, Abfluss, Flüsse) → Feuchte (mit Gewässern) → Biome.

## Prüfen

```
node tools/smoketest.js 20
node tools/balance.js 8 30
node tools/balance.js 8 30 --ohne=inselwolf,inseladler   # Vergleich ohne Räuber
node tools/shot.js /tmp/x.png 482917 mittel 1 0.5 0.5 300 [inselwolf,inseladler]
node tools/shot.js /tmp/x.png 482917 mittel 4 0.2 0.46 300 --landung=0.17,0.5   # mit Dorf
node tools/balance.js 8 30 --karten=schafe@1,hunde@1    # Menschen mit Karten
node tools/invasion.js 8 30 --karten=schafe@1           # Schafe etabliert? heimische Arten im Vergleich
node tools/invasion.js 8 30 --karten=wildJagen@1,woelfeJagen@1   # Jagd: Strecke, Angriffe auf Jäger
node tools/invasion.js 8 30 --karten=ratten@1           # Ratten: Ausbreitung, Eier, Küken, Beute der Räuber
```

`tools/shot.js` meldet Fehler aus der Browser-Konsole und endet dann mit Code 1. Nach
Änderungen an Generator oder Darstellung immer einen Screenshot ansehen.
