# Nebeltal (MPSkill, Migration 0290, Prototyp, nur Admins)

Wie lernt ein neuronales Netz? Man sucht im Nebel den tiefsten Punkt einer
3D-Landschaft und sieht nur die Stelle, an der man steht. Höhe = Fehler,
Position = Gewichte, Bergab-Pfeil = (negativer) Gradient, Sprungweite = Lernrate.

## Dateien

- `index.html` – Oberfläche (HUD, Menü, Karten), eigener Look „Eiswelt“ (17.11.2026, Showroom-Variante B
  Polarnacht: Space Grotesk/Unbounded/JetBrains Mono, Glas, Türkis→Violett-Verlauf; dunkel = Polarnacht,
  hell = Polartag), Hell/Dunkel vom Rahmen. ALLE Level sind Polarnacht (Sönke 17.11.2026: „alle anderen
  Level übernehmen die UI aus den ersten drei, allerdings ohne Schnee“): spiel.js `applyLook()` setzt
  `html[data-night]`; Level 1–3 (`snow: true` in LEVELS) zusätzlich `html[data-snow]` + Palette NIGHT
  (einfarbig, Schneesturm); ab Level 4 Palette `NET` (Tal Türkis → Blau → Violett → Flieder oben, NICHT
  Weiß – man startet meist oben), helle Höhenlinien (`lineK` 1,5 in grafik.js), Höhenmesser links mit
  derselben Farbleiste, Pfeil Mint. Level 7 (zwei.js) holt `window.NT_NET`. Menü-Welt = NIGHT/DAY je
  Hell/Dunkel. Ebenen über der Welt: `#aurora` (Polarlicht, auch im dunklen Menü), `#frost` (Rand) mit
  data-night; `#snow`, `#gust` (Böen-Schleier) nur mit data-snow
- `js/schnee.js` – Schneesturm (2D-Canvas): hängt nur am Bildschirm, fällt immer gleich schnell, egal
  wohin man läuft/dreht (Sönke 17.11.2026); Böen verkleinern die Sicht (fogR × (1 − 0,3·Böe));
  Sparmodus: kein Schnee
- `js/welt.js` – Landschaften: `hills(seed, level)` (Mulden = lokale Minima, Rand ringsum; Größe und
  Schwierigkeit je Level in `CFG`; seit 17.11.2026 größer und abwechslungsreicher: je Welt ein
  Gebirge (Grat mit Pass), eine Schlucht (Rinne, Boden fällt zu einem Ende ab = lange Falle) und eine
  tiefere Ebene (abgesenkter Kreis mit Stufe). Grundform (Sönke 17.11.2026: „organischer, nicht immer
  direkt zur Mitte“): mehrere große Becken (`basins`, Kegel weich verschmolzen, Koordinaten leicht
  verbogen), das Hauptbecken bei (cx, cz), die anderen `basinUp` höher = weitere Minima; die Kegel
  (`tilt`) halten jede Stelle etwas schräg – sonst kam man in Level 3 auf flachen Ebenen mit Sprüngen
  nicht weg. Level 1 und 2 = derselbe Generator und dieselbe CFG, aber je Level anders gewürfelt
  (andere Welt, anderer tiefster Punkt – gewollt). Level 1/2 W 110, ~17 Mulden, tiefste schmal und
  abseits; Level 3 W 66, tilt 0,55, tiefste nahe dem Hauptbecken, Start nie auf einer Kuppe
  (Gefälle > 0,6·tilt, Abstand > 0,5·W). Simuliert (40 Welten, 25 Sprünge, feste Lernrate): 3 → 20 %,
  6 → 40 %, 10 → 48 %, 15 → 30 % am tiefsten Punkt (Lernrate muss nicht perfekt sein); `NTWelt.CFG` nur für
  Prüf-Skripte),
  `model(seed)` (Level 4 „Wie schwer ist der Pinguin?“: alle 342 Palmer-Pinguine mit Flosse (cm) und
  Gewicht (kg), `MASS` in welt.js; Neuron ohne σ Gewicht = w·(Flosse − 20 cm) + b, w −1…2, b 1,4…7;
  Höhe = mittleres Fehlerquadrat gestaucht (L0 3), angezeigt wird die Wurzel = „± kg im Schnitt“;
  bestes Neuron w ≈ 0,50, b ≈ 4,16, ± 0,39 kg; ab Lernrate ≈ 0,5 explodiert es; Seed wählt nur den Start),
  `penguins(seed)` (Level 5: echte Palmer-Penguins-Daten CC0, 68 Adelie + 68 Zügel, Schnabellänge/-höhe
  standardisiert, Sigmoid-Neuron ohne Bias, Höhe = Log-Fehler gestaucht, Gewichte ±20, Tal bei
  w ≈ (15,2 | −4,6) mit 1 Fehler; Seed wählt nur den Start, Daten bleiben gleich),
  `xor(seed).one()` / `.two()` (Level 6/7: „Das Nest“ = XOR – Pinguin-Eltern wechseln sich ab, dem Ei
  geht es nur gut, wenn GENAU EINER am Nest ist; Eingänge Mama/Papa am Nest ±1 (im Code s1/s2);
  one = ein Neuron σ(w₁·Mama + w₂·Papa), Tal in der Mitte = überall 50 %; two = Neuronen A/B mit festem Bias −3, Lampe
  σ(8A + 8B − 5), lernbar a₁ a₂ b₁ b₂ ±6 (bis 17.11.2026 ±8: zu viele flache Terrassen), `h(k, x, z, andere)` = Schnitt; ~80 % der Welten lernen
  es mit Lernrate 4 in 40 Schritten, ~20 % bleiben bei 3 von 4 hängen – gewollt, s. Ergebnistext)
