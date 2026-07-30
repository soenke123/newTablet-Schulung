/* Loop + Actions — arbeiten pro Instanz (mehrere Farmen/Werbe/Marketing möglich).
   Actions nehmen instanceId; placeBuilding erzeugt neue Instanz. */
(function (RT) {
  'use strict';

  var RUF_MAX = 0.20;
  var RUF_MIN = -0.30;
  var PASSIVE_TICK_MS = 10000;
  var PASSIVE_GAIN_PCT = 0.005;
  var PASSIVE_LOSS_PCT = 0.003;

  // --- Formeln ---
  function eurPerWatchtime(slider)   { return 0.02 * (1 + slider * 4); }
  function adConsumeRatePerSec(s)    { return s * 100; }
  function rufCostPerSec(slider)     { return slider * 0.001; }
  function rufRegenPerSec()          { return 0.0002; }
  function adRevenueMultiplier(ruf)  {
    if (ruf < -0.10) return 0.60;
    if (ruf < -0.05) return 0.85;
    if (ruf >  0.10) return 1.15;
    return 1.00;
  }

  // --- Tick ---
  function tick(payload) {
    var dt = payload.dt / 1000;
    var s  = RT.state.current;
    var cap = RT.state.WATCHTIME_STACK_MAX;

    // 1) Serverfarm-Instanzen: Watchtime-Stapel aufbauen (nur wenn User in Farm)
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

    // 2) Werbeagentur-Instanzen: alle konsumieren aus globalem Watchtime-Lager
    var werben = RT.state.instancesByType('werbe');
    var totalRufDrain = 0;
    var anyDraining = false;
    for (var j = 0; j < werben.length; j++) {
      var ws = werben[j].state;
      if (ws.slider > 0 && s.watchtime > 0) {
        var toConsume = Math.min(s.watchtime, adConsumeRatePerSec(ws.slider) * dt);
        s.watchtime  -= toConsume;
        ws.moneyReady += toConsume * eurPerWatchtime(ws.slider) * adRevenueMultiplier(s.ruf);
        totalRufDrain += rufCostPerSec(ws.slider) * dt;
        anyDraining = true;
      }
    }
    if (anyDraining) {
      s.ruf = Math.max(RUF_MIN, s.ruf - totalRufDrain);
    } else {
      s.ruf = Math.min(RUF_MAX, s.ruf + rufRegenPerSec() * dt);
    }

    // 3) Marketing-Instanzen: eigene Kampagne, eigene Ready-User
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

    // 4) Passiv-User alle 10 s — Wachstum blockiert bei Serverkap-Voll.
    var now = Date.now();
    if (now - s.lastPassiveTick > PASSIVE_TICK_MS) {
      s.lastPassiveTick = now;
      if (s.ruf > 0.05) {
        var srvCap = RT.state.serverCapacityTotal();
        if (s.users < srvCap) {
          var gain = Math.max(1, Math.floor(s.users * PASSIVE_GAIN_PCT));
          s.users = Math.min(s.users + gain, srvCap);
        }
      } else if (s.ruf < -0.10) {
        var loss = Math.max(1, Math.floor(s.users * PASSIVE_LOSS_PCT));
        s.users = Math.max(0, s.users - loss);
      }
    }
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

    setAdSlider: function (instanceId, v) {
      var inst = RT.state.getInstance(instanceId);
      if (!inst || inst.id !== 'werbe') return;
      inst.state.slider = Math.max(0, Math.min(1, v));
      // Kein state:changed — verhindert Modal-Rebuild während des Ziehens.
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
      var free = Math.max(0, cap - s.users);
      var add  = Math.min(mkS.ready, free);
      if (add <= 0) {
        RT.bus.emit('toast', 'Serverkapazität voll — mehr Serverfarmen bauen!');
        return 0;
      }
      s.users   += add;
      mkS.ready -= add;
      RT.bus.emit('effect', { where: instanceId, icon: '👥', text: '+' + add });
      RT.bus.emit('state:changed');
      return add;
    },

    placeBuilding: function (typeId, col, row) {
      var s = RT.state.current;
      var type = RT.state.BUILDING_TYPES[typeId];
      if (!type)                                return { ok: false, msg: 'Unbekannter Gebäudetyp' };
      if (!RT.state.canPlace(typeId, col, row)) return { ok: false, msg: 'Kein Platz' };
      if (s.money < type.cost)                  return { ok: false, msg: 'Zu teuer' };

      s.money -= type.cost;
      var instanceId = RT.state.newInstanceId(typeId);
      s.placedBuildings.push({
        instanceId: instanceId,
        id:    typeId,
        col:   col,
        row:   row,
        size:  type.size,
        state: RT.state.defaultInstanceState(typeId)
      });
      RT.bus.emit('state:changed');
      RT.bus.emit('effect', { where: instanceId, icon: '✨', text: '-' + type.cost + '€' });
      return { ok: true };
    }
  };

  RT.bus.on('tick', tick);
})(window.RT3);
