/* ?-Hilfen: statt langer Erklärtexte auf den Karten ein kleiner runder ?-Knopf.
   Ein Tipp öffnet ein Kärtchen mit Symbol, Titel, höchstens zwei kurzen Sätzen und einem
   Mini-Bild, das dasselbe noch einmal ohne Worte zeigt. Immer nur eins offen; schließt bei
   Tipp daneben, Esc oder ×. Auf schmalen Geräten kommt es als Blatt von unten.

   Help.btn(key)          -> <button class="help-btn">?</button>, öffnet HELP[key]
   Help.open(key, anchor) -> öffnet direkt (z. B. aus dem Leitfaden)
   Help.show(entry, anchor) -> wie open, aber mit einem Eintrag, der nicht in HELP steht
   Help.close()

   Ein HELP-Eintrag: { title, icon, text, cat, vis }
     cat  = Kategoriefarbe (origin/context/candidates/random/meaning/net), sonst Akzent
     vis  = Mini-Bild, eins von:
       { type: 'tokens', items: [[wort, art]] }  art: '' | 'dim' | 'win' | 'next' | 's0'…'s2'
       { type: 'bars',   items: [[wort, prozent]] }
       { type: 'cycle',  items: [[symbol, wort]], loop: true }
       { type: 'scale',  items: [[symbol, wert, wort]] }
       { type: 'swatch', label, values: [..] }
       { type: 'line' } | { type: 'abc' } | { type: 'dots' } | { type: 'net' }
   Jeder Tipp auf ? meldet sich beim Leitfaden (Guide.did('help', {key})). */
