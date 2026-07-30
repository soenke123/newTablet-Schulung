/* UI — isometrische Welt, Gebäude als Instanzen (mehrere pro Typ).
   Klick auf Gebäude → Modal je Instanz. Klick auf leeres Feld → Shop (pre-scoped).
   Shop-Button oben öffnet Shop; nach Wahl aktiviert Placement-Mode mit Tile-Highlights. */
(function (RT) {
  'use strict';

  var el = {};      // Gecachte DOM-Referenzen
  var modalContext = null; // 'farm' | 'werbe' | 'marketing' | 'hq' | 'shop' | null
  var sliderDragging = false;
  var shopPreTile   = null;   // { col, row } wenn Shop aus Tile-Klick geöffnet wurde
  var placementMode = null;   // { typeId } — aktiviert Tile-Highlighting

  // ---- Helpers ----
  function fmtMoney(n) {
    n = Math.floor(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M €';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'k €';
    return n + ' €';
  }
  function fmtNum(n) {
    n = Math.floor(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return String(n);
  }
  function fmtPct(f) {
    var v = Math.round(f * 1000) / 10;
    return (v > 0 ? '+' : '') + v + '%';
  }

  // ---- Iso-Grid Konfiguration ----
  var TILE_W = 192;
  var TILE_H = 96;
  var GRID_SIZE = 5; // Muss mit RT.state.GRID_SIZE übereinstimmen

  function buildIsoGrid() {
    var grid = document.getElementById('iso-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var world = el.world;
    var w = world.clientWidth;
    var h = world.clientHeight;

    var offsetX = w / 2;
    var offsetY = h * 0.35;

    // Rasenkacheln zeichnen (klickbar für Shop/Placement)
    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var tx = (c - r) * TILE_W / 2 + offsetX;
        var ty = (c + r) * TILE_H / 2 + offsetY;
        var tile = document.createElement('div');
        tile.className = 'iso-tile';
        tile.dataset.col = c;
        tile.dataset.row = r;
        tile.style.left = tx + 'px';
        tile.style.top  = ty + 'px';
        tile.addEventListener('click', onTileClick);
        grid.appendChild(tile);
      }
    }

    // Gebäude setzen (aus placedBuildings)
    var pb = RT.state.current.placedBuildings;
    for (var i = 0; i < pb.length; i++) {
      var inst = pb[i];
      var sprite, alt;
      if (inst.id === 'hq') {
        sprite = RT.state.HQ_SPRITE.sprite;
        alt    = RT.state.HQ_SPRITE.alt;
      } else {
        var t = RT.state.BUILDING_TYPES[inst.id];
        if (!t) continue;
        sprite = t.sprite;
        alt    = t.alt;
      }

      var extraY = (inst.size === 2) ? TILE_H / 2 : 0;
      var bx = (inst.col - inst.row) * TILE_W / 2 + offsetX;
      var by = (inst.col + inst.row) * TILE_H / 2 + offsetY + extraY;
      var zFront = inst.col + inst.row + (inst.size === 2 ? 2 : 0);

      var b = document.createElement('div');
      b.className = 'building' + (inst.size === 2 ? ' building-2x2' : '');
      b.setAttribute('data-b', inst.id);
      b.setAttribute('data-instance-id', inst.instanceId);
      b.style.left = bx + 'px';
      b.style.top  = by + 'px';
      b.style.zIndex = String(10 + zFront);

      if (inst.id === 'farm') {
        b.innerHTML =
          '<img class="b-img" src="' + sprite + '" alt="' + alt + '" draggable="false">' +
          '<div class="farm-animals" data-animals></div>' +
          '<div class="b-hitbox"></div>';
      } else {
        b.innerHTML =
          '<img class="b-img" src="' + sprite + '" alt="' + alt + '" draggable="false">' +
          '<div class="b-hitbox"></div>';
      }
      b.addEventListener('click', onBuildingClick);
      grid.appendChild(b);

      if (inst.id === 'farm') updateFarmAnimals(b, inst);
    }

    // Separates UI-Layer über allen Buildings: Progress-Ring + Aktions-Button.
    var uiLayer = document.getElementById('building-ui-layer');
    if (uiLayer) {
      uiLayer.innerHTML = '';
      var farms = RT.state.instancesByType('farm');
      for (var fi = 0; fi < farms.length; fi++) {
        var f = farms[fi];
        var fExtraY = (f.size === 2) ? TILE_H / 2 : 0;
        var fbx = (f.col - f.row) * TILE_W / 2 + offsetX;
        var fby = (f.col + f.row) * TILE_H / 2 + offsetY + fExtraY;

        var ui = document.createElement('div');
        ui.className = 'farm-ui' + (f.size === 2 ? ' farm-ui-2x2' : '');
        ui.setAttribute('data-instance-id', f.instanceId);
        ui.style.left = fbx + 'px';
        ui.style.top  = fby + 'px';
        ui.innerHTML =
          '<div class="farm-progress-ring" data-progress><div class="farm-progress-ring-inner"></div></div>' +
          '<button class="farm-harvest-btn" data-harvest type="button"></button>';
        uiLayer.appendChild(ui);
        updateFarmUi(ui, f);

        var harvestBtn = ui.querySelector('[data-harvest]');
        (function (iid, btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            harvestFromField(iid, btn);
          });
        })(f.instanceId, harvestBtn);
      }

      // Marketing-UI: gleiche Struktur wie Farm — Ring mit Countdown + Collect-Button
      var mks = RT.state.instancesByType('marketing');
      for (var mi = 0; mi < mks.length; mi++) {
        var m = mks[mi];
        var mExtraY = (m.size === 2) ? TILE_H / 2 : 0;
        var mbx = (m.col - m.row) * TILE_W / 2 + offsetX;
        var mby = (m.col + m.row) * TILE_H / 2 + offsetY + mExtraY;

        var mui = document.createElement('div');
        mui.className = 'mk-ui';
        mui.setAttribute('data-instance-id', m.instanceId);
        mui.style.left = mbx + 'px';
        mui.style.top  = mby + 'px';
        mui.innerHTML =
          '<div class="mk-ring" data-ring>' +
            '<div class="mk-ring-inner"><span class="mk-ring-text" data-ring-text></span></div>' +
          '</div>' +
          '<button class="mk-collect-btn" data-collect type="button"></button>';
        uiLayer.appendChild(mui);
        updateMarketingUi(mui, m);

        var collectBtn = mui.querySelector('[data-collect]');
        (function (iid, btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            collectFromField(iid, btn);
          });
        })(m.instanceId, collectBtn);
      }
    }
  }

  // Organische Positionen innerhalb der isometrischen Weide-Raute.
  // Prozente relativ zum Building-Container. Tiere sind fuß-verankert (unten-mitte).
  // Reihenfolge = grob hinten → vorne, damit vordere Tiere hintere überlappen.
  var ANIMAL_POSITIONS = [
    { x: 50, y: 58 }, // 1: hinten mitte
    { x: 42, y: 64 }, // 2: hinten links
    { x: 60, y: 62 }, // 3: hinten rechts
    { x: 34, y: 71 }, // 4: mitte links
    { x: 52, y: 73 }, // 5: mitte mitte
    { x: 66, y: 70 }, // 6: mitte rechts
    { x: 44, y: 80 }, // 7: vorne links
    { x: 58, y: 78 }  // 8: vorne rechts
  ];

  // Zeichnet die Tier-Sprites organisch auf der Weide.
  function updateFarmAnimals(bldEl, inst) {
    var fs   = inst.state;
    var tier = RT.state.tierById(fs.tierId);
    if (!tier) return;
    var animalsEl = bldEl.querySelector('[data-animals]');
    if (!animalsEl) return;
    var count = RT.state.animalsInFarm(inst);
    var current = animalsEl.children.length;
    var currentTier = animalsEl.getAttribute('data-tier');
    if (current !== count || currentTier !== tier.id) {
      animalsEl.setAttribute('data-tier', tier.id);
      var html = '';
      for (var i = 0; i < count; i++) {
        var p = ANIMAL_POSITIONS[i % ANIMAL_POSITIONS.length];
        html += '<img class="farm-animal"'
              + ' style="--i:' + i + ';--x:' + p.x + '%;--y:' + p.y + '%;z-index:' + Math.round(p.y) + '"'
              + ' src="' + tier.sprite + '"'
              + ' alt="' + tier.alt + '"'
              + ' draggable="false">';
      }
      animalsEl.innerHTML = html;
    }
  }

  // Aktualisiert Progress-Ring + Ernte-Button im separaten UI-Layer (immer oben).
  function updateFarmUi(uiEl, inst) {
    var fs = inst.state;
    var maxStacks = RT.state.WATCHTIME_STACK_MAX;

    // Radial-Progress
    var ring = uiEl.querySelector('[data-progress]');
    if (ring) {
      var pct;
      if (fs.stacks >= maxStacks) pct = 100;
      else pct = Math.min(100, (fs.cycleTime / RT.state.WATCHTIME_CYCLE_SEC) * 100);
      ring.style.setProperty('--p', pct);
      ring.classList.toggle('is-full', fs.stacks >= maxStacks);
    }

    // Ernte-Button — Größe skaliert mit Stack-Anzahl
    var btn = uiEl.querySelector('[data-harvest]');
    if (btn) {
      var users = RT.state.usersInFarm(inst);
      var total = fs.stacks * users * RT.state.WATCHTIME_PER_USER_PER_CYCLE;
      btn.style.setProperty('--stacks', fs.stacks);
      if (total > 0) {
        btn.classList.add('is-ready');
        btn.textContent = '🌾 ' + fmtNum(total) + ' ⏳';
        btn.disabled = false;
      } else {
        btn.classList.remove('is-ready');
        btn.textContent = '⏳';
        btn.disabled = true;
      }
    }
  }

  // Marketing-UI: Ring zählt Kampagnen-Restzeit runter, Button erscheint
  // sobald ready > 0. Wenn nichts läuft und nichts bereit ist, sind beide
  // dezent-versteckt (visibility:hidden) — konsistent mit Farm-Idle.
  function updateMarketingUi(uiEl, inst) {
    var mkS = inst.state;
    var ring     = uiEl.querySelector('[data-ring]');
    var ringText = uiEl.querySelector('[data-ring-text]');
    var btn      = uiEl.querySelector('[data-collect]');

    // --- Ring (Countdown während aktiver Kampagne) ---
    if (ring) {
      if (mkS.active) {
        var elapsed   = (Date.now() - mkS.active.startAt) / 1000;
        var remaining = Math.max(0, mkS.active.duration - elapsed);
        var pct       = Math.min(100, (elapsed / mkS.active.duration) * 100);
        ring.style.setProperty('--p', pct);
        ring.classList.add('is-active');
        if (ringText) {
          // > 100 s → Minuten (aufgerundet), sonst Sekunden.
          if (remaining > 100) ringText.textContent = Math.ceil(remaining / 60) + 'm';
          else                 ringText.textContent = Math.ceil(remaining) + 's';
        }
      } else {
        ring.style.setProperty('--p', 0);
        ring.classList.remove('is-active');
        if (ringText) ringText.textContent = '';
      }
    }

    // --- Collect-Button ---
    if (btn) {
      if (mkS.ready > 0) {
        btn.classList.add('is-ready');
        btn.textContent = '👥 +' + fmtNum(mkS.ready);
        btn.disabled = false;
      } else {
        btn.classList.remove('is-ready');
        btn.textContent = '';
        btn.disabled = true;
      }
    }
  }

  // Direkter Collect-Klick auf dem Marketing-Feld.
  function collectFromField(instanceId, btnEl) {
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    var ready = inst.state.ready;
    if (ready <= 0) return;

    // Vorab prüfen, wieviel wirklich reingeht (Cap-Check dupliziert die Logik
    // aus RT.actions.collectMarketingUsers — nötig, um Effekt-Menge zu kennen).
    var cap  = RT.state.serverCapacityTotal();
    var free = Math.max(0, cap - RT.state.current.users);
    var willAdd = Math.min(ready, free);

    if (willAdd <= 0) {
      // Kein Platz — Action feuert Toast.
      RT.actions.collectMarketingUsers(instanceId);
      return;
    }

    // Erst Effekt (Rect aus dem Button greifen), dann Action.
    spawnUserFly(btnEl, willAdd);
    if (el.resUsers) {
      var popScale = 1.4 + Math.min(1, willAdd / Math.max(1, cap)) * 0.6;
      el.resUsers.style.setProperty('--pop-scale', popScale.toFixed(2));
      el.resUsers.classList.remove('res-pop');
      void el.resUsers.offsetWidth;
      el.resUsers.classList.add('res-pop');
    }
    RT.actions.collectMarketingUsers(instanceId);
  }

  function spawnUserFly(fromEl, amount) {
    if (!fromEl || !el.resUsers || !el.world) return;
    var fromRect  = fromEl.getBoundingClientRect();
    var toRect    = el.resUsers.getBoundingClientRect();
    var worldRect = el.world.getBoundingClientRect();
    var startX = fromRect.left + fromRect.width  / 2 - worldRect.left;
    var startY = fromRect.top  + fromRect.height / 2 - worldRect.top;
    var endX   = toRect.left   + toRect.width    / 2 - worldRect.left;
    var endY   = toRect.top    + toRect.height   / 2 - worldRect.top;
    var bubble = document.createElement('div');
    bubble.className = 'user-fly';
    bubble.textContent = '+' + fmtNum(amount) + ' 👥';
    bubble.style.left = startX + 'px';
    bubble.style.top  = startY + 'px';
    bubble.style.setProperty('--dx', (endX - startX) + 'px');
    bubble.style.setProperty('--dy', (endY - startY) + 'px');
    el.world.appendChild(bubble);
    setTimeout(function () { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 750);
  }

  // Direkter Ernte-Klick auf dem Feld — löst Ernte + Fly-Bubble aus.
  // Der Effekt skaliert mit stacks (1..5): mehr Stapel = größere Bubble,
  // mehr Trailing-Icons, stärkerer Tile-Pop.
  function harvestFromField(instanceId, btnEl) {
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    var stacks = Math.max(1, Math.min(RT.state.WATCHTIME_STACK_MAX, inst.state.stacks));
    var users = RT.state.usersInFarm(inst);
    var total = inst.state.stacks * users * RT.state.WATCHTIME_PER_USER_PER_CYCLE;
    if (total <= 0) return;
    spawnWatchtimeFly(btnEl, total, stacks);
    if (el.resWatchtime) {
      // Pop-Scale wächst mit Stacks: 1.3 (1 stack) … 2.1 (5 stacks)
      var popScale = 1.3 + stacks * 0.16;
      el.resWatchtime.style.setProperty('--pop-scale', popScale.toFixed(2));
      el.resWatchtime.classList.remove('res-pop');
      void el.resWatchtime.offsetWidth;
      el.resWatchtime.classList.add('res-pop');
    }
    RT.actions.harvestFarm(instanceId);
  }

  function spawnWatchtimeFly(fromEl, amount, stacks) {
    if (!fromEl || !el.resWatchtime || !el.world) return;
    var fromRect  = fromEl.getBoundingClientRect();
    var toRect    = el.resWatchtime.getBoundingClientRect();
    var worldRect = el.world.getBoundingClientRect();
    var startX = fromRect.left + fromRect.width  / 2 - worldRect.left;
    var startY = fromRect.top  + fromRect.height / 2 - worldRect.top;
    var endX   = toRect.left   + toRect.width    / 2 - worldRect.left;
    var endY   = toRect.top    + toRect.height   / 2 - worldRect.top;

    // Haupt-Bubble: 20 px (1 Stack) … 52 px (5 Stacks)
    var fontSize = 20 + stacks * 6;
    var bubble = document.createElement('div');
    bubble.className = 'wt-fly';
    bubble.textContent = '+' + fmtNum(amount) + ' ⏳';
    bubble.style.left = startX + 'px';
    bubble.style.top  = startY + 'px';
    bubble.style.fontSize = fontSize + 'px';
    bubble.style.setProperty('--dx', (endX - startX) + 'px');
    bubble.style.setProperty('--dy', (endY - startY) + 'px');
    el.world.appendChild(bubble);
    setTimeout(function () { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 750);

    // Trailing Mini-Sanduhren pro Stack — kleiner, zeitversetzt.
    for (var i = 1; i < stacks; i++) {
      (function (idx) {
        setTimeout(function () {
          var mini = document.createElement('div');
          mini.className = 'wt-fly wt-fly-mini';
          mini.textContent = '⏳';
          var ox = (Math.random() - 0.5) * 60;
          var oy = (Math.random() - 0.5) * 30;
          mini.style.left = (startX + ox) + 'px';
          mini.style.top  = (startY + oy) + 'px';
          mini.style.setProperty('--dx', (endX - startX - ox) + 'px');
          mini.style.setProperty('--dy', (endY - startY - oy) + 'px');
          el.world.appendChild(mini);
          setTimeout(function () { if (mini.parentNode) mini.parentNode.removeChild(mini); }, 700);
        }, 70 * idx);
      })(i);
    }
  }

  // ---- Init ----
  function init() {
    el.resMoney         = document.getElementById('res-money');
    el.resUsers         = document.getElementById('res-users');
    el.resServercap     = document.getElementById('res-servercap');
    el.resServercapWrap = document.getElementById('res-servercap-wrap');
    el.resWatchtime     = document.getElementById('res-watchtime');
    el.resRuf       = document.getElementById('res-ruf');
    el.resRufWrap   = document.getElementById('res-ruf-wrap');

    el.world          = document.getElementById('world');
    el.modalBackdrop  = document.getElementById('modal-backdrop');
    el.modal          = document.getElementById('modal');
    el.modalTitle     = document.getElementById('modal-title');
    el.modalBody      = document.getElementById('modal-body');
    el.modalClose     = document.getElementById('modal-close');
    el.toast          = document.getElementById('toast');
    el.shopBtn        = document.getElementById('shop-btn');
    el.placementBar   = document.getElementById('placement-bar');
    el.placementLabel = document.getElementById('placement-label');
    el.placementCancel= document.getElementById('placement-cancel');

    buildIsoGrid();
    window.addEventListener('resize', function () {
      buildIsoGrid();
      if (placementMode) updateTileHighlights();
    });

    el.modalClose.addEventListener('click', closeModal);
    el.modalBackdrop.addEventListener('click', function (e) {
      if (e.target === el.modalBackdrop) closeModal();
    });
    el.shopBtn.addEventListener('click', function () {
      if (placementMode) exitPlacement();
      openShopModal(null);
    });
    el.placementCancel.addEventListener('click', exitPlacement);

    RT.bus.on('state:changed', onStateChanged);
    RT.bus.on('effect',        onEffect);
    RT.bus.on('tick',          frameTick);
    RT.bus.on('toast',         toast);

    renderAll();
  }

  function onStateChanged() {
    // Grid neu bauen — neues Gebäude, Layout kann sich geändert haben
    buildIsoGrid();
    if (placementMode) updateTileHighlights();
    renderAll();
  }

  function onBuildingClick(e) {
    if (placementMode) { exitPlacement(); return; }
    var instanceId = e.currentTarget.getAttribute('data-instance-id');
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    if (inst.id === 'farm')      openFarmModal(inst);
    else if (inst.id === 'werbe')     openWerbeModal(inst);
    else if (inst.id === 'marketing') openMarketingModal(inst);
    else if (inst.id === 'hq')        openHQModal();
  }

  function onTileClick(e) {
    var c = parseInt(e.currentTarget.dataset.col, 10);
    var r = parseInt(e.currentTarget.dataset.row, 10);
    if (placementMode) {
      var res = RT.actions.placeBuilding(placementMode.typeId, c, r);
      if (res.ok) exitPlacement();
      else toast(res.msg);
      return;
    }
    // Leeres Feld angeklickt → Shop mit pre-scope
    if (RT.state.isOccupied(c, r)) return;
    openShopModal({ col: c, row: r });
  }

  function enterPlacement(typeId) {
    placementMode = { typeId: typeId };
    var t = RT.state.BUILDING_TYPES[typeId];
    el.placementLabel.textContent = t.icon + ' ' + t.name + ' platzieren — grünes Feld anklicken';
    el.placementBar.classList.add('show');
    updateTileHighlights();
  }
  function exitPlacement() {
    placementMode = null;
    el.placementBar.classList.remove('show');
    clearTileHighlights();
  }
  function updateTileHighlights() {
    var tiles = document.querySelectorAll('.iso-tile');
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var c = parseInt(t.dataset.col, 10);
      var r = parseInt(t.dataset.row, 10);
      t.classList.remove('tile-valid', 'tile-invalid');
      if (placementMode) {
        if (RT.state.canPlace(placementMode.typeId, c, r)) t.classList.add('tile-valid');
        else t.classList.add('tile-invalid');
      }
    }
  }
  function clearTileHighlights() {
    var tiles = document.querySelectorAll('.iso-tile');
    for (var i = 0; i < tiles.length; i++) {
      tiles[i].classList.remove('tile-valid', 'tile-invalid');
    }
  }

  // ---- Render (Bar + Badges + Tiere) ----
  function renderAll() {
    var s = RT.state.current;
    var cap = RT.state.serverCapacityTotal();

    // Alte Bubble-Bar (falls DOM-Elemente noch vorhanden — im neuen Layout
    // kommt die Anzeige aus RT3.ui.bindResourceBar via 'state:changed').
    if (el.resMoney)     el.resMoney.textContent     = fmtMoney(s.money);
    if (el.resUsers)     el.resUsers.textContent     = fmtNum(s.users);
    if (el.resServercap) el.resServercap.textContent = fmtNum(cap);
    if (el.resWatchtime) el.resWatchtime.textContent = fmtNum(s.watchtime);
    if (el.resRuf)       el.resRuf.textContent       = fmtPct(s.ruf);

    if (el.resRufWrap) {
      el.resRufWrap.classList.remove('res-ruf-good', 'res-ruf-bad');
      if (s.ruf >  0.05) el.resRufWrap.classList.add('res-ruf-good');
      if (s.ruf < -0.10) el.resRufWrap.classList.add('res-ruf-bad');
    }

    if (el.resServercapWrap) {
      var full = cap > 0 && s.users >= cap;
      var warn = cap > 0 && s.users >= cap * 0.95;
      el.resServercapWrap.classList.toggle('res-cap-full', full);
      el.resServercapWrap.classList.toggle('res-cap-warn', warn && !full);
    }

    // Farm-Felder aktualisieren (Tiere, Stack-Anzeige, Ernte-Button)
    updateAllFarmFields();

    // Modal ggf. aktualisieren
    if (modalContext) refreshModal();
  }

  // ---- Frame-Tick (nur visuelle Zwischenwerte) ----
  function frameTick() {
    // Alte Bubble-Bar (falls DOM-Elemente noch existieren — im neuen Layout
    // kommt Watchtime live aus RT3.ui.bindResourceBar via tick-Handler).
    if (el.resWatchtime) el.resWatchtime.textContent = fmtNum(RT.state.current.watchtime);
    // Farm-Progress + Button live
    updateAllFarmFields();
    // Modal live-Werte
    if (modalContext) refreshModalLive();
  }

  function updateAllFarmFields() {
    var farms = RT.state.instancesByType('farm');
    for (var i = 0; i < farms.length; i++) {
      var iid = farms[i].instanceId;
      var bldEl = document.querySelector('.building[data-instance-id="' + iid + '"]');
      if (bldEl) updateFarmAnimals(bldEl, farms[i]);
      var uiEl  = document.querySelector('.farm-ui[data-instance-id="' + iid + '"]');
      if (uiEl)  updateFarmUi(uiEl, farms[i]);
    }
    var mks = RT.state.instancesByType('marketing');
    for (var mi = 0; mi < mks.length; mi++) {
      var miid = mks[mi].instanceId;
      var muiEl = document.querySelector('.mk-ui[data-instance-id="' + miid + '"]');
      if (muiEl) updateMarketingUi(muiEl, mks[mi]);
    }
  }

  // ---- Modal ----
  function openModal(title, bodyHtml, context) {
    modalContext = context;
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML    = bodyHtml;
    el.modalBackdrop.classList.add('open');
    wireModalButtons();
  }
  function closeModal() {
    modalContext = null;
    sliderDragging = false;
    shopPreTile   = null;
    el.modalBackdrop.classList.remove('open');
    el.modalBody.innerHTML = '';
  }
  function refreshModal() {
    if (!modalContext) return;
    if (modalContext.type === 'shop' || modalContext.type === 'hq') return;
    var inst = RT.state.getInstance(modalContext.instanceId);
    if (!inst) { closeModal(); return; }
    if (modalContext.type === 'farm')      renderFarmBody(inst);
    else if (modalContext.type === 'werbe')     renderWerbeBody(inst);
    else if (modalContext.type === 'marketing') renderMarketingBody(inst);
  }
  function refreshModalLive() {
    if (!modalContext || modalContext.type === 'shop' || modalContext.type === 'hq') return;
    var inst = RT.state.getInstance(modalContext.instanceId);
    if (!inst) return;

    if (modalContext.type === 'werbe') {
      var ws = inst.state;
      var collectBtn = document.getElementById('werbe-collect-btn');
      var mReady = Math.floor(ws.moneyReady);
      if (collectBtn) {
        collectBtn.disabled    = mReady <= 0;
        collectBtn.textContent = '💰 Einsammeln (' + fmtMoney(mReady).replace(' €', '€') + ')';
      }
      var wtEl = document.getElementById('werbe-wt-val');
      if (wtEl) wtEl.textContent = fmtNum(RT.state.current.watchtime);
    }
    if (modalContext.type === 'marketing') {
      var mkS = inst.state;
      var readyBtn = document.getElementById('mk-collect-btn');
      if (readyBtn) {
        readyBtn.disabled    = mkS.ready <= 0;
        readyBtn.textContent = '👥 User einsammeln (' + fmtNum(mkS.ready) + ')';
      }
      var runInfo = document.getElementById('mk-running-info');
      if (runInfo && mkS.active) {
        var camp = RT.state.campaignById(mkS.active.campaignId);
        var elapsed = (Date.now() - mkS.active.startAt) / 1000;
        var remaining = Math.max(0, Math.ceil(mkS.active.duration - elapsed));
        runInfo.textContent = camp.icon + ' ' + camp.name + ' läuft — noch ' + remaining + 's';
      }
      var runFill = document.getElementById('mk-modal-fill');
      if (runFill && mkS.active) {
        var pct = Math.min(100, ((Date.now() - mkS.active.startAt) / 1000 / mkS.active.duration) * 100);
        runFill.style.width = pct + '%';
      }
    }
    if (modalContext.type === 'farm') {
      var fs = inst.state;
      var stkEl = document.getElementById('farm-stacks-val');
      if (stkEl) stkEl.textContent = fs.stacks + ' / ' + RT.state.WATCHTIME_STACK_MAX;
      var harvestBtn = document.getElementById('farm-harvest-btn');
      if (harvestBtn) {
        var uInFarm = RT.state.usersInFarm(inst);
        var potential = fs.stacks * uInFarm * RT.state.WATCHTIME_PER_USER_PER_CYCLE;
        harvestBtn.disabled = fs.stacks <= 0;
        harvestBtn.textContent = '⏳ Ernten (+' + fmtNum(potential) + ' Watchtime)';
      }
    }
  }

  function wireModalButtons() {
    var slider = document.getElementById('werbe-slider');
    if (slider) {
      var sliderInst = slider.getAttribute('data-inst');
      slider.addEventListener('input', function (e) {
        var pct = parseInt(e.target.value, 10);
        RT.actions.setAdSlider(sliderInst, pct / 100);
        var lbl = document.getElementById('werbe-slider-label');
        if (lbl) lbl.innerHTML = 'Werbe-Intensität: <b>' + pct + '%</b>';
        var ertragEl = document.getElementById('werbe-ertrag-val');
        if (ertragEl) ertragEl.textContent = (0.02 * (1 + pct / 100 * 4)).toFixed(3) + ' € pro Watchtime';
        var rufEl = document.getElementById('werbe-rufloss-val');
        if (rufEl) rufEl.textContent = '-' + (Math.round(pct / 100 * 0.001 * 1000) / 10) + ' % / Sekunde';
      });
      slider.addEventListener('pointerdown', function () { sliderDragging = true; });
      slider.addEventListener('pointerup',   function () { sliderDragging = false; });
      slider.addEventListener('pointercancel', function () { sliderDragging = false; });
    }

    var collectWerbe = document.getElementById('werbe-collect-btn');
    if (collectWerbe) collectWerbe.addEventListener('click', function () {
      RT.actions.collectWerbeMoney(collectWerbe.getAttribute('data-inst'));
    });

    var harvestBtn = document.getElementById('farm-harvest-btn');
    if (harvestBtn) harvestBtn.addEventListener('click', function () {
      RT.actions.harvestFarm(harvestBtn.getAttribute('data-inst'));
    });

    var upgradeBtn = document.getElementById('farm-upgrade-btn');
    if (upgradeBtn) upgradeBtn.addEventListener('click', function () {
      var ok = RT.actions.upgradeFarm(upgradeBtn.getAttribute('data-inst'));
      if (!ok) toast('Nicht genug Geld für Upgrade.');
    });

    var mkCollect = document.getElementById('mk-collect-btn');
    if (mkCollect) mkCollect.addEventListener('click', function () {
      RT.actions.collectMarketingUsers(mkCollect.getAttribute('data-inst'));
    });

    // Kampagne-Start-Buttons
    var campBtns = document.querySelectorAll('.mk-start-btn');
    for (var i = 0; i < campBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var cid = btn.getAttribute('data-c');
          var iid = btn.getAttribute('data-inst');
          var ok  = RT.actions.startCampaign(iid, cid);
          if (!ok) toast('Kampagne kann nicht gestartet werden.');
        });
      })(campBtns[i]);
    }

    // Shop-Kauf-Buttons
    var buyBtns = document.querySelectorAll('.shop-buy-btn');
    for (var j = 0; j < buyBtns.length; j++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var tid = btn.getAttribute('data-t');
          if (shopPreTile) {
            // Direkt am pre-selected Tile platzieren
            var res = RT.actions.placeBuilding(tid, shopPreTile.col, shopPreTile.row);
            if (res.ok) closeModal();
            else toast(res.msg);
          } else {
            // Placement-Mode betreten
            closeModal();
            enterPlacement(tid);
          }
        });
      })(buyBtns[j]);
    }
  }

  // ---- Modal-Bodies ----
  function openFarmModal(inst) {
    var stufe = RT.state.tierStufe(inst.state.tierId);
    openModal('Serverfarm (Stufe ' + stufe + ')', renderFarmBodyHtml(inst), { type: 'farm', instanceId: inst.instanceId });
  }
  function renderFarmBody(inst) {
    el.modalTitle.textContent = 'Serverfarm (Stufe ' + RT.state.tierStufe(inst.state.tierId) + ')';
    el.modalBody.innerHTML = renderFarmBodyHtml(inst);
    wireModalButtons();
  }
  function renderFarmBodyHtml(inst) {
    var s     = RT.state.current;
    var fs    = inst.state;
    var tier  = RT.state.tierById(fs.tierId);
    var stufe = RT.state.tierStufe(fs.tierId);
    var next  = RT.state.nextTier(fs.tierId);
    var uInFarm = RT.state.usersInFarm(inst);
    var cap     = RT.state.farmCapacity(inst);
    var animals = RT.state.animalsInFarm(inst);
    var wtPerSec = RT.state.watchtimePerSec(inst);
    var potential = fs.stacks * uInFarm * RT.state.WATCHTIME_PER_USER_PER_CYCLE;
    var iid = inst.instanceId;

    var upgradeHtml = '';
    if (next) {
      var cost = RT.state.TIER_UPGRADE_COST[fs.tierId];
      var canUp = s.money >= cost;
      upgradeHtml =
        '<button class="modal-btn upgrade" id="farm-upgrade-btn" data-inst="' + iid + '" ' + (canUp ? '' : 'disabled') + '>' +
          '⬆️ Auf Stufe ' + (stufe + 1) + ' upgraden (' + fmtMoney(cost) + ')' +
        '</button>';
    } else {
      upgradeHtml = '<div class="info-line">Höchste Stufe erreicht.</div>';
    }

    return (
      '<div class="info-line">Stufen-Skin: <span class="info-highlight">' + tier.icon + ' Stufe ' + stufe + '</span></div>' +
      '<div class="info-line">User in dieser Farm: <span class="info-highlight">' + fmtNum(uInFarm) + ' / ' + fmtNum(cap) + '</span> (' + animals + ' Tiere sichtbar)</div>' +
      '<div class="info-line">Watchtime-Produktion: <span class="info-highlight">' + fmtNum(wtPerSec) + ' / Sekunde</span></div>' +
      '<div class="info-line">Sanduhr-Stapel: <span class="info-highlight" id="farm-stacks-val">' + fs.stacks + ' / ' + RT.state.WATCHTIME_STACK_MAX + '</span></div>' +
      '<button class="modal-btn collect" id="farm-harvest-btn" data-inst="' + iid + '" ' + (fs.stacks <= 0 ? 'disabled' : '') + '>' +
        '⏳ Ernten (+' + fmtNum(potential) + ' Watchtime)' +
      '</button>' +
      upgradeHtml
    );
  }

  function openWerbeModal(inst) {
    openModal('Werbeagentur', renderWerbeBodyHtml(inst), { type: 'werbe', instanceId: inst.instanceId });
  }
  function renderWerbeBody(inst) {
    if (sliderDragging) return;
    el.modalBody.innerHTML = renderWerbeBodyHtml(inst);
    wireModalButtons();
  }
  function renderWerbeBodyHtml(inst) {
    var ws = inst.state;
    var slider = Math.round(ws.slider * 100);
    var mReady = Math.floor(ws.moneyReady);
    var rufLoss = Math.round(ws.slider * 0.001 * 1000) / 10;
    var eurPerWt = (0.02 * (1 + ws.slider * 4)).toFixed(3);
    var iid = inst.instanceId;

    return (
      '<div class="info-line">Wandelt <b>Watchtime</b> in <b>Geld</b> um — kostet aber Ruf.</div>' +
      '<div class="slider-wrap">' +
        '<label id="werbe-slider-label">Werbe-Intensität: <b>' + slider + '%</b></label>' +
        '<input type="range" id="werbe-slider" data-inst="' + iid + '" min="0" max="100" value="' + slider + '">' +
        '<div class="slider-info">' +
          '<span>0% = aus (Ruf regeneriert)</span>' +
          '<span>100% = maximal</span>' +
        '</div>' +
      '</div>' +
      '<div class="info-line">Ertrag: <span class="info-highlight" id="werbe-ertrag-val">' + eurPerWt + ' € pro Watchtime</span></div>' +
      '<div class="info-line">Ruf-Kosten: <span class="info-highlight" id="werbe-rufloss-val">-' + rufLoss + ' % / Sekunde</span></div>' +
      '<div class="info-line">Verfügbare Watchtime: <span class="info-highlight" id="werbe-wt-val">' + fmtNum(RT.state.current.watchtime) + '</span></div>' +
      '<button class="modal-btn collect" id="werbe-collect-btn" data-inst="' + iid + '" ' + (mReady <= 0 ? 'disabled' : '') + '>' +
        '💰 Einsammeln (' + fmtMoney(mReady).replace(' €', '€') + ')' +
      '</button>'
    );
  }

  function openMarketingModal(inst) {
    openModal('Marketing-Argentur', renderMarketingBodyHtml(inst), { type: 'marketing', instanceId: inst.instanceId });
  }
  function renderMarketingBody(inst) {
    el.modalBody.innerHTML = renderMarketingBodyHtml(inst);
    wireModalButtons();
  }
  function renderMarketingBodyHtml(inst) {
    var s   = RT.state.current;
    var mkS = inst.state;
    var iid = inst.instanceId;

    var runningHtml = '';
    if (mkS.active) {
      var camp = RT.state.campaignById(mkS.active.campaignId);
      var elapsed = (Date.now() - mkS.active.startAt) / 1000;
      var pct = Math.min(100, (elapsed / mkS.active.duration) * 100);
      var remaining = Math.max(0, Math.ceil(mkS.active.duration - elapsed));
      runningHtml =
        '<div class="info-line" id="mk-running-info">' + camp.icon + ' ' + camp.name + ' läuft — noch ' + remaining + 's</div>' +
        '<div class="progress"><div class="progress-fill" id="mk-modal-fill" style="width:' + pct + '%"></div></div>';
    }

    var campsHtml = '';
    for (var i = 0; i < RT.state.CAMPAIGNS.length; i++) {
      var c = RT.state.CAMPAIGNS[i];
      var canStart = !mkS.active && s.money >= c.cost;
      campsHtml +=
        '<div class="campaign-row">' +
          '<div class="c-icon">' + c.icon + '</div>' +
          '<div class="c-info">' +
            '<b>' + c.name + '</b>' +
            '<small>' + fmtMoney(c.cost) + ' · ' + c.duration + 's · +' + fmtNum(c.users) + ' User</small>' +
          '</div>' +
          '<button class="mk-start-btn" data-c="' + c.id + '" data-inst="' + iid + '" ' + (canStart ? '' : 'disabled') + '>Start</button>' +
        '</div>';
    }

    return (
      '<div class="info-line">Kampagnen laufen hier — starten, warten, dann User einsammeln.</div>' +
      runningHtml +
      '<button class="modal-btn collect" id="mk-collect-btn" data-inst="' + iid + '" ' + (mkS.ready <= 0 ? 'disabled' : '') + '>' +
        '👥 User einsammeln (' + fmtNum(mkS.ready) + ')' +
      '</button>' +
      '<div style="margin-top:16px; font-weight:600;">Neue Kampagne starten</div>' +
      campsHtml
    );
  }

  function openHQModal() {
    openModal('Headquarter — Techtree', (
      '<div class="info-line">Hier wirst du bald Ausbildungen und Upgrades freischalten können.</div>' +
      '<div class="tt-node"><div class="tt-icon">🔬</div><div><b>Forschungslabor</b><br><small>Bald verfügbar</small></div></div>' +
      '<div class="tt-node"><div class="tt-icon">👨‍💻</div><div><b>Team ausbilden</b><br><small>Bald verfügbar</small></div></div>' +
      '<div class="tt-node"><div class="tt-icon">📊</div><div><b>Analytics</b><br><small>Bald verfügbar</small></div></div>'
    ), { type: 'hq' });
  }

  // ---- Shop ----
  function openShopModal(preTile) {
    shopPreTile = preTile || null;
    var hint;
    if (shopPreTile) {
      hint = 'Für Feld <b>(' + shopPreTile.col + ', ' + shopPreTile.row + ')</b> — die Serverfarm braucht 2×2 Platz.';
    } else {
      hint = 'Gebäude wählen — danach das Feld anklicken (Serverfarm braucht 2×2).';
    }

    var s = RT.state.current;
    var types = ['farm', 'werbe', 'marketing'];
    var cardsHtml = '';
    for (var i = 0; i < types.length; i++) {
      var tid = types[i];
      var t   = RT.state.BUILDING_TYPES[tid];
      var canAfford = s.money >= t.cost;
      var fitsHere  = !shopPreTile || RT.state.canPlace(tid, shopPreTile.col, shopPreTile.row);
      var disabled  = !canAfford || (shopPreTile && !fitsHere);
      var label;
      if (!canAfford)                    label = 'Zu teuer';
      else if (shopPreTile && !fitsHere) label = 'Passt hier nicht';
      else                               label = shopPreTile ? 'Hier bauen' : 'Wählen';

      cardsHtml +=
        '<div class="shop-card">' +
          '<div class="s-icon">' + t.icon + '</div>' +
          '<div class="s-info">' +
            '<b>' + t.name + '</b>' +
            '<small>' + t.size + '×' + t.size + ' · ' + fmtMoney(t.cost) + '</small>' +
          '</div>' +
          '<button class="shop-buy-btn" data-t="' + tid + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>' +
        '</div>';
    }

    openModal('🛒 Shop', '<div class="shop-hint">' + hint + '</div>' + cardsHtml, { type: 'shop' });
  }

  // ---- Effekte ----
  function onEffect(payload) {
    var where = payload.where; // instanceId
    var host = document.querySelector('[data-instance-id="' + where + '"]');
    if (!host) return;
    var rect = host.getBoundingClientRect();
    var worldRect = el.world.getBoundingClientRect();
    var cx = rect.left + rect.width / 2 - worldRect.left;
    var cy = rect.top  + rect.height * 0.3 - worldRect.top;
    spawnBurst(cx, cy, payload.icon);
    if (payload.text) spawnFloatText(cx, cy, payload.text, colorForInstance(where, host));
  }
  function colorForInstance(instanceId, host) {
    var typeId = host && host.getAttribute('data-b');
    if (typeId === 'werbe') return '';
    if (typeId === 'farm') return 'blue';
    if (typeId === 'marketing') return 'green';
    return '';
  }
  function spawnBurst(x, y, icon) {
    for (var i = 0; i < 8; i++) {
      var s = document.createElement('span');
      s.className = 'burst';
      s.textContent = icon;
      s.style.left = x + 'px';
      s.style.top  = y + 'px';
      var ang = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
      var dist = 40 + Math.random() * 30;
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist - 30) + 'px');
      el.world.appendChild(s);
      (function (node) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 900);
      })(s);
    }
  }
  function spawnFloatText(x, y, text, colorClass) {
    var t = document.createElement('div');
    t.className = 'float-text' + (colorClass ? ' ' + colorClass : '');
    t.textContent = text;
    t.style.left = x + 'px';
    t.style.top  = y + 'px';
    el.world.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1200);
  }

  // ---- Toast ----
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1800);
  }

  RT.ui = { init: init, toast: toast };
})(window.RT3);

