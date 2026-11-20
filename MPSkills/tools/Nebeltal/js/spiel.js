/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/spiel.js   ·   Ablauf, Steuerung, Anzeige
   ══════════════════════════════════════════════════════════════
   Sieben Level, jedes auf seiner eigenen Welt (Welt-Nummer = Seed, gleiche
   Nummer = gleiche Landschaft auf jedem Tablet – so kann die Klasse
   schon jetzt gegeneinander spielen, ganz ohne Server):

     1 Im Schneesturm   frei laufen, ganz ohne Hilfe (Polarnacht, kein Höhenmesser)
     2 Bergab-Pfeil     frei laufen, Pfeil unter den Füßen = Gradient
     3 Sprünge          nicht mehr laufen: springen in Pfeilrichtung,
                        Weite = Lernrate × Steilheit (Gradientenabstieg)
     4 Pinguin wiegen   ein Neuron ohne σ schätzt das Gewicht aus der Flosse
     5 Pinguine         ein Neuron mit σ sortiert zwei Arten
     6 Das Nest 1       ein Neuron soll „genau ein Elternteil am Nest“ lernen
                        (XOR) – geht nicht
     7 Das Nest 2       zwei Neuronen, zwei Welten (eigenes Modul js/zwei.js)
   Erklärkarten: Bild aus js/bilder.js + kurze Schritte (introHtml)

   Zustände: menu → intro → play → reveal → result
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // Im Schaufenster (?demo=1) nur im Arbeitsspeicher: die Vorschau startet frisch
  // und überschreibt nicht die Bestwerte, mit denen jemand auf diesem Gerät spielt.
  const DEMO = new URLSearchParams(location.search).has('demo'), MEM = {};
  const LS = DEMO ? {
    get(k) { return k in MEM ? MEM[k] : null; },
    set(k, v) { MEM[k] = String(v); }
  } : {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };

  /* Erklärkarte: Bild aus js/bilder.js (NTBild.scene) + kurze Schritte.
     steps = Sätze neben nummerierten Kreisen, je Schritt EIN Gedanke. */
  const LEVELS = [
    { id: 1, name: 'Im Schneesturm', short: 'Frei suchen – ganz ohne Hilfe',
      mode: 'walk', arrow: false, time: 60, fog: 9, plain: true, physics: false, snow: true,
      lead: 'Ein <b>Sturm</b> zieht auf! Such dir in <b>60 Sekunden</b> einen möglichst tiefen Punkt, um dich zu schützen.',
      steps: [
        'Im Schneetreiben siehst du nur, wo du gerade stehst.',
        'Mit <b>„Hier bleibe ich!“</b> loggst du deinen Platz ein.'],
      outro: 'So geht es einer KI beim Lernen: Sie kennt nur den <b>Fehler an der Stelle, an der sie gerade steht</b>. ' +
             'Frei herumsuchen dauert ewig – sie braucht einen besseren Hinweis.' },
    { id: 2, name: 'Der Bergab-Pfeil', short: 'Ein Pfeil zeigt, wo es bergab geht',
      mode: 'walk', arrow: true, time: 60, fog: 9, plain: true, physics: true, snow: true,
      lead: 'Diesmal bist du vorbereitet: Dein <b>Kompass</b> zeigt dir den Weg bergab.',
      steps: [
        'Der Pfeil unter deinen Füßen zeigt zur <b>nächsten</b> Mulde – je länger, desto steiler.',
        'Du hast <b>60 Sekunden</b>, bevor der Sturm da ist.'],
      outro: 'Der Pfeil ist das, was eine KI ausrechnen kann: <b>In welche Richtung wird mein Fehler kleiner?</b> ' +
             'Er heißt <b>Gradient</b>. Ein neuronales Netz rechnet ihn für jedes seiner Gewichte aus.' },
    { id: 3, name: 'Sprünge', short: 'Lernrate = wie weit du springst',
      mode: 'jump', jumps: 25, fog: 13, plain: true, snow: true, lr: { min: 0.5, max: 60, def: 5, d: 1 },
      lead: 'Der Schnee ist zu tief – du kannst nicht mehr laufen. Du <b>springst</b>, immer in Pfeilrichtung.',
      formula: 'Sprungweite = Lernrate × Steilheit',
      steps: [
        'Die <b>Lernrate</b> bestimmt, wie weit du springst. Der <b>Ring</b> zeigt, wo du landest.',
        'Du hast <b>25 Sprünge</b>.'],
      outro: 'Zu kleine Lernrate: Du kommst kaum voran oder bleibst in der ersten Mulde hängen. ' +
             'Zu große: Du springst über das Tal hinweg oder fliegst raus.' },
    { id: 4, name: 'Wie schwer ist der Pinguin?', short: 'Ein Neuron schätzt das Gewicht aus der Flosse',
      mode: 'jump', walk: true, jumps: 30, fog: 14, auto: true, world: 'model', lr: { min: 0.01, max: 1, def: 0.03, d: 2 },
      lead: '<b>342 echte Pinguine</b> wurden vermessen. Ein <b>Neuron</b> soll aus der Flosse das Gewicht schätzen.',
      steps: [
        'Such das Tal: <b>laufen</b> oder <b>„Training starten“</b> – Achtung mit der Lernrate!'],
      outro: 'Ein Neuron ohne σ ist eine <b>Gerade</b>: Gewicht mal Eingang plus Bias. Seine Landschaft ist eine glatte Schüssel. ' +
             'Ist die Lernrate zu groß, springt man immer weiter darüber hinaus – das Training <b>explodiert</b>.' },
    { id: 5, name: 'Pinguine sortieren', short: 'Ein Neuron lernt zwei Arten zu trennen',
      mode: 'jump', walk: true, jumps: 40, fog: 14, auto: true, world: 'penguin', lr: { min: 0.2, max: 50, def: 1.5, d: 1 },
      lead: 'Adelie- oder Zügelpinguin? Ein Neuron soll es am <b>Schnabel</b> erkennen.',
      steps: [
        'Such das Tal: <b>laufen</b> oder <b>„Training starten“</b> – Achtung mit der Lernrate!'],
      outro: 'Jeder Sprung dreht die Trennlinie ein Stück, bis sie die Pinguine sortiert. ' +
             'Ein großes Netz hat Tausende solcher Neuronen – und eine Landschaft mit so vielen Richtungen, wie es Gewichte hat.' },
    { id: 6, name: 'Das Nest', short: 'Ein Neuron reicht nicht',
      mode: 'jump', walk: true, jumps: 30, fog: 14, auto: true, world: 'xor1', lr: { min: 0.1, max: 20, def: 1, d: 1 },
      lead: 'Dem Ei geht es nur gut, wenn <b>genau ein</b> Elternteil am Nest ist.',
      steps: [
        'Eingänge: <b>Mama am Nest?</b> und <b>Papa am Nest?</b> Ort = w₁ und w₂.',
        'Schaffst du alle vier Nester?',
        'Der <b>Bias</b>-Regler verschiebt die Gerade. Hilft das?'],
      outro: '<b>Ein Neuron schafft das nicht.</b> Seine Gerade kann die Nester nicht trennen – „genau einer da“ liegt über Kreuz. ' +
             'Bestenfalls sagt es überall 50 %, mit Bias stimmen höchstens 3 von 4. Die Lösung: ein zweites Neuron.' },
    { id: 7, name: 'Das Nest mit zwei Neuronen', short: 'Das Nest mit zwei Neuronen – jede Welt ein Neuron',
      two: true, jumps: 40, fog: 14, lr: { min: 0.2, max: 30, def: 4, d: 1 },
      lead: 'Wieder <b>das Nest aus Level 6</b>: Dem Ei geht es nur gut, wenn genau ein Elternteil da ist. Jetzt versucht es ein Netz mit <b>zwei Neuronen</b>.',
      steps: [
        '<b class="ca">Welt A</b> = die Kanten in Neuron A, <b class="cb">Welt B</b> = die Kanten in Neuron B. Grau steht fest.',
        'Läuft die eine Figur, verbiegt sich die Welt der anderen – es ist ein Netz.',
        'Zu zweit, mit zwei Daumen oder „Training starten“.'],
      outro: 'Mit zwei Neuronen klappt es: Eines lernt „<b>nur Mama am Nest</b>“, das andere „<b>nur Papa am Nest</b>“. ' +
             'Lernen beide dasselbe, bleibt das Netz bei 3 von 4 hängen – darum starten echte Netze mit <b>zufälligen</b> Gewichten.' },
    // Level 8 = das Labor (eigene Seite labor.html, Sönke 17.11.2026): 4 Neuronen, 8 Welten
    { id: 8, name: 'Pinguine in 3D', short: 'Ein Netz mit 4 Neuronen sortiert drei Arten', href: 'labor.html?level=8' }
  ];

  /* Erklärkarte bauen (auch von js/zwei.js benutzt) */
  function introHtml(L, ws, ctrl) {
    return '<div class="i-head"><div class="card-kicker">Level ' + L.id + ' · Welt ' + ws + '</div>' +
      '<h2>' + L.name + '</h2><p class="lead">' + L.lead + '</p></div>' +
      '<div class="i-pic">' + (window.NTBild ? '<div class="illwrap">' + NTBild.scene(L.id) + '</div>' : '') +
      (L.formula ? '<span class="formula">' + L.formula + '</span>' : '') + '</div>' +
      '<div class="i-txt"><ol class="steps">' + L.steps.map(s => '<li>' + s + '</li>').join('') + '</ol>' +
      '<p class="ctrl">' + ctrl + '</p></div>';
  }

  /* ── Grundzustand ── */
  const canvas = $('#welt');
  const G = NTGrafik.create(canvas);
  if (!G) { $('#nogl').hidden = false; return; }
  // Am Levelende: Karte frei drehen/zoomen (js/orbit.js)
  const orb = NTOrbit.create(canvas);

  let low = !!(window.LWMotion && LWMotion.low);
  window.addEventListener('lernwelt:motion', () => { low = !!(window.LWMotion && LWMotion.low); });

  let theme = 'light';
  let onThemeChange = () => {};
  function readTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncTheme() {
    let pd = null;
    try { pd = window.parent !== window ? window.parent.document.documentElement : null; } catch (e) { pd = null; }
    const apply = () => {
      if (pd) {
        const t = pd.getAttribute('data-theme');
        if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
        else document.documentElement.removeAttribute('data-theme');
      }
      const nt = readTheme();
      if (nt !== theme) { theme = nt; G.setTheme(theme); onThemeChange(); }
    };
    apply();
    if (pd) { try { new MutationObserver(apply).observe(pd, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* egal */ } }
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
  }
  theme = readTheme();
  syncTheme();

  let seed = parseInt(LS.get('nt.seed'), 10);
  if (!(seed >= 1000 && seed <= 9999)) seed = 1000 + Math.floor(Math.random() * 9000);
  /* Jedes Level eine eigene Welt (Sönke 18.11.2026: „Level 1 und 2 sollen unterschiedlich sein“):
     aus der Welt-Nummer der Übersicht wird je Level eine eigene Nummer gewürfelt – gleiche
     Welt-Nummer = auf allen Tablets dieselben Welten, aber keine zwei Level gleich. */
  function lvSeed(id) {
    let h = (Math.imul(seed, 2654435761) ^ Math.imul(id + 7, 40503)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = (h ^ (h >>> 13)) >>> 0;
    return 1000 + (h % 9000);
  }

  const MP = { on: false, o: null, frame: null, res: null };   // Gemeinsam spielen (js/mehr.js)
  const S = {
    state: 'menu', lvl: null, world: null,
    p: { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, tilt: 0, squash: 1, phase: 0 },
    camYaw: 0, camYawT: null, fogR: 9,
    t0: 0, left: 0, jumpsLeft: 0, dots: [], trailD: 0,
    jump: null, fly: null, lr: 1, auto: false, autoWait: 0,
    curve: [], best: Infinity, lrs: [], outs: 0,
    reveal: null, cam: null, startPos: null,
    post: false, postN: 0, res: null          // Weiter trainieren nach dem Levelende (Level 4–6)
  };
  const live = () => S.state === 'play' || S.post;   // springen/trainieren erlaubt

  /* ── Eiswelt-Look (17.11.2026) ──
     Alle Level sind Polarnacht (html[data-night]); Level 1–3 (L.snow) dazu im
     Schneesturm (html[data-snow], js/schnee.js) mit einfarbigem Boden und flachem
     Licht – man soll kaum sehen, ob es bergauf oder bergab geht. Ab Level 4
     (neuronale Netze, keine „Spielwiese“ mehr): kein Schnee, dafür Höhenfarben,
     helle Höhenlinien und der Höhenmesser links (Palette NET).
     Menü: Polarnacht im Dunkel-, Polartag im Hellmodus. */
  const NIGHT = { fog: '#0c1526', c: ['#123a57', '#2d6688', '#86a9c2', '#dfeaf3'], plainC: '#4a6e8a', plainAmb: 0.84,
    amb: 0.4, ice: 1, iceC: '#2fa3bf', light: [-0.35, 0.7, 0.55], dark: true };
  // Tal = Türkis (gut), Hang = Blau/Violett, oben = Flieder (großer Fehler; nicht Weiß – man startet meist oben
  // und soll die Farben auch dort sehen); Farben wie die Höhenleiste
  const NET = { fog: '#0c1526', c: ['#0b6e6a', '#2b78b0', '#6d5fd0', '#c9b6f2'], amb: 0.42, ice: 0.25, iceC: '#4f8fc0',
    light: [-0.35, 0.7, 0.55], lineK: 1.5, dark: true };
  window.NT_NET = NET;                          // auch für js/zwei.js
  const DAY = { fog: '#e7edf1', c: ['#6f9cc0', '#b2cde0', '#e1eaf1', '#ffffff'], plainC: '#e9f0f5', amb: 0.55,
    ice: 1, iceC: '#8dbbdc', light: [-0.5, 0.75, 0.35] };
  const MINT = [0.36, 0.95, 0.77];
  let night = false, snowy = false;
  function applyLook() {
    const L = S.lvl, inLvl = S.state !== 'menu' && L;
    night = !!inLvl;
    snowy = !!(inLvl && L.snow);
    document.documentElement.toggleAttribute('data-night', night);
    document.documentElement.toggleAttribute('data-snow', snowy);
    if (inLvl) G.setPalette(snowy ? NIGHT : NET, 'dark');
    else G.setPalette(theme === 'dark' ? NIGHT : DAY, theme);
  }
  onThemeChange = applyLook;
  const snow = NTSchnee.create($('#snow'));

  /* ── Welt-Nummer ── */
  function setSeed(n) {
    seed = clamp(Math.round(n) || 1000, 1000, 9999);
    LS.set('nt.seed', String(seed));
    renderMenu();
  }
  // (Welt-Nummer-Zeile in der Übersicht entfällt, Sönke 18.11.2026 – „Neue Welt“ am Levelende würfelt sie neu)

  /* ── Menü ── */
  const bestKey = (lvl) => 'nt.best.' + lvl + '.' + seed;
  const stars = n => '<span class="stars" aria-label="' + n + ' von 3 Sternen">' +
    [1, 2, 3].map(i => '<i class="' + (i <= n ? 'on' : '') + '">★</i>').join('') + '</span>';

  /* Übersicht = Ablauf der Stunde (Sönke 18.11.2026): je Reihe eine Phase, Kacheln mit Bild
     (NTBild.tile). Neben den Leveln: Erarbeitung (Tafelbild erarbeitung.html) und Sicherung (kommt noch). */
  const EXTRA = {
    erarb: { name: 'Erarbeitung', short: 'Wie lernt ein Neuron?', href: 'erarbeitung.html', tag: 'Tafel' },
    sich: { name: 'Sicherung', short: 'Kommt bald', soon: true, tag: '–' }
  };
  /* Freie Nutzung (Sönke 20.11.2026): dieselben fünf Halte wie im Lernpfad (Namen aus NTPfad.STATIONS),
     aber als volle Kachel-Reihen (bis zu 5 je Reihe), der Name des Halts steht als Klammer über seinen Kacheln.
     'blatt' = Arbeitsblatt (nur Lehrkraft und allein, wie im Lernpfad). */
  const ROWS = [
    [{ st: 0, items: [1, 2, 3] }, { st: 1, items: ['erarb'] }],
    [{ st: 2, items: [4, 5, 6, 7, 'blatt'] }],
    [{ st: 3, items: ['sich'] }, { st: 4, items: [8] }]
  ];
  const ST_NAME = ['Einstieg', 'Erarbeitung', 'Übung', 'Sicherung', 'Finale'];

  /* Im Raum (js/raum.js): Lehrkraft teilt jede Kachel einzeln (Symbol oben rechts an der Kachel),
     die Klasse sieht nicht geteilte Kacheln mit Schloss. Ohne Raum ist alles offen. */
  const R = window.NTRaum || { inRoom: false, isTeacher: false, isStudent: false, shared: () => true, on() {} };
  const SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function toggleShare(key) {
    const cur = (R.levels || []).slice(), i = cur.findIndex(x => String(x) === String(key));
    if (i >= 0) cur.splice(i, 1); else cur.push(key);
    R.setLevels(cur);
  }
  R.on(() => { if (S.state === 'menu') renderMenu(); });

  /* Zwei Ansichten der Übersicht (Sönke 19.11.2026): „Lernpfad“ (js/pfad.js, Vorgabe) = der Weg
     der Stunde ins Tal, und „Freie Nutzung“ = die Phasen-Reihen von vorher. Im Raum entscheidet die
     Lehrkraft (data.view, die Tablets folgen), allein merkt sich das Gerät die Wahl (nt.view). */
  const viewNow = () => (R.inRoom ? R.view : LS.get('nt.view')) === 'frei' ? 'frei' : 'pfad';
  function setView(v) {
    if (R.inRoom) { if (R.isTeacher) R.setView(v); return; }
    LS.set('nt.view', v); renderMenu();
  }
  document.querySelectorAll('#viewSw [data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  // allein: geschafft = irgendeine Welt dieses Levels mit Sternen (bzw. Erarbeitung/Level 8 einmal geöffnet)
  function doneLocal(key) {
    if (typeof key !== 'number' || key === 8) return LS.get('nt.done.' + key) === '1';
    if (DEMO) return parseInt(LS.get(bestKey(key)), 10) >= 0;
    try { for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf('nt.best.' + key + '.') === 0) return true; }
    catch (e) { /* ohne Speicher: nichts geschafft */ }
    return false;
  }

  function renderMenu() {
    document.body.classList.toggle('in-room', R.inRoom);
    document.body.classList.toggle('is-teacher', R.isTeacher);
    document.body.classList.toggle('is-student', R.isStudent);
    const tileHtml = key => {
      const L = typeof key === 'number' ? LEVELS.find(l => l.id === key) : EXTRA[key];
      const b = typeof key === 'number' ? parseInt(LS.get(bestKey(key)), 10) : NaN;
      const lock = !L.soon && R.isStudent && !R.shared(key);
      const shared = R.inRoom && !L.soon && (R.levels || []).some(x => String(x) === String(key));
      const attr = L.soon || lock ? ' disabled aria-disabled="true"' : typeof key === 'number' ? ' data-lv="' + key + '"' : ' data-href="' + L.href + '"';
      return '<div class="tcell' + (shared ? ' is-shared' : '') + '">' +
        '<button class="tile' + (L.soon ? ' soon' : '') + (lock ? ' locked' : '') + (typeof key === 'number' ? '' : ' extra') + '" type="button"' + attr +
          ' title="' + (L.soon ? 'Kommt bald' : lock ? 'Noch nicht freigegeben' : L.short) + '">' +
        '<span class="tile-img">' + (window.NTBild ? NTBild.tile(key) : '') +
          '<span class="tile-n">' + (typeof key === 'number' ? key : L.tag) + '</span>' +
          (b >= 0 ? stars(b) : '') + (lock ? '<span class="tile-lock">' + LOCK_SVG + '</span>' : '') + '</span>' +
        '<span class="tile-t"><b>' + L.name + '</b></span></button>' +
        (R.isTeacher && !L.soon ? '<button class="tshare" type="button" data-share="' + key + '" aria-pressed="' + shared + '" title="' +
          (shared ? 'Für die Klasse freigegeben – antippen zum Entziehen' : 'Mit der Klasse teilen') + '">' + SHARE_SVG +
          '<span>' + (shared ? 'geteilt' : 'teilen') + '</span></button>' : '') +
        '</div>';
    };
    const vw = window.NTPfad ? viewNow() : 'frei';
    document.body.classList.toggle('v-pfad', vw === 'pfad');
    document.querySelectorAll('#viewSw [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === vw)));
    $('#viewSw').hidden = R.isStudent || !window.NTPfad;
    if (vw === 'pfad') {
      NTPfad.render($('#levels'), { R, tileHtml, doneLocal, mehr: () => window.NTMehr || null,
        share: list => R.setLevels(list) });
    } else {
      if (window.NTPfad) NTPfad.clear();
      const P = window.NTPfad;
      const sheetTile = () => '<div class="tcell sheet">' +
        '<a class="tile extra" href="' + P.SHEET + '.pdf" target="_blank" rel="noopener" title="Arbeitsblatt als PDF öffnen">' +
          '<span class="tile-img">' + (window.NTBild ? NTBild.tile('blatt') : '') + '<span class="tile-n">Blatt</span></span>' +
          '<span class="tile-t"><b>Arbeitsblatt</b><small>' + P.SHEET_NOTE + '</small></span></a>' +
        '<span class="tsheet"><a href="' + P.SHEET + '.pdf" target="_blank" rel="noopener">PDF</a><a href="' + P.SHEET + '.docx" download>Word</a></span>' +
        '</div>';
      $('#levels').innerHTML = ROWS.map(row =>
        '<div class="frow">' + row.map(g => {
          const items = g.items.filter(k => k !== 'blatt' || (P && !R.isStudent));
          const name = (P && P.STATIONS[g.st] && P.STATIONS[g.st].t) || ST_NAME[g.st];
          return '<section class="fgrp" data-st="' + g.st + '" style="--n:' + items.length + '">' +
            '<div class="fgrp-h"><span class="fgrp-n">' + (g.st + 1) + '</span><b>' + name + '</b></div>' +
            '<div class="fgrp-row">' + items.map(k => k === 'blatt' ? sheetTile() : tileHtml(k)).join('') + '</div></section>';
        }).join('') + '</div>').join('');
    }
    document.querySelectorAll('#levels .tile[data-lv]').forEach(b => b.addEventListener('click', () => openLevel(+b.dataset.lv)));
    document.querySelectorAll('#levels .tshare').forEach(b => b.addEventListener('click', () => toggleShare(b.dataset.share === 'erarb' ? 'erarb' : +b.dataset.share)));
    const none = R.isStudent && R.got && !LEVELS.some(l => R.shared(l.id)) && !R.shared('erarb');
    $('#noShare').hidden = !none || vw === 'pfad';
    document.querySelectorAll('#levels .tile[data-href]').forEach(b => b.addEventListener('click', () => { location.href = b.dataset.href; }));
  }

  function show(id) {
    for (const s of ['#menu', '#card']) $(s).hidden = s !== id;
    document.body.dataset.state = S.state;
  }

  function toMenu() {
    if (window.NTZwei) NTZwei.close();
    endReset();
    if (MP.on) {
      MP.on = false; MP.o = null; MP.frame = null;
      document.body.classList.remove('mp');
      S.world = NTWelt.hills(seed, 1); G.setWorld(S.world, theme); S.lvl = null;
    }
    S.state = 'menu'; S.auto = false;
    applyLook();
    renderMenu();
    show('#menu');
    hudFor(null);
  }
  $('#btnMenu').addEventListener('click', toMenu);

  /* Infos ein-/ausklappen (Kästen rechts, Level 7 #zPanel) – vor allem fürs Handy */
  function toggleInfo() {
    const min = document.body.classList.toggle('info-min');
    for (const b of document.querySelectorAll('.infotog')) b.setAttribute('aria-pressed', String(!min));
    if (!min && S.lvl) updateHud();
  }
  $('#btnInfo').addEventListener('click', toggleInfo);
  // Höhe der Leiste unten → CSS-Variable --hb (Kästen enden darüber)
  // (am Levelende die Leiste #endbar statt der Lernrate-Leiste)
  const hbEl = document.querySelector('.hud-bottom');
  function syncHb() {
    const eb = $('#endbar'), h = !eb.hidden ? eb.offsetHeight + 4 : hbEl.offsetHeight;
    $('#hud').style.setProperty('--hb', h + 'px');
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(syncHb);
    ro.observe(hbEl); ro.observe($('#endbar'));
  }

  /* ── Level öffnen ── */
  function openLevel(id) {
    const L = LEVELS.find(l => l.id === id);
    if (L.href) { if (id === 8) LS.set('nt.done.8', '1'); location.href = L.href; return; }
    S.lvl = L;
    if (L.two) { openTwo(L); return; }
    const ws = lvSeed(id);
    S.world = worldFor(L, ws);
    G.setWorld(S.world, theme);
    resetPlayer();
    S.state = 'intro';
    applyLook();
    hudFor(L);
    card(introHtml(L, ws, ctrlText(L)), [['Los geht’s', startLevel, 'primary'], ['Übersicht', toMenu]]);
  }
  function worldFor(L, ws) {
    return L.world === 'model' ? NTWelt.model(ws) : L.world === 'penguin' ? NTWelt.penguins(ws)
      : L.world === 'xor1' ? NTWelt.xor(ws).one() : NTWelt.hills(ws, L.id);
  }
  function ctrlText(L) {
    return L.mode === 'walk'
      ? 'Links ziehen = laufen · rechts ziehen = umschauen<span class="kbd"> · WASD, Q/E</span>'
      : L.walk
      ? 'Links ziehen = laufen · rechts ziehen = umschauen<span class="kbd"> · WASD, Leertaste = springen</span>'
      : 'Ziehen = umschauen<span class="kbd"> · Leertaste = springen</span>';
  }

  function resetPlayer() {
    const w = S.world, L = S.lvl;
    Object.assign(S.p, { x: w.start.x, z: w.start.z, vx: 0, vz: 0, tilt: 0, squash: 1, phase: 0 });
    const g = w.grad(w.start.x, w.start.z);
    S.p.yaw = Math.atan2(-g[0], -g[1]);
    S.camYaw = S.p.yaw; S.camYawT = null;
    S.startPos = { x: w.start.x, z: w.start.z };
    S.fogR = L.fog;
    S.dots = []; S.trailD = 0; S.jump = null; S.fly = null; S.auto = false; S.autoWait = 0; S.stayReq = false;
    S.curve = [w.show(w.h(S.p.x, S.p.z))];
    S.best = S.curve[0]; S.lrs = []; S.outs = 0; S.reveal = null;
    endReset();
    S.left = L.time || 0; S.jumpsLeft = L.jumps || 0;
    if (L.lr) setLR(L.lr.def);
    if (w.setBias && w.bias() !== 0) setBias(0);
    else if (w.setBias) { $('#xBias').value = 0; $('#xBiasV').textContent = '0,00'; }
    if (w.learnBias) setBiasLearn(false);
    addDot(S.p.x, S.p.z, true);
  }

  function startLevel() {
    S.state = 'play';
    show(null);
    $('#card').hidden = true;
    hudFor(S.lvl);
    updateHud();
  }

  /* ── Karte (Intro / Ergebnis) ── */
  function card(html, buttons, cls) {
    const c = $('#card');
    c.className = 'card ' + (cls || '');
    c.innerHTML = '<div class="card-in' + (html.indexOf('class="i-head"') >= 0 ? ' is-intro' : '') + '">' + html + '<div class="card-btns"></div></div>';
    const box = c.querySelector('.card-btns');
    for (const [label, fn, kind] of buttons) {
      const b = document.createElement('button');
      b.className = 'btn ' + (kind || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
    }
    c.hidden = false;
    $('#menu').hidden = true;
    endHide();
    document.body.dataset.state = S.state;
  }

  /* ── Leiste am Levelende (Sönke 18.11.2026: „die Endkarte ganz wegnehmen, unten eine Leiste mit den
     wichtigsten Knöpfen und wie gut man war, damit man die Karte und die Daten weiter betrachten kann“).
     o = { kick, stars (html), line (html), place (html), more (html: Hinweise + „Und die KI?“), btns: [[label, fn, kind]…] }
     Auch für js/zwei.js (Level 7) und js/mehr.js (gemeinsam). */
  function endBar(o) {
    const b = $('#endbar');
    b.innerHTML = '<div class="eb-res">' + (o.place ? '<div class="eb-place">' + o.place + '</div>' : '') + (o.stars || '') +
      '<div class="eb-txt">' + (o.kick ? '<div class="eb-kick">' + o.kick + '</div>' : '') + '<div class="eb-line">' + (o.line || '') + '</div></div></div>' +
      '<div class="eb-btns"></div>' +
      (o.more ? '<div class="eb-more" hidden>' + o.more + '</div>' : '');
    const box = b.querySelector('.eb-btns');
    const add = (label, fn, kind) => {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'btn ' + (kind || ''); x.textContent = label;
      x.addEventListener('click', fn); box.appendChild(x); return x;
    };
    if (o.more) {
      const k = add(o.moreLabel || 'Mehr', () => {
        const m = b.querySelector('.eb-more'); m.hidden = !m.hidden;
        k.setAttribute('aria-expanded', String(!m.hidden)); syncHb();
      }, 'ebki');
      k.setAttribute('aria-expanded', 'false');
      if (o.open) { b.querySelector('.eb-more').hidden = false; k.setAttribute('aria-expanded', 'true'); }
    }
    for (const [label, fn, kind] of o.btns || []) add(label, fn, kind);
    b.hidden = false;
    $('#card').hidden = true;
    syncHb();
  }
  function endHide() { const b = $('#endbar'); if (!b.hidden) { b.hidden = true; syncHb(); } }
  function endReset() {
    endHide();
    orb.on = false; S.post = false; S.postN = 0; S.res = null;
    document.body.classList.remove('post');
  }

  /* ── HUD ── */
  function hudFor(L) {
    document.body.dataset.mode = L ? L.mode : '';
    document.body.dataset.lvl = L ? L.id : '';
    $('#hud').hidden = !L;
    if (!L) { delete document.body.dataset.panel; return; }
    $('#lvlName').textContent = 'Level ' + L.id + ' · ' + L.name;
    $('#gLbl').textContent = S.world.label;
    $('#btnStay').textContent = L.mode === 'walk' ? 'Hier bleibe ich!' : 'Fertig';
    $('#btnAuto').hidden = !L.auto;
    $('#modelBox').hidden = !(S.world && S.world.kind === 'model');
    $('#pengBox').hidden = !(S.world && S.world.kind === 'penguin');
    $('#xorBox').hidden = !(S.world && S.world.kind === 'xor1');
    $('#curveBox').hidden = L.mode !== 'jump';
    const panel = !!(S.world && ['model', 'penguin', 'xor1'].includes(S.world.kind));
    if (panel) document.body.dataset.panel = '1'; else delete document.body.dataset.panel;
    $('#btnInfo').hidden = !(panel || L.mode === 'jump');
    if (L.lr) {
      $('#lr').min = 0; $('#lr').max = 1000;
    }
  }

  const H = () => S.world.h(S.p.x, S.p.z);
  function updateHud() {
    const L = S.lvl, w = S.world;
    if (!L) return;
    const v = w.show(H());
    if (S.state === 'play' && v < S.best) S.best = v;
    $('#gVal').textContent = fmt(v, w.dec) + (w.unit ? ' ' + w.unit : '');
    // Höhenmesser: Skala von der Starthöhe bis etwas darunter, nicht bis zum echten Minimum (das verriete es)
    const top = Math.max(S.curve[0], v) + 1, bot = Math.min(S.curve[0] * 0.15, S.best - 1, v - 1);
    const pos = x => clamp((x - bot) / (top - bot), 0, 1) * 100;
    $('#gNow').style.bottom = pos(v) + '%';
    $('#gBest').style.bottom = pos(S.best) + '%';
    $('#gBestV').textContent = fmt(S.best, w.dec);
    if (L.mode === 'walk') {
      const s = Math.ceil(Math.max(0, S.left)), done = S.state === 'result' || S.state === 'reveal';
      $('#counter').textContent = done ? '⏱ fertig' : '⏱ ' + s + ' s';
      $('#counter').classList.toggle('warn', !done && s <= 10);
    } else {
      $('#counter').textContent = S.post || S.postN ? 'weiter trainiert: +' + S.postN + ' Schritte'
        : (w.kind === 'hills' ? 'Sprünge' : 'Schritte') + ': ' + S.jumpsLeft;
      $('#counter').classList.toggle('warn', !S.postN && !S.post && S.jumpsLeft <= 3);
    }
    if (w.kind === 'model') drawModel();
    if (w.kind === 'penguin') drawPenguins();
    if (w.kind === 'xor1') drawXor1();
    if (L.mode === 'jump') drawCurve();
  }

  /* ── Lernrate (Regler logarithmisch) ── */
  function setLR(v) {
    const R = S.lvl.lr;
    S.lr = clamp(v, R.min, R.max);
    $('#lr').value = Math.round(Math.log(S.lr / R.min) / Math.log(R.max / R.min) * 1000);
    $('#lrVal').textContent = fmt(S.lr, R.d);
  }
  $('#lr').addEventListener('input', e => {
    const R = S.lvl && S.lvl.lr; if (!R) return;
    S.lr = R.min * Math.pow(R.max / R.min, e.target.value / 1000);
    S.lr = +S.lr.toFixed(R.d); if (S.lr < R.min) S.lr = R.min;
    $('#lrVal').textContent = fmt(S.lr, R.d);
  });
  $('#lrMinus').addEventListener('click', () => S.lvl && S.lvl.lr && !S.auto && setLR(S.lr / 1.25));
  $('#lrPlus').addEventListener('click', () => S.lvl && S.lvl.lr && !S.auto && setLR(S.lr * 1.25));

  // Level 6: Bias-Regler. Die Welt ist der Fehler bei diesem Bias → Gitter neu bauen (gedrosselt)
  let biasT = 0;
  function setBias(v) {
    const w = S.world;
    if (!w || !w.setBias) return;
    w.setBias(v);
    $('#xBias').value = Math.round(v * 20);
    $('#xBiasV').textContent = (v > 0 ? '+' : '') + fmt(v, 2);
    if (!biasT) biasT = setTimeout(() => { biasT = 0; if (S.world === w) G.setWorld(w, theme); }, 90);
  }
  $('#xBias').addEventListener('input', e => setBias(e.target.value / 20));
  $('#xBias').addEventListener('change', e => e.target.blur());   // Pfeiltasten wieder fürs Laufen
  function setBiasLearn(on) {
    $('#xBiasL').checked = on;
    if (S.world && S.world.learnBias) S.world.learnBias(on);
  }
  $('#xBiasL').addEventListener('change', e => { setBiasLearn(e.target.checked); e.target.blur(); });

  $('#btnJump').addEventListener('click', () => doJump());
  /* Fertig/Hier bleibe ich/Zum Ergebnis: hält ein laufendes Training an; ist gerade ein Sprung in der Luft,
     geht es direkt nach der Landung weiter (S.stayReq, step()) – vorher wurde der Klick dann verschluckt */
  function stay() {
    if (S.auto) { S.auto = false; refreshAuto(); }
    if (S.jump || S.fly) { S.stayReq = true; return; }
    S.stayReq = false;
    if (S.post) { postStop(); return; }
    if (S.state === 'play') finish();
  }
  $('#btnStay').addEventListener('click', stay);
  $('#btnAuto').addEventListener('click', () => {
    if (!live()) return;
    S.auto = !S.auto; S.autoWait = 0.2;
    refreshAuto();
  });
  function refreshAuto() {
    $('#btnAuto').textContent = S.auto ? 'Training anhalten' : 'Training starten';
    $('#btnAuto').classList.toggle('on', S.auto);
    document.body.classList.toggle('auto', S.auto);
    $('#lr').disabled = S.auto;
  }

  /* ── Springen = ein Schritt Gradientenabstieg ── */
  function doJump() {
    if (!live() || S.lvl.mode !== 'jump' || S.jump || S.fly || (!S.post && S.jumpsLeft <= 0)) return;
    const w = S.world, from = { x: S.p.x, z: S.p.z };
    const q = w.step(from, S.lr);
    if (q.b !== undefined && !q.out) setBias(q.b);    // Level 6: Bias lernt mit
    const dist = Math.hypot(q.x - from.x, q.z - from.z);
    S.lrs.push(S.lr);
    if (S.post) S.postN++; else S.jumpsLeft--;
    if (q.out) {
      // raus aus der Welt: in Sprungrichtung davonfliegen, dann zurück
      const d = Math.max(1e-6, dist);
      S.fly = { t: 0, from, dx: (q.x - from.x) / d, dz: (q.z - from.z) / d };
      S.outs++;
      return;
    }
    const fast = S.auto ? 0.6 : 1;
    S.jump = { t: 0, T: (0.42 + Math.min(0.55, dist * 0.018)) * fast, from, to: q, peak: 0.8 + Math.min(9, dist * 0.22),
               y0: w.h(from.x, from.z), y1: w.h(q.x, q.z), arc: [] };
    if (dist > 0.05) S.p.yaw = Math.atan2(q.x - from.x, q.z - from.z);
  }

  function landed() {
    const w = S.world;
    S.p.squash = 0.62;
    const v = w.show(H());
    S.curve.push(v);
    if (v < S.best) S.best = v;
    if (Math.hypot(S.jump.to.x - S.jump.from.x, S.jump.to.z - S.jump.from.z) > 0.6) for (const a of S.jump.arc) S.dots.push(a);
    addDot(S.p.x, S.p.z, true);
    S.jump = null;
    updateHud();
    if (S.jumpsLeft <= 0) setTimeout(() => { if (S.state === 'play') finish(); }, 500);
  }

  /* ── Spur ── */
  function addDot(x, z, big) {
    // kleine Sprünge im Tal nicht zu einer Wurst stapeln
    if (big) {
      for (let i = S.dots.length - 1; i >= 0; i--) {
        const l = S.dots[i];
        if (l.big) { if (Math.hypot(l.x - x, l.z - z) < 0.6) return; break; }
      }
    }
    S.dots.push({ x, z, r: big ? 0.38 : 0.14, big });
    if (S.dots.length > 900) S.dots.splice(1, 1);
  }

  /* ── Ende: Nebel lichtet sich ── */
  function finish() {
    if (S.state !== 'play') return;
    if (MP.on) { mpDone(); return; }
    S.state = 'reveal'; S.auto = false; refreshAuto();
    joy.active = false; $('#joy').hidden = true;
    S.p.vx = S.p.vz = 0;
    const w = S.world;
    S.reveal = { t: 0, fog0: S.fogR, cam0: S.cam ? { eye: S.cam.eye.slice(), at: S.cam.at.slice() } : null };
    document.body.dataset.state = 'reveal';
  }

  // Wie gut steht man gerade? (Ergebnis am Ende und nach „Weiter trainieren“)
  function rate() {
    const w = S.world;
    const mine = w.show(H()), best = w.show(w.min.h);
    let n, line;
    if (w.kind === 'xor1') {
      const d = mine - best;
      n = d < 0.02 ? 3 : d < 0.15 ? 2 : d < 0.5 ? 1 : 0;
      line = 'Dein Neuron beurteilt <b>' + w.right(w.cases(S.p.x, S.p.z)) + ' von 4</b> Nestern richtig' +
        ' <small>· Fehler ' + fmt(mine, 2) + ' · kleinstmöglich ' + fmt(best, 2) +
        (w.bias() ? ' bei Bias ' + fmt(w.bias(), 1) + ' · ohne Bias ' + fmt(Math.LN2, 2) + ' (= überall 50 %)' : ' (= überall 50 %)') + '</small>';
    } else if (w.kind === 'penguin') {
      const nw = w.wrong(w.toW(S.p.x), w.toW(S.p.z)), nb = w.wrong(w.min.w1, w.min.w2), d = nw - nb;
      n = d <= 0 && mine < best * 1.6 ? 3 : d <= 2 ? 2 : d <= 8 ? 1 : 0;
      line = 'Dein Neuron sortiert <b>' + nw + ' von ' + w.pts.length + '</b> Pinguinen falsch' +
        ' · bestes Neuron: <b>' + nb + '</b> <small>· Fehler ' + fmt(mine, 2) + ' · kleinstmöglich ' + fmt(best, 2) + '</small>';
    } else if (w.kind === 'model') {
      const r = mine / best;
      n = r < 1.02 ? 3 : r < 1.15 ? 2 : r < 1.6 ? 1 : 0;
      line = 'Dein Neuron liegt im Schnitt <b>± ' + fmt(mine, 2) + ' kg</b> daneben · bestes Neuron: <b>± ' + fmt(best, 2) + ' kg</b>';
    } else {
      const d = mine - best;
      n = d < 0.4 ? 3 : d < 1.5 ? 2 : d < 4 ? 1 : 0;
      line = d < 0.05 ? 'Du stehst <b>genau am tiefsten Punkt</b>!'
        : 'Du stehst <b>' + fmt(d, 1) + ' m</b> über dem tiefsten Punkt.';
    }
    return { n, line };
  }
  const canPost = () => !!(S.lvl && S.world && ['model', 'penguin', 'xor1'].includes(S.world.kind));

  function showResult() {
    S.state = 'result';
    // Karte frei drehbar: vom Ende des Auflösens aus
    if (S.cam) {
      const w = S.world, E = w.W;
      orb.set(S.cam); orb.limit = E; orb.minD = 6; orb.maxD = E * 4; orb.on = true;
      orb.floor = (x, z) => (Math.abs(x) < E && Math.abs(z) < E ? w.h(x, z) : -Infinity);
    }
    if (MP.on) { document.body.dataset.state = 'result'; if (MP.o.onResult) MP.o.onResult(); return; }
    const w = S.world, L = S.lvl;
    const { n, line } = rate();
    const old = parseInt(LS.get(bestKey(L.id)), 10);
    if (!(old >= n)) LS.set(bestKey(L.id), String(n));
    if (R.inRoom && R.earn) R.earn(L.id);          // Profilbilder (Migration 0299), zählt nur Level 1–3 und 5

    S.res = { n, line };
    resultBar();
    document.body.dataset.state = 'result';
  }
  function resultBar() {
    const w = S.world, L = S.lvl, R0 = S.res;
    const now = S.postN ? rate() : null;
    // Sönke 18.11.2026: kein „Weiter: nächstes Level“ (sonst kommt man an nicht freigegebene Level),
    // kein „Weiter trainieren“, kein „Und die KI?“ – immer zurück in die Übersicht
    endBar({
      kick: 'Level ' + L.id + ' · Welt ' + w.seed + (now ? ' · weiter trainiert: +' + S.postN + ' Schritte' : ''),
      stars: stars(now ? now.n : R0.n), line: now ? now.line : R0.line,
      btns: [['Nochmal', () => openLevel(L.id)],
        ['Neue Welt', () => { setSeed(1000 + Math.floor(Math.random() * 9000)); openLevel(L.id); }],
        ['Übersicht', toMenu, 'primary']]
    });
  }

  /* Weiter trainieren (Level 4–6, auch gemeinsam nach der Runde – zählt nicht mehr für die Wertung):
     ohne Grenze springen/„Training starten“, Kästen und Lernkurve laufen mit, die Karte bleibt frei drehbar.
     „Zum Ergebnis“ (btnStay) holt die Leiste zurück, jetzt mit dem neuen Stand. */
  function postStart() {
    if (S.state !== 'result' || !canPost()) return;
    S.post = true; S.auto = false; refreshAuto();
    document.body.classList.add('post');
    endHide();
    $('#btnStay').textContent = 'Zum Ergebnis';
    updateHud();
  }
  function postStop() {
    S.post = false; S.auto = false; refreshAuto();
    document.body.classList.remove('post');
    $('#btnStay').textContent = 'Fertig';
    if (MP.on) { if (MP.o.onResult) MP.o.onResult(true); return; }
    resultBar();
  }

  /* ── Hinweis unten ── */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = msg; t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* ── Eingabe ── */
  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    keys.add(e.key.toLowerCase());
    if (e.key === ' ' && live()) { e.preventDefault(); doJump(); }
    if (e.key === 'Enter' && S.state === 'play' && S.lvl.mode === 'walk') finish();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const look = { id: null, lx: 0 };
  const JR = 56;
  canvas.addEventListener('pointerdown', e => {
    if (S.state !== 'play') return;
    const r = canvas.getBoundingClientRect();
    const left = (e.clientX - r.left) < r.width * 0.55;
    if ((S.lvl.mode === 'walk' || (S.lvl.walk && !S.auto)) && left && !joy.active) {
      Object.assign(joy, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
      const j = $('#joy');
      j.style.left = (e.clientX - r.left) + 'px'; j.style.top = (e.clientY - r.top) + 'px';
      j.hidden = false;
      $('#joyKnob').style.transform = 'translate(-50%,-50%)';
    } else if (look.id === null) {
      look.id = e.pointerId; look.lx = e.clientX;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (joy.active && e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > JR) { dx *= JR / l; dy *= JR / l; }
      joy.x = dx / JR; joy.y = -dy / JR;
      $('#joyKnob').style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    } else if (e.pointerId === look.id) {
      S.camYaw -= (e.clientX - look.lx) * 0.0065;
      S.camYawT = null;
      look.lx = e.clientX;
    }
  });
  const up = e => {
    if (e.pointerId === joy.id) { joy.active = false; joy.id = null; joy.x = joy.y = 0; $('#joy').hidden = true; }
    if (e.pointerId === look.id) look.id = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  /* ── Bewegung beim Laufen ──
     Bergauf langsamer, bergab schneller, an steilen Hängen rutscht man
     ein Stück (so spürt man den Hang auch ohne Pfeil). Auf sanften
     Hängen rutscht man NICHT – sonst fände man den tiefsten Punkt
     durch Stehenbleiben. */
  function walk(dt) {
    const w = S.world, p = S.p;
    let ix = joy.x, iy = joy.y;
    if (keys.has('w') || keys.has('arrowup')) iy += 1;
    if (keys.has('s') || keys.has('arrowdown')) iy -= 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
    const rx = -fz, rz = fx;                    // rechts auf dem Bildschirm
    let mx = fx * iy + rx * ix, mz = fz * iy + rz * ix;
    const ml = Math.hypot(mx, mz);
    const g = w.grad(p.x, p.z), gl = Math.hypot(g[0], g[1]);
    let tvx = 0, tvz = 0;
    if (ml > 0.01) {
      const ux = mx / ml, uz = mz / ml;
      const s = g[0] * ux + g[1] * uz;            // > 0 = bergauf
      const f = S.lvl.physics ? clamp(1 - 0.45 * s, 0.35, 1.5) : 1;
      const sp = 8.5 * Math.min(1, ml) * f;
      tvx = ux * sp; tvz = uz * sp;
      p.yaw += angDiff(Math.atan2(ux, uz), p.yaw) * (1 - Math.exp(-10 * dt));
    }
    const k = 1 - Math.exp(-7 * dt);
    p.vx = lerp(p.vx, tvx, k); p.vz = lerp(p.vz, tvz, k);
    if (S.lvl.physics && gl > 0.75) {             // rutschen (nicht in Level 1)
      const a = (gl - 0.75) * 5;
      p.vx -= g[0] / gl * a * dt * 6; p.vz -= g[1] / gl * a * dt * 6;
    }
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const lim = w.W - 1.5;
    nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
    const moved = Math.hypot(nx - p.x, nz - p.z);
    p.x = nx; p.z = nz;
    const sp = Math.hypot(p.vx, p.vz);
    p.phase += sp * dt * 1.3;
    p.tilt = lerp(p.tilt, clamp(sp / 8.5, 0, 1.2) * 0.22, k);
    S.trailD += moved;
    if (S.trailD > 1.5) { S.trailD = 0; addDot(p.x, p.z, false); }
  }

  /* ── Kamera ── */
  function camFollow(dt, y) {
    const p = S.p;
    if (S.camYawT !== null) {
      S.camYaw += angDiff(S.camYawT, S.camYaw) * (1 - Math.exp(-2.2 * dt));
      if (Math.abs(angDiff(S.camYawT, S.camYaw)) < 0.01) S.camYawT = null;
    }
    const rot = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
    if (rot) { S.camYaw += rot * 1.8 * dt; S.camYawT = null; }
    const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
    const jumpy = S.lvl && S.lvl.mode === 'jump';
    const dist = jumpy ? 13 : 11, hgt = jumpy ? 8.5 : 6.4;
    const at = [p.x + fx * 1.5, y + 1.0, p.z + fz * 1.5];
    let eye = [p.x - fx * dist, y + hgt, p.z - fz * dist];
    // nicht in den Hang hinter einem schauen
    const gy = S.world.h(eye[0], eye[2]) + 1.5;
    if (eye[1] < gy) eye[1] = gy;
    return { eye, at };
  }

  /* ── Bild für Bild ── */
  let last = performance.now(), acc = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    let dt = Math.min(0.05, (now - last) / 1000);
    if (low) { acc += dt; if (acc < 1 / 30) { last = now; return; } dt = Math.min(0.05, acc); acc = 0; }
    last = now;
    if (!S.world) { G.frame({ cam: { eye: [0, 10, -10], at: [0, 0, 0] }, player: null, fogR: 1, objects: [] }); return; }
    if (S.state === 'zwei') return;                 // Level 7 zeichnet selbst (js/zwei.js)
    if (S.state === 'mp') {                         // Lobby von „Gemeinsam spielen“ (js/mehr.js)
      const gs = snow.frame(dt, now / 1000, snowy);
      $('#gust').style.opacity = (gs * 0.45).toFixed(3);
      if (MP.frame) MP.frame(dt, now);
      return;
    }
    step(dt);
    const g = snow.frame(dt, now / 1000, snowy);
    $('#gust').style.opacity = (g * 0.45).toFixed(3);
    render();
  }

  function step(dt) {
    const L = S.lvl, w = S.world, p = S.p;
    if (S.state === 'play') {
      if (L.mode === 'walk') {
        walk(dt);
        S.left -= dt;
        if (S.left <= 0) { S.left = 0; toast('Zeit um!'); finish(); }
      } else {
        const walking = L.walk && !S.jump && !S.fly && !S.auto;
        if (walking) walk(dt);
        // Kamera schaut langsam in Sprungrichtung (nicht, solange man selbst läuft)
        const moving = walking && (joy.active || ['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].some(k => keys.has(k)) || Math.hypot(p.vx, p.vz) > 0.3);
        if (!S.jump && !S.fly && look.id === null && !moving) {
          const g = w.grad(p.x, p.z);
          if (Math.hypot(g[0], g[1]) > 1e-4) {
            const a = Math.atan2(-g[0], -g[1]);
            if (Math.abs(angDiff(a, S.camYaw)) > 0.5) S.camYawT = a;
          }
        }
        if (S.auto && !S.jump && !S.fly) {
          S.autoWait -= dt;
          if (S.autoWait <= 0) {
            S.autoWait = 0.15;
            if (S.jumpsLeft > 0) doJump(); else { S.auto = false; refreshAuto(); }
          }
        }
      }
      updateHud();
    } else if (S.post) {
      if (S.auto && !S.jump && !S.fly) {
        S.autoWait -= dt;
        if (S.autoWait <= 0) { S.autoWait = 0.15; doJump(); }
      }
      updateHud();
    } else if (S.state === 'result') updateHud();   // Kästen laufen weiter („Pinguin für Pinguin“)
    if (S.jump) {
      const J = S.jump;
      J.t += dt;
      const t = clamp(J.t / J.T, 0, 1);
      p.x = lerp(J.from.x, J.to.x, t); p.z = lerp(J.from.z, J.to.z, t);
      p.air = lerp(J.y0, J.y1, t) + 4 * J.peak * t * (1 - t) - w.h(p.x, p.z);
      if (J.arc.length < Math.floor(t * 12)) J.arc.push({ x: p.x, z: p.z, y: w.h(p.x, p.z) + p.air + 0.6, r: 0.07, air: true });
      if (t >= 1) { p.air = 0; landed(); }
    } else if (S.fly) {
      const F = S.fly;
      F.t += dt;
      p.x = F.from.x + F.dx * F.t * 30; p.z = F.from.z + F.dz * F.t * 30;
      p.air = F.t * F.t * 40 + F.t * 8;
      if (F.t > 1.1) {
        p.x = F.from.x; p.z = F.from.z; p.air = 0; S.fly = null;
        toast('Zu weit! <b>Lernrate</b> zu groß.');
        S.curve.push(w.show(H()));
        updateHud();
        if (S.jumpsLeft <= 0) setTimeout(() => { if (S.state === 'play') finish(); }, 800);
        if (S.auto) { S.auto = false; refreshAuto(); }
      }
    } else p.air = 0;
    if (S.stayReq && !S.jump && !S.fly) stay();
    p.squash = lerp(p.squash, 1, 1 - Math.exp(-9 * dt));
    if (S.reveal) {
      S.reveal.t += dt;
      if (S.reveal.t > 2.9 && S.state === 'reveal') showResult();
    }
  }

  function render() {
    const w = S.world, p = S.p, L = S.lvl;
    const ground = w.h(p.x, p.z);
    const bob = L && L.mode === 'walk' ? Math.abs(Math.sin(p.phase * 2.2)) * 0.12 * clamp(Math.hypot(p.vx, p.vz) / 8.5, 0, 1) : 0;
    const y = ground + (p.air || 0) + bob;
    let cam = camFollow(1 / 60, ground);
    let fogR = S.fogR;
    if (snowy) fogR *= 1 - 0.3 * snow.gust;      // Böe = Sicht schrumpft
    if (S.reveal) {
      const t = ease(clamp(S.reveal.t / 2.4, 0, 1));
      fogR = lerp(S.reveal.fog0, 320 * w.W / 50, t * t);
      const c0 = S.reveal.cam0 || cam;
      const over = overview();
      cam = { eye: c0.eye.map((v, i) => lerp(v, over.eye[i], t)), at: c0.at.map((v, i) => lerp(v, over.at[i], t)) };
      if (orb.on) cam = orb.cam();
    }
    S.cam = cam;

    const objs = [];
    const acc = night ? MINT : theme === 'dark' ? [1, 0.62, 0.3] : [0.98, 0.45, 0.12];
    const trail = night ? [0.55, 0.8, 1] : theme === 'dark' ? [1, 0.85, 0.55] : [0.85, 0.35, 0.1];
    const arrowC = night ? MINT : [0.2, 0.55, 1], arrowG = night ? 0.6 : 0.55;
    for (const d of S.dots) {
      const dy = d.air ? d.y : w.h(d.x, d.z) + 0.08;
      const rr = S.reveal ? d.r * (1 + (d.air ? 1.2 : 1.6) * ease(clamp(S.reveal.t / 2.4, 0, 1))) : d.r;
      objs.push({ type: 'dot', x: d.x, y: dy, z: d.z, r: rr, flat: d.air ? 1 : 0.18, color: d.big ? acc : trail, glow: S.reveal ? 0.6 : 0.2 });
    }
    // Pfeil = Gegenrichtung des Gradienten
    const showArrow = L && live() && (L.arrow || L.mode === 'jump') && !S.jump && !S.fly;
    if (showArrow) {
      const g = w.grad(p.x, p.z), gl = Math.hypot(g[0], g[1]);
      if (gl > 0.01) {
        const ux = -g[0] / gl, uz = -g[1] / gl;
        const len = clamp(1.2 + gl * 3.2, 1.4, 7);
        const pts = [];
        for (let i = 0; i <= 8; i++) { const s = 0.9 + (len - 0.9) * i / 8 * 0.78; pts.push([p.x + ux * s, p.z + uz * s, 0.2]); }
        objs.push({ type: 'strip', pts, color: arrowC, glow: arrowG, lift: 0.14 });
        const hs = 0.9 + (len - 0.9) * 0.78;
        const head = [];
        for (let i = 0; i <= 6; i++) { const s = hs + (len - hs) * i / 6; head.push([p.x + ux * s, p.z + uz * s, 0.62 * (1 - i / 6) + 0.02]); }
        objs.push({ type: 'strip', pts: head, color: arrowC, glow: arrowG, lift: 0.15 });
      }
    }
    // Landepunkt (Ring) beim Springen
    if (L && L.mode === 'jump' && live() && !S.jump && !S.fly && (S.post || S.jumpsLeft > 0)) {
      const q = w.step({ x: p.x, z: p.z }, S.lr);
      if (!q.out) {
        const ring = [];
        for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; ring.push([q.x + Math.cos(a) * 0.95, q.z + Math.sin(a) * 0.95, 0.13]); }
        objs.push({ type: 'strip', pts: ring, closed: true, color: [1, 1, 1], glow: 0.75, lift: 0.12 });
        const d = Math.hypot(q.x - p.x, q.z - p.z), peak = 0.8 + Math.min(9, d * 0.22);
        showDist(d);
        const y0 = ground, y1 = w.h(q.x, q.z);
        for (let i = 1; i < 8; i++) {
          const t = i / 8, x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t);
          objs.push({ type: 'dot', x, z, y: lerp(y0, y1, t) + 4 * peak * t * (1 - t) + 0.6, r: 0.1, color: [1, 1, 1], glow: 0.8 });
        }
      } else {
        $('#lrWarn').hidden = false;
        showDist(Infinity);
      }
      if (!q.out) $('#lrWarn').hidden = true;
    } else $('#lrWarn').hidden = true;

    if (S.reveal) {
      objs.push({ type: 'flag', x: w.min.x, z: w.min.z, color: [1, 0.78, 0.15], yaw: -Math.PI / 2 });
      const s = S.startPos;
      objs.push({ type: 'dot', x: s.x, y: w.h(s.x, s.z) + 0.1, z: s.z, r: 0.8, flat: 0.3, color: [0.55, 0.6, 0.7], glow: 0.5 });
    }

    const dpr = low ? 1 : Math.min(window.devicePixelRatio || 1, 1.6);
    // Level 1: eine Farbe, keine Höhenlinien – erst beim Auflösen kommen sie
    const plain = L && L.plain ? (S.reveal ? 1 - ease(clamp((S.reveal.t - 0.6) / 1.6, 0, 1)) : 1) : 0;
    const sc = { cam, fogR, dpr, objects: objs, playerColor: MP.on && MP.o.color ? MP.o.color : acc, plain,
      player: { x: p.x, y, z: p.z, ground, yaw: p.yaw, tilt: p.tilt, squash: p.squash, hidden: false,
        phase: p.phase, walk: (p.air || S.fly || S.jump) ? 0 : clamp(Math.hypot(p.vx, p.vz) / 8.5, 0, 1) } };
    G.frame(sc);
    labels(sc);
  }

  // Sprungweite = Lernrate × Steilheit, live unter der Lernrate
  let distTxt = '';
  function showDist(d) {
    const el = $('#lrDist'); if (!el) return;
    let t = '';
    if (S.world.kind === 'hills') {
      const g = S.world.grad(S.p.x, S.p.z), st = Math.hypot(g[0], g[1]);
      t = isFinite(d)
        ? fmt(S.lr, S.lvl.lr.d) + ' × ' + fmt(st, 2) + ' = <b>' + fmt(d, 1) + ' m</b>'
        : fmt(S.lr, S.lvl.lr.d) + ' × ' + fmt(st, 2) + ' = <b>zu weit</b>';
    }
    if (t !== distTxt) { distTxt = t; el.innerHTML = t; el.hidden = !t; }
  }

  function overview() {
    const w = S.world;
    // Kasten rechts (Level 4–6, breiter Bildschirm): Welt rückt nach links, unten steht die Leiste
    // (Kamera schaut nach +z, rechts auf dem Bild = −x).
    const wide = window.innerWidth >= 900 && document.body.dataset.panel && !document.body.classList.contains('info-min'), k = w.W / 50;
    const at = [(wide ? -12 : 0) * k, (w.min.h + w.h(0, 0)) / 2, 6 * k];
    return { eye: [at[0], at[1] + 92 * k, at[2] - 86 * k], at };
  }

  // Beschriftungen nach dem Auflösen
  function labels(sc) {
    const box = $('#labels');
    if (!S.reveal || S.reveal.t < 1.6) { if (box.childElementCount) box.innerHTML = ''; return; }
    const w = S.world;
    const items = [
      [[w.min.x, w.min.h + 5.4, w.min.z], 'Tiefster Punkt', 'gold'],
      [[S.p.x, w.h(S.p.x, S.p.z) + 3.2, S.p.z], 'Du', 'me'],
      [[S.startPos.x, w.h(S.startPos.x, S.startPos.z) + 1.4, S.startPos.z], 'Start', 'start']
    ];
    if (!box.childElementCount) box.innerHTML = items.map(i => '<span class="lbl ' + i[2] + '">' + i[1] + '</span>').join('');
    const els = box.children;
    items.forEach((it, i) => {
      const q = G.project(sc, it[0]);
      if (!q) { els[i].style.display = 'none'; return; }
      els[i].style.display = '';
      els[i].style.transform = 'translate(' + q.x + 'px,' + q.y + 'px) translate(-50%,-100%)';
    });
  }

  /* ── Lernkurve (Höhe nach jedem Sprung) ── */
  function drawCurve() {
    const c = $('#curve'), x = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, Hh = c.clientHeight;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = Hh * dpr; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, Hh);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink-soft').trim() || '#555', acc = css.getPropertyValue('--orange').trim() || '#f60';
    const v = S.curve, n = Math.max(v.length, (S.lvl.jumps || 10) + 1);
    const lo = Math.min(...v), hi = Math.max(...v);
    const pad = (hi - lo) * 0.12 + 0.01;
    const X = i => 6 + i / (n - 1) * (W - 12), Y = val => 6 + (1 - (val - (lo - pad)) / (hi - lo + 2 * pad)) * (Hh - 12);
    x.strokeStyle = ink; x.globalAlpha = 0.25; x.lineWidth = 1;
    x.beginPath(); x.moveTo(6, Hh - 6); x.lineTo(W - 6, Hh - 6); x.stroke();
    x.globalAlpha = 1; x.strokeStyle = acc; x.lineWidth = 2; x.lineJoin = 'round';
    x.beginPath();
    v.forEach((val, i) => i ? x.lineTo(X(i), Y(val)) : x.moveTo(X(i), Y(val)));
    x.stroke();
    x.fillStyle = acc;
    v.forEach((val, i) => { x.beginPath(); x.arc(X(i), Y(val), 2.4, 0, 7); x.fill(); });
  }

  /* ── Level 4: Wie schwer ist der Pinguin? ──
     Oben das Neuron „bei der Arbeit“: alle 1,6 s kommt ein anderer echter
     Pinguin hinein (Bild je Art), seine Flosse geht durch die Kante (· w),
     ins Σ (+ b), heraus kommt die Schätzung – daneben das echte Gewicht.
     Darunter alle 342 Pinguine (Flosse → Gewicht) mit der Geraden des
     Neurons; der Pinguin von oben ist umkreist, rot = sein Fehler. */
  const MROW = { order: null, seed: 0, idx: -1 };
  // Aufbau wie Level 5 (Sönke 18.11.2026): links der Pinguin mit seinem Messwert, Mitte das Neuron,
  // rechts „NEURON SAGT“ mit senkrechter kg-Skala (Punkt = Schätzung, Ring = echt, rot = Fehler) und ✓/✗
  const MK0 = 26, MK1 = 98, MV0 = 2, MV1 = 7, MKX = 222;           // kg-Skala: oben 7 kg, unten 2 kg
  const MKY = v => MK0 + (MV1 - Math.max(MV0, Math.min(MV1, v))) / (MV1 - MV0) * (MK1 - MK0);
  function mrowBuild() {
    const el = $('#mrow');
    if (el.dataset.ok) return;
    el.dataset.ok = '1';
    const t = (id, x, y, size, w, anchor, fill, txt) => '<text' + (id ? ' id="' + id + '"' : '') + ' x="' + x + '" y="' + y + '" font-size="' + size +
      '" font-weight="' + w + '" text-anchor="' + anchor + '" fill="' + fill + '">' + (txt || '') + '</text>';
    let ticks = '';
    for (const v of [2, 3, 4, 5, 6, 7]) ticks += '<line x1="' + (MKX - 3) + '" y1="' + MKY(v) + '" x2="' + (MKX + 3) + '" y2="' + MKY(v) + '" stroke="var(--ink-faint)" stroke-width="1"/>' +
      (v % 2 === 0 || v === 7 ? t('', MKX - 5, MKY(v) + 3, 8, 600, 'end', 'var(--ink-faint)', v) : '');
    el.innerHTML =
      '<g id="mPg"></g>' + t('mName', 0, 12, 11, 700, 'start', 'var(--ink-faint)') +
      t('', 116, 50, 10.5, 600, 'end', 'var(--ink-soft)', 'Flosse') + t('mF', 116, 64, 12.5, 700, 'end', 'var(--ink)') +
      '<circle cx="124" cy="59" r="4" fill="var(--ink)"/>' +
      '<line id="mEdge" x1="128" y1="59" x2="150" y2="59" stroke="#f27828" stroke-linecap="round"/>' +
      t('mWl', 139, 46, 11, 700, 'middle', '#f27828') +
      '<circle cx="167" cy="59" r="17" fill="var(--surface)" stroke="#f27828" stroke-width="2.4"/>' +
      t('', 167, 58, 13, 700, 'middle', 'var(--ink)', 'Σ') + t('mBl', 167, 70, 9, 700, 'middle', '#f27828') +
      '<line x1="184" y1="59" x2="194" y2="59" stroke="var(--ink)" stroke-width="2"/><path d="M200,59 L192,54.5 L192,63.5Z" fill="var(--ink)"/>' +
      t('', 254, 11, 10, 700, 'middle', 'var(--ink-faint)', 'NEURON SAGT') +
      '<rect id="mBox" x="206" y="17" width="94" height="90" rx="10" stroke-width="2"/>' +
      '<line x1="' + MKX + '" y1="' + MK0 + '" x2="' + MKX + '" y2="' + MK1 + '" stroke="var(--ink-faint)" stroke-width="1.4"/>' + ticks +
      '<line id="mErr" x1="' + MKX + '" x2="' + MKX + '" stroke="var(--warn)" stroke-width="3" stroke-linecap="round"/>' +
      '<circle id="mRealM" cx="' + MKX + '" r="5" fill="none" stroke="var(--ink)" stroke-width="2"/>' +
      '<circle id="mOutM" cx="' + MKX + '" r="3.6" fill="#f27828"/>' +
      t('', 230, 32, 9.5, 600, 'start', 'var(--ink-faint)', 'Neuron') + t('mOut', 230, 46, 12.5, 700, 'start', 'var(--ink)') +
      t('', 230, 62, 9.5, 600, 'start', 'var(--ink-faint)', 'echt') + t('mReal', 230, 75, 12, 700, 'start', 'var(--ink-soft)') +
      t('mDiff', 230, 96, 8.8, 700, 'start', 'var(--warn)') + '<g id="mBadge"></g>';
  }
  function mrowPick(w) {
    if (!MROW.order || MROW.seed !== w.seed) {
      const r = NTWelt.rng(w.seed * 97 + 3), o = w.pts.map((p, i) => i);
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      MROW.order = o; MROW.seed = w.seed; MROW.idx = -1;
    }
    return MROW.order[Math.floor(performance.now() / 1600) % MROW.order.length];
  }

  function drawModel() {
    const w = S.world;
    const wv = w.toW(S.p.x), bv = w.toB(S.p.z);
    mrowBuild();
    const i = mrowPick(w), cur = w.pts[i];
    if (i !== MROW.idx) {
      MROW.idx = i;
      $('#mPg').innerHTML = NTBild.peng({ sp: cur.sp, x: 32, y: 104, s: 0.62 });
      $('#mName').textContent = NTBild.SP[cur.sp].name;
      $('#mF').textContent = fmt(cur.x, 1) + ' cm';
      $('#mReal').textContent = fmt(cur.y, 2) + ' kg';
      $('#mRealM').setAttribute('cy', MKY(cur.y));
    }
    const est = w.pred(wv, bv, cur.x), diff = est - cur.y, ad = Math.abs(diff), ok = ad < 0.25;
    const ec = wv >= 0 ? '#f27828' : '#2f80ed';
    $('#mEdge').setAttribute('stroke-width', (1.4 + Math.min(7, Math.abs(wv) * 4)).toFixed(1));
    $('#mEdge').setAttribute('stroke', ec);
    $('#mWl').textContent = '· ' + fmt(wv, 2);
    $('#mWl').setAttribute('fill', ec);
    $('#mBl').textContent = (bv >= 0 ? '+' : '') + fmt(bv, 2);
    $('#mOut').textContent = '≈ ' + fmt(est, 2) + ' kg';
    $('#mOutM').setAttribute('cy', MKY(est));
    $('#mErr').setAttribute('y1', MKY(est)); $('#mErr').setAttribute('y2', MKY(cur.y));
    $('#mDiff').textContent = ad < 0.05 ? 'fast genau!' : fmt(ad, 2) + ' ' + (diff > 0 ? 'zu schwer' : 'zu leicht');
    $('#mDiff').setAttribute('fill', ok ? 'var(--accent-ink)' : 'var(--warn)');
    $('#mBox').setAttribute('fill', ok ? 'rgba(92,242,196,.16)' : 'rgba(255,107,139,.16)');
    $('#mBox').setAttribute('stroke', ok ? 'var(--accent)' : 'var(--warn)');
    $('#mBadge').innerHTML = '<circle cx="298" cy="19" r="8" fill="' + (ok ? 'var(--accent)' : 'var(--warn)') + '"/>' +
      '<text x="298" y="23" font-size="11" font-weight="800" text-anchor="middle" fill="#04201a">' + (ok ? '✓' : '✗') + '</text>';

    // alle Pinguine
    const c = $('#plot'), x = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wd = c.clientWidth, Hh = c.clientHeight;
    if (!Wd || !Hh) return;
    if (c.width !== Math.round(Wd * dpr) || c.height !== Math.round(Hh * dpr)) { c.width = Math.round(Wd * dpr); c.height = Math.round(Hh * dpr); }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, Wd, Hh);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), soft = css.getPropertyValue('--ink-faint').trim();
    const red = css.getPropertyValue('--warn').trim();
    const L = 26, R = 6, T = 6, B = 24, x0 = 17, x1 = 23.5, y0 = 1.5, y1 = 7;
    const X = v => L + (v - x0) / (x1 - x0) * (Wd - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (Hh - T - B);
    x.strokeStyle = soft; x.lineWidth = 1; x.fillStyle = soft; x.font = '10px Outfit, sans-serif'; x.textAlign = 'center';
    x.beginPath(); x.moveTo(L, T); x.lineTo(L, Hh - B); x.lineTo(Wd - R, Hh - B); x.stroke();
    for (let v = 18; v <= 23; v++) x.fillText(String(v), X(v), Hh - B + 11);
    x.textAlign = 'right';
    for (const v of [2, 3, 4, 5, 6, 7]) x.fillText(String(v), L - 4, Y(v) + 3);
    x.textAlign = 'right'; x.fillText('Flosse (cm)', Wd - R, Hh - 2);
    x.textAlign = 'left'; x.fillText('kg', L + 14, T + 8);
    x.save(); x.beginPath(); x.rect(L, T, Wd - L - R, Hh - T - B); x.clip();
    for (const p of w.pts) {
      x.fillStyle = NTBild.SP[p.sp].col; x.globalAlpha = 0.55;
      x.beginPath(); x.arc(X(p.x), Y(p.y), 2.1, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    // Gerade des Neurons
    x.strokeStyle = ink; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(X(x0), Y(w.pred(wv, bv, x0))); x.lineTo(X(x1), Y(w.pred(wv, bv, x1))); x.stroke();
    // der Pinguin von oben
    x.strokeStyle = red; x.lineWidth = 2;
    x.beginPath(); x.moveTo(X(cur.x), Y(cur.y)); x.lineTo(X(cur.x), Y(est)); x.stroke();
    x.fillStyle = ink; x.beginPath(); x.arc(X(cur.x), Y(est), 3, 0, 7); x.fill();
    x.strokeStyle = ink; x.lineWidth = 2;
    x.beginPath(); x.arc(X(cur.x), Y(cur.y), 5.5, 0, 7); x.stroke();
    x.restore();

    $('#mW').textContent = fmt(wv, 2);
    $('#mB').textContent = fmt(bv, 2);
    $('#mL').textContent = '± ' + fmt(Math.sqrt(w.loss(wv, bv)), 2) + ' kg';
  }

  /* Pinguin für Pinguin (Level 5): gleiches Prinzip wie #mrow in Level 4 */
  const PROW = { order: null, seed: 0, idx: -1 };
  function prowBuild() {
    const el = $('#prow');
    if (el.dataset.ok) return;
    el.dataset.ok = '1';
    const t = (id, x, y, size, w, anchor, fill, txt) => '<text' + (id ? ' id="' + id + '"' : '') + ' x="' + x + '" y="' + y + '" font-size="' + size +
      '" font-weight="' + w + '" text-anchor="' + anchor + '" fill="' + fill + '">' + (txt || '') + '</text>';
    el.innerHTML =
      '<g id="pPg"></g>' + t('pName', 0, 12, 11, 700, 'start', 'var(--ink-faint)') +
      t('', 120, 26, 10.5, 600, 'end', 'var(--ink-soft)', 'Länge') + t('pLen', 120, 40, 12.5, 700, 'end', 'var(--ink)') +
      t('', 120, 72, 10.5, 600, 'end', 'var(--ink-soft)', 'Höhe') + t('pDep', 120, 86, 12.5, 700, 'end', 'var(--ink)') +
      '<circle cx="130" cy="36" r="4" fill="var(--ink)"/><circle cx="130" cy="82" r="4" fill="var(--ink)"/>' +
      '<line id="pE1" x1="134" y1="36" x2="166" y2="54" stroke-linecap="round"/>' +
      '<line id="pE2" x1="134" y1="82" x2="166" y2="64" stroke-linecap="round"/>' +
      t('pL1', 150, 30, 11, 700, 'middle', '#f27828') + t('pL2', 150, 98, 11, 700, 'middle', '#f27828') +
      '<circle cx="183" cy="59" r="17" fill="var(--surface)" stroke="#f27828" stroke-width="2.4"/>' +
      t('', 183, 64.5, 16, 700, 'middle', 'var(--ink)', 'σ') +
      '<line x1="200" y1="59" x2="210" y2="59" stroke="var(--ink)" stroke-width="2"/><path d="M216,59 L208,54.5 L208,63.5Z" fill="var(--ink)"/>' +
      // Was sagt das Neuron? Zwei Köpfe mit Prozent, die Wahl hervorgehoben (grün richtig, rot falsch),
      // bei falscher Wahl die echte Art gestrichelt mit „echt“ (Sönke 17.11.2026)
      t('', 262, 11, 10, 700, 'middle', 'var(--ink-faint)', 'NEURON SAGT') +
      [['adelie', 'Adelie', 36], ['chin', 'Zügel', 80]].map(([sp, nm, y], k) =>
        '<rect id="pR' + k + '" x="222" y="' + (y - 20) + '" width="78" height="40" rx="10" fill="none" stroke-width="2"/>' +
        NTBild.head(sp, 240, y, 14) +
        t('', 259, y - 4, 10, 700, 'start', 'var(--ink-soft)', nm) + t('pP' + k, 259, y + 11, 13.5, 700, 'start', 'var(--ink)') +
        '<g id="pB' + k + '"></g>').join('') +
      '';
  }
  function prowPick(w) {
    if (!PROW.order || PROW.seed !== w.seed) {
      const r = NTWelt.rng(w.seed * 89 + 7), o = w.pts.map((p, i) => i);
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      PROW.order = o; PROW.seed = w.seed; PROW.idx = -1;
    }
    return PROW.order[Math.floor(performance.now() / 1600) % PROW.order.length];
  }

  /* Köpfe „Was sagt das Neuron?“ füllen: pre = Präfix der ids (pR0, pP0, pB0 …),
     ps = Anteile je Art, pick = gewählte Art, real = echte Art */
  function verdict(pre, ps, pick, real) {
    ps.forEach((v, k) => {
      const r = $('#' + pre + 'R' + k), on = k === pick, ok = pick === real, echt = !ok && k === real;
      r.setAttribute('fill', on ? (ok ? 'rgba(92,242,196,.16)' : 'rgba(255,107,139,.16)') : 'none');
      r.setAttribute('stroke', on ? (ok ? 'var(--accent)' : 'var(--warn)') : echt ? 'var(--accent)' : 'transparent');
      r.setAttribute('stroke-dasharray', echt ? '4 3' : 'none');
      $('#' + pre + 'P' + k).textContent = Math.round(v * 100) + ' %';
      $('#' + pre + 'P' + k).setAttribute('fill', on ? 'var(--ink)' : 'var(--ink-faint)');
      const x = +r.getAttribute('x') + +r.getAttribute('width'), y = +r.getAttribute('y');
      $('#' + pre + 'B' + k).innerHTML = on
        ? '<circle cx="' + (x - 2) + '" cy="' + (y + 2) + '" r="8" fill="' + (ok ? 'var(--accent)' : 'var(--warn)') + '"/>' +
          '<text x="' + (x - 2) + '" y="' + (y + 6) + '" font-size="11" font-weight="800" text-anchor="middle" fill="#04201a">' + (ok ? '✓' : '✗') + '</text>'
        : echt ? '<rect x="' + (x - 30) + '" y="' + (y - 6) + '" width="28" height="12" rx="6" fill="var(--accent)"/>' +
          '<text x="' + (x - 16) + '" y="' + (y + 3) + '" font-size="8.5" font-weight="800" text-anchor="middle" fill="#04201a">ECHT</text>' : '';
    });
  }

  /* ── Level 5: Pinguine + Neuron ──
     Oben das Neuron bei der Arbeit, Pinguin für Pinguin (Kantendicke = Größe
     des Gewichts, orange = positiv, blau = negativ), darunter „Bild A“: Messwerte, Hintergrund = was das
     Neuron an dieser Stelle sagt, Linie = 50 %. */
  function drawPenguins() {
    const w = S.world, w1 = w.toW(S.p.x), w2 = w.toW(S.p.z);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), soft = css.getPropertyValue('--ink-faint').trim();
    const red = css.getPropertyValue('--warn').trim();
    const cA = [47, 128, 237], cC = [242, 120, 40];            // Adelie blau, Zügel orange
    const rgb = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const prep = c => {
      const Wd = c.clientWidth, Hh = c.clientHeight, x = c.getContext('2d');
      if (c.width !== Wd * dpr) { c.width = Wd * dpr; c.height = Hh * dpr; }
      x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, Wd, Hh);
      return [x, Wd, Hh];
    };

    // Neuron bei der Arbeit: Pinguin für Pinguin
    prowBuild();
    const ci = prowPick(w), cur = w.pts[ci];
    if (ci !== PROW.idx) {
      PROW.idx = ci;
      const sp = cur.y ? 'chin' : 'adelie';
      $('#pPg').innerHTML = NTBild.peng({ sp, x: 32, y: 104, s: 0.62 });
      $('#pName').textContent = NTBild.SP[sp].name;
      $('#pLen').textContent = fmt(cur.len, 1) + ' mm';
      $('#pDep').textContent = fmt(cur.dep, 1) + ' mm';
    }
    const q = w.sig(w1 * cur.a + w2 * cur.b), right = (q > 0.5) === (cur.y === 1);
    for (const [id, wv, lid] of [['#pE1', w1, '#pL1'], ['#pE2', w2, '#pL2']]) {
      const c = wv >= 0 ? '#f27828' : '#2f80ed';
      $(id).setAttribute('stroke-width', (1.2 + Math.min(8, Math.abs(wv) * 0.45)).toFixed(1));
      $(id).setAttribute('stroke', c);
      $(lid).textContent = '· ' + fmt(wv, 1); $(lid).setAttribute('fill', c);
    }
    verdict('p', [1 - q, q], q > 0.5 ? 1 : 0, cur.y);

    // Bild A
    const [x, Wd, Hh] = prep($('#pplot'));
    const L0 = 30, R0 = 6, T0 = 6, B0 = 22;
    const lx0 = 32, lx1 = 60, dy0 = 15.5, dy1 = 22;
    const X = v => L0 + (v - lx0) / (lx1 - lx0) * (Wd - L0 - R0), Y = v => T0 + (1 - (v - dy0) / (dy1 - dy0)) * (Hh - T0 - B0);
    const prob = (len, dep) => w.sig(w1 * (len - w.m1) / w.s1 + w2 * (dep - w.m2) / w.s2);
    const NX = 30, NY = 18, cw = (Wd - L0 - R0) / NX, ch = (Hh - T0 - B0) / NY;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const len = lx0 + (i + 0.5) / NX * (lx1 - lx0), dep = dy1 - (j + 0.5) / NY * (dy1 - dy0);
      const q = prob(len, dep);
      x.fillStyle = rgb(q > 0.5 ? cC : cA, Math.abs(q - 0.5) * 0.55);
      x.fillRect(L0 + i * cw, T0 + j * ch, cw + 0.6, ch + 0.6);
    }
    // Trennlinie (p = 50 %): w1·(len−m1)/s1 + w2·(dep−m2)/s2 = 0
    x.save(); x.beginPath(); x.rect(L0, T0, Wd - L0 - R0, Hh - T0 - B0); x.clip();
    x.strokeStyle = ink; x.lineWidth = 2; x.setLineDash([5, 4]);
    x.beginPath();
    if (Math.abs(w2) > Math.abs(w1) * 1e-3 || Math.abs(w1) < 1e-6) {
      const dep = len => w.m2 - (w1 / (w2 || 1e-9)) * (len - w.m1) / w.s1 * w.s2;
      x.moveTo(X(lx0), Y(dep(lx0))); x.lineTo(X(lx1), Y(dep(lx1)));
    } else { x.moveTo(X(w.m1), Y(dy0)); x.lineTo(X(w.m1), Y(dy1)); }
    x.stroke(); x.setLineDash([]); x.restore();
    // Achsen
    x.strokeStyle = soft; x.lineWidth = 1; x.fillStyle = soft; x.font = '10px Outfit, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.beginPath(); x.moveTo(L0, T0); x.lineTo(L0, Hh - B0); x.lineTo(Wd - R0, Hh - B0); x.stroke();
    for (const v of [35, 40, 45, 50, 55]) x.fillText(String(v), X(v) - 5, Hh - B0 + 11);
    for (const v of [16, 18, 20]) x.fillText(String(v), 6, Y(v) + 3);
    x.fillText('Schnabellänge (mm)', Wd - R0 - 92, Hh - 2);
    x.save(); x.translate(10, T0 + 2); x.rotate(Math.PI / 2); x.fillText('Höhe', 0, 0); x.restore();
    // Pinguine
    let wrong = 0;
    for (const p of w.pts) {
      const px = X(p.len), py = Y(p.dep), bad = (prob(p.len, p.dep) > 0.5) !== (p.y === 1);
      if (bad) wrong++;
      x.fillStyle = rgb(p.y ? cC : cA, 1);
      x.beginPath();
      if (p.y) { x.moveTo(px, py - 4); x.lineTo(px + 3.6, py + 2.6); x.lineTo(px - 3.6, py + 2.6); x.closePath(); }
      else x.arc(px, py, 3, 0, 7);
      x.fill();
      if (bad) { x.strokeStyle = red; x.lineWidth = 1.6; x.beginPath(); x.arc(px, py, 6, 0, 7); x.stroke(); }
    }
    // der Pinguin von oben
    x.strokeStyle = ink; x.lineWidth = 2.2;
    x.beginPath(); x.arc(X(cur.len), Y(cur.dep), 8, 0, 7); x.stroke();
    $('#pW1').textContent = fmt(w1, 1);
    $('#pW2').textContent = fmt(w2, 1);
    $('#pWrong').textContent = wrong + ' von ' + w.pts.length;
  }

  /* ── Level 6: ein Neuron, das Nest ──
     Aufbau wie Level 5 (Sönke 18.11.2026): links ein Nest (alle 1,6 s das nächste der vier),
     Mama/Papa als Eingänge (+1 am Nest, −1 fischt), σ mit Bias, rechts „NEURON SAGT“:
     Ei ok / Ei nicht ok mit Prozent, ✓/✗ und ECHT. Im Diagramm darunter ist das Nest umkreist. */
  const NEST_TXT = { beide: 'Beide am Nest', mama: 'Nur Mama da', papa: 'Nur Papa da', nest: 'Beide fischen' };
  const eggIcon = (x, y, bad) =>
    '<path transform="translate(' + x + ' ' + y + ') scale(0.82)" d="M0,-14 C7,-14 10,-4 10,2 C10,9 5,13 0,13 C-5,13 -10,9 -10,2 C-10,-4 -7,-14 0,-14Z" fill="' +
    (bad ? '#9aa6b8' : '#fbf3e4') + '" stroke="var(--ink-soft)" stroke-width="1.6"/>' +
    (bad ? '<path transform="translate(' + x + ' ' + y + ') scale(0.82)" d="M-9,-1 L-4,3 L0,-3 L4,3 L9,-1" fill="none" stroke="#3a4558" stroke-width="2" stroke-linejoin="round"/>' : '');
  function xrowBuild() {
    const el = $('#xrow');
    if (el.dataset.ok) return;
    el.dataset.ok = '1';
    const t = (id, x, y, size, w, anchor, fill, txt) => '<text' + (id ? ' id="' + id + '"' : '') + ' x="' + x + '" y="' + y + '" font-size="' + size +
      '" font-weight="' + w + '" text-anchor="' + anchor + '" fill="' + fill + '">' + (txt || '') + '</text>';
    el.innerHTML =
      '<g id="xNest"></g>' + t('xName', 0, 12, 11, 700, 'start', 'var(--ink-faint)') +
      t('', 120, 26, 10.5, 600, 'end', 'var(--ink-soft)', 'Mama') + t('xS1', 120, 40, 12, 700, 'end', 'var(--ink)') +
      t('', 120, 72, 10.5, 600, 'end', 'var(--ink-soft)', 'Papa') + t('xS2', 120, 86, 12, 700, 'end', 'var(--ink)') +
      '<circle cx="130" cy="36" r="4" fill="var(--ink)"/><circle cx="130" cy="82" r="4" fill="var(--ink)"/>' +
      '<line id="xE1" x1="134" y1="36" x2="166" y2="54" stroke-linecap="round"/>' +
      '<line id="xE2" x1="134" y1="82" x2="166" y2="64" stroke-linecap="round"/>' +
      t('xL1', 150, 30, 11, 700, 'middle', '#f27828') + t('xL2', 150, 98, 11, 700, 'middle', '#f27828') +
      '<circle cx="183" cy="59" r="17" fill="var(--surface)" stroke="#f27828" stroke-width="2.4"/>' +
      t('', 183, 59, 14, 700, 'middle', 'var(--ink)', 'σ') + t('xBl', 183, 70.5, 9, 700, 'middle', '#5cf2c4') +
      '<line x1="200" y1="59" x2="210" y2="59" stroke="var(--ink)" stroke-width="2"/><path d="M216,59 L208,54.5 L208,63.5Z" fill="var(--ink)"/>' +
      t('', 262, 11, 10, 700, 'middle', 'var(--ink-faint)', 'NEURON SAGT') +
      [['Ei ok', 36, false], ['nicht ok', 80, true]].map(([nm, y, bad], k) =>
        '<rect id="xR' + k + '" x="222" y="' + (y - 20) + '" width="78" height="40" rx="10" fill="none" stroke-width="2"/>' +
        eggIcon(239, y, bad) +
        t('', 254, y - 4, 10, 700, 'start', 'var(--ink-soft)', nm) + t('xP' + k, 254, y + 11, 13.5, 700, 'start', 'var(--ink)') +
        '<g id="xB' + k + '"></g>').join('');
  }
  const XROW = { idx: -1 };
  function drawXor1() {
    const w = S.world, w1 = w.toW(S.p.x), w2 = w.toW(S.p.z), b = w.bias();
    const cs = w.cases(S.p.x, S.p.z), sg = z => 1 / (1 + Math.exp(-z));
    xrowBuild();
    const ci = Math.floor(performance.now() / 1600) % 4, cur = cs[ci];
    if (ci !== XROW.idx) {
      XROW.idx = ci;
      const kind = NTBild.nestKind(cur.s1, cur.s2);
      $('#xNest').innerHTML = NTBild.nestImg(kind, 40, 84, 86);
      $('#xName').textContent = NEST_TXT[kind];
      $('#xS1').textContent = cur.s1 > 0 ? 'am Nest +1' : 'fischt −1';
      $('#xS2').textContent = cur.s2 > 0 ? 'am Nest +1' : 'fischt −1';
    }
    for (const [id, wv, lid] of [['#xE1', w1, '#xL1'], ['#xE2', w2, '#xL2']]) {
      const c = wv >= 0 ? '#f27828' : '#2f80ed';
      $(id).setAttribute('stroke-width', (1.2 + Math.min(7, Math.abs(wv) * 1.6)).toFixed(1));
      $(id).setAttribute('stroke', c);
      $(lid).textContent = '· ' + (wv > 0 ? '+' : '') + fmt(wv, 1); $(lid).setAttribute('fill', c);
    }
    $('#xBl').textContent = (b > 0 ? '+' : '') + fmt(b, 1);
    verdict('x', [cur.o, 1 - cur.o], cur.o > 0.5 ? 0 : 1, cur.y === 1 ? 0 : 1);
    // Gerade: w₁·Mama + w₂·Papa + b = 0  →  c = −b
    NTNetz.nestPlot($('#xplot'), { cases: cs, out: (m, p) => sg(w1 * m + w2 * p + b), hi: ci,
      lines: [{ a: w1, b: w2, c: -b, col: '#5cf2c4', name: 'dein Neuron' }] });
    $('#xRight').textContent = w.right(cs) + ' von 4';
  }

  /* ── Level 7: Übergabe an js/zwei.js ── */
  function openTwo(L, ws, mp) {
    S.lvl = L; S.state = 'zwei'; S.auto = false;   // spiel.js zeichnet nicht mehr, bis toMenu
    applyLook();
    hudFor(null);
    NTZwei.open(L, ws || lvSeed(L.id), {
      theme: () => theme, low: () => low, fmt, stars, LS, bestKey,
      card, toMenu, toggleInfo, introHtml, verdict, eggIcon, NEST_TXT, endBar, endHide,
      next: () => LEVELS.find(l => l.id === L.id + 1) || null, open: openLevel,
      again: () => openLevel(L.id),
      newWorld: () => { setSeed(1000 + Math.floor(Math.random() * 9000)); openLevel(L.id); },
      playing: () => { S.state = 'zwei'; }
    }, mp);
  }

  /* ── Gemeinsam spielen (js/mehr.js, Migration 0296) ──
     mehr.js steuert die Runde, spiel.js spielt das Level wie allein – mit vorgegebener Welt,
     eigener Schalfarbe, ohne Übersicht/Nochmal. Ablauf:
       mpOpen(id, ws, o)   Erklärkarte mit o.intro-Knöpfen (z. B. „Bereit“)
       mpStart(left)       los (left = Restzeit vom Server bei Lauf-Leveln)
       … Spieler fertig    → o.onDone(res) und warten (state 'wait')
       mpReveal()          Runde vorbei: wer noch spielt, ist jetzt fertig; Nebel lichtet sich
       … danach            → o.onResult() statt der Sternekarte
     o = { color: [r,g,b], intro: [[label, fn, kind]…], onDone(res), onResult(), resume: {x, z, j} } */
  function mpRes() {
    const w = S.world, mine = w.show(H()), best = w.show(w.min.h);
    const r = { x: Math.round(S.p.x * 100) / 100, z: Math.round(S.p.z * 100) / 100 };
    if (w.kind === 'hills') {
      const d = Math.max(0, mine - best);
      r.s = Math.round(d * 1000) / 1000;
      r.t = d < 0.05 ? 'am tiefsten Punkt' : fmt(d, 1) + ' m über dem tiefsten Punkt';
    } else if (w.kind === 'model') {
      r.s = Math.round(mine * 10000) / 10000; r.t = '± ' + fmt(mine, 2) + ' kg daneben';
    } else if (w.kind === 'penguin') {
      const nw = w.wrong(w.toW(S.p.x), w.toW(S.p.z));
      r.s = Math.round(mine * 10000) / 10000; r.w = nw; r.t = nw + ' von ' + w.pts.length + ' falsch · Fehler ' + fmt(mine, 2);
    } else if (w.kind === 'xor1') {
      const rt = w.right(w.cases(S.p.x, S.p.z));
      r.s = Math.round(mine * 10000) / 10000; r.n = rt; r.b = Math.round(w.bias() * 10) / 10;
      r.t = rt + ' von 4 Nestern · Fehler ' + fmt(mine, 2);
    }
    // Weg für die 3D-Karte der Lehrkraft (mehr.js): Spur + Endpunkt, kompakt als Text (Server: res ≤ 600 Byte)
    const pts = S.dots.filter(d => !d.air).map(d => [d.x, d.z]);
    pts.push([S.p.x, S.p.z]);
    for (let max = 100; max >= 8; max = Math.floor(max * 0.8)) {
      r.p = pathCode(pts, w.W, max);
      if (JSON.stringify(r).length <= 590) break;
    }
    return r;
  }
  // Weg ↔ Text: je Punkt x und z als zwei Zeichen (64² Stufen über die ganze Welt)
  const PC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function pathCode(pts, W, max) {
    let use = pts;
    if (pts.length > max) {                         // gleichmäßig ausdünnen, Anfang und Ende bleiben
      use = [];
      for (let i = 0; i < max; i++) use.push(pts[Math.round(i * (pts.length - 1) / (max - 1))]);
    }
    const q = v => { const n = clamp(Math.round((v / W * 0.5 + 0.5) * 4095), 0, 4095); return PC[n >> 6] + PC[n & 63]; };
    return use.map(p => q(p[0]) + q(p[1])).join('');
  }
  function pathDecode(str, W) {
    const out = [];
    if (typeof str !== 'string') return out;
    const v = (a, b) => { const n = PC.indexOf(a) * 64 + PC.indexOf(b); return (n / 4095 - 0.5) * 2 * W; };
    for (let i = 0; i + 3 < str.length; i += 4) {
      if ([0, 1, 2, 3].some(k => PC.indexOf(str[i + k]) < 0)) break;
      out.push([v(str[i], str[i + 1]), v(str[i + 2], str[i + 3])]);
    }
    return out;
  }
  function mpDone() {
    S.auto = false; refreshAuto();
    joy.active = false; $('#joy').hidden = true;
    S.p.vx = S.p.vz = 0;
    S.state = 'wait';
    document.body.dataset.state = 'wait';
    const r = mpRes();
    MP.res = r;
    if (MP.o.onDone) MP.o.onDone(r);
  }
  const NTSpiel = window.NTSpiel = {
    LEVELS, G, introHtml, ctrlText, worldFor, fmt, card, toMenu, verdict, eggIcon, NEST_TXT, stars,
    endBar, endHide, pathDecode, rate: () => (S.world ? rate() : null), canPost, postStart,
    postN: () => S.postN, palette: id => (LEVELS.find(l => l.id === id) || {}).snow ? NIGHT : NET,
    state: () => S.state,
    theme: () => theme, low: () => low,
    // Lobby: spiel.js zeichnet nicht, ruft aber frame(dt) jedes Bild (Schnee läuft weiter)
    lobby(frame) {
      if (window.NTZwei) NTZwei.close();
      endReset();
      MP.on = true; MP.o = {}; MP.frame = frame;
      S.state = 'mp'; S.lvl = null; S.auto = false;
      document.body.classList.add('mp');
      $('#menu').hidden = true; $('#card').hidden = true; $('#labels').innerHTML = '';
      hudFor(null);
      night = true; snowy = !low;
      document.documentElement.setAttribute('data-night', '');
      document.documentElement.toggleAttribute('data-snow', snowy);
      G.setPalette(NIGHT, 'dark');
      document.body.dataset.state = 'mp';
    },
    mpOpen(id, ws, o) {
      if (window.NTZwei) NTZwei.close();
      const L = LEVELS.find(l => l.id === id);
      MP.on = true; MP.o = o || {}; MP.frame = null; MP.res = null;
      document.body.classList.add('mp');
      S.lvl = L;
      S.world = worldFor(L, ws);
      G.setWorld(S.world, theme);
      resetPlayer();
      const rs = MP.o.resume;
      if (rs && isFinite(rs.x) && isFinite(rs.z)) {
        S.p.x = rs.x; S.p.z = rs.z; S.dots = []; addDot(S.p.x, S.p.z, true);
        if (rs.j >= 0) S.jumpsLeft = rs.j;
      }
      S.state = 'intro';
      applyLook();
      hudFor(L);
      $('#labels').innerHTML = '';
      if (MP.o.intro) card(introHtml(L, ws, ctrlText(L)), MP.o.intro);
      else { $('#card').hidden = true; document.body.dataset.state = 'intro'; }
    },
    mpStart(left) {
      if (!MP.on || S.state !== 'intro') return;
      startLevel();
      if (S.lvl.mode === 'walk' && left != null) S.left = Math.max(1, left);
    },
    mpInfo() {
      if (!MP.on || !S.lvl) return null;
      return { j: S.jumpsLeft, x: Math.round(S.p.x * 10) / 10, z: Math.round(S.p.z * 10) / 10,
               h: Math.round(S.world.show(H()) * 100) / 100 };
    },
    mpReveal() {
      if (!MP.on || !S.lvl) return;
      if (S.state === 'play' || S.state === 'intro') mpDone();
      if (S.state !== 'wait') return;
      S.state = 'reveal';
      S.reveal = { t: 0, fog0: S.fogR, cam0: S.cam ? { eye: S.cam.eye.slice(), at: S.cam.at.slice() } : null };
      $('#card').hidden = true;
      document.body.dataset.state = 'reveal';
    },
    mpResult: () => MP.res,
    mpStop() { if (MP.on && S.state === 'play') mpDone(); },
    // Level 7 gemeinsam: mp = Optionen für js/zwei.js
    mpTwo(ws, mp) {
      MP.on = true; MP.o = {}; MP.frame = null;
      document.body.classList.add('mp');
      openTwo(LEVELS.find(l => l.id === 7), ws, mp);
    },
    leave() { toMenu(); }
  };

  window.addEventListener('resize', () => { if (S.lvl) updateHud(); });

  renderMenu();
  show('#menu');
  hudFor(null);
  applyLook();
  // Hintergrund im Menü: eine Welt im Nebel, langsam kreisend
  S.world = NTWelt.hills(seed, 1);
  G.setWorld(S.world, theme);
  (function menuCam() {
    const base = render;
    render = function () {
      if (S.state === 'menu') {
        const t = performance.now() / 1000 * 0.05, w = S.world;
        const at = [0, w.h(0, 0), 0];
        G.frame({ cam: { eye: [Math.sin(t) * 75, at[1] + 40, Math.cos(t) * 75], at }, fogR: 70, fogAt: [0, 0],
                  objects: [], player: { hidden: true, x: 0, z: 0 } });
        $('#labels').innerHTML = '';
        return;
      }
      base();
    };
  })();
  requestAnimationFrame(tick);
  // Einsprung von außen (erarbeitung.html „Weiter: Level 4“): index.html?lv=4
  const lvQ = parseInt(new URLSearchParams(location.search).get('lv'), 10);
  if (LEVELS.some(l => l.id === lvQ && !l.href)) {
    // im Raum erst die Freigaben abwarten (kommen vom Rahmen)
    (R.ready ? R.ready(2500) : Promise.resolve()).then(() => { if (S.state === 'menu' && R.shared(lvQ)) openLevel(lvQ); });
  }
})();
