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

## Die fünf Emotes

👋 Winken · 🚀 Springen · 🎉 Jubeln · 🕺 Tanzen · 😴 Schlafen — dazu 💧 Trauer,
die niemand drückt (die setzt der Server bei einer falschen Antwort).

Jedes der 36 Wesen hat seine eigene Fassung davon; die Klassen heißen
`wave-7 state-wave`, `c-dance-7 state-dance`, `jump-7 state-jump`. Der Sprung
geht **über den Kasten hinaus** — dafür öffnet `setEmote` das Fenster um das
Wesen (Klasse `ks-springt`) und nur für die Dauer des Sprungs. Seine Höhe steht
in Prozent der eigenen Wesengröße und nicht in Pixeln: dieselbe Bewegung muss in
einer 90 Punkte breiten Karte am Beamer und in einer 250 Punkte großen Vorschau
auf dem Tablet gleich aussehen.

## Hell und dunkel

Das Quiz bringt seine Farben selbst mit, kippt aber mit dem Umschalter in der
Kopfzeile — **je Gerät**: der Beamer im abgedunkelten Raum steht auf dunkel, das
Tablet am Fenster auf hell. Gesetzt wird `data-theme` von `lib/theme.js`, und
`tool.css` hat dafür zwei Sätze derselben Variablen. Gleich bleiben in beiden
Fassungen die vier Antwortfarben — „die blaue B" muss dasselbe heißen, egal wer
wie eingestellt ist.

Zwei Fallen stecken darin, beide am 26.09.2026 gefunden:

* Wesen, die selbst fast weiß sind, verschwinden auf einer weißen Karte. Die
  Kästen, in denen ein Wesen steht (`--ks-karte`), sind im Hellen deshalb
  leicht blaugrau und **dunkler** als die Fläche dahinter.
* `opacity` blendet im Dunkeln nach Schwarz ab und im Hellen nach Weiß. Die
  abgeblendeten falschen Antworten waren damit im Hellen bei 1,9 : 1 — im
  Hellen treten sie über weniger Farbe zurück (`grayscale`), nicht über
  weniger Deckung.

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

## Die Wesenwand

Am Beamer stehen die Wesen **unten** in der Fläche, nicht mittig — darüber ist
die Luft, in die sie springen. Die Spalte hat eine Ober- *und* eine
Untergrenze: `auto-fit` wirft leere Spalten weg, und mit `1fr` bekam die eine
verbliebene die ganze Breite. Beim ersten Kind, das den Raum betrat, stand
damit ein Wesen über den halben Beamer („viel zu groß", 26.09.2026). Die
Obergrenze ist so gewählt, dass eine volle Klasse ohne Rollen hineinpasst —
`fitcheck.js` prüft beides: die Karte bleibt kartengroß, und alle 28 sind zu
sehen.

## Dateien

| Datei | Was drinsteht |
|---|---|
| `tool.js` | Beide Rollen, ein Modul. Takt, gemessene Höhe, Bild bauen und flicken. |
| `tool.css` | Alles rechnet aus `--ks-h` (der gemessenen Rahmenhöhe), nichts aus `vh`. Alle Farben stehen in zwei Sätzen ganz oben. |
| `creatures.js` | Die 36 Wesen: Liste, 108 Paletten, SVG-Körper. |
| `creatures.css` | Ihre Bewegungen: `wave-7`, `cheer-7`, `c-dance-7`, `state-sad` … |
| `showroom-*.html` | Entwurfsstand, **eingefroren** (siehe `feedback_showrooms_frozen`). Quelle der Wesen-Daten, wird nicht mitgezogen. |

Die Wesen-Dateien hängen an `ASSET_V` in `tool.js` — dem einen Stempel für
beide. Der Stempel von `tool.js`/`tool.css` selbst steht in `lib/tool.js`
und dessen eigener an vier weiteren Stellen (Kopf von `lib/tool.js`).

## Prüfstände

```
node MPSkills/tools/KnowledgeStack/tools/uitest.js            # alle Bereiche
node MPSkills/tools/KnowledgeStack/tools/uitest.js emote      # emote|tab|beam|fluss|theme
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js          # echter Browser
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js --shots  # …mit Bildern
node supabase/tests/0175_knowledgestack_flow.mjs              # SQL in pglite
```

* **uitest.js** (linkedom, kein Browser) — *was* im Bild steht: die echten
  Emote-Klassen, kein Fragetext auf dem Tablet, die Reihenfolge 1…5, dass ein
  Takt ohne Phasenwechsel das Bild **nicht** neu baut. Der Bereich `theme`
  prüft dazu am Blatt selbst, dass **keine Farbe** außerhalb der beiden Sätze
  steht — genau daran lag es, dass der Umschalter am Quiz nichts tat.
* **fitcheck.js** (Chromium) — ob es *hineinpasst*: kein Überlauf, der Rahmen
  endet an der Bildschirmkante, nichts ragt heraus, Tippflächen ≥ 44 px,
  Schrift lesbar. Über elf Bildschirmgrößen × beide Rollen × fünf Bilder
  (darunter die Lobby mit **einem** Kind — der Fall, in dem eine Karte sonst
  den halben Beamer füllt). Am Ende beide Fassungen hell/dunkel mit
  Kontrastmessung nach WCAG. Die Seite drumherum (Kopfzeile, Reiterleiste)
  wird dabei echt aufgebaut — ohne sie wäre die gemessene Höhe zu groß und der
  Prüfstand grün, wo der Beamer rot ist.
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

## Quiz aus Text (Copy & Paste)

Zusätzlich zum Fragen-Editor: Im Katalog (📋 „Aus Text") oder im Editor
(„Aus Text" → hängt an) lässt sich ein Quiz als Text einfügen oder tippen.
`parse.js` (`window.KSParse.parse`, auch in Node ladbar) erkennt Fragen,
Antworten, Richtig-Markierungen (`*` `✓` `(richtig)` `**fett**`, `Lösung: b`,
Schlüssel `1-b`), Erklärungen und einen Titel; Nummern/Buchstaben dürfen
fehlen oder falsch sein, Zeilenumbrüche werden zusammengefügt. Fragen ohne
Antworten bleiben „nur Frage". Das Textfeld liegt über einer deckungsgleichen
Zweitschicht (`.kse-imp-back`), die Zeilen einfärbt — dafür darf die
Rückseite keine Schriftbreite ändern (kein Padding, kein Fettdruck). „Übernehmen"
öffnet den normalen Editor mit dem Erkannten.
