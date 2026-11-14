/* ?-Hilfen: statt langer Erklärtexte auf den Karten ein kleiner runder ?-Knopf.
   Ein Tipp öffnet ein Kärtchen mit Symbol, Titel, höchstens zwei kurzen Sätzen und einem
   Mini-Bild, das dasselbe noch einmal ohne Worte zeigt. Immer nur eins offen; schließt bei
   Tipp daneben, Esc oder ×. Auf schmalen Geräten kommt es als Blatt von unten.

   Help.btn(key)          -> <button class="help-btn">?</button>, öffnet HELP[key]
   Help.open(key, anchor) -> öffnet direkt (ohne Knopf)
   Help.show(entry, anchor) -> wie open, aber mit einem Eintrag, der nicht in HELP steht
   Help.close()

   Ein HELP-Eintrag: { title, icon, text (Satz oder Liste), cat, vis, try (nur im Erklärfenster) }
   Dieselben Einträge füllen das Erklärfenster der Reiter (erklaerung.js).
     cat  = Kategoriefarbe (Schlüssel aus panel.js CAT), sonst Akzent
     vis  = Mini-Bild, eins von:
       { type: 'tokens', items: [[wort, art]] }  art: '' | 'dim' | 'win' | 'next' | 's0'…'s2'
       { type: 'bars',   items: [[wort, prozent]] }
       { type: 'cycle',  items: [[symbol, wort]], loop: true }
       { type: 'scale',  items: [[symbol, wert, wort]] }
       { type: 'swatch', label, values: [..] }
       { type: 'line' } | { type: 'abc' } | { type: 'dots' } | { type: 'net' } */
