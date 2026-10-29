/* Phase 3: echtes neuronales Netz. Zentrum = Vorhersage + Wahl des Kontextfensters;
   rechts dieselben vier Schritte wie in Phase 1/2 (① Embedding · ② Hidden-Schicht · ③ Kandidaten ·
   ④ Zufall, siehe panel.js) und darunter, ohne Nummer, das Training; unten breit das echte
   Netz-Bild (netview.js).

   WICHTIG — warum hier nicht panelCtrl.refreshAll() läuft:
   Der Trainings-Tick aktualisiert die Anzeige mehrmals pro Sekunde. Würde er dabei die Karten
   komplett neu rendern, wären Buttons und Slider mitten im Klick weg (das Element verschwindet
   zwischen pointerdown und pointerup -> es kommt nie ein click an, das Training ließ sich nicht
   mehr anhalten). Darum: alle Karten sind manual:true, und jede Render-Funktion hinterlegt in
   live[id] eine Funktion, die NUR die Zahlen/Bilder auffrischt und die Bedienelemente stehen lässt.
   Die Trainingstasten sitzen nur in der rechten Karte "Training" (samt Aufbau-Zeile und Netz-Bild-Knopf);
   sie wird während des Trainings nie neu gebaut. Schließt man die Karte, hält das Training an.
   Wie viele Wörter das Netz zurückschaut (3, 4 oder 5), wählt man im Zentrum; ein anderes Fenster
   ist ein anderes Netz. Die drei Netze bleiben aber nebeneinander bestehen (slots): man kann alle drei
   trainieren und hin und her wechseln; erst eine neue Textauswahl ("Netz neu bauen") wirft sie weg.
   Wahl gemerkt in localStorage tinylm-p3-kontext. */
const P3_CTX = [3, 4, 5];
const P3_CTX_KEY = 'tinylm-p3-kontext';
function deInt(n) { return n.toLocaleString('de-DE'); }
function valueColor(v, scale) {
  const t = Math.max(-1, Math.min(1, v / scale));
  return t >= 0
    ? 'color-mix(in srgb, var(--src-a) ' + Math.round(t * 100) + '%, var(--surface))'
    : 'color-mix(in srgb, var(--src-b) ' + Math.round(-t * 100) + '%, var(--surface))';
}
function renderSwatch(values, scale) {
  const row = el('div', 'swatchrow');
  row.style.setProperty('--cols', String(Math.min(values.length, 20)));
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
  /* Geglättet (gleitender Mittelwert): jeder Punkt ist der Schnitt über ein paar Millisekunden
     zufälliger Beispiele und springt deshalb stark — die Richtung soll man aber sehen. */
  const sm = [];
  let acc = history[0];
  history.forEach(v => { acc = acc * 0.85 + v * 0.15; sm.push(acc); });
  history = sm;
  const mn = Math.min(...history), mx = Math.max(...history);
  const range = (mx - mn) || 1;
  const pts = history.map((v, i) => (i / (history.length - 1)) * w + ',' + (h - ((v - mn) / range) * (h - 6) - 3)).join(' ');
  const poly = document.createElementNS(ns, 'polyline');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('stroke', 'var(--cat-train)');
  poly.setAttribute('stroke-width', '2.5');
  poly.setAttribute('stroke-linejoin', 'round');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(poly);
  return svg;
}

