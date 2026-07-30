/* Bootstrap: UI initialisieren, Uhr starten. */
(function (RT) {
  'use strict';
  function boot() {
    RT.ui.init();
    RT.clock.start();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.RT2);
