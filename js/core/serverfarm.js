/* Server-Farm-Modal.
   Klick auf eine platzierte Farm öffnet Info + Upgrade + Worker-Zuweisung.
   Worker-Widget oben rechts (gleicher Pattern wie Werbeagentur).
   Unterer Bereich bleibt für spätere Upgrade-Stufen erhalten. */
(function (RT) {
  'use strict';

  var UPGRADE_COST   = 30000;
  var FULL_CAPACITY  = 300000;
  var BASE_CAPACITY  =  50000;

  var overlay  = null;
  var _curSlot = -1;

  // ── Overlay einmalig bauen ─────────────────────────────────────────────────
  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-sf-modal" id="rt-sf-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  // ── Öffnen ─────────────────────────────────────────────────────────────────
  function open(slot) {
    _curSlot = slot;
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  // ── Rendern ────────────────────────────────────────────────────────────────
  function render() {
    var inner = overlay.querySelector('#rt-sf-inner');
    if (!inner) return;

    var s   = RT.state.get();
    var farm = null;
    for (var i = 0; i < (s.buildings || []).length; i++) {
      if (s.buildings[i].slot === _curSlot && s.buildings[i].type === 'serverfarm') {
        farm = s.buildings[i]; break;
      }
    }
    if (!farm) { close(); return; }

    var upgraded       = !!farm.upgraded;
    var workerAssigned = !!farm.workerAssigned;
    var money          = s.resources.money || 0;
    var wkrs           = s.resources.workers || {};
    var freeWorkers    = (wkrs.max || 0) - (wkrs.occupied || 0);
    var canAfford      = money >= UPGRADE_COST;
    var canPlus        = !workerAssigned && freeWorkers >= 1;
    var canMinus       = workerAssigned;
    var effectiveCap   = (upgraded && workerAssigned) ? FULL_CAPACITY : BASE_CAPACITY;

    // ── Worker-Widget (nur wenn Upgrade vorhanden) ───────────────────────────
    var workerWidget = '';
    if (upgraded) {
      var wCount = workerAssigned ? 1 : 0;
      workerWidget = '<div style="display:flex;align-items:center;gap:6px;font-size:0.9em;flex-shrink:0;">'
        + '<span>👤</span>'
        + '<span><strong>' + wCount + '</strong> / 1</span>'
        + '<button class="rt-btn rt-btn--ghost" id="rt-sf-minus"'
        + ' style="padding:2px 8px;min-width:0;font-size:1em;line-height:1;"'
        + (canMinus ? '' : ' disabled') + '>−</button>'
        + '<button class="rt-btn rt-btn--ghost" id="rt-sf-plus"'
        + ' style="padding:2px 8px;min-width:0;font-size:1em;line-height:1;"'
        + (canPlus  ? '' : ' disabled') + '>+</button>'
        + '</div>';
    }

    // ── Beschreibung + Kapazitäts-Info ───────────────────────────────────────
    var infoHTML = '<p class="rt-tt-hint" style="margin-bottom:10px;">'
      + 'User-Verbindungen und laufende Software brauchen Server-Kapazität. '
      + 'Wird sie knapp, können keine neuen User mehr joinen.</p>'
      + '<p style="font-size:0.9rem;margin-bottom:' + (upgraded && !workerAssigned ? '8px' : '16px') + ';">'
      + '🛰️ Kapazität: <strong>' + RT.ui.formatNumber(effectiveCap) + ' Nutzer</strong>'
      + (upgraded && !workerAssigned
          ? ' <span style="color:var(--rt-text-muted);font-size:0.82em;">(max. '
            + RT.ui.formatNumber(FULL_CAPACITY) + ' mit Mitarbeiter)</span>'
          : '')
      + '</p>';

    // ── Hinweis nach erstem Upgrade (kein Mitarbeiter) ───────────────────────
    var hintHTML = '';
    if (upgraded && !workerAssigned) {
      hintHTML = '<p style="font-size:0.82rem;color:#d97706;background:rgba(251,191,36,0.15);'
        + 'border:1.5px solid #f59e0b;border-radius:8px;padding:7px 10px;margin-bottom:16px;">'
        + '💡 Weise einen Mitarbeiter zu — dann stehen dir die vollen '
        + RT.ui.formatNumber(FULL_CAPACITY) + ' Kapazität zur Verfügung!</p>';
    }

    // ── Unterer Bereich: Upgrades ────────────────────────────────────────────
    // Hier landen spätere Upgrade-Stufen. Erste Stufe: Basis-Upgrade.
    var upgradesHTML = '<div style="border-top:1px solid rgba(0,0,0,0.08);padding-top:12px;margin-top:0;">'
      + '<div style="font-size:0.7em;text-transform:uppercase;letter-spacing:.05em;'
      + 'opacity:0.5;margin-bottom:8px;">Upgrades</div>';

    if (!upgraded) {
      upgradesHTML += '<div style="display:flex;align-items:center;justify-content:space-between;'
        + 'gap:12px;flex-wrap:wrap;">'
        + '<div>'
        + '<strong style="font-size:0.9rem;">⚡ Stufe 1</strong>'
        + '<span style="font-size:0.78rem;color:var(--rt-text-muted);margin-left:8px;">'
        + RT.ui.formatNumber(FULL_CAPACITY) + ' Kapazität (mit Mitarbeiter)</span>'
        + '</div>'
        + '<button class="rt-btn rt-btn--primary" id="rt-sf-upgrade-btn"'
        + ' style="font-size:0.85rem;padding:6px 14px;"'
        + (canAfford ? '' : ' disabled') + '>'
        + RT.ui.formatNumber(UPGRADE_COST) + ' €'
        + '</button>'
        + '</div>';
    } else {
      upgradesHTML += '<p style="font-size:0.82rem;color:#27ae60;font-weight:700;margin:0;">'
        + '✅ Stufe 1 installiert</p>';
    }

    // Platz für spätere Upgrade-Stufen (momentan leer)
    upgradesHTML += '</div>';

    // ── Zusammenbauen ─────────────────────────────────────────────────────────
    inner.innerHTML = ''
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">'
      + '  <h2 class="rt-card__title" style="margin:0;">🛰️ Server-Farm</h2>'
      + workerWidget
      + '</div>'
      + infoHTML
      + hintHTML
      + upgradesHTML
      + '<div class="rt-modal__actions" style="margin-top:14px;">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-sf-close">Schließen</button>'
      + '</div>';

    // ── Events ─────────────────────────────────────────────────────────────────
    inner.querySelector('#rt-sf-close').addEventListener('click', close);

    var upgradeBtn = inner.querySelector('#rt-sf-upgrade-btn');
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function () {
        RT.state.dispatch('UPGRADE_SERVERFARM', { slot: _curSlot });
        render();
      });
    }

    var minusBtn = inner.querySelector('#rt-sf-minus');
    var plusBtn  = inner.querySelector('#rt-sf-plus');
    if (minusBtn) minusBtn.addEventListener('click', function () {
      RT.state.dispatch('ASSIGN_SERVERFARM_WORKER', { slot: _curSlot });
      render();
    });
    if (plusBtn)  plusBtn .addEventListener('click', function () {
      RT.state.dispatch('ASSIGN_SERVERFARM_WORKER', { slot: _curSlot });
      render();
    });
  }

  RT.serverfarm = { open: open, close: close };
})(window.RT);
