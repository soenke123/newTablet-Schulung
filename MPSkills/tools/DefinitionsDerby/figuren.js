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
      say: 'Halb Lama, halb Banane, immer mit Sonnenbrille – nickt cool zu jeder Kiste.' },
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

  /* ── 0 Astro-Hase · Raumanzug, Glashelm, Ohren oben raus ── */
  const ear = (x, rot) => G('ear-' + (x < 50 ? 'l' : 'r'), [x, 24],
    '<g transform="rotate(' + rot + ' ' + x + ' 24)">' + E(x, 12, 5.2, 12.5, 'var(--c1)', 2.6) + E(x, 13, 2.4, 8.5, 'var(--c4)', 0) + '</g>');
  D[0] = {
    pal: [['#f8f9fc', '#b3bfd1', '#5aa9e6', '#ffb8cf', '#e3f2ff']],
    o: { al: [37, 66], ar: [63, 66], ll: [43, 84], lr: [57, 84], head: [50, 64] },
    legL: R(36.5, 83, 12, 8.5, 4, 'var(--c1)', 2.4) + L('M 38 88 L 47 88', 'var(--c2)', 1.6),
    legR: R(51.5, 83, 12, 8.5, 4, 'var(--c1)', 2.4) + L('M 53 88 L 62 88', 'var(--c2)', 1.6),
    body: E(50, 74, 15.5, 13, 'var(--c1)', 3)
      + R(44, 69, 12, 8.5, 2.5, 'var(--c3)', 2) + C(47.5, 73.2, 1.3, '#fff', 0) + C(52.5, 73.2, 1.3, '#ffd84a', 0)
      + shade('M 62 66 C 66 72 65 80 58 85 C 61 79 62 72 62 66 Z'),
    head: ear(42, -12) + ear(58, 12)
      + C(25.5, 42, 5, 'var(--c3)', 2.4) + C(74.5, 42, 5, 'var(--c3)', 2.4)
      + C(50, 42, 24, 'var(--c5)', 3.2)
      + E(50, 45, 17.5, 15.5, '#ffffff', 0)
      + P('M 34 30 C 38 23 45 20 52 20', 'none', 0) + shine('M 33 33 C 36 26 42 22 49 21', 2.8, 0.8)
      + shine('M 69 50 C 70 47 70.5 44 70.5 41', 2, 0.6)
      + '{FACE}',
    face: { lx: 43.5, rx: 56.5, y: 44.5, r: 4, my: 52, mw: 2.8, bcol: '#ff8fb3',
      extra: P('M 48.6 48.4 L 51.4 48.4 L 50 50 Z', '#ff8fb3', 1) },
    back: C(50, 44, 9, 'var(--c2)', 0, 'opacity=".25"'),
    armL: tube('M 37 66 Q 30 71 31 78', 'var(--c1)', 5.5) + C(31, 79, 3.2, 'var(--c2)', 2),
    armR: tube('M 63 66 Q 70 71 69 78', 'var(--c1)', 5.5) + C(69, 79, 3.2, 'var(--c2)', 2),
    fx: tw(14, 30, 3.4, '#ffd84a', 0) + tw(86, 58, 2.6, '#c084fc', 0.7) + tw(16, 70, 2.2, '#5aa9e6', 1.2),
    vars: '--fx:var(--c3)'
  };

  /* ── 1 Bananalama · Bananen-Körper, Lama-Kopf, Sonnenbrille ── */
  D[1] = {
    pal: [['#ffe066', '#e0a800', '#fff6e2', '#7a5a2a', '#2a2433']],
    o: { al: [40, 70], ar: [60, 70], ll: [36, 82], lr: [62, 82], head: [64, 48], zz: [84, 16] },
    behind: G('tail', [18, 66], P('M 20 64 L 12 60 L 11 64 L 19 68 Z', 'var(--c4)', 2)),
    legL: tube('M 30 79 L 29 90', 'var(--c3)', 4.5) + tube('M 41 81 L 41 90', 'var(--c3)', 4.5)
      + R(26.5, 88.5, 5.5, 3.2, 1.2, 'var(--c4)', 1.4) + R(38.3, 88.5, 5.5, 3.2, 1.2, 'var(--c4)', 1.4),
    legR: tube('M 57 80 L 58 90', 'var(--c3)', 4.5) + tube('M 68 77 L 70 90', 'var(--c3)', 4.5)
      + R(55.2, 88.5, 5.5, 3.2, 1.2, 'var(--c4)', 1.4) + R(67.3, 88.5, 5.5, 3.2, 1.2, 'var(--c4)', 1.4),
    body: P('M 19 66 C 21 58 33 56 47 59 C 58 61 67 58 74 53 C 79 59 78 72 69 78 C 57 85 33 85 24 79 C 19 76 17 71 19 66 Z', 'var(--c1)', 3)
      + L('M 24 70 C 36 76 56 76 70 66', 'var(--c2)', 1.6, 'opacity=".7"')
      + L('M 27 63 C 38 66 54 66 66 61', 'var(--c2)', 1.3, 'opacity=".5"')
      + shine('M 26 64 C 30 61 36 60 42 60.5', 2.4, 0.7),
    head: P('M 56 68 C 57 58 58 48 58 38 L 72 38 C 72 48 72 58 71 66 Z', 'var(--c3)', 2.8)
      + L('M 60 50 C 62 52 66 52 68 50 M 60 57 C 62 59 66 59 69 57', '#e8dcc4', 1.4)
      + G('ear-l', [57, 22], P('M 55 24 C 51 17 51 9 54 5 C 58 9 60 16 60 22 Z', 'var(--c3)', 2.4) + P('M 55.5 20 C 54 15 54 11 55 9 C 57 12 58 16 58 20 Z', '#ffc7d4', 0))
      + G('ear-r', [71, 22], P('M 68 22 C 69 15 72 9 76 5 C 78 10 76 17 73 24 Z', 'var(--c3)', 2.4) + P('M 70 20 C 71 15 73 12 75 9 C 75.5 13 74 17 72 21 Z', '#ffc7d4', 0))
      + E(64, 31, 14.5, 12.5, 'var(--c3)', 3)
      + P('M 56 21 C 58 15 63 13 67 15 C 70 13 74 16 74 20 C 69 18 62 18 56 21 Z', 'var(--c3)', 2.2)
      + shade('M 75 27 C 79 33 77 40 71 43 C 74 38 76 33 75 27 Z')
      + E(65, 38, 8.5, 5.5, '#fffaf0', 2.2)
      + E(62.6, 36.4, 1.1, .9, 'var(--c5)', 0) + E(67.4, 36.4, 1.1, .9, 'var(--c5)', 0)
      + '{FACE}',
    headTop: R(52.5, 26, 10, 6.6, 2.8, 'var(--c5)', 1.6) + R(65, 26, 10, 6.6, 2.8, 'var(--c5)', 1.6)
      + L('M 62.5 28.5 L 65 28.5 M 52.5 28 L 50.5 27', 'var(--c5)', 1.8)
      + L('M 54.5 28 L 57.5 28', '#ffffff', 1.2, 'opacity=".75"') + L('M 67 28 L 70 28', '#ffffff', 1.2, 'opacity=".75"'),
    face: { lx: 57.5, rx: 70, y: 29.3, r: 2.8, my: 40.6, mx: 65, mw: 2.6, bcol: '#ff9fb0' },
    back: E(64, 29, 6, 4, 'var(--c2)', 0, 'opacity=".3"'),
    armL: '', armR: '',
    shadow: 30,
    vars: '--fx:var(--c2)'
  };

  /* ── 2 Lauch-Samurai · Lauch-Kopf mit Blättern, Stirnband, Schwert ── */
  D[2] = {
    pal: [['#86c96e', '#3f8b3c', '#ffffff', '#2f5a35', '#d5dde6', '#6b3f22']],
    o: { al: [37, 64], ar: [63, 64], ll: [43, 82], lr: [57, 82], head: [50, 60] },
    legL: R(38, 78, 10, 9, 3, 'var(--c4)', 2.4) + E(42, 89.5, 6, 3, '#2a2433', 2),
    legR: R(52, 78, 10, 9, 3, 'var(--c4)', 2.4) + E(58, 89.5, 6, 3, '#2a2433', 2),
    body: R(36, 58, 28, 24, 10, 'var(--c4)', 3)
      + P('M 44 58 L 50 66 L 56 58', 'none', 0) + L('M 44 59 L 50 66 L 56 59', '#e9f5d8', 2.4)
      + R(36.5, 70, 27, 4.5, 1.5, '#1f3b24', 1.6) + P('M 56 72 L 60 79 L 58 72 Z', '#1f3b24', 1.2),
    head: G('leaves', [50, 26],
        P('M 50 28 C 44 18 40 10 38 2 C 46 8 51 16 52 26 Z', 'var(--c2)', 2.4)
      + P('M 48 28 C 40 22 32 18 24 16 C 32 14 42 18 50 25 Z', 'var(--c2)', 2.4)
      + P('M 52 28 C 58 18 62 10 66 4 C 68 12 62 20 54 28 Z', 'var(--c2)', 2.4)
      + P('M 52 28 C 60 22 68 20 76 20 C 70 25 60 28 53 30 Z', 'var(--c2)', 2.4)
      + L('M 44 13 L 50 25 M 60 12 L 53 25', '#2a6a2c', 1, 'opacity=".5"'))
      + E(50, 42, 20, 17.5, 'var(--c1)', 3.2)
      + shade('M 66 34 C 72 42 70 52 61 58 C 66 51 68 43 66 34 Z')
      + L('M 41 52 L 41 57 M 50 53 L 50 58 M 59 52 L 59 57', '#5aa04a', 1.2, 'opacity=".5"')
      + shine('M 34 40 C 35 35 38 31 42 29.5', 2.4, 0.55)
      + G('band', [70, 33], P('M 69 31 C 76 28 82 29 84 32 C 80 33 76 34 70 35 Z', 'var(--c3)', 2)
        + P('M 69 34 C 75 36 79 40 79 45 C 75 42 72 39 69 36 Z', 'var(--c3)', 2))
      + P('M 30.5 33 C 42 28.5 58 28.5 69.5 33 L 70 38 C 58 34 42 34 30 38 Z', 'var(--c3)', 2.2)
      + C(50, 33.5, 1.8, '#e5484d', 0)
      + '{FACE}',
    face: { lx: 43, rx: 57, y: 44.5, r: 3.8, my: 52, mw: 2.8 },
    back: L('M 42 44 L 58 44', '#5aa04a', 1.4, 'opacity=".5"'),
    armL: tube('M 37 64 Q 30 69 31 76', 'var(--c4)', 5) + C(31, 77, 3, 'var(--c1)', 2),
    armR: tube('M 63 64 Q 69 69 70 76', 'var(--c4)', 5) + C(70, 77, 3, 'var(--c1)', 2),
    front: '<g class="katana" transform="rotate(20 71 78)">' + R(68.6, 59, 4.4, 3.6, 1, '#ffd84a', 1.2)
        + P('M 69.6 59 L 70.2 22 L 72.6 18.5 L 72 59 Z', 'var(--c5)', 1.6) + L('M 71.1 56 L 71.4 23', '#ffffff', 0.8, 'opacity=".8"')
        + R(69.2, 62.4, 3.2, 13, 1.2, 'var(--c6)', 1.4) + '</g>',
    vars: '--fx:var(--c1)'
  };

  /* ── 3 GameBoy · Spielkonsole mit Bildschirm-Gesicht ── */
  D[3] = {
    pal: [['#4f8df5', '#2a5bb8', '#ffd84a', '#7dff8a', '#ff5c8a', '#18202e']],
    o: { al: [27, 58], ar: [73, 58], ll: [41, 84], lr: [59, 84], head: [50, 84] },
    legL: tube('M 41 82 L 40 89', 'var(--c6)', 3.2) + E(39, 90, 5, 2.6, 'var(--c6)', 1.4),
    legR: tube('M 59 82 L 60 89', 'var(--c6)', 3.2) + E(61, 90, 5, 2.6, 'var(--c6)', 1.4),
    head: G('antenna', [50, 14], L('M 50 15 L 50 7', INK, 2.4) + C(50, 5.5, 3.4, 'var(--c4)', 2, 'class="glow"'))
      + R(26, 13, 48, 70, 9, 'var(--c1)', 3.2)
      + shade('M 70 20 L 70 74 C 70 78 68 80 64 80 L 68 77 C 69 76 69 74 69 72 Z', 0.18)
      + shine('M 30 26 C 30 20 32 17 36 16.5', 2.4, 0.6)
      + R(30, 18, 40, 32, 6, 'var(--c2)', 2.4)
      + R(33.5, 21, 33, 26, 3.5, 'var(--c6)', 2)
      + L('M 36 24 L 42 24', '#ffffff', 1.4, 'opacity=".2"')
      + R(33.5, 59.5, 12, 4, 1.2, 'var(--c6)', 1.4) + R(37.5, 55.5, 4, 12, 1.2, 'var(--c6)', 1.4)
      + C(60, 63, 3.4, 'var(--c5)', 2) + C(67, 58.5, 3.4, 'var(--c5)', 2)
      + R(46, 71, 3, 7, 1.5, 'var(--c2)', 1.2, 'transform="rotate(-30 47.5 74.5)"') + R(52, 71, 3, 7, 1.5, 'var(--c2)', 1.2, 'transform="rotate(-30 53.5 74.5)"')
      + L('M 60 75 L 66 71 M 62 78 L 68 74 M 64 81 L 69 77', 'var(--c2)', 1.4, 'opacity=".8"')
      + '{FACE}',
    face: { type: 'screen', col: 'var(--c4)', lx: 43, rx: 57, y: 31, r: 3.4, my: 39, mw: 5, blush: false },
    back: R(32, 22, 36, 50, 5, 'var(--c2)', 2) + C(50, 46, 7, 'var(--c1)', 1.6),
    armL: tube('M 27 58 Q 20 63 21 71', 'var(--c6)', 3.2) + C(21, 72.5, 3.2, '#f1f3f7', 2),
    armR: tube('M 73 58 Q 80 63 79 71', 'var(--c6)', 3.2) + C(79, 72.5, 3.2, '#f1f3f7', 2),
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
    armL: tube('M 31 62 Q 24 66 25 73', INK, 2.6) + C(25, 74.5, 3, '#ffffff', 2),
    armR: tube('M 69 62 Q 76 66 75 73', INK, 2.6) + C(75, 74.5, 3, '#ffffff', 2),
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
    armL: P('M 28 60 C 21 62 19 68 22 71 C 25 69 27 66 29 66 Z', 'var(--c1)', 2.4),
    armR: P(mirror('M 28 60 C 21 62 19 68 22 71 C 25 69 27 66 29 66 Z'), 'var(--c1)', 2.4),
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
