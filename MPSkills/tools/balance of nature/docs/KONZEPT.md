# Biotop – Konzept

Stand: Entwurf zur gemeinsamen Planung. Alle Zahlen sind Platzhalter, keine kalibrierten Daten.

## 1. Die Idee

Eine große, fiktive, **abgelegene Insel** mit einer eigenen Tierwelt, die sich über lange Zeit
ohne Menschen entwickelt hat und im Gleichgewicht ist. Irgendwann landen Siedler und bringen
fremde Arten mit, ob gewollt oder nicht: Ratten im Schiffsrumpf, entlaufene Hunde,
freigelassene Schafe und Ziegen, Katzen. Man beobachtet, was dann passiert.

Das Muster ist real und gut belegt, zum Beispiel in Neuseeland, auf Mauritius, den Galápagos-
oder den Falklandinseln. Die Insel ist aber **ausgedacht**. Das gibt uns gestalterische Freiheit,
ohne falsche Aussagen über einen echten Ort zu machen.

**Zielgruppe:** Biologieunterricht. Die Lernenden programmieren nicht, sie beobachten,
verändern Startwerte und greifen ein. Umgesetzt wird alles in JavaScript im Browser,
lauffähig auf Schul-Tablets und am Beamer. Später soll Biotop ein Skill in MPSkills werden.

**Anspruch: funktional vor real.** Die Prinzipien sollen deutlich werden: Räuber-Beute-Zyklen,
Tragfähigkeit, Kaskaden, Inselzahmheit, invasive Arten. Lebensdauer, Tragzeit und
Zeitmaßstäbe sind bewusst gestaucht und vereinfacht. Wo Realität und Verständlichkeit
kollidieren, gewinnt die Verständlichkeit, und wir dokumentieren die Vereinfachung.

## 2. Die vier Ausbaustufen

| Stufe | Inhalt | Was man im Unterricht tut |
|---|---|---|
| **1 Insel und Ökosystem** | Generierte Insel, heimische Arten mit Herden und Rudeln, stabil über Jahrzehnte | Beobachten: Wer lebt wo? Wie schwanken die Bestände? |
| **2 Experimentieren** | Startwerte, Inselgröße und Kernparameter änderbar, Vergleichsläufe, Diagramme, CSV | Hypothese → Lauf → Vergleich; Stabilität und Aussterben thematisieren |
| **3 Siedler** | Landung, kleines Dorf, erste Einschleppungen (Ratten, Hunde) | Welche Arten kommen damit zurecht, welche nicht? |
| **4 Landnutzung** | Schafe/Ziegen, Ackerbau, Jagd, Rodung, gezieltes Aussetzen weiterer Arten | Eingriff → Folgen über Jahre messen |

Gebaut werden jetzt die Stufen 1 und 2. Die Stufen 3 und 4 bestimmen aber schon heute die
Architektur (Abschnitt 8).

## 3. Die Insel

### Erzeugung

Die Insel entsteht aus einem Seed (gleicher Seed = gleiche Insel), in drei Schichten:

1. **Höhe**: Rauschen mal radialem Abfall ergibt die Küste, dazu ein Hügel- oder Bergzug.
2. **Feuchte**: Abstand zu Wasser, Höhe und Rauschen.
3. **Lebensraum** aus Höhe und Feuchte:

Vorbild ist Neuseeland, mit fantasievollen Zuspitzungen. Umgesetzt in `js/world/island.js`:

| Lebensraum | Lage | Rolle im Ökosystem (geplant) |
|---|---|---|
| Offenes Meer, Lagune | außen | Grenze; später Landeplatz der Siedler |
| Strand | Küste | karg, Übergangszone |
| Tussock-Grasland | trocken, vor allem im Regenschatten östlich der Berge | viel Grasnahrung, offen, wenig Deckung |
| Buschland | mittlere Feuchte | Deckung, Beeren |
| Farnwald | feucht, tief bis mittel | Laub, Früchte, Deckung |
| Moosnebelwald | feucht und hoch | Rückzugsraum, wenig Nahrung |
| Flachs-Sumpf | sehr feucht, flach, nahe Gewässern | Insekten, Wasser |
| Bergland, Gipfel | Bergketten, Vulkan | kaum Nahrung, Rückzug |
| Thermalfeld | Flanken des Vulkans | Besonderheit, ohne Nahrung, im Winter warm (Idee) |
| See, Fluss | Senken und Abflussrinnen | **Wasser als Bedarf** (Durst) |

