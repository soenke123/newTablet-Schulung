# YourSozialNet — soziales Netzwerk + Datenbank (MPSkill, Migrationen 0262–0265)

Wie InstaHub, nur moderner im Stil von TikTok (Fotos statt Videos, Vollbild-Karten, endloses Scrollen). **Nur für Admins sichtbar** (`skill_tools.admin_only`, Schild über `tools.js` `adminOnly`), Beta. Plan und Hintergrund: `MPSkills/PLAN_FEED_SKILL.md`.

## Begriffe (nur für diesen Skill, mit Sönke geklärt 03.11.2026)

| Begriff | Bedeutung | intern |
|---|---|---|
| **Lehrkraft** | wer den Raum eröffnet hat (auch eingeladene Lehrkräfte) | `p_code`, `r_teacher`, `r_tuid` |
| **Schüler** | wer dem Raum beitritt (ein Gerät = ein Teilnehmer) | `p_token`, `r_part` |
| **Netzwerk** | ein soziales Netzwerk, das ein Schüler oder die Lehrkraft erstellt und gestaltet | `sh_hubs` (Code sagt weiter „hub“) |
| **User** | ein Konto in einem Netzwerk | `sh_users` |
| **Admin** | das Admin-Konto des Netzwerks (das erste Konto des Gründers, `owner_user`, `role = 'admin'`) | |

In der Oberfläche steht nie „Hub“, immer „Netzwerk“.

## Grundentscheidungen (Stand Migration 0265)

