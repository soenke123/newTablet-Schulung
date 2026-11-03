# Diagramm (MPSkill `diagramm`, Migration 0258, Beta)

Schlankes Zeichenwerkzeug für **Mindmap · Wirkungsgefüge · Klassendiagramm · Objektdiagramm**.
Vorbild draw.io, aber je Diagrammart nur die Bausteine, die sie braucht. Direkt im Raum gebaut
(`tool.js` + `tool.css`, kein iframe).

## Dateien

- `tool.js` – alles: Diagrammarten (`KINDS`), Zeichnen (doc → SVG-Text), `Canvas` (Verschieben,
  Zoomen, Ziehen, Anfasser), `Editor` (Leisten, Text-Kasten, Rückgängig), Rollen.
- `tool.css` – Aussehen, Farben der Seite (hell/dunkel). Bausteine tragen feste Pastellfarben
  (`COLORS` in tool.js), die auch im exportierten PNG landen.
- `tests/logik.test.mjs` – Kreisläufe, `sane`, `clean` (ohne Browser).
- `tests/harness.html` – Prüfseite ohne Server: `?rolle=schueler|lehrer|demo`, `&art=wirkung`.
- Schaufenster: `MPSkills/preview/diagramm.js` (Lehrkraft-Ansicht mit erfundener Klasse,
  `DEMO_PEOPLE` in tool.js).

## Datenmodell (`dg_work.doc`)

```jsonc
{ "v": 1, "kind": "mindmap|wirkung|klasse|objekt",
  "nodes": [{ "id", "type": "center|topic|box|class|object|note", "x", "y", "t", "c", "a", "o", "k" }],
  "edges": [{ "id", "a", "b", "type", "s": "+|-", "l", "m1", "m2" }] }
```

- `x/y` = Mitte; Größe wird aus dem Text gerechnet (`measure`, nie gespeichert – `clean` schneidet `_…` ab).
- `t` Text/Name, `a` Attribute, `o` Methoden, `k` Klasse eines Objekts, `c` Farbindex.
- Kanten: `branch` (Mindmap), `effect` (Wirkung mit `s`), UML `assoc · directed · inherit · aggr ·
  comp · dep`, `link` (Objekte), `line/arrow`. Vererbung: Pfeil von Unter- zur Oberklasse;
  Aggregation/Komposition: Raute am Anfang (`a` = das Ganze). „Richtung umdrehen“ tauscht a/b.
- **Alles vom Server geht durch `sane()`** – ids nur `[A-Za-z0-9_-]{1,40}` (landen in
  data-Attributen der Lehrkraft-Ansicht), Typen gegen feste Listen, Texte gekürzt. Texte immer über `esc()`.

## Bedienung

Antippen = wählen · doppelt tippen = Text (auf leerer Fläche: neuer Baustein) · ziehen = verschieben
(Mindmap: ganzer Ast) · leere Fläche ziehen = Blatt verschieben · zwei Finger/Mausrad = Zoom.
Blaue Punkte am gewählten Baustein: antippen = neuer Baustein daneben + Verbindung, auf anderen
Baustein ziehen = verbinden, ins Leere ziehen = neuer Baustein dort. Auswahl-Leiste unten: Text, Farbe,
Löschen bzw. Art der Verbindung, +/−, Beschriftung, Multiplizitäten. Mindmap: Tab = Kind, Enter =
Nachbar, „Ordnen“ (`layoutMindmap`). Wirkungsgefüge: +/− auf dem Pfeil antippen dreht um,
„Kreisläufe“ (`findLoops`, gerade Zahl an − = verstärkend R, ungerade = ausgleichend B). PNG-Export.
Die zuletzt gewählte Verbindungsart gilt für die nächste neue Verbindung.
Verbindung gewählt → unten eine **Skizze des Pfeils** (`edgeForm`): immer Anfang links, Ende rechts, mit
den Namen der beiden Bausteine; Beschriftung über der Mitte, Anzahlen (UML) an den Enden, beim
Wirkungsgefüge das +/− auf der Linie — die Felder stehen dort, wo ihr Text am Pfeil landet.

## Raum

- Einstellung beim Anlegen `settings.kind` (free | mindmap | wirkung | klasse | objekt). free = Startseite
  „Was möchtest du zeichnen?“, sonst gleich der Editor. „Neu“ nur bei free.
- **Tablet**: `dg_mine_get` beim Start, `dg_mine_put` 1,5 s nach der letzten Änderung (bei Netzfehler
  alle 5 s nachholen), Anzeige „gespeichert ✓“ unten links. Ein Diagramm je Person.
- **Lehrkraft**: Reiter „Diagramme der Klasse“ – `dg_class_list` alle 3 s (nur Kopfdaten, `rev`), bis zu
  zwei antippen → nebeneinander (Split Screen), `dg_class_get` nur bei neuem `rev`; läuft live mit,
  solange niemand in der Ansicht selbst zoomt/verschiebt („Alles zeigen“ schaltet das Mitführen wieder
  ein). „Liste ausblenden“ für den Beamer. Reiter „Mein Diagramm“: eigener Editor, vorerst nur im Gerät
  (`localStorage dg.own.<code>`).
- **Kommt später**: Lehrkraft teilt ihr Diagramm mit der Klasse zum Weiterbearbeiten (Idee:
  `skill_room_state.data.shared` oder eigene Tabelle `dg_shared`, Tablet übernimmt es als Vorlage).

## Server (Migration 0258)

Tabelle `dg_work` (eine Zeile je Teilnehmer, CASCADE an Raum und Teilnehmer, doc ≤ 300 000 Byte),
RPCs `dg_mine_get/put` (Token, anon), `dg_class_list/get` (Lehrkraft des Raums inkl. eingeladener,
`skill_room_is_teacher`). Prüfstand `supabase/tests/0258_diagramm.mjs`, Freigaben in
`0225_rechte_freigaben.json`.
