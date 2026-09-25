# Knowledge Stack

Das Live-Quiz der Klasse — Fragen am Beamer, Antworten auf den Tablets.
Siebter MPSkills-Skill.

## Wer sieht was

Das ist keine Geschmacksfrage, sondern die Spielregel:

| | Beamer (`presenter`) | Tablet (`participant`) |
|---|---|---|
| **Lobby** | Katalogwahl · Startknopf · Wand mit allen Wesen | Wesenwahl (36 × 3 Farben) · Emote-Knöpfe |
| **Frage** | Fragetext groß · Uhr · vier Antwortfelder · „x von y haben geantwortet" | Das **eigene Wesen** · vier Antwortfelder · **keine Frage** |
| **Auflösung** | Die fünf Ersten dort, wo die Frage stand (1 links … 5 rechts) · dieselben vier Felder als **Füllstände** mit absoluten Zahlen · Erklärung | Richtig/Falsch · der Nachbar vor mir, ich, der Nachbar hinter mir · Emote-Knöpfe |
| **Siegerehrung** | Podest der fünf Ersten · **alle** Wesen mit Punkten, alle emoten | Endplatz · Emotes · Wesen für die nächste Runde ändern |

Die Frage steht **nicht** auf dem Schülergerät — weder in der Anzeige noch in
der Serverantwort (`ks_view` gibt `question.text = null`, solange die Frage
läuft). Sonst sehen 28 Köpfe nach unten statt nach vorn.

## Wie der Ablauf läuft

```
lobby ──► question ──► reveal ──► question ──► … ──► ended ──► lobby
             │            ▲
             └─ Uhr um ───┘   (schließt der SERVER, nicht das Gerät)
```

Die Lehrkraft klickt nur vorwärts. Läuft die Uhr ab, schließt
`ks_ensure_board` die Frage beim nächsten Leseaufruf von selbst — damit
bleibt sie auch dann nicht offen, wenn der Beamer-Tab im Hintergrund liegt
und der Browser den Takt drosselt. Weitergeschaltet wird mit
`ks_step(code, p_from)`; passt `p_from` nicht mehr zur Phase, verpufft der
Klick (`stale`) statt eine Frage zu überspringen.

`podium` war bis 0174 eine eigene Phase und ist es nicht mehr: Verteilung
und Rangliste stehen zusammen im Auflösungsbild. Im CHECK der Tabelle steht
der Wert weiter (kein DROP), und ein Brett, das noch darin hängt, verhält
sich wie in `reveal`.

## Dateien

| Datei | Was drinsteht |
|---|---|
| `tool.js` | Beide Rollen, ein Modul. Takt, gemessene Höhe, Bild bauen und flicken. |
| `tool.css` | Alles rechnet aus `--ks-h` (der gemessenen Rahmenhöhe), nichts aus `vh`. |
| `creatures.js` | Die 36 Wesen: Liste, 108 Paletten, SVG-Körper. |
| `creatures.css` | Ihre Bewegungen: `wave-7`, `cheer-7`, `c-dance-7`, `state-sad` … |
| `showroom-*.html` | Entwurfsstand, **eingefroren** (siehe `feedback_showrooms_frozen`). Quelle der Wesen-Daten, wird nicht mitgezogen. |

Die Wesen-Dateien hängen an `ASSET_V` in `tool.js` — dem einen Stempel für
beide. Der Stempel von `tool.js`/`tool.css` selbst steht in `lib/tool.js`
und dessen eigener an vier weiteren Stellen (Kopf von `lib/tool.js`).

## Prüfstände

```
node MPSkills/tools/KnowledgeStack/tools/uitest.js            # alle Bereiche
node MPSkills/tools/KnowledgeStack/tools/uitest.js emote      # nur einer
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js          # echter Browser
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js --shots  # …mit Bildern
node supabase/tests/0175_knowledgestack_flow.mjs              # SQL in pglite
```

* **uitest.js** (linkedom, kein Browser) — *was* im Bild steht: die echten
  Emote-Klassen, kein Fragetext auf dem Tablet, die Reihenfolge 1…5, dass ein
  Takt ohne Phasenwechsel das Bild **nicht** neu baut.
* **fitcheck.js** (Chromium) — ob es *hineinpasst*: kein Überlauf, der Rahmen
  endet an der Bildschirmkante, nichts ragt heraus, Tippflächen ≥ 44 px,
  Schrift lesbar. Über elf Bildschirmgrößen × beide Rollen × vier Bilder. Die
  Seite drumherum (Kopfzeile, Reiterleiste) wird dabei echt aufgebaut — ohne
  sie wäre die gemessene Höhe zu groß und der Prüfstand grün, wo der Beamer
  rot ist.
* **0175_…mjs** (pglite) — der Ablauf, die Serveruhr, die Punkte, die Rechte.

## Migrationen

`0174_knowledgestack_game.sql` legt die Tabellen an, `0175_knowledgestack_flow.sql`
räumt den Ablauf auf. Beide spielt Sönke selbst im Supabase-Dashboard ein.

## Was noch fehlt

* **Ein Fragen-Editor.** Die Lehrkraft kann in der Lobby einen Katalog
  *wählen*, aber keinen anlegen. `ks_catalogs`/`ks_questions` und die Rechte
  stehen dafür schon (`grant … to authenticated`), die Oberfläche fehlt.
  Ohne sie ist das Quiz auf die 12 Seed-Fragen der Tablet-Schulung begrenzt.
* **Ein Schaufenster** (`MPSkills/preview/knowledgestack.js`), damit die
  Kachel auf der Landing etwas zeigt.
