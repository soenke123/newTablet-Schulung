/* Tour je Phase (gebaut wie die Tour von Balance of Nature, tools/balance of nature/js/ui/tour.js):
   kleine Kästen direkt neben dem, was sie erklären. Der Rest der Seite ist abgedunkelt, das erklärte
   Stück ausgespart und umrandet. Wenig Text: ein Satz, was man hier sieht, dann Knopf-Nachbauten
   und was sie tun. Das Bild oben ist das Mini-Bild aus dem ?-Kärtchen derselben Karte (Help.vis),
   damit Tour und ? dieselbe Sprache sprechen.

   Jede Phase hat ihre eigene Tour. Sie startet von selbst, wenn man die Phase zum ersten Mal öffnet.
   Die Schritte zur Kopfzeile (Phasen, Textwelten, Teilen, ?) kommen nur in der ersten Tour.
   Jeder Schritt hat eine id; gesehene ids werden gemerkt, „Überspringen“ zählt wie gesehen.
   Das ? oben rechts zeigt die Tour der aktuellen Phase noch einmal ganz.

   Gemerkt wird bei der Lehrkraft (und allein geöffnet) im localStorage, bei der Klasse im
   sessionStorage: Ein Klassensatz-Tablet wechselt die Person. Im Schaufenster (?demo=1) gibt es
   keine Tour — dort spielt das Drehbuch. */
