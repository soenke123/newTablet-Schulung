# Nebeltal (MPSkill, Migration 0290, Prototyp, nur Admins)

Wie lernt ein neuronales Netz? Man sucht im Nebel den tiefsten Punkt einer
3D-Landschaft und sieht nur die Stelle, an der man steht. Höhe = Fehler,
Position = Gewichte, Bergab-Pfeil = (negativer) Gradient, Sprungweite = Lernrate.

## Dateien

- `index.html` – Oberfläche (HUD, Menü, Karten), Farben wie MPSkills, Hell/Dunkel vom Rahmen
- `js/welt.js` – Landschaften: `hills(seed, level)` (Mulden = lokale Minima, Rand ringsum; Größe und
  Schwierigkeit je Level in `CFG`: Level 1/2 W 85 mit ~20 Mulden, die tiefste schmal und abseits
  der Mitte; Level 3 W 50),
  `model(seed)` (Fehler einer Geraden y = w·(x−5) + b durch 9 Messpunkte; Schritte in w/b,
  Höhe gestaucht mit 1−e^(−L/L0), Richtung bleibt gleich),
  `penguins(seed)` (Level 5: echte Palmer-Penguins-Daten CC0, 68 Adelie + 68 Zügel, Schnabellänge/-höhe
  standardisiert, Sigmoid-Neuron ohne Bias, Höhe = Log-Fehler gestaucht, Gewichte ±20, Tal bei
  w ≈ (15,2 | −4,6) mit 1 Fehler; Seed wählt nur den Start, Daten bleiben gleich),
  `xor(seed).one()` / `.two()` (Level 6/7: Treppenhaus-Licht = XOR, Schalter ±1; one = ein Neuron
  σ(w₁S1 + w₂S2), Tal in der Mitte = überall 50 %; two = Neuronen A/B mit festem Bias −3, Lampe
  σ(8A + 8B − 5), lernbar a₁ a₂ b₁ b₂ ±8, `h(k, x, z, andere)` = Schnitt; ~80 % der Welten lernen
  es mit Lernrate 4 in 40 Schritten, ~20 % bleiben bei 3 von 4 hängen – gewollt, s. Ergebnistext)
- `js/netz.js` – kleine Netze IMMER ganz zeichnen (`NTNetz.draw`): Kanten mit Zahl, Farbe = wer sie
  bewegt (orange Welt A, violett Welt B, grau gestrichelt = fest), Dicke = Größe; `NTNetz.lights` =
  Wahrheitstabelle mit Schaltern und Lampen (Spalten A/B optional)
- `js/zwei.js` – Level 7 komplett: zwei Canvas/zwei NTGrafik (quer nebeneinander, hoch übereinander),
  Kamera fest (rechts = erstes Gewicht größer, oben = zweites), Hälfte ziehen = Figur dieser Welt
  (zwei Daumen/zwei Personen), WASD = A, Pfeile = B, Leertaste = Lernschritt; Schnitt der einen
  Welt wird neu gebaut, wenn die andere Figur ≥ 0,25 läuft (alle 120 ms, Gitter 84², Sparmodus 56²,
  feste Farbskala `hRange`); Pfeil je Welt = ihr Anteil am 4D-Gradienten; ein Lernschritt springt
  beide. spiel.js übergibt über `openTwo` (S.state 'zwei' = spiel.js zeichnet nicht) und bekommt
  card/toMenu/stars zurückgereicht
- `js/grafik.js` – reines WebGL 1 ohne Bibliothek (CSP/Datenschutz): Gitter, Kugel/Kegel/Kasten,
  Nebel hängt an der Figur (uFogR), nicht an der Kamera; Höhenlinien im Shader
- `js/spiel.js` – Ablauf menu → intro → play → reveal → result, Steuerung, Lernkurve, Modell-Diagramm
- `tool.js`/`tool.css` – nur der iframe-Rahmen (wie Reinforce Yourself), noch kein Austausch mit dem Raum

## Level

1. **Im Nebel** – große Welt, frei laufen (Joystick links / WASD), 75 s, NUR Höhenmesser:
   Boden einfarbig ohne Höhenlinien (`plain`, Shader-Uniform uPlain, Farben kommen erst beim
   Auflösen), keine Hang-Physik (`physics: false`: gleich schnell bergauf/bergab, kein Rutschen).
2. **Der Bergab-Pfeil** – gleich große Welt, Pfeil unter den Füßen + Farben/Höhenlinien +
   Hang-Physik (bergauf langsamer, steile Hänge rutschen), 60 s.
