/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich „Wie funktioniert ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Zwei Kacheln (= zwei Reiter, die Lehrkraft gibt jede einzeln frei):
     n-wie    So rechnet ein Neuron: Bild (neuron.png), ein Neuron zum
              Ausprobieren, EINE Impulsaufgabe (UND · ODER · XOR)
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
     o = { type, x:[x1,x2], w:[w1,w2], b, compact } → SVG */
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
        s.appendChild(el('line', { x1: 56, y1: iy, x2: ox, y2: cy + (i ? 14 : -14), stroke: act.color, 'stroke-width': sw, 'stroke-opacity': Math.abs(w) < 0.01 ? 0.3 : 0.75, 'stroke-dasharray': Math.abs(w) < 0.01 ? '4 3' : 'none' }));
        s.appendChild(el('circle', { cx: 34, cy: iy, r: 22, fill: '#fff', stroke: '#4caf8a', 'stroke-width': 2.5 }));
        s.appendChild(el('text', { x: 34, y: iy + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#2e7d5e' }, `${de(o.x[i])}`));
        s.appendChild(el('text', { x: 34, y: iy + (i ? 38 : -28), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#64748b' }, `x${i + 1}`));
        const mx = (56 + ox) / 2, my = (iy + cy + (i ? 14 : -14)) / 2;
        s.appendChild(el('rect', { x: mx - 26, y: my - 9, width: 52, height: 17, rx: 4, fill: '#fff', 'fill-opacity': 0.92 }));
        s.appendChild(el('text', { x: mx, y: my + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, 'font-family': 'monospace', fill: act.color }, `w${i + 1}=${de(w)}`));
      });
    }
    s.appendChild(el('rect', { x: ox, y: NBY, width: NBW, height: NBH, rx: 12, class: 'neuron-body' }));
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
    s.appendChild(el('line', { x1: bx, y1: by1, x2: bx, y2: by0 + 8, class: 'bias-line' }));
    s.appendChild(el('polygon', { points: `${bx},${by0} ${bx - 4},${by0 + 8} ${bx + 4},${by0 + 8}`, fill: '#888' }));
    s.appendChild(el('text', { x: bx, y: by1 + 14, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#64748b' }, withIn ? `b = ${de(o.b)}` : 'b'));
    // Ausgabe
    const ol = ox + NBW;
    s.appendChild(el('line', { x1: ol, y1: cy, x2: ol + 16, y2: cy, stroke: '#94a3b8', 'stroke-width': 1.5 }));
    s.appendChild(el('rect', { x: ol + 18, y: cy - 13, width: withIn ? 70 : 56, height: 26, rx: 4, fill: withIn ? '#fffbeb' : '#f8fafc', stroke: withIn ? '#f59e0b' : '#d1d5db', 'stroke-width': 1.5 }));
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
      const v = act.fn(zMark);
      s.appendChild(el('line', { x1: px(zMark), y1: py(0), x2: px(zMark), y2: py(Math.max(yr[0], Math.min(yr[1], v))), stroke: '#334155', 'stroke-dasharray': '3 3' }));
      s.appendChild(el('circle', { cx: px(zMark), cy: py(Math.max(yr[0], Math.min(yr[1], v))), r: 5, fill: '#fff', stroke: '#334155', 'stroke-width': 2 }));
    }
    return s;
  }

  function slider(label, min, max, step, val, on, cls = '') {
    const row = h(`<label class="nn-slider ${cls}"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output>${de(val)}</output></label>`);
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = de(+inp.value); on(+inp.value); });
    return row;
  }

  /* ── Reiter 1: So rechnet ein Neuron ───────────────────── */
  const st = { type: 'perceptron', x: [1, 0], w: [1, 1], b: 0, task: 'und' };
  const TASKS = {
    und: { name: 'UND', soll: [0, 0, 0, 1], text: 'nur dann 1 ausgibt, wenn x₁ = 1 <b>und</b> x₂ = 1 ist' },
    oder: { name: 'ODER', soll: [0, 1, 1, 1], text: '1 ausgibt, sobald <b>mindestens einer</b> der Eingänge 1 ist' },
    xor: { name: 'XOR', soll: [0, 1, 1, 0], text: '1 ausgibt, wenn <b>genau einer</b> der Eingänge 1 ist' },
  };

  function renderWie(page) {
    page.appendChild(h(`<section class="nn-card nn-intro">
      <div class="nn-intro-img"><img src="neuron.png" alt="Ein künstliches Neuron: Eingaben x mit Gewichten w, Summe plus Bias, Aktivierungsfunktion f, Ausgabe y′"></div>
      <div class="nn-intro-text">
        <h2>So rechnet ein Neuron</h2>
        <p>Eine Nervenzelle im Gehirn bekommt Signale von anderen Zellen. Kommt genug zusammen, „feuert“ sie und gibt selbst ein Signal weiter. Ein künstliches Neuron macht das mit Zahlen:</p>
        <ol>
          <li><b>Eingaben</b> x₁, x₂ … kommen herein.</li>
          <li>Jede wird mit ihrem <b>Gewicht</b> w malgenommen – das Gewicht sagt, wie wichtig die Eingabe ist (negativ = bremst).</li>
          <li>Alles wird zusammengezählt, dazu kommt der <b>Bias</b> b: <span class="nn-f">z = w₁·x₁ + w₂·x₂ + b</span></li>
          <li>Die <b>Aktivierungsfunktion</b> f macht aus z die <b>Ausgabe</b> y′ = f(z).</li>
        </ol>
      </div>
    </section>`));

    const play = h(`<section class="nn-card nn-play"><h2>Probier es aus</h2><div class="nn-play-grid"><div class="nn-play-pic"></div><div class="nn-play-ctl"></div></div><div class="nn-calc"></div></section>`);
    const pic = play.querySelector('.nn-play-pic'), ctl = play.querySelector('.nn-play-ctl'), calc = play.querySelector('.nn-calc');
    const types = h('<div class="nn-types"></div>');
    ORDER.forEach(k => {
      const b = h(`<button type="button" class="popup-type-btn${st.type === k ? ' selected' : ''}" style="--btn-color:${activations[k].color}">${activations[k].fullName}</button>`);
      b.addEventListener('click', () => { st.type = k; types.querySelectorAll('button').forEach(x => x.classList.toggle('selected', x === b)); upd(); });
      types.appendChild(b);
    });
    ctl.appendChild(types);
    const xs = h('<div class="nn-xs"></div>');
    [0, 1].forEach(i => {
      const t = h(`<div class="nn-x"><span>x${i + 1}</span><button type="button" data-v="0">0</button><button type="button" data-v="1">1</button></div>`);
      t.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { st.x[i] = +b.dataset.v; upd(); }));
      xs.appendChild(t);
    });
    ctl.appendChild(xs);
    ctl.appendChild(slider('w₁', -3, 3, 0.1, st.w[0], v => { st.w[0] = v; upd(); }));
    ctl.appendChild(slider('w₂', -3, 3, 0.1, st.w[1], v => { st.w[1] = v; upd(); }));
    ctl.appendChild(slider('b', -3, 3, 0.1, st.b, v => { st.b = v; upd(); }, 'nn-slider-b'));
    page.appendChild(play);

    const task = h(`<section class="nn-card nn-task"><h2>Impulsaufgabe: Ein Neuron als Türsteher</h2>
      <div class="nn-task-pick"></div><p class="nn-task-text"></p>
      <table class="nn-truth"><thead><tr><th>x₁</th><th>x₂</th><th>z</th><th>y′</th><th>soll</th><th></th></tr></thead><tbody></tbody></table>
      <p class="nn-task-msg"></p></section>`);
    const pick = task.querySelector('.nn-task-pick');
    Object.entries(TASKS).forEach(([k, t]) => {
      const b = h(`<button type="button" class="nn-pill${st.task === k ? ' on' : ''}">${t.name}</button>`);
      b.addEventListener('click', () => { st.task = k; pick.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); upd(); });
      pick.appendChild(b);
    });
    page.appendChild(task);

    function upd() {
      const act = activations[st.type];
      pic.innerHTML = '';
      pic.appendChild(neuronSVG({ type: st.type, x: st.x, w: st.w, b: st.b }));
      xs.querySelectorAll('.nn-x').forEach((t, i) => t.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === st.x[i])));
      const z = st.x[0] * st.w[0] + st.x[1] * st.w[1] + st.b;
      calc.innerHTML = `<div>z = w₁·x₁ + w₂·x₂ + b = ${de(st.w[0])}·${de(st.x[0])} + ${de(st.w[1])}·${de(st.x[1])} + (${de(st.b)}) = <b>${de(z)}</b></div>
        <div>y′ = ${act.apply(z).replace(/\./g, ',')}</div>`;
      // Wahrheitstafel: zählt als 1, wenn y′ ≥ 0,5
      const T = TASKS[st.task];
      task.querySelector('.nn-task-text').innerHTML = `Stelle w₁, w₂ und b oben so ein, dass das Neuron ${T.text}.`;
      let all = true;
      task.querySelector('tbody').innerHTML = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b], r) => {
        const zz = a * st.w[0] + b * st.w[1] + st.b, yy = act.fn(zz);
        const ok = (yy >= 0.5 ? 1 : 0) === T.soll[r];
        all = all && ok;
        return `<tr class="${ok ? 'ok' : 'bad'}"><td>${a}</td><td>${b}</td><td>${de(zz)}</td><td>${de(yy)}</td><td>${T.soll[r]}</td><td>${ok ? '✓' : '✗'}</td></tr>`;
      }).join('');
      const msg = task.querySelector('.nn-task-msg');
      msg.className = 'nn-task-msg' + (all ? ' ok' : '');
      msg.innerHTML = all
        ? (st.task === 'xor' ? '✓ Wirklich? Dann schau genau hin …' : `✓ Geschafft! Weiter: Klappt das auch für ${st.task === 'und' ? 'ODER' : 'XOR'}?`)
        : (st.task === 'xor'
          ? '<b>Denkanstoß:</b> Findest du Werte? Zeichne die vier Fälle als Punkte auf ein Blatt: Kannst du die 1en mit <i>einer</i> Geraden von den 0en trennen? Was bräuchte man dafür?'
          : 'Tipp: y′ zählt als 1, wenn es mindestens 0,5 ist. Ändere zuerst den Bias.');
    }
    upd();
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
