/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich „Wie funktioniert ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Zwei Kacheln (= zwei Reiter, die Lehrkraft gibt jede einzeln frei):
     n-wie    So rechnet ein Neuron in sieben Schritten (20.11.2026, 3. Fassung):
              Nervenzelle ↔ Neuron · dann EIN Neuron (Perceptron), Teil für Teil
              aus der Blackbox aufgedeckt: Eingänge · Gewichte (Leitung dick/dünn)
              · Summe & Bias (= Schwelle, Messer) · Aktivierung (Treppe) · Eine
              Gerade (Ebene, ziehbarer Punkt) · Daten trennen (Sperber ♂/♀,
              UND, XOR: Gerade an zwei Griffen) + „Das Wichtigste“
     n-typen  Alle Neuronen: die fünf Typen aus dem Feld (activations in
              app.js) mit Formel, Kurve und Regler
   Gezeichnet wie die Neuronen im Feld (Σ | f, Typ-Farbe, Bias-Pfeil,
   Ausgabe-Kästchen), damit man sie dort wiedererkennt.
   Nutzt aus app.js: activations, fmt.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ORDER = ['perceptron', 'linear', 'relu', 'sigmoid', 'tanh'];

  const INFO = {
    perceptron: { out: '0 oder 1', was: 'Schaltet hart um: Ist z größer als 0, feuert das Neuron (1), sonst nicht (0) – wie ein Lichtschalter.',
      wofuer: 'Ja/Nein-Entscheidungen, logische Gatter. Das erste künstliche Neuron (Rosenblatt, 1958).',
      achtung: 'Die Kurve ist überall flach oder springt – beim Training fehlt die Steigung. NeuroLab nimmt dann die Perceptron-Lernregel.' },
    linear: { out: 'jede Zahl', was: 'Gibt z unverändert weiter.',
      wofuer: 'Als Ausgang, wenn eine Zahl herauskommen soll (Ziffer, Punkte, Preis).',
      achtung: 'Nur lineare Neuronen hintereinander rechnen zusammen wieder nur eine Gerade – Schichten bringen dann nichts.' },
    relu: { out: '0 bis beliebig groß', was: 'Negatives wird 0, Positives bleibt, wie es ist.',
      wofuer: 'Verdeckte Schichten in großen Netzen (Bilderkennung, Sprachmodelle) – schnell zu rechnen.',
      achtung: 'Ist z immer negativ, gibt das Neuron immer 0 aus und lernt nicht mehr („totes Neuron“).' },
    sigmoid: { out: 'zwischen 0 und 1', was: 'Weiche Stufe: kleine z → fast 0, große z → fast 1, bei z = 0 genau 0,5.',
      wofuer: 'Ausgang für Ja/Nein mit Sicherheit („zu 90 % ein Bussard“).',
      achtung: 'Weit außen ist die Kurve fast flach – dann lernt das Neuron nur noch langsam.' },
    tanh: { out: 'zwischen −1 und 1', was: 'Wie Sigmoid, aber von −1 bis 1 und mit der Mitte bei 0.',
      wofuer: 'Verdeckte Schichten: Weil die Mitte bei 0 liegt, lernen die Neuronen dahinter oft schneller.',
      achtung: 'Weit außen ebenfalls flach.' },
  };

  const el = (tag, attrs = {}, html) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const h = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const de = v => fmt(v).replace('.', ',');

  /* ── Neuron im Stil des Feldes ─────────────────────────────
     o = { type, x:[x1,x2], w:[w1,w2], b, compact } → SVG
     Teile tragen data-k (in · w · sum · b · f · out), damit Schritt 1 sie
     zusammen mit der Nervenzelle hervorheben kann. */
  function neuronSVG(o) {
    const act = activations[o.type];
    const z = o.x ? o.x[0] * o.w[0] + o.x[1] * o.w[1] + o.b : 0;
    const y = act.fn(z);
    const withIn = !!o.x;
    const ox = withIn ? 120 : 10;                  // linke Kante des Rumpfs
    const W = withIn ? 470 : 290, H = withIn ? 210 : 150;
    const NBY = withIn ? 60 : 30, NBW = 180, NBH = 72, cy = NBY + NBH / 2;
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'nn-svg' });
    s.style.setProperty('--type-color', act.color);
    if (withIn) {
      [[0, 40], [1, 170]].forEach(([i, iy]) => {
        const w = o.w[i];
        const sw = Math.max(1, Math.min(Math.abs(w) * 2, 6));
        const col = w < 0 ? '#dc2626' : '#10b981';
        s.appendChild(el('line', { 'data-k': 'w', x1: 56, y1: iy, x2: ox, y2: cy + (i ? 14 : -14), stroke: col, 'stroke-width': sw, 'stroke-opacity': Math.abs(w) < 0.01 ? 0.3 : 0.75, 'stroke-dasharray': Math.abs(w) < 0.01 ? '4 3' : 'none' }));
        s.appendChild(el('circle', { 'data-k': 'in', cx: 34, cy: iy, r: 22, fill: '#fffbeb', stroke: '#f59e0b', 'stroke-width': 1.8 }));
        s.appendChild(el('text', { x: 34, y: iy + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#b45309', class: 'nn-num' }, `${fmtV(o.x[i], 2)}`));
        s.appendChild(el('text', { x: 34, y: iy + (i ? 38 : -28), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#64748b' }, `x${i + 1}`));
        const mx = (56 + ox) / 2, my = (iy + cy + (i ? 14 : -14)) / 2;
        s.appendChild(el('rect', { 'data-k': 'w', x: mx - 30, y: my - 9, width: 60, height: 17, rx: 8.5, fill: '#fff', stroke: '#e2e8f0' }));
        s.appendChild(el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 700, class: 'nn-num', fill: col }, `w${i + 1} = ${fmtV(w, 2)}`));
      });
    }
    s.appendChild(el('rect', { x: ox, y: NBY, width: NBW, height: NBH, rx: 12, class: 'neuron-body' }));
    /* Gleiches Innenleben wie im Feld (app.js appendNeuronFace): Σ und z
       links, Kurve mit Punkt und y′ rechts. */
    const split = ox + 72;
    s.appendChild(el('rect', { 'data-k': 'sum', x: ox + 3, y: NBY + 3, width: split - ox - 6, height: NBH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
    s.appendChild(el('rect', { 'data-k': 'f', x: split + 3, y: NBY + 3, width: ox + NBW - split - 6, height: NBH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
    const face = appendNeuronFace(s, { x: ox, y: NBY, w: NBW, h: NBH, split, type: o.type, z: withIn ? z : undefined });
    if (withIn) { paintNeuronFace(face, o.type, z, false); if (isHot(o.type, y)) s.classList.add('is-hot'); }
    s.appendChild(el('text', { x: ox + 2, y: NBY - 8, class: 'neuron-type' }, act.fullName.toUpperCase()));
    const lx = (ox + split) / 2;
    // Bias
    const bx = lx, by0 = NBY + NBH, by1 = by0 + 26;
    s.appendChild(el('line', { 'data-k': 'b', x1: bx, y1: by1, x2: bx, y2: by0 + 5, class: 'bias-line' }));
    s.appendChild(el('path', { d: `M${bx - 4},${by0 + 7} L${bx},${by0 + 2} L${bx + 4},${by0 + 7}`, class: 'bias-line' }));
    s.appendChild(el('text', { x: bx, y: by1 + 14, 'text-anchor': 'middle', class: 'bias-label' }, withIn ? `b = ${fmtV(o.b, 2)}` : 'b'));
    // Ausgabe
    const ol = ox + NBW, bw = withIn ? 60 : 56;
    s.appendChild(el('line', { 'data-k': 'out', x1: ol, y1: cy, x2: ol + 16, y2: cy, class: 'neuron-wire' }));
    s.appendChild(el('rect', { 'data-k': 'out', x: ol + 18, y: cy - 14, width: bw, height: 28, rx: 8, class: 'neuron-out' + (withIn ? '' : ' is-empty') }));
    if (withIn) {
      const fr = outFrac(o.type, y);
      s.appendChild(el('rect', { x: ol + 19.5, y: cy - 12.5 + 25 * (1 - fr), width: bw - 3, height: 25 * fr, rx: 6.5, class: 'neuron-out-fill' }));
    }
    s.appendChild(el('text', { x: ol + 18 + bw / 2, y: cy + 4.5, 'text-anchor': 'middle', class: 'neuron-out-txt' + (withIn ? '' : ' is-faint') }, withIn ? fmtV(y, 2) : 'y′'));
    return s;
  }

  /* ── Kurve f(z) mit Markierung ─────────────────────────── */
  function curveSVG(type, zMark) {
    const act = activations[type];
    const W = 260, H = 150, Z = 4;
    const yr = type === 'linear' || type === 'relu' ? [-4, 4] : type === 'tanh' ? [-1.3, 1.3] : [-0.3, 1.3];
    const px = z => 24 + (z + Z) / (2 * Z) * (W - 34);
    const py = v => 10 + (yr[1] - v) / (yr[1] - yr[0]) * (H - 30);
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'curve-svg' });
    s.appendChild(el('line', { x1: px(-Z), y1: py(0), x2: px(Z), y2: py(0), stroke: '#cbd5e1' }));
    s.appendChild(el('line', { x1: px(0), y1: py(yr[0]), x2: px(0), y2: py(yr[1]), stroke: '#cbd5e1' }));
    s.appendChild(el('text', { x: px(Z) - 2, y: py(0) + 14, 'text-anchor': 'end', 'font-size': 10, fill: '#94a3b8' }, 'z'));
    s.appendChild(el('text', { x: px(0) + 5, y: 18, 'font-size': 10, fill: '#94a3b8' }, 'y′'));
    [1, -1].concat(type === 'linear' || type === 'relu' ? [2, -2, 3, -3] : []).forEach(v => {
      if (v < yr[0] || v > yr[1]) return;
      s.appendChild(el('text', { x: px(0) - 4, y: py(v) + 3, 'text-anchor': 'end', 'font-size': 9, fill: '#94a3b8' }, String(v).replace('-', '−')));
    });
    let d = '';
    for (let i = 0; i <= 200; i++) {
      const z = -Z + i / 200 * 2 * Z;
      const v = Math.max(yr[0], Math.min(yr[1], act.fn(z)));
      // Sprung beim Perceptron nicht als schräge Linie zeichnen
      const jump = type === 'perceptron' && i > 0 && (act.fn(z) !== act.fn(-Z + (i - 1) / 200 * 2 * Z));
      d += (i === 0 || jump ? 'M' : 'L') + px(z).toFixed(1) + ' ' + py(v).toFixed(1) + ' ';
    }
    s.appendChild(el('path', { d, fill: 'none', stroke: act.color, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    if (zMark !== undefined) {
      const zc = Math.max(-Z, Math.min(Z, zMark));
      const v = act.fn(zMark);
      s.appendChild(el('line', { x1: px(zc), y1: py(0), x2: px(zc), y2: py(Math.max(yr[0], Math.min(yr[1], v))), stroke: '#334155', 'stroke-dasharray': '3 3' }));
      s.appendChild(el('circle', { cx: px(zc), cy: py(Math.max(yr[0], Math.min(yr[1], v))), r: 5, fill: '#fff', stroke: '#334155', 'stroke-width': 2 }));
    }
    return s;
  }

  function slider(label, min, max, step, val, on, cls = '') {
    const row = h(`<label class="nn-slider ${cls}"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output>${de(val)}</output></label>`);
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = de(+inp.value); on(+inp.value); });
    row.set = v => { inp.value = v; out.textContent = de(v); };
    return row;
  }
  const d2 = v => de(Math.round(v * 100) / 100).replace('-', '−');

  /* ── Reiter 1: So rechnet ein Neuron (3. Fassung, 20.11.2026) ─────────
     EIN Neuron (Perceptron) steht in jedem Schritt an derselben Stelle.
     Was noch nicht dran war, ist eine dunkle Blackbox – trotzdem kommt
     rechts immer etwas heraus (feuert / feuert nicht). Je Schritt wird ein
     Teil aufgedeckt: Eingänge → Gewichte (Leitung dick/dünn) → Summe &
     Bias (= Schwelle) → Aktivierung → Gerade → Daten trennen. */
  const st = { x: [2, 1], w: [1, 0.5], b: -2 };
  const STEPS = [
    { id: 'bio', kurz: 'Nervenzelle', title: 'Vom Gehirn zum künstlichen Neuron' },
    { id: 'in', kurz: 'Eingänge', title: 'Zahlen hinein – etwas kommt heraus', show: 1 },
    { id: 'w', kurz: 'Gewichte', title: 'Gewichte: Wie wichtig ist ein Eingang?', show: 2 },
    { id: 'b', kurz: 'Bias', title: 'Summe und Bias: Ab wann feuert das Neuron?', show: 3 },
    { id: 'act', kurz: 'Aktivierung', title: 'Die Aktivierungsfunktion: feuern oder nicht', show: 4 },
    { id: 'line', kurz: 'Eine Gerade', title: 'Ein Neuron zieht eine Gerade', show: 4 },
    { id: 'data', kurz: 'Daten trennen', title: 'Ein Neuron trennt Daten', show: 4 },
  ];
  let step = 'bio';

  /* Das Neuron der Schritte. o = { x, w, b, show (1–4), names } */
  function stageSVG(o) {
    const C = '#10b981';   // positive Gewichte: Akzent (wie im Feld)
    const show = o.show || 4;
    const W = 580, H = 250, BX = 236, BY = 76, BW = 190, BH = 94, cy = BY + BH / 2;
    const sum = o.x[0] * o.w[0] + o.x[1] * o.w[1];
    const z = sum + o.b, fire = z > 0;
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'nn-svg nn-stage' });
    s.style.setProperty('--type-color', C);
    const names = o.names || ['x₁', 'x₂'];
    [[0, 58], [1, 192]].forEach(([i, iy]) => {
      const w = o.w[i], ex = BX, ey = cy + (i ? 20 : -20), x0 = 74;
      let sw = 3, col = '#cbd5e1', dash = 'none', op = 1;
      if (show >= 2) {
        sw = Math.max(1.5, Math.min(1.5 + Math.abs(w) * 3.2, 13));
        col = w < 0 ? '#dc2626' : C;
        if (Math.abs(w) < 0.01) { sw = 1.5; dash = '5 4'; op = 0.6; col = '#94a3b8'; }
      }
      s.appendChild(el('line', { 'data-k': 'w', x1: x0, y1: iy, x2: ex, y2: ey, stroke: col, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-dasharray': dash, 'stroke-opacity': op }));
      s.appendChild(el('circle', { 'data-k': 'in', cx: 46, cy: iy, r: 28, fill: '#fffbeb', stroke: '#f59e0b', 'stroke-width': 2 }));
      s.appendChild(el('text', { x: 46, y: iy + 6, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700, fill: '#b45309', class: 'nn-num' }, d2(o.x[i])));
      s.appendChild(el('text', { x: 46, y: iy + (i ? 46 : -36), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#64748b' }, names[i]));
      if (show >= 2) {
        const at = t => [x0 + (ex - x0) * t, iy + (ey - iy) * t];
        const [lx, ly] = at(0.4);
        s.appendChild(el('rect', { 'data-k': 'w', x: lx - 36, y: ly - 11, width: 72, height: 21, rx: 10, fill: '#fff', stroke: col, 'stroke-width': 1.5 }));
        s.appendChild(el('text', { x: lx, y: ly + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 800, fill: col === '#94a3b8' ? '#64748b' : col }, `w${i ? '₂' : '₁'} = ${d2(w)}`));
        const [px, py] = at(0.82);
        const pv = o.x[i] * w;
        s.appendChild(el('rect', { x: px - 24, y: py - 10, width: 48, height: 19, rx: 4, fill: '#f8fafc', stroke: '#cbd5e1' }));
        s.appendChild(el('text', { x: px, y: py + 4, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: '#334155', class: 'nn-num' }, d2(pv)));
      }
    });
    const box = (x, y, w, hh, big, small) => {
      s.appendChild(el('rect', { x, y, width: w, height: hh, rx: 12, class: 'nn-bbox' }));
      s.appendChild(el('text', { x: x + w / 2, y: y + hh / 2 + (small ? 4 : 11), 'text-anchor': 'middle', 'font-size': big ? 34 : 26, 'font-weight': 800, class: 'nn-bbox-q' }, '?'));
      if (small) s.appendChild(el('text', { x: x + w / 2, y: y + hh - 10, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 700, class: 'nn-bbox-t' }, small));
    };
    if (show < 3) {
      box(BX, BY, BW, BH, true, 'Blackbox');
    } else {
      s.appendChild(el('rect', { x: BX, y: BY, width: BW, height: BH, rx: 12, class: 'neuron-body' }));
      s.appendChild(el('rect', { 'data-k': 'sum', x: BX + 3, y: BY + 3, width: BW / 2 - 6, height: BH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
      s.appendChild(el('line', { x1: BX + BW / 2, y1: BY + 6, x2: BX + BW / 2, y2: BY + BH - 6, class: 'neuron-divider' }));
      const lx = BX + BW / 4, rx = BX + BW * 3 / 4;
      s.appendChild(el('text', { x: lx, y: cy - 4, 'text-anchor': 'middle', 'font-size': 24, class: 'neuron-sigma' }, 'Σ'));
      s.appendChild(el('text', { x: lx, y: cy + 22, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#334155', class: 'nn-num' }, `z = ${d2(z)}`));
      // Bias von unten
      const by0 = BY + BH, by1 = by0 + 30;
      s.appendChild(el('line', { 'data-k': 'b', x1: lx, y1: by1, x2: lx, y2: by0 + 8, class: 'bias-line' }));
      s.appendChild(el('polygon', { points: `${lx},${by0} ${lx - 5},${by0 + 9} ${lx + 5},${by0 + 9}`, fill: '#64748b' }));
      s.appendChild(el('text', { x: lx, y: by1 + 16, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 800, fill: '#475569', class: 'nn-num' }, `b = ${d2(o.b)}`));
      if (show < 4) box(BX + BW / 2 + 4, BY + 4, BW / 2 - 8, BH - 8, false, 'Blackbox');
      else {
        s.appendChild(el('rect', { 'data-k': 'f', x: BX + BW / 2 + 3, y: BY + 3, width: BW / 2 - 6, height: BH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
        // kleine Treppe
        const gx = rx - 30, gy = cy - 4;
        s.appendChild(el('path', { d: `M${gx} ${gy + 12} H${gx + 30} V${gy - 14} H${gx + 60}`, fill: 'none', stroke: '#475569', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        s.appendChild(el('text', { x: rx, y: cy + 30, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 800, fill: '#334155' }, 'z > 0 ?'));
      }
    }
    // Ausgabe – kommt immer heraus
    const ox = BX + BW + 34;
    s.appendChild(el('line', { 'data-k': 'out', x1: BX + BW, y1: cy, x2: ox, y2: cy, stroke: fire ? '#eab308' : '#94a3b8', 'stroke-width': fire ? 4 : 2 }));
    if (fire) [[-1, -1], [0, -1.35], [1, -1], [-1, 1], [0, 1.35], [1, 1]].forEach(([dx, dy]) =>
      s.appendChild(el('line', { x1: ox + 52 + dx * 50, y1: cy + dy * 34, x2: ox + 52 + dx * 62, y2: cy + dy * 44, stroke: '#eab308', 'stroke-width': 3, 'stroke-linecap': 'round' })));
    s.appendChild(el('rect', { 'data-k': 'out', x: ox, y: cy - 30, width: 104, height: 60, rx: 12, fill: fire ? '#fef9c3' : '#f8fafc', stroke: fire ? '#eab308' : '#cbd5e1', 'stroke-width': 2.5 }));
    s.appendChild(el('text', { x: ox + 52, y: cy + 4, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: fire ? '#854d0e' : '#94a3b8' }, fire ? '1' : '0'));
    s.appendChild(el('text', { x: ox + 52, y: cy + 21, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 800, fill: fire ? '#854d0e' : '#94a3b8' }, o.outText ? o.outText(fire) : (fire ? 'feuert!' : 'feuert nicht')));
    return s;
  }

  /* Schwellen-Messer: Summe der Eingänge als Punkt, Schwelle = −b als Fahne */
  function meterSVG(sum, b) {
    const T = -b;
    const R = Math.max(8, Math.ceil(Math.max(Math.abs(sum), Math.abs(T))) + 1);
    const X = v => 24 + (v + R) / (2 * R) * 552;
    const xt = Math.max(24, Math.min(576, X(T))), fire = sum - T > 0;
    let ticks = '';
    for (let v = -R; v <= R; v++) if (v % 2 === 0) ticks += `<line x1="${X(v)}" y1="62" x2="${X(v)}" y2="${v ? 68 : 72}" stroke="#94a3b8"/><text x="${X(v)}" y="86" text-anchor="middle" font-size="11" fill="#64748b">${String(v).replace('-', '−')}</text>`;
    return `<svg viewBox="0 0 600 140">
      <rect x="24" y="40" width="${xt - 24}" height="22" fill="#f1f5f9"/>
      <rect x="${xt}" y="40" width="${576 - xt}" height="22" fill="#fef9c3"/>
      <text x="${(24 + xt) / 2}" y="55" text-anchor="middle" font-size="12" font-weight="700" fill="#94a3b8">${xt - 24 > 90 ? 'feuert nicht' : ''}</text>
      <text x="${(xt + 576) / 2}" y="55" text-anchor="middle" font-size="12" font-weight="800" fill="#854d0e">${576 - xt > 70 ? 'feuert' : ''}</text>
      <line x1="24" y1="62" x2="576" y2="62" stroke="#94a3b8"/>${ticks}
      <line x1="${xt}" y1="14" x2="${xt}" y2="64" stroke="#475569" stroke-width="3"/>
      <path d="M${xt} 14 h${xt > 470 ? -96 : 96} v20 h${xt > 470 ? 96 : -96} z" fill="#475569"/>
      <text x="${xt + (xt > 470 ? -48 : 48)}" y="28.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">Schwelle ${d2(T)}</text>
      <circle cx="${Math.max(24, Math.min(576, X(sum)))}" cy="62" r="10" fill="${fire ? '#eab308' : '#fff'}" stroke="#0f172a" stroke-width="3"/>
      <text x="${Math.max(60, Math.min(540, X(sum)))}" y="112" text-anchor="middle" font-size="13" font-weight="800" fill="#0f172a">Summe = ${d2(sum)}</text>
      <text x="300" y="134" text-anchor="middle" font-size="11.5" fill="#64748b">Summe = x₁·w₁ + x₂·w₂ · Schwelle = −b</text></svg>`;
  }

  /* ── Ebene ─────────────────────────────────────────────────
     o = { w, b, xr:[lo,hi], yr:[lo,hi], labels, point, points:[{x, soll}],
           handles:[[a,b],[c,d]], sel, flip }
     Hintergrund: wo das Neuron feuert (hell in Typfarbe), dicke Linie = Gerade
     (Summe = Schwelle), Pfeil zur Feuer-Seite. Gibt {toData, toPx} zurück. */
  function drawPlane(cv, o) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = cv.clientWidth || 360, Hc = cv.clientHeight || 300;
    cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const PL = 40, PB = 36, PT = 10, PR = 10;
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const X = v => PL + (v - x0) / (x1 - x0) * (Wc - PL - PR);
    const Y = v => Hc - PB - (v - y0) / (y1 - y0) * (Hc - PB - PT);
    const iX = px => x0 + (px - PL) / (Wc - PL - PR) * (x1 - x0);
    const iY = py => y0 + (Hc - PB - py) / (Hc - PB - PT) * (y1 - y0);
    const [w1, w2] = o.w, b = o.b;
    const zf = (a, c) => w1 * a + w2 * c + b;
    const st5 = 4;
    for (let px = PL; px < Wc - PR; px += st5) for (let py = PT; py < Hc - PB; py += st5) {
      g.fillStyle = zf(iX(px + st5 / 2), iY(py + st5 / 2)) > 0 ? NLTheme.c('#fdecc0', 0) : NLTheme.c('#eef2f6', 0);
      g.fillRect(px, py, st5 + 0.5, st5 + 0.5);
    }
    // Raster + Achsen
    const nice = span => { const r = span / 6, p = Math.pow(10, Math.floor(Math.log10(r))); return [1, 2, 5, 10].map(k => k * p).find(k => k >= r); };
    g.strokeStyle = 'rgba(100,116,139,.25)'; g.lineWidth = 1;
    g.font = '11px system-ui, sans-serif'; g.fillStyle = NLTheme.c('#64748b', 1);
    const sx = nice(x1 - x0), sy = nice(y1 - y0);
    g.textAlign = 'center';
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) {
      g.beginPath(); g.moveTo(X(v), PT); g.lineTo(X(v), Hc - PB); g.stroke();
      g.fillText(de(Math.round(v * 100) / 100), X(v), Hc - PB + 14);
    }
    g.textAlign = 'right';
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) {
      g.beginPath(); g.moveTo(PL, Y(v)); g.lineTo(Wc - PR, Y(v)); g.stroke();
      g.fillText(de(Math.round(v * 100) / 100), PL - 5, Y(v) + 4);
    }
    const lab = o.labels || ['x₁', 'x₂'];
    g.fillStyle = NLTheme.c('#334155', 1); g.font = 'bold 12px system-ui, sans-serif';
    g.textAlign = 'right'; g.fillText(lab[0] + ' →', Wc - PR, Hc - 4);
    g.save(); g.translate(12, PT + 4); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.fillText(lab[1] + ' →', 0, 0); g.restore();
    // Gerade = Rand des Feuer-Bereichs, im Kasten abgeschnitten
    const cut = [];
    if (Math.abs(w2) > 1e-9) [x0, x1].forEach(a => { const c = -(w1 * a + b) / w2; if (c >= y0 - 1e-9 && c <= y1 + 1e-9) cut.push([a, c]); });
    if (Math.abs(w1) > 1e-9) [y0, y1].forEach(c => { const a = -(w2 * c + b) / w1; if (a >= x0 - 1e-9 && a <= x1 + 1e-9) cut.push([a, c]); });
    if (cut.length >= 2) {
      const [p, q] = cut;
      g.strokeStyle = NLTheme.c('#0f172a', 2); g.lineWidth = 3;
      g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); g.lineTo(X(q[0]), Y(q[1])); g.stroke();
      // Pfeil zur Feuer-Seite (in Bildschirm-Pixeln senkrecht)
      const mx = (X(p[0]) + X(q[0])) / 2, my = (Y(p[1]) + Y(q[1])) / 2;
      const nx = w1 * (x1 - x0) / (Wc - PL - PR), ny = -w2 * (y1 - y0) / (Hc - PB - PT);
      const len = Math.hypot(nx, ny) || 1;
      const dx = nx / len * 30, dy = ny / len * 30;
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + dx, my + dy); g.stroke();
      const an = Math.atan2(dy, dx);
      g.beginPath(); g.moveTo(mx + dx, my + dy);
      g.lineTo(mx + dx - 9 * Math.cos(an - 0.45), my + dy - 9 * Math.sin(an - 0.45));
      g.lineTo(mx + dx - 9 * Math.cos(an + 0.45), my + dy - 9 * Math.sin(an + 0.45));
      g.closePath(); g.fillStyle = NLTheme.c('#0f172a', 0); g.fill();
      g.font = 'bold 11px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = NLTheme.c('#b45309', 1);
      g.fillText('feuert', mx + dx * 1.9, my + dy * 1.9 + 4);
    }
    // Datenpunkte
    const many = (o.points || []).length > 8, r = many ? 6 : 12;
    (o.points || []).forEach((p, i) => {
      const ok = (zf(p.x[0], p.x[1]) > 0 ? 1 : 0) === p.soll;
      g.beginPath(); g.arc(X(p.x[0]), Y(p.x[1]), r, 0, Math.PI * 2);
      g.fillStyle = p.soll ? NLTheme.c('#f59e0b', 0) : NLTheme.c('#fff', 0); g.fill();
      g.lineWidth = many ? 2 : 3; g.strokeStyle = ok ? NLTheme.c('#059669', 2) : NLTheme.c('#dc2626', 2); g.stroke();
      if (i === o.sel) { g.beginPath(); g.arc(X(p.x[0]), Y(p.x[1]), r + 5, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = NLTheme.c('#2563eb', 2); g.stroke(); }
      if (!many) { g.fillStyle = p.soll ? NLTheme.c('#fff', 1) : NLTheme.c('#334155', 1); g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(p.soll), X(p.x[0]), Y(p.x[1]) + 4); }
    });
    (o.handles || []).forEach(([a, c]) => {
      g.beginPath(); g.arc(X(a), Y(c), 11, 0, Math.PI * 2);
      g.fillStyle = NLTheme.c('#1d4ed8', 0); g.fill(); g.lineWidth = 3; g.strokeStyle = NLTheme.c('#fff', 2); g.stroke();
    });
    if (o.point) {
      const [a, c] = o.point;
      g.beginPath(); g.arc(X(a), Y(c), 10, 0, Math.PI * 2);
      g.fillStyle = NLTheme.c('#4caf8a', 0); g.fill(); g.lineWidth = 3; g.strokeStyle = NLTheme.c('#fff', 2); g.stroke();
      g.fillStyle = NLTheme.c('#065f46', 1); g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'left';
      g.fillText(`(${de(a)} | ${de(c)})`, Math.min(X(a) + 13, Wc - 74), Math.max(Y(c) - 11, 20));
    }
    return { toData: (px, py) => [iX(px), iY(py)], toPx: (a, c) => [X(a), Y(c)] };
  }

  /* Ziehen auf der Ebene: Zeiger → fn(px, py, start) */
  function planeDrag(cv, onDown, onMove) {
    let on = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { on = onDown(...pos(e)) !== false; if (on) cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (on) onMove(...pos(e)); });
    const end = () => { on = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  /* Regler-Spalte für die Schritte */
  function ctlX(upd) {
    return [h('<b class="nn-ctl-h">Eingänge</b>'),
      ...[0, 1].map(i => { const r = slider(`x${i ? '₂' : '₁'}`, -5, 5, 0.5, st.x[i], v => { st.x[i] = v; upd(); }); r.classList.add('nn-slider-x'); return r; })];
  }
  function ctlW(upd) {
    return [h('<b class="nn-ctl-h">Gewichte</b>'), ...[0, 1].map(i => slider(`w${i ? '₂' : '₁'}`, -3, 3, 0.1, st.w[i], v => { st.w[i] = v; upd(); }))];
  }
  const ctlB = upd => [h('<b class="nn-ctl-h">Bias</b>'), slider('b', -6, 6, 0.1, st.b, v => { st.b = v; upd(); }, 'nn-slider-b')];

  const PAIRS = [
    { k: 'in', bio: 'Dendriten', kn: 'Eingänge x', t: 'Die Dendriten nehmen Signale anderer Zellen auf. Beim künstlichen Neuron kommen hier Zahlen herein: x₁, x₂ …' },
    { k: 'w', bio: 'Synapsen', kn: 'Gewichte w', t: 'Manche Synapsen leiten stark, manche schwach, manche hemmen. Das Gewicht sagt, wie wichtig ein Eingang ist – im Bild: dicke Leitung = wichtig, rot = bremst.' },
    { k: 'sum', bio: 'Zellkörper', kn: 'Summe Σ', t: 'Im Zellkörper laufen alle Signale zusammen. Das Neuron zählt alle Eingänge × Gewichte zusammen.' },
    { k: 'b', bio: 'Reizschwelle', kn: 'Bias b', t: 'Eine Nervenzelle feuert erst, wenn genug Reiz zusammenkommt. Der Bias legt diese Schwelle fest.' },
    { k: 'f', bio: 'Axonhügel', kn: 'Aktivierung', t: 'Am Axonhügel wird entschieden: feuern oder nicht. Beim künstlichen Neuron macht das die Aktivierungsfunktion.' },
    { k: 'out', bio: 'Axon', kn: 'Ausgabe', t: 'Das Axon leitet das Signal an die nächsten Zellen weiter. Die Ausgabe wird zum Eingang der nächsten Neuronen.' },
  ];
  function bioSVG() {
    const s = el('svg', { viewBox: '0 0 520 250', class: 'nn-bio' });
    s.innerHTML = `
      <g data-k="in" class="bio-part">
        <path d="M150 112 C120 90 100 70 62 52 M100 76 C92 56 84 40 70 22 M150 120 C110 118 80 112 40 116 M78 114 C64 98 52 92 30 88 M152 134 C122 150 98 170 66 196 M104 160 C84 160 66 168 42 160 M112 150 C108 176 100 196 92 222"/>
      </g>
      <g data-k="w" class="bio-syn">
        <circle cx="62" cy="52" r="7"/><circle cx="70" cy="22" r="6"/><circle cx="40" cy="116" r="7"/><circle cx="30" cy="88" r="6"/><circle cx="66" cy="196" r="7"/><circle cx="42" cy="160" r="6"/><circle cx="92" cy="222" r="6"/>
      </g>
      <g data-k="sum"><path class="bio-soma" d="M150 96 C176 74 214 80 228 104 C240 124 230 150 206 158 C178 168 150 158 142 136 C136 120 138 106 150 96 Z"/>
        <circle cx="188" cy="122" r="12" class="bio-nuc"/></g>
      <g data-k="b"><path class="bio-thr" d="M224 100 L224 146" stroke-dasharray="4 4"/><text x="214" y="178" text-anchor="middle" class="bio-tl">Schwelle</text></g>
      <g data-k="f"><path class="bio-hill" d="M228 108 C240 114 244 118 252 122 C244 126 240 130 228 136 Z"/></g>
      <g data-k="out" class="bio-axon">
        <path d="M252 122 L430 122"/>
        <rect x="270" y="113" width="34" height="18" rx="9"/><rect x="314" y="113" width="34" height="18" rx="9"/><rect x="358" y="113" width="34" height="18" rx="9"/>
        <path d="M430 122 C446 110 456 100 476 90 M430 122 L486 122 M430 122 C446 134 456 146 476 156"/>
        <circle cx="478" cy="89" r="6"/><circle cx="490" cy="122" r="6"/><circle cx="478" cy="157" r="6"/>
      </g>
      <text x="260" y="244" text-anchor="middle" class="bio-cap">Nervenzelle (vereinfacht) – Signale laufen von links nach rechts</text>`;
    return s;
  }

  /* Datensätze für „Daten trennen“: ein Neuron, zwei Griffe an der Geraden */
  function sperber() {
    const V = window.NLData.VOEGEL;
    return [0, 1].flatMap(g => V[g].map(v => ({ x: [v[0] / 10, v[2] / 10], soll: g })));
  }
  const DS = {
    sperber: { name: 'Sperber', xr: [15, 21.5], yr: [11.5, 17.5], labels: ['Flügel (cm)', 'Schwanz (cm)'], names: ['Flügel', 'Schwanz'],
      text: '90 echte Eckschwanzsperber (vermessen am Lake MacBride, USA): <b>orange = Weibchen</b>, weiß = Männchen. Das Neuron bekommt Flügel- und Schwanzlänge und soll bei jedem Weibchen <b>feuern</b>.',
      out: f => f ? 'Weibchen' : 'Männchen', h: [[15.5, 14], [21, 15.5]], flip: 1, pts: null },
    und: { name: 'UND', xr: [-0.5, 1.5], yr: [-0.5, 1.5], labels: ['x₁', 'x₂'], names: ['x₁', 'x₂'],
      text: 'Ein Türsteher mit zwei Bedingungen: Das Neuron soll nur feuern, wenn x₁ = 1 <b>und</b> x₂ = 1 ist (orange Punkt).',
      h: [[-0.3, 1.2], [1.2, -0.3]], flip: 1, pts: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]] },
    xor: { name: 'XOR', xr: [-0.5, 1.5], yr: [-0.5, 1.5], labels: ['x₁', 'x₂'], names: ['x₁', 'x₂'],
      text: 'Jetzt soll das Neuron feuern, wenn <b>genau einer</b> der Eingänge 1 ist (die beiden orangen Punkte).',
      h: [[-0.3, 1.2], [1.2, -0.3]], flip: 1, pts: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]] },
  };
  let dsKey = 'sperber', dsSel = 0;
  const dsPoints = d => d.pts ? d.pts.map(p => ({ x: [p[0], p[1]], soll: p[2] })) : (d._p || (d._p = sperber()));
  /* Gerade durch die Griffe → Gewichte und Bias (größtes Gewicht = 1) */
  function dsNeuron(d) {
    const [[a, c], [e, f]] = d.h;
    let w1 = f - c, w2 = -(e - a);
    const k = Math.max(Math.abs(w1), Math.abs(w2)) || 1;
    w1 = w1 / k * d.flip; w2 = w2 / k * d.flip;
    return { w: [w1, w2], b: -(w1 * a + w2 * c) };
  }

  const BUILD = {
    bio(card) {
      card.appendChild(h(`<p class="nn-lead-p">Dein Gehirn hat rund <b>86 Milliarden Nervenzellen</b>. Jede bekommt Signale von anderen Zellen, „entscheidet“, ob sie selbst <b>feuert</b>, und gibt ihr Signal weiter. Ein <b>künstliches Neuron</b> ist ein stark vereinfachtes Rechenmodell davon. <b>Tippe auf ein Teil</b> – du siehst, was ihm im künstlichen Neuron entspricht. In den nächsten Schritten schauen wir uns das künstliche Neuron Teil für Teil an.</p>`));
      const grid = h('<div class="nn-two"><div class="nn-col-bio"></div><div class="nn-col-kn"></div></div>');
      const bio = bioSVG();
      const kn = stageSVG({ x: [2, 1], w: [1, 0.5], b: -2, show: 4 });
      grid.children[0].appendChild(bio);
      grid.children[1].appendChild(kn);
      card.appendChild(grid);
      const chips = h('<div class="nn-pairs"></div>');
      const info = h('<p class="nn-pair-info">Noch nichts gewählt.</p>');
      const pick = k => {
        bio.dataset.hl = k; kn.dataset.hl = k;
        chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
        const p = PAIRS.find(x => x.k === k);
        info.innerHTML = `<b>${p.bio} → ${p.kn}:</b> ${p.t}`;
      };
      PAIRS.forEach(p => {
        const b = h(`<button type="button" class="nn-pair" data-k="${p.k}"><span>${p.bio}</span><i>→</i><b>${p.kn}</b></button>`);
        b.addEventListener('click', () => pick(p.k));
        chips.appendChild(b);
      });
      [bio, kn].forEach(svg => svg.addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (t) pick(t.dataset.k); }));
      card.append(chips, info);
    },

    in(card, stage, ctl, upd) {
      card.insertBefore(h(`<p class="nn-lead-p">Wir schauen uns <b>ein</b> Neuron an. Was drin passiert, ist noch eine <b>Blackbox</b>. Klar ist nur: Links gehen <b>Zahlen</b> hinein – beliebige Kommazahlen, z. B. eine Temperatur oder die Länge eines Flügels. Rechts kommt immer etwas heraus: Das Neuron <b>feuert (1)</b> oder <b>feuert nicht (0)</b>.</p>`), card.lastChild);
      ctl.append(...ctlX(upd));
      return '<b>Probier:</b> Finde Eingaben, bei denen das Neuron feuert – und welche, bei denen es still bleibt. Ist dir x₁ oder x₂ wichtiger?';
    },

    w(card, stage, ctl, upd) {
      card.insertBefore(h(`<p class="nn-lead-p">Der erste Teil der Blackbox: Jeder Eingang hat ein <b>Gewicht w</b>. Auf seiner Leitung wird der Eingang mit dem Gewicht malgenommen – im grauen Kästchen kommt <b>x · w</b> an. <b>Dicke Leitung</b> = großes Gewicht = wichtig, <b>dünne Leitung</b> = fast egal, <b>rote Leitung</b> = negatives Gewicht = bremst.</p>`), card.lastChild);
      ctl.append(...ctlW(upd), ...ctlX(upd));
      return '<b>Probier:</b> Stelle w₂ auf 0 – was ändert x₂ dann noch? Und was passiert, wenn w₁ rot wird?';
    },

    b(card, stage, ctl, upd) {
      card.insertBefore(h(`<p class="nn-lead-p">Im Neuron wird alles <b>zusammengezählt</b>: die <b>Summe</b> = x₁·w₁ + x₂·w₂. Das Neuron <b>feuert erst, wenn die Summe über einer Schwelle liegt</b> – wie eine Nervenzelle, die genug Reiz braucht. Diese Schwelle steckt im <b>Bias b</b>: <b>b = −2</b> heißt <b>Schwelle 2</b>. Das Neuron rechnet z = Summe + b und schaut, ob z über 0 liegt – das ist dasselbe.</p>`), card.lastChild);
      const meter = h('<div class="nn-meter"></div>');
      ctl.append(...ctlB(upd), ...ctlX(upd));
      card.appendChild(meter);
      stage.meter = meter;
      return '<b>Probier:</b> Mach den Bias stark negativ – wie viel Reiz braucht das Neuron jetzt? Und bei positivem Bias?';
    },

    act(card, stage, ctl, upd) {
      card.insertBefore(h(`<p class="nn-lead-p">Der letzte Kasten ist offen: die <b>Aktivierungsfunktion</b>. Sie macht aus z die Ausgabe. Unser Neuron nimmt die <b>Treppe</b>: Ist z größer als 0, kommt <b>1</b> heraus (feuert), sonst <b>0</b>. Es gibt auch weichere Funktionen, die „wie sicher“ sagen (z. B. Sigmoid) – die findest du in der Kachel <b>„Alle Neuronen“</b>.</p>`), card.lastChild);
      const curve = h('<div class="nn-curve"></div>');
      ctl.append(h('<b class="nn-ctl-h">Treppe: z → Ausgabe</b>'), curve, ...ctlB(upd), ...ctlX(upd));
      stage.curve = curve;
      return '<b>Jetzt ist die Blackbox ganz offen:</b> Eingänge × Gewichte, zusammenzählen, Bias dazu, Treppe – fertig ist das Neuron.';
    },
  };

  /* Schritte mit der Bühne links und Reglern rechts */
  function stepCard(card, id) {
    const S = STEPS.find(s => s.id === id);
    const grid = h('<div class="nn-play-grid"><div class="nn-play-pic"></div><div class="nn-play-ctl"></div></div>');
    const pic = grid.children[0], ctl = grid.children[1];
    const calc = h('<div class="nn-calc"></div>');
    card.append(grid);
    const ext = {};
    const upd = () => {
      pic.innerHTML = '';
      pic.appendChild(stageSVG({ x: st.x, w: st.w, b: st.b, show: S.show }));
      const sum = st.x[0] * st.w[0] + st.x[1] * st.w[1], z = sum + st.b;
      if (ext.meter) ext.meter.innerHTML = meterSVG(sum, st.b);
      if (ext.curve) { ext.curve.innerHTML = ''; ext.curve.appendChild(curveSVG('perceptron', z)); }
      const L = [];
      if (S.show >= 2) L.push(`Summe = ${d2(st.x[0])}·${d2(st.w[0])} + ${d2(st.x[1])}·${d2(st.w[1])} = <b>${d2(sum)}</b>`);
      if (S.show >= 3) L.push(`z = Summe + b = ${d2(sum)} + (${d2(st.b)}) = <b>${d2(z)}</b> → ${z > 0 ? 'über 0: <b>feuert</b>' : 'nicht über 0: <b>feuert nicht</b>'}`);
      calc.innerHTML = L.map(l => `<div>${l}</div>`).join('');
      calc.hidden = !L.length;
    };
    const tip = BUILD[id](card, ext, ctl, upd);
    card.append(calc, h(`<p class="nn-try">${tip}</p>`));
    upd();
  }

  function buildLine(card) {
    card.appendChild(h(`<p class="nn-lead-p">Mit zwei Eingängen ist jede Eingabe ein <b>Punkt</b> (x₁ | x₂). Für jeden Punkt der Ebene können wir fragen: Feuert das Neuron hier? Die <b>gelbe Fläche</b> zeigt, wo es feuert. Die Grenze ist immer eine <b>Gerade</b> – genau dort ist die Summe gleich der Schwelle. Die <b>Gewichte drehen</b> die Gerade, der <b>Bias verschiebt</b> sie. <b>Ziehe den grünen Punkt</b> – das sind die Eingänge.</p>`));
    const grid = h('<div class="nn-line-grid"><div class="nn-plane"><canvas></canvas></div><div class="nn-line-side"><div class="nn-line-pic"></div></div></div>');
    const cv = grid.querySelector('canvas'), pic = grid.querySelector('.nn-line-pic'), side = grid.querySelector('.nn-line-side');
    const calc = h('<div class="nn-calc"></div>');
    let P = null;
    function upd() {
      pic.innerHTML = '';
      pic.appendChild(stageSVG({ x: st.x, w: st.w, b: st.b, show: 4 }));
      P = drawPlane(cv, { w: st.w, b: st.b, xr: [-5, 5], yr: [-5, 5], point: st.x });
      const z = st.x[0] * st.w[0] + st.x[1] * st.w[1] + st.b;
      calc.innerHTML = `<div>Gerade: ${d2(st.w[0])}·x₁ + ${d2(st.w[1])}·x₂ + (${d2(st.b)}) = 0</div>
        <div>Punkt (${d2(st.x[0])} | ${d2(st.x[1])}): z = ${d2(z)} → ${z > 0 ? '<b>feuert</b> (gelbe Seite)' : '<b>feuert nicht</b> (graue Seite)'}</div>`;
    }
    side.append(...ctlW(upd), ...ctlB(upd));
    card.append(grid, calc, h('<p class="nn-try"><b>Probier:</b> Stelle w₁ = 0 – wie liegt die Gerade jetzt? Was passiert, wenn du nur den Bias änderst? Und wenn beide Gewichte das Vorzeichen wechseln?</p>'));
    const setPt = (px, py) => {
      if (!P) return false;
      const [a, c] = P.toData(px, py);
      st.x = [Math.max(-5, Math.min(5, Math.round(a * 2) / 2)), Math.max(-5, Math.min(5, Math.round(c * 2) / 2))];
      upd();
    };
    planeDrag(cv, (px, py) => setPt(px, py) !== false, setPt);
    upd();
    requestAnimationFrame(upd);
    new ResizeObserver(() => { if (cv.isConnected) upd(); }).observe(cv);
  }

  function buildData(card) {
    card.appendChild(h(`<p class="nn-lead-p">Jetzt hat das Neuron eine echte Aufgabe: <b>Daten in zwei Gruppen trennen</b>. Statt an Reglern zu drehen, schiebst du direkt die <b>Gerade</b> – an den zwei <b>blauen Griffen</b>. Das Neuron rechts zeigt dir, welche Gewichte und welcher Bias dazu gehören. <b>Tippe einen Punkt an</b>, dann siehst du, was das Neuron mit ihm macht.</p>`));
    const pick = h('<div class="nn-task-pick"></div>');
    Object.entries(DS).forEach(([k, d]) => {
      const b = h(`<button type="button" class="nn-pill${dsKey === k ? ' on' : ''}" data-ds="${k}">${d.name}</button>`);
      b.addEventListener('click', () => { dsKey = k; dsSel = 0; pick.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
      pick.appendChild(b);
    });
    const text = h('<p class="nn-task-text"></p>');
    const grid = h('<div class="nn-line-grid"><div class="nn-plane"><canvas></canvas></div><div class="nn-line-side"><div class="nn-line-pic"></div></div></div>');
    const cv = grid.querySelector('canvas'), pic = grid.querySelector('.nn-line-pic'), side = grid.querySelector('.nn-line-side');
    const flip = h('<button type="button" class="nn-btn">⇄ Feuer-Seite tauschen</button>');
    flip.addEventListener('click', () => { DS[dsKey].flip *= -1; upd(); });
    const msg = h('<p class="nn-task-msg"></p>');
    side.append(flip, msg);
    card.append(pick, text, grid);
    card.appendChild(h(`<div class="nn-summary"><b>Das Wichtigste</b><ul>
      <li>Ein Neuron nimmt jeden <b>Eingang</b> mal sein <b>Gewicht</b> und zählt alles zusammen.</li>
      <li>Der <b>Bias</b> legt die Schwelle fest: Erst wenn die Summe darüber liegt, <b>feuert</b> das Neuron (Aktivierung).</li>
      <li>Mit zwei Eingängen zieht ein Neuron <b>eine Gerade</b> und trennt so Daten in zwei Gruppen.</li>
      <li>Mehr als eine Gerade kann ein Neuron nicht. Für XOR braucht man <b>mehrere Neuronen</b> – ein <b>Netz</b>. Das baust du im Bereich „Netze bauen“.</li></ul></div>`));
    let P = null, grab = -1;
    function upd() {
      const d = DS[dsKey], pts = dsPoints(d), N = dsNeuron(d);
      if (dsSel >= pts.length) dsSel = 0;
      text.innerHTML = d.text;
      const p = pts[dsSel];
      pic.innerHTML = '';
      pic.appendChild(stageSVG({ x: p.x, w: N.w, b: N.b, show: 4, names: d.names, outText: d.out }));
      P = drawPlane(cv, { w: N.w, b: N.b, xr: d.xr, yr: d.yr, labels: d.labels, points: pts, handles: d.h, sel: dsSel });
      const ok = pts.filter(q => (N.w[0] * q.x[0] + N.w[1] * q.x[1] + N.b > 0 ? 1 : 0) === q.soll).length;
      const all = ok === pts.length;
      msg.className = 'nn-task-msg' + (all ? ' ok' : '');
      msg.innerHTML = `<b>${ok} von ${pts.length}</b> richtig.<br>` + (all
        ? (dsKey === 'xor' ? 'Wirklich? Schau genau hin …' : 'Geschafft – eine Gerade reicht hier.')
        : dsKey === 'xor' ? '<b>Denkanstoß:</b> Kannst du die beiden orangen Punkte mit <i>einer</i> Geraden von den weißen trennen? Was bräuchte man dafür?'
          : 'Schiebe die Griffe. Liegt die gelbe Fläche auf der falschen Seite? Dann tausche die Feuer-Seite.');
    }
    planeDrag(cv, (px, py) => {
      if (!P) return false;
      const d = DS[dsKey];
      grab = d.h.findIndex(([a, c]) => { const [hx, hy] = P.toPx(a, c); return Math.hypot(hx - px, hy - py) < 24; });
      if (grab >= 0) return true;
      // sonst nächsten Datenpunkt wählen
      let best = -1, bd = 26;
      dsPoints(d).forEach((q, i) => { const [qx, qy] = P.toPx(q.x[0], q.x[1]); const dd = Math.hypot(qx - px, qy - py); if (dd < bd) { bd = dd; best = i; } });
      if (best >= 0) { dsSel = best; upd(); }
      return false;
    }, (px, py) => {
      const d = DS[dsKey];
      const [a, c] = P.toData(px, py);
      d.h[grab] = [Math.max(d.xr[0], Math.min(d.xr[1], a)), Math.max(d.yr[0], Math.min(d.yr[1], c))];
      const o = d.h[1 - grab];
      if (Math.hypot((d.h[grab][0] - o[0]) / (d.xr[1] - d.xr[0]), (d.h[grab][1] - o[1]) / (d.yr[1] - d.yr[0])) < 0.04) return;
      upd();
    });
    upd();
    requestAnimationFrame(upd);
    new ResizeObserver(() => { if (cv.isConnected) upd(); }).observe(cv);
  }

  function renderWie(page) {
    const nav = h('<nav class="nn-steps"></nav>');
    STEPS.forEach((s, i) => {
      const b = h(`<button type="button" class="nn-step${s.id === step ? ' on' : ''}" data-step="${s.id}"><i>${i + 1}</i>${s.kurz}</button>`);
      b.addEventListener('click', () => { step = s.id; again(); });
      nav.appendChild(b);
    });
    const i = STEPS.findIndex(s => s.id === step);
    const card = h(`<section class="nn-card nn-stepcard"><p class="nn-kicker">Schritt ${i + 1} von ${STEPS.length}</p><h2>${STEPS[i].title}</h2></section>`);
    if (step === 'bio') BUILD.bio(card);
    else if (step === 'line') buildLine(card);
    else if (step === 'data') buildData(card);
    else stepCard(card, step);
    const foot = h('<div class="nn-foot"></div>');
    if (i > 0) { const b = h(`<button type="button" class="nn-btn">‹ ${STEPS[i - 1].kurz}</button>`); b.onclick = () => { step = STEPS[i - 1].id; again(); }; foot.appendChild(b); }
    foot.appendChild(h('<span></span>'));
    if (i < STEPS.length - 1) { const b = h(`<button type="button" class="nn-btn primary">${STEPS[i + 1].kurz} ›</button>`); b.onclick = () => { step = STEPS[i + 1].id; again(); }; foot.appendChild(b); }
    card.appendChild(foot);
    page.append(nav, card);
    function again() { page.innerHTML = ''; renderWie(page); page.closest('#neuron-page').scrollTop = 0; }
  }

  /* ── Reiter 2: Alle Neuronen ───────────────────────────── */
  function renderTypen(page) {
    page.appendChild(h(`<section class="nn-card nn-lead"><h2>Alle Neuronen</h2>
      <p>Alle Neuronen rechnen zuerst gleich: <span class="nn-f">z = w₁·x₁ + w₂·x₂ + … + b</span>. Sie unterscheiden sich nur in der <b>Aktivierungsfunktion</b> f – also darin, was sie aus z machen. Schiebe z und schau, was herauskommt.</p></section>`));
    const grid = h('<div class="nn-type-grid"></div>');
    ORDER.forEach(k => {
      const act = activations[k], I = INFO[k];
      const card = h(`<section class="nn-card nn-type" style="--type-color:${act.color}">
        <div class="nn-type-head"><h3>${act.fullName}</h3><span class="nn-type-out">Ausgabe: ${I.out}</span></div>
        <div class="nn-type-pics"><div class="nn-type-neuron"></div><div class="nn-type-curve"></div></div>
        <div class="nn-type-formula">${act.formula}</div>
        <div class="nn-type-z"></div>
        <p>${I.was}</p>
        <p><b>Wofür?</b> ${I.wofuer}</p>
        <p class="nn-type-warn"><b>Achtung:</b> ${I.achtung}</p>
      </section>`);
      card.querySelector('.nn-type-neuron').appendChild(neuronSVG({ type: k }));
      const cv = card.querySelector('.nn-type-curve');
      const zBox = card.querySelector('.nn-type-z');
      let z = 1;
      const out = h('<div class="nn-type-apply"></div>');
      const draw = () => { cv.innerHTML = ''; cv.appendChild(curveSVG(k, z)); out.innerHTML = act.apply(z).replace(/(\d)\.(\d)/g, '$1,$2'); };
      zBox.appendChild(slider('z', -4, 4, 0.1, z, v => { z = v; draw(); }));
      zBox.appendChild(out);
      draw();
      grid.appendChild(card);
    });
    page.appendChild(grid);
  }

  /* ── Seite ─────────────────────────────────────────────── */
  function render(root, api) {
    root.innerHTML = '';
    const tabs = h('<nav class="nn-tabs"></nav>');
    api.tabs.forEach(t => {
      const b = h(`<button type="button" class="nn-tab${t.id === api.current ? ' on' : ''}" data-id="${t.id}">${t.title}</button>`);
      b.addEventListener('click', () => api.go(t.id));
      tabs.appendChild(b);
    });
    root.appendChild(tabs);
    const page = h('<div class="nn-page"></div>');
    root.appendChild(page);
    if (api.current === 'n-typen') renderTypen(page);
    else if (api.current === 'n-wie') renderWie(page);
    root.scrollTop = 0;
  }

  window.NLNeuron = { render, neuronSVG, curveSVG };
})();