3. **Sprünge** – kein Laufen mehr: Sprung in Pfeilrichtung, Weite = Lernrate × Steilheit
   (echter Gradientenschritt – an flachen Stellen also kürzer bei gleicher Lernrate; die Rechnung
   steht live unter dem Regler, `#lrDist`), 20 Sprünge (= begrenzte Rechenzeit; ohne Grenze wäre
   eine winzige Lernrate nie ein Problem), Ring = Landepunkt, zu weit = aus der Welt.
4. **Die Sonnenblume** – ein Neuron OHNE σ (Höhe = w · Woche + b) sagt eine Zahl voraus; Welt =
   sein Fehler (glatte Schüssel). Rechts `#modelBox`: Mini-Neuron (`#mnet`) + Gerade über den
   Messpunkten. Laufen + „Training starten“ (30 Schritte). Ab Lernrate ≈ 0,15 explodiert es –
   Lernziel hier ist die Lernrate.
5. **Pinguine sortieren** – die Welt ist der Fehler EINES Neurons, das Adelie- und Zügelpinguine
   trennt (x = w₁ Länge, z = w₂ Höhe). Laufen UND Springen/„Training starten“ (`walk: true` im
   Sprung-Level), 40 Schritte, Lernrate 0,2–50 (ab ≈ 35 fliegt man raus). Rechts `#pengBox`:
   Mini-Neuron (Kantendicke/-farbe = Gewicht) + „Bild A“ (Messpunkte, Hintergrund = Ausgabe,
   Linie = 50 %, falsch sortierte rot umkreist) – live beim Laufen. Wertung nach falsch sortierten
   Pinguinen. Richtung vom Mittelpunkt = Winkel der Trennlinie, Abstand = Sicherheit; falsche Seite
   ist eine flache Hochebene, die richtige eine lange Rinne.
6. **Das Treppenhaus-Licht** – ein Neuron soll die Wechselschaltung (XOR) lernen und kann es nicht:
   tiefster Punkt = Mitte, überall 50 %. Rechts `#xorBox`: Neuron + vier Fälle mit Lampen. Wertung:
   wie nah am (unvermeidlichen) Minimum.
7. **Zwei Neuronen, zwei Welten** – `js/zwei.js`: Welt A = Kanten in Neuron A, Welt B = Kanten in
   Neuron B; beide Figuren immer auf derselben Höhe (ein Netz), die Welt der einen verbiegt sich,
   wenn die andere läuft. Mitte oben `#zPanel`: das ganze Netz + Tabelle mit A/B-Werten. Wertung:
   4 von 4 richtig (3 Sterne bei Fehler < 0,15); bei 3 von 4 erklärt das Ergebnis „beide haben
   dasselbe gelernt“. Am Ende Flagge am tiefsten Punkt des jeweiligen Schnitts.

Ab Level 4 gilt überall: eine Welt = ein echtes Modell, das ganze Netz ist zu sehen, Laufen UND
Training im selben Level.

Am Ende jedes Levels lichtet sich der Nebel (Weg, Start, Flagge am tiefsten Punkt), dann
Sterne + „Und die KI?“-Text. Welt-Nummer (Seed 1000–9999) = gleiche Landschaft auf allen
Tablets → Klasse kann schon jetzt gegeneinander spielen. Sterne je Level und Welt in
localStorage `nt.best.<level>.<seed>`, Welt in `nt.seed`.

## Sparmodus

`LWMotion.low`: dpr 1 und 30 B/s; Glas-Kästen ohne Weichzeichner.

## Offen (nach dem ersten Ausprobieren ordnen)

- Klassen-Wettkampf über den Raum (Lehrkraft gibt Welt vor, Beamer zeigt alle Figuren, gemeinsames Auflösen)
- Schwung (Momentum), wackeliger Kompass (Mini-Batches), Lernrate unterwegs verkleinern
- Weitere Beispiel-Level: Ebbe und Flut (Welle, Wellblech-Welt mit lokalen Minima), Wurf-Roboter,
  zwei Gruppen finden (Clustering), Finale Ziffern-Erkenner (Schnitt durch ein großes Netz)
- Level 7 zu zweit über den Raum (jede Person eine Welt auf ihrem Tablet)
- Level 5: Landschaft eines einzelnen Pinguins zeigen (Summe = große Landschaft), Schalter
  „Stufe / weich“ (Perzeptron-Terrassen ohne Pfeil), später größeres Netz (z. B. Korbwurf)
- Schaufenster `preview/nebeltal.js`, Freigabe für alle: `update skill_tools set admin_only = false where id = 'nebeltal'`
- Prüfstand: `supabase/tests/0290_nebeltal.mjs`
