# Knowledge Stack

Das Live-Quiz der Klasse — Fragen am Beamer, Antworten auf den Tablets.
Siebter MPSkills-Skill.

## Wer sieht was

Das ist keine Geschmacksfrage, sondern die Spielregel:

| | Beamer (`presenter`) | Tablet (`participant`) |
|---|---|---|
| **Lobby** | Katalogwahl · Startknopf · Wiese: die Wesen fallen herein und laufen herum | Wesenwahl (36 × 3 Farben) · Emote-Knöpfe |
| **Start der Runde** (erste Frage, 10 s) | „**Quiz startet**“ + Name des Fragenkatalogs groß; alle Wesen regnen von oben herein, landen und laufen rechts aus dem Bild | Nur das eigene Wesen und „Gleich geht’s los — pass auf!“ |
| **Frage** | Fragetext groß · Uhr · vier Antwortfelder · „x von y haben geantwortet" | Das **eigene Wesen** · vier Antwortfelder · **keine Frage** |
| **Auflösung** | Die fünf Ersten dort, wo die Frage stand (1 links … 5 rechts) · dieselben vier Felder als **Füllstände** mit absoluten Zahlen · Erklärung | Richtig/Falsch · der Nachbar vor mir, ich, der Nachbar hinter mir · Emote-Knöpfe |
| **Siegerehrung** | Treppchen 2 · 1 · 3 (Platz 3, 2, dann mit Trommelwirbel 1 springen hinauf) · darunter klein **alle** Wesen mit Punkten, sie klatschen, alle emoten | **Nur die Emote-Leiste**, der obere Teil ist leer (es passiert am Beamer). Wer **gewonnen** hat (Platz 1), sieht sofort „Du hast gewonnen!“ mit Konfetti |

Die Frage steht **nicht** auf dem Schülergerät — weder in der Anzeige noch in
der Serverantwort (`ks_view` gibt `question.text = null`, solange die Frage
läuft). Sonst sehen 28 Köpfe nach unten statt nach vorn.

## Die Wesen (Fassung 2, Oktober 2026)

Alle 36 Wesen sind neu gezeichnet — gleiche Ids, Namen und Farbfassungen
(die stehen als Zahl in der Datenbank), aber auf **einem gemeinsamen
Skelett**:

```
svg.creature-svg
  cr-shadow · cr-root ( cr-behind · leg-l/-r · body-base ( head-node ( face · backside ) )
                        · arm-l/-r · cr-front · cr-fx ) · cr-ov
```

Vorher war jedes Wesen anders gebaut, und die Bewegungen in
`creatures.css` suchten Teile, die es im Körper nicht gab — dann bewegte
sich nichts. Jetzt stehen die Bewegungen **einmal für alle** in
`creatures.css`, und je Wesen nur noch, was es besonders macht (Flügel
schlagen, Schwanz wedeln, Toast springt, Runen kreisen …). Die Gesichter
kommen alle aus `face()` in `creatures.js` — offen, fröhlich, schlafend,
traurig, schwindlig.

Zeichenregeln: alles im Kasten 0…100 (der Kasten schneidet ab, nur der
Sprung darf hinaus), Boden bei y = 92, eine Linienfarbe (`--ink`),
Glanz oben links, Schatten unten rechts. Die magischen Wesen (Zorp, Mimi,
Pips, Lumi, Astris, Arcana) funkeln dauernd und sprühen beim Jubeln,
Tanzen und Springen Sterne (`.cr-burst`).

Zum Ansehen: **`showroom-wesen.html`** (läuft ohne Netz, benutzt genau
`creatures.js`/`creatures.css`): alle Wesen × Farben × Bewegungen,
hell/dunkel, und eine Bühne mit Rundgang.

## Die Emotes

👋 Winken · 🚀 Springen · 🎉 Jubeln · 🕺 Tanzen · 😴 Schlafen — dazu 💧 Trauer,
die niemand drückt (die setzt der Server bei einer falschen Antwort).

