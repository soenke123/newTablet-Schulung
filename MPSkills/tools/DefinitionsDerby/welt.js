/* ══════════════════════════════════════════════════════════════
   MPSkills — Definitions Derby  ·  welt.js  (window.DDWelt)
   ══════════════════════════════════════════════════════════════
   Die Insel, auf der die Wesen leben — eigene Welt, nicht mehr die
   von Balance of Nature (Sönke 27.10.2026: „vom Maßstab besser zu
   den Monstern, besondere Pflanzen, Plateaus statt richtiger
   Berge“). Alles ist in WESEN-GRÖSSEN gedacht: ein Wesen ist S = 100
   Einheiten hoch, eine Pflanze 0,6–1,8 S, ein Tafelberg 3–6 S breit,
   seine Felswand ½ S hoch. Die Insel wächst mit der Zahl der Wesen
   (build(seed, n)), damit Maßstab und Gedränge gleich bleiben.

   Aufbau:
     Felder auf einem Raster (CELL Einheiten): Höhe e (Küste bei 0),
     Tafelberge q1/q2 (zwei Stufen), Teiche, Wiesenfarbe. Daraus wird
     das Gelände EINMAL Pixel für Pixel auf eine Leinwand gerechnet
     (Kanten weich, Tafelberge 2,5-D: Deckfläche um die Wandhöhe
     nach oben versetzt, darunter die gestreifte Felswand).
     Pflanzen sind kleine Leinwände (plantSprite) und werden NICHT
     ins Gelände gemalt, sondern von tool.js zusammen mit den Wesen
     nach y sortiert gezeichnet — so steht ein Wesen auch mal hinter
     einem Riesenpilz.
     walk(x, y): darf ein Wesen hier stehen (Land, kein Teich, nicht
     auf/hinter einem Tafelberg).

   Nur Browser (Leinwand). Deterministisch je Seed (eigener Zufall).
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = 100;              // Wesen-Höhe in Welteinheiten
  const CELL = 10;
  const WALL = 64;            // Höhe einer Tafelberg-Stufe
  const MAX_PX = 2000;        // längste Seite der Gelände-Leinwand

  /* ─── Zufall und Rauschen ─── */
  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function noise2(seed) {
    const h = (x, y) => {
      let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
      const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  function fbm(seed, oct) {
    const ns = [];
    for (let i = 0; i < oct; i++) ns.push(noise2(seed + i * 1013));
    return (x, y) => {
      let v = 0, amp = 0.5, f = 1, tot = 0;
      for (let i = 0; i < oct; i++) { v += ns[i](x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
      return v / tot;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ─── Farben ─── */
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    deep: hex('#1f6f9a'), deep2: hex('#185c84'), lagoon: hex('#45c3c4'), foam: hex('#e9fbf6'),
    sand: hex('#f1dfa6'), sandWet: hex('#d9c27e'),
    grass1: hex('#79c35a'), grass2: hex('#4fa65a'), grass3: hex('#a6cf55'),
    top1: hex('#c3df72'), top2: hex('#dfe48a'), rim: hex('#f1f5b8'),
    wall1: hex('#d0855a'), wall2: hex('#b4643f'), wallDark: hex('#8a4a32'),
    pond: hex('#4bb7d6'), pondEdge: hex('#2e8fb3'), shade: hex('#2c5a2e')
  };
  const lerp3 = (o, a, t) => { o[0] += (a[0] - o[0]) * t; o[1] += (a[1] - o[1]) * t; o[2] += (a[2] - o[2]) * t; };

  /* ─── Felder ─── */
  function fields(seed, W, H) {
    const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;
    const nE = fbm(seed ^ 0x9e37, 4), nQ = fbm(seed ^ 0x51ed, 3), nP = fbm(seed ^ 0x2b7f, 3), nM = fbm(seed ^ 0x7a11, 3);
    const e = new Float32Array(cols * rows), q = new Float32Array(cols * rows), p = new Float32Array(cols * rows), m = new Float32Array(cols * rows);
    const cx = W / 2, cy = H / 2, rx = W * 0.39, ry = H * 0.37;
    const fE = 1 / 520, fQ = 1 / 430, fP = 1 / 300, fM = 1 / 380;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * CELL, y = j * CELL, k = j * cols + i;
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      const ev = (1 - d) * 0.9 + (nE(x * fE, y * fE) - 0.5) * 0.75;
      e[k] = ev;
      // Tafelberge nur im Inneren, nicht an der Küste
      q[k] = nQ(x * fQ, y * fQ) * sstep(0.18, 0.4, ev);
      // Teiche nicht an Tafelbergen (sonst liegt Wasser vor der Felswand)
      p[k] = (1 - nP(x * fP, y * fP)) * sstep(0.22, 0.4, ev) * (1 - sstep(0.5, 0.57, q[k]));
      m[k] = nM(x * fM, y * fM);
    }
    const at = arr => (x, y) => {
      const fx = clamp(x / CELL, 0, cols - 1.001), fy = clamp(y / CELL, 0, rows - 1.001);
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * cols + i;
      const a = arr[k], b = arr[k + 1], c = arr[k + cols], d = arr[k + cols + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    return { cols, rows, e: at(e), q: at(q), p: at(p), m: at(m) };
  }
  const Q1 = 0.6, Q2 = 0.7, PT = 0.74;   // Schwellen: Tafelberg 1/2, Teich

  /* ─── Gelände Pixel für Pixel ─── */
  function paint(F, W, H, seed) {
    const k = Math.min(1, MAX_PX / W, MAX_PX / H);
    const cw = Math.ceil(W * k), ch = Math.ceil(H * k);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const img = g.createImageData(cw, ch), D = img.data;
    const speck = noise2(seed ^ 0x3333);
    const aa = 1.4 / k;               // Kantenbreite in Welteinheiten (~1,4 Pixel)
    const col = [0, 0, 0];
    for (let py = 0; py < ch; py++) {
      const y = (py + 0.5) / k;
      for (let px = 0; px < cw; px++) {
        const x = (px + 0.5) / k;
        const e = F.e(x, y);
        // Meer
        col[0] = C.deep[0]; col[1] = C.deep[1]; col[2] = C.deep[2];
        const deepT = sstep(-0.2, -0.05, e);
        lerp3(col, C.lagoon, deepT);
        if (e > -0.1) {
          // Wellenkranz vor dem Strand
          const ring = Math.abs(e + 0.035);
          if (ring < 0.006) lerp3(col, C.foam, (1 - ring / 0.006) * 0.8);
        }
        if (e > -0.02) {
          const sand = sstep(-0.0012, 0.0012, e);
          const s = [C.sand[0], C.sand[1], C.sand[2]];
          lerp3(s, C.sandWet, 1 - sstep(0, 0.03, e));
          lerp3(col, s, sand);
          // Gras
          if (e > 0.04) {
            const gt = sstep(0.058, 0.062, e);
            const m = F.m(x, y);
            const gr = [C.grass1[0], C.grass1[1], C.grass1[2]];
            lerp3(gr, C.grass2, sstep(0.45, 0.62, m));
            lerp3(gr, C.grass3, sstep(0.6, 0.35, m) * 0.6);
            const sp = speck(x / 22, y / 22);
            gr[0] *= 0.94 + sp * 0.1; gr[1] *= 0.94 + sp * 0.1; gr[2] *= 0.94 + sp * 0.1;
            lerp3(col, gr, gt);
            // Teich
            const pv = F.p(x, y);
            if (pv > PT - 0.03) {
              const pond = [C.pond[0], C.pond[1], C.pond[2]];
              lerp3(pond, C.pondEdge, 1 - sstep(PT, PT + 0.05, pv));
              lerp3(col, pond, sstep(PT - 0.0015, PT + 0.0015, pv));
            }
            // Tafelberge (2,5-D): Schatten · Wand 1 · Deckel 1 · Wand 2 · Deckel 2
            if (e > 0.15) {
              const q0 = F.q(x, y);
              const qs = F.q(x - 22, y - 10);
              if (qs > Q1 && q0 < Q1) lerp3(col, C.shade, 0.25);
              level(x, y, 0, Q1, C.top1);
              level(x, y, WALL, Q2, C.top2);
            }
          }
        }
        const o = (py * cw + px) * 4;
        D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = 255;
      }
    }
    // Eine Stufe: Fußfläche = q > thr, um base nach oben versetzt; darüber die Wand bis zum Deckel.
    function level(x, y, base, thr, top) {
      const yb = y + base;
      const qa = F.q(x, yb), qb = F.q(x, yb + WALL * 0.5), qc = F.q(x, yb + WALL), qt = F.q(x, yb + WALL);
      // Wand: Fuß unter mir (bis WALL tiefer) liegt im Berg
      const E2 = 0.0012;
      const wallA = Math.max(sstep(thr - E2, thr + E2, qa), sstep(thr - E2, thr + E2, qb), sstep(thr - E2, thr + E2, qc));
      if (wallA > 0) {
        // Gesteinsschichten: waagerechte Streifen, unten dunkler
        const band = ((y / 13) % 2 + 2) % 2 < 1;
        const wcol = [band ? C.wall1[0] : C.wall2[0], band ? C.wall1[1] : C.wall2[1], band ? C.wall1[2] : C.wall2[2]];
        // wie weit unten in der Wand? 0 oben … 1 unten
        let depth = 0;
        for (let t = 0; t <= 1; t += 0.25) if (F.q(x, yb + WALL * t) > thr) { depth = 1 - t; break; }
        lerp3(wcol, C.wallDark, depth * 0.45);
        lerp3(col, wcol, wallA);
      }
      // Deckel: Fußfläche um WALL nach oben verschoben
      const topA = sstep(thr - E2, thr + E2, qt);
      if (topA > 0) {
        const tc = [top[0], top[1], top[2]];
        const sp = speck(x / 18 + 7, y / 18);
        tc[0] *= 0.95 + sp * 0.08; tc[1] *= 0.95 + sp * 0.08; tc[2] *= 0.95 + sp * 0.08;
        lerp3(tc, C.rim, 1 - sstep(thr, thr + 0.009, qt));     // heller Rand an der Kante
        lerp3(tc, C.wallDark, 1 - sstep(thr + 0.0012, thr + 0.0035, qt));   // dunkle Kantenlinie
        lerp3(col, tc, topA);
      }
    }
    g.putImageData(img, 0, 0);
    return { canvas: cv, k };
  }

  /* ─── Blümchen und Gräser direkt ins Gelände (klein, viele) ─── */
  function sprinkle(g, k, W, H, F, ok, r) {
    g.save();
    g.scale(k, k);
    const n = Math.round(W * H / 5200);
    const cols = ['#fff6d8', '#ffd1e3', '#ffe27a', '#c9b7ff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H;
      if (!ok(x, y)) continue;
      if (r() < 0.55) {
        // Grasbüschel
        g.strokeStyle = 'rgba(40,110,45,.55)'; g.lineWidth = 2.2; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x - 5, y); g.quadraticCurveTo(x - 6, y - 8, x - 9, y - 12);
        g.moveTo(x, y); g.lineTo(x + 1, y - 14);
        g.moveTo(x + 5, y); g.quadraticCurveTo(x + 6, y - 8, x + 10, y - 11);
        g.stroke();
      } else {
        const c = cols[Math.floor(r() * cols.length)];
        g.fillStyle = c;
        for (let j = 0; j < 5; j++) { const a = j / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, 3, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#f4b33a'; g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }

  /* ─── Besondere Pflanzen (je eine kleine Leinwand) ───
     Anker unten Mitte; Maße in Welteinheiten (S = 100). */
  const PLANTS = {
    pilz:     { w: 120, h: 130 },
    spirale:  { w: 130, h: 190 },
    kristall: { w: 90,  h: 90 },
    kolben:   { w: 80,  h: 120 },
    kugel:    { w: 90,  h: 72 },
    schirm:   { w: 190, h: 175 },
    blatt:    { w: 120, h: 95 }
  };
  const RES = 1.6;            // Pixel je Welteinheit in der Pflanzen-Leinwand
  function plantSprite(type, v) {
    const P = PLANTS[type];
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(P.w * RES); cv.height = Math.ceil(P.h * RES);
    const g = cv.getContext('2d');
    g.scale(RES, RES);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const W = P.w, H = P.h, cx = W / 2, by = H - 4;
    const line = '#3a2a2a';
    const out = (w) => { g.strokeStyle = line; g.lineWidth = w || 2.6; g.stroke(); };
    if (type === 'pilz') {
      const caps = ['#ec5f7c', '#f2973a', '#8f72e0', '#3fb6b0'];
      const cap = caps[v % caps.length];
      // zwei kleine dahinter, einer groß davor
      const one = (x, h, r, c) => {
        g.beginPath(); g.moveTo(x - r * 0.28, by); g.quadraticCurveTo(x - r * 0.2, by - h * 0.6, x - r * 0.22, by - h + r * 0.15);
        g.lineTo(x + r * 0.22, by - h + r * 0.15); g.quadraticCurveTo(x + r * 0.2, by - h * 0.6, x + r * 0.28, by); g.closePath();
        g.fillStyle = '#f6ecd6'; g.fill(); out(2.2);
        g.beginPath(); g.ellipse(x, by - h + r * 0.2, r, r * 0.72, 0, Math.PI, 0); g.quadraticCurveTo(x, by - h + r * 0.55, x - r, by - h + r * 0.2);
        g.fillStyle = c; g.fill(); out(2.4);
        g.fillStyle = 'rgba(255,255,255,.9)';
        [[-0.45, -0.3, 0.16], [0.1, -0.5, 0.13], [0.5, -0.2, 0.12], [-0.05, -0.12, 0.1]].forEach(([a, b, s]) => { g.beginPath(); g.arc(x + a * r, by - h + r * 0.2 + b * r * 0.72, s * r, 0, Math.PI * 2); g.fill(); });
      };
      one(cx - 30, 62, 20, cap);
      one(cx + 34, 48, 16, caps[(v + 1) % caps.length]);
      one(cx, 118, 44, cap);
    } else if (type === 'spirale') {
      const leaf = ['#2fa58a', '#5bbd4e', '#3f8fd0'][v % 3];
      g.beginPath(); g.moveTo(cx - 9, by); g.bezierCurveTo(cx - 14, by - 50, cx + 16, by - 70, cx + 2, by - 108);
      g.lineTo(cx + 12, by - 108); g.bezierCurveTo(cx + 28, by - 70, cx, by - 50, cx + 9, by); g.closePath();
      g.fillStyle = '#9a6a45'; g.fill(); out(2.4);
      const ky = by - 128;
      g.beginPath(); g.arc(cx + 6, ky, 54, 0, Math.PI * 2); g.fillStyle = leaf; g.fill(); out(2.8);
      // Spirale
      g.beginPath();
      for (let t = 0; t < 4.2 * Math.PI; t += 0.15) { const r = 4 + t * 3.6; const x = cx + 6 + Math.cos(t) * r, y = ky + Math.sin(t) * r; if (!t) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 5; g.stroke();
    } else if (type === 'kristall') {
      const cols = [['#9fe8ff', '#4fb3e8'], ['#e2b8ff', '#9a64e0'], ['#b8ffd8', '#3fbf8a']][v % 3];
      const cr = (x, h, w, tilt) => {
        g.save(); g.translate(x, by); g.rotate(tilt);
        g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h + w); g.lineTo(0, -h); g.lineTo(w, -h + w); g.lineTo(w, 0); g.closePath();
        const gr = g.createLinearGradient(-w, 0, w, 0); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
        g.fillStyle = gr; g.fill(); out(2.2);
        g.beginPath(); g.moveTo(0, -h); g.lineTo(0, -2); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.stroke();
        g.restore();
      };
      cr(cx - 20, 46, 10, -0.35); cr(cx + 22, 52, 11, 0.3); cr(cx, 80, 14, 0.02);
    } else if (type === 'kolben') {
      const glow = ['#ffe45c', '#ff9fd0', '#9ff0ff'][v % 3];
      [[-22, 70, -0.25], [20, 84, 0.2], [0, 104, 0]].forEach(([dx, h, a]) => {
        const tx = cx + dx + Math.sin(a) * h, ty = by - h;
        g.beginPath(); g.moveTo(cx + dx * 0.3, by); g.quadraticCurveTo(cx + dx, by - h * 0.5, tx, ty);
        g.strokeStyle = '#3f7d3a'; g.lineWidth = 4; g.stroke();
        const rg = g.createRadialGradient(tx, ty, 2, tx, ty, 20); rg.addColorStop(0, 'rgba(255,255,220,.9)'); rg.addColorStop(1, 'rgba(255,240,150,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(tx, ty, 20, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(tx, ty, 9, 12, 0, 0, Math.PI * 2); g.fillStyle = glow; g.fill(); out(2);
      });
      g.beginPath(); g.ellipse(cx, by - 4, 22, 8, 0, 0, Math.PI * 2); g.fillStyle = '#3f8f45'; g.fill(); out(2);
    } else if (type === 'kugel') {
      const bush = ['#3e9a52', '#2f8d6c', '#6aa83e'][v % 3], berry = ['#e84a5f', '#4a7be8', '#f5a623'][v % 3];
      [[-22, 30, 26], [22, 32, 24], [0, 44, 32]].forEach(([dx, h, r]) => { g.beginPath(); g.arc(cx + dx, by - h + 6, r, 0, Math.PI * 2); g.fillStyle = bush; g.fill(); out(2.4); });
      g.fillStyle = berry;
      [[-26, -30], [-8, -52], [12, -40], [28, -24], [-2, -26], [18, -58]].forEach(([dx, dy]) => { g.beginPath(); g.arc(cx + dx, by + dy, 4.5, 0, Math.PI * 2); g.fill(); });
    } else if (type === 'schirm') {
      const crown = ['#9b6fd6', '#e0709e', '#4fb0a0'][v % 3];
      g.beginPath(); g.moveTo(cx - 8, by); g.quadraticCurveTo(cx - 4, by - 70, cx - 18, by - 120); g.lineTo(cx - 6, by - 122);
      g.quadraticCurveTo(cx + 8, by - 70, cx + 8, by); g.closePath(); g.fillStyle = '#8a5a3c'; g.fill(); out(2.4);
      g.beginPath(); g.moveTo(cx - 4, by - 100); g.quadraticCurveTo(cx + 20, by - 112, cx + 34, by - 126); g.strokeStyle = '#8a5a3c'; g.lineWidth = 6; g.stroke();
      g.beginPath(); g.ellipse(cx, by - 132, 86, 26, 0, 0, Math.PI * 2); g.fillStyle = crown; g.fill(); out(2.8);
      g.beginPath(); g.ellipse(cx - 10, by - 140, 54, 12, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
    } else if (type === 'blatt') {
      const lc = ['#4fb84a', '#2f9e7a', '#7ab83a'][v % 3];
      [[-0.9, 70], [-0.45, 84], [0, 90], [0.45, 84], [0.9, 70]].forEach(([a, l]) => {
        g.save(); g.translate(cx, by); g.rotate(a);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-22, -l * 0.55, 0, -l); g.quadraticCurveTo(22, -l * 0.55, 0, 0);
        g.fillStyle = lc; g.fill(); out(2.2);
        g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -l + 8); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; g.stroke();
        g.restore();
      });
    }
    return { canvas: cv, w: P.w, h: P.h };
  }

  /* ─── Welt bauen ─── */
  function build(seed, nWesen) {
    const land = Math.max(1.3e6, (nWesen || 1) * 1.1e5);
    const W = Math.round(Math.min(6000, Math.sqrt(land / 0.42 * 1.5)));
    const H = Math.round(W / 1.5);
    const F = fields(seed, W, H);
    const r = rngOf(seed ^ 0xa5a5);
    const t0 = Date.now();
    const terr = paint(F, W, H, seed);

    const isPlateau = (x, y) => F.q(x, y) > Q1 - 0.02;
    const ground = (x, y) => F.e(x, y) > 0.07 && F.p(x, y) < PT - 0.02 && !isPlateau(x, y);
    // Wesen: auf dem Boden, nicht dicht unter einer Felswand (wo ihr Bild über den Deckel ragt)
    const walk = (x, y) => {
      if (x < 0 || y < 0 || x > W || y > H) return false;
      if (!ground(x, y) || F.e(x, y) < 0.09) return false;
      for (let t = 0; t <= WALL * 2 + 30; t += 20) if (isPlateau(x, y + t) || isPlateau(x - 30, y + t) || isPlateau(x + 30, y + t)) return false;
      return isPlateau(x, y - 16) ? false : true;
    };
    sprinkle(terr.canvas.getContext('2d'), terr.k, W, H, F, (x, y) => ground(x, y) && F.e(x, y) > 0.09, rngOf(seed ^ 0x1234));

    // Pflanzen in Hainen: welche Art, entscheidet ein grobes Rauschen
    const zone = noise2(seed ^ 0x4444);
    const TYPES = ['pilz', 'spirale', 'kristall', 'kolben', 'kugel', 'schirm', 'blatt'];
    const sprites = {};
    const sprite = (t, v) => sprites[t + v] || (sprites[t + v] = plantSprite(t, v));
    const plants = [];
    const tries = Math.round(W * H / 6000);
    for (let i = 0; i < tries; i++) {
      const x = 60 + r() * (W - 120), y = 60 + r() * (H - 120);
      const onTop = F.q(x, y) > Q1 + 0.03 && F.q(x, y) < Q2 - 0.01;   // auf dem unteren Tafelberg
      if (!onTop && !(ground(x, y) && F.e(x, y) > 0.1)) continue;
      if (!onTop && F.q(x, y + 40) > Q1 - 0.03) continue;              // nicht an die Felswand kleben
      if (plants.some(p => (p.x - x) ** 2 + ((p.y - y) * 1.5) ** 2 < 190 * 190)) continue;
      // Rauschen liegt meist um 0,5: gestreckt und umgebrochen, damit alle Arten vorkommen, in Hainen
      const z = zone(x / 650, y / 650);
      const t = TYPES[Math.floor(z * 13) % TYPES.length];
      const v = Math.floor(r() * 3);
      const s = 0.65 + r() * 0.35;
      plants.push({ x, y, lift: onTop ? WALL : 0, sp: sprite(t, v), s, flip: r() < 0.5, type: t });
    }
    plants.sort((a, b) => a.y - b.y);
    // Wohnplätze der Familien: begehbar und eher im Inneren
    const homes = [];
    for (let i = 0; i < 4000 && homes.length < 400; i++) {
      const x = r() * W, y = r() * H;
      if (F.e(x, y) > 0.25 && walk(x, y)) homes.push({ x, y });
    }
    // Rahmen der Insel (für „ganze Insel“)
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 20) for (let x = 0; x < W; x += 20) if (F.e(x, y) > -0.03) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = 60;
    return {
      width: W, height: H, S, terrain: terr.canvas, walk, homes, plants,
      sea: 'rgb(' + C.deep.join(',') + ')', ms: Date.now() - t0,
      bbox: { x: x0 - pad, y: y0 - pad - WALL * 2, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad + WALL * 2 }
    };
  }

  global.DDWelt = { build, S, PLANTS };
})(typeof window !== 'undefined' ? window : globalThis);
