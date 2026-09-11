/* Backt alle Echsen-Bilder in solo-sprites.js ein.

   ── Warum überhaupt ──────────────────────────────────────────────
   Der Showroom rechnet die acht Farbvarianten selbst aus, und dafür
   muss er die Bildpunkte lesen (getImageData). Ein Bild, das von
   `file://` geladen wurde, VERFÄRBT die Leinwand aber — Chrome hält
   jede lokale Datei für eine eigene Herkunft, und danach ist
   getImageData gesperrt:

     „The canvas has been tainted by cross-origin data."

   Damit wäre die Datei per Doppelklick unbrauchbar, und ein
   Prüfstand, für den man erst einen Server hochziehen muss, ist
   keiner. Eine Daten-Adresse (data:) gilt dagegen als eigene Herkunft
   und verfärbt nichts. Also werden die Bilder eingebacken.

   ── Alle Vorlagen teilen EIN Blatt ───────────────────────────────────
   Die Vorlagen sind 890 × 968, und sie sind aufeinander gezeichnet.
   Nachgemessen:

     Echse0/1/2 stehen mit der Unterkante auf 826 / 826 / 823 —
     das ist eine gemeinsame GRUNDLINIE, kein Zufall.
     Echse3a hört schon bei 728 auf: der Flieger schwebt, und zwar
     absichtlich. Die Schlaf-Fassungen liegen bei 846–858, also
     flach auf demselben Boden.

   Daraus folgt die eine Regel, an der der erste Anlauf gescheitert
   ist: verkleinert wird mit dem BLATT und nicht mit dem Tier. Wer
   jede Datei auf dieselbe Höhe bringt, bläst die zusammengerollte
   Schlaf-Echse auf die Größe der stehenden auf — sie wächst dann
   beim Einschlafen. Also: ein Maßstab für alle, und je Bild
   gemerkt, WO im Blatt sein Kasten sitzt.

   Zugeschnitten wird trotzdem, sonst wären es zwanzig fast leere
   Blätter. Der Zuschnitt ist aber nur eine Verpackung: mit `x`/`y`
   findet der Showroom die Stelle im Blatt wieder.

   Verkleinert wird über MULTIPLIZIERTES Alpha. Rechnet man den
   Mittelwert auf den rohen Farbwerten, mischt sich die Farbe der
   durchsichtigen Bildpunkte mit hinein — und weil die außerhalb des
   Umrisses meist schwarz ist, bekäme jedes Tier einen dunklen Saum.

   Aufruf:  node MPSkills/tools/wordisland/tools/solosprites.mjs      */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/* Lesen, Zuschneiden, Verkleinern, Schreiben stehen seit 11.09.2026
   in tools/png.mjs — der zweite Erzeuger (heldsprites.mjs) braucht
   dieselben vier Funktionen, und zwei Abschriften desselben
   PNG-Schreibers wären zwei Bildqualitäten im selben Spiel. */
import { lesePNG, schreibePNG, kasten, verkleinere } from './png.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const spriteDir = join(hier, '..', 'sprites', 'Echse');
const ziel = join(hier, '..', 'solo-sprites.js');

/* ── Zweiter Ausgang: das ausgelieferte Spiel ────────────────────
   Der Showroom braucht Daten-Adressen (siehe oben). Das eingebaute
   Spiel braucht das GEGENTEIL: es läuft über https, dort verfärbt
   ein Bild die Leinwand nicht, und 400 kB Base64 in der tool.js
   wären 400 kB, die bei jeder Änderung an ihr neu übertragen
   werden. Also einmal zwanzig Dateien und eine Maßtabelle.

   Die Maßtabelle wird in tool.js HINEINGESCHRIEBEN, zwischen die
   beiden Marken unten. Sie von Hand zu übertragen hieße, dass sie
   beim nächsten Zuschnitt stehen bleibt — und ein Tier, das um
   sechs Bildpunkte im Boden steckt, sucht man lange.

   Der Ordner heißt `tier` und nicht `echse`: Windows hält Groß-
   und Kleinschreibung im Dateinamen nicht auseinander, und
   `sprites/echse/` wäre derselbe Ordner wie `sprites/Echse/` — die
   Zuschnitte lägen zwischen den Vorlagen und gingen mit
   ins Deployment. */
const bildDir  = join(hier, '..', 'sprites', 'tier');
const toolJs   = join(hier, '..', 'tool.js');
const MARKE_A  = '/* ERZEUGT VON tools/solosprites.mjs — nicht von Hand ändern */';
const MARKE_E  = '/* ENDE ERZEUGT */';

/* Auf diese Höhe wird das BLATT gebracht — nicht das einzelne Tier.
   Alle teilen damit denselben Maßstab. */
const BLATT_H = 340;

/* Der Ankerpunkt im Blatt, in Vorlagen-Pixeln: die Grundlinie, auf
   der Echse0/1/2 stehen (826), und die Mitte ihrer Kästen (455).
   Auf diesen Punkt setzt der Showroom das Tier ins Gelände; alles
   andere ergibt sich aus der Vorlage — dass der Flieger schwebt,
   steht dann im Bild und muss nicht nachprogrammiert werden. */
