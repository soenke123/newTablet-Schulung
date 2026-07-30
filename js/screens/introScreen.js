/* Intro – allererster Screen vor dem Onboarding.
   Erklärt die Grundidee in 2-3 Sätzen und führt per "Idee umsetzen" weiter zur Charakterwahl. */
(function (RT) {
  'use strict';

  function enter(container) {
    document.body.classList.add('rt-onboarding-active');
    container.innerHTML = ''
      + '<section class="rt-screen rt-intro">'
      + '  <div class="rt-card rt-intro__card">'
      + '    <div class="rt-intro__brand">Startup Story</div>'
      + '    <div class="rt-intro__tagline">Von der Garage bis zum Imperium</div>'
      + '    <div class="rt-intro__hero">💡</div>'
      + '    <h1 class="rt-intro__title">Du hast eine Idee.</h1>'
      + '    <p class="rt-intro__lead">'
      + '      Eine eigene <strong>Social-Media-Plattform</strong> — gegründet, gebaut und'
      + '      groß gemacht von dir selbst.'
      + '    </p>'
      + '    <p class="rt-intro__lead">'
      + '      Aus einer kleinen Garage soll ein Netzwerk werden, das die Welt verändert.'
      + '      Bereit?'
      + '    </p>'
      + '    <div class="rt-intro__cta">'
      + '      <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-intro-go">'
      + '        🚀 Idee umsetzen'
      + '      </button>'
      + '    </div>'
      + '  </div>'
      + '</section>';

    container.querySelector('#rt-intro-go').addEventListener('click', function () {
      RT.screens.show('character');
    });
  }

  function exit() {}

  RT.screens.register('intro', { enter: enter, exit: exit });
})(window.RT3);
