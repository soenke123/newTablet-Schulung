# Diagramm (MPSkill `diagramm`, Migration 0258, Beta)

Schlankes Zeichenwerkzeug für **Mindmap · Concept Map · Klassendiagramm · Objektdiagramm**.
„Concept Map“ hieß bis 03.11.2026 „Wirkungsgefüge“; die id bleibt `wirkung` (dg_work.kind, settings.kind),
nur Anzeige und Kacheltext (Migration 0259) sind neu. Bausteine dort heißen „Begriff“.
Vorbild draw.io, aber je Diagrammart nur die Bausteine, die sie braucht. Direkt im Raum gebaut
(`tool.js` + `tool.css`, kein iframe).

## Dateien

- `tool.js` – alles: Diagrammarten (`KINDS`), Zeichnen (doc → SVG-Text), `Canvas` (Verschieben,
  Zoomen, Ziehen, Anfasser), `Editor` (Leisten, Text-Kasten, Rückgängig), Rollen.
- `tool.css` – Aussehen, Farben der Seite (hell/dunkel). Bausteine tragen feste Pastellfarben
  (`COLORS` in tool.js), die auch im exportierten PNG landen.
- `tests/logik.test.mjs` – `sane`, `clean`, neue Felder, rechtwinklige Linien, Rand-Punkte, Mindmap mit mehreren Themen (ohne Browser, Textbreite 8 px je Zeichen).
- `tests/harness.html` – Prüfseite ohne Server: `?rolle=schueler|lehrer|demo`, `&art=wirkung`; `window.__store`
  spielt den Server nach (Teilen, Anfrage `ask`, Diagramm der Lehrkraft `teacher`, Klasse Mia teilt/Leon nicht).
- Schaufenster: `MPSkills/preview/diagramm.js` (Lehrkraft-Ansicht mit erfundener Klasse,
  `DEMO_PEOPLE` in tool.js).

## Aussehen (03.11.2026)

Zwei Kleider, umgeschaltet über die Klasse an der Zeichenfläche (`.dg-canvas.k-paper` / `.k-uml`):

- **Papier** (Mindmap, Concept Map): Tisch in warmem Ton mit Punkten und ganz leichtem Papierkorn
  (zweite Hintergrund-Ebene, data:-SVG). Zettel fast eckig (rx 2–3) mit leichtem Schatten
  (`#dgPaper`), beim Ziehen hebt sich der Zettel (`#dgLift`, `Canvas.lift`). Mitte der Mindmap = großer
  Zettel mit Kreppband und Farbstreifen unten; Äste = farbige Zettel; Begriffe der Concept Map =
  Karteikarten mit Farbstreifen oben; Linien Bleistift-Grau (`--dg-line`). Schrift Outfit. Zettel bleiben
  auch im Dunkelmodus hell (Papier auf dunklem Tisch).
- **Karte wie SQL Studio** (Klassen-, Objektdiagramm; `tools/SQLStudio/js/diagram.js`): weiße Karte rx 12,
  Schatten `#dgCard`, Kopf `--dg-head` (Petrol, Name links, fett 14), Zeilen 24 px mit Zebrastreifen, Typ
  bzw. Wert rechts in JetBrains Mono (`umlRow` teilt „- name: String“, „+ m(): void“, „x = 5“), Linien
  `--dg-link`. Farbe 0 = Petrol-Kopf, andere Farben = Pastell-Kopf. Dunkel mit den Werten aus SQL Studio.
- Farben, die mit hell/dunkel kippen, stehen als `var(--dg-…)` in den SVG-Attributen (tool.css);
  `exportSVG` ersetzt sie durch `VARS_EXPORT`. Der PNG-Export bettet die Schriften ein
  (`loadExportFonts`: holt `fonts/outfit-inter-jetbrainsmono-985fda.css`, nur latin, als data:-URL),
  sonst passte die Ersatzschrift nicht in die gemessenen Kästen.

## Datenmodell (`dg_work.doc`)

```jsonc
{ "v": 1, "kind": "mindmap|wirkung|klasse|objekt", "ortho": true /* nur UML, rechtwinklig */,
  "nodes": [{ "id", "type": "center|topic|box|class|object|note", "x", "y", "t", "c", "a", "o", "k" }],
  "edges": [{ "id", "a", "b", "type", "f": "k|g|r", "l", "m1", "m2", "pa", "pb", "lo", "o1", "o2" }] }
```

