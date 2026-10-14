/* Vokabular + Trainingspaare für das echte Mini-Netz (Phase 3). Voller Tokenstrom (inkl. Stopwörter/Satzzeichen),
   Frequenz-gekappt + <unk> für den Rest. Kontextlänge C ist vor dem Training fix (siehe phase3.js). */
function buildPhase3Data(texts, opts) {
  const o = Object.assign({ vocabCap: 600, C: 3 }, opts || {});
  const UNK = '<unk>';
  const docs = texts.map(t => tokenize(t.body));

  const freq = new Map();
  docs.forEach(toks => toks.forEach(t => freq.set(t.t, (freq.get(t.t) || 0) + 1)));

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const kept = sorted.filter(w => w !== '.').slice(0, Math.max(0, o.vocabCap - 2));
  const vocab = [UNK, '.', ...kept];
  const id = new Map(vocab.map((w, i) => [w, i]));
  const vocabSet = new Set(vocab);

  function toId(w) { return id.has(w) ? id.get(w) : id.get(UNK); }

  const pairs = [];
  docs.forEach(toks => {
    const stream = Array(o.C).fill('.').concat(toks.map(t => t.t));
    for (let i = o.C; i < stream.length; i++) {
      const ctx = stream.slice(i - o.C, i).map(toId);
      pairs.push({ ctx, target: toId(stream[i]) });
    }
  });

  return { vocab, id, toId, pairs, C: o.C, UNK, vocabSize: vocab.length };
}
