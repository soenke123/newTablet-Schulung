# Artenkatalog

Fachliche Grundlage für `js/eco/species.js`. Die Zahlen sind **Startwerte für die Abstimmung**,
keine biologisch kalibrierten Daten. Ändert sich ein Wert im Code, wird er auch hier
nachgetragen.

Die Arten sind ausgedacht, haben aber reale Vorbilder. Die Zeit ist gestaucht: Ein Jahr hat
60 Tage (4 Jahreszeiten zu je 15 Tagen), ein Tag hat 6 Ticks.

## Grafiken

Die Tierbilder liegen in `assets/` als `<name>_<f|m|j>_<haltung>.png` (Weibchen, Männchen,
Jungtier). Format: PNG mit transparentem Hintergrund, Seitenansicht. Läuft ein Tier in die
andere Richtung, wird gespiegelt. Jungtiere sind im Bild schon kleiner gezeichnet (gleiche
Bildgröße wie die Erwachsenen). `lighten` in `species.js` hellt zu dunkle Bilder beim Laden auf
(Zwerghirsch: dunkles Graubraun `#3c322a`). Die Kacheln in der Seitenleiste zeigen dieselben
Bilder (Männchen, stehend).

| Art | Name | Blickrichtung | Gehen | Stehen | Fressen | Ruhen |
|---|---|---|---|---|---|---|
| Zwerghirsch | `hirsch` | rechts | gehend | stehend | essend | liegend |
| Laufvogel | `laufvogel` | rechts | gehend | – (gehend) | essend | sitzend |
| Inselwolf | `wolf` | links | gehend | stehend | essend | liegend |
| Inseladler | `adler` | rechts | fliegend | stehend | essend | sitzend |
| Schaf | `schaf/schaf` | rechts | gehend | stehend | essend | sitzend |
| Hund | `hund/hund` | rechts | gehend | stehend | essend | sitzend |

Die Ratten sind ein Feld, keine Tiere: Sie haben ein einziges Bild (`assets/ratten.png`, drei
Ratten), das gestreut wird (`js/render/ratRenderer.js`, siehe „Ratten“).

Schaf und Hund haben eigene Ordner (`assets/schaf`, `assets/hund`). Ihre Bilder füllen den Rahmen
mehr aus als die von Hirsch und Wolf, deshalb sind sie mit kleinerem `size` gezeichnet (Schaf 17,
Hund 19; nur Darstellung). `tint` (Einfärben) wird nicht mehr gebraucht, bleibt aber als
Möglichkeit für Platzhalter in `sprites.js`.

Welche Haltung gezeigt wird (`js/render/agentRenderer.js`, `pose`):

- **Fressen:** Die Tiere wechseln reihum zwischen Fressen und Stehen; ziehen sie schnell
  weiter, gehen sie. Trinken zeigt ebenfalls das Fressbild.
- **Aas:** Gefressen wird erst am Kadaver; wer noch hinläuft, geht. Satte Tiere liegen
  daneben (der Adler steht).
- **Fliehen, Jagen, Streifen, Wandern:** Gehen (Adler: Fliegen), Stehen nur ohne Bewegung.
- **Ruhen:** Liegen bzw. Sitzen, ohne sich zu bewegen; der Adler steht beim Ruhen.
- **Brüten:** Laufvögel am Nest wechseln zwischen Sitzen und Fressen. Brutvogel und Küken im
  Horst des Adlers sitzen.

## Nahrung (Felder, keine Tiere)

| Schicht | wächst vor allem in | Jahreszeit |
|---|---|---|
| Gras und Kräuter | Tussock-Grasland, Sumpf, Buschland | Frühling stark, Winter schwach |
| Triebe und Laub | Farnwald, Moosnebelwald, Buschland | Frühling/Sommer |
| Früchte und Samen | Buschland, Farnwald | Sommer/Herbst, im Winter keine |
| Insekten | Sumpf, Farnwald | Frühling/Sommer |

Eine Weidezelle fasst 4 × 4 Rasterzellen zusammen (24 × 24 Einheiten).

**Kapazität** je Weidezelle (Gras: Tussock 13, Sumpf 6, Buschland 5,5; Laub: Farnwald 7,04,
Buschland 6,16, Moosnebelwald 5,28). Das Gras wurde zuerst verdoppelt (auf 11), dann auf 13 erhöht,
damit die große Insel 300–500 Hirsche trägt (siehe „Abstimmung“).
Dazu gibt es mehr Grasland: Tussock wächst bis zu einer Feuchte von 0,50 (vorher 0,40), Farnwald
erst ab 0,66 (vorher 0,56). Tussock bedeckt so etwa 40 % des Landes (vorher 32 %), Farnwald 20 %
(vorher 25 %), Buschland bleibt bei 13 %.

**Nachwachsen:** Pflanzen wachsen aus ihren Blättern. Halb abgefressen wächst am meisten nach,
kahl gefressen kaum noch (nur aus Wurzeln und Samen, 5 % der Kapazität). Pro Tag:
`v += Rate · Jahreszeit · (v + 0,05·K) · (1 − v/K)`. Raten: Gras 0,13, Laub 0,1, Früchte 0,18,
Insekten 0,3.

**Überweidung:** Wird eine Weidezelle in der Wachstumszeit unter 25 % ihrer Kapazität
abgefressen (Laub: 30 %), sinkt ihr Pflanzenzustand (Gras um 0,05 je Tag, Laub um 0,03, mal
Jahreszeit; im Winter ruhen die Pflanzen, Abweiden schadet dann nicht). Abgestorbene Pflanzen
tragen kaum noch: Bei Zustand 0 wächst nur noch 2 % der Kapazität. Erholen kann sich eine Zelle
erst nach 60 Tagen (einem Jahr) ohne Überweidung, dann um 0,006 je Tag (Laub 0,004), mal
Jahreszeit und mal 0,2 + 0,8 · Zustand: Kahler Boden muss erst wieder besiedelt werden. Eine
völlig kahle Graszelle ist nach 3 Jahren zu einem Fünftel, nach 5 Jahren zur Hälfte und nach
etwa 7 Jahren ganz erholt. Früchte hängen am Zustand des Laubs (Büsche, die verbissen werden,
tragen weniger).

Gras und Laub werden nur von den Zwerghirschen gefressen. Damit hängt der Zustand der Weiden
allein an ihnen – und über sie an den Wölfen. Auf der Karte verliert die Landschaft dort ihre
Farbe: abgefressene Flächen werden etwas blasser, überweidete grau und fahl. Die Textur bleibt
sichtbar, sie wird nur entsättigt (Auswahl „Karte“ oben, Standard „Weidezustand“). Dieselbe Auswahl zeigt auch jede Nahrungsschicht einzeln: abgefressen
braun, voll leicht grün – so sieht man z. B., wo die Laufvögel Früchte und Insekten leer fressen.

**Übernutzte Insekten:** Auch die Laufvögel können ihre Nahrung zerstören. Sie scharren den
Boden nach Larven und Puppen ab. Fällt der Insektenbestand einer ganzen Gegend (5 × 5
Weidezellen, also 120 × 120 Einheiten) in Sommer oder Herbst unter 30 % dessen, was sie in ihrem
heutigen Zustand trägt, sinkt dort, wo gefressen wird, der Zustand der Insekten um 0,1 je Tag. Ein
durchziehender Trupp schadet also nicht, nur zu viele Vögel in der ganzen Gegend. Erholen kann sich
eine verarmte Gegend erst nach 120 Tagen ohne Übernutzung (um 0,006 je Tag, kahl nur zu 3 %).
Früher galt als Maßstab eine gesunde Gegend. Eine einmal verarmte Gegend lag dann für immer unter
der Schwelle, jedes Fressen schadete weiter, und über Jahrzehnte verarmte die ganze Insel. Mit
den Insekten sanken die Laufvögel und dann die Adler.

## Jahreswetter

Kein Jahr ist wie das andere (`js/eco/weather.js`). Zu Beginn jedes Jahres wird gewürfelt:

| Größe | Spanne | Wirkung |
|---|---|---|
| Wachstum | 0,75–1,25 | wie gut alle Pflanzen in diesem Jahr wachsen |
| Winterhärte | 0,55–1,5 | Energieverbrauch im Winter, Wachstum im Winter, Schwund von Früchten und Insekten |
| Mastjahr | 16 % (nie zweimal hintereinander) | Früchte bis zum 2,4-Fachen im Sommer und Herbst |

Das Wetter hat einen eigenen Zufallsgenerator: Dieselbe Insel hat immer dieselbe Wetterfolge,
auch wenn man die Startbestände ändert. Vergleichsläufe sind dadurch fair. In den Diagrammen sind
Mastjahre gelb und harte Winter blau hinterlegt.

**Winterschwund:** Früchte verrotten ab dem Herbst (im Winter 7 % pro Tag), Insekten sterben im
Winter (12 % pro Tag), in harten Wintern schneller. Insekten überwintern aber als Eier und
Larven (Reserve 35 % statt 5 %) und sind im Frühling schnell zurück. Für den Laufvogel wird der
Winter so zum Engpass, Mastjahre lassen seinen Bestand wachsen.

## Wasser

**Kein Durst** (`thirstDays: 0` bei allen Arten). Auf der fruchtbaren Insel regnet es oft, die Tiere
finden überall Pfützen und nehmen Wasser mit der Nahrung auf. Vorher stieg der Durst jeden Tag, und
die Tiere mussten an See oder Fluss (Zwerghirsch und Laufvogel 14 Tage ohne Wasser, Inselwolf 10,
Schaf 20). Das machte viele Probleme: Wölfe trieben ganze Herden immer wieder vom Wasser weg, bis sie
30–200 Einheiten vor dem Ufer verdursteten (bis zu 20 Hirsche im Jahr), und durstige Herden kamen
kaum zum Fressen. Der Mechanismus steht noch im Code (`thirstDays` > 0, `fleeToWater`, Wasser in
der Nahrung: Gras 0,04 je Einheit, Laub 0,06, Insekten 0,14, Früchte 0,16) und lässt sich wieder
einschalten. Ohne Durst ziehen die Tiere nicht mehr gezielt zum Wasser.

## Zwerghirsch

