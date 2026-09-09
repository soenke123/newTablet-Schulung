/* Backt die neun Echsen-Bilder in solo-sprites.js ein.

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

   ── Alle neun teilen EIN Blatt ───────────────────────────────────
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
   beim Einschlafen. Also: ein Maßstab für alle neun, und je Bild
   gemerkt, WO im Blatt sein Kasten sitzt.

   Zugeschnitten wird trotzdem, sonst wären es neun fast leere
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
import zlib from 'node:zlib';

const hier = dirname(fileURLToPath(import.meta.url));
const spriteDir = join(hier, '..', 'sprites', 'Echse');
const ziel = join(hier, '..', 'solo-sprites.js');

/* ── Zweiter Ausgang: das ausgelieferte Spiel ────────────────────
   Der Showroom braucht Daten-Adressen (siehe oben). Das eingebaute
   Spiel braucht das GEGENTEIL: es läuft über https, dort verfärbt
   ein Bild die Leinwand nicht, und 400 kB Base64 in der tool.js
   wären 400 kB, die bei jeder Änderung an ihr neu übertragen
   werden. Also einmal neun Dateien und eine Maßtabelle.

   Die Maßtabelle wird in tool.js HINEINGESCHRIEBEN, zwischen die
   beiden Marken unten. Sie von Hand zu übertragen hieße, dass sie
   beim nächsten Zuschnitt stehen bleibt — und ein Tier, das um
   sechs Bildpunkte im Boden steckt, sucht man lange.

   Der Ordner heißt `tier` und nicht `echse`: Windows hält Groß-
   und Kleinschreibung im Dateinamen nicht auseinander, und
   `sprites/echse/` wäre derselbe Ordner wie `sprites/Echse/` — die
   neun Zuschnitte lägen zwischen den 2,7 MB Vorlagen und gingen mit
   ins Deployment. */
const bildDir  = join(hier, '..', 'sprites', 'tier');
const toolJs   = join(hier, '..', 'tool.js');
const MARKE_A  = '/* ERZEUGT VON tools/solosprites.mjs — nicht von Hand ändern */';
const MARKE_E  = '/* ENDE ERZEUGT */';

/* Auf diese Höhe wird das BLATT gebracht — nicht das einzelne Tier.
   Alle neun teilen damit denselben Maßstab. */
const BLATT_H = 340;

/* Der Ankerpunkt im Blatt, in Vorlagen-Pixeln: die Grundlinie, auf
   der Echse0/1/2 stehen (826), und die Mitte ihrer Kästen (455).
   Auf diesen Punkt setzt der Showroom das Tier ins Gelände; alles
   andere ergibt sich aus der Vorlage — dass der Flieger schwebt,
   steht dann im Bild und muss nicht nachprogrammiert werden. */
const ANKER_X = 455, ANKER_Y = 826;

const DATEIEN = [
  ['ei',   'Echse0.png'],
  ['s1',   'Echse1.png'],
  ['s1z',  'Echse1snooze.png'],
  ['s2',   'Echse2.png'],
  ['s2z',  'Echse2snooze.png'],
  ['s3a',  'Echse3a.png'],
  ['s3az', 'Echse3asnooze.png'],
  ['s3b',  'Echse3b.png'],
  ['s3bz', 'Echse3bsnooze.png']
];

/* ── PNG lesen ──────────────────────────────────────────────────
   Nur der Fall, der hier vorkommt: 8 Bit, Farbtyp 6 (RGBA), nicht
   verschachtelt. Alles andere wird abgelehnt statt still falsch
   gelesen — ein halb entschlüsseltes Bild sieht aus wie ein Fehler
   im Zeichner. */
function lesePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('kein PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const bitTiefe = buf[24], farbTyp = buf[25], verschachtelt = buf[28];
  if (bitTiefe !== 8 || farbTyp !== 6 || verschachtelt !== 0) {
    throw new Error(`nicht unterstützt: Bit ${bitTiefe}, Typ ${farbTyp}, verschachtelt ${verschachtelt}`);
  }

  const teile = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const typ = buf.toString('ascii', p + 4, p + 8);
    if (typ === 'IDAT') teile.push(buf.subarray(p + 8, p + 8 + len));
    if (typ === 'IEND') break;
    p += 12 + len;
  }
  const roh = zlib.inflateSync(Buffer.concat(teile));

  /* Entfiltern. Jede Zeile trägt vorn ein Byte, das sagt, gegen was
     sie gerechnet wurde. Paeth (4) ist der einzige, bei dem man sich
     leicht vertut: er wählt den Nachbarn, dessen Vorhersage am
     nächsten liegt. */
  const bpp = 4, zeile = w * bpp;
  const aus = Buffer.alloc(h * zeile);
  for (let y = 0; y < h; y++) {
    const f = roh[y * (zeile + 1)];
    const ein = roh.subarray(y * (zeile + 1) + 1, y * (zeile + 1) + 1 + zeile);
    const hier0 = y * zeile, oben0 = (y - 1) * zeile;
    for (let i = 0; i < zeile; i++) {
      const a = i >= bpp ? aus[hier0 + i - bpp] : 0;
      const b = y > 0 ? aus[oben0 + i] : 0;
      const c = (y > 0 && i >= bpp) ? aus[oben0 + i - bpp] : 0;
      let v;
      if (f === 0) v = ein[i];
      else if (f === 1) v = ein[i] + a;
      else if (f === 2) v = ein[i] + b;
      else if (f === 3) v = ein[i] + ((a + b) >> 1);
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = ein[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error('unbekannter Zeilenfilter ' + f);
      aus[hier0 + i] = v & 255;
    }
  }
  return { w, h, d: aus };
}

