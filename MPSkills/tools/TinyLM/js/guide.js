/* Leitfaden: der rote Faden durch alle drei Phasen.
   Je Phase eine kurze Reihe Aufgaben ("Schieb das Kontextfenster auf 1 …"). Jede Aufgabe hakt sich
   von selbst ab, sobald man sie wirklich gemacht hat — die Phasen melden dafür, was passiert
   (Guide.did(typ, daten)), und jede Aufgabe prüft mit check(ev), ob das ihre war. Danach blitzt
   kurz ein "Aha" auf: der eine Satz, der hängen bleiben soll. Er ersetzt die langen Merksätze,
   die früher auf den Karten standen.

   "Zeig mir wo" klappt die passende Karte auf, scrollt hin und lässt die Stelle pulsieren
   (App.spotlight). Die Stellen tragen dafür data-spot="…" (Phasen-Code bzw. ?-Knöpfe: help-<key>).

   Ereignisse, die die Phasen melden:
     drawer                        Textwelten geöffnet (app.js)
     help        {key}             ein ?-Knopf angetippt (help.js)
     p1-word     {n, temp, run}    Phase 1 hat ein Wort geschrieben; run = Wörter seit der letzten
                                   Änderung an Kontext/Zufall oder seit Neustart
     p2-ask      {canned, unknown, repeat}
     p2-map                        ein Wort auf der Wortkarte gewählt
     p3-gen      {loss, run}       Phase 3 hat ein Wort vorhergesagt; loss = aktueller Fehler (null =
                                   untrainiert), run = Wörter seit "Von vorn"/Trainingsstart
     p3-loss     {loss}
     p3-neuron                     ein Neuron im Netz-Bild angetippt

   Fortschritt bleibt im localStorage (tinylm-leitfaden). */
