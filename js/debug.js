/* Debug-Overlay. Halte W+I gleichzeitig gedrückt → Overlay öffnet sich.
   Erlaubt Geld-Cheats und Phase-Sprünge. Nur für Development. */
(function (RT) {
  'use strict';

  var pressed = { w: false, i: false };
  var overlay = null;

  // --- Hotkey ---
  function onKeydown(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k !== 'w' && k !== 'i') return;
    pressed[k] = true;
    if (pressed.w && pressed.i && !overlay) openOverlay();
  }
  function onKeyup(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k === 'w' || k === 'i') pressed[k] = false;
  }
  function onBlur() { pressed.w = false; pressed.i = false; }

  // --- Overlay ---
  function openOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'rt-debug-overlay';
    overlay.style.cssText = ''
      + 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      + 'z-index:99999;background:#1a1a1a;color:#fff;padding:24px 28px;'
      + 'border:2px solid #f0c;border-radius:8px;font-family:sans-serif;'
      + 'min-width:340px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    overlay.innerHTML = ''
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '  <div style="font-size:18px;font-weight:bold;">🛠 Debug</div>'
      + '  <button id="rt-debug-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">💰 Geld hinzufügen</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">'
      + '  <button class="rt-dbg-money" data-amt="1000"     style="' + btnCss() + '">+1k</button>'
      + '  <button class="rt-dbg-money" data-amt="10000"    style="' + btnCss() + '">+10k</button>'
      + '  <button class="rt-dbg-money" data-amt="100000"   style="' + btnCss() + '">+100k</button>'
      + '  <button class="rt-dbg-money" data-amt="1000000"  style="' + btnCss() + '">+1M</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">📈 Trend setzen</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'
      + '  <button class="rt-dbg-trend" data-v="-8" style="' + btnCss('#933') + '">-8</button>'
      + '  <button class="rt-dbg-trend" data-v="-3" style="' + btnCss('#933') + '">-3</button>'
      + '  <button class="rt-dbg-trend" data-v="0"  style="' + btnCss() + '">0</button>'
      + '  <button class="rt-dbg-trend" data-v="3"  style="' + btnCss('#396') + '">+3</button>'
      + '  <button class="rt-dbg-trend" data-v="8"  style="' + btnCss('#396') + '">+8</button>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">'
      + '  <button id="rt-dbg-trend-fill" style="' + btnCss() + '">Stapel voll</button>'
      + '  <button id="rt-dbg-trend-clear" style="' + btnCss() + '">Debug-Mod weg</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">🚀 Phase springen</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">'
      + '  <button id="rt-dbg-restart" style="' + btnCss('#c33') + '">Kompletter Neustart</button>'
      + '  <button id="rt-dbg-phase2"  style="' + btnCss('#396') + '">Zum Anfang von Phase 2</button>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#rt-debug-close').onclick = closeOverlay;

    var moneyBtns = overlay.querySelectorAll('.rt-dbg-money');
    for (var i = 0; i < moneyBtns.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          var amt = parseInt(btn.getAttribute('data-amt'), 10);
          RT.state.current.money += amt;
          RT.bus.emit('state:changed');
        };
      })(moneyBtns[i]);
    }

    // Setzt einen Debug-Modifikator, der den Trend auf den Zielwert zieht.
    // Läuft über setTrendMod, damit er in der Aufschlüsselung sichtbar ist.
    var trendBtns = overlay.querySelectorAll('.rt-dbg-trend');
    for (var t = 0; t < trendBtns.length; t++) {
      (function (btn) {
        btn.onclick = function () {
          var target = parseFloat(btn.getAttribute('data-v'));
          RT.state.removeTrendMod('debug');
          var rest = RT.state.trendValue();
          RT.state.setTrendMod('debug', '🛠 Debug', Math.round((target - rest) * 10) / 10);
          RT.bus.emit('state:changed');
        };
      })(trendBtns[t]);
    }
    overlay.querySelector('#rt-dbg-trend-fill').onclick = function () {
      RT.state.current.trendStacks    = RT.state.TREND_STACK_MAX;
      RT.state.current.trendCycleTime = 0;
      RT.bus.emit('state:changed');
    };
    overlay.querySelector('#rt-dbg-trend-clear').onclick = function () {
      RT.state.removeTrendMod('debug');
      RT.bus.emit('state:changed');
    };

    overlay.querySelector('#rt-dbg-restart').onclick = function () {
      if (!confirm('Kompletter Neustart — Spielstand geht verloren. Sicher?')) return;
      RT.storage.wipe();
      location.reload();
    };
    overlay.querySelector('#rt-dbg-phase2').onclick = function () {
      if (!confirm('Zum Anfang von Phase 2 springen? Aktueller Spielstand geht verloren.')) return;
      applyPhase2Seed();
      RT.storage.save();
      location.reload();
    };
  }

  function closeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function btnCss(bg) {
    return 'background:' + (bg || '#333') + ';color:#fff;border:1px solid #555;'
         + 'padding:8px 14px;border-radius:4px;cursor:pointer;font-size:14px;';
  }

  // --- Phase-2-Seed ---
  // Zustand wie unmittelbar nach dem "Deal!"-Klick im Investor-Modal:
  // 1000 User, +50 000 € gutgeschrieben, Küken-Farm auf Huhn upgegradet,
  // 5 Kern-Nodes done. Zusätzlich eine Werbeagentur mit Start-Watchtime,
  // damit sich Werbedeals ohne Vorlauf testen lassen.
  function applyPhase2Seed() {
    var s = RT.state.current;
    if (!s.player || !s.player.name) {
      s.player = { name: 'DebugDev', avatar: null,
                   platformName: 'DebugPlatform', platformLogo: null };
    }
    s.money = 51500;
    s.users = 1000;
    // Genug für einen Banner- (10k) oder Feed-Deal (40k) direkt nach dem Seed.
    s.watchtime = 60000;
    s.trendMods          = { basis: { label: 'Grundinteresse', value: 3, expiresAt: 0 } };
    s.trendStacks        = 0;
    s.trendCycleTime     = 0;
    s.trendDrainAcc      = 0;
    s.trendShieldUntil   = 0;
    s.trendShieldReadyAt = 0;
    s.trendModalSeen     = false;
    s.goLiveUnlocked    = true;
    s.investorTriggered = true;
    s.goLiveModalSeen   = true;
    s.lastFlyerTick   = 0;
    s.sparkHistory = { money: [], users: [] };
    s.purchases    = { rechner: true };
    s.seenBadges   = { hq_phase0: true, hq_phase1: true, shop: true,
                       tab_marketing: true, tab_werbung: true };
    // 5 Kern-Nodes (Voraussetzung für Go-Live, siehe loop.js:405) + die drei
    // Phase-1-Nodes, die der Spieler auf dem Weg zu 1000 Usern natürlich hat:
    // mk_freunde, mk_flyer (Marketing), wb_coop (erste Werbekooperation).
    s.techtree = {
      frontend1:  { status: 'done', startAt: 0 },
      backend1:   { status: 'done', startAt: 0 },
      account:    { status: 'done', startAt: 0 },
      feed:       { status: 'done', startAt: 0 },
      bilder:     { status: 'done', startAt: 0 },
      mk_freunde: { status: 'done', startAt: 0 },
      mk_flyer:   { status: 'done', startAt: 0 },
      wb_coop:    { status: 'done', startAt: 0 }
    };
    // HQ + Serverfarm (Huhn) + eine Werbeagentur zum Testen. Das
    // Marketing-Center kauft der Spieler in Phase 2 selbst über den Shop.
    s.instanceCounter = 3;
    s.placedBuildings = [
      { instanceId: 'hq-1',    id: 'hq',    col: 0, row: 0, size: 1,
        state: { level: 1 } },
      { instanceId: 'farm-2',  id: 'farm',  col: 1, row: 0, size: 2,
        state: { tierId: 'huhn', stacks: 0, cycleTime: 0 } },
      { instanceId: 'werbe-3', id: 'werbe', col: 0, row: 1, size: 1,
        state: { deal: null, moneyReady: 0, lastDeal: null } }
    ];
  }

  function init() {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    window.addEventListener('blur', onBlur);
  }

  RT.debug = { init: init };
})(window.RT3);
