/* Nachschlage-Modell für Phase 2: PPMI-Kookkurrenz-Vektoren + Kosinus-Ähnlichkeit, auf Basis von vocab.js.
   Grundlage für Retrieval (retrieve.js), die "ähnliche Wörter"-Liste und die 2D-Wortkarte (wordmap.js). */
function buildModel(texts, opts) {
  const o = Object.assign({ minFreq: 2, window: 4, alpha: 0.75, simVocabCap: 600 }, opts || {});
  const docs = texts.map((tx, i) => ({ id: i, theme: tx.theme, own: !!tx.own, title: tx.title, body: tx.body, toks: tokenize(tx.body) }));

  const formFreq = new Map();
  docs.forEach(d => d.toks.forEach(t => {
    if (t.punct) return;
    if (!STOP.has(t.t) && !/^\d+$/.test(t.t)) formFreq.set(t.t, (formFreq.get(t.t) || 0) + 1);
  }));
  const lemma = createLemmatizer(formFreq);

  const lemFreq = new Map();
  const lemDocs = new Map();
  const lemCase = new Map();
  const lemTheme = new Map();
  docs.forEach(d => {
    d.content = [];
    d.toks.forEach((t, i) => {
      if (!isContentTok(t)) return;
      const l = lemma(t.t);
      t.lemma = l;
      d.content.push({ l, i });
      if (!lemTheme.has(l)) lemTheme.set(l, {});
      const th = lemTheme.get(l);
      const key = d.own ? 'eigen' : d.theme;
      th[key] = (th[key] || 0) + 1;
      if (!t.start) {
        const u = lemCase.get(l) || [0, 0];
        if (t.raw[0] !== t.raw[0].toLowerCase()) u[0]++; else u[1]++;
        lemCase.set(l, u);
      }
      lemFreq.set(l, (lemFreq.get(l) || 0) + 1);
      if (!lemDocs.has(l)) lemDocs.set(l, new Set());
      lemDocs.get(l).add(d.id);
    });
    d.lemmas = new Set(d.content.map(c => c.l));
  });

  const isNoun = l => { const u = lemCase.get(l); return !!u && u[0] > u[1]; };
  const words = [...lemFreq.keys()].filter(l => lemFreq.get(l) >= o.minFreq && isNoun(l))
    .sort((a, b) => lemFreq.get(b) - lemFreq.get(a) || a.localeCompare(b, 'de'))
    .slice(0, o.simVocabCap);
  const wIdx = new Map(words.map((w, i) => [w, i]));
  const ctxWords = [...lemFreq.keys()].filter(l => lemFreq.get(l) >= 2).sort();
  const cIdx = new Map(ctxWords.map((w, i) => [w, i]));
  const W = words.length, Cn = ctxWords.length;

  const co = Array.from({ length: W }, () => new Float64Array(Cn));
  docs.forEach(d => {
    const c = d.content;
    for (let a = 0; a < c.length; a++) {
      const wi = wIdx.get(c[a].l);
      if (wi === undefined) continue;
      for (let b = Math.max(0, a - o.window); b <= Math.min(c.length - 1, a + o.window); b++) {
        if (b === a) continue;
        const ci = cIdx.get(c[b].l);
        if (ci === undefined || c[b].l === c[a].l) continue;
        co[wi][ci] += 1;
      }
    }
  });

  let N = 0; const rowS = new Float64Array(W), colS = new Float64Array(Cn);
  for (let i = 0; i < W; i++) for (let j = 0; j < Cn; j++) { const v = co[i][j]; N += v; rowS[i] += v; colS[j] += v; }
  let colA = 0; const colP = new Float64Array(Cn);
  for (let j = 0; j < Cn; j++) { colP[j] = Math.pow(colS[j], o.alpha); colA += colP[j]; }
  const vec = Array.from({ length: W }, () => new Float64Array(Cn));
  for (let i = 0; i < W; i++) {
    let norm = 0;
    for (let j = 0; j < Cn; j++) {
      const v = co[i][j];
      if (!v) continue;
      const pmi = Math.log((v / N) / ((rowS[i] / N) * (colP[j] / colA)));
      if (pmi > 0) { vec[i][j] = pmi; norm += pmi * pmi; }
    }
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < Cn; j++) vec[i][j] /= norm;
  }
  const sim = Array.from({ length: W }, () => new Float64Array(W));
  for (let i = 0; i < W; i++) for (let k = i; k < W; k++) {
    let s = 0; const a = vec[i], b = vec[k];
    for (let j = 0; j < Cn; j++) s += a[j] * b[j];
    sim[i][k] = s; sim[k][i] = s;
  }

  /* Aus welchen Wortwelten kommt ein Wort? (Für die Themenfarben auf der Wortkarte.) */
  const themeOf = l => {
    const th = lemTheme.get(l) || {};
    let best = null, bv = 0, tot = 0;
    for (const k in th) { tot += th[k]; if (th[k] > bv) { bv = th[k]; best = k; } }
    return { theme: best, share: tot ? bv / tot : 0, counts: th };
  };

  return { docs, isNoun, words, wIdx, ctxWords, cIdx, co, vec, sim, lemFreq, lemDocs, lemma, themeOf, opts: o };
}

/* Wörter, die am häufigsten neben w stehen (Rohzählung aus der Kookkurrenz-Matrix). */
function topContexts(M, w, k) {
  const i = M.wIdx.get(w);
  if (i === undefined) return [];
  const arr = [];
  M.co[i].forEach((v, j) => { if (v > 0) arr.push([M.ctxWords[j], v]); });
  arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  return arr.slice(0, k);
}

/* Gemeinsame Nachbarn zweier Wörter, sortiert nach ihrem Beitrag zur Ähnlichkeit —
   die Antwort auf "warum hält die KI diese zwei Wörter für ähnlich?". */
function sharedContexts(M, a, b, k) {
  const i = M.wIdx.get(a), j = M.wIdx.get(b);
  if (i === undefined || j === undefined) return [];
  const arr = [];
  for (let c = 0; c < M.ctxWords.length; c++) {
    const p = M.vec[i][c] * M.vec[j][c];
    if (p > 0) arr.push([M.ctxWords[c], p]);
  }
  arr.sort((x, y) => y[1] - x[1]);
  return arr.slice(0, k).map(x => x[0]);
}

function neighbors(M, w, k) {
  const i = M.wIdx.get(w);
  if (i === undefined) return [];
  const arr = [];
  for (let j = 0; j < M.words.length; j++) if (j !== i) arr.push([M.words[j], M.sim[i][j]]);
  arr.sort((a, b) => b[1] - a[1]);
  return arr.slice(0, k);
}
