# /supabase — Datenbank-Definitionen

Alles was mit der Supabase-DB zu tun hat, liegt hier.

## Struktur

```
supabase/
├── SETUP.md              → Klick-Anleitung zum Anlegen des Supabase-Projekts (einmalig)
├── TESTPLAN.md           → End-to-End-Test für Arbeitsschritt 2 (RLS + RPCs)
├── migrations/           → Versionierte SQL-Migrationen (0001, 0002, ...)
│   ├── 0001_init.sql     → Schema (Tabellen + View)
│   ├── 0002_rls.sql      → Row-Level-Security-Policies + GRANTs
│   ├── 0003_blacklist.sql→ blacklist_words-Tabelle + contains_blacklisted_word()
│   └── 0004_rpcs.sql     → unlock_game, update_display_name, submit_game_result
├── seed.sql              → MPS-Schule + Games. Idempotent, kann öfter laufen.
├── blacklist_de.txt      → Referenz-Liste für Blacklist (Sync per Hand in 0003)
└── README.md             → diese Datei
```

## Wie eine Migration ausgeführt wird

Solange wir kein CI-Deployment haben, läuft das manuell:

1. Supabase-Dashboard → **SQL Editor** → **New query**
2. Inhalt der `.sql`-Datei komplett einfügen
3. **Run** klicken
4. Ergebnis prüfen: erwartete Tabellen im **Table Editor** sichtbar?

**Reihenfolge:** Migrationen strikt aufsteigend (`0001` → `0002` → `0003` → `0004`), danach `seed.sql`.

**Wiederholbarkeit:**
- `seed.sql` ist idempotent (`on conflict do update/nothing`) — darf mehrfach laufen.
- `0001_init.sql` darf nur einmal laufen (Tabellen können nicht doppelt angelegt werden).
- `0002_rls.sql` darf nur einmal laufen (Policies erhalten Fehler bei doppeltem Anlegen).
- `0003_blacklist.sql` und `0004_rpcs.sql` sind bewusst idempotent (`create or replace function`, `on conflict do nothing`) — dürfen mehrfach laufen. Nach dem Editieren einfach die ganze Datei nochmal ausführen.

## Wenn was schiefgeht

- Alle Tabellen wieder plattmachen: im SQL-Editor `drop schema public cascade; create schema public;` und dann Migration+Seed neu laufen. **Zerstört alle Daten.**
- Nur eine einzelne Tabelle neu: `drop table <name> cascade;` und den entsprechenden Block aus `0001_init.sql` erneut ausführen.

## Nächste Schritte (Arbeitsschritt 3+)

- Frontend-Session-Layer (`session.js`) mit `getUserSeason()` / `isLoggedIn()`
- `_rel`-Refactor: alle ~25 Fundstellen auf `getUserSeason()` umstellen
- Signup-Seite mit Fake-Mail-Generation
- Vercel Functions für Admin-Aktionen (`api/signup.js`, `api/admin/*`)
- Storage-Bucket-Anbindung für PDFs
