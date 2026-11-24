/* ══════════════════════════════════════════════════════════════
   NeuroLab · neuron.js — Bereich „Wie funktioniert ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Zwei Kacheln (= zwei Reiter, die Lehrkraft gibt jede einzeln frei):
     n-wie    Wie arbeitet ein Neuron? in sieben Schritten (20.11.2026, 5. Fassung):
              Nervenzelle ↔ Neuron · dann EIN Neuron (Perceptron, makeNeuron),
              das sich Schritt für Schritt aus dem Grau ausbreitet: Eingänge ·
              Gewichte · Summe & Bias · Aktivierung · Eine Gerade · Punkte trennen
              (echte Pinguine). Jeder Wert mit + / − am Neuron, Zahl antippen = Regler am Feld;
              darunter immer die Rechnung (calcHTML) in Formel-Schrift.
     n-typen  Alle Neuronen: kleine Karte je Typ (Kurve, Ausgabe, ein Satz),
              antippen = Schritt 7 (Pinguine) mit diesem Typ, oben umschaltbar
   Nutzt aus app.js: activations.
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
      wofuer: 'Ausgang für Ja/Nein mit Sicherheit („zu 90 % ein Zügelpinguin“).',
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

  /* ── Reiter 1: Wie arbeitet ein Neuron? (5. Fassung, 20.11.2026) ──────
     EIN Neuron als feste Komponente (makeNeuron): Eingänge, Leitungen,
     Gewichte, Rumpf (Σ | f), Bias, Ausgabe. Jeder Wert hat ein kleines
     + und − übereinander daneben, Antippen der Zahl öffnet am Feld einen
     senkrechten Regler. Was noch nicht dran war, ist da, aber ausgegraut
     und im Nebel – mit jedem Schritt breitet sich das Neuron aus
     (data-show 1–4). Darunter immer die Rechnung in Formel-Schrift (KaTeX),
     Farben wie im Neuron: x orange, w türkis, b indigo, y gold.
     Zwei Modelle (= Zustand + Grenzen + Ebene):
       ABS   Schritte 2–6, Zahlen −5 … 5
       PENG  Schritt 7 und „Alle Neuronen“: echte Adelie- und Zügelpinguine
             (Schnabellänge/-höhe in mm, aus Nebeltal js/welt.js PENG_A/PENG_C),
             30 Stück, mit einer Geraden trennbar (z. B. w = (1, −1), b = −25). */
  const ABS = {
    x: [2, 1], w: [1, 0.5], b: -2, type: 'perceptron',
    lim: { x1: [-5, 5, 0.5, 0.1], x2: [-5, 5, 0.5, 0.1], w: [-3, 3, 0.5, 0.05], b: [-8, 8, 0.5, 0.1] },
    dom: [[-5, 5], [-5, 5]], ticks: [[1, 2], [1, 2]], snap: 0.5,
  };
  const PENG_PTS = [
    [33.1, 16.1, 0], [34.6, 17.2, 0], [35.1, 19.4, 0], [35.7, 17, 0], [36.8, 18.5, 0], [37.6, 19.3, 0], [38.1, 17.6, 0], [38.7, 19, 0],
    [39.5, 17.8, 0], [40.5, 17.9, 0], [41.1, 18.2, 0], [41.5, 18.3, 0], [42.3, 21.2, 0], [42, 20.2, 0], [43.2, 19, 0],
    [42.5, 16.7, 1], [43.2, 16.6, 1], [45.5, 17, 1], [45.9, 17.1, 1], [46.4, 17.8, 1], [46.8, 16.5, 1], [47.6, 18.3, 1], [49, 19.6, 1],
    [49.6, 18.2, 1], [50.1, 17.9, 1], [50.8, 18.5, 1], [51.5, 18.7, 1], [52, 19, 1], [52.8, 20, 1], [58, 17.8, 1],
  ].map(p => ({ x: [p[0], p[1]], soll: p[2] }));
  const PENG = {
    x: [39.5, 17.8], w: [0.5, 0.5], b: -30, type: 'perceptron',
    lim: { x1: [30, 60, 0.5, 0.1], x2: [15, 22, 0.5, 0.1], w: [-3, 3, 0.25, 0.05], b: [-60, 20, 1, 0.5] },
    dom: [[30, 60], [15, 22]], ticks: [[5, 5], [1, 1]], snap: 0.1,
    axes: ['Schnabellänge in mm', 'Schnabelhöhe in mm'], caps: ['Schnabellänge', 'Schnabelhöhe'],
    ocap: 'Zügelpinguin?', yes: 'Zügel', no: 'Adelie', points: PENG_PTS,
  };
  const STEPS = [
    { id: 'bio', kurz: 'Nervenzelle', title: 'Vom Gehirn zum künstlichen Neuron' },
    { id: 'in', kurz: 'Eingänge', title: 'Zahlen hinein – eine Antwort heraus', show: 1 },
    { id: 'w', kurz: 'Gewichte', title: 'Gewichte: Wie wichtig ist ein Eingang?', show: 2 },
    { id: 'b', kurz: 'Summe & Bias', title: 'Zusammenzählen – und der Bias kommt dazu', show: 3 },
    { id: 'act', kurz: 'Aktivierung', title: 'Die Aktivierung entscheidet: feuern oder nicht', show: 4 },
    { id: 'line', kurz: 'Eine Gerade', title: 'Ein Neuron zieht eine Gerade', show: 4 },
    { id: 'data', kurz: 'Punkte trennen', title: 'Ein Neuron trifft eine Entscheidung', show: 4 },
  ];
  let step = 'bio', lastShow = 0;

  const r2 = v => Math.round(v * 100) / 100;
  const num = v => { let r = r2(v); if (Object.is(r, -0)) r = 0; return String(r).replace('.', ',').replace('-', '−'); };
  const limOf = (m, k) => m.lim[k[0] === 'x' ? k : k[0]];
  const clampK = (m, k, v) => { const L = limOf(m, k); return Math.max(L[0], Math.min(L[1], v)); };
  const getV = (m, k) => k === 'b' ? m.b : m[k[0]][+k[1] - 1];
  const setV = (m, k, v) => { v = clampK(m, k, v); if (!m.frac) v = r2(v); if (k === 'b') m.b = v; else m[k[0]][+k[1] - 1] = v; };
  /* Zahl aus dem Eingabefeld: „0,75“, „−2“ oder ein Bruch „3/4“, „-1/2“ (null = unlesbar) */
  function parseNum(s) {
    s = String(s ?? '').trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(/,/g, '.');
    if (!s) return null;
    const fr = s.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
    if (fr) { const d = parseFloat(fr[2]); return d ? parseFloat(fr[1]) / d : null; }
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : null;
  }
  /* m.frac: ein eingetippter Bruch bleibt als Text stehen, solange der Wert gleich ist */
  const shown = (m, k) => { const v = getV(m, k), t = m.txt && m.txt[k]; return t && Math.abs(t.v - v) < 1e-12 ? t.s : num(v); };
  const zOf = (m, x = m.x) => x[0] * m.w[0] + x[1] * m.w[1] + m.b;
  const yOf = (m, z) => activations[m.type].fn(z);
  const SUB = { x1: 'x<sub>1</sub>', x2: 'x<sub>2</sub>', w1: 'w<sub>1</sub>', w2: 'w<sub>2</sub>', b: 'b' };

  /* Kurve der Aktivierung im Kästchen 100 × 60 (rechte Hälfte des Rumpfs) */
  const FY = { perceptron: [0, 1], sigmoid: [0, 1], tanh: [-1, 1], relu: [-1, 4], linear: [-4, 4] };
  const fX = z => 50 + Math.max(-4, Math.min(4, z)) * 11;
  const fY = (t, v) => { const [lo, hi] = FY[t]; return 50 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * 38; };
  function fPath(t) {
    if (t === 'perceptron') return 'M6 50 H50 V12 H94';
    let d = '';
    for (let i = 0; i <= 40; i++) { const z = -4 + i / 5; d += (i ? 'L' : 'M') + fX(z).toFixed(1) + ' ' + fY(t, activations[t].fn(z)).toFixed(1); }
    return d;
  }

  /* Ein Wert: Zahl, daneben klein + über − (Zahl antippen = Regler am Feld) */
  const stepper = (k, cls) => `<span class="nw-val ${cls}" data-v="${k}">
      <button type="button" class="nw-num" aria-label="${k} einstellen"></button>
      <span class="nw-pms"><button type="button" class="nw-pm" data-d="1" aria-label="${k} größer">+</button><button type="button" class="nw-pm" data-d="-1" aria-label="${k} kleiner">−</button></span></span>`;

  /* Die Neuron-Komponente. Koordinaten in einer gedachten Fläche 720 × 285
     (y 45 … 330); die HTML-Teile liegen in Prozent darüber, Schrift wächst
     mit (cqw). o = { fixed: true } → nur ansehen (Schritt 1), sonst
     onChange() nach jeder Änderung; o.typed → Rumpf zeigt Typ und Kurve in
     Typ-Farbe, Ausgabe als Zahl. */
  function makeNeuron(m, o = {}) {
    const OY = 45, HH = 285;
    const P = (x, y) => `left:${x / 7.2}%;top:${(y - OY) / HH * 100}%`;
    const cap = i => m.caps ? `<span class="nw-cap">${m.caps[i]}</span>` : '';
    // o.many (Schritt 1): vier Eingänge und „⋮“ – ein echtes Neuron hat viele;
    // gerechnet wird weiter nur mit x₁ und x₂, die übrigen sind nur Bild.
    const IN = o.many ? [52, 112, 172, 232] : [85, 245], IE = o.many ? [134, 152, 170, 188] : [146, 184];
    const MORE = 284, MORE_E = 204;
    const root = h(`<div class="nw${o.fixed ? ' is-fixed' : ''}${o.many ? ' is-many' : ''}${o.typed ? ' is-typed' : ''}"><div class="nw-in">
      <svg class="nw-wires" viewBox="0 45 720 285">
        ${IN.map((y, i) => `<line class="nw-edge" data-k="w" data-e="${i}" x1="80" y1="${y}" x2="300" y2="${IE[i]}"/>`).join('')}
        ${o.many ? `<line class="nw-more" data-k="w" x1="80" y1="${MORE}" x2="300" y2="${MORE_E}"/>` : ''}
        <line class="nw-bline" data-k="b" x1="355" y1="268" x2="355" y2="232"/>
        <path class="nw-barrow" data-k="b" d="M347 236 L355 226 L363 236 Z"/>
        <line class="nw-owire" data-k="out" x1="500" y1="165" x2="560" y2="165"/>
      </svg>
      ${IN.map((y, i) => `<div class="nw-node nw-x${i === 1 && !o.many ? ' nw-x2' : ''}" data-k="in" style="${P(80, y)}">${i < 2 ? cap(i) : ''}<i class="m">x<sub>${i + 1}</sub></i>${i < 2 && !o.many ? stepper('x' + (i + 1), 'c-x') : ''}</div>`).join('')}
      ${IN.map((y, i) => { const f = o.many ? 0.4 : 0.645, x = 80 + f * 220, yy = y + f * (IE[i] - y);
        return `<div class="nw-wpill" data-k="w" data-part="2" style="${P(x, yy)}"><i class="m">w<sub>${i + 1}</sub></i>${i < 2 && !o.many ? `<span class="nw-q">?</span>${stepper('w' + (i + 1), 'c-w')}` : ''}</div>`; }).join('')}
      ${o.many ? `<div class="nw-xmore" data-k="in" style="${P(80, MORE)}">⋮</div>` : ''}
      <div class="nw-body" style="left:${300 / 7.2}%;top:${(105 - OY) / HH * 100}%;width:${200 / 7.2}%;height:${120 / HH * 100}%">
        <span class="nw-tname"></span>
        <div class="nw-half nw-sum" data-k="sum" data-part="3"><b class="nw-sigma">Σ</b><span class="nw-z m"><i>z</i> = <b></b></span><span class="nw-fog">?</span></div>
        <div class="nw-half nw-f" data-k="f" data-part="4"><svg viewBox="0 0 100 60" class="nw-stepfn"><line x1="6" y1="50" x2="94" y2="50" class="ax hx"/><line x1="50" y1="6" x2="50" y2="56" class="ax"/><path class="st"/><circle class="dot" r="5.5"/></svg><span class="nw-fz m"><i>f</i>(<i>z</i>)</span><span class="nw-fog">?</span></div>
      </div>
      ${o.typed ? `<div class="nw-fform m" data-k="f" style="${P(505, 292)}"></div>` : ''}
      <div class="nw-bias" data-k="b" data-part="3" style="${P(355, 292)}"><i class="m">b</i><span class="nw-q">?</span>${stepper('b', 'c-b')}</div>
      <div class="nw-out" data-k="out" style="left:${560 / 7.2}%;top:${(125 - OY) / HH * 100}%;width:${124 / 7.2}%;height:${80 / HH * 100}%">
        ${m.ocap ? `<span class="nw-ocap">${m.ocap}</span>` : ''}
        <span class="nw-rays"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <b class="nw-y"></b><span class="nw-ytxt"></span></div>
      <div class="nw-pop" hidden><span class="nw-pop-k m"></span><b class="nw-pop-v"></b>
        <span class="nw-pop-lim"></span><div class="nw-vs" tabindex="0" role="slider"><i class="nw-vs-fill"></i><i class="nw-vs-th"></i></div><span class="nw-pop-lim"></span></div>
    </div></div>`);
    const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
    const pop = $('.nw-pop'), vs = $('.nw-vs');
    let popK = null, lastType = null, pin = null;
    // m.frac (Revier): im Regler-Fenster steht ein Eingabefeld – Zahl oder Bruch wie 3/4 eintippen
    if (m.frac) {
      pop.classList.add('has-in');
      pin = document.createElement('input');
      pin.type = 'text'; pin.className = 'nw-pop-in'; pin.autocomplete = 'off'; pin.spellcheck = false;
      pin.setAttribute('aria-label', 'Zahl oder Bruch eintippen, z. B. 3/4');
      pop.querySelector('.nw-pop-v').replaceWith(pin);
      const take = () => {
        if (!popK) return;
        const v = parseNum(pin.value);
        if (v === null) { pin.value = shown(m, popK); return; }
        const t = pin.value.trim().replace(/\s/g, '').replace(/-/g, '−').replace(/\./g, ',');
        m.txt = m.txt || {};
        m.txt[popK] = /\//.test(t) ? { s: t, v: clampK(m, popK, v) } : null;
        change(popK, v);
      };
      pin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); take(); pin.blur(); } });
      pin.addEventListener('change', take);
    }

    function paintPop() {
      if (!popK) return;
      const L = limOf(m, popK), v = getV(m, popK), fr = (v - L[0]) / (L[1] - L[0]);
      if (pin) { if (document.activeElement !== pin) pin.value = shown(m, popK); }
      else pop.querySelector('.nw-pop-v').textContent = num(v);
      vs.querySelector('.nw-vs-th').style.bottom = vs.querySelector('.nw-vs-fill').style.height = (fr * 100) + '%';
      vs.setAttribute('aria-valuenow', v);
    }
    function update() {
      $$('.nw-val').forEach(v => { v.querySelector('.nw-num').textContent = shown(m, v.dataset.v); });
      const show = +root.dataset.show || 4, t = m.type, act = activations[t];
      if (t !== lastType) {
        lastType = t;
        $('.nw-stepfn .st').setAttribute('d', fPath(t));
        const hy = fY(t, 0);
        $('.nw-stepfn .hx').setAttribute('y1', hy); $('.nw-stepfn .hx').setAttribute('y2', hy);
        root.style.setProperty('--tc', act.color);
        $('.nw-tname').textContent = o.typed ? act.fullName : '';
        if (o.typed) $('.nw-fform').innerHTML = F_TXT[t];
      }
      $$('.nw-edge').forEach(e => {
        const w = m.w[+e.dataset.e] ?? 1;
        const known = show >= 2;
        e.setAttribute('stroke-width', known ? Math.max(1.5, Math.min(2 + Math.abs(w) * 4, 14)) : 3);
        e.classList.toggle('is-neg', known && w < 0);
        e.classList.toggle('is-zero', known && Math.abs(w) < 0.005);
      });
      const secret = root.classList.contains('is-secret');
      const z = zOf(m), y = yOf(m, z), fire = z > 0 && !secret;
      $('.nw-z b').textContent = num(z);
      const dot = $('.nw-stepfn .dot');
      dot.setAttribute('cx', secret ? 50 : fX(z)); dot.setAttribute('cy', secret ? fY(t, 0) : fY(t, y));
      root.classList.toggle('is-fire', fire);
      $('.nw-y').textContent = secret ? '?' : t === 'perceptron' ? (fire ? '1' : '0') : num(y);
      if (secret) $('.nw-z b').textContent = '?';
      $('.nw-ytxt').textContent = secret ? '' : o.outText ? o.outText(fire, y) : m.yes ? (fire ? m.yes : m.no) : (fire ? 'feuert!' : 'feuert nicht');
      paintPop();
    }
    function change(k, v) { setV(m, k, v); update(); if (o.onChange) o.onChange(k); }

    if (!o.fixed) {
      // + / − (gedrückt halten = weiterzählen)
      $$('.nw-pm').forEach(b => {
        let t1 = 0, t2 = 0;
        const k = b.closest('.nw-val').dataset.v, d = +b.dataset.d;
        const bump = () => change(k, getV(m, k) + d * limOf(m, k)[2]);
        const stop = () => { clearTimeout(t1); clearInterval(t2); };
        b.addEventListener('pointerdown', e => { e.preventDefault(); bump(); t1 = setTimeout(() => { t2 = setInterval(bump, 110); }, 420); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
        b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(); } });
      });
      const closePop = () => { pop.hidden = true; popK = null; $$('.nw-val').forEach(v => v.classList.remove('is-open')); };
      // Zahl antippen → senkrechter Regler direkt neben dem Feld
      // o.direct (Revier, Sönke 24.11.2026): Zahl antippen = direkt eintippen (Zahl oder Bruch wie 3/4), kein Regler
      const typeAt = b => {
        const k = b.closest('.nw-val').dataset.v;
        const inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'nw-num-in'; inp.autocomplete = 'off'; inp.spellcheck = false;
        inp.value = shown(m, k); inp.setAttribute('aria-label', 'Zahl oder Bruch eintippen, z. B. 3/4');
        b.replaceWith(inp); inp.focus(); inp.select();
        let esc = false;
        inp.addEventListener('blur', () => {
          const v = parseNum(inp.value);
          inp.replaceWith(b);
          if (v !== null && !esc) {
            const t = inp.value.trim().replace(/\s/g, '').replace(/-/g, '−').replace(/\./g, ',');
            m.txt = m.txt || {};
            m.txt[k] = /\//.test(t) ? { s: t, v: clampK(m, k, v) } : null;
            change(k, v);
          } else update();
        }, { once: true });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { esc = true; inp.blur(); } });
      };
      $$('.nw-num').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        if (o.direct) { typeAt(b); return; }
        const k = b.closest('.nw-val').dataset.v;
        if (popK === k && !pop.hidden) { closePop(); return; }
        popK = k;
        const L = limOf(m, k);
        pop.className = 'nw-pop r-' + k[0];
        pop.querySelector('.nw-pop-k').innerHTML = `<i>${SUB[k]}</i>`;
        const lims = pop.querySelectorAll('.nw-pop-lim');
        lims[0].textContent = num(L[1]); lims[1].textContent = num(L[0]);
        vs.setAttribute('aria-valuemin', L[0]); vs.setAttribute('aria-valuemax', L[1]); vs.setAttribute('aria-label', k);
        pop.hidden = false;
        const rv = b.closest('.nw-val').getBoundingClientRect(), rr = $('.nw-in').getBoundingClientRect();
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        let left = rv.right - rr.left + 6;
        if (left + pw > rr.width + 4) left = rv.left - rr.left - pw - 6;
        pop.style.left = left + 'px';
        pop.style.top = Math.max(-30, Math.min(rr.height - ph + 30, rv.top - rr.top + rv.height / 2 - ph / 2)) + 'px';
        $$('.nw-val').forEach(v => v.classList.toggle('is-open', v.dataset.v === k));
        update();
        if (pin) pin.value = shown(m, k);
        vs.focus({ preventScroll: true });
      }));
      const fromY = cy => {
        const r = vs.getBoundingClientRect(), L = limOf(m, popK);
        const fr = Math.max(0, Math.min(1, 1 - (cy - r.top) / r.height));
        change(popK, Math.round((L[0] + fr * (L[1] - L[0])) / L[3]) * L[3]);
      };
      let dragging = false;
      vs.addEventListener('pointerdown', e => { e.preventDefault(); dragging = true; vs.setPointerCapture(e.pointerId); fromY(e.clientY); });
      vs.addEventListener('pointermove', e => { if (dragging) fromY(e.clientY); });
      ['pointerup', 'pointercancel'].forEach(ev => vs.addEventListener(ev, () => { dragging = false; }));
      vs.addEventListener('keydown', e => {
        if (!popK) return;
        const L = limOf(m, popK), v = getV(m, popK);
        const nv = { ArrowUp: v + L[3], ArrowRight: v + L[3], ArrowDown: v - L[3], ArrowLeft: v - L[3], PageUp: v + L[2], PageDown: v - L[2], Home: L[0], End: L[1] }[e.key];
        if (nv === undefined) return;
        e.preventDefault(); change(popK, nv);
      });
      document.addEventListener('pointerdown', e => { if (root.isConnected && !pop.hidden && !pop.contains(e.target) && !e.target.closest('.nw-val')) closePop(); }, true);
      document.addEventListener('keydown', e => { if (root.isConnected && e.key === 'Escape') closePop(); });
    }
    return { el: root, update, setShow(n) { root.dataset.show = n; update(); },
      setSecret(on) { root.classList.toggle('is-secret', !!on); update(); } };
  }

  /* Die Rechnung unter dem Neuron: oben die Buchstaben, darunter dieselbe
     Stelle mit Zahlen – jede Größe in ihrer Farbe. Noch nicht Aufgedecktes
     steht grau als „?“ da. */
  const FL = '<span class="fl"><i>f</i>(<i>z</i>) =</span> ';
  const FRAC = (a, b) => `<span class="math-frac"><span class="mnum">${a}</span><span class="mden">${b}</span></span>`;
  const F_TXT = {
    perceptron: FL + '<span class="mcases"><span class="mbrace">{</span><span class="mcl"><span>1, wenn <i>z</i> &gt; 0</span><span>0, sonst</span></span></span>',
    linear: FL + '<i>z</i>',
    relu: FL + 'max(0, <i>z</i>)',
    sigmoid: FL + `${FRAC('1', '1 + e<sup>−<i>z</i></sup>')}`,
    tanh: FL + `${FRAC('e<sup><i>z</i></sup> − e<sup>−<i>z</i></sup>', 'e<sup><i>z</i></sup> + e<sup>−<i>z</i></sup>')}`,
  };
  function calcHTML(m, show) {
    const z = zOf(m), fire = z > 0, t = m.type;
    const par = v => v < 0 ? `(${num(v)})` : num(v);
    const g = (ok, html) => ok ? html : '<span class="q">?</span>';
    const cell = (cls, top, bot, ok = true) => `<span class="mc ${cls}${ok ? '' : ' is-ghost'}"><span>${top}</span><span>${g(ok, bot)}</span></span>`;
    const op = s => `<span class="mc mo"><span>${s}</span><span>${s}</span></span>`;
    const W = show >= 2, B = show >= 3, F = show >= 4;
    const zRow = [
      cell('c-z', '<i>z</i>', '<i>z</i>'), op('='),
      cell('c-x', '<i>x</i><sub>1</sub>', par(m.x[0])), op('·'), cell('c-w', '<i>w</i><sub>1</sub>', par(m.w[0]), W), op('+'),
      cell('c-x', '<i>x</i><sub>2</sub>', par(m.x[1])), op('·'), cell('c-w', '<i>w</i><sub>2</sub>', par(m.w[1]), W), op('+'),
      cell('c-b', '<i>b</i>', par(m.b), B), op('='), cell('c-z res', '', `<b>${num(z)}</b>`, B),
    ].join('');
    const yv = t === 'perceptron' ? (fire ? 1 : 0) : num(yOf(m, z));
    const why = !F ? '' : t === 'perceptron' ? `<span class="mwhy">weil <i>z</i> ${fire ? '&gt;' : '≤'} 0</span>` : '';
    const yRow = [
      cell('c-y', '<i>y</i>', '<i>y</i>'), op('='), cell('c-f', '<i>f</i>(<i>z</i>)', `<i>f</i>(${num(z)})`, F), op('='),
      cell('c-y res', '', `<b>${yv}</b>`), why,
    ].join('');
    return `<div class="mrow">${zRow}</div><div class="mrow">${yRow}</div>`;
  }

  const TEXT = {
    in: { p: 'Wir schauen uns <b>ein</b> künstliches Neuron an. Noch ist das meiste grau – das decken wir Stück für Stück auf. Klar ist schon: Links gehen <b class="t-x">Eingänge</b> hinein, beliebige Zahlen. Ein echtes Neuron hat oft sehr viele Eingänge – <b>als Beispiel schauen wir uns hier nur zwei an</b>: <i class="m">x</i><sub>1</sub> und <i class="m">x</i><sub>2</sub>. Rechts kommt eine Antwort heraus: <b class="t-y">1 = feuert</b> oder <b>0 = feuert nicht</b>.',
      t: 'Ändere die Eingänge mit <b>+</b> und <b>−</b> oder tippe auf die Zahl. Wann feuert das Neuron?' },
    w: { p: 'Jede Leitung hat ein <b class="t-w">Gewicht w</b>. Der Eingang wird mit dem Gewicht <b>multipliziert</b>. Großes Gewicht = <b>dicke Leitung</b> = der Eingang ist wichtig. Gewicht 0 = der Eingang ist egal. Negatives Gewicht = <b class="t-neg">rote Leitung</b> = der Eingang bremst.',
      t: 'Stell <i class="m">w</i><sub>2</sub> auf 0. Was bewirkt <i class="m">x</i><sub>2</sub> jetzt noch?' },
    b: { p: 'Im Neuron wird alles <b>zusammengezählt</b> (Σ) – und der <b class="t-b">Bias b</b> kommt noch dazu. Das Ergebnis heißt <i class="m">z</i>. Der Bias ist die Grundeinstellung des Neurons: Ein negativer Bias macht es schwerer zu feuern, ein positiver leichter.',
      t: 'Stell den Bias so ein, dass das Neuron gerade eben noch feuert.' },
    act: { p: 'Zum Schluss entscheidet die <b>Aktivierungsfunktion</b> <i class="m">f</i>: Ist <i class="m">z</i> größer als 0, kommt <b class="t-y">1</b> heraus, sonst <b>0</b>. Unser Neuron nimmt dafür eine <b>Treppe</b> – der Punkt zeigt, wo <i class="m">z</i> gerade liegt.',
      t: 'Jetzt ist das Neuron ganz aufgedeckt. Rechne einmal selbst nach – stimmt die Rechnung unten?' },
  };

  /* Ebene: x₁ nach rechts, x₂ nach oben (Bereich m.dom). Gelb = hier feuert
     das Neuron; bei weichen Typen zeigt die Stärke der Farbe die Ausgabe.
     Ziehen: Punkt = Eingänge, Gerade = Bias (parallel schieben), runde
     Griffe = Gewichte (drehen). Gerechnet wird in „Einheiten“ u = −1 … 1
     je Achse, damit Griffe und Abstände auf dem Bild stimmen, auch wenn
     die Achsen verschieden lang sind (Pinguine: 30 mm breit, 9 mm hoch). */
  function makePlane(m, o) {
    const wrap = h('<div class="nw-plane"><canvas></canvas></div>');
    const cv = wrap.querySelector('canvas');
    let G = null, drag = null;
    const css = n => NLTheme.var(n) || '#888';
    const off = document.createElement('canvas');
    const C = [0, 1].map(i => (m.dom[i][0] + m.dom[i][1]) / 2), H = [0, 1].map(i => (m.dom[i][1] - m.dom[i][0]) / 2);
    const toU = p => [(p[0] - C[0]) / H[0], (p[1] - C[1]) / H[1]];
    const fromU = u => [C[0] + u[0] * H[0], C[1] + u[1] * H[1]];
    const lineU = () => { const a = m.w[0] * H[0], c = m.w[1] * H[1]; return [a, c, m.w[0] * C[0] + m.w[1] * C[1] + m.b]; };
    const pivotOf = () => { const [a, c, d] = lineU(), q = a * a + c * c || 1; return fromU([-d * a / q, -d * c / q]); };
    const handles = P => {
      const [a, c] = lineU(), L = Math.hypot(a, c) || 1, d = [-c / L, a / L], u = toU(P);
      return [fromU([u[0] + d[0] * 0.52, u[1] + d[1] * 0.52]), fromU([u[0] - d[0] * 0.52, u[1] - d[1] * 0.52])];
    };
    const inDom = p => p[0] >= m.dom[0][0] - 1e-9 && p[0] <= m.dom[0][1] + 1e-9 && p[1] >= m.dom[1][0] - 1e-9 && p[1] <= m.dom[1][1] + 1e-9;
    const snap = v => Math.round(v / m.snap) * m.snap;
    const clampX = p => [clampK(m, 'x1', r2(snap(p[0]))), clampK(m, 'x2', r2(snap(p[1])))];
    function draw() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const Wc = cv.clientWidth || 360, Hc = cv.clientHeight || 360;
      cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const named = !!m.axes;
      const padL = named ? 44 : 30, padB = named ? 36 : 10, oy = 8;
      const S = Math.min(Wc - padL - 10, Hc - padB - oy), ox = padL;
      const X = v => ox + (v - m.dom[0][0]) / (2 * H[0]) * S, Y = v => oy + (m.dom[1][1] - v) / (2 * H[1]) * S;
      const iX = px => m.dom[0][0] + (px - ox) / S * 2 * H[0], iY = py => m.dom[1][1] - (py - oy) / S * 2 * H[1];
      G = { X, Y, iX, iY, S };
      const t = m.type, zf = (a, d) => m.w[0] * a + m.w[1] * d + m.b;
      // Flächen: klein vorrechnen, weich hochskaliert (keine Nähte)
      const n = Math.max(8, Math.round(S / 3)), img = new ImageData(n, n);
      const bc = css('surface-2'), base = rgbOf(bc), gd = rgbOf(css('gold'), bc), gdim = rgbOf(css('gold-dim'), bc), ng = rgbOf(css('ink-faint'), bc);
      const corners = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([i, j]) => Math.abs(zf(m.dom[0][i], m.dom[1][j])));
      const zMax = Math.max(1, ...corners);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const z = zf(m.dom[0][0] + (i + 0.5) / n * 2 * H[0], m.dom[1][1] - (j + 0.5) / n * 2 * H[1]);
        let col = base, a = 0;
        if (t === 'perceptron') { if (z > 0) { col = gdim; a = 1; } }
        else {
          const y = activations[t].fn(z), fr = t === 'sigmoid' || t === 'tanh' ? y : y / zMax;
          a = Math.min(1, Math.abs(fr)) * (fr > 0 ? 0.42 : 0.3); col = fr > 0 ? gd : ng;
        }
        const k = (j * n + i) * 4;
        for (let q = 0; q < 3; q++) img.data[k + q] = Math.round(base[q] + (col[q] - base[q]) * a);
        img.data[k + 3] = 255;
      }
      off.width = off.height = n; off.getContext('2d').putImageData(img, 0, 0);
      c.imageSmoothingEnabled = t !== 'perceptron';
      c.drawImage(off, ox, oy, S, S);
      c.imageSmoothingEnabled = true;
      // Raster, Achsen, Zahlen
      c.lineWidth = 1; c.strokeStyle = css('line-soft');
      const tk = (i, f) => { for (let v = Math.ceil(m.dom[i][0] / m.ticks[i][0]) * m.ticks[i][0]; v <= m.dom[i][1] + 1e-9; v += m.ticks[i][0]) f(r2(v)); };
      tk(0, v => { c.beginPath(); c.moveTo(X(v), oy); c.lineTo(X(v), oy + S); c.stroke(); });
      tk(1, v => { c.beginPath(); c.moveTo(ox, Y(v)); c.lineTo(ox + S, Y(v)); c.stroke(); });
      c.fillStyle = css('ink-faint'); c.font = '11px "JetBrains Mono", monospace';
      const lab = (i, v) => v !== 0 && Math.abs(v / m.ticks[i][1] - Math.round(v / m.ticks[i][1])) < 1e-6;
      if (named) {
        c.strokeStyle = css('ink-faint'); c.lineWidth = 1.2; c.strokeRect(ox, oy, S, S);
        c.textAlign = 'center'; tk(0, v => { if (lab(0, v)) c.fillText(num(v), X(v), oy + S + 14); });
        c.textAlign = 'right'; tk(1, v => { if (lab(1, v)) c.fillText(num(v), ox - 5, Y(v) + 4); });
        c.fillStyle = css('in-ink'); c.font = '600 12px "Nunito", system-ui, sans-serif';
        c.textAlign = 'center'; c.fillText(m.axes[0] + '  (x₁)', ox + S / 2, oy + S + 30);
        c.save(); c.translate(13, oy + S / 2); c.rotate(-Math.PI / 2); c.fillText(m.axes[1] + '  (x₂)', 0, 0); c.restore();
      } else {
        c.strokeStyle = css('ink-faint'); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(X(m.dom[0][0]), Y(0)); c.lineTo(X(m.dom[0][1]), Y(0)); c.moveTo(X(0), Y(m.dom[1][0])); c.lineTo(X(0), Y(m.dom[1][1])); c.stroke();
        c.textAlign = 'center'; tk(0, v => { if (lab(0, v)) c.fillText(num(v), X(v), Y(0) + 14); });
        c.textAlign = 'right'; tk(1, v => { if (lab(1, v)) c.fillText(num(v), X(0) - 5, Y(v) + 4); });
        c.fillStyle = css('in-ink'); c.font = 'italic 16px "KaTeX Math", serif';
        c.textAlign = 'right'; c.fillText('x₁', ox + S - 4, Y(0) - 8);
        c.textAlign = 'left'; c.fillText('x₂', X(0) + 8, oy + 16);
      }
      // Gerade z = 0
      const [w1, w2] = m.w, b = m.b, pts = [];
      if (Math.abs(w2) > 1e-9) m.dom[0].forEach(a => { const d = -(w1 * a + b) / w2; if (inDom([a, d])) pts.push([a, d]); });
      if (Math.abs(w1) > 1e-9) m.dom[1].forEach(d => { const a = -(w2 * d + b) / w1; if (inDom([a, d])) pts.push([a, d]); });
      c.save(); c.beginPath(); c.rect(ox, oy, S, S); c.clip();
      if (pts.length >= 2) {
        c.strokeStyle = css('ink'); c.lineWidth = drag && drag.m === 'shift' ? 5 : 3.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(X(pts[0][0]), Y(pts[0][1])); c.lineTo(X(pts[1][0]), Y(pts[1][1])); c.stroke();
        // Pfeil zur Feuer-Seite (Richtung auf dem Bild)
        const P = drag && drag.P || pivotOf();
        const M = inDom(P) ? P : [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
        const [a, cc] = lineU(), L = Math.hypot(a, cc) || 1, nx = a / L * 32, ny = -cc / L * 32;
        const mx = X(M[0]), my = Y(M[1]);
        c.strokeStyle = css('gold'); c.fillStyle = css('gold'); c.lineWidth = 3;
        c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + nx, my + ny); c.stroke();
        const an = Math.atan2(ny, nx);
        c.beginPath(); c.moveTo(mx + nx * 1.3, my + ny * 1.3);
        c.lineTo(mx + nx - 8 * Math.sin(an), my + ny + 8 * Math.cos(an));
        c.lineTo(mx + nx + 8 * Math.sin(an), my + ny - 8 * Math.cos(an)); c.closePath(); c.fill();
        handles(P).forEach(q => {
          if (!inDom(q)) return;
          c.beginPath(); c.arc(X(q[0]), Y(q[1]), 9, 0, Math.PI * 2);
          c.fillStyle = css('accent'); c.fill(); c.lineWidth = 2.5; c.strokeStyle = css('surface'); c.stroke();
          c.beginPath(); c.arc(X(q[0]), Y(q[1]), 4.5, 0.4, Math.PI * 1.6); c.strokeStyle = css('on-accent'); c.lineWidth = 1.6; c.stroke();
        });
      }
      // Datenpunkte: soll feuern = goldenes Dreieck, soll nicht = weißer Kreis
      (m.points || []).forEach(p => {
        const ok = (zf(p.x[0], p.x[1]) > 0 ? 1 : 0) === p.soll, px = X(p.x[0]), py = Y(p.x[1]);
        c.beginPath();
        if (p.soll) { c.moveTo(px, py - 8.5); c.lineTo(px + 8, py + 6); c.lineTo(px - 8, py + 6); c.closePath(); }
        else c.arc(px, py, 6.5, 0, Math.PI * 2);
        c.fillStyle = p.soll ? css('gold') : css('surface'); c.fill();
        c.lineWidth = 2; c.strokeStyle = p.soll ? css('surface') : css('ink-soft'); c.stroke();
        if (!ok) { c.beginPath(); c.arc(px, py, 12, 0, Math.PI * 2); c.strokeStyle = css('neg'); c.lineWidth = 2.2; c.stroke(); }
      });
      c.restore();
      // Eingänge als Punkt
      const [ax, ay] = [X(m.x[0]), Y(m.x[1])];
      c.strokeStyle = css('in'); c.lineWidth = 3;
      c.beginPath(); c.arc(ax, ay, 11, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(ax - 16, ay); c.lineTo(ax - 6, ay); c.moveTo(ax + 6, ay); c.lineTo(ax + 16, ay);
      c.moveTo(ax, ay - 16); c.lineTo(ax, ay - 6); c.moveTo(ax, ay + 6); c.lineTo(ax, ay + 16); c.stroke();
      c.fillStyle = css('in-ink'); c.font = '600 12px "JetBrains Mono", monospace';
      c.textAlign = ax > ox + S - 100 ? 'right' : 'left';
      c.fillText(`(${num(m.x[0])} | ${num(m.x[1])})`, ax + (c.textAlign === 'left' ? 15 : -15), ay < oy + 24 ? ay + 26 : ay - 14);
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const near = (px, py, q, r) => Math.hypot(G.X(q[0]) - px, G.Y(q[1]) - py) < r;
    const lineDist = (px, py) => { const [a, c, d] = lineU(), u = toU([G.iX(px), G.iY(py)]); return Math.abs(a * u[0] + c * u[1] + d) / (Math.hypot(a, c) || 1) * G.S / 2; };
    function hover(px, py) {
      if (!G) return '';
      if (near(px, py, m.x, 20)) return 'move';
      if (handles(pivotOf()).some(q => near(px, py, q, 18))) return 'grab';
      if (lineDist(px, py) < 12) return 'ns-resize';
      return m.points ? 'pointer' : 'crosshair';
    }
    cv.addEventListener('pointermove', e => {
      const [px, py] = pos(e);
      if (!drag) { cv.style.cursor = hover(px, py); return; }
      const a = G.iX(px), d = G.iY(py);
      if (drag.m === 'pt') m.x = clampX([a, d]);
      else if (drag.m === 'shift') m.b = r2(clampK(m, 'b', drag.b0 - m.w[0] * (a - drag.a0) - m.w[1] * (d - drag.d0)));
      else if (drag.m === 'rot') {
        // Gerade durch den Drehpunkt und den Finger, |w| bleibt
        const vx = (a - drag.P[0]) * drag.sg, vy = (d - drag.P[1]) * drag.sg;
        const uL = Math.hypot(vx / H[0], vy / H[1]);
        if (uL < 0.06) return;
        const L = Math.hypot(vx, vy);
        m.w = [r2(clampK(m, 'w', vy / L * drag.len)), r2(clampK(m, 'w', -vx / L * drag.len))];
        m.b = r2(clampK(m, 'b', -(m.w[0] * drag.P[0] + m.w[1] * drag.P[1])));
      }
      o.onChange();
    });
    cv.addEventListener('pointerdown', e => {
      if (!G) return;
      const [px, py] = pos(e);
      const a = G.iX(px), d = G.iY(py);
      const P = pivotOf(), hi = handles(P).findIndex(q => near(px, py, q, 18));
      if (near(px, py, m.x, 20)) drag = { m: 'pt' };
      else if (hi >= 0) drag = { m: 'rot', P, sg: hi ? -1 : 1, len: Math.max(0.2, Math.hypot(...m.w)) };
      else if (lineDist(px, py) < 12) drag = { m: 'shift', b0: m.b, a0: a, d0: d };
      else if (m.points) {
        let best = null, bd = 22;
        m.points.forEach(p => { const dd = Math.hypot(G.X(p.x[0]) - px, G.Y(p.x[1]) - py); if (dd < bd) { bd = dd; best = p; } });
        if (best) { m.x = best.x.slice(); o.onChange(); }
        return;
      } else { drag = { m: 'pt' }; m.x = clampX([a, d]); o.onChange(); }
      cv.setPointerCapture(e.pointerId);
      if (drag.m === 'rot') cv.style.cursor = 'grabbing';
    });
    const end = () => { if (drag) { drag = null; draw(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    new ResizeObserver(() => { if (cv.isConnected) draw(); }).observe(cv);
    document.addEventListener('nl:theme-redraw', () => { if (cv.isConnected) draw(); });
    return { el: wrap, draw };
  }

  /* CSS-Farbe → [r, g, b] über einer Grundfarbe (1×1-Canvas, versteht hex, rgb(a), Namen) */
  const rgbCv = document.createElement('canvas'); rgbCv.width = rgbCv.height = 1;
  const rgbCache = {};
  function rgbOf(col, under = '#fff') {
    const key = col + '|' + under;
    if (rgbCache[key]) return rgbCache[key];
    const c = rgbCv.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, 1, 1); c.fillStyle = under; c.fillRect(0, 0, 1, 1); c.fillStyle = col; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return (rgbCache[key] = [d[0], d[1], d[2]]);
  }
  const rightOf = m => (m.points || []).filter(p => ((zOf(m, p.x) > 0) ? 1 : 0) === p.soll).length;
  const PENG_IMG = '../Nebeltal/img/frei/';
  const pengLegend = () => `<p class="nw-legend nw-peng"><span><img src="${PENG_IMG}chin_1.webp" alt=""><i class="lg-tri"></i><span><b>Zügelpinguin</b><br>soll feuern</span></span><span><img src="${PENG_IMG}adelie_1.webp" alt=""><i class="lg-dot"></i><span><b>Adeliepinguin</b><br>soll nicht feuern</span></span></p>`;
  const dragLegend = '<p class="nw-legend"><span><i class="lg-pt"></i>Punkt ziehen = Eingänge</span><span><i class="lg-line"></i>Gerade schieben = Bias</span><span><i class="lg-rot"></i>Griff drehen = Gewichte</span></p>';

  /* Neuron links (mit Rechnung), Ebene rechts – beides verändert dasselbe.
     Für Schritt 6/7 und die Detailseite von „Alle Neuronen“. */
  function splitView(m, o = {}) {
    const calc = h('<div class="nw-calc m"></div>');
    const msg = h('<p class="nn-task-msg"></p>');
    let N = null, PL = null;
    const sync = () => {
      N.update(); PL.draw(); calc.innerHTML = calcHTML(m, 4);
      if (!m.points) return;
      const ok = rightOf(m), n = m.points.length;
      msg.className = 'nn-task-msg' + (ok === n ? ' ok' : '');
      msg.innerHTML = ok === n ? `<b>${ok} von ${n} richtig</b> – das Neuron hält alle Pinguine auseinander.`
        : `<b>${ok} von ${n} richtig.</b> Rot umkreiste Pinguine landen auf der falschen Seite.`;
    };
    N = makeNeuron(m, { onChange: sync, typed: o.typed, outText: o.outText });
    N.setShow(4);
    PL = makePlane(m, { onChange: sync });
    const grid = h('<div class="nw-split"><div class="nw-left"></div><div class="nw-right"></div></div>');
    grid.children[0].append(N.el, calc);
    grid.children[1].append(PL.el);
    if (m.points) grid.children[1].append(h(pengLegend()), msg);
    grid.children[1].append(h(dragLegend));
    requestAnimationFrame(sync);
    sync();
    return grid;
  }

  const PAIRS = [
    { k: 'in', bio: 'Dendriten', kn: 'Eingänge x', t: 'Die Dendriten nehmen Signale anderer Zellen auf. Beim künstlichen Neuron kommen hier Zahlen herein: x₁, x₂ …' },
    { k: 'w', bio: 'Synapsen', kn: 'Gewichte w', t: 'Manche Synapsen leiten stark, manche schwach, manche hemmen. Das Gewicht sagt, wie wichtig ein Eingang ist – dicke Leitung = wichtig, rot = bremst.' },
    { k: 'sum', bio: 'Zellkörper', kn: 'Summe Σ', t: 'Im Zellkörper laufen alle Signale zusammen. Das Neuron multipliziert jeden Eingang mit seinem Gewicht und zählt alles zusammen.' },
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
    ABS.type = 'perceptron';
    const N = makeNeuron(ABS, { fixed: true, many: true });
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
    const N = makeNeuron(ABS, { onChange: () => { calc.innerHTML = calcHTML(ABS, S.show); } });
    // Vom letzten Stand aus aufdecken, damit man sieht, was neu dazukommt
    N.setShow(Math.min(lastShow || S.show, S.show));
    requestAnimationFrame(() => requestAnimationFrame(() => N.setShow(S.show)));
    lastShow = S.show;
    calc.innerHTML = calcHTML(ABS, S.show);
    card.append(h('<div class="nw-stage"></div>'), calc, h(`<p class="nn-try"><b>Probier:</b> ${T.t}</p>`));
    card.querySelector('.nw-stage').appendChild(N.el);
  }

  /* Schritt 6: die Gerade (Zahlen −5 … 5) · Schritt 7: echte Pinguine */
  function buildPlane(card, S) {
    lastShow = 4;
    if (S.id === 'line') {
      card.appendChild(h('<p class="nn-lead-p">Mit zwei Eingängen ist jede Eingabe ein <b class="t-x">Punkt</b> (<i class="m">x</i><sub>1</sub> | <i class="m">x</i><sub>2</sub>). Für jeden Punkt kann man fragen: Feuert das Neuron hier? <b class="t-y">Gelb</b> = ja. Die Grenze ist immer eine <b>Gerade</b> – genau dort ist <i class="m">z</i> = 0. Die <b class="t-w">Gewichte drehen</b> die Gerade, der <b class="t-b">Bias schiebt</b> sie.</p>'));
      card.appendChild(splitView(ABS));
      card.appendChild(h('<p class="nn-try"><b>Probier:</b> Stell <i class="m">w</i><sub>1</sub> auf 0 – wie liegt die Gerade jetzt? Und was passiert, wenn du nur den Bias änderst?</p>'));
      return;
    }
    PENG.type = 'perceptron';
    card.appendChild(h(`<p class="nn-lead-p">Jetzt mit <b>echten Werten</b>: 30 Pinguine aus der Antarktis wurden vermessen – <b class="t-x">Schnabellänge</b> und <b class="t-x">Schnabelhöhe</b> in Millimetern. Jeder Pinguin ist ein Punkt. Das Neuron soll entscheiden: <b class="t-y">Zügelpinguin</b> (feuert) oder <b>Adeliepinguin</b> (feuert nicht)? Mit den <b class="t-w">richtigen Gewichten</b> und dem <b class="t-b">richtigen Bias</b> schafft es das – und trennt so zwei Arten. <b>Tippe einen Pinguin an</b>: Dann geht er als Eingabe ins Neuron.</p>`));
    card.appendChild(splitView(PENG));
    card.appendChild(h(`<div class="nn-summary"><b>Das Wichtigste</b><ul>
      <li>Ein Neuron <b>multipliziert</b> jeden <b>Eingang</b> mit seinem <b>Gewicht</b>, zählt alles zusammen und den <b>Bias</b> dazu: <i class="m">z</i>.</li>
      <li>Die <b>Aktivierung</b> entscheidet: Ist <i class="m">z</i> größer als 0, feuert das Neuron.</li>
      <li>Mit zwei Eingängen zieht ein Neuron <b>eine Gerade</b>. Mit den richtigen Gewichten und dem richtigen Bias trennt sie zwei Gruppen – das Neuron trifft eine <b>Entscheidung</b>.</li>
      <li>Die Schnabellänge allein reicht hier nicht: Erst <b>beide Eingänge zusammen</b> trennen alle Pinguine.</li></ul></div>`));
  }

  function renderWie(page, api) {
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
    // Übergang: das Perzeptron war das einfachste Neuron – welche gibt es noch?
    if (step === 'data') {
      const canTypen = api.tabs.some(t => t.id === 'n-typen');
      const nx = h(`<section class="nn-card nn-next"><div><h3>Das war das einfachste Neuron: das <span class="t-perc">Perzeptron</span>.</h3>
        <p>Es kennt nur 0 oder 1. Welche Neuronen gibt es noch – und was machen sie mit denselben Pinguinen anders?</p></div></section>`);
      if (canTypen) { const b = h('<button type="button" class="nn-btn primary">Alle Neuronen ›</button>'); b.onclick = () => { typSel = null; api.go('n-typen'); }; nx.appendChild(b); }
      else nx.querySelector('p').insertAdjacentHTML('beforeend', ' <i>(Gibt deine Lehrkraft frei.)</i>');
      page.appendChild(nx);
    }
    function again() { page.innerHTML = ''; renderWie(page, api); page.closest('#neuron-page').scrollTop = 0; }
  }

  /* ── Reiter 2: Alle Neuronen (20.11.2026) ────────────────────
     Übersicht: je Typ eine kleine Karte (Kurve, Ausgabe, ein Satz).
     Antippen = derselbe Aufbau wie Schritt 7 (Pinguine) mit diesem Typ;
     oben umschalten, die Gewichte bleiben – so sieht man den Unterschied. */
  const KURZ = {
    perceptron: 'Schaltet hart um: 1, wenn z > 0, sonst 0 – wie ein Lichtschalter.',
    linear: 'Gibt z unverändert weiter – jede Zahl kann herauskommen.',
    relu: 'Negatives wird 0, Positives bleibt, wie es ist.',
    sigmoid: 'Eine weiche Stufe von 0 bis 1 – zeigt, wie sicher sich das Neuron ist.',
    tanh: 'Wie Sigmoid, aber von −1 bis 1 und mit der Mitte bei 0.',
  };
  const ANDERS = {
    perceptron: 'Das kennst du schon: Gelb oder nicht gelb, dazwischen gibt es nichts.',
    linear: 'Die Gerade ist dieselbe. Aber die Ausgabe ist einfach <i class="m">z</i>: je weiter ein Pinguin von der Geraden weg ist, desto größer die Zahl – auf der anderen Seite negativ (grau).',
    relu: 'Die Gerade ist dieselbe. Auf der einen Seite kommt immer 0 heraus, auf der anderen wächst die Zahl, je weiter der Pinguin von der Geraden weg ist.',
    sigmoid: 'Die Gerade ist dieselbe – dort ist die Ausgabe genau 0,5. Nah an der Geraden ist sich das Neuron unsicher (blasses Gelb), weit weg ganz sicher.',
    tanh: 'Die Gerade ist dieselbe – dort ist die Ausgabe 0. Auf der einen Seite geht sie bis 1, auf der anderen bis −1 (grau).',
  };
  /* Für komplexe (tiefe) Netze geeignet? 0 = kaum … 3 = sehr gut */
  const DEEP = {
    perceptron: [0, 'kaum', 'Die Treppe ist überall flach – daran kann ein großes Netz nicht lernen.'],
    linear: [1, 'nur als Ausgang', 'Viele davon hintereinander rechnen nicht mehr als ein einziges.'],
    relu: [3, 'sehr gut', 'Der Standard in großen Netzen – schnell und lernt auch über viele Schichten.'],
    sigmoid: [1, 'eher als Ausgang', 'Gut für die letzte Antwort, in vielen Schichten lernt es langsam.'],
    tanh: [2, 'gut', 'Gut in verdeckten Schichten, besser als Sigmoid.'],
  };
  const deepHTML = (k, full) => { const [n, w, t] = DEEP[k];
    return `<span class="nt-deep" data-lvl="${n}"><b>Für komplexe Netze: <span class="nt-dots">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span> ${w}</b>${full ? `<span>${t}</span>` : ''}</span>`; };
  let typSel = null;
  /* Große Kurve für die Karten: Achsen mit z und f(z), Werte an der y-Achse */
  function bigCurve(k) {
    const [lo, hi] = FY[k], X = z => 22 + (z + 4) / 8 * 140, Y = v => 10 + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * 74;
    let d = '';
    if (k === 'perceptron') d = `M${X(-4)} ${Y(0)} H${X(0)} V${Y(1)} H${X(4)}`;
    else for (let i = 0; i <= 64; i++) { const z = -4 + i / 8; d += (i ? 'L' : 'M') + X(z).toFixed(1) + ' ' + Y(activations[k].fn(z)).toFixed(1); }
    const ticks = [...new Set([hi, 0, lo])].filter(v => v >= lo && v <= hi);
    const lab = v => num(v);
    return `<svg viewBox="0 0 170 100" class="nt-curve">
      ${ticks.map(v => `<line x1="${X(-4)}" x2="${X(4)}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'ax' : 'gr'}"/><text x="16" y="${Y(v) + 3.5}" text-anchor="end" class="tk">${lab(v)}</text>`).join('')}
      <line x1="${X(0)}" y1="6" x2="${X(0)}" y2="88" class="ax"/>
      <text x="${X(4) + 2}" y="${Y(0) - 4}" text-anchor="end" class="al">z</text>
      <path d="${d}" style="stroke:${activations[k].color}"/></svg>`;
  }
  function renderTypen(page, api) {
    if (typSel) return renderTyp(page, api);
    page.appendChild(h(`<section class="nn-card nn-lead"><h2>Alle Neuronen</h2>
      <p>Alle Neuronen rechnen zuerst gleich: <span class="m nn-zf"><i class="t-z">z</i> = <i class="t-x">x</i><sub>1</sub>·<i class="t-w">w</i><sub>1</sub> + <i class="t-x">x</i><sub>2</sub>·<i class="t-w">w</i><sub>2</sub> + <i class="t-b">b</i></span>.
      Sie unterscheiden sich nur in der <b>Aktivierung</b> <i class="m">f</i> – also darin, was sie aus <i class="m">z</i> machen. <b>Tippe ein Neuron an</b> und probier es an den Pinguinen aus.</p></section>`));
    const grid = h('<div class="nt-grid"></div>');
    ORDER.forEach(k => {
      const act = activations[k];
      const c = h(`<button type="button" class="nn-card nt-card" data-type="${k}" style="--type-color:${act.color}">
        <span class="nt-head"><b>${act.fullName}</b>${k === 'perceptron' ? '<span class="nt-badge">kennst du schon</span>' : ''}</span>
        ${bigCurve(k)}
        <span class="nt-out">Ausgabe: <b>${INFO[k].out}</b></span>
        <span class="nt-formula m">${F_TXT[k]}</span>
        <span class="nt-txt">${KURZ[k]}</span>
        <span class="nt-go">Ausprobieren ›</span></button>`);
      c.addEventListener('click', () => { typSel = k; page.innerHTML = ''; renderTyp(page, api); page.closest('#neuron-page').scrollTop = 0; });
      grid.appendChild(c);
    });
    page.appendChild(grid);
    const fit = () => grid.querySelectorAll('.nt-formula').forEach(f => {
      let px = 19; f.style.fontSize = px + 'px';
      while (f.scrollWidth > f.clientWidth + 1 && px > 10) f.style.fontSize = (--px) + 'px';
    });
    requestAnimationFrame(fit);
    if (document.fonts) document.fonts.ready.then(fit);
    new ResizeObserver(fit).observe(grid);
  }
  function renderTyp(page, api) {
    const k = typSel, act = activations[k], I = INFO[k];
    PENG.type = k;
    const head = h('<div class="nt-bar"><button type="button" class="nn-btn nt-back">‹ Alle Neuronen</button><div class="nt-chips"></div></div>');
    head.querySelector('.nt-back').onclick = () => { typSel = null; page.innerHTML = ''; renderTypen(page, api); };
    ORDER.forEach(t => {
      const b = h(`<button type="button" class="nt-chip${t === k ? ' on' : ''}" data-type="${t}" style="--type-color:${activations[t].color}">${activations[t].fullName}</button>`);
      b.onclick = () => { typSel = t; page.innerHTML = ''; renderTyp(page, api); };
      head.querySelector('.nt-chips').appendChild(b);
    });
    page.appendChild(head);
    const outText = k === 'sigmoid' ? (fire, y) => `${Math.round(y * 100)} % Zügel` : null;
    const card = h(`<section class="nn-card nn-stepcard nt-detail" style="--type-color:${act.color}"></section>`);
    const sv = splitView(PENG, { typed: true, outText });
    sv.children[0].prepend(h(`<div class="nt-intro"><h2>Das <span class="nt-name">${act.fullName}</span>-Neuron</h2>
      <p class="nn-lead-p">${KURZ[k]} <b>Ausgabe:</b> ${I.out}. ${ANDERS[k]}</p></div>`));
    card.appendChild(sv);
    card.appendChild(h(`<div class="nt-facts"><p><b>Wofür?</b> ${I.wofuer}</p><p>${deepHTML(k, true)}</p><p class="nn-type-warn"><b>Achtung:</b> ${I.achtung}</p></div>`));
    page.appendChild(card);
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
    if (api.current === 'n-typen') renderTypen(page, api);
    else if (api.current === 'n-wie') renderWie(page, api);
    root.scrollTop = 0;
  }

  /* Bausteine auch für Bereich 2 (js/revier.js): dasselbe Neuron, dieselbe Rechnung */
  window.NLNeuron = { render, makeNeuron, calcHTML, num, parseNum };
})();