- **Vorbild:** Inselverzwergung bei Hirschen (z. B. ausgestorbene Zwerghirsche auf Kreta).
- **Rolle:** Hauptbeute der Wölfe.
- **Gruppe:** Herde mit 2–16 Tieren. Wird sie größer, teilt sie sich.
- **Nahrung:** Gras, Laub.
- **Lebensraum:** Grasland, Buschland, Waldrand.
- **Fortpflanzung:** Jedes erwachsene Weibchen bekommt im Frühling 1 Kalb (Chance 85 %), wenn es
  genug Energie hat (≥ 40 %) und ein erwachsenes Männchen in der Herde ist. Erwachsen mit 1 Jahr,
  Höchstalter etwa 8 Jahre.
- **Weniger Kälber bei knapper Weide** (`breed.food`): Die Chance sinkt mit dem Füllstand des Grases
  im Umkreis von 3 Weidezellen (72 Einheiten), gemessen an dem, was die Weiden heute tragen. Ab 65 %
  gilt die volle Chance, bei 30 % gibt es keine Kälber. So bremst sich der Bestand, bevor er die
  Weiden zerstört. Ohne diese Bremse blieben die Hirsche satt, bis das Gras plötzlich weg war: Sie
  wuchsen auch mit 100 Wölfen von 400 auf 1250 und brachen dann nach Kahlfraß auf 140 ein.
- **Startbestand:** 300 auf der mittleren Insel (vorher 160). Ein Riss liefert 3 Energie (vorher
  1,5, Kalb die Hälfte). Suchbild (`scarce`): 1,3 Hirsche je 100 × 100 im Blick (siehe Was das
  Ökosystem stabil hält).
- **Verhalten:** grast, zieht weiter, wenn die Weide unter 35 % ihrer vollen Menge abgefressen ist
  (knapp über der Schwelle der Überweidung, mindestens aber bei 0,4 Energie), flieht vor
  jagenden Räubern (kurzer Sprint, dann Trab). Mehr Tiere in der Herde bemerken Gefahr früher.

## Laufvogel

- **Vorbild:** Takahē, Moa, Dodo – flugunfähige Bodenbrüter.
- **Rolle:** Beute für Adler und Wölfe; später besonders gefährdet durch eingeschleppte Ratten.
- **Gruppe:** lose Gruppe mit 2–6 Tieren. Einzelne Vögel schließen sich der nächsten Gruppe an
  (sonst finden sie keinen Partner).
- **Nahrung:** Früchte, Samen, Insekten (kein Gras). Mit Äckern auch Getreide (0,1; Oktober 2026).
- **Lebensraum:** Buschland, Wald, Sumpf.
- **Fortpflanzung:** Im Frühling legt jedes Paar 2–4 Eier in ein gemeinsames **Nest am Boden**.
  Die Küken schlüpfen nach 8 Tagen. Solange brütet die Gruppe in der Nähe des Nests. Wo Sammler
  unterwegs waren, legen die Paare seltener (bis 70 % weniger, `BT.HUMANS.gather.nest`).
- **Verhalten:** sucht Futter, flieht vor Räubern, brütet.

### Ökologische Nische

Der Laufvogel ist **Allesfresser am Boden**: Früchte und Samen, Insekten (kein Gras). Damit
überschneidet er sich nicht mit dem Zwerghirsch, der Gras und Laub frisst. Die beiden
Pflanzenfresser konkurrieren also wenig und werden von verschiedenen Dingen begrenzt.

**Was den Laufvogel begrenzt:**

1. **Der Winter.** Früchte gibt es nur im Sommer und Herbst, Insekten nur im Frühling und
   Sommer. Im Winter verrotten die Früchte und die Insekten sterben.
   Ein harter Winter lässt viele Vögel verhungern.
2. **Das Fruchtangebot schwankt von Jahr zu Jahr.** In einem **Mastjahr** tragen Büsche und
   Bäume massenhaft Früchte, die Vögel gehen gut genährt in den Winter und brüten im
   Frühling erfolgreich. Danach wächst der Bestand, bis ein mageres Jahr oder ein harter Winter
   ihn wieder einbrechen lässt.
3. **Der Inseladler** jagt vor allem Laufvögel. Er folgt dem Vogelbestand mit Verzögerung: Viele
   Vögel bedeuten viele junge Adler, die dann die Vögel stärker dezimieren.
4. **Der Inselwolf** nimmt Laufvögel nebenbei, vor allem wenn Zwerghirsche knapp sind.
5. **Deckung:** Im Wald und Buschland sieht der Adler die Vögel schlecht. Im offenen Grasland
   sind sie gefährdet.

## Inselwolf

- **Vorbild:** Falklandfuchs (Warrah), der einzige heimische Landräuber der Falklandinseln, von
  Siedlern ausgerottet.
- **Gruppe:** Rudel mit bis zu 12 Tieren (vorher 6) und festem Revier (Radius 380). Startbestand 40.
- **Beute:** vor allem Zwerghirsch, Laufvögel nur selten (Gewicht 0,13: nur wo er sehr viele sieht;
  mit 0,15 nahm er sie den Adlern weg, seit das Suchbild an der Umgebung hängt). Frisst auch Aas. Wie sein Vorbild frisst er
  nebenher Insekten und Früchte, wenn er hungrig umherstreift (`dietSeason`: Frühling und Sommer
  60 %, Herbst 80 %, Winter voll; vorher 30 / 30 / 50 %). Das trägt ihn durch magere Winter und
  durch Jahre mit wenigen Hirschen, ohne dass er die Hirsche stärker jagt. Mit 30 % hingen die
  Wölfe bei 250–350 Hirschen jahrzehntelang bei 3–20 Tieren fest, bis Pech sie auslöschte (große
  Insel, nur Hirsch und Wolf, 16 × 100 Jahre: ausgestorben 2-mal, mit 60 % 1-mal; Wölfe im Mittel
  61 → 83). Früher kamen einmal 42 % seiner Energie aus dieser Nebenkost; seine Zahl hing dann
  kaum an den Hirschen.
- **Bewacht seinen Riss:** Liegt ein Rudel näher als 80 an einem Aas, kommt kein Adler heran.
  Sonst lebten die Adler von den großen Hirschrissen (58 % ihrer Energie aus Aas, vorher 14 %),
  vermehrten sich und fraßen die Laufvögel leer.
- **Bleibt am Aas:** Ein Rudel bleibt an seinem Riss oder an gefundenem Aas, bis es leer oder
  verwest ist: hungrig frisst es (höchstens 0,6 Energie je Tick), satt liegt es daneben. Vorher
  zog es satt weiter und kehrte hungrig zurück, ein ständiges Hin und Her. Ein größeres Rudel
  (auch Hunde), das an dasselbe Aas will, vertreibt es; das Aas meidet es dann. Das ist vor allem
  zum Beobachten da. Weil weniger Aas ungenutzt verwest, gibt es etwas mehr Wölfe (Mittel ab
  Jahr 10: 53 statt 42; alle Arten überlebt 8 von 8 statt 7 von 8).
- **Jagd:** erst anschleichen, dann sprinten. Der Erfolg steigt mit der Zahl der Jäger und
  sinkt mit der Deckung, der Herdengröße und der Verfassung der Beute (ausgehungerte Tiere
  entkommen schlechter). Bevorzugte Opfer sind Jungtiere, schwache und alte Tiere. Ein erlegter
  Hirsch liefert 3 Energie (ein Laufvogel 0,6). Nach einem Riss ruht das Rudel nur, wenn es satt
  ist, sonst jagt es weiter. Gejagt wird unter 70 % Energie. Erfolg je Angriff und Jäger 0,32,
  Verbrauch 0,052 Energie am Tag (vorher 0,042).
- **Fortpflanzung:** nur das älteste Paar des Rudels, 2–4 Welpen im Frühling, und nur wenn das
  Rudel gut genährt ist (≥ 45 %, vorher 50 %), ein eigenes Revier hat und noch nicht voll ist
  (höchstens 6). Mit 50 % lagen die Wölfe bei Hirschen an der Grenze des Futters im Frühling um
  diesen Wert; viele Würfe fielen aus, und wenige Rudel erholten sich jahrzehntelang nicht (große
  Insel, nur Hirsch und Wolf, 16 × 100 Jahre: Wölfe 4-mal ausgestorben, mit 45 % 2-mal).
- **Mit Welpen mehr jagen** wurde ausprobiert (Jagd schon unter 85 % bzw. 76 % Energie, solange
  Welpen unter ½ Jahr im Rudel sind) und wieder abgeschaltet: Die Wölfe reißen dann mehr Hirsche,
  als sie brauchen, und sterben danach häufiger aus (in 48 Testläufen 4–6-mal statt 1–2-mal). Der
  Mechanismus steht noch im Code (`rearing` in der Artentabelle) und kann zum Experimentieren
  eingeschaltet werden.
- **Abwanderung:** Im Herbst verlassen junge Wölfe Rudel ab 4 Tieren (jeder mit 60 %). Wanderer suchen
  Gruppen, denen ihr Geschlecht fehlt. Von einem Trupp wechseln nur die Tiere, die dort fehlen und
  Platz haben; Wanderer desselben Geschlechts suchen sich nicht gegenseitig. (Vorher zogen Trupps
  aus 4–5 Männchen jahrelang umher, weil sie als Ganzes in kein Rudel passten.) Mit Partner gründen
  sie ein Revier, wo Platz ist. Wanderer mit Partner steuern gezielt freien Platz an. Aus fremden Revieren werden
  Wanderer vertrieben und jagen dort nicht. Anders als bei Adlern ist das auch in der Natur so:
  Wolfsrudel verteidigen ihr ganzes Revier, und Kämpfe mit fremden Rudeln sind bei Wölfen eine
  der häufigsten natürlichen Todesursachen. Getestet wurde, Wanderer in den Randzonen fremder
  Reviere jagen zu lassen (außerhalb von 270 um die Reviermitte). Das war deutlich schlechter
  (35 statt 42 von 48 Läufen überleben).

## Inseladler

