/* Phase 2: Frage/Antwort mit Retrieval.
   Zentrum = Frage + wachsende Antwort (jedes Wort in der Farbe seines Quelltexts).
   Rechts dieselben vier Schritte wie in jeder Phase: Frage zerlegen, Quellen, Kandidaten, Zufall.
   Darunter breit: die Wortkarte. */
const SRC = ['A', 'B', 'C'];
const srcVar = i => 'var(--src-' + ['a', 'b', 'c'][i] + ')';
const CANNED = 'Dazu finde ich nichts. Ich kenne nur Texte, die du gerade ausgewählt hast.';
const SUGGEST2 = ['Ist Pluto ein Planet?', 'Was frisst eine Kornnatter?', 'Wie lernt eine KI?', 'Was macht die Ärztin?'];

function buildPhase2Sources(R, k) {
  const top = R.results.filter(r => r.score > 0).slice(0, k || 3);
  if (!top.length) return null;
  const maxS = top[0].score;
  const nq = Math.max(1, R.ql.filter(x => x.known).length);
  const sources = buildSources(top.map(r => r.doc), () => 1, () => new Map());
  sources.forEach((s, idx) => {
    const r = top[idx];
    s.weight = r.score / maxS;
    s.r = r;
    const rel = new Map();
    r.marks.forEach((m, ti) => {
      const sent = r.doc.toks[ti].sent;
      const key = sent + ':' + m.q;
      if (!rel.has(key)) rel.set(key, m.sim);
    });
    const sentRel = new Map();
    rel.forEach((v, key) => { const sent = Number(key.split(':')[0]); sentRel.set(sent, (sentRel.get(sent) || 0) + v); });
    sentRel.forEach((v, sent) => sentRel.set(sent, Math.min(1, v / nq)));
    s.sentRel = sentRel;
  });
  return sources;
}

