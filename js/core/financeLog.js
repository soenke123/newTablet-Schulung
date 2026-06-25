/* Finanz-Verlauf Modal - oeffnet sich per Klick auf den Geldbereich.
   Zeigt zwei ueberlagerte Flaechen-Charts (gruen = Einnahmen, rot = Ausgaben)
   und eine Zusammenfassung des aktuellen Monats inkl. Investor-Anteil in Phase 2. */
(function (RT) {
  'use strict';

  var overlay = null;
  var _unsub  = null;

  // -- Daten-Aggregation -------------------------------------------------------

  function aggregateByMonth(transactions) {
    var map = {};
    for (var i = 0; i < transactions.length; i++) {
      var t = transactions[i];
      if (t.label === 'Startkapital') continue;
      var m = t.month;
      if (!map[m]) map[m] = { income: 0, expenses: 0, marcus: 0 };
      if (t.delta > 0) {
        if (t.label === 'Rückerstattung') {
          map[m].expenses = Math.max(0, map[m].expenses - t.delta);
        } else {
          map[m].income += t.delta;
        }
      } else if (t.label === 'marcus') {
        map[m].marcus += Math.abs(t.delta);
      } else {
        map[m].expenses += Math.abs(t.delta);
      }
    }
    return map;
  }

  function getMonths(monthMap, currentMonth) {
    var start = Math.max(0, currentMonth - 11);
    var months = [];
    for (var m = start; m <= currentMonth; m++) months.push(m);
    return months;
  }

  // -- Chart-Zeichnung ---------------------------------------------------------

  function drawChart(canvas, monthMap, months) {
    var ctx = canvas.getContext('2d');
    var W   = canvas.width;
    var H   = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (months.length === 0) return;

    var maxVal = 1;
    for (var i = 0; i < months.length; i++) {
      var d = monthMap[months[i]] || { income: 0, expenses: 0, marcus: 0 };
      var totalExp = d.expenses + (d.marcus || 0);
      if (d.income > maxVal)  maxVal = d.income;
      if (totalExp > maxVal)  maxVal = totalExp;
    }

    var pL = 4, pR = 4, pT = 8, pB = 16;
    var cW = W - pL - pR;
    var cH = H - pT - pB;
    var stepW = cW / months.length;

    function xLeft(i)   { return pL + i * stepW; }
    function xRight(i)  { return pL + (i + 1) * stepW; }
    function xCenter(i) { return pL + (i + 0.5) * stepW; }
    function yOf(val)   { return pT + cH - (val / maxVal * cH); }

    function drawArea(color, fillColor, getter) {
      ctx.beginPath();
      ctx.moveTo(xLeft(0), H - pB);
      for (var j = 0; j < months.length; j++) {
        var y = yOf(getter(monthMap[months[j]] || { income: 0, expenses: 0, marcus: 0 }));
        ctx.lineTo(xLeft(j),  y);
        ctx.lineTo(xRight(j), y);
      }
      ctx.lineTo(xRight(months.length - 1), H - pB);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.beginPath();
      for (var k = 0; k < months.length; k++) {
        var yk = yOf(getter(monthMap[months[k]] || { income: 0, expenses: 0, marcus: 0 }));
        if (k === 0) ctx.moveTo(xLeft(k), yk);
        else         ctx.lineTo(xLeft(k), yk);
        ctx.lineTo(xRight(k), yk);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'miter';
      ctx.stroke();
    }

    // Gesamtausgaben (inkl. Investor) im Hintergrund, Einnahmen drueber
    drawArea('rgba(239,68,68,0.9)',  'rgba(239,68,68,0.15)',  function (d) { return d.expenses + (d.marcus || 0); });
    drawArea('rgba(34,197,94,0.9)',  'rgba(34,197,94,0.20)',  function (d) { return d.income; });

    ctx.fillStyle  = 'rgba(74,56,41,0.45)';
    ctx.font       = '9px system-ui, sans-serif';
    ctx.textAlign  = 'center';
    var step = months.length > 8 ? 2 : 1;
    for (var n = 0; n < months.length; n += step) {
      ctx.fillText('M' + months[n], xCenter(n), H - 3);
    }
  }

  // -- HTML-Aufbau -------------------------------------------------------------

  function fmt(n) {
    return Math.round(n).toLocaleString('de-DE');
  }

  function renderContent(inner) {
    var s      = RT.state.get();
    var txs    = s.transactions || [];
    var curMon = s.month;

    var monthMap = aggregateByMonth(txs);
    var months   = getMonths(monthMap, curMon);
    var lastData = monthMap[curMon] || { income: 0, expenses: 0, marcus: 0 };

    var showMarcus = s.phase === 'expansion';
    var marcusCut  = showMarcus ? (lastData.marcus || 0) : 0;
    var netProfit  = lastData.income - lastData.expenses - marcusCut;

    var marcusRow = showMarcus
      ? '<div class="rt-finance-row">'
          + '<span>Investor (15 %)</span>'
          + '<span class="rt-finance-neg">- ' + fmt(marcusCut) + ' €</span>'
          + '</div>'
      : '';

    inner.innerHTML = ''
      + '<div class="rt-finance-header">'
      +   '<h2 class="rt-finance-header__title">💰 Finanzverlauf</h2>'
      +   '<button class="rt-finance-close" id="rt-finance-close" title="Schlie\xDFen">✕</button>'
      + '</div>'
      + '<div class="rt-finance-body">'
      +   '<div class="rt-finance-chart-area">'
      +     '<canvas id="rt-finance-canvas" width="300" height="150"></canvas>'
      +     '<div class="rt-finance-legend">'
      +       '<span class="rt-finance-legend__item rt-finance-legend__item--income">Einnahmen</span>'
      +       '<span class="rt-finance-legend__item rt-finance-legend__item--expense">Ausgaben</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="rt-finance-summary">'
      +     '<div class="rt-finance-summary__title">Monat ' + curMon + '</div>'
      +     '<div class="rt-finance-row">'
      +       '<span>Einnahmen</span>'
      +       '<span class="rt-finance-pos">+ ' + fmt(lastData.income) + ' €</span>'
      +     '</div>'
      +     '<div class="rt-finance-row">'
      +       '<span>Ausgaben</span>'
      +       '<span class="rt-finance-neg">- ' + fmt(lastData.expenses) + ' €</span>'
      +     '</div>'
      +     marcusRow
      +     '<div class="rt-finance-divider"></div>'
      +     '<div class="rt-finance-row rt-finance-row--profit">'
      +       '<span>Gewinn</span>'
      +       '<span class="' + (netProfit >= 0 ? 'rt-finance-pos' : 'rt-finance-neg') + '">'
      +         (netProfit >= 0 ? '+' : '-') + ' ' + fmt(Math.abs(netProfit)) + ' €'
      +       '</span>'
      +     '</div>'
      +   '</div>'
      + '</div>';

    inner.querySelector('#rt-finance-close').addEventListener('click', close);

    setTimeout(function () {
      var canvas = inner.querySelector('#rt-finance-canvas');
      if (canvas) drawChart(canvas, monthMap, months);
    }, 0);
  }

  // -- Modal-Steuerung ---------------------------------------------------------

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-finance-modal" id="rt-finance-inner"></div>';
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    return el;
  }

  function open() {
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    renderContent(overlay.querySelector('#rt-finance-inner'));
    overlay.classList.add('is-open');

    if (!_unsub) {
      _unsub = RT.bus.on('month:advance', function () {
        if (overlay && overlay.classList.contains('is-open')) {
          setTimeout(function () {
            renderContent(overlay.querySelector('#rt-finance-inner'));
          }, 0);
        }
      });
    }
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
    if (_unsub)  { _unsub(); _unsub = null; }
  }

  RT.financeLog = { open: open, close: close };
})(window.RT);
