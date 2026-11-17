/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/labor.js   ·   Labor: Pinguine in 3D (Test für EIN Gerät)
   ══════════════════════════════════════════════════════════════
   Vorstufe für „gemeinsam ein Netz“. 342 echte Pinguine, 3 Eingänge
   (Schnabellänge, Schnabelhöhe, Flossenlänge). Zwei Betriebsarten:

   „3 Neuronen“ (own)   je Art ein Neuron „Bin das ich?“ (σ), größtes p
                        gewinnt; 12 Werte = 6 Welten (2 × 3).
   „+ Zahl-Neuron“ (zahl) die drei σ-Neuronen A, B, C werden zur
                        versteckten Schicht, dahinter EIN Neuron ohne σ
                        (wie die Sonnenblume) rechnet eine Zahl:
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
      if (pd) {
        const t = pd.getAttribute('data-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
        else document.documentElement.removeAttribute('data-theme');
      }
      dirtyAll();
    };
    apply();
    if (pd) { try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ } }
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
  }
  const dark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ── Zustand ── */
  const S = { mode: 'own', mid: 1, ord: [0, 1, 2], W: [], lr: 4, auto: false, wait: 0, trail: [], show: [true, true, true],
              yaw: 0.75, pitch: 0.38, rot: null, idle: 0, g: null };
  const zahl = () => S.mode === 'zahl';
  const nNeur = () => zahl() ? 4 : 3;
  const colOf = k => zahl() ? (k === 3 ? OUT : HID[k]) : SPC[k];
  const nameOf = k => zahl() ? ['A', 'B', 'C', 'Zahl'][k] : NAMES[k];
  const pairsOf = k => (zahl() && k === 3)
    ? [{ idx: [0, 1], lab: ['von A', 'von B'] }, { idx: [2, 3], lab: ['von C', 'Bias'] }]
    : [{ idx: [0, 1], lab: ['Länge', 'Höhe'] }, { idx: [2, 3], lab: ['Flosse', 'Bias'] }];

  // Welche Art bekommt welche Zahl? Die Art in der Mitte bekommt die 1,
  // die beiden anderen in ihrer Reihenfolge 0 und 2.
  function setMid(m) {
    S.mid = m;
    const rest = [0, 1, 2].filter(k => k !== m);
    S.ord = [0, 1, 2].map(k => k === m ? 1 : (k === rest[0] ? 0 : 2));
  }

  function rnd() {
    const a = MODES[S.mode].init;
    S.W = Array.from({ length: nNeur() }, () => [0, 1, 2, 3].map(() => (Math.random() * 2 - 1) * a));
    S.trail = S.W.map(() => []);
    dirtyAll();
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
      el.innerHTML = '<canvas></canvas><span class="t">' + nameOf(k) + ' · ' + lab[0] + ' / ' + lab[1] + '</span>';
      g.appendChild(el);
      const cv = el.querySelector('canvas');
      const off = document.createElement('canvas'); off.width = G; off.height = G;
      const c = { k, pr, cv, off, img: off.getContext('2d').createImageData(G, G), dirty: true, drag: null };
      cells.push(c);
      cv.addEventListener('pointerdown', e => { if (S.auto) return; c.drag = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } setFrom(c, e); });
      cv.addEventListener('pointermove', e => { if (c.drag === e.pointerId) setFrom(c, e); });
      const up = e => { if (c.drag === e.pointerId) c.drag = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    }
  }
  function setFrom(c, e) {
    const r = c.cv.getBoundingClientRect();
    const u = clamp((e.clientX - r.left) / r.width, 0, 1), v = clamp((e.clientY - r.top) / r.height, 0, 1);
    const [i, j] = pairsOf(c.k)[c.pr].idx;
    S.W[c.k][i] = (u * 2 - 1) * R;
    S.W[c.k][j] = (1 - v * 2) * R;
    // „jedes für sich“: nur die andere Welt desselben Neurons ändert sich; beim Zahl-Neuron alle
    if (zahl()) { for (const o of cells) if (o !== c) o.dirty = true; }
    else for (const o of cells) if (o.k === c.k && o.pr !== c.pr) o.dirty = true;
    S.changed = true;
  }
  function dirtyAll() { for (const c of cells) c.dirty = true; S.changed = true; }

  // Farbe aus dem Fehler (logarithmisch), Palette wie die 3D-Landschaft
  const PAL_L = ['#2b8c86', '#78b660', '#cbb784', '#efe9dc'], PAL_D = ['#1f5f66', '#3f7d4f', '#7d7a5c', '#a7a6b4'];
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
    const f = sliceFn(c), d = c.img.data, band = new Int16Array(G * G), Ls = new Float32Array(G * G);
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
      band[q] = Math.floor((Math.log(Ls[q]) - lo) / (hi - lo) * 12);
    }
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const b0 = band[y * G + x];
      if ((x + 1 < G && band[y * G + x + 1] !== b0) || (y + 1 < G && band[(y + 1) * G + x] !== b0)) {
        const o = (y * G + x) * 4; d[o] *= 0.8; d[o + 1] *= 0.8; d[o + 2] *= 0.8;
      }
    }
    c.off.getContext('2d').putImageData(c.img, 0, 0);
    c.dirty = false;
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
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1; x.setLineDash([3, 4]);
    x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); x.setLineDash([]);
    const pr = pairsOf(c.k)[c.pr], [i, j] = pr.idx;
    x.font = '700 12px Outfit, sans-serif'; x.fillStyle = dark() ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)';
    x.textAlign = 'right'; x.fillText(pr.lab[0] + ' →', W - 6, H / 2 - 5);
    x.textAlign = 'left'; x.fillText('↑ ' + pr.lab[1], W / 2 + 5, H - 8);
    const toPx = (a, b) => [(a / R + 1) / 2 * W, (1 - b / R) / 2 * H];
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (const t of S.trail[c.k]) { const [px, py] = toPx(t[i], t[j]); x.beginPath(); x.arc(px, py, 2, 0, 7); x.fill(); }
    const g = S.g[c.k], gx = -g[i], gy = -g[j], gl = Math.hypot(gx, gy);
    const [px, py] = toPx(S.W[c.k][i], S.W[c.k][j]);
    if (gl > 1e-5) {
      const len = clamp(10 + gl * 60, 12, Math.min(W, H) * 0.35), ux = gx / gl, uy = -gy / gl;
      x.strokeStyle = '#2f6fe0'; x.fillStyle = '#2f6fe0'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px + ux * 10, py + uy * 10); x.lineTo(px + ux * len, py + uy * len); x.stroke();
      const hx = px + ux * (len + 7), hy = py + uy * (len + 7);
      x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx - ux * 9 - uy * 6, hy - uy * 9 + ux * 6); x.lineTo(hx - ux * 9 + uy * 6, hy - uy * 9 - ux * 6); x.fill();
    }
    x.fillStyle = colOf(c.k); x.strokeStyle = '#fff'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); x.stroke();    if (c.flat) {
      const t = 'fast flach – dieses Neuron zählt gerade kaum';
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

  /* ── Netz + Werte ── */
  function drawNet() {
    const ins = [{ id: 'i0', kind: 'in', x: 0.04, y: 0.12, label: 'Länge' }, { id: 'i1', kind: 'in', x: 0.04, y: 0.5, label: 'Höhe' },
                 { id: 'i2', kind: 'in', x: 0.04, y: 0.88, label: 'Flosse' }];
    const ys = [0.12, 0.5, 0.88];
    if (!zahl()) {
      NTNetz.draw($('#net'), {
        nodes: [...ins,
          ...[0, 1, 2].map(k => ({ id: 'n' + k, kind: 'n', x: 0.66, y: ys[k], group: SPC[k] })),
          ...[0, 1, 2].map(k => ({ id: 'o' + k, kind: 'out', x: 0.84, y: ys[k], label: NAMES[k] + '?' }))],
        edges: [
          ...[0, 1, 2].flatMap(k => [0, 1, 2].map(i => ({ from: 'i' + i, to: 'n' + k, w: S.W[k][i], group: SPC[k], noLabel: true }))),
          ...[0, 1, 2].map(k => ({ from: 'n' + k, to: 'o' + k, w: 1, group: 'fix', fixed: true, noLabel: true }))]
      });
      return;
    }
    NTNetz.draw($('#net'), {
      nodes: [...ins,
        ...[0, 1, 2].map(k => ({ id: 'h' + k, kind: 'n', x: 0.42, y: ys[k], group: HID[k], label: nameOf(k) })),
        { id: 'z', kind: 'n', x: 0.76, y: 0.5, group: OUT, sym: 'Σ', label: 'Zahl' },
        { id: 'o', kind: 'out', x: 0.9, y: 0.5, label: 'Art' }],
      edges: [
        ...[0, 1, 2].flatMap(k => [0, 1, 2].map(i => ({ from: 'i' + i, to: 'h' + k, w: S.W[k][i], group: HID[k], noLabel: true }))),
        ...[0, 1, 2].map(k => ({ from: 'h' + k, to: 'z', w: S.W[3][k], group: OUT, noLabel: true })),
        { from: 'z', to: 'o', w: 1, group: 'fix', fixed: true, noLabel: true }]
    });
  }
  const cell = (v, cls) => '<td class="' + cls + '">' + (v > 0 ? '+' : '') + fmt(v, 1) + '</td>';
  function table() {
    const H = zahl() ? hidden(S.W) : null;
    const hit = [0, 0, 0];
    P.pts.forEach((p, i) => { if (predict(S.W, i, H) === p.y) hit[p.y]++; });
    let h = '<tr><th>Neuron</th><th>Länge</th><th>Höhe</th><th>Flosse</th><th>Bias</th><th>' + (zahl() ? '' : 'erkannt') + '</th></tr>';
    for (let k = 0; k < 3; k++) {
      h += '<tr style="--c:' + colOf(k) + '"><td>' + nameOf(k) + (zahl() ? '' : '?') + '</td>' +
        S.W[k].map((v, j) => cell(v, j < 2 ? 'w1' : 'w2')).join('') +
        '<td class="ok">' + (zahl() ? '' : hit[k] + '/' + counts[k]) + '</td></tr>';
    }
    if (zahl()) {
      h += '<tr class="sub"><th>Ausgang</th><th>von A</th><th>von B</th><th>von C</th><th>Bias</th><th>erkannt</th></tr>';
      h += '<tr style="--c:' + OUT + '"><td>Zahl</td>' + S.W[3].map((v, j) => cell(v, j < 2 ? 'w1' : 'w2')).join('') +
        '<td class="ok">' + (hit[0] + hit[1] + hit[2]) + '/' + N + '</td></tr>';
    }
    $('#wtab').innerHTML = h;
    $('#sWrong').textContent = (N - hit[0] - hit[1] - hit[2]) + ' von ' + N;
    $('#sLoss').textContent = fmt(lossAll(S.W), 2);
  }

  /* ── Steuerung ── */
  function lrUI() {
    const R0 = MODES[S.mode].lr, el = $('#lr');
    el.value = Math.round(Math.log(R0.def / R0.min) / Math.log(R0.max / R0.min) * 1000);
    setLR(R0.def);
  }
  function setLR(v) { S.lr = v; $('#lrV').textContent = fmt(v, v < 1 ? 2 : 1); }
  function legends() {
    const chip = (k, shape) => '<span class="chip" style="--c:' + SPC[k] + '"><i class="' + shape + '"></i>' + NAMES[k] + ' (' + counts[k] + ')</span>';
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
    for (const b of document.querySelectorAll('#ordSeg button')) b.addEventListener('click', () => {
      setMid(+b.dataset.o);
      for (const o of document.querySelectorAll('#ordSeg button')) o.classList.toggle('on', o === b);
      legends(); dirtyAll();
    });
    document.querySelector('#ordSeg button[data-o="1"]').classList.add('on');
  }

  /* ── Bild für Bild ── */
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.auto) { S.wait -= dt; if (S.wait <= 0) { S.wait = zahl() ? 0.2 : 0.15; step(); } }
    if (!S.rot && !low) { S.idle += dt; if (S.idle > 2.5) S.yaw += dt * 0.12; }
    if (S.changed || !S.g) S.g = gradAll(S.W);
    // Fehlerkarten sind teuer: höchstens 4 pro Bild neu rechnen
    const budget = { left: 4 };
    for (const c of cells) drawCell(c, budget);
    drawClouds();
    if (S.changed) { drawNet(); table(); S.changed = false; }
  }

  setMid(1);
  controls();
  cloudInput($('#cloud'));
  cloudInput($('#cloud2'));
  setMode('own');
  syncTheme();
  window.addEventListener('resize', () => { S.changed = true; });
  requestAnimationFrame(tick);
})();
