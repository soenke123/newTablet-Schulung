/* ══════════════════════════════════════════════════════════════
   LERNWELT – config.js

   Spiel-Status:  "available" | "locked"

   WER EIN SPIEL FREISCHALTET, STEHT NICHT MEHR HIER.
   Seit Migration 0070 entscheidet ein Schalter pro (Kurs, Spiel),
   den Admins und Schuladmins direkt auf der Hub-Kachel bedienen
   (Tabelle cluster_unlocked_games). Die Passwörter sind ersatzlos
   entfallen — ein Passwort war ein Geheimnis pro Spiel, das man
   einmal ansagt und danach nicht mehr zurücknehmen kann.

   Diese Datei ist nur noch der NOT-AUS: "locked" schaltet ein Spiel
   global ab, unabhängig von jedem Kurs und über jeden Admin hinweg.
   Gedacht für den Fall, dass ein Spiel kaputt ist und niemand mehr
   hineinlaufen soll. Im Normalbetrieb steht hier nichts.

   Season-Sichtbarkeit läuft weiter über die Backend-Session
   (session.js: getUserSeason()) bzw. für Admins über den gewählten
   Kurs (getEffectiveSeason() in script.js).
   ══════════════════════════════════════════════════════════════ */


GAME_ACCESS = {
  // Beispiel für den Not-Aus:
  // game9: { status: 'locked' },
};
