/* Spiel-Verfügbarkeit – diese Datei auf dem Server anpassen
   status: "available" | "password" | "locked"            */
GAME_ACCESS = {
  // Season 1
  game1:  { status: 'available' },            // Finde Grün
  game3:  { status: 'password', password: 'exportPDF'}, // Daten-Quiz
  game7:  { status: 'available' },            // Escape Game
  game8:  { status: 'password', password: 'KlickAndClean'},      // Projekt_FINAL_v7_Neu
  // Season 2
  game5:  { status: 'available' },               // Finde Gelb
  game9:  { status: 'password', password: 'Aufmerksamkeitsbingo' },     // Fokusflow
  game10: { status: 'password', password: 'Aufmerksamkeitsbingo' },     // The Algorithm
  game11: { status: 'password', password: 'qweasdyxc' },     // 10-Finger-Tippen
  // Season 3
  game6:  { status: 'available' },               // Finde nicht Grün
  game12: { status: 'locked' },               // Quellen-Tinder
  game13: { status: 'locked' },               // KI 1
  game14: { status: 'locked' },               // KI 2
};