Das Mosaik ist entscheidend: **Rückzugsräume und Übergänge stabilisieren Räuber-Beute-Systeme.**
Die Landschaft ist damit kein Hintergrund, sondern Teil des Modells.

### Größe und Erholung

Ja, die Größe zählt, und das ist selbst ein Unterrichtsthema:

- **Kleine Bestände sterben leichter zufällig aus.** Ein schlechter Winter oder ein Pech-Jahr
  reicht, auch wenn die Insel im Mittel genug Nahrung hätte.
- **Partnerfindung:** Bei sehr wenigen Tieren finden sich keine Partner mehr, und die
  Vermehrung bricht ein (Allee-Effekt). Das ergibt sich im Modell von selbst, wenn die
  Fortpflanzung einen Partner in der Nähe braucht.
- **Erholung braucht Rückzugsräume:** Eine Population erholt sich vom Rand eines
  verschonten Gebiets aus.
- **Inselgröße wird ein Parameter** (klein / mittel / groß). Das Experiment „gleiche Insel, nur
  kleiner“ zeigt den Effekt direkt.
- Genetik (Inzucht) wird **nicht** modelliert. Das benennen wir im Unterricht.

„Groß“ heißt konkret: mehrere tausend Tiere auf der Karte. Die Grenze setzen die Tablets, nicht
die Idee. Die Simulation muss deshalb sparsam gebaut sein (Abschnitt 4).

### Herkunft aus Wild Clusters

Aus `newTablet-Schulung/MPSkills/tools/wildclusters` übernehmen wir die Basis: Zufallsgenerator
mit Seed-Forks, Rauschen, Raster, Konturglättung, Kamera (Zoom, Pan) und das Vorschau-Werkzeug.
Ebenso die Prinzipien: Raster als Wahrheit und Vektor als Bild, ein Sub-RNG pro Schritt,
Regeln an genau einer Stelle, kein Build, `index.html` per Doppelklick und `WL`-artiger Namespace
statt ES-Modulen. Das Letzte ist wichtig für den späteren Umzug nach MPSkills.

Neu gebaut werden der Inselgenerator und die gesamte Simulation. Neue Grafiken sind
ausdrücklich kein Problem. Der Stil (weich wie Wild Clusters oder Pixel-Art) ist noch offen.

## 4. Das Ökosystem der Insel (Stufe 1)

### Felder und Agenten

- **Felder** (ein Wert pro Rasterzelle): Pflanzen, Insekten. Sie wachsen und werden abgefressen.
- **Agenten** (einzelne Tiere): alles, was man sehen und anklicken will.
- **Gruppen** (Herde, Rudel) sind eine eigene Einheit mit gemeinsamem Ziel, in der einzelne
  Tiere leben, geboren werden und sterben. Das ist realistischer und zugleich günstiger zu
  rechnen, weil die Entscheidung „wohin?“ einmal pro Gruppe fällt.

### Heimische Arten (fiktiv, mit realen Vorbildern)

Die Namen sind Arbeitstitel.

| Art | Typ | Vorbild | Rolle |
|---|---|---|---|
| Gräser, Kräuter | Feld | – | Hauptnahrung im Offenland |
| Sträucher, Laub, Früchte | Feld | – | Nahrung im Wald und Buschland; saisonal |
| Insekten, Larven | Feld | – | Nahrung für Vögel |
| **Zwerghirsch** | Herde (5–15) | Inselverzwergung bei Hirschen | Hauptbeute; frisst Gras und Laub |
| **Laufvogel** | lose Gruppe | Takahē, Moa, Dodo | flugunfähiger Bodenbrüter; Gras, Früchte, Insekten; **Gelege am Boden** |
| **Inselwolf** | Rudel (3–8) | Falklandfuchs (Warrah) | heimischer Rudeljäger; jagt Hirsch und Laufvogel; Revier |
| **Inseladler** | Einzeltier | Haastadler | jagt Jungtiere und Vögel; großes Revier (Stufe 1b) |

Reihenfolge des Einbaus: **Pflanzen → Zwerghirsch (Herde) → Inselwolf (Rudel)** stabil bekommen,
dann Laufvogel und Insekten, dann Adler. Jede Art wird einzeln eingebaut und abgestimmt.

### Verhalten

Für alle Arten gilt dasselbe Grundmodell, nur die Parameter unterscheiden sich:

1. **Gefahr** erkannt → Flucht (Herde: gemeinsam, eng zusammen), Deckung bevorzugen.
2. **Durst** → zum Wasser.
3. **Hunger** → Nahrung suchen (Feld abweiden oder jagen).
4. Sonst → im Streifgebiet oder Revier umherziehen, ruhen.