const ANKER_X = 455, ANKER_Y = 826;

/* ── Der Schlüssel IST der Dateiname ─────────────────────────────
   `Echse<Stufe><Variante>.png` → `s<Stufe><Variante>`, Anhängsel
   `z` fürs Schlafen und `s` fürs Schwimmen. Echse0 heißt `ei`, weil
   ein Ei keine Stufe ist, die man ansieht, sondern ein Ei.

   Die Versuchung war, die drei Fassungen der Stufe 2 sauber
   `s2a/s2b/s2c` zu nennen. Dann hieße aber `Echse2a.png` plötzlich
   `s2b` — eine Verschiebung um eins zwischen Ordner und Quelltext,
   und die sucht beim nächsten Nachschärfen jemand eine Stunde lang.
   Also bleibt die erste Fassung `s2` ohne Buchstaben.              */
const DATEIEN = [
  ['ei',   'Echse0.png'],
  ['s1',   'Echse1.png'],
  ['s1z',  'Echse1snooze.png'],

  // Stufe 2 — drei gleichberechtigte Fassungen
  ['s2',   'Echse2.png'],
  ['s2z',  'Echse2snooze.png'],
  ['s2a',  'Echse2a.png'],
  ['s2az', 'Echse2asnooze.png'],
  ['s2b',  'Echse2b.png'],
  ['s2bz', 'Echse2bsnooze.png'],

  // Stufe 3 — fünf Fassungen, d und e sind die seltenen
  ['s3a',  'Echse3a.png'],
  ['s3az', 'Echse3asnooze.png'],
  ['s3b',  'Echse3b.png'],
  ['s3bz', 'Echse3bsnooze.png'],
  ['s3c',  'Echse3c.png'],
  ['s3cz', 'Echse3csnooze.png'],
  ['s3d',  'Echse3d.png'],
  ['s3dz', 'Echse3dsnooze.png'],

  /* Die Schwimmerin. Sie fliegt nicht, also hat sie ein drittes
     Bild: an Land laufend, an Land schlafend, auf dem Wasser
     treibend. Das ist der einzige Schlüssel mit `s` am Ende. */
  ['s3e',  'Echse3e.png'],
  ['s3ez', 'Echse3esnooze.png'],
  ['s3es', 'Echse3eswim.png']
];

/* Die Bild-Werkstatt (lesePNG/schreibePNG/kasten/verkleinere) steht
   in png.mjs — siehe den Import oben. */

/* ── Lauf ─────────────────────────────────────────────────────── */
const zeilen = [];
const masse  = [];
mkdirSync(bildDir, { recursive: true });
let gesamt = 0;
let blattW = 0, blattH = 0;
/* Wie weit die Unterkante eines Bildes von der gemeinsamen
   Grundlinie abweicht. Die Zahl steht mit im Bericht, weil sie das
   Einzige ist, was man einer neuen Vorlage NICHT ansieht: ein Tier,
   das um hundert Vorlagen-Pixel zu hoch gezeichnet ist, schwebt
   nachher über dem Boden, und man sucht den Fehler im Zeichner.

   Erwartet wird sie nur bei dem, was auf dem Boden steht. Flieger
   schweben absichtlich (Minus), andere lassen Schwanz oder Flossen
   herunterhängen (Plus), und die Schwimmerin bringt ihre Wasserlinie
   im Bild mit — bei ihnen ist die Zahl Auskunft und kein Urteil. */
const abweichung = [];
console.log('\nEchsen einbacken\n');
console.log('  Datei                Kasten im Blatt          → eingebacken     Größe   Grundlinie');
for (const [schluessel, datei] of DATEIEN) {
  const roh = readFileSync(join(spriteDir, datei));
  const im = lesePNG(roh);
  if (!blattH) { blattW = im.w; blattH = im.h; }
  if (im.w !== blattW || im.h !== blattH) {
    throw new Error(`${datei} ist ${im.w}×${im.h}, das Blatt ist ${blattW}×${blattH} — `
      + 'alle müssen auf DEMSELBEN Blatt liegen, sonst stimmt der gemeinsame Maßstab nicht.');
  }
  const f = BLATT_H / blattH;
  const k = kasten(im);
  const klein = verkleinere(im, k, f);
  const png = schreibePNG(klein.w, klein.h, klein.d);
  gesamt += png.length;

  const x = +(k.x0 * f).toFixed(2), y = +(k.y0 * f).toFixed(2);
  const dGrund = (k.y0 + k.h - 1) - ANKER_Y;
  abweichung.push([datei, dGrund]);
  console.log(`  ${datei.padEnd(20)} ${String(k.w).padStart(3)}×${String(k.h).padStart(3)} bei `
            + `${String(k.x0).padStart(3)},${String(k.y0).padStart(3)}  → ${String(klein.w).padStart(3)}×${String(klein.h).padStart(3)}`
            + ` bei ${String(x).padStart(6)},${String(y).padStart(6)}   ${String((png.length / 1024).toFixed(0)).padStart(3)} kB`
            + `   ${(dGrund >= 0 ? '+' : '') + dGrund}`.padStart(9));
  zeilen.push(`  ${schluessel}: { x: ${x}, y: ${y}, d: '${'data:image/png;base64,' + png.toString('base64')}' }`);

  // Zweiter Ausgang: dieselben Bildpunkte als Datei, dieselben Maße
  // als Zahl. Beide kommen aus DEMSELBEN Zuschnitt — nur so kann
  // die Tabelle nicht zum Bild danebenliegen.
  writeFileSync(join(bildDir, schluessel + '.png'), png);
  masse.push(`      ${(schluessel + ':').padEnd(6)} { x: ${String(x).padStart(6)}, `
           + `y: ${String(y).padStart(6)}, w: ${String(klein.w).padStart(3)}, h: ${String(klein.h).padStart(3)} }`);
}

