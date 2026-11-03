# Plan: Feed-Skill (Arbeitstitel) — „InstaHub, aber wie TikTok“

Stand 03.11.2026 · Entwurf 2 zum Abstimmen mit Sönke, noch keine Zeile Code.
Aufgaben und Leitfaden von Sönke kommen später und werden dann hier eingearbeitet.

## Idee in einem Satz

Die Klasse benutzt eine eigene soziale Plattform im Stil von TikTok (Vollbild-Karten, endloses Scrollen, „Für dich“, Hashtags, Sounds), nur mit Bildern statt Videos. Dabei entstehen echte Daten. Die Lehrkraft schaltet nach und nach Tabellen frei bzw. lässt sie anlegen, und die Klasse untersucht im Admin-Bereich mit SQL, Diagramm und Analytics, was die Plattform über sie weiß und wie Werbung damit zielt.

## 1. Grundentscheidung: Daten in Supabase, SQL im Browser

- Die Plattform-Daten sind normale Tabellen (`fs_*`, jede mit `room_id`), werden nur über RPCs geschrieben und gelesen (Regeln aus CLAUDE.md: keine Grants, `grant execute`, Wächter 0225) und gehen mit dem Raum (FK + CASCADE, Wächter 0227).
- Der **Datenbank-Reiter** im Admin-Bereich holt einen **Schnappschuss** der freigeschalteten Tabellen dieses Raums (ohne `room_id`, ohne Bild-Bytes) und baut daraus mit dem **Kern von SQL Studio** (`core.js`, `worker.js`, `diagram.js`, Editor) eine SQLite-Datenbank. Dort stehen SQL, Daten, Struktur und Klassendiagramm zur Verfügung.
- Der Server führt nie SQL der Schüler aus. Eine Änderung im Datenbank-Reiter ändert nur die Kopie, nicht die Plattform (wie eine Testdatenbank). „Neu laden“ holt den aktuellen Stand.

## 2. Begriffe (wie bei TikTok)

In der App gelten die TikTok-Begriffe (deutsche Oberfläche wie in der deutschen TikTok-App), in der Datenbank englische Tabellennamen wie bei echten Plattformen.

| In der App | Tabelle | Bedeutung |
|---|---|---|
| Für dich / Folge ich | – (`views`) | die zwei Feeds |
| Creator, Profil, Bio, Benutzername (@handle) | `users` | Konto |
| Post (Foto-Modus, bis 5 Bilder zum Wischen) | `posts`, `post_images` | Beitrag |
| Sound („Originalton – @mia“) | `sounds` | Musik/Ton unter dem Post, Trend-Sounds |
| Hashtag | `hashtags`, `post_hashtags` | n:m |
| Like | `likes` | n:m |
| Folgen, Follower, Folge ich, Freunde (= gegenseitig) | `follows` | n:m auf `users` |
| Kommentar, Antworten | `comments` | |
| Favoriten (Lesezeichen) | `favorites` | n:m |
| Aufrufe, Wiedergabezeit | `views` | Tracking |
| Gesponsert, Werbekunde, Kampagne, Ads Manager | `advertisers`, `campaigns`, `ads`, … | Werbung |
| Melden | `reports` | Moderation |
| Creator-Tools / Analysen | – | Statistik zum eigenen Konto |
| Privates Konto, Folge-Anfrage | `users.is_private`, `follows.status` | Sichtbarkeit |
| „Wer kann das sehen: Alle · Freunde · Nur ich“ | `posts.visibility` | Sichtbarkeit je Post |

## 3. Beziehungen — was im Schema steckt

**1:n:** `users → posts` · `posts → comments` · **`sounds → posts`** (sehr TikTok: viele Posts nutzen denselben Trend-Sound) · **`posts → post_images`** (Foto-Karussell, ein Post hat 1–5 Bilder) · `comments → comments` (Antworten, `parent_id` = 1:n auf sich selbst) · `advertisers → campaigns → ads` (Kette aus zwei 1:n)

**n:m:** `posts ↔ hashtags` (`post_hashtags`) · `users ↔ posts` als `likes`, `favorites`, `views` (dreimal dieselben zwei Tabellen, aber andere Bedeutung) · `users ↔ users` (`follows`) · `ads ↔ hashtags` (`ad_targets`)

