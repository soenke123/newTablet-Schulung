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
      // Krisen-Leiste (Phase 4): was gerade durch Ereigniskarten an der
      // Plattform zerrt, steht im Hauptbild statt in einem Modal. Leer
      // blendet sie sich per CSS (:empty) selbst aus.
      + '  <div id="rt-event-strip"></div>'
      + '</div>'
      + '<div id="world">'
      + '  <div id="world-camera">'
      + '    <div id="iso-grid"></div>'
      + '    <div id="building-ui-layer"></div>'
      + '  </div>'
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

    // Erklär-Tour zur aktuellen Phase, falls noch nicht gesehen: am
    // Spielanfang die Intro-Tour, in Phase 1 die Go-Live-Karte, ab Phase 2
    // die Trend/Watchtime-Tour, ab Phase 3 die KI-Labor-Tour (die kommen
    // normalerweise schon aus der Launch-Sequenz bzw. dem Investor-/
    // Marcus-Modal — das hier ist nur der Nachhol-Pfad).
    // Die Verzögerung ist nötig: der Spotlight misst echte Elemente, die
    // erst nach dem ersten Refresh von Grid und Ressourcen-Bar stehen.
    setTimeout(function () { RT.tour.startIfNew(); }, 600);
  }

  function exit() {
    if (_cleanupResBar) { _cleanupResBar(); _cleanupResBar = null; }
  }

  RT.screens.register('game', { enter: enter, exit: exit });
})(window.RT3);
