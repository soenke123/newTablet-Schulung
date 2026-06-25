/* Zeit-System: diskreter Monatswechsel.
   Spieler klickt einen Button → advanceMonth() → state-Dispatch → bus emittiert 'month:advance'.
   Spätere Subsysteme (Produktion, Forschung, Wachstum) hören darauf. */
(function (RT) {
  'use strict';

  // Gibt ein zufälliges aktives Assignment zurück, das einen Worker belegt.
  function pickRandomAssignment(s) {
    var pool = [];
    var camps = s.campaigns || [];
    for (var i = 0; i < camps.length; i++) {
      if (camps[i].phase === 'running' && (camps[i].workers || 0) > 0) {
        pool.push({ kind: 'campaign', id: camps[i].id });
      }
    }
    var tt = s.techtree || {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var node = tt[nid];
      if (node && typeof node === 'object' && node.status === 'in_progress' && (node.workers || 0) > 0) {
        pool.push({ kind: 'techtree', nodeId: nid });
      }
    }
    if (s.werbeagentur && (s.werbeagentur.workers || 0) > 0) {
      pool.push({ kind: 'werbeagentur' });
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

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

    var s     = RT.state.get();
    var cap   = (s.resources && s.resources.serverCapacity) || 0;
    var usage = ((s.resources && s.resources.serverUsage)         || 0)
              + ((s.resources && s.resources.serverSoftwareUsage) || 0);

    if (s.phase === 'campus' || s.phase === 'expansion') {
      // Erster Worker (du selbst) ist kostenlos — nur zusätzlich eingestellte kosten 2.000 €/Mon.
      // Auto-Entlassung: Mitarbeiter werden gefeuert bevor Geld unter 0 fällt.
      var hiredWorkers = (s.resources && s.resources.workers && s.resources.workers.max) || 0;
      var currentMoney = (s.resources && s.resources.money) || 0;
      var paidWorkers  = Math.max(0, hiredWorkers - 1);
      while (paidWorkers > 0 && currentMoney < paidWorkers * 2000) {
        RT.state.dispatch('SET_WORKERS', { max: hiredWorkers - 1 });
        hiredWorkers--;
        paidWorkers--;
        // Zufälligen aktiven Slot freigeben, damit occupied nicht > max bleibt.
        var toCancel = pickRandomAssignment(RT.state.get());
        if (toCancel) {
          if (toCancel.kind === 'campaign') {
            RT.state.dispatch('CAMPAIGN_CANCEL', { id: toCancel.id });
          } else if (toCancel.kind === 'techtree') {
            RT.state.dispatch('TECHTREE_CANCEL', { nodeId: toCancel.nodeId });
          } else if (toCancel.kind === 'werbeagentur') {
            var waWorkers = (RT.state.get().werbeagentur && RT.state.get().werbeagentur.workers) || 0;
            if (waWorkers > 0) RT.state.dispatch('WERBEAGENTUR_SET_WORKERS', { workers: waWorkers - 1 });
          }
        }
      }
      if (paidWorkers > 0) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -(paidWorkers * 2000), label: 'Teamgehälter' });
      }

      // Ruf-Zerfall nur bei Server-Überlastung (≥95 % Auslastung)
      var overloaded = cap > 0 && usage >= cap * 0.95;
      if (overloaded) RT.state.dispatch('ADD_REPUTATION', { delta: -0.002 });
    }
  }

  RT.tick = {
    advanceMonth: advanceMonth
  };
})(window.RT);
