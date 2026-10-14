/* Phase 3: echtes neuronales Netz. Zentrum = Kontext -> Vorhersage + Trainings-Steuerung;
   rechts die Erklärkarten zu den Schichten, unten breit das echte Netz-Bild (netview.js).

   WICHTIG — warum hier nicht panelCtrl.refreshAll() läuft:
   Der Trainings-Tick aktualisiert die Anzeige mehrmals pro Sekunde. Würde er dabei die Karten
   komplett neu rendern, wären Buttons und Slider mitten im Klick weg (das Element verschwindet
   zwischen pointerdown und pointerup -> es kommt nie ein click an, das Training ließ sich nicht
   mehr anhalten). Darum: alle Karten sind manual:true, und jede Render-Funktion hinterlegt in
   live[id] eine Funktion, die NUR die Zahlen/Bilder auffrischt und die Bedienelemente stehen lässt.
   Die Haupt-Trainingstaste sitzt zusätzlich in der Zentrum-Karte, die während des Trainings
   überhaupt nicht neu gebaut wird. */
function deInt(n) { return n.toLocaleString('de-DE'); }
function valueColor(v, scale) {
  const t = Math.max(-1, Math.min(1, v / scale));
  return t >= 0
    ? 'color-mix(in srgb, var(--src-a) ' + Math.round(t * 100) + '%, var(--surface))'
    : 'color-mix(in srgb, var(--src-b) ' + Math.round(-t * 100) + '%, var(--surface))';
}
function renderSwatch(values, scale) {
  const row = el('div', 'swatchrow');
  values.forEach(v => {
    const cell = el('span', 'swatchcell');
    cell.style.background = valueColor(v, scale);
    cell.title = v.toFixed(3);
    row.appendChild(cell);
  });
  return row;
}
function renderSparkline(history, w, h) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('preserveAspectRatio', 'none');
  if (history.length < 2) return svg;
  const mn = Math.min(...history), mx = Math.max(...history);
  const range = (mx - mn) || 1;
  const pts = history.map((v, i) => (i / (history.length - 1)) * w + ',' + (h - ((v - mn) / range) * (h - 6) - 3)).join(' ');
  const poly = document.createElementNS(ns, 'polyline');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', 'var(--focus)');
  poly.setAttribute('stroke-width', '2');
  svg.appendChild(poly);
  return svg;
}

