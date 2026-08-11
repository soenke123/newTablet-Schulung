/* Theme-Engine. Setzt --rt-primary / --rt-primary-soft / --rt-primary-wash auf :root um,
   sobald ein Logo gewählt wird. 8 Themes, aus den Plattform-Logos abgeleitet
   (jeweils Hauptton + Pastell + kräftigeres Pastell für Body-Wash).

   Lebenszyklus:
     • platformScreen Klick → apply(id)  (Live-Preview beim Auswählen)
     • Confirm setzt Player im State
     • Beim nächsten screen:enter wird applyFromState() automatisch aufgerufen */
(function (RT) {
  'use strict';

  var THEMES = {
    bell:    { primary: '#e91d77', soft: '#fce7f3', wash: '#f9a8d4' },
    connect: { primary: '#b45309', soft: '#fef3c7', wash: '#fcd34d' },
    rocket:  { primary: '#ea580c', soft: '#ffedd5', wash: '#fdba74' },
    graph:   { primary: '#2563eb', soft: '#dbeafe', wash: '#93c5fd' },
    trend:   { primary: '#0d9488', soft: '#ccfbf1', wash: '#5eead4' },
    chat:    { primary: '#dc2626', soft: '#fee2e2', wash: '#fca5a5' },
    like:    { primary: '#7c3aed', soft: '#ede9fe', wash: '#c4b5fd' },
    mesh:    { primary: '#16a34a', soft: '#dcfce7', wash: '#86efac' }
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
    var player = (RT.state && RT.state.current && RT.state.current.player) || {};
    if (player.platformLogo) apply(player.platformLogo);
    else reset();
  }

  // Beim Screen-Wechsel Theme aus dem State reanwenden — überlebt Preview-Werte.
  RT.bus.on('screen:enter', applyFromState);

  RT.theme = {
    THEMES: THEMES,
    apply: apply,
    reset: reset,
    applyFromState: applyFromState
  };
})(window.RT3);
