# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MPS Tablet-Schulung** is a browser-based learning platform for tablet workshops at a German school. It consists of a landing page and a gamified mini-game hub ("Lernwelt") where students collect virtual creatures by completing educational games. No build process — open any `.html` file directly in a browser.

## Top-Level Structure

```
Webauftrtitt/
├── index.html          → Landing page: links to GameHub, PDF downloads, and workshop slides
├── viewport.js         → sichtbarer Bereich (Tastatur, Adressleiste) als CSS-Variablen
├── feedback.js         → Dialog „Feedback & Fragen“ (Profil-Menü) → RPC submit_feedback; Tickets im Admin-Reiter „Tickets“ (nur Volladmin, Migration 0179)
├── PROJEKTBRIEFING.md  → Migrationsplan Frontend-only → Supabase-Backend (v2, 2026-07-04)
├── Dokumente/          → PDF handouts for students (e.g. Handout_Tablet-Schulung.pdf)
├── supabase/           → Datenbank-Schema, Seed, Blacklist, Setup-Doku
├── api/                → Vercel Serverless Functions (signup, admin-Actions)
├── admin/              → Admin-Panel: Cluster/User/Fortschritts-/Lehrkraft-Verwaltung
├── MPSkills/           → Zweiter Anwendungsbereich: Tools für den Unterricht (eigene Landing, eigene Optik)
│   ├── preview/        → Schaufenster-Drehbücher je Skill (Kachel-Standbild + Vorschau, u. a. knowledgestack.js)
│   ├── quiz.html/.js   → Quiz-Editor von Knowledge Stack ohne Raum (Kachel-Knopf „Quiz-Editor"); derselbe Editor wie im Raum (tools/KnowledgeStack/editor.js)
│   ├── lib/            → room.js (Token, Poller) · qr.js (selbstgebaut) · tool.js (Werkzeug-Schnittstelle) · userbar.js (Ecke oben rechts)
│   └── tools/          → ein Ordner je Werkzeug, je zwei Dateien: tool.js + tool.css
│       ├── ScrumWerkstatt/ → Scrum-Projektarbeit, ein Raum = ein Team (Migration 0196). index.html im iframe + bridge.js (Sync); Mitglied/Beobachter (Beobachter bleibt Beobachter), persönlicher Wiedereinstiegscode (8 Zeichen, /api/skill_join mode 'recover'); Raum-Besitzer (Lehrkraft) schreibt mit und ist allein für Zurücksetzen/Import/Backups zuständig, wöchentliches Auto-Backup nur bei Aktivität (Migration 0198); Product Goal als eigenes Objekt `product/goal` neben `product/main`, damit Goal und Board nicht kollidieren (Migration 0199)
│       └── Projektarbeit/ → Gruppenarbeit, ein Raum = eine Klasse (Migration 0200, Tabellen pa_*). Lobby → Lehrkraft zieht Personen per Drag & Drop zu Gruppen (Person auf Person = neue Gruppe; Zeiger-Events, am Tablet halten oder antippen) → Kompass-Symbol eröffnet je Gruppe/Einzelperson einen Planungsraum mit Reitern Projektziel · Arbeit (Board: Zu erledigen/Blockiert/In Arbeit/Fertig) · Stunden (Protokoll, Eintrag gehört dem Urheber) · Anträge (Lehrkraft genehmigt/lehnt ab; rote Zahl an der Gruppe in der Übersicht) · Team (ohne Scrum-Rollen, freies Label) · Projektarbeit & Regeln (+ Ergänzungen der Lehrkraft). Gleicher persönlicher Code wie Scrum Werkstatt (beim ersten Öffnen vergeben). index.html + app.js im iframe, bridge.js (Sync + DEMO-Nachbildung des Servers für ?demo=1); Prüfstand supabase/tests/0200_projektarbeit.mjs
└── GameHub/            → All game logic (see GameHub/CLAUDE.md for detailed docs)
    ├── index.html      → Game selection hub with creature gallery
    ├── script.js       → Hub-only logic: GAMES_CONFIG, renderHub, shop modal, gallery
    ├── pause.js        → Kurs-Pause (Admin-Button „⏸ Pause", Migration 0184): Overlay + Einfrieren aller Spiele; erstes <script> jeder Spielseite
    ├── creatures.js    → Shared: creature images, egg SVGs, localStorage read/write
    ├── style.css       → Fantasy/adventure theme (CSS variables, Cinzel + Nunito fonts)
    ├── config.js       → GAME_ACCESS: nur noch Not-Aus (`locked`). Freischaltung läuft über cluster_unlocked_games
    ├── data/           → Creature PNG sprites (14 types × 5 growth stages)
    ├── 1337.html       → Secret easter-egg game (Atari-1337 creature unlock)
    └── [15 game folders] (see GameHub/CLAUDE.md)
```
