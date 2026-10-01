/* ══════════════════════════════════════════════════════════════
   pause.js — GameHub-Pause pro Kurs (Migration 0184)

   Eine Lehrkraft pausiert im Admin-Panel einen Kurs. Dann legt sich
   über Hub UND jedes Spiel ein Overlay, die Spiele stehen still und
   laufen nach dem Fortsetzen genau dort weiter, wo sie waren.

   MUSS als ERSTES <script> in den <head> jeder GameHub-Seite
   (vor creatures.js und den Spielskripten) — nur dann sieht es
   deren Timer. Es hat bewusst keine Abhängigkeiten; supabase-config.js
   wird erst beim ersten Abruf gelesen.

   Wie eingefroren wird (generisch, die Spiele wissen nichts davon):
     • setTimeout / setInterval  — Restzeit merken, nativen Timer
                                   stoppen, beim Fortsetzen neu starten
     • requestAnimationFrame     — Callbacks werden zurückgehalten
     • Date.now / new Date() / performance.now
                                 — laufen um die Pausendauer zurück,
                                   Absolut-Zeitstempel bleiben stimmig
     • <audio>/<video>/AudioContext/speechSynthesis — pausiert
     • CSS-Animationen (per Stylesheet) und Web Animations
     • Tastatur — wird abgefangen; Maus/Touch trifft nur das Overlay

   Der Zustand kommt per RPC get_my_cluster_pause() (Polling, 5 s).
   Admins ohne Kurs bekommen dort immer false und sind nie betroffen.

   Fail-open: Ist der Zustand nicht prüfbar (kein/abgelaufener Token,
   Netz weg), endet die Pause nach spätestens ~60 s — ein Schüler soll
   nie wegen eines Verbindungsproblems festhängen.

   Schnittstelle für Spiele (optional):
     window.MPSPause.isPaused()
     window.addEventListener('mps:pause' | 'mps:resume', …)
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.MPSPause) return;               // doppelt eingebunden

  var POLL_MS       = 5000;
  var FAIL_OPEN     = 12;                     // ~60 s ohne gültige Antwort
  var CACHE_KEY     = 'mps_hub_paused';       // { t: ms } — Pause beim Seitenwechsel sofort wieder zeigen
  var CACHE_MAX_AGE = 2 * 60 * 1000;
  var Z             = 2147483000;

  /* ── Originale sichern, BEVOR irgendetwas gepatcht wird ───── */
  var origSetTimeout    = window.setTimeout.bind(window);
  var origClearTimeout  = window.clearTimeout.bind(window);
  var origSetInterval   = window.setInterval.bind(window);
  var origClearInterval = window.clearInterval.bind(window);
  var origRAF           = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  var origCAF           = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
  var OrigDate          = Date;
  var origDateNow       = OrigDate.now.bind(OrigDate);
  var origPerfNow       = (window.performance && performance.now) ? performance.now.bind(performance) : null;

  /* ── Zustand ──────────────────────────────────────────────── */
  var paused       = false;
  var pausedSince  = 0;                      // echte Zeit des Pausenbeginns
  var pausedTotal  = 0;                      // Summe früherer Pausen (ms)

  function shift() {
    return pausedTotal + (paused ? origDateNow() - pausedSince : 0);
  }

  /* ── Zeit ─────────────────────────────────────────────────── */
  Date.now = function () { return origDateNow() - shift(); };
  function PDate() {
    if (!(this instanceof PDate)) return OrigDate();
    if (arguments.length === 0) return new OrigDate(origDateNow() - shift());
    var a = arguments;
    switch (a.length) {
      case 1: return new OrigDate(a[0]);
      case 2: return new OrigDate(a[0], a[1]);
      case 3: return new OrigDate(a[0], a[1], a[2]);
      case 4: return new OrigDate(a[0], a[1], a[2], a[3]);
      case 5: return new OrigDate(a[0], a[1], a[2], a[3], a[4]);
      case 6: return new OrigDate(a[0], a[1], a[2], a[3], a[4], a[5]);
      default: return new OrigDate(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
    }
  }
  PDate.prototype = OrigDate.prototype;
  Object.setPrototypeOf(PDate, OrigDate);
  PDate.now = Date.now;
  window.Date = PDate;

  if (origPerfNow) {
    try { performance.now = function () { return origPerfNow() - shift(); }; } catch (e) { /* schreibgeschützt */ }
  }

  /* ── Timer ────────────────────────────────────────────────── */
  var ID_BASE = 1e9, nextId = ID_BASE;
  var timers  = {};                          // id → Eintrag

  function startTimeout(t, ms) {
    t.native = origSetTimeout(function () {
      t.native = null;
      if (t.repeat) {
        t.last = origDateNow();
        t.native = origSetInterval(tick(t), t.delay);
        fire(t);
      } else {
        delete timers[t.id];
        fire(t);
      }
    }, ms);
    t.last = origDateNow();
  }
  function tick(t) { return function () { t.last = origDateNow(); fire(t); }; }
  function fire(t) { t.fn.apply(window, t.args); }

  window.setTimeout = function (fn, delay) {
    if (typeof fn !== 'function') return origSetTimeout.apply(null, arguments);
    var t = { id: ++nextId, fn: fn, args: Array.prototype.slice.call(arguments, 2),
              delay: Math.max(0, +delay || 0), repeat: false, native: null, remaining: 0, last: 0 };
    timers[t.id] = t;
    if (paused) t.remaining = t.delay; else startTimeout(t, t.delay);
    return t.id;
  };
  window.setInterval = function (fn, delay) {
    if (typeof fn !== 'function') return origSetInterval.apply(null, arguments);
    var t = { id: ++nextId, fn: fn, args: Array.prototype.slice.call(arguments, 2),
              delay: Math.max(0, +delay || 0), repeat: true, native: null, remaining: 0, last: 0 };
    timers[t.id] = t;
    if (paused) {
      t.remaining = t.delay;
    } else {
      t.last = origDateNow();
      t.native = origSetInterval(tick(t), t.delay);
    }
    return t.id;
  };
  function clearTimer(id, nativeClear) {
    var t = timers[id];
    if (!t) { return nativeClear(id); }
    if (t.native !== null) { origClearTimeout(t.native); origClearInterval(t.native); }
    delete timers[id];
  }
  window.clearTimeout  = function (id) { clearTimer(id, origClearTimeout); };
  window.clearInterval = function (id) { clearTimer(id, origClearInterval); };

  /* ── requestAnimationFrame ────────────────────────────────── */
  var frames = {}, held = [];
  if (origRAF) {
    window.requestAnimationFrame = function (cb) {
      var f = { id: ++nextId, cb: cb, native: null };
      frames[f.id] = f;
      scheduleFrame(f);
      return f.id;
    };
    window.cancelAnimationFrame = function (id) {
      var f = frames[id];
      if (!f) return origCAF(id);
      if (f.native !== null) origCAF(f.native);
      delete frames[id];
    };
  }
  function scheduleFrame(f) {
    if (paused) { held.push(f); return; }
    f.native = origRAF(function (ts) {
      f.native = null;
      if (paused) { held.push(f); return; }            // mitten im Frame pausiert
      delete frames[f.id];
      f.cb(origPerfNow ? ts - pausedTotal : ts);
    });
  }

  /* ── Medien, Audio, Animationen ───────────────────────────── */
  var medias = [];                           // Elemente, die play() aufgerufen haben
  var mediaPaused = [];
  var contexts = [];
  var ctxPaused = [];
  var animPaused = [];
  var speechWas = false;

  if (window.HTMLMediaElement) {
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (medias.indexOf(this) < 0) medias.push(this);
      if (paused) {                                    // während der Pause nicht anspielen
        if (mediaPaused.indexOf(this) < 0) mediaPaused.push(this);
        return Promise.resolve();
      }
      return origPlay.apply(this, arguments);
    };
  }
  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var Orig = window[name];
    if (!Orig) return;
    var Wrapped = function () {
      var ctx = new (Function.prototype.bind.apply(Orig, [null].concat(Array.prototype.slice.call(arguments))))();
      contexts.push(ctx);
      if (paused) { try { ctx.suspend(); ctxPaused.push(ctx); } catch (e) { /* egal */ } }
      return ctx;
    };
    Wrapped.prototype = Orig.prototype;
    try { window[name] = Wrapped; } catch (e) { /* egal */ }
  });

  function freezeMedia() {
    var i, el;
    mediaPaused = [];
    var all = medias.slice();
    var dom = document.querySelectorAll ? document.querySelectorAll('audio,video') : [];
    for (i = 0; i < dom.length; i++) if (all.indexOf(dom[i]) < 0) all.push(dom[i]);
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (!el.paused && !el.ended) { try { el.pause(); mediaPaused.push(el); } catch (e) { /* egal */ } }
    }
    ctxPaused = [];
    for (i = 0; i < contexts.length; i++) {
      if (contexts[i].state === 'running') { try { contexts[i].suspend(); ctxPaused.push(contexts[i]); } catch (e) { /* egal */ } }
    }
    try {
      if (window.speechSynthesis && speechSynthesis.speaking) { speechSynthesis.pause(); speechWas = true; }
    } catch (e) { /* egal */ }
    animPaused = [];
    try {
      if (document.getAnimations) {
        var anims = document.getAnimations();
        for (i = 0; i < anims.length; i++) {
          // CSSAnimation hält das Stylesheet an; der Rest (Transitions, WAAPI) wird hier pausiert.
          if (window.CSSAnimation && anims[i] instanceof CSSAnimation) continue;
          if (anims[i].playState === 'running') { anims[i].pause(); animPaused.push(anims[i]); }
        }
      }
    } catch (e) { /* egal */ }
  }
  function thawMedia() {
    var i;
    for (i = 0; i < mediaPaused.length; i++) { try { var p = mediaPaused[i].play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* egal */ } }
    mediaPaused = [];
    for (i = 0; i < ctxPaused.length; i++) { try { ctxPaused[i].resume(); } catch (e) { /* egal */ } }
    ctxPaused = [];
    if (speechWas) { try { speechSynthesis.resume(); } catch (e) { /* egal */ } speechWas = false; }
    for (i = 0; i < animPaused.length; i++) { try { animPaused[i].play(); } catch (e) { /* egal */ } }
    animPaused = [];
  }

  /* ── Timer ein-/ausfrieren ────────────────────────────────── */
  function freezeTimers() {
    var now = origDateNow(), id, t;
    for (id in timers) {
      t = timers[id];
      if (t.native === null) continue;                 // schon angehalten (während Pause angelegt)
      origClearTimeout(t.native); origClearInterval(t.native);
      t.native = null;
      t.remaining = t.repeat ? Math.max(0, t.delay - (now - t.last)) : Math.max(0, t.delay - (now - t.last));
    }
  }
  function thawTimers() {
    var id, t;
    for (id in timers) {
      t = timers[id];
      if (t.native !== null) continue;
      startTimeout(t, t.remaining);
    }
    var list = held; held = [];
    for (var i = 0; i < list.length; i++) if (frames[list[i].id]) scheduleFrame(list[i]);
  }

  /* ── Overlay ──────────────────────────────────────────────── */
  var overlay = null;
  var scriptSrc = (document.currentScript && document.currentScript.src) || '';
  function logoUrl() {
    try { return new URL('../Logo.png', scriptSrc || location.href).href; } catch (e) { return '../Logo.png'; }
  }
  function buildOverlay() {
    var style = document.createElement('style');
    style.textContent =
      'html.mps-paused *,html.mps-paused *::before,html.mps-paused *::after{animation-play-state:paused!important}' +
      '#mps-pause-overlay{position:fixed;left:0;right:0;top:var(--vv-top,0px);height:var(--vv-h,100vh);' +
      'z-index:' + Z + ';display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;' +
      'overflow:auto;text-align:center;touch-action:none;user-select:none;-webkit-user-select:none;' +
      'background:radial-gradient(ellipse at 50% 30%,rgba(40,28,70,.97),rgba(14,10,28,.98));' +
      'font-family:"Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4ecd8}' +
      '#mps-pause-overlay[hidden]{display:none}' +
      '#mps-pause-overlay .mps-box{max-width:460px}' +
      '#mps-pause-overlay img{width:min(46vw,220px);height:auto;margin:0 auto 18px;display:block;' +
      'filter:drop-shadow(0 8px 24px rgba(0,0,0,.55))}' +
      '#mps-pause-overlay h1{margin:0 0 10px;font-family:"Cinzel",Georgia,serif;font-size:clamp(22px,5vw,32px);' +
      'line-height:1.25;color:#f6c945;font-weight:700}' +
      '#mps-pause-overlay p{margin:0;font-size:clamp(15px,3.6vw,18px);line-height:1.5;opacity:.9}';
    document.documentElement.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = 'mps-pause-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-live', 'assertive');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="mps-box"><img alt="" src="' + logoUrl() + '">' +
      '<h1>Kurze Pause mit dem GameHub</h1>' +
      '<p>Vorne geht es weiter.<br><small>Dein Spiel ist pausiert.</small></p></div>';
    // Alles, was darunter liegt, bekommt nichts davon mit.
    ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'mousedown', 'click', 'wheel', 'contextmenu'].forEach(function (ev) {
      overlay.addEventListener(ev, function (e) { e.stopPropagation(); if (ev !== 'touchstart') e.preventDefault(); }, { passive: false });
    });
    document.documentElement.appendChild(overlay);
  }
  // Tastatur fängt schon das Window in der Capture-Phase ab (wir sind das erste Skript).
  ['keydown', 'keyup', 'keypress', 'beforeinput', 'input'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      if (!paused) return;
      // Browser-Kürzel (Reload, DevTools, Strg/Cmd-…) bleiben dem Schüler.
      if (e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key || '')) return;
      e.stopImmediatePropagation(); e.preventDefault();
    }, true);
  });

  /* ── Pause an/aus ─────────────────────────────────────────── */
  function setPaused(next) {
    if (next === paused) return;
    if (next) {
      paused = true; pausedSince = origDateNow();
      if (!overlay) buildOverlay();
      overlay.hidden = false;
      document.documentElement.classList.add('mps-paused');
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* egal */ }
      freezeTimers(); freezeMedia();
      try { window.dispatchEvent(new Event('mps:pause')); } catch (e) { /* egal */ }
    } else {
      pausedTotal += origDateNow() - pausedSince;
      paused = false;
      if (overlay) overlay.hidden = true;
      document.documentElement.classList.remove('mps-paused');
      thawTimers(); thawMedia();
      try { window.dispatchEvent(new Event('mps:resume')); } catch (e) { /* egal */ }
      // Supabase-Client rechnet mit Date.now() — nach langer Pause lässt er sich so
      // das Token neu prüfen (der Client hört auf visibilitychange).
      origSetTimeout(function () { try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) { /* egal */ } }, 50);
    }
  }

  /* ── Abruf ────────────────────────────────────────────────── */
  function getToken() {
    if (typeof window.__accessToken === 'string' && window.__accessToken) return window.__accessToken;
    try {
      var raw = localStorage.getItem('lernwelt-auth');
      if (!raw) return null;
      var s = JSON.parse(raw);
      var token = (s && s.access_token) || (s && s.currentSession && s.currentSession.access_token) || null;
      var exp = (s && s.expires_at) || (s && s.currentSession && s.currentSession.expires_at) || null;
      if (!token) return null;
      if (exp && (origDateNow() / 1000) >= exp) return null;
      return token;
    } catch (e) { return null; }
  }
  function cache(on) {
    try { if (on) localStorage.setItem(CACHE_KEY, JSON.stringify({ t: origDateNow() })); else localStorage.removeItem(CACHE_KEY); } catch (e) { /* egal */ }
  }

  var failures = 0, inflight = false;
  function failed() {
    failures++;
    if (paused && failures >= FAIL_OPEN) { cache(false); setPaused(false); }
  }
  function poll() {
    if (inflight) return;
    var url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY, token = getToken();
    if (!url || !key || !token) { failed(); return; }
    inflight = true;
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = origSetTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    fetch(url + '/rest/v1/rpc/get_my_cluster_pause', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (v) {
      failures = 0;
      cache(v === true);
      setPaused(v === true);
    }).catch(failed).then(function () {
      origClearTimeout(to); inflight = false;
    });
  }

  /* ── Start ────────────────────────────────────────────────── */
  window.MPSPause = { isPaused: function () { return paused; }, poll: poll };

  // Pause beim Seitenwechsel sofort wieder zeigen, ohne auf die Antwort zu warten.
  try {
    var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && origDateNow() - c.t < CACHE_MAX_AGE) setPaused(true);
  } catch (e) { /* egal */ }

  origSetInterval(poll, POLL_MS);
  origSetTimeout(poll, 0);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') poll(); });
  window.addEventListener('focus', poll);
  window.addEventListener('pageshow', poll);
})();
