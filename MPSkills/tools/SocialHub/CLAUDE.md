# Social Hub — soziales Netzwerk + Datenbank (MPSkill, Migrationen 0262 + 0263)

Wie InstaHub, nur moderner im Stil von TikTok (Fotos statt Videos, Vollbild-Karten, endloses Scrollen). **Nur für Admins sichtbar** (`skill_tools.admin_only`, Schild über `tools.js` `adminOnly`), Beta. Plan und Hintergrund: `MPSkills/PLAN_FEED_SKILL.md`.

## Grundentscheidungen (mit Sönke abgestimmt, 03.11.2026)

- **Jede Person gründet ihren eigenen Hub** (Name + Logo: eins der 8 aus Startup Story oder ein eigenes Bild) und ist dort Admin. Im Admin-Reiter „Hub“ wählt sie außerdem das **Farbschema** (Dunkel/Hell, `sh_hubs.scheme`) und die **Akzentfarbe** (11 Farben, eigene per Farbwähler oder „Logo“ = aus dem Logo, `sh_hubs.color` null) – Vorschau sofort, gespeichert mit „Speichern“ (Migration 0263). Feed-Karten bleiben im hellen Schema dunkel. Die anderen registrieren sich auf fremden Hubs (Konto je Hub). Die **Lehrkraft** ist auf jedem Hub Admin und hat die Übersicht aller Hubs (öffnen, sperren, löschen, sieht, wer hinter einem Konto steckt).
- **Tabellen englisch** wie bei InstaHub: `users, photos, follows, likes, comments, comment_likes, tags, photo_tag`. Nur `users` gibt es immer, alle anderen – auch `photos` (seit 0263) – **erstellt die Lehrkraft** per Knopf für alle Hubs im Raum (`skill_room_state.data.tables`, `tags` bringt `photo_tag` mit). Abhängigkeiten (`sh_on` und `NEEDS` in app.js): likes, comments, tags brauchen photos, comment_likes braucht comments; Entfernen nimmt Abhängige mit (mit Rückfrage), blendet aber nur aus – die Daten bleiben. Ohne photos: Registrieren, Profil, Folgen, Suche gehen, kein Feed/Posten. Kein `CREATE TABLE` durch Schüler.
- **Nur Herz** (keine Reaktionen); Kommentare haben eigene Herzen (`comment_likes`).
- **Passwörter als bcrypt-Hash sichtbar** (`$2a$08$…`, pgcrypto). Ein per SQL im Klartext eingefügtes Passwort funktioniert nicht – gewollt.
- **Alle Admins dürfen im Datenbank-Reiter schreiben**: SELECT läuft in einer SQLite-Kopie im Browser, INSERT/UPDATE/DELETE gehen als Zeilen-Unterschied an `sh_db_apply` und gelten für alle (oder alles wird abgelehnt). CREATE/ALTER/DROP gesperrt (Recht `use` des SQL-Studio-Kerns).
- **Konto per INSERT**: `INSERT INTO users (username, name, password) VALUES ('x', 'X', PASSWORD_HASH('geheim'));` – `PASSWORD_HASH` (auch `BCRYPT`, `PASSWORD_VERIFY(pw, hash)`) ist bcrypt im Worker (`vendor/bcryptjs-2.4.3.min.js`), passt zu pgcrypto.
- **Eigene Bilder** (Schalter der Lehrkraft `data.upload`, Standard an): im Gerät ≤1080 px, WebP/JPEG ≤250 KB, Vorschau 320 px ≤40 KB, Metadaten fallen weg (`js/media.js`). Gespeichert in `sh_media` (bytea), in den Tabellen steht nur `img_<n>.webp`.
- **Anmelden geräteübergreifend** mit Benutzername + Passwort, keine persönlichen Codes. Sitzung je Hub und Gerät (`sh_sessions`); im Gerät auf Schulgeräten nur sessionStorage (`mpskills.device`). Der Gründer ist auf seinem Gerät ohne Passwort drin.

## Dateien

