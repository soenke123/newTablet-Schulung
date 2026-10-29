/* ══════════════════════════════════════════════════════════════
   Definitions Derby — Die sechs Kistensturm-Figuren (figuren.js)
   ══════════════════════════════════════════════════════════════
   Je Team eine Figur (Sönke 29.10.2026: „ähnlich wie die Wesen bei
   Knowledge Stack, aber neue Wesen, sechs verschiedene, cool/süß,
   jede mit eigenem Charakter“). Gebaut mit dem Baukasten von
   Knowledge Stack (KSCreatures.buildDef + kit): dasselbe Skelett,
   dasselbe Gesicht, dieselben Bewegungen (Jubeln, Traurig …) aus
   creatures.css. Dazu kommt in tool.css (Abschnitt KISTENSTURM)
   das HEBEN (.ds-lift) und je Figur eine eigene Ruhebewegung
   (.ds-fig--<key>).

   Braucht vorher tools/KnowledgeStack/creatures.js + creatures.css
   (lädt tool.js nach). Die Reihenfolge ist die Team-Nummer — nicht
   umsortieren, das Team im Spiel ist nur eine Zahl.

   Zeichenregeln wie in creatures.js: Kasten 0…100, Boden y = 92,
   Linienfarbe --ink, Glanz links oben, Schatten rechts unten.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const K = window.KSCreatures;
  if (!K || !K.kit || !K.buildDef) { console.error('[derby] figuren.js braucht KSCreatures'); return; }
  const { INK, P, E, C, R, L, G, tube, shine, hl, shade, star, tw, mirror } = K.kit;

  /* key = CSS-Name, name = Teamname, col = Teamfarbe (Oberfläche),
     soft = helle Fassung (Flächen), say = Charakter in einem Satz. */
  const LIST = [
    { key: 'astro', name: 'Astro-Hase', col: '#5f7392', soft: '#e3e9f2',
      say: 'Hüpft durchs All – im Raumanzug, aber die Ohren passen nicht in den Helm.' },
    { key: 'lama', name: 'Bananalama', col: '#d99a00', soft: '#fff3c4',
      say: 'Halb Lama, halb Banane, ganz flauschig – nickt gemütlich zu jeder Kiste.' },
    { key: 'lauch', name: 'Lauch-Samurai', col: '#2fa84f', soft: '#dcf5e2',
      say: 'Kämpft mit Stirnband und Schwert – klein, grün und sehr ehrenhaft.' },
    { key: 'gameboy', name: 'GameBoy', col: '#2f7cf6', soft: '#dbe9ff',
      say: 'Spielkonsole auf Beinen – lächelt auf dem Bildschirm und blinkt mit der Antenne.' },
    { key: 'popcorn', name: 'Popcorn', col: '#e5484d', soft: '#fde2e2',
      say: 'Popcorn-Tüte mit 3D-Brille – hier poppt es bei jeder Kiste.' },
    { key: 'ghost', name: 'Magic Ghost', col: '#8b5cf6', soft: '#ece4ff',
      say: 'Kleines Gespenst mit Zauberhut und Stab – schwebt und zaubert Kisten herbei.' }
  ];

  const D = [];

  /* Gemeinsame Teile im Chibi-Stil (Sönke: „Kopf größer, Arme besser“):
     großer Kopf, kleiner Körper, kurze runde Arme mit Fäustling. */
  const mitt = (x, y, col, w) => E(x, y, 3.8, 3.4, col, w === undefined ? 2.2 : w) + hl(x - 1.2, y - 1.2, 0.9, 0.7);
  const arm = (side, x0, y0, col, hand) => {
    const s = side === 'l' ? -1 : 1;
    const x1 = x0 + s * 6, y1 = y0 + 9;
    return tube('M ' + x0 + ' ' + y0 + ' Q ' + (x0 + s * 7) + ' ' + (y0 + 2) + ' ' + x1 + ' ' + y1, col, 6.5) + mitt(x1, y1 + 1.5, hand || col);
  };
  /* Wuschelrand: Ellipse mit kleinen Bögen nach außen (Lama-Fell) */
  function fluff(cx, cy, rx, ry, n, k) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      if (!i) { d = 'M ' + x.toFixed(1) + ' ' + y.toFixed(1); continue; }
      const m = (i - 0.5) / n * Math.PI * 2;
      d += ' Q ' + (cx + rx * (1 + k) * Math.cos(m)).toFixed(1) + ' ' + (cy + ry * (1 + k) * Math.sin(m)).toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    return d + ' Z';
  }

  /* ── 0 Astro-Hase · großer Glashelm als Kopf, Ohren oben raus ── */
  const ear = (x, rot) => G('ear-' + (x < 50 ? 'l' : 'r'), [x, 20],
    '<g transform="rotate(' + rot + ' ' + x + ' 20)">' + E(x, 9, 5.4, 11, 'var(--c1)', 2.6) + E(x, 10, 2.5, 7.5, 'var(--c4)', 0) + '</g>');
  D[0] = {
    pal: [['#ffffff', '#c3ccda', '#8fc3ef', '#ffb8cf', '#3a3f4b']],
    o: { al: [39, 71], ar: [61, 71], ll: [44, 85], lr: [56, 85], head: [50, 66] },
    legL: E(44, 88.5, 5.6, 3.6, 'var(--c5)', 2.2),
    legR: E(56, 88.5, 5.6, 3.6, 'var(--c5)', 2.2),
    body: E(50, 77, 13, 11, 'var(--c1)', 3)
      + E(50, 67, 10, 3.2, 'var(--c2)', 2)
      + L('M 46 76 C 47 74 49 74 50 76 M 50 78 L 54 78', 'var(--c3)', 1.6)
      + shade('M 60 71 C 64 76 63 83 57 87 C 60 82 61 76 60 71 Z'),
    head: ear(41, -14) + ear(59, 12)
      + C(23.5, 44, 4.6, 'var(--c2)', 2.4)
      + C(50, 41, 27, 'var(--c1)', 3.2)
      + E(51.5, 43, 20, 18, '#ffffff', 2.8)
      + L('M 33 37 C 34 30 39 26 45 25', 'var(--c3)', 3, 'opacity=".9"')
      + shade('M 70 30 C 76 38 77 50 71 59 C 74 50 74 39 70 30 Z', 0.1)
      + shine('M 29 30 C 32 22 38 17 45 15.5', 2.6, 0.9)
      + C(77, 47, 6.4, 'var(--c1)', 2.6) + C(77, 47, 3.2, 'var(--c3)', 0)
      + '{FACE}',
    face: { lx: 45, rx: 58.5, y: 42.5, r: 4.4, my: 50, mx: 51.7, mw: 3, bcol: '#ff9fbf',
      extra: P('M 50.3 46.6 L 53.1 46.6 L 51.7 48.2 Z', '#ff8fb3', 1) },
    back: C(50, 44, 10, 'var(--c2)', 0, 'opacity=".25"'),
    armL: arm('l', 39, 71, 'var(--c1)'),
    armR: arm('r', 61, 71, 'var(--c1)'),
    fx: tw(12, 28, 3.4, '#ffb347', 0) + tw(90, 64, 2.6, '#c084fc', 0.7) + tw(13, 66, 2.2, '#5aa9e6', 1.2),
    vars: '--fx:var(--c3)'
  };

  /* ── 1 Bananalama · flauschiges Lama, die Banane als Körper ── */
  D[1] = {
    pal: [['#ffe066', '#e3ab14', '#fffaf0', '#4a3a2a', '#efe4cf']],
    o: { al: [60, 66], ar: [72, 66], ll: [32, 82], lr: [64, 82], head: [64, 66], zz: [86, 12] },
    behind: G('tail', [17, 64], P('M 19 66 C 14 62 12 56 14 51 C 17 55 19 58 22 61 Z', 'var(--c1)', 2.4)
      + P('M 14 51 C 13 49 14 47 16 47 L 16.5 51 Z', 'var(--c4)', 1.4)),
    legL: R(26.5, 78, 6, 11, 2.8, 'var(--c3)', 2.2) + R(35.5, 79, 6, 10, 2.8, 'var(--c3)', 2.2)
      + R(26.5, 87, 6, 3.6, 1.4, 'var(--c4)', 1.4) + R(35.5, 87, 6, 3.6, 1.4, 'var(--c4)', 1.4),
    legR: R(58.5, 78, 6, 11, 2.8, 'var(--c3)', 2.2) + R(67.5, 78, 6, 11, 2.8, 'var(--c3)', 2.2)
      + R(58.5, 87, 6, 3.6, 1.4, 'var(--c4)', 1.4) + R(67.5, 87, 6, 3.6, 1.4, 'var(--c4)', 1.4),
    body: P('M 18 66 C 18 57 30 53 44 56 C 52 58 58 59 62 62 C 66 70 63 79 54 82 C 42 85 26 84 21 79 C 18 76 17 71 18 66 Z', 'var(--c1)', 3)
      + L('M 21 70 C 31 77 47 78 59 72', 'var(--c2)', 1.8, 'opacity=".7"')
      + L('M 23 62 C 32 64 44 64 55 63', 'var(--c2)', 1.4, 'opacity=".45"')
      + shine('M 24 61 C 28 58 34 57 40 57.5', 2.6, 0.75),
    head: P(fluff(66, 62, 11.5, 19, 16, 0.07), 'var(--c3)', 2.8)
      + L('M 60 56 Q 62 58 64 56 M 66 64 Q 68 66 70 64 M 61 70 Q 63 72 65 70', 'var(--c5)', 1.3)
      + G('ear-l', [59, 20], P('M 57 22 C 53 15 53 6 56 2 C 60 6 62 13 62 20 Z', 'var(--c3)', 2.4) + P('M 57.4 18 C 56 13 56 9 57 6.5 C 59 10 60 14 60 18 Z', '#ffc7d4', 0))
      + G('ear-r', [72, 20], P('M 70 20 C 71 13 74 7 78 3 C 80 8 78 15 75 22 Z', 'var(--c3)', 2.4) + P('M 72 18 C 73 13 75 10 77 7.5 C 77.5 11 76 15 74 19 Z', '#ffc7d4', 0))
      + P(fluff(66, 31, 14.5, 13, 18, 0.06), 'var(--c3)', 3)
      + P(fluff(64, 19, 6, 3.5, 7, 0.25), 'var(--c3)', 2)
      + shade('M 78 26 C 82 32 80 40 73 44 C 77 38 79 32 78 26 Z', 0.1)
      + E(66.5, 38, 6, 4, '#fff4dc', 0)
      + '{FACE}',
    face: { lx: 60.5, rx: 72.5, y: 30, r: 3.6, my: 39.3, mx: 66.5, mw: 2.2, bcol: '#ffb0c2',
      extra: E(66.5, 36.4, 1.5, 1.05, 'var(--c4)', 0) },
    back: E(66, 31, 6, 4, 'var(--c5)', 0, 'opacity=".6"'),
    armL: '', armR: '',
    shadow: 30,
    vars: '--fx:var(--c2)'
  };

  /* ── 2 Lauch-Samurai · großer Blatt-Kopf, drei Blätter, Stirnband, Schwert ── */
  const leaf = (d, vein) => P(d, 'var(--c1)', 2.6) + L(vein, 'var(--c2)', 1.2, 'opacity=".55"');
  D[2] = {
    pal: [['#8fcf74', '#3f8b3c', '#ffffff', '#2c4637', '#d5dde6', '#6b3f22']],
    o: { al: [40, 72], ar: [60, 72], ll: [44, 85], lr: [56, 85], head: [50, 68] },
    legL: R(40, 81, 8, 7, 2.5, 'var(--c4)', 2.2) + E(43.5, 89.6, 5.4, 2.8, '#1f2a24', 2),
    legR: R(52, 81, 8, 7, 2.5, 'var(--c4)', 2.2) + E(56.5, 89.6, 5.4, 2.8, '#1f2a24', 2),
    body: R(38, 67, 24, 17, 7, 'var(--c4)', 3)
      + L('M 45 67.5 L 50 73 L 55 67.5', '#e9f5d8', 2.2)
      + R(38.5, 76, 23, 3.6, 1.4, '#1a2a20', 1.4) + P('M 55 78 L 58 84 L 56.5 78 Z', '#1a2a20', 1),
    head: G('leaves',  [50, 22],
        leaf('M 34 26 C 28 18 27 9 30 3 C 37 8 42 15 43 23 Z', 'M 31 6 C 35 12 38 17 41 22')
      + leaf('M 66 26 C 72 18 73 9 70 3 C 63 8 58 15 57 23 Z', 'M 69 6 C 65 12 62 17 59 22')
      + leaf('M 50 24 C 43 16 42 7 50 -1 C 58 7 57 16 50 24 Z', 'M 50 1 L 50 22'))
      + leaf('M 29 33 C 22 30 17 32 15 36 C 20 39 26 38 29 36 Z', 'M 17 36 L 28 34.5')
      + E(50, 45, 26, 23, 'var(--c1)', 3.2)
      + L('M 50 24 C 50 36 50 52 50 66', 'var(--c2)', 1.4, 'opacity=".35"')
      + shade('M 70 33 C 78 42 77 56 66 64 C 72 56 73 44 70 33 Z')
      + shine('M 30 42 C 31 36 34 31 39 28', 2.6, 0.55)
      + P('M 24.5 33 C 37 27.5 63 27.5 75.5 33 L 75.5 39.5 C 63 34 37 34 24.5 39.5 Z', 'var(--c3)', 2.4)
      + G('band', [26, 36], P('M 26 34 C 19 30 13 31 11 34 C 16 36 21 36 26 37 Z', 'var(--c3)', 2)
        + P('M 26 37 C 20 39 16 43 16 47 C 20 45 23 42 26 39 Z', 'var(--c3)', 2))
      + '{FACE}',
    face: { lx: 42, rx: 58, y: 47.5, r: 4.6, my: 56, mw: 3.6 },
    back: L('M 38 47 L 62 47', 'var(--c2)', 1.4, 'opacity=".4"'),
    armL: arm('l', 40, 72, 'var(--c4)', 'var(--c1)'),
    armR: arm('r', 60, 72, 'var(--c4)', 'var(--c1)'),
    front: '<g class="katana" transform="rotate(24 70 82)">' + R(67.6, 64, 4.8, 3.6, 1, '#ffd84a', 1.2)
        + P('M 68.6 64 L 69.2 30 L 71.8 26.5 L 71.2 64 Z', 'var(--c5)', 1.6) + L('M 70.1 61 L 70.4 31', '#ffffff', 0.8, 'opacity=".8"')
        + R(68.2, 67.4, 3.4, 12, 1.2, 'var(--c6)', 1.4) + '</g>',
    vars: '--fx:var(--c1)'
  };

  /* ── 3 GameBoy · große Konsole, großer Bildschirm mit Gesicht ── */
  D[3] = {
    pal: [['#4f8df5', '#2a5bb8', '#ffd84a', '#8dff7a', '#ff5c8a', '#141a24', '#cfd9e8']],
    o: { al: [22, 60], ar: [78, 60], ll: [40, 84], lr: [60, 84], head: [50, 84] },
    legL: tube('M 40 83 L 39 89', '#4a3a2a', 3.6) + E(38.5, 90, 4.6, 2.4, '#2a2433', 1.4),
    legR: tube('M 60 83 L 61 89', '#4a3a2a', 3.6) + E(61.5, 90, 4.6, 2.4, '#2a2433', 1.4),
    head: G('antenna', [50, 9], L('M 50 10 L 50 4', INK, 2.4) + C(50, 3.2, 3.2, '#5aa9ff', 2, 'class="glow"') + R(46, 8.5, 8, 3, 1.2, '#4caf50', 1.4))
      + R(77, 22, 5, 13, 2, '#4caf50', 2)
      + R(21, 10, 58, 75, 10, 'var(--c1)', 3.2)
      + shade('M 75 18 L 75 76 C 75 80 72 83 68 83 L 73 79 C 74 78 74 76 74 74 Z', 0.18)
      + shine('M 25 24 C 25 17 28 14 33 13.5', 2.6, 0.6)
      + R(26, 15, 48, 40, 7, 'var(--c6)', 2.6)
      + shine('M 30 22 C 30 19.5 31 18.5 34 18.3', 1.8, 0.25)
      + R(28, 61.5, 13, 4.6, 1.4, 'var(--c6)', 1.4) + R(32.2, 57.3, 4.6, 13, 1.4, 'var(--c6)', 1.4)
      + C(64, 65, 3.6, '#4caf50', 2) + C(71, 60, 3.6, 'var(--c5)', 2)
      + R(46, 62, 2.6, 7, 1.3, 'var(--c2)', 1, 'transform="rotate(-35 47.3 65.5)"') + R(52, 62, 2.6, 7, 1.3, 'var(--c2)', 1, 'transform="rotate(-35 53.3 65.5)"')
      + L('M 62 77 L 69 72 M 65 79.5 L 71.5 75', 'var(--c2)', 1.4, 'opacity=".8"')
      + '{FACE}',
    face: { type: 'screen', col: 'var(--c4)', lx: 41, rx: 59, y: 33, r: 4.4, my: 44, mw: 7, blush: false },
    back: R(30, 20, 40, 52, 5, 'var(--c2)', 2) + C(50, 46, 8, 'var(--c1)', 1.6),
    armL: arm('l', 22, 60, 'var(--c7)'),
    armR: arm('r', 78, 60, 'var(--c7)'),
    vars: '--fx:var(--c4)'
  };

  /* ── 4 Popcorn · gestreifte Tüte, Popcorn obendrauf, 3D-Brille ── */
  const puff = (x, y, r) => C(x, y, r, 'var(--c3)', 2.2) + C(x - r * 0.25, y + r * 0.2, r * 0.45, 'var(--c4)', 0, 'opacity=".55"') + hl(x - r * 0.35, y - r * 0.35, r * 0.22, 0.9);
  D[4] = {
    pal: [['#e5484d', '#ffffff', '#fff3d1', '#f5c242', '#3b82f6', '#ff3b3b']],
    o: { al: [31, 62], ar: [69, 62], ll: [42, 86], lr: [58, 86], head: [50, 86] },
    legL: tube('M 42 85 L 41 89', INK, 2.6) + E(40.5, 90, 4.6, 2.5, '#2a2433', 1.4),
    legR: tube('M 58 85 L 59 89', INK, 2.6) + E(59.5, 90, 4.6, 2.5, '#2a2433', 1.4),
    head: G('pops', [50, 30], puff(34, 32, 7) + puff(66, 32, 7) + puff(44, 24, 7.5) + puff(57, 23, 8) + puff(50, 31, 7) + puff(40, 35, 6) + puff(61, 35, 6))
      + P('M 28 38 L 72 38 L 66 87 L 34 87 Z', 'var(--c2)', 3)
      + P('M 33.5 38 L 39.5 38 L 40.5 87 L 36.5 87 Z', 'var(--c1)', 0)
      + P('M 47 38 L 53 38 L 52.5 87 L 47.5 87 Z', 'var(--c1)', 0)
      + P('M 60.5 38 L 66.5 38 L 63.5 87 L 59.5 87 Z', 'var(--c1)', 0)
      + P('M 28 38 L 72 38 L 66 87 L 34 87 Z', 'none', 3)
      + R(26, 36, 48, 6.5, 2.5, 'var(--c2)', 2.4)
      + shade('M 66 42 L 72 42 L 66 86 L 62 86 Z', 0.12)
      + '{FACE}',
    headTop: R(36, 51, 12.5, 8.5, 2.5, 'var(--c6)', 1.8, 'opacity=".9"') + R(51.5, 51, 12.5, 8.5, 2.5, 'var(--c5)', 1.8, 'opacity=".9"')
      + R(34.5, 49.8, 31, 11, 3, 'none', 2.6) + L('M 48.5 54 L 51.5 54', INK, 2)
      + L('M 38 53 L 42 53', '#ffffff', 1.2, 'opacity=".7"') + L('M 53.5 53 L 57.5 53', '#ffffff', 1.2, 'opacity=".7"'),
    face: { lx: 42.2, rx: 57.8, y: 55.3, r: 3.6, my: 67, mw: 4.5, bcol: '#ff7a8a' },
    back: L('M 40 60 L 60 60', 'var(--c1)', 2, 'opacity=".4"'),
    armL: tube('M 31 62 Q 25 65 25 71', INK, 2.8) + mitt(24.8, 73.5, '#ffffff'),
    armR: tube('M 69 62 Q 75 65 75 71', INK, 2.8) + mitt(75.2, 73.5, '#ffffff'),
    fx: G('fly', null, puff(17, 26, 3.2) + puff(84, 18, 2.8)),
    vars: '--fx:var(--c4)'
  };

  /* ── 5 Magic Ghost · schwebendes Gespenst mit Zauberhut und Stab ── */
  D[5] = {
    pal: [['#efe9fc', '#6b4fb8', '#ffd84a', '#5aa9ff', '#8b5e3c', '#c4b5f0']],
    o: { al: [28, 60], ar: [72, 60], ll: [40, 84], lr: [60, 84], head: [50, 80], zz: [76, 22] },
    head: P('M 50 32 C 66 32 74 44 74 58 L 74 78 C 70 82 67 77 63 81 C 59 85 55 79 50 83 C 45 79 41 85 37 81 C 33 77 30 82 26 78 L 26 58 C 26 44 34 32 50 32 Z', 'var(--c1)', 3.2)
      + shade('M 68 44 C 73 52 73 68 72 77 C 69 79 67 77 65 78 C 69 68 70 56 68 44 Z', 0.12)
      + shine('M 31 56 C 31 48 34 42 39 39', 2.6, 0.7)
      + G('hat', [50, 34], P('M 33 35 C 37 22 45 13 55 8 C 62 5 69 6 72 11 C 66 9 61 12 61 18 C 61 25 63 30 66 35 Z', 'var(--c2)', 2.8)
        + E(50, 35.5, 25, 5, 'var(--c2)', 2.6)
        + L('M 36 32 C 45 30 56 30 65 32', 'var(--c6)', 2.2, 'opacity=".9"')
        + star(48, 22, 2.6, 'var(--c3)') + star(57, 15, 2, 'var(--c3)') + star(42, 30, 1.6, 'var(--c3)')
        + shine('M 40 28 C 43 21 47 16 52 13', 1.8, 0.4))
      + '{FACE}',
    face: { lx: 43, rx: 57, y: 52, r: 4, my: 60, mw: 3, bcol: '#ff9fc6' },
    back: E(50, 58, 10, 8, 'var(--c6)', 0, 'opacity=".35"'),
    armL: P('M 28 59 C 20 60 17 67 21 71 C 24 73 27 69 29 66 Z', 'var(--c1)', 2.4),
    armR: P(mirror('M 28 59 C 20 60 17 67 21 71 C 24 73 27 69 29 66 Z'), 'var(--c1)', 2.4),
    front: G('staff', [80, 70], L('M 78 80 L 86 38', INK, 4.6) + L('M 78 80 L 86 38', 'var(--c5)', 2.6)
        + C(86.5, 35.5, 5.4, 'var(--c4)', 2.2, 'class="glow"') + hl(85, 34, 1.6, 0.9)),
    fx: tw(16, 40, 3, '#ffd84a', 0) + tw(88, 58, 2.4, '#c084fc', 0.6) + tw(20, 74, 2, '#5aa9ff', 1.1),
    shadow: 17,
    vars: '--fx:var(--c3)'
  };

  /* Eine Figur als SVG. action: idle · lift · cheer · sad · jump · wave (KS) ·
     sleep. Das Heben ist .ds-lift (tool.css) auf dem Ruhezustand. */
  function svg(i, action, size) {
    const n = ((i | 0) % LIST.length + LIST.length) % LIST.length;
    const id = 100 + n;   // eigene Nummern: eigene Bewegungs-Mischung aus creatures.css
    const a = action || 'idle';
    const cls = (a === 'lift' || a === 'idle' ? 'c-idle' : K.cls(a, id)) + ' ds-fig ds-fig--' + LIST[n].key + (a === 'lift' ? ' ds-lift' : '');
    return K.buildDef(D[n], 0, cls, size, id, 'derby');
  }

  window.DDFiguren = { LIST, svg, count: LIST.length };
})();
