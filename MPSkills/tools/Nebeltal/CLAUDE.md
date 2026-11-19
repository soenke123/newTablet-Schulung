# Nebeltal (MPSkill, Migration 0290, Prototyp, nur Admins · gemeinsam spielen: Migration 0296)

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
  Erklärkarte (`introHtml` in spiel.js, auch für zwei.js, Aufbau in karte.css): `lead` (ein Satz) → Bild →
  `formula` (optional) → `steps` (höchstens 3, je Schritt EIN kurzer Satz) → Steuerung (eine Zeile)
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
- (`showroom.html` „Eiswelt“ gelöscht 18.11.2026 – Variante B ist im Spiel; `G.setPalette` in grafik.js bleibt)
- `js/spiel.js` – Ablauf menu → intro → play → reveal → result, Steuerung, Lernkurve, Modell-Diagramm
- **Übersicht** (Sönke 18.11.2026: „Landing führt durch die Stunde, visueller“): `renderMenu` in spiel.js zeigt
  `PHASES` als Reihen mit Bild-Kacheln (`NTBild.tile(key)` in bilder.js, viewBox 240 × 150, immer Polarnacht):
  Phase 1 Einstieg = Level 1–3 + Erarbeitung · Phase 2 Neuronen trainieren = Level 4–7 · Phase 3 Sicherung =
  Kachel „Sicherung“ (kommt noch, `EXTRA.sich.soon`, ausgegraut) + Level 8. Extra-Kacheln in `EXTRA`
  (`href`, `tag` statt Nummer). Kachelbilder: 1 Spieler im Schneesturm, 2 `img/frei/kompass.webp`
  (Sönkes „Pingu mit Kompass.png“, freistellen.py), 3 Sprungbögen + Ring, 4 Zügel + „Gewicht?“-Schild,
  5 Adelie | Zügel mit Trennlinie, 6 Nest mit beiden Eltern + „?“, 7 main_a/main_b + Neuronen A/B,
  8 drei Köpfe, Erarbeitung = Tafel mit EINEM Neuron (w₁, w₂ → σ) und Fehler-Pfeil rückwärts. Kacheln nur mit Titel
  (Untertitel `short` nur noch als title-Text, Sönke 18.11.2026); keine Welt-Nummer-Zeile, keine Labor-/Showroom-Links mehr
  (Welt-Nummer intern in `nt.seed`, „Neue Welt“ am Levelende würfelt sie). `index.html?lv=4` öffnet direkt ein Level.
