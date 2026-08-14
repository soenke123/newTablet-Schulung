# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MPS Tablet-Schulung** is a browser-based learning platform for tablet workshops at a German school. It consists of a landing page and a gamified mini-game hub ("Lernwelt") where students collect virtual creatures by completing educational games. No build process — open any `.html` file directly in a browser.

## Top-Level Structure

```
Webauftrtitt/
├── index.html          → Landing page: links to GameHub, PDF downloads, and workshop slides
├── PROJEKTBRIEFING.md  → Migrationsplan Frontend-only → Supabase-Backend (v2, 2026-07-04)
├── Dokumente/          → PDF handouts for students (e.g. Handout_Tablet-Schulung.pdf)
├── supabase/           → Datenbank-Schema, Seed, Blacklist, Setup-Doku
├── api/                → Vercel Serverless Functions (signup, admin-Actions)
├── admin/              → Admin-Panel: Cluster/User/Fortschritts-Verwaltung
└── GameHub/            → All game logic (see GameHub/CLAUDE.md for detailed docs)
    ├── index.html      → Game selection hub with creature gallery
    ├── script.js       → Hub-only logic: GAMES_CONFIG, renderHub, shop modal, gallery
    ├── creatures.js    → Shared: creature images, egg SVGs, localStorage read/write
    ├── style.css       → Fantasy/adventure theme (CSS variables, Cinzel + Nunito fonts)
    ├── config.js       → GAME_ACCESS: password/lock status for each game (wandert schrittweise in DB)
    ├── data/           → Creature PNG sprites (14 types × 5 growth stages)
    ├── 1337.html       → Secret easter-egg game (Atari-1337 creature unlock)
    └── [14 game folders] (see GameHub/CLAUDE.md)
```

## Backend-Migration

Die Plattform ist von Frontend-only (localStorage) auf **Supabase-Backend + Vercel Functions** migriert. Referenzdokument: `PROJEKTBRIEFING.md`. Kernkonzept: Cluster (Schulungs-Kohorten mit Zeitfenster + Season) statt globalem `_rel`-Flag. Fake-Mail-Accounts auf `.fake`-TLD (kein E-Mail-Versand), Cheat-Härtung über RLS + SECURITY-DEFINER-RPCs.

**Aktueller Stand: Schritte 1–4 durch. Admin-Panel produktiv. Cluster-Starthilfe (Migration 0020) neu dazugekommen.**

Migrationen 0001–0063 liegen in `supabase/migrations/`. Schema/Seed, RLS, Session-Layer, Signup, State-Persistenz, Shop-Sync, Highscores, Cluster-Bonus, Multi-School, Blob-Spielstände und das kollaborative Board sind umgesetzt.

**Frontend-Session-Layer** (`session.js` im Repo-Root): stellt `window.supabaseClient`, `getUserSeason()`, `isLoggedIn()`, `getSessionUser()`, `waitForSession()`, `window.__accessToken` (JWT für direkte REST-Aufrufe) und ein `lernwelt:session-changed`-Event bereit. Die eigentliche Profil-Query läuft per direktem `fetch` gegen `/rest/v1/user_session`, nicht über die SDK-Query-Builder — die SDK hatte cross-tab-Lock-Probleme.

