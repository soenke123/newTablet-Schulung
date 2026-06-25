/* Phase D – Endbildschirm. Schritt 1: Demo-Abschluss mit Replay-Button.
   Spätere Erweiterung: 7 verschiedene Enden, Time-lapse, Reflexions-Screen. */
(function (RT) {
  'use strict';

  function enter(container /*, params */) {
    var s = RT.state.get();
    var points = Math.min(10, Math.floor(s.resources.users / 1000));
    var max = 10;

    RT.state.dispatch('GAME_ENDED');

    container.innerHTML = ''
      + '<section class="rt-screen">'
      + '  <div class="rt-card" style="text-align:center; max-width: 560px; margin: 48px auto;">'
      + '    <h1>🏁 Demo beendet</h1>'
      + '    <p>Das war ein Test-Durchlauf vom Skelett. Die echten Phasen kommen als nächstes.</p>'
      + '    <div style="margin: 16px 0;">'
      + '      <strong>Punkte:</strong> ' + points + ' / ' + max + '<br>'
      + '      <strong>Monate gespielt:</strong> ' + s.month
      + '    </div>'
      + '    <div class="rt-modal__actions">'
      + '      <button class="rt-btn rt-btn--success" id="rt-replay">🔄 Nochmal</button>'
      + '    </div>'
      + '  </div>'
      + '</section>';

    container.querySelector('#rt-replay').addEventListener('click', function () {
      RT.state.dispatch('RESET');
      RT.screens.show('character');
    });
  }

  function exit() { /* nichts zu tun */ }

  RT.screens.register('end', { enter: enter, exit: exit });
})(window.RT);