Phases.register(2, {
  mount(host) {
    let M = null, R = null, session = null, canned = false, asked = false;
    let temp = 1, playing = false, timer = null, panelCtrl = null, mapCtl = null;
    let textEl, cursor, playBtn, input, legendHost, askedEl, placeholder;

    function rebuildModel() {
      M = buildModel(State.activeTexts());
      if (mapCtl) mapCtl.destroy();
      mapCtl = WordMap.create(M, {
        highlight: () => (R && !canned) ? R.ql.filter(x => x.inMap).map(x => x.lemma) : [],
        texts: () => State.activeTexts()
      });
    }

    /* Antworttext: jedes Wort in der Farbe des Textes, aus dem es geholt wurde.
       Wechselt die Farbe mitten im Satz, markiert ein kleiner Strich die "Naht". */
    function updateText() {
      textEl.replaceChildren();
      if (canned) {
        textEl.appendChild(document.createTextNode(CANNED));
        textEl.appendChild(cursor);
        return;
      }
      let prevSi = null;
      pieces(session).forEach((p, idx) => {
        if (idx > 0 && !p.punct) textEl.appendChild(document.createTextNode(' '));
        if (p.punct) {
          textEl.appendChild(document.createTextNode(p.txt));
          return;
        }
        if (prevSi != null && p.si !== prevSi) {
          const seam = el('span', 'seam');
          seam.title = 'Hier wechselt die KI mitten im Satz zu einem anderen Text.';
          textEl.appendChild(seam);
        }
        const span = el('span', 'srcword', p.txt);
        span.style.setProperty('--sc', srcVar(p.si));
        span.title = 'aus Text ' + SRC[p.si] + ': ' + session.sources[p.si].doc.title;
        textEl.appendChild(span);
        prevSi = p.si;
      });
      textEl.appendChild(cursor);
      if (placeholder) placeholder.hidden = asked;
    }

    function updateLegend() {
      legendHost.replaceChildren();
      if (!asked || canned || !session) return;
      const used = new Map();
      session.steps.forEach(st => { if (st.word !== '.' && st.word !== ',') used.set(st.si, (used.get(st.si) || 0) + 1); });
      legendHost.appendChild(sourceChips(session.sources.map((s, i) => ({
        color: srcVar(i),
        label: SRC[i] + ' · ' + s.doc.title,
        sub: String(used.get(i) || 0)
      }))));
    }


    function ask(q) {
      q = (q || '').trim();
      if (!q || !State.activeTexts().length) return;
      asked = true;
      textEl.hidden = false;
      playBtn.hidden = false;
      R = retrieve(M, q);
      R.question = q;
      canned = !R.results.some(r => r.score > 0);
      session = null;
      if (!canned) {
        const sources = buildPhase2Sources(R, 3);
        session = createSession(sources);
      }
      askedEl.replaceChildren(el('span', 'asked-ico', '❓'), document.createTextNode(q));
      askedEl.hidden = false;
      updateText();
      updateLegend();
      panelCtrl.refreshAll();
      panelCtrl.refresh('rand');
      /* Wortkarte nicht neu aufbauen (teuer) — nur auf ein Fragewort springen. */
      if (mapCtl && panelCtrl.isOpen('map')) {
        const start = R.ql.filter(x => x.inMap)[0];
        if (start) mapCtl.select(start.lemma); else mapCtl.redraw();
      }
      if (!canned) startPlay();
    }

    function doStep() {
      if (!session) return false;
      const C = step(session, 6, temp);
      if (!C) return false;
      updateText();
      updateLegend();
      panelCtrl.refreshAll();
      if (session.sentences >= 3 || session.steps.length >= 70) return false;
      return true;
    }
    function startPlay() {
      if (playing || canned || !session) return;
      playing = true;
      playBtn.textContent = '❚❚ Pause';
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 420);
    }
    function stopPlay() {
      playing = false;
      if (playBtn) playBtn.textContent = (session && session.steps.length) ? '▶ Weiter' : '▶ Antwort erzeugen';
      if (timer) { clearInterval(timer); timer = null; }
    }

    function renderSourcesNode(container) {
      container.replaceChildren();
      if (!asked) { container.appendChild(el('p', 'card-empty', 'Stell zuerst eine Frage.')); return; }
      if (canned) { container.appendChild(el('p', 'card-empty', 'Kein Text passt – deshalb kam ein fester Satz.')); return; }
      session.sources.forEach((s, i) => {
        const row = el('div', 'srcrow');
        const head = el('div', 'srcrow-head');
        const letter = el('span', 'letter', SRC[i]); letter.style.background = srcVar(i);
        const titleWrap = el('div'); titleWrap.style.flex = '1'; titleWrap.style.minWidth = '0';
        titleWrap.appendChild(el('b', null, s.doc.title));
        const bar = el('div', 'bar');
        const fill = el('i'); fill.style.width = Math.max(4, s.weight * 100) + '%'; fill.style.background = srcVar(i);
        bar.appendChild(fill);
        titleWrap.appendChild(bar);
        head.append(letter, titleWrap);
        row.appendChild(head);

        const toggle = el('button', 'btn sm', 'Fundstelle zeigen');
        toggle.type = 'button';
        const snip = el('p', 'small snip');
        snip.hidden = true;
        snip.appendChild(renderMarkedTokens(s.r.doc.toks, s.r.marks));
        toggle.addEventListener('click', () => {
          snip.hidden = !snip.hidden;
          toggle.textContent = snip.hidden ? 'Fundstelle zeigen' : 'Fundstelle verbergen';
        });
        row.append(toggle, snip);
        const hl = s.r.hits.map(h => h.type === 'exact' ? '„' + showWord(h.w) + '“' : '„' + showWord(h.w) + '“ statt „' + showWord(h.q) + '“');
        row.appendChild(el('p', 'small muted', 'Treffer: ' + hl.join(', ')));
        container.appendChild(row);
      });
      const lg = el('p', 'mini-legend');
      lg.append(el('span', 'mk exact', 'gelb'), document.createTextNode(' = genau dein Wort  '), el('span', 'mk sim', 'rosa'), document.createTextNode(' = ähnliches Wort'));
      container.appendChild(lg);
    }

    function renderMarkedTokens(toks, marks) {
      const frag = document.createDocumentFragment();
      toks.forEach((t, k) => {
        if (k > 0 && !t.punct) frag.appendChild(document.createTextNode(' '));
        const m = marks.get(k);
        if (m) {
          const span = el('span', 'mk ' + (m.type === 'exact' ? 'exact' : 'sim'), t.raw);
          if (m.type !== 'exact') span.title = 'ähnlich zu „' + showWord(m.q) + '“ (' + Math.round(m.sim * 100) + ' %)';
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(t.raw));
        }
      });
      return frag;
    }

    function renderLookupNode(container) {
      container.replaceChildren();
      if (!asked) { container.appendChild(el('p', 'card-empty', 'Stell zuerst eine Frage.')); return; }
      const qw = el('div', 'chiprow');
      tokenize(R.question).filter(t => !t.punct).forEach(t => {
        const isStop = STOP.has(t.t) || /^\d+$/.test(t.t) || t.t.length < 2;
        const chip = el('div', 'chip');
        if (isStop) {
          chip.classList.add('off');
          chip.append(document.createTextNode(t.raw));
          chip.title = 'Füllwort – fliegt raus';
          qw.appendChild(chip);
          return;
        }
        const x = R.ql.find(y => y.raw === t.raw);
        if (!x) return;
        if (!x.known) {
          chip.classList.add('unknown');
          chip.append(document.createTextNode(t.raw), el('span', 'chip-tag', 'unbekannt'));
          qw.appendChild(chip);
          return;
        }
        chip.classList.add('known');
        chip.appendChild(el('b', null, showWord(x.lemma)));
        if (x.lemma !== t.t) chip.appendChild(el('span', 'small muted', ' ← ' + t.raw));
        qw.appendChild(chip);
      });
      container.appendChild(qw);
      const lg = el('p', 'mini-legend');
      lg.append(el('span', 'chip off sm', 'grau'), document.createTextNode(' Füllwort  '),
        el('span', 'chip known sm', 'blau'), document.createTextNode(' gefunden  '),
        el('span', 'chip unknown sm', 'rot'), document.createTextNode(' unbekannt'));
      container.appendChild(lg);

      const simRows = R.ql.filter(x => x.known && x.inMap).map(x => [x, neighbors(M, x.lemma, 4).filter(n => n[1] >= SIM_MIN)]).filter(p => p[1].length);
      if (simRows.length) {
        const sec = el('div');
        sec.appendChild(el('p', 'card-line', 'Hält die KI für ähnlich:'));
        simRows.forEach(([x, nbs]) => {
          const p = el('p', 'small muted');
          p.append('„' + showWord(x.lemma) + '“ ≈ ' + nbs.map(n => showWord(n[0]) + ' (' + Math.round(n[1] * 100) + ' %)').join(', '));
          sec.appendChild(p);
        });
        container.appendChild(sec);
        const b = el('button', 'btn sm', '🗺️ Auf der Wortkarte');
        b.type = 'button';
        b.addEventListener('click', () => {
          panelCtrl.reveal('map');
          if (mapCtl) mapCtl.select(simRows[0][0].lemma);
        });
        container.appendChild(b);
      }
    }

    function renderWordByWordNode(container) {
      container.replaceChildren();
      if (!asked) { container.appendChild(el('p', 'card-empty', 'Stell zuerst eine Frage.')); return; }
      if (canned) { container.appendChild(el('p', 'card-empty', 'Nichts zum Zusammensetzen – fester Satz.')); return; }
      const st = session.steps[session.steps.length - 1];
      if (!st) { container.appendChild(el('p', 'card-empty', 'Noch kein Wort.')); return; }
      const C = st.cands;

      const strip = el('div', 'ctxstrip');
      if (C.level === 0) {
        strip.appendChild(el('span', 'ctxtok', '(neuer Satz)'));
      } else {
        st.ctxUsed.filter(w => w !== '.').forEach(w => strip.appendChild(el('span', 'ctxtok inwin', showWord(w))));
      }
      strip.appendChild(el('span', 'flow-arrow', '→'));
      const picked = el('span', 'ctxtok next', showWord(st.chosen));
      strip.appendChild(picked);
      container.appendChild(strip);

      const heatHost = el('div');
      container.appendChild(heatHost);
      const cands = C.list.map(a => ({
        word: a.word, label: showWord(a.word), p: a.p, chosen: a.word === st.chosen,
        breakdown: [...a.bySrc.entries()].map(([si, w]) => ({ share: w / a.w, color: srcVar(si), label: 'Text ' + SRC[si] }))
      }));
      Heat.render(heatHost, cands, { maxRows: 6, compact: true });
      container.appendChild(el('p', 'mini-legend', 'Balkenfarbe = Text A · B · C   ▸ umrandet = gewürfelt'));
    }

    function renderRandomNode(container) {
      container.replaceChildren();
      const sl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; }
      });
      container.appendChild(sl.el);
      const rb = el('button', 'btn primary', '🔁 Dieselbe Frage nochmal');
      rb.type = 'button';
      rb.dataset.spot = 'reask';
      rb.disabled = !asked;
      rb.addEventListener('click', () => { stopPlay(); ask(R.question); });
      container.appendChild(rb);
    }

    function renderMapNode(container) {
      container.replaceChildren();
      if (!M.words.length) { container.appendChild(el('p', 'card-empty', 'Wähl ein paar Texte aus, dann entsteht die Karte.')); return; }
      mapCtl.mount(container);
    }

    function render() {
      stopPlay();
      asked = false; canned = false; session = null; R = null;

      const center = el('div', 'box machine-center');
      center.appendChild(Info.centerHead('Phase 2 · Frage & Antwort', 'Frag etwas aus deinen Textwelten', 'p2'));


      const form = el('form', 'qform');
      form.dataset.spot = 'ask';
      input = el('input', 'textin');
      input.type = 'text'; input.placeholder = 'Frag mich etwas …'; input.setAttribute('aria-label', 'Frage');
      input.enterKeyHint = 'send';
      const send = el('button', 'btn primary', 'Fragen');
      send.type = 'submit';
      form.append(input, send);
      form.addEventListener('submit', e => { e.preventDefault(); stopPlay(); ask(input.value); input.blur(); });
      center.appendChild(form);

      const sugg = el('div', 'sugg');
      SUGGEST2.forEach(q => {
        const b = el('button', 'chip', q);
        b.type = 'button';
        b.addEventListener('click', () => { stopPlay(); input.value = q; ask(q); });
        sugg.appendChild(b);
      });
      center.appendChild(sugg);

      const paper = el('div', 'paper');
      askedEl = el('p', 'asked');
      askedEl.hidden = true;
      placeholder = el('p', 'paper-ph', 'Hier erscheint die Antwort …');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      textEl.appendChild(cursor);
      textEl.hidden = true;
      paper.append(askedEl, placeholder, textEl);
      center.appendChild(paper);

      legendHost = el('div', 'center-legend');
      center.appendChild(legendHost);

      const controls = el('div', 'machine-controls');
      playBtn = el('button', 'btn', '▶ Weiter');
      playBtn.type = 'button';
      playBtn.hidden = true;
      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      controls.appendChild(playBtn);
      center.appendChild(controls);

      const items = [
        { id: 'lookup', label: 'Frage zerlegen', cat: 'ask', hint: '1', help: 'nachschlagen', render: renderLookupNode },
        { id: 'src', label: 'Quellen', cat: 'origin', hint: '2', help: 'quellen', render: renderSourcesNode },
        { id: 'word', label: 'Kandidaten', cat: 'candidates', hint: '3', help: 'wortfuerwort', render: renderWordByWordNode },
        { id: 'rand', label: 'Zufall', cat: 'random', hint: '4', help: 'zufall', manual: true, render: renderRandomNode },
        { id: 'map', label: 'Wortkarte: Welche Wörter gehören zusammen?', cat: 'meaning', wide: true, open: false, manual: true,
          help: 'wortkarte', render: renderMapNode }
      ];
      panelCtrl = Panel.mount(host, center, items, { phase: 2 });
    }

    rebuildModel();
    render();
    State.on('corpus-changed', () => { rebuildModel(); render(); });

    return {
      reveal: id => panelCtrl.reveal(id, true),
      onHide: stopPlay
    };
  }
});