- `erarbeitung.html` + `js/erarbeitung.js` – **Erarbeitung** (Phase 1, nach Level 3). 2. Fassung 18.11.2026 (Sönke: „viel zu
  kompliziert und überladen … so versteht das keiner“): EIN Neuron statt Netz 2-2-1, EIN Gedanke je Schritt, Bühne groß in
  der Mitte (SVG, quer `LAY.h` / hochkant `LAY.v` je nach Seitenverhältnis), darunter EIN Satz + Formel-Chip + Knöpfe.
  Das Neuron ist genau das aus Level 5 (`NTWelt.penguins`, 136 Pinguine, σ ohne Bias, Start `START` = (−3 | 2,5) sortiert
  fast alles falsch, erster Pinguin ein Zügel mit beiden Messwerten deutlich ≠ 0). Vier Schritte:
  1 Raten (Umriss, zwei Messwerte → · w₁ · w₂ → σ → „x % Zügel“, Leiste Adelie 0 … Zügel 1) ·
  2 Vergleichen (Art aufgedeckt, SOLL-Ring, roter Abstand = Fehler = Soll − Ist) ·
  3 Anpassen (Kanten „alt → neu“, Antwort rückt ans Soll; `neu = alt + Lernrate × Fehler × Eingang`, exakt für σ +
  Log-Fehler; „↻ Nächster Pinguin“ oder „Viele Pinguine“) ·
  4 Ins Tal (3. Fassung 18.11.2026, Sönke: „zu losgelöst“): links DASSELBE Bild wie „Anpassen“ (body.s4), rechts die Karte
  der ECHTEN Fehler-Landschaft über (w₁, w₂) ±20 (= Level 5 von oben); jeder Klick „Neuer Pinguin · Sprung“ (`hop`) = neuen
  Pinguin testen + einmal anpassen (dieselbe Regel wie Schritt 3) = ein Sprung, Pfeil auf der Karte = letzter Sprung alt → neu;
  „Lernen zurücksetzen“ (`resetLearn`) = Start; kein Training, kein Knopf zu Level 4; Lernrate 0,5–30, Start 3).
  Ab „Vergleichen“ steht unter dem Neuron σ(z) = Ist, im Satz die ganze Rechnung `Ist = σ(Länge · w₁ + Höhe · w₂)`.
  Pinguin links antippen (`.pghit`, `otherPeng`) = anderer Pinguin mit anderen Werten (in „Anpassen“ mit seiner Anpassung).
  Lernregel einmal mit Zahlen für das obere Gewicht (`w1Rule`, Schritt 3 und 4: „w₁ neu = −3,00 + 3,0 × 0,93 × 1,30 ≈ 0,61“,
  Kanten in „Anpassen“ mit 2 Nachkommastellen); w₂ rechnet die Klasse selbst nach (Sönke 18.11.2026). Quer/hochkant
  entscheidet die GANZE Bühne (`main`), nicht `#stage` – sonst kippte das Bild in „Ins Tal“ (schmalere Bühne) auf hochkant;
  „Ins Tal“ hochkant = Bild links (42 %), Karte rechts, nur ≤ 520 px untereinander.
  Raten: Pinguin als schwarze Silhouette mit weißem Rand über einen SVG-Filter `#sil` (feMorphology) – CSS-`filter` an
  SVG-`<image>` greift in Safari/iPad nicht, dort war der Pinguin zu erkennen. Lernrate (`#lrBox`, Regler) steht ab „Anpassen“
  OBEN über dem Netz und bleibt in „Ins Tal“ dort (`body.lrOn`); in „Anpassen“ rechnet ein neuer Wert die Anpassung desselben
  Pinguins sofort neu (Kanten, Antwort, Formel), in „Ins Tal“ gilt er ab dem nächsten Sprung (Sönke 18.11.2026).
  Weggefallen: versteckte Schicht, Bias, Anteile/Backprop-Formel, σ-Kurve, Regel-Kasten, Brücken-Tabelle mit 6 Zeilen.
- `karte.css` – Erklärkarte vor jedem Level (index.html + labor.html, 18.11.2026: „ohne Scrollen auf einen Bildschirm“):
  `.card-in.is-intro` mit `.i-head` (Kicker, Titel, EIN Satz) · `.i-pic` (Bild, Formel) · `.i-txt` (höchstens 3 kurze
  Schritte, Steuerung) · `.card-btns`; quer Bild links/Text rechts, hochkant untereinander (Bild ≤ 26vh), Schriften mit
  clamp(…vh); Tastenkürzel (`.kbd`) nur mit Maus. Neue Texte KURZ halten – geprüft bei 390×760, 800×370, 1024×700, 1440×860.
- `tool.js`/`tool.css` – iframe-Rahmen (wie Reinforce Yourself) und Brücke zum Raum (s. „Im Raum“ unten):
  reicht `data.levels`/`data.mp` hinein, setzt Freigaben über skill_room_set_state und führt die RPCs
  `nt_play` (Tablet) bzw. `nt_room_get`/`nt_room_act` (Lehrkraft) für die Seite im Rahmen aus
- `js/raum.js` – Gegenstück im iframe (index/labor/erarbeitung): Rolle (?raum=…, beim Seitenwechsel aus
  sessionStorage `nt.raum`, nur im iframe), Freigaben, `rpc()`, Serveruhr, Schalfarben (`COLORS`, 16), Wertung
  Level 7 (`l7.score`: Paar aus vals, fehlende Welt = Start) und Level 8 (`l8.init(seed)` = gleicher Start für alle
  Teams, `l8.score` = falsch/Fehler wie labor.js Zahl-Modus); schickt Tablets bei `mp` von Labor/Erarbeitung in die Lobby