Die Klassen heißen wie bisher `wave-7 state-wave`, `c-dance-7 state-dance`,
`jump-7 state-jump` (tool.js `emoteClass`). `state-…` steuert das Gesicht
und die gemeinsame Bewegung, `wave-7` die Besonderheit des Wesens. Der
Sprung geht **über den Kasten hinaus** — dafür öffnet `setEmote` das
Fenster um das Wesen (Klasse `ks-springt`) und nur für die Dauer des
Sprungs. Alle Wege stehen in Einheiten des viewBox: dieselbe Bewegung sieht
in einer 90 Punkte breiten Karte am Beamer und in einer 250 Punkte großen
Vorschau gleich aus.

## Bewegung am Beamer (Oktober 2026)

Nur am Beamer, alles in `tool.js` (Abschnitt „BEWEGUNG"):

* **Lobby — die Wiese.** Wer den Raum betritt, fällt von oben herein,
  plumpst auf den Hintern (`plop`, Staubwolken und ein „plumps!") und
  steht auf (`getup` from-sit). Danach läuft jedes Wesen herum: hin und
  her (`walk` left/right) und nach vorn und zurück (front/back). Hinten
  ist kleiner und weiter oben, vorn verdeckt hinten. Wer **emotet**,
  bleibt stehen, dreht sich nach vorn, emotet mindestens 3,5 und
  höchstens 5 Sekunden und läuft weiter. Die Figurgröße rechnet
  `wieseTakt` aus Fläche und Kinderzahl.
* **Auflösung — Plätze tauschen.** Das neue Podest wird gebaut, dann
  läuft jedes Wesen, das vorher woanders stand, von seinem alten Platz
  herüber. Wer neu unter den fünf Ersten ist, kommt von rechts herein,
  wer herausfällt, geht rechts hinaus. Name und Punkte erscheinen, wenn
  es angekommen ist. Der alte Stand steht in `podestVorher`.
* **Siegerehrung — das Treppchen.** Alle stehen klein unten in der
  Menge. Nach der Ansage springt Platz 3 in einem Bogen aufs Treppchen,
  dann Platz 2. Dann kommt der Trommelwirbel (die Menge tippelt, Platz 1
  glüht), und Platz 1 springt hinauf. Danach gibt es Konfetti und einen
  Lichtkegel, oben wird gejubelt, und alle anderen klatschen 8 Sekunden
  lang (`state-clap`, neu in creatures.css). Emotes gehen überall
  dazwischen. Wer oben steht, hinterlässt unten eine Lücke.

Wer Bewegung abgestellt hat (`prefers-reduced-motion`), bekommt sofort
das Endbild: die Wand im Raster, das Treppchen besetzt. `uitest.js`
(ohne Browser) prüft dieses Endbild, `fitcheck.js` misst das Layout mit
abgestellter Bewegung und hat dazu einen eigenen Abschnitt „Bewegung am
Beamer", der wartet, bis alles gelandet ist.

## Eigene Emotes je Wesen

Winken, Jubeln, Tanzen, Springen und Traurig sehen bei jedem Wesen anders
aus. Je Emote gibt es in `creatures.css` sechs Körper-Bewegungen, sechs
Arm-Bewegungen und vier Kopf-Bewegungen (z. B. Tanzen: Hüftschwung,
Abtauchen, Moonwalk, Pirouette, Pogo, Shimmy × Arme im Wechsel,
Disco-Zeigen, Windmühle, Posen, Welle, Roboter). `moves()` in
`creatures.js` verteilt sie so, dass bei jedem Emote keine zwei der 36
Wesen dieselbe Körper-und-Arm-Kombination haben, und gibt jedem Wesen je
Emote ein eigenes Tempo. Die Wahl steht im Attribut `data-mv` am `<svg>`
und bleibt stehen, wenn `tool.js` die Klasse wechselt. Was ein Wesen
sonst noch besonders macht (Flügel, Wheelie, Kopfrollen), steht wie
bisher darüber. Der Sprung geht jetzt bis gut 80–100 % der Wesenhöhe
hinauf (Hochsprung, Salto, Doppelsprung, Schraube, Rakete, Trampolin).
`showroom-wesen.html` schreibt unter jedes Wesen, welche Bewegungen es
gerade zeigt (`KSCreatures.moveNames(id, emote)`).

## Bewegungen der Wesen (KSCreatures.cls)

`KSCreatures.cls(aktion, id, richtung)` baut die Klassen:

| Aufruf | Was passiert |
|---|---|
| `cls('walk', id, 'left'\|'right'\|'front'\|'back')` | Gehen auf der Stelle, Schleife. Seitlich schaut das Gesicht in Laufrichtung, von hinten ist das Gesicht weg und `.backside` zu sehen. **Wohin** das Wesen läuft, macht der Aufrufer (translate am Kasten). |
| `cls('fall', id)` | wackelt, stolpert, kippt um, bleibt liegen (Schwindel-Augen, Sterne). Einmal, bleibt stehen. |
| `cls('plop', id)` | Hopser, Plumps auf den Hintern, sitzt mit Beinen nach vorn. Einmal. |
| `cls('getup', id)` | steht aus dem Liegen auf (nach `fall`). |
| `cls('getup', id, 'sit')` | steht aus dem Sitzen auf (nach `plop`). |

Turbo (die Rennschnecke) ist breiter als hoch und kippt deshalb nicht um,
sondern schleudert aufs Schneckenhaus zurück.

## Hell und dunkel

Das Quiz bringt seine Farben selbst mit, kippt aber mit dem Umschalter in der
Kopfzeile — **je Gerät**: der Beamer im abgedunkelten Raum steht auf dunkel, das
Tablet am Fenster auf hell. Gesetzt wird `data-theme` von `lib/theme.js`, und
`tool.css` hat dafür zwei Sätze derselben Variablen. Gleich bleiben in beiden
Fassungen die vier Antwortfarben — „die blaue B" muss dasselbe heißen, egal wer
wie eingestellt ist.

Drei Fallen stecken darin:

* Wesen, die selbst fast weiß sind, verschwinden auf einer weißen Karte. Die
  Kästen, in denen ein Wesen steht (`--ks-karte`), sind im Hellen deshalb
  leicht blaugrau und **dunkler** als die Fläche dahinter.
* `opacity` blendet im Dunkeln nach Schwarz ab und im Hellen nach Weiß. Die
  abgeblendeten falschen Antworten waren damit im Hellen bei 1,9 : 1 — im
  Hellen treten sie über weniger Farbe zurück (`grayscale`), nicht über
  weniger Deckung.
* Im Dunkeln verschwand die schwarze Kontur dunkler Wesen (Umbra, Spindle,
  Pebbl, Fuzz) auf der fast schwarzen Karte. `.ks-wesen` trägt deshalb
  eine feine Lichtkante (`--ks-wesenrand`, im Hellen durchsichtig) — am
  Kasten und nicht am `<svg>`, weil creatures.css dort eigene Filter
  setzt (Snips Farbwechsel).

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

## Fair: die Antworten erscheinen überall gleichzeitig

Jede Frage beginnt mit **5 Sekunden Vorlesezeit** (0178): am Beamer die
Frage und darunter ein großer Countdown, auf dem Tablet „Blick nach vorn"
mit demselben Countdown. Danach decken Beamer und alle Tablets die
Antworten **im selben Augenblick** auf. Die 5 Sekunden sind die Zeit, in
der jedes Gerät von der neuen Frage erfährt.

Damit das wirklich gleichzeitig ist (Oktober 2026, 0189):

* **Uhrabgleich wie bei NTP** (`uhrProbe` in `tool.js`): jeder Aufruf
  misst Hin- und Rückweg, die Serveruhr wird in der Mitte angesetzt, es
  gilt die Probe mit dem kürzesten Weg. Vorher galt eine einzige Probe
  ohne Laufzeit — ein Tablet im vollen WLAN deckte bis zu einer Sekunde
  später auf. `ks_sig`/`ks_room_sig` liefern dafür `server_now` mit.
* **Wecker auf die Millisekunde** (`weckerAufdecken`) statt des
  250-ms-Schlags.
* **Zeitstempel von Hand gelesen** (`zeit`): Postgres schreibt
  Mikrosekunden, ältere Safaris machten daraus NaN — dann gab es auf dem
  iPad gar keine Vorlesezeit.
* **Die Netzlaufzeit zählt nicht als Denkzeit**: `ks_answer` nimmt die
  auf dem Gerät gemessene Zeit, eingefasst in [Serverzeit − 1,5 s,
  Serverzeit]. Ein Tipp bis 1 s vor dem Aufdecken (Uhr knapp daneben)
  zählt als „sofort" statt abgewiesen zu werden.
* Das Tablet fragt in Lobby und Auflösung alle 2 bzw. 1,5 s nach — es
  muss die neue Frage kennen, bevor die 5 Sekunden um sind.

## Der Auftritt vor der ersten Frage (0191)

Der Auftritt hat keine eigene Phase: `ks_step` legt `phase_ends_at` der
**ersten Frage einer Runde** um 9 Sekunden weiter nach hinten
(`v_intro`, in `tool.js` `INTRO_SEC` — beide müssen übereinstimmen). Alles,
was über den 5 Sekunden Vorlesezeit liegt, ist Auftritt (`introAn`). Dadurch
kennt jedes Gerät den Moment, in dem die Frage kommt, aus derselben
Serveruhr, ein neu geladenes Tablet steigt mittendrin ein
(`introVorbei`), und `ks_answer` lässt vorher von allein niemanden
antworten. **Ohne 0191** ist der Rest nie größer als 5 Sekunden — dann
gibt es keinen Auftritt, und alles läuft wie vorher.

## Abbrechen und neu starten

Während der Frage steht rechts neben dem Foto **⏹ Beenden** (sofort zur
Siegerehrung, `ks_finish`; die Punkte bis dahin zählen) unter „Jetzt
auflösen". In der Auflösung stehen oben rechts **↺** (dasselbe Quiz von
vorn, alle Punkte auf 0, `ks_restart`) und **⏹**; in der Siegerehrung
„↺ Nochmal". Alles fragt vorher nach.

## Die Frage am Beamer

Von oben nach unten: **Frage · Mitte · Antworten** (≈ 30 % der Höhe, ohne
A/B/C/D — die Farbe reicht, der Platz geht an die Schrift). In der Mitte
das Foto, links davon drei Füllstände — Uhrscheibe mit Sekunden (die
größte Zahl), Quadrat „5/12 Fragen", n-Eck „7/24 Antworten" (ein Dreieck
je Kind, bei 1–2 Kindern ein Quadrat) — und rechts Beenden/Auflösen.
Ohne Foto schrumpft die Mitte auf eine Zeile und Frage und Antworten
bekommen den Platz.

## Fotos

Jede Frage kann ein Foto haben (`ks_questions.image` als data:-URL plus
`image_name`, Migration 0186). Der Editor verkleinert es im Browser auf
höchstens 1600 Punkte (JPEG) — ein Handyfoto hätte sonst 5–10 MB.

* **Tabellenansicht** (Fragenkarten): hinten an jeder Karte „📷 Foto"
  bzw. Dateiname + 🗑. Ein Foto auf die Karte ziehen geht auch.
* **Vorschau**: das Foto groß zwischen Frage und Kacheln, mit
  „📷 Ersetzen" und 🗑; ohne Foto ein Feld zum Hochladen/Hineinziehen.
* **Text-Import**: keine Fotos.
* **Beamer**: das Foto steht zwischen Frage und Kacheln. Es hängt NICHT
  an `ks_room_get` (das wird bei jeder Antwort neu geholt), sondern wird
  über `ks_room_image` einmal je Frage geladen; `ks_room_get` sagt nur
  `has_image` und `qid`.
* **Tablet**: nie. `ks_view` gibt weder das Bild noch `has_image` heraus.

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
| `creatures.js` | Die 36 Wesen: Liste, Paletten, Skelett (`build`), Gesichter (`face`), Zeichnungen (`DEFS`). |
| `creatures.css` | Ihre Bewegungen: erst alle gemeinsam (`state-…`), dann je Wesen (`wave-7`, `cheer-7` …). |
| `showroom-wesen.html` | Showroom der Fassung 2 — ohne Netz, zeigt genau creatures.js/.css. |
| `showroom-*-wesen.html`, `showroom-beamer-mobile.html` | Entwurfsstand der ersten Fassung, **eingefroren** (siehe `feedback_showrooms_frozen`). Zeigt die alten Wesen. |

Die Wesen-Dateien hängen an `ASSET_V` in `tool.js` — dem einen Stempel für
beide. Der Stempel von `tool.js`/`tool.css` selbst steht in `lib/tool.js`
und dessen eigener an vier weiteren Stellen (Kopf von `lib/tool.js`).

## Prüfstände

```
node MPSkills/tools/KnowledgeStack/tools/uitest.js            # alle Bereiche
node MPSkills/tools/KnowledgeStack/tools/uitest.js emote      # emote|tab|beam|fluss|editor|foto|theme|katalog
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js          # echter Browser
node MPSkills/tools/KnowledgeStack/tools/fitcheck.js --shots  # …mit Bildern
node supabase/tests/0175_knowledgestack_flow.mjs              # SQL in pglite
node supabase/tests/0186_knowledgestack_photos_abort.mjs      # Fotos, Beenden, Neustart
node supabase/tests/0189_knowledgestack_sync_reveal.mjs       # Uhrabgleich, faire Antwortzeit
node supabase/tests/0194_knowledgestack_catalog.mjs           # Katalog: Sichtbarkeit, Rechte, Admin
```

* **uitest.js** (linkedom, kein Browser) — *was* im Bild steht: die echten
  Emote-Klassen, kein Fragetext auf dem Tablet, die Reihenfolge 1…5, dass ein
  Takt ohne Phasenwechsel das Bild **nicht** neu baut. Der Bereich `theme`
  prüft dazu am Blatt selbst, dass **keine Farbe** außerhalb der beiden Sätze
  steht — genau daran lag es, dass der Umschalter am Quiz nichts tat.
* **fitcheck.js** (Chromium; Pfad mit `CHROME=…` überschreibbar) — ob es *hineinpasst*: kein Überlauf, der Rahmen
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
räumt den Ablauf auf, `0186_knowledgestack_photos_abort.sql` bringt Fotos,
Beenden und Neustart (und die Katalog-Aufrufe mit `p_code`, die der Beamer
braucht), `0189_knowledgestack_sync_reveal.sql` die gleichzeitigen Antworten,
`0191_knowledgestack_intro.sql` die 10 Sekunden Auftritt vor der ersten Frage, (seit `0195_knowledgestack_intro_kuerzer.sql`: 9 Sekunden)
`0194_knowledgestack_catalog.sql` den Fragenkatalog (Themenfelder, Status, Autor, Thumbnails, Admin-Rechte). Alle spielt Sönke selbst im Supabase-Dashboard ein.

## Der Fragen-Editor

`editor.js` — an zwei Stellen, mit demselben Code (`KSEditor.create`):

* **Im Raum:** Lobby → „📚 Editor". Dort gibt es zusätzlich „▶ Spielen"
  (Katalog aufs Brett legen).
* **Ohne Raum:** `MPSkills/quiz.html` (`quiz.js`), erreichbar über den Knopf
  „Quiz-Editor" auf der Kachel neben „+ Raum öffnen" (`tools.js`:
  `editor: 'quiz.html'`). Benutzt die Aufrufe ohne `p_code`
  (`ks_catalogs_list`, `ks_catalog_get/_save/_delete`) — keine Migration nötig.

In beiden: neue Quizze anlegen, **eigene laden und bearbeiten (✏️)**, löschen
(🗑), Text-Import, Fotos, Vorschau. Eine Vorlage öffnet „⧉ Kopie" — Speichern
legt dann einen eigenen Katalog an (eine Vorlage ändert `ks_catalog_save`
nicht).

## Der Quiz-Katalog (0194)

Die Übersicht im Editor (`buildList`) ist ein **Katalog** mit allen Quizzen,
die man sehen darf — nach Themenfeld sortiert, mit Suche und Filtern. Im Raum
öffnet ihn ein einziger Knopf in der Lobby: erst „📚 Quiz wählen", danach
steht Titel · Fragenzahl · Themenfeld davor und er heißt „📚 Quiz ändern"; dort steht an jeder Karte „▶ Spielen".

**Status** — drei Stufen, mehr gibt es nicht:

| | Wer sieht es |
|---|---|
| 🔒 Privat | nur der Autor |
| 🏫 Schule | alle freigeschalteten Lehrkräfte derselben `school_id` |
| 🌍 Hub | alle freigeschalteten Lehrkräfte |

Das setzt **der Server** durch (`ks_catalog_can_see`), nicht der Browser.
Der Autor bearbeitet, löscht und stuft zurück jederzeit — auch wenn das Quiz
schon veröffentlicht ist (Schalter „Sichtbar für" an der Karte und im Editor).
Fremde Quizze öffnet „⧉ Kopie" als eigenes, privates Quiz.

**Admins** (`is_admin`: Hub + eigene Schule, `is_superadmin`: alles
Veröffentlichte) sehen an fremden Karten „↩ Auf privat" und „🗑". Private
Quizze anderer sehen und berühren sie nicht. Veröffentlichen können sie nicht.

**Themenfelder** stehen fest in `ks_categories` (Fächer + Allgemeinwissen,
Spaß & Rätsel, Kennenlernen & Klasse, Tablet & Medien, Natur & Umwelt,
Alltag & Beruf, Andere). Lehrkräfte legen keine neuen an — sonst gibt es
Mathe, Mathematik und Math. Ein neues Feld trägt ein Admin in der Tabelle ein;
unbekannte Werte speichert `ks_catalog_save` als „Andere".

**Karte:** links das Thumbnail, rechts Titel · „von Autor" · Chips (Status,
Eigenes, Fragenzahl); am Rand 👁 klappt die **Fragentexte** auf (nur Texte,
keine Antworten — `ks_catalog_peek`). Zwei Spalten auf breiten Bildschirmen.
**Suche** (Titel, Autor, Themenfeld, Status, Fragentext; ä = ae, ß = ss, alle
Wörter müssen passen) und **Filter** (Eigene · Status · Themenfelder, mehrere
zugleich · Sortierung) bauen nur Leiste und Ergebnis neu — das Suchfeld bleibt
unangetastet. Der Fragentext kommt als `search` (800 Zeichen je Quiz) mit der
Liste.

**Thumbnail:** eigenes Bild (Editor, 4:3, 480 px) → sonst das Foto der ersten
Frage mit Foto → sonst das MPSkills-Logo. Der Browser berechnet es beim
Speichern (`p_thumbnail`); die Liste liefert nur `has_thumb`, die Bilder holt
`ks_catalog_thumbs` je 24 nach, wenn sie ins Bild kommen.

Im Raum hängt `lib/tool.js` an jeden Aufruf `p_code` — darum haben
`ks_catalog_save/_set_visibility/_peek/_thumbs` je eine Fassung mit `p_code`.
`ks_room_get` ist seit 0194 ein Vorbau (`_ks_room_get_v188`) und schickt die
Liste samt `categories` aus `ks_catalogs_list`.

## Was noch fehlt

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
