/* NetView — eine ECHTE Darstellung des Mini-Netzes aus phase3-net.js.
   Jeder gezeichnete Punkt ist ein Neuron, jede Linie eine echte Kante mit ihrem echten Gewicht
   aus net.W1 / net.W2 (nichts ist Deko oder Zufallsgrafik):
     Eingang  = C × d Zahlen (die Embeddings der Kontextwörter)  -> Kategorie "embed"   (Schritt ①)
     Hidden   = net.H Neuronen mit tanh                          -> Kategorie "hidden"  (Schritt ②)
     Ausgabe  = ein Neuron pro Wort im Vokabular                 -> Kategorie "candidates" (③)
                (gezeichnet werden die SHOW stärksten + ein Sammelpunkt für den Rest)
   Kantenfarbe = Vorzeichen des Gewichts (--src-a positiv / --src-b negativ),
   Deckkraft/Dicke = Betrag; Füllung eines Neurons = sein aktueller Wert.
   Klick/Hover auf ein Neuron zeigt seine echten Zahlen (Wert, Schwelle, stärkste Kanten).

   NetView.create({ getNet, getData, getForward, getProbs, wordLabel, onReveal })
     -> { mount(host), update(), destroy() }
   mount()  läuft bei jedem Aufklappen der Karte erneut (Panel rendert geschlossene Karten nicht).
   update() ruft der Trainings-Tick (~5×/s) auf: zeichnet nur neu und baut KEINE Bedienelemente
            neu — sonst wären Buttons mitten im Klick weg (siehe phase3.js).
*/
const NetView = (() => {
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const de = n => n.toLocaleString('de-DE');
  const sgn = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(2).replace('.', ',');
  const pctTxt = p => { const x = p * 100; return (x < 1 ? x.toFixed(2) : x.toFixed(1)).replace('.', ',') + ' %'; };

  const SHOW = 8;          /* so viele Ausgabe-Neuronen werden gezeichnet (die wahrscheinlichsten) */
  const RELABEL_MS = 900;  /* beim Training nicht in jedem Frame andere Wörter einblenden */
  const SHARES = [[0.1, 'stärkste 10 %'], [0.3, 'stärkste 30 %'], [1, 'alle']];

  /* Indizes der k größten Werte von f(i), i < n. */
  function topK(n, f, k) {
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((a, b) => f(b) - f(a));
    return idx.slice(0, Math.min(k, n));
  }

  function create(opts) {
    let cv = null, cx = null, cw = 0, ch = 0;
    let share = 0.3, sel = null, hover = null;
    let detailEl = null, statusEl = null, shown = [], shownAt = 0;
    let inN = [], hidN = [], outN = [], restN = null, G = null;
    const onResize = () => requestAnimationFrame(resize);

    const N = () => opts.getNet();
    const D = () => opts.getData();
    const wl = w => (opts.wordLabel ? opts.wordLabel(w) : w);

    /* ---- Welche Ausgabe-Neuronen werden gezeichnet? ---- */
    function pickShown(probs) {
      const now = performance.now();
      if (shown.length && now - shownAt < RELABEL_MS && shown.every(i => i < probs.length)) return shown;
      shown = topK(probs.length, i => probs[i], SHOW);
      shownAt = now;
      return shown;
    }

    /* ---- Geometrie + Neuronenliste (wird bei jedem Zeichnen neu gelegt, damit Resize trägt) ---- */
    function build() {
      const net = N(), f = opts.getForward(), probs = opts.getProbs();
      const C = net.C, d = net.d, H = net.H, inDim = C * d;
      const top = 58, bot = Math.max(top + 80, ch - 30);
      const span = bot - top;
      const wordR = 108;
      const inX = wordR + 42;
      const outX = Math.max(inX + 140, cw - 170);
      const hidX = (inX + outX) / 2;

      const GAP = 1.8;  /* Lücke zwischen den Zahlenblöcken zweier Kontextwörter (in Punktabständen) */
      const sIn = span / Math.max(1, (inDim - 1) + (C - 1) * GAP);
      const rIn = Math.max(2.2, Math.min(4.4, sIn * 0.42));
      inN = [];
      for (let i = 0; i < inDim; i++) {
        const c = Math.floor(i / d);
        inN.push({ layer: 'in', i, c, j: i % d, x: inX, y: top + (i + c * GAP) * sIn, r: rIn, v: f.x[i] });
      }

      const sH = span / Math.max(1, H - 1);
      const rH = Math.max(2.6, Math.min(5.6, sH * 0.42));
      hidN = [];
      for (let k = 0; k < H; k++) hidN.push({ layer: 'hid', i: k, x: hidX, y: top + k * sH, r: rH, v: f.h[k] });

      const ids = pickShown(probs);
      const hasRest = probs.length > ids.length;
      const rows = ids.length + (hasRest ? 1 : 0);
      const sO = span / Math.max(1, rows - 1);
      outN = ids.map((id, m) => ({ layer: 'out', i: id, x: outX, y: top + m * sO, r: 6.5, v: probs[id] }));
      let mass = 0;
      ids.forEach(id => { mass += probs[id]; });
      restN = hasRest
        ? { layer: 'rest', i: -1, x: outX, y: top + (rows - 1) * sO, r: 5, v: 0, count: probs.length - ids.length, mass: Math.max(0, 1 - mass) }
        : null;

      G = { C, d, H, inDim, top, bot, wordR, inX, hidX, outX, sIn, GAP, probs, f };
      return G;
    }

    /* Schwelle + Maximum der Beträge einer Gewichtsmenge (für Filter und Deckkraft). */
    function stats(n, absAt) {
      const a = new Float64Array(n);
      for (let i = 0; i < n; i++) a[i] = absAt(i);
      a.sort();
      const max = n ? a[n - 1] : 1;
      const thr = share >= 1 ? 0 : a[Math.min(n - 1, Math.floor((1 - share) * n))];
      return { thr, max: max || 1 };
    }

    const LV = [[0.09, 0.6], [0.18, 0.9], [0.34, 1.3], [0.6, 1.9]];
    const level = t => (t > 0.6 ? 3 : t > 0.35 ? 2 : t > 0.15 ? 1 : 0);

    function draw() {
      if (!cv || !cw) return;
      const g = build();
      const net = N(), data = D();
      const ink = cssVar('--ink'), muted = cssVar('--muted'), surface = cssVar('--surface'), line = cssVar('--line');
      const pos = cssVar('--src-a'), neg = cssVar('--src-b');
      const cIn = cssVar('--cat-embed'), cHid = cssVar('--cat-hidden'), cOut = cssVar('--cat-candidates');
      const fd = '"Outfit", system-ui, sans-serif';
      const fb = '"Inter", system-ui, sans-serif';
      cx.clearRect(0, 0, cw, ch);

      /* ---- Kanten Eingang -> Hidden (net.W1), gebündelt nach Vorzeichen und Stärke ---- */
      const s1 = stats(g.inDim * g.H, i => Math.abs(net.W1[i]));
      for (let s = 0; s < 2; s++) for (let l = 0; l < 4; l++) {
        cx.beginPath();
        let any = false;
        for (let i = 0; i < g.inDim; i++) {
          const a = inN[i];
          for (let k = 0; k < g.H; k++) {
            const w = net.W1[i * g.H + k], m = Math.abs(w);
            if (m < s1.thr || (w < 0) !== (s === 1) || level(m / s1.max) !== l) continue;
            cx.moveTo(a.x, a.y); cx.lineTo(hidN[k].x, hidN[k].y);
            any = true;
          }
        }
        if (any) { cx.globalAlpha = LV[l][0]; cx.lineWidth = LV[l][1]; cx.strokeStyle = s ? neg : pos; cx.stroke(); }
      }

      /* ---- Kanten Hidden -> gezeichnete Ausgabe-Neuronen (net.W2) ---- */
      const V = net.vocabSize;
      const s2 = stats(g.H * outN.length, i => Math.abs(net.W2[(i % g.H) * V + outN[Math.floor(i / g.H)].i]));
      for (let s = 0; s < 2; s++) for (let l = 0; l < 4; l++) {
        cx.beginPath();
        let any = false;
        outN.forEach(o => {
          for (let k = 0; k < g.H; k++) {
            const w = net.W2[k * V + o.i], m = Math.abs(w);
            if (m < s2.thr || (w < 0) !== (s === 1) || level(m / s2.max) !== l) continue;
            cx.moveTo(hidN[k].x, hidN[k].y); cx.lineTo(o.x, o.y);
            any = true;
          }
        });
        if (any) { cx.globalAlpha = LV[l][0] + 0.06; cx.lineWidth = LV[l][1]; cx.strokeStyle = s ? neg : pos; cx.stroke(); }
      }
      cx.globalAlpha = 1;

      /* ---- Kanten des gewählten Neurons kräftig darüber ---- */
      const foc = find(hover) || find(sel);
      if (foc) {
        const strong = (x1, y1, x2, y2, w, max) => {
          cx.globalAlpha = 0.25 + 0.65 * Math.min(1, Math.abs(w) / (max || 1));
          cx.lineWidth = 0.8 + 2.2 * Math.min(1, Math.abs(w) / (max || 1));
          cx.strokeStyle = w < 0 ? neg : pos;
          cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
        };
        if (foc.layer === 'in') {
          let mx = 0;
          for (let k = 0; k < g.H; k++) mx = Math.max(mx, Math.abs(net.W1[foc.i * g.H + k]));
          for (let k = 0; k < g.H; k++) strong(foc.x, foc.y, hidN[k].x, hidN[k].y, net.W1[foc.i * g.H + k], mx);
        } else if (foc.layer === 'hid') {
          let mx = 0;
          for (let i = 0; i < g.inDim; i++) mx = Math.max(mx, Math.abs(net.W1[i * g.H + foc.i]));
          for (let i = 0; i < g.inDim; i++) strong(inN[i].x, inN[i].y, foc.x, foc.y, net.W1[i * g.H + foc.i], mx);
          let mo = 0;
          outN.forEach(o => { mo = Math.max(mo, Math.abs(net.W2[foc.i * V + o.i])); });
          outN.forEach(o => strong(foc.x, foc.y, o.x, o.y, net.W2[foc.i * V + o.i], mo));
        } else if (foc.layer === 'out') {
          let mx = 0;
          for (let k = 0; k < g.H; k++) mx = Math.max(mx, Math.abs(net.W2[k * V + foc.i]));
          for (let k = 0; k < g.H; k++) strong(hidN[k].x, hidN[k].y, foc.x, foc.y, net.W2[k * V + foc.i], mx);
        }
        cx.globalAlpha = 1;
      }

      /* ---- Neuronen ---- */
      const same = (a, b) => a && b && a.layer === b.layer && a.i === b.i;
      const pinned = find(sel);   /* angeklicktes Neuron behält seinen Ring, auch wenn man woanders hovert */
      function node(nd, ring, scale) {
        const t = Math.max(0, Math.min(1, Math.abs(nd.v) / scale));
        cx.beginPath(); cx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
        cx.fillStyle = surface; cx.fill();
        cx.globalAlpha = 0.12 + 0.88 * t;
        cx.fillStyle = nd.v < 0 ? neg : pos; cx.fill();
        cx.globalAlpha = 1;
        cx.lineWidth = 1; cx.strokeStyle = ring; cx.stroke();
        if (same(nd, foc) || same(nd, pinned)) {
          cx.lineWidth = same(nd, foc) ? 2.5 : 1.5;
          cx.strokeStyle = ink;
          if (!same(nd, foc)) cx.setLineDash([2, 2]);
          cx.beginPath(); cx.arc(nd.x, nd.y, nd.r + 3.5, 0, Math.PI * 2); cx.stroke();
          cx.setLineDash([]);
        }
      }
      inN.forEach(nd => node(nd, cIn, 1.2));
      hidN.forEach(nd => node(nd, cHid, 1));
      const pMax = outN.length ? Math.max(...outN.map(o => o.v)) || 1 : 1;
      outN.forEach(nd => node(nd, cOut, pMax));
      if (restN) {
        cx.beginPath(); cx.arc(restN.x, restN.y, restN.r, 0, Math.PI * 2);
        cx.fillStyle = surface; cx.fill();
        cx.setLineDash([2, 2]); cx.lineWidth = 1.2; cx.strokeStyle = cOut; cx.stroke(); cx.setLineDash([]);
      }

      /* ---- Kontextwörter links + Klammer zu ihrem Zahlenblock ---- */
      const ctx = opts.getCtxIds ? opts.getCtxIds() : [];
      for (let c = 0; c < g.C; c++) {
        const first = inN[c * g.d], last = inN[c * g.d + g.d - 1];
        const my = (first.y + last.y) / 2;
        cx.strokeStyle = cIn; cx.globalAlpha = 0.5; cx.lineWidth = 1.2;
        cx.beginPath();
        cx.moveTo(g.inX - 12, first.y); cx.lineTo(g.inX - 12, last.y);
        cx.moveTo(g.inX - 12, my); cx.lineTo(g.wordR + 4, my);
        cx.stroke(); cx.globalAlpha = 1;

        const w = ctx.length ? wl(D().vocab[ctx[c]]) : '…';
        const bw = 94, bh = 26, bx = 10, by = my - bh / 2;
        cx.beginPath();
        if (cx.roundRect) cx.roundRect(bx, by, bw, bh, 7); else cx.rect(bx, by, bw, bh);
        cx.fillStyle = surface; cx.fill();
        cx.lineWidth = 1.5; cx.strokeStyle = cIn; cx.stroke();
        cx.fillStyle = ink; cx.font = '700 12px ' + fb; cx.textAlign = 'left'; cx.textBaseline = 'middle';
        let t = w;
        while (cx.measureText(t).width > bw - 14 && t.length > 2) t = t.slice(0, -2) + '…';
        cx.fillText(t, bx + 7, my);
        cx.fillStyle = muted; cx.font = '10px ' + fb;
        cx.fillText(String(c + 1) + '.', bx + 1, my - bh / 2 - 6);
      }

      /* ---- Spaltenköpfe ---- */
      cx.textAlign = 'center'; cx.textBaseline = 'alphabetic';
      const head = (x, c, t1, t2) => {
        cx.fillStyle = c; cx.font = '800 12px ' + fd; cx.fillText(t1, x, 24);
        cx.fillStyle = muted; cx.font = '10px ' + fb; cx.fillText(t2, x, 38);
      };
      head(g.inX, cIn, de(g.inDim) + ' Eingangs-Zahlen', g.C + ' Wörter × ' + g.d + ' Zahlen');
      head(g.hidX, cHid, de(g.H) + ' Hidden-Neuronen', 'tanh');
      head(g.outX, cOut, de(V) + ' Ausgabe-Neuronen', 'die ' + outN.length + ' stärksten · Softmax');

      /* ---- Wortetiketten an der Ausgabe ---- */
      cx.textAlign = 'left'; cx.textBaseline = 'middle';
      outN.forEach((o, m) => {
        const strongRow = m === 0;
        cx.font = (strongRow ? '700 12px ' : '12px ') + fb;
        cx.fillStyle = ink;
        let t = wl(D().vocab[o.i]);
        const maxW = cw - (o.x + 14) - 44;
        while (cx.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2) + '…';
        cx.fillText(t, o.x + 13, o.y - 5);
        cx.font = '10px ' + fb; cx.fillStyle = muted;
        cx.fillText(pctTxt(o.v), o.x + 13, o.y + 7);
      });
      if (restN) {
        cx.font = '11px ' + fb; cx.fillStyle = muted;
        cx.fillText('+ ' + de(restN.count) + ' weitere', restN.x + 13, restN.y - 5);
        cx.font = '10px ' + fb;
        cx.fillText(pctTxt(restN.mass) + ' zusammen', restN.x + 13, restN.y + 7);
      }
      cx.textBaseline = 'alphabetic';
    }

    /* Knoten in den aktuellen Listen wiederfinden (Auswahl überlebt Neuzeichnen/Resize). */
    function find(ref) {
      if (!ref) return null;
      if (ref.layer === 'in') return inN[ref.i] || null;
      if (ref.layer === 'hid') return hidN[ref.i] || null;
      if (ref.layer === 'out') return outN.find(o => o.i === ref.i) || null;
      if (ref.layer === 'rest') return restN;
      return null;
    }

    function hitTest(ev) {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      let best = null, bd = 13 * 13;
      const test = nd => {
        const dx = nd.x - x, dy = nd.y - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = nd; }
      };
      inN.forEach(test); hidN.forEach(test); outN.forEach(test);
      if (restN) test(restN);
      return best ? { layer: best.layer, i: best.i } : null;
    }

    /* ---- Detailkarte zum gewählten Neuron (bewusst ohne Buttons: wird live neu gebaut) ---- */
    function rows(list, max) {
      const box = el('div', 'net-rows');
      list.forEach(r => {
        const row = el('div', 'net-row');
        row.appendChild(el('span', 'net-row-lab', r.label));
        const bar = el('div', 'bar net-row-bar');
        const fill = el('i');
        fill.style.width = Math.round(Math.min(1, Math.abs(r.v) / (max || 1)) * 100) + '%';
        fill.style.background = r.v < 0 ? 'var(--src-b)' : 'var(--src-a)';
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el('span', 'net-row-val', sgn(r.v)));
        box.appendChild(row);
      });
      return box;
    }
    function sec(title, child) {
      const s = el('div', 'net-sec');
      s.appendChild(el('h4', null, title));
      s.appendChild(child);
      return s;
    }

    function renderDetail() {
      if (!detailEl) return;
      detailEl.replaceChildren();
      const net = N(), data = D(), V = net.vocabSize, H = net.H, inDim = net.C * net.d;
      const nd = find(sel);
      if (!nd) {
        detailEl.appendChild(el('p', 'card-empty', '👆 Tipp einen Punkt im Bild an – dann siehst du seine echten Zahlen.'));
        return;
      }
      const card = el('div', 'net-detail');

      if (nd.layer === 'in') {
        const word = data.vocab[(opts.getCtxIds ? opts.getCtxIds() : [])[nd.c]];
        card.appendChild(el('p', 'eyebrow', 'Eingangs-Neuron'));
        card.appendChild(el('p', 'net-title', 'Zahl ' + (nd.j + 1) + ' von ' + net.d + ' für „' + wl(word) + '“'));
        card.appendChild(el('p', 'small muted', 'Kontextwort ' + (nd.c + 1) + ' · Wert gerade jetzt: ' + sgn(nd.v) + ' (kommt direkt aus der Embedding-Tabelle)'));
        const ks = topK(H, k => Math.abs(net.W1[nd.i * H + k]), 6);
        const mx = Math.abs(net.W1[nd.i * H + ks[0]]);
        card.appendChild(sec('Stärkste Kanten in die Hidden-Schicht (' + de(H) + ' insgesamt)',
          rows(ks.map(k => ({ label: 'Hidden-Neuron ' + (k + 1), v: net.W1[nd.i * H + k] })), mx)));
      } else if (nd.layer === 'hid') {
        const k = nd.i;
        card.appendChild(el('p', 'eyebrow', 'Hidden-Neuron'));
        card.appendChild(el('p', 'net-title', 'Neuron ' + (k + 1) + ' von ' + de(H)));
        card.appendChild(el('p', 'small muted', 'Wert: ' + sgn(nd.v) + ' (immer zwischen −1 und +1, weil tanh) · eigene Schwelle (Bias): ' + sgn(net.b1[k])));
        const is = topK(inDim, i => Math.abs(net.W1[i * H + k]), 6);
        const mi = Math.abs(net.W1[is[0] * H + k]);
        const ctx = opts.getCtxIds ? opts.getCtxIds() : [];
        card.appendChild(sec('Was am stärksten hineinkommt',
          rows(is.map(i => {
            const c = Math.floor(i / net.d), j = i % net.d;
            return { label: '„' + wl(data.vocab[ctx[c]]) + '“ · Zahl ' + (j + 1), v: net.W1[i * H + k] };
          }), mi)));
        const up = topK(V, v => net.W2[k * V + v], 5);
        const down = topK(V, v => -net.W2[k * V + v], 5);
        const mo = Math.max(Math.abs(net.W2[k * V + up[0]]), Math.abs(net.W2[k * V + down[0]])) || 1;
        card.appendChild(sec('Dieses Neuron schiebt nach oben',
          rows(up.map(v => ({ label: '„' + wl(data.vocab[v]) + '“', v: net.W2[k * V + v] })), mo)));
        card.appendChild(sec('… und nach unten',
          rows(down.map(v => ({ label: '„' + wl(data.vocab[v]) + '“', v: net.W2[k * V + v] })), mo)));
      } else if (nd.layer === 'out') {
        const v = nd.i, f = opts.getForward();
        card.appendChild(el('p', 'eyebrow', 'Ausgabe-Neuron'));
        card.appendChild(el('p', 'net-title', '„' + wl(data.vocab[v]) + '“'));
        card.appendChild(el('p', 'small muted', 'gerade ' + pctTxt(nd.v) + ' Wahrscheinlichkeit · Rohwert: ' + sgn(f.logits[v]) + ' · eigene Schwelle (Bias): ' + sgn(net.b2[v])));
        const ks = topK(H, k => Math.abs(f.h[k] * net.W2[k * V + v]), 6);
        const mx = Math.abs(f.h[ks[0]] * net.W2[ks[0] * V + v]);
        card.appendChild(sec('Welche Hidden-Neuronen dieses Wort gerade treiben',
          rows(ks.map(k => ({ label: 'Hidden-Neuron ' + (k + 1), v: f.h[k] * net.W2[k * V + v] })), mx)));
        card.appendChild(el('p', 'small muted', 'Jedes Wort hat ein eigenes Ausgabe-Neuron – ' + de(V) + ' Stück, gezeichnet sind die ' + SHOW + ' stärksten.'));
      } else {
        card.appendChild(el('p', 'eyebrow', 'Der Rest'));
        card.appendChild(el('p', 'net-title', de(restN.count) + ' weitere Ausgabe-Neuronen'));
        card.appendChild(el('p', 'small muted', 'Zusammen kommen sie gerade auf ' + pctTxt(restN.mass) + '. Sie sind da, nur nicht gezeichnet — sonst wären es ' + de(net.H * net.vocabSize) + ' Linien allein in der rechten Hälfte.'));
      }
      detailEl.appendChild(card);
    }

    function factsBox() {
      const net = N(), data = D(), V = net.vocabSize, inDim = net.C * net.d;
      const emb = V * net.d, w1 = inDim * net.H, w2 = net.H * V;
      const total = emb + w1 + net.H + w2 + V;
      const box = el('div', 'net-facts');
      const put = (k, v, sub) => {
        const r = el('div', 'net-fact');
        r.appendChild(el('span', 'net-fact-k', k));
        r.appendChild(el('b', 'net-fact-v', v));
        if (sub) r.appendChild(el('span', 'net-fact-s', sub));
        box.appendChild(r);
      };
      put('Eingangs-Neuronen', de(inDim), net.C + ' Kontextwörter × ' + net.d + ' Zahlen');
      put('Hidden-Neuronen', de(net.H), 'Aktivierung: tanh');
      put('Ausgabe-Neuronen', de(V), 'eins pro Wort im Vokabular');
      put('Kanten Eingang→Hidden', de(w1), inDim + ' × ' + net.H);
      put('Kanten Hidden→Ausgabe', de(w2), net.H + ' × ' + de(V));
      put('Embedding-Tabelle', de(emb), de(V) + ' Wörter × ' + net.d + ' Zahlen');
      put('Schwellen (Bias)', de(net.H + V), net.H + ' + ' + de(V));
      put('Zahlen insgesamt', de(total), 'alle werden beim Training verändert');
      return box;
    }

    function resize() {
      if (!cv || !cv.isConnected) return;
      const r = cv.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      cw = r.width; ch = r.height;
      cv.width = Math.round(cw * d);
      cv.height = Math.round(ch * d);
      cx.setTransform(d, 0, 0, d, 0, 0);
      draw();
    }

    function mount(host) {
      const wrap = el('div', 'net-box');

      const tools = el('div', 'net-tools');
      tools.appendChild(el('span', 'net-tools-lab', 'Kanten zeigen:'));
      const chips = el('div', 'chiprow');
      SHARES.forEach(([val, lab]) => {
        const c = el('button', 'chip' + (val === share ? ' active' : ''), lab);
        c.type = 'button';
        c.addEventListener('click', () => {
          share = val;
          [...chips.children].forEach((ch2, i) => ch2.classList.toggle('active', SHARES[i][0] === share));
          draw();
        });
        chips.appendChild(c);
      });
      tools.appendChild(chips);
      const clear = el('button', 'chip', 'Auswahl aufheben');
      clear.type = 'button';
      clear.addEventListener('click', () => { sel = null; draw(); renderDetail(); });
      tools.appendChild(clear);
      wrap.appendChild(tools);

      const scroller = el('div', 'net-scroll');
      cv = el('canvas', 'net-canvas');
      cv.setAttribute('aria-label', 'Netz-Bild: Eingangs-Neuronen links, Hidden-Schicht in der Mitte, Ausgabe-Neuronen rechts. Linien sind die Gewichte. Die Zahlen stehen auch als Liste unter dem Bild.');
      cx = cv.getContext('2d');
      cv.addEventListener('pointermove', ev => {
        const h = hitTest(ev);
        const changed = (h && hover) ? (h.layer !== hover.layer || h.i !== hover.i) : (h !== hover);
        if (changed) { hover = h; cv.style.cursor = h ? 'pointer' : 'default'; draw(); }
      });
      cv.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });
      cv.addEventListener('click', ev => {
        const h = hitTest(ev);
        if (!h) return;
        sel = h;
        draw();
        renderDetail();
        if (opts.onReveal) opts.onReveal(h.layer);
      });
      scroller.appendChild(cv);
      wrap.appendChild(scroller);

      statusEl = el('p', 'small muted', 'Punkt = Neuron · Linie = echtes Gewicht aus dem Netz');
      wrap.appendChild(statusEl);
      host.appendChild(wrap);

      const lg = el('div', 'srcchips');
      [['var(--src-a)', 'plus / schiebt an'], ['var(--src-b)', 'minus / bremst'], ['var(--cat-embed)', 'Eingang'],
        ['var(--cat-hidden)', 'Hidden'], ['var(--cat-candidates)', 'Ausgabe']].forEach(([c, t]) => {
        const chip = el('span', 'srcchip');
        const d = el('i', 'dot'); d.style.background = c;
        chip.append(d, el('span', 'srcchip-t', t));
        lg.appendChild(chip);
      });
      host.appendChild(lg);

      detailEl = el('div', 'net-detail-host');
      host.appendChild(detailEl);
      renderDetail();

      const factsWrap = el('details', 'net-facts-wrap');
      factsWrap.appendChild(el('summary', null, '🔢 Wie viele Zahlen sind das?'));
      factsWrap.appendChild(factsBox());
      factsWrap.appendChild(el('p', 'small muted', '🌍 Große Sprachmodelle: gleiche Idee, aber Milliarden Zahlen und viel mehr Schichten.'));
      host.appendChild(factsWrap);

      window.removeEventListener('resize', onResize);   /* mount() läuft beim Aufklappen erneut */
      window.addEventListener('resize', onResize);
      requestAnimationFrame(resize);
      return wrap;
    }

    function update() {
      if (!cv || !cv.isConnected) return;
      draw();
      renderDetail();
    }

    function destroy() {
      window.removeEventListener('resize', onResize);
      cv = null; cx = null; detailEl = null; statusEl = null;
    }

    return { mount, update, destroy };
  }

  return { create, SHOW };
})();