- `js/mehr.js` + `mehr.css` – „Gemeinsam spielen“ (Lobby, Kasten/Bühne der Lehrkraft, Warte-/Ergebniskarten, s. unten)
- `tests/gemeinsam.e2e.mjs` – Lehrkraft + 3 Tablets im Browser (Playwright) gegen die echte SQL-Kette in pglite:
  Freigabe, Lobby, Level 2 (jeder gegen jeden), Level 7 (Paar + allein), Level 8 (Team, Beobachten), Aus.
  `node MPSkills/tools/Nebeltal/tests/gemeinsam.e2e.mjs [Bildordner]` (dauert ~3 Min.)

## Level

1. **Im Schneesturm** (bis 17.11.2026 „Im Nebel“) – große Welt, frei laufen (Joystick links / WASD), 60 s (bis 18.11.2026 75 s),
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
   Tal bleibt in der Mitte, mit Bias gehen höchstens 3 von 4. Am Tiefpunkt sind beide Gewichte ≈ 0 → a·Mama + b·Papa = c hat
   keine Gerade mehr (nestPlot lässt sie bei |(a, b)| < 0,08 weg) – das Neuron sagt überall dasselbe; nestPlot schreibt dann
   „Gewichte ≈ 0 → keine Linie“ in die Mitte (bzw. „Linie liegt außerhalb“, wenn der Bias sie aus dem Bild schiebt). Haken „lernt mit“ (`#xBiasL`, 18.11.2026):
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
   Name „Das Nest mit zwei Neuronen“, Erklärkarte beginnt mit „Wieder das Nest aus Level 6“ (Sönke 18.11.2026).
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

**Fertig-Knopf** (`stay()` in spiel.js und zwei.js): hält „Training starten“ an; ist gerade ein Sprung in der Luft, merkt er
sich den Klick (`stayReq`) und beendet nach der Landung – vorher wurde der Klick während des Trainings verschluckt.

**Erklärkarte mittig**: zwei verwaiste CSS-Zeilen vor `#card` (Reste gelöschter Regeln) hatten die `#card`-Regel geschluckt –
die Karte klebte oben links. Bei CSS-Löschungen immer ganze Regeln entfernen.

**Bildschirmgrößen** (18.11.2026): Knopf „Infos“ oben (`#btnInfo`, Level 7 `#zInfo`, `toggleInfo` in spiel.js) blendet
die Kästen rechts aus (`body.info-min`), `body[data-panel]` = Level hat einen Kasten. Handy hochkant (≤ 600 px): Kasten
volle Breite unten über der Leiste (`--hb` = Höhe der Leiste, ResizeObserver), Lernkurve dann weg, Lernrate-Leiste als
Raster ohne ±; Handy quer (≤ 500 px hoch): Kasten rechts über die ganze Höhe, Leiste links daneben; PC (≥ 1280 × 760):
Kästen breiter (370 px). Labor/Level 8 auf dem Handy: Seite scrollt (feste Höhen für Wolken, Netz, Welten).
Hinweis-Toasts beim Start gibt es nicht mehr (Sönke: zu viele kleine Erklärungen).

**Welt je Level** (18.11.2026: „jedes Level ein neuer Seed“): `lvSeed(id)` in spiel.js würfelt aus der Welt-Nummer der
Übersicht je Level eine eigene Nummer (steht in der Erklärkarte „Level n · Welt …“); gleiche Welt-Nummer = auf allen
Tablets dieselben Welten, aber Level 1 und 2 nie gleich. Sterne bleiben unter der Welt-Nummer der Übersicht.

Am Ende jedes Levels lichtet sich der Nebel (Weg, Start, Flagge am tiefsten Punkt), dann
Sterne + „Und die KI?“-Text. Welt-Nummer (Seed 1000–9999) = gleiche Landschaft auf allen
Tablets → Klasse kann schon jetzt gegeneinander spielen. Sterne je Level und Welt in
localStorage `nt.best.<level>.<seed>`, Welt in `nt.seed`.