/* ─────────────────────────────────────────────────────────────────────
   Onboarding-/Game-UI-Erweiterungen: Profile-Bar, Resource-Bar mit
   Sparkline-Verlaufsgraph, Delta-Popups. Portiert aus der Ursprungs-
   version (js/core/ui.js). Angebunden an RT3.state.current und
   RT3.bus 'state:changed'. Sparkline-Sample alle 30 s.
   ───────────────────────────────────────────────────────────────────── */
(function (RT) {
  'use strict';

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + ' Mio';
    if (n >= 1000)    return (n / 1000).toFixed(1) + ' k';
    return String(Math.round(n));
  }

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
    var pad = 0.1;
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

  function profileBarHTML(player) {
    player = player || {};
    var head = RT.assets && player.avatar        ? RT.assets.avatarSrc(player.avatar, 'head') : '';
    var logo = RT.assets && player.platformLogo  ? RT.assets.logoSrc(player.platformLogo)     : '';
    var name = escapeHTML(player.name || '');
    var platform = escapeHTML(player.platformName || '');
    // Shop-Button in der Kopfzeile mittig zwischen Player und Plattform —
    // wie in der Ursprungsversion (rt-shop-btn in rt-top-nav).
    return ''
      + '<div class="rt-profile-bar">'
      + '  <div class="rt-profile-bar__player">'
      +      (head ? '<img class="rt-profile-bar__head" src="' + head + '" alt="">' : '')
      + '    <span class="rt-profile-bar__name">' + name + '</span>'
      + '  </div>'
      + '  <button class="rt-shop-btn" id="shop-btn" aria-label="Shop">🛒</button>'
      + '  <div class="rt-profile-bar__brand">'
      + '    <span class="rt-profile-bar__platform">' + platform + '</span>'
      +      (logo ? '<img class="rt-profile-bar__logo" src="' + logo + '" alt="">' : '')
      + '  </div>'
      + '</div>';
  }

  // Resource-Bar für v3: 5 Kacheln (Geld · User · Watchtime · Ruf · Server).
  // Geld + User haben die Sparkline im Hintergrund.
  function resourceBarHTML() {
    return ''
      + '<div class="rt-resources rt-resources--with-rep rt-resources--with-watchtime">'
      + '  <div class="rt-resource rt-resource--chart" id="rt-res-money-card">'
      + '    <canvas class="rt-sparkline" data-spark="money" width="140" height="56"></canvas>'
      + '    <span class="rt-resource__icon">💰</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Geld</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="money">0</span> €</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--chart" id="rt-res-users-card">'
      + '    <canvas class="rt-sparkline" data-spark="users" width="140" height="56"></canvas>'
      + '    <span class="rt-resource__icon">👥</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">User</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="users">0</span></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource">'
      + '    <span class="rt-resource__icon">⏳</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Watchtime</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="watchtime">0</span></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--rep">'
      + '    <div class="rt-resource__rep-inner">'
      + '      <div class="rt-resource__rep-header">'
      + '        <div class="rt-resource__label">Ruf</div>'
      + '        <span class="rt-rep-value" id="rt-rep-value">0%</span>'
      + '      </div>'
      + '      <div class="rt-rep-track">'
      + '        <div class="rt-rep-empty" id="rt-rep-empty"></div>'
      + '        <div class="rt-rep-marker"></div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--server">'
      + '    <span class="rt-resource__icon">🖥️</span>'
      + '    <div class="rt-resource__server-inner">'
      + '      <div class="rt-resource__server-header">'
      + '        <span class="rt-resource__label">Server</span>'
      + '        <span class="rt-resource__value rt-resource__server-val">'
      + '          <span data-rt-res="serverUsed">0</span>/<span data-rt-res="serverCap">0</span>'
      + '        </span>'
      + '      </div>'
      + '      <div class="rt-server-bar">'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--usr" id="rt-server-seg-usr"></div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function bindResourceBar(container) {
    var refs = {
      money:       container.querySelector('[data-rt-res="money"]'),
      users:       container.querySelector('[data-rt-res="users"]'),
      watchtime:   container.querySelector('[data-rt-res="watchtime"]'),
      serverUsed:  container.querySelector('[data-rt-res="serverUsed"]'),
      serverCap:   container.querySelector('[data-rt-res="serverCap"]'),
      moneyCanvas: container.querySelector('[data-spark="money"]'),
      usersCanvas: container.querySelector('[data-spark="users"]'),
      moneyCard:   container.querySelector('#rt-res-money-card'),
      repEmpty:    container.querySelector('#rt-rep-empty'),
      repValue:    container.querySelector('#rt-rep-value'),
      repCard:     container.querySelector('.rt-resource--rep'),
      serverSeg:   container.querySelector('#rt-server-seg-usr'),
      serverCard:  container.querySelector('.rt-resource--server')
    };

    var prev = null;
    var pending = {};
    var batchTimer = null;

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
      if (pending.money) spawnDelta(refs.money, pending.money);
      if (pending.users) spawnDelta(refs.users, pending.users);
      pending = {};
    }

    function refresh() {
      var s     = RT.state.current;
      var money = Math.floor(s.money || 0);
      var users = Math.floor(s.users || 0);
      var wt    = Math.floor(s.watchtime || 0);
      var cap   = RT.state.serverCapacityTotal ? RT.state.serverCapacityTotal() : 0;
      var used  = users;

      if (prev !== null) {
        var dm = money - prev.money;
        var du = users - prev.users;
        if (dm) pending.money = (pending.money || 0) + dm;
        if (du) pending.users = (pending.users || 0) + du;
        if (dm || du) {
          if (batchTimer) clearTimeout(batchTimer);
          batchTimer = setTimeout(flushDeltas, 60);
        }
      }
      prev = { money: money, users: users };

      if (refs.money)      refs.money.textContent      = formatNumber(money);
      if (refs.users)      refs.users.textContent      = formatNumber(users);
      if (refs.watchtime)  refs.watchtime.textContent  = formatNumber(wt);
      if (refs.serverUsed) refs.serverUsed.textContent = formatNumber(used);
      if (refs.serverCap)  refs.serverCap.textContent  = formatNumber(cap);

      var usrPct = cap > 0 ? Math.min(100, used / cap * 100) : 0;
      if (refs.serverSeg) refs.serverSeg.style.width = usrPct.toFixed(2) + '%';
      if (refs.serverCard) {
        refs.serverCard.classList.toggle('rt-resource--critical', cap > 0 && used / cap >= 0.95);
      }
      if (refs.moneyCard) refs.moneyCard.classList.toggle('rt-resource--money-negative', money < 0);
    }

    function refreshRep() {
      if (!refs.repEmpty) return;
      var rep = RT.state.current.ruf;
      if (typeof rep !== 'number') rep = 0;
      // Skala: -0.30 (links) … 0 (Marker bei 60 %) … +0.20 (rechts).
      var t = (rep - (-0.30)) / (0.20 - (-0.30));
      t = Math.max(0, Math.min(1, t));
      refs.repEmpty.style.width = ((1 - t) * 100).toFixed(1) + '%';
      if (refs.repValue) {
        var pct = Math.round(rep * 1000) / 10;
        refs.repValue.textContent = (pct > 0 ? '+' : '') + pct + '%';
      }
      if (refs.repCard) refs.repCard.classList.toggle('rt-resource--critical', rep < -0.10);
    }

    function drawSparks() {
      var h = RT.state.current.sparkHistory || { money: [], users: [] };
      drawSparkline(refs.moneyCanvas, h.money,
        'rgba(34,197,94,0.45)', 'rgba(34,197,94,0.10)');
      drawSparkline(refs.usersCanvas, h.users,
        'rgba(59,130,246,0.45)', 'rgba(59,130,246,0.10)');
    }

    refresh();
    refreshRep();
    drawSparks();

    function onState() { refresh(); refreshRep(); }
    RT.bus.on('state:changed', onState);

    // Tick emittiert state:changed nicht, aber Watchtime + Ruf ändern sich
    // kontinuierlich. Throttled Refresh alle ~250 ms.
    var lastTickRefresh = 0;
    function onTick() {
      var now = performance.now();
      if (now - lastTickRefresh < 250) return;
      lastTickRefresh = now;
      refresh();
      refreshRep();
    }
    RT.bus.on('tick', onTick);

    // Sparkline-Sample alle 20 Sekunden.
    var sampleTimer = setInterval(function () {
      if (RT.state.pushSparkSample) RT.state.pushSparkSample();
      drawSparks();
    }, 20000);

    return function () {
      RT.bus.off('state:changed', onState);
      RT.bus.off('tick', onTick);
      clearInterval(sampleTimer);
      if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
    };
  }

  // An RT3.ui anhängen — die IIFE oben hat es bereits mit init/toast befüllt.
  RT.ui.escapeHTML      = escapeHTML;
  RT.ui.formatNumber    = formatNumber;
  RT.ui.drawSparkline   = drawSparkline;
  RT.ui.profileBarHTML  = profileBarHTML;
  RT.ui.resourceBarHTML = resourceBarHTML;
  RT.ui.bindResourceBar = bindResourceBar;
})(window.RT3);

