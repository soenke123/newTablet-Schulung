# Plan: Feed-Skill (Arbeitstitel) — „InstaHub, aber moderner“

Stand 03.11.2026 · Entwurf zum Abstimmen mit Sönke, noch keine Zeile Code.
Aufgaben und Leitfaden von Sönke kommen später und werden dann hier eingearbeitet.

## Idee in einem Satz

Die Klasse benutzt eine eigene soziale Plattform im Stil von TikTok (Vollbild-Karten, endloses Scrollen, „Für dich“-Feed, Hashtags), aber mit Bildern und Text statt Videos. Dabei entstehen echte Daten. Die Lehrkraft schaltet nach und nach Tabellen frei, und die Klasse untersucht mit SQL, Diagramm und Analytics, was die Plattform über sie weiß und wie Werbung damit zielt.

## 1. Funktioniert das? — Ja, mit einer Grundentscheidung

**Die Plattform-Daten liegen in Supabase, das SQL läuft im Browser (wie bei SQL Studio).**

- Posts, Likes, Follows, Tags usw. sind normale Tabellen (`fs_*`) und werden nur über RPCs geschrieben und gelesen (Regeln aus CLAUDE.md: keine Grants, `grant execute`, Wächter 0225).
- Für den Datenbank-Teil holt ein RPC einen **Schnappschuss** der freigeschalteten Tabellen dieses Raums. Der Browser baut daraus eine SQLite-Datenbank mit dem **Kern von SQL Studio** (`core.js`, `worker.js`, `diagram.js`, Editor). Daraus ergeben sich SQL-Reiter, Daten, Struktur und Klassendiagramm, also „die Tabellen als Diagramm, wie bei SQL Studio“.
- Der Server führt also nie SQL der Schüler aus. Es kann nichts kaputtgehen, und „Neu laden“ holt den aktuellen Stand.
- Gesperrte Tabellen kommen gar nicht erst in den Schnappschuss. Freischalten wirkt damit doppelt: Die **Funktion** erscheint in der App (z. B. Kommentare), und die **Tabelle** erscheint im Diagramm.

## 2. Räume und Konten

| Raum | Wer | Wie |
|---|---|---|
| **Klassenraum** | Lehrkraft legt an (normaler MPSkills-Raum, Code/QR) | Lehrkraft schaltet Tabellen frei, wählt Name + Logo (oder lässt die Klasse abstimmen), sieht alles |
| **Raum der Lehrkraft** | die Lehrkraft selbst ist **Mitglied** im eigenen Raum | hat ein eigenes Plattform-Profil, postet mit, kann als „Werbekunde“ und „Betreiber“ auftreten |
| **Freier Raum** | alle angemeldeten Schüler einer Schule landen automatisch darin | eine Plattform je Schule; Freischaltung fest eingestellt (Admin); nur mit Lernwelt-Konto, weil Gäste keine feste Identität haben |

- **Plattform-Konto ≠ Lernwelt-Konto.** Im Raum legt jede Person ein Plattform-Profil an (Handle, Anzeigename, Bio, Profilbild, fiktives Alter/Wohnort). Das ist der „User“ in der Datenbank. Wie bei InstaHub ist ausdrücklich erwünscht, dass die Angaben **ausgedacht** sind (mit Hinweis beim Anlegen).
- Handle und Texte laufen durch `supabase/blacklist_de.txt`. Die Lehrkraft kann Posts und Kommentare löschen und Konten sperren, und es gibt einen „Melden“-Knopf.
- Wiedereinstieg ohne Konto: persönlicher Code wie bei der Scrum-Werkstatt bzw. Projektarbeit.

## 3. Die App (Schülersicht)

