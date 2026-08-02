/* Loop + Actions — arbeiten pro Instanz (mehrere Farmen/Werbe/Marketing möglich).
   Actions nehmen instanceId; placeBuilding erzeugt neue Instanz. */
(function (RT) {
  'use strict';

  var INVESTOR_USER_THRESHOLD = 1000;
  var FLYER_TICK_MS  = 8000;
  var FLYER_MULT     = 1.10;

  // Die Werbe-Formeln liegen in state.js (adMoneyPerCycle / adTrendMalus) —
  // Loop und UI rechnen beide darüber, damit es keine Duplikate gibt.

  // Id des Trend-Modifikators einer Werbeagentur. Pro Instanz einer, damit
  // das Trend-Info-Modal jede Agentur einzeln auflistet.
  function adTrendModId(instanceId) { return 'werbe:' + instanceId; }

  // --- Tick ---
  function tick(payload) {
    var dt = payload.dt / 1000;
    var s  = RT.state.current;
    var phase = RT.state.currentPhase();

    // 1) Serverfarm — Watchtime-Produktion erst ab Phase 2.
    // In Phase 0/1 gibt es keine Sanduhr-Ökonomie.
    if (phase >= 2) {
      var cap = RT.state.WATCHTIME_STACK_MAX;
      var farms = RT.state.instancesByType('farm');
      for (var i = 0; i < farms.length; i++) {
        var fs = farms[i].state;
        var usersInThisFarm = RT.state.usersInFarm(farms[i]);
        if (usersInThisFarm <= 0) {
          fs.cycleTime = 0;
          continue;
        }
        if (fs.stacks < cap) {
          fs.cycleTime += dt;
          while (fs.cycleTime >= RT.state.WATCHTIME_CYCLE_SEC && fs.stacks < cap) {
            fs.cycleTime -= RT.state.WATCHTIME_CYCLE_SEC;
            fs.stacks   += 1;
          }
          if (fs.stacks >= cap) fs.cycleTime = 0;
        }
      }

      // 2) Werbeagenturen — laufende Werbedeals abarbeiten.
      tickAdAgencies(s, dt);

      // 2b) Trend — positiv stapeln, negativ abfließen lassen.
      tickTrend(s, dt);
    }

    // 3) Marketing-Kampagnen (in allen Phasen aktiv, sofern Marketing-Center gebaut).
    var mks = RT.state.instancesByType('marketing');
    for (var k = 0; k < mks.length; k++) {
      var mkS = mks[k].state;
      if (mkS.active) {
        var elapsed = (Date.now() - mkS.active.startAt) / 1000;
        if (elapsed >= mkS.active.duration) {
          var camp = RT.state.campaignById(mkS.active.campaignId);
          if (camp) mkS.ready += camp.users;
          mkS.active = null;
        }
      }
    }

    // 3b) Techtree — Zeit läuft ab → Node wechselt in 'ready' (nicht auto 'done')
    var tt = s.techtree || {};
    var nodes = (RT.techtree && RT.techtree.NODES) || {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (!entry || entry.status !== 'in_progress') continue;
      var def = nodes[nid];
      if (!def) continue;
      if (Date.now() - entry.startAt >= def.durationSec * 1000) {
        entry.status = 'ready';
        entry.readyAt = Date.now();
        RT.bus.emit('techtree:ready', { nodeId: nid });
        RT.bus.emit('state:changed');
      }
    }

    // 4) Flyerbonus — alle 8 s User × 1,10 (Zinseszins).
    // Aktiv solange mk_flyer 'done' UND users < 1000 UND Phase < 2.
    var now = Date.now();
    if (RT.state.flyerBonusActive()) {
      if (!s.lastFlyerTick) s.lastFlyerTick = now;
      if (now - s.lastFlyerTick >= FLYER_TICK_MS) {
        s.lastFlyerTick = now;
        var before = s.users || 0;
        var after  = Math.floor(before * FLYER_MULT);
        if (after <= before) after = before + 1; // Fortschritt bei sehr kleinen Zahlen
        s.users = after;
        maybeTriggerInvestor();
        RT.bus.emit('state:changed');
      }
    } else {
      // Zurücksetzen, damit der Timer beim nächsten Aktivieren frisch startet.
      s.lastFlyerTick = 0;
    }
  }

  // Trend-Tick.
  //   Trend > 0: stapelt bis TREND_STACK_MAX Zyklen und wartet dann auf den
  //              Klick — die Stapel sind das, was der Spieler erntet.
  //   Trend < 0: stapelt NICHT, sondern lässt User kontinuierlich abfließen.
  //              Der Klick hat dort die andere Bedeutung "Schadensbegrenzung"
  //              und halbiert den Abfluss (siehe actions.trendShield).
  //   Trend = 0: nichts passiert, gebunkerte Stapel bleiben liegen.
  function tickTrend(s, dt) {
    RT.state.pruneTrendMods();
    var trend = RT.state.trendValue();
    var max   = RT.state.TREND_STACK_MAX;

    if (trend > 0) {
      s.trendDrainAcc = 0;
      if (s.trendStacks < max) {
        s.trendCycleTime += dt;
        while (s.trendCycleTime >= RT.state.TREND_CYCLE_SEC && s.trendStacks < max) {
          s.trendCycleTime -= RT.state.TREND_CYCLE_SEC;
          s.trendStacks    += 1;
        }
        if (s.trendStacks >= max) s.trendCycleTime = 0;
      }
      return;
    }

    if (trend < 0) {
      s.trendCycleTime = 0;
      var shield = RT.state.trendShieldActive() ? 0.5 : 1;
      s.trendDrainAcc += s.users * (-trend / 100) * (dt / RT.state.TREND_CYCLE_SEC) * shield;
      if (s.trendDrainAcc >= 1) {
        var lost = Math.min(Math.floor(s.trendDrainAcc), s.users);
        s.trendDrainAcc -= Math.floor(s.trendDrainAcc);
        if (lost > 0) {
          s.users -= lost;
          RT.bus.emit('trend:lost', { amount: lost });
        }
      }
      return;
    }

    s.trendDrainAcc = 0;
  }

  // --- Werbeagenturen ---
  // Ein Deal läuft AD_CYCLES_MAX Zyklen und ist dann vorbei. Jeder Zyklus wird
  // VORAB mit Watchtime bezahlt; reicht sie nicht, bricht der Deal ab — bereits
  // erwirtschaftetes Geld bleibt liegen. Der Trend-Malus liegt nur an, solange
  // der Deal produziert; eine idle Agentur kostet nichts.
  function tickAdAgencies(s, dt) {
    var werben = RT.state.instancesByType('werbe');
    for (var j = 0; j < werben.length; j++) {
      var inst  = werben[j];
      var ws    = inst.state;
      var modId = adTrendModId(inst.instanceId);

      if (!ws.deal) { RT.state.removeTrendMod(modId); continue; }

      var type = RT.state.adTypeById(ws.deal.typeId);
      if (!type) { // unbekannte Werbeart (z. B. alter Stand) — sauber aufräumen
        ws.deal = null;
        RT.state.removeTrendMod(modId);
        continue;
      }

      // 1) Schon durch? Zuerst prüfen, sonst würde für einen 6. Zyklus gezahlt.
      //    Greift vor allem für Stände, die fertig aus dem Speicher kommen.
      if (ws.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) {
        finishDeal(inst, type);
        continue;
      }

      // 2) Watchtime für den laufenden Zyklus vorab abbuchen.
      if (!ws.deal.charged) {
        if (s.watchtime >= type.watchtime) {
          s.watchtime    -= type.watchtime;
          ws.deal.charged = true;
        } else {
          ws.deal = null;
          RT.state.removeTrendMod(modId);
          RT.bus.emit('toast', 'Watchtime leer — ' + type.name + '-Deal abgebrochen');
          RT.bus.emit('state:changed');
          continue;
        }
      }

      // 3) Zyklus ticken.
      ws.deal.cycleTime += dt;
      if (ws.deal.cycleTime >= type.duration) {
        ws.deal.cycleTime  -= type.duration;
        ws.deal.cyclesDone += 1;
        ws.deal.charged     = false;
        ws.moneyReady      += RT.state.adMoneyPerCycle(type.id, ws.deal.intensity);
        if (ws.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) {
          finishDeal(inst, type);
          continue;
        }
      }

      // 4) Trend-Malus — eigener Modifikator je Agentur, damit das Trend-Modal
      //    jede einzeln auflistet.
      RT.state.setTrendMod(
        modId,
        type.name + ' (' + Math.round(ws.deal.intensity * 100) + ' %)',
        -RT.state.adTrendMalus(type.id, ws.deal.intensity)
      );
    }
  }

  function finishDeal(inst, type) {
    inst.state.deal = null;
    RT.state.removeTrendMod(adTrendModId(inst.instanceId));
    RT.bus.emit('ad:finished', { instanceId: inst.instanceId, typeId: type ? type.id : null });
    RT.bus.emit('state:changed');
  }

  // Offline-Aufholpass: spult Watchtime- und Trend-Stapel um die Abwesenheit
  // vor — aber höchstens um die jeweilige Stapel-Obergrenze. Dieselbe Regel
  // gilt in beide Richtungen: auch negativer Trend kostet maximal 5 Zyklen,
  // sonst kommt man nach einer Nacht auf null User zurück.
  function offlineCatchUp(elapsedMs) {
    var s = RT.state.current;
    if (!(elapsedMs > 1000))            return null;
    if (RT.state.currentPhase() < 2)    return null;

    var elapsedSec = elapsedMs / 1000;
    var report = { seconds: Math.floor(elapsedSec), watchtime: 0, trendStacks: 0,
                   usersLost: 0, adMoney: 0 };

    var wtCycles = Math.floor(elapsedSec / RT.state.WATCHTIME_CYCLE_SEC);
    if (wtCycles > 0) {
      var farms = RT.state.instancesByType('farm');
      for (var i = 0; i < farms.length; i++) {
        var fs = farms[i].state;
        if (RT.state.usersInFarm(farms[i]) <= 0) continue;
        var before = fs.stacks;
        fs.stacks    = Math.min(RT.state.WATCHTIME_STACK_MAX, fs.stacks + wtCycles);
        fs.cycleTime = 0;
        report.watchtime += fs.stacks - before;
      }
    }

    // Laufende Werbedeals nachziehen — höchstens bis zum Deal-Ende. Jeder
    // simulierte Zyklus wird wie im Live-Betrieb vorab mit Watchtime bezahlt;
    // reicht sie nicht, bricht der Deal genauso ab. Offline erntet niemand die
    // Farmen ab, es steht also nur das gespeicherte Lager zur Verfügung.
    var werben = RT.state.instancesByType('werbe');
    for (var w = 0; w < werben.length; w++) {
      var wInst = werben[w];
      var wSt   = wInst.state;
      if (!wSt.deal) continue;
      var adType = RT.state.adTypeById(wSt.deal.typeId);
      if (!adType) { wSt.deal = null; RT.state.removeTrendMod(adTrendModId(wInst.instanceId)); continue; }

      var budget = elapsedSec + (wSt.deal.cycleTime || 0);
      while (wSt.deal && budget >= adType.duration &&
             wSt.deal.cyclesDone < RT.state.AD_CYCLES_MAX) {
        if (!wSt.deal.charged) {
          if (s.watchtime < adType.watchtime) { wSt.deal = null; break; }
          s.watchtime     -= adType.watchtime;
          wSt.deal.charged = true;
        }
        budget              -= adType.duration;
        wSt.deal.cyclesDone += 1;
        wSt.deal.charged     = false;
        var earned = RT.state.adMoneyPerCycle(adType.id, wSt.deal.intensity);
        wSt.moneyReady  += earned;
        report.adMoney  += earned;
      }
      if (wSt.deal) {
        if (wSt.deal.cyclesDone >= RT.state.AD_CYCLES_MAX) wSt.deal = null;
        else wSt.deal.cycleTime = budget;
      }
      if (!wSt.deal) RT.state.removeTrendMod(adTrendModId(wInst.instanceId));
    }

    var trend   = RT.state.trendValue();
    var tCycles = Math.min(RT.state.TREND_STACK_MAX,
                           Math.floor(elapsedSec / RT.state.TREND_CYCLE_SEC));
    if (tCycles > 0 && trend > 0) {
      var stBefore = s.trendStacks || 0;
      s.trendStacks    = Math.min(RT.state.TREND_STACK_MAX, stBefore + tCycles);
      s.trendCycleTime = 0;
      report.trendStacks = s.trendStacks - stBefore;
    } else if (tCycles > 0 && trend < 0) {
      var drop = Math.min(Math.floor(s.users * (-trend / 100) * tCycles), s.users);
      if (drop > 0) {
        s.users -= drop;
        report.usersLost = drop;
      }
    }
    s.trendDrainAcc = 0;

    RT.bus.emit('state:changed');
    return report;
  }

  // Investor-Meilenstein: einmalig bei ≥ INVESTOR_USER_THRESHOLD Usern.
  // UI hört auf 'investor:trigger' und öffnet das Modal.
  function maybeTriggerInvestor() {
    var s = RT.state.current;
    if (s.investorTriggered) return;
    if ((s.users || 0) < INVESTOR_USER_THRESHOLD) return;
    s.investorTriggered = true;
    RT.bus.emit('investor:trigger');
    RT.bus.emit('state:changed');
  }

  // --- Actions ---
  RT.actions = {
    harvestFarm: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return 0;
      var fs = inst.state;
      if (fs.stacks <= 0) return 0;
      var users = RT.state.usersInFarm(inst);
      var total = fs.stacks * users * RT.state.WATCHTIME_PER_USER_PER_CYCLE;
      s.watchtime += total;
      fs.stacks    = 0;
      fs.cycleTime = 0;
      RT.bus.emit('effect', { where: instanceId, icon: '⏳', text: '+' + total });
      RT.bus.emit('state:changed');
      return total;
    },

    // Gebunkerte Trend-Stapel einlösen — die User strömen zu.
    // Nur bei positivem Trend; bei negativem übernimmt trendShield().
    collectTrend: function () {
      var s = RT.state.current;
      if (RT.state.trendValue() <= 0)  return { ok: false, msg: 'Trend ist nicht positiv' };
      if ((s.trendStacks || 0) <= 0)   return { ok: false, msg: 'Noch nichts angesammelt' };

      var want = RT.state.trendUsersReady();
      var free = RT.state.freeUserCapacity();
      if (free <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return { ok: false, msg: 'Serverkapazität voll' };
      }
      var add = Math.min(want, free);
      s.users         += add;
      s.trendStacks    = 0;
      s.trendCycleTime = 0;
      if (add < want) {
        RT.bus.emit('toast', 'Serverkapazität voll — ' + (want - add) + ' User passten nicht mehr rein');
      }
      maybeTriggerInvestor();
      RT.bus.emit('trend:collected', { amount: add });
      RT.bus.emit('state:changed');
      return { ok: true, amount: add };
    },

    // Schadensbegrenzung bei negativem Trend: halbiert den Abfluss für
    // TREND_SHIELD_SEC, danach Cooldown bis TREND_SHIELD_CD_SEC.
    trendShield: function () {
      var s = RT.state.current;
      if (RT.state.trendValue() >= 0)   return { ok: false, msg: 'Gerade kein Schaden abzuwenden' };
      if (!RT.state.trendShieldReady()) return { ok: false, msg: 'Noch im Cooldown' };
      var now = Date.now();
      s.trendShieldUntil   = now + RT.state.TREND_SHIELD_SEC * 1000;
      s.trendShieldReadyAt = now + RT.state.TREND_SHIELD_CD_SEC * 1000;
      RT.bus.emit('trend:shield');
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Wird beim Laden aus main.js aufgerufen.
    offlineCatchUp: offlineCatchUp,

    collectWerbeMoney: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe') return 0;
      var ws = inst.state;
      var amount = Math.floor(ws.moneyReady);
      if (amount <= 0) return 0;
      s.money       += amount;
      ws.moneyReady -= amount;
      RT.bus.emit('effect', { where: instanceId, icon: '💰', text: '+' + amount + '€' });
      RT.bus.emit('state:changed');
      return amount;
    },

    // Neuen Werbedeal buchen. Der erste Zyklus wird sofort bezahlt — damit
    // kann kein Deal ohne Watchtime-Deckung gestartet werden.
    bookAdDeal: function (instanceId, typeId, intensity) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe') return { ok: false, msg: 'Keine Werbeagentur' };
      var ws = inst.state;
      if (ws.deal)                       return { ok: false, msg: 'Es läuft schon ein Deal' };
      var type = RT.state.adTypeById(typeId);
      if (!type)                         return { ok: false, msg: 'Unbekannte Werbeart' };
      if (s.watchtime < type.watchtime)  return { ok: false, msg: 'Zu wenig Watchtime' };

      var i = RT.state.clampAdIntensity(intensity);
      s.watchtime -= type.watchtime;
      ws.deal = {
        typeId:     type.id,
        intensity:  i,
        cyclesDone: 0,
        cycleTime:  0,
        charged:    true    // erster Zyklus ist bezahlt
      };
      ws.lastDeal = { typeId: type.id, intensity: i };
      RT.state.setTrendMod(
        adTrendModId(instanceId),
        type.name + ' (' + Math.round(i * 100) + ' %)',
        -RT.state.adTrendMalus(type.id, i)
      );
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Laufenden Deal abbrechen. Bereits erwirtschaftetes Geld bleibt liegen,
    // die Watchtime des angefangenen Zyklus ist verloren.
    cancelAdDeal: function (instanceId) {
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe' || !inst.state.deal) return false;
      inst.state.deal = null;
      RT.state.removeTrendMod(adTrendModId(instanceId));
      RT.bus.emit('state:changed');
      return true;
    },

    upgradeFarm: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'farm') return false;
      var fs = inst.state;
      var next = RT.state.nextTier(fs.tierId);
      if (!next) return false;
      var cost = RT.state.TIER_UPGRADE_COST[fs.tierId];
      if (s.money < cost) return false;
      s.money  -= cost;
      fs.tierId = next.id;
      var stufe = RT.state.tierStufe(next.id);
      RT.bus.emit('effect', { where: instanceId, icon: '⬆️', text: 'Stufe ' + stufe });
      RT.bus.emit('state:changed');
      return true;
    },

    startCampaign: function (instanceId, campaignId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'marketing') return false;
      var mkS = inst.state;
      if (mkS.active) return false;
      var camp = RT.state.campaignById(campaignId);
      if (!camp) return false;
      if (s.money < camp.cost) return false;
      s.money -= camp.cost;
      mkS.active = {
        campaignId: campaignId,
        startAt:    Date.now(),
        duration:   camp.duration
      };
      RT.bus.emit('state:changed');
      return true;
    },

    collectMarketingUsers: function (instanceId) {
      var s = RT.state.current;
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'marketing') return 0;
      var mkS = inst.state;
      if (mkS.ready <= 0) return 0;
      var cap  = RT.state.serverCapacityTotal();
      var prog = RT.state.programmCapacity();
      var free = Math.max(0, cap - s.users - prog);
      var add  = Math.min(mkS.ready, free);
      if (add <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return 0;
      }
      s.users   += add;
      mkS.ready -= add;
      RT.bus.emit('effect', { where: instanceId, icon: '👥', text: '+' + add });
      maybeTriggerInvestor();
      RT.bus.emit('state:changed');
      return add;
    },

    placeBuilding: function (typeId, col, row) {
      var s = RT.state.current;
      var type = RT.state.BUILDING_TYPES[typeId];
      if (!type)                                return { ok: false, msg: 'Unbekannter Gebäudetyp' };
      if (!RT.state.canPlace(typeId, col, row)) return { ok: false, msg: 'Kein Platz' };
      var cost = RT.state.buildingCost(typeId);
      if (s.money < cost)                       return { ok: false, msg: 'Zu teuer' };

      s.money -= cost;
      var instanceId = RT.state.newInstanceId(typeId);
      var instState  = RT.state.defaultInstanceState(typeId);
      // Ab Phase 2 starten neu gekaufte Serverfarmen direkt als Huhn.
      if (typeId === 'farm' && RT.state.currentPhase() >= 2) {
        instState.tierId = 'huhn';
      }
      s.placedBuildings.push({
        instanceId: instanceId,
        id:    typeId,
        col:   col,
        row:   row,
        size:  type.size,
        state: instState
      });
      RT.bus.emit('state:changed');
      RT.bus.emit('effect', { where: instanceId, icon: '✨', text: '-' + cost + '€' });
      return { ok: true };
    },

    // Kauft ein Hardware-Item (aktuell nur 'rechner'). Löst HQ-Sprite-Wechsel aus.
    purchaseItem: function (itemId) {
      var s = RT.state.current;
      var catalog = { rechner: { price: 600, name: 'Rechner' } };
      var item = catalog[itemId];
      if (!item)                        return { ok: false, msg: 'Unbekanntes Item' };
      if (s.purchases[itemId])          return { ok: false, msg: 'Schon gekauft' };
      if (s.money < item.price)         return { ok: false, msg: 'Zu teuer' };
      s.money -= item.price;
      s.purchases[itemId] = true;
      if (itemId === 'rechner') {
        var hq = RT.state.instancesByType('hq')[0];
        if (hq) hq.state.level = 1;
      }
      RT.bus.emit('state:changed');
      RT.bus.emit('toast', item.name + ' gekauft (−' + item.price + ' €)');
      return { ok: true };
    },

    // Startet einen Techtree-Node. Prüft Voraussetzungen (requires, requiresPurchase,
    // requiresBuilding, requiresGoLive, requiresUsers), Kosten und HQ-Slot.
    // HQ-Slot blockiert nur entwicklung-Nodes gegenseitig — Marketing/Werbung
    // laufen parallel.
    startTechNode: function (nodeId) {
      var s = RT.state.current;
      var def = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[nodeId] : null;
      if (!def) return { ok: false, msg: 'Unbekannter Node' };

      // Doppelt-Start verhindern
      var self = s.techtree[nodeId];
      if (self && self.status === 'in_progress') return { ok: false, msg: 'Läuft bereits' };
      if (self && self.status === 'ready')       return { ok: false, msg: 'Erst abholen' };

      // HQ-Slot nur für entwicklung: kein anderer entwicklung-Node darf laufen/ready sein.
      if (def.tab === 'entwicklung') {
        for (var nid in s.techtree) {
          var e = s.techtree[nid];
          if (!e) continue;
          var otherDef = RT.techtree.NODES[nid];
          if (!otherDef || otherDef.tab !== 'entwicklung') continue;
          if (e.status === 'in_progress') return { ok: false, msg: 'Es läuft schon eine Entwicklung' };
          if (e.status === 'ready')       return { ok: false, msg: 'Fertige Entwicklung erst abholen' };
        }
      }

      var status = RT.techtree.nodeStatus(nodeId);
      if (status === 'done')        return { ok: false, msg: 'Schon fertig' };
      if (status === 'locked')      return { ok: false, msg: 'Voraussetzung fehlt' };
      if (s.money < def.cost)       return { ok: false, msg: 'Zu teuer' };

      // Server-Kapazität prüfen (nur wenn Node welche belegt)
      if (def.server > 0) {
        var cap  = RT.state.serverCapacityTotal();
        var prog = RT.state.programmCapacity();
        var free = Math.max(0, cap - s.users - prog);
        if (def.server > free) {
          return { ok: false, msg: 'Zu wenig Server-Kapazität (frei: ' + free + ', benötigt: ' + def.server + ')' };
        }
      }

      s.money -= def.cost;
      s.techtree[nodeId] = { status: 'in_progress', startAt: Date.now() };
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Holt eine fertige Node ab (Node im 'ready'-Status → 'done').
    // Wendet Belohnungen an: usersBonus, moneyBonus, growthRatePerSec (dauerhaft).
    completeTechNode: function (nodeId) {
      var s = RT.state.current;
      var entry = s.techtree[nodeId];
      if (!entry || entry.status !== 'ready') return { ok: false, msg: 'Nicht abholbereit' };
      var def = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[nodeId] : null;
      entry.status = 'done';
      entry.doneAt = Date.now();

      if (def) {
        if (def.moneyBonus) s.money += def.moneyBonus;
        if (def.usersBonus) {
          // Server-Cap respektieren — Überschuss geht verloren (Toast).
          var cap  = RT.state.serverCapacityTotal();
          var prog = RT.state.programmCapacity();
          var free = Math.max(0, cap - s.users - prog);
          var add  = Math.min(def.usersBonus, free);
          s.users += add;
          if (add < def.usersBonus) {
            RT.bus.emit('toast', 'Serverkapazität voll — ' + (def.usersBonus - add) + ' User konnten nicht aufgenommen werden');
          }
        }
      }

      maybeTriggerInvestor();
      RT.bus.emit('techtree:completed', { nodeId: nodeId });
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Investor-Belohnung: die erste Küken-Serverfarm (nach Kauf-Reihenfolge)
    // wird kostenlos auf die nächste Stufe (Huhn) hochgestuft. Fallback: falls
    // keine Küken-Farm mehr existiert (Spieler hat manuell upgegradet),
    // wird die niedrigste vorhandene Farm eine Stufe erhöht.
    investorUpgrade: function () {
      var farms = RT.state.instancesByType('farm');
      if (!farms.length) return { ok: false, msg: 'Keine Serverfarm vorhanden' };
      var target = null;
      for (var i = 0; i < farms.length; i++) {
        if (farms[i].state.tierId === 'kueken') { target = farms[i]; break; }
      }
      if (!target) {
        // Niedrigste Stufe suchen (falls Spieler die Küken-Farm schon manuell hochgestuft hat).
        var lowestIdx = Infinity;
        for (var j = 0; j < farms.length; j++) {
          var idx = RT.state.tierIndex(farms[j].state.tierId);
          if (idx >= 0 && idx < lowestIdx) { lowestIdx = idx; target = farms[j]; }
        }
      }
      if (!target) return { ok: false, msg: 'Keine passende Serverfarm gefunden' };
      var next = RT.state.nextTier(target.state.tierId);
      if (!next) return { ok: false, msg: 'Farm ist schon auf höchster Stufe' };
      target.state.tierId = next.id;
      var stufe = RT.state.tierStufe(next.id);
      RT.bus.emit('effect', { where: target.instanceId, icon: '⬆️', text: 'Stufe ' + stufe });
      RT.bus.emit('state:changed');
      return { ok: true };
    },

    // Setzt goLiveUnlocked und öffnet damit das 5×5-Grid + Werbe/Marketing-Shop-Einträge.
    goLive: function () {
      var s = RT.state.current;
      if (s.goLiveUnlocked) return { ok: false, msg: 'Schon online' };
      // Voraussetzung: alle 5 Phase-0-Nodes done
      var reqIds = ['frontend1', 'backend1', 'account', 'feed', 'bilder'];
      for (var i = 0; i < reqIds.length; i++) {
        var e = s.techtree[reqIds[i]];
        if (!e || e.status !== 'done') return { ok: false, msg: 'Erst alle 5 Kern-Nodes entwickeln' };
      }
      s.goLiveUnlocked = true;
      RT.bus.emit('state:changed');
      return { ok: true };
    }
  };

  RT.bus.on('tick', tick);
})(window.RT3);
