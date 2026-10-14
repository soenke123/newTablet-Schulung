/* Frage -> Lemmata -> passende Texte. IDF-gewichtete Exakt-Treffer + Ähnlichkeits-Fallback (SIM_MIN). */
const SIM_MIN = 0.3;

function questionLemmas(M, q) {
  const toks = tokenize(q);
  const out = [];
  const seen = new Set();
  toks.forEach(t => {
    if (t.punct || STOP.has(t.t) || /^\d+$/.test(t.t) || t.t.length < 2) return;
    let l = t.t;
    if (!M.lemFreq.has(l)) {
      for (const s of SUFFIXES) {
        if (l.length - s.length >= 3 && l.endsWith(s) && M.lemFreq.has(l.slice(0, -s.length))) { l = l.slice(0, -s.length); break; }
      }
    }
    if (!M.lemFreq.has(l)) {
      for (const s of SUFFIXES) { if (M.lemFreq.has(l + s)) { l = l + s; break; } }
    }
    if (!M.lemFreq.has(l)) l = M.lemma(l);
    if (seen.has(l)) return;
    seen.add(l);
    out.push({ raw: t.raw, lemma: l, known: M.lemFreq.has(l), inMap: M.wIdx.has(l) });
  });
  return out;
}

function retrieve(M, q) {
  const ql = questionLemmas(M, q);
  const nd = M.docs.length;
  const results = M.docs.map(d => {
    let score = 0;
    const marks = new Map(); // Token-Index im Doc -> {type, q, sim}
    const hits = [];
    ql.forEach(x => {
      if (!x.known) return;
      const df = M.lemDocs.get(x.lemma) ? M.lemDocs.get(x.lemma).size : 0;
      const idf = Math.log(1 + nd / (1 + df));
      if (d.lemmas.has(x.lemma)) {
        score += idf;
        hits.push({ q: x.lemma, type: 'exact', w: x.lemma, sim: 1 });
        d.content.forEach(c => { if (c.l === x.lemma) marks.set(c.i, { type: 'exact', q: x.lemma, sim: 1 }); });
        return;
      }
      if (!x.inMap) return;
      const qi = M.wIdx.get(x.lemma);
      let best = null, bs = SIM_MIN;
      d.lemmas.forEach(l => {
        const li = M.wIdx.get(l);
        if (li === undefined) return;
        const s = M.sim[qi][li];
        if (s > bs) { bs = s; best = l; }
      });
      if (best) {
        score += idf * bs * 0.8;
        hits.push({ q: x.lemma, type: 'similar', w: best, sim: bs });
        d.content.forEach(c => { if (c.l === best && !marks.has(c.i)) marks.set(c.i, { type: 'similar', q: x.lemma, sim: bs }); });
      }
    });
    return { doc: d, score, marks, hits };
  });
  results.sort((a, b) => b.score - a.score || a.doc.id - b.doc.id);
  return { ql, results };
}
