/* Phase 4: echtes neuronales Netz (bis 12.11.2026 Phase 3, Datei phase3.js) — „Handy + Zerlegen“ wie Phase 1 (Sönke 02.11.2026).

   Links das HANDY als Chat wie in Phase 2/3 (Sönke 13.11.2026: ohne Frage fühlte sich Phase 4 wie
   ein Rückschritt an): erst Vorschläge + Eingabefeld, dann die Frage oben rechts und darunter Tinys
   Antwort Wort für Wort (Bausteine alle gleich gefärbt — das Netz weiß nicht mehr, aus welchem Text
   ein Wort kommt), Tiny sagt, wie es um das Netz steht, darunter ▶ Weiter · +1 Wort · ↻ Nochmal.
   Die Frage ist ein EIGENER EINGANG des Netzes (phase4-net.js, opts.topic): der Mittelpunkt der
   Embeddings ihrer Inhaltswörter, bei jedem Wort zusätzlich zu den letzten C Wörtern — so bleibt die
   Antwort beim Thema, obwohl die Frage nie im Kontextfenster steht. Rechts oben breit das TRAINING (zu Beginn offen: ohne Training
   rät das Netz nur), darunter dieselben drei Spalten wie in Phase 1/2 (gleiche Plätze, Farben):
     Kandidaten     (③ Prozent für jedes Wort — Temperatur im festen Kopf)
     Embedding      (① was das Netz sieht — Wahl 3 · 4 · 5 Wörter im festen Kopf)
     Frage          (⭐ wie aus der Frage der Frage-Eingang wird und was er gerade ändert — Frage-Stärke im
                    Kopf; ersetzt seit 14.11.2026 die Spalte Hidden-Schicht, die steht unten im Netz-Bild)
   und unten breit „Das Netz von innen“ (netview.js).

   Erst aufklappen, dann im Handy sichtbar (wie Phase 1):
     Embedding      → die letzten Token, die das Netz sieht, sind umrandet
     Kandidaten     → „?“-Baustein für das nächste Wort, Tiny sagt, was am ehesten kommt
     Frage          → die Wörter der Frage im Handy: gezählte Nomen farbig, der Rest durchgestrichen
   Ein Wort im Handy antippen = genau diesen Schritt zerlegen: je Wort merkt sich doGenStep, was das
   Netz damals sah und rechnete (ctxIds, logits, h). Offen/zu je Gerät in tinylm-p4-offen.

   WICHTIG — Live-Regel: Der Trainings-Tick frischt die Anzeige mehrmals pro Sekunde auf. Er baut
   nur die Inhalte der Spalten neu (dort gibt es nichts anzutippen), nie Knöpfe oder Regler: der
   Trainings-Knopf, die Temperatur und die Wahl 3 · 4 · 5 sitzen in festen Köpfen (.p1-col-tools),
   live.train ändert nur Zahlen und die Fehlerlinie, syncTrainUI nur Text/Klassen des Knopfs, der
   Banner „Du zerlegst …“ wird beim Tick nicht angefasst. (Ein Element, das zwischen pointerdown und
   pointerup ersetzt wird, bekommt nie seinen click — so ließ sich das Training einmal nicht anhalten.)
   Jede Kontextlänge ist ein eigenes Netz; die drei Netze bleiben nebeneinander (slots), erst eine
   neue Textauswahl („Netz neu bauen“) wirft sie weg. Wahl gemerkt in localStorage tinylm-p4-kontext. */
const P4_CTX = [3, 4, 5];
const P4_CTX_KEY = 'tinylm-p4-kontext';
/* 14.11.2026 (Sönke: „funktioniert nicht richtig gut“), gemessen offline, 30 s Training: 32 statt 16
   Zahlen je Wort + nur die Nomen der Frage → Thema ~53 % → ~60–67 %; Temperatur 0,6 statt 1 →
   Satzfluss (Dreiwortfolgen, die so in den Texten stehen) +15–25 Punkte. Mehr Hidden-Neuronen (80+)
   helfen erst nach 2–3 Minuten Training, vorher schaden sie. */
const P4_D = 32;
/* 60 statt 40 Hidden-Neuronen (14.11.2026): nach kurzem Training gleich, nach längerem geradere Sätze
   (Satzfluss 72–75 % statt 64–70 % nach 60 s offline, drei Läufe); 2 Hidden-Schichten lernten viel
   langsamer (Fehler 2,6 statt 0,9 nach gleicher Zeit) und wurden verworfen. */
const P4_H = 60;
/* Vokabular-Obergrenze 1300 statt 600 (Sönke 14.11.2026): die 90 Standardtexte haben 1 243 verschiedene
   Wörter → alle passen hinein, kein „[unbekannt]“ mehr; die Plätze bis 1300 nutzen nur eigene Texte
   (buildPhase4Data nimmt nie mehr Wörter, als es gibt). Preis: jedes Wort hat ein Ausgabe-Neuron, also
   etwa halb so viele Durchgänge in derselben Zeit — nach kurzem Training schwächer, nach längerem
   geradere Sätze (offline 60 s: Satzfluss 83 % statt 70 %, 90 s: 94 % statt 77 %; Thema etwas
   niedriger, ~48–50 % statt ~51–59 %). Im Browser 3+ Minuten trainieren. */
