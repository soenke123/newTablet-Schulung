/* ══════════════════════════════════════════════════════════════
   Lernwelt — motion.js  ·  Sparmodus „Animationen reduzieren“
   ══════════════════════════════════════════════════════════════
   Für Tablets, die bei den bewegten Spielen und Skills nicht
   hinterherkommen. Gilt für Schulung, GameHub und MPSkills.

   ⚠️ Im <head> blockierend laden (wie MPSkills/lib/theme.js): das
   Attribut muss stehen, bevor die Seite zum ersten Mal zeichnet.

   ── Was der Sparmodus macht ────────────────────────────────────
   Setzt <html data-motion="low">. Bilder, Figuren und Wesen BLEIBEN
   — es fallen nur Effekte weg:
     global (hier, unten in CSS):
       · Milchglas (backdrop-filter) → einfache Fläche
       · Textschatten
       · Dauer-Animationen laufen nur noch EINMAL statt endlos
         (animation-iteration-count: 1) — nichts hängt, weil
         animationend weiterhin kommt, nur eben früher
     je Spiel (in dessen CSS/JS, Suche nach data-motion / LWMotion):
       · Partikel, Schatten, Leuchten, Mini-Animationen der Figuren
       · Canvas-Schleifen mit halber Bildrate / weniger Auflösung
       · Knowledge Stack: Emotes als eine einfache Bewegung des
         ganzen Wesens + großes Emoji statt 10–20 Teilbewegungen
   Eigene Regeln je Spiel:  html[data-motion="low"] .x { … !important }
   (höhere Spezifität als die globale Regel, dann darf ein Spiel
   auch eine endlose Animation behalten, z. B. einen Lade-Kreisel).
   In JS:  LWMotion.low  (true/false), Ereignis 'lernwelt:motion'.

   ── Wer entscheidet ────────────────────────────────────────────
   Das GERÄT, nicht das Profil: ob es ruckelt, hängt am Tablet, und
   Gäste (j.html) haben kein Konto. Gespeichert im localStorage
   (lernwelt_motion = 'low' | 'full'); gleicher Ursprung = gilt auch
   in allen iframes (SYNIR, Tiny LM, Balance …), die diese Datei laden.

   ── Die Frage ──────────────────────────────────────────────────
   Die Bildrate wird die GANZE Zeit beobachtet (nur im obersten
   Fenster), auch nach 10 Minuten. Sinkt sie mehrere Sekunden lang
   deutlich, kommt EINMAL pro Spiel und Gerät die Frage „Animationen
   reduzieren?“ (gemerkt in lernwelt_motion_asked). Spiel = Pfad der
   Seite; in MPSkills-Räumen setzt lib/tool.js „mps:<werkzeug>“ über
   LWMotion.setGame(). Ist der Sparmodus an, gibt es nichts mehr zu
   fragen; dann steht das Symbol unten links (antippen = ausschalten).
   Schalter außerdem: MPSkills-Menü (lib/userbar.js), profil.html.
   ══════════════════════════════════════════════════════════════ */