- **Vorbild:** Haastadler (Neuseeland, ausgestorben).
- **Gruppe:** Paar mit Revier (Radius 330), im Frühling und Sommer dazu die Küken im Horst.
- **Beute:** Laufvögel, selten junge Zwerghirsche (bis ½ Jahr; Gewicht 0,25 – häufiger fehlten die Kälber den Wölfen). Sieht schlecht unter Bäume. Frisst Aas.
  Jagt unter 65 % Energie, verbraucht 0,03 Energie am Tag. Erfolg je Angriff und Jäger 0,3.
- **Horst:** Jedes Paar hat einen festen Horst nahe der Reviermitte, am liebsten auf Bäumen oder
  Felsen, und nutzt ihn jedes Jahr wieder. Auf der Karte ist er ein Reisignest, während der Brut
  mit Eiern.
  1. **Brut** (10 Tage ab Frühlingstag 1): Das Paar legt 1–3 Eier, wenn das Weibchen gut genährt
     ist (≥ 55 %, Chance 85 %). Ein Vogel sitzt immer im Horst, der andere jagt. Jede Beute wird
     zum Horst gebracht, dann wechseln sie sich ab. Sinkt der Brutvogel unter 25 % Energie oder
     stirbt ein Partner, wird das Gelege aufgegeben.
  2. **Nestlinge** (15 Tage): Die Küken sitzen im Horst, beide Eltern jagen und bringen jede Beute
     heim. Küken wachsen und brauchen viel (0,045 Energie am Tag zusätzlich). Verteilt wird so:
     erst fressen sich die Eltern bis 40 % satt, dann bekommen die Küken in der Reihenfolge des
     Schlüpfens, der Rest wird geteilt. In guten Jahren kommen alle Küken durch, in mageren nur das
     älteste. Hungern beide Eltern (unter 25 %), geben sie die Brut auf.
  3. **Flügge:** Die Jungen fliegen noch 60 Tage mit den Eltern und fressen von deren Beute mit
     (Führungszeit, `horst.dependence`). Danach fliegt jedes allein los und sucht sich ein eigenes
     Revier. Ohne Führungszeit verließen die Jungen den Horst mit etwa 23 % Energie und verhungerten
     fast alle; die alten Paare starben an Altersschwäche, ohne ersetzt zu werden. Mit Führungszeit
     (große Insel, 100 Jahre): nur Laufvogel und Adler 8 von 8 (vorher über 60 Jahre 7 von 8).

  Am Horst jagen die Adler fast ununterbrochen (unter 95 % Energie) und erfolgreicher (× 1,3,
  sie kennen die Umgebung genau), aber nur im Umkreis von 300 um den Horst. Die Brutzeit fällt
  auf die Zeit, in der die Laufvögel ihre Küken haben.
- **Junge Adler ohne Revier (Floater)** werden geduldet, wie bei echten Steinadlern. Sie jagen
  überall, auch in fremden Revieren, und werden nur aus der Nähe eines fremden Horsts
  vertrieben (Umkreis 150). Bis sie erwachsen sind, jagen sie ungeübt (Jagderfolg × 0,85).
- **Konkurrenz:** Jagen andere Adler im Umkreis von 250 um die Beute, gelingt ein Angriff
  seltener (Erfolg geteilt durch 1 + 0,25 × Zahl der anderen Adler). Die Beute wird früher
  gewarnt, Beute wird streitig gemacht. Ohne diese Bremse sammeln sich in guten Jahren bis zu
  20 Floater an, fressen die Laufvögel leer und verhungern danach alle.
- **Revier gründen:** Junge Adler ohne Revier suchen einen Partner des anderen Geschlechts.
  Sie fliegen nur zu Artgenossen, denen genau ihr Geschlecht fehlt, und tun sich nie mit
  Artgenossen desselben Geschlechts zusammen. Hat ein Wanderer einen Partner, steuert das Paar
  gezielt freien Platz an. Ein junges Paar besetzt ein freies Revier
  und brütet, sobald beide erwachsen sind (2 Jahre). Wer ein Revier hat, verliert es erst nach
  einem Jahr ohne Partner. Höchstalter etwa 14 Jahre.
- **Trinkt nicht** (Wasser aus der Beute).

## Eingeschleppte Arten: Schaf und Hund

Sie kommen über Karten mit den Menschen (`docs/MENSCH.md`). **Die vier heimischen Arten bleiben
unverändert** – ihre Einträge in `species.js` sind dieselben wie vorher. Was die heimischen Arten
mit den neuen zu tun haben, bringt die neue Art selbst mit: `preyOf` (welche heimischen Räuber
sie fressen) und `unknownTo` (wer sie nicht kennt und nicht flieht). Ohne Schafe und Hunde hat
beides keine Wirkung. Mit ihnen darf das Ökosystem kippen. Die Werte sind noch nicht getestet.

### Schaf

- **Vorbild:** verwilderte Hausschafe (Neuseeland, Hawaii). Etwas stärker als der Hirsch und
  nimmt ihm das Grasland weg.
- **Kommt mit den Menschen:** Startbestand 0. Mit der Karte „Schafweide“ stehen 12 Schafe auf
  einer eingezäunten Weide. Die gehören den Siedlern und zählen nicht zum Tierbestand, fressen
  aber das Gras der Weide (0,25 je Tick und Schaf, tagsüber). **Etwa 4 Jahre nach jeder Weide**
  (3,7–4,3) brechen dort **einmal** **2–6** Schafe aus (Folgekarte 🐑 „Schafe brechen aus“). Die Siedler ersetzen sie im nächsten Frühjahr.
- **Ausreißer:** satt und ohne Durst. Sie laufen erst 600–900 vom Dorf weg (vorher 350–600), zu gutem
  Gras nah am Wasser, und suchen sich erst dort ihre Weide. Drei Jahre lang jagen die Jäger sie nicht
  (für die Dörfler sind es noch ihre Schafe). Werden sie unterwegs hungrig,
  bleiben sie, wo sie sind.
- **Zaun:** Wilde Tiere kommen nicht auf die Weide, außer Adlern und Räubern auf der Jagd.
- **Gruppe:** große Herden bis **100** Tiere (ab 3), mit Abstand: Der Radius der Herde ist
  mindestens 30 und wächst mit 10 · √Tiere (100 Schafe: Radius 100). Je größer die Herde, desto
  seltener gelingt ein Angriff (wie bei allen Arten: Erfolg geteilt durch 1 + 0,03 · (Tiere − 1),
  bei 100 Schafen also etwa ein Viertel).
- **Teilen bei Futtermangel** (`group.split`): Ist eine Herde ab 24 Tieren im Mittel unter Energie
  0,5, zieht die Hälfte 250–500 weit zu einer neuen Weide. Danach teilen sich beide Teile 90 Tage
  nicht.
- **Nahrung:** vor allem Gras (Energie 0,12, Hirsch 0,11), Triebe und Laub (0,08, Hirsch 0,09), Getreide (0,12).
  **Frisst kürzer als der Hirsch:** Unter dem Gras liegt die **Grasnarbe** (eigene Nahrungsschicht
  `narbe`, etwa ein Viertel der Graskapazität, wächst langsam, hängt am Zustand des Grases). Nur
  Schafe beißen so tief (Energie 0,1); auf kahl gefressenem Grasland finden sie so noch Futter, der
  Hirsch nicht. Frisst kräftiger als der Hirsch (0,42 je Schritt, Hirsch 0,38).
- **Genügsam:** Verbrauch 0,035 am Tag (Hirsch 0,05), im Winter 0,008 mehr (Wolle; Hirsch 0,015).
  Ohne Durst (siehe Wasser) wirkt der folgende Satz nicht mehr. Trank seltener (20 Tage ohne Wasser). Wird eine durstige Herde gejagt (`fleeToWater`), flieht sie
  ab Durst 0,5 zum Wasser, wenn es vom Räuber weg liegt; ab 0,7 auch seitlich, und sie flieht dann
  nur noch vor Räubern näher als 60. Sonst verdursteten Herden, die tagelang von mehreren Rudeln
  gehetzt wurden.
- **Zaun und Wasser:** Wasser in einer Weide ist für wilde Tiere nicht erreichbar; der Weg zum
  Wasser führt um die Zäune herum (`humans.waterDist`, nur wenn es Weiden gibt).
- **Lebensraum:** Grasland und Wiese, Busch (0,8), Fels (0,6), Farnwald (0,5), Moos (0,3).
- **Fortpflanzung:** jedes Weibchen, **1–2 Lämmer**, Chance 0,95 (Hirsch: 1 Kalb, 0,85). **Reif mit
  ½ Jahr** (Hirsch 1 Jahr), Höchstalter 9. **Weniger Lämmer bei knapper Weide** (`breed.food`: Gras im
  Umkreis von 3 Weidezellen, volle Chance ab 30 %, keine Lämmer erst bei 5 %; Hirsch 65 % / 30 %).
  Schafe beißen kürzer und bekommen deshalb noch Lämmer, wo der Hirsch keine Kälber mehr hat. So
  drücken sie das Gras unter das, wovon der Hirsch leben kann (Konkurrenz um dieselbe Nahrung: Wer mit
  weniger auskommt, gewinnt).
- **Flucht:** 11,5. `scheu` 0,6 (verwildert: meidet die Dörfer und flieht vor Jägern; mit 0,4
  grasten die wilden Schafe bis an die Häuser, wo das Gras unberührt ist, und wurden dort erlegt).
- **Feinde** (`preyOf`): **Wolf 1,3**, Hund 1,3 (lieber als Hirsch, 1,0), Adler 0,25 (nur Lämmer
  bis ½ Jahr). **Leichte Beute** (`easyPrey` 1,2; mit 1,4 hielten die Wölfe die Schafe bei etwa 70): Ein Angriff auf Schafe gelingt 1,2-mal so oft
  (langsam, wenig wachsam). Wenige Schafe schützt das Suchbild (`scarce`), deshalb werden
  frisch ausgebrochene Schafe kaum gejagt. Erst wenn es viele gibt, fressen die Räuber sie bevorzugt –
  und vermehren sich dabei, was auch die Hirsche trifft (scheinbare Konkurrenz).
