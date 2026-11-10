/* ══════════════════════════════════════════════════════════════
   How to Fachbegriffe — Die sechs Kistenturm-Figuren (figuren.js)
   ══════════════════════════════════════════════════════════════
   Je Team eine Figur. Neu gezeichnet am 10.11.2026 (Sönke: „noch nicht
   richtig schön, die Bewegungen nicht toll, kein Charakter“): jede Figur
   von Hand, mit eigenem Gesicht und eigenen Bewegungen für Ruhe, Heben,
   Jubeln und Traurig. Der Baukasten von Knowledge Stack (KSCreatures)
   wird NICHT mehr gebraucht; die Figuren stehen komplett hier, die
   Bewegungen in figuren.css.

   Schnittstelle (unverändert, tool.js hängt daran):
     DDFiguren.LIST   [{ key, soft, name, col, say }] — Reihenfolge = Team-
                      Nummer UND Profilbild-Nummer (kt_<key>), nie umsortieren
     DDFiguren.svg(team, action, px)   action: idle · lift · cheer · sad
                      (wave und alles andere = idle)
     DDFiguren.count

   Zeichenregeln: Kasten 0…200, Boden y = 184, Umriss #2b2438 fest (die
   Figuren sehen hell und dunkel gleich aus), Zustände über die Klasse am
   <svg> (is-idle · is-lift · is-cheer · is-sad), Teile mit data-s="…"
   sind nur in diesen Zuständen sichtbar. Entwurf/Vergleich mit den alten
   Figuren: showroom-figuren-vergleich.html (Stand vor dem Einbau).
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const DDF = (function () {
    const INK = '#2b2438';
    const at = (sw) => sw ? ' stroke="' + INK + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"' : '';
    const P = (d, fill, sw = 5, x = '') => '<path d="' + d + '" fill="' + fill + '"' + at(sw) + ' ' + x + '/>';
    const E = (cx, cy, rx, ry, fill, sw = 5, x = '') => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + at(sw) + ' ' + x + '/>';
    const C = (cx, cy, r, fill, sw = 5, x = '') => E(cx, cy, r, r, fill, sw, x);
    const R = (x0, y0, w, h, r, fill, sw = 5, x = '') => '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" rx="' + r + '" fill="' + fill + '"' + at(sw) + ' ' + x + '/>';
    const L = (d, col, sw, x = '') => '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" ' + x + '/>';
    const tube = (d, col, w) => L(d, INK, w + 6) + L(d, col, w);
    const G = (cls, ox, oy, inner, x = '') => '<g class="' + cls + '" style="transform-origin:' + ox + 'px ' + oy + 'px" ' + x + '>' + inner + '</g>';
    const S = (states, inner) => '<g data-s="' + states + '">' + inner + '</g>';
    const hl = (x, y, r, o = 1) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity="' + o + '"/>';
    const shadow = (cx, rx) => '<ellipse class="shadow" cx="' + cx + '" cy="187" rx="' + rx + '" ry="5.5" fill="' + INK + '" opacity=".16"/>';
    /* Spiegeln an x = ax: ein Pfad oder fertiges Markup (dann nur die d="…"; M L C Q Z und l q c m) */
    const mirD = (d, ax) => d.replace(/([MLCQZmlcqz])([^MLCQZmlcqz]*)/g, (m, c, rest) => {
      let i = 0; const rel = c === c.toLowerCase();
      return c + rest.replace(/-?\d+(\.\d+)?/g, n => (i++ % 2 === 0) ? String(+(rel ? -n : 2 * ax - n).toFixed(2)) : n);
    });
    const mir = (s, ax = 100) => s.indexOf('d="') < 0 ? mirD(s, ax) : s.replace(/ d="([^"]*)"/g, (m, d) => ' d="' + mirD(d, ax) + '"');
    /* Mehrere Kreise als EIN Umriss */
    const blob = (cs, fill, sw = 5) => cs.map(c => C(c[0], c[1], c[2], fill, sw)).join('') + cs.map(c => C(c[0], c[1], c[2], fill, 0)).join('');
    const tw = (x, y, r, col, delay = 0, cls = 'tw') => '<path class="' + cls + ' fb" style="animation-delay:' + delay + 's" d="M ' + x + ' ' + (y - r) + ' Q ' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q ' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q ' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q ' + x + ' ' + y + ' ' + x + ' ' + (y - r) + ' Z" fill="' + col + '"/>';
    const star5 = (cx, cy, r, fill, sw = 3.5, x = '') => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .46 : r; d += (i ? ' L ' : 'M ') + (cx + q * Math.cos(a)).toFixed(1) + ' ' + (cy + q * Math.sin(a)).toFixed(1); } return P(d + ' Z', fill, sw, x); };
    /* Augen-Bausteine */
    const eye = (x, y, rx, ry) => '<g class="blink fb">' + E(x, y, rx, ry, INK, 0) + hl(x - rx * .36, y - ry * .4, rx * .42) + hl(x + rx * .3, y + ry * .38, rx * .2, .9) + '</g>';
    const happy = (x, y, w, sw = 4) => L('M ' + (x - w) + ' ' + (y + w * .45) + ' Q ' + x + ' ' + (y - w * .9) + ' ' + (x + w) + ' ' + (y + w * .45), INK, sw);
    const sleepy = (x, y, w, sw = 4) => L('M ' + (x - w) + ' ' + (y - w * .2) + ' Q ' + x + ' ' + (y + w * .8) + ' ' + (x + w) + ' ' + (y - w * .2), INK, sw);
    const squL = (x, y, w, sw = 4) => L('M ' + (x - w) + ' ' + (y - w * .8) + ' L ' + (x + w * .7) + ' ' + y + ' L ' + (x - w) + ' ' + (y + w * .8), INK, sw);
    const squR = (x, y, w, sw = 4) => L('M ' + (x + w) + ' ' + (y - w * .8) + ' L ' + (x - w * .7) + ' ' + y + ' L ' + (x + w) + ' ' + (y + w * .8), INK, sw);
    const tear = (x, y, cls = 'tear') => P('M ' + x + ' ' + (y - 5) + ' Q ' + (x + 4.5) + ' ' + (y + 2) + ' ' + x + ' ' + (y + 4) + ' Q ' + (x - 4.5) + ' ' + (y + 2) + ' ' + x + ' ' + (y - 5) + ' Z', '#7cc8ff', 2, 'class="' + cls + ' fb"');
    const blush = (x, y, rx = 6.5, ry = 4, col = '#ffb3c7') => E(x, y, rx, ry, col, 0, 'opacity=".85"');
  
    const LIST = [
      { key: 'astro', soft: '#e3e9f2', name: 'Astro-Hase', col: '#5f7392',
        say: 'Der Träumer. Schwebt mit Düsenrucksack, schaut Sternen nach und winkt jedem. Heben: ein Düsenstoß nach oben. Jubeln: Salto in der Schwerelosigkeit. Traurig: landet, die Ohren hängen.' },
      { key: 'lama', soft: '#fff3c4', name: 'Bananalama', col: '#d99a00',
        say: 'Die Diva. Halb geschlossene Augen, kaut gelangweilt, die Bananenschale trägt sie als Kragen. Heben: der Hals wird lang und sie stupst von unten. Jubeln: Galopp-Hüpfer mit Kopf im Nacken. Traurig: der Kopf hängt bis zum Boden.' },
      { key: 'lauch', soft: '#dcf5e2', name: 'Lauch-Samurai', col: '#2fa84f',
        say: 'Der Ernste. Strenge Brauen, Hand am Schwert, die Augen wandern wachsam hin und her. Heben: zieht das Schwert, ein Schnitt, fertig. Jubeln: Schwert zum Himmel. Traurig: tiefe Verbeugung, die Blätter welken.' },
      { key: 'gameboy', soft: '#dbe9ff', name: 'GameBoy', col: '#2f7cf6',
        say: 'Der Zocker. Wippt im Takt, drückt seine eigenen Knöpfe, Pixel-Gesicht auf dem Bildschirm. Heben: Sprung wie im Jump ’n’ Run mit Münze. Jubeln: „1UP“. Traurig: „GAME OVER“, der Bildschirm flackert.' },
      { key: 'popcorn', soft: '#fde2e2', name: 'Popcorn', col: '#e5484d',
        say: 'Der Überdrehte. Kann nicht stillstehen, breites Grinsen, ständig springt ein Korn heraus. Heben: staucht sich zusammen – und poppt. Jubeln: Brille hoch, Popcorn-Fontäne. Traurig: die Brille rutscht, das Popcorn sackt zusammen.' },
      { key: 'ghost', soft: '#ece4ff', name: 'Magic Ghost', col: '#8b5cf6',
        say: 'Der schusselige Zauberlehrling. Der Hut ist zu groß und rutscht ihm über die Augen, dann schiebt er ihn wieder hoch. Heben: Schlenker mit dem Stab, Funken. Jubeln: dreht sich, der Hut fliegt. Traurig: sackt zusammen, Hut über den Augen.' }
    ];
    const F = {};
  
    /* ── 0 Astro-Hase ── */
    F.astro = () => {
      const flame = P('M 60 162 Q 67 188 74 162 Z', '#ff9f1c', 3.5) + P('M 64 162 Q 67 176 70 162 Z', '#fff3b0', 0);
      const earL = P('M 74 56 C 63 38 61 17 70 6 C 82 12 92 33 92 54 Z', '#fff') + P('M 77 47 C 71 35 69 23 73 15 C 80 23 85 35 85 47 Z', '#ffc2d4', 0);
      const earR = P('M 108 54 C 108 38 112 25 122 18 C 133 10 149 13 154 26 C 144 23 136 27 132 35 C 129 41 128 47 128 56 Z', '#fff')
        + P('M 114 47 C 114.5 37 118 29 125 24 C 131 20 139 20 144 22.5 C 137 24 130 28 126 35 C 123.5 40 122.5 44 122 48 Z', '#ffc2d4', 0);
      return shadow(100, 36)
      + G('root', 100, 170,
          S('idle lift cheer', G('flame', 67, 162, flame) + G('flame', 133, 162, mir(flame)))
        + R(57, 120, 20, 46, 8, '#9aa6bd') + R(123, 120, 20, 46, 8, '#9aa6bd')
        + L('M 62 130 L 72 130 M 128 130 L 138 130', '#fff', 3, 'opacity=".6"')
        + G('leg-l', 88, 160, tube('M 88 160 L 86 172', '#fff', 13) + P('M 71 178 Q 71 168 82 168 L 90 168 Q 98 168 98 176 Q 98 183 91 183 L 77 183 Q 71 183 71 178 Z', '#7d92b3'))
        + G('leg-r', 112, 160, tube('M 112 160 L 114 172', '#fff', 13) + P(mir('M 71 178 Q 71 168 82 168 L 90 168 Q 98 168 98 176 Q 98 183 91 183 L 77 183 Q 71 183 71 178 Z'), '#7d92b3'))
        + P('M 72 124 C 67 150 72 167 86 167 L 114 167 C 128 167 133 150 128 124 Z', '#fff')
        + P('M 118 128 C 123 148 121 160 110 167 L 114 167 C 128 167 133 150 128 126 Z', '#d3dbea', 0)
        + R(86, 141, 28, 16, 5, '#333b52', 3.5) + C(93, 149, 2.8, '#ff6b6b', 0, 'class="lamp"') + C(100, 149, 2.8, '#ffd84a', 0) + C(107, 149, 2.8, '#5ee08a', 0)
        + L('M 74 160 Q 100 166 126 160', '#ff8a3d', 4)
        + G('head', 100, 126,
            '<g transform="translate(10 3) scale(.9)">' + G('ear-l', 83, 54, earL) + G('ear-r', 118, 54, earR)
          + E(82.5, 54, 11, 5, '#9aa6bd', 3.5, 'transform="rotate(-12 82.5 54)"') + E(118, 54.5, 11, 5, '#9aa6bd', 3.5, 'transform="rotate(8 118 54.5)"')
          + L('M 59 68 L 50 53', INK, 4) + C(49, 50, 5, '#ff5c5c', 3, 'class="lamp"')
          + C(100, 90, 45, '#cfeaff')
          + E(100, 96, 35, 31, '#fff', 3.5)
          + P('M 126 80 C 134 92 132 110 120 120 C 127 108 129 94 126 80 Z', '#e6ecf5', 0)
          + blush(76, 106) + blush(124, 106)
          + S('idle', eye(85, 94, 6.5, 8.5) + eye(115, 94, 6.5, 8.5))
          + S('lift', squL(86, 94, 6.5) + squR(114, 94, 6.5))
          + S('cheer', happy(85, 95, 7) + happy(115, 95, 7))
          + S('sad', eye(85, 96, 6, 7.5) + eye(115, 96, 6, 7.5) + L('M 77 87 L 91 82 M 123 87 L 109 82', INK, 3.5) + tear(79, 108))
          + P('M 96.5 103 L 103.5 103 L 100 107 Z', '#ff8fb3', 2.5)
          + S('idle', L('M 92 110 Q 96 114.5 100 110 Q 104 114.5 108 110', INK, 3) + R(96.2, 111.5, 7.6, 7.5, 2, '#fff', 2.5) + L('M 100 112 L 100 118', INK, 1.5))
          + S('lift cheer', P('M 90 109 Q 100 130 110 109 Z', '#7a2b3d', 3) + E(100, 118, 5, 3.4, '#ff7f9c', 0) + R(95.5, 109, 9, 6.5, 2, '#fff', 2.5))
          + S('sad', L('M 93 116 Q 100 110 107 116', INK, 3))
          + L('M 66 78 C 70 64 80 55 93 51', '#fff', 5, 'opacity=".9"') + hl(63, 88, 2.4, .9)
          + C(100, 90, 45, 'none') + '</g>'
          + E(100, 126, 23, 7, '#9aa6bd'))
        + G('arm-l', 76, 136, tube('M 76 137 Q 62 142 57 154', '#fff', 13) + C(55, 158, 9, '#7d92b3') + hl(52, 155, 2.2, .7))
        + G('arm-r', 124, 136, tube('M 124 137 Q 138 142 143 154', '#fff', 13) + C(145, 158, 9, '#7d92b3') + hl(142, 155, 2.2, .7))
        )
      + S('idle cheer', tw(22, 46, 8, '#ffb347', 0) + tw(180, 112, 6, '#c084fc', .7) + tw(26, 122, 5, '#5aa9e6', 1.2) + tw(174, 40, 5, '#34d399', .3));
    };
  
    /* ── 1 Bananalama ── */
    F.lama = () => {
      const W = '#fffaf0', W2 = '#eadfc8', HOOF = '#5a4230';
      const earL = P('M 110 48 C 99 38 95 24 99 11 C 112 18 122 30 125 44 Z', W) + P('M 111 41 C 105 34 102 26 103 19 C 110 24 116 32 118 40 Z', '#ffc2d1', 0);
      const lidL = P('M 115.5 59 C 115.5 47 132.5 47 132.5 59 Z', '#cdb8ee', 0) + L('M 114 59 L 134 59', INK, 3.5) + L('M 115 58 l -5 -3 M 118 53 l -4 -5', INK, 2.5);
      return shadow(92, 62)
      + G('root', 92, 184,
          G('leg-b', 66, 154, R(60, 150, 12, 33, 5.5, W2) + R(60, 175, 12, 8, 3, HOOF, 3.5))
        + G('leg-f', 122, 154, R(116, 150, 12, 33, 5.5, W2) + R(116, 175, 12, 8, 3, HOOF, 3.5))
        + G('tail', 34, 106, P('M 24 106 C 20 97 21 88 26 82 L 35 86 C 33 92 35 99 39 104 Z', '#8a7a2a'))
        + P('M 22 108 C 22 138 52 165 98 165 C 128 165 150 153 158 131 C 148 134 130 135 110 133 C 82 131 58 121 44 101 C 38 94 23 98 22 108 Z', '#ffdf5a')
        + L('M 32 122 C 50 149 92 158 138 149', '#e3ab14', 3.5, 'opacity=".75"')
        + L('M 31 108 C 36 120 48 130 62 136', '#fff8c8', 4, 'opacity=".8"')
        + G('leg-b', 48, 156, R(42, 152, 13, 31, 6, W) + R(42, 175, 13, 8, 3, HOOF, 3.5))
        + G('leg-f', 140, 156, R(134, 152, 13, 31, 6, W) + R(134, 175, 13, 8, 3, HOOF, 3.5))
        + G('neckhead', 136, 142,
            G('neck', 136, 142, blob([[136, 128, 21], [137, 110, 17], [138, 93, 16]], W) + L('M 128 112 q 4 3 8 0 M 138 124 q 4 3 8 0 M 130 100 q 4 3 8 0', W2, 3))
          + G('head', 138, 86,
              G('ear-l', 116, 44, earL) + G('ear-r', 160, 44, mir(earL, 138))
            + blob([[138, 62, 27], [124, 41, 10], [138, 35, 12], [152, 41, 10], [116, 72, 11], [160, 72, 11]], W)
            + blush(113, 72, 6, 4, '#ffb0c2') + blush(163, 72, 6, 4, '#ffb0c2')
            + S('idle', E(124, 60, 6.5, 8, INK, 0) + hl(122, 62, 2.2) + E(152, 60, 6.5, 8, INK, 0) + hl(150, 62, 2.2)
                + G('lid', 124, 55, lidL) + G('lid', 152, 55, mir(lidL, 138)))
            + S('lift', squL(125, 59, 6.5) + squR(151, 59, 6.5))
            + S('cheer', happy(124, 60, 7) + happy(152, 60, 7))
            + S('sad', sleepy(124, 60, 7) + sleepy(152, 60, 7) + tear(118, 72))
            + E(138, 78, 18, 13, '#fff1d6', 3.5)
            + P('M 133.5 70 L 142.5 70 L 138 75 Z', HOOF, 0) + L('M 138 75 L 138 79', INK, 2.5)
            + G('jaw', 138, 82,
                S('idle', L('M 129 80 Q 133.5 85.5 138 80.5 Q 142.5 85.5 147 80', INK, 3))
              + S('lift', R(129, 79.5, 18, 7.5, 2.5, '#fff', 2.5) + L('M 135 80 L 135 86.5 M 141 80 L 141 86.5', INK, 1.5))
              + S('cheer', P('M 127 79 Q 138 96 149 79 Z', '#7a2b3d', 3) + R(133, 79.5, 10, 5, 1.5, '#fff', 2) + E(138, 86.5, 4.5, 2.6, '#ff7f9c', 0))
              + S('sad', L('M 130 85 Q 138 79 146 85', INK, 3)))))
        + P('M 113 133 C 106 146 108 158 115 165 C 122 157 125 146 124 135 Z', '#ffdf5a') + P('M 115 139 C 111 147 112 154 115 159 C 118 153 120 146 120 140 Z', '#fff3a8', 0)
        + P('M 128 138 C 126 152 130 163 138 169 C 145 161 146 150 144 138 Z', '#ffdf5a') + P('M 131 142 C 130 151 133 158 138 163 C 141 157 142 150 141 142 Z', '#fff3a8', 0)
        + P('M 147 134 C 150 146 156 155 164 157 C 166 147 163 138 158 130 Z', '#ffdf5a') + P('M 151 137 C 153 144 157 150 161 152 C 161.5 146 160 140 157 135 Z', '#fff3a8', 0)
        );
    };
  
    /* ── 2 Lauch-Samurai ── */
    F.lauch = (u) => {
      const D1 = '#2c8a45', D2 = '#3da553', D3 = '#58bf66', RED = '#e5484d', ARM = '#8fd06b';
      const lfSide = 'M 82 72 C 68 58 50 48 30 51 C 40 35 63 37 80 53 C 86 59 90 65 92 72 Z';
      const lfUp = 'M 78 72 C 69 48 71 24 84 8 C 95 24 99 48 97 72 Z';
      return shadow(100, 40)
      + '<defs><linearGradient id="lg' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5d873"/><stop offset=".5" stop-color="#e3f1c4"/><stop offset="1" stop-color="#fdfdf2"/></linearGradient></defs>'
      + G('root', 100, 184,
          S('idle sad', L('M 78 150 L 36 172', INK, 13) + L('M 78 150 L 36 172', '#34416b', 7) + L('M 40 170 L 36 172', '#f2c14e', 7))
        + E(88, 179, 11, 6, '#fdfdf2') + E(112, 179, 11, 6, '#fdfdf2')
        + L('M 76 174 q -6 7 -11 5 M 124 174 q 6 7 11 5 M 100 176 l 0 7', '#cfc7a2', 3)
        + G('leaves', 100, 70,
            G('lf1', 88, 72, P(lfSide, D1) + L('M 36 50 C 54 48 72 58 86 70', '#1f6e36', 2.5, 'opacity=".6"'))
          + G('lf2', 112, 72, P(mir(lfSide), D1) + L(mir('M 36 50 C 54 48 72 58 86 70'), '#1f6e36', 2.5, 'opacity=".6"'))
          + G('lf3', 88, 72, P(lfUp, D2) + L('M 84 14 C 86 34 88 54 88 70', '#1f6e36', 2.5, 'opacity=".5"'))
          + G('lf4', 112, 72, P(mir(lfUp), D2) + L(mir('M 84 14 C 86 34 88 54 88 70'), '#1f6e36', 2.5, 'opacity=".5"'))
          + G('lf5', 100, 72, P('M 88 72 C 84 46 90 20 101 4 C 112 20 116 46 112 72 Z', D3) + L('M 101 10 L 100 70', '#1f6e36', 2.5, 'opacity=".5"')))
        + P('M 74 68 L 74 150 C 69 161 72 176 100 176 C 128 176 131 161 126 150 L 126 68 Q 100 60 74 68 Z', 'url(#lg' + u + ')')
        + L('M 84 134 L 84 166 M 100 138 L 100 170 M 116 134 L 116 166', '#d6dcb8', 2, 'opacity=".7"')
        + P('M 118 70 L 118 152 C 121 160 120 170 110 175 C 127 173 130 161 126 150 L 126 68 Z', '#2c4637', 0, 'opacity=".1"')
        + L('M 80 104 L 80 76', '#fff', 4, 'opacity=".55"')
        + blush(81, 124, 6, 3.5, '#f5a3a3') + blush(119, 124, 6, 3.5, '#f5a3a3')
        + S('idle', '<g class="pupils">' + eye(88, 115, 4.8, 6) + eye(112, 115, 4.8, 6) + '</g>' + L('M 79 104 L 94 108.5 M 121 104 L 106 108.5', INK, 5))
        + S('lift', L('M 80 112 L 94 116 M 120 112 L 106 116', INK, 5) + L('M 79 104 L 94 109 M 121 104 L 106 109', INK, 5))
        + S('cheer', happy(88, 116, 6) + happy(112, 116, 6) + L('M 79 105 L 94 108 M 121 105 L 106 108', INK, 5))
        + S('sad', sleepy(88, 115, 6) + sleepy(112, 115, 6) + L('M 80 108 L 94 104 M 120 108 L 106 104', INK, 4.5) + tear(124, 106, 'sweat'))
        + S('idle', L('M 94 128.5 Q 100 126 106 128', INK, 3.5))
        + S('lift cheer', P('M 92 125 L 108 125 Q 107 137 100 137 Q 93 137 92 125 Z', '#7a2b3d', 3) + R(95, 125, 10, 4, 1, '#fff', 0))
        + S('sad', L('M 94 131 Q 100 126 106 131', INK, 3.5))
        + L('M 116 123 l 7 5 M 123 123 l -7 5', '#b0563f', 2.2, 'opacity=".7"')
        + G('band2', 127, 90, P('M 126 92 C 137 99 143 110 154 111 C 147 118 134 113 125 99 Z', RED, 4))
        + G('band1', 127, 90, P('M 126 87 C 139 82 150 87 160 80 C 158 92 147 97 127 95 Z', RED, 4))
        + P('M 73 82 Q 100 91 127 82 L 127 96 Q 100 105 73 96 Z', RED) + C(100, 93.5, 4, '#fff', 0)
        + C(128, 90, 6.5, RED, 4)
        + P('M 73 143 Q 100 152 127 143 L 127.5 156 Q 100 165 72.5 156 Z', '#34416b')
        + S('idle sad', L('M 78 150 L 104 136', INK, 12) + L('M 78 150 L 104 136', '#ece6d6', 6.5) + L('M 85 143.5 l 4 5 M 91 140.5 l 4 5 M 97 137 l 4 5', INK, 1.6) + L('M 103 136.5 L 104 136', '#f2c14e', 7) + E(78, 150, 4.5, 8, '#f2c14e', 3.5, 'transform="rotate(-28 78 150)"'))
        + R(105, 146, 10, 11, 2.5, '#f2c14e', 3.5)
        + G('arm-l', 74, 126, tube('M 74 127 Q 64 136 74 143', ARM, 8) + C(77, 145, 6.5, ARM, 4))
        + G('arm-r', 126, 126,
            S('lift cheer', L('M 137 152 L 162 200', INK, 9) + L('M 137 152 L 162 200', '#e8eef5', 4.5) + L('M 134 146 L 139 156', '#4a2c2a', 7) + E(137.5, 151.5, 7.5, 3.5, '#f2c14e', 3, 'transform="rotate(-27 137.5 151.5)"'))
          + tube('M 126 127 Q 137 134 135 146', ARM, 8) + C(135, 148, 6.5, ARM, 4))
        + S('lift', P('M 138 60 C 176 76 190 122 164 166 C 176 124 164 88 138 60 Z', '#d9f1ff', 2.5, 'class="cut" style="transform-origin:120px 120px"'))
        );
    };
  
    /* ── 3 GameBoy ── */
    F.gameboy = () => {
      const BL = '#4f8df5', BD = '#3468c9', DK = '#2b3350', LCD = '#b9e36c', PX = '#243d2a', PINK = '#ff5c8a';
      const px = (list) => list.map(p => '<rect x="' + (70 + 4 * p[0]) + '" y="' + (51 + 4 * p[1]) + '" width="' + 4 * (p[2] || 1) + '" height="' + 4 * (p[3] || 1) + '" fill="' + PX + '"/>').join('');
      const shoe = 'M 66 176 Q 66 166 77 166 L 87 166 Q 93 166 93 172 L 93 178 Q 93 183 88 183 L 71 183 Q 66 183 66 178 Z';
      const glove = (x, y) => C(x, y, 9, '#fff', 3.5) + L('M ' + (x - 3) + ' ' + (y + 4) + ' l 0 4 M ' + (x + 2) + ' ' + (y + 5) + ' l 0 3.5', INK, 1.8, 'opacity=".5"');
      return shadow(100, 44)
      + G('root', 100, 184,
          G('leg-l', 84, 158, L('M 84 156 L 82 170', INK, 6) + P(shoe, '#ff5c5c', 4) + P('M 66 176 Q 66 166 75 166 L 75 183 L 71 183 Q 66 183 66 178 Z', '#fff', 0) + P(shoe, 'none', 4))
        + G('leg-r', 116, 158, L('M 116 156 L 118 170', INK, 6) + P(mir(shoe), '#ff5c5c', 4) + P(mir('M 66 176 Q 66 166 75 166 L 75 183 L 71 183 Q 66 183 66 178 Z'), '#fff', 0) + P(mir(shoe), 'none', 4))
        + G('arm-l', 56, 98, L('M 56 98 Q 40 106 37 122', INK, 6) + glove(36, 127))
        + G('arm-r', 144, 98, L('M 144 98 Q 160 106 163 122', INK, 6) + glove(164, 127))
        + G('cart', 100, 34, R(77, 20, 46, 22, 4, '#aab4c8') + R(85, 24, 30, 8, 2, '#ffd84a', 2.5))
        + P('M 68 34 L 132 34 Q 146 34 146 48 L 146 132 Q 146 160 118 160 L 68 160 Q 54 160 54 146 L 54 48 Q 54 34 68 34 Z', BL)
        + P('M 138 37 Q 146 38 146 48 L 146 132 Q 146 160 118 160 L 110 160 Q 138 158 138 130 Z', BD, 0)
        + L('M 61 60 L 61 48 Q 61 41 68 41', '#fff', 4, 'opacity=".55"')
        + R(63, 43, 74, 60, 8, DK, 4)
        + R(70, 50, 60, 46, 3, LCD, 0)
        + S('idle', '<g class="pxeyes fb">' + px([[3, 2, 2, 4], [10, 2, 2, 4]]) + '</g>' + px([[5, 7], [6, 8, 3, 1], [9, 7]]))
        + S('lift', px([[3, 1], [4, 2], [5, 3], [4, 4], [3, 5], [11, 1], [10, 2], [9, 3], [10, 4], [11, 5], [6, 7, 3, 3]]))
        + S('cheer', px([[2, 4], [3, 3], [4, 2], [5, 3], [6, 4], [8, 4], [9, 3], [10, 2], [11, 3], [12, 4], [4, 6, 7, 1], [5, 7, 5, 1], [6, 8, 3, 1]]))
        + S('sad', px([[2, 1], [4, 1], [3, 2], [2, 3], [4, 3], [10, 1], [12, 1], [11, 2], [10, 3], [12, 3], [5, 6], [6, 5, 3, 1], [9, 6]])
            + '<text class="over" x="100" y="93" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="8.5" font-weight="700" fill="' + PX + '">GAME OVER</text>'
            + R(70, 50, 60, 46, 3, '#1c2433', 0, 'class="dim"'))
        + '<rect class="scan" x="70" y="50" width="60" height="2" fill="#fff" opacity=".22"/>'
        + L('M 73 60 L 73 54 L 79 54', '#fff', 2, 'opacity=".5"')
        + R(66, 121, 24, 9, 2.5, DK, 0) + R(73.5, 113.5, 9, 24, 2.5, DK, 0)
        + C(129, 119, 8, PINK, 3.5, 'class="btn-a fb"') + C(112, 130, 8, PINK, 3.5, 'class="btn-b fb"')
        + R(84, 146, 11, 4.5, 2.2, DK, 0, 'transform="rotate(-24 89.5 148)"') + R(99, 146, 11, 4.5, 2.2, DK, 0, 'transform="rotate(-24 104.5 148)"')
        + L('M 124 150 l 7 -5 M 129 153 l 7 -5 M 134 155 l 5 -4', BD, 2.5)
        + S('lift', G('coin', 100, 6, E(100, 6, 8, 10, '#ffd84a', 3.5) + L('M 100 1.5 L 100 10.5', '#c98a00', 2.5)))
        + S('cheer', '<text class="oneup" x="100" y="12" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="16" font-weight="800" fill="#2f7cf6" stroke="' + INK + '" stroke-width=".6">1UP</text>')
        );
    };
  
    /* ── 4 Popcorn ── */
    F.popcorn = () => {
      const RED = '#e5484d', CR = '#fff6dc';
      const puff = (x, y, r, cls = 'pf fb', st = '') => '<g class="' + cls + '" ' + st + '>'
        + blob([[x, y, r], [x - r * .55, y - r * .25, r * .62], [x + r * .55, y - r * .3, r * .62], [x + r * .1, y + r * .35, r * .7]], CR, 4)
        + C(x + r * .15, y + r * .2, r * .34, '#ffd35c', 0, 'opacity=".75"') + hl(x - r * .5, y - r * .45, r * .2, .9) + '</g>';
      let stripes = '';
      for (let i = 0; i < 7; i += 2) { const a = 54 + i * 92 / 7, b = 54 + (i + 1) * 92 / 7, c = 68 + (i + 1) * 64 / 7, d = 68 + i * 64 / 7; stripes += P('M ' + a.toFixed(1) + ' 92 L ' + b.toFixed(1) + ' 92 L ' + c.toFixed(1) + ' 176 L ' + d.toFixed(1) + ' 176 Z', RED, 0); }
      const glove = (x, y) => C(x, y, 8.5, '#fff', 3.5);
      const bur = [[-46, -58, 60, 60], [-20, -80, 86, 44], [8, -86, 104, 40], [34, -72, 122, 52], [52, -50, 138, 64]];
      return shadow(100, 42)
      + G('root', 100, 184,
          L('M 86 174 L 85 180', INK, 6) + L('M 114 174 L 115 180', INK, 6) + E(82, 181, 10, 5, '#ffd84a', 3.5) + E(118, 181, 10, 5, '#ffd84a', 3.5)
        + G('arm-l', 59, 122, L('M 59 122 Q 44 128 40 140', INK, 6) + glove(39, 145))
        + G('arm-r', 141, 122, L('M 141 122 Q 156 128 160 140', INK, 6) + glove(161, 145))
        + S('lift cheer', bur.map((b, i) => puff(b[2], b[3], 6.5, 'burst fb', 'style="--dx:' + b[0] + 'px;--dy:' + b[1] + 'px;animation-delay:' + (i * .07).toFixed(2) + 's"')).join(''))
        + S('idle', puff(100, 44, 6.5, 'kern fb'))
        + G('pops', 100, 90,
            puff(74, 64, 15) + puff(126, 64, 15) + puff(100, 54, 17) + puff(88, 42, 12) + puff(113, 41, 12)
          + puff(62, 78, 13) + puff(138, 78, 13) + puff(86, 74, 15) + puff(115, 74, 15) + puff(100, 82, 12))
        + P('M 54 92 L 146 92 L 132 176 L 68 176 Z', '#fff')
        + stripes
        + P('M 138 92 L 146 92 L 132 176 L 126 176 Z', INK, 0, 'opacity=".12"')
        + P('M 54 92 L 146 92 L 132 176 L 68 176 Z', 'none')
        + R(49, 84, 102, 14, 5.5, '#fff') + L('M 56 89 L 72 89', '#e6e0d2', 3)
        + E(100, 132, 34, 30, '#fff', 0, 'opacity=".88"')
        + S('cheer', happy(80, 119, 8, 4.5) + happy(120, 119, 8, 4.5))
        + S('sad', eye(81, 109, 5, 6) + eye(119, 109, 5, 6) + L('M 72 102 L 87 98 M 128 102 L 113 98', INK, 4) + tear(70, 124))
        + S('idle', P('M 78 141 Q 100 167 122 141 Z', '#7a2b3d', 3.5) + P('M 81 142.5 L 119 142.5 L 115.5 148.5 L 84.5 148.5 Z', '#fff', 0) + E(100, 155, 8, 3.2, '#ff7f9c', 0) + P('M 78 141 Q 100 167 122 141 Z', 'none', 3.5))
        + S('lift', E(100, 151, 9, 11, '#7a2b3d', 3.5) + E(100, 157, 5, 3.4, '#ff7f9c', 0))
        + S('cheer', P('M 74 139 Q 100 176 126 139 Z', '#7a2b3d', 3.5) + P('M 77.5 140.5 L 122.5 140.5 L 118.5 147.5 L 81.5 147.5 Z', '#fff', 0) + E(100, 158, 10, 4.5, '#ff7f9c', 0) + P('M 74 139 Q 100 176 126 139 Z', 'none', 3.5))
        + S('sad', L('M 84 155 Q 92 146 100 151 Q 108 146 116 155', INK, 4))
        + blush(68, 138, 6, 4, '#ff9aa5') + blush(132, 138, 6, 4, '#ff9aa5')
        + G('glasses', 100, 118,
            L('M 58 110 L 52 104 M 142 110 L 148 104', INK, 4)
          + P('M 61 104 L 139 104 Q 144 104 144 109 L 143 126 Q 142.5 131 138 131 L 111 131 Q 106 131 104 125 L 100 121 L 96 125 Q 94 131 89 131 L 62 131 Q 57.5 131 57 126 L 56 109 Q 56 104 61 104 Z', '#fff', 4.5)
          + R(62, 109, 31, 17, 4, '#ff4d5e', 3) + R(107, 109, 31, 17, 4, '#35c3e6', 3)
          + L('M 67 114 L 76 114 M 112 114 L 121 114', '#fff', 3, 'opacity=".85"'))
        );
    };
  
    /* ── 5 Magic Ghost ── */
    F.ghost = () => {
      const B = '#f6f1ff', B2 = '#d9cdf5', HAT = '#7b5bd6', HAT2 = '#5d41b3';
      const A = 'M 60 104 C 60 68 78 52 100 52 C 122 52 140 68 140 104 L 140 160 C 134 171 126 171 120 160 C 114 149 106 149 100 160 C 94 171 86 171 80 160 C 74 149 66 152 60 163 Z';
      const Bp = 'M 60 104 C 60 68 78 52 100 52 C 122 52 140 68 140 104 L 140 165 C 134 154 126 154 120 165 C 114 176 106 176 100 165 C 94 154 86 154 80 165 C 74 176 66 172 60 158 Z';
      const armL = 'M 64 110 C 50 108 40 118 43 128 C 50 134 60 128 67 122 Z';
      const sp = [[-30, -34], [26, -40], [-6, -52], [38, -8], [-40, -4]];
      return shadow(100, 30)
      + G('root', 100, 172,
          '<path d="' + A + '" fill="' + B + '"' + at(5) + '><animate attributeName="d" dur="1.7s" repeatCount="indefinite" values="' + A + ';' + Bp + ';' + A + '" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1"/></path>'
        + P('M 128 76 C 135 90 134 130 132 148 C 136 146 138 142 140 146 L 140 104 C 140 92 136 82 128 76 Z', B2, 0, 'opacity=".8"')
        + L('M 68 100 C 69 86 75 76 84 70', '#fff', 5, 'opacity=".9"')
        + blush(74, 116, 7, 4.5, '#ffb0d0') + blush(126, 116, 7, 4.5, '#ffb0d0')
        + S('idle', eye(86, 103, 7, 9.5) + eye(114, 103, 7, 9.5))
        + S('lift', squL(87, 103, 7) + squR(113, 103, 7))
        + S('cheer', happy(86, 104, 7.5) + happy(114, 104, 7.5))
        + S('idle', P('M 94 116 Q 100 126 106 116 Z', '#7a2b3d', 3) + E(100, 120.5, 2.8, 1.8, '#ff7f9c', 0))
        + S('lift', L('M 93 118 Q 100 122 107 117', INK, 3.5) + P('M 102 119.5 Q 109 119 108.5 125 Q 104 127 102 119.5 Z', '#ff7f9c', 2.5))
        + S('cheer', P('M 90 114 Q 100 134 110 114 Z', '#7a2b3d', 3) + E(100, 124, 4.5, 3, '#ff7f9c', 0))
        + S('sad', L('M 92 124 Q 96 118 100 122 Q 104 118 108 124', INK, 3.5) + tear(82, 112) + tear(118, 112, 'tear t2'))
        + G('arm-l', 64, 116, P(armL, B))
        + G('hat', 100, 78,
            E(100, 76, 55, 12.5, HAT2)
          + P('M 66 76 C 72 50 86 30 104 18 C 117 9 136 9 144 22 C 132 19 123 25 123 36 C 123 52 129 64 135 76 Q 100 89 66 76 Z', HAT)
          + P('M 123 36 C 123 52 129 64 135 76 Q 128 79 120 80 C 116 66 114 50 123 36 Z', HAT2, 0, 'opacity=".55"')
          + P('M 69 66 Q 100 78 131 66 L 135 76 Q 100 89 66 76 Z', '#ffd84a', 4) + R(94, 71, 12, 11, 2, '#fff3b0', 3)
          + star5(96, 48, 7, '#ffd84a', 0) + star5(112, 30, 4.5, '#ffd84a', 0)
          + P('M 76 58 L 86 54 L 89 63 L 79 66 Z', '#9c82ea', 2.5, 'stroke-dasharray="3 3"')
          + L('M 80 60 C 84 46 92 34 102 26', '#fff', 3.5, 'opacity=".35"'))
        + G('arm-r', 136, 116,
            L('M 151 130 L 168 86', INK, 9) + L('M 151 130 L 168 86', '#a9743f', 4)
          + '<g class="star fb">' + star5(169, 78, 12, '#ffd84a', 4) + '</g>'
          + S('lift', sp.map((s, i) => tw(169, 78, 7, i % 2 ? '#c084fc' : '#ffe98a', 0, 'spark').replace('style="', 'style="--dx:' + s[0] + 'px;--dy:' + s[1] + 'px;')).join(''))
          + P(mir(armL), B))
        )
      + S('idle cheer lift', tw(30, 70, 7, '#ffd84a', 0) + tw(176, 132, 6, '#c084fc', .6) + tw(34, 140, 5, '#5aa9ff', 1.1))
      + S('cheer', tw(160, 30, 8, '#ffd84a', .2) + tw(48, 26, 6, '#ff9fc6', .9) + tw(184, 84, 5, '#5aa9ff', .5));
    };
  
    const STATES = ['idle', 'lift', 'cheer', 'sad'];
    let uid = 0;
    function svg(i, action, size) {
      const n = ((i | 0) % LIST.length + LIST.length) % LIST.length;
      const d = LIST[n], a = STATES.indexOf(action) >= 0 ? action : 'idle';
      return '<svg class="kf kf--' + d.key + ' is-' + a + '" viewBox="0 0 200 200" width="' + (size || 200) + '" height="' + (size || 200) + '" role="img" aria-label="' + d.name + '">' + F[d.key](++uid) + '</svg>';
    }
    return { LIST, svg, count: LIST.length };
  })();
  window.DDFiguren = DDF;
})();