Phases.register(3, {
  mount(host) {
    let data, net, genSession, lastForward, netView = null;
    let temp = 1, training = false, trainRAF = null, lastUIRefresh = 0;
    let genPlaying = false, genTimer = null;
    let textEl, cursor, genPlayBtn, bannerEl, panelCtrl, flowHost;
    let centerToggle, centerStat, centerDot, netBtn;
    let cardTrain = null;
    const live = {};  /* Karten-Id -> Auffrisch-Funktion; nur offene Karten tragen sich ein */

    const CARDS = ['embed', 'hidden', 'output', 'net', 'train'];

    function updateFlow() {
      Flow.render(flowHost, [
        { id: 'embed', label: 'Kontextwörter', sub: 'die letzten ' + data.C + ' Wörter', cat: 'context', target: 'embed' },
        { id: 'embed2', target: 'embed', label: 'Embedding', sub: 'Wort → Zahlenreihe', cat: 'origin' },
        { id: 'hidden', label: 'Hidden-Schicht', sub: 'Zahlen verrechnen', cat: 'context' },
        { id: 'output', label: 'Ausgabe', sub: 'Wahrscheinlichkeiten', cat: 'candidates' },
        { id: 'train', label: 'Vergleichen & lernen', sub: 'Zahlen nachjustieren', cat: 'random' }
      ], {
        onPick: id => panelCtrl.reveal(id),
        loop: 'Beim Training läuft diese Kette tausende Male — jedes Mal werden die Zahlen ein winziges Stück besser.'
      });
    }

    function freshGenSession() {
      const startId = data.toId('.');
      return { ctxIds: Array(data.C).fill(startId), words: [], sentences: 0 };
    }

    function wordLabel(w) { return w === data.UNK ? '[unbekannt]' : (w === '.' ? '(Satzende)' : showWord(w)); }

    function updateGenText() {
      textEl.replaceChildren();
      let prev = '.';
      genSession.words.forEach((w, idx) => {
        const punct = (w === '.' || w === ',');
        let txt = w === data.UNK ? '…' : w;
        if (!punct && prev === '.') txt = txt.charAt(0).toUpperCase() + txt.slice(1);
        if (idx > 0 && !punct) textEl.appendChild(document.createTextNode(' '));
        textEl.appendChild(document.createTextNode(txt));
        prev = w;
      });
      textEl.appendChild(cursor);
    }

    /* ---- Live-Auffrischen: nur Zahlen/Bilder, keine Bedienelemente ---- */
    function liveTick() {
      syncTrainUI();
      CARDS.forEach(id => {
        const f = live[id];
        if (f && panelCtrl.isOpen(id)) f();
      });
    }
    /* Vollständiges Neuaufbauen — nur erlaubt, wenn gerade keine Schleife läuft. */
    function rebuildCards() {
      ['embed', 'hidden', 'output', 'train'].forEach(id => panelCtrl.refresh(id));
      if (live.net && panelCtrl.isOpen('net')) live.net();
      syncTrainUI();
    }

    function lossTxt() { return net.lossHistory.length ? net.lossHistory[net.lossHistory.length - 1].toFixed(2).replace('.', ',') : '–'; }
    function epochTxt() { return data.pairs.length ? (net.step / data.pairs.length).toFixed(1).replace('.', ',') : '0'; }
    function trainLabel() { return training ? '⏸ Training anhalten' : (net.step ? '▶ Weitertrainieren' : '▶ Training starten'); }
    function statTxt() { return 'Schritt ' + deInt(net.step) + ' · Fehler ' + lossTxt(); }

    /* Hält die beiden Trainings-Tasten (Zentrum + Karte) in Form, OHNE sie neu zu bauen. */
    function syncTrainUI() {
      if (centerToggle) {
        centerToggle.textContent = net.diverged ? 'Netz entgleist — neu initialisieren' : trainLabel();
        centerToggle.disabled = !data.pairs.length;
      }
      if (centerStat) centerStat.textContent = statTxt();
      if (centerDot) centerDot.classList.toggle('on', training);
      if (cardTrain && cardTrain.toggle.isConnected) cardTrain.toggle.textContent = trainLabel();
    }

    function doGenStep() {
      lastForward = forward(net, genSession.ctxIds);
      const probsT = softmaxTemp(lastForward.logits, temp);
      let id;
      if (temp <= 0.001) {
        let bi = 0, bv = -1;
        for (let i = 0; i < probsT.length; i++) if (probsT[i] > bv) { bv = probsT[i]; bi = i; }
        id = bi;
      } else {
        let r = Math.random(), acc = 0; id = probsT.length - 1;
        for (let i = 0; i < probsT.length; i++) { acc += probsT[i]; if (r <= acc) { id = i; break; } }
      }
      genSession.ctxIds = genSession.ctxIds.slice(1).concat([id]);
      const word = data.vocab[id];
      genSession.words.push(word);
      if (word === '.') genSession.sentences++;
      lastForward = forward(net, genSession.ctxIds);
      updateGenText();
      liveTick();
      return genSession.sentences < 3 && genSession.words.length < 60;
    }
    function startGenPlay() {
      if (genPlaying) return;
      genPlaying = true;
      genPlayBtn.textContent = '⏸ Pause';
      genTimer = setInterval(() => { if (!doGenStep()) stopGenPlay(); }, 500);
    }
    function stopGenPlay() {
      genPlaying = false;
      if (genPlayBtn) genPlayBtn.textContent = '▶ Wort für Wort vorhersagen';
      if (genTimer) { clearInterval(genTimer); genTimer = null; }
    }

    function trainTick() {
      const { nanHit } = trainBudget(net, data.pairs, 8);
      if (nanHit) {
        training = false;
        trainRAF = null;
        panelCtrl.refresh('train');
        syncTrainUI();
        return;
      }
      lastForward = forward(net, genSession.ctxIds);
      const now = performance.now();
      if (now - lastUIRefresh > 180) {
        lastUIRefresh = now;
        liveTick();
      }
      if (training) trainRAF = requestAnimationFrame(trainTick);
    }
    function startTraining() {
      if (training || !data.pairs.length || net.diverged) return;
      training = true;
      syncTrainUI();
      trainRAF = requestAnimationFrame(trainTick);
    }
    function pauseTraining() {
      training = false;
      if (trainRAF) { cancelAnimationFrame(trainRAF); trainRAF = null; }
      syncTrainUI();
      if (live.train && panelCtrl && panelCtrl.isOpen('train')) live.train();
    }
    function reinitNet() {
      pauseTraining();
      stopGenPlay();
      net = createNet(data.vocab.length, data.C);
      genSession = freshGenSession();
      lastForward = forward(net, genSession.ctxIds);
      updateGenText();
      rebuildCards();
    }

    function renderEmbedNode(container) {
      container.replaceChildren();
      const strip = el('div', 'ctxstrip');
      genSession.ctxIds.forEach(id => strip.appendChild(el('span', 'ctxtok inwin', wordLabel(data.vocab[id]))));
      strip.appendChild(el('span', 'flow-arrow', '→'));
      strip.appendChild(el('span', 'ctxtok next', '?'));
      container.appendChild(strip);
      container.appendChild(el('p', 'small', 'Jedes dieser Wörter ist für das Netz nur eine Reihe von ' + net.d + ' Zahlen:'));
      genSession.ctxIds.forEach(id => {
        const row = el('div');
        row.appendChild(el('p', 'small', wordLabel(data.vocab[id])));
        const vals = [];
        for (let j = 0; j < net.d; j++) vals.push(net.embed[id * net.d + j]);
        row.appendChild(renderSwatch(vals, 1.5));
        container.appendChild(row);
      });
      container.appendChild(Info.legend([
        { color: 'var(--src-a)', label: 'positive Zahl', sub: 'je kräftiger, desto größer' },
        { color: 'var(--src-b)', label: 'negative Zahl', sub: 'je kräftiger, desto kleiner' }
      ]));
      container.appendChild(Info.note('Tipp mit der Maus auf eine Zelle für den genauen Wert. Diese Zahlen entstehen allein durchs Training — niemand hat sie von Hand gesetzt.', '🔢'));
      live.embed = () => renderEmbedNode(container);
    }

    function renderHiddenNode(container) {
      container.replaceChildren();
      container.appendChild(el('p', 'small', 'Aus den Zahlen der Kontextwörter rechnet das Netz diese ' + net.H + ' neuen Zahlen aus — eine pro Hidden-Neuron:'));
      container.appendChild(renderSwatch(Array.from(lastForward.h), 1));
      container.appendChild(Info.note('Keine einzelne Zahl bedeutet für sich etwas — erst das Muster aller ' + net.H + ' zusammen. Niemand kann hineinschauen und sagen: "hier steht Hund". Genau das ist bei echten Sprachmodellen das Problem.', '🙈'));
      container.appendChild(Info.note('Im Netz-Bild unten ist jede dieser Zahlen ein Punkt in der mittleren Spalte — mit allen Kanten, die hinein- und hinausführen.', '🕸'));
      live.hidden = () => renderHiddenNode(container);
    }

    function renderOutputNode(container) {
      container.replaceChildren();
      const head = el('p', 'small');
      const heatHost = el('div');
      container.append(head, heatHost);

      function paint() {
        head.textContent = net.step === 0
          ? 'Vor dem Training ist (fast) jedes Wort etwa gleich wahrscheinlich:'
          : 'Wahrscheinlichkeit für das nächste Wort gerade jetzt:';
        const probsT = softmaxTemp(lastForward.logits, temp);
        const arr = [];
        for (let i = 0; i < probsT.length; i++) arr.push([i, probsT[i]]);
        arr.sort((a, b) => b[1] - a[1]);
        const K = 9;
        const top = arr.slice(0, K);
        const restMass = arr.slice(K).reduce((s, x) => s + x[1], 0);
        const restCount = arr.length - K;
        const cands = top.map(([i, p]) => ({ word: data.vocab[i], label: wordLabel(data.vocab[i]), p }));
        if (restCount > 0) cands.push({ word: '__rest__', label: '+ ' + restCount + ' weitere Wörter', p: restMass, tag: 'Rest' });
        Heat.render(heatHost, cands, { maxRows: 10, accent: 'var(--cat-candidates)' });
      }
      paint();

      const sl = el('div', 'slider');
      const lab = el('label');
      const out = el('output', null, de1(temp));
      lab.append(document.createTextNode('Zufall beim Vorhersagen'), out);
      const inp = el('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '2'; inp.step = '0.1'; inp.value = String(temp);
      inp.addEventListener('input', () => {
        temp = parseFloat(inp.value);
        out.textContent = de1(temp);
        paint();
        if (live.net && panelCtrl.isOpen('net')) live.net();
      });
      sl.append(lab, inp);
      container.appendChild(sl);
      container.appendChild(Info.key('Diese Wahrscheinlichkeiten kommen aus einer Rechnung über die Zahlen des Netzes — nicht aus einer Tabelle mit gezählten Wörtern wie in Phase 1 und 2. Trotzdem sieht das Ergebnis am Ende gleich aus: eine Liste mit Prozenten.'));
      live.output = paint;
    }

    function renderNetNode(container) {
      container.replaceChildren();
      if (!data.pairs.length) {
        container.appendChild(el('p', 'small muted', 'Wähl zuerst in „📚 Textwelten“ Texte aus — dann gibt es ein Netz zu zeigen.'));
        live.net = null;
        return;
      }
      netView.mount(container);
      live.net = () => netView.update();
    }

    function renderTrainNode(container) {
      container.replaceChildren();
      cardTrain = null;
      if (net.diverged) {
        container.appendChild(el('p', 'small net-warn', 'Die Lernrate war zu hoch — das Training ist entgleist.'));
        const rb = el('button', 'btn primary', 'Neu initialisieren');
        rb.type = 'button';
        rb.addEventListener('click', reinitNet);
        container.appendChild(rb);
        live.train = null;
        return;
      }
      const info = el('p', 'small');
      const stepB = el('b', null, deInt(net.step));
      const lossB = el('b', null, lossTxt());
      const epochS = el('span', null, epochTxt());
      info.append('Schritt ', stepB, ' · Fehler ', lossB, ' · ', epochS, '× durch alle Beispiele');
      container.appendChild(info);

      const sparkHost = el('div', 'spark-host');
      sparkHost.appendChild(renderSparkline(net.lossHistory, 260, 60));
      container.appendChild(sparkHost);
      container.appendChild(el('p', 'small muted', 'Die Linie ist der Fehler: Wie stark lag das Netz daneben? Sie soll fallen.'));

      const ctl = el('div', 'machine-controls');
      const toggle = el('button', 'btn primary', trainLabel());
      toggle.type = 'button';
      toggle.disabled = !data.pairs.length;
      toggle.addEventListener('click', () => { if (training) pauseTraining(); else startTraining(); });
      const resetBtn = el('button', 'btn', 'Neu initialisieren');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', reinitNet);
      ctl.append(toggle, resetBtn);
      container.appendChild(ctl);
      container.appendChild(Info.steps([
        ['Raten.', 'Das Netz sagt für ein Beispiel aus deinen Texten das nächste Wort voraus.'],
        ['Vergleichen.', 'Es schaut nach, welches Wort wirklich dort stand.'],
        ['Nachjustieren.', 'Alle Zahlen im Netz werden ein winziges Stück in die richtige Richtung geschoben.'],
        ['Wiederholen.', 'Tausende Male — bis die Fehlerlinie oben unten bleibt.']
      ]));
      container.appendChild(Info.key('Gespeichert wird dabei kein einziger Satz, nur Zahlen. Trotzdem kann das Netz danach Sätze in deinem Stil vorhersagen.'));

      cardTrain = { stepB, lossB, epochS, sparkHost, toggle };
      live.train = () => {
        if (!cardTrain || !cardTrain.stepB.isConnected) return;
        cardTrain.stepB.textContent = deInt(net.step);
        cardTrain.lossB.textContent = lossTxt();
        cardTrain.epochS.textContent = epochTxt();
        cardTrain.sparkHost.replaceChildren(renderSparkline(net.lossHistory, 260, 60));
        cardTrain.toggle.textContent = trainLabel();
      };
    }

    function render() {
      pauseTraining();
      stopGenPlay();
      temp = 1;
      CARDS.forEach(id => { live[id] = null; });
      cardTrain = null;
      if (netView) { netView.destroy(); netView = null; }

      const texts = State.activeTexts();
      data = buildPhase3Data(texts, { vocabCap: 600, C: 3 });
      net = createNet(data.vocab.length, data.C);
      genSession = freshGenSession();
      lastForward = forward(net, genSession.ctxIds);

      netView = NetView.create({
        getNet: () => net,
        getData: () => data,
        getForward: () => lastForward,
        getProbs: () => softmaxTemp(lastForward.logits, temp),
        getCtxIds: () => genSession.ctxIds,
        wordLabel
      });

      const center = el('div', 'box machine-center');
      center.appendChild(el('p', 'eyebrow', 'Phase 3 · Echtes neuronales Netz'));
      center.appendChild(el('h2', null, 'Keine Texte gespeichert — nur Zahlen'));

      bannerEl = el('div', 'net-banner');
      bannerEl.hidden = true;
      bannerEl.append(
        el('span', 'small', 'Deine Textauswahl hat sich geändert.'),
        (() => { const b = el('button', 'btn primary', 'Jetzt neu trainieren'); b.type = 'button'; b.addEventListener('click', render); return b; })()
      );
      center.appendChild(bannerEl);

      flowHost = el('div', 'flow-host');
      center.appendChild(flowHost);

      /* Trainings-Steuerung im Zentrum: wird während des Trainings NIE neu gebaut,
         damit "anhalten" immer anklickbar bleibt. */
      const bar = el('div', 'net-trainbar');
      centerDot = el('i', 'net-live-dot');
      centerDot.setAttribute('aria-hidden', 'true');
      centerToggle = el('button', 'btn primary', trainLabel());
      centerToggle.type = 'button';
      centerToggle.addEventListener('click', () => {
        if (net.diverged) { reinitNet(); return; }
        if (training) pauseTraining(); else startTraining();
      });
      const centerReset = el('button', 'btn', 'Neu initialisieren');
      centerReset.type = 'button';
      centerReset.addEventListener('click', reinitNet);
      centerStat = el('span', 'counter', statTxt());
      centerStat.setAttribute('role', 'status');
      bar.append(centerDot, centerToggle, centerReset, centerStat);
      center.appendChild(bar);

      const inDim = net.C * net.d;
      const paramCount = data.vocab.length * net.d + inDim * net.H + net.H + net.H * data.vocab.length + data.vocab.length;
      const archRow = el('div', 'net-arch');
      archRow.append(
        el('span', 'small', inDim + ' → ' + net.H + ' → ' + deInt(data.vocab.length) + ' Neuronen'),
        el('span', 'small muted', deInt(paramCount) + ' Zahlen (Gewichte)')
      );
      netBtn = el('button', 'btn', '🕸 Netz-Bild ansehen');
      netBtn.type = 'button';
      netBtn.addEventListener('click', () => panelCtrl.reveal('net'));
      archRow.appendChild(netBtn);
      center.appendChild(archRow);

      center.appendChild(el('p', 'small muted', deInt(data.pairs.length) + ' Trainingsbeispiele aus ' + texts.length + ' Texten · Vokabular: ' + deInt(data.vocab.length) + ' Wörter'));

      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      textEl.appendChild(cursor);
      center.appendChild(textEl);

      const controls = el('div', 'machine-controls');
      genPlayBtn = el('button', 'btn', '▶ Wort für Wort vorhersagen');
      genPlayBtn.type = 'button';
      genPlayBtn.disabled = !texts.length;
      genPlayBtn.addEventListener('click', () => { if (genPlaying) stopGenPlay(); else startGenPlay(); });
      const stepBtn = el('button', 'btn', 'Ein Wort weiter');
      stepBtn.type = 'button';
      stepBtn.disabled = !texts.length;
      stepBtn.addEventListener('click', () => { stopGenPlay(); doGenStep(); });
      const resetGenBtn = el('button', 'btn', 'Von vorn');
      resetGenBtn.type = 'button';
      resetGenBtn.addEventListener('click', () => {
        stopGenPlay();
        genSession = freshGenSession();
        lastForward = forward(net, genSession.ctxIds);
        updateGenText();
        liveTick();
      });
      controls.append(genPlayBtn, stepBtn, resetGenBtn);
      center.appendChild(controls);
      center.appendChild(Info.box('Der Unterschied zu Phase 1 und 2', 'Hier wird nicht nachgeschlagen. Dieses Netz hat deine Texte nur ein einziges Mal gesehen und sich dabei Zahlen gemerkt — die Texte selbst sind weg. Vor dem Training rät es Unsinn; trainiere es und sieh zu, wie die Vorhersage besser wird.', { icon: '🧠' }));

      const items = [
        {
          id: 'embed', label: 'Embedding', cat: 'origin', hint: 'Schritt 1 + 2', manual: true, render: renderEmbedNode,
          info: { title: 'Wie wird aus einem Wort eine Zahl?', text: 'Das Netz kennt keine Buchstaben. Jedes Wort hat eine eigene Zahlenreihe, die beim Training immer wieder angepasst wird. Ähnliche Wörter bekommen mit der Zeit ähnliche Zahlen.', icon: '🔢' }
        },
        {
          id: 'hidden', label: 'Hidden-Schicht', cat: 'context', hint: 'Schritt 3', manual: true, render: renderHiddenNode,
          info: { title: 'Was passiert in der Mitte?', text: 'Die Zahlen aller Kontextwörter werden zusammengerechnet und zu ' + net.H + ' neuen Zahlen vermischt. Das ist die "versteckte" Schicht — niemand kann ihr ansehen, was sie bedeutet.', icon: '📦' }
        },
        {
          id: 'output', label: 'Ausgabe & Wahrscheinlichkeiten', cat: 'candidates', hint: 'Schritt 4', manual: true, render: renderOutputNode,
          info: { title: 'Wie wird daraus ein Wort?', text: 'Aus den ' + net.H + ' Zahlen wird für jedes Wort im Vokabular ein Wert berechnet und in Prozent umgerechnet. Das Netz würfelt dann aus dieser Liste — genau wie in Phase 1 und 2.', icon: '📊' }
        },
        {
          id: 'train', label: 'Training', cat: 'random', hint: 'Schritt 5', manual: true, render: renderTrainNode,
          info: { title: 'Wie lernt das Netz?', text: 'Durch Raten und Korrigieren. Es sagt ein Wort voraus, vergleicht mit dem echten Wort und verschiebt danach alle seine Zahlen ein winziges Stück. Das ist alles, was "Lernen" bei einer KI bedeutet.', icon: '🏋️' }
        },
        {
          id: 'net', label: 'Das Netz von innen', cat: 'net', hint: 'Neuronen & Kanten', wide: true, manual: true, render: renderNetNode,
          info: {
            title: 'Das hier IST das Netz — kein Schaubild',
            text: 'Links ' + inDim + ' Eingangs-Zahlen (' + net.C + ' Kontextwörter × ' + net.d + '), in der Mitte die ' + net.H + ' Hidden-Neuronen, rechts ' + deInt(data.vocab.length) + ' Ausgabe-Neuronen — eins pro Wort (gezeichnet sind die stärksten). Jede Linie ist eine echte Kante mit ihrem Gewicht aus dem Netz: warm = positiv, kühl = negativ, kräftig = großer Betrag. Klick auf ein Neuron, um seine Zahlen zu sehen, und lass das Training laufen — dann siehst du die Gewichte sich verändern.',
            icon: '🕸'
          }
        }
      ];
      panelCtrl = Panel.mount(host, center, items, { phase: 3 });
      updateGenText();
      updateFlow();
      syncTrainUI();
    }

    render();
    State.on('corpus-changed', () => { if (host.isConnected && bannerEl) bannerEl.hidden = false; });
  }
});
