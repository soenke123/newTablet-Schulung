/**
 * Raum-Modus fuer MPSkills (?raum=lehrer bzw. ?raum=schueler; tool.js im Skill-Ordner
 * ist die Gegenseite). Ohne den Parameter tut diese Datei nichts.
 *
 * Im Raum sieht man zuerst nur die Insel, ohne Tiere, und nichts passiert. Gespielt
 * werden vier feste Szenarien (SCENARIOS). Die Lehrkraft sieht sie als Kacheln mit
 * Bild, kurzer Erklaerung und einem i (Infos fuer den Unterricht), startet eines fuer
 * sich oder teilt es mit der Klasse. Die Klasse sieht nur die geteilten, als Karten
 * „Szenario 1“ … ohne Text und Bild. Ueber den Knopf „Szenarien“ oben kommt man
 * jederzeit zurueck zur Auswahl.
 *
 * Geteilt wird ueber den Raum (skill_room_state.data.shared). Der Rahmen schickt
 * { type: 'bon:cmd', shared: [1, 3] } herein und bekommt { type: 'bon:share', id, on }
 * zurueck, wenn die Lehrkraft teilt oder entzieht. Jedes Geraet rechnet seine eigene
 * Insel; geteilt wird nur, WELCHES Szenario gespielt werden darf.
 *
 * Inseltypen (ausgewogen, Gras, Wald, Fels) sind kein Szenario: Die Lehrkraft schaltet
 * in der Auswahl „Inseltypen zur Auswahl“ ein (data.types, { type: 'bon:cmd', types: true }
 * hinein, { type: 'bon:types', on } heraus). Dann steht oben bei allen der Schalter „Typ“,
 * sonst laufen alle auf der ausgewogenen Insel. Ein anderer Typ baut die Insel neu,
 * das laufende Szenario beginnt dort von vorn.
 */
