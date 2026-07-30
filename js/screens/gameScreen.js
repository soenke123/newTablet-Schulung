/* Game-Screen — Wrapper um das eigentliche Ingame-UI.
   Rendert Profile-Bar + Resource-Bar oben, darunter die World-Struktur,
   und aktiviert dann RT.ui.init() (Iso-Grid, Klicks, Modals). */
(function (RT) {
  'use strict';

  var _cleanupResBar = null;
  var _initialized   = false;

  function enter(container) {
    // Onboarding-Body-Klasse entfernen — game.css übernimmt wieder das Layout.
    document.body.classList.remove('rt-onboarding-active');

    var player = RT.state.current.player || {};

    container.innerHTML = ''
      + '<div id="rt-game-top">'
      +    RT.ui.profileBarHTML(player)
      +    RT.ui.resourceBarHTML()
      + '</div>'
      + '<div id="world">'
      + '  <div id="iso-grid"></div>'
      + '  <div id="building-ui-layer"></div>'
      + '  <div id="placement-bar" class="placement-bar">'
      + '    <span id="placement-label">Gebäude platzieren</span>'
      + '    <button id="placement-cancel">Abbrechen</button>'
      + '  </div>'
      + '</div>';

    // Sparkline + Delta-Popups + Live-Zahlen der schönen Bar an State koppeln.
    _cleanupResBar = RT.ui.bindResourceBar(container);

    // Ingame-UI (Iso-Grid, Klicks) einmalig initialisieren. Der Onboarding-
    // Flow kommt hier immer nur einmal an — Re-Entry ist nicht vorgesehen,
    // weil das doppelte Bus-Handler in RT.ui.init() erzeugen würde.
    if (!_initialized) {
      RT.ui.init();
      RT.clock.start();
      _initialized = true;
    }

    // Theme aus State reanwenden (falls vorher Preview ohne Confirm).
    if (RT.theme && RT.theme.applyFromState) RT.theme.applyFromState();
  }

  function exit() {
    if (_cleanupResBar) { _cleanupResBar(); _cleanupResBar = null; }
  }

  RT.screens.register('game', { enter: enter, exit: exit });
})(window.RT3);
