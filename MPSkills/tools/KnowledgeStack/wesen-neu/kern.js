/* ══════════════════════════════════════════════════════════════
   Knowledge Stack — Wesen, Fassung 3 (Entwurf, November 2026)
   kern.js: Gesichts-Baukasten + Register
   ══════════════════════════════════════════════════════════════

   Nur für showroom-wesen-neu.html. Das Quiz benutzt weiter
   creatures.js (Fassung 2).

   Was anders ist als in Fassung 2: dort hatten fast alle Wesen
   dasselbe Gesicht (zwei schwarze Punkte, kleiner Mund, rosa
   Wangen). Hier hat jedes Wesen einen TYP („Der Lässige“, „Die
   Überdrehte“ …), und den sieht man:

     * Augen mit Augapfel und Pupille — die Pupille schaut irgendwohin
       und wandert in Ruhe (Klasse .pp, Bewegung in wesen.css)
     * Lider (müde, grimmig, lässig) und Brauen, auch ungleich
     * viele Münder: schiefes Grinsen, Zähne, Reißzahn, Zunge,
       Schmollmund … (mund())
     * je Wesen eine eigene Kleinigkeit in Ruhe (Kaugummi-Blase,
       Gähnen, Antenne zuckt …)

   Das Skelett bleibt das von creatures.js (KSCreatures.buildDef):
   darum laufen alle Emotes, Gehen, Hinfallen und Aufstehen aus
   creatures.css ohne Änderung. Die Klassen im Gesicht heißen gleich
   (e-open, e-happy, e-sleep, e-sad, e-dizzy, m-normal, m-open, m-sad,
   m-sleep, m-wow, cr-tears). Neu ist nur .brw (Brauen im offenen
   Zustand) und .pp (Pupille).

   Ein Wesen anlegen (wesen-0.js …):
     KSWesenNeu.add(id, { typ, spruch, o, behind, legL, legR, body,
                          head, back, armL, armR, front, fx, vars })
   Farben: --c1 … --c6 aus farben.js (dieselben wie Fassung 2).
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const K = window.KSCreatures;
  const { INK, P, E, C, R, L, G, hl } = K.kit;
  const n = v => Math.round(v * 100) / 100;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const MOUTH = '#3a1220', TONGUE = '#ff6f91';

  /* Oberlid: der Teil der Augen-Ellipse über einer (schrägen) Sehne.
     amt 0…1 = wie weit zu, tilt > 0 = innen tiefer (grimmig),
     tilt < 0 = außen tiefer (müde, traurig). side: +1 linkes Auge. */
  function lidPath(x, y, rx, ry, amt, tilt, side) {
    const A = Math.asin(Math.max(-0.98, Math.min(0.98, 1 - 2 * amt)));
    const t = (tilt || 0) * Math.PI / 180 * (side || 1);
    const al = Math.max(-1.45, Math.min(1.45, A + t)), ar = Math.max(-1.45, Math.min(1.45, A - t));
    const large = (Math.PI - al - ar) > Math.PI ? 1 : 0;
    return 'M ' + n(x - rx * Math.cos(al)) + ' ' + n(y - ry * Math.sin(al))
      + ' A ' + n(rx) + ' ' + n(ry) + ' 0 ' + large + ' 1 ' + n(x + rx * Math.cos(ar)) + ' ' + n(y - ry * Math.sin(ar)) + ' Z';
  }

  /* ── Münder ──────────────────────────────────────────────────
     f.m  smile · smirk · grin · cat · line · frown · o · fang ·
          buck · tongue · zig · wavy · pout · none
     f.ms Seite (+1 rechts, −1 links) für smirk, fang, tongue
     f.teeth  obere Zahnreihe im offenen Mund
     f.mouths { normal, open, sad, sleep, wow } ersetzt einzelne   */
  function mund(f) {
    if (f.my === undefined && !f.mouths) return '';
    const mx = f.mx || 50, my = f.my || 0, w = f.mw || 5, s = f.ms || 1, mc = f.mc || INK, lw = f.mlw || 2.4, mf = f.mf || MOUTH;
    const smile = 'M ' + n(mx - w) + ' ' + my + ' Q ' + mx + ' ' + n(my + w * 0.9) + ' ' + n(mx + w) + ' ' + my;
    const N = {
      smile: () => L(smile, mc, lw),
      smirk: () => L('M ' + n(mx - s * w) + ' ' + n(my + w * 0.15) + ' Q ' + n(mx + s * w * 0.25) + ' ' + n(my + w * 0.7) + ' ' + n(mx + s * w) + ' ' + n(my - w * 0.45), mc, lw)
        + L('M ' + n(mx + s * (w - 0.8)) + ' ' + n(my - w * 0.9) + ' Q ' + n(mx + s * (w + 1.4)) + ' ' + n(my - w * 0.5) + ' ' + n(mx + s * (w + 0.1)) + ' ' + n(my + 0.2), mc, 1.6),
      grin: () => P('M ' + n(mx - w) + ' ' + n(my - w * 0.25) + ' Q ' + mx + ' ' + n(my + w * 0.2) + ' ' + n(mx + w) + ' ' + n(my - w * 0.25)
          + ' Q ' + n(mx + w * 0.85) + ' ' + n(my + w * 0.95) + ' ' + mx + ' ' + n(my + w * 0.95) + ' Q ' + n(mx - w * 0.85) + ' ' + n(my + w * 0.95) + ' ' + n(mx - w) + ' ' + n(my - w * 0.25) + ' Z', '#fff', 2.2)
        + L('M ' + n(mx - w * 0.36) + ' ' + n(my + 0.1) + ' L ' + n(mx - w * 0.34) + ' ' + n(my + w * 0.9) + ' M ' + n(mx + w * 0.36) + ' ' + n(my + 0.1) + ' L ' + n(mx + w * 0.34) + ' ' + n(my + w * 0.9) + ' M ' + mx + ' ' + n(my + 0.2) + ' L ' + mx + ' ' + n(my + w * 0.95), mc, 1),
      cat: () => L('M ' + n(mx - w) + ' ' + my + ' Q ' + n(mx - w / 2) + ' ' + n(my + w * 0.8) + ' ' + mx + ' ' + my + ' Q ' + n(mx + w / 2) + ' ' + n(my + w * 0.8) + ' ' + n(mx + w) + ' ' + my, mc, lw),
      line: () => L('M ' + n(mx - w) + ' ' + my + ' L ' + n(mx + w) + ' ' + my, mc, lw),
      frown: () => L('M ' + n(mx - w) + ' ' + n(my + w * 0.45) + ' Q ' + mx + ' ' + n(my - w * 0.45) + ' ' + n(mx + w) + ' ' + n(my + w * 0.45), mc, lw),
      o: () => E(mx, my, w * 0.5, w * 0.6, mf, 1.8),
      fang: () => L(smile, mc, lw) + P('M ' + n(mx + s * w * 0.25) + ' ' + n(my + w * 0.42) + ' L ' + n(mx + s * w * 0.5) + ' ' + n(my + w * 1.15) + ' L ' + n(mx + s * w * 0.72) + ' ' + n(my + w * 0.26) + ' Z', '#fff', 1.2),
      buck: () => L(smile, mc, lw) + R(n(mx - w * 0.42), n(my + w * 0.3), n(w * 0.84), n(w * 0.75), 0.8, '#fff', 1.4) + L('M ' + mx + ' ' + n(my + w * 0.4) + ' L ' + mx + ' ' + n(my + w * 1.02), mc, 0.9),
      tongue: () => L(smile, mc, lw) + E(n(mx + s * w * 0.42), n(my + w * 0.82), n(w * 0.36), n(w * 0.5), TONGUE, 1.6, 'transform="rotate(' + (-s * 18) + ' ' + n(mx + s * w * 0.42) + ' ' + n(my + w * 0.5) + ')"'),
      zig: () => L('M ' + n(mx - w) + ' ' + my + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.35) + ' l ' + n(w * 0.4) + ' ' + n(w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(w * 0.5) + ' l ' + n(w * 0.4) + ' ' + n(-w * 0.35), mc, lw - 0.4),
      wavy: () => L('M ' + n(mx - w) + ' ' + my + ' q ' + n(w * 0.25) + ' ' + n(-w * 0.45) + ' ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0 t ' + n(w * 0.5) + ' 0', mc, lw - 0.4),
      pout: () => L('M ' + n(mx - w * 0.6) + ' ' + n(my + w * 0.3) + ' Q ' + mx + ' ' + n(my - w * 0.5) + ' ' + n(mx + w * 0.6) + ' ' + n(my + w * 0.3), mc, lw)
        + L('M ' + n(mx - w * 0.25) + ' ' + n(my + w * 0.75) + ' L ' + n(mx + w * 0.25) + ' ' + n(my + w * 0.75), mc, 1.4),
      none: () => ''
    };
    const fangOpen = f.m === 'fang'
      ? P('M ' + n(mx + s * w * 0.25) + ' ' + n(my - 0.2) + ' L ' + n(mx + s * w * 0.48) + ' ' + n(my + w * 0.75) + ' L ' + n(mx + s * w * 0.7) + ' ' + n(my - 0.3) + ' Z', '#fff', 1) : '';
    const std = {
      normal: (N[f.m] || N.smile)(),
      open: P('M ' + n(mx - w) + ' ' + n(my - 0.6) + ' Q ' + mx + ' ' + n(my + w * 1.75) + ' ' + n(mx + w) + ' ' + n(my - 0.6) + ' Z', mf, 2.2)
        + E(mx, n(my + w * 0.86), n(w * 0.48), n(w * 0.32), TONGUE, 0)
        + (f.teeth ? P('M ' + n(mx - w * 0.62) + ' ' + n(my - 0.4) + ' L ' + n(mx + w * 0.62) + ' ' + n(my - 0.4) + ' L ' + n(mx + w * 0.5) + ' ' + n(my + w * 0.32) + ' L ' + n(mx - w * 0.5) + ' ' + n(my + w * 0.32) + ' Z', '#fff', 1) : '')
        + (f.m === 'buck' ? R(n(mx - w * 0.4), n(my - 0.3), n(w * 0.8), n(w * 0.6), 0.7, '#fff', 1.2) : '')
        + fangOpen,
      sad: L('M ' + n(mx - w * 0.8) + ' ' + n(my + w * 0.55) + ' Q ' + mx + ' ' + n(my - w * 0.45) + ' ' + n(mx + w * 0.8) + ' ' + n(my + w * 0.55), mc, lw),
      sleep: E(mx, my + 0.8, 1.6, 2, mf, 0),
      wow: E(mx, my + 1, 2.4, 3, mf, 1.6)
    };
    const o = Object.assign(std, f.mouths || {});
    return ['normal', 'open', 'sad', 'sleep', 'wow'].map(k => '<g class="m-' + k + '">' + o[k] + '</g>').join('');
  }

  /* ── Gesicht ─────────────────────────────────────────────────
     x [lx, rx] oder [cx] · y · r (Zahl oder [rl, rr]) · ex Breite
     t     'w' Augapfel + Pupille (Standard) · 'dot' Knopfauge ·
           'glow' glühend (col) · 'px' Pixelbalken (col) ·
           'arc' zufrieden geschlossen · 'btn' Knöpfe (bcols)
     p     Pupillengröße (Anteil von r) · iris Farbe · sc Augapfel
     look  [dx, dy] in r — wohin die Pupille schaut (auch je Auge)
     lookc Klasse der Pupille (lk-lr, lk-up, lk-roll … wesen.css)
     lid   [zu 0…1, Neigung°] (auch je Auge) · lidc Lidfarbe
     lash  Wimpern · bags Augenringe (Farbe)
     brow  { dy, a (Neigung, auch [l, r]), l, w, c, up [l, r], only }
     happy 'arc' ^ ^ (Standard) · 'gt' > <
     blush Farbe | false · pre/extra/post eigene Teile             */
  function gesicht(f) {
    const xs = f.x, one = xs.length === 1;
    const rr = i => Array.isArray(f.r) ? f.r[i] : (f.r || 6);
    const yy = i => Array.isArray(f.y) ? f.y[i] : f.y;
    const ex = f.ex || 0.88, t = f.t || 'w', col = f.col || INK;
    const side = i => one ? 1 : (i === 0 ? 1 : -1);
    const per = (v, i) => (Array.isArray(v) && Array.isArray(v[0])) ? v[i] : v;
    const lkc = i => Array.isArray(f.lookc) ? f.lookc[i] : (f.lookc || '');
    const out = [];

    const lid = (x, i, amt, tilt) => P(lidPath(x, yy(i), rr(i) * ex + 0.25, rr(i) + 0.25, amt, tilt, side(i)), f.lidc || 'var(--c1)', 2.2);

    const open = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, lk = per(f.look, i) || [0, 0];
      let s = '';
      if (t === 'w') {
        const pr = r * (f.p || 0.5), ir = f.iris ? Math.min(pr * 1.6, r - 0.9) : pr;
        const px = n(x + clamp(lk[0] * r, Math.max(0, rx - ir - 0.5))), py = n(y + clamp(lk[1] * r, Math.max(0, r - ir - 0.5)));
        s += E(x, y, n(rx), r, f.sc || '#fff', 2.2)
          + '<g class="pp ' + lkc(i) + '">' + (f.iris ? C(px, py, n(ir), f.iris, 0) : '') + C(px, py, n(pr), f.pc || INK, 0, 'class="pupil"')
          + hl(n(px - pr * 0.36), n(py - pr * 0.42), n(Math.max(0.8, pr * 0.4)), 0.95) + '</g>';
      } else if (t === 'dot') {
        s += '<g class="pp ' + lkc(i) + '">' + E(x, y, n(rx * 0.9), r, f.pc || INK, 0)
          + hl(n(x - rx * 0.3), n(y - r * 0.38), n(r * 0.34), 0.95) + hl(n(x + rx * 0.3), n(y + r * 0.4), n(r * 0.15), 0.85) + '</g>';
      } else if (t === 'glow') {
        s += E(x, y, n(r * 1.25), n(r * 1.45), col, 0, 'opacity=".3" class="glow"') + E(x, y, n(r * 0.8), r, col, 0)
          + '<g class="pp ' + lkc(i) + '">' + E(n(x + lk[0] * r), n(y + lk[1] * r), n(r * 0.3), n(r * 0.5), f.pc || '#fff', 0) + '</g>';
      } else if (t === 'btn') {
        const bc = (f.bcols || ['#fff', '#fff'])[i] || '#fff', h = r * 0.3;
        s += C(x, y, r, bc, 2.4) + C(x, y, n(r * 0.68), 'none', 0.9, 'stroke="' + INK + '" stroke-opacity=".3"')
          + [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(q => C(n(x + q[0] * h), n(y + q[1] * h), n(Math.max(0.7, r * 0.13)), INK, 0)).join('')
          + L(i ? 'M ' + n(x - h) + ' ' + n(y - h) + ' L ' + n(x + h) + ' ' + n(y + h) + ' M ' + n(x + h) + ' ' + n(y - h) + ' L ' + n(x - h) + ' ' + n(y + h)
                : 'M ' + n(x - h) + ' ' + n(y - h) + ' L ' + n(x + h) + ' ' + n(y - h) + ' M ' + n(x - h) + ' ' + n(y + h) + ' L ' + n(x + h) + ' ' + n(y + h), f.thread || '#fff', 1.1)
          + hl(n(x - r * 0.5), n(y - r * 0.55), n(r * 0.16), 0.9);
      } else if (t === 'arc') {
        s += L('M ' + n(x - rx) + ' ' + n(y + r * 0.3) + ' Q ' + x + ' ' + n(y - r * 1.1) + ' ' + n(x + rx) + ' ' + n(y + r * 0.3), col, 2.8);
      } else if (t === 'px') {
        s += R(n(x - r * 0.95), n(y - r * 1.35), n(r * 1.9), n(r * 2.7), n(r * 0.7), col, 0, 'opacity=".28"')
          + R(n(x - r * 0.6), n(y - r), n(r * 1.2), n(r * 2), n(r * 0.4), col, 0)
          + R(n(x - r * 0.38), n(y - r * 0.75), n(r * 0.4), n(r * 0.55), 0.4, '#fff', 0, 'opacity=".8"');
      }
      const ld = per(f.lid, i);
      if (ld && (t === 'w' || t === 'dot')) s += lid(x, i, ld[0], ld[1]);
      if (f.lash) {
        const o = -side(i) * (one ? 0 : 1);
        s += L('M ' + n(x + o * rx * 0.72) + ' ' + n(y - r * 0.7) + ' l ' + n(o * 2.6) + ' -2.4 M ' + n(x + o * rx * 0.98) + ' ' + n(y - r * 0.25) + ' l ' + n(o * 3) + ' -1.2', INK, 1.5);
      }
      if (f.bags) s += L('M ' + n(x - rx * 0.75) + ' ' + n(y + r + 1.6) + ' Q ' + x + ' ' + n(y + r + 3.2) + ' ' + n(x + rx * 0.75) + ' ' + n(y + r + 1.6), f.bags, 1.5, 'opacity=".7"');
      return s;
    };
    const lw = 2.8;
    const happy = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, s = side(i);
      if (f.happy === 'gt') return L('M ' + n(x - s * rx * 0.85) + ' ' + n(y - r * 0.65) + ' L ' + n(x + s * rx * 0.7) + ' ' + y + ' L ' + n(x - s * rx * 0.85) + ' ' + n(y + r * 0.65), col, lw);
      return L('M ' + n(x - rx) + ' ' + n(y + r * 0.3) + ' Q ' + x + ' ' + n(y - r * 1.1) + ' ' + n(x + rx) + ' ' + n(y + r * 0.3), col, lw);
    };
    const sleep = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex;
      return L('M ' + n(x - rx) + ' ' + y + ' Q ' + x + ' ' + n(y + r * 0.8) + ' ' + n(x + rx) + ' ' + y, col, lw)
        + (f.lash ? L('M ' + n(x - rx * 0.5) + ' ' + n(y + r * 0.5) + ' l -1 2.2 M ' + n(x + rx * 0.5) + ' ' + n(y + r * 0.5) + ' l 1 2.2', col, 1.4) : '');
    };
    const sad = (x, i) => {
      const r = rr(i), y = yy(i), rx = r * ex, s = side(i);
      let e;
      if (t === 'glow' || t === 'px') e = R(n(x - r * 0.6), n(y - r * 0.2), n(r * 1.2), n(r * 1.05), n(r * 0.4), col, 0);
      else if (t === 'dot' || t === 'arc' || t === 'btn') e = E(x, n(y + r * 0.15), n(rx * 0.8), n(r * 0.9), INK, 0) + hl(n(x - rx * 0.25), n(y - r * 0.2), n(r * 0.42), 0.95) + hl(n(x + rx * 0.3), n(y + r * 0.45), n(r * 0.2), 0.85);
      else {
        const pr = r * 0.56;
        e = E(x, y, n(rx), r, f.sc || '#fff', 2.2) + (f.iris ? C(x, n(y + r * 0.3), n(Math.min(pr * 1.4, r - 0.9)), f.iris, 0) : '') + C(x, n(y + r * 0.3), n(pr), f.pc || INK, 0)
          + hl(n(x - pr * 0.4), n(y + r * 0.08), n(pr * 0.5), 0.95) + hl(n(x + pr * 0.42), n(y + r * 0.55), n(pr * 0.26), 0.9)
          + lid(x, i, 0.3, -20);
      }
      return e + L('M ' + n(x - s * rx * 1.0) + ' ' + n(y - r * 1.25) + ' L ' + n(x + s * rx * 0.8) + ' ' + n(y - r * 1.85), col, 2.2);
    };
    const dizzy = (x, i) => {
      const s = rr(i) / 3.4, y = yy(i);
      return L('M ' + n(x - 0.5 * s) + ' ' + y + ' a ' + n(0.5 * s) + ' ' + n(0.5 * s) + ' 0 1 1 ' + n(s) + ' 0'
        + ' a ' + n(1.25 * s) + ' ' + n(1.25 * s) + ' 0 1 1 ' + n(-2.5 * s) + ' 0'
        + ' a ' + n(2 * s) + ' ' + n(2 * s) + ' 0 1 1 ' + n(4 * s) + ' 0'
        + ' a ' + n(2.75 * s) + ' ' + n(2.75 * s) + ' 0 1 1 ' + n(-5.5 * s) + ' 0', col, 1.6);
    };

    if (f.pre) out.push(f.pre);
    out.push('<g class="e-open">' + xs.map(open).join('') + '</g>');
    out.push('<g class="e-happy">' + xs.map(happy).join('') + '</g>');
    out.push('<g class="e-sleep">' + xs.map(sleep).join('') + '</g>');
    out.push('<g class="e-sad">' + xs.map(sad).join('') + '</g>');
    out.push('<g class="e-dizzy">' + xs.map(dizzy).join('') + '</g>');

    if (f.brow) {
      const b = f.brow;
      out.push('<g class="brw">' + xs.map((x, i) => {
        if (b.only !== undefined && b.only !== i) return '';
        const r = rr(i), s = side(i), a = (Array.isArray(b.a) ? b.a[i] : (b.a || 0)) * Math.PI / 180;
        const l = b.l || r * 0.95, cy = yy(i) - r - (b.dy === undefined ? 2.4 : b.dy) + (b.up ? b.up[i] : 0);
        const dy = l * Math.tan(a);
        return L('M ' + n(x - s * l) + ' ' + n(cy - dy) + ' Q ' + x + ' ' + n(cy - (b.k === undefined ? 1 : b.k)) + ' ' + n(x + s * l) + ' ' + n(cy + dy), b.c || INK, b.w || 2.6);
      }).join('') + '</g>');
    }

    if (f.blush !== false) {
      const r0 = rr(0), by = f.by || (yy(0) + r0 + 3.4);
      const bx = f.bx || (one ? [xs[0] - r0 * 1.35, xs[0] + r0 * 1.35] : [xs[0] - r0 * 0.55, xs[1] + rr(1) * 0.55]);
      out.push(bx.map(x => E(n(x), n(by), f.bw || 3.8, f.bh || 2.2, f.blush || '#ff6f9f', 0, 'opacity=".5"')).join(''));
    }
    if (f.extra) out.push(f.extra);
    out.push(mund(f));
    if (f.post) out.push(f.post);

    out.push('<g class="cr-tears">' + xs.map((x, i) => {
      const tx = n(x + rr(i) * 0.35 * side(i) * -1), ty = n(yy(i) + rr(i) + 0.5);
      return P('M ' + tx + ' ' + ty + ' C ' + n(tx - 2.3) + ' ' + n(ty + 3.6) + ' ' + n(tx - 2.3) + ' ' + n(ty + 5.6) + ' ' + tx + ' ' + n(ty + 5.6)
        + ' C ' + n(tx + 2.3) + ' ' + n(ty + 5.6) + ' ' + n(tx + 2.3) + ' ' + n(ty + 3.6) + ' ' + tx + ' ' + ty + ' Z', '#6cc8ff', 0,
        'stroke="#2b7bd6" stroke-width=".8" class="tear" style="animation-delay:' + (i * 0.45) + 's"');
    }).join('') + '</g>');

    return '<g class="face">' + out.join('') + '</g>';
  }

  /* ── Register ───────────────────────────────────────────────── */
  const DEFS = [];
  const FARBEN = window.KSWesenFarben || [];
  function add(id, def) {
    def.pal = def.pal || FARBEN[id];
    DEFS[id] = def;
  }
  function svg(id, skinIdx, emoteClass, sizePx) {
    const cid = parseInt(id || 0, 10), d = DEFS[cid];
    if (!d) return K.svg(cid, skinIdx, emoteClass, sizePx);
    return K.buildDef(d, parseInt(skinIdx || 0, 10), emoteClass, sizePx, cid, K.list[cid].gruppe);
  }

  window.KSWesenNeu = {
    list: K.list, add: add, svg: svg, cls: K.cls, moveNames: K.moveNames,
    has: id => !!DEFS[id],
    info: id => DEFS[id] ? { typ: DEFS[id].typ || '', spruch: DEFS[id].spruch || '' } : { typ: '', spruch: '' },
    kit: Object.assign({}, K.kit, { gesicht, mund, lidPath, MOUTH, TONGUE })
  };
})();
