/* Shop-System — globales Modal, erreichbar per RT.shop.open().
   category:'hardware' → einmaliger Kauf via PURCHASE_ITEM.
   category:'building' → Geld abziehen + Platzier-Flow auf dem campus-Grid.
   category:'worker'   → Mitarbeiter einstellen (Bürogebäude Voraussetzung).
   Bereits vollständig gekaufte/gebaute Items rutschen ans Ende der jeweiligen Sektion. */
(function (RT) {
  'use strict';

  var PHASE_ORDER = { garage: 0, campus: 1, expansion: 2, end: 3 };

  var CATALOG = [
    // ── Hardware ─────────────────────────────────────────────────────────────
    {
      id: 'server1', name: 'Server', icon: '🖥️',
      price: 400, minPhase: 0, maxPhase: 0, category: 'hardware',
      desc: 'Hardware-Voraussetzung für Backend-Entwicklung'
    },
    {
      id: 'rechner', name: 'Rechner', icon: '💻',
      price: 600, minPhase: 0, maxPhase: 0, category: 'hardware',
      desc: 'Voraussetzung für Frontend-Entwicklung'
    },
    // ── Mitarbeiter ──────────────────────────────────────────────────────────
    {
      id: 'worker_jr', name: 'Teammate einstellen', icon: '👤',
      price: 0, minPhase: 1, category: 'worker',
      desc: '+1 Mitarbeiter · 2.000 €/Monat (du selbst bist kostenlos)'
    },
    // ── Gebäude (ab Campus-Phase) ────────────────────────────────────────────
    {
      id: 'buero', name: 'Bürogebäude', icon: '🏢',
      price: 8000, minPhase: 1, category: 'building', repeatable: true,
      desc: '+2 Arbeitsplätze · ermöglicht Mitarbeiter einstellen'
    },
    {
      id: 'serverfarm', name: 'Server-Farm', icon: '🛰️',
      price: 8000, minPhase: 1, category: 'building', repeatable: true,
      desc: '+50.000 Server-Kapazität'
    },
    {
      id: 'marketingstudio', name: 'Marketing-Studio', icon: '📣',
      price: 15000, minPhase: 1, category: 'building', repeatable: false,
      desc: 'Schaltet Marketing-Forschung frei'
    },
    {
      id: 'werbeagentur', name: 'Werbeagentur', icon: '📢',
      price: 15000, minPhase: 1, category: 'building', repeatable: false,
      desc: 'Werbeflächen verkaufen · Deal-Board freischalten'
    },
  ];

  var overlay     = null;
  var _targetSlot = null;   // Slot-Index wenn Shop per Leerfeld-Klick geöffnet wurde

  function open(targetSlot) {
    _targetSlot = (targetSlot !== undefined && targetSlot !== null) ? targetSlot : null;
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
    _targetSlot = null;
  }

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-shop-modal" id="rt-shop-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────
  function countPlaced(type, buildings) {
    var n = 0;
    for (var i = 0; i < buildings.length; i++) {
      if (buildings[i].type === type) n++;
    }
    return n;
  }

  function freeSlotsCount(buildings, phase) {
    var TOTAL = phase === 'expansion' ? 20 : 8;
    return TOTAL - 1 - buildings.length;
  }

  function hasBuero(buildings) {
    for (var i = 0; i < buildings.length; i++) {
      if (buildings[i].type === 'buero') return true;
    }
    return false;
  }

  // ── Zeilen-Renderer ────────────────────────────────────────────────────────
  function hardwareRow(item, s) {
    var bought = !!(s.purchases || {})[item.id];
    var afford = (s.resources.money || 0) >= item.price;
    var cls = 'rt-shop-item'
      + (bought            ? ' rt-shop-item--bought'  : '')
      + (!bought && !afford ? ' rt-shop-item--locked' : '');

    return '<div class="' + cls + '">'
      + '<span class="rt-shop-item__icon">' + item.icon + '</span>'
      + '<div class="rt-shop-item__body">'
      + '  <div class="rt-shop-item__name">' + RT.ui.escapeHTML(item.name) + '</div>'
      + '  <div class="rt-shop-item__desc">' + RT.ui.escapeHTML(item.desc) + '</div>'
      + '</div>'
      + '<div class="rt-shop-item__cta">'
      + (bought
          ? '<span class="rt-shop-item__badge">✓ Gekauft</span>'
          : '<button class="rt-btn rt-btn--primary rt-shop-buy-btn"'
            + ' data-id="' + item.id + '" data-price="' + item.price + '"'
            + (afford ? '' : ' disabled') + '>€' + item.price.toLocaleString('de-DE') + '</button>'
        )
      + '</div>'
      + '</div>';
  }

  function workerRow(item, s) {
    var workers = s.resources.workers || {};
    var hired   = workers.max      || 0;
    var cap     = workers.capacity || 0;
    var full    = hired >= cap;
    var paidNow = Math.max(0, hired - 1);

    var warningHTML = full
      ? '<p class="rt-shop-item__warning">Keine freien Plätze</p>'
      : '';

    var costHTML = paidNow > 0
      ? '<span class="rt-shop-worker-cost">aktuell: '
        + (paidNow * 2000).toLocaleString('de-DE') + ' €/Mon</span>'
      : '';

    var lbl = 'Einstellen (' + hired + '/' + cap + ')';

    return '<div class="rt-shop-item rt-shop-item--worker' + (full ? ' rt-shop-item--locked' : '') + '">'
      + '<span class="rt-shop-item__icon">' + item.icon + '</span>'
      + '<div class="rt-shop-item__body">'
      + '  <div class="rt-shop-item__name">' + RT.ui.escapeHTML(item.name) + '</div>'
      + warningHTML
      + '  <div class="rt-shop-item__desc">Du selbst: kostenlos · jeder weitere: 2.000 €/Mon</div>'
      + '</div>'
      + '<div class="rt-shop-item__cta rt-shop-item__cta--worker">'
      + '  <button class="rt-btn rt-btn--primary rt-shop-buy-btn"'
      + '    data-id="' + item.id + '" data-price="0"'
      + (full ? ' disabled' : '') + '>' + lbl + '</button>'
      + costHTML
      + '</div>'
      + '</div>';
  }

  function buildingRow(item, s) {
    var buildings = s.buildings || [];
    var pending   = s.pendingPlacement;
    var afford    = (s.resources.money || 0) >= item.price;
    var placed    = countPlaced(item.id, buildings);
    var freeSlots = freeSlotsCount(buildings, s.phase);
    var isDone    = !item.repeatable && placed > 0;

    var ctaHTML, extraCls = '';

    if (isDone) {
      ctaHTML  = '<span class="rt-shop-item__badge">✓ Gebaut</span>';
      extraCls = ' rt-shop-item--bought';
    } else if (pending) {
      ctaHTML  = '<button class="rt-btn" disabled>Wird platziert…</button>';
      extraCls = ' rt-shop-item--locked';
    } else if (freeSlots <= 0) {
      ctaHTML  = '<button class="rt-btn" disabled>Kein Platz</button>';
      extraCls = ' rt-shop-item--locked';
    } else if (!afford) {
      ctaHTML  = '<button class="rt-btn rt-btn--primary rt-shop-buy-btn" disabled'
        + ' data-id="' + item.id + '" data-price="' + item.price + '">'
        + '€' + item.price.toLocaleString('de-DE') + '</button>';
      extraCls = ' rt-shop-item--locked';
    } else {
      var btnLabel = item.repeatable && placed > 0
        ? '€' + item.price.toLocaleString('de-DE') + ' (' + placed + '×)'
        : '€' + item.price.toLocaleString('de-DE');
      ctaHTML = '<button class="rt-btn rt-btn--primary rt-shop-buy-btn"'
        + ' data-id="' + item.id + '" data-price="' + item.price + '">' + btnLabel + '</button>';
    }

    return '<div class="rt-shop-item' + extraCls + '">'
      + '<span class="rt-shop-item__icon">' + item.icon + '</span>'
      + '<div class="rt-shop-item__body">'
      + '  <div class="rt-shop-item__name">' + RT.ui.escapeHTML(item.name) + '</div>'
      + '  <div class="rt-shop-item__desc">' + RT.ui.escapeHTML(item.desc) + '</div>'
      + '</div>'
      + '<div class="rt-shop-item__cta">' + ctaHTML + '</div>'
      + '</div>';
  }

  // Sortiert: verfügbare Items zuerst, vollständig gekaufte/gebaute ans Ende.
  function isBoughtHardware(item, s) {
    return !!(s.purchases || {})[item.id];
  }
  function isBuiltUnique(item, s) {
    return !item.repeatable && countPlaced(item.id, s.buildings || []) > 0;
  }

  function render() {
    var inner    = overlay.querySelector('#rt-shop-inner');
    var s        = RT.state.get();
    var phaseIdx = PHASE_ORDER[s.phase] !== undefined ? PHASE_ORDER[s.phase] : 0;
    var money    = s.resources.money || 0;

    var visible   = CATALOG.filter(function (i) {
      return i.minPhase <= phaseIdx && (i.maxPhase === undefined || i.maxPhase >= phaseIdx);
    });
    var hardware  = visible.filter(function (i) { return i.category === 'hardware'; });
    var workers   = visible.filter(function (i) { return i.category === 'worker';   });
    var buildings = visible.filter(function (i) { return i.category === 'building'; });

    // Gekaufte Hardware ans Ende sortieren
    hardware.sort(function (a, b) {
      return (isBoughtHardware(a, s) ? 1 : 0) - (isBoughtHardware(b, s) ? 1 : 0);
    });
    // Gebaute einmalige Gebäude ans Ende sortieren
    buildings.sort(function (a, b) {
      return (isBuiltUnique(a, s) ? 1 : 0) - (isBuiltUnique(b, s) ? 1 : 0);
    });

    var hwHTML = hardware.map(function (i) { return hardwareRow(i, s); }).join('');
    var wkHTML = workers.map(function (i)  { return workerRow(i, s);   }).join('');
    var bdHTML = buildings.map(function (i) { return buildingRow(i, s); }).join('');

    inner.innerHTML = ''
      + '<h2 class="rt-card__title" style="margin-bottom:6px;">🛒 Shop</h2>'
      + '<p class="rt-shop-balance">Verfügbar: <strong>€' + money.toLocaleString('de-DE') + '</strong></p>'
      + (hwHTML ? '<p class="rt-shop-section-label">🔧 Hardware</p>'
                + '<div class="rt-shop-list">' + hwHTML + '</div>' : '')
      + (wkHTML ? '<p class="rt-shop-section-label">👤 Mitarbeiter</p>'
                + '<div class="rt-shop-list">' + wkHTML + '</div>' : '')
      + (bdHTML ? '<p class="rt-shop-section-label">🏢 Gebäude</p>'
                + '<div class="rt-shop-list">' + bdHTML + '</div>' : '')
      + '<div class="rt-modal__actions">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-shop-close">Schließen</button>'
      + '</div>';

    inner.querySelector('#rt-shop-close').addEventListener('click', close);
    inner.querySelectorAll('.rt-shop-buy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        buy(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-price'), 10));
      });
    });
  }

  // ── Kauf-Logik ─────────────────────────────────────────────────────────────
  function buy(itemId, price) {
    var s = RT.state.get();
    var item = null;
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === itemId) { item = CATALOG[i]; break; }
    }
    if (!item) return;
    if (price > 0 && (s.resources.money || 0) < price) return;

    if (item.category === 'worker') {
      var w = s.resources.workers;
      if ((w.max || 0) >= (w.capacity || 0)) return;
      RT.state.dispatch('SET_WORKERS', { max: (w.max || 0) + 1 });
      render();
      return;
    }

    if (item.category === 'building') {
      var buildings = s.buildings || [];
      if (!item.repeatable && countPlaced(itemId, buildings) > 0) return;
      if (freeSlotsCount(buildings, s.phase) <= 0) return;
      RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -price, label: item.name + ' bauen' });
      if (_targetSlot !== null) {
        var slot = _targetSlot;
        _targetSlot = null;
        RT.state.dispatch('PLACE_BUILDING', { type: itemId, slot: slot });
      } else {
        RT.state.dispatch('SET_PENDING_PLACEMENT', { type: itemId });
      }
      close();
      return;
    }

    // Hardware
    RT.state.dispatch('PURCHASE_ITEM', { itemId: itemId, cost: price, label: item.name + ' kaufen' });
    if (item.onBuy) item.onBuy();
    render();
  }

  RT.shop = { open: open, close: close, CATALOG: CATALOG };
})(window.RT);
