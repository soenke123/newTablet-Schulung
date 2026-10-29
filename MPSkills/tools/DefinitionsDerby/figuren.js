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
  const { INK, P, E, C, R, L, G, tube, shine, hl, shade, mirror } = K.kit;

  /* key = CSS-Name, name = Teamname, col = Teamfarbe (Oberfläche),
     soft = helle Fassung (Flächen), say = Charakter in einem Satz. */
  const LIST = [
    { key: 'brummo', name: 'Brummo', col: '#e5484d', soft: '#fde2e2',
      say: 'Kraftpaket mit Stirnband – hebt am liebsten mit einer Hand und zeigt dann seine Muskeln.' },
    { key: 'bolt', name: 'Bolt', col: '#2f7cf6', soft: '#dbe9ff',
      say: 'Kleiner Kistenroboter – rechnet jede Kiste genau aus, die Antenne blinkt dabei.' },
    { key: 'quaxi', name: 'Quaxi', col: '#2fa84f', soft: '#dcf5e2',
      say: 'Hibbeliger Frosch mit Halstuch – kann keine Sekunde stillstehen.' },
    { key: 'pieps', name: 'Pieps', col: '#e9a800', soft: '#fff3c4',
      say: 'Mutiges Küken mit Eierschalen-Helm – klein, aber gibt nie auf.' },
    { key: 'okti', name: 'Okti', col: '#8b5cf6', soft: '#ece4ff',
      say: 'Tiefenentspannter Oktopus mit Mütze – stapelt mit acht Armen und gähnt dabei.' },
    { key: 'flink', name: 'Flink', col: '#f97316', soft: '#ffe6d1',
      say: 'Frecher Fuchs – schnell, schlau und immer mit wedelndem Schwanz.' }
  ];

  const D = [];

  /* ── 0 Brummo · rotes Kraftpaket mit Hörnchen und Stirnband ── */
  D[0] = {
    pal: [['#e5484d', '#a8262c', '#fff8ec', '#ffcfc2']],
    o: { al: [31, 67], ar: [69, 67], ll: [40, 86], lr: [60, 86], head: [50, 66] },
    legL: E(40, 88.5, 7.5, 4.2, 'var(--c2)', 2.4) + E(40, 88, 3.6, 1.9, 'var(--c4)', 0, 'opacity=".7"'),
    legR: E(60, 88.5, 7.5, 4.2, 'var(--c2)', 2.4) + E(60, 88, 3.6, 1.9, 'var(--c4)', 0, 'opacity=".7"'),
    body: E(50, 75, 22, 15.5, 'var(--c1)', 3) + E(50, 77.5, 13, 10, 'var(--c4)', 0)
      + L('M 44 74 Q 50 76 56 74', INK, 1.2, 'opacity=".3"'),
    head: P('M 31 31 C 27 25 27 18 31 14 C 33 20 37 24 41 27 Z', 'var(--c3)', 2.4)
      + P(mirror('M 31 31 C 27 25 27 18 31 14 C 33 20 37 24 41 27 Z'), 'var(--c3)', 2.4)
      + E(50, 46, 26, 21.5, 'var(--c1)', 3.2)
      + shade('M 71 36 C 78 46 75 60 63 66 C 70 58 73 48 71 36 Z')
      + shine('M 28 44 C 29 38 32 34 36 32', 2.4, 0.55)
      + E(50, 56, 10, 7, 'var(--c4)', 2.2)
      // Stirnband mit Knoten rechts
      + P('M 25 39 C 38 31 62 31 75 39 L 75 45 C 62 37 38 37 25 45 Z', 'var(--c3)', 2.4)
      + L('M 30 40 C 42 35 58 35 70 40', 'var(--c1)', 1.6, 'opacity=".55"')
      + G('band', [75, 41], P('M 75 40 C 82 37 86 39 87 43 C 83 42 80 43 76 44 Z', 'var(--c3)', 2)
        + P('M 75 43 C 81 45 84 49 83 53 C 80 50 78 48 75 45 Z', 'var(--c3)', 2))
      + '{FACE}',
    face: { lx: 40.5, rx: 59.5, y: 48, r: 4.6, my: 58.5, mw: 3.2,
      extra: E(50, 53.5, 3.4, 2.4, INK, 0) + hl(49, 52.8, 0.9, 0.8) },
    back: E(50, 50, 9, 6, 'var(--c2)', 0, 'opacity=".35"'),
    armL: tube('M 31 67 Q 24 73 25 80', 'var(--c1)', 7.5) + C(25, 81.5, 4, 'var(--c1)', 2.4),
    armR: tube('M 69 67 Q 76 73 75 80', 'var(--c1)', 7.5) + C(75, 81.5, 4, 'var(--c1)', 2.4),
    vars: '--fx:var(--c3)'
  };

  /* ── 1 Bolt · Kistenroboter auf Rädern ── */
  D[1] = {
    pal: [['#2f7cf6', '#1b3f8f', '#d6e6ff', '#5ee7ff']],
    o: { al: [36, 66], ar: [64, 66], ll: [41, 84], lr: [59, 84], head: [50, 62] },
    legL: C(41, 87, 5.4, 'var(--c2)', 2.4) + C(41, 87, 2, 'var(--c3)', 0),
    legR: C(59, 87, 5.4, 'var(--c2)', 2.4) + C(59, 87, 2, 'var(--c3)', 0),
    body: R(35, 61, 30, 22, 7, 'var(--c1)', 3)
      + R(41, 65.5, 18, 12, 2.5, '#d9a066', 2, 'class="fo"')          // eine Kiste als Brustbild
      + L('M 41 70 L 59 70', '#a8743f', 1.4, 'class="fo"') + L('M 50 65.5 L 50 70', '#a8743f', 1.4, 'class="fo"'),
    head: G('antenna', [50, 22], L('M 50 22 L 50 12', INK, 2.4) + C(50, 10, 3.6, 'var(--c4)', 2, 'class="glow"'))
      + C(23.5, 41, 3.6, 'var(--c2)', 2.4) + C(76.5, 41, 3.6, 'var(--c2)', 2.4)
      + R(24, 21, 52, 40, 13, 'var(--c1)', 3.2)
      + shade('M 74 30 L 74 50 C 74 56 70 59 64 59 L 69 56 C 72 54 72 50 72 46 Z', 0.15)
      + shine('M 28 36 C 28 30 30 26 35 25', 2.4, 0.6)
      + R(30, 28, 40, 25, 10, '#0f1d3a', 2.4, 'class="fo"')
      + L('M 34 32 L 41 32', '#fff', 1.6, 'opacity=".25" class="fo"')
      + '{FACE}',
    face: { type: 'screen', col: 'var(--c4)', lx: 41.5, rx: 58.5, y: 39.5, r: 4.2, my: 47.5, mw: 4, blush: false },
    back: R(36, 30, 28, 22, 4, 'var(--c2)', 2),
    armL: tube('M 36 66 L 28 73', 'var(--c2)', 3.4) + tube('M 29.5 72 C 23.5 72 22 78 25.5 80.5', 'var(--c3)', 2.8),
    armR: tube('M 64 66 L 72 73', 'var(--c2)', 3.4) + tube('M 70.5 72 C 76.5 72 78 78 74.5 80.5', 'var(--c3)', 2.8),
    vars: '--fx:var(--c4)'
  };

  /* ── 2 Quaxi · Frosch mit Halstuch ── */
  D[2] = {
    pal: [['#2fa84f', '#17702a', '#ff9f1c', '#c9f2b4']],
    o: { al: [33, 68], ar: [67, 68], ll: [39, 86], lr: [61, 86], head: [50, 66], zz: [74, 22] },
    legL: E(38, 89, 8.5, 3.6, 'var(--c1)', 2.4) + C(31.5, 90.8, 1.3, 'var(--c4)', 0) + C(36, 91.6, 1.3, 'var(--c4)', 0),
    legR: E(62, 89, 8.5, 3.6, 'var(--c1)', 2.4) + C(68.5, 90.8, 1.3, 'var(--c4)', 0) + C(64, 91.6, 1.3, 'var(--c4)', 0),
    body: E(50, 77, 18, 13.5, 'var(--c1)', 3) + E(50, 79, 11, 8.5, 'var(--c4)', 0),
    head: E(50, 50, 28, 17.5, 'var(--c1)', 3.2)
      + C(37, 35, 9.5, 'var(--c1)', 3) + C(63, 35, 9.5, 'var(--c1)', 3)
      + shade('M 74 44 C 79 52 75 62 64 66 C 71 59 74 52 74 44 Z')
      + shine('M 27 47 C 28 42 31 39 35 37', 2.4, 0.55)
      + C(42, 54, 1, INK, 0, 'opacity=".55"') + C(58, 54, 1, INK, 0, 'opacity=".55"')
      + '{FACE}',
    face: { type: 'ring', lx: 37, rx: 63, y: 35, r: 5.6, my: 58, mw: 9, bcol: '#ff7a8a' },
    front: P('M 33 64 C 42 69 58 69 67 64 L 66 69 C 57 74 43 74 34 69 Z', 'var(--c3)', 2.4)
      + P('M 56 70 L 63 79 L 54 76 Z', 'var(--c3)', 2.2),
    back: E(50, 46, 14, 7, 'var(--c2)', 0, 'opacity=".3"'),
    armL: tube('M 33 68 Q 27 73 28 80', 'var(--c1)', 4.8) + E(28, 81, 3.4, 2.2, 'var(--c1)', 2),
    armR: tube('M 67 68 Q 73 73 72 80', 'var(--c1)', 4.8) + E(72, 81, 3.4, 2.2, 'var(--c1)', 2),
    vars: '--fx:var(--c3)'
  };

  /* ── 3 Pieps · Küken mit Eierschalen-Helm ── */
  const beak = (open) => open
    ? P('M 45.5 51 L 54.5 51 L 50 54 Z', 'var(--c3)', 2) + P('M 46.5 55 L 53.5 55 L 50 59 Z', 'var(--c3)', 2)
    : P('M 45.5 51.5 L 54.5 51.5 L 50 57 Z', 'var(--c3)', 2) + L('M 46.5 53 L 53.5 53', INK, 0.9, 'opacity=".4"');
  D[3] = {
    pal: [['#ffd23f', '#f0ab00', '#ff8a1f', '#fff3c4', '#fffaf0']],
    o: { al: [32, 66], ar: [68, 66], ll: [44, 86], lr: [56, 86], head: [50, 64] },
    legL: L('M 44 84 L 44 89', 'var(--c3)', 2.2) + P('M 38.5 91.5 L 44 88.5 L 47 91.5 Z', 'var(--c3)', 1.8),
    legR: L('M 56 84 L 56 89', 'var(--c3)', 2.2) + P(mirror('M 38.5 91.5 L 44 88.5 L 47 91.5 Z'), 'var(--c3)', 1.8),
    body: E(50, 73, 19, 15, 'var(--c1)', 3) + E(50, 76, 11, 9, 'var(--c4)', 0),
    head: E(50, 45, 22, 19.5, 'var(--c1)', 3.2)
      + shade('M 66 34 C 73 42 72 54 63 61 C 68 54 69 44 66 34 Z')
      + shine('M 32 42 C 33 37 36 34 40 32', 2.4, 0.6)
      + G('shell', [50, 30], P('M 29 36 C 29 21 39 14 50 14 C 61 14 71 21 71 36 L 66 31 L 61 37 L 55.5 31 L 50 37 L 44.5 31 L 39 37 L 34 31 Z', 'var(--c5)', 2.6)
        + C(41, 22, 1.6, '#e8dcc0', 0) + C(57, 20, 1.3, '#e8dcc0', 0) + C(62, 27, 1.1, '#e8dcc0', 0)
        + shine('M 34 26 C 36 21 39 18 43 17', 1.8, 0.7))
      + '{FACE}',
    face: { lx: 42.5, rx: 57.5, y: 44, r: 4.3,
      mouths: { normal: beak(false), open: beak(true), sad: beak(false), sleep: beak(false), wow: beak(true) } },
    back: P('M 44 48 C 47 44 53 44 56 48', 'var(--c2)', 1.6),
    armL: P('M 32 66 C 23 67 20 75 25 79 C 28 75 31 72 34 71 Z', 'var(--c2)', 2.4),
    armR: P(mirror('M 32 66 C 23 67 20 75 25 79 C 28 75 31 72 34 71 Z'), 'var(--c2)', 2.4),
    vars: '--fx:var(--c3)'
  };

  /* ── 4 Okti · lässiger Oktopus mit Mütze ── */
  const tent = (d) => tube(d, 'var(--c1)', 5.5);
  D[4] = {
    pal: [['#8b5cf6', '#5b2fc0', '#ff6fae', '#e6dbff', '#ffffff']],
    o: { al: [27, 62], ar: [73, 62], ll: [41, 80], lr: [59, 80], head: [50, 80] },
    legL: tent('M 38 78 C 33 85 27 85 27 91') + tent('M 45 80 C 44 86 41 88 42 91.5'),
    legR: tent(mirror('M 38 78 C 33 85 27 85 27 91')) + tent(mirror('M 45 80 C 44 86 41 88 42 91.5')),
    head: P('M 50 22 C 70 22 79 37 79 52 C 79 68 69 80 50 80 C 31 80 21 68 21 52 C 21 37 30 22 50 22 Z', 'var(--c1)', 3.2)
      + shade('M 73 40 C 79 54 76 70 62 78 C 72 68 75 54 73 40 Z')
      + shine('M 27 48 C 28 41 31 36 36 33', 2.6, 0.55)
      + C(66, 62, 2.4, 'var(--c4)', 0, 'opacity=".55"') + C(70, 55, 1.6, 'var(--c4)', 0, 'opacity=".55"')
      + C(31, 64, 1.8, 'var(--c4)', 0, 'opacity=".5"')
      + G('cap', [50, 22], P('M 27 35 C 28 15 72 15 73 35 C 62 29 38 29 27 35 Z', 'var(--c3)', 2.6)
        + P('M 26 34 C 38 27 62 27 74 34 L 74 39 C 62 32 38 32 26 39 Z', 'var(--c5)', 2.2)
        + C(50, 12.5, 4, 'var(--c5)', 2.2) + L('M 40 19 L 40 29 M 50 17 L 50 28 M 60 19 L 60 29', INK, 1, 'opacity=".25"'))
      + '{FACE}',
    face: { lx: 40.5, rx: 59.5, y: 52, r: 5, my: 63, mw: 4, lid: 'var(--c1)' },
    back: C(50, 52, 6, 'var(--c2)', 0, 'opacity=".3"'),
    armL: tube('M 27 62 C 18 65 17 74 22 78', 'var(--c1)', 5) + C(19.5, 70, 1, 'var(--c4)', 0) + C(20, 74.5, 1, 'var(--c4)', 0),
    armR: tube('M 73 62 C 82 65 83 74 78 78', 'var(--c1)', 5) + C(80.5, 70, 1, 'var(--c4)', 0) + C(80, 74.5, 1, 'var(--c4)', 0),
    shadow: 26,
    vars: '--fx:var(--c3)'
  };

  /* ── 5 Flink · frecher Fuchs mit Buschschwanz ── */
  D[5] = {
    pal: [['#f97316', '#b4470a', '#fff8ef', '#ffd9b8', '#3a2416']],
    o: { al: [35, 68], ar: [65, 68], ll: [42, 86], lr: [58, 86], head: [50, 64] },
    behind: G('tail', [62, 82], P('M 61 84 C 74 86 86 78 87 64 C 88 56 84 50 80 47 C 82 56 78 62 73 64 C 70 70 66 76 61 78 Z', 'var(--c1)', 2.8)
      + P('M 87 64 C 88 56 84 50 80 47 C 81 53 80 58 77 62 C 81 63 85 64 87 64 Z', 'var(--c3)', 2.2)),
    legL: E(42, 88.5, 6, 3.8, 'var(--c5)', 2.4),
    legR: E(58, 88.5, 6, 3.8, 'var(--c5)', 2.4),
    body: E(50, 75, 17, 14, 'var(--c1)', 3) + E(50, 78, 10, 9, 'var(--c3)', 0),
    head: G('ear-l', [36, 30], P('M 31 35 L 27 11 L 46 27 Z', 'var(--c1)', 2.8) + P('M 32 30 L 30 18 L 40 26 Z', 'var(--c4)', 0))
      + G('ear-r', [64, 30], P(mirror('M 31 35 L 27 11 L 46 27 Z'), 'var(--c1)', 2.8) + P(mirror('M 32 30 L 30 18 L 40 26 Z'), 'var(--c4)', 0))
      + P('M 50 23 C 66 23 76 33 78 45 C 80 53 74 59 66 62 C 60 64 55 66 50 66 C 45 66 40 64 34 62 C 26 59 20 53 22 45 C 24 33 34 23 50 23 Z', 'var(--c1)', 3.2)
      + P('M 50 66 C 44 66 39 64 33 61 C 37 55 44 52 50 55 C 56 52 63 55 67 61 C 61 64 56 66 50 66 Z', 'var(--c3)', 0)
      + shade('M 70 34 C 77 42 77 52 70 58 C 73 50 73 42 70 34 Z')
      + shine('M 28 42 C 29 36 33 31 38 29', 2.4, 0.55)
      + '{FACE}',
    face: { lx: 40.5, rx: 59.5, y: 45, r: 4.6, my: 59, mw: 3.4, mouth: 'cat',
      extra: E(50, 55, 3, 2.1, INK, 0) + hl(49.2, 54.4, 0.8, 0.8) },
    back: P('M 44 40 C 47 36 53 36 56 40', 'var(--c2)', 1.6),
    armL: tube('M 35 68 Q 29 73 30 79', 'var(--c1)', 5) + C(30, 80, 2.8, 'var(--c5)', 2),
    armR: tube('M 65 68 Q 71 73 70 79', 'var(--c1)', 5) + C(70, 80, 2.8, 'var(--c5)', 2),
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
