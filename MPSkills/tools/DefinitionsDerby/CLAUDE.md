# CLAUDE.md — Definitions Derby (MPSkills skill, Beta, nur für Admins)

Guidance for Claude Code when working in `MPSkills/tools/DefinitionsDerby/`.

## Was es ist

Fünfzehnter MPSkills-Skill (Migration `0233_definitionsderby.sql`, `derby` in `MPSkills/tools.js`, `admin_only` bis er rund ist: `update skill_tools set admin_only = false where id = 'derby';`). Lehrkräfte legen **Stapel** an (Titel, Fach, Thema, Klassenstufe; Karten = Begriff · Definition · optional Bild), teilen sie mit einem Raum, die Klasse lernt sie. Aus denselben Karten sollen später mehrere Spiele werden (Plan unten).

- **Integration**: direkt im Raum gebaut (kein iframe): `tool.js` + `tool.css` (Klassen `dd-…`), `parse.js` wird von `tool.js` bei Bedarf nachgeladen (Editor). Icon `derby` in `lib/icons.js`, Alias `DefinitionsDerby`.
- **Speicher**: Tabelle `dd_stacks` am **Konto** (nicht am Raum), Karten als jsonb (`[{id,t,d,i?}]`, `i` = data-URL, im Gerät auf ≤ 520 px/JPEG verkleinert, ≤ 150 000 Zeichen). Grenzen: 500 Karten, 1,5 MB je Stapel, 100 Stapel je Person. Zugriff nur über RPCs: Lehrkraft `dd_stacks_list/get/save/delete` (`p_code` wird von `presenterActions.call` angehängt), Tablet `dd_shared_get(p_token, p_id)`.
- **Teilen**: `skill_room_state.data = { shared: [{id,t,n,s,p,g,u}] }` (t Titel, n Kartenzahl, s Fach, p Thema, g Klasse, u Stempel). `dd_shared_get` liefert nur, wenn die id in `shared` DIESES Raums steht UND der Stapel einer Lehrkraft DIESES Raums gehört (Besitzer oder eingeladen). Höchstens 20 geteilte Stapel (8-KB-Grenze von `skill_room_set_state`). Beim Speichern eines geteilten Stapels bekommt der Eintrag einen neuen Stempel `u` → Tablets holen ihn neu.
- **Lernstand** (unsicher/teilweise/sicher je Karte): Arbeitskopie immer im Gerät (`localStorage` `dd.p.<stapel>` = `{kartenId:{l,s,t}}`, `dd.sum.<stapel>` = Zählung für den Balken, `dd.dir` = Richtung). **Mit Konto** zusätzlich in `dd_progress` (Migration 0234, Entscheidung Sönke 26.10.2026): beim Öffnen holen und je Karte zusammenführen (neuere Zeit `t` gewinnt), nach jeder Bewertung 1,5 s gedrosselt zurückschreiben, beim Verlassen/Abräumen sofort. Lehrkraft: `dd_prog_get/put/list(p_code, …)` (→ `auth.uid()`), Tablet: `dd_mprog_get/put/list(p_token, …)`; Gast ohne Konto → `no_account`, bleibt beim Gerät (Hinweis unter der Stapelliste/Karte). „Zurück auf neu“ ist ein Grabstein (`l: 0`), kein Löschen. Der Stand geht beim 1-Jahres-Reset des Kontos mit (FK auf profiles, `account_reset_content`), `dd_stacks` bleiben (Ausnahmeliste, wie `vocab_sets`). Im Schaufenster (`ctx.preview`) bleibt alles im Arbeitsspeicher, kein Sync. Datenschutz: `datenschutz.html` (Abschnitte 4, 8, 9) und das Hinweisfenster in `MPSkills/index.html` nennen es.
- **Ohne Raum** (Entscheidung Sönke 26.10.2026): `MPSkills/derby.html` + `derby.js` (Kachel-Knopf „Stapel-Editor“ über `tools.js` `editor` + `editorLabel`) mountet dasselbe Tool mit `ctx.standalone = true` — Stapel anlegen/ändern/löschen und selbst lernen, kein Teilen (das passiert im Raum). Aufrufe mit `p_code: null`.
- **Prüfstände**: `supabase/tests/0233_definitionsderby.mjs` (Rechte, Teilen, admin_only, Migration zweimal), `0234_definitionsderby_lernstand.mjs` (Lernstand, Konto/Gast, Reset), `MPSkills/tools/DefinitionsDerby/tests/parse.test.mjs` (Text → Karten). Neue RPCs für `anon`/`authenticated` gehören in `supabase/tests/0225_rechte_freigaben.json`.