**Herde:** Zusammenhalt um die Gruppenmitte, gemeinsames Weideziel, Wachsamkeit (mehr Augen =
frühere Warnung = geringerer Jagderfolg). Wird die Herde zu groß, teilt sie sich.

**Rudel:** gemeinsames Revier, gemeinsame Jagd. Der Jagderfolg steigt mit der Rudelgröße, die
Beute wird geteilt. Jungtiere wandern ab und gründen neue Rudel, wenn ein freies Revier da ist.
Das begrenzt die Räuberzahl auf natürliche Weise.

**Inselzahmheit** (wird ab Stufe 3 wichtig): Jede Art hat eine Liste der Räuber, die sie
**kennt**. Vor unbekannten Räubern flieht sie nicht oder zu spät. Ratten und Hunde sind für
Laufvögel unbekannt, und darin liegt die Katastrophe. Optional lernen Arten über Generationen.

Dazu kommen für jedes Tier Energie, Alter, Fortpflanzung (Saison, Energie, Partner in der Nähe)
und Tod mit festgehaltener **Ursache**: Hunger, Durst, Alter, Räuber, Winter, später auch Jagd
oder Gelegeraub.

### Jahreszeiten

Ein einfacher Jahresfaktor steuert das Pflanzenwachstum, die Fortpflanzung (nur zur Saison) und
den Winter als Engpass. Das kostet wenig und macht Zyklen und Engpässe überhaupt erst möglich.

## 5. Zeit und Zeitregler

**Gestauchte Zeit (funktional, nicht real):**

- 1 Simulationsjahr = z. B. 60 Tage (4 Jahreszeiten × 15 Tage).
- 1 Tag = mehrere Bewegungsschritte (Ticks), damit Bewegung in Echtzeit flüssig aussieht.
- Lebensdauer, Tragzeit und Reifung sind so gewählt, dass in wenigen Minuten Generationen
  sichtbar werden (z. B. Hirsch etwa 6 Jahre, Wolf etwa 8, Ratte etwa 1).

**Schieberegler für die Geschwindigkeit**, stufenlos:

| Stellung | Wirkung |
|---|---|
| Echtzeit | Tiere gleiten über die Karte, Jagden sind einzeln zu verfolgen |
| schnell | Tage vergehen in Sekunden, Herden ziehen sichtbar umher |
| sehr schnell | Jahre in Sekunden; gezeichnet wird nur jedes n-te Bild |
| Vorspulen | „bis Jahr X“ ganz ohne Zeichnen, danach Karte und Kurven ansehen |

Grundregel: **Die Geschwindigkeit ändert nur, wie oft gezeichnet wird, nie das Ergebnis.**
Gleicher Seed und gleiche Eingriffe ergeben bei jeder Reglerstellung exakt denselben Verlauf.

## 6. Stufe 2: Experimentieren

- **Startwerte:** Anzahl je Art, Pflanzenwachstum, Inselgröße, einige Kernparameter.
- **Szenarien** mit erprobten Seeds: „Gleichgewicht“, „Zu viele Wölfe“, „Kein Wolf“,
  „Harter Winter“, „Kleine Insel“.
- **Vergleich:** zwei Läufe übereinander im Diagramm.
- **Auswertung:** Bestandskurven je Art, Todesursachen, Verteilung über die Lebensräume,
  Pflanzenmenge, CSV-Export.
- **Stabilität als Thema:** Mehrere Läufe mit verschiedenen Seeds zeigen, wie oft das System
  hält und wann es kippt. Ein Aussterben ist ein Ergebnis, kein Fehler.

Die Oberfläche bleibt einfach: Karte, Zeitregler, Diagramm. Expertenparameter werden versteckt.

## 7. Ausblick auf die Stufen 3 und 4 (nur Planung)

| Eingriff | Mechanismus im Modell |
|---|---|
| Landung, Dorf | Zellen werden „bebaut“; Störungsradius; Abfall als Nahrungsfeld |
| Ratten (Schiff) | Einschleppung bei der Landung; rauben Gelege, fressen Samen; schnelle Vermehrung |
| Entlaufene Hunde | verwildern, bilden Rudel; Konkurrenz zum Inselwolf; jagen Laufvögel, die sie nicht kennen |
| Schafe, Ziegen | freigelassene Herden; Überweidung → weniger Pflanzen → Hunger bei den Hirschen |
| Katzen | Einzeljäger auf Vögel |
| Ackerbau | Acker-Zellen: viel Nahrung in der Saison, kahl nach der Ernte, keine Deckung |
| Jagd | zusätzliche Sterblichkeit mit Ursache „Jagd“, nach Art und Gebiet wählbar |
| Rodung | Wald → Grasland oder bebaut (Bauholz, Platz für Häuser) |
| Kulturfolger | Art-Merkmal `stoerungstoleranz`, `nutztAbfall`; daraus folgt Verhalten, kein festes Ergebnis |

