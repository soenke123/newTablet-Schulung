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

Migrationen 0001–0064 liegen in `supabase/migrations/`. Schema/Seed, RLS, Session-Layer, Signup, State-Persistenz, Shop-Sync, Highscores, Cluster-Bonus, Multi-School, Blob-Spielstände und das kollaborative Board sind umgesetzt.

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

**Reality Check (`game19`, Migration 0062):** erste **cluster-geteilte** Kachel — die Daten gehören dem Kurs, nicht dem User, und liegen deshalb weder in `game_state` noch in `shop_state` noch in `user_game_saves`, sondern in eigenen Tabellen `board_notes` + `board_state`. Ein vom Admin moderiertes Chancen/Risiken-Board in drei Phasen (1 Sammeln · 2 Recherchieren · 3 Besprechen), sechs Kategorien, drei Typen (Chance/Risiko/Vermutung). **Migration 0063** ergänzt zwei Achsen: `topics text[]` (KI / Social Media / Gaming — Mehrfachauswahl, darf leer bleiben; Kategorie bleibt die Pflicht-Achse) und `board_likes` für Zustimmung (`board_toggle_like`, PK verhindert Doppelstimmen; der eigenen Karte kann man nicht zustimmen, zugestimmt werden darf in **jeder** Phase — das Einfrieren in Phase 3 gilt dem Inhalt, nicht dem Gespräch). Weil `board_upsert_note` dabei einen Parameter bekam, wird die alte 9-Parameter-Signatur gezielt gedroppt — `create or replace` hätte eine zweite Funktion daneben gelegt und PostgREST könnte nicht mehr wählen. Kontingent 8 Post-Its + 2 Recherchen je (User, Kurs); Recherchen brauchen eine vollständige Quelle (Link · AutorIn · Veröffentlichungsdatum) — erzwungen per Tabellen-Constraint **und** RPC, angezeigt in Schul-Zitierweise (`formatSource()` in `js/board.js`). RPCs: `board_get` / `board_upsert_note` / `board_delete_note` / `board_set_phase` / `board_reset`; Tabellen haben nur SELECT-Policies, geschrieben wird ausschließlich über die RPCs. Aktualisierung per 5-Sekunden-Poll auf `board_get` mit Signatur-Diff (kein Realtime — die Admin-Sichtbarkeit hängt an einer Subquery-Policy, die Realtime laut 0038 nicht zuverlässig auswertet). Moderiert wird **in der Seite selbst**, nicht im Admin-Panel; Admins wählen dort den Kurs.

**Namensgebung (Migration 0065, 2026-08-14):** Die Kachel hieß bis dahin „Zukunftsboard" — falscher Zeitpunkt: die Einheit fragt nicht, was KI und Social Media einmal anrichten werden, sondern was sie **jetzt** mit uns machen. Heißt deshalb **Reality Check**, und die Phasentexte stehen im Präsens. Mit umbenannt wurde die zweite Kartenart: aus **„Fakt" wurde „Recherche"**, weil SuS im Netz auch Müll finden und das Wort das Urteil nicht vorwegnehmen darf — ob ein Fund trägt, klärt Phase 3. Entsprechend heißt Phase 2 „Recherchieren" statt „Belegen". **Nur die sichtbaren Texte sind umbenannt**: `game19`, der Ordner `S3 Zukunftsboard` und der Speicherwert `board_notes.kind = 'fakt'` bleiben — der kind-Wert steckt in Check-Constraints und in jedem RPC aus 0062–0064. Wer im Code `fakt` liest, meint die Recherche. Der Rest dieses Abschnitts benutzt die neuen Begriffe.

