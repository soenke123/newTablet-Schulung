/* Game-Loop-Logik. Reagiert auf 'tick':
   - HQ-Feature-Timer prüfen → wenn fertig 'hq:done'
   - Werbeagentur-Coin-Timer prüfen → wenn bereit 'ad:coin-ready'
   Verändert direkt state. Emit von 'state:changed' triggert UI-Re-Render. */
(function (RT) {
  'use strict';

  function tick(e) {
    var s   = RT.state.get();
    var now = e.now;
    var changed = false;

    // --- HQ-Feature ---
    if (s.hq.currentId) {
      var feat = RT.state.FEATURES.find(function (f) { return f.id === s.hq.currentId; });
      if (feat) {
        var elapsedSec = (now - s.hq.startedAt) / 1000;
        if (elapsedSec >= feat.duration && !s.hq.done[feat.id]) {
          // Fertig! Effekt anwenden.
          s.hq.done[feat.id] = true;
          s.hq.currentId = null;
          applyFeatureEffect(feat, s);
          RT.bus.emit('hq:done', { feature: feat });
          RT.bus.emit('toast', '🎉 ' + feat.name + ' fertig!');
          changed = true;
        }
      }
    }

    // --- Werbeagentur-Coin ---
    if (s.ad.unlocked && !s.ad.coinReady) {
      if (now >= s.ad.nextCoinAt) {
        s.ad.coinReady = true;
        s.ad.coinValue = RT.state.coinValueNow();
        RT.bus.emit('ad:coin-ready');
        changed = true;
      }
    }

    // UI braucht regelmäßig Updates für Progress-Bars und Cooldown-Anzeigen.
    // Da rAF eh läuft, emit einfach immer.
    RT.bus.emit('state:tick', e);
    if (changed) RT.bus.emit('state:changed');
  }

  function applyFeatureEffect(feat, s) {
    var eff = feat.effect || {};
    if (eff.unlock === 'werbeagentur' && !s.ad.unlocked) {
      s.ad.unlocked = true;
      s.ad.nextCoinAt = performance.now() + RT.state.coinInterval() * 1000;
      RT.bus.emit('ad:unlocked');
    }
    if (typeof eff.adFactorAdd === 'number') {
      s.ad.factor += eff.adFactorAdd;
    }
    if (typeof eff.coinIntervalMul === 'number') {
      s.ad.coinIntervalMul *= eff.coinIntervalMul;
    }
  }

  // --- Aktionen (werden von UI aufgerufen) ---
  RT.actions = {
    startFeature: function (id) {
      var s = RT.state.get();
      if (s.hq.currentId) return { ok: false, reason: 'busy' };
      if (s.hq.done[id])   return { ok: false, reason: 'done' };
      var feat = RT.state.FEATURES.find(function (f) { return f.id === id; });
      if (!feat) return { ok: false, reason: 'unknown' };
      if (s.money < feat.cost) return { ok: false, reason: 'money' };
      s.money -= feat.cost;
      s.hq.currentId = id;
      s.hq.startedAt = performance.now();
      RT.bus.emit('state:changed');
      RT.bus.emit('hq:started', { feature: feat });
      return { ok: true };
    },

    collectCoin: function () {
      var s = RT.state.get();
      if (!s.ad.coinReady) return;
      s.money += s.ad.coinValue;
      s.ad.coinReady = false;
      s.ad.nextCoinAt = performance.now() + RT.state.coinInterval() * 1000;
      RT.bus.emit('ad:coin-collected', { value: s.ad.coinValue });
      RT.bus.emit('state:changed');
    },

    setAdSlider: function (percent) {
      var s = RT.state.get();
      s.ad.slider = Math.max(0, Math.min(50, percent)) / 100;
      RT.bus.emit('state:changed');
    },

    marketingClick: function () {
      var s = RT.state.get();
      var now = performance.now();
      if (!RT.state.marketingReady(now)) return { ok: false };
      s.users += s.marketing.baseUsers;
      s.marketing.lastClickAt = now;
      RT.bus.emit('marketing:click', { added: s.marketing.baseUsers });
      RT.bus.emit('toast', '+' + s.marketing.baseUsers + ' User!');
      RT.bus.emit('state:changed');
      return { ok: true };
    }
  };

  // Loop starten (subscribe an Clock)
  RT.bus.on('tick', tick);
})(window.RT2);
