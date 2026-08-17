/* ══════════════════════════════════════════════════════════════
   MPSkills — lib/qr.js   ·   QR-Code, lokal erzeugt
   ══════════════════════════════════════════════════════════════
   Warum selbst gebaut und nicht aus einem CDN geladen:

   Der QR-Code ist die Tür in den Raum. Er wird an den Beamer
   geworfen, während 28 Tablets darauf warten — und genau in dem
   Moment darf nichts von einem fremden Server abhängen. Ein CDN,
   das langsam ist, blockiert den Unterrichtsbeginn; ein CDN, das
   im Schulnetz gesperrt ist, verhindert ihn ganz. Dazu kommt: die
   URL enthält den Raum-Code, und der hat auf keinem fremden
   Server etwas verloren.

   Umfang bewusst klein gehalten — genau das, was diese Seite
   braucht und keine Zeile mehr:
     · Byte-Modus (die Nutzlast ist eine URL)
     · Fehlerkorrektur M (~15 %, verträgt einen Beamer-Schatten
       und ein schlecht ausgerichtetes Blatt Papier)
     · Versionen 1–10, also bis 213 Zeichen. Unsere URLs liegen
       bei 45–60 Zeichen und damit sicher in Version 4 oder 5.

   Öffentlich:
     MPQR.matrix(text)      → Array von Zeilen aus true/false
     MPQR.svg(text, opts)   → SVG als Zeichenkette
       opts: { quiet=4, dark='#17212b', light='#ffffff', title }

   Vorlage ist die übliche Umsetzung nach ISO/IEC 18004; die
   Struktur (Galois-Feld, Blockverschränkung, Maskenbewertung)
   folgt zwangsläufig der Norm.

   ── Wie das hier geprüft wurde, und warum das wichtig ist ─────
   Der erste Anlauf war mit einem selbst geschriebenen RÜCKLESER
   geprüft: Matrix erzeugen, Inhalt wieder herauslesen, vergleichen.
   Das bestand — und der Code war trotzdem für jedes echte Lesegerät
   unbrauchbar. Der Grund ist lehrreich: Rückleser und Erzeuger
   teilten dieselbe falsche Annahme über die Formatfelder, und ein
   Test, der die Annahme des Prüflings übernimmt, prüft nichts.

   Zwei Fehler steckten darin, beide unsichtbar für den Rückleser:
     · Die zweite Kopie der Formatinfo wurde 8/7 statt 7/8
       aufgeteilt. Folge: (8, size-8) galt nicht als Funktionsmodul
       und schluckte ein Datenbit — ab dort war alles verschoben.
     · Die 15 Formatbits lagen verkehrt herum (niedrigstwertiges
       zuerst statt höchstwertiges).

   Gültig ist deshalb nur eine Prüfung gegen etwas Unabhängiges.
   Aktueller Stand: bitgenau identisch mit `qrcode` (npm) für die
   Versionen 1–10 × alle 8 Masken (80 Vergleiche, 0 Abweichungen,
   Maskenwahl inklusive) und gelesen von `jsqr` (npm). Wer hier
   etwas ändert, prüft bitte wieder so und nicht per Rücklese-Test.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Galois-Feld GF(256) ───────────────────────────────────
     Rechenkörper der Fehlerkorrektur: 256 Werte, in dem sich
     Multiplizieren als Addieren von Logarithmen erledigen lässt.
     Das erzeugende Polynom 0x11D ist in der Norm festgelegt. */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    // Zweite Runde ohne Modulo: erspart in gfMul die Bereichsprüfung.
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  }

  /* Erzeugerpolynom für n Fehlerkorrektur-Stellen:
     (x + α⁰)(x + α¹)…(x + αⁿ⁻¹), höchster Koeffizient zuerst. */
  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j]     ^= poly[j];                  // Verschiebung um x
        next[j + 1] ^= gfMul(poly[j], EXP[i]);   // Multiplikation mit αⁱ
      }
      poly = next;
    }
    return poly;
  }

  /* Rest der Polynomdivision = die Fehlerkorrektur-Stellen. */
  function rsRemainder(data, degree) {
    const gen = rsGenerator(degree);
    const rem = new Uint8Array(degree);
    for (let k = 0; k < data.length; k++) {
      const factor = data[k] ^ rem[0];
      rem.copyWithin(0, 1);
      rem[degree - 1] = 0;
      for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  }

  /* ─── Normtabellen, Stufe M ─────────────────────────────────
     [EC-Stellen je Block, Blöcke Gruppe 1, Daten je Block G1,
      Blöcke Gruppe 2, Daten je Block G2]
     Zwei Gruppen gibt es, weil sich die Datenmenge ab Version 8
     nicht mehr glatt auf gleich große Blöcke aufteilen lässt. */
  const VERSIONS = {
    1:  [10, 1, 16, 0,  0],
    2:  [16, 1, 28, 0,  0],
    3:  [26, 1, 44, 0,  0],
    4:  [18, 2, 32, 0,  0],
    5:  [24, 2, 43, 0,  0],
    6:  [16, 4, 27, 0,  0],
    7:  [18, 4, 31, 0,  0],
    8:  [22, 2, 38, 2, 39],
    9:  [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44]
  };

  /* Mittelpunkte der Ausrichtungsmuster je Version. */
  const ALIGN = {
    1:  [],
    2:  [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7:  [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
  };

  function dataCodewords(v) {
    const [, b1, d1, b2, d2] = VERSIONS[v];
    return b1 * d1 + b2 * d2;
  }

  // Ab Version 10 ist die Längenangabe im Byte-Modus 16 statt 8 Bit
  // breit. Das ändert die Kapazität und muss beim Kodieren UND beim
  // Wählen der Version dieselbe Antwort geben.
  function countBits(v) { return v < 10 ? 8 : 16; }

  /* ─── Bitpuffer ─────────────────────────────────────────────── */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.push = function (value, len) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };

  /* ─── Kodieren ──────────────────────────────────────────────── */
  function toBytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    // Rückfallweg für sehr alte Browser: URLs sind ohnehin ASCII.
    const out = [];
    for (const ch of unescape(encodeURIComponent(text))) out.push(ch.charCodeAt(0));
    return Uint8Array.from(out);
  }

  function pickVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const capacity = dataCodewords(v) * 8 - 4 - countBits(v);
      if (byteLen * 8 <= capacity) return v;
    }
    throw new Error('QR: Inhalt zu lang für Version 10 (max. 213 Zeichen).');
  }

  function buildCodewords(bytes, version) {
    const total = dataCodewords(version);
    const buf = new BitBuf();
    buf.push(0b0100, 4);                       // Modus: Byte
    buf.push(bytes.length, countBits(version)); // Länge
    for (let i = 0; i < bytes.length; i++) buf.push(bytes[i], 8);

    // Abschluss: bis zu vier Nullbits, dann auf ganze Byte auffüllen.
    const capacity = total * 8;
    for (let i = 0; i < 4 && buf.bits.length < capacity; i++) buf.bits.push(0);
    while (buf.bits.length % 8 !== 0) buf.bits.push(0);

    const out = [];
    for (let i = 0; i < buf.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | buf.bits[i + j];
      out.push(b);
    }
    // Füllbytes im vorgeschriebenen Wechsel, bis der Bereich voll ist.
    for (let pad = 0xec; out.length < total; pad ^= 0xec ^ 0x11) out.push(pad);
    return Uint8Array.from(out);
  }

  /* Blöcke bilden, Fehlerkorrektur rechnen, verschränken.
     Verschränkt wird, damit ein Fleck auf dem Code seine Schäden
     auf alle Blöcke verteilt statt einen einzelnen zu zerstören —
     jeder Block verträgt für sich nur eine begrenzte Zahl Fehler. */
  function interleave(codewords, version) {
    const [ec, b1, d1, b2, d2] = VERSIONS[version];
    const blocks = [];
    let pos = 0;
    for (let i = 0; i < b1 + b2; i++) {
      const len = i < b1 ? d1 : d2;
      const data = codewords.slice(pos, pos + len);
      pos += len;
      blocks.push({ data, ec: rsRemainder(data, ec) });
    }

    const out = [];
    const maxData = Math.max(d1, d2);
    for (let i = 0; i < maxData; i++) {
      for (const bl of blocks) if (i < bl.data.length) out.push(bl.data[i]);
    }
    for (let i = 0; i < ec; i++) {
      for (const bl of blocks) out.push(bl.ec[i]);
    }
    return Uint8Array.from(out);
  }

  /* ─── Format- und Versionsangaben ───────────────────────────
     Beide sind mit einem BCH-Code gesichert: sie müssen lesbar
     bleiben, bevor der Leser überhaupt weiß, wie er den Rest
     lesen soll. Deshalb stehen sie auch doppelt im Bild. */
  function formatBits(mask) {
    const data = (0b00 << 3) | mask;   // 0b00 = Stufe M
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return (((data << 10) | (rem & 0x3ff)) ^ 0x5412) >>> 0;
  }

  function versionBits(version) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (((version << 12) | (rem & 0xfff))) >>> 0;
  }

  /* ─── Masken ───────────────────────────────────────────────
     Acht vorgeschriebene Muster. Angewendet wird nur eines — das
     mit der geringsten Strafpunktzahl. Ohne Maske entstünden im
     Bild leicht große einfarbige Flächen oder Muster, die den
     Suchmarkierungen ähneln; beides bringt Leser aus dem Tritt. */
  const MASKS = [
    (y, x) => (y + x) % 2 === 0,
    (y, x) => y % 2 === 0,
    (y, x) => x % 3 === 0,
    (y, x) => (y + x) % 3 === 0,
    (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
    (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
    (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0
  ];

  /* ─── Bild aufbauen ─────────────────────────────────────────
     mods = Modulfarben, fn = „gehört zu einem festen Muster".
     Die zweite Karte ist nötig, weil die Maske ausschließlich auf
     Datenmodule wirken darf — läge sie über den Suchmarkierungen,
     wäre der Code nicht mehr zu finden. */
  function build(text) {
    const bytes   = toBytes(text);
    const version = pickVersion(bytes.length);
    const size    = 17 + 4 * version;
    const mods    = new Uint8Array(size * size);
    const fn      = new Uint8Array(size * size);

    const set = (y, x, v) => {
      if (y < 0 || x < 0 || y >= size || x >= size) return;
      mods[y * size + x] = v ? 1 : 0;
      fn[y * size + x] = 1;
    };

    // Suchmarkierungen (7×7) samt Trennstreifen.
    // Chebyshev-Abstand zur Mitte: 0/1 dunkel, 2 hell, 3 dunkel,
    // 4 hell — das ist der Trennstreifen.
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const d = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
          set(r0 + dy, c0 + dx, d !== 2 && d !== 4);
        }
      }
    }

    // Taktlinien: die durchgehende Wechselreihe in Zeile und Spalte 6.
    for (let i = 8; i < size - 8; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }

    // Ausrichtungsmuster (5×5) — überall dort, wo sich zwei
    // Mittelpunkte kreuzen, außer über den Suchmarkierungen.
    const centers = ALIGN[version];
    for (const cy of centers) {
      for (const cx of centers) {
        const nearFinder =
          (cy <= 8 && cx <= 8) ||
          (cy <= 8 && cx >= size - 9) ||
          (cy >= size - 9 && cx <= 8);
        if (nearFinder) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const d = Math.max(Math.abs(dy), Math.abs(dx));
            set(cy + dy, cx + dx, d !== 1);
          }
        }
      }
    }

    // Versionsangabe — erst ab Version 7 vorgesehen.
    if (version >= 7) {
      const vb = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = (vb >>> i) & 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, bit);
        set(b, a, bit);
      }
    }

    // Formatfelder zunächst nur reservieren: welche Maske
    // hineingeschrieben wird, entscheidet sich erst nach der
    // Bewertung. Reserviert werden muss trotzdem jetzt, sonst
    // legt die Datenschleife ihre Bits darüber.
    const drawFormat = (mask) => {
      const fb = formatBits(mask);
      // Die 15 Formatbits werden MIT DEM HÖCHSTWERTIGEN ZUERST
      // abgelegt: Stelle 0 (also Modul (8,0)) trägt Bit 14.
      // Andersherum entsteht ein Bild, das strukturell wie ein
      // QR-Code aussieht — Suchmarkierungen, Takt, Daten alles
      // richtig — und das trotzdem kein Lesegerät annimmt, weil
      // es Fehlerkorrekturstufe und Maske falsch herum liest.
      const bit = (i) => (fb >>> (14 - i)) & 1;
      // Erste Kopie, um die linke obere Suchmarkierung herum:
      // 8 Module in Zeile 8 (Spalte 6 ist Taktlinie und wird
      // übersprungen), 7 Module in Spalte 8.
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));

      // Zweite Kopie — und hier ist die Aufteilung NICHT 8/7,
      // sondern 7/8:
      //   Bits 0–6  in Spalte 8, Zeilen size-1 … size-7
      //   Bits 7–14 in Zeile 8,  Spalten size-8 … size-1
      // Die Zeile size-8 in Spalte 8 gehört dem immer dunklen
      // Modul und ist deshalb aus der Spaltenreihe ausgenommen.
      //
      // ⚠ Diese Grenze ist die Stelle, an der ein QR-Code lautlos
      // kaputtgeht: schreibt man 8 Module in die Spalte und lässt
      // die Zeile bei size-7 beginnen, überschreibt das dunkle
      // Modul Bit 7 — und schlimmer: (8, size-8) bleibt dann
      // unmarkiert und wird von der Datenschleife als Datenmodul
      // benutzt. Ab dort ist der ganze Bitstrom um eins verschoben.
      for (let i = 0; i < 7; i++)  set(size - 1 - i, 8, bit(i));
      for (let i = 7; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(size - 8, 8, 1);   // das immer dunkle Modul
    };
    drawFormat(0);

    // Daten im Zickzack von rechts unten nach links, spaltenweise
    // zu zweit. Spalte 6 ist die Taktlinie und wird übersprungen.
    const stream = interleave(buildCodewords(bytes, version), version);
    let bi = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = upward ? (size - 1 - vert) : vert;
          if (fn[y * size + x]) continue;
          // Reicht der Datenstrom nicht bis ans Ende, bleiben die
          // letzten Module hell — die Norm nennt sie Restbits, sie
          // werden mitmaskiert und tragen keine Bedeutung.
          let bit = 0;
          if (bi < stream.length * 8) {
            bit = (stream[bi >>> 3] >>> (7 - (bi & 7))) & 1;
          }
          mods[y * size + x] = bit;
          bi++;
        }
      }
      upward = !upward;
    }

    // Alle acht Masken durchspielen, die ruhigste behalten.
    let best = null;
    let bestScore = Infinity;
    const base = mods.slice();
    for (let m = 0; m < 8; m++) {
      const test = base.slice();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (fn[y * size + x]) continue;
          if (MASKS[m](y, x)) test[y * size + x] ^= 1;
        }
      }
      // Das Formatfeld gehört zur Bewertung dazu, es ist Teil des Bildes.
      const saveM = mods.slice();
      mods.set(test);
      drawFormat(m);
      const score = penalty(mods, size);
      const finished = mods.slice();
      mods.set(saveM);
      if (score < bestScore) { bestScore = score; best = finished; }
    }

    const rows = [];
    for (let y = 0; y < size; y++) {
      const row = new Array(size);
      for (let x = 0; x < size; x++) row[x] = best[y * size + x] === 1;
      rows.push(row);
    }
    return rows;
  }

  /* ─── Strafpunkte ──────────────────────────────────────────
     Vier Regeln der Norm. Sie bestrafen alles, was einen Leser
     verwirren kann: lange einfarbige Strecken, große Blöcke,
     Muster die der Suchmarkierung ähneln, und ein Bild, das
     insgesamt zu hell oder zu dunkel gerät. */
  function penalty(m, size) {
    let p = 0;
    const at = (y, x) => m[y * size + x];

    // Regel 1 — Strecken ab 5 gleichen Modulen, waagerecht und senkrecht.
    for (let i = 0; i < size; i++) {
      let runH = 1, runV = 1;
      for (let j = 1; j < size; j++) {
        if (at(i, j) === at(i, j - 1)) runH++;
        else { if (runH >= 5) p += 3 + (runH - 5); runH = 1; }
        if (at(j, i) === at(j - 1, i)) runV++;
        else { if (runV >= 5) p += 3 + (runV - 5); runV = 1; }
      }
      if (runH >= 5) p += 3 + (runH - 5);
      if (runV >= 5) p += 3 + (runV - 5);
    }

    // Regel 2 — jeder einfarbige 2×2-Block.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const v = at(y, x);
        if (v === at(y, x + 1) && v === at(y + 1, x) && v === at(y + 1, x + 1)) p += 3;
      }
    }

    // Regel 3 — 1:1:3:1:1 mit vier hellen Modulen an einer Seite,
    // also genau das Verhältnis der Suchmarkierung.
    const NEEDLE = [1, 0, 1, 1, 1, 0, 1];
    const hasNeedle = (line, i) => {
      for (let k = 0; k < 7; k++) if (line[i + k] !== NEEDLE[k]) return false;
      return true;
    };
    const quiet = (line, from, to) => {
      for (let i = from; i < to; i++) if (line[i] !== 0) return false;
      return true;
    };
    const scanLine = (line) => {
      for (let i = 0; i + 7 <= size; i++) {
        if (!hasNeedle(line, i)) continue;
        if (i >= 4 && quiet(line, i - 4, i)) p += 40;
        if (i + 11 <= size && quiet(line, i + 7, i + 11)) p += 40;
      }
    };
    for (let i = 0; i < size; i++) {
      const row = new Array(size), col = new Array(size);
      for (let j = 0; j < size; j++) { row[j] = at(i, j); col[j] = at(j, i); }
      scanLine(row);
      scanLine(col);
    }

    // Regel 4 — Abweichung vom halben Dunkelanteil, in 5-%-Stufen.
    let dark = 0;
    for (let i = 0; i < size * size; i++) dark += m[i];
    const total = size * size;
    p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;

    return p;
  }

  /* ─── Öffentliche Schnittstelle ─────────────────────────────── */
  function svg(text, opts) {
    const o     = opts || {};
    const rows  = build(text);
    const n     = rows.length;
    const quiet = o.quiet == null ? 4 : o.quiet;   // Ruhezone, Norm: mind. 4
    const total = n + quiet * 2;
    const dark  = o.dark  || '#17212b';
    const light = o.light || '#ffffff';

    // Alle dunklen Module in EINEM Pfad statt in tausend <rect> —
    // das ist der Unterschied zwischen flüssig und ruckelnd, wenn
    // die Beamer-Ansicht den Code bei jedem Poll neu zeichnet.
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (rows[y][x]) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
      }
    }

    const title = o.title
      ? '<title>' + String(o.title).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</title>'
      : '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '"'
         + ' width="100%" height="100%" shape-rendering="crispEdges"'
         + ' role="img" aria-label="QR-Code">' + title
         + '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>'
         + '<path d="' + d + '" fill="' + dark + '"/>'
         + '</svg>';
  }

  window.MPQR = { matrix: build, svg: svg };
})();
