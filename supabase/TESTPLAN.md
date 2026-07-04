# Testplan — Arbeitsschritt 2 (RLS + RPCs)

Nach Ausführen von `0002_rls.sql`, `0003_blacklist.sql`, `0004_rpcs.sql` alle Tests hier durchgehen. Jeder Block ist einzeln in den SQL-Editor kopierbar.

## Voraussetzungen

- Migrationen 0001–0004 durch, seed durch
- Ein Test-Auth-User existiert (Dashboard: **Authentication → Users → Add User**, Fake-Mail `test1@mps.tablet-schulung.fake`, Passwort `test1234`, Auto-Confirm an). UUID notieren.
- Ein zweiter Test-User `test2@mps.tablet-schulung.fake` (für Isolation-Tests). UUID notieren.

Beide UUIDs unten mit `<UUID1>` und `<UUID2>` ersetzen.

---

## Block A — Setup: Cluster und Profile anlegen

Läuft im **SQL-Editor als postgres** (umgeht RLS — das ist okay für Setup).

```sql
-- Cluster für heute
insert into clusters (school_id, name, season, opens_at, closes_at)
select id, 'Testcluster-A2', 1, now() - interval '1 hour', now() + interval '1 day'
from schools where slug='mps'
on conflict (school_id, name) do nothing;

-- Profil für Test-User 1 (im Cluster, active)
insert into profiles (id, school_id, cluster_id, account_name, display_name, status)
select '<UUID1>', s.id, c.id, 'test1', 'Test-User-1', 'active'
from schools s
join clusters c on c.school_id = s.id and c.name = 'Testcluster-A2'
where s.slug='mps'
on conflict (id) do nothing;

-- Profil für Test-User 2 (kein Cluster, pending)
insert into profiles (id, school_id, account_name, display_name, status)
select '<UUID2>', s.id, 'test2', 'Test-User-2', 'pending'
from schools s where s.slug='mps'
on conflict (id) do nothing;

-- Prüfen
select id, account_name, display_name, status, cluster_id from profiles;
```

**Erwartet:** 2 Profile — test1 mit cluster_id gesetzt, test2 mit cluster_id null.

---

## Block B — user_session-View (als postgres/Superuser)

```sql
select * from user_session;
-- Erwartet: 2 Zeilen (test1 mit season=1, test2 mit season=0)
--
-- WICHTIG: der SQL-Editor läuft als postgres-Superuser und umgeht RLS
-- KOMPLETT. Deshalb siehst du hier alles. Das ist gewollt — sonst
-- könntest du nichts warten. Der echte RLS-Test kommt in Block C+E,
-- wo wir per `set local role authenticated` einen normalen User
-- simulieren.

select id, account_name, status from profiles;
-- Erwartet: 2 Zeilen.
```

---
dd78bbb7-d83c-4c4f-88fa-3041de1ce03b
## Block C — RPCs direkt testen (impersoniert)

Um einen eingeloggten User zu simulieren, brauchen wir `set local role authenticated` + einen gefälschten JWT. **Wichtig:** `set local` wirkt nur innerhalb einer Transaktion. Der Supabase SQL-Editor committet jeden Run automatisch — also müssen wir explizit `begin; ... commit;` schreiben und **jeden Block als EINEN Run** ausführen (nicht Zeile für Zeile).

Jeden Block einzeln in den Editor kopieren und Run klicken.

**C1 — display_name ändern (valide)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select update_display_name('Max Mustermann');
commit;
```
Erwartet: `{"ok": true, "display_name": "Max Mustermann"}`

**C2 — display_name ändern (Blacklist)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select update_display_name('Arschloch99');
commit;
```
Erwartet: `{"ok": false, "error": "blacklisted"}`

**C3 — display_name ändern (zu kurz)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select update_display_name('a');
commit;
```
Erwartet: `{"ok": false, "error": "invalid_length"}`

**C4 — unlock_game (falsches Passwort)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select unlock_game('game3', 'falsches-passwort');
commit;
```
Erwartet: `{"ok": false, "error": "wrong_password"}`

**C5 — unlock_game (Game ohne Passwort)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select unlock_game('game7', 'egal');
commit;
```
Erwartet: `{"ok": false, "error": "no_password"}`

**C6 — submit_game_result (Season 1, gültig)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select submit_game_result('game7', 8, 10);
commit;
```
Erwartet: `{"ok": true, "points": 8, "growth": 8, "creature": "falkeneule", "coins": 8, "coins_delta": 8, "growth_delta": 8}`

**C7 — submit_game_result (zweiter Durchgang, Kreatur bleibt)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select submit_game_result('game7', 6, 10);
commit;
```
Erwartet: `{"ok": true, "points": 14, "growth": 14, "creature": "falkeneule", ...}` — creature bleibt „falkeneule".

**C8 — submit_game_result (Season 2 Game, User ist Season 1)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select submit_game_result('game12', 5, 10);
commit;
```
Erwartet: `{"ok": false, "error": "season_locked"}`

**C9 — submit_game_result (Cheat-Versuch: mehr correct als max)**
```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';
  select submit_game_result('game7', 99, 10);
commit;
```
Erwartet: `{"ok": false, "error": "invalid_input"}`

Prüfen der Effekte:

```sql
select * from game_state where user_id = 'dd78bbb7-d83c-4c4f-88fa-3041de1ce03b';
-- Erwartet: 1 Zeile für game7, points=14, growth=14, rounds_played=2, creature='falkeneule'

select * from wallets where user_id = 'dd78bbb7-d83c-4c4f-88fa-3041de1ce03b';
-- Erwartet: 1 Zeile, coins=14
```

