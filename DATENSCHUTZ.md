# Datenschutz – Stand und nächste Schritte

Stand: 9. Oktober 2026. Technische Einschätzung, keine Rechtsberatung. Freigeben müssen Schulleitung und Datenschutzbeauftragte/r.

## Schon erledigt (im Code)

- Google Fonts liegen lokal unter `fonts/`, Bibliotheken fest gepinnt unter `vendor/` (kein jsDelivr). Vercel Web Analytics ist entfernt.
- `vercel.json`: Die Functions laufen in Frankfurt (`fra1`), Supabase ebenfalls in Frankfurt.
- Migration 0208 (Löschfristen): IP-Protokolle 1 Tag, `cheat_flags` 180 Tage, Feedback-Tickets 365 Tage.
- Migration 0209 (Konten):
  - nach 1 Jahr ohne Login Inhalte zurücksetzen; Profil, Kurs und Highscores bleiben
  - nach 4 Jahren Konto löschen
  - die Uhr zählt ab dem Einspielen
- `datenschutz.html`: Datenschutzerklärung. Gelb markierte Stellen füllt die Schule aus.

## Bewusst so entschieden

- Anonyme Vokabel-Inseln (Wordisland ohne Konto) laufen nicht ab.
- Kurse werden nicht automatisch gelöscht.
- Nutzungsstatistik MPSkills (Migration 0216, Tabelle skill_usage): je Raum nur Skill, Schule, Testraum ja/nein, angelegt/zuletzt aktiv, Zahl der Beitritte — keine Lehrkraft, kein Raumtitel, keine Namen. Bleibt nach dem Löschen des Raums (60 Tage) stehen, ohne Frist, weil nicht personenbezogen; nur Admins sehen sie im Admin-Panel.
- Master PDF Skill sichert nicht exportierte Arbeit automatisch, aber nur im Browser auf dem Gerät (IndexedDB, nichts auf dem Server). Standard ist „aus“; wer es unter Datei einschaltet, dessen Gerät merkt sich das (in datenschutz.html Abschnitt 9). Auf geteilten Schul-Tablets aus lassen.
- SQL Studio (Migrationen 0220/0221): SQL läuft nur im Browser (sql.js). Auf dem Server: eigene Datenbanken der Lehrkraft (sql_databases, bleiben im Konto bis sie sie löscht, gehen mit dem Konto) und die Kopien der Schüler je Raum (sql_work, ON DELETE CASCADE an Raum und Teilnehmer → gehen mit dem Raum nach 30 Tagen). Vorlagen-Kopien der Lehrkraft nur im Gerät (IndexedDB). In datenschutz.html bei „Wenn du in MPSkills mitmachst" und in Abschnitt 9.
- Fotos in der Projektarbeit: Frist **30 Tage nach Projektende** (Entscheidung 24.10.2026, Migration 0227). Projektende = Fertig-Datum im Projektziel, sonst letzte Nutzung des Raums. Einwilligungsstufe und Hinweis klärt die Schule noch.

## Schritt 1 – Technik einstellen (Betreiber, ca. 1 Stunde)

- [ ] Im Supabase-SQL-Editor `0208_datenschutz_loeschfristen.sql` und danach `0209_konto_lebenszyklus.sql` ausführen.
- [ ] Vercel → Settings → Functions: Die Region muss „Frankfurt (fra1)“ sein. Im Tab Analytics die Analyse ausschalten.
- [ ] Supabase → Auth-Einstellungen: Audit-Log nicht mehr in die Datenbank schreiben (speichert sonst die IP bei jedem Login).
- [ ] Zwei-Faktor-Anmeldung für die Konten bei Supabase, Vercel und GitHub.
- [ ] `service_role`-Key erneuern, falls er je in Chat, Mail oder Notizen stand; danach den neuen Key in Vercel eintragen.

## Schritt 2 – Gespräch mit Schulleitung und Datenschutzbeauftragter/m

- [ ] Verantwortung klären: Die Konten bei Supabase und Vercel laufen auf die Schule, oder die Schulleitung beauftragt den Betreiber schriftlich mit dem Betrieb.
- [ ] AV-Verträge abschließen: DPA mit Supabase, DPA mit Vercel; mit der Schul-IT klären, ob der Vertrag mit IServ auch den Mailversand abdeckt.
- [ ] Rechtsgrundlage festlegen:
  - Vorschlag: Unterricht (Tablet-Schulung, MPSkills, Projektarbeit) über das Schulgesetz.
  - Freiwilliges (Lernwelt mit Highscores, Fotos) über eine Einwilligung.