- `x/y` = Mitte; Größe wird aus dem Text gerechnet (`measure`, nie gespeichert – `clean` schneidet `_…` ab).
- `t` Text/Name, `a` Attribute, `o` Methoden, `k` Klasse eines Objekts, `c` Farbindex.
- Kanten: `branch` (Mindmap), `effect` (Wirkung, Farbe `f`: k schwarz · g grün · r rot – seit 03.11.2026 statt +/−; `sane()` übersetzt alte `s`: − → rot, sonst schwarz; der Skill deutet die Farben nicht), UML `assoc · directed · inherit · aggr ·
  comp · dep`, `link` (Objekte), `line/arrow`. Vererbung: Pfeil von Unter- zur Oberklasse;
  Aggregation/Komposition: Raute am Anfang (`a` = das Ganze). „Richtung umdrehen“ tauscht a/b.
- `pa`/`pb`: selbst verschobener Andockpunkt am Anfang/Ende, `[u, v]` in −1…1 (Anteil der halben
  Breite/Höhe, auf dem Rand; `borderU`) — wächst der Kasten, wandert er mit. Fehlt = von selbst.
- `lo`/`o1`/`o2`: Feinjustierung von Beschriftung bzw. Anzahlen, `[dx, dy]` px relativ zum
  ausgerechneten Platz, höchstens ±`LAB_MAX` (70) — wandern mit der Linie mit.
- `ortho` (oben zwei Bild-Knöpfe schräg | rechtwinklig, `.dg-lines`, nur Klassen-/Objektdiagramm): Linien wie in SQL Studio
  (`orthoEnds` wählt die Seiten: nebeneinander waagrecht, übereinander senkrecht, ineinander außen rechts;
  `orthoRoute` baut den Linienzug, `roundPath` rundet die Ecken). Gesetzte Andockpunkte bestimmen die Seite.
- Mindmap: beliebig viele Themen (`center`, Knopf „Thema“); ein Ast zu einem anderen Thema wird eine
  Linie. Ziehen eines Themas nimmt seinen Baum mit (`subtree` endet an anderen Themen), „Ordnen“ legt die
  Bäume untereinander, das letzte Thema lässt sich nicht löschen.
- **Alles vom Server geht durch `sane()`** – ids nur `[A-Za-z0-9_-]{1,40}` (landen in
  data-Attributen der Lehrkraft-Ansicht), Typen gegen feste Listen, Texte gekürzt. Texte immer über `esc()`.

## Bedienung

**Leisten**: oben links **Datei** (Menü: Neu · Öffnen … · Speichern · Als Bild (PNG) · bei Schülern
„Diagramm der Lehrkraft“, solange eins geteilt ist), Art, Titel; Mitte Bausteine; rechts Teilen
(`Editor.setShare`, `paintShare`). Rückgängig/Wiederholen/Zoom/Alles zeigen/Hilfe klein unten rechts auf
der Fläche (`.dg-tools`). Speichern = Datei `<Titel>.diagramm.json` (`saveFile`: `{ app: 'mpskills-diagramm',
v, title, doc }`), Öffnen liest sie (`readFile`, ≤ 1 MB, `sane`), ersetzt nach Rückfrage das jetzige
Diagramm; im Raum mit fester Art nur Dateien dieser Art. Fragen stellt `modal()` (eigenes Fenster im Skill).
Antippen = wählen · doppelt tippen = Text (auf leerer Fläche: neuer Baustein) · ziehen = verschieben
(Mindmap: ganzer Ast) · leere Fläche ziehen = Blatt verschieben · zwei Finger/Mausrad = Zoom.
Blaue Punkte am gewählten Baustein: antippen = neuer Baustein daneben + Verbindung, auf anderen
Baustein ziehen = verbinden, ins Leere ziehen = neuer Baustein dort. Auswahl-Leiste unten: Text, Farbe,
Löschen bzw. Art der Verbindung, Pfeilfarbe (Concept Map: schwarz/grün/rot, der nächste Pfeil bekommt dieselbe), Beschriftung, Multiplizitäten. Mindmap: Tab = Kind, Enter =
Nachbar, „Ordnen“ (`layoutMindmap`). PNG-Export. „Kreisläufe“ gibt es seit 03.11.2026 nicht mehr.
Gewählte Verbindung: weiße Punkte an beiden Enden = Andockpunkt am Rand verschieben (wenn mehrere
Linien ineinander liegen); Beschriftung/Anzahlen lassen sich ein Stück ziehen; „zurücksetzen“ in der
Auswahl-Leiste holt beides wieder auf „von selbst“.
**Mehrfachauswahl**: Strg/⌘ + Klick nimmt Bausteine und Verbindungen dazu (`Canvas.multi`, `selSet()`,
`toggle`, `selectMany`); Ziehen bewegt alle, Leiste unten: Farbe für alle, Kopieren, Ausschneiden, Löschen.
Strg+C/X/V/A; die Zwischenablage `CLIP` gilt seitenweit, nur für dieselbe Diagrammart, Verbindungen
zwischen kopierten Bausteinen kommen mit, jedes Einfügen 30 px versetzt; Knopf „Einfügen“ oben, solange
etwas drin ist (für Tablets ohne Tastatur).
**Textfenster** lässt sich am Griff oben frei verschieben (`editPin`, gilt für die Sitzung des Editors;
Griff doppelt antippen = wieder am Baustein).
Die zuletzt gewählte Verbindungsart gilt für die nächste neue Verbindung.
Verbindung gewählt → unten eine **Skizze des Pfeils** (`edgeForm`): immer Anfang links, Ende rechts, mit
den Namen der beiden Bausteine; Beschriftung über der Mitte, Anzahlen (UML) an den Enden, bei der
Concept Map die Linie in der Pfeilfarbe — die Felder stehen dort, wo ihr Text am Pfeil landet.