- **Suchbild:** `scarce` **0,9** je 100 × 100 im Blick: Ein Rudel (Sicht 230) sucht erst
  gezielt nach Schafen, wenn es etwa 15 im Blick hat. Mit 0,3 (gesetzt, als das Suchbild noch am
  Bestand der Insel hing, `scarceMin` 40) galten nach dem Umbau auf das Suchbild im Blick schon
  die 2–6 frisch ausgebrochenen Schafe als Suchbild: Die Wölfe fraßen sie, Schafe setzten sich
  nur noch auf 1 von 8 Inseln fest. Gemessen (`invasion.js 8 30 --karten=schafe@1`):

  | `scarce` | Schafe etabliert | Hirsch | Laufvogel | Wolf | Adler |
  |---|---|---|---|---|---|
  | 0,3 | 1 von 8 | 103 % | 98 % | 93 % | 97 % |
  | 0,6 | 4 von 8 | 73 % | 90 % | 103 % | 139 % |
  | **0,9** | **7 von 8** | **56 %** | **87 %** | **111 %** | **107 %** |
  | 1,2 | 7 von 8 | 34 % | 84 % | 89 % | 132 % |

  (Median gegenüber dem Lauf nur mit Landung. Die eine Insel ohne Schafe: Es brachen nur 3 aus.)
- **Ein Riss liefert 2,6 Energie** (Hirsch 3; vorher 1,3 zu Hirsch 1,5).
- **Nachgezogen nach der Abstimmung von Hirsch und Wolf** (Hirsch 3 Energie statt 1,5, Lämmerbremse
  beim Hirsch, Wolf verbraucht mehr): Die Schafe waren unverändert geblieben. Spielte man die Schafweide
  auf einer frischen Insel, starben die Wölfe öfter aus als ohne Schafe (16 Inseln × 30 Jahre: 3-mal,
  ohne Schafe nie). Ablauf: Die Schafe brechen aus, während die Wölfe in einem Tal ihres Zyklus sind.
  Große Herden (50–90) sind wachsam und werden kaum gejagt, die Schafe wachsen ungebremst auf 400–800,
  fressen das Gras kahl (Zustand 92 % → 12 %), die Hirsche verhungern, dann die Schafe. Die Wölfe
  leben noch kurz von hungrigen Schafen (1,3 Energie je Riss), finden dann aber zu wenig und sterben
  aus. Mit Lämmerbremse und 2,6 Energie (16 Inseln × 30 Jahre, Schafweide im ersten Jahr):

  | | Wölfe ausgestorben | Wölfe | Hirsche | Schafe |
  |---|---|---|---|---|
  | ohne Schafe | 0 | 57 | 262 | – |
  | Schafe vorher | 3 | 58 | 219 | 129 |
  | nur Fleisch 2,6 | 6 | 64 | 184 | 203 |
  | nur Lämmerbremse | 1 | 61 | 251 | 61 |
  | **beides** | **0** | **75** | **250** | **100** |

  (Mittel ab Jahr 9.) Jetzt fressen die Wölfe die Schafe bevorzugt und werden mehr; die Hirsche
  bekommen den zusätzlichen Druck zu spüren (scheinbare Konkurrenz). Leichter zu fangen
  (`easyPrey` 1,6 oder weniger Wachsamkeit der Herde, `vigilance` 0,01 statt 0,03) half nicht: Die
  Schafe wuchsen trotzdem bis zum Kahlfraß.

  **Zweiter Schritt: Wirkung auf die Hirsche.** Mit derselben Bremse wie der Hirsch (65 % / 30 %)
  blieben die Schafe bei etwa 100, und die Hirsche merkten kaum etwas. Beide Arten hörten bei
  derselben Grasmenge auf, Junge zu bekommen; die Schafe hatten keinen Vorteil, und die Wölfe nahmen
  sie bevorzugt. Gemessen (16 Inseln × 30 Jahre, Schafweide im ersten Jahr):

  | Bremse Schaf (volle Chance / keine) | Wölfe ausgestorben | Hirsche J16–30 | Schafe J16–30 | Wölfe | Zustand Gras ab J9 |
  |---|---|---|---|---|---|
  | ohne Schafe | 0 | 277 | – | 50 | 79 % |
  | 65 % / 30 % (wie Hirsch) | 0 | 255 | 114 | 73 | 70 % |
  | 45 % / 15 % | 0 | 209 | 173 | 72 | 61 % |
  | **30 % / 5 %** | **0** | **190** | **197** | **66** | **55 %** |
  | 20 % / 0 % | 4 | 165 | 207 | 56 | 51 % |
  | 30 % / 5 %, `scarceMin` 80 | 4 | 158 | 223 | 59 | 50 % |

  Gewählt: 30 % / 5 %. Die Hirsche sinken um etwa ein Drittel, das Gras leidet sichtbar, die Wölfe
  überleben. Noch stärker kippt die Insel (Wölfe sterben auf 4 von 16 Inseln aus). Die Wirkung
  kommt langsam: Wenige Schafe brechen aus (2–6, nach etwa 4 Jahren), bis sie zahlreich sind,
  vergehen rund 10 Jahre.

  Offizielle Werkzeuge mit 30 % / 5 %: `invasion.js 8 30 --karten=schafe@1` Hirsche 74 %, Wölfe 127 %,
  Laufvögel 116 %, Adler 92 % des Laufs ohne Schafe; Schafe etabliert 8 von 8. Mit Schafen und Hunden
  (`balance.js 8 30 --karten=schafe@1,hunde@1`) sterben die Wölfe auf 5 von 8 Inseln aus (mit der
  Bremse wie beim Hirsch 3, vor dem Nachziehen 7): Staupe und Konkurrenz zusammen lassen die Insel kippen.

  Mit den offiziellen Werkzeugen (erster Schritt, Bremse noch 65 % / 30 %): `invasion.js 8 30 --karten=schafe@1` Wölfe 132 % des Laufs ohne
  Schafe (vorher 118 %), Hirsche 100 % (vorher 96 %). `balance.js 8 30 --karten=schafe@1,hunde@1`:
  Wölfe sterben auf 3 von 8 Inseln aus (vorher 7 von 8; der Rest geht auf die Staupe der Hunde),
  Mittel Wölfe 23 statt 15, Gras im Zustand 58 % statt 52 %. Ohne Karten unverändert (`balance.js 8 30`:
  8 von 8, Hirsche 244, Wölfe 53).

### Hund

- **Vorbild:** verwilderte Hunde, Dingo.
- **Kommt mit den Menschen:** Startbestand 0. Mit der Karte „Hütehunde“ laufen 3 Hunde zwischen
  Dorf und Weiden umher (jede weitere Karte 3 mehr). Sie stören stärker als die Menschen allein:
  Die Störung ums Dorf reicht 20 % weiter, und um jede Weide liegt Störung im Umkreis von 200.
  **4 Jahre nach jeder Karte „Hütehunde“** verwildern **einmal** 3–4 Hunde (Weibchen, Männchen, …;
  Folgekarte 🐕 „Hunde verwildern“). Sie sind satt, laufen erst 700–1000
  vom Dorf weg (vorher 400–700) und suchen dann ein Revier. Drei Jahre lang jagen die Jäger sie nicht, und sie
  greifen die Jäger nicht an. Lebt ein wildes Hunderudel mit Platz höchstens 700 vom
  Dorf, laufen sie zu ihm und schließen sich an. Die Siedler ersetzen die Hunde im nächsten Frühjahr.
- **Wie der Wolf:** Alle Werte kommen vom Inselwolf (`Object.assign`), dazu:
  `scheu` 0,3 (Wolf 0,9), Beute Hirsch 1,0, Laufvogel 0,15 (Wolf 0,13), Schaf 1,3 (siehe Schaf).
  Jagderfolg wie der Wolf (0,32; vorher 0,36).
  **Die Laufvögel kennen keine Hunde** (`unknownTo`) und fliehen nicht vor ihnen. Mit Laufvogel 0,6
  (bzw. 0,35) fraßen die Hunde die Laufvögel auf die Hälfte herunter, und die Adler verhungerten.
- **Abfälle** (`scraps`): Bis 800 von einem Dorf findet jedes Tier jeden Tag etwas (Energie 0,015;
  Verbrauch 0,052). Vorbild: Verwilderte Hunde leben weltweit vor allem von den Menschen. Ohne das
  verhungerte das kleine erste Rudel oft im ersten Winter (Hunde etabliert 4–5 von 8), mit mehr
  Nebenkost überall (Früchte, Insekten 0,09) wurden es zu viele (Hirsche 43 %, Laufvögel 23 %).
- **Verdrängung** (`dominates: ['inselwolf']`, Vorbild Dingo und Beutelwolf in Australien): In einem
  Hunderevier gründen Wölfe kein Revier, und wandernde Wölfe werden daraus vertrieben (wie aus
  fremden Wolfsrevieren). Die Hunde achten nur auf andere Hunde. Stirbt ein Wolfsrudel an der
  Staupe, übernehmen die Hunde den Platz, und die Wölfe finden keinen mehr.
- **Krankheit (Staupe):** Die Hunde tragen sie, erkranken aber nicht. Jeden Tag steckt sich jeder
  gesunde Wolf mit 3 % an, wenn ein Hunderudel näher als 300 ist, und mit 3 % je krankem Tier im
  eigenen Rudel. Kranke Wölfe verbrauchen 0,02 Energie am Tag mehr, bekommen keine Jungen und
  sterben je Tag mit 1,5 % (Ursache „Krankheit“). Mit 0,6 % am Tag werden sie gesund und sind
  danach immun. Im Mittel ist ein Wolf etwa 50 Tage krank, gut zwei Drittel sterben daran. Beim
  ersten kranken Wolf erscheint die Folgekarte 🦠 „Wölfe erkranken“. Kranke Tiere tragen auf der
  Karte einen grünen Punkt.
