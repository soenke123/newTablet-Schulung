/* Wortwolke für die Phase „Wörter als Punkte“ (Prototyp 12.11.2026).

   Jedes Wort wird ein Punkt mit DIMS = 20 Zahlen. Gebaut wie die Wortkarte (wordkinds.js, Fenster 4):
   Merkmale = das Wort direkt davor/danach + Inhaltswörter im selben Satz, dann auf 20 Richtungen
   verdichtet (Eigenvektoren der Ähnlichkeitsmatrix). Gemessen 12.11.2026 mit der Gruppen-Probe
   (Tiere/Himmel/Personen/Futter): 59 % der 5 nächsten Nachbarn aus derselben Gruppe.

   Darauf zwei Dinge, die Tiny damit macht:
   - search(W, frage): die Frage wird ein Punkt (Mittel ihrer Wörter), die Texte sind Punkte (Mittel
     ihrer Wörter) — gewählt werden die Texte mit dem kleinsten Winkel zur Frage.
   - borrow(…): steht die Wortfolge so in keinem Text, tauscht Tiny ein Wort der Folge gegen einen
     nahen Punkt in der Wolke und schaut, was DANN dahinter stand („Welpe frisst“ → „Hund frisst“).
     Bewusst NICHT: das nächste Wort als nächsten Nachbarn nehmen (Nähe = kann an derselben Stelle
     stehen, nicht = kommt danach).

   Wolke.build(texts) -> W  { words, idx, emb, xyz, kind, theme, neighbors(w,k), sim(a,b), resolve(raw),
                              shared(a,b,k), keep3 }  (Wörter klein geschrieben, wie im Text) */