**Phasentrennung (Migration 0064):** Die Phasen sind zugleich die beiden **Fächer** des Boards — Phase 1 hält die Post-Its, Phase 2 die Recherchen, und sichtbar ist immer genau **eines** (`state.viewPhase` / `viewKind()` / `visibleNotes()` in `js/board.js`). Die Phasenleiste ist deshalb kein Schild mehr, sondern der Umschalter: goldener **Rand** = da steht der Kurs, goldene **Füllung** = das siehst du gerade, gedimmt = noch nicht freigeschaltet. Zwei getrennte Signale, weil es zwei getrennte Fragen sind. Phase 3 hat kein eigenes Fach (ein Zustand, kein Inhalt) und bleibt ein `<div>` statt eines Knopfs. Schaltet die Lehrkraft auf Phase 2, ziehen alle Tablets automatisch mit; wer neu dazukommt, landet ebenfalls beim laufenden Fach — eine eigene Wahl im `sessionStorage` (`bd_vphase`) schlägt beides. Server-Regeln dazu: **neue** Post-Its nur in Phase 1 (`p_id is null and p_kind='idee' and v_phase>=2` → `phase_locked`), bestehende bleiben in Phase 2 ausdrücklich **änderbar** — nachbessern ist etwas anderes als nachlegen. Und **Recherchen bekommen keine Zustimmung** (`fact_not_likable`): eine Recherche steht oder fällt mit ihrer Quelle, das ist keine Mehrheitsfrage. Altstimmen auf Recherchen werden nicht gelöscht, sondern nur nirgends mehr angezeigt.

**Board-Ansicht = echte Wordcloud (`layoutCloud()` in `js/board.js`):** je Kategorie eine Wolke, die Karten werden per **archimedischer Spirale mit Kollisionsprüfung** von innen nach außen gesetzt — meiste Zustimmung zuerst, also größte Karte in der Mitte. Schriftgrad aus den Likes (Wurzelskala, 0.95–2.15 rem, Bezugsgröße ist das Maximum über das ganze Board). Gemessen wird mit `offsetWidth/offsetHeight`, weil das die Maße **vor** dem `transform` liefert — die Karten hängen leicht schief (CSS `--tilt`, ±2,4°, sechs Winkel im `nth-child`-Wechsel), gerechnet wird aber mit dem achsenparallelen Rechteck; die Drehung passt in `CLOUD_GAP` (14 px, dafür von 10 erhöht). Hochkant gestellte Karten gab es einmal, sie kosteten mehr Lesbarkeit als sie brachten — heute stehen alle waagerecht. **Frisch gezeichnete Karten bekommen ihre Position mit abgeschaltetem `transition`** (`dataset.placed` als Marker): die Messschleife liest `offsetWidth` und erzwingt damit eine Style-Berechnung, wodurch `left: 0` aus dem Stylesheet zum Ausgangswert wird und jede Karte sonst bei **jedem** Zeichnen aus der linken oberen Ecke an ihren Platz fliegt. Die weiche Bewegung ist nur für den Fall gedacht, dass dieselben Karten neu angeordnet werden (Gerät gedreht). Drei Stellschrauben, die alle einen Grund haben: die Ellipse wird aus der **Kartenfläche** abgeleitet statt auf die Spaltenbreite gezwungen (sonst klemmen die Kandidaten am Rand und die großen Karten landen nicht mehr mittig), das Verhältnis wird auf 0.05 **gerundet** (sonst ordnet sich die Wolke bei jeder neuen Karte komplett neu), und am Ende wird das umschließende Rechteck **zentriert**. Auf der Karte steht **nur der Text** — kein Kategorie-Icon, keine Themen-Symbole, kein Name, keine Zahl; der Typ ist allein die Zettelfarbe, und wie stark eine Aussage getragen wird, sagt die Größe. Einzige Ausnahme: ein kleiner Daumen in der Ecke, wenn man selbst zugestimmt hat — sonst wüsste niemand mehr, wo er schon zugestimmt hat, und ein zweiter Doppeltipp nähme die Zustimmung unbemerkt wieder weg. Alles Weitere (Verfasser:in, Bereich, Themen, Quelle, Zustimmungszahl, Bearbeiten/Löschen und der Zustimmen-Umschalter) steht im Detail-Overlay `bdDetail` — erreichbar aus der Wolke **und aus der Tabellenzeile**, die Liste ist eine andere Sicht auf dasselbe Board und keine Sackgasse. Die Wolke gilt nur für Post-Its; **Recherchen stehen im festen Raster** (`.bd-factgrid`, seit 0064 innerhalb der jeweiligen Kategorie statt über dem Wechsler) — eine Quellenangabe will gelesen und nicht gepackt werden, und ohne Zustimmung gäbe es auch keine Größe, die etwas erzählt. Die Tabellenspalten hängen am Fach: Post-Its zeigen 👍, Recherchen die Quelle; eine „Art"-Spalte, in der überall dasselbe steht, entfällt.

