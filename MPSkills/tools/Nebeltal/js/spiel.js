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

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
  };

  /* Erklärkarte: Bild aus js/bilder.js (NTBild.scene) + kurze Schritte.
     steps = Sätze neben nummerierten Kreisen, je Schritt EIN Gedanke. */
  const LEVELS = [
    { id: 1, name: 'Im Schneesturm', short: 'Frei suchen – ganz ohne Hilfe',
      mode: 'walk', arrow: false, time: 75, fog: 9, plain: true, physics: false, snow: true,
      lead: 'Irgendwo in dieser Eiswüste liegt der <b>tiefste Punkt</b>. Finde ihn!',
      steps: [
        'Im Schneesturm siehst du nur den Schnee direkt um dich herum – <b>keine Farben, keine Höhenlinien, kein Höhenmesser</b>.',
        'Ob es bergauf oder bergab geht, musst du <b>selbst herausfinden</b>. Das ist schwer!',
        'Es gibt viele Mulden, aber nur eine ist die tiefste. Du hast <b>75 Sekunden</b>, dann tippe <b>„Hier bleibe ich“</b>.'],
      outro: 'So geht es einer KI beim Lernen: Sie kennt nur den <b>Fehler an der Stelle, an der sie gerade steht</b>. ' +
             'Die ganze Landschaft hat nie jemand gesehen. Frei herumsuchen dauert ewig – die KI braucht einen besseren Hinweis …' },
    { id: 2, name: 'Der Bergab-Pfeil', short: 'Ein Pfeil zeigt, wo es bergab geht',
      mode: 'walk', arrow: true, time: 60, fog: 9, plain: true, physics: true, snow: true,
      lead: 'Jetzt hast du ein Werkzeug – genau das, das auch eine KI beim Lernen hat.',
      steps: [
        'Ein <b>leuchtender Pfeil</b> unter deinen Füßen zeigt, wo es am steilsten bergab geht. Je länger, desto steiler.',
        'Sonst ist alles wie eben: Schneesturm, kein Höhenmesser. Bergab läufst du schneller, steile Hänge rutschst du hinunter.',
        'Achtung: Der Pfeil kennt nur den Weg zur <b>nächsten</b> Mulde. Du hast <b>60 Sekunden</b>.'],
      outro: 'Der Pfeil ist das Einzige, was eine KI beim Lernen ausrechnen kann: <b>In welche Richtung wird mein Fehler kleiner?</b> ' +
             'Man nennt ihn <b>Gradient</b> (genauer: er zeigt gegen den Gradienten). Ein neuronales Netz rechnet ihn für jedes seiner Gewichte aus – das heißt Backpropagation.' },
    { id: 3, name: 'Sprünge', short: 'Lernrate = wie weit du springst',
      mode: 'jump', jumps: 25, fog: 13, plain: true, snow: true, lr: { min: 0.5, max: 60, def: 5, d: 1 },
      lead: 'Eine KI läuft nicht herum. Sie <b>springt</b> – immer in Pfeilrichtung.',
      formula: 'Sprungweite = Lernrate × Steilheit',
      steps: [
        'Wie weit, stellst du mit der <b>Lernrate</b> ein. An flachen Stellen werden die Sprünge von selbst kürzer, an steilen länger.',
        'Der <b>Ring</b> zeigt, wo du landen würdest.',
        'Du hast <b>25 Sprünge</b> – Rechenzeit ist nicht unendlich. Unterwegs warten Mulden, eine Schlucht und ein Gebirge.'],
      outro: 'Die Sprungweite heißt <b>Lernrate</b>. Zu klein: Du kommst kaum voran oder bleibst in der ersten Mulde hängen. ' +
             'Zu groß: Du springst über das Tal hinweg oder fliegst raus. Beim echten Training startet man oft mit großen Sprüngen und wird dann kleiner.' },
    { id: 4, name: 'Wie schwer ist der Pinguin?', short: 'Ein Neuron schätzt das Gewicht aus der Flosse',
      mode: 'jump', walk: true, jumps: 30, fog: 14, auto: true, world: 'model', lr: { min: 0.01, max: 1, def: 0.03, d: 2 },
      lead: 'Forschende in der Antarktis haben <b>342 echte Pinguine</b> vermessen. Einen Pinguin auf dem Eis zu wiegen ist mühsam – seine Flosse kann man auf einem Foto messen.',
      steps: [
        'Ab jetzt steckt hinter jeder Welt ein echtes <b>Neuron</b>. Dieses schätzt aus der <b>Flosse</b> das <b>Gewicht</b>. Es hat zwei Werte, die es lernen kann: <b>w</b> und <b>b</b>.',
        'Wo du stehst, <b>sind</b> w und b: <b>links/rechts = w</b>, <b>vor/zurück = b</b>. Jeder Ort ist ein anderes Neuron.',
        'Die Höhe ist der <b>Fehler</b>: um wie viele kg das Neuron im Schnitt danebenliegt – über alle 342 Pinguine.',
        'Lauf herum und schau rechts zu, wie das Neuron Pinguin für Pinguin schätzt. Dann Lernrate wählen und <b>„Training starten“</b>. Achtung: Die Lernrate ist hier heikel!'],
      outro: 'Ein Neuron ohne Aktivierungsfunktion ist einfach eine <b>Gerade</b>: Gewicht mal Eingang plus Bias. Die Landschaft war sein Fehler – eine glatte Schüssel mit genau einem Tal. ' +
             'Besser als ± 0,4 kg geht es mit der Flosse allein nicht: Pinguine mit gleicher Flosse sind eben verschieden schwer. ' +
             'Trotzdem kann man das Tal verpassen: Ist die Lernrate zu groß, springt man immer weiter darüber hinaus, und das Training <b>explodiert</b>. ' +
             'Im nächsten Level kommt hinter das Σ noch ein <b>σ</b> – und schon kann dasselbe Neuron sortieren statt schätzen.' },
    { id: 5, name: 'Pinguine sortieren', short: 'Ein Neuron lernt zwei Arten zu trennen',
      mode: 'jump', walk: true, jumps: 40, fog: 14, auto: true, world: 'penguin', lr: { min: 0.2, max: 50, def: 1.5, d: 1 },
      lead: 'Dieselben Forschenden wollen wissen: <b>Welche Art ist das?</b> Adeliepinguin (●) oder Zügelpinguin (▲)?',
      steps: [
        'Gemessen wurde der <b>Schnabel</b>: Länge und Höhe in mm – echte Messwerte von 136 Pinguinen.',
        'Ein Neuron mit <b>σ</b> soll sie auseinanderhalten. σ macht aus der Summe eine Zahl zwischen 0 und 100 %: <b>wie sicher „Zügel“</b>.',
        'Wo du stehst, <b>sind</b> die zwei Gewichte: <b>links/rechts = w₁</b> (Länge), <b>vor/zurück = w₂</b> (Höhe). Höhe = Fehler.',
        'Lauf herum und schau rechts, wie sich die Trennlinie dreht. Dann Lernrate wählen und <b>„Training starten“</b>.'],
      outro: 'Das war echtes Training eines Neurons: Jeder Sprung verändert die beiden Gewichte ein Stück bergab, bis die Trennlinie die Pinguine sortiert. ' +
             'Die Richtung vom Mittelpunkt der Welt bestimmt, <b>wie die Linie liegt</b>, der Abstand, <b>wie sicher</b> das Neuron entscheidet. ' +
             'Ein großes Netz besteht aus Tausenden solcher Neuronen hintereinander – und seine Landschaft hat so viele Richtungen, wie es Gewichte hat.' },
    { id: 6, name: 'Das Nest', short: 'Ein Neuron reicht nicht',
      mode: 'jump', walk: true, jumps: 30, fog: 14, auto: true, world: 'xor1', lr: { min: 0.2, max: 40, def: 2, d: 1 },
      lead: 'Pinguin-Eltern <b>wechseln sich ab</b>: Einer brütet, der andere geht fischen.',
      steps: [
        'Dem Ei geht es nur gut, wenn <b>genau einer</b> am Nest ist. Sind beide weg, kühlt es aus. Sind beide da, holt keiner Futter.',
        'Ein einzelnes Neuron soll das lernen. Eingänge: <b>Mama am Nest?</b> und <b>Papa am Nest?</b> (ja/nein), dazu zwei Gewichte <b>w₁</b> und <b>w₂</b>.',
        'Wie immer: <b>links/rechts = w₁</b>, <b>vor/zurück = w₂</b>, Höhe = Fehler. Rechts siehst du alle vier Nester.',
        'Such das Neuron, das alle vier Nester richtig beurteilt – laufend oder mit <b>„Training starten“</b>.',
        'Rechts am Kasten gibt es einen Regler für den <b>Bias</b>. Er verschiebt die Gerade. Hilft das?'],
      outro: 'Egal, wie lange man sucht: <b>Ein einzelnes Neuron schafft das nicht.</b> Es kann die vier Nester nur mit einer geraden Linie trennen, ' +
             '„genau einer da“ liegt aber über Kreuz. Der tiefste Punkt ist die Mitte – dort sagt das Neuron bei jedem Nest <b>50 %</b>, also „ich weiß es nicht“. ' +
             'Mit dem <b>Bias</b> verschiebst du die Gerade: Dann stimmen höchstens <b>3 von 4</b> – nie alle. ' +
             'Das war lange ein echtes Problem der KI-Forschung (es heißt XOR). Die Lösung: ein zweites Neuron dazwischen. Das probierst du im nächsten Level.' },
    { id: 7, name: 'Zwei Neuronen, zwei Welten', short: 'Das Nest mit zwei Neuronen – jede Welt ein Neuron',
      two: true, jumps: 40, fog: 14, lr: { min: 0.2, max: 30, def: 4, d: 1 },
      lead: 'Jetzt hat das Netz <b>zwei Neuronen A und B</b> zwischen Mama/Papa und „Ei ok?“.',
      steps: [
        'Das Netz hat damit <b>vier Gewichte</b>, die es lernen kann – zu viele für eine Welt. Darum gibt es <b>zwei Welten</b>.',
        '<b class="ca">Welt A</b> = die beiden Kanten in Neuron A, <b class="cb">Welt B</b> = die beiden Kanten in Neuron B.',
        'Alles Graue <b>steht fest</b>: die Biase (−3 in A und B, −5 am Ausgang) und die Gewichte 8 zum Ausgang. Anders als eben gibt es hier <b>keinen Bias-Regler</b> – gelernt werden nur die vier farbigen Kanten.',
        'Beide Figuren gehören zu <b>einem</b> Netz – darum stehen sie immer auf derselben Höhe. Bewegt sich die eine, verbiegt sich die Welt der anderen.',
        'Spielt zu zweit (jede Person eine Seite) oder allein mit zwei Daumen. Oder startet das Training.'],
      outro: 'Mit zwei Neuronen klappt es: Eines lernt „<b>nur Mama am Nest</b>“, das andere „<b>nur Papa am Nest</b>“ – das Ei ist versorgt, wenn eines von beiden anschlägt. ' +
             'Welches Neuron welche Aufgabe übernimmt, ist egal: Es gibt <b>zwei gleich gute Lösungen</b>. ' +
             'Lernen beide Neuronen dasselbe, bleibt das Netz bei 3 von 4 hängen. Echte Netze starten deshalb mit <b>zufälligen</b> Gewichten. ' +
             'Und weil die Gewichte voneinander abhängen, hat sich deine Welt verbogen, sobald die andere Figur lief.' },
    // Level 8 = das Labor (eigene Seite labor.html, Sönke 17.11.2026): 4 Neuronen, 8 Welten
    { id: 8, name: 'Pinguine in 3D', short: 'Ein Netz mit 4 Neuronen sortiert drei Arten', href: 'labor.html?level=8' }
  ];

  /* Erklärkarte bauen (auch von js/zwei.js benutzt) */
  function introHtml(L, seed, ctrl) {
    return '<div class="card-kicker">Level ' + L.id + ' · Welt ' + seed + '</div>' +
      '<h2>' + L.name + '</h2>' +
      '<p class="lead">' + L.lead + '</p>' +
      (window.NTBild ? '<div class="illwrap">' + NTBild.scene(L.id) + '</div>' : '') +
      (L.formula ? '<span class="formula">' + L.formula + '</span>' : '') +
      '<ol class="steps">' + L.steps.map(s => '<li>' + s + '</li>').join('') + '</ol>' +
      '<p class="ctrl">' + ctrl + '</p>';
  }

  /* ── Grundzustand ── */
  const canvas = $('#welt');
  const G = NTGrafik.create(canvas);
  if (!G) { $('#nogl').hidden = false; return; }

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

  const S = {
    state: 'menu', lvl: null, world: null,
    p: { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, tilt: 0, squash: 1, phase: 0 },
    camYaw: 0, camYawT: null, fogR: 9,
    t0: 0, left: 0, jumpsLeft: 0, dots: [], trailD: 0,
    jump: null, fly: null, lr: 1, auto: false, autoWait: 0,
    curve: [], best: Infinity, lrs: [], outs: 0,
    reveal: null, cam: null, startPos: null
  };

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
    $('#seed').value = seed;
    renderMenu();
  }
  $('#seed').addEventListener('change', e => setSeed(parseInt(e.target.value, 10)));
  $('#seedDice').addEventListener('click', () => setSeed(1000 + Math.floor(Math.random() * 9000)));

  /* ── Menü ── */
  const bestKey = (lvl) => 'nt.best.' + lvl + '.' + seed;
  const stars = n => '<span class="stars" aria-label="' + n + ' von 3 Sternen">' +
    [1, 2, 3].map(i => '<i class="' + (i <= n ? 'on' : '') + '">★</i>').join('') + '</span>';

  function renderMenu() {
    $('#seed').value = seed;
    $('#levels').innerHTML = LEVELS.map(L => {
      const b = parseInt(LS.get(bestKey(L.id)), 10);
      return '<button class="lv" data-lv="' + L.id + '">' +
        '<span class="lv-n">' + L.id + '</span>' +
        '<span class="lv-t"><b>' + L.name + '</b><small>' + L.short + '</small></span>' +
        (b >= 0 ? stars(b) : '<span class="stars empty"></span>') + '</button>';
    }).join('');
    document.querySelectorAll('#levels .lv').forEach(b => b.addEventListener('click', () => openLevel(+b.dataset.lv)));
  }

  function show(id) {
    for (const s of ['#menu', '#card']) $(s).hidden = s !== id;
    document.body.dataset.state = S.state;
  }

  function toMenu() {
    if (window.NTZwei) NTZwei.close();
    S.state = 'menu'; S.auto = false;
    applyLook();
    renderMenu();
    show('#menu');
    hudFor(null);
  }
  $('#btnMenu').addEventListener('click', toMenu);

  /* ── Level öffnen ── */
  function openLevel(id) {
    const L = LEVELS.find(l => l.id === id);
    if (L.href) { location.href = L.href; return; }
    S.lvl = L;
    if (L.two) { openTwo(L); return; }
    S.world = L.world === 'model' ? NTWelt.model(seed) : L.world === 'penguin' ? NTWelt.penguins(seed)
      : L.world === 'xor1' ? NTWelt.xor(seed).one() : NTWelt.hills(seed, id);
    G.setWorld(S.world, theme);
    resetPlayer();
    S.state = 'intro';
    applyLook();
    hudFor(L);
    card(introHtml(L, seed, L.mode === 'walk'
        ? '<b>Steuerung:</b> links auf dem Bild ziehen = laufen · rechts ziehen = umschauen<br><span class="kbd">Tastatur: WASD oder Pfeile · Q/E drehen</span>'
        : L.walk
        ? '<b>Steuerung:</b> links auf dem Bild ziehen = laufen · rechts ziehen = umschauen · <b>Springen</b> = ein Lernschritt<br><span class="kbd">Tastatur: WASD laufen · Leertaste springt · Q/E drehen</span>'
        : '<b>Steuerung:</b> Lernrate einstellen, dann <b>Springen</b> · ziehen = umschauen<br><span class="kbd">Tastatur: Leertaste springt · Q/E drehen</span>'),
      [['Los geht’s', startLevel, 'primary'], ['Übersicht', toMenu]]);
  }

  function resetPlayer() {
    const w = S.world, L = S.lvl;
    Object.assign(S.p, { x: w.start.x, z: w.start.z, vx: 0, vz: 0, tilt: 0, squash: 1, phase: 0 });
    const g = w.grad(w.start.x, w.start.z);
    S.p.yaw = Math.atan2(-g[0], -g[1]);
    S.camYaw = S.p.yaw; S.camYawT = null;
    S.startPos = { x: w.start.x, z: w.start.z };
    S.fogR = L.fog;
    S.dots = []; S.trailD = 0; S.jump = null; S.fly = null; S.auto = false; S.autoWait = 0;
    S.curve = [w.show(w.h(S.p.x, S.p.z))];
    S.best = S.curve[0]; S.lrs = []; S.outs = 0; S.reveal = null;
    S.left = L.time || 0; S.jumpsLeft = L.jumps || 0;
    if (L.lr) setLR(L.lr.def);
    if (w.setBias && w.bias() !== 0) setBias(0);
    else if (w.setBias) { $('#xBias').value = 0; $('#xBiasV').textContent = '0,0'; }
    addDot(S.p.x, S.p.z, true);
  }

  function startLevel() {
    S.state = 'play';
    show(null);
    $('#card').hidden = true;
    hudFor(S.lvl);
    updateHud();
    if (S.lvl.mode === 'walk') toast(S.lvl.arrow ? 'Folge dem Pfeil – oder auch nicht.' : 'Wo geht es nach unten?');
    if (S.world.kind === 'penguin') toast('Lauf los und schau rechts auf die Trennlinie.');
    if (S.world.kind === 'model') toast('Lauf los und schau rechts, wie gut das Neuron schätzt.');
    if (S.world.kind === 'xor1') toast('Lauf los und schau rechts auf die vier Nester.');
  }

  /* ── Karte (Intro / Ergebnis) ── */
  function card(html, buttons, cls) {
    const c = $('#card');
    c.className = 'card ' + (cls || '');
    c.innerHTML = '<div class="card-in">' + html + '<div class="card-btns"></div></div>';
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
    document.body.dataset.state = S.state;
  }

  /* ── HUD ── */
  function hudFor(L) {
    document.body.dataset.mode = L ? L.mode : '';
    document.body.dataset.lvl = L ? L.id : '';
    $('#hud').hidden = !L;
    if (!L) return;
    $('#lvlName').textContent = 'Level ' + L.id + ' · ' + L.name;
    $('#gLbl').textContent = S.world.label;
    $('#btnStay').textContent = L.mode === 'walk' ? 'Hier bleibe ich!' : 'Fertig';
    $('#btnAuto').hidden = !L.auto;
    $('#modelBox').hidden = !(S.world && S.world.kind === 'model');
    $('#pengBox').hidden = !(S.world && S.world.kind === 'penguin');
    $('#xorBox').hidden = !(S.world && S.world.kind === 'xor1');
    $('#curveBox').hidden = L.mode !== 'jump';
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
      const s = Math.ceil(Math.max(0, S.left));
      $('#counter').textContent = '⏱ ' + s + ' s';
      $('#counter').classList.toggle('warn', s <= 10);
    } else {
      $('#counter').textContent = (w.kind === 'hills' ? 'Sprünge' : 'Schritte') + ': ' + S.jumpsLeft;
      $('#counter').classList.toggle('warn', S.jumpsLeft <= 3);
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
    $('#xBias').value = Math.round(v * 10);
    $('#xBiasV').textContent = (v > 0 ? '+' : '') + fmt(v, 1);
    if (!biasT) biasT = setTimeout(() => { biasT = 0; if (S.world === w) G.setWorld(w, theme); }, 90);
  }
  $('#xBias').addEventListener('input', e => setBias(e.target.value / 10));
  $('#xBias').addEventListener('change', e => e.target.blur());   // Pfeiltasten wieder fürs Laufen

  $('#btnJump').addEventListener('click', () => doJump());
  $('#btnStay').addEventListener('click', () => { if (S.state === 'play' && !S.jump && !S.fly) finish(); });
  $('#btnAuto').addEventListener('click', () => {
    if (S.state !== 'play') return;
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
    if (S.state !== 'play' || S.lvl.mode !== 'jump' || S.jump || S.fly || S.jumpsLeft <= 0) return;
    const w = S.world, from = { x: S.p.x, z: S.p.z };
    const q = w.step(from, S.lr);
    const dist = Math.hypot(q.x - from.x, q.z - from.z);
    S.lrs.push(S.lr);
    S.jumpsLeft--;
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
    S.state = 'reveal'; S.auto = false; refreshAuto();
    joy.active = false; $('#joy').hidden = true;
    S.p.vx = S.p.vz = 0;
    const w = S.world;
    S.reveal = { t: 0, fog0: S.fogR, cam0: S.cam ? { eye: S.cam.eye.slice(), at: S.cam.at.slice() } : null };
    document.body.dataset.state = 'reveal';
  }

  function showResult() {
    S.state = 'result';
    const w = S.world, L = S.lvl;
    const mine = w.show(H()), best = w.show(w.min.h);
    let n, line;
    if (w.kind === 'xor1') {
      const d = mine - best;
      n = d < 0.02 ? 3 : d < 0.15 ? 2 : d < 0.5 ? 1 : 0;
      const cs = w.cases(S.p.x, S.p.z);
      line = 'Dein Neuron beurteilt <b>' + w.right(cs) + ' von 4</b> Nestern richtig' +
        '<br><small>Fehler ' + fmt(mine, 2) + ' · kleinstmöglich ' + fmt(best, 2) +
        (w.bias() ? ' bei Bias ' + fmt(w.bias(), 1) + ' · ohne Bias ' + fmt(Math.LN2, 2) + ' (= überall 50 %)' : ' (= überall 50 %)') + '</small>';
    } else if (w.kind === 'penguin') {
      const nw = w.wrong(w.toW(S.p.x), w.toW(S.p.z)), nb = w.wrong(w.min.w1, w.min.w2), d = nw - nb;
      n = d <= 0 && mine < best * 1.6 ? 3 : d <= 2 ? 2 : d <= 8 ? 1 : 0;
      line = 'Dein Neuron sortiert <b>' + nw + ' von ' + w.pts.length + '</b> Pinguinen falsch' +
        ' · bestes Neuron: <b>' + nb + '</b> falsch<br><small>Fehler ' + fmt(mine, 2) + ' · kleinstmöglich ' + fmt(best, 2) + '</small>';
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
    const old = parseInt(LS.get(bestKey(L.id)), 10);
    if (!(old >= n)) LS.set(bestKey(L.id), String(n));

    // Was ist passiert? Ein Satz passend zum Verlauf
    const g = w.grad(S.p.x, S.p.z), steep = Math.hypot(g[0], g[1]);
    const notes = [];
    if (L.mode === 'jump') {
      if (S.outs) notes.push('Mindestens ein Sprung ging ins Leere – da war die <b>Lernrate zu groß</b>.');
      const zig = zigzag();
      if (zig && n < 3) notes.push('Du bist im Zickzack hin und her gesprungen: Du bist über das Tal hinweggesprungen. Etwas <b>kleinere Lernrate</b> hilft.');
      if (!S.outs && !zig && n < 2 && steep > 0.15) notes.push('Du warst noch mitten am Hang, als die Sprünge alle waren: Die <b>Lernrate war zu klein</b>.');
    }
    if (w.kind === 'hills' && n < 3 && steep < 0.12) notes.push('Du stehst in einer Mulde – aber nicht in der tiefsten. Das nennt man ein <b>lokales Minimum</b>. Von dort aus geht es in keiner Richtung bergab.');

    const next = LEVELS.find(l => l.id === L.id + 1);
    const btns = [['Nochmal', () => openLevel(L.id)]];
    if (next) btns.unshift(['Weiter: ' + next.name, () => openLevel(next.id), 'primary']);
    btns.push(['Neue Welt', () => { setSeed(1000 + Math.floor(Math.random() * 9000)); openLevel(L.id); }]);
    btns.push(['Übersicht', toMenu]);
    card(
      '<div class="card-kicker">Level ' + L.id + ' · Welt ' + seed + '</div>' +
      '<div class="res-head">' + stars(n) + '<p>' + line + '</p></div>' +
      (notes.length ? '<p class="note">' + notes.join(' ') + '</p>' : '') +
      '<div class="ki"><span class="ki-tag">Und die KI?</span><p>' + L.outro + '</p></div>',
      btns, 'result');
  }

  function zigzag() {
    // Richtungswechsel um mehr als 120° bei aufeinanderfolgenden Sprüngen
    const pts = S.dots.filter(d => d.big);
    let flips = 0;
    for (let i = 2; i < pts.length; i++) {
      const ax = pts[i - 1].x - pts[i - 2].x, az = pts[i - 1].z - pts[i - 2].z;
      const bx = pts[i].x - pts[i - 1].x, bz = pts[i].z - pts[i - 1].z;
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la > 0.3 && lb > 0.3 && (ax * bx + az * bz) / (la * lb) < -0.5) flips++;
    }
    return flips >= 2;
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
    if (e.key === ' ' && S.state === 'play') { e.preventDefault(); doJump(); }
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
    }
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
        toast('Zu weit! Die <b>Lernrate</b> war zu groß – du bist aus der Welt geflogen.');
        S.curve.push(w.show(H()));
        updateHud();
        if (S.jumpsLeft <= 0) setTimeout(() => { if (S.state === 'play') finish(); }, 800);
        if (S.auto) { S.auto = false; refreshAuto(); }
      }
    } else p.air = 0;
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
    const showArrow = L && S.state === 'play' && (L.arrow || L.mode === 'jump') && !S.jump && !S.fly;
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
    if (L && L.mode === 'jump' && S.state === 'play' && !S.jump && !S.fly && S.jumpsLeft > 0) {
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
    const sc = { cam, fogR, dpr, objects: objs, playerColor: acc, plain,
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
    // Breiter Bildschirm: Ergebniskarte steht rechts, Welt rückt nach links
    // (Kamera schaut nach +z, rechts auf dem Bild = −x).
    const wide = window.innerWidth >= 900, k = w.W / 50;
    const at = [(wide ? -15 : 0) * k, (w.min.h + w.h(0, 0)) / 2, (wide ? 2 : 14) * k];
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
  function mrowBuild() {
    const el = $('#mrow');
    if (el.dataset.ok) return;
    el.dataset.ok = '1';
    el.innerHTML =
      '<g id="mPg"></g>' +
      '<text id="mName" x="0" y="12" font-size="11" font-weight="700" text-anchor="start" fill="var(--ink-faint)"></text>' +
      '<text x="96" y="32" font-size="11" font-weight="600" text-anchor="middle" fill="var(--ink-soft)">Flosse</text>' +
      '<text id="mF" x="96" y="47" font-size="13" font-weight="700" text-anchor="middle" fill="var(--ink)"></text>' +
      '<circle cx="96" cy="60" r="4" fill="var(--ink)"/>' +
      '<line id="mEdge" x1="100" y1="60" x2="158" y2="60" stroke="#f27828" stroke-linecap="round"/>' +
      '<text id="mWl" x="130" y="78" font-size="12" font-weight="700" text-anchor="middle" fill="#f27828"></text>' +
      '<circle cx="176" cy="60" r="18" fill="var(--surface)" stroke="#f27828" stroke-width="2.4"/>' +
      '<text x="176" y="59" font-size="13" font-weight="700" text-anchor="middle" fill="var(--ink)">Σ</text>' +
      '<text id="mBl" x="176" y="71" font-size="9.5" font-weight="700" text-anchor="middle" fill="#f27828"></text>' +
      '<line x1="194" y1="60" x2="206" y2="60" stroke="var(--ink)" stroke-width="2"/><path d="M212,60 L204,55.5 L204,64.5Z" fill="var(--ink)"/>' +
      '<text id="mOut" x="276" y="52" font-size="15" font-weight="700" text-anchor="end" fill="var(--ink)"></text>' +
      '<text id="mReal" x="276" y="68" font-size="11" font-weight="600" text-anchor="end" fill="var(--ink-soft)"></text>' +
      '<text id="mDiff" x="276" y="84" font-size="11" font-weight="700" text-anchor="end"></text>';
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
      $('#mPg').innerHTML = NTBild.peng({ sp: cur.sp, x: 34, y: 96, s: 0.62 });
      $('#mName').textContent = NTBild.SP[cur.sp].name;
      $('#mF').textContent = fmt(cur.x, 1) + ' cm';
      $('#mReal').textContent = 'echt ' + fmt(cur.y, 2) + ' kg';
    }
    const est = w.pred(wv, bv, cur.x), diff = est - cur.y;
    $('#mEdge').setAttribute('stroke-width', (1.4 + Math.min(7, Math.abs(wv) * 4)).toFixed(1));
    $('#mEdge').setAttribute('stroke', wv >= 0 ? '#f27828' : '#2f80ed');
    $('#mWl').textContent = '· ' + fmt(wv, 2);
    $('#mWl').setAttribute('fill', wv >= 0 ? '#f27828' : '#2f80ed');
    $('#mBl').textContent = (bv >= 0 ? '+' : '') + fmt(bv, 2);
    $('#mOut').textContent = '≈ ' + fmt(est, 2) + ' kg';
    const ad = Math.abs(diff);
    $('#mDiff').textContent = ad < 0.05 ? 'fast genau!' : fmt(ad, 2) + ' kg ' + (diff > 0 ? 'zu schwer' : 'zu leicht');
    $('#mDiff').setAttribute('fill', ad < 0.25 ? 'var(--accent-ink)' : 'var(--warn)');

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

  /* ── Level 6: ein Neuron, das Nest ── */
  function drawXor1() {
    const w = S.world, w1 = w.toW(S.p.x), w2 = w.toW(S.p.z), b = w.bias();
    NTNetz.draw($('#xnet'), { biasInside: true,
      nodes: [{ id: 's1', kind: 'in', x: 0.04, y: 0.2, label: 'Mama' }, { id: 's2', kind: 'in', x: 0.04, y: 0.8, label: 'Papa' },
              { id: 'n', kind: 'n', x: 0.56, y: 0.5, group: 'a', bias: b, biasD: 1, biasGroup: '#5cf2c4' },
              { id: 'l', kind: 'out', x: 0.76, y: 0.5, label: 'Ei ok?' }],
      edges: [{ from: 's1', to: 'n', w: w1, group: 'a' }, { from: 's2', to: 'n', w: w2, group: 'a' }]
    });
    const cs = w.cases(S.p.x, S.p.z), sg = z => 1 / (1 + Math.exp(-z));
    // Gerade: w₁·Mama + w₂·Papa + b = 0  →  c = −b
    NTNetz.nestPlot($('#xplot'), { cases: cs, out: (m, p) => sg(w1 * m + w2 * p + b),
      lines: [{ a: w1, b: w2, c: -b, col: '#5cf2c4', name: 'dein Neuron' }] });
    $('#xRight').textContent = w.right(cs) + ' von 4';
  }

  /* ── Level 7: Übergabe an js/zwei.js ── */
  function openTwo(L) {
    S.lvl = L; S.state = 'zwei'; S.auto = false;   // spiel.js zeichnet nicht mehr, bis toMenu
    applyLook();
    hudFor(null);
    NTZwei.open(L, seed, {
      theme: () => theme, low: () => low, fmt, stars, LS, bestKey,
      card, toMenu, introHtml,
      next: () => LEVELS.find(l => l.id === L.id + 1) || null, open: openLevel,
      again: () => openLevel(L.id),
      newWorld: () => { setSeed(1000 + Math.floor(Math.random() * 9000)); openLevel(L.id); },
      playing: () => { S.state = 'zwei'; }
    });
  }

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
})();
