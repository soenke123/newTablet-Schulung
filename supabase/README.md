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
│   └── 0004_rpcs.sql     → update_display_name, submit_game_result (unlock_game entfällt mit 0224)
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

## Neue Tabellen: Grants nicht vergessen

Seit dem 30.10.2026 gibt Supabase neuen Tabellen in `public` **keine** Data-API-Rechte mehr automatisch (gilt auch beim Neuaufbau aus den Migrationen: neues Projekt, Preview-Branch, `db reset`).

- Nutzer greifen nur über RPCs mit `security definer` zu → **keine** Grants an `anon`/`authenticated` nötig (und auch nicht geben).
- Liest oder schreibt eine Function in `api/` die Tabelle direkt (`.from(...)` mit service_role-Key), gehört in **dieselbe Migration**:
  ```sql
  grant select, insert, update, delete on <tabelle> to service_role;
  -- bei identity/serial zusätzlich:
  grant usage, select on sequence <tabelle>_id_seq to service_role;
  ```
- Die Tabellen, die `api/` heute direkt nutzt, sind in `0215_api_grants.sql` festgeschrieben. Neue direkte Zugriffe dort mit eintragen.

## Wenn was schiefgeht

- Alle Tabellen wieder plattmachen: im SQL-Editor `drop schema public cascade; create schema public;` und dann Migration+Seed neu laufen. **Zerstört alle Daten.**
- Nur eine einzelne Tabelle neu: `drop table <name> cascade;` und den entsprechenden Block aus `0001_init.sql` erneut ausführen.

## Nächste Schritte (Arbeitsschritt 3+)

- Frontend-Session-Layer (`session.js`) mit `getUserSeason()` / `isLoggedIn()`
- `_rel`-Refactor: alle ~25 Fundstellen auf `getUserSeason()` umstellen
- Signup-Seite mit Fake-Mail-Generation
- Vercel Functions für Admin-Aktionen (`api/signup.js`, `api/admin/*`)
- Storage-Bucket-Anbindung für PDFs
