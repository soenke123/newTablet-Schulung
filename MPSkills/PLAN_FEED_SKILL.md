# Plan: Feed-Skill (Arbeitstitel) — „InstaHub, aber wie TikTok“

Stand 03.11.2026 · Entwurf 3 zum Abstimmen mit Sönke, noch keine Zeile Code.
Aufgaben und Leitfaden von Sönke kommen später und werden dann hier eingearbeitet.

## Idee in einem Satz

Die Klasse benutzt eine eigene soziale Plattform im Stil von TikTok (Vollbild-Karten, endloses Scrollen, „Für dich“, Tags), nur mit Fotos statt Videos. Dabei entstehen echte Daten. Die Lehrkraft erstellt nach und nach die Tabellen für den Raum, und die Klasse untersucht im Admin-Bereich mit SQL und Diagramm, was die Plattform über sie weiß.

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
- Später, für Analytics und Werbung (eigener Block, erst wenn Kern steht): `views` (wer hat welches Foto wie lange gesehen) und `ads` + `ad_views`/`ad_clicks`.

## 2. Tabellen erstellen = Lehrkraft

- Kein `CREATE TABLE` durch Schüler. Die **Lehrkraft erstellt** jede Tabelle in ihrer Steuerung mit einem Knopf, für alle im Raum. Damit erscheint die passende Funktion in der App (Likes, Folgen, Kommentare, Tags …).
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

- **Lehrkraft-Steuerung** (nur Lehrkraft): Tabellen erstellen, Dummy-Daten, Name + Logo, Upload an/aus, wer im Datenbank-Reiter schreiben darf, Rollen vergeben, Raum zurücksetzen.
- **Admin-Bereich** (Lehrkraft + alle mit `role = 'admin'`): Nutzer (sperren, Passwort neu, Rolle), gemeldete Inhalte, Analysen, **Datenbank**.
- Die Lehrkraft ist beim Öffnen des Raums automatisch als Admin angemeldet. Schüler werden Admin, wenn die Lehrkraft es einstellt oder per `UPDATE users SET role = 'admin' …`, sofern sie schreiben dürfen. Das ist auch eine schöne Lektion.

## 6. Fotos

- **Eigener Upload mit automatischer Komprimierung:** Das Bild wird im Gerät auf höchstens 1080 px verkleinert und als WebP gespeichert (Qualität sinkt automatisch, bis es unter 200 KB liegt). Dazu kommt ein Vorschaubild mit 320 px. Metadaten (GPS, Kamera) fallen dabei weg, optional wird vorher angezeigt, was drinsteckte. Gespeichert wird in einer internen Tabelle mit dem Raum (wie die Fotos der Projektarbeit), in `photos.image` steht nur der Verweis. Deckel z. B. 30 je Konto, 60 MB je Raum. Hinweis zu Gesichtern/Bildrechten, Melden, Löschen durch Lehrkraft/Admin.
- **Bildbibliothek** für Dummy-Daten und alle ohne eigene Bilder (später).

## 7. App (Schülersicht)

- Feed mit Vollbild-Karten zum senkrechten Wischen, endlos (lädt nach, mischt Dummy-Fotos und ältere Fotos dazu), Doppeltipp = Like, rechte Leiste mit Profil · Like · Kommentar, unten @username, Beschreibung, #Tags.
- „Für dich“ (Algorithmus nach Tags/Likes) und „Folge ich“.
- Profil mit Foto-Raster, Follower, Folge ich, Bio. Suche nach Tags und Nutzern.
- Kommentare mit Herz (`comment_likes`), sortiert nach Herzen wie bei TikTok.
- Name und Logo je Raum: 8 Logos + `nice`-Fassungen aus Startup Story mit ihren Farb-Themes.

## 8. Datenschutz

- Alles hängt am Raum und geht mit ihm. Profilangaben sind ausgedacht. Upload und Tracking kommen in `datenschutz.html` und `DATENSCHUTZ.md`. Für den freien Raum und den Upload vorher Schulleitung/DSB fragen.

## 9. Räume

- **Klassenraum:** normaler MPSkills-Raum, Lehrkraft = Admin.
- **Freier Raum:** eine Plattform je Schule, alle Angemeldeten automatisch drin (nur mit Lernwelt-Konto).

## 10. Technik

- `MPSkills/tools/<Skill>/`: `tool.js` + `tool.css` als Brücke, App in `index.html` im iframe.
- Migration **0262**: interne Tabellen `fs_*` mit `room_id`, RPCs (Login, Feed, Likes …, Admin, `fs_admin_apply` für INSERT/UPDATE/DELETE aus dem Datenbank-Reiter), Passwörter bcrypt mit pgcrypto (`$2y$`/`$2a$` beide prüfbar), welche Tabellen erstellt sind in `skill_room_state.data.tables`.
- `PASSWORD_HASH()` als eigene SQLite-Funktion im Editor (bcrypt im Browser, Bibliothek fest in `vendor/`).

## 11. Etappen

1. Login/Registrieren, Feed, Fotos (Upload), Profil, Folgen, Likes, Kommentare (+ Herz), Tags, Lehrkraft erstellt Tabellen, Name + Logo.
2. Admin-Bereich mit Datenbank-Reiter (SELECT lokal, INSERT/UPDATE/DELETE auf die Plattform), Nutzerverwaltung.
3. Dummy-Daten + Bildbibliothek, Analytics (`views`), Werbung.
4. Freier Raum, Schaufenster, Aufgaben aus Sönkes Leitfaden.

## 12. Offene Fragen an Sönke

- Tabellennamen englisch (wie oben) oder deutsch?
- `likes` mit verschiedenen Reaktionen (`type`) oder nur Herz?
- Wer darf im Datenbank-Reiter schreiben: nur Admins, alle, oder per Schalter der Lehrkraft?
- Name und Logo: Lehrkraft oder Abstimmung der Klasse?
