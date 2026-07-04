# /supabase — Datenbank-Definitionen

Alles was mit der Supabase-DB zu tun hat, liegt hier.

## Struktur

```
supabase/
├── SETUP.md            → Klick-Anleitung zum Anlegen des Supabase-Projekts (einmalig)
├── migrations/         → Versionierte SQL-Migrationen (0001, 0002, ...)
│   └── 0001_init.sql   → Schema (Tabellen + View), noch OHNE RLS/RPCs
├── seed.sql            → MPS-Schule + Games. Idempotent, kann öfter laufen.
├── blacklist_de.txt    → Schimpfwort-Liste für display_name (editierbar)
└── README.md           → diese Datei
```

## Wie eine Migration ausgeführt wird

Solange wir kein CI-Deployment haben, läuft das manuell:

1. Supabase-Dashboard → **SQL Editor** → **New query**
2. Inhalt der `.sql`-Datei komplett einfügen
3. **Run** klicken
4. Ergebnis prüfen: erwartete Tabellen im **Table Editor** sichtbar?

**Reihenfolge:** immer `0001` vor `0002` vor `seed.sql`.

**Wiederholbarkeit:** `seed.sql` ist bewusst idempotent (`on conflict do update/nothing`). Die Migrationen sind es **nicht** — die dürfen nur einmal laufen.

## Wenn was schiefgeht

- Alle Tabellen wieder plattmachen: im SQL-Editor `drop schema public cascade; create schema public;` und dann Migration+Seed neu laufen. **Zerstört alle Daten.**
- Nur eine einzelne Tabelle neu: `drop table <name> cascade;` und den entsprechenden Block aus `0001_init.sql` erneut ausführen.

## Nächste Schritte (nicht in diesem Arbeitsschritt)

- `0002_rls.sql` — Row-Level-Security-Policies auf allen Tabellen
- `0003_rpcs.sql` — `unlock_game`, `update_display_name`, `submit_game_result`
- `0004_blacklist_function.sql` — Postgres-Function, die `blacklist_de.txt` einliest