- **Name YourSozialNet** (bis 0265 „Social Hub“; id `socialhub`, Ordner `SocialHub`, `sh_*` bleiben).
- **Jeder Schüler erstellt sein eigenes Netzwerk – und kommt nur in seins** (`sh_access` → `hub_private`, `sh_home` zeigt nur das eigene). Startseite der Schüler: nur „Netzwerk erstellen“ bzw. beim ersten Laden gleich ins eigene. Auf einem anderen Tablet: „Hier anmelden“ mit Netzwerk-Name + Benutzername + Passwort (`sh_login_net`); die Sitzung dieses Geräts öffnet dann das Netzwerk (auch auf der Startseite), Abmelden schließt es wieder. Ein klassenweites Netz der Lehrkraft kommt später.
- **Erstellen in zwei Schritten**: 1. Name, Logo (8 aus Startup Story oder eigenes Bild), Farbschema Dunkel/Hell + Akzent (passt sich dem Logo an, nachjustierbar) mit Handy-Vorschau (`sh_found` legt nur das Netzwerk an, eigenes Logo danach über `sh_brand`). 2. Anmelde-/Registrierseite des Netzwerks mit „admin“ als vorbelegtem Benutzernamen: das erste Konto des Gründers wird Admin (`sh_register` → `owner_user`). Name, Geschlecht, E-Mail, Geburtstag, Wohnort, Über mich sind Deko. Passwort wiederholen (nur im Browser geprüft), „Angemeldet bleiben“.
- **Admin-Rechte hängen am Konto** (`role = 'admin'`), nicht am Gerät: ein zweites Konto, das der Gründer anlegt, ist normaler User und sieht keinen Adminbereich. Der Gründer ohne Admin-Konto ist Admin, bis es eins gibt (`needs_admin`).
- **Anmelden**: Schüler müssen sich mit Passwort anmelden (kein Gründer-Automatismus mehr). „Angemeldet bleiben“ = Sitzung in localStorage, sonst sessionStorage (`api.js session.set(hub, s, keep)`, vorbelegt auf eigenen Geräten). **Lehrkräfte bleiben in ihrem eigenen Netzwerk immer angemeldet** (`sh_enter` gibt ihnen eine Sitzung, kein Abmelden-Knopf).
- **Passwort vergessen**: Die Lehrkraft setzt in der Liste mit dem Schlüssel das Admin-Passwort zurück (`sh_admin_reset`) und sieht Anmeldename + neues Passwort (lesbar, z. B. `pazugo89`).
- **Im Netzwerk**: Kopf mit Logo, Name und den Reitern **App** | **Adminbereich** (nur Admins). App = normale Ansicht eines Users (unten Start · Suche · ＋ · Profil; ＋ immer da, ohne `photos` erklärt es, warum Posten noch nicht geht). Adminbereich = oben daneben, anders gestaltet: **Einstellungen** (Name, Logo, Farben) · **SQL** · **Diagramm**. Einen Daten- oder Nutzer-Reiter gibt es nicht – das geht über SQL (Beispiele: Passwort neu setzen per `UPDATE … PASSWORD_HASH(…)`, Rolle ändern).
- **Startseite der Lehrkraft** (breit): oben „Eigenes Netzwerk erstellen“, dann die Liste aller Netzwerke (Name + wer es erstellt hat, das eigene golden; Schlüssel = Admin-Passwort, Schloss = sperren, Mülleimer = löschen), darunter **Tabellen für alle Netzwerke** als kleines Diagramm: nur Namen, users grün mit Schloss, erstellte schwarz umrandet, nicht erstellte grau gestrichelt mit „Erstellen“, Linien = Fremdschlüssel (Punkt am n-Ende), antippen = Attributliste (aus `SHDB.DDL` gelesen). Schalter „Eigene Bilder hochladen“ rechts oben. Die Lehrkraft ist auf jedem Netzwerk Admin und kann sich dort ein **Testkonto** anlegen (bis 10).
- **Tabellen englisch** wie bei InstaHub: `users, photos, follows, likes, comments, comment_likes, tags, photo_tag`. Nur `users` gibt es immer, alle anderen erstellt die Lehrkraft (`skill_room_state.data.tables`, `tags` bringt `photo_tag` mit). Abhängigkeiten (`sh_on` und `NEEDS` in app.js): likes, comments, tags brauchen photos, comment_likes braucht comments; Entziehen nimmt Abhängige mit (mit Rückfrage), blendet aber nur aus – die Daten bleiben. Kein `CREATE TABLE` durch Schüler.
- **users.gender** `ENUM('male','female','diverse')` (0265), in Registrieren, Profil bearbeiten, Schnappschuss und `sh_db_apply`.
- **Nur Herz** (keine Reaktionen); Kommentare haben eigene Herzen (`comment_likes`).
- **Passwörter als bcrypt-Hash sichtbar** (`$2a$08$…`, pgcrypto). Ein per SQL im Klartext eingefügtes Passwort funktioniert nicht – gewollt. **Konto per INSERT**: `INSERT INTO users (username, name, gender, password) VALUES ('x', 'X', 'diverse', PASSWORD_HASH('geheim'));` – `PASSWORD_HASH` (auch `BCRYPT`, `PASSWORD_VERIFY(pw, hash)`) ist bcrypt im Worker (`vendor/bcryptjs-2.4.3.min.js`).
- **Alle Admins dürfen in SQL schreiben**: SELECT läuft in einer SQLite-Kopie im Browser, INSERT/UPDATE/DELETE gehen als Zeilen-Unterschied an `sh_db_apply` (alles oder nichts). CREATE/ALTER/DROP gesperrt.
- **Eigene Bilder** (Schalter `data.upload`, Standard an): im Gerät ≤1080 px, WebP/JPEG ≤250 KB, Vorschau 320 px ≤40 KB, Metadaten fallen weg (`js/media.js`), gespeichert in `sh_media`.
- **Design**: draußen (Startseite, Erstellen) hell mit kräftigem Kontrast, Hell/Dunkel wie MPSkills (`data-theme` vom Rahmen, MutationObserver); im Netzwerk dessen Schema (`data-scheme`) und Akzent `--hub`; Feed-Karten immer dunkel. Eigene Netzwerke golden.
- **Nie über ein Formular zeichnen** (Rückmeldung „aus der Registrieren-Maske geflogen“): Zustandswechsel des Raums und der 15-s-Takt der Lehrkraft zeichnen nur `S.screen === 'home'` bzw. App-Reiter ohne Eingaben neu, sonst nur ein Hinweis. Prüfstand e2e Punkt 2.

## Dateien

