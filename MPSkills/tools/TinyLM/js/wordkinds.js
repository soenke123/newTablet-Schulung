/* Wortarten und Wortpaare für die Filter der Wortkarte (Verben, spielt → spielte, Lehrer → Lehrerin).

   Anders als cooccurrence.js (Phase-2-Modell: nur Nomen, Grundformen, Fenster ±4 ohne Füllwörter)
   rechnet dieses Modell mit den Wörtern GENAU so, wie sie im Text stehen („spielte“ bleibt „spielte“),
   und merkt sich nur das Wort DIREKT davor und DIREKT danach — auch Füllwörter wie „der“, „die“,
   „er“, „heute“, „gestern“. Genau dort steckt der Unterschied zwischen Lehrer und Lehrerin
   (der/die) und zwischen spielt und spielte (heute/gestern).

   Woran das Programm Verben erkennt: an ihrem Platz im Satz (nach er/sie/ich, nach heute/gestern,
   nach „der Hund …“, am Satzanfang nach einem Namen). Gegenwart/Vergangenheit: an Zeitwörtern im
   selben Satz (heute, jetzt ↔ gestern, damals, früher, letzte …) und an der Endung -te.
   Welche zwei Wörter ein Paar sind, steht in kleinen Regeln/Listen unten — das ist Vorwissen, nicht
   gelernt. Gelernt ist nur, WO die Wörter auf der Karte landen. */
