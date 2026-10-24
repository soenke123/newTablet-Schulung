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
- Fotos in der Projektarbeit: Wird noch geklärt (Einwilligungsstufe, Hinweis, Frist).

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

- [ ] Tailwind: Knowledge Stack (`MPSkills/tools/KnowledgeStack/*.html`) und Fokusflow (`GameHub/S1 Fokusflow`) laden noch von `cdn.tailwindcss.com`. Die Datei unter `vendor/` ablegen oder eine feste CSS-Datei daraus bauen.

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
- [ ] Migration 0222 im Supabase-SQL-Editor ausführen.
- [ ] Supabase → Authentication → Sign In / Providers: **„Allow new users to sign up“ aus.** Sonst legt jeder mit dem öffentlichen anon-Key Konten an, an `api/signup.js` vorbei (ohne Blacklist und ohne Rate-Limit). Konten entstehen nur über `/api/signup` (service_role), das läuft weiter.
- [ ] Supabase → Authentication → Rate Limits: Anmeldeversuche begrenzen (Kontonamen sind leicht zu raten, Passwort ab 8 Zeichen).
- [ ] Supabase → Authentication → Sessions: Ablauf des JWT bei 1 Stunde lassen.

### Prio 2 – 2FA für Admins

- [ ] Supabase-MFA (TOTP, Authenticator-App) einschalten.
- [ ] `is_admin()`, `is_any_admin()`, `is_superadmin()` verlangen zusätzlich `auth.jwt()->>'aal' = 'aal2'`. Weil fast alle Policies darüber laufen, wirkt 2FA damit überall in der Datenbank.
- [ ] Dieselbe Prüfung in den `api/admin_*.js`.
- [ ] Admin-Panel: 2FA einrichten (QR für die App) und beim Anmelden den Code abfragen. Ohne 2FA sieht eine Admin nur „2FA einrichten“.
- [ ] Notfall-Weg: Wer das Handy verliert, dem setzt ein Volladmin oder der Betreiber im Supabase-Dashboard den Faktor zurück.

### Prio 3 – Sicherheits-Header (`vercel.json`)

- [ ] Content-Security-Policy: Skripte nur von der eigenen Seite (setzt voraus, dass Tailwind nicht mehr vom CDN kommt, siehe „Technisch noch offen“), `connect-src` nur Supabase.
- [ ] `Referrer-Policy: strict-origin` (Links mit Raum-Codes gehen nicht an fremde Seiten).
- [ ] `frame-ancestors 'self'` (niemand bettet die Seite fremd ein), `Permissions-Policy`, `X-Content-Type-Options: nosniff`.

### Prio 4 – Rechte automatisch prüfen

- [ ] Prüfstand, der meldet: Tabellen oder Spalten, die anon/authenticated direkt lesen dürfen; security-definer-Funktionen, die anon ausführen darf (Abgleich mit einer Erlaubt-Liste); Tabellen ohne RLS.
- [ ] `alter default privileges in schema public revoke execute on functions from public, anon, authenticated;` — neue Funktionen sind dann erst nach `grant` aufrufbar. Heute ohne `revoke`: `ks_ensure_player`, `ks_ensure_board`, `ks_owned_room` (0174/0175), geringes Risiko, weil UUIDs nötig sind.

### Prio 5 – Raum-Codes und QR-Code

- [ ] QR-Code und Link tragen zusätzlich ein langes Geheimnis im `#`-Teil (geht nicht an den Server, nicht in Logs). Damit klappt der Beitritt auch bei geschlossener Tür.
- [ ] Der 6-stellige Code gilt nur, solange die Tür offen ist; die Tür schließt nach z. B. 15 Minuten von selbst, die Lehrkraft öffnet sie mit einem Klick wieder.
- [ ] Globales Limit für Fehlversuche (alle IPs zusammen). Das Limit je IP hilft nicht gegen viele IPv6-Adressen.

### Prio 6 – Löschen

- [ ] Fotos der Projektarbeit: Frist festlegen (z. B. 30 Tage nach Projektende).
- [ ] Supabase-Sicherungen behalten Gelöschtes bis zu ihrem Ablauf (je nach Tarif 7–30 Tage). In `datenschutz.html` nennen.
- [ ] Prüfstand: Backup-Tabellen (Scrum, `pa_backups`) und Mail-Ausgang gehen mit dem Raum.
- [ ] Admin-Panel: wann `skill_cleanup` und der Konto-Ablauf zuletzt liefen.

### Prio 7 – Geteilte Tablets

- [ ] Tokens der Gast-Teilnahmen liegen in `localStorage['mpskills_rooms']` (bis 40 Räume). Knopf „Dieses Gerät abmelden“ oder kürzere Haltezeit.