| Datei | Rolle |
|---|---|
| `tool.js` / `tool.css` | Brücke wie SQL Studio: Rahmen `index.html?raum=CODE&rolle=presenter|participant`; `sh:call` (nur `sh_*`) → `ctx.actions.call`, `sh:setData` (nur Lehrkraft) → `skill_room_set_state`, `sh:state` = `skill_room_state.data` |
| `index.html` | App; lädt `../SQLStudio/js/core.js`, `editor.js`, `diagram.js` mit (geteilt, nicht kopiert) |
| `js/api.js` | Brücke zum Rahmen, Sitzung je Netzwerk im Gerät („Angemeldet bleiben“), deutsche Fehlertexte (`ERR`) |
| `js/media.js` | Bilder verkleinern (`compress`, `compressLogo`), Hauptfarbe eigener Logos, gebündeltes Holen über `sh_media_get` als blob:-Adressen |
| `js/app.js` | Bildschirme `S.screen`: home (Schüler / Lehrkraft mit Liste + Tabellen-Diagramm) · found (Schritt 1, `brandEditor` mit Handy-Vorschau, auch für Einstellungen) · login (Anmelden/Registrieren, `admin` = Schritt 2) · netlogin (anderes Tablet) · hub (App: Feed Für dich / Folge ich, endlos, Doppeltipp = Herz, Kommentare, Profil, Suche, Posten · Adminbereich: Einstellungen · SQL · Diagramm) |
| `js/db.js` | SQL und Diagramm des Adminbereichs (`show('sql'|'diagram')`, Reiter stehen im Kopf): Schnappschuss → SQLite (DDL in MySQL-Schreibweise, `SHDB.DDL` auch fürs Diagramm der Lehrkraft), Diff → `sh_db_apply`, bei Ablehnung neu laden |
| `js/dbworker.js` | sql.js + SQL-Studio-Kern + bcrypt im Worker, 8-s-Abbruch in db.js |
| `css/app.css` | hell/dunkel wie MPSkills, im Netzwerk dessen Schema (`data-scheme`) und Akzent `--hub`; Editor-/Diagramm-Klassen von SQL Studio nachgezogen |
| `img/logos/*.png` | die 8 „nice“-Logos aus Startup Story (`bell connect rocket graph trend chat like mesh`) |
| `tests/e2e.mjs` + `tests/harness.html` | Prüfstand im Browser (Playwright + pglite, ganze Migrationskette): `node MPSkills/tools/SocialHub/tests/e2e.mjs`, Bildschirmfotos nach `SH_SHOTS` (Standard `tests/shots/`, nicht im Repo) |

## Server (Migrationen 0262–0265, Prüfstand `supabase/tests/0262_socialhub.mjs`)

- Intern `sh_*` mit `hub_id`, ids je Hub ab 1 (`sh_next`, Advisory-Lock). Alles geht mit Raum/Teilnehmer (CASCADE); `sh_users.participant_id` SET NULL = wer dahintersteckt (nur Lehrkraft sieht es).
- Wer ruft: `sh_ctx(p_token, p_code)`; im Netzwerk `sh_access(…, p_hub, p_session)` → Konto, Gründer, Admin (Lehrkraft ∨ `role = 'admin'` ∨ Gründer ohne Admin-Konto). Schüler nur im eigenen Netzwerk oder mit einer Sitzung dieses Geräts (`hub_private`). Gesperrtes Netzwerk nur für die Lehrkraft. 0264: Lehrkraft-Netzwerk (`teacher_id`). 0263: `sh_on` mit Abhängigkeiten, `sh_brand(…, p_color, p_scheme)` (alte Fassung entfernt), Räume von vor 0263 bekommen photos einmal nachgetragen (Merker `data.photos_v`).
- RPCs: `sh_home`, `sh_found`, `sh_enter`, `sh_brand`, `sh_logo_get`, `sh_register`, `sh_login`, `sh_logout`, `sh_me_update`, `sh_feed` (foryou: Tags gelikter Fotos ×2 + ln(Likes) − Alter + Zufall je `p_seed`), `sh_profile`, `sh_search`, `sh_comments`, `sh_photo_post`, `sh_photo_delete`, `sh_like`, `sh_follow`, `sh_comment_add/like/delete`, `sh_media_put/get`, `sh_admin_users`, `sh_admin_user` (Oberfläche nutzt sie nicht mehr), `sh_db_snapshot`, `sh_db_apply`, `sh_login_net` (0265); nur Lehrkraft: `sh_hub_lock`, `sh_hub_delete`, `sh_admin_reset` (0265). 0265 ändert `sh_found(p_name, p_logo, p_color, p_scheme)`, `sh_register(…, p_gender, p_bio)`, `sh_me_update(…, p_gender)`. Freigaben in `supabase/tests/0225_rechte_freigaben.json`.
- Grenzen: 60 Netzwerke je Raum, 300 Konten / 1500 Fotos / 5000 Kommentare je Netzwerk, Gründer 50 Konten im eigenen, Lehrkraft 10 Testkonten, 60 Bilder je Gerät, 80 MB je Raum, 500 Änderungen je `sh_db_apply`. Texte gehen durch `contains_blacklisted_text` (auch per SQL).

## Später

- Klassenweites Netzwerk der Lehrkraft (alle Schüler registrieren sich dort).
- Dummy-Daten (Story-Figuren, Bildbibliothek) zum Füllen eines Netzwerks, Schaufenster `preview/socialhub.js`.
- Analytics/Tracking (`views`) und Werbung, freier Raum je Schule (siehe Plan).
- Vor der Freigabe für alle: Abschnitt in `datenschutz.html`/`DATENSCHUTZ.md` (Bild-Upload, Konten mit ausgedachten Daten).
