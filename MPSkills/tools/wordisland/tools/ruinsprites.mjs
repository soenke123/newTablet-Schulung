/* Schneidet die fünf RUINEN für die Insel zu.

   ── Warum es diesen Erzeuger gibt ───────────────────────────────
   Sönkes Vorlagen sind Bilder zum Ansehen, keine Spielbilder:

     sprites/Ruinen/<Name>.png   971 × 844,  0,3 – 1,1 MB je Stück

   Auf der Karte steht ein Ort knapp drei Kacheln breit — am Beamer
   also rund 200 Bildpunkte. Fünf Vorlagen sind zusammen 3,6 MB, und
   jedes Tablet im Raum lädt sie alle: die Ruinen liegen auf JEDER
   Insel, und welche wo, sieht man erst beim ersten Treffer.

   ── Ein Ausgang ────────────────────────────────────────────────
     sprites/ruine/<art>.png   höchstens 300 px hoch, 420 px breit

   `<art>` ist der Schlüssel aus wi_tiles.ruin_kind (klo, tor, arena,
   licht, schatten) und nicht der Dateiname der Vorlage. Das ist
   dieselbe Entscheidung wie bei heldsprites.mjs: der Schlüssel steht
   in der Datenbank, die Schreibweise steht nur im Ordner. Sönke
   benennt seine Ordner öfter um — die Tabelle unten fängt das ab,
   und ein Name, den dieser Erzeuger nicht findet, bricht HIER ab
   statt im Browser still nichts zu zeichnen.

   ── Gedeckelt auf BEIDEN Achsen ─────────────────────────────────
   Anders als Figur (Höhe) und Schiff (Breite) sind die fünf nicht
   von einer Form: der Torbogen ist breit, der Lichttempel hoch.
   Wer nur die Höhe deckelt, bekommt einen Torbogen, der doppelt so
   viele Bildpunkte trägt wie der Tempel daneben. Es greift also der
   kleinere der beiden Maßstäbe.

   Verkleinert wird über multipliziertes Alpha (siehe png.mjs),
   sonst bekäme jede Ruine einen dunklen Saum aus der Farbe ihrer
   durchsichtigen Bildpunkte.

   Aufruf:  node MPSkills/tools/wordisland/tools/ruinsprites.mjs     */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lesePNG, schreibePNG, kasten, verkleinere } from './png.mjs';

const hier    = dirname(fileURLToPath(import.meta.url));
const vorlage = join(hier, '..', 'sprites', 'Ruinen');
const ziel    = join(hier, '..', 'sprites', 'ruine');

const MAX_H = 300;
const MAX_B = 420;

/* Schlüssel → Vorlage. Sönkes Schreibweise, unverändert übernommen. */
const RUINEN = [
  { art: 'klo',      datei: 'Klo.png',            name: 'Klo' },
  { art: 'tor',      datei: 'Torbogen.png',       name: 'Torbogen' },
  { art: 'arena',    datei: 'Arena.png',          name: 'Arena' },
  { art: 'licht',    datei: 'Lichttempel.png',    name: 'Lichttempel' },
  { art: 'schatten', datei: 'Schattentempel.png', name: 'Schattentempel' }
];

function backe(quelle, nach) {
  const im = lesePNG(readFileSync(quelle));
  const k = kasten(im);
  const f = Math.min(MAX_H / k.h, MAX_B / k.w);
  const klein = verkleinere(im, k, f);
  const png = schreibePNG(klein.w, klein.h, klein.d);
  writeFileSync(nach, png);
  return { k, klein, bytes: png.length };
}

mkdirSync(ziel, { recursive: true });

console.log('\nRuinen zuschneiden\n');
console.log('  Ruine            Vorlage       Inhalt        Zuschnitt');
let gesamt = 0;

for (const r of RUINEN) {
  const b = backe(join(vorlage, r.datei), join(ziel, r.art + '.png'));
  gesamt += b.bytes;
  const masse = (x, y) => `${String(x).padStart(3)}×${String(y).padStart(3)}`;
  console.log(`  ${(r.art + ' (' + r.name + ')').padEnd(24)}`
    + `${masse(b.k.w, b.k.h)}   ${masse(b.klein.w, b.klein.h)}  `
    + `${String((b.bytes / 1024).toFixed(0)).padStart(3)} kB`);
}

console.log(`\n  → sprites/ruine/*.png, ${(gesamt / 1024).toFixed(0)} kB für alle fünf`);
console.log('  (die Vorlagen sind zusammen rund 3,6 MB)\n');
