/* Bootstrap. Startet mit dem Intro-Screen; das Game-DOM wird erst
   im gameScreen aufgebaut, nachdem Charakter + Plattform gewählt sind. */
(function (RT) {
  'use strict';
  function boot() {
    RT.screens.setContainer(document.getElementById('app'));
    RT.screens.show('intro');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.RT3);