Phases.register(3, {
  mount(host) {
    let data, net, genSession, lastForward, netView = null;
    let temp = 1, training = false, trainRAF = null, lastUIRefresh = 0;
    let genPlaying = false, genTimer = null;
    let textEl, cursor, genPlayBtn, bannerEl, panelCtrl, placeholder;
    let centerToggle, centerDot;
    const slots = {};   /* Kontextlänge -> { data, net, genSession, version }: je ein Netz pro Fenster */
    let builtVersion = 0;
    let cardTrain = null;
    let ctxLen = 3;
    try { const v = Number(localStorage.getItem(P3_CTX_KEY)); if (P3_CTX.includes(v)) ctxLen = v; } catch (e) { /* ohne Speicher: 3 */ }
    function saveSlot() {
      if (data && net) slots[ctxLen] = { data, net, genSession, version: builtVersion };
    }
    const live = {};  /* Karten-Id -> Auffrisch-Funktion; nur offene Karten tragen sich ein */

    const CARDS = ['embed', 'hidden', 'output', 'net', 'train'];

    function freshGenSession() {
      const startId = data.toId('.');
      return { ctxIds: Array(data.C).fill(startId), words: [], sentences: 0 };
    }

    function wordLabel(w) { return w === data.UNK ? '[unbekannt]' : (w === '.' ? '(Satzende)' : showWord(w)); }

    function updateGenText() {
      textEl.replaceChildren();
      if (placeholder) placeholder.hidden = genSession.words.length > 0;
      textEl.hidden = !genSession.words.length;
      let prev = '.';
      genSession.words.forEach((w, idx) => {
        const punct = (w === '.' || w === ',');
        let txt = w === data.UNK ? '…' : data.display(w);
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
      ['embed', 'hidden', 'output', 'rand', 'train'].forEach(id => panelCtrl.refresh(id));
      if (live.net && panelCtrl.isOpen('net')) live.net();
      syncTrainUI();
    }

    /* Fehler als Mittel der letzten Messungen: ein einzelner Wert ist der Schnitt über ein paar
       Millisekunden zufälliger Beispiele und springt stark (die Anzeige flackerte). */
    function curLoss() {
      const h = net.lossHistory;
      if (!net.step || !h.length) return null;
      const k = Math.min(25, h.length);
      let sum = 0;
      for (let i = h.length - k; i < h.length; i++) sum += h[i];
      return sum / k;
    }
    function lossTxt() { const l = curLoss(); return l == null ? '–' : l.toFixed(2).replace('.', ','); }
    function epochTxt() { return data.pairs.length ? (net.step / data.pairs.length).toFixed(1).replace('.', ',') : '0'; }
    function trainLabel() { return training ? '❚❚ Anhalten' : (net.step ? '▶ Weitertrainieren' : '▶ Training starten'); }

    /* Hält die beiden Trainings-Tasten (Zentrum + Karte) in Form, OHNE sie neu zu bauen. */
    function syncTrainUI() {
      if (centerToggle) {
        centerToggle.textContent = net.diverged ? 'Netz entgleist — neu initialisieren' : trainLabel();
        centerToggle.disabled = !data.pairs.length;
      }
      if (centerToggle) centerToggle.classList.toggle('playing', training);
      if (centerDot) centerDot.classList.toggle('on', training);
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
      genPlayBtn.textContent = '❚❚ Pause';
      genPlayBtn.classList.add('playing');
      genTimer = setInterval(() => { if (!doGenStep()) stopGenPlay(); }, 500);
    }
    function stopGenPlay() {
      genPlaying = false;
      if (genPlayBtn) { genPlayBtn.textContent = '▶ Vorhersagen'; genPlayBtn.classList.remove('playing'); }
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
      genSession.ctxIds.forEach(id => {
        const row = el('div', 'embrow');
        row.appendChild(el('span', 'embrow-w', wordLabel(data.vocab[id])));
        const vals = [];
        for (let j = 0; j < net.d; j++) vals.push(net.embed[id * net.d + j]);
        row.appendChild(renderSwatch(vals, 1.5));
        container.appendChild(row);
      });
      container.appendChild(el('p', 'mini-legend', 'je Wort ' + net.d + ' Zahlen · rot = plus · blau = minus'));
      live.embed = () => renderEmbedNode(container);
    }

    function renderHiddenNode(container) {
      container.replaceChildren();
      container.appendChild(renderSwatch(Array.from(lastForward.h), 1));
      container.appendChild(el('p', 'mini-legend', net.H + ' Hidden-Neuronen · was bedeutet eins davon? Niemand weiß es 🙈'));
      live.hidden = () => renderHiddenNode(container);
    }

    function renderOutputNode(container) {
      container.replaceChildren();
      const head = el('p', 'card-line');
      const heatHost = el('div');
      container.append(head, heatHost);

      function paint() {
        head.textContent = net.step === 0
          ? 'Untrainiert: alle Wörter fast gleich wahrscheinlich.'
          : 'Nächstes Wort – gerade jetzt:';
        const probsT = softmaxTemp(lastForward.logits, temp);
        const arr = [];
        for (let i = 0; i < probsT.length; i++) arr.push([i, probsT[i]]);
        arr.sort((a, b) => b[1] - a[1]);
        const K = 7;
        const top = arr.slice(0, K);
        const restMass = arr.slice(K).reduce((s, x) => s + x[1], 0);
        const restCount = arr.length - K;
        const cands = top.map(([i, p]) => ({ word: data.vocab[i], label: wordLabel(data.vocab[i]), p }));
        if (restCount > 0) cands.push({ word: '__rest__', label: '+' + restCount + ' andere', p: restMass });
        Heat.render(heatHost, cands, { maxRows: 8, accent: 'var(--cat-candidates)' });
      }
      paint();
      live.output = paint;
    }

    /* Zufall als eigene Karte wie in Phase 1/2. Ohne live-Funktion: hier ändert sich beim Training
       nichts, und der Regler darf beim Ziehen nicht neu gebaut werden. */
    function renderRandNode(container) {
      container.replaceChildren();
      const sl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => {
          temp = Math.round(v * 10) / 10;
          if (live.output && panelCtrl.isOpen('output')) live.output();
          if (live.net && panelCtrl.isOpen('net')) live.net();
        }
      });
      container.appendChild(sl.el);
    }

    function renderNetNode(container) {
      container.replaceChildren();
      if (!data.pairs.length) {
        container.appendChild(el('p', 'card-empty', 'Wähl zuerst in „Textwelten“ Texte aus.'));
        live.net = null;
        return;
      }
      netView.mount(container);
      live.net = () => netView.update();
    }

    /* Alles zum Training an einer Stelle (rechts): Tasten, Zahlen, Fehlerlinie, Aufbau, Netz-Bild.
       Diese Karte wird während des Trainings nie neu gebaut (siehe Kopfkommentar). */
    function renderTrainNode(container) {
      container.replaceChildren();
      cardTrain = null;
      centerToggle = centerDot = null;
      if (net.diverged) {
        container.appendChild(el('p', 'small net-warn', 'Das Training ist entgleist (Lernrate zu hoch).'));
        const rb = el('button', 'btn primary', 'Neu initialisieren');
        rb.type = 'button';
        rb.addEventListener('click', reinitNet);
        container.appendChild(rb);
        live.train = null;
        return;
      }
      centerDot = el('i', 'net-live-dot');
      centerDot.setAttribute('aria-hidden', 'true');

      const tBtns = el('div', 'trainbox-btns');
      centerToggle = el('button', 'btn primary train-btn', trainLabel());
      centerToggle.type = 'button';
      centerToggle.dataset.spot = 'train';
      centerToggle.addEventListener('click', () => {
        if (net.diverged) { reinitNet(); return; }
        if (training) pauseTraining(); else startTraining();
      });
      const resetBtn = el('button', 'btn sm', '↺ Netz zurücksetzen');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', reinitNet);
      tBtns.append(centerDot, centerToggle, resetBtn);
      container.appendChild(tBtns);

      const facts = el('div', 'trainfacts');
      const fact = (k) => { const f = el('div', 'trainfact'); const v = el('b'); f.append(v, el('span', null, k)); facts.appendChild(f); return v; };
      const stepB = fact('Schritte');
      const lossB = fact('Fehler');
      const epochS = fact('× alle Beispiele');
      const lrB = fact('Schrittgröße');
      container.appendChild(facts);

      const sparkHead = el('div', 'spark-head');
      sparkHead.append(el('span', 'card-line', 'Fehlerlinie'), Help.btn('fehler', 'sm'));
      container.appendChild(sparkHead);
      const sparkHost = el('div', 'spark-host');
      container.appendChild(sparkHost);

      /* Aufbau: 48 Zahlen rein → 40 Hidden-Neuronen → 600 Wörter raus */
      const inDim = net.C * net.d;
      const paramCount = data.vocab.length * net.d + inDim * net.H + net.H + net.H * data.vocab.length + data.vocab.length;
      const archRow = el('div', 'net-arch');
      const arch = el('span', 'arch-num', inDim + ' → ' + net.H + ' → ' + deInt(data.vocab.length));
      arch.title = inDim + ' Eingabe-Zahlen (' + net.C + ' Wörter × ' + net.d + ') → ' + net.H + ' Hidden-Neuronen → ' + deInt(data.vocab.length) + ' Ausgabe-Neuronen (eins je Wort)';
      const archLab = el('span', 'arch-lab', 'Eingabe → Hidden → Wörter');
      archRow.append(arch, archLab,
        el('span', 'small muted', deInt(paramCount) + ' Zahlen · ' + deInt(data.pairs.length) + ' Beispiele'));
      const netBtn = el('button', 'btn sm', '🕸 Netz-Bild');
      netBtn.type = 'button';
      netBtn.addEventListener('click', () => panelCtrl.reveal('net'));
      archRow.appendChild(netBtn);
      container.appendChild(archRow);

      cardTrain = { stepB, lossB, epochS, lrB, sparkHost };
      live.train = () => {
        if (!cardTrain || !cardTrain.stepB.isConnected) return;
        cardTrain.stepB.textContent = deInt(net.step);
        cardTrain.lossB.textContent = lossTxt();
        cardTrain.epochS.textContent = epochTxt();
        cardTrain.lrB.textContent = net.lr.toFixed(3).replace('.', ',');
        cardTrain.sparkHost.replaceChildren(renderSparkline(net.lossHistory, 260, 60));
      };
      live.train();
      syncTrainUI();
    }

    function render(fresh) {
      pauseTraining();
      stopGenPlay();
      temp = 1;
      CARDS.forEach(id => { live[id] = null; });
      cardTrain = null;
      if (netView) { netView.destroy(); netView = null; }

      const texts = State.activeTexts();
      if (fresh === true) Object.keys(slots).forEach(k => delete slots[k]);
      const slot = slots[ctxLen];
      if (slot && slot.version === State.corpusVersion) {
        data = slot.data; net = slot.net; genSession = slot.genSession;
      } else {
        data = buildPhase3Data(texts, { vocabCap: 600, C: ctxLen });
        net = createNet(data.vocab.length, data.C);
        genSession = freshGenSession();
      }
      builtVersion = State.corpusVersion;
      lastForward = forward(net, genSession.ctxIds);
      saveSlot();

      netView = NetView.create({
        getNet: () => net,
        getData: () => data,
        getForward: () => lastForward,
        getProbs: () => softmaxTemp(lastForward.logits, temp),
        getCtxIds: () => genSession.ctxIds,
        wordLabel
      });

      const center = el('div', 'box machine-center');
      center.appendChild(Info.centerHead('Phase 3 · Echtes Netz', 'Keine Texte gespeichert – nur Zahlen', 'p3'));

      bannerEl = el('div', 'net-banner');
      bannerEl.hidden = true;
      bannerEl.append(
        el('span', 'small', '📚 Neue Textauswahl.'),
        (() => { const b = el('button', 'btn sm primary', 'Netz neu bauen'); b.type = 'button'; b.addEventListener('click', () => render(true)); return b; })()
      );
      center.appendChild(bannerEl);

      /* ① Vorhersagen */
      const paper = el('div', 'paper');
      placeholder = el('p', 'paper-ph', 'Hier sagt das Netz Wort für Wort vorher …');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      textEl.appendChild(cursor);
      paper.append(placeholder, textEl);
      center.appendChild(paper);

      const controls = el('div', 'machine-controls');
      genPlayBtn = el('button', 'btn primary', '▶ Vorhersagen');
      genPlayBtn.type = 'button';
      genPlayBtn.dataset.spot = 'gen';
      genPlayBtn.disabled = !texts.length;
      genPlayBtn.addEventListener('click', () => { if (genPlaying) stopGenPlay(); else startGenPlay(); });
      const stepBtn = el('button', 'btn', '+1 Wort');
      stepBtn.type = 'button';
      stepBtn.disabled = !texts.length;
      stepBtn.addEventListener('click', () => { stopGenPlay(); doGenStep(); });
      const resetGenBtn = el('button', 'btn', '↺ Von vorn');
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

      /* Wie weit schaut das Netz zurück? Wechsel = neues Netz (render baut alles neu). */
      const ctxRow = el('div', 'ctxpick');
      ctxRow.dataset.spot = 'ctxlen';
      ctxRow.appendChild(el('span', 'small', 'Kontextfenster: die letzten'));
      const ctxBtns = el('div', 'ctxpick-btns');
      ctxBtns.setAttribute('role', 'radiogroup');
      ctxBtns.setAttribute('aria-label', 'Wie viele Wörter sieht das Netz?');
      P3_CTX.forEach(c => {
        const sl = c === ctxLen ? { net } : slots[c];
        const trained = !!(sl && sl.net.step);
        const b = el('button', 'chip' + (c === ctxLen ? ' active' : '') + (trained ? ' trained' : ''), String(c) + (trained ? ' ✓' : ''));
        if (trained) b.title = 'Für ' + c + ' Wörter schon trainiert – bleibt erhalten';
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', c === ctxLen ? 'true' : 'false');
        b.addEventListener('click', () => {
          if (c === ctxLen) return;
          saveSlot();
          ctxLen = c;
          try { localStorage.setItem(P3_CTX_KEY, String(c)); } catch (e) { /* ohne Speicher geht es auch */ }
          render();
        });
        ctxBtns.appendChild(b);
      });
      ctxRow.append(ctxBtns, el('span', 'small', 'Wörter'), Help.btn('kontextnetz', 'sm'));
      center.appendChild(ctxRow);

      if (!texts.length) center.appendChild(el('p', 'warnline', 'Keine Texte ausgewählt – öffne oben „Textwelten“.'));

      const items = [
        { id: 'embed', label: 'Embedding', cat: 'embed', hint: '1', help: 'embedding', manual: true, render: renderEmbedNode },
        { id: 'hidden', label: 'Hidden-Schicht', cat: 'hidden', hint: '2', help: 'hidden', manual: true, render: renderHiddenNode },
        { id: 'output', label: 'Kandidaten', cat: 'candidates', hint: '3', help: 'ausgabe', manual: true, render: renderOutputNode },
        { id: 'rand', label: 'Zufall', cat: 'random', hint: '4', help: 'zufall', manual: true, render: renderRandNode },
        { id: 'train', label: 'Training', cat: 'train', help: 'training', manual: true, onClose: pauseTraining, render: renderTrainNode },
        { id: 'net', label: 'Das Netz von innen', cat: 'net', wide: true, manual: true, open: false, help: 'netz', render: renderNetNode }
      ];
      panelCtrl = Panel.mount(host, center, items, { phase: 3 });
      updateGenText();
      syncTrainUI();
    }

    render(true);
    State.on('corpus-changed', () => { if (bannerEl && State.corpusVersion !== builtVersion) bannerEl.hidden = false; });

    return {
      reveal: id => panelCtrl.reveal(id, true),
      onHide: () => { pauseTraining(); stopGenPlay(); }
    };
  }
});
