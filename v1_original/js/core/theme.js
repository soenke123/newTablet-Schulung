/* Theme-Engine. Setzt --rt-primary / --rt-primary-soft auf :root um,
   sobald ein Logo gewählt wird. Reset = Default-Tokens aus tokens.css.
   Themes sind aus den 8 Plattform-Logos abgeleitet (jeweils Hauptton + Pastell).

   Lebenszyklus:
     • platformScreen Klick → apply(id)  (Live-Preview)
     • Confirm dispatcht SET_PLAYER, das landet im State
     • Beim nächsten screen:enter wird applyFromState() automatisch aufgerufen */
(function (RT) {
  'use strict';

  // primary = sattes Logo-Pendant (CTA, Akzente).
  // soft    = sehr helles Pastell (Tailwind ~100) für Selected-Cards & Default-Buttons.
  //           Muss hell genug sein, damit das Logo-PNG darauf klar lesbar bleibt.
  // wash    = kräftigeres Pastell (Tailwind ~300) für die Body-Hintergrund-Wäsche,
  //           damit die Seite trotzdem deutlich vom Theme eingefärbt wird.
  var THEMES = {
    bell:    { primary: '#e91d77', soft: '#fce7f3', wash: '#f9a8d4' },  // Glocke (pink)
    connect: { primary: '#b45309', soft: '#fef3c7', wash: '#fcd34d' },  // Connect (gold)
    rocket:  { primary: '#ea580c', soft: '#ffedd5', wash: '#fdba74' },  // Rakete (orange)
    graph:   { primary: '#2563eb', soft: '#dbeafe', wash: '#93c5fd' },  // Graph (blau)
    trend:   { primary: '#0d9488', soft: '#ccfbf1', wash: '#5eead4' },  // Trend (türkis)
    chat:    { primary: '#dc2626', soft: '#fee2e2', wash: '#fca5a5' },  // Plausch (rot)
    like:    { primary: '#7c3aed', soft: '#ede9fe', wash: '#c4b5fd' },  // Like (lila)
    mesh:    { primary: '#16a34a', soft: '#dcfce7', wash: '#86efac' }   // Netz (grün)
  };

  function apply(id) {
    var root = document.documentElement;
    var t = THEMES[id];
    if (!t) { reset(); return; }
    root.style.setProperty('--rt-primary',      t.primary);
    root.style.setProperty('--rt-primary-soft', t.soft);
    root.style.setProperty('--rt-primary-wash', t.wash);
  }

  function reset() {
    var root = document.documentElement;
    root.style.removeProperty('--rt-primary');
    root.style.removeProperty('--rt-primary-soft');
    root.style.removeProperty('--rt-primary-wash');
  }

  function applyFromState() {
    var player = RT.state.get().player || {};
    if (player.platformLogo) apply(player.platformLogo);
    else reset();
  }

  // Bei jedem Screen-Wechsel das aus dem State abgeleitete Theme erneut anwenden.
  // Damit überlebt das Theme einen Screen-Wechsel auch dann, wenn der platformScreen
  // zwischendurch nur Preview-Werte gesetzt hat.
  RT.bus.on('screen:enter', applyFromState);

  RT.theme = {
    THEMES: THEMES,
    apply: apply,
    reset: reset,
    applyFromState: applyFromState
  };
})(window.RT);
