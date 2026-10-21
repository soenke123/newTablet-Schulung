/* Phase 1: freies Schreiben ohne Frage.
   Zentrum = Ablauf-Fließband + wachsender Text (jedes Wort in der Farbe seines Quelltexts);
   rechts zeigen die vier Schritte (Kontextfenster · Quellen · Kandidaten · Zufall — in jeder Phase
   gleich, siehe panel.js), was die Maschine gerade tut. Erklärt wird hinter den ?-Knöpfen.
   Meldet jedes geschriebene Wort an den Leitfaden (p1-word). */
function sourceColor(si) {
  const hue = Math.round((si * 137.508) % 360);
  return 'hsl(' + hue + ' 60% 45%)';
}
function de1(x) { return x.toFixed(1).replace('.', ','); }

/* Kleine Farblegende als Chips: Punkt + Titel + Anzahl. */
function sourceChips(rows, more) {
  const box = el('div', 'srcchips');
  rows.forEach(r => {
    const c = el('span', 'srcchip');
    const d = el('i', 'dot'); d.style.background = r.color;
    c.append(d, el('span', 'srcchip-t', r.label));
    if (r.sub) c.appendChild(el('span', 'srcchip-n', r.sub));
    box.appendChild(c);
  });
  if (more) box.appendChild(el('span', 'srcchip more', more));
  return box;
}