const HELP = {
  /* ---- Reiter in jeder Phase ---- */
  textwelten: {
    title: 'Textwelten', icon: '📚', cat: 'texts',
    text: ['Das ist das Futter von Tiny. Tiny kennt nur diese Texte – sonst gar nichts.',
      'Mit dem Haken schaltest du eine ganze Welt an oder aus. Tipp auf einen Namen, dann kannst du die Texte lesen, ändern oder eigene dazuschreiben.'],
    try: 'Lass nur „Haustiere“ an und lass Tiny schreiben. Worüber schreibt es jetzt?',
    vis: { type: 'cycle', items: [['📚', 'Texte'], ['🤖', 'Tiny'], ['💬', 'Sätze']] }
  },

  /* ---- Phase 1 ---- */
  p1: {
    title: 'Frei schreiben', icon: '✍️',
    text: 'Tiny zählt, welches Wort in deinen Texten wie oft auf welches folgt – und würfelt daraus Wort für Wort einen neuen Text.',
    vis: { type: 'cycle', items: [['👀', 'letzte Wörter'], ['📊', 'zählen'], ['🎲', 'würfeln']], loop: true }
  },
  kontext: {
    title: 'Kontextfenster', icon: '👀', cat: 'context',
    text: ['Tiny schaut immer nur auf die letzten paar Wörter – das ist das Kontextfenster. Alles, was weiter vorn steht, hat Tiny schon vergessen. Der Satzanfang zählt auch als „Wort“.',
      'Ein N-Gramm sind N Wörter hintereinander: N − 1 Wörter im Fenster + das neue Wort (farbig). 3-Gramm = 2 Wörter davor + 1 neues. Darunter alle N-Gramme deiner Texte, die häufigsten oben – tipp eins an, dann siehst du, wo es steht.'],
    try: 'Stell den Regler auf 1-Gramm, dann auf 2 und auf 7. Wann ist es Wortsalat, wann schreibt Tiny ganze Sätze ab?',
    vis: { type: 'tokens', items: [['Gestern', 'dim'], ['ging', 'dim'], ['der', 'dim'], ['Hund', 'win'], ['schnell', 'win'], ['?', 'next']] }
  },
  herkunft: {
    title: 'Quellen', icon: '📑', cat: 'origin',
    text: ['Tiny erfindet kein einziges Wort. Hier siehst du, wie viele Token es aus jedem Text genommen hat.',
      'Tipp einen Text an: Die genommenen Token sind darin markiert. Darum hat jedes Wort im Handy die Farbe seines Textes.'],
    try: 'Schau auf die Farben im Text: Wo springt Tiny mitten im Satz in einen anderen Text?',
    vis: { type: 'tokens', items: [['Der', 's0'], ['Hund', 's0'], ['frisst', 's1'], ['Fisch', 's1'], ['im', 's2'], ['Meer', 's2']] }
  },
  kandidaten: {
    title: 'Kandidaten', icon: '📊', cat: 'candidates',
    text: ['Diese Wörter standen in deinen Texten direkt hinter dem Kontextfenster. Je öfter, desto länger der Balken – und desto eher nimmt Tiny das Wort. Die Temperatur oben bestimmt, wie mutig Tiny würfelt.'],
    try: 'Tipp im Handy auf ein Wort: Hat Tiny den längsten Balken genommen?',
    vis: { type: 'bars', items: [['Futter', 55], ['Fleisch', 30], ['Gras', 15]] }
  },
  zufall: {
    title: 'Zufall (Temperatur)', icon: '🌡️', cat: 'random',
    text: ['Tiny nimmt nicht immer das häufigste Wort, sondern würfelt unter den Kandidaten. Bei echten KIs heißt dieser Regler Temperatur.'],
    try: 'Temperatur 0: immer die höchste Säule. Temperatur 2: auch Seltenes. Was klingt am besten?',
    vis: { type: 'scale', items: [['🎯', '0', 'sicher'], ['🎲', '1', 'normal'], ['🌪️', '2', 'wild']] }
  },

  /* ---- Phase 2 ---- */
  p2: {
    title: 'Frage & Antwort', icon: '💬',
    text: 'Tiny sucht die 3 passendsten Texte und baut daraus Wort für Wort eine Antwort. Findet es nichts, rät es trotzdem – wie echte KIs.',
    vis: { type: 'cycle', items: [['❓', 'Frage'], ['🔎', 'suchen'], ['📑', '3 Texte'], ['💬', 'Antwort']] }
  },
  nachschlagen: {
    title: 'Frage zerlegen', icon: '🔎', cat: 'ask',
    text: ['Tiny versteht deine Frage nicht wirklich. Es wirft die Füllwörter weg und schaut, in welchen Texten die übrigen Wörter stehen. Die 3 Texte mit den meisten Treffern werden die Quellen A · B · C.',
      'Ist die Spalte offen, siehst du an deiner Frage im Handy: grau = Füllwort, blau = sucht Tiny, rot = kennt Tiny nicht.'],
    try: 'Frag nach etwas, das in keinem Text vorkommt – zum Beispiel nach dem Eiffelturm.',
    vis: { type: 'tokens', items: [['Was', 'dim'], ['frisst', 'win'], ['ein', 'dim'], ['Welpe', 'win'], ['?', 'dim']] }
  },
  ngramme2: {
    title: 'N-Gramme', icon: '👀', cat: 'context',
    text: ['Wie in Phase 1: Tiny schaut auf die Wörter davor (Regler N-Gramm) und sucht in den Quellen, was dahinter stand.',
      'Darunter: wie oft das in welchem Text steht. Tipp einen Text an – alle Fundstellen sind markiert.'],
    try: 'Stell den Regler auf 7-Gramm: Schreibt Tiny dann ganze Sätze aus einer Quelle ab?',
    vis: { type: 'tokens', items: [['Die', 'win'], ['Kornnatter', 'win'], ['?', 'next']] }
  },
  quellen: {
    title: 'Quellen', icon: '📑', cat: 'origin',
    text: ['A · B · C sind die Texte mit der größten Übereinstimmung mit deiner Frage. Daraus schreibt Tiny.',
      'Hier siehst du, wie viele Token aus jeder Quelle kommen. Tipp eine an: Die genommenen Token sind markiert.'],
    try: 'Stell eine andere Frage: Wechseln die Quellen?',
    vis: { type: 'abc' }
  },
  wortfuerwort: {
    title: 'Kandidaten', icon: '📊', cat: 'candidates',
    text: ['Wie in Phase 1: Diese Wörter standen in den Quellen hinter den letzten Wörtern. Je länger der Balken, desto wahrscheinlicher.',
      'Wörter aus Sätzen mit deinem Fragewort (🔎) zählen mehr.'],
    try: 'Stell die Frage mit ↻ Nochmal noch einmal. Nimmt Tiny jedes Mal dieselben Wörter?',
    vis: { type: 'bars', items: [['Napf', 60], ['Park', 25], ['Wasser', 15]] }
  },
  wortkarte: {
    title: 'Wortkarte', icon: '🗺️', cat: 'meaning',
    text: ['Wörter, die in ähnlichen Sätzen vorkommen, liegen nah beieinander. So findet Tiny „ähnliche“ Wörter, auch wenn dein Wort nicht im Text steht.',
      'Die Filter lassen eine Gruppe leuchten, die Linien verbinden jedes Wort mit seinen ähnlichsten Nachbarn.'],
    try: 'Tipp auf ein Wort und schau, welche Nachbarn es hat.',
    vis: { type: 'dots' }
  },

  /* ---- Phase 3 „Wörter als Punkte“ (Prototyp 12.11.2026) ---- */
  p3: {
    title: 'Wörter als Punkte', icon: '🌌',
    text: 'Jedes Wort ist hier ein Punkt aus Zahlen. Wörter, die in ähnlichen Sätzen stehen, liegen nah beieinander. Tiny schreibt weiter mit N-Grammen – aber es sucht die Texte über die Wolke und springt manchmal zu einem nahen Wort.',
    vis: { type: 'cycle', items: [['📚', 'Texte'], ['🔢', 'Punkte'], ['⭐', 'Frage'], ['💬', 'Antwort']] }
  },
  bedeutung: {
    title: 'Frage als Punkt', icon: '⭐', cat: 'ask',
    text: ['Die Wörter deiner Frage sind Punkte. Ihre Mitte ist der Punkt der Frage. Jeder Text ist auch ein Punkt – die Mitte seiner Wörter.',
      'Tiny nimmt die 3 Texte mit dem kleinsten Abstand (0 = genau da, 1 = weit weg) und schreibt daraus.'],
    try: 'Frag „Wie lange dauert eine Reise zum Mars?“. Welche Texte liegen nah?',
    vis: { type: 'dots' }
  },
  sprung: {
    title: 'Wolken-Sprung', icon: '🦘', cat: 'meaning',
    text: ['Das N-Gramm zieht ein Wort, zum Beispiel „Katze“. Dann schaut Tiny in der Wolke, welche Wörter nah liegen (kleiner Abstand), und springt manchmal hinüber – „Katze springt zu Hund!“. Nicht weil das so im Text steht, sondern weil es in der Wolke nah liegt.',
      'Die Sprungwahrscheinlichkeit sagt, wie oft Tiny springt: 0 % = nie, weiter rechts = öfter und auch zu weiter entfernten Wörtern. Echte Sprachmodelle machen das von selbst: Ähnliche Wörter bekommen ähnliche Chancen.',
      'Die Wolke kennt alle Quellen. Deshalb kann Tiny zu einem Wort springen, das in A · B · C gar nicht steht – dann steht „nicht in A · B · C“ daneben.'],
    try: 'Stell den Regler auf 0 und frag etwas. Dann schieb ihn nach rechts und frag nochmal.',
    vis: { type: 'tokens', items: [['Katze', 'win'], ['→', 'dim'], ['Hund', 's0'], ['bellt', 'next']] }
  },
  sprungzufall: {
    title: 'Warum gerade dieses Wort?', icon: '🎲', cat: 'meaning',
    text: ['Das war Zufall. Jede Möglichkeit hat eine Chance (die %-Zahl): je kleiner der Abstand, desto größer die Chance. Dann würfelt Tiny – wie bei den Kandidaten.',
      'Fragst du nochmal, kann Tiny bleiben oder zu einem anderen Wort springen.'],
    vis: { type: 'bars', items: [['bleibt', 55], ['Hund', 30], ['Maus', 15]] }
  },
  wolke: {
    title: 'Wortwolke', icon: '🌌', cat: 'meaning',
    text: ['Jeder Punkt ist ein Wort. Nah beieinander liegen Wörter, die oft bei denselben Wörtern stehen (Hund und Katze stehen beide bei „frisst“ und „schläft“).',
      'Die Wolke zeigt die Wörter aller Quellen. Der Abstand sagt, wie nah zwei Wörter sind: 0 = derselbe Punkt, 1 = weit weg.',
      'Oben blendest du ein: Frage (blau, ★), Antwort-Weg (grün, Pfeile in der Reihenfolge, in der Tiny geschrieben hat) und Sprünge (gestrichelt: von welchem Wort Tiny gesprungen ist). Wörter wie „der“ oder „und“ haben keinen Punkt.',
      'Eigentlich hat jedes Wort 20 Zahlen. Das Bild zeigt nur 3 davon – deshalb kann Nähe im Bild täuschen.'],
    try: 'Frag etwas und schau, welchen Weg die Antwort durch die Wolke nimmt. Wo ist sie gesprungen?',
    vis: { type: 'dots' }
  },

  /* ---- Phase 4 (Echtes Netz) ---- */
  p4: {
    title: 'Echtes Netz', icon: '🧠',
    text: ['Hier wird nichts nachgeschlagen. Das Netz merkt sich beim Training nur Zahlen – die Texte selbst sind danach weg.',
      'Deine Frage bekommt das Netz bei jedem Wort als eigenen Eingang dazu – so bleibt es beim Thema, auch wenn die Frage längst nicht mehr in den letzten Wörtern steht.'],
    vis: { type: 'cycle', items: [['📚', 'Texte'], ['🔢', 'Zahlen'], ['🧠', 'Netz'], ['💬', 'Wort']] }
  },
  fragestaerke: {
    title: 'Frage-Stärke', icon: '⭐', cat: 'candidates',
    text: ['Wie stark schiebt deine Frage die passenden Wörter nach oben? Bei 1× so, wie das Netz es gelernt hat. Mehr = mehr Thema, aber die Sätze zerfallen, weil die Frage die letzten Wörter übertönt.'],
    try: 'Stell den Regler auf 3× und lass Tiny schreiben. Und dann auf 0×. Was passiert?',
    vis: { type: 'bars', items: [['Hund', 55], ['frisst', 30], ['der', 15]] }
  },
  frage4: {
    title: 'Die Frage als Eingang', icon: '⭐', cat: 'embed',
    text: ['Die Wörter deiner Frage werden zu Zahlen, und das Netz nimmt ihren Mittelpunkt – wie der Stern in der Wortwolke. Gezählt werden die Nomen der Frage. Ihre Zahlen bekommt das Netz bei JEDEM Wort zusätzlich zu den letzten Wörtern.',
      'Geübt hat es das im Training: zu jedem Beispiel gab es ein paar Wörter aus demselben Text als Übungsfrage.'],
    try: 'Stell dieselbe Frage mit einem anderen Tier oder Planeten. Ändern sich die Kandidaten?',
    vis: { type: 'tokens', items: [['⭐ Hund · frisst', 'win'], ['der', 'win'], ['Hund', 'win'], ['frisst', 'win'], ['?', 'next']] }
  },
  embedding: {
    title: 'Embedding', icon: '🔢', cat: 'embed',
    text: ['Ein Netz kann keine Buchstaben lesen. Jedes Wort im Kontextfenster wird deshalb zu einer festen Reihe aus 32 Zahlen: rot = plus, blau = minus.',
      'Wie viele Wörter das Netz sieht, stellst du oben in dieser Spalte ein (3 · 4 · 5). Jede Länge ist ein eigenes Netz, das eigenes Training braucht.'],
    try: 'Trainiere ein bisschen und schau, wie sich die Farben der Wörter verändern.',
    vis: { type: 'swatch', label: 'Hund', values: [0.9, -0.4, 0.2, -0.9, 0.6, 0.1, -0.2, 0.8, -0.6, 0.3, 0, -0.8] }
  },
  hidden: {
    title: 'Hidden-Schicht', icon: '💡', cat: 'hidden',
    text: ['Hier mischt das Netz die Zahlen aller Wörter zu 40 neuen Zahlen – den Neuronen. Jedes Kästchen ist ein Neuron: je kräftiger die Farbe, desto stärker ist es gerade an.',
      'Niemand hat den Neuronen gesagt, was sie tun sollen – das lernen sie beim Training selbst. Darunter steht, welche Wörter die gerade stärksten Neuronen nach oben schieben.'],
    try: 'Vor dem Training schieben die Neuronen wahllose Wörter. Trainiere eine Weile – passen die Wörter jetzt zusammen?',
    vis: { type: 'swatch', label: '?', values: [0.3, -0.7, 0.9, 0.1, -0.2, 0.5, -0.9, 0.4, 0.7, -0.3, 0.2, -0.5] }
  },
  ausgabe: {
    title: 'Kandidaten', icon: '📊', cat: 'candidates',
    text: ['Am Ende bekommt jedes Wort, das das Netz kennt, einen Prozentwert – ganz ohne Texte nachzusehen. Daraus wird gewürfelt, genau wie in Phase 1.'],
    try: 'Vergleiche vor und nach dem Training: Wie sicher ist sich das Netz?',
    vis: { type: 'bars', items: [['Hund', 48], ['Katze', 31], ['Napf', 21]] }
  },
  kontextnetz: {
    title: 'Kontextfenster', icon: '👀', cat: 'context',
    text: 'Mehr Wörter im Blick = geradere Sätze. Aber jedes Fenster ist ein eigenes Netz, muss neu lernen und schreibt die Texte eher wörtlich ab.',
    vis: { type: 'tokens', items: [['Der', 'dim'], ['kleine', 'win'], ['Hund', 'win'], ['frisst', 'win'], ['?', 'next']] }
  },
  training: {
    title: 'Training', icon: '🏋️', cat: 'train',
    text: ['Das Netz rät das nächste Wort, vergleicht mit dem echten und dreht alle Zahlen ein kleines Stück in die richtige Richtung – tausende Male. Zu jedem Beispiel bekommt es ein paar Wörter aus demselben Text als Übungsfrage.',
      'Die Fehlerlinie zeigt, wie sehr es danebenliegt. Sinkt sie, lernt das Netz.'],
    try: 'Drück auf „Training starten“ und schau zu, wie die Fehlerlinie fällt. Wann wird sie flach?',
    vis: { type: 'cycle', items: [['🤔', 'raten'], ['✅', 'vergleichen'], ['🔧', 'korrigieren']], loop: true }
  },
  fehler: {
    title: 'Fehlerlinie', icon: '📉', cat: 'train',
    text: 'Wie sehr lag das Netz daneben? Fällt die Linie, dann lernt es.',
    vis: { type: 'line' }
  },
  netz: {
    title: 'Das Netz von innen', icon: '🕸️', cat: 'net',
    text: ['Das ganze Netz auf einmal: Punkte sind Neuronen, Linien sind Gewichte. Rot schiebt an, blau bremst.',
      'Jede Linie ist eine echte Zahl aus dem Netz – nichts ist hier nur zur Deko.'],
    try: 'Tipp ein Neuron an und lies seine echten Zahlen.',
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
      box.innerHTML = '<svg viewBox="0 0 200 60" aria-hidden="true"><polyline points="4,8 30,20 55,30 80,36 110,44 140,48 170,51 196,52" fill="none" stroke="var(--cat-train)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="6" y="58" font-size="10" fill="var(--muted)">Start</text><text x="160" y="40" font-size="10" fill="var(--muted)">gelernt</text></svg>';
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
      const ring = ['var(--cat-embed)', 'var(--cat-hidden)', 'var(--cat-candidates)'];
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

  return { btn, open, show, close, vis };
})();
