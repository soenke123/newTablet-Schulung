# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**S1 EscapeGame** is a single-file educational escape game that teaches students 6 iPad classroom rules ("iPad Hausregeln") through interactive puzzles. Everything lives in `index.html` — no build step, no dependencies. Open it directly in a browser.

## Architecture

The game is a self-contained state machine inside `index.html` (~1173 lines). All CSS, JS, and image assets (base64-encoded) are embedded inline.

### Core State Object (`S`)

```javascript
let S = {
  solved: new Set(),       // rule indices (0–5) completed
  unlocked: new Set([8]),  // step indices currently clickable (8 = backpack = start)
  igStarted: false,        // Instagram distraction started
  activeRule: null,        // rule currently being solved
  err: 0,                  // wrong-answer counter
  t0: Date.now(),          // game start timestamp
  teacherAnnounced: false,
  backpackDone: false,
  ipadWorkDone: false
};
```

### Key Data Arrays

| Array | Purpose |
|---|---|
| `RULES[6]` | The 6 rules to teach: `{short, text, code}` — code is what the player enters |
| `STEPS[10]` | Progression nodes: `{hs, solves, unlock, type, q, opts, hint, …}` — each step maps to a hotspot and a puzzle |
| `HS[9]` | Hotspot positions on the classroom image: `{id, label, icon, s}` |
| `IPADS[9]` | Battery states for the battery-comparison puzzle |

### Game Flow

1. `init()` → builds stage + hotspots, starts timer, unlocks Step 8 (backpack)
2. `render()` → syncs all hotspot visual states, sidebar chips, progress bar
3. `onHS(i)` → hotspot click → `openModal(step, idx)`
4. Puzzle resolves → `S.solved.add(ruleIdx)` + apply `step.unlock[]` → `render()`
5. When all 6 rules solved + final quiz passed → `showVictory()`

### Unlock Chain (progression order)

```
backpack (8) → teacher/battery (1) → [after 1st rule] Instagram (3) → focus (2) → splitscreen (4)
                                                                                 → paper task (6)
after 4 rules → iPad alarm shown (0)
after 5 rules → door/final-quiz (7) available
```

### Puzzle Types

Dispatched inside `openModal()` by `step.type`:

| Type | Builder | Mechanic |
|---|---|---|
| `battery` | `mkBattery()` | Visual grid: pick iPads with 100% battery |
| `choice` | `mkChoice()` | Radio buttons, immediate feedback |
| `checkbox` | `mkCheckbox()` | Multi-select with validation |
| `tf` | `mkTF()` | True/False pairs |
| Instagram sequence | `startInstagram()` / `igFlashLoop()` | Random 2-digit number to remember and enter |
| Focus settings | `showFocusSettings()` | Simulated iOS settings walkthrough |
| Splitscreen | `openSplitscreenPuzzle()` | Two-panel reader + text editor, must type "konzentration" |
| Final quiz | `showFinalQuiz()` | 5 MC questions covering all rules |
| Paper task | Step 9 inline | Sequential origami steps |

### Modal System

A single `.mo` overlay element is reused for every puzzle. Content is rebuilt from scratch on each `openModal()` call. The overlay is closed by clicking outside or the × button.

### Rule Codes

| Rule | Code |
|---|---|
| Akku vollständig laden | 3564 |
| Erst nach Erlaubnis öffnen | 1 |
| Vorbereitung checken | 5 |
| Nur Lernapps aktiv | 6 |
| Kein Splitscreen | 3 |
| Handy in die Tasche | 9 |

## No GameHub Integration

This game does **not** call `saveGameData()`, write to `localStorage`, or communicate with the parent hub. It is entirely standalone. Completion shows an in-game victory screen with time + error count but nothing is persisted.

## Image Assets

`Hintergrund.png`, `Hintergrund iPad.png`, `Pult.png`, and `sehr wütend.png` are base64-embedded inside `index.html`. The classroom scene uses two overlapping `<img>` tags toggled with a `.hidden` class.

## Adding or Changing Puzzles

- Each step is one object in the `STEPS` array. Edit `STEPS` to change puzzle content, unlock order, or rule assignments.
- To add a new puzzle type, add a branch in `openModal()` and a corresponding builder function.
- `RULES` codes are checked in the sidebar code-input field (`#inp`). Change `rule.code` there.
- Hotspot positions are inline `style` strings in the `HS` array — tweak `left`/`top`/`width`/`height` percentages to reposition.
