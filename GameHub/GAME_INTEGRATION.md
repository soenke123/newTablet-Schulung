# Lernwelt – Game Integration Guide

Dieses Dokument beschreibt den **Standard-Integrationspfad** für neue Spiele in den GameHub.
Es enthält technische API-Referenz, visuelle Standards, bekannte Fehlerquellen und eine Checkliste.

---

## Inhaltsverzeichnis

1. [Schnellstart-Checkliste](#1-schnellstart-checkliste)
2. [creatures.js einbinden](#2-creaturesjs-einbinden)
3. [gameId & eggType aus URL lesen](#3-gameid--eggtype-aus-url-lesen)
4. [Spieldaten laden & speichern](#4-spieldaten-laden--speichern)
5. [Erster vs. wiederholter Durchlauf](#5-erster-vs-wiederholter-durchlauf)
6. [Vollendetes Monster → Coin-Bonus](#6-vollendetes-monster--coin-bonus)
7. [Score normalisieren](#7-score-normalisieren)
8. [Begleiter-Widget (Companion)](#8-begleiter-widget-companion)
9. [Standard-Winning-Screen](#9-standard-winning-screen)
10. [Buttons & Navigation](#10-buttons--navigation)
11. [Item-System](#11-item-system)
12. [Season Rare & Egg-Typen](#12-season-rare--egg-typen)
13. [Ei/Nest-Mechanik (Shop-Eier)](#13-einest-mechanik-shop-eier)
14. [Bekannte Fallstricke](#14-bekannte-fallstricke)
15. [Referenz: creatures.js API](#15-referenz-creaturesjs-api)

---

## 1. Schnellstart-Checkliste

```
[ ] CREATURE_IMAGE_BASE vor creatures.js setzen
[ ] creatures.js laden
[ ] gameId + eggType aus URL-Params lesen
[ ] getGameData(gameId) beim Start aufrufen
[ ] updateGameEggDisplay(gd, 0) beim Start aufrufen
[ ] Begleiter-Widget HTML (eggVisual, eggStageLabel, eggProgressFill) einfügen
[ ] Companion live in recalcScore() / nach jeder Runde aktualisieren
[ ] GAME_SEASON_RARE in creatures.js für neue gameId eintragen
[ ] Beim ersten Sieg: determineCreature() aufrufen und gd.growth = 0 setzen (KEIN growthBefore/coinsBefore-Rollback mehr — Runde 1 zahlt jetzt auch Coins)
[ ] Items (wachstumsBooster, coinsx3) IMMER nach computeRoundResult clearen — auch in Runde 1
[ ] computeRoundResult() nach jedem Sieg aufrufen (auch beim ersten) — mit rawScore und maxScore
[ ] saveGameData(gameId, gd) nach jedem Sieg
[ ] renderCoinBank(containerId, coinsGained) im Win-Screen — auch in Runde 1 (kein `isFirst ? 0 : coinsGained` mehr)
[ ] Win-Screen zweispaltig: links Game-Infos, rechts Hub-Infos
[ ] Item-Button (konditionell) via renderResultItemButton() aufrufen
[ ] "Zurück zum Hub": erst Reset, dann window.location.href → kein reiner <a href>
[ ] "Nochmal spielen": Reset-Funktion des Spiels aufrufen (nicht nur Modal schließen)
[ ] "Item nutzen": Item aktivieren + Reset (nicht zum Hub navigieren!)
[ ] Hub-Button oben links in der Hauptansicht
[ ] Ausgewachsen (growth ≥ 21): computeRoundResult gibt +5 Bonus. Vollendet (growth ≥ 100): +10.
[ ] renderBoostIndicators(containerId, gameId) IMMER mit gameId aufrufen, damit das Bonus-Badge angezeigt wird
```

---

## 2. creatures.js einbinden

**Immer in dieser Reihenfolge**, direkt vor `</head>`:

```html
<script>window.CREATURE_IMAGE_BASE = '../data/';</script>
<script src="../creatures.js"></script>
```

> **Warum?** `CREATURE_IMAGE_BASE` muss gesetzt sein, bevor creatures.js lädt,
> sonst verwendet es den falschen Standardpfad `'data/'` (nur für root-Level korrekt).

---

## 3. gameId & eggType aus URL lesen

```javascript
const gameId  = new URLSearchParams(window.location.search).get('id')  || 'gameX';
const eggType = new URLSearchParams(window.location.search).get('egg'); // null wenn kein Nest-Ei
```

`gameX` durch die echte Fallback-ID ersetzen (z.B. `'game14'`).
Der Hub hängt `?id=game14` an die URL an. Ohne Fallback funktioniert der Direkt-Aufruf nicht.

---

## 4. Spieldaten laden & speichern

### Laden (beim Start)

```javascript
let gd = getGameData(gameId);
// gd = { points, roundsPlayed, creature, growth, coins }
// creature ist null solange das Ei noch nicht geschlüpft ist
```

### Speichern (nach jedem Sieg)

```javascript
gd.points      += normalizedScore;  // kumulativ
gd.roundsPlayed += 1;
saveGameData(gameId, gd);
```

`computeRoundResult` und `determineCreature` schreiben direkt in `gd` —
danach einfach `saveGameData` aufrufen.

### State-Shape (localStorage `lernwelt_v3`)

```javascript
{
  points:       number,   // Gesamtpunkte aller Runden
  roundsPlayed: number,   // Anzahl abgeschlossener Runden
  creature:     string|null, // null = Ei noch nicht geschlüpft
  growth:       number,   // 0–21 normal, 100 = Ultimate-Stufe
  coins:        number    // kumulierte Münzen
}
```

---

## 5. Erster vs. wiederholter Durchlauf

Seit 2026-07-07: **auch die erste Runde vergibt Münzen und Wachstum** (Ei-Schlupf + normales
Wachstum in einem Rutsch). Nur der Kreaturtyp wird einmalig bestimmt.

```javascript
const isFirst = !gd.creature; // true = Ei schlüpft jetzt zum ersten Mal
const sd = loadShopData();
let coinsGained = 0;

if (isFirst) {
  // Kreaturtyp bestimmen (einmalig, nie überschreiben)
  if (eggType) {
    gd.creature = determineEggCreature(eggType, normalizedScore);
  } else {
    gd.creature = sd.glucksklee
      ? determineCreatureWithGlucksklee(normalizedScore, gameId)
      : determineCreature(normalizedScore, true, gameId);
    if (sd.glucksklee) { sd.glucksklee = false; saveShopData(sd); }
  }
  gd.growth = 0; // sauber initialisieren, damit computeRoundResult drauf aufsetzt
}

// Wachstum & Coins — auch in Runde 1
coinsGained = computeRoundResult(gd, rawScore, maxScore, sd);
if (sd.wachstumsBooster) { sd.wachstumsBooster = false; saveShopData(sd); }
if (sd.coinsx3)           { sd.coinsx3 = false;          saveShopData(sd); }

gd.points      += normalizedScore;
gd.roundsPlayed += 1;
saveGameData(gameId, gd);
```

> **Wichtig:** `computeRoundResult` modifiziert `gd.growth` und `gd.coins` direkt in-place.
> Für Runde 1 vorher `gd.growth = 0` setzen — dann verhält sich alles wie in Folgerunden.
>
> **Items immer clearen** — Booster/Coins×3 werden auch in Runde 1 verbraucht,
> da sie jetzt auf die Rundenergebnisse wirken.

---

## 6. Ausgewachsen / Vollendet → Coin-Bonus

Wenn ein Monster ausgewachsen ist (`gd.growth >= GROWTH_MAX`, d.h. `growth >= 21`),
wandelt `computeRoundResult` den gesamten Wachstumsbeitrag automatisch in Coins um.
Zusätzlich gibt es einen **Pauschal-Bonus pro Runde**, abhängig vom Zustand des Monsters:

| Monster-Zustand | Wachstum | Basis-Coins | Bonus (`getGrowthBonusCoins`) |
|---|---|---|---|
| `growth < 21` (Baby/Jungtier) | steigt | Basis (baseContribution) | 0 |
| `growth = 21` (ausgewachsen) | steht bei Max | volle Coins statt Growth | **+5 pro Runde** |
| `growth >= 100` (vollendet, nach Stein) | steht bei Max | volle Coins statt Growth | **+10 pro Runde** |

Perfekter Score (`correct === maxPoints`) gibt zusätzlich **+3 Coins** — kumulativ mit dem Bonus oben.

**Das Spiel muss nichts tun** — `computeRoundResult` erkennt den Zustand selbst und
addiert die Boni. Der shared Helper `getGrowthBonusCoins(growth)` gibt den Bonus-Wert
zurück und wird sowohl in `computeRoundResult` als auch in `renderBoostIndicators`
verwendet.

### Sichtbarer Hinweis während des Spiels

`renderBoostIndicators(containerId, gameId)` zeigt automatisch ein goldenes
`+5 🪙` / `+10 🪙` Badge in der Boost-Bar an, sobald das Monster ausgewachsen bzw.
vollendet ist. Voraussetzung: `gameId` als zweiter Parameter übergeben. Ohne `gameId`
wird nur die klassische Booster-Anzeige gerendert (keine Bonus-Vorschau).

```javascript
// Empfohlener Aufruf in jedem Spiel:
renderBoostIndicators('boostBar', GAME_ID);
```

---

## 7. Score normalisieren

Alle Funktionen erwarten einen Score im Bereich **0–10** (entspricht 0–10 richtigen Antworten):

```javascript
// Wenn das Spiel 0–100 Punkte hat:
const normalizedScore = Math.round(Math.min(rawScore, 100) / 10);

// Wenn das Spiel einen anderen Max-Wert hat:
const normalizedScore = Math.round(rawScore / MAX_SCORE * 10);

// computeRoundResult akzeptiert auch anderen Max-Wert direkt:
computeRoundResult(gd, rawScore, MAX_SCORE, sd); // intern wird normalisiert
```

---

## 8. Begleiter-Widget (Companion)

### Pflicht-HTML-IDs

Diese drei IDs werden von `updateGameEggDisplay()` erwartet:

```html
<div id="eggVisual"></div>        <!-- Ei-SVG oder Kreatur-Bild -->
<div id="eggStageLabel"></div>    <!-- Textlabel: "Ei schlummert…" / "Stufe 2" -->
<div style="height:4px;background:#333;border-radius:2px;">
  <div id="eggProgressFill"></div> <!-- Wachstumsbalken -->
</div>
```

### Empfohlenes Widget-Layout (fixed, bottom-right)

```html
<div id="companion-widget">
  <div id="eggVisual"></div>
  <div id="companion-item-icon"></div>  <!-- Item-Badge (optional) -->
  <div id="eggStageLabel"></div>
  <div style="height:4px;background:#333;border-radius:2px;margin-top:4px;">
    <div id="eggProgressFill"></div>
  </div>
</div>
```

```css
#companion-widget {
  position: fixed; bottom: 1rem; right: 1rem; z-index: 500;
  background: rgba(0,0,0,.82); border: 1px solid #555; border-radius: 14px;
  padding: .75rem 1rem; width: 130px; text-align: center;
  font-size: .75rem; color: #ccc; pointer-events: none;
}
#companion-widget #eggVisual { min-height: 90px; display: flex; align-items: center; justify-content: center; }
#companion-widget #eggVisual img,
#companion-widget #eggVisual svg { width: 88px; height: 88px; object-fit: contain; }
#companion-widget #eggProgressFill { height: 100%; background: #3b82f6; border-radius: 2px; width: 0%; transition: width .4s; }

/* Item-Badge (optional) */
#companion-item-icon {
  display: none; position: absolute; top: 6px; right: 6px;
  font-size: 1.2rem; line-height: 1;
}
#companion-item-icon.active { display: block; animation: itemPulse 1.8s ease-in-out infinite; }
@keyframes itemPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
```

### Initialisierung & Live-Update

```javascript
// Beim Start:
updateGameEggDisplay(gd, 0);

// Live: in die Score-Recalc-Funktion einhängen:
function recalcScore() {
  // ... eigene Logik ...
  updateCompanion();
}

function updateCompanion() {
  if (!gd) return;
  let crack = 0;
  if (gd.creature) {
    crack = 4;
  } else if (phase2Done) {        // an Spiellogik anpassen
    crack = 3;
  } else {
    crack = Math.min(3, Math.floor(score / maxScore * 4));
  }

  // Live-Wachstumsvorschau: zeigt schon während des Spielens an, wie weit das Tier
  // nach diesem Durchgang gewachsen sein wird (nur wenn Kreatur bereits geschlüpft).
  let liveGrowth = null;
  if (gd.creature) {
    const sd = loadShopData();
    let contrib = computeSessionGrowth(currentScore, maxScore); // aktuellen Score übergeben
    if (sd.wachstumsBooster) contrib *= 2;
    liveGrowth = Math.min(gd.growth + contrib, 21);
  }
  updateGameEggDisplay(gd, crack, false, liveGrowth);

  // Item-Badge
  const sd = loadShopData();
  const icon = sd.wachstumsBooster ? '⚡' : sd.coinsx3 ? '🎰' : sd.glucksklee ? '🍀' : null;
  const el = document.getElementById('companion-item-icon');
  if (el) { el.textContent = icon ?? ''; el.classList.toggle('active', !!icon); }
}
```

---

## 9. Standard-Winning-Screen

### Layout: zwei Spalten

```
┌──────────────────────────────────────────────────┐
│  LINKE SPALTE (Game-Infos)  │  RECHTE SPALTE (Hub) │
│  • Spiel-Bild / Icon        │  • Kreatur-Bild       │
│  • Titel                    │  • Kreatur-Name/Stufe │
│  • Untertitel               │  • Coin-Animation     │
│  • Score-Rows (animiert)    │  • Item-Button (opt.) │
│                             │  • Nochmal spielen    │
│                             │  • Item nutzen (opt.) │
│                             │  • ← Zurück zum Hub   │
└──────────────────────────────────────────────────┘
```

### Standard-CSS (win-card zweispaltig)

```css
.win-card {
  display: flex; flex-direction: row;
  max-width: 680px; width: 92%; max-height: 92vh;
  border-radius: 22px; overflow: hidden;
}
.win-col-game {
  flex: 1.2; padding: 32px 28px; text-align: center;
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.win-col-hub {
  flex: 1; padding: 28px 20px;
  border-left: 1px solid var(--border);
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.win-btns { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: auto; }
.win-btns .btn { width: 100%; text-align: center; }
@media (max-width: 540px) {
  .win-card { flex-direction: column; }
  .win-col-hub { border-left: none; border-top: 1px solid var(--border); }
}
```

### Standard-HTML (rechte Spalte)

```html
<div class="win-col-hub">
  <div id="win-creature" style="min-height:120px;display:flex;align-items:center;justify-content:center;"></div>
  <div id="win-creature-label" style="font-size:.75rem;color:var(--muted);text-align:center;"></div>
  <div id="win-coins"></div>
  <div class="win-btns">
    <button class="btn btn-primary"   onclick="restartGame()">🔄 Nochmal spielen</button>
    <button class="btn btn-secondary" id="win-item-btn" style="display:none" onclick="useItemAndClose()"></button>
    <button class="btn btn-secondary" onclick="resetAndGoHub()">← Zurück zum Hub</button>
  </div>
</div>
```

### Kreatur im Win-Screen rendern

```javascript
// NICHT manuell: `../data/${creature}${stage}.png` bauen → falsche Dateinamen!
// IMMER: getCreatureHTML() verwenden
const stage = getGrowthStage(gd.growth);
document.getElementById('win-creature').innerHTML =
  gd.creature ? getCreatureHTML(gd.creature, stage) : '';

// CSS für Größe im Win-Screen:
// #win-creature .creature-img, #win-creature img { width: 110px; height: 110px; object-fit: contain; }
```

### Kreatur-Label + Coin-Animation

```javascript
function populateWinHub() {
  // Coin-Animation
  renderCoinBank('win-coins', coinsGained);

  // Kreatur-Label
  const stage = getGrowthStage(gd.growth);
  const stageName = ['Ei','Stufe 1','Stufe 2','Stufe 3','Stufe 4','Stufe 5'][stage] ?? '';
  const lbl = document.getElementById('win-creature-label');
  if (lbl && gd.creature) lbl.textContent = (CREATURE_NAMES?.[gd.creature] ?? '') + ' – ' + stageName;

  // Item-Button befüllen
  const sd   = loadShopData();
  const item = getActiveItemForSlot(gd, sd);
  const btn  = document.getElementById('win-item-btn');
  if (btn) {
    btn.style.display = item ? '' : 'none';
    if (item) btn.innerHTML = item.icon + ' ' + item.name + ' nutzen';
  }
}
```

---

## 10. Buttons & Navigation

### "Nochmal spielen"

Ruft die **spielinterne Reset-Funktion** auf — nicht nur das Modal schließen:

```javascript
function restartGame() {
  closeWinModal();
  resetGameState(); // spieleigene Funktion: Scores, Timer, etc. zurücksetzen
}
```

### "Item nutzen"

Nicht manuell implementieren — `renderResultItemButton()` aus creatures.js übernimmt das:
- Oranges Design (`.btn-use-item`), Text `"nutze ⚡"` / `"nutze 🍀"` etc.
- Erscheint nur wenn passendes Item im Inventar
- Aktiviert Item in shopData, dekrementiert Count
- Ruft `onActivate`-Callback auf → **Spiel neu starten**, nicht zum Hub navigieren

```javascript
// Im Win-Screen (nach saveGameData):
renderResultItemButton('win-item-btn-wrap', gameId, () => {
  document.getElementById('win-overlay').classList.remove('active');
  stopConfetti?.();
  resetGameState(); // spieleigene Reset-Funktion
});
```

```html
<!-- HTML: nur leerer Container, creatures.js rendert den Button rein -->
<div id="win-item-btn-wrap"></div>
```

### "Zurück zum Hub"

**Niemals** als reiner `<a href>` Link — immer erst das Spiel zurücksetzen:

```javascript
function resetAndGoHub() {
  resetGameState(); // spieleigene Reset-Funktion
  window.location.href = '../index.html';
}
```

> **Warum?** Ohne Reset öffnet das Spiel beim nächsten Mal mit dem alten Zustand
> (Phase 3 aktiv, Highscore-Screen usw.).

### Hub-Button in der Hauptansicht (oben links)

```html
<!-- Im Haupt-Screen, z.B. im Header: -->
<button onclick="resetAndGoHub()" class="btn btn-secondary"
  style="position:absolute; top:1rem; left:1rem; font-size:.8rem; padding:.4rem .9rem; z-index:10;">
  ← Hub
</button>
```

CSS im `.header`-Div oder Wrapper: `position: relative;`

---

## 11. Item-System

### Welches Item wird für welchen Slot angezeigt?

`getActiveItemForSlot(gd, sd)` gibt zurück:

| Zustand | Item | Icon |
|---------|------|------|
| `gd.creature === null` (Ei) | Glücksklee | 🍀 |
| `gd.growth >= GROWTH_MAX` (voll) | Coins ×3 | 🎰 |
| wächst noch | Wachstums-Booster | ⚡ |

Gibt `null` zurück wenn kein passendes Item im Inventar.

### Aktive Items prüfen (für Item-Badge im Companion)

```javascript
const sd = loadShopData();
// Aktive Flags (werden nach Verwendung auf false gesetzt):
sd.wachstumsBooster  // ⚡ — 2× Wachstum im nächsten computeRoundResult
sd.coinsx3           // 🎰 — 3× Coins im nächsten computeRoundResult
sd.glucksklee        // 🍀 — Epic-Chance erhöht bei nächstem determineCreature
```

### Items nach Verwendung verbrauchen

```javascript
// In computeRoundResult werden Booster automatisch NICHT verbraucht!
// Das Spiel muss das manuell tun:
if (sd.wachstumsBooster) { sd.wachstumsBooster = false; saveShopData(sd); }
if (sd.coinsx3)           { sd.coinsx3 = false;          saveShopData(sd); }
if (sd.glucksklee)        { sd.glucksklee = false;        saveShopData(sd); }
```

---

## 12. Season Rare & Egg-Typen

### Season-Rare-Zuordnung (in creatures.js, `GAME_SEASON_RARE`)

```javascript
const GAME_SEASON_RARE = {
  game1: ['biene','oktopus'], game3: ['biene','oktopus'], game7: ['biene','oktopus'], game8: ['biene','oktopus'],
  game5: ['biene','oktopus'], game9: ['biene','oktopus'], game10: ['biene','oktopus'], game11: ['biene','oktopus'],  // S1
  game6: ['ente'], game12: ['ente'], game15: ['ente'], game14: ['ente'],  // S2
};
```

**8 % Drop-Chance** — automatisch in `determineCreature(score, isFirst, gameId)` eingebaut. In Season 1 wird zufällig zwischen Biene und Oktopus gewählt.
Für neue Spiele: gameId hier eintragen (als Array mit den möglichen Rares der Season), dann passiert der Rest automatisch.

### Score → Kreaturtyp-Mapping

`determineCreature(correct, isFirst, gameId)` verwendet `correct` als Wert 0–10:

| correct | Kreatur (ohne Zufall) |
|---------|-----------------------|
| 0–2 | Schnecke / Frosch (S2 50%) |
| 3–4 | Fisch / Frosch oder Pinguin (S2) |
| 5–6 | Huhn / Pinguin (S2 50%) |
| 7 | Salamander / Raptor (S2 50%) |
| 8 | Falkeneule / Raptor |
| 9 | Triceratops / Raptor |
| 10 | Drache |
| jederzeit | Season Rare (8 %), Epics (2–5 %), Schneckendrache (2–5 %) |

---

## 13. Ei/Nest-Mechanik (Shop-Eier)

Wenn ein Schüler im Hub ein Ei kauft und an ein Spiel hängt, kommt der Aufruf mit:

```
SpielURL/index.html?id=nest_abc123&egg=rare
```

Das Spiel muss dann `getGameData('nest_abc123')` statt `getGameData('game7')` nutzen.
`eggType` (`'rare'`, `'mythic'`, `'legendary'`, `'atari'`, `'s3'`, …) bestimmt die Drop-Chancen.

```javascript
const gameId  = new URLSearchParams(window.location.search).get('id') || 'gameX';
const eggType = new URLSearchParams(window.location.search).get('egg');

let gd = getGameData(gameId); // funktioniert für beide Fälle (normal + Nest)

// Beim ersten Sieg:
if (!gd.creature) {
  gd.creature = eggType
    ? determineEggCreature(eggType, normalizedScore)
    : determineCreature(normalizedScore, true, gameId);
}
```

---

## 14. Bekannte Fallstricke

### ❌ Kreatur-Bild manuell bauen

```javascript
// FALSCH — Dateinamen stimmen nicht mit creature-Keys überein:
`../data/${gd.creature}${stage}.png`
// z.B. creature='snail', stage=0 → 'snail0.png' existiert nicht
// Richtig wäre: 'Schnecke1.png'

// RICHTIG:
getCreatureHTML(gd.creature, stage)
// Verwendet CREATURE_IMAGES-Lookup: snail → ['Schnecke1','Schnecke2',...]
// stage ist 0-indexed (0 = erste Stufe = Bild 1)
```

### ❌ `gd.growth` beim ersten Schlupf nicht auf 0 setzen

Seit 2026-07-07 zahlt auch Runde 1 Wachstum + Coins. Wenn `gd.growth` beim ersten
Schlupf nicht sauber auf 0 initialisiert wird, addiert `computeRoundResult` die
Contribution auf einen alten oder undefinierten Wert — Ergebnisse werden inkonsistent.

```javascript
// FALSCH — gd.growth kann undefined oder ein alter Wert sein:
gd.creature = determineCreature(...);
const coins = computeRoundResult(gd, score, maxScore, sd);
saveGameData(gameId, gd);

// RICHTIG — gd.growth explizit auf 0 setzen vor computeRoundResult:
gd.creature = determineCreature(...);
gd.growth   = 0;
const coins = computeRoundResult(gd, score, maxScore, sd); // wächst sauber ab 0
saveGameData(gameId, gd);
```

**Nicht mehr benötigt:** growthBefore/coinsBefore-Rollback. Wer alten Code
migriert, entfernt beides und lässt `computeRoundResult` seinen Wert direkt schreiben.

### ❌ "Zurück zum Hub" als reiner Link

```html
<!-- FALSCH — Spiel bleibt im alten Zustand: -->
<a href="../index.html">← Zurück zum Hub</a>

<!-- RICHTIG — erst Reset, dann navigieren: -->
<button onclick="resetAndGoHub()">← Zurück zum Hub</button>
```

### ❌ "Item nutzen" schließt nur das Modal

```javascript
// FALSCH — Spiel läuft mit Item weiter ohne Neustart:
function useItem() {
  activateItem();
  closeModal(); // student spielt einfach weiter
}

// RICHTIG — Item aktivieren + Spiel zurücksetzen:
function useItem() {
  activateItem();
  closeModal();
  resetGameState(); // Neustart mit aktivem Item
}
```

### ❌ Companion nur bei Win-Screens aktualisieren

```javascript
// FALSCH — Ei/Kreatur zeigt keinen Fortschritt während des Spielens:
function onWin() { updateGameEggDisplay(gd, 4); }

// RICHTIG — auch nach jeder Runde aktualisieren:
function recalcScore() {
  // ... Punkte neu berechnen ...
  updateCompanion(); // ← hier einhängen
}
```

### ❌ CREATURE_IMAGE_BASE nach creatures.js setzen

```html
<!-- FALSCH — zu spät, creatures.js hat bereits den Standardpfad benutzt: -->
<script src="../creatures.js"></script>
<script>window.CREATURE_IMAGE_BASE = '../data/';</script>

<!-- RICHTIG: -->
<script>window.CREATURE_IMAGE_BASE = '../data/';</script>
<script src="../creatures.js"></script>
```

### ❌ getGrowthStage ist 0-indexed

```javascript
getGrowthStage(0)  // → 0  (Stage 0 = erstes Bild = creature1.png via CREATURE_IMAGES[0])
getGrowthStage(3)  // → 1  (Stage 1 = zweites Bild)
getGrowthStage(21) // → 4  (Stage 4 = fünftes Bild)
// Stages 0–5, NICHT 1–5
```

---

## 15. Referenz: creatures.js API

### Laden & Speichern

| Funktion | Beschreibung |
|----------|-------------|
| `getGameData(gameId)` | Lädt `lernwelt_v3[gameId]` oder `defaultGameData()` |
| `saveGameData(gameId, gd)` | Speichert `gd` nach `lernwelt_v3[gameId]` |
| `loadShopData()` | Shop-Daten (Items, Nester, Coins) |
| `saveShopData(sd)` | Shop-Daten speichern |

### Kreatur-Logik

| Funktion | Beschreibung |
|----------|-------------|
| `determineCreature(correct, isFirst, gameId)` | Score 0–10 → Kreaturtyp inkl. Season Rare |
| `determineCreatureWithGlucksklee(correct, gameId)` | Wie oben, aber mit erhöhter Epic-Chance |
| `determineEggCreature(eggType, correct)` | Für Shop-Eier (rare/mythic/legendary) |
| `getActiveItemForSlot(gd, sd)` | Welches Item ist für diesen Slot sinnvoll? |

### Wachstum & Coins

| Funktion | Beschreibung |
|----------|-------------|
| `computeRoundResult(gd, correct, maxPoints, sd)` | Berechnet Growth + Coins, schreibt in `gd`, gibt coinsGained zurück |
| `getGrowthStage(growth)` | growth → Stage 0–5 (0-indexed) |
| `GROWTH_THRESHOLDS` | `[0, 3, 7, 12, 21, 100]` — Stage-Grenzen |
| `GROWTH_MAX` | `21` — normales Maximum |
| `GROWTH_S6` | `100` — Ultimate-Stufe |

### Anzeige

| Funktion | Beschreibung |
|----------|-------------|
| `updateGameEggDisplay(gd, crackStage, doShake, liveGrowth)` | Aktualisiert `#eggVisual`, `#eggStageLabel`, `#eggProgressFill` |
| `getCreatureHTML(creature, stage)` | Gibt fertiges `<img>` (+ Rarity-Frame) zurück |
| `renderCoinBank(containerId, coinsGained)` | Coin-Animations-Widget |
| `triggerCreatureLevelUp(isFinal, elementId)` | Level-Up-Animation |
| `CREATURE_NAMES` | `{ snail:'Schnecke', fish:'Fisch', ... }` — Anzeigenamen |
| `CREATURE_IMAGES` | `{ snail:['Schnecke1','Schnecke2',...], ... }` — Dateinamen 0-indexed |

### Rarity-Checks

| Funktion | Beschreibung |
|----------|-------------|
| `isRare(creature)` | biene / oktopus / ente |
| `isEpic(creature)` | snaildragon / butterfly / turtle / chamaeleon |
| `isLegendary(creature)` | robot / pfau / chinDrache / schnabeltier |