const HELP = {
  leitfaden: {
    title: 'Der Leitfaden', icon: '🧭',
    text: 'Erledige die Aufgaben der Reihe nach. „Zeig mir wo“ zeigt dir die Stelle, ein Haken heißt: geschafft.',
    vis: { type: 'cycle', items: [['👆', 'machen'], ['✅', 'Haken'], ['💡', 'Aha!']] }
  },
  textwelten: {
    title: 'Textwelten', icon: '📚',
    text: 'Das ist das Futter der KI. Was in keinem Text steht, kann sie auch nicht sagen.',
    vis: { type: 'cycle', items: [['📚', 'Texte'], ['🤖', 'KI'], ['💬', 'neuer Text']] }
  },

  /* ---- Phase 1 ---- */
  p1: {
    title: 'Frei schreiben', icon: '✍️',
    text: 'Die KI hängt immer ein Wort an, das in deinen Texten oft danach kam. Ohne Plan und ohne Sinn.',
    vis: { type: 'tokens', items: [['Der', ''], ['Hund', ''], ['frisst', ''], ['?', 'next']] }
  },
  ablauf: {
    title: 'Der Ablauf', icon: '🔁',
    text: 'Diese Schritte laufen für jedes einzelne Wort neu – immer und immer wieder.',
    vis: { type: 'cycle', items: [['👀', 'schauen'], ['🔎', 'suchen'], ['🎲', 'würfeln'], ['➕', 'anhängen']], loop: true }
  },
  kontext: {
    title: 'Kontextfenster', icon: '👀', cat: 'context',
    text: 'Die KI schaut nur auf die letzten paar Wörter. Alles davor hat sie schon vergessen.',
    vis: { type: 'tokens', items: [['Gestern', 'dim'], ['ging', 'dim'], ['der', 'dim'], ['Hund', 'win'], ['schnell', 'win'], ['?', 'next']] }
  },
  kandidaten: {
    title: 'Kandidaten', icon: '🎲', cat: 'candidates',
    text: 'Was stand in deinen Texten hinter diesen Wörtern? Je öfter, desto länger der Balken – und desto eher wird es gewürfelt.',
    vis: { type: 'bars', items: [['Futter', 55], ['Fleisch', 30], ['Gras', 15]] }
  },
  zufall: {
    title: 'Zufall (Temperatur)', icon: '🌡️', cat: 'random',
    text: 'Wie mutig würfelt die KI? Bei 0 nimmt sie immer den längsten Balken, bei 2 hat auch Seltenes eine Chance.',
    vis: { type: 'scale', items: [['🎯', '0', 'sicher'], ['🎲', '1', 'normal'], ['🌪️', '2', 'wild']] }
  },
  herkunft: {
    title: 'Herkunft', icon: '🧩', cat: 'origin',
    text: 'Kein Wort ist erfunden. Jedes stammt aus einem deiner Texte – die Farbe zeigt, aus welchem.',
    vis: { type: 'tokens', items: [['Der', 's0'], ['Hund', 's0'], ['frisst', 's1'], ['Fisch', 's1'], ['im', 's2'], ['Meer', 's2']] }
  },

  /* ---- Phase 2 ---- */
  p2: {
    title: 'Frage & Antwort', icon: '💬',
    text: 'Die KI sucht 3 passende Texte und baut daraus Wort für Wort eine Antwort. Die Frage verstehen tut sie nicht.',
    vis: { type: 'cycle', items: [['❓', 'Frage'], ['🔎', 'suchen'], ['📑', '3 Texte'], ['💬', 'Antwort']] }
  },
  nachschlagen: {
    title: 'Nachschlagen', icon: '🔎', cat: 'context',
    text: 'Füllwörter fliegen raus. Der Rest wird auf die Grundform gekürzt und in den Texten gesucht.',
    vis: { type: 'tokens', items: [['Was', 'dim'], ['frisst', 'win'], ['ein', 'dim'], ['Welpe', 'win'], ['?', 'dim']] }
  },
  quellen: {
    title: 'Quellen A · B · C', icon: '📑', cat: 'origin',
    text: 'Die 3 Texte, die am besten zu deiner Frage passen. Nur aus ihnen wird die Antwort gebaut.',
    vis: { type: 'abc' }
  },
  wortfuerwort: {
    title: 'Wort für Wort', icon: '✏️', cat: 'candidates',
    text: 'Immer nur ein Wort: Kandidaten sammeln, würfeln, anhängen – und wieder von vorn.',
    vis: { type: 'bars', items: [['Napf', 60], ['Park', 25], ['Wasser', 15]] }
  },
  wortkarte: {
    title: 'Wortkarte', icon: '🗺️', cat: 'meaning',
    text: 'Wörter mit ähnlichen Nachbarn landen nah beieinander, Filter und Wortwelten lassen eine Gruppe leuchten. Paar-Pfeile wie spielt → spielte zeigen hier kreuz und quer – ob sie in dieselbe Richtung gehen, zeigt „Pfeile nebeneinander“.',
    vis: { type: 'dots' }
  },

  /* ---- Phase 3 ---- */
  p3: {
    title: 'Echtes Netz', icon: '🧠',
    text: 'Hier wird nichts nachgeschlagen. Das Netz merkt sich beim Training nur Zahlen – die Texte selbst sind danach weg.',
    vis: { type: 'cycle', items: [['📚', 'Texte'], ['🔢', 'Zahlen'], ['🧠', 'Netz'], ['💬', 'Wort']] }
  },
  embedding: {
    title: 'Embedding', icon: '🔢', cat: 'origin',
    text: 'Für das Netz ist jedes Wort nur eine Reihe Zahlen. Rot heißt plus, blau heißt minus.',
    vis: { type: 'swatch', label: 'Hund', values: [0.9, -0.4, 0.2, -0.9, 0.6, 0.1, -0.2, 0.8, -0.6, 0.3, 0, -0.8] }
  },
  hidden: {
    title: 'Hidden-Schicht', icon: '📦', cat: 'context',
    text: 'Hier werden die Zahlen aller Wörter gemischt. Keine einzelne Zahl bedeutet etwas – nur alle zusammen.',
    vis: { type: 'swatch', label: '?', values: [0.3, -0.7, 0.9, 0.1, -0.2, 0.5, -0.9, 0.4, 0.7, -0.3, 0.2, -0.5] }
  },
  ausgabe: {
    title: 'Ausgabe', icon: '📊', cat: 'candidates',
    text: 'Am Ende bekommt jedes Wort einen Prozentwert. Daraus wird gewürfelt – genau wie in Phase 1.',
    vis: { type: 'bars', items: [['Hund', 48], ['Katze', 31], ['Napf', 21]] }
  },
  kontextnetz: {
    title: 'Wie weit schaut das Netz zurück?', icon: '👀', cat: 'context',
    text: 'Mehr Wörter im Blick = geradere Sätze. Aber das Netz muss neu lernen und schreibt die Texte eher wörtlich ab.',
    vis: { type: 'tokens', items: [['Der', 'dim'], ['kleine', 'win'], ['Hund', 'win'], ['frisst', 'win'], ['?', 'next']] }
  },
  training: {
    title: 'Training', icon: '🏋️', cat: 'random',
    text: 'Raten, mit dem echten Wort vergleichen, alle Zahlen ein Stück korrigieren. Erst grob, dann immer feiner – tausende Male.',
    vis: { type: 'cycle', items: [['🤔', 'raten'], ['✅', 'vergleichen'], ['🔧', 'korrigieren']], loop: true }
  },
  fehler: {
    title: 'Fehlerlinie', icon: '📉', cat: 'random',
    text: 'Wie sehr lag das Netz daneben? Fällt die Linie, dann lernt es.',
    vis: { type: 'line' }
  },
  netz: {
    title: 'Das Netz von innen', icon: '🕸️', cat: 'net',
    text: 'Punkte sind Neuronen, Linien sind Gewichte. Rot schiebt an, blau bremst. Tipp ein Neuron an!',
    vis: { type: 'net' }
  }
};

