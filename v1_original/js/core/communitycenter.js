/* Community Center — öffnet sich per RT.communitycenter.open() wenn der Spieler das CC-Gebäude anklickt. */
(function (RT) {
  'use strict';

  // Kosten und Worker-Bedarf nach Expansionsstufe (User-Support-Programm)
  var TIERS = [
    { workers: 1, costPerMonth: 30000    },   // Tier 0: Basis
    { workers: 2, costPerMonth: 100000   },   // Tier 1: nach EU-Expansion
    { workers: 3, costPerMonth: 300000   },   // Tier 2: nach Amerika/Afrika
    { workers: 5, costPerMonth: 1000000  }    // Tier 3: nach Asien
  ];

  var EXPANSION_TO_TIER = { mk_eu: 1, mk_americas: 2, mk_asia: 3 };

  // Definitionen der kampagnenbasierten CC-Aktionen (Community Event, Image-Kampagne)
  var CC_ACTIONS = [
    {
      id:       'community_event',
      name:     'Community Event',
      icon:     '🎪',
      duration: 12,
      cost:     5000000,
      workers:  1
    },
    {
      id:       'image_kampagne',
      name:     'Image-Kampagne',
      icon:     '🌟',
      duration: 4,
      cost:     100000,
      workers:  1
    }
  ];

  var overlay = null;

  function fmtRep(val) {
    return (val * 100).toFixed(3) + ' %';
  }

  function currentTierIndex() {
    var tt = RT.state.get().techtree || {};
    if (tt.mk_asia     === 'done') return 3;
    if (tt.mk_americas === 'done') return 2;
    if (tt.mk_eu       === 'done') return 1;
    return 0;
  }

  function calcDonationRuf(amount) {
    // Lineare Skala: 500.000 € → +0,2 % / 50.000.000 € → +6,0 %
    var t = Math.max(0, Math.min(1, (amount - 500000) / 49500000));
    return 0.002 + t * 0.058;
  }

  function getRunningCC(type) {
    var camps = RT.state.get().campaigns || [];
    for (var i = 0; i < camps.length; i++) {
      if (camps[i].type === type && camps[i].phase === 'running') return camps[i];
    }
    return null;
  }

  // ── Modal öffnen / schließen ─────────────────────────────────────────────
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
    el.innerHTML = '<div class="rt-modal rt-cc-modal" id="rt-cc-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  // ── Haupt-Render ─────────────────────────────────────────────────────────
  function render() {
    var inner = overlay.querySelector('#rt-cc-inner');
    if (!inner) return;
    var s       = RT.state.get();
    var sp      = s.supportProgram || {};
    var tierIdx = currentTierIndex();
    var tier    = TIERS[tierIdx];
    var tt      = s.techtree || {};
    var ccSt    = s.ccState  || {};

    var feedbackDone   = tt.feedback_system  === 'done';
    var prDone         = tt.pr_abteilung     === 'done';

    inner.innerHTML = ''
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.9rem;">'
      + '  <h2 class="rt-card__title" style="margin:0;">🤝 Community Center</h2>'
      + '  <button class="rt-btn rt-btn--ghost rt-btn--sm" id="rt-cc-close">✕</button>'
      + '</div>'
      + '<div class="rt-cc-grid">'
      + buildSupportSection(sp, feedbackDone, tier, tierIdx)
      + buildSpendeSection(s, ccSt)
      + buildCommunityEventSection(s, prDone)
      + buildImageKampagneSection(s, prDone, ccSt)
      + '</div>'
      + '<div class="rt-modal__actions">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-cc-close2">Schließen</button>'
      + '</div>';

    inner.querySelector('#rt-cc-close').addEventListener('click', close);
    inner.querySelector('#rt-cc-close2').addEventListener('click', close);

    // Support-Programm Buttons
    var startSPBtn = inner.querySelector('#rt-cc-sp-start');
    if (startSPBtn) startSPBtn.addEventListener('click', startSupportProgram);
    var stopSPBtn  = inner.querySelector('#rt-cc-sp-stop');
    if (stopSPBtn)  stopSPBtn.addEventListener('click', confirmStop);

    // Spendenaktion Slider + Button
    var sliderEl = inner.querySelector('#rt-cc-sp-slider');
    if (sliderEl) {
      sliderEl.addEventListener('input', updateSliderPreview);
      updateSliderPreview.call(sliderEl);
    }
    var donateBtn = inner.querySelector('#rt-cc-sp-donate');
    if (donateBtn) donateBtn.addEventListener('click', startDonation);

    // Community Event Button
    var ceBtn = inner.querySelector('#rt-cc-ce-start');
    if (ceBtn) ceBtn.addEventListener('click', startCommunityEvent);

    // Image-Kampagne Button
    var ikBtn = inner.querySelector('#rt-cc-ik-start');
    if (ikBtn) ikBtn.addEventListener('click', startImageKampagne);
  }

  // ── User-Support-Programm Sektion ─────────────────────────────────────────
  function buildSupportSection(sp, unlocked, tier, tierIdx) {
    var html = '<div class="rt-cc-section">'
      + '<div class="rt-cc-section__header">'
      + '  <span class="rt-cc-section__icon">🎧</span>'
      + '  <strong>User-Support-Programm</strong>'
      + '</div>';

    if (!unlocked) {
      html += '<p class="rt-cc-desc">Benötigt: Tech-Tree Node <strong>Feedback-System</strong></p>';
    } else if (sp.active) {
      html += '<div class="rt-cc-status rt-cc-status--active">'
        + '<span class="rt-cc-dot">●</span> Aktiv'
        + '<span class="rt-cc-status__detail">'
        + sp.workers + ' Mitarbeiter &nbsp;·&nbsp; €'
        + sp.costPerMonth.toLocaleString('de-DE') + '/Monat'
        + '</span>'
        + '</div>'
        + '<p class="rt-cc-desc">Reduziert den monatlichen Ruf-Malus durch Werbeschalten um 0,1&nbsp;%/Monat (max. 0&nbsp;%).</p>'
        + '<button class="rt-btn rt-btn--ghost rt-btn--danger-ghost" id="rt-cc-sp-stop">Programm beenden</button>';
    } else {
      html += '<p class="rt-cc-desc">Reduziert den monatlichen Ruf-Malus durch Werbeschalten um 0,1&nbsp;%/Monat (max. 0&nbsp;%).</p>'
        + '<div class="rt-cc-cost-row">'
        + '<span>' + tier.workers + ' Mitarbeiter &nbsp;·&nbsp; €' + tier.costPerMonth.toLocaleString('de-DE') + '/Monat</span>'
        + '</div>'
        + '<button class="rt-btn rt-btn--primary" id="rt-cc-sp-start">Programm starten</button>';
    }

    html += '</div>';
    return html;
  }

  // ── Spendenaktion Sektion ───────────────────────────────────────────────────
  function buildSpendeSection(s, ccSt) {
    var html = '<div class="rt-cc-section">'
      + '<div class="rt-cc-section__header">'
      + '  <span class="rt-cc-section__icon">💰</span>'
      + '  <strong>Spendenaktion</strong>'
      + '</div>';

    var cooldownUntil = ccSt.donationCooldownUntil || 0;
    if (cooldownUntil > s.month) {
      var remaining = cooldownUntil - s.month;
      html += '<p class="rt-cc-desc">Abklingzeit: noch <strong>' + remaining + ' Monat' + (remaining !== 1 ? 'e' : '') + '</strong> bis zur nächsten Spendenaktion.</p>';
    } else {
      var initRuf = calcDonationRuf(500000);
      html += '<p class="rt-cc-desc">Einmalige Spende steigert deinen Ruf sofort. 12&nbsp;Monate Abklingzeit.</p>'
        + '<div class="rt-cc-slider-wrap">'
        + '  <input class="rt-cc-slider" type="range" id="rt-cc-sp-slider"'
        + '    min="500000" max="50000000" step="100000" value="500000">'
        + '  <div class="rt-cc-slider-row">'
        + '    <span id="rt-cc-sp-amount">€ 500.000</span>'
        + '    <span class="rt-cc-ruf-preview">Ruf +<strong id="rt-cc-sp-rufbonus">'
        + fmtRep(initRuf) + '</strong></span>'
        + '  </div>'
        + '</div>'
        + '<button class="rt-btn rt-btn--primary" id="rt-cc-sp-donate">Spenden</button>';
    }

    html += '</div>';
    return html;
  }

  // ── Community Event Sektion ─────────────────────────────────────────────────
  function buildCommunityEventSection(s, prDone) {
    var html = '<div class="rt-cc-section">'
      + '<div class="rt-cc-section__header">'
      + '  <span class="rt-cc-section__icon">🎪</span>'
      + '  <strong>Community Event</strong>'
      + '</div>';

    if (!prDone) {
      html += '<p class="rt-cc-desc">Benötigt: Tech-Tree Node <strong>PR-Abteilung</strong></p>';
    } else {
      var running = getRunningCC('community_event');
      var pending = findPendingCC('community_event', s.pendingCelebrations || []);
      if (pending) {
        html += '<div class="rt-cc-status rt-cc-status--active">'
          + '<span class="rt-cc-dot">●</span> Abgeschlossen!'
          + '<span class="rt-cc-status__detail">Klick auf HQ oder Slot-Sidebar zum Feiern</span>'
          + '</div>';
      } else if (running) {
        var elapsed  = Math.max(0, s.month - running.startMonthFull);
        var remain   = Math.max(0, 12 - elapsed);
        html += '<div class="rt-cc-status rt-cc-status--active">'
          + '<span class="rt-cc-dot">●</span> In Planung'
          + '<span class="rt-cc-status__detail">1 Mitarbeiter &nbsp;·&nbsp; noch ' + remain + ' Monate</span>'
          + '</div>'
          + '<p class="rt-cc-desc">Nach Abschluss: +2&nbsp;% aktuelle User (einmalig) + +3,000&nbsp;% Ruf.</p>';
      } else {
        html += '<p class="rt-cc-desc">12&nbsp;Monate Planung mit 1&nbsp;Mitarbeiter.'
          + ' Nach Abschluss: +2&nbsp;% aktuelle User (einmalig) + +3,000&nbsp;% Ruf.</p>'
          + '<div class="rt-cc-cost-row">'
          + '<span>€ 5.000.000 &nbsp;·&nbsp; 1 Mitarbeiter &nbsp;·&nbsp; 12 Monate</span>'
          + '</div>'
          + '<button class="rt-btn rt-btn--primary" id="rt-cc-ce-start">Event planen</button>';
      }
    }

    html += '</div>';
    return html;
  }

  // ── Image-Kampagne Sektion ──────────────────────────────────────────────────
  function buildImageKampagneSection(s, prDone, ccSt) {
    var html = '<div class="rt-cc-section">'
      + '<div class="rt-cc-section__header">'
      + '  <span class="rt-cc-section__icon">🌟</span>'
      + '  <strong>Image-Kampagne</strong>'
      + '</div>';

    if (!prDone) {
      html += '<p class="rt-cc-desc">Benötigt: Tech-Tree Node <strong>PR-Abteilung</strong></p>';
    } else {
      var cooldownUntil = (ccSt && ccSt.imageCooldownUntil) || 0;
      var running = getRunningCC('image_kampagne');
      var pending = findPendingCC('image_kampagne', s.pendingCelebrations || []);
      if (pending) {
        html += '<div class="rt-cc-status rt-cc-status--active">'
          + '<span class="rt-cc-dot">●</span> Abgeschlossen!'
          + '<span class="rt-cc-status__detail">Klick auf HQ zum Abschließen</span>'
          + '</div>';
      } else if (running) {
        var elapsed  = Math.max(0, s.month - running.startMonthFull);
        var remain   = Math.max(0, 4 - elapsed);
        html += '<div class="rt-cc-status rt-cc-status--active">'
          + '<span class="rt-cc-dot">●</span> Aktiv — Ruf ist geschützt'
          + '<span class="rt-cc-status__detail">1 Mitarbeiter &nbsp;·&nbsp; noch ' + remain + ' Monate</span>'
          + '</div>'
          + '<p class="rt-cc-desc">Während der Kampagne kann der Ruf nicht sinken.</p>';
      } else if (cooldownUntil > s.month) {
        var remaining = cooldownUntil - s.month;
        html += '<p class="rt-cc-desc">Abklingzeit: noch <strong>' + remaining + ' Monat' + (remaining !== 1 ? 'e' : '') + '</strong>.</p>';
      } else {
        html += '<p class="rt-cc-desc">4&nbsp;Monate mit 1&nbsp;Mitarbeiter. Während der Kampagne kann der Ruf nicht sinken.'
          + ' Danach 6&nbsp;Monate Abklingzeit.</p>'
          + '<div class="rt-cc-cost-row">'
          + '<span>€ 100.000 &nbsp;·&nbsp; 1 Mitarbeiter &nbsp;·&nbsp; 4 Monate</span>'
          + '</div>'
          + '<button class="rt-btn rt-btn--primary" id="rt-cc-ik-start">Kampagne starten</button>';
      }
    }

    html += '</div>';
    return html;
  }

  function findPendingCC(type, pcs) {
    for (var i = 0; i < pcs.length; i++) {
      var p = pcs[i];
      if (typeof p === 'object' && p.kind === 'campaign' && p.campaignType === type) return p;
    }
    return null;
  }

  // ── Slider Preview aktualisieren ────────────────────────────────────────────
  function updateSliderPreview() {
    var inner = overlay && overlay.querySelector('#rt-cc-inner');
    if (!inner) return;
    var sliderEl  = inner.querySelector('#rt-cc-sp-slider');
    var amountEl  = inner.querySelector('#rt-cc-sp-amount');
    var rufEl     = inner.querySelector('#rt-cc-sp-rufbonus');
    if (!sliderEl || !amountEl || !rufEl) return;
    var amount  = parseInt(sliderEl.value, 10) || 500000;
    var rufBonus = calcDonationRuf(amount);
    amountEl.textContent = '€ ' + amount.toLocaleString('de-DE');
    rufEl.textContent    = fmtRep(rufBonus);
  }

  // ── Support-Programm starten ─────────────────────────────────────────────
  function startSupportProgram() {
    var s       = RT.state.get();
    var tierIdx = currentTierIndex();
    var tier    = TIERS[tierIdx];
    var freeSlot = RT.techtree.findFreeSlot(s);
    if (!freeSlot) { showInfoModal('Kein freier Slot', 'Alle Team-Slots sind belegt. Upgrade dein Team im Shop, um mehr Slots freizuschalten.'); return; }
    var avail = (s.resources.workers.max || 0) - (s.resources.workers.occupied || 0);
    if (avail < tier.workers) { showInfoModal('Zu wenig Mitarbeiter', 'Das Programm benötigt ' + tier.workers + ' Mitarbeiter. Verfügbar: ' + avail + '.'); return; }
    RT.state.dispatch('START_SUPPORT_PROGRAM', {
      tier: tierIdx, workers: tier.workers, costPerMonth: tier.costPerMonth,
      buildingGridSlot: freeSlot.buildingGridSlot, workSlotIndex: freeSlot.workSlotIndex
    });
    RT.bus.emit('campus:grid-changed', {});
    close();
  }

  // ── Spendenaktion ausführen ─────────────────────────────────────────────────
  function startDonation() {
    var inner   = overlay && overlay.querySelector('#rt-cc-inner');
    if (!inner) return;
    var sliderEl = inner.querySelector('#rt-cc-sp-slider');
    var amount   = parseInt(sliderEl ? sliderEl.value : 500000, 10) || 500000;
    var s        = RT.state.get();
    var money    = (s.resources && s.resources.money) || 0;
    if (money < amount) {
      showInfoModal('Nicht genug Geld', 'Du benötigst € ' + amount.toLocaleString('de-DE') + ' für diese Spendenaktion.');
      return;
    }
    var rufBonus = calcDonationRuf(amount);
    RT.state.dispatch('START_DONATION', { amount: amount, repDelta: rufBonus });
    close();
    showDonationResult(amount, rufBonus);
  }

  function showDonationResult(amount, rufBonus) {
    var s = RT.state.get();
    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-celebration-modal">'
      + '  <div class="rt-celebration-icon">💰</div>'
      + '  <h2 class="rt-celebration-title">Spende erfolgreich!</h2>'
      + '  <p class="rt-celebration-fx">'
      + '    <strong>€ ' + amount.toLocaleString('de-DE') + '</strong> gespendet<br>'
      + '    Ruf-Bonus: <strong>+' + fmtRep(rufBonus) + '</strong><br>'
      + '    Aktueller Ruf: <strong>' + fmtRep(typeof s.reputation === 'number' ? s.reputation : 0) + '</strong>'
      + '  </p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary" id="rt-cc-don-ok">OK</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#rt-cc-don-ok').addEventListener('click', function () {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
  }

  // ── Community Event starten ─────────────────────────────────────────────────
  function startCommunityEvent() {
    var s        = RT.state.get();
    var freeSlot = RT.techtree.findFreeSlot(s);
    if (!freeSlot) { showInfoModal('Kein freier Slot', 'Alle Team-Slots sind belegt. Upgrade dein Team im Shop, um mehr Slots freizuschalten.'); return; }
    var avail = (s.resources.workers.max || 0) - (s.resources.workers.occupied || 0);
    if (avail < 1)             { showInfoModal('Zu wenig Mitarbeiter', 'Das Event benötigt 1 Mitarbeiter.'); return; }
    if ((s.resources.money || 0) < 5000000) { showInfoModal('Nicht genug Geld', 'Das Event kostet € 5.000.000.'); return; }
    RT.state.dispatch('CAMPAIGN_START', {
      id:               'ce_' + s.month,
      type:             'community_event',
      startMonthFull:   s.month,
      workers:          1,
      cost:             5000000,
      name:             'Community Event',
      buildingGridSlot: freeSlot.buildingGridSlot,
      workSlotIndex:    freeSlot.workSlotIndex
    });
    RT.bus.emit('campus:grid-changed', {});
    close();
  }

  // ── Image-Kampagne starten ──────────────────────────────────────────────────
  function startImageKampagne() {
    var s        = RT.state.get();
    var freeSlot = RT.techtree.findFreeSlot(s);
    if (!freeSlot) { showInfoModal('Kein freier Slot', 'Alle Team-Slots sind belegt. Upgrade dein Team im Shop, um mehr Slots freizuschalten.'); return; }
    var avail = (s.resources.workers.max || 0) - (s.resources.workers.occupied || 0);
    if (avail < 1)              { showInfoModal('Zu wenig Mitarbeiter', 'Die Kampagne benötigt 1 Mitarbeiter.'); return; }
    if ((s.resources.money || 0) < 100000) { showInfoModal('Nicht genug Geld', 'Die Kampagne kostet € 100.000.'); return; }
    RT.state.dispatch('CAMPAIGN_START', {
      id:               'ik_' + s.month,
      type:             'image_kampagne',
      startMonthFull:   s.month,
      workers:          1,
      cost:             100000,
      name:             'Image-Kampagne',
      buildingGridSlot: freeSlot.buildingGridSlot,
      workSlotIndex:    freeSlot.workSlotIndex
    });
    RT.state.dispatch('IMAGE_CAMPAIGN_ACTIVATE');
    RT.bus.emit('campus:grid-changed', {});
    close();
  }

  // ── Support-Programm beenden (Bestätigung) ─────────────────────────────────
  function confirmStop() {
    var sp  = RT.state.get().supportProgram || {};
    var m   = document.createElement('div');
    m.className = 'rt-modal-overlay is-open';
    m.innerHTML = ''
      + '<div class="rt-modal">'
      + '  <h2 class="rt-card__title">Support-Programm beenden?</h2>'
      + '  <p>Das Programm schützt deinen Ruf vor Werbe-Malus. Wirklich beenden?</p>'
      + '  <p><strong>' + (sp.workers || 0) + ' Mitarbeiter &nbsp;·&nbsp; €'
      + (sp.costPerMonth || 0).toLocaleString('de-DE') + '/Monat</strong></p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--ghost" id="rt-cc-stop-no">Abbrechen</button>'
      + '    <button class="rt-btn rt-btn--primary" id="rt-cc-stop-yes">Beenden</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(m);
    m.querySelector('#rt-cc-stop-no').addEventListener('click', function () {
      if (m.parentNode) m.parentNode.removeChild(m);
    });
    m.querySelector('#rt-cc-stop-yes').addEventListener('click', function () {
      RT.state.dispatch('STOP_SUPPORT_PROGRAM', { addRestart: false });
      if (m.parentNode) m.parentNode.removeChild(m);
      RT.bus.emit('campus:grid-changed', {});
      render();
    });
  }

  // ── Info-Modal ─────────────────────────────────────────────────────────────
  function showInfoModal(title, msg) {
    var m = document.createElement('div');
    m.className = 'rt-modal-overlay is-open';
    m.innerHTML = '<div class="rt-modal"><h2 class="rt-card__title">' + RT.ui.escapeHTML(title) + '</h2>'
      + '<p>' + RT.ui.escapeHTML(msg) + '</p>'
      + '<div class="rt-modal__actions"><button class="rt-btn rt-btn--primary" id="rt-cc-info-ok">OK</button></div>'
      + '</div>';
    document.body.appendChild(m);
    m.querySelector('#rt-cc-info-ok').addEventListener('click', function () {
      if (m.parentNode) m.parentNode.removeChild(m);
    });
  }

  // ── Abschluss-Erkennung CC-Kampagnen (monatlich) ──────────────────────────
  RT.bus.on('month:advance', function () {
    var s     = RT.state.get();
    var month = s.month;
    var camps = (s.campaigns || []).slice();
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      if (c.type === 'community_event' && c.phase === 'running' && month >= c.startMonthFull + 12) {
        RT.state.dispatch('CAMPAIGN_COMPLETE', {
          id: c.id, buildingGridSlot: c.buildingGridSlot,
          workSlotIndex: c.workSlotIndex || 0, workers: c.workers || 0
        });
        RT.bus.emit('campus:grid-changed', {});
      } else if (c.type === 'image_kampagne' && c.phase === 'running' && month >= c.startMonthFull + 4) {
        RT.state.dispatch('IMAGE_CAMPAIGN_DEACTIVATE', { cooldownUntil: month + 6 });
        RT.state.dispatch('CAMPAIGN_COMPLETE', {
          id: c.id, buildingGridSlot: c.buildingGridSlot,
          workSlotIndex: c.workSlotIndex || 0, workers: c.workers || 0
        });
        RT.bus.emit('campus:grid-changed', {});
      }
    }
  });

  // ── Expansion abgeschlossen → Support-Programm stoppen ──────────────────
  RT.bus.on('techtree:completed', function (data) {
    if (!Object.prototype.hasOwnProperty.call(EXPANSION_TO_TIER, data.nodeId)) return;
    var s = RT.state.get();
    if (!s.supportProgram || !s.supportProgram.active) return;
    RT.state.dispatch('STOP_SUPPORT_PROGRAM', {
      addRestart: true,
      newTier:    EXPANSION_TO_TIER[data.nodeId]
    });
    RT.bus.emit('campus:grid-changed', {});
  });

  RT.communitycenter = { open: open, close: close, TIERS: TIERS, CC_ACTIONS: CC_ACTIONS };
})(window.RT);