- `js/netz.js` – kleine Netze IMMER ganz zeichnen (`NTNetz.draw`): Kanten mit Zahl, Farbe = wer sie
  bewegt (orange Welt A, violett Welt B, grau gestrichelt = fest), Dicke = Größe; `NTNetz.lights` =
  die vier Nester als Tabelle (wird nicht mehr benutzt); `NTNetz.nestPlot(canvas, {cases, out(m, p), lines})`
  (Sönke 17.11.2026, ersetzt die Tabelle in Level 6/7): Diagramm x = Mama (fischt ← → am Nest),
  y = Papa, in den Ecken die Nest-Bilder, grüner Rahmen = so soll es sein (genau einer da), Plakette
  = was das Netz sagt (grün richtig, rot falsch), Hintergrund = Ausgabe des Netzes an jeder Stelle
  (grün „Ei ok“, rot nicht). Jedes Neuron = eine GERADE a·Mama + b·Papa = c mit Pfeil zur „an“-Seite
  und der Spielfigur (main/main_a/main_b) am Ende, das weiter von den Nestern weg liegt. Level 6:
  eine Gerade durch die Mitte (kein Bias) – sie kann die zwei grünen Nester nie von den anderen
  trennen; Level 7: Geraden A/B mit c = 3 (fester Bias −3), jede schneidet ein Nest ab
- `img/` – Sönkes Zeichnungen (17.11.2026): je Art ein PNG mit 2 Varianten, „Pinguin Main“ = DER Spieler
  (Pinguin mit Schal; immer wenn ein Bild den Spieler meint), vier Nester (leer, nur Mama, nur Papa,
  beide; Papa sitzt links, Mama rechts). Freigestellt + verkleinert in `img/frei/*.webp` von
  `img/freistellen.py` (adelie_1/2, chin_1/2, gentoo_1/2, main, main_a = Schal orange, main_b = violett,
  nest, nest_mama, nest_papa, nest_beide); Originale bleiben liegen
