# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file quiz game (`index.html`) — the "Daten-Quiz" about file formats for tablet workshops. No build process; open directly in a browser. Part of the GameHub at `../index.html`.

## Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `SK` | `'quiz_df_v4'` | localStorage key for quiz state |
| `TOTAL` | `16` | Total questions |
| `quizGameId` | `'game3'` (default) | Hub creature slot; overridable via `?id=` URL param |

## Question Data (`RQ` array)

Three question types exist — set via the `type` field (absent = single-choice MC):

- **Single-choice MC** (default): `correct` is `[index]`, one option auto-selects and locks.
- **Multi-choice MC**: `multi: true`, `correct` is `[index, ...]`, requires explicit submit.
- **Drag-and-drop** (`type: 'dragdrop'`): uses `formats` (array of `{label, category}`) and `categories` (drop zone names).

## State Shape (`ST`)

```javascript
{
  phase: 'start' | 'quiz' | 'result',
  currentQ: number,
  score: number,           // correct answers this session
  streak: number,
  bestStreak: number,
  correctAnswers: number[], // indices of correct questions
  wrongAnswers: number[],
  answers: Array(16),       // per-question answer state (shuffleOrder, dndPlacement, etc.)
  hubSaved: boolean         // guard: saveToHub() runs once per session
}
```

State persists across page reloads; quiz auto-resumes mid-session if `phase === 'quiz'`.

## Hub Integration

Depends on `../creatures.js` for all creature/storage logic. Must set `window.CREATURE_IMAGE_BASE = '../data/';` before loading the script (already in place).

`saveToHub()` writes results to the `lernwelt_v3` localStorage key via `saveGameData(quizGameId, gd)`. It handles:
- First play: assigns creature type based on `Math.round(correct / TOTAL * 10)`
- Subsequent plays: calls `computeRoundResult()` for growth + coins
- Shop items consumed here: `wachstumsBooster`, `coinsx3`, `glucksklee`

## Adding / Editing Questions

Add entries to `RQ` and a matching topic string to `TOPICS` at the same index. `PARTS` maps part numbers 1–4 to display labels.
