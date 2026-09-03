# Wie wir Tiere einbauen

Merkzettel für den Ablauf. Der fachliche Inhalt steht in `data/tiere.md`.

## Stand

Phase 2 – Tiersimulation. **Fertig: Ente, Barsch, Reh, Wildschwein, Kaninchen, Fledermaus, Dachs,
Fuchs. Das Kernset ist damit vollständig.** Dazu **Bussard, Hecht und Igel** als Nachzügler –
`WL.NEW_SPECIES` ist voll, **alle elf Arten stehen.**

Alle drei Nachzügler sind einzeln eingebaut worden, nach demselben Ablauf wie das Kernset:
besprechen → Parameter → Test → ansehen → nachjustieren. Was jede von ihnen gelehrt hat, steht
unten.

**Der Igel ist gebaut und justiert** (`js/sim/hedgehog.js`, Festlegungen in `data/tiere.md` §4).
Er ist die dritte Nachzügler-Art und der schwere Fall der zweiten Aufgabe – im Merkmalsraum dicht
am Kaninchen. Neu an ihm sind drei Dinge: seine Nacht ist ein **Drehbuch** statt eines Abwägens
von Bedürfnissen, sein Revier sind **Punkte statt einer Fläche** (3–5 Futterplätze), und er ist
die einzige Art, die bei Gefahr **langsamer** wird (Zustand `einrollen`). Was er gekostet hat,
steht unten („Was der Igel gelehrt hat").

**Der Hecht ist gebaut und justiert** (`js/sim/pike.js`, Festlegungen in `data/tiere.md` §4). Er ist
die zweite Nachzügler-Art und die erste, die *dauerhaft im Lebensraum einer anderen* sitzt – fünf
Tage im See des Barschschwarms. Was er gelehrt hat, steht unten („Was der Hecht gelehrt hat").

> **Ab der zweiten Art in `WL.NEW_SPECIES` hört `fullFor()` auf, ein Messwerkzeug zu sein.** Jeder
> Seed zieht nur noch *eine* neue Art, und die Bussard-Auswertung meldete daraufhin auf sechs von
> zehn Seeds „kein Bussard" – kein einziger davon war ein Fehler. Wer eine Nachzügler-Art misst,
> nagelt die Liste fest (`fullWith(seed, id)` in `tools/simtest.js`), genau wie es für
> Vergleichslisten von Einflussmessungen längst gilt.

**Der Bussard ist gebaut und justiert** (`js/sim/buzzard.js`, Festlegungen in `data/tiere.md` §4).
Er ist die erste Art, die es nur in Phase 2 gibt. Drei Dinge daran sind neu: er hat **kein Revier**
(die Kreise wandern über die ganze Karte, gemieden wird nur der Wald), er wird **nur im engen
Jagdkreis** über einem Kaninchenbau für andere greifbar (sonst `agent.flight` wie die Fledermaus),
und **jede** seiner Messungen läuft auf **Phase 2** – auf Phase 1 hat er keine einzige Stützstelle.
Was er gekostet hat, steht unten („Was der Bussard gelehrt hat").

Zwei Dinge sind beim Bau einer Nachzügler-Art anders als beim Kernset:

* **Sie erscheint als genau ein Individuum**, nicht in der Anzahl aus §4. Ihr Eintrag muss in
  `WL.NEW_SPECIES` (`js/sim/species.js`); je Welt wird eine daraus gezogen.
* **Ihr `spawn()` bekommt `count: [1, 1]`** und darf deshalb nichts anlegen, was der ganzen Art
  gehört – kein nach Anzahl aufgeteiltes Revier, keinen Verband, keinen weltweiten Pool. Das ist
  dieselbe Bedingung wie beim `lateArrival`-Flag der bekannten Nachzügler, und sie gehört *vor*
  dem Schreiben des Verhaltens geprüft, nicht danach.

Die Ente war das erste Tier und hat deshalb das ganze Grundgerüst mitgebracht: Zeitachse,
Aufzeichnung, Abspieler, Merkmalsvektor, Renderer für Tiere und Spuren, dazu die Wasserdomäne.

Der Barsch war das zweite und hat vier Dinge ergänzt, die alle weiteren Arten erben:

* **Bewegung mit Trägheit** (`A.driftStep` in `js/sim/agents.js`): das Tier hat eine
  Geschwindigkeit, auf die Kräfte wirken, statt einer Wunschrichtung, auf die es eindreht. Nur so
  schießt es über sein Ziel hinaus – und genau dieses Überschießen unterscheidet einen wogenden
  Schwarm von einer Formation, die geschlossen über den See gleitet. Alles Kraftbasierte braucht
  ihn. (`A.steerStep` – Richtung ohne Trägheit – bleibt daneben stehen und `swimStep` ist dessen
  Spezialfall „Richtung kommt aus einem Ziel"; die Ente benutzt beide.)
* **Gruppen als handelnde Einheit** (`school` in `js/sim/perch.js`): ein gemeinsames Objekt für
  Ziel, Tempo und Stammplatz, an dem alle Mitglieder hängen. Entscheidungen fällt das erste
  Mitglied, einmal je Tick. Die Rotte des Wildschweins wird dasselbe Muster benutzen.
* **Eine Nahrungskarte je Nahrungsart** (`js/sim/simulation.js`): sonst frisst die Ente dem
  Barsch den Teller leer, und beim Einbau einer Art verschieben sich die Werte der schon
  justierten.
* **Zeichenebenen** (`spec.layer`): der Fisch liegt unter der Wasseroberfläche, die Ente darauf,
  die Fledermaus später darüber. Die Nummern der Tiere in der Aufzeichnung bleiben davon
  unberührt – die dürfen sich nie verschieben.

Das Reh war das dritte und hat als erstes Landtier fünf Dinge mitgebracht, die alle weiteren
Landarten erben:

* **Die Landdomäne** (`js/sim/land.js`): begehbare Fläche, zusammenhängende Landmassen, Ziehen
  einer Stelle nach Terraintyp, Waldrand. Das Gegenstück zu `habitat.js`. Die Landmassen sind
  nicht Zierrat: ohne sie wählt ein Tier ein Ziel jenseits eines Sees und steht den Rest des
  Tages am Ufer.
* **Landbewegung** (`A.walkStep` / `A.roamStep`): derselbe Ausweichfächer wie im Wasser, nur mit
  „alles außer Wasser" statt „in diesem Gewässer". Der Fächer bekam dafür die Domänenprüfung als
  Funktionsparameter statt fest verdrahtet – an Ente und Barsch ändert das nichts.
* **Ortsnahrung** (`js/sim/simulation.js`): ein Vorrat je Weltobjekt statt je Zelle, für
  Apfelbäume und Nussnester. `ctx.foodInSight` / `ctx.eatPoint` daneben `foodAt` / `eatAt`.
  Kaninchen, Wildschwein, Dachs und Bär brauchen genau dasselbe.
* **Eine Nahrungszeile je Art statt einer je Tier** (`spec.forage.<name>.source`): ein Tier kann
  jetzt mehrere Nahrungsarten haben (das Reh drei), jede mit eigener Karte.
* **Schlafende Tiere stören niemanden** (`ctx.nearestDisturber`). Klingt nach einer Feinheit,
  ist aber der Unterschied zwischen einer Störung und einem Dauerzustand – siehe `tiere.md`.

Das Wildschwein war das vierte und hat sechs Dinge mitgebracht:

* **Nachtaktivität** (`A.isAwake`, `A.isSettling`): ein Wachfenster, das über Mitternacht läuft.
  Vorher war „wach" der Bereich *zwischen* zwei Werten, jetzt auch der außerhalb. Dachs, Fuchs und
  Fledermaus erben das unverändert.
* **Die Rotte als lose Gruppe** (`js/sim/boar.js`): ein gemeinsames Ziel plus ein eigener Platz je
  Tier im Umkreis darum, dazu Trödeln und Aufschließen. Das ist die billige Alternative zum
  Schwarm des Barsches – kein Tier sieht jedes andere an – und ergibt einen sichtbar loseren
  Verband (38 u zum Nachbarn gegen 23 u beim Barsch).
* **Ein eigener Mindestabstand** (`keepGap`): weil der Umkreis allein den Abstand von der
  Gruppengröße abhängig macht statt von der Zusage.
* **Waldstücke als Revier**: `terrain.forestRegions` mit umschließendem Rechteck plus Streifen,
  statt eines Kreises um einen Punkt. Dachs und Fuchs brauchen dasselbe.
* **Waldsuche nach Tiefe** (`land.forestNear`): 1–4 Zellen ist der Waldrand (Reh), 7 und mehr der
  dichte Wald (Wildschwein). `forestEdgeNear` ist jetzt der Sonderfall davon.
* **Sichtbarer Boden als Flächennahrung** (`AREA_SOURCES.ground`): der Terraintyp `GROUND` hatte
  bis hierher keine Verwendung.

Das Kaninchen war das fünfte und hat vor allem etwas *weggelassen*:

* **Eine Art ohne Nahrung.** Kein `forage`-Block, keine Karte, kein Durst – die Simulation kommt
  damit klar (`ensureFood` steigt bei fehlendem `forage` aus), und im Merkmalsvektor ist `keine`
  ein Wert wie jeder andere. Wer das nächste Tier baut, muss nicht mehr fragen, ob eine Art Futter
  *braucht*.
* **Der erste feste Ort.** Der Bau wird einmal pro Welt gesetzt (`findBurrow` in
  `js/sim/rabbit.js`) und ist Revierzentrum, Fluchtziel und Schlafplatz in einem. Dachs und Fuchs
  bekommen denselben Mechanismus, nur mit anderer Platzierungsregel.
* **Die Platzierungsregel liegt in `js/world/rules.js`** (`placement.burrow`) – als einzige, die
  kein Weltobjekt betrifft. Ihr dritter Parameter ist nicht `world.config`, sondern der
  `home`-Block der Art: Regel dort, Zahlen in `species.js`.
* **Eine Gruppe, die nur einen Ort teilt.** Nach Schwarm (Kräfte) und Rotte (gemeinsames Ziel) die
  dritte und billigste Form: gar keine Kopplung, nur ein gemeinsamer Punkt. Sie ergibt trotzdem
  31 u zum Nachbarn – nah an Schwarm (23 u) und Rotte (45 u), bei völlig anderem Mechanismus.
* **Ein Zustand für „unerreichbar".** `S.bau` ist kein Schlaf: das Tier ist wach, aber die
  Bedrohungsabfrage läuft in diesem Zustand gar nicht erst. Der Dachs braucht dasselbe für seinen
  Tagesbau.
* **Eine Art, die nichts verschiebt.** Größenklasse 1 plus 260 u Bauabstand zum Wasser ergeben ein
  Tier, das keiner anderen Art begegnet – nachgerechnet in `tools/simtest.js`, das nach jedem Lauf
  neun Merkmale je Art gegen einen Lauf ohne Kaninchen vergleicht. Diese Prüfung ist ab jetzt der
  Ort, an dem man sieht, was ein neues Tier den alten antut.

Die Fledermaus war das sechste und hat vor allem eines mitgebracht: die erste **domänenfreie**
Bewegung.

* **Kein Ausweichfächer, keine Domäne.** Wasser- und Landtiere weichen ihrem jeweiligen Rand
  fächerförmig aus (`FAN` in `js/sim/agents.js`) und dürfen ihn nie verlassen. Die Fledermaus darf
  überall hinfliegen – ihre Bewegung (`js/sim/bat.js`, `flyTowards`/`huntStep`) prüft gar keine
  Domäne, nur noch die Kartengrenze. Das war zugleich die teuerste Lektion beim Bauen: eine
  Bewegung ohne Domänenprüfung ist kein Freibrief, sie muss die Kartengrenze selbst respektieren,
  und ein Bogen mit begrenzter Drehrate (wie `walkStep`/`swimStep`) kann kurz über ein Ziel nah am
  Rand hinausschwingen. Ein direkter Kurs (jeden Tick exakt auf das Ziel zeigend) tut das beweisbar
  nie – die Karte ist ein Rechteck, und die gerade Strecke zwischen zwei Punkten darin bleibt
  selbst darin. Dasselbe Prinzip löste einen zweiten Fund: ein Wendekreis, der eine feste Dauer
  lang dreht statt jeden Tick zu prüfen, ob der Kurs schon zurück ins Gebiet zeigt, kann ebenso
  über den Rand hinaustreiben.
* **Zwei weltweite Pools statt eines Reviers.** Schlafplätze (zwei je Wald) und Jagdgebiete
  (5–7 pro Welt, als Ellipsen unabhängig von Weltobjekten) gehören keinem einzelnen Tier – jede
  Fledermaus wählt unabhängig von den anderen täglich neu aus demselben Topf. Das ist die vierte
  Form von Sozialverhalten im Katalog (nach Schwarm, Rotte, Familie am Bau) und die loseste: Nähe
  entsteht rein aus Zufall, nicht aus einem gemeinsamen festen Ort.
* **Die zweite Art ganz ohne Rückkopplung, aber aus einem anderen Grund als das Kaninchen.** Kein
  `forage`-Block, kein Durst, aber zusätzlich auch keine eigene Bedrohungsabfrage – anders als
  jede andere Art im Katalog prüft sie nie, ob ihr etwas gefährlich werden könnte. `agent.flight`
  sorgt umgekehrt dafür, dass sie für niemanden als Störung zählt, solange sie in der Luft ist
  (praktisch immer) – ohne das hätte sie jeden Barschschwarm unter einem Jagdgebiet aufgeschreckt,
  denn dessen Fluchtprüfung kennt keine Größenschwelle.
* **Jagdgebiete brauchen einen Terrainbezug wie ein Bau.** Der erste Anlauf verteilte die Ovale
  rein geometrisch über die Karte, ohne Rücksicht auf das Terrain darunter – gemessen landete die
  Fledermaus dadurch zu 77 % ihrer Zeit im Wald statt über Gras oder Wasser. Behoben mit demselben
  Muster wie beim Kaninchenbau: mehrere Kandidaten, Stichproben, der beste gewinnt.

Der Dachs war das siebte und hat vor allem eines gezeigt: eine Art mit echter Rückkopplung lässt
sich nicht mehr sauber isolieren, indem man sie einfach aus der Artenliste streicht.

* **Nicht die dritte, sondern noch einmal dieselbe Form von „nur den Ort teilen".** Wie das
  Kaninchen teilt die Dachsfamilie sich einen Bau, ohne Verband zu sein (`js/sim/dachs.js`,
  wiederverwendet `WL.Rules.placement.forestBurrow` in `js/world/rules.js` – derselbe Mechanismus
  wie beim Kaninchenbau, nur mit Waldoberfläche statt offenem Gelände und mit Höchst- statt
  Mindestabständen, siehe unten). Neu daran: der Dachs kennt sein Revier wie das
  Wildschwein (Ortsnahrung im Umkreis des Baus, nicht gesehen wie beim Reh), ist aber dabei
  Einzeltier, nicht Rotte – die Familie koppelt nur den Schlafplatz, jede nächtliche Entscheidung
  trifft jeder Dachs für sich.
* **Gezielt und streifend ist dieselbe Bewegung, nur mit verschiedener Zielwahl.** Kein eigenes
  Streiftempo, kein eigener Zustand dafür – der Rhythmus „geradewegs zum Futter/Wasser, dann eine
  Weile lose streifen mit häufigen Pausen, dann wieder gezielt" entsteht allein daraus, *wann* ein
  neues Ziel gesucht wird, nicht aus unterschiedlichen Tempowerten.
* **`nearestDisturber` liefert den nächsten Kandidaten, nicht den nächsten relevanten – und das
  wurde erst mit der siebten Art sichtbar.** Die Prüfung „ist ein Kaninchen ohne Wirkung auf Ente,
  Barsch, Reh, Wildschwein" stand seit dem Kaninchen und bestand jeden Test — bis der Dachs dazukam.
  Der Grund: `ctx.nearestDisturber` (`js/sim/simulation.js`) gibt je Anfrage nur das *nächste* Tier
  zurück, gleich welcher Größe; ist das zufällig ein zu kleines (ein Kaninchen), wird die Anfrage
  mit „keine Bedrohung" beantwortet, *obwohl* vielleicht einen Schritt weiter ein wirklich großes
  Tier steht, das nie geprüft wird. Mit sechs Arten kam das auf Seed 482917 nie vor; mit dem Dachs
  als siebter, frei durchs Revier laufender Art schon – und weil ein einziger so verpasster oder neu
  ausgelöster Fluchtmoment den weiteren Tagesverlauf eines Tieres komplett umwirft (ein chaotisches
  System), reichte das, um `WL.Simulation.run(world, { species: [...] })`-Vergleiche, die das
  Kaninchen oder die Fledermaus isoliert testen sollten, mit dem Dachs im Feld deutlich zu
  verfälschen. Behoben nicht am Mechanismus (der bleibt, wie er ist – ein Beobachter am Bildschirm
  hätte dieselbe Überraschung), sondern am Test: die Kaninchen- und Fledermaus-Vergleiche in
  `tools/simtest.js` laufen jetzt ausdrücklich auf dem Sechs-Arten-Stand von vor dem Dachs, der
  Dachs bekommt eine eigene, ausdrücklich *nicht* auf Null geprüfte Einflussmessung.
* **Das Revier war im ersten Anlauf zweimal falsch dimensioniert, in entgegengesetzte
  Richtungen.** Ameisenhügel lagen zunächst *im selben* Revier wie Nüsse und Pilze und wurden nach
  Nähe mitgewählt – am Bildschirm sah das nach einem diffusen, zu großen Streifgebiet aus, nicht
  nach „Zuhause plus gelegentlichem weiten Ausflug". Behoben, indem der Ameisenhügel-Ausflug ganz
  aus dem Revier herausgelöst wurde (revierfrei gesucht, `pickAnthill`, mit explizitem Heimweg
  danach, `beginReturnHome`) – und dabei wurde das Revier selbst versehentlich auf 140 u verkleinert,
  statt es bei seiner ursprünglichen Größe zu lassen. Der Nutzer wollte das Gegenteil: einen Dachs,
  der spürbar weit läuft. Korrigiert auf 500 u, dazu die Streifschritte selbst verlängert (30–90 u
  → 60–220 u) – sonst hätte ein kurzer Schritt in einem so großen Revier kaum je dessen Rand
  erreicht. Lehre: „Gebiet wirkt zu groß/diffus" und „Gebiet soll größer sein" klingen im ersten
  Satz ähnlich, sind aber entgegengesetzte Zusagen – bei Unsicherheit lieber nachfragen, was genau
  am Bild falsch wirkt, bevor eine Zahl in die falsche Richtung verändert wird.
* **„Wer überfälliger ist, geht zuerst" (die Wildschwein-Regel für Durst/Suhlen) trägt nicht jede
  Priorität – nur Bedürfnisse mit ähnlichem Takt.** `chooseTarget` prüfte den Durst zuerst, mit der
  Begründung, „das jeweils überfälligere Bedürfnis gewinnt" (wie bei Reh/Wildschwein). In der Praxis
  gewann der Durst *jede* Nacht: `nextDrink` läuft über den ganzen, auch schlafenden Tag weiter,
  das Trinkintervall (3.5–8.5 h) ist viel kürzer als ein Tag, und beim Aufwachen war der Durst darum
  immer um 170–190 s überfällig – gemessen im Vergleich zum Ameisenhügel, der als Einmal-pro-Nacht-
  Ereignis gerade erst fällig wurde und darin nie gewinnen konnte. Ergebnis: der Ameisenhügel wurde
  in einem 5-Tage-Lauf höchstens einmal besucht, nicht die versprochenen fünf. Der Unterschied zum
  Wildschwein: dessen Durst und Suhlbedürfnis laufen *beide* die ganze Wachzeit über mit ähnlichem
  Takt, ein fairer Vergleich funktioniert dort. Ein Vergleich zwischen einem kontinuierlich
  überfälligen Bedürfnis und einem diskreten Einmal-Ereignis ist dagegen keiner – der Dauerbedarf
  gewinnt strukturell immer. Behoben durch eine feste Reihenfolge statt eines Vergleichs (Ameisen
  zuerst, wörtlich wie „bevorzugt" in data/tiere.md §3 es schon sagte), nicht durch Nachjustieren der
  Zahlen. Dieselbe Debug-Sitzung deckte nebenbei auf, dass das vermeintliche „Herumtrippeln" am
  Ameisenhügel gar keine Positionsänderung war (Bewegungsspur exakt 0.00 Einheiten breit), sondern
  nur ein zu kräftiges Kopfwiegen (`eatStep`, 0.20 rad/s bei 0.8 Hz, mehr als die Streifpause mit
  0.15) – auf 0.05 bei 0.4 Hz gesenkt. Lehre: bevor eine gemeldete Bewegung im Code gesucht wird,
  erst mit der Aufzeichnung selbst prüfen, ob sich die Position überhaupt ändert – sonst wird an der
  falschen Stelle (Bewegungslogik statt Idle-Animation) gesucht.
* **Ein Heimatort mit *Höchst*-Abständen wird nicht mehr frei gewürfelt, sondern vom Zielobjekt aus
  gesucht.** Der Bau soll nah an Wasser *und* nah an einem Ameisenhügel liegen (je ≤ 300 u, dazu
  ≥ 140 u vom Wasser, damit das Revier nicht am Ufer klebt und den Barschschwarm aus seiner
  Ruhezone treibt). Der bisherige Ansatz „ziehe eine zufällige Waldzelle, prüfe die Regel" trifft
  das kaum: Wald ist ein Viertel der Karte, die 300-u-Kreise um 3–4 Hügel zusammen keine zwei
  Zehntel. `findBurrow` zieht deshalb erst einen Ameisenhügel und dann eine Waldstelle in dessen
  Umkreis. Vier Stufen lockern nacheinander (zweiter Bau darf näher rücken → Abstände × 1.6 →
  Nähebedingung fällt ganz weg), damit auf einer ungünstigen Karte nicht die ganze Art ausfällt –
  dieselbe Vorsicht wie beim Kaninchenbau, nur mit einer Bedingung mehr.
* **Ein festes Zuhause neben einer geteilten Nahrungsquelle ist eine Monopolstellung.** Solange der
  Bau irgendwo im Wald lag, verteilten sich die nächtlichen Ameisenhügel-Ausflüge der Familie über
  die ganze Karte. Seit er am Hügel steht und der nächste Hügel bevorzugt wird, gräbt dieselbe
  Familie Nacht für Nacht *denselben* Hügel leer – dem Wildschwein, das sich die Ameisenkarte mit
  ihm teilte, fiel damit dauerhaft eine Nahrungsquelle weg, und vier seiner justierten Werte
  rutschten unter die Grenzen in `tools/simtest.js`. Die Ursache war messbar und nicht nur
  vermutet: schaltet man allein die Ameisenaufnahme des Dachses ab, sind die Wildschweinwerte
  bitgleich mit „ganz ohne Dachs"; schaltet man seine Nussaufnahme ab, ändert sich nichts. Behoben
  mit dem in `tiere.md` §1 längst vorgesehenen Mittel: eigene Nahrungsart (`ameisenbrut`) auf
  denselben Hügeln. Lehre: eine geteilte Nahrungskarte verträgt zwei umherziehende Arten, aber
  nicht eine ortsfeste, die direkt auf einer Fundstelle wohnt – wer einen Heimatort an eine
  Nahrungsquelle bindet, muss prüfen, wem diese Quelle sonst noch gehört.
* **Eine feste Prioritätsreihenfolge macht aus einer Familie von Einzelgängern einen Pulk.** Das
  Wachfenster gilt für die ganze Art gleich; steht dahinter für alle dieselbe erste Entscheidung
  („zuerst der Ameisenhügel"), brechen alle Mitglieder in derselben Sekunde zum selben Ziel auf
  (gemessen: alle innerhalb von 2–5 s außerhalb des Bauumkreises). Behoben mit zwei kleinen
  Streuungen statt einer neuen Mechanik: ein ausgewürfelter erster Zug der Nacht (Trinken, Hügel
  oder Streifzug) und 0–15 s Trödeln am Bau. Danach 100–220 u Abstand in den ersten 40 s.
  Nebenbefund: die Aufzeichnung beginnt **mitten** im Wachfenster, der allererste Augenblick lief
  deshalb an der ganzen Aufwach-Logik vorbei – und genau der ist das Erste, was man beim Start
  sieht. Wer etwas beim Aufwachen streut, muss es auch beim Anlegen des Tieres streuen.
* **In einer kurzen Nacht verdrängt eine lange Pflichthandlung stillschweigend alles danach.** Der
  Ameisenhügel kostet mit Hin- und Rückweg gut die Hälfte der rund 105 nutzbaren Sekunden einer
  Nacht, und die anschließende Streifphase war mit 45–110 s allein schon länger als der Rest –
  gemessen kam der Dachs dadurch auf **0.0–0.1 Trinkgänge je Nacht** statt der zugesagten 1–3,
  ohne dass irgendwo ein Fehler stand. Das fällt nicht auf, weil nichts abbricht: die Prüfung wird
  einfach nie erreicht. Drei Zweige und drei Zahlen später sind es 1.3. Lehre: bei einer Art mit
  kurzem Wachfenster gehört das **Zeitbudget einer Nacht** auf den Zettel, bevor Bedürfnisse
  priorisiert werden – und jede Zusage in `tiere.md`, die eine Rate nennt („1–3 Mal pro Nacht"),
  muss auch gemessen werden, sonst steht sie nur da. Nebenbefund beim Suchen: von den Trinkgängen
  scheiterte **kein einziger** unterwegs – wer eine zu niedrige Rate sieht, sollte zuerst prüfen,
  ob es an fehlgeschlagenen oder an gar nicht erst begonnenen Versuchen liegt.

Der Fuchs war das achte und letzte und hat zwei Dinge mitgebracht, die es vorher nicht gab:

* **Ein Revier als Form statt als Radius** (`js/sim/fox.js`, `buildRange`). Kaninchen und Dachs
  haben einen Kreis um einen Punkt, das Wildschwein das umschließende Rechteck einer Waldregion –
  beides kann man nicht *ablaufen*. Eine Reviergrenze braucht Stützstellen, deshalb ist die Blase
  eine Radialkontur `r(theta)` über einer Ellipse. Sie ist die Ellipse und nicht der Kreis, weil
  eine Kartenzelle rechteckig ist: ein flächengleicher Kreis in einer 800 × 500-Zelle ragt weit
  oben und unten hinaus und lässt die Ecken leer (gemessen 53 % Überlappung statt 10 %).
* **Jagd auf andere Agenten** (`ctx.nearestPrey` in `js/sim/simulation.js`, Zustand `hetzen`).
  Bis hierher hat jedes Tier nur *reagiert*; keins hat ein anderes gesucht. An Ente und
  Kaninchen war dafür **nichts** zu ändern – ihre Fluchtzweige stehen seit dem jeweiligen Tier
  und liefen bis dahin weitgehend ins Leere.

Nebenbei kam ein neuer Zustand dazu (`hetzen`, 16) statt `jagen` (15) mitzubenutzen: dessen
`AIRBORNE`-Eintrag steht auf `true`, weil er das Jagen der *Fledermaus* meint. Ein hetzender
Fuchs hätte damit als "Zeit über Land (Flug)" gezählt.

Ursprünglich geplante Reihenfolge war *Reh → Kaninchen → Wildschwein → Dachs → Fuchs → Ente →
Barsch → Fledermaus* (erst Land, dann Wasser, dann Luft). Gestartet wurde stattdessen mit den
beiden Wassertieren, weil die Wasserdomäne (`js/sim/habitat.js`) zuerst stand; das Wildschwein kam
dann vor dem Kaninchen dran, und die Fledermaus vor Dachs und Fuchs, weil der Nutzer sie zuerst
besprechen wollte – die Reihenfolge ist eine Empfehlung, kein Zwang.

### Was der Fuchs gekostet hat: vier Anläufe, alle an der Geometrie

Das *Verhalten* lief beim ersten Durchlauf innerhalb aller Zusagen (2.1 Patrouillen und 1.8
Trinkgänge je Nacht, Jagd auf beide Beutetiere). Zeit gekostet hat ausschließlich die Frage,
welche Form ein Revier hat – und jedes Mal war die Lehre dieselbe: **eine Zusage, die eine Zahl
nennt, muss aus der Geometrie folgen oder nachgemessen werden; hoffen genügt nicht.**

* **Ein Kreis in einer rechteckigen Zelle überlappt den Nachbarn zu 53 %.** Behoben mit einer
  Ellipse im Seitenverhältnis der Zelle (flächengleich, also ohne die Aufteilung zu ändern).
* **Die Streuung des Mittelpunkts und die Größe teilen sich denselben Spielraum.** Zwei gleiche
  Ellipsen im Abstand d halten die 10 % ein, wenn `d/(2r) >= 0.80` ist – der Abstand ist aber
  die Zellbreite *minus zweimal die Streuung*. Mit dem mittleren Drittel der Zelle als Streuung
  (bis 266 u) war die ganze Reserve weg: 36 % Überlappung. Mit einer Streuung von nur 4 %
  unterschieden sich die Kandidaten dann praktisch nicht mehr, und die Suche nach Wasser und
  Wald lief ins Leere (6 Reviere ohne einen Waldflecken). Beide Zahlen gehören zusammen gelesen.
* **Nachkorrigieren lässt sich nur ein Rest.** Eine Beule der Kontur kann auf den Nachbarn
  zeigen; dagegen hilft nur Messen und Verkleinern. Mit zu großer Streuung davor musste diese
  Korrektur ein Revier aber auf ein Viertel der Fläche stauchen – die 10 % hielten, "halbwegs
  gerecht" war weg. Deshalb ist sie jetzt gedeckelt: lieber ein Revier knapp über der Grenze
  als eins, das keins mehr ist.
* **"Im Revier" geht vor "im Wald".** Ein Fuchs schläft zwei Drittel jedes Tages im Bau. Lag der
  außerhalb der Blase (weil im Revier kein Wald war), verbrachte das Tier zwei Drittel seines
  Lebens außerhalb seines Reviers – Reviertreue 54 % statt 97 %.

### Zwei Fallen, die schon dokumentiert waren und trotzdem wieder zugeschlagen haben

* **Der Ausweichfächer kann nicht umdrehen** – die Reh-Falle, in neuer Form. Beim Fuchs genügte
  `heading += PI` *nicht*, weil `walkStep` die Blickrichtung in jedem Tick wieder auf den
  Zielpunkt zudreht: die Kehrtwende war im nächsten Tick schon halb zurückgenommen. Ein Fuchs
  lief dadurch die letzten vier Tage in einem 130 u langen Streifen am Kartenrand auf und ab.
  Behoben, indem er für 1.5–3.5 s **gar kein Ziel mehr verfolgt**, sondern nur eine Richtung
  (`roamStep`, dieselbe Bewegung wie bei der Flucht). Lehre: wer aus einer Sackgasse heraus
  will, muss aufhören, das Ziel anzusehen.
* **Derselbe Fächer lässt ein Landtier ganze Seen umrunden.** Liegt das Ziel jenseits eines
  Sees, läuft das Tier am Ufer entlang, bis es vorbei ist. Bei Reh und Dachs fällt das nicht
  auf, weil ihre Ziele nah beieinanderliegen; die Querung des Fuchses geht dagegen absichtlich
  durch das *ganze* Revier. Auf dem Vorschaubild zeichneten vier Füchse in fünf Nächten **jede
  Seekontur der Karte** als dicke Linie nach. Behoben mit einem Blick nach vorn (`pathClear`):
  ein Ziel, dessen gerader Weg durch Wasser ginge, wird gar nicht erst gewählt. Das ist keine
  Wegfindung – es verwirft nur Ziele, statt um sie herumzusuchen.

> **Beide Male hat das Bild den Fehler gezeigt, nicht der Test.** Der Fuchs blieb dabei die
> ganze Zeit in seinem Terrain, reproduzierbar und innerhalb aller Raten – `tools/preview.js`
> mit `--art=fuchs` war das Werkzeug, das es sichtbar gemacht hat. Der Schalter ist eigens dafür
> entstanden: bei acht Arten deckt eine Spur die andere zu.

### Was der Fuchs den anderen angetan hat

Genau drei Arten verschoben, und jede mit einem Grund: **Ente und Kaninchen**, weil er sie jagt
(das ist die Zusage), und **Barsch**, weil er nachts sein ganzes Revier abgeht und jedes Revier
ein Gewässer enthält. **Reh, Wildschwein, Fledermaus und Dachs stehen bitgleich auf ihren alten
Werten** – Größenklasse 2 löst bei ihnen nichts aus, und er nimmt niemandem Futter weg.

Vier Prüfschwellen in `tools/simtest.js` mussten steigen (Barsch nachtaktiv 20 → 25 %, Barsch
Ruhezone 80 → 100 u, Barsch "nachts langsamer" 0.85 → 0.90, Ente "nachts wach" 28 → 36 %). Das
ist derselbe Vorgang wie beim Wildschwein, nur eine Stufe stärker – und diesmal mit einer
Ursache, die sich nicht wegtunen lässt: ein Tier, das jede Nacht sein ganzes Revier abläuft,
kommt zwangsläufig regelmäßig ans Ufer, und die Fluchtprüfung des Barsches kennt keine
Größenschwelle.

> **Der Dachs-Einflussvergleich ist deshalb festgenagelt worden**, genau wie vorher schon die
> Kaninchen- und Fledermaus-Vergleiche: er läuft ausdrücklich auf dem Sieben-Arten-Stand von vor
> dem Fuchs. Sonst misst er "Dachs plus Fuchs gegen Fuchs allein" statt "Dachs gegen keinen
> Dachs". **Regel für die nächste Art: wer eine Einflussmessung schreibt, pinnt die
> Vergleichsliste auf den Stand von damals, nicht auf `WL.SPECIES_ORDER`.**

### Die erste Nachjustierung am fertigen Kernset: der Fuchs, drei Zahlen

Gewünscht war dreierlei am laufenden Bild: **20 % schneller, 20 % kleineres Revier, mehr am
Revierrand unterwegs.** Die ersten beiden sind je eine Zahl (`speed`, `home.fill`), die dritte
war keine – und daran hängt die Lehre dieser Runde.

* **Die dritte Ansage war schon durch die ersten beiden verletzt.** Eine 20 % kürzere Kontur mit
  20 % mehr Tempo kostet je Teilrunde nur noch zwei Drittel der Zeit; bei unverändertem
  `patrol.share` wäre der Fuchs mit rund 27 % statt 39 % der Wachzeit im äußeren Ring gelandet –
  also **weniger** am Rand, nachdem der Nutzer *mehr* verlangt hatte. `share` musste von 0.40 auf
  0.75 steigen, um bei 47 % herauszukommen. **Wer eine Größe oder ein Tempo anfasst, hat das
  Bewegungsmuster schon angefasst; ein Anteil am Umfang ist keine Zeit.**
* **„Mehr am Rand" hatte keine Messung, also gab es sie vorher nicht.** `patrolSeen` sagt nur,
  dass jede Stützstelle *einmal* besucht wurde – über 100 %, egal wie das Bild aussieht. Neu ist
  deshalb der Anteil der Wachzeit ab 0.75 des örtlichen Radius (`tools/simtest.js`), samt der
  Zahl von vorher (39 %) als Vergleichspunkt. **Eine Ansage, die man nicht misst, kann man nicht
  einhalten – man kann sie nur behaupten.**
* **Die Obergrenze stand bei einer anderen Art.** 0.85 statt 0.75 trug das Zeitbudget noch
  (50 % im Ring, Trinkgänge unverändert), aber ein Fuchs länger auf der Grenze ist ein Fuchs
  länger am Ufer: auf Seed 315927 war die Nachtruhe des Barschschwarms nicht mehr messbar. Diese
  Schwelle war wegen des Fuchses schon einmal nachgegeben worden – ein zweites Mal wäre sie keine
  Zusage mehr, sondern eine Nachlaufzahl. **Beim vollständigen Kernset entscheidet über den
  Spielraum einer Art regelmäßig eine andere.**
* **Eine kleinere Blase trifft schlechter.** Zwei von 31 Revieren hatten danach kein Gewässer
  mehr – ein Verstoß, kein Messwert, denn dort fällt das Trinken aus. Bezahlt wurde es aus
  derselben Änderung: das kleinere Revier hat Überlappungsreserve frei gemacht, der Mittelpunkt
  darf jetzt in einer **dritten** Stufe weiter wandern. Mitgefallen sind der geteilte Dachsbau
  (8 → 5 von 10 Welten) und die Reviertreue (94 → 92 %); beides steht als Preis in
  `data/tiere.md` und ist nicht wegzutunen.

> **Und eine Nebenwirkung im Merkmalsvektor**, die nicht auf dem Bild steht: die Bewegungsunruhe
> des Fuchses ist von 0.25 auf 0.32 rad/s gestiegen (kürzere, stärker gekrümmte Kontur mit mehr
> Tempo = öfter drehen), damit auf vier Hundertstel an den Dachs heran. Die Zeile trennt die
> beiden nicht mehr. **Jede Justierung am Verhalten ist eine Justierung am Merkmalsraum** – und
> der ist der eigentliche Zweck des Spiels.

### Die zweite Nachjustierung: „im Revier bleiben" und „an der Grenze laufen" zugleich

Gewünscht war beides auf einmal: **die Füchse verlassen zu oft ihr Revier und sind zu wenig an
den Grenzen.** Die beiden Ansagen ziehen gegeneinander – wer sich am Rand aufhält, tritt
leichter hinaus; wer sicher drin bleiben soll, endet in der Mitte. Ergebnis: **92 → 97 % im
eigenen Revier und 47 → 52 % der Wachzeit im äußeren Ring.**

* **Zuerst messen, wodurch er hinaustritt, dann bauen.** Der erste Griff wäre gewesen, an
  Reviergröße oder Fluchtdauer zu drehen. Die Messung (Zeit außerhalb nach Zustand *und* Ziel,
  dazu die Austritte einzeln gezählt) zeigte etwas anderes: **die Hälfte aller Austritte kam aus
  der Flucht**, ein Fünftel vom Schlafplatz neben einem grenznahen Bau – und der größte
  *Zeitposten* war die Querung, die 17.7 % ihrer Dauer draußen lief. Vier verschiedene Ursachen,
  vier verschiedene Antworten, keine einzige davon eine Zahl in `species.js`.
* **Eine Radialkontur ist sternförmig, aber nicht konvex.** Jede Strecke von der Reviermitte
  nach draußen bleibt drin – eine Sehne zwischen zwei Punkten darin nicht, sie schneidet die
  Beulen ab. Die Querung ist ihrem Zweck nach die längste Sehne im Revier und war deshalb der
  größte Posten. Aus derselben Eigenschaft folgt die Reparatur: hält die Sehne nicht, wird das
  Ziel **über die Mitte** angesteuert. **Wer die Geometrie seiner Zusage kennt, kennt auch ihre
  Bruchstelle.**
* **Der erste Versuch nahm die andere Ansage über die Hintertür zurück.** Statt über die Mitte
  zu fahren, wurde das Querungsziel zur Mitte hin *nachgezogen*, bis die Sehne hielt. Das
  funktionierte – und ließ die Ziele bei 0.6 statt 0.85 des Radius landen, weil quer durchs
  Revier fast jede Sehne irgendeine Beule anschneidet. Reviertreue gut, Randanteil wieder auf
  Anfang. **Bei zwei gegenläufigen Ansagen muss jede Änderung an beiden gemessen werden, nicht
  an der, für die sie gemeint war.**
* **Der billigste Weg an den Rand war der, der keine neue Zeit kostet.** `patrol.share` von 0.75
  auf 0.85 brachte einen Punkt Randanteil und halbierte den Abstand zur Barsch-Schwelle (die
  Grenze von oben, unverändert). Der **Saum** – ein Stück Grenze am Ende jeder Querung, dort wo
  der Fuchs ohnehin schon steht – brachte fünf Punkte und ließ den Schwarm unberührt.
* **Was ein eigener Zustand ist, braucht einen eigenen Index.** Der Saum zählt auf `rimIndex`
  weiter und nicht auf `patrolIndex`; sonst spränge die nächste Teilrunde dorthin, wo die letzte
  Querung zufällig geendet hat, und die über fünf Nächte geschlossene Blase wäre weg.
* **Die Prüfschwelle war die alte Beschwerde in Zahlen.** `tools/simtest.js` ließ bis dahin 70 %
  Reviertreue durch – genau den Zustand, den der Nutzer beanstandet hat. Sie steht jetzt bei
  90 %, die Randschwelle bei 48 %. **Eine Schwelle, unter der die Beschwerde des Nutzers noch
  durchgeht, ist keine.**

### Die dritte Nachjustierung: der Fuchs, der Seen umrundet

Beanstandet war ein Bild: liegt ein See im Revier oder an dessen Rand, verbringt der Fuchs sehr
viel Zeit am Ufer, weil er immer wieder *durch* den See ins Revier will. Gesucht war „ein
eleganter Weg um den See herum". Ergebnis: die Strecke näher als 25 u am Wasser fällt von
**13.3 % auf 8.0 %** der Gesamtstrecke (Untergrenze durch die Landfläche selbst: 5.9 %),
Ufermärsche ab 120 u am Stück **343 → 158**.

* **Der Ring war nicht die Zielwahl, sondern der Ausweichfächer.** Ziele im oder hinter dem
  Wasser wurden längst gemieden – trotzdem stand der Ring auf dem Bild. Grund: der Fächer
  (±109°) *blockiert* nicht, er *schiebt*. Ein Tier, dessen Ziel jenseits eines Sees liegt,
  läuft am Ufer entlang, bis das Ziel wieder frei liegt. **Wer eine Bewegung sieht, die er nie
  programmiert hat, sucht sie in der Ausweichlogik, nicht in der Entscheidungslogik.**
* **Die Lösung war eine zweite Sicht auf dieselbe Karte, keine Wegfindung.** Der Fuchs bekam
  ein Ersatz-`land`, dessen `walkable` zusätzlich 20 u Abstand zum Wasser verlangt – zwölf
  Zeilen, kein neuer Zustand, keine Änderung an `land.js`. Der Fächer schiebt ihn dann *vor*
  dem Streifen herum statt auf der Wasserlinie. **Weil `walkStep` nur `land.walkable` braucht,
  ist ein solcher Stellvertreter überhaupt möglich** – das ist der Ertrag einer schmalen
  Schnittstelle, Jahre nachdem sie geschrieben wurde.
* **Die Sicht muss abschaltbar sein, sonst nimmt sie eine andere Zusage zurück.** Beim Trinken,
  auf der Hetze und wenn er ohnehin schon im Streifen steht, gilt wieder das echte Gelände –
  sonst käme die Art nie mehr ans Wasser oder bliebe im Streifen kleben. Vier Aufrufstellen,
  eine Funktion (`walkLand`), die entscheidet.
* **Die Breite des Streifens hat der Barsch bestimmt, nicht der Fuchs.** Breitere Bögen (55 und
  95 u) sahen auf dem Bild besser aus und drückten den Schwarm auf Seed 999999 aus seiner
  Nachtruhe (0.95 statt erlaubter 0.90). **Zweimal hintereinander stand die Obergrenze für eine
  Fuchsänderung bei einer anderen Art** – bei einem Räuber ist das der Normalfall und keine
  Überraschung mehr.
* **Vor dem Ändern: prüfen, ob der Testfehler überhaupt an der Änderung liegt.** Nach dem
  ersten Umbau kippte eine Barsch-Prüfung. Vier winzige, sachlich neutrale Störungen am Fuchs
  (letzte Nachkommastelle einer Streuung) ergaben *identische* Zahlen – die Simulation ist an
  dieser Stelle also nicht chaotisch, der Fehler kam wirklich vom Umweg. Erst danach lohnte
  die Suche. **Ein A/B ohne Rauschmessung ist eine Vermutung.**
* **Und wieder hat das Bild entschieden, nicht der Test.** `simtest.js` war schon grün, als der
  Ring noch auf der Karte stand: keine Prüfung misst „läuft am Ufer entlang". Gemessen wurde er
  erst, nachdem er auf `preview.js --tiere --art=fuchs` zu sehen war.

### Was der Bussard gelehrt hat: zwei Wartezeiten sind eine dritte

Das *Verhalten* stand beim ersten Durchlauf: 1.00 Kaninchenbesuche je Tag auf jedem der zehn
Seeds, kein Punkt außerhalb der Karte, 83 % der Kreiszeit über offener Fläche. Die drei Lehren
kamen woanders her.

* **Zwei Wartezeiten hintereinander ergeben eine dritte, viel längere – und keiner der beiden
  Werte sieht danach aus.** Die Sitzpausen am Waldrand landeten bei 4 % statt der geplanten 18 %,
  obwohl „nach 25–60 s Kreisen, mit 35 % Wahrscheinlichkeit" harmlos aussieht. Gerechnet ist das
  eine mittlere Wartezeit von über zwei Minuten, bei einem Wachfenster von 138 s. Behoben durch
  Streichen der Wahrscheinlichkeit, nicht durch Drehen an ihr: **die Streuung einer Spanne ist
  schon eine Lotterie, eine zweite darüber ist eine Multiplikation.** Dieselbe Falle wartet bei
  jedem „alle X Sekunden, manchmal".
* **Erst messen, welcher Zweig scheitert, dann reparieren.** Die naheliegende Vermutung war das
  Gelände („er findet keinen Waldrand"). Drei Zähler im Tier zeigten: **0 von 32 Versuchen**
  scheiterten daran, alle Verluste kamen aus den Wartezeiten und aus dem Tagesende. Zwei
  Justierungen davor waren wirkungslos verpufft, weil sie an der falschen Zahl drehten – die
  gemessene Aufteilung hat das in einem Lauf entschieden. Die Zähler sind danach wieder raus, ihr
  Ergebnis steht als Kommentar im Code.
* **Ein Kreis mit Mittelpunkt und Radius kann nicht von der Karte fallen, ein Bogen mit Drehrate
  schon.** Die Fledermaus ist an genau dieser Stelle zweimal gescheitert. Der Bussard fliegt
  seine Schleifen deshalb **im Winkel** (`x = cx + cos(a)·r`) statt über eine Drehrate, und die
  Mittelpunkte halten `r + edgeMargin` Abstand zum Rand. Die Randbedingung steht damit an *einer*
  Stelle und wird nicht in jedem Bewegungszweig neu geprüft – gemessen: null Verstöße.

> **Und ein Befund, der wichtiger ist als das Tier: der erste indirekte Einfluss.** Der Bussard
> ist außer im engen Jagdkreis für niemanden greifbar und erreicht dort nur die Fluchtschwelle des
> Kaninchens – trotzdem verschiebt er gemessen fünf Arten. **Ohne den Fuchs bleibt genau das
> Kaninchen übrig**, und damit ist die Kette bewiesen statt vermutet: Kaninchen öfter im Bau →
> für den Fuchs unerreichbar (`nearestPrey` überspringt `bau`) → seine Nächte laufen anders → was
> er am Ufer aufscheucht, ändert sich mit. **Wer eine Einflussmessung schreibt, misst ab jetzt
> zweimal: einmal mit und einmal ohne den Räuber dazwischen.** Sonst liest man eine Kettenwirkung
> als direkte und sucht den Fehler an der falschen Stelle.

### Was der Hecht gelehrt hat: ein halbes Rasterfeld, zwanzigmal addiert

Das *Verhalten* stand beim ersten Durchlauf innerhalb der Zusagen (71 % lauernd, 3 Ausfälle je Tag,
Einfluss auf genau eine Art). Zeit gekostet haben zwei Dinge, und beide waren Messfehler in dem
Sinne, dass am falschen Ort gesucht wurde.

* **Ein Ankunftsradius ist ein Versatz in *eine* Richtung, kein Rundungsfehler.** Der Hecht hält
  vor seinem Lauerplatz an, und weil er immer aus dem tieferen Wasser kommt, immer auf der
  Seeseite. Solange dieser Halt zum neuen Anker wurde, wanderte er nach jedem Sprint weiter
  hinaus – auf Seed 13579 von Ufertiefe 4 auf 11 Zellen. **Der Beleg kam nicht aus dem Histogramm,
  sondern aus dem Protokoll der Übergänge**: alle 19 zu tiefen Lauerplätze kamen vom Rückweg eines
  Sprints, kein einziger von einem Umzug. Vorher waren zwei Justierungen an der Tiefenspanne
  wirkungslos verpufft, weil sie an der falschen Zahl drehten. Dieselbe Lehre wie beim Bussard:
  erst messen, **welcher Zweig** scheitert.
* **Ein Effekt, der auf einem Seed nicht zu sehen ist, ist nicht unbedingt keiner.** Die Meidung
  wurde erst auf Seed 482917 gemessen (16 % gegen 13 %, also nichts), daraufhin eine Abstoßungs­
  kraft eingebaut, und *die* dann über zehn Seeds gemessen – wo sie sich als schädlich erwies. Die
  richtige Reihenfolge wäre gewesen, zuerst über alle zehn zu zählen: ein einziger Ausfall wirft
  den Tagesverlauf des ganzen Schwarms um, die Streuung zwischen zwei Seeds ist größer als der
  Unterschied, den die Regel macht. **Das steht seit dem Reh in dieser Datei** („dass eine einzelne
  Welt gar kein Sichern zeigt, ist kein Fehler") und hat trotzdem wieder zugeschlagen.

> **Der eigentliche Fund: was einer Art ihren Charakter gibt, kann bei der nächsten das Werkzeug
> unbrauchbar machen.** Eine Abstoßungskraft gegen den Hecht trieb den Barschschwarm messbar
> *näher* an ihn heran (194 Ausfälle gegen 159 ohne die Kraft) – weil der Barsch mit Trägheit
> fährt und eine Kraft dort kein Hindernis ergibt, sondern das Überschießen, das ihn wogen lässt.
> Der weggedrückte Fisch wird von der Kohäsion zurückgeholt und kommt auf der anderen Seite näher
> heraus. Wer einer vorhandenen Art etwas hinzufügt, muss ihren Bewegungstyp kennen, nicht nur
> ihre Zahlen.

> **Und ein Befund, der keine Reparatur braucht: der meiste Abstand ist strukturell.** Der Hecht
> liegt bei Ufertiefe 2–4, und dort hält `shoreAccel` den Schwarm ohnehin heraus. Die Meide-Regel
> trägt 8 % weniger Ausfälle bei – den Rest, den die Geografie übriggelassen hat. Dasselbe Prinzip
> wie „Wald wird abzüglich eines Uferstreifens gestempelt", nur diesmal als Befund statt als
> Entwurf.

### Was der Igel gelehrt hat: eine Flächennahrung am Rand ihrer Fläche

Das *Drehbuch* lief beim ersten Durchlauf: alle zehn Seeds mit Igel, jede Nacht derselbe Ablauf,
1.2 Trinkgänge, kein Punkt im Wasser oder außerhalb der Karte. Gekostet hat ausschließlich die
Frage, **welchen Platz er als nächstes wählt** – die Zusage „wechselt zwischen 3 bis 5
Nahrungsplätzen hin und her". Sie ist dreimal gekippt, und jedes Mal aus einem anderen Grund.

* **Ein Abstandsabzug, der größer ist als der ganze Wertebereich, ist keine Gewichtung, sondern
  eine Regel.** `distanceCost 0.0030` kostete einen Weg von 250 u einen Abzug von 0.75 – mehr, als
  Vorrat (0..1) und Zufall zusammen ausmachen können. Der nächste Platz gewann *immer*, und aus
  drei bis fünf Plätzen wurde ein Pendeln zwischen zweien. Dass er trotzdem keine weiten Wege
  macht, steht ohnehin in der Geometrie (alle Plätze im selben Umkreis); ein Abzug muss das nicht
  noch einmal erzwingen. Dieselbe Falle wie der Waldrandbonus des Rehs, nur andersherum.
* **Eine Flächennahrung am Rand ihrer Fläche zu mitteln, misst die Fläche und nicht den Vorrat.**
  Ein Waldrandplatz hat per Definition Nachbarn außerhalb des Waldes, und dort liefert `foodAt`
  eine 0 – nicht weil nichts mehr da wäre, sondern weil dort nie etwas war. Er bekam damit einen
  *festen* Abschlag, der sich nie ändert, weil Wiese nicht nachwächst, und verlor dauerhaft gegen
  einen halb leergefressenen Apfelbaum. **Gefunden wurde das nicht durch Nachdenken, sondern durch
  ein Protokoll der Zielwahl**: der Igel kam bei jedem Umzug auf 7 u genau an, kein einziger
  Fehlversuch – es war nie das Laufen, immer die Bewertung. Dieselbe Lehre wie beim Bussard und
  beim Hecht: erst messen, **welcher Zweig** scheitert.
* **Ohne Erschöpfung gibt es nichts zu wählen.** Mit `regrowPerSecond 0.0030` stand ein Platz nach
  einer Nacht wieder auf 1.0 – alle Kandidaten waren gleich gut, und die Wahl entschied allein der
  Zufall. Mit 0.0010 braucht ein besuchter Platz zweieinhalb Tage, bis er wieder die beste Wahl
  ist, und *daraus* entsteht das Hin und Her. Das ist die Gras-Mechanik des Rehs, an einer Art mit
  festen Punkten statt einer Fläche. Dazu gehört, dass die Fressfläche klein genug ist, damit sich
  Erschöpfung überhaupt zeigt: in 34 u liegen 140 Rasterzellen und der Igel berührt 25 davon, in
  20 u sind es 50 – erst dort fällt der Platz sichtbar ab.

> **Und ein Befund über den Merkmalsvektor, der wichtiger ist als das Tier: bei einem sehr
> langsamen Tier ist der Weg selbst Aufenthalt.** „Feste Orte" meldet für den Igel **1**, obwohl er
> 3–5 hat. `PLACE_MIN_DWELL` soll Zellen herauswerfen, die nur durchquert werden – wer aber fünf
> Nächte lang dieselbe kurze Strecke geht, liegt auf jeder Weg-Zelle über der Schwelle, und die
> Flecken verschmelzen. Nachgerechnet ist es wirklich das und nicht zu geringer Abstand: hebt man
> die Schwelle von 0.4 % auf 1.5 %, meldet derselbe Lauf 2–4 Orte. **An der Schwelle wurde nichts
> gedreht** – sie gilt für alle acht Kernarten, deren Werte in `tiere.md` §6 daran justiert sind.
> Eine Zusage über das *Verhalten* wird stattdessen dort gemessen, wo sie steht: als Zahl der
> wirklich genutzten Futterplätze.

> **Er berührt keine einzige Art direkt – und verschiebt trotzdem vier.** Drei Läufe zeigen den
> Weg: ohne Ente und Barsch keine Abweichung, ohne den Fuchs keine, vollständig vier Arten. Der
> Fuchs reagiert nicht auf ihn (Größenklasse 1), er *stolpert über ihn*: `ctx.nearestDisturber`
> liefert je Anfrage nur das nächste Tier, gleich welcher Größe, und ein Igel im Weg beantwortet
> die Anfrage mit „keine Bedrohung", obwohl einen Schritt weiter ein Wildschwein steht. Das steht
> seit dem Dachs in dieser Datei; hier ist es zum ersten Mal der **einzige** Kanal einer ganzen
> Art. Die Bussard-Regel („zweimal messen, mit und ohne den Räuber dazwischen") hat damit zum
> ersten Mal ein Ergebnis geliefert, das man ohne sie falsch gelesen hätte.

> **Werkzeuglücke nebenbei geschlossen:** `tools/preview.js` bekam `--neu=<id>`. Ohne das ist ein
> Blick auf eine Nachzügler-Art Glückssache – je Welt wird *eine* aus `WL.NEW_SPECIES` gezogen, bei
> dreien also im Mittel jeder dritte Seed. Für `simtest.js` war dieselbe Lücke seit dem Hecht
> geschlossen (`fullWith`); „ansehen und nachjustieren" braucht sie genauso, sonst justiert man an
> einem Bild, auf dem das Tier gar nicht ist.

### Drei Fallen, die beim Wildschwein Zeit gekostet haben

Alle drei haben dieselbe Form: **eine Gruppe ist nicht die Summe ihrer Tiere**, und wer sie am
Mittelwert misst oder steuert, misst und steuert etwas anderes als er glaubt.

* **Ankunft am Schwerpunkt gibt es nicht.** Stehen die Tiere an zufälligen Plätzen im Umkreis von
  130 u, liegt ihr Schwerpunkt bei drei bis fünf Tieren systematisch daneben und erreicht einen
  Ankunftsradius von 30 u womöglich nie. Die Rotte lief dadurch permanent, ohne je anzukommen:
  3 % Fresszeit, tagsüber 5–16 % schlafend. Gemessen wird am **vordersten Tier**.
* **Ein Umkreis ist kein Abstand.** Fünf Tiere in einem Kreis stehen enger als drei – der Abstand
  zum Artgenossen hing damit an der Rottengröße statt an der Zusage. Braucht eine Art einen
  Abstand, muss der eigens gehalten werden.
* **Bedürfnisse in fester Reihenfolge zu prüfen ist eine versteckte Rangfolge.** Solange der Durst
  vor dem Suhlen abgefragt wurde, gewann er bei ähnlichen Intervallen jedes Mal und halbierte die
  Suhlgänge. Wer zwei gleichrangige Bedürfnisse hat, muss das überfälligere zuerst bedienen.

Dazu eine vierte, die schon beim Reh stand und sich hier wiederholt hat: **ein Bedürfnis, das eine
Fressphase unterbricht, macht jede Verlängerung dieser Phase wirkungslos.** Das Wühlen blieb bei
15 %, ob die Phase 40 oder 88 s dauern durfte. Erst als Durst und Suhldrang auf das Ende der Phase
warten mussten, stieg es auf 24–36 %.

### Zwei Fallen, die beim Reh Zeit gekostet haben

* **Ein Fächer kann nicht umdrehen.** `FAN` in `agents.js` reicht über gut ±109°. Ein Landtier,
  das in eine Sackgasse läuft (die engste liegt zwischen Kartenrand und Teichufer), kommt aus
  eigener Kraft nie wieder heraus – es blieb dort bis zum Ende der Aufzeichnung stehen und legte
  sich jede Nacht an derselben Stelle schlafen. Im Wasser fällt das nicht auf, weil Teiche
  rundlich sind. Wer ein Landtier baut, muss `blocked` als „umdrehen" behandeln, nicht nur als
  „neues Ziel suchen".
* **Ein Bonus in einer Bewertung ist kein Bonus, wenn alle Kandidaten gleich gut sind.** Frisches
  Gras steht überall auf 1.0; ein Waldrandzuschlag von 0.10 hat deshalb *jede* Wahl entschieden
  statt sie zu färben. Erst ein Zufallsanteil (0.35) macht aus dem Gesetz eine Vorliebe. Dieselbe
  Falle wartet bei jedem „bevorzugt aber nur ein bisschen".

### Was das Kaninchen gekostet hat: fast nichts

Kein einziger Anlauf war nötig – das Tier lief beim ersten Durchlauf innerhalb aller Zusagen. Der
Grund ist keine besondere Sorgfalt, sondern der Zuschnitt: **eine Art ohne Nahrung hat keine
Rückkopplung.** Bei den vier Arten davor hing jede Zahl an jeder anderen (längere Fressphase gegen
Trinkintervall gegen Reviergröße); hier gibt es nur Hopserlänge, Pause und Radius, und keine davon
beeinflusst die anderen. Wer eine Art einfach halten will, streicht ihre Bedürfnisse, nicht ihre
Parameter.

Nachjustiert wurde deshalb nur zweierlei, und beides am Bild statt an einer Rate: der
Mindestanteil offenen Geländes um den Bau (0.60 → 0.75, weil eine Familie sonst 12 % ihrer Zeit
im Wald verbrachte) und der Schlafumkreis (22 → 34 u, weil die Sprites sonst übereinanderlagen).

> **Der Ort entscheidet mehr als das Verhalten.** Ob eine Kaninchenfamilie im Merkmalsvektor bei
> 0 % oder 47 % „Zeit auf Boden" landet, hängt an dem einen Punkt, an dem ihr Bau steht – nicht an
> einem einzigen Parameter des Tieres. Bei einer ortsgebundenen Art ist die Platzierungsregel
> deshalb der wichtigste Parameter, den sie hat, und gehört entsprechend sorgfältig behandelt.

**Rechenzeit im Auge behalten.** Die 5 Tage kosten mit 27 Tieren rund 1.2 s; der Schwarm ist mit
Abstand der teuerste Teil, weil jeder Fisch jeden anderen ansieht. Deshalb frischt der Barsch
seine Wunschrichtung nur alle 0.15 s auf statt jeden Tick (`STEER_SECONDS`) – am Bild ändert das
nichts, an der Rechenzeit das Dreifache. Wer die nächste Gruppenart baut, sollte das übernehmen.

### Was die Fledermaus gekostet hat: eine Lektion, zweimal gelernt

Anders als beim Kaninchen gab es hier keine geteilten Bausteine nachzunutzen – die Bewegung war
komplett neu. Beide Anläufe, die Zeit gekostet haben, waren am Ende dieselbe Erkenntnis:

* **Eine Bewegung ohne Domänenprüfung ist kein Freibrief für die Kartengrenze.** Wasser- und
  Landtiere können nie über ihren Rand hinaus, weil `canEnter` (der Ausweichfächer, siehe oben)
  jeden Schritt dagegen prüft. Die Fledermaus prüft keine Domäne – aber "darf überall hinfliegen"
  heißt nicht "kann nie die Karte verlassen", und das wurde zunächst übersehen. `tools/simtest.js`
  fing es ab (bis zu 146 Verstöße "außerhalb der Karte" auf einem einzelnen Seed), bevor irgendwer
  es im Bild gesehen hätte.
* **Ein Bogen mit begrenzter Drehrate kann über ein nahes Ziel hinausschwingen.** Der erste Anlauf
  ließ den Reiseflug wie `walkStep`/`swimStep` mit einer Drehrate auf das Ziel eindrehen. Lag ein
  Schlafplatz oder Jagdgebiet nah am Kartenrand (25 u reichten), schwang der Bogen kurz darüber
  hinaus. Die Lösung war nicht, die Drehrate zu erhöhen, sondern das Eindrehen ganz zu streichen:
  ein Kurs, der jeden Tick direkt auf das Ziel zeigt statt sich dorthin zu drehen, bleibt beweisbar
  auf der Karte (ein Rechteck ist konvex, die gerade Strecke zwischen zwei Punkten darin liegt
  selbst darin) – und trifft nebenbei die Zusage aus data/tiere.md besser: "ein normaler Zielflug,
  gerader" ist eine Gerade, kein Bogen.
* **Dieselbe Falle im Wendekreis, in einer anderen Form.** Der Wendekreis drehte anfangs eine feste,
  gewürfelte Zeitspanne lang statt bis der Kurs wirklich zurück ins Gebiet zeigt – manchmal zu
  lange (die Fledermaus zeigte längst zur Mitte, drehte aber weiter und schwenkte wieder hinaus),
  manchmal zu kurz. Die Lösung ist wieder dieselbe Idee: jeden Tick prüfen statt eine Dauer
  abzusitzen.

> **Eine Bewegung, die eine Bedingung nicht mehr prüft, muss diese Bedingung durch etwas anderes
> ersetzen.** Der Ausweichfächer hat der Fledermaus nichts vererbt, weil sie keine Domäne hat – das
> hieß aber nicht, dass sie *gar keine* Grenze mehr braucht, sondern nur, dass die Grenze jetzt die
> Kartengrenze selbst ist. Wer die nächste domänenfreie Bewegung baut, sollte direkt nach dieser
> Grenze fragen, statt sie beim ersten Simulationslauf zu finden.

Terrainbezug bei den Jagdgebieten war die zweite, kleinere Lektion: rein geometrisch verteilte
Ovale ignorieren, was laut data/tiere.md darunterliegen soll (Gras oder Wasser, nicht Wald) –
behoben mit demselben Kandidaten-plus-Stichproben-Muster wie beim Kaninchenbau (`findBurrow`).

## Was das Grundgerüst schon kann

* **Zeit** (`js/sim/time.js`): ein Tag = 5 min, eine Welt = 5 Tage. Phasen, Helligkeit, Uhrzeit.
* **Aufzeichnung** (`js/sim/recording.js`): die 5 Tage werden beim Weltaufbau *einmal*
  durchgerechnet und mit 5 Hz abgelegt. Deshalb kostet Springen genauso wenig wie Abspielen, und
  die Bewegungsspur liegt fertig da. Ein Tier kostet rund 70 KB.
* **Abspieler** (`js/ui/player.js`): 1× / 5× / 25×, Zeitleiste über alle 5 Tage. Am Ende hält er
  an und lässt das volle Netz stehen; Abspielen beginnt dann wieder vorn.
* **Streuung** (`js/sim/agents.js`): feste Abweichungen pro Individuum plus driftende Tagesform.
* **Merkmale** (`js/sim/tracker.js`): der Vektor aus `tiere.md` §6, gemessen auf der Aufzeichnung.
* **Wasserdomäne** (`js/sim/habitat.js`): Ufertiefe je Zelle, Punktziehung nach Tiefe,
  „gegenüberliegende Seite", Nachbargewässer nach Entfernung.
* **Landdomäne** (`js/sim/land.js`): begehbare Fläche, Landmassen, Stelle nach Terraintyp, Stelle
  im Ring um einen Punkt, Waldstelle nach Tiefe (Rand oder dichter Wald).
* **Feste Heimatorte** (`js/sim/rabbit.js`, `WL.Rules.placement.burrow`): ein Punkt je Gruppe,
  einmal pro Welt gesucht, mit Bedingungen in Stufen (erst alle, dann gelockert) – damit die Art
  auf keinem Seed ausfällt. Gezeichnet wird er über `js/render/agentRenderer.js`, das die Baue aus
  den Tieren selbst einsammelt.
* **Flächennahrung** (in `js/sim/simulation.js`): ein Wert je Zelle **und Nahrungsart**, sinkt
  beim Fressen, wächst beim Nachschlagen aus der verstrichenen Zeit nach – kein Durchlauf über
  alle Zellen pro Tick. Daneben **Ortsnahrung**: derselbe Mechanismus, aber ein Vorrat je
  Weltobjekt (Apfelbaum, Nussnest) statt je Zelle.
* **Bewegung** (`js/sim/agents.js`): `swimStep` folgt einem Zielpunkt, `steerStep` einer
  Richtung; beide weichen dem Ufer fächerförmig aus und verlassen das Gewässer nie. An Land
  dasselbe als `walkStep` (Zielpunkt) und `roamStep` (Richtung).
* **Darstellung** (`js/render/agentRenderer.js`, `js/render/sprites.js`): Sprite ↔ neutrale Form
  (Taste `N`), Spuren getrennt nach Schwimmen und Flug, Nachtfärbung.

* **Reviere als Kontur** (`js/sim/fox.js`): eine Blase aus Ellipse plus wenigen Wellen, die sich
  abgehen lässt, dazu die gerechte Aufteilung der Karte in Zellen und die erzwungene
  Höchstüberlappung. Wer ein Tier mit sichtbarer Reviergrenze baut, nimmt das von dort.
* **Räuber-Beute** (`ctx.nearestPrey` in `js/sim/simulation.js`, Zustand `hetzen`): die erste
  Abfrage, die aktiv sucht statt zu reagieren. Otter, Hecht und Storch (§4) brauchen genau
  dieselbe. **Der Bussard braucht sie nicht** – er kennt den Bau seiner Beute als *Ort* und fliegt
  ihn einmal am Tag an, so wie der Dachs seinen Ameisenhügel. Wer eine Zusage der Form „einmal
  pro Tag" hat, baut sie so und nicht über eine Suche.
* **Kreisflug** (`js/sim/buzzard.js`, `ride`): eine Schleife über einem festen Mittelpunkt,
  gerechnet im Winkel statt über eine Drehrate. Bleibt dadurch beweisbar innerhalb von `r` um den
  Mittelpunkt – die billigste Antwort auf die Kartenrand-Falle der Fledermaus.
* **Eine Art, die es nur in Phase 2 gibt** (`WL.NEW_SPECIES`): Bedingung ist ein `spawn()`, das
  ein *einzelnes* Tier verträgt, ohne etwas anzulegen, was der ganzen Art gehört. Gemessen wird
  eine solche Art ausschließlich auf `featuresByPhase[1]`.

Ein neues Tier ist damit im Normalfall: Eintrag in `js/sim/species.js` + Verhalten in
`js/sim/<tier>.js` + je ein Skripttag/Eintrag in `index.html`, `tools/simtest.js`,
`tools/rendertest.js`, `tools/preview.js`.

## Ablauf pro Tier

1. **Besprechen.** Der Nutzer sagt, was ihm bei dem Tier wichtig ist. Ich trage es in
   `data/tiere.md` beim Tier ein – *bevor* Code entsteht.
2. **Parameter** nach `js/sim/species.js`. Ein neues Tier ist im Normalfall nur ein
   Parametersatz.
3. **Code nur wenn nötig.** Braucht das Tier ein Verhalten, das es noch nicht gibt, sage ich
   vorher kurz was und warum. Neue Platzierungsregeln (Baue, Schlafplätze) gehören nach
   `js/world/rules.js`, nicht in den Generator.
4. **Node-Test erweitern** (`tools/simtest.js`): läuft es die vollen 5 Tage ohne Regelverstoß,
   bleibt es im erlaubten Terrain, ist es bei gleichem Seed reproduzierbar – und **stimmen die
   Raten**? Verhaltensraten (bei der Ente: 2–5 Gewässerwechsel pro Tag) entstehen aus dem
   Zusammenspiel mehrerer Parameter und lassen sich nicht ausrechnen, nur messen. Der Test ist
   der Ort, an dem sie eingestellt werden.
5. **Ansehen.** Der Nutzer schaut es sich im Browser an, wir justieren die Werte nach.
   Ohne Browser: `node tools/preview.js . vorschau.png <seed> --tiere` zeichnet die kompletten
   5 Tage als Spur in ein PNG – das zeigt Stammorte und Wege auf einen Blick.
6. **Merkmale prüfen.** Unterscheidet sich das neue Tier im Merkmalsvektor von den bereits
   vorhandenen? Wenn nicht, ist entweder ein Parameter zu zahm oder es fehlt ein Merkmal.

Erst wenn ein Tier durch ist, kommt das nächste.

## Was pro Tier festgelegt wird

Nicht global, sondern jedes Mal neu – die Antworten unterscheiden sich stark, und „gibt es bei
dem Tier nicht" ist eine gültige Antwort.

* Anzahl pro Welt (Spanne)
* Aktivzeit über den Tageszyklus
* Sozialverhalten: Gruppengröße, wie eng, teilt sich die Gruppe wenn sie zu groß wird, ändert
  sich das zwischen Tag und Nacht
* Tempo **je Zustand** (grasen, gehen, wandern, schlafen, fliehen, jagen)
* Bewegungsmuster und Reviergröße
* Nahrung: welche Quelle, wie oft, wie lange am Stück
* Trinken: ja/nein, wie oft, wohin
* Schlafen: fester Ort oder nicht, allein oder zusammen, gleicher Ort jede Nacht oder wechselnd
* Reaktion auf andere Tiere, Fluchtdistanz
* Sprite

## Feste Regeln

* **Zahlen in `data/tiere.md` sind Startwerte.** Sie werden am laufenden Bild justiert, nicht
  vorher ausdiskutiert. Wenn sich ein Wert ändert, ändert er sich in `data/tiere.md` mit –
  die Datei bleibt die Wahrheit, nicht der Code.
* **Individuelle Streuung ist Pflicht**, nicht Kür: kein Tier läuft wie sein Nachbar, und keins
  läuft immer gleich schnell. Ohne Streuung wird das Clustering später zum Ablesen.
* Kein `Math.random()`. Jeder Generierungsschritt bekommt seinen eigenen `rng.fork('name')`.
  Das gilt in der Simulation genauso: jede Art forkt einmal, jedes Tier noch einmal
  (`rng.fork('ente-3')`). Derselbe Seed muss denselben Tagesverlauf ergeben.
* ES5 (`var`, `function`) in `js/`, IIFE mit `WL`-Namespace, Umlaute in Kommentaren als ASCII.
* Jede neue Datei unter `js/` muss in `index.html` **und** in die `FILES`-Listen der betroffenen
  Tools – sonst brechen sie mit `undefined`-Fehlern. Wer braucht was:
  `smoketest.js` nur `core` + `world`; `simtest.js` zusätzlich `sim`; `rendertest.js` alles außer
  `ui`; `preview.js` `core` + `world` + `sim` + `palette`/`shapes`. Die Reihenfolge in den Listen
  ist immer die aus `index.html`. Neue typisierte Arrays (`Int16Array`, `Float64Array`, …) müssen
  in die `sandbox`-Whitelist der Tools.
* Der Weltgenerator wird nicht angefasst. Neue Nahrung ist Flächennahrung (eine Regel, kein
  Objekt), damit die Seeds stabil bleiben.
* Tiere werden über `renderer.setDynamicLayers()` gezeichnet, nicht in den Terrain-Cache.
* Die Darstellung bleibt umschaltbar: Sprite (jetzt) ↔ neutrale Form (später fürs Spiel).
* Nach jedem Tier müssen `smoketest.js`, `rendertest.js` und `simtest.js` grün sein.