- `js/bilder.js` – alle Bilder als SVG-Text (Farben über CSS-Variablen): `NTBild.peng({sp: adelie|chin|gentoo|main,
  v: 1|2, team: a|b, x, y, s, flip})` = `<image class="pg">` aus img/frei (Füße bei x/y, Höhe ≈ 104·s; mit `scarf`
  oder sp 'main' der Spieler, team a/b = Schal orange/violett), `NTBild.nestImg(kind, x, y, w)`,
  `.pg` bekommt im Dunkeln einen hellen Hauch (drop-shadow in index.html/labor.html), `NTBild.icon` (peng/away/egg/ok für Tabellen),
  `NTBild.scene(level)` = Bild der Erklärkarte (1 Nebel mit Höhenmesser, 2 Pfeil bergab + kleine/tiefste
  Mulde, 3 drei Täler Lernrate zu klein/gut/zu groß, 4 Pinguin mit Lineal an der Flosse + Neuron +
  Formel + Weltkarte, 5 Adelie/Zügel + Schnabel messen + Neuron, 6 die vier Nester (Nest-Bilder) + Neuron, 7 Netz mit
  A/B + Welt A/B, 8 drei Arten + Netz 3 → A/B/C → Zahl); Weltkarte `karte()` = Raute mit Mulde, Achsen in Gewichtsfarbe, Pinguin, Flagge.
  Erklärkarte (`introHtml` in spiel.js, auch für zwei.js): `lead` (ein Satz Kontext) → Bild →
  `formula` (optional) → `steps` (nummeriert, je Schritt EIN Gedanke) → Steuerung
- `js/zwei.js` – Level 7 komplett: zwei Canvas/zwei NTGrafik (quer nebeneinander, hoch übereinander),
  Kamera fest (rechts = erstes Gewicht größer, oben = zweites), Hälfte ziehen = Figur dieser Welt
  (zwei Daumen/zwei Personen), WASD = A, Pfeile = B, Leertaste = Lernschritt; Schnitt der einen
  Welt wird neu gebaut, wenn die andere Figur ≥ 0,25 läuft (alle 120 ms, Gitter 84², Sparmodus 56²,
  feste Farbskala `hRange`); Pfeil je Welt = ihr Anteil am 4D-Gradienten; ein Lernschritt springt
  beide. spiel.js übergibt über `openTwo` (S.state 'zwei' = spiel.js zeichnet nicht) und bekommt
  card/toMenu/stars zurückgereicht
- `labor.html` + `js/labor.js` – „Labor: Pinguine in 3D“ (Test für EIN Gerät, Link unten im Menü), seit
  17.11.2026 auch **Level 8** (`labor.html?level=8`, Eintrag `href` in LEVELS, spiel.js springt hin):
  fest „+ Zahl-Neuron“ = 4 Neuronen, 8 Welten, Moduswahl versteckt, Erklärkarte vorweg (`intro()`,
  NTBild.scene(8)), „‹ Übersicht“ zurück; keine Sterne. Labor immer Polarnacht (Eiswelt-Farben/-Schriften,
  Welten-Palette = NET, helle Höhenlinien, Pfeil Mint), Arten mit Sönkes Bildern in Legende und „erkannt“:
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
  ohne σ wie in Level 4 (Pinguin wiegen): Zahl < 0,5 / bis 1,5 / darüber = Art mit 0/1/2; welche Art die 1
  bekommt, ist FEST Zügel (Sönke 17.11.2026; vorher wählbar, `#ordSeg` ist nur noch Anzeige). 16 Werte = 8 Welten (2 × 4), Fehler = ½ · mittleres
  Abstandsquadrat, ALLE Welten hängen voneinander ab. Zweite Wolke „Was das Zahl-Neuron sieht“:
  Pinguine an ihren Antworten (A, B, C je 0–100 %), zwei parallele Ebenen bei 0,5 und 1,5 = drei
  Scheiben. Lernrate 0,05–4, Start 1 (ab ≈ 2 explodiert es, Ausgang ohne σ), Startwerte ±2.
  Simulation (30 Netze): Zügel = 1 → nach 60 Schritten ~13, nach 200 ~9 falsch; Adelie = 1 → nach
  200 ~9; Esel = 1 → ~28 – die Reihenfolge ist nicht egal (Arten sind keine Zahlen). Gut zu sehen:
  Hat ein verstecktes Neuron kaum Gewicht zum Zahl-Neuron, ist seine Welt flach – es ist egal.
  Farbskala JE WELT (tiefster bis höchster Punkt, log) – mit gemeinsamer Skala wirkten die Welten
  von A/B/C flach; ist der Unterschied wirklich klein (max − min < 0,03 oder max/min < 1,15),
  steht „fast flach – dieses Neuron zählt gerade kaum“ in der Welt.
  Netz ohne Tabelle (Sönke 17.11.2026): jedes Gewicht steht an seiner Kante (labelAt 0,66 → die
  Zahlen einer Schicht stehen in einer Spalte), der Bias IM Neuron unter σ/Σ (NTNetz-Option
  `biasInside`), darunter nur „erkannt: Adelie x/151 · …“. Leinwand in `.netwrap` absolut – eine
  Canvas mit flex:1 wuchs mit ihrer eigenen Pixelgröße und drückte im Hochformat die Wolken weg.
  Wolke 2: Pinguine kleben oft an Würfelwänden/-kanten – richtig so, σ-Neuronen sind sich meist
  sicher (0 %/100 %); weiter innen = unsicher, dort liegen die Fehler. Nicht künstlich spreizen,
  sonst wären die beiden Ebenen des Zahl-Neurons keine Ebenen mehr.