(function (global) {
  'use strict';

  var BT = global.BT;
  var doc = global.document;
  var params = new global.URLSearchParams(global.location.search);
  var raum = params.get('raum');
  if (!raum || !BT.app) return;

  var TEACHER = raum === 'lehrer';
  var NATIVE = ['zwerghirsch', 'laufvogel', 'inselwolf', 'inseladler'];

  var IMG = {
    zwerghirsch: 'assets/hirsch_m_stehend.png',
    laufvogel: 'assets/laufvogel_m_gehend.png',
    inselwolf: 'assets/wolf_m_stehend.png',
    inseladler: 'assets/adler_m_fliegend.png',
    schaf: 'assets/schaf/schaf_m_stehend.png',
    mensch: 'assets/doerfler/villager_2.png',
    schiff: 'assets/schiff.png'
  };
  var COLOR = { zwerghirsch: '#e0653a', laufvogel: '#3d8de0', inselwolf: '#9b86e8', inseladler: '#d4a020', schaf: '#c46bd6', nahrung: '#4caf6a' };

  /*
   * Die Szenarien. species: wer auf der Insel lebt (die anderen starten mit 0),
   * humans: Kartenleiste „Menschen“ offen. info: was die Lehrkraft hinter dem i sieht.
   *   chain  Nahrungskette von unten nach oben: [Bild oder Emoji, Name]
   *   curve  Skizze des Verlaufs (Jahresmittel): Reihen fuer infoChart()
   *   facts  [Symbol, fett, Rest] – kurz, fuer den Unterricht
   *   try    zum Ausprobieren
   */
  var SCENARIOS = [
    {
      id: 1, title: 'Wolf und Hirsch', short: 'Ein Räuber, eine Beute. Wer bestimmt hier wen?',
      species: ['zwerghirsch', 'inselwolf'], show: ['inselwolf', 'zwerghirsch'],
      info: {
        lead: 'Räuber-Beute-Zyklus',
        chain: [['🌿', 'Gras und Laub'], [IMG.zwerghirsch, 'Zwerghirsch'], [IMG.inselwolf, 'Inselwolf']],
        curve: [
          { label: 'Hirsche', color: COLOR.zwerghirsch, base: 0.58, amp: 0.27, shift: 0 },
          { label: 'Wölfe', color: COLOR.inselwolf, base: 0.3, amp: 0.15, shift: 0.22 }
        ],
        curveNote: 'Die Wölfe folgen den Hirschen mit einigen Jahren Verspätung.',
        facts: [
          ['🔁', 'Wellen statt Gleichgewicht:', 'viele Hirsche → mehr Welpen → mehr Wölfe → weniger Hirsche → Wölfe hungern → Hirsche erholen sich.'],
          ['⏳', 'Zeitversatz:', 'Die Wölfe reagieren erst im nächsten Frühjahr (Welpen), deshalb laufen die Kurven versetzt.'],
          ['🌾', 'Nahrung wird knapp:', 'Bei abgefressener Weide bekommen Hirsche weniger Kälber. Das bremst sie, bevor die Weide kaputt ist.'],
          ['🐺', 'Reviere:', 'Rudel teilen die Insel auf, nur Rudel mit eigenem Revier bekommen Welpen.']
        ],
        see: ['Diagramm auf „Jahresmittel“: dann sieht man die Wellen', 'Karte „Weidezustand“: grau heißt überweidet'],
        try: 'Neustarten mit 0 Wölfen: Die Hirsche wachsen, bis die Weide grau wird. Wer hält die Weide gesund?'
      }
    },
    {
      id: 2, title: 'Adler und Laufvogel', short: 'Ein Jäger aus der Luft, eine Beute am Boden.',
      species: ['laufvogel', 'inseladler'], show: ['inseladler', 'laufvogel'],
      info: {
        lead: 'Wetter, Nahrung und ein Jäger mit Revier',
        chain: [['🫐', 'Früchte und Insekten'], [IMG.laufvogel, 'Laufvogel'], [IMG.inseladler, 'Inseladler']],
        curve: [
          { label: 'Laufvögel', color: COLOR.laufvogel, base: 0.55, amp: 0.2, shift: 0, wobble: 0.12 },
          { label: 'Adler', color: COLOR.inseladler, base: 0.2, amp: 0.06, shift: 0.18 }
        ],
        curveNote: 'Die Vögel schwanken mit dem Wetter, die Adler bleiben wenige.',
        facts: [
          ['❄️', 'Der Winter ist der Engpass:', 'keine Früchte, kaum Insekten. Harte Winter (blau im Diagramm) kosten viele Vögel.'],
          ['🌟', 'Mastjahre', '(gelb) bringen Früchte im Überfluss: Danach wächst der Vogelbestand.'],
          ['🦅', 'Adler folgen mit Verzögerung:', 'viele Vögel → mehr Küken im Horst → mehr Adler.'],
          ['🏔️', 'Reviere begrenzen:', 'Jedes Adlerpaar hat ein großes Revier. Deshalb gibt es nur wenige Adler.'],
          ['🌳', 'Deckung:', 'Unter Bäumen sieht der Adler schlecht, im offenen Grasland sind die Vögel gefährdet.']
        ],
        see: ['Diagramm: gelbe und blaue Streifen neben die Vogelkurve halten', 'Vergleich mit Szenario 1: Wer bestimmt hier, Räuber oder Wetter?'],
        try: 'Einen Adler antippen und ihm folgen: Wo jagt er, wo hat er seinen Horst?'
      }
    },
    {
      id: 3, title: 'Alle vier', short: 'Das ganze Ökosystem der Insel: zwei Räuber, zwei Beutearten.',
      species: NATIVE, show: ['inselwolf', 'zwerghirsch', 'inseladler', 'laufvogel'],
      info: {
        lead: 'Nahrungsnetz',
        web: true,
        chain: [['🌿', 'Gras und Laub'], [IMG.zwerghirsch, 'Zwerghirsch'], [IMG.inselwolf, 'Inselwolf']],
        chain2: [['🫐', 'Früchte und Insekten'], [IMG.laufvogel, 'Laufvogel'], [IMG.inseladler, 'Inseladler']],
        facts: [
          ['🍽️', 'Getrennte Nischen:', 'Hirsche fressen Gras und Laub, Vögel Früchte und Insekten. Die beiden Pflanzenfresser kommen sich kaum in die Quere.'],
          ['↔️', 'Querverbindungen:', 'Wölfe nehmen Vögel nur nebenbei, Adler selten ein junges Kalb.'],
          ['🍖', 'Aas:', 'Ein Wolfsrudel bewacht seinen Riss, Adler kommen nicht heran.'],
          ['⚖️', 'Was die Insel stabil hält:', 'Reviere, Kälberbremse bei knapper Weide und Räuber, die vor allem jagen, was häufig ist.']
        ],
        see: ['Tabelle „Todesursachen“: Wer stirbt woran?', 'Kurven mit Szenario 1 und 2 vergleichen: Was ändert sich, wenn alle zusammen leben?'],
        try: 'Eine Art im Startbestand auf 0 setzen. Welche anderen Arten merken es?'
      }
    },
    {
      id: 4, title: 'Alle vier + Menschen', short: 'Siedler landen und bringen Schafe, Hunde und Ratten mit.',
      species: NATIVE, humans: true, show: ['mensch', 'schaf', 'zwerghirsch', 'inselwolf'],
      info: {
        lead: 'Eingeschleppte Arten',
        chain: [['⛵', 'Landung'], [IMG.schaf, 'Schafweide'], ['🐑', 'Schafe brechen aus']],
        curve: [
          { label: 'Hirsche', color: COLOR.zwerghirsch, base: 0.55, amp: 0.1, shift: 0, drop: 0.3 },
          { label: 'Schafe', color: COLOR.schaf, base: 0.04, amp: 0, shift: 0, rise: 0.55 }
        ],
        curveNote: 'Nach dem Ausbruch: Schafe nehmen zu, Hirsche werden weniger.',
        facts: [
          ['🃏', 'Eingriffe als Karten:', 'Landung, Dorf, Acker, Schafweide, Hunde, Jagd, Sammeln, Ratten. Mit − lässt sich eine Karte zurücknehmen, die Folgen bleiben.'],
          ['🐑', 'Schafe büchsen aus:', 'etwa 4 Jahre nach der Weide. Sie fressen das Gras kürzer als Hirsche und bekommen noch Lämmer, wo Hirsche keine Kälber mehr haben.'],
          ['🐺', 'Mehr Schafe, mehr Wölfe:', 'Die Wölfe vermehren sich an den Schafen und reißen dann auch mehr Hirsche.'],
          ['🐀', 'Ratten', 'plündern die Nester der Laufvögel am Boden.'],
          ['🪓', 'Rodung', 'nimmt Wald, Laub und Deckung. Er kommt nicht zurück.']
        ],
        see: ['Chronik unter der Kartenleiste: Was passiert von selbst?', 'Diagramme „Nahrung“ und „Zustand der Pflanzen“ messen an der unberührten Insel'],
        try: 'Gleiche Karte, anderer Zeitpunkt: Was passiert, wenn die Schafe in einem harten Winter ausbrechen?'
      }
    }
  ];
  var BY_ID = {};
  SCENARIOS.forEach(function (s) { BY_ID[s.id] = s; });

  var shared = [];          // vom Raum freigegeben
  var typesOn = false;      // Inseltypen zur Auswahl (sonst nur die ausgewogene Insel)
  var known = null;         // Schueler: schon gesehene Freigaben (fuer „Neu“)
  var current = null;       // laufendes Szenario
  var worldReady = false;

  // ---------------------------------------------------------------- Bauen
  doc.body.classList.add('room', TEACHER ? 'room-teacher' : 'room-student', 'idle');

  // Was im Raum nicht gebraucht wird: eigene Inseln, Seed, Groesse, Empfehlung
  ['seed', 'size'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.closest('.field').hidden = true; });
  ['newWorld', 'status', 'defaults', 'csv'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.hidden = true; });

  var bar = doc.querySelector('.bar');
  var h1 = bar.querySelector('h1');
  var btn = doc.createElement('button');
  btn.type = 'button';
  btn.id = 'scnOpen';
  btn.className = 'scn-open';
  btn.innerHTML = '<span class="scn-grid" aria-hidden="true"></span>Szenarien';
  var now = doc.createElement('span');
  now.className = 'scn-now';
  h1.after(btn, now);

  var layer = doc.createElement('div');
  layer.className = 'scn-layer';
  layer.hidden = true;
  layer.innerHTML =
    '<div class="scn-box" role="dialog" aria-label="Szenarien">' +
      '<div class="scn-head"><h2>Szenarien</h2>' +
        '<p class="scn-sub"></p><span class="spacer"></span>' +
        (TEACHER ? '<button type="button" class="scn-types" aria-pressed="false" title="Ausgewogene, Gras-, Wald- und Felsinsel: Die Klasse wählt oben unter „Typ“">' +
          '<span class="scn-switch" aria-hidden="true"></span>Inseltypen zur Auswahl</button>' : '') +
        '<button type="button" class="scn-close" title="Schließen (Esc)">✕</button></div>' +
      '<div class="scn-list"></div>' +
    '</div>';
  doc.querySelector('.layout').appendChild(layer);
  var list = layer.querySelector('.scn-list');
  var typesBtn = layer.querySelector('.scn-types');
  var typeField = doc.getElementById('type');
  typeField.hidden = true;

  // Klasse, solange nichts freigegeben ist: ein Satz auf der leeren Insel
  var hint = doc.createElement('div');
  hint.className = 'scn-hint';
  hint.hidden = true;
  hint.textContent = 'Warte auf deine Lehrkraft. Sie gibt gleich ein Szenario frei.';
  doc.querySelector('.stage').appendChild(hint);

  var info = doc.createElement('div');
  info.className = 'scn-info';
  info.hidden = true;
  info.setAttribute('role', 'dialog');
  info.setAttribute('aria-modal', 'true');
  doc.body.appendChild(info);

  var toastEl = doc.createElement('div');
  toastEl.className = 'scn-toast';
  toastEl.hidden = true;
  doc.body.appendChild(toastEl);
  var toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { toastEl.hidden = true; }, 3800);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function isShared(id) { return shared.indexOf(id) >= 0; }

  function pic(p, cls) {
    return p.indexOf('assets/') === 0
      ? '<img class="' + cls + '" src="' + p + '" alt="" draggable="false">'
      : '<span class="' + cls + ' emoji">' + p + '</span>';
  }

  function teacherTile(s) {
    var on = isShared(s.id);
    var animals = s.show.map(function (k, i) {
      return '<img class="scn-ani n' + s.show.length + ' p' + i + ' k-' + k + '" src="' + IMG[k] + '" alt="" draggable="false">';
    }).join('');
    return '<article class="scn-tile' + (on ? ' is-shared' : '') + (current === s ? ' is-current' : '') + '" data-id="' + s.id + '">' +
      '<div class="scn-shot" style="background-image:url(assets/szenario_' + s.id + '.jpg)">' + animals +
        '<span class="scn-num">' + s.id + '</span>' +
        '<span class="scn-badge">' + (current === s ? 'läuft bei dir' : '') + '</span>' +
        '<button type="button" class="scn-i" data-act="info" title="Infos für den Unterricht" aria-label="Infos zu ' + esc(s.title) + '">i</button>' +
      '</div>' +
      '<div class="scn-body">' +
        '<h3>' + esc(s.title) + '</h3>' +
        '<p>' + esc(s.short) + '</p>' +
        '<div class="scn-actions">' +
          '<button type="button" class="primary" data-act="start">▶ Starten</button>' +
          (on
            ? '<span class="scn-on">✓ Geteilt</span><button type="button" class="scn-take" data-act="unshare">Entziehen</button>'
            : '<button type="button" data-act="share">Mit Klasse teilen</button>') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function studentCard(s) {
    var fresh = known && known.indexOf(s.id) < 0;
    return '<button type="button" class="scn-card' + (current === s ? ' is-current' : '') + (fresh ? ' is-new' : '') + '" data-id="' + s.id + '" data-act="start">' +
      '<span>Szenario</span><b>' + s.id + '</b>' + (current === s ? '<small>läuft</small>' : '') + '</button>';
  }

  function render() {
    var sub = layer.querySelector('.scn-sub');
    if (TEACHER) {
      sub.textContent = shared.length
        ? 'Die Klasse sieht ' + (shared.length === 1 ? 'Szenario ' + shared[0] : 'die Szenarien ' + shared.slice().sort().join(', '))
        : 'Starte ein Szenario für dich oder teile es mit der Klasse.';
      list.className = 'scn-list scn-tiles';
      list.innerHTML = SCENARIOS.map(teacherTile).join('');
    } else {
      var mine = SCENARIOS.filter(function (s) { return isShared(s.id); });
      sub.textContent = '';
      list.className = 'scn-list scn-cards';
      list.innerHTML = mine.length
        ? mine.map(studentCard).join('')
        : '<p class="scn-wait">Deine Lehrkraft hat noch kein Szenario freigegeben.</p>';
    }
    layer.querySelector('.scn-close').hidden = !current;
    if (typesBtn) typesBtn.setAttribute('aria-pressed', String(typesOn));
    typeField.hidden = !typesOn;
    hint.hidden = TEACHER || !worldReady || !!current || shared.length > 0 || !layer.hidden;
    now.textContent = current ? (TEACHER ? current.id + ' · ' + current.title : 'Szenario ' + current.id) : '';
    btn.classList.toggle('has-new', !TEACHER && !!known && shared.some(function (id) { return known.indexOf(id) < 0; }));
  }

  function openChooser(open) {
    layer.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    render();
    if (open) {
      // Was man gesehen hat, ist nicht mehr neu
      if (!TEACHER) global.setTimeout(function () { known = shared.slice(); btn.classList.remove('has-new'); }, 1200);
    }
  }

  // ---------------------------------------------------------------- Simulation
  function zeros() { var o = {}; NATIVE.forEach(function (id) { o[id] = 0; }); return o; }

  function idle() {
    current = null;
    BT.app.setRunning(false);
    BT.app.restartWith(zeros());
    doc.body.classList.add('idle');
    doc.body.classList.remove('humans');
    render();
  }

  var snaps = {};           // Stand je Szenario: man wechselt, vergleicht und macht dort weiter (alles pausiert)
  var DEFAULT_SPEED = 38;

  function start(s) {
    if (!worldReady) return;
    if (current === s) { openChooser(false); return; }
    if (current) snaps[current.id] = BT.app.snapshot();
    current = s;
    BT.app.setRunning(false);
    if (snaps[s.id]) BT.app.restore(snaps[s.id]);
    else fresh(s);
    // Der Startbestand im Neustart-Fenster: nur die Arten des Szenarios
    doc.querySelectorAll('#startInputs input[data-id]').forEach(function (inp) {
      inp.closest('.sv').hidden = s.species.indexOf(inp.dataset.id) < 0;
    });
    doc.body.classList.remove('idle');
    doc.body.classList.toggle('humans', !!s.humans);
    BT.app.fold('menschen', !!s.humans);
    global.dispatchEvent(new Event('resize'));
    openChooser(false);
    render();
  }

  /** Szenario von vorn auf der aktuellen Insel */
  function fresh(s) {
    var st = {};
    NATIVE.forEach(function (id) { if (s.species.indexOf(id) < 0) st[id] = 0; });
    BT.app.cardPause(2);
    BT.app.restartWith(st);
    BT.app.speed(DEFAULT_SPEED);
    BT.app.camera.reset();
  }

  // ---------------------------------------------------------------- Infos (Lehrkraft)
  /** Skizze eines Verlaufs ueber 90 Jahre (Jahresmittel), als SVG. */
  function infoChart(series) {
    var W = 300, H = 110, pad = 6, n = 90;
    var paths = series.map(function (r) {
      var pts = [];
      for (var t = 0; t <= n; t++) {
        var x = t / n, v;
        if (r.drop != null || r.rise != null) {
          var k = Math.max(0, Math.min(1, (x - 0.35) / 0.35));
          v = r.base + (r.rise || 0) * k - (r.drop || 0) * k + r.amp * Math.sin(x * 2 * Math.PI * 3.4) * (1 - k * 0.5);
        } else {
          v = r.base + r.amp * Math.sin((x * 4.6 - r.shift) * 2 * Math.PI) + (r.wobble || 0) * Math.sin(x * 37) * 0.5;
        }
        pts.push((pad + x * (W - 2 * pad)).toFixed(1) + ',' + (H - pad - v * (H - 2 * pad)).toFixed(1));
      }
      return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + r.color + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    }).join('');
    var legend = series.map(function (r) { return '<span><i style="background:' + r.color + '"></i>' + esc(r.label) + '</span>'; }).join('');
    return '<figure class="scn-curve"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="currentColor" stroke-opacity=".3"/>' + paths + '</svg>' +
      '<figcaption><span class="scn-leg">' + legend + '</span><span class="scn-axis">Jahre (Jahresmittel) →</span></figcaption></figure>';
  }

  function chainHTML(chain) {
    return '<div class="scn-chain">' + chain.map(function (c, i) {
      return (i ? '<span class="scn-arrow" aria-hidden="true">→</span>' : '') +
        '<span class="scn-link">' + pic(c[0], 'scn-chain-img') + '<small>' + esc(c[1]) + '</small></span>';
    }).join('') + '</div>';
  }

  function openInfo(s) {
    var I = s.info;
    info.innerHTML =
      '<div class="scn-info-box">' +
        '<button type="button" class="scn-info-x" title="Schließen (Esc)">✕</button>' +
        '<p class="scn-kicker">Szenario ' + s.id + ' · ' + esc(s.title) + '</p>' +
        '<h2>' + esc(I.lead) + '</h2>' +
        '<div class="scn-info-top">' +
          '<div>' + chainHTML(I.chain) + (I.chain2 ? chainHTML(I.chain2) : '') +
            (I.chain2 ? '<p class="scn-note">Zwei Ketten, über Querverbindungen verknüpft.</p>' : '') + '</div>' +
          (I.curve ? '<div>' + infoChart(I.curve) + '<p class="scn-note">' + esc(I.curveNote) + '</p></div>' : '') +
        '</div>' +
        '<ul class="scn-facts">' + I.facts.map(function (f) {
          return '<li><span class="scn-ico" aria-hidden="true">' + f[0] + '</span><span><b>' + esc(f[1]) + '</b> ' + esc(f[2]) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="scn-info-foot">' +
          '<div><h3>Hinschauen</h3><ul>' + I.see.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
          '<div><h3>Ausprobieren</h3><p>' + esc(I.try) + '</p></div>' +
        '</div>' +
      '</div>';
    info.hidden = false;
    info.querySelector('.scn-info-x').focus();
  }

  function closeInfo() { info.hidden = true; }

  // ---------------------------------------------------------------- Bedienung
  btn.addEventListener('click', function () { openChooser(layer.hidden); });
  if (typesBtn) typesBtn.addEventListener('click', function () {
    setTypes(!typesOn);
    send({ type: 'bon:types', on: typesOn });
  });

  function setTypes(on) {
    if (on === typesOn) return;
    typesOn = on;
    render();
    // Ausgeschaltet: alle zurueck auf die ausgewogene Insel
    if (!on && BT.app.world && BT.app.world.type !== BT.CONFIG.type) {
      BT.app.setType(BT.CONFIG.type);
      if (!TEACHER) toast('Deine Lehrkraft hat die Inseltypen ausgeschaltet.');
    } else if (on && !TEACHER) toast('Neu: Oben unter „Typ“ kannst du die Insel wechseln.');
  }
  layer.querySelector('.scn-close').addEventListener('click', function () { openChooser(false); });
  layer.addEventListener('click', function (e) {
    if (e.target === layer && current) { openChooser(false); return; }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var s = BY_ID[+b.closest('[data-id]').dataset.id];
    var act = b.dataset.act;
    if (act === 'start') start(s);
    else if (act === 'info') openInfo(s);
    else if (act === 'share' || act === 'unshare') {
      var on = act === 'share';
      shared = shared.filter(function (id) { return id !== s.id; });
      if (on) shared.push(s.id);
      render();
      send({ type: 'bon:share', id: s.id, on: on });
    }
  });
  info.addEventListener('click', function (e) {
    if (e.target === info || e.target.closest('.scn-info-x')) closeInfo();
  });
  // vor app.js: Esc schliesst zuerst Infos und Auswahl
  global.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!info.hidden) { closeInfo(); e.stopImmediatePropagation(); }
    else if (!layer.hidden && current) { openChooser(false); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- Bruecke zum Raum
  function send(msg) {
    if (global.parent === global) return;
    try { global.parent.postMessage(msg, global.location.origin); } catch (e) { /* kein Rahmen */ }
  }

  global.addEventListener('message', function (e) {
    if (e.origin !== global.location.origin || !e.data || e.data.type !== 'bon:cmd') return;
    if (typeof e.data.types === 'boolean') setTypes(e.data.types);
    if (!Array.isArray(e.data.shared)) return;
    var next = e.data.shared.map(Number).filter(function (id) { return BY_ID[id]; });
    var added = next.filter(function (id) { return shared.indexOf(id) < 0; });
    shared = next;
    if (TEACHER) { if (!layer.hidden) render(); return; }

    if (known === null) known = current ? shared.slice() : [];
    // Entzogen, waehrend es laeuft: zurueck zur leeren Insel
    Object.keys(snaps).forEach(function (id) { if (!isShared(+id)) delete snaps[id]; });
    if (current && !isShared(current.id)) {
      idle();
      openChooser(true);
      toast('Deine Lehrkraft hat das Szenario beendet.');
      return;
    }
    if (added.length) {
      if (!current) openChooser(true);
      else toast(added.length === 1 ? 'Neues Szenario verfügbar: Szenario ' + added[0] : 'Neue Szenarien verfügbar');
    }
    render();
  });

  // ---------------------------------------------------------------- Start
  BT.app.onWorld = function () {
    var first = !worldReady;
    worldReady = true;
    if (!first) {
      // Anderer Inseltyp: die Staende gehoeren zur alten Insel
      snaps = {};
      if (current) fresh(current); else idle();
      return;
    }
    if (first) {
      idle();
      // Lehrkraft: gleich die Auswahl. Klasse: erst, wenn etwas geteilt ist.
      if (TEACHER || shared.length) openChooser(true);
      send({ type: 'bon:ready' });
    }
  };

  BT.room = { scenarios: SCENARIOS, start: function (id) { start(BY_ID[id]); }, idle: idle, open: openChooser };
})(typeof window !== 'undefined' ? window : globalThis);
