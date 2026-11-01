/* ══════════════════════════════════════════════════════════════
   How to Fachbegriffe — VORSCHLAG: neue Kistenturm-Figuren
   ══════════════════════════════════════════════════════════════
   Entwurf zum Aussuchen (Sönke 01.11.2026: „noch nicht happy …
   cool und knuffig, im Stil von Knowledge Stack, auch ganz andere
   Figuren“). Noch NICHT im Spiel — ansehen in
   showroom-kistenturm-neu.html. Gleiche Schnittstelle wie
   figuren.js (LIST, svg, count), damit der Tausch später nur ein
   Dateiname ist.

   Regeln, damit die Figuren auch klein (38 px am Handy) gehen:
     * EIN großer runder Umriss, der den Kasten füllt (Kopf = Körper
       wie bei den Knowledge-Stack-Wesen), nichts Dünnes, das weit
       absteht (kein Schwert, kein Stab) — das schrumpft sonst die
       eigentliche Figur.
     * Teamfarbe ist die Hauptfarbe des Körpers.
     * Augen groß (r 5,5–6 statt 3,4–3,9), Glanzpunkt mittig oben
       IM Auge, nicht über den Rand.
     * Kleinkram trägt class="fine" und fällt unter 70 px weg
       (.ds-sm, figuren-neu.css), dort auch der zweite Glanzpunkt.
     * Alle haben kurze Arme an al/ar, damit sie heben können.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const K = window.KSCreatures;
  if (!K || !K.kit || !K.buildDef) { console.error('[derby] figuren-neu.js braucht KSCreatures'); return; }
  const { INK, P, E, C, R, L, G, shine, hl, shade, star, tw } = K.kit;

  const LIST = [
    { key: 'troet', name: 'Trööt', col: '#5f7392', soft: '#e3e9f2',
      say: 'Baby-Elefant mit Riesenohren – hebt mit Rüssel UND Armen und trötet bei jeder Kiste.' },
    { key: 'helmi', name: 'Helmi', col: '#d99a00', soft: '#fff3c4',
      say: 'Bau-Hamster mit gelbem Helm – stopft sich die Backen voll und packt an.' },
    { key: 'rexi', name: 'Rexi', col: '#2fa84f', soft: '#dcf5e2',
      say: 'Mini-T-Rex mit winzigen Ärmchen – stapelt trotzdem, und zwar mit Ehrgeiz.' },
    { key: 'frosti', name: 'Frosti', col: '#2f7cf6', soft: '#dbe9ff',
      say: 'Kleiner Yeti, flauschig und bärenstark – schnaubt Schneeflocken.' },
    { key: 'anton', name: 'Anton', col: '#e5484d', soft: '#fde2e2',
      say: 'Ameise mit Schweißband – hebt das Fünfzigfache und hat vier Arme dafür.' },
    { key: 'okti', name: 'Okti', col: '#8b5cf6', soft: '#ece4ff',
      say: 'Krake mit Taucherbrille – acht Arme, also acht Kisten auf einmal.' },
    { key: 'packi', name: 'Packi', col: '#c07a2c', soft: '#f6e6cf',
      say: 'Ein Karton, der Kartons stapelt – für ihn ist jede Runde Familientreffen.' }
  ];

  const D = [];
  const f1 = n => +n.toFixed(2);
  const FINE = 'class="fine"';

  /* Arm mit leichtem Knick, oben dicker, runde Enden (wie figuren.js) */
  function limb(sx, sy, ex, ey, w0, w1, bend, col) {
    const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const mx = (sx + ex) / 2 + nx * bend, my = (sy + ey) / 2 + ny * bend, wm = (w0 + w1) / 4;
    const p = (x, y) => f1(x) + ' ' + f1(y);
    const d = 'M ' + p(sx + nx * w0 / 2, sy + ny * w0 / 2)
      + ' Q ' + p(mx + nx * wm, my + ny * wm) + ' ' + p(ex + nx * w1 / 2, ey + ny * w1 / 2)
      + ' A ' + f1(w1 / 2) + ' ' + f1(w1 / 2) + ' 0 0 1 ' + p(ex - nx * w1 / 2, ey - ny * w1 / 2)
      + ' Q ' + p(mx - nx * wm, my - ny * wm) + ' ' + p(sx - nx * w0 / 2, sy - ny * w0 / 2)
      + ' A ' + f1(w0 / 2) + ' ' + f1(w0 / 2) + ' 0 0 1 ' + p(sx + nx * w0 / 2, sy + ny * w0 / 2) + ' Z';
    return P(d, col, 2.6);
  }
  /* Stummelarm: limb + runde Pfote am Ende */
  const arm = (sx, sy, ex, ey, w, bend, col, paw) =>
    limb(sx, sy, ex, ey, w, w * 0.9, bend, col) + C(ex, ey + 0.6, w * 0.62, paw || col, 2.4) + hl(ex - w * 0.22, ey - w * 0.1, w * 0.16, 0.7);
  /* Wuschelrand (Yeti) */
  function fluff(cx, cy, rx, ry, n, k) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      if (!i) { d = 'M ' + f1(x) + ' ' + f1(y); continue; }
      const m = (i - 0.5) / n * Math.PI * 2;
      d += ' Q ' + f1(cx + rx * (1 + k) * Math.cos(m)) + ' ' + f1(cy + ry * (1 + k) * Math.sin(m)) + ' ' + f1(x) + ' ' + f1(y);
    }
    return d + ' Z';
  }
  /* Gemeinsame Augen: groß, Glanz innen */
  const eyes = (lx, rx, y, extra) => Object.assign({ lx, rx, y, r: 5.8, ew: .8, hl: .36 }, extra || {});
  const feet = (y, col, sole) => ({
    legL: E(39, y, 8, 4.4, col, 2.6) + E(39, y + 1.2, 5, 2, sole || col, 0, 'opacity=".55"'),
    legR: E(61, y, 8, 4.4, col, 2.6) + E(61, y + 1.2, 5, 2, sole || col, 0, 'opacity=".55"')
  });

  /* ── 0 Trööt · Baby-Elefant ── */
  D[0] = Object.assign({
    pal: [['#a9b8cf', '#7d8fab', '#ffc2d1', '#5f7392', '#ffffff']],
    o: { al: [33, 68], ar: [67, 68], ll: [39, 88], lr: [61, 88], head: [50, 64] },
    body: E(50, 74, 19, 15, 'var(--c1)', 3.2)
      + E(50, 77, 11, 9, 'var(--c5)', 0, 'opacity=".35"')
      + shade('M 64 66 C 69 72 68 82 60 87 C 64 81 65 74 64 66 Z'),
    head: G('ear-l', [30, 42], E(19, 43, 15, 17, 'var(--c1)', 3) + E(20.5, 44, 9.5, 11.5, 'var(--c3)', 0))
      + G('ear-r', [70, 42], E(81, 43, 15, 17, 'var(--c1)', 3) + E(79.5, 44, 9.5, 11.5, 'var(--c3)', 0))
      + E(50, 42, 25, 23, 'var(--c1)', 3.2)
      + L('M 46 20 C 45 16 47 13 50 13 M 51 20 C 52 15 55 14 57 15', INK, 2, FINE)
      + shade('M 68 28 C 75 36 75 50 69 58 C 72 49 72 37 68 28 Z', 0.1)
      + shine('M 31 36 C 32 29 36 24 42 21', 2.8, 0.7)
      + '{FACE}',
    face: eyes(40.5, 59.5, 39, {
      bcol: '#ff8fb3',
      extra: P('M 46.5 47 C 46 54 45.5 60 48 64 C 50 67 55 67.5 57 64.5 C 58 63 57 61 55.4 61.4 C 53.6 61.9 53 63.3 51.6 62.4 C 50.6 61.6 52.6 54 53.5 47 Z', 'var(--c1)', 2.6)
        + L('M 47.6 56 L 52.4 56.6 M 47.4 59.6 L 51.8 60.2', 'var(--c2)', 1.3, FINE),
      mouths: {
        normal: L('M 56.5 50.5 Q 59.5 53.5 62.5 50.5', INK, 2.2),
        open: P('M 56 50 Q 59.5 56.5 63 50 Z', INK, 1.6) + E(59.5, 53.2, 1.7, 1, '#ff7f9c', 0),
        sad: L('M 56.5 53 Q 59.5 50.5 62.5 53', INK, 2.2),
        sleep: E(59.5, 51.5, 1.3, 1.6, INK, 0),
        wow: E(59.5, 52, 2, 2.5, INK, 1.4) } }),
    back: E(50, 40, 6, 3, 'var(--c2)', 0, 'opacity=".4"'),
    behind: G('tail', [68, 78], L('M 67 78 C 73 78 76 74 77 70', INK, 4.4) + L('M 67 78 C 73 78 76 74 77 70', 'var(--c1)', 2) + C(77.4, 69, 2, 'var(--c2)', 1.6)),
    armL: arm(34, 68, 28, 78, 7, -1, 'var(--c1)'),
    armR: arm(66, 68, 72, 78, 7, 1, 'var(--c1)'),
    fx: '<g class="fine">' + tw(10, 20, 3, '#ffd84a', 0) + tw(90, 70, 2.4, '#7fb8ec', 0.8) + '</g>',
    shadow: 24,
    vars: '--fx:var(--c3)'
  }, feet(88.6, 'var(--c1)', 'var(--c2)'));

  /* ── 1 Helmi · Bau-Hamster ── */
  D[1] = Object.assign({
    pal: [['#f7b955', '#d9892a', '#fff1d6', '#ffd60a', '#ffb3c4', '#e0a800']],
    o: { al: [27, 66], ar: [73, 66], ll: [39, 88], lr: [61, 88], head: [50, 60] },
    body: '',
    head: C(31, 27, 6.5, 'var(--c1)', 2.6) + C(31, 27.5, 3.4, 'var(--c5)', 0)
      + C(69, 27, 6.5, 'var(--c1)', 2.6) + C(69, 27.5, 3.4, 'var(--c5)', 0)
      + P('M 50 22 C 72 22 81 40 81 58 C 81 78 68 88 50 88 C 32 88 19 78 19 58 C 19 40 28 22 50 22 Z', 'var(--c1)', 3.2)
      + E(50, 72, 19, 14, 'var(--c3)', 0)
      + E(29, 59, 8.5, 6.5, 'var(--c3)', 0) + E(71, 59, 8.5, 6.5, 'var(--c3)', 0)
      + shade('M 72 38 C 80 50 80 68 71 80 C 76 68 76 50 72 38 Z', 0.1)
      /* Bauhelm */
      + G('helmet', [50, 32], P('M 25 35 C 25 17 37 10 50 10 C 63 10 75 17 75 35 Z', 'var(--c4)', 3)
        + R(19.5, 32, 61, 6.5, 3.2, 'var(--c4)', 2.8)
        + P('M 46 11 L 54 11 L 54.6 33 L 45.4 33 Z', 'var(--c6)', 0, 'opacity=".55"')
        + shine('M 30 28 C 31 21 36 16 42 14', 2.4, 0.75)
        + L('M 24 35 L 76 35', 'var(--c6)', 1.2, 'opacity=".6" class="fine"'))
      + '{FACE}',
    face: eyes(40, 60, 50, {
      r: 5.6, bcol: '#ff8f8f',
      extra: P('M 48.2 56.4 L 51.8 56.4 L 50 58.4 Z', 'var(--c5)', 1.2),
      mouths: {
        normal: L('M 45.5 59.5 Q 47.75 62 50 59.5 Q 52.25 62 54.5 59.5', INK, 2) + R(48.1, 60.6, 3.8, 3.2, 0.8, '#fff', 1.2),
        open: P('M 45 59.4 Q 50 67 55 59.4 Z', INK, 1.6) + R(48.1, 59.6, 3.8, 2.6, 0.6, '#fff', 0) + E(50, 64, 1.9, 1.1, '#ff7f9c', 0),
        sad: L('M 46 62 Q 50 59 54 62', INK, 2.2),
        sleep: E(50, 61, 1.3, 1.6, INK, 0),
        wow: E(50, 61.5, 2.1, 2.6, INK, 1.4) } }),
    back: E(50, 56, 12, 8, 'var(--c2)', 0, 'opacity=".25"'),
    armL: arm(27, 66, 22, 74, 6.4, -1, 'var(--c1)', 'var(--c3)'),
    armR: arm(73, 66, 78, 74, 6.4, 1, 'var(--c1)', 'var(--c3)'),
    fx: '<g class="fine">' + tw(9, 50, 2.6, '#ffb347', 0.3) + tw(92, 30, 2.2, '#5aa9e6', 1) + '</g>',
    shadow: 25,
    vars: '--fx:var(--c4)'
  }, feet(89.4, 'var(--c2)', 'var(--c5)'));

  /* ── 2 Rexi · Mini-T-Rex mit Winzärmchen ── */
  D[2] = Object.assign({
    pal: [['#5cc46e', '#2e8b44', '#e6f8c8', '#ffb347', '#ffffff']],
    o: { al: [35, 63], ar: [65, 63], ll: [39, 88], lr: [61, 88], head: [50, 52] },
    behind: G('tail', [28, 78], P('M 32 70 C 22 72 12 72 5 64 C 9 76 20 84 32 82 Z', 'var(--c1)', 3))
      + P('M 33 22 L 37 12 L 42 19 L 47 8 L 52 17 L 58 9 L 61 19 L 67 13 L 68 24 Z', 'var(--c4)', 2.6),
    body: P('M 50 16 C 72 16 79 32 78 50 C 77 70 72 88 50 88 C 28 88 23 70 22 50 C 21 32 28 16 50 16 Z', 'var(--c1)', 3.2)
      + P('M 36 64 C 38 58 62 58 64 64 C 66 76 60 84 50 84 C 40 84 34 76 36 64 Z', 'var(--c3)', 2.2)
      + L('M 38 70 L 62 70 M 38.5 76 L 61.5 76', 'var(--c1)', 1.4, 'opacity=".6" class="fine"')
      + shade('M 70 30 C 78 42 77 62 70 78 C 74 62 74 44 70 30 Z', 0.1)
      + shine('M 30 40 C 31 31 35 25 41 21', 2.8, 0.6)
      + C(62, 26, 1.6, 'var(--c2)', 0, FINE) + C(68, 33, 1.3, 'var(--c2)', 0, FINE) + C(33, 30, 1.4, 'var(--c2)', 0, FINE),
    head: '{FACE}',
    face: eyes(40, 60, 38, {
      bcol: '#ff9f8f',
      extra: C(47.5, 45, 0.9, INK, 0, FINE) + C(52.5, 45, 0.9, INK, 0, FINE),
      mouths: {
        normal: P('M 40 50 Q 50 58 60 50 Q 50 53 40 50 Z', INK, 2) + P('M 43.5 51.6 L 45 54 L 46.5 52.2 Z M 53.5 52.2 L 55 54 L 56.5 51.6 Z', '#fff', 0),
        open: P('M 40 49.5 Q 50 63 60 49.5 Z', INK, 1.8) + P('M 43 50.4 L 44.8 53 L 46.6 50.6 Z M 53.4 50.6 L 55.2 53 L 57 50.4 Z', '#fff', 0) + E(50, 57.5, 3, 1.6, '#ff7f9c', 0),
        sad: L('M 42 54 Q 50 49 58 54', INK, 2.2),
        sleep: E(50, 52, 1.4, 1.8, INK, 0),
        wow: E(50, 52.5, 2.6, 3.2, INK, 1.4) } }),
    back: E(50, 40, 12, 10, 'var(--c2)', 0, 'opacity=".25"'),
    /* die Winzärmchen sind der Witz */
    armL: limb(35, 63, 31, 67, 4.4, 3.6, -0.6, 'var(--c1)') + L('M 29.4 67.6 l -1.6 1.6 M 30.6 68.6 l -0.8 2', INK, 1.4),
    armR: limb(65, 63, 69, 67, 4.4, 3.6, 0.6, 'var(--c1)') + L('M 70.6 67.6 l 1.6 1.6 M 69.4 68.6 l 0.8 2', INK, 1.4),
    fx: '<g class="fine">' + tw(88, 46, 2.6, '#ffb347', 0) + tw(12, 30, 2.2, '#34d399', 0.9) + '</g>',
    shadow: 26,
    vars: '--fx:var(--c4)'
  }, feet(89.4, 'var(--c1)', 'var(--c2)'));

  /* ── 3 Frosti · kleiner Yeti ── */
  D[3] = Object.assign({
    pal: [['#5b9bff', '#2f6fd6', '#eaf3ff', '#fff3d6', '#cfe3ff']],
    o: { al: [24, 62], ar: [76, 62], ll: [39, 88], lr: [61, 88], head: [50, 58] },
    behind: P('M 32 28 C 26 22 26 14 31 10 C 31 16 34 20 39 22 Z', 'var(--c4)', 2.6)
      + P('M 68 28 C 74 22 74 14 69 10 C 69 16 66 20 61 22 Z', 'var(--c4)', 2.6),
    body: '',
    head: P(fluff(50, 54, 29, 33, 20, 0.06), 'var(--c1)', 3.2)
      + P(fluff(50, 18.5, 7, 4, 6, 0.3), 'var(--c1)', 2.4)
      + P('M 31 46 C 31 35 40 31 50 31 C 60 31 69 35 69 46 C 69 58 61 63 50 63 C 39 63 31 58 31 46 Z', 'var(--c3)', 2.4)
      + E(50, 76, 13, 10, 'var(--c5)', 0, 'opacity=".7"')
      + shade('M 70 40 C 78 52 78 70 70 82 C 74 70 75 54 70 40 Z', 0.1)
      + shine('M 27 46 C 27 37 31 31 37 27', 2.6, 0.55)
      + '{FACE}',
    face: eyes(41.5, 58.5, 45, {
      r: 5.4, bcol: '#8fb6ff',
      extra: E(50, 51.5, 2.6, 1.7, 'var(--c2)', 0) + hl(49.2, 51, 0.6, 0.8),
      mouths: {
        normal: L('M 45 55 Q 50 59.5 55 55', INK, 2.2) + P('M 52.4 56.6 L 53.8 59.4 L 55 56.2 Z', '#fff', 1),
        open: P('M 44.5 54.6 Q 50 63 55.5 54.6 Z', INK, 1.6) + P('M 52.6 55.2 L 53.8 57.6 L 55 55 Z', '#fff', 0) + E(50, 59.2, 2, 1.1, '#ff7f9c', 0),
        sad: L('M 45.5 58 Q 50 54.5 54.5 58', INK, 2.2),
        sleep: E(50, 56.5, 1.3, 1.6, INK, 0),
        wow: E(50, 57, 2.1, 2.6, INK, 1.4) } }),
    back: E(50, 50, 14, 12, 'var(--c2)', 0, 'opacity=".25"'),
    armL: arm(25, 62, 18, 73, 7.4, -1.4, 'var(--c1)', 'var(--c3)'),
    armR: arm(75, 62, 82, 73, 7.4, 1.4, 'var(--c1)', 'var(--c3)'),
    fx: '<g class="fine flakes">' + star(12, 26, 3, '#fff', 'stroke="' + INK + '" stroke-width=".8" class="tw"') + star(88, 44, 2.4, '#fff', 'stroke="' + INK + '" stroke-width=".8" class="tw" style="animation-delay:.7s"') + '</g>',
    shadow: 26,
    vars: '--fx:var(--c5)'
  }, {
    legL: E(38, 88.6, 10, 4.8, 'var(--c1)', 2.8) + E(38, 89.6, 6.4, 2.4, 'var(--c3)', 0),
    legR: E(62, 88.6, 10, 4.8, 'var(--c1)', 2.8) + E(62, 89.6, 6.4, 2.4, 'var(--c3)', 0)
  });

  /* ── 4 Anton · Ameise mit Schweißband und vier Armen ── */
  D[4] = Object.assign({
    pal: [['#ff5f63', '#c2343a', '#ffffff', '#ffd84a', '#ffa3a6']],
    o: { al: [37, 66], ar: [63, 66], ll: [42, 88], lr: [58, 88], head: [50, 58] },
    behind: E(73, 77, 13, 11, 'var(--c1)', 3) + L('M 66 72 C 70 75 70 80 66 83 M 72 67 C 76 72 76 82 72 87', 'var(--c2)', 1.4, 'opacity=".5" class="fine"')
      + G('ant-l', [40, 22], L('M 41 22 C 38 14 33 10 27 9', INK, 2.6) + C(26, 8.6, 3.4, 'var(--c1)', 2.2))
      + G('ant-r', [60, 22], L('M 59 22 C 62 14 67 10 73 9', INK, 2.6) + C(74, 8.6, 3.4, 'var(--c1)', 2.2)),
    body: E(50, 75, 13, 12, 'var(--c1)', 3)
      /* unteres Armpaar: stützt sich in die Hüften */
      + limb(39, 78, 34, 82, 4, 3.4, 1, 'var(--c1)') + C(33.4, 82.6, 2.4, 'var(--c2)', 1.8)
      + limb(61, 78, 66, 82, 4, 3.4, -1, 'var(--c1)') + C(66.6, 82.6, 2.4, 'var(--c2)', 1.8),
    head: E(50, 42, 27, 24, 'var(--c1)', 3.2)
      + shade('M 70 30 C 78 40 77 54 70 62 C 74 52 74 40 70 30 Z', 0.12)
      + shine('M 29 38 C 30 31 34 26 40 23', 2.8, 0.7)
      + G('band', [50, 28], P('M 24.6 30 C 37 23.6 63 23.6 75.4 30 L 76.4 36 C 63 30 37 30 23.6 36 Z', 'var(--c3)', 2.4)
        + L('M 26 33 C 38 28 62 28 74 33', 'var(--c1)', 1.2, 'opacity=".7" class="fine"'))
      + '{FACE}',
    face: eyes(40.5, 59.5, 43, {
      r: 6, bcol: '#ff9fb0',
      mouths: {
        normal: P('M 45 52 Q 50 58 55 52 Z', INK, 1.8) + E(50, 55, 1.8, 1, '#ff9fb0', 0),
        open: P('M 44.5 51.5 Q 50 61 55.5 51.5 Z', INK, 1.6) + E(50, 56.6, 2.2, 1.3, '#ff9fb0', 0),
        sad: L('M 45.5 55 Q 50 51.5 54.5 55', INK, 2.2),
        sleep: E(50, 53.5, 1.3, 1.6, INK, 0),
        wow: E(50, 54, 2.2, 2.8, INK, 1.4) } }),
    back: E(50, 44, 10, 8, 'var(--c2)', 0, 'opacity=".3"'),
    armL: arm(38, 66, 30, 72, 5.2, -1, 'var(--c1)', 'var(--c2)'),
    armR: arm(62, 66, 70, 72, 5.2, 1, 'var(--c1)', 'var(--c2)'),
    fx: '<g class="fine">' + tw(10, 40, 2.6, '#ffd84a', 0) + tw(90, 20, 2.2, '#ff9fb0', 0.6) + '</g>',
    shadow: 26,
    vars: '--fx:var(--c4)'
  }, {
    legL: limb(45, 84, 42, 89, 4, 3.6, 0, 'var(--c1)') + E(41, 90, 4.4, 2.4, 'var(--c2)', 2),
    legR: limb(55, 84, 58, 89, 4, 3.6, 0, 'var(--c1)') + E(59, 90, 4.4, 2.4, 'var(--c2)', 2)
  });

  /* ── 5 Okti · Krake mit Taucherbrille ── */
  const tent = (x, dir, col) => P('M ' + (x - 4.6) + ' 66 C ' + (x - 5) + ' 76 ' + (x - 2 + dir * 2) + ' 84 ' + (x + dir * 5) + ' 88 C ' + (x + dir * 8) + ' 89.6 ' + (x + dir * 9) + ' 86 ' + (x + dir * 6.5) + ' 84.6 C ' + (x + dir * 3) + ' 82 ' + (x + 4.6) + ' 76 ' + (x + 4.6) + ' 66 Z', col, 2.8);
  D[5] = {
    pal: [['#a17dff', '#6f4cd6', '#d9ccff', '#bfe8ff', '#ffd84a']],
    o: { al: [27, 62], ar: [73, 62], ll: [40, 86], lr: [60, 86], head: [50, 56] },
    legL: tent(34, -1, 'var(--c1)') + tent(45, -1, 'var(--c1)')
      + '<g class="fine">' + C(33, 76, 1.3, 'var(--c3)', 0) + C(44.5, 78, 1.3, 'var(--c3)', 0) + '</g>',
    legR: tent(55, 1, 'var(--c1)') + tent(66, 1, 'var(--c1)')
      + '<g class="fine">' + C(55.5, 78, 1.3, 'var(--c3)', 0) + C(67, 76, 1.3, 'var(--c3)', 0) + '</g>',
    body: '',
    head: P('M 50 12 C 71 12 80 28 80 46 C 80 62 72 72 50 72 C 28 72 20 62 20 46 C 20 28 29 12 50 12 Z', 'var(--c1)', 3.2)
      + C(66, 22, 3, 'var(--c3)', 0, 'opacity=".7" class="fine"') + C(72, 31, 2, 'var(--c3)', 0, 'opacity=".7" class="fine"') + C(33, 20, 2.2, 'var(--c3)', 0, 'opacity=".7" class="fine"')
      + shade('M 70 26 C 78 36 78 54 70 64 C 74 54 74 38 70 26 Z', 0.12)
      + shine('M 28 40 C 28 31 32 24 39 19', 2.8, 0.7)
      /* Taucherbrille auf der Stirn */
      + G('goggles', [50, 26], L('M 21 30 C 30 25 70 25 79 30', INK, 4) + L('M 21 30 C 30 25 70 25 79 30', 'var(--c2)', 2)
        + C(41, 25.5, 6.4, 'var(--c4)', 2.6) + C(59, 25.5, 6.4, 'var(--c4)', 2.6)
        + R(47, 24.2, 6, 2.6, 1, INK, 0) + hl(39, 23.5, 1.8, 0.95) + hl(57, 23.5, 1.8, 0.95))
      + '{FACE}',
    face: eyes(40.5, 59.5, 45, {
      bcol: '#ff9fd0',
      my: 55, mw: 3.4 }),
    back: E(50, 44, 14, 12, 'var(--c2)', 0, 'opacity=".3"'),
    armL: limb(27, 62, 17, 70, 6.6, 5.4, -2, 'var(--c1)') + C(16.4, 70.8, 1.4, 'var(--c3)', 0, FINE),
    armR: limb(73, 62, 83, 70, 6.6, 5.4, 2, 'var(--c1)') + C(83.6, 70.8, 1.4, 'var(--c3)', 0, FINE),
    fx: '<g class="fine bubbles">' + C(12, 30, 2.4, 'none', 0, 'stroke="#5aa9e6" stroke-width="1.2"') + C(9, 22, 1.4, 'none', 0, 'stroke="#5aa9e6" stroke-width="1"') + C(88, 40, 2, 'none', 0, 'stroke="#5aa9e6" stroke-width="1.2"') + '</g>',
    shadow: 28,
    vars: '--fx:var(--c5)'
  };

  /* ── 6 Packi · Pappkarton (Ersatz, falls eins nicht gefällt) ── */
  D[6] = Object.assign({
    pal: [['#e0b47a', '#b9874a', '#e5484d', '#fff4e2', '#8a5a2b']],
    o: { al: [21, 58], ar: [79, 58], ll: [39, 88], lr: [61, 88], head: [50, 84] },
    body: '',
    head: G('flap-l', [22, 30], P('M 22 30 L 8 22 L 12 15 L 30 25 Z', 'var(--c2)', 2.6))
      + G('flap-r', [78, 30], P('M 78 30 L 92 22 L 88 15 L 70 25 Z', 'var(--c2)', 2.6))
      + R(20, 26, 60, 60, 7, 'var(--c1)', 3.2)
      + P('M 20.5 33 L 79.5 33 L 79.5 26.5 L 20.5 26.5 Z', 'var(--c2)', 0, 'opacity=".55"')
      + R(44, 26, 12, 60, 0, 'var(--c3)', 0, 'opacity=".9"')
      + L('M 44 26 L 44 86 M 56 26 L 56 86', INK, 1.4, 'opacity=".35"')
      + R(20, 26, 60, 60, 7, 'none', 3.2)
      + shade('M 72 30 L 79 30 L 79 80 C 79 84 77 86 73 86 L 72 86 Z', 0.12)
      + shine('M 25 40 L 25 33', 2.6, 0.7)
      + '<g class="fine">' + L('M 26 76 L 34 76 M 26 80 L 31 80', 'var(--c5)', 1.4, 'opacity=".6"')
      + P('M 66 72 l 3 -5 l 3 5 Z M 68.2 72 L 68.2 76 L 69.8 76 L 69.8 72', 'none', 0, 'stroke="var(--c5)" stroke-width="1.2" opacity=".6"') + '</g>'
      + '{FACE}',
    headTop: '',
    face: eyes(36, 64, 50, {
      bcol: '#ff8f8f', my: 61, mx: 50, mw: 4 }),
    back: '',
    armL: arm(21, 58, 14, 70, 6, -1, 'var(--c1)'),
    armR: arm(79, 58, 86, 70, 6, 1, 'var(--c1)'),
    shadow: 30,
    vars: '--fx:var(--c3)'
  }, {
    legL: R(33, 85, 9, 4, 2, 'var(--c5)', 2.2) + E(37, 90, 6.4, 2.8, 'var(--c5)', 2.2),
    legR: R(58, 85, 9, 4, 2, 'var(--c5)', 2.2) + E(63, 90, 6.4, 2.8, 'var(--c5)', 2.2)
  });

  /* Eine Figur als SVG — wie figuren.js. Unter 70 px kommt .ds-sm dazu
     (Kleinkram und zweiter Glanzpunkt weg, figuren-neu.css). */
  function svg(i, action, size) {
    const n = ((i | 0) % LIST.length + LIST.length) % LIST.length;
    const id = 120 + n;
    const a = action || 'idle';
    const cls = (a === 'lift' || a === 'idle' ? 'c-idle' : K.cls(a, id)) + ' ds-fig dn-fig dn-fig--' + LIST[n].key
      + (a === 'lift' ? ' ds-lift' : '') + (size && size < 70 ? ' ds-sm' : '');
    return K.buildDef(D[n], 0, cls, size, id, 'derby');
  }

  window.DDFigurenNeu = { LIST, svg, count: LIST.length };
})();
