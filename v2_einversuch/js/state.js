/* State — bewusst simpel: direkte Mutationen, kein Reducer.
   MVP-Prinzip: erst wenn wir sehen dass es Spaß macht, kommt die Architektur.
   Für v2-vollversion später ggf. auf Reducer-Pattern zurück. */
(function (RT) {
  'use strict';

  // Features im HQ. Reihenfolge zeigt Fortschritt an.
  // "unlock: 'werbeagentur'" macht die Werbeagentur sichtbar.
  var FEATURES = [
    {
      id: 'website',
      name: 'Website online stellen',
      desc: 'Deine Startup-Seite geht live. Leute können sich anmelden.',
      duration: 30,          // Sekunden
      cost: 0,
      effect: { unlock: 'werbeagentur' }
    },
    {
      id: 'account',
      name: 'Account-System',
      desc: 'User können sich registrieren und wiederkommen.',
      duration: 45,
      cost: 400,
      effect: { adFactorAdd: 1.0 }   // Werbeagentur verdient doppelt so viel
    },
    {
      id: 'feed',
      name: 'News-Feed',
      desc: 'User scrollen den Feed — Münzen kommen doppelt so schnell.',
      duration: 60,
      cost: 1500,
      effect: { coinIntervalMul: 0.5 }  // Coin-Cooldown halbiert
    }
  ];

  var state = {
    users: 0,
    money: 1000,
    ruf: 0.02,           // -0.20 bis +0.06 sinnvoller Bereich

    // HQ-Feature-Entwicklung
    hq: {
      currentId: null,        // id des aktuell laufenden Features
      startedAt: 0,           // performance.now() beim Start
      done: {}                // id → true wenn fertig
    },

    // Werbeagentur
    ad: {
      unlocked: false,
      slider: 0.10,           // 0.00 – 0.50
      factor: 2.0,            // Basis-€/User pro Coin-Zyklus (bei Slider 100%), Feature erhöht
      coinIntervalBase: 15,   // Sekunden zwischen Coins (kann durch Features halbiert werden)
      coinIntervalMul: 1.0,
      nextCoinAt: 0,          // performance.now() ab wann Coin bereit
      coinReady: false,
      coinValue: 0
    },

    // Marketing-Aktion "Freunden erzählen"
    marketing: {
      cooldown: 20,           // Sekunden
      lastClickAt: -Infinity, // performance.now()
      baseUsers: 200
    }
  };

  RT.state = {
    FEATURES: FEATURES,
    get: function () { return state; },

    // Hilfs-Getter — kapseln kleine Rechnungen damit UI/Loop nicht doppelt rechnen
    coinInterval: function () {
      return state.ad.coinIntervalBase * state.ad.coinIntervalMul;
    },
    coinValueNow: function () {
      // €/Sekunde-Wert × Intervall × Slider. Ergibt bei users=1000, slider=0.1, factor=0.5, intv=15:
      //   1000 * 0.5 * 0.1 * 15 / 60 = 12,5 € pro Coin. OK.
      return Math.floor(state.users * state.ad.factor * state.ad.slider * state.ad.coinIntervalBase / 60);
    },
    marketingReady: function (now) {
      return (now - state.marketing.lastClickAt) >= state.marketing.cooldown * 1000;
    },
    marketingCooldownLeft: function (now) {
      var left = state.marketing.cooldown * 1000 - (now - state.marketing.lastClickAt);
      return Math.max(0, left / 1000);
    }
  };
})(window.RT2);