const P4_VOCAB = 1300;
const P4_TEMP = 0.6;
const P4_SUGGEST = ['Was frisst ein Hund?', 'Welche Planeten haben Ringe?', 'Wie lernt eine KI?', 'Was macht man in der Pause?', 'Wo arbeitet eine Tierärztin?'];
function deInt(n) { return n.toLocaleString('de-DE'); }
function valueColor(v, scale) {
  const t = Math.max(-1, Math.min(1, v / scale));
  return t >= 0
    ? 'color-mix(in srgb, var(--src-a) ' + Math.round(t * 100) + '%, var(--surface))'
    : 'color-mix(in srgb, var(--src-b) ' + Math.round(-t * 100) + '%, var(--surface))';
}
function renderSwatch(values, scale) {
  const row = el('div', 'swatchrow');
  /* 32 Zahlen je Wort → zwei Reihen à 16; 60 Neuronen → drei Reihen à 20. */
  row.style.setProperty('--cols', String(values.length === 32 ? 16 : Math.min(values.length, 20)));
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

Phases.register(4, {
  mount(host) {
    let data, net, genSession, lastForward, netView = null;
    let temp = P4_TEMP, qStrength = 1, training = false, trainRAF = null, lastUIRefresh = 0;
    let genPlaying = false, genTimer = null;
    let textEl, cursor, screen, genPlayBtn, bannerEl, placeholder, sayEl, focusHost;
    let phoneEl = null, Z = null;
    let askedEl, answerEl, metaEl, askBox, input, controls;
    let focus = null;   /* null = nächstes Wort, sonst Index in genSession.steps */
    let trainToggle, trainDot, trainLab;
    const slots = {};   /* Kontextlänge -> { data, net, genSession, version }: je ein Netz pro Fenster */
    let builtVersion = 0;
    let cardTrain = null;
    let ctxLen = 3;
    try { const v = Number(localStorage.getItem(P4_CTX_KEY)); if (P4_CTX.includes(v)) ctxLen = v; } catch (e) { /* ohne Speicher: 3 */ }
    function saveSlot() {
      if (data && net) slots[ctxLen] = { data, net, genSession, version: builtVersion };
    }
    const live = {};  /* train / net: Auffrisch-Funktionen, die nur Zahlen und Bilder ändern */
    const isPunct = w => w === '.' || w === ',';
    const fmtP = p => p >= 0.005 ? Math.round(p * 100) + ' %' : '<1 %';

    /* Eine Antwort-Sitzung; question = null, solange noch nicht gefragt ist. qwords: die Wörter der
       Frage (kind: off = Füllwort, known = kennt das Netz, unknown = zu selten, nicht im Vokabular). */
    function freshGenSession(question) {
      const startId = data.toId('.');
      const S = { ctxIds: Array(data.C).fill(startId), words: [], steps: [], sentences: 0, question: question || null, qwords: [], topicIds: [] };
      if (question) {
        /* Gezählt werden die Nomen der Frage (großgeschrieben, nicht das erste Wort); Wörter wie
           „macht“ oder „lange“ verwässern den Mittelpunkt. Ohne Nomen: alle Inhaltswörter. */
        const unk = data.toId(data.UNK);
        const toks = tokenize(question).filter(t => !t.punct);
        const isNoun = (t, i) => i > 0 && isContentTok(t) && /^[A-ZÄÖÜ]/.test(t.raw);
        const useNouns = toks.some(isNoun);
        const ids = new Set();
        toks.forEach((t, i) => {
          let kind = 'off';
          if (useNouns ? isNoun(t, i) : isContentTok(t)) { const id = data.toId(t.t); kind = id === unk ? 'unknown' : 'known'; if (id !== unk) ids.add(id); }
          S.qwords.push({ raw: t.raw, kind });
        });
        S.topicIds = [...ids];
      }
      return S;
    }
    const topic = () => genSession.topicIds;
    function topicLabel() { return genSession.topicIds.map(id => data.display(data.vocab[id])).join(' · '); }
    function fwd() { return forward(net, genSession.ctxIds, topic(), qStrength); }

    function wordLabel(w) {
      if (w === data.UNK) return '[unbekannt]';
      if (w === '.') return '(Satzende)';
      const x = data.display(w);   /* Schreibweise aus den Texten („KI“, nicht „Ki“) */
      return x.charAt(0).toUpperCase() + x.slice(1);
    }
    function tokLabel(w) { return w === data.UNK ? '…' : w === '.' ? '·' : w === ',' ? ',' : data.display(w); }

    /* Was die Spalten zeigen: das nächste Wort oder ein angetipptes (mit den Zahlen von damals). */
    function view() {
      if (focus != null && genSession.steps[focus]) {
        const st = genSession.steps[focus];
        return { idx: focus, ctxIds: st.ctxIds, logits: st.logits, h: st.h, chosen: st.id };
      }
      return { idx: null, ctxIds: genSession.ctxIds, logits: lastForward.logits, h: lastForward.h, chosen: null };
    }

    /* ---------------- Handy ---------------- */
    /* Bausteine wie in Phase 1, aber alle gleich gefärbt: das Netz weiß nicht mehr, aus welchem
       Text ein Wort stammt. Punkt und Komma sind eigene Bausteine (auch eigene Token des Netzes). */
    function updateGenText() {
      textEl.replaceChildren();
      const n = genSession.words.length;
      textEl.hidden = !genSession.question;
      let prev = '.';
      genSession.words.forEach((w, idx) => {
        let txt = tokLabel(w);
        if (!isPunct(w) && prev === '.') txt = txt.charAt(0).toUpperCase() + txt.slice(1);
        if (idx > 0) textEl.appendChild(document.createTextNode(' '));
        const span = el('span', 'tok' + (isPunct(w) ? ' punct' : ''), txt);
        span.dataset.i = String(idx);
        span.title = 'Antippen zum Zerlegen';
        if (idx === focus) span.classList.add('sel');
        textEl.appendChild(span);
        prev = w;
      });
      markWindow();
      cursor.classList.toggle('sel', focus == null && n > 0);
      textEl.appendChild(cursor);
      if (focus == null) screen.scrollTop = screen.scrollHeight;
    }

    /* Kontextfenster im Handy umranden — nur mit offenem Kontextfenster (Spalte embed): die letzten C Token vor dem „?“
       (beim angetippten Wort: die C Token davor). */
    function markWindow() {
      if (!Z.isOpen('embed')) return;
      const end = focus != null ? focus : genSession.words.length;
      for (let i = Math.max(0, end - data.C); i < end; i++) {
        const sp = textEl.querySelector('.tok[data-i="' + i + '"]');
        if (sp) sp.classList.add('win');
      }
    }

    function syncLayers() {
      if (!phoneEl) return;
      phoneEl.classList.toggle('show-ctx', Z.isOpen('embed'));
      phoneEl.classList.toggle('show-ask', Z.isOpen('frage'));
      phoneEl.classList.toggle('show-cand', Z.isOpen('cand'));
      updateGenText();
      lastSay = '';
      updateSay();
    }

    /* ---- Live-Auffrischen: nur Zahlen/Bilder, keine Bedienelemente ---- */
    function liveTick() {
      syncTrainUI();
      if (live.train && Z.isOpen('train')) live.train();
      paintBodies();
      if (live.net && Z.isOpen('net')) live.net();
    }

    /* Fehler als Mittel der letzten Messungen: ein einzelner Wert springt stark. */
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

    /* Hält den Trainings-Knopf in Form, OHNE ihn neu zu bauen. */
    function syncTrainUI() {
      if (trainToggle && trainToggle.isConnected) {
        trainLab.textContent = trainLabel();
        trainToggle.disabled = !data.pairs.length || net.diverged;
        trainToggle.classList.toggle('playing', training);
        trainDot.classList.toggle('on', training);
      }
      if (Z && Z.cols.train) Z.cols.train.el.classList.toggle('is-training', training);
      /* Untrainiert ist Training der Hauptknopf; danach wird „Vorhersagen“ zum Hauptknopf. */
      if (genPlayBtn) genPlayBtn.classList.toggle('primary', !!net.step);
      updateSay();
    }

    /* Tiny sagt in einem Satz, wie es um das Netz steht — nur Text, nichts wird neu gebaut.
       Wie in Phase 1: „ich sehe … am ehesten …“ ist schon Zerlegen und kommt erst mit offenen
       Kandidaten oder offenem Kontextfenster. */
    let lastSay = '';
    function updateSay() {
      if (!sayEl) return;
      const loss = curLoss();
      const L = loss == null ? '' : loss.toFixed(1).replace('.', ',');
      const peek = Z && (Z.isOpen('cand') || Z.isOpen('embed'));
      let parts;
      if (!data.pairs.length) parts = ['Ich habe keine Texte! Schalte oben rechts unter „Alle Quellen“ welche an.'];
      else if (net.diverged) parts = ['Huch, ich bin entgleist. Rechts bei „Training“ kannst du mich neu starten.'];
      else if (training) parts = ['Ich lerne … Mein Fehler: ', [L || '–'], '. Je kleiner, desto besser! Drück ruhig zwischendurch auf ▶.'];
      else if (!net.step) parts = ['Ich bin ein frisches Netz und weiß noch nichts. Drück rechts auf „', ['Training starten'], '“ – sonst rate ich nur!'];
      else if (!genSession.question) parts = loss > 3
        ? ['Ich habe erst ein bisschen gelernt (Fehler ', [L], '). Trainier mich ruhig länger – oder frag mich schon mal etwas.']
        : ['Fehler ', [L], ' – ich habe einiges gelernt! Frag mich etwas.'];
      else if (!genSession.words.length) parts = ['Drück auf ▶ – ich antworte Wort für Wort.'];
      else if (!peek) parts = [genPlaying ? 'Ich schreibe …' : 'Soll ich weiterschreiben? Rechts kannst du nachsehen, wie ich das mache.'];
      else if (focus != null) parts = ['Rechts siehst du, wie ich auf „', [wordLabel(data.vocab[genSession.steps[focus].id])], '“ gekommen bin.'];
      else {
        const probs = softmaxTemp(lastForward.logits, temp);
        let bi = 0;
        for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bi]) bi = i;
        const seen = genSession.ctxIds.map(id => data.vocab[id]).filter(w => !isPunct(w)).map(wordLabel).join(' ');
        const q = topicLabel();
        parts = seen
          ? ['Ich sehe „', [seen], '“' + (q ? ' und deine Frage' : '') + ' und rechne: am ehesten kommt „', [wordLabel(data.vocab[bi])], '“ (' + Math.round(probs[bi] * 100) + ' %).']
          : ['Neuer Satz' + (q ? ' zu deiner Frage' : '') + ' – am ehesten fange ich mit „', [wordLabel(data.vocab[bi])], '“ an.'];
      }
      const key = JSON.stringify(parts);
      if (key === lastSay) return;
      lastSay = key;
      sayEl.replaceChildren(...parts.map(x => Array.isArray(x) ? el('b', null, x[0]) : document.createTextNode(x)));
    }

    function doGenStep() {
      if (!genSession.question) return false;
      focus = null;
      lastForward = fwd();
      const probsT = softmaxTemp(lastForward.logits, temp);
      /* „[unbekannt]“ (alle seltenen Wörter zusammen) wird nie gezogen – echte Sprachmodelle geben so
         etwas auch nicht aus. Bei Temperatur 0,6 stand sonst oft „… …“ im Text (14.11.2026). */
      const unkId = data.toId(data.UNK), z = 1 - probsT[unkId];
      if (z > 1e-9) { probsT[unkId] = 0; for (let i = 0; i < probsT.length; i++) probsT[i] /= z; }
      let id;
      if (temp <= 0.001) {
        let bi = 0, bv = -1;
        for (let i = 0; i < probsT.length; i++) if (probsT[i] > bv) { bv = probsT[i]; bi = i; }
        id = bi;
      } else {
        let r = Math.random(), acc = 0; id = probsT.length - 1;
        for (let i = 0; i < probsT.length; i++) { acc += probsT[i]; if (r <= acc) { id = i; break; } }
      }
      /* Für das Zerlegen merken, was das Netz für genau dieses Wort gerechnet hat. */
      genSession.steps.push({ id, ctxIds: genSession.ctxIds.slice(), logits: Float32Array.from(lastForward.logits), h: Float32Array.from(lastForward.h) });
      genSession.ctxIds = genSession.ctxIds.slice(1).concat([id]);
      const word = data.vocab[id];
      genSession.words.push(word);
      if (word === '.') genSession.sentences++;
      lastForward = fwd();
      updateGenText();
      paintFocus();
      liveTick();
      return genSession.sentences < 3 && genSession.words.length < 60;
    }
    function startGenPlay() {
      if (genPlaying || !data.pairs.length || !genSession.question) return;
      genPlaying = true;
      genPlayBtn.textContent = '❚❚ Pause';
      genPlayBtn.classList.add('playing');
      updateSay();
      genTimer = setInterval(() => { if (!doGenStep()) stopGenPlay(); }, 500);
    }
    function stopGenPlay() {
      genPlaying = false;
      if (genPlayBtn) { genPlayBtn.textContent = '▶ Weiter'; genPlayBtn.classList.remove('playing'); }
      if (genTimer) { clearInterval(genTimer); genTimer = null; }
      updateSay();
    }

    function trainTick() {
      const { nanHit } = trainBudget(net, data.pairs, 8);
      if (nanHit) {
        training = false;
        trainRAF = null;
        renderTrainBody();
        syncTrainUI();
        return;
      }
      lastForward = fwd();
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
      if (live.train && Z && Z.isOpen('train')) live.train();
    }
    /* Fragen: neue Sitzung mit der Frage als Eingang, Chat zeigen, gleich losschreiben. */
    function ask(q) {
      q = (q || '').trim();
      if (!q || !data.pairs.length) return;
      stopGenPlay();
      focus = null;
      genSession = freshGenSession(q);
      saveSlot();
      lastForward = fwd();
      syncChat();
      updateGenText();
      paintFocus();
      liveTick();
      startGenPlay();
    }
    /* ↻ Nochmal: Chat leeren, wieder Vorschläge + Eingabefeld. */
    function resetGen() {
      stopGenPlay();
      focus = null;
      genSession = freshGenSession();
      saveSlot();
      lastForward = fwd();
      if (input) input.value = '';
      syncChat();
      updateGenText();
      paintFocus();
      liveTick();
    }
    /* Handy nach dem Stand der Sitzung: gefragt → Frage + Antwort + Knöpfe, sonst Vorschläge + Feld. */
    function syncChat() {
      if (!askedEl) return;
      const S = genSession, asked = !!S.question;
      placeholder.hidden = asked;
      askedEl.hidden = answerEl.hidden = !asked;
      askBox.hidden = asked;
      controls.hidden = !asked;
      askedEl.replaceChildren();
      metaEl.replaceChildren();
      if (!asked) return;
      S.qwords.forEach((w, i) => {
        if (i) askedEl.appendChild(document.createTextNode(' '));
        askedEl.appendChild(el('span', 'qw ' + w.kind, w.raw));
      });
      askedEl.appendChild(document.createTextNode('?'));
      metaEl.appendChild(S.topicIds.length
        ? el('span', 'chat-found', '⭐ Frage: ' + topicLabel())
        : el('span', 'chat-found none', 'Kein Wort der Frage kenne ich'));
      const unk = S.qwords.filter(w => w.kind === 'unknown').map(w => w.raw);
      if (unk.length) metaEl.appendChild(el('span', 'chat-keys', 'zu selten: ' + unk.join(', ')));
    }
    function reinitNet() {
      pauseTraining();
      net = createNet(data.vocab.length, data.C, { topic: true, d: P4_D, H: P4_H });
      const q = genSession.question;
      if (q) ask(q); else resetGen();
      stopGenPlay();
      renderTrainBody();
      syncTrainUI();
    }

    /* ---------------- Zerlegen: Spalten ---------------- */
    function empty(text) { return el('p', 'card-empty', text); }
    function noTexts(b) { b.appendChild(empty('Keine Texte an – schalte oben unter „Alle Quellen“ welche an.')); }

    /* ③ Kandidaten: für JEDES Wort, das das Netz kennt, ein Prozentwert. */
    function paintCand(v) {
      const b = Z.cols.cand.body;
      b.replaceChildren();
      if (!data.pairs.length) { noTexts(b); return; }
      b.appendChild(el('p', 'p1-line', !net.step
        ? 'Untrainiert: alle ' + deInt(data.vocab.length) + ' Wörter fast gleich wahrscheinlich.'
        : (v.idx == null ? 'Das Netz rechnet für alle ' + deInt(data.vocab.length) + ' Wörter einen Wert aus – ganz ohne Texte:' : 'Das rechnete das Netz damals aus:')));
      const probs = softmaxTemp(v.logits, temp);
      const arr = [];
      for (let i = 0; i < probs.length; i++) arr.push([i, probs[i]]);
      arr.sort((a, c) => c[1] - a[1]);
      const MAX = 8;
      const list = el('ol', 'clist');
      arr.slice(0, MAX).forEach(([i, p]) => {
        const li = el('li');
        const row = el('div', 'crow' + (i === v.chosen ? ' chosen' : ''));
        const bar = el('span', 'cbar');
        const fill = el('i');
        fill.style.width = Math.max(2, p * 100) + '%';
        bar.appendChild(fill);
        row.append(el('span', 'cword', wordLabel(data.vocab[i])), bar, el('span', 'cp', fmtP(p)), el('span', 'cn', ''));
        if (i === v.chosen) row.appendChild(el('span', 'ctag', '🎲 gezogen'));
        else if (data.vocab[i] === data.UNK) { row.appendChild(el('span', 'ctag', '⏭ wird übersprungen')); row.title = 'Sammelbecken für alle seltenen Wörter – Tiny zieht es nie'; }
        li.appendChild(row);
        list.appendChild(li);
      });
      b.appendChild(list);
      if (v.chosen != null && !arr.slice(0, MAX).some(x => x[0] === v.chosen)) {
        const k = arr.findIndex(x => x[0] === v.chosen);
        b.appendChild(el('p', 'p1-more', '🎲 gezogen: „' + wordLabel(data.vocab[v.chosen]) + '“ – erst auf Platz ' + (k + 1) + ' (' + fmtP(arr[k][1]) + ')'));
      }
      const rest = arr.slice(MAX).reduce((s, x) => s + x[1], 0);
      b.appendChild(el('p', 'p1-more', '… und ' + deInt(arr.length - MAX) + ' weitere Wörter mit zusammen ' + fmtP(rest)));
    }

    /* Welche Wörter die Frage über ihren direkten Weg (WQ) am stärksten nach oben schiebt — ohne
       Satzzeichen und <unk>, erst nach etwas Training (vorher Zufall). */
    function questionPush(k) {
      if (!net.T || !genSession.topicIds.length || !net.step || !qStrength) return [];
      const V = data.vocab.length, d = net.d, q = new Float64Array(d);
      genSession.topicIds.forEach(id => { for (let j = 0; j < d; j++) q[j] += net.embed[id * d + j] / genSession.topicIds.length; });
      const best = [];
      for (let v = 0; v < V; v++) {
        const w = data.vocab[v];
        if (isPunct(w) || w === data.UNK || STOP.has(w)) continue;
        let c = 0;
        for (let j = 0; j < d; j++) c += qStrength * net.WQ[j * V + v] * q[j];
        if (best.length < k || c > best[best.length - 1][1]) { best.push([v, c]); best.sort((a, e) => e[1] - a[1]); if (best.length > k) best.pop(); }
      }
      return best.filter(x => x[1] > 0).map(([v]) => wordLabel(data.vocab[v]));
    }

    /* ⭐ Frage (Sönke 14.11.2026: „die Frage-Input-Neuronen sind irgendwie mit nichts verbunden – haben die
       wirklich einen Einfluss?“): wie aus der Frage der Frage-Eingang wird und was er gerade bewirkt.
       ① Nomen → je d Zahlen · ② Mittelpunkt = ⭐ Frage-Eingang · ③ zwei Wege (in die Hidden-Schicht: im
       Training schwach geworden; Abkürzung = Skip-Verbindung zu den Wörtern: hier wirkt sie — wie die direkten
       Verbindungen bei Bengio 2003 und die Residual-Verbindungen in jedem Transformer, Sönke 14.11.2026) · ④ dieser Schritt mit und ohne
       Frage gerechnet. */
    function swatchRow(label, vals, cls) {
      const row = el('div', 'embrow' + (cls ? ' ' + cls : ''));
      row.append(el('span', 'embrow-w', label), renderSwatch(vals, 1.5));
      return row;
    }
    function paintFrage(v) {
      const b = Z.cols.frage.body;
      b.replaceChildren();
      if (!data.pairs.length) { noTexts(b); return; }
      const S = genSession;
      if (!S.question) { b.appendChild(el('p', 'p1-line', 'Noch keine Frage – dann bekommt das Netz hier ' + net.d + ' Nullen.')); return; }
      const d = net.d, C = net.C, V = data.vocab.length, H = net.H;
      const sub = (n, t) => { const p = el('p', 'p1-sub p4-fstep'); p.append(el('span', 'p4-fnum', n), document.createTextNode(t)); b.appendChild(p); };

      sub('1', 'Die Nomen der Frage werden zu Zahlen');
      const qt = el('div', 'gram p4-qtoks');
      S.qwords.forEach(w => qt.appendChild(el('span', 'gtok p4-q-' + w.kind, w.raw)));
      b.appendChild(qt);
      if (!S.topicIds.length) { b.appendChild(el('p', 'p1-line', 'Kein Nomen der Frage kennt das Netz – dann sind es ' + d + ' Nullen.')); return; }
      S.topicIds.forEach(id => { const vals = []; for (let j = 0; j < d; j++) vals.push(net.embed[id * d + j]); b.appendChild(swatchRow(wordLabel(data.vocab[id]), vals)); });

      sub('2', S.topicIds.length > 1 ? 'Ihr Mittelpunkt ist der Frage-Eingang' : 'Das ist der Frage-Eingang');
      const qv = new Float64Array(d);
      S.topicIds.forEach(id => { for (let j = 0; j < d; j++) qv[j] += net.embed[id * d + j] / S.topicIds.length; });
      b.appendChild(swatchRow('⭐ Frage', Array.from(qv), 'p4-qmean'));
      b.appendChild(el('p', 'mini-legend', d + ' Zahlen · bei JEDEM Wort dabei, egal wie lang die Antwort schon ist'));

      sub('3', 'Zwei Wege ins Netz');
      let sc = 0, sq = 0;
      for (let i = 0; i < C * d * H; i++) sc += Math.abs(net.W1[i]);
      for (let i = C * d * H; i < net.inDim * H; i++) sq += Math.abs(net.W1[i]);
      const ratio = (sq / (d * H)) / ((sc / (C * d * H)) || 1);
      const ways = el('div', 'p4-ways');
      const way = (icon, title, txt) => { const r = el('div', 'p4-way'); r.append(el('b', null, icon + ' ' + title), el('span', null, txt)); ways.appendChild(r); };
      way('↘', 'in die Hidden-Schicht', net.step
        ? 'Gewichte im Schnitt ' + (ratio < 1 ? ratio.toFixed(1).replace('.', ',') + '× so stark wie bei den Wörtern' : 'so stark wie bei den Wörtern') + (ratio < 0.5 ? ' – das Netz hat gelernt, sie hier kaum zu nutzen.' : '.')
        : 'noch untrainiert');
      const pushed = questionPush(4);
      way('↷', 'Abkürzung zu den Wörtern (Skip-Verbindung)', pushed.length ? 'schiebt hoch: ' + pushed.join(' · ') : (qStrength ? 'noch untrainiert' : 'aus (Frage-Stärke 0×)'));
      b.appendChild(ways);

      sub('4', v.idx == null ? 'Was ändert die Frage beim nächsten Wort?' : 'Was änderte die Frage bei „' + wordLabel(data.vocab[v.chosen]) + '“?');
      if (!net.step) { b.appendChild(el('p', 'p1-line', 'Erst trainieren – vorher ist alles Zufall.')); return; }
      const pNo = softmaxTemp(forward(net, v.ctxIds, null, 0).logits, temp);
      const pYes = softmaxTemp(forward(net, v.ctxIds, topic(), qStrength).logits, temp);
      const best = p => { let bi = 0; for (let i = 1; i < V; i++) if (p[i] > p[bi]) bi = i; return bi; };
      const cmp = el('div', 'p4-cmp');
      const col = (title, p) => { const c = el('div', 'p4-cmpcol'); c.appendChild(el('span', 'p4-cmph', title)); const i = best(p); c.appendChild(el('b', null, wordLabel(data.vocab[i]) + ' ' + fmtP(p[i]))); cmp.appendChild(c); };
      col('ohne Frage am ehesten', pNo);
      col('mit Frage am ehesten', pYes);
      b.appendChild(cmp);
      const diff = [];
      for (let i = 0; i < V; i++) { const w = data.vocab[i]; if (w === data.UNK) continue; diff.push([i, pYes[i] - pNo[i]]); }
      diff.sort((a, c) => c[1] - a[1]);
      const fmtD = x => (x > 0 ? '+' : '−') + Math.max(1, Math.round(Math.abs(x) * 100)) + ' %';
      const up = diff.filter(x => x[1] > 0.005).slice(0, 4), down = diff.filter(x => x[1] < -0.005).slice(-3).reverse();
      if (!up.length && !down.length) b.appendChild(el('p', 'p1-line', 'Hier ändert die Frage kaum etwas – die letzten Wörter entscheiden.'));
      else {
        const list = el('div', 'p4-delta');
        up.forEach(([i, x]) => list.appendChild(el('span', 'p4-up', wordLabel(data.vocab[i]) + ' ' + fmtD(x))));
        down.forEach(([i, x]) => list.appendChild(el('span', 'p4-down', wordLabel(data.vocab[i]) + ' ' + fmtD(x))));
        b.appendChild(list);
        b.appendChild(el('p', 'mini-legend', 'grün = durch die Frage wahrscheinlicher · rot = unwahrscheinlicher'));
      }
    }

    /* ① Embedding: worauf das Netz schaut und die Zahlen dieser Wörter. */
    function paintEmbed(v) {
      const b = Z.cols.embed.body;
      b.replaceChildren();
      if (!data.pairs.length) { noTexts(b); return; }
      const now = el('div', 'ctxnow');
      now.appendChild(el('p', 'p1-sub', v.idx == null ? 'Das Netz sieht jetzt' : 'Für „' + wordLabel(data.vocab[v.chosen]) + '“ sah das Netz'));
      const g = el('span', 'gram');
      let lead = true;
      v.ctxIds.forEach(id => {
        const w = data.vocab[id];
        if (lead && w === '.') { g.appendChild(el('span', 'gtok start', 'Satzanfang')); return; }
        lead = false;
        g.appendChild(el('span', 'gtok' + (isPunct(w) ? ' p' : ''), tokLabel(w)));
      });
      g.appendChild(el('span', 'gtok ' + (v.idx == null ? 'next' : 'chosen'), v.idx == null ? '?' : tokLabel(data.vocab[v.chosen])));
      now.appendChild(g);
      now.appendChild(el('p', 'p1-count', data.C + ' Token + ⭐ Frage → je ' + net.d + ' Zahlen = ' + net.inDim + ' Zahlen gehen ins Netz'));
      b.appendChild(now);
      b.appendChild(el('p', 'p1-sub', 'Die letzten Wörter'));
      const seen = new Set();
      v.ctxIds.forEach(id => {
        if (seen.has(id)) return;
        seen.add(id);
        const row = el('div', 'embrow');
        row.appendChild(el('span', 'embrow-w', wordLabel(data.vocab[id])));
        const vals = [];
        for (let j = 0; j < net.d; j++) vals.push(net.embed[id * net.d + j]);
        row.appendChild(renderSwatch(vals, 1.5));
        b.appendChild(row);
      });
      b.appendChild(el('p', 'mini-legend', 'je Wort ' + net.d + ' Zahlen · rot = plus · blau = minus' + (net.step ? '' : ' · noch Zufall')));
    }

    function paintBodies() {
      const v = view();
      if (Z.isOpen('cand')) paintCand(v); else Z.cols.cand.body.replaceChildren();
      if (Z.isOpen('embed')) paintEmbed(v); else Z.cols.embed.body.replaceChildren();
      if (Z.isOpen('frage')) paintFrage(v); else Z.cols.frage.body.replaceChildren();
      if (Z.isOpen('src')) paintSrc(); else Z.cols.src.body.replaceChildren();
    }
    /* Quellen: das Netz schreibt ohne Texte – die Quellen waren nur zum Training da. */
    function paintSrc() {
      Z.cols.src.body.replaceChildren(
        el('p', 'p1-line', 'Diese Texte werden gebraucht, um das neuronale Netz zu trainieren.'),
        el('p', 'p1-line', 'Das fertige Netz braucht die Quellen nicht mehr.'));
    }
    function paintFocus() {
      let hint = '';
      if (!genSession.words.length) hint = '';
      else if (!['cand', 'embed', 'frage'].some(Z.isOpen)) hint = 'Öffne rechts eine Spalte – dann siehst du auch im Handy, was dahintersteckt.';
      Zerlegen.focusBanner(focusHost, focus, focus != null ? wordLabel(data.vocab[genSession.steps[focus].id]) : '', () => setFocus(null), hint);
    }
    function setFocus(i) {
      stopGenPlay();
      focus = i;
      updateGenText();
      paintFocus();
      paintBodies();
      updateSay();
    }

    /* Wie viele Wörter sieht das Netz? Wechsel = anderes Netz (render baut alles neu). */
    function ctxPicker() {
      const ctxRow = el('div', 'ctxpick');
      ctxRow.dataset.spot = 'ctxlen';
      ctxRow.appendChild(el('span', 'ctxpick-lab', '👀 Das Netz sieht die letzten'));
      const ctxBtns = el('div', 'ctxpick-btns');
      ctxBtns.setAttribute('role', 'radiogroup');
      ctxBtns.setAttribute('aria-label', 'Wie viele Wörter sieht das Netz?');
      P4_CTX.forEach(c => {
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
          try { localStorage.setItem(P4_CTX_KEY, String(c)); } catch (e) { /* ohne Speicher geht es auch */ }
          render();
        });
        ctxBtns.appendChild(b);
      });
      ctxRow.append(ctxBtns, el('span', 'ctxpick-lab', 'Wörter'), Help.btn('kontextnetz', 'sm'));
      return ctxRow;
    }

    /* Training (breit, über den Spalten): der Knopf sitzt im festen Kopf, darunter nebeneinander
       Jedes Beispiel · So läuft es · Aufbau. Wird während des Trainings nie neu gebaut: live.train
       ändert nur Zahlen und die Linie, syncTrainUI nur Text und Klassen des Knopfs. */
    function buildTrainTools() {
      const t = Z.cols.train.tools;
      trainDot = el('i', 'net-live-dot');
      trainDot.setAttribute('aria-hidden', 'true');
      trainToggle = el('button', 'btn primary train-btn wide');
      trainToggle.type = 'button';
      trainToggle.dataset.spot = 'train';
      trainLab = el('span', null, trainLabel());
      trainToggle.append(trainDot, trainLab);
      trainToggle.addEventListener('click', () => { if (training) pauseTraining(); else startTraining(); });
      t.appendChild(trainToggle);
    }
    function renderTrainBody() {
      const b = Z.cols.train.body;
      b.replaceChildren();
      cardTrain = null;
      live.train = null;
      if (!data.pairs.length) { noTexts(b); return; }
      if (net.diverged) {
        b.appendChild(el('p', 'small net-warn', 'Das Training ist entgleist (Lernrate zu hoch).'));
        const rb = el('button', 'btn primary', 'Neu initialisieren');
        rb.type = 'button';
        rb.addEventListener('click', reinitNet);
        b.appendChild(rb);
        return;
      }
      const grid = el('div', 'p4-train');
      b.appendChild(grid);
      const sec = (title) => { const s = el('div', 'tsec'); s.appendChild(el('h4', 'tsec-h', title)); grid.appendChild(s); return s; };

      const what = sec('Jedes Beispiel');
      const strip = el('div', 'train-ctx');
      for (let c = 0; c < net.C; c++) strip.appendChild(el('span', 'ctxtok inwin', 'Wort'));
      strip.append(el('span', 'ctxtok p4-qtok', '⭐ Frage'), el('span', 'flow-arrow', '→'), el('span', 'ctxtok next', '?'));
      what.appendChild(strip);
      const whatLine = el('p', 'card-line');
      whatLine.append(el('b', null, net.C + ' Wörter'), document.createTextNode(' + eine Übungsfrage aus demselben Text → das nächste raten · '),
        el('b', null, deInt(data.pairs.length)), document.createTextNode(' Beispiele'));
      what.appendChild(whatLine);

      const how = sec('So läuft es');
      const facts = el('div', 'trainfacts');
      const fact = (k) => { const f = el('div', 'trainfact'); const v = el('b'); f.append(v, el('span', null, k)); facts.appendChild(f); return v; };
      const stepB = fact('Schritte');
      const lossB = fact('Fehler');
      const epochS = fact('× alle Beispiele');
      const lrB = fact('Schrittgröße');
      how.appendChild(facts);

      const line = sec('Fehlerlinie');
      line.querySelector('.tsec-h').appendChild(Help.btn('fehler', 'sm'));
      const sparkHost = el('div', 'spark-host');
      line.appendChild(sparkHost);

      const build = sec('Aufbau');
      const inDim = net.inDim;
      const paramCount = data.vocab.length * net.d + inDim * net.H + net.H + net.H * data.vocab.length + data.vocab.length + (net.WQ ? net.WQ.length : 0);
      const archRow = el('div', 'net-arch');
      const arch = el('span', 'arch-num', inDim + ' → ' + net.H + ' → ' + deInt(data.vocab.length));
      arch.title = inDim + ' Eingabe-Zahlen (' + net.C + ' Wörter + Frage, je ' + net.d + ') → ' + net.H + ' Hidden-Neuronen → ' + deInt(data.vocab.length) + ' Ausgabe-Neuronen (eins je Wort)';
      archRow.append(arch, el('span', 'arch-lab', 'Eingabe → Hidden → Wörter · Frage zusätzlich per Abkürzung → Wörter · ' + deInt(paramCount) + ' Zahlen'));
      build.appendChild(archRow);
      const resetBtn = el('button', 'btn sm', '↺ Netz zurücksetzen');
      resetBtn.type = 'button';
      resetBtn.title = 'Alles Gelernte vergessen';
      resetBtn.dataset.spot = 'netreset';
      resetBtn.addEventListener('click', reinitNet);
      build.appendChild(resetBtn);

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
    }

    function mountNet() {
      const b = Z.cols.net.body;
      b.replaceChildren();
      live.net = null;
      if (!Z.isOpen('net')) return;
      if (!data.pairs.length) { noTexts(b); return; }
      netView.mount(b);
      live.net = () => netView.update();
    }

    function buildPhone() {
      const P = Zerlegen.phone({ label: 'tiny · model · Phase 4', help: 'p4' });
      phoneEl = P.el;
      phoneEl.classList.add('phone-chat');
      screen = P.screen;

      bannerEl = el('div', 'net-banner');
      bannerEl.hidden = true;
      const nb = el('button', 'btn sm primary', 'Netz neu bauen');
      nb.type = 'button';
      nb.addEventListener('click', () => render(true));
      bannerEl.append(el('span', 'small', '📚 Neue Textauswahl.'), nb);
      phoneEl.insertBefore(bannerEl, screen);

      /* Chat wie in Phase 2/3: Begrüßung, dann Frage (rechts) und Antwort (Bausteine). */
      const chat = el('div', 'chat');
      placeholder = el('div', 'tiny-say');
      placeholder.append(tinyEl('normal'), el('p', 'tiny-bubble', 'Ich schlage nichts mehr nach – ich habe nur noch meine Zahlen. Deine Frage höre ich bei jedem Wort mit.'));
      askedEl = el('p', 'chat-q');
      answerEl = el('div', 'chat-a');
      const aBody = el('div', 'chat-a-body');
      metaEl = el('div', 'chat-meta');
      const bubble = el('div', 'paper chat-bubble');
      textEl = el('p', 'bot-text');
      cursor = el('span', 'cursor');
      cursor.title = 'Das nächste Wort – antippen zum Zerlegen';
      textEl.appendChild(cursor);
      bubble.appendChild(textEl);
      aBody.append(metaEl, bubble);
      answerEl.append(tinyEl('happy'), aBody);
      chat.append(placeholder, askedEl, answerEl);
      screen.appendChild(chat);
      textEl.addEventListener('pointerdown', ev => { if (ev.target.closest('.tok, .cursor')) stopGenPlay(); });
      textEl.addEventListener('click', ev => {
        const w = ev.target.closest('.tok');
        if (w) { const i = +w.dataset.i; setFocus(i === focus ? null : i); return; }
        if (ev.target.closest('.cursor')) setFocus(null);
      });


      const sayBox = el('div', 'phone-say');
      sayEl = el('p', 'tiny-bubble');
      lastSay = '';
      sayBox.append(tinyEl('think'), sayEl);

      controls = el('div', 'phone-controls');
      genPlayBtn = el('button', 'btn' + (net.step ? ' primary' : ''), '▶ Weiter');
      genPlayBtn.type = 'button';
      genPlayBtn.dataset.spot = 'gen';
      genPlayBtn.disabled = !data.pairs.length;
      genPlayBtn.addEventListener('click', () => { if (genPlaying) stopGenPlay(); else startGenPlay(); });
      const stepBtn = el('button', 'btn', '+1 Wort');
      stepBtn.type = 'button';
      stepBtn.dataset.spot = 'genstep';
      stepBtn.disabled = !data.pairs.length;
      stepBtn.addEventListener('click', () => { stopGenPlay(); doGenStep(); });
      const resetGenBtn = el('button', 'btn', '↻ Nochmal');
      resetGenBtn.type = 'button';
      resetGenBtn.title = 'Neue Frage';
      resetGenBtn.dataset.spot = 'genreset';
      resetGenBtn.addEventListener('click', resetGen);
      controls.append(genPlayBtn, stepBtn, resetGenBtn);

      askBox = el('div', 'phone-ask');
      const sugg = el('div', 'sugg');
      P4_SUGGEST.forEach(q => { const b = el('button', 'chip', q); b.type = 'button'; b.addEventListener('click', () => { input.value = q; ask(q); }); sugg.appendChild(b); });
      const form = el('form', 'qform');
      input = el('input', 'textin'); input.type = 'text'; input.placeholder = 'Frag Tiny etwas …'; input.setAttribute('aria-label', 'Frage');
      const send = el('button', 'btn primary qsend'); send.type = 'submit'; send.setAttribute('aria-label', 'Fragen');
      send.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      form.append(input, send);
      form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); input.blur(); });
      askBox.append(sugg, form);
      if (!data.pairs.length) { input.disabled = send.disabled = true; sugg.querySelectorAll('button').forEach(b => { b.disabled = true; }); }

      phoneEl.append(sayBox, controls, askBox);
      syncChat();
      return phoneEl;
    }

    function render(fresh) {
      pauseTraining();
      stopGenPlay();
      temp = P4_TEMP;
      focus = null;
      live.train = live.net = null;
      cardTrain = null;
      if (netView) { netView.destroy(); netView = null; }

      const texts = State.activeTexts();
      if (fresh === true) Object.keys(slots).forEach(k => delete slots[k]);
      const slot = slots[ctxLen];
      if (slot && slot.version === State.corpusVersion) {
        data = slot.data; net = slot.net; genSession = slot.genSession;
      } else {
        data = buildPhase4Data(texts, { vocabCap: P4_VOCAB, C: ctxLen });
        net = createNet(data.vocab.length, data.C, { topic: true, d: P4_D, H: P4_H });
        /* Andere Fenstergröße, gleiche Frage: das neue Netz bekommt sie auch. */
        genSession = freshGenSession(genSession && genSession.question);
      }
      builtVersion = State.corpusVersion;
      lastForward = fwd();
      saveSlot();

      netView = NetView.create({
        getNet: () => net,
        getData: () => data,
        getForward: () => lastForward,
        getProbs: () => softmaxTemp(lastForward.logits, temp),
        getCtxIds: () => genSession.ctxIds,
        getTopicLabel: topicLabel,
        wordLabel
      });

      Z = Zerlegen.columns({
        store: 'tinylm-p4-offen',
        defaults: { train: true },
        demoClosed: ['net'],
        onPointer: stopGenPlay,
        onChange: id => {
          if (id === 'net') { mountNet(); return; }
          if (id === 'train') { if (live.train && Z.isOpen('train')) live.train(); syncTrainUI(); return; }
          syncLayers();
          paintFocus();
          paintBodies();
        }
      });

      const root = el('div', 'p1');
      const grid = el('div', 'p1-grid');
      const left = el('div', 'p1-left');
      left.appendChild(buildPhone());
      if (!texts.length) left.appendChild(el('p', 'warnline', 'Keine Texte ausgewählt – schalte oben rechts unter „Alle Quellen“ welche an.'));

      const right = el('div', 'p1-right');
      const intro = el('div', 'p1-intro');
      focusHost = el('div', 'p1-focus');
      intro.appendChild(focusHost);
      right.appendChild(intro);

      right.appendChild(Z.column('train', 'train', '🏋️', 'Training', 'Erst lernen, dann vorhersagen', 'training', { wide: true }));
      const row = el('div', 'p1-cols');
      /* Reihenfolge wie Phase 2/3 (Sönke 14.11.2026): Frage · Kandidaten · Kontextfenster über Quellen. */
      const stack = el('div', 'p1-stack');
      stack.append(
        Z.column('embed', 'embed', '🔢', 'Kontextfenster', 'Was sieht das Netz?', 'embedding'),
        Z.column('src', 'origin', '📑', 'Quellen', 'Aus welchen Texten?', 'quellen4'));
      row.append(
        Z.column('frage', 'ask', '⭐', 'Frage', 'Was macht die Frage?', 'frage4'),
        Z.column('cand', 'candidates', '🎲', 'Kandidaten', 'Welches Wort kommt?', 'ausgabe'),
        stack);
      right.appendChild(row);
      right.appendChild(Z.column('net', 'net', '🕸️', 'Das Netz von innen', 'Alle Neuronen und Gewichte', 'netz', { wide: true }));

      /* Feste Köpfe (werden nie neu gebaut). */
      buildTrainTools();
      const tsl = Info.slider({
        label: 'Temperatur', min: 0, max: 2, step: 0.1, value: temp, spot: 'temp',
        fmt: de1, ends: ['🎯 sicher', 'wild 🌪️'],
        onInput: v => {
          temp = Math.round(v * 10) / 10;
          if (Z.isOpen('cand')) paintCand(view());
          if (live.net && Z.isOpen('net')) live.net();
          updateSay();
        }
      });
      Z.cols.cand.tools.appendChild(tsl.el);
      /* Frage-Stärke: wie stark die Frage die Wörter direkt nach oben schiebt (nur beim Antworten). */
      const qsl = Info.slider({
        label: '⭐ Frage-Stärke', min: 0, max: 3, step: 0.5, value: qStrength, spot: 'qstrength', help: 'fragestaerke',
        fmt: v => (Math.round(v * 10) / 10).toLocaleString('de-DE') + '×', ends: ['aus', 'nur noch Thema'],
        onInput: v => {
          qStrength = Math.round(v * 10) / 10;
          if (genSession) lastForward = fwd();
          paintBodies();
          if (live.net && Z.isOpen('net')) live.net();
          updateSay();
        }
      });
      Z.cols.frage.tools.appendChild(qsl.el);
      Z.cols.embed.tools.appendChild(ctxPicker());

      grid.append(left, right);
      root.appendChild(grid);
      host.replaceChildren(root);
      renderTrainBody();
      syncLayers();
      paintFocus();
      paintBodies();
      mountNet();
      syncTrainUI();
    }

    render(true);
    State.on('corpus-changed', () => {
      if (bannerEl && State.corpusVersion !== builtVersion) bannerEl.hidden = false;
    });

    return {
      reveal: id => { const c = Z.cols[id]; if (!c) return; if (!Z.isOpen(id)) Z.setOpen(id, true); c.el.scrollIntoView({ block: 'nearest' }); },
      onHide: () => { pauseTraining(); stopGenPlay(); }
    };
  }
});
