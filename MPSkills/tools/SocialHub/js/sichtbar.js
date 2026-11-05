/* ══════════════════════════════════════════════════════════════
   YourSozialNet  ·  js/sichtbar.js — welcher Teil der App ist zu sehen?
   ══════════════════════════════════════════════════════════════
   Die App läuft im Raum in einem <iframe>, dessen Höhe tool.js nach
   dem Fenster der Raumseite bemisst. Öffnet sich am Handy die
   Tastatur, liegt sie über dem unteren Teil des iframes — der iframe
   selbst merkt davon nichts. Das Kommentar-Blatt (.sheet-back, unten
   angedockt) stand dann samt Eingabefeld unter der Tastatur.

   Diese Datei schreibt an <html>:
     --vis-top     wie viel oben vom iframe nicht zu sehen ist
     --vis-bottom  wie viel unten verdeckt ist (Tastatur, Bildschirmrand)
     .kb-open      Tastatur offen (unten mehr als 120 px verdeckt)
   Gemessen wird am visualViewport der Raumseite (gleicher Ursprung),
   ohne Rahmen (direkt aufgerufen) am eigenen.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const root = document.documentElement;
  const KB_MIN = 120;
  let host = window;
  let frameEl = null;
  try {
    if (window.frameElement && window.parent && window.parent.document) {
      host = window.parent;
      frameEl = window.frameElement;
    }
  } catch (e) { host = window; frameEl = null; }

  let tick = 0;
  function apply() {
    tick = 0;
    const vv = host.visualViewport;
    const vTop = vv ? vv.offsetTop : 0;
    const vH = vv ? vv.height : host.innerHeight;
    let top = 0, bottom = 0;
    const h = window.innerHeight;
    if (frameEl) {
      const r = frameEl.getBoundingClientRect();   // Lage im Layout-Fenster der Raumseite
      top = Math.max(0, vTop - r.top);
      bottom = Math.max(0, (r.top + r.height) - (vTop + vH));
    } else {
      top = vTop;
      bottom = Math.max(0, h - vTop - vH);
    }
    // Nie mehr als den iframe wegnehmen — ein Rest bleibt immer zu sehen.
    if (top + bottom > h - 120) {
      const over = top + bottom - (h - 120);
      bottom = Math.max(0, bottom - over);
    }
    root.style.setProperty('--vis-top', Math.round(top) + 'px');
    root.style.setProperty('--vis-bottom', Math.round(bottom) + 'px');
    root.classList.toggle('kb-open', !!vv && (host.innerHeight - vH) > KB_MIN);
  }
  function schedule() { if (!tick) tick = requestAnimationFrame(apply); }

  apply();
  const vv = host.visualViewport;
  if (vv) { vv.addEventListener('resize', schedule); vv.addEventListener('scroll', schedule); }
  host.addEventListener('resize', schedule);
  host.addEventListener('scroll', schedule, { passive: true });
  if (host !== window) window.addEventListener('resize', schedule);

  // Beim Antippen eines Feldes fährt die Tastatur erst danach hoch — nachmessen.
  document.addEventListener('focusin', (e) => {
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    [60, 300, 600].forEach(ms => setTimeout(apply, ms));
  });
  document.addEventListener('focusout', () => { [60, 300].forEach(ms => setTimeout(apply, ms)); });
})();
