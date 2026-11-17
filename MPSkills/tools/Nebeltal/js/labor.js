/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/labor.js   ·   Labor: Pinguine in 3D (Test für EIN Gerät)
   ══════════════════════════════════════════════════════════════
   Vorstufe für „gemeinsam ein Netz“: 3 Eingänge (Schnabellänge,
   Schnabelhöhe, Flossenlänge) → 3 Neuronen (Adelie? Zügel? Esel?),
   12 Werte = 6 Welten. Hier liegen alle 6 Welten auf einem Gerät:

     oben links   die Wolke: 342 echte Pinguine, je Neuron eine Ebene
                  (50 %-Grenze, Pfeil zur Ja-Seite), ziehen = drehen
     oben rechts  das ganze Netz + alle 12 Werte
     unten        2 × 3 Welten: Spalte = Neuron, oben Länge/Höhe,
                  unten Flosse/Bias. Farbe = Fehler dieses Neurons,
                  Punkt = wo das Neuron gerade steht (ziehen!),
                  Pfeil = bergab (der Anteil des Gradienten)

   Die Welt eines Neurons hängt nur von seinen eigenen 4 Werten ab:
   Zieht man oben, verbiegt sich die Welt darunter (und umgekehrt).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const P = NTWelt.penguins3();
  const R = P.R, G = 48;
  const COLS = ['#2f80ed', '#f27828', '#12a37a'];
  const NAMES = ['Adelie', 'Zügel', 'Esel'];
  const LR = { min: 0.2, max: 40, def: 4 };
  const PAIRS = [{ idx: [0, 1], lab: ['Länge', 'Höhe'] }, { idx: [2, 3], lab: ['Flosse', 'Bias'] }];
  const counts = [0, 1, 2].map(k => P.pts.filter(p => p.y === k).length);

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
  const S = { W: [], lr: LR.def, auto: false, wait: 0, trail: [[], [], []], show: [true, true, true],
              yaw: 0.75, pitch: 0.38, rot: null, idle: 0 };
  function rnd() {
    S.W = [0, 1, 2].map(() => [0, 1, 2, 3].map(() => (Math.random() * 2 - 1) * 6));
    S.trail = [[], [], []];
    dirtyAll();
  }

  /* ── Die 6 Welten ── */
  const cells = [];
  function buildGrid() {
    const g = $('#grid');
    for (const pr of [0, 1]) for (let k = 0; k < 3; k++) {
      const el = document.createElement('div');
      el.className = 'cell'; el.style.setProperty('--c', COLS[k]);
      el.innerHTML = '<canvas></canvas><span class="t">' + NAMES[k] + ' · ' + PAIRS[pr].lab[0] + ' / ' + PAIRS[pr].lab[1] + '</span>';
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
  // Die Welt füllt die ganze Kachel (Achsen dürfen verschieden lang sein)
  function box(c) {
    return { x0: 0, y0: 0, s: c.cv.clientWidth, t: c.cv.clientHeight };
  }
  function setFrom(c, e) {
    const r = c.cv.getBoundingClientRect(), b = box(c);
    const u = clamp((e.clientX - r.left - b.x0) / b.s, 0, 1), v = clamp((e.clientY - r.top - b.y0) / b.t, 0, 1);
    const [i, j] = PAIRS[c.pr].idx;
    S.W[c.k][i] = (u * 2 - 1) * R;
    S.W[c.k][j] = (1 - v * 2) * R;
    dirtyNeuron(c.k, c.pr);
  }
  function dirtyNeuron(k, except) { for (const c of cells) if (c.k === k && c.pr !== except) c.dirty = true; S.changed = true; }
  function dirtyAll() { for (const c of cells) c.dirty = true; S.changed = true; }

  // Farbe aus dem Fehler (logarithmisch), Palette wie die 3D-Landschaft
  const PAL_L = ['#2b8c86', '#78b660', '#cbb784', '#efe9dc'], PAL_D = ['#1f5f66', '#3f7d4f', '#7d7a5c', '#a7a6b4'];
  const hex = s => { const n = parseInt(s.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const LO = Math.log(0.02), HI = Math.log(7);
  function color(L, pal) {
    const t = clamp((Math.log(Math.max(L, 1e-4)) - LO) / (HI - LO), 0, 1);
    const f = t * 3, i = Math.min(2, Math.floor(f)), q = f - i;
    return [0, 1, 2].map(c => pal[i][c] + (pal[i + 1][c] - pal[i][c]) * q);
  }
  function heat(c) {
    const pal = (dark() ? PAL_D : PAL_L).map(hex);
    const w = S.W[c.k].slice(), [i, j] = PAIRS[c.pr].idx;
    const d = c.img.data, band = new Int16Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      w[i] = ((x + 0.5) / G * 2 - 1) * R;
      w[j] = (1 - (y + 0.5) / G * 2) * R;
      const L = P.lossK(c.k, w), col = color(L, pal), o = (y * G + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      band[y * G + x] = Math.floor((Math.log(Math.max(L, 1e-4)) - LO) / (HI - LO) * 14);
    }
    // Höhenlinien: Pixel an Bandgrenzen etwas dunkler
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const b0 = band[y * G + x];
      if ((x + 1 < G && band[y * G + x + 1] !== b0) || (y + 1 < G && band[(y + 1) * G + x] !== b0)) {
        const o = (y * G + x) * 4; d[o] *= 0.8; d[o + 1] *= 0.8; d[o + 2] *= 0.8;
      }
    }
    c.off.getContext('2d').putImageData(c.img, 0, 0);
    c.dirty = false;
  }
  function drawCell(c) {
    if (c.dirty) heat(c);
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const W = c.cv.clientWidth, H = c.cv.clientHeight;
    if (!W || !H) return;
    if (c.cv.width !== Math.round(W * dpr)) { c.cv.width = Math.round(W * dpr); c.cv.height = Math.round(H * dpr); }
    const x = c.cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = css('--surface'); x.fillRect(0, 0, W, H);
    const b = box(c);
    x.imageSmoothingEnabled = true;
    x.drawImage(c.off, b.x0, b.y0, b.s, b.t);
    // Achsen durch 0
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1; x.setLineDash([3, 4]);
    x.beginPath(); x.moveTo(b.x0 + b.s / 2, b.y0); x.lineTo(b.x0 + b.s / 2, b.y0 + b.t);
    x.moveTo(b.x0, b.y0 + b.t / 2); x.lineTo(b.x0 + b.s, b.y0 + b.t / 2); x.stroke(); x.setLineDash([]);
    const lab = PAIRS[c.pr].lab;
    x.font = '700 12px Outfit, sans-serif'; x.fillStyle = dark() ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.6)';
    x.textAlign = 'right'; x.fillText(lab[0] + ' →', b.x0 + b.s - 6, b.y0 + b.t / 2 - 5);
    x.textAlign = 'left'; x.fillText('↑ ' + lab[1], b.x0 + b.s / 2 + 5, b.y0 + b.t - 8);
    const [i, j] = PAIRS[c.pr].idx;
    const toPx = (a, bb) => [b.x0 + (a / R + 1) / 2 * b.s, b.y0 + (1 - bb / R) / 2 * b.t];
    // Spur der letzten Schritte
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (const t of S.trail[c.k]) { const [px, py] = toPx(t[i], t[j]); x.beginPath(); x.arc(px, py, 2, 0, 7); x.fill(); }
    // Pfeil bergab (eigener Anteil des Gradienten)
    const g = P.gradK(c.k, S.W[c.k]), gx = -g[i], gy = -g[j], gl = Math.hypot(gx, gy);
    const [px, py] = toPx(S.W[c.k][i], S.W[c.k][j]);
    if (gl > 1e-4) {
      const len = clamp(10 + gl * 60, 12, Math.min(b.s, b.t) * 0.35), ux = gx / gl, uy = -gy / gl;
      x.strokeStyle = '#2f6fe0'; x.fillStyle = '#2f6fe0'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px + ux * 10, py + uy * 10); x.lineTo(px + ux * len, py + uy * len); x.stroke();
      const hx = px + ux * (len + 7), hy = py + uy * (len + 7);
      x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx - ux * 9 - uy * 6, hy - uy * 9 + ux * 6); x.lineTo(hx - ux * 9 + uy * 6, hy - uy * 9 - ux * 6); x.fill();
    }
    x.fillStyle = COLS[c.k]; x.strokeStyle = '#fff'; x.lineWidth = 2.5;
    x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); x.stroke();
  }

  /* ── Lernen: alle 12 Werte springen gleichzeitig ── */
  function step() {
    S.W = S.W.map((w, k) => {
      const g = P.gradK(k, w);
      S.trail[k].push(w.slice()); if (S.trail[k].length > 60) S.trail[k].shift();
      return w.map((v, j) => clamp(v - S.lr * g[j], -R, R));
    });
    dirtyAll();
  }
  function setAuto(on) {
    S.auto = on;
    $('#auto').textContent = on ? 'Training anhalten' : 'Training starten';
    $('#auto').classList.toggle('on', on);
    $('#step').disabled = on;
  }

  /* ── Die Wolke ── */
  // Achsen im Bild: x = Schnabellänge, y (oben) = Flossenlänge, z = Schnabelhöhe
  const B = 2.8;
  const toV = f => [f[0], f[2], f[1]];                    // Merkmale → Bildachsen
  function proj(v, w, h) {
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    const x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp;
    const D = 12, f = D / (D + z2), sc = Math.min(w, h) / (2 * B) * 0.56;
    return [w / 2 + x1 * f * sc, h / 2 - y2 * f * sc, z2];
  }
  function planePoly(w) {
    // Ebene w0·len + w1·dep + w2·fl + b = 0 im Würfel [−B, B]³ (Merkmalsraum)
    const pts = [], c = [-B, B];
    const E = [];
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
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    u = cross(n, u); const v = cross(n, u);
    pts.sort((a, b) => {
      const da = a.map((x, i) => x - cen[i]), db = b.map((x, i) => x - cen[i]);
      return Math.atan2(da[0] * v[0] + da[1] * v[1] + da[2] * v[2], da[0] * u[0] + da[1] * u[1] + da[2] * u[2]) -
             Math.atan2(db[0] * v[0] + db[1] * v[1] + db[2] * v[2], db[0] * u[0] + db[1] * u[1] + db[2] * u[2]);
    });
    return { pts, cen, n: n.map(x => x / nl) };
  }
  function drawCloud() {
    const cv = $('#cloud'), dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const ink = css('--ink'), soft = css('--ink-faint'), red = css('--warn');
    const P2 = v => proj(toV(v), W, H);
    // Würfel
    x.strokeStyle = soft; x.globalAlpha = 0.45; x.lineWidth = 1;
    const c = [-B, B];
    for (const a of c) for (const b of c) for (const [p, q] of [[[-B, a, b], [B, a, b]], [[a, -B, b], [a, B, b]], [[a, b, -B], [a, b, B]]]) {
      const s = P2(p), e = P2(q); x.beginPath(); x.moveTo(s[0], s[1]); x.lineTo(e[0], e[1]); x.stroke();
    }
    x.globalAlpha = 1;
    // Ebenen (hinten zuerst)
    const planes = [];
    S.W.forEach((w, k) => { if (!S.show[k]) return; const pl = planePoly(w); if (pl) planes.push({ k, pl, z: P2(pl.cen)[2] }); });
    planes.sort((a, b) => b.z - a.z);
    for (const { k, pl } of planes) {
      x.fillStyle = COLS[k]; x.strokeStyle = COLS[k];
      x.globalAlpha = 0.16; x.beginPath();
      pl.pts.forEach((p, i) => { const s = P2(p); i ? x.lineTo(s[0], s[1]) : x.moveTo(s[0], s[1]); });
      x.closePath(); x.fill();
      x.globalAlpha = 0.85; x.lineWidth = 1.6; x.stroke();
      // Pfeil zur Ja-Seite
      const a = P2(pl.cen), e = P2(pl.cen.map((v, i) => v + pl.n[i] * 0.9));
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(e[0], e[1]); x.stroke();
      x.beginPath(); x.arc(e[0], e[1], 3.5, 0, 7); x.fill();
      x.globalAlpha = 1;
    }
    // Pinguine (hinten zuerst)
    const list = P.pts.map(p => ({ p, s: P2(p.x) })).sort((a, b) => b.s[2] - a.s[2]);
    for (const { p, s } of list) {
      x.fillStyle = COLS[p.y];
      x.beginPath(); x.arc(s[0], s[1], 3, 0, 7); x.fill();
      if (P.predict(S.W, p.x) !== p.y) { x.strokeStyle = red; x.lineWidth = 1.4; x.beginPath(); x.arc(s[0], s[1], 5.5, 0, 7); x.stroke(); }
    }
    // Achsen zuletzt, damit keine Ebene sie verdeckt
    x.font = '700 12px Outfit, sans-serif'; x.textAlign = 'center';
    // senkrechte Achse an der Würfelkante, die gerade ganz links steht
    let top = null;
    for (const a of [-B, B]) for (const b of [-B, B]) { const q = P2([a, b, B]); if (!top || q[0] < top[0]) top = q; }
    for (const [v, t] of [[[B + 0.35, -B, -B], 'Schnabellänge'], [null, 'Flossenlänge ↑'], [[-B, B + 0.35, -B], 'Schnabelhöhe']]) {
      const s = v ? P2(v) : [top[0], top[1] - 12];
      x.fillStyle = css('--surface'); x.globalAlpha = 0.8; x.fillRect(s[0] - 44, s[1] - 9, 88, 16); x.globalAlpha = 1;
      x.fillStyle = ink; x.fillText(t, s[0], s[1] + 3);
    }
  }
  function cloudInput() {
    const cv = $('#cloud');
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
    NTNetz.draw($('#net'), {
      nodes: [
        { id: 'i0', kind: 'in', x: 0.04, y: 0.12, label: 'Länge' }, { id: 'i1', kind: 'in', x: 0.04, y: 0.5, label: 'Höhe' },
        { id: 'i2', kind: 'in', x: 0.04, y: 0.88, label: 'Flosse' },
        ...[0, 1, 2].map(k => ({ id: 'n' + k, kind: 'n', x: 0.66, y: [0.12, 0.5, 0.88][k], group: 'c' + k })),
        ...[0, 1, 2].map(k => ({ id: 'o' + k, kind: 'out', x: 0.84, y: [0.12, 0.5, 0.88][k], label: NAMES[k] + '?' }))],
      edges: [
        ...[0, 1, 2].flatMap(k => [0, 1, 2].map(i => ({ from: 'i' + i, to: 'n' + k, w: S.W[k][i], group: 'c' + k, noLabel: true }))),
        ...[0, 1, 2].map(k => ({ from: 'n' + k, to: 'o' + k, w: 1, group: 'c' + k, fixed: true, noLabel: true }))]
    });
  }
  function table() {
    const hit = [0, 0, 0];
    for (const p of P.pts) if (P.predict(S.W, p.x) === p.y) hit[p.y]++;
    let h = '<tr><th>Neuron</th><th>Länge</th><th>Höhe</th><th>Flosse</th><th>Bias</th><th>erkannt</th></tr>';
    S.W.forEach((w, k) => {
      h += '<tr style="--c:' + COLS[k] + '"><td>' + NAMES[k] + '?</td>' +
        w.map((v, j) => '<td class="' + (j < 2 ? 'w1' : 'w2') + '">' + (v > 0 ? '+' : '') + fmt(v, 1) + '</td>').join('') +
        '<td class="ok">' + hit[k] + '/' + counts[k] + '</td></tr>';
    });
    $('#wtab').innerHTML = h;
    $('#sWrong').textContent = (P.n - hit[0] - hit[1] - hit[2]) + ' von ' + P.n;
    $('#sLoss').textContent = fmt(P.loss(S.W), 2);
  }

  /* ── Steuerung ── */
  function controls() {
    const lr = $('#lr');
    const setLR = v => { S.lr = v; $('#lrV').textContent = fmt(v, 1); };
    lr.value = Math.round(Math.log(LR.def / LR.min) / Math.log(LR.max / LR.min) * 1000);
    setLR(LR.def);
    lr.addEventListener('input', () => setLR(+(LR.min * Math.pow(LR.max / LR.min, lr.value / 1000)).toFixed(1)));
    $('#step').addEventListener('click', () => { if (!S.auto) step(); });
    $('#auto').addEventListener('click', () => setAuto(!S.auto));
    $('#rnd').addEventListener('click', () => { setAuto(false); rnd(); });
    $('#legend').innerHTML = [0, 1, 2].map(k => '<button type="button" data-k="' + k + '" style="--c:' + COLS[k] + '"><i></i>' +
      NAMES[k] + 'pinguin (' + counts[k] + ')</button>').join('') + '<small>Ebene antippen = ein/aus · ziehen = drehen</small>';
    for (const b of document.querySelectorAll('#legend button')) b.addEventListener('click', () => {
      const k = +b.dataset.k; S.show[k] = !S.show[k]; b.classList.toggle('off', !S.show[k]);
    });
  }

  /* ── Bild für Bild ── */
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.auto) { S.wait -= dt; if (S.wait <= 0) { S.wait = 0.15; step(); } }
    if (!S.rot && !low) { S.idle += dt; if (S.idle > 2.5) S.yaw += dt * 0.12; }
    for (const c of cells) drawCell(c);
    drawCloud();
    if (S.changed) { drawNet(); table(); S.changed = false; }
  }

  buildGrid();
  controls();
  cloudInput();
  rnd();
  syncTheme();
  window.addEventListener('resize', () => { S.changed = true; });
  requestAnimationFrame(tick);
})();
