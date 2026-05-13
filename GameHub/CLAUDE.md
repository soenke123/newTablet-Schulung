# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lernwelt** is a browser-based gamified learning platform. Students earn points playing educational mini-games and collect virtual creatures that hatch and grow based on their scores. Content is in German.

## Running the Project

No build process — open `index.html` directly in a browser. There are no dependencies, no npm, no compilation.

## Architecture

Each game lives in its own folder. Shared creature/egg/storage logic is in `creatures.js` at the root.

```
index.html              → Hub: game selection grid + creature gallery
script.js               → Hub-only: GAMES_CONFIG, renderHub, gallery, modal
creatures.js            → Shared: creature images, egg SVGs, localStorage read/write
style.css               → Hub styling (warm fantasy/adventure theme, CSS variables)
data/                   → Creature images (e.g. drache1-5.png, huhn1-5.png)
ZahlenVergleich/        → Zahlenduell game
DateiformatQuiz/        → Datenformat-Quiz game
Finde Grün/             → Finde Grün game
```

### Data Flow

1. `index.html` calls `renderHub()` → reads localStorage, renders game cards with current creature state
2. Clicking "Spielen" opens the game's own `index.html`
3. Game runs its rounds, then calls `saveGameData(gameId, data)` from `creatures.js`
4. Player returns to hub to see updated creature

### Adding a New Game

1. Create a folder + `index.html` for the game
2. Set `window.CREATURE_IMAGE_BASE = '../data/';` before loading `<script src="../creatures.js"></script>`
3. At the end call `saveGameData(gameId, gd)` to persist results
4. Add an entry to `GAMES_CONFIG` in `script.js` — hub and gallery render dynamically

### Key Systems in `script.js`

| Section | Responsibility |
|---|---|
| `GAMES_CONFIG` | Game list — edit here to add/remove games |
| `renderHub` / `buildCardHTML` | Game card grid |
| `renderGallery` | Creature gallery modal |

### Creature & Growth Logic

**Creature type** is set once at first game completion, based on correct answers out of 10:

| Score | Creature |
|---|---|
| 0–2 | Schnecke (Snail) |
| 3–4 | Fisch (Fish) |
| 5–6 | Huhn (Chicken) |
| 7 | Salamander |
| 8 | Falkeneule |
| 9 | Triceratops |
| 10 | Drache (Dragon) |

**Growth stage** is determined by cumulative `growth` points across all sessions (5 stages via PNG images in `data/`).

### State Shape (localStorage `lernwelt_v3`)

```javascript
{
  "game1": {
    points: number,        // total correct answers ever
    roundsPlayed: number,  // number of sessions
    creature: string|null, // creature type, null until first completion
    growth: number         // cumulative growth points
  }
}
```

### CSS

Design uses CSS custom properties (defined at `:root`). The fantasy aesthetic uses Cinzel (display) and Nunito (body) from Google Fonts.