const WordKinds = (() => {
  const PRON = new Set(['er', 'sie', 'es', 'ich', 'wir', 'man', 'du', 'ihr']);
  const TIME = new Set(['heute', 'gestern', 'jetzt', 'damals', 'früher', 'dann', 'danach']);
  const ART = new Set(['der', 'die', 'das', 'ein', 'eine', 'jeder', 'jede', 'jedes', 'unser', 'unsere', 'mein', 'meine']);
  const PAST_MARK = new Set(['gestern', 'damals', 'früher', 'letzten', 'letzte', 'letztes', 'letzter']);
  const PRES_MARK = new Set(['heute', 'jetzt']);
  /* Starke Verben: Gegenwart → Vergangenheit (schwache Verben findet die Regel „-t → -te“). */
  const STRONG = {
    'läuft': 'lief', 'schläft': 'schlief', 'liest': 'las', 'schreibt': 'schrieb', 'geht': 'ging', 'isst': 'aß',
    'frisst': 'fraß', 'findet': 'fand', 'fährt': 'fuhr', 'fängt': 'fing', 'kommt': 'kam', 'sieht': 'sah',
    'sitzt': 'saß', 'trägt': 'trug', 'wirft': 'warf', 'bekommt': 'bekam', 'hilft': 'half', 'spricht': 'sprach',
    'steht': 'stand', 'fliegt': 'flog', 'zieht': 'zog', 'gibt': 'gab', 'nimmt': 'nahm', 'weiß': 'wusste',
    'bringt': 'brachte', 'denkt': 'dachte', 'trinkt': 'trank', 'singt': 'sang', 'heißt': 'hieß', 'fällt': 'fiel'
  };
  /* Paare, die keine Endung -in haben. */
  const GENDER = {
    mann: 'frau', vater: 'mutter', sohn: 'tochter', bruder: 'schwester', opa: 'oma', onkel: 'tante',
    kater: 'katze', junge: 'mädchen', herr: 'dame', könig: 'königin', prinz: 'prinzessin'
  };
  const UML = { a: 'ä', o: 'ö', u: 'ü' };

  function analyze(texts) {
    const docs = texts.map((tx, i) => ({ id: i, theme: tx.theme, own: !!tx.own, title: tx.title, toks: tokenize(tx.body) }));
    const freq = new Map(), caps = new Map(), verbPos = new Map(), past = new Map(), pres = new Map(), themes = new Map();
    const inc = (m, k, v) => m.set(k, (m.get(k) || 0) + (v || 1));
    docs.forEach(d => {
      const T = d.toks;
      /* Zeitwörter je Satz */
      const sentMark = new Map();
      T.forEach(t => {
        if (t.punct) return;
        const s = sentMark.get(t.sent) || { past: 0, pres: 0 };
        if (PAST_MARK.has(t.t)) s.past++;
        if (PRES_MARK.has(t.t)) s.pres++;
        sentMark.set(t.sent, s);
      });
      T.forEach((t, i) => {
        if (t.punct) return;
        t.lemma = t.t;   // für das Beispiel auf der Detailkarte
        inc(freq, t.t);
        const key = d.own ? 'eigen' : d.theme;
        if (!themes.has(t.t)) themes.set(t.t, {});
        const th = themes.get(t.t); th[key] = (th[key] || 0) + 1;
        if (!t.start) {
          const c = caps.get(t.t) || [0, 0];
          if (t.raw[0] !== t.raw[0].toLowerCase()) c[0]++; else c[1]++;
          caps.set(t.t, c);
        }
        const p1 = T[i - 1], p2 = T[i - 2], n1 = T[i + 1];
        const word = x => x && !x.punct;
        const upper = x => word(x) && x.raw[0] !== x.raw[0].toLowerCase();
        const lower = t.raw[0] === t.raw[0].toLowerCase() || t.start;
        let v = false;
        if (lower && word(p1) && (PRON.has(p1.t) || TIME.has(p1.t))) v = true;
        else if (lower && word(n1) && PRON.has(n1.t) && word(p1)) v = true;
        else if (lower && upper(p1) && word(p2) && ART.has(p2.t)) v = true;
        else if (lower && upper(p1) && p1.start) v = true;   // „Leon spielt …“
        if (v && !t.start) inc(verbPos, t.t);
        const s = sentMark.get(t.sent);
        if (s) { if (s.past) inc(past, t.t, s.past); if (s.pres) inc(pres, t.t, s.pres); }
      });
    });

    const isNoun = w => { const c = caps.get(w); return !!c && c[0] > c[1]; };
    const content = w => !STOP.has(w) && w.length > 1 && !/^\d/.test(w);
    const MARK = new Set([...TIME, ...PAST_MARK, ...PRES_MARK, ...PRON, ...ART]);
    const isVerb = w => content(w) && !isNoun(w) && !MARK.has(w) && !/(em|er|es|ste)$/.test(w) &&
      (verbPos.get(w) || 0) / freq.get(w) >= 0.5;

    /* Wortpaare — nur wenn beide Wörter in den Texten vorkommen. */
    const has = w => freq.has(w);
    const tensePairs = [], seenT = new Set();
    for (const w of freq.keys()) {
      if (isNoun(w)) continue;
      let p = null;
      if (STRONG[w] && has(STRONG[w])) p = STRONG[w];
      else if (/[^e]t$/.test(w) && has(w + 'e') && !isNoun(w + 'e') && w.length > 3 && (isVerb(w) || isVerb(w + 'e'))) p = w + 'e';
      if (p && !seenT.has(w)) { tensePairs.push([w, p]); seenT.add(w); seenT.add(p); }
    }
    const genderPairs = [], seenG = new Set();
    for (const w of freq.keys()) {
      if (!isNoun(w) || seenG.has(w)) continue;
      const cands = [];
      if (GENDER[w]) cands.push(GENDER[w]);
      cands.push(w + 'in');
      const um = w.replace(/([aou])([^aeiouäöü]*)$/, (m, v, rest) => UML[v] + rest);
      if (um !== w) cands.push(um + 'in');
      if (w.endsWith('e')) cands.push(w.slice(0, -1) + 'in');
      const f = cands.find(c => has(c) && isNoun(c));
      if (f) { genderPairs.push([w, f]); seenG.add(w); seenG.add(f); }
    }

    function tenseOf(w) {
      for (const [a, b] of tensePairs) { if (w === a) return 'pres'; if (w === b) return 'past'; }
      const pa = past.get(w) || 0, pr = pres.get(w) || 0;
      if (pa > pr) return 'past';
      if (pr > pa) return 'pres';
      return null;
    }
    function themeOf(w) {
      const th = themes.get(w) || {};
      let best = null, bv = 0, tot = 0;
      for (const k in th) { tot += th[k]; if (th[k] > bv) { bv = th[k]; best = k; } }
      return { theme: best, share: tot ? bv / tot : 0, counts: th };
    }
    const verbs = [...freq.keys()].filter(isVerb).sort((a, b) => freq.get(b) - freq.get(a) || a.localeCompare(b, 'de'));
    return { docs, freq, isNoun, isVerb, verbs, tensePairs, genderPairs, tenseOf, themeOf };
  }

  /* Vektoren nur aus „Wort direkt davor“ / „Wort direkt danach“ (PPMI), für die gewählten Zeilenwörter.
     Liefert dieselbe Form wie buildModel(), damit Wortkarte und neighbors() damit arbeiten können. */
  function model(A, rows, opts) {
    const win = (opts && opts.window) || 0;
    const words = [...new Set(rows)].filter(w => A.freq.has(w));
    const wIdx = new Map(words.map((w, i) => [w, i]));
    const cIdx = new Map(), ctxWords = [], cells = words.map(() => new Map());
    const feat = k => { if (!cIdx.has(k)) { cIdx.set(k, ctxWords.length); ctxWords.push(k); } return cIdx.get(k); };
    A.docs.forEach(d => d.toks.forEach((t, i) => {
      const wi = wIdx.get(t.t);
      if (wi === undefined || t.punct) return;
      const p = d.toks[i - 1], n = d.toks[i + 1];
      const add = k => { const j = feat(k); cells[wi].set(j, (cells[wi].get(j) || 0) + 1); };
      if (p && !p.punct) add('„' + p.t + '“ davor');
      if (n && !n.punct) add('„' + n.t + '“ danach');
      /* Thema: Inhaltswörter im selben Satz (bis win Wörter weit) — Füllwörter zählen hier nicht. */
      for (let k = Math.max(0, i - win); win && k <= Math.min(d.toks.length - 1, i + win); k++) {
        const o = d.toks[k];
        if (k === i || o.punct || o.sent !== t.sent || STOP.has(o.t) || o.t === t.t || o.t.length < 3) continue;
        add(o.t);
      }
    }));
    const W = words.length, Cn = ctxWords.length;
    const co = cells.map(m => { const r = new Float64Array(Cn); m.forEach((v, j) => { r[j] = v; }); return r; });
    let N = 0; const rowS = new Float64Array(W), colS = new Float64Array(Cn);
    cells.forEach((m, i) => m.forEach((v, j) => { N += v; rowS[i] += v; colS[j] += v; }));
    let colA = 0; const colP = new Float64Array(Cn);
    for (let j = 0; j < Cn; j++) { colP[j] = Math.pow(colS[j], 0.75); colA += colP[j]; }
    const vec = cells.map((m, i) => {
      const r = new Float64Array(Cn); let norm = 0;
      m.forEach((v, j) => {
        const pmi = Math.log((v / N) / ((rowS[i] / N) * (colP[j] / colA)));
        if (pmi > 0) { r[j] = pmi; norm += pmi * pmi; }
      });
      norm = Math.sqrt(norm) || 1;
      m.forEach((v, j) => { r[j] /= norm; });
      return r;
    });
    const nz = cells.map(m => [...m.keys()]);
    const sim = Array.from({ length: W }, () => new Float64Array(W));
    for (let i = 0; i < W; i++) for (let k = i; k < W; k++) {
      let s = 0; const a = vec[i], b = vec[k];
      for (const j of nz[i]) s += a[j] * b[j];
      sim[i][k] = s; sim[k][i] = s;
    }
    return {
      docs: A.docs, words, wIdx, ctxWords, co, vec, sim,
      lemFreq: A.freq, lemma: w => w, themeOf: A.themeOf, isNoun: A.isNoun
    };
  }

  /* Karte, auf der man Paare vergleichen kann: links → rechts = die mittlere Richtung aller Paare
     (z. B. von „spielt“ zu „spielte“), oben ↔ unten = was sonst die Wörter am meisten unterscheidet. */
  function projection(M, pairs) {
    const Cn = M.ctxWords.length, n = M.words.length;
    const dir = new Float64Array(Cn);
    let used = 0;
    pairs.forEach(([a, b]) => {
      const ia = M.wIdx.get(a), ib = M.wIdx.get(b);
      if (ia === undefined || ib === undefined) return;
      for (let j = 0; j < Cn; j++) dir[j] += M.vec[ib][j] - M.vec[ia][j];
      used++;
    });
    let dn = 0; for (let j = 0; j < Cn; j++) dn += dir[j] * dir[j];
    dn = Math.sqrt(dn) || 1;
    for (let j = 0; j < Cn; j++) dir[j] /= dn;
    const xs = M.vec.map(v => { let s = 0; for (let j = 0; j < Cn; j++) s += v[j] * dir[j]; return s; });
    /* Rest ohne die Richtung, zentriert; davon die Hauptachse (Potenzmethode auf der n×n-Gram-Matrix). */
    const R = M.vec.map((v, i) => Float64Array.from(v, (x, j) => x - xs[i] * dir[j]));
    const mean = new Float64Array(Cn);
    R.forEach(r => { for (let j = 0; j < Cn; j++) mean[j] += r[j] / n; });
    R.forEach(r => { for (let j = 0; j < Cn; j++) r[j] -= mean[j]; });
    const G = R.map(a => R.map(b => { let s = 0; for (let j = 0; j < Cn; j++) s += a[j] * b[j]; return s; }));
    let u = Array.from({ length: n }, (_, i) => Math.sin(i + 1));
    let lam = 0;
    for (let it = 0; it < 80; it++) {
      const w = G.map(row => row.reduce((s, g, k) => s + g * u[k], 0));
      lam = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      u = w.map(x => x / lam);
    }
    const ys = u.map(x => x * Math.sqrt(lam));
    return { Y: xs.map((x, i) => [x, ys[i]]), pairs: used };
  }

  /* Wort-Rechnen: Wort + mittlere Richtung der ANDEREN Paare → welches Kartenwort liegt am nächsten? */
  function predict(M, pairs, w) {
    const i = M.wIdx.get(w);
    if (i === undefined) return [];
    const Cn = M.ctxWords.length;
    const others = pairs.filter(p => p[0] !== w && p[1] !== w && M.wIdx.has(p[0]) && M.wIdx.has(p[1]));
    if (!others.length) return [];
    const back = pairs.some(p => p[1] === w);   // vom zweiten Wort aus rückwärts rechnen
    const t = Float64Array.from(M.vec[i]);
    others.forEach(([a, b]) => {
      const va = M.vec[M.wIdx.get(a)], vb = M.vec[M.wIdx.get(b)];
      for (let j = 0; j < Cn; j++) t[j] += (back ? va[j] - vb[j] : vb[j] - va[j]) / others.length;
    });
    let tn = 0; for (let j = 0; j < Cn; j++) tn += t[j] * t[j];
    tn = Math.sqrt(tn) || 1;
    return M.words.filter(x => x !== w).map(x => {
      const v = M.vec[M.wIdx.get(x)]; let s = 0;
      for (let j = 0; j < Cn; j++) s += v[j] * t[j];
      return [x, s / tn];
    }).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }

  return { analyze, model, projection, predict };
})();
