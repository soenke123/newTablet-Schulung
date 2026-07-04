# Projektbriefing: Lernplattform mit Supabase-Backend

Dieses Dokument fasst alle Architekturentscheidungen und den konkreten Umsetzungsplan zusammen. Es ist das Arbeitsdokument für die Migration der Frontend-only-Lernwelt zur backend-gestützten Multi-Season-Plattform.

**Stand:** 2026-07-04 · **Version:** v2 (nach Cluster/Season-Klärung)

---

## 1. Zielbild

Die aktuelle Frontend-only-Plattform (Vanilla JS, localStorage, kein Build) wird um ein Backend erweitert:

- **Zentrale Datenspeicherung** statt localStorage → Cross-Device-Sync
- **Cheat-sichere Score-/Coin-/Growth-Berechnung** über RLS + serverseitige Regeln
- **Cluster/Season-System** zur Organisation von Schulungen und Progression
- **Lehrer-/Admin-Panel** für Freischaltungen, Übersicht, User-Verwaltung
- **Passwort-Schutz einzelner Spiele** wandert vom Frontend ins Backend
- **Season-abhängige Inhalte** (Games, Präsentationen, Handout) werden zentral gesteuert
- **DSGVO-konform** (Supabase EU, Vercel Frankfurt, pseudonyme Accounts)

**Single-tenant zum Start**: nur MPS als Schule. Multi-Tenant-Struktur wird jedoch von Anfang an vorbereitet (`school_id` in allen relevanten Tabellen), damit spätere Schulen ohne Umbau ergänzt werden können.

Die alte Version bleibt parallel online mit einem **„Erspielte Daten in Account übertragen"**-Button.

---

## 2. Tech Stack

| Bereich | Technologie |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (kein Framework, kein Build) |
| Datenbank + Auth | Supabase EU (`eu-central-1`, Frankfurt) |
| Hosting | Vercel (Frankfurt) |
| Serverless-Backend | Vercel Functions (nur Admin-Aktionen) + Postgres-RPCs |
| PDF-Storage | Supabase Storage (mit Season-Policies) |
| Versionskontrolle | GitHub |

**Prinzip**: Schüler sprechen direkt mit Supabase (anon key + JWT). Admin-Aktionen laufen über Vercel Functions mit `service_role`-Key (verlässt niemals den Server).

---

## 3. Auth-Modell

### Registrierung

