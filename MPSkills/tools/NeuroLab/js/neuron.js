/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich 1 „Das Neuron“: sechs Stationen
   ══════════════════════════════════════════════════════════════
   Jede Station: kurzer Text, ein Ding zum Ausprobieren, eine kleine
   Aufgabe, die sich selbst prüft (✓ → app.markDone). Die Lehrkraft gibt
   jede Station einzeln frei (ids n1 … n6 in data.parts).

   NLNeuron.render(nav, card, api)
     api = { id, usable(id), isDone(id), markDone(id), go(id), toArea(id) }
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz;
  const F = window.NLFeld;
  const fmt = F.fmt;
  const NS = 'http://www.w3.org/2000/svg';

  const STATIONS = [
    { id: 'n1', title: 'Vom Gehirn zum Neuron', kurz: 'Nervenzelle' },
    { id: 'n2', title: 'Eingänge und Gewichte', kurz: 'Gewichte' },
    { id: 'n3', title: 'Summe und Bias', kurz: 'Summe & Bias' },
    { id: 'n4', title: 'Die Aktivierungsfunktion', kurz: 'Aktivierung' },
    { id: 'n5', title: 'Ein Neuron zieht eine Gerade', kurz: 'Gerade' },
    { id: 'n6', title: 'Vom Neuron zum Netz', kurz: 'Netz' }
  ];

  function h(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function slider(label, min, max, step, val, on) {
    const row = h(`<div class="slider"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output>${fmt(val, 2)}</output></div>`);
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = fmt(+inp.value, 2); on(+inp.value); });
    return row;
  }
  function toggle01(val, on) {
    const t = h('<span class="toggle01"><button type="button">0</button><button type="button">1</button></span>');
    const [b0, b1] = t.querySelectorAll('button');
    const set = v => { b0.classList.toggle('on', v === 0); b1.classList.toggle('on', v === 1); };
    set(val);
    b0.onclick = () => { set(0); on(0); }; b1.onclick = () => { set(1); on(1); };
    return t;
  }

  /* Mini-Neuron als SVG: zwei Eingänge, Gewichte, Σ, f, Ausgabe */
  function miniNeuron(o) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 460 210');
    const x = o.x, w = o.w;
    const z = x[0] * w[0] + x[1] * w[1] + (o.b || 0);
    const act = N.ACTS[o.act || 'step'];
    const y = act.f(z);
    const col = v => (v >= 0 ? 'var(--pos)' : 'var(--neg)');
    s.innerHTML = `
      <path d="M92 55 C160 55 160 92 220 96" fill="none" stroke="${col(w[0])}" stroke-width="${1.5 + Math.min(4, Math.abs(w[0])) * 1.6}"/>
      <path d="M92 155 C160 155 160 120 220 116" fill="none" stroke="${col(w[1])}" stroke-width="${1.5 + Math.min(4, Math.abs(w[1])) * 1.6}"/>
      <rect x="128" y="38" width="62" height="22" rx="6" fill="var(--surface)" stroke="var(--line)"/>
      <text x="159" y="54" text-anchor="middle" font-size="13" font-weight="700" fill="${col(w[0])}">w₁ = ${fmt(w[0], 1)}</text>
      <rect x="128" y="150" width="62" height="22" rx="6" fill="var(--surface)" stroke="var(--line)"/>
      <text x="159" y="166" text-anchor="middle" font-size="13" font-weight="700" fill="${col(w[1])}">w₂ = ${fmt(w[1], 1)}</text>
      <rect x="20" y="33" width="72" height="44" rx="22" fill="var(--surface)" stroke="#e3a008" stroke-width="2"/>
      <text x="56" y="61" text-anchor="middle" font-size="15" font-weight="700">x₁ = ${x[0]}</text>
      <rect x="20" y="133" width="72" height="44" rx="22" fill="var(--surface)" stroke="#e3a008" stroke-width="2"/>
      <text x="56" y="161" text-anchor="middle" font-size="15" font-weight="700">x₂ = ${x[1]}</text>
      <rect x="220" y="70" width="140" height="70" rx="16" fill="var(--surface)" stroke="var(--act-${o.act || 'step'})" stroke-width="2.6"/>
      <line x1="290" y1="76" x2="290" y2="134" stroke="var(--line)" stroke-width="1.5"/>
      <text x="255" y="102" text-anchor="middle" font-size="22">Σ</text>
      <text x="255" y="126" text-anchor="middle" font-size="12" font-family="JetBrains Mono">z=${fmt(z, 2)}</text>
      <path d="${F.ACT_PATH[o.act || 'step']}" transform="translate(305,84)" fill="none" stroke="var(--act-${o.act || 'step'})" stroke-width="2.6"/>
      <text x="325" y="126" text-anchor="middle" font-size="12" font-family="JetBrains Mono">y=${fmt(y, 2)}</text>
      ${o.b != null ? `<line x1="255" y1="140" x2="255" y2="160" stroke="var(--ink-faint)" stroke-width="1.5"/><text x="255" y="176" text-anchor="middle" font-size="13" font-family="JetBrains Mono" font-weight="600">b = ${fmt(o.b, 1)}</text>` : ''}
      <line x1="360" y1="105" x2="400" y2="105" stroke="var(--wire)" stroke-width="3"/>
      <circle cx="420" cy="105" r="20" fill="${y >= 0.5 ? 'var(--accent)' : 'var(--paper-2)'}" stroke="var(--wire)" stroke-width="2"/>
      <text x="420" y="110" text-anchor="middle" font-size="14" font-weight="700">${fmt(y, 1)}</text>`;
    return { svg: s, z, y };
  }

  function taskBox(text, ok) {
    return h(`<div class="st-task${ok ? ' ok' : ''}"><span class="ico">${ok ? '✓' : '✎'}</span><div><b>Aufgabe:</b> ${text}</div></div>`);
  }

  /* ── Stationen ──────────────────────────────────────────── */
  const BUILD = {
    n1(card, api) {
      card.append(h(`<p class="st-text">Dein Gehirn besteht aus rund <b>86 Milliarden Nervenzellen</b>. Jede empfängt Signale von anderen Zellen, „entscheidet“, ob sie selbst feuert, und gibt ihr Signal weiter. Ein <b>künstliches Neuron</b> ist ein stark vereinfachtes Rechenmodell davon.</p>`));
      const PAIRS = [
        { bio: 'Dendriten', bioT: 'nehmen Signale anderer Zellen auf', kn: 'Eingänge x', knT: 'Zahlen, die ins Neuron gehen', k: 'in' },
        { bio: 'Synapsen', bioT: 'mal stärker, mal schwächer', kn: 'Gewichte w', knT: 'wie wichtig ein Eingang ist', k: 'w' },
        { bio: 'Zellkörper', bioT: 'sammelt alle Signale', kn: 'Summe Σ', knT: 'alle Eingänge × Gewichte addiert', k: 'sum' },
        { bio: 'Schwelle', bioT: 'feuert erst ab genug Reiz', kn: 'Aktivierung f', knT: 'macht aus der Summe die Ausgabe', k: 'f' },
        { bio: 'Axon', bioT: 'leitet das Signal weiter', kn: 'Ausgabe y', knT: 'geht zum nächsten Neuron', k: 'out' }
      ];
      const seen = new Set();
      const grid = h('<div class="st-grid"></div>');
      const left = h(`<div class="mini"><svg viewBox="0 0 420 200">
        <g stroke="var(--ink-soft)" stroke-width="3" fill="none" stroke-linecap="round">
          <path data-k="in" d="M40 40 L110 85 M30 100 L105 100 M45 165 L110 115 M60 20 L80 55 M20 140 L60 150"/>
          <circle data-k="w" cx="40" cy="40" r="7" fill="var(--paper-2)"/><circle data-k="w" cx="30" cy="100" r="7" fill="var(--paper-2)"/><circle data-k="w" cx="45" cy="165" r="7" fill="var(--paper-2)"/>
          <path data-k="out" d="M170 100 C230 100 260 100 330 100 M330 100 L360 80 M330 100 L365 100 M330 100 L360 122"/>
          <path data-k="f" d="M170 80 L170 120" stroke-width="6"/>
        </g>
        <ellipse data-k="sum" cx="138" cy="100" rx="34" ry="30" fill="var(--accent-dim)" stroke="var(--ink-soft)" stroke-width="3"/>
        <circle cx="138" cy="100" r="9" fill="var(--ink-soft)"/>
        <text x="210" y="190" text-anchor="middle" font-size="13" fill="var(--ink-faint)">Nervenzelle (vereinfacht)</text>
      </svg></div>`);
      const right = h('<div><p class="muted">Tippe auf ein Teil der Nervenzelle (links) — rechts siehst du, was ihm im künstlichen Neuron entspricht.</p><div class="parts"></div></div>');
      const parts = right.querySelector('.parts');
      const draw = (sel) => {
        parts.innerHTML = '';
        PAIRS.forEach(p => {
          const b = h(`<button class="part${sel === p.k ? ' on' : ''}" type="button"><b>${p.bio} → ${p.kn}</b><small>${p.bioT} · ${p.knT}</small></button>`);
          b.onclick = () => pick(p.k);
          parts.append(b);
        });
        left.querySelectorAll('[data-k]').forEach(e => { e.style.stroke = e.dataset.k === sel ? 'var(--accent)' : ''; });
      };
      const pick = k => { seen.add(k); draw(k); if (seen.size === PAIRS.length && !api.isDone('n1')) { api.markDone('n1'); refreshTask(); } };
      left.querySelectorAll('[data-k]').forEach(e => { e.style.cursor = 'pointer'; e.addEventListener('click', () => pick(e.dataset.k)); });
      draw(null);
      grid.append(left, right);
      card.append(grid);
      const tb = () => taskBox('Finde zu allen fünf Teilen der Nervenzelle das Gegenstück im künstlichen Neuron.', api.isDone('n1'));
      let task = tb(); card.append(task);
      const refreshTask = () => { const t = tb(); task.replaceWith(t); task = t; };
    },

    n2(card, api) {
      card.append(h(`<p class="st-text">Jeder Eingang <b>x</b> wird mit seinem <b>Gewicht w</b> malgenommen. Ein großes Gewicht heißt: Dieser Eingang ist <b>wichtig</b>. Ein negatives Gewicht <b>hemmt</b>. Ein Gewicht von 0 heißt: Der Eingang ist <b>egal</b>.</p>`));
      const st = { x: [1, 1], w: [1, 1] };
      const grid = h('<div class="st-grid"></div>');
      const pic = h('<div class="mini"></div>');
      const ctl = h('<div></div>');
      const calc = h('<div class="calc"></div>');
      const draw = () => {
        const m = miniNeuron({ x: st.x, w: st.w, act: 'linear' });
        pic.innerHTML = ''; pic.append(m.svg);
        calc.innerHTML = `x₁·w₁ = ${st.x[0]}·${fmt(st.w[0], 1)} = ${fmt(st.x[0] * st.w[0], 1)}<br>x₂·w₂ = ${st.x[1]}·${fmt(st.w[1], 1)} = ${fmt(st.x[1] * st.w[1], 1)}`;
        const ok = st.w[0] > 0 && Math.abs(st.w[1] - 2 * st.w[0]) < 0.01;
        if (ok && !api.isDone('n2')) { api.markDone('n2'); }
        task.replaceWith(task = taskBox('Stelle die Gewichte so ein, dass Eingang 2 <b>doppelt so wichtig</b> ist wie Eingang 1 (beide positiv).', api.isDone('n2')));
      };
      let task = h('<div></div>');
      ctl.append(h('<div class="row" style="margin-bottom:8px"></div>'));
      const r = ctl.firstChild;
      r.append('x₁ ', toggle01(1, v => { st.x[0] = v; draw(); }), '  x₂ ', toggle01(1, v => { st.x[1] = v; draw(); }));
      ctl.append(slider('Gewicht w₁', -3, 3, 0.5, 1, v => { st.w[0] = v; draw(); }));
      ctl.append(slider('Gewicht w₂', -3, 3, 0.5, 1, v => { st.w[1] = v; draw(); }));
      ctl.append(calc);
      grid.append(pic, ctl); card.append(grid, task);
      draw();
    },

    n3(card, api) {
      card.append(h(`<p class="st-text">Das Neuron <b>addiert</b> alle Produkte: z = x₁·w₁ + x₂·w₂ + <b>b</b>. Der <b>Bias b</b> ist eine feste Zahl, die immer dazukommt. Er bestimmt, wie leicht das Neuron „anspringt“: großer Bias = schon mit wenig Reiz, negativer Bias = braucht viel Reiz.</p>`));
      const st = { x: [1, 1], w: [1.5, 1], b: 0 };
      const grid = h('<div class="st-grid"></div>');
      const pic = h('<div class="mini"></div>'), ctl = h('<div></div>');
      const calc = h('<div class="calc"></div>');
      let task = h('<div></div>');
      const draw = () => {
        const m = miniNeuron({ x: st.x, w: st.w, b: st.b, act: 'linear' });
        pic.innerHTML = ''; pic.append(m.svg);
        calc.innerHTML = `z = ${st.x[0]}·${fmt(st.w[0], 1)} + ${st.x[1]}·${fmt(st.w[1], 1)} + (${fmt(st.b, 1)}) = <b>${fmt(m.z, 2)}</b>`;
        const ok = st.x[0] === 1 && st.x[1] === 1 && Math.abs(m.z) < 0.01 && st.w[0] !== 0 && st.w[1] !== 0;
        if (ok && !api.isDone('n3')) api.markDone('n3');
        task.replaceWith(task = taskBox('Bei x₁ = 1 und x₂ = 1 soll die Summe z <b>genau 0</b> sein — ohne ein Gewicht auf 0 zu setzen.', api.isDone('n3')));
      };
      const r = h('<div class="row" style="margin-bottom:8px"></div>');
      r.append('x₁ ', toggle01(1, v => { st.x[0] = v; draw(); }), '  x₂ ', toggle01(1, v => { st.x[1] = v; draw(); }));
      ctl.append(r, slider('Gewicht w₁', -3, 3, 0.5, 1.5, v => { st.w[0] = v; draw(); }),
        slider('Gewicht w₂', -3, 3, 0.5, 1, v => { st.w[1] = v; draw(); }),
        slider('Bias b', -5, 5, 0.5, 0, v => { st.b = v; draw(); }), calc);
      grid.append(pic, ctl); card.append(grid, task);
      draw();
    },

    n4(card, api) {
      card.append(h(`<p class="st-text">Die Summe z kann jede Zahl sein. Die <b>Aktivierungsfunktion f</b> macht daraus die Ausgabe y. Die <b>Stufe</b> sagt nur ja (1) oder nein (0). <b>Sigmoid</b> sagt „wie sicher“ zwischen 0 und 1 — das braucht man zum Trainieren. <b>ReLU</b> lässt nur Positives durch.</p>`));
      const st = { act: 'step', z: 1 };
      const grid = h('<div class="st-grid"></div>');
      const pic = h('<div class="mini"></div>'), ctl = h('<div></div>');
      const chips = h('<div class="chips" style="margin-bottom:10px"></div>');
      const calc = h('<div class="calc"></div>');
      let task = h('<div></div>');
      ['step', 'sigmoid', 'relu', 'tanh'].forEach(a => {
        const c = h(`<button class="chip" type="button">${N.ACTS[a].name}</button>`);
        c.onclick = () => { st.act = a; draw(); };
        chips.append(c);
      });
      const draw = () => {
        chips.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', ['step', 'sigmoid', 'relu', 'tanh'][i] === st.act));
        const f = N.ACTS[st.act].f;
        const W = 420, H = 240, X = v => 30 + (v + 6) / 12 * (W - 50), Y = v => H - 30 - (v + 1.2) / 4.4 * (H - 50);
        let d = '';
        for (let i = 0; i <= 240; i++) { const v = -6 + i / 20; d += (i ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(Math.min(3.1, f(v))).toFixed(1); }
        const y = f(st.z);
        pic.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
          <line x1="${X(-6)}" y1="${Y(0)}" x2="${X(6)}" y2="${Y(0)}" stroke="var(--line)" stroke-width="1.5"/>
          <line x1="${X(0)}" y1="${Y(-1.2)}" x2="${X(0)}" y2="${Y(3.1)}" stroke="var(--line)" stroke-width="1.5"/>
          <line x1="${X(-6)}" y1="${Y(1)}" x2="${X(6)}" y2="${Y(1)}" stroke="var(--line)" stroke-dasharray="4 4"/>
          <text x="${X(6) - 4}" y="${Y(0) + 16}" text-anchor="end" font-size="12" fill="var(--ink-faint)">z</text>
          <text x="${X(0) + 6}" y="${Y(3.1) + 12}" font-size="12" fill="var(--ink-faint)">y</text>
          <text x="${X(0) - 6}" y="${Y(1) + 4}" text-anchor="end" font-size="11" fill="var(--ink-faint)">1</text>
          <path d="${d}" fill="none" stroke="var(--act-${st.act})" stroke-width="3.5"/>
          <line x1="${X(st.z)}" y1="${Y(0)}" x2="${X(st.z)}" y2="${Y(Math.min(3.1, y))}" stroke="var(--ink-faint)" stroke-dasharray="3 3"/>
          <circle cx="${X(st.z)}" cy="${Y(Math.min(3.1, y))}" r="8" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
        </svg>`;
        calc.innerHTML = `z = ${fmt(st.z, 2)}  →  y = ${N.ACTS[st.act].name}(z) = <b>${fmt(y, 3)}</b>`;
        const ok = st.act === 'sigmoid' && Math.abs(y - 0.9) < 0.02;
        if (ok && !api.isDone('n4')) api.markDone('n4');
        task.replaceWith(task = taskBox('Wähle <b>Sigmoid</b> und finde eine Summe z, bei der das Neuron zu <b>90 % sicher</b> ist (y ≈ 0,9).', api.isDone('n4')));
      };
      ctl.append(chips, slider('Summe z', -6, 6, 0.1, 1, v => { st.z = v; draw(); }), calc);
      grid.append(pic, ctl); card.append(grid, task);
      draw();
    },

    n5(card, api) {
      card.append(h(`<p class="st-text">Hat ein Neuron zwei Eingänge, kann man jedes Beispiel als <b>Punkt</b> zeichnen. Überall, wo w₁·x₁ + w₂·x₂ + b = 0 ist, kippt die Entscheidung — das ist eine <b>Gerade</b>. Die Gewichte <b>drehen</b> sie, der Bias <b>verschiebt</b> sie. Der kleine Pfeil zeigt auf die Seite, auf der das Neuron 1 sagt.</p>`));
      const rows = [[0.2, 0.3, 0], [0.5, 0.2, 0], [0.3, 0.7, 0], [0.1, 0.9, 0], [0.7, 0.4, 0], [0.4, 0.45, 0],
        [0.9, 0.8, 1], [1.2, 0.5, 1], [0.8, 1.2, 1], [1.4, 1.1, 1], [1.1, 0.9, 1], [0.6, 1.4, 1]]
        .map(r => ({ x: [r[0], r[1]], t: [r[2]] }));
      const sc = { inputs: [{ label: 'x₁' }, { label: 'x₂' }], plot: { type: '2d', ax: [0, 1] }, rows };
      const net = { inputs: [{}, {}], layers: [[{ act: 'step', w: [1, -1], b: 0 }]], outputs: [{ src: { l: 0, n: 0 } }] };
      const grid = h('<div class="st-grid"></div>');
      const box = h('<div class="plotbox tall"><canvas></canvas><div class="legend"><span><i style="background:#5c7cfa"></i>soll 0</span><span><i style="background:#f08c00"></i>soll 1</span><span>roter Ring = falsch</span></div></div>');
      const ctl = h('<div></div>');
      const calc = h('<div class="calc"></div>');
      let task = h('<div></div>');
      const draw = () => {
        window.NLPlot.draw(box.querySelector('canvas'), { sc, net, rows });
        const ev = N.evaluate(net, rows);
        calc.innerHTML = `Gerade: ${fmt(net.layers[0][0].w[0], 1)}·x₁ + ${fmt(net.layers[0][0].w[1], 1)}·x₂ + (${fmt(net.layers[0][0].b, 1)}) = 0<br>richtig: <b>${Math.round(ev.acc * rows.length)} von ${rows.length}</b>`;
        if (ev.acc === 1 && !api.isDone('n5')) api.markDone('n5');
        task.replaceWith(task = taskBox('Drehe und verschiebe die Gerade so, dass <b>alle 12 Punkte</b> richtig liegen.', api.isDone('n5')));
      };
      const nr = net.layers[0][0];
      ctl.append(slider('Gewicht w₁', -3, 3, 0.1, 1, v => { nr.w[0] = v; draw(); }),
        slider('Gewicht w₂', -3, 3, 0.1, -1, v => { nr.w[1] = v; draw(); }),
        slider('Bias b', -4, 4, 0.1, 0, v => { nr.b = v; draw(); }), calc);
      grid.append(box, ctl); card.append(grid, task);
      requestAnimationFrame(draw);
    },

    n6(card, api) {
      card.append(h(`<p class="st-text">Ein Neuron kann nur <b>eine</b> Gerade ziehen. Viele Aufgaben brauchen mehr: Dann schaltet man Neuronen hintereinander. Die Ausgaben der ersten <b>Schicht</b> sind die Eingänge der nächsten. So entsteht ein <b>neuronales Netz</b>. Die Schichten zwischen Eingang und Ausgang heißen <b>versteckte Schichten</b>.</p>`));
      const grid = h('<div class="st-grid"></div>');
      const pic = h(`<div class="mini"><svg viewBox="0 0 420 220">
        ${[60, 160].map(y => `<rect x="10" y="${y - 20}" width="60" height="40" rx="20" fill="var(--surface)" stroke="#e3a008" stroke-width="2"/>`).join('')}
        ${[40, 110, 180].map(y => [60, 160].map(y0 => `<line x1="70" y1="${y0}" x2="170" y2="${y}" stroke="var(--pos)" stroke-width="2"/>`).join('')).join('')}
        ${[40, 110, 180].map(y => `<line x1="230" y1="${y}" x2="310" y2="110" stroke="var(--pos)" stroke-width="2"/><rect x="170" y="${y - 22}" width="60" height="44" rx="12" fill="var(--surface)" stroke="var(--act-sigmoid)" stroke-width="2.4"/><text x="200" y="${y + 6}" text-anchor="middle" font-size="16">Σ|f</text>`).join('')}
        <rect x="310" y="88" width="60" height="44" rx="12" fill="var(--surface)" stroke="var(--act-sigmoid)" stroke-width="2.4"/><text x="340" y="116" text-anchor="middle" font-size="16">Σ|f</text>
        <line x1="370" y1="110" x2="405" y2="110" stroke="var(--wire)" stroke-width="3"/>
        <text x="40" y="214" text-anchor="middle" font-size="12" fill="var(--ink-faint)">Eingänge</text>
        <text x="200" y="214" text-anchor="middle" font-size="12" fill="var(--ink-faint)">versteckte Schicht</text>
        <text x="345" y="214" text-anchor="middle" font-size="12" fill="var(--ink-faint)">Ausgang</text>
      </svg></div>`);
      const Q = [
        { q: 'Was stellt das Training eines Netzes ein?', a: ['die Eingänge', 'die Gewichte und Biases', 'die Anzahl der Schichten'], r: 1 },
        { q: 'Wie viele Geraden kann EIN Neuron mit zwei Eingängen ziehen?', a: ['eine', 'zwei', 'beliebig viele'], r: 0 },
        { q: 'Wozu braucht man versteckte Schichten?', a: ['damit das Netz schneller rechnet', 'um mehrere Geraden zu verknüpfen', 'damit man die Eingänge nicht sieht'], r: 1 }
      ];
      const quiz = h('<div></div>');
      const got = new Set();
      Q.forEach((q, qi) => {
        const b = h(`<div class="quiz"><p>${qi + 1}. ${q.q}</p><div class="chips"></div></div>`);
        q.a.forEach((a, ai) => {
          const c = h(`<button class="chip" type="button">${a}</button>`);
          c.onclick = () => {
            b.querySelectorAll('.chip').forEach(x => x.classList.remove('right', 'wrong'));
            c.classList.add(ai === q.r ? 'right' : 'wrong');
            if (ai === q.r) got.add(qi); else got.delete(qi);
            if (got.size === Q.length && !api.isDone('n6')) api.markDone('n6');
            task.replaceWith(task = taskBox('Beantworte die drei Fragen richtig. Danach geht es weiter mit <b>Netze bauen</b>.', api.isDone('n6')));
          };
          b.querySelector('.chips').append(c);
        });
        quiz.append(b);
      });
      let task = taskBox('Beantworte die drei Fragen richtig. Danach geht es weiter mit <b>Netze bauen</b>.', api.isDone('n6'));
      grid.append(pic, quiz); card.append(grid, task);
    }
  };

  function render(nav, card, api) {
    nav.innerHTML = '';
    STATIONS.forEach((s, i) => {
      const b = h(`<button type="button"><i>${api.isDone(s.id) ? '✓' : i + 1}</i>${s.kurz}</button>`);
      b.classList.toggle('on', s.id === api.id);
      b.classList.toggle('done', api.isDone(s.id));
      b.disabled = !api.usable(s.id);
      b.onclick = () => api.go(s.id);
      nav.append(b);
    });
    card.innerHTML = '';
    const i = STATIONS.findIndex(s => s.id === api.id);
    const s = STATIONS[i];
    card.append(h(`<p class="kicker">Station ${i + 1} von ${STATIONS.length}</p>`), h(`<h2>${s.title}</h2>`));
    BUILD[s.id](card, api);
    const foot = h('<div class="st-foot"></div>');
    const prev = STATIONS.slice(0, i).reverse().find(x => api.usable(x.id));
    const next = STATIONS.slice(i + 1).find(x => api.usable(x.id));
    const pb = h(`<button class="btn" type="button">‹ ${prev ? prev.kurz : 'Übersicht'}</button>`);
    pb.onclick = () => (prev ? api.go(prev.id) : api.home());
    const nb = h(`<button class="btn primary" type="button">${next ? next.kurz + ' ›' : 'Zur Übersicht'}</button>`);
    nb.onclick = () => (next ? api.go(next.id) : api.home());
    foot.append(pb, nb);
    card.append(foot);
  }

  window.NLNeuron = { STATIONS, render };
})();