- **Feed:** Vollbild-Karten zum senkrechten Wischen (CSS scroll-snap), Doppeltipp = Like, rechts die Leiste mit Like · Kommentar · Teilen · Profil, unten Text und #Tags.
- **Endloses Scrollen:** Der Feed lädt seitenweise nach. Sind die echten Posts der Klasse durch, mischen sich **Story-Accounts** (vorbereitete Figuren mit Posts) und ältere Posts dazu. Der Feed endet also nie, auch mit nur 25 Leuten.
- **Zwei Feeds:** „Folge ich“ (chronologisch) und „Für dich“ (Algorithmus, siehe Abschnitt 6).
- **Post erstellen:** Bild aus der Bildbibliothek wählen **oder** einen Text-Post auf farbigem Hintergrund schreiben, dazu Text und Tags (Vorschläge plus eigene).
- **Profil:** Raster der eigenen Posts, Follower/Folge ich, Bio.
- **Suche/Entdecken:** Tags und Profile (jede Suche wird gespeichert und taucht später als Tabelle auf).
- **Optik:** eigene, moderne Plattform-Optik (dunkel, Akzentfarbe aus dem gewählten Logo), nicht die MPSkills-Optik, damit es sich nach „echter App“ anfühlt.

## 4. Name und Logo

- Wie in Startup Story: Es gibt 8 Logos (`GameHub/S3 Startup Story/sprites/Firmen logos/Logo1–8.png`, je mit `nice`-Fassung) mit fertigen Farb-Themes (`js/theme.js`: bell, connect, rocket, graph, trend, chat, like, mesh). Die übernehmen wir als Kopie im Skill-Ordner.
- Name und Logo gelten **je Raum** (eine Plattform je Klasse). Wahlweise legt die Lehrkraft sie fest, oder die Klasse stimmt beim Start ab (kleiner Einstieg: „Gründet eure Plattform“).
- Idee: Die `nice`-Fassung des Logos kann eine spätere Freischaltung sein („Plattform wächst → Logo-Redesign“), wie in Startup Story.
- Der Name läuft durch die Blacklist.

## 5. Tabellen und Freischalt-Stufen

Die Lehrkraft schaltet Stufe für Stufe frei. Jede Stufe bringt eine Funktion und Tabellen. (Die Reihenfolge ist ein Vorschlag und wird an den Leitfaden angepasst.)

| Stufe | Funktion in der App | Tabellen (vorläufige Namen) | Lerninhalt |
|---|---|---|---|
| 0 | Profil, Posts, Feed | `user`, `post` | Tabelle, Datensatz, PK, 1:n |
| 1 | Likes | `likes(user_id, post_id, zeit)` | **n:m** über Zwischentabelle |
| 2 | Folgen | `follows(follower_id, followed_id, zeit)` | n:m auf **dieselbe** Tabelle |
| 3 | Hashtags | `tag`, `post_tag(post_id, tag_id)` | **n:m Post ↔ Tag**, JOIN über drei Tabellen |
| 4 | Kommentare | `comment` | 1:n doppelt (User und Post) |
| 5 | Tracking sichtbar | `view(user_id, post_id, start, dauer_ms, quelle, geraet)`, `session`, `search` | Was wird beim Scrollen mitgeschnitten? GROUP BY, AVG, Zeit |
| 6 | Interessenprofil | `interest(user_id, tag_id, score)` (berechnet) | Vom Verhalten zum Profil |
| 7 | Werbung | `advertiser`, `ad`, `ad_target`, `ad_view`, `ad_click` | Targeting, Klickrate |

Die Bild-Tabelle (`image` mit Kategorie und „wahren“ Tags) bleibt intern. Sie kann als eigene Stufe freigeschaltet werden („Die Plattform erkennt, was auf deinen Bildern ist“).

## 6. Analytics verstärken — was abgegriffen wird

Alles nur innerhalb des Raums und nur, was die App selbst misst (siehe Abschnitt 9):

- **Verweildauer je Karte** (IntersectionObserver, ab wann sichtbar, wie lange); das ist das wichtigste Signal, genau wie bei TikTok
- übersprungen (unter 1 s), zurückgewischt, erneut angesehen
- Uhrzeit und Wochentag, Länge der Sitzung, Scroll-Tempo
- Suchbegriffe, Profilbesuche, angetippte Tags
- Gerät (Tablet/Handy/PC, aus der Bildschirmgröße), Hell/Dunkel
- Likes, Kommentare, Folgen und auch **wieder entfernte Likes**

Die Ereignisse werden im Gerät gesammelt und alle paar Sekunden gebündelt gesendet (wenige Aufrufe, Limit je Person).

**Betreiber-Ansicht (Analytics-Dashboard, freischaltbar):**