Schüler registriert sich mit:
- **Schule** (Dropdown, aktuell nur „MPS")
- **Accountname** (frei wählbar, pro Schule unique, lowercase-normalisiert)
- **Passwort**

Keine E-Mail-Eingabe. Intern wird eine Fake-Mail generiert:
```
{accountname}@{schulslug}.users.mps-schulung.de
```
Beispiel: `max@mps.users.mps-schulung.de`

**Uniqueness**: `UNIQUE(school_id, account_name)`. Zwei „Max" in verschiedenen Schulen sind erlaubt.

### Signup-Flow (mit Cluster)

**Bei aktivem Cluster-Zeitfenster** (Admin hat vorher einen Cluster mit `opens_at`–`closes_at` geöffnet):
- Schüler kann sich anmelden → Account sofort `active` → automatische Zuordnung zum offenen Cluster → erbt Season vom Cluster

**Außerhalb eines Cluster-Zeitfensters:**
- Schüler kann sich anmelden → Account bekommt Status `pending` → Login zwar möglich, aber kein Zugriff auf Season-Content bis Admin freischaltet
- Admin sieht `pending`-Liste, schaltet frei, weist optional Cluster zu

### Zwei Namen pro Schüler

| Feld | Beschreibung | Änderbar? |
|---|---|---|
| `account_name` | fester Identifier, wird für Login genutzt | Nein |
| `display_name` | erscheint bei Highscores, in Gallery etc. | Ja (außer `display_name_locked = true`) |

**Schimpfwort-Filter** läuft **serverseitig** (Postgres-Function beim INSERT/UPDATE) mit deutscher+englischer Blacklist. Client-side wird die gleiche Liste für UX-Frühwarnung genutzt (Rot-Highlighting vor Submit).

### Passwort-Reset

Zunächst manuell durch Admin (Supabase-Dashboard). Später erweiterbar um Reset-Code pro Klasse.

---

## 4. Cluster & Season – das Herzstück

### Konzept

- **Cluster** = organisatorische Kohorte einer Schulung. Gehört zu einer Schule und hat einen Namen (z. B. „Schulung 3.3"), ein Zeitfenster (`opens_at`, `closes_at`) und eine **feste Season** (Integer).
- **Ein Schüler ist immer in genau einem Cluster** (oder in keinem, wenn `pending` oder erst außerhalb angemeldet).
- **Season eines Schülers = Season seines Clusters.** Kein zweiter Freischaltungs-Layer.
- **Seasons sind kumulativ**: Wer in Season 3 ist, hat alle Inhalte aus Season 1 und 2 automatisch.
- **Season = 0 (kein Cluster / nicht eingeloggt)**: nur öffentlicher Content, kein Speichern von Progress.

### Was der Admin mit Clustern macht

- Cluster anlegen (Name + Zeitraum + Season)
- User in Cluster verschieben (Progress bleibt bestehen, aber Season-Sichtbarkeit passt sich an)
- Ganze Cluster in nächste Season heben („Cluster X → Season 3")
- Statistiken pro Cluster ansehen

### Season-Content – was ist an Season gebunden?

| Ressource | Ort | Zugriff |
|---|---|---|
| Games im GameHub | statisch im Repo, DB-Metadaten steuern Season | Frontend versteckt, RLS blockiert Score-Submission |
| Kreaturen (S2_NORMALS, Chamäleon etc.) | `creatures.js`, `script.js` | Season-Check in Render/RNG |
| Präsentations-PDFs (Season 2+) | Supabase Storage | Signed URL, nur bei Season-Match |
| Handout PDF v2 | Supabase Storage | Signed URL, Season 2+ (v2 enthält Season 1 kumulativ) |
| Interaktives Handout (`Dokumente/handout.html`) | statisch | JS-Toggle nach Session-Season |
| Landing-Page (Titel-Suffix, Farbe, Sektionen) | `index.html` | JS-Toggle nach Session-Season |

### Öffentlich vs. eingeloggt

**Öffentlich sichtbar (Season 0):**
- Landing Page komplett (mit „Einloggen"/„Registrieren" oben rechts)
- Online-Handout (Season-1-Inhalte)
- Handout PDF v1 Download
- Season-1-Präsentationen
- GameHub-Link (der Hub selbst ist erreichbar)
- Season-1-Games im Hub — spielbar aber ohne Progress-Speicherung
- Passwort-geschützte Games bleiben passwort-geschützt (Passwort-Prüfung serverseitig)

**Beim Klick auf gesperrte Season-Inhalte / Progress speichern:**
- Modal „Bitte einloggen oder registrieren"

**Landing-Page oben rechts:**
- nicht eingeloggt: `[Einloggen]` `[Registrieren]`
- eingeloggt: `{display_name} ▼` mit Dropdown („Ausloggen", ggf. „Profil")

---

## 5. Datenmodell

### Tabellen

```sql
schools (
  id           uuid PRIMARY KEY,
  slug         text UNIQUE NOT NULL,     -- 'mps' (für Fake-Mail-Domain)
  name         text UNIQUE NOT NULL,     -- 'MPS'
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

clusters (
  id           uuid PRIMARY KEY,
  school_id    uuid REFERENCES schools NOT NULL,
  name         text NOT NULL,            -- 'Schulung 3.3'
  season       int  NOT NULL DEFAULT 1,
  opens_at     timestamptz,
  closes_at    timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(school_id, name)
);

profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users,
  school_id            uuid REFERENCES schools NOT NULL,
  cluster_id           uuid REFERENCES clusters,     -- NULL = pending / clusterlos
  account_name         text NOT NULL,
  display_name         text NOT NULL,
  display_name_locked  boolean DEFAULT false,
  status               text CHECK (status IN ('pending','active')) DEFAULT 'pending',
  created_at           timestamptz DEFAULT now(),
  UNIQUE(school_id, account_name)
);

game_state (
  user_id       uuid REFERENCES auth.users,
  game_id       text NOT NULL,
  points        int DEFAULT 0,
  rounds_played int DEFAULT 0,
  creature      text,
  growth        int DEFAULT 0,
  updated_at    timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

wallets (
  user_id     uuid PRIMARY KEY REFERENCES auth.users,
  coins       int DEFAULT 0,
  updated_at  timestamptz DEFAULT now()
);

games (
  id              text PRIMARY KEY,       -- 'game3', 'game7', ...
  season          int NOT NULL,
  folder          text NOT NULL,
  title           text,
  password_hash   text,                   -- NULL = kein Passwort
  requires_login  boolean DEFAULT false,  -- für Easter-Eggs wie 1337.html
  active          boolean DEFAULT true
);

user_unlocked_games (
  user_id     uuid REFERENCES auth.users,
  game_id     text REFERENCES games,
  unlocked_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

user_collectibles (
  -- Rare/Epic/Legendary-Status pro Kreatur, extra Slots, Shop-Käufe etc.
  user_id     uuid REFERENCES auth.users,
  key         text NOT NULL,              -- 'rare_drache', 'extra_slot_1', 'codex_bought'
  value       jsonb,
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
```

### View für effektive Session

```sql
CREATE VIEW user_session AS
SELECT
  p.id,
  p.school_id,
  p.cluster_id,
  p.account_name,
  p.display_name,
  p.status,
  COALESCE(c.season, 0) AS season
FROM profiles p
LEFT JOIN clusters c ON c.id = p.cluster_id;
```

### RLS-Policies (Grundzüge)

**profiles**
- SELECT: eigener User + Admins
- INSERT: erlaubt, aber `status` wird per Trigger nach Cluster-Prüfung gesetzt
- UPDATE: nur `display_name` per RPC `update_display_name(new_name)`, andere Spalten nur Admin. Trigger wirft Spaltenänderungen von Nicht-Admins weg.

**game_state / wallets**
- SELECT/INSERT/UPDATE: nur eigener User
- WITH CHECK: `game.season <= user_session.season` (Cheat-Prävention)
- Direktes UPDATE eigentlich blockiert — Updates laufen ausschließlich über RPC `submit_game_result` (SECURITY DEFINER)

**games / user_unlocked_games**
- `games`: SELECT für alle
- `user_unlocked_games`: SELECT eigener User; INSERT nur über RPC `unlock_game()`

### Zentrale RPCs

- `unlock_game(game_id text, password text) → boolean` — hasht Eingabe, vergleicht mit `games.password_hash`, insert bei Erfolg
- `update_display_name(new_name text) → boolean` — prüft Lock, prüft Schimpfwort-Blacklist
- `submit_game_result(game_id text, correct int, max int) → jsonb` — **Cheat-Preventing-Kern**: berechnet coins/growth/creature serverseitig, updated `game_state` und `wallets`, gibt neue Werte zurück

---

## 6. Frontend-Refactor: `_rel` → Session-basiert

Aktuell ist `_rel` ein globaler Bool in `GameHub/config.js:13`, der Season-2-Content ein-/ausblendet. Grep-Befund: **~25 Fundstellen** über 6 Files.

### Neue globale API (in neuem `session.js` oder erweitertem `creatures.js`)

```js
window.getUserSeason = () => window.__session?.season ?? 0;
window.isLoggedIn = () => !!window.__session?.id;
window.__session = null;
```

### Session-Bootstrap (auf Landing und im GameHub)

```js
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  const { data } = await supabase.from('user_session').select('*').single();
  window.__session = data;
}
```

### Mechanische Ersetzungen

| Alt | Neu |
|---|---|
| `typeof _rel !== 'undefined' && _rel` | `getUserSeason() >= 2` |
| `game.season === 2 && !_rel` | `game.season > getUserSeason()` |
| `_rel ? X : Y` | `getUserSeason() >= 2 ? X : Y` |

**Betroffene Files** (aus Grep-Befund):
- `GameHub/config.js` (`_rel = true;` fliegt raus)
- `GameHub/creatures.js` (Zeilen 422, 435, 451, 490 — Rarity/RNG)
- `GameHub/index.html` (Zeile 212)
- `GameHub/script.js` (~15 Fundstellen — Locking, Shop, Codex, Lootbox)
- `index.html` (Zeile 658 — Landing-Umschaltung)
- `Dokumente/handout.js` (Zeile 6)

Skalierung auf Season 3+: neue Blöcke nutzen `>= 3`.

---

## 7. Passwort-geschützte Games ins Backend

Aktuell in `GameHub/config.js`:
```js
GAME_ACCESS = {
  game3:  { status: 'password', passwordHash: 'c271...' },
  ...
};
```

**Neu**: `password_hash` steht in DB-Tabelle `games`. Client kennt den Hash nicht. Prüfung via RPC:

```js
const { data: unlocked, error } = await supabase.rpc('unlock_game', {
  game_id: 'game3',
  password: userInput
});
```

RPC (SECURITY DEFINER) hasht Eingabe mit `pgcrypto`, vergleicht, insert in `user_unlocked_games` bei Erfolg, gibt `true` zurück. Beim Hub-Rendern: `SELECT game_id FROM user_unlocked_games` → ersetzt `getUnlocked()` aus `creatures.js:932`.

---

## 8. Datenmigration alte → neue Version

1. Alte Version (localStorage) bekommt Button **„Erspielte Daten in Account übertragen"**
2. Klick → localStorage-Payload wird als **Migration-Token** an Vercel Function POSTed → temporäre Row in `migration_pending`
3. Weiterleitung auf neue Version mit `?migration_token=xyz` (kurz, kein Payload in URL)
4. Nach Registrierung: Token einlösen, Kreatur übernehmen
5. Alter localStorage bekommt Flag `migrated: true` → kein Doppel-Import möglich

**Bewusst akzeptiert:** localStorage ist nicht verifizierbar. Als Kompromiss wandern **nur die Kreaturen** in den Account, **Coins und Points werden nicht mitgenommen**. Damit ist Cheating unattraktiv.

---

## 9. Landing-Page-Änderungen

- **Oben rechts:** Auth-Buttons (nicht eingeloggt) bzw. User-Menü (eingeloggt)
- **GameHub-Link bleibt sichtbar** auch für Nicht-Eingeloggte. Bei Klick auf Season-2+-Content im Hub kommt Login-Modal.
- Titel-Suffix „v3", GameHub-Button-Farbe, Season-2-Präsentationen, Handout-v2-Download: alles über `getUserSeason()` statt `_rel`
- Season-2-Präsentationen werden aus Supabase Storage geladen (Signed URLs)

---

## 10. Admin-Panel

**Auth**: Admin loggt sich mit echter E-Mail + Passwort ein (kein Fake-Mail-Trick). Rolle `admin` im JWT.

**M1-Umfang (Mini):**
- Schule anlegen/verwalten
- Cluster anlegen (Name, Zeitraum, Season)
- Pending-User-Liste → freischalten + Cluster zuweisen
- User in anderen Cluster verschieben
- Passwort-Reset: Redirect ins Supabase-Dashboard reicht anfangs

**M2-Erweiterung:**
- Statistik pro Cluster
- Bulk-Aktionen („Cluster X → Season 3")
- Display-Name-Verwaltung (Lock/Unlock/Override)
- CSV-Export
- Games-CMS (Passwort setzen, Season zuweisen, aktivieren/deaktivieren)

---

## 11. DSGVO / Rechtliches

- AVV mit Supabase (Business-Plan prüfen)
- Region-Pinning auf `eu-central-1`
- Impressum + Datenschutzerklärung auf der Landing
- Löschkonzept: Schuljahresende → Reset-Prozess (Cluster-basiert)
- Recht auf Vergessenwerden: Kontolöschung via Admin auf Anfrage
- Kein Tracking/Analytics → kein Cookie-Banner nötig
- Rate-Limiting auf Signup + Login (Vercel Function davor)

---

## 12. Umsetzungsplan – M1 (Silent Launch)

Ziel: Neue Version läuft parallel, Schüler können sich anmelden, Progress in Supabase, Cluster/Seasons funktionieren, Cheat-Härtung pragmatisch (RLS + Server-side score submit), Mini-Admin-Panel.

### Phase 0 – Setup (4–6 h)
- [ ] Supabase-Projekt anlegen (EU, Frankfurt)
- [ ] Vercel-Projekt anlegen, mit Repo verbinden
- [ ] Envs setzen (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` nur Vercel-side)
- [ ] Supabase CLI + `supabase/migrations/`-Ordner (Schema unter Versionskontrolle)
- [ ] Staging- und Prod-Environment separat

### Phase 1 – Datenmodell + RLS (10–14 h)
- [ ] Migration 1: alle Tabellen aus Kap. 5
- [ ] View `user_session`
- [ ] Seed: MPS-Schule anlegen, alle Games aus aktuellem `GAMES_CONFIG` in `games`-Tabelle spiegeln (inkl. `password_hash` aus `GAME_ACCESS`)
- [ ] RLS-Policies auf allen Tabellen
- [ ] RPCs: `unlock_game`, `update_display_name`, `submit_game_result`
- [ ] Schimpfwort-Blacklist als Postgres-Function

### Phase 2 – Auth + Session-Layer (8–12 h)
- [ ] Signup-Seite (Schule/Accountname/PW) mit Fake-Mail-Generation
- [ ] Login-Seite
- [ ] `session.js` mit `getUserSeason()`, `isLoggedIn()`, Bootstrap-Code
- [ ] Cluster-Erkennung beim Signup (aktives Fenster? → `active`, sonst `pending`)
- [ ] Rate-Limiting auf Vercel Function davor
- [ ] Logout-Flow

### Phase 3 – `_rel`-Refactor (6–10 h)
- [ ] Alle `_rel`-Fundstellen ersetzen (siehe Kap. 6)
- [ ] `config.js`: `_rel` und `GAME_ACCESS` entfernen (letzteres wandert in DB)
- [ ] `creatures.js`: `_rel`-Checks in RNG und Rarity auf `getUserSeason()`
- [ ] `script.js`: alle Season-Checks auf `getUserSeason()`
- [ ] Landing `index.html`: Session-Bootstrap + Season-Toggles
- [ ] `Dokumente/handout.js`: Session-Bootstrap + Season-Toggles

### Phase 4 – Storage-Anbindung im Frontend (10–14 h)
- [ ] `creatures.js`: `getGameData`/`saveGameData` → Fallback: localStorage wenn nicht eingeloggt, Supabase wenn eingeloggt
- [ ] Score-Submission über `submit_game_result` RPC (statt direktem UPDATE)
- [ ] `getUnlocked()` → aus `user_unlocked_games`
- [ ] Coins-Read → `wallets`
- [ ] Passwort-Modal für gesperrte Games → RPC `unlock_game`

### Phase 5 – PDF-Storage + Signed URLs (4–6 h)
- [ ] Supabase Storage Bucket `content` mit Season-Ordner-Struktur
- [ ] PDFs hochladen (Handout v2, Season-2-Präsentationen)
- [ ] Storage-Policy: nur bei `user_session.season >= file.season`
- [ ] Landing: Signed URLs via `supabase.storage.from('content').createSignedUrl(...)`

### Phase 6 – Landing + Auth-UI (5–8 h)
- [ ] Login-/Registrieren-Buttons oben rechts
- [ ] Modal-Flow für nicht eingeloggten GameHub-Klick auf gesperrten Content
- [ ] User-Menü mit Ausloggen
- [ ] Migration-Button in alter Version → Migration-Token-Flow

### Phase 7 – Mini-Admin-Panel (10–14 h)
- [ ] Admin-Login (echter E-Mail-Flow, Rolle `admin`)
- [ ] Cluster-CRUD (anlegen, Zeitraum ändern, Season setzen)
- [ ] Pending-User-Liste → freischalten + Cluster zuweisen
- [ ] User-Übersicht mit Verschieben zwischen Clustern

### Phase 8 – Testing, DSGVO, Go-Live (10–14 h)
- [ ] End-to-End-Test: Signup → Cluster → Spielen → Progress in DB
- [ ] Cheat-Test: manuelles Supabase-Manipulieren → wird durch RLS blockiert?
- [ ] Impressum + Datenschutzerklärung schreiben
- [ ] AVV mit Supabase abschließen
- [ ] Domain aufsetzen, DNS
- [ ] Alte Version bleibt online, Migration-Button aktivieren

**Gesamt-Schätzung M1: 67–98 h**

---

## 13. Umsetzungsplan – M2 (später)

- Volles Lehrer-Dashboard mit Statistiken pro Cluster
- Realtime-Klassenraum-Ansicht („18 von 22 haben Spiel 3 abgeschlossen")
- Bulk-Aktionen für Cluster
- Rare/Epic/Legendary serverseitig würfeln
- Reset-Code-Feature für Passwort-Reset im Klassenraum
- Games-CMS im Admin-Panel
- CSV-Export
- Optional: mehr Schulen onboarden

**Zusatz-Aufwand M2: ~45–75 h**

---

## 14. Bereits gebaut (Prototyp)

Im separaten Ordner (Vercel/Supabase-Prototyp, außerhalb dieses Repos) existiert:
- Login + Registrierung via Supabase Auth
- Speichern einer Zahl und einer Farbe pro User in Supabase
- RLS korrekt eingerichtet
- Supabase JS SDK via CDN (kein Build)

Dieser Prototyp dient als technische Referenz — der Auth-Flow und die Supabase-JS-Integration können weitgehend übernommen und erweitert werden.

---

## 15. Offene Punkte (vor Phase 0 klären)

- [ ] Supabase-Plan: Free reicht für Pilot, aber AVV? → Business-Plan (~25 $/mo) prüfen
- [ ] Domain für Fake-Mail: `mps-schulung.de` verfügbar? Alternative?
- [ ] Schimpfwort-Blacklist: eigene Liste pflegen oder existierende (github.com/…) übernehmen?
- [ ] Passwort-Mindestlänge für Schüler: 6? 8?
- [ ] Session-Timeout: 24 h? 7 Tage?
- [ ] Rate-Limits: exakte Werte
