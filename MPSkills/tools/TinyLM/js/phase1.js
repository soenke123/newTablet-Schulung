/* Phase 1: freies Schreiben ohne Frage.
   Zentrum = Ablauf-Fließband + wachsender Text (jedes Wort in der Farbe seines Quelltexts);
   rechts erklären drei Karten die Mechanik. */
function sourceColor(si) {
  const hue = Math.round((si * 137.508) % 360);
  return 'hsl(' + hue + ' 60% 45%)';
}
function de1(x) { return x.toFixed(1).replace('.', ','); }

Phases.register(1, {
  mount(host) {
    let session, n = 3, temp = 1, playing = false, timer = null, panelCtrl = null;
    let textEl, cursor, playBtn, stepBtn, flowHost, legendHost;

    function freshSession() {
      const sources = buildSources(State.activeTexts(), () => 1, () => new Map());
      return createSession(sources);
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
    }

    function updateLegend() {
      legendHost.replaceChildren();
      const used = new Map();
      session.steps.forEach(st => { if (st.word !== '.' && st.word !== ',') used.set(st.si, (used.get(st.si) || 0) + 1); });
      if (!used.size) return;
      const top = [...used.entries()].sort((a, b) => b[1] - a[1]);
      legendHost.appendChild(el('p', 'small muted', 'Farbe = aus welchem Text das Wort kommt (' + used.size + ' Texte beteiligt):'));
      legendHost.appendChild(Info.legend(top.slice(0, 5).map(([si, c]) => ({
        color: sourceColor(si), label: session.sources[si].doc.title, sub: c + ' Wörter'
      }))));
      if (top.length > 5) legendHost.appendChild(el('p', 'small muted', '… und ' + (top.length - 5) + ' weitere Texte.'));
    }

    function updateFlow() {
      const started = session.steps.length > 0;
      Flow.render(flowHost, [
        { id: 'ctx', label: 'Letzte ' + n + ' Wörter', sub: 'das Kontextfenster', cat: 'context', active: started },
        { id: 'cand', label: 'In Texten nachsehen', sub: 'was stand dahinter?', cat: 'candidates', active: started },
        { id: 'cand2', target: 'cand', label: 'Würfeln', sub: 'je häufiger, desto wahrscheinlicher', cat: 'random', active: started },
        { id: 'origin', label: 'Wort anhängen', sub: 'und von vorn', cat: 'origin', active: started }
      ], { onPick: id => panelCtrl.reveal(id), loop: 'Diese vier Schritte laufen für jedes einzelne Wort neu.' });
    }

    function doStep() {
      if (!State.activeTexts().length) return false;
      const C = step(session, n, temp);
      if (!C) { stopPlay(); return false; }
      updateText();
      updateLegend();
      panelCtrl.refreshAll();
      if (session.steps.length >= 400) stopPlay();
      return true;
    }

    function startPlay() {
      if (playing || !State.activeTexts().length) return;
      playing = true;
      playBtn.textContent = '⏸ Pause';
      updateFlow();
      timer = setInterval(() => { if (!doStep()) stopPlay(); }, 550);
    }
    function stopPlay() {
      playing = false;
      if (playBtn) playBtn.textContent = session.steps.length ? '▶ Weiter schreiben' : '▶ Schreiben starten';
      if (timer) { clearInterval(timer); timer = null; }
    }

    function renderCtxNode(container) {
      container.replaceChildren();
      /* Streifen: die letzten Tokens, das Kontextfenster farbig umrandet.
         Satzzeichen zählen für das Fenster mit — deshalb hier nicht wegfiltern, nur lesbar beschriften. */
      const tail = session.ctx.slice(-8);
      const k = Math.min(n, Math.max(0, session.ctx.length - 1));
      const strip = el('div', 'ctxstrip');
      if (session.ctx.length <= 1) {
        strip.appendChild(el('span', 'ctxtok inwin', '(Satzanfang)'));
      } else {
        tail.forEach((w, i) => {
          const inWin = i >= tail.length - k;
          const label = w === '.' ? '(Satzende)' : (w === ',' ? ',' : showWord(w));
          strip.appendChild(el('span', 'ctxtok' + (inWin ? ' inwin' : ''), label));
        });
      }
      strip.appendChild(el('span', 'flow-arrow', '→'));
      strip.appendChild(el('span', 'ctxtok next', '?'));
      container.appendChild(strip);
      container.appendChild(el('p', 'small muted', k
        ? 'Nur die ' + k + ' farbig umrandeten Wörter zählen. Alles davor hat die KI schon vergessen.'
        : 'Die KI startet an einem Satzanfang.'));

      const sl = el('div', 'slider');
      const lab = el('label');
      const out = el('output', null, String(n));
      lab.append(document.createTextNode('Kontextlänge (n-Gramm)'), out);
      const inp = el('input');
      inp.type = 'range'; inp.min = '1'; inp.max = '6'; inp.step = '1'; inp.value = String(n);
      inp.addEventListener('input', () => {
        n = parseInt(inp.value, 10);
        out.textContent = String(n);
        panelCtrl.refresh('ctx');
        panelCtrl.refresh('cand');
        updateFlow();
      });
      sl.append(lab, inp);
      container.appendChild(sl);
      container.appendChild(Info.note('Mehr Kontext = der Text klingt runder, aber die KI findet seltener eine Fortsetzung und fängt öfter einen neuen Satz an. Probier 1 gegen 6!', '🔬'));
    }

    function renderCandNode(container) {
      container.replaceChildren();
      const C = candidates(session, n, temp);
      const info = el('p', 'small');
      if (C.level === 0) {
        info.textContent = 'Kein passender Anschluss gefunden — die KI beginnt einen neuen Satz.';
      } else {
        const words = session.ctx.slice(-C.level).filter(w => w !== '.').map(showWord).join(' ');
        info.append('In deinen Texten steht hinter „');
        info.appendChild(el('b', null, words || 'Satzanfang'));
        info.append('“:');
      }
      container.appendChild(info);
      const heatHost = el('div');
      container.appendChild(heatHost);
      Heat.render(heatHost, C.list.map(a => ({ word: a.word, label: showWord(a.word), p: a.p })), { maxRows: 7, accent: 'var(--cat-candidates)' });

      const sl = el('div', 'slider');
      const lab = el('label');
      const out = el('output', null, de1(temp));
      lab.append(document.createTextNode('Zufall'), out);
      const inp = el('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '2'; inp.step = '0.1'; inp.value = String(temp);
      inp.addEventListener('input', () => { temp = parseFloat(inp.value); out.textContent = de1(temp); panelCtrl.refresh('cand'); });
      sl.append(lab, inp);
      container.appendChild(sl);
      container.appendChild(Info.note('Zufall 0: Die KI nimmt immer das wahrscheinlichste Wort. Bei echten Sprachmodellen heißt dieser Regler Temperatur.', '🌡️'));
    }

    function renderOriginNode(container) {
      container.replaceChildren();
      const used = new Map();
      session.steps.forEach(st => { if (st.word !== '.' && st.word !== ',') used.set(st.si, (used.get(st.si) || 0) + 1); });
      if (!used.size) { container.appendChild(el('p', 'small muted', 'Noch keine Wörter erzeugt. Starte das Schreiben.')); return; }

      container.appendChild(el('p', 'small', 'So viele Wörter kamen aus welchem Text:'));
      const total = [...used.values()].reduce((a, b) => a + b, 0);
      const rows = el('div', 'originrows');
      [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([si, count]) => {
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
      container.appendChild(Info.note(used.size + ' verschiedene Texte haben mitgeschrieben. Oben im Text siehst du dieselben Farben.', '🧵'));
    }

    function render() {
      session = freshSession();
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }

      const center = el('div', 'box machine-center');
      center.appendChild(el('p', 'eyebrow', 'Phase 1 · Frei schreiben'));
      center.appendChild(el('h2', null, 'Die KI schreibt ohne Frage'));

      flowHost = el('div', 'flow-host');
      center.appendChild(flowHost);

      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      textEl.appendChild(cursor);
      center.appendChild(textEl);

      legendHost = el('div', 'center-legend');
      center.appendChild(legendHost);

      const controls = el('div', 'machine-controls');
      playBtn = el('button', 'btn primary', '▶ Schreiben starten');
      playBtn.type = 'button';
      stepBtn = el('button', 'btn', 'Ein Wort weiter');
      stepBtn.type = 'button';
      const resetBtn = el('button', 'btn', 'Neu starten');
      resetBtn.type = 'button';
      controls.append(playBtn, stepBtn, resetBtn);
      center.appendChild(controls);
      center.appendChild(Info.box('Was passiert hier?', 'Keine Frage, kein Thema: Die KI hängt einfach immer das Wort an, das in deinen Texten oft nach den letzten Wörtern stand. Darum klingt es stellenweise richtig und ergibt trotzdem keinen Sinn.', { icon: '✍️' }));

      playBtn.addEventListener('click', () => { playing ? stopPlay() : startPlay(); });
      stepBtn.addEventListener('click', () => { stopPlay(); doStep(); updateFlow(); });
      resetBtn.addEventListener('click', () => render());

      const items = [
        {
          id: 'ctx', label: 'Kontextfenster', cat: 'context', hint: 'Schritt 1', render: renderCtxNode,
          info: { title: 'Worauf schaut die KI gerade?', text: 'Nur auf die letzten paar Wörter — nicht auf den ganzen Text. Dieses kleine Guckloch heißt Kontextfenster. Wie groß es ist, stellst du mit dem Regler ein.', icon: '👀' }
        },
        {
          id: 'cand', label: 'Kandidaten & Zufall', cat: 'candidates', hint: 'Schritt 2 + 3', render: renderCandNode,
          info: { title: 'Wie wird das nächste Wort gewählt?', text: 'Die KI sucht alle Stellen in deinen Texten, an denen genau diese Wörter stehen, und sammelt, was dort dahinter kam. Je öfter ein Wort dabei ist, desto größer sein Balken — und desto wahrscheinlicher wird es gewürfelt.', icon: '🎲' }
        },
        {
          id: 'origin', label: 'Herkunft', cat: 'origin', hint: 'Schritt 4', render: renderOriginNode,
          info: { title: 'Wer hat das geschrieben?', text: 'Kein Wort ist von der KI erfunden. Jedes einzelne stammt aus einem deiner Texte — die KI klebt nur Bruchstücke zusammen.', icon: '🧩' }
        }
      ];
      panelCtrl = Panel.mount(host, center, items, { phase: 1 });
      updateText();
      updateLegend();
      updateFlow();
    }

    render();
    State.on('corpus-changed', () => { if (host.isConnected) render(); });
  }
});