- je Person: Interessenprofil (Tags mit Gewicht), aktive Uhrzeiten (Heatmap), durchschnittliche Verweildauer, „Typ“
- je Post/Tag: Reichweite, Verweildauer, Like-Rate
- „Was weiß die Plattform über mich?“ — jede Person sieht ihr eigenes Profil, so wie es der Algorithmus sieht. Das ist der Aha-Moment.

**„Für dich“-Algorithmus (aufschraubbar):**
`score = a·Interesse(Tags) + b·Beliebtheit + c·Frische + d·folge ich + Zufall`
Die Lehrkraft kann die Regler a–d zeigen und verstellen. Die Klasse sieht live, wie der Feed sich ändert (Filterblase, „Rabbit Hole“).

## 7. Werbung, die besser funktioniert

- **Erfundene Marken** (keine echten Firmen) mit Anzeigen je Interessengebiet (Sport, Gaming, Mode, Essen, Tiere …).
- **Zielgerichtet:** Die Anzeige wird nach dem Interessenprofil gewählt, nicht zufällig. Sie erscheint als „Gesponsert“-Karte alle n Posts im Feed.
- **Vergleich A/B:** Die Lehrkraft schaltet zwischen „zufällige Werbung“ und „gezielte Werbung“ um, und die Klickrate (`ad_click` / `ad_view`) zeigt den Unterschied als Diagramm.
- **Werbekunden-Modus:** Gruppen schalten selbst eine Anzeige (Bild aus der Bibliothek, Text, Ziel-Tags/Alter/Uhrzeit, Budget) und sehen danach ihre Kampagnen-Zahlen. Wer zielt am besten?
- Optional: Werbung „wirkt“ auf den Feed (gesponserte Tags wandern hoch), damit sichtbar wird, wie Geld Reichweite kauft.

## 8. Bilder — wie das geht

**Empfehlung: keine Fotos von Schülern hochladen, sondern eine feste Bildbibliothek.**

Warum: Gesichter, Bildrechte, Mobbing-Gefahr, Datenschutz. Außerdem kennen wir bei Bildern aus der Bibliothek die „wahren“ Tags. Das macht Analytics und Werbung erst richtig gut, denn die Plattform „weiß“, was auf dem Bild ist, auch wenn niemand Tags setzt.

| Art | Woher | Menge (Vorschlag) |
|---|---|---|
| Post-Bilder | von dir (eigene oder KI-generierte Bilder), lokal im Skill-Ordner als WebP, Hochformat 1080×1350, je ca. 80–150 KB | **150–250 Bilder** in ca. 12–15 Themen à 10–20 (Tiere, Essen, Sport, Gaming, Musik, Natur, Reisen, Mode, Technik, Kunst, Schule, Memes/Sprüche …) |
| Profilbilder | vorhandene Avatare aus `avatars.js` / Story-Figuren | ggf. 20–30 neue für Story-Accounts |
| Story-Accounts | Figuren mit festen Posts (siehe Storylines) | 15–30 Figuren, je 5–15 Posts |
| Werbung | erfundene Marken: Logo + 1–3 Anzeigenbilder | 15–25 Marken |
| Plattform-Logos | Startup Story (vorhanden) | 8 + 8 `nice` |

- Zu jedem Bild gehört ein Eintrag im Katalog: `datei, thema, tags[], ggf. Story-Figur`. Die Tags kann ich vorschlagen, wenn ich die Bilder sehe.
- Alles liegt lokal unter `MPSkills/tools/<Skill>/img/`. Das ist CSP-tauglich, ohne CDN und ohne externe Bildquelle.
- Text-Posts mit Farbverläufen und Stickern kosten keine Bilder und sind ein guter Ausgleich.
- **Später, wenn gewünscht:** eigener Bild-Upload nur mit Schalter der Lehrkraft. Das Bild wird im Gerät verkleinert, in der Datenbank gespeichert (wie die Fotos in der Projektarbeit, Grenze ca. 300 KB) und mit dem Raum gelöscht. In Etappe 1 nicht dabei.

## 9. Datenschutz (wichtig, weil wir bewusst „abgreifen“)

