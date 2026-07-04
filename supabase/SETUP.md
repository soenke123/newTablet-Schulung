# Supabase-Setup — Klick-Anleitung

Diese Anleitung führt Dich einmal komplett durch die Einrichtung des Supabase-Projekts. Rechne mit **20–30 Minuten**.

## Was Du am Ende hast

- Ein Supabase-Projekt in EU (Frankfurt) auf dem Free-Plan
- Passwort-Policy: min. 8 Zeichen, min. 1 Buchstabe, min. 1 Zahl
- Session-Timeout: 7 Tage
- Anon-Key und URL notiert für den nächsten Schritt
- Schema und Seed werden **noch nicht** angewendet — das ist Arbeitsschritt 2

---

## Schritt 1 — Supabase-Account + Projekt anlegen

1. Öffne https://supabase.com und klicke oben rechts auf **Start your project**.
2. Login mit **GitHub** (empfohlen — nutzt denselben Account wie das Repo).
3. Klicke im Dashboard auf **New project**.
4. Fülle aus:
   - **Name:** `mps-schulung-staging`
   - **Database Password:** ein starkes Passwort erzeugen (Klick auf **Generate**) und **sofort in Deinem Passwort-Manager speichern** — Supabase zeigt es nur einmal
   - **Region:** `Central EU (Frankfurt)` — wichtig für DSGVO
   - **Pricing Plan:** `Free`
5. Klicke **Create new project**. Provisionierung dauert ~2 Minuten.

> **Merken:** Das ist unser **Staging-Projekt**. Ein separates Prod-Projekt legen wir erst kurz vor Go-Live an, damit wir jetzt frei experimentieren können.

---

## Schritt 2 — API-Keys notieren

1. Im linken Menü: **Project Settings** (Zahnrad-Icon ganz unten) → **API**.
2. Kopiere in eine Notiz für später:
   - **Project URL** (Format: `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** Key (langer JWT, beginnt mit `eyJ...`)
   - **service_role** Key (auch `eyJ...`) — **NIEMALS ins Frontend, nur später in Vercel als Env-Var**

> Der `anon public`-Key darf im Frontend stehen, er ist öffentlich. Die eigentliche Sicherheit kommt später über RLS-Policies.

---

## Schritt 3 — Auth-Einstellungen setzen

Im linken Menü: **Authentication** → **Providers** → **Email**.

- **Confirm email:** **AUS** (Schüler haben keine echte E-Mail zum Bestätigen)
- **Secure email change:** an lassen (Default)
- **Save** klicken

Dann **Authentication → Sign In / Providers → Email → Password requirements**:

- **Minimum password length:** `8`
- **Password requirements:** aktiviere `Lowercase, uppercase letters and digits` — falls Supabase nur „Letters and digits" anbietet, dann das (Ziel: min. 1 Buchstabe + 1 Zahl)

Dann **Authentication → Sessions**:

- **JWT expiry limit:** `3600` (1 Stunde — Access-Token)
- **Refresh token rotation:** an lassen (Default)
- **Refresh token reuse interval:** `10` Sekunden (Default)
- **Inactivity timeout:** leer lassen
- **Maximum lifetime:** `604800` (7 Tage = 7×24×3600) — das ist Deine 7-Tage-Session

**Save** klicken.

---

## Schritt 4 — E-Mail-Domain-Whitelist deaktivieren (falls aktiv)

Da wir Fake-Mails auf `.fake` nutzen, muss Supabase die akzeptieren.

- **Authentication → URL Configuration → Site URL:** trägst Du erst später ein (wenn wir das Frontend anbinden)
- **Authentication → Providers → Email → Allowed email domains:** leer lassen (= alle Domains erlaubt)

---

## Schritt 5 — Storage-Bucket vorbereiten (für PDFs)

Für die Season-2-Präsentationen und Handout v2.

1. Linkes Menü: **Storage** → **New bucket**
2. Name: `content`
3. **Public bucket:** AUS (wir liefern per Signed URL)
4. **Create bucket**

Ordner-Struktur kommt in einem späteren Arbeitsschritt (Phase 5).

---

## Schritt 6 — SQL-Editor testen

1. Linkes Menü: **SQL Editor** → **New query**
2. Einfügen und **Run**:
   ```sql
   select now(), current_setting('server_version');
   ```
3. Es sollte ein Zeitstempel und `17.x on ...` zurückkommen. Fertig — der Editor läuft.

---

## Schritt 7 — Werte für den nächsten Schritt zusammentragen

Bitte gib mir im nächsten Chat diese drei Werte (Anon-Key darf öffentlich, service_role bleibt bei Dir):

- `SUPABASE_URL`: `https://xxxxxxxxxxxx.supabase.co`
- `SUPABASE_ANON_KEY`: `eyJ...`
- Bestätigung, dass die Auth-Einstellungen (7 Tage Session, PW-Policy) gesetzt sind

Damit rolle ich in Arbeitsschritt 2 das Schema aus und schalte die RLS-Policies scharf.

---

## Häufige Stolperfallen

- **„Project paused after 7 days of inactivity"** — auf Free normal. Einfach im Dashboard **Restore** klicken, ~30 Sekunden.
- **Region falsch gewählt** — lässt sich nachträglich nicht ändern. Wenn versehentlich `us-east-1` gewählt, Projekt löschen und neu anlegen.
- **service_role-Key versehentlich committet** — im Dashboard **Settings → API → Reset service_role key** klicken. Alter Key ist sofort ungültig.