- **Ziel:** Die Hunde rotten die Wölfe über mehrere Jahre aus. Ablauf (Insel 1000): Hunde verwildern
  in Jahr 5, die Staupe drückt die Wölfe in 5 Jahren von 100 auf 40, danach verdrängen die wachsenden
  Hunderudel sie Revier für Revier (Jahr 20: 14 Wölfe, Jahr 25: ausgestorben).
  Vorher starben die 2–3 Ausreißer auf 3 von 8 Inseln wieder aus, und wo sie lebten, blieben
  meist 5–15 immune Wölfe übrig. Jetzt verwildern 3–4 Hunde (`BT.HUMANS.dogs.escape`). Gemessen
  (`invasion.js 8 30`, Median gegenüber nur Landung):

  | Karten | Hunde etabliert | Wölfe ausgestorben | Hirsch | Laufvogel | Wolf | Adler |
  |---|---|---|---|---|---|---|
  | `hunde@1` vorher | 5 von 8 | 2 von 8 | 88 % | 53 % | 13 % | 7 % |
  | `hunde@1` | **8 von 8** | **8 von 8** (Jahr 24–29) | 68 % | 73 % | 4 % | 42 % |
  | `schafe@1,hunde@1` vorher | 6 von 8 (Schafe 2) | 3 von 8 | 85 % | 69 % | 21 % | 1 % |
  | `schafe@1,hunde@1` | **8 von 8** (Schafe 8) | **8 von 8** (Jahr 20–27) | 35 % | 74 % | 2 % | 23 % |

  Die Adler leiden mit: Solange Wölfe und Hunde zugleich jagen, fallen die Hirsche (und damit die
  Kälber) tief, und die wenigen Adler erholen sich davon oft nicht (mit Hunden auf 3–4 von 8
  Inseln ausgestorben). Ohne Karten unverändert (`balance.js 8 30`: 7 von 8, Hirsche 242, Wölfe 58).

## Ratten (Feld, keine Tiere)

Werte in `BT.RATS` (`js/eco/rats.js`), Karte „Ratten an Bord“ (`docs/MENSCH.md`, Schritt 6).

- **Vorbild:** Pazifische Ratte (Kiore), Wanderratte und Hausratte in Neuseeland. Auf Big South
  Cape Island (1964) waren wenige Jahre nach der Ankunft der Schiffsratten mehrere Vogelarten
  verschwunden. Nach Mastjahren gibt es Rattenplagen.
- **Ein Feld statt Tieren:** Eine Zahl je Weidezelle (wie die Nahrung), sonst wären es
  Zehntausende Tiere. Auf der Karte sind es gestreute Rattengruppen (`assets/ratten.png`, je Gruppe
  4 Ratten, höchstens 6 Gruppen je Zelle, aus der Ferne eine), sie wuseln etwas hin und her.
  Gerechnet wird ohne Zufall (außer bei Nestern und beim Fangen) und nur mit `+ - * /`.
- **Kommen mit der Karte:** 40 Ratten an der Küste des Dorfs, wenn das Vorratsschiff anlegt. Jede
  weitere Karte bringt 40 mehr. Zurücknehmen geht nicht („Ratten lassen sich nicht wieder einfangen“).
- **Lebensraum** (`habitat`, mal `max` 14 Ratten je Zelle): **Dorf 3** (Scheunen, Vorräte; dazu
  30 Plätze mehr je Zelle im Umkreis von 70 um jedes Haus: Dort drängen sie sich), **Acker 2**,
  Sumpf 0,9, Buschland 0,7, Farnwald 0,6, Strand 0,6, Moosnebelwald 0,5, Thermalfeld und Erde 0,2,
  **Wiese 0,15, Tussock 0,12** (offenes Grasland: keine Verstecke), Bergland 0,05, Gipfel 0. **Am
  Süßwasser mehr:** bis 40 vom Ufer oder Fluss bis 1,6-fach (nach außen abnehmend). Das kahle Gebirge
  bleibt rattenfrei, das Grasland fast (Rückzugsräume).
- **Nahrung:** Früchte und Samen, Insekten, Getreide (wie der Laufvogel, 0,1 / 0,11 / 0,1 Energie je
  Einheit), dazu **Aas** (eine Ratte frisst daran bis zum Doppelten ihres Bedarfs) und im Umkreis von
  70 um jedes Haus **Vorräte und Abfälle** (0,03 Energie je Zelle und Tag, auch im Winter). Bedarf
  0,0003 je Ratte und Tag (Laufvogel 0,055), im Winter mal 1 + 0,5 · Winterhärte, nicht im Dorf.
- **Acker:** Auf dem Acker frisst und verdirbt jede Ratte zusätzlich 0,08 Einheiten Getreide am
  Tag (`crop`). Gemessen über 10 Ernten (4 Inseln): ohne Ratten fehlen 46–62 % der Ernte (Hirsche,
  Laufvögel), mit Ratten 74–93 %. Ist mindestens ein Viertel weg und haben die Ratten den größten Teil
  gefressen, erscheint die Folgekarte 🐀 **Ratten im Getreide** statt „Hirsche im Acker“; die Ernte in
  der Chronik nennt den Anteil der Ratten. Mit 0,03 kaum zu spüren, mit 0,1 bis 100 % Verlust.
- **Anfressen und Verderben:** Zusätzlich zum Bedarf benagen Ratten Früchte (0,002) und Insekten
  (0,003 Einheiten je Ratte und Tag, `spoil`), ohne Energie davon zu haben. Das Fressen zählt wie
  anderes Fressen (Pflanzenzustand, Diagramm „Nahrung“). Vorher war der Anteil der Ratten an Früchten
  und Insekten nur etwa 3 % und in den Kurven nicht zu sehen. Mit 0,006 fielen die Laufvögel auf 43 %
  (gegenüber nur Landung), mit 0,003 auf 58 %, mit 0,002 auf 70 %.
- **Hütehunde im Dorf:** Im Umkreis von 70 um jeden Hütehund (`guard`) sterben je Tag 1,5 % der Ratten
  je Hund, bis höchstens 8 % (Todesursache „Dorfhund“). Ratten rücken von außen nach, sind dort aber
  dünner. Gemessen (`hunde@0,ratten@1`): im ersten Jahr nur 130–1 500 statt 1 700 Ratten, am Ende
  ähnlich viele; 50 % der Insel erreichen 3 von 8 Inseln statt 6 (mit 0,04 und höchstens 0,2 fast nie).
- **Vermehrung:** Junge je Ratte und Tag 0,1 (Frühling, Sommer), 0,06 (Herbst), im Winter keine;
  mal Futterlage, mal Platz in der Zelle (1 − Ratten / Kapazität). **Mastjahr** (Sommer und
  Herbst): 1,8-mal so viel Platz und 1,5-mal so viele Junge – eine Rattenplage. Grundsterblichkeit
  1,2 % am Tag, bei fehlendem Futter bis 12 % mehr. **Winter:** zusätzlich 2,5 % am Tag mal
  Winterhärte² (milder Winter etwa 0,8 %, harter Winter etwa 5,6 % am Tag), im Dorf ein Viertel davon.
  Ein harter Winter halbiert die Ratten draußen; am Dorf überwintern sie und ziehen im Frühling wieder
  los. Ende des Winters leben etwa halb so viele wie an der Spitze im Herbst, im Mastjahr wird es fast
  das Doppelte eines normalen Sommers.
- **Ausbreitung:** Je Tag wandern 20 % in die 8 Nachbarzellen (nach deren Lebensraum gewichtet),
  solange die Zelle weniger als halb voll ist anteilig weniger: Wenige bleiben beisammen. Dazu 30 %
  je Anteil über 70 % der Kapazität und bis 10 % bei Hunger. Weniger als 0,05 Ratten in einer Zelle
  verlaufen sich. Eine einzelne Ratte bleibt also in ihrer Gegend, aber die Front schiebt sich jedes
  Jahr einige Zellen weiter, über Grasland langsam. Vorher (20 % fest, mit Mindestzahl für Junge)
  blieben die Ratten jahrelang am Dorf oder starben aus.
- **Nester:** Je Tag frisst eine Ratte ein Ei mit 0,2 · d / (d + 6), ein Küken (bis 15 Tage alt) mit
  0,08 · d / (d + 6); d sind die Ratten in der Zelle. Ältere Laufvögel sind sicher. Todesursache der
  Küken „Ratte“. Adlerhorste bleiben verschont.
- **Beute:** Ratten sind leicht zu fangen und überall. Wölfe und Hunde (unter 90 % Energie) und
  Adler (unter 85 %) fangen beim Streifen Ratten in ihrer Zelle: je Tick und Jäger mit 0,8 (Adler
  0,7) · d / (d + 2), mal (1 − Deckung · 0,3), beim Adler mal (1 − Deckung · 0,5). Eine Ratte bringt
  0,08 Energie (ein Laufvogel 0,6). Gegenden mit vielen Ratten ziehen hungrige Räuber an. Am Horst
  bringt der Adler jede Ratte heim.
- **Chronik:** Folgekarte 🐀 **Rattenplage**, sobald Ratten auf einem Viertel der Insel leben.

Gemessen (`invasion.js 8 30 --karten=acker@0,ratten@1`, mittlere Insel, Mittel im letzten Drittel
gegenüber nur Landung, Median; mit Getreideschaden 0,05):

| Ratten (Ende des Sommers) | Spitze | Insel mit Ratten | Hirsch | Laufvogel | Wolf | Adler |
|---|---|---|---|---|---|---|
| Jahr 5: 1 200–2 200, Jahr 30: 9 000–14 000 | 11 000–22 000 (Mastjahr) | 25 % in Jahr 12–17, 50 % in Jahr 25–30 (auf 3 von 8 Inseln nie) | 78 % | 72 % | **120 %** | 100 % |

Die Wölfe bekommen 7–15 % ihrer Energie aus Ratten, die Adler 7–38 %. Ratten fressen 350–640 Eier und
300–420 Küken in 30 Jahren. Die Hirsche sinken, weil es mehr Wölfe gibt. Die Adler schwanken stark
(auf einer Insel ausgestorben, auf anderen viel mehr als ohne Ratten).

Vorherige Fassung (Lebensraum fast überall gleich, max 12, ohne Kälte und Mastjahr, Räuber
unter 80 % mit 0,04 Energie je Ratte): 19 000 Ratten auf 90 % der Insel, Laufvögel 44 %, Wölfe 105 %,
Adler 104 %; die Ratten waren gleichmäßig verteilt, der Winter kaum zu sehen. Ausprobiert:

- Bedarf 0,0012 (statt 0,0003), Räuber fangen wenig: Die Ratten fraßen den Laufvögeln das Futter
  weg (Laufvögel 28 %), Eier kaum (90 in 30 Jahren, weil im Frühling nach dem Winter wenige Ratten
  leben). Die Adler starben auf 8 von 8 Inseln aus, Ratten waren nur 1–2 % ihrer Energie.