const Guide = (() => {
  const STORE = 'tinylm-leitfaden';
  const LOSS_OK = 2.8;

  const STEPS = {
    1: [
      { id: '1-texte', icon: '📚', label: 'Futter ansehen', spot: 'textwelten',
        task: 'Öffne oben „Textwelten“: Aus diesen Texten lernt die KI.',
        aha: 'Die KI kennt nur diese Texte – sonst nichts.',
        check: e => e.type === 'drawer',
        nudge: { when: e => e.type === 'p1-word', text: 'Gleich! Schau dir zuerst oben die „Textwelten“ an.' } },
      { id: '1-schreiben', icon: '▶️', label: 'Schreiben lassen', spot: 'play',
        task: 'Drück „Schreiben starten“ und schau zu.',
        aha: 'Jede Farbe ist ein anderer Text. Die KI klebt Stücke zusammen.',
        check: e => e.type === 'p1-word' && e.run >= 6 },
      { id: '1-kontext', icon: '❓', label: 'Kontextfenster', spot: 'help-kontext', card: 'ctx',
        task: 'Was ist ein Kontextfenster? Tipp dort auf das ?.',
        aha: 'Die KI sieht immer nur die letzten paar Wörter.',
        check: e => e.type === 'help' && e.key === 'kontext' },
      { id: '1-n1', icon: '1️⃣', label: 'Kontext 1', spot: 'nslider', card: 'ctx',
        task: 'Schieb das Kontextfenster auf 1 und lass weiterschreiben.',
        aha: 'Mit nur 1 Wort Rückblick wird der Text wirr.',
        check: e => e.type === 'p1-word' && e.n === 1 && e.run >= 8 },
      { id: '1-n6', icon: '6️⃣', label: 'Kontext 6', spot: 'nslider', card: 'ctx',
        task: 'Jetzt das Gegenteil: Kontextfenster auf 6 und weiterschreiben.',
        aha: 'Mit 6 Wörtern Rückblick schreibt die KI ganze Sätze einfach ab.',
        check: e => e.type === 'p1-word' && e.n === 6 && e.run >= 8 },
      { id: '1-zufall', icon: '🎯', label: 'Zufall 0', spot: 'temp', card: 'cand',
        task: 'Dreh den Zufall auf 0 und lass weiterschreiben.',
        aha: 'Ohne Zufall nimmt die KI immer das häufigste Wort.',
        check: e => e.type === 'p1-word' && e.temp === 0 && e.run >= 6 }
    ],
    2: [
      { id: '2-frage', icon: '❓', label: 'Fragen', spot: 'ask',
        task: 'Stell eine Frage – oder tipp auf einen Vorschlag.',
        aha: 'Die Antwort ist aus Stücken von 3 Texten zusammengeklebt.',
        check: e => e.type === 'p2-ask' && !e.canned },
      { id: '2-quellen', icon: '📑', label: 'Quellen', spot: 'help-quellen', card: 'src',
        task: 'Woher kommt die Antwort? Tipp bei „Quellen“ auf das ?.',
        aha: 'Nur die 3 passendsten Texte dürfen mitreden.',
        check: e => e.type === 'help' && e.key === 'quellen' },
      { id: '2-unbekannt', icon: '🗼', label: 'Unbekanntes', spot: 'ask',
        task: 'Frag nach etwas, das in keinem Text steht – z. B. „Wie hoch ist der Eiffelturm?“',
        aha: 'Unbekannte Wörter überliest sie – und antwortet trotzdem irgendwas.',
        check: e => e.type === 'p2-ask' && e.unknown > 0 },
      { id: '2-nochmal', icon: '🔁', label: 'Nochmal', spot: 'reask', card: 'rand',
        task: 'Lass dieselbe Frage noch einmal beantworten.',
        aha: 'Andere Antwort! Die KI würfelt jedes Mal neu.',
        check: e => e.type === 'p2-ask' && e.repeat && !e.canned },
      { id: '2-karte', icon: '🗺️', label: 'Wortkarte', spot: 'map', card: 'map',
        task: 'Öffne unten die Wortkarte und tipp ein Wort an.',
        aha: 'Wörter mit ähnlichen Nachbarn liegen nah beieinander.',
        check: e => e.type === 'p2-map' }
    ],
    3: [
      { id: '3-roh', icon: '🥚', label: 'Untrainiert', spot: 'gen',
        task: 'Lass das noch untrainierte Netz ein paar Wörter vorhersagen.',
        aha: 'Ohne Training: reiner Wortsalat.',
        check: e => e.type === 'p3-gen' && (e.loss == null || e.loss > 5.5) && e.run >= 4,
        nudge: { when: e => e.type === 'p3-gen' && e.loss != null && e.loss <= 5.5,
                 text: 'Das Netz ist schon trainiert – erst „↺ Netz zurücksetzen“, dann vorhersagen.' } },
      { id: '3-training', icon: '🏋️', label: 'Trainieren', spot: 'train',
        task: 'Starte das Training und warte, bis der Fehler unter ' + String(LOSS_OK).replace('.', ',') + ' fällt.',
        aha: 'Der Fehler sinkt – das Netz lernt aus seinen Fehlern.',
        check: e => e.type === 'p3-loss' && e.loss < LOSS_OK },
      { id: '3-nachher', icon: '💬', label: 'Trainiert', spot: 'gen',
        task: 'Lass das trainierte Netz jetzt wieder vorhersagen.',
        aha: 'Schon besser als Wortsalat – dabei ist kein einziger Satz gespeichert, nur Zahlen.',
        check: e => e.type === 'p3-gen' && e.loss != null && e.loss < LOSS_OK + 0.4 && e.run >= 4 },   /* etwas Luft: nach dem Anhalten steht der Fehler knapp über der Schwelle */
      { id: '3-neuron', icon: '🕸️', label: 'Neuron', spot: 'net', card: 'net',
        task: 'Öffne das Netz-Bild und tipp ein Neuron an.',
        aha: 'Alles nur Zahlen – zehntausende davon.',
        check: e => e.type === 'p3-neuron' }
    ]
  };

  let done = load();
  let host = null, phase = 1, view = null, flash = null, flashTimer = null, nudge = null, nudgeTimer = null;

  const nudgedAt = {};
  function showNudge(text) {
    if (nudge === text) return;
    /* Ein Schubs ist eine Erinnerung, kein Dauerton: höchstens einmal pro Minute. */
    const now = Date.now();
    if (nudgedAt[text] && now - nudgedAt[text] < 60000) return;
    nudgedAt[text] = now;
    nudge = text;
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => { nudge = null; render(); }, 5000);
    render();
  }
  const listeners = [];

  function load() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return new Set(Array.isArray(v.done) ? v.done : []); }
    catch (e) { return new Set(); }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ done: [...done] })); } catch (e) { /* ohne Speicher geht es auch */ }
  }

  const steps = n => STEPS[n] || [];
  const firstOpen = n => steps(n).findIndex(s => !done.has(s.id));
  function progress(n) { const s = steps(n); return { done: s.filter(x => done.has(x.id)).length, total: s.length }; }
  function onChange(fn) { listeners.push(fn); }
  function changed() { listeners.forEach(fn => fn()); }

  function did(type, data) {
    const ev = Object.assign({ type }, data || {});
    /* Der Reihe nach: je Phase zählt nur die erste offene Aufgabe. Wer vorgreift, bekommt dafür
       keinen Haken — aber vielleicht einen Schubs (nudge), was zuerst dran ist. */
    let hit = null;
    [1, 2, 3].forEach(n => {
      const i = firstOpen(n);
      if (i < 0 || hit) return;
      const s = steps(n)[i];
      let ok = false;
      try { ok = !!s.check(ev); } catch (e) { ok = false; }
      if (ok) hit = { n, s };
      else if (n === phase && s.nudge && !flash) {
        let nd = false;
        try { nd = !!s.nudge.when(ev); } catch (e) { nd = false; }
        if (nd) showNudge(s.nudge.text);
      }
    });
    if (!hit) return;
    nudge = null;
    done.add(hit.s.id);
    save();
    if (hit.n === phase) {
      flash = hit.s;
      view = null;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { flash = null; render(); }, 6000);
    }
    render();
    changed();
  }

  function setPhase(n) {
    phase = n;
    view = null;
    flash = null;
    clearTimeout(flashTimer);
    render();
  }

  function reset() {
    done = new Set();
    save();
    view = null; flash = null;
    render();
    changed();
  }

  function summary(n) {
    const ul = el('ul', 'g-sum');
    steps(n).forEach(s => {
      const li = el('li', done.has(s.id) ? 'ok' : '');
      li.append(el('span', 'g-sum-ico', done.has(s.id) ? '✓' : '·'), el('span', null, s.aha));
      ul.appendChild(li);
    });
    return ul;
  }

  function render() {
    if (!host) return;
    host.replaceChildren();
    const list = steps(phase);
    const open = firstOpen(phase);
    const cur = view != null ? view : open;

    const lab = el('div', 'g-lab');
    lab.appendChild(el('span', 'g-lab-ico', '🧭'));
    lab.appendChild(el('b', null, 'Leitfaden'));
    lab.appendChild(Help.btn('leitfaden', 'sm'));
    host.appendChild(lab);

    const dots = el('ol', 'g-dots');
    list.forEach((s, i) => {
      const li = el('li');
      const b = el('button', 'g-dot' + (done.has(s.id) ? ' done' : '') + (i === cur && !flash ? ' cur' : ''));
      b.type = 'button';
      b.textContent = done.has(s.id) ? '✓' : String(i + 1);
      b.title = (i + 1) + '. ' + s.label + (done.has(s.id) ? ' — geschafft' : '');
      b.setAttribute('aria-label', b.title);
      if (i === cur) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => { flash = null; view = (open === i && view == null) ? null : i; render(); });
      li.appendChild(b);
      dots.appendChild(li);
    });
    host.appendChild(dots);

    const box = el('div', 'g-task');
    const acts = el('div', 'g-acts');

    if (flash) {
      box.classList.add('flash');
      box.append(el('span', 'g-ico', '✓'));
      const t = el('p', 'g-text');
      t.append(el('b', null, 'Geschafft! '), document.createTextNode('💡 ' + flash.aha));
      box.appendChild(t);
      const next = el('button', 'btn sm', open < 0 ? 'Fertig' : 'Weiter →');
      next.type = 'button';
      next.addEventListener('click', () => { flash = null; clearTimeout(flashTimer); render(); });
      acts.appendChild(next);
    } else if (nudge && view == null) {
      box.classList.add('nudge');
      box.append(el('span', 'g-ico', '👉'));
      box.appendChild(el('p', 'g-text', nudge));
    } else if (cur < 0) {
      box.classList.add('complete');
      box.append(el('span', 'g-ico', phase < 3 ? '🎉' : '🏁'));
      box.appendChild(el('p', 'g-text', phase < 3 ? 'Phase ' + phase + ' geschafft!' : 'Alle drei Phasen geschafft!'));
      const sumBtn = el('button', 'btn sm', 'Was hab ich gelernt?');
      sumBtn.type = 'button';
      sumBtn.addEventListener('click', () => Help.show({ title: 'Das hast du herausgefunden', icon: '💡', text: '', extra: summary(phase) }, sumBtn));
      acts.appendChild(sumBtn);
      if (phase < 3) {
        const go = el('button', 'btn sm primary', 'Weiter zu Phase ' + (phase + 1) + ' →');
        go.type = 'button';
        go.addEventListener('click', () => App.goPhase(phase + 1));
        acts.appendChild(go);
      } else {
        const again = el('button', 'btn sm', 'Leitfaden neu starten');
        again.type = 'button';
        again.addEventListener('click', reset);
        acts.appendChild(again);
      }
    } else {
      const s = list[cur];
      const isDone = done.has(s.id);
      if (isDone) box.classList.add('was');
      box.append(el('span', 'g-ico', isDone ? '✓' : s.icon));
      const t = el('p', 'g-text');
      t.appendChild(el('span', 'g-count', (cur + 1) + '/' + list.length));
      t.appendChild(document.createTextNode(isDone ? '💡 ' + s.aha : s.task));
      box.appendChild(t);
      if (!isDone) {
        const where = el('button', 'btn sm primary g-where', 'Zeig mir wo');
        where.type = 'button';
        where.addEventListener('click', () => App.spotlight(s.spot, s.card));
        acts.appendChild(where);
      } else if (view != null) {
        const back = el('button', 'btn sm', 'Zur Aufgabe');
        back.type = 'button';
        back.addEventListener('click', () => { view = null; render(); });
        acts.appendChild(back);
      }
    }
    box.appendChild(acts);
    host.appendChild(box);
  }

  function mount(el2) { host = el2; render(); }

  return { mount, did, setPhase, progress, onChange, reset, STEPS };
})();