- [ ] Fotos in der Projektarbeit entscheiden.

## Schritt 3 – Dokumente der Schule

- [ ] Gelbe Stellen in `datenschutz.html` ausfüllen: Adresse, Schulleitung, Datenschutzbeauftragte/r, Rechtsgrundlage, AV-Verträge.
- [ ] Eintrag im Verarbeitungsverzeichnis (Art. 30 DSGVO).
- [ ] Beschreibung der technischen und organisatorischen Maßnahmen (TOM).
- [ ] Prüfen, ob eine Datenschutz-Folgenabschätzung (Art. 35) nötig ist. Das hängt vor allem an den Fotos.
- [ ] Plan für Datenpannen (Meldung an das ULD innerhalb von 72 Stunden): Wer entscheidet, wer meldet, wie werden Zugänge gesperrt.
- [ ] Einwilligungsformular für die Eltern, falls Schritt 2 eines verlangt.

Claude kann für Verarbeitungsverzeichnis, TOM, Pannenplan und Einwilligungsformular Entwürfe schreiben.

## Schritt 4 – Im Unterricht ansagen

- [ ] Im Knowledge Stack einen Spitznamen nehmen, nicht den echten Namen.
- [ ] Im Freitext keine Daten über andere schreiben (Namen, Adressen, Telefonnummern).
- [ ] Konten werden nach 1 Jahr zurückgesetzt und nach 4 Jahren gelöscht.

## Technisch noch offen

- [ ] Quellen-Tinder (`GameHub/S2 Quellen Tinder/index.html`) lädt 34 Fotos von `images.unsplash.com` (in der CSP unter `img-src` erlaubt). Bilder herunterladen, unter `GameHub/S2 Quellen Tinder/img/` ablegen, Adressen umstellen, danach `https://images.unsplash.com` aus der CSP in `vercel.json` streichen.
- [ ] Tailwind: Knowledge Stack (`MPSkills/tools/KnowledgeStack/*.html`) und Fokusflow (`GameHub/S1 Fokusflow`) laden noch von `cdn.tailwindcss.com`. Die Datei unter `vendor/` ablegen oder eine feste CSS-Datei daraus bauen; danach `https://cdn.tailwindcss.com` aus der CSP in `vercel.json` streichen.

## Sicherheit

Stand: 24. Oktober 2026. Ziel: Ein einzelner Fehler soll nie die ganze Datenbank freilegen.

### So ist es gebaut

- RLS auf allen Tabellen. Das Frontend nutzt nur RPCs (security definer), keine Tabellen direkt.
- Raum-Codes (6 Zeichen) prüft nur `api/skill_join.js`, mit Rate-Limit je IP. `skill_room_peek`/`skill_room_join` darf nur service_role ausführen.
- Teilnehmer-Token: 48 Hex-Zeichen (192 Bit). Persönlicher Code: 8 Zeichen.
- `service_role`-Key nur in Vercel. Admin-Functions prüfen das JWT und das Profil.

### Die vier Wege zum großen Leak

1. **`service_role`-Key** wird bekannt → alles offen. Schutz: nur in Vercel, Push Protection auf GitHub, neu erzeugen bei Verdacht.
2. **Admin-Konto** wird übernommen → alle Schulen und Schüler. Schutz: 2FA (unten).
3. **XSS** (Name oder Quiztext wird als HTML ausgeführt) → Sitzung wird geklaut, schlimmstenfalls die einer Admin. Schutz: CSP-Header, Texte immer escapen.
4. **Zu offene Migration** (Grant oder Funktion) → je nach Tabelle. Schutz: Prüfstand für Rechte.

### Entschieden

- Der 6-stellige Raum-Code bleibt.
- 2FA nur für Admins. Lehrkräfte bekommen keine 2FA.

### Prio 1 – Lücken schließen

