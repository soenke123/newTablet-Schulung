/* Bootstrap. Lädt gespeicherten Spielstand aus localStorage; wenn Player
   schon gesetzt ist, geht's direkt ins Game, sonst normaler Intro-Flow. */
(function (RT) {
  'use strict';
  function boot() {
    RT.screens.setContainer(document.getElementById('app'));

    var loaded = RT.storage.load();
    RT.storage.init();
    RT.debug.init();

    // Abwesenheit nachholen, bevor der erste Frame steht (max. 5 Zyklen je System).
    var offline = null;
    if (loaded && RT.state.current.savedAt) {
      offline = RT.actions.offlineCatchUp(Date.now() - RT.state.current.savedAt);
    }

    if (loaded && RT.state.current.player && RT.state.current.player.name) {
      RT.screens.show('game');
      reportOffline(offline);
    } else {
      RT.screens.show('intro');
    }
  }

  // Kurze Rückmeldung, was während der Abwesenheit passiert ist.
  function reportOffline(r) {
    if (!r) return;
    var parts = [];
    if (r.trendStacks > 0) parts.push('Trend +' + r.trendStacks + ' Stapel');
    if (r.watchtime   > 0) parts.push('Watchtime angesammelt');
    if (r.usersLost   > 0) parts.push('−' + r.usersLost + ' User abgewandert');
    if (!parts.length) return;
    setTimeout(function () {
      RT.bus.emit('toast', '⏱ Während du weg warst: ' + parts.join(' · '));
    }, 900);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.RT3);
