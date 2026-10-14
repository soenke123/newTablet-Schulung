/* Wortkarte ("Bedeutung") — aus dem Prototyp (Wortwelten.html, Ebene 4) nach v2 portiert.
   Wörter mit ähnlichen Nachbarwörtern landen nah beieinander: eigenes kleines t-SNE auf den
   PPMI-Vektoren aus cooccurrence.js, gezeichnet auf ein Canvas, plus Detailkarte zum
   ausgewählten Wort (Nachbarn, "warum ähnlich?", häufige Nachbarwörter, Beispielsatz).

   Nutzung:  const map = WordMap.create(M, { highlight: () => ['maus'] });
             map.mount(container);       // baut Werkzeugleiste + Canvas + Detailkarte
             map.select('katze');        // Wort auswählen
             map.destroy();              // Animation/Resize-Listener abräumen

   Das Layout wird erst beim ersten mount() gerechnet (animiert über requestAnimationFrame),
   damit das Aufklappen der Karte die Phase nicht blockiert. */
const WordMap = (() => {
  const MAP_CAP = 180;   // nur die häufigsten Nomen — sonst ist die Karte für Schüler zu voll
  const PERP = 15;
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const tVar = t => 'var(--t-' + (THEME_NAME[t] ? t : 'eigen') + ')';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* t-SNE über eine Teilmenge der Modellwörter (ids = Indizes in M.words). */
  function makeLayout(M, ids, seed) {
    const n = ids.length, perp = Math.max(2, Math.min(PERP, (n - 1) / 3));
    const D = ids.map(i => Float64Array.from(ids, j => Math.max(0, 1 - M.sim[i][j])));
    const P = Array.from({ length: n }, () => new Float64Array(n));
    const H = Math.log(perp);
    for (let i = 0; i < n; i++) {
      let beta = 1, lo = -Infinity, hi = Infinity;
      for (let it = 0; it < 60; it++) {
        let sum = 0, hsum = 0;
        for (let j = 0; j < n; j++) { if (j === i) continue; const p = Math.exp(-D[i][j] * beta); P[i][j] = p; sum += p; hsum += D[i][j] * p; }
        sum = sum || 1e-12;
        const h = Math.log(sum) + beta * hsum / sum;
        for (let j = 0; j < n; j++) P[i][j] /= sum;
        if (Math.abs(h - H) < 1e-4) break;
        if (h > H) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; }
        else { hi = beta; beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2; }
      }
    }
    const Pj = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Pj[i][j] = Math.max((P[i][j] + P[j][i]) / (2 * n), 1e-12);
    const rnd = mulberry32(seed || 7);
    const Y = Array.from({ length: n }, () => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2]);
    const vel = Array.from({ length: n }, () => [0, 0]);
    const gains = Array.from({ length: n }, () => [1, 1]);
    let iter = 0;
    const L = { n, ids, Y, iter: 0, total: 500 };
    L.step = function () {
      const exag = iter < 100 ? 4 : 1;
      const mom = iter < 100 ? 0.5 : 0.8;
      const lr = 5;
      const num = Array.from({ length: n }, () => new Float64Array(n));
      let Z = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = Y[i][0] - Y[j][0], dy = Y[i][1] - Y[j][1];
        const q = 1 / (1 + dx * dx + dy * dy);
        num[i][j] = q; num[j][i] = q; Z += 2 * q;
      }
      for (let i = 0; i < n; i++) {
        let gx = 0, gy = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const q = num[i][j];
          const m = (exag * Pj[i][j] - q / Z) * q;
          gx += 4 * m * (Y[i][0] - Y[j][0]);
          gy += 4 * m * (Y[i][1] - Y[j][1]);
        }
        const g = [gx, gy];
        for (let d = 0; d < 2; d++) {
          gains[i][d] = (Math.sign(g[d]) === Math.sign(vel[i][d])) ? gains[i][d] * 0.8 : gains[i][d] + 0.2;
          if (gains[i][d] < 0.01) gains[i][d] = 0.01;
          vel[i][d] = mom * vel[i][d] - lr * gains[i][d] * g[d];
          Y[i][d] += vel[i][d];
        }
      }
      let mx = 0, my = 0;
      for (let i = 0; i < n; i++) { mx += Y[i][0]; my += Y[i][1]; }
      mx /= n; my /= n;
      for (let i = 0; i < n; i++) { Y[i][0] -= mx; Y[i][1] -= my; }
      iter++; L.iter = iter;
    };
    return L;
  }

  /* Filter oben auf der Karte. 'nomen' = Phase-2-Modell (Grundformen, t-SNE); die anderen rechnen mit
     wordkinds.js (Wörter wie im Text, Nachbar davor/danach). Bei den Paaren ist die Karte kein t-SNE,
     sondern eine feste Ansicht: links → rechts = mittlere Richtung aller Paare. */
  const MODES = [
    { id: 'nomen', label: 'Nomen' },
    { id: 'verben', label: 'Verben' },
    { id: 'zeiten', label: 'spielt → spielte', pairs: 'tensePairs', left: '← Gegenwart', right: 'Vergangenheit →',
      a: 'Gegenwart', b: 'Vergangenheit' },
    { id: 'paare', label: 'Lehrer → Lehrerin', pairs: 'genderPairs', left: '← der …', right: 'die … →',
      a: 'der …', b: 'die …' }
  ];
  const VERB_CAP = 120;

  function create(M0, opts) {
    opts = opts || {};
    let M = M0, mode = MODES[0], ids = [], pairs = [], A = null;
    const word = k => M.words[ids[k]];
    const posOf = w => { const i = M.wIdx.get(w); return i === undefined ? -1 : ids.indexOf(i); };
    const pairOf = w => pairs.find(p => p[0] === w || p[1] === w) || null;

    function useMode(m) {
      mode = m;
      if (m.id === 'nomen') {
        M = M0;
        ids = M.words.map((w, i) => i)
          .sort((a, b) => M.lemFreq.get(M.words[b]) - M.lemFreq.get(M.words[a]))
          .slice(0, MAP_CAP);
        pairs = [];
        return;
      }
      if (!A) A = WordKinds.analyze(opts.texts ? opts.texts() : []);
      if (m.pairs) {
        pairs = A[m.pairs];
        M = WordKinds.model(A, pairs.flat());
      } else {
        pairs = [];
        M = WordKinds.model(A, A.verbs.slice(0, VERB_CAP));
      }
      ids = M.words.map((w, i) => i);
    }
    useMode(MODES[0]);

    let L = null, seed = 7;
    let cv = null, cx = null, cw = 0, ch = 0, view = null;
    let sel = null, hover = null, colors = true, anim = 0;
    let statusEl = null, progEl = null, cardEl = null, container = null, legendEl = null;
    const onResize = () => requestAnimationFrame(resize);

    function targetView() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      L.Y.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      return { x0, x1, y0, y1 };
    }

    function screenPos() {
      const v = view, pad = 30;
      if (L.fixed) {
        const sx = (cw - 2 * pad - 70) / Math.max(1e-6, v.x1 - v.x0), sy = (ch - 2 * pad - 30) / Math.max(1e-6, v.y1 - v.y0);
        return L.Y.map(p => [pad + 35 + (p[0] - v.x0) * sx, pad + (p[1] - v.y0) * sy]);
      }
      const rot = (ch > cw) !== ((v.y1 - v.y0) > (v.x1 - v.x0));
      const rx = rot ? v.y1 - v.y0 : v.x1 - v.x0;
      const ry = rot ? v.x1 - v.x0 : v.y1 - v.y0;
      const s = Math.min((cw - 2 * pad - 50) / Math.max(1e-6, rx), (ch - 2 * pad) / Math.max(1e-6, ry));
      const ox = (cw - 50 - rx * s) / 2, oy = (ch - ry * s) / 2;
      return L.Y.map(p => {
        const a = rot ? p[1] - v.y0 : p[0] - v.x0;
        const b = rot ? p[0] - v.x0 : p[1] - v.y0;
        return [ox + a * s, oy + b * s];
      });
    }

    function resize() {
      if (!cv || !cv.isConnected) return;
      const r = cv.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      cw = r.width; ch = r.height;
      cv.width = Math.round(r.width * d);
      cv.height = Math.round(r.height * d);
      cx.setTransform(d, 0, 0, d, 0, 0);
      draw();
    }

    function highlightSet() {
      const set = new Set();
      (opts.highlight ? opts.highlight() : []).forEach(w => {
        const k = posOf(w);
        if (k >= 0) set.add(k);
      });
      return set;
    }

    function draw() {
      if (!L || !cv || !cw || !view) return;
      cx.clearRect(0, 0, cw, ch);
      const P = screenPos();
      const ink = cssVar('--ink'), muted = cssVar('--muted'), surface = cssVar('--surface'), line = cssVar('--line');
      const tcol = {};
      THEME_ORDER.forEach(t => { tcol[t] = cssVar('--t-' + t); });
      const s = sel != null ? posOf(sel) : -1;
      const nb = s >= 0 && !L.fixed ? neighbors(M, sel, 6).map(x => posOf(x[0])).filter(k => k >= 0) : [];
      const qSet = mode.id === 'nomen' ? highlightSet() : new Set();
      const colA = cssVar('--src-b'), colB = cssVar('--src-a');
      const dotColor = i => {
        const w = word(i);
        if (mode.pairs) { const p = pairOf(w); return p && p[1] === w ? colB : colA; }
        if (!colors) return muted;
        return tcol[M.themeOf(w).theme] || muted;
      };

      if (L.fixed) {
        /* Achsen-Beschriftung + ein Pfeil je Paar */
        cx.font = '600 12px "Inter", system-ui, sans-serif'; cx.fillStyle = muted;
        cx.fillText(mode.left, 10, ch - 10);
        cx.fillText(mode.right, cw - 10 - cx.measureText(mode.right).width, ch - 10);
        pairs.forEach(([a, b]) => {
          const i = posOf(a), j = posOf(b);
          if (i < 0 || j < 0) return;
          const on = sel === a || sel === b;
          const [x0, y0] = P[i], [x1, y1] = P[j];
          const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
          const ex = x1 - Math.cos(ang) * 8, ey = y1 - Math.sin(ang) * 8;
          cx.strokeStyle = on ? ink : muted; cx.fillStyle = on ? ink : muted;
          cx.globalAlpha = on ? 0.95 : 0.45; cx.lineWidth = on ? 2.5 : 1.5;
          cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(ex, ey); cx.stroke();
          if (len > 14) {
            cx.beginPath(); cx.moveTo(ex, ey);
            cx.lineTo(ex - Math.cos(ang - 0.45) * 8, ey - Math.sin(ang - 0.45) * 8);
            cx.lineTo(ex - Math.cos(ang + 0.45) * 8, ey - Math.sin(ang + 0.45) * 8);
            cx.closePath(); cx.fill();
          }
          cx.globalAlpha = 1;
        });
      }

      if (s >= 0) {
        cx.strokeStyle = ink; cx.lineWidth = 1.5; cx.globalAlpha = 0.35;
        nb.forEach(j => { cx.beginPath(); cx.moveTo(P[s][0], P[s][1]); cx.lineTo(P[j][0], P[j][1]); cx.stroke(); });
        cx.globalAlpha = 1;
      }
      for (let i = 0; i < P.length; i++) {
        const f = M.lemFreq.get(word(i)) || 1;
        const r = 3 + Math.min(4, Math.sqrt(f) * 0.7);
        cx.beginPath();
        cx.arc(P[i][0], P[i][1], r, 0, Math.PI * 2);
        cx.fillStyle = dotColor(i);
        cx.fill();
        if (qSet.has(i)) {
          cx.lineWidth = 2; cx.strokeStyle = ink; cx.setLineDash([3, 3]);
          cx.beginPath(); cx.arc(P[i][0], P[i][1], r + 4, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
        }
        if (i === s) {
          cx.lineWidth = 3; cx.strokeStyle = ink;
          cx.beginPath(); cx.arc(P[i][0], P[i][1], r + 4, 0, Math.PI * 2); cx.stroke();
        }
      }

      const placed = [];
      const fontBody = '"Inter", system-ui, sans-serif';
      function label(i, strong) {
        const txt = showWord(word(i));
        cx.font = (strong ? '700 14px ' : '12px ') + fontBody;
        const w = cx.measureText(txt).width;
        const hits = r => placed.some(q => !(r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3]));
        const spots = [[8, -7], [8, 15], [-w - 8, -7], [-w - 8, 15], [-w / 2, -12], [-w / 2, 22]];
        let x, y, rect = null;
        for (const [dx, dy] of spots) {
          const tx = P[i][0] + dx, ty = P[i][1] + dy;
          const rr = [tx - 3, ty - 13, tx + w + 3, ty + 4];
          if (rr[0] < 2 || rr[2] > cw - 2) continue;
          if (!hits(rr)) { x = tx; y = ty; rect = rr; break; }
        }
        if (!rect) {
          if (!strong) return;
          x = P[i][0] + 8; y = P[i][1] - 7;
          if (x + w > cw - 4) x = P[i][0] - w - 8;
          rect = [x - 3, y - 13, x + w + 3, y + 4];
        }
        placed.push(rect);
        if (strong) {
          cx.fillStyle = surface; cx.globalAlpha = 0.92;
          cx.beginPath();
          if (cx.roundRect) cx.roundRect(rect[0] - 2, rect[1] - 1, rect[2] - rect[0] + 4, rect[3] - rect[1] + 3, 5);
          else cx.rect(rect[0] - 2, rect[1] - 1, rect[2] - rect[0] + 4, rect[3] - rect[1] + 3);
          cx.fill(); cx.globalAlpha = 1;
          cx.strokeStyle = line; cx.lineWidth = 1; cx.stroke();
        }
        cx.fillStyle = strong ? ink : muted;
        cx.fillText(txt, x, y);
      }
      const forced = [];
      if (s >= 0) forced.push(s);
      nb.forEach(j => { if (!forced.includes(j)) forced.push(j); });
      qSet.forEach(j => { if (!forced.includes(j)) forced.push(j); });
      if (hover != null && !forced.includes(hover)) forced.push(hover);
      forced.forEach(i => label(i, true));
      for (let i = 0; i < P.length; i++) if (!forced.includes(i)) label(i, false);
    }

    function renderLegend() {
      if (!legendEl) return;
      legendEl.replaceChildren();
      const item = (color, txt) => {
        const row = el('span', 'wm-legend-item');
        const d = el('i', 'dot'); d.style.background = color;
        row.append(d, document.createTextNode(txt));
        legendEl.appendChild(row);
      };
      if (mode.pairs) {
        item('var(--src-b)', mode.a); item('var(--src-a)', mode.b);
        legendEl.appendChild(el('span', 'wm-legend-item', 'Pfeil = ein Wortpaar · Nachbarn: nur das Wort direkt davor und danach'));
        return;
      }
      const shown = new Set(ids.map(i => M.themeOf(M.words[i]).theme));
      THEME_ORDER.filter(t => shown.has(t)).forEach(t => item(tVar(t), THEME_NAME[t]));
      if (mode.id === 'verben') legendEl.appendChild(el('span', 'wm-legend-item', '· Nachbarn: nur das Wort direkt davor und danach'));
    }

    function status(txt) {
      if (statusEl) statusEl.textContent = txt;
    }
    function progress(f) {
      if (progEl) progEl.style.width = Math.round(100 * f) + '%';
    }

    function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = 0; } }

    /* Layout von vorn rechnen und beim Rechnen zusehen. */
    function animate() {
      stopAnim();
      if (mode.pairs) {
        const pr = WordKinds.projection(M, pairs);
        L = { n: pr.Y.length, ids, Y: pr.Y, iter: 1, total: 1, fixed: true };
        view = targetView(); progress(1); draw();
        status(pairs.length
          ? 'Links → rechts: die mittlere Richtung von ' + pairs.length + ' Wortpaaren. Pfeil = ein Paar.'
          : 'In den ausgewählten Texten gibt es keine solchen Wortpaare.');
        return;
      }
      L = makeLayout(M, ids, seed++);
      view = targetView();
      if (reduced()) {
        while (L.iter < L.total) L.step();
        view = targetView(); progress(1); draw();
        status('Fertig. Wörter mit ähnlichen Nachbarn liegen beieinander.');
        return;
      }
      const tick = () => {
        for (let k = 0; k < 4 && L.iter < L.total; k++) L.step();
        const t = targetView(), a = L.iter >= L.total ? 1 : 0.25;
        view.x0 += (t.x0 - view.x0) * a; view.x1 += (t.x1 - view.x1) * a;
        view.y0 += (t.y0 - view.y0) * a; view.y1 += (t.y1 - view.y1) * a;
        draw();
        progress(L.iter / L.total);
        status(L.iter < L.total
          ? 'Ordnen: Runde ' + L.iter + ' von ' + L.total + ' …'
          : 'Fertig. Wörter mit ähnlichen Nachbarn liegen beieinander.');
        if (L.iter < L.total && cv && cv.isConnected) anim = requestAnimationFrame(tick);
        else { anim = 0; while (L.iter < L.total) L.step(); view = targetView(); progress(1); draw(); }
      };
      anim = requestAnimationFrame(tick);
    }

    function hitTest(ev) {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const P = screenPos();
      let best = null, bd = 18 * 18;
      P.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } });
      return best;
    }

    function select(w) {
      if (!w || !M.wIdx.has(w) || posOf(w) < 0) return;
      sel = w;
      draw();
      renderCard();
    }
    /* Auswahl durch die Person selbst (Tipp, Suche, Nachbar) — meldet sich beim Leitfaden. */
    function pick(w) {
      select(w);
      if (sel === w && opts && opts.onSelect) opts.onSelect(w);
    }

    function exampleSentence(w) {
      for (const d of M.docs) {
        const i = d.toks.findIndex(t => t.lemma === w);
        if (i < 0) continue;
        const s = d.toks[i].sent;
        return { d, toks: d.toks.filter(t => t.sent === s) };
      }
      return null;
    }

    function renderCard() {
      if (!cardEl) return;
      cardEl.replaceChildren();
      if (!sel) { cardEl.appendChild(el('p', 'card-empty', 'Tipp ein Wort auf der Karte an.')); return; }
      const w = sel;
      const th = M.themeOf(w);

      const head = el('div', 'wm-sec');
      head.appendChild(el('span', 'eyebrow', 'Ausgewähltes Wort'));
      head.appendChild(el('div', 'wm-title', showWord(w)));
      const tot = Object.values(th.counts).reduce((a, b) => a + b, 0);
      const dist = el('div', 'wm-dist');
      const parts = [];
      THEME_ORDER.forEach(t => {
        const c = th.counts[t];
        if (!c) return;
        const i = el('i');
        i.style.width = (100 * c / tot) + '%';
        i.style.background = tVar(t);
        dist.appendChild(i);
        parts.push(c + '× ' + THEME_NAME[t]);
      });
      head.appendChild(dist);
      head.appendChild(el('p', 'small muted', 'Kommt ' + tot + '-mal vor: ' + parts.join(', ') + '.'));
      cardEl.appendChild(head);

      const pr = pairOf(w);
      if (pr) {
        const other = pr[0] === w ? pr[1] : pr[0];
        const sec0 = el('div', 'wm-sec');
        sec0.appendChild(el('h4', null, 'Wort-Rechnen'));
        const guess = WordKinds.predict(M, pairs, w);
        const fwd = pr[0] === w;
        sec0.appendChild(el('p', 'small', showWord(w) + (fwd ? ' + Richtung „' + mode.a + ' → ' + mode.b + '“'
          : ' + Richtung „' + mode.b + ' → ' + mode.a + '“') + ' ≈ …'));
        const row = el('div', 'wm-chips');
        guess.forEach(([x, sv], k) => {
          const chip = el('button', 'chip' + (x === other ? ' wm-hit' : ''), showWord(x));
          chip.type = 'button';
          chip.appendChild(el('span', 'small muted', ' ' + Math.round(sv * 100) + ' %'));
          chip.addEventListener('click', () => pick(x));
          row.appendChild(chip);
        });
        sec0.appendChild(row);
        const ok = guess.length && guess[0][0] === other;
        sec0.appendChild(el('p', 'small ' + (ok ? 'wm-ok' : 'muted'), ok
          ? '✓ Getroffen: „' + showWord(other) + '“.'
          : 'Gesucht war „' + showWord(other) + '“ — dafür reichen die Texte hier nicht.'));
        cardEl.appendChild(sec0);
      }

      const nbs = neighbors(M, w, 6);
      const sec = el('div', 'wm-sec');
      sec.appendChild(el('h4', null, 'Am ähnlichsten'));
      nbs.forEach(([x, s]) => {
        const b = el('button', 'wm-nb');
        b.type = 'button';
        const name = el('b');
        const dot = el('i', 'dot');
        dot.style.background = tVar(M.themeOf(x).theme);
        name.append(dot, document.createTextNode(showWord(x)));
        const bar = el('span', 'bar');
        const fill = el('i');
        fill.style.width = Math.max(2, s * 100) + '%';
        fill.style.background = 'var(--cat-meaning)';
        bar.appendChild(fill);
        b.append(name, bar, el('span', 'num', Math.round(s * 100) + ' %'));
        b.addEventListener('click', () => pick(x));
        sec.appendChild(b);
      });
      cardEl.appendChild(sec);

      if (nbs.length) {
        const shared = sharedContexts(M, w, nbs[0][0], 5).map(showWord);
        const why = el('div', 'why');
        why.appendChild(el('b', null, '🔍 Warum ähnlich?'));
        why.appendChild(el('p', null, shared.length
          ? '„' + showWord(w) + '“ und „' + showWord(nbs[0][0]) + '“ stehen beide oft neben: ' + shared.join(', ') + '.'
          : '„' + showWord(w) + '“ hat kaum gemeinsame Nachbarn.'));
        cardEl.appendChild(why);
      }

      const ctxs = topContexts(M, w, 8);
      if (ctxs.length) {
        const sec2 = el('div', 'wm-sec');
        sec2.appendChild(el('h4', null, 'Steht oft neben'));
        const chips = el('div', 'wm-chips');
        ctxs.forEach(([x, c]) => {
          const isWord = posOf(x) >= 0;
          const chip = el(isWord ? 'button' : 'span', 'chip', showWord(x));
          chip.appendChild(el('span', 'small muted', ' ×' + c));
          if (isWord) { chip.type = 'button'; chip.addEventListener('click', () => pick(x)); }
          chips.appendChild(chip);
        });
        sec2.appendChild(chips);
        cardEl.appendChild(sec2);
      }

      const ex = exampleSentence(w);
      if (ex) {
        const sec3 = el('div', 'wm-sec');
        sec3.appendChild(el('h4', null, 'Beispiel aus „' + ex.d.title + '“'));
        const p = el('p', 'small');
        ex.toks.forEach((t, k) => {
          if (k > 0 && !t.punct) p.appendChild(document.createTextNode(' '));
          if (t.lemma === w) p.appendChild(el('span', 'mk exact', t.raw));
          else p.appendChild(document.createTextNode(t.raw));
        });
        sec3.appendChild(p);
        cardEl.appendChild(sec3);
      }
    }

    function mount(host) {
      container = host;
      const box = el('div', 'wm-box');

      const filter = el('div', 'wm-filter');
      filter.setAttribute('role', 'radiogroup');
      filter.setAttribute('aria-label', 'Welche Wörter zeigen?');
      MODES.forEach(m => {
        const b = el('button', 'wm-mode' + (m === mode ? ' on' : ''), m.label);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', m === mode ? 'true' : 'false');
        b.addEventListener('click', () => {
          if (m === mode) return;
          stopAnim();
          useMode(m);
          L = null; sel = null; hover = null;
          [...filter.children].forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
          again.hidden = !!m.pairs; sw.hidden = !!m.pairs;
          renderLegend();
          sel = ids.length ? word(0) : null;
          renderCard();
          progress(0); animate();
        });
        filter.appendChild(b);
      });
      box.appendChild(filter);

      const tools = el('div', 'wm-tools');
      const again = el('button', 'btn', '▶ Karte neu ordnen');
      again.type = 'button';
      again.addEventListener('click', animate);
      const sw = el('label', 'wm-switch');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = colors;
      cb.addEventListener('change', () => { colors = cb.checked; draw(); });
      sw.append(cb, document.createTextNode('Themenfarben'));
      const search = el('input', 'textin wm-search');
      search.type = 'search'; search.placeholder = 'Wort suchen'; search.autocomplete = 'off'; search.spellcheck = false;
      search.setAttribute('aria-label', 'Wort auf der Karte suchen');
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        if (!q) return;
        const hit = [M.words.find(w => w === q), M.words.find(w => w === M.lemma(q)), M.words.find(w => w.startsWith(q))]
          .find(w => w && posOf(w) >= 0);
        if (hit) pick(hit);
      });
      again.hidden = !!mode.pairs; sw.hidden = !!mode.pairs;
      tools.append(again, sw, search);
      box.appendChild(tools);

      cv = el('canvas', 'wm-canvas');
      cv.tabIndex = 0;
      cv.setAttribute('aria-label', 'Wortkarte. Wörter mit ähnlicher Bedeutung liegen nah beieinander. Wähle Wörter über die Suche oder die Liste darunter.');
      cx = cv.getContext('2d');
      cv.addEventListener('pointermove', ev => {
        const h = hitTest(ev);
        if (h !== hover) { hover = h; cv.style.cursor = h != null ? 'pointer' : 'crosshair'; draw(); }
      });
      cv.addEventListener('pointerleave', () => { if (hover != null) { hover = null; draw(); } });
      cv.addEventListener('click', ev => { const h = hitTest(ev); if (h != null) pick(word(h)); });
      box.appendChild(cv);

      const st = el('div', 'wm-status');
      const prog = el('div', 'wm-prog'); prog.setAttribute('aria-hidden', 'true');
      progEl = el('i'); prog.appendChild(progEl);
      statusEl = el('span', null, 'Gestrichelt = Wörter aus deiner Frage · Linien = die 6 ähnlichsten');
      statusEl.setAttribute('role', 'status');
      st.append(prog, statusEl);
      box.appendChild(st);

      host.appendChild(box);

      legendEl = el('div', 'wm-legend');
      renderLegend();
      host.appendChild(legendEl);

      cardEl = el('div', 'wm-card');
      host.appendChild(cardEl);

      window.removeEventListener('resize', onResize);  // mount() läuft beim Aufklappen erneut
      window.addEventListener('resize', onResize);

      if (!sel) {
        const start = (opts.highlight ? opts.highlight() : []).find(w => posOf(w) >= 0);
        sel = start || (ids.length ? word(0) : null);
      }
      renderCard();
      requestAnimationFrame(() => {
        resize();
        if (!L) { progress(0); animate(); }
        else draw();
      });
      return box;
    }

    function destroy() {
      stopAnim();
      window.removeEventListener('resize', onResize);
      cv = null; cx = null; cardEl = null; statusEl = null; progEl = null; container = null; legendEl = null;
    }

    return { mount, destroy, select, redraw: draw, get selected() { return sel; }, size: ids.length };
  }

  return { create, MAP_CAP };
})();