const Help = (() => {
  let pop = null, anchor = null;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function vis(v, cat) {
    const box = el('div', 'hv hv-' + v.type);
    if (v.type === 'tokens') {
      v.items.forEach(([w, k]) => box.appendChild(el('span', 'hv-tok' + (k ? ' ' + k : ''), w)));
    } else if (v.type === 'bars') {
      v.items.forEach(([w, p], i) => {
        const row = el('div', 'hv-bar');
        row.appendChild(el('b', null, w));
        const bar = el('span', 'hv-track');
        const fill = el('i');
        fill.style.width = p + '%';
        if (!reduced()) fill.style.animationDelay = (i * 90) + 'ms';
        bar.appendChild(fill);
        row.append(bar, el('span', 'hv-num', p + ' %'));
        box.appendChild(row);
      });
    } else if (v.type === 'cycle' || v.type === 'scale') {
      v.items.forEach((it, i) => {
        if (i) box.appendChild(el('span', 'hv-arrow', v.type === 'cycle' ? '→' : '·'));
        const st = el('span', 'hv-st');
        st.appendChild(el('span', 'hv-ico', it[0]));
        if (v.type === 'scale') st.appendChild(el('b', null, it[1]));
        st.appendChild(el('span', 'hv-lab', it[it.length - 1]));
        box.appendChild(st);
      });
      if (v.loop) box.appendChild(el('span', 'hv-loop', '↻'));
    } else if (v.type === 'swatch') {
      box.appendChild(el('span', 'hv-tok win', v.label));
      box.appendChild(el('span', 'hv-arrow', '→'));
      const row = el('span', 'hv-cells');
      v.values.forEach(x => {
        const c = el('i');
        c.style.background = x >= 0
          ? 'color-mix(in srgb, var(--src-a) ' + Math.round(x * 100) + '%, var(--surface))'
          : 'color-mix(in srgb, var(--src-b) ' + Math.round(-x * 100) + '%, var(--surface))';
        row.appendChild(c);
      });
      box.appendChild(row);
    } else if (v.type === 'abc') {
      ['A', 'B', 'C'].forEach((l, i) => {
        const card = el('span', 'hv-doc');
        const b = el('span', 'letter', l);
        b.style.background = 'var(--src-' + 'abc'[i] + ')';
        card.appendChild(b);
        card.appendChild(el('span', 'hv-lines'));
        box.appendChild(card);
      });
      box.appendChild(el('span', 'hv-arrow', '→'));
      box.appendChild(el('span', 'hv-ico', '💬'));
    } else if (v.type === 'line') {
      box.innerHTML = '<svg viewBox="0 0 200 60" aria-hidden="true"><polyline points="4,8 30,20 55,30 80,36 110,44 140,48 170,51 196,52" fill="none" stroke="var(--cat-random)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="6" y="58" font-size="10" fill="var(--muted)">Start</text><text x="160" y="40" font-size="10" fill="var(--muted)">gelernt</text></svg>';
    } else if (v.type === 'dots') {
      box.innerHTML = '<svg viewBox="0 0 220 80" aria-hidden="true">'
        + '<circle cx="40" cy="30" r="5" fill="var(--t-tiere)"/><circle cx="58" cy="44" r="5" fill="var(--t-tiere)"/><circle cx="30" cy="52" r="5" fill="var(--t-tiere)"/>'
        + '<text x="48" y="22" font-size="11" fill="var(--ink)">Hund</text><text x="66" y="56" font-size="11" fill="var(--ink)">Katze</text>'
        + '<circle cx="160" cy="26" r="5" fill="var(--t-sonne)"/><circle cx="178" cy="44" r="5" fill="var(--t-sonne)"/><circle cx="150" cy="50" r="5" fill="var(--t-sonne)"/>'
        + '<text x="120" y="20" font-size="11" fill="var(--ink)">Rakete</text><text x="132" y="68" font-size="11" fill="var(--ink)">Mond</text>'
        + '<path d="M80 40 Q110 30 140 38" fill="none" stroke="var(--muted)" stroke-dasharray="3 4"/><text x="92" y="30" font-size="10" fill="var(--muted)">weit weg</text>'
        + '</svg>';
    } else if (v.type === 'net') {
      let s = '<svg viewBox="0 0 220 80" aria-hidden="true">';
      const L = [[30, [16, 40, 64]], [110, [10, 30, 50, 70]], [190, [24, 56]]];
      const col = (i, j) => ((i * 7 + j * 3) % 3 === 0 ? 'var(--src-b)' : 'var(--src-a)');
      for (let a = 0; a < 2; a++) L[a][1].forEach((y1, i) => L[a + 1][1].forEach((y2, j) => {
        s += '<line x1="' + L[a][0] + '" y1="' + y1 + '" x2="' + L[a + 1][0] + '" y2="' + y2 + '" stroke="' + col(i, j) + '" stroke-width="' + (1 + ((i + j) % 3)) + '" opacity=".55"/>';
      }));
      const ring = ['var(--cat-origin)', 'var(--cat-context)', 'var(--cat-candidates)'];
      L.forEach(([x, ys], a) => ys.forEach(y => { s += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="var(--surface)" stroke="' + ring[a] + '" stroke-width="2"/>'; }));
      box.innerHTML = s + '</svg>';
    }
    return box;
  }

  function close() {
    if (!pop) return;
    pop.remove();
    pop = null;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); anchor.classList.remove('open'); }
    anchor = null;
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', close);
  }
  function onDoc(e) {
    if (pop && (pop.contains(e.target) || (anchor && anchor.contains(e.target)))) return;
    close();
  }
  function onKey(e) { if (e.key === 'Escape') { const a = anchor; close(); if (a) a.focus(); } }

  function place() {
    if (!pop) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw <= 560 || !anchor) { pop.classList.add('sheet'); return; }
    pop.classList.remove('sheet');
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = r.right - w + 14;
    left = Math.max(12, Math.min(vw - w - 12, left));
    let top = r.bottom + 10;
    if (top + h > vh - 12 && r.top - h - 10 > 12) top = r.top - h - 10;
    top = Math.max(12, Math.min(vh - h - 12, top));
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    const ax = Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left));
    pop.style.setProperty('--ax', ax + 'px');
    pop.classList.toggle('above', top < r.top);
  }

  function show(h, a) {
    const same = pop && anchor === a && a;
    close();
    if (same) return;
    anchor = a || null;
    pop = el('div', 'help-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', h.title);
    const CATC = typeof CAT !== 'undefined' && h.cat && CAT[h.cat];
    pop.style.setProperty('--hc', CATC ? CATC.color : 'var(--accent)');
    pop.style.setProperty('--ht', CATC ? CATC.tint : 'var(--accent-dim)');

    const head = el('div', 'help-head');
    head.appendChild(el('span', 'help-ico', h.icon || '💡'));
    head.appendChild(el('b', 'help-title', h.title));
    const x = el('button', 'help-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Schließen');
    x.addEventListener('click', () => { const an = anchor; close(); if (an) an.focus(); });
    head.appendChild(x);
    pop.appendChild(head);
    if (h.vis) pop.appendChild(vis(h.vis, h.cat));
    (Array.isArray(h.text) ? h.text : [h.text]).forEach(t => { if (t) pop.appendChild(el('p', 'help-txt', t)); });
    if (h.extra) pop.appendChild(h.extra);

    document.body.appendChild(pop);
    if (anchor) { anchor.setAttribute('aria-expanded', 'true'); anchor.classList.add('open'); }
    place();
    requestAnimationFrame(place);
    setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true);
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', close);
    }, 0);
  }

  function open(key, a) {
    const h = HELP[key];
    if (!h) return;
    show(h, a);
    if (typeof Guide !== 'undefined') Guide.did('help', { key });
  }

  function btn(key, cls) {
    const h = HELP[key] || { title: 'Erklärung' };
    const b = el('button', 'help-btn' + (cls ? ' ' + cls : ''), '?');
    b.type = 'button';
    b.setAttribute('aria-label', 'Erklärung: ' + h.title);
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    b.dataset.help = key;
    b.addEventListener('click', e => { e.stopPropagation(); open(key, b); });
    return b;
  }

  return { btn, open, show, close };
})();
