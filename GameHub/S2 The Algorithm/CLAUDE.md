# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**THE ALGORITHM** is a browser-based educational game about smartphone addiction, designed for use in school settings (iPad Schulungsspiel). The player acts as a digital parasite (smartphone algorithm) trying to keep a "User" (represented by a "Schweinehund" sprite) online as long as possible against real-life interruptions.

- **Language of all content:** German
- **Genre:** Resource Management / Strategy / Card Simulation
- **Target platform:** Browser (iPad-compatible)
- **Stack:** Vanilla HTML5, CSS3 (Flexbox/Grid), JavaScript ES6+ — no frameworks, no build tools

## Tech Stack & Architecture

No build system, package manager, or test framework. The planned implementation is pure browser-native:

- Single centralized state object holding all game values (Dopamin, Balance, Reizsättigung, Sozialerdrang)
- Rendering via DOM manipulation or Canvas (not yet decided)
- Sprite assets are PNGs in `data/`

## Game Systems (from GDD)

### Core Values (4 Kernwerte)
| Value | Role |
|---|---|
| Dopamin | Survival metric — drains constantly, Game Over at 0 |
| Balance | Scale between Trägheit (inertia) and Rastlosigkeit (restlessness), ideal 40–60% |
| Reizsättigung | Permanent difficulty multiplier — minimized by card variety |
| Sozialerdrang | Social pressure from real contacts — reduced by Messenger/Game cards |

### Interest System
- 8 themes: Memes, Gossip, Beauty, Film, Fitness, Sport, Technik, Lernen
- Generated randomly at start: 1x Haupt, 2x Hoch, 5x Gering
- Cards deliver ~4 interest points; 20–40% from high-interest content is optimal for Dopamin

### Card/Feed System
- Player holds 5 cards, plays one every 10 seconds into 3 feed slots
- **ROT (Video):** Dopamin + interests; overuse raises Sozialdruck
- **GRÜN (Messenger):** Reduces Sozialdruck; creates social binding
- **BLAU (Game):** Halts Dopamin drain briefly but raises Reizsättigung and Balance difficulty (includes loot boxes)
- **WEISS (System):** Modifiers (push notifications, double Dopamin for 20s)
- Frequent app switching raises Reizsättigung; staying in one app also raises it — balance is key

### Time & Event System
- Real time: 8 minutes (480s) = in-game 15:00–03:00 (10s real = 15min in-game)

| In-game Time | Event | Effect |
|---|---|---|
| Random | WLAN-Fehler | Player must skip |
| 17:00 | Sport-Termin | Dopamin penalty |
| 19:00 | Abendessen | Sozialdruck spikes |
| 21:00 | Treffen | Extreme Sozialwert check |
| 23:00+ | Schlaf-Impuls | Card resistance increases |

### Character Animation Logic
- Sprites in `data/`: idle (user1–3), tired (userTired1–3), walking (gehen1–4), thinking (überlegen), won (gewonnen), bed states (Bett, BettmitSchwein), standing up (aufstehen)
- Until 22:30: character walks right out the door
- After 22:30: character walks left toward bed

## Development Roadmap

- **Phase 1:** Setup & UI — HTML structure, CSS status bars, interest generator, card container, user sprite visible
- **Phase 2:** Game Logic — game loop, card logic, feed slots, value calculations
- **Phase 3:** Balancing & Events — Reizsättigungs formula, event triggers, Game Over screen, start screen info tiles, animation polish

## Start Screen Design
- Shows User sprite, a start button, and info tiles explaining mechanics (with real-world psychological context — e.g., randomized conditioning)