## Raum

- Einstellung beim Anlegen `settings.kind` (free | mindmap | wirkung | klasse | objekt). free = Startseite
  „Was möchtest du zeichnen?“, sonst gleich der Editor. Datei → Neu: bei free die Startseite, sonst ein leeres Diagramm der festen Art.
- **Tablet**: `dg_mine_get` beim Start, `dg_mine_put` 1,5 s nach der letzten Änderung (bei Netzfehler
  alle 5 s nachholen), Anzeige „gespeichert ✓“ unten links. Ein Diagramm je Person.
- **Teilen mit der Lehrkraft (0260)**: privat bis die Person oben „Mit Lehrkraft teilen“ tippt
  (`dg_mine_share`, vorher wird gespeichert); dann „Lehrkraft sieht mit“ + „Teilen beenden“. `dg_mine_poll`
  alle 5 s: `shared`, `ask`, `teacher`. Fragt die Lehrkraft (`ask = 'open'`), erscheint am Tablet ein Fenster
  „Deine Lehrkraft fragt“ (Ja = teilen, Nein = `declined`; `dg_mine_answer`).
- **Diagramm der Lehrkraft (0260)**: neue `teacher.rev` → Fenster „Deine Lehrkraft hat ein Diagramm
  geteilt“ (einmal je rev, gemerkt in `localStorage dg.tseen.<code>`): mit eigenem Inhalt „Meins
  herunterladen, dann öffnen“ · „Meins verwerfen und öffnen“ · „An meinem weiterarbeiten“, sonst „Öffnen“ ·
  „Später“. Später unter Datei → „Diagramm der Lehrkraft“ und auf der Startseite als Knopf. Öffnen =
  `dg_mine_teacher_get` → eigene Kopie (ersetzt das eigene, wird normal gespeichert).
- **Lehrkraft**: Reiter „Diagramme der Klasse“ – `dg_class_list` alle 3 s (nur Kopfdaten, `rev`; Zähler
  geteilt/alle). Nicht geteilte stehen ausgegraut mit „Ansehen anfragen“ (Rückfrage-Fenster, dann
  `dg_class_ask`; „angefragt …“ / „abgelehnt“ → „erneut fragen“, höchstens alle 30 s). Geteilte bis zu
  zwei antippen → nebeneinander (Split Screen), `dg_class_get` nur bei neuem `rev`; läuft live mit,
  solange niemand in der Ansicht selbst zoomt/verschiebt („Alles zeigen“ schaltet das Mitführen wieder
  ein). „Liste ausblenden“ für den Beamer. Reiter „Mein Diagramm“: eigener Editor im Gerät
  (`localStorage dg.own.<code>`); oben „Mit Klasse teilen“ (Rückfrage) → Schnappschuss per
  `dg_class_share` in `dg_shared`; danach „Mit Klasse geteilt“ · „Neu geben“ (jetziger Stand, rev + 1, die
  Tablets werden wieder gefragt) · „Zurücknehmen“ (`dg_class_unshare`; geöffnete Kopien bleiben).
  Wer das Teilen beendet, verschwindet vorne aus dem Vergleich. Ohne Migration 0260 (kein `shared` in der
  Liste) zeigt der Skill wie früher alles.

## Server (Migrationen 0258, 0260)

Tabelle `dg_work` (eine Zeile je Teilnehmer, CASCADE an Raum und Teilnehmer, doc ≤ 300 000 Byte; seit
0260 `shared`, `ask` open|declined, `ask_at`), Tabelle `dg_shared` (0260, eine Zeile je Raum, CASCADE),
RPCs `dg_mine_get/put/poll/share/answer/teacher_get` (Token, anon), `dg_class_list/get/ask/share/unshare`
(Lehrkraft des Raums inkl. eingeladener, `skill_room_is_teacher`). `dg_class_get` nur bei `shared`
(sonst `not_shared`), `dg_class_list` verrät bei nicht geteilten nur Name, Art und Anfrage.
Prüfstände `supabase/tests/0258_diagramm.mjs`, `0260_diagramm_teilen.mjs`, Freigaben in
`0225_rechte_freigaben.json`.
