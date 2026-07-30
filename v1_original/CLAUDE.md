# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

**RT Strategie** is a new educational mini-game being developed for **Lernwelt**, a browser-based gamified learning platform. It will live as a standalone folder that integrates with the Lernwelt GameHub.

The hub project is located at: `../../GameHub v 1.0/` (relative to this folder — two levels up: this folder lives in `MPS TabletSchlung/´Spiele inProgress/RT Strategie/`, the hub in `MPS TabletSchlung/GameHub v 1.0/`).

## Running

No build process — pure HTML5/CSS3/vanilla JavaScript. Open `index.html` directly in a browser when it exists.

## Integration with Lernwelt Hub

**Status: currently DISCONNECTED.** The hub integration was intentionally removed during early development so the game can be built and tested standalone. The contract below documents what to wire up when the integration is reactivated — do not add it back without explicit request.

All games in Lernwelt follow the same contract:

**Required setup (top of game HTML before any game logic):**
```html
<script>window.CREATURE_IMAGE_BASE = '../../GameHub v 1.0/data/';</script>
<script src="../../GameHub v 1.0/creatures.js"></script>
```

**Required call at game completion:**
```javascript
saveGameData(gameId, {
  points: <correct answers>,   // integer
  maxPoints: <max possible>,   // integer, used to calculate growth
  roundsPlayed: 1
});
```

The `gameId` (e.g. `"game10"`) must match the entry added to `GAMES_CONFIG` in `../../GameHub v 1.0/script.js`. Add the game there to make it appear on the hub. RT Strategie uses `game15` by default (overridable via URL: `?id=gameX`).

## Hub Architecture Reference

The parent hub uses:
- **`creatures.js`** — creature type determination, growth calculation, localStorage persistence under key `lernwelt_v3`
- **`script.js`** — `GAMES_CONFIG` array drives hub rendering; add entry here to register the game
- **`data/`** — creature PNG images (`<creaturename>1.png` through `<creaturename>5.png` for growth stages)

Creature type is assigned at first completion based on score (0–10 scale); growth accumulates across sessions with a cap of 21 points (excess converts to coins).

## Technical Constraints

- No npm, no bundler, no framework — pure HTML5/CSS3/vanilla JS
- Must run on iPad in Safari (no ES2022+ features unsupported on iOS 15–17)
- **No ES Modules** — code opens via `file://`, which blocks ES-module imports in Chrome/Firefox. Use classic `<script>` tags loaded in dependency order with the `RT.*` namespace pattern instead.
- Content language: German
- Target audience: Students ages 10–14

## Project Architecture

The codebase is organized into small modules under a global `RT` namespace, loaded via classic `<script>` tags in `index.html`. Each module attaches itself to `window.RT` (e.g. `RT.bus`, `RT.state`, `RT.screens`).

## Phase Structure

| Code value | Name | Trigger | Screen file |
|---|---|---|---|
| `'garage'` | Garage-Phase | Start | `garageScreen.js` |
| `'campus'` | Campus-Phase | Erster Investor bei 1.000 Usern | `campusScreen.js` |
| `'expansion'` | **Expansionsphase** | Zweiter Investor bei 500.000 Usern — KI-Labor, Community Center | *(noch nicht gebaut)* |
| `'end'` | Ende | — | `endScreen.js` |

```
RT Strategie/
├── index.html                  Single entry; loads scripts in dependency order
├── css/
│   ├── tokens.css              Design tokens (colors, fonts, shadows, radii)
│   ├── base.css                Reset + typography + #app container
│   └── components.css          .rt-btn, .rt-card, .rt-modal, .rt-resources, .rt-top-nav
├── js/
│   ├── core/
│   │   ├── namespace.js        window.RT = {}
│   │   ├── bus.js              Pub/sub: RT.bus.on/off/emit
│   │   ├── state.js            RT.state.get/dispatch/subscribe (reducer pattern)
│   │   ├── screens.js          RT.screens.register/show/current
│   │   └── tick.js             RT.tick.advanceMonth → 'month:advance' event
│   ├── screens/
│   │   ├── garageScreen.js     Garage-Phase (Phase 0: Onboarding)
│   │   ├── campusScreen.js     Campus-Phase (erster Investor, Gebäude-Grid)
│   │   └── endScreen.js        Ende-Screen
│   └── main.js                 Bootstrap (waits for DOM, shows 'garage')
```

**Adding a new feature:**
- New screen → file in `js/screens/`, calls `RT.screens.register('id', { enter, exit })`, then add `<script>` tag to `index.html`
- New state field → extend `makeInitialState()` in `state.js` + add reducer case + dispatch from caller
- Cross-module communication → `RT.bus.emit('subsystem:action', payload)`; subscribers use `RT.bus.on(...)`. Never call other modules directly.

**State is single-source-of-truth.** Modules read via `RT.state.get()` (treat as read-only) and mutate ONLY via `RT.state.dispatch(action, payload)`. The reducer in `state.js` is the only place that writes to `state`.

The full game concept (phases 0–D, resources, buildings, tech tree, endings) lives in `grundkonzept.html`.
