/* Vokabular + Trainingspaare für das echte Mini-Netz (Phase 4). Voller Tokenstrom (inkl. Stopwörter/Satzzeichen),
   Frequenz-gekappt + <unk> für den Rest. Kontextlänge C ist vor dem Training fix (siehe phase4.js). */
function buildPhase4Data(texts, opts) {
  const o = Object.assign({ vocabCap: 600, C: 3 }, opts || {});
  const UNK = '<unk>';
  const docs = texts.map(t => tokenize(t.body));

  const freq = new Map();
  docs.forEach(toks => toks.forEach(t => freq.set(t.t, (freq.get(t.t) || 0) + 1)));

  /* Schreibweise für die Anzeige: das Netz rechnet mit kleingeschriebenen Wörtern, im Text soll
     "Mars" aber groß stehen. Gezählt wird nur mitten im Satz (am Satzanfang ist alles groß). */
  const caps = new Map(), forms = new Map();
  docs.forEach(toks => toks.forEach(t => {
    if (t.punct || t.start) return;
    const c = caps.get(t.t) || [0, 0];
    if (t.raw[0] !== t.raw[0].toLowerCase()) c[0]++; else c[1]++;
    caps.set(t.t, c);
    /* häufigste Großschreibung merken („KI“ statt „Ki“) */
    const f = forms.get(t.t) || new Map();
    f.set(t.raw, (f.get(t.raw) || 0) + 1);
    forms.set(t.t, f);
  }));
  function display(w) {
    const c = caps.get(w);
    if (!c || c[0] <= c[1]) return w;
    let best = null, bn = 0;
    forms.get(w).forEach((n, raw) => { if (raw[0] !== raw[0].toLowerCase() && n > bn) { bn = n; best = raw; } });
    return best || w.charAt(0).toUpperCase() + w.slice(1);
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const kept = sorted.filter(w => w !== '.').slice(0, Math.max(0, o.vocabCap - 2));
  const vocab = [UNK, '.', ...kept];
  const id = new Map(vocab.map((w, i) => [w, i]));
  const vocabSet = new Set(vocab);

  function toId(w) { return id.has(w) ? id.get(w) : id.get(UNK); }

  /* Inhaltswörter je Text (ohne <unk>): daraus zieht das Training die Übungs-„Fragen“ (drawTopic). */
  const unkId = id.get(UNK);
  function contentIds(toks) { return [...new Set(toks.filter(isContentTok).map(t => toId(t.t)))].filter(i => i !== unkId); }

  const pairs = [];
  docs.forEach(toks => {
    const topic = contentIds(toks);
    const stream = Array(o.C).fill('.').concat(toks.map(t => t.t));
    for (let i = o.C; i < stream.length; i++) {
      const ctx = stream.slice(i - o.C, i).map(toId);
      pairs.push({ ctx, target: toId(stream[i]), topic });
    }
  });

  return { vocab, id, toId, contentIds, pairs, C: o.C, UNK, vocabSize: vocab.length, display };
}