## 4. Datenbank-Schema (Vorschlag, so wie es im Datenbank-Reiter erscheint)

```
users          (id PK, username UNIQUE, display_name, bio, avatar, birth_date, city,
                email, password_hash, role ENUM('user','moderator','admin'),
                is_private, is_verified, created_at, last_login)
sounds         (id PK, title, artist, user_id FK→users NULL, created_at)
posts          (id PK, user_id FK→users, sound_id FK→sounds NULL, caption,
                visibility ENUM('public','friends','private'), allow_comments, created_at)
post_images    (id PK, post_id FK→posts, position, image, width, height, alt_text)
hashtags       (id PK, name UNIQUE)
post_hashtags  (post_id FK, hashtag_id FK, PK(post_id, hashtag_id))
likes          (user_id FK, post_id FK, created_at, PK(user_id, post_id))
favorites      (user_id FK, post_id FK, created_at, PK(user_id, post_id))
follows        (follower_id FK→users, following_id FK→users,
                status ENUM('accepted','pending'), created_at, PK(follower_id, following_id))
comments       (id PK, post_id FK, user_id FK, parent_id FK→comments NULL, text, created_at)
reports        (id PK, reporter_id FK→users, post_id FK NULL, comment_id FK NULL,
                reason, status ENUM('open','done'), created_at)
-- Tracking
views          (id PK, user_id FK, post_id FK, started_at, watch_time_ms,
                source ENUM('foryou','following','profile','search','hashtag'),
                device, swiped_back)
sessions       (id PK, user_id FK, started_at, ended_at, device, screen_w, screen_h, dark_mode)
searches       (id PK, user_id FK, query, created_at)
interests      VIEW (user_id, hashtag_id, score)  -- aus views/likes/favorites berechnet
-- Werbung
advertisers    (id PK, name, logo, industry)
campaigns      (id PK, advertiser_id FK, name, budget, min_age, max_age, city, starts_at, ends_at)
ads            (id PK, campaign_id FK, image, text, button_text)
ad_targets     (ad_id FK, hashtag_id FK, PK(ad_id, hashtag_id))
ad_impressions (id PK, ad_id FK, user_id FK, shown_at, watch_time_ms)
ad_clicks      (id PK, ad_id FK, user_id FK, clicked_at)
```

- `password_hash` ist im Datenbank-Reiter **sichtbar**, aber natürlich nur als Hash (bcrypt per pgcrypto). Daran lässt sich zeigen: Selbst der Admin kennt dein Passwort nicht. Die Ausnahme ist die Spalte im Schnappschuss für Schüler-Admins, die kann bei Bedarf ausgeblendet werden.
- `birth_date`, `city` und `email` sind ausgedacht, aber für Werbung (Alter, Ort) wertvoll. Daran sieht man, warum Plattformen bei der Registrierung danach fragen.
- Intern (nicht im Schnappschuss): `room_id`, `participant_id` (wer steckt hinter dem Konto, nur für die Lehrkraft), die Bild-Bytes.

## 5. Freischalten — zwei Arten je Stufe

| Stufe | Funktion in der App | Tabellen |
|---|---|---|
| 0 | Registrieren, Profil, Posts, Feed | `users`, `posts`, `post_images` |
| 1 | Likes | `likes` |
| 2 | Folgen, private Konten | `follows` |
| 3 | Hashtags, Suche | `hashtags`, `post_hashtags`, `searches` |
| 4 | Kommentare, Antworten | `comments` |
| 5 | Sounds | `sounds` |
| 6 | Favoriten, Melden | `favorites`, `reports` |
| 7 | Tracking sichtbar | `views`, `sessions`, `interests` |
| 8 | Werbung | `advertisers`, `campaigns`, `ads`, `ad_targets`, `ad_impressions`, `ad_clicks` |

Die Lehrkraft wählt je Stufe (die Reihenfolge wird an den Leitfaden angepasst):

