# Season 3 — Planungsdokument

> **Status:** Entwurf v0.2 (2026-07-14) — lebendes Dokument, wird iterativ verfeinert.
> **Zweck:** Struktur für Season-3-Planung. Kern-Entscheidungen fixiert, Details werden pro Baustein separat geplant.
> **Referenz-Dokumente:** `PROJEKTBRIEFING.md` (Backend-Migration), `CLAUDE.md` (Overview), `Konzept_Skalierung_v1.html` (Multi-School-Vision).

---

## 1. Kontext & Vision

Season 3 ist die dritte Kohorten-Season der Lernwelt und bricht mit dem bisherigen individuellen Sammel-Modell: **Der Kurs (Cluster) sammelt gemeinsam** eine neue Ressource und schaltet damit als Team ein Legendary-Monster + dessen exklusives Trainingsspiel frei.

**Warum kooperativ statt kompetitiv?**
- Erzeugt Klassen-Gefühl, motiviert langsame Mitschüler zu bleiben (sie tragen bei, statt abgehängt zu werden)
- Erklärt didaktisch schön: "gemeinsames Ziel = gemeinsames Ergebnis"
- Kompetition bleibt über Highscore-Board erhalten (neuer "Top-Sammler"-Reiter)

**Warum Legi hinter Team-Ziel?**
- Legi ist die dickste Belohnung — muss sich anfühlen wie ein Event, nicht wie normaler Grind
- Späte Freischaltung sorgt für Aufregung und Endgame-Push

---

## 2. Kern-Entscheidungen (fixiert)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Eine Ressource oder mehrere? | **Eine einzelne Cluster-Ressource** |
| 2 | Individueller Beitrag sichtbar? | **Ja privat** (jeder sieht seinen Beitrag) + **anonymer Kurs-Balken** + **neuer Highscore-Reiter "Top-Sammler dieses Kurses"** |
| 3 | Legi-Monster / Legi-Spiel sichtbar vor Unlock? | **Nein, taucht erst nach Freischaltung auf** — Vorfreude wird stattdessen über **Milestone-Goodies bei 25/50/75 %** aufgebaut |

---

## 3. Kollektiver Ressourcen-Pool

### Kernmechanik
- Neue Ressource: **Regenbogen-Bonbons** 🍬
- Jeder Cluster hat einen Pool-Zielwert (Admin-konfiguriert bei Cluster-Anlage)
- User verdienen Ressource durch Spielen — Anteil geht **automatisch in den Cluster-Pool** (nicht in individuelle Wallet)
- Alle Cluster-Mitglieder sehen: **eigenen Beitrag** (privat) + **Kurs-Gesamt-Fortschritt** (anonym als Bonbonglas)

### Drop-Regeln (geparkt für nächste Session)
- Aus welchen Spielen droppen Bonbons?
- Score-abhängig oder fest?
- Cap gegen Farming?

### Datenmodell (Skizze)
```sql
-- Neue Tabelle: cluster_pool (Ziel + aktueller Stand)
cluster_pool(
  cluster_id uuid PK REFERENCES clusters(id),
  target_amount int NOT NULL,        -- vom Admin gesetzt
  current_amount int DEFAULT 0,      -- laufender Stand
  legi_unlocked_at timestamptz NULL, -- gesetzt wenn target erreicht
  created_at, updated_at
)

-- Individuelle Beiträge (für "Top-Sammler"-Reiter + eigene Anzeige)
cluster_pool_contributions(
  user_id uuid,
  cluster_id uuid,
  amount int DEFAULT 0,
  PRIMARY KEY (user_id, cluster_id)
)

-- Milestone-Vergabe (Idempotenz, analog zu cluster_bonus_grants)
cluster_pool_milestone_grants(
  user_id uuid,
  cluster_id uuid,
  milestone int,  -- 25, 50, 75, 100
  granted_at timestamptz,
  PRIMARY KEY (user_id, cluster_id, milestone)
)
```

---

## 4. Milestone-Goodies (25 / 50 / 75 %) — **Mix aus kleinem Loot + visuellem Element**

**Zweck:** Vorfreude aufbauen, Motivations-Peaks während der Season, alle Mitglieder mitnehmen (auch die, die spät joinen — Milestones werden nachträglich ausgeschüttet).