- `js/grafik.js` – reines WebGL 1 ohne Bibliothek (CSP/Datenschutz): Gitter, Kugel/Kegel/Kasten,
  Nebel hängt an der Figur (uFogR), nicht an der Kamera; Höhenlinien im Shader
  Figur = kleiner Pinguin (`drawPenguin`, Sönke 17.11.2026, 2. Fassung), eigenes Programm `progC`:
  Körper + Kopf = EIN Drehkörper (`penguinBody`, Maße in `PB`), Bauch/Herz-Gesicht/Bäckchen malt der
  Shader aus der Objekt-Position (uPat 1, scharf per fwidth) – keine aufgeklebten Kugeln (Z-Flackern);
  weiches Umschlingungs-Licht + Himmel/Boden-Licht + Randlicht + Glanz; Normalen über `normalMat`
  (inverse Transponierte, sonst sind gestauchte Kugeln falsch hell); Strickschal in `playerColor`
  (Ring uPat 2, Zipfel uPat 3; Level 7: orange A / violett B); weicher Schatten liegt auf dem Hang
  (uPat 4, Blending mit blendFuncSeparate – sonst schreibt er Alpha in die Leinwand und leuchtet hell).
  Watscheln über `player.phase` + `player.walk` (0–1, im Sprung 0): Rollen, freier Fuß hebt ab,
  Flossen gegengleich, Körper federt, Schalzipfel schwingen; im Sprung Flossen aus; im Stehen atmen + blinzeln
- `showroom.html` – Showroom „Eiswelt“ (17.11.2026, Link unten im Menü): eigener Look weg vom
  MPSkills-Grün + Schneesturm in der Antarktis, drei Varianten zur Auswahl: A Whiteout (heller Sturm,
  Expeditions-Look Signal-Orange/Monospace, Höhe als Gerät oben mittig) · B Polarnacht (dunkel,
  Polarlicht, Glas mit Türkis/Violett, Höhe schwebt über dem Pinguin) · C Eisscholle (Gletschertürkis,
  Eisblock-Knöpfe, Fredoka, Höhe als Plakette unten neben „Hier bleibe ich“). Echte Welt Level 1/2
  (laufen per Wischen/WASD), Menü und Erklärkarte je Variante; Höhenleiste am Rand entfällt.
  Technik: `G.setPalette({fog, c, plainC, amb, light, ice, iceC, dark})` in grafik.js (null = normale
  Palette; `ice` > 0 = steile Hänge blankes Eis + Schneerippen „Sastrugi“), Schnee als 2D-Canvas
  darüber, Böen verkleinern die Sicht (fogR) und legen einen Schleier über das Bild. Noch nicht
  im Spiel: Erklärbilder (bilder.js) ab Level 3 sind noch grün/braun. Seit 17.11.2026 ist B im Spiel (Level 1/2 + Menü).
- `js/spiel.js` – Ablauf menu → intro → play → reveal → result, Steuerung, Lernkurve, Modell-Diagramm
- `tool.js`/`tool.css` – nur der iframe-Rahmen (wie Reinforce Yourself), noch kein Austausch mit dem Raum

## Level

1. **Im Schneesturm** (bis 17.11.2026 „Im Nebel“) – große Welt, frei laufen (Joystick links / WASD), 75 s,
   OHNE Höhenmesser (Sönke 17.11.2026: soll wirklich schwer sein, man soll kaum merken, ob es bergauf
   oder bergab geht): Boden einfarbig ohne Höhenlinien und ohne Eisfärbung an Steilhängen (`plain`,
   uPlain), flaches Licht (`plainAmb` 0,84 in der NIGHT-Palette), Farben kommen erst beim Auflösen;
   keine Hang-Physik (`physics: false`).