- **„Freischalten“:** Die Tabelle ist sofort da, mit Daten, und die Funktion erscheint in der App.
- **„Selbst anlegen lassen“** (wie bei InstaHub): Die Funktion ist gesperrt, bis jemand im Admin-Bereich die Tabelle mit `CREATE TABLE` richtig anlegt. Die App liest das CREATE mit `SQLCore.parseCreate`. Der Server vergleicht es mit der Vorgabe (Tabellenname, Spaltennamen, Primärschlüssel, Fremdschlüssel; Datentypen großzügig) und schaltet die Funktion für den ganzen Raum frei, z. B. mit der Meldung „🎉 Likes sind live!“. Bei einem Fehler gibt es einen Hinweis wie „Es fehlt noch ein Fremdschlüssel auf posts“.
- Idee für den Aha-Effekt: Beim Tracking (Stufe 7) hat die Plattform **schon vorher heimlich mitgeschnitten**. Wer die Tabelle freischaltet, findet die Daten seit der ersten Stunde.

## 6. Anmelden, Konten, Geräte, Sichtbarkeit

### So sieht es aus

1. Die Schüler betreten den MPSkills-Raum wie immer (Code/QR). Danach sehen sie **eine ganz normale Login-Seite** der Plattform: Logo, Name, „Anmelden“ / „Registrieren“ / „Passwort vergessen?“.
2. **Registrieren:** Benutzername, Passwort, Geburtsdatum, optional E-Mail (alles ausgedacht; kleiner Hinweis „Nimm kein echtes Passwort“). Danach folgen Profilbild und Bio wie bei TikTok, später die Frage „Was interessiert dich?“ (Hashtags, die schon das erste Interessenprofil liefern).
3. **Anmelden:** Benutzername + Passwort.

### Geräteübergreifend und persönliche Codes

- Das Plattform-Konto liegt **auf dem Server im Raum**. Wer auf einem anderen Gerät den Raum betritt, meldet sich mit Benutzername + Passwort an und ist wieder da. Dafür braucht es **keinen extra persönlichen Code**, das Passwort übernimmt diese Rolle.
- Passwort vergessen: Der Admin setzt es im Admin-Bereich zurück. Er kann es nicht lesen, sondern nur ein neues setzen, und auch das ist eine Lektion.
- Anmeldung = Sitzungs-Token (`fs_sessions`). Auf Schulgeräten (`mpskills.device = school`) liegt es nur in sessionStorage (Tab zu = abgemeldet) mit Abmeldung nach Inaktivität. Auf eigenen Geräten bleibt man angemeldet. Dazu gibt es „Abmelden“ und „Auf allen Geräten abmelden“.
- Mehrere Konten je Person sind erlaubt (Zweitkonto, Fake-Account, das gehört dazu), mit Deckel (Vorschlag 3). Intern hängt jedes Konto am Teilnehmer, die Lehrkraft sieht also immer, wer dahintersteckt (anonym für die Klasse, nicht für die Lehrkraft; wichtig bei Mobbing).

### Sichtbarkeit

- **Privates Konto:** Folgen nur nach Anfrage (`follows.status = 'pending'`), die Posts sehen nur Follower.
- **Je Post:** Alle · Freunde (gegenseitig folgen) · Nur ich.
- Die App hält sich daran (geprüft im RPC). **Der Admin sieht im Datenbank-Reiter trotzdem alles.** Das ist die Kernlektion: „Privat“ heißt nicht „unsichtbar für den Betreiber“.

## 7. Admin — ja, didaktisch wertvoll

**Zwei Ebenen, sauber getrennt:**

| | Wer | Was |
|---|---|---|
| **Lehrkraft-Steuerung** (außerhalb der Plattform-Geschichte) | nur Raum-Besitzer/eingeladene Lehrkräfte | Stufen freischalten / anlegen lassen, Name + Logo, Bild-Upload an/aus, Algorithmus-Regler, Werbung zufällig/gezielt, Raum zurücksetzen, Rollen vergeben |
| **Plattform-Admin** (in der Geschichte: „Betreiber“) | Lehrkraft + alle, denen sie die Rolle gibt | Admin-Bereich mit Reitern **Nutzer** (sperren, Passwort zurücksetzen, Rolle) · **Meldungen** (Moderation) · **Analysen** (Dashboard) · **Ads Manager** · **Datenbank** (SQL, Daten, Struktur, Diagramm) |

