# Plan: Feed-Skill (Arbeitstitel) — „InstaHub, aber wie TikTok“

Stand 03.11.2026 · Entwurf 4. **Etappe 1 + 2 gebaut**, seit Migration 0265 als **YourSozialNet** (`MPSkills/tools/SocialHub/`, nur für Admins). Begriffe und aktuelle Entscheidungen (Netzwerk statt Hub, Schüler nur im eigenen Netzwerk, Erstellen in 2 Schritten, App | Adminbereich): `MPSkills/tools/SocialHub/CLAUDE.md` – dort gilt der neuere Stand, wo dieser Plan abweicht.
Aufgaben und Leitfaden von Sönke kommen später und werden dann hier eingearbeitet.

## Idee in einem Satz

Die Klasse benutzt eine eigene soziale Plattform im Stil von TikTok (Vollbild-Karten, endloses Scrollen, „Für dich“, Tags), nur mit Fotos statt Videos. Dabei entstehen echte Daten. Die Lehrkraft erstellt nach und nach die Tabellen für den Raum, und die Klasse untersucht im Admin-Bereich mit SQL und Diagramm, was die Plattform über sie weiß.

## 0. Hubs: jede Person gründet ihre eigene Plattform

- Im Klassenraum gründet **jede Schülerin und jeder Schüler einen eigenen Hub** (wie bei InstaHub) und ist dort automatisch **Admin**, ohne Passwort, weil MPSkills sie schon kennt.
- Im **Admin-Bereich** wählt jede Person **Name und Logo** ihres Hubs: eins der 8 Logos aus Startup Story (mit Farb-Theme) **oder ein eigenes Logo** (Upload, quadratisch auf 512 px verkleinert und komprimiert, Farbe wird aus dem Logo abgeleitet). Der Name läuft durch die Blacklist.
- Die anderen können sich auf fremden Hubs **registrieren** und dort posten, liken und folgen (eigenes Konto je Hub, wie bei echten Plattformen). Auf der Login-Seite gibt es „Andere Hubs entdecken“ mit der Liste der Hubs im Raum.
- Damit ein Hub nicht leer ist, kommen später **Dummy-Daten** hinein (Figuren, Fotos, Likes …).
- **Lehrkraft:** hat Admin-Zugriff auf **jeden** Hub und eine **Übersicht aller Hubs** (Kachel je Hub: Logo, Name, Gründer, Zahl der Nutzer/Fotos, letzte Aktivität; antippen = als Admin öffnen; Name/Logo zurücksetzen, Hub sperren).
- **Freier Raum:** ein gemeinsamer Hub für alle (Name/Logo legt der Lernwelt-Admin fest).

## 1. Tabellen (schlank, wie InstaHub)

```
users          (id PK, username UNIQUE, name, email, password, bio, avatar,
                birthday, city, role ENUM('user','admin'), created_at)
photos         (id PK, user_id FK→users, image, description, created_at)
follows        (follower_id FK→users, following_id FK→users, created_at,
                PK(follower_id, following_id))
likes          (user_id FK→users, photo_id FK→photos, created_at,
                PK(user_id, photo_id))
comments       (id PK, user_id FK→users, photo_id FK→photos, body, created_at)
comment_likes  (user_id FK→users, comment_id FK→comments, created_at,
                PK(user_id, comment_id))
tags           (id PK, name UNIQUE)
photo_tag      (photo_id FK→photos, tag_id FK→tags, PK(photo_id, tag_id))
```

**1:n:** users → photos · users → comments · photos → comments
**n:m:** users ↔ users (`follows`, dieselbe Tabelle zweimal) · users ↔ photos (`likes`) · users ↔ comments (`comment_likes`) · photos ↔ tags (`photo_tag`)

