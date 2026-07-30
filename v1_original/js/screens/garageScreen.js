/* Garage – Phase 0 Solo-Werkstatt.
   Ressourcen, Team-Punkte, Fortschrittsbalken über dem HQ-Gebäude.
   Klick auf HQ → Tech Tree (oder Feiern wenn etwas fertig ist).
   Klick auf „Plattform online stellen" (erscheint wenn alle 5 Dev-Nodes fertig sind)
   → Glückwunsch-Modal mit Charakter, dann bleibt man in Phase 0 mit neuen Techtree-Reitern. */
(function (RT) {
  'use strict';

  var PHASE0_IDS = ['frontend1', 'backend1', 'account', 'feed', 'bilder'];

  var unsubResources       = null;
  var _clockProg           = 0;
  var _offTick             = null;
  var _offComplete         = null;
  var _offMonthAdvance     = null;
  var _offTabSeen          = null;
  var _investorTriggered   = false;
  var _hqBadgeDismissed    = false;
  var _shopBadgeDismissed  = false;
  var _onShopBadgeClick    = null;

  function ensureStartingResources() {
    if (RT.state.get().meta.gameStarted) return;
    RT.ui.resetSparkHistory();
    RT.state.dispatch('SET_RESOURCE', { key: 'money',          value: 1000 });
    RT.state.dispatch('SET_RESOURCE', { key: 'users',          value: 0    });
    RT.state.dispatch('SET_RESOURCE', { key: 'serverCapacity', value: 3000 });
    RT.state.dispatch('SET_RESOURCE', { key: 'serverUsage',         value: 0 });
    RT.state.dispatch('SET_RESOURCE', { key: 'serverSoftwareUsage', value: 0 });
    RT.state.dispatch('SET_WORKERS',  { occupied: 0, max: 1, capacity: 1 });
    RT.state.dispatch('GAME_STARTED');
  }

  function allPhase0Done() {
    var tt = RT.state.get().techtree || {};
    for (var i = 0; i < PHASE0_IDS.length; i++) {
      if (tt[PHASE0_IDS[i]] !== 'done') return false;
    }
    return true;
  }

  // Gibt den ersten laufenden Node im HQ zurück (buildingGridSlot === 0).
  function getInProgressNode() {
    var tt = RT.state.get().techtree || {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (entry && typeof entry === 'object' && entry.status === 'in_progress') {
        var bgs = entry.buildingGridSlot !== undefined ? entry.buildingGridSlot : 0;
        if (bgs === 0) return { nodeId: nid, entry: entry };
      }
    }
    return null;
  }

  // ── Fortschrittsbalken über dem HQ ──────────────────────────────────────
  function updateProgressBar() {
    var wrap    = document.getElementById('rt-hq-progress-wrap');
    var bar     = document.getElementById('rt-hq-progress-bar');
    var lbl     = document.getElementById('rt-hq-progress-label');
    var name    = document.getElementById('rt-hq-progress-name');
    var icon    = document.getElementById('rt-hq-progress-icon');
    var hqLabel = document.getElementById('rt-hq-label');
    if (!wrap || !bar) return;

    if (hqLabel) hqLabel.textContent = 'Tech Tree öffnen';

    var s = RT.state.get();

    // Pending Celebration → voller Balken pulsiert, Klick zum Feiern (nur HQ-Nodes)
    var hasHqCelebration = (s.pendingCelebrations || []).some(function (c) {
      return (typeof c === 'object' ? c.buildingGridSlot : 0) === 0;
    });
    if (hasHqCelebration) {
      wrap.classList.remove('rt-hq-progress--idle');
      wrap.classList.add('rt-hq-progress--done');
      bar.style.width = '100%';
      if (icon) icon.innerHTML = '';
      if (name) name.textContent = '';
      if (lbl)  lbl.textContent  = '🎉 Klicken!';
      return;
    }

    var inProg = getInProgressNode();
    if (!inProg) {
      wrap.classList.add('rt-hq-progress--idle');
      wrap.classList.remove('rt-hq-progress--done');
      bar.style.width = '0%';
      if (icon) icon.innerHTML = '';
      if (name) name.textContent = '';
      if (lbl)  lbl.textContent  = '';
      return;
    }

    var node = RT.techtree.getNode(inProg.nodeId);
    if (!node) {
      wrap.classList.add('rt-hq-progress--idle');
      wrap.classList.remove('rt-hq-progress--done');
      return;
    }

    var elapsed = (s.month + _clockProg) - inProg.entry.startMonthFull;
    var prog    = Math.min(1, elapsed / node.months);

    wrap.classList.remove('rt-hq-progress--idle', 'rt-hq-progress--done');
    if (icon) icon.innerHTML = node.icon || '';
    if (name) name.textContent = node.name;
    bar.style.width = (prog * 100).toFixed(1) + '%';
    if (lbl)  lbl.textContent  = prog >= 1 ? 'Gleich fertig!' : Math.round(prog * 100) + '%';
  }

  // ── HQ-Neu-Badge + Shop-Badge ein-/ausblenden ───────────────────────────
  function updateHqBadge() {
    var s = RT.state.get();
    var badge = document.getElementById('rt-hq-new-badge');
    if (badge) {
      var hasNew;
      if (!s.goLiveUnlocked) {
        hasNew = !_hqBadgeDismissed;
      } else {
        hasNew = (!(s.meta && s.meta.seenTabMarketing) || !(s.meta && s.meta.seenTabWerbung));
      }
      badge.style.display = hasNew ? '' : 'none';
    }
    var shopBadge = document.getElementById('rt-shop-badge');
    if (shopBadge) {
      shopBadge.style.display = (!s.goLiveUnlocked && !_shopBadgeDismissed) ? '' : 'none';
    }
  }

  // ── Online-Button ein-/ausblenden ────────────────────────────────────────
  function updateOnlineButton() {
    var btn = document.getElementById('rt-online');
    if (!btn) return;
    var s = RT.state.get();
    if (s.goLiveUnlocked) {
      btn.style.display = 'none';
    } else if (allPhase0Done() && (!s.pendingCelebrations || s.pendingCelebrations.length === 0)) {
      btn.style.display = '';
      btn.classList.add('rt-btn--blink');
    } else {
      btn.style.display = 'none';
    }
  }

  // ── HQ-Klick ────────────────────────────────────────────────────────────
  // Nur noch Techtree öffnen. Pending Celebrations werden direkt in der
  // Slot-Sidebar geklickt.
  function onHqClick() {
    _hqBadgeDismissed = true;
    updateHqBadge();
    RT.techtree.open();
  }

  // ── Konfetti ─────────────────────────────────────────────────────────────
  function spawnConfetti() {
    var colors = ['#FFD700','#FF6B6B','#4ECDC4','#96CEB4','#FFEAA7','#DDA0DD','#87CEEB','#FF9F43'];
    for (var i = 0; i < 64; i++) {
      (function () {
        var piece = document.createElement('div');
        piece.className = 'rt-confetti-piece';
        piece.style.cssText =
          'left:'               + (Math.random() * 100)         + 'vw;'  +
          'background:'         + colors[Math.floor(Math.random() * colors.length)] + ';' +
          'animation-delay:'    + (Math.random() * 0.5)         + 's;'   +
          'animation-duration:' + (0.9 + Math.random() * 0.9)  + 's;'   +
          'width:'              + (6 + Math.random() * 8)       + 'px;'  +
          'height:'             + (6 + Math.random() * 8)       + 'px;'  +
          'border-radius:'      + (Math.random() > 0.5 ? '50%' : '2px') + ';';
        document.body.appendChild(piece);
        setTimeout(function () {
          if (piece.parentNode) piece.parentNode.removeChild(piece);
        }, 2500);
      }());
    }
  }

  // ── Feier-Modal (einzelner Node) ─────────────────────────────────────────
  function showCelebration(nodeId) {
    var node = RT.techtree.getNode(nodeId);
    if (!node) {
      RT.state.dispatch('CELEBRATE_NODE', { nodeId: nodeId });
      updateProgressBar();
      updateOnlineButton();
      return;
    }

    // Boni sofort beim "Klicken!"-Tap vergeben
    if (node.usersBonus)  RT.state.dispatch('ADD_RESOURCE',    { key: 'users', delta: node.usersBonus  });
    if (node.moneyBonus)  RT.state.dispatch('ADD_RESOURCE',    { key: 'money', delta: node.moneyBonus  });
    if (node.growthBonus) RT.state.dispatch('ADD_GROWTH_RATE', { delta: node.growthBonus });
    if (node.rufBonus)    RT.state.dispatch('ADD_REPUTATION',  { delta: node.rufBonus    });

    spawnConfetti();

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-celebration-modal">'
      + '  <div class="rt-celebration-icon">' + node.icon + '</div>'
      + '  <h2 class="rt-celebration-title">🎉 Geschafft!</h2>'
      + '  <p class="rt-celebration-name">' + RT.ui.escapeHTML(node.name) + ' entwickelt!</p>'
      + '  <p class="rt-celebration-fx">' + RT.ui.escapeHTML(node.effectFull) + '</p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary" id="rt-celebrate-ok">Super! 🚀</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-celebrate-ok').addEventListener('click', function () {
      RT.state.dispatch('CELEBRATE_NODE', { nodeId: nodeId });
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      updateProgressBar();
      updateOnlineButton();
    });
  }

  // ── Monatliches User-Wachstum + Investor-Milestone ──────────────────────
  function applyMonthlyGrowth() {
    var s    = RT.state.get();
    var rate = s.userGrowthRate || 0;
    if (rate <= 0) return;
    var users = s.resources.users || 0;
    var delta = Math.max(1, Math.floor(users * rate));
    RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: delta });
    if (!_investorTriggered && (RT.state.get().resources.users || 0) >= 1000) {
      _investorTriggered = true;
      setTimeout(showInvestorModal, 500);
    }
  }

  // ── Investor-Modal (2 Seiten) ────────────────────────────────────────────
  function showInvestorModal() {
    var s    = RT.state.get();
    var name = RT.ui.escapeHTML(s.player.name || 'du');

    spawnConfetti();
    RT.clock.pause();

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-investor-modal">'
      + '  <div id="rt-investor-p1">'
      + '    <img class="rt-investor-modal__bear" src="sprites/Investor.png" alt="Investor">'
      + '    <h2 class="rt-investor-modal__headline">Du hast mich beeindruckt, ' + name + '! 🐻</h2>'
      + '    <p class="rt-investor-modal__quote">'
      + '      &bdquo;Ich beobachte deine Plattform seit Wochen &mdash; und ich bin ehrlich gesagt'
      + '      begeistert. &Uuml;ber <strong>1.000 User aus Kiel S&uuml;dfriedhof</strong>!'
      + '      Das ganze Viertel redet &uuml;ber dich. Du hast eine echte Gabe,'
      + '      Menschen zu begeistern. Ich will dabei sein, wenn das gro&szlig; wird.&ldquo;'
      + '    </p>'
      + '    <p class="rt-investor-modal__sig">&mdash; Marcus B&auml;r, Investor</p>'
      + '    <div class="rt-modal__actions">'
      + '      <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-investor-next">Was schl&auml;gst du vor? &rarr;</button>'
      + '    </div>'
      + '  </div>'
      + '  <div id="rt-investor-p2" style="display:none">'
      + '    <div class="rt-investor-modal__body">'
      + '      <img class="rt-investor-modal__bear rt-investor-modal__bear--sm" src="sprites/Investor.png" alt="Investor">'
      + '      <div class="rt-investor-modal__right">'
      + '        <p class="rt-investor-modal__truth">'
      + '          &bdquo;Ich glaube an dein Potenzial &mdash; deshalb will ich einsteigen.'
      + '          Nicht nur mit Geld, sondern mit meiner Zeit und meinem Netzwerk.'
      + '          Ich gebe dir alles, was du jetzt brauchst.&ldquo;'
      + '        </p>'
      + '        <div class="rt-investor-modal__deal">'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--win">'
      + '            <span>💰 Investment</span>'
      + '            <span><strong>+50.000 €</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--win">'
      + '            <span>🔨 Umbau</span>'
      + '            <span><strong>Renovierte Garage</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row">'
      + '            <span>🤝 Sein Anteil</span>'
      + '            <span><strong>15 % der Firmenanteile</strong></span>'
      + '          </div>'
      + '        </div>'
      + '        <p class="rt-investor-modal__whisper">'
      + '          &bdquo;Und keine Sorge &mdash; ich will erstmal kein Geld zur&uuml;ck sehen.'
      + '          Alles bleibt in der Firma, alles wird reinvestiert. Aussch&uuml;ttungen?'
      + '          Das besprechen wir, wenn ihr wirklich gro&szlig; seid.'
      + '          Sagen wir &hellip; bei 500.000 Usern.&ldquo;'
      + '        </p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="rt-modal__actions">'
      + '      <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-investor-confirm">Deal! 🤝</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-investor-next').addEventListener('click', function () {
      document.getElementById('rt-investor-p1').style.display = 'none';
      document.getElementById('rt-investor-p2').style.display = '';
    });

    modal.querySelector('#rt-investor-confirm').addEventListener('click', function () {
      RT.state.dispatch('SET_GROWTH_RATE', { value: 0 });
      RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: 50000, label: 'Startkapital' });
      RT.state.dispatch('ADD_RESOURCE', { key: 'serverCapacity', delta: 7000 });
      RT.state.dispatch('SET_WORKERS', { capacity: 2, max: 1 });
      // Ruf: mindestens 2 % zu Beginn der Campus-Phase sicherstellen.
      // Nodes in der Garage-Phase können rufBonus geben — ggf. ist der Wert bereits höher.
      var curRep = RT.state.get().reputation;
      if (typeof curRep !== 'number' || curRep < 0.02) {
        RT.state.dispatch('SET_REPUTATION', { value: 0.02 });
      }
      RT.state.dispatch('SET_PHASE', { phase: 'campus' });
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      RT.clock.resume();
      RT.screens.show('campus');
    });
  }

  var MONTHS_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  function fmtGoLiveDate(totalMonths) {
    var y = 2026 + Math.floor(totalMonths / 12);
    var m = totalMonths % 12;
    return MONTHS_FULL[m] + ' ' + y;
  }

  // ── Go-Live-Modal (Info-Seite nach der Launch-Sequenz) ──────────────────
  function showGoLiveModal() {
    var s      = RT.state.get();
    var player = s.player;
    var avatarSrc = RT.assets.avatarSrc(player.avatar, 'body');
    var name    = RT.ui.escapeHTML(player.name || 'du');
    var dateStr = fmtGoLiveDate(s.month);

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-golive-modal">'
      + '  <div class="rt-golive-modal__date">🗓️ ' + dateStr + '</div>'
      + '  <div class="rt-golive-modal__body">'
      + '    <div class="rt-golive-modal__left">'
      + '      <img class="rt-golive-modal__avatar" src="' + avatarSrc + '" alt="' + name + '">'
      + '      <h2 class="rt-golive-modal__title">Hey, ' + name + '! 🎉</h2>'
      + '      <p class="rt-golive-modal__sub">Du hast eine <strong>solide technische Basis</strong> gebaut — ein riesiger Schritt!</p>'
      + '    </div>'
      + '    <div class="rt-golive-modal__right">'
      + '      <div class="rt-golive-modal__news-box">'
      + '        <div class="rt-golive-modal__news-title">🆕 Was jetzt neu ist</div>'
      + '        <p style="margin-bottom:var(--rt-space-2);">Im <strong>Tech Tree</strong> gibt es jetzt zwei neue Bereiche:</p>'
      + '        <ul class="rt-golive-modal__list">'
      + '          <li><strong>📣 Werbung</strong> — Flyer verteilen, Social-Media-Posts und mehr</li>'
      + '          <li><strong>📢 Marketing</strong> — Freunde fragen und Mundpropaganda nutzen</li>'
      + '        </ul>'
      + '        <p class="rt-golive-modal__task">🎯 <strong>Deine Aufgabe:</strong> Hol deine ersten User! Flyer und Freunde fragen geben dir einen einmaligen User-Boost.</p>'
      + '        <p class="rt-golive-modal__task">🏆 <strong>Nächstes Ziel:</strong> Erreich <strong class="rt-golive-modal__goal">1.000 User</strong> — dann schaltest du den nächsten Meilenstein frei.</p>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-golive-ok">Los geht\'s! 🚀</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-golive-ok').addEventListener('click', function () {
      RT.state.dispatch('SET_GOLIVE_UNLOCKED');
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      RT.clock.resume();
      var brand = document.querySelector('.rt-profile-bar__brand');
      if (brand) brand.classList.add('rt-profile-bar__brand--live');
      var liveStatus = document.querySelector('.rt-live-status');
      if (liveStatus) liveStatus.style.display = '';
      updateOnlineButton();
      updateHqBadge();
    });
  }

  // ── Launch-Sequenz (Terminal-Intro → dann Go-Live-Modal) ─────────────────
  function showLaunchSequence() {
    var s           = RT.state.get();
    var platformRaw = s.player.platformName || 'Deine Plattform';

    RT.clock.pause();

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-launch-screen">'
      + '  <div class="rt-launch-terminal">'
      + '    <div class="rt-launch-terminal__bar">'
      + '      <span class="rt-launch-terminal__dot"></span>'
      + '      <span class="rt-launch-terminal__dot"></span>'
      + '      <span class="rt-launch-terminal__dot"></span>'
      + '      <span class="rt-launch-terminal__title">startup-deploy v1.0</span>'
      + '    </div>'
      + '    <div class="rt-launch-console" id="rt-launch-console"></div>'
      + '    <div class="rt-launch-bar-wrap">'
      + '      <div class="rt-launch-bar" id="rt-launch-bar"></div>'
      + '    </div>'
      + '    <div class="rt-launch-footer" id="rt-launch-footer" style="display:none">'
      + '      <button class="rt-btn rt-btn--primary" id="rt-launch-weiter">Weiter →</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(overlay);

    var LINES = [
      { text: '> Verbindung wird aufgebaut...', type: 'info',    bar: 15 },
      { text: '> Server werden gestartet...',   type: 'info',    bar: 32 },
      { text: '> Datenbank initialisiert.',      type: 'info',    bar: 52 },
      { text: '> SSL-Zertifikat aktiviert.',     type: 'info',    bar: 70 },
      { text: '> Connecting... Success.',        type: 'success', bar: 85 },
      { text: '> System bereit.',                type: 'success', bar: 95 },
      { text: '> ✓ ' + platformRaw + '.de ist jetzt ONLINE! 🚀', type: 'launch', bar: 100 },
    ];

    var consoleEl = overlay.querySelector('#rt-launch-console');
    var barEl     = overlay.querySelector('#rt-launch-bar');
    var footer    = overlay.querySelector('#rt-launch-footer');

    function addLine(idx) {
      if (idx >= LINES.length) {
        spawnConfetti();
        setTimeout(function () {
          if (footer) footer.style.display = '';
        }, 700);
        return;
      }
      var line = LINES[idx];
      var el   = document.createElement('div');
      el.className   = 'rt-launch-line rt-launch-line--' + line.type;
      el.textContent = line.text;
      consoleEl.appendChild(el);
      consoleEl.scrollTop = consoleEl.scrollHeight;
      if (barEl) barEl.style.width = line.bar + '%';
      setTimeout(function () { addLine(idx + 1); }, 480);
    }

    setTimeout(function () { addLine(0); }, 350);

    overlay.querySelector('#rt-launch-weiter').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      showGoLiveModal();
    });
  }

  // ── Screen-Lifecycle ─────────────────────────────────────────────────────
  function enter(container) {
    ensureStartingResources();
    RT.clock.start();
    _clockProg            = 0;
    _investorTriggered    = false;
    _hqBadgeDismissed     = false;
    _shopBadgeDismissed   = false;

    var player = RT.state.get().player;
    var hqSrc  = RT.assets.buildingSrc('headquarter', 0);

    container.innerHTML = ''
      + '<section class="rt-screen">'
      +    RT.ui.profileBarHTML(player)
      +    RT.ui.resourceBarHTML()
      + '  <div class="rt-card rt-garage-card">'
      + '    <h2 class="rt-card__title">🛠️ Deine Garage</h2>'
      + '    <div class="rt-garage-stage rt-hq-clickable" id="rt-hq-btn">'
      + '      <img class="rt-garage-stage__building" src="' + hqSrc + '" alt="Garage">'
      + '      <div class="rt-hq-label-wrap">'
      + '        <span class="rt-new-badge" id="rt-hq-new-badge" style="display:none">!</span>'
      + '        <span class="rt-hq-label" id="rt-hq-label">Tech Tree öffnen</span>'
      + '      </div>'
      + '    </div>'
      + '    <div style="margin-top: 24px;">'
      + '      <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-online" style="display:none">'
      + '        🚀 Plattform online stellen'
      + '      </button>'
      + '    </div>'
      + '  </div>'
      + '</section>';

    unsubResources = RT.ui.bindResourceBar(container);
    updateProgressBar();
    updateOnlineButton();
    updateHqBadge();

    var shopBtnVis = document.getElementById('rt-shop-open');
    if (shopBtnVis) shopBtnVis.style.display = '';
    var questBtnVis = document.getElementById('rt-quest-open');
    if (questBtnVis) questBtnVis.style.display = '';

    var shopBtn = document.getElementById('rt-shop-open');
    if (shopBtn) {
      _onShopBadgeClick = function () {
        _shopBadgeDismissed = true;
        updateHqBadge();
      };
      shopBtn.addEventListener('click', _onShopBadgeClick);
    }

    _offTick = RT.bus.on('clock:tick', function (d) {
      _clockProg = d.progress;
      updateProgressBar();
    });

    _offComplete = RT.bus.on('techtree:completed', function () {
      updateProgressBar();
      updateOnlineButton();
    });

    _offTabSeen = RT.bus.on('techtree:tab-seen', function () {
      updateHqBadge();
    });

    _offMonthAdvance = RT.bus.on('month:advance', function () {
      applyMonthlyGrowth();
    });

    container.querySelector('#rt-hq-btn').addEventListener('click', onHqClick);
    container.querySelector('#rt-online').addEventListener('click', showLaunchSequence);
  }

  function exit() {
    if (unsubResources)   { unsubResources();   unsubResources   = null; }
    if (_offTick)         { _offTick();         _offTick         = null; }
    if (_offComplete)     { _offComplete();     _offComplete     = null; }
    if (_offMonthAdvance) { _offMonthAdvance(); _offMonthAdvance = null; }
    if (_offTabSeen)      { _offTabSeen();      _offTabSeen      = null; }
    var shopBtn = document.getElementById('rt-shop-open');
    if (shopBtn && _onShopBadgeClick) {
      shopBtn.removeEventListener('click', _onShopBadgeClick);
      _onShopBadgeClick = null;
    }
    var shopBadge = document.getElementById('rt-shop-badge');
    if (shopBadge) shopBadge.style.display = 'none';
  }

  RT.screens.register('garage', { enter: enter, exit: exit });

  // Für Slot-Sidebar: klickbare Slot-Items lösen die Garage-Celebration aus.
  RT.garage = { showCelebration: showCelebration };
})(window.RT);
