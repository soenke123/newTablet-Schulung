# /api — Vercel Serverless Functions

Dieser Ordner ist noch **leer** — Vercel Functions kommen erst in Arbeitsschritt 3+.

## Was hier reinkommt

Alle Aktionen, die den `service_role`-Key brauchen (Admin-Aktionen, Signup mit Cluster-Erkennung, Rate-Limiting davor). Schüler-Reads/-Writes für Progress laufen direkt gegen Supabase mit `anon key` + RLS.

## Geplant

- `signup.js`        — validiert Accountname, generiert Fake-Mail, prüft aktives Cluster, erzeugt Profile
- `migrate.js`       — nimmt localStorage-Payload aus alter Version entgegen, gibt Migration-Token zurück
- `admin/…`          — Cluster-CRUD, Pending-Freischaltung, User-Verschieben
- Rate-Limit-Middleware davor (Upstash oder simple In-Memory pro Function)

## Konvention

Jede Function ist eine eigene Datei, exportiert `default async function handler(req, res)`. Vercel routed automatisch: `api/signup.js` → `POST /api/signup`.