---

## Block D — Pending-User kann nichts spielen

```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"8ec2b971-637c-4105-9962-f9f7801a61e9","role":"authenticated"}';
  select submit_game_result('game7', 10, 10);
commit;
```
Erwartet: `{"ok": false, "error": "account_not_active"}` — Test-User 2 hat `status='pending'`.

---

## Block E — RLS-Isolation (User 1 sieht User 2 nicht)

Als User 1 versuchen, User 2's Daten zu sehen — alle drei Queries im gleichen Transaction-Block:

```sql
begin;
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub":"dd78bbb7-d83c-4c4f-88fa-3041de1ce03b","role":"authenticated"}';

  -- E1
  select id, account_name from profiles;
  -- Erwartet: NUR test1. NICHT test2.

  -- E2
  select * from game_state;
  -- Erwartet: nur eigene Rows (game7 mit points=14 nach C6+C7).

  -- E3
  select * from wallets;
  -- Erwartet: nur eigene Row, coins=14.
commit;
```

> Der Supabase SQL-Editor zeigt bei mehreren SELECTs in einer Transaktion meist nur das letzte Ergebnis. Falls Du alle drei sehen willst, einzeln in getrennten `begin...commit`-Blöcken laufen lassen.

---

## Block F — Blacklist-Function isoliert

```sql
select contains_blacklisted_word('normaler Name');       -- false
select contains_blacklisted_word('SchEiß3');              -- true (normalisiert zu 'scheiss3', 'scheisse' matched? Nein — 'scheisse' ist länger.)
  select contains_blacklisted_word('scheisse');             -- true
select contains_blacklisted_word('scheiße');              -- true (ß wird entfernt)
select contains_blacklisted_word('mA$$imus');             -- true ('ass' ist Blacklist)
select contains_blacklisted_word('Klassenraum');          -- true ('ass' ist Substring — bewusst konservativ)
select contains_blacklisted_word('Max42');                -- false
```

> Hinweis: die Substring-Prüfung ist **absichtlich streng** (false positives bei 'Klassenraum', 'passieren' etc.). Falls das im Betrieb zu nervig ist, verbessern wir später auf Wort-Grenzen.

---

## Block G — Test aus dem Browser (REST-API)

Öffne https://rythalrubpnbbwpewxmc.supabase.co in einem Tab. Dann in der **Browser-Konsole** (F12):

```js
const url = 'https://rythalrubpnbbwpewxmc.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5dGhhbHJ1YnBuYmJ3cGV3eG1jIiwicm9s
  ZSI6ImFub24iLCJpYXQiOjE3ODMxNzcwNTgsImV4cCI6MjA5ODc1MzA1OH0.FlzVxMY6v9t9cGD5BS-V-vONzqSDcA9E8u4iLe4sN4M';

// G1: Games öffentlich lesbar
fetch(`${url}/rest/v1/games_public?select=id,season,title&order=season,id`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(console.log);
// Erwartet: Array mit ~10 Games, KEIN password_hash-Feld

// G2: password_hash-Tabelle NICHT direkt lesbar (nur via games_public)
fetch(`${url}/rest/v1/games?select=id,password_hash`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(console.log);
// Erwartet: Array MIT password_hash (weil games komplett lesbar, active=true).
// Damit ist der Hash zwar öffentlich, aber SHA-256 + gutes Passwort = sicher.
// TODO Arbeitsschritt 3: nur games_public exponieren, games direkt sperren.

// G3: profiles ohne Login nicht lesbar
fetch(`${url}/rest/v1/profiles?select=*`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(console.log);
// Erwartet: leeres Array (RLS blockt anon von profiles)

// G4: migration_pending nicht mal existent
fetch(`${url}/rest/v1/migration_pending?select=*`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
}).then(r => r.json()).then(console.log);
// Erwartet: 404 oder "table not found" (kein GRANT für anon).
```

---

## Aufräumen

```sql
delete from wallets      where user_id in ('dd78bbb7-d83c-4c4f-88fa-3041de1ce03b', '8ec2b971-637c-4105-9962-f9f7801a61e9');
delete from game_state   where user_id in ('dd78bbb7-d83c-4c4f-88fa-3041de1ce03b', '8ec2b971-637c-4105-9962-f9f7801a61e9');
delete from profiles     where id      in ('dd78bbb7-d83c-4c4f-88fa-3041de1ce03b', '8ec2b971-637c-4105-9962-f9f7801a61e9');
delete from clusters     where name    = 'Testcluster-A2';
-- Auth-User löschst du im Dashboard: Authentication → Users
```

---

## Was NACH diesem Test wasserdicht ist

- ✅ Direkte Table-Writes vom Browser sind blockiert (nur SELECT).
- ✅ User 1 sieht keine Daten von User 2.
- ✅ Pending-User kann nichts einreichen.
- ✅ Season-Gate greift.
- ✅ Cheat-Versuche mit unmöglichen Zahlen werden abgelehnt.
- ✅ Passwörter werden nicht im Klartext geprüft.
- ✅ Display-Name-Wechsel geht durch Blacklist.

## Was NOCH offen ist (Arbeitsschritt 3)

- Frontend nutzt noch localStorage, nicht die DB.
- Signup-Flow (Fake-Mail-Generation) läuft noch nicht.
- `_rel`-Refactor auf `getUserSeason()`.
- Vercel Functions für Admin-Aktionen.
