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

  // ---------------------------------------------------------------- Bilder
  /*
   * Kleine Skizzen statt Bildschirmfotos (wie die Einfuehrung von Wild Clusters): ein Bild sagt,
   * WAS man an dieser Stelle sieht, die Liste darunter, was die Knoepfe tun. Alle 300 x 110,
   * Farben der Arten wie in den Diagrammen.
   */
  var C = { hirsch: '#e0653a', vogel: '#3d8de0', wolf: '#9b86e8', adler: '#d4a020', schaf: '#c46bd6',
    ratte: '#8d7b6b', hund: '#a0522d', gras: '#4caf6a', laub: '#2e7d4f', frucht: '#d6456a', ink: '#10354b', hi: '#f2c94c' };
  function svg(body) {
    return '<svg class="tour-art" viewBox="0 0 300 110" aria-hidden="true">' + body + '</svg>';
  }
  function wave(x0, x1, y, amp, per, shift, color, w) {
    var pts = [];
    for (var x = x0; x <= x1; x += 4) pts.push(x + ',' + (y - amp * Math.sin((x - x0) / per * 2 * Math.PI - shift)).toFixed(1));
    return '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="' + (w || 3) + '" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  function chip(x, y, w, label, on) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="20" rx="5" fill="' + (on ? '#2a7f86' : '#1a4a66') + '" stroke="' + (on ? '#52c2c0' : '#2d6684') + '"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 14) + '" text-anchor="middle" font-size="11" fill="#e8f1f4">' + label + '</text>';
  }
  function dot(x, y, c, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 4) + '" fill="' + c + '" stroke="#fff" stroke-width="1.2"/>'; }
  function arrow(x1, y1, x2, y2, c) {
    var a = Math.atan2(y2 - y1, x2 - x1), h = 6;
    return '<path d="M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2 + ' M' + (x2 - h * Math.cos(a - 0.5)).toFixed(1) + ',' + (y2 - h * Math.sin(a - 0.5)).toFixed(1) +
      ' L' + x2 + ',' + y2 + ' L' + (x2 - h * Math.cos(a + 0.5)).toFixed(1) + ',' + (y2 - h * Math.sin(a + 0.5)).toFixed(1) + '" fill="none" stroke="' + (c || C.ink) + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function frame() { return '<rect x="1" y="1" width="298" height="108" rx="10" fill="#e9f1ee" stroke="#cfdcd6"/>'; }
  function island(x, y, s, wood, rock) {
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')">' +
      '<path d="M-60,4 C-62,-26 -20,-40 14,-36 C48,-32 66,-14 62,8 C58,30 22,40 -8,38 C-40,36 -58,26 -60,4 Z" fill="#e8d9a8"/>' +
      '<path d="M-54,4 C-56,-22 -18,-34 14,-30 C44,-26 58,-12 55,8 C52,26 20,33 -8,32 C-36,30 -52,22 -54,4 Z" fill="#a9c76c"/>' +
      (wood ? '<path d="M-44,0 C-46,-16 -26,-24 -10,-20 C2,-16 0,-2 -8,6 C-18,14 -40,14 -44,0 Z" fill="#4f8a4a"/>' : '') +
      (rock ? '<path d="M14,-14 L30,-28 L46,-10 L38,4 L18,2 Z" fill="#8a8f93"/>' : '') + '</g>';
  }

  var ART = {
    szenarien: svg(frame() +
      [[C.wolf, C.hirsch], [C.adler, C.vogel], [C.wolf, C.vogel], [C.schaf, C.hirsch]].map(function (p, i) {
        var x = 12 + i * 71;
        return '<rect x="' + x + '" y="12" width="64" height="86" rx="8" fill="#10354b"/>' +
          '<rect x="' + x + '" y="12" width="64" height="44" rx="8" fill="#6f9f5c"/>' +
          dot(x + 20, 38, p[0], 7) + dot(x + 42, 40, p[1], 7) +
          '<text x="' + (x + 8) + '" y="26" font-size="11" font-weight="700" fill="#fff">' + (i + 1) + '</text>' +
          '<rect x="' + (x + 6) + '" y="64" width="52" height="5" rx="2" fill="#e8f1f4" opacity=".7"/>' +
          '<rect x="' + (x + 6) + '" y="76" width="30" height="14" rx="4" fill="#2a7f86"/>' +
          '<text x="' + (x + 21) + '" y="86.5" text-anchor="middle" font-size="9" fill="#fff">▶</text>';
      }).join('')),
    teilen: svg(frame() +
      '<rect x="18" y="20" width="78" height="56" rx="6" fill="#10354b"/><rect x="24" y="26" width="66" height="30" rx="3" fill="#6f9f5c"/>' +
      '<rect x="30" y="61" width="54" height="10" rx="3" fill="#2a7f86"/>' +
      '<text x="57" y="92" text-anchor="middle" font-size="11" fill="#45535a">du</text>' +
      arrow(104, 48, 150, 28) + arrow(104, 48, 150, 48) + arrow(104, 48, 150, 68) +
      [14, 36, 58].map(function (y) {
        return '<rect x="158" y="' + y + '" width="40" height="28" rx="4" fill="#10354b"/>' +
          '<text x="178" y="' + (y + 19) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#52c2c0">1</text>';
      }).join('') +
      '<text x="250" y="48" text-anchor="middle" font-size="11" fill="#45535a">Klasse sieht</text>' +
      '<text x="250" y="63" text-anchor="middle" font-size="11" fill="#45535a">„Szenario 1“</text>'),
    typen: svg(frame() +
      [['ausgewogen', 1, 1], ['Gras', 0, 0], ['Wald', 2, 0], ['Fels', 0, 2]].map(function (t, i) {
        var x = 40 + i * 73;
        var g = '<g transform="translate(' + x + ',48) scale(.5)">' +
          '<path d="M-60,4 C-62,-26 -20,-40 14,-36 C48,-32 66,-14 62,8 C58,30 22,40 -8,38 C-40,36 -58,26 -60,4 Z" fill="#e8d9a8"/>' +
          '<path d="M-54,4 C-56,-22 -18,-34 14,-30 C44,-26 58,-12 55,8 C52,26 20,33 -8,32 C-36,30 -52,22 -54,4 Z" fill="' + (t[2] === 2 ? '#9a9a90' : '#a9c76c') + '"/>' +
          (t[1] ? '<path d="M-48,4 C-50,-18 -24,-28 ' + (t[1] === 2 ? '30,-24 C50,-10 50,16 20,26 C-10,32 -46,22 -48,4 Z' : '-8,-22 C4,-16 2,0 -8,8 C-20,16 -44,16 -48,4 Z') + '" fill="#4f8a4a"/>' : '') +
          (t[2] ? '<path d="M14,-16 L30,-30 L46,-12 L38,4 L18,2 Z" fill="#6f7478"/>' : '') + '</g>';
        return g + '<text x="' + x + '" y="98" text-anchor="middle" font-size="11" fill="#45535a">' + t[0] + '</text>';
      }).join('')),
    insel: svg('<rect x="1" y="1" width="298" height="108" rx="10" fill="#2f6f8f"/>' + island(110, 56, 1.25, true, true) +
      dot(80, 60, C.hirsch) + dot(88, 66, C.hirsch) + dot(96, 58, C.hirsch) + dot(128, 72, C.wolf) + dot(136, 70, C.wolf) +
      '<circle cx="132" cy="71" r="11" fill="none" stroke="' + C.hi + '" stroke-width="2.5"/>' +
      // Geste: ziehen
      '<g transform="translate(222,30)"><circle r="7" fill="#fff" opacity=".9"/>' + arrow(-12, 0, -26, 0, '#fff') + arrow(12, 0, 26, 0, '#fff') + '</g>' +
      // Geste: zwei Finger
      '<g transform="translate(222,76)"><circle cx="-8" cy="6" r="6" fill="#fff" opacity=".9"/><circle cx="8" cy="-6" r="6" fill="#fff" opacity=".9"/>' +
        arrow(-14, 12, -24, 22, '#fff') + arrow(14, -12, 24, -22, '#fff') + '</g>'),
    zeit: svg(frame() +
      '<text x="14" y="26" font-size="14" font-weight="700" fill="' + C.ink + '">Jahr 3 · Sommer</text>' +
      chip(14, 38, 58, '▶ Start', true) + chip(78, 38, 46, '+1 Tag') + chip(130, 38, 68, '⏩ 5 Jahre') + chip(206, 8, 84, '↻ Neustarten') +
      '<line x1="14" y1="84" x2="200" y2="84" stroke="#9fb8c6" stroke-width="4" stroke-linecap="round"/>' +
      '<line x1="14" y1="84" x2="96" y2="84" stroke="#2a7f86" stroke-width="4" stroke-linecap="round"/><circle cx="96" cy="84" r="7" fill="#2a7f86"/>' +
      '<text x="210" y="88" font-size="11" fill="#45535a">Tempo</text>' +
      '<text x="250" y="66" font-size="18">🌸☀️</text><text x="250" y="92" font-size="18">🍂❄️</text>'),
    bestand: svg(frame() +
      [[C.hirsch, 'Zwerghirsche', '300', 1], [C.wolf, 'Inselwölfe', '40', 0]].map(function (t, i) {
        var x = 10 + i * 92;
        return '<rect x="' + x + '" y="22" width="86" height="56" rx="7" fill="#153f58" stroke="' + (t[3] ? '#52c2c0' : '#153f58') + '" stroke-width="2"/>' +
          dot(x + 14, 38, t[0], 6) + '<text x="' + (x + 26) + '" y="42" font-size="9" fill="#e8f1f4">' + t[1] + '</text>' +
          '<text x="' + (x + 10) + '" y="68" font-size="18" font-weight="700" fill="#e8f1f4">' + t[2] + '</text>';
      }).join('') +
      arrow(196, 50, 214, 50) + island(256, 54, 0.62, true, false) +
      dot(236, 56, C.hirsch, 4.5) + dot(250, 46, C.hirsch, 4.5) + dot(262, 62, C.hirsch, 4.5) + dot(274, 50, C.hirsch, 4.5) +
      '<circle cx="250" cy="46" r="8" fill="none" stroke="' + C.hi + '" stroke-width="2"/><circle cx="262" cy="62" r="8" fill="none" stroke="' + C.hi + '" stroke-width="2"/>'),
    tiere: function (humans) {
      return svg(frame() + '<line x1="14" y1="96" x2="286" y2="96" stroke="#9fb8c6"/>' +
        wave(14, 286, 52, 22, 90, 0, C.hirsch) + wave(14, 286, 76, 12, 90, 1.3, C.wolf) +
        (humans ? '<polyline points="150,92 190,82 230,62 286,40" fill="none" stroke="' + C.schaf + '" stroke-width="3" stroke-linecap="round"/>' +
          '<polyline points="170,94 210,90 250,84 286,80" fill="none" stroke="' + C.hund + '" stroke-width="3" stroke-linecap="round"/>' : '') +
        '<text x="18" y="18" font-size="10" fill="' + C.hirsch + '">● Pflanzenfresser</text><text x' + '="120" y="18" font-size="10" fill="' + C.wolf + '">● Räuber</text>' +
        (humans ? '<text x="190" y="18" font-size="10" fill="' + C.schaf + '">● Schafe</text><text x="245" y="18" font-size="10" fill="' + C.hund + '">● Hunde</text>' : ''));
    },
    pflanzen: svg(frame() +
      '<line x1="14" y1="30" x2="286" y2="30" stroke="#45535a" stroke-dasharray="4 4"/><text x="18" y="24" font-size="10" fill="#45535a">100 % = unberührte Insel</text>' +
      '<polyline points="14,32 80,34 120,40 160,56 200,62 240,58 286,52" fill="none" stroke="' + C.gras + '" stroke-width="3" stroke-linecap="round"/>' +
      '<polyline points="14,31 90,32 140,36 190,44 240,46 286,44" fill="none" stroke="' + C.laub + '" stroke-width="3" stroke-linecap="round"/>' +
      wave(14, 286, 74, 10, 68, 0, C.frucht, 2.4) +
      '<line x1="14" y1="96" x2="286" y2="96" stroke="#9fb8c6"/>' +
      '<text x="200" y="88" font-size="10" fill="#45535a">sinkt = abgefressen</text>'),
    tod: svg(frame() +
      ['Hunger', 'Alter', 'Wolf', 'Adler'].map(function (h, i) { return '<text x="' + (118 + i * 44) + '" y="22" text-anchor="middle" font-size="10" fill="#45535a">' + h + '</text>'; }).join('') +
      [[C.hirsch, 'Hirsche', [14, 22, 30, 4]], [C.wolf, 'Wölfe', [18, 26, 0, 0]], [C.vogel, 'Laufvögel', [10, 12, 6, 20]]].map(function (r, j) {
        var y = 40 + j * 24;
        return dot(18, y - 4, r[0], 4.5) + '<text x="28" y="' + y + '" font-size="11" fill="' + C.ink + '">' + r[1] + '</text>' +
          r[2].map(function (v, i) { return '<rect x="' + (98 + i * 44) + '" y="' + (y - 10) + '" width="' + v + '" height="12" rx="2" fill="' + r[0] + '" opacity=".8"/>'; }).join('');
      }).join('')),
    gross: svg(frame() +
      '<rect x="16" y="30" width="56" height="44" rx="4" fill="#fff" stroke="#cfdcd6"/>' + wave(20, 68, 52, 8, 30, 0, C.hirsch, 2) +
      arrow(82, 52, 112, 52) +
      '<rect x="120" y="10" width="166" height="90" rx="6" fill="#fff" stroke="#cfdcd6"/>' +
      wave(126, 280, 30, 10, 60, 0, C.hirsch, 2.4) + wave(126, 280, 56, 8, 60, 1.2, C.wolf, 2.4) + wave(126, 280, 82, 6, 50, 0, C.gras, 2.4)),
    karten: svg(frame() +
      [['⛵', 'Landung'], ['🐑', 'Schafweide'], ['🐀', 'Ratten']].map(function (c, i) {
        var x = 14 + i * 94;
        return '<rect x="' + x + '" y="10" width="84" height="88" rx="8" fill="#1a4a66" stroke="' + (i ? '#2d6684' : C.hi) + '" stroke-width="2"/>' +
          '<text x="' + (x + 42) + '" y="44" text-anchor="middle" font-size="24">' + c[0] + '</text>' +
          '<text x="' + (x + 42) + '" y="62" text-anchor="middle" font-size="10" fill="#e8f1f4">' + c[1] + '</text>' +
          '<text x="' + (x + 14) + '" y="86" text-anchor="middle" font-size="14" fill="#e8f1f4">−</text>' +
          '<text x="' + (x + 42) + '" y="86" text-anchor="middle" font-size="12" font-weight="700" fill="#e8f1f4">' + (i ? 0 : 1) + '</text>' +
          '<text x="' + (x + 70) + '" y="86" text-anchor="middle" font-size="14" fill="#e8f1f4">+</text>';
      }).join('')),
    zahlen: svg(frame() +
      [['🏠', '6', 'Häuser'], ['🌾', '2', 'Äcker'], ['🐑', '35', 'Schafe'], ['🪓', '12 %', 'gerodet']].map(function (t, i) {
        var x = 12 + i * 70;
        return '<rect x="' + x + '" y="16" width="64" height="78" rx="7" fill="#fff" stroke="#cfdcd6"/>' +
          '<text x="' + (x + 32) + '" y="42" text-anchor="middle" font-size="20">' + t[0] + '</text>' +
          '<text x="' + (x + 32) + '" y="66" text-anchor="middle" font-size="15" font-weight="700" fill="' + C.ink + '">' + t[1] + '</text>' +
          '<text x="' + (x + 32) + '" y="84" text-anchor="middle" font-size="10" fill="#45535a">' + t[2] + '</text>';
      }).join('')),
    einstellen: svg(frame() + island(60, 56, 0.6, true, true) + arrow(108, 56, 140, 56) + island(214, 56, 0.95, true, false) +
      '<text x="60" y="100" text-anchor="middle" font-size="10" fill="#45535a">Seed 482917</text>' +
      '<text x="214" y="100" text-anchor="middle" font-size="10" fill="#45535a">neue Insel, größer</text>' +
      '<text x="124" y="44" text-anchor="middle" font-size="16">🎲</text>'),
    zurueck: svg(frame() +
      [1, 2, 3, 4].map(function (n, i) {
        var x = 20 + (i % 2) * 52, y = 12 + Math.floor(i / 2) * 46;
        return '<rect x="' + x + '" y="' + y + '" width="46" height="40" rx="6" fill="#10354b" stroke="' + (n === 1 ? '#52c2c0' : '#2d6684') + '" stroke-width="2"/>' +
          '<text x="' + (x + 23) + '" y="' + (y + 27) + '" text-anchor="middle" font-size="17" font-weight="700" fill="#52c2c0">' + n + '</text>';
      }).join('') +
      arrow(136, 55, 176, 55) + arrow(176, 70, 136, 70) +
      '<rect x="190" y="24" width="94" height="62" rx="6" fill="#6f9f5c"/>' + dot(214, 50, C.hirsch) + dot(232, 62, C.wolf) + dot(256, 46, C.hirsch) +
      '<text x="237" y="100" text-anchor="middle" font-size="10" fill="#45535a">Stand bleibt</text>')
  };

  // ---------------------------------------------------------------- Schritte
  /*
   * Jeder Schritt: lead = ein Satz, was man hier sieht; items = [Knopf oder Geste, was er tut];
   * art = Skizze. Knopf-Nachbauten sehen aus wie die echten Knoepfe.
   */
  /** Lehrkraft, Auswahl offen */
  function introSteps() {
    return [
      { id: 'i-szenarien', target: q('.scn-tiles'), place: ['bottom', 'top'], art: ART.szenarien,
        title: 'Vier Szenarien',
        lead: 'Jede Kachel ist ein fertiges Ökosystem auf derselben Insel, vom Räuber-Beute-Paar bis zu den Siedlern.',
        items: [[k('▶ Starten'), 'spielt es bei dir, die Klasse sieht davon nichts'],
          [k('<i>i</i>'), 'Infos für den Unterricht: Nahrungskette, Verlauf, Ideen']] },
      { id: 'i-teilen', target: q('.scn-tile .scn-actions'), art: ART.teilen,
        title: 'Mit der Klasse teilen',
        lead: 'Die Tablets der Klasse sehen nur, was du teilst – als „Szenario 1“, „Szenario 2“ …',
        items: [[k('Mit Klasse teilen'), 'gibt es frei, jedes Tablet rechnet für sich'],
          [k('Entziehen'), 'beendet es auf allen Tablets']] },
      { id: 'i-typen', target: q('.scn-types-wrap'), place: ['bottom', 'left'], art: ART.typen,
        title: 'Inseltypen',
        lead: 'Gleiche Insel, anderer Bewuchs: mehr Gras, mehr Wald oder mehr Fels.',
        items: [[k('Inseltypen zur Auswahl'), 'an: alle wählen oben unter „Typ“, aus: alle auf der ausgewogenen Insel'],
          [k('<i>i</i>'), 'welche Art wo gewinnt, mit Zahlen']],
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
      { id: 'insel', target: q('.stage'), place: ['inside'], art: ART.insel,
        title: 'Die Insel',
        lead: 'Hier leben die Tiere: Sie fressen, jagen, ziehen umher und bekommen Junge.',
        items: [[k('☝ ziehen'), 'Karte verschieben'],
          [k('✌ zwei Finger'), 'oder Mausrad: zoomen'],
          [k('Tier antippen'), 'die Kamera folgt ihm (gelber Ring)']] },
      { id: 'zeit', target: q('.fold[data-fold="zeit"]'), open: 'zeit', art: ART.zeit,
        title: 'Zeit',
        lead: 'Oben stehen Jahr und Jahreszeit. Am Anfang steht die Zeit still.',
        items: [[k('▶ Start'), 'Zeit läuft, nochmal: Pause'],
          [k('+1 Tag') + ' ' + k('⏩ 5 Jahre'), 'ein Stück weiter, ohne zuzusehen'],
          [k('Tempo'), 'wie schnell die Tage vergehen'],
          [k('↻ Neustarten'), 'von vorn, mit anderem Startbestand']] },
      { id: 'bestand', target: q('.fold[data-fold="bestand"]'), open: 'bestand', art: ART.bestand,
        title: 'Bestand',
        lead: 'So viele Tiere jeder Art leben gerade, darunter Jungtiere und Gruppen.',
        items: [[k('Art antippen'), 'alle Tiere dieser Art leuchten auf der Karte'],
          [k('nochmal'), 'Hervorhebung aus']] },
      humans
        ? { id: 'tiere-m', covers: ['tiere', 'tiere-m'], target: charts(0, 2), open: 'verlauf', art: ART.tiere(true),
            title: 'Diagramme: Tiere',
            lead: 'Wie sich die Zahl der Tiere über die Jahre ändert, oben Pflanzenfresser, darunter Räuber.',
            items: [[k('neu'), 'die Tiere der Menschen: <b>Schafe</b> und <b>Ratten</b> (Linie ÷ 20) bei den Pflanzenfressern, <b>Hunde</b> bei den Räubern'],
              [k('Alles') + ' ' + k('10 J'), 'welcher Zeitraum zu sehen ist'],
              [k('Jahresmittel'), 'glättet die Jahreszeiten'],
              [k('Finger aufs Diagramm'), 'Werte an diesem Tag']] }
        : { id: 'tiere', target: charts(0, 2), open: 'verlauf', art: ART.tiere(false),
            title: 'Diagramme: Tiere',
            lead: 'Wie sich die Zahl der Tiere über die Jahre ändert, oben Pflanzenfresser, darunter Räuber.',
            items: [[k('Alles') + ' ' + k('10 J'), 'welcher Zeitraum zu sehen ist'],
              [k('Jahresmittel'), 'glättet die Jahreszeiten, dann sieht man die Wellen'],
              [k('Finger aufs Diagramm'), 'Werte an diesem Tag']] },
      { id: 'pflanzen', target: charts(2, 4), open: 'verlauf', art: ART.pflanzen,
        title: 'Diagramme: Pflanzen',
        lead: 'Wie viel Futter wächst und wie gesund die Pflanzen sind, gemessen an der unberührten Insel (100 %).',
        items: [[k('Nahrung'), 'Gras, Laub, Früchte, Insekten: was die Tiere fressen können'],
          [k('Zustand'), 'sinkt, wenn zu viel gefressen wird – auf der Karte wird es grau']] },
      { id: 'tod', target: function () { var w = doc.querySelector('.deaths-wrap'); return w && [w.previousElementSibling, w]; }, open: 'verlauf', art: ART.tod,
        title: 'Todesursachen',
        lead: 'Woran die Tiere gestorben sind, gezählt seit dem Start.',
        items: [[k('Hunger') + ' ' + k('Alter'), 'zu wenig Futter oder ein langes Leben'],
          [k('Wolf') + ' ' + k('Adler'), 'gefressen – so viel Beute holen die Räuber']] },
      { id: 'gross', target: q('#openBig'), open: 'verlauf', art: ART.gross,
        title: 'Groß ansehen',
        lead: 'In der Leiste sind die Diagramme klein. Groß sieht man Einzelheiten besser, gut auch für den Beamer.',
        items: [[k('⤢ Groß'), 'alle Diagramme groß untereinander'],
          [k('✕ Schließen'), 'oder Esc: zurück zur Insel']] }
    ];
    if (humans) steps.push(
      { id: 'karten', target: q('.fold[data-fold="menschen"]'), open: 'menschen', art: ART.karten,
        title: 'Menschen',
        lead: 'Mit Karten greifen Menschen in die Insel ein: landen, roden, Schafe halten, jagen …',
        items: [[k('+'), 'Karte spielen, bei manchen danach auf die Insel tippen: wohin'],
          [k('−'), 'zurücknehmen – was schon passiert ist, bleibt'],
          [k('Karte antippen'), 'Erklärung mit Bild'],
          [k('Chronik'), 'darunter: was gespielt wurde und was von selbst folgte']] },
      { id: 'menschen-zahlen', target: q('.fold[data-fold="insel"]'), open: 'insel', art: ART.zahlen,
        title: 'Menschen auf der Insel',
        lead: 'Die Zahlen zu den Siedlern: wie viele Häuser, Äcker, Schafe und wie viel Wald gerodet ist.',
        items: [[k('Landung'), 'vorher steht hier noch nichts']] });
    steps.push(
      { id: 'einstellen', target: q('#openIsland'), place: ['bottom', 'right'], art: ART.einstellen,
        title: 'Insel einstellen',
        lead: 'Eine andere Insel ausprobieren: andere Küste, andere Berge, gleiches Szenario.',
        items: [[k('Neue Insel'), 'würfelt eine neue Insel'],
          [k('Seed'), 'die Nummer der Insel – gleiche Nummer, gleiche Insel'],
          [k('Größe') + (doc.getElementById('type').hidden ? '' : ' ' + k('Typ')), 'klein oder groß' + (doc.getElementById('type').hidden ? '' : ', Gras, Wald oder Fels')],
          [k('Lebensräume') + ' ' + k('Karte'), 'zeigt Lebensräume oder Nahrung auf der Karte']],
        warn: 'Eine andere Insel startet das Szenario von vorn.' },
      { id: 'szenarien', target: q('#scnOpen'), place: ['bottom', 'right'], art: ART.zurueck,
        title: 'Szenarien',
        lead: TEACHER ? 'Zurück zur Auswahl, jederzeit.' : 'Zurück zur Auswahl, wenn deine Lehrkraft mehrere freigibt.',
        items: TEACHER
          ? [[k('Szenarien'), 'anderes Szenario starten, teilen oder entziehen'], [k('Stand'), 'jedes Szenario macht dort weiter, wo du warst']]
          : [[k('Szenarien'), 'anderes Szenario wählen'], [k('Stand'), 'jedes Szenario macht dort weiter, wo du warst']] });
    return steps;
  }

  /** Klasse, kein Szenario: der eine Satz, den das ? dann noch sagen kann */
  function waitSteps() {
    var cards = doc.querySelector('.scn-cards .scn-card');
    return [cards
      ? { id: 's-wahl', target: q('.scn-cards'), place: ['bottom', 'top', 'inside'], art: ART.zurueck,
          title: 'Szenario wählen', lead: 'Deine Lehrkraft hat Szenarien freigegeben.',
          items: [[k('Szenario antippen'), 'die Insel füllt sich mit Tieren, die Tour erklärt den Rest']] }
      : { id: 's-wahl', target: q('#scnOpen'), place: ['bottom', 'right'], art: ART.zurueck,
          title: 'Szenarien', lead: 'Hier stehen die Szenarien, sobald deine Lehrkraft eines freigibt.', items: [] }];
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
      (st.art ? '<div class="tour-pic">' + st.art + '</div>' : '') +
      '<h3>' + st.title + '</h3>' +
      '<p class="tour-lead">' + st.lead + '</p>' +
      (st.items && st.items.length ? '<ul class="tour-items">' + st.items.map(function (it) {
        return '<li><span class="tour-btns">' + it[0] + '</span><span>' + it[1] + '</span></li>';
      }).join('') + '</ul>' : '') +
      (st.warn ? '<p class="tour-warn">' + st.warn + '</p>' : '') +
      (st.note && last ? '<p class="tour-note">' + st.note + '</p>' : '') +
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