(() => {
  'use strict';
  if (window.LWMotion) return;

  const KEY = 'lernwelt_motion';
  const ASKED = 'lernwelt_motion_asked';
  const root = document.documentElement;
  let top = true;
  try { top = window.top === window; } catch (e) { top = false; }

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  const isLow = () => read(KEY) === 'low';

  /* ── Globale Vereinfachungen ─────────────────────────────── */
  const CSS = `
html[data-motion="low"] *, html[data-motion="low"] *::before, html[data-motion="low"] *::after {
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
  text-shadow: none !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
}
.lwm-ask { position: fixed; left: 50%; bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%); z-index: 2147483600; width: min(440px, calc(100vw - 24px));
  box-sizing: border-box; padding: 16px 18px 14px; border-radius: 16px;
  background: #1f2330; color: #f4f5f8; border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: left; }
.lwm-ask[hidden] { display: none; }
.lwm-ask b { display: block; font-size: 16px; margin: 0 0 4px; }
.lwm-ask p { margin: 0 0 12px; color: #c9ccd6; font-size: 14px; }
.lwm-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.lwm-btn { appearance: none; border: 0; border-radius: 10px; padding: 10px 14px; min-height: 42px;
  font: 600 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: pointer; }
.lwm-yes { background: #4f7cff; color: #fff; }
.lwm-no { background: rgba(255,255,255,.1); color: #f4f5f8; }
.lwm-badge { position: fixed; left: calc(10px + env(safe-area-inset-left, 0px));
  bottom: calc(10px + env(safe-area-inset-bottom, 0px)); z-index: 2147483500;
  width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25);
  background: #2f7d4f; color: #fff; display: grid; place-items: center; padding: 0; cursor: pointer;
  opacity: .85; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
.lwm-badge[hidden] { display: none; }
.lwm-badge svg { width: 20px; height: 20px; }
.lwm-pop { position: fixed; left: calc(10px + env(safe-area-inset-left, 0px));
  bottom: calc(54px + env(safe-area-inset-bottom, 0px)); z-index: 2147483600;
  width: min(300px, calc(100vw - 24px)); box-sizing: border-box; padding: 12px 14px; border-radius: 14px;
  background: #1f2330; color: #f4f5f8; border: 1px solid rgba(255,255,255,.14);
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.lwm-pop[hidden] { display: none; }
.lwm-pop p { margin: 0 0 10px; color: #c9ccd6; }
.lwm-leaf { flex: none; width: 30px; height: 30px; padding: 0; border-radius: 50%; display: grid; place-items: center;
  cursor: pointer; border: 1px solid rgba(127,127,127,.35); background: rgba(127,127,127,.12); color: #8a8f98;
  transition: background .14s ease, color .14s ease; }
.lwm-leaf svg { width: 17px; height: 17px; }
.lwm-leaf[aria-pressed="true"] { background: #2f7d4f; border-color: #2f7d4f; color: #fff; }
.lwm-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  cursor: pointer; font: inherit; }
.lwm-switch input { width: 20px; height: 20px; accent-color: #2f7d4f; margin: 0; flex: none; }
.lwm-switch small { display: block; opacity: .75; font-size: 12px; }
`;
  function injectCss() {
    if (document.getElementById('lwm-css')) return;
    const st = document.createElement('style');
    st.id = 'lwm-css';
    st.textContent = CSS;
    (document.head || root).appendChild(st);
  }

  let lowFlag = false;
  function apply() {
    lowFlag = isLow();
    if (lowFlag) root.setAttribute('data-motion', 'low');
    else root.removeAttribute('data-motion');
    if (typeof rmStyle !== 'undefined' && rmStyle) rmStyle.disabled = !lowFlag;
    if (lowFlag && typeof soon === 'function') soon();
  }

  /* Canvas-Spiele (BubbleBounce, Wordisland, Balance …): Leucht-
     schatten (shadowBlur) sind auf dem Tablet einer der teuersten
     Zeichenbefehle. Im Sparmodus kommen sie gar nicht erst an — in
     JEDEM Spiel, ohne dass es davon wissen muss. Formen, Farben und
     Bilder bleiben. ctx.filter bleibt bewusst unangetastet: Weich-
     zeichner werden oft einmalig vorab gerechnet und tragen eine
     Auskunft (BubbleBounce: absichtlich verschwommene Post-Bilder). */
  (function patchCanvas() {
    const P = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (!P) return;
    const wrap = (name, fix) => {
      const d = Object.getOwnPropertyDescriptor(P, name);
      if (!d || !d.set || !d.configurable) return;
      Object.defineProperty(P, name, {
        configurable: true, enumerable: d.enumerable, get: d.get,
        set(v) { d.set.call(this, lowFlag ? fix(v) : v); },
      });
    };
    wrap('shadowBlur', () => 0);
    wrap('shadowOffsetX', () => 0);   // ohne Versatz und Unschärfe zeichnet
    wrap('shadowOffsetY', () => 0);   // der Browser gar keinen Schatten
  })();

  /* ── Vorhandene „Weniger Bewegung“-Regeln mitnutzen ─────────
     Viele Spiele haben schon @media (prefers-reduced-motion: reduce)
     { … } — gedacht für Geräte, auf denen „Bewegung reduzieren“
     eingeschaltet ist. Im Sparmodus gelten genau diese Regeln auch:
     sie werden aus allen Stylesheets der Seite (auch nachgeladenen
     wie tool.css) ohne die @media-Klammer in ein eigenes <style> ganz
     am Ende kopiert. So hat jedes Spiel seine eigene, durchdachte
     ruhige Fassung, ohne dass jemand sie ein zweites Mal schreibt. */
  const seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  let rmStyle = null, rmText = '', rmTimer = 0;
  function collect(rules, out) {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (r.type === 4 /* MEDIA */) {
        const m = (r.media && r.media.mediaText || r.conditionText || '');
        if (/prefers-reduced-motion\s*:\s*reduce/.test(m) && !/\bnot\b/.test(m)) {
          for (let j = 0; j < r.cssRules.length; j++) out.push(r.cssRules[j].cssText);
        } else if (r.cssRules) collect(r.cssRules, out);
      } else if (r.cssRules && r.type !== 7 /* KEYFRAMES */) {
        collect(r.cssRules, out);   // @supports, @layer
      }
    }
  }
  function harvest() {
    rmTimer = 0;
    if (!lowFlag || !seen) return;
    const out = [];
    const sheets = document.styleSheets;
    for (let i = 0; i < sheets.length; i++) {
      const sh = sheets[i];
      if (seen.has(sh) || sh.ownerNode === rmStyle) continue;
      let rules;
      try { rules = sh.cssRules; } catch (e) { seen.add(sh); continue; }   // fremder Ursprung
      if (!rules) continue;                                                // lädt noch
      seen.add(sh);
      collect(rules, out);
    }
    if (out.length) rmText += '\n' + out.join('\n');
    if (!rmText) return;
    if (!rmStyle) { rmStyle = document.createElement('style'); rmStyle.id = 'lwm-rm'; }
    if (rmStyle.textContent !== rmText) rmStyle.textContent = rmText;
    const head = document.head || root;
    if (rmStyle.parentNode !== head || head.lastElementChild !== rmStyle) head.appendChild(rmStyle);
  }
  const soon = () => { if (!rmTimer) rmTimer = setTimeout(harvest, 60); };
  function watchSheets() {
    harvest();
    document.addEventListener('load', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'LINK' || t.tagName === 'STYLE')) soon();
    }, true);
    if (window.MutationObserver) {
      new MutationObserver((list) => {
        for (const m of list) for (const n of m.addedNodes) {
          if (n !== rmStyle && (n.tagName === 'LINK' || n.tagName === 'STYLE')) { soon(); return; }
        }
      }).observe(document.head || root, { childList: true });
    }
  }

  injectCss();
  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchSheets);
  else watchSheets();
  window.addEventListener('load', soon);

  /* ── Symbol + Frage (nur oberstes Fenster) ───────────────── */
  const LEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>';
  let badge = null, pop = null, ask = null;

  function ensureUi() {
    if (!top || !document.body) return false;
    if (badge) return true;
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'lwm-badge';
    badge.title = 'Animationen reduziert (Sparmodus)';
    badge.setAttribute('aria-label', 'Animationen reduziert — antippen zum Ändern');
    badge.innerHTML = LEAF;
    badge.hidden = true;
    badge.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; });

    pop = document.createElement('div');
    pop.className = 'lwm-pop';
    pop.hidden = true;
    pop.innerHTML = '<p><b>Animationen reduziert.</b><br>Bilder bleiben, Effekte und kleine Bewegungen fallen weg — das Gerät hat weniger zu tun.</p>'
      + '<div class="lwm-row"><button type="button" class="lwm-btn lwm-no" data-lwm="full">Wieder alles zeigen</button></div>';

    ask = document.createElement('div');
    ask.className = 'lwm-ask';
    ask.setAttribute('role', 'dialog');
    ask.setAttribute('aria-live', 'polite');
    ask.hidden = true;
    ask.innerHTML = '<b>Ruckelt es gerade?</b>'
      + '<p>Dieses Gerät kommt bei den Animationen nicht ganz hinterher. Mit dem Sparmodus läuft es flüssiger — Bilder bleiben, nur Effekte und kleine Bewegungen fallen weg.</p>'
      + '<div class="lwm-row"><button type="button" class="lwm-btn lwm-no" data-lwm="no">Nein, so lassen</button>'
      + '<button type="button" class="lwm-btn lwm-yes" data-lwm="low">Animationen reduzieren</button></div>';

    document.body.appendChild(badge);
    document.body.appendChild(pop);
    document.body.appendChild(ask);
    // Klick daneben schließt das Fensterchen (Klicks darin bleiben offen).
    document.addEventListener('click', (e) => { if (pop && !pop.contains(e.target)) pop.hidden = true; });
    sync();
    return true;
  }

  /* Klicks auf alle Schalter, egal wer sie gezeichnet hat. */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-lwm]');
    if (!b) return;
    const v = b.getAttribute('data-lwm');
    if (v === 'flip') { set(isLow() ? 'full' : 'low'); return; }
    if (v === 'low') set('low');
    else if (v === 'full') set('full');
    if (ask) ask.hidden = true;
    if (pop) pop.hidden = true;
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[data-lwm-toggle]')) set(t.checked ? 'low' : 'full');
  });

  function sync() {
    const low = isLow();
    if (badge) badge.hidden = !low;
    if (low && ask) ask.hidden = true;
    if (!low && pop) pop.hidden = true;
    document.querySelectorAll('input[data-lwm-toggle]').forEach((i) => { i.checked = low; });
    document.querySelectorAll('[data-lwm="flip"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(low));
      b.title = low ? 'Sparmodus an' : 'Sparmodus aus';
    });
  }

  function fire() {
    sync();
    try { window.dispatchEvent(new CustomEvent('lernwelt:motion', { detail: { low: isLow() } })); } catch (e) {}
  }

  function set(mode) {
    write(KEY, mode === 'low' ? 'low' : 'full');
    apply();
    fire();
    // Same-Origin-iframes bekommen kein storage-Ereignis aus demselben
    // Fenster-Baum zuverlässig mit — also direkt anstoßen.
    document.querySelectorAll('iframe').forEach((f) => {
      try { f.contentWindow && f.contentWindow.LWMotion && f.contentWindow.LWMotion._refresh(); } catch (e) {}
    });
  }

  window.addEventListener('storage', (e) => { if (e.key === KEY) { apply(); fire(); } });

  /* ── Bildraten-Wächter ───────────────────────────────────── */
  let game = '';
  try { game = decodeURIComponent(location.pathname); } catch (e) { game = location.pathname; }

  function askedList() {
    try { return JSON.parse(read(ASKED) || '[]') || []; } catch (e) { return []; }
  }
  const wasAsked = (g) => askedList().indexOf(g) !== -1;
  function markAsked(g) {
    const l = askedList();
    if (l.indexOf(g) === -1) { l.push(g); write(ASKED, JSON.stringify(l.slice(-200))); }
  }

  // Fenster à 2 s. „Schlecht“ = unter 26 Bildern/s ODER mind. 8 Bilder
  // über 45 ms (Stottern) ODER mind. 4 über 80 ms (spürbare Hänger).
  // iPads im Stromsparmodus laufen GLEICHMÄSSIG mit 30 (33 ms je Bild)
  // — das allein soll NICHT fragen; Ruckeln ist ungleichmäßig. Fragen
  // erst bei 3 schlechten von den letzten 4 Fenstern (≈ 6–8 s zäh).
  const WIN = 2000, FPS_BAD = 26, SLOW = 45, SLOW_BAD = 8, HITCH = 80, HITCH_BAD = 4;
  let winStart = 0, frames = 0, slow = 0, hitches = 0, last = 0, history = [], graceUntil = 0, running = false;

  function resetWindow(now) { winStart = now; frames = 0; slow = 0; hitches = 0; last = now; }

  function tick(now) {
    if (!running) return;
    if (document.hidden) { resetWindow(now); requestAnimationFrame(tick); return; }
    const dt = now - last;
    last = now;
    if (dt > 1000) { resetWindow(now); history = []; requestAnimationFrame(tick); return; }   // Tab war weg, Dialog, Pause
    frames++;
    if (dt > SLOW) slow++;
    if (dt > HITCH) hitches++;
    if (now - winStart >= WIN) {
      const fps = frames * 1000 / (now - winStart);
      if (now > graceUntil) {
        history.push(fps < FPS_BAD || slow >= SLOW_BAD || hitches >= HITCH_BAD);
        if (history.length > 4) history.shift();
        if (history.filter(Boolean).length >= 3) { prompt(); return; }
      }
      resetWindow(now);
    }
    requestAnimationFrame(tick);
  }

  function shouldWatch() { return top && !isLow() && !wasAsked(game); }

  function start() {
    if (running || !shouldWatch()) return;
    running = true;
    history = [];
    graceUntil = performance.now() + 4000;   // Laden/Aufbau zählt nicht
    requestAnimationFrame((t) => { resetWindow(t); requestAnimationFrame(tick); });
  }
  function stop() { running = false; }

  function prompt() {
    stop();
    if (!shouldWatch() || !ensureUi()) return;
    markAsked(game);
    ask.hidden = false;
  }

  window.addEventListener('lernwelt:motion', () => { if (isLow()) stop(); else start(); });

  if (top) {
    const boot = () => { ensureUi(); start(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  /* ── Schnittstelle ───────────────────────────────────────── */
  window.LWMotion = {
    get low() { return isLow(); },
    /** 'low' | 'full' */
    set,
    /** Spiel-Schlüssel für die „einmal pro Spiel“-Frage (z. B. 'mps:knowledgestack'). */
    setGame(key) {
      if (!key || key === game) return;
      game = String(key);
      stop();
      start();
    },
    /** Schalter-Zeile für Menüs/Profil (Markup, Wirkung hier). */
    toggleHTML(label) {
      return '<label class="lwm-switch"><span>' + (label || 'Animationen reduzieren')
        + '<small>Für Tablets, die ruckeln. Bilder bleiben.</small></span>'
        + '<input type="checkbox" data-lwm-toggle' + (isLow() ? ' checked' : '') + '></label>';
    },
    /** Menüzeile wie „Ansicht“ (MPSkills lib/userbar.js): „Sparmodus“ +
        Blatt-Knopf, grau = aus, grün = an. Erklärt wird am Blatt unten links. */
    menuHTML() {
      const low = isLow();
      return '<span class="ub-theme-l">Sparmodus</span>'
        + '<button type="button" class="lwm-leaf" data-lwm="flip" aria-pressed="' + low + '"'
        + ' title="' + (low ? 'Sparmodus an' : 'Sparmodus aus') + '" aria-label="Sparmodus">' + LEAF + '</button>';
    },
    /** Bildrate für eigene Schleifen: im Sparmodus halbiert. */
    fps(base) { return isLow() ? Math.max(20, Math.round((base || 60) / 2)) : (base || 60); },
    /** Pixel-Dichte für Canvas: im Sparmodus höchstens 1. */
    dpr() { const d = window.devicePixelRatio || 1; return isLow() ? 1 : d; },
    _refresh() { apply(); fire(); },
  };
})();