- **`password`** enthält den Hash und ist sichtbar wie bei InstaHub (bcrypt, `$2y$10$…`).
- **Verschiedene Likes?** TikTok kennt nur das Herz. Kommentare kann man bei TikTok aber liken → `comment_likes` (ist schon drin). Optional: `likes.type` mit Reaktionen (Herz, Lachen, Wow …). Das wäre eher Facebook, gibt aber schöne `GROUP BY type`-Aufgaben. Entscheidung offen.
- **Analytics gebaut (Migration 0270):** `sessions` (ein Besuch je User: IP, Browser, OS, Gerät, Bildschirm, Sprache, Zeitzone, Hell/Dunkel + vier Erlaubnis-Haken Standort/Kamera/Mikrofon/Benachrichtigungen) und `views` (wer hat welches Foto wie lange gesehen). Laufen wie auf echten Seiten still mit – **ohne Banner, ohne Haken für die Klasse** – sobald die Lehrkraft `sessions` (und `views`) im Diagramm erstellt hat; kein Schalter, kein Zeitlimit. Standort/Kamera/Mikrofon/Benachrichtigungen werden nur zum Schein abgefragt (nachgebautes „Zulassen?“), gespeichert wird der Klick. Die Lehrkraft löst am Ende auf („Was haben wir gesammelt / was ginge ohne Fragen / was eine Erlaubnis kostet / was nur echte Apps können“). Details: `tools/SocialHub/CLAUDE.md`.
- Werbung: nur `ads` (sichtbar), Plan in Abschnitt 13.

## 2. Tabellen erstellen = Lehrkraft

- Kein `CREATE TABLE` durch Schüler. Die **Lehrkraft erstellt** jede Tabelle in ihrer Steuerung mit einem Knopf, für **alle Hubs im Raum** (alle bleiben im gleichen Takt). Damit erscheint die passende Funktion in der App (Likes, Folgen, Kommentare, Tags …).
- Optional „mit Dummy-Daten füllen“ (Figuren, Fotos, Likes …). Die Dummy-Daten kommen später.
- `users` und `photos` sind von Anfang an da (sonst gibt es keine Plattform).

## 3. Datenbank-Reiter (im Admin-Bereich)

- Darstellung und Bedienung wie in SQL Studio: SQL-Editor, Daten, Struktur, **Klassendiagramm**. Es erscheinen nur die erstellten Tabellen.
- **SELECT** läuft im Browser auf einer Kopie (Kern von SQL Studio, SQLite). Der Server führt nie fremdes SQL aus.
- **INSERT / UPDATE / DELETE** wirken auf die **echte Plattform** für alle im Raum. Die App führt die Anweisung erst in der Kopie aus, schaut, welche Zeilen sich geändert haben, und schickt genau diese Änderungen an den Server. Der prüft sie (richtige Tabelle, Fremdschlüssel, Raum, Rechte) und übernimmt sie.
  - Beispiel: `INSERT INTO users (username, name, password) VALUES ('mia', 'Mia', PASSWORD_HASH('geheim'));` → Mia kann sich danach in der App anmelden.
  - Wer das Passwort im Klartext einfügt, kann sich danach **nicht** anmelden („Warum geht das nicht?“, das Hashing wird zum Thema). Hashen geht mit der Funktion `PASSWORD_HASH('…')` im Editor.
  - `CREATE`, `ALTER`, `DROP` sind im Raum gesperrt.

## 4. Anmelden, Konten, Geräte

- Nach dem Betreten des Raums (Code/QR) erscheint **eine ganz normale Login-Seite** der Plattform mit Logo, Name, „Anmelden“, „Registrieren“ und „Passwort vergessen?“.
- **Registrieren** in der App (Benutzername, Name, E-Mail, Passwort, Geburtstag, Ort, alles ausgedacht; Hinweis „kein echtes Passwort“) **oder per INSERT** im Datenbank-Reiter.
- **Geräteübergreifend:** Das Konto liegt auf dem Server im Raum. Auf jedem Gerät meldet man sich mit Benutzername und Passwort an. Persönliche Codes sind dafür nicht nötig.
- Passwort vergessen: Der Admin setzt ein neues, per Knopf oder per `UPDATE users SET password = PASSWORD_HASH('neu') WHERE …`.
- Abmelden: Auf Schulgeräten ist man nach dem Schließen des Tabs bzw. nach Inaktivität abgemeldet, auf eigenen Geräten bleibt man angemeldet. Dazu gibt es „Auf allen Geräten abmelden“.
- Intern merkt sich der Server, wer welches Konto angelegt hat. Die Lehrkraft sieht immer, wer dahintersteckt (Mobbing). Das steht nicht in der Tabelle.

## 5. Admin

- **Lehrkraft-Steuerung** (nur Lehrkraft): Übersicht aller Hubs, Tabellen erstellen, Dummy-Daten, Upload an/aus, wer im Datenbank-Reiter schreiben darf, Raum zurücksetzen.
- **Admin-Bereich je Hub** (Gründer + Lehrkraft + alle mit `role = 'admin'` in diesem Hub): **Name und Logo**, Nutzer (sperren, Passwort neu, Rolle), gemeldete Inhalte, Analysen, **Datenbank** (nur die Daten dieses Hubs).
- Gründer und Lehrkraft sind automatisch Admin. Weitere Admins vergibt der Gründer, per Knopf oder per `UPDATE users SET role = 'admin' …`.

