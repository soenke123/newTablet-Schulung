/* ══════════════════════════════════════════════════════════════
   MPSkills — How to Fachbegriffe  ·  welt.js  (window.DDWelt)
   ══════════════════════════════════════════════════════════════
   Die Insel, auf der die Wesen leben — eigene Welt, nicht mehr die
   von Balance of Nature (Sönke 27.10.2026: „vom Maßstab besser zu
   den Monstern, besondere Pflanzen, Plateaus statt richtiger
   Berge“; danach: „wirkt noch lieblos und etwas kindisch“ → gemalt
   statt Clipart: Licht von links oben, keine schwarzen Umrisse,
   gedämpfte Farben, jede Pflanze etwas anders).

   Alles ist in WESEN-GRÖSSEN gedacht: ein Wesen ist S = 100
   Einheiten hoch, eine Pflanze ~0,7–2 S, ein Tafelberg 3–6 S breit,
   seine Felswand ⅔ S hoch. Die Insel wächst mit der Zahl der Wesen
   (build(seed, n)), damit Maßstab und Gedränge gleich bleiben.

   Aufbau:
     Felder auf einem Raster (CELL Einheiten): Höhe e (Küste bei 0),
     Tafelberge q (zwei Stufen), Teiche, Wiesenfarbe. Daraus wird das
     Gelände EINMAL Pixel für Pixel auf eine Leinwand gerechnet:
     Licht aus der Neigung von e, Tafelberge 2,5-D (Deckfläche um die
     Wandhöhe nach oben versetzt, darunter die Felswand mit Schichten
     und Rissen, seitlich beleuchtet, Schatten am Fuß).
     Pflanzen sind kleine Leinwände (plantSprite, je Art 6 Varianten
     mit eigenem Zufall) und werden NICHT ins Gelände gemalt, sondern
     von tool.js zusammen mit den Wesen nach y sortiert gezeichnet —
     so steht ein Wesen auch mal hinter einem Riesenpilz.
     walk(x, y): darf ein Wesen hier stehen (Land, kein Teich, nicht
     auf/hinter einem Tafelberg). depth(x, y): Wasser für die Schwimmer.

   Nur Browser (Leinwand). Deterministisch je Seed (eigener Zufall).
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const S = 100;              // Wesen-Höhe in Welteinheiten
  const CELL = 10;
  const WALL = 64;            // Höhe einer Tafelberg-Stufe
  const MAX_PX = 1500;        // längste Seite der Gelände-Leinwand

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

  /* ─── Farben (gedämpft, warm) ─── */
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const C = {
    deep: hex('#1d5f7f'), deepFar: hex('#174d69'), lagoon: hex('#3fa9a8'), lagoonLight: hex('#7cc9bb'), foam: hex('#eef8f0'),
    sand: hex('#e8d4a2'), sandDark: hex('#d4bb82'), sandWet: hex('#bfa776'),
    grass1: hex('#78a84f'), grass2: hex('#5a9147'), grass3: hex('#9bb75a'), grassDry: hex('#b4b964'),
    top1: hex('#86b04c'), top2: hex('#97bb55'), lip: hex('#c9b48a'), topRim: hex('#4f7f3a'),
    wallLight: hex('#cf9a6b'), wall: hex('#b07650'), wallDark: hex('#7e4f37'), crack: hex('#5e3a2a'),
    pond: hex('#3e93a6'), pondDeep: hex('#2c6f86'), pondEdge: hex('#7fb7a3'),
    shade: hex('#2d4a2a'), sun: hex('#fff3c8')
  };
  const lerp3 = (o, a, t) => { o[0] += (a[0] - o[0]) * t; o[1] += (a[1] - o[1]) * t; o[2] += (a[2] - o[2]) * t; };
  const mul3 = (o, f) => { o[0] *= f; o[1] *= f; o[2] *= f; };
  const set3 = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; };

  const Q1 = 0.6, Q2 = 0.7, PT = 0.74;   // Schwellen: Tafelberg 1/2, Teich
  const EDGE = 0.0012;                   // Kantenbreite der Schwellen

  /* ─── Drei Inselvorlagen (Sönke 27.10.2026) ───
     Feste Formen mit festem Seed: jede Klasse mit derselben Vorlage
     sieht dieselbe Landschaft. shape(u, v) ist ~1 im Kern und fällt
     zur äußersten Küste hin ab (u, v = Ort / rx, ry). Eine Insel
     WÄCHST, indem die Küstenschwelle sinkt: gleiche Landschaft, nur
     mehr Land drumherum (Stufe je 10 Begriffe, bis 5 = 50+).
       Bucht       hakenförmig um eine Bucht, Landzungen verschieden lang
       Kraterring  beginnt als Bogen oben rechts und wächst um eine
                   Lagune herum, bis der Ring sich schließt
       Landzungen  unregelmäßiger Körper mit Halbinseln in alle
                   Richtungen, später taucht eine kleine Nebeninsel auf
     Bucht und Landzungen sind „Rückgrate“ (spine): Abschnitte mit Dicke
     am Anfang und Ende. Dicke Teile tauchen zuerst auf, dünne Spitzen
     erst bei späteren Stufen — so wächst die Insel wie gewachsen und
     nicht wie ein aufgeblasener Kreis. warp verbiegt den Ort vorher
     leicht (Rauschen), damit keine Kante geometrisch aussieht; carve
     hält Wasser frei (die Bucht wächst nicht zu).
     (Sönke: Krater cool, Sichel und Kleeblatt „zu künstlich“.) */
  // [x0, y0, Dicke0, x1, y1, Dicke1] je Abschnitt
  function spine(segs, norm, carve) {
    return (u, v) => {
      let best = -1;
      for (const [ax, ay, ra, bx, by, rb] of segs) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
        const t = clamp(((u - ax) * dx + (v - ay) * dy) / l2, 0, 1);
        const d = Math.hypot(u - (ax + dx * t), v - (ay + dy * t)), r = ra + (rb - ra) * t;
        best = Math.max(best, (r - d) / norm);
      }
      return carve ? best - carve(u, v) : best;
    };
  }
  const TEMPLATES = [
    { id: 'bucht', name: 'Bucht', seed: 0x51c4e1, rx: 2700, ry: 2100, warp: 0.2,
      shape: spine([
        [-0.62, 0.38, 0.17, -0.58, 0.0, 0.3],       // Südwesten, zur Mitte dicker
        [-0.58, 0.0, 0.3, -0.3, -0.36, 0.34],       // Bauch
        [-0.3, -0.36, 0.34, 0.12, -0.52, 0.25],     // Norden
        [0.12, -0.52, 0.25, 0.5, -0.42, 0.15],      // Nordost, dünner
        [0.5, -0.42, 0.15, 0.76, -0.12, 0.06],      // lange Landzunge im Osten
        [-0.62, 0.38, 0.17, -0.25, 0.66, 0.07],     // Haken im Süden
        [-0.58, 0.0, 0.2, -0.95, -0.12, 0.08],      // kurze Zunge nach Westen
        [-0.3, -0.36, 0.18, -0.48, -0.8, 0.07]      // Nase nach Norden
      ], 0.34, (u, v) => Math.max(0, 1 - Math.hypot(u - 0.1, v - 0.18) / 0.46) * 1.3) },   // die Bucht bleibt Wasser
    { id: 'ring', name: 'Kraterring', seed: 0x7a11e3, rx: 2250, ry: 1780, warp: 0,
      shape: (u, v) => { const L = Math.hypot(u, v), a = Math.atan2(v, u);
        const side = ((Math.cos(a + 0.7) + 1) / 2) ** 2, w = 0.2 + 0.1 * side;   // beginnt oben rechts
        return (1 - Math.abs(L - 0.62) / w) * (0.2 + 0.8 * side * side); } },
    { id: 'zungen', name: 'Landzungen', seed: 0x3c1ee5, rx: 2550, ry: 2000, warp: 0.22,
      shape: spine([
        [-0.38, 0.12, 0.33, 0.12, -0.08, 0.38],     // Körper
        [0.12, -0.08, 0.38, 0.42, 0.16, 0.26],
        [0.42, 0.16, 0.2, 0.86, 0.4, 0.07],         // lange Zunge Südost
        [0.14, -0.12, 0.2, 0.3, -0.78, 0.09],       // Zunge Nord
        [-0.38, 0.12, 0.22, -0.88, -0.24, 0.1],     // Zunge Nordwest
        [-0.25, 0.3, 0.17, -0.42, 0.8, 0.06],       // dünne Zunge Süd
        [0.66, -0.56, 0.12, 0.8, -0.66, 0.08]       // Nebeninsel, taucht spät auf
      ], 0.38) }
  ];
  const STAGES = 5;                       // 10 · 20 · 30 · 40 · 50+ Begriffe
  const AREA = [1.2e6, 2.2e6, 3.3e6, 4.4e6, 5.5e6];   // Landfläche je Stufe (≈ 110 000 je Wesen)
  const stageFor = n => clamp(Math.ceil((n || 1) / 10), 1, STAGES);

  /* ─── Felder einer Insel (lokale Koordinaten, Mitte = 0,0) ─── */
  function fields(T, stage) {
    const X0 = -T.rx * 1.15, Y0 = -T.ry * 1.15, W = T.rx * 2.3, H = T.ry * 2.3;
    const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;
    const seed = T.seed;
    const nW1 = fbm(seed ^ 0x1a2b, 3), nW2 = fbm(seed ^ 0x3c4d, 3);
    const nE = fbm(seed ^ 0x9e37, 4), nQ = fbm(seed ^ 0x51ed, 3), nP = fbm(seed ^ 0x2b7f, 3), nM = fbm(seed ^ 0x7a11, 3);
    const N = cols * rows;
    const ea = new Float32Array(N), e = new Float32Array(N), q = new Float32Array(N), p = new Float32Array(N), m = new Float32Array(N);
    const fE = 1 / 520, fQ = 1 / 430, fP = 1 / 300, fM = 1 / 380;
    // Rauschen mit Versatz: lokale Koordinaten sind auch negativ
    const OFF = 5000;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = X0 + i * CELL, y = Y0 + j * CELL;
      // Ort leicht verbiegen (warp), dann die Form, dann etwas Rauschen auf die Höhe
      const wu = T.warp ? (nW1((x + OFF) / 900, (y + OFF) / 900) - 0.5) * T.warp * 2 : 0;
      const wv = T.warp ? (nW2((x + OFF) / 900, (y + OFF) / 900) - 0.5) * T.warp * 2 : 0;
      ea[j * cols + i] = T.shape(x / T.rx + wu, y / T.ry + wv) + (nE((x + OFF) * fE, (y + OFF) * fE) - 0.5) * 0.35;
    }
    // Küstenschwelle so, dass die Landfläche der Stufe stimmt
    const sorted = Float32Array.from(ea).sort();
    const cells = Math.round(AREA[stage - 1] / (CELL * CELL));
    const t = Math.max(0.05, sorted[Math.max(0, N - cells)]);
    let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, x = X0 + i * CELL, y = Y0 + j * CELL;
      const ev = ea[k] - t;
      e[k] = ev;
      if (ev > -0.04) { lx0 = Math.min(lx0, x); ly0 = Math.min(ly0, y); lx1 = Math.max(lx1, x); ly1 = Math.max(ly1, y); }
      // Tafelberge und Teiche hängen an der FESTEN Landschaft (ea), nicht an der
      // Stufe: beim Wachsen bleiben sie, wo sie sind — nur nicht direkt an der Küste.
      const nx = x + OFF, ny = y + OFF;
      q[k] = nQ(nx * fQ, ny * fQ) * sstep(0.42, 0.62, ea[k]) * sstep(0.1, 0.25, ev);
      p[k] = (1 - nP(nx * fP, ny * fP)) * sstep(0.48, 0.66, ea[k]) * sstep(0.12, 0.28, ev) * (1 - sstep(0.5, 0.57, q[k]));
      m[k] = nM(nx * fM, ny * fM);
    }
    // Winzige Tafelberge weg (sähen aus wie Stümpfe): zu kleine Flächen über der Schwelle absenken.
    const prune = (thr, minCells, to) => {
      const seen = new Uint8Array(cols * rows);
      for (let s0 = 0; s0 < q.length; s0++) {
        if (seen[s0] || q[s0] <= thr) continue;
        const comp = [s0]; seen[s0] = 1;
        for (let h = 0; h < comp.length; h++) {
          const c = comp[h], ci = c % cols;
          for (const nb of [c - 1, c + 1, c - cols, c + cols]) {
            if (nb < 0 || nb >= q.length || seen[nb] || q[nb] <= thr) continue;
            if ((nb === c - 1 && ci === 0) || (nb === c + 1 && ci === cols - 1)) continue;
            seen[nb] = 1; comp.push(nb);
          }
        }
        if (comp.length < minCells) for (const c of comp) q[c] = Math.min(q[c], to);
      }
    };
    prune(Q2 - 0.01, 260, Q2 - 0.03);     // obere Stufe: mindestens ~1,6 × 1,6 Wesen-Breiten
    prune(Q1 - 0.01, 320, Q1 - 0.03);     // untere Stufe
    const at = arr => (x, y) => {
      const fx = clamp((x - X0) / CELL, 0, cols - 1.001), fy = clamp((y - Y0) / CELL, 0, rows - 1.001);
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * cols + i;
      const a = arr[k], b = arr[k + 1], c = arr[k + cols], d = arr[k + cols + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    return { e: at(e), q: at(q), p: at(p), m: at(m), t, land: { x0: lx0, y0: ly0, x1: lx1, y1: ly1 } };
  }

  /* ─── Gelände Pixel für Pixel ─── */
  function paint(F, R, seed) {
    const W = R.w, H = R.h;
    const k = Math.min(1, MAX_PX / W, MAX_PX / H);
    const cw = Math.ceil(W * k), ch = Math.ceil(H * k);
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    const img = g.createImageData(cw, ch), D = img.data;
    const nFine = noise2(seed ^ 0x3333), nMid = noise2(seed ^ 0x3a3a), nWave = noise2(seed ^ 0x5151), nRock = noise2(seed ^ 0x6161);
    const col = [0, 0, 0], tmp = [0, 0, 0];
    for (let py = 0; py < ch; py++) {
      const y = R.y + (py + 0.5) / k;
      for (let px = 0; px < cw; px++) {
        const x = R.x + (px + 0.5) / k;
        const e = F.e(x, y);
        /* Meer: tief → Lagune, mit sanften Wellenstreifen */
        set3(col, C.deepFar);
        lerp3(col, C.deep, sstep(-0.55, -0.25, e));
        lerp3(col, C.lagoon, sstep(-0.2, -0.05, e));
        lerp3(col, C.lagoonLight, sstep(-0.06, -0.005, e) * 0.7);
        const rim = Math.min(x - R.x, R.x + W - x, y - R.y, R.y + H - y);
        if (rim < 260) lerp3(col, C.deepFar, 1 - sstep(0, 260, rim));
        if (e > -0.25 && e < 0) {
          const wv = nWave(x / 46 + nMid(x / 90, y / 90) * 2, y / 13);
          if (wv > 0.62) lerp3(col, C.foam, (wv - 0.62) * 0.9 * (1 + e * 3));
          // Brandungssaum: unterbrochen, nicht wie mit dem Lineal
          const ring = Math.abs(e + 0.03 + (nFine(x / 30, y / 30) - 0.5) * 0.012);
          if (ring < 0.005) lerp3(col, C.foam, (1 - ring / 0.005) * 0.65);
        }
        if (e > -0.02) {
          /* Strand mit Körnung, nass am Wasser */
          set3(tmp, C.sand);
          lerp3(tmp, C.sandDark, nFine(x / 9, y / 9) * 0.5);
          lerp3(tmp, C.sandWet, 1 - sstep(0, 0.025, e));
          lerp3(col, tmp, sstep(-EDGE, EDGE, e));
          if (e > 0.04) {
            /* Wiese: zwei Grüntöne, trockene Flecken, feine Struktur, Licht aus der Neigung */
            const m = F.m(x, y);
            set3(tmp, C.grass1);
            lerp3(tmp, C.grass2, sstep(0.45, 0.65, m));
            lerp3(tmp, C.grass3, sstep(0.55, 0.3, m) * 0.7);
            lerp3(tmp, C.grassDry, sstep(0.62, 0.78, nMid(x / 140, y / 140)) * 0.25);
            mul3(tmp, 0.93 + nFine(x / 7, y / 7) * 0.07 + nMid(x / 35, y / 35) * 0.07);
            const slope = (F.e(x - 14, y - 14) - F.e(x + 14, y + 14)) * 5;
            mul3(tmp, clamp(1 + slope, 0.93, 1.06));
            // Übergang Sand → Gras mit ausgefranster Kante
            lerp3(col, tmp, sstep(0.056, 0.064, e + (nFine(x / 11, y / 11) - 0.5) * 0.012));
            /* Teich: tief in der Mitte, heller Uferrand */
            const pv = F.p(x, y);
            if (pv > PT - 0.03) {
              set3(tmp, C.pond);
              lerp3(tmp, C.pondDeep, sstep(PT + 0.01, PT + 0.08, pv));
              const glint = nWave(x / 30, y / 9);
              if (glint > 0.7) lerp3(tmp, C.foam, (glint - 0.7) * 1.2);
              lerp3(col, C.pondEdge, sstep(PT - 0.008, PT - 0.002, pv) * 0.8);
              lerp3(col, tmp, sstep(PT - EDGE, PT + EDGE, pv));
            }
            /* Tafelberge (2,5-D) */
            if (e > 0.15) {
              const q0 = F.q(x, y);
              // Schatten nach rechts unten und Dunkel am Wandfuß
              if (q0 < Q1) {
                const qs = F.q(x - 26, y - 14);
                if (qs > Q1) lerp3(col, C.shade, 0.28);
                const qa = F.q(x, y - 10);
                if (qa > Q1) lerp3(col, C.shade, 0.22);
              }
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
      const qa = F.q(x, yb), qb = F.q(x, yb + WALL * 0.5), qt = F.q(x, yb + WALL);
      const wallA = Math.max(sstep(thr - EDGE, thr + EDGE, qa), sstep(thr - EDGE, thr + EDGE, qb), sstep(thr - EDGE, thr + EDGE, qt));
      if (wallA > 0) {
        // wie weit unten in der Wand? 0 oben … 1 unten
        let depth = 0;
        for (let t = 0; t <= 1.001; t += 0.125) if (F.q(x, yb + WALL * t) > thr) { depth = 1 - t; break; }
        // Gesteinsschichten mit welliger Dicke, Risse, seitliches Licht
        const strata = (y + nRock(x / 60, 0) * 10) / 11;
        const band = strata - Math.floor(strata);
        set3(tmp, band < 0.55 ? C.wallLight : C.wall);
        if (band > 0.92 || band < 0.04) lerp3(tmp, C.wallDark, 0.5);
        const crack = nRock(x / 7, y / 38);
        if (crack > 0.78) lerp3(tmp, C.crack, (crack - 0.78) * 3);
        mul3(tmp, 0.94 + nRock(x / 4, y / 4) * 0.1);
        lerp3(tmp, C.wallDark, depth * 0.55);
        // Wand zeigt nach links (Licht) oder rechts (Schatten)?
        const foot = yb + WALL * (1 - depth);
        const gx = F.q(x + 8, foot) - F.q(x - 8, foot);
        mul3(tmp, clamp(1 + gx * 18, 0.78, 1.14));
        lerp3(col, tmp, wallA);
      }
      // Deckel: Fußfläche um WALL nach oben verschoben, mit Felskante
      const topA = sstep(thr - EDGE, thr + EDGE, qt);
      if (topA > 0) {
        set3(tmp, top);
        mul3(tmp, 0.9 + nFine(x / 6 + 3, y / 6) * 0.1 + nMid(x / 26, y / 26) * 0.1);
        lerp3(tmp, C.grass3, sstep(0.55, 0.75, nMid(x / 90 + 5, y / 90)) * 0.4);
        // dunklerer Grasrand kurz vor der Kante, dann die helle Felskante
        lerp3(tmp, C.topRim, (1 - sstep(thr + 0.004, thr + 0.012, qt)) * 0.45);
        const lip = 1 - sstep(thr + 0.001, thr + 0.006, qt + (nRock(x / 9, y / 9) - 0.5) * 0.004);
        lerp3(tmp, C.lip, lip * 0.85);
        lerp3(col, tmp, topA);
      }
    }
    g.putImageData(img, 0, 0);
    return { canvas: cv, k };
  }

  /* ─── Kleinkram direkt ins Gelände: Gräser, Blüten in Tupfen, Seerosen ─── */
  function sprinkle(g, k, R, F, ok, r, seed) {
    const W = R.w, H = R.h;
    g.save();
    g.scale(k, k);
    g.translate(-R.x, -R.y);
    g.lineCap = 'round';
    const patch = noise2(seed ^ 0x7777);
    const n = Math.round(W * H / 2600);
    const bloom = ['#f3ead2', '#e9b7c4', '#e8cf72', '#b9a9df', '#f0f0ea'];
    for (let i = 0; i < n; i++) {
      const x0 = R.x + r() * W, y0 = R.y + r() * H;
      const lift = ok(x0, y0);
      if (lift === false) continue;
      const x = x0, y = y0 - lift;
      const pz = patch(x0 / 160, y0 / 160);
      if (r() < 0.7) {
        // Grashalme, mal heller, mal dunkler
        const hue = r();
        g.strokeStyle = hue < 0.5 ? 'rgba(52,96,40,.5)' : 'rgba(140,168,80,.55)';
        g.lineWidth = 1.3;
        const h = 8 + r() * 8, nb = 3 + Math.floor(r() * 3);
        g.beginPath();
        for (let b = 0; b < nb; b++) {
          const dx = (b - nb / 2) * 2.2, lean = (r() - 0.5) * 8;
          g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx + lean * 0.3, y - h * 0.6, x + dx + lean, y - h * (0.7 + r() * 0.4));
        }
        g.stroke();
      } else if (pz > 0.55) {
        // Blüten nur in Tupfen, klein
        const c = bloom[Math.floor(pz * 37) % bloom.length];
        for (let j = 0; j < 3; j++) {
          const fx = x + (r() - 0.5) * 18, fy = y + (r() - 0.5) * 10;
          g.fillStyle = 'rgba(40,70,30,.25)'; g.beginPath(); g.arc(fx + 1, fy + 1.5, 2.4, 0, Math.PI * 2); g.fill();
          g.fillStyle = c; g.beginPath(); g.arc(fx, fy, 2.2, 0, Math.PI * 2); g.fill();
        }
      }
    }
    // Seerosen auf den Teichen
    for (let i = 0; i < n / 6; i++) {
      const x = R.x + r() * W, y = R.y + r() * H;
      if (F.p(x, y) < PT + 0.02 || F.e(x, y) < 0.2) continue;
      const rr = 6 + r() * 6, a = r() * Math.PI * 2;
      g.fillStyle = 'rgba(20,50,50,.25)'; g.beginPath(); g.ellipse(x + 2, y + 2, rr, rr * 0.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = r() < 0.5 ? '#6f9a4f' : '#5c8a45';
      g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, 0, a, a + Math.PI * 1.8); g.lineTo(x, y); g.closePath(); g.fill();
      if (r() < 0.3) { g.fillStyle = '#efd7e0'; g.beginPath(); g.arc(x + rr * 0.2, y - 1, 2.6, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }

  /* ══════ Pflanzen ══════
     Gemalt: Licht von links oben, Schatten unten rechts, dunkler
     Rand in derselben Farbe statt schwarzer Linie, weicher Schatten
     am Boden. Anker unten Mitte; Maße in Welteinheiten (S = 100). */
  const PLANTS = {
    pilz:     { w: 140, h: 150 },
    moosbaum: { w: 250, h: 240 },
    kristall: { w: 120, h: 110 },
    laterne:  { w: 110, h: 140 },
    busch:    { w: 160, h: 100 },
    schirm:   { w: 280, h: 210 },
    farn:     { w: 170, h: 170 },
    fels:     { w: 140, h: 85 }
  };
  const VARIANTS = 6;
  const RES = 1.8;            // Pixel je Welteinheit in der Pflanzen-Leinwand

  function rgb(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function shadeHex(h, f) { const c = hex(h); return rgb([Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]); }
  function darkerHex(h, f) { return '#' + hex(h).map(c => Math.round(c * f).toString(16).padStart(2, '0')).join(''); }
  /* Kugel mit Licht von links oben */
  function ball(g, x, y, r, base, hi, lo) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    gr.addColorStop(0, hi); gr.addColorStop(0.55, base); gr.addColorStop(1, lo);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  /* Laubkrone: wenige große, weich ineinanderlaufende Ballen (hinten
     dunkel, vorn/links oben hell), darüber Blattstruktur aus kleinen
     Tupfen — sonst sieht sie aus wie Trauben. */
  function foliage(g, r, cx, cy, rx, ry, n, base) {
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75;
      blobs.push({ x: cx + Math.cos(a) * d * rx, y: cy + Math.sin(a) * d * ry, rr: (0.32 + r() * 0.16) * Math.min(rx, ry * 1.4) });
    }
    // 1. dunkle Grundform (Schattenseite)
    g.fillStyle = darkerHex(base, 0.62);
    for (const b of blobs) { g.beginPath(); g.arc(b.x + 3, b.y + 4, b.rr, 0, Math.PI * 2); g.fill(); }
    // 2. Ballen mit weichem Licht von links oben, ohne dunklen Rand
    blobs.sort((a, b) => (a.y + a.x * 0.4) - (b.y + b.x * 0.4));
    for (const b of blobs) {
      const lit = clamp(1 - ((b.x - cx) / rx + (b.y - cy) / ry + 1.2) / 2.4, 0, 1);
      const gr = g.createRadialGradient(b.x - b.rr * 0.35, b.y - b.rr * 0.4, b.rr * 0.1, b.x, b.y, b.rr);
      gr.addColorStop(0, shadeHex(base, 1.12 + lit * 0.3));
      gr.addColorStop(0.7, shadeHex(base, 0.9 + lit * 0.15));
      gr.addColorStop(1, shadeHex(base, 0.82 + lit * 0.1));
      g.fillStyle = gr;
      g.beginPath(); g.arc(b.x, b.y, b.rr * 0.92, 0, Math.PI * 2); g.fill();
    }
    // 3. Blattstruktur: kleine Tupfen hell oben links, dunkel unten rechts
    for (let i = 0; i < n * 22; i++) {
      const b = blobs[Math.floor(r() * blobs.length)];
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * b.rr * 0.9;
      const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
      const up = (Math.cos(a) + Math.sin(a)) < -0.3;
      g.fillStyle = up ? 'rgba(255,250,220,' + (0.08 + r() * 0.12) + ')' : 'rgba(20,35,20,' + (0.06 + r() * 0.1) + ')';
      g.beginPath(); g.ellipse(x, y, 2.2 + r() * 2, 1.4 + r() * 1.2, r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    return blobs;
  }
  function groundShadow(g, cx, by, rx, ry) {
    const gr = g.createRadialGradient(cx + rx * 0.12, by, 1, cx + rx * 0.12, by, rx);
    gr.addColorStop(0, 'rgba(25,45,20,.38)'); gr.addColorStop(1, 'rgba(25,45,20,0)');
    g.save(); g.translate(cx + rx * 0.12, by); g.scale(1, ry / rx); g.translate(-(cx + rx * 0.12), -by);
    g.fillStyle = gr; g.beginPath(); g.arc(cx + rx * 0.12, by, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function trunk(g, x0, y0, x1, y1, w0, w1, bend, col) {
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    const nx = (y1 - y0), ny = -(x1 - x0), nl = Math.hypot(nx, ny) || 1;
    const ux = nx / nl, uy = ny / nl;
    g.beginPath();
    g.moveTo(x0 + ux * w0, y0 + uy * w0);
    g.quadraticCurveTo(mx + ux * (w0 + w1) / 2, my + uy * (w0 + w1) / 2, x1 + ux * w1, y1 + uy * w1);
    g.lineTo(x1 - ux * w1, y1 - uy * w1);
    g.quadraticCurveTo(mx - ux * (w0 + w1) / 2, my - uy * (w0 + w1) / 2, x0 - ux * w0, y0 - uy * w0);
    g.closePath();
    const gr = g.createLinearGradient(x0 - w0, 0, x0 + w0, 0);
    gr.addColorStop(0, shadeHex(col, 1.2)); gr.addColorStop(0.5, col); gr.addColorStop(1, shadeHex(col, 0.62));
    g.fillStyle = gr; g.fill();
  }

  function plantSprite(type, v) {
    const P = PLANTS[type];
    const r = rngOf(0x51ab + v * 7919 + type.length * 104729 + type.charCodeAt(0) * 31);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(P.w * RES); cv.height = Math.ceil(P.h * RES);
    const g = cv.getContext('2d');
    g.scale(RES, RES);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const W = P.w, H = P.h, cx = W / 2, by = H - 8;
    const pick = a => a[Math.floor(r() * a.length)];

    if (type === 'pilz') {
      groundShadow(g, cx, by, 54, 11);
      const caps = ['#a8503a', '#7a4b6e', '#3f7f7c', '#b78435', '#8c5a3a', '#6a6fa0'];
      const cap = caps[v % caps.length];
      const one = (x, h, rw, lean) => {
        const top = by - h, tx = x + lean;
        // Stiel mit leichtem Schwung und Manschette
        trunk(g, x, by, tx, top + rw * 0.2, rw * 0.3, rw * 0.22, lean * 0.4, '#e6dcc6');
        g.fillStyle = 'rgba(120,100,80,.35)';
        g.beginPath(); g.ellipse(tx + (x - tx) * 0.35, top + h * 0.35, rw * 0.24, rw * 0.07, 0, 0, Math.PI * 2); g.fill();
        // Lamellen (Unterseite)
        g.fillStyle = shadeHex(cap, 0.55);
        g.beginPath(); g.ellipse(tx, top + rw * 0.18, rw * 0.92, rw * 0.2, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,240,220,.18)'; g.lineWidth = 0.8;
        for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(tx, top + rw * 0.18); g.lineTo(tx + i * rw * 0.14, top + rw * 0.18 + rw * 0.17 * Math.cos(i / 7)); g.stroke(); }
        // Hut
        g.beginPath();
        g.moveTo(tx - rw, top + rw * 0.16);
        g.bezierCurveTo(tx - rw * 0.98, top - rw * 0.62, tx + rw * 0.98, top - rw * 0.62, tx + rw, top + rw * 0.16);
        g.quadraticCurveTo(tx, top + rw * 0.32, tx - rw, top + rw * 0.16);
        const gr = g.createRadialGradient(tx - rw * 0.35, top - rw * 0.35, rw * 0.05, tx, top, rw * 1.1);
        gr.addColorStop(0, shadeHex(cap, 1.55)); gr.addColorStop(0.45, cap); gr.addColorStop(1, shadeHex(cap, 0.55));
        g.fillStyle = gr; g.fill();
        // wenige blasse Flecken, unregelmäßig
        g.fillStyle = 'rgba(245,235,215,.55)';
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * (0.15 + r() * 0.7), d = rw * (0.3 + r() * 0.55);
          g.beginPath(); g.ellipse(tx + Math.cos(a) * d, top + rw * 0.05 + Math.sin(a) * d * 0.5, rw * (0.06 + r() * 0.07), rw * (0.04 + r() * 0.04), a, 0, Math.PI * 2); g.fill();
        }
      };
      const n = 1 + Math.floor(r() * 3);
      if (n > 1) one(cx - 30 - r() * 8, 50 + r() * 20, 18 + r() * 6, -6 - r() * 6);
      if (n > 2) one(cx + 30 + r() * 8, 40 + r() * 16, 15 + r() * 5, 6 + r() * 6);
      one(cx + (r() - 0.5) * 10, 84 + r() * 30, 44 + r() * 8, (r() - 0.5) * 16);
    } else if (type === 'moosbaum') {
      groundShadow(g, cx, by, 78, 16);
      const leaves = ['#4f8a5a', '#5f8d45', '#3f7a6a', '#7f8a3e', '#5a7f78', '#8a6a3e'];
      const leaf = leaves[v % leaves.length];
      // Wurzeln
      for (let i = 0; i < 4; i++) trunk(g, cx + (i - 1.5) * 6, by - 10, cx + (i - 1.5) * 13, by + 1, 5, 2.5, 0, '#6f5240');
      const tx = cx + (r() - 0.5) * 16, ty = by - 120;
      trunk(g, cx, by, tx, ty, 13, 7, (r() - 0.5) * 30, '#7a5a44');
      trunk(g, tx, ty + 30, tx - 40, ty - 10, 5, 2.5, -8, '#7a5a44');
      trunk(g, tx, ty + 20, tx + 42, ty - 4, 5, 2.5, 8, '#7a5a44');
      const blobs = foliage(g, r, tx, ty - 26, 86, 60, 13, leaf);
      // hängendes Moos
      g.strokeStyle = 'rgba(150,170,110,.55)'; g.lineWidth = 1.3;
      for (let i = 0; i < 16; i++) {
        const b = blobs[Math.floor(r() * blobs.length)];
        if (b.y < ty - 30) continue;
        const L = 14 + r() * 26;
        g.beginPath(); g.moveTo(b.x, b.y + b.rr * 0.6); g.quadraticCurveTo(b.x + 3, b.y + b.rr * 0.6 + L * 0.5, b.x - 1, b.y + b.rr * 0.6 + L); g.stroke();
      }
    } else if (type === 'kristall') {
      groundShadow(g, cx, by, 50, 10);
      const sets = [['#bfe9ee', '#6fb7c8', '#3f7f96'], ['#d8c4ef', '#9a7cc8', '#5f4a8a'], ['#f0cfd4', '#c88a98', '#8a5464'],
                    ['#cfeedd', '#79bf9a', '#3f7f62'], ['#f2e3b8', '#c9a95e', '#8a6c34'], ['#c8d8f2', '#7f9ad0', '#475f96']];
      const [lt, md, dk] = sets[v % sets.length];
      // Steinsockel
      for (let i = 0; i < 4; i++) ball(g, cx + (i - 1.5) * 18, by - 6, 12 + r() * 4, '#8d8a80', '#b9b5a8', '#5c5a52');
      const prisms = [];
      const n = 4 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) prisms.push({ x: cx + (r() - 0.5) * 60, h: 30 + r() * 55, w: 7 + r() * 7, t: (r() - 0.5) * 0.7 });
      prisms.sort((a, b) => a.h - b.h).reverse();
      for (const p of prisms) {
        g.save(); g.translate(p.x, by - 8); g.rotate(p.t);
        const w = p.w, h = p.h;
        // linke (helle) und rechte (dunkle) Fläche, Spitze
        g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -h + w * 1.2); g.lineTo(0, -h); g.lineTo(0, 0); g.closePath();
        let gr = g.createLinearGradient(0, 0, 0, -h); gr.addColorStop(0, md); gr.addColorStop(1, lt); g.fillStyle = gr; g.fill();
        g.beginPath(); g.moveTo(w, 0); g.lineTo(w, -h + w * 1.2); g.lineTo(0, -h); g.lineTo(0, 0); g.closePath();
        gr = g.createLinearGradient(0, 0, 0, -h); gr.addColorStop(0, dk); gr.addColorStop(1, md); g.fillStyle = gr; g.fill();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-w * 0.55, -h * 0.15); g.lineTo(-w * 0.55, -h + w * 1.6); g.stroke();
        g.restore();
      }
      const glow = g.createRadialGradient(cx, by - 45, 4, cx, by - 45, 50);
      glow.addColorStop(0, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(cx, by - 45, 50, 0, Math.PI * 2); g.fill();
    } else if (type === 'laterne') {
      groundShadow(g, cx, by, 40, 9);
      const lights = ['#f3d679', '#f0b7a0', '#bfe3d2', '#e7c2e8', '#f6e2a6', '#c9dcf0'];
      const lc = lights[v % lights.length];
      // Blätter am Grund
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42 + (r() - 0.5) * 0.2, L = 26 + r() * 16;
        g.save(); g.translate(cx, by); g.rotate(a + Math.PI / 2);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-7, -L * 0.5, 0, -L); g.quadraticCurveTo(7, -L * 0.5, 0, 0);
        const gr = g.createLinearGradient(-6, 0, 6, 0); gr.addColorStop(0, '#7fa35a'); gr.addColorStop(1, '#3f6a3a'); g.fillStyle = gr; g.fill();
        g.restore();
      }
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const h = 60 + r() * 60, sx = cx + (i - (n - 1) / 2) * 8, ex = cx + (i - (n - 1) / 2) * 16 + (r() - 0.5) * 12;
        const ey = by - h;
        g.strokeStyle = '#4f7040'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, by - 4); g.quadraticCurveTo(sx + (ex - sx) * 0.2, by - h * 0.7, ex, ey); g.quadraticCurveTo(ex + 6, ey - 6, ex + 7, ey + 2); g.stroke();
        // hängende Laterne mit Licht von innen
        const lx = ex + 7, ly = ey + 12;
        const halo = g.createRadialGradient(lx, ly, 2, lx, ly, 22);
        halo.addColorStop(0, 'rgba(255,245,210,.55)'); halo.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, 22, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(lx, ly - 9); g.bezierCurveTo(lx + 9, ly - 6, lx + 8, ly + 8, lx, ly + 10); g.bezierCurveTo(lx - 8, ly + 8, lx - 9, ly - 6, lx, ly - 9);
        const gr = g.createRadialGradient(lx - 2, ly + 1, 1, lx, ly, 11);
        gr.addColorStop(0, '#fffdf2'); gr.addColorStop(0.5, lc); gr.addColorStop(1, shadeHex(lc, 0.7)); g.fillStyle = gr; g.fill();
        g.strokeStyle = 'rgba(80,60,30,.35)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(lx, ly - 9); g.lineTo(lx, ly + 10); g.stroke();
      }
    } else if (type === 'busch') {
      groundShadow(g, cx, by, 60, 12);
      const leaves = ['#4f7f4a', '#5a7a3e', '#3f6f5a', '#6a7f3e', '#4a6f62', '#7a6a3a'];
      const berries = ['#b4413f', '#5a5fa8', '#c98a2e', '#8a3f6a', '#d0d0c0', '#3f7fa0'];
      const blobs = foliage(g, r, cx, by - 36, 58, 30, 8, leaves[v % leaves.length]);
      const bc = berries[v % berries.length];
      for (let i = 0; i < 9; i++) {
        const b = blobs[Math.floor(r() * blobs.length)];
        const x = b.x + (r() - 0.5) * b.rr, y = b.y + (r() - 0.3) * b.rr * 0.8;
        ball(g, x, y, 3.2, bc, shadeHex(bc, 1.6), shadeHex(bc, 0.55));
      }
    } else if (type === 'schirm') {
      groundShadow(g, cx, by, 96, 16);
      const crowns = ['#6f8f4f', '#8a6f8f', '#b07a5f', '#5f8a7a', '#9a8f4a', '#7a6a9a'];
      const crown = crowns[v % crowns.length];
      const tx = cx + (r() - 0.5) * 16, ty = by - 150;
      trunk(g, cx, by, tx, ty + 30, 9, 6, (r() - 0.5) * 24, '#806048');
      // Astgabeln zur flachen Krone
      for (let i = 0; i < 4; i++) {
        const ex = tx + (i - 1.5) * 34 + (r() - 0.5) * 10;
        trunk(g, tx, ty + 34, ex, ty + 2, 4, 1.8, (i - 1.5) * 6, '#806048');
      }
      // zwei Lagen: dunkle Unterseite, helle Oberseite
      // flaches Dach aus drei breiten Laubpolstern nebeneinander
      for (const dx of [-62, 62, 0]) foliage(g, r, tx + dx, ty - 4 + Math.abs(dx) * 0.08, 58, 26, 5, dx ? darkerHex(crown, 0.9) : crown);
    } else if (type === 'farn') {
      groundShadow(g, cx, by, 64, 12);
      const greens = ['#5f8f4a', '#4f8a62', '#7a9a4a', '#4a7f6f', '#6f8f3f', '#5a7f4f'];
      const gc = greens[v % greens.length];
      const tall = r() < 0.6;
      const top = tall ? by - 60 - r() * 30 : by - 6;
      if (tall) trunk(g, cx, by, cx + (r() - 0.5) * 10, top, 7, 5, (r() - 0.5) * 12, '#6a5240');
      const fronds = 9 + Math.floor(r() * 4);
      const list = [];
      for (let i = 0; i < fronds; i++) list.push({ a: -Math.PI / 2 + (i / (fronds - 1) - 0.5) * 2.9 + (r() - 0.5) * 0.2, L: 55 + r() * 30 });
      list.sort((a, b) => Math.abs(b.a + Math.PI / 2) - Math.abs(a.a + Math.PI / 2));     // äußere zuerst (hinten)
      for (const f of list) {
        const ex = cx + Math.cos(f.a) * f.L, ey = top + Math.sin(f.a) * f.L * 0.75 + 18;
        const mx = cx + Math.cos(f.a) * f.L * 0.5, my = top + Math.sin(f.a) * f.L * 0.5 - 12;
        const steps = 14;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex;
          const py = (1 - t) * (1 - t) * top + 2 * (1 - t) * t * my + t * t * ey;
          const dx = 2 * (1 - t) * (mx - cx) + 2 * t * (ex - mx), dy = 2 * (1 - t) * (my - top) + 2 * t * (ey - my);
          const dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
          const len = 11 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 2;
          for (const sgn of [-1, 1]) {
            g.beginPath(); g.moveTo(px, py);
            g.quadraticCurveTo(px + nx * sgn * len * 0.6 + dx / dl * 3, py + ny * sgn * len * 0.6 + dy / dl * 3, px + nx * sgn * len + dx / dl * 5, py + ny * sgn * len + dy / dl * 5 + 2);
            g.strokeStyle = shadeHex(gc, sgn < 0 ? 1.15 : 0.85); g.lineWidth = 2.6; g.stroke();
          }
        }
        g.beginPath(); g.moveTo(cx, top); g.quadraticCurveTo(mx, my, ex, ey);
        g.strokeStyle = shadeHex(gc, 0.7); g.lineWidth = 1.6; g.stroke();
      }
    } else if (type === 'fels') {
      groundShadow(g, cx, by, 62, 12);
      const tones = [['#9a958a', '#c4bfb2', '#625e56'], ['#a08a72', '#c9b49a', '#66523f'], ['#8a8f94', '#b8bec4', '#565b60']];
      const [md, lt, dk] = tones[v % tones.length];
      const rocks = [[-28, 18, 22], [22, 14, 20], [-2, 28, 32]].map(([dx, h, rr]) => ({ x: cx + dx + (r() - 0.5) * 8, y: by - h, rr: rr * (0.85 + r() * 0.3) }));
      for (const rk of rocks) {
        g.save(); g.translate(rk.x, rk.y); g.scale(1.25, 0.85);
        ball(g, 0, 0, rk.rr, md, lt, dk);
        // Moos oben
        const mg = g.createRadialGradient(-rk.rr * 0.2, -rk.rr * 0.7, 2, -rk.rr * 0.2, -rk.rr * 0.5, rk.rr * 0.8);
        mg.addColorStop(0, 'rgba(120,150,70,.9)'); mg.addColorStop(1, 'rgba(110,140,60,0)');
        g.fillStyle = mg; g.beginPath(); g.arc(0, 0, rk.rr, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    return { canvas: cv, w: P.w, h: P.h };
  }

  /* ─── Eine Insel bauen (lokale Koordinaten) ─── */
  const TYPES = ['pilz', 'moosbaum', 'kristall', 'laterne', 'busch', 'schirm', 'farn', 'fels'];
  const sprites = {};
  const sprite = (t, v) => sprites[t + v] || (sprites[t + v] = plantSprite(t, v));

  function islandPart(T, n) {
    const stage = stageFor(n);
    const F = fields(T, stage);
    const r = rngOf(T.seed ^ 0xa5a5);
    const L = F.land, M = 320;                        // Rand: Lagune und Übergang ins tiefe Meer
    const R = { x: L.x0 - M, y: L.y0 - M - WALL * 2, w: L.x1 - L.x0 + 2 * M, h: L.y1 - L.y0 + 2 * M + WALL * 2 };
    const terr = paint(F, R, T.seed);

    const isPlateau = (x, y) => F.q(x, y) > Q1 - 0.02;
    const ground = (x, y) => F.e(x, y) > 0.07 && F.p(x, y) < PT - 0.02 && !isPlateau(x, y);
    // Wesen: auf dem Boden, nicht dicht unter einer Felswand (wo ihr Bild über den Deckel ragt)
    const walk = (x, y) => {
      if (x < R.x || y < R.y || x > R.x + R.w || y > R.y + R.h) return false;
      if (!ground(x, y) || F.e(x, y) < 0.09) return false;
      for (let t = 0; t <= WALL * 2 + 30; t += 20) if (isPlateau(x, y + t) || isPlateau(x - 30, y + t) || isPlateau(x + 30, y + t)) return false;
      return !isPlateau(x, y - 16);
    };
    // Gräser/Blüten: Boden (Hub 0), Deckel der Tafelberge (Hub WALL bzw. 2 × WALL), sonst nichts
    const place = (x, y) => {
      const q = F.q(x, y);
      if (q > Q2 + 0.004) return WALL * 2;
      if (q > Q1 + 0.004 && q < Q2 - 0.004) return WALL;
      return ground(x, y) && F.e(x, y) > 0.08 && q < Q1 - 0.03 ? 0 : false;
    };
    sprinkle(terr.canvas.getContext('2d'), terr.k, R, F, place, rngOf(T.seed ^ 0x1234), T.seed);

    // Pflanzen in Hainen: welche Art, entscheidet ein grobes Rauschen. Gesät wird
    // auf dem GANZEN Vorlagengebiet in fester Reihenfolge — so steht eine Pflanze
    // nach dem Wachsen der Insel noch am selben Fleck.
    const zone = noise2(T.seed ^ 0x4444);
    const plants = [];
    const span = { x: -T.rx * 1.1, y: -T.ry * 1.1, w: T.rx * 2.2, h: T.ry * 2.2 };
    const tries = Math.round(span.w * span.h / 6000);
    for (let i = 0; i < tries; i++) {
      const x = span.x + r() * span.w, y = span.y + r() * span.h;
      const v = Math.floor(r() * VARIANTS), sc = 0.6 + r() * 0.3, flip = r() < 0.5;
      const onTop = F.q(x, y) > Q1 + 0.03 && F.q(x, y) < Q2 - 0.01;   // auf dem unteren Tafelberg
      if (!onTop && !(ground(x, y) && F.e(x, y) > 0.1)) continue;
      if (!onTop && F.q(x, y + 40) > Q1 - 0.03) continue;              // nicht an die Felswand kleben
      if (plants.some(p => (p.x - x) ** 2 + ((p.y - y) * 1.5) ** 2 < 190 * 190)) continue;
      // Rauschen liegt meist um 0,5: gestreckt und umgebrochen, damit alle Arten vorkommen, in Hainen
      const z = zone((x + 5000) / 650, (y + 5000) / 650);
      plants.push({ x, y, onTop, t: TYPES[Math.floor(z * 15) % TYPES.length], v, s: sc, flip });
    }
    // Wohnplätze der Familien: begehbar und eher im Inneren
    const homes = [];
    for (let i = 0; i < 6000 && homes.length < 400; i++) {
      const x = R.x + r() * R.w, y = R.y + r() * R.h;
      if (F.e(x, y) > 0.18 && walk(x, y)) homes.push({ x, y });
    }
    // Wassertiefe für Schwimmer: Küstenhöhe e (unter 0 = Wasser), außerhalb des Ausschnitts offenes Meer
    const depth = (x, y) => (x < R.x || y < R.y || x > R.x + R.w || y > R.y + R.h) ? -1 : F.e(x, y);
    return { T, stage, n, F, R, land: L, canvas: terr.canvas, walk, depth, plants, homes };
  }

  const GAP = 700;                        // Wasser zwischen zwei Inseln (für Schwimmer)
  const PAD = 500;

  /* ─── Welt bauen: eine bis drei Inseln ───
     spec = { tpl: Vorlage der ersten Insel (0…2), ns: [Begriffe je Insel] }.
     Insel 2 liegt rechts neben Insel 1, Insel 3 darunter in der Mitte;
     die weiteren Inseln nehmen die nächsten Vorlagen. */
  function build(spec) {
    const t0 = Date.now();
    const ns = (spec.ns && spec.ns.length ? spec.ns : [1]).slice(0, 3);
    const tpl = ((spec.tpl | 0) % TEMPLATES.length + TEMPLATES.length) % TEMPLATES.length;
    const parts = ns.map((n, i) => islandPart(TEMPLATES[(tpl + i) % TEMPLATES.length], n));
    // Lage: Ursprung jeder Insel (lokal 0,0) in Weltkoordinaten
    const a = parts[0];
    a.ox = 0; a.oy = 0;
    if (parts[1]) {
      const b = parts[1];
      b.ox = a.land.x1 + GAP - b.land.x0;
      b.oy = (a.land.y0 + a.land.y1) / 2 - (b.land.y0 + b.land.y1) / 2;
    }
    if (parts[2]) {
      const c = parts[2], b = parts[1];
      const bottom = Math.max(a.oy + a.land.y1, b.oy + b.land.y1);
      c.oy = bottom + GAP - c.land.y0;
      c.ox = (a.land.x0 + b.ox + b.land.x1) / 2 - (c.land.x0 + c.land.x1) / 2;
    }
    // alles ins Positive schieben
    const minX = Math.min(...parts.map(p => p.ox + p.R.x)), minY = Math.min(...parts.map(p => p.oy + p.R.y));
    parts.forEach(p => { p.ox += PAD - minX; p.oy += PAD - minY; });
    const W = Math.max(...parts.map(p => p.ox + p.R.x + p.R.w)) + PAD;
    const H = Math.max(...parts.map(p => p.oy + p.R.y + p.R.h)) + PAD;

    const pieces = parts.map(p => ({ canvas: p.canvas, x: p.ox + p.R.x, y: p.oy + p.R.y, w: p.R.w, h: p.R.h }));
    const plants = [];
    for (const p of parts) for (const pl of p.plants) {
      plants.push({ x: pl.x + p.ox, y: pl.y + p.oy, lift: pl.onTop ? WALL : 0, sp: sprite(pl.t, pl.v), s: pl.s, flip: pl.flip, type: pl.t });
    }
    plants.sort((u, v) => u.y - v.y);
    const walk = (x, y) => parts.some(p => p.walk(x - p.ox, y - p.oy));
    /* depth(x, y): Küstenhöhe der nächsten Insel — unter 0 ist Wasser (offenes
       Meer -1), 0 … 0,09 Strand, darüber Land; null außerhalb der Welt. */
    const depth = (x, y) => {
      if (x < PAD * 0.5 || y < PAD * 0.5 || x > W - PAD * 0.5 || y > H - PAD * 0.5) return null;
      return Math.max(...parts.map(p => p.depth(x - p.ox, y - p.oy)));
    };
    const islands = parts.map(p => ({
      id: p.T.id, name: p.T.name, stage: p.stage, n: p.n, area: AREA[p.stage - 1],
      homes: p.homes.map(h => ({ x: h.x + p.ox, y: h.y + p.oy })),
      box: { x: p.ox + p.land.x0, y: p.oy + p.land.y0, w: p.land.x1 - p.land.x0, h: p.land.y1 - p.land.y0 }
    }));
    const x0 = Math.min(...islands.map(i => i.box.x)), y0 = Math.min(...islands.map(i => i.box.y));
    const x1 = Math.max(...islands.map(i => i.box.x + i.box.w)), y1 = Math.max(...islands.map(i => i.box.y + i.box.h));
    const pad = 80;
    return {
      width: W, height: H, S, pieces, walk, depth, islands, plants,
      sea: 'rgb(' + C.deepFar.join(',') + ')', ms: Date.now() - t0,
      bbox: { x: x0 - pad, y: y0 - pad - WALL * 2, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad + WALL * 2 }
    };
  }

  /* Wie viele Inseln bei wie vielen Begriffen (Sönke: ab 81 eine zweite,
     ab 151 eine dritte — mehr nicht, dann wird es eben voll). */
  const islandCount = n => (n > 150 ? 3 : n > 80 ? 2 : 1);

  global.DDWelt = { build, S, PLANTS, plantSprite, TEMPLATES, islandCount, stageFor, _fields: fields };
})(typeof window !== 'undefined' ? window : globalThis);