Ob die Siedler über Werkzeuge (Lehrkraft klickt) oder automatisch nach Regeln handeln,
entscheiden wir in Stufe 3. Die Architektur erlaubt beides.

## 8. Architektur

### Entscheidungen, die die Stufen 3 und 4 schon jetzt erfordern

1. **Gelände in Schichten:** `natur` (aus der Generierung) und `nutzung` (bebaut, Acker, Weide,
   gerodet). Die Lebensraumqualität wird aus beiden berechnet und bei Änderung nur lokal neu bestimmt.
2. **Arten als Daten:** eine Artentabelle (Nahrung, Lebensräume, Tempo, Sichtweite, Vermehrung,
   Gruppenform, bekannte Räuber, Störungstoleranz …) und ein gemeinsames Verhaltensmodell.
   Eine eingeschleppte Art ist dann ein Tabelleneintrag plus Ereignis, kein neuer Code.
3. **Sterblichkeit als einsteckbare Quellen** mit Todesursache für die Statistik.
4. **Ereignisse mit Zeitpunkt:** „Jahr 30: Landung, 6 Ratten, 2 Hunde“. Dieselbe Mechanik dient
   für Szenarien, Lehrkraft-Eingriffe und das Protokoll.
5. **Modell ohne Darstellung, deterministisch:** Die Simulation läuft auch in Node ohne Browser,
   mit einem Seed und Sub-RNGs, ohne `Math.random()`.
6. **Räumlicher Index** (Raster-Buckets) für „wer ist in der Nähe?“, sonst ist „groß“ nicht machbar.

### Werkzeug zum Abstimmen (wichtigster Baustein)

Ein Node-Skript rechnet z. B. 20 Seeds × 50 Jahre ohne Grafik und meldet: Wie viele Läufe haben
alle Arten überlebt? Wie stark schwanken die Bestände? Folgt der Räuber der Beute mit Verzögerung?
Ohne dieses Werkzeug ist ein „ausgeglichenes Ökosystem“ Glückssache.

### Struktur (Entwurf)

```
index.html
js/
  core/      rng, noise, grid, contour, geometry, spatialIndex   (Basis aus Wild Clusters)
  world/     island.js, layers.js (natur/nutzung), habitat.js, rules.js
  eco/       species.js, fields.js, agents.js, groups.js (Herde, Rudel),
             mortality.js, seasons.js, events.js, simulation.js, stats.js
  render/    terrain, agents, camera, palette
  ui/        app, timeSlider, charts, scenarios
tools/       balance.js (Abstimmung), preview.js (PNG), Tests
data/        arten.md (fachliche Wahrheit für species.js)
```

## 9. Risiken (ehrlich)

| Risiko | Gegenmittel |
|---|---|
| Das Ökosystem kippt | Lebensraummosaik, Rückzugsräume, Reviere begrenzen Räuber, Abstimmwerkzeug; Kippen im Unterricht thematisieren |
| „Die Simulation zeigt nur, was wir programmiert haben“ | Mechanismen modellieren, nicht Ergebnisse; Annahmen in `data/arten.md` offenlegen |
| Leistung bei „groß“ | Felder für Kleinstlebewesen, Gruppen als Einheit, räumlicher Index, seltener zeichnen |
| Herden und Rudel machen das Abstimmen schwerer | erst eine Art mit Gruppe stabil, dann die nächste |
| Zu viele Regler | Szenarien statt Parameterwüste |

## 10. Entschieden

- Heimische Arten: Zwerghirsch, Laufvogel, Inselwolf, Inseladler (Feinheiten später).
- Grafikstil wie Wild Clusters (weiche Flächen); eigene Grafiken sind möglich.
- Klima und Optik: Neuseeland mit etwas Fantasie, nicht mitteleuropäisch.
- Später ein Skill in MPSkills.

## 11. Offene Entscheidungen

1. Inselname, Namen der Arten.
2. Thermalfelder: Vorläufig umgesetzt als **warme Winterzuflucht** (dort kostet der Winter
   weniger Energie, und Herden ziehen im Winter bevorzugt hin). Noch nicht endgültig entschieden.
