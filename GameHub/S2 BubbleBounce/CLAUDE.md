# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Bubble Bounce" — a Doodle-Jump-style climber with a media-literacy theme for ages 12–16. The player climbs an endless social-media feed made of post cards. Every post bounces the monster upward — the difference is what it does to the *score* and to the *algorithm*: landing on a credible category (Faktencheck, Wissenschaft, öffentl.-rechtlich, …) gives points and builds a combo; landing on a bad category (Klickbait, Verschwörung, versteckte KI, …) subtracts points and resets the combo. Every interaction feeds a weighted "recommendation algorithm" — the more you hit a category, the more of it you see. The end-of-run "Filterblase" screen visualises the drift. German UI. Targets mobile (portrait, touch) and desktop (arrow keys + space for dash).

The live game lives in **`bubble-bounce/`** as static HTML/CSS/JS — no build system, no package manager, no external assets besides the Google Fonts stylesheet. Just open `bubble-bounce/index.html` in a browser. High score persists via `localStorage` under the key `bubbleBounceHigh_v1` (see `js/util.js`). Two sibling files exist for reference: `bubble-bounce/showroom.html` (design/style exploration page, not part of the runtime) and `feed-escape-v3cALT.html` in the repo root (the original single-file prototype from when the project was still called "Feed Escape", kept for reference only — do not edit).

## Architecture

Standard canvas game loop (`requestAnimationFrame` → `update(dt)` → `render()`) split across small IIFE modules that all hang off a shared `window.FE` namespace. Load order is fixed by `index.html` (`util → categories → algorithm → player → platforms → render → screens → main`) and each module reads its dependencies from `FE.*`.

States in `FE.main.ST`: `MENU`, `PLAY`, `STATS` (post-run filter-bubble screen), `OVER`, `PAUSED` (mid-run filter-bubble screen). Flow: `MENU → PLAY → STATS → OVER → PLAY …`.

Key subsystems worth knowing before editing:

- **Coordinates (`js/util.js`).** `view.U = min(W, H)` is the layout unit — nearly every size (monster radius, platform width, font sizes) is expressed as a fraction of `U` so the game rescales on `resize()`. `checkResize()` runs every frame to catch iOS/Safari's late layout events. Camera scrolls via `game.camY`; world→screen is `worldY - camY`.
- **Categories (`js/categories.js`).** Pure data. 10 categories (5 `good`, 5 `bad`), each with `id`, `icon`, `label`, `bonus` (+8 to +15 for good, −10 to −20 for bad), a pool of `handles` and short `sampleTexts`. `STARTER_GOOD` / `STARTER_BAD` are subset ids intended for a gentler intro pool (currently only used to force the very first platform to `STARTER_GOOD[0]`, see `main.js:startGame`).
- **Algorithm (`js/algorithm.js`).** The didactic core. Weighted picker: `weight(cat) = interactions[cat] + BASE_WEIGHT (2)`, `BUMP (1)` per interaction. `pickFrom(pool)` is used by platforms; `recordInteraction(id)` is called on every landing and snapshots the current probability distribution into `history` so the end screen can chart the drift. `BASE_WEIGHT` is the floor — no category ever reaches 0% probability.
- **Platform generation (`js/platforms.js`).** `genRow(climb)` produces one row at a time above `highestGen`. Row is either a single platform or a rare double (`dblRate = min(0.28, 0.10 + climb/9000)`) — doubles are the deliberate "choice moments". **Both slots pick from the global pool via the weighted algorithm; there is no forced-safe row.** Gap formula: `115 + rand*45 + min(climb/45, 15)`, tuned so the standard bounce apex (~194px from `BOUNCE=860`, `G=1900`) always reaches the next row without a dash. Changing `BOUNCE`, `G`, or the gap constants requires re-checking reachability.
- **Landing (`js/platforms.js:checkCollisions` / `onHit`).** Collision only checks when `mon.vy > 0` (falling) and uses `feetPrev`/`feet` to prevent tunneling. **Every category bounces** (the old "fake breaks away" mechanic is gone). Bad platforms differ only in score (negative `bonus`), combo reset, and a small shake + red particle puff. Combo/score effects are skipped when `p.id === lastPlatId` so re-touching the same platform doesn't stack.
- **Controls are relative, not absolute (`js/player.js`).** `pointerdown` only records `lastPX` — it must *never* teleport the monster. `pointermove` applies `(x - lastPX) * SENS`. This was a deliberate design choice; keep it that way when editing input code. Top-right of the canvas hosts a mute button and a stats/pause button; bottom-right has the dash button. Keyboard: arrows to move, space/↑ to dash, P/Esc to pause, M to mute.
- **Rendering (`js/render.js`, `js/screens.js`).** The sunset gradient lives on `#stage` in CSS; the canvas itself is transparent and gets cleared each frame. `render.js` handles in-world drawing (backdrop, cards, monster, FX, HUD, buttons); `screens.js` handles the overlays (menu, over screen, and the filter-bubble screen used both for the paused view and the post-run summary).
- **Audio.** Muted by default; `AudioContext` is lazily created on first pointer/key event via `ensureAudio()` to comply with browser autoplay rules.

## Conventions

- Edit within the module boundaries in `bubble-bounce/js/`. Don't collapse back into a single file, and don't add a bundler/build step.
- All modules attach to `window.FE`; the load order in `index.html` is load-bearing — a new module has to be inserted respecting its dependencies.
- German strings in the UI — don't translate incidentally.
- `localStorage` key is `bubbleBounceHigh_v1` (in `js/util.js`). Bump the suffix only if the save format changes.
- `feed-escape-v3cALT.html` (root) and `bubble-bounce/showroom.html` are historical/design artefacts. Runtime changes belong in `bubble-bounce/` only.
