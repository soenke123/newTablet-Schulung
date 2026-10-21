/**
 * Tour im Raum (nur mit ?raum=, braucht BT.room aus room.js): kleine Kaesten, die direkt neben
 * dem stehen, was sie erklaeren. Der Rest der Seite ist abgedunkelt, das erklaerte Stueck
 * ausgespart und umrandet. Wenig Text, dafuer Knopf-Nachbauten (▶ Start, ⤢ Groß) und ein Symbol.
 *
 * Zwei Teile:
 *   Auswahl (nur Lehrkraft, beim Oeffnen): Szenarien · Mit Klasse teilen · Inseltypen. Danach
 *     ist die Tour weg, bis ein Szenario laeuft.
 *   Szenario (alle, sobald eines startet): Insel · Zeit und Neustart · Bestand · Diagramme Tiere ·
 *     Diagramme Pflanzen · Todesursachen · Groß · [Menschen: Karten · Zahlen] · Insel einstellen ·
 *     Szenarien. Mit Menschen nennt der Schritt „Tiere“ zusaetzlich Schafe, Ratten und Hunde.
 *
 * Jeder Schritt hat eine id; gesehene ids werden gemerkt. Ein weiteres Szenario zeigt deshalb nur
 * die Schritte, die neu sind (von 1 nach 4: die Menschen und die Tiere der Menschen), und ein
 * schon gesehenes Szenario gar keine. „Überspringen“ zaehlt wie gesehen. Das ? oben rechts
 * zeigt die Tour fuer das, was gerade dran ist, noch einmal ganz.
 *
 * Gemerkt wird bei der Lehrkraft im localStorage (eigenes Geraet, nicht jede Stunde neu), bei der
 * Klasse im sessionStorage: Ein Klassensatz-Tablet wechselt die Person.
 */
