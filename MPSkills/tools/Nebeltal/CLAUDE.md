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
  Höhe gestaucht mit 1−e^(−L/L0), Richtung bleibt gleich)
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
4. **Das Tal ist ein Modell** – die Welt ist der Fehler einer Geraden; „Training starten“ springt
   mit fester Lernrate von selbst (30 Schritte). Ab Lernrate ≈ 0,15 explodiert es.

Am Ende jedes Levels lichtet sich der Nebel (Weg, Start, Flagge am tiefsten Punkt), dann
Sterne + „Und die KI?“-Text. Welt-Nummer (Seed 1000–9999) = gleiche Landschaft auf allen
Tablets → Klasse kann schon jetzt gegeneinander spielen. Sterne je Level und Welt in
localStorage `nt.best.<level>.<seed>`, Welt in `nt.seed`.

## Sparmodus

`LWMotion.low`: dpr 1 und 30 B/s; Glas-Kästen ohne Weichzeichner.

## Offen (nach dem ersten Ausprobieren ordnen)

- Klassen-Wettkampf über den Raum (Lehrkraft gibt Welt vor, Beamer zeigt alle Figuren, gemeinsames Auflösen)
- Schwung (Momentum), wackeliger Kompass (Mini-Batches), Lernrate unterwegs verkleinern
- Schaufenster `preview/nebeltal.js`, Freigabe für alle: `update skill_tools set admin_only = false where id = 'nebeltal'`
- Prüfstand: `supabase/tests/0290_nebeltal.mjs`