**Levelende, 2. Fassung** (Sönke 18.11.2026 abends): Leiste nur noch Nochmal · Neue Welt · **Übersicht** (hervorgehoben) –
kein „Weiter: nächstes Level“ (sonst kam man an nicht freigegebene Level), kein „Weiter trainieren“, kein „Und die KI?“ (auch
gemeinsam nicht; dort klappt „Top 3“ die Rangliste auf, `moreLabel`), kein Hinweis „Karte ziehen = drehen“. Level 7 hängt bei
3 von 4 den einen Hinweis klein an die Zeile. Erklärkarten Level 1–5 kürzer und spielerischer (Sturm zieht auf, Kompass,
nicht mehr laufen), Level 2 mit Sönkes Kompass-Pingu. Level 4–6: Lernkurve und Kasten eine Spalte gleicher Breite
(`body[data-panel] #curveBox`). Level 6: Bias-Regler −2…2 in 0,05-Schritten. Der Code für „Weiter trainieren“ (`postStart`,
`S.post`) bleibt, ist aber an keinem Knopf mehr.

**Levelende ohne Karte** (Sönke 18.11.2026: „die Endkarte ganz wegnehmen, unten eine Leiste mit den wichtigsten
Knöpfen und wie gut man war, damit man die Karte und die Daten weiter betrachten kann“): statt `#card.result`
die Leiste `#endbar` (`endBar(o)`/`endHide()` in spiel.js, auch über die api für zwei.js und als `NTSpiel.endBar`
für mehr.js; labor.js baut im Level 8 gemeinsam dieselbe Leiste selbst) = Sterne/Platz + EIN Satz + Knöpfe
(Weiter · Weiter trainieren · Nochmal · Neue Welt · Übersicht); „Und die KI?“ klappt Hinweise + Outro (+ Top 3)
über der Leiste auf. Kästen rechts und Lernkurve bleiben und laufen weiter, `--hb` folgt der Leiste, Schnee legt
sich. Karte frei drehen: `js/orbit.js` (`NTOrbit.create(el)`: ziehen = drehen/kippen, zwei Finger = zoomen +
schieben, Mausrad = zoomen; `floor(x, z)` hält die Kamera über dem Boden, `spin` = dreht sich, bis jemand
anfasst), in spiel.js `orb` auf `#welt`, in zwei.js je Welt eine (`orb[k]`), Start = Kamera am Ende des Auflösens.
**Weiter trainieren** (Level 4–7, `canPost`): `S.post`/`st.post` + `body.post` – Lernrate-Leiste und
Lernschritt/„Training starten“ kommen zurück, ohne Schrittgrenze (`postN` zählt, Chip „weiter trainiert: +n“),
Karte bleibt frei drehbar, kein Laufen; „Zum Ergebnis“ (btnStay/zDone) holt die Leiste mit dem neuen Stand
(`rate()`; Sterne werden nur beim echten Ende gespeichert). Gemeinsam: Tablets Level 4–6 dürfen nach der Runde
weiter trainieren (zählt nicht, nichts geht an den Server); Level 8 (`mp8Free`): alle Welten ziehbar,
Lernschritt/Training/Lernrate wieder da, Werte der anderen werden nicht mehr übernommen (`l8score(seed, null, W)`).

**Wege für die Lehrkraft** (gemeinsam, Level 1–6): `mpRes` schickt den Weg mit – `res.p` = Spur (`S.dots`
ohne Sprungbögen + Endpunkt), höchstens 100 Punkte, je Punkt 4 Zeichen (x, z je 12 Bit über ±W,
`pathCode`/`pathDecode` in spiel.js), wird ausgedünnt, bis `res` ≤ 590 Byte (Server-Grenze 600, Migration 0296
unverändert). Beamer am Rundenende: `map3` in mehr.js = eigene WebGL-Leinwand `#mpMap3` (bleibt bestehen, wird
bei jedem Neuaufbau der Bühne wieder eingehängt), dieselbe Welt (`NTSpiel.palette(level)`), jeder Weg als
Band in der Schalfarbe (lange Sprünge unterteilt, damit er auf dem Boden liegt), Endpunkt = Pinguin
(`others`, `scale`) mit Ring, Top 5 groß, Start + Flagge (`flag.s`), Namen als HTML (`.mml`); Name in der
Rangliste antippen = nur dieser Weg hell (`MAP.sel`). Ohne zweites WebGL: alte Karte von oben (`drawMap`).

## Sparmodus