## 6. Fotos

- **Eigener Upload mit automatischer Komprimierung:** Das Bild wird im Gerät auf höchstens 1080 px verkleinert und als WebP gespeichert (Qualität sinkt automatisch, bis es unter 200 KB liegt). Dazu kommt ein Vorschaubild mit 320 px. Metadaten (GPS, Kamera) fallen dabei weg, optional wird vorher angezeigt, was drinsteckte. Gespeichert wird in einer internen Tabelle mit dem Raum (wie die Fotos der Projektarbeit), in `photos.image` steht nur der Verweis. Deckel z. B. 30 je Konto, 60 MB je Raum. Hinweis zu Gesichtern/Bildrechten, Melden, Löschen durch Lehrkraft/Admin.
- **Bildbibliothek** für Dummy-Daten und alle ohne eigene Bilder (später).

## 7. App (Schülersicht)

- Feed mit Vollbild-Karten zum senkrechten Wischen, endlos (lädt nach, mischt Dummy-Fotos und ältere Fotos dazu), Doppeltipp = Like, rechte Leiste mit Profil · Like · Kommentar, unten @username, Beschreibung, #Tags.
- „Für dich“ (Algorithmus nach Tags/Likes) und „Folge ich“.
- Profil mit Foto-Raster, Follower, Folge ich, Bio. Suche nach Tags und Nutzern.
- Kommentare mit Herz (`comment_likes`), sortiert nach Herzen wie bei TikTok.
- Name und Logo je Hub (im Admin-Bereich): 8 Logos + `nice`-Fassungen aus Startup Story mit Farb-Themes oder ein eigenes Logo.

## 8. Datenschutz

- Alles hängt am Raum und geht mit ihm. Profilangaben sind ausgedacht. Upload und Tracking kommen in `datenschutz.html` und `DATENSCHUTZ.md`. Für den freien Raum und den Upload vorher Schulleitung/DSB fragen.

## 9. Räume

- **Klassenraum:** normaler MPSkills-Raum, darin ein Hub je Schüler; Lehrkraft = Admin überall, mit Übersicht.
- **Freier Raum:** ein gemeinsamer Hub je Schule, alle Angemeldeten automatisch drin (nur mit Lernwelt-Konto).

## 10. Technik

- `MPSkills/tools/<Skill>/`: `tool.js` + `tool.css` als Brücke, App in `index.html` im iframe.
- Migration **0262**: `fs_hubs` (room_id, Gründer = participant_id, name, logo/eigenes Logo, gesperrt), interne Tabellen `fs_*` mit `hub_id` (Daten je Hub getrennt, Schnappschuss je Hub), RPCs (Login, Feed, Likes …, Admin, `fs_admin_apply` für INSERT/UPDATE/DELETE aus dem Datenbank-Reiter), Passwörter bcrypt mit pgcrypto (`$2y$`/`$2a$` beide prüfbar), welche Tabellen erstellt sind in `skill_room_state.data.tables`.
- `PASSWORD_HASH()` als eigene SQLite-Funktion im Editor (bcrypt im Browser, Bibliothek fest in `vendor/`).

## 11. Etappen

1. Hub gründen (Name + Logo, eigenes Logo), Übersicht der Lehrkraft, Login/Registrieren auf jedem Hub, Feed, Fotos (Upload), Profil, Folgen, Likes, Kommentare (+ Herz), Tags, Lehrkraft erstellt Tabellen.
2. Admin-Bereich mit Datenbank-Reiter (SELECT lokal, INSERT/UPDATE/DELETE auf die Plattform), Nutzerverwaltung.
3. Dummy-Daten + Bildbibliothek, Werbung (Plan: Abschnitt 13). (Analytics `sessions`/`views` sind seit Migration 0270 gebaut.)
4. Freier Raum, Schaufenster, Aufgaben aus Sönkes Leitfaden.

## 12. Offene Fragen an Sönke

- Tabellennamen englisch (wie oben) oder deutsch?
- `likes` mit verschiedenen Reaktionen (`type`) oder nur Herz?
- Wer darf im Datenbank-Reiter schreiben: nur Admins, alle, oder per Schalter der Lehrkraft?
- Hub je Person oder auch Gruppen-Hubs (2–3 gründen zusammen)?
- Darf man sich auf allen Hubs der Klasse registrieren, oder nur auf denen, die der Gründer einlädt?

