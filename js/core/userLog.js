/* User-Zuwachs Modal - oeffnet sich per Klick auf den User-Bereich.
   Zeigt ein gestapeltes Balkendiagramm des monatlichen Nutzerzuwachses
   (gruen = Ruf, blau = Kampagnen) sowie die aktuelle Aufschluesselung. */
(function (RT) {
  'use strict';

  var overlay = null;
  var _unsub  = null;

  // -- Hilfsfunktionen -------------------------------------------------------

  function fmt(n) {
    var abs = Math.abs(Math.round(n));
    var str;
    if (abs >= 1000000) str = (abs / 1000000).toFixed(1) + ' Mio';
    else if (abs >= 1000) str = (abs / 1000).toFixed(1) + 'k';
    else str = String(abs);
    return (n < 0 ? '-' : '') + str;
  }

  function totalCampBonus(users) {
    var s = RT.state.get();
    var camps = s.campaigns || [];
    var mkDefs = (RT.marketing && RT.marketing.CAMPAIGNS) || [];
    var total = 0;
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      if (c.phase !== 'running' && c.phase !== 'nachhall') continue;
      var def = null;
      for (var j = 0; j < mkDefs.length; j++) {
        if (mkDefs[j].id === c.type) { def = mkDefs[j]; break; }
      }
      if (!def) continue;
      var isNH  = c.phase === 'nachhall' && def.nachhall;
      var eType = isNH ? def.nachhall.effectType  : def.effectType;
      var eVal  = isNH ? def.nachhall.effectValue : def.effectValue;
      if (eType === 'users_per_month')  total += eVal;
      else if (eType === 'users_percent') total += Math.floor(users * eVal);
    }
    return total;
  }

  // -- Balkendiagramm --------------------------------------------------------
  // Jede Spalte = ein Monat. Stapel: Rep (gruen/rot) + Kampagnen (blau).
  // Rep-Anteil wird aus aktuellem rep-Wert + historischer Userzahl geschaetzt.

  function drawChart(canvas, history, repRate) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width;
    var H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!history || history.length < 2) {
      ctx.fillStyle = 'rgba(74,56,41,0.2)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Noch keine Daten', W / 2, H / 2);
      return;
    }

    // Deltas berechnen
    var bars = [];
    for (var i = 0; i + 1 < history.length; i++) {
      var total    = history[i + 1] - history[i];
      var repEst   = Math.round(history[i] * repRate);
      var campEst  = total - repEst;
      // Wenn die Schatzung unplausibel ist (z.B. rep war fruher anders),
      // alles dem rep zuschlagen und camp auf 0 setzen.
      if (campEst < 0) { repEst = total; campEst = 0; }
      bars.push({ rep: repEst, camp: campEst });
    }

    var n = bars.length;

    // Skalierung: max positiver Wert, max negativer Wert
    var maxPos = 0, maxNeg = 0;
    for (var k = 0; k < bars.length; k++) {
      var pos = Math.max(0, bars[k].rep) + bars[k].camp;
      var neg = Math.max(0, -(bars[k].rep));
      if (pos > maxPos) maxPos = pos;
      if (neg > maxNeg) maxNeg = neg;
    }
    if (maxPos === 0 && maxNeg === 0) maxPos = 1;

    var pL = 4, pR = 4, pT = 8, pB = 16;
    var cW = W - pL - pR;
    var cH = H - pT - pB;
    var hasNeg = maxNeg > 0;

    // Nulllinie aufteilen: 70 % positiv, 30 % negativ (oder alles positiv)
    var posH = hasNeg ? cH * 0.70 : cH;
    var negH = hasNeg ? cH * 0.30 : 0;
    var zeroY = pT + posH;

    function yPos(v) { return zeroY - (maxPos > 0 ? (v / maxPos) * posH : 0); }
    function yNeg(v) { return zeroY + (maxNeg > 0 ? (v / maxNeg) * negH : 0); }

    // Nulllinie
    ctx.beginPath();
    ctx.moveTo(pL, zeroY);
    ctx.lineTo(W - pR, zeroY);
    ctx.strokeStyle = 'rgba(74,56,41,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    var barW = cW / n;
    var gap  = Math.max(1, Math.min(3, barW * 0.2));
    var bW   = barW - gap;

    for (var b = 0; b < n; b++) {
      var bar = bars[b];
      var x   = pL + b * barW + gap / 2;

      if (bar.rep >= 0) {
        // Ruf-Segment (gruen, ab Nulllinie aufwaerts)
        var rH = yPos(0) - yPos(bar.rep);
        if (rH > 0) {
          ctx.fillStyle = 'rgba(34,197,94,0.80)';
          ctx.fillRect(x, zeroY - rH, bW, rH);
        }
        // Kampagnen-Segment (blau, darüber gestapelt)
        var cH2 = yPos(0) - yPos(bar.camp);
        if (cH2 > 0) {
          ctx.fillStyle = 'rgba(59,130,246,0.80)';
          ctx.fillRect(x, zeroY - rH - cH2, bW, cH2);
        }
      } else {
        // Ruf negativ: rotes Segment abwärts
        var rNegH = yNeg(Math.abs(bar.rep)) - yNeg(0);
        if (rNegH > 0) {
          ctx.fillStyle = 'rgba(239,68,68,0.80)';
          ctx.fillRect(x, zeroY, bW, rNegH);
        }
        // Kampagnen trotzdem aufwärts (blau)
        if (bar.camp > 0) {
          var cPosH = yPos(0) - yPos(bar.camp);
          if (cPosH > 0) {
            ctx.fillStyle = 'rgba(59,130,246,0.80)';
            ctx.fillRect(x, zeroY - cPosH, bW, cPosH);
          }
        }
      }
    }

    // Monatsbeschriftung
    ctx.fillStyle = 'rgba(74,56,41,0.45)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    var s = RT.state.get();
    var startM = s.month - n;
    var step = n > 8 ? 2 : 1;
    for (var m = 0; m < n; m += step) {
      ctx.fillText('M' + (startM + m + 1), pL + (m + 0.5) * barW, H - 3);
    }
  }

  // -- Render ----------------------------------------------------------------

  function renderContent(inner) {
    var s       = RT.state.get();
    var history = (s.sparkHistory && s.sparkHistory.users) || [];
    var users   = (s.resources && s.resources.users) || 0;
    var rep     = typeof s.reputation === 'number' ? s.reputation : 0.02;
    var repStr  = (rep * 100).toFixed(2).replace('.', ',') + '%';
    var repDelta = Math.round(users * rep);
    var campBonus = totalCampBonus(users);
    var totalGrowth = repDelta + campBonus;

    var repSign  = repDelta  >= 0 ? '+' : '';
    var campSign = campBonus >= 0 ? '+' : '';
    var totSign  = totalGrowth >= 0 ? '+' : '';

    var repCls  = repDelta  >= 0 ? 'rt-finance-pos' : 'rt-finance-neg';
    var totCls  = totalGrowth >= 0 ? 'rt-finance-pos' : 'rt-finance-neg';

    var serverUsage = (s.resources.serverUsage || 0) + (s.resources.serverSoftwareUsage || 0);
    var serverCap   = s.resources.serverCapacity || 0;
    var serverFull  = serverCap > 0 && serverUsage >= serverCap;

    var campsHTML = campBonus > 0
      ? '<div class="rt-finance-row"><span>Werbe&shy;kampagnen</span><span class="rt-finance-pos">'
          + campSign + fmt(campBonus) + '</span></div>'
      : '<div class="rt-finance-row"><span>Werbe&shy;kampagnen</span><span class="rt-ul-none">–</span></div>';

    inner.innerHTML = ''
      + '<div class="rt-finance-header">'
      +   '<h2 class="rt-finance-header__title">👥 User-Zuwachs</h2>'
      +   '<button class="rt-finance-close" id="rt-ul-close" title="Schlie\xDFen">✕</button>'
      + '</div>'
      + '<div class="rt-finance-body">'
      +   '<div class="rt-finance-chart-area">'
      +     '<canvas id="rt-ul-canvas" width="300" height="150"></canvas>'
      +     '<div class="rt-finance-legend">'
      +       '<span class="rt-finance-legend__item rt-ul-legend--rep">Ruf</span>'
      +       '<span class="rt-finance-legend__item rt-ul-legend--camp">Kampagnen</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="rt-finance-summary">'
      +     '<div class="rt-finance-summary__title">Monat ' + s.month + '</div>'
      +     '<div class="rt-finance-row">'
      +       '<span>Ruf (' + repStr + ')</span>'
      +       '<span class="' + repCls + '">' + repSign + fmt(repDelta) + '</span>'
      +     '</div>'
      +     campsHTML
      +     '<div class="rt-finance-divider"></div>'
      +     '<div class="rt-finance-row rt-finance-row--profit">'
      +       '<span>Zuwachs / Mon</span>'
      +       '<span class="' + totCls + '">' + totSign + fmt(totalGrowth) + '</span>'
      +     '</div>'
      +     (serverFull
          ? '<div class="rt-ul-server-warning">⚠️ Serverkapazität erreicht – keine neuen User können sich registrieren</div>'
          : '')
      +   '</div>'
      + '</div>';

    inner.querySelector('#rt-ul-close').addEventListener('click', close);

    setTimeout(function () {
      var canvas = inner.querySelector('#rt-ul-canvas');
      if (canvas) drawChart(canvas, history, rep);
    }, 0);
  }

  // -- Modal -----------------------------------------------------------------

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-finance-modal" id="rt-ul-inner"></div>';
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    return el;
  }

  function open() {
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    renderContent(overlay.querySelector('#rt-ul-inner'));
    overlay.classList.add('is-open');

    if (!_unsub) {
      _unsub = RT.bus.on('month:advance', function () {
        if (overlay && overlay.classList.contains('is-open')) {
          setTimeout(function () { renderContent(overlay.querySelector('#rt-ul-inner')); }, 0);
        }
      });
    }
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
    if (_unsub)  { _unsub(); _unsub = null; }
  }

  RT.userLog = { open: open, close: close };
})(window.RT);