`LWMotion.low`: dpr 1 und 30 B/s; Glas-Kästen ohne Weichzeichner; kein Schnee, Polarlicht steht still.

## Im Raum (Sönke 18.11.2026, Migration 0296)

**Freigaben:** Lehrkraft teilt jede Kachel einzeln (Teilen-Symbol oben rechts an der Kachel, `toggleShare` in
spiel.js) → `skill_room_state.data.levels` = `[1, 2, 'erarb', 8 …]`. Fehlt = nichts frei; Tablets sehen
gesperrte Kacheln mit Schloss („Noch nicht freigegeben“), ohne Labor-/Showroom-Links; `index.html?lv=n` nur,
wenn freigegeben. Ohne Raum (allein, Schaufenster) ist alles offen.

**Gemeinsam spielen** (Knopf `#mpGo` in der Übersicht, nur Lehrkraft): `nt_room_act('on')` → `data.mp = 1` →
alle Tablets (auch wer gerade spielt oder später kommt) in die **Lobby** (`NTSpiel.lobby`, eigene Schneefläche `LW`
in mehr.js, gleiche WebGL-Leinwand wie das Spiel, Schnee an): jede Person ein Pinguin mit automatischer
Schalfarbe (`nt_players.color`, kleinste freie von 16), antippen = dorthin laufen (`G.unproject`), WASD/Pfeile;
Namen als HTML darüber; andere laufen weich zu ihrer gemeldeten Position (`pos` 0…1). Lehrkraft: Kasten rechts
(`#mpSide`) mit allen 8 Leveln (unabhängig von der Freigabe), Welt-Nummer + „Neue Welt“, Level 7/8: Zeit
(1–10 min, Vorgabe 2 bzw. 3), Level 8: Teamgröße 2–8 (Vorgabe 8 = erst ab 9 Personen ein zweites Team), Teams
(Person antippen → Team antippen = verschieben, Person antippen = tauschen, „+ neues Team“, **×2** = bekommt
zuerst die übrigen Welten, „Angleichen“ = `nt_balance`: so wenige Teams wie möglich, gleich groß, reihum nach
Sitzplatz; Spätzugang ins kleinste Team mit Platz). Start → Erklärkarte auf den Tablets mit „Bereit!“, Beamer
zeigt sie groß + wer bereit ist → „Los!“ → 3-2-1 (`countdown_ends_at`, Serveruhr) → Runde.
- **Level 1–6** jeder gegen jeden: `NTSpiel.mpOpen(id, seed, o)` spielt das Level wie allein (Welt der Runde,
  eigene Schalfarbe, kein „Übersicht“/„Nochmal“). Fertig (Zeit, Sprünge, „Hier bleibe ich“) → `res`
  `{s, t, x, z …}` an den Server (`mpRes`: s = m über dem tiefsten Punkt bzw. Fehler, kleiner = besser; Endstand,
  nicht der beste Punkt unterwegs), Karte „Warte auf die anderen · x von y fertig“. Beamer: Warteschirm (fertig ✓ /
  Sprünge übrig / offline, Zeit). Ende = alle fertig (Server) oder „Runde beenden“; ein ausgefallenes Gerät hält die
  Runde offen, bis es wieder da ist (Fortschritt `info` alle ~1,5 s, nach Neuladen geht es an derselben Stelle weiter).
  Dann Tablets: Nebel lichtet sich (`mpReveal`), Karte mit eigenem Platz + Top 3; Beamer: Top 5 + Karte von oben
  (`drawMap`: Höhenfarben NET, Start, tiefster Punkt, alle Pinguine, Top 5 groß mit Platz). Seit 18.11.2026: drehbare 3D-Karte mit den Wegen aller (s. „Wege für die Lehrkraft“), Tablets: Leiste statt Karte.
- **Level 7** zu zweit (`nt_slots`: je eine Welt, bei ungerader Zahl eine Person beide): `NTSpiel.mpTwo` →
  zwei.js mit `mp` (`ctl` = eigene Welt, die andere Figur folgt `remote(k)`, nur laufen – keine Lernrate/Sprünge,
  Uhr oben, wer nur eine Welt hat, steuert sie mit dem ganzen Bildschirm und WASD+Pfeilen). Werte `vals`
  ~4×/s. Beamer: Paare mit Nest-Diagramm live; Ende nach Zeit; Rangliste (Nester richtig, dann Fehler), Team
  antippen = Netz + Nester vergleichen.
