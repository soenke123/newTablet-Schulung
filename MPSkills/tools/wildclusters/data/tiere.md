# Tierkatalog

Fachliche Quelle für `js/sim/species.js`. Diese Datei wird zuerst besprochen und festgelegt,
der Code bildet sie danach ab – nicht umgekehrt. Wenn eine Zahl im Code steht, die hier nicht
steht, ist das ein Fehler.

**Kernset:** die ersten acht Tiere. **Bonus:** der Rest, kommt erst wenn das Kernset läuft.

---

## 1. Was die Welt schon hergibt

Die Simulation ändert den Weltgenerator **nicht** (sonst verschieben sich alle Seeds). Alles
Folgende existiert bereits oder wird von der Simulation selbst platziert.

### Nahrung

| Nahrung | Woher | Wer frisst es |
|---|---|---|
| Gras | Terrain `GRASS`, flächig, lokale Erschöpfung | Reh |
| Äpfel | `objects.appleTrees` / `appleGroups` (feste Orte) | Reh, Wildschwein, Bär |
| **Fallobst** | `objects.appleTrees` – dieselben Bäume, eigener Vorrat | Igel |
| Nüsse, Pilze | `objects.resources` / `resourcePatches` (feste Orte im Wald) | Reh, Wildschwein, Dachs, Bär |
| Ameisen | `objects.anthills` (feste Orte) | Wildschwein |
| **Ameisenbrut** | `objects.anthills` – dieselben Hügel, eigener Vorrat | Dachs |
| **Ameisenstraße** | `objects.anthills` – dieselben Hügel, dritter Vorrat | Igel |
| **Waldboden** | Terrain `FOREST`, flächig – *neu* | Igel |
| **Wurzeln und Bodentiere** | Terrain `GROUND`, flächig – *neu* | Wildschwein |
| **Wasserpflanzen / Ufergrund** | Terrain `WATER` nahe Ufer, flächig – *neu* | Ente |
| **Kleintiere im Wasser** | Terrain `WATER`, flächig – *neu* | Barsch |
| Beutetiere | andere Agenten – **kein Vorrat, es wird nichts getötet** | Fuchs, Bussard, Hecht, Otter, Storch |

> **Die Beutetiere-Zeile bekommt keine Karte.** Der Fuchs jagt sichtbar, aber es wird nichts
> getötet – also sinkt auch nirgends ein Vorrat, und es gibt für ihn keinen `forage`-Block. Das
> ist dieselbe Konstruktion wie beim Jagen der Fledermaus: reine Bewegung ohne Rückkopplung.
> Im Merkmalsvektor steht bei ihm `beutetiere` – anders als bei Kaninchen und Fledermaus, die
> beide `keine` tragen. **Seit dem Bussard ist dieser Wert nicht mehr eindeutig**: der zweite
> Jäger trägt ihn ebenfalls, und die beiden trennen sich stattdessen an der Tageszeit (0 % gegen
> 67 % Nachtaktivität) und am Flug.

**„Frisst gar nicht" ist eine gültige Zeile.** Das Kaninchen steht in dieser Tabelle nirgends mehr,
und das ist eine Entscheidung, keine Lücke: es hoppelt umher und bleibt zwischendurch stehen, mehr
gibt es bei ihm nicht zu erklären. Damit ist es die Gegenprobe zu den anderen vier Arten, deren
Tagesablauf ganz an ihrem Futter hängt – und es zeigt im Unterricht, dass ein Tier auch ohne jede
Nahrungssuche ein klar erkennbares Muster auf die Karte legt.

> **Insekten als Flächennahrung für die Fledermaus sind zurückgenommen.** Sie standen hier, bevor
> über das Tier gesprochen wurde. Entschieden ist stattdessen: die Fledermaus frisst und trinkt
> gar nicht – das Jagen im Jagdgebiet ist reine Bewegungsanimation ohne Vorrat. Damit ist sie die
> zweite Art ohne jede Rückkopplung nach dem Kaninchen (§3).

Die drei mit *neu* markierten Quellen sind **Flächennahrung**: kein neues Weltobjekt, sondern die
Regel „hier darf gefressen werden" plus ein lokaler Erschöpfungswert. Damit bleiben die Seeds und
`tools/smoketest.js` unangetastet.

**Jede Nahrungsart hat ihre eigene Karte.** Wasserpflanzen und Kleintiere liegen auf denselben
Zellen, sind aber nicht derselbe Vorrat – sonst gründelte die Ente dem Barsch den Teller leer und
umgekehrt. Das ist auch der Grund, warum der Einbau des Barsches die gemessenen Entenwerte nicht
verschoben hat.

**Die Karte gehört der Nahrungsart, nicht der Art, die sie frisst.** Reh und Wildschwein fressen
beide „Nüsse" – also greifen beide auf *denselben* Vorrat zu und nehmen sich gegenseitig etwas
weg. Das ist so gewollt, aber es ist die Kehrseite der Regel darüber und hat einen Preis: die
Rotte leert die 18–60 Nussstellen der Karte spürbar, und die gemessenen Nusswerte des Rehs
verschieben sich dadurch. Wer zwei Arten *nicht* konkurrieren lassen will, gibt der zweiten eine
eigene Nahrungsart mit eigenem Namen – nicht eine zweite Karte unter demselben Namen, die gibt es
nicht. Welche Art die Karte anlegt, entscheidet `WL.SPECIES_ORDER`; die Nachwachsrate der später
eingetragenen Art ist damit wirkungslos.

> **Der Igel hat diese Regel dann gleich dreimal angewendet, und zwar vorsorglich.** Er frisst
> Äpfel und Ameisen, wohnt aber auf seinen Fundstellen: drei bis fünf feste Futterplätze, Nacht
> für Nacht dieselben. Genau die Lage, in der die Ameisenbrut-Lehre unten sagt, dass eine geteilte
> Karte nicht mehr trägt – eine ortsfeste Art auf einer Fundstelle nimmt sie dauerhaft in Besitz.
> Deshalb heißen seine Nahrungsarten **Fallobst** (die Äpfel am Boden – er klettert nicht),
> **Ameisenstraße** (die Ameisen um den Hügel herum, während das Wildschwein die Ameisen und der
> Dachs die Brut nimmt) und **Waldboden** (Würmer und Käfer am Waldrand, die einzige Flächennahrung
> auf `FOREST`). Auf dem Bildschirm ist von der Trennung wieder nichts zu sehen – es sind dieselben
> Bäume und dieselben Hügel. Nachgerechnet: sein Einfluss auf jede Landart ist exakt null.
>
> **Die Ameisenbrut ist der bisher deutlichste Fall davon.** Wildschwein und Dachs teilten sich
> anfangs eine Ameisenkarte. Seit der Dachsbau höchstens 300 u von einem Ameisenhügel entfernt
> liegt (§3) und der Dachs den nahen Hügel bevorzugt, gräbt die ganze Familie Nacht für Nacht
> denselben Hügel leer – dem Wildschwein fiel damit dauerhaft eine seiner Nahrungsquellen weg, und
> seine bereits justierten Werte rutschten sichtbar ab (wühlt 20 % → 14 %, suhlt auf Boden
> 72 % → 58 %, Trinkgänge 1.6 → 1.4 pro Nacht; `tools/simtest.js` schlug an). Der Dachs frisst
> deshalb jetzt **Ameisenbrut**: dieselben Hügel, eigener Vorrat, wie Nüsse/Pilze und
> Wasserpflanzen/Kleintiere. Sein Einfluss auf das Wildschwein ist damit nachgerechnet wieder
> exakt null, und auf dem Bildschirm ist von der Trennung nichts zu sehen – es sind dieselben
> Hügel. Nachgewiesen ist die Ursache und nicht nur vermutet: schaltet man allein die
> Ameisenaufnahme des Dachses ab, sind die Wildschweinwerte bitgleich mit „ganz ohne Dachs",
> schaltet man seine Nussaufnahme ab, ändert sich nichts.

**Zwei Formen von Nahrung.** *Flächennahrung* ist ein Wert je Zelle (Gras, Wasserpflanzen,
Kleintiere, später Waldpilze) – man frisst dort, wo man steht. *Ortsnahrung* hängt an
einem bereits vorhandenen Weltobjekt (Apfelbaum, Nuss- und Pilznest) und hat einen Vorrat je
Objekt. Der Unterschied ist nicht technisch, sondern der sichtbare Verhaltensunterschied: Gras
erzeugt langsames Weiterziehen über die Fläche, ein Apfelbaum erzeugt einen Umweg zu einem Punkt
und einen kurzen Halt dort. Auch die Ortsnahrung ändert den Weltgenerator nicht – der Vorrat liegt
in der Simulation, das Objekt stand schon vorher da.

### Wasser zum Trinken

Fehlte in der Tabelle, ist aber wichtig: viele Landtiere müssen trinken. Das erzeugt regelmäßige
Wege zum nächsten Gewässer – gut sichtbar, gut messbar, und `world.fields.distToWater` liegt
fertig da.

**Wird pro Tier festgelegt**, nicht global: ob überhaupt, wie oft, und wohin. Wasserbewohner
brauchen es gar nicht, die Fledermaus trinkt im Flug, ein Reh geht dafür einen weiten Weg.

### Heimatorte (Bau, Schlafplatz, Revierzentrum)

Werden pro Welt von der Simulation über `rng.fork('homes')` platziert, mit Regeln in
`js/world/rules.js` (dort gehören Platzierungsregeln laut Projektkonvention hin). Sie sind fest,
solange die Welt lebt – dadurch entstehen wiederkehrende Wege statt Irrlauf.

**Auch das gehört ans einzelne Tier.** Manche haben einen festen Bau, den sie jede Nacht
aufsuchen; manche haben gar keinen Schlafplatz und ruhen wo sie gerade sind; manche schlafen
gemeinsam, und große Gruppen teilen sich unter Umständen auf mehrere Orte auf. „Hat keinen"
ist eine gültige Antwort.

---

## 2. Skalen und Vokabular

**Zeit.** Ein Tag-Nacht-Zyklus dauert **5 Minuten** Echtzeit. Phasen: Nacht `0.00–0.20`,
Morgendämmerung `0.20–0.30`, Tag `0.30–0.70`, Abenddämmerung `0.70–0.80`, Nacht `0.80–1.00`.

Eine Welt umfasst **zehn Tage in zwei Phasen zu je fünf**, also zweimal 25 Minuten. Beide werden
beim Aufbau der Welt in *einem* Zug durchgerechnet und als eine einzige Aufzeichnung abgelegt
(alle 0.2 s eine Stützstelle je Tier).

| | | |
|---|---|---|
| **Tag 1–5** | Startbestand | Die Klasse beobachtet und gruppiert. |
| **Tag 6** | der Bruch | Fünf Tiere kommen dazu: drei bekannter Arten, zwei neuer. |
| **Tag 6–10** | mit Nachzüglern | Die Muster ändern sich sichtbar. Die Neuen sind einzusortieren. |

> **Es ist eine durchgehende Rechnung und nicht zwei Läufe, und das ist keine technische
> Feinheit.** Tag 1–5 bleiben hinterher exakt das, was die Klasse gesehen hat – weil es dieselbe
> Rechnung ist und nicht eine sorgfältig wiederholte. Signal 17 bleibt dasselbe Tier mit derselben
> Streuung. Und kein Tier flieht je vor etwas Unsichtbarem: vor dem Bruch existieren die
> Nachzügler nicht (Zustand `abwesend`), danach sind sie zu sehen. Nachgewiesen wird das in
> `tools/simtest.js` Stützstelle für Stützstelle, nicht an gerundeten Merkmalswerten – zwei Fehler
> waren nur so zu finden.

> **Die Spur wird am Bruch gelöscht.** Phase 2 beginnt auf leerem Blatt. Das ist zuerst eine
> didaktische Entscheidung – fünf neue Tage sind mit fünf alten vergleichbar, zehn übereinander
> nicht – und nebenbei die, die das Zeichnen bezahlbar hält: nie mehr als fünf Tage Linie auf dem
> Schirm, also genau die Kosten von vor der Zweiteilung.

Alles Weitere ist nur noch Abspielen:

* **1×** – ein Tag in 5 Minuten, so schnell wie die Simulation gedacht ist
* **5×** – ein Tag in einer Minute
* **25×** – die vollen 5 Tage in einer Minute (Zeitraffer)

Weil die Aufzeichnung vollständig vorliegt, lässt sich auf **jeden** Zeitpunkt der laufenden Phase
springen, auch vorwärts, und die Bewegungsspur eines Tieres kann in voller Länge gezeichnet
werden. **Am Ende hält der Abspieler an** und lässt das volle Netz stehen: fünf Tage Spur auf
einmal sind das Bild, mit dem gearbeitet wird. Liefe die Aufzeichnung von vorn los, wäre es
genau dann weg, wenn man anfängt hinzusehen. Ein Druck auf Abspielen beginnt wieder vorn.

Der Abspieler läuft dabei immer über *eine* Phase. Am Ende von Tag 5 hält er an – dort wird
gearbeitet. Wie die zweite Phase freigeschaltet wird, ist noch offen; im Code führt genau eine
Tür dorthin (`WILDCLUSTERS.setPhase(1)`), an der ein Knopf, ein Lehrercode oder das Ergebnis der
Gruppierungsaufgabe hängen kann.

Zeitangaben in den Tierblöcken sind **Simulationsstunden** (24 h = 5 min Echtzeit), damit
„alle 6 Stunden" lesbar bleibt statt „alle 75 Sekunden".

**Tempo** in Weltunits pro Sekunde. Zum Einordnen: die Welt ist 1600 × 1000 Units, eine
Baumkrone misst rund 30 Units.

> **Alle Tempowerte in dieser Datei sind Startwerte.** Sie werden am laufenden Bild justiert,
> nicht vorher festgelegt – wie schnell sich ein Tier auf dieser Karte *anfühlt*, lässt sich nicht
> ausrechnen. Justierte Werte werden hier nachgetragen; diese Datei bleibt die Wahrheit.

Tempo ist nie *ein* Wert pro Art, sondern hängt am Zustand. Grasen ist langsamer als Gehen,
Gehen langsamer als Wandern, und Fliehen ist ein Vielfaches davon:

| Zustand | typisch |
|---|---|
| schlafen, ruhen | 0 |
| fressen, äsen, wühlen, gründeln | 3–9 |
| gehen, umherstreifen | 9–24 |
| gezielt wandern, Ortswechsel | 24–85 |
| fliehen, jagen | 40–100 |

| Stufe | ruhig | reisen | Flucht / Jagd |
|---|---|---|---|
| sehr langsam | 3–5 | 9–13 | 20–40 |
| langsam | 5–7 | 14–24 | 40–50 |
| schnell | 7–9 | 28–35 | 60–90 |
| sehr schnell | – | 75–85 | 100 |

**Individuelle Streuung.** Kein Tier ist wie das andere, und keins ist immer gleich:

* fest pro Individuum: Tempo ±12 %, Bedürfnis-Raten ±15 %, Reviergröße ±20 %, Scheu ±20 %
* über die Zeit driftend („Tagesform"): Faktor 0.75–1.10 auf das Tempo, wandert über Minuten
* zustandsabhängig: fressen und ruhen senken das Tempo ohnehin

**Größenklasse** 1 (klein) bis 5 (groß). Legt fest, was „größeres Tier" in der Reaktionsspalte
bedeutet – sonst ist die Regel nicht implementierbar.

**Reaktionstypen:** `flieht` · `meidet` · `ignoriert` · `jagt` · `vertreibt` · `erstarrt`
(Igel: rollt sich ein). Standardregel, wenn nichts anderes dasteht: fliehen vor Größenklasse
≥ eigene + 2 und vor allem, was einen als Beute gelistet hat.

> **`erstarrt` ist seit dem Igel gebaut** (Zustand `einrollen`, `js/sim/agents.js` 20) und die
> einzige Reaktion des Katalogs, bei der ein Tier *langsamer* wird statt schneller. Sie steht an
> derselben Stelle des Ablaufs wie `fliehen` bei allen anderen – deshalb ein eigener Zustand und
> nicht `sichern`, das überall sonst einen *freiwilligen* Halt meint (das Stutzen des Rehs, die
> Sitzpause des Bussards). Sie braucht dieselbe Sperrzeit wie jede Störung: ein äsendes Reh steht
> minutenlang daneben, und ohne sie läge der Igel die halbe Nacht als Kugel im Gras.

---

## 3. Kernset

| Art | Anz. | Aktiv | Sozial | Tempo r/w/f | Bewegungsmuster | Revier | Nahrung | Ruht wo | Gr. | Reaktion |
|---|---|---|---|---|---|---|---|---|---|---|
| **Reh** ✔ | 3–6 | Tag + Dämmerung | Einzelgänger | 5 / 24 / 75 | äst lange auf Gras, streift in weiten Zügen über die ganze Karte | kein Revier | Gras, Äpfel, Nüsse | Waldrand, allein | 3 | flieht vor Gr. ≥ 4; stutzt kurz vor Artgenossen |
| **Wildschwein** ✔ | 3–10 | Nacht + Dämmerung | 1–2 Rotten à 3–5, lose (45 u) | 5 / 15 / 48 | zieht im Waldstück von einer Wühlstelle zur nächsten, lange Fress- und Suhlphasen | sein Waldstück + 280 u | Nüsse, **Boden**, Äpfel, Ameisen | dichter Wald, Rotte zusammen | 4 | flieht vor Gr. ≥ 5 |
| **Fuchs** | 2–4 | Nacht + Dämmerung | Einzelgänger | – / 36 / 86 | zweimal je Nacht ein langes Stück der Reviergrenze ab, dazwischen quer durchs Revier mit kurzen Stops und einem Stück Grenze am anderen Ende | eine Blase, ~404/330/299 u je nach Anzahl, fest | **keine** – jagt, tötet aber nicht | Wald, einer beim Dachsbau | 2 | jagt Ente und Kaninchen, meidet Gr. ≥ 4 |
| **Kaninchen** ✔ | 4–10 | Tag + Dämmerung | 1–2 Familien am gemeinsamen Bau | – / 30 / 88 | hoppelt in wechselnde Richtungen, sitzt dazwischen, bleibt im Umkreis des Baus | ~130 u um den Bau | **keine** – frisst nicht | eigener Bau auf Gras/Boden | 1 | flieht sofort **zum Bau** vor allem ≥ Gr. 2; im Bau unerschrocken |
| **Fledermaus** ✔ | 4–10 | Nacht | keine – zufällige Überschneidung an Schlafplatz/Jagdgebiet | 0 / 55–75 reisen / 45–70 jagen | schnelle, zackige Flugbahnen, enge Kreise zum Wenden, im gerade gewählten Jagdgebiet | eines von 5–7 festen Jagdgebieten, wechselt rund einmal pro Nacht | **keine** – frisst nicht | einer von 2 Schlafplätzen je Wald, weltweiter Pool | 1 | ignoriert alles, wird von allen ignoriert |
| **Dachs** ✔ | 3–6 | Nacht | Familie am Bau tags, nachts jeder für sich | 7 / 22 / 48 | jede Nacht anders begonnen (Trinken, Hügel oder Streifzug), geradewegs zu *einem* Ameisenhügel mit Zickzack darüber, zurück ins Revier, dort weite Streifzüge sowie Nuss-/Pilzstellen | ~500 u um den Bau (Ameisenhügel revierfrei) | Ameisenbrut (bevorzugt, 1×/Nacht), Nüsse, Pilze | eigener Bau im Wald, 140–300 u vom Wasser und ≤ 300 u von einem Ameisenhügel | 2 | meidet nur Gr. ≥ 5 |
| **Ente** ✔ | 2–5 | Tag | allein oder Paar (40 u) | 6 / 13 schwimmen / 34 auf dem Wasser · 62 fliegen | schwimmt und gründelt, fliegt zwischen allen Gewässern der Karte | an Wasser gebunden | Wasserpflanzen, Ufergrund | am Ufer, Paare nebeneinander | 2 | weicht tags aus, flieht nachts; folgt der Gruppe beim Aufbruch |
| **Barsch** ✔ | 6–12 | Tag, nachts träge | 3–6, Schwarm (25 u) | 3 / 9–22 / 58 | Schwarm zieht den ganzen See ab, verlässt ihn nie | ein Gewässer | Kleintiere im Wasser | Ruhezone in der Seemitte, Schwarm zusammen | 1 | meidet alles außer Enten, bleibt am Schwarm |

*Tempo r/w/f = ruhig / wandern / flüchten oder jagen.* ✔ = eingebaut und justiert.

> **Über allen acht Spannen steht eine Obergrenze: höchstens 40 Tiere je Welt in Phase 1**
> (`WL.POPULATION.max`, durchgesetzt in `js/sim/simulation.js`). Die Spannen oben sind je für sich
> richtig, nebeneinander ergeben sie aber bis zu 63 Tiere – und so viele namenlose Kacheln lassen
> sich auf dem Tablet nicht mehr gruppieren. Gezogen wird zuerst der Wunsch jeder Art aus ihrer
> Spanne, dann gibt so lange die Art mit dem größten Abstand zu ihrer *eigenen* Untergrenze je ein
> Tier ab, bis es passt; keine Art fällt unter ihr Minimum (deren Summe ist 27). Gemessen über 70
> Seeds: 36–40 Tiere, im Mittel 39.8.
>
> **Engere Spannen wären der falsche Weg gewesen.** Die Summe von acht unabhängigen Ziehungen
> liegt fast immer in der Mitte; um die *Spitze* auf 40 zu drücken, müsste jede Spanne auf ein
> Drittel schrumpfen – dann sähe jede Welt gleich aus, und der Mittelwert läge bei 33 statt 40.
> Eine Obergrenze trifft genau die Spitze und lässt die Vielfalt in Ruhe.
>
> Beim **Wildschwein** hat das eine Folge im Code: seine Anzahl ergab sich früher aus
> `sounder.groups × sounder.size` und `count` war nur eine Notiz. Jetzt ist `count` die Wahrheit,
> und die Zahl der Rotten ergibt sich daraus – dieselbe Richtung wie beim Barschschwarm
> (`splitIntoSounders` in `js/sim/boar.js`). Die erreichbaren Rottengrößen sind dieselben
> geblieben (1× 3–5 oder 2× 3–5), nur ihre Häufigkeiten haben sich verschoben.

### Was pro Tier noch festzulegen ist

Die Blöcke sind bewusst kurz – hier trägst du beim Durchgehen ein, was dir wichtig ist.

**Reh** ✔ *(eingebaut, Stand oben in der Tabelle)* — **jedes Reh ist für sich allein unterwegs.**
Keine Gruppe, kein Rendezvous, kein Revier. Damit ist es das erste Landtier und zugleich der
Gegenentwurf zum Barsch: dort ist der Schwarm die handelnde Einheit, hier gibt es nichts über dem
Einzeltier.

> Das ersetzt drei frühere Festlegungen dieser Datei (Gruppe 1–3 lose, Revier ~260 u, Schlafplatz
> „Waldrand, Gruppe"). Sie standen hier, bevor über das Tier gesprochen wurde.

*Äsen ist die Hauptbeschäftigung.* Gras ist Flächennahrung mit langsamer Erholung
(`eatPerSecond 0.34`, `regrowPerSecond 0.0035`): eine abgeäste Stelle bleibt lange leer. Das Reh
zieht deshalb während des Äsens ständig ein Stück weiter (Umkreis 13 u) und wechselt nach
**34–72 s** die Stelle ganz. Gemessen: **47–55 % der Wachzeit im Zustand „äst"** gegen 20–30 %
gehend, und **63–88 % der Wachzeit auf Gras**.

> Diese Aesphase lässt sich nicht beliebig verlängern, und das ist keine Feinheit, sondern die
> Grenze, an der zwei Zusagen aneinanderstoßen. Zwischen zwei Trinkgängen liegen 62–94 s; eine
> längere Aesphase wird also ohnehin vom Durst zerschnitten und ändert am gemessenen Anteil
> nichts mehr. Wer hier schraubt, muss zuerst am Trinken schrauben.

*Es streift über die Karte.* Ein neues Grasziel liegt 190–440 u entfernt. Es gibt keinen
Mittelpunkt, zu dem es zurückkehrt, und keine Grenze, die es nicht überschreitet – ein Revier hat
das Reh nicht.

> **Die Richtung ist dabei nicht frei, sondern beharrt.** Sie wandert je Zug nur um ±0.45 rad und
> wird bloß mit 15 % ganz neu gewürfelt. Das ist der Unterschied zwischen Streifen und Irrflug:
> bei jedes Mal frei gewürfelter Richtung ist ein Tier nach acht Zügen nur die *Wurzel* aus acht
> Zuglängen weit gekommen, es hängt also für immer um denselben Teich und hat de facto doch ein
> Revier. Mit Beharrung entstehen die langen geraden Züge quer über die Karte, die man auf der
> Spur sieht.

> **Das Trinken bindet es trotzdem an einen Streifen um die Gewässer.** 2–3 Trinkgänge auf 159 s
> Wachzeit heißt: alle gut 60 s zurück ans Wasser. Weiter als etwa einen halben Zug kann sich das
> Reh davon nicht entfernen, und Kartenecken ohne jedes Gewässer bleiben unbesucht. Gemessenes
> Gebiet **130–180k u²** – deutlich mehr als der Barsch (77k), weniger als die fliegende Ente
> (293k). Das ist kein Mangel, sondern die Folge einer Zusage; wer die Ecken sehen will, muss die
> Trinkrate senken.

*Es weiß nicht, wo etwas ist.* Äpfel und Nüsse werden **nicht** gesucht, sondern **gesehen**:
alle 0.6 s schaut das Reh in einem Umkreis von **150 u** nach Apfelbäumen und Nussnestern. Findet
es eines mit Vorrat, geht es hin, frisst 8–20 s und zieht weiter. Außerhalb dieses Umkreises
existieren die Bäume für das Tier nicht – zwei Rehe auf derselben Karte kennen deshalb ganz
verschiedene Bäume, und dasselbe Reh findet einen Baum an einem Tag und am nächsten nicht. Genau
das ist der Unterschied zum Dachs, der später seine Wegpunkte auswendig kennt.

> Nach jedem Halt schaut es **90–200 s lang gar nicht mehr**. Ohne diese Pause bleibt das Reh im
> Wald hängen: in einem Nussnest liegen 6–12 Stellen im Umkreis von 42 u, es wandert von einer
> zur nächsten und kehrt nie auf die Wiese zurück. Gemessen ohne Pause: 74–95 % der Aeszeit im
> Wald statt auf Gras. Es genügt dabei nicht, nur die zuletzt leergefressene Stelle zu sperren –
> gesperrt werden muss das *Hinsehen*.

*Trinken 2–3 Mal am Tag.* Alle 5.2–7.2 Simulationsstunden, nur tagsüber; das Reh geht zum
nächsten Gewässer (gezielt, `22–32`), trinkt 5–11 s am Ufer und äst gleich in Ufernähe weiter.
Kommt es ohnehin an Wasser vorbei (< 130 u) und ist der Durst binnen 1.2 h fällig, trinkt es
gleich mit. Gemessen **2.4–2.7 Gänge pro Tier und Tag**.

> Der Abstand ist deutlich kürzer als 24 h / 3, weil nur tagsüber getrunken wird: alle Gänge
> müssen in die Wachzeit von rund 13 Simulationsstunden passen. Und die zwei Zusätze – der
> Gelegenheitsschluck und das kurze Ziel nach dem Trinken (40–140 u statt 190–440 u) – sind der
> Grund, warum das Äsen überhaupt die Hauptbeschäftigung bleibt: ohne sie kostete jeder Schluck
> einen ganzen Zug quer über die Karte, und aus dem äsenden Tier wurde ein wanderndes
> (gemessen 38 % äsen gegen 39 % gehen statt 51 % gegen 25 %).

*Nachts am Waldrand.* Wach von `0.20` bis `0.80` des Tages (Tag + beide Dämmerungen), **aufgebrochen
wird aber schon bei `0.73`** – der Weg zum Schlafplatz gehört in die Dämmerung, nicht in die Nacht.
Gesucht wird ein Platz **im Wald dicht am Rand** (Waldtiefe 1–4 Zellen) im Umkreis von 420 u,
höchstens aber 620 u entfernt; **nicht** jede Nacht derselbe, sondern der, der gerade in der Nähe
liegt. Ist weit und breit kein Waldrand, legt es sich ins Gras. Gemessen: **94–99 % der Nacht
schlafend**, davon **80–100 % am Waldrand**.

> Dass das Reh vor der Nacht aufbricht, ist nicht Kosmetik. Vorher fiel der ganze Weg in die
> Nacht: das Reh wirkte mit 15 % nachtaktiv (statt 4 %), und unterwegs scheuchte es am Ufer noch
> den Barschschwarm auf, dessen Nachtaktivität dadurch von 15 % auf 21 % stieg. Eine Zahl beim
> Reh hat hier also eine Zahl beim Barsch verschoben.

*Gras am Waldrand, ganz leicht.* Bei der Wahl des nächsten Grasziels bekommt eine Stelle, die
näher als 120 u am Wald liegt, einen Bonus von `0.10` – klein genug, dass das Reh trotzdem über
freie Flächen zieht, groß genug, dass sich die Spur sichtbar an den Waldrändern entlangzieht.
Der Wald selbst wird nicht gemieden: das Reh läuft hindurch, nur wächst dort kein Gras.

> **Ein kleiner Bonus ist nur dann klein, wenn die Kandidaten sich sonst unterscheiden.** Frisches
> Gras steht überall auf `1.0`; ein Zuschlag von 0.10 hat deshalb anfangs *jede* Wahl entschieden
> statt sie zu färben – aus „am liebsten am Waldrand" wurde ein Naturgesetz. Erst ein
> Zufallsanteil von `0.35` je Kandidat macht daraus eine Vorliebe, die in etwa jeder dritten Wahl
> den Ausschlag gibt. Das Reh vergleicht, es rechnet nicht. Dieselbe Falle wartet bei jedem
> weiteren „bevorzugt, aber nur ein bisschen".

*Andere Tiere.* **Sehen sich zwei Rehe (< 100 u), bleiben beide 2–4 s stehen** und gehen dann
weiter – kein Zusammenbleiben, kein Ausweichen, nur ein kurzes Sichern. Danach greift eine
Sperrzeit von 20–40 s, sonst stünden zwei Rehe, die sich zufällig begleiten, dauerhaft still.
Vor Größenklasse ≥ 4 flieht es mit `60–85` (Radius 140 u × Scheu, 5–11 s); Ente und Barsch werden
ignoriert (am Wasser stehen sie sich nicht im Weg). *Der Fluchtzweig läuft im Kernset noch ins
Leere und ist über den künstlichen Störer in `tools/simtest.js` geprüft – und zwar gegen beide
Seiten der Regel: Größenklasse 4 löst Flucht aus, Größenklasse 3 ausdrücklich nicht.*

> Dass eine einzelne Welt **gar kein** Sichern zeigt, ist kein Fehler, sondern der Beleg für
> „Einzelgänger": auf Seed 482917 kommen sich die drei Rehe in fünf Tagen nie näher als 100 u
> (mittlerer Abstand 537 u). `tools/simtest.js` zählt deshalb über alle zehn Seeds zusammen.

*Was das Reh den anderen antut.* Es ist das erste Tier, das die Reaktionszweige von Ente und
Barsch überhaupt auslöst – bis hierher liefen sie ins Leere. Ein Reh am Ufer lässt Enten
wegschwimmen und den Barschschwarm sprinten, und das verschiebt deren gemessene Werte (siehe §6).
Das ist gewolltes Verhalten, mit **einer** Ausnahme, die eingebaut werden musste: **ein
schlafendes Tier stört niemanden.** Der Waldrand liegt oft keine 90 u vom Ufer entfernt; ohne
diese Regel hätte ein dort liegendes Reh die Enten die ganze Nacht von einer Seite des Teichs zur
anderen getrieben. Das ist der Unterschied zwischen einer Störung und einem Dauerzustand.

**Wildschwein** ✔ *(eingebaut, Stand oben in der Tabelle)* — **die Rotte ist die handelnde
Einheit, aber sie ist keine Formation.** Auf der Karte leben **1–2 Rotten zu je 3–5 Tieren**. Ziel, Tempo, Nahrungsstelle, Suhle, Schlafplatz und
die Flucht gehören der Rotte; das einzelne Tier hat davon nur seine Streuung, seine Tagesform und
seinen Platz im Verband.

*Locker zusammen, nicht in Reihe.* Jedes Tier hat einen eigenen Platz im Umkreis um das
gemeinsame Ziel (**130 u** beim Ziehen, **90 u** beim Wühlen, **45 u** im Schlaf, **16 u** in der
Suhle), und dieser Platz wird alle **4–9 s** neu ausgewürfelt – beim Wühlen alle **2.5–6 s**.
Dadurch schiebt sich der Verband ständig durcheinander, statt seine Anordnung mitzunehmen.

> **Der Umkreis ist nicht der Abstand zweier Tiere, und das war eine Falle.** Fünf Tiere in einem
> Kreis stehen enger als drei – der gemessene Abstand zum Artgenossen hing damit an der
> Rottengröße statt an der Zusage, und große Rotten landeten bei 29 u, also fast auf dem
> Schwarmabstand des Barsches (23 u). Ein Umkreis, der für fünf Tiere weit genug ist, streute drei
> dagegen über das halbe Nussnest. Deshalb gibt es zusätzlich einen **Mindestabstand von 42 u**,
> der eigens gehalten wird (`keepGap`): kommt ein Tier einem anderen näher, wandert sein Zielpunkt
> weg. Das ist dieselbe Idee wie die Abstoßung im Barschschwarm, nur eine Ebene höher – dort eine
> Kraft auf die Geschwindigkeit, hier eine Verschiebung des Ziels. Gemessen **38 u**.
>
> Gedeckelt ist er auf 90 % des jeweiligen Umkreises. Ohne diese Deckelung schöben sich die Tiere
> aus der 16 u kleinen Suhle heraus ins Gras daneben, und von „suhlt sich auf Boden" bliebe ein
> Viertel übrig. In der Suhle und im Schlaf liegt eine Rotte eben dicht.

Dazu kommen zwei Dinge, die das Bild ausmachen, das gewünscht war:

* **Es bleibt mal eins stehen.** Alle **9–26 s** hält ein Tier für **1.5–4.5 s** an, unabhängig von
  den anderen. Der Zeitpunkt hängt an seiner eigenen Uhr, nicht an der der Rotte.
* **Und holt wieder auf.** Fällt es dabei weiter als **190 u** hinter den Schwerpunkt der Rotte
  zurück, läuft es nicht mehr auf seinen Platz zu, sondern geradewegs auf die Gruppe, und zwar mit
  einem eigenen Tempo (`24–34` statt `11–18`). Das Aufschließen ist damit sichtbar schneller als
  das Ziehen – ohne diesen zweiten Wert bliebe ein Nachzügler für immer Nachzügler.

> **Angekommen ist, wer als Erster da ist.** Ob die Rotte ihr Ziel erreicht hat, wird am
> *vordersten Tier* gemessen und nicht am Schwerpunkt. Das ist keine Feinheit: die Tiere stehen an
> zufälligen Plätzen im Umkreis von 130 u, ihr Schwerpunkt liegt bei drei bis fünf Tieren deshalb
> um mehrere Dutzend Units daneben und erreicht einen Ankunftsradius von 30 u unter Umständen
> **nie**. Gemessen kam die Rotte damit auf 3 % Fresszeit und schlief tagsüber nur zu 5–16 % – sie
> war permanent unterwegs, ohne je anzukommen. Nebenbei ist es auch das richtige Bild: das
> vorderste Tier erreicht die Eichel zuerst, die anderen kommen nach.

> **Das ist ausdrücklich nicht der Schwarm des Barsches.** Dort entsteht der Zusammenhalt aus drei
> Kräften zwischen den Fischen, jeder sieht jeden – deshalb ist er auch der teuerste Teil der
> Simulation. Die Rotte braucht das nicht: sie hat ein gemeinsames Ziel und einen Schwerpunkt, den
> ein Tier je Tick ausrechnet. Das Ergebnis ist ein loserer Verband bei einem Bruchteil der
> Rechenzeit, und der Unterschied ist im Merkmalsvektor messbar (Abstand zum Artgenossen: Barsch
> 23 u, Rotte 40–70 u).

*Nachtaktiv.* Wach von `0.70` bis `0.30` des Tages – **das erste Tier, dessen Wachfenster über
Mitternacht läuft.** Aufgebrochen zum Schlafplatz wird ab `0.24`, also noch im Dunkeln, damit der
Weg nicht in den hellen Morgen fällt.

> **Gemessen 55 % Nachtaktivität, nicht 85 %** – und das ist kein Mangel, sondern die Definition.
> Der Tracker zählt als „Nacht" nur `0.80–0.20`, also 40 % des Tages; die Rotte ist aber 60 % des
> Tages wach, weil „Nacht **+ Dämmerung**" eben auch die beiden Dämmerungen einschließt. Mehr als
> rund zwei Drittel sind damit gar nicht erreichbar. Als Trennmerkmal reicht es mit Abstand:
> Ente 10 %, Reh 11 %, Barsch 18 % – die Rotte 55 %.

*Das Revier ist ein Waldstück, kein Kreis.* Jede Rotte gehört zu **einer Waldregion**
(`terrain.forestRegions`) und nutzt sie **ganz**, dazu einen Streifen von **280 u** ringsum – dort
liegen die Apfelbäume (die halten laut Weltgenerator Abstand zum Wald), die Bodenflächen und das
Wasser. Angefangen wird trotzdem an einem **Nussnest** (`objects.resourcePatches`), und aus dem
ergibt sich das Waldstück: Nussnester liegen mindestens 26 Zellen tief im Wald und es gibt nur 3–5
davon auf der ganzen Karte, ein zufällig gewähltes Waldstück hätte womöglich keins – und dann
fehlte der Rotte ihre Hauptnahrung. Zwei Rotten bekommen verschiedene Nester.

> **Ein fester Radius war der falsche Zuschnitt.** Ein Waldstück ist bis zu 900 u lang; ein Kreis
> von 500 u darum ist entweder viel zu groß oder schneidet den halben Wald ab, und die Rotte lebte
> in einer Ecke ihres eigenen Waldes. Deshalb ist die Reviergrenze das umschließende Rechteck der
> Waldregion plus den Streifen – ein Rechteck ist hier kein Notbehelf, sondern die Form der Sache.

*Sie kann den Wald wechseln.* Läuft die Rotte bei der Wahl einer neuen Nahrungsstelle einem
anderen Waldstück über den Weg (näher als **220 u**), zieht sie mit **5 %** dorthin um und nimmt
dessen Nussnester als neue Wahl. Gemessen **7 Wechsel über 10 Seeds** – es kommt vor und bleibt
die Ausnahme, das Revier ist über die fünf Tage also erkennbar.

> **Das Revier ist der Gegenentwurf zum Reh**, das ausdrücklich keins hat. Gemessen: genutztes
> Gebiet **137k u²** gegen die 219k des Rehs bei fast gleicher Körpergröße, und im Mittel nur
> **1–65 u außerhalb** des eigenen Waldstücks. Wenn im Revier kein Apfelbaum und kein
> Ameisenhügel liegt, kommt die Rotte an diese Nahrung nicht heran – das ist hingenommen und wird
> gemessen, nicht repariert.

*Fressen ist die Hauptbeschäftigung.* Anders als das Reh **sieht** das Wildschwein seine Nahrung
nicht, es **kennt sein Revier**: alle Nussnester, Apfelbäume und Ameisenhügel darin stehen ihm zur
Wahl. Gewichtet wird nach Vorliebe mal Vorrat, die Entfernung zählt schwach dagegen:

| Nahrung | Vorliebe | Form | Wo |
|---|---|---|---|
| Nüsse | 1.00 | Ortsnahrung | im Wald, `objects.resources` |
| **Wurzeln und Bodentiere** | 0.72 | **Flächennahrung** | überall auf sichtbarem `GROUND` |
| Äpfel | 0.55 | Ortsnahrung | am Waldrand und auf Gras, `objects.appleTrees` |
| Ameisen | 0.30 | Ortsnahrung | offene Flächen, `objects.anthills` |

An einer Stelle wird **30–58 s** gewühlt, danach ist sie **60–140 s** gesperrt. Die Entfernung
zählt kräftig gegen den Vorrat (`0.0050` je Unit), sonst zieht die Rotte quer durch ihr Waldstück
und ist die halbe Nacht unterwegs.

> **Der Boden ist nicht Beiwerk, er ist der Grund, warum die Rotte überhaupt frisst.** An einem
> Nussnest hängt der Vorrat an *einem* Punkt – dort frisst also nur, wer nah genug davorsteht
> (< 70 u). Für alle anderen wäre die Fressphase eine Standphase: ein Tier wühlt, vier sehen zu.
> Deshalb wühlt jedes Tier, das nicht am Nest steht, **im Boden unter sich**. Und weil sichtbarer
> Boden eine gleichberechtigte Wahl bei der Zielsuche ist, geht die Rotte auch eigens dorthin.
> Beides sind getrennte Karten, es wird nichts doppelt gefressen.

> **Die Nüsse teilt sie sich mit dem Reh** (§1, „Die Karte gehört der Nahrungsart"). Das war eine
> bewusste Entscheidung und keine Nachlässigkeit: die beiden konkurrieren wirklich. Weil 3–5 Tiere
> gleichzeitig an derselben Stelle fressen, ist ein Nussnest drei- bis fünfmal so schnell leer wie
> beim einzeln lebenden Reh. Der Preis steht in §6.

*Suhlen ist die zweite.* Alle **4.5–6.5 Simulationsstunden** legt sich die Rotte für **26–48 s**
auf sichtbaren **Boden** (`GROUND`) und suhlt sich dort; bewegt wird sich dabei fast nicht
(`0–1.2`). **Feste Suhlen gibt es nicht** – gesucht wird die Bodenstelle, die gerade im Revier in
der Nähe liegt, genau wie das Reh seinen Schlafplatz sucht. Gewählt wird dabei nicht irgendein
Bodenpunkt, sondern einer **mit Boden um sich herum**: die Bodenflecken der Karte sind schmal, und
eine Stelle an deren Rand liegt schon zur Hälfte im Gras. Steht die Rotte ohnehin schon auf Boden
und ist das Bedürfnis binnen 1.5 h fällig, legt sie sich gleich hin, statt eigens loszugehen.

Gemessen: **1.4–2.0 Suhlgänge je Tier und Nacht**, **10–23 % der Wachzeit** suhlend, davon
**67–100 % tatsächlich auf Boden**.

> Das machte das Wildschwein zum **ersten Tier, das den sichtbaren Boden nutzt** – die kleinste
> Fläche der Karte (5–11 %), an der bis dahin alle anderen Arten nur vorbeigelaufen sind. Im
> Merkmalsvektor ist das die Zeile „Zeit auf Boden": **15.6 %** gegen 0.2 %, 0.0 % und 0.8 %. Das
> war das trennschärfste neue Merkmal, das dieses Tier mitgebracht hat.
>
> **Allein ist es damit seit dem Kaninchen nicht mehr**, und der Vergleich ist lehrreich: liegt
> dessen Bau an einem Sandfleck, kommt es auf **47 %** und damit auf das Dreifache. Die Zeile
> trennt die beiden trotzdem, nur eben andersherum als gedacht – nicht „Boden ja/nein", sondern
> „ein Sechstel der Zeit gegen die Hälfte". Und sie tut es nicht zuverlässig: eine Kaninchenfamilie
> mitten auf der Wiese steht bei 0 %. Ein Merkmal, das bei derselben Art zwischen 0 und 47 %
> schwankt, ist genau die Sorte Falle, die im Unterricht sichtbar werden soll.

*Trinken 2 Mal in der Nacht.* Alle **4.2–5.5 Simulationsstunden**, und weil nur nachts getrunken
wird, passen genau zwei Gänge in die Wachzeit. Die ganze Rotte geht gemeinsam zum nächsten
Gewässer (`20–28`) und trinkt **6–10 s** am Ufer. Wie beim Reh gilt der Gelegenheitsschluck:
kommt sie ohnehin an Wasser vorbei (< 130 u) und ist der Durst binnen 1.5 h fällig, trinkt sie
gleich mit. Gemessen **1.6–1.9 Gänge je Tier und Nacht**.

> **Zwei Bedürfnisse dürfen nicht in fester Reihenfolge geprüft werden.** Solange der Durst zuerst
> abgefragt wurde, gewann er bei ähnlichen Intervallen *jedes* Mal, und das Suhlen fiel von zwei
> Gängen je Nacht auf einen – eine Zusage dieser Datei war durch eine Zeilenreihenfolge im Code
> ausgehebelt. Jetzt kommt zuerst dran, was länger überfällig ist.

> **Und keins von beiden unterbricht eine laufende Fressphase**, sie warten auf deren Ende. Das ist
> derselbe Zusammenstoß zweier Zusagen, der beim Reh schon dokumentiert ist: mit zwei Trink- und
> zwei Suhlgängen in einer Wachzeit von 180 s wird jede Mahlzeit nach gut einer Minute
> zerschnitten, und dann hilft auch keine längere Fressphase mehr – gemessen blieb das Wühlen bei
> 15 %, egal ob die Phase 40 oder 88 s dauern durfte. Nach dem Suhlen und Trinken wird außerdem
> **gleich an Ort und Stelle weitergewühlt**, sofern dort Boden ist; ohne dieses Zugeständnis
> kostet jeder der vier Gänge zusätzlich einen Rückweg, und das Wühlen fiel von 30 % auf 13 %. Das
> Reh hat aus demselben Grund seinen kurzen Zug nach dem Trinken.

*Tagsüber eng beieinander im tiefen Wald.* Gesucht wird ab `0.24` ein Platz **mitten im Wald**
(Waldtiefe ≥ 7 Zellen, nicht am Rand wie beim Reh) im Umkreis von 400 u, höchstens 600 u entfernt.
Alle Tiere der Rotte legen sich in einem Umkreis von **45 u** um diesen Punkt hin – deutlich enger
als der Verband beim Ziehen. **Ein fester Schlafplatz ist das nicht:** gesucht wird jeden Morgen
neu, von dort aus, wo die Rotte gerade steht. Gemessen: **94–100 % des hellen Tages schlafend**,
davon **52–100 % im tiefen Wald**.

*Andere Tiere.* Größenklasse 4. Geflohen wird erst vor Größenklasse ≥ 5 (Radius 130 u × Scheu,
4–9 s) – im Kernset gibt es davon nichts, der Zweig ist über den künstlichen Störer in
`tools/simtest.js` geprüft, und zwar gegen beide Seiten der Regel. Ente und Barsch werden
ignoriert. *„Vertreibt Größenklasse 1" aus der Tabelle ist mit dem Kaninchen entschieden – und zwar
gegen den Einbau: das Kaninchen flieht schon von sich aus vor Größenklasse ≥ 2 und ist weg, bevor
die Rotte etwas zu vertreiben hätte. Ein zweiter Mechanismus für dasselbe sichtbare Ergebnis wäre
nur eine weitere Stelle, an der sich Zahlen verschieben können.*

*Was das Wildschwein den anderen antut.* Mit Größenklasse 4 löst es die Fluchtregel des Rehs aus
(„flieht vor Gr. ≥ 4") – und sein Revier liegt auf einem Nussnest, also genau dort, wo das Reh
seine Umwege hin macht. Nachts am Wasser scheucht es außerdem Enten und Barschschwarm auf. Alle
drei bereits justierten Arten bekommen dadurch neue Werte; siehe §6.

*Frischlinge gibt es nicht.* Die frühere offene Frage ist entschieden: die Rotte als loser Verband
ist das Neue an diesem Tier, eine zweite Größen- und Tempoklasse darin würde das nur verwischen.

**Fuchs** — **das Revier ist eine Form, kein Radius, und es ist das Tier.** Alles andere hängt
daran: der Bau liegt darin, die Grenze wird abgelaufen, die Querungen gehen quer hindurch, das
Wasser darin ist die Trinkstelle. Damit ist er der Gegenentwurf zum Reh, das gar kein Revier
hat, und zum Dachs, dessen Revier nur ein Suchraum ist, den er nie eigens aufsucht.

*Zwei bis vier Reviere teilen die Karte auf.* Die Karte wird in so viele gleich große Zellen
zerlegt, wie es Füchse gibt – bei zwei die linke und rechte Hälfte, bei drei Spalten, bei vier
Quadranten –, und jedes Revier füllt seine Zelle. Die gerechte Aufteilung ist damit
**strukturell erfüllt** und nicht durch Verwerfen erzwungen; dasselbe Prinzip wie „Wald wird
abzüglich eines Uferstreifens gestempelt" im Weltgenerator. Daraus folgt die Größe – sie ist
nicht frei wählbar:

```
rx = Zellbreite / 2 · 0.84        ry = Zellhöhe / 2 · 0.84
2 Füchse → 336 × 420 u      3 → 224 × 420 u      4 → 336 × 210 u
flächengleicher Radius:  376 u          307 u           266 u
```

> **Die ~520 u der Tabelle waren immer der Fall „zwei Füchse".** Die Zahl stimmt, sie ist nur
> keine Konstante. Bei vier festen 520-u-Revieren lägen zusammen 3.4 Millionen u² auf einer
> Karte von 1.6 Millionen: die Reviere deckten sich zur Hälfte, und „jeder hat sein eigenes
> Revier" wäre nicht mehr zu sehen. Wer die Reviergröße festschreiben will, muss die Anzahl
> festschreiben.

> **Der Füllfaktor stand einmal auf 1.05 und steht jetzt auf 0.84 – die Reviere sind 20 %
> kleiner.** Linear, nicht in der Fläche: 20 % kürzerer Radius, eingeschlossene Fläche auf
> 0.64. Sichtbar ist daran zweierlei. Erstens **liegen jetzt Lücken zwischen den Revieren** –
> im Zellabstand berühren sich zwei Ellipsen rechnerisch gar nicht mehr, und was sich
> überhaupt noch überschneidet, sind ausschließlich Beulen zweier Konturen (auf der Hälfte der
> Seeds gemessene 0 %, im schlimmsten Fall weiterhin die zugesagten 10 %). Zweitens ist eine
> kleinere Blase **schlechter darin, ein Gewässer zu treffen**: zwei von 31 Revieren hatten
> danach keins mehr, und das ist ein Verstoß und kein Messwert, denn dort kann der Fuchs nicht
> trinken. Der Mittelpunkt darf deshalb in einer *dritten* Stufe noch weiter wandern – zu
> bezahlen war das aus genau der Reserve, die das kleinere Revier gerade freigemacht hat.

> **Die Blase ist eine Ellipse mit Wellen, kein Kreis mit Wellen.** Eine Zelle ist bei vier
> Füchsen 800 × 500 u; ein flächengleicher *Kreis* hat dort 748 u Durchmesser, ragt also weit
> über die 500 u hohe Zelle hinaus und lässt zugleich deren Ecken leer. Zwei senkrecht
> benachbarte Reviere überlappten sich damit gemessen zu **53 %** statt der zugesagten 10 %.
> Mit dem Seitenverhältnis der Zelle sind es rund 7 % – und die Blase sieht nebenbei aus wie
> die Skizze: lang gezogen und unrund.

> **Die 10 % werden nachgemessen und erzwungen, nicht erhofft.** Eine Beule der Kontur kann
> genau auf den Nachbarn zeigen, und dort ist der örtliche Abstand kleiner als der gerechnete
> (gemessen 16 %, obwohl die Ellipsen darunter bei 9 % lagen). Ein zu großes Revier wird
> deshalb so lange verkleinert, bis es passt – höchstens aber um ein Viertel. Ein Revier, das
> gar keins mehr ist, wäre der schlechtere Fehler: mit einer zu großzügigen Streuung des
> Mittelpunkts musste diese Nachkorrektur schon einmal ein Revier auf ein Viertel der Fläche
> stauchen, und von „halbwegs gerecht" blieb nichts. Gemessen über zehn Seeds: **höchstens
> 10 %**.

*Jeder bekommt Wasser und Wald.* Der Mittelpunkt wird innerhalb seiner Zelle gezogen, und aus
mehreren Kandidaten gewinnt der, dessen Blase am meisten Wasser und Wald enthält. Findet die
enge Ziehung nichts, darf der Mittelpunkt in einer zweiten und notfalls dritten Stufe weiter
wandern. Gemessen hat über zehn Seeds **kein einziges Revier gar kein Wasser**; ohne Wald
bleiben **2 von 31**, und das ist hingenommen: bei vier Füchsen ist eine Zelle nur 800 × 500 u
groß, und der Wald der Karte liegt in wenigen Klumpen. Das wird gemessen, nicht repariert.

*Zweimal je Nacht ein Stück der Grenze, nicht zweimal die ganze.* Je Teilrunde rund **75 % des
Umfangs**, begonnen dort, wo die letzte aufgehört hat, immer in derselben Richtung. Über fünf
Nächte ist die Blase dadurch mehrfach geschlossen abgelaufen und liegt als Linie auf der Karte.
Gemessen **2.1 Teilrunden je Fuchs und Nacht**, und über die fünf Nächte **100 % der Grenze**
abgelaufen – auf jedem der zehn Seeds.

*Er soll am Rand unterwegs sein, und das wird gemessen.* Der Anteil der Wachzeit im **äußeren
Ring des Reviers** (ab 0.75 des örtlichen Radius) liegt bei **51 %**, je nach Seed rund 45 %
bis 59 %. Die Zahl ist zweimal gestiegen: 39 % vor der Verkleinerung des Reviers, 47 % mit den
Teilrunden von 75 %, 52 % mit dem Saum – der Uferstreifen hat davon einen Punkt zurückgenommen,
weil ein Revier mit See am Rand dort jetzt nicht mehr ganz außen abgelaufen wird.

*Der Saum: ein Stück Grenze am Ende jeder Querung.* Die Querung endet ohnehin drüben am Rand –
dort läuft der Fuchs mit 90 % Wahrscheinlichkeit noch **6–14 Stützstellen die Grenze entlang**,
bevor er zurückquert. Er zählt dabei auf einem eigenen Index weiter und rührt den der
Patrouille nicht an; sonst spränge die nächste Teilrunde dorthin, wo die letzte Querung
zufällig geendet hat, und aus zwei Teilrunden je Nacht würde über fünf Nächte keine
geschlossene Blase mehr.

> **Warum der Saum und nicht einfach längere Teilrunden.** Weil er nichts kostet. Eine längere
> Teilrunde bringt den Fuchs zusätzlich ans Ufer und stößt damit an die Barsch-Grenze
> (nächster Absatz); der Saum läuft dort, wo er nach der Querung ohnehin schon steht.
> Gemessen: der Saum bringt fünf Punkte Randanteil und lässt die Nachtruhe des Schwarms
> unberührt, 85 % Teilrunde bringen einen Punkt und halbieren den Abstand zur Schwelle.

> **Die 75 % sind zuerst ein Ausgleich und erst dann eine Erhöhung.** Ein Revier mit 20 %
> kürzerem Radius, abgelaufen mit 20 % mehr Tempo, kostet je Teilrunde nur noch zwei Drittel
> der alten Zeit: bei den alten 40 % wäre der Fuchs nach der Änderung mit rund 27 % *weniger*
> am Rand unterwegs gewesen als vorher. Wer eine Größe und ein Tempo anfasst, hat damit schon
> das Bewegungsmuster angefasst.

> **Zwei volle Runden passen weiterhin nicht in eine Nacht.** Die Nacht des Fuchses hat rund
> **168 nutzbare Sekunden**; ein Umlauf misst bei 36 u/s zwischen 55 s (vier Füchse) und 75 s
> (zwei Füchse). Rechnerisch wären zwei volle Runden seit dem kleineren Revier zwar drin – für
> Querungen, Trinken und Jagd bliebe dann aber nichts, und drei Zusagen dieser Datei fielen
> ersatzlos aus, ohne dass irgendwo ein Fehler stünde. Das ist genau die Zeitbudget-Falle, die
> beim Dachs schon einmal 1–3 Trinkgänge auf 0.0 gedrückt hat.

> **Die Obergrenze steht nicht beim Fuchs, sondern beim Barsch.** 85 % je Teilrunde trägt das
> Zeitbudget noch (gemessen 50 % statt 47 % im äußeren Ring, Trinkgänge unverändert 1.8) – der
> Schwarm trägt es nicht. Ein Fuchs, der länger auf seiner Grenze läuft, ist länger am Ufer,
> und der Barsch flieht vor allem, was näher als 95 u kommt, ohne Größenschwelle: auf Seed
> 315927 war seine Nachtruhe danach nicht mehr messbar. Diese Schwelle ist wegen des Fuchses
> schon einmal nachgegeben worden (§6); ein zweites Mal wäre sie keine Zusage mehr.
>
> Mit dem Saum wurden die 85 % noch einmal probiert und wieder verworfen: ein Punkt mehr
> Randanteil (53 statt 52 %), dafür stieg das Nachttempo des Schwarms auf Seed 315927 von
> 72 auf 86 % des Tagtempos – erlaubt sind 90.

*Dazwischen quer durch.* Ein Querungsziel liegt auf der **gegenüberliegenden** Seite des
Reviers, nicht irgendwo darin – frei gewürfelt bliebe der Fuchs um seinen Bau, dieselbe
Überlegung wie bei der Beharrung der Zugrichtung beim Reh. Abgegangen wird es in Etappen von
90–260 u, nach gut jeder zweiten Etappe steht er 1.5–4 s still. Das Ziel liegt im Mittel bei
**0.85 des örtlichen Radius** (0.66–0.98 je nach Fuchs und Zug) – vorher waren es 0.72, und
damit drehte der Fuchs regelmäßig knapp *vor* seiner eigenen Grenze um.

> **Eine Radialkontur ist sternförmig, aber nicht konvex – und die Querung ist die längste
> Sehne, die es im Revier gibt.** Jede Strecke von der Reviermitte nach draußen bleibt drin,
> das definiert r(θ); eine Sehne zwischen zwei Punkten darin aber nicht, sie schneidet die
> Beulen ab, die die Blase erst zur Blase machen. Gemessen lief der Fuchs **17.7 % jeder
> Querung außerhalb** – mehr als Flucht, Jagd und Trinken zusammen. Hält die Sehne nicht, wird
> das Ziel deshalb nicht verworfen, sondern **über die Reviermitte angesteuert**: zwei
> Strecken, die beide von der Mitte ausgehen, liegen immer drin. Aus derselben Eigenschaft
> folgt also beides – dass die Sehne reißen kann und wie man sie flickt.
>
> Der erste Versuch war, das Ziel stattdessen zur Mitte hin *nachzuziehen*. Er nahm die Ansage
> „mehr an der Grenze" über die Hintertür wieder zurück: quer durchs Revier schneidet fast jede
> Sehne irgendeine Beule an, und die Querungsziele landeten wieder bei 0.6 des Radius.

> **Kein Ziel liegt im Wasser oder direkt davor.** Querungsziele, Patrouillen- und Saumpunkte
> müssen begehbar *und* mindestens 20 u vom Wasser entfernt sein; ein Grenzabschnitt, der im
> See liegt, wird übersprungen und gilt trotzdem als abgelaufen.

*Und er geht um den See herum, nicht am See entlang.* Ein Ziel jenseits eines Sees ist der
teuerste Fall, den es für ein Landtier gibt. Der Ausweichfächer reicht nur über ±109°: er
blockiert nicht, er **schiebt** – das Tier trabt am Ufer entlang, so lange sein Ziel drüben
liegt. Weil die Querung absichtlich durch das *ganze* Revier geht, trifft sie ständig auf Seen.
Auf dem Vorschaubild zeichneten vier Füchse in fünf Nächten dadurch **jede Seekontur der Karte**
als dicke Linie nach – ein Tier, das Teiche umrundet. Drei Dinge zusammen nehmen das weg:

* **Ein eigener Uferstreifen von 20 u.** Unterwegs sieht der Fuchs nicht das begehbare Gelände,
  sondern eine Fassung davon, in der auch alles innerhalb von 20 u um Wasser als unbegehbar
  gilt. Der Fächer schiebt ihn dann *vor* dem Streifen herum statt auf der Wasserlinie –
  dieselbe Bewegung, nur eine Tierbreite weiter draußen, und der Ring verschwindet vom Bild.
  Der Streifen gilt nicht, wenn er ohnehin schon am Ufer steht, nicht beim Trinken und nicht
  auf der Hetze; sonst käme die Art nie mehr ans Wasser.
* **Ein Knickpunkt neben der Geraden.** Geht der gerade Weg durchs Wasser, wird seitlich der
  Streckenmitte ein Punkt gesucht – fünf Abstände × beide Seiten × drei Ufermargen –, so dass
  beide Teilstrecken trocken bleiben und der Umweg höchstens das Doppelte der Luftlinie kostet.
  Ein Bogen, der dabei aus dem Revier führt, wird mit 35 % Aufschlag bewertet und verliert
  damit gegen jeden Bogen, der drinbleibt. Findet sich keiner, bleibt der Weg über die
  Reviermitte.
* **Eine Reißleine.** Steht der Fuchs länger als 2.5 s dicht am Wasser und liegt sein Ziel
  immer noch hinter einem See, wird der Knickpunkt neu gesucht. Ohne sie hilft die Planung beim
  Aufbruch nichts gegen die Fälle, in denen er erst *unterwegs* an ein Ufer gerät.

> Gemessen fällt die Strecke, die er näher als 25 u am Wasser zurücklegt, von **13.3 % auf
> 8.0 %** der gelaufenen Gesamtstrecke. Der Vergleichswert für „gar keine Rücksicht" ist 5.9 % –
> so viel Landfläche liegt in den Revieren ohnehin ufernah. Ufermärsche von mindestens 120 u am
> Stück: **343 → 158**, ihre Gesamtlänge **90 287 → 35 294 u**.
>
> **Die Breite des Streifens steht wieder beim Barsch.** Mit 55 und 95 u statt 20 u wurden die
> Bögen so weit, dass sie den Schwarm mehr störten als der Uferlauf vorher – auf Seed 999999
> war seine Nachtruhe nicht mehr messbar (0.95 statt erlaubter 0.90). 20 u ist das schmalste
> Maß, das den Ring vom Bild nimmt, und genau deshalb das richtige. Das ist dieselbe Obergrenze
> wie bei der Patrouille, nur von der anderen Seite: der Barsch begrenzt, wie *nah* der Fuchs
> ans Ufer darf, und wie *weit* er dafür ausholen darf.

> **Auch die Hetze endet am Ufer, statt daran entlangzulaufen.** Ist die Beute im Wasser und
> steht der Fuchs näher als 22 u am Wasser, bricht er ab. Vorher endeten drei von vier
> Entenjagden damit, dass er der Ente am Ufer nachtrabte, bis der Radius riss – jetzt jede
> zehnte. Die Hetze ist der einzige Zustand, der den Uferstreifen gar nicht kennt: sie soll
> ans Wasser führen, sie soll dort nur nicht bleiben.

> **Und aus einer Sackgasse läuft er sich frei.** Der Fächer reicht nur über ±109° und kann
> nicht umdrehen; ein bloßes „Blickrichtung um 180° drehen" genügt nicht, weil der nächste
> Schritt sie sofort wieder auf den Zielpunkt zudreht. Ein Fuchs lief dadurch die letzten vier
> Tage der Aufzeichnung in einem 130 u langen Streifen am Kartenrand auf und ab und fand nie
> zu seinem Bau zurück (Reviertreue 33 % statt 95 %). Jetzt verfolgt er nach mehrfacher
> Blockade für 1.5–3.5 s gar kein Ziel mehr, sondern nur noch eine Richtung – dieselbe
> Bewegung wie bei der Flucht, und die kommt nachweislich heraus.

*Der Bau liegt im Wald*, im eigenen Revier, ohne Tiefenanforderung (wie beim Dachs, anders als
beim Wildschwein). **Genau einer der 2–4 Füchse schläft mit in einem Dachsbau** – gewählt wird
das Paar aus Fuchs und Dachsbau, bei dem der Bau am dichtesten an einer Reviermitte liegt.
Liegt in keinem Fuchsrevier ein Dachsbau, teilt in dieser Welt niemand; gemessen kommt das auf
**5 von 10 Seeds** zustande – vor der Verkleinerung des Reviers waren es 8. Ein kleineres
Revier trifft weniger Baue, und das ist der Preis, nicht ein Fehler in der Zuordnung.

> **„Im Revier" geht dabei vor „im Wald".** Findet sich im eigenen Revier keine Waldstelle,
> legt der Fuchs seinen Bau lieber auf Gras als in einen fremden Wald. Der Grund ist kein
> Geschmack, sondern Arithmetik: er schläft zwei Drittel jedes Tages im Bau, und liegt der
> außerhalb der Blase, verbringt das Tier zwei Drittel seines Lebens außerhalb des eigenen
> Reviers. Gemessen fiel die Reviertreue dadurch von 97 % auf 54 % – ein Revier, das dem Tier
> nicht mehr anzusehen ist. Ein Bau auf Gras ist dagegen nur eine Abweichung im Detail.

*Und er bleibt drin.* Gemessen liegt der Fuchs **97 % der Zeit im eigenen Revier**
(schlechtester Einzelwert 94 %, vorher 92 % und 86 %). Über zehn Seeds, 31 Füchse und fünf
Nächte bleiben rund **440 Austritte von im Mittel 3 s**, und sie kommen aus vier Quellen, die
einzeln gemessen und einzeln abgestellt worden sind:

| Quelle | vorher | wodurch |
| --- | --- | --- |
| Flucht | die Hälfte aller Austritte, 45 % der Fluchtzeit draußen | am Rand dreht die Fluchtrichtung nach innen – höchstens eine Vierteldrehung, der Störer bleibt hinter ihm |
| Schlafplatz | 18 % der Zeit draußen, obwohl der Bau drin liegt | der Platz neben dem Bau muss selbst im Revier liegen; sonst wird im Bau geschlafen |
| Querung | 17.7 % der Querungszeit draußen | die Sehne wird geprüft, sonst geht es über die Mitte (oben) |
| Hetze, Trinken | Beute und Ufer ziehen über die Grenze | er folgt höchstens 45 u über die Kontur hinaus, bricht am Ufer ab (22 u) und trinkt am See, dessen **Ufer auf seiner Seite** im Revier liegt |

> **„Im Revier bleiben" und „an der Grenze laufen" ziehen gegeneinander.** Wer sich am Rand
> aufhält, tritt leichter hinaus; wer sicher drin bleiben soll, endet in der Mitte. Beides
> zugleich geht nur, wenn man weiß, *wodurch* er hinaustritt – deshalb die Tabelle. Erst als
> die vier Quellen versiegt waren, war Platz für den Saum, ohne die Zeit außerhalb wieder
> mitzubringen: 47 → 52 % am Rand **und** 92 → 97 % im Revier.

> **Die Fluchtrichtung wird nur am Rand gedreht** (ab 0.80 des örtlichen Radius). Mitten im
> Revier ist sie eine Frage des Störers und keine der Geografie. Nötig ist die Drehung, weil
> eine Flucht 3–7 s bei 84 u/s dauert – bis zu 660 u, während das Revier 266–376 u Radius hat.
> Aus der Fluchtgeraden wird so ein Bogen, der ins Revier passt.

*Er jagt, aber er tötet nicht.* Ente und Kaninchen sind Beute, und beide fliehen von sich aus –
das Kaninchen zum Bau (es flieht ab Größenklasse 2, der Fuchs ist 2), die Ente aufs Wasser
hinaus. Die Jagd endet damit, dass die Beute weg ist, und sonst gar nichts: kein Vorrat, keine
Sättigung, kein totes Tier.

| Beute | Wann | Sichtweite | Bedingung |
|---|---|---|---|
| **Kaninchen** | nur in der Dämmerung | 150 u | nur außerhalb des Baus |
| **Ente** | die ganze Nacht | 130 u | nur wenn der Fuchs ohnehin ans Wasser kommt (< 90 u) |

> **In der Nacht ignorieren sich Fuchs und Kaninchen vollständig**, und das ist keine Regel im
> Fuchs, sondern eine Folge des Kaninchens: nachts sitzt es tief im Bau, und was im Bau sitzt,
> ist für die Beutesuche gar nicht erst sichtbar. In der Dämmerung – morgens ab `0.24`, abends
> bis `0.74` – ist es draußen, und da versucht der Fuchs sein Glück. Dieselbe Idee wie „ein
> schlafendes Tier stört niemanden", nur von der anderen Seite.
>
> **Schlaf allein macht aber nicht unerreichbar, und die beiden Beutetiere trennen sich genau
> daran.** Ein Kaninchen wird nur gejagt, solange es *wach* ist; eine Ente auch im Schlaf –
> sie liegt dabei am Ufer auf offenem Wasser, und genau das ist der klassische Fall. Wäre
> „Schlafende sind nie Beute" eine allgemeine Regel, fiele die Entenjagd praktisch aus: die
> Ente schläft fast das ganze Wachfenster des Fuchses über. Unerreichbar ist nur der Bau.
>
> **Der Aufbruch zum Schlafplatz liegt deshalb bei `0.28` und nicht früher.** Das Kaninchen
> wacht um `0.24` auf; ein Fuchs, der ab `0.26` heimliefe, hätte morgens sechs Sekunden
> Überschneidung. Mit `0.28` sind es zwölf. Gemessen über zehn Seeds: **192 Entenjagden und
> 28 Kaninchenjagden**, keine einzige außerhalb der Dämmerung und keine gegen ein Tier im Bau –
> `tools/simtest.js` prüft beides auf glatt null.

> **Nach einer Hetze folgt eine Sperrzeit von 20–45 s.** Ohne sie hetzt ein Fuchs, dessen
> Grenze am Kaninchenbau vorbeiführt, die halbe Nacht dasselbe Tier – das ist derselbe
> Unterschied zwischen „einmal erschrocken" und „Dauerzustand", den das Kaninchen mit seiner
> Wartezeit im Bau schon einmal gelöst hat.

*Und danach trinkt er.* Endet eine Entenjagd am Ufer und ist der Durst binnen 1.5 h fällig,
trinkt der Fuchs gleich mit – dasselbe Zugeständnis wie der Gelegenheitsschluck bei Reh und
Wildschwein. Sonst geht er **1–2 Mal je Nacht** zum nächsten Gewässer **im eigenen Revier**;
dass dort eines liegt, ist der Grund für die Wasserbedingung bei der Revierwahl. Gemessen
**1.6 Trinkgänge je Fuchs und Nacht** (vorher 1.8 – der Uferstreifen macht den Weg zum Wasser
etwas länger, ohne die Zusage zu brechen).

> **Gewählt wird nach dem Ufer, nicht nach der Mitte.** Getrunken wird da, wo er ankommt, und
> das ist das nächste Ufer: ein See, dessen Mitte im Revier liegt, dessen Ufer auf seiner Seite
> aber davor, führte ihn aus dem Revier heraus (15 % der Trinkzeit). Drei Stufen wie beim Bau –
> Ufer im Revier, sonst Mitte im Revier, sonst das nächstgelegene überhaupt: lieber ein Ausflug
> als eine Art, die nie trinkt.

*Er schwimmt nicht.* Die Hetze auf eine Ente endet am Ufer – jeder Schritt wird gegen das
begehbare Gelände geprüft, und ist die Ente erst auf dem Wasser, bricht er ausdrücklich ab,
statt ihr am Ufer nachzutraben. Was danach auf dem Wasser passiert, ist Sache der Ente.

*Nachts unterwegs.* Wach von `0.70` bis `0.30` des Tages (Nacht + beide Dämmerungen, Fenster
über Mitternacht wie beim Wildschwein), aufgebrochen zum Bau wird ab `0.26`. Nach dem Aufwachen
steht er noch 0–12 s am Bau herum – bei einer Art mit 2–4 Tieren in getrennten Revieren ist das
weniger nötig als beim Dachs, aber der erste Augenblick der Aufzeichnung liegt mitten in der
Nacht, und ohne Streuung beim Anlegen sieht man beim Start alle gleichzeitig loslaufen.

*Andere Tiere.* Größenklasse 2. Geflohen wird vor Größenklasse ≥ 4 (Wildschwein, später Bär),
Radius 120 u × Scheu. Barsch und Fledermaus werden ausdrücklich ignoriert – der eine unter, die
andere über ihm. Reh und Dachs lassen ihn kalt und er sie: beide fliehen erst ab Größenklasse 4
bzw. 5.

*Was der Fuchs den anderen antut.* Viel, und das ist diesmal der Zweck – er ist der erste
Räuber des Katalogs. Verschoben hat er genau **drei** Arten, und alle drei aus einem Grund,
den man benennen kann:

* **Ente und Kaninchen**, weil er sie jagt. Das ist die Zusage, keine Nebenwirkung.
* **Barsch**, weil er nachts sein ganzes Revier abgeht und jedes Revier ein Gewässer enthält.
  Der Schwarm flieht vor allem, was näher als 95 u kommt – ohne Größenschwelle.

**Reh, Wildschwein, Fledermaus und Dachs stehen dagegen bitgleich auf ihren alten Werten.**
Das ist kein Zufall: mit Größenklasse 2 löst der Fuchs bei keinem von ihnen etwas aus (sie
fliehen ab 4 bzw. 5), er nimmt keinem etwas weg (er frisst nicht), und er flieht selbst nur vor
dem Wildschwein. Ein Räuber verschiebt also nicht pauschal alles, sondern genau das, was mit
ihm zu tun hat.

> **Der Preis steht beim Barsch.** Sein Abstand zum Ruhepunkt steigt nachts von 31–75 u auf
> 38–93 u, und drei Prüfschwellen in `tools/simtest.js` mussten mit: Barsch „nachts langsamer"
> 0.85 → 0.90, Barsch „Ruhezone" 80 → 100 u, Barsch „nachtaktiv" 20 → 25 %, Ente „nachts wach"
> 28 → 36 %. Die Ruhezone bleibt erkennbar (tags 70–124 u), sie ist nur kein dichtes Knäuel
> mehr. **Diese Schwellen sind seither die Obergrenze für alles, was den Fuchs länger ans Ufer
> bringt** – an ihnen ist die Patrouille bei 75 % statt 85 % des Umfangs stehengeblieben. Das ist derselbe Vorgang wie beim Wildschwein, nur eine Stufe stärker – und er hat
> eine Ursache, die sich nicht wegtunen lässt: ein Tier, das jede Nacht sein ganzes Revier
> abläuft, kommt zwangsläufig regelmäßig ans Ufer.

*Das Sprite ist `Fuchs.png`.*

**Kaninchen** ✔ *(eingebaut, Stand oben in der Tabelle)* — **der Bau ist das Zentrum von allem, und
es gibt nichts sonst.** Das Kaninchen
hoppelt, sitzt, flieht und schläft; es frisst nicht, es trinkt nicht, es sucht nichts. Damit ist es
die kürzeste Art des ganzen Katalogs – und der ausdrückliche Gegenentwurf zu den vier davor, deren
Tagesablauf vollständig an ihrem Futter hängt.

> **Warum das kein Sparen ist.** Reh, Wildschwein, Ente und Barsch bewegen sich, *weil* ihr Teller
> leer ist – nimmt man ihnen die Nahrung, bleiben sie stehen. Beim Kaninchen ist die Bewegung
> selbst das Verhalten. Im Merkmalsvektor steht bei „Nahrungsart" deshalb `keine`, und das ist ein
> Wert wie jeder andere: die Schülerinnen und Schüler sehen ein Tier, das sich unablässig bewegt
> und trotzdem nie irgendwo hingeht.

*Ein bis zwei Familien, jede an ihrem Bau.* Auf der Karte leben **4–10 Kaninchen**: bis
einschließlich **7 sind es eine Familie an einem Bau**, ab **8 zwei Familien an zwei Bauen**. Der
Bau wird einmal pro Welt vergeben und bleibt, solange die Welt lebt.

> **Die Familie ist kein Verband, sie teilt nur einen Ort.** Das ist die dritte Form von
> Sozialverhalten im Katalog und die billigste von allen: kein gemeinsames Ziel wie bei der Rotte,
> keine Kräfte zwischen den Tieren wie beim Schwarm, kein Rendezvous. Jedes Kaninchen hoppelt für
> sich; das Einzige, was alle verbindet, ist der Punkt in ihrer Mitte. Gemessen liegen sie
> trotzdem dicht beieinander – **22–39 u zum nächsten Familienmitglied, im Mittel 31 u** –, und
> zwar ohne dass es je einer von ihnen beabsichtigt hätte. Das ist der interessanteste Befund
> dieser Art: *Nähe kann aus einem gemeinsamen Ort entstehen statt aus Zusammenhalt*, und der
> Merkmalsvektor kann die beiden Ursachen nicht unterscheiden. Barsch 23 u, Kaninchen 31 u,
> Rotte 45 u – drei völlig verschiedene Mechanismen, drei fast gleiche Zahlen.

*Der Bau liegt auf Gras oder Boden*, nie im Wald und nie am Wasser: gefordert sind **260 u Abstand
zum nächsten Gewässer** und eine Umgebung, die überwiegend offen ist (mindestens 60 % der Stichproben
im Revier auf Gras oder Boden). Zwei Baue halten **520 u** Abstand voneinander.

> Der Wasserabstand ist keine Naturkunde, sondern Rücksicht auf die schon justierten Arten. Ein
> Kaninchen kommt bei 260 u Bauabstand und 156 u Revierradius nie näher als gut 100 u ans Ufer –
> und liegt damit außerhalb des Fluchtradius der Ente (90 u nachts). **Das Kaninchen ist die erste
> Art, die die Werte der anderen nicht verschiebt**, und das ist nachgerechnet, nicht behauptet:
> `WL.Simulation.run(world, { species: ['ente','barsch','reh','wildschwein'] })` liefert für diese
> vier dieselben Zahlen wie der volle Lauf. Größenklasse 1 löst ohnehin bei keiner anderen Art
> etwas aus.

*Hoppeln und Sitzen, sonst nichts.* Ein Hopser geht **22–70 u** weit mit `24–34`, danach sitzt das
Tier **1.0–4.0 s** still; in **15 %** der Fälle wird daraus eine lange Sitzpause von **5–12 s**.
Die Richtung wird bei **jedem** Hopser neu gewürfelt. Gemessen: **32–36 % der Wachzeit hoppelnd,
49–60 % sitzend**, der Rest im Bau.

> **Das Verhältnis ist die eigentliche Zusage dieser Art**, und es ist zugleich das trennschärfste
> Merkmal, das sie mitbringt: mittleres Tempo **5.0 u/s** gegen **24.2 u/s in Bewegung**. Bei allen
> vier Arten davor liegen die beiden Werte um höchstens den Faktor zwei auseinander (Barsch: gar
> nicht), hier um fast fünf. Ein Kaninchen steht entweder still oder rennt – ein Mittelmaß gibt es
> nicht, und das sieht man auf dem Bildschirm sofort.

> **Genau hier liegt der Gegensatz zum Reh.** Dessen Zugrichtung *beharrt* (±0.45 rad je Zug), und
> deshalb kommt es über die ganze Karte. Das Kaninchen würfelt jedes Mal frei – und ein Irrflug
> kommt nach acht Zügen nur die Wurzel aus acht Zuglängen weit. Was beim Reh ein Fehler gewesen
> wäre, ist hier das Mittel: die zufällige Richtung *ist* der Grund, warum das Tier am Bau bleibt,
> und der Radius nur noch die Sicherung dahinter.

*Das Revier ist ein Kreis um den Bau*, **130 u** groß, mit der individuellen Streuung der
Reviergröße (±20 %) – manche Kaninchen bleiben dichter am Bau als ihre Geschwister. Liegt ein
Hopserziel außerhalb, wird die Richtung zum Bau hin gedreht. Bevorzugt werden offene Ziele auf Gras
und Boden; findet sich keins, wird auch der Waldrand betreten. Zusammen ergibt das den zugesagten
Lebensraum von rund **5 % der Karte**: π·130² ≈ 53k u² sind 3.3 % je Familie, bei zwei Familien
6.6 %. Gemessen als genutztes Gebiet **31–58k u²** je Tier, also 2–4 % – und **100 % der Zeit auf
Gras oder Boden**, im Mittel 35–45 u vom Bau entfernt, nie weiter als rund 155 u.

> **Wieviel davon Gras und wieviel Boden ist, entscheidet der eine Punkt, an dem der Bau liegt.**
> Über zehn Seeds reicht das von 100 % Gras bis 53/47 – eine Familie am Rand eines Sandflecks
> verbringt fast die Hälfte ihres Lebens auf sichtbarem Boden, eine mitten auf der Wiese nie eine
> Sekunde. Das ist keine Streuung im Verhalten, sondern eine im *Ort*, und es ist die stärkste
> Familienunterscheidung im ganzen Katalog: zwei Familien derselben Welt können im
> Merkmalsvektor weiter auseinanderliegen als zwei Arten.

*Flucht heißt Heimlauf.* Kommt ein Tier der Größenklasse ≥ 2 näher als **150 u × Scheu**, rennt das
Kaninchen mit `80–96` **zum Bau** – nicht vom Störer weg. Steht der Störer dazwischen, läuft es an
ihm vorbei; das ist gewollt und der sichtbare Unterschied zur Flucht des Rehs, die nur eine
Richtung kennt. Ente und Barsch werden ignoriert (Wassertiere, denen es nie begegnet).

Gemessen **230 Fluchten über zehn Seeds**, also gut eine halbe je Tier und Tag: sie kommt vor,
ohne den Tag zu bestimmen. Wer sie sehen will, verfolgt ein Kaninchen, dessen Revier an einem
Wechsel des Rehs liegt.

*Im Bau ist Ruhe.* Dort bleibt es **8–20 s**, schaut dann heraus: steht der Störer noch in
Reichweite, bleibt es weitere **3–7 s** drin. **Ein Kaninchen im Bau flieht nicht** – die
Bedrohungsabfrage läuft in diesem Zustand gar nicht erst. Ohne diese Regel würde ein Reh, das
zufällig neben dem Bau äst, das ganze Verhalten übersteuern. Gemessen **3–15 % der Wachzeit im
Bau**, je nachdem, wer in dieser Welt am Revier vorbeikommt.

> Der Unterschied ist im Test sichtbar gemacht: ein künstlicher Störer, der dauerhaft 110 u neben
> dem Bau steht, ergibt **18 Stützstellen fliehend und 37 480 im Bau**. Das Tier läuft *einmal*
> heim und bleibt dann sitzen, statt sich fünf Tage lang immer neu zu erschrecken.

*Nachts im Bau.* Wach von `0.24` bis `0.78` des Tages; heimgehoppelt wird ab `0.74`. Der Weg ist
kurz (höchstens ein Revierradius), deshalb liegt der Aufbruch später als beim Reh. Geschlafen wird
im Umkreis von **34 u** um den Bau, die ganze Familie nebeneinander – enger geht nicht, ein Sprite
ist 26 u breit. Gemessen: **100 % der Nachtruhe am Bau** und **0.5–2.8 % Nachtaktivität**, der
niedrigste Wert des ganzen Katalogs.

*Das Sprite ist `Kaninchen.png`.* `Hase.png` bleibt weiter unbenutzt (§5).

**Fledermaus** ✔ *(eingebaut, Stand oben in der Tabelle)* — anders als bei Reh, Wildschwein und
Kaninchen gab es hier kaum vorhandenes Grundgerüst-Verhalten nachzunutzen: die Fledermaus brauchte
eine neue Bewegungsart (zackiger Flug mit engen Wendekreisen statt Steuern auf ein Ziel) und zwei
neue Ortsarten (Schlafplätze je Wald, Jagdgebiete als eigene Kartenzonen). Sie ist damit die erste
Art mit **domänenfreier Bewegung**: kein Ausweichfächer, keine Landmasse, kein Gewässer — sie darf
überall hinfliegen, solange sie auf der Karte bleibt.

*Kein Fressen, kein Trinken, keine Interaktion.* Wie das Kaninchen hat die Fledermaus keinen
`forage`-Block und keinen Durst – das Jagen im Jagdgebiet ist reine Bewegungsanimation ohne
Vorrat, Vorliebe oder Sättigung (siehe §1, die Insekten-Zeile dort ist zurückgenommen). Ebenso
läuft keine Bedrohungs- oder Fluchtabfrage: die Fledermaus ignoriert jedes andere Tier, so wie
Barsch und Ente einander ignorieren, weil sie in verschiedenen Ebenen unterwegs sind – hier: Luft
gegen Boden/Wasser. Damit ist sie die zweite Art ganz ohne Rückkopplung, nach dem Kaninchen.

*Schlafplätze: ein weltweiter Pool.* Jeder Wald (`terrain.forestRegions`) bekommt einmal pro Welt
zwei zufällige Schlafplätze (`rng.fork('bat-roosts')`, Platzierungsregel analog zum Kaninchenbau
in `js/world/rules.js`). Alle Fledermäuse der Karte wählen jeden Tag neu, unabhängig voneinander,
einen dieser Plätze aus dem *gesamten* Pool – nicht nur aus dem nächstgelegenen Wald. Mehrere
Tiere landen dadurch zufällig am selben Platz, ohne dass das koordiniert wäre; genau wie beim
Kaninchen entsteht Nähe aus einem gemeinsamen Ort, nicht aus Zusammenhalt.

*Jagdgebiete: 5–7 pro Welt, oval, 5–10 % der Kartenfläche je Gebiet.* Liegen über Gras, über
Wasser oder über beidem – anders als die übrigen Reviere sind sie an kein Weltobjekt gebunden,
sondern eigens vergebene Zonen (Ellipse aus Zentrum + Radienpaar, `rng.fork('bat-grounds')`). Jede
Fledermaus wechselt einmal pro Nacht unabhängig zu einem neu gewürfelten Gebiet aus diesem festen
Satz – **kein** Mitziehen wie bei der Ente, Überschneidung ist reiner Zufall. „Kann zusammen
jagen, muss aber nicht" heißt: bei 4–10 Tieren auf 5–7 Gebieten ist gelegentliches gemeinsames
Jagen eine Frage der Wahrscheinlichkeit, kein eigener Mechanismus.

*Flug: schnell, zackig, enge Wendekreise.* Innerhalb des Jagdgebiets ist die Bewegung kein Steuern
auf einen Punkt (wie `roamStep`), sondern hochfrequentes Zick-Zack: alle **0.3–0.7 s** ein neuer,
hart gewürfelter Kurs (±1.6 rad), kein sanftes Eindrehen. Das ist eine neue Bewegungsart – der
bestehende Ausweichfächer (`FAN`, ±109°) bildet enge Kreise nicht ab. Der Weg zwischen Schlafplatz
und Jagdgebiet dagegen ist ein **gerader** Zielflug (55–75 u/s), zügiger als das Jagen (45–70 u/s)
und ganz ohne den Zickzack.

> **Der Wendekreis darf nicht nach einer festen Zeitspanne enden.** Erster Anlauf: eine feste,
> zufällig gewürfelte Drehdauer (0.6–1.3 s bei 3.4 rad/s). Das drehte oft länger als nötig – die
> Fledermaus zeigte schon nach einem Bruchteil der Zeit wieder Richtung Gebietsmitte, drehte aber
> unbeirrt weiter und schwenkte erneut hinaus – und manchmal zu kurz. Lag ein Jagdgebiet nah am
> Kartenrand, trieb das Fledermäuse regelmäßig über den Rand hinaus (`tools/simtest.js` schlug mit
> „außerhalb der Karte" fehl, bis zu 146 Verstöße auf einem einzelnen Seed). Seit die Schleife jeden
> Tick prüft, ob der Kurs schon zurück ins Gebiet zeigt, statt eine Dauer abzusitzen, ist das
> behoben – mit einer Umdrehung als Notbremse für den Fall, dass sie nie zurückfindet.
>
> **Und der Reiseflug darf nicht eindrehen.** Der erste Anlauf ließ ihn wie bei den Landtieren mit
> einer begrenzten Drehrate auf das Ziel einschwenken (`walkStep`-Muster). Das ergibt einen Bogen,
> keine Gerade – und ein Bogen kann kurz über ein Ziel nah am Kartenrand hinausschwingen, bevor er
> einschwenkt (ein Schlafplatz nur 25 u von der Kante hat gereicht). Seit der Flug jeden Tick
> direkt auf das Ziel zeigt statt einzudrehen, ist die Strecke eine echte Gerade und bleibt
> zugleich beweisbar auf der Karte: die Karte ist ein Rechteck, und jeder Punkt auf der geraden
> Strecke zwischen zwei Punkten darin liegt selbst darin.

*Jagdgebiete meiden den Wald.* Beim ersten Anlauf lagen die Ovale ganz ohne Bezug zum Terrain auf
der Karte – gemessen landete die Fledermaus dadurch 77 % ihrer Zeit im Wald statt „über Gras,
Wasser oder beidem". Jetzt werden bis zu 16 Mittelpunkte probiert und der genommen, der die größte
Stichprobenquote aus Gras und Wasser hat (derselbe Rückfall wie beim Kaninchenbau: lieber der beste
gefundene Platz als gar keiner). Gemessen bleibt trotzdem ein hoher Waldanteil (**65 %**) – aber
das ist keine Fehlmessung des Jagens, sondern die Konsequenz der Schlafplätze: sie liegen fest im
Wald, und dort verbringt die Fledermaus tagsüber rund 60 % jedes Tages regungslos.

*Größe und Reaktion.* Größenklasse 1. Reaktion: ignoriert alles, wird von allen ignoriert – ersetzt
die vorherige Zeile „weicht allem aus", die eine Interaktion vorausgesetzt hätte, die jetzt
ausdrücklich nicht stattfindet. `agent.flight` ist gesetzt, solange sie in der Luft ist (also fast
immer, solange sie wach ist), und schützt sie so davor, für andere Arten als Störung zu zählen –
wichtig vor allem für den Barsch, dessen Fluchtprüfung keine Größenschwelle kennt und sie sonst
jedes Mal aufschrecken ließe, wenn ein Jagdgebiet über einem See liegt.

*Aktiv nur nachts.* Wachfenster `0.80–0.20`, deckungsgleich mit der reinen Nachtphase (anders als
beim Wildschwein „Nacht **+ Dämmerung**"). Aufgebrochen zum Schlafplatz wird ab `0.15`, kurz vor
dem Ende des Wachfensters. Gemessen: **99.8 % Nachtaktivität** – mit Abstand der höchste Wert des
Katalogs (Wildschwein 56 %), weil ihr Wachfenster den hellen Tag gar nicht berührt.

*Gemessen (Seed 482917, 5 Tage):* 27.9 % Zeit auf Gras, 64.8 % im Wald (siehe oben), 3.1 % am
Wasser, 38.1 % fliegend über Land. Tempo Mittel **19.4 u/s**, in Bewegung **50.7 u/s** – mit
Abstand am schnellsten im Katalog (Kaninchen: 5.0/24.2). Bewegungsunruhe **1.4 rad/s**, ebenfalls
das Maximum (Kaninchen: 1.0). Genutztes Gebiet **380k u²** (Ente: 372k, bisher am meisten).
Abstand zum Artgenossen **54 u** – näher als die lose Rotte (45 u), weiter als die Kaninchenfamilie
(32 u): der gemeinsame Pool erzeugt Nähe, aber keine so enge wie ein echter fester Ort.
Jagdgebietwechsel **0.85 pro Tier und Nacht** über zehn Seeds (Katalog: rund einmal pro Nacht).
Geteilte Schlafplätze kommen vor (69 Fälle über zehn Seeds) – der direkte Beleg, dass der Pool
wirklich geteilt wird und nicht heimlich doch an eine Fledermaus gebunden ist.

> **Die fünf älteren Arten verschieben sich durch die Fledermaus nicht** – nachgerechnet in
> `tools/simtest.js`: `WL.Simulation.run(world, { species: [...ohne 'fledermaus'] })` liefert für
> Ente, Barsch, Reh, Wildschwein und Kaninchen exakt dieselben Werte wie der volle Lauf. Sie ist
> damit die dritte Art, die die anderen nicht bewegt (nach dem Kaninchen) – aus demselben Grund wie
> dort: Größenklasse 1 löst nirgends eine Schwelle aus, und `agent.flight` nimmt sie zusätzlich aus
> jeder Störungsprüfung heraus.

*Das Sprite ist `Fledermaus.png`* (bereits vorhanden, §5).

**Dachs** — **die Familie teilt nur den Schlafplatz, in der Nacht ist jeder für sich.** Auf der
Karte leben **3–6 Dachse**: bis einschließlich **5 sind es eine Familie** an einem gemeinsamen Bau
im Wald, ab **6** zwei Familien an zwei Bauen — derselbe Zuschnitt wie beim Kaninchen (§3), nur mit
anderer Schwelle und nachtaktiv statt tagaktiv. Der Bau selbst liegt **im Wald**, ohne
Tiefenanforderung wie beim Kaninchenbau (der dagegen ausdrücklich *nicht* im Wald liegen darf) —
anders als beim Wildschwein-Schlafplatz zählt hier nicht, wie tief im Wald die Stelle liegt.

*Der Bau liegt zwischen Wasser und Ameisenhügel.* **Höchstens 300 u zum nächsten Gewässer und
höchstens 300 u zum nächsten Ameisenhügel**, dazu mindestens 140 u Abstand zum Wasser. Das ist
keine Biologie, sondern eine Entscheidung über das Bild: eine Nacht ist nur rund 120 s lang, und
solange Trinkstelle und Lieblingsnahrung irgendwo auf der Karte lagen, bestand sie fast
vollständig aus zwei langen Wegen hin und zurück — zum Umherstreifen kam der Dachs nicht mehr.
Gemessen über 10 Seeds liegt der Bau jetzt im Mittel **208 u vom Wasser und 207 u vom nächsten
Hügel** entfernt, kein einziger Bau reißt eine der Grenzen.

> **Der Mindestabstand zum Wasser ist nachgereicht und kein Schmuck.** Ohne ihn landete der Bau
> auf manchen Seeds 30–80 u vom Ufer, das Revier von 500 u lag dann halb am See — und der
> Barschschwarm verließ nachts seine Ruhezone, weil ständig ein Dachs am Ufer stand
> (`tools/simtest.js`, Seed 315927: 89 u statt der erlaubten 80 u vom Ruhepunkt). Mit 140 u
> Mindestabstand ist der Trinkweg immer noch kurz, das Revier liegt aber wieder im Wald.
>
> Gesucht wird der Bauplatz deshalb **vom Ameisenhügel aus**, nicht mehr frei im Waldraster: die
> Bedingung ist so eng, dass ein freier Griff sie fast nie erfüllt. Vier Stufen lockern
> nacheinander (zweiter Bau darf näher rücken → Höchstabstände × 1.6 → Nähebedingung fällt ganz
> weg), damit auf einer ungünstigen Karte nicht die ganze Art ausfällt.

> Ersetzt die frühere Festlegung „Trampelpfade zwischen Bau, Ameisenhügeln und Ressourcennestern,
> immer in derselben Reihenfolge abgelaufen, tagsüber alle im selben Bau". Sie stand hier, bevor
> über das Tier gesprochen wurde.

*Tagsüber im Bau zusammen, nachts jeder für sich.* Die Familie teilt nur den Ort, keinen Verband:
sobald ein Dachs nachts aufbricht, geht er allein los, mit eigenem Timer, ohne auf die anderen zu
warten oder sich ihnen anzuschließen — kein gemeinsames Ziel wie bei der Rotte, keine Kräfte wie
beim Schwarm. Das ist dieselbe Familienform wie beim Kaninchen (ein gemeinsamer Ort, keine
Kopplung zwischen den Tieren), nur nachts statt tags unterwegs, und ohne dessen Heimlauf bei
Gefahr (siehe unten, „lässt sich von niemandem aus der Ruhe bringen").

*Ameisenhügel sind die liebste Nahrung — und ein eigener Ausflug, kein Teil des Reviers.* Jede
Nacht gräbt der Dachs als Erstes **genau einen** Ameisenhügel aus, noch vor dem Trinken. Gewählt
wird unter allen Ameisenhügeln, die die Familie überhaupt erreichen kann — also weiterhin ohne
Reviergrenze, aber **schwach nach Entfernung gewichtet**: der nahe Hügel gewinnt meistens, ein
voller weiter schlägt trotzdem einen leergegrabenen nahen. Gemessen liegt der besuchte Hügel im
Mittel **237 u** vom Bau entfernt, im Ausreißer bis 556 u.

| Nahrung | Vorliebe | Form | Wo | Suchraum |
|---|---|---|---|---|
| Ameisenbrut | 1.00 | Ortsnahrung | offene Flächen, `objects.anthills` | ganze erreichbare Landmasse, 1×/Nacht |
| Nüsse | 0.55 | Ortsnahrung | im Wald, `objects.resources` | Revier um den Bau (~500 u) |
| Pilze | 0.55 | Ortsnahrung | im Wald, `objects.resources` | Revier um den Bau (~500 u) |

> **Der Entfernungsabzug bei den Hügeln ist nachgereicht** (`antDistanceCost`, ein Sechstel des
> Abzugs bei Nüssen und Pilzen, gegen einen breiteren Zufall). Vorher war die Wahl
> entfernungsblind — „muss nicht der nächste sein" war wörtlich gemeint. Bei nur 3–4 Hügeln auf
> 1600 × 1000 u lag der freie Griff aber im Mittel rund 500 u weit weg, und Hin- und Rückweg
> *waren* die Nacht. Der Satz stimmt weiter, er ist nur nicht mehr die Regel.

*Am Hügel läuft er in kleinen Zickzacklinien.* Der Dachs steht dort nicht mehr still, sondern
sucht den Hügel ab: kurze Schenkel quer darüber, bei jeder Kehre ein Stück zur Seite versetzt, und
am Rand angekommen läuft der Versatz wieder zurück. Die Schenkel hängen am **Radius des Hügels**
(13–19 u), nicht an einer festen Länge — sonst liefe er auf einem kleinen Hügel darüber hinaus.
Nuss- und Pilzstellen bleiben davon unberührt: dort wühlt er weiter an einer Stelle.

> **Nach dem Fressen am Ameisenhügel geht es zuerst nach Hause, nicht einfach weiter.** Ein
> eigener, gezielter Heimweg ins Revier (`js/sim/dachs.js`, `beginReturnHome`) trennt den Ausflug
> sichtbar vom übrigen Streifen — sonst hätte ein weit entfernter Ameisenhügel das ganze genutzte
> Gebiet der Nacht mit aufgebläht, statt als einzelne Linie hin und zurück erkennbar zu bleiben.
>
> Bei Nüssen und Pilzen entscheidet weiterhin Vorliebe mal Vorrat, Entfernung zählt kräftig
> dagegen (dasselbe Muster wie beim Wildschwein, §3) — innerhalb des Reviers.
> Die Zahlen sind Startwerte und werden am Bild weiter nachjustiert.
>
> **Das Revier ist auf 500 u gewachsen**, deutlich mehr als der ursprüngliche Anlauf (300 u, davor
> kurzzeitig sogar 140 u): der Dachs soll spürbar weit laufen, nicht in einem Fleck kreisen. Damit
> ein einzelner Streifzug das auch wirklich ausnutzt, sind die Streifschritte selbst länger
> geworden (30–90 u → 60–220 u, siehe `roam.leg` in `js/sim/species.js`) — sonst bräuchte es viele
> kurze Etappen, um am Rand eines so großen Reviers überhaupt anzukommen.

*Jede Nacht fängt anders an — und für jeden Dachs zu einer anderen Zeit.* Womit ein Dachs
aufbricht, wird je Tier und Nacht gleichverteilt gewürfelt: **Trinken, Ameisenhügel oder ein
kurzer Streifzug** (`OPENINGS` in `js/sim/dachs.js`). Dazu steht er nach dem Aufwachen noch
**0–15 s** am Bau herum, bevor er losgeht (`sleep.wakeSpread`). Beides zusammen ist der
Unterschied zwischen einer Familie von Einzelgängern und einem Pulk: das Wachfenster gilt für alle
gleich, und mit einer für alle gleichen Reihenfolge dahinter brachen gemessen **alle Mitglieder
innerhalb von 2–5 Sekunden zum selben Hügel auf**. Jetzt liegen sie in den ersten 40 s der Nacht
im Mittel **100–220 u** auseinander. Der Ameisenhügel bleibt trotzdem Pflicht, er rückt nur nach
hinten.

> Das gilt auch für den **allerersten Augenblick der Aufzeichnung**: die beginnt mitten in der
> Nacht, also mitten im Wachfenster, und lief anfangs am Aufbruch-Würfeln vorbei — beim Start sah
> man deshalb genau das, was die Streuung verhindern soll. Der erste Nachtauftakt wird darum schon
> beim Anlegen des Tieres gezogen, nicht erst beim ersten Aufwachen.

*Trinken 1 bis 3 Mal in der Nacht — gemessen 1.3.* Über den Nachtauftakt hinaus geht der
Ameisenhügel dem Durst **immer** vor, nicht nur wenn er gerade weniger dringend ist. Hier weicht
der Dachs ausdrücklich vom Reh/Wildschwein-Muster ab, bei dem das jeweils überfälligere Bedürfnis
gewinnt („die Wildschwein-Falle", `data/tiere-workflow.md`): `nextDrink` läuft die ganze
Schlafzeit über weiter, das Trinkintervall ist aber viel kürzer als ein Tag — beim Aufwachen ist
der Durst dadurch praktisch **immer** längst überfällig (gemessen: 170–190 Sekunden Rückstand),
während der Ameisenhügel als einmaliges Nachtereignis gerade erst fällig wird. Ein Vergleich der
Überfälligkeit lässt den Durst darum *jede* Nacht gewinnen — in einer ersten Fassung wurde der
Ameisenhügel dadurch höchstens einmal in 5 Tagen besucht, „viel Zeit dort verbringen" war nur
behauptet.

> **Der feste Vorrang hatte umgekehrt fast das Trinken abgeschafft** — gemessen **0.0 bis 0.1
> Trinkgänge je Nacht** statt 1–3. Der Grund ist keine Prioritätsfrage, sondern das Zeitbudget:
> eine Nacht hat nur rund **105 nutzbare Sekunden**, und Hinweg, Graben und Rückweg am
> Ameisenhügel füllten sie fast vollständig. Was danach kam, fiel ersatzlos aus. Drei Änderungen
> zusammen bringen es auf gemessen **1.3 Trinkgänge je Dachs und Nacht**:
>
> * **Der Heimweg vom Hügel führt ans Wasser**, wenn Durst ansteht (`beginReturnHome`) – kein
>   Umweg, das Wasser liegt ohnehin ≤ 300 u vom Bau.
> * **Zu Hause angekommen wird neu entschieden** statt automatisch gestreift, sonst hängt an jedem
>   Ameisenhügel-Ausflug fest eine ganze Streifphase.
> * **Ein letzter Schluck auf dem Heimweg zum Schlafen** (`goHome`) – ohne den bliebe jede vierte
>   Nacht ganz trocken.
>
> Nachgeschärft wurden dafür drei Zahlen: die Grabphase am Ameisenhügel (`antBout` 35–70 s statt
> 40–90 s wie an Nuss- und Pilzstellen – sie bleibt mit Abstand die längste Einzelbeschäftigung
> der Nacht), die Streifphase am Stück (`roam.seconds` 25–60 s statt 45–110 s – eine Phase war
> länger als die ganze Nacht) und das Trinkintervall (2.5–5.5 h statt 3.5–8.5 h). Gestreift wird
> deshalb nicht weniger, nur öfter neu entschieden.

*Der Ablauf einer Nacht ist ein Rhythmus, kein Irrlauf.* Nach dem gewürfelten Auftakt: der eine
Ameisenhügel der Nacht (falls noch nicht erledigt), Trinken, Nuss-/Pilzstellen im Revier und
Streifzüge im Wechsel — bis der nächste Schlaf beginnt. Anders als beim Reh (dessen Zielwahl beim
Äsen fortlaufend neu gewürfelt wird) ist der Wechsel „gezielt hin – lose streifen" hier der
eigentliche Bewegungsrhythmus der Art, nicht nur Beiwerk dazu.

*Gemütlich, bleibt gern stehen — vor allem im Wald.* Tempo ruhig/wandern/fliehen `7 / 22 / 48`,
das **obere** Ende der Stufe „langsam" (§2) — vorher `6 / 16 / 40`, das untere Ende derselben
Stufe. Am Bild wirkte er damit eher schleichend als gemütlich; das Bummelige der Art trägt ohnehin
die Häufigkeit der Pausen, nicht das Tempo. Beim Umherstreifen hält der Dachs häufiger und länger
an als die bisherigen Landtiere, besonders sobald er im Wald ist — ähnlich dem gelegentlichen Halt
der Rotte beim Ziehen (§3, Wildschwein), nur öfter und ohne deren Aufschließen-Zwang, weil er
allein unterwegs ist. An der Nuss- oder Pilzstelle steht er praktisch reglos (kaum merkliches
Kopfwiegen, ruhiger noch als die Streifpause) — eine frühere Fassung ließ ihn dort mit sichtbarem
Tempo umherwackeln, was wie unruhiges Hin-und-her-Trippeln statt wie Graben aussah. Nur am
Ameisenhügel bewegt er sich beim Fressen, und zwar im Zickzack (oben).

*Lässt sich von niemandem aus der Ruhe bringen.* Gemieden wird nur Größenklasse ≥ 5 — im Kernset
also niemand (nur der Bär, Bonus, hat diese Klasse). Alles andere ignoriert der Dachs und bleibt
unbeirrt bei seinem Rhythmus stehen. Ersetzt die frühere Zeile „meidet Gr. ≥ 4, ignoriert Gr. 1".

**Ente** ✔ *(eingebaut, Stand oben in der Tabelle)* — kennt **alle Gewässer der Karte** und
wechselt zwischen ihnen; jedes wird im Lauf der 5 Tage mindestens einmal angeflogen. Der Flug ist
der einzige Moment, in dem sie Land überquert. Gründeln am Ufer, nicht in der Mitte.

*Auf dem Wasser.* Sie zieht hin und her und frisst dabei. Das Umherziehen ist keine Zufallsbewegung,
sondern Nahrungssuche: eine abgegründelte Stelle ist eine Weile leer und wächst langsam nach
(`eatPerSecond 0.22`, `regrowPerSecond 0.012`), also zieht die Ente weiter. Jeder Schwimmabschnitt
bekommt sein eigenes Tempo aus `9–18` — mal schneller, mal langsamer — dazu die driftende
Tagesform (`0.75–1.10`). Sie verlässt ihren Teich nie schwimmend.

*Allein oder zu zweit.* Mit 55 % Wahrscheinlichkeit hat eine Ente einen festen Partner. Die
Bindung ist eine **lose Leine**: in der Nähe des Partners (< 110 u) zieht nur jedes zweite bis
dritte Schwimmziel zu ihm, darüber hinaus jedes. Dadurch schwimmen die beiden erkennbar
zusammen, ohne wie ein Schwarm aneinanderzukleben — gemessen 66 u zum Partner gegen 89 u zum
nächsten anderen Artgenossen auf demselben Teich. Beim Aufbruch bleibt ein Partner fast nie
zurück (97 % statt 85 %); trennt die Gruppe sie doch einmal, finden sie erst wieder zusammen,
wenn beide auf demselben Teich landen. Der Rest der Enten zieht allein.

*Gewässerwechsel: 2–5 Mal pro Tag.* Nicht gezählt, sondern angestoßen. Jede Ente hat einen
Aufbruchstimer (`alle 2–7 Simulationsstunden`, nur tagsüber). Bricht eine auf, entscheiden sich
alle anderen **desselben Gewässers** mit **85 %**, ihr nach 1.5–7 s zum **gleichen** Ziel zu
folgen. Weil das die Timer der ganzen Gruppe zurücksetzt, ergibt sich aus diesen zwei Zahlen die
Rate von gemessen **2.2–3.3 Wechseln pro Ente und Tag** (Mittel 2.7) — mehr Enten auf einem Teich bedeuten
automatisch mehr Aufbrüche.

*Das Ziel* wird gleichverteilt aus allen Gewässern außer dem aktuellen gezogen. Weil die Liste
für alle Enten dieselbe ist, weiß ein Nachfolger immer, wohin — und weil sie alle Gewässer
enthält, ist über 5 Tage jedes einmal an der Reihe (geprüft in `tools/simtest.js`, Spalte
„Gewässer"). Der Preis dafür sind lange Flüge: quer über die Karte sind es bis zu 30 Sekunden,
und die Ente verbringt dadurch rund **11 % ihrer Zeit in der Luft**.

*Der Flug.* Eine flache quadratische Bézierkurve: im Kern gerade, der Kontrollpunkt seitlich um
6–22 % der Strecke versetzt. Beschleunigung beim Auffliegen, Abbremsen beim Landen. Gelandet wird
1–5 Zellen vom Ufer entfernt.

*Nachts.* Tagaktiv, wach von `0.26` bis `0.78` des Tages. Zum Schlafen schwimmt sie ans Ufer
(1–2 Zellen Ufertiefe) und bleibt dort liegen; Paare suchen sich denselben Uferabschnitt. Ein
Aufbruchstimer, der nachts abläuft, wird auf den Morgen verschoben — sonst startet im Morgengrauen
schlagartig die ganze Gruppe.

*Andere Tiere.* **Barsch und Fledermaus werden ausdrücklich ignoriert** — der eine ist unter, die
andere über der Wasserfläche. Sonst gilt: kommt tagsüber ein Tier ans Wasser (< 75 u), schwimmt
die Ente gemächlich weg (`5–8`). Nachts genügt schon die Nähe (< 90 u), dann geht sie schnell
(`30–38`) auf die gegenüberliegende Seite des Gewässers. Beide Radien werden mit der individuellen
Scheu (±20 %) skaliert. *Im Kernset läuft dieser Zweig noch ins Leere, weil es außer Enten nichts
gibt; er ist über einen künstlichen Störer in `tools/simtest.js` geprüft.*

**Barsch** ✔ *(eingebaut, Stand oben in der Tabelle)* — Schwarm mit echter Kohäsion. Verlässt sein
Gewässer unter keinen Umständen – das ist die harte Grenze, die ihn von der Ente trennt.

*Mehrere Seen, nie weniger als drei.* Eine Welt hat **6–12 Barsche**, verteilt auf **2–3 der 4–5
Gewässer**; ein besetzter See hat immer **mindestens 3** Fische. Aus beidem zusammen ergeben sich
Schwärme von 3 bis 6 Tieren – bei sieben Barschen also etwa 4 + 3. Die Seen werden nach Fläche
gewichtet vergeben (ein Schwarm braucht Platz), Tümpel unter 140 Zellen bleiben leer. Dass ein
paar Gewässer gar keine Fische haben, ist gewollt: der Kontrast zur Ente, die jedes anfliegt.
Gemessen über 10 Seeds: durchgehend **2 besetzte Seen**, kleinster Schwarm 3, größter 6.

*Der Schwarm ist die handelnde Einheit.* Ziel, Abschnittstempo und Ruhezone gehören dem Schwarm,
nicht dem einzelnen Fisch. Individuell bleiben Streuung (±12 % Tempo), Tagesform (0.75–1.10) und
– innerhalb eines Tempobands von **0.45 bis 1.35** des Abschnittstempos – das Einzeltempo. Zöge
jeder Fisch sein eigenes *Ziel*, risse der Schwarm nach wenigen Sekunden auseinander; ohne das
Band dagegen überholt kein Fisch je einen anderen, und der Schwarm wird eine starre Formation.
Im Sprint ist das Band eng (`0.85–1.0`): ein aufgeschreckter Schwarm schießt geschlossen weg,
und das Fluchttempo 58 bleibt die Obergrenze, die es laut dieser Tabelle sein soll.

*Die drei Schwarmkräfte* wirken auf jeden Fisch einzeln, innerhalb einer Sichtweite von 70 u:
**zusammenhalten** (zum Schwerpunkt der Nachbarn), **ausrichten** (mittlere Geschwindigkeit der
Nachbarn) und **Abstand halten** (unter 58 u stößt es ab). Wo sich Zusammenhalt und Abstoßung die
Waage halten, ergibt sich der Schwarmabstand: **gemessen 23–26 u zum nächsten Nachbarn**. Der
Wert ist justiert, nicht gewählt – mit den anfänglichen 14 u lagen es 8 u, und bei 26 u
Spritebreite lagen die Fische damit sichtbar übereinander. Dazu kommen das gemeinsame Ziel und
eine sanfte Kraft weg vom Ufer, die den Schwarm ab einer Ufertiefe unter 2 Zellen ins Tiefe
schiebt – ein Barsch am Uferschlick sieht falsch aus, und es hält ihn zugleich aus dem
Gründelbereich der Ente heraus.

*Die Kräfte sind Beschleunigungen, keine Richtungswünsche* – und das ist der Unterschied zwischen
einem Schwarm und einer Formation. Ein Fisch, der auf eine gefilterte Wunschrichtung eindreht,
kann sie nie überschreiten: er kommt am Schwarmmittelpunkt an und bleibt dort. Ein Fisch mit
Trägheit wird hineingezogen, **schießt hindurch** und wird zurückgeholt. Deshalb zieht der
Zusammenhalt entfernungsabhängig wie eine Feder (`cohesion 1.4` 1/s², Schwingungsdauer gut 5 s)
statt normiert, und die Ausrichtung zieht die *Geschwindigkeit* auf die mittlere der Nachbarn zu
(`alignment 0.15` 1/s) und dämpft damit zugleich die Feder.

> Zwei Zahlen machen den Unterschied nachprüfbar. **Polarisation** ist der Betrag der mittleren
> Einheitsgeschwindigkeit im Schwarm (1.0 = alle exakt gleiche Richtung), **Umschichtung** ist der
> Anteil der Fische, die binnen einer Sekunde einen anderen nächsten Nachbarn haben. Mit
> eindrehender Wunschrichtung: 0.97 und 9.6/min – geschlossene Formation. Mit Trägheit:
> **0.92 und 23/min**. Ein klassischer Boids-Schwarm derselben Größe liegt bei 0.92 und 19/min.
> `alignment` ist dabei der empfindlichste Wert des ganzen Tieres: 0.55 ergibt 0.97, 0.15 ergibt
> 0.92, 0.10 ergibt 0.91 bei sichtbar loserem Verband.

*Tagsüber der ganze See.* Alle 8–22 s zieht der Schwarm ein neues Ziel: aus sieben Stichproben
über das gesamte Gewässer gewinnt die Stelle mit dem meisten Vorrat, Entfernung zählt nur schwach
dagegen (Gewicht 0.0012 gegen 0.0022 bei der Ente). Weil gefressene Stellen eine Weile leer sind
(`eatPerSecond 0.10`, `regrowPerSecond 0.020`), kämmt der Schwarm den See systematisch ab, statt
zufällig hin und her zu irren. Abschnittstempo `9–22`, gemessen kommen tagsüber **11.8–13.0 u/s**
heraus. Dass der See wirklich ganz genutzt wird, prüft `tools/simtest.js` als Fläche: das genutzte
Gebiet je Fisch liegt bei **118–160 %** der Seefläche (über 100 %, weil das Messraster über das
Ufer hinausragt).

*Nachts die Ruhezone.* Jeder Schwarm bekommt einmal pro Welt einen festen tiefen Punkt in seinem
See. Wach ist er von `0.24` bis `0.80` des Tages; danach zieht er dorthin und **kreist die Nacht
über langsam** auf einem Ring von 16–34 u um dieses Zentrum, mit `2–5` statt `9–22` – gemessen
**3.3–4.5 u/s gegen 12**. Der Abstand zum Zentrum der Ruhezone fällt dabei von tagsüber 64–110 u
auf nachts **30–43 u**: tags füllt die Spur den ganzen See, nachts ist sie ein dichtes Knäuel in
der Mitte.

> Dieser zweite Aufenthaltsort taucht im Merkmal „feste Orte" **nicht** auf, und das ist richtig
> so: der Tracker verkettet zusammenhängende Aufenthaltsgebiete, und die Ruhezone liegt mitten im
> ohnehin genutzten See. Der Barsch kommt deshalb auf glatt **1.0** feste Orte. Sichtbar ist der
> Unterschied trotzdem – nur eben in der Nachtaktivität (15 % gegen 2 % bei der Ente) und auf der
> Spur, nicht in dieser einen Zahl.

*Sicherheitsabstand.* **Enten werden ausdrücklich ignoriert** – sie sitzen auf der Oberfläche.
Kommt ein anderes Tier näher als **95 u** (mit der individuellen Scheu ±20 % skaliert), sprintet
der Schwarm mit `40–58` für 4–9 s auf die vom Störer abgewandte Seite des Sees. Danach schwimmt er
normal weiter, **merkt sich die Stelle aber 25–50 s als Sperrzone**: Ziele im Umkreis von 110 u
werden in dieser Zeit verworfen, und jeder Fisch bekommt zusätzlich eine eigene Abstoßung von dort
weg. Das ist der Unterschied zwischen „einmal erschrocken" und „hält Abstand". *Im Kernset läuft
auch dieser Zweig noch weitgehend ins Leere – geprüft über den künstlichen Störer in
`tools/simtest.js`, und zwar als Vergleich: derselbe See mit Störer ergibt einen mittleren Abstand
zu dessen Stelle von 175 u gegen 132 u ohne.*

---

## 4. Bonus – und die Nachzügler

**Drei dieser Arten werden die neuen Arten der zweiten Phase** (§2). Vorgeschlagen sind **Igel,
Hecht und Bussard** – je eine Bewegungsdomäne (Land, Wasser, Luft), alle drei auf vorhandener
Mechanik, und drei Schwierigkeitsgrade: der Igel liegt im Vektor dicht am Kaninchen (schwer), der
Hecht teilt den See mit dem Barsch bei umgekehrtem Sozialverhalten (mittel), der Bussard ist
tagaktiv fliegend und damit ein klarer Ausreißer (leicht). Nicht vorgeschlagen sind Otter und
Storch (sie brauchen den Wechsel Land ↔ Wasser – eine Domäne, die es noch nicht gibt) und der Bär
(Größenklasse 5 verschiebt als erstes Tier überhaupt das Wildschwein).

**Alle drei sind eingebaut und justiert** (Blöcke unter der Tabelle) – die einzigen Arten des
Projekts, die es nur in der zweiten Phase gibt. `WL.NEW_SPECIES` ist damit vollständig, und je
Welt werden **zwei von dreien** gezogen: derselbe Seed bekommt immer dasselbe Paar, aber nicht
jeder Seed dasselbe. Wer eine davon messen oder ansehen will, nagelt die Liste fest – `fullWith`
in `tools/simtest.js`, `--neu=<id>` in `tools/preview.js`.

> **Die neue Art erscheint als genau ein Individuum, nicht in der Anzahl aus der Tabelle unten.**
> Ein einzelnes Tier ist ein einzelner Punkt im Merkmalsraum und gehört per Konstruktion in keine
> der gebildeten Gruppen – das ist der didaktische Kern der zweiten Aufgabe. Daraus folgt
> nebenbei, dass „Abstand zum nächsten Artgenossen" für sie undefiniert ist; der Tracker liefert
> dort `null`, und das ist eine Aussage und kein fehlender Wert.

> **Es sind fünf Nachzügler: drei bekannter Arten und zwei neuer** (`WL.LATE_ARRIVALS =
> { known: 3, newcomer: 2 }`). Drei, die sich irgendwo einsortieren lassen, und zwei, die
> nirgendwo hingehören – das ist die zweite Aufgabe. Zusammen mit der Obergrenze von 40 hat eine
> Welt damit in Phase 2 höchstens 45 Tiere.
>
> **Zwei Fremde statt einem, weil ein einzelner Fremder zum „Rest" wird.** Zwei verführen dazu,
> sie *zusammen* in einen Haufen zu legen – und genau daran lässt sich zeigen, dass „passt in
> keine meiner Gruppen" keine Gemeinsamkeit ist. Beide Ziehungen laufen **ohne Zurücklegen**
> (`drawDistinct` in `js/sim/simulation.js`): zweimal dieselbe neue Art wären ein Paar und keine
> zwei Fremden. Aus dreien zwei zu ziehen lässt alle drei Paarungen zu; **Hecht + Igel ist die
> schwerste Welt**, weil sich beide wenig bewegen und die verdeckte Sicht kein Wasser zeigt –
> trennbar bleiben sie über den Tagesrhythmus (der Igel strikt nachts, der Hecht rund um die Uhr).
>
> **Sie kommen als *ein* Cluster an, in einer Farbe, die keine Kachel haben kann**
> (`WL.PALETTE.signals.newcomer`, gesetzt in `js/ui/signals.js`), und das Cluster ist beim
> Umschalten ausgewählt, also auf der Karte hervorgehoben. Unter vierzig bekannten Signalen fände
> man fünf neue sonst nur, indem man die Nummern von hinten durchgeht. Die Farbe fällt über die
> *Helligkeit* auf und nicht über den Farbton: der goldene Winkel verteilt die Töne über den
> ganzen Kreis, ein freier Ton ist gar nicht mehr zu haben – was keine Signalfarbe je sein kann,
> ist etwas anderes als CIE L\* 58 bei voller Sättigung. Zusammengeschoben wird genau einmal je
> Welt; wer sie danach auseinandernimmt, findet sie beim nächsten Umschalten nicht wieder als
> Haufen vor.

> **Die drei bekannten Nachzügler stammen aus den Arten mit `lateArrival` in `js/sim/species.js`:
> Ente, Reh, Kaninchen und Fledermaus.** Vier Arten für drei Plätze, ohne Zurücklegen gezogen –
> es kommen also immer drei *verschiedene*, und sie gehören in drei verschiedene selbst gebildete
> Gruppen. Vier Rehe waren dieselbe Frage, viermal gestellt, und verdoppelten nebenbei den
> Bestand einer einzigen Art.
>
> **Die Bedingung dafür lautet inzwischen anders als beim Reh, und das ist der eigentliche
> Schritt.** Früher: `spawn()` darf für ein einzelnes Tier nichts anlegen, was der ganzen Art
> gehört. Heute: **was der ganzen Art gehört, wird bei den Artgenossen abgeholt statt neu
> angelegt** (`WL.Agents.groupsOf` / `livingOf`). Die Liste der laufenden Tiere steht im
> spawn-Kontext und ist *nur beim Nachzügler* gefüllt – beim Aufbau der Welt sieht eine Art nur
> die früheren Arten, nie sich selbst. Ein Verhaltensmodul braucht deshalb kein Flag und keine
> zweite Einstiegsfunktion: es fragt nach seinesgleichen und findet sie genau dann, wenn es spät
> dran ist.
>
> Was das je Art hieß:
>
> * **Ente** – nichts. Die Liste der Stammgewässer kommt aus der Weltgeometrie und nicht aus dem
>   Zufall, ohne Partner zu bleiben ist der halbe Katalogeintrag. Angepasst werden musste allein
>   ihre *absolute* Aufbruchsuhr (`nextDeparture`): ab 0 gerechnet wäre der erste Aufbruch eines
>   Nachzüglers fünf Tage überfällig, er flöge im ersten Tick nach seiner Ankunft davon. Dafür
>   steht jetzt die Entstehungszeit im spawn-Kontext (`ctx.time`).
> * **Kaninchen** – Beitritt zu einer vorhandenen Familie. Ein eigener Bau wäre ein neuer
>   ortsfester Punkt an Tag 6, also ein Artmerkmal, das die Kaninchen aus der Aufgabe
>   herausnähme; der Renderer zeichnete ihn wirklich (`collectHomes` unterscheidet Baue an der
>   Objektidentität). Der didaktisch stärkste Fall: die Spur strahlt sternförmig von genau dem
>   Punkt weg, von dem auch die anderen ausgehen.
> * **Fledermaus** – sie übernimmt Schlafplätze und Jagdgebiete von den schon lebenden. Neu
>   gesucht ergäben sie einen *zweiten* Satz weltweiter Orte: die Art hätte zwei Landkarten, und
>   der Neue flöge fünf Tage lang nirgendwohin, wo je ein Artgenosse war.
>
> Offen bleiben **Barsch, Wildschwein und Dachs** – machbar nach demselben Muster (Schwarm,
> Rotte, Familie liegen am Agenten), nur noch nicht gebaut. **Der Fuchs bleibt grundsätzlich
> draußen**: sein Revier ist keine Eigenschaft eines Fuchses, sondern eine Aufteilung der Karte
> nach ihrer *Anzahl*. Da gibt es nichts abzuholen – ein hinzukommender Fuchs müsste alle
> vorhandenen Reviere neu schneiden und damit das Verhalten der laufenden Füchse ab Tag 6 ändern,
> aus einem Grund, der mit dem Bruch nichts zu tun hat.

> **Wer eine Nachzügler-Art misst oder ansieht, nagelt die Liste fest – und die gepinnte Art
> gehört ans *Ende*.** `spawnLate` leitet den Zufallsstrom jedes Nachzüglers aus seiner Position
> in dieser Liste ab (`fork('nachzuegler-' + tag)`). Weiter vorne einsortiert ist es dieselbe Art,
> aber ein anderes Individuum – anderer Apfelbaum, anderer Ansitz, andere Streuung. Beim Wechsel
> auf drei-und-zwei war genau das zu sehen: der Igel rutschte von Platz 4 auf Platz 3, und zwei
> von zehn Seeds rissen eine Schwelle, ohne dass an ihm eine Zeile anders gewesen wäre.

### Die Bonusarten

| Art | Anz. | Aktiv | Sozial | Tempo r/w/f | Bewegungsmuster | Revier | Nahrung | Ruht wo | Gr. | Reaktion |
|---|---|---|---|---|---|---|---|---|---|---|
| Bär | 1–2 | Tag + Dämmerung | Einzelgänger | 5 / 18 / 55 | sehr großes Streifgebiet, langsam, kaum Pausen | ~700 u | Äpfel, Nüsse, Pilze | dichter Wald | 5 | vertreibt Kleinere, meidet andere Große |
| **Bussard** | 1–3 (als Nachzügler: 1) | Tag | Einzelgänger | 0 sitzen / 45 kreisen · 55 reisen / 85 abfliegen | weite Kreise über offenen Flächen, mal enger mal weiter, dazwischen Sitzpausen am Waldrand; einmal am Tag enge Kreise über einem Kaninchenbau | kein Revier – die ganze Karte, gemieden wird nur der Wald | **keine** – jagt, tötet aber nicht | fester Horst auf einem hohen Baum im Wald | 2 | für alle unsichtbar, außer im engen Jagdkreis: dort fliehen die Kaninchen |
| Otter | 2–4 | Tag + Dämmerung | Paar / kleine Gruppe | 8 / 30 / 60 | schnell, pendelt zwischen Wasserstellen | ~350 u | Fische | Ufer | 2 | jagt Fische, meidet Gr. ≥ 4 |
| **Hecht** ✔ | 1–3 (als Nachzügler: 1) | **Tag und Nacht** | Einzelgänger | 0 lauern / 12 umziehen / 70 Sprint | liegt reglos im Uferkraut, zieht alle paar Minuten an eine andere Uferstelle, schießt heraus wenn ein Barsch zu nah kommt | ein Gewässer – der größte See mit Barschen | **keine** – jagt, tötet aber nicht | er ruht nicht, das Lauern *ist* seine Ruhe | 2 | jagt Barsch; für alle unsichtbar außer im Sprint |
| **Igel** ✔ | 2–5 (als Nachzügler: 1) | Nacht + Dämmerung | Einzelgänger | 4 / 9 / **–** | jede Nacht derselbe Ablauf: an Ort und Stelle ein wenig fressen, einmal trinken, zu einem anderen von 3–5 dicht beieinanderliegenden Futterplätzen ziehen, dort den Rest der Nacht fressen und einschlafen | kein Gebiet, sondern 3–5 Punkte im Umkreis von 260 u um einen Apfelbaum | Fallobst, Ameisenstraße, Waldboden | wo er zuletzt gefressen hat – am Ameisenhügel geht er zum Waldrand | 1 | ignoriert Kleinere, **rollt sich ein** statt zu fliehen (ab Gr. 3) |
| Storch | 1–3 | Tag | tags allein, nachts zu zweit | 3 / 12 staksen / 55 fliegen | steht sehr lange still an Wasser und Gras, fliegt dann geradlinig | ~600 u | kleine Tiere, Fische | Apfelbaum, zu zweit | 3 | flieht vor Größeren; Fische fliehen vor ihm |

### Bussard ✔ – die erste Nachzügler-Art

**Er ist der Gegenentwurf zur Fledermaus.** Beide fliegen frei über die ganze Karte, beide
haben keinen Bau am Boden, beide fressen nichts – und trotzdem liegen sie im Merkmalsraum weit
auseinander: die Fledermaus fliegt nachts in zackigen Stößen und steht nie still, der Bussard
kreist am hellen Tag in langen Bögen und sitzt dazwischen reglos am Waldrand. Das ist die Antwort
auf die Frage, warum gerade er der leichte Fall ist: **Tageszeit und Flug zusammen hat sonst
niemand.**

*Die ganze Karte, aber nicht der Wald.* Er hat **kein Revier**. Die Kreise wandern über alle
1600 × 1000 u; gesucht wird ein Kreismittelpunkt aber ausdrücklich über **offener Fläche** – Gras
und sichtbarer Boden zählen, Wald und Wasser nicht. Der einzige feste Punkt seines Lebens ist der
Horst.

> **Ein Kreismittelpunkt ohne Terrainbezug landet im Wald** – das ist die Lektion, die die
> Fledermaus schon bezahlt hat: ihre rein geometrisch verteilten Jagdgebiete legten sie zu 77 %
> ihrer Zeit über den Wald, obwohl im Katalog Gras und Wasser standen. Gesucht wird deshalb nach
> demselben Muster wie der Kaninchenbau: mehrere Kandidaten, je ein paar Stichproben im Kreis,
> der beste gewinnt.

*Weite Kreise, mal enger mal weiter.* Ein Suchkreis hat einen Radius von **70–260 u** und wird
**10–26 s** lang geflogen (bei 45 u/s sind das ein bis zwei Umläufe bei engem, ein knapper Bogen
bei weitem Radius); die Drehrichtung wird je Kreis neu gewürfelt. Danach geht es **geradlinig**
150–500 u weiter zum nächsten Mittelpunkt. Auf der Spur ergibt das eine Kette aus Schleifen mit
geraden Verbindungsstücken – ein Bild, das im ganzen Katalog kein zweites Tier erzeugt.

> **Ein Kreis ist eine Drehrate, und Drehraten fallen von der Karte.** Genau daran ist die
> Fledermaus zweimal gescheitert: ein Bogen kann über ein randnahes Ziel hinausschwingen. Für den
> Bussard folgt daraus eine Bedingung an die *Mittelpunkte* – sie halten mindestens einen
> Kreisradius plus etwas Reserve Abstand zum Kartenrand –, während die geraden Flüge dazwischen
> als direkte Kurse gebaut werden und damit beweisbar auf der Karte bleiben.

*Sitzpausen am Waldrand.* Nach **18–40 s** Kreisen setzt er sich an den nächsten **Waldrand**
(Waldtiefe 1–4 Zellen, im Umkreis von 380 u, höchstens 620 u entfernt) und bleibt dort **16–38 s**
reglos sitzen. Das ist die zweite Hälfte seines Erkennungsbildes und im Merkmalsvektor die Zeile,
die ihn von der Fledermaus trennt: **Mittel- gegen Bewegungstempo** geht bei ihm weit auseinander
(18.4 gegen 41.9 u/s), bei der Fledermaus fast gar nicht. Gemessen **16 % der Wachzeit sitzend**
gegen 43 % kreisend – das Kreisen bleibt die Hauptbeschäftigung, so wie es dastehen soll.

> **Diese eine Zahl hat drei Anläufe gebraucht, und keiner davon lag am Gelände.** Der erste Bau
> kam auf 4 % statt der geplanten 18. Nachgemessen scheiterte die Suche nach einem Waldrand in
> **keinem einzigen** von 32 Versuchen – es gab schlicht zu wenige Versuche: hinter der Wartezeit
> („nach 25–60 s Kreisen") stand noch eine Wahrscheinlichkeit („mit 35 %"), und **zwei Wartezeiten
> hintereinander ergeben eine dritte, viel längere**. Bei einem Wachfenster von nur 138 s blieb
> davon weniger als eine Pause pro Tag übrig. Die Wahrscheinlichkeit ist deshalb ersatzlos
> gestrichen: läuft die Wartezeit ab, wird gelandet, und die Streuung liefert die Spanne ohnehin.
> Dazu zwei Kleinigkeiten, die beide aus derselben Messung kamen: ein Fehlversuch verschiebt die
> Pause jetzt nur um 8 s statt um eine volle Wartezeit, und eine Pause, für die der Tag nicht mehr
> reicht, wird **gekürzt statt abgebrochen** – vorher begannen vier von zehn Pausen zwischen 0.68
> und 0.71 und dauerten 2.6 bis 7.8 s statt der zugesagten 12–30.

*Der Horst ist der einzige feste Ort.* Ein **hoher Baum im Wald** (`objects.trees`, mit
Mindest-Waldtiefe), einmal pro Welt gesucht, jede Nacht derselbe. Wach ist er von `0.26` bis
`0.74`, aufgebrochen wird ab `0.72` – der Heimflug gehört in die Abenddämmerung, nicht in die
Nacht (dieselbe Überlegung wie beim Reh).

*Einmal am Tag bei den Kaninchen.* Zu einer je Tag gewürfelten Zeit (Tagesanteil `0.34–0.55`)
fliegt er den **nächstgelegenen Kaninchenbau** geradewegs an und kreist dort **14–26 s** lang eng
(Radius **35–70 u**). Danach fliegt er mit **85** schnell und geradlinig weit weg (mindestens
500 u). Gibt es auf der Karte kein Kaninchen, fällt der Besuch ersatzlos aus – das ist kein
Fehler, sondern der Normalfall in isolierten Testläufen. Gemessen **1.00 Besuche je Tag auf
jedem der zehn Seeds**, und die Kaninchen fliehen deswegen messbar öfter in den Bau (112 gegen 90
Fluchten auf Seed 482917).

> Die Obergrenze `0.55` ist gerechnet und nicht geraten: zwischen dem Ablesen der Uhrzeit und dem
> Ankommen liegen ein angefangener Kreis (bis 26 s) und der Hinflug (bis rund 30 s). Später
> angesetzt fiele der Besuch gelegentlich in den Aufbruch zum Horst (0.72) und damit ganz aus –
> und aus „einmal am Tag" wäre „meistens einmal am Tag" geworden.

> **Er sucht nicht, er weiß es.** Anders als der Fuchs, der über `ctx.nearestPrey` findet, was ihm
> zufällig nahe kommt, kennt der Bussard den Bau als Ort – wie der Dachs seinen Ameisenhügel. Nur
> so ist „einmal pro Tag" eine Zusage und keine Hoffnung: die Dachs-Lektion sagt, dass ein
> diskretes Einmal-Ereignis gegen jede laufende Beschäftigung strukturell verliert, wenn man es
> in einen Vergleich stellt statt es fest einzuplanen.

*Er stört genau eine Art, und das ist strukturell so.* Beim hohen Kreisen, beim Reiseflug und beim
reglosen Sitzen zählt er wie die fliegende Fledermaus **für niemanden als greifbare Störung**
(`agent.flight`). Nur im **engen Jagdkreis** über dem Bau wird er greifbar – und dann fliehen die
Kaninchen von selbst, weil Größenklasse 2 genau ihre Schwelle erreicht. **An `rabbit.js` ist dafür
nichts zu ändern**, so wie am Kaninchen auch für den Fuchs nichts zu ändern war.

> **Dass dabei nur Kaninchen reagieren, folgt aus der Geografie und nicht aus einer Sonderregel.**
> Der Kaninchenbau hält 260 u Abstand zum Wasser, also liegen Ente und Barsch außerhalb der 150 u
> seines Störradius. Reh, Wildschwein, Dachs und Fuchs fliehen erst ab Größenklasse 4 bzw. 5 – ein
> Bussard mit Größenklasse 2 löst bei ihnen nichts aus.

> **Und trotzdem verschiebt er fünf Arten – über eine Kette, und das ist der erste indirekte
> Einfluss des Katalogs.** Erwartet war „genau eine", gemessen sind es auf den meisten Seeds Ente,
> Barsch, Reh, Kaninchen und Fuchs. Der Weg dahin ist nachgewiesen und nicht vermutet: **ohne den
> Fuchs bleibt genau das Kaninchen übrig.** Die Kaninchen sitzen öfter im Bau, dort sind sie für
> den Fuchs unerreichbar (`ctx.nearestPrey` überspringt den Zustand `bau`), seine Nächte laufen
> anders – und was er unterwegs am Ufer aufscheucht, ändert sich mit. Bis hierher hat jede neue
> Art nur die Arten verschoben, die sie selbst berührt; **mit einem Räuber dazwischen reicht eine
> einzige berührte Art, um den halben Katalog zu bewegen.** Beide Zahlen stehen als Prüfung in
> `tools/simtest.js`, die zweite als harte Bedingung: verschiebt er ohne den Fuchs mehr als das
> Kaninchen, greift `agent.flight` nicht mehr.

*Er frisst und trinkt nicht.* Kein `forage`-Block, keine Nahrungskarte, keine Trinkgänge; im
Merkmalsvektor steht **`beutetiere`** wie beim Fuchs – er jagt sichtbar, tötet aber nichts. Das
Trinken ist ausdrücklich abgewählt: es kostete Zeit im ohnehin knappen Tag und brächte ihn
regelmäßig ans Ufer, wo die Barsch-Schwelle wegen des Fuchses schon zweimal nachgegeben hat.

*Das Zeitbudget eines Tages.* Wach ist er rund **138 s**. Der Kaninchenbesuch kostet mit Anflug,
Kreis und Abflug gut **35 s**, also ein Viertel. Gemessen über zehn Seeds: **43 % Kreisen, 29 %
Reiseflug, 16 % Sitzen, 13 % Kaninchenbesuch** – die Zahlen stehen hier, weil sie beim Dachs
gefehlt haben, wo eine lange Pflichthandlung stillschweigend alles danach verschluckt hat.

> Der Reiseflug ist mit 29 % fast doppelt so hoch wie geplant, und das ist keine Panne, sondern
> die Kehrseite von „kein Revier": zwischen zwei Kreisen liegen 150–500 u, und jede Sitzpause
> kostet zusätzlich einen Hin- und einen Rückflug. Wer diesen Anteil senken will, muss die Kreise
> dichter zusammenrücken – und nimmt damit die Ansage „über die ganze Karte" zurück.

*Gemessen* (eine Ansage ohne Messung ist keine): **1.00 Kaninchenbesuche je Tag** auf jedem Seed,
**83 % der Kreiszeit über offener Fläche**, **kein einziger Punkt außerhalb der Karte**, und die
Einflussmessung gegen den auf den Acht-Arten-Stand **gepinnten** Vergleichslauf.

> **Alles davon wird auf Phase 2 gemessen, nicht auf Phase 1.** Der Bussard existiert vor dem
> Bruch nicht (`abwesend`), auf Phase 1 hat er keine einzige Stützstelle. Jede andere Prüfschwelle
> in `tools/simtest.js` misst ausdrücklich Phase 1; für ihn ist genau das die falsche Zeile, und
> ein Lauf darauf ergäbe keinen Fehler, sondern lauter Nullen. Angesehen wird er mit
> `node tools/preview.js . nach.png <seed> --tiere --phase=2 --art=bussard`.

*Der Merkmalsvektor* (die eigentliche Probe – §6, gemessen auf Phase 2 über zehn Seeds):

| Merkmal | Bussard | bisheriges Extrem |
|---|---|---|
| Nachtaktivität | **0 %** | Kaninchen 1 % |
| Zeit über Land (Flug) | **43 %** | Fledermaus 38 % |
| genutztes Gebiet | **~600k u²** | Ente 410k |
| Tempo Mittel / in Bewegung | 18.4 / 41.9 u/s | Fledermaus 19.4 / 50.7 |
| Bewegungsunruhe | 0.40 rad/s | – |
| Zeit auf Gras / im Wald | 30 % / 61 % | – |
| Abstand zum Artgenossen | **`null`** | – |
| feste Orte | 2.5 | – |
| Nahrungsart | `beutetiere` | wie der Fuchs |

> **Er ist an drei Zeilen der neue Ausreißer**, und zwei davon sind als Prüfung festgeschrieben:
> mehr Flugzeit als die Fledermaus und mehr Fläche als die Ente. Fällt eine davon unter den alten
> Bestwert, ist er kein Ausreißer mehr, sondern ein Mitglied einer vorhandenen Gruppe – und die
> zweite Aufgabe hätte ihren Sinn verloren.
>
> **Die 61 % „Zeit im Wald" sind dagegen ein Artefakt und kein Waldtier**, genau wie die 65 % der
> Fledermaus: er schläft die halbe Aufzeichnung lang auf seinem Horst, und der steht nun einmal
> im Wald. Gekreist wird zu 83 % über Gras und offenem Boden. Wer die Zeile als „lebt im Wald"
> liest, liegt bei beiden Flugtieren falsch – im Unterricht ist das ein Fund und kein Fehler.
>
> **Und „Nahrungsart" trennt ihn nicht vom Fuchs** (beide `beutetiere`). Das ist hingenommen: die
> Tageszeit tut es mit 0 % gegen 67 % Nachtaktivität auf den ersten Blick, und ein eigener Wert
> nur für ihn wäre eine Auskunft über die Art, die man am Bildschirm gar nicht ablesen kann.

### Hecht ✔ – die zweite Nachzügler-Art

**Er ist der Gegenentwurf zum Bussard.** Der eine hat die ganze Karte und steht nie still, der
andere einen einzigen See und steht fast immer. Und er ist die erste Art des Katalogs, die
dauerhaft im Wohnzimmer einer anderen sitzt: bis hierher hat jede neue Art die alten *unterwegs*
getroffen – das Reh am Ufer, der Fuchs auf seiner Runde, der Bussard für zwanzig Sekunden über
einem Bau. Der Hecht liegt fünf Tage lang im See des Barsches.

*Ein Gewässer, und zwar eins mit Barschen.* Gewählt wird der **größte besetzte See**; wo keiner
besetzt ist (isolierte Testläufe ohne Barsch), der größte überhaupt. Verlassen wird er nie – das
ist dieselbe harte Grenze wie beim Barsch.

*Er liegt in Ufernähe.* Der Lauerplatz wird bei **Ufertiefe 2–4 Zellen** gezogen, also 10–20 u vom
Ufer. Das ist bewusst genau der Rand des Barschgebiets: der Schwarm wird ab `minDepth 2` vom Ufer
weggeschoben und zieht darüber hinweg. **Die gelegentliche Begegnung entsteht damit aus der
Geografie und nicht aus einer Wahrscheinlichkeit.** Gemessen **99 % der Lauerzeit in Ufernähe**
auf zehn Seeds.

> **Ein Ankunftsradius ist bei einem Ufertier kein Rundungsfehler, sondern eine Ratsche.** Der
> Hecht hält beim Ankommen ein Stück vor seinem Ziel an – und weil er immer aus dem tieferen
> Wasser kommt, immer auf der Seeseite. Solange dieser Halt zum neuen Lauerplatz wurde, wanderte
> er nach jedem Sprint ein Stück weiter hinaus: auf Seed 13579 (32 Sprints) von Ufertiefe 4 auf
> 11 Zellen, und **alle** 19 zu tiefen Lauerplätze kamen vom Rückweg eines Sprints, kein einziger
> von einem Umzug. Ein halbes Rasterfeld, zwanzigmal addiert. Behoben, indem der Anker der
> *gewählte* Platz ist und nicht der erreichte – danach 100 % statt 65 % auf diesem Seed.

*Er steht die meiste Zeit still.* **30–75 s** reglos, dann ein Umzug von **120–300 u** an eine
andere Uferstelle mit `9–15`. Gemessen **73 % lauernd** gegen 25 % umziehend. Bewegt wird sich
beim Lauern gar nicht – er wiegt nur den Kopf, dieselbe Lösung wie beim sitzenden Bussard und
dieselbe Lehre wie beim Dachs: was nach Bewegung aussieht, muss keine sein.

*Der Ausfall.* Kommt ein Barsch näher als **48 u**, schießt er mit `60–78` heraus und **kehrt an
denselben Platz zurück**. Beendet wird der Sprint an der **Leine** (90 u vom Lauerplatz) und nicht
nach einer Zeit: bei 70 u/s trüge eine Höchstdauer von 3 s den Fisch 210 u weit, und aus dem
Lauerjäger, dessen Spur ein Punkt mit ein paar Zacken ist, würde einer, der den halben See
durchquert. Danach **6–14 s Sperre**, sonst löste ein einzelner nachzügelnder Fisch sofort den
nächsten Ausfall aus und aus einem Stoß würde ein Zittern. Gemessen **3.2 Ausfälle je Tag**.
Getötet wird nichts – die Jagd endet damit, dass die Beute weg ist.

*Tag und Nacht wach.* **Die erste Art des Katalogs ohne Tagesrhythmus**: kein Wachfenster, kein
Schlaf, kein Aufbruch zum Schlafplatz. Gemessen **34 % Nachtaktivität** – der Tracker misst sie als
Anteil der zurückgelegten Strecke bei Nacht, und die Nacht ist 40 % des Tages. Je Seed streut das
zwischen 25 und 45 %, weil die Strecke aus nur rund dreißig Ortswechseln in fünf Tagen kommt;
geprüft wird deshalb das Mittel über zehn Seeds.

*Wie der Barsch ihn meidet – und warum das fast nichts kostet.* Der Schwarm legt sein nächstes Ziel
in **neun von zehn** Abschnitten nicht in seinen Umkreis (70 u). Das ist eine **Entscheidung und
keine Reaktion**, und deshalb sieht sie ihn gerade dann, wenn er für jede andere Abfrage unsichtbar
ist. Die zehnte Wahl ist das Loch in der Regel – ohne sie käme der Lauerjäger nie zum Zug.

> **Ihn über die Fluchtabfrage laufen zu lassen wäre fünf Tage Dauerpanik gewesen** – dieselbe
> Falle, die das schlafende Reh am Ufer schon einmal gestellt hat. Er ist deshalb für
> `nearestDisturber` unsichtbar (`agent.flight`), solange er lauert oder umzieht. **Nur der Sprint
> macht ihn greifbar**, und dann löst er die Fluchtlogik des Barsches aus, an der dafür nichts zu
> ändern war – so wie am Kaninchen für Fuchs und Bussard nichts zu ändern war.

> **Eine Abstoßungskraft war eingebaut und ist nach der Messung wieder herausgeflogen.** Der
> naheliegende Griff war, ihn wie die Sperrzone zu behandeln: eine Kraft je Fisch, nur schwächer
> und ohne Panik. Über zehn Seeds gezählt (Ausfälle des Hechts, also die Fälle, in denen ein Barsch
> ihm wirklich zu nahe kam):
>
> | | Sprints | Barsch < 70 u | mittlerer Abstand |
> |---|---|---|---|
> | nur Zielwahl | **159** | **5.0 %** | **147 u** |
> | gar keine Meidung | 172 | 5.5 % | 146 u |
> | Zielwahl + Abstoßung | 194 | 8.7 % | 140 u |
>
> Die Kraft treibt sie also **zusammen**, und der Grund steht beim Barsch selbst: er fährt mit
> Trägheit. Eine Kraft ergibt dort keine Wand, sondern ein *Überschießen* – genau das
> Überschießen, das den Schwarm wogen lässt. Ein weggedrückter Fisch wird von der Kohäsion
> zurückgeholt, schießt durch den Schwarm hindurch und kommt auf der anderen Seite näher heraus
> als er vorher war. **Was einer Art ihren Charakter gibt, kann bei der nächsten das Werkzeug
> unbrauchbar machen.**

> **Und der größte Teil des Abstands ist ohnehin strukturell.** Der Hecht liegt bei Ufertiefe 2–4,
> und dort hält `shoreAccel` den Schwarm ohnehin heraus. Was die Regel dazutut, sind 8 % weniger
> Ausfälle – der Rest, den die Geografie übriggelassen hat. Das ist dasselbe Prinzip wie „Wald wird
> abzüglich eines Uferstreifens gestempelt" im Weltgenerator, nur diesmal als Befund und nicht als
> Entwurf.

*Er frisst und trinkt nicht.* Kein `forage`-Block, keine Karte; im Merkmalsvektor steht
**`beutetiere`** wie bei Fuchs und Bussard. **Damit trägt diesen Wert jetzt die dritte Art**, und
er trennt endgültig nichts mehr – die drei liegen dafür in Domäne, Tempo und Tageszeit so weit
auseinander, dass es nicht nötig ist.

*Was er den anderen antut: genau eine Art.* Gemessen **4 Abweichungen, alle beim Barsch, keine
einzige außerhalb** – auf den Acht-Arten-Stand festgenagelt. Eine Kette wie beim Bussard kann es
nicht geben: der Barsch berührt niemanden, er wird nur berührt. Die Ente bekam dafür `hecht` in
ihre Ignorierliste, mit derselben Begründung, die dort schon für den Barsch steht – ohne sie säße
ein Störer fünf Tage lang in ihrem Gründelbereich.

*Der Merkmalsvektor* (§6, gemessen auf Phase 2 über zehn Seeds):

| Merkmal | Hecht | bisheriges Extrem |
|---|---|---|
| Nachtaktivität | 34 % | – (der einzige ohne Rhythmus) |
| Zeit am Wasser | 100 % | wie der Barsch |
| genutztes Gebiet | **68k u²** | Barsch 77k, Kaninchen 47k |
| Tempo Mittel / in Bewegung | weit auseinander | wie beim Bussard |
| Abstand zum Artgenossen | **`null`** | wie der Bussard |
| feste Orte | mehrere Uferstellen | – |
| Nahrungsart | `beutetiere` | wie Fuchs und Bussard |

> Er ist **nicht** der kleinste Punkt im Merkmalsraum – das Kaninchen nutzt 47k u². Sein Ausreißer
> ist die Kombination: ein Tier, das zu 100 % im Wasser lebt, weniger Fläche nutzt als der Barsch
> und dabei keinen Tagesrhythmus hat, gibt es sonst nicht. Im Unterricht ist er deshalb der
> mittelschwere Fall, so wie in §4 angekündigt: er sieht dem Barsch ähnlich, bis man auf die
> Uhrzeit und auf die Bewegung sieht.

### Igel ✔ – die dritte Nachzügler-Art

**Er ist der schwere Fall, und zwar mit Absicht** (§4 oben): klein, nachtaktiv, ortstreu, winziges
Gebiet – im Merkmalsraum liegt er dicht am Kaninchen (56k gegen 47k u²). Wer die beiden trennen
will, muss auf die Uhrzeit sehen (1 % gegen 75 % Nachtaktivität), auf die Nahrung und auf die Form
der Spur. Bussard und Hecht springen ins Auge; dieser hier nicht.

*Die Nacht ist ein Drehbuch, kein Abwägen.* Bei Reh, Wildschwein und Dachs entsteht die Nacht aus
einem Vergleich von Bedürfnissen („wer ist überfälliger"). Genau das kann **„jede Nacht ist
ähnlich" nicht einhalten**, weil ein Vergleich in jeder Nacht anders ausgeht. Der Igel hat deshalb
keinen Durstzähler, sondern einen festen Ablauf:

```
aufwachen  er liegt an dem Platz, an dem die letzte Nacht endete
Auftakt    dort 12-26 s ein paar Bissen, mit winzigen Schritten dazwischen
Trinken    einmal zum nächsten Gewässer, 4-8 s, dann wieder weg
Umzug      zielstrebig zu einem *anderen* seiner Plätze
Nacht      dort den ganzen Rest der Nacht fressen
Schlafen   und dort auch einschlafen
```

Das ist dieselbe Konstruktion, mit der beim Bussard „einmal am Tag bei den Kaninchen" eine Zusage
wurde: ein diskretes Einmal-Ereignis verliert gegen jede laufende Beschäftigung, wenn man es in
einen Vergleich stellt statt es fest einzuplanen. Gemessen **1.0–1.4 Trinkgänge je Nacht** auf
allen zehn Seeds (die 1.2 kommen daher, dass die Aufzeichnung mitten in der ersten Nacht beginnt).

*Sein Revier sind Punkte, kein Gebiet.* Was er besitzt, ist eine Liste von **3–5 Futterplätzen**
um einen Apfelbaum herum (mindestens einer ist also immer ein Apfelbaum), dazu ein Ameisenhügel
wenn einer daliegt und Waldrandstellen zum Auffüllen. Er wählt nie einen Ort, der nicht darin
steht – „er geht keine weiten Strecken" ist damit **strukturell erfüllt** und nicht über einen
Radius erzwungen.

> **Die Obergrenze gilt paarweise, nicht nur zum Ankerbaum – das ist der Unterschied zwischen
> „eng beieinander" und „irgendwo im Umkreis".** Zwei Plätze auf gegenüberliegenden Seiten des
> Ankerkreises sind zwei Radien auseinander; auf Seed 315927 lagen so 506 u zwischen zweien, und
> der Igel verbrachte mehr Zeit mit Laufen als mit Fressen. Paarweise gemessen liegen alle Plätze
> in einem Kreis vom *Durchmesser* 260 u.
>
> **Die Lockerungsstufen der Platzsuche zu deckeln war der naheliegende zweite Griff und war
> falsch.** Sie weiten den Umkreis für ungünstige Karten auf bis zu 520 u; auf 1.5 gedeckelt fand
> die Suche auf Seed 315927 gar keinen Platz mehr (kein Igel in dieser Welt) und traf auf 13579
> einen *schlechteren* Ankerbaum mit weiterem Wasser – dort kippte der Laufanteil erst recht
> (19 % fressen gegen 32 % gehen, vorher 31 gegen 18). **Eine engere Suche findet nicht dasselbe
> Ergebnis in kleiner, sondern ein anderes.** Der weite Fall bleibt deshalb stehen und wird
> gemessen (31 % gehend auf 315927, Obergrenze 35 %; im Mittel 30 % fressend gegen 19 % gehend).

*Der Schlafplatz ist der Futterplatz.* Er hat keinen Bau und sucht abends nichts – wo er zuletzt
gefressen hat, schläft er. Die einzige Ausnahme: am Ameisenhügel, also auf offener Fläche, zieht
er noch zum nächsten Waldrand. Dadurch beginnt die nächste Nacht von selbst dort, wo es auch etwas
zu fressen gibt.

*Er flieht nicht, er rollt sich ein* (Zustand `einrollen`, §2). Die **20 u Fluchttempo der
Bonustabelle sind gestrichen**, und das ist die Aussage dieser Art: sie hat kein Fluchttempo. Wo
jedes andere Tier des Katalogs schneller wird, wird der Igel langsamer. Ausgelöst ab Größenklasse
3 (Reh, Wildschwein), gemessen **0–12 Mal in fünf Nächten**.

*Was er den anderen antut – und was die Messung dabei gelehrt hat.* Erwartet war **gar nichts**:
Größenklasse 1 löst bei keiner Landart eine Fluchtschwelle aus, und Futter nimmt er niemandem weg
(§1, drei eigene Nahrungsarten). Gemessen sind es vier Arten. Drei Läufe zeigen den Weg:

| Lauf | Abweichungen |
|---|---|
| ohne Ente und Barsch | **keine** |
| ohne den Fuchs | **keine** |
| vollständig | Ente, Barsch, Kaninchen, Fuchs |

Er berührt also **keine einzige Art direkt** – alles läuft über den Fuchs. Der wiederum reagiert
nicht auf ihn (Größenklasse 1), sondern *stolpert über ihn*: `ctx.nearestDisturber` liefert je
Anfrage nur das **nächste** Tier, gleich welcher Größe, und ein Igel im Weg beantwortet die Anfrage
mit „keine Bedrohung", obwohl einen Schritt weiter ein Wildschwein steht. Das steht seit dem Dachs
in `data/tiere-workflow.md`; **hier ist es zum ersten Mal der einzige Kanal einer ganzen Art.**

> **Beim Bussard lief die Kette über die Beute des Fuchses hinein, hier stolpert sie über einen
> Unbeteiligten.** Die Bussard-Regel („wer eine Einflussmessung schreibt, misst zweimal – einmal
> mit und einmal ohne den Räuber dazwischen") hat damit zum ersten Mal ein Ergebnis geliefert, das
> man ohne sie falsch gelesen hätte: 25 Abweichungen sahen nach einer sehr wirksamen Art aus, und
> es ist eine, die niemanden anfasst.

*Der Merkmalsvektor* (§6, gemessen auf Phase 2 über zehn Seeds):

| Merkmal | Igel | bisheriges Extrem |
|---|---|---|
| Nachtaktivität | 75 % | Wildschwein 55 %, Dachs/Fuchs 67 % |
| genutztes Gebiet | **56k u²** | Kaninchen 47k, Hecht 68k |
| Tempo Mittel / in Bewegung | 2.0–2.8 / 5.4–7.0 u/s | **das langsamste Tier des Katalogs** |
| Zeit fressend / gehend | 26–33 % / 14–23 % | – |
| Abstand zum Artgenossen | `null` | wie Bussard und Hecht |
| feste Orte | **1** (siehe unten) | – |
| Nahrungsart | `fallobst` | eigener Wert, trennt ihn von allen |

> **„Feste Orte" meldet 1, obwohl er 3–5 hat – und das ist kein Fehler, sondern ein Befund.**
> Der Tracker verkettet besuchte Rasterzellen zu Aufenthaltsbereichen und wirft dabei Zellen
> heraus, die nur *durchquert* werden (`PLACE_MIN_DWELL`). Bei einem so langsamen Tier, das fünf
> Nächte lang dieselbe kurze Strecke geht, ist der Weg selbst Aufenthalt: jede Weg-Zelle liegt über
> der Schwelle, und die Flecken verschmelzen zu einem. Nachgerechnet ist es wirklich das und nicht
> zu geringer Abstand – hebt man die Schwelle von 0.4 % auf 1.5 % an, meldet derselbe Lauf 2–4
> Orte. **An der Schwelle wurde nichts gedreht**, sie gilt für alle acht Kernarten und deren Werte
> in §6 sind daran justiert. Für den Unterricht ist das dieselbe Sorte Fund wie die 61 % „Zeit im
> Wald" beim Bussard: die Zeile misst etwas anderes, als ihr Name verspricht.

---

## 5. Sprites

Die PNGs liegen im Wurzelverzeichnis. Zuordnung: `Reh` `Wildschwein` `Fuchs` `Kaninchen`
`Fledermaus` `Dachs` `Ente` `Barsch` – alle vorhanden. Bonus: `Bär` `Busard` (Schreibweise der
Datei!) `Otter` `Hecht` `Igel` `Storch`.

`Hase.png` ist übrig – im Katalog steht nur das Kaninchen. Entweder später als eigene Art
(schnell, Einzelgänger, offenes Feld, kein Bau – das wäre ein schöner Kontrast zum Kaninchen)
oder ungenutzt.

`Bär.png` hat einen Umlaut im Dateinamen; das kann beim Laden über `file://` zicken. Fällt erst
in der Bonusphase an, wird dann geprüft.

Später sollen die Tiere neutral dargestellt werden (die Schüler sollen nicht nach Vorwissen
gruppieren). Der Renderer wird deshalb von Anfang an so gebaut, dass die Darstellung
umschaltbar ist: **Sprite ↔ neutrale Form**. Das ist ein Schalter, kein Umbau.

---

## 6. Der Merkmalsvektor (was die Schüler später messen)

Aus dem Katalog abgeleitet, das ist der Grund für die meisten Spalten oben. Wird ab dem ersten
Tier mitgeschrieben (`js/sim/tracker.js`), damit früh sichtbar ist, ob sich die Arten überhaupt
trennen lassen.

1. Anteil der Aktivität bei Nacht
2. Anteil der Zeit auf Gras / im Wald / am oder im Wasser
3. mittleres Tempo und Bewegungsunruhe
4. Größe des genutzten Gebiets
5. typischer Abstand zum nächsten Artgenossen
6. Nahrungsart
7. Anzahl regelmäßig besuchter fester Orte

Gemessen wird ausschließlich auf der fertigen Aufzeichnung (`js/sim/tracker.js`) — also genau
das, was ein Beobachter am Bildschirm hätte ablesen können, nicht der Blick in die inneren
Variablen der Tiere. Anzeige über Taste `D`, Rohwerte über `node tools/simtest.js`.

**Jede Art hat ab jetzt zwei Messwertsätze**, einen je Phase. Die Tabelle unten ist die von
**Phase 1** (Tag 1–5, Startbestand) – das sind die justierten Werte, gegen die `tools/simtest.js`
prüft, und der Vergleichsmaßstab für jede neue Art. Der *Unterschied* zu Phase 2 ist die
interessanteste Tabelle des Projekts.

> **Bussard, Hecht und Igel stehen in dieser Tabelle nicht, und das ist kein Versehen**: sie
> existieren in Phase 1 nicht. Ihre Werte stehen bei ihnen in §4, gemessen auf Phase 2 – die
> einzigen Stellen des Projekts, an denen das so ist. Wer ihn mit den acht Arten hier vergleicht, vergleicht zwei
> verschiedene Fünf-Tage-Abschnitte derselben Welt; für die Ausreißer-Frage („mehr Flugzeit als
> die Fledermaus, mehr Fläche als die Ente") ist das genau genug, für alles Feinere nicht.

> Erster Messpunkt dafür, noch ohne neue Art: allein die vier nachrückenden **Rehe** verschieben
> auf Seed 482917 den Abstand zum Artgenossen bei der Ente von 183 auf 147 u, beim Kaninchen von
> 25 auf 19 u und beim Fuchs von 807 auf 794 u – und bei den Rehen selbst von 566 auf 234 u.
> Tiere einer *bekannten* Art genügen also schon, um das Bild der anderen zu verändern.

**Messpunkte (Seed 482917, Phase 1 = Tag 1–5), neu gemessen nach der Obergrenze von 40 Tieren:**

| Merkmal | Ente | Barsch | Reh | Wildschwein | Kaninchen | Fledermaus | Dachs | Fuchs |
|---|---|---|---|---|---|---|---|---|
| Nachtaktivität | 17 % | 26 % | 9 % | 51 % | 1 % | **100 %** | 83 % | 65 % |
| Zeit auf Gras | 7 % | 0 % | **66 %** | 36 % | 26 % | 28 % | 25 % | 42 % |
| Zeit im Wald | 2 % | 0 % | 33 % | 46 % | **0 %** | 65 % | **69 %** | 52 % |
| Zeit am Wasser | 91 % | **100 %** | **0 %** | **0 %** | **0 %** | 3 % | **0 %** | **0 %** |
| Zeit auf Boden | 0 % | 0 % | 1 % | 18 % | **74 %** | 4 % | 6 % | 6 % |
| Zeit über Land (Flug) | 13 % | 0 % | 0 % | 0 % | 0 % | **38 %** | 0 % | 0 % |
| Tempo Mittel / in Bewegung | 11.5 / 15.4 u/s | 15.3 / **15.3** u/s | 6.6 / 13.3 u/s | 4.2 / 10.1 u/s | 4.5 / 27.1 u/s | **19.0 / 49.7** u/s | 5.5 / 16.0 u/s | 20.0 / 36.9 u/s |
| Bewegungsunruhe | 0.57 rad/s | 0.60 rad/s | 0.84 rad/s | 0.44 rad/s | 1.18 rad/s | **1.39 rad/s** | 0.39 rad/s | **0.32 rad/s** |
| genutztes Gebiet | ~382k u² | ~53k u² | ~244k u² | ~114k u² | **~46k u²** | ~363k u² | ~177k u² | ~382k u² |
| Abstand zum nächsten Artgenossen | ~153 u | **~24 u** | ~336 u | ~35 u | ~23 u | ~107 u | ~76 u | **~789 u** |
| feste Orte | 4–5 (Gewässer der Karte) | **1** (sein See) | 4–5 (keine festen) | 2–3 | **1** (sein Bau) | 4 (aus dem Pool) | **1** (sein Bau + gelegentlich ein Ameisenhügel) | 2 (sein Bau) |
| Nahrungsart | Wasserpflanzen | Kleintiere | Gras | Nüsse | keine | **keine** | Ameisenbrut | **Beutetiere** |

Fett steht, was die Arten trennt. Das ist der Vergleichsmaßstab für das nächste Tier:
unterscheidet es sich hier nicht, ist entweder ein Parameter zu zahm oder es fehlt ein Merkmal.

> **Was die Obergrenze an dieser Tabelle geändert hat, und warum es mehr ist, als man erwartet.**
> Weniger Tiere heißt weniger Konkurrenz um dieselbe Nahrung und andere Verteilung auf die Seen und
> Waldstücke – so weit ist es erwartbar (Barsch: statt 12 Fischen in 2 Schwärmen jetzt 9, und einer
> davon liegt in einem Fuchsrevier; Nachtaktivität 18 → 26 %). Darüber hinaus verschiebt sich aber
> *jede* Zeile ein wenig, auch bei Arten, die kein Tier verloren haben. Der Grund ist eine
> Kopplung, die beim Bauen niemand beabsichtigt hat: das leichte Schlingern der Laufrichtung
> rechnet in allen Verhaltensmodulen als `Math.sin(ctx.time * k + agent.index)`, und `agent.index`
> ist die *fortlaufende Nummer über alle Arten*. Ändert sich die Anzahl einer Art, verschieben sich
> die Nummern aller späteren – und damit die Phase ihres Schlingerns. Gemessen: eine geänderte
> Barschzahl allein ändert die Bahn jedes Rehs, Wildschweins, Dachses und Fuchses (nur die
> Fledermaus bleibt gleich).
>
> Das ist kein Fehler mit falschem Ergebnis, aber ein unschöner Kanal: er macht jede Art empfindlich
> gegen die Anzahl jeder anderen. Wer ihn schließen will, zieht die Phase beim Anlegen einmal aus dem
> Zufallsstrom des Tieres selbst (`agentRng`) und legt sie in den Agenten – dann hängt sie an nichts
> mehr außer am Tier. Das verschiebt alle Messwerte ein letztes Mal und ist deshalb eine eigene
> Aufgabe, keine Nebenbei-Änderung.

> **Der Fuchs war an drei Zeilen das Extrem des Katalogs – seit dem kleineren Revier sind es
> noch zwei.** Abstand zum Artgenossen **789 u** (bisher am meisten: Reh mit 336) und
> Bewegungsunruhe **0.32 rad/s** (bisher am ruhigsten: Dachs mit 0.39). Beim **genutzten
> Gebiet** hat ihn die Ente eingeholt: seit der Obergrenze liegen beide bei 382k u² und die Zeile
> trennt die zwei gar nicht mehr; vorher lag der Fuchs mit 509k weit vorn. Ein
> Tier, das jede Nacht die Grenze eines Reviers abläuft, legt viel Strecke in langen Geraden
> zurück – und begegnet dabei keinem Artgenossen, weil die Reviere sich per Konstruktion kaum
> überlappen; wie viel Fläche dabei zusammenkommt, hängt aber direkt an der Reviergröße.
>
> **Beide verbliebenen Extreme sind schmaler geworden, und das ist die eigentliche Nebenwirkung
> der Änderung.** Die Unruhe ist von 0.25 auf 0.32 rad/s gestiegen – wer eine kürzere, damit
> stärker gekrümmte Kontur mit mehr Tempo abläuft, dreht öfter –, und zum Dachs (0.36) sind es
> nur noch vier Hundertstel. Die Zeile trennt die beiden also kaum noch. Sie ist als
> Trennmerkmal für Fuchs/Dachs nicht mehr zu gebrauchen; es bleiben Tempo und Nahrungsart.
>
> **Damit kippt „Abstand zum Artgenossen" von einem Sozial- zu einem Reviermerkmal.** Beim
> Barsch (24 u) misst es Zusammenhalt, beim Reh (304 u) das Fehlen jeder Bindung – beim Fuchs
> misst es, wie groß sein Revier ist. Drei verschiedene Bedeutungen für dieselbe Zahl; im
> Merkmalsraum sind sie nicht zu unterscheiden. Dass der Wert bei 20 % *kleineren* Revieren
> von 786 auf 821 u gestiegen ist, gehört dazu: die Blasen sind kleiner, die Kartenzellen aber
> dieselben, also liegen die Mittelpunkte gleich weit und die Ränder weiter auseinander.
>
> **„Feste Orte" trennt Fuchs und Dachs dagegen wieder nicht** (2.0 gegen 1.3), obwohl das eine
> Tier sein Revier umrundet und das andere darin streift. Dieselbe Falle wie bei Ente/Reh
> und Dachs/Kaninchen – die Zeile zählt, *ob* ein Tier einen Anker hat, nicht wie weit es davon
> wegkommt. Getrennt werden die beiden vom genutzten Gebiet (386k gegen 165k), vom Tempo
> (17.8 gegen 5.3 u/s) und von der Nahrungsart.

> **Der Dachs hat Ente, Barsch, Reh und Kaninchen verschoben – das Wildschwein seit der
> Ameisenbrut nicht mehr.** Drei Gründe wirken zusammen: er ist das zweite nachtaktive Landtier,
> das selbst trinken geht (wie das Wildschwein); er teilt sich seine Nusskarte mit dem Reh (§1);
> und mit dem auf 500 u vergrößerten Revier kommt er dem Kaninchenbau nahe genug, um dessen
> Fluchtregel auszulösen (Größenklasse 2 ≥ Kaninchens Schwelle 2) – Kaninchen-Gras/-Boden
> verschieben sich dadurch spürbar. Die Ameisen waren der vierte Grund und der einzige, der
> *gezielt* abgestellt wurde: seit der Bau am Hügel steht, gräbt die Familie denselben Hügel jede
> Nacht leer, deshalb hat der Dachs jetzt einen eigenen Vorrat (§1, Ameisenbrut) und das
> Wildschwein steht nachgerechnet wieder exakt auf seinen alten Werten – ebenso Barsch, Reh und
> Fledermaus. Übrig bleiben Ente und Kaninchen: seit der Dachs regelmäßig trinkt (unten), steht er
> nachts wieder öfter am Ufer und läuft öfter am Kaninchenbau vorbei. Gezählt über alle sieben
> Arten sind aus 33 verschobenen Merkmalen 15 geworden. Dazu kommt ein weiterer,
> subtilerer Effekt, der beim Kaninchen und der Fledermaus *untereinander* nicht auffiel, weil beide
> von jeder Störungsprüfung ausgenommen sind: `nearestDisturber` (`js/sim/simulation.js`) liefert je
> Tier nur den *nächsten* Kandidaten, nicht den nächsten *relevanten*. Steht zufällig ein zu kleines
> Tier näher als ein wirklich großes, wird das kleine als harmlos verworfen und die eigentliche
> Bedrohung bleibt für diesen einen Moment unentdeckt – mit sieben statt sechs Arten auf der Karte
> kommt das häufiger vor, und ein einziger so verpasster oder neu ausgelöster Fluchtmoment genügt,
> damit sich der weitere Tagesverlauf eines Tieres vollständig anders entwickelt. Nachgerechnet in
> `tools/simtest.js`: die Kaninchen- und Fledermaus-Vergleiche laufen deshalb ausdrücklich auf dem
> Sechs-Arten-Stand von vor dem Dachs, nicht auf „alle außer einer" – dort bleibt ihr gegenseitiger
> Einfluss weiterhin exakt null, nur der Dachs bewegt jetzt auch sie.

> **Der Dachs ist das Waldtier des Katalogs geworden.** Mit dem Bau zwischen Wasser und
> Ameisenhügel verbringt er **73 % seiner Zeit im Wald** – mehr als jede andere Art, auch mehr als
> die Fledermaus (65 %), die über dem Wald jagt. Sein Grasanteil ist im Gegenzug von 41 % auf 22 %
> gefallen: die langen Querungen über offenes Land zu einem beliebigen Ameisenhügel sind weg.
>
> **Nachtaktivität 86 %, nicht mehr 98 %** – und das ist kein Rückschritt, sondern der
> Trinkzweig auf dem Heimweg: der Dachs geht jetzt am Ende der Nacht noch einmal ans Wasser und
> legt sich entsprechend später hin. Er bleibt nach der Fledermaus (100 %) das zweitnächtlichste
> Tier des Katalogs, weit vor dem Wildschwein (56 %).
>
> **Am ruhigsten ist er weiterhin, aber nur noch knapp.** Die Bewegungsunruhe ist von 0.20 auf
> 0.36 rad/s gestiegen und liegt damit fast gleichauf mit dem Barsch (0.42). Zwei Gründe, beide
> gewollt: das Zickzack am Ameisenhügel ist lauter Richtungswechsel, wo vorher ein reglos
> stehendes Tier war, und die kürzeren Wege bedeuten mehr Ziele je Nacht statt weniger langer
> Geraden. Als *trennendes* Merkmal taugt die Unruhe für ihn damit nicht mehr – „Zeit im Wald"
> und „Nachtaktivität" tun es dafür umso deutlicher.
>
> **„Feste Orte" trennt Dachs und Kaninchen kaum, und das ist dieselbe Falle wie bei Ente und
> Reh.** 1.2 gegen 1.0 – obwohl das Kaninchen sein Leben im Umkreis von 130 u um den Bau verbringt
> und der Dachs jede Nacht ein 500-u-Revier durchstreift, dazu regelmäßig eine Strecke zu
> einem Ameisenhügel. Der leichte Überschuss über 1 ist genau dieser Ameisenhügel: besucht
> derselbe Dachs mehrere verschiedene, zählt der Tracker sie als weitere, seltener benutzte feste
> Orte. Das genutzte Gebiet trennt die beiden trotzdem klar (49k gegen 165k u²), ebenso „Zeit im
> Wald" (0 % gegen 73 %) – „feste Orte" zählt eben nur, *ob* ein Tier einen festen Anker hat, nicht
> wie weit es von dort wegkommt.

> **Das Kaninchen hat als erste Art gar nichts verschoben.** Ente, Barsch, Reh und Wildschwein
> haben exakt dieselben Zahlen wie ohne es – `tools/simtest.js` rechnet das seit dem Einbau in
> jedem Lauf nach und vergleicht neun Merkmale je Art auf Gleichheit. Zwei Gründe: Größenklasse 1
> löst bei keiner anderen Art eine Reaktion aus, und der Bau hält 260 u Abstand zum Wasser, sodass
> selbst der weiteste Hopser außerhalb des Fluchtradius der Ente bleibt (90 u nachts). Das ist die
> Gegenprobe zum Wildschwein, das alle drei Vorgänger spürbar bewegt hat – *ob* eine neue Art die
> alten verschiebt, ist eine Entscheidung beim Entwurf und kein Schicksal.
>
> **Neu im Vektor sind zwei Zeilen, die es vorher nicht gebraucht hat.** „Nahrungsart" stand zwar
> immer in §6, war aber bei vier Arten mit Futter eine Selbstverständlichkeit; mit `keine` wird sie
> zum ersten Mal zu einem Merkmal, das trennt. Und das Paar aus Mittel- und Bewegungstempo, bisher
> die Lesehilfe zum Barsch, ist beim Kaninchen mit 5.0 gegen 24.2 u/s das deutlichste Merkmal
> überhaupt.

> **Die Fledermaus hat die Zahlen der fünf älteren Arten ebenfalls nicht verschoben** – aus
> denselben zwei Gründen wie das Kaninchen: Größenklasse 1 löst nirgends eine Schwelle aus, und
> `agent.flight` nimmt sie zusätzlich aus jeder Störungsprüfung heraus, solange sie in der Luft ist
> (also fast immer). Dafür ist sie diejenige Art, die das Kaninchen als schnellstes und unruhigstes
> Tier ablöst: 19.4/50.7 u/s gegen 5.0/24.2, und 1.39 rad/s Bewegungsunruhe gegen 1.01. Am Vektor
> zeigt sich das vor allem an drei Zeilen: **Nachtaktivität** 100 % (kein anderes Tier kommt über
> 56 %, weil ihr Wachfenster den hellen Tag gar nicht berührt), **Zeit über Land** 38 % (nur die
> Ente fliegt überhaupt, mit 12 %) und dem Tempo. „Zeit im Wald" mit 65 % sieht auf den ersten Blick
> nach einem Waldtier aus, ist aber ein Artefakt der Schlafplätze, die dort fest liegen – geflogen
> wird über Gras und Wasser, siehe der Absatz weiter oben im Katalog.

> **Das Wildschwein hat alle drei vorherigen Arten verschoben**, und zwar stärker als das Reh es
> getan hat: Ente 6 → 10 % Nachtaktivität und 293 → 372k Gebiet, Barsch 15 → 18 %, Reh 4 → 11 %
> Nachtaktivität, 180 → 219k Gebiet und 537 → 304 u zum Artgenossen. Der Grund ist immer derselbe:
> es ist das erste **nachtaktive** Tier. Bis hierher schliefen alle drei nachts ungestört; jetzt
> kommt zweimal je Nacht eine Rotte ans Ufer trinken, und mit Größenklasse 4 löst sie außerdem die
> Fluchtregel des Rehs aus („flieht vor Gr. ≥ 4"), das am Waldrand schläft, wo die Rotte
> vorbeizieht. Zwei Prüfschwellen in `tools/simtest.js` mussten deshalb angehoben werden (Ente
> „nachts wach" 8 → 20 %, Barsch „nachts langsamer" 0.5 → 0.85 des Tagestempos).
>
> Dass das die *Tiere* sind und nicht der Umbau am Code, ist nachgerechnet:
> `WL.Simulation.run(world, { species: ['ente', 'barsch', 'reh'] })` liefert weiterhin exakt die
> alten Zahlen (Ente 293k/210 u, Barsch 77k/23 u, Reh 180k/537 u) – obwohl unterwegs `isAwake` das
> Wachfenster über Mitternacht gelernt hat, die Waldsuche eine Tiefenangabe bekam und zwei
> Zustände dazugekommen sind.

> **Die Entenwerte haben sich mit dem Einbau des Rehs verschoben** (Nachtaktivität 2 → 6 %,
> Abstand zum Artgenossen 113 → 210 u, Gebiet 340 → 293k). Das ist kein Fehler und kein Zufall,
> sondern der Reaktionszweig der Ente, der zum ersten Mal etwas zu tun bekommt: vorher gab es
> außer Enten und Barschen nichts, was ans Ufer kommen konnte. Ein Reh, das trinkt, treibt die
> Enten weg, und jede solche Störung würfelt ihren weiteren Tag neu. Wer die alten Zahlen
> nachrechnen will: `WL.Simulation.run(world, { species: ['ente', 'barsch'] })` liefert sie
> unverändert – daran wurde geprüft, dass der Umbau der Nahrungskarten selbst nichts verschoben
> hat.

> **„Feste Orte" trennt das Reh gerade *nicht*, und das ist eine Falle.** Mit 3–4 liegt es genau
> auf dem Wert der Ente – obwohl das eine Tier vier feste Gewässer anfliegt und das andere gar
> keinen festen Ort hat. Der Tracker zählt zusammenhängende Aufenthaltsgebiete, und ein Reh, das
> lange auf einer Wiese äst, erzeugt eben auch solche Gebiete; sie liegen nur jede Woche woanders.
> Wer Ente und Reh trennen will, misst Wasser gegen Gras oder den Abstand zum Artgenossen – nicht
> die Zahl der Orte. Für den Unterricht ist das ein Geschenk: hier sieht man, dass ein Merkmal
> zwei ganz verschiedene Lebensweisen auf dieselbe Zahl abbilden kann.

Eine dritte Lesehilfe, diesmal zum Barsch: **Mittel- und Bewegungstempo sind bei ihm identisch**
(9.2 / 9.2), bei der Ente dagegen weit auseinander (9.2 / 16.1). Das ist kein Rundungszufall,
sondern das Merkmal selbst – ein Fisch steht nie still, eine Ente gründelt, ruht und schläft. Wer
beide Werte misst, hat damit ein Trennkriterium, das keiner der beiden Einzelwerte hergibt.

Zwei Lesehilfen zu diesen Zahlen:

* **„Feste Orte" ist nicht dasselbe wie „Gewässer".** Gezählt werden zusammenhängende Gebiete, in
  denen sich das Tier regelmäßig länger aufhält; reine Durchgangsstrecken (auch Flüge) fallen
  heraus. Auf einem sehr großen Teich, von dem eine Ente nur zwei getrennte Uferabschnitte nutzt,
  kommen dabei zwei Orte heraus – und das ist richtig so, denn genau das sähe ein Beobachter auch.
  Deshalb liegt der Wert etwas über der Zahl der Gewässer.
* **Der Abstand zum nächsten Artgenossen ist über alle Gewässer gemittelt** und deshalb groß.
  Auf *demselben* Gewässer gemessen liegt der Partner bei **66 u**, ein beliebiger anderer
  Artgenosse bei **89 u** – das Paar ist also klar erkennbar, ohne ein Schwarm zu sein. Getrennt
  sind Partner zu 24 % der Zeit; das ist die 85-%-Regel bei der Arbeit, kein Fehler.

---

## 7. Anmerkungen zum Katalog

**Das Kernset trennt sich mehrfach – und das ist der didaktische Gewinn.** Je nachdem, welche
Merkmale man misst, entstehen verschiedene, gleich gut begründbare Gruppen:

* nach Tageszeit: Reh, Kaninchen, Ente, Barsch │ Wildschwein, Fuchs, Fledermaus, Dachs
* nach Lebensraum: Ente, Barsch │ Wildschwein, Dachs │ Reh, Kaninchen │ Fuchs, Fledermaus
* nach Nahrung: Reh, Wildschwein │ Dachs │ Ente, Barsch │ Kaninchen, Fledermaus (frisst nicht) │
  Fuchs (jagt, ohne zu fressen)
* nach Tempo: Reh, Wildschwein, Dachs, Kaninchen │ Ente, Barsch │ Fuchs, Fledermaus (mit Abstand
  am schnellsten – siehe unten)

Vier saubere Aufteilungen, alle vertretbar, keine davon „die richtige". Genau das ist die Lehre
beim unüberwachten Lernen: das Ergebnis hängt davon ab, was man misst.

> **Die Nahrungszeile ist mit dem Fuchs die feinste geworden** – fünf Gruppen statt vier, und
> zwei davon heißen fast dasselbe. Kaninchen und Fledermaus tragen `keine`, der Fuchs
> `beutetiere`; sichtbar ist der Unterschied sofort (ein Kaninchen rennt vor ihm weg), im
> Vektor aber nur, weil hier ein eigener Wert steht. Hätte man dem Fuchs `keine` gegeben – er
> frisst ja wirklich nichts –, wären drei völlig verschiedene Arten in einem Topf gelandet.
> Ein Merkmal ist nur so gut wie die Namen, die man ihm gibt.

> **Zwei Arten fressen gar nicht, nicht nur eine.** Das war beim Kaninchen die interessanteste
> Zeile des Katalogs – „nach Nahrung" fällt eine Art aus dem Merkmal heraus statt in eine Gruppe.
> Mit der Fledermaus sind es zwei, aus völlig verschiedenen Gründen: das Kaninchen bewegt sich, weil
> Bewegung sein ganzes Verhalten ist, die Fledermaus jagt sichtbar (die Zick-Zack-Spur zeigt das
> deutlich), nur ohne dass dabei ein Vorrat sänke. Zwei Arten können also aus demselben Grund
> (`food: 'keine'`) im Merkmalsvektor gleich aussehen und doch für ganz verschiedene Gründe stehen –
> auch das lässt sich am Bildschirm nicht ablesen, nur durch Beobachtung des Verhaltens vermuten.

**Ente und Barsch waren als schwieriges Paar geplant** (beide Tag, Gruppe, Wasser) – sie sind es
nicht geworden, und das ist inzwischen gemessen statt vermutet. Sie trennen sich an **fünf**
Merkmalen deutlich: Zeit über Land (12 % gegen 0 %), feste Orte (4–5 gegen 1), Abstand zum
Artgenossen (113 u gegen 24 u), genutztes Gebiet (340k gegen 75k) und Nachtaktivität (2 % gegen
15 %). Jedes einzelne davon reicht schon.

> Der Grund ist, dass die Ente **alle** Gewässer anfliegt, während der Barsch seinen See per
> Definition nie verlässt. Wer das schwierige Paar zurückhaben will, müsste die Ente wieder auf
> wenige Gewässer beschränken. Solange das nicht gewünscht ist, wandert die Rolle des
> „schwierigen Paares" an ein anderes Duo – **Reh/Kaninchen ist es nicht geworden**, dazu weiter
> unten, und **Fuchs/Dachs auch nicht**.

**Fuchs und Dachs waren der letzte Kandidat für das schwierige Paar – und sind es nicht
geworden.** Auf dem Papier sprach alles dafür: beide nachtaktiv, beide Größenklasse 2, beide
mit festem Bau im Wald, einer davon sogar im selben Loch. Gemessen trennen sie sich trotzdem an
vier Zeilen deutlich: genutztes Gebiet **386k gegen 165k u²**, Tempo **17.8 gegen 5.3 u/s**,
Abstand zum Artgenossen **821 gegen 71 u**, Nahrungsart **Beutetiere gegen Ameisenbrut**. Nah
beieinander liegen „feste Orte" (2.0 gegen 1.3), „Zeit im Wald" (58 % gegen 73 %) und – seit
das Fuchsrevier kleiner und sein Tempo höher ist – auch die **Bewegungsunruhe** (0.32 gegen
0.36 rad/s), die die beiden vorher noch getrennt hat.

> Dahinter steht wieder eine einzige Entwurfsentscheidung, wie schon bei Reh/Kaninchen: der
> Dachs *streift* in seinem Revier, der Fuchs *läuft es ab*. Dieselbe Größe, dieselbe Tageszeit,
> dasselbe Zuhause – und trotzdem der drei- bis vierfache Weg. **Das Kernset hat damit kein
> schwieriges Paar mehr**, und das ist ein Befund, kein Mangel: acht Arten, die sich alle
> sauber trennen lassen, sind für den Einstieg genau richtig. Wer es schwer haben will, nimmt
> aus §4 den Igel dazu (nachtaktiv, Wald, Größenklasse 1, winziges Revier – dem Kaninchen im
> Vektor sehr ähnlich, obwohl er frisst und es nicht).

**Reh und Kaninchen sind das leichteste Paar des Kernsets**, obwohl beide tagaktiv sind und beide
auf derselben Wiese leben. Gemessen trennen sie sich an allem, was mit *Raum* zu tun hat: genutztes
Gebiet 219k gegen 51k u², Abstand zum Artgenossen 304 gegen 32 u, feste Orte 4–5 gegen 1. Dahinter
steht eine einzige Entwurfsentscheidung, nämlich die Beharrung der Zugrichtung – das Reh würfelt
seine Richtung nur alle paar Züge neu, das Kaninchen bei jedem Hopser. Dieselbe Bewegungsart,
einmal mit und einmal ohne Gedächtnis, ergibt „streift über die ganze Karte" gegen „kommt nie vom
Fleck". Für den Unterricht ist das der schönste Beleg dafür, dass ein Cluster im Merkmalsraum nicht
zeigt, *wie verschieden* zwei Tiere gebaut sind, sondern nur, wie verschieden ihr Verhalten
aussieht.

**Das Reh ist das erste Landtier und trennt sich von beiden Wassertieren sofort** – Zeit auf Gras
56 % gegen 4 % und 0 %, Zeit am Wasser 0 % gegen 94 % und 100 %. Das ist der langweiligste
Trennstrich des ganzen Katalogs und zugleich der wichtigste: „wo lebt das Tier" ist das Merkmal,
das eine Klasse ohne jede Anleitung zuerst findet. Interessanter ist, dass Reh und Barsch die
**Extreme des Sozialverhaltens** markieren: 537 u gegen 23 u zum nächsten Artgenossen, ein
Verhältnis von über 20:1. Dazwischen liegt die Ente mit 210 u als loses Paar.

**Der Barsch ist das erste Tier mit echtem Gruppenverhalten.** 24 u zum nächsten Artgenossen
gegen 113 u bei der Ente ist der größte Abstand zwischen zwei Arten im ganzen bisherigen Vektor.
Für die Unterrichtsstunde heißt das: „wie nah sind sich die Tiere derselben Art" ist ein Merkmal,
das die Schülerinnen und Schüler ohne jedes Vorwissen am Bildschirm ablesen können – und es
trennt sofort.

**Der Barsch hat im Kernset keinen Fressfeind** – Hecht und Storch sind Bonus. Seine
Fluchtreaktion läuft also zunächst ins Leere. Kein Problem, aber wenn Jagd im Kernset sichtbar
sein soll, wäre der Hecht der naheliegende neunte.

**Fuchs und Bussard sind die einzigen Jäger von Landtieren.** Im Kernset hängt alles
Räuber-Beute-Verhalten am Fuchs – und das ist eingebaut: gemessen **181 Entenjagden und 25
Kaninchenjagden** über zehn Seeds. Getötet wird nichts; die Jagd endet damit, dass die Beute weg
ist. Der Bussard kommt in Phase 2 als zweiter Jäger dazu, und die beiden jagen ausdrücklich
verschieden: der Fuchs *sucht*, was ihm zufällig nahe kommt (`ctx.nearestPrey`), der Bussard
*kennt* einen Ort und fliegt ihn einmal am Tag an.

> **Zwei Räuber auf einer Karte sind mehr als zwei Räuber.** Der Bussard treibt die Kaninchen in
> den Bau, dort sind sie für den Fuchs unerreichbar – und dessen ganze Nacht läuft anders. Das ist
> der erste Effekt im Projekt, bei dem eine Art eine andere verschiebt, **ohne ihr je zu
> begegnen** (§4, Bussard).

> **Das Kernset ist damit vollständig.** Acht Arten, vier Bewegungsdomänen (Wasser, Land, Luft,
> und der Fuchs als erste mit einem Revier als *Form*), fünf Formen von Sozialverhalten
> (Schwarm, Rotte, Familie am Bau, geteilter Pool, Einzelgänger mit eigenem Revier) und eine
> Räuber-Beute-Beziehung. Alles Weitere steht in §4.
