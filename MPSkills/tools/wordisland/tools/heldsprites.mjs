/* Schneidet die eigene FIGUR und das eigene SCHIFF für die Insel zu.

   ── Warum es diesen Erzeuger gibt ───────────────────────────────
   Sönkes Vorlagen sind Bilder zum Ansehen, keine Spielbilder:

     sprites/crew/<farbe> 1 crew.png   1093 × 1624,  0,6 MB je Volk
     sprites/<Farbe> Schiff.png        1984 × 2176,  3,4 MB je Volk

   Auf der Insel ist die Figur rund zwei Kacheln hoch (an einem
   Tablet also gut 100 Bildpunkte), das Schiff gut vier Kacheln
   breit. Ein 1624 px hohes Bild dafür zu laden heißt, das
   Fünfzehnfache dessen zu übertragen, was je auf dem Schirm
   ankommt — und beim Fraktionswechsel noch einmal.

   Dazu der eigentliche Grund für ein Werkzeug statt eines
   Handgriffs: der Auswahlkasten zeigt ALLE ACHT Völker nebeneinander.
   Mit den Vorlagen wären das 4,8 MB für eine Reihe Daumennägel.

   ── Drei Ausgänge ───────────────────────────────────────────────
     sprites/held/<n>.png    Figur, 340 px hoch   — auf der Insel
     sprites/held/<n>k.png   Figur, 108 px hoch   — die Auswahlreihe
     sprites/boot/<n>.png    Schiff, 420 px breit — auf dem Wasser

   `<n>` ist die VOLKSNUMMER aus TEAMS in tool.js und nicht die
   Farbe. Das ist Absicht: die Nummer steht in wi_boards.factions und
   in settings.faction, die Farbe steht nur im Dateinamen der
   Vorlage. Wer die Reihenfolge von TEAMS ändert, muss auch hier die
   Tabelle drehen — deshalb steht sie unten vollständig da und wird
   nicht aus der Farbe gerechnet.

   ── Zugeschnitten, nicht auf ein Blatt gelegt ───────────────────
   Anders als bei den Echsen (solosprites.mjs) gibt es hier KEIN
   gemeinsames Blatt und keine Maßtabelle in tool.js. Es muss keine
   geben: Figur und Schiff haben je nur ein Bild, also gibt es nichts,
   was zueinander passen müsste. Die Figur steht mit der Unterkante
   ihres Zuschnitts auf dem Boden, das Schiff mit seiner Unterkante
   auf dem Wasser — beides weiß das Gerät aus dem Bild selbst.

   Verkleinert wird über multipliziertes Alpha (siehe png.mjs),
   sonst bekäme jede Figur einen dunklen Saum aus der Farbe ihrer
   durchsichtigen Bildpunkte.

   Aufruf:  node MPSkills/tools/wordisland/tools/heldsprites.mjs     */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lesePNG, schreibePNG, kasten, verkleinere } from './png.mjs';

const hier     = dirname(fileURLToPath(import.meta.url));
const crewDir  = join(hier, '..', 'sprites', 'crew');
const shipDir  = join(hier, '..', 'sprites');
const heldDir  = join(hier, '..', 'sprites', 'held');
const bootDir  = join(hier, '..', 'sprites', 'boot');

/* Wie groß die Zuschnitte werden.

   Die Figur bekommt dieselbe Höhe wie das Echsen-Blatt (340): sie
   steht neben den Tieren im selben Gelände, und damit ist sie auch
   beim Hineinzoomen genauso scharf wie sie — nicht schärfer und
   nicht gröber.

   Der Daumennagel ist so breit, wie die Reihe im Auswahlkasten ihn
   zeigt (54 px), mal zwei für dichte Bildschirme.

   Das Schiff wird in der BREITE gedeckelt und nicht in der Höhe: es
   ist ein liegendes Bild, und die Masten sind das, was oben
   herausragt. */
const HELD_H  = 340;
const KLEIN_H = 108;
const BOOT_B  = 420;