/* ── PNG schreiben ────────────────────────────────────────────── */
let crcTab = null;
function crc32(buf) {
  if (!crcTab) {
    crcTab = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTab[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTab[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(typ, daten) {
  const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
  const koerper = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(koerper));
  return Buffer.concat([len, koerper, crc]);
}
function schreibePNG(w, h, d) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const zeile = w * 4, bpp = 4;

  /* Der Zeilenfilter wird GEWÄHLT und nicht festgelegt. Das ist bei
     diesen Bildern kein Feinschliff, sondern der Unterschied zwischen
     3 MB und einem Bruchteil davon: die Aquarellflächen sind weich,
     also stehen benachbarte Bildpunkte fast auf demselben Wert — und
     ein Filter, der nur die DIFFERENZ speichert, macht daraus lauter
     Nullen, die sich wegpacken lassen. Ungefiltert (0) speichert man
     dagegen jeden Farbwert voll aus.

     Gewählt wird nach der üblichen Faustregel: die Zeile nehmen, deren
     gefilterte Bytes in der Summe am kleinsten sind (als
     vorzeichenbehaftet gelesen). */
  const mitFilter = Buffer.alloc(h * (zeile + 1));
  const kandidat = Buffer.alloc(zeile);
  for (let y = 0; y < h; y++) {
    const hier0 = y * zeile, oben0 = (y - 1) * zeile;
    let bestF = 0, bestSumme = Infinity;
    const zielRaus = y * (zeile + 1) + 1;

    for (let f = 0; f < 5; f++) {
      let summe = 0;
      for (let i = 0; i < zeile; i++) {
        const x = d[hier0 + i];
        const a = i >= bpp ? d[hier0 + i - bpp] : 0;
        const b = y > 0 ? d[oben0 + i] : 0;
        const c = (y > 0 && i >= bpp) ? d[oben0 + i - bpp] : 0;
        let v;
        if (f === 0) v = x;
        else if (f === 1) v = x - a;
        else if (f === 2) v = x - b;
        else if (f === 3) v = x - ((a + b) >> 1);
        else {
          const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 255;
        kandidat[i] = v;
        summe += v < 128 ? v : 256 - v;
      }
      if (summe < bestSumme) {
        bestSumme = summe; bestF = f;
        kandidat.copy(mitFilter, zielRaus);
      }
    }
    mitFilter[y * (zeile + 1)] = bestF;
    /* Der zuletzt geschriebene Kandidat ist nicht zwingend der beste —
       nur der letzte, der besser WAR. Passt, weil nur dann kopiert
       wird; der Vollständigkeit halber trotzdem festgehalten. */
    void bestSumme;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(mitFilter, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ── Zuschneiden und verkleinern ──────────────────────────────── */
function kasten(im) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      if (im.d[(y * im.w + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* `f` ist der Maßstab des BLATTES und für alle neun derselbe — nicht
   „bring diesen Kasten auf diese Höhe". Genau darin lag der Fehler. */
function verkleinere(im, k, f) {
  const zielW = Math.max(1, Math.round(k.w * f));
  const zielH = Math.max(1, Math.round(k.h * f));
  const aus = Buffer.alloc(zielW * zielH * 4);
  const fx = k.w / zielW, fy = k.h / zielH;
  for (let y = 0; y < zielH; y++) {
    const sy0 = k.y0 + y * fy, sy1 = k.y0 + (y + 1) * fy;
    for (let x = 0; x < zielW; x++) {
      const sx0 = k.x0 + x * fx, sx1 = k.x0 + (x + 1) * fx;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        if (sy < 0 || sy >= im.h) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          if (sx < 0 || sx >= im.w) continue;
          const p = (sy * im.w + sx) * 4;
          const al = im.d[p + 3] / 255;
          /* Multipliziertes Alpha: der Farbwert zählt nur so weit
             mit, wie der Bildpunkt überhaupt da ist. */
          r += im.d[p] * al; g += im.d[p + 1] * al; b += im.d[p + 2] * al;
          a += im.d[p + 3]; n++;
        }
      }
      if (!n) continue;
      const q = (y * zielW + x) * 4;
      const am = a / n;
      const zurueck = am > 0 ? 255 / am : 0;
      aus[q]     = Math.min(255, Math.round(r / n * zurueck));
      aus[q + 1] = Math.min(255, Math.round(g / n * zurueck));
      aus[q + 2] = Math.min(255, Math.round(b / n * zurueck));
      aus[q + 3] = Math.round(am);
    }
  }
  return { w: zielW, h: zielH, d: aus };
}

/* ── Lauf ─────────────────────────────────────────────────────── */
const zeilen = [];
const masse  = [];
mkdirSync(bildDir, { recursive: true });
let gesamt = 0;
let blattW = 0, blattH = 0;
console.log('\nEchsen einbacken\n');
console.log('  Datei                Kasten im Blatt          → eingebacken     Größe');
for (const [schluessel, datei] of DATEIEN) {
  const roh = readFileSync(join(spriteDir, datei));
  const im = lesePNG(roh);
  if (!blattH) { blattW = im.w; blattH = im.h; }
  if (im.w !== blattW || im.h !== blattH) {
    throw new Error(`${datei} ist ${im.w}×${im.h}, das Blatt ist ${blattW}×${blattH} — `
      + 'alle neun müssen auf DEMSELBEN Blatt liegen, sonst stimmt der gemeinsame Maßstab nicht.');
  }
  const f = BLATT_H / blattH;
  const k = kasten(im);
  const klein = verkleinere(im, k, f);
  const png = schreibePNG(klein.w, klein.h, klein.d);
  gesamt += png.length;

  const x = +(k.x0 * f).toFixed(2), y = +(k.y0 * f).toFixed(2);
  console.log(`  ${datei.padEnd(20)} ${String(k.w).padStart(3)}×${String(k.h).padStart(3)} bei `
            + `${String(k.x0).padStart(3)},${String(k.y0).padStart(3)}  → ${String(klein.w).padStart(3)}×${String(klein.h).padStart(3)}`
            + ` bei ${String(x).padStart(6)},${String(y).padStart(6)}   ${(png.length / 1024).toFixed(0)} kB`);
  zeilen.push(`  ${schluessel}: { x: ${x}, y: ${y}, d: '${'data:image/png;base64,' + png.toString('base64')}' }`);

  // Zweiter Ausgang: dieselben Bildpunkte als Datei, dieselben Maße
  // als Zahl. Beide kommen aus DEMSELBEN Zuschnitt — nur so kann
  // die Tabelle nicht zum Bild danebenliegen.
  writeFileSync(join(bildDir, schluessel + '.png'), png);
  masse.push(`      ${(schluessel + ':').padEnd(6)} { x: ${String(x).padStart(6)}, `
           + `y: ${String(y).padStart(6)}, w: ${String(klein.w).padStart(3)}, h: ${String(klein.h).padStart(3)} }`);
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

   2. EIN gemeinsames Blatt. Alle neun Vorlagen sind aufeinander
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
console.log(`  → sprites/tier/*.png, neun Dateien (Spiel)`);

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
