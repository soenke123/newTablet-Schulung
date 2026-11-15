/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/spiel.js   ·   Ablauf, Steuerung, Anzeige
   ══════════════════════════════════════════════════════════════
   Vier Level, jedes auf seiner eigenen Welt (Welt-Nummer = Seed, gleiche
   Nummer = gleiche Landschaft auf jedem Tablet – so kann die Klasse
   schon jetzt gegeneinander spielen, ganz ohne Server):

     1 Im Nebel         frei laufen, nur der Höhenmesser hilft
     2 Bergab-Pfeil     frei laufen, Pfeil unter den Füßen = Gradient
     3 Sprünge          nicht mehr laufen: springen in Pfeilrichtung,
                        Weite = Lernrate × Steilheit (Gradientenabstieg)
     4 Modell           die Welt ist der Fehler einer Geraden, Training
                        startet von selbst mit fester Lernrate

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

  const LEVELS = [
    { id: 1, name: 'Im Nebel', short: 'Frei suchen – nur mit dem Höhenmesser',
      mode: 'walk', arrow: false, time: 75, fog: 9, plain: true, physics: false,
      intro: 'Irgendwo in diesem großen Tal liegt der <b>tiefste Punkt</b>. Du siehst nur den Boden direkt um dich herum – ' +
             'keine Farben, keine Höhenlinien. Nur der Höhenmesser links verrät, wie hoch du gerade stehst.<br><br>' +
             'Vorsicht: Es gibt viele Mulden, aber nur eine ist die tiefste. ' +
             'Finde sie in <b>75 Sekunden</b> und tippe auf <b>„Hier bleibe ich“</b>.',
      outro: 'So geht es einer KI beim Lernen: Sie kennt nur den <b>Fehler an der Stelle, an der sie gerade steht</b>. ' +
             'Die ganze Landschaft hat nie jemand gesehen. Frei herumsuchen dauert ewig – die KI braucht einen besseren Hinweis …' },
    { id: 2, name: 'Der Bergab-Pfeil', short: 'Ein Pfeil zeigt, wo es bergab geht',
      mode: 'walk', arrow: true, time: 60, fog: 9, physics: true,
      intro: 'Jetzt hast du Werkzeuge: Ein <b>Pfeil</b> unter deinen Füßen zeigt, wo es am steilsten bergab geht – ' +
             'je länger, desto steiler. Dazu verraten <b>Farben und Höhenlinien</b> die Höhe, und bergab läufst du schneller.<br><br>' +
             'Genau diesen Pfeil hat auch eine KI beim Lernen. Aber Achtung: Er kennt nur den Weg zur <b>nächsten</b> Mulde. Du hast <b>60 Sekunden</b>.',
      outro: 'Der Pfeil ist das Einzige, was eine KI beim Lernen ausrechnen kann: <b>In welche Richtung wird mein Fehler kleiner?</b> ' +
             'Man nennt ihn <b>Gradient</b> (genauer: er zeigt gegen den Gradienten). Ein neuronales Netz rechnet ihn für jedes seiner Gewichte aus – das heißt Backpropagation.' },
    { id: 3, name: 'Sprünge', short: 'Lernrate = wie weit du springst',
      mode: 'jump', jumps: 20, fog: 13, lr: { min: 0.5, max: 60, def: 5, d: 1 },
      intro: 'Eine KI läuft nicht herum. Sie <b>springt</b> – immer in Pfeilrichtung.<br><br>' +
             'Wie weit, bestimmst du mit der <b>Lernrate</b>:<br><span class="formula">Sprungweite = Lernrate × Steilheit</span>' +
             'An flachen Stellen werden die Sprünge also von selbst kürzer, an steilen länger – genau wie beim echten Training. ' +
             'Der Ring zeigt, wo du landen würdest.<br><br>' +
             'Du hast <b>20 Sprünge</b> – jeder Sprung kostet eine KI Rechenzeit, unendlich viele gibt es nicht. Achtung, hier gibt es viele kleine Mulden.',
      outro: 'Die Sprungweite heißt <b>Lernrate</b>. Zu klein: Du kommst kaum voran oder bleibst in der ersten Mulde hängen. ' +
             'Zu groß: Du springst über das Tal hinweg oder fliegst raus. Beim echten Training startet man oft mit großen Sprüngen und wird dann kleiner.' },
    { id: 4, name: 'Das Tal ist ein Modell', short: 'Hinter der Landschaft steckt eine KI',
      mode: 'jump', jumps: 30, fog: 14, auto: true, world: 'model', lr: { min: 0.003, max: 0.3, def: 0.02, d: 3 },
      intro: 'Diesmal steckt ein echtes Modell hinter der Welt: Eine <b>Gerade</b> soll möglichst gut durch Messpunkte gehen (rechts: Höhe einer Sonnenblume nach Wochen).<br><br>' +
             'Wo du stehst, bestimmt die Gerade: <b>links/rechts = Steigung w</b>, <b>vor/zurück = Höhe b</b>. Die Höhe der Landschaft ist der <b>Fehler</b> der Geraden.<br><br>' +
             'Bergab heißt also: Die Gerade wird besser. Das ist <b>Training</b>! Wähle eine Lernrate und tippe <b>„Training starten“</b> – oder springe selbst.',
      outro: 'Die Landschaft war die ganze Zeit der <b>Fehler der Geraden</b>. Genau so lernt ein neuronales Netz: Es springt mit seiner Lernrate bergab, Schritt für Schritt, ganz von selbst. ' +
             'Nur hat ein echtes Netz nicht 2 Richtungen (w und b), sondern <b>Millionen</b> – und die Landschaft entsteht aus seinen Trainingsdaten.' }
  ];

  /* ── Grundzustand ── */
  const canvas = $('#welt');
  const G = NTGrafik.create(canvas);
  if (!G) { $('#nogl').hidden = false; return; }

  let low = !!(window.LWMotion && LWMotion.low);
  window.addEventListener('lernwelt:motion', () => { low = !!(window.LWMotion && LWMotion.low); });

  let theme = 'light';
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
      if (nt !== theme) { theme = nt; G.setTheme(theme); }
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
    S.state = 'menu'; S.auto = false;
    renderMenu();
    show('#menu');
    hudFor(null);
  }
  $('#btnMenu').addEventListener('click', toMenu);

  /* ── Level öffnen ── */
  function openLevel(id) {
    const L = LEVELS.find(l => l.id === id);
    S.lvl = L;
    S.world = L.world === 'model' ? NTWelt.model(seed) : NTWelt.hills(seed, id);
    G.setWorld(S.world, theme);
    resetPlayer();
    S.state = 'intro';
    hudFor(L);
    card(
      '<div class="card-kicker">Level ' + L.id + ' · Welt ' + seed + '</div>' +
      '<h2>' + L.name + '</h2><p>' + L.intro + '</p>' +
      '<p class="ctrl">' + (L.mode === 'walk'
        ? '<b>Steuerung:</b> links auf dem Bild ziehen = laufen · rechts ziehen = umschauen<br><span class="kbd">Tastatur: WASD oder Pfeile · Q/E drehen</span>'
        : '<b>Steuerung:</b> Lernrate einstellen, dann <b>Springen</b> · ziehen = umschauen<br><span class="kbd">Tastatur: Leertaste springt · Q/E drehen</span>') + '</p>',
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
    addDot(S.p.x, S.p.z, true);
  }

  function startLevel() {
    S.state = 'play';
    show(null);
    $('#card').hidden = true;
    hudFor(S.lvl);
    updateHud();
    if (S.lvl.mode === 'walk') toast(S.lvl.arrow ? 'Folge dem Pfeil – oder auch nicht.' : 'Wo geht es nach unten?');
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
    $('#gVal').textContent = fmt(v, w.kind === 'model' ? 0 : 1) + (w.unit ? ' ' + w.unit : '');
    // Höhenmesser: Skala von der Starthöhe bis etwas darunter, nicht bis zum echten Minimum (das verriete es)
    const top = Math.max(S.curve[0], v) + 1, bot = Math.min(S.curve[0] * 0.15, S.best - 1, v - 1);
    const pos = x => clamp((x - bot) / (top - bot), 0, 1) * 100;
    $('#gNow').style.bottom = pos(v) + '%';
    $('#gBest').style.bottom = pos(S.best) + '%';
    $('#gBestV').textContent = fmt(S.best, w.kind === 'model' ? 0 : 1);
    if (L.mode === 'walk') {
      const s = Math.ceil(Math.max(0, S.left));
      $('#counter').textContent = '⏱ ' + s + ' s';
      $('#counter').classList.toggle('warn', s <= 10);
    } else {
      $('#counter').textContent = (w.kind === 'model' ? 'Schritte' : 'Sprünge') + ': ' + S.jumpsLeft;
      $('#counter').classList.toggle('warn', S.jumpsLeft <= 3);
    }
    if (w.kind === 'model') drawModel();
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
    for (const a of S.jump.arc) S.dots.push(a);
    addDot(S.p.x, S.p.z, true);
    S.jump = null;
    updateHud();
    if (S.jumpsLeft <= 0) setTimeout(() => { if (S.state === 'play') finish(); }, 500);
  }

  /* ── Spur ── */
  function addDot(x, z, big) {
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
    if (w.kind === 'model') {
      const r = mine / best;
      n = r < 1.05 ? 3 : r < 1.3 ? 2 : r < 2.2 ? 1 : 0;
      line = 'Dein Fehler: <b>' + fmt(mine, 1) + '</b> · kleinstmöglicher Fehler: <b>' + fmt(best, 1) + '</b>';
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
    if (w.kind !== 'model' && n < 3 && steep < 0.12) notes.push('Du stehst in einer Mulde – aber nicht in der tiefsten. Das nennt man ein <b>lokales Minimum</b>. Von dort aus geht es in keiner Richtung bergab.');

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
    if (S.lvl.mode === 'walk' && left && !joy.active) {
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
    step(dt);
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
        // Kamera schaut langsam in Sprungrichtung
        if (!S.jump && !S.fly && look.id === null) {
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
    if (S.reveal) {
      const t = ease(clamp(S.reveal.t / 2.4, 0, 1));
      fogR = lerp(S.reveal.fog0, 320 * w.W / 50, t * t);
      const c0 = S.reveal.cam0 || cam;
      const over = overview();
      cam = { eye: c0.eye.map((v, i) => lerp(v, over.eye[i], t)), at: c0.at.map((v, i) => lerp(v, over.at[i], t)) };
    }
    S.cam = cam;

    const objs = [];
    const acc = theme === 'dark' ? [1, 0.62, 0.3] : [0.98, 0.45, 0.12];
    const trail = theme === 'dark' ? [1, 0.85, 0.55] : [0.85, 0.35, 0.1];
    for (const d of S.dots) {
      const dy = d.air ? d.y : w.h(d.x, d.z) + 0.08;
      const rr = S.reveal ? d.r * (d.air ? 2.2 : 2.6) : d.r;
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
        objs.push({ type: 'strip', pts, color: [0.2, 0.55, 1], glow: 0.55, lift: 0.14 });
        const hs = 0.9 + (len - 0.9) * 0.78;
        const head = [];
        for (let i = 0; i <= 6; i++) { const s = hs + (len - hs) * i / 6; head.push([p.x + ux * s, p.z + uz * s, 0.62 * (1 - i / 6) + 0.02]); }
        objs.push({ type: 'strip', pts: head, color: [0.2, 0.55, 1], glow: 0.55, lift: 0.15 });
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
      player: { x: p.x, y, z: p.z, ground, yaw: p.yaw, tilt: p.tilt, squash: p.squash, hidden: false } };
    G.frame(sc);
    labels(sc);
  }

  // Sprungweite = Lernrate × Steilheit, live unter der Lernrate
  let distTxt = '';
  function showDist(d) {
    const el = $('#lrDist'); if (!el) return;
    let t = '';
    if (S.world.kind !== 'model') {
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

  /* ── Level 4: Messpunkte und Gerade ── */
  function drawModel() {
    const w = S.world, c = $('#plot'), x = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const Wd = c.clientWidth, Hh = c.clientHeight;
    if (c.width !== Wd * dpr) { c.width = Wd * dpr; c.height = Hh * dpr; }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, Wd, Hh);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim(), soft = css.getPropertyValue('--ink-faint').trim();
    const acc = css.getPropertyValue('--orange').trim(), red = css.getPropertyValue('--warn').trim();
    const L = 28, R = 8, T = 8, B = 22;
    const X = v => L + v / 10 * (Wd - L - R), Y = v => T + (1 - v / 150) * (Hh - T - B);
    x.strokeStyle = soft; x.lineWidth = 1; x.fillStyle = soft; x.font = '10px Outfit, sans-serif';
    x.beginPath(); x.moveTo(L, T); x.lineTo(L, Hh - B); x.lineTo(Wd - R, Hh - B); x.stroke();
    for (let i = 1; i <= 9; i += 2) x.fillText(String(i), X(i) - 3, Hh - B + 12);
    for (const v of [50, 100, 150]) x.fillText(String(v), 2, Y(v) + 3);
    x.fillText('Woche', Wd - R - 32, Hh - 3);
    const wv = w.toW(S.p.x), bv = w.toB(S.p.z);
    const f = t => wv * (t - 5) + bv;
    x.save(); x.beginPath(); x.rect(L, T, Wd - L - R, Hh - T - B); x.clip();
    x.strokeStyle = red; x.globalAlpha = 0.6; x.lineWidth = 1.2;
    for (const p of w.pts) { x.beginPath(); x.moveTo(X(p.x), Y(p.y)); x.lineTo(X(p.x), Y(f(p.x))); x.stroke(); }
    x.globalAlpha = 1; x.strokeStyle = acc; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(X(0), Y(f(0))); x.lineTo(X(10), Y(f(10))); x.stroke();
    x.restore();
    x.fillStyle = ink;
    for (const p of w.pts) { x.beginPath(); x.arc(X(p.x), Y(p.y), 3.4, 0, 7); x.fill(); }
    $('#mW').textContent = fmt(wv, 1);
    $('#mB').textContent = fmt(bv, 0);
    $('#mL').textContent = fmt(w.loss(wv, bv), 0);
  }

  window.addEventListener('resize', () => { if (S.lvl) updateHud(); });

  renderMenu();
  show('#menu');
  hudFor(null);
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
