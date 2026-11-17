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
- `labor.html` + `js/labor.js` – „Labor: Pinguine in 3D“ (Test für EIN Gerät, Link unten im Menü):
  `NTWelt.penguins3()` = alle 342 Pinguine (151 Adelie, 68 Zügel, 123 Esel), Eingänge Schnabellänge,
  Schnabelhöhe, Flossenlänge (standardisiert), 3 Neuronen „Bin das ich?“ (σ, je 3 Kanten + Bias =
  12 Werte), größtes p gewinnt; Fehler = Summe der 3 Log-Fehler + λ = 0,002 · Gewichte² (sonst liegt
  das Esel-Tal im Unendlichen). Oben links die Wolke (Canvas 2D, eigene Projektion, ziehen = drehen,
  dreht sich nach 2,5 s von selbst; je Neuron eine Ebene = 50 %-Grenze mit Pfeil zur Ja-Seite,
  Legende schaltet Ebenen; falsch sortierte rot umkreist), oben rechts Netz (NTNetz, Farben c0–c2)
  + Tabelle aller 12 Werte mit „erkannt x/y“, unten 2 × 3 Welten (Spalte = Neuron, oben Länge/Höhe,
  unten Flosse/Bias; Farbe = Fehler DIESES Neurons, log-Skala 0,02–7, Höhenlinien; Punkt ziehen =
  Werte setzen, Pfeil = −Gradient, weiße Spur). Die Neuronen hängen im Fehler nicht voneinander ab –
  nur die beiden Welten eines Neurons verbiegen sich gegenseitig. Lernrate 4: nach ~30 Schritten
  5–10 von 342 falsch, bestes Netz 5 falsch.
  Schalter „+ Zahl-Neuron“ (Sönke 17.11.2026, Modus `zahl`): A, B, C werden zur versteckten Schicht
  (eigene Farben, NICHT die Artfarben – ihre Bedeutung lernt das Netz selbst), dahinter EIN Neuron
  ohne σ wie die Sonnenblume: Zahl < 0,5 / bis 1,5 / darüber = Art mit 0/1/2; welche Art die 1
  bekommt, ist wählbar (`#ordSeg`, Vorgabe Zügel). 16 Werte = 8 Welten (2 × 4), Fehler = ½ · mittleres
  Abstandsquadrat, ALLE Welten hängen voneinander ab. Zweite Wolke „Was das Zahl-Neuron sieht“:
  Pinguine an ihren Antworten (A, B, C je 0–100 %), zwei parallele Ebenen bei 0,5 und 1,5 = drei
  Scheiben. Lernrate 0,05–4, Start 1 (ab ≈ 2 explodiert es, Ausgang ohne σ), Startwerte ±2.
  Simulation (30 Netze): Zügel = 1 → nach 60 Schritten ~13, nach 200 ~9 falsch; Adelie = 1 → nach
  200 ~9; Esel = 1 → ~28 – die Reihenfolge ist nicht egal (Arten sind keine Zahlen). Gut zu sehen:
  Hat ein verstecktes Neuron kaum Gewicht zum Zahl-Neuron, ist seine Welt flach – es ist egal.
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

## Plan: „Gemeinsam ein Netz“ im Raum (Sönke 17.11.2026: „das kann eine richtig schöne runde Stunde sein“)

Ablauf der Stunde (Sönke 17.11.2026): kurz Level 1–3 als Einstieg (jeder gegen jeden, gleiche
Welt-Nummer) → Sonnenblume (ein Neuron rechnet) → Pinguine (ein Neuron sortiert) → Treppenhaus-
Licht mit einem Neuron (scheitern) → zwei Neuronen → Abschluss: die Klasse trainiert in Gruppen
à 6 Geräten gemeinsam die Pinguin-Klassifizierung in 3D (3 Eingänge → 3 Neuronen = 12 Werte = 6
Welten, Zweierteam je Neuron; Einzelgerät-Vorstufe = labor.html). Bei weniger Geräten bekommen
manche 2 Welten.

- **Ein Gerät = ein Neuron** (nicht „zwei Kanten“): eigene Welt = Gewichtspaar des eigenen Neurons,
  Bias lernt automatisch mit (sichtbar). Nichts im Netz steht fest – alles, was kein Gerät hat,
  lernt beim gemeinsamen Lernschritt mit (eigene Farbe „lernt automatisch“).
- **Aufgabe, die mit der Neuronenzahl wächst: Zielscheibe** (Punkte im Kreis = Treffer). Jedes
  versteckte Neuron = eine gerade Linie; Lampe an, wenn ein Punkt auf der richtigen Seite aller
  Linien liegt. Beamer zeigt die Linien in der Farbe ihres Geräts: 3 Neuronen = Dreieck, 5 =
  Fünfeck, 8 ≈ Kreis. Kleine Gruppen auch Treppenhaus-Licht (2-2-1 = 9 Werte).
- **Klassengröße 5–30 Geräte:** 3–9 Geräte = ein Netz für alle; ab ~10 Gruppen à 4–7, jede Gruppe
  ein eigenes Netz für dieselbe Aufgabe, Beamer zeigt alle Netze nebeneinander (Wettlauf). Kein
  Netz mit 30 Neuronen – muss lesbar bleiben (Grundsatz: immer das ganze Netz sehen).
- Ablauf im Raum: erst frei laufen (Welten wackeln, wenn andere laufen), dann „gemeinsamer
  Lernschritt“ der Lehrkraft = alle springen gleichzeitig (echter Gradient über alle Gewichte).
- Technik: Migration für den Netz-Zustand je Raum/Gruppe, Beamer-Ansicht der Lehrkraft, Tablets
  melden ihre Position 2–3× pro Sekunde; Rechnen/Zeichnen gibt es schon (welt.js, netz.js, zwei.js).
- Vorstufe allein am Tablet (Level 7 „Variante A“): alle 9 Werte des Treppenhaus-Netzes lernen,
  zwei Welten frei wählbar (Kanten im Netz antippen), Rest lernt automatisch mit.

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