- Adler fangen schon unter 80 % Energie mit 0,6: Adler 170 %, Laufvögel 34 % (zu viele Adler).
- Getreideschaden 0,1 und Adler mit Deckung 0,8: Ernte fast immer ganz weg, Adler 73 % (3-mal
  ausgestorben: Die Ratten leben jetzt vor allem im Wald, wo der Adler sie schlecht sieht).

## Scheu vor Menschen

Seit Stufe 3 (`docs/MENSCH.md`) gibt es Menschen auf der Insel. Um jedes Haus liegt eine Störung
(1 am Haus, 0 im Abstand 260). Wie stark eine Art sie meidet, steht in `scheu`. Gemieden wird,
wo `Störung · scheu ≥ 0,3` ist.

| Art | `scheu` | gemieden bis etwa | Begründung |
|---|---|---|---|
| Zwerghirsch | 1,0 | 180 ums Haus | Fluchttier, meidet alles Fremde |
| Inselwolf | 0,9 | 170 ums Haus | meidet Menschen, jagt dort nicht |
| Inseladler | 0,5 | 100 ums Haus | überfliegt das Dorf, jagt aber nicht direkt daneben |
| Laufvogel | 0,2 | nie | **inselzahm**: kennt keine Menschen (Vorbild Dodo, Takahē) |
| Schaf | 0,6 | 130 ums Haus | verwildert scheu (vorher 0,4: 65 ums Haus, dort wurden sie erlegt) |
| Hund | 0,3 | nie | Haustier |

Ohne Menschen hat `scheu` keine Wirkung.

**Jagd** (`docs/MENSCH.md`, Schritt 7; Werte in `BT.HUMANS.hunt`, `js/eco/humans.js`): Jäger
ziehen auf Jagdzüge (bis 12 Tage, bis 1000 vom Dorf, jede weitere Karte derselben Sorte 30 %
weiter) und schießen aus 90 Einheiten. Die Arten selbst bleiben unverändert; wie sie auf Jäger
reagieren, folgt aus `scheu`:

| Art | gejagt von | Treffer je Schuss | Verhalten |
|---|---|---|---|
| Zwerghirsch | Wildjäger (Gewicht 1) | 0,4 × 0,6 | `scheu` ≥ 0,5: flieht, wenn ein Jäger näher als 0,4 × `vision` (72) ist |
| Laufvogel | Wildjäger (1) | 0,4 | **flieht nicht** (`scheu` 0,2, inselzahm), deshalb die häufigste Beute |
| Schaf (wild) | Wildjäger (1) | 0,4 × 0,6 | flieht wie der Hirsch (`scheu` 0,6) |
| Inselwolf | Wolfsjäger (1) | 0,55 | beschossen flieht das Rudel 300 weit; Wolfsjäger folgen ihm |
| Hund (wild) | Wolfsjäger (1) | 0,55 × 0,15 | **kennt die Jäger** (`wary` 0,15): siehe unten |

Treffer bis Oktober 2026: Wildjäger 0,5, Wolfsjäger 0,7.

**Hunde kennen die Jäger** (`BT.HUMANS.hunt.wary`, 0,15): Ein Jäger findet ein Hunderudel je
Jagdzug nur mit 15 %, trifft es mit 0,15 × 0,55, und nach dem ersten Schuss verliert er die Spur.
Die Hunde fliehen dabei nicht aus ihrem Revier und greifen Jäger nur mit 15 % der Chance an.
Begründung: Ein Rudel von etwa 10 Hunden bekommt rund 4 Welpen im Jahr; die Wölfe (50–80)
verkraften die Jagd, ein einzelnes Hunderudel nicht. Mit den Wolfswerten (und auch noch mit
Treffer × 0,5) erschossen die Wolfsjäger alle Hunde gleich nach der Schonfrist; jeder Schuss
trieb das Rudel 300 weit weg, und die Jäger folgten ihm, bis die Hunde verhungerten.

Wildjäger nehmen, **was sie zuerst sehen**: Kommt unterwegs eine Gruppe Hirsche oder Laufvögel
näher als 160 und näher als ihr bisheriges Ziel, jagen sie diese – aber erst ab einem Abstand
vom Dorf, der je Jagdzug neu gewürfelt wird (0–500): mal jagen sie am Dorf, mal weit draußen. Weil die Hirsche das Dorf
meiden und die Laufvögel nicht, sind das am Dorf meist Laufvögel. Treffer jeweils mal
`1 − Deckung × 0,5`. Wildjäger bringen ein Tier heim, ein Viertel bleibt als
Aas liegen (für Wölfe und Adler). Wolfsjäger jagen weiter, bis der Jagdzug um ist. Todesursache
ist „Jagd“.

**Wölfe gegen Jäger:** Ein hungriges Wolfs- oder Hunderudel (Energie unter `hungry`) greift einen
Jäger an, der ihm näher als 50 kommt, mit 8 % je Tick, mit Beute auf der Schulter mit 16 %. Wildjäger
sterben dabei zu 30 %, der Wolf zu 40 %; sonst gehen beide auseinander, und die Wölfe nehmen die
Beute mit. **Wolfsjäger rechnen damit:** Sie sterben nur zu 5 %, der Wolf zu 85 %. Danach flieht das
Rudel. Hunde greifen nur mit 15 % dieser Chance an (`wary`). Tote Jäger ersetzt das Dorf im nächsten Frühling.

**Sammler** (Karte „Sammeln“, `BT.HUMANS.gather`): nach demselben Prinzip wie die Jäger, 6 je Karte (vorher 2).
Je Gang wird gewürfelt, wie weit sie hinausgehen (0–500); ab dort pflücken sie, wo sie zuerst
Früchte und Samen finden (mindestens 0,5 je Weidezelle), 3 je Tick aus der Zelle und ihren
Nachbarn, bis sie 60 tragen (3 Körbe) oder 10 Tage um sind. Die Früchte fehlen den Laufvögeln
(und den Wölfen, die nebenher Früchte fressen). Hungrige Wölfe greifen auch Sammler an; die haben
keine Waffen: Der Sammler stirbt zu 40 %, der Wolf nur zu 5 %. Hirsche fliehen vor Sammlern wie
vor Jägern.

**Nutzung** (`docs/MENSCH.md`, Schritt 2): Auf gerodeter **Erde** wächst nichts, und es gibt keine
Deckung (Lebensraumwert Hirsch und Laufvogel 0,1). Nach 3 bis 5 Jahren wird sie zur **Wiese**:
Gras 8,8, Laub 0,88, Früchte 0,55, Insekten 1,65; Lebensraumwert Hirsch 1,0, Laufvogel 0,6,
Wolf und Adler 1. Das **Dorf** trägt keine Nahrung.

**Acker** (Schritt 3): trägt nur **Getreide** (Kapazität 14, Wachstum 0,2 aus der Saat 0,1;
Jahreszeiten 1,4 / 1,1 / 0 / 0; geerntet am ersten Herbsttag). Der Zwerghirsch frisst es
(Energie 0,14) und kennt die Äcker; Lebensraumwert Acker: Hirsch 1,0, Laufvogel 0,4, Wolf 0,8,
Adler 1. Nachts sinkt die Störung um die Häuser auf 40 %.

## Was das Ökosystem stabil hält

Diese Mechanismen sind bewusst eingebaut, weil sie auch in der Natur stabilisieren. Ohne sie
stirbt in der Simulation fast immer eine Art aus.

1. **Reviere:** Räuber ohne Revier dürfen nicht in fremden Revieren jagen und bekommen keinen
   Nachwuchs, volle Rudel auch nicht. Das begrenzt die Zahl der Räuber auf die Zahl der Reviere.
2. **Suchbild (Holling Typ III):** Wird eine Beuteart selten, wird sie seltener gewählt und
   seltener verfolgt. Die Räuber hungern dann, bevor die Beute verschwindet. Jedes Rudel und
   jedes Adlerpaar zählt dazu einmal am Tag, wie viele Tiere jeder Beuteart es im Blick hat
   (Deckung verbirgt sie), und mittelt über etwa 20 Tage. Sieht es weniger als `scarce` Tiere je
   100 × 100 Sichtfläche (Zwerghirsch 1,3, Laufvogel 0,5, Schaf 0,9), sucht es nur noch halb so
   gezielt nach dieser Art, bei sehr wenigen kaum noch. Die Räuber kennen also nur ihre Umgebung,
   nicht den Bestand der Insel: Ein Rudel in einer beutereichen Gegend jagt weiter, eines in einer
   leergefressenen nicht. Die vergebliche Suche nach seltener Beute kostet
   einen Tag – sonst würde ein hungriger Räuber es einfach gleich wieder versuchen.
   Früher hing die Schwelle am Bestand der ganzen Insel, gemessen am Startbestand (Hirsch 60 %,
   Laufvogel 120 %); das konnte kein Tier wissen. Ganz ohne diese Bremse fressen die Wölfe die
   Hirsche in 15–20 Jahren leer und die Adler die Laufvögel in 8 Jahren (große Insel).
   **Hunger macht unwählerisch:** Unter Energie 0,5 zählt das Suchbild bei der Wahl der Beute
   immer weniger, unter 0,25 gar nicht mehr – ein ausgehungerter Wolf greift jeden Hirsch an, den
   er sieht (und nimmt auch Laufvögel). Dafür **gelingt die Jagd ohne Suchbild seltener**
   (Jagderfolg mal Suchbild): Übrig sind die vorsichtigsten Tiere, und dem Räuber fehlt die Übung.
   Nur „Hunger macht unwählerisch“ allein kippte die Insel (mittlere Insel: auf allen 8 Inseln
   starb eine Art aus), weil die Räuber gerade bei wenig Beute immer hungrig sind. Mit beidem:
   große Insel 16 × 60 Jahre alle Arten 15 von 16 (Wölfe einmal in Jahr 49), Hirsche 419,
   Laufvögel 511, Wölfe 86, Adler 28; nur Hirsch und Wolf 8 von 8; mittlere Insel 8 × 30 Jahre
   7 von 8 (Adler einmal), Hirsche 241, Laufvögel 303, Wölfe 55, Adler 14.
   **Partnersuche:** Ein wandernder Wolf sucht Rudel, denen ein *erwachsenes* Tier seines
   Geschlechts fehlt (vorher zählten auch Junge: Ein Rudel ohne erwachsenes Weibchen, aber mit
   junger Tochter, wurde nie gefunden). Ausprobiert und verworfen: Wanderer besetzen allein ein
   freies Revier und warten dort auf einen Partner (Wölfe öfter ausgestorben, die Einzelnen
   blockieren Reviere für Paare).
   Stand mit Nebenkost, Führungszeit der Adler und Welpen ab 45 % (große Insel, 16 × 100 Jahre):
   alle Arten 14 von 16 (Wölfe einmal in Jahr 82, Adler einmal in Jahr 84), Hirsche 370, Laufvögel
   532, Wölfe 85, Adler 24. `balance.js 8 30`: 7 von 8 (Wölfe einmal in Jahr 29), Hirsche 242,
   Laufvögel 339, Wölfe 58, Adler 12.
   Über 100 Jahre (große Insel) nachgeprüft, ohne Verbesserung: Suchbild-Schwelle Hirsch 1,0/1,1,
   Laufvogel 0,45, milderer Erfolgsabzug (50 %, 75 %; auch nur für Adler), kürzeres Gedächtnis
   (10 Tage), später verzweifelt (0,35/0,15), steilere Kurve (s⁴). Stärkere Räuber fressen die
   Beute im Hoch weiter herunter und verhungern im Tal; schwächere erholen sich aus Tälern nicht.
