# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

No build system. Open `index.html` directly in a browser. Tailwind CSS is loaded from CDN — an internet connection is required for styling.

## Architecture

Single-file application: all HTML, CSS, and JavaScript live in `index.html`. There is no bundler, no npm, no separate assets.

**Game: NUM64 (Zahlenjagd)**  
A focus-training game for tablets. The player must tap balloons numbered 1–64 in order. Fake distractors appear and disappear periodically.

**Global state**
- `currentTarget` — the next number the player must click
- `balloons[]` — array of live balloon objects (`{ element, num, isFake, x, y, vx, vy, size, lifespan }`)
- `gameActive` — boolean gate used by the render loop and fake-spawn interval
- `startTime` — `Date.now()` snapshot used for elapsed-time display

**Key constants** (all in `<script>`)
- `MAX_REAL_BALLOONS = 4` — real balloons on screen simultaneously (numbers `currentTarget` … `currentTarget + 3`)
- `MAX_FAKE_BALLOONS = 4` — fake balloons on screen simultaneously
- `GAME_LIMIT = 64` — total numbers to collect

**Two concurrent loops run while the game is active**
1. `requestAnimationFrame(update)` — moves every balloon each frame, bounces off edges, updates the timer display.
2. `setInterval(fakeSpawner, 1200)` — spawns a fake balloon every 1.2 s if fewer than `MAX_FAKE_BALLOONS` fakes are present. Fakes self-remove after 3–7 s via `setTimeout`.

**Balloon lifecycle**
- `spawnBalloon(num, isFake)` creates a DOM element, adds it to `balloons[]`, and appends it to `#play-area`. Color is derived from `(num * 137.5) % 360` (golden-angle hue distribution).
- `removeBalloon(obj)` immediately removes the object from `balloons[]` (so `isNumberAlreadyOnScreen` stays accurate) and then fades/scales the DOM element out over 300 ms.
- On a correct click: the balloon is removed, `currentTarget` increments, and the next real balloon (`currentTarget + MAX_REAL_BALLOONS - 1`) is spawned — after evicting any fake with the same number.

**Three overlays** (z-index 100+)
- `#start-overlay` — shown on load, hidden by `initGame()`
- `#win-overlay` — shown by `endGame()`, triggers `location.reload()` on restart
- `#play-area` — the live game field (full viewport, behind the header)

**Touch / tablet specifics**  
`touch-action: none` on `body`, `user-select: none` on `.balloon`. The viewport meta tag disables pinch-zoom. `window.onresize` clamps balloon positions when the viewport changes.
