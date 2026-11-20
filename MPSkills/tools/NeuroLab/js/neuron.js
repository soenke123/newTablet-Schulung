/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich „Wie funktioniert ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Zwei Kacheln (= zwei Reiter, die Lehrkraft gibt jede einzeln frei):
     n-wie    Wie arbeitet ein Neuron? in sieben Schritten (20.11.2026, 4. Fassung):
              Nervenzelle ↔ Neuron · dann EIN Neuron (Perceptron, makeNeuron),
              das sich Schritt für Schritt aus dem Grau ausbreitet: Eingänge ·
              Gewichte · Summe & Bias · Aktivierung · Eine Gerade · Punkte trennen.
              Jeder Wert mit − / + am Neuron, Zahl antippen = Regler am Feld;
              darunter immer die Rechnung (calcHTML) in Formel-Schrift.
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

  /* ── Reiter 1: Wie arbeitet ein Neuron? (4. Fassung, 20.11.2026) ──────
     EIN Neuron (Perceptron) als feste Komponente (makeNeuron): Eingänge,
     Leitungen, Gewichte, Rumpf (Σ | f), Bias, Ausgabe. Jeder Wert hat ein
     − und + daneben, Antippen der Zahl öffnet am Feld einen kleinen Regler
     (Sönke: „keine Schieberegler daneben, die Werte direkt im Neuron
     ändern“). Was noch nicht dran war, ist da, aber ausgegraut und im
     Nebel – mit jedem Schritt breitet sich das Neuron aus (CSS-Übergang,
     data-show 1–4). Darunter immer die Rechnung in Formel-Schrift (KaTeX),
     Farben wie im Neuron: x orange, w türkis, b indigo, y gold.
     Kein Schwellen-Messer mehr: der Bias wird einfach dazugezählt. */
  const st = { x: [2, 1], w: [1, 0.5], b: -2 };
  const LIM = { x: [-5, 5, 0.5, 0.1], w: [-3, 3, 0.5, 0.05], b: [-8, 8, 0.5, 0.1] };   // min, max, ±, Reglerschritt
  const STEPS = [
    { id: 'bio', kurz: 'Nervenzelle', title: 'Vom Gehirn zum künstlichen Neuron' },
    { id: 'in', kurz: 'Eingänge', title: 'Zahlen hinein – eine Antwort heraus', show: 1 },
    { id: 'w', kurz: 'Gewichte', title: 'Gewichte: Wie wichtig ist ein Eingang?', show: 2 },
    { id: 'b', kurz: 'Summe & Bias', title: 'Zusammenzählen – und der Bias kommt dazu', show: 3 },
    { id: 'act', kurz: 'Aktivierung', title: 'Die Aktivierung entscheidet: feuern oder nicht', show: 4 },
    { id: 'line', kurz: 'Eine Gerade', title: 'Ein Neuron zieht eine Gerade', show: 4 },
    { id: 'data', kurz: 'Punkte trennen', title: 'Ein Neuron trennt Punkte', show: 4 },
  ];
  let step = 'bio', lastShow = 0;

  const r2 = v => Math.round(v * 100) / 100;
  const num = v => String(r2(v)).replace('.', ',').replace('-', '−');
  const clampK = (k, v) => { const L = LIM[k[0]]; return Math.max(L[0], Math.min(L[1], v)); };
  const getV = k => k === 'b' ? st.b : st[k[0]][+k[1] - 1];
  const setV = (k, v) => { v = r2(clampK(k, v)); if (k === 'b') st.b = v; else st[k[0]][+k[1] - 1] = v; };
  const zOf = () => st.x[0] * st.w[0] + st.x[1] * st.w[1] + st.b;
  const SUB = { x1: 'x<sub>1</sub>', x2: 'x<sub>2</sub>', w1: 'w<sub>1</sub>', w2: 'w<sub>2</sub>', b: 'b' };

  /* Ein Wert mit − und + (Zahl antippen = Regler am Feld) */
  const stepper = (k, cls) => `<span class="nw-val ${cls}" data-v="${k}">
      <button type="button" class="nw-pm" data-d="-1" aria-label="${k} kleiner">−</button>
      <button type="button" class="nw-num" aria-label="${k} einstellen"></button>
      <button type="button" class="nw-pm" data-d="1" aria-label="${k} größer">+</button></span>`;

  /* Die Neuron-Komponente. Koordinaten in einer gedachten Fläche 720 × 330;
     die HTML-Teile liegen in Prozent darüber, Schrift wächst mit (cqw).
     o = { fixed: true } → nur ansehen (Schritt 1), sonst onChange() nach jeder Änderung */
  function makeNeuron(o = {}) {
    const OY = 45, HH = 285;   // sichtbarer Ausschnitt y 45 … 330
    const P = (x, y) => `left:${x / 7.2}%;top:${(y - OY) / HH * 100}%`;
    const root = h(`<div class="nw${o.fixed ? ' is-fixed' : ''}"><div class="nw-in">
      <svg class="nw-wires" viewBox="0 45 720 285">
        <line class="nw-edge" data-k="w" data-e="0" x1="80" y1="85" x2="300" y2="146"/>
        <line class="nw-edge" data-k="w" data-e="1" x1="80" y1="245" x2="300" y2="184"/>
        <line class="nw-bline" data-k="b" x1="355" y1="268" x2="355" y2="232"/>
        <path class="nw-barrow" data-k="b" d="M347 236 L355 226 L363 236 Z"/>
        <line class="nw-owire" data-k="out" x1="500" y1="165" x2="560" y2="165"/>
      </svg>
      <div class="nw-node nw-x" data-k="in" style="${P(80, 85)}"><i class="m">x<sub>1</sub></i>${stepper('x1', 'c-x')}</div>
      <div class="nw-node nw-x" data-k="in" style="${P(80, 245)}"><i class="m">x<sub>2</sub></i>${stepper('x2', 'c-x')}</div>
      <div class="nw-wpill" data-k="w" data-part="2" style="${P(222, 124)}"><i class="m">w<sub>1</sub></i><span class="nw-q">?</span>${stepper('w1', 'c-w')}</div>
      <div class="nw-wpill" data-k="w" data-part="2" style="${P(222, 206)}"><i class="m">w<sub>2</sub></i><span class="nw-q">?</span>${stepper('w2', 'c-w')}</div>
      <div class="nw-body" style="left:${300 / 7.2}%;top:${(105 - OY) / HH * 100}%;width:${200 / 7.2}%;height:${120 / HH * 100}%">
        <div class="nw-half nw-sum" data-k="sum" data-part="3"><b class="nw-sigma">Σ</b><span class="nw-z m"><i>z</i> = <b></b></span><span class="nw-fog">?</span></div>
        <div class="nw-half nw-f" data-k="f" data-part="4"><svg viewBox="0 0 100 60" class="nw-stepfn"><line x1="6" y1="50" x2="94" y2="50" class="ax"/><line x1="50" y1="6" x2="50" y2="56" class="ax"/><path class="st" d="M6 50 H50 V12 H94"/><circle class="dot" r="5.5"/></svg><span class="nw-fz m"><i>f</i>(<i>z</i>)</span><span class="nw-fog">?</span></div>
      </div>
      <div class="nw-bias" data-k="b" data-part="3" style="${P(355, 292)}"><i class="m">b</i><span class="nw-q">?</span>${stepper('b', 'c-b')}</div>
      <div class="nw-out" data-k="out" style="left:${560 / 7.2}%;top:${(125 - OY) / HH * 100}%;width:${124 / 7.2}%;height:${80 / HH * 100}%">
        <span class="nw-rays"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <b class="nw-y"></b><span class="nw-ytxt"></span></div>
      <div class="nw-pop" hidden><label><span class="m"></span><output></output></label><input type="range"></div>
    </div></div>`);
    const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
    const pop = $('.nw-pop'), range = pop.querySelector('input');
    let popK = null;

    function update() {
      $$('.nw-val').forEach(v => { v.querySelector('.nw-num').textContent = num(getV(v.dataset.v)); });
      const show = +root.dataset.show || 4;
      $$('.nw-edge').forEach(e => {
        const w = st.w[+e.dataset.e];
        const known = show >= 2;
        e.setAttribute('stroke-width', known ? Math.max(1.5, Math.min(2 + Math.abs(w) * 4, 14)) : 3);
        e.classList.toggle('is-neg', known && w < 0);
        e.classList.toggle('is-zero', known && Math.abs(w) < 0.005);
      });
      const z = zOf(), fire = z > 0;
      $('.nw-z b').textContent = num(z);
      const zc = Math.max(-4, Math.min(4, z));
      const dot = $('.nw-stepfn .dot');
      dot.setAttribute('cx', 50 + zc * 11); dot.setAttribute('cy', fire ? 12 : 50);
      root.classList.toggle('is-fire', fire);
      $('.nw-y').textContent = fire ? '1' : '0';
      $('.nw-ytxt').textContent = o.outText ? o.outText(fire) : (fire ? 'feuert!' : 'feuert nicht');
      if (popK) { range.value = getV(popK); pop.querySelector('output').textContent = num(getV(popK)); }
    }
    function change(k, v) { setV(k, v); update(); if (o.onChange) o.onChange(k); }

    if (!o.fixed) {
      // − / + (gedrückt halten = weiterzählen)
      $$('.nw-pm').forEach(b => {
        let t1 = 0, t2 = 0;
        const k = b.closest('.nw-val').dataset.v, d = +b.dataset.d;
        const bump = () => change(k, getV(k) + d * LIM[k[0]][2]);
        const stop = () => { clearTimeout(t1); clearInterval(t2); };
        b.addEventListener('pointerdown', e => { e.preventDefault(); bump(); t1 = setTimeout(() => { t2 = setInterval(bump, 110); }, 420); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
        b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(); } });
      });
      // Zahl antippen → Regler direkt am Feld
      $$('.nw-num').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const k = b.closest('.nw-val').dataset.v;
        if (popK === k && !pop.hidden) { closePop(); return; }
        popK = k;
        const L = LIM[k[0]];
        Object.assign(range, { min: L[0], max: L[1], step: L[3] });
        range.className = 'r-' + k[0];
        pop.querySelector('.m').innerHTML = `<i>${SUB[k]}</i> =`;
        pop.hidden = false;
        const rb = b.getBoundingClientRect(), rr = root.querySelector('.nw-in').getBoundingClientRect();
        const cx = rb.left + rb.width / 2 - rr.left;
        pop.style.left = Math.max(0, Math.min(rr.width - pop.offsetWidth, cx - pop.offsetWidth / 2)) + 'px';
        const below = rb.bottom - rr.top + 6;
        pop.style.top = (below + pop.offsetHeight > rr.height + 40 ? rb.top - rr.top - pop.offsetHeight - 6 : below) + 'px';
        $$('.nw-val').forEach(v => v.classList.toggle('is-open', v.dataset.v === k));
        update();
      }));
      range.addEventListener('input', () => change(popK, +range.value));
      const closePop = () => { pop.hidden = true; popK = null; $$('.nw-val').forEach(v => v.classList.remove('is-open')); };
      document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.nw-val')) closePop(); }, true);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
    }
    return { el: root, update, setShow(n) { root.dataset.show = n; update(); } };
  }

  /* Die Rechnung unter dem Neuron: oben die Buchstaben, darunter dieselbe
     Stelle mit Zahlen – jede Größe in ihrer Farbe. Noch nicht Aufgedecktes
     steht grau als „?“ da. */
  function calcHTML(show) {
    const z = zOf(), fire = z > 0;
    const par = v => v < 0 ? `(${num(v)})` : num(v);
    const g = (ok, html) => ok ? html : '<span class="q">?</span>';
    const cell = (cls, top, bot, ok = true) => `<span class="mc ${cls}${ok ? '' : ' is-ghost'}"><span>${top}</span><span>${g(ok, bot)}</span></span>`;
    const op = s => `<span class="mc mo"><span>${s}</span><span>${s}</span></span>`;
    const W = show >= 2, B = show >= 3, F = show >= 4;
    const zRow = [
      cell('c-z', '<i>z</i>', '<i>z</i>'), op('='),
      cell('c-x', '<i>x</i><sub>1</sub>', par(st.x[0])), op('·'), cell('c-w', '<i>w</i><sub>1</sub>', par(st.w[0]), W), op('+'),
      cell('c-x', '<i>x</i><sub>2</sub>', par(st.x[1])), op('·'), cell('c-w', '<i>w</i><sub>2</sub>', par(st.w[1]), W), op('+'),
      cell('c-b', '<i>b</i>', par(st.b), B), op('='), cell('c-z res', '', `<b>${num(z)}</b>`, B),
    ].join('');
    const yRow = [
      cell('c-y', '<i>y</i>', '<i>y</i>'), op('='), cell('c-f', '<i>f</i>(<i>z</i>)', `<i>f</i>(${num(z)})`, F), op('='),
      cell('c-y res', '', `<b>${fire ? 1 : 0}</b>`), F ? `<span class="mwhy">weil <i>z</i> ${fire ? '&gt;' : '≤'} 0</span>` : '',
    ].join('');
    return `<div class="mrow">${zRow}</div><div class="mrow">${yRow}</div>`;
  }

  const TEXT = {
    in: { p: 'Wir schauen uns <b>ein</b> künstliches Neuron an. Noch ist das meiste grau – das decken wir Stück für Stück auf. Klar ist schon: Links gehen zwei <b class="t-x">Eingänge</b> hinein, beliebige Zahlen. Rechts kommt eine Antwort heraus: <b class="t-y">1 = feuert</b> oder <b>0 = feuert nicht</b>.',
      t: 'Ändere die Eingänge mit <b>−</b> und <b>+</b> oder tippe auf die Zahl. Wann feuert das Neuron?' },
    w: { p: 'Jede Leitung hat ein <b class="t-w">Gewicht w</b>. Der Eingang wird damit malgenommen. Großes Gewicht = <b>dicke Leitung</b> = der Eingang ist wichtig. Gewicht 0 = der Eingang ist egal. Negatives Gewicht = <b class="t-neg">rote Leitung</b> = der Eingang bremst.',
      t: 'Stell <i class="m">w</i><sub>2</sub> auf 0. Was bewirkt <i class="m">x</i><sub>2</sub> jetzt noch?' },
    b: { p: 'Im Neuron wird alles <b>zusammengezählt</b> (Σ) – und der <b class="t-b">Bias b</b> kommt noch dazu. Das Ergebnis heißt <i class="m">z</i>. Der Bias ist die Grundeinstellung des Neurons: Ein negativer Bias macht es schwerer zu feuern, ein positiver leichter.',
      t: 'Stell den Bias so ein, dass das Neuron gerade eben noch feuert.' },
    act: { p: 'Zum Schluss entscheidet die <b>Aktivierungsfunktion</b> <i class="m">f</i>: Ist <i class="m">z</i> größer als 0, kommt <b class="t-y">1</b> heraus, sonst <b>0</b>. Unser Neuron nimmt dafür eine <b>Treppe</b> – der Punkt zeigt, wo <i class="m">z</i> gerade liegt. Andere Neuronen haben weichere Kurven: siehe „Alle Neuronen“.',
      t: 'Jetzt ist das Neuron ganz aufgedeckt. Rechne einmal selbst nach – stimmt die Rechnung unten?' },
  };

  /* Ebene für Schritt 6/7: x₁ nach rechts, x₂ nach oben, je −5 … 5.
     Gelb = hier feuert das Neuron. Ziehen: Punkt = Eingänge, Gerade = Bias
     (parallel schieben), runde Griffe = Gewichte (drehen). */
  const R = 5;
  function makePlane(o) {
    const wrap = h('<div class="nw-plane"><canvas></canvas></div>');
    const cv = wrap.querySelector('canvas');
    let G = null, drag = null;
    const css = n => NLTheme.var(n) || '#888';
    const pivotOf = () => { const q = st.w[0] ** 2 + st.w[1] ** 2 || 1; return [-st.b * st.w[0] / q, -st.b * st.w[1] / q]; };
    const handles = P => {
      const L = Math.hypot(...st.w) || 1, d = [-st.w[1] / L, st.w[0] / L];
      return [[P[0] + d[0] * 2.6, P[1] + d[1] * 2.6], [P[0] - d[0] * 2.6, P[1] - d[1] * 2.6]];
    };
    function draw() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const Wc = cv.clientWidth || 360, Hc = cv.clientHeight || 360;
      cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pad = 30, S = Math.min(Wc, Hc) - pad - 10, ox = pad, oy = 8;
      const X = v => ox + (v + R) / (2 * R) * S, Y = v => oy + (R - v) / (2 * R) * S;
      const iX = px => (px - ox) / S * 2 * R - R, iY = py => R - (py - oy) / S * 2 * R;
      G = { X, Y, iX, iY };
      const [w1, w2] = st.w, b = st.b, zf = (a, d) => w1 * a + w2 * d + b;
      // Flächen
      const step = 3;
      for (let px = ox; px < ox + S; px += step) for (let py = oy; py < oy + S; py += step) {
        c.fillStyle = zf(iX(px + step / 2), iY(py + step / 2)) > 0 ? css('gold-dim') : css('surface-2');
        c.fillRect(px, py, step + 0.4, step + 0.4);
      }
      // Raster und Achsen
      c.lineWidth = 1; c.strokeStyle = css('line-soft');
      for (let v = -R; v <= R; v++) {
        c.beginPath(); c.moveTo(X(v), oy); c.lineTo(X(v), oy + S); c.stroke();
        c.beginPath(); c.moveTo(ox, Y(v)); c.lineTo(ox + S, Y(v)); c.stroke();
      }
      c.strokeStyle = css('ink-faint'); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(X(-R), Y(0)); c.lineTo(X(R), Y(0)); c.moveTo(X(0), Y(-R)); c.lineTo(X(0), Y(R)); c.stroke();
      c.fillStyle = css('ink-faint'); c.font = '11px "JetBrains Mono", monospace'; c.textAlign = 'center';
      [-4, -2, 2, 4].forEach(v => { c.fillText(num(v), X(v), Y(0) + 14); });
      c.textAlign = 'right'; [-4, -2, 2, 4].forEach(v => c.fillText(num(v), X(0) - 5, Y(v) + 4));
      c.fillStyle = css('in-ink'); c.font = 'italic 16px "KaTeX Math", serif';
      c.textAlign = 'right'; c.fillText('x₁', ox + S - 4, Y(0) - 8);
      c.textAlign = 'left'; c.fillText('x₂', X(0) + 8, oy + 16);
      // Gerade z = 0
      const pts = [];
      if (Math.abs(w2) > 1e-9) [-R, R].forEach(a => { const d = -(w1 * a + b) / w2; if (Math.abs(d) <= R + 1e-9) pts.push([a, d]); });
      if (Math.abs(w1) > 1e-9) [-R, R].forEach(d => { const a = -(w2 * d + b) / w1; if (Math.abs(a) <= R + 1e-9) pts.push([a, d]); });
      const ink = css('ink');
      if (pts.length >= 2) {
        c.strokeStyle = ink; c.lineWidth = drag && drag.m === 'shift' ? 5 : 3.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(X(pts[0][0]), Y(pts[0][1])); c.lineTo(X(pts[1][0]), Y(pts[1][1])); c.stroke();
        // Pfeil zur Feuer-Seite
        const P = drag && drag.P || pivotOf();
        const inBox = Math.abs(P[0]) <= R && Math.abs(P[1]) <= R;
        const M = inBox ? P : [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        const L = Math.hypot(w1, w2) || 1, nx = w1 / L * 32, ny = -w2 / L * 32;
        const mx = X(M[0]), my = Y(M[1]);
        c.strokeStyle = css('gold'); c.fillStyle = css('gold'); c.lineWidth = 3;
        c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + nx, my + ny); c.stroke();
        const an = Math.atan2(ny, nx);
        c.beginPath(); c.moveTo(mx + nx * 1.3, my + ny * 1.3);
        c.lineTo(mx + nx - 8 * Math.sin(an), my + ny + 8 * Math.cos(an));
        c.lineTo(mx + nx + 8 * Math.sin(an), my + ny - 8 * Math.cos(an)); c.closePath(); c.fill();
        // Dreh-Griffe
        handles(P).forEach(([a, d]) => {
          if (Math.abs(a) > R || Math.abs(d) > R) return;
          c.beginPath(); c.arc(X(a), Y(d), 9, 0, Math.PI * 2);
          c.fillStyle = css('accent'); c.fill(); c.lineWidth = 2.5; c.strokeStyle = css('surface'); c.stroke();
          c.beginPath(); c.arc(X(a), Y(d), 4.5, 0.4, Math.PI * 1.6); c.strokeStyle = css('on-accent'); c.lineWidth = 1.6; c.stroke();
        });
      }
      // Datenpunkte
      (o.points ? o.points() : []).forEach(p => {
        const ok = (zf(p.x[0], p.x[1]) > 0 ? 1 : 0) === p.soll;
        c.beginPath(); c.arc(X(p.x[0]), Y(p.x[1]), 8, 0, Math.PI * 2);
        c.fillStyle = p.soll ? css('gold') : css('surface'); c.fill();
        c.lineWidth = 2.5; c.strokeStyle = p.soll ? css('gold') : css('ink-faint'); c.stroke();
        if (!ok) { c.beginPath(); c.arc(X(p.x[0]), Y(p.x[1]), 12.5, 0, Math.PI * 2); c.strokeStyle = css('neg'); c.lineWidth = 2; c.stroke(); }
      });
      // Eingänge als Punkt
      const [a, d] = st.x;
      c.strokeStyle = css('in'); c.lineWidth = 3;
      c.beginPath(); c.arc(X(a), Y(d), 11, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(X(a) - 16, Y(d)); c.lineTo(X(a) - 6, Y(d)); c.moveTo(X(a) + 6, Y(d)); c.lineTo(X(a) + 16, Y(d));
      c.moveTo(X(a), Y(d) - 16); c.lineTo(X(a), Y(d) - 6); c.moveTo(X(a), Y(d) + 6); c.lineTo(X(a), Y(d) + 16); c.stroke();
      c.fillStyle = css('in-ink'); c.font = '600 12px "JetBrains Mono", monospace';
      c.textAlign = X(a) > ox + S - 90 ? 'right' : 'left';
      c.fillText(`(${num(a)} | ${num(d)})`, X(a) + (c.textAlign === 'left' ? 15 : -15), Y(d) - 14);
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const near = (px, py, a, d, r) => Math.hypot(G.X(a) - px, G.Y(d) - py) < r;
    const lineDist = (px, py) => { const L = Math.hypot(...st.w) || 1; return Math.abs(st.w[0] * G.iX(px) + st.w[1] * G.iY(py) + st.b) / L / (2 * R) * (cv.clientHeight - 18); };
    function hover(px, py) {
      if (!G) return '';
      if (near(px, py, st.x[0], st.x[1], 20)) return 'move';
      if (handles(pivotOf()).some(([a, d]) => near(px, py, a, d, 18))) return 'grab';
      if (lineDist(px, py) < 12) return 'ns-resize';
      return o.points ? 'pointer' : 'crosshair';
    }
    cv.addEventListener('pointermove', e => {
      const [px, py] = pos(e);
      if (!drag) { cv.style.cursor = hover(px, py); return; }
      const a = G.iX(px), d = G.iY(py);
      if (drag.m === 'pt') st.x = [clampK('x', Math.round(a * 2) / 2), clampK('x', Math.round(d * 2) / 2)];
      else if (drag.m === 'shift') st.b = r2(clampK('b', drag.b0 - st.w[0] * (a - drag.a0) - st.w[1] * (d - drag.d0)));
      else if (drag.m === 'rot') {
        const vx = (a - drag.P[0]) * drag.sg, vy = (d - drag.P[1]) * drag.sg, L = Math.hypot(vx, vy);
        if (L < 0.3) return;
        st.w = [r2(clampK('w', vy / L * drag.len)), r2(clampK('w', -vx / L * drag.len))];
        st.b = r2(clampK('b', -(st.w[0] * drag.P[0] + st.w[1] * drag.P[1])));
      }
      o.onChange();
    });
    cv.addEventListener('pointerdown', e => {
      if (!G) return;
      const [px, py] = pos(e);
      const a = G.iX(px), d = G.iY(py);
      const P = pivotOf(), hs = handles(P), hi = hs.findIndex(([ha, hd]) => near(px, py, ha, hd, 18));
      if (near(px, py, st.x[0], st.x[1], 20)) drag = { m: 'pt' };
      else if (hi >= 0) drag = { m: 'rot', P, sg: hi ? -1 : 1, len: Math.max(0.2, Math.hypot(...st.w)) };
      else if (lineDist(px, py) < 12) drag = { m: 'shift', b0: st.b, a0: a, d0: d };
      else if (o.points) {
        let best = null, bd = 22;
        o.points().forEach(p => { const dd = Math.hypot(G.X(p.x[0]) - px, G.Y(p.x[1]) - py); if (dd < bd) { bd = dd; best = p; } });
        if (best) { st.x = best.x.slice(); o.onChange(); }
        return;
      } else { drag = { m: 'pt' }; st.x = [clampK('x', Math.round(a * 2) / 2), clampK('x', Math.round(d * 2) / 2)]; o.onChange(); }
      cv.setPointerCapture(e.pointerId);
      if (drag.m === 'rot') cv.style.cursor = 'grabbing';
    });
    const end = () => { if (drag) { drag = null; draw(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    new ResizeObserver(() => { if (cv.isConnected) draw(); }).observe(cv);
    document.addEventListener('nl:theme-redraw', () => { if (cv.isConnected) draw(); });
    return { el: wrap, draw };
  }

  /* Punkte für Schritt 7: zwei gleichmäßige Häufchen, mit einer Geraden trennbar.
     Gold = hier soll das Neuron feuern. Erste Runde fest, „Neue Punkte“ würfelt. */
  const PTS0 = [[2, -3, 1], [3, -2, 1], [3.5, -3.5, 1], [2, -1.5, 1], [4, -2.5, 1],
    [-2, 2, 0], [-3, 3, 0], [-1.5, 3.5, 0], [-3.5, 1.5, 0], [-1, 2.5, 0]];
  let pts = PTS0.map(p => ({ x: [p[0], p[1]], soll: p[2] }));
  function newPoints() {
    for (;;) {
      const t = Math.random() * Math.PI * 2, n = [Math.cos(t), Math.sin(t)];
      const m = [Math.random() * 2 - 1, Math.random() * 2 - 1];
      const out = [], seen = new Set();
      for (let g = 0; g < 2 && out.length < 20; g++) {
        const s = g ? -1 : 1, c = [m[0] + n[0] * 2.4 * s, m[1] + n[1] * 2.4 * s];
        let tries = 0, k = 0;
        while (k < 5 && tries++ < 200) {
          const r = Math.sqrt(Math.random()) * 1.6, a = Math.random() * Math.PI * 2;
          const p = [Math.round((c[0] + r * Math.cos(a)) * 2) / 2, Math.round((c[1] + r * Math.sin(a)) * 2) / 2];
          const side = (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
          if (Math.abs(p[0]) > 4.5 || Math.abs(p[1]) > 4.5 || side * s < 0.7 || seen.has(p + '')) continue;
          seen.add(p + ''); out.push({ x: p, soll: g ? 0 : 1 }); k++;
        }
      }
      const right = out.filter(p => ((st.w[0] * p.x[0] + st.w[1] * p.x[1] + st.b > 0) ? 1 : 0) === p.soll).length;
      if (out.length === 10 && right < 9) return out;
    }
  }

  const PAIRS = [
    { k: 'in', bio: 'Dendriten', kn: 'Eingänge x', t: 'Die Dendriten nehmen Signale anderer Zellen auf. Beim künstlichen Neuron kommen hier Zahlen herein: x₁, x₂ …' },
    { k: 'w', bio: 'Synapsen', kn: 'Gewichte w', t: 'Manche Synapsen leiten stark, manche schwach, manche hemmen. Das Gewicht sagt, wie wichtig ein Eingang ist – dicke Leitung = wichtig, rot = bremst.' },
    { k: 'sum', bio: 'Zellkörper', kn: 'Summe Σ', t: 'Im Zellkörper laufen alle Signale zusammen. Das Neuron zählt alle Eingänge × Gewichte zusammen.' },
    { k: 'b', bio: 'Reizschwelle', kn: 'Bias b', t: 'Manche Nervenzellen feuern leicht, manche brauchen viel Reiz. Beim künstlichen Neuron stellt das der Bias ein – er wird zur Summe dazugezählt.' },
    { k: 'f', bio: 'Axonhügel', kn: 'Aktivierung f', t: 'Am Axonhügel wird entschieden: feuern oder nicht. Beim künstlichen Neuron macht das die Aktivierungsfunktion.' },
    { k: 'out', bio: 'Axon', kn: 'Ausgabe y', t: 'Das Axon leitet das Signal an die nächsten Zellen weiter. Die Ausgabe wird zum Eingang der nächsten Neuronen.' },
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


  /* Schritt 1: Nervenzelle ↔ dasselbe Neuron, ganz aufgedeckt, nur ansehen */
  function buildBio(card) {
    card.appendChild(h(`<p class="nn-lead-p">Dein Gehirn hat rund <b>86 Milliarden Nervenzellen</b>. Jede bekommt Signale von anderen Zellen, „entscheidet“, ob sie selbst <b>feuert</b>, und gibt ihr Signal weiter. Ein <b>künstliches Neuron</b> ist ein stark vereinfachtes Rechenmodell davon. <b>Tippe auf ein Teil</b> – links oder rechts.</p>`));
    const grid = h('<div class="nn-two"><div class="nn-col-bio"></div><div class="nn-col-kn"></div></div>');
    const bio = bioSVG();
    const N = makeNeuron({ fixed: true });
    N.setShow(4);
    grid.children[0].appendChild(bio);
    grid.children[1].appendChild(N.el);
    card.appendChild(grid);
    const chips = h('<div class="nn-pairs"></div>');
    const info = h('<p class="nn-pair-info">Noch nichts gewählt.</p>');
    const pick = k => {
      bio.dataset.hl = k; N.el.dataset.hl = k;
      chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
      const p = PAIRS.find(x => x.k === k);
      info.innerHTML = `<b>${p.bio} → ${p.kn}:</b> ${p.t}`;
    };
    PAIRS.forEach(p => {
      const b = h(`<button type="button" class="nn-pair" data-k="${p.k}"><span>${p.bio}</span><i>→</i><b>${p.kn}</b></button>`);
      b.addEventListener('click', () => pick(p.k));
      chips.appendChild(b);
    });
    [bio, N.el].forEach(x => x.addEventListener('click', e => { const t = e.target.closest('[data-k]'); if (t) pick(t.dataset.k); }));
    card.append(chips, info);
  }

  /* Schritte 2–5: Neuron in der Mitte, Rechnung darunter */
  function buildReveal(card, S) {
    const T = TEXT[S.id];
    card.appendChild(h(`<p class="nn-lead-p">${T.p}</p>`));
    const calc = h('<div class="nw-calc m"></div>');
    const N = makeNeuron({ onChange: () => { calc.innerHTML = calcHTML(S.show); } });
    // Vom letzten Stand aus aufdecken, damit man sieht, was neu dazukommt
    N.setShow(Math.min(lastShow || S.show, S.show));
    requestAnimationFrame(() => requestAnimationFrame(() => N.setShow(S.show)));
    lastShow = S.show;
    calc.innerHTML = calcHTML(S.show);
    card.append(h('<div class="nw-stage"></div>'), calc, h(`<p class="nn-try"><b>Probier:</b> ${T.t}</p>`));
    card.querySelector('.nw-stage').appendChild(N.el);
  }

  /* Schritte 6–7: Neuron links, Ebene rechts – beides verändert dasselbe */
  function buildPlane(card, S) {
    const isData = S.id === 'data';
    card.appendChild(h(isData
      ? '<p class="nn-lead-p">Die <b class="t-y">goldenen Punkte</b> sollen das Neuron zum Feuern bringen, die <b>weißen</b> nicht. Stell das Neuron so ein, dass die Gerade die beiden Gruppen trennt – am Neuron mit − und + oder direkt auf dem Feld. <b>Tippe einen Punkt an</b>: Dann geht er als Eingabe ins Neuron.</p>'
      : '<p class="nn-lead-p">Mit zwei Eingängen ist jede Eingabe ein <b class="t-x">Punkt</b> (<i class="m">x</i><sub>1</sub> | <i class="m">x</i><sub>2</sub>). Für jeden Punkt kann man fragen: Feuert das Neuron hier? <b class="t-y">Gelb</b> = ja. Die Grenze ist immer eine <b>Gerade</b> – genau dort ist <i class="m">z</i> = 0. Die <b class="t-w">Gewichte drehen</b> die Gerade, der <b class="t-b">Bias schiebt</b> sie.</p>'));
    const calc = h('<div class="nw-calc m"></div>');
    const msg = h('<p class="nn-task-msg"></p>');
    let N = null, PL = null;
    const sync = () => {
      N.update(); PL.draw(); calc.innerHTML = calcHTML(4);
      if (!isData) return;
      const ok = pts.filter(p => ((st.w[0] * p.x[0] + st.w[1] * p.x[1] + st.b > 0) ? 1 : 0) === p.soll).length;
      msg.className = 'nn-task-msg' + (ok === pts.length ? ' ok' : '');
      msg.innerHTML = ok === pts.length ? `<b>${ok} von ${pts.length} richtig</b> – eine Gerade trennt die beiden Gruppen.`
        : `<b>${ok} von ${pts.length} richtig.</b> Rot umkreiste Punkte liegen auf der falschen Seite.`;
    };
    N = makeNeuron({ onChange: () => sync() });
    N.setShow(4); lastShow = 4;
    PL = makePlane({ onChange: () => sync(), points: isData ? () => pts : null });
    const grid = h('<div class="nw-split"><div class="nw-left"></div><div class="nw-right"></div></div>');
    grid.children[0].append(N.el, calc);
    grid.children[1].append(PL.el, h(`<p class="nw-legend"><span><i class="lg-pt"></i>Punkt ziehen = Eingänge</span><span><i class="lg-line"></i>Gerade schieben = Bias</span><span><i class="lg-rot"></i>Griff drehen = Gewichte</span></p>`));
    if (isData) {
      const again = h('<button type="button" class="nn-btn">Neue Punkte</button>');
      again.addEventListener('click', () => { pts = newPoints(); st.x = pts[0].x.slice(); sync(); });
      const row = h('<div class="nw-taskrow"></div>');
      row.append(msg, again);
      grid.children[1].appendChild(row);
    }
    card.append(grid);
    if (isData) card.appendChild(h(`<div class="nn-summary"><b>Das Wichtigste</b><ul>
      <li>Ein Neuron nimmt jeden <b>Eingang</b> mal sein <b>Gewicht</b>, zählt alles zusammen und den <b>Bias</b> dazu: <i class="m">z</i>.</li>
      <li>Die <b>Aktivierung</b> entscheidet: Ist <i class="m">z</i> größer als 0, feuert das Neuron.</li>
      <li>Mit zwei Eingängen zieht ein Neuron <b>eine Gerade</b> – und trennt so Punkte in zwei Gruppen.</li>
      <li>Mehr als eine Gerade kann ein einzelnes Neuron nicht. Was mehrere Neuronen zusammen können, probierst du in <b>„Netze bauen“</b>.</li></ul></div>`));
    else card.appendChild(h('<p class="nn-try"><b>Probier:</b> Stell <i class="m">w</i><sub>1</sub> auf 0 – wie liegt die Gerade jetzt? Und was passiert, wenn du nur den Bias änderst?</p>'));
    sync();
    requestAnimationFrame(sync);
  }

  function renderWie(page) {
    const nav = h('<nav class="nn-steps"></nav>');
    STEPS.forEach((s, i) => {
      const b = h(`<button type="button" class="nn-step${s.id === step ? ' on' : ''}" data-step="${s.id}"><i>${i + 1}</i>${s.kurz}</button>`);
      b.addEventListener('click', () => { step = s.id; again(); });
      nav.appendChild(b);
    });
    const i = STEPS.findIndex(s => s.id === step), S = STEPS[i];
    const card = h(`<section class="nn-card nn-stepcard"><p class="nn-kicker">Schritt ${i + 1} von ${STEPS.length}</p><h2>${S.title}</h2></section>`);
    if (step === 'bio') buildBio(card);
    else if (step === 'line' || step === 'data') buildPlane(card, S);
    else buildReveal(card, S);
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