## 13. Werbung (Plan Sönke 05.11.2026 – gebaut in Migration 0276, Details `tools/SocialHub/CLAUDE.md`)

**Idee:** Die Plattform selbst spielt Werbung aus. Die Admins eines Netzwerks (Schüler im eigenen Netzwerk; im
Klassen-Netz die, die die Lehrkraft per `UPDATE users SET role = 'admin'` dazu macht) legen **Kampagnen** an.
Ob eine Kampagne zu einem User passt, entscheidet eine **SQL-Abfrage** auf den gesammelten Daten – wie bei InstaHub.
Keine eigene Werbekunden-Rolle: Admins sehen ohnehin alle Daten (Entscheidung Sönke).

### 13.1 Einschalten

- `ads` ist eine Tabelle im Diagramm der Lehrkraft wie alle anderen (`data.tables`), braucht `users`. Für die Schüler
  gibt es **nur `ads`** – keine weiteren Werbe-Tabellen (Sönke: sonst zu kompliziert).
- Ist `ads` erstellt, erscheint im Adminbereich der Reiter **Werbung** (neben SQL · Diagramm).
- **Dummy-Kampagnen** wie die übrigen Dummy-Daten („Füllen / Leeren“ an der Kachel) – **auch im Klassen-Netz**
  (Ausnahme von „Klassen-Netz ohne Dummy-Daten“). Deshalb fragen die Dummy-Kampagnen nur Dinge ab, die es auch ohne
  Dummy-User gibt (Tags, Likes, Geschlecht, Gerät, Uhrzeit, Verweildauer), keine bestimmten Dummy-Namen.

### 13.2 Eine Kampagne = „Wem?“ + „Was?“

| Feld | Bedeutung |
|---|---|
| **Wem?** (`target_sql`) | Zielgruppe als SQL (zwei Formen, siehe unten). Leer = alle. |
| **Was?** – Art `ad` | **Anzeige**: eigenes Bild + Titel + Text + Knopf („Mehr erfahren“). Erscheint im Feed als eigene Karte mit „Anzeige“ und als schmale Leiste am Bild (Kommentar-/Detailansicht) – wie bei InstaHub. |
| **Was?** – Art `boost` | **Beworbene Posts**: eine zweite Abfrage `content_sql` liefert Foto-ids (z. B. alle Fotos mit Tag `wissenschaft`). Diese Fotos werden der Zielgruppe im „Für dich“-Feed **vorgeschlagen** und dort mit „Gesponsert“ markiert. Damit wird der Vorschlags-Algorithmus sichtbar und steuerbar. |
| `active` | an/aus – im Reiter Werbung per Schalter (Admins können jede Kampagne deaktivieren, auch Dummy-Kampagnen) |

Keine gesponserten Profile (Sönke: nicht gewollt).

**Nachtrag 06.11.2026 (Migration 0277):** Anzeigen bekommen optional **„Wo?“** (content_sql = Foto-ids). Ohne „Wo?“ nur als Karte im Feed, mit „Wo?“ nur an diesen Fotos (Leiste am Foto + über dessen Kommentaren) – Kontext-Werbung neben personalisierter Werbung.

**Zwei Formen für „Wem?“** (`$user` = id des aktuellen Users):

```sql
-- Form 1: mit $user → ein Wert; wahr (true/1) = Anzeige passt
SELECT CASE gender WHEN 'male' THEN true ELSE false END FROM users WHERE id = $user

-- Form 2: ohne $user → Liste von ids; aktueller User dabei = Anzeige passt
SELECT id FROM users WHERE gender = 'male'
```

Beispiel „wissenschaftlich begeistert“ → Wissenschafts-Posts vorschlagen:

```sql
-- Wem?
SELECT l.user_id FROM likes l
JOIN photo_tag pt ON pt.photo_id = l.photo_id JOIN tags t ON t.id = pt.tag_id
WHERE t.name IN ('wissenschaft','physik','mond') GROUP BY l.user_id HAVING COUNT(*) >= 2
-- Was?
SELECT pt.photo_id FROM photo_tag pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = 'wissenschaft'
```

### 13.3 Kein Schüler-SQL auf dem Server

Der Server führt nie SQL der Schüler aus (Sönke: wichtig). Beim Betrachter kann es auch nicht laufen (er bräuchte die
ganze Datenbank). Deshalb rechnet **das Gerät eines Admins**:

