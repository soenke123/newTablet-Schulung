// Intro: „Worum geht's?" und „So spielst du" — HTML-Overlay über dem Canvas.
//
// Erscheint beim ersten Besuch automatisch (localStorage INTRO_KEY), danach
// über den Knopf „? So geht's" im Menü und auf dem Endscreen. Sechs Seiten, jede mit Bild aus
// HTML/CSS/SVG und höchstens zwei kurzen Sätzen — mehr liest keiner.
//
// Seite 2 ist eine kleine Mitmach-Simulation des Feed-Algorithmus. Sie
// rechnet mit derselben Formel wie js/algorithm.js (Gewicht = Treffer +
// BASE_WEIGHT 2), damit das Gezeigte zum Spiel passt.
(function(){
  "use strict";
  const FE = window.FE = window.FE || {};

  const INTRO_KEY = 'bubbleBounceIntro_v1';
  const DEMO_BASE = 2;   // = BASE_WEIGHT in algorithm.js

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
    return '<div class="bbi-post bbi-post--' + cat.type + (opts.cls ? ' ' + opts.cls : '') + '">' +
      '<div class="bbi-post__head">' +
        '<img class="bbi-post__icon" src="' + iconURL(cat) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="bbi-post__label">' + cat.label + '</span>' +
        (opts.noPts ? '' : '<span class="bbi-post__pts">' + pts + '</span>') +
      '</div>' +
    '</div>';
  }

  // ── Seiten ──────────────────────────────────────────────────────────
  function slides(){
    const B = FE.categories.BY_ID;
    const plain = { noPts: true };
    return [
      {
        title: 'Spring durch deinen Feed',
        vis:
          '<div class="bbi-duo">' +
            '<div class="bbi-duo__col">' +
              '<div class="bbi-duo__head bbi-duo__head--good">Punkte</div>' +
              post(B.factcheck) + post(B.science) + post(B.source_ok) +
            '</div>' +
            '<div class="bbi-duo__col">' +
              '<div class="bbi-duo__head bbi-duo__head--bad">Abzug</div>' +
              post(B.clickbait) + post(B.conspiracy) + post(B.ai_hidden) +
            '</div>' +
          '</div>',
        text: '<p>Jeder Post ist eine Plattform. <b>Seriöse Posts</b> bringen Punkte, ' +
              '<b>Fake &amp; Klickbait</b> kosten Punkte.</p>'
      },
      {
        title: 'Dein Feed lernt mit',
        vis: '<div class="bbi-demo" id="bbi-demo"></div>',
        text: '<p><b>Tippe ein paar Posts an.</b> Was du anklickst, zeigt dir der Feed öfter – ' +
              'egal, ob es stimmt.</p>',
        onShow: renderDemo
      },
      {
        title: 'Vorsicht, Filterblase!',
        vis:
          '<div class="bbi-bubble">' +
            '<div class="bbi-bubble__out bbi-bubble__out--1">' + post(B.factcheck, plain) + '</div>' +
            '<div class="bbi-bubble__out bbi-bubble__out--2">' + post(B.science,   plain) + '</div>' +
            '<div class="bbi-bubble__out bbi-bubble__out--3">' + post(B.pubmedia,  plain) + '</div>' +
            '<div class="bbi-bubble__ball">' +
              '<div class="bbi-bubble__in bbi-bubble__in--1">' + post(B.clickbait,  plain) + '</div>' +
              '<div class="bbi-bubble__in bbi-bubble__in--2">' + post(B.conspiracy, plain) + '</div>' +
              '<div class="bbi-bubble__in bbi-bubble__in--3">' + post(B.urgency,    plain) + '</div>' +
              '<div class="bbi-bubble__mon">' + MONSTER_SVG + '</div>' +
            '</div>' +
          '</div>',
        text: '<p>Bald siehst du nur noch das Gleiche – genau wie bei <b>TikTok &amp; Co.</b> ' +
              'Spring auf gute Quellen, dann öffnet sich dein Feed wieder.</p>'
      },
      {
        title: 'Steuerung',
        vis:
          '<div class="bbi-ctrl">' +
            '<div class="bbi-ctrl__swipe">' +
              '<div class="bbi-ctrl__mon">' + MONSTER_SVG + '</div>' +
              '<div class="bbi-ctrl__finger"></div>' +
              '<div class="bbi-ctrl__arrows">‹ &nbsp;wischen&nbsp; ›</div>' +
            '</div>' +
            '<div class="bbi-ctrl__dash">' +
              '<div class="bbi-ctrl__btn">⤒</div>' +
              '<div class="bbi-ctrl__cap">Dash</div>' +
            '</div>' +
          '</div>',
        text: '<p><b>Wischen</b> lenkt dein Monster. Der <b>Dash</b> <span class="bbi-key">⤒</span> ' +
              'gibt dir einen Extra-Sprung.</p>'
      },
      {
        title: 'Pass auf!',
        vis:
          '<div class="bbi-danger">' +
            '<div class="bbi-danger__row">' +
              '<div class="bbi-batt"><div class="bbi-batt__fill"></div></div>' +
              '<div class="bbi-orb">⚡</div>' +
            '</div>' +
            '<div class="bbi-bar">REALITÄTSCHECK</div>' +
            '<div class="bbi-danger__mon">' + MONSTER_SVG + '</div>' +
            '<div class="bbi-dashbtn">⤒</div>' +
          '</div>',
        text:
          '<ul class="bbi-list">' +
            '<li>Sammle <span class="bbi-key">⚡</span>, sonst ist der <b>Akku</b> leer.</li>' +
            '<li>Den <b>Realitätscheck</b> schaffst du nur per Dash.</li>' +
          '</ul>'
      },
      {
        title: 'Serie & Auswertung',
        vis:
          '<div class="bbi-score">' +
            '<div class="bbi-score__mon">' + MONSTER_SVG + '</div>' +
            '<div class="bbi-score__combo">SERIE x10</div>' +
            '<div class="bbi-score__buffs"><span>⚡ DASH −50%</span><span>⤒ SPRUNG +8%</span></div>' +
            '<div class="bbi-score__stats"><span class="bbi-key">📊</span> Dein Feed – live</div>' +
          '</div>',
        text: '<p>Viele gute Posts am Stück geben dir <b>Boni</b>. ' +
              'Mit <span class="bbi-key">📊</span> und am Ende siehst du, wie dein Feed sich verändert hat.</p>'
      }
    ];
  }

  // ── Mitmach-Demo (Seite 2) ──────────────────────────────────────────
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
    kickerEl.textContent = 'So geht\'s · ' + (idx + 1) + '/' + pages.length;
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
    const st = FE.main ? FE.main.getState() : -1;
    // Vom Menü oder vom Endscreen aus: neue Runde (startGame blendet den
    // Endscreen über hub.resetForNewRun aus).
    if (startNow && (st === FE.main.ST.MENU || st === FE.main.ST.OVER)){
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
    const esHelp = document.getElementById('bb-es-help');
    if (esHelp) esHelp.addEventListener('click', show);
    let seen = false;
    try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch(e){}
    if (seen) setHelpVisible(true);
    else show();
  }

  FE.intro = { show, isOpen, hideHelp: () => setHelpVisible(false) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
