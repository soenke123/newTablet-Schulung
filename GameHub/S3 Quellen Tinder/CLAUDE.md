# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

German-language browser quiz game for Gymnasium students (grade 10+), designed for iPad use. Players evaluate information sources as credible, faulty, or suspicious using the CRAAP model (Currency, Relevance, Authority, Accuracy, Purpose). 10 random articles are shown per round from a pool of 40+.

## Running the project

No build step. Open `index.html` directly in a browser.

**Windows/OneDrive note:** If buttons do nothing after opening, right-click `index.html` → Properties → check "Unblock" → OK. OneDrive-synced files get a Windows Zone.Identifier that blocks JavaScript.

## Architecture

Everything lives in a single `index.html` file (CSS + JS + data inline). This was intentional to avoid file-loading security restrictions when opened via `file://` protocol on Windows/iPads.

### Screen system

Four `<div class="screen">` elements, only one visible at a time via the `active` class. The `go(id)` function switches screens.

- `#s-start` — landing page with CRAAP explanation
- `#s-game` — active gameplay (card + 3 rating buttons)
- `#s-end` — score and breakdown
- `#s-overview` — developer view of all articles

### Article data (`ARTICLES` array)

Each article object has these fields:

```
id, type, cred, title, sub, author, date, img, imgCap, text, error
```

- `type` — determines CSS layout class and label. Valid values: `wikipedia`, `whatsapp`, `youtube`, `instagram`, `tiktok`, `news`, `newsfake`, `book`, `googleai`
- `cred` — ground truth: `correct`, `incorrect`, or `suspicious`
- `error` — shown in feedback after the player rates. `null` for correct articles.
- `text` — paragraph breaks use `\n\n`. Rendered by `fmt()`.

**Critical:** All string values must use backtick template literals, not double quotes. German text contains `"` characters that prematurely close double-quoted JS strings and crash the entire script silently.

### `buildCard(a)` function

Builds HTML string for each article type. Each `type` has its own CSS class (`c-wikipedia`, `c-whatsapp`, etc.) that mimics the real platform's visual style. Adding a new source type requires: a new entry in `SRC_LABEL`, a CSS block, and a branch in `buildCard`.

### Game flow

`startGame()` → shuffles ARTICLES, slices 10 → `showCard()` → player clicks rating button → `rate(choice)` → appends feedback overlay → `nextCard()` removes overlay, advances `S.cur` → after 10 cards → `showEnd()`

State is kept in the `S` object: `{ queue, cur, score, results, total }`.

### Developer overview

The "Artikel-Übersicht" button (start screen) calls `showOverview()` → `renderOverview()`. Cards are color-coded: green border = correct, red background = incorrect, yellow background = suspicious. Filter buttons call `setFilter(btn, filter)`.

## Adding articles

Add an object to the `ARTICLES` array. Keep distribution roughly 40% correct / 50% incorrect / 10% suspicious. Use backtick strings for all text fields. Images should be Unsplash URLs with `?w=600&q=80`.

## Known constraints

- No German smart quotes (`„ "`) directly in JS strings — use ASCII `"` or HTML entities in displayed text instead.
- No external dependencies (no CDN, no npm). Must work fully offline on iPads.
- Tested target: Safari on iPad, Chrome/Edge on Windows desktop.
