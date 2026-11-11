/* Knowledge Stack — Wesen, Fassung 3 (Entwurf): Wesen 10 … 19 */
(function () {
  'use strict';
  const W = window.KSWesenNeu;
  const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, mirror, gesicht, MOUTH, TONGUE } = W.kit;
  const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)', c5 = 'var(--c5)';

  /* ── 10 Grumbl · Felsbrocken ─────────────────────────────── */
  const fist10 = 'M 24 57 C 13 59 9 70 12 79 C 14 86 25 86 27 78 C 28.5 70 28 62 24 57 Z';
  W.add(10, {
    typ: 'Der Grummler', spruch: 'Brummt den ganzen Tag. Gießt heimlich seine Blume.',
    vars: '--fx:var(--c3)',
    o: { al: [24, 60], ar: [76, 60], ll: [40, 82], lr: [60, 82], head: [50, 80] },
    behind: P('M 70 34 L 78 18 L 84 36 Z', c3, 2.2, 'class="glow-soft"') + P('M 78 40 L 88 30 L 88 46 Z', c3, 2, 'class="glow-soft"'),
    legL: R(32, 79, 15, 12, 4, c2, 2.6), legR: R(53, 79, 15, 12, 4, c2, 2.6),
    head: P('M 29 35 L 51 27 L 72 34 L 81 52 L 77 71 L 59 79 L 37 78 L 22 64 L 21 47 Z', c1, 3.4)
      + shade('M 72 34 L 81 52 L 77 71 L 59 79 L 66 60 L 68 44 Z', 0.16)
      + L('M 29 35 L 37 44 M 59 79 L 56 70 M 22 64 L 30 62', INK, 1.3, 'opacity=".35"')
      + shine('M 27 44 L 30 38 L 38 35', 2.4, 0.4)
      + gesicht({ x: [39, 61], y: 53, r: 5, p: 0.5, lid: [0.2, 10], lidc: c1, look: [[0.2, 0.2], [-0.2, 0.2]], lookc: 'lk-slow',
          blush: false, mx: 50, my: 66.5, mw: 7.5, m: 'frown', mlw: 2.8,
          post: P('M 54 66.4 L 55.4 62 L 57.4 67.4 Z', '#fff', 1.2) })
      + G('fo', null, P('M 26 44 L 50 49 L 74 44 L 75.5 50 L 50 55.5 L 24.5 50 Z', c2, 2.8))
      + P('M 31 34 C 34 28 42 27 46 29 C 49 25 57 25 60 29 L 54 33 C 48 30 40 33 34 37 Z', c4, 2.2)
      + G('sway', [42, 28], L('M 42 28 C 41 23 42 20 43 17', INK, 3.6) + L('M 42 28 C 41 23 42 20 43 17', '#3fa34d', 1.8)
        + C(40.2, 14.6, 2.3, '#fff', 1.4) + C(45.6, 14.6, 2.3, '#fff', 1.4) + C(43, 11.6, 2.3, '#fff', 1.4) + C(43, 17.4, 2.3, '#fff', 1.4) + C(43, 14.6, 1.8, '#ffd23f', 1.2)),
    back: L('M 38 44 L 48 52 L 44 62 M 60 40 L 56 50', INK, 1.6, 'opacity=".35"'),
    armL: P(fist10, c1, 2.8) + L('M 15 78 L 24 78', INK, 1.2, 'opacity=".35"'),
    armR: P(mirror(fist10), c1, 2.8) + L('M 76 78 L 85 78', INK, 1.2, 'opacity=".35"'),
    fx: tw(88, 22, 2.4, c3, 0.5)
  });

  /* ── 11 Mochi · Reiskuchen-Koch ──────────────────────────── */
  W.add(11, {
    typ: 'Der Feinschmecker', spruch: 'Probiert nur kurz. Zum fünften Mal.',
    o: { al: [20, 66], ar: [80, 66], ll: [39, 86], lr: [61, 86], head: [50, 88], zz: [78, 30] },
    legL: E(39, 88.6, 6.5, 3.5, c2, 2.4), legR: E(61, 88.6, 6.5, 3.5, c2, 2.4),
    head: P('M 50 32 C 71 32 84 46 84 64 C 84 80 74 88 50 88 C 26 88 16 80 16 64 C 16 46 29 32 50 32 Z', c1, 3.2)
      + shade('M 80 52 C 86 66 82 82 66 86 C 76 80 81 68 80 52 Z', 0.1)
      + shine('M 23 58 C 23 49 28 42 35 38', 3, 0.9)
      + C(30, 76, 1, c2, 0) + C(68, 80, 1, c2, 0) + C(74, 70, 0.9, c2, 0)
      + gesicht({ t: 'arc', x: [37, 63], y: 59, r: 5.6, happy: 'gt',
          blush: 'var(--c4)', bx: [29, 71], by: 67, bw: 6, bh: 3.6,
          brow: { dy: 3, a: -8, l: 4.2, w: 2, k: 1.6 },
          m: 'tongue', ms: 1, mx: 50, my: 68.5, mw: 4.6 })
      + G('hat', null, '<g transform="rotate(10 50 34)">'
        + P('M 36 35 C 29 31 29 20 38 19 C 40 11 53 10 56 16 C 63 12 72 18 68 27 C 71 30 69 34 64 35.5 Z', c3, 2.6)
        + R(35.5, 32, 29, 6.5, 2.5, c3, 2.4) + L('M 44 22 L 44 30 M 52 20 L 52 30 M 60 23 L 60 30', INK, 1.1, 'opacity=".25"') + '</g>'),
    back: L('M 36 60 Q 50 54 64 60', c2, 2, 'opacity=".6"'),
    armL: tube('M 20 66 Q 13 70 15 77', c1, 5),
    armR: tube('M 80 66 Q 87 68 87 74', c1, 5)
      + G('whisk', null, L('M 88 76 L 92 56', INK, 4.2) + L('M 88 76 L 92 56', '#c9a26a', 2) + E(92.6, 50, 4.4, 6, '#f1f5f9', 2.2) + L('M 91 47 L 91.6 53', INK, 1, 'opacity=".3"'))
  });

  /* ── 12 Sprout · Radieschen ──────────────────────────────── */
  const leaf12 = (d) => P(d, c3, 2.6);
  W.add(12, {
    typ: 'Der Draufgänger', spruch: 'Hat vor nichts Angst. Außer vor Salat.',
    vars: '--fx:var(--c3)',
    o: { al: [25, 62], ar: [75, 62], ll: [42, 85], lr: [58, 85], head: [50, 88] },
    behind: G('tail', [76, 46], P('M 74 44 L 86 40 L 84 46 L 91 48 L 76 50 Z', '#fff', 2)),
    legL: tube('M 42 83 L 42 88', c4, 3.4) + E(40.5, 89.4, 5.6, 3, c4, 2.2),
    legR: tube('M 58 83 L 58 88', c4, 3.4) + E(59.5, 89.4, 5.6, 3, c4, 2.2),
    head: G('sway', [50, 32], leaf12('M 49 33 C 40 28 34 18 37 9 C 45 12 50 22 51 32 Z')
        + leaf12('M 51 33 C 52 22 58 13 67 11 C 68 20 62 29 53 34 Z')
        + leaf12('M 50 34 C 46 24 48 13 52 6 C 57 13 57 25 52 34 Z') + L('M 51 31 L 52 12', INK, 1, 'opacity=".3"'))
      + P('M 50 30 C 69 30 80 44 78 60 C 76 76 62 86 50 88 C 38 86 24 76 22 60 C 20 44 31 30 50 30 Z', c1, 3.2)
      + shade('M 74 46 C 80 60 74 76 58 84 C 68 74 76 62 74 46 Z')
      + E(50, 78, 11, 7, c2, 0, 'opacity=".5" class="fo"')
      + shine('M 28 52 C 29 44 33 38 39 35', 2.8, 0.6)
      + G('fo', null, P('M 23.5 46 C 40 41 60 41 76.5 46 L 77.5 51.5 C 60 46.5 40 46.5 22.5 51.5 Z', '#fff', 2.2))
      + gesicht({ x: [38.5, 61.5], y: 58, r: 6.4, p: 0.48, lid: [0.2, 18], look: [[0.2, 0], [-0.2, 0]],
          brow: { dy: -0.6, a: 20, l: 5.6, w: 3, k: 0 }, bx: [29, 71], by: 68,
          m: 'grin', mx: 50, my: 71, mw: 7, teeth: true,
          extra: '<g transform="rotate(-20 68 66)">' + R(63.5, 64, 9, 4, 1.6, '#f6d7b0', 1.4) + L('M 67 65 L 67 67 M 69 65 L 69 67', INK, 0.8, 'opacity=".5"') + '</g>',
          post: R(48.8, 71, 2.4, 6.6, 0, MOUTH, 0) }),
    back: P('M 23.5 46 C 40 41 60 41 76.5 46 L 77.5 51.5 C 60 46.5 40 46.5 22.5 51.5 Z', '#fff', 2.2),
    armL: tube('M 25 62 Q 16 62 15 54', c1, 4.6) + C(15, 52.5, 4.2, c1, 2.4),
    armR: tube('M 75 62 Q 84 62 85 54', c1, 4.6) + C(85, 52.5, 4.2, c1, 2.4)
  });

  /* ── 13 Bzz · Biene ──────────────────────────────────────── */
  W.add(13, {
    typ: 'Die Fleißige', spruch: 'Keine Zeit! Keine Zeit! … Oh, eine Blume.',
    o: { al: [35, 70], ar: [65, 70], ll: [43, 86], lr: [57, 86], head: [50, 66] },
    behind: G('wing-l', [38, 62], E(24, 56, 13, 8.5, c3, 2.4, 'transform="rotate(24 24 56)" fill-opacity=".85"'))
      + G('wing-r', [62, 62], E(76, 56, 13, 8.5, c3, 2.4, 'transform="rotate(-24 76 56)" fill-opacity=".85"'))
      + P('M 46 86 L 50 94 L 54 86 Z', c2, 2),
    legL: tube('M 43 84 L 42 89', c2, 3) + E(41, 90, 4.6, 2.4, c2, 1.8),
    legR: tube('M 57 84 L 58 89', c2, 3) + E(59, 90, 4.6, 2.4, c2, 1.8),
    body: E(50, 76, 15, 12.5, c1, 3)
      + G('fo', null, P('M 36.5 71 Q 50 67 63.5 71 L 64.6 75.5 Q 50 71.5 35.4 75.5 Z', c2, 0) + P('M 35.6 79 Q 50 75.5 64.4 79 L 62.6 83.5 Q 50 80 37.4 83.5 Z', c2, 0)),
    head: G('antenna', [42, 24], L('M 42 25 C 40 17 36 13 32 12', INK, 2.4) + C(31, 12, 2.8, c2, 0))
      + G('antenna', [58, 24], L('M 58 25 C 60 17 64 13 68 12', INK, 2.4) + C(69, 12, 2.8, c2, 0))
      + C(50, 44, 23.5, c1, 3.2)
      + shade('M 68 30 C 76 40 75 54 64 63 C 70 54 72 42 68 30 Z')
      + shine('M 30 40 C 31 33 35 28 41 25', 2.6, 0.6)
      + G('fo', null, P('M 27 40 Q 50 30 73 40 L 73.5 45 Q 50 36 26.5 45 Z', '#7a4a24', 2)
        + C(39, 45, 10, '#7a4a24', 2.6) + C(61, 45, 10, '#7a4a24', 2.6) + R(47, 43, 6, 3.6, 1.2, '#7a4a24', 1.8))
      + gesicht({ x: [39, 61], y: 45, r: 7.2, ex: 1, sc: '#e9fbff', p: 0.36, look: [[0.3, 0.1], [-0.3, 0.1]], lookc: 'lk-dart',
          bx: [31, 69], by: 58.5, m: 'zig', mx: 50, my: 60.5, mw: 4.6,
          post: hl(35.4, 41, 1.5, 0.9) + hl(57.4, 41, 1.5, 0.9) }),
    back: P('M 28 42 Q 50 34 72 42 L 72 47 Q 50 39 28 47 Z', '#7a4a24', 2),
    armL: tube('M 35 70 Q 28 73 27 78', c2, 3)
      + P('M 20.5 78 L 33.5 78 L 32 88 C 32 89.5 22 89.5 22 88 Z', c4, 2.2) + L('M 21 78 Q 27 72 33 78', INK, 1.6) + E(27, 78.4, 5.6, 1.6, '#ffb300', 1.2),
    armR: tube('M 65 70 Q 72 73 73 79', c2, 3) + C(73, 80, 2.4, c2, 0),
    fx: P('M 78 24 C 75.6 28 75.6 30.6 78 30.6 C 80.4 30.6 80.4 28 78 24 Z', '#8fdcff', 1.1, 'class="q-sweat"')
  });

  /* ── 14 Crunch · Toaster ─────────────────────────────────── */
  W.add(14, {
    typ: 'Der Frühaufsteher', spruch: 'GUTEN MORGEN! Es ist 5:30 Uhr!',
    o: { al: [21, 62], ar: [79, 62], ll: [38, 84], lr: [62, 84], head: [50, 86], zz: [80, 28] },
    behind: G('tail', [76, 78], L('M 76 78 C 88 80 90 70 86 62', INK, 4.6) + L('M 76 78 C 88 80 90 70 86 62', '#475569', 2.2)
        + R(82, 54, 8, 8.5, 2, '#475569', 2) + L('M 84 54 L 84 49.5 M 88 54 L 88 49.5', INK, 1.8))
      + G('toast', null, P('M 35 46 L 35 28 C 30 24 34 17 41 19 C 45 14 55 14 59 19 C 66 17 70 24 65 28 L 65 46 Z', c3, 2.6)
        + P('M 39 44 L 39 30 C 37 26 40 23 44 24 C 47 20 53 20 56 24 C 60 23 63 26 61 30 L 61 44 Z', '#ffe2a8', 0)),
    legL: R(32, 83, 13, 7.6, 3, c2, 2.4), legR: R(55, 83, 13, 7.6, 3, c2, 2.4),
    head: R(20, 36, 60, 49, 14, c1, 3.2)
      + shade('M 74 42 C 79 48 79 74 74 81 C 70 84.5 66 85 62 85 C 72 80 76 62 74 42 Z', 0.12)
      + R(30, 33, 40, 7, 3.5, c2, 2.4) + L('M 34 36.5 L 66 36.5', INK, 1.6, 'opacity=".45"')
      + shine('M 25 52 C 25 46 27 42 31 40', 2.6, 0.75)
      + G('fo', null, R(71, 50, 5, 14, 2.5, c2, 2) + R(70, 51, 7, 4.5, 1.8, c4, 1.8))
      + gesicht({ x: [37, 59], y: 54, r: 7.2, p: 0.5, look: [0, -0.1], lookc: 'lk-lr',
          brow: { dy: 2.4, a: -12, l: 5.2, w: 2.6, k: 2.4 }, bx: [27.5, 68], by: 66,
          m: 'grin', mx: 48, my: 68.5, mw: 9, teeth: true,
          post: hl(34.4, 51, 1, 0.95) }),
    back: R(34, 48, 32, 22, 4, c2, 0, 'opacity=".35"') + L('M 38 54 L 62 54 M 38 59 L 62 59 M 38 64 L 62 64', INK, 1.3, 'opacity=".3"'),
    armL: tube('M 21 62 Q 12 64 11 72', '#475569', 3) + C(11, 74, 4.2, '#fff', 2.2),
    armR: tube('M 79 62 Q 88 60 89 52', '#475569', 3) + C(89, 50, 4.2, '#fff', 2.2) + R(87.2, 42.5, 3.4, 6, 1.6, '#fff', 1.8),
    fx: C(44, 6, 2, '#e5e7eb', 0.8, 'class="steam"') + C(56, 8, 1.7, '#e5e7eb', 0.8, 'class="steam" style="animation-delay:-1s"')
  });

  /* ── 15 Tiki · Maske ─────────────────────────────────────── */
  const feather = (x, y, rot, col, len) => '<g transform="rotate(' + rot + ' ' + x + ' ' + y + ')">'
    + P('M ' + x + ' ' + y + ' C ' + (x - 5) + ' ' + (y - len * 0.4) + ' ' + (x - 4) + ' ' + (y - len * 0.85) + ' ' + x + ' ' + (y - len) + ' C ' + (x + 4) + ' ' + (y - len * 0.85) + ' ' + (x + 5) + ' ' + (y - len * 0.4) + ' ' + x + ' ' + y + ' Z', col, 2.2)
    + L('M ' + x + ' ' + (y - 1) + ' L ' + x + ' ' + (y - len + 3), INK, 0.9, 'opacity=".35"') + '</g>';
  W.add(15, {
    typ: 'Der Zeremonienmeister', spruch: 'Nimmt alles sehr feierlich. Auch das Pausenbrot.',
    vars: '--fx:var(--c3)',
    o: { al: [24, 62], ar: [76, 62], ll: [40, 85], lr: [60, 85], head: [50, 86] },
    legL: R(34, 83, 12, 8, 3, c1, 2.4), legR: R(54, 83, 12, 8, 3, c1, 2.4),
    head: G('sway', [50, 28], feather(36, 30, -24, c4, 17) + feather(64, 30, 24, c4, 17) + feather(43, 28, -9, c3, 21) + feather(57, 28, 9, c3, 21) + feather(50, 28, 0, c2, 24))
      + P('M 27 31 C 27 24 73 24 73 31 L 77 76 C 77 86 23 86 23 76 Z', c1, 3.2)
      + shade('M 70 30 L 76 76 C 76 82 68 84 60 84.5 C 68 78 70 54 70 30 Z', 0.16)
      + L('M 29 33 L 71 33', c2, 2.6) + L('M 33 30 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3', INK, 0.9, 'opacity=".35"')
      + G('fo', null, P('M 46.5 46 L 53.5 46 L 56 63 L 44 63 Z', c1, 2.4) + L('M 47 59.5 L 53 59.5', INK, 1.2, 'opacity=".4"')
        + L('M 27 60 L 36 62 M 27 65 L 36 66 M 73 60 L 64 62 M 73 65 L 64 66', c4, 2.6))
      + gesicht({ x: [36.5, 63.5], y: 49, r: 7.4, iris: c4, p: 0.32, sc: '#fff7e6', lid: [0.22, 12], look: [0, 0.1], lookc: 'lk-lr',
          brow: { dy: -0.4, a: 16, l: 8, w: 4.2, c: c2, k: -0.5 }, blush: false,
          m: 'grin', mx: 50, my: 71.5, mw: 12, teeth: true }),
    back: L('M 34 42 L 66 42 M 34 52 L 66 52 M 34 62 L 66 62 M 34 72 L 66 72', INK, 1.4, 'opacity=".3"'),
    armL: tube('M 24 62 Q 16 66 16 75', c1, 4.6) + C(16, 76.5, 3.4, c1, 2.2),
    armR: tube('M 76 62 Q 84 64 86 72', c1, 4.6) + L('M 87 78 L 87 54', INK, 4.6) + L('M 87 78 L 87 54', '#7a4a24', 2.2)
      + G('flick', null, P('M 87 54 C 81 49 84 42 87 37 C 90 42 93 49 87 54 Z', c3, 2) + P('M 87 53 C 84.6 50 86 46.5 87 44 C 88 46.5 89.4 50 87 53 Z', '#ffe14d', 0))
      + C(86.4, 72.5, 3.4, c1, 2.2)
  });

  /* ── 16 Clawdy · Krabbe in der Tasse ─────────────────────── */
  const claw16 = 'M 14 50 C 6 48 4 38 10 33 C 12 31 15 32 14 35 L 13 40 L 18 34 C 20 31 24 33 23 37 C 22 44 19 49 14 50 Z';
  W.add(16, {
    typ: 'Die Aufgedrehte', spruch: 'Hatte schon sechs Espresso. Zählt aber keiner mit.',
    o: { al: [27, 62], ar: [73, 62], ll: [38, 86], lr: [62, 86], head: [50, 56], zz: [78, 22] },
    behind: P('M 71 60 C 86 58 88 76 72 76 L 72 71 C 80 71 79 64 71 65 Z', c1, 2.6),
    legL: tube('M 36 85 L 31 90.5', c4, 3) + tube('M 42 86 L 40 91', c4, 3),
    legR: tube('M 64 85 L 69 90.5', c4, 3) + tube('M 58 86 L 60 91', c4, 3),
    body: P('M 26 54 L 74 54 L 70.5 83 C 70 88 30 88 29.5 83 Z', c1, 3)
      + shade('M 68 56 L 72 56 L 69 83 C 68.6 86 62 87 56 87.4 C 64 82 68 70 68 56 Z', 0.1)
      + G('fo', null, P('M 28.2 66 L 71.8 66 L 71 73 L 29 73 Z', c2, 0) + P('M 50 74.5 C 47 72 43.5 75 46 78 L 50 81.5 L 54 78 C 56.5 75 53 72 50 74.5 Z', c3, 1.4))
      + shine('M 31 58 L 32.5 72', 2.4, 0.8),
    head: G('q-twitch', [50, 46],
        tube('M 42 43 L 38 28', c3, 3.4) + tube('M 58 43 L 63 23', c3, 3.4)
      + P('M 30 55 C 30 37 70 37 70 55 Z', c3, 3)
      + shine('M 35 49 C 36 44 40 41 44 40', 2, 0.5)
      + gesicht({ x: [37.5, 63.5], y: [24.5, 19.5], r: [7, 8], ex: 1, p: 0.24, lookc: 'lk-dart', blush: false,
          m: 'wavy', mx: 50, my: 46, mw: 5.4,
          pre: L('M 32.5 22 l 2.4 1.2 M 33 28 l 2.2 -1 M 69 15 l -2.6 1.4 M 69.6 23 l -2.6 -1', '#ef4444', 0.9, 'opacity=".7"') }))
      + E(50, 55, 24, 4.6, c5, 2.4),
    back: L('M 40 48 Q 50 44 60 48', c4, 2),
    armL: tube('M 27 62 Q 17 62 15 51', c3, 4) + G('claw', null, P(claw16, c3, 2.6)),
    armR: tube('M 73 62 Q 83 62 85 51', c3, 4) + G('claw', null, P(mirror(claw16), c3, 2.6)),
    fx: L('M 24 30 q -3 -4 0 -8 q 3 -4 0 -8', '#cbd5e1', 2, 'class="steam"') + L('M 82 40 q 3 -4 0 -8 q -3 -4 0 -8', '#cbd5e1', 2, 'class="steam" style="animation-delay:-1.1s"')
  });

  /* ── 17 Mimi · Origami-Fuchs ─────────────────────────────── */
  const ear17 = 'M 27 37 L 24 8 L 47 30 Z';
  W.add(17, {
    typ: 'Die Elegante', spruch: 'Macht nie einen Knick. Außer mit Absicht.',
    vars: '--fx:var(--c4)',
    o: { al: [39, 70], ar: [61, 70], ll: [43, 86], lr: [57, 86], head: [50, 68] },
    behind: G('tail', [60, 84], P('M 58 84 L 82 58 L 92 74 L 76 90 Z', c2, 2.6) + P('M 82 58 L 92 74 L 86 66.5 Z', c1, 0) + P('M 82 58 L 88 56 L 92 74 Z', c1, 2.2) + L('M 60 84 L 86 66', INK, 1, 'opacity=".3"')),
    legL: P('M 39 86 L 47 86 L 47 91 L 37 91 Z', c3, 2.2), legR: P('M 53 86 L 61 86 L 63 91 L 53 91 Z', c3, 2.2),
    body: P('M 41 64 L 59 64 L 64 87 L 36 87 Z', c1, 3) + L('M 50 65 L 50 87', INK, 1, 'opacity=".25"')
      + P('M 41 64 L 50 74 L 59 64 Z', c2, 2, 'class="fo"'),
    head: G('ear-l', [32, 34], P(ear17, c2, 3) + P('M 29.5 31 L 28 15 L 40 27 Z', c3, 0))
      + G('ear-r', [68, 34], P(mirror(ear17), c2, 3) + P(mirror('M 29.5 31 L 28 15 L 40 27 Z'), c3, 0))
      + P('M 21 43 L 36 30 L 64 30 L 79 43 L 50 69 Z', c2, 3.2)
      + G('fo', null, P('M 21 43 L 50 51 L 79 43 L 50 69 Z', c1, 2.4) + L('M 50 51 L 50 62', INK, 1, 'opacity=".2"'))
      + shade('M 64 30 L 79 43 L 50 69 L 66 46 Z', 0.1)
      + gesicht({ x: [37.5, 62.5], y: 42, r: 4.8, ex: 1.25, p: 0.56, lid: [0.42, 14], lidc: c2, lash: true, look: [[0.45, 0.1], [0.45, 0.1]], lookc: 'lk-slow',
          blush: false, m: 'smirk', ms: 1, mx: 50, my: 58.5, mw: 4, mlw: 2.2,
          post: P('M 47.6 63.5 L 52.4 63.5 L 50 67.5 Z', INK, 0) }),
    back: L('M 36 30 L 50 69 L 64 30', INK, 1.2, 'opacity=".3"'),
    armL: tube('M 39 70 L 32 76', c1, 4)
      + G('q-bob', null, P(mirror('M 68 76 L 66 58 L 76 56 L 85 60 L 90 68 Z'), c4, 2.2) + L(mirror('M 68 76 L 76 56 M 68 76 L 85 60'), INK, 1, 'opacity=".4"')),
    armR: tube('M 61 70 L 67 79', c1, 4),
    fx: tw(12, 30, 2.6, c4, 0.2) + tw(88, 40, 2.2, c4, 1.2)
  });

  /* ── 18 Fuzz · Staubflocke ───────────────────────────────── */
  const fluff = (cx, cy, r0, r1, k) => {
    let d = '';
    for (let i = 0; i < k * 2; i++) {
      const a = i / (k * 2) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1 + (i % 4 ? 0 : 1.5);
      d += (i ? ' L ' : 'M ') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
    }
    return d + ' Z';
  };
  W.add(18, {
    typ: 'Der Schüchterne', spruch: 'Sagt wenig. Weiß aber die Antwort.',
    o: { al: [36, 70], ar: [64, 70], ll: [42, 82], lr: [58, 82], head: [50, 80] },
    legL: tube('M 42 80 L 42 87', c1, 2.8) + E(40.5, 89.2, 5, 2.8, c1, 2.2),
    legR: tube('M 58 80 L 58 87', c1, 2.8) + E(59.5, 89.2, 5, 2.8, c1, 2.2),
    head: G('antenna', [50, 24], L('M 50 26 C 50 18 56 15 62 17', INK, 2.2) + C(64, 17.6, 3.2, c2, 1.8, 'class="glow"'))
      + P(fluff(50, 54, 25.5, 30.5, 17), c1, 3)
      + G('fo', null, C(38, 54, 11.6, c4, 0, 'opacity=".45"') + C(62, 54, 11.6, c4, 0, 'opacity=".45"'))
      + G('q-peek', null, gesicht({ x: [38, 62], y: 54, r: 8.4, ex: 1, p: 0.56, look: [[-0.3, 0.3], [-0.3, 0.3]], lookc: 'lk-slow',
          brow: { dy: 4.6, a: -14, l: 4.4, w: 2, c: '#fff', k: 0.6 }, blush: '#ff7aa8', bx: [29, 71], by: 67, bw: 4.4,
          m: 'smile', mx: 51.5, my: 70, mw: 2.4, mlw: 2, mc: '#fff',
          post: C(38, 54, 11.6, 'none', 2.8, 'stroke="var(--c3)"') + C(62, 54, 11.6, 'none', 2.8, 'stroke="var(--c3)"') + L('M 48.8 52.5 Q 50 50.6 51.2 52.5', c3, 2.4)
            + L('M 31 47 L 35 43.6', '#fff', 1.6, 'opacity=".8"') + L('M 55 47 L 59 43.6', '#fff', 1.6, 'opacity=".8"') })),
    back: P(fluff(50, 54, 6, 9, 7), INK, 0, 'opacity=".15"'),
    armL: tube('M 36 72 Q 40 78 46 77', c1, 3) + C(47, 77, 2.4, c1, 1.8),
    armR: tube('M 64 72 Q 60 78 54 77', c1, 3) + C(53, 77, 2.4, c1, 1.8),
    fx: C(86, 34, 1.5, c1, 0, 'class="bubble" opacity=".6"') + C(14, 62, 1.2, c1, 0, 'class="bubble" style="animation-delay:-1.2s" opacity=".6"')
  });

  /* ── 19 Snip · Chamäleon ─────────────────────────────────── */
  W.add(19, {
    typ: 'Der Beobachter', spruch: 'Sieht alles. Auch das hinter dir.',
    vars: '--fx:var(--c3)',
    o: { al: [36, 72], ar: [64, 72], ll: [42, 86], lr: [58, 86], head: [50, 68] },
    behind: G('tail', [62, 82], L('M 61 82 C 78 86 90 76 86 64 C 83 56 72 58 73 66 C 74 71 80 71 80 67', INK, 8.4) + L('M 61 82 C 78 86 90 76 86 64 C 83 56 72 58 73 66 C 74 71 80 71 80 67', c1, 5.2)),
    legL: E(42, 88.5, 6.4, 3.6, c1, 2.4) + L('M 38.5 90 l 0 -2 M 45.5 90 l 0 -2', INK, 1, 'opacity=".4"'),
    legR: E(58, 88.5, 6.4, 3.6, c1, 2.4) + L('M 54.5 90 l 0 -2 M 61.5 90 l 0 -2', INK, 1, 'opacity=".4"'),
    body: E(50, 77, 14, 12, c1, 3) + G('fo', null, E(50, 79.5, 8.5, 8, c2, 0, 'opacity=".9"') + L('M 43.5 76 Q 50 78 56.5 76 M 43 81 Q 50 83 57 81', INK, 1, 'opacity=".3"')),
    head: P('M 36 30 C 42 13 60 10 70 22 C 66 25 62 28 60 32 Z', c1, 3) + L('M 44 26 C 50 18 58 17 64 21', c3, 2.2, 'opacity=".8"')
      + P('M 50 28 C 68 28 79 38 78 50 C 77 62 66 68 50 68 C 34 68 23 62 22 50 C 21 38 32 28 50 28 Z', c1, 3.2)
      + shade('M 73 38 C 80 48 77 60 64 66 C 72 58 75 48 73 38 Z')
      + C(46, 34, 1.6, c3, 0) + C(53, 32.5, 1.6, c4, 0) + C(50, 38, 1.4, c2, 0) + C(57, 37, 1.3, c3, 0)
      + shine('M 26 46 C 26 40 30 35 35 33', 2.4, 0.5)
      + G('fo', null, C(35, 47, 11.4, c3, 2.8) + C(66, 45, 11.4, c3, 2.8)
        + C(35, 47, 8.2, 'none', 1.1, 'stroke="' + INK + '" stroke-opacity=".3"') + C(66, 45, 8.2, 'none', 1.1, 'stroke="' + INK + '" stroke-opacity=".3"'))
      + gesicht({ x: [35, 66], y: [47, 45], r: 5.2, ex: 1, p: 0.5, look: [[-0.35, -0.3], [0.35, 0.3]], lookc: ['lk-a', 'lk-b'], blush: false,
          m: 'smirk', ms: 1, mx: 50, my: 61, mw: 7, mlw: 2.6,
          extra: C(47.6, 56, 0.8, INK, 0, 'opacity=".5"') + C(52.4, 56, 0.8, INK, 0, 'opacity=".5"') })
      + G('tongue', null, L('M 50 63 C 50 70 46 76 40 78', INK, 4.6) + L('M 50 63 C 50 70 46 76 40 78', TONGUE, 2.4) + C(39.4, 78.4, 2.6, TONGUE, 1.6)),
    back: L('M 50 30 L 50 64', INK, 1.4, 'opacity=".25"') + C(42, 44, 2.4, c3, 0, 'opacity=".7"') + C(58, 52, 2.8, c4, 0, 'opacity=".7"'),
    armL: tube('M 36 72 Q 29 76 29 82', c1, 4.2) + C(27.4, 83, 2.2, c1, 1.6) + C(30.6, 83.6, 2.2, c1, 1.6),
    armR: tube('M 64 72 Q 71 76 71 82', c1, 4.2) + C(69.4, 83.6, 2.2, c1, 1.6) + C(72.6, 83, 2.2, c1, 1.6)
  });
})();