**Vercel-Functions** unter `/api/`: `signup.js` (inkl. Cluster-Bonus-Ausschüttung), `admin_reset_password.js`, `admin_delete_user.js`. Env-Vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FAKE_EMAIL_DOMAIN`. Siehe `api/SETUP.md`.

**Persistenz-Schicht in `creatures.js`:**
- `_serverUnlocked`-Cache für `user_unlocked_games` beim Hub-Boot (`getUnlocked()` bleibt synchron). Guest-Fallback: localStorage.
- `loadServerState()` zieht `game_state` (inkl. `coins` pro Spiel) in denselben localStorage-Blob, den der Hub liest — DB gewinnt für DB-vorhandene Games.
- `submit_game_result`-RPC (Migration 0005) persistiert Score-Submissions inkl. Coins.
- `loadServerShop`/`syncShopStateToServer` (Migration 0011) synchronisieren den Shop-State-Blob (`nests`, `bankedCoins`, `seenCreatures`, `avatarUnlocks`, …) via `user_collectibles.key='shop_state'`.

**Blob-Spielstände (`user_game_saves`, Migration 0061):** dritter Persistenz-Weg neben `game_state` (feste Spalten) und `shop_state` (jsonb mit feldweisem Merge) — ein **opaker Blob je (User, Spiel)** für Simulationsspiele, die ihren ganzen Zustand mitschleppen. RPCs `load_game_save` / `sync_game_save` / `reset_game_save`. **Kein Merge:** zwei divergierte Simulationsstände lassen sich nicht verschmelzen, deshalb gewinnt der Server beim Laden und eine `rev`-Spalte verhindert, dass ein zweites Gerät blind darüberschreibt. `load_game_save` liefert zusätzlich `age_sec` (Serveruhr) für Offline-Aufholpässe. Erster Nutzer: Startup Story (game18), Modul `GameHub/S3 Startup Story/js/cloud.js`; die Tabelle ist bewusst generisch, „The Algorithm" könnte sie unverändert mitbenutzen.

**Startup Story = abgeleitete Hub-Integration:** game18 ist das einzige Spiel ohne Runden — es meldet nichts, sondern der Hub liest den Blob und rechnet Kreatur, Wachstum und Coins selbst aus (`syncStartupStory()` in `creatures.js`, gezeigt als Reveal-Sequenz in `script.js`). Wachstum und Coins hängen beide am Peak des laufenden Spielstands; beim Freilassen wandern die Coins nach `bankedCoins` und der Slot geht auf 0, damit ein neuer Konzern wieder verdient. Der All-Time-Peak aus `game_highscores` speist nur die Bestenliste. `standalone: true` in `GAMES_CONFIG` schaltet Nester, Backup-Tausch und Runden-Items ab; Wachstumstrank und Stein der Vollendung bleiben. Details in `GameHub/S3 Startup Story/CLAUDE.md` §10.6.

**Coin-Modell:** Client-Anzeige summiert `game_state.coins` (pro Spiel) + `shop_state.bankedCoins` + `nests[].coins` — siehe `getTotalCoins()` in `script.js`. `wallets.coins` ist redundanter Gesamtstand, wird automatisch gepflegt.

**Cluster-Starthilfe (Migration 0020):** Pro Cluster im Admin-Panel konfigurierbarer Bonus — Startcoins (→ `bankedCoins`) und Season-Spiele freischalten mit zufälligem Baby-Monster pro Slot. Rarity-Roll: 85 % Normal / 10 % Rare / 5 % Epic / 0 % Legendary. Ausschüttung via `apply_cluster_bonus`-RPC bei Signup und bei manueller Cluster-Zuweisung. Grants pro (user, cluster) idempotent, Cluster-Wechsel = additiver Bonus. Deaktivieren wirkt nur für künftige Ausschüttungen.

**Admin-Ansicht für Startup Story:** User-Tab → Fortschritt → Umschalter „Hub / 🚀 Startup Story". Die Tabelle zeigt für alle User auf einmal Phase, User, Peak, Geld, Watchtime, Trend, Serverkapazität, Modelle/Metadaten, Techtree-Anteil und Dark Patterns; „Details" öffnet Farmen, laufende Deals/Kampagnen und die Trend-Aufschlüsselung. Gerechnet wird **mit den Spiel-Modulen selbst** (`admin/app.js` lädt `namespace/bus/ledger/state/techtree/events.js` nach und setzt ihnen den Blob als `RT3.state.current` vor) — sonst liefen Admin-Panel und Balance auseinander. Details in `GameHub/S3 Startup Story/CLAUDE.md` §10.7.

**Zukunftsboard (`game19`, Migration 0062):** erste **cluster-geteilte** Kachel — die Daten gehören dem Kurs, nicht dem User, und liegen deshalb weder in `game_state` noch in `shop_state` noch in `user_game_saves`, sondern in eigenen Tabellen `board_notes` + `board_state`. Ein vom Admin moderiertes Chancen/Risiken-Board in drei Phasen (1 Sammeln · 2 Belegen · 3 Besprechen), sechs Kategorien, drei Typen (Chance/Risiko/Vermutung). **Migration 0063** ergänzt zwei Achsen: `topics text[]` (KI / Social Media / Gaming — Mehrfachauswahl, darf leer bleiben; Kategorie bleibt die Pflicht-Achse) und `board_likes` für Zustimmung (`board_toggle_like`, PK verhindert Doppelstimmen; der eigenen Karte kann man nicht zustimmen, zugestimmt werden darf in **jeder** Phase — das Einfrieren in Phase 3 gilt dem Inhalt, nicht dem Gespräch). Weil `board_upsert_note` dabei einen Parameter bekam, wird die alte 9-Parameter-Signatur gezielt gedroppt — `create or replace` hätte eine zweite Funktion daneben gelegt und PostgREST könnte nicht mehr wählen. Kontingent 8 Postis + 2 Fakten je (User, Kurs); Fakten brauchen eine vollständige Quelle (Link · AutorIn · Veröffentlichungsdatum) — erzwungen per Tabellen-Constraint **und** RPC, angezeigt in Schul-Zitierweise (`formatSource()` in `js/board.js`). RPCs: `board_get` / `board_upsert_note` / `board_delete_note` / `board_set_phase` / `board_reset`; Tabellen haben nur SELECT-Policies, geschrieben wird ausschließlich über die RPCs. Aktualisierung per 5-Sekunden-Poll auf `board_get` mit Signatur-Diff (kein Realtime — die Admin-Sichtbarkeit hängt an einer Subquery-Policy, die Realtime laut 0038 nicht zuverlässig auswertet). Moderiert wird **in der Seite selbst**, nicht im Admin-Panel; Admins wählen dort den Kurs.

**Board-Ansicht = echte Wordcloud (`layoutCloud()` in `js/board.js`):** je Kategorie eine Wolke, die Karten werden per **archimedischer Spirale mit Kollisionsprüfung** von innen nach außen gesetzt — meiste Zustimmung zuerst, also größte Karte in der Mitte. Schriftgrad aus den Likes (Wurzelskala, 0.95–2.15 rem, Bezugsgröße ist das Maximum über das ganze Board). Gemessen wird mit `offsetWidth/offsetHeight`, weil das die Maße **vor** dem `transform` liefert; hochkant gestellte Karten (nur Texte ≤ 34 Zeichen, Auswahl deterministisch per id-Hash) belegen das um 90° gedrehte Rechteck und werden über ihren Mittelpunkt gesetzt. Drei Stellschrauben, die alle einen Grund haben: die Ellipse wird aus der **Kartenfläche** abgeleitet statt auf die Spaltenbreite gezwungen (sonst klemmen die Kandidaten am Rand und die großen Karten landen nicht mehr mittig), das Verhältnis wird auf 0.05 **gerundet** (sonst ordnet sich die Wolke bei jeder neuen Karte komplett neu), und am Ende wird das umschließende Rechteck **zentriert**. Auf der Karte steht nur noch der Text, oben die Themen-Icons, unten rechts die Zustimmung; Typ = farbiger Rahmen, **kein** Kategorie-Icon. Verfasser:in, Bereich und Quelle stehen im Detail-Overlay (`bdDetail`), dort sitzen auch Bearbeiten und Löschen. Fakten bleiben ab Phase 2 als festes Raster oben — eine Quellenangabe will gelesen und nicht gepackt werden.

**`collab`-Flag in `GAMES_CONFIG`:** dritter Kachel-Sonderfall neben `standalone` und `clusterLegi`. Gemeinsam mit `standalone` unter dem Prädikat `isRoundless(game)` in `script.js` zusammengefasst — beide melden kein Rundenergebnis, also sind Nest-Eier, Runden-Items, Backup-Tausch und Rundenbonus aus. Zusätzlich collab-spezifisch: kein Bonbon-Tages-Hinweis (es gibt keine Submission), und Admins dürfen das Season-Gate passieren (`isAdminUser()` in `getGameAccess` **und** in der Season-Sektions-Filterung von `renderHub` — beide Stellen sind nötig). Ein Monster ist vorgesehen, aber Wachstums- und Coin-Regel stehen noch aus; bis dahin zeigt die Kachel „Belohnung folgt…".

**Noch offen:** PDF-Storage-Anbindung. Season 3 (Kreaturen + Games). Diverse UI-ToDos: FokusFlow-Max-Score, Algorithm-Balancing, Theme in DB.

## Architecture

The landing page (`index.html`) is a standalone HTML file — no shared JS or CSS with GameHub. It links to `GameHub/index.html` and PDF files in `Dokumente/`.

GameHub uses a hub-and-spoke model: `GameHub/index.html` is the central hub, each game lives in its own folder, and `creatures.js` is the only shared JS between hub and games. See `GameHub/CLAUDE.md` for the full data flow, game-adding guide, creature logic, and localStorage state shape.

### Game Access Control (`config.js`)

`GAME_ACCESS` maps game IDs to lock/password settings. Edit this file to restrict or unlock games without touching game code.

### Shop & Coin Economy (in `script.js`)

The hub has an in-game shop where students spend coins to buy growth potions, additional egg slots, and the creature codex ("Buch der Monster"). Coins and shop inventory are stored in the same `lernwelt_v3` localStorage key alongside game state.

### Creature Rarity Tiers

Beyond the 7 base creature types (Schnecke → Drache), creatures can have **Rare / Epic / Legendary** status applied via CSS animated overlays (glitter effects). Rarity is tracked in localStorage and displayed in the gallery modal.

### `S2 The Algorithm` — Complex Subgame

This is the most architecturally complex game: a smartphone-addiction simulation with its own module system (`GameHub/S2 The Algorithm/js/`), separate `CLAUDE.md`, and game design document (`The_Algorithm_GDD.md`). It models Dopamin, Balance, Reizsättigung, and Sozialerdrang as resource bars driven by a card-based feed system. Real time (8 min) maps to in-game time (15:00–03:00).