const Wolke = (() => {
  const DIMS = 20;
  const WIN = 4;

  function denseEmb(sim, n, k) {
    k = Math.min(k, n);
    let Q = Array.from({ length: k }, (_, c) => Float64Array.from({ length: n }, (_, i) => Math.sin((i + 1) * (c + 1) * 1.3)));
    const lam = new Float64Array(k);
    for (let it = 0; it < 40; it++) {
      const Z = Q.map(q => {
        const z = new Float64Array(n);
        for (let i = 0; i < n; i++) { let s = 0; const r = sim[i]; for (let j = 0; j < n; j++) s += r[j] * q[j]; z[i] = s; }
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
    const raw = Array.from({ length: n }, (_, i) => Q.map((q, c) => q[i] * Math.sqrt(lam[c])));
    const mean = new Float64Array(k);
    raw.forEach(v => v.forEach((x, c) => { mean[c] += x / n; }));
    return raw.map(v => v.map((x, c) => x - mean[c]));
  }

  const norm = v => { const s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map(x => x / s); };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  /* Die drei Hauptrichtungen der 20 Zahlen = das 3D-Bild (PCA, nichts erzwungen). */
  function pca3(E) {
    const n = E.length, d = E[0].length;
    const C = Array.from({ length: d }, () => new Float64Array(d));
    E.forEach(v => { for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) C[a][b] += v[a] * v[b]; });
    const axes = [];
    for (let c = 0; c < 3; c++) {
      let q = Float64Array.from({ length: d }, (_, i) => Math.cos((i + 1) * (c + 2)));
      for (let it = 0; it < 80; it++) {
        let z = new Float64Array(d);
        for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += C[a][b] * q[b]; z[a] = s; }
        axes.forEach(u => { const p = dot(u, z); for (let a = 0; a < d; a++) z[a] -= p * u[a]; });
        const nn = Math.sqrt(z.reduce((s, x) => s + x * x, 0)) || 1;
        q = z.map(x => x / nn);
      }
      axes.push(q);
    }
    const P = E.map(v => axes.map(u => dot(u, v)));
    /* Jede Achse auf dieselbe Streuung bringen (sonst klumpt alles in der Mitte), Ausreißer kappen. */
    const sd = [0, 1, 2].map(c => Math.sqrt(P.reduce((a, p) => a + p[c] * p[c], 0) / n) || 1);
    return P.map(p => p.map((x, c) => Math.max(-1, Math.min(1, x / (2.2 * sd[c])))));
  }

  function build(texts) {
    const A = WordKinds.analyze(texts);
    const rows = [...A.freq.keys()].filter(w => A.freq.get(w) >= 2 && w.length > 2 && !STOP.has(w) && (A.isNoun(w) || A.isVerb(w)));
    const M = WordKinds.model(A, rows, { window: WIN });
    const n = M.words.length;
    if (n < 4) return null;
    const E = denseEmb(M.sim, n, DIMS).map(norm);
    const idx = new Map(M.words.map((w, i) => [w, i]));
    const S = E.map(a => E.map(b => dot(a, b)));
    const xyz = pca3(E);
    const kind = M.words.map(w => A.isNoun(w) ? 'nomen' : 'verb');
    const theme = M.words.map(w => { const t = A.themeOf(w); return t ? t.theme : null; });

    function neighbors(w, k, filter) {
      const i = idx.get(w);
      if (i == null) return [];
      const out = [];
      for (let j = 0; j < n; j++) if (j !== i && (!filter || filter(j))) out.push([M.words[j], S[i][j]]);
      return out.sort((a, b) => b[1] - a[1]).slice(0, k);
    }
    const sim = (a, b) => { const i = idx.get(a), j = idx.get(b); return i == null || j == null ? 0 : S[i][j]; };
    /* Wort aus der Frage → Punkt in der Wolke (Endungen locker: Welpen → Welpe). */
    function resolve(raw) {
      const t = raw.toLowerCase();
      if (idx.has(t)) return t;
      for (const s of ['en', 'n', 'e', 's', 'er', 'es']) if (t.endsWith(s) && idx.has(t.slice(0, -s.length))) return t.slice(0, -s.length);
      for (const s of ['e', 'n', 'en']) if (idx.has(t + s)) return t + s;
      return null;
    }
    /* Warum liegen a und b nah? Die Merkmale, die beide stark haben. */
    function shared(a, b, k) {
      const i = M.wIdx.get(a), j = M.wIdx.get(b);
      if (i == null || j == null) return [];
      const out = [];
      for (let c = 0; c < M.ctxWords.length; c++) { const p = M.vec[i][c] * M.vec[j][c]; if (p > 0) out.push([M.ctxWords[c], p]); }
      return out.sort((x, y) => y[1] - x[1]).slice(0, k).map(x => x[0]);
    }
    /* Wie ehrlich ist das 3D-Bild? Anteil der 3 ähnlichsten Wörter, die im Bild unter den 10 nächsten liegen. */
    let hit = 0, tot = 0;
    for (let i = 0; i < n; i++) {
      const top = [...Array(n).keys()].filter(j => j !== i).sort((a, b) => S[i][b] - S[i][a]).slice(0, 3);
      const d3 = j => Math.hypot(xyz[i][0] - xyz[j][0], xyz[i][1] - xyz[j][1], xyz[i][2] - xyz[j][2]);
      const near = new Set([...Array(n).keys()].filter(j => j !== i).sort((a, b) => d3(a) - d3(b)).slice(0, 10));
      top.forEach(j => { tot++; if (near.has(j)) hit++; });
    }
    return { words: M.words, idx, emb: E, xyz, kind, theme, neighbors, sim, resolve, shared, keep3: tot ? hit / tot : 0, dims: DIMS };
  }

  /* Texte als Punkte: Mittel der Wort-Punkte, die im Text vorkommen (Füllwörter sind keine Punkte). */
  function docPoints(W, texts) {
    return texts.map(t => {
      const v = new Array(W.dims).fill(0); let c = 0;
      tokenize(t.body).forEach(tk => { const i = W.idx.get(tk.t); if (i == null) return; c++; W.emb[i].forEach((x, d) => { v[d] += x; }); });
      return { text: t, v: c ? norm(v) : null };
    });
  }

  /* Frage → Punkt → die nächsten Texte. qwords: welche Wörter der Frage zu Punkten wurden. */
  function search(W, docs, question) {
    const qwords = [];
    tokenize(question).forEach(tk => {
      if (tk.punct || STOP.has(tk.t)) return;
      const w = W.resolve(tk.raw);
      qwords.push({ raw: tk.raw, w });
    });
    const known = qwords.filter(q => q.w);
    if (!known.length) return { qwords, q: null, ranked: [] };
    const v = new Array(W.dims).fill(0);
    known.forEach(q => W.emb[W.idx.get(q.w)].forEach((x, d) => { v[d] += x; }));
    const q = norm(v);
    const ranked = docs.filter(d => d.v).map(d => ({ text: d.text, score: dot(q, d.v) })).sort((a, b) => b.score - a.score);
    return { qwords, q, ranked };
  }

  /* Punkt der Frage im 3D-Bild: dieselben drei Achsen, über die nächsten Wörter angenähert. */
  function pointNear(W, vec) {
    const sims = W.emb.map(e => dot(e, vec));
    const top = sims.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, 5);
    const sum = top.reduce((a, x) => a + Math.max(0, x[0]), 0) || 1;
    return [0, 1, 2].map(c => top.reduce((a, [s, i]) => a + Math.max(0, s) * W.xyz[i][c], 0) / sum);
  }

  /* „Was frisst ein Welpe?“ → Satzanfang „Ein Welpe frisst“ (Fragewort weg, Verb nach hinten).
     Passt das Muster nicht, beginnt die Antwort wie in Phase 2 mit einem neuen Satz (null). */
  const QW = new Set(['was', 'wie', 'wo', 'wann', 'wer', 'warum', 'womit', 'wovon', 'wohin', 'woher']);
  const NOVERB = new Set(['viele', 'lange', 'oft', 'hoch', 'alt', 'groß', 'weit', 'schnell', 'schwer', 'heiß', 'kalt', 'viel']);
  const ART = new Set(['ein', 'eine', 'der', 'die', 'das', 'mein', 'meine', 'unser', 'unsere']);
  function seedFrom(question) {
    const t = tokenize(question).filter(x => !x.punct);
    if (t.length < 3 || !QW.has(t[0].t)) return null;
    const verb = t[1];
    /* „Wie viele …“, „Wie lange …“: kein Verb an Stelle 2 → kein Satzanfang. */
    if (/^[A-ZÄÖÜ]/.test(verb.raw) || NOVERB.has(verb.t)) return null;
    let i = 2, art = null;
    if (ART.has(t[i].t)) { art = t[i]; i++; }
    const noun = t[i];
    if (!noun || !/^[A-ZÄÖÜ]/.test(noun.raw) || i !== t.length - 1 && t.length - 1 - i > 2) return null;
    return (art ? [art.raw.charAt(0).toUpperCase() + art.raw.slice(1), noun.raw, verb.raw] : [noun.raw, verb.raw]);
  }

  /* Kandidaten wie candidates() in ngram.js — aber wenn die volle Wortfolge in keinem Text steht,
     erst BORGEN (ein Wort der Folge gegen einen nahen Punkt tauschen), bevor Tiny Wörter vergisst.
     Ergebnis wie candidates(), dazu borrow: { from, to, sim, k, plain } (plain = was Tiny ohne
     Wolke genommen hätte, zum Vergleich). */
  const SIM_MIN = 0.35;
  /* session.sources = erst die nTop gefundenen Texte, dahinter alle übrigen. Geschrieben wird nur aus
     den gefundenen; geborgt wird zuerst dort, sonst aus allen Texten (borrow.wide). */
  function candidatesWithCloud(W, session, n, temp, nTop) {
    nTop = nTop || session.sources.length;
    const top = session.sources.slice(0, nTop);
    const C = candidates({ sources: top, ctx: session.ctx, used: session.used }, n, temp);
    const ctx = session.ctx;
    const maxK = Math.min(n, ctx.length);
    if (C.uni || C.level >= maxK) return C;
    for (let k = maxK; k > C.level; k--) {
      const tail = ctx.slice(-k);
      let best = null;
      [top, session.sources].forEach((srcs, wide) => { if (best || (wide && srcs.length === top.length)) return;
      tail.forEach((w, pos) => {
        const i = W.idx.get(w);
        /* Nur Nomen tauschen (Welpe ≈ Hund). Verben zu tauschen änderte den Sinn zu stark
           („arbeitet“ ≈ „beginnt“ → „Die Tierärztin arbeitet um acht Uhr“). */
        if (i == null || STOP.has(w) || W.kind[i] !== 'nomen') return;
        W.neighbors(w, 6, j => W.kind[j] === 'nomen').forEach(([v, s]) => {
          if (s < SIM_MIN || (best && best.sim >= s)) return;
          const t2 = tail.slice(); t2[pos] = v;
          const occ = collectAt(srcs, session.used, k, t2);
          if (occ.length) best = { from: w, to: v, sim: s, k, occ, tail2: t2, wide: !!wide };
        });
      });
      });
      if (!best) continue;
      const agg = new Map();
      best.occ.forEach(o => {
        let a = agg.get(o.word);
        if (!a) { a = { word: o.word, w: 0, bySrc: new Map(), occ: [] }; agg.set(o.word, a); }
        const w = o.w * best.sim;
        a.w += w; a.bySrc.set(o.si, (a.bySrc.get(o.si) || 0) + w); a.occ.push(o);
      });
      const list = [...agg.values()].sort((a, b) => b.w - a.w || a.word.localeCompare(b.word, 'de'));
      const t = temp == null ? 1 : temp;
      let sum = 0;
      list.forEach(a => { a.s = t <= 0.001 ? 0 : Math.pow(a.w, 1 / t); sum += a.s; });
      if (t <= 0.001) list.forEach((a, i) => { a.p = i === 0 ? 1 : 0; }); else list.forEach(a => { a.p = a.s / sum; });
      return { level: k, n, uni: false, list, borrow: { from: best.from, to: best.to, sim: best.sim, k, tail2: best.tail2, wide: best.wide, plain: C } };
    }
    /* Mitten im Satz gar nichts gefunden (sonst springt Tiny auf einen Satzanfang: „arbeitet Wenn es …“):
       dann die Wortfolge in allen Texten suchen, ohne Tausch. */
    if (C.level === 0 && ctx[ctx.length - 1] !== '.' && session.sources.length > top.length) {
      const Cw = candidates(session, n, temp);
      if (Cw.level > 0) { Cw.wide = true; return Cw; }
    }
    return C;
  }

  return { build, docPoints, search, pointNear, seedFrom, candidatesWithCloud, SIM_MIN, DIMS };
})();