## Design (Entscheidung Sönke 27.10.2026)

Eigenes Kleid statt MPSkills-Optik, „Pappe und Papier zum Anfassen“, nur in `tool.css` (Farben als `--dd-…` oben, zweimal: `.dd` hell, `:root[data-theme="dark"] .dd` dunkel). Hell = **Korkwand** mit Holzrahmen, dunkel = **dunkles Holz unter einer Schreibtischlampe** (warmer Lichtkegel, wo die Karte liegt); Papier und Pappe bleiben in beiden hell. Stapel = Pappstapel mit Klebeband, Kartenzahl als Stempel-Kreis (`.dd-stack__n`), „geteilt“ als kleiner Stempel. Karteikarte weiß mit Büroklammer (`.dd-flip::before/::after`), Begriff mit Textmarker (`.dd-hl`), Bild als Polaroid. Bewertung = drei **Stempel** (Unsicher rot, Teilweise ocker, Sicher grün); `rate()` setzt den Stempel `.dd-stamp` auf die Karte und zeigt erst nach ~0,55 s die nächste (`learn.stamping` sperrt solange Umdrehen und weiteres Bewerten). Schrift nur Outfit + `var(--mono)` (JetBrains Mono), keine Handschrift. Entwürfe zur Auswahl lagen als HTML im Chat (Varianten Karteikasten/Pappe/Pinnwand → Kork & Karton).

## Etappe 1 (gebaut)

1. **Stapelliste** (Lehrkraft: „Meine Stapel“ mit Neu/Bearbeiten/Teilen; Tablet: nur geteilte), Suche + Fachfilter ab 6 Stapeln, Fortschrittsbalken je Kachel.
2. **Karteikarten**: Karte antippen = umdrehen, **erst danach** Unsicher/Teilweise/Sicher (Tasten Leertaste, 1/2/3). Gewichtung `weight()` in `tool.js`: neu 5 · unsicher 8 · teilweise 3 · sicher 1 (zweimal in Folge sicher 0,4); die letzten zwei Karten kommen nicht sofort wieder. Filter „Alle / Noch nicht sicher / Nur unsichere“, Richtung Begriff→Definition / Definition→Begriff / gemischt. Das Bild gehört zum Begriff und steht auf der Seite, die den Begriff zeigt.
3. **Übersicht/Glossar**: Suche über Begriff + Definition, Filter nach Lernstand, Sortierung „Nach Lernstand“ (Unsicher → Teilweise → Neu → Sicher, mit Gruppenköpfen), A–Z oder Stapelreihenfolge, Liste oder Kacheln, „Definitionen verdecken“ zum Selbsttest, Lernstand direkt per Antippen ändern.
4. **Editor** (nur Lehrkraft): „Karte für Karte“ (Begriff, Definition, Bild, nach oben/unten, Strg+Enter = nächste Karte) und „Text einfügen“ mit Live-Vorschau („So habe ich es verstanden“, gelb bei fehlender Definition/doppeltem Begriff). `parse.js` erkennt Kopfzeilen (Titel/Fach/Thema/Klasse), eine Karte pro Zeile (`: – - = → ;` oder Tab), Blöcke mit Leerzeile, abwechselnde Zeilen, Umbrüche in Definitionen. Der Wechsel zwischen den Modi ist verlustfrei (`toText`/`applyText`; Bilder und Karten-ids bleiben bei gleichem Begriff).