1. Das Admin-Gerät führt `target_sql` in der SQLite-Kopie aus (Form 1: einmal je User mit eingesetztem `$user`;
   Form 2: einmal) und `content_sql` einmal – im Worker mit dem üblichen Abbruch nach 8 s.
2. Das Ergebnis (nur ganze Zahlen) geht an den Server und wird **intern** an der Kampagne gemerkt (z. B. Spalten
   `audience int[]` / `content int[]` in `sh_ads`, die nicht im Schnappschuss stehen – im SQL-Editor unsichtbar).
   Der Server prüft nur: ids gehören zum Netzwerk, Kampagne gehört zum Netzwerk, Deckel.
3. `sh_feed` mischt danach aus diesen Listen: je Seite (6 Posts) eine Anzeige mitten hinein, reihum; beworbene Fotos
   in „Für dich“: je Runde bis zu 3 sicher ganz vorn, die übrigen etwas weiter oben (gebaut so, 0276).

Neu gerechnet wird beim Speichern einer Kampagne und von selbst, solange ein Admin im Netzwerk ist (z. B. jede
Minute). Ob es zusätzlich einen Knopf „Neu berechnen“ braucht, schauen wir beim Bauen (Sönke). Klassen-Netz: die
Lehrkraft ist dort Admin, ihr Gerät rechnet beim Öffnen mit – die Dummy-Kampagnen bekommen so ihre Zielgruppe.

### 13.4 Tabelle `ads` (im SQL-Editor sichtbar, die einzige)

```
ads (id, user_id → users (wer sie angelegt hat), name, kind ENUM('ad','boost'),
     title, body, image, button, target_sql TEXT, content_sql TEXT,
     active BOOL, created_at)
```

- Anlegen/Ändern/Löschen im Reiter Werbung oder per SQL (`INSERT INTO ads …`, `UPDATE ads SET active = false …`)
  über `sh_db_apply`. `target_sql`/`content_sql` sind für den Server nur Text (Blacklist wie andere Texte).
- Keine Tabellen für Zielgruppe, Anzeigen oder Klicks; berechnete Listen bleiben intern (13.3).
- Klick auf eine Anzeige öffnet eine kleine Seite mit Bild + Text der Kampagne (kein Link nach draußen).

### 13.5 Reiter „Werbung“ (Adminbereich)

- Liste der Kampagnen als Karten: Name, Art, Schalter aktiv, Zielgruppe (Anzahl).
- Neu/Bearbeiten: Name · Art (Anzeige | Beworbene Posts) · bei Anzeige Bild (wie Posten, Zuschneiden), Titel, Text,
  Knopf · „Wem?“ als SQL-Editor (derselbe wie im Reiter SQL) mit Probelauf „trifft 7 User: …“ · bei Boost „Was?“
  ebenso mit Vorschau der Fotos.
- „Warum sehe ich das?“ an jeder Anzeige/jedem gesponserten Post zeigt dem User die Abfrage (passt zu
  „Was weiß das Netzwerk über mich?“).

### 13.6 Dummy-Kampagnen (Entwurf, ausgedachte Marken)

| Name | Art | Wem? | Was? |
|---|---|---|---|
| VOLTA Energy | Anzeige | ≥ 3 Likes auf Gaming-Tags | Dose, „Durchzocken?“ |
| Nachtschicht-Snacks | Anzeige | Form 1: `$user` hatte eine Session zwischen 0 und 4 Uhr | Chips-Lieferdienst |
| Sternwarte Pro | Boost | ≥ 2 Likes auf `wissenschaft`/`physik`/`mond` | Fotos mit Tag `wissenschaft` |
| Reiselust | Boost | `views` auf Reise-Tags mit Ø > 4 s | Fotos mit Tag `reisen` |
| Glow Skin | Anzeige | `gender = 'female'` | Kosmetik – Diskussion „Werbung nach Geschlecht“ |
| SpeedPhone X | Anzeige | Form 1: letzte Session von `$user` mit `os` = Android | „Zeit für ein Upgrade“ |
| Wahrheit.tv | Boost | liken `flacheerde`/`wachtauf` | Fotos mit Tag `flacheerde` – Warnbeispiel Filterblase |
| Pfotenglück | Anzeige | ≥ 1 Like auf Tier-Tags | Tierfutter |

Bilder kommen in `dummy/img/ads/` (Liste in `dummy/LISTE.md` ergänzen).