/* Was auf dem Boden steht, gehört auf die Grundlinie. Kein Abbruch —
   eine Vorlage ist nichts, was ein Erzeuger reparieren könnte —,
   aber laut genug, dass man es nicht überliest. */
{
  const AM_BODEN = /^Echse[012]/;
  const schief = abweichung.filter(([d, v]) => AM_BODEN.test(d) && Math.abs(v) > 60);
  if (schief.length) {
    console.log('\n  ⚠️  Diese Vorlagen stehen auf dem Boden, liegen aber neben der Grundlinie:');
    for (const [d, v] of schief) {
      console.log(`        ${d.padEnd(20)} ${v > 0 ? '+' + v + ' (steckt im Boden)' : v + ' (schwebt)'}`);
    }
    console.log('      Zu beheben ist das im BILD (Inhalt im Blatt verschieben), nicht im Zeichner.\n');
  }
}

const f = BLATT_H / blattH;
const ax = +(ANKER_X * f).toFixed(2), ay = +(ANKER_Y * f).toFixed(2);

const kopf = `/* ERZEUGT — nicht von Hand ändern.
   Quelle: sprites/Echse/*.png
   Erzeuger: tools/solosprites.mjs  (dort steht auch, WARUM)

   Zwei Dinge stecken hier drin.

   1. DATEN-ADRESSEN statt Dateien. Der Showroom rechnet seine acht
      Farbvarianten selbst aus und muss dafür die Bildpunkte lesen.
      Ein Bild von \`file://\` verfärbt aber die Leinwand, und danach
      ist getImageData gesperrt — die Datei wäre per Doppelklick
      unbrauchbar. Als Daten-Adresse passiert das nicht.

   2. EIN gemeinsames Blatt. Alle Vorlagen sind aufeinander
      gezeichnet (${blattW}×${blattH}, gemeinsame Grundlinie). Verkleinert
      wird deshalb mit dem BLATT, nicht mit dem einzelnen Tier —
      sonst wächst die zusammengerollte Schlaf-Echse beim Einschlafen
      auf die Größe der stehenden. \`x\`/\`y\` sagen, wo der Zuschnitt
      im Blatt saß; \`anker\` ist der Punkt, den der Showroom ins
      Gelände setzt.

   Zugeschnitten und auf ein Blatt von ${BLATT_H} px verkleinert sind es
   ${(gesamt / 1024).toFixed(0)} kB statt 2,7 MB.

   Neu erzeugen:  node MPSkills/tools/wordisland/tools/solosprites.mjs */

window.SOLO_SPRITES = {
  blatt: { w: ${+(blattW * f).toFixed(2)}, h: ${BLATT_H}, ankerX: ${ax}, ankerY: ${ay} },
  bilder: {
`;
writeFileSync(ziel, kopf + zeilen.join(',\n') + '\n  }\n};\n');
console.log(`\n  Blatt ${blattW}×${blattH} → ${(blattW * f).toFixed(0)}×${BLATT_H}, Anker ${ax},${ay}`);
console.log(`  → solo-sprites.js, ${(gesamt / 1024).toFixed(0)} kB Bilddaten (Showroom)`);
console.log(`  → sprites/tier/*.png, ${DATEIEN.length} Dateien (Spiel)`);

/* ── Die Maßtabelle in tool.js schreiben ──────────────────────── */
const block =
`${MARKE_A}
  const ECHSE = {
    blatt: { w: ${+(blattW * f).toFixed(2)}, h: ${BLATT_H}, ankerX: ${ax}, ankerY: ${ay} },
    bilder: {
${masse.join(',\n')}
    }
  };
  ${MARKE_E}`;

const quelle = readFileSync(toolJs, 'utf8');
const a = quelle.indexOf(MARKE_A);
const e = quelle.indexOf(MARKE_E, a);
if (a < 0 || e < 0) {
  console.log('\n  ⚠️  In tool.js fehlen die Marken. Diesen Block EINMAL von Hand');
  console.log('      einsetzen; ab dann schreibt der Erzeuger ihn selbst nach.\n');
  console.log(block.split('\n').map(z => '  ' + z).join('\n') + '\n');
} else {
  writeFileSync(toolJs, quelle.slice(0, a) + block + quelle.slice(e + MARKE_E.length));
  console.log(`  → tool.js, Maßtabelle zwischen den Marken erneuert\n`);
}