2. **Der Bergab-Pfeil** – sieht genauso aus wie Level 1 (einfarbig, kein Höhenmesser), einziger
   Unterschied: der Pfeil (türkis) unter den Füßen; dazu Hang-Physik (bergauf langsamer, steile
   Hänge rutschen), 60 s.
3. **Sprünge** – seit 17.11.2026 auch Polarnacht (einfarbig, Schneesturm, kein Höhenmesser – die
   Lernkurve oben rechts bleibt). Kein Laufen mehr: Sprung in Pfeilrichtung, Weite = Lernrate × Steilheit
   (echter Gradientenschritt – an flachen Stellen also kürzer bei gleicher Lernrate; die Rechnung
   steht live unter dem Regler, `#lrDist`), 25 Sprünge (= begrenzte Rechenzeit; ohne Grenze wäre
   eine winzige Lernrate nie ein Problem), Ring = Landepunkt, zu weit = aus der Welt.
4. **Wie schwer ist der Pinguin?** (bis 17.11.2026 „Die Sonnenblume“) – ein Neuron OHNE σ schätzt
   aus der Flosse das Gewicht (Gewicht = w · (Flosse − 20 cm) + b), 342 echte Pinguine; Welt = sein
   Fehler (glatte Schüssel). Rechts `#modelBox`: oben `#mrow` (SVG) „Pinguin für Pinguin“ – alle 1,6 s
   ein anderer echter Pinguin (Bild seiner Art, Flosse → · w → Σ + b → ≈ Schätzung, echtes Gewicht,
   „x kg zu leicht/schwer“), darunter alle 342 als Punktwolke (Artfarben wie im Labor) mit der Geraden,
   der Pinguin von oben umkreist + roter Fehlerstrich. Laufen + „Training starten“ (30 Schritte),
   Lernrate 0,01–1, Start 0,03, ab ≈ 0,5 explodiert es – Lernziel hier ist die Lernrate. Sterne nach
   Verhältnis zum besten Fehler (< 1,02 / 1,15 / 1,6).
5. **Pinguine sortieren** – die Welt ist der Fehler EINES Neurons, das Adelie- und Zügelpinguine
   trennt (x = w₁ Länge, z = w₂ Höhe). Laufen UND Springen/„Training starten“ (`walk: true` im
   Sprung-Level), 40 Schritte, Lernrate 0,2–50 (ab ≈ 35 fliegt man raus). Rechts `#pengBox`:
   oben `#prow` (SVG) „Pinguin für Pinguin“ wie Level 4 – alle 1,6 s ein anderer der 136 Pinguine
   (Bild seiner Art, Länge/Höhe in mm → · w₁/· w₂ (Kantendicke/-farbe = Gewicht, orange +, blau −)
   → σ → „Zügel? 87 % → Zügel“, echte Art, ✓ richtig / ✗ falsch), darunter „Bild A“ (Messpunkte,
   Hintergrund = Ausgabe, Linie = 50 %, falsch sortierte rot umkreist, der Pinguin von oben schwarz
   umkreist) – live beim Laufen. Wertung nach falsch sortierten
   Pinguinen. Richtung vom Mittelpunkt = Winkel der Trennlinie, Abstand = Sicherheit; falsche Seite
   ist eine flache Hochebene, die richtige eine lange Rinne.
   Gleicher Aufbau „Beispiel links · Neuron · NEURON SAGT rechts“ (18.11.2026) auch in Level 4
   (`#mrow`: Pinguin + Flosse → Σ → Kasten mit senkrechter kg-Skala 2–7, Punkt = Schätzung,
   Ring = echt, rot = Fehler, ✓ unter 0,25 kg) und Level 6 (`#xrow`: alle 1,6 s eines der vier
   Nester, Mama/Papa ±1 → σ mit Bias → „Ei ok“/„nicht ok“ mit %, ✓/✗/ECHT über `verdict('x', …)`;
   im Nest-Diagramm ist dieses Nest gestrichelt umrahmt, `nestPlot({ hi })`).
   Level 7 ebenso (`#zPanel` in js/zwei.js, 400 px breit): links Nest + Mama/Papa auf Höhe der
   Eingänge (`#zL`), Mitte das ganze Netz (A/B füllen sich mit ihrer Antwort, „A 81 %“), rechts
   „NEURON SAGT“ (`#zR`); `verdict`, `eggIcon`, `NEST_TXT` kommen über die api aus spiel.js.