### Reward-Skizze (Loot-Anteil, Details noch abstimmen)
| Meilenstein | Kleines Loot (Vorschlag) | Visuell |
|---|---|---|
| **25 %** | 1 Wachstums-Trank | Stufe 1 (offen) |
| **50 %** | 1 Wachstums-Booster + evtl. seltenes Ei | Stufe 2 (offen) |
| **75 %** | 1 mythisches Ei | Stufe 3 (offen) |
| **100 %** | **Rosa Einhorntiger + Trainer-Unlock** | Reveal-Cutscene |

**Anmerkung:** Loot bewusst nicht opulent — der Rosa Einhorntiger bei 100 % soll die zentrale Belohnung bleiben.

### Regeln
- Milestones werden **allen aktuellen Cluster-Mitgliedern** ausgeschüttet, sobald Pool sie erreicht
- Nachträgliche Mitglieder erhalten bereits erreichte Milestones bei Cluster-Beitritt (Idempotenz-Table sorgt dafür)
- Kein Downgrade bei Cluster-Wechsel — Rewards sind persistent

---

## 5. Legi-Freischaltung

- Trigger: `cluster_pool.current_amount >= target_amount` → RPC `unlock_cluster_legendary(cluster_id)`
- Effekt für alle Cluster-Mitglieder:
  - Legi-Monster (Stage 0 / Baby) wird im Hub sichtbar
  - Legi-Trainingsspiel wird im Hub freigeschaltet
  - Freischaltungs-Cutscene / Modal ("Euer Kurs hat es geschafft!")
- **Kein Zeitdruck:** Cluster hat kein Ablaufdatum (nur die Anmeldung ist zeitlich begrenzt). Team-Ziel kann in Ruhe erreicht werden.

---

## 6. Legi-Trainingsspiel — 5 Stages

### Kern-Design
- Exklusiv nach Legi-Freischaltung sichtbar
- **5 Stages** im Trainer, jede deutlich schwerer als die vorherige
- Stage-Clear → Growth-Stufe des Legi steigt

### Progressions-Mapping
| Ereignis | Legi-Wachstum | Sprite |
|---|---|---|
| Team-Event geschafft (Ziel erreicht) | Stage 0 (Baby) | `legi0.png` |
| Trainer-Stage 1 clear | Stage 1 | `legi1.png` |
| Trainer-Stage 2 clear | Stage 2 | `legi2.png` |
| Trainer-Stage 3 clear | Stage 3 | `legi3.png` |
| Trainer-Stage 4 clear | Stage 4 | `legi4.png` |
| Trainer-Stage 5 clear | Stage 5 (Vollendet) | `legi5.png` |

**Technischer Fit:** Passt sauber in das bestehende System (`CREATURE_IMAGES` mit 6 Stages 0–5, `GROWTH_THRESHOLDS = [0, 3, 7, 12, 21, 100]` in `GameHub/creatures.js:413`). Kein Umbau nötig.

### Spielmechanik (offen)
- Thema / Genre?
- Retry-Regeln, Cool-down?
- Empfehlung: keine Stage-Skips (linear für Dramaturgie)

---

## 7. Neue Spiele (4 + Legi-Trainer)

### Slot-Übersicht Season 3
| # | Slot | Genre | Status |
|---|---|---|---|
| 1 | **Social Media Tycoon** | Simulation / Aufbau | **In Entwicklung** (Sönke baut aktuell) |
| 2 | **Dark Pattern Finder** | Spotter / Analyse | Konzept skizziert |
| 3 | **KI & Social-Media-Quiz** | Wissens-Quiz | Konzept skizziert |
| 4 | **Doodle-Jump-Clone (JFF)** | Arcade / Skill | Konzept skizziert |
| 5 | **Legi-Trainer** (5 Stages) | tbd | s. §6, freigeschaltet nach Team-Ziel |

### Spiel 1 — Social Media Tycoon
- **Genre:** Simulation/Aufbau
- **Status:** Sönke baut es aktuell — Details / Repo-Ort noch zu ergänzen
- **Didaktischer Anker:** Perspektivwechsel — man ist der Plattform-Betreiber, sieht die Anreize hinter Metriken (Likes, Reichweite, Engagement), erlebt Dark Patterns als Design-Entscheidung
- **Offen:** Aktueller Stand, Mechanik-Details, wie Bonbons droppen