3. **Rückzugsräume:** Im Wald werden Beutetiere schlechter entdeckt und erwischt.
4. **Aas:** Verhungerte Tiere und Reste von Rissen ernähren die Räuber in schlechten Zeiten.
5. **Fortpflanzung je nach Futterlage:** Hungrige Räuber bekommen keinen Nachwuchs.
6. **Inselgröße:** Auf einer kleinen Insel sind die Räuberbestände so klein, dass Pech reicht,
   um sie auszulöschen.
7. **Allesfresser-Räuber:** Der Inselwolf überbrückt magere Winter mit Insekten und Früchten.
8. **Futterlage bei den Pflanzenfressern:** Wird das Gras knapp, bekommen die Hirsche weniger Kälber.
   Dadurch bleiben sie unter dem Kahlfraß, auch wenn die Wölfe an der Zahl ihrer Reviere anstoßen.

## Wozu die Räuber da sind

Das System ist so gebaut, dass es **nur mit allen Arten zusammen** funktioniert. Weiden und
Insektenbestände können übernutzt werden und erholen sich dann jahrelang nicht.

- Ohne Wölfe vermehren sich die Hirsche, bis sie ihre Weiden zerstören.
- Ohne Adler (und Wölfe) vermehren sich die Laufvögel zunächst stark und schaden den Insekten.
  Seit sich verarmte Gegenden erholen können, bleiben danach aber mehr Laufvögel als mit Räubern.

Vergleich (mittlere Insel; Mittel ab Jahr 11; mit Räubern 16 Inseln über 150 Jahre, ohne 8 über 60):

| | mit Räubern | ohne Räuber |
|---|---|---|
| Zwerghirsche, Spitze in Jahr 1–5 | etwa 200 | etwa 650 (Massenvermehrung) |
| Zwerghirsche, ab Jahr 11 | etwa 140, schwankend | etwa 160, viele sterben an Hunger |
| Laufvögel, Spitze in Jahr 1–5 | etwa 400 | etwa 590 (Massenvermehrung) |
| Laufvögel, ab Jahr 11 | etwa 300–320 | etwa 350 |
| Zustand Grasland (`balance.js 8 30`) | etwa 87 % | etwa 22 % |

Ohne Räuber verläuft es wie auf dem Kaibab-Plateau: erst viel mehr Pflanzenfresser, dann
kahl gefressene Weiden, ausgeräumte Böden und Hungersnot. Die Insel bleibt danach verarmt, weil
die übrigen Tiere Weiden und Böden nie lange genug schonen.

Mit Räubern sieht man eine **Kaskade**: Werden die Wölfe in einem Jahr knapp, steigen die
Hirsche, das Grasland leidet. Erholen sich die Wölfe, sinken die Hirsche, und die Weiden heilen
über Jahre. Stirbt das Wolfsrudel aus, kippt die Insel in den kahlen Zustand. Ebenso hängen
Adler, Laufvögel und Insekten zusammen.

## Abstimmung (Stand)

**Suchbild statt Inselbestand.** Der Beutewechsel hing am Bestand der ganzen Insel (gemessen am
Startbestand). Das kann kein Tier wissen. Jetzt zählt jeder Räuber selbst, wie viel Beute er im Blick
hat (siehe Was das Ökosystem stabil hält, Punkt 2). Die Schwellen sind so gewählt, dass ein Rudel
bei den alten Schwellen im Mittel gleich viel sieht (gemessen auf der großen Insel: bei 300 Hirschen
hat ein Wolfsrudel etwa 22 im Blick). Dazu: Wölfe nehmen Laufvögel mit Gewicht 0,13 statt 0,15. Mit
dem alten Faktor lagen sie fast immer unter der Mindestschwelle 0,12; mit dem Suchbild jagten sie in
vogelreichen Gegenden mit und nahmen den Adlern die Beute (Adler auf der mittleren Insel 9 statt 20).
Das Suchbild zählt die ganze Herde, auch wenn der Räuber nur Jungtiere nimmt (Adler und Kälber).

| große Insel, 60 Jahre | alle Arten überleben | Hirsche | Laufvögel | Wölfe | Adler |
|---|---|---|---|---|---|
| vorher (16 Inseln) | 15 von 16 (Wölfe 1-mal aus) | 379 | 446 | 81 | 34 |
| **Suchbild (16 Inseln)** | **16 von 16** | 412 | 474 | 81 | 32 |
| ganz ohne Beutewechsel (2 Inseln) | 0 von 2 (Laufvögel nach 8 Jahren) | | | | |
| nur Hirsch und Wolf, Suchbild (8) | 8 von 8 | 406 | – | 85 | – |
| nur Hirsch und Wolf, ohne Beutewechsel (2) | 0 von 2 (Hirsche bzw. Wölfe nach 15–20 Jahren) | | | | |
| nur Laufvogel und Adler, vorher (8) | 7 von 8 | – | 491 | – | 29 |
| nur Laufvogel und Adler, Suchbild (8) | 7 von 8 | – | 530 | – | 31 |

(Mittel ab Jahr 10, Seeds 1000–1015.) `balance.js 8 30`: 8 von 8, Hirsche 274, Laufvögel 306,
Wölfe 64, Adler 19 (vorher 8 von 8; 244, 279, 53, 20). Laufvogel-Schwelle 0,45–0,6 ausprobiert:
höher verhungern die Adler langsam neben vielen Laufvögeln, niedriger schießen sie hoch und brechen ein.

**Mit Schafen noch offen** (Stand vor dem Suchbild): Über lange Zeit sterben die Wölfe mit Schafen
deutlich öfter aus, auch auf der großen Insel (8 Inseln × 60 Jahre: 4-mal, ohne Schafe 1-mal;
mittlere Insel 16 × 80 Jahre: 9-mal, ohne Schafe 4-mal). Ablauf: Die Schafe wachsen in wenigen Jahren
auf 400–500, fressen das Gras kahl (Zustand 97 % → 16 %) und brechen ein; die Wölfe hatten sich an
ihnen vermehrt und verhungern im Tal danach. Das Gras erholt sich jahrzehntelang nicht, die Hirsche
bleiben bei 100–150. Eine strengere Lämmerbremse (40/10 bis 50/20 %), `scarceMin` 20, 1 Lamm oder
leichter zu jagende Schafe halfen nicht.

**Große Insel, sichtbare Zyklen** (Ziel: 300–500 Hirsche und rund 100 Wölfe auf der **großen**
Insel; Wolf und Hirsch sollen gegeneinander schwingen wie Adler und Laufvogel). Vorher (Stand
unten) waren es auf der großen Insel 808 Hirsche und 203 Wölfe. Die Wölfe schwankten kaum
(Schwankung 0,11, Adler 0,34), weil sie fast immer an der Zahl der Reviere anstießen. Geändert:

- Gras 13 statt 20: weniger Hirsche, weniger Wölfe. Dann begrenzt die Beute die Wölfe, nicht das Revier.
- Beutewechsel bei Hirschen schon bei 60 % des Startbestands (vorher 120 %). Seit dem Startbestand von 300 lag
  die Schwelle sonst bei 640 Hirschen (große Insel): Die Wölfe hielten die Hirsche schon bei
  hohen Beständen für knapp und dämpften jede Schwingung. Das war der wichtigste Schritt für die Zyklen.
- Weniger Kälber erst ab 65 % statt 80 % Füllstand (keine Kälber bei 30 %), damit die
  Hirsche eher von den Wölfen als vom Futter begrenzt werden.
- Hirsch 3 Energie statt 3,5, Wolf verbraucht 0,052 statt 0,042: weniger Wölfe je Hirsch.

Gemessen mit Quartalswerten ab Jahr 5. Schwankung = Standardabweichung durch Mittel. „Folgen“ =
größte Korrelation des Räuberbestands mit dem Beutebestand einige Jahre vorher.

| große Insel, 8 × 30 Jahre | Hirsche | Wölfe | Schwankung H / W | Wölfe folgen | Laufvögel | Adler |
|---|---|---|---|---|---|---|
| nur Hirsch und Wolf | 449 | 105 | 0,30 / 0,31 | 0,91 nach 3,5 J | – | – |
| alle 4 Arten | 459 | 104 | 0,29 / 0,32 | 0,88 nach 3,3 J | 498 | 41 |
| alle 4, 60 Jahre (Seed 5000) | 470 | 95 | 0,33 / 0,38 | 0,86 nach 3,8 J | 530 | 41 |

Laufvogel und Adler zum Vergleich: Schwankung 0,26 / 0,34, die Adler folgen mit 0,78 nach 3,9 Jahren.
Alle Arten überleben auf der großen Insel 8 von 8 (auch über 60 Jahre). Die Zyklen sind lang
(Hirsche oft 15–20 Jahre von Hoch zu Tief und zurück).

