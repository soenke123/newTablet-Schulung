# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Datei-Detektive** is a single-file HTML5 educational game (German: "File Detectives") for iPad/tablet students learning digital file organization. No build system, no dependencies, no package manager — just `lernspiel.html`.

## Running the Game

Open `lernspiel.html` directly in a browser. No server or build step required. Works fully offline (optional Google Fonts are the only external resource).

## Architecture

Everything lives in `lernspiel.html`, structured as three sections:

**CSS (lines ~10–532)**: iPad frame aesthetic, subject-based color system, drag/drop animations.

**HTML (lines ~535–632)**: iPad mockup shell containing sidebar (folder nav), main grid, modal, overlay screens (round intro, test intro, virus fail, end screen), and toast container.

**JavaScript (lines ~634–1239)**: Self-contained game engine with no external libraries.

### Key Data Structures

`ROUNDS[]` — the game's content config. Each round defines `files[]` and `testQuestions[]`. Rounds grow in difficulty (7 → 14 → 23 files).

`state` object — single source of truth:
```js
{ roundIndex, files, folders, activeFolder, score, phase, test: { qIndex, misses, locked } }
```

`SUBJECT_COLORS` / `SUBJECT_EMOJI` — maps folder names to display properties.

### File Type Behaviors

| Extension | Behavior |
|-----------|----------|
| `.pdf` | Readable text preview in modal |
| `.png` | SVG image preview in modal |
| `.dat` / `.tmp` | Locked; can be exported as PDF |
| `.bat` | Virus — clicking one fails the round |

### Game Flow

```
Start → Round Intro → Sorting Phase (drag to folders) → Test Intro → Test Phase (3 Qs) → repeat × 3 → End Screen
```

Scoring: 2 pts for instant correct, 1 pt after one miss, 0 pts after two misses. Max 18 pts.  
Highscore persists via `localStorage`.

### Render Pattern

`renderAll()` calls `renderSidebar()`, `renderFiles()`, and `renderHud()`. All UI updates go through these; never mutate DOM directly outside them.

### Event Handling

Drag-and-drop uses the HTML Drag and Drop API via `data-id` attributes on file elements. The modal and test phase use delegated click handlers on the grid.

## Customization

To add/change game content, edit the `ROUNDS` array (files, folder lists, test questions) and `SUBJECT_COLORS`/`SUBJECT_EMOJI` maps. All subject folder names must be consistent across `rounds[n].folders`, `SUBJECT_COLORS`, and `SUBJECT_EMOJI`.
