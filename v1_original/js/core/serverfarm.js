/* Server-Farm-Modal — skalierbares +/− System ohne Worker-Zuweisung. */
(function (RT) {
  'use strict';

  var UPGRADE_L1_COST = 30000;
  var UPGRADE_L2_COST = 70000;

  var overlay  = null;
  var _curSlot = -1;

  function sfCap(sl, et) {
    if (sl >= 2) return ([50000, 300000, 800000, 2000000, 10000000, 100000000][et + 2] || 800000);
    if (sl >= 1 && et >= 1) return 300000;
    return 50000;
  }
  function sfMonthlyCost(sl, et) {
    if (sl >= 2) return ([0, 2000, 5000, 10000, 40000, 300000][et + 2] !== undefined ? [0, 2000, 5000, 10000, 40000, 300000][et + 2] : 5000);
    if (sl >= 1 && et >= 1) return 2000;
    return 0;
  }
  function sfMinTier(sl) { return sl >= 2 ? -2 : 0; }
  function sfMaxTier(sl) { return sl >= 2 ? 3 : sl >= 1 ? 1 : 0; }

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-sf-modal" id="rt-sf-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  function open(slot) {
    _curSlot = slot;
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  function render() {
    var inner = overlay.querySelector('#rt-sf-inner');
    if (!inner) return;

    var s    = RT.state.get();
    var farm = null;
    for (var i = 0; i < (s.buildings || []).length; i++) {
      if (s.buildings[i].slot === _curSlot && s.buildings[i].type === 'serverfarm') {
        farm = s.buildings[i]; break;
      }
    }
    if (!farm) { close(); return; }

    var sl      = farm.structLevel   || 0;
    var et      = farm.expansionTier || 0;
    var money   = (s.resources && s.resources.money) || 0;
    var cap     = sfCap(sl, et);
    var cost    = sfMonthlyCost(sl, et);
    var maxTier = sfMaxTier(sl);

    // ── Info-Box ────────────────────────────────────────────────────────────────
    var capLabel  = cap >= 1000000
      ? (cap / 1000000).toFixed(cap % 1000000 === 0 ? 0 : 1) + ' Mio.'
      : RT.ui.formatNumber(cap);
    var costLabel = cost > 0 ? RT.ui.formatNumber(cost) + ' €/Monat' : '0 €/Monat';

    var infoHTML = '<p class="rt-tt-hint" style="margin-bottom:10px;">'
      + 'User-Verbindungen und laufende Software brauchen Server-Kapazität. '
      + 'Wird sie knapp, können keine neuen User mehr joinen.</p>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;'
      + 'gap:12px;margin-bottom:16px;flex-wrap:wrap;">'
      + '<div>'
      + '<span style="font-size:0.88rem;color:var(--rt-text-muted);">Kapazität</span><br>'
      + '<strong style="font-size:1.05rem;">🛰️ ' + capLabel + ' User</strong>'
      + '</div>'
      + '<div style="text-align:right;">'
      + '<span style="font-size:0.88rem;color:var(--rt-text-muted);">Betriebskosten</span><br>'
      + '<strong style="font-size:1.05rem;">' + costLabel + '</strong>'
      + '</div>'
      + '</div>';

    // ── +/− Tier-Widget (nur wenn structLevel >= 1) ─────────────────────────────
    var tierHTML = '';
    if (sl >= 1) {
      var canPlus  = et < maxTier;
      var canMinus = et > sfMinTier(sl);
      var nextCap  = canPlus  ? sfCap(sl, et + 1) : null;
      var prevCap  = canMinus ? sfCap(sl, et - 1) : null;
      var addCost      = canPlus ? sfMonthlyCost(sl, et + 1) - sfMonthlyCost(sl, et) : 0;
      var plusDisabled = !canPlus || (addCost > 0 && money < addCost);
      var plusWarn     = canPlus && !plusDisabled && addCost > 0 && money < addCost * 3;
      function fmtCap(c) {
        return c >= 1000000
          ? (c / 1000000).toFixed(c % 1000000 === 0 ? 0 : 1) + ' Mio.'
          : RT.ui.formatNumber(c);
      }
      function fmtCost(c) {
        return c >= 1000 ? (c / 1000) + 'k€/Mo' : c + '€/Mo';
      }
      var nextLabel = canPlus  ? fmtCap(nextCap) + ' · ' + fmtCost(sfMonthlyCost(sl, et + 1)) : '';
      var prevLabel = canMinus ? fmtCap(prevCap) + (sfMonthlyCost(sl, et - 1) > 0 ? ' · ' + fmtCost(sfMonthlyCost(sl, et - 1)) : ' · 0€') : '';

      tierHTML = '<div style="border-top:1px solid rgba(0,0,0,0.08);padding-top:12px;'
        + 'margin-bottom:12px;">'
        + '<div style="font-size:0.7em;text-transform:uppercase;letter-spacing:.05em;'
        + 'opacity:0.5;margin-bottom:8px;">Kapazität skalieren</div>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
        + '<button class="rt-btn rt-btn--ghost" id="rt-sf-minus"'
        + ' style="padding:4px 14px;min-width:0;font-size:1.1em;"'
        + (canMinus ? '' : ' disabled') + '>−'
        + (canMinus ? '<span style="font-size:0.72em;margin-left:4px;opacity:.7;">' + prevLabel + '</span>' : '')
        + '</button>'
        + '<span style="flex:1;text-align:center;font-size:0.85rem;opacity:0.6;">'
        + 'Tier ' + et + '/' + maxTier
        + '</span>'
        + '<button class="rt-btn rt-btn--primary" id="rt-sf-plus"'
        + ' style="padding:4px 14px;min-width:0;font-size:1.1em;"'
        + (plusDisabled ? ' disabled' : '') + '>+'
        + (canPlus ? '<span style="font-size:0.72em;margin-left:4px;">' + nextLabel + '</span>' : '')
        + '</button>'
        + (plusWarn ? '<span title="Achtung: weniger als 3 Monate leistbar!" style="font-size:1.2em;cursor:default;">⚠️</span>' : '')
        + '</div>'
        + '</div>';
    }

    // ── Upgrade-Bereich ─────────────────────────────────────────────────────────
    var upgradesHTML = '<div style="border-top:1px solid rgba(0,0,0,0.08);padding-top:12px;">'
      + '<div style="font-size:0.7em;text-transform:uppercase;letter-spacing:.05em;'
      + 'opacity:0.5;margin-bottom:8px;">Upgrades</div>';

    if (sl === 0) {
      // Stufe 1 kaufen
      var canL1 = money >= UPGRADE_L1_COST;
      upgradesHTML += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
        + '<div>'
        + '<strong style="font-size:0.9rem;">⚡ Stufe 1</strong>'
        + '<span style="font-size:0.78rem;color:var(--rt-text-muted);margin-left:8px;">300k Kapazität möglich · 2k€/Mo</span>'
        + '</div>'
        + '<button class="rt-btn rt-btn--primary" id="rt-sf-upgrade-l1"'
        + ' style="font-size:0.85rem;padding:6px 14px;"'
        + (canL1 ? '' : ' disabled') + '>'
        + RT.ui.formatNumber(UPGRADE_L1_COST) + ' €'
        + '</button>'
        + '</div>';
    } else if (sl === 1) {
      upgradesHTML += '<p style="font-size:0.82rem;color:#27ae60;font-weight:700;margin:0 0 8px 0;">'
        + '✅ Stufe 1 installiert</p>';
      // Stufe 2 nur in Expansion-Phase
      if (s.phase === 'expansion') {
        var canL2 = money >= UPGRADE_L2_COST;
        upgradesHTML += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:8px;">'
          + '<div>'
          + '<strong style="font-size:0.9rem;">🚀 Stufe 2</strong>'
          + '<span style="font-size:0.78rem;color:var(--rt-text-muted);margin-left:8px;">800k Kapazität · 5k€/Mo (erweiterbar)</span>'
          + '</div>'
          + '<button class="rt-btn rt-btn--primary" id="rt-sf-upgrade-l2"'
          + ' style="font-size:0.85rem;padding:6px 14px;"'
          + (canL2 ? '' : ' disabled') + '>'
          + RT.ui.formatNumber(UPGRADE_L2_COST) + ' €'
          + '</button>'
          + '</div>';
      }
    } else {
      upgradesHTML += '<p style="font-size:0.82rem;color:#27ae60;font-weight:700;margin:0;">'
        + '✅ Stufe 2 installiert</p>';
    }

    upgradesHTML += '</div>';

    // ── Zusammenbauen ─────────────────────────────────────────────────────────
    var modalTitle = sl >= 2 ? '🏢 Rechenzentrum' : sl >= 1 ? '🛰️ Serverfarm' : '🛰️ Kleine Serverfarm';
    inner.innerHTML = ''
      + '<h2 class="rt-card__title" style="margin:0 0 10px 0;">' + modalTitle + '</h2>'
      + infoHTML
      + tierHTML
      + upgradesHTML
      + '<div class="rt-modal__actions" style="margin-top:14px;">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-sf-close">Schließen</button>'
      + '</div>';

    // ── Events ─────────────────────────────────────────────────────────────────
    inner.querySelector('#rt-sf-close').addEventListener('click', close);

    var minusBtn = inner.querySelector('#rt-sf-minus');
    var plusBtn  = inner.querySelector('#rt-sf-plus');
    if (minusBtn) minusBtn.addEventListener('click', function () {
      RT.state.dispatch('ADJUST_SERVERFARM_TIER', { slot: _curSlot, delta: -1 });
      render();
    });
    if (plusBtn) plusBtn.addEventListener('click', function () {
      RT.state.dispatch('ADJUST_SERVERFARM_TIER', { slot: _curSlot, delta: +1 });
      render();
    });

    var l1Btn = inner.querySelector('#rt-sf-upgrade-l1');
    if (l1Btn) l1Btn.addEventListener('click', function () {
      RT.state.dispatch('UPGRADE_SERVERFARM', { slot: _curSlot });
      render();
    });

    var l2Btn = inner.querySelector('#rt-sf-upgrade-l2');
    if (l2Btn) l2Btn.addEventListener('click', function () {
      RT.state.dispatch('UPGRADE_SERVERFARM_L2', { slot: _curSlot });
      render();
    });
  }

  RT.serverfarm = { open: open, close: close };
})(window.RT);