**Optik = „Whiteboard" (`css/board.css`, 2026-08-14):** Die Kachel trägt bewusst **nicht** das dunkle Fantasy-Kleid des Hubs (Cinzel/Gold auf Braun), sondern bildet nach, was sie ist: eine weiße Tafel mit feinem 28-px-Raster (`.bd-surface` am `#bdBoard`, Klasse steht im HTML — sie gehört zur Bühne, nicht zum Inhalt), darauf Klebezettel in Pastell-Grün/Rot/Gelb, fast rechtwinklig (3 px), leicht schief, mit einem weichen Schatten nach rechts unten. Schrift durchgehend Inter. Zwei Regeln halten das zusammen: **(1) Die Farbe gehört den Zetteln** — der Bedien-Akzent (aktive Phase, Plus-Knopf, Speichern, Toast) ist neutrales Anthrazit `#2b3440` und keine vierte Farbe, die mit den Aussagen konkurriert; die eigene Karte bekommt darum auch nur einen gedämpften Ring (42 % Deckung), sonst zöge Besitz mehr Blicke auf sich als Zustimmung. **(2) Eine Recherche ist kein Zettel** — dieselbe `.bd-cn`-Karte wird im `.bd-factgrid` zur weißen Karte mit blauer Kopfkante (4 px), rechten Winkeln, ohne Schieflage und ohne Pastellfläche; die Haltung (Chance/Risiko/Vermutung) bleibt als kleiner Punkt oben rechts erhalten. Fallstrick beim Nacharbeiten: `.bd-modal p` darf **kein `color`** setzen — die Regel ist spezifischer als `.bd-error` und `.bd-help` und färbt sonst die Fehlermeldung grau statt rot. Drei durchgespielte Richtungen (Whiteboard · Studio · Materialtafel) stehen als `GameHub/S3 Zukunftsboard/showroom.html` im Repo.

**Bedienung der Wolken-Ansicht:** Ein Tipp öffnet das Detail, ein **Doppeltipp** stimmt zu (mit kurzer 👍-Rückmeldung am `<body>`, weil die Wolke sofort danach neu gezeichnet wird). Beides auf demselben Ziel geht nur mit **260 ms Wartezeit** — ein Doppeltipp beginnt nun einmal als einfacher Tipp; wo gar nicht zugestimmt werden kann (`canLike()`: eigene Karte oder Recherche), entfällt sie, dort öffnet der erste Tipp sofort. Angelegt wird über den **runden Plus-Knopf neben dem Bereichsnamen** (`bdCatAdd`): Art kommt aus dem Fach, Bereich aus dem Wechsler daneben — beides ist im Formular keine Frage mehr, sondern eine Angabe (`bdModalCat`). In der Tabellenansicht gibt es ihn nicht, dort fehlt der Bereichsbezug. Zwischen den sechs Bereichen wird **gewischt** (`touchstart`/`touchend`, passiv, nur bei > 55 px und deutlich waagerechter als senkrecht — sonst stirbt das Scrollen), alternativ über die Reiter, die Pfeile oder ←/→. Der Wechsler (`bdCatNav`) ist `sticky`, sichtbar ist immer **nur eine** Kategorie. Auf schmalen Geräten (< 520 px) werden keine Karten hochkant gestellt — dort kostet jede gedrehte Karte so viel Höhe wie ein Absatz.

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