## Etappe 2: Startseite mit Spielen + Memory (Entscheidung Sönke 27.10.2026)

- **Startseite** (`renderHome`): links die Stapel, rechts kleine Spiel-Kacheln, gegliedert in **Allein** (Karteikarten, Übersicht) · **Gemeinsam an einem Gerät** (Memory) · **Zusammen im Netz** (noch leer, Lehrkraft sieht „Kommt bald“). Stapel antippen = auswählen, auch mehrere (`sel`, bei genau einem Stapel automatisch gewählt, gerade gespeicherter Stapel wird gewählt). Über den Kacheln steht, was gewählt ist.
- **Lehrkraft**: Kachel antippen = Beschreibung als Fenster (`renderInfo`, `.dd-layer`): Text, „So geht’s“, **Bildschirmfoto** (`img/spiel-*.jpg`, mit Playwright aus der echten Ansicht aufgenommen, 1040×650, JPEG 82), „Starten mit …“ (gewählte Stapel) und Teilen. Teilen geht auch direkt auf der Kachel. In `derby.html` (standalone) kein Teilen.
- **Tablet**: sieht nur geteilte Spiele und geteilte Stapel; Kachel antippen startet mit den gewählten Stapeln, „i“ öffnet die Beschreibung (ohne Teilen).
- **Geteilte Spiele**: `skill_room_state.data.games = ['cards','overview','memory']` neben `shared` (keine Migration). Fehlt `games` (Räume von vor Etappe 2), gelten Karteikarten + Übersicht als geteilt (`DEFAULT_GAMES`), damit bestehende Räume weiterlernen.
- **Im Spiel** (`screen = 'play'`, `opened = {stacks, cards, game}`): oben „Im Spiel:“ mit den Stapeln. Karten mehrerer Stapel heißen `<stapel>:<karte>`; `prog` hält alle, gespeichert/synchronisiert wird weiter **je Stapel** (`buildProg`/`stackProg`, `dirty`-Menge für `dd_prog_put`). Karteikarte und Übersicht zeigen bei mehreren Stapeln die Herkunft.
- **Memory** nach Sönkes „Evolutionsfaktoren“-Memory (Aufbau gleich, Optik Kork & Karton): links Begriffe, rechts Definitionen, Pappe-Rücken mit „?“-Stempel (Begriffe blau `--dd-tk`, Definitionen ocker `--dd-dk`). Je Zug eine Karte je Seite; beide fliegen groß in die Mitte (`startReview`), „Ja, Paar!“/„Nein“ (Entscheidung Sönke 27.10.2026): Paar + Ja = Punkt, Karten fliegen zum Punktestand, gleiche Person nochmal; Paar + Nein und kein Paar + Nein = zurück, umdrehen, Wechsel, **mit demselben neutralen Satz** (kein Hinweis, ob es doch ein Paar war); kein Paar + Ja = Minuspunkt (nur zu zweit, Stand kann negativ werden), Wechsel. Endstand nennt Punkte, nicht Paare. Allein (Paare + Züge) oder zu zweit; 6/8/12/18/24 Paare bzw. alle (höchstens 24). Gleicher Begriff aus zwei Stapeln zählt nur einmal und gilt als Paar. Text steht erst nach dem Aufdecken im DOM, `fitText` passt ihn ein; Spalten je nach Platz (`memCols`), Vollbild-Knopf (nur `#ddMem`). Takte kurz (`FLY_MS`/`FLIP_MS`/`HOLD_MS`, Ergebnis `SAY_OK_MS`/`SAY_NO_MS`); Tippen ins Spielfeld während Karten drehen/fliegen überspringt bis zur nächsten Entscheidung (`mmWait`/`mmSkip`, Klasse `.is-fast` schaltet Übergänge ab; Leiste oben bleibt normal bedienbar). **Memory schreibt keinen Lernstand** (zwei Personen, ein Konto).
- Neues Spiel: Eintrag in `GAMES` (Gruppe, Texte, `min` Karten, `shot`), Mini-Bild in `MINI` (nur CSS, `.dd-mini--…`), Bildschirmfoto in `img/`, Zweig in `renderPane()`.