- Die Lehrkraft ist beim Öffnen des Raums **automatisch als Admin angemeldet** (Konto `@team` bzw. `@<plattform>`, wird beim Anlegen des Raums erzeugt). Sie braucht dafür kein Passwort, weil MPSkills sie schon als Besitzerin kennt. Für ein anderes Gerät kann sie ein Passwort setzen.
- Schüler werden **nicht automatisch** Admin, sonst verliert die Rolle ihren Wert. Die Lehrkraft vergibt `moderator`/`admin` einzeln (z. B. eine Betreiber-Gruppe) oder schaltet für die Datenbank-Phase „Alle sind Admin“ ein.
- `users.role` steht in der Tabelle. Damit lässt sich das Rollenkonzept direkt im Schema zeigen, und es gibt einen schönen SQL-Moment: `SELECT username FROM users WHERE role = 'admin'`.
- Lernen am Fall: Die Moderatorin sieht gemeldete Posts, der Admin sieht alles, der User nur, was er darf.

## 8. Bilder: Bibliothek + eigener Upload mit automatischer Komprimierung

**Upload (Schalter der Lehrkraft, Standard: an):**

1. Bild wählen (Kamera oder Galerie; iPad liefert HEIC als JPEG).
2. Im Gerät verkleinern: längste Seite höchstens 1080 px. Als WebP (Fallback JPEG) mit Qualität 0,8 speichern; ist es noch größer als 200 KB, wird die Qualität schrittweise gesenkt. Dazu kommt ein Vorschaubild mit 320 px (ca. 20 KB) für Profil-Raster und Feed-Vorlauf. Egal wie groß das Original ist, beim Server kommen höchstens ca. 220 KB an.
3. Durch das Neuzeichnen fallen **alle Metadaten weg** (EXIF, GPS-Ort, Kamera). Optional zeigt die App vorher kurz an: „Diese Daten steckten in deinem Foto und wurden entfernt: Ort, Zeitpunkt, Gerät“. Das ist ein guter Datenschutz-Moment.
4. Zuschnitt auf Hochformat 4:5 (wie im Feed), optional verschieben/zoomen.

**Speicher:** eigene Tabelle `fs_media` (Bytes in der Datenbank, wie die Fotos der Projektarbeit, gelöscht mit dem Raum), geliefert über RPC und als `blob:`-URL angezeigt. Das passt zur CSP (`img-src` erlaubt `blob:`, aber nicht Supabase Storage). Deckel (Vorschlag): 30 Bilder je Konto, 60 MB je Raum. Im Schnappschuss steht in `post_images.image` nur ein Verweis, nicht das Bild.

**Schutz:** Hinweis beim ersten Upload („Keine Gesichter anderer, nur Bilder, die du zeigen darfst“), Melden-Knopf, Lehrkraft und Moderatoren löschen sofort. Datenschutzerklärung ergänzen.

**Bildbibliothek bleibt** für alle ohne eigene Bilder, für Story-Accounts und Werbung: Bilder lokal im Skill-Ordner mit Katalog (`datei, thema, tags[]`). Die Plattform „weiß“, was auf diesen Bildern ist, was Analytics und Werbung stärker macht. Text-Posts auf Farbverlauf gibt es zusätzlich.

## 9. App (Schülersicht)

- **Feed:** Vollbild-Karten zum senkrechten Wischen (scroll-snap), Karussell waagerecht, Doppeltipp = Like, rechte Leiste mit Profil · Like · Kommentar · Favorit · Teilen, unten @handle, Text, #Hashtags und ♪ Sound (laufender Titel).
- **Endloses Scrollen:** Die App lädt seitenweise nach. Sind die echten Posts durch, kommen Story-Accounts und ältere Posts dazu.
- **„Für dich“:** `score = a·Interesse + b·Beliebtheit + c·Frische + d·folge ich + Zufall`, mit Reglern für die Lehrkraft (Filterblase live).
- **Gesponsert-Karten** alle n Posts, gezielt nach Interessenprofil oder zufällig (A/B per Schalter, Klickrate im Ads Manager).
- **Creator-Tools:** eigene Aufrufe, Wiedergabezeit, Follower-Verlauf; dazu „Was weiß die Plattform über mich?“.
- **Name und Logo:** 8 Logos + `nice`-Fassungen aus Startup Story mit ihren Farb-Themes (`js/theme.js`). Name und Logo gelten je Raum (Lehrkraft legt fest oder Klasse stimmt ab). Das Redesign zur `nice`-Fassung kann eine spätere Freischaltung sein.