### Spiel 2 — Dark Pattern Finder
- **Genre:** Spotter/Analyse (Screenshot markieren, echte Feeds analysieren)
- **Konzept-Kern:** Manipulations-Tricks erkennen (Endless-Scroll, Rot-Punkt-Notification, Streak-Zwang, Fake-Urgency, Bait&Switch, Confirm-Shaming)
- **Offen:** Vergleichs-Modus präzisieren (zwischen echten Apps? Zwischen Screenshots?)

### Spiel 3 — KI & Social-Media-Quiz
- **Genre:** Quiz
- **Themen:** KI-Auswirkungen (Bias, Halluzinationen, Jobs, Kunst-Debatte) + Social-Media-Zahlen und -Fakten (Nutzungsdauer, Reichweite, Alter, Auswirkungen auf mentale Gesundheit)
- **Vorlage:** `GameHub/S1 DateiformatQuiz/index.html`
- **Offen:** Fragen-Pool (evtl. mit Quellen-Angabe für didaktische Nachvollziehbarkeit)

### Spiel 4 — Doodle-Jump-Clone (Just For Fun / Highscore-Race)
- **Genre:** Arcade / Endless-Skill
- **Rolle:** Reines Fun-Spiel, kein didaktischer Anker — dient als **Bonbon-Grinder** und Kontrast-Programm zum ernsten Kern
- **Wichtig:** Muss trotzdem Bonbons droppen — sonst kein Beitrag zum Team-Ziel
- **Offen:** Season-3-Optik (Rosa Einhorntiger als Charakter? Bonbons als Plattformen?)

### Technische Vorlage
- Kopiere Struktur von `GameHub/S1 DateiformatQuiz/index.html` (single-file Muster für Quiz)
- Registrieren in `GAMES_CONFIG` (`GameHub/script.js`) mit `season: 3`
- Password/Lock via `GAME_ACCESS` in `GameHub/config.js`
- Bonbon-Drop pro Runde über neue RPC (nicht `submit_game_result` erweitern, sondern parallel — sauber getrennt)

---

## 8. Neue Monster (Season 3)

### Bedarf
- **~6 Baby-Monster** für die Season-3-Slots (analog zu Season 1/2 Cluster-Starthilfe)
  - Rarity-Verteilung wie gehabt: 85 % Normal / 10 % Rare / 5 % Epic (Legendary ausgeschlossen — das ist der Team-Reward)
- **1 Legendary (Legi): "Rosa Einhorntiger"** — abgefahren, verrückt, bunt. 6 Growth-Stufen (0–5), Stage 0 = Baby-Rosa-Einhorntiger.

### Design-Prinzip Season 3
- **Didaktischer Ernst lebt in den 4 Grundspielen** (Social-Media/KI-Aufklärung)
- **Der Legi ist die verspielte Fantasy-Trophäe** — steht bewusst im Kontrast zum ernsten Thema. Belohnung für gemeinsame Arbeit = etwas Verrücktes, Freudiges. Keine Themen-Predigt beim Legi.

### Sprite-ToDo
- PNG-Sprites im Format `GameHub/data/<name><stage>.png` (analog zu bisherigen Kreaturen)
- Sprite-Mapping in `CREATURE_IMAGES` (`GameHub/creatures.js:718`)
- Legi-Sprites: 6 Stufen Einhorntiger-Evolution (Baby → majestätische Regenbogen-Endform)

### Naming
- Namensschema der 6 Baby-Monster: passt eher zum Social-Media/KI-Thema (z.B. "Bit", "Meme", "Reel", "Prompt", "Feed") oder auch bunt-verrückt wie der Legi? Zu entscheiden.
- **Legi-Name fixiert: "Rosa Einhorntiger"**

---

## 9. Neue Items & Shop-Erweiterung

### Kandidaten
- **Season-3-exklusives Ei** (für Milestone-Reward)
- **Legi-Trainings-Booster?** (macht Trainingsspiel-Stage-Retry billiger)
- **Cluster-Beitrags-Booster?** (temporär höherer Drop-Anteil in den Pool)
- **Season-3-Avatar-Items** (Badges/Rahmen für "Kurs hat es geschafft"-Träger)

