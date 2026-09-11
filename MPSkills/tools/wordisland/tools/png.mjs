/* PNG lesen, zuschneiden, verkleinern, schreiben — ohne Bibliothek.

   Herkunft: diese vier Funktionen standen bis 11.09.2026 in
   solosprites.mjs. Sie stehen jetzt hier, weil es einen zweiten
   Erzeuger gibt (heldsprites.mjs) und zwei Abschriften desselben
   PNG-Schreibers die schlechtere Hälfte der Arbeit doppelt machen:
   wer den Zeilenfilter in einer der beiden verbessert, hat danach
   zwei verschiedene Bildqualitäten im selben Spiel.

   Warum überhaupt von Hand: die Vorlagen sind 8 Bit RGBA, nicht
   verschachtelt, und mehr braucht hier niemand. Eine Abhängigkeit
   für einen Fall, der aus vier Funktionen besteht, wäre ein
   npm-Ordner im Gepäck jeder Prüfung.                             */

import zlib from 'node:zlib';

/* ── PNG lesen ──────────────────────────────────────────────────
   Nur der Fall, der hier vorkommt: 8 Bit, Farbtyp 6 (RGBA), nicht
   verschachtelt. Alles andere wird abgelehnt statt still falsch
   gelesen — ein halb entschlüsseltes Bild sieht aus wie ein Fehler
   im Zeichner. */
export function lesePNG(buf) {
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
export function schreibePNG(w, h, d) {
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
export function kasten(im) {
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
export function verkleinere(im, k, f) {
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