- [x] `games.password_hash` war für anon lesbar (0002 gab das Tabellenrecht, die Policy filtert nur Zeilen). Migration 0222: Spaltenrechte ohne den Hash, Prüfstand `supabase/tests/0222_games_hash_verbergen.mjs`.
- [x] Migration 0224: Spalte `password_hash` und `unlock_game` ganz entfernt (Spiel-Passwörter gibt es seit 0070 nicht mehr; `unlock_game` hätte mit einem Hash ein Spiel an der Kurs-Freischaltung vorbei geöffnet). `seed.sql` ohne Hashes. Prüfstand `0224_spielpasswort_entfernen.mjs`.
- [ ] Migrationen 0222 und 0224 im Supabase-SQL-Editor ausführen.
- [ ] Supabase → Authentication → Sign In / Providers: **„Allow new users to sign up“ aus.** Sonst legt jeder mit dem öffentlichen anon-Key Konten an, an `api/signup.js` vorbei (ohne Blacklist und ohne Rate-Limit). Konten entstehen nur über `/api/signup` (service_role), das läuft weiter.
- [ ] Supabase → Authentication → Rate Limits: Anmeldeversuche begrenzen (Kontonamen sind leicht zu raten, Passwort ab 8 Zeichen).
- [ ] Supabase → Authentication → Sessions: Ablauf des JWT bei 1 Stunde lassen.

### Prio 2 – 2FA für Admins

- [x] Migration 0223: `is_admin()`, `is_superadmin()`, `is_any_admin()` verlangen zusätzlich `admin_mfa_ok()` (`auth.jwt()->>'aal' = 'aal2'`). Mitgezogen: `apply_cluster_bonus`, `board_target_cluster`, Policies auf `cluster_bonus`/`cluster_bonus_grants`. Lehrkraft-Rechte (`can_teach` …) bleiben ohne 2FA. Prüfstand `supabase/tests/0223_admin_2fa.mjs` mit Wächter: eine neue Funktion oder Policy, die das Admin-Flag selbst liest, fällt auf.
- [x] `api/admin_*.js` prüfen dasselbe (`requireAal2` in `api/_utils.js`, sonst 403 `mfa_required`).
- [x] Admin-Panel (`admin/mfa.js`): ohne Faktor „2FA einrichten“ (QR-Code + Schlüssel), mit Faktor Code-Abfrage; erst danach lädt das Panel. Die bestätigte Sitzung gilt auf der ganzen Seite, also auch für SQL Studio in MPSkills.
- [ ] Supabase → Authentication → Multi-Factor: TOTP muss an sein (Standard).
- [ ] Migration 0223 ausführen und **sofort danach** alle Admins einrichten lassen. Bis zur Einrichtung kann ein Faktor mit dem Passwort allein angelegt werden.
- [ ] Notfall (Handy weg): Supabase-Dashboard → Authentication → Users → Konto → MFA-Faktor löschen, dann neu einrichten.
- Gut zu wissen: Eine Admin, die sich in MPSkills oder auf der Landing anmeldet, hat dort nur Lehrkraft-Rechte, bis sie einmal im Admin-Panel den Code eingegeben hat (dann gilt es für die ganze Sitzung).

### Prio 3 – Sicherheits-Header (`vercel.json`)

- [x] Content-Security-Policy für alle Seiten: Skripte nur von der eigenen Seite (+ `cdn.tailwindcss.com`, solange Tailwind dort liegt), `connect-src` nur eigene Seite + Supabase (https/wss), Bilder/Fonts/Worker/Frames nur eigene Seite, `data:` und `blob:`; `object-src 'none'`, `base-uri`/`form-action 'self'`, `frame-ancestors 'self'`. Ein eingeschleustes Skript kann damit nichts mehr an fremde Server schicken (fetch, Bild-URL, Formular).
- [x] `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` (Kamera, Mikrofon, Standort aus), HSTS.
- [x] Geprüft: alle 66 HTML-Seiten mit diesen Headern geladen (Playwright), ohne Verstoß. Seiten, die erst nach dem Spielstart etwas laden, sind damit nicht abgedeckt; die externen Adressen im Code sind aber alle gesucht und behandelt.
- [x] Mitgefunden und behoben: Siegel I im GameHub schickte die IP an `api.ipify.org` (USA) → eigene Function `api/my_ip.js`. Bubble Bounce lud Icons von `api.iconify.design` → lokal unter `assets/icons/` (MDI, Apache 2.0).
- Noch drin: `'unsafe-inline'` bei Skripten, weil viele Seiten `onclick="…"` und Inline-`<script>` nutzen. Ohne den Zusatz müsste jede Seite umgebaut werden. Gegen eingeschleuste Skripte hilft deshalb vor allem, dass sie nichts mehr nach außen schicken können.
- Falls die Seite je in IServ oder einer anderen Seite als iframe eingebettet werden soll: `frame-ancestors`/`X-Frame-Options` verbieten das; dann die Adresse dort eintragen.

