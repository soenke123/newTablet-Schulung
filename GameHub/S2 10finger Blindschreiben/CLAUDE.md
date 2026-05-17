# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**TippTurbo Kids** ("S2 10-Finger Blindschreiben") is a self-contained, single-file browser typing trainer. Students practice 10-finger touch-typing by typing words displayed on screen within a 60-second countdown, with a real-time QWERTY keyboard overlay that highlights the next required letter.

No build process — open `index.html` directly in a browser.

## File Structure

```
index.html          → Entire game: HTML structure + embedded CSS + embedded JS
basic-position.png  → Educational hand-placement diagram shown in intro modal
```

All game logic, styling, and markup live in `index.html`. There are no external JS or CSS files.

## Game Logic

**Entry point:** Page load shows an educational intro modal (with `basic-position.png`). Clicking "🚀 Spiel starten" starts the game and focuses the text input.

**Core loop** is driven by an `input` event listener on the text field:
- Compare typed value (lowercased, trimmed) against `currentWord`
- On match: +10 points, combo++, clear input, call `randomWord()` → `showWord()`
- `showWord()` also calls `highlightKey(letter)` to update the keyboard overlay

**Key state variables:** `currentWord`, `score`, `combo`, `time`, `gameRunning`, `level`, `timer` (setInterval ID)

**Word lists:**
- `words` — 10 easy German words (Level 0, starting state)
- `words2` — 5 harder German compound words (Level 1, unlocked at score ≥ 150)

**Level progression:** `randomWord()` checks `score >= 150`; if so, sets `level = 1`, adds +30 s to the timer, and draws from `words2`.

**Timer:** `startTimer()` runs `setInterval` every 1000 ms, decrementing `time`. At 0: disables input, sets `gameRunning = false`, clears interval, shows final message.

**Keyboard overlay:** Three rows of `<div class="key">` elements. `highlightKey(letter)` iterates them and toggles the `active` class on the matching letter.

## GameHub Integration (currently incomplete)

The game is registered in the parent hub as `game11` with password `qweasdyxc` (see `../config.js`), but it does **not** yet call `saveGameData()` or import `../creatures.js`.

To complete integration, add before `</body>`:
```html
<script>window.CREATURE_IMAGE_BASE = '../data/';</script>
<script src="../creatures.js"></script>
```
Then call on game end (where the "Zeit vorbei" message is shown):
```javascript
saveGameData('game11', {
  points: score / 10,   // correct words typed
  roundsPlayed: 1,
  creature: null,
  growth: score / 10
});
```
See `../CLAUDE.md` → "Adding a New Game" for the full data shape and hub rendering pipeline.
