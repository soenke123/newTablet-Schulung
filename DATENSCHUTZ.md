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
