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

  /* Inhaltswörter je Text (ohne <unk>): Rückfall für die Übungs-„Fragen“ (drawTopic). */
  const unkId = id.get(UNK);
  function contentIds(toks) { return [...new Set(toks.filter(isContentTok).map(t => toId(t.t)))].filter(i => i !== unkId); }
  /* Nomen = mitten im Satz meist großgeschrieben (wie display). */
  const isNounW = w => { const c = caps.get(w); return !!c && c[0] > c[1]; };

  /* Übungsfragen wie echte Fragen (Sönke 14.11.2026, „Wo schläft die Kornnatter?“ bekam eine Antwort über
     KI): jedes Beispiel kennt die Nomen (sn) und die übrigen Inhaltswörter, meist Verben (so), SEINES
     Satzes – eine Frage nennt genau die. Vorher zog das Training 1–3 zufällige Wörter aus dem ganzen Text
     („ästen · halter“); „kornnatter“ stand so nur in 0,4 % der Schritte in der Übungsfrage.
     Dazu beginnt jeder Satz noch einmal mit leerem Fenster („. . .“), wie eine Antwort: ~700 geübte
     Antwortanfänge statt 90 Textanfängen – genau dort muss die Frage allein entscheiden.
     Gemessen offline (12 Fragen × 20 Antworten, 90 s, 3 Wörter): Antwort mit Nomen UND Verb der Frage
     3 % → 66 %, mit dem Antwortanfang aus der Frage (phase4.js) 30 % → 94 %. Der Fehler steigt dabei von
     ≈ 0,25 auf ≈ 0,55: die neuen Satzanfänge sind schwer, dafür sagt das Netz nicht mehr nur Texte auf. */
  const pairs = [];
  docs.forEach(toks => {
    const topic = contentIds(toks);
    const bySent = new Map();
    toks.forEach(t => {
      if (t.punct || !isContentTok(t)) return;
      const i = toId(t.t);
      if (i === unkId) return;
      const e = bySent.get(t.sent) || { sn: new Set(), so: new Set() };
      (isNounW(t.t) ? e.sn : e.so).add(i);
      bySent.set(t.sent, e);
    });
    const sentOf = s => { const e = bySent.get(s); return e ? { sn: [...e.sn], so: [...e.so] } : { sn: [], so: [] }; };
    const cache = new Map();
    const info = s => { if (!cache.has(s)) cache.set(s, sentOf(s)); return cache.get(s); };
    const stream = Array(o.C).fill(null).concat(toks);
    const tid = t => toId(t ? t.t : '.');
    for (let i = o.C; i < stream.length; i++) {
      const ctx = stream.slice(i - o.C, i).map(tid), x = info(stream[i].sent);
      pairs.push({ ctx, target: tid(stream[i]), topic, sn: x.sn, so: x.so });
    }
    /* jeder weitere Satz noch einmal als Antwortanfang (der erste ist es schon) */
    for (let i = 1; i < toks.length; i++) {
      if (toks[i].sent === toks[i - 1].sent || toks[i].punct) continue;
      const x = info(toks[i].sent), st = Array(o.C).fill(null);
      for (let j = i; j < Math.min(toks.length, i + o.C) && toks[j].sent === toks[i].sent; j++) {
        pairs.push({ ctx: st.slice(-o.C).map(tid), target: tid(toks[j]), topic, sn: x.sn, so: x.so, start: true });
        st.push(toks[j]);
      }
    }
  });

  return { vocab, id, toId, contentIds, isNoun: isNounW, pairs, C: o.C, UNK, vocabSize: vocab.length, display };
}
