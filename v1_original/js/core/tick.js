/* Zeit-System: diskreter Monatswechsel.
   Spieler klickt einen Button → advanceMonth() → state-Dispatch → bus emittiert 'month:advance'.
   Spätere Subsysteme (Produktion, Forschung, Wachstum) hören darauf. */
(function (RT) {
  'use strict';

  RT.bus.on('phase:changed', function (e) {
    if (e && e.phase === 'expansion') {
      RT.state.dispatch('SET_EXPANSION_START_MONTH', { month: RT.state.get().month });
    }
  });

  function advanceMonth() {
    var sPre = RT.state.get();

    // 1. Ruf-Wachstum zuerst — auf die Userbasis VOR dem Monatswechsel,
    //    damit Kampagnen-Effekte den Ruf-Multiplikator nicht aufblähen.
    if (sPre.phase === 'campus' || sPre.phase === 'expansion') {
      var rep   = typeof sPre.reputation === 'number' ? sPre.reputation : 0.02;
      var users = (sPre.resources && sPre.resources.users) || 0;
      if (users > 0 && rep !== 0) {
        var repDelta = Math.round(users * rep);
        if (repDelta !== 0) RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: repDelta });
      }
    }

    // 2. Monatswechsel — emittiert 'month:advance' → Kampagnen-Effekte laufen jetzt.
    RT.state.dispatch('ADVANCE_MONTH');

    // Expansion-Narrative-Events
    (function () {
      var sE = RT.state.get();
      if (sE.phase !== 'expansion') return;
      // Fallback für alte Saves ohne expansionStartMonth
      if (sE.expansionStartMonth == null) {
        RT.state.dispatch('SET_EXPANSION_START_MONTH', { month: sE.month });
        return;
      }
      var expM = sE.month - sE.expansionStartMonth;
      if (expM === 2) {
        var sl = sE.storyLog || [];
        var alreadyHas = false;
        for (var sli = 0; sli < sl.length; sli++) {
          if (sl[sli].id === 'werbekrise_ankuendigung') { alreadyHas = true; break; }
        }
        if (!alreadyHas) {
          RT.state.dispatch('ADD_STORY_LOG', {
            id:    'werbekrise_ankuendigung',
            title: '📢 Werbekunden fordern neue Verträge',
            body:  'Deine Werbekunden sind unzufrieden: Die Userzahlen wachsen, aber die Klickraten auf ihren Seiten halten nicht Schritt. Sie zahlen immer mehr für immer weniger Wirkung.\n\nDeshalb wollen sie ihre Werbekosten neu ausrichten:\n\n• Watchtime-basierte Abrechnung — sie wollen für real gesehene Werbung zahlen\n• Personalisierte Anzeigen — Werbung soll gezielt an bestimmte Nutzergruppen ausgespielt werden\n\nDie aktuellen Verträge laufen in 6 Monaten aus. Ab dann gelten die neuen Konditionen.\n\n💡 Tipp: Der Metadaten-Node im Techbaum ist das Eingangstor zu diesen Technologien. Damit lässt sich Watchtime tracken — und im KI-Zentrum werden später Clustering und personalisierte Werbung möglich.',
            month: sE.month
          });
          RT.bus.emit('story:show-popup', { id: 'werbekrise_ankuendigung' });
        }
      }
      if (expM === 8 && !sE.werbekriseActive) {
        RT.state.dispatch('WERBEKRISE_ACTIVATE', {});
      }
    }());

    var s     = RT.state.get();
    var cap   = (s.resources && s.resources.serverCapacity) || 0;
    var usage = ((s.resources && s.resources.serverUsage)         || 0)
              + ((s.resources && s.resources.serverSoftwareUsage) || 0);

    if (s.phase === 'campus' || s.phase === 'expansion') {
      // Support-Programm: zuerst prüfen ob noch leistbar, sonst sofort deaktivieren.
      var paidSpCost = 0;
      var sSP0 = RT.state.get();
      if (sSP0.supportProgram && sSP0.supportProgram.active) {
        var spCost  = sSP0.supportProgram.costPerMonth || 30000;
        var spMoney = (sSP0.resources && sSP0.resources.money) || 0;
        if (spMoney < spCost) {
          RT.state.dispatch('STOP_SUPPORT_PROGRAM', { addRestart: false });
          RT.bus.emit('campus:grid-changed', {});
        } else {
          RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -spCost, label: 'support' });
          paidSpCost = spCost;
        }
      }

      // Team-Monatskosten aus Team-Stufe (Solo=0, Duo=2.500 …). Konto darf ins Minus
      // — keine Auto-Entlassung mehr. Nur zahlen, wenn Kosten > 0.
      var teamCost = RT.team ? RT.team.getMonthlyCost() : 0;
      if (teamCost > 0) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -teamCost, label: 'Team-Kosten' });
      }

      // Server-Farm Betriebskosten + Auto-Downgrade
      var sfCostArr = [[0,0],[0,2000],[5000,10000,40000,300000]];
      var calcSFCost = function () {
        var blds = RT.state.get().buildings || [];
        var tot = 0;
        for (var i = 0; i < blds.length; i++) {
          if (blds[i].type !== 'serverfarm') continue;
          var row = sfCostArr[blds[i].structLevel || 0] || [];
          tot += row[blds[i].expansionTier || 0] || 0;
        }
        return tot;
      };

      // Auto-Downgrade: Tiers stufenweise reduzieren bis Geld ausreicht.
      // Reihenfolge: kleinster Tier zuerst; bei Gleichstand kleinster Slot.
      var dgGuard = 0;
      while (dgGuard++ < 20) {
        var dgMoney = (RT.state.get().resources && RT.state.get().resources.money) || 0;
        if (dgMoney >= calcSFCost()) break;
        var dgCands = [];
        var dgBlds  = RT.state.get().buildings || [];
        for (var dgi = 0; dgi < dgBlds.length; dgi++) {
          if (dgBlds[dgi].type === 'serverfarm' && (dgBlds[dgi].expansionTier || 0) > 0) {
            dgCands.push(dgBlds[dgi]);
          }
        }
        if (dgCands.length === 0) break;
        dgCands.sort(function (a, b) {
          var ta = a.expansionTier || 0, tb = b.expansionTier || 0;
          return ta !== tb ? ta - tb : a.slot - b.slot;
        });
        RT.state.dispatch('ADJUST_SERVERFARM_TIER', { slot: dgCands[0].slot, delta: -1 });
      }

      var sfCostTotal = calcSFCost();
      if (sfCostTotal > 0) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -sfCostTotal, label: 'Server-Betrieb' });
      }

      // Kapazität nach Downgrade zu gering → überschüssige User löschen
      var sAfterSF   = RT.state.get();
      var capAfterSF = (sAfterSF.resources && sAfterSF.resources.serverCapacity)       || 0;
      var usrAfterSF = (sAfterSF.resources && sAfterSF.resources.users)                || 0;
      var swAfterSF  = (sAfterSF.resources && sAfterSF.resources.serverSoftwareUsage)  || 0;
      var perUserSF  = sAfterSF.metadatenActive ? 2 : 1;
      var maxUsers   = Math.max(0, Math.floor((capAfterSF - swAfterSF) / perUserSF));
      if (usrAfterSF > maxUsers) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: -(usrAfterSF - maxUsers), label: 'Kapazitätsüberschreitung' });
      }

      // Ruf-Zerfall nur bei Server-Überlastung (≥95 % Auslastung) — frischer State
      var sRuf    = RT.state.get();
      var capRuf  = (sRuf.resources && sRuf.resources.serverCapacity) || 0;
      var usageRuf = ((sRuf.resources && sRuf.resources.serverUsage)         || 0)
                   + ((sRuf.resources && sRuf.resources.serverSoftwareUsage) || 0);
      if (capRuf > 0 && usageRuf >= capRuf * 0.95) RT.state.dispatch('ADD_REPUTATION', { delta: -0.002 });

      // Marcus' 15% auf den echten Gewinn — nach allen Ausgaben berechnet.
      // Revenue kommt von werbeagentur (bereits während month:advance gebucht),
      // Team-, Server- und Support-Kosten sind jetzt abgezogen.
      if (s.phase === 'expansion' && RT.state.get().marcusDealAccepted) {
        var sMarcus  = RT.state.get();
        var mRevenue = (sMarcus.werbeagentur && sMarcus.werbeagentur.lastMonthRevenue) || 0;
        var mProfit  = mRevenue - teamCost - sfCostTotal - paidSpCost;
        var mCut     = Math.floor(Math.max(0, mProfit) * 0.15);
        if (mCut > 0) RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -mCut, label: 'marcus' });
      }

      var sFinal = RT.state.get();
      if ((sFinal.resources.money || 0) < -500000 && !sFinal.isBankrupt) {
        RT.state.dispatch('DECLARE_BANKRUPTCY', {});
        RT.bus.emit('game:bankrupt', {});
      }
    }
  }

  RT.tick = {
    advanceMonth: advanceMonth
  };
})(window.RT);