/* Volksnummer → Vorlage. Die Reihenfolge ist die von TEAMS in
   tool.js (0 Toast-Ritter … 7 Spuk-Einhorn).

   Die Namen stehen hier mit Umlaut und mit Sönkes Schreibweise da
   („türkis" klein, „Schiff" groß) — sie werden übernommen und nicht
   begradigt. Ein Dateiname, den dieser Erzeuger nicht findet, bricht
   hier ab; im Browser zeichnete er still nichts. */
const VOELKER = [
  { n: 0, name: 'Toast-Ritter',      crew: 'red 1 crew.png',     ship: 'red Schiff.png' },
  { n: 1, name: 'Robo-Enten',        crew: 'blue 1 crew.png',    ship: 'blue Schiff.png' },
  { n: 2, name: 'Brokkoli-Giraffen', crew: 'green 1 crew.png',   ship: 'green Schiff.png' },
  { n: 3, name: 'Mal-Hasen',         crew: 'yellow 1 crew.png',  ship: 'yellow Schiff.png' },
  { n: 4, name: 'Kosmische Katzen',  crew: 'lila 1 crew.png',    ship: 'lila Schiff.png' },
  { n: 5, name: 'Okto-Pferdchen',    crew: 'türkis 1 crew.png',  ship: 'türkis Schiff.png' },
  { n: 6, name: 'Wolken-Piraten',    crew: 'rosa 1 crew.png',    ship: 'rosa Schiff.png' },
  { n: 7, name: 'Spuk-Einhorn',      crew: 'magenta 1 crew.png', ship: 'magenta Schiff.png' }
];

/* Ein Bild einlesen, auf seinen Inhalt zuschneiden, auf ein Ziel
   bringen und schreiben. `nach` ist entweder eine Höhe oder eine
   Breite — was von beidem, sagt der Aufrufer, weil es von der Form
   des Bildes abhängt und nicht vom Verfahren. */
function backe(quelle, ziel, mass) {
  const im = lesePNG(readFileSync(quelle));
  const k = kasten(im);
  const f = mass.h ? mass.h / k.h : mass.b / k.w;
  const klein = verkleinere(im, k, f);
  const png = schreibePNG(klein.w, klein.h, klein.d);
  writeFileSync(ziel, png);
  return { roh: im, k, klein, bytes: png.length };
}

mkdirSync(heldDir, { recursive: true });
mkdirSync(bootDir, { recursive: true });

console.log('\nFigur und Schiff zuschneiden\n');
console.log('  Volk                 Figur                    Daumennagel   Schiff');
let gesamt = 0;

for (const v of VOELKER) {
  const gross = backe(join(crewDir, v.crew), join(heldDir, v.n + '.png'), { h: HELD_H });
  const klein = backe(join(crewDir, v.crew), join(heldDir, v.n + 'k.png'), { h: KLEIN_H });
  const boot  = backe(join(shipDir, v.ship), join(bootDir, v.n + '.png'), { b: BOOT_B });

  gesamt += gross.bytes + klein.bytes + boot.bytes;

  const masse = (x, y) => `${String(x).padStart(3)}×${String(y).padStart(3)}`;
  console.log(`  ${(v.n + ' ' + v.name).padEnd(20)} `
    + `${masse(gross.klein.w, gross.klein.h)} ${String((gross.bytes / 1024).toFixed(0)).padStart(3)} kB   `
    + `${masse(klein.klein.w, klein.klein.h)} ${String((klein.bytes / 1024).toFixed(0)).padStart(2)} kB   `
    + `${masse(boot.klein.w, boot.klein.h)} ${String((boot.bytes / 1024).toFixed(0)).padStart(3)} kB`);
}

console.log(`\n  → sprites/held/*.png und sprites/boot/*.png, `
  + `${(gesamt / 1024).toFixed(0)} kB für alle acht Völker`);
console.log('  (die Vorlagen sind zusammen rund 32 MB)\n');
