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

Migrationen 0001–0020 liegen in `supabase/migrations/`. Schema/Seed, RLS, Session-Layer, Signup, State-Persistenz, Shop-Sync, Highscores und Cluster-Bonus sind alle umgesetzt.

**Frontend-Session-Layer** (`session.js` im Repo-Root): stellt `window.supabaseClient`, `getUserSeason()`, `isLoggedIn()`, `getSessionUser()`, `waitForSession()`, `window.__accessToken` (JWT für direkte REST-Aufrufe) und ein `lernwelt:session-changed`-Event bereit. Die eigentliche Profil-Query läuft per direktem `fetch` gegen `/rest/v1/user_session`, nicht über die SDK-Query-Builder — die SDK hatte cross-tab-Lock-Probleme.

**Vercel-Functions** unter `/api/`: `signup.js` (inkl. Cluster-Bonus-Ausschüttung), `admin_reset_password.js`, `admin_delete_user.js`. Env-Vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FAKE_EMAIL_DOMAIN`. Siehe `api/SETUP.md`.

**Persistenz-Schicht in `creatures.js`:**
- `_serverUnlocked`-Cache für `user_unlocked_games` beim Hub-Boot (`getUnlocked()` bleibt synchron). Guest-Fallback: localStorage.
- `loadServerState()` zieht `game_state` (inkl. `coins` pro Spiel) in denselben localStorage-Blob, den der Hub liest — DB gewinnt für DB-vorhandene Games.
- `submit_game_result`-RPC (Migration 0005) persistiert Score-Submissions inkl. Coins.
- `loadServerShop`/`syncShopStateToServer` (Migration 0011) synchronisieren den Shop-State-Blob (`nests`, `bankedCoins`, `seenCreatures`, `avatarUnlocks`, …) via `user_collectibles.key='shop_state'`.

**Coin-Modell:** Client-Anzeige summiert `game_state.coins` (pro Spiel) + `shop_state.bankedCoins` + `nests[].coins` — siehe `getTotalCoins()` in `script.js`. `wallets.coins` ist redundanter Gesamtstand, wird automatisch gepflegt.

**Cluster-Starthilfe (Migration 0020):** Pro Cluster im Admin-Panel konfigurierbarer Bonus — Startcoins (→ `bankedCoins`) und Season-Spiele freischalten mit zufälligem Baby-Monster pro Slot. Rarity-Roll: 85 % Normal / 10 % Rare / 5 % Epic / 0 % Legendary. Ausschüttung via `apply_cluster_bonus`-RPC bei Signup und bei manueller Cluster-Zuweisung. Grants pro (user, cluster) idempotent, Cluster-Wechsel = additiver Bonus. Deaktivieren wirkt nur für künftige Ausschüttungen.

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