- **Level 8** im Team: Tablets wechseln auf `labor.html?level=8&mp=1` (labor.js `MP8`). Seit 18.11.2026 abends
  (Sönke: „soll wie eine ganz normale Welt aussehen“) sieht das Tablet NUR seine Welt(en) als 3D-Landschaft wie Level 7
  (`WK` in labor.js, `body.wk`, `#wk`: grafik.js, Joystick/WASD, Pfeile = 2. Welt; Ort = die zwei eigenen Werte, Höhe =
  log-Fehler des ganzen Netzes JE WELT gestreckt auf 0…22 (`wkRange`, Spanne mind. 0,35 in ln, gleitet über `wv.rng`; bis 18.11.2026 `liftL` = 5·ln(Fehler/0,03) für alle gleich – im Sichtkreis oft nur 0,5–4 hoch = topfeben), Pfeil = bergab; Kamera drehbar wie in Level 1–6: zweiter Finger ziehen bzw. Q/E (2. Welt , / .), je Welt `wv.cy`, Laufen relativ zur Kamera; Kamera tastet den Sichtstrahl ab und hebt sich über steile Hänge (`wv.ey`, hoch schnell, runter langsam) – vorher steckte sie bei großer Steilheit im Boden; Welt wird höchstens alle 250 ms neu gebaut, wenn sich
  ein fremder Wert ändert, `wkSig`) + nur den Netz-Kasten oben rechts „Dein Teil des Netzes“: eigene Kanten/Bias hell mit
  Zahl, Rest blass (NTNetz `dim`/`biasHide`, `WK.focus`), Pinguin für Pinguin + „erkannt“ unten. Wolken, 8 Kacheln,
  Steuerleiste und Fehler-Anzeige sind weg. Uhr in `#mpChip`; Ende → „Platz x von y · n von 342 richtig“, Laufen stoppt,
  kein „Weiter trainieren“.
  Lehrkraft („Beobachten“, `&team=`) behält die große Ansicht; nach der Runde (`mp8Result`) automatisch `mp8Free`:
  Lernschritt, Training, Lernrate und „Neu würfeln“ für dieses Team-Netz (zählt nicht), zum gemeinsamen Besprechen.
  Allein und Lehrkraft: die drei Kästen oben (Wolke, Wolke 2, Netz) antippen = groß in die Mitte (`BIG`, `section.big`,
  `#bigBack`; Netz dann mit `big: true` = größere Kreise/Zahlen), nochmal antippen/daneben/Esc = zurück; Ziehen dreht weiter.
  Erklärkarte Level 8: EIN Satz zum Thema („alle drei Pinguinarten an Schnabel und Flosse erkennen“). Welt s = Neuron floor(s/2),
  gerade = Werte 0/1, ungerade = 2/3; wer zwei Welten hat, hat ein ganzes Neuron. Beamer: Teams mit erkannt je Art,
  „Beobachten“ = `labor.html?level=8&mp=1&team=<t>` (live, nichts ziehbar, „‹ Übersicht“ zurück).
- **Level 8 am Tablet nach der Runde** (Sönke 18.11.2026 nachts: „die User sollen auch die Punkte sehen … die Übersichtswelt
  wie die Lehrkräfte, nur dass sie nichts ändern können“): `mp8Result` schaltet die 3D-Welt ab (`wkView(false)`, `body.mp8-end`)
  → Wolken, alle 8 Welten mit Namen, Netz wie bei der Lehrkraft, Kästen antippen = groß; ziehen geht nicht (`mp8Done()` in
  `mp8Mine`). Leiste: Platz + eigener Satz + **Rangliste aller Teams** als Chips (`.eb-rank`, Teamfarbe, Pinguine, Punkte =
  richtig sortierte Pinguine; eigenes Team „Ihr“) + Knopf „Deine Welt(en) in 3D“ ↔ „Ganzes Netz ansehen“. Höhe der Leiste
  → `--ebh` (ResizeObserver), damit sie nichts verdeckt. Level 7 am Tablet: Rangliste aller Teams gleich offen (`open`).