- Getrackt wird nur das Verhalten **in der App, im Raum**. Es gibt keine Fingerprints, keine IP-Adresse und nichts außerhalb des Skills.
- Profilangaben sind ausgedacht (Hinweis beim Anlegen). Es gibt keine Klarnamen-Pflicht.
- Alles hängt am Raum (`room_id` mit FK + CASCADE, Wächter 0227) und geht mit dem Raum. Für den freien Raum gibt es eine eigene Frist (Vorschlag: Posts und Tracking nach 30 Tagen weg).
- Transparenz ist Teil des Unterrichts: Ein Hinweis beim Start sagt, dass diese Plattform absichtlich mitschneidet, um zu zeigen, wie das funktioniert.
- Einen Abschnitt in `datenschutz.html` und `DATENSCHUTZ.md` ergänzen. Für den freien Raum am besten vorher mit der Schulleitung bzw. dem DSB abstimmen.

## 10. Technik (kurz)

- Ordner `MPSkills/tools/<Skill>/`: `tool.js` + `tool.css` als Brücke, App in `index.html` im iframe (wie SQL Studio / Tiny LM, `?raum=…&rolle=…`).
- Migration **0262** (nächste freie Nummer): Tabellen `fs_*`, RPCs, Freischaltstand in `skill_room_state.data.unlocked`, Name/Logo in `data.brand`. Prüfstand `supabase/tests/0262_….mjs`.
- SQL-Teil verwendet den Kern von SQL Studio wieder (kein zweiter SQL-Kern).
- Schaufenster `MPSkills/preview/<skill>.js` mit `?demo=1` (Beispiel-Plattform mit Story-Accounts, speichert nichts).
- Avatare später wie bei den anderen Skills (z. B. Logos/Maskottchen der Plattform).

## 11. Etappen

1. **Plattform:** Feed mit endlosem Scrollen, Profil, Posts (Bibliothek + Text), Likes, Folgen, Tags (n:m), Name + Logo, Klassenraum, Freischalten der Stufen 0–4, Moderation.
2. **Datenbank-Blick:** Schnappschuss → SQLite → SQL-Reiter, Daten, Diagramm (SQL Studio-Kern), nur freigeschaltete Tabellen.
3. **Tracking + Analytics:** Ereignisse, Betreiber-Dashboard, „Was weiß die Plattform über mich?“, „Für dich“-Algorithmus mit Reglern.
4. **Werbung:** Marken, gezielte vs. zufällige Anzeigen, Klickrate, Werbekunden-Modus.
5. **Freier Raum, Storylines, Schaufenster, Aufgaben aus Sönkes Leitfaden.**

## 12. Was ich von dir brauche

1. **Bilder** (Abschnitt 8): Themenliste festlegen, dann die Bilder. Am einfachsten als Ordner je Thema; Format egal, ich wandle in WebP um.
2. **Storylines / Story-Accounts:** Welche Figuren soll es auf der Plattform geben? Beispiele: ein Influencer, der heimlich Werbung macht · eine Fake-News-Welle zu einem Schulereignis · ein Account, der Daten sammelt (Gewinnspiel) · eine Marke, die gezielt auf eine Altersgruppe zielt · ein „Datenleck“ als Höhepunkt. Je Figur: Name, Handle, Profilbild, 5–15 Posts mit Bild und Text.
3. **Marken für Werbung:** erfundene Namen und Logos (oder ich schlage welche vor).
4. **Aufgaben + Leitfaden** (später), damit die Stufen und Tabellennamen dazu passen.

## 13. Offene Fragen an Sönke

- Tabellennamen **deutsch** (`nutzer`, `beitrag`, `folgt`) oder **englisch** (`user`, `post`, `follows`) wie bei echten Plattformen? (Dein Leitfaden entscheidet.)
- Name und Logo: legt die Lehrkraft sie fest oder stimmt die Klasse ab?
- Freier Raum: je Schule oder für alle Schulen zusammen? Welche Stufen sind dort frei? Wie lange bleiben die Daten?
- Sollen Schüler die Daten **aller** anderen im Datenbank-Blick sehen (wie bei InstaHub), oder werden Handles im Schnappschuss pseudonymisiert?
- Direktnachrichten: bewusst weglassen (Datenschutz/Mobbing) oder als späte Stufe „Die Plattform liest mit“?
- Arbeitstitel für den Skill selbst (der Plattform-Name ist ja frei wählbar)?
