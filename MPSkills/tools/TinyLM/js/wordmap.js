/* Wortkarte ("Bedeutung") — EINE Karte mit allen Wörtern, die Filter heben nur hervor.

   Warum so (Rückmeldung 15.10.2026: „die Wortkarten wirken so gefakt, alle Wörter stehen
   gleich weit auseinander; ich dachte, mit den Filtern kann ich Gruppen im Cluster hervorheben“):
   - Früher war jeder Filter eine eigene Karte (nur Nomen, nur Verben …), und das t-SNE bekam alle
     Abstände: 93 % der Wortpaare sind sich fast gar nicht ähnlich, also verteilte es die Wörter
     wie einen gleichmäßigen Teppich.
   - Jetzt: ein Wortmodell für Nomen, Verben und alle Paarwörter (wordkinds.js, Wörter wie im Text,
     Merkmale = Wort direkt davor/danach + Inhaltswörter im selben Satz bis WIN Wörter weit).
     Das t-SNE schaut nur auf die nächsten Nachbarn jedes Wortes (kNN), dadurch entstehen Inseln.
     Linien verbinden jedes Wort mit seinen KNN ähnlichsten — die Beziehungen sieht man direkt.
   - Filter (Nomen, Verben, spielt → spielte, Lehrer → Lehrerin) und die Wortwelten in der Legende
     lassen ihre Wörter leuchten und den Rest verblassen; die Karte bleibt, wie sie ist.
   - Bei den Paar-Filtern gibt es Pfeile von Wort zu Wort und den Knopf „Pfeile nebeneinander“:
     die Paarwörter gleiten in die feste Ansicht (pairProj: Hauptrichtungen derselben Vektoren, mittlerer
     Pfeil nach rechts gedreht), dort sieht man, dass die Pfeile fast parallel laufen. Auf der Karte selbst
     zeigen sie kreuz und quer — t-SNE erhält Nachbarschaften, keine Richtungen.

   Nutzung:  const map = WordMap.create(M, { highlight: () => ['maus'], texts: () => [...] });
             map.mount(container);       // baut Werkzeugleiste + Canvas + Detailkarte
             map.select('katze');        // Wort auswählen (Grundform aus Phase 2 geht auch)
             map.destroy();              // Animation/Resize-Listener abräumen
   M ist das Phase-2-Modell; gebraucht wird davon nur M.lemma, um Fragewörter (Grundformen) auf
   Kartenwörter (Wörter wie im Text) abzubilden.

   Modell und Layout werden erst beim ersten mount() gerechnet (das Layout animiert über
   requestAnimationFrame), damit das Aufklappen der Karte die Phase nicht blockiert. */
