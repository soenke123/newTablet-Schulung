/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/labor.js   ·   Labor: Pinguine in 3D (Test für EIN Gerät)
   ══════════════════════════════════════════════════════════════
   Vorstufe für „gemeinsam ein Netz“. 342 echte Pinguine, 3 Eingänge
   (Schnabellänge, Schnabelhöhe, Flossenlänge). Zwei Betriebsarten:

   „3 Neuronen“ (own)   je Art ein Neuron „Bin das ich?“ (σ), größtes p
                        gewinnt; 12 Werte = 6 Welten (2 × 3).
   „+ Zahl-Neuron“ (zahl) die drei σ-Neuronen A, B, C werden zur
                        versteckten Schicht, dahinter EIN Neuron ohne σ
                        (wie das Gewichts-Neuron in Level 4) rechnet eine Zahl:
                        unter 0,5 = Art mit 0, bis 1,5 = Art mit 1,
                        darüber = Art mit 2 (welche Art die 1 bekommt,
                        ist wählbar – und nicht egal). 16 Werte = 8
                        Welten (2 × 4). Fehler = ½ · mittleres
                        Abstandsquadrat zur Zielzahl. Alle Welten hängen
                        voneinander ab.

     oben       Wolke 1: die Pinguine in ihren Messwerten, je Neuron
                A/B/C eine Ebene (50 %-Grenze, Pfeil zur Ja-Seite)
                Wolke 2 (nur zahl): dieselben Pinguine so, wie das
                Zahl-Neuron sie sieht – Achsen = Antworten von A, B, C
                (0–100 %), zwei parallele Ebenen bei 0,5 und 1,5
                das ganze Netz + alle Werte
     unten      die Welten: Spalte = Neuron, Farbe = Fehler (log),
                Punkt ziehen = Werte setzen, Pfeil = bergab, Spur
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const P = NTWelt.penguins3();
  const R = P.R, G = 48, N = P.n;
  const SPC = ['#2f80ed', '#f27828', '#12a37a'];             // Arten (Punkte)
  const NAMES = ['Adelie', 'Zügel', 'Esel'];
  const HID = ['#8b5cf6', '#d9468f', '#0ea5b7'];             // versteckte Neuronen A, B, C
  const OUT = '#c99400';                                      // Zahl-Neuron
  const MODES = {
    own:  { lr: { min: 0.2, max: 40, def: 4 }, init: 6, cols: 3 },
    zahl: { lr: { min: 0.05, max: 4, def: 1 }, init: 2, cols: 4 }
  };
  const counts = [0, 1, 2].map(k => P.pts.filter(p => p.y === k).length);
  const sig = z => 1 / (1 + Math.exp(-z));
  const zz = (w, x) => w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3];

  let low = !!(window.LWMotion && LWMotion.low);
  window.addEventListener('lernwelt:motion', () => { low = !!(window.LWMotion && LWMotion.low); });

  /* ── Hell/Dunkel wie der Rahmen ── */
  function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    const apply = () => {
      dirtyAll();
    };
    apply();
    if (pd) { try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ } }
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
  }
  const dark = () => true;                     // Labor/Level 8: immer Polarnacht wie das Spiel
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // Sönkes Pinguin-Bilder (img/frei/) neben den Namen
  const SPK = ['adelie', 'chin', 'gentoo'];
  const pimg = (k, cls) => '<img class="' + (cls || 'pi') + '" src="img/frei/' + SPK[k] + '_1.webp" alt="">';

  // Level 8 (labor.html?level=8): ein Netz mit 4 Neuronen = 8 Welten, Erklärkarte vorweg
  const LEVEL8 = /[?&]level=8\b/.test(location.search);
  if (LEVEL8) document.body.dataset.level = '8';

  /* ── Zustand ── */
  const S = { mode: 'own', mid: 1, ord: [0, 1, 2], W: [], lr: 4, auto: false, wait: 0, trail: [], show: [true, true, true],
              yaw: 0.75, pitch: 0.38, rot: null, idle: 0, g: null, hist: [] };
  const zahl = () => S.mode === 'zahl';
  const nNeur = () => zahl() ? 4 : 3;
  const colOf = k => zahl() ? (k === 3 ? OUT : HID[k]) : SPC[k];
  const nameOf = k => zahl() ? ['A', 'B', 'C', 'Zahl'][k] : NAMES[k];
  const pairsOf = k => (zahl() && k === 3)
    ? [{ idx: [0, 1], lab: ['von A', 'von B'] }, { idx: [2, 3], lab: ['von C', 'Bias'] }]
    : [{ idx: [0, 1], lab: ['Länge', 'Höhe'] }, { idx: [2, 3], lab: ['Flosse', 'Bias'] }];

  // Welche Art bekommt welche Zahl? Fest: Zügel = 1 (Adelie 0, Esel 2). Zügel liegt in der
  // Wolke zwischen den beiden (Schnabel lang wie Esel, hoch wie Adelie, Flosse dazwischen) und
  // lernt in kurzer Zeit am besten; Esel in der Mitte klappt kaum (Simulation 17.11.2026).
  function setMid(m) {
    S.mid = m;
    const rest = [0, 1, 2].filter(k => k !== m);
    S.ord = [0, 1, 2].map(k => k === m ? 1 : (k === rest[0] ? 0 : 2));
  }

  function rnd() {
    const a = MODES[S.mode].init;
    S.W = Array.from({ length: nNeur() }, () => [0, 1, 2, 3].map(() => (Math.random() * 2 - 1) * a));
    S.trail = S.W.map(() => []);
    S.hist = [];
    dirtyAll();
    record();
  }
  // Lernkurve: nach jedem Lernschritt Fehler + Lernrate merken
  function record() {
    S.hist.push({ L: lossAll(S.W), lr: S.lr });
    if (S.hist.length > 400) S.hist.shift();
  }

  /* ── Rechnen ── */
  // versteckte Antworten aller Pinguine (nur zahl)
  const hidden = W => P.pts.map(p => [0, 1, 2].map(k => sig(zz(W[k], p.x))));
  function lossAll(W) {
    if (!zahl()) return P.loss(W);
    const H = hidden(W);
    let s = 0;
    P.pts.forEach((p, i) => { const e = zz(W[3], H[i]) - S.ord[p.y]; s += e * e; });
    return s / (2 * N);
  }
  function gradAll(W) {
    if (!zahl()) return W.map((w, k) => P.gradK(k, w));
    const g = W.map(() => [0, 0, 0, 0]), V = W[3];
    P.pts.forEach(p => {
      const h = [0, 1, 2].map(k => sig(zz(W[k], p.x)));
      const e = zz(V, h) - S.ord[p.y];
      for (let k = 0; k < 3; k++) {
        g[3][k] += e * h[k];
        const d = e * V[k] * h[k] * (1 - h[k]);
        g[k][0] += d * p.x[0]; g[k][1] += d * p.x[1]; g[k][2] += d * p.x[2]; g[k][3] += d;
      }
      g[3][3] += e;
    });
    return g.map(r => r.map(v => v / N));
  }
  function predict(W, i, H) {
    const p = P.pts[i];
    if (!zahl()) return P.predict(W, p.x);
    const c = clamp(Math.round(zz(W[3], H[i])), 0, 2);
    return S.ord.indexOf(c);
  }

  /* ── Die Welten ── */
  let cells = [];
  function buildGrid() {
    const g = $('#grid');
    g.innerHTML = '';
    g.style.setProperty('--cols', nNeur());
    cells = [];
    for (const pr of [0, 1]) for (let k = 0; k < nNeur(); k++) {
      const el = document.createElement('div');
      const lab = pairsOf(k)[pr].lab;
      el.className = 'cell'; el.style.setProperty('--c', colOf(k));
      el.innerHTML = '<canvas></canvas><span class="t">' + nameOf(k) + ' · ' + lab[0] + ' / ' + lab[1] + '</span><span class="who" hidden></span>';
      g.appendChild(el);
      const cv = el.querySelector('canvas');
      const off = document.createElement('canvas'); off.width = G; off.height = G;
      const c = { k, pr, cv, off, img: off.getContext('2d').createImageData(G, G), dirty: true, drag: null };
      cells.push(c);
      cv.addEventListener('pointerdown', e => { if (S.auto || (MP8 && !MP8.free && !mp8Mine(c))) return; c.drag = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } setFrom(c, e); });
      cv.addEventListener('pointermove', e => { if (c.drag === e.pointerId) setFrom(c, e); });
      const up = e => { if (c.drag === e.pointerId) c.drag = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }
  }
  function setFrom(c, e) {
    if (MP8 && !MP8.free && !mp8Mine(c)) return;
    const r = c.cv.getBoundingClientRect();
    const u = clamp((e.clientX - r.left) / r.width, 0, 1), v = clamp((e.clientY - r.top) / r.height, 0, 1);
    const [i, j] = pairsOf(c.k)[c.pr].idx;
    S.W[c.k][i] = (u * 2 - 1) * R;
    S.W[c.k][j] = (1 - v * 2) * R;
    // „jedes für sich“: nur die andere Welt desselben Neurons ändert sich; beim Zahl-Neuron alle
    if (zahl()) { for (const o of cells) if (o !== c) o.dirty = true; }
    else for (const o of cells) if (o.k === c.k && o.pr !== c.pr) o.dirty = true;
    S.changed = true;
    if (MP8) MP8.dirty = true;
  }
  function dirtyAll() { for (const c of cells) c.dirty = true; S.changed = true; }

  // Farbe aus dem Fehler (logarithmisch), Palette wie die 3D-Landschaft
  // Polarnacht-Palette NET wie die 3D-Welten ab Level 4 (spiel.js): Tal Türkis, oben Flieder
  const PAL_L = ['#0b6e6a', '#2b78b0', '#6d5fd0', '#c9b6f2'], PAL_D = PAL_L;
  const hex = s => { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function color(L, pal, lo, hi) {
    const t = clamp((Math.log(Math.max(L, 1e-4)) - lo) / (hi - lo), 0, 1);
    const f = t * 3, i = Math.min(2, Math.floor(f)), q = f - i;
    return [0, 1, 2].map(c => pal[i][c] + (pal[i + 1][c] - pal[i][c]) * q);
  }
  // Fehler-Funktion über die zwei Werte einer Welt (alles andere steht)
  function sliceFn(c) {
    const [i, j] = pairsOf(c.k)[c.pr].idx;
    if (!zahl()) {
      const w = S.W[c.k].slice();
      return (a, b) => { w[i] = a; w[j] = b; return P.lossK(c.k, w); };
    }
    const H = hidden(S.W), V = S.W[3].slice();
    if (c.k === 3) {
      return (a, b) => {
        V[i] = a; V[j] = b; let s = 0;
        P.pts.forEach((p, n) => { const e = zz(V, H[n]) - S.ord[p.y]; s += e * e; });
        return s / (2 * N);
      };
    }
    const w = S.W[c.k].slice(), k = c.k;
    // Anteil der beiden anderen versteckten Neuronen + Bias vorab
    const rest = H.map(h => { let s = V[3]; for (let q = 0; q < 3; q++) if (q !== k) s += V[q] * h[q]; return s; });
    return (a, b) => {
      w[i] = a; w[j] = b; let s = 0;
      P.pts.forEach((p, n) => { const e = rest[n] + V[k] * sig(zz(w, p.x)) - S.ord[p.y]; s += e * e; });
      return s / (2 * N);
    };
  }
  // Jede Welt bekommt ihre eigene Farbskala (tiefster bis höchster Punkt,
  // logarithmisch) – sonst wirken Welten mit kleinem Unterschied flach.
  // Ist der Unterschied wirklich klein, sagt es ein Hinweis (c.flat).
  function heat(c) {
    const pal = (dark() ? PAL_D : PAL_L).map(hex);
    const f = sliceFn(c), d = c.img.data, band = new Float32Array(G * G), Ls = new Float32Array(G * G);
    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const L = Math.max(f(((x + 0.5) / G * 2 - 1) * R, (1 - (y + 0.5) / G * 2) * R), 1e-6);
      Ls[y * G + x] = L; if (L < mn) mn = L; if (L > mx) mx = L;
    }
    const lo = Math.log(mn), hi = Math.max(Math.log(mx), lo + 1e-3);
    c.flat = mx - mn < 0.03 || mx / mn < 1.15;
    for (let q = 0; q < G * G; q++) {
      const col = color(Ls[q], pal, lo, hi), o = q * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      band[q] = (Math.log(Ls[q]) - lo) / (hi - lo) * 12;
    }
    c.segs = contours(band);
    c.off.getContext('2d').putImageData(c.img, 0, 0);
    c.dirty = false;
  }
  // Höhenlinien als glatte Linien (Marching Squares, Sönke 17.11.2026: die Pixel-Kanten
  // sahen auf großen Kacheln verpixelt aus). v = Höhe in Stufen 0…12, Linien bei 1…11.
  // Ergebnis: Strecken in 0…1 (Anteil der Kachel), gezeichnet in jeder Größe scharf.
  function contours(v) {
    const out = [];
    const P = (x, y) => [(x + 0.5) / G, (y + 0.5) / G];
    for (let y = 0; y < G - 1; y++) for (let x = 0; x < G - 1; x++) {
      const a = v[y * G + x], b = v[y * G + x + 1], cc = v[(y + 1) * G + x + 1], dd = v[(y + 1) * G + x];
      const mn = Math.min(a, b, cc, dd), mx = Math.max(a, b, cc, dd);
      for (let k = Math.max(1, Math.ceil(mn)); k <= Math.min(11, mx); k++) {
        if (k === mn) continue;
        const pts = [];
        const cut = (v0, v1, x0, y0, x1, y1) => {
          if ((v0 < k) === (v1 < k)) return;
          const t = (k - v0) / (v1 - v0);
          pts.push(P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t));
        };
        cut(a, b, x, y, x + 1, y); cut(b, cc, x + 1, y, x + 1, y + 1);
        cut(cc, dd, x + 1, y + 1, x, y + 1); cut(dd, a, x, y + 1, x, y);
        if (pts.length >= 2) out.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        if (pts.length === 4) out.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      }
    }
    return out;
  }
  function drawCell(c, budget) {
    if (c.dirty && budget.left > 0) { heat(c); budget.left--; }
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const W = c.cv.clientWidth, H = c.cv.clientHeight;
    if (!W || !H) return;
    if (c.cv.width !== Math.round(W * dpr) || c.cv.height !== Math.round(H * dpr)) { c.cv.width = Math.round(W * dpr); c.cv.height = Math.round(H * dpr); }
    const x = c.cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(c.off, 0, 0, W, H);
    if (c.segs) {
      x.strokeStyle = 'rgba(235,245,255,.32)'; x.lineWidth = 1; x.lineCap = 'round';
      x.beginPath();
      for (let q = 0; q < c.segs.length; q += 4) { x.moveTo(c.segs[q] * W, c.segs[q + 1] * H); x.lineTo(c.segs[q + 2] * W, c.segs[q + 3] * H); }
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1; x.setLineDash([3, 4]);
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); x.setLineDash([]);
    const pr = pairsOf(c.k)[c.pr], [i, j] = pr.idx;
    x.font = '700 12px Space Grotesk, sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)';
    x.textAlign = 'right'; x.fillText(pr.lab[0] + ' →', W - 6, H / 2 - 5);
    x.textAlign = 'left'; x.fillText('↑ ' + pr.lab[1], W / 2 + 5, H - 8);
    const toPx = (a, b) => [(a / R + 1) / 2 * W, (1 - b / R) / 2 * H];
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (const t of S.trail[c.k]) { const [px, py] = toPx(t[i], t[j]); x.beginPath(); x.arc(px, py, 2, 0, 7); x.fill(); }
    const g = S.g[c.k], gx = -g[i], gy = -g[j], gl = Math.hypot(gx, gy);
    const [px, py] = toPx(S.W[c.k][i], S.W[c.k][j]);
    if (gl > 1e-5) {
      const len = clamp(10 + gl * 60, 12, Math.min(W, H) * 0.35), ux = gx / gl, uy = -gy / gl;
      x.strokeStyle = '#5cf2c4'; x.fillStyle = '#5cf2c4'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px + ux * 10, py + uy * 10); x.lineTo(px + ux * len, py + uy * len); x.stroke();
      const hx = px + ux * (len + 7), hy = py + uy * (len + 7);
      x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx - ux * 9 - uy * 6, hy - uy * 9 + ux * 6); x.lineTo(hx - ux * 9 + uy * 6, hy - uy * 9 - ux * 6); x.fill();
    }
    x.fillStyle = colOf(c.k); x.strokeStyle = '#fff'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); x.stroke();    if (c.flat) {
      const t = 'fast flach';
      x.font = '700 12px Outfit, sans-serif'; x.textAlign = 'center';
      const w = x.measureText(t).width + 14;
      x.fillStyle = css('--surface'); x.globalAlpha = 0.88; x.fillRect(W / 2 - w / 2, H * 0.28 - 11, w, 20); x.globalAlpha = 1;
      x.fillStyle = css('--ink-soft'); x.fillText(t, W / 2, H * 0.28 + 3);
    }
  }

  /* ── Lernen: alle Werte springen gleichzeitig ── */
  function step() {
    const g = gradAll(S.W);
    S.W = S.W.map((w, k) => {
      S.trail[k].push(w.slice()); if (S.trail[k].length > 60) S.trail[k].shift();
      return w.map((v, j) => clamp(v - S.lr * g[k][j], -R, R));
    });
    dirtyAll();
    record();
  }
  function setAuto(on) {
    S.auto = on;
    $('#auto').textContent = on ? 'Training anhalten' : 'Training starten';
    $('#auto').classList.toggle('on', on);
    $('#step').disabled = on;
  }

  /* ── Wolken ── */
  const B = 2.8;
  const toV = f => [f[0], f[2], f[1]];          // 1. Achse rechts, 3. Achse nach oben, 2. Achse in die Tiefe
  function proj(v, w, h) {
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    const x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp;
    const D = 12, f = D / (D + z2), sc = Math.min(w, h) / (2 * B) * 0.56;
    return [w / 2 + x1 * f * sc, h / 2 - y2 * f * sc, z2];
  }
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function planePoly(w) {
    // Ebene w0·a + w1·b + w2·c + w3 = 0 im Würfel [−B, B]³
    const pts = [], c = [-B, B], E = [];
    for (const a of c) for (const b of c) { E.push([[-B, a, b], [B, a, b]]); E.push([[a, -B, b], [a, B, b]]); E.push([[a, b, -B], [a, b, B]]); }
    const f = p => w[0] * p[0] + w[1] * p[1] + w[2] * p[2] + w[3];
    for (const [p, q] of E) {
      const fp = f(p), fq = f(q);
      if ((fp < 0) === (fq < 0) || fp === fq) continue;
      const t = fp / (fp - fq);
      pts.push(p.map((v, i) => v + (q[i] - v) * t));
    }
    if (pts.length < 3) return null;
    const cen = [0, 1, 2].map(i => pts.reduce((a, p) => a + p[i], 0) / pts.length);
    const n = [w[0], w[1], w[2]], nl = Math.hypot(...n) || 1;
    let u = Math.abs(n[0]) < 0.9 * nl ? [1, 0, 0] : [0, 1, 0];
    u = cross(n, u); const v = cross(n, u);
    const ang = p => { const d = p.map((x, i) => x - cen[i]); return Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]); };
    pts.sort((a, b) => ang(a) - ang(b));
    return { pts, cen, n: n.map(x => x / nl) };
  }
  function prepCanvas(cv) {
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    return { x, W, H };
  }
  function cube(x, P2) {
    x.strokeStyle = css('--ink-faint'); x.globalAlpha = 0.45; x.lineWidth = 1;
    const c = [-B, B];
    for (const a of c) for (const b of c) for (const [p, q] of [[[-B, a, b], [B, a, b]], [[a, -B, b], [a, B, b]], [[a, b, -B], [a, b, B]]]) {
      const s = P2(p), e = P2(q); x.beginPath(); x.moveTo(s[0], s[1]); x.lineTo(e[0], e[1]); x.stroke();
    }
    x.globalAlpha = 1;
  }
  function plane(x, P2, w, color, arrow, label) {
    const pl = planePoly(w);
    if (!pl) return;
    x.fillStyle = color; x.strokeStyle = color;
    x.globalAlpha = 0.16; x.beginPath();
    pl.pts.forEach((p, i) => { const s = P2(p); i ? x.lineTo(s[0], s[1]) : x.moveTo(s[0], s[1]); });
    x.closePath(); x.fill();
    x.globalAlpha = 0.85; x.lineWidth = 1.6; x.stroke();
    const a = P2(pl.cen);
    if (arrow) {
      const e = P2(pl.cen.map((v, i) => v + pl.n[i] * 0.9));
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(e[0], e[1]); x.stroke();
      x.beginPath(); x.arc(e[0], e[1], 3.5, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    if (label) { x.font = '700 12px Outfit, sans-serif'; x.textAlign = 'center'; x.fillStyle = color; x.fillText(label, a[0], a[1] - 6); }
  }
  function points(x, P2, pos, bad) {
    const red = css('--warn');
    const list = P.pts.map((p, i) => ({ p, s: P2(pos(i)), i })).sort((a, b) => b.s[2] - a.s[2]);
    for (const { p, s, i } of list) {
      x.fillStyle = SPC[p.y];
      x.beginPath();
      if (p.y === 1) { x.moveTo(s[0], s[1] - 3.6); x.lineTo(s[0] + 3.3, s[1] + 2.4); x.lineTo(s[0] - 3.3, s[1] + 2.4); x.closePath(); }
      else if (p.y === 2) x.rect(s[0] - 2.6, s[1] - 2.6, 5.2, 5.2);
      else x.arc(s[0], s[1], 3, 0, 7);
      x.fill();
      if (bad[i]) { x.strokeStyle = red; x.lineWidth = 1.4; x.beginPath(); x.arc(s[0], s[1], 5.5, 0, 7); x.stroke(); }
    }
  }
  function axisLabels(x, P2, names) {
    x.font = '700 12px Outfit, sans-serif'; x.textAlign = 'center';
    let top = null;
    for (const a of [-B, B]) for (const b of [-B, B]) { const q = P2([a, b, B]); if (!top || q[0] < top[0]) top = q; }
    for (const [v, t] of [[[B + 0.35, -B, -B], names[0]], [null, names[2] + ' ↑'], [[-B, B + 0.35, -B], names[1]]]) {
      const s = v ? P2(v) : [top[0], top[1] - 12];
      const w = x.measureText(t).width + 10;
      x.fillStyle = css('--surface'); x.globalAlpha = 0.8; x.fillRect(s[0] - w / 2, s[1] - 9, w, 16); x.globalAlpha = 1;
      x.fillStyle = css('--ink'); x.fillText(t, s[0], s[1] + 3);
    }
  }
  function drawClouds() {
    const H = zahl() ? hidden(S.W) : null;
    const bad = P.pts.map((p, i) => predict(S.W, i, H) !== p.y);
    // Wolke 1: Messwerte, Ebenen der Neuronen A/B/C bzw. Adelie?/Zügel?/Esel?
    const c1 = prepCanvas($('#cloud'));
    if (c1) {
      const P2 = v => proj(toV(v), c1.W, c1.H);
      cube(c1.x, P2);
      const order = [0, 1, 2].filter(k => S.show[k]).map(k => ({ k, z: (() => { const pl = planePoly(S.W[k]); return pl ? P2(pl.cen)[2] : 0; })() }))
        .sort((a, b) => b.z - a.z);
      for (const { k } of order) plane(c1.x, P2, S.W[k], colOf(k), true, zahl() ? nameOf(k) : '');
      points(c1.x, P2, i => P.pts[i].x, bad);
      axisLabels(c1.x, P2, ['Schnabellänge', 'Schnabelhöhe', 'Flossenlänge']);
    }
    // Wolke 2: was das Zahl-Neuron sieht (Antworten von A, B, C als Würfel 0…100 %)
    if (zahl()) {
      const c2 = prepCanvas($('#cloud2'));
      if (c2) {
        const P2 = v => proj(toV(v), c2.W, c2.H);
        cube(c2.x, P2);
        const toB = h => h.map(v => (v * 2 - 1) * B);
        // V·h + c = t  mit h = (v/B + 1)/2  →  (V/2B)·v + (ΣV/2 + c − t) = 0
        const V = S.W[3], sumV = V[0] + V[1] + V[2];
        for (const t of [1.5, 0.5]) plane(c2.x, P2, [V[0] / (2 * B), V[1] / (2 * B), V[2] / (2 * B), sumV / 2 + V[3] - t], OUT, false, fmt(t, 1));
        points(c2.x, P2, i => toB(H[i]), bad);
        axisLabels(c2.x, P2, ['A sagt ja', 'B sagt ja', 'C sagt ja']);
      }
    }
  }
  function cloudInput(cv) {
    cv.addEventListener('pointerdown', e => { S.rot = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    cv.addEventListener('pointermove', e => {
      if (!S.rot || S.rot.id !== e.pointerId) return;
      S.yaw += (e.clientX - S.rot.x) * 0.01; S.pitch = clamp(S.pitch + (e.clientY - S.rot.y) * 0.008, -1.2, 1.2);
      S.rot.x = e.clientX; S.rot.y = e.clientY; S.idle = 0;
    });
    const up = () => { S.rot = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  /* ── Netz: alle Werte direkt an den Kanten, Bias unter dem Neuron ── */
  // Die Zahl steht bei zwei Dritteln der Kante (labelAt 0,66): dort liegen
  // die 9 Zahlen einer Schicht in einer sauberen Spalte untereinander.
  // Der Bias steht IM Neuron unter dem σ (biasInside).
  function drawNet() {
    const ys = [0.1, 0.5, 0.9];
    const ins = [0, 1, 2].map(i => ({ id: 'i' + i, kind: 'in', x: 0.04, y: ys[i], label: ['Länge', 'Höhe', 'Flosse'][i] }));
    const bias = (k, col) => ({ bias: S.W[k][3], biasD: 1, biasGroup: col });
    if (!zahl()) {
      NTNetz.draw($('#net'), { biasInside: true,
        nodes: [...ins,
          ...[0, 1, 2].map(k => ({ id: 'n' + k, kind: 'n', x: 0.7, y: ys[k], group: SPC[k], ...bias(k, SPC[k]) })),
          ...[0, 1, 2].map(k => ({ id: 'o' + k, kind: 'out', x: 0.86, y: ys[k], label: NAMES[k] + '?' }))],
        edges: [
          ...[0, 1, 2].flatMap(k => [0, 1, 2].map(i => ({ from: 'i' + i, to: 'n' + k, w: S.W[k][i], group: SPC[k], labelAt: 0.66 }))),
          ...[0, 1, 2].map(k => ({ from: 'n' + k, to: 'o' + k, w: 1, group: 'fix', fixed: true, noLabel: true }))]
      });
      return;
    }
    // Zahl-Modus: Messwerte links (#exL) und Zahlenstrahl rechts (#exR) stehen neben der Leinwand
    const act = k => EX.i >= 0 ? sig(zz(S.W[k], P.pts[EX.i].x)) : null;
    // Level 8 gemeinsam am Tablet: nur die eigenen Werte hell mit Zahl, der Rest zurückgenommen
    const F = WK.on ? WK.focus : null, own = (k, i) => !F || F.has(k * 4 + i);
    const ownN = k => !F || [0, 1, 2, 3].some(i => F.has(k * 4 + i)) || (k < 3 && F.has(12 + k));
    NTNetz.draw($('#net'), { biasInside: true, big: BIG.k === 'net',
      nodes: [...ins.map(n => ({ ...n, x: 0, label: '' })),
        ...[0, 1, 2].map(k => ({ id: 'h' + k, kind: 'n', x: 0.56, y: ys[k], group: HID[k], ...bias(k, HID[k]),
          label: nameOf(k) + (act(k) != null ? ' ' + Math.round(act(k) * 100) + ' %' : ''), act: act(k), dim: !ownN(k), biasHide: !own(k, 3) })),
        { id: 'z', kind: 'n', x: 0.97, y: 0.5, group: OUT, sym: 'Σ', ...bias(3, OUT), dim: !ownN(3), biasHide: !own(3, 3) }],
      edges: [
        ...[0, 1, 2].flatMap(k => [0, 1, 2].map(i => ({ from: 'i' + i, to: 'h' + k, w: S.W[k][i], group: HID[k], labelAt: 0.6, dim: !own(k, i) }))),
        ...[0, 1, 2].map(k => ({ from: 'h' + k, to: 'z', w: S.W[3][k], group: OUT, labelAt: 0.66, dim: !own(3, k) }))]
    });
  }
  function table() {
    const H = zahl() ? hidden(S.W) : null;
    const hit = [0, 0, 0];
    P.pts.forEach((p, i) => { if (predict(S.W, i, H) === p.y) hit[p.y]++; });
    $('#hits').innerHTML = '<span>erkannt:</span>' + [0, 1, 2].map(k => '<span style="color:' + SPC[k] + '">' + pimg(k) + '<b>' + NAMES[k] + '</b> ' + hit[k] + '/' + counts[k] + '</span>').join('');
    $('#sWrong').textContent = (N - hit[0] - hit[1] - hit[2]) + ' von ' + N;
    $('#sLoss').textContent = fmt(lossAll(S.W), 2);
  }

  /* ── Pinguin für Pinguin (Level 8, Sönke 17./18.11.2026, wie Level 5) ──
     Alle 1,6 s ein anderer echter Pinguin. Wie in Level 5 rund ums Netz:
     links der Pinguin mit seinen Messwerten (je Wert auf Höhe seines Eingangs),
     in den Neuronen A, B, C ihre Antwort in %, rechts der Zahlenstrahl
     senkrecht mit den drei Köpfen. Gewählte Art grün ✓ / rot ✗, bei falsch
     die echte gestrichelt mit „ECHT“. */
  const EX = { order: null, i: -1 };
  const SPN = ['adelie', 'chin', 'gentoo'];
  const IN_Y = [0.1, 0.5, 0.9];
  const exT = (id, x, y, size, w, anchor, fill, txt, cls) => '<text' + (id ? ' id="' + id + '"' : '') + (cls ? ' class="' + cls + '"' : '') +
    ' x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + w + '" text-anchor="' + anchor + '" fill="' + fill + '">' + (txt || '') + '</text>';
  const NY0 = 30, NY1 = 250, NV0 = -0.5, NV1 = 2.5, LX = 16;   // Zahlenstrahl senkrecht: oben 2,5, unten −0,5
  const NY = v => NY0 + (NV1 - clamp(v, NV0, NV1)) / (NV1 - NV0) * (NY1 - NY0);
  function exBuild() {
    const L = $('#exL'), R = $('#exR');
    if (!L || L.dataset.ok) return;
    L.dataset.ok = '1';
    L.innerHTML = '<div class="exPg"><b id="exName"></b><svg viewBox="0 0 60 112" id="exPg"></svg></div>' +
      ['Länge', 'Höhe', 'Flosse'].map((t, k) => '<div class="exV" style="top:calc(14px + ' + IN_Y[k] + ' * (100% - 28px))"><small>' + t + '</small><b id="exV' + k + '"></b></div>').join('');
    let h = exT('', 2, 13, 11, 700, 'start', 'var(--ink-faint)', 'Zahl') + exT('exZ', 112, 13, 13, 800, 'end', OUT, '', 'mono');
    const cut = [NV0, 0.5, 1.5, NV1];
    [0, 1, 2].forEach(n => {
      const top = NY(cut[n + 1]) + 1.5, bot = NY(cut[n]) - 1.5, sp = S.ord.indexOf(n), cy = (top + bot) / 2;
      h += '<rect id="exR' + n + '" x="24" y="' + top + '" width="90" height="' + (bot - top) + '" rx="10" fill="none" stroke-width="2"/>' +
        NTBild.head(SPN[sp], 50, cy - 9, 15) +
        exT('', 50, cy + 18, 10, 700, 'middle', SPC[sp], NAMES[sp]) +
        exT('', 50, cy + 29, 8.5, 600, 'middle', 'var(--ink-faint)', ['unter 0,5', '0,5 – 1,5', 'über 1,5'][n]) +
        '<g id="exB' + n + '"></g>';
    });
    h += '<line x1="' + LX + '" y1="' + NY0 + '" x2="' + LX + '" y2="' + NY1 + '" stroke="var(--ink-faint)" stroke-width="1.4"/>';
    for (const v of [0, 1, 2]) h += '<line x1="' + (LX - 3) + '" y1="' + NY(v) + '" x2="' + (LX + 3) + '" y2="' + NY(v) + '" stroke="var(--ink-faint)" stroke-width="1.4"/>' +
      exT('', LX - 5, NY(v) + 3.5, 9, 600, 'end', 'var(--ink-faint)', String(v), 'mono');
    h += '<g id="exM"><path d="M' + (LX + 1) + ',0 L' + (LX - 9) + ',-6 L' + (LX - 9) + ',6Z" fill="' + OUT + '"/></g>';
    R.innerHTML = h;
  }
  function exPick() {
    if (!EX.order) {
      const o = P.pts.map((p, i) => i);
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      EX.order = o;
    }
    return EX.order[Math.floor(performance.now() / 1600) % EX.order.length];
  }
  function drawEx() {
    if (!zahl() || EX.i < 0) return;
    exBuild();
    const p = P.pts[EX.i], hv = [0, 1, 2].map(k => sig(zz(S.W[k], p.x))), z = zz(S.W[3], hv);
    const n = clamp(Math.round(z), 0, 2), pick = S.ord.indexOf(n), ok = pick === p.y;
    const raw = [p.len, p.dep, p.fl];
    if ($('#exPg').dataset.i !== String(EX.i)) {
      $('#exPg').dataset.i = String(EX.i);
      $('#exPg').innerHTML = NTBild.peng({ sp: SPN[p.y], x: 30, y: 110, s: 1.02 });
      $('#exName').textContent = NAMES[p.y];
      $('#exName').style.color = SPC[p.y];
      [0, 1, 2].forEach(k => { $('#exV' + k).textContent = fmt(raw[k], k === 2 ? 0 : 1) + ' mm'; });
    }
    $('#exZ').textContent = fmt(z, 2);
    $('#exM').setAttribute('transform', 'translate(0 ' + NY(z).toFixed(1) + ')');
    for (const q of [0, 1, 2]) {
      const sp = S.ord.indexOf(q), on = q === n, echt = !ok && sp === p.y, r = $('#exR' + q);
      r.setAttribute('fill', on ? (ok ? 'rgba(92,242,196,.16)' : 'rgba(255,107,139,.16)') : 'none');
      r.setAttribute('stroke', on ? (ok ? 'var(--accent)' : 'var(--warn)') : echt ? 'var(--accent)' : 'transparent');
      r.setAttribute('stroke-dasharray', echt ? '4 3' : 'none');
      const xr = 114, yt = +r.getAttribute('y');
      $('#exB' + q).innerHTML = on
        ? '<circle cx="' + (xr - 10) + '" cy="' + (yt + 10) + '" r="8" fill="' + (ok ? 'var(--accent)' : 'var(--warn)') + '"/>' +
          '<text x="' + (xr - 10) + '" y="' + (yt + 14) + '" font-size="11" font-weight="800" text-anchor="middle" fill="#04201a">' + (ok ? '✓' : '✗') + '</text>'
        : echt ? '<rect x="' + (xr - 34) + '" y="' + (yt + 4) + '" width="28" height="12" rx="6" fill="var(--accent)"/>' +
          '<text x="' + (xr - 20) + '" y="' + (yt + 13) + '" font-size="8.5" font-weight="800" text-anchor="middle" fill="#04201a">ECHT</text>' : '';
    }
  }

  /* ── Lernkurve: Fehler nach jedem Lernschritt; ändert sich die Lernrate,
     steht dort ein Strich mit der neuen Lernrate ── */
  function drawCurve() {
    const cv = $('#lcurve');
    const c = prepCanvas(cv);
    if (!c) return;
    const { x, W, H } = c, v = S.hist;
    const n = Math.max(30, v.length), lo = 0, hi = Math.max(...v.map(h => h.L), 1e-3) * 1.08;
    const X = i => 4 + i / (n - 1) * (W - 8), Y = L => 3 + (1 - (L - lo) / (hi - lo)) * (H - 7);
    x.strokeStyle = css('--ink-faint'); x.globalAlpha = 0.4; x.lineWidth = 1;
    x.beginPath(); x.moveTo(4, H - 4); x.lineTo(W - 4, H - 4); x.stroke(); x.globalAlpha = 1;
    x.font = '700 9.5px JetBrains Mono, monospace'; x.textBaseline = 'top';
    let lastLr = null, lastLab = -99;
    v.forEach((h, i) => {
      if (h.lr !== lastLr) {
        const px = X(i);
        x.strokeStyle = css('--orange'); x.globalAlpha = 0.55; x.setLineDash([2, 3]);
        x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H - 4); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
        if (px - lastLab > 34) { x.fillStyle = css('--orange'); x.textAlign = 'left'; x.fillText(fmt(h.lr, h.lr < 1 ? 2 : 1), px + 2, 0); lastLab = px; }
        lastLr = h.lr;
      }
    });
    x.strokeStyle = '#5cf2c4'; x.lineWidth = 2; x.lineJoin = 'round';
    x.beginPath();
    v.forEach((h, i) => i ? x.lineTo(X(i), Y(h.L)) : x.moveTo(X(i), Y(h.L)));
    x.stroke();
    if (v.length) { x.fillStyle = '#5cf2c4'; x.beginPath(); x.arc(X(v.length - 1), Y(v[v.length - 1].L), 3, 0, 7); x.fill(); }
    x.textBaseline = 'alphabetic';
  }

  /* ── Steuerung ── */
  function lrUI() {
    const R0 = MODES[S.mode].lr, el = $('#lr');
    el.value = Math.round(Math.log(R0.def / R0.min) / Math.log(R0.max / R0.min) * 1000);
    setLR(R0.def);
  }
  function setLR(v) { S.lr = v; $('#lrV').textContent = fmt(v, v < 1 ? 2 : 1); }
  function legends() {
    const chip = (k, shape) => '<span class="chip" style="--c:' + SPC[k] + '">' + pimg(k, 'img') + '<i class="' + shape + '"></i>' + NAMES[k] + ' (' + counts[k] + ')</span>';
    const shapes = ['', 'tri', ''];
    const pts = [0, 1, 2].map(k => chip(k, shapes[k])).join('');
    const btns = [0, 1, 2].map(k => '<button type="button" data-k="' + k + '" class="' + (S.show[k] ? '' : 'off') + '" style="--c:' + colOf(k) + '"><i></i>' +
      (zahl() ? 'Ebene ' + nameOf(k) : NAMES[k] + '?') + '</button>').join('');
    $('#legend').innerHTML = (zahl() ? pts : '') + btns + '<small>ziehen = drehen</small>';
    for (const b of document.querySelectorAll('#legend button')) b.addEventListener('click', () => {
      const k = +b.dataset.k; S.show[k] = !S.show[k]; b.classList.toggle('off', !S.show[k]);
    });
    if (zahl()) {
      const by = [0, 1, 2].map(n => NAMES[S.ord.indexOf(n)]);
      $('#legend2').innerHTML = '<span class="chip" style="--c:' + OUT + '"><i></i>Was das Zahl-Neuron sieht</span>' +
        '<small>unter 0,5 = ' + by[0] + ' · bis 1,5 = ' + by[1] + ' · darüber = ' + by[2] + '</small>';
    }
    $('#netTitle').textContent = zahl() ? 'Das Netz · 3 Eingänge → A, B, C → Zahl-Neuron' : 'Das Netz · 3 Eingänge → 3 Neuronen';
  }
  function setMode(m) {
    setAuto(false);
    S.mode = m;
    document.body.dataset.mode = m;
    for (const b of document.querySelectorAll('#mode button')) b.classList.toggle('on', b.dataset.m === m);
    buildGrid();
    lrUI();
    rnd();
    legends();
  }
  function controls() {
    $('#lr').addEventListener('input', e => {
      const R0 = MODES[S.mode].lr, v = R0.min * Math.pow(R0.max / R0.min, e.target.value / 1000);
      setLR(+v.toFixed(v < 1 ? 2 : 1));
    });
    $('#step').addEventListener('click', () => { if (!S.auto) step(); });
    $('#auto').addEventListener('click', () => setAuto(!S.auto));
    $('#rnd').addEventListener('click', () => { setAuto(false); rnd(); });
    for (const b of document.querySelectorAll('#mode button')) b.addEventListener('click', () => setMode(b.dataset.m));
  }

  /* ── Level 8: Erklärkarte ── */
  function intro() {
    $('.head h1').textContent = 'Level 8 · Pinguine in 3D';
    $('.head a.btn').textContent = '‹ Übersicht';
    const steps = [
      'Drei Neuronen <b>A, B, C</b> schauen auf Schnabel und Flosse. Was sie erkennen, lernen sie selbst.',
      'Das <b>Zahl-Neuron</b> rechnet daraus: unter 0,5 = Adelie, bis 1,5 = Zügel, darüber = Esel.',
      '16 Werte = <b>8 Welten</b>. Ziehst du in einer, verbiegen sich die anderen.'];
    const c = $('#card');
    c.innerHTML = '<div class="card-in is-intro"><div class="i-head"><div class="card-kicker">Level 8</div><h2>Pinguine in 3D</h2>' +
      '<p class="lead">Jetzt soll ein ganzes Netz <b>alle drei Pinguinarten</b> – Adelie, Zügel und Esel – nur an <b>Schnabel und Flosse</b> erkennen.</p></div>' +
      '<div class="i-pic">' + (window.NTBild ? '<div class="illwrap">' + NTBild.scene(8) + '</div>' : '') + '</div>' +
      '<div class="i-txt"><ol class="steps">' + steps.map(t => '<li>' + t + '</li>').join('') + '</ol></div>' +
      '<div class="card-btns"><button class="btn primary" type="button" id="go">Los geht’s</button>' +
      '<a class="btn" href="index.html">Übersicht</a></div></div>';
    c.hidden = false;
    $('#go').addEventListener('click', () => { c.hidden = true; S.changed = true; });
  }

  /* ── Level 8 gemeinsam (js/mehr.js, Migration 0296) ──
     labor.html?level=8&mp=1 im Raum: ein Team = ein Netz. Jede Person zieht nur in IHREN Welten
     (slots vom Server, Welt s = Neuron floor(s/2), oben/unten = s gerade/ungerade); die anderen
     Welten bewegen die Mitspielenden live. Kein Lernschritt, kein Training – nur laufen, Ende nach
     Zeit. Start für alle Teams gleich (NTRaum.l8.init aus der Welt-Nummer der Runde).
     Lehrkraft: &team=n = dieses Team beobachten (nichts ziehbar), „‹ Übersicht“ zurück. */
  const MQ = new URLSearchParams(location.search);
  const MP8 = LEVEL8 && MQ.get('mp') === '1' && window.NTRaum && NTRaum.inRoom
    ? { watch: NTRaum.isTeacher ? (parseInt(MQ.get('team'), 10) || 0) : null, st: null, seed: 0, run: 0,
        dirty: false, sent: '', last: 0, busy: false, phase: '', shown: '', team: null, mine: new Set(), names: {}, rec: 0 }
    : null;
  function mp8Mine(c) { return !!MP8 && MP8.watch === null && MP8.mine.has(c.k * 2 + c.pr) && !mp8Done(); }
  // Runde vorbei am Tablet: nur noch ansehen (Wolken drehen, Kästen groß), nichts mehr ändern
  function mp8Done() { return !!MP8 && MP8.st && MP8.st.phase === 'ended'; }
  function mp8Vals() {
    const v = {};
    for (const s of MP8.mine) { const q = NTRaum.l8.idx(s); v[s] = [+S.W[q.k][q.i[0]].toFixed(4), +S.W[q.k][q.i[1]].toFixed(4)]; }
    return v;
  }
  function mp8Card(html, btns) {
    const c = $('#card');
    c.innerHTML = '<div class="card-in' + (html.indexOf('i-head') >= 0 ? ' is-intro' : '') + '">' + html + '<div class="card-btns"></div></div>';
    const box = c.querySelector('.card-btns');
    for (const [label, fn, kind] of btns || []) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (kind || ''); b.textContent = label;
      b.addEventListener('click', fn); box.appendChild(b);
    }
    c.hidden = false;
  }
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function mp8Intro(ready) {
    const steps = [
      'Euer Team ist <b>ein Netz</b>: drei Neuronen A, B, C und das Zahl-Neuron – 16 Werte, <b>8 Welten</b>.',
      MP8.mine.size ? 'Du läufst in <b>' + (MP8.mine.size === 1 ? 'deiner Welt' : 'deinen ' + MP8.mine.size + ' Welten') +
        '</b> und suchst den tiefsten Punkt. Die anderen Welten bewegt dein Team.' : 'Du schaust zu.',
      'Läuft jemand, verbiegt sich deine Welt. <b>Sprecht euch ab!</b> Am Ende zählt, wie viele Pinguine euer Netz richtig sortiert.'];
    mp8Card('<div class="i-head"><div class="card-kicker">Level 8 · gemeinsam · Welt ' + MP8.seed + '</div><h2>Pinguine in 3D</h2>' +
      '<p class="lead">Euer Team trainiert <b>ein Netz</b>, das <b>alle drei Pinguinarten</b> an Schnabel und Flosse erkennen soll.</p></div>' +
      '<div class="i-pic">' + (window.NTBild ? '<div class="illwrap">' + NTBild.scene(8) + '</div>' : '') + '</div>' +
      '<div class="i-txt"><ol class="steps">' + steps.map(t => '<li>' + t + '</li>').join('') + '</ol>' +
      mp8TeamHtml() + '</div>',
      MP8.watch !== null ? [['‹ Übersicht', mp8Back]] : ready ? [['Warte auf den Start …', () => {}, 'wait']]
        : [['Bereit!', () => { MP8.ready = true; mp8Intro(true); mp8Send({ ready: true }); }, 'primary']]);
  }
  // Teams heißen nach ihrer Reihenfolge (Team 1, 2, …), wie in der Übersicht der Lehrkraft
  function mp8Label(t) {
    const st = MP8.st;
    const ids = st ? [...new Set(st.people.filter(p => p.in && p.t !== null).map(p => p.t))].sort((a, b) => a - b) : [];
    return NTRaum.teamName(Math.max(0, ids.indexOf(t)));
  }
  function mp8TeamIdx(t) {
    const st = MP8.st;
    const ids = st ? [...new Set(st.people.filter(p => p.in && p.t !== null).map(p => p.t))].sort((a, b) => a - b) : [];
    return Math.max(0, ids.indexOf(t));
  }
  // das eigene Team als Pinguine mit Schalfarbe und Zahl der Welten (statt „Mia (2), Leon (2)“)
  function mp8TeamHtml(center) {
    const t = MP8.team || [], myT = MP8.watch !== null ? MP8.watch : MP8.st && MP8.st.me && MP8.st.me.t, i = mp8TeamIdx(myT);
    const meId = MP8.st && MP8.st.me && MP8.st.me.id;
    return '<div class="mp8team" style="--tc:' + NTRaum.teamColor(i) + (center ? ';justify-content:center;margin-top:12px' : '') + '"><span class="tn">' +
      (MP8.watch !== null ? mp8Label(myT) : 'Dein Team') + '</span>' +
      t.map(p => '<span class="p' + (p.id === meId ? ' me' : '') + '">' + NTRaum.pingu(p.c) + esc(p.id === meId ? 'Du' : p.n) +
        '<small>' + p.s.length + (p.s.length === 1 ? ' Welt' : ' Welten') + '</small></span>').join('') + '</div>';
  }
  function mp8Back() { location.href = 'index.html'; }
  function mp8Apply(st) {
    MP8.st = st;
    NTRaum.clock(st);
    if (st.phase === 'off' || st.phase === 'lobby' || st.level !== 8) { mp8Back(); return; }
    const myT = MP8.watch !== null ? MP8.watch : st.me && st.me.t;
    const inRound = MP8.watch !== null || (st.me && st.me.in);
    if (!inRound) { mp8Back(); return; }
    MP8.team = st.people.filter(p => p.in && p.t === myT);
    if (MP8.watch === null) MP8.mine = new Set((st.me && st.me.s) || []);
    MP8.names = {};
    for (const p of MP8.team) for (const sl of p.s) MP8.names[sl] = p;
    // neue Runde / erste Antwort: Startwerte aus der Welt-Nummer, eigene Werte vom Server übernehmen
    if (MP8.run !== st.run || MP8.seed !== st.seed) {
      MP8.run = st.run; MP8.seed = st.seed; MP8.dirty = false; MP8.shown = ''; MP8.ready = !!(st.me && st.me.r);
      mp8Free(false);
      S.W = NTRaum.l8.W(st.seed, NTRaum.teamVals(MP8.team));
      S.trail = S.W.map(() => []); S.hist = []; record();
      if (MP8.watch === null && MP8.mine.size) wkStart(); else wkOff();
      for (const c of cells) {
        const sl = c.k * 2 + c.pr, el = c.cv.parentElement, who = el.querySelector('.who'), p = MP8.names[sl];
        el.classList.toggle('mine', mp8Mine(c));
        who.hidden = !p;
        if (p) { who.textContent = mp8Mine(c) ? 'Du' : p.n; who.style.setProperty('--pc', NTRaum.color(p.c)); }
      }
      dirtyAll();
    } else if (!MP8.free) {
      // Werte der anderen übernehmen (eigene nur, solange man selbst nicht zieht)
      const tv = NTRaum.teamVals(MP8.team);
      let ch = false;
      for (let sl = 0; sl < 8; sl++) {
        if (MP8.watch === null && MP8.mine.has(sl)) continue;
        const v = tv[sl]; if (!Array.isArray(v)) continue;
        const q = NTRaum.l8.idx(sl), w = S.W[q.k];
        if (Math.abs(w[q.i[0]] - v[0]) > 1e-4 || Math.abs(w[q.i[1]] - v[1]) > 1e-4) {
          WK.ext = true;
          S.trail[q.k].push(w.slice()); if (S.trail[q.k].length > 60) S.trail[q.k].shift();
          w[q.i[0]] = v[0]; w[q.i[1]] = v[1]; ch = true;
        }
      }
      if (ch) dirtyAll();
    }
    const ph = st.phase;
    $('#mpChip').hidden = false;
    if (ph === 'intro') { if (MP8.shown !== 'intro' + MP8.ready) { MP8.shown = 'intro' + MP8.ready; mp8Intro(MP8.ready); } }
    else if (ph === 'countdown') {
      const n = Math.max(1, Math.ceil(NTRaum.left(st.countdown_ends_at) || 0));
      if (MP8.shown !== 'cd' + n) { MP8.shown = 'cd' + n; mp8Card('<div class="cdown">' + n + '</div>' + mp8TeamHtml(true), []); }
    } else if (ph === 'running') {
      if (MP8.shown !== 'run') { MP8.shown = 'run'; $('#card').hidden = true; }
    } else if (ph === 'ended') {
      if (MP8.shown !== 'end') { MP8.shown = 'end'; mp8Result(); }
    }
  }
  // Runde vorbei: Leiste unten statt Karte (Sönke 18.11.2026) – das Netz bleibt zu sehen, und mit
  // „Weiter trainieren“ (Lernschritt/Training wie allein, zählt nicht mehr) sieht man, wie gut es noch wird.
  function mp8Result() {
    const st = MP8.st, teams = {};
    for (const p of st.people) if (p.in && p.t !== null) (teams[p.t] = teams[p.t] || []).push(p);
    const rank = Object.keys(teams).map(t => ({ t: +t, sc: NTRaum.l8.score(st.seed, NTRaum.teamVals(teams[t])) }))
      .sort((a, b) => a.sc.wrong - b.sc.wrong || a.sc.loss - b.sc.loss);
    const myT = MP8.watch !== null ? MP8.watch : st.me && st.me.t;
    const i = rank.findIndex(r => r.t === myT), me = rank[i];
    if (me) S.W = me.sc.W;
    S.trail = S.W.map(() => []);
    dirtyAll();
    MP8.end = { place: rank.length > 1 && i >= 0 ? 'Platz <b>' + (i + 1) + '</b> von ' + rank.length : 'Geschafft!',
      line: (MP8.watch !== null ? mp8Label(myT) : 'Euer Netz') + ' sortiert <b>' + (me ? me.sc.n - me.sc.wrong : 0) + ' von ' + (me ? me.sc.n : 342) +
        '</b> Pinguinen richtig <small>· Fehler ' + fmt(me ? me.sc.loss : 0, 3) + '</small>', steps: S.hist.length, myT,
      // Punkte aller Teams (Sönke 18.11.2026: „die User sollen auch die Punkte sehen“)
      rank: rank.length > 1 ? rank.map((r, j) => {
        const ti = mp8TeamIdx(r.t);
        return '<li class="' + (r.t === myT ? 'me' : '') + '" style="--tc:' + NTRaum.teamColor(ti) + '"><span class="n">' + (j + 1) + '</span><span class="tn">' +
          (r.t === myT && MP8.watch === null ? 'Ihr' : NTRaum.teamName(ti)) + '</span><span class="pgs">' + teams[r.t].map(p => NTRaum.pingu(p.c)).join('') +
          '</span><b class="pt">' + (r.sc.n - r.sc.wrong) + '</b><small>von ' + r.sc.n + '</small></li>';
      }).join('') : '' };
    $('#card').hidden = true;
    if (MP8.watch !== null) { if (!WK.on) mp8Free(true); }   // Lehrkraft: jetzt selbst trainieren / neu würfeln
    else {
      // Tablet: wie die Lehrkraft das ganze Netz sehen – Wolken, alle 8 Welten, Netz –, nur ansehen
      // (Sönke 18.11.2026: „ihr eigenes trainiertes Netz analysieren“); „Deine Welt“ holt die 3D-Welt zurück
      document.body.classList.add('mp8-end');
      if (WK.on) { wkStop(); wkView(false); }
    }
    mp8Bar();
  }
  // Tablet nach der Runde: zwischen ganzem Netz (Übersicht) und der eigenen 3D-Welt umschalten
  function wkView(on) {
    if (!WK.list.length) return;
    WK.on = on;
    document.body.classList.toggle('wk', on);
    $('#wk').hidden = !on;
    if (on) { bigSet(null); $('#netTitle').textContent = 'Dein Teil des Netzes'; for (const wv of WK.list) wv.sig = ''; }
    else legends();
    dirtyAll(); S.changed = true;
    mp8Bar();
  }
  function mp8Bar() {
    const e = MP8.end; if (!e) return;
    const more = S.hist.length - e.steps, b = $('#endbar');
    let now = '';
    if (MP8.free && more > 0) {
      const sc = NTRaum.l8.score(MP8.seed, null, S.W);
      now = '<br><small>weiter trainiert (+' + more + ', zählt nicht mehr):</small> <b>' + (sc.n - sc.wrong) + ' von ' + sc.n + '</b> richtig';
    }
    const tip = MP8.watch === null && !WK.on ? '<br><small>Euer Netz zum Ansehen: Kästen antippen = groß, Wolken drehen.</small>' : '';
    b.innerHTML = '<div class="eb-res"><div class="eb-place">' + e.place + '</div><div class="eb-txt"><div class="eb-kick">Level 8 · Runde vorbei</div>' +
      '<div class="eb-line">' + e.line + now + tip + '</div></div></div><div class="eb-btns"></div>' + (e.rank ? '<ol class="eb-rank">' + e.rank + '</ol>' : '');
    const box = b.querySelector('.eb-btns');
    const add = (label, fn, kind) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn ' + (kind || ''); x.textContent = label; x.addEventListener('click', fn); box.appendChild(x); return x; };
    // Sönke 18.11.2026: kein „Und die KI?“, kein „Weiter trainieren“ am Tablet; die Lehrkraft kann im
    // Netz eines Teams nach der Runde selbst trainieren und neu würfeln (mp8Free, Knöpfe in der Leiste oben)
    if (MP8.watch !== null) add('‹ Übersicht', mp8Back, 'primary');
    else if (WK.list.length) add(WK.on ? 'Ganzes Netz ansehen' : (WK.list.length > 1 ? 'Deine Welten' : 'Deine Welt') + ' in 3D', () => wkView(!WK.on), WK.on ? 'primary' : '');
    b.hidden = false;
    // Platz unten so hoch wie die Leiste (mit Rangliste ist sie höher als früher)
    if (!MP8.ro && window.ResizeObserver) { MP8.ro = new ResizeObserver(() => document.body.style.setProperty('--ebh', b.offsetHeight + 'px')); MP8.ro.observe(b); }
    document.body.style.setProperty('--ebh', b.offsetHeight + 'px');
    document.body.classList.add('has-endbar');
  }
  // nach der Runde frei: alle Welten ziehbar, Lernschritt/Training/Lernrate wieder da, nichts geht mehr an den Server
  function mp8Free(on) {
    MP8.free = on;
    document.body.classList.toggle('mp8-free', on);
    if (!on) {
      document.body.classList.remove('mp8-end');
      if (S.auto) setAuto(false);
      MP8.end = null;
      $('#endbar').hidden = true; document.body.classList.remove('has-endbar');
    }
  }
  async function mp8Send(extra) {
    if (MP8.busy) return;
    MP8.busy = true;
    let res;
    if (MP8.watch !== null) res = await NTRaum.rpc('get');
    else {
      const p = Object.assign({}, extra || {});
      if (MP8.dirty && MP8.st && MP8.st.phase === 'running') { p.vals = mp8Vals(); MP8.dirty = false; }
      res = await NTRaum.rpc('play', { p });
    }
    MP8.busy = false; MP8.last = performance.now();
    if (res && res.ok) mp8Apply(res);
  }
  function mp8Tick(now) {
    const st = MP8.st, ph = st ? st.phase : '';
    const every = ph === 'running' ? (MP8.dirty ? 220 : 450) : ph === 'countdown' ? 300 : 900;
    if (!MP8.busy && now - MP8.last > every) mp8Send();
    if (ph === 'countdown') mp8Apply(st);
    if (st) {
      const s = ph === 'running' ? Math.ceil(NTRaum.left(st.ends_at) || 0) : null;
      const txt = (s != null ? '⏱ ' + s + ' s · ' : '') + (MP8.watch !== null ? mp8Label(MP8.watch) : 'gemeinsam');
      if ($('#mpChip').textContent !== txt) $('#mpChip').textContent = txt;
      $('#mpChip').classList.toggle('warn', s != null && s <= 10);
      if (ph === 'running' && now - MP8.rec > 1000) { MP8.rec = now; record(); S.changed = true; }
    }
  }
  function mp8Start() {
    document.body.classList.add('mp8');
    if (MP8.watch !== null) document.body.classList.add('mp8-watch');
    $('.head h1').textContent = 'Level 8 · Pinguine in 3D';
    const a = $('.head a.btn');
    a.textContent = '‹ Übersicht';
    if (MP8.watch === null) a.hidden = true;
    mp8Card('<div class="cdl">Verbinde mit dem Raum …</div>', []);
    mp8Send();
  }


  /* ── Level 8 gemeinsam am Tablet (Sönke 18.11.2026): „wie eine ganz normale Welt“ ──
     Statt Wolken + 8 Kacheln sieht die Schülerin nur IHRE Welt(en) als 3D-Landschaft wie in
     Level 7 und läuft darin (Joystick/WASD, Pfeile = 2. Welt). Ort = ihre zwei Werte, Höhe =
     Fehler des ganzen Netzes (log, gleiche Höhe in allen Welten), Pfeil = bergab. Läuft jemand
     aus dem Team, verbiegt sich die Welt (Neubau höchstens alle 250 ms). Dazu nur der Netz-Kasten:
     eigene Kanten/Bias hell mit Zahl, der Rest zurückgenommen (WK.focus), unten „erkannt“. */
  const WK = { on: false, list: [], focus: null, keys: new Set(), ext: false };
  const WWD = 50, WSPEED = 8.5;
  const toWv = x => clamp(x / WWD * R, -R, R), toXv = w => clamp(w / R * WWD, -WWD + 1.5, WWD - 1.5);
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  // Höhe JE WELT gestreckt (Sönke 18.11.2026: „sehr flach, keine Berge und Täler“): vorher
  // 5·ln(L/0,03) für alle Welten gleich – im Sichtkreis oft nur 0,5–4 Einheiten Unterschied
  // (andere Level ~24). Jetzt log-Fehler von tiefstem bis höchstem Punkt der Welt → 0…WH.
  // Spanne mindestens WMIN (ln), damit eine wirklich fast flache Welt (Neuron zählt kaum)
  // flach bleibt statt Rauschen zu Bergen aufzublasen. Die Spanne gleitet (wv.rng), damit die
  // Welt beim Neubau (andere laufen) nicht springt.
  const WH = 22, WMIN = 0.35;
  function wkRange(f) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const v = Math.log(Math.max(f(-R + 2 * R * i / 20, -R + 2 * R * j / 20), 1e-6));
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    return [lo, hi];
  }
  function wkWorld(s, wv) {
    const f = sliceFn({ k: s >> 1, pr: s & 1 });
    const r = wkRange(f);
    if (wv) wv.rng = wv.rng ? [wv.rng[0] + (r[0] - wv.rng[0]) * 0.5, wv.rng[1] + (r[1] - wv.rng[1]) * 0.5] : r;
    const rg = wv ? wv.rng : r, lo = rg[0], sp = Math.max(rg[1] - rg[0], WMIN);
    const h = (x, z) => Math.max(0, (Math.log(Math.max(f(toWv(x), toWv(-z)), 1e-6)) - lo) / sp * WH);
    const e = 0.06;
    return { kind: 'l8', W: WWD, h, grad: (x, z) => [(h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e)],
             meshN: low ? 36 : 52 };
  }
  // alle Werte außer dem eigenen Paar dieser Welt (ändert sich davon etwas, wird die Welt neu gebaut)
  function wkSig(s) {
    const k = s >> 1, ij = pairsOf(k)[s & 1].idx;
    return S.W.map((w, q) => w.map((v, i) => (q === k && ij.includes(i)) ? '' : v.toFixed(2)).join(',')).join('|');
  }
  function wkBuild() {
    const box = $('#wkWorlds');
    box.innerHTML = '';
    WK.list.forEach((wv, n) => {
      const el = document.createElement('div');
      el.className = 'wkcell';
      const k = wv.s >> 1, lab = pairsOf(k)[wv.s & 1].lab;
      el.innerHTML = '<canvas data-n="' + n + '"></canvas><span class="wktag" style="--c:' + colOf(k) + '">' + (WK.list.length > 1 ? (n ? 'Pfeile · ' : 'WASD · ') : '') +
        'Neuron ' + nameOf(k) + ' · ' + lab[0] + ' / ' + lab[1] + '</span>';
      box.appendChild(el);
      wv.cv = el.querySelector('canvas');
      wv.G = NTGrafik.create(wv.cv);
      if (wv.G && window.NT_NET) wv.G.setPalette(NT_NET, 'dark');
      wv.cv.addEventListener('pointerdown', wkDown);
      wv.cv.addEventListener('pointermove', wkMove);
      wv.cv.addEventListener('pointerup', wkUp);
      wv.cv.addEventListener('pointercancel', wkUp);
    });
    box.dataset.n = WK.list.length;
  }
  function wkPos(wv) { const k = wv.s >> 1, [i, j] = pairsOf(k)[wv.s & 1].idx; wv.f.x = toXv(S.W[k][i]); wv.f.z = -toXv(S.W[k][j]); }
  function wkStart() {
    if (!window.NTGrafik) return;
    WK.list = [...MP8.mine].sort((a, b) => a - b).slice(0, 2).map(s => ({ s, f: { x: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI, tilt: 0, squash: 1, phase: 0 },
      dots: [], tr: 0, sig: '', built: 0, world: null, joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look: { id: null, lx: 0 }, cy: Math.PI, ey: null, live: true }));
    WK.focus = new Set();
    for (const s of WK.list.map(w => w.s)) { const k = s >> 1; for (const i of pairsOf(k)[s & 1].idx) WK.focus.add(k * 4 + i); }
    WK.on = true;
    document.body.classList.add('wk');
    $('#wk').hidden = false;
    wkBuild();
    for (const wv of WK.list) { wkPos(wv); wv.dots = [{ x: wv.f.x, z: wv.f.z, big: true }]; }
    WK.color = st8Color();
    $('#netTitle').textContent = 'Dein Teil des Netzes';
    S.changed = true;
  }
  function wkOff() {
    if (!WK.on) return;
    WK.on = false;
    document.body.classList.remove('wk');
    $('#wk').hidden = true;
    legends();
    dirtyAll();
  }
  function wkStop() { for (const wv of WK.list) { wv.live = false; wv.joy.id = null; wv.f.vx = wv.f.vz = 0; } $('#wkJoy').hidden = true; }
  function st8Color() { const me = MP8.st && MP8.st.me; return me ? NTRaum.rgb(me.c) : [1, 0.55, 0.2]; }
  const wkPlaying = () => MP8 && MP8.st && MP8.st.phase === 'running';
  function wkDown(e) {
    const n = +e.currentTarget.dataset.n, wv = WK.list[n];
    if (!wv) return;
    // zweiter Finger (oder Joystick gerade nicht möglich) = Kamera drehen wie in den anderen Leveln
    if (wv.joy.id !== null || !wkPlaying() || !wv.live) {
      if (wv.look.id === null) { wv.look.id = e.pointerId; wv.look.lx = e.clientX; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } }
      return;
    }
    Object.assign(wv.joy, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
    const j = $('#wkJoy'), r = $('#wk').getBoundingClientRect();
    j.style.left = (e.clientX - r.left) + 'px'; j.style.top = (e.clientY - r.top) + 'px'; j.firstChild.style.transform = 'translate(-50%,-50%)'; j.hidden = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
  }
  function wkMove(e) {
    for (const wv of WK.list) {
      if (wv.look.id === e.pointerId) { wv.cy -= (e.clientX - wv.look.lx) * 0.0065; wv.look.lx = e.clientX; continue; }
      if (wv.joy.id !== e.pointerId) continue;
      let dx = e.clientX - wv.joy.ox, dy = e.clientY - wv.joy.oy;
      const l = Math.hypot(dx, dy), JR = 56;
      if (l > JR) { dx *= JR / l; dy *= JR / l; }
      wv.joy.x = dx / JR; wv.joy.y = -dy / JR;
      $('#wkJoy i').style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    }
  }
  function wkUp(e) { for (const wv of WK.list) if (wv.look.id === e.pointerId) wv.look.id = null; else if (wv.joy.id === e.pointerId) { Object.assign(wv.joy, { id: null, x: 0, y: 0 }); $('#wkJoy').hidden = true; } }
  window.addEventListener('keydown', e => { if (WK.on && !(e.target && e.target.tagName === 'INPUT')) WK.keys.add(e.key.toLowerCase()); });
  window.addEventListener('keyup', e => WK.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => WK.keys.clear());
  function wkWalk(wv, n, dt) {
    const f = wv.f;
    let ix = wv.joy.x, iy = wv.joy.y;
    const one = WK.list.length === 1;
    const K = n === 0 ? ['w', 's', 'a', 'd'] : ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    const K2 = one ? ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'] : [];
    const has = i => WK.keys.has(K[i]) || (K2.length && WK.keys.has(K2[i]));
    if (wv.live && wkPlaying()) { if (has(0)) iy += 1; if (has(1)) iy -= 1; if (has(2)) ix -= 1; if (has(3)) ix += 1; }
    else { ix = iy = 0; }
    const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
    // Kamera drehen: Q/E (Welt 1), , / . (Welt 2); Laufen relativ zur Kamera
    const RK = n === 0 ? ['q', 'e'] : [',', '.'];
    const rot = (WK.keys.has(RK[0]) ? 1 : 0) - (WK.keys.has(RK[1]) ? 1 : 0);
    if (rot) wv.cy += rot * 1.8 * dt;
    const fx = Math.sin(wv.cy), fz = Math.cos(wv.cy), rx = -fz, rz = fx;
    const tvx = (fx * iy + rx * ix) * WSPEED, tvz = (fz * iy + rz * ix) * WSPEED, q = 1 - Math.exp(-7 * dt);
    f.vx += (tvx - f.vx) * q; f.vz += (tvz - f.vz) * q;
    if (Math.hypot(tvx, tvz) > 0.3) f.yaw += angD(Math.atan2(tvx, tvz), f.yaw) * (1 - Math.exp(-10 * dt));
    const lim = WWD - 1.5, nx = clamp(f.x + f.vx * dt, -lim, lim), nz = clamp(f.z + f.vz * dt, -lim, lim), moved = Math.hypot(nx - f.x, nz - f.z);
    f.x = nx; f.z = nz;
    const sp = Math.hypot(f.vx, f.vz);
    f.phase += sp * dt * 1.3; f.tilt += (clamp(sp / WSPEED, 0, 1.2) * 0.22 - f.tilt) * q;
    if (moved > 1e-4) {
      const k = wv.s >> 1, [i, j] = pairsOf(k)[wv.s & 1].idx;
      S.W[k][i] = toWv(f.x); S.W[k][j] = toWv(-f.z);
      S.changed = true; MP8.dirty = true;
      wv.tr += moved;
      if (wv.tr > 1.5) { wv.tr = 0; wv.dots.push({ x: f.x, z: f.z }); if (wv.dots.length > 400) wv.dots.splice(1, 1); }
    }
  }
  function wkTick(dt, now) {
    WK.list.forEach((wv, n) => wkWalk(wv, n, dt));
    // fremde Werte vom Server: Figuren der eigenen Welten bleiben, wo sie sind
    WK.ext = false;
    for (const wv of WK.list) {
      if (!wv.G) continue;
      const sg = wkSig(wv.s);
      if (!wv.world || (sg !== wv.sig && now - wv.built > 250)) {
        wv.sig = sg; wv.built = now; wv.world = wkWorld(wv.s, wv);
        wv.G.setWorld(wv.world, 'dark');
      }
      wkDraw(wv);
    }
  }
  function wkDraw(wv) {
    const f = wv.f, w = wv.world, ground = w.h(f.x, f.z);
    const y = ground + Math.abs(Math.sin(f.phase * 2.2)) * 0.12 * clamp(Math.hypot(f.vx, f.vz) / WSPEED, 0, 1);
    // Kamera hinter der Figur (Richtung wv.cy); bei steilen Hängen nicht in den Boden:
    // den ganzen Sichtstrahl Figur → Kamera abtasten und die Kamera darüber heben,
    // nach oben schnell, nach unten langsam (sonst zittert sie über Kanten)
    const fx = Math.sin(wv.cy), fz = Math.cos(wv.cy), D = 13, at = [f.x + fx * 1.5, y + 1, f.z + fz * 1.5];
    const ex = f.x - fx * D, ez = f.z - fz * D;
    let need = y + 9;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, gx = f.x + (ex - f.x) * t, gz = f.z + (ez - f.z) * t;
      const g = w.h(clamp(gx, -w.W, w.W), clamp(gz, -w.W, w.W)) + 1.6;
      // Strahl von at (Höhe y+1) zur Kamera muss bei t über g liegen
      const req = (y + 1) + (g - (y + 1)) / t;
      if (req > need) need = req;
    }
    need = Math.min(need, y + 40);
    if (wv.ey === null || need > wv.ey) wv.ey = wv.ey === null ? need : wv.ey + (need - wv.ey) * 0.5;
    else wv.ey += (need - wv.ey) * 0.08;
    if (wv.ey < need - 0.3) wv.ey = need - 0.3;
    const cam = { eye: [ex, wv.ey, ez], at };
    const objs = [];
    for (const d of wv.dots) objs.push({ type: 'dot', x: d.x, y: w.h(d.x, d.z) + 0.08, z: d.z, r: 0.16, flat: 0.18, color: [0.55, 0.8, 1], glow: 0.2 });
    if (wv.live && wkPlaying()) {
      const g = w.grad(f.x, f.z), gl = Math.hypot(g[0], g[1]);
      if (gl > 0.01) {
        const ux = -g[0] / gl, uz = -g[1] / gl, len = clamp(1.2 + gl * 3.2, 1.4, 7), pts = [], head = [], hs = 0.9 + (len - 0.9) * 0.78;
        for (let i = 0; i <= 8; i++) { const q = 0.9 + (len - 0.9) * i / 8 * 0.78; pts.push([f.x + ux * q, f.z + uz * q, 0.2]); }
        for (let i = 0; i <= 6; i++) { const q = hs + (len - hs) * i / 6; head.push([f.x + ux * q, f.z + uz * q, 0.62 * (1 - i / 6) + 0.02]); }
        objs.push({ type: 'strip', pts, color: [0.36, 0.95, 0.77], glow: 0.6, lift: 0.14 });
        objs.push({ type: 'strip', pts: head, color: [0.36, 0.95, 0.77], glow: 0.6, lift: 0.15 });
      }
    }
    wv.G.frame({ cam, fogR: 16, dpr: low ? 1 : Math.min(window.devicePixelRatio || 1, 1.4), objects: objs, playerColor: WK.color, plain: 0,
      player: { x: f.x, y, z: f.z, ground, yaw: f.yaw, tilt: f.tilt, squash: 1, hidden: false, phase: f.phase,
        walk: clamp(Math.hypot(f.vx, f.vz) / WSPEED, 0, 1) } });
  }

  /* ── Allein und Lehrkraft (Sönke 18.11.2026): die drei Kästen oben antippen = groß in die Mitte,
     nochmal antippen, daneben tippen oder Esc = zurück. Ziehen in einer Wolke dreht weiter. ── */
  const BIG = { k: null, moved: 0, x: 0, y: 0 };
  function bigInit() {
    const secs = [...document.querySelectorAll('.top > section')];
    const keys = ['c1', 'c2', 'net'];
    secs.forEach((sec, i) => {
      sec.classList.add('bigable');
      sec.insertAdjacentHTML('beforeend', '<span class="bigico" aria-hidden="true">⤢</span>');
      sec.addEventListener('pointerdown', e => { BIG.moved = 0; BIG.x = e.clientX; BIG.y = e.clientY; }, true);
      sec.addEventListener('pointermove', e => { BIG.moved = Math.max(BIG.moved, Math.hypot(e.clientX - BIG.x, e.clientY - BIG.y)); }, true);
      sec.addEventListener('click', e => {
        if (WK.on || BIG.moved > 6 || (e.target.closest && e.target.closest('button'))) return;
        bigSet(BIG.k === keys[i] ? null : keys[i], sec);
      });
    });
    $('#bigBack').addEventListener('click', () => bigSet(null));
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && BIG.k) bigSet(null); });
  }
  function bigSet(k, sec) {
    for (const s of document.querySelectorAll('.top > section')) s.classList.remove('big');
    BIG.k = k;
    if (k && sec) sec.classList.add('big');
    $('#bigBack').hidden = !k;
    document.body.classList.toggle('has-big', !!k);
    S.changed = true; S.exNew = true;
  }

  /* ── Bild für Bild ── */
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (MP8) mp8Tick(now);
    if (S.auto) { S.wait -= dt; if (S.wait <= 0) { S.wait = zahl() ? 0.2 : 0.15; step(); } }
    if (!S.rot && !low) { S.idle += dt; if (S.idle > 2.5) S.yaw += dt * 0.12; }
    if (S.changed || !S.g) S.g = gradAll(S.W);
    if (WK.on) wkTick(dt, now);
    else {
      // Fehlerkarten sind teuer: höchstens 4 pro Bild neu rechnen
      const budget = { left: 4 };
      for (const c of cells) drawCell(c, budget);
      drawClouds();
    }
    const ei = zahl() ? exPick() : -1;
    if (ei !== EX.i) { EX.i = ei; S.exNew = true; }
    if (S.changed || S.exNew) { drawNet(); drawEx(); S.exNew = false; }
    if (S.changed) { table(); drawCurve(); S.changed = false; if (MP8 && MP8.free && MP8.end && now - (MP8.barAt || 0) > 400) { MP8.barAt = now; mp8Bar(); } }
  }

  setMid(1);
  controls();
  bigInit();
  cloudInput($('#cloud'));
  cloudInput($('#cloud2'));
  setMode(LEVEL8 ? 'zahl' : 'own');
  if (LEVEL8) { if (MP8) mp8Start(); else intro(); }
  syncTheme();
  window.addEventListener('resize', () => { S.changed = true; });
  requestAnimationFrame(tick);
})();