### Prio 4 – Rechte automatisch prüfen

- [x] Migration 0225: neue Funktionen sind standardmäßig für niemanden ausführbar (Standardrechte global für PUBLIC und in `public` für anon/authenticated). Jede neue RPC braucht ein ausdrückliches `grant execute`.
- [x] Interne Helfer zu: `ks_ensure_board`, `ks_ensure_player`, `ks_owned_room`, `clash_fire_teams`. Alle Aufrufer sind security definer; geprüft als anon mit echtem Raum-Token (ks_view/ks_sig/clash_view/clash_sig laufen weiter).
- [x] Wächter `supabase/tests/0225_rechte_waechter.mjs` + Liste `0225_rechte_freigaben.json`: was anon und authenticated heute erreichen (69 bzw. 268 security-definer-Funktionen, 5 bzw. 39 Tabellen/Views, 10 Spalten von `games`). Neue Freigabe → rot, bis sie bewusst in der Liste steht. Außerdem: jede Tabelle mit RLS, jede security-definer-Funktion mit `search_path`, Views für Nutzer mit `security_invoker`. Gegenprobe mit absichtlich offener Tabelle/Funktion: alle vier Prüfungen schlagen an.
- [ ] Migration 0225 im Supabase-SQL-Editor ausführen.
- Gut zu wissen: `ks_catalogs`/`ks_questions` haben Rechte für anon, aber keine Policy → RLS gibt keine Zeile heraus. Kann so bleiben (Zugriff läuft über RPCs).

### Prio 5 – Raum-Codes und QR-Code

Entschieden: Der Code gilt 90 Minuten, der QR-Code, solange die Tür offen ist.

- [x] Migration 0226: Jeder Raum hat ein Geheimnis (`join_secret`, 32 Hex-Zeichen, 122 Zufallsbits). QR-Code und kopierter Link sind `j.html#CODE-GEHEIMNIS` und gelten, solange die Tür offen ist (`join_open`).
- [x] Der Code allein gilt 90 Minuten ab Anlegen bzw. ab „Tür öffnen“ (`code_open_until`), danach `code_expired`. Wer schon drin ist (Token, angemeldet, persönlicher Code), ist nie betroffen. Bestehende Räume: Code gilt ab dem Einspielen noch 90 Minuten, jeder Raum bekommt ein eigenes Geheimnis.
- [x] Lehrkraft-Seite: unter dem Code „Code gilt noch … Min.“ bzw. „Code abgelaufen“ mit Knopf „Code wieder öffnen“ (auch in der Tür am Rand). Angezeigte Adresse = kurz (zum Abtippen), QR und Kopieren-Knopf mit Geheimnis. Das Geheimnis sehen nur Lehrkräfte des Raums (`skill_room_get`), nie Schüler.
- [x] Beitrittsseite: Geheimnis aus der Adresse in den sessionStorage, Adresse danach nur noch `#CODE` (nicht im Verlauf). Eigene Meldungen für „Code abgelaufen“ und „zu viele Versuche“.
- [x] `api/skill_join.js`: Fehlversuche aller IPs zusammen; ab 1000 in 10 Minuten ist der Weg „nur Code“ zu (`busy`), mit QR-Geheimnis geht es weiter.
- [x] Prüfstand `supabase/tests/0226_raum_tuer_code_qr.mjs` (24 Prüfungen), alle 30 Prüfstände der Kette grün; im Browser geprüft (QR-Adresse, abgelaufener Code, „Code wieder öffnen“), QR-Code mit langer Adresse per jsQR gelesen.
- [ ] Migration 0226 im Supabase-SQL-Editor ausführen. Die Reihenfolge zu Vercel ist egal: Ohne Migration ruft `api/skill_join.js` die alte Funktion ohne Geheimnis (PGRST202 → zweiter Aufruf), und die Lehrkraft-Seite zeigt keinen Code-Ablauf an. Erst mit der Migration gilt die 90-Minuten-Regel.
- Bleibt: Ein Foto vom QR-Code gilt, solange die Tür offen ist. Dagegen hilft „Beitritt schließen“, wenn alle drin sind.

### Prio 6 – Löschen