const Tour = (() => {
  const DEMO = /[?&]demo=1(&|$)/.test(location.search);
  const GAP = 14, EDGE = 8, PAD = 6;

  function role() { return typeof App !== 'undefined' ? App : {}; }
  function store() {
    try { return role().STUDENT ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }
  const KEY = () => 'tinylm-tour-' + (role().TEACHER ? 'lehrer' : role().STUDENT ? 'schueler' : 'allein');
  let seen = null;
  function loadSeen() {
    if (seen) return seen;
    try { seen = JSON.parse((store() && store().getItem(KEY())) || '{}') || {}; } catch (e) { seen = {}; }
    return seen;
  }
  function markSeen(list) {
    loadSeen();
    list.forEach(st => { seen[st.id] = 1; });
    try { store().setItem(KEY(), JSON.stringify(seen)); } catch (e) { /* ohne Speicher */ }
  }

  /* Knopf-Nachbau im Text */
  const k = t => '<span class="tour-k">' + t + '</span>';
  const SHARE_ICO = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="vertical-align:-2px;fill:currentColor;stroke:currentColor;stroke-width:1.8;stroke-linecap:round"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></svg>';
  const SHARE = SHARE_ICO;
  const SHARE_ON = '<span style="color:var(--accent)">' + SHARE_ICO + '</span>';
  const P = n => '.phase-pane[data-phase="' + n + '"] ';
  const q = sel => () => document.querySelector(sel);
  const qs = (...sels) => () => sels.map(s => document.querySelector(s)).filter(Boolean);
  const card = (n, id) => q(P(n) + '[data-card="' + id + '"]');

  /* ---------------------------------------------------------------- Schritte
     id, target() → Element oder Liste, card = Karte vorher aufklappen, help = Bild aus HELP[help],
     cat = Farbe (CAT), title, lead (ein Satz), items = [[Knopf, was er tut]], place = bevorzugte Seiten. */
  function shellStart() {
    const st = [
      { id: 'k-phasen', target: q('.phases'), place: ['bottom'],
        title: 'Drei Phasen',
        lead: 'Dreimal dieselben Texte – dreimal eine andere Art, daraus Sätze zu machen.',
        items: [[k('1'), 'Frei schreiben: zählt, welches Wort wie oft folgt'],
          [k('2'), 'Frage & Antwort: sucht erst passende Texte'],
          [k('3'), 'Echtes Netz: lernt Zahlen statt Texte']]
          .concat(role().STUDENT ? [[k('fehlt eine?'), 'die teilt deine Lehrkraft noch']] : []) },
      { id: 'k-texte', target: q('.corpus-btn'), place: ['bottom', 'left'],
        title: 'Textwelten',
        lead: 'Das Futter der KI. Sie kennt nur diese Texte – sonst nichts.',
        items: [[k('Haken'), 'Text füttert die KI oder nicht'],
          [k('✎ Bearbeiten'), 'Text ändern und zusehen, was passiert'],
          [k('Eigene'), 'eigenen Text dazuschreiben']] }
    ];
    if (role().TEACHER) st.push(
      { id: 'k-teilen', target: () => [...document.querySelectorAll('.phase-share')], place: ['bottom'],
        title: 'Mit der Klasse teilen',
        lead: 'Die Tablets der Klasse sehen nur die Phasen, die du teilst.',
        items: [[k(SHARE), 'neben dem Reiter: teilen, nochmal antippen: entziehen'],
          [k(SHARE_ON), 'gefüllt = die Klasse sieht diese Phase'],
          [k('du'), 'siehst immer alle drei']] });
    return st;
  }
  function shellEnd(n) {
    return [
      { id: 'k-hilfe', target: q(P(n) + '.panel-item .help-btn'), place: ['left', 'bottom'],
        title: 'Das ?',
        lead: 'An jeder Karte. Ein Tipp erklärt kurz, was sie zeigt.', items: [] },
      { id: 'k-tour', target: q('.tour-btn'), place: ['bottom', 'left'],
        title: 'Tour nochmal',
        lead: 'Zeigt diese Tour für die Phase, in der du gerade bist.', items: [] }
    ];
  }

  const PHASE = {
    1: () => [
      { id: '1-blatt', target: qs(P(1) + '.paper', P(1) + '.tiny-say', P(1) + '.machine-controls'), place: ['right', 'bottom'],
        title: 'Tiny schreibt',
        lead: 'Token für Token – jedes Wort ein Baustein. Die Farbe zeigt, aus welchem Text er stammt, umrandet ist das Kontextfenster.',
        items: [[k('▶ Schreiben starten'), 'schreibt von selbst, nochmal: Pause'],
          [k('+1 Wort'), 'genau ein Wort'],
          [k('↺ Neu starten'), 'leeres Blatt']] },
      { id: '1-kontext', target: card(1, 'ctx'), card: 'ctx', help: 'kontext', cat: 'context',
        title: '① Kontextfenster',
        lead: 'So viele der letzten Wörter schaut die KI an.',
        items: [[k('Regler'), '1 Wort: wirr · 6 Wörter: ganze Sätze abgeschrieben']] },
      { id: '1-quellen', target: card(1, 'origin'), card: 'origin', help: 'herkunft', cat: 'origin',
        title: '② Quellen',
        lead: 'Aus welchen Texten die geschriebenen Wörter stammen.',
        items: [[k('Balken'), 'wie viele Wörter aus diesem Text kamen']] },
      { id: '1-kandidaten', target: card(1, 'cand'), card: 'cand', help: 'kandidaten', cat: 'candidates',
        title: '③ Kandidaten',
        lead: 'Welche Wörter in deinen Texten nach dem Kontextfenster kamen – und wie oft.',
        items: [[k('%'), 'je länger der Balken, desto eher kommt das Wort']] },
      { id: '1-zufall', target: card(1, 'rand'), card: 'rand', help: 'zufall', cat: 'random',
        title: '④ Zufall',
        lead: 'Die KI würfelt unter den Kandidaten.',
        items: [[k('sicher'), 'immer das häufigste Wort'],
          [k('wild'), 'auch seltene Wörter haben eine Chance']] }
    ],
    2: () => [
      { id: '2-frage', target: qs(P(2) + '.qform', P(2) + '.sugg'), place: ['right', 'bottom'],
        title: 'Frag Tiny',
        lead: 'Tipp unten eine Frage ein – oder einen der Vorschläge an.',
        items: [[k('↑'), 'Tiny sucht passende Texte und antwortet']] },
      { id: '2-antwort', target: q(P(2) + '.chat'), place: ['right', 'bottom'],
        title: 'Der Chat',
        lead: 'Tinys Antwort ist aus Stücken von 3 Texten geklebt – jede Farbe ein Text.',
        items: [[k('▶ Weiter'), 'schreibt weiter, nochmal: Pause'],
          [k('↻ Dieselbe Frage nochmal'), 'gleiche Frage, neu gewürfelt']] },
      { id: '2-zerlegen', target: card(2, 'lookup'), card: 'lookup', help: 'nachschlagen', cat: 'ask',
        title: '① Frage zerlegen',
        lead: 'Welche Wörter der Frage die KI aus ihren Texten kennt. Nur die zählen.', items: [] },
      { id: '2-quellen', target: card(2, 'src'), card: 'src', help: 'quellen', cat: 'origin',
        title: '② Quellen',
        lead: 'Die 3 Texte, die am besten zur Frage passen.', items: [] },
      { id: '2-kandidaten', target: card(2, 'word'), card: 'word', help: 'wortfuerwort', cat: 'candidates',
        title: '③ Kandidaten',
        lead: 'Wie in Phase 1 – nur aus diesen 3 Texten.', items: [] },
      { id: '2-zufall', target: card(2, 'rand'), card: 'rand', help: 'zufall', cat: 'random',
        title: '④ Zufall',
        lead: 'Die KI würfelt unter den Kandidaten.',
        items: [[k('Temperatur'), 'sicher oder wild'],
          [k('🔁 Dieselbe Frage nochmal'), 'gleiche Frage, neu gewürfelt']] },
      { id: '2-karte', target: q(P(2) + '[data-card="map"] .panel-item-head'), help: 'wortkarte', cat: 'meaning', place: ['top', 'bottom'],
        title: 'Wortkarte',
        lead: 'Zum Aufklappen: Wörter, die ähnlich benutzt werden, liegen nah beieinander.', items: [] }
    ],
    3: () => [
      { id: '3-training', target: card(3, 'train'), card: 'train', help: 'training', cat: 'train', place: ['left', 'top'],
        title: 'Training',
        lead: 'Erst lernen, dann schreiben. Untrainiert rät das Netz nur.',
        items: [[k('▶ Training starten'), 'lernt aus deinen Texten, nochmal: Pause'],
          [k('Fehlerlinie'), 'sinkt, wenn das Netz besser rät'],
          [k('↺ Netz zurücksetzen'), 'alles vergessen'],
          [k('Netz-Bild'), 'alle Neuronen und Gewichte']] },
      { id: '3-blatt', target: qs(P(3) + '.paper', P(3) + '.machine-controls'), place: ['right', 'bottom'],
        title: 'Das Netz schreibt',
        lead: 'Ohne einen einzigen Text – nur mit Zahlen, die es gelernt hat.',
        items: [[k('▶ Vorhersagen'), 'schreibt von selbst, nochmal: Pause'],
          [k('+1 Wort'), 'genau ein Wort'],
          [k('↺ Von vorn'), 'leeres Blatt, das Netz bleibt']] },
      { id: '3-fenster', target: q(P(3) + '[data-spot="ctxlen"]'), help: 'kontextnetz', cat: 'context', place: ['right', 'bottom'],
        title: 'Kontextfenster',
        lead: 'Wie viele Wörter das Netz sieht. Jedes Fenster ist ein eigenes Netz.',
        items: [[k('3') + ' ' + k('4') + ' ' + k('5'), 'umschalten, trainierte Netze bleiben'],
          [k('✓'), 'schon trainiert']] },
      { id: '3-embedding', target: card(3, 'embed'), card: 'embed', help: 'embedding', cat: 'embed',
        title: '① Embedding',
        lead: 'Jedes Wort wird zu 16 Zahlen. Rot = plus, blau = minus.', items: [] },
      { id: '3-hidden', target: card(3, 'hidden'), card: 'hidden', help: 'hidden', cat: 'hidden',
        title: '② Hidden-Schicht',
        lead: 'Das Netz mischt die Zahlen zu 40 neuen. Was eine davon bedeutet, weiß niemand.', items: [] },
      { id: '3-kandidaten', target: card(3, 'output'), card: 'output', help: 'ausgabe', cat: 'candidates',
        title: '③ Kandidaten',
        lead: 'Prozente für jedes Wort – vor dem Training fast alle gleich.', items: [] },
      { id: '3-zufall', target: card(3, 'rand'), card: 'rand', help: 'zufall', cat: 'random',
        title: '④ Zufall',
        lead: 'Wie in Phase 1 und 2: gewürfelt wird zum Schluss.', items: [] },
      { id: '3-innen', target: q(P(3) + '[data-card="net"] .panel-item-head'), help: 'netz', cat: 'net', place: ['top', 'bottom'],
        title: 'Das Netz von innen',
        lead: 'Zum Aufklappen: jede Linie ist ein echtes Gewicht des Netzes.', items: [] }
    ]
  };

  function stepsFor(n) { return shellStart().concat(PHASE[n](), shellEnd(n)); }

  /* ---------------------------------------------------------------- Oberfläche */
  let shield, spot, pop;
  function build() {
    if (pop) return;
    shield = el('div', 'tour-shield');
    spot = el('div', 'tour-spot');
    pop = el('div', 'tour-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-live', 'polite');
    shield.hidden = spot.hidden = pop.hidden = true;
    document.body.append(shield, spot, pop);
    pop.addEventListener('click', e => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      const t = b.dataset.t;
      if (t === 'skip') stop(true);
      else if (t === 'back') show(Math.max(0, at - 1));
      else if (at < steps.length - 1) show(at + 1);
      else stop(true);
    });
    window.addEventListener('keydown', e => {
      if (!steps.length) return;
      if (e.key === 'Escape') stop(true);
      else if (e.key === 'ArrowRight') { if (at < steps.length - 1) show(at + 1); }
      else if (e.key === 'ArrowLeft') { if (at > 0) show(at - 1); }
      else if (e.key === 'Tab' || e.key === 'Enter' || (e.key === ' ' && pop.contains(e.target))) return;
      e.stopImmediatePropagation();
      if (e.key !== 'Tab') e.preventDefault();
    }, true);
    window.addEventListener('resize', () => { if (steps.length) place(); });
    window.addEventListener('scroll', () => { if (steps.length) place(); }, { passive: true });
  }

  let steps = [], at = 0, timer = 0, watch = 0;

  function targets(st) {
    const t = st.target && st.target();
    if (!t) return [];
    return (Array.isArray(t) ? t : [t]).filter(x => x && x.getClientRects().length > 0);
  }

  /* Ohne scrollIntoView: das scrollte auch die MPSkills-Seite um den Rahmen herum. */
  function reveal(els) {
    const r = union(els);
    const headH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 0;
    const room = window.innerHeight - headH;
    const h = r.bottom - r.top;
    if (r.top >= headH + 8 && r.bottom <= window.innerHeight - 8) return;
    const y = window.scrollY + r.top - headH - Math.max(12, (room - h) / 2);
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  }

  function union(els) {
    let r = null;
    els.forEach(x => {
      const b = x.getBoundingClientRect();
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
            : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return r;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function place() {
    const st = steps[at];
    if (!st) return;
    const els = targets(st);
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    if (!els.length) {
      spot.hidden = true;
      pop.dataset.side = 'none';
      pop.style.left = Math.round((vw - w) / 2) + 'px';
      pop.style.top = Math.round((vh - h) / 2) + 'px';
      return;
    }
    let r = union(els);
    r = { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD };
    const s = { left: Math.max(r.left, 2), top: Math.max(r.top, 2), right: Math.min(r.right, vw - 2), bottom: Math.min(r.bottom, vh - 2) };
    spot.hidden = false;
    spot.style.left = s.left + 'px';
    spot.style.top = s.top + 'px';
    spot.style.width = Math.max(0, s.right - s.left) + 'px';
    spot.style.height = Math.max(0, s.bottom - s.top) + 'px';

    const cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
    const fits = {
      left: s.left - GAP - w >= EDGE,
      right: s.right + GAP + w <= vw - EDGE,
      bottom: s.bottom + GAP + h <= vh - EDGE,
      top: s.top - GAP - h >= EDGE
    };
    const order = (st.place || []).concat(['left', 'right', 'bottom', 'top']);
    let side = order.find(o => fits[o]) || null;
    /* Passt nirgends (Handy, hohe Karte): unten am Bildschirm über die Karte legen. */
    let x, y;
    if (!side) {
      side = 'none';
      x = clamp((vw - w) / 2, EDGE, vw - w - EDGE);
      y = vh - h - EDGE;
    } else if (side === 'left' || side === 'right') {
      x = side === 'left' ? s.left - GAP - w : s.right + GAP;
      y = clamp(cy - h / 2, EDGE, vh - h - EDGE);
      pop.style.setProperty('--arrow', clamp(cy - y, 18, h - 18) + 'px');
    } else {
      x = clamp(cx - w / 2, EDGE, vw - w - EDGE);
      y = side === 'bottom' ? s.bottom + GAP : s.top - GAP - h;
      y = clamp(y, EDGE, vh - h - EDGE);
      pop.style.setProperty('--arrow', clamp(cx - x, 18, w - 18) + 'px');
    }
    pop.dataset.side = side;
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';
  }

  function show(i) {
    at = i;
    const st = steps[at];
    if (st.card) App.revealCard(st.card);
    const last = at === steps.length - 1;
    const c = st.cat && typeof CAT !== 'undefined' && CAT[st.cat];
    [pop, spot].forEach(x => x.style.setProperty('--tc', c ? c.color : 'var(--accent)'));
    pop.style.setProperty('--tt', c ? c.tint : 'var(--accent-dim)');
    pop.replaceChildren();
    const h = st.help && typeof HELP !== 'undefined' && HELP[st.help];
    if (h && h.vis) {
      const pic = el('div', 'tour-pic');
      pic.appendChild(Help.vis(h.vis, h.cat));
      pop.appendChild(pic);
    }
    pop.appendChild(el('h3', null, st.title));
    pop.appendChild(el('p', 'tour-lead', st.lead));
    if (st.items && st.items.length) {
      const ul = el('ul', 'tour-items');
      st.items.forEach(it => {
        const li = el('li');
        const b = el('span', 'tour-btns');
        b.innerHTML = it[0];               /* nur eigene, feste Knopf-Nachbauten */
        li.append(b, el('span', null, it[1]));
        ul.appendChild(li);
      });
      pop.appendChild(ul);
    }
    const foot = el('div', 'tour-foot');
    if (steps.length > 1) {
      const cnt = el('span', 'tour-count', (at + 1) + ' / ' + steps.length);
      cnt.setAttribute('aria-label', 'Schritt ' + (at + 1) + ' von ' + steps.length);
      foot.appendChild(cnt);
    }
    foot.appendChild(el('span', 'spacer'));
    const btn = (t, cls, label) => { const b = el('button', cls, label); b.type = 'button'; b.dataset.t = t; foot.appendChild(b); return b; };
    if (!last) btn('skip', 'tour-skip', 'Überspringen');
    if (at > 0) btn('back', 'tour-back', '‹').setAttribute('aria-label', 'Zurück');
    const next = btn('next', 'primary', last ? 'Fertig' : 'Weiter ›');
    pop.appendChild(foot);
    pop.hidden = false;
    shield.hidden = false;
    /* Aufgeklappte Karte erst messen, wenn sie gezeichnet ist. */
    requestAnimationFrame(() => {
      const els = targets(st);
      if (els.length) reveal(els);
      place();
    });
    place();
    next.focus({ preventScroll: true });
  }

  function run(list, all) {
    stop(false);
    if (DEMO) return;
    build();
    const todo = all ? list : list.filter(st => !loadSeen()[st.id]);
    if (!todo.length) return;
    steps = todo;
    show(0);
    watch = setInterval(place, 400);     /* Karten wachsen, Text kommt dazu … */
  }

  function stop(done) {
    clearTimeout(timer);
    clearInterval(watch);
    if (done && steps.length) markSeen(steps);
    steps = [];
    if (pop) pop.hidden = shield.hidden = spot.hidden = true;
  }

  /* Phase geöffnet: nur Schritte, die noch fehlen. */
  function forPhase(n) {
    clearTimeout(timer);
    if (DEMO) return;
    timer = setTimeout(() => { if (role().activePhase === n) run(stepsFor(n), false); }, 450);
  }
  /* Das ? oben: die Tour dieser Phase noch einmal ganz. */
  function replay(n) { run(stepsFor(n), true); }

  return { forPhase, replay, stop, reset: () => { seen = {}; markSeen([]); } };
})();
