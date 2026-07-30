/* Bootstrap. Läuft als letztes Script, sobald DOM bereit ist.
   Hängt den Screen-Container an und entscheidet, wo das Spiel startet:
     • Wenn eine Identität in localStorage liegt → direkt in die Garage
     • Sonst → ganz vorne im Intro */
(function (RT) {
  'use strict';

  function boot() {
    var app = document.getElementById('app');
    if (!app) {
      console.error('[main] #app-Container fehlt im DOM');
      return;
    }
    RT.screens.setContainer(app);

    if (RT.debug) {
      console.log('[main] RT Strategie ' + RT.version);
    }

    var hasSave = RT.persistence.load();

    // Shop
    var shopBtn = document.getElementById('rt-shop-open');
    if (shopBtn) shopBtn.addEventListener('click', function () { RT.shop.open(); });

    // Monatsring + Label live aktualisieren
    var ringFill   = document.getElementById('rt-ring-fill');
    var monthLabel = document.getElementById('rt-month-label');

    RT.bus.on('clock:tick', function (d) {
      if (ringFill) ringFill.setAttribute('stroke-dashoffset', (100 * (1 - d.progress)).toFixed(1));
    });

    // Monatslabel bei jedem Monatswechsel aktualisieren – auch nach Reset/Restore
    var _shownMonth = -1;
    RT.state.subscribe(function (s) {
      if (s.month !== _shownMonth) {
        _shownMonth = s.month;
        if (monthLabel) monthLabel.textContent = fmtGameMonth(s.month);
      }
    });

    // Monatsanzeige sofort korrekt setzen (nicht erst beim nächsten Tick)
    if (monthLabel) monthLabel.textContent = fmtGameMonth(RT.state.get().month);

    var startScreen = 'intro';
    if (hasSave && RT.persistence.hasIdentity()) {
      var phase = RT.persistence.savedPhase();
      startScreen = (phase === 'campus' || phase === 'expansion' || phase === 'end') ? phase : 'garage';
    }
    RT.screens.show(startScreen);
  }

  function fmtGameMonth(totalMonths) {
    var N = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    var y = 2026 + Math.floor(totalMonths / 12);
    var m = totalMonths % 12;
    return N[m] + '. ' + String(y).slice(2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.RT);