6. **Das Nest** (bis 17.11.2026 „Das Treppenhaus-Licht“) – Pinguin-Eltern wechseln sich ab; dem Ei
   geht es nur gut, wenn genau einer am Nest ist (beide weg: Ei kühlt aus, beide da: keiner holt
   Futter) = XOR. Ein Neuron soll es lernen und kann es nicht: tiefster Punkt = Mitte, überall 50 %.
   Rechts `#xorBox`: Neuron (Mama/Papa → σ → Ei ok?) + die vier Nester als Diagramm `#xplot`
   (NTNetz.nestPlot: die Gerade des Neurons dreht sich mit, wenn man läuft). Wertung: wie nah am
   (unvermeidlichen) Minimum. Bias-Regler direkt am Kasten (`#xBias`, −4…4, Sönke 17.11.2026, bewusst
   „nicht ganz sauber“, fürs Verständnis): verschiebt die Gerade, lernt beim Training NICHT mit; die
   Welt ist dann der Fehler bei diesem Bias (`xor().one().setBias`, Gitter wird gedrosselt neu gebaut).
   Tal bleibt in der Mitte, mit Bias gehen höchstens 3 von 4. Haken „lernt mit“ (`#xBiasL`, 18.11.2026):
   dann springt der Bias mit (`step()` liefert `b`, spiel.js `doJump` → `setBias`) und läuft zurück auf 0 –
   Fehler ist konvex in (w₁, w₂, b), bestes Neuron = überall 50 %. Gewichte hier nur ±4 (vorher ±8: σ
   fast immer satt, Nest-Karte nur grün oder rot), Lernrate 0,1–20, Start 1.
7. **Zwei Neuronen, zwei Welten** – `js/zwei.js`: Welt A = Kanten in Neuron A, Welt B = Kanten in
   Neuron B; beide Figuren immer auf derselben Höhe (ein Netz), die Welt der einen verbiegt sich,
   wenn die andere läuft. Mitte oben `#zPanel`: das ganze Netz (Namen A/B über den Neuronen, `labelPos: 'above'` – rechts oben
   verdeckten sie die 8 der Ausgangskante) + Satz „grau = steht fest: Bias −3, Gewichte 8, Bias −5“ (`.zfix`,
   auch in der Erklärkarte: hier kein Bias-Regler) + Nest-Diagramm `#zplot` mit den Geraden A (orange) und B (violett). Wertung:
   4 von 4 Nestern richtig (3 Sterne bei Fehler < 0,15); bei 3 von 4 erklärt das Ergebnis „beide
   haben dasselbe gelernt“ (eines muss „nur Mama am Nest“, das andere „nur Papa am Nest“ lernen). Am Ende Flagge am tiefsten Punkt des jeweiligen Schnitts.
   Ergebnis-Knopf „Weiter: Pinguine in 3D“.
8. **Pinguine in 3D** – das Labor im Modus „+ Zahl-Neuron“ (labor.html?level=8), s. Dateien.
   Seit 17.11.2026 abends: Höhenlinien der Welten als Vektorlinien (Marching Squares `contours()` in
   labor.js, vorher Pixel-Kanten = verpixelt); Lernkurve in der Steuerleiste (`#lcurve`: Fehler je
   Lernschritt, orange Striche = Lernrate geändert, mit Wert); „Pinguin für Pinguin“ unter dem Netz
   (`#ex`, nur Zahl-Modus): alle 1,6 s ein echter Pinguin → Messwerte → A/B/C in % (füllt auch die
   Neuronen im Netz, NTNetz-Option `act`) → Zahl → Zahlenstrahl mit drei Köpfen (`NTBild.head`).
   Seit 18.11.2026 wie Level 5 RUND UMS Netz (`.netrow`): links `#exL` Pinguin + Messwerte je auf Höhe
   ihres Eingangs (Eingänge ohne Leinwand-Beschriftung, x 0), A/B/C mit % am Neuron, rechts `#exR`
   Zahlenstrahl SENKRECHT (oben 2 Esel, unten 0 Adelie) mit Marker; Netz-Spalte breiter (0,85/0,85/1,7),
   gewählte Art grün ✓ / rot ✗, bei falsch die echte gestrichelt mit „ECHT“. Dasselbe Prinzip mit
   zwei Köpfen jetzt auch in Level 5 (`verdict()` in spiel.js, ersetzt „Zügel? 0 % → Adelie, echt: …“).

