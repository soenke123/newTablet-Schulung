/* Gemeinsamer Generierungs-Motor für Phase 1 (gleichgewichtete Quellen) und Phase 2 (retrieval-gewichtete Quellen).
   Verallgemeinert die feste 2→1→0-Fallback-Kette des Prototyps auf n→n-1→…→1→0 (n bis 6). */

function buildSources(docs, weightFn, sentRelFn) {
  return docs.map((d, si) => {
    const toks = [{ t: '.', raw: '.', punct: true, sent: -1 }].concat(tokenize(d.body));
    return {
      si, doc: d, toks,
      weight: weightFn ? weightFn(d) : 1,
      sentRel: sentRelFn ? sentRelFn(d) : new Map()
    };
  });
}

function createSession(sources) {
  return { sources, ctx: ['.'], steps: [], used: new Set(), sentences: 0 };
}

function pushCandidate(out, s, pos, used) {
  const nx = s.toks[pos];
  const rel = s.sentRel.get(nx.sent) || 0;
  let w = s.weight * (1 + 3 * rel);
  const key = s.si + ':' + pos;
  const wasUsed = used.has(key);
  if (wasUsed) w *= 0.12;
  out.push({ si: s.si, pos, word: nx.t, w, rel, used: wasUsed });
}

function collectAt(sources, used, k, tail) {
  const out = [];
  sources.forEach(s => {
    const toks = s.toks;
    for (let i = k - 1; i < toks.length - 1; i++) {
      let match = true;
      for (let j = 0; j < k; j++) { if (toks[i - j].t !== tail[k - 1 - j]) { match = false; break; } }
      if (match) pushCandidate(out, s, i + 1, used);
    }
  });
  return out;
}

function collectSentenceStart(sources, used) {
  const out = [];
  sources.forEach(s => {
    const toks = s.toks;
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].t === '.') pushCandidate(out, s, i + 1, used);
    }
  });
  return out;
}

/* Kandidaten für den nächsten Schritt: probiert Kontextlänge n, n-1, … 1, bevor es auf "neuer Satz" zurückfällt. */
function candidates(session, n, temp) {
  const ctx = session.ctx;
  let level = 0, occ = [];
  for (let k = Math.min(n, ctx.length); k >= 1; k--) {
    const tail = ctx.slice(-k);
    occ = collectAt(session.sources, session.used, k, tail);
    if (occ.length) { level = k; break; }
  }
  if (!occ.length) { level = 0; occ = collectSentenceStart(session.sources, session.used); }

  const agg = new Map();
  occ.forEach(o => {
    let a = agg.get(o.word);
    if (!a) { a = { word: o.word, w: 0, bySrc: new Map(), occ: [] }; agg.set(o.word, a); }
    a.w += o.w;
    a.bySrc.set(o.si, (a.bySrc.get(o.si) || 0) + o.w);
    a.occ.push(o);
  });
  const list = [...agg.values()].sort((a, b) => b.w - a.w || a.word.localeCompare(b.word, 'de'));
  const t = temp == null ? 1 : temp;
  let sum = 0;
  list.forEach(a => { a.s = t <= 0.001 ? 0 : Math.pow(a.w, 1 / t); sum += a.s; });
  if (t <= 0.001) list.forEach((a, i) => { a.p = i === 0 ? 1 : 0; });
  else list.forEach(a => { a.p = a.s / sum; });
  return { level, n, list };
}

function pickFrom(list) {
  let r = Math.random();
  for (const a of list) { r -= a.p; if (r <= 0) return a; }
  return list[0];
}

function commitWord(session, cand, C) {
  let r = Math.random() * cand.w, o = cand.occ[0];
  for (const x of cand.occ) { r -= x.w; if (r <= 0) { o = x; break; } }
  session.used.add(o.si + ':' + o.pos);
  const raw = session.sources[o.si].toks[o.pos].raw;
  const ctxUsed = C.level > 0 ? session.ctx.slice(-C.level) : [];
  session.steps.push({ word: cand.word, raw, si: o.si, pos: o.pos, cands: C, chosen: cand.word, ctxUsed, level: C.level });
  session.ctx.push(cand.word);
  if (cand.word === '.') session.sentences++;
  return o;
}

/* Fließtext-Darstellung der bisherigen Schritte: Original-Schreibung, Großschreibung nach Satzende. */
function pieces(session) {
  const out = [];
  let prev = '.';
  session.steps.forEach((st, i) => {
    const punct = st.word === '.' || st.word === ',';
    let txt = punct ? st.word : st.raw;
    if (prev === '.' && !punct) txt = txt.charAt(0).toUpperCase() + txt.slice(1);
    out.push({ i, txt, punct, si: st.si });
    prev = st.word;
  });
  return out;
}

/* Ein voller Schritt: Kandidaten berechnen, auswählen (oder bei temp=0 das wahrscheinlichste nehmen), committen. */
function step(session, n, temp) {
  const C = candidates(session, n, temp);
  if (!C.list.length) return null;
  const cand = (temp === 0) ? C.list[0] : pickFrom(C.list);
  commitWord(session, cand, C);
  return C;
}
