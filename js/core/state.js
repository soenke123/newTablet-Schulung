/* Zentraler Spielstand.
   Mutationen NUR via dispatch(action, payload). Reducer-Schema, damit später
   Replay/Undo/Save-Slot trivial nachrüstbar ist. */
(function (RT) {
  'use strict';

  function makeInitialState() {
    return {
      phase: 'garage',            // 'garage' | 'campus' | 'expansion' | 'end'
      month: 0,
      goLiveUnlocked: false,      // true nach dem ersten "Plattform online stellen"-Modal
      pendingPlacement: null,     // string | null — Gebäude-Typ der gerade platziert wird
      player: {
        name: '',
        avatar: null,
        platformName: '',
        platformLogo: null
      },
      resources: {
        money: 0,
        users: 0,
        serverCapacity: 0,
        serverUsage: 0,          // User-Verbindungen (1 pro User)
        serverSoftwareUsage: 0,  // Software-Belastung (Apps, Dienste)
        workers: { occupied: 0, max: 0, capacity: 0 }
      },
      buildings: [],              // gefüllt in Phase A
      research: {},               // gefüllt in Phase A
      purchases: {},              // { itemId: true } — Shop-Käufe
      techtree: {},               // { nodeId: 'done' | { status, startMonth } }
      campaigns: [],
      pendingCelebrations: [],    // nodeIds die fertig sind aber noch gefeiert werden müssen
      userGrowthRate: 0,          // monatl. Wachstumsfaktor (0.15 = +15%/Monat) — durch Marketing-Nodes
      reputation: 0.02,           // -0.02 … 0.04; Mundpropaganda: monatl. User-Wachstum in %. Startet in Phase 2.
      werbeagentur: {
        workers:          0,      // zugewiesene Mitarbeiter
        capacity:         3,      // max Slots (wächst mit Upgrades)
        lastMonthRevenue: 0,      // Einnahmen letzten Monat (für campus-Badge)
        settings: {
          banner:         { frequency: 10 },
          sponsored_post: { frequency: 10 },
          search_ad:      { frequency: 10 },
          video_ad:       { frequency: 10 }
        }
      },
      marcusDealAccepted: false,
      meta: { gameStarted: false, gameEnded: false, seenTabMarketing: false, seenTabWerbung: false },
      transactions:  [],                         // { month, delta, label } — alle Geldbewegungen
      sparkHistory:  { money: [], users: [] }    // Verlauf für Resource-Bar-Sparklines
    };
  }

  var state = makeInitialState();
  var subscribers = [];

  function get() { return state; }

  function subscribe(handler) {
    subscribers.push(handler);
    return function unsubscribe() {
      var i = subscribers.indexOf(handler);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  function notify(action) {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](state, action); }
      catch (e) { console.error('[state] subscriber error', e); }
    }
  }

  // Reducer – jede Action wird hier handled. Neue Module fügen ihre Cases hinzu.
  function reduce(action, payload) {
    switch (action) {
      case 'SET_PHASE':
        state.phase = payload.phase;
        return;

      case 'ADVANCE_MONTH':
        state.month += 1;
        return;

      case 'SET_PLAYER':
        // Shallow-Merge in player – z.B. { name: 'Anna' } oder { avatar: 'fox' }
        for (var k in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, k)) {
            state.player[k] = payload[k];
          }
        }
        return;

      case 'SET_RESOURCE':
        // Atomares Setzen eines Ressourcen-Werts: { key: 'money', value: 1000 }
        state.resources[payload.key] = payload.value;
        return;

      case 'ADD_RESOURCE': {
        // Inkrement/Dekrement: { key: 'money', delta: -200 }
        var addDelta = payload.delta || 0;
        // User-Wachstum hard auf freie Server-Kapazität begrenzen.
        // Nutzer verlassen die Plattform (negatives delta) bleibt immer erlaubt.
        if (payload.key === 'users' && addDelta > 0) {
          var aCap  = state.resources.serverCapacity      || 0;
          var aUsed = (state.resources.serverUsage        || 0)
                    + (state.resources.serverSoftwareUsage || 0);
          addDelta = Math.min(addDelta, Math.max(0, aCap - aUsed));
        }
        state.resources[payload.key] = (state.resources[payload.key] || 0) + addDelta;
        if (payload.key === 'users') {
          state.resources.serverUsage = (state.resources.serverUsage || 0) + addDelta;
        }
        if (payload.key === 'money' && addDelta !== 0) {
          state.transactions.push({ month: state.month, delta: addDelta, label: payload.label || '' });
        }
        return;
      }

      case 'SET_WORKERS':
        // Verschachtelte Workers separat – { occupied: 1, max: 1, capacity: 4 }.
        if (payload.occupied != null) state.resources.workers.occupied = payload.occupied;
        if (payload.max      != null) state.resources.workers.max      = payload.max;
        if (payload.capacity != null) state.resources.workers.capacity = payload.capacity;
        return;

      case 'GAME_STARTED':
        state.meta.gameStarted = true;
        return;

      case 'GAME_ENDED':
        state.meta.gameEnded = true;
        return;

      case 'MARK_TAB_SEEN':
        if (payload.tab === 'marketing') state.meta.seenTabMarketing = true;
        if (payload.tab === 'werbung')   state.meta.seenTabWerbung   = true;
        return;

      case 'TECHTREE_START':
        // payload: { nodeId, startMonthFull, buildingGridSlot, workSlotIndex, workers }
        state.techtree[payload.nodeId] = {
          status:           'in_progress',
          startMonthFull:   payload.startMonthFull,
          buildingGridSlot: payload.buildingGridSlot !== undefined ? payload.buildingGridSlot : 0,
          workSlotIndex:    payload.workSlotIndex    !== undefined ? payload.workSlotIndex    : 0,
          workers:          payload.workers          !== undefined ? payload.workers          : 0
        };
        return;

      case 'TECHTREE_COMPLETE':
        // payload: { nodeId, buildingGridSlot?, workSlotIndex?, workers? }
        state.techtree[payload.nodeId] = 'done';
        state.pendingCelebrations.push({
          nodeId:           payload.nodeId,
          buildingGridSlot: payload.buildingGridSlot || 0,
          workSlotIndex:    payload.workSlotIndex    || 0,
          workers:          payload.workers          || 0
        });
        return;

      case 'CELEBRATE_NODE': {
        // payload: { nodeId } — entfernt aus pendingCelebrations, gibt Worker frei.
        var pcIdx = -1;
        for (var pci = 0; pci < state.pendingCelebrations.length; pci++) {
          var pcItem = state.pendingCelebrations[pci];
          var pcId   = typeof pcItem === 'object' ? pcItem.nodeId : pcItem;
          if (pcId === payload.nodeId) { pcIdx = pci; break; }
        }
        if (pcIdx >= 0) {
          state.pendingCelebrations.splice(pcIdx, 1);
        }
        // Occupied neu berechnen: in_progress-Nodes + ausstehende (Nicht-Kampagnen) Feiern + laufende Kampagnen.
        var recalcOcc = 0;
        for (var nidR in state.techtree) {
          if (!Object.prototype.hasOwnProperty.call(state.techtree, nidR)) continue;
          var eR = state.techtree[nidR];
          if (eR && typeof eR === 'object' && eR.status === 'in_progress') {
            recalcOcc += eR.workers || 0;
          }
        }
        for (var pciR = 0; pciR < state.pendingCelebrations.length; pciR++) {
          var pcR = state.pendingCelebrations[pciR];
          if (typeof pcR === 'object' && pcR.kind !== 'campaign') {
            recalcOcc += pcR.workers || 0;
          }
        }
        var campsR = state.campaigns || [];
        for (var cR = 0; cR < campsR.length; cR++) {
          if (campsR[cR].phase === 'running') recalcOcc += campsR[cR].workers || 0;
        }
        recalcOcc += (state.werbeagentur && state.werbeagentur.workers) || 0;
        state.resources.workers.occupied = recalcOcc;
        return;
      }

      case 'ADD_GROWTH_RATE':
        state.userGrowthRate = (state.userGrowthRate || 0) + payload.delta;
        return;

      case 'SET_GROWTH_RATE':
        state.userGrowthRate = payload.value;
        return;

      case 'ADD_REPUTATION': {
        var cur = typeof state.reputation === 'number' ? state.reputation : 0.02;
        state.reputation = Math.max(-0.20, Math.min(0.04, cur + payload.delta));
        return;
      }

      case 'SET_REPUTATION':
        state.reputation = Math.max(-0.20, Math.min(0.04, payload.value));
        return;

      case 'SET_GOLIVE_UNLOCKED':
        state.goLiveUnlocked = true;
        return;

      case 'MARCUS_DEAL_ACCEPT':
        state.marcusDealAccepted = true;
        return;

      case 'SET_PENDING_PLACEMENT':
        // payload: { type: 'buero' } | { type: null }
        state.pendingPlacement = payload.type || null;
        return;

      case 'PLACE_BUILDING':
        // payload: { type: 'buero', slot: 3 }
        state.buildings.push({ type: payload.type, slot: payload.slot, level: 0,
          upgraded: false, workerAssigned: false });
        state.pendingPlacement = null;
        if (payload.type === 'serverfarm') {
          state.resources.serverCapacity = (state.resources.serverCapacity || 0) + 50000;
        }
        if (payload.type === 'buero') {
          state.resources.workers.capacity = (state.resources.workers.capacity || 0) + 2;
        }
        return;

      case 'UPGRADE_SERVERFARM': {
        // payload: { slot } — kostet 30.000 €, setzt upgraded=true, level=1
        for (var ufi = 0; ufi < state.buildings.length; ufi++) {
          var uf = state.buildings[ufi];
          if (uf.slot === payload.slot && uf.type === 'serverfarm') {
            if (uf.upgraded) return;
            if ((state.resources.money || 0) < 30000) return;
            state.resources.money -= 30000;
            state.transactions.push({ month: state.month, delta: -30000, label: 'Server-Upgrade' });
            uf.upgraded = true;
            uf.level    = 1;
            return;
          }
        }
        return;
      }

      case 'ASSIGN_SERVERFARM_WORKER': {
        // payload: { slot } — toggled Worker-Zuweisung; setzt serverCapacity +/- 250.000
        for (var sfw = 0; sfw < state.buildings.length; sfw++) {
          var sfb = state.buildings[sfw];
          if (sfb.slot === payload.slot && sfb.type === 'serverfarm') {
            if (!sfb.upgraded) return;
            if (sfb.workerAssigned) {
              sfb.workerAssigned = false;
              state.resources.serverCapacity       = Math.max(0, (state.resources.serverCapacity       || 0) - 250000);
              state.resources.workers.occupied     = Math.max(0, (state.resources.workers.occupied     || 0) - 1);
            } else {
              var sfFree = (state.resources.workers.max || 0) - (state.resources.workers.occupied || 0);
              if (sfFree < 1) return;
              sfb.workerAssigned = true;
              state.resources.serverCapacity   = (state.resources.serverCapacity   || 0) + 250000;
              state.resources.workers.occupied = (state.resources.workers.occupied || 0) + 1;
            }
            return;
          }
        }
        return;
      }

      case 'PURCHASE_ITEM':
        // payload: { itemId: 'server1', cost: 400 }
        state.purchases[payload.itemId] = true;
        state.resources.money = (state.resources.money || 0) - payload.cost;
        if ((payload.cost || 0) > 0) {
          state.transactions.push({ month: state.month, delta: -(payload.cost), label: payload.label || payload.itemId });
        }
        return;

      case 'RESTORE_STATE': {
        // Überschreibt nur Felder die im Speicher vorhanden sind;
        // neue Felder aus makeInitialState() bleiben als Fallback.
        var base   = makeInitialState();
        var bkeys  = Object.keys(base);
        for (var ri = 0; ri < bkeys.length; ri++) {
          var rk = bkeys[ri];
          if (Object.prototype.hasOwnProperty.call(payload, rk)) {
            state[rk] = payload[rk];
          }
        }
        // Kapazität + belegte Worker aus gespeichertem Zustand neu berechnen.
        // Schützt vor alten Saves ohne campaigns-Feld und sonstigen Inkonsistenzen.
        if (state.resources && state.resources.workers) {
          var inMainPhase = state.phase === 'campus' || state.phase === 'expansion';
          var recalcCap = state.meta.gameStarted ? (inMainPhase ? 2 : 1) : 0;
          var recalcServerCap = inMainPhase ? 10000 : 3000;
          for (var bi = 0; bi < (state.buildings || []).length; bi++) {
            var bldgR = state.buildings[bi];
            if (bldgR.type === 'buero') recalcCap += 2;
            if (bldgR.type === 'serverfarm') {
              if (bldgR.upgraded && bldgR.workerAssigned) {
                recalcServerCap += 300000;
              } else {
                recalcServerCap += 50000;
              }
            }
          }
          state.resources.workers.capacity = recalcCap;
          state.resources.serverCapacity   = recalcServerCap;

          var recalcOccR = 0;
          for (var nidRR in state.techtree) {
            if (!Object.prototype.hasOwnProperty.call(state.techtree, nidRR)) continue;
            var eRR = state.techtree[nidRR];
            if (eRR && typeof eRR === 'object' && eRR.status === 'in_progress') {
              recalcOccR += eRR.workers || 0;
            }
          }
          for (var pciRR = 0; pciRR < (state.pendingCelebrations || []).length; pciRR++) {
            var pcRR = state.pendingCelebrations[pciRR];
            if (typeof pcRR === 'object' && pcRR.kind !== 'campaign') {
              recalcOccR += pcRR.workers || 0;
            }
          }
          for (var cRR = 0; cRR < (state.campaigns || []).length; cRR++) {
            if (state.campaigns[cRR].phase === 'running') recalcOccR += state.campaigns[cRR].workers || 0;
          }
          recalcOccR += (state.werbeagentur && state.werbeagentur.workers) || 0;
          // Server-Farm-Mitarbeiter (dauerhaft zugewiesen)
          for (var sfri = 0; sfri < (state.buildings || []).length; sfri++) {
            var sfrb = state.buildings[sfri];
            if (sfrb.type === 'serverfarm' && sfrb.upgraded && sfrb.workerAssigned) recalcOccR += 1;
          }
          state.resources.workers.occupied = recalcOccR;
        }
        return;
      }

      case 'RESET':
        state = makeInitialState();
        return;

      case 'CAMPAIGN_START': {
        var newCamp = {
          id: payload.id, type: payload.type,
          startMonthFull: payload.startMonthFull,
          workers: payload.workers || 0, phase: 'running',
          buildingGridSlot: payload.buildingGridSlot !== undefined ? payload.buildingGridSlot : -1,
          workSlotIndex:    payload.workSlotIndex    !== undefined ? payload.workSlotIndex    : 0
        };
        state.campaigns = (state.campaigns || []).concat([newCamp]);
        if ((payload.workers || 0) > 0) {
          state.resources.workers.occupied = (state.resources.workers.occupied || 0) + payload.workers;
        }
        var campCost = payload.cost || 0;
        state.resources.money = (state.resources.money || 0) - campCost;
        if (campCost > 0) {
          state.transactions.push({ month: state.month, delta: -campCost, label: payload.name ? 'Kampagne: ' + payload.name : 'Kampagne' });
        }
        return;
      }

      case 'CAMPAIGN_ENTER_NACHHALL': {
        var nc = state.campaigns || [];
        for (var nci = 0; nci < nc.length; nci++) {
          if (nc[nci].id === payload.id) {
            if ((nc[nci].workers || 0) > 0 && nc[nci].phase === 'running') {
              state.resources.workers.occupied = Math.max(0, (state.resources.workers.occupied || 0) - nc[nci].workers);
            }
            nc[nci].phase = 'nachhall';
            nc[nci].nachhallStartMonthFull = payload.nachhallStartMonthFull;
            break;
          }
        }
        return;
      }

      case 'CAMPAIGN_COMPLETE': {
        var cc = state.campaigns || [];
        for (var cci = 0; cci < cc.length; cci++) {
          if (cc[cci].id === payload.id) {
            var completing = cc[cci];
            // Nachhall-Abschlüsse: Workers wurden bereits in CAMPAIGN_ENTER_NACHHALL
            // freigegeben — hier nichts mehr tun.
            // Laufende Kampagnen: Workers erst in CELEBRATE_CAMPAIGN freigeben (Klick).
            if (completing.phase === 'running') {
              state.pendingCelebrations.push({
                kind:             'campaign',
                campaignId:       completing.id,
                campaignType:     completing.type,
                workers:          completing.workers || 0,
                buildingGridSlot: completing.buildingGridSlot !== undefined ? completing.buildingGridSlot : -1,
                workSlotIndex:    completing.workSlotIndex    !== undefined ? completing.workSlotIndex    : 0
              });
            }
            cc.splice(cci, 1);
            break;
          }
        }
        return;
      }

      case 'CELEBRATE_CAMPAIGN': {
        // Workers freigeben + Feier-Eintrag entfernen.
        for (var pcc = 0; pcc < state.pendingCelebrations.length; pcc++) {
          var pcce = state.pendingCelebrations[pcc];
          if (typeof pcce === 'object' && pcce.kind === 'campaign' && pcce.campaignId === payload.campaignId) {
            if ((pcce.workers || 0) > 0) {
              state.resources.workers.occupied = Math.max(0, (state.resources.workers.occupied || 0) - pcce.workers);
            }
            state.pendingCelebrations.splice(pcc, 1);
            break;
          }
        }
        return;
      }

      case 'CAMPAIGN_CANCEL': {
        // Bricht eine laufende Kampagne sofort ab — keine pendingCelebration, kein Popup.
        var ccCamps = state.campaigns || [];
        for (var ccI = 0; ccI < ccCamps.length; ccI++) {
          if (ccCamps[ccI].id === payload.id && ccCamps[ccI].phase === 'running') {
            state.resources.workers.occupied = Math.max(0,
              (state.resources.workers.occupied || 0) - (ccCamps[ccI].workers || 0));
            ccCamps.splice(ccI, 1);
            break;
          }
        }
        return;
      }

      case 'TECHTREE_CANCEL': {
        // Setzt eine laufende Forschung zurück auf "nicht gestartet", gibt Worker frei.
        var tcNode = state.techtree[payload.nodeId];
        if (tcNode && typeof tcNode === 'object' && tcNode.status === 'in_progress') {
          state.resources.workers.occupied = Math.max(0,
            (state.resources.workers.occupied || 0) - (tcNode.workers || 0));
          delete state.techtree[payload.nodeId];
        }
        return;
      }

      case 'WERBEAGENTUR_SET_WORKERS': {
        var wa = state.werbeagentur;
        var waNew = Math.max(0, Math.min(wa.capacity || 1, payload.workers || 0));
        var otherOcc = (state.resources.workers.occupied || 0) - (wa.workers || 0);
        var totalAfter = otherOcc + waNew;
        if (totalAfter > (state.resources.workers.max || 0)) return;
        wa.workers = waNew;
        state.resources.workers.occupied = totalAfter;
        return;
      }

      case 'WERBEAGENTUR_APPLY_SETTINGS': {
        var waApply = state.werbeagentur;
        var incoming = payload.settings || {};
        var skeys = Object.keys(incoming);
        for (var wsi = 0; wsi < skeys.length; wsi++) {
          var wsk = skeys[wsi];
          waApply.settings[wsk] = incoming[wsk];
        }
        return;
      }

      case 'WERBEAGENTUR_SET_CAPACITY':
        state.werbeagentur.capacity = payload.capacity;
        return;

      case 'WERBEAGENTUR_SET_LAST_REVENUE':
        state.werbeagentur.lastMonthRevenue = payload.amount || 0;
        return;

      case 'WERBEAGENTUR_CLEANUP_CAMPAIGNS': {
        var oldAdTypes = { banner: true, interstitial: true, sponsored_post: true };
        var cleanedCamps = [];
        var freedWorkers = 0;
        for (var wcci = 0; wcci < (state.campaigns || []).length; wcci++) {
          var wccamp = state.campaigns[wcci];
          if (oldAdTypes[wccamp.type]) {
            if (wccamp.phase === 'running') freedWorkers += wccamp.workers || 0;
          } else {
            cleanedCamps.push(wccamp);
          }
        }
        state.campaigns = cleanedCamps;
        if (freedWorkers > 0) {
          state.resources.workers.occupied = Math.max(0, (state.resources.workers.occupied || 0) - freedWorkers);
        }
        return;
      }

      case 'UPDATE_SPARK_HISTORY': {
        var sh = state.sparkHistory;
        sh.money.push(payload.money || 0);
        sh.users.push(payload.users || 0);
        if (sh.money.length > 24) sh.money.shift();
        if (sh.users.length > 24) sh.users.shift();
        return;
      }

      case 'RESET_SPARK_HISTORY':
        state.sparkHistory = { money: [], users: [] };
        return;

      default:
        console.warn('[state] unknown action:', action);
    }
  }

  function dispatch(action, payload) {
    if (RT.debug) console.log('[state]', action, payload);
    reduce(action, payload || {});
    notify({ type: action, payload: payload });
    // Bonus: für common cases automatisch Events emitten,
    // damit UI nicht selbst subscriben muss.
    if (action === 'SET_RESOURCE' || action === 'ADD_RESOURCE' || action === 'SET_WORKERS') {
      RT.bus.emit('resource:changed', { key: payload.key || 'workers', state: state.resources });
    }
    if (action === 'ADVANCE_MONTH') {
      RT.bus.emit('month:advance', { month: state.month });
    }
    if (action === 'SET_PHASE') {
      RT.bus.emit('phase:changed', { phase: payload.phase });
    }
    if (action === 'PURCHASE_ITEM') {
      RT.bus.emit('resource:changed', { key: 'money', state: state.resources });
    }
    if (action === 'ADD_REPUTATION' || action === 'SET_REPUTATION') {
      RT.bus.emit('reputation:changed', { reputation: state.reputation });
    }
    if (action === 'MARCUS_DEAL_ACCEPT') {
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'SET_PENDING_PLACEMENT' || action === 'PLACE_BUILDING') {
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'PLACE_BUILDING') {
      RT.bus.emit('resource:changed', { key: 'workers',        state: state.resources });
      RT.bus.emit('resource:changed', { key: 'serverCapacity', state: state.resources });
    }
    if (action === 'UPGRADE_SERVERFARM' || action === 'ASSIGN_SERVERFARM_WORKER') {
      RT.bus.emit('resource:changed', { key: 'money',          state: state.resources });
      RT.bus.emit('resource:changed', { key: 'serverCapacity', state: state.resources });
      RT.bus.emit('resource:changed', { key: 'workers',        state: state.resources });
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'CAMPAIGN_START' || action === 'CAMPAIGN_COMPLETE' || action === 'CAMPAIGN_ENTER_NACHHALL') {
      RT.bus.emit('resource:changed', { key: 'money',   state: state.resources });
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
      RT.bus.emit('campaigns:changed', {});
    }
    if (action === 'CELEBRATE_NODE') {
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
    }
    if (action === 'CELEBRATE_CAMPAIGN') {
      RT.bus.emit('campaigns:changed', {});
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
    }
    if (action === 'CAMPAIGN_CANCEL') {
      RT.bus.emit('campaigns:changed', {});
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'TECHTREE_CANCEL') {
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'WERBEAGENTUR_SET_WORKERS') {
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
      RT.bus.emit('werbeagentur:changed', {});
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'WERBEAGENTUR_APPLY_SETTINGS') {
      RT.bus.emit('werbeagentur:changed', {});
    }
    if (action === 'WERBEAGENTUR_SET_LAST_REVENUE') {
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'WERBEAGENTUR_CLEANUP_CAMPAIGNS') {
      RT.bus.emit('resource:changed', { key: 'workers', state: state.resources });
      RT.bus.emit('campaigns:changed', {});
    }
  }

  RT.state = {
    get: get,
    dispatch: dispatch,
    subscribe: subscribe
  };
})(window.RT);
