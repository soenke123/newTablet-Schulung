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

   ── Die Ausgänge ────────────────────────────────────────────────
     sprites/held/<n>_<s>.png   Figur, 340 px hoch   — auf der Insel
     sprites/held/<n>_<s>k.png  Figur, 108 px hoch   — die Auswahlreihe
     sprites/held/<n>.png       dieselbe für Stufe 1 — der Rückfall
     sprites/held/<n>k.png      dito, klein
     sprites/boot/<n>.png       Schiff, 420 px breit — auf dem Wasser

   `<s>` ist die BILDSTUFE 1…4 und nicht das Level: Level 5 bekommt
   kein eigenes Bild, es ist die vierte Fassung mit einem goldenen
   Filter beim Zeichnen (HELD_GOLD_FILTER in tool.js). Vier Bilder,
   fünf Level — das ist Absicht und kein fehlendes Bild.

   Dass `<n>.png` inhaltsgleich mit `<n>_1.png` ist, ist gewollt:
   `volkBildBasis` in tool.js greift darauf zurück, wenn eine
   Level-Fassung fehlt, und ein Rückfall, der selbst eine Stufe
   behauptet, ist keiner. Beide entstehen hier im selben Durchgang
   aus derselben Vorlage und können nicht auseinanderlaufen.

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
   hier ab; im Browser zeichnete er still nichts.

   `farbe` ist der Stamm des Dateinamens: die Vorlagen heißen
   „<farbe> <stufe> crew.png". Die Stufe steht also IM Namen der
   Vorlage und nicht in einem eigenen Ordner — deshalb wird sie hier
   angehängt und nicht mit ausgeschrieben. */
const STUFEN = 4;
const VOELKER = [
  { n: 0, name: 'Toast-Ritter',      farbe: 'red',     ship: 'red Schiff.png' },
  { n: 1, name: 'Robo-Enten',        farbe: 'blue',    ship: 'blue Schiff.png' },
  { n: 2, name: 'Brokkoli-Giraffen', farbe: 'green',   ship: 'green Schiff.png' },
  { n: 3, name: 'Mal-Hasen',         farbe: 'yellow',  ship: 'yellow Schiff.png' },
  { n: 4, name: 'Kosmische Katzen',  farbe: 'lila',    ship: 'lila Schiff.png' },
  { n: 5, name: 'Okto-Pferdchen',    farbe: 'türkis',  ship: 'türkis Schiff.png' },
  { n: 6, name: 'Wolken-Piraten',    farbe: 'rosa',    ship: 'rosa Schiff.png' },
  { n: 7, name: 'Spuk-Einhorn',      farbe: 'magenta', ship: 'magenta Schiff.png' }
];
const vorlage = (v, s) => join(crewDir, `${v.farbe} ${s} crew.png`);

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
console.log('  Volk                 Stufe   Figur           Daumennagel');
let gesamt = 0;

const masse = (x, y) => `${String(x).padStart(3)}×${String(y).padStart(3)}`;

for (const v of VOELKER) {
  for (let s = 1; s <= STUFEN; s++) {
    const q = vorlage(v, s);
    const gross = backe(q, join(heldDir, `${v.n}_${s}.png`),  { h: HELD_H });
    const klein = backe(q, join(heldDir, `${v.n}_${s}k.png`), { h: KLEIN_H });
    gesamt += gross.bytes + klein.bytes;

    /* Stufe 1 ist zugleich der Rückfall. Zweimal dieselbe Datei zu
       schreiben ist billiger als ein Sonderfall in tool.js. */
    if (s === 1) {
      gesamt += backe(q, join(heldDir, v.n + '.png'),  { h: HELD_H }).bytes;
      gesamt += backe(q, join(heldDir, v.n + 'k.png'), { h: KLEIN_H }).bytes;
    }

    /* Der Zuschnitt je Stufe steht mit in der Ausgabe: alle vier
       Fassungen eines Volkes werden auf DIESELBE Höhe gebracht (die
       Figur soll beim Aufstieg nicht springen), die Breite ergibt
       sich. Weicht eine stark ab, hat die Vorlage eine andere Pose —
       dann sieht man es hier und nicht erst auf der Insel. */
    console.log(`  ${(s === 1 ? v.n + ' ' + v.name : '').padEnd(20)} `
      + `  ${s}     ${masse(gross.klein.w, gross.klein.h)} `
      + `${String((gross.bytes / 1024).toFixed(0)).padStart(3)} kB   `
      + `${masse(klein.klein.w, klein.klein.h)} `
      + `${String((klein.bytes / 1024).toFixed(0)).padStart(2)} kB`);
  }
  const boot = backe(join(shipDir, v.ship), join(bootDir, v.n + '.png'), { b: BOOT_B });
  gesamt += boot.bytes;
  console.log(`  ${''.padEnd(20)}   Schiff  ${masse(boot.klein.w, boot.klein.h)} `
    + `${String((boot.bytes / 1024).toFixed(0)).padStart(3)} kB`);
}

console.log(`\n  → sprites/held/*.png und sprites/boot/*.png, `
  + `${(gesamt / 1024).toFixed(0)} kB für alle acht Völker`);
console.log('  (die Vorlagen sind zusammen rund 60 MB)\n');