## Plan / Entscheidungen von Sönke (26.10.2026)

Gewünscht, in dieser Reihenfolge der Begeisterung:

- **Karteikarten gamifiziert**, ähnlich der Insel in Wordisland (Fortschritt sichtbar als Landschaft).
- ~~**Memory**: Einzelspieler und Mehrspieler an EINEM Gerät.~~ — erledigt (Etappe 2).
- **Übersichten**: Glossar mit Suche, Filter (Etappe 1 erledigt).
- **Activity / Erklär-Bär**: Mehrspieler an einem Gerät (Begriff erklären ohne verbotene Wörter, die aus der Definition kommen).
- **Rennen oder Team einnehmen** wie Kingdoms of Mathoria (Raum-Spiel, Beamer).
- **Spielfigur** (Figuren wie bei Knowledge Stack, `KSCreatures`), die mit den Definitionen etwas macht. Ideen:
  1. Figur füttern/aufziehen (Tamagotchi): gelernte Karten sind Nahrung, vergessene machen sie hungrig; Leitner-Fach = Wachstum.
  2. **Figur baut ihre Insel** (je Thema eine Insel; jeder gelernte Begriff schaltet ein Teil frei; vergessene lassen verwittern).
  3. Dungeon/Wanderung: Türen öffnen mit der richtigen Definition, Truhen = Ausrüstung (Avatar-System), Boss mischt das Thema.
  4. Detektivin/Forscherin: Begriff in einer Szene mit Bildern „fangen“.
  5. Begriffe sammeln wie Pokémon (Gold-Fassung für sicher Gewusstes, wie bei den Gold-Avataren).
  6. Mehrere Figuren an einem Gerät auf einer Bahn/Insel (Derby-Rennen).
  **Empfehlung:** 2 + 1 verbinden — Figur lebt auf der Insel eines Themas, Karteikarten füttern sie und schalten die Insel frei, vergessene Begriffe lassen sie verwittern; Rennen/Team-Modus zeigen dieselben Figuren.
- **Teilen/Katalog** (später): Sammlung mit Name, Fach, Thema, Klassenstufe; `dd_stacks.visibility` (`private|school|hub`) ist schon da. Beim Teilen **Kopie statt Verweis**, mit Herkunftsvermerk. Bilder: freie Bilder / keine Personenfotos klären.
- **Einheitliches Spielformat**: jedes Spiel bekommt dieselbe Karte als Eingabe und meldet nur „richtig/falsch je Karte“ zurück → Lernstand je Begriff ohne Zusatzaufwand pro Spiel. Etappe 1 hat dafür `rate(v)` / `prog`; neue Spiele sollen darüber schreiben, nicht eigene Stände führen.

## Offene Fragen

1. Figuren frei wählbar (wie Knowledge Stack) oder je Thema eine feste Figur?
2. ~~Lernstand im Konto~~ — erledigt (0234). ~~Stapel ohne Raum~~ — erledigt (`derby.html`).
3. Wann `admin_only` aufheben und das Schaufenster (`preview/derby.js`) bauen?

## Verifizieren

Kein Build. Im Browser (Playwright mit dem vorinstallierten Chromium) prüfen: Lehrkraft legt per Text und per Karte einen Stapel an, speichert, teilt; Tablet sieht ihn und lernt; Umdrehen per Tippen/Leertaste, Bewerten per Knopf/1-2-3; Übersicht Suche/Filter/Sortierung/Verdecken; mehrere Stapel wählen + Spiel starten; Memory ganz durchspielen (allein und zu zweit, Ja/Nein richtig und falsch); 390 px und 1000 px, hell und dunkel, kein horizontaler Scroll. Beim Ausliefern `V` in `tool.js` und den Stempel in `lib/tool.js` (siehe dortige Warnung) drehen.
