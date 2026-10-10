// Intro: „Worum geht's?" und „So spielst du" — HTML-Overlay über dem Canvas.
//
// Erscheint beim ersten Besuch automatisch (localStorage INTRO_KEY), danach
// über den Knopf „? So geht's" im Menü. Acht Seiten, jede mit eigenem Bild
// aus HTML/CSS/SVG — bewusst ohne Canvas, damit Text sauber umbricht und
// vorgelesen werden kann.
//
// Seite 4 ist eine kleine Mitmach-Simulation des Feed-Algorithmus. Sie
// rechnet mit derselben Formel wie js/algorithm.js (Gewicht = Treffer +
// BASE_WEIGHT 2), damit das Gezeigte zum Spiel passt.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  const INTRO_KEY = 'bubbleBounceIntro_v1';
  const DEMO_BASE = 2;   // = BASE_WEIGHT in algorithm.js

  // Kurz erklärt, was die Kategorie ausmacht — Daten bleiben in categories.js.
  const WHY = {
    source_ok:  'zeigt, woher die Info stammt',
    factcheck:  'prüft eine Behauptung nach',
    pubmedia:   'Redaktion, die Fakten prüfen muss',
    science:    'beruht auf Studien',
    ai_labeled: 'sagt offen: „Das ist KI“',
    clickbait:  'übertreibt, damit du klickst',
    no_source:  '„hab ich gehört“ – nicht prüfbar',
    conspiracy: 'geheime Mächte sollen schuld sein',
    urgency:    'macht Druck: „nur heute!“',
    ai_hidden:  'wirkt echt, ist aber KI'
  };

  // Gleiche Icon-Quelle wie render.js:preloadSprites — der Browser hat sie
  // dort schon geladen, es kommt kein neuer Server dazu.
  function iconURL(cat){
    return 'https://api.iconify.design/' + cat.icon + '.svg?color=%232A2439';
  }

  const MONSTER_SVG =
    '<svg class="bbi-mon" viewBox="-50 -52 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="bbiMonG" cx="35%" cy="35%" r="70%">' +
        '<stop offset="0" stop-color="#D4C6FF"/><stop offset="1" stop-color="#8B5CF6"/>' +
      '</radialGradient></defs>' +
      '<path d="M-25 -31 L-14 -47 L-5 -30 Z M25 -31 L14 -47 L5 -30 Z" fill="#7C4EF5"/>' +
      '<circle r="50" fill="url(#bbiMonG)"/>' +
      '<circle cy="7" r="30" fill="#EDE5FF"/>' +
      '<circle cx="-14" cy="-8" r="12" fill="#fff"/><circle cx="14" cy="-8" r="12" fill="#fff"/>' +
      '<circle cx="-11" cy="-6" r="5.5" fill="#2A2439"/><circle cx="17" cy="-6" r="5.5" fill="#2A2439"/>' +
      '<path d="M-12 9 Q0 20 12 9" stroke="#2A2439" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '</svg>';

  function post(cat, opts){
    opts = opts || {};
    const pts = cat.bonus > 0 ? '+' + cat.bonus : String(cat.bonus);
    const handle = cat.handles[0].replace(/^@/, '');
    return '<div class="bbi-post bbi-post--' + cat.type + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<div class="bbi-post__head">' +
        '<img class="bbi-post__icon" src="' + iconURL(cat) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="bbi-post__label">' + cat.label + '</span>' +
        (opts.noPts ? '' : '<span class="bbi-post__pts">' + pts + '</span>') +
      '</div>' +
      (opts.compact ? '' :
        '<div class="bbi-post__why">' + WHY[cat.id] + '</div>') +
      (opts.handle ? '<div class="bbi-post__handle">' + handle + '</div>' : '') +
    '</div>';
  }

  // ── Seiten ──────────────────────────────────────────────────────────
  function slides(){
    const C = FE.categories;
    const B = C.BY_ID;
    return [
      {
        kicker: 'Worum geht\'s?',
        title: 'Du kletterst durch einen Feed',
        vis:
          '<div class="bbi-scene">' +
            '<div class="bbi-scene__stack">' +
              post(B.science,   { compact: true, noPts: true, cls: 'bbi-scene__p1' }) +
              post(B.clickbait, { compact: true, noPts: true, cls: 'bbi-scene__p2' }) +
              post(B.pubmedia,  { compact: true, noPts: true, cls: 'bbi-scene__p3' }) +
            '</div>' +
            '<div class="bbi-scene__jumper">' + MONSTER_SVG + '</div>' +
          '</div>',
        text:
          '<p>Dein Monster springt einen endlosen <b>Social-Media-Feed</b> hinauf. ' +
          'Jeder <b>Post</b> ist eine Plattform – auf jedem landest du und springst weiter.</p>' +
          '<p>Entscheidend ist, <b>worauf</b> du landest. Denn wie in echten Apps merkt sich ' +
          'dein Feed alles, was du anklickst – und zeigt dir mehr davon.</p>'
      },
      {
        kicker: 'Worum geht\'s?',
        title: 'Diese Posts kannst du ernst nehmen',
        vis: '<div class="bbi-grid">' + C.GOOD.map(c => post(c)).join('') + '</div>',
        text:
          '<p>Landest du auf einem <b>vertrauenswürdigen Post</b>, gibt es <b>Pluspunkte</b> ' +
          'und deine <b>Serie</b> wächst.</p>' +
          '<p class="bbi-hint"><span class="bbi-stripe bbi-stripe--good"></span> ' +
          'Blauer Streifen oben = vertrauenswürdig.</p>'
      },
      {
        kicker: 'Worum geht\'s?',
        title: 'Und bei diesen Posts ist Vorsicht angesagt',
        vis: '<div class="bbi-grid">' + C.BAD.map(c => post(c)).join('') + '</div>',
        text:
          '<p>Auch hier springst du weiter – aber es gibt <b>Minuspunkte</b> und deine Serie ' +
          'ist weg. Der Streifen ist dunkler (Petrol) – schau lieber genau auf <b>Symbol und Text</b>.</p>' +
          '<p class="bbi-hint"><span class="bbi-stripe bbi-stripe--bad"></span> ' +
          'Petrol-Streifen oben = fragwürdig.</p>'
      },
      {
        kicker: 'Probier\'s aus',
        title: 'Der Feed lernt mit',
        vis: '<div class="bbi-demo" id="bbi-demo"></div>',
        text:
          '<p><b>Tippe auf die Posts</b>, als würdest du darauf landen. Jede Landung ist für den ' +
          'Algorithmus wie ein <b>Like</b>: Davon zeigt er dir ab jetzt <b>mehr</b>.</p>' +
          '<p>Ob ein Post stimmt, ist dem Algorithmus <b>egal</b>. Er zählt nur, womit du ' +
          'Zeit verbringst.</p>',
        onShow: renderDemo
      },
      {
        kicker: 'Worum geht\'s?',
        title: 'So entsteht eine Filterblase',
        vis:
          '<div class="bbi-bubble">' +
            '<div class="bbi-bubble__out bbi-bubble__out--1">' + post(B.factcheck, { compact: true, noPts: true }) + '</div>' +
            '<div class="bbi-bubble__out bbi-bubble__out--2">' + post(B.science,   { compact: true, noPts: true }) + '</div>' +
            '<div class="bbi-bubble__out bbi-bubble__out--3">' + post(B.pubmedia,  { compact: true, noPts: true }) + '</div>' +
            '<div class="bbi-bubble__ball">' +
              '<div class="bbi-bubble__in bbi-bubble__in--1">' + post(B.clickbait,  { compact: true, noPts: true }) + '</div>' +
              '<div class="bbi-bubble__in bbi-bubble__in--2">' + post(B.conspiracy, { compact: true, noPts: true }) + '</div>' +
              '<div class="bbi-bubble__in bbi-bubble__in--3">' + post(B.urgency,    { compact: true, noPts: true }) + '</div>' +
              '<div class="bbi-bubble__mon">' + MONSTER_SVG + '</div>' +
            '</div>' +
          '</div>',
        text:
          '<p>Du siehst immer mehr vom Gleichen – und alles andere verschwindet. ' +
          'Das nennt man <b>Filterblase</b>.</p>' +
          '<p><b>TikTok, Instagram und YouTube</b> arbeiten genauso: Sie messen Likes, Kommentare ' +
          'und wie lange du hinschaust. <b>Aufreger und Klickbait</b> bekommen besonders viele ' +
          'Reaktionen – darum rutschen sie schnell nach oben.</p>' +
          '<p>Die gute Nachricht: Der Feed dreht sich mit. Springst du eine Weile gezielt auf ' +
          'gute Quellen, <b>kippt die Blase zurück</b>. Mit <span class="bbi-key">📊</span> ' +
          'siehst du im Spiel jederzeit, wie dein Feed gerade aussieht.</p>'
      },
      {
        kicker: 'So spielst du',
        title: 'Steuerung',
        vis:
          '<div class="bbi-ctrl">' +
            '<div class="bbi-ctrl__swipe">' +
              '<div class="bbi-ctrl__mon">' + MONSTER_SVG + '</div>' +
              '<div class="bbi-ctrl__finger"></div>' +
              '<div class="bbi-ctrl__arrows">‹ &nbsp; wischen &nbsp; ›</div>' +
            '</div>' +
            '<div class="bbi-ctrl__dash">' +
              '<div class="bbi-dashbtn">⤒</div>' +
              '<div class="bbi-ctrl__cap">Dash</div>' +
            '</div>' +
          '</div>',
        text:
          '<ul class="bbi-list">' +
            '<li><b>Wischen nach links/rechts</b> lenkt dein Monster. Wo du den Finger aufsetzt, ist egal.</li>' +
            '<li><b>Dash</b> <span class="bbi-key">⤒</span> unten rechts – oder schnell <b>nach oben wischen</b> – ' +
              'gibt dir einen Extra-Sprung.</li>' +
            '<li>Am PC: <span class="bbi-key">←</span> <span class="bbi-key">→</span> lenken, ' +
              '<span class="bbi-key">Leertaste</span> Dash, <span class="bbi-key">P</span> Pause.</li>' +
          '</ul>'
      },
      {
        kicker: 'So spielst du',
        title: 'Pass auf!',
        vis:
          '<div class="bbi-danger">' +
            '<div class="bbi-danger__row">' +
              '<div class="bbi-batt"><div class="bbi-batt__fill"></div></div>' +
              '<div class="bbi-orb">⚡</div>' +
            '</div>' +
            '<div class="bbi-bar">REALITÄTSCHECK</div>' +
            '<div class="bbi-danger__mon">' + MONSTER_SVG + '</div>' +
          '</div>',
        text:
          '<ul class="bbi-list">' +
            '<li><b>Akku:</b> Er sinkt ständig, jeder Dash kostet extra. Sammle ' +
              '<span class="bbi-key">⚡</span>-Kugeln (+20 %). Bei 0 % ist die Runde vorbei.</li>' +
            '<li><b>Realitätscheck:</b> Der rote Balken fällt von oben. Nur mit einem ' +
              '<b>Dash</b> kommst du hindurch – sonst ist die Runde vorbei.</li>' +
            '<li><b>Nicht runterfallen!</b> Nach 30 Sekunden zieht der Feed von selbst nach oben – ' +
              'wie beim Doomscrolling.</li>' +
          '</ul>'
      },
      {
        kicker: 'So spielst du',
        title: 'Punkte & Auswertung',
        vis:
          '<div class="bbi-score">' +
            '<div class="bbi-score__pill"><span class="bbi-score__num">1 240</span><span class="bbi-score__best">BEST 2 310</span></div>' +
            '<div class="bbi-score__combo">SERIE x10</div>' +
            '<div class="bbi-score__buffs"><span>⚡ DASH −50%</span><span>⤒ SPRUNG +8%</span></div>' +
          '</div>',
        text:
          '<ul class="bbi-list">' +
            '<li><b>Punkte</b> = wie hoch du kommst + Plus- und Minuspunkte der Posts.</li>' +
            '<li><b>Serie:</b> Gute Posts hintereinander. Ab 10 kostet der Dash nur halb so viel Akku, ' +
              'ab 20 springst du höher.</li>' +
            '<li>Am Ende siehst du deine <b>Filterblase</b>: Wie hat sich dein Feed in dieser Runde verändert?</li>' +
            '<li>15 000 Punkte = volle <b>10 Hub-Punkte</b> für dein Tier.</li>' +
          '</ul>'
      }
    ];
  }

  // ── Mitmach-Demo (Seite 4) ──────────────────────────────────────────
  const demo = { hits: {} };

  function renderDemo(){
    const el = document.getElementById('bbi-demo');
    if (!el) return;
    const cats = FE.categories.ALL;
    let total = 0;
    const w = {};
    for (const c of cats){ w[c.id] = (demo.hits[c.id] || 0) + DEMO_BASE; total += w[c.id]; }
    let good = 0;
    for (const c of FE.categories.GOOD) good += w[c.id];
    const goodPct = Math.round(good / total * 100);
    const touched = Object.values(demo.hits).some(n => n > 0);

    el.innerHTML =
      '<div class="bbi-demo__rows">' +
        cats.map(c => {
          const pct = w[c.id] / total * 100;
          return '<button type="button" class="bbi-demo__row bbi-demo__row--' + c.type + '" data-cat="' + c.id + '">' +
            '<img src="' + iconURL(c) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
            '<span class="bbi-demo__label">' + c.label + '</span>' +
            '<span class="bbi-demo__track"><span class="bbi-demo__bar" style="width:' + pct.toFixed(1) + '%"></span></span>' +
            '<span class="bbi-demo__pct">' + Math.round(pct) + ' %</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="bbi-demo__sum">' +
        '<div class="bbi-demo__split"><span class="bbi-demo__split-good" style="width:' + goodPct + '%"></span></div>' +
        '<div class="bbi-demo__legend"><span>vertrauenswürdig ' + goodPct + ' %</span>' +
          '<span>fragwürdig ' + (100 - goodPct) + ' %</span></div>' +
        (touched ? '<button type="button" class="bbi-demo__reset">↺ zurücksetzen</button>' : '') +
      '</div>';
  }

  function onDemoClick(ev){
    const reset = ev.target.closest('.bbi-demo__reset');
    if (reset){ demo.hits = {}; renderDemo(); return; }
    const row = ev.target.closest('.bbi-demo__row');
    if (!row) return;
    const id = row.dataset.cat;
    demo.hits[id] = (demo.hits[id] || 0) + 1;
    renderDemo();
    const again = document.querySelector('.bbi-demo__row[data-cat="' + id + '"]');
    if (again){ again.classList.add('bbi-demo__row--hit'); setTimeout(() => again.classList.remove('bbi-demo__row--hit'), 250); }
  }

  // ── Overlay ─────────────────────────────────────────────────────────
  let root = null, track = null, dotsEl = null, prevBtn = null, nextBtn = null, kickerEl = null;
  let pages = [];
  let idx = 0;
  let open = false;

  function build(){
    pages = slides();
    root = document.getElementById('bb-intro');
    root.innerHTML =
      '<div class="bbi-card" role="dialog" aria-modal="true" aria-label="So funktioniert Bubble Bounce">' +
        '<div class="bbi-head">' +
          '<span class="bbi-kicker" id="bbi-kicker"></span>' +
          '<button type="button" class="bbi-skip" id="bbi-skip">Überspringen</button>' +
        '</div>' +
        '<div class="bbi-viewport" id="bbi-viewport"><div class="bbi-track" id="bbi-track">' +
          pages.map((p, i) =>
            '<section class="bbi-slide" data-i="' + i + '" aria-hidden="true">' +
              '<div class="bbi-vis">' + p.vis + '</div>' +
              '<div class="bbi-body"><h2 class="bbi-title">' + p.title + '</h2>' + p.text + '</div>' +
            '</section>'
          ).join('') +
        '</div></div>' +
        '<div class="bbi-nav">' +
          '<button type="button" class="bbi-prev" id="bbi-prev" aria-label="Zurück">‹</button>' +
          '<div class="bbi-dots" id="bbi-dots">' +
            pages.map((_, i) => '<button type="button" class="bbi-dot" data-i="' + i + '" aria-label="Seite ' + (i + 1) + '"></button>').join('') +
          '</div>' +
          '<button type="button" class="bbi-next" id="bbi-next"></button>' +
        '</div>' +
      '</div>';

    track    = document.getElementById('bbi-track');
    dotsEl   = document.getElementById('bbi-dots');
    prevBtn  = document.getElementById('bbi-prev');
    nextBtn  = document.getElementById('bbi-next');
    kickerEl = document.getElementById('bbi-kicker');

    document.getElementById('bbi-skip').addEventListener('click', () => close(false));
    prevBtn.addEventListener('click', () => go(idx - 1));
    nextBtn.addEventListener('click', () => {
      if (idx < pages.length - 1) go(idx + 1);
      else close(true);
    });
    dotsEl.addEventListener('click', ev => {
      const d = ev.target.closest('.bbi-dot');
      if (d) go(+d.dataset.i);
    });
    root.addEventListener('click', onDemoClick);

    // Wischen zwischen den Seiten. Kurze Tipps (Demo-Zeilen) bleiben Klicks.
    const vp = document.getElementById('bbi-viewport');
    let sx = 0, sy = 0, tracking = false;
    vp.addEventListener('pointerdown', ev => { tracking = true; sx = ev.clientX; sy = ev.clientY; });
    vp.addEventListener('pointerup', ev => {
      if (!tracking) return;
      tracking = false;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1));
    });
    vp.addEventListener('pointercancel', () => { tracking = false; });

    window.addEventListener('keydown', ev => {
      if (!open) return;
      if (ev.key === 'ArrowRight'){ go(idx + 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft'){ go(idx - 1); ev.preventDefault(); }
      else if (ev.key === 'Escape'){ close(false); ev.preventDefault(); }
    });
  }

  function go(i){
    idx = Math.max(0, Math.min(pages.length - 1, i));
    track.style.transform = 'translateX(' + (-idx * 100) + '%)';
    track.querySelectorAll('.bbi-slide').forEach((s, j) => {
      s.setAttribute('aria-hidden', j === idx ? 'false' : 'true');
      s.classList.toggle('is-active', j === idx);
      if (j === idx) s.querySelector('.bbi-body').scrollTop = 0;
    });
    dotsEl.querySelectorAll('.bbi-dot').forEach((d, j) => d.classList.toggle('is-active', j === idx));
    kickerEl.textContent = pages[idx].kicker + ' · ' + (idx + 1) + '/' + pages.length;
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === pages.length - 1 ? 'Los geht\'s!' : 'Weiter ›';
    nextBtn.classList.toggle('bbi-next--go', idx === pages.length - 1);
    if (pages[idx].onShow) pages[idx].onShow();
  }

  function show(){
    if (!root) build();
    demo.hits = {};
    open = true;
    root.hidden = false;
    go(0);
    setHelpVisible(false);
  }

  // startNow: „Los geht's!" auf der letzten Seite startet direkt die Runde.
  function close(startNow){
    open = false;
    root.hidden = true;
    try { localStorage.setItem(INTRO_KEY, '1'); } catch(e){}
    if (startNow && FE.main && FE.main.getState() === FE.main.ST.MENU){
      FE.main.startGame();
    } else if (FE.main && FE.main.getState() === FE.main.ST.MENU){
      setHelpVisible(true);
    }
  }

  function setHelpVisible(v){
    const b = document.getElementById('bb-help');
    if (b) b.hidden = !v;
  }

  function isOpen(){ return open; }

  function boot(){
    const help = document.getElementById('bb-help');
    if (help) help.addEventListener('click', show);
    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch(e){}
    if (seen) setHelpVisible(true);
    else show();
  }

  FE.intro = { show, isOpen, hideHelp: () => setHelpVisible(false) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
