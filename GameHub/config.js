/* ══════════════════════════════════════════════════════════════
   LERNWELT – config.js   (diese Datei auf dem Server anpassen)

   Spiel-Status:  "available" | "password" | "locked"

   NEUEN PASSWORT-HASH GENERIEREN:
     1. index.html im Browser öffnen
     2. Konsole öffnen (F12)
     3. Eingeben:  hashPassword('meinPasswort').then(h => console.log(h))
     4. Den ausgegebenen Hash hier als passwordHash eintragen
   ══════════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────────────
// SEASON 3 TOGGLE
// true  = Season 3 geöffnet  (Einzeleinstellungen unten gelten)
// false = Season 3 gesperrt  (überschreibt alle Einzeleinstellungen)
// ──────────────────────────────────────────────────────────────
SEASON_3_OPEN = true;


GAME_ACCESS = {
  // Season 1
  game1:  { status: 'available' },
  game3:  { status: 'password', passwordHash: 'c271515d04b978b6d10041e4e754ec6525a40266ec17dafcf8ee4474960ab800' }, // exportPDF
  game7:  { status: 'available' },
  game8:  { status: 'password', passwordHash: 'a3649c0969937aef94e1556fd5d9f3649f5d4966c90bb854a4aca56e32cc9f04' }, // KlickAndClean
  // Season 2
  game5:  { status: 'available' },
  game9:  { status: 'password', passwordHash: '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58' }, // Aufmerksamkeitsbingo
  game10: { status: 'password', passwordHash: '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58' }, // Aufmerksamkeitsbingo
  game11: { status: 'password', passwordHash: 'dd8265590e8dcbe0be95c93961e8f3e5ed3b877d98b136e1a11e7b6827eba84e' }, // qweasdyxc
  // Season 3  (nur aktiv wenn SEASON_3_OPEN = true)
  game12: { status: 'locked' },   // Quellen-Tinder
  game13: { status: 'locked' },   // KI 1
  game14: { status: 'locked' },   // KI 2
};