### Umgesetzt
- **🃏 Joker für gemeinsam gewinnen** (Migration 0047, 2026-07-20) — 500 Coins, S3-Coin-Tab. Max 2 pro Cluster. Jeder gekaufte Joker senkt die Anforderung des `win`-Tasks um 1 (statt 25/25 reichen 24/25 bzw. 23/25). Kein Monster wird festgelegt; Server prüft `count(has_max) >= 25 − cluster_jokers`. Kauf ist gesperrt, sobald Cluster die (angepasste) Anforderung erfüllt hat. Käufer werden im Win-Flow unter dem Erklärungstext namentlich genannt („🃏 Anna hat einen Joker gekauft"), Counter zeigt `(-1)` / `(-2)` in Gold/Amber `#f4b400`.

### Coin-Sink nach Legi-Freischaltung
- Was tun mit überschüssigen Ressourcen, wenn Ziel schon erreicht ist?
- Empfehlung: **Ressourcen-Drop stoppt automatisch nach Team-Ziel-Erreichung**, User farmen weiter Coins für persönliche Sammlung

---

## 10. UI / UX & Season-3-Theme

### 10.1 Landing Page (`index.html` Root) — **später**
- Landing-Page braucht ohnehin Anpassungen (separates Thema, wird nachgezogen)
- Season-3-Ankündigung dort noch offen — wird zusammen mit dem Landing-Redesign entschieden

### 10.1b Hub-Öffnungs-Banner (`GameHub/index.html`) — **FIXIERT**
- **`s3Modal` analog zu `s2Modal`** (`GameHub/index.html:110-163` als Vorlage)
- Einmalig aufklappendes Modal beim Öffnen des Hubs (sessionStorage-Gate wie S2)
- Inhalt: "Season 3 ist da! Sammelt gemeinsam Regenbogen-Bonbons und schaltet den Rosa Einhorntiger frei" + Bonbon-Icon + Kurz-Beschreibung des Team-Ziels
- Zeigt sich nur wenn User in einem Season-3-Cluster ist

### 10.2 Hub-Header (`GameHub/index.html`)
- **Persistentes Klassen-Bonbonglas** — neu einzufügen im HUD (nach `.hud-coins`)
- Zeigt: Bonbonglas-Icon, das sich schrittweise mit bunten Bonbons füllt (z.B. `[🍬🍬🍬🍬🍬🍬░░░░ 63 %]` oder eigenes SVG-Glas)
- Tooltip: eigener Beitrag ("Du hast 42 Bonbons beigetragen")
- Klick öffnet Modal mit Details (Milestones, wo stehen wir, wann kommt der nächste)
- **Anonyme Anzeige** — kein Ranking im Hauptbalken

### 10.3 Season-3-Skin — **Mittelweg**
- Neue Body-Klasse `.s3-active` (analog zu bestehender `.s2-active` in `GameHub/style.css:53`)
- Intensität: sichtbar aber nicht überwältigend (vergleichbar mit `.s2-active`-Level)
- Farbpalette-Overrides via CSS-Variablen (bunter, ohne kindisch zu werden)
- Bonbonglas als deutliches HUD-Element (siehe §10.2)
- 1-2 animierte Akzentelemente (z.B. Sprinkles-Partikel), nicht das ganze UI voll

### 10.4 Highscore-Menü (`highscores.html`)
- Neuer Board-Eintrag in `HUB_BOARDS` (bei `highscores.html:409`): `{ key: 'clusterPool', label: 'Top-Sammler', icon: '🏆', kind: 'hub', formatter: fmtClusterPool }`
- Formatter zeigt Rang + kumulative Beiträge zum Kurs-Pool
- Neue RPC nötig: `get_cluster_pool_leaderboard(cluster_id)` — nur eigener Cluster sichtbar

### 10.5 Legi-Reveal-Moment
- Sobald Ziel erreicht: Modal / Animation für alle Cluster-Mitglieder beim nächsten Hub-Besuch
- "Euer Kurs hat es geschafft! Das Legendary-Monster erwacht…"
- Ein-Zeit-Event via Flag in `shop_state` (analog zu `openedSealTypes` aus Migration 0027)

---

## 11. Admin-Panel Anpassungen

### 11.1 Cluster-Anlage / -Edit
- Erweitere die Bonus-Modal-Ansicht (`admin/app.js:403-510`, `wireClusterBonusModal`)
- Neues Feld: `cbPoolTarget` — Zielwert für Season-3-Pool (int, nur relevant wenn `season=3`)
- Validierung: Muss > 0 sein für Season-3-Cluster
- Default-Empfehlung als Placeholder

### 11.2 Cluster-Wechsel Season 2 → Season 3
- Empfehlung: Season-3-Pool ist neuer, additiver Zustand — alter Season-2-Bonus bleibt

### 11.3 Live-Monitoring
- Admin-View für laufende Cluster: Fortschritt in %, wer trägt am meisten bei, letzte Kontributionen
- Nice-to-have: Ziel im Nachhinein anpassen

---

## 12. Offene Fragen / Diskussionspunkte

### A. Ressourcen-Naming — **FIXIERT: Regenbogen-Bonbons** 🍬
UI-Metapher: Bonbonglas als Fortschrittsanzeige

### B. Ressourcen-Balancing — **offen**
- Wie viel droppt pro Spielrunde?
- Score-abhängig oder fest?
- Beispiel-Rechnung für Ziel-Kalibrierung: "Cluster mit 20 Mitgliedern, wie viele Sessions bis Ziel? Empfehlung z.B. 2–4 Wochen realistischer Grind ohne Deadline-Druck"

### C. Zeitfenster & Cluster-Lebenszeit — **KLARGESTELLT**
- Cluster sind dauerhaft aktiv. `opens_at`/`closes_at` regeln nur den Anmelde-Zeitraum.
- Kein Zeitlimit für das Team-Ziel.
- Folge-Frage: Gibt es eine Ober-Grenze wie lange ein Cluster aktiv bleibt?

### D. Legi-Growth-Stages — **FIXIERT**
- 6 Bilder (Stages 0–5) wie Standard-Kreaturen. Baby = Team-Event, Stages 1–5 via 5 Trainer-Clears.

### E. Nachträglicher Cluster-Beitritt — **FIXIERT: alles rückwirkend**

### F. Cluster-übergreifende Sichtbarkeit — **FIXIERT: nur eigener Kurs**

### G. Season-3-Theme — **FIXIERT: Social Media + Auswirkungen von KI**

### H. Weitere Ideen von Sönke
> _hier reinschreiben, was noch aufpoppt_

### I. Milestone-Reveal — visuelles Element (offen)
- Bei jedem Milestone (25/50/75 %) soll neben dem kleinen Loot eine visuelle Enthüllung passieren.
- Ideen-Rahmen: Silhouette wird schärfer, Bonbon-Ei wackelt/leuchtet, Farbe wird intensiver, o.ä.

---

## 13. Technische Umsetzung — Migrations-Skizze

> Detail-Design pro Baustein kommt in separaten Plans. Hier nur Reihenfolge und Touchpoints.

### Neue Migrations (ab 0030)
| # | Inhalt |
|---|---|
| **0030** | `cluster_pool` + `cluster_pool_contributions` + `cluster_pool_milestone_grants` Tabellen inkl. RLS |
| **0031** | RPCs: `record_cluster_contribution(user_id, amount)`, `check_and_grant_milestones(cluster_id)`, `unlock_cluster_legendary(cluster_id)` |
| **0032** | Admin-Bonus-Config erweitern: `cluster_bonus.pool_target` Spalte + Update `apply_cluster_bonus` |
| **0033** | View `user_session` erweitern (Pool-Progress) oder neue View `user_cluster_pool_status` |
| **0034** | `get_cluster_pool_leaderboard(cluster_id)` RPC für Highscore-Reiter |

### Client-Änderungen
| Datei | Änderung |
|---|---|
| `session.js` | Pool-Status in Session-Objekt einfügen, `lernwelt:pool-changed` Event |
| `GameHub/creatures.js` | Pool-API (`getCurrentClusterPool()`, `contributeToPool(amount)`) |
| `GameHub/script.js` | HUD-Bonbonglas, Milestone-Reveal-Modal, Legi-Reveal-Modal, `s3Modal`, GAMES_CONFIG-Erweiterung |
| `GameHub/style.css` | `.s3-active` Skin, Bonbonglas-Styling |
| `GameHub/index.html` | HUD-Bonbonglas, `s3Modal`, Legi-Reveal-Modal |
| `GameHub/S3 Legi-Trainer/` (neu) | 5-Stage-Spiel, Sprite-Assets |
| `GameHub/S3 <Spiel1..4>/` (neu) | 4 neue Grundspiele |
| `admin/app.js` | Bonus-Modal um Pool-Target erweitern, Live-Monitoring-View |
| `highscores.html` | Neuer Board-Eintrag `clusterPool` + `fmtClusterPool` Formatter |
| `index.html` (Root) | Später — separater Landing-Redesign |
| `api/signup.js` | Pool-Init-Aufruf für neue Season-3-Cluster-Mitglieder |

### Muster-Wiederverwendung
- **Idempotente Grants:** Muster von `cluster_bonus_grants` (Migration 0020) für Milestones + Legi-Unlock übernehmen
- **RPC-Autorisierung:** `service_role` + `is_admin`-Checks wie in `apply_cluster_bonus`
- **shop_state Merges:** Muster von Migration 0027 (`openedSealTypes`) für "Legi-Reveal-schon-gesehen"-Flag

---

## 14. Roadmap / Meilensteine

### Phase A — Fundament (backend)
1. Migrations 0030–0033: Tabellen + Basis-RPCs + View-Erweiterung
2. Signup-Hook für Pool-Init
3. **Test:** Admin legt Season-3-Cluster mit Ziel an, User trägt via Test-Skript bei, Milestone triggert

### Phase B — Admin & Config
4. Admin-Modal um `pool_target` erweitern
5. Live-Monitoring-View

### Phase C — Frontend Basis
6. Session-Layer + Client-API
7. HUD-Bonbonglas
8. Milestone-Modals
9. Highscore-Reiter "Top-Sammler"
10. `s3Modal` (Hub-Öffnungs-Banner)

### Phase D — Content
11. Season-3-Theme (`.s3-active` Skin)
12. 6 Baby-Monster + Sprites
13. 4 neue Spiele (Konzept → Prototyp → Poliert)

### Phase E — Legi
14. Legi-Sprite (alle Growth-Stufen)
15. Legi-Trainingsspiel (5 Stages, Balancing)
16. Legi-Reveal-Cutscene

### Phase F — Polish & Test
17. End-to-End-Test mit Test-Cluster
18. Balancing-Runden
19. Season-3-Launch

**Empfehlung Start:** Phase A. Backend zuerst, damit Admin-Panel + Frontend gegen echte Tabellen arbeiten können.

---

## 15. Änderungsprotokoll

- **v0.1 (2026-07-14)** — Initial-Fassung nach Kern-Entscheidungen: 1 Ressource / privater Beitrag + anonymer Balken + Top-Sammler-Reiter / Legi + Trainer erst nach Unlock / Milestones bei 25/50/75 %.
- **v0.2 (2026-07-14, gleiche Session)** — Iteration mit Sönke, Entscheidungen fixiert:
  - Season-3-Thema: Social Media + Auswirkungen von KI (didaktisch in den Grundspielen)
  - Cluster-Lebenszeit: unbegrenzt, nur Anmelde-Zeitraum ist begrenzt
  - Ressource: Regenbogen-Bonbons 🍬 (Bonbonglas als Fortschrittsanzeige)
  - Legi: Rosa Einhorntiger, 6 Growth-Stufen, Baby = Team-Event-Reward, Stages 1–5 via 5 Trainer-Clears
  - Nachträglicher Beitritt: alles rückwirkend
  - Cluster-Vergleich: nur eigener Kurs sichtbar (Admin sieht alle)
  - Milestone-Style: Mix aus kleinem Loot + visuellem Element (Details offen)
  - Grundspiele: 1) Social Media Tycoon (in Entwicklung), 2) Dark Pattern Finder, 3) KI/Social-Media-Quiz, 4) Doodle-Jump-Clone (JFF)
  - Hub-Skin: Mittelweg-Level analog zu `.s2-active`
  - Hub-Öffnungs-Banner: `s3Modal` analog zu `s2Modal`
  - Landing-Page-Banner: geparkt (Landing braucht eigenes Redesign)
  - **Geparkte Themen für nächste Session:** Drop-Regeln, Ressourcen-Balancing (Numbers), Milestone-Reveal-Detail, Grundspiele-Details, Trainer-Genre, neue Items, Cluster-Lebensdauer-Ober-Grenze
