/* ══════════════════════════════════════════════════════════════
   NeuroLab · rechnen.js — „Netz durchrechnen“ (Kachel v-rechnen)
   ══════════════════════════════════════════════════════════════
   Bereich 2 „Vom Neuron zum Netz“ (21.11.2026), wie Sönkes Arbeitsblatt:
   ein Netz mit festen Zahlen, die Kinder rechnen z und y′ jedes Neurons
   selbst aus und prüfen. Aufgaben werden gewürfelt (ganze Zahlen).
     neuron   Ein Neuron, drei Eingänge, Typ Perzeptron/Linear/ReLU
     netz     3 Eingänge → 3 Neuronen (Perzeptron, Sigmoid, ReLU gemischt)
              → 1 Ausgang (Linear); manchmal fehlt eine Leitung
     rueck    Rückwärts: ein Gewicht fehlt, z ist bekannt → Gewicht finden
   Sigmoid: zwei Nachkommastellen genügen (± 0,01, am Ausgang ± 0,02).
   „Drucken“ (Lehrkraft/allein) legt die Aufgabe ohne Lösungen aufs Blatt.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const STUDENT = Q.get('raum') === 'schueler';
  const ACT = {
    perceptron: { n: 'Perzeptron', f: z => z > 0 ? 1 : 0, t: '1, wenn z > 0, sonst 0' },
    linear: { n: 'Linear', f: z => z, t: 'f(z) = z' },
    relu: { n: 'ReLU', f: z => Math.max(0, z), t: 'f(z) = max(0, z)' },
    sigmoid: { n: 'Sigmoid', f: z => 1 / (1 + Math.exp(-z)), t: 'f(z) = 1 / (1 + e^(−z))' },
  };
  const LEVELS = [
    { id: 'neuron', t: 'Ein Neuron' },
    { id: 'netz', t: 'Ein Netz' },
    { id: 'rueck', t: 'Rückwärts' },
  ];
  let level = 'netz', task = null, shown = false, page = null;

  const h = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const num = v => { let r = Math.round(v * 100) / 100; if (Object.is(r, -0)) r = 0; return String(r).replace('.', ',').replace('-', '−'); };
  function parseNum(s) {
    s = String(s ?? '').trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    const fr = s.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
    if (fr) { const d = parseFloat(fr[2]); return d ? parseFloat(fr[1]) / d : null; }
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : null;
  }
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const rnz = (a, b) => { let v = 0; while (!v) v = ri(a, b); return v; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* Neuron: {w: [w|null je Eingang], b, type}  (null = keine Leitung) */
  function calc(n, x) { const z = n.w.reduce((s, w, i) => s + (w === null ? 0 : w * x[i]), 0) + n.b; return { z, y: ACT[n.type].f(z) }; }

  function make(lv) {
    const x = [rnz(-3, 3), rnz(-3, 3), rnz(-3, 3)];
    if (lv === 'neuron') {
      const n = { w: [rnz(-3, 3), rnz(-3, 3), rnz(-3, 3)], b: ri(-5, 5), type: ['perceptron', 'linear', 'relu'][ri(0, 2)] };
      return { lv, x, hid: [n], out: null };
    }
    if (lv === 'rueck') {
      const n = { w: [rnz(-3, 3), rnz(-3, 3), rnz(-3, 3)], b: ri(-5, 5), type: 'linear' };
      const k = ri(0, 2);
      return { lv, x, hid: [n], out: null, miss: k, z: calc(n, x).z };
    }
    // Netz wie auf dem Arbeitsblatt
    let types = shuffle(['perceptron', 'sigmoid', 'relu']);
    const hid = types.map(type => {
      const w = [rnz(-3, 4), rnz(-3, 4), rnz(-3, 4)];
      if (Math.random() < 0.35) w[ri(0, 2)] = null;
      return { w, b: ri(-4, 3), type };
    });
    // Sigmoid nicht zu weit draußen (sonst 0,00/1,00 – langweilig)
    const sg = hid.find(n => n.type === 'sigmoid');
    sg.b -= Math.round(calc(sg, x).z * 0.7);
    const out = { w: hid.map(() => rnz(-2, 2)), b: ri(-2, 2), type: 'linear' };
    return { lv, x, hid, out };
  }

  /* ── Bild: Netz als SVG mit HTML-Feldern darüber (Fläche 820 × H) ── */
  function draw(box) {
    const t = task, one = !t.out;
    const W = one ? 820 : 960, H = one ? 330 : 460;
    const IX = 70, HX = one ? 470 : 380, OX = 760;
    const iy = one ? [70, 165, 260] : [80, 230, 380];
    const hy = one ? [165] : [80, 230, 380];
    const P = (x, y) => `left:${x / W * 100}%;top:${y / H * 100}%`;
    const COL = ['#2e8b57', '#2f7fb5', '#c0392b'];
    let svg = '', html = '';
    t.hid.forEach((n, j) => n.w.forEach((w, i) => {
      if (w === null) return;
      const c = one ? 'var(--accent)' : COL[j];
      svg += `<line x1="${IX + 46}" y1="${iy[i]}" x2="${HX - 80}" y2="${hy[j]}" style="stroke:${c}"/>`;
      const f = one ? 0.42 : [0.24, 0.48, 0.72][(i + j) % 3];
      const lx = IX + 46 + (HX - 80 - IX - 46) * f, ly = iy[i] + (hy[j] - iy[i]) * f;
      const miss = t.lv === 'rueck' && i === t.miss;
      html += `<span class="rc-w${miss ? ' miss' : ''}" style="${P(lx, ly)};--c:${c}">${miss ? '<b>?</b>' : num(w)}</span>`;
    }));
    t.x.forEach((v, i) => { html += `<span class="rc-in" style="${P(IX, iy[i])}"><span class="xs"><i class="m">x</i><sub>${i + 1}</sub></span><b>${num(v)}</b></span>`; });
    const neuron = (n, x, y, key, c, label) => {
      svg += `<line x1="${x}" y1="${y + 36}" x2="${x}" y2="${y + 58}" class="rc-bl"/>`;
      if (t.lv !== 'rueck') svg += `<line x1="${x + 80}" y1="${y}" x2="${x + 92}" y2="${y}" style="stroke:${c}"/>`;
      html += `<div class="rc-n" style="${P(x, y)};--c:${c}" data-k="${key}">
          <span class="rc-type">${label || ACT[n.type].n}</span>
          <span class="rc-body"><span class="rc-sig">Σ</span><span class="rc-f"><i class="m">f</i>(<i class="m">z</i>)</span></span>
          <span class="rc-b"><i class="m">b</i> = ${num(n.b)}</span></div>`;
      if (t.lv === 'rueck') return;
      html += `<div class="rc-ans" style="${P(x + 92, y)}" data-k="${key}">
          <label><span><i class="m">z</i> =</span><input type="text" inputmode="decimal" autocomplete="off" data-a="${key}-z"></label>
          <label><span><i class="m">y′</i> =</span><input type="text" inputmode="decimal" autocomplete="off" data-a="${key}-y"></label></div>`;
    };
    t.hid.forEach((n, j) => neuron(n, HX, hy[j], 'h' + j, one ? 'var(--accent)' : COL[j]));
    if (t.out) {
      t.out.w.forEach((w, j) => {
        svg += `<line x1="${HX + 178}" y1="${hy[j]}" x2="${OX - 80}" y2="230" style="stroke:var(--bias)"/>`;
        const f = 0.5, lx = HX + 178 + (OX - 80 - HX - 178) * f, ly = hy[j] + (230 - hy[j]) * f;
        html += `<span class="rc-w" style="${P(lx, ly)};--c:var(--bias)">${num(w)}</span>`;
      });
      neuron(t.out, OX, 230, 'o', 'var(--bias)', 'Linear');
    }
    box.innerHTML = `<div class="rc-net" style="aspect-ratio:${W}/${H};--rc-w:${W}"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg>${html}</div>`;
  }

  function solution() {
    const t = task, r = {};
    const hv = t.hid.map((n, j) => { const c = calc(n, t.x); r['h' + j] = c; return c.y; });
    if (t.out) r.o = calc(t.out, hv);
    return r;
  }
  const tol = (key, type) => type === 'sigmoid' ? 0.011 : key === 'o' && task.hid.some(n => n.type === 'sigmoid') ? 0.021 : 1e-6;

  function check(box, fb, reveal) {
    const sol = solution();
    let good = 0, all = 0, empty = 0;
    if (task.lv === 'rueck') {
      const inp = box.querySelector('[data-a="w"]'), v = parseNum(inp.value), want = task.hid[0].w[task.miss];
      if (reveal) inp.value = num(want);
      const ok = reveal || (v !== null && Math.abs(v - want) < 1e-6);
      inp.classList.toggle('good', ok); inp.classList.toggle('bad', !ok && v !== null);
      fb.innerHTML = reveal ? 'Lösung eingetragen.' : v === null ? 'Trag das fehlende Gewicht ein.' : ok ? '<b class="good">Richtig!</b>' : 'Noch nicht. Setz das Gewicht als Unbekannte in die Rechnung ein und löse nach ihm auf.';
      return;
    }
    Object.keys(sol).forEach(key => {
      const n = key === 'o' ? task.out : task.hid[+key.slice(1)];
      ['z', 'y'].forEach(k => {
        const inp = box.querySelector(`[data-a="${key}-${k}"]`);
        const want = sol[key][k], tl = k === 'z' && n.type !== 'linear' && key !== 'o' ? 1e-6 : tol(key, n.type);
        if (reveal) inp.value = num(want);
        const v = parseNum(inp.value);
        all++;
        if (v === null) { empty++; inp.classList.remove('good', 'bad'); return; }
        const ok = Math.abs(v - want) <= tl + 1e-9;
        if (ok) good++;
        inp.classList.toggle('good', ok); inp.classList.toggle('bad', !ok);
      });
    });
    fb.innerHTML = reveal ? 'Lösung eingetragen. <b>Neue Aufgabe</b> für die nächste Runde.' : good === all ? '<b class="good">Alles richtig!</b>'
      : `<b>${good} von ${all}</b> richtig${empty ? `, ${empty} noch leer` : ''}. Rot = nochmal rechnen.${task.hid.some(n => n.type === 'sigmoid') ? ' Sigmoid: zwei Nachkommastellen reichen.' : ''}`;
  }

  function render(root) {
    page = root;
    if (!task || task.lv !== level) task = make(level);
    root.innerHTML = '';
    const card = h(`<section class="nn-card rc-card">
      <div class="rc-top"><nav class="nn-tabs rc-lv">${LEVELS.map(l => `<button type="button" class="nn-tab${l.id === level ? ' on' : ''}" data-lv="${l.id}">${l.t}</button>`).join('')}</nav>
        <span></span><button type="button" class="nn-btn rc-new">Neue Aufgabe</button>${STUDENT ? '' : '<button type="button" class="nn-btn rc-print">Drucken</button>'}</div>
      <h2>${level === 'rueck' ? 'Welches Gewicht fehlt?' : 'Rechne das Netz durch'}</h2>
      <p class="nn-lead-p rc-lead"></p>
      <div class="rc-box"></div>
      <div class="rc-actions"></div>
      <p class="rc-fb"></p>
      <details class="rc-help"><summary>Die Aktivierungen</summary><ul>${Object.values(ACT).map(a => `<li><b>${a.n}:</b> <span class="m">${a.t}</span></li>`).join('')}</ul>
        <p>Jedes Neuron rechnet zuerst <span class="m">z = x₁·w₁ + x₂·w₂ + x₃·w₃ + b</span> (fehlt eine Leitung, fällt der Teil weg), dann <span class="m">y′ = f(z)</span>. Die Ausgaben y′ der ersten Schicht sind die Eingänge des Ausgangs.</p></details>
    </section>`);
    const lead = card.querySelector('.rc-lead'), box = card.querySelector('.rc-box'), act = card.querySelector('.rc-actions'), fb = card.querySelector('.rc-fb');
    lead.innerHTML = level === 'neuron' ? 'Berechne <i class="m">z</i> und die Ausgabe <i class="m">y′</i> des Neurons.'
      : level === 'netz' ? 'Berechne zuerst <i class="m">z</i> und <i class="m">y′</i> der drei Neuronen links, dann den Ausgang. Der Typ steht über jedem Neuron.'
      : `Das Neuron ist linear. Es rechnet <b><i class="m">z</i> = ${num(task.z)}</b>. Ein Gewicht ist verloren gegangen – finde es.`;
    draw(box);
    if (level === 'rueck') act.innerHTML = '<label class="rc-wans"><span>fehlendes Gewicht =</span><input type="text" inputmode="decimal" autocomplete="off" data-a="w"></label>';
    act.insertAdjacentHTML('beforeend', '<button type="button" class="nn-btn primary rc-check">Prüfen</button><button type="button" class="nn-btn rc-show">Lösung zeigen</button>');
    card.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { level = b.dataset.lv; task = make(level); render(page); }));
    card.querySelector('.rc-new').addEventListener('click', () => { task = make(level); render(page); });
    card.querySelector('.rc-check').addEventListener('click', () => check(card, fb, false));
    card.querySelector('.rc-show').addEventListener('click', () => { if (confirm('Lösung eintragen?')) check(card, fb, true); });
    card.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') check(card, fb, false); }));
    const pb = card.querySelector('.rc-print');
    if (pb) pb.addEventListener('click', () => {
      card.querySelectorAll('input').forEach(i => { i.value = ''; i.classList.remove('good', 'bad'); });
      fb.innerHTML = '';
      const de = document.documentElement, old = de.getAttribute('data-theme');
      de.classList.add('rc-print-on'); de.setAttribute('data-theme', 'light');
      const done = () => { de.classList.remove('rc-print-on'); if (old === null) de.removeAttribute('data-theme'); else de.setAttribute('data-theme', old); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(() => window.print(), 60);
    });
    root.appendChild(card);
  }

  window.NLRechnen = { render, _make: make, _calc: calc };
})();