const WordMap = (() => {
  const NOUN_CAP = 140;  // die häufigsten Nomen
  const VERB_CAP = 70;   // die häufigsten Verben (+ alle Paarwörter)
  const WIN = 4;         // Inhaltswörter im selben Satz, bis so weit weg
  const KNN = 3;         // Linien je Wort
  const PERP = 6;
  const DIMS = 20;    // verdichtete Richtungen je Wort
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

  /* Verdichten wie bei echten Wort-Embeddings: die dünnen Merkmalsvektoren (fast alle Paare ~0 %
     ähnlich) auf die DIMS wichtigsten Richtungen bringen (Eigenvektoren der Ähnlichkeitsmatrix,
     Potenzmethode mit Orthogonalisieren). Danach ist die Ähnlichkeit glatt: Wörter, die ähnliche
     Nachbarn haben wie ihre Nachbarn, rücken zusammen. M.sim wird ersetzt, der Rest bleibt. */
  function denseSim(M, k) {
    const n = M.words.length, S = M.sim;
    k = Math.min(k, n);
    if (!k) return M;
    let Q = Array.from({ length: k }, (_, c) => Float64Array.from({ length: n }, (_, i) => Math.sin((i + 1) * (c + 1) * 1.3)));
    const lam = new Float64Array(k);
    for (let it = 0; it < 40; it++) {
      const Z = Q.map(q => {
        const z = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; const r = S[i]; for (let j = 0; j < n; j++) s += r[j] * q[j]; z[i] = s; }
        return z;
      });
      for (let c = 0; c < k; c++) {
        for (let d = 0; d < c; d++) { let dot = 0; for (let i = 0; i < n; i++) dot += Z[c][i] * Z[d][i]; for (let i = 0; i < n; i++) Z[c][i] -= dot * Z[d][i]; }
        let nn = 0; for (let i = 0; i < n; i++) nn += Z[c][i] * Z[c][i];
        nn = Math.sqrt(nn) || 1; lam[c] = nn;
        for (let i = 0; i < n; i++) Z[c][i] /= nn;
      }
      Q = Z;
    }
    /* Zentrieren: sonst teilen alle Wörter eine gemeinsame Richtung („kommt oft vor“) und
       landen auf der Karte als ein großer Klumpen in der Mitte. */
    const raw = M.words.map((w, i) => Q.map((q, c) => q[i] * Math.sqrt(lam[c])));
    const mean = new Float64Array(k);
    raw.forEach(v => v.forEach((x, c) => { mean[c] += x / n; }));
    const E = raw.map(v => {
      const u = v.map((x, c) => x - mean[c]);
      const nn = Math.sqrt(u.reduce((a, b) => a + b * b, 0)) || 1;
      return u.map(x => x / nn);
    });
    const sim = E.map(a => Float64Array.from(E, b => { let s = 0; for (let c = 0; c < k; c++) s += a[c] * b[c]; return s; }));
    return Object.assign({}, M, { sim, emb: E });
  }

  /* t-SNE nur über die nächsten Nachbarn: jedes Wort zieht an seinen K ähnlichsten, alle anderen
     stoßen sich ab. (Mit allen Abständen kam ein gleichmäßiger Teppich heraus, weil fast alle
     Wortpaare gleich unähnlich sind.) */
  function makeLayout(sim, n, seed) {
    const perp = Math.max(2, Math.min(PERP, (n - 1) / 3));
    const K = Math.min(n - 1, Math.round(3 * perp));
    const P = Array.from({ length: n }, () => new Float64Array(n));
    const H = Math.log(perp);
    for (let i = 0; i < n; i++) {
      const nb = [];
      for (let j = 0; j < n; j++) if (j !== i) nb.push(j);
      nb.sort((a, b) => sim[i][b] - sim[i][a]);
      const js = nb.slice(0, K), D = js.map(j => { const d = Math.max(0, 1 - sim[i][j]); return d * d; });
      const d0 = Math.min(...D);
      let beta = 1, lo = -Infinity, hi = Infinity;
      const p = new Float64Array(K);
      for (let it = 0; it < 60; it++) {
        let sum = 0, hsum = 0;
        for (let k = 0; k < K; k++) { p[k] = Math.exp(-(D[k] - d0) * beta); sum += p[k]; hsum += (D[k] - d0) * p[k]; }
        sum = sum || 1e-12;
        const h = Math.log(sum) + beta * hsum / sum;
        if (Math.abs(h - H) < 1e-4) break;
        if (h > H) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; }
        else { hi = beta; beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2; }
      }
      let sum = 0;
      for (let k = 0; k < K; k++) sum += p[k];
      for (let k = 0; k < K; k++) P[i][js[k]] = p[k] / (sum || 1);
    }
    const Pj = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Pj[i][j] = Math.max((P[i][j] + P[j][i]) / (2 * n), 1e-12);
    const rnd = mulberry32(seed || 7);
    const Y = Array.from({ length: n }, () => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2]);
    const vel = Array.from({ length: n }, () => [0, 0]);
    const gains = Array.from({ length: n }, () => [1, 1]);
    const num = Array.from({ length: n }, () => new Float64Array(n));
    let iter = 0;
    const L = { n, Y, iter: 0, total: 500 };
    L.step = function () {
      const exag = iter < 100 ? 4 : 1;
      const mom = iter < 100 ? 0.5 : 0.8;
      /* Schrittweite 1: mit 5 schossen einzelne Gruppen entlang der Achsen davon (Kreuz-Form), der
         Rest klebte in der Mitte. Gemessen: von den 3 ähnlichsten Wörtern liegen jetzt 87 % unter
         den 10 nächsten auf der Karte (vorher 73 %). */
      const lr = 1;
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

  /* Filter oben auf der Karte: heben hervor, rechnen nichts neu. */
  const FILTERS = [
    { id: 'alle', label: 'Alle Wörter' },
    { id: 'nomen', label: 'Nomen', what: 'Nomen' },
    { id: 'verben', label: 'Verben', what: 'Verben' },
    { id: 'zeiten', label: 'spielt → spielte', pairs: 'tensePairs', what: 'Wörter aus Paaren', left: '← Gegenwart', right: 'Vergangenheit →',
      a: 'Gegenwart', b: 'Vergangenheit' },
    { id: 'paare', label: 'Lehrer → Lehrerin', pairs: 'genderPairs', what: 'Wörter aus Paaren', left: '← der …', right: 'die … →',
      a: 'der …', b: 'die …' }
  ];

  function create(M0, opts) {
    opts = opts || {};
    let A = null, M = null, kind = null, knn = null, pairSets = null;
    const pairModels = {};
    let filter = FILTERS[0], theme = null, aligned = false, alignT = 0, alignAnim = 0;
    const word = i => M.words[i];
    const posOf = w => { const i = M.wIdx.get(w); return i === undefined ? -1 : i; };
    const pairsOf = f => (f && f.pairs ? A[f.pairs] : []);

    /* Modell erst bei Bedarf rechnen (Karte ist anfangs zugeklappt). */
    function ensure() {
      if (M) return;
      A = WordKinds.analyze(opts.texts ? opts.texts() : []);
      const nouns = [...A.freq.keys()].filter(w => A.isNoun(w) && !STOP.has(w) && w.length > 2)
        .sort((a, b) => A.freq.get(b) - A.freq.get(a) || a.localeCompare(b, 'de')).slice(0, NOUN_CAP);
      const tenseWords = A.tensePairs.flat();
      const rows = nouns.concat(A.verbs.slice(0, VERB_CAP), tenseWords, A.genderPairs.flat());
      M = denseSim(WordKinds.model(A, rows, { window: WIN }), DIMS);
      const tenseSet = new Set(tenseWords);
      kind = M.words.map(w => A.isNoun(w) ? 'nomen' : (A.isVerb(w) || tenseSet.has(w) ? 'verb' : ''));
      knn = M.words.map((w, i) => {
        const arr = [];
        for (let j = 0; j < M.words.length; j++) if (j !== i && M.sim[i][j] > 0) arr.push(j);
        return arr.sort((a, b) => M.sim[i][b] - M.sim[i][a]).slice(0, KNN);
      });
      pairSets = { tensePairs: new Set(tenseWords), genderPairs: new Set(A.genderPairs.flat()) };
    }

    /* Eigenes kleines Modell nur aus den Paarwörtern: für die Pfeil-Ansicht und das Wort-Rechnen
       (gleiche Merkmale wie die Karte; mit allen Kartenwörtern als Kandidaten träfe es seltener). */
    function pairModel(key) {
      if (!pairModels[key]) {
        const pairs = A[key];
        const pm = WordKinds.model(A, pairs.flat(), { window: WIN });
        pairModels[key] = { M: pm, proj: pairProj(pairs) };
      }
      return pairModels[key];
    }
    /* Pfeil-Ansicht ehrlich aus denselben Vektoren wie die Karte (M.emb, 20 Richtungen): die zwei
       Hauptrichtungen der Paarwörter (PCA), danach nur so gedreht, dass der mittlere Pfeil nach rechts
       zeigt. Nichts ist erzwungen — laufen die Pfeile parallel, dann steckt das in den Vektoren.
       (Vorher: x = mittlere Paar-Richtung eines eigenen Modells, da liefen sie per Bauart parallel.)
       Gemessen auf den Standardtexten: Pfeile zur mittleren Richtung im Schnitt cos 0,91 (Lehrer → Lehrerin)
       — auf der t-SNE-Karte nur 0,09, denn t-SNE erhält Nachbarschaften, keine Richtungen. */
    function pairProj(pairs) {
      const words = [...new Set(pairs.flat())].filter(w => M.wIdx.has(w));
      if (words.length < 3) return { words: [], Y: [] };
      const X = words.map(w => M.emb[M.wIdx.get(w)]), d = X[0].length, n = X.length;
      const mu = new Float64Array(d);
      X.forEach(x => x.forEach((v, k) => { mu[k] += v / n; }));
      const C = X.map(x => x.map((v, k) => v - mu[k]));
      const comps = [];
      for (let c = 0; c < 2; c++) {
        let u = Array.from({ length: d }, (_, k) => Math.sin(k + 1 + c));
        for (let it = 0; it < 100; it++) {
          const w = new Array(d).fill(0);
          C.forEach(x => { let s = 0; for (let k = 0; k < d; k++) s += x[k] * u[k]; for (let k = 0; k < d; k++) w[k] += s * x[k]; });
          comps.forEach(q => { let s = 0; for (let k = 0; k < d; k++) s += w[k] * q[k]; for (let k = 0; k < d; k++) w[k] -= s * q[k]; });
          const nn = Math.hypot(...w) || 1;
          u = w.map(v => v / nn);
        }
        comps.push(u);
      }
      const Y = C.map(x => comps.map(q => x.reduce((s, v, k) => s + v * q[k], 0)));
      const at = new Map(words.map((w, i) => [w, i]));
      let mx = 0, my = 0;
      pairs.forEach(([a, b]) => {
        if (!at.has(a) || !at.has(b)) return;
        mx += Y[at.get(b)][0] - Y[at.get(a)][0]; my += Y[at.get(b)][1] - Y[at.get(a)][1];
      });
      const ang = Math.atan2(my, mx), co = Math.cos(-ang), si = Math.sin(-ang);
      return { words, Y: Y.map(([x, y]) => [x * co - y * si, x * si + y * co]) };
    }
    function pairInfo(w) {
      for (const f of FILTERS) {
        if (!f.pairs) continue;
        const p = A[f.pairs].find(x => x[0] === w || x[1] === w);
        if (p) return { f, pair: p };
      }
      return null;
    }

    function inFilter(i) {
      const w = word(i);
      let ok = true;
      if (filter.id === 'nomen') ok = kind[i] === 'nomen';
      else if (filter.id === 'verben') ok = kind[i] === 'verb';
      else if (filter.pairs) ok = pairSets[filter.pairs].has(w);
      if (ok && theme) ok = M.themeOf(w).theme === theme;
      return ok;
    }
    const filtering = () => filter.id !== 'alle' || !!theme;
    /* Gewähltes Wort passt nicht mehr zum Filter → auf das häufigste leuchtende springen. */
    function fitSel() {
      if (!sel || posOf(sel) < 0 || inFilter(posOf(sel))) return;
      const first = M.words.findIndex((w, i) => inFilter(i));
      if (first >= 0) sel = M.words[first];
    }

    let L = null, seed = 7;
    let cv = null, cx = null, cw = 0, ch = 0, view = null;
    let sel = null, hover = null, colors = true, anim = 0;
    let statusEl = null, progEl = null, cardEl = null, container = null, legendEl = null, alignBtn = null, againBtn = null;
    const onResize = () => requestAnimationFrame(resize);

    function targetView() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      L.Y.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      return { x0, x1, y0, y1 };
    }

    function mapPos() {
      const v = view, narrow = cw < 500, pad = narrow ? 14 : 30, lab = narrow ? 30 : 50;   // lab: Platz für Beschriftungen rechts
      const rot = (ch > cw) !== ((v.y1 - v.y0) > (v.x1 - v.x0));
      const rx = rot ? v.y1 - v.y0 : v.x1 - v.x0;
      const ry = rot ? v.x1 - v.x0 : v.y1 - v.y0;
      const s = Math.min((cw - 2 * pad - lab) / Math.max(1e-6, rx), (ch - 2 * pad) / Math.max(1e-6, ry));
      const ox = (cw - lab - rx * s) / 2, oy = (ch - ry * s) / 2;
      return L.Y.map(p => {
        const a = rot ? p[1] - v.y0 : p[0] - v.x0;
        const b = rot ? p[0] - v.x0 : p[1] - v.y0;
        return [ox + a * s, oy + b * s];
      });
    }
    /* Feste Pfeil-Ansicht: die zwei Hauptrichtungen der Paarwörter, mittlerer Pfeil zeigt nach rechts. */
    function alignedPos(base) {
      const pm = pairModel(filter.pairs);
      const Y = pm.proj.Y;
      if (!Y.length) return base;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      Y.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      const pad = 30;
      const sx = (cw - 2 * pad - 70) / Math.max(1e-6, x1 - x0), sy = (ch - 2 * pad - 30) / Math.max(1e-6, y1 - y0);
      const out = base.map(p => p.slice());
      pm.proj.words.forEach((w, k) => {
        const i = posOf(w);
        if (i >= 0) out[i] = [pad + 35 + (Y[k][0] - x0) * sx, pad + (Y[k][1] - y0) * sy];
      });
      return out;
    }
    function screenPos() {
      const base = mapPos();
      if (alignT <= 0 || !filter.pairs) return base;
      const al = alignedPos(base), t = alignT;
      return base.map((p, i) => [p[0] + (al[i][0] - p[0]) * t, p[1] + (al[i][1] - p[1]) * t]);
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

    /* Fragewörter aus Phase 2 (Grundformen) → Kartenwörter (wie im Text). */
    function resolve(w) {
      if (!w) return null;
      if (M.wIdx.has(w)) return w;
      if (!M0 || !M0.lemma) return null;
      let best = null, bf = 0;
      M.words.forEach(x => {
        if (M0.lemma(x) !== w) return;
        const f = A.freq.get(x) || 0;
        if (f > bf) { bf = f; best = x; }
      });
      return best;
    }
    function highlightSet() {
      const set = new Set();
      (opts.highlight ? opts.highlight() : []).forEach(w => {
        const k = posOf(resolve(w));
        if (k >= 0) set.add(k);
      });
      return set;
    }

    function draw() {
      if (!L || !cv || !cw || !view) return;
      cx.clearRect(0, 0, cw, ch);
      const P = screenPos();
      const n = P.length;
      const ink = cssVar('--ink'), muted = cssVar('--muted'), surface = cssVar('--surface'), line = cssVar('--line');
      const meaning = cssVar('--cat-meaning');
      const tcol = {};
      THEME_ORDER.forEach(t => { tcol[t] = cssVar('--t-' + t); });
      const s = sel != null ? posOf(sel) : -1;
      const pairSet = filter.pairs ? pairSets[filter.pairs] : null;
      const at = filter.pairs ? alignT : 0;
      const nb = s >= 0 && at < 0.5 ? neighbors(M, sel, 4).map(x => posOf(x[0])).filter(k => k >= 0) : [];
      const qSet = highlightSet();
      const colA = cssVar('--src-b'), colB = cssVar('--src-a');
      const on = Array.from({ length: n }, (_, i) => inFilter(i));
      const flt = filtering();
      /* Sichtbarkeit: hervorgehoben = voll, sonst blass; in der Pfeil-Ansicht verschwinden die
         Wörter, die zu keinem Paar gehören. */
      const alpha = i => {
        let a = !flt || on[i] ? 1 : 0.14;
        if (at > 0 && !pairSet.has(word(i))) a *= 1 - at;
        return a;
      };
      const dotColor = i => {
        const w = word(i);
        if (pairSet && pairSet.has(w)) {
          const p = A[filter.pairs].find(x => x[0] === w || x[1] === w);
          return p && p[1] === w ? colB : colA;
        }
        if (!colors) return muted;
        return tcol[M.themeOf(w).theme] || muted;
      };

      /* Nachbar-Linien (die Beziehungen), gebündelt in zwei Pfade */
      if (at < 1) {
        const strong = new Path2D(), weak = new Path2D();
        for (let i = 0; i < n; i++) knn[i].forEach(j => {
          if (knn[j].includes(i) && j < i) return;   // gegenseitige Nachbarn nur einmal
          const both = on[i] && on[j];
          const pth = !flt || both ? strong : weak;
          pth.moveTo(P[i][0], P[i][1]); pth.lineTo(P[j][0], P[j][1]);
        });
        cx.lineWidth = 1;
        cx.strokeStyle = flt ? meaning : muted;
        cx.globalAlpha = (flt ? 0.45 : 0.2) * (1 - at);
        cx.stroke(strong);
        cx.strokeStyle = muted;
        cx.globalAlpha = 0.07 * (1 - at);
        cx.stroke(weak);
        cx.globalAlpha = 1;
      }

      if (at > 0.5) {
        cx.font = '600 12px "Inter", system-ui, sans-serif'; cx.fillStyle = muted;
        cx.globalAlpha = (at - 0.5) * 2;
        cx.fillText(filter.left, 10, ch - 10);
        cx.fillText(filter.right, cw - 10 - cx.measureText(filter.right).width, ch - 10);
        cx.globalAlpha = 1;
      }
      /* Ein Pfeil je Paar */
      if (pairSet) {
        A[filter.pairs].forEach(([a, b]) => {
          const i = posOf(a), j = posOf(b);
          if (i < 0 || j < 0 || (theme && !(on[i] || on[j]))) return;
          const hi = sel === a || sel === b;
          const [x0, y0] = P[i], [x1, y1] = P[j];
          const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
          const ex = x1 - Math.cos(ang) * 8, ey = y1 - Math.sin(ang) * 8;
          cx.strokeStyle = hi ? ink : muted; cx.fillStyle = hi ? ink : muted;
          cx.globalAlpha = hi ? 0.95 : 0.5; cx.lineWidth = hi ? 2.5 : 1.5;
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

      if (s >= 0 && nb.length) {
        cx.strokeStyle = ink; cx.lineWidth = 1.5; cx.globalAlpha = 0.4;
        nb.forEach(j => { cx.beginPath(); cx.moveTo(P[s][0], P[s][1]); cx.lineTo(P[j][0], P[j][1]); cx.stroke(); });
        cx.globalAlpha = 1;
      }
      /* Blasse Punkte zuerst, damit die hervorgehobenen obenauf liegen. */
      const order = [...Array(n).keys()].sort((a, b) => alpha(a) - alpha(b));
      order.forEach(i => {
        const a = alpha(i);
        if (a <= 0.01) return;
        const f = A.freq.get(word(i)) || 1;
        const r = 3 + Math.min(4, Math.sqrt(f) * 0.7);
        cx.globalAlpha = a;
        cx.beginPath();
        cx.arc(P[i][0], P[i][1], r, 0, Math.PI * 2);
        cx.fillStyle = dotColor(i);
        cx.fill();
        cx.globalAlpha = 1;
        if (qSet.has(i)) {
          cx.lineWidth = 2; cx.strokeStyle = ink; cx.setLineDash([3, 3]);
          cx.beginPath(); cx.arc(P[i][0], P[i][1], r + 4, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
        }
        if (i === s) {
          cx.lineWidth = 3; cx.strokeStyle = ink;
          cx.beginPath(); cx.arc(P[i][0], P[i][1], r + 4, 0, Math.PI * 2); cx.stroke();
        }
      });

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
      forced.forEach(i => { if (alpha(i) > 0.01) label(i, true); });
      /* Beschriftet werden nur die leuchtenden Wörter, die häufigsten zuerst. */
      order.filter(i => !forced.includes(i) && alpha(i) >= 0.99)
        .sort((a, b) => (A.freq.get(word(b)) || 0) - (A.freq.get(word(a)) || 0))
        .forEach(i => label(i, false));
    }

    function renderLegend() {
      if (!legendEl) return;
      legendEl.replaceChildren();
      if (filter.pairs) {
        const item = (color, txt) => {
          const row = el('span', 'wm-legend-item');
          const d = el('i', 'dot'); d.style.background = color;
          row.append(d, document.createTextNode(txt));
          legendEl.appendChild(row);
        };
        item('var(--src-b)', filter.a); item('var(--src-a)', filter.b);
        legendEl.appendChild(el('span', 'wm-legend-item', '· Pfeil = ein Wortpaar ·'));
      }
      /* Wortwelten zum Antippen: lässt nur ihre Wörter leuchten. */
      const shown = new Set(M.words.map(w => M.themeOf(w).theme));
      THEME_ORDER.filter(t => shown.has(t)).forEach(t => {
        const b = el('button', 'wm-legend-item wm-theme' + (theme === t ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', theme === t ? 'true' : 'false');
        const d = el('i', 'dot'); d.style.background = tVar(t);
        b.append(d, document.createTextNode(THEME_NAME[t]));
        b.addEventListener('click', () => {
          theme = theme === t ? null : t;
          fitSel();
          renderLegend(); renderCard(); draw(); status(doneText());
        });
        legendEl.appendChild(b);
      });
    }

    function status(txt) {
      if (statusEl) statusEl.textContent = txt;
    }
    function progress(f) {
      if (progEl) progEl.style.width = Math.round(100 * f) + '%';
    }
    function doneText() {
      if (aligned && filter.pairs) {
        const k = A[filter.pairs].length;
        return k ? 'Links → rechts: die mittlere Richtung von ' + k + ' Wortpaaren. Fast parallele Pfeile = gleicher Unterschied.'
          : 'In den ausgewählten Texten gibt es keine solchen Wortpaare.';
      }
      if (!filtering()) return 'Linien verbinden jedes Wort mit seinen ' + KNN + ' ähnlichsten. Tipp ein Wort an!';
      let c = 0;
      for (let i = 0; i < M.words.length; i++) if (inFilter(i)) c++;
      const what = (filter.what || 'Wörter') + (theme ? ' aus „' + THEME_NAME[theme] + '“' : '');
      return c ? c + ' ' + what + ' leuchten — liegen sie beieinander?' : 'Keine ' + what + ' auf der Karte.';
    }

    function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = 0; } }

    /* Layout von vorn rechnen und beim Rechnen zusehen. */
    function animate() {
      stopAnim();
      L = makeLayout(M.sim, M.words.length, seed++);
      view = targetView();
      if (reduced()) {
        while (L.iter < L.total) L.step();
        view = targetView(); progress(1); draw();
        status(doneText());
        return;
      }
      const tick = () => {
        for (let k = 0; k < 4 && L.iter < L.total; k++) L.step();
        const t = targetView(), a = L.iter >= L.total ? 1 : 0.25;
        view.x0 += (t.x0 - view.x0) * a; view.x1 += (t.x1 - view.x1) * a;
        view.y0 += (t.y0 - view.y0) * a; view.y1 += (t.y1 - view.y1) * a;
        draw();
        progress(L.iter / L.total);
        status(L.iter < L.total ? 'Ordnen: Runde ' + L.iter + ' von ' + L.total + ' …' : doneText());
        if (L.iter < L.total && cv && cv.isConnected) anim = requestAnimationFrame(tick);
        else { anim = 0; while (L.iter < L.total) L.step(); view = targetView(); progress(1); draw(); status(doneText()); }
      };
      anim = requestAnimationFrame(tick);
    }

    /* Paarwörter in die Pfeil-Ansicht gleiten lassen (und zurück). */
    function setAligned(v) {
      aligned = v;
      if (alignAnim) { cancelAnimationFrame(alignAnim); alignAnim = 0; }
      if (alignBtn) alignBtn.textContent = aligned ? '↺ Zurück zur Karte' : '⇉ Pfeile nebeneinander';
      if (againBtn) againBtn.disabled = aligned;
      const goal = aligned ? 1 : 0;
      status(doneText());
      if (reduced() || !cv) { alignT = goal; draw(); return; }
      const from = alignT, t0 = performance.now(), dur = 700;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        alignT = from + (goal - from) * e;
        draw();
        alignAnim = k < 1 && cv && cv.isConnected ? requestAnimationFrame(step) : 0;
        if (!alignAnim) { alignT = goal; draw(); }
      };
      alignAnim = requestAnimationFrame(step);
    }

    function hitTest(ev) {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const P = screenPos();
      const pairSet = filter.pairs && alignT > 0.5 ? pairSets[filter.pairs] : null;
      let best = null, bd = 18 * 18;
      P.forEach((p, i) => {
        if (pairSet && !pairSet.has(word(i))) return;
        const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }

    function select(w) {
      if (!M) return;
      w = resolve(w);
      if (!w) return;
      sel = w;
      draw();
      renderCard();
    }
    /* Auswahl durch die Person selbst (Tipp, Suche, Nachbar). */
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

      const pi = pairInfo(w);
      if (pi) {
        const f = pi.f, pr = pi.pair, pm = pairModel(f.pairs).M;
        const other = pr[0] === w ? pr[1] : pr[0];
        const sec0 = el('div', 'wm-sec');
        sec0.appendChild(el('h4', null, 'Wort-Rechnen'));
        const guess = WordKinds.predict(pm, A[f.pairs], w);
        const fwd = pr[0] === w;
        sec0.appendChild(el('p', 'small', showWord(w) + (fwd ? ' + Richtung „' + f.a + ' → ' + f.b + '“'
          : ' + Richtung „' + f.b + ' → ' + f.a + '“') + ' ≈ …'));
        const row = el('div', 'wm-chips');
        guess.forEach(([x, sv]) => {
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
      ensure();
      container = host;
      const box = el('div', 'wm-box');

      const filterRow = el('div', 'wm-filter');
      filterRow.setAttribute('role', 'radiogroup');
      filterRow.setAttribute('aria-label', 'Welche Wörter hervorheben?');
      FILTERS.forEach(f => {
        const b = el('button', 'wm-mode' + (f === filter ? ' on' : ''), f.label);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', f === filter ? 'true' : 'false');
        b.addEventListener('click', () => {
          if (f === filter) return;
          filter = f;
          if (alignAnim) { cancelAnimationFrame(alignAnim); alignAnim = 0; }
          aligned = false; alignT = 0;
          [...filterRow.children].forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
          alignBtn.hidden = !f.pairs;
          alignBtn.textContent = '⇉ Pfeile nebeneinander';
          againBtn.disabled = false;
          renderLegend();
          /* Auf ein passendes Wort springen, damit die Detailkarte zum Filter passt. */
          if (f.pairs) {
            const pi = sel && pairInfo(sel);
            if (A[f.pairs].length && (!pi || pi.f !== f)) sel = A[f.pairs][0][0];
          } else fitSel();
          renderCard();
          draw();
          status(L && L.iter >= L.total ? doneText() : statusEl.textContent);
        });
        filterRow.appendChild(b);
      });
      box.appendChild(filterRow);

      const tools = el('div', 'wm-tools');
      againBtn = el('button', 'btn', '▶ Karte neu ordnen');
      againBtn.type = 'button';
      againBtn.disabled = aligned;
      againBtn.addEventListener('click', animate);
      alignBtn = el('button', 'btn', aligned ? '↺ Zurück zur Karte' : '⇉ Pfeile nebeneinander');
      alignBtn.type = 'button';
      alignBtn.hidden = !filter.pairs;
      alignBtn.addEventListener('click', () => setAligned(!aligned));
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
        const hit = [M.words.find(w => w === q), resolve(q), M.words.find(w => w.startsWith(q))].find(w => w && posOf(w) >= 0);
        if (hit) pick(hit);
      });
      tools.append(againBtn, alignBtn, sw, search);
      box.appendChild(tools);

      cv = el('canvas', 'wm-canvas');
      cv.tabIndex = 0;
      cv.setAttribute('aria-label', 'Wortkarte. Wörter mit ähnlichen Nachbarn liegen nah beieinander, Linien verbinden die ähnlichsten. Wähle Wörter über die Suche oder die Liste darunter.');
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
      statusEl = el('span', null, 'Gestrichelt = Wörter aus deiner Frage · Linien = die ähnlichsten');
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
        const start = (opts.highlight ? opts.highlight() : []).map(resolve).find(w => w);
        sel = start || (M.words.length ? M.words[0] : null);
      }
      renderCard();
      requestAnimationFrame(() => {
        resize();
        if (!L) { progress(0); animate(); }
        else { draw(); status(doneText()); }
      });
      return box;
    }

    function destroy() {
      stopAnim();
      if (alignAnim) { cancelAnimationFrame(alignAnim); alignAnim = 0; }
      window.removeEventListener('resize', onResize);
      cv = null; cx = null; cardEl = null; statusEl = null; progEl = null; container = null; legendEl = null;
      alignBtn = null; againBtn = null;
    }

    return { mount, destroy, select, redraw: draw, get selected() { return sel; } };
  }

  return { create };
})();