Mittlere Insel (`balance.js 8 30`): 7 von 8, Hirsche 248, Wölfe 42, Laufvögel 291, Adler 18. Auf
Insel 16838 sterben die Wölfe in Jahr 20 aus: Mit stärkeren Schwingungen reicht auf kleinerer
Fläche ein tiefes Tal. Kleine Insel: 3 von 6 (vorher 1 von 6).

Ausprobiert: Rudel bis 8 statt 12 (Wölfe kaum weniger, schwächere Zyklen); Hirsch 2,5 Energie
(nur 80 Wölfe bei 300 Hirschen).

**Viele Hirsche und viele Wölfe** (vorheriger Stand; Ziel war damals irrtümlich die mittlere Insel).
Vorher kamen auf einen Wolf nur 3–4 Hirsche (~117 Hirsche, ~27 Wölfe). Der Wolf lebte zu 42 % von
Insekten und Früchten, seine Zahl hing kaum an den Hirschen. Geändert:

- Durst abgeschaltet (siehe Wasser), mehr Grasland, Gras 20 statt 11, Hirsch 3,5 Energie statt 1,5,
  Startbestand Hirsch 300 und Wolf 40.
- Wolf: Nebenkost vor allem im Winter (`dietSeason`), Rudel bis 12. Kleinere Reviere (300, 340)
  brachten zu viele Rudel; die Wölfe schossen dann auf über 200 und brachen ein.
- **Weniger Kälber bei knapper Weide** (`breed.food`): Das war der entscheidende Schritt. Stoßen die
  Wölfe an die Zahl der Reviere, können sie nicht mehr Hirsche reißen. Ohne die Bremse wuchsen die
  Hirsche dann bis zum Kahlfraß.
- Herden ziehen weiter, bevor die Weide überweidet ist (35 % der vollen Menge). Vorher galt eine
  feste Menge (0,4 Energie), die bei höherer Kapazität weit unter der Schwelle der Überweidung lag:
  Mehr Gras führte zu mehr Überweidung.
- Rudel bewachen ihren Riss gegen Adler (sonst Adler 28, Laufvögel 212).
- Verworfen: Hungernde Pflanzenfresser fliehen nur vor Räubern, die sie jagen, und fressen auf dem
  Weg zum Wasser. Die Hirsche schwankten stärker (bis 950), das Gras litt (67 % statt 89 %).

Ergebnis `balance.js 8 30`: alle Arten 8 von 8. Mittel ab Jahr 10: Hirsche 450 (Spanne der Inseln
219–720), Laufvögel 250, Wölfe 121, Adler 21; Zustand Gras 72 %. Ohne Räuber (`--ohne=inselwolf,inseladler`):
Hirsche 248, Gras 24 % (Kaibab). Über 60 Jahre (8 Inseln ab Seed 5000): Hirsche 346, Wölfe 101 (nie
ausgestorben), Laufvögel 301, Adler 15; die Adler sterben auf 2 von 8 Inseln aus. Mit Karten
(`--karten=schafe@1,hunde@1`, 4 Inseln, 20 Jahre) sinken die Wölfe auf ~55.

Älter:

**Räuber über 150 Jahre** (16 Inseln, Seeds ab 1000 und 5000):

- Mehr Reviere (Reviermitten näher, `spacing` 0,75) oder kleinere Reviere (280/250) machten es
  schlechter: Die Räuber wuchsen anfangs auf ~50 Wölfe, fraßen zu viel und brachen ein
  (alle Arten 0 bzw. 1 von 8 statt 3 von 8). Die Zahl der Reviere ist nicht der Engpass.
- Die schleichende Verarmung der Insekten behoben (siehe Übernutzte Insekten). Danach waren die
  Wölfe stabil (7 von 8), aber die Adler schossen über: mehr Laufvögel, Adler von 12 auf 26, dann
  Laufvögel von 300 auf 96 und Zusammenbruch.
- Beutewechsel bei Laufvögeln wie bei Hirschen erst unter 120 % des Startbestands: Die Adler
  hungern, bevor sie die Laufvögel leer fressen. Mit 160 % starben die Wölfe häufiger, weil
  die zahlreicheren Adler ihnen die Hirschkälber wegfraßen; deshalb nehmen Adler Kälber jetzt nur
  selten (0,25 statt 0,6).
- Ergebnis: über 100 Jahre alle Arten 11 von 16, Wölfe 13, Adler 14 (vorher 9, 14, 10). Über
  150 Jahre alle Arten 7 von 16, Wölfe 12, Adler 8. Die Adler sterben meist erst nach Jahr 100
  aus, wenn nur noch wenige Paare übrig sind. Auf Insel 8919 sterben die Wölfe in jeder bisher
  getesteten Fassung aus.
- `balance.js 8 30`: 6 von 8.


**Mehr Beute, stabilere Räuber** (Ziel: Räuber halten die Pflanzenfresser deutlich unter dem,
was das Futter trägt, und überleben auch 100 Jahre). Vorher trug das Futter nur ~120 Hirsche, und
unter ~100 Hirschen jagten die Wölfe kaum noch Hirsche (Beutewechsel bei 80 % des Startbestands).
Die Wölfe lebten damit in einem schmalen Band und hatten kaum Einfluss: Mittel 99 Hirsche mit
Räubern, 119 ohne. Geändert:

- Fehler behoben: Wolfs-Wanderer desselben Geschlechts bildeten Trupps, die nie Junge bekamen
  (siehe Inselwolf, Abwanderung). Das allein senkte die Hirsche mit Räubern auf ~76.
- Gras × 2, Laub × 1,6; Beutewechsel bei Hirschen erst unter 120 % des Startbestands.
- Adler: 1–3 statt 2–3 Eier (vorher schossen sie in guten Jahren auf 24 Tiere hoch, fraßen die
  Laufvögel leer und verhungerten), Jungadler geschickter (0,85 statt 0,6), weniger Konkurrenz
  (0,25 statt 0,4).

Ergebnis über 100 Jahre (16 Inseln, `run.js` mit Seeds ab 1000 und 5000): Wölfe überleben 14-mal,
Adler 10-mal, alle Arten 9-mal (vorher über nur 60 Jahre 5 von 8, Wölfe 7, Adler 5).
`balance.js 8 30`: 6 von 8. Auf einer Insel rotten die Wölfe die Hirsche aus (Jahr 17).

Verworfen: Zwillinge bei Hirschen (starke Räuber-Beute-Zyklen, Hirsche 20–600), Beutewechsel
erst bei wenigen Hirschen (Wölfe drücken die Hirsche auf 20–40 und verhungern dann), Wölfe mit
1–3 Welpen, Adler mit weniger Verbrauch (0,025: sie vermehren sich stärker und brechen ein).

Offen: Die Adler sind der schwächste Teil. Sie sterben langsam aus, wenn das Geschlechterverhältnis
durch Zufall kippt (am Ende ziehen nur noch Weibchen oder nur Männchen umher), oder nachdem
Hirsch-Booms die Büsche verbissen haben (weniger Früchte, weniger Laufvögel). Ohne Räuber
pendeln sich die Hirsche nach dem Boom bei ~160 ein, statt stark zu schwanken.


**Floater, Konkurrenz, Partnersuche** (48 Inseln, gleiche Läufe wie unten):

- alle Arten überleben: 42 von 48 (wie vorher); Adler sterben aus: 4-mal (wie vorher), alle erst
  nach Jahr 16, meist nach Jahr 27
- Adler im Mittel 13–16, Laufvögel 230–250, Zustand der Insekten 89–93 %
- Größere Adlerreviere (400 statt 330) oder stärkere Konkurrenz (0,7) brachten keine Verbesserung,
  die Unterschiede lagen im Zufallsrauschen.
- Die Simulation ist chaotisch: Ob eine Art auf einer Insel ausstirbt, hängt stark vom Zufall
  ab. Unterschiede von 1–2 Läufen in 48 sind kein Beleg.

**Horst-System der Adler** (48 Inseln über 30 Jahre: `balance.js 8 30`, `16 30 --seed=5000`,
`24 30 --seed=9000`; vorher → nachher):

- alle Arten überleben: 42 → 43 von 48; Adler sterben aus: 4 → 4-mal (kein messbarer Unterschied)
- Adler im Mittel ab Jahr 10: 12 → 13–15; Laufvögel 260 → 250–256; Zustand der Insekten
  80 % → 88 % (Standardlauf); Hirsche 127 → 95 (Standardlauf, die übrigen Läufe ~105 wie vorher)
- Erste Fassung (Küken ohne Mehrbedarf): Die Adler verdoppelten sich in 3 Jahren, fraßen die
  Laufvögel herunter und brachen ein. Erst seit der Bruterfolg vom Futter abhängt, bleibt es ruhig.
- Junge Adler ohne Revier überall jagen lassen (nur der Kern um den Horst verteidigt) war deutlich
  schlechter: Die Adler starben in 12 von 24 Läufen aus.

Älterer Stand:

`node tools/balance.js 8 30` rechnet 8 Inseln über 30 Jahre:

- mittlere Insel: in 7 von 8 Läufen überleben alle vier Arten (vorher 6 von 8). Mittlere
  Bestände ab Jahr 10: Hirsche ~127 (schwankend etwa 35–370), Laufvögel ~260, Wölfe ~20 (vorher
  13), Adler ~12. Die Wölfe reißen mehr Hirsche, die Weiden bleiben dadurch gesünder (Gras 87 %
  statt 73 %); auf gesunden Weiden kommen aber auch mehr Kälber durch, deshalb sinkt die mittlere
  Hirschzahl kaum.
- Hungrigere Adler (Verbrauch 0,035–0,045) verhungerten in den Tests, sobald sie die Laufvögel
  dezimiert hatten. Stärker wirken sie deshalb über den Jagderfolg (0,22 → 0,3), nicht über Hunger.
- kleine Insel (`--size=klein`): wie vorher nur in 1 von 6 Läufen; meist sterben die Wölfe
  nach 8–29 Jahren aus, in 2 Läufen rotten die stärkeren Wölfe zuvor die Zwerghirsche aus
  (vorher 1). Die kleine Insel ist zu klein für stabile Räuberbestände.
