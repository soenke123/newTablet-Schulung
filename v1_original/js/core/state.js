/* Zentraler Spielstand.
   Mutationen NUR via dispatch(action, payload). Reducer-Schema, damit später
   Replay/Undo/Save-Slot trivial nachrüstbar ist. */
(function (RT) {
  'use strict';

  // ── Serverfarm-Hilfsfunktionen ────────────────────────────────────────────
  function sfCap(sl, et) {
    if (sl >= 2) return ([50000, 300000, 800000, 2000000, 10000000, 100000000][et + 2] || 800000);
    if (sl >= 1 && et >= 1) return 300000;
    return 50000;
  }
  function sfMinTier(sl) { return sl >= 2 ? -2 : 0; }
  function sfMaxTier(sl) { return sl >= 2 ? 3 : sl >= 1 ? 1 : 0; }

  function makeInitialState() {
    return {
      phase: 'garage',            // 'garage' | 'campus' | 'expansion' | 'end'
      month: 0,
      goLiveUnlocked: false,      // true nach dem ersten "Plattform online stellen"-Modal
      pendingPlacement: null,     // string | null — Gebäude-Typ der gerade platziert wird
      teamStufe: 0,               // Index in RT.team.STAGES (0 = Solo, 6 = Studio)
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
        // workers wird aus teamStufe abgeleitet (RT.team.getSlotCapacity).
        // occupied bleibt als Live-Zähler der aktuell belegten Slots.
        workers: { occupied: 0, max: 0, capacity: 0 }
      },
      buildings: [],              // gefüllt in Phase A
      research: {},               // gefüllt in Phase A
      purchases: {},              // { itemId: true } — Shop-Käufe
      techtree: {},               // { nodeId: 'done' | { status, startMonth } }
      campaigns: [],
      pendingCelebrations: [],    // nodeIds die fertig sind aber noch gefeiert werden müssen
      userGrowthRate: 0,          // monatl. Wachstumsfaktor (0.15 = +15%/Monat) — durch Marketing-Nodes
      reputation: 0.02,           // 0,02 … 0,06; Mundpropaganda: monatl. User-Wachstum in %. Startet in Phase 2.
      marketExpansions: { eu: false, americas: false, asia: false },
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
      metadatenActive: false,
      metadatenPendingActivation: false,
      metadatenWorkSlot: 0,
      watchtime: 0,               // Stunden/Tag — wird bei Metadaten-Aktivierung gesetzt; davor verborgen
      supportProgram: {
        active: false,
        tier: 0,
        workers: 0,
        costPerMonth: 30000,
        buildingGridSlot: -1,
        workSlotIndex: -1
      },
      ccState: {
        donationCooldownUntil: 0,
        imageCooldownUntil:    0,
        imageCampaignActive:   false
      },
      meta: { gameStarted: false, gameEnded: false, seenTabMarketing: false, seenTabWerbung: false, seenWatchtimeInfo: false },
      expansionStartMonth: null,
      werbekriseActive:    false,
      storyLog:            [],
      isBankrupt:    false,
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
          var aCap    = state.resources.serverCapacity      || 0;
          var aUsed   = (state.resources.serverUsage        || 0)
                      + (state.resources.serverSoftwareUsage || 0);
          var perUser = state.metadatenActive ? 2 : 1;
          addDelta = Math.min(addDelta, Math.max(0, Math.floor((aCap - aUsed) / perUser)));
        }
        state.resources[payload.key] = (state.resources[payload.key] || 0) + addDelta;
        if (payload.key === 'users') {
          var usageDelta = state.metadatenActive ? addDelta * 2 : addDelta;
          state.resources.serverUsage = (state.resources.serverUsage || 0) + usageDelta;
        }
        if (payload.key === 'money' && addDelta !== 0) {
          state.transactions.push({ month: state.month, delta: addDelta, label: payload.label || '' });
        }
        return;
      }

      case 'SET_WORKERS':
        // Verschachtelte Workers separat – { occupied: 1, max: 1, capacity: 4 }.
        // Legacy-Action: capacity wird jetzt aus teamStufe abgeleitet, max spiegelt capacity.
        if (payload.occupied != null) state.resources.workers.occupied = payload.occupied;
        if (payload.max      != null) state.resources.workers.max      = payload.max;
        if (payload.capacity != null) state.resources.workers.capacity = payload.capacity;
        return;

      case 'TEAM_UPGRADE': {
        var teamMax = (RT.team && RT.team.maxIndex()) || 6;
        var teamCur = typeof state.teamStufe === 'number' ? state.teamStufe : 0;
        if (teamCur >= teamMax) return;
        var teamNextStage = RT.team.getStage(teamCur + 1);
        var teamUpCost    = teamNextStage.upgradeCost || 0;
        if ((state.resources.money || 0) < teamUpCost) return;
        state.resources.money = (state.resources.money || 0) - teamUpCost;
        if (teamUpCost > 0) {
          state.transactions.push({ month: state.month, delta: -teamUpCost, label: 'Team-Upgrade: ' + teamNextStage.name });
        }
        state.teamStufe = teamCur + 1;
        // workers-Kapazität sofort spiegeln (backward-compat für alte Konsumenten)
        var upCap = RT.team.getSlotCapacity(state.teamStufe);
        state.resources.workers.capacity = upCap;
        state.resources.workers.max      = upCap;
        return;
      }

      case 'TEAM_SET_STAGE': {
        var tsMax = (RT.team && RT.team.maxIndex()) || 6;
        var tsIdx = Math.max(0, Math.min(tsMax, payload.stage || 0));
        state.teamStufe = tsIdx;
        var tsCap = RT.team.getSlotCapacity(tsIdx);
        state.resources.workers.capacity = tsCap;
        state.resources.workers.max      = tsCap;
        return;
      }

      case 'GAME_STARTED': {
        state.meta.gameStarted = true;
        // Slot-Kapazität sofort aus Team-Stufe herleiten, damit erste Slot verfügbar.
        var gsIdx = typeof state.teamStufe === 'number' ? state.teamStufe : 0;
        var gsCap = RT.team ? RT.team.getSlotCapacity(gsIdx) : 1;
        state.resources.workers.capacity = gsCap;
        state.resources.workers.max      = gsCap;
        return;
      }

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
        if (state.supportProgram && state.supportProgram.active) recalcOcc += state.supportProgram.workers || 0;
        state.resources.workers.occupied = recalcOcc;
        return;
      }

      case 'START_SUPPORT_PROGRAM':
        state.supportProgram = {
          active:           true,
          tier:             payload.tier             || 0,
          workers:          payload.workers          || 1,
          costPerMonth:     payload.costPerMonth     || 40000,
          buildingGridSlot: payload.buildingGridSlot !== undefined ? payload.buildingGridSlot : 0,
          workSlotIndex:    payload.workSlotIndex    !== undefined ? payload.workSlotIndex    : 0
        };
        state.resources.workers.occupied = (state.resources.workers.occupied || 0) + (payload.workers || 1);
        return;

      case 'STOP_SUPPORT_PROGRAM': {
        var spW   = (state.supportProgram && state.supportProgram.workers)          || 0;
        var spBgs = (state.supportProgram && state.supportProgram.buildingGridSlot) !== undefined
                  ? state.supportProgram.buildingGridSlot : -1;
        var spWsi = (state.supportProgram && state.supportProgram.workSlotIndex)    || 0;
        if (state.supportProgram) {
          state.supportProgram.active           = false;
          state.supportProgram.buildingGridSlot = -1;
          state.supportProgram.workSlotIndex    = -1;
          state.supportProgram.workers          = 0;
        }
        if (payload && payload.addRestart) {
          state.pendingCelebrations.push({
            kind:             'support_restart',
            newTier:          payload.newTier || 0,
            buildingGridSlot: spBgs,
            workSlotIndex:    spWsi,
            workers:          spW
          });
        } else {
          state.resources.workers.occupied = Math.max(0, (state.resources.workers.occupied || 0) - spW);
        }
        return;
      }

      case 'CLEAR_SUPPORT_RESTART': {
        for (var csi = state.pendingCelebrations.length - 1; csi >= 0; csi--) {
          if (typeof state.pendingCelebrations[csi] === 'object'
              && state.pendingCelebrations[csi].kind === 'support_restart') {
            state.pendingCelebrations.splice(csi, 1);
            break;
          }
        }
        var occ2 = 0;
        for (var nidX in state.techtree) {
          if (!Object.prototype.hasOwnProperty.call(state.techtree, nidX)) continue;
          var eX = state.techtree[nidX];
          if (eX && typeof eX === 'object' && eX.status === 'in_progress') occ2 += eX.workers || 0;
        }
        for (var pciX = 0; pciX < state.pendingCelebrations.length; pciX++) {
          var pcX = state.pendingCelebrations[pciX];
          if (typeof pcX === 'object' && pcX.kind !== 'campaign') occ2 += pcX.workers || 0;
        }
        for (var cX = 0; cX < (state.campaigns || []).length; cX++) {
          if (state.campaigns[cX].phase === 'running') occ2 += state.campaigns[cX].workers || 0;
        }
        occ2 += (state.werbeagentur && state.werbeagentur.workers) || 0;
        if (state.supportProgram && state.supportProgram.active) occ2 += state.supportProgram.workers || 0;
        state.resources.workers.occupied = occ2;
        return;
      }

      case 'ADD_GROWTH_RATE':
        state.userGrowthRate = (state.userGrowthRate || 0) + payload.delta;
        return;

      case 'SET_GROWTH_RATE':
        state.userGrowthRate = payload.value;
        return;

      case 'ADD_REPUTATION': {
        var cur = typeof state.reputation === 'number' ? state.reputation : 0.002;
        var repDelta = payload.delta || 0;
        if (repDelta < 0 && state.ccState && state.ccState.imageCampaignActive) {
          repDelta = 0;
        }
        state.reputation = Math.max(-0.20, Math.min(0.06, cur + repDelta));
        return;
      }

      case 'SET_REPUTATION':
        state.reputation = Math.max(-0.20, Math.min(0.06, payload.value));
        return;

      case 'UNLOCK_MARKET':
        if (state.marketExpansions && payload.market) {
          state.marketExpansions[payload.market] = true;
        }
        return;

      case 'SET_GOLIVE_UNLOCKED':
        state.goLiveUnlocked = true;
        return;

      case 'MARCUS_DEAL_ACCEPT':
        state.marcusDealAccepted = true;
        return;

      case 'ACTIVATE_METADATEN':
        state.metadatenActive = true;
        state.metadatenPendingActivation = false;
        state.metadatenWorkSlot = 0;
        state.werbekriseActive = false;
        state.resources.serverUsage = (state.resources.serverUsage || 0) * 2;
        return;

      case 'SET_METADATEN_PENDING':
        state.metadatenPendingActivation = true;
        state.metadatenWorkSlot = payload && payload.slot !== undefined ? payload.slot : 0;
        return;

      case 'MARK_WATCHTIME_INFO_SEEN':
        state.meta.seenWatchtimeInfo = true;
        return;

      case 'ADD_WATCHTIME':
        // Statische Erhöhung durch Feature-Node: { delta: 0.8 }
        state.watchtime = Math.max(0, (state.watchtime || 0.3) + (payload.delta || 0));
        return;

      case 'SET_WATCHTIME':
        // Direkt setzen (Initialisierung bei Metadaten-Aktivierung oder dynamische Updates): { value: 1.8 }
        state.watchtime = Math.max(0, payload.value || 0);
        return;

      case 'SET_PENDING_PLACEMENT':
        // payload: { type: 'buero' } | { type: null }
        state.pendingPlacement = payload.type || null;
        return;

      case 'PLACE_BUILDING':
        // payload: { type: 'buero', slot: 3 }
        var newBldg = { type: payload.type, slot: payload.slot, level: 0 };
        if (payload.type === 'serverfarm') { newBldg.structLevel = 0; newBldg.expansionTier = 0; }
        state.buildings.push(newBldg);
        state.pendingPlacement = null;
        if (payload.type === 'serverfarm') {
          state.resources.serverCapacity = (state.resources.serverCapacity || 0) + 50000;
        }
        if (payload.type === 'buero') {
          state.resources.workers.capacity = (state.resources.workers.capacity || 0) + 2;
        }
        return;

      case 'UPGRADE_SERVERFARM': {
        // payload: { slot } — 30.000 €, structLevel 0→1, Kapazität bleibt 50k
        for (var ufi = 0; ufi < state.buildings.length; ufi++) {
          var uf = state.buildings[ufi];
          if (uf.slot === payload.slot && uf.type === 'serverfarm') {
            if ((uf.structLevel || 0) >= 1) return;
            if ((state.resources.money || 0) < 30000) return;
            state.resources.money -= 30000;
            state.transactions.push({ month: state.month, delta: -30000, label: 'Server-Upgrade Stufe 1' });
            uf.structLevel = 1;
            uf.level       = 1;
            return;
          }
        }
        return;
      }

      case 'UPGRADE_SERVERFARM_L2': {
        // payload: { slot } — 70.000 €, structLevel 1→2, Kapazität sofort auf 800k, 5k€/Mon
        for (var uf2i = 0; uf2i < state.buildings.length; uf2i++) {
          var uf2 = state.buildings[uf2i];
          if (uf2.slot === payload.slot && uf2.type === 'serverfarm') {
            if ((uf2.structLevel || 0) !== 1) return;
            if (state.phase !== 'expansion') return;
            if ((state.resources.money || 0) < 70000) return;
            var oldCap = sfCap(uf2.structLevel || 0, uf2.expansionTier || 0);
            state.resources.money -= 70000;
            state.transactions.push({ month: state.month, delta: -70000, label: 'Server-Upgrade Stufe 3' });
            uf2.structLevel   = 2;
            uf2.level         = 2;
            uf2.expansionTier = 0;
            state.resources.serverCapacity = (state.resources.serverCapacity || 0) - oldCap + 800000;
            return;
          }
        }
        return;
      }

      case 'ADJUST_SERVERFARM_TIER': {
        // payload: { slot, delta: +1|-1 } — +/- Kapazitätsstufe, monatl. Kosten passen sich an
        for (var ati = 0; ati < state.buildings.length; ati++) {
          var atb = state.buildings[ati];
          if (atb.slot === payload.slot && atb.type === 'serverfarm') {
            var atSL  = atb.structLevel   || 0;
            var atET  = atb.expansionTier || 0;
            var atNew = atET + (payload.delta || 0);
            if (atNew < sfMinTier(atSL) || atNew > sfMaxTier(atSL)) return;
            var oldCap3 = sfCap(atSL, atET);
            atb.expansionTier = atNew;
            var newCap3 = sfCap(atSL, atNew);
            state.resources.serverCapacity = (state.resources.serverCapacity || 0) + (newCap3 - oldCap3);
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
          // Slot-Kapazität kommt ab v3 nur noch aus teamStufe (Solo=1, Duo=2, …).
          var teamStufeR = typeof state.teamStufe === 'number' ? state.teamStufe : 0;
          var recalcCap  = (RT.team ? RT.team.getSlotCapacity(teamStufeR) : Math.max(1, teamStufeR + 1));
          var recalcServerCap = inMainPhase ? 10000 : 3000;
          for (var bi = 0; bi < (state.buildings || []).length; bi++) {
            var bldgR = state.buildings[bi];
            if (bldgR.type === 'serverfarm') {
              // Migration alter Saves (upgraded/workerAssigned → structLevel/expansionTier)
              if (bldgR.structLevel == null) {
                bldgR.structLevel   = bldgR.upgraded ? 1 : 0;
                bldgR.expansionTier = (bldgR.upgraded && bldgR.workerAssigned) ? 1 : 0;
              }
              recalcServerCap += sfCap(bldgR.structLevel, bldgR.expansionTier);
            }
          }
          state.resources.workers.capacity = recalcCap;
          state.resources.workers.max      = recalcCap;
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
          state.resources.workers.occupied = recalcOccR;
        }
        // Recalculate imageCampaignActive from saved campaigns.
        if (!state.ccState) state.ccState = { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false };
        state.ccState.imageCampaignActive = false;
        for (var imgI = 0; imgI < (state.campaigns || []).length; imgI++) {
          if (state.campaigns[imgI].type === 'image_kampagne' && state.campaigns[imgI].phase === 'running') {
            state.ccState.imageCampaignActive = true;
            break;
          }
        }
        return;
      }

      case 'DECLARE_BANKRUPTCY':
        state.isBankrupt = true;
        return;

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

      case 'START_DONATION': {
        var donAmt = payload.amount || 0;
        var donRuf = payload.repDelta || 0;
        if (donAmt > 0) {
          state.resources.money = Math.max(0, (state.resources.money || 0) - donAmt);
          state.transactions.push({ month: state.month, delta: -donAmt, label: 'Spendenaktion' });
        }
        if (donRuf !== 0) {
          var donCur = typeof state.reputation === 'number' ? state.reputation : 0.002;
          state.reputation = Math.max(-0.20, Math.min(0.06, donCur + donRuf));
        }
        if (!state.ccState) state.ccState = { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false };
        state.ccState.donationCooldownUntil = state.month + 12;
        return;
      }

      case 'IMAGE_CAMPAIGN_ACTIVATE':
        if (!state.ccState) state.ccState = { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false };
        state.ccState.imageCampaignActive = true;
        return;

      case 'IMAGE_CAMPAIGN_DEACTIVATE':
        if (!state.ccState) state.ccState = { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false };
        state.ccState.imageCampaignActive = false;
        state.ccState.imageCooldownUntil  = payload.cooldownUntil || 0;
        return;

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

      case 'SET_EXPANSION_START_MONTH':
        state.expansionStartMonth = payload.month != null ? payload.month : null;
        return;

      case 'WERBEKRISE_ACTIVATE':
        state.werbekriseActive = true;
        return;

      case 'ADD_STORY_LOG': {
        if (!state.storyLog) state.storyLog = [];
        for (var slI = 0; slI < state.storyLog.length; slI++) {
          if (state.storyLog[slI].id === payload.id) return;
        }
        state.storyLog.push({ id: payload.id, title: payload.title, body: payload.body, month: payload.month });
        return;
      }

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
    if (action === 'TEAM_UPGRADE' || action === 'TEAM_SET_STAGE') {
      RT.bus.emit('team:changed',       { stufe: state.teamStufe });
      RT.bus.emit('resource:changed',   { key: 'money',   state: state.resources });
      RT.bus.emit('resource:changed',   { key: 'workers', state: state.resources });
      RT.bus.emit('campus:grid-changed', {});
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
    if (action === 'START_DONATION') {
      RT.bus.emit('resource:changed',   { key: 'money',      state: state.resources });
      RT.bus.emit('reputation:changed', { reputation: state.reputation });
    }
    if (action === 'UNLOCK_MARKET') {
      RT.bus.emit('market:changed', { market: payload.market });
    }
    if (action === 'MARCUS_DEAL_ACCEPT') {
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'ACTIVATE_METADATEN') {
      RT.bus.emit('resource:changed', { key: 'serverUsage', state: state.resources });
    }
    if (action === 'ADD_WATCHTIME' || action === 'SET_WATCHTIME') {
      RT.bus.emit('watchtime:changed', { watchtime: state.watchtime });
    }
    if (action === 'SET_PENDING_PLACEMENT' || action === 'PLACE_BUILDING') {
      RT.bus.emit('campus:grid-changed', {});
    }
    if (action === 'PLACE_BUILDING') {
      RT.bus.emit('resource:changed', { key: 'workers',        state: state.resources });
      RT.bus.emit('resource:changed', { key: 'serverCapacity', state: state.resources });
    }
    if (action === 'UPGRADE_SERVERFARM' || action === 'UPGRADE_SERVERFARM_L2' || action === 'ADJUST_SERVERFARM_TIER') {
      RT.bus.emit('resource:changed', { key: 'money',          state: state.resources });
      RT.bus.emit('resource:changed', { key: 'serverCapacity', state: state.resources });
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
    if (action === 'WERBEKRISE_ACTIVATE') {
      RT.bus.emit('werbekrise:activated', {});
    }
    if (action === 'ADD_STORY_LOG') {
      RT.bus.emit('storylog:changed', {});
    }
  }

  RT.state = {
    get: get,
    dispatch: dispatch,
    subscribe: subscribe
  };
})(window.RT);
