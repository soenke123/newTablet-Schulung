/* Wiederverwendbare UI-Helfer. Aktuell nur die Profile-Bar
   (runder Head + Name links, Plattform-Name + Logo rechts),
   die in allen In-Game-Screens oben prangt. */
(function (RT) {
  'use strict';

  // sparkHistory lebt jetzt im Redux-State (state.sparkHistory) — kein lokales Array mehr.

  function drawSparkline(canvas, data, colorBelow, colorAbove) {
    if (!canvas || !canvas.getContext) return;
    var W   = canvas.width  || 140;
    var H   = canvas.height || 56;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    if (!data || data.length < 2) {
      ctx.fillStyle = colorAbove;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    var min = data[0], max = data[0];
    for (var i = 1; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    var range = max - min;
    var pad   = 0.1;
    function toY(v) {
      if (range === 0) return H * 0.5;
      return H * (1 - pad) - ((v - min) / range) * H * (1 - 2 * pad);
    }
    var n = data.length, xs = [], ys = [];
    for (var j = 0; j < n; j++) {
      xs.push((j / (n - 1)) * W);
      ys.push(toY(data[j]));
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(xs[0], ys[0]);
    for (var k = 1; k < n; k++) ctx.lineTo(xs[k], ys[k]);
    ctx.lineTo(W, 0);
    ctx.closePath();
    ctx.fillStyle = colorAbove;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (var m = 1; m < n; m++) ctx.lineTo(xs[m], ys[m]);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = colorBelow;
    ctx.fill();
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function profileBarHTML(player) {
    player = player || {};
    var head     = RT.assets.avatarSrc(player.avatar, 'head');
    var logo     = RT.assets.logoSrcAuto(player.platformLogo);
    var name     = escapeHTML(player.name || '');
    var platform = escapeHTML(player.platformName || '');
    var isLive   = !!(RT.state && RT.state.get && RT.state.get().goLiveUnlocked);

    return ''
      + '<div class="rt-profile-bar">'
      + '  <div class="rt-profile-bar__player">'
      +      (head ? '<img class="rt-profile-bar__head" src="' + head + '" alt="">' : '')
      + '    <span class="rt-profile-bar__name">' + name + '</span>'
      + '  </div>'
      + '  <div class="rt-profile-bar__brand' + (isLive ? ' rt-profile-bar__brand--live' : '') + '">'
      + '    <div class="rt-profile-bar__brand-text">'
      + '      <span class="rt-profile-bar__platform">' + platform + '</span>'
      + '      <span class="rt-live-status"' + (isLive ? '' : ' style="display:none"') + '>'
      + '        <span class="rt-live-dot"></span>Online'
      + '      </span>'
      + '    </div>'
      +      (logo ? '<img class="rt-profile-bar__logo" src="' + logo + '" alt="">' : '')
      + '  </div>'
      + '</div>';
  }

  // === Resource-Bar (Geld, Nutzer, [Ruf,] Server, Mitarbeiter) =============
  // opts.withRep: true → fügt Ruf-Balken zwischen User und Server ein (nur campus).
  function resourceBarHTML(opts) {
    var withRep = opts && opts.withRep;
    return ''
      + '<div class="rt-resources' + (withRep ? ' rt-resources--with-rep' : '') + '">'
      + '  <div class="rt-resource rt-resource--chart">'
      + '    <canvas class="rt-sparkline" data-spark="money" width="140" height="56"></canvas>'
      + '    <span class="rt-resource__icon">🪙</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Geld</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="money">0</span> €</div>'
      + (withRep ? '      <span data-rt-res="moneyMonth" class="rt-resource__sublabel" style="display:none"></span>' : '')
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--chart">'
      + '    <canvas class="rt-sparkline" data-spark="users" width="140" height="56"></canvas>'
      + '    <span class="rt-resource__icon">👥</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">User</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="users">0</span></div>'
      + '    </div>'
      + '  </div>'
      + (withRep
        ? '  <div class="rt-resource rt-resource--rep">'
          + '    <div class="rt-resource__rep-inner">'
          + '      <div class="rt-resource__rep-header">'
          + '        <div class="rt-resource__label">Ruf</div>'
          + '        <span class="rt-rep-value" id="rt-rep-value">2,0%</span>'
          + '      </div>'
          + '      <div class="rt-rep-track">'
          + '        <div class="rt-rep-empty" id="rt-rep-empty"></div>'
          + '        <div class="rt-rep-marker"></div>'
          + '      </div>'
          + '    </div>'
          + '  </div>'
        : '')
      + '  <div class="rt-resource rt-resource--server">'
      + '    <span class="rt-resource__icon">🛰️</span>'
      + '    <div class="rt-resource__server-inner">'
      + '      <div class="rt-resource__server-header">'
      + '        <span class="rt-resource__label">Server</span>'
      + '        <span class="rt-resource__value rt-resource__server-val">'
      + '          <span data-rt-res="serverUsedTotal">0</span>/<span data-rt-res="serverCapacity">0</span>'
      + '        </span>'
      + '      </div>'
      + '      <div class="rt-server-bar" id="rt-server-bar">'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--sw" id="rt-server-seg-sw"></div>'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--usr" id="rt-server-seg-usr"></div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource">'
      + '    <div class="rt-team-dots-mini" id="rt-res-team-dots"></div>'
      + '    <div>'
      + '      <div class="rt-resource__label">Team</div>'
      + '      <div class="rt-resource__value">'
      + '        <span data-rt-res="workersTotal">0</span>/<span data-rt-res="workersMax">0</span>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + ' Mio';
    if (n >= 1000)    return (n / 1000).toFixed(1) + ' k';
    return String(n);
  }

  function bindResourceBar(container, opts) {
    var withRep = opts && opts.withRep;
    var refs = {
      money:           container.querySelector('[data-rt-res="money"]'),
      users:           container.querySelector('[data-rt-res="users"]'),
      moneyCanvas:     container.querySelector('[data-spark="money"]'),
      usersCanvas:     container.querySelector('[data-spark="users"]'),
      serverUsedTotal: container.querySelector('[data-rt-res="serverUsedTotal"]'),
      serverCapacity:  container.querySelector('[data-rt-res="serverCapacity"]'),
      serverSegSw:     container.querySelector('#rt-server-seg-sw'),
      serverSegUsr:    container.querySelector('#rt-server-seg-usr'),
      serverResource:  container.querySelector('.rt-resource--server'),
      workersTotal:    container.querySelector('[data-rt-res="workersTotal"]'),
      workersMax:      container.querySelector('[data-rt-res="workersMax"]'),
      teamDots:        container.querySelector('#rt-res-team-dots'),
      repResource:     withRep ? container.querySelector('.rt-resource--rep') : null,
      repEmpty:        withRep ? container.querySelector('#rt-rep-empty') : null,
      repValue:        withRep ? container.querySelector('#rt-rep-value') : null
    };

    var prev          = null;
    var pendingDeltas = {};
    var batchTimer    = null;

    function spawnDelta(el, delta) {
      if (!el || delta === 0) return;
      var valueEl = (el.classList && el.classList.contains('rt-resource__value')) ? el : el.parentElement;
      if (!valueEl) return;
      var sign = delta > 0 ? '+' : '-';
      var pop = document.createElement('span');
      pop.className = 'rt-delta-popup rt-delta-popup--' + (delta > 0 ? 'positive' : 'negative');
      pop.textContent = sign + formatNumber(Math.abs(delta));
      valueEl.appendChild(pop);
      setTimeout(function () {
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      }, 1400);
    }

    function flushDeltas() {
      batchTimer = null;
      if (pendingDeltas.money) spawnDelta(refs.money, pendingDeltas.money);
      if (pendingDeltas.users) spawnDelta(refs.users, pendingDeltas.users);
      if (pendingDeltas.total) spawnDelta(refs.serverUsedTotal, pendingDeltas.total);
      if (pendingDeltas.cap)   spawnDelta(refs.serverCapacity,  pendingDeltas.cap);
      pendingDeltas = {};
    }

    function refresh() {
      var r        = RT.state.get().resources || {};
      var money    = r.money                 || 0;
      var users    = r.users                 || 0;
      var swUsage  = r.serverSoftwareUsage   || 0;
      var usrUsage = r.serverUsage           || 0;
      var total    = swUsage + usrUsage;
      var cap      = r.serverCapacity        || 0;
      var wHired   = (r.workers && r.workers.max)      || 0;
      var wCap     = (r.workers && r.workers.capacity) || 0;
      var wOcc     = (r.workers && r.workers.occupied) || 0;

      if (prev !== null) {
        var dm = money - prev.money;
        var du = users - prev.users;
        var dt = total - prev.total;
        var dc = cap   - prev.cap;
        if (dm) pendingDeltas.money = (pendingDeltas.money || 0) + dm;
        if (du) pendingDeltas.users = (pendingDeltas.users || 0) + du;
        if (dt) pendingDeltas.total = (pendingDeltas.total || 0) + dt;
        if (dc) pendingDeltas.cap   = (pendingDeltas.cap   || 0) + dc;
        if (dm || du || dt || dc) {
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = setTimeout(flushDeltas, 60);
        }
      }
      prev = { money: money, users: users, total: total, cap: cap };

      if (refs.money)           refs.money.textContent           = formatNumber(money);
      if (refs.users)           refs.users.textContent           = formatNumber(users);
      if (refs.serverUsedTotal) refs.serverUsedTotal.textContent = formatNumber(total);
      if (refs.serverCapacity)  refs.serverCapacity.textContent  = formatNumber(cap);

      var swPct  = cap > 0 ? Math.min(100, swUsage  / cap * 100) : 0;
      var usrPct = cap > 0 ? Math.min(100, usrUsage / cap * 100) : 0;
      if (refs.serverSegSw)  refs.serverSegSw.style.width  = swPct.toFixed(2)  + '%';
      if (refs.serverSegUsr) refs.serverSegUsr.style.width = usrPct.toFixed(2) + '%';
      if (refs.serverResource) {
        var loadPct = cap > 0 ? total / cap : 0;
        refs.serverResource.classList.toggle('rt-resource--critical', loadPct >= 0.95);
      }
      if (refs.workersTotal)   refs.workersTotal.textContent   = wHired;
      if (refs.workersMax)     refs.workersMax.textContent     = wCap;
      if (refs.teamDots) {
        var html = '';
        for (var i = 0; i < wCap; i++) {
          var cls;
          if (i < wOcc)         cls = 'rt-team-dot--busy';
          else if (i < wHired)  cls = 'rt-team-dot--free';
          else                   cls = 'rt-team-dot--empty';
          html += '<span class="rt-team-dot ' + cls + '"></span>';
        }
        refs.teamDots.innerHTML = html;
      }
    }

    function refreshRep() {
      if (!refs.repEmpty) return;
      var rep = RT.state.get().reputation;
      if (typeof rep !== 'number') rep = 0.02;
      var barRep = Math.max(-0.02, rep);
      var t = (barRep + 0.02) / 0.06;  // 0 (barRep=-0.02) … 1 (barRep=0.04)
      refs.repEmpty.style.width = ((1 - t) * 100).toFixed(1) + '%';
      if (refs.repValue) {
        refs.repValue.textContent = (rep * 100).toFixed(2).replace('.', ',') + '%';
      }
      if (refs.repResource) {
        refs.repResource.classList.toggle('rt-resource--critical', rep < 0);
      }
    }

    function drawSparklines() {
      var sh = RT.state.get().sparkHistory || { money: [], users: [] };
      drawSparkline(refs.moneyCanvas, sh.money,
        'rgba(34,197,94,0.45)', 'rgba(34,197,94,0.10)');
      drawSparkline(refs.usersCanvas, sh.users,
        'rgba(59,130,246,0.45)', 'rgba(59,130,246,0.10)');
    }

    var moneyWrap = refs.moneyCanvas ? refs.moneyCanvas.parentElement : null;
    if (moneyWrap) {
      moneyWrap.style.cursor = 'pointer';
      moneyWrap.addEventListener('click', function () {
        if (RT.financeLog) RT.financeLog.open();
      });
    }

    var usersWrap = refs.usersCanvas ? refs.usersCanvas.parentElement : null;
    if (usersWrap) {
      usersWrap.style.cursor = 'pointer';
      usersWrap.addEventListener('click', function () {
        if (RT.userLog) RT.userLog.open();
      });
    }

    refresh();
    refreshRep();
    drawSparklines();

    var unsub      = RT.bus.on('resource:changed',    refresh);
    var unsubRep   = withRep ? RT.bus.on('reputation:changed', refreshRep) : null;
    var unsubSpark = RT.bus.on('month:advance', function () {
      setTimeout(function () {
        var r = RT.state.get().resources || {};
        RT.state.dispatch('UPDATE_SPARK_HISTORY', { money: r.money || 0, users: r.users || 0 });
        drawSparklines();
      }, 0);
    });
    return function () {
      unsub();
      if (unsubRep)   unsubRep();
      if (unsubSpark) unsubSpark();
      if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    };
  }

  function resetSparkHistory() {
    RT.state.dispatch('RESET_SPARK_HISTORY');
  }

  RT.ui = {
    escapeHTML:        escapeHTML,
    profileBarHTML:    profileBarHTML,
    resourceBarHTML:   resourceBarHTML,
    bindResourceBar:   bindResourceBar,
    formatNumber:      formatNumber,
    resetSparkHistory: resetSparkHistory
  };
})(window.RT);
