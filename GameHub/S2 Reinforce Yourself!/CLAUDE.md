# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kilernen** is an interactive game tree visualizer for a **Brettspiel** (3×3 board game). It renders the complete game tree of all possible positions as an interactive HTML5 Canvas diagram, with miniature board previews, minimax evaluations, and a user comment system.

## Running the App

No build step. Open `index.html` directly in a browser. There are no dependencies, package.json, or npm scripts.

## Architecture

The entire application is a single HTML file with embedded CSS and JavaScript.

### Data Model

All game state is hardcoded at the top of the script:

- **`NODES`** (61 entries): Each node has `id`, `board` (9-char string: `0`=empty, `1`=white pawn, `2`=black pawn), `turn` (`1`=white, `2`=black), `depth`, `mm` (minimax: `1`=white wins, `-1`=black wins), and computed `x`/`y` canvas coordinates.
- **`EDGES_RAW`** (46 entries): `[parentId, childId]` pairs for non-terminal moves.
- **`TERM_EDGES`**: Terminal edges that connect positions to one of two sink nodes (white-wins / black-wins).

### Rendering Pipeline

`draw()` is the single render function — call it to refresh the canvas. It draws in order: edges → terminal edges → nodes (with `drawMiniBoard`) → sink nodes → comments.

- **`drawMiniBoard(x, y, boardStr, borderCol)`**: Renders a 3×3 position at given canvas coordinates. Border color signals whose turn / outcome.
- **`drawPawn(cx, cy, isWhite)`**: Draws a single pawn glyph inside a board cell.
- **`isVisible(id)`**: A node is visible only if all its ancestors are expanded. Used to skip rendering of collapsed subtrees.
- **`nodeAt(mx, my)`**: Hit-test returning the node under cursor coordinates.

### Interaction State

- **`expanded`**: Set of node IDs whose children are shown. Root node starts expanded.
- **`offsets`**: Map of `id → {dx, dy}` for user-dragged node repositioning.
- **`comments`**: Map of `id → string`, persisted to `localStorage` under the key `brettspiel_comments`.

Drag handling uses `mousedown`/`mousemove`/`mouseup`. Click (non-drag) opens the comment modal. Expand/collapse buttons (drawn as `+`/`−` circles below each node) toggle `expanded`.

### Color Scheme

Two palettes are applied based on `prefers-color-scheme`:
- **Light**: white nodes blue (`#185FA5`), black nodes grey (`#5F5E5A`), white-wins green (`#3B6D11`), black-wins red (`#A32D2D`).
- **Dark**: adjusted variants for visibility on dark backgrounds.

Node border color encodes: current turn AND minimax outcome, not just one.

### Key Layout Constants

| Constant | Value | Purpose |
|---|---|---|
| `NODE_W / NODE_H` | 42 / 42 px | Node bounding box |
| `SQ` | 12 px | Board cell size |
| `H_GAP` | 18 px | Horizontal spacing |
| `V_GAP` | 52 px | Vertical spacing |
| `SINK_R` | 30 px | Sink node radius |

Node `x`/`y` coordinates are pre-computed and stored directly in `NODES` — they are not recalculated at runtime. Adjust them in data to reposition the tree layout.