Ab Level 4 gilt überall: eine Welt = ein echtes Modell, das ganze Netz ist zu sehen, Laufen UND
Training im selben Level.

Am Ende jedes Levels lichtet sich der Nebel (Weg, Start, Flagge am tiefsten Punkt), dann
Sterne + „Und die KI?“-Text. Welt-Nummer (Seed 1000–9999) = gleiche Landschaft auf allen
Tablets → Klasse kann schon jetzt gegeneinander spielen. Sterne je Level und Welt in
localStorage `nt.best.<level>.<seed>`, Welt in `nt.seed`.

## Sparmodus

`LWMotion.low`: dpr 1 und 30 B/s; Glas-Kästen ohne Weichzeichner; kein Schnee, Polarlicht steht still.

## Plan: „Gemeinsam ein Netz“ im Raum (Sönke 17.11.2026: „das kann eine richtig schöne runde Stunde sein“)

Ablauf der Stunde (Sönke 17.11.2026): kurz Level 1–3 als Einstieg (jeder gegen jeden, gleiche
Welt-Nummer) → Pinguin wiegen (ein Neuron rechnet) → Pinguine (ein Neuron sortiert) → Das Nest
mit einem Neuron (scheitern) → zwei Neuronen → Abschluss: die Klasse trainiert in Gruppen
à 6 Geräten gemeinsam die Pinguin-Klassifizierung in 3D (3 Eingänge → 3 Neuronen = 12 Werte = 6
Welten, Zweierteam je Neuron; Einzelgerät-Vorstufe = labor.html). Bei weniger Geräten bekommen
manche 2 Welten.

- **Ein Gerät = ein Neuron** (nicht „zwei Kanten“): eigene Welt = Gewichtspaar des eigenen Neurons,
  Bias lernt automatisch mit (sichtbar). Nichts im Netz steht fest – alles, was kein Gerät hat,
  lernt beim gemeinsamen Lernschritt mit (eigene Farbe „lernt automatisch“).
- **Aufgabe, die mit der Neuronenzahl wächst: Zielscheibe** (Punkte im Kreis = Treffer). Jedes
  versteckte Neuron = eine gerade Linie; Lampe an, wenn ein Punkt auf der richtigen Seite aller
  Linien liegt. Beamer zeigt die Linien in der Farbe ihres Geräts: 3 Neuronen = Dreieck, 5 =
  Fünfeck, 8 ≈ Kreis. Kleine Gruppen auch das Nest (2-2-1 = 9 Werte).
- **Klassengröße 5–30 Geräte:** 3–9 Geräte = ein Netz für alle; ab ~10 Gruppen à 4–7, jede Gruppe
  ein eigenes Netz für dieselbe Aufgabe, Beamer zeigt alle Netze nebeneinander (Wettlauf). Kein
  Netz mit 30 Neuronen – muss lesbar bleiben (Grundsatz: immer das ganze Netz sehen).
- Ablauf im Raum: erst frei laufen (Welten wackeln, wenn andere laufen), dann „gemeinsamer
  Lernschritt“ der Lehrkraft = alle springen gleichzeitig (echter Gradient über alle Gewichte).
- Technik: Migration für den Netz-Zustand je Raum/Gruppe, Beamer-Ansicht der Lehrkraft, Tablets
  melden ihre Position 2–3× pro Sekunde; Rechnen/Zeichnen gibt es schon (welt.js, netz.js, zwei.js).
- Vorstufe allein am Tablet (Level 7 „Variante A“): alle 9 Werte des Nest-Netzes lernen,
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
