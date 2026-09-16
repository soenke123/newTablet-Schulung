# Todo — Bubble Bounce

Stand: 2026-07-15. Reihenfolge nach Themen, nicht nach Priorität.

## 1. Post-Design subtiler & barrierefrei ✅ ERLEDIGT

### 1a. Farbcodierung ersetzen ✅
- Signal-Streifen: gut `#2563EB` (Blau), schlecht `#0E7490` (Petrol).
- Avatar-Kreis komplett entfernt — an dessen Stelle steht jetzt das Icon.
- Score-Floats: `+X` in `#1E40AF`, `-X` in `#155E75`, Bad-Partikel `#5EB8CC`.
- Verify-Häkchen bleibt, in neuem Blau `#2563EB`.
- Filterblasen-Screen (Chart-Linien, Chip-Farben, Coach-Card) mitgezogen.

### 1b. Emojis durch clean Icons ersetzen ✅
- Kategorie-Icons: filled Material Design Icons via **Iconify-CDN** (`api.iconify.design/mdi:…svg`).
- Preload wie das existierende Sprite-System (`render.js:preloadSprites`); lokales PNG (`assets/posts/<id>.png`) hat weiterhin Vorrang.
- Menü-Chips: Emoji-Reihen ersetzt durch Text-Labels ("Fakten · Quellen · Wissenschaft" / "Klickbait · Fake · Verschwörung") — unabhängig von externem Icon-Load.
- HUD-Buttons (📊 🔇 ⤒) bewusst NICHT ersetzt (nur Karten-Umfang).

### 1c. Karten-Layout (Follow-up nach visueller Prüfung) ✅
- Verify-Häkchen `✔` komplett entfernt (thematisch schief: verifizierter Account ≠ inhaltlich vertrauenswürdig).
- `@`-Prefix beim Rendern gestrippt (Daten in `categories.js` bleiben unangetastet).
- Karten breiter: `w = U*0.30` (vorher 0.24) — Namen jetzt komplett lesbar.
- Karten höher: `h = U*0.125` (vorher 0.11) — Platz für 2 klare Zeilen.
- Zeile 1: Handle groß, fett, volle Breite.  Zeile 2: Icon links (U*0.03) + Sample-Text.
- `genRow` bei Doppelreihen an neue Karten-Breite angepasst (kein Off-Screen mehr).

## 2. Schwierigkeit steigt langsam ✅ ERLEDIGT

### 2a. Grundtempo steigt über die Zeit ✅
- **Kamera-Sog**: `game.autoScroll` in `main.js`, rampt linear von 0 auf 40 px/s über die Zeit.
- Aufwärmzeit: **30 s** ohne Sog, dann Rampe über **240 s** (4 min) bis Vollgas.
- Wirkt auf `camY` UND `climb` (Score-Bonus für Überleben in späten Phasen).
- Berührt keine Wurfphysik → Reichweite von Reihe zu Reihe bleibt stabil.

### 2b. Akku-Mechanik ✅
- **State**: `game.battery` (0..100), start 100.
- **Drain**: 1.5 %/s passiv, **−1 %** zusätzlich pro Dash (via `player.state.dashJustUsed`-Flag).
- **Kugeln**: `state.orbs` in `platforms.js`. Spawn alle 5–10 s (uniform), oberhalb des sichtbaren Bereichs. Jede Kugel: **+25 %**.
- **Bei 0 %**: sofort Game Over.
- **HUD**: Batterie-Pille unter der Score-Pille, grün > 50 %, gelb 20–50 %, blinkt rot < 20 %.
- **Visuell**: Kugeln als leuchtender gelber Kreis mit Blitz-Icon (mdi:flash via Iconify).

### 2c. Realitätscheck (roter Balken) ✅
- **Name**: "Realitätscheck" (didaktisch ambivalent).
- **Physik**: Balken spawnt oberhalb des sichtbaren Bereichs, fällt mit **120 px/s**, **volle Breite**, **80 px** dick.
- **Interaktion**: Nur mit `dashGlow > 0` durchbrechbar. Ohne Dash bei Kontakt = Game Over.
- **Feedback beim Durchbrechen**: weiße Blitz-Partikel + Shake + Float-Text "DURCHBROCHEN!" + Balken verblasst.
- **Frequenz**: linear von 20–40 s (unter 2000 Pkt) auf 10–30 s (ab 5000 Pkt).
- **Akku-Interaktion**: Dash kostet weiter nur 1 % — kein Doppelmalus für den Durchbruch selbst.
- **Label auf dem Balken**: "REALITÄTSCHECK" zentriert, weiß fett auf pulsierendem Rot.