Phases.register(1, {
  mount(host) {
    let session, n = 3, temp = 1, playing = false, timer = null, panelCtrl = null;
    let run = 0;   /* Wörter seit der letzten Änderung an Kontext/Zufall (für den Leitfaden) */
    let textEl, cursor, playBtn, stepBtn, flowHost, legendHost, placeholder;

    function freshSession() {
      const sources = buildSources(State.activeTexts(), () => 1, () => new Map());
      return createSession(sources);
    }

    function usedCounts() {
      const used = new Map();
      session.steps.forEach(st => { if (st.word !== '.' && st.word !== ',') used.set(st.si, (used.get(st.si) || 0) + 1); });
      return used;
    }

    /* Jedes Wort bekommt die Farbe des Textes, aus dem es geholt wurde — so sieht man sofort,
       dass der "eigene" Text ein Flickenteppich aus vielen Texten ist. */
    function updateText() {
      textEl.replaceChildren();
      let prevSi = null;
      pieces(session).forEach((p, idx) => {
        if (idx > 0 && !p.punct) textEl.appendChild(document.createTextNode(' '));
        if (p.punct) { textEl.appendChild(document.createTextNode(p.txt)); return; }
        if (prevSi != null && p.si !== prevSi) {
          const seam = el('span', 'seam');
          seam.title = 'Hier springt die KI zu einem anderen Text.';
          textEl.appendChild(seam);
        }
        const span = el('span', 'srcword', p.txt);
        span.style.setProperty('--sc', sourceColor(p.si));
        span.title = 'aus: ' + session.sources[p.si].doc.title;
        textEl.appendChild(span);
        prevSi = p.si;
      });
      textEl.appendChild(cursor);
      placeholder.hidden = session.steps.length > 0;
      textEl.hidden = !session.steps.length;
    }

    function updateLegend() {
      legendHost.replaceChildren();
      const used = usedCounts();
      if (!used.size) return;
      const top = [...used.entries()].sort((a, b) => b[1] - a[1]);
      legendHost.appendChild(sourceChips(
        top.slice(0, 4).map(([si, c]) => ({ color: sourceColor(si), label: session.sources[si].doc.title, sub: String(c) })),
        top.length > 4 ? '+ ' + (top.length - 4) + ' Texte' : ''
      ));
    }

    function updateFlow() {
      const started = session.steps.length > 0;
      Flow.render(flowHost, [
        { id: 'ctx', label: 'Kontextfenster', sub: n + (n === 1 ? ' Wort anschauen' : ' Wörter anschauen'), cat: 'context', active: started },
        { id: 'origin', label: 'Quellen', sub: 'was kam danach?', cat: 'origin', active: started },
        { id: 'cand', label: 'Kandidaten', sub: 'nach Häufigkeit', cat: 'candidates', active: started },
        { id: 'rand', label: 'Zufall', sub: 'würfeln & anhängen', cat: 'random', active: started }
      ], { onPick: id => panelCtrl.reveal(id), help: 'ablauf' });
    }

    function doStep() {
      if (!State.activeTexts().length) return false;
      const C = step(session, n, temp);
      if (!C) { stopPlay(); return false; }
      run++;
      updateText();
      updateLegend();
      if (panelCtrl.isOpen('ctx') && live.ctx) live.ctx();
      if (panelCtrl.isOpen('cand') && live.cand) live.cand();
      panelCtrl.refreshAll();
      Flow.pulse(flowHost, 380);
      Guide.did('p1-word', { n, temp, run });
      if (session.steps.length >= 400) stopPlay();
      return true;
    }

    function syncPlay() {
      if (!playBtn) return;
      playBtn.textContent = playing ? '❚❚ Pause' : (session.steps.length ? '▶ Weiterschreiben' : '▶ Schreiben starten');
      playBtn.classList.toggle('playing', playing);
    }
    function startPlay() {
      if (playing || !State.activeTexts().length) return;
      playing = true;
      syncPlay();
      updateFlow();
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 550);
    }
    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      syncPlay();
    }

    /* Kontext- und Zufallskarte tragen Regler. Würden sie bei jedem Wort neu gebaut, wäre der
       Regler mitten im Ziehen weg (dasselbe Problem wie der Stopp-Knopf in Phase 3). Deshalb sind
       sie manual (die Kandidatenkarte auch: sie hängt am Zufall) und hinterlegen in live[id] eine
       Funktion, die nur die Anzeige auffrischt; die Zufallskarte braucht keine. */
    const live = {};

    function paintStrip(strip) {
      strip.replaceChildren();
      /* Die letzten Tokens, das Kontextfenster farbig umrandet. Satzzeichen zählen für das
         Fenster mit — deshalb hier nicht wegfiltern, nur lesbar beschriften. */
      const tail = session.ctx.slice(-8);
      const k = Math.min(n, Math.max(0, session.ctx.length - 1));
      if (session.ctx.length <= 1) {
        strip.appendChild(el('span', 'ctxtok inwin', 'Satzanfang'));
      } else {
        tail.forEach((w, i) => {
          const inWin = i >= tail.length - k;
          const label = w === '.' ? '·' : (w === ',' ? ',' : showWord(w));
          strip.appendChild(el('span', 'ctxtok' + (inWin ? ' inwin' : ''), label));
        });
      }
      strip.appendChild(el('span', 'flow-arrow', '→'));
      strip.appendChild(el('span', 'ctxtok next', '?'));
    }

    function renderCtxNode(container) {
      container.replaceChildren();
      const strip = el('div', 'ctxstrip');
      container.appendChild(strip);
      paintStrip(strip);
      const sl = Info.slider({
        label: 'Kontextfenster', min: 1, max: 6, step: 1, value: n, spot: 'nslider',
        fmt: v => v + (v === 1 ? ' Wort' : ' Wörter'), ends: ['kurz', 'lang'],
        onInput: v => {
          n = v; run = 0;
          paintStrip(strip);
          if (live.cand) live.cand();
          updateFlow();
        }
      });
      container.appendChild(sl.el);
      live.ctx = () => { if (strip.isConnected) paintStrip(strip); };
    }

    function renderCandNode(container) {
      container.replaceChildren();
      const info = el('p', 'card-line');
      const heatHost = el('div');
      container.append(info, heatHost);
      function paint() {
        const C = candidates(session, n, temp);
        info.replaceChildren();
        if (C.level === 0) {
          info.append(el('span', 'card-line-ico', '↩'), document.createTextNode('Kein Anschluss – neuer Satz.'));
        } else {
          const words = session.ctx.slice(-C.level).filter(w => w !== '.').map(showWord).join(' ');
          info.append(document.createTextNode('Nach „'), el('b', null, words || 'Satzanfang'), document.createTextNode('“ kam in deinen Texten:'));
        }
        Heat.render(heatHost, C.list.map(a => ({ word: a.word, label: showWord(a.word), p: a.p })), { maxRows: 6, accent: 'var(--cat-candidates)' });
      }
      paint();
      live.cand = () => { if (heatHost.isConnected) paint(); };
    }

    function renderRandNode(container) {
      container.replaceChildren();
      const sl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => { temp = Math.round(v * 10) / 10; run = 0; if (live.cand) live.cand(); }
      });
      container.appendChild(sl.el);
    }

    function renderOriginNode(container) {
      container.replaceChildren();
      const used = usedCounts();
      if (!used.size) { container.appendChild(el('p', 'card-empty', 'Noch keine Wörter.')); return; }

      const total = [...used.values()].reduce((a, b) => a + b, 0);
      const rows = el('div', 'originrows');
      [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([si, count]) => {
        const row = el('div', 'originrow');
        const name = el('span', 'small', session.sources[si].doc.title);
        const bar = el('div', 'bar');
        const fill = el('i');
        fill.style.width = Math.max(3, 100 * count / total) + '%';
        fill.style.background = sourceColor(si);
        bar.appendChild(fill);
        row.append(name, bar, el('span', 'num', String(count)));
        rows.appendChild(row);
      });
      container.appendChild(rows);
      container.appendChild(el('p', 'card-line muted', used.size + (used.size === 1 ? ' Text hat' : ' Texte haben') + ' mitgeschrieben.'));
    }

    function render() {
      live.ctx = live.cand = null;
      session = freshSession();
      playing = false;
      run = 0;
      if (timer) { clearInterval(timer); timer = null; }

      const center = el('div', 'box machine-center');
      center.appendChild(Info.centerHead('Phase 1 · Frei schreiben', 'Die KI schreibt ohne Frage', 'p1'));

      flowHost = el('div', 'flow-host');
      center.appendChild(flowHost);

      const paper = el('div', 'paper');
      placeholder = el('p', 'paper-ph', 'Hier schreibt gleich die KI …');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      textEl.appendChild(cursor);
      paper.append(placeholder, textEl);
      center.appendChild(paper);

      legendHost = el('div', 'center-legend');
      center.appendChild(legendHost);

      const controls = el('div', 'machine-controls');
      playBtn = el('button', 'btn primary big', '▶ Schreiben starten');
      playBtn.type = 'button';
      playBtn.dataset.spot = 'play';
      stepBtn = el('button', 'btn', '+1 Wort');
      stepBtn.type = 'button';
      const resetBtn = el('button', 'btn', '↺ Neu starten');
      resetBtn.type = 'button';
      controls.append(playBtn, stepBtn, resetBtn);
      center.appendChild(controls);
      if (!State.activeTexts().length) center.appendChild(el('p', 'warnline', 'Keine Texte ausgewählt – öffne oben „Textwelten“.'));

      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      stepBtn.addEventListener('click', () => { stopPlay(); doStep(); updateFlow(); });
      resetBtn.addEventListener('click', () => render());

      const items = [
        { id: 'ctx', label: 'Kontextfenster', cat: 'context', hint: '1', help: 'kontext', manual: true, render: renderCtxNode },
        { id: 'origin', label: 'Quellen', cat: 'origin', hint: '2', help: 'herkunft', render: renderOriginNode },
        { id: 'cand', label: 'Kandidaten', cat: 'candidates', hint: '3', help: 'kandidaten', manual: true, render: renderCandNode },
        { id: 'rand', label: 'Zufall', cat: 'random', hint: '4', help: 'zufall', manual: true, render: renderRandNode }
      ];
      panelCtrl = Panel.mount(host, center, items, { phase: 1 });
      updateText();
      updateLegend();
      updateFlow();
    }

    render();
    State.on('corpus-changed', () => render());

    return {
      reveal: id => panelCtrl.reveal(id, true),
      onHide: stopPlay
    };
  }
});