- [x] Fotos der Projektarbeit-Dokumentation 30 Tage nach Projektende (Migration 0227, `pa_photo_cleanup` im täglichen Lauf). Der Eintrag bleibt und zeigt „Fotos nach 30 Tagen gelöscht“; Hinweis beim Hochladen und in den Erklärkacheln der Lehrkraft. Bilder im Projektziel (`goal.images`) sind nicht betroffen. Falls dort auch Fotos von Personen landen, braucht es dafür eine eigene Regel.
- [x] `datenschutz.html`: Fotos-Frist in Abschnitt 7 und in der Fristen-Tabelle; Absatz „Sicherungen“: Gelöschtes steckt noch in den Sicherungskopien des Anbieters, bis sie überschrieben werden. **Gelb:** die Zahl der Tage. Sie hängt am Supabase-Tarif (Pro: 7 Tage, mit Point-in-Time-Recovery je nach Einstellung). Im Dashboard unter Database → Backups nachsehen und eintragen.
- [x] Wächter „geht mit dem Raum“ (im Prüfstand 0227): alle 53 Fremdschlüssel auf `skill_rooms`/`skill_participants` sind CASCADE oder SET NULL. Ohne Fremdschlüssel nur `skill_usage.room_id` (anonym, gewollt) und `notify_mail_log.user_id` (2 Tage). Gegenprobe: ein abgelaufener Projektarbeit-Raum mit Backup und Mail-Ausgang hinterlässt nach `skill_cleanup` in keiner der 36 Tabellen mit `room_id` eine Zeile.
- [x] Admin-Panel, Dashboard, Kasten „Löschläufe“: jeder Lauf von `skill_cleanup` steht in `cleanup_runs` (nur Zahlen, 90 Tage), dazu die pg_cron-Aufträge mit letztem Ergebnis. Warnung, wenn 36 Stunden kein täglicher Lauf kam.
- [ ] Migration 0227 im Supabase-SQL-Editor ausführen.
- [ ] Nach dem nächsten nächtlichen Lauf (03:30 UTC) im Admin-Panel nachsehen, ob „Täglicher Lauf“ grün ist. Wenn nicht: pg_cron aktivieren und Migration 0081 erneut ausführen (legt den Auftrag an).

### Prio 7 – Geteilte Tablets

- [x] Beim Beitritt ohne Anmeldung fragt die Tür „Wessen Gerät ist das?“, und das Gerät merkt sich die Wahl (`localStorage['mpskills.device']`). Beim ersten Mal ist „Schulgerät“ vorausgewählt; auf den Klassensatz-Tablets bleibt das so, auf dem eigenen Handy wählt man einmal „Eigenes Gerät“.
  - **Eigenes Gerät:** Raum-Token in `localStorage`, wie bisher.
  - **Schulgerät:** Raum-Token nur in `sessionStorage` dieses Tabs, weg beim Schließen, spätestens nach 3 Stunden ohne Besuch. Der Wechsel auf „Schulgerät“ vergisst die Räume, die sich das Gerät ohne Anmeldung dauerhaft gemerkt hatte, und sagt vorher, wie viele es sind.
  - Angemeldete betrifft das nicht (keine Auswahl, ihr Konto findet die Räume).
  - In `datenschutz.html` Abschnitt 9 erklärt. Im Browser geprüft: Speicherort je Wahl, zweiter Tab, Wechsel, Ablauf nach 3 Stunden, angemeldet.
- Bleibt: Die eigene Vokabel-Insel ohne Konto (Wordisland, `mpskills_solo`) liegt weiter dauerhaft im Gerät; sie läuft bewusst nicht ab.
- Bleibt: Wer auf einem Schulgerät angemeldet bleibt, ist für die nächste Person angemeldet. Am Stundenende abmelden.

### Fund 24.10.2026 – XSS in der Scrum Werkstatt (behoben)

- [x] Product Goal wurde roh per `innerHTML` gezeigt, Avatar und Bilder unmaskiert in `src="…"`; der Server prüfte den Avatar nur am Anfang. Wer seinen Teilnehmer-Token hat, konnte über `scrum_save` Skript bei Team und Lehrkraft ausführen (gleiche Domain → Sitzung der Lehrkraft).
- [x] Oberfläche: `cleanHtml` (wie Projektarbeit) für das Goal, `safeImg` (vollständige data-URL) für Avatar und Bilder.
- [x] Migration 0228: `scrum_product_ok` in `scrum_apply_ops` und `scrum_room_restore`, Avatar mit Ende-Anker, Bestand bereinigt. Prüfstand `supabase/tests/0228_scrum_xss.mjs`; im Browser mit eingespielten Angriffsdaten geprüft (kein Skript lief).
- [ ] Migration 0228 im Supabase-SQL-Editor ausführen.