- **Teams sichtbar** (Sönke 18.11.2026: Lobby „nicht perfekt“, zum Start scrollen ging nicht, „überall steht Team 1 hinter“):
  `NTRaum.teamColor(i)` / `teamName(i)` / `pingu(c)` (kleiner SVG-Pinguin mit Schalfarbe) in raum.js. Lobby der Lehrkraft:
  Team-Karten in Teamfarbe, Personen als Pinguin-Chips, Level 8 mit Leiste der 8 Welten (`slotBar`, Kästchen in der
  Schalfarbe der Person, leer = frei); Pinguin **ziehen** auf ein Team (verschieben) oder einen Pinguin (tauschen), Antippen
  geht weiter; während des Ziehens wird der Kasten nicht neu gebaut (`M.drag`), Scrollstand bleibt beim Neubau. Start-Knopf
  klebt unten (`.mps-foot`, sticky). Ist ein Level gewählt, werden die Level-Kacheln eine schmale Reihe (`.mps-lv.compact`);
  Teams in Spalten, wenn Platz ist. Bereit-Liste auf dem Beamer und Erklärkarte am Tablet nach Teams statt „Team 1“ je Name.
- **Figur** (18.11.2026): Ober-/Unterschnabel (geht im Sprung auf), Fransen am Schal-Zipfel, im Stehen winkt der Pinguin
  alle ~8,5 s mit der rechten Flosse (`wave` in drawPenguin).
- Rangliste nur am Ende der Runde, nichts wird aufgehoben (neue Runde löscht res/vals/info).
- Server (0296): `nt_rounds` (Phase off/lobby/intro/countdown/running/ended, Level, Welt, Teamgröße, Zeit) und
  `nt_players`; anwesend = 20 s; Tablets sehen Werte nur des eigenen Teams und fremde Endstände erst am Ende.
  Takt: Tablet Lobby 1 s (beim Laufen 0,25 s), Level 7 0,25 s, sonst 0,8–1,5 s; Lehrkraft 0,6–2 s.
  Prüfstand `supabase/tests/0296_nebeltal_gemeinsam.mjs`, Browser `tests/gemeinsam.e2e.mjs`.
- Ohne Lehrkraft (Migration 0297, Sönke 19.11.2026): Lehrkraft = NUR die Raum-Besitzerin (owner_id; einladen gibt es
  hier nicht). Lebenszeichen `nt_rounds.teacher_seen_at` = ihr letztes `nt_room_get` (oder „Gemeinsam spielen“),
  abwesend ab 10 s. Dann: Lobby/Erklärkarte höchstens 3 Min., laufende Runde immer bis zum Ende (Level 3–6 ohne Uhr:
  ohne Lehrkraft zählen nur anwesende Tablets), Rangliste noch 1 Min. ab Rundenende → aus (phase 'off', data.mp = 0),
  Tablets wieder in der Level-Übersicht. Ansicht liefert `off_at` (nt_off_at), Tablets zeigen oben rechts einen
  kleinen roten Countdown (`NTRaum.away` in raum.js, aufgerufen aus mehr.js tickUi und labor.js mp8Tick). Kein Cron.
  Prüfstand `supabase/tests/0297_nebeltal_ohne_lehrkraft_aus.mjs`.

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

- Schwung (Momentum), wackeliger Kompass (Mini-Batches), Lernrate unterwegs verkleinern
- Weitere Beispiel-Level: Ebbe und Flut (Welle, Wellblech-Welt mit lokalen Minima), Wurf-Roboter,
  zwei Gruppen finden (Clustering), Finale Ziffern-Erkenner (Schnitt durch ein großes Netz)
- Level 5: Landschaft eines einzelnen Pinguins zeigen (Summe = große Landschaft), Schalter
  „Stufe / weich“ (Perzeptron-Terrassen ohne Pfeil), später größeres Netz (z. B. Korbwurf)
- Schaufenster `preview/nebeltal.js`, Freigabe für alle: `update skill_tools set admin_only = false where id = 'nebeltal'`
- Prüfstand: `supabase/tests/0290_nebeltal.mjs`
