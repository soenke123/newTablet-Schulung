/* Marketing Studio — Kampagnen freischalten und starten.
   Wird per RT.marketing.open() aufgerufen wenn der Spieler das Marketing-Studio-Gebäude anklickt.
   Kampagnen-Typen werden durch Tech-Tree-Nodes freigeschaltet.
   Monatliche Effekte via month:advance; Abschluss via clock:tick. */
(function (RT) {
  'use strict';

  var _clockProg = 0;

  var CAMPAIGNS = [
    {
      id: 'stadtaktion',
      name: 'Stadtaktion',
      icon: '🏙️',
      requires: null,
      cost: 80,
      workers: 1,
      duration: 0.5,
      repeatable: true,
      effectType: 'users_once',
      effectValue: 600,
      effectLabel: '+600 Nutzer sofort'
    },
    {
      id: 'partnerschaft',
      name: 'Partnerschafts-Programm',
      icon: '🤝',
      requires: 'mk_langzeit',
      cost: 400,
      workers: 1,
      duration: 24,
      repeatable: false,
      effectType: 'users_per_month',
      effectValue: 200,
      effectLabel: '+200 Nutzer/Monat · 24 Monate'
    },
    {
      id: 'empfehlungswelle',
      name: 'Empfehlungs-Welle',
      icon: '📣',
      requires: 'mk_langzeit',
      cost: 3500,
      workers: 1,
      duration: 12,
      repeatable: true,
      maxConcurrent: 1,
      effectType: 'users_percent',
      effectValue: 0.025,
      effectLabel: '+2,5% Nutzer/Monat · 12 Monate'
    },
    {
      id: 'kampagnensprint',
      name: 'Kampagnen-Sprint',
      icon: '🏃',
      requires: 'mk_sprint',
      cost: 500,
      workers: 1,
      duration: 6,
      repeatable: true,
      effectType: 'users_per_month',
      effectValue: 500,
      effectLabel: '+500 Nutzer/Monat · 6 Monate'
    },
    {
      id: 'hypeburst',
      name: 'Hype-Burst',
      icon: '🚀',
      requires: 'mk_sprint',
      cost: 2000,
      workers: 1,
      duration: 3,
      repeatable: true,
      maxConcurrent: 1,
      effectType: 'users_percent',
      effectValue: 0.05,
      effectLabel: '+5% Nutzer/Monat · 3 Monate'
    },
    {
      id: 'langzeitkooperation',
      name: 'Langzeit-Kooperation',
      icon: '🌱',
      requires: 'mk_nachhall',
      cost: 15000,
      workers: 1,
      duration: 15,
      repeatable: false,
      maxConcurrent: 1,
      effectType: 'users_percent',
      effectValue: 0.02,
      effectLabel: '15 Mon +2% Nutzer/Mon → 12 Mon +1% Nachhall',
      nachhall: {
        duration: 12,
        effectType: 'users_percent',
        effectValue: 0.01
      }
    }
  ];

  function getCampaignDef(type) {
    for (var i = 0; i < CAMPAIGNS.length; i++) {
      if (CAMPAIGNS[i].id === type) return CAMPAIGNS[i];
    }
    return null;
  }

  function isUnlocked(def) {
    if (!def.requires) return true;
    return (RT.state.get().techtree || {})[def.requires] === 'done';
  }

  function countActiveCampaigns(type) {
    var camps = RT.state.get().campaigns || [];
    var n = 0;
    for (var i = 0; i < camps.length; i++) {
      if (camps[i].type === type) n++;
    }
    return n;
  }

  function applyEffect(effectType, effectValue) {
    var s = RT.state.get();
    if (effectType === 'users_per_month') {
      RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: effectValue });
    } else if (effectType === 'users_percent') {
      var bonus = Math.floor((s.resources.users || 0) * effectValue);
      if (bonus > 0) RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: bonus });
    }
  }

  function fmtDuration(m) {
    if (m === 0.5) return '2 Wochen';
    if (m === 1)   return '1 Monat';
    return m + ' Monate';
  }

  // ── Clock: Kampagnen-Abschluss prüfen ────────────────────────────────────
  RT.bus.on('clock:tick', function (d) {
    _clockProg = d.progress;
    var s = RT.state.get();
    var currentFull = s.month + d.progress;
    var camps = (s.campaigns || []).slice();
    var anyChanged = false;

    for (var i = 0; i < camps.length; i++) {
      var camp = camps[i];
      var def  = getCampaignDef(camp.type);
      if (!def) continue;

      if (camp.phase === 'running' && currentFull >= camp.startMonthFull + def.duration) {
        if (def.nachhall) {
          RT.state.dispatch('CAMPAIGN_ENTER_NACHHALL', { id: camp.id, nachhallStartMonthFull: currentFull });
        } else {
          RT.state.dispatch('CAMPAIGN_COMPLETE', { id: camp.id });
        }
        anyChanged = true;
      } else if (camp.phase === 'nachhall' && def.nachhall &&
                 currentFull >= camp.nachhallStartMonthFull + def.nachhall.duration) {
        RT.state.dispatch('CAMPAIGN_COMPLETE', { id: camp.id });
        anyChanged = true;
      }
    }

    if (anyChanged && overlay && overlay.classList.contains('is-open')) render();
  });

  // ── Month advance: monatliche Effekte anwenden ───────────────────────────
  RT.bus.on('month:advance', function () {
    var s = RT.state.get();
    var currentMonth = s.month;
    var camps = (s.campaigns || []).slice();

    for (var i = 0; i < camps.length; i++) {
      var camp = camps[i];
      var def  = getCampaignDef(camp.type);
      if (!def) continue;

      if (camp.phase === 'running' && def.effectType !== 'users_once') {
        var startM = Math.floor(camp.startMonthFull);
        var endM   = startM + def.duration;
        if (currentMonth > startM && currentMonth <= endM) {
          applyEffect(def.effectType, def.effectValue);
        }
      } else if (camp.phase === 'nachhall' && def.nachhall) {
        var nhStartM = Math.floor(camp.nachhallStartMonthFull);
        var nhEndM   = nhStartM + def.nachhall.duration;
        if (currentMonth > nhStartM && currentMonth <= nhEndM) {
          applyEffect(def.nachhall.effectType, def.nachhall.effectValue);
        }
      }
    }
  });

  RT.bus.on('campaigns:changed', function () {
    if (overlay && overlay.classList.contains('is-open')) render();
  });

  // ── Modal ─────────────────────────────────────────────────────────────────
  var overlay = null;

  function open() {
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-mk-modal" id="rt-mk-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  function render() {
    var inner = overlay.querySelector('#rt-mk-inner');
    var s = RT.state.get();
    var freeWorkers = (s.resources.workers.max || 0) - (s.resources.workers.occupied || 0);
    var money = s.resources.money || 0;

    var freeSlot = RT.techtree ? RT.techtree.findFreeSlot(s) : null;

    var cardsHTML = CAMPAIGNS.map(function (def) {
      var unlocked = isUnlocked(def);
      var activeCount = countActiveCampaigns(def.id);
      var running = activeCount > 0;

      var statusHTML;
      if (!unlocked) {
        var reqNode = RT.techtree ? RT.techtree.getNode(def.requires) : null;
        var reqName = reqNode ? reqNode.name : def.requires;
        statusHTML = '<span class="rt-tt-badge rt-tt-badge--locked">🔒 ' + RT.ui.escapeHTML(reqName) + ' erforschen</span>';
      } else if (running) {
        var countLabel = activeCount > 1 ? activeCount + '× läuft' : 'Läuft';
        statusHTML = '<span class="rt-tt-badge rt-tt-badge--progress">📢 ' + countLabel + '</span>';
      } else {
        statusHTML = '<span class="rt-tt-badge rt-tt-badge--ready">Bereit</span>';
      }

      var atMax = def.maxConcurrent != null && activeCount >= def.maxConcurrent;
      var btnHTML = '';
      if (unlocked) {
        if (atMax) {
          btnHTML = '<button class="rt-btn" disabled>Bereits aktiv</button>';
        } else if (money < def.cost) {
          btnHTML = '<button class="rt-btn" disabled>Zu wenig Geld</button>';
        } else if (freeWorkers < def.workers) {
          btnHTML = '<button class="rt-btn" disabled>Kein Worker frei</button>';
        } else if (!freeSlot) {
          btnHTML = '<button class="rt-btn" disabled>Kein Platz frei</button>';
        } else {
          var startLabel = running ? 'Nochmal starten' : 'Starten';
          btnHTML = '<button class="rt-btn rt-btn--primary rt-mk-start" data-type="' + def.id + '">' + startLabel + '</button>';
        }
      }

      var cardClass = 'rt-mk-card' + (unlocked ? '' : ' rt-mk-card--locked');
      return '<div class="' + cardClass + '">'
        + '<div class="rt-mk-card__top">'
        + '  <span class="rt-mk-card__icon">' + def.icon + '</span>'
        + '  <span class="rt-mk-card__name">' + RT.ui.escapeHTML(def.name) + '</span>'
        + '</div>'
        + '<div class="rt-mk-card__effect">' + RT.ui.escapeHTML(def.effectLabel) + '</div>'
        + '<div class="rt-mk-card__chips">'
        + '  <span class="rt-mk-chip rt-mk-chip--cost">€' + def.cost + '</span>'
        + '  <span class="rt-mk-chip rt-mk-chip--dur">' + fmtDuration(def.duration) + '</span>'
        + '  <span class="rt-mk-chip rt-mk-chip--wkr">👤 ' + def.workers + '</span>'
        + '</div>'
        + statusHTML
        + (btnHTML ? '<div class="rt-mk-card__actions">' + btnHTML + '</div>' : '')
        + '</div>';
    }).join('');

    inner.innerHTML = ''
      + '<h2 class="rt-card__title" style="margin-bottom:6px;">📣 Marketing Studio</h2>'
      + '<p class="rt-tt-hint">Kampagnen bringen neue Nutzer. Starte eine und weise einen Worker zu.</p>'
      + '<div class="rt-mk-list">' + cardsHTML + '</div>'
      + '<div class="rt-modal__actions">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-mk-close">Schließen</button>'
      + '</div>';

    inner.querySelector('#rt-mk-close').addEventListener('click', close);

    var startBtns = inner.querySelectorAll('.rt-mk-start');
    for (var i = 0; i < startBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          startCampaign(btn.getAttribute('data-type'));
        });
      }(startBtns[i]));
    }
  }

  function startCampaign(type) {
    var def = getCampaignDef(type);
    if (!def) return;
    if (def.maxConcurrent != null && countActiveCampaigns(type) >= def.maxConcurrent) return;
    var s = RT.state.get();
    var id = type + '_' + Date.now();
    var slot = RT.techtree ? RT.techtree.findFreeSlot(s) : null;

    RT.state.dispatch('CAMPAIGN_START', {
      id: id, type: type, name: def.name,
      startMonthFull: s.month + _clockProg,
      workers: def.workers, cost: def.cost,
      buildingGridSlot: slot ? slot.buildingGridSlot : -1,
      workSlotIndex:    slot ? slot.workSlotIndex    : 0
    });

    render();
  }

  RT.marketing = { open: open, close: close, CAMPAIGNS: CAMPAIGNS };
})(window.RT);
