/* Knowledge Stack — Wesen, Fassung 3 (Entwurf): Wesen 0 … 9
   Farben --c1 … --c6 wie in Fassung 2 (farben.js). */
(function () {
  'use strict';
  const W = window.KSWesenNeu;
  const { INK, P, E, C, R, L, G, tube, shine, hl, shade, tw, mirror, gesicht, MOUTH, TONGUE } = W.kit;
  const c1 = 'var(--c1)', c2 = 'var(--c2)', c3 = 'var(--c3)', c4 = 'var(--c4)';

  /* ── 0 Puddl · Schleim mit Kappe ─────────────────────────── */
  W.add(0, {
    typ: 'Der Lässige', spruch: 'Kaut Kaugummi. Hat Zeit.',
    vars: '--fx:var(--c3)',
    o: { al: [22, 62], ar: [78, 62], ll: [38, 86], lr: [62, 86], head: [50, 88] },
    legL: E(38, 88.5, 7, 3.6, c1, 2.4), legR: E(62, 88.5, 7, 3.6, c1, 2.4),
    head: P('M 50 24 C 68 24 78 38 80 55 C 82 68 86 78 81 84 C 77 88 72 84 68 86 C 63 89 58 85 52 87 C 46 89 41 85 35 87 C 29 89 23 87 20 83 C 15 77 18 67 20 55 C 22 38 32 24 50 24 Z', c1, 3.2)
      + shade('M 77 46 C 82 60 84 76 79 82 C 75 85 71 83 67 85 C 75 75 79 60 77 46 Z')
      + shine('M 27 50 C 27 42 30 36 34 33', 3, 0.65) + hl(26.5, 56, 1.7)
      + gesicht({ x: [39, 61], y: 52, r: [6.6, 7.6], lid: [[0.5, -5], [0.42, -5]], look: [0.4, 0.15], lookc: 'lk-slow',
          m: 'smirk', ms: -1, mx: 47, my: 66.5, mw: 5.5, bx: [32, 68], by: 61,
          post: G('gum', [56, 67], C(61, 68, 6.2, c4, 1.8) + hl(59, 65.6, 1.6, 0.9)) })
      + G('cap', null, '<g transform="rotate(-13 50 28)">'
        + P('M 31 33 C 13 27 10 32 9 36 C 17 39 27 38 36 35 Z', c3, 2.4)
        + P('M 30 33 C 28 17 39 11 50 11 C 61 11 72 17 70 33 C 58 28 42 28 30 33 Z', c2, 2.8)
        + L('M 50 12 L 50 29', INK, 1, 'opacity=".3"') + C(50, 11, 2.2, c3, 1.8)
        + shine('M 37 23 C 39 18 42 15 46 14', 2, 0.55) + '</g>'),
    back: R(43, 27, 14, 3.4, 1.5, c3, 1.8),
    armL: tube('M 22 62 Q 13 66 13 74', c1, 5.5),
    armR: tube('M 78 62 Q 87 66 86 74', c1, 5.5),
    fx: G('drip', [72, 85], P('M 71 84 C 69.5 88 70 90 72 90.4 C 74 90 74.5 88 73 84 Z', c1, 1.4))
  });

  /* ── 1 Spark · Blitzkatze ────────────────────────────────── */
  const ear1 = 'M 24 40 L 18 10 L 43 28 Z', ear1in = 'M 26.5 33 L 23 17.5 L 36 27 Z';
  W.add(1, {
    typ: 'Die Überdrehte', spruch: 'Dreizehn Ideen pro Sekunde. Alle gleichzeitig.',
    vars: '--fx:var(--c3)',
    o: { al: [38, 71], ar: [62, 71], ll: [42, 86], lr: [58, 86], head: [50, 69] },
    behind: G('tail', [62, 82], P('M 60 79 L 75 82 L 71 73 L 84 71 L 80 61 L 92 52 L 87 67 L 93 72 L 80 79 L 82 88 L 61 86 Z', c3, 2.4)),
    legL: E(42, 88.5, 6, 3.8, '#fff', 2.4), legR: E(58, 88.5, 6, 3.8, '#fff', 2.4),
    body: E(50, 77, 13.5, 11.5, c1, 3) + E(50, 79.5, 7.5, 6.5, '#fff', 0, 'opacity=".55" class="fo"'),
    head: G('q-twitch', [50, 48],
        G('ear-l', [30, 36], P(ear1, c1, 3) + P(ear1in, c4, 0))
      + G('ear-r', [70, 36], P(mirror(ear1), c1, 3) + P(mirror(ear1in), c4, 0))
      + P('M 50 26 C 62 26 71 31 75 40 L 83 41 L 78 48 L 85 54 L 77 57 C 72 66 62 70 50 70 C 38 70 28 66 23 57 L 15 54 L 22 48 L 17 41 L 25 40 C 29 31 38 26 50 26 Z', c1, 3.2)
      + shade('M 73 40 C 78 50 76 60 66 66 C 72 58 74 49 73 40 Z')
      + L('M 43 27 L 44.5 32.5 M 57 27 L 55.5 32.5', c2, 2.4)
      + P('M 53 9 L 44 23 L 49.5 23 L 46 32 L 58 19 L 52.5 19 L 57 9 Z', c3, 2.2, 'class="glow-soft"')
      + gesicht({ x: [37.5, 62.5], y: 46, r: 8.2, p: 0.3, iris: c3, lookc: 'lk-dart',
          brow: { dy: 1.6, a: -10, l: 5.5, k: 2.6, w: 2.4 }, bx: [29, 71], by: 57,
          m: 'grin', mx: 50, my: 60.5, mw: 6.5, teeth: true,
          extra: P('M 47.8 55 L 52.2 55 L 50 57.6 Z', c4, 1.2)
            + L('M 29 60 l -6 -1 l 2.5 2.8 l -6 .4 M 71 60 l 6 -1 l -2.5 2.8 l 6 .4', INK, 1.2, 'opacity=".6"'),
          post: P('M 54.2 60.6 L 55.6 64.6 L 57 60.2 Z', '#fff', 1.1) })),
    back: L('M 38 40 Q 50 45 62 40 M 40 50 Q 50 55 60 50', c2, 3),
    armL: tube('M 38 71 Q 31 73 29 67', c1, 5) + C(29, 66.5, 3.3, '#fff', 2),
    armR: tube('M 62 71 Q 69 73 71 67', c1, 5) + C(71, 66.5, 3.3, '#fff', 2),
    fx: L('M 13 22 L 17 26 L 14.5 27.5 L 18.5 32', c3, 1.8, 'class="zap"')
      + L('M 87 22 L 83 26 L 85.5 27.5 L 81.5 32', c3, 1.8, 'class="zap" style="animation-delay:.35s"')
      + L('M 90 80 L 86 83 L 89 84.5 L 85 88', c3, 1.6, 'class="zap" style="animation-delay:.7s"')
  });

  /* ── 2 Plop · Frosch mit Pilzhut ─────────────────────────── */
  const frogFoot = x => P('M ' + (x - 7) + ' 91.5 C ' + (x - 7) + ' 88 ' + (x - 4) + ' 86 ' + x + ' 86 C ' + (x + 4) + ' 86 ' + (x + 7) + ' 88 ' + (x + 7) + ' 91.5 Z', c2, 2.4)
    + C(x - 6, 91.3, 1.8, c2, 1.6) + C(x, 92, 1.8, c2, 1.6) + C(x + 6, 91.3, 1.8, c2, 1.6);
  W.add(2, {
    typ: 'Der Genießer', spruch: 'Erst mal sitzen. Dann weitersehen.',
    vars: '--fx:var(--c3)',
    o: { al: [22, 72], ar: [78, 72], ll: [33, 86], lr: [67, 86], head: [50, 88] },
    legL: frogFoot(33), legR: frogFoot(67),
    head: C(33, 45, 12, c1, 3.2) + C(67, 45, 12, c1, 3.2)
      + P('M 17 72 C 15 57 30 49 50 49 C 70 49 85 57 83 72 C 82 85 67 90 50 90 C 33 90 18 85 17 72 Z', c1, 3.2)
      + E(33, 53.5, 10.6, 6.5, c1, 0) + E(67, 53.5, 10.6, 6.5, c1, 0)
      + shade('M 79 60 C 84 72 78 85 62 88 C 73 82 79 72 79 60 Z')
      + E(50, 80, 20, 8, '#fff', 0, 'opacity=".3" class="fo"')
      + shine('M 23.5 46 C 23.5 41 26 37.5 29 36', 2.4, 0.55)
      + gesicht({ x: [33, 67], y: 44.5, r: 8, lid: [0.52, -9], look: [[0.3, 0.3], [-0.3, 0.3]], lookc: 'lk-slow', p: 0.46,
          bx: [24, 76], by: 63, bw: 4.6, bh: 2.6, mx: 50, my: 65, mw: 10,
          extra: C(47, 58.5, 0.9, INK, 0, 'opacity=".55"') + C(53, 58.5, 0.9, INK, 0, 'opacity=".55"'),
          mouths: { normal: L('M 29 64 Q 50 76 71 64', INK, 2.6) + L('M 26.5 62 Q 27.5 65 30.5 65.2 M 73.5 62 Q 72.5 65 69.5 65.2', INK, 1.8)
              + G('q-lick', [50, 69], P('M 46.5 69.5 C 46.5 76 53.5 76 53.5 69.5 Z', TONGUE, 1.8)) } })
      + G('cap', null, '<g transform="rotate(-11 50 36)">'
        + P('M 36 38 C 35 25 43 19 50 19 C 57 19 65 25 64 38 C 56 34.5 44 34.5 36 38 Z', c3, 2.8)
        + C(43, 28, 2.6, '#fff', 0) + C(53, 24, 2.2, '#fff', 0) + C(58.5, 31, 1.9, '#fff', 0) + '</g>'),
    back: C(38, 66, 3.4, c2, 0, 'opacity=".5"') + C(60, 62, 2.6, c2, 0, 'opacity=".5"') + C(55, 74, 3, c2, 0, 'opacity=".5"'),
    armL: tube('M 22 72 Q 17 78 21 83', c1, 5) + E(22, 84, 3.8, 2.6, c2, 1.8),
    armR: tube('M 78 72 Q 83 78 79 83', c1, 5) + E(78, 84, 3.8, 2.6, c2, 1.8),
    fx: G('orbit', [82, 26], E(88, 24.6, 2, 1.3, '#fff', 0.8, 'opacity=".9"') + E(89.6, 25, 2, 1.3, '#fff', 0.8, 'opacity=".9"') + C(89, 26.6, 1.7, INK, 0))
  });

  /* ── 3 Bubbles · Kugelfisch mit Matrosenmütze ────────────── */
  const spikes = (cx, cy, r0, r1, k, rot) => {
    let s = '';
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + (rot || 0), w = 0.16;
      const p = (rr, aa) => (cx + Math.cos(aa) * rr).toFixed(1) + ' ' + (cy + Math.sin(aa) * rr).toFixed(1);
      s += 'M ' + p(r0, a - w) + ' L ' + p(r1, a) + ' L ' + p(r0, a + w) + ' Z ';
    }
    return s;
  };
  const fin3 = 'M 25 52 C 15 44 8 52 10 60 C 11 65 19 64 25 59 Z';
  W.add(3, {
    typ: 'Der Schreckhafte', spruch: 'Was war das?! … Ach so. Nur eine Blase.',
    vars: '--fx:var(--c3)',
    o: { al: [25, 55], ar: [75, 55], ll: [43, 79], lr: [57, 79], head: [50, 80] },
    behind: P(spikes(50, 55, 25, 32.5, 12, 0.26), c2, 2),
    legL: P('M 44 78 C 41 83 36 86 35 90.5 C 41 91.5 47 89.5 48 84 Z', c3, 2.4),
    legR: P(mirror('M 44 78 C 41 83 36 86 35 90.5 C 41 91.5 47 89.5 48 84 Z'), c3, 2.4),
    head: G('q-puff', [50, 60], C(50, 55, 26.5, c1, 3.2)
        + shade('M 70 38 C 80 50 79 68 66 77 C 58 82 48 83 40 80 C 56 80 72 68 70 38 Z')
        + E(50, 68, 15, 9, '#fff', 0, 'opacity=".3" class="fo"')
        + shine('M 30 46 C 32 38 39 32 47 31', 3, 0.7) + hl(30, 52, 1.9))
      + gesicht({ x: [38.5, 61.5], y: 51, r: 8, p: 0.3, lookc: 'lk-dart',
          brow: { dy: 1.8, a: -18, l: 5, w: 2.4, k: 0.4 }, bx: [29.5, 70.5], by: 63, bw: 5, bh: 3.2, blush: c4,
          mx: 50, my: 66, mw: 4,
          mouths: { normal: E(50, 66, 4, 3.3, '#ff9db0', 2) + E(50, 66, 1.7, 1.3, MOUTH, 0),
                    sad: E(50, 66.5, 3.4, 2.8, '#ff9db0', 2) + L('M 48 67.2 Q 50 65.6 52 67.2', INK, 1.2) } })
      + G('cap', null, '<g transform="rotate(-9 50 29)">' + P('M 37 31 L 63 31 L 60.5 24.5 C 56 21.5 44 21.5 39.5 24.5 Z', '#fff', 2.4)
        + P('M 36.5 29.5 L 63.5 29.5 L 64 33 L 36 33 Z', c2, 2) + C(50, 21, 2.6, c4, 1.8) + '</g>'),
    back: L('M 36 48 Q 50 42 64 48', '#fff', 2.4, 'opacity=".4"'),
    armL: G('fin', null, P(fin3, c3, 2.6) + L('M 13 55 L 22 55 M 14 59.5 L 22 57.5', INK, 1, 'opacity=".45"')),
    armR: G('fin', null, P(mirror(fin3), c3, 2.6) + L(mirror('M 13 55 L 22 55 M 14 59.5 L 22 57.5'), INK, 1, 'opacity=".45"')),
    fx: P('M 79 27 C 76.6 31 76.6 33.6 79 33.6 C 81.4 33.6 81.4 31 79 27 Z', '#8fdcff', 1.1, 'class="q-sweat"')
      + C(86, 46, 2.2, '#fff', 1.1, 'class="bubble" stroke="var(--c2)" fill-opacity=".55"')
      + C(14, 34, 1.7, '#fff', 1, 'class="bubble" style="animation-delay:-1.4s" stroke="var(--c2)" fill-opacity=".55"')
  });

  /* ── 4 Snooze · Schlafbär mit Zipfelmütze ────────────────── */
  W.add(4, {
    typ: 'Der Dauermüde', spruch: 'Nur noch fünf Minuten …',
    o: { al: [33, 69], ar: [67, 69], ll: [40, 86], lr: [60, 86], head: [50, 66], zz: [76, 34] },
    legL: E(40, 88.5, 7, 4, c2, 2.4) + E(40, 88, 3.4, 1.9, c4, 0, 'opacity=".8"'),
    legR: E(60, 88.5, 7, 4, c2, 2.4) + E(60, 88, 3.4, 1.9, c4, 0, 'opacity=".8"'),
    body: E(50, 75.5, 19, 14.5, c1, 3) + E(50, 78, 11.5, 9, c4, 0, 'class="fo"'),
    head: G('q-nod', [50, 66],
        G('ear-l', [29, 34], C(27, 33, 8, c2, 3) + C(27, 33, 4, c4, 0))
      + G('ear-r', [71, 34], C(73, 33, 8, c2, 3) + C(73, 33, 4, c4, 0))
      + E(50, 48, 25, 21, c1, 3.2)
      + shade('M 70 38 C 77 48 74 61 62 67 C 69 59 72 49 70 38 Z')
      + G('fo', null, E(40, 48, 6.6, 7.8, 'var(--c5)', 0, 'transform="rotate(22 40 48)"') + E(60, 48, 6.6, 7.8, 'var(--c5)', 0, 'transform="rotate(-22 60 48)"')
        + E(50, 58.5, 9.5, 6.8, c4, 2.2))
      + gesicht({ x: [40, 60], y: 48, r: 5.8, lid: [0.68, -12], lidc: 'var(--c6)', look: [0, 0.4], p: 0.5, bags: INK,
          bx: [32, 68], by: 57.5, mx: 50, my: 60.6, mw: 2.4, m: 'smile', mlw: 1.8,
          extra: E(50, 56, 3.3, 2.3, INK, 0) + hl(49, 55.3, 0.8, 0.8)
            + G('only-sleep', null, G('gum', [53, 56], C(57, 55, 5, '#bfe9ff', 1.3, 'fill-opacity=".75"') + hl(55.4, 53.2, 1.2, 0.9))) })
      + G('cap', null, P('M 27 36 C 25 20 38 12 52 13 C 66 14 77 23 80 37 C 62 28 44 28 27 36 Z', c3, 2.8)
        + C(42, 21, 1.5, '#fff', 0, 'opacity=".7"') + C(56, 19, 1.5, '#fff', 0, 'opacity=".7"') + C(67, 25, 1.4, '#fff', 0, 'opacity=".7"')
        + G('sway', [78, 33], P('M 73 28 C 82 28 88 36 87 46 L 82 46 C 82 39 79 35 74 35 Z', c3, 2.6) + C(84.5, 49, 4.6, '#fff', 2.2))
        + P('M 25 37 C 42 28 62 28 82 38 L 80.5 42 C 62 33 43 33 26.5 41 Z', '#fff', 2.2))),
    back: E(50, 50, 8, 5, c2, 0, 'opacity=".25"'),
    armL: tube('M 33 69 Q 27 74 30 80', c1, 5.5)
      + '<g transform="rotate(-14 24 78)">' + R(13, 71, 20, 14, 5, '#fff', 2.4) + L('M 18 72 L 18 84 M 23 72 L 23 84 M 28 72 L 28 84', c3, 1.4, 'opacity=".7"') + '</g>'
      + C(30.5, 80.5, 3.4, c2, 2),
    armR: tube('M 67 69 Q 73 74 71 81', c1, 5.5) + C(71, 82, 3.4, c2, 2)
  });

  /* ── 5 Beep · Roboter ────────────────────────────────────── */
  W.add(5, {
    typ: 'Der Neugierige', spruch: 'Was ist das? Kann man das aufschrauben?',
    vars: '--fx:var(--c4)',
    o: { al: [31, 71], ar: [69, 71], ll: [42, 84], lr: [58, 84], head: [50, 66] },
    legL: R(38, 80, 8, 9, 2.5, c2, 2.4) + R(35, 86.5, 13, 5, 2.5, c1, 2.4),
    legR: R(54, 80, 8, 9, 2.5, c2, 2.4) + R(52, 86.5, 13, 5, 2.5, c1, 2.4),
    body: R(35, 64, 30, 20, 7, c1, 3) + R(41, 69, 18, 10, 3, c3, 2, 'class="fo"')
      + C(46, 74, 1.8, c4, 0, 'class="led fo"') + L('M 50 74 L 56 74', c4, 1.6, 'class="fo" opacity=".8"'),
    head: G('q-tilt', [50, 64],
        G('antenna', [59, 22], L('M 59 23 L 63 13 L 70 11', INK, 5.2) + L('M 59 23 L 63 13 L 70 11', c2, 2.4) + C(71, 10.5, 3.6, c4, 2.2, 'class="glow"'))
      + R(15.5, 37, 7, 13, 3, c2, 2.4) + R(77.5, 37, 7, 13, 3, c2, 2.4)
      + R(20, 22, 60, 42, 14, c1, 3.2)
      + shade('M 74 30 C 79 36 79 54 74 60 C 70 63 66 64 62 64 C 72 60 76 46 74 30 Z')
      + R(26, 27.5, 48, 31, 10, c3, 2.4)
      + shine('M 24 34 C 24 29 27 26 31 25', 2.2, 0.6)
      + G('fo', null, C(39.5, 43, 11, c2, 2.4) + C(39.5, 43, 8.6, c3, 0)
        + R(28.5, 30, 5, 3, 1.2, c2, 1.6, 'transform="rotate(-38 31 31.5)"'))
      + gesicht({ x: [39.5, 62.5], y: [43, 41], r: [7.8, 4.2], sc: '#f2feff', iris: c4, p: 0.38, look: [0.2, 0.05], lookc: 'lk-lr',
          col: c4, blush: false, mc: c4, mf: c4, m: 'smirk', ms: 1, mx: 56, my: 52.5, mw: 4.2,
          brow: { dy: 1.4, a: -16, l: 3.6, w: 2, c: c4, k: 0.4, only: 1 } })),
    back: R(38, 34, 24, 14, 3, c2, 2) + L('M 42 38 L 58 38 M 42 42 L 58 42 M 42 46 L 52 46', INK, 1.2, 'opacity=".4"'),
    armL: tube('M 31 71 Q 24 74 23 80', c2, 3.6) + P('M 19 80 C 19 77.5 27 77.5 27 80 L 26.4 85 L 24 83 L 23 85.6 L 22 83 L 19.6 85 Z', c1, 2),
    armR: tube('M 69 71 Q 76 74 77 80', c2, 3.6) + P('M 73 80 C 73 77.5 81 77.5 81 80 L 80.4 85 L 78 83 L 77 85.6 L 76 83 L 73.6 85 Z', c1, 2),
    fx: '<text x="80" y="24" font-size="13" font-weight="800" fill="var(--c4)" stroke="' + '#1e1b2e' + '" stroke-width=".6" class="q-spark" style="font-family:system-ui,sans-serif">?</text>'
  });

  /* ── 6 Chompy · kleiner Drache ───────────────────────────── */
  const wing6 = 'M 37 64 C 28 52 17 51 9 56 L 17 61 L 11 67 L 21 68.5 L 19 76 C 28 74 35 70 37 66 Z';
  W.add(6, {
    typ: 'Der Möchtegern-Gefährliche', spruch: 'ROOAAR! … War das gruselig? Bitte sag ja.',
    vars: '--fx:var(--c3)',
    o: { al: [37, 71], ar: [63, 71], ll: [42, 86], lr: [58, 86], head: [50, 68] },
    behind: G('wing-l', [37, 65], P(wing6, c4, 2.6) + L('M 35 64 L 17 61 M 35 66 L 21 68.5', INK, 1.1, 'opacity=".4"'))
      + G('wing-r', [63, 65], P(mirror(wing6), c4, 2.6) + L(mirror('M 35 64 L 17 61 M 35 66 L 21 68.5'), INK, 1.1, 'opacity=".4"'))
      + G('tail', [60, 83], tube('M 60 83 C 72 88 84 84 86 74', c1, 5) + P('M 86 76 L 80 68 L 87 61 L 93 69 Z', c3, 2.2)),
    legL: E(42, 88.5, 6.6, 3.8, c1, 2.4) + L('M 38.5 90 l 0 -2 M 42 90.6 l 0 -2 M 45.5 90 l 0 -2', '#fff', 1.5),
    legR: E(58, 88.5, 6.6, 3.8, c1, 2.4) + L('M 54.5 90 l 0 -2 M 58 90.6 l 0 -2 M 61.5 90 l 0 -2', '#fff', 1.5),
    body: E(50, 77, 14, 12, c1, 3) + G('fo', null, E(50, 79.5, 8.5, 8, c2, 1.8) + L('M 43.5 76 Q 50 78 56.5 76 M 43 80.5 Q 50 82.5 57 80.5', INK, 1, 'opacity=".4"')),
    head: P('M 34 31 L 29 15 L 43 25 Z', c3, 2.4) + P(mirror('M 34 31 L 29 15 L 43 25 Z'), c3, 2.4)
      + P('M 44 26 L 46.5 18.5 L 50 24.5 L 53.5 17.5 L 56 26 Z', c3, 2.2)
      + E(50, 46, 27, 21.5, c1, 3.2)
      + shade('M 72 36 C 80 46 77 60 64 67 C 72 59 75 48 72 36 Z')
      + shine('M 27 42 C 28 35 32 30 37 28', 2.6, 0.5)
      + G('fo', null, E(50, 58, 15.5, 9.5, c1, 2.6) + E(50, 53.2, 14, 5, c1, 0)
        + E(44.5, 55, 1.5, 1.9, INK, 0) + E(55.5, 55, 1.5, 1.9, INK, 0))
      + gesicht({ x: [37.5, 62.5], y: 42, r: 7, iris: c3, p: 0.4, lid: [0.26, 24], look: [[0.25, 0.1], [-0.25, 0.1]],
          brow: { dy: -1.2, a: 24, l: 6.4, w: 3.2, k: 0 }, bx: [28, 72], by: 53,
          mx: 50, my: 61.5, mw: 7, teeth: true,
          mouths: { normal: L('M 41 61.5 Q 50 65.5 59 61.5', INK, 2.4)
            + P('M 43 62.4 L 44.7 57.4 L 46.6 63.4 Z', '#fff', 1.2) + P('M 53.4 63.4 L 55.3 57.4 L 57 62.4 Z', '#fff', 1.2) } }),
    back: P('M 46 36 L 50 30 L 54 36 Z M 46 46 L 50 40 L 54 46 Z M 46 56 L 50 50 L 54 56 Z', c3, 1.6),
    armL: tube('M 37 71 Q 30 71 28 65', c1, 4.6) + L('M 26 63 l -1.4 -2.6 M 28 62.4 l 0 -3 M 30 63 l 1.4 -2.6', '#fff', 1.6),
    armR: tube('M 63 71 Q 70 71 72 65', c1, 4.6) + L('M 70 63 l -1.4 -2.6 M 72 62.4 l 0 -3 M 74 63 l 1.4 -2.6', '#fff', 1.6),
    fx: C(60, 51, 2.6, '#d5dbe6', 1, 'class="steam"') + C(40, 51, 2.2, '#d5dbe6', 1, 'class="steam" style="animation-delay:-1.1s"')
  });

  /* ── 7 Nubi · Wolke ──────────────────────────────────────── */
  const sunRays = (cx, cy) => { let s = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; s += 'M ' + (cx + Math.cos(a) * 11.5).toFixed(1) + ' ' + (cy + Math.sin(a) * 11.5).toFixed(1) + ' L ' + (cx + Math.cos(a) * 15.5).toFixed(1) + ' ' + (cy + Math.sin(a) * 15.5).toFixed(1) + ' '; } return s; };
  W.add(7, {
    typ: 'Die Träumerin', spruch: 'Schaut nach oben und denkt an etwas Schönes.',
    vars: '--fx:var(--c3)',
    o: { al: [20, 66], ar: [80, 66], ll: [42, 80], lr: [58, 80], head: [50, 80], cl: [22, 14], zz: [70, 22] },
    behind: G('sunb', null, G('spin', [75, 27], L(sunRays(75, 27), INK, 4.4) + L(sunRays(75, 27), c3, 2.2)) + C(75, 27, 9.5, c3, 2.6)),
    legL: tube('M 42 78 L 42 86', c2, 3) + E(40.5, 89, 5.4, 3.1, c2, 2.2),
    legR: tube('M 58 78 L 58 86', c2, 3) + E(59.5, 89, 5.4, 3.1, c2, 2.2),
    head: P('M 25 79 C 11 79 9 62 21 58 C 17 45 30 37 40 43 C 44 31 63 31 67 43 C 79 38 90 50 83 60 C 93 64 91 79 77 79 Z', c1, 3.2)
      + shade('M 81 60 C 90 65 88 77 77 77 L 60 77 C 74 75 82 70 81 60 Z', 0.1)
      + shine('M 23 58 C 21 51 26 46 32 45', 2.6, 0.8)
      + gesicht({ x: [40, 60], y: 59, r: 6.6, look: [0.3, -0.45], lookc: 'lk-up', lash: true, p: 0.56, iris: c2,
          blush: c4, bw: 5, bh: 2.8, bx: [31.5, 68.5], by: 67.5, m: 'smile', mx: 50, my: 68.5, mw: 3 }),
    back: L('M 36 56 Q 44 51 52 56 M 50 66 Q 58 61 66 66', INK, 1.4, 'opacity=".2"'),
    armL: tube('M 20 66 Q 13 70 14 77', c1, 5),
    armR: tube('M 80 66 Q 87 70 86 77', c1, 5),
    fx: G('rainfx', null, [30, 42, 58, 70].map((x, i) => L('M ' + x + ' 82 l -1.2 4', '#4aa8ff', 2, 'class="rain" style="animation-delay:' + (i * 0.2) + 's"')).join(''))
      + P('M 19 28 C 16.5 24.5 20 22 22 25 C 24 22 27.5 24.5 25 28 L 22 31.5 Z', c4, 1.2, 'class="bubble"')
      + tw(12, 46, 2.6, c3, 0.6)
  });

  /* ── 8 Zorp · Alien ──────────────────────────────────────── */
  W.add(8, {
    typ: 'Der Verpeilte', spruch: 'Falscher Planet. Findet es trotzdem super.',
    vars: '--fx:var(--c3)',
    o: { al: [33, 71], ar: [67, 71], ll: [43, 86], lr: [57, 86], head: [50, 68] },
    behind: E(50, 50, 36, 38, c3, 0, 'class="pulse"'),
    legL: P('M 38 83 L 47 83 L 47 90.6 L 35 90.6 C 34 87 35.5 84.5 38 83 Z', c2, 2.4),
    legR: P(mirror('M 38 83 L 47 83 L 47 90.6 L 35 90.6 C 34 87 35.5 84.5 38 83 Z'), c2, 2.4),
    body: P('M 39 65 C 39 61 61 61 61 65 L 64 83 C 59 87.5 41 87.5 36 83 Z', c1, 3) + G('fo', null, C(50, 76, 3.6, c3, 1.8) + C(50, 76, 1.3, INK, 0, 'opacity=".5"')),
    head: G('antenna sway', [50, 20], L('M 50 21 C 49 13 57 12 60 7', INK, 5) + L('M 50 21 C 49 13 57 12 60 7', c1, 2.4) + C(61, 6.5, 4.2, c3, 2.2, 'class="glow"'))
      + P('M 50 18 C 71 18 81 32 79 46 C 77 60 66 67 50 67 C 34 67 23 60 21 46 C 19 32 29 18 50 18 Z', c1, 3.2)
      + C(29, 33, 2.8, c2, 0, 'opacity=".3"') + C(71.5, 30, 2.2, c2, 0, 'opacity=".3"') + C(66, 23.5, 1.5, c2, 0, 'opacity=".3"') + C(33, 26, 1.4, c2, 0, 'opacity=".3"')
      + shade('M 75 34 C 81 44 78 58 65 64 C 73 57 77 46 75 34 Z')
      + shine('M 26 40 C 26 32 31 26 37 23', 2.6, 0.55)
      + gesicht({ x: [50], y: 40, r: 13.5, ex: 1, p: 0.34, iris: c4, look: [0.15, 0.1], lookc: 'lk-roll', lid: [0.16, -8],
          bx: [28.5, 71.5], by: 52, m: 'tongue', ms: 1, mx: 50, my: 58.5, mw: 6 }),
    back: C(42, 36, 3, c2, 0, 'opacity=".3"') + C(58, 46, 4, c2, 0, 'opacity=".3"') + C(46, 54, 2.2, c2, 0, 'opacity=".3"'),
    armL: tube('M 33 71 Q 25 76 25 84', c1, 3.4) + C(22.5, 85, 2, c1, 1.6) + C(25, 86.8, 2, c1, 1.6) + C(27.5, 85, 2, c1, 1.6),
    armR: tube('M 67 71 Q 75 76 75 84', c1, 3.4) + C(72.5, 85, 2, c1, 1.6) + C(75, 86.8, 2, c1, 1.6) + C(77.5, 85, 2, c1, 1.6),
    fx: tw(14, 22, 3, c3, 0) + tw(88, 40, 2.4, c4, 0.9) + tw(12, 70, 2.2, c4, 1.6)
  });

  /* ── 9 Lotti · Axolotl ───────────────────────────────────── */
  const gill = tube('M 28 38 Q 18 29 10 28', c2, 4.2) + tube('M 25 46 Q 13 44 6 47', c2, 4.2) + tube('M 27 54 Q 17 58 11 65', c2, 4.2);
  const gillR = tube(mirror('M 28 38 Q 18 29 10 28'), c2, 4.2) + tube(mirror('M 25 46 Q 13 44 6 47'), c2, 4.2) + tube(mirror('M 27 54 Q 17 58 11 65'), c2, 4.2);
  W.add(9, {
    typ: 'Die Strahlende', spruch: 'Findet einfach alles toll. Dich auch.',
    vars: '--fx:var(--c3)',
    o: { al: [37, 73], ar: [63, 73], ll: [43, 86], lr: [57, 86], head: [50, 70] },
    behind: G('tail', [60, 82], P('M 58 77 C 72 75 84 80 91 69 C 93 80 84 90 61 88 Z', c1, 2.6) + L('M 66 79 C 76 79 84 78 89 73', c2, 2, 'opacity=".7"')),
    legL: E(43, 88.5, 6, 3.6, c1, 2.4), legR: E(57, 88.5, 6, 3.6, c1, 2.4),
    body: E(50, 78, 13, 11, c1, 3) + E(50, 80.5, 8, 7, c4, 0, 'opacity=".85" class="fo"'),
    head: G('ear-l', [27, 46], gill) + G('ear-r', [73, 46], gillR)
      + E(50, 47, 28, 20, c1, 3.2)
      + shade('M 73 37 C 81 46 78 59 65 65 C 73 58 76 47 73 37 Z', 0.1)
      + shine('M 26 44 C 27 38 31 33 36 31', 2.6, 0.7)
      + gesicht({ t: 'dot', x: [31, 69], y: 44, r: 4.4, lookc: 'lk-lr', bx: [29.5, 70.5], by: 53, bw: 4.6, bh: 2.6,
          mx: 50, my: 49, mw: 10,
          extra: C(40, 38, 0.9, c2, 0, 'opacity=".7"') + C(43.5, 36.5, 0.9, c2, 0, 'opacity=".7"') + C(56.5, 36.5, 0.9, c2, 0, 'opacity=".7"') + C(60, 38, 0.9, c2, 0, 'opacity=".7"'),
          mouths: { normal: P('M 40 49.5 Q 50 64 60 49.5 Z', MOUTH, 2.4) + E(50, 56.4, 3.6, 2.2, TONGUE, 0),
                    open: P('M 38 48.5 Q 50 68 62 48.5 Z', MOUTH, 2.4) + E(50, 58.4, 4.6, 2.8, TONGUE, 0),
                    sad: L('M 42 55 Q 50 49 58 55', INK, 2.4), sleep: E(50, 53, 1.8, 2.2, MOUTH, 0), wow: E(50, 54, 3, 3.6, MOUTH, 1.6) } })
      + G('tiara', null, '<g transform="rotate(9 56 27)">' + P('M 49 29 L 50.5 21 L 54 26 L 56 18.5 L 58 26 L 61.5 21 L 63 29 Z', c3, 2) + C(56, 25.6, 1.3, c2, 0) + '</g>'),
    back: L('M 44 40 Q 50 43 56 40', INK, 1.2, 'opacity=".25"'),
    armL: tube('M 37 73 Q 30 75 28 70', c1, 4.4),
    armR: tube('M 63 73 Q 70 75 72 70', c1, 4.4),
    fx: tw(16, 20, 2.6, c3, 0.3) + tw(86, 24, 2.2, c3, 1.3)
  });
})();