(function (global) {
  'use strict';

  var BT = global.BT;
  var doc = global.document;
  if (!BT.room || !BT.app) return;

  var TEACHER = BT.room.teacher;
  var KEY = 'bon.tour.' + (TEACHER ? 'lehrer' : 'schueler');
  var GAP = 14, EDGE = 8, PAD = 6;

  function storage() {
    try { return TEACHER ? global.localStorage : global.sessionStorage; } catch (e) { return null; }
  }
  var seen = {};
  try { seen = JSON.parse((storage() && storage().getItem(KEY)) || '{}') || {}; } catch (e) { seen = {}; }
  function markSeen(steps) {
    steps.forEach(function (st) { (st.covers || [st.id]).forEach(function (id) { seen[id] = 1; }); });
    try { storage().setItem(KEY, JSON.stringify(seen)); } catch (e) { /* ohne Speicher */ }
  }
  function isSeen(st) { return !!seen[st.id]; }

  function k(t) { return '<span class="tour-k">' + t + '</span>'; }
  function q(sel) { return function () { return doc.querySelector(sel); }; }

  // ---------------------------------------------------------------- Schritte
  /** Lehrkraft, Auswahl offen */
  function introSteps() {
    return [
      { id: 'i-szenarien', icon: '🏝️', target: q('.scn-tiles'), place: ['bottom', 'top'],
        title: 'Vier Szenarien',
        text: 'Jede Kachel ist ein fertiges Ökosystem. ' + k('▶ Starten') + ' probiert es bei dir aus, ' +
          k('<i>i</i>') + ' zeigt Infos für den Unterricht.' },
      { id: 'i-teilen', icon: '📤', target: q('.scn-tile .scn-actions'),
        title: 'Mit der Klasse teilen',
        text: 'Die Tablets sehen nur geteilte Szenarien. ' + k('Entziehen') + ' beendet es dort wieder.' },
      { id: 'i-typen', icon: '⛰️', target: q('.scn-types-wrap'), place: ['bottom', 'left'],
        title: 'Inseltypen',
        text: 'Schalter an: Alle wählen oben Gras-, Wald- oder Felsinsel. ' + k('<i>i</i>') + ' erklärt die Unterschiede.',
        note: 'Wähle ein Szenario – dort geht die Tour weiter.' }
    ];
  }

  function charts(from, to) {
    return function () { return [].slice.call(doc.querySelectorAll('#charts .chart')).slice(from, to); };
  }

  /** Ein laufendes Szenario */
  function scenarioSteps(s) {
    var humans = !!s.humans;
    var steps = [
      { id: 'insel', icon: '🗺️', target: q('.stage'), place: ['inside'],
        title: 'Die Insel',
        text: 'Ziehen verschiebt, zwei Finger oder Mausrad zoomen. Tier antippen: Die Kamera folgt ihm.' },
      { id: 'zeit', icon: '⏱️', target: q('.fold[data-fold="zeit"]'), open: 'zeit',
        title: 'Zeit',
        text: k('▶ Start') + ' lässt die Zeit laufen, ' + k('⏩ 5 Jahre') + ' spult vor, der Regler ist das Tempo. ' +
          k('↻ Neustarten') + ': mit anderem Startbestand von vorn.' },
      { id: 'bestand', icon: '🦌', target: q('.fold[data-fold="bestand"]'), open: 'bestand',
        title: 'Bestand',
        text: 'So viele Tiere leben gerade. Art antippen: Sie leuchtet auf der Karte.' },
      humans
        ? { id: 'tiere-m', covers: ['tiere', 'tiere-m'], icon: '📈', target: charts(0, 2), open: 'verlauf',
            title: 'Diagramme: Tiere',
            text: 'Pflanzenfresser und Räuber über die Jahre. Neu mit den Menschen: ' +
              '<b>Schafe</b> und <b>Ratten</b> bei den Pflanzenfressern, <b>Hunde</b> bei den Räubern.' }
        : { id: 'tiere', icon: '📈', target: charts(0, 2), open: 'verlauf',
            title: 'Diagramme: Tiere',
            text: 'Pflanzenfresser und Räuber über die Jahre. ' + k('Jahresmittel') + ' glättet die Jahreszeiten.' },
      { id: 'pflanzen', icon: '🌿', target: charts(2, 4), open: 'verlauf',
        title: 'Diagramme: Pflanzen',
        text: 'Nahrung und Zustand der Pflanzen. <b>100 %</b> = unberührte Insel.' },
      { id: 'tod', icon: '🦴', target: function () { var w = doc.querySelector('.deaths-wrap'); return w && [w.previousElementSibling, w]; }, open: 'verlauf',
        title: 'Todesursachen',
        text: 'Woran sind die Tiere gestorben? Gezählt seit dem Start.' },
      { id: 'gross', icon: '🔍', target: q('#openBig'), open: 'verlauf',
        title: 'Groß ansehen',
        text: k('⤢ Groß') + ' zeigt alle Diagramme groß untereinander.' }
    ];
    if (humans) steps.push(
      { id: 'karten', icon: '🃏', target: q('.fold[data-fold="menschen"]'), open: 'menschen',
        title: 'Menschen',
        text: 'Eingriffe als Karten: ' + k('+') + ' spielt, ' + k('−') + ' nimmt zurück, Karte antippen erklärt sie. ' +
          'Darunter steht, was passiert ist.' },
      { id: 'menschen-zahlen', icon: '🏘️', target: q('.fold[data-fold="insel"]'), open: 'insel',
        title: 'Menschen auf der Insel',
        text: 'Häuser, Äcker, Schafe, Jagd: die Zahlen zu den Siedlern.' });
    steps.push(
      { id: 'einstellen', icon: '⚙️', target: q('#openIsland'), place: ['bottom', 'right'],
        title: 'Insel einstellen',
        text: k('Neue Insel') + ', Seed und Größe. Eine andere Insel startet das Szenario von vorn.' },
      { id: 'szenarien', icon: '🗂️', target: q('#scnOpen'), place: ['bottom', 'right'],
        title: 'Szenarien',
        text: TEACHER
          ? 'Zurück zur Auswahl: anderes Szenario starten, teilen oder entziehen. Dein Stand bleibt.'
          : 'Zurück zur Auswahl. Dein Stand im Szenario bleibt.' });
    return steps;
  }

  /** Klasse, kein Szenario: der eine Satz, den das ? dann noch sagen kann */
  function waitSteps() {
    var cards = doc.querySelector('.scn-cards .scn-card');
    return [cards
      ? { id: 's-wahl', icon: '🗂️', target: q('.scn-cards'), place: ['bottom', 'top', 'inside'],
          title: 'Szenario wählen', text: 'Tippe ein Szenario an. Danach erklärt dir die Tour alles Weitere.' }
      : { id: 's-wahl', icon: '🗂️', target: q('#scnOpen'), place: ['bottom', 'right'],
          title: 'Szenarien', text: 'Hier stehen die Szenarien, sobald deine Lehrkraft eines freigibt.' }];
  }

  // ---------------------------------------------------------------- Oberflaeche
  var shield = doc.createElement('div');
  shield.className = 'tour-shield';
  shield.hidden = true;
  var spot = doc.createElement('div');
  spot.className = 'tour-spot';
  spot.hidden = true;
  var pop = doc.createElement('div');
  pop.className = 'tour-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-live', 'polite');
  pop.hidden = true;
  doc.body.append(shield, spot, pop);

  var helpBtn = doc.createElement('button');
  helpBtn.type = 'button';
  helpBtn.className = 'tour-help';
  helpBtn.title = 'Tour noch einmal zeigen';
  helpBtn.setAttribute('aria-label', 'Tour noch einmal zeigen');
  helpBtn.textContent = '?';
  doc.querySelector('.bar').appendChild(helpBtn);

  var steps = [], at = 0, timer = 0, watch = 0, forScenario = false;

  function active() { return steps.length > 0; }

  function targets(st) {
    var t = st.target && st.target();
    if (!t) return [];
    return (Array.isArray(t) ? t : [t]).filter(function (el) {
      return el && el.getClientRects().length > 0;
    });
  }

  /** Ohne scrollIntoView: das scrollte auch die MPSkills-Seite um den Rahmen herum. */
  function reveal(el) {
    for (var n = el.parentElement; n; n = n.parentElement) {
      var cs = global.getComputedStyle(n);
      var scrolls = n === doc.scrollingElement || /(auto|scroll)/.test(cs.overflowY);
      if (!scrolls || n.scrollHeight <= n.clientHeight + 1) continue;
      var box = n === doc.scrollingElement ? { top: 0, height: global.innerHeight } : n.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      var off = r.top - box.top;
      if (off < 0 || off + r.height > box.height) {
        n.scrollTop += off - Math.max(0, (box.height - r.height) / 2);
      }
    }
  }

  function union(els) {
    var r = null;
    els.forEach(function (el) {
      var b = el.getBoundingClientRect();
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
            : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return r;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function place() {
    var st = steps[at];
    if (!st) return;
    // Szenario entzogen, waehrend die Tour lief: nichts mehr zu erklaeren
    if (forScenario && !BT.room.current) { stop(false); return; }
    var els = targets(st);
    var vw = global.innerWidth, vh = global.innerHeight;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    if (!els.length) {
      spot.hidden = true;
      pop.dataset.side = 'none';
      pop.style.left = Math.round((vw - w) / 2) + 'px';
      pop.style.top = Math.round((vh - h) / 2) + 'px';
      return;
    }
    var r = union(els);
    r = { left: r.left - PAD, top: r.top - PAD, right: r.right + PAD, bottom: r.bottom + PAD };
    // Ausschnitt nur im sichtbaren Bereich (ein hoher Bereich ragt sonst aus dem Bild)
    var s = { left: Math.max(r.left, 2), top: Math.max(r.top, 2), right: Math.min(r.right, vw - 2), bottom: Math.min(r.bottom, vh - 2) };
    spot.hidden = false;
    spot.style.left = s.left + 'px';
    spot.style.top = s.top + 'px';
    spot.style.width = Math.max(0, s.right - s.left) + 'px';
    spot.style.height = Math.max(0, s.bottom - s.top) + 'px';

    var cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
    var fits = {
      left: s.left - GAP - w >= EDGE,
      right: s.right + GAP + w <= vw - EDGE,
      bottom: s.bottom + GAP + h <= vh - EDGE,
      top: s.top - GAP - h >= EDGE
    };
    var order = (st.place || []).concat(['left', 'right', 'bottom', 'top']);
    var side = null;
    for (var i = 0; i < order.length && !side; i++) {
      if (order[i] === 'inside') { if (s.right - s.left >= w + 40 && s.bottom - s.top >= h + 40) side = 'inside'; }
      else if (fits[order[i]]) side = order[i];
    }
    if (!side) side = (vh - s.bottom > s.top) ? 'bottom' : 'top';

    var x, y;
    if (side === 'left' || side === 'right') {
      x = side === 'left' ? s.left - GAP - w : s.right + GAP;
      y = clamp(cy - h / 2, EDGE, vh - h - EDGE);
      pop.style.setProperty('--arrow', clamp(cy - y, 18, h - 18) + 'px');
    } else if (side === 'inside') {
      x = clamp(s.left + 24, EDGE, vw - w - EDGE);
      y = clamp(s.bottom - h - 24, EDGE, vh - h - EDGE);
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
    var st = steps[at];
    if (st.open) BT.app.fold(st.open, true);
    var last = at === steps.length - 1;
    pop.innerHTML =
      '<div class="tour-row">' +
        '<span class="tour-ico" aria-hidden="true">' + st.icon + '</span>' +
        '<div class="tour-txt"><h3>' + st.title + '</h3><p>' + st.text + '</p>' +
          (st.note && last ? '<p class="tour-note">' + st.note + '</p>' : '') + '</div>' +
      '</div>' +
      '<div class="tour-foot">' +
        (steps.length > 1 ? '<span class="tour-count" aria-label="Schritt ' + (at + 1) + ' von ' + steps.length + '">' +
          (at + 1) + ' / ' + steps.length + '</span>' : '') +
        '<span class="spacer"></span>' +
        (last ? '' : '<button type="button" class="tour-skip" data-t="skip">Überspringen</button>') +
        (at > 0 ? '<button type="button" data-t="back" aria-label="Zurück">‹</button>' : '') +
        '<button type="button" class="primary" data-t="next">' + (last ? 'Fertig' : 'Weiter ›') + '</button>' +
      '</div>';
    pop.hidden = false;
    shield.hidden = false;
    var els = targets(st);
    if (els.length) reveal(els[0]);
    place();
    pop.querySelector('[data-t="next"]').focus({ preventScroll: true });
  }

  /** steps: alle Schritte; all: auch gesehene zeigen (das ?) */
  function run(list, all, scenario) {
    stop(false);
    forScenario = !!scenario;
    var todo = all ? list : list.filter(function (st) { return !isSeen(st); });
    if (!todo.length) return;
    steps = todo;
    show(0);
    watch = global.setInterval(place, 400);   // Kacheln werden neu gebaut, Leiste klappt auf …
  }

  function stop(done) {
    global.clearTimeout(timer);
    global.clearInterval(watch);
    if (done && steps.length) markSeen(steps);
    steps = [];
    pop.hidden = shield.hidden = spot.hidden = true;
  }

  pop.addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]');
    if (!b) return;
    var t = b.dataset.t;
    if (t === 'skip') stop(true);
    else if (t === 'back') show(Math.max(0, at - 1));
    else if (at < steps.length - 1) show(at + 1);
    else stop(true);
  });
  global.addEventListener('keydown', function (e) {
    if (!active()) return;
    if (e.key === 'Escape') stop(true);
    else if (e.key === 'ArrowRight') { if (at < steps.length - 1) show(at + 1); }
    else if (e.key === 'ArrowLeft') { if (at > 0) show(at - 1); }
    else if (e.key === 'Tab' || e.key === 'Enter' || (e.key === ' ' && e.target && pop.contains(e.target))) return;
    e.stopImmediatePropagation();
    if (e.key !== 'Tab') e.preventDefault();
  }, true);
  global.addEventListener('resize', function () { if (active()) place(); });

  // ---------------------------------------------------------------- Anlaesse
  function scenarioTour(all) {
    var s = BT.room.current;
    if (!s) return;
    BT.app.big(false);
    run(scenarioSteps(s), all, true);
  }

  helpBtn.addEventListener('click', function () {
    if (BT.room.current) { BT.room.open(false); scenarioTour(true); }
    else if (TEACHER) { BT.room.open(true); run(introSteps(), true); }
    else run(waitSteps(), true);
  });

  // Lehrkraft: beim ersten Oeffnen die Auswahl erklaeren
  BT.room.onReady = function () {
    if (TEACHER) timer = global.setTimeout(function () { run(introSteps(), false); }, 450);
  };
  // Ein Szenario laeuft: nur die Schritte, die noch fehlen (die Auswahl zaehlt dann als gesehen)
  BT.room.onStart = function () {
    if (active()) stop(true);
    timer = global.setTimeout(function () { scenarioTour(false); }, 350);
  };

  BT.tour = { run: run, stop: stop, intro: introSteps, scenario: scenarioSteps, reset: function () { seen = {}; markSeen([]); } };
})(typeof window !== 'undefined' ? window : globalThis);