| Datei | Rolle |
|---|---|
| `tool.js` / `tool.css` | Brücke wie SQL Studio: Rahmen `index.html?raum=CODE&rolle=presenter|participant`; `sh:call` (nur `sh_*`) → `ctx.actions.call`, `sh:setData` (nur Lehrkraft) → `skill_room_set_state`, `sh:state` = `skill_room_state.data` |
| `index.html` | App; lädt `../SQLStudio/js/core.js`, `editor.js`, `diagram.js` mit (geteilt, nicht kopiert) |
| `js/api.js` | Brücke zum Rahmen, Sitzung je Hub im Gerät, deutsche Fehlertexte (`ERR`) |
| `js/media.js` | Bilder verkleinern (`compress`, `compressLogo`), Hauptfarbe eigener Logos, gebündeltes Holen über `sh_media_get` als blob:-Adressen |
| `js/app.js` | Start (Schüler: gründen/öffnen, Hubs der Klasse; Lehrkraft: Tabellen, Upload, Übersicht) · Login/Registrieren · Hub: Feed (Für dich / Folge ich, scroll-snap, endlos: nach dem Ende geht es mit neuem Zufall von vorn), Doppeltipp = Herz, Kommentare als Blatt, Profil, Suche (Nutzer, #Tags), Posten, Admin (Hub · Nutzer · Datenbank) |
| `js/db.js` | Datenbank-Reiter: Schnappschuss → SQLite (DDL in MySQL-Schreibweise, Kern übersetzt), SQL/Daten/Diagramm, Diff → `sh_db_apply`, bei Ablehnung neu laden |
| `js/dbworker.js` | sql.js + SQL-Studio-Kern + bcrypt im Worker, 8-s-Abbruch in db.js |
| `css/app.css` | eigene dunkle Optik, Akzent `--hub` aus dem Logo; Editor-/Diagramm-Klassen von SQL Studio nachgezogen |
| `img/logos/*.png` | die 8 „nice“-Logos aus Startup Story (`bell connect rocket graph trend chat like mesh`) |
| `tests/e2e.mjs` + `tests/harness.html` | Prüfstand im Browser (Playwright + pglite, ganze Migrationskette): `node MPSkills/tools/SocialHub/tests/e2e.mjs`, Bildschirmfotos nach `SH_SHOTS` (Standard `tests/shots/`, nicht im Repo) |

## Server (Migration 0262, Prüfstand `supabase/tests/0262_socialhub.mjs`)

- Intern `sh_*` mit `hub_id`, ids je Hub ab 1 (`sh_next`, Advisory-Lock). Alles geht mit Raum/Teilnehmer (CASCADE); `sh_users.participant_id` SET NULL = wer dahintersteckt (nur Lehrkraft sieht es).
- Wer ruft: `sh_ctx(p_token, p_code)`; im Hub `sh_access(…, p_hub, p_session)` → Konto, Gründer, Admin (Lehrkraft ∨ Gründer ∨ `role = 'admin'`). Gesperrter Hub nur für die Lehrkraft. 0263: `sh_on` mit Abhängigkeiten, `sh_brand(…, p_color, p_scheme)` (alte Fassung entfernt), Räume von vor 0263 bekommen photos einmal nachgetragen (Merker `data.photos_v`).
- RPCs: `sh_home`, `sh_found`, `sh_enter`, `sh_brand`, `sh_logo_get`, `sh_register`, `sh_login`, `sh_logout`, `sh_me_update`, `sh_feed` (foryou: Tags gelikter Fotos ×2 + ln(Likes) − Alter + Zufall je `p_seed`), `sh_profile`, `sh_search`, `sh_comments`, `sh_photo_post`, `sh_photo_delete`, `sh_like`, `sh_follow`, `sh_comment_add/like/delete`, `sh_media_put/get`, `sh_admin_users`, `sh_admin_user`, `sh_db_snapshot`, `sh_db_apply`; nur Lehrkraft: `sh_hub_lock`, `sh_hub_delete`. Freigaben in `supabase/tests/0225_rechte_freigaben.json`.
- Grenzen: 60 Hubs je Raum, 300 Konten / 1500 Fotos / 5000 Kommentare je Hub, 3 Konten je Gerät und Hub, 60 Bilder je Gerät, 80 MB je Raum, 500 Änderungen je `sh_db_apply`. Texte gehen durch `contains_blacklisted_text` (auch per SQL).

## Später

- Dummy-Daten (Story-Figuren, Bildbibliothek) zum Füllen eines Hubs, Schaufenster `preview/socialhub.js`.
- Analytics/Tracking (`views`) und Werbung, freier Raum je Schule (siehe Plan).
- Vor der Freigabe für alle: Abschnitt in `datenschutz.html`/`DATENSCHUTZ.md` (Bild-Upload, Konten mit ausgedachten Daten).