## 10. Datenschutz

- Getrackt wird nur Verhalten **in der App, im Raum**: keine Fingerprints, keine IP, nichts außerhalb des Skills.
- Alles hängt am Raum und geht mit ihm. Freier Raum: eigene Frist (Vorschlag 30 Tage für Posts, Bilder, Tracking).
- Ein Hinweis beim Start sagt, dass diese Plattform absichtlich mitschneidet, um zu zeigen, wie das funktioniert.
- `datenschutz.html` und `DATENSCHUTZ.md` ergänzen (Upload, Tracking). Für den freien Raum und den Upload vorher mit Schulleitung/DSB sprechen.

## 11. Räume

- **Klassenraum:** normaler MPSkills-Raum, Lehrkraft = Admin.
- **Freier Raum:** eine Plattform je Schule, alle Angemeldeten automatisch drin, nur mit Lernwelt-Konto. Die Freischaltung stellt der Admin der Lernwelt ein. Login-Seite wie oben.

## 12. Technik

- `MPSkills/tools/<Skill>/`: `tool.js` + `tool.css` als Brücke, App in `index.html` im iframe (wie SQL Studio / Tiny LM).
- Migration **0262**: Tabellen `fs_*`, RPCs (Token des Teilnehmers + Sitzungs-Token des Plattform-Kontos), pgcrypto für Passwörter, Freischaltstand in `skill_room_state.data.unlocked` (`{stufe: 'open'|'create'|'locked'}`), Name/Logo in `data.brand`. Prüfstand `supabase/tests/0262_….mjs`.
- Tracking-Ereignisse gesammelt, alle paar Sekunden gebündelt gesendet, Limit je Konto.
- Schaufenster `MPSkills/preview/<skill>.js` mit `?demo=1`.

## 13. Etappen

1. **Login + Plattform:** Login/Registrieren, Sitzungen, Profil, Posts (Upload mit Komprimierung + Bibliothek), Feed mit endlosem Scrollen, Likes, Folgen, Hashtags, Kommentare, Sichtbarkeit, Name + Logo, Lehrkraft-Steuerung mit Stufen „freischalten“.
2. **Admin-Bereich:** Nutzer, Meldungen, Rollen, Datenbank-Reiter (Schnappschuss → SQL Studio-Kern), Stufen „selbst anlegen“.
3. **Tracking + Analysen:** Ereignisse, Dashboard, Creator-Tools, „Was weiß die Plattform über mich?“, Algorithmus-Regler, Sounds.
4. **Werbung:** Ads Manager, gezielt vs. zufällig, Werbekunden-Modus für Gruppen.
5. **Freier Raum, Storylines, Schaufenster, Aufgaben aus Sönkes Leitfaden.**

## 14. Was ich von dir brauche

1. **Bilder für die Bibliothek:** ca. 150–250 in 12–15 Themen, als Ordner je Thema. Das Format ist egal, die App wandelt sie um.
2. **Storylines / Story-Accounts:** 15–30 Figuren mit je 5–15 Posts (Influencer mit heimlicher Werbung, Fake-News-Welle, Gewinnspiel als Datensammler, Datenleck …).
3. **Sounds:** nur Titel + Künstler (ausgedacht). Echte Audiodateien brauchen wir nicht, ♪ als Laufschrift reicht.
4. **Marken für Werbung:** erfundene Namen + Logos, oder ich schlage welche vor.
5. **Aufgaben + Leitfaden** (später).

## 15. Offene Fragen an Sönke

- Je Stufe „freischalten“ **und** „selbst anlegen lassen“ anbieten, oder nur eins davon?
- Zweitkonten / Fake-Accounts erlauben (mit Deckel)?
- Soll `password_hash` für Schüler-Admins sichtbar sein?
- Upload standardmäßig an oder aus?
- Name und Logo: Lehrkraft oder Abstimmung?
- Freier Raum: je Schule? Welche Stufen? Wie lange bleiben die Daten?
- Direktnachrichten: weglassen oder als späte Stufe „Die Plattform liest mit“?
- Arbeitstitel für den Skill?
