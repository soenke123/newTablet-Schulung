/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/bilder.js   ·   Bilder für Erklärkarten und Kästen
   ══════════════════════════════════════════════════════════════
   Alles als SVG-Text, Farben über CSS-Variablen (hell/dunkel kommt
   von selbst). Die Geschichte ab Level 4: eine Forschungsstation in
   der Antarktis –
     4  Wie schwer ist der Pinguin?  (Flosse → Gewicht, Neuron ohne σ)
     5  Pinguine sortieren           (Schnabel → Art, Neuron mit σ)
     6  Das Nest                     (Mama/Papa am Nest → Ei ok? = XOR)
     7  Zwei Neuronen, zwei Welten   (dasselbe Nest mit Neuronen A/B)

   NTBild.peng(o)        Pinguin von vorn als <g> (o.sp adelie|chin|gentoo,
                         o.x, o.y = Füße, o.s Größe, o.scarf Farbe)
   NTBild.icon(kind)     kleines <svg> für Tabellen: 'peng', 'away', 'egg'
   NTBild.scene(id)      großes Bild für die Erklärkarte von Level id
   NTBild.SP             Namen/Farben der drei Arten
   ══════════════════════════════════════════════════════════════ */

window.NTBild = (function () {
  'use strict';

    const SP = {
    adelie: { name: 'Adeliepinguin', short: 'Adelie', col: '#2f80ed' },
    chin:   { name: 'Zügelpinguin',  short: 'Zügel',  col: '#f27828' },
    gentoo: { name: 'Eselspinguin',  short: 'Esel',   col: '#12a37a' }
  };
  const ORANGE = '#f27828', VIOLET = '#8b5cf6', BLUE = '#2f7fe6', GREEN = '#12a37a', RED = '#d43a52';

  /* ── Pinguin als Bild (Sönkes Zeichnungen, freigestellt in img/frei/) ──
     Füße bei (x, y), Höhe ≈ 100·s. o.sp adelie|chin|gentoo, o.v 1|2 = Variante.
     Mit o.scarf (oder o.sp 'main') ist es der Spieler: der Pinguin mit Schal –
     o.team 'a' = Schal orange (Figur A), 'b' = violett (Figur B), sonst türkis. */
  const IMG = 'img/frei/';
  const RATIO = { adelie_1: 0.68, adelie_2: 0.85, chin_1: 0.67, chin_2: 0.66, gentoo_1: 0.75, gentoo_2: 0.85,
    main: 0.68, main_a: 0.68, main_b: 0.68 };
  function pengFile(o) {
    if (o.scarf || o.sp === 'main') return o.team === 'a' ? 'main_a' : o.team === 'b' ? 'main_b' : 'main';
    return (SP[o.sp] ? o.sp : 'adelie') + '_' + (o.v === 2 ? 2 : 1);
  }
  function peng(o) {
    o = o || {};
    const s = o.s || 1, x = o.x || 0, y = o.y || 0, f = pengFile(o);
    const h = 104 * s, w = h * (RATIO[f] || 0.75);
    return '<ellipse cx="' + x + '" cy="' + (y - 2 * s) + '" rx="' + (w * 0.42).toFixed(1) + '" ry="' + (4 * s).toFixed(1) + '" fill="#000" opacity=".16"/>' +
      '<image class="pg" href="' + IMG + f + '.webp" x="' + (x - w / 2).toFixed(1) + '" y="' + (y - h).toFixed(1) +
      '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" preserveAspectRatio="xMidYMax meet"' +
      (o.flip ? ' transform="translate(' + (2 * x) + ' 0) scale(-1 1)"' : '') + '/>';
  }
  // Kopf einer Art im Kreis (Level 5/8: „Was sagt das Netz?“), Mitte cx/cy, Radius r.
  // Ausschnitt je Bild in Bildpunkten (Bilder 420 hoch): Mitte des Kopfes + Seitenlänge.
  const HEAD = { adelie: [284, 104, 60, 128], chin: [282, 128, 60, 124], gentoo: [316, 118, 64, 130] };
  let headN = 0;
  function head(sp, cx, cy, r) {
    const h = HEAD[sp] || HEAD.adelie, id = 'ntHd' + (++headN), q = h[3] / 2;
    return '<clipPath id="' + id + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></clipPath>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#dfe9f7"/>' +
      '<g clip-path="url(#' + id + ')"><svg x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" viewBox="' +
      (h[1] - q) + ' ' + (h[2] - q) + ' ' + h[3] + ' ' + h[3] + '">' +
      '<image href="' + IMG + sp + '_1.webp" x="0" y="0" width="' + h[0] + '" height="420"/></svg></g>';
  }
  // Nest als Bild: 'nest' (leer), 'mama', 'papa', 'beide'; unten Mitte bei (x, y), Breite w
  const NEST_R = { nest: 0.41, mama: 0.39, papa: 0.46, beide: 0.46 };
  function nestImg(kind, x, y, w) {
    const f = kind === 'nest' ? 'nest' : 'nest_' + kind, h = w * (NEST_R[kind] || 0.45);
    return '<image class="pg" href="' + IMG + f + '.webp" x="' + (x - w / 2).toFixed(1) + '" y="' + (y - h).toFixed(1) +
      '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" preserveAspectRatio="xMidYMax meet"/>';
  }
  const nestKind = (m, p) => m > 0 && p > 0 ? 'beide' : m > 0 ? 'mama' : p > 0 ? 'papa' : 'nest';

  const egg = (x, y, s, fill, stroke) =>
    '<path transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')" d="M0,-14 C7,-14 10,-4 10,2 C10,9 5,13 0,13 C-5,13 -10,9 -10,2 C-10,-4 -7,-14 0,-14Z" fill="' +
    (fill || '#fbf3e4') + '" stroke="' + (stroke || 'var(--ink-soft)') + '" stroke-width="' + (1.4 / (s || 1)) + '"/>';
  const wave = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')" fill="none" stroke="' + BLUE + '" stroke-width="2.6" stroke-linecap="round">' +
    '<path d="M-16,0 q4,-6 8,0 t8,0 t8,0 t8,0"/><path d="M-12,8 q4,-6 8,0 t8,0 t8,0" opacity=".6"/></g>';
  const fish = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')"><path d="M-8,0 Q0,-6 7,0 Q0,6 -8,0Z M7,0 L12,-4 L12,4Z" fill="' + BLUE + '"/></g>';
  const check = (x, y, ok, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')">' +
    '<circle r="10" fill="' + (ok ? GREEN : RED) + '"/>' +
    (ok ? '<path d="M-4.5,0.5 L-1,4 L5,-3.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M-4,-4 L4,4 M4,-4 L-4,4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>') + '</g>';
  const T = (x, y, txt, o) => {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 13) + '" font-weight="' + (o.w || 600) + '" text-anchor="' + (o.a || 'middle') +
      '" fill="' + (o.col || 'var(--ink)') + '"' + (o.italic ? ' font-style="italic"' : '') + '>' + txt + '</text>';
  };
  const arrowHead = (x, y, col, dir) => {
    const d = dir || 0, c = Math.cos(d), s = Math.sin(d);
    const p = (a, b) => (x + a * c - b * s).toFixed(1) + ',' + (y + a * s + b * c).toFixed(1);
    return '<path d="M' + p(0, 0) + ' L' + p(-9, -5) + ' L' + p(-9, 5) + 'Z" fill="' + col + '"/>';
  };

  /* ── kleines Neuron-Bild: Eingänge links, Neuron, Ausgang rechts ── */
  function neuron(o) {
    // o: { x, y, w, h, ins:[{label, w:'w₁', col}], sym, bias, out, outSub }
    const n = o.ins.length, nx = o.x + o.w * 0.62, ny = o.y + o.h / 2, R = 19;
    let h = '';
    o.ins.forEach((inp, i) => {
      const iy = n === 1 ? ny : o.y + 12 + i * (o.h - 24) / (n - 1), ix = o.x + 52;
      h += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (nx - R) + '" y2="' + ny + '" stroke="' + (inp.col || ORANGE) + '" stroke-width="3.4" stroke-linecap="round"/>';
      h += '<circle cx="' + ix + '" cy="' + iy + '" r="4.5" fill="var(--ink)"/>';
      h += T(ix - 9, iy + 4.5, inp.label, { a: 'end', size: 13 });
      const mx = ix + (nx - R - ix) * 0.5, my = iy + (ny - iy) * 0.5 - (n === 1 ? 9 : (iy < ny ? 9 : -15));
      h += T(mx, my, inp.w, { col: inp.col || ORANGE, w: 700, size: 13 });
    });
    h += '<circle cx="' + nx + '" cy="' + ny + '" r="' + R + '" fill="var(--surface)" stroke="' + ORANGE + '" stroke-width="2.6"/>';
    h += T(nx, ny + (o.bias ? -1 : 5.5), o.sym || 'σ', { size: o.bias ? 14 : 17, w: 700 });
    if (o.bias) h += T(nx, ny + 12, o.bias, { size: 10, w: 700, col: ORANGE });
    const ox = o.x + o.w - 2;
    h += '<line x1="' + (nx + R) + '" y1="' + ny + '" x2="' + (ox - 50) + '" y2="' + ny + '" stroke="var(--ink)" stroke-width="2"/>' + arrowHead(ox - 48, ny, 'var(--ink)');
    h += T(ox - 36, ny + 4.5, o.out, { a: 'start', size: 13, w: 700 });
    if (o.outSub) h += T(ox - 36, ny + 19, o.outSub, { a: 'start', size: 11, w: 500, col: 'var(--ink-faint)' });
    return h;
  }

  /* ── „So liest du die Welt“: Boden als Raute mit Mulde, Achsen, Pinguin ──
     Eigene Koordinaten 0…232 × 0…150, mit o.k (Maßstab) an (x, y) gesetzt. */
  function karte(x, y, o) {
    // o: { xl, zl, col, title, mu/mv = Mulde, ru, pu/pv = Pinguin, scarf, k }
    const col = o.col || ORANGE, k = o.k || 0.6;
    const P = (u, v) => [116 + (u - v) * 58, 70 + (u + v) * 26];   // u, v ∈ [−1, 1]
    const pt = (u, v) => P(u, v).map(n => n.toFixed(1)).join(',');
    let h = '<path d="M' + pt(-1, -1) + ' L' + pt(1, -1) + ' L' + pt(1, 1) + ' L' + pt(-1, 1) + 'Z" fill="var(--ice)" stroke="var(--line)" stroke-width="1.5"/>';
    const mu = o.mu != null ? o.mu : 0.25, mv = o.mv != null ? o.mv : -0.1;
    for (const r of [0.2, 0.42, 0.66]) {
      let d = '';
      for (let i = 0; i <= 36; i++) {
        const a = i / 36 * Math.PI * 2, q = P(mu + Math.cos(a) * r * (o.ru || 1), mv + Math.sin(a) * r);
        d += (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1);
      }
      h += '<path d="' + d + 'Z" fill="none" stroke="var(--sea)" stroke-width="1.6" opacity="' + (0.9 - r * 0.6) + '"/>';
    }
    const f = P(mu, mv);
    h += '<path d="M' + f[0] + ',' + (f[1] - 1) + ' l0,-20 l13,5 l-13,5" fill="#f4c13d" stroke="#b88a00" stroke-width="1.2"/>';
    // Achsen
    const a0 = P(-1, 1.2), a1 = P(1, 1.2), b0 = P(1.2, 1), b1 = P(1.2, -1);
    h += '<line x1="' + a0[0] + '" y1="' + a0[1] + '" x2="' + a1[0] + '" y2="' + a1[1] + '" stroke="' + col + '" stroke-width="3"/>' +
      arrowHead(a1[0], a1[1], col, Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
    h += '<line x1="' + b0[0] + '" y1="' + b0[1] + '" x2="' + b1[0] + '" y2="' + b1[1] + '" stroke="' + col + '" stroke-width="3"/>' +
      arrowHead(b1[0], b1[1], col, Math.atan2(b1[1] - b0[1], b1[0] - b0[0]));
    const am = P(0, 1.2), bm = P(1.2, 0);
    h += T(am[0] - 10, am[1] + 22, o.xl, { col, w: 700, size: 19, a: 'end' });
    h += T(bm[0] + 10, bm[1] + 22, o.zl, { col, w: 700, size: 19, a: 'start' });
    // Pinguin steht auf seinem Neuron
    const pp = P(o.pu != null ? o.pu : -0.55, o.pv != null ? o.pv : 0.35);
    h += peng({ sp: 'main', team: o.team, x: pp[0], y: pp[1] + 4, s: 0.46 });
    if (o.title) h += T(116, 12, o.title, { size: 18, col: 'var(--ink-faint)', w: 700 });
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' + h + '</g>';
  }

  /* ── Höhenprofil für Level 1–3 ── */
  function profile(fn, x0, x1, y0, hgt, n) {
    let d = '';
    for (let i = 0; i <= n; i++) { const t = i / n; d += (i ? 'L' : 'M') + (x0 + (x1 - x0) * t).toFixed(1) + ',' + (y0 - fn(t) * hgt).toFixed(1); }
    return d;
  }
  const hillsFn = t => 0.62 + 0.18 * Math.sin(t * 15) * (1 - t * 0.4) - 0.5 * Math.exp(-((t - 0.78) ** 2) / 0.004) + 0.15 * Math.cos(t * 5);

  const svg = (vb, body, label) => '<svg class="ill" viewBox="' + vb + '" role="img" aria-label="' + label + '" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--font, Outfit, system-ui, sans-serif)">' + body + '</svg>';

  /* ── Schneestreifen (fest gewürfelt, gleiches Bild bei jedem Aufruf) ── */
  function snowfall(W, H, k) {
    let r = 7, h = '';
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < Math.round(70 * k); i++) {
      const x = rnd() * W, y = rnd() * H, z = 0.35 + rnd() * 0.65, l = 4 + z * 9;
      h += '<line x1="' + x.toFixed(0) + '" y1="' + y.toFixed(0) + '" x2="' + (x - l).toFixed(0) + '" y2="' + (y - l * 0.35).toFixed(0) +
        '" stroke="var(--snow, #cfe0f5)" stroke-opacity="' + (0.35 + z * 0.5).toFixed(2) + '" stroke-width="' + (z * 1.8).toFixed(1) + '" stroke-linecap="round"/>';
    }
    return h;
  }

  /* ── die Bilder je Level ── */
  const SCENES = {
    1() {
      const W = 560, base = 178, fn = hillsFn;
      const at = t => [30 + 500 * t, base - fn(t) * 120];
      const pg = at(0.27);
      let b = '<defs><radialGradient id="ntFog1" cx="' + (pg[0] / W) + '" cy="' + ((pg[1] - 30) / 200) + '" r="0.32">' +
        '<stop offset="0.25" stop-color="var(--fog)" stop-opacity="0"/><stop offset="1" stop-color="var(--fog)" stop-opacity=".88"/></radialGradient></defs>';
      b += '<rect width="560" height="200" fill="var(--surface-2)"/>';
      b += '<path d="' + profile(fn, 30, 530, base, 120, 120) + ' L530,200 L30,200Z" fill="var(--ice)" stroke="var(--ink-faint)" stroke-width="2"/>';
      const fl = at(0.78);
      b += '<path d="M' + fl[0] + ',' + fl[1] + ' l0,-26 l16,6 l-16,6" fill="#f4c13d" stroke="#b88a00"/>';
      b += '<rect width="560" height="200" fill="url(#ntFog1)"/>';
      b += peng({ sp: 'main', x: pg[0], y: pg[1] + 2, s: 0.56 });
      b += '<g transform="translate(' + (pg[0] + 26) + ' ' + (pg[1] - 62) + ')"><rect x="0" y="-16" width="26" height="24" rx="8" fill="var(--surface)" stroke="var(--line)"/>' + T(13, 2, '?', { size: 16, w: 700 }) + '</g>';
      b += snowfall(560, 200, 1);
      b += T(fl[0] - 10, fl[1] - 36, 'tiefste Mulde – irgendwo im Sturm', { size: 12, col: 'var(--ink-faint)' });
      return svg('0 0 560 200', b, 'Pinguin im Schneesturm auf einem Hügel, irgendwo liegt die tiefste Mulde');
    },
    2() {
      const fn = hillsFn, base = 178, at = t => [30 + 500 * t, base - fn(t) * 120];
      let b = '<rect width="560" height="200" fill="var(--surface-2)"/>';
      b += '<path d="' + profile(fn, 30, 530, base, 120, 120) + ' L530,200 L30,200Z" fill="var(--ice)" stroke="var(--ink-faint)" stroke-width="2"/>';
      const t0 = 0.19, pg = at(t0), q = at(t0 + 0.05);
      const ang = Math.atan2(q[1] - pg[1], q[0] - pg[0]);
      const ex = pg[0] + Math.cos(ang) * 46, ey = pg[1] + Math.sin(ang) * 46;
      b += '<line x1="' + pg[0] + '" y1="' + (pg[1] - 2) + '" x2="' + ex + '" y2="' + (ey - 2) + '" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>' + arrowHead(ex + Math.cos(ang) * 6, ey - 2 + Math.sin(ang) * 6, 'var(--accent)', ang);
      b += peng({ sp: 'main', x: pg[0], y: pg[1] + 2, s: 0.52 });
      // lokale vs. tiefste Mulde
      let lo = 0.33, lv = 9; for (let t = 0.26; t < 0.45; t += 0.002) if (fn(t) < lv) { lv = fn(t); lo = t; }
      const lm = at(lo), fl = at(0.78);
      b += T(lm[0], lm[1] + 20, 'kleine Mulde', { size: 12, col: 'var(--ink-soft)', w: 700 });
      b += '<path d="M' + fl[0] + ',' + fl[1] + ' l0,-26 l16,6 l-16,6" fill="#f4c13d" stroke="#b88a00"/>';
      b += T(fl[0] + 8, fl[1] - 34, 'tiefste Mulde', { size: 12, col: 'var(--ink)', w: 700 });
      b += snowfall(560, 200, 0.6);
      b += T(ex + 4, ey - 22, 'bergab', { size: 12.5, col: 'var(--accent-ink)', w: 700, a: 'start' });
      return svg('0 0 560 200', b, 'Ein leuchtender Pfeil unter dem Pinguin zeigt bergab, zur nächsten Mulde');
    },
    3() {
      let b = '<rect width="560" height="200" fill="var(--surface-2)"/>';
      const panel = (ox, title, col, jumps, note) => {
        const bowl = t => 0.9 * (2 * t - 1) ** 2;
        const X = t => ox + 12 + t * 156, Y = t => 150 - bowl(t) * 100;
        let h = '<path d="' + profile(bowl, ox + 12, ox + 168, 150, 100, 40) + '" fill="none" stroke="var(--ink-faint)" stroke-width="2"/>';
        let prev = jumps[0];
        for (let i = 1; i < jumps.length; i++) {
          const t = jumps[i], x0 = X(prev), y0 = Y(prev), x1 = X(t), y1 = Y(t), mx = (x0 + x1) / 2, top = Math.min(y0, y1) - 12 - Math.abs(x1 - x0) * 0.25;
          if (t > 1.05 || t < -0.05) {
            h += '<path d="M' + x0 + ',' + y0 + ' Q' + (x0 + (x1 - x0) * 0.4) + ',' + (top - 30) + ' ' + Math.min(ox + 175, Math.max(ox + 5, x1)) + ',' + (top - 40) + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-dasharray="4 3"/>';
            break;
          }
          h += '<path d="M' + x0 + ',' + y0 + ' Q' + mx + ',' + top + ' ' + x1 + ',' + y1 + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-dasharray="4 3"/>';
          h += '<circle cx="' + x1 + '" cy="' + y1 + '" r="3.2" fill="' + col + '"/>';
          prev = t;
        }
        h += peng({ sp: 'main', x: X(jumps[0]), y: Y(jumps[0]) + 1, s: 0.3 });
        h += '<path d="M' + X(0.5) + ',' + Y(0.5) + ' l0,-16 l10,4 l-10,4" fill="#f4c13d" stroke="#b88a00"/>';
        h += T(ox + 90, 24, title, { size: 14, w: 700, col });
        h += T(ox + 90, 178, note, { size: 12, col: 'var(--ink-soft)' });
        return h;
      };
      b += panel(8, 'Lernrate zu klein', BLUE, [0.04, 0.07, 0.1, 0.125, 0.148, 0.168], 'kommt kaum voran');
      b += panel(192, 'Lernrate gut', GREEN, [0.04, 0.3, 0.44, 0.49], 'landet im Tal');
      b += panel(376, 'Lernrate zu groß', RED, [0.08, 0.86, 0.1, 1.4], 'springt drüber – oder raus');
      return svg('0 0 560 200', b, 'Drei Täler: kleine Sprünge kommen kaum voran, mittlere landen im Tal, große springen darüber hinaus');
    },
    4() {
      let b = '<rect width="560" height="210" fill="var(--surface-2)"/>';
      // Forschungsstation: Pinguin mit Lineal an der Flosse, Waage mit „?“
      b += '<rect x="10" y="10" width="150" height="190" rx="12" fill="var(--ice)"/>';
      b += peng({ sp: 'gentoo', x: 70, y: 170, s: 1.22, flip: true });
      b += '<g transform="translate(118 90) rotate(64)"><rect x="0" y="-5" width="66" height="10" rx="2" fill="#f4c13d" stroke="#b88a00"/>' +
        [0, 1, 2, 3, 4, 5, 6].map(i => '<line x1="' + (4 + i * 9.6) + '" y1="-5" x2="' + (4 + i * 9.6) + '" y2="' + (i % 2 ? -1 : 1) + '" stroke="#6b5200" stroke-width="1"/>').join('') + '</g>';
      b += T(85, 30, 'Flosse: 21 cm', { size: 13, w: 700, col: ORANGE });
      b += '<rect x="22" y="170" width="100" height="8" rx="3" fill="#9aa3ad"/>';
      b += T(85, 194, 'Gewicht: ? kg', { size: 12.5, w: 700 });
      // Neuron
      b += T(276, 30, 'Das Neuron schätzt', { size: 12, w: 700, col: 'var(--ink-faint)' });
      b += neuron({ x: 168, y: 46, w: 232, h: 60, ins: [{ label: 'Flosse', w: '· w' }], sym: 'Σ', bias: '+ b', out: 'Gewicht', outSub: 'ohne σ' });
      b += '<rect x="176" y="128" width="226" height="70" rx="10" fill="var(--accent-dim)"/>';
      b += T(289, 150, 'Gewicht = w · (Flosse − 20 cm) + b', { size: 12.5, w: 700, col: 'var(--accent-ink)' });
      b += T(289, 170, 'w = kg pro cm Flosse', { size: 12, col: 'var(--ink-soft)' });
      b += T(289, 187, 'b = Gewicht bei 20 cm Flosse', { size: 12, col: 'var(--ink-soft)' });
      b += karte(410, 30, { xl: 'w', zl: 'b', title: 'Deine Welt', mu: 0.1, mv: -0.2 });
      b += T(484, 140, 'Ort = w und b', { size: 11.5, col: 'var(--ink-soft)' });
      b += T(484, 156, 'Höhe = Fehler', { size: 11.5, col: 'var(--ink-soft)', w: 700 });
      b += T(484, 172, 'Flagge = bestes Neuron', { size: 11.5, col: 'var(--ink-soft)' });
      return svg('0 0 560 210', b, 'Ein Eselspinguin mit Lineal an der Flosse, daneben das Neuron, das aus der Flosse das Gewicht schätzt');
    },
    5() {
      let b = '<rect width="560" height="210" fill="var(--surface-2)"/>';
      b += '<rect x="10" y="10" width="178" height="190" rx="12" fill="var(--ice)"/>';
      b += peng({ sp: 'adelie', x: 54, y: 156, s: 1.1 });
      b += peng({ sp: 'chin', x: 142, y: 156, s: 1.1 });
      b += '<circle cx="52" cy="167" r="5" fill="' + SP.adelie.col + '"/>' + T(52, 190, 'Adelie', { size: 12.5, w: 700, col: SP.adelie.col });
      b += '<path d="M140,161 l5.5,9 l-11,0Z" fill="' + SP.chin.col + '"/>' + T(140, 190, 'Zügel', { size: 12.5, w: 700, col: SP.chin.col });
      b += T(142, 30, 'schwarzer „Zügel“', { size: 11, col: 'var(--ink-soft)' });
      // Schnabel vermessen
      b += '<g transform="translate(232 40)"><path d="M0,0 L58,10 L0,22Z" fill="#6b5656"/>' +
        '<line x1="0" y1="32" x2="58" y2="32" stroke="' + ORANGE + '" stroke-width="2"/>' + T(29, 46, 'Länge', { size: 12, w: 700, col: ORANGE }) +
        '<line x1="-10" y1="0" x2="-10" y2="22" stroke="' + ORANGE + '" stroke-width="2"/>' + T(-14, 15, 'Höhe', { size: 12, w: 700, col: ORANGE, a: 'end' }) + '</g>';
      b += T(260, 26, 'Schnabel messen', { size: 12, w: 700, col: 'var(--ink-faint)' });
      b += neuron({ x: 186, y: 100, w: 216, h: 64, ins: [{ label: 'Länge', w: 'w₁' }, { label: 'Höhe', w: 'w₂' }], sym: 'σ', out: 'Zügel?', outSub: '0–100 %' });
      b += T(296, 196, 'σ macht aus der Summe „wie sicher“', { size: 12, col: 'var(--ink-soft)' });
      b += karte(410, 30, { xl: 'w₁', zl: 'w₂', title: 'Deine Welt', mu: 0.5, mv: -0.45 });
      b += T(484, 140, 'Ort = w₁ und w₂', { size: 11.5, col: 'var(--ink-soft)' });
      b += T(484, 156, 'Höhe = Fehler', { size: 11.5, col: 'var(--ink-soft)', w: 700 });
      b += T(484, 172, 'Flagge = bestes Neuron', { size: 11.5, col: 'var(--ink-soft)' });
      return svg('0 0 560 210', b, 'Adelie- und Zügelpinguin, ihr Schnabel wird vermessen, ein Neuron soll sie auseinanderhalten');
    },
    6() {
      let b = '<rect width="560" height="230" fill="var(--surface-2)"/>';
      b += cases(10, 8, 300, 214);
      b += neuron({ x: 312, y: 30, w: 236, h: 64, ins: [{ label: 'Mama', w: 'w₁' }, { label: 'Papa', w: 'w₂' }], sym: 'σ', out: 'Ei ok?' });
      b += T(430, 18, 'EIN Neuron soll das lernen', { size: 12, w: 700, col: 'var(--ink-faint)' });
      b += karte(352, 104, { xl: 'w₁', zl: 'w₂', title: 'Deine Welt', mu: 0, mv: 0, k: 0.62 });
      b += T(520, 150, 'Höhe =', { size: 11.5, col: 'var(--ink-soft)' }) + T(520, 166, 'Fehler', { size: 11.5, col: 'var(--ink-soft)', w: 700 });
      return svg('0 0 560 230', b, 'Vier Nester: Mama und Papa am Nest oder beim Fischen, nur wenn genau einer da ist, geht es dem Ei gut');
    },
    7() {
      let b = '<rect width="560" height="230" fill="var(--surface-2)"/>';
      // ganzes Netz
      const N = [[60, 52, 'Mama'], [60, 140, 'Papa']], A = [210, 52], B = [210, 140], O = [330, 96];
      for (const [ix, iy] of N) {
        b += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (A[0] - 19) + '" y2="' + A[1] + '" stroke="' + ORANGE + '" stroke-width="3.4"/>';
        b += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (B[0] - 19) + '" y2="' + B[1] + '" stroke="' + VIOLET + '" stroke-width="3.4"/>';
      }
      for (const P of [A, B]) b += '<line x1="' + (P[0] + 19) + '" y1="' + P[1] + '" x2="' + (O[0] - 19) + '" y2="' + O[1] + '" stroke="var(--ink-faint)" stroke-width="2" stroke-dasharray="4 4"/>';
      for (const [ix, iy, l] of N) b += '<circle cx="' + ix + '" cy="' + iy + '" r="4.5" fill="var(--ink)"/>' + T(ix - 9, iy + 4.5, l, { a: 'end' });
      b += '<circle cx="' + A[0] + '" cy="' + A[1] + '" r="19" fill="var(--surface)" stroke="' + ORANGE + '" stroke-width="2.8"/>' + T(A[0], A[1] + 6, 'A', { size: 16, w: 700, col: ORANGE });
      b += '<circle cx="' + B[0] + '" cy="' + B[1] + '" r="19" fill="var(--surface)" stroke="' + VIOLET + '" stroke-width="2.8"/>' + T(B[0], B[1] + 6, 'B', { size: 16, w: 700, col: VIOLET });
      b += '<circle cx="' + O[0] + '" cy="' + O[1] + '" r="19" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>' + T(O[0], O[1] + 6, 'σ', { size: 16, w: 700 });
      b += '<line x1="' + (O[0] + 19) + '" y1="' + O[1] + '" x2="' + (O[0] + 52) + '" y2="' + O[1] + '" stroke="var(--ink)" stroke-width="2"/>' + arrowHead(O[0] + 54, O[1], 'var(--ink)');
      b += T(O[0] + 62, O[1] + 4.5, 'Ei ok?', { a: 'start', w: 700 });
      b += T(270, 66, 'fest', { size: 11, col: 'var(--ink-faint)' });
      b += T(200, 196, 'Kanten in A = Welt A · Kanten in B = Welt B', { size: 12, col: 'var(--ink-soft)' });
      b += T(200, 214, 'ein Netz → beide Figuren immer auf derselben Höhe', { size: 12, col: 'var(--ink-soft)' });
      b += karte(410, 4, { xl: 'a₁', zl: 'a₂', col: ORANGE, title: 'Welt A', mu: 0.4, mv: -0.3, team: 'a', k: 0.62 });
      b += karte(410, 116, { xl: 'b₁', zl: 'b₂', col: VIOLET, title: 'Welt B', mu: -0.3, mv: 0.35, pu: 0.5, pv: 0.5, team: 'b', k: 0.62 });
      return svg('0 0 560 230', b, 'Das Netz mit zwei Neuronen A und B, daneben ihre beiden Welten');
    },
    8() {
      let b = '<rect width="560" height="230" fill="var(--surface-2)"/>';
      // drei Arten, echte Bilder
      b += '<rect x="10" y="10" width="236" height="210" rx="12" fill="var(--ice)"/>';
      [['adelie', 52, 0], ['chin', 128, 1], ['gentoo', 204, 2]].forEach(([sp, x, n]) => {
        b += peng({ sp, x, y: 168, s: 1.18 });
        b += T(x, 190, SP[sp].short, { size: 13, w: 700, col: SP[sp].col });
        b += T(x, 208, 'Zahl ' + n, { size: 11.5, w: 700, col: 'var(--ink-soft)' });
      });
      // Netz: 3 Eingänge → A, B, C → Zahl
      const ins = [[300, 50, 'Länge'], [300, 112, 'Höhe'], [300, 174, 'Flosse']], H3 = [[400, 50, 'A', '#8b5cf6'], [400, 112, 'B', '#d9468f'], [400, 174, 'C', '#0ea5b7']], Z = [488, 112];
      for (const [ix, iy] of ins) for (const [hx, hy, , c] of H3) b += '<line x1="' + ix + '" y1="' + iy + '" x2="' + (hx - 15) + '" y2="' + hy + '" stroke="' + c + '" stroke-width="2" opacity=".75"/>';
      for (const [hx, hy] of H3) b += '<line x1="' + (hx + 15) + '" y1="' + hy + '" x2="' + (Z[0] - 17) + '" y2="' + Z[1] + '" stroke="#c99400" stroke-width="2.6"/>';
      for (const [ix, iy, l] of ins) b += '<circle cx="' + ix + '" cy="' + iy + '" r="4.5" fill="var(--ink)"/>' + T(ix - 8, iy + 4.5, l, { a: 'end', size: 12 });
      for (const [hx, hy, l, c] of H3) b += '<circle cx="' + hx + '" cy="' + hy + '" r="15" fill="var(--surface)" stroke="' + c + '" stroke-width="2.6"/>' + T(hx, hy + 5, l, { size: 14, w: 700, col: c });
      b += '<circle cx="' + Z[0] + '" cy="' + Z[1] + '" r="17" fill="var(--surface)" stroke="#c99400" stroke-width="2.6"/>' + T(Z[0], Z[1] + 5.5, 'Σ', { size: 15, w: 700 });
      b += '<line x1="' + (Z[0] + 17) + '" y1="' + Z[1] + '" x2="' + (Z[0] + 40) + '" y2="' + Z[1] + '" stroke="var(--ink)" stroke-width="2"/>' + arrowHead(Z[0] + 46, Z[1], 'var(--ink)');
      b += T(Z[0] + 30, Z[1] - 14, 'Zahl', { size: 12, w: 700 });
      b += T(400, 212, '4 Neuronen · 16 Werte · 8 Welten', { size: 12, w: 700, col: 'var(--ink-soft)' });
      return svg('0 0 560 230', b, 'Adelie-, Zügel- und Eselspinguin, daneben ein Netz mit drei versteckten Neuronen A, B, C und einem Zahl-Neuron');
    }
  };

  /* ── die vier Nest-Fälle (Level 6) ── */
  const CASES = [[1, 1, 0, 'keiner holt Futter'], [1, 0, 1, 'Papa fischt'], [0, 1, 1, 'Mama fischt'], [0, 0, 0, 'Ei kühlt aus']];
  function cases(x, y, w, h) {
    let b = '';
    const cw = (w - 8) / 2, ch = (h - 8) / 2;
    CASES.forEach(([m, p, ok, txt], i) => {
      const cx = x + (i % 2) * (cw + 8), cy = y + Math.floor(i / 2) * (ch + 8);
      b += '<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" rx="10" fill="var(--ice)" stroke="' + (ok ? GREEN : 'var(--line)') + '" stroke-width="' + (ok ? 2 : 1) + '"/>';
      const nx = cx + cw / 2, ny = cy + ch - 8;
      b += nestImg(nestKind(m, p), nx, ny, cw * 0.74);
      // wer fischt, ist weg: Welle mit Fisch auf seiner Seite (Papa links, Mama rechts – wie auf den Bildern)
      if (!p) b += wave(cx + 20, cy + ch * 0.42, 0.6) + fish(cx + 24, cy + ch * 0.42 + 10, 0.6);
      if (!m) b += wave(cx + cw - 22, cy + ch * 0.42, 0.6) + fish(cx + cw - 18, cy + ch * 0.42 + 10, 0.6);
      b += check(cx + cw - 14, cy + 14, ok, 0.9);
      b += T(nx, cy + 15, txt, { size: 10.5, col: 'var(--ink-soft)' });
    });
    return b;
  }

  /* ── kleine Bilder für Tabellen ── */
  function icon(kind, v) {
    if (kind === 'peng') return '<svg class="ic" viewBox="-34 -102 68 104" width="18" height="26" aria-hidden="true">' + peng({ sp: 'adelie', scarf: v }) + '</svg>';
    if (kind === 'away') return '<svg class="ic" viewBox="-20 -14 40 30" width="24" height="18" aria-hidden="true">' + wave(0, -4, 1) + fish(4, 10, 0.8) + '</svg>';
    if (kind === 'egg') {
      // v = 0…1: wie sicher „gut versorgt“; Farbe von grau nach grün
      const a = Math.max(0, Math.min(1, v));
      return '<svg class="ic" viewBox="-12 -16 24 31" width="15" height="20" aria-hidden="true">' +
        egg(0, 0, 1, 'rgba(18,163,122,' + (0.08 + a * 0.92).toFixed(3) + ')', 'var(--ink-soft)') + '</svg>';
    }
    if (kind === 'ok') return '<svg class="ic" viewBox="-11 -11 22 22" width="18" height="18" aria-hidden="true">' + check(0, 0, v, 1) + '</svg>';
    return '';
  }

  return { peng, head, nestImg, nestKind, icon, SP, IMG, scene: id => (SCENES[id] ? SCENES[id]() : '') };
})();
