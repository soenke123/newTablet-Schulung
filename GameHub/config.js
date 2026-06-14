/* ══════════════════════════════════════════════════════════════
   LERNWELT – config.js   (diese Datei auf dem Server anpassen)

   Spiel-Status:  "available" | "password" | "locked"

   NEUEN PASSWORT-HASH GENERIEREN:
     1. index.html im Browser öffnen
     2. Konsole öffnen (F12)
     3. Eingeben:  hashPassword('meinPasswort').then(h => console.log(h))
     4. Den ausgegebenen Hash hier als passwordHash eintragen
   ══════════════════════════════════════════════════════════════ */

_rel = true;


GAME_ACCESS = {
  // Season 1
  game3:  { status: 'password', passwordHash: 'c271515d04b978b6d10041e4e754ec6525a40266ec17dafcf8ee4474960ab800' },
  game7:  { status: 'available' },
  game8:  { status: 'password', passwordHash: 'a3649c0969937aef94e1556fd5d9f3649f5d4966c90bb854a4aca56e32cc9f04' },
  // Season 2
  game9:  { status: 'password', passwordHash: '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58' },
  game10: { status: 'password', passwordHash: '8bd18d730cb0594285e09af7869d1baab844a1573ecfdce9c25480f0ab31fb58' },
  game11: { status: 'password', passwordHash: 'dd8265590e8dcbe0be95c93961e8f3e5ed3b877d98b136e1a11e7b6827eba84e' },
  // Season 3  (nur aktiv wenn _rel = true)
  game12: { status: 'password', passwordHash: '1d75fc98b5dc89c3612274e343f3271776c57ccdd8a7022650d38eea7db7cea3' },
  game15: { status: 'password', passwordHash: '7625ae9cd8c2645149cb2016e7ed931638d49fd51f96b1aef9db7add759c1dd5' },
  game14: { status: 'password', passwordHash: '71391cf2eb6d22058056461195b0134a2933352f21faa98ff9992513ac7e8fb4' },
};
