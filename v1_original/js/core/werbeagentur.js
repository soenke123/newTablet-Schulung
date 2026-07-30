/* Werbe-Agentur — dauerhaft laufendes Werbesystem.
   Banner läuft automatisch nach wb_display-Tech (kein Mitarbeiter nötig).
   Sponsored Post braucht einen Mitarbeiter in der Agentur.
   Häufigkeits-Schieberegler (0–50 %) steuern Revenue und Ruf-Kosten.
   0 % = Deal inaktiv. Slider-Änderungen in _pending, erst per "Übernehmen" wirksam. */
(function (RT) {
  'use strict';

  var AD_TYPES = [
    {
      id:         'banner',
      name:       'Banner-Kampagne',
      icon:       '🖼️',
      requires:   'wb_display',
      minWorkers: 0,
      factor:     0.11,
      repFactor:  -0.002
    },
    {
      id:         'sponsored_post',
      name:       'Sponsored Post',
      icon:       '📺',
      requires:   'wb_display',
      minWorkers: 1,
      factor:     0.54,
      repFactor:  -0.012
    },
    {
      id:         'search_ad',
      name:       'Search-Ad',
      icon:       '🔍',
      requires:   'wb_search',
      minWorkers: 2,
      factor:     0.72,
      repFactor:  -0.020
    },
    {
      id:         'video_ad',
      name:       'Video-Ad',
      icon:       '🎥',
      requires:   'wb_video',
      minWorkers: 3,
      factor:     0.90,
      repFactor:  -0.030
    }
  ];

  // ── Hilfsfunktionen ───────────────────────────────────────────────────────────
  function getAdType(id) {
    for (var i = 0; i < AD_TYPES.length; i++) {
      if (AD_TYPES[i].id === id) return AD_TYPES[i];
    }
    return null;
  }

  function isUnlocked(def) {
    if (!def.requires) return true;
    return (RT.state.get().techtree || {})[def.requires] === 'done';
  }

  // Prüft ob Worker-Bedingung erfüllt ist (unabhängig von Frequenz)
  function workerConditionMet(def, wa) {
    if (!isUnlocked(def)) return false;
    return (wa.workers || 0) >= (def.minWorkers || 0);
  }

  // Deal ist visuell aktiv: freigeschaltet + Worker OK + Frequenz > 0
  function isVisuallyActive(def, wa, freq) {
    return workerConditionMet(def, wa) && (freq || 0) > 0;
  }

  function calcPreview(settings, wa) {
    var revenue = 0, repDelta = 0;
    for (var i = 0; i < AD_TYPES.length; i++) {
      var ad   = AD_TYPES[i];
      var freq = ((settings[ad.id] && settings[ad.id].frequency != null)
                  ? settings[ad.id].frequency : 0) / 100;
      if (!isVisuallyActive(ad, wa, freq * 100)) continue;
      revenue  += ad.factor    * freq;
      repDelta += ad.repFactor * freq;
    }
    return { revenue: revenue, repDelta: repDelta };
  }

  function fmtRep(val) {
    var sign = val >= 0 ? '+' : '';
    return sign + (val * 100).toFixed(3).replace('.', ',') + ' %';
  }

  function fmtEurUser(val) {
    return val.toFixed(4).replace('.', ',') + ' €';
  }

  function fmtEurTotal(val) {
    var parts = val.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts[0] + ',' + parts[1] + ' €';
  }

  // ── Migration: alte Kampagnen-Einträge entfernen ─────────────────────────────
  var _cleaned = false;
  function cleanupOldCampaigns() {
    if (_cleaned) return;
    _cleaned = true;
    RT.state.dispatch('WERBEAGENTUR_CLEANUP_CAMPAIGNS', {});
  }

  RT.bus.on('phase:changed', function (e) {
    if (e && e.phase === 'campus') cleanupOldCampaigns();
  });

  // ── Monatsabrechnung ──────────────────────────────────────────────────────────
  RT.bus.on('month:advance', function () {
    cleanupOldCampaigns();
    var s        = RT.state.get();
    var wa       = s.werbeagentur || {};
    var users    = (s.resources && s.resources.users) || 0;
    var settings = wa.settings || {};
    var totalRevenue  = 0;
    var totalRepDelta = 0;

    for (var i = 0; i < AD_TYPES.length; i++) {
      var ad   = AD_TYPES[i];
      var freq = ((settings[ad.id] && settings[ad.id].frequency != null)
                  ? settings[ad.id].frequency : 0) / 100;
      if (!isVisuallyActive(ad, wa, freq * 100)) continue;
      totalRevenue  += ad.factor    * freq * users;
      totalRepDelta += ad.repFactor * freq;
    }

    // Werbekrise und Watchtime schließen sich gegenseitig aus:
    // Krise → ×0.4 (bis Metadaten freigeschaltet)
    // Metadaten aktiv → ×watchtime direkt (0,5 Std. = ×0,5 | 8 Std. = ×8,0)
    if (s.werbekriseActive) {
      totalRevenue = totalRevenue * 0.4;
    } else if (s.metadatenActive) {
      totalRevenue = totalRevenue * (s.watchtime || 0.5);
    }

    var earned = Math.floor(totalRevenue);
    RT.state.dispatch('WERBEAGENTUR_SET_LAST_REVENUE', { amount: earned });
    if (earned > 0) RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: earned, label: 'Werbeeinnahmen' });
    if (totalRepDelta !== 0) {
      var sp = RT.state.get().supportProgram;
      if (sp && sp.active && totalRepDelta < 0) {
        totalRepDelta = Math.min(0, totalRepDelta + 0.001);
      }
      RT.state.dispatch('ADD_REPUTATION', { delta: totalRepDelta });
    }
  });

  // ── Werbekrise-Info-Modal ─────────────────────────────────────────────────────
  function showWerbekriseModal() {
    var mo = document.createElement('div');
    mo.className = 'rt-modal-overlay is-open';
    mo.innerHTML = '<div class="rt-modal rt-mk-modal" style="max-width:440px;">'
      + '<h2 class="rt-card__title">📉 Neue Werbedeals ab sofort</h2>'
      + '<p style="margin:10px 0 8px;">Die Frist ist abgelaufen. Deine Werbekunden haben die neuen Vertragsbedingungen in Kraft gesetzt.</p>'
      + '<p style="margin:0 0 10px;"><strong>Deine Werbeeinnahmen sind ab jetzt auf 40 % reduziert.</strong></p>'
      + '<p style="margin:0 0 14px;font-size:0.9em;opacity:0.8;">Ohne Watchtime-Daten und gezieltes Targeting können die Werbekunden ihre Kampagnen nicht effektiv schalten — und zahlen entsprechend weniger. Investiere in die richtigen Technologien, um wettbewerbsfähig zu bleiben.</p>'
      + '<div class="rt-modal__actions">'
      + '<button class="rt-btn rt-btn--primary" id="rt-wk-dismiss">Verstanden</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(mo);
    mo.querySelector('#rt-wk-dismiss').addEventListener('click', function () {
      document.body.removeChild(mo);
    });
  }

  RT.bus.on('werbekrise:activated', showWerbekriseModal);

  // ── Modal ─────────────────────────────────────────────────────────────────────
  var overlay  = null;
  var _pending = null;
  var _applied = false;

  function open() {
    cleanupOldCampaigns();
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    var wa    = RT.state.get().werbeagentur || {};
    var saved = wa.settings || {};
    _pending  = {};
    for (var i = 0; i < AD_TYPES.length; i++) {
      var id = AD_TYPES[i].id;
      _pending[id] = {
        frequency: (saved[id] && saved[id].frequency != null) ? saved[id].frequency : 10
      };
    }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-mk-modal" id="rt-wb-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  function render() {
    var inner     = overlay.querySelector('#rt-wb-inner');
    var s         = RT.state.get();
    var wa        = s.werbeagentur || {};
    var waWorkers = wa.workers  || 0;
    var waCap     = wa.capacity || 1;
    var wkrs      = s.resources.workers || {};
    var freeWorkers = (wkrs.max || 0) - (wkrs.occupied || 0);

    // ── Worker-Widget ────────────────────────────────────────────────────────
    var canMinus = waWorkers > 0;
    var canPlus  = waWorkers < waCap && freeWorkers > 0;
    var workerWidget = '<div style="display:flex;align-items:center;gap:6px;font-size:0.9em;flex-shrink:0;">'
      + '<span>👤</span>'
      + '<span><strong>' + waWorkers + '</strong> / ' + waCap + '</span>'
      + '<button class="rt-btn rt-btn--ghost" id="rt-wb-minus"'
      + ' style="padding:2px 8px;min-width:0;font-size:1em;line-height:1;"'
      + (canMinus ? '' : ' disabled') + '>−</button>'
      + '<button class="rt-btn rt-btn--ghost" id="rt-wb-plus"'
      + ' style="padding:2px 8px;min-width:0;font-size:1em;line-height:1;"'
      + (canPlus  ? '' : ' disabled') + '>+</button>'
      + '</div>';

    // ── Vorschau ─────────────────────────────────────────────────────────────
    var users       = (s.resources && s.resources.users) || 0;
    var preview     = calcPreview(_pending || {}, wa);
    var kriseMult   = s.werbekriseActive ? 0.4 : 1;
    var wtMult      = (!s.werbekriseActive && s.metadatenActive) ? (s.watchtime || 0.5) : 1;
    var dispRevenue = preview.revenue * kriseMult * wtMult;
    var cardStyle   = 'flex:1;min-width:90px;border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:4px;';
    var previewLabel = s.werbekriseActive
      ? 'Vorschau (ausstehende Änderungen) · <span style="color:#e74c3c;">Neue Werbedeals aktiv (40 %)</span>'
      : 'Vorschau (ausstehende Änderungen)';

    // ── Watchtime-Card (zwischen €/User und Gesamt/Monat) ────────────────────
    var wtCardHtml = '';
    if (s.metadatenActive || s.werbekriseActive) {
      var wcBg, wcColor, wcLabel, wcMultStr;
      if (s.werbekriseActive) {
        wcBg      = 'rgba(231,76,60,0.12)';
        wcColor   = '#e74c3c';
        wcLabel   = '📉 Werbedeal';
        wcMultStr = '0,4';
      } else {
        var wcWt  = s.watchtime || 0.5;
        wcBg      = 'rgba(230,160,30,0.12)';
        wcColor   = wcWt >= 1 ? '#27ae60' : '#e67e22';
        wcLabel   = '⏱️ Watchtime';
        wcMultStr = wcWt.toFixed(1).replace('.', ',');
      }
      wtCardHtml = '<div style="' + cardStyle + 'background:' + wcBg + ';">'
        + '<span style="font-size:0.7em;text-transform:uppercase;letter-spacing:.04em;opacity:0.6;">' + wcLabel + '</span>'
        + '<strong data-preview="wt-mult" style="font-size:1.15em;color:' + wcColor + ';">×' + wcMultStr + '</strong>'
        + '</div>';
    }

    // ── Gesamt/Monat Sub-Zeile ────────────────────────────────────────────────
    var totalSubHtml = '';
    if (s.metadatenActive || s.werbekriseActive) {
      var tsBase  = preview.revenue * users;
      var tsMult, tsLabel, tsColor;
      if (s.werbekriseActive) {
        tsMult  = '0,4'; tsLabel = 'neuer Werbedeal'; tsColor = '#e74c3c';
      } else {
        var tsWt = s.watchtime || 0.5;
        tsMult   = tsWt.toFixed(1).replace('.', ','); tsLabel = 'Watchtime'; tsColor = 'inherit';
      }
      totalSubHtml = '<span data-preview="total-sub" style="font-size:0.72em;opacity:0.65;color:' + tsColor + ';">'
        + '(' + fmtEurTotal(tsBase) + ' × ×' + tsMult + ' ' + tsLabel + ')'
        + '</span>';
    }

    var previewHtml = '<div style="margin-bottom:14px;">'
      + '<div style="font-size:0.72em;text-transform:uppercase;letter-spacing:.05em;opacity:0.5;margin-bottom:6px;">' + previewLabel + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + (function () {
          var spA      = s.supportProgram && s.supportProgram.active;
          var repFinal = spA ? Math.min(0, preview.repDelta + 0.001) : preview.repDelta;
          var repSub   = spA
            ? '<span data-preview="rep-support" style="font-size:0.72em;opacity:0.65;display:block;">'
              + '(' + fmtRep(preview.repDelta) + ' + 0,100 % User-Programm)'
              + '</span>'
            : '<span data-preview="rep-support" style="display:none;"></span>';
          return '<div style="' + cardStyle + 'background:rgba(231,76,60,0.10);">'
            + '<span style="font-size:0.7em;text-transform:uppercase;letter-spacing:.04em;opacity:0.6;">Ruf/Monat</span>'
            + '<strong data-preview="rep" style="font-size:1.15em;">' + fmtRep(repFinal) + '</strong>'
            + repSub
            + '</div>';
        })()
      + '<div style="' + cardStyle + 'background:rgba(52,152,219,0.10);">'
      +   '<span style="font-size:0.7em;text-transform:uppercase;letter-spacing:.04em;opacity:0.6;">€/User</span>'
      +   '<strong data-preview="eur" style="font-size:1.15em;">' + fmtEurUser(dispRevenue) + '</strong>'
      + '</div>'
      + wtCardHtml
      + '<div style="' + cardStyle + 'background:rgba(39,174,96,0.12);">'
      +   '<span style="font-size:0.7em;text-transform:uppercase;letter-spacing:.04em;opacity:0.6;">Gesamt/Monat</span>'
      +   '<strong data-preview="total" style="font-size:1.15em;">' + fmtEurTotal(dispRevenue * users) + '</strong>'
      +   totalSubHtml
      + '</div>'
      + '</div>'
      + '</div>';

    // ── Anzeigentypen ─────────────────────────────────────────────────────────
    var adsHtml = '';
    for (var i = 0; i < AD_TYPES.length; i++) {
      var ad       = AD_TYPES[i];
      var unlocked = isUnlocked(ad);
      var wkOk     = workerConditionMet(ad, wa);
      var freq     = (_pending && _pending[ad.id] && _pending[ad.id].frequency != null)
                     ? _pending[ad.id].frequency : 0;
      var visActive = isVisuallyActive(ad, wa, freq);

      // Gesamtzustand des Abschnitts
      var dimmed = !visActive; // alles was nicht aktiv ist, gedimmt
      var sectionClass = 'rt-wb-ad-section' + (visActive ? ' rt-wb-deal--active' : '');

      adsHtml += '<div class="' + sectionClass + '" data-ad="' + ad.id + '"'
        + ' style="padding:10px 0;border-top:1px solid rgba(0,0,0,0.08);transition:opacity .25s;'
        + 'opacity:' + (dimmed ? '0.4' : '1') + ';">';

      // Header
      adsHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (unlocked ? '8' : '0') + 'px;">'
        + '<span>' + ad.icon + '</span>'
        + '<strong>' + RT.ui.escapeHTML(ad.name) + '</strong>';

      if (!unlocked) {
        var reqNode = RT.techtree ? RT.techtree.getNode(ad.requires) : null;
        var reqName = reqNode ? reqNode.name : ad.requires;
        adsHtml += '<span class="rt-tt-badge rt-tt-badge--locked" style="margin-left:auto;">'
          + '🔒 ' + RT.ui.escapeHTML(reqName) + '</span>';
      } else {
        if ((ad.minWorkers || 0) === 0) {
          adsHtml += '<span class="rt-tt-badge rt-tt-badge--progress" style="font-size:0.75em;">🤖 Auto</span>';
        }
        // Aktiv/Inaktiv-Dot
        var dotClass = visActive ? 'rt-wb-status-dot rt-wb-status-dot--active' : 'rt-wb-status-dot rt-wb-status-dot--inactive';
        adsHtml += '<span class="' + dotClass + '" data-ad="' + ad.id + '" style="margin-left:auto;">'
          + (visActive ? '● Aktiv' : '● Inaktiv') + '</span>';
      }
      adsHtml += '</div>';

      if (unlocked) {
        // Hinweis fehlender Mitarbeiter (Worker-Bedingung nicht erfüllt)
        if ((ad.minWorkers || 0) > 0 && !wkOk) {
          adsHtml += '<p style="font-size:0.8em;color:#e67e22;margin:0 0 6px;">⚠️ Benötigt mind. '
            + ad.minWorkers + ' Mitarbeiter in der Agentur</p>';
        }
        // Slider (disabled wenn Worker-Bedingung nicht erfüllt)
        var sliderDisabled = (ad.minWorkers || 0) > 0 && !wkOk;
        adsHtml += '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="font-size:0.8em;opacity:0.6;white-space:nowrap;min-width:70px;">Häufigkeit</span>'
          + '<input type="range" min="0" max="50" value="' + freq + '"'
          + ' class="rt-wb-slider" data-ad="' + ad.id + '" style="flex:1;"'
          + (sliderDisabled ? ' disabled' : '') + '>'
          + '<span class="rt-wb-freq-val" data-ad="' + ad.id + '"'
          + ' style="font-size:0.85em;min-width:42px;text-align:right;">' + freq + ' %</span>'
          + '</div>';
      }

      adsHtml += '</div>';
    }

    // ── Zusammenbauen ─────────────────────────────────────────────────────────
    inner.innerHTML = ''
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px;">'
      + '  <h2 class="rt-card__title" style="margin:0;">📢 Werbe-Agentur</h2>'
      + workerWidget
      + '</div>'
      + '<p class="rt-tt-hint" style="margin-bottom:6px;">Konfiguriere deine Werbeflächen. Änderungen gelten erst nach „Übernehmen".</p>'
      + previewHtml
      + adsHtml
      + '<div class="rt-modal__actions" style="margin-top:14px;">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-wb-close">Schließen</button>'
      + '  <button class="rt-btn rt-btn--primary" id="rt-wb-apply"'
      + (_applied ? ' disabled style="background:#27ae60;border-color:#27ae60;color:#fff;"' : '')
      + '>' + (_applied ? 'Übernommen (Sehr gut!)' : 'Übernehmen') + '</button>'
      + '</div>';

    // ── Events ────────────────────────────────────────────────────────────────
    inner.querySelector('#rt-wb-close').addEventListener('click', close);
    inner.querySelector('#rt-wb-apply').addEventListener('click', applySettings);

    var minusBtn = inner.querySelector('#rt-wb-minus');
    var plusBtn  = inner.querySelector('#rt-wb-plus');
    if (minusBtn) minusBtn.addEventListener('click', function () { setWorkers(waWorkers - 1); });
    if (plusBtn)  plusBtn .addEventListener('click', function () { setWorkers(waWorkers + 1); });

    var sliders = inner.querySelectorAll('.rt-wb-slider');
    for (var j = 0; j < sliders.length; j++) {
      (function (sl) {
        sl.addEventListener('input', function () {
          var adId  = sl.getAttribute('data-ad');
          var val   = parseInt(sl.value, 10);
          if (!_pending[adId]) _pending[adId] = {};
          _pending[adId].frequency = val;
          _applied = false;

          // Apply-Button zurücksetzen
          var applyBtn = inner.querySelector('#rt-wb-apply');
          if (applyBtn) {
            applyBtn.textContent  = 'Übernehmen';
            applyBtn.disabled     = false;
            applyBtn.style.background  = '';
            applyBtn.style.borderColor = '';
            applyBtn.style.color       = '';
          }

          // Wert-Label
          var valEl = inner.querySelector('.rt-wb-freq-val[data-ad="' + adId + '"]');
          if (valEl) valEl.textContent = val + ' %';

          // Aktiv/Inaktiv live aktualisieren
          var adDef    = getAdType(adId);
          var waLive   = RT.state.get().werbeagentur || {};
          var nowActive = adDef ? isVisuallyActive(adDef, waLive, val) : false;

          var dotEl = inner.querySelector('.rt-wb-status-dot[data-ad="' + adId + '"]');
          if (dotEl) {
            dotEl.className = nowActive ? 'rt-wb-status-dot rt-wb-status-dot--active'
                                        : 'rt-wb-status-dot rt-wb-status-dot--inactive';
            dotEl.textContent = nowActive ? '● Aktiv' : '● Inaktiv';
          }

          var secEl = inner.querySelector('.rt-wb-ad-section[data-ad="' + adId + '"]');
          if (secEl) {
            secEl.style.opacity = nowActive ? '1' : '0.4';
            if (nowActive) { secEl.classList.add('rt-wb-deal--active'); }
            else           { secEl.classList.remove('rt-wb-deal--active'); }
          }

          updatePreview();
        });
      }(sliders[j]));
    }
  }

  function updatePreview() {
    if (!overlay) return;
    var inner = overlay.querySelector('#rt-wb-inner');
    if (!inner) return;
    var s           = RT.state.get();
    var wa          = s.werbeagentur || {};
    var users       = (s.resources && s.resources.users) || 0;
    var preview     = calcPreview(_pending || {}, wa);
    var kriseMult   = s.werbekriseActive ? 0.4 : 1;
    var wtMult      = (!s.werbekriseActive && s.metadatenActive) ? (s.watchtime || 0.5) : 1;
    var dispRevenue = preview.revenue * kriseMult * wtMult;
    var repEl   = inner.querySelector('[data-preview="rep"]');
    var eurEl   = inner.querySelector('[data-preview="eur"]');
    var totEl   = inner.querySelector('[data-preview="total"]');
    var spNow    = s.supportProgram;
    var spActive = spNow && spNow.active;
    var repFinal = spActive ? Math.min(0, preview.repDelta + 0.001) : preview.repDelta;
    if (repEl) repEl.textContent = fmtRep(repFinal);
    if (eurEl) eurEl.textContent = fmtEurUser(dispRevenue);
    if (totEl) totEl.textContent = fmtEurTotal(dispRevenue * users);
    var totSubEl = inner.querySelector('[data-preview="total-sub"]');
    if (totSubEl) {
      var upBase = preview.revenue * users;
      var upMult, upLabel, upColor;
      if (s.werbekriseActive) {
        upMult = '0,4'; upLabel = 'neuer Werbedeal'; upColor = '#e74c3c';
      } else {
        var upWt = s.watchtime || 0.5;
        upMult   = upWt.toFixed(1).replace('.', ','); upLabel = 'Watchtime'; upColor = 'inherit';
      }
      totSubEl.style.color   = upColor;
      totSubEl.textContent   = '(' + fmtEurTotal(upBase) + ' × ×' + upMult + ' ' + upLabel + ')';
    }
    var repSupEl = inner && inner.querySelector('[data-preview="rep-support"]');
    if (repSupEl) {
      if (spActive) {
        repSupEl.style.display = 'block';
        repSupEl.textContent = '(' + fmtRep(preview.repDelta) + ' + 0,100 % User-Programm)';
      } else {
        repSupEl.style.display = 'none';
      }
    }
  }

  function setWorkers(n) {
    RT.state.dispatch('WERBEAGENTUR_SET_WORKERS', { workers: n });
    render();
  }

  function applySettings() {
    if (!_pending) return;
    RT.state.dispatch('WERBEAGENTUR_APPLY_SETTINGS', { settings: _pending });
    _applied = true;
    render();
  }

  RT.bus.on('werbeagentur:changed', function () {
    if (overlay && overlay.classList.contains('is-open')) render();
  });

  RT.werbeagentur = { open: open, close: close, AD_TYPES: AD_TYPES, DEALS: AD_TYPES };
})(window.RT);
