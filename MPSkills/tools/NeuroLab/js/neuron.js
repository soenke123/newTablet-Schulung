/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich „Wie funktioniert ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Zwei Kacheln (= zwei Reiter, die Lehrkraft gibt jede einzeln frei):
     n-wie    So rechnet ein Neuron in sechs Schritten (20.11.2026, 2. Fassung):
              Nervenzelle ↔ künstliches Neuron · Eingänge & Gewichte (Kommazahlen)
              · Summe & Bias (Zahlenstrahl) · Aktivierung (Typ + Kurve) · Eine
              Gerade (Ebene mit ziehbarem Punkt, Typ umschaltbar) · Türsteher
              (UND · ODER · XOR mit den vier Punkten in der Ebene) + „Das Wichtigste“
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
        const col = w < 0 ? '#dc2626' : act.color;
        s.appendChild(el('line', { 'data-k': 'w', x1: 56, y1: iy, x2: ox, y2: cy + (i ? 14 : -14), stroke: col, 'stroke-width': sw, 'stroke-opacity': Math.abs(w) < 0.01 ? 0.3 : 0.75, 'stroke-dasharray': Math.abs(w) < 0.01 ? '4 3' : 'none' }));
        s.appendChild(el('circle', { 'data-k': 'in', cx: 34, cy: iy, r: 22, fill: '#fff', stroke: '#4caf8a', 'stroke-width': 2.5 }));
        s.appendChild(el('text', { x: 34, y: iy + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#2e7d5e' }, `${de(o.x[i])}`));
        s.appendChild(el('text', { x: 34, y: iy + (i ? 38 : -28), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#64748b' }, `x${i + 1}`));
        const mx = (56 + ox) / 2, my = (iy + cy + (i ? 14 : -14)) / 2;
        s.appendChild(el('rect', { 'data-k': 'w', x: mx - 28, y: my - 9, width: 56, height: 17, rx: 4, fill: '#fff', 'fill-opacity': 0.92, stroke: 'transparent' }));
        s.appendChild(el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, 'font-family': 'monospace', fill: col }, `w${i + 1}=${de(w)}`));
      });
    }
    s.appendChild(el('rect', { x: ox, y: NBY, width: NBW, height: NBH, rx: 12, class: 'neuron-body' }));
    s.appendChild(el('rect', { 'data-k': 'sum', x: ox + 3, y: NBY + 3, width: NBW / 2 - 6, height: NBH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
    s.appendChild(el('rect', { 'data-k': 'f', x: ox + NBW / 2 + 3, y: NBY + 3, width: NBW / 2 - 6, height: NBH - 6, rx: 9, fill: 'transparent', stroke: 'transparent' }));
    s.appendChild(el('line', { x1: ox + NBW / 2, y1: NBY + 6, x2: ox + NBW / 2, y2: NBY + NBH - 6, class: 'neuron-divider' }));
    s.appendChild(el('text', { x: ox + NBW / 2, y: NBY - 8, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: act.color }, act.fullName));
    const lx = ox + NBW / 4, rx = ox + NBW * 3 / 4;
    s.appendChild(el('text', { x: lx, y: cy + (withIn ? -4 : 8), 'text-anchor': 'middle', 'font-size': 22, class: 'neuron-sigma' }, 'Σ'));
    if (withIn) s.appendChild(el('text', { x: lx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#444' }, `z=${de(z)}`));
    const two = act.shortLines.length > 1;
    const fo = el('foreignObject', { x: rx - 38, y: cy - (two ? 16 : 13) - (withIn ? 6 : 0), width: 76, height: two ? 30 : 24 });
    const fDiv = document.createElement('div');
    fDiv.className = 'svg-math';
    fDiv.innerHTML = act.shortLines.map(f => `<span>${f}</span>`).join('');
    fo.appendChild(fDiv);
    s.appendChild(fo);
    if (withIn) s.appendChild(el('text', { x: rx, y: cy + (two ? 24 : 20), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: act.color }, `y′=${de(y)}`));
    // Bias
    const bx = lx, by0 = NBY + NBH, by1 = by0 + 26;
    s.appendChild(el('line', { 'data-k': 'b', x1: bx, y1: by1, x2: bx, y2: by0 + 8, class: 'bias-line' }));
    s.appendChild(el('polygon', { points: `${bx},${by0} ${bx - 4},${by0 + 8} ${bx + 4},${by0 + 8}`, fill: '#888' }));
    s.appendChild(el('text', { x: bx, y: by1 + 14, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#64748b' }, withIn ? `b = ${de(o.b)}` : 'b'));
    // Ausgabe
    const ol = ox + NBW;
    s.appendChild(el('line', { 'data-k': 'out', x1: ol, y1: cy, x2: ol + 16, y2: cy, stroke: '#94a3b8', 'stroke-width': 1.5 }));
    s.appendChild(el('rect', { 'data-k': 'out', x: ol + 18, y: cy - 13, width: withIn ? 70 : 56, height: 26, rx: 4, fill: withIn ? '#fffbeb' : '#f8fafc', stroke: withIn ? '#f59e0b' : '#d1d5db', 'stroke-width': 1.5 }));
    s.appendChild(el('text', { x: ol + 18 + (withIn ? 35 : 28), y: cy + 5, 'text-anchor': 'middle', 'font-size': withIn ? 13 : 12, 'font-weight': 700, fill: withIn ? '#b45309' : '#94a3b8' }, withIn ? de(y) : 'y′'));
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
  function typeButtons(cur, on) {
    const box = h('<div class="nn-types"></div>');
    ORDER.forEach(k => {
      const b = h(`<button type="button" class="popup-type-btn${cur() === k ? ' selected' : ''}" style="--btn-color:${activations[k].color}">${activations[k].fullName}</button>`);
      b.addEventListener('click', () => { on(k); box.querySelectorAll('button').forEach(x => x.classList.toggle('selected', x === b)); });
      box.appendChild(b);
    });
    return box;
  }

  /* ── Ebene: ein Neuron mit zwei Eingängen teilt sie mit einer Geraden ──
     o = { type, w, b, lo, hi, point:[x1,x2]|null, points:[{x, soll}]|null }
     Hintergrund = Ausgabe des Neurons an jeder Stelle, dicke Linie = z = 0,
     Pfeil = Seite, auf der z wächst. Gibt eine Funktion zurück, die aus
     Bildschirm- Ebenenkoordinaten macht (zum Ziehen des Punkts). */
  function drawPlane(cv, o) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wc = cv.clientWidth || 360, Hc = cv.clientHeight || 300;
    cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = 30, lo = o.lo, hi = o.hi;
    const X = v => P + (v - lo) / (hi - lo) * (Wc - P - 8);
    const Y = v => Hc - P - (v - lo) / (hi - lo) * (Hc - P - 8);
    const iX = px => lo + (px - P) / (Wc - P - 8) * (hi - lo);
    const iY = py => lo + (Hc - P - py) / (Hc - P - 8) * (hi - lo);
    const act = activations[o.type];
    const hex = act.color.replace('#', '');
    const tc = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const level = z => {
      const v = act.fn(z);
      if (o.type === 'tanh') return (v + 1) / 2;
      if (o.type === 'linear') return 1 / (1 + Math.exp(-v));
      if (o.type === 'relu') return Math.min(1, v / 3);
      return v;
    };
    const st = 5;
    for (let px = P; px < Wc - 8; px += st) for (let py = 8; py < Hc - P; py += st) {
      const z = o.w[0] * iX(px + st / 2) + o.w[1] * iY(py + st / 2) + o.b;
      const t = Math.max(0, Math.min(1, level(z)));
      const lo0 = [241, 245, 249];
      const hi0 = tc.map(c => Math.round(c * 0.55 + 255 * 0.45));
      g.fillStyle = `rgb(${lo0.map((c, i) => Math.round(c + (hi0[i] - c) * t)).join(',')})`;
      g.fillRect(px, py, st + 0.5, st + 0.5);
    }
    // Achsen
    g.strokeStyle = 'rgba(100,116,139,.35)'; g.lineWidth = 1;
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#64748b'; g.textAlign = 'center';
    const stepT = (hi - lo) > 4 ? 1 : 0.5;
    for (let v = Math.ceil(lo / stepT) * stepT; v <= hi + 1e-9; v += stepT) {
      g.beginPath(); g.moveTo(X(v), 8); g.lineTo(X(v), Hc - P); g.stroke();
      g.beginPath(); g.moveTo(P, Y(v)); g.lineTo(Wc - 8, Y(v)); g.stroke();
      if ((hi - lo) <= 4 || Math.abs(v % 2) < 1e-9 || Math.abs(v % 2) > 2 - 1e-9) {
        g.fillText(de(v), X(v), Hc - P + 14);
        g.textAlign = 'right'; g.fillText(de(v), P - 4, Y(v) + 4); g.textAlign = 'center';
      }
    }
    g.fillStyle = '#334155'; g.font = 'bold 12px system-ui, sans-serif';
    g.fillText('x₁ →', Wc - 30, Hc - 4);
    g.save(); g.translate(10, 22); g.fillText('x₂', 0, 0); g.restore();
    // Gerade z = 0
    const [w1, w2] = o.w, b = o.b;
    if (Math.abs(w1) > 1e-6 || Math.abs(w2) > 1e-6) {
      let pts = [];
      if (Math.abs(w2) > 1e-6) {
        pts = [[lo, -(w1 * lo + b) / w2], [hi, -(w1 * hi + b) / w2]];
      } else pts = [[-b / w1, lo], [-b / w1, hi]];
      g.save();
      g.beginPath(); g.rect(P, 8, Wc - P - 8, Hc - P - 8); g.clip();
      g.strokeStyle = '#0f172a'; g.lineWidth = 3; g.setLineDash([]);
      g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); g.lineTo(X(pts[1][0]), Y(pts[1][1])); g.stroke();
      // Pfeil zur Seite mit großem z (von der Bildmitte aus auf die Gerade gefällt)
      const m = (lo + hi) / 2, n2 = w1 * w1 + w2 * w2, d0 = (w1 * m + w2 * m + b) / n2;
      const fx = m - w1 * d0, fy = m - w2 * d0;
      const len = Math.sqrt(n2), ax = X(fx), ay = Y(fy);
      const dx = w1 / len * 34, dy = -w2 / len * 34;
      g.strokeStyle = '#0f172a'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + dx, ay + dy); g.stroke();
      const an = Math.atan2(dy, dx);
      g.beginPath(); g.moveTo(ax + dx, ay + dy);
      g.lineTo(ax + dx - 9 * Math.cos(an - 0.45), ay + dy - 9 * Math.sin(an - 0.45));
      g.lineTo(ax + dx - 9 * Math.cos(an + 0.45), ay + dy - 9 * Math.sin(an + 0.45));
      g.closePath(); g.fillStyle = '#0f172a'; g.fill();
      g.restore();
    }
    // Vier Punkte (Türsteher) oder ein Eingabepunkt
    (o.points || []).forEach(p => {
      const z = w1 * p.x[0] + w2 * p.x[1] + b, y = act.fn(z);
      const ok = (y >= 0.5 ? 1 : 0) === p.soll;
      g.beginPath(); g.arc(X(p.x[0]), Y(p.x[1]), 11, 0, Math.PI * 2);
      g.fillStyle = p.soll ? '#f59e0b' : '#fff'; g.fill();
      g.lineWidth = 3; g.strokeStyle = ok ? '#059669' : '#dc2626'; g.stroke();
      g.fillStyle = p.soll ? '#fff' : '#334155'; g.font = 'bold 12px system-ui, sans-serif';
      g.fillText(String(p.soll), X(p.x[0]), Y(p.x[1]) + 4);
    });
    if (o.point) {
      const [a, c] = o.point;
      g.beginPath(); g.arc(X(a), Y(c), 9, 0, Math.PI * 2);
      g.fillStyle = '#4caf8a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = '#065f46'; g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'left';
      g.fillText(`(${de(a)} | ${de(c)})`, Math.min(X(a) + 12, Wc - 70), Math.max(Y(c) - 10, 20));
      g.textAlign = 'center';
    }
    return (px, py) => [iX(px), iY(py)];
  }

  /* ── Reiter 1: So rechnet ein Neuron — sechs Schritte ─────
     Ein Neuron begleitet durch alle Schritte (st): was man in Schritt 2
     einstellt, steht in Schritt 5 noch da. Die Impulsaufgabe hat ihr
     eigenes Neuron (ts), weil dort nur 0 und 1 hineingehen. */
  const st = { type: 'sigmoid', x: [2, 1], w: [1, -0.5], b: -0.5 };
  const ts = { type: 'perceptron', w: [1, 1], b: 0, task: 'und' };
  const TASKS = {
    und: { name: 'UND', soll: [0, 0, 0, 1], text: 'nur dann 1 ausgibt, wenn x₁ = 1 <b>und</b> x₂ = 1 ist' },
    oder: { name: 'ODER', soll: [0, 1, 1, 1], text: '1 ausgibt, sobald <b>mindestens einer</b> der Eingänge 1 ist' },
    xor: { name: 'XOR', soll: [0, 1, 1, 0], text: '1 ausgibt, wenn <b>genau einer</b> der Eingänge 1 ist' },
  };
  const STEPS = [
    { id: 'bio', kurz: 'Nervenzelle', title: 'Vom Gehirn zum künstlichen Neuron' },
    { id: 'in', kurz: 'Eingänge & Gewichte', title: 'Eingänge und Gewichte' },
    { id: 'sum', kurz: 'Summe & Bias', title: 'Alles zusammenzählen: Summe und Bias' },
    { id: 'act', kurz: 'Aktivierung', title: 'Die Aktivierungsfunktion' },
    { id: 'line', kurz: 'Eine Gerade', title: 'Ein Neuron zieht eine Gerade' },
    { id: 'task', kurz: 'Türsteher', title: 'Impulsaufgabe: Ein Neuron als Türsteher' },
  ];
  let step = 'bio';

  const PAIRS = [
    { k: 'in', bio: 'Dendriten', kn: 'Eingänge x', t: 'Die Dendriten nehmen Signale anderer Zellen auf. Beim künstlichen Neuron kommen hier Zahlen herein: x₁, x₂ …' },
    { k: 'w', bio: 'Synapsen', kn: 'Gewichte w', t: 'Manche Synapsen leiten stark, manche schwach, manche hemmen. Das Gewicht sagt, wie wichtig ein Eingang ist – negativ = bremst.' },
    { k: 'sum', bio: 'Zellkörper', kn: 'Summe Σ', t: 'Im Zellkörper laufen alle Signale zusammen. Das Neuron zählt alle Eingänge × Gewichte zusammen.' },
    { k: 'b', bio: 'Reizschwelle', kn: 'Bias b', t: 'Eine Nervenzelle feuert erst, wenn genug Reiz zusammenkommt. Der Bias verschiebt diese Schwelle: Wie leicht springt das Neuron an?' },
    { k: 'f', bio: 'Feuern (Axonhügel)', kn: 'Aktivierung f', t: 'Am Axonhügel wird entschieden: feuern oder nicht. Die Aktivierungsfunktion macht aus der Summe die Ausgabe.' },
    { k: 'out', bio: 'Axon', kn: 'Ausgabe y′', t: 'Das Axon leitet das Signal an die nächsten Zellen weiter. Die Ausgabe y′ wird zum Eingang der nächsten Neuronen.' },
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

  const BUILD = {
    bio(card) {
      card.appendChild(h(`<p class="nn-lead-p">Dein Gehirn hat rund <b>86 Milliarden Nervenzellen</b>. Jede bekommt Signale von anderen Zellen, „entscheidet“, ob sie selbst feuert, und gibt ihr Signal weiter. Ein <b>künstliches Neuron</b> ist ein stark vereinfachtes Rechenmodell davon. <b>Tippe auf ein Teil</b> – du siehst, was ihm im künstlichen Neuron entspricht.</p>`));
      const grid = h('<div class="nn-two"><div class="nn-col-bio"></div><div class="nn-col-kn"></div></div>');
      const bio = bioSVG();
      const kn = neuronSVG({ type: 'sigmoid', x: [1, 0.5], w: [0.8, -0.4], b: 0.2 });
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

    in(card) {
      card.appendChild(h(`<p class="nn-lead-p">In ein Neuron gehen <b>Zahlen</b> hinein – nicht nur 0 und 1, sondern jede Kommazahl: eine Temperatur, ein Gewicht in kg, die Helligkeit eines Pixels. Jeder Eingang x wird mit seinem <b>Gewicht w</b> malgenommen. Großes Gewicht = <b>wichtig</b>, Gewicht 0 = <b>egal</b>, negatives Gewicht = <b>bremst</b>.</p>`));
      const grid = h('<div class="nn-play-grid"><div class="nn-play-pic"></div><div class="nn-play-ctl"></div></div>');
      const pic = grid.children[0], ctl = grid.children[1];
      const bars = h('<div class="nn-bars"></div>');
      const sx = [slider('x₁', -5, 5, 0.5, st.x[0], v => { st.x[0] = v; upd(); }), slider('x₂', -5, 5, 0.5, st.x[1], v => { st.x[1] = v; upd(); })];
      sx.forEach(r => r.classList.add('nn-slider-x'));
      ctl.append(h('<b class="nn-ctl-h">Eingänge</b>'), ...sx, h('<b class="nn-ctl-h">Gewichte</b>'),
        slider('w₁', -3, 3, 0.1, st.w[0], v => { st.w[0] = v; upd(); }),
        slider('w₂', -3, 3, 0.1, st.w[1], v => { st.w[1] = v; upd(); }));
      card.append(grid, bars, h('<p class="nn-try"><b>Probier:</b> Stelle w₂ auf 0 – was ändert x₂ dann noch? Und was passiert, wenn w₁ negativ wird?</p>'));
      function upd() {
        pic.innerHTML = '';
        pic.appendChild(neuronSVG({ type: 'linear', x: st.x, w: st.w, b: 0 }));
        const p = [st.x[0] * st.w[0], st.x[1] * st.w[1]];
        const M = Math.max(4, Math.abs(p[0]), Math.abs(p[1]));
        bars.innerHTML = p.map((v, i) => `<div class="nn-bar"><span>x${i + 1} · w${i + 1} = ${de(st.x[i])} · ${de(st.w[i])}</span>
          <div class="nn-bar-track"><i class="${v < 0 ? 'neg' : 'pos'}" style="${v < 0 ? 'right:50%' : 'left:50%'};width:${Math.abs(v) / M * 50}%"></i><em></em></div><b>${de(v)}</b></div>`).join('');
      }
      upd();
    },

    sum(card) {
      card.appendChild(h(`<p class="nn-lead-p">Das Neuron zählt alles zusammen und gibt noch eine feste Zahl dazu, den <b>Bias b</b>: <span class="nn-f">z = w₁·x₁ + w₂·x₂ + b</span>. Der Bias ist wie die <b>Grundstimmung</b> des Neurons: Großer Bias = springt schon bei wenig an, negativer Bias = braucht viel Reiz.</p>`));
      const grid = h('<div class="nn-play-grid"><div class="nn-play-pic"></div><div class="nn-play-ctl"></div></div>');
      const pic = grid.children[0], ctl = grid.children[1];
      const line = h('<div class="nn-zline"></div>');
      ctl.append(slider('x₁', -5, 5, 0.5, st.x[0], v => { st.x[0] = v; upd(); }),
        slider('x₂', -5, 5, 0.5, st.x[1], v => { st.x[1] = v; upd(); }),
        slider('b', -5, 5, 0.1, st.b, v => { st.b = v; upd(); }, 'nn-slider-b'));
      const calc = h('<div class="nn-calc"></div>');
      card.append(grid, line, calc, h('<p class="nn-try"><b>Probier:</b> Finde einen Bias, bei dem z genau 0 ist. Was passiert mit z, wenn du nur den Bias änderst?</p>'));
      function upd() {
        pic.innerHTML = '';
        pic.appendChild(neuronSVG({ type: 'linear', x: st.x, w: st.w, b: st.b }));
        const parts = [st.x[0] * st.w[0], st.x[1] * st.w[1], st.b];
        const z = parts[0] + parts[1] + parts[2];
        // Zahlenstrahl: die drei Teile als Pfeile hintereinander
        const R = Math.max(6, Math.ceil(Math.max(...[0, parts[0], parts[0] + parts[1], z].map(Math.abs)) + 1));
        const X = v => 20 + (v + R) / (2 * R) * 560;
        let pos = 0, arrows = '';
        const cols = ['#3b82f6', '#8b5cf6', '#64748b'], names = ['w₁·x₁', 'w₂·x₂', 'b'];
        parts.forEach((v, i) => {
          const y = 22 + i * 18;
          arrows += `<line x1="${X(pos)}" y1="${y}" x2="${X(pos + v)}" y2="${y}" stroke="${cols[i]}" stroke-width="5" stroke-linecap="round"/>
            <text x="${(X(pos) + X(pos + v)) / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${cols[i]}">${names[i]}</text>`;
          pos += v;
        });
        let ticks = '';
        for (let v = -R; v <= R; v++) ticks += `<line x1="${X(v)}" y1="80" x2="${X(v)}" y2="${v % 5 ? 85 : 89}" stroke="#94a3b8"/>${v % 5 ? '' : `<text x="${X(v)}" y="101" text-anchor="middle" font-size="10" fill="#64748b">${String(v).replace('-', '−')}</text>`}`;
        line.innerHTML = `<svg viewBox="0 0 600 120"><line x1="20" y1="80" x2="580" y2="80" stroke="#94a3b8"/>${ticks}${arrows}
          <line x1="${X(z)}" y1="12" x2="${X(z)}" y2="80" stroke="#0f172a" stroke-dasharray="3 3"/>
          <circle cx="${X(z)}" cy="80" r="7" fill="#0f172a"/><text x="${X(z)}" y="116" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">z = ${de(z)}</text></svg>`;
        calc.innerHTML = `<div>z = ${de(st.w[0])}·${de(st.x[0])} + ${de(st.w[1])}·${de(st.x[1])} + (${de(st.b)}) = <b>${de(z)}</b></div>`;
      }
      upd();
    },

    act(card) {
      card.appendChild(h(`<p class="nn-lead-p">z kann jede Zahl sein. Die <b>Aktivierungsfunktion f</b> macht daraus die Ausgabe <span class="nn-f">y′ = f(z)</span>. Das <b>Perceptron</b> sagt nur ja (1) oder nein (0), <b>Sigmoid</b> sagt „wie sicher“ zwischen 0 und 1, <b>ReLU</b> lässt nur Positives durch. Mehr dazu im Reiter „Alle Neuronen“.</p>`));
      const grid = h('<div class="nn-play-grid"><div class="nn-play-pic"></div><div class="nn-play-ctl"></div></div>');
      const pic = grid.children[0], ctl = grid.children[1];
      const curve = h('<div class="nn-curve"></div>');
      ctl.append(typeButtons(() => st.type, k => { st.type = k; upd(); }), curve,
        slider('b', -5, 5, 0.1, st.b, v => { st.b = v; upd(); }, 'nn-slider-b'));
      const calc = h('<div class="nn-calc"></div>');
      card.append(grid, calc, h('<p class="nn-try"><b>Probier:</b> Schalte zwischen Perceptron und Sigmoid um. Bei welchem z ist Sigmoid genau 0,5?</p>'));
      function upd() {
        const act = activations[st.type];
        pic.innerHTML = '';
        pic.appendChild(neuronSVG({ type: st.type, x: st.x, w: st.w, b: st.b }));
        const z = st.x[0] * st.w[0] + st.x[1] * st.w[1] + st.b;
        curve.innerHTML = ''; curve.appendChild(curveSVG(st.type, z));
        calc.innerHTML = `<div>z = <b>${de(z)}</b></div><div>y′ = ${act.apply(z).replace(/(\d)\.(\d)/g, '$1,$2')}</div>`;
      }
      upd();
    },

    line(card) {
      card.appendChild(h(`<p class="nn-lead-p">Mit zwei Eingängen ist jede Eingabe ein <b>Punkt</b> (x₁ | x₂) in der Ebene. Überall, wo <span class="nn-f">w₁·x₁ + w₂·x₂ + b = 0</span> ist, kippt die Entscheidung – das ist eine <b>Gerade</b>. Die <b>Gewichte drehen</b> sie, der <b>Bias verschiebt</b> sie. Die Farbe zeigt, was das Neuron an jeder Stelle ausgibt; der Pfeil zeigt zur Seite mit großem y′. <b>Ziehe den grünen Punkt.</b></p>`));
      const grid = h('<div class="nn-line-grid"><div class="nn-plane"><canvas></canvas></div><div class="nn-line-side"><div class="nn-line-pic"></div></div></div>');
      const cv = grid.querySelector('canvas'), pic = grid.querySelector('.nn-line-pic'), side = grid.querySelector('.nn-line-side');
      const ws = [slider('w₁', -3, 3, 0.1, st.w[0], v => { st.w[0] = v; upd(); }), slider('w₂', -3, 3, 0.1, st.w[1], v => { st.w[1] = v; upd(); }),
        slider('b', -5, 5, 0.1, st.b, v => { st.b = v; upd(); }, 'nn-slider-b')];
      side.append(typeButtons(() => st.type, k => { st.type = k; upd(); }), ...ws);
      const calc = h('<div class="nn-calc"></div>');
      card.append(grid, calc, h('<p class="nn-try"><b>Probier:</b> Stelle w₁ = 0 – wie liegt die Gerade jetzt? Was macht ein negativer Bias? Und warum ist die Gerade bei jedem Typ an derselben Stelle?</p>'));
      let toPlane = null, drag = false;
      const move = e => {
        if (!toPlane) return;
        const r = cv.getBoundingClientRect();
        const [a, c] = toPlane(e.clientX - r.left, e.clientY - r.top);
        st.x = [Math.max(-5, Math.min(5, Math.round(a * 2) / 2)), Math.max(-5, Math.min(5, Math.round(c * 2) / 2))];
        upd();
      };
      cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
      cv.addEventListener('pointermove', e => { if (drag) move(e); });
      cv.addEventListener('pointerup', () => { drag = false; });
      function upd() {
        const act = activations[st.type];
        pic.innerHTML = '';
        pic.appendChild(neuronSVG({ type: st.type, x: st.x, w: st.w, b: st.b }));
        toPlane = drawPlane(cv, { type: st.type, w: st.w, b: st.b, lo: -5, hi: 5, point: st.x });
        const z = st.x[0] * st.w[0] + st.x[1] * st.w[1] + st.b;
        calc.innerHTML = `<div>Gerade: ${de(st.w[0])}·x₁ + ${de(st.w[1])}·x₂ + (${de(st.b)}) = 0</div>
          <div>Punkt (${de(st.x[0])} | ${de(st.x[1])}): z = ${de(z)} → ${z > 0 ? 'auf der Pfeil-Seite' : z < 0 ? 'auf der anderen Seite' : 'genau auf der Geraden'}, y′ = ${de(act.fn(z))}</div>`;
      }
      upd();
      requestAnimationFrame(upd);   // Ebene nochmal mit den echten Maßen
      new ResizeObserver(() => { if (cv.isConnected) upd(); }).observe(cv);
    },

    task(card) {
      card.appendChild(h('<p class="nn-lead-p">Jetzt gehen nur 0 und 1 hinein – wie bei einem Türsteher, der zwei Bedingungen prüft. Stelle Gewichte und Bias so ein, dass das Neuron die Regel erfüllt. In der Ebene rechts siehst du die vier Fälle als Punkte: Die Gerade muss die 1en von den 0en trennen.</p>'));
      const pick = h('<div class="nn-task-pick"></div>');
      Object.entries(TASKS).forEach(([k, t]) => {
        const b = h(`<button type="button" class="nn-pill${ts.task === k ? ' on' : ''}">${t.name}</button>`);
        b.addEventListener('click', () => { ts.task = k; pick.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
        pick.appendChild(b);
      });
      const text = h('<p class="nn-task-text"></p>');
      const grid = h(`<div class="nn-line-grid"><div class="nn-task-left">
          <table class="nn-truth"><thead><tr><th>x₁</th><th>x₂</th><th>z</th><th>y′</th><th>soll</th><th></th></tr></thead><tbody></tbody></table>
        </div><div class="nn-plane nn-plane-sm"><canvas></canvas></div></div>`);
      const left = grid.querySelector('.nn-task-left'), cv = grid.querySelector('canvas');
      left.prepend(typeButtons(() => ts.type, k => { ts.type = k; upd(); }),
        slider('w₁', -3, 3, 0.1, ts.w[0], v => { ts.w[0] = v; upd(); }),
        slider('w₂', -3, 3, 0.1, ts.w[1], v => { ts.w[1] = v; upd(); }),
        slider('b', -3, 3, 0.1, ts.b, v => { ts.b = v; upd(); }, 'nn-slider-b'));
      const msg = h('<p class="nn-task-msg"></p>');
      card.append(pick, text, grid, msg);
      const sum = h(`<div class="nn-summary"><b>Das Wichtigste</b><ul>
        <li>Ein Neuron bekommt Zahlen x, nimmt jede mit ihrem <b>Gewicht</b> mal und zählt alles mit dem <b>Bias</b> zusammen: z.</li>
        <li>Die <b>Aktivierungsfunktion</b> macht aus z die Ausgabe y′.</li>
        <li>Mit zwei Eingängen zieht ein Neuron eine <b>Gerade</b> – mehr nicht. Für XOR braucht man deshalb <b>mehrere Neuronen</b>: ein Netz.</li></ul></div>`);
      card.appendChild(sum);
      function upd() {
        const act = activations[ts.type];
        const T = TASKS[ts.task];
        text.innerHTML = `Das Neuron soll ${T.text}.`;
        let all = true;
        const C = [[0, 0], [0, 1], [1, 0], [1, 1]];
        grid.querySelector('tbody').innerHTML = C.map(([a, b], r) => {
          const zz = a * ts.w[0] + b * ts.w[1] + ts.b, yy = act.fn(zz);
          const ok = (yy >= 0.5 ? 1 : 0) === T.soll[r];
          all = all && ok;
          return `<tr class="${ok ? 'ok' : 'bad'}"><td>${a}</td><td>${b}</td><td>${de(zz)}</td><td>${de(yy)}</td><td>${T.soll[r]}</td><td>${ok ? '✓' : '✗'}</td></tr>`;
        }).join('');
        drawPlane(cv, { type: ts.type, w: ts.w, b: ts.b, lo: -0.5, hi: 1.5, points: C.map((x, r) => ({ x, soll: T.soll[r] })) });
        msg.className = 'nn-task-msg' + (all ? ' ok' : '');
        msg.innerHTML = all
          ? (ts.task === 'xor' ? '✓ Wirklich? Dann schau genau hin …' : `✓ Geschafft! Weiter: Klappt das auch für ${ts.task === 'und' ? 'ODER' : 'XOR'}?`)
          : (ts.task === 'xor'
            ? '<b>Denkanstoß:</b> Kannst du die beiden orangen Punkte mit <i>einer</i> Geraden von den weißen trennen? Was bräuchte man dafür?'
            : 'Tipp: y′ zählt als 1, wenn es mindestens 0,5 ist. Ändere zuerst den Bias.');
      }
      upd();
      requestAnimationFrame(upd);   // Ebene nochmal mit den echten Maßen
      new ResizeObserver(() => { if (cv.isConnected) upd(); }).observe(cv);
    },
  };

  function renderWie(page) {
    const nav = h('<nav class="nn-steps"></nav>');
    STEPS.forEach((s, i) => {
      const b = h(`<button type="button" class="nn-step${s.id === step ? ' on' : ''}" data-step="${s.id}"><i>${i + 1}</i>${s.kurz}</button>`);
      b.addEventListener('click', () => { step = s.id; again(); });
      nav.appendChild(b);
    });
    const i = STEPS.findIndex(s => s.id === step);
    const card = h(`<section class="nn-card nn-stepcard"><p class="nn-kicker">Schritt ${i + 1} von ${STEPS.length}</p><h2>${STEPS[i].title}</h2></section>`);
    BUILD[step](card);
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
