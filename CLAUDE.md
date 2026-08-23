# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MPS Tablet-Schulung** is a browser-based learning platform for tablet workshops at a German school. It consists of a landing page and a gamified mini-game hub ("Lernwelt") where students collect virtual creatures by completing educational games. No build process — open any `.html` file directly in a browser.

## Top-Level Structure

```
Webauftrtitt/
├── index.html          → Landing page: links to GameHub, PDF downloads, and workshop slides
├── viewport.js         → sichtbarer Bereich (Tastatur, Adressleiste) als CSS-Variablen
├── PROJEKTBRIEFING.md  → Migrationsplan Frontend-only → Supabase-Backend (v2, 2026-07-04)
├── Dokumente/          → PDF handouts for students (e.g. Handout_Tablet-Schulung.pdf)
├── supabase/           → Datenbank-Schema, Seed, Blacklist, Setup-Doku
├── api/                → Vercel Serverless Functions (signup, admin-Actions)
├── admin/              → Admin-Panel: Cluster/User/Fortschritts-/Lehrkraft-Verwaltung
├── MPSkills/           → Zweiter Anwendungsbereich: Tools für den Unterricht (eigene Landing, eigene Optik)
│   ├── lib/            → room.js (Token, Poller) · qr.js (selbstgebaut) · tool.js (Werkzeug-Schnittstelle) · userbar.js (Ecke oben rechts)
│   └── tools/          → ein Ordner je Werkzeug, je zwei Dateien: tool.js + tool.css
└── GameHub/            → All game logic (see GameHub/CLAUDE.md for detailed docs)
    ├── index.html      → Game selection hub with creature gallery
    ├── script.js       → Hub-only logic: GAMES_CONFIG, renderHub, shop modal, gallery
    ├── creatures.js    → Shared: creature images, egg SVGs, localStorage read/write
    ├── style.css       → Fantasy/adventure theme (CSS variables, Cinzel + Nunito fonts)
    ├── config.js       → GAME_ACCESS: nur noch Not-Aus (`locked`). Freischaltung läuft über cluster_unlocked_games
    ├── data/           → Creature PNG sprites (14 types × 5 growth stages)
    ├── 1337.html       → Secret easter-egg game (Atari-1337 creature unlock)
    └── [15 game folders] (see GameHub/CLAUDE.md)
```
