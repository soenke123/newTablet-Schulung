/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/erarbeitung.js   ·   Tafelbild „Wie lernt ein Netz?“
   ══════════════════════════════════════════════════════════════
   Erarbeitung zwischen Level 3 und Level 4 (Sönke 18.11.2026).
   Ein Netz 2 → 2 → 1 (Schnabellänge, Schnabelhöhe → A, B → „Zügel?“)
   lernt echte Pinguine zu sortieren (NTWelt.penguins: 68 Adelie +
   68 Zügel). Sechs Schritte:
     1 Daten rein · 2 Vorwärts rechnen · 3 Vergleichen ·
     4 Fehler zurückverteilen · 5 Gewichte anpassen ·
     6 Viele Pinguine = der Weg ins Tal (Brücke zum Nebeltal: Karte
       der Fehler-Landschaft über zwei Gewichte, Pfeil, Ring, Lernkurve)

   Die Lernregel (exakt, nicht vereinfacht – σ am Ausgang + Log-Fehler,
   darum fällt am Ausgang die σ-Ableitung weg):
     Fehler            = Soll − Ist
     Anteil(Ausgang)   = Fehler
     Anteil(A)         = Fehler × Gewicht A→Aus × A·(1 − A)
     neues Gewicht     = altes + Lernrate × Anteil(Ziel) × Eingang(Start)
     (Bias: Eingang = 1)
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  let low = !!(window.LWMotion && LWMotion.low);
  window.addEventListener('lernwelt:motion', () => { low = !!(window.LWMotion && LWMotion.low); });

  /* ── Zahlen ── */
  const MINUS = '−';
  const f = (v, d) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d == null ? 2 : d).replace('.', ',');
  const sf = (v, d) => (v >= 0 ? '+' : '') + f(v, d);
  const par = (v, d) => v < 0 ? '(' + f(v, d) + ')' : f(v, d);
  const pct = v => Math.round(v * 100) + ' %';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sig = z => 1 / (1 + Math.exp(-z));

  /* ── Daten: 136 echte Pinguine (Schnabel standardisiert: 0 = Durchschnitt) ── */
  const PTS = NTWelt.penguins(1000).pts.map((q, i) => ({ i, len: q.len, dep: q.dep, y: q.y, x: [q.a, q.b] }));
  const N = PTS.length;

  /* ── Netz: 6 Gewichte (Kanten) + 3 Bias = 9 Werte ── */
  const KEYS = ['aL', 'aH', 'bL', 'bH', 'vA', 'vB', 'aB', 'bB', 'oB'];
  const NAME = { aL: 'Länge → A', aH: 'Höhe → A', bL: 'Länge → B', bH: 'Höhe → B', vA: 'A → Ausgang', vB: 'B → Ausgang',
    aB: 'Bias A', bB: 'Bias B', oB: 'Bias Ausgang' };
  const START = { aL: 0.8, aH: -0.6, aB: 0.1, bL: -0.5, bH: 0.9, bB: -0.2, vA: -0.7, vB: 0.6, oB: 0.1 };
  function fwd(p, x) {
    const zA = p.aL * x[0] + p.aH * x[1] + p.aB, A = sig(zA);
    const zB = p.bL * x[0] + p.bH * x[1] + p.bB, B = sig(zB);
    const zO = p.vA * A + p.vB * B + p.oB, y = sig(zO);
    return { zA, A, zB, B, zO, y };
  }
  // „Verbesserungs-Richtung“ für einen Pinguin (= minus Gradient des Log-Fehlers)
  function back(p, x, t) {
    const r = fwd(p, x), dO = t - r.y, dA = dO * p.vA * r.A * (1 - r.A), dB = dO * p.vB * r.B * (1 - r.B);
    return { r, dO, dA, dB, g: { aL: dA * x[0], aH: dA * x[1], aB: dA, bL: dB * x[0], bH: dB * x[1], bB: dB, vA: dO * r.A, vB: dO * r.B, oB: dO } };
  }
  function lossOf(p) {
    let s = 0, c = 0;
    for (const q of PTS) {
      const y = clamp(fwd(p, q.x).y, 1e-7, 1 - 1e-7);
      s += q.y ? -Math.log(y) : -Math.log(1 - y);
      if ((y > 0.5) === (q.y === 1)) c++;
    }
    return { L: s / N, right: c };
  }
  function batchG(p) {
    const G = {}; KEYS.forEach(k => { G[k] = 0; });
    for (const q of PTS) { const g = back(p, q.x, q.y).g; for (const k of KEYS) G[k] += g[k] / N; }
    return G;
  }
  const add = (p, g, lr) => { const o = {}; KEYS.forEach(k => { o[k] = p[k] + lr * g[k]; }); return o; };

  /* ── Zustand ── */
  function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const order = (() => { const r = rng(42), a = PTS.map(q => q.i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  const S = {
    step: 1, p: { ...START }, oi: 0, cyc: null, lr: 1,
    selEdge: 'vA', selNode: 'A', axes: ['vA', 'vB'],
    trail: [], losses: [], training: 0, dirtyMap: true
  };
  // erster Pinguin: einer, bei dem das Startnetz deutlich danebenliegt (Zügel, sagt „Adelie“)
  S.oi = Math.max(0, order.findIndex(i => PTS[i].y === 1 && fwd(START, PTS[i].x).y < 0.4));

  function newCycle() {
    const pt = PTS[order[S.oi % N]], before = { ...S.p }, b = back(before, pt.x, pt.y);
    S.cyc = { pt, before, b, after: add(before, b.g, S.lr), lr: S.lr, applied: false };
  }
  function relr() { if (S.cyc && !S.cyc.applied) { S.cyc.lr = S.lr; S.cyc.after = add(S.cyc.before, S.cyc.b.g, S.lr); } }
  function record() {
    const l = lossOf(S.p);
    S.losses.push(l.L); if (S.losses.length > 400) S.losses.shift();
    S.trail.push([S.p[S.axes[0]], S.p[S.axes[1]]]); if (S.trail.length > 400) S.trail.shift();
    S.dirtyMap = true;
    return l;
  }
  S.losses.push(lossOf(S.p).L);
  S.trail.push([S.p.vA, S.p.vB]);
  newCycle();

  /* ── Netz zeichnen (SVG 620 × 380) ── */
  const POS = { I1: [78, 108], I2: [78, 272], A: [300, 95], B: [300, 285], O: [532, 190] };
  const EDGES = [
    // die beiden sich kreuzenden Kanten tragen ihre Zahl nah am Eingang, sonst lägen sie aufeinander
    { k: 'aL', a: 'I1', b: 'A', t: 0.5 }, { k: 'aH', a: 'I2', b: 'A', t: 0.32 },
    { k: 'bL', a: 'I1', b: 'B', t: 0.32 }, { k: 'bH', a: 'I2', b: 'B', t: 0.5 },
    { k: 'vA', a: 'A', b: 'O', t: 0.5 }, { k: 'vB', a: 'B', b: 'O', t: 0.5 }];
  const BIASPOS = { aB: [300, 40], bB: [300, 341], oB: [532, 266] };
  const COL = { pos: '#ff9d4d', neg: '#6aa8ff', mint: '#5cf2c4', vio: '#a98bff', red: '#ff6b8b', ink: '#e8f1ff', soft: '#a9bad6', faint: '#6f82a3' };
  const svgT = (x, y, txt, cls, extra) => '<text x="' + x + '" y="' + y + '" class="' + (cls || '') + '"' + (extra || '') + '>' + txt + '</text>';

  // Schritt 5: „alt → neu“, neu grün = größer geworden, rot = kleiner
  function planTxt(k) {
    const c = S.cyc, d = c.after[k] - c.before[k];
    return f(c.before[k]) + ' → <tspan fill="' + (d >= 0 ? COL.mint : COL.red) + '">' + f(c.after[k]) + '</tspan>';
  }
  function pill(x, y, txt, cls, k) {
    const w = Math.max(48, txt.replace(/<[^>]+>/g, '').length * 8.6 + 16);
    return '<g class="pill ' + (cls || '') + (k ? ' clickable' : '') + '"' + (k ? ' data-k="' + k + '"' : '') + ' transform="translate(' + x + ' ' + y + ')">' +
      '<rect x="' + (-w / 2) + '" y="-13" width="' + w + '" height="26" rx="9"/>' +
      '<text y="5" text-anchor="middle">' + txt + '</text></g>';
  }
  function tag(x, y, txt, col) {
    const w = txt.length * 7.8 + 16;
    return '<g class="tag" transform="translate(' + x + ' ' + y + ')"><rect x="' + (-w / 2) + '" y="-12" width="' + w + '" height="24" rx="12" fill="rgba(255,157,77,.14)" stroke="' + col + '"/>' +
      '<text y="4.5" fill="' + col + '">' + txt + '</text></g>';
  }

  function drawNet() {
    const st = S.step, c = S.cyc, r = c.b.r;
    const P = st === 6 ? S.p : c.applied ? c.after : c.before;
    const showPlan = st === 5;
    let h = '<defs><marker id="arrO" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="' + COL.pos + '"/></marker></defs>';
    // Kanten
    for (const e of EDGES) {
      const A = POS[e.a], B = POS[e.b], w = P[e.k];
      const sw = 1.6 + Math.min(Math.abs(w), 5) * 1.5;
      const isAx = st === 6 && S.axes.includes(e.k);
      if (isAx) h += '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" stroke="' + (S.axes[0] === e.k ? COL.mint : COL.vio) + '" stroke-width="' + (sw + 9) + '" opacity=".28" stroke-linecap="round"/>';
      h += '<line class="edge" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" stroke="' + (w >= 0 ? COL.pos : COL.neg) + '" stroke-width="' + sw.toFixed(1) + '" opacity=".85"/>';
    }
    for (const e of EDGES) {
      const A = POS[e.a], B = POS[e.b];
      h += '<line class="edge-hit" data-k="' + e.k + '" x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '"/>';
    }
    // Rückwärts: orange gestrichelt mit Pfeil (Schritt 4)
    if (st === 4) {
      for (const [a, b] of [['O', 'A'], ['O', 'B']]) {
        const A = POS[a], B = POS[b], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), nx = -dy / L * 16, ny = dx / L * 16;
        h += '<line x1="' + (A[0] + dx * 0.22 + nx).toFixed(1) + '" y1="' + (A[1] + dy * 0.22 + ny).toFixed(1) + '" x2="' + (A[0] + dx * 0.74 + nx).toFixed(1) + '" y2="' + (A[1] + dy * 0.74 + ny).toFixed(1) +
          '" stroke="' + COL.pos + '" stroke-width="2.4" stroke-dasharray="6 5" marker-end="url(#arrO)"/>';
      }
    }
    // Gewichte an den Kanten
    for (const e of EDGES) {
      const A = POS[e.a], B = POS[e.b], x = A[0] + (B[0] - A[0]) * e.t, y = A[1] + (B[1] - A[1]) * e.t;
      let cls = '', txt = f(P[e.k]);
      if (showPlan) { txt = planTxt(e.k); if (S.selEdge === e.k) cls = 'sel'; }
      if (st === 6) cls = S.axes[0] === e.k ? 'axx' : S.axes[1] === e.k ? 'axy' : '';
      h += pill(x, y, txt, cls, e.k);
    }
    // Bias als Plakette am Neuron
    for (const k of ['aB', 'bB', 'oB']) {
      const [x, y] = BIASPOS[k];
      let txt = 'b ' + f(P[k]), cls = '';
      if (showPlan) { txt = 'b ' + planTxt(k); if (S.selEdge === k) cls = 'sel'; }
      if (st === 6) cls = S.axes[0] === k ? 'axx' : S.axes[1] === k ? 'axy' : '';
      h += pill(x, y, txt, cls, k);
    }
    // Eingänge
    const ins = [['I1', 'Schnabel-Länge', 'x₁', c.pt.x[0], -42], ['I2', 'Schnabel-Höhe', 'x₂', c.pt.x[1], 54]];
    for (const [id, lab, xs, v, ly] of ins) {
      const [x, y] = POS[id], on = st <= 5;
      h += '<rect x="' + (x - 40) + '" y="' + (y - 25) + '" width="80" height="50" rx="14" class="node-c" stroke="' + (st === 1 ? COL.mint : COL.soft) + '"/>';
      h += svgT(x, y + 7, on ? sf(v) : xs, 'node-t', ' font-size="19"');
      h += svgT(x, y + ly, lab, 'nlab');
      if (on) h += svgT(x - 52, y + 5, xs, 'nlab', ' text-anchor="end" font-size="14"');
    }
    // Neuronen A, B, Ausgang
    const vals = { A: r.A, B: r.B, O: r.y };
    for (const id of ['A', 'B', 'O']) {
      const [x, y] = POS[id], R = id === 'O' ? 40 : 36, show = st >= 2 && st <= 5;
      const act = show ? vals[id] : 0, col = id === 'O' ? COL.mint : COL.soft;
      const sel = (st === 2 || st === 4) && S.selNode === id;
      h += '<g class="clickable" data-n="' + id + '">';
      h += '<circle cx="' + x + '" cy="' + y + '" r="' + R + '" class="node-c" stroke="' + (sel ? COL.mint : col) + '" stroke-width="' + (sel ? 3.4 : 2.4) + '"/>';
      if (show) h += '<circle cx="' + x + '" cy="' + y + '" r="' + (R - 5) + '" fill="' + COL.mint + '" opacity="' + (0.06 + act * 0.32).toFixed(2) + '"/>';
      if (show) {
        h += svgT(x, y - 9, id === 'O' ? 'Zügel?' : id, 'node-t', ' font-size="12" fill="' + COL.soft + '"');
        h += svgT(x, y + 14, id === 'O' ? pct(act) : f(act), 'node-t', ' font-size="20"');
      } else {
        h += svgT(x, y + 4, id === 'O' ? 'σ' : id, 'node-t', ' font-size="' + (id === 'O' ? 22 : 20) + '"');
        h += svgT(x, y + 22, id === 'O' ? 'Zügel?' : 'σ', 'node-t', ' font-size="11" fill="' + COL.faint + '"');
      }
      h += '</g>';
    }
    h += svgT(POS.O[0], POS.O[1] - 52, 'Ausgang', 'nlab');
    // Fehler und Anteile (Schritt 3/4)
    if (st >= 3 && st <= 5) h += tag(POS.O[0], POS.O[1] + 112, 'Fehler ' + f(c.b.dO), COL.pos);
    if (st === 4 || st === 5) {
      h += tag(POS.A[0] + 102, POS.A[1], 'Anteil ' + f(c.b.dA, 3), COL.pos);
      h += tag(POS.B[0] + 102, POS.B[1], 'Anteil ' + f(c.b.dB, 3), COL.pos);
    }
    h += '<g id="pulse"></g>';
    $('#net').innerHTML = h;
    $('#net').querySelectorAll('[data-k]').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); pickEdge(el.dataset.k); }));
    $('#net').querySelectorAll('[data-n]').forEach(el => el.addEventListener('click', () => pickNode(el.dataset.n)));
    $('#netNote').innerHTML = st === 6
      ? '<b>9 Werte</b> kann das Netz lernen: 6 Gewichte (Kanten) + 3 Bias (b). Tippe zwei an – sie werden die Achsen der Karte.'
      : st === 5 ? 'Tippe eine Kante oder ein b an, um ihre Rechnung zu sehen.'
      : st === 4 || st === 2 ? 'Tippe ein Neuron an, um seine Rechnung zu sehen.'
      : 'Farbe: <b style="color:#ff9d4d">orange = positiv</b>, <b style="color:#6aa8ff">blau = negativ</b> · Dicke = Größe des Gewichts';
  }

  function pickEdge(k) {
    if (S.step === 6) {
      if (S.axes.includes(k)) return;
      S.axes = [S.axes[1], k];
      S.trail = [[S.p[S.axes[0]], S.p[S.axes[1]]]];
      S.dirtyMap = true;
      render();
    } else if (S.step === 5) { S.selEdge = k; render(); }
  }
  function pickNode(n) {
    if (S.step === 2 || S.step === 4) { S.selNode = n; render(); }
  }

  /* ── Impulse: kleine Punkte laufen die Kanten entlang ── */
  let pulses = [], pulseRaf = 0;
  function pulse(pairs, col, delay, dur) {
    if (low) return;
    const t0 = performance.now() + (delay || 0);
    for (const [a, b] of pairs) pulses.push({ a: POS[a], b: POS[b], t0, dur: dur || 650, col });
    if (!pulseRaf) pulseRaf = requestAnimationFrame(tickPulse);
  }
  function tickPulse(now) {
    const g = $('#pulse');
    pulses = pulses.filter(p => now < p.t0 + p.dur);
    if (g) g.innerHTML = pulses.filter(p => now >= p.t0).map(p => {
      const t = (now - p.t0) / p.dur, e = t * t * (3 - 2 * t);
      const x = p.a[0] + (p.b[0] - p.a[0]) * e, y = p.a[1] + (p.b[1] - p.a[1]) * e;
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="' + p.col + '" opacity="' + (1 - t * 0.4).toFixed(2) + '"/>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="13" fill="' + p.col + '" opacity=".18"/>';
    }).join('');
    pulseRaf = pulses.length ? requestAnimationFrame(tickPulse) : 0;
  }
  const FWD1 = [['I1', 'A'], ['I2', 'A'], ['I1', 'B'], ['I2', 'B']], FWD2 = [['A', 'O'], ['B', 'O']];

  /* ── Seitenkästen ── */
  const spName = y => y ? 'Zügelpinguin' : 'Adeliepinguin';
  function pengBox() {
    const c = S.cyc, q = c.pt, st = S.step, hide = st < 3;
    const file = (q.y ? 'chin_' : 'adelie_') + ((q.i % 2) + 1);
    return '<div class="box glass">' +
      '<div class="box-t">Pinguin Nr. ' + (q.i + 1) + ' von ' + N + '</div>' +
      '<div class="pimg' + (hide ? ' hide' : '') + '"><img src="img/frei/' + file + '.webp" alt="' + (hide ? 'Umriss eines Pinguins' : spName(q.y)) + '">' + (hide ? '<span class="q">?</span>' : '') + '</div>' +
      '<div class="pname">' + (hide ? 'Welche Art? Das Netz soll es sagen.' : spName(q.y)) + '</div>' +
      '<div class="meas">' +
        '<span>Schnabel-Länge</span><b>' + f(q.len, 1) + ' mm</b><span class="x">→ x₁ = ' + sf(q.x[0]) + '</span>' +
        '<span>Schnabel-Höhe</span><b>' + f(q.dep, 1) + ' mm</b><span class="x">→ x₂ = ' + sf(q.x[1]) + '</span>' +
      '</div>' +
      (st >= 3 ? '<div class="soll">Richtig wäre: <b>' + (q.y ? 'Zügel → Soll = 1' : 'Adelie → Soll = 0') + '</b></div>'
               : '<p class="muted" style="margin:8px 0 0">Umgerechnet: <b>0</b> = so groß wie im Durchschnitt, <b>+</b> = größer, <b>−</b> = kleiner. So sind beide Messwerte gleich wichtig.</p>') +
    '</div>';
  }
  function outBar(y, soll) {
    // 0 = Adelie (links), 1 = Zügel (rechts)
    const X = v => 46 + v * 158;
    let h = '<line x1="46" y1="34" x2="204" y2="34" stroke="#26406a" stroke-width="8" stroke-linecap="round"/>' +
      '<line x1="46" y1="34" x2="' + X(y).toFixed(1) + '" y2="34" stroke="' + COL.mint + '" stroke-width="8" stroke-linecap="round" opacity=".55"/>';
    if (soll != null) {
      h += '<line x1="' + X(y).toFixed(1) + '" y1="50" x2="' + X(soll).toFixed(1) + '" y2="50" stroke="' + COL.red + '" stroke-width="3"/>' +
        '<circle cx="' + X(soll) + '" cy="34" r="9" fill="none" stroke="' + COL.ink + '" stroke-width="2" stroke-dasharray="3 3"/>' +
        '<text x="' + X(soll) + '" y="16" font-size="10.5" font-weight="700" fill="' + COL.ink + '" text-anchor="middle">SOLL</text>' +
        '<text x="' + ((X(y) + X(soll)) / 2).toFixed(1) + '" y="66" font-size="11" font-weight="700" fill="' + COL.red + '" text-anchor="middle">Fehler</text>';
    }
    h += '<path d="M' + X(y).toFixed(1) + ',22 l-6,-9 l12,0z" fill="' + COL.mint + '"/>';
    return '<svg id="outBar" viewBox="0 0 250 72" aria-hidden="true" style="font-family:var(--font)">' +
      NTBild.head('adelie', 20, 34, 17) + NTBild.head('chin', 230, 34, 17) + h + '</svg>' +
      '<div class="legend"><span>Adelie = 0</span><span>Zügel = 1</span></div>';
  }
  // kleine σ-Kurve mit Punkt (Schritt 2)
  function sigPlot(z) {
    const X = v => 10 + (clamp(v, -6, 6) + 6) / 12 * 220, Y = v => 66 - v * 56;
    let d = ''; for (let i = 0; i <= 48; i++) { const v = -6 + i / 4; d += (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(sig(v)).toFixed(1); }
    return '<svg viewBox="0 0 240 78" style="width:100%;display:block;margin-top:6px;font-family:var(--font)" aria-hidden="true">' +
      '<line x1="10" y1="66" x2="230" y2="66" stroke="#26406a"/><line x1="120" y1="6" x2="120" y2="70" stroke="#26406a" stroke-dasharray="3 3"/>' +
      '<path d="' + d + '" fill="none" stroke="' + COL.soft + '" stroke-width="2"/>' +
      '<line x1="' + X(z).toFixed(1) + '" y1="66" x2="' + X(z).toFixed(1) + '" y2="' + Y(sig(z)).toFixed(1) + '" stroke="' + COL.mint + '" stroke-dasharray="3 3"/>' +
      '<circle cx="' + X(z).toFixed(1) + '" cy="' + Y(sig(z)).toFixed(1) + '" r="5" fill="' + COL.mint + '"/>' +
      '<text x="12" y="12" font-size="10" fill="' + COL.faint + '">1</text><text x="12" y="62" font-size="10" fill="' + COL.faint + '">0</text>' +
      '<text x="226" y="77" font-size="10" fill="' + COL.faint + '" text-anchor="end">Summe →</text></svg>';
  }
  const IN_OF = { aL: 0, aH: 1, bL: 0, bH: 1 };
  function edgeCalc(k) {
    const c = S.cyc, b = c.b, x = c.pt.x, r = b.r;
    const to = { aL: 'A', aH: 'A', aB: 'A', bL: 'B', bH: 'B', bB: 'B', vA: 'O', vB: 'O', oB: 'O' }[k];
    const anteil = to === 'A' ? b.dA : to === 'B' ? b.dB : b.dO;
    const inp = k in IN_OF ? x[IN_OF[k]] : k === 'vA' ? r.A : k === 'vB' ? r.B : 1;
    const inName = k in IN_OF ? (IN_OF[k] ? 'x₂' : 'x₁') : k === 'vA' ? 'A' : k === 'vB' ? 'B' : '1 (Bias)';
    return '<div class="calc"><b>' + NAME[k] + '</b><br>neu = alt + Lernrate × Anteil(' + (to === 'O' ? 'Aus' : to) + ') × ' + inName + '<br>' +
      '= ' + f(c.before[k]) + ' + ' + f(c.lr, c.lr < 1 ? 2 : 1) + ' × ' + par(anteil, 3) + ' × ' + par(inp) + '<br>= <b class="' + (c.after[k] >= c.before[k] ? 'g' : 'r') + '">' + f(c.after[k]) + '</b></div>';
  }
  function ruleBox(hl) {
    const li = (i, t, code) => '<li' + (hl === i ? ' style="color:var(--ink)"' : '') + '>' + t + '<code>' + code + '</code></li>';
    return '<div class="box glass rule"><div class="box-t" style="color:var(--orange)">Die Lernregel</div><ol>' +
      li(1, '<b>Vergleichen</b>', 'Fehler = Soll − Ist') +
      li(2, '<b>Zurückverteilen</b> – je stärker die Kante, desto mehr Anteil', 'Anteil(A) = Fehler × Gewicht A→Aus × A·(1−A)') +
      li(3, '<b>Anpassen</b> – jede Kante ein kleines Stück', 'neu = alt + Lernrate × Anteil × Eingang') +
      '</ol></div>';
  }
  function outBox() {
    const c = S.cyc, r = c.b.r, st = S.step;
    let h = '<div class="box glass"><div class="box-t">Das Netz sagt</div>';
    if (st < 2) return h + '<p class="muted" style="margin:0">Noch nichts – erst muss es rechnen. Weiter mit <b>Schritt 2</b>.</p></div>';
    h += '<div class="big">' + pct(r.y) + ' <small>Zügel</small></div>' + outBar(r.y, st >= 3 ? c.pt.y : null);
    h += '<p class="muted" style="margin:4px 0 0">' + (r.y > 0.5 ? 'Es tippt auf <b>Zügel</b>.' : 'Es tippt auf <b>Adelie</b>.') + '</p>';
    if (st >= 3) h += '<div class="calc">Fehler = Soll − Ist<br>= ' + c.pt.y + ' − ' + f(r.y) + ' = <b class="o">' + f(c.b.dO) + '</b></div>';
    if (st === 5 && c.applied) {
      const y2 = fwd(c.after, c.pt.x).y;
      const better = Math.abs(c.pt.y - y2) < Math.abs(c.b.dO);
      h += '<div class="calc">Nach dem Anpassen sagt es: <b>' + pct(y2) + '</b> Zügel<br>' +
        (better ? '<b class="g">näher am Soll ✓</b>' : '<b class="r">über das Ziel hinaus – Lernrate zu groß?</b>') + '</div>';
    }
    return h + '</div>';
  }
  function stepCalcBox() {
    const c = S.cyc, r = c.b.r, x = c.pt.x, P = c.before, st = S.step, n = S.selNode;
    if (st === 2) {
      let t, z, v;
      if (n === 'O') { z = r.zO; v = r.y; t = 'Ausgang: A·w + B·w + b<br>= ' + f(r.A) + '·' + par(P.vA) + ' + ' + f(r.B) + '·' + par(P.vB) + ' + ' + par(P.oB); }
      else {
        const k = n === 'A' ? ['aL', 'aH', 'aB'] : ['bL', 'bH', 'bB'];
        z = n === 'A' ? r.zA : r.zB; v = n === 'A' ? r.A : r.B;
        t = 'Neuron ' + n + ': x₁·w + x₂·w + b<br>= ' + par(x[0]) + '·' + par(P[k[0]]) + ' + ' + par(x[1]) + '·' + par(P[k[1]]) + ' + ' + par(P[k[2]]);
      }
      return '<div class="box glass"><div class="box-t">Rechnung von ' + (n === 'O' ? 'Ausgang' : n) + '</div><div class="calc" style="margin-top:0">' + t +
        '<br>= <b>' + f(z) + '</b> (Summe)<br>σ(' + f(z) + ') = <b class="g">' + f(v) + '</b></div>' + sigPlot(z) +
        '<p class="muted" style="margin:6px 0 0">σ drückt jede Summe zwischen 0 und 1: große Summe → fast 1, kleine → fast 0.</p></div>';
    }
    if (st === 4) {
      let t;
      if (n === 'O') t = 'Anteil(Ausgang) = Fehler<br>= <b class="o">' + f(c.b.dO, 3) + '</b>';
      else {
        const a = n === 'A' ? r.A : r.B, w = n === 'A' ? P.vA : P.vB, d = n === 'A' ? c.b.dA : c.b.dB;
        t = 'Anteil(' + n + ') = Fehler × Gewicht ' + n + '→Aus × ' + n + '·(1−' + n + ')<br>= ' + par(c.b.dO) + ' × ' + par(w) + ' × ' + f(a) + '·' + f(1 - a) +
          '<br>= <b class="o">' + f(d, 3) + '</b>';
      }
      return '<div class="box glass"><div class="box-t">Anteil von ' + (n === 'O' ? 'Ausgang' : n) + '</div><div class="calc" style="margin-top:0">' + t + '</div>' +
        '<p class="muted" style="margin:6px 0 0"><b>' + (n === 'O' ? 'A' : n) + '·(1−' + (n === 'O' ? 'A' : n) + ')</b> = wie empfindlich das Neuron gerade ist. Bei 0,5 am größten – bei fast 0 oder fast 1 ändert ein Schubs kaum etwas.</p></div>';
    }
    if (st === 5) return '<div class="box glass"><div class="box-t">Rechnung</div>' + edgeCalc(S.selEdge) + '</div>';
    return '';
  }

  /* ── Schritt 6: Brücke, Lernkurve, Karte ── */
  function bridgeBox() {
    const l = lossOf(S.p);
    return '<div class="box glass"><div class="box-t">Brücke zum Nebeltal</div><table class="br">' +
      '<tr><td>Ort, an dem du stehst</td><td>alle Werte des Netzes (Gewichte + Bias)</td></tr>' +
      '<tr class="hl"><td>Höhe</td><td>Fehler über <b>alle 136</b> Pinguine</td></tr>' +
      '<tr><td>Bergab-Pfeil</td><td>Rückwärts rechnen: alle Anteile zusammen</td></tr>' +
      '<tr><td>Sprungweite</td><td>Lernrate</td></tr>' +
      '<tr class="hl"><td>ein Sprung</td><td>ein Lernschritt: jede Kante ändert sich ein Stück</td></tr>' +
      '<tr><td>tiefster Punkt</td><td>das Netz sortiert am besten</td></tr>' +
      '</table></div>' +
      '<div class="box glass"><div class="box-t">Lernkurve · Fehler je Schritt</div><canvas id="curve"></canvas>' +
      '<div class="kv"><span>Fehler (Höhe)</span><b id="kvL">' + f(l.L, 3) + '</b></div>' +
      '<div class="kv"><span>richtig sortiert</span><b id="kvR">' + l.right + ' / ' + N + '</b></div></div>';
  }
  function mapBox() {
    return '<div class="box glass"><div class="box-t">Die Landschaft · ' +
      '<span style="color:var(--accent-ink)">→ ' + NAME[S.axes[0]] + '</span> · <span style="color:var(--violet)">↑ ' + NAME[S.axes[1]] + '</span></div>' +
      '<canvas id="map" aria-label="Fehler-Landschaft über zwei Werte des Netzes, der Pinguin steht beim aktuellen Netz"></canvas>' +
      '<div class="legend"><span>Tal (kleiner Fehler)</span><span class="lgbar"></span><span>hoch</span></div>' +
      '<p class="muted" style="margin:6px 0 8px">Pfeil = bergab, Ring = wo der nächste Sprung landet. Pinguin ziehen = die zwei Werte von Hand setzen.</p>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn sm" id="b1" type="button">1 Pinguin</button>' +
        '<button class="btn sm" id="bAll" type="button">1 Sprung (alle 136)</button>' +
        '<button class="btn sm primary" id="bTrain" type="button">' + (S.training ? '⏸ Anhalten' : '▶ Training') + '</button>' +
        '<button class="btn sm" id="bNew" type="button">Netz neu würfeln</button>' +
      '</div></div>';
  }

  // Karte der Fehler-Landschaft über zwei Werte (die anderen stehen beim aktuellen Netz)
  const MR = 8, MG = 56, NETC = [[11, 110, 106], [43, 120, 176], [109, 95, 208], [201, 182, 242]];
  let mapOff = null, mapV = null, mapSegs = null, peng = new Image();
  peng.src = 'img/frei/main.webp';
  peng.onload = () => drawMap();
  function lossAt(kx, vx, ky, vy) {
    const p = { ...S.p }; p[kx] = vx; p[ky] = vy;
    let s = 0;
    for (const q of PTS) { const y = clamp(fwd(p, q.x).y, 1e-7, 1 - 1e-7); s += q.y ? -Math.log(y) : -Math.log(1 - y); }
    return s / N;
  }
  function buildMap() {
    const [kx, ky] = S.axes, v = new Float64Array(MG * MG);
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) {
      const a = -MR + (i + 0.5) / MG * 2 * MR, b = MR - (j + 0.5) / MG * 2 * MR;
      const L = Math.log(lossAt(kx, a, ky, b) + 0.02);
      v[j * MG + i] = L; if (L < mn) mn = L; if (L > mx) mx = L;
    }
    if (!mapOff) { mapOff = document.createElement('canvas'); mapOff.width = mapOff.height = MG; }
    const ctx = mapOff.getContext('2d'), img = ctx.createImageData(MG, MG);
    const lv = new Float32Array(MG * MG);
    for (let k = 0; k < MG * MG; k++) {
      const t = clamp((v[k] - mn) / Math.max(1e-6, mx - mn), 0, 1), s = t * 3, i0 = Math.min(2, Math.floor(s)), u = s - i0;
      const c0 = NETC[i0], c1 = NETC[i0 + 1];
      img.data[k * 4] = c0[0] + (c1[0] - c0[0]) * u; img.data[k * 4 + 1] = c0[1] + (c1[1] - c0[1]) * u; img.data[k * 4 + 2] = c0[2] + (c1[2] - c0[2]) * u; img.data[k * 4 + 3] = 255;
      lv[k] = t * 10;
    }
    ctx.putImageData(img, 0, 0);
    mapV = lv; mapSegs = contours(lv);
    S.dirtyMap = false;
  }
  function contours(v) {
    const out = [], G = MG, P = (x, y) => [(x + 0.5) / G, (y + 0.5) / G];
    for (let y = 0; y < G - 1; y++) for (let x = 0; x < G - 1; x++) {
      const a = v[y * G + x], b = v[y * G + x + 1], c = v[(y + 1) * G + x + 1], d = v[(y + 1) * G + x];
      const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
      for (let k = Math.max(1, Math.ceil(mn)); k <= Math.min(9, mx); k++) {
        const pts = [];
        const cut = (v0, v1, x0, y0, x1, y1) => { if ((v0 < k) === (v1 < k)) return; const t = (k - v0) / (v1 - v0); pts.push(P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)); };
        cut(a, b, x, y, x + 1, y); cut(b, c, x + 1, y, x + 1, y + 1); cut(c, d, x + 1, y + 1, x, y + 1); cut(d, a, x, y + 1, x, y);
        if (pts.length >= 2) out.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        if (pts.length === 4) out.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      }
    }
    return out;
  }
  function drawMap() {
    const cv = $('#map'); if (!cv) return;
    if (S.dirtyMap || !mapOff) buildMap();
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(mapOff, 0, 0, W, H);
    x.strokeStyle = 'rgba(235,245,255,.3)'; x.lineWidth = 1; x.beginPath();
    for (let q = 0; q < mapSegs.length; q += 4) { x.moveTo(mapSegs[q] * W, mapSegs[q + 1] * H); x.lineTo(mapSegs[q + 2] * W, mapSegs[q + 3] * H); }
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.45)'; x.setLineDash([3, 4]); x.beginPath();
    x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); x.setLineDash([]);
    const toPx = (a, b) => [(clamp(a, -MR, MR) / MR + 1) / 2 * W, (1 - clamp(b, -MR, MR) / MR) / 2 * H];
    x.font = '700 11px Space Grotesk, sans-serif'; x.fillStyle = 'rgba(255,255,255,.75)';
    x.textAlign = 'right'; x.fillText('+' + MR, W - 5, H / 2 - 5); x.textAlign = 'left'; x.fillText(MINUS + MR, 5, H / 2 - 5);
    x.fillText('+' + MR, W / 2 + 5, 13); x.fillText(MINUS + MR, W / 2 + 5, H - 6);
    // Spur
    if (S.trail.length > 1) {
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath();
      S.trail.forEach((t, i) => { const p = toPx(t[0], t[1]); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,.9)';
      for (const t of S.trail) { const p = toPx(t[0], t[1]); x.beginPath(); x.arc(p[0], p[1], 2, 0, 7); x.fill(); }
    }
    // Pfeil + Ring (nächster Sprung mit allen 136)
    const [kx, ky] = S.axes, G = batchG(S.p);
    const cur = toPx(S.p[kx], S.p[ky]), nx = S.p[kx] + S.lr * G[kx], ny = S.p[ky] + S.lr * G[ky], land = toPx(nx, ny);
    const dx = land[0] - cur[0], dy = land[1] - cur[1], L = Math.hypot(dx, dy);
    if (L > 3) {
      x.strokeStyle = COL.mint; x.lineWidth = 3.5; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cur[0], cur[1]); x.lineTo(land[0], land[1]); x.stroke();
      const a = Math.atan2(dy, dx);
      x.fillStyle = COL.mint; x.beginPath(); x.moveTo(land[0], land[1]);
      x.lineTo(land[0] - 11 * Math.cos(a - 0.45), land[1] - 11 * Math.sin(a - 0.45)); x.lineTo(land[0] - 11 * Math.cos(a + 0.45), land[1] - 11 * Math.sin(a + 0.45)); x.fill();
      x.strokeStyle = COL.mint; x.lineWidth = 2; x.beginPath(); x.ellipse(land[0], land[1], 10, 5, 0, 0, 7); x.stroke();
    }
    // Pinguin (Füße am Punkt)
    if (peng.complete && peng.naturalWidth) {
      const h = 34, w = h * peng.naturalWidth / peng.naturalHeight;
      x.drawImage(peng, cur[0] - w / 2, cur[1] - h + 3, w, h);
    } else { x.fillStyle = '#fff'; x.beginPath(); x.arc(cur[0], cur[1], 6, 0, 7); x.fill(); }
  }
  function drawCurve() {
    const cv = $('#curve'); if (!cv) return;
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const a = S.losses, mx = Math.max(0.8, ...a), n = Math.max(20, a.length - 1);
    x.strokeStyle = 'rgba(140,170,220,.25)'; x.beginPath(); x.moveTo(0, H - 1); x.lineTo(W, H - 1); x.stroke();
    x.strokeStyle = COL.mint; x.lineWidth = 2; x.beginPath();
    a.forEach((v, i) => { const px = i / n * (W - 4) + 2, py = H - 4 - v / mx * (H - 10); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    const l = lossOf(S.p);
    const kL = $('#kvL'), kR = $('#kvR');
    if (kL) kL.textContent = f(l.L, 3);
    if (kR) kR.textContent = l.right + ' / ' + N;
  }
  // Pinguin auf der Karte ziehen = zwei Werte von Hand setzen
  function bindMap() {
    const cv = $('#map'); if (!cv) return;
    let drag = false;
    const set = ev => {
      const r = cv.getBoundingClientRect();
      const a = clamp(((ev.clientX - r.left) / r.width * 2 - 1) * MR, -MR, MR), b = clamp((1 - (ev.clientY - r.top) / r.height * 2) * MR, -MR, MR);
      S.p[S.axes[0]] = a; S.p[S.axes[1]] = b;
      S.trail = [[a, b]]; S.dirtyMap = true;
      drawNet(); drawMap(); drawCurve();
    };
    cv.addEventListener('pointerdown', ev => { drag = true; stopTrain(); cv.setPointerCapture(ev.pointerId); set(ev); });
    cv.addEventListener('pointermove', ev => { if (drag) set(ev); });
    cv.addEventListener('pointerup', () => { drag = false; S.dirtyMap = true; drawMap(); });
    cv.addEventListener('pointercancel', () => { drag = false; });
  }

  function oneStep(kind) {
    if (kind === 'one') {
      const q = PTS[order[S.oi % N]]; S.oi++;
      S.p = add(S.p, back(S.p, q.x, q.y).g, S.lr);
    } else S.p = add(S.p, batchG(S.p), S.lr);
    record();
    drawNet(); drawMap(); drawCurve();
  }
  function stopTrain() { if (S.training) { clearInterval(S.training); S.training = 0; const b = $('#bTrain'); if (b) b.textContent = '▶ Training'; } }
  function toggleTrain() {
    if (S.training) { stopTrain(); return; }
    let k = 0;
    S.training = setInterval(() => { oneStep('all'); if (++k >= 150) stopTrain(); }, low ? 160 : 110);
    $('#bTrain').textContent = '⏸ Anhalten';
  }

  /* ── Erklärtexte ── */
  const STEPS = [
    { t: 'Daten rein', s: 'Daten' },
    { t: 'Vorwärts rechnen', s: 'Vorwärts' },
    { t: 'Vergleichen', s: 'Vergleichen' },
    { t: 'Fehler zurückverteilen', s: 'Rückwärts' },
    { t: 'Gewichte anpassen', s: 'Anpassen' },
    { t: 'Viele Pinguine = der Weg ins Tal', s: 'Ins Tal' }
  ];
  function explain() {
    const c = S.cyc, r = c.b.r;
    const T = {
      1: 'Ein Pinguin aus dem Datensatz der Forschenden. Das Netz sieht <b>kein Foto</b> – nur zwei Zahlen: die <b>Länge</b> und die <b>Höhe</b> des Schnabels. ' +
         'Sie kommen links in die <b>Eingänge</b>. Jede Kante hat ein <b>Gewicht</b> – das ist alles, was das Netz lernen kann.',
      2: 'Jedes Neuron rechnet dasselbe: <b>Eingänge mal Gewicht</b>, alles zusammenzählen, den <b>Bias b</b> dazu. Dann macht <b>σ</b> daraus eine Zahl zwischen 0 und 1. ' +
         'A und B geben ihr Ergebnis nach rechts weiter. Am Ende steht: <b>' + pct(r.y) + ' Zügel</b>.' +
         '<br><span class="f">Summe = x₁·w₁ + x₂·w₂ + b  →  σ(Summe)</span>',
      3: 'Die Forschenden wissen, welche Art es wirklich ist: ein <b>' + spName(c.pt.y) + '</b> – also Soll = <b>' + c.pt.y + '</b>. ' +
         'Das Netz sagt ' + f(r.y) + '. Der Unterschied ist der <b>Fehler</b>. ' + (Math.abs(c.b.dO) > 0.5 ? 'Hier liegt es ordentlich daneben.' : 'Ganz falsch ist es nicht – aber es geht besser.') +
         '<br><span class="f">Fehler = Soll − Ist = ' + c.pt.y + ' − ' + f(r.y) + ' = ' + f(c.b.dO) + '</span>',
      4: 'Wer ist schuld? Der Fehler wandert <b>rückwärts</b> durchs Netz. A und B bekommen einen <b>Anteil</b> – umso mehr, je stärker ihre Kante zum Ausgang ist. ' +
         'Das heißt <b>Backpropagation</b> (rückwärts verteilen).' +
         '<br><span class="f">Anteil(A) = Fehler × Gewicht A→Aus × A·(1−A)</span>',
      5: c.applied
        ? 'Alle 9 Werte haben sich ein kleines Stück verändert – genau in die Richtung, die den Fehler <b>für diesen Pinguin</b> kleiner macht. ' +
          'Das war <b>ein Lernschritt</b>. Jetzt kommt der nächste Pinguin – und immer so weiter.'
        : 'Jetzt wird jede Kante ein Stück verschoben. Wie weit, sagt die <b>Lernrate</b> – wie die Sprungweite in Level 3. ' +
          'Oben siehst du schon, wie sich jedes Gewicht ändern würde. Tippe <b>Anpassen</b>.' +
          '<br><span class="f">neues Gewicht = altes Gewicht + Lernrate × Anteil × Eingang</span>',
      6: 'Beim echten Training passiert das für <b>alle 136 Pinguine, immer wieder</b>. Jeder Pinguin schlägt eine Richtung vor – zusammen ergibt das den <b>Bergab-Pfeil</b> aus Level 2. ' +
         'Ein Lernschritt ist ein <b>Sprung</b> wie in Level 3. Die Karte zeigt die Landschaft für <b>zwei</b> der neun Werte – das Netz läuft in Wahrheit durch eine Landschaft mit <b>9 Richtungen</b>. ' +
         'Weil die anderen Werte mitspringen, verbiegt sich die Karte dabei ein wenig.'
    };
    return '<h2><span>' + S.step + '/6</span>' + STEPS[S.step - 1].t + '</h2><p>' + T[S.step] + '</p>';
  }
  const lrPos = v => Math.round(Math.log(v / 0.2) / Math.log(100) * 100);   // 0,2 … 20
  const lrVal = s => 0.2 * Math.pow(100, s / 100);
  function ctrlHtml() {
    const st = S.step, c = S.cyc;
    const lr = st >= 5 ? '<label class="lr">Lernrate <input id="lr" type="range" min="0" max="100" value="' + lrPos(S.lr) + '"' + (st === 5 && c.applied ? ' disabled' : '') + '><b id="lrV">' + f(S.lr, S.lr < 1 ? 2 : 1) + '</b></label>' : '';
    const back = '<button class="btn" id="bBack" type="button"' + (st === 1 ? ' disabled' : '') + '>‹ Zurück</button>';
    if (st <= 4) return '<div class="row">' + back + '<button class="btn primary" id="bNext" type="button">Weiter ›</button></div>';
    if (st === 5) return '<div class="row">' + lr + '</div><div class="row">' + back +
      (c.applied
        ? '<button class="btn" id="bAgain" type="button">↻ Nächster Pinguin</button><button class="btn primary" id="bNext" type="button">Weiter: Viele Pinguine ›</button>'
        : '<button class="btn primary" id="bApply" type="button">Anpassen ✓</button>') + '</div>';
    return '<div class="row">' + lr + '</div><div class="row">' + back + '<a class="btn primary" href="index.html?lv=4">Weiter: Level 4 ›</a></div>';
  }

  /* ── alles zeichnen ── */
  function render() {
    const st = S.step;
    $('#steps').innerHTML = STEPS.map((s, i) => '<button class="stp' + (i + 1 === st ? ' on' : i + 1 < st ? ' done' : '') + '" data-s="' + (i + 1) + '" type="button"><i>' + (i + 1) + '</i><span>' + s.s + '</span></button>').join('');
    $('#steps').querySelectorAll('.stp').forEach(b => b.addEventListener('click', () => go(+b.dataset.s)));
    if (st === 6) {
      $('#left').innerHTML = bridgeBox();
      $('#right').innerHTML = mapBox();
      $('#b1').addEventListener('click', () => { stopTrain(); oneStep('one'); });
      $('#bAll').addEventListener('click', () => { stopTrain(); oneStep('all'); });
      $('#bTrain').addEventListener('click', toggleTrain);
      $('#bNew').addEventListener('click', () => {
        stopTrain();
        const r = rng(Math.floor(Math.random() * 1e9));
        KEYS.forEach(k => { S.p[k] = (r() * 2 - 1) * (k.endsWith('B') && k !== 'vB' ? 0.5 : 2); });
        S.losses = [lossOf(S.p).L]; S.trail = [[S.p[S.axes[0]], S.p[S.axes[1]]]]; S.dirtyMap = true;
        drawNet(); drawMap(); drawCurve();
      });
      bindMap();
    } else {
      $('#left').innerHTML = pengBox();
      $('#right').innerHTML = outBox() + stepCalcBox() + (st >= 4 ? ruleBox(st === 4 ? 2 : 3) : '');
    }
    $('#explain').innerHTML = explain();
    $('#ctrl').innerHTML = ctrlHtml();
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#bBack', () => go(st - 1));
    on('#bNext', () => go(st + 1));
    on('#bApply', apply);
    on('#bAgain', () => { S.oi++; newCycle(); go(1); });
    const lr = $('#lr');
    if (lr) lr.addEventListener('input', () => {
      S.lr = lrVal(+lr.value); $('#lrV').textContent = f(S.lr, S.lr < 1 ? 2 : 1);
      relr();
      if (st === 5) { drawNet(); $('#right').innerHTML = outBox() + stepCalcBox() + ruleBox(3); }
      else drawMap();
    });
    drawNet();
    if (st === 6) requestAnimationFrame(() => { drawMap(); drawCurve(); });
  }
  function apply() {
    const c = S.cyc;
    c.applied = true; S.p = { ...c.after };
    record();
    pulse([['O', 'A'], ['O', 'B']], COL.pos, 0, 500);
    pulse([['A', 'I1'], ['A', 'I2'], ['B', 'I1'], ['B', 'I2']], COL.pos, 450, 500);
    render();
  }
  function go(n) {
    n = clamp(n, 1, 6);
    stopTrain();
    if (S.step === 6 && n < 6) newCycle();          // zurück aus der Karte: neuer Durchgang mit dem jetzigen Netz
    if (S.step === 5 && S.cyc.applied && n < 5) { S.oi++; newCycle(); }
    if (n === 6 && S.cyc && !S.cyc.applied && S.step === 5) { /* nicht angepasst: Netz bleibt, wie es ist */ }
    const from = S.step;
    S.step = n;
    render();
    if (n === 2 && from === 1) { pulse(FWD1, COL.mint, 0); pulse(FWD2, COL.mint, 600); }
    if (n === 4 && from === 3) pulse([['O', 'A'], ['O', 'B']], COL.pos, 0, 800);
  }
  window.addEventListener('resize', () => { if (S.step === 6) { drawMap(); drawCurve(); } });
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && S.step < 6 && !(S.step === 5 && !S.cyc.applied)) go(S.step + 1);
    else if (e.key === 'ArrowLeft' && S.step > 1) go(S.step - 1);
  });
  render();
})();
