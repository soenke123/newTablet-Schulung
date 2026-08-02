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

  // Sichtbarkeit eines Notification-Badges für ein UI-Element.
  // Phase-Wechsel setzt HQ-Badge automatisch neu (eigener Key pro Phase).
  function shouldShowBadge(uiKey) {
    var s = RT.state.current;
    if (uiKey === 'hq') {
      var phase = RT.state.currentPhase();
      if (phase === 0) return !s.seenBadges.hq_phase0;
      if (phase === 1) return !s.seenBadges.hq_phase1;
      return false;
    }
    if (uiKey === 'shop')          return !s.seenBadges.shop;
    if (uiKey === 'tab_marketing') return !s.seenBadges.tab_marketing;
    if (uiKey === 'tab_werbung')   return !s.seenBadges.tab_werbung;
    return false;
  }

  function buildIsoGrid() {
    var grid = document.getElementById('iso-grid');
    if (!grid) return;
    grid.innerHTML = '';

    var world = el.world;
    var w = world.clientWidth;
    var h = world.clientHeight;

    // Grid-Konfiguration: Phase 0/1 → 3×3 Freizone. Phase 2 → 4×4 Freizone
    // eingebettet in 20×20 Kranz aus grauen (gesperrten) Feldern.
    var gs = RT.state.gridSizeEffective();

    // Zentriert die Freizone im Weltcontainer: Diamant-Mitte der Freizone
    // sitzt exakt auf (w/2, h/2).
    var offsetX = w / 2;
    var offsetY = h / 2 - (gs.free - 1) * TILE_H / 2;

    // Rasenkacheln zeichnen. Freizone [0, free-1] ist klickbar (Shop/Placement),
    // Kranz außenrum wird als .iso-tile--locked ohne Klick gerendert.
    for (var r = gs.min; r <= gs.max; r++) {
      for (var c = gs.min; c <= gs.max; c++) {
        var tx = (c - r) * TILE_W / 2 + offsetX;
        var ty = (c + r) * TILE_H / 2 + offsetY;
        var tile = document.createElement('div');
        var isFree = (c >= 0 && c < gs.free && r >= 0 && r < gs.free);
        tile.className = isFree ? 'iso-tile' : 'iso-tile iso-tile--locked';
        tile.dataset.col = c;
        tile.dataset.row = r;
        tile.style.left = tx + 'px';
        tile.style.top  = ty + 'px';
        if (isFree) tile.addEventListener('click', onTileClick);
        grid.appendChild(tile);
      }
    }

    // Gebäude setzen (aus placedBuildings)
    var pb = RT.state.current.placedBuildings;
    for (var i = 0; i < pb.length; i++) {
      var inst = pb[i];
      var sprite, alt;
      if (inst.id === 'hq') {
        var lvl = (inst.state && inst.state.level) || 0;
        sprite = 'sprites/buildings/HeadQuarter' + lvl + '.png';
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
      // Farm-Ernte-UI (Ring + Harvest-Button) erst ab Phase 2 relevant —
      // Watchtime tickt vorher nicht, also kein Sinn im Kreis.
      var phaseNow = RT.state.currentPhase ? RT.state.currentPhase() : 2;
      var farms = phaseNow >= 2 ? RT.state.instancesByType('farm') : [];
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

      // HQ-UI: Ring während Entwicklung + pulsierender Collect-Button wenn ready
      var hqs = RT.state.instancesByType('hq');
      for (var hi = 0; hi < hqs.length; hi++) {
        var hq = hqs[hi];
        var hqExtraY = (hq.size === 2) ? TILE_H / 2 : 0;
        var hqbx = (hq.col - hq.row) * TILE_W / 2 + offsetX;
        var hqby = (hq.col + hq.row) * TILE_H / 2 + offsetY + hqExtraY;

        var hqui = document.createElement('div');
        hqui.className = 'mk-ui'; // Wiederverwendung des Marketing-UI-Layouts
        hqui.setAttribute('data-hq-ui', hq.instanceId);
        hqui.style.left = hqbx + 'px';
        hqui.style.top  = hqby + 'px';
        var hqBadgeHtml = shouldShowBadge('hq') ? '<span class="rt-notif-badge rt-notif-badge--hq">!</span>' : '';
        hqui.innerHTML =
          '<div class="mk-ring" data-hq-ring>' +
            '<div class="mk-ring-inner"><span class="mk-ring-text" data-hq-ring-text></span></div>' +
          '</div>' +
          '<button class="mk-collect-btn" data-hq-collect type="button"></button>' +
          hqBadgeHtml;
        uiLayer.appendChild(hqui);
        updateHqUi(hqui);

        var hqCollectBtn = hqui.querySelector('[data-hq-collect]');
        (function (hqInst, btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var ready = RT.techtree.readyNode();
            if (!ready) return;
            var res = RT.actions.completeTechNode(ready.id);
            if (!res.ok) { toast(res.msg || 'Kann nicht abgeschlossen werden'); return; }
            // Feuerwerk am HQ + Node-Name
            var host = document.querySelector('.building[data-instance-id="' + hqInst.instanceId + '"]');
            if (host && el.world) {
              var r  = host.getBoundingClientRect();
              var wr = el.world.getBoundingClientRect();
              var cx = r.left + r.width / 2 - wr.left;
              var cy = r.top  + r.height * 0.3 - wr.top;
              spawnFireworks(cx, cy);
              spawnFloatText(cx, cy, '✓ ' + ready.def.name, 'green');
            }
          });
        })(hq, hqCollectBtn);
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

      // Werbeagentur-UI: Ring zeigt den laufenden Deal-Zyklus, der Gold-Button
      // sammelt Geld ein bzw. bucht den letzten Deal mit einem Klick neu.
      var wbs = phaseNow >= 2 ? RT.state.instancesByType('werbe') : [];
      for (var wi = 0; wi < wbs.length; wi++) {
        var wb = wbs[wi];
        var wExtraY = (wb.size === 2) ? TILE_H / 2 : 0;
        var wbx = (wb.col - wb.row) * TILE_W / 2 + offsetX;
        var wby = (wb.col + wb.row) * TILE_H / 2 + offsetY + wExtraY;

        var wui = document.createElement('div');
        wui.className = 'wb-ui';
        wui.setAttribute('data-instance-id', wb.instanceId);
        wui.style.left = wbx + 'px';
        wui.style.top  = wby + 'px';
        wui.innerHTML =
          '<div class="mk-ring" data-ring>' +
            '<div class="mk-ring-inner"><span class="mk-ring-text" data-ring-text></span></div>' +
          '</div>' +
          '<button class="farm-harvest-btn" data-collect type="button"></button>';
        uiLayer.appendChild(wui);
        updateWerbeUi(wui, wb);

        var wbBtn = wui.querySelector('[data-collect]');
        (function (iid, btn) {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            werbeFieldAction(iid, btn);
          });
        })(wb.instanceId, wbBtn);
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

  // Zeichnet Kisten (Programm) + Tier-Sprites (User) organisch auf der Weide.
  // Kisten haben Slot-VORRANG und belegen die hinteren Positionen (Positionen 0..boxes-1).
  // Tiere füllen die vorderen restlichen Positionen (boxes..boxes+animals-1).
  function updateFarmAnimals(bldEl, inst) {
    var fs   = inst.state;
    var tier = RT.state.tierById(fs.tierId);
    if (!tier) return;
    var animalsEl = bldEl.querySelector('[data-animals]');
    if (!animalsEl) return;

    var slots = RT.state.farmSlots(inst);
    var boxes = slots.boxes;
    var count = slots.animals;
    var total = boxes + count;

    // Signatur zum Diff-Vergleich, damit wir nicht bei jedem Frame neu rendern.
    var sig = tier.id + ':' + boxes + ':' + count;
    var currentSig = animalsEl.getAttribute('data-sig');
    if (currentSig === sig) return;
    animalsEl.setAttribute('data-sig', sig);

    var html = '';
    for (var i = 0; i < total; i++) {
      var p = ANIMAL_POSITIONS[i % ANIMAL_POSITIONS.length];
      var isBox = i < boxes;
      var src   = isBox ? 'sprites/User/Codekiste.png' : tier.sprite;
      var alt   = isBox ? 'Programmcode' : tier.alt;
      html += '<img class="farm-animal' + (isBox ? ' farm-box' : '') + '"'
            + ' style="--i:' + i + ';--x:' + p.x + '%;--y:' + p.y + '%;z-index:' + Math.round(p.y) + '"'
            + ' src="' + src + '"'
            + ' alt="' + alt + '"'
            + ' draggable="false">';
    }
    animalsEl.innerHTML = html;
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

  // HQ-UI: Ring zählt Entwicklungs-Restzeit runter, Button erscheint sobald
  // eine Node abholbereit ist. Beides versteckt, wenn nichts läuft/bereit ist.
  function updateHqUi(uiEl) {
    if (!RT.techtree) return;
    var ring     = uiEl.querySelector('[data-hq-ring]');
    var ringText = uiEl.querySelector('[data-hq-ring-text]');
    var btn      = uiEl.querySelector('[data-hq-collect]');

    var active = RT.techtree.activeNode();
    var ready  = RT.techtree.readyNode();

    if (active) {
      var elapsed   = (Date.now() - active.entry.startAt) / 1000;
      var remaining = Math.max(0, active.def.durationSec - elapsed);
      var pct       = Math.min(100, (elapsed / active.def.durationSec) * 100);
      if (ring) {
        ring.style.setProperty('--p', pct);
        ring.style.visibility = 'visible';
        ring.classList.add('is-active');
      }
      if (ringText) ringText.textContent = Math.ceil(remaining) + 's';
    } else {
      if (ring) {
        ring.style.visibility = 'hidden';
        ring.classList.remove('is-active');
      }
      if (ringText) ringText.textContent = '';
    }

    if (btn) {
      if (ready) {
        btn.style.visibility = 'visible';
        btn.classList.add('is-ready');
        btn.textContent = '✓ ' + ready.def.name;
        btn.disabled = false;
      } else {
        btn.style.visibility = 'hidden';
        btn.classList.remove('is-ready');
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

  // Werbeagentur-UI: Ring = Fortschritt des laufenden Zyklus, Ring-Text = "3/5".
  // Der Button hat drei sich ausschließende Zustände (Priorität von oben):
  //   1. Geld liegt bereit  → einsammeln
  //   2. kein Deal, aber lastDeal + genug Watchtime → Ein-Klick-Wiederbuchung
  //   3. sonst versteckt
  function updateWerbeUi(uiEl, inst) {
    var ws = inst.state;
    var ring     = uiEl.querySelector('[data-ring]');
    var ringText = uiEl.querySelector('[data-ring-text]');
    var btn      = uiEl.querySelector('[data-collect]');
    var type     = ws.deal ? RT.state.adTypeById(ws.deal.typeId) : null;

    if (ring) {
      if (ws.deal && type) {
        ring.style.setProperty('--p', Math.min(100, (ws.deal.cycleTime / type.duration) * 100));
        ring.classList.add('is-active');
        if (ringText) ringText.textContent = (ws.deal.cyclesDone + 1) + '/' + RT.state.AD_CYCLES_MAX;
      } else {
        ring.style.setProperty('--p', 0);
        ring.classList.remove('is-active');
        if (ringText) ringText.textContent = '';
      }
    }

    if (!btn) return;
    var ready = Math.floor(ws.moneyReady || 0);
    if (ready > 0) {
      btn.style.visibility = '';
      btn.classList.add('is-ready');
      btn.textContent = '💰 +' + fmtMoney(ready).replace(' €', '€');
      btn.disabled = false;
      btn.setAttribute('data-mode', 'collect');
      return;
    }

    var last     = ws.lastDeal;
    var lastType = last ? RT.state.adTypeById(last.typeId) : null;
    if (!ws.deal && lastType && RT.state.current.watchtime >= lastType.watchtime) {
      btn.style.visibility = '';
      btn.classList.add('is-ready');
      btn.textContent = '🔁 ' + lastType.name + ' ' + Math.round(last.intensity * 100) + '%';
      btn.disabled = false;
      btn.setAttribute('data-mode', 'rebook');
      return;
    }

    btn.style.visibility = 'hidden';
    btn.classList.remove('is-ready');
    btn.disabled = true;
    btn.removeAttribute('data-mode');
  }

  // Klick auf den Gold-Button der Werbeagentur — je nach Zustand einsammeln
  // oder den letzten Deal erneut buchen.
  function werbeFieldAction(instanceId, btnEl) {
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    if (btnEl.getAttribute('data-mode') === 'rebook') {
      var last = inst.state.lastDeal;
      if (!last) return;
      var res = RT.actions.bookAdDeal(instanceId, last.typeId, last.intensity);
      if (!res.ok) toast(res.msg || 'Deal kann nicht starten');
      return;
    }
    collectMoneyFromField(instanceId, btnEl);
  }

  // Geld einsammeln — erst der Effekt (braucht das Button-Rect), dann die Action.
  function collectMoneyFromField(instanceId, btnEl) {
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    var amount = Math.floor(inst.state.moneyReady || 0);
    if (amount <= 0) return;
    spawnMoneyFly(btnEl, amount);
    popResourceCard(el.moneyCard, 1.5);
    RT.actions.collectWerbeMoney(instanceId);
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
    popResourceCard(el.usersCard, 1.4 + Math.min(1, willAdd / Math.max(1, cap)) * 0.6);
    RT.actions.collectMarketingUsers(instanceId);
  }

  // --- Fly-Bubbles ---
  // Hängen an <body> mit position:fixed, NICHT an #world: #world hat
  // overflow:hidden und die Ressourcen-Bar liegt darüber — im World-Container
  // würde die Bubble auf dem Weg nach oben abgeschnitten.
  function spawnFly(fromEl, toEl, className, text, opts) {
    if (!fromEl || !toEl) return;
    opts = opts || {};
    var fromRect = fromEl.getBoundingClientRect();
    var toRect   = toEl.getBoundingClientRect();
    var startX = fromRect.left + fromRect.width  / 2 + (opts.ox || 0);
    var startY = fromRect.top  + fromRect.height / 2 + (opts.oy || 0);
    var endX   = toRect.left   + toRect.width    / 2;
    var endY   = toRect.top    + toRect.height   / 2;

    var bubble = document.createElement('div');
    bubble.className = className;
    bubble.textContent = text;
    bubble.style.left = startX + 'px';
    bubble.style.top  = startY + 'px';
    if (opts.fontSize) bubble.style.fontSize = opts.fontSize + 'px';
    bubble.style.setProperty('--dx', (endX - startX) + 'px');
    bubble.style.setProperty('--dy', (endY - startY) + 'px');
    document.body.appendChild(bubble);
    setTimeout(function () {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, opts.life || 750);
  }

  // Kurzer Scale-Puls auf einer Ressourcen-Kachel.
  function popResourceCard(cardEl, scale) {
    if (!cardEl) return;
    cardEl.style.setProperty('--pop-scale', scale.toFixed(2));
    cardEl.classList.remove('res-pop');
    void cardEl.offsetWidth;
    cardEl.classList.add('res-pop');
  }

  function spawnUserFly(fromEl, amount) {
    spawnFly(fromEl, el.usersCard, 'user-fly', '+' + fmtNum(amount) + ' 👥');
  }

  function spawnMoneyFly(fromEl, amount) {
    spawnFly(fromEl, el.moneyCard, 'money-fly', '+' + fmtMoney(amount).replace(' €', '€'));
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
    // Pop-Scale wächst mit Stacks: 1.3 (1 stack) … 2.1 (5 stacks)
    popResourceCard(el.watchtimeCard, 1.3 + stacks * 0.16);
    RT.actions.harvestFarm(instanceId);
  }

  function spawnWatchtimeFly(fromEl, amount, stacks) {
    // Haupt-Bubble: 20 px (1 Stack) … 52 px (5 Stacks)
    spawnFly(fromEl, el.watchtimeCard, 'wt-fly', '+' + fmtNum(amount) + ' ⏳',
             { fontSize: 20 + stacks * 6 });

    // Trailing Mini-Sanduhren pro Stack — kleiner, zeitversetzt, leicht gestreut.
    for (var i = 1; i < stacks; i++) {
      (function (idx) {
        setTimeout(function () {
          spawnFly(fromEl, el.watchtimeCard, 'wt-fly wt-fly-mini', '⏳', {
            ox: (Math.random() - 0.5) * 60,
            oy: (Math.random() - 0.5) * 30,
            life: 700
          });
        }, 70 * idx);
      })(i);
    }
  }

  // ---- Init ----
  function init() {
    // Ziel-Kacheln der Fly-Effekte. Die Zahlen darin schreibt bindResourceBar
    // über [data-rt-res] — hier wird nur die Kachel als Flugziel gebraucht,
    // also NIEMALS textContent auf diese Refs setzen.
    el.moneyCard        = document.getElementById('rt-res-money-card');
    el.usersCard        = document.getElementById('rt-res-users-card');
    el.watchtimeCard    = document.querySelector('.rt-resource--watchtime');
    el.resServercap     = document.getElementById('res-servercap');
    el.resServercapWrap = document.getElementById('res-servercap-wrap');

    el.world          = document.getElementById('world');
    el.worldCamera    = document.getElementById('world-camera');
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
    if (RT.camera && RT.camera.init) RT.camera.init(el.world, el.worldCamera);
    window.addEventListener('resize', function () {
      buildIsoGrid();
      if (placementMode) updateTileHighlights();
    });

    el.modalClose.addEventListener('click', closeModal);
    el.modalBackdrop.addEventListener('click', function (e) {
      if (e.target === el.modalBackdrop) closeModal();
    });
    el.shopBtn.addEventListener('click', function () {
      RT.state.markSeen('shop');
      if (placementMode) exitPlacement();
      openShopModal(null);
    });
    el.placementCancel.addEventListener('click', exitPlacement);

    RT.bus.on('state:changed', onStateChanged);
    RT.bus.on('effect',        onEffect);
    RT.bus.on('tick',          frameTick);
    RT.bus.on('toast',         toast);
    RT.bus.on('ad:finished',   onAdFinished);

    renderAll();
  }

  var _lastKnownPhase = -1;
  function onStateChanged() {
    // Grid neu bauen — neues Gebäude, Layout kann sich geändert haben
    buildIsoGrid();
    if (placementMode) updateTileHighlights();
    // Bei Phasen-Wechsel Zoom/Pan zurücksetzen (kleines Grid → 1.5×, großes → 1.0×).
    var phase = RT.state.currentPhase ? RT.state.currentPhase() : 0;
    if (phase !== _lastKnownPhase) {
      _lastKnownPhase = phase;
      if (RT.camera && RT.camera.resetForPhase) RT.camera.resetForPhase();
    }
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
    else if (inst.id === 'hq') {
      var phase = RT.state.currentPhase();
      if (phase === 0) RT.state.markSeen('hq_phase0');
      if (phase === 1) RT.state.markSeen('hq_phase1');
      openHQModal();
    }
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

    // Die Zahlen in der Ressourcen-Bar schreibt RT3.ui.bindResourceBar.
    if (el.resServercap) el.resServercap.textContent = fmtNum(cap);

    if (el.resServercapWrap) {
      var full = cap > 0 && s.users >= cap;
      var warn = cap > 0 && s.users >= cap * 0.95;
      el.resServercapWrap.classList.toggle('res-cap-full', full);
      el.resServercapWrap.classList.toggle('res-cap-warn', warn && !full);
    }

    // Farm-Felder aktualisieren (Tiere, Stack-Anzeige, Ernte-Button)
    updateAllFarmFields();

    // Online-Button ein-/ausblenden je nach Techtree-Status
    updateOnlineButton();

    // Online-Dot in Profile-Bar togglen
    var pb = document.querySelector('.rt-profile-bar');
    if (pb) pb.classList.toggle('is-online', !!s.goLiveUnlocked);

    // Modal ggf. aktualisieren
    if (modalContext) refreshModal();
  }

  // ---- Frame-Tick (nur visuelle Zwischenwerte) ----
  function frameTick() {
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
    var wbs = RT.state.instancesByType('werbe');
    for (var wi = 0; wi < wbs.length; wi++) {
      var wiid = wbs[wi].instanceId;
      var wuiEl = document.querySelector('.wb-ui[data-instance-id="' + wiid + '"]');
      if (wuiEl) updateWerbeUi(wuiEl, wbs[wi]);
    }
    var hqs = RT.state.instancesByType('hq');
    for (var hi = 0; hi < hqs.length; hi++) {
      var hqid = hqs[hi].instanceId;
      var hquiEl = document.querySelector('[data-hq-ui="' + hqid + '"]');
      if (hquiEl) updateHqUi(hquiEl);
    }
  }

  // ---- Modal ----
  function openModal(title, bodyHtml, context) {
    modalContext = context;
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML    = bodyHtml;
    el.modal.classList.remove('modal-lg'); // Standard-Größe für Farm/Werbe/Shop
    el.modalBackdrop.classList.add('open');
    wireModalButtons();
  }
  function closeModal() {
    modalContext = null;
    sliderDragging = false;
    shopPreTile   = null;
    el.modalBackdrop.classList.remove('open');
    el.modal.classList.remove('modal-lg');
    el.modalBody.innerHTML = '';
  }
  function refreshModal() {
    if (!modalContext) return;
    if (modalContext.type === 'trend') { el.modalBody.innerHTML = trendInfoHtml(); return; }
    if (modalContext.type === 'shop' || modalContext.type === 'hq') return;
    var inst = RT.state.getInstance(modalContext.instanceId);
    if (!inst) { closeModal(); return; }
    if (modalContext.type === 'farm')      renderFarmBody(inst);
    else if (modalContext.type === 'werbe')     renderWerbeBody(inst);
    else if (modalContext.type === 'marketing') renderMarketingBody(inst);
  }
  function refreshModalLive() {
    if (!modalContext) return;
    // Trend-Modal komplett neu zeichnen — die Werte laufen kontinuierlich.
    if (modalContext.type === 'trend') { el.modalBody.innerHTML = trendInfoHtml(); return; }
    if (modalContext.type === 'shop' || modalContext.type === 'hq') return;
    var inst = RT.state.getInstance(modalContext.instanceId);
    if (!inst) return;

    if (modalContext.type === 'werbe') {
      var ws = inst.state;
      var collectBtn = document.getElementById('werbe-collect-btn');
      var mReady = Math.floor(ws.moneyReady || 0);
      if (collectBtn) {
        collectBtn.disabled    = mReady <= 0;
        collectBtn.textContent = '💰 Einsammeln (' + fmtMoney(mReady).replace(' €', '€') + ')';
      }
      var wtEl = document.getElementById('werbe-wt-val');
      if (wtEl) wtEl.textContent = fmtNum(RT.state.current.watchtime);

      // Laufender Deal: Restzeit + Zyklus-Fortschritt.
      var runInfoW = document.getElementById('werbe-running-info');
      var fillW    = document.getElementById('werbe-modal-fill');
      if (ws.deal) {
        var tW = RT.state.adTypeById(ws.deal.typeId);
        if (tW) {
          if (runInfoW) {
            runInfoW.innerHTML =
              tW.icon + ' <b>' + tW.name + '</b> · ' + Math.round(ws.deal.intensity * 100) + ' % — ' +
              'Zyklus ' + (ws.deal.cyclesDone + 1) + ' / ' + RT.state.AD_CYCLES_MAX + ', noch ' +
              Math.max(0, Math.ceil(tW.duration - ws.deal.cycleTime)) + 's';
          }
          if (fillW) fillW.style.width = Math.min(100, (ws.deal.cycleTime / tW.duration) * 100) + '%';
        }
      }

      // Buchen-Buttons: Watchtime kann sich jederzeit ändern.
      var adBtnsLive = document.querySelectorAll('[data-ad]');
      for (var bi = 0; bi < adBtnsLive.length; bi++) {
        var b    = adBtnsLive[bi];
        var aDef = RT.state.adTypeById(b.getAttribute('data-ad'));
        if (!aDef) continue;
        var blocked = ws.deal ? 'Es läuft schon ein Deal'
                    : (RT.state.current.watchtime < aDef.watchtime ? 'Zu wenig Watchtime' : '');
        b.disabled = !!blocked;
        if (blocked) b.setAttribute('title', blocked); else b.removeAttribute('title');
      }
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
      // Der Slider setzt nichts im State — sein Wert wird erst beim Buchen
      // übernommen. Hier läuft nur die Live-Vorschau aller Werbearten.
      slider.addEventListener('input', function (e) {
        var pct = parseInt(e.target.value, 10);
        var lbl = document.getElementById('werbe-slider-label');
        if (lbl) lbl.innerHTML = 'Intensität: <b>' + pct + '%</b>';
        var previews = document.querySelectorAll('[data-ad-preview]');
        for (var p = 0; p < previews.length; p++) {
          previews[p].textContent = adPreviewText(previews[p].getAttribute('data-ad-preview'), pct / 100);
        }
      });
      slider.addEventListener('pointerdown', function () { sliderDragging = true; });
      slider.addEventListener('pointerup',   function () { sliderDragging = false; });
      slider.addEventListener('pointercancel', function () { sliderDragging = false; });
    }

    var adBtns = document.querySelectorAll('[data-ad]');
    for (var ai = 0; ai < adBtns.length; ai++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var sl  = document.getElementById('werbe-slider');
          var pct = sl ? parseInt(sl.value, 10) : 25;
          var res = RT.actions.bookAdDeal(btn.getAttribute('data-inst'),
                                          btn.getAttribute('data-ad'), pct / 100);
          if (!res.ok) toast(res.msg || 'Deal kann nicht starten');
        });
      })(adBtns[ai]);
    }

    var cancelWerbe = document.getElementById('werbe-cancel-btn');
    if (cancelWerbe) cancelWerbe.addEventListener('click', function () {
      RT.actions.cancelAdDeal(cancelWerbe.getAttribute('data-inst'));
    });

    var collectWerbe = document.getElementById('werbe-collect-btn');
    if (collectWerbe) collectWerbe.addEventListener('click', function () {
      collectMoneyFromField(collectWerbe.getAttribute('data-inst'), collectWerbe);
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
          // Hardware-Kauf (kein Grid-Placement)
          var hwId = btn.getAttribute('data-hw');
          if (hwId) {
            var hres = RT.actions.purchaseItem(hwId);
            if (hres.ok) closeModal();
            else toast(hres.msg);
            return;
          }
          // Gebäude-Kauf
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
    var pInFarm = RT.state.programmInFarm(inst);
    var cap     = RT.state.farmCapacity(inst);
    var slots   = RT.state.farmSlots(inst);
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
      '<div class="info-line">Kapazität: <span class="info-highlight">' + fmtNum(cap) + '</span> — davon ' +
        '<span class="info-highlight">' + fmtNum(pInFarm) + ' Programm</span> ' +
        '(' + slots.boxes + ' 📦) + ' +
        '<span class="info-highlight">' + fmtNum(uInFarm) + ' User</span> ' +
        '(' + slots.animals + ' ' + tier.icon + ')</div>' +
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
    var ws     = inst.state;
    var iid    = inst.instanceId;
    var mReady = Math.floor(ws.moneyReady || 0);
    var maxC   = RT.state.AD_CYCLES_MAX;
    // Intensität für die Buchungs-Vorschau: zuletzt genutzte, sonst 25 %.
    var pct = Math.round(((ws.lastDeal && ws.lastDeal.intensity) || 0.25) * 100);

    // --- Laufender Deal ---
    var runningHtml = '';
    if (ws.deal) {
      var t   = RT.state.adTypeById(ws.deal.typeId);
      var rem = Math.max(0, Math.ceil(t.duration - ws.deal.cycleTime));
      var cyclePct = Math.min(100, (ws.deal.cycleTime / t.duration) * 100);
      runningHtml =
        '<div class="info-line" id="werbe-running-info">' +
          t.icon + ' <b>' + t.name + '</b> · ' + Math.round(ws.deal.intensity * 100) + ' % — ' +
          'Zyklus ' + (ws.deal.cyclesDone + 1) + ' / ' + maxC + ', noch ' + rem + 's' +
        '</div>' +
        '<div class="progress"><div class="progress-fill" id="werbe-modal-fill" style="width:' + cyclePct + '%"></div></div>' +
        '<div class="info-line">Trend-Malus: <span class="info-highlight">−' +
          fmtTrendPlain(RT.state.adTrendMalus(t.id, ws.deal.intensity)) + ' Trend</span> · ' +
          'Ertrag: <span class="info-highlight">' +
          fmtMoney(Math.round(RT.state.adMoneyPerCycle(t.id, ws.deal.intensity))) + ' / Zyklus</span>' +
        '</div>' +
        '<button class="modal-btn danger" id="werbe-cancel-btn" data-inst="' + iid + '">' +
          '✖ Deal abbrechen' +
        '</button>' +
        '<div class="info-line info-small">Die Watchtime des angefangenen Zyklus verfällt dabei.</div>';
    } else {
      runningHtml = '<div class="info-line">Kein Deal aktiv — die Agentur kostet gerade keinen Trend.</div>';
    }

    // --- Buchbare Werbearten ---
    var rowsHtml = '';
    for (var i = 0; i < RT.state.AD_TYPES.length; i++) {
      var a = RT.state.AD_TYPES[i];
      var enough = RT.state.current.watchtime >= a.watchtime;
      var why = ws.deal ? 'Es läuft schon ein Deal' : (enough ? '' : 'Zu wenig Watchtime');
      rowsHtml +=
        '<div class="campaign-row ad-row">' +
          '<div class="c-icon">' + a.icon + '</div>' +
          '<div class="c-info">' +
            '<b>' + a.name + '</b>' +
            '<small>' + fmtNum(a.watchtime) + ' ⏳ · ' + a.duration + 's pro Zyklus</small>' +
            '<small class="ad-preview" data-ad-preview="' + a.id + '">' + adPreviewText(a.id, pct / 100) + '</small>' +
          '</div>' +
          '<button class="mk-start-btn" data-ad="' + a.id + '" data-inst="' + iid + '"' +
            (why ? ' disabled title="' + why + '"' : '') + '>Buchen</button>' +
        '</div>';
    }

    return (
      '<div class="info-line">Ein Deal läuft <b>' + maxC + ' Zyklen</b> und ist dann vorbei. ' +
        'Jeder Zyklus kostet Watchtime im Voraus — geht sie aus, bricht der Deal ab.</div>' +
      runningHtml +
      '<button class="modal-btn collect" id="werbe-collect-btn" data-inst="' + iid + '" ' + (mReady <= 0 ? 'disabled' : '') + '>' +
        '💰 Einsammeln (' + fmtMoney(mReady).replace(' €', '€') + ')' +
      '</button>' +
      '<div style="margin-top:16px; font-weight:600;">Neuen Deal buchen</div>' +
      '<div class="slider-wrap">' +
        '<label id="werbe-slider-label">Intensität: <b>' + pct + '%</b></label>' +
        '<input type="range" id="werbe-slider" data-inst="' + iid + '" min="1" max="50" value="' + pct + '">' +
        '<div class="slider-info">' +
          '<span>1% = schont den Trend</span>' +
          '<span>50% = maximaler Ertrag</span>' +
        '</div>' +
      '</div>' +
      '<div class="info-line info-small">Der Preis pro Zyklus bleibt gleich — hohe Intensität holt also ' +
        'mehr Geld aus derselben Watchtime, kostet aber überproportional Trend.</div>' +
      rowsHtml +
      '<div class="info-line">Verfügbare Watchtime: <span class="info-highlight" id="werbe-wt-val">' +
        fmtNum(RT.state.current.watchtime) + '</span></div>'
    );
  }

  // Eine Zeile "300 € / Zyklus · −1,8 Trend · voller Deal: 1.500 €"
  function adPreviewText(typeId, intensity) {
    var a = RT.state.adTypeById(typeId);
    if (!a) return '';
    var per   = RT.state.adMoneyPerCycle(typeId, intensity);
    var malus = RT.state.adTrendMalus(typeId, intensity);
    var maxC  = RT.state.AD_CYCLES_MAX;
    return fmtMoney(Math.round(per)) + ' / Zyklus · −' + fmtTrendPlain(malus) + ' Trend' +
           ' · ganzer Deal: ' + fmtMoney(Math.round(per * maxC)) +
           ' in ' + (a.duration * maxC) + 's';
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
    // Techtree-Modul übernimmt die Anzeige.
    modalContext = { type: 'hq' };
    if (RT.techtree && RT.techtree.open) {
      RT.techtree.open();
    }
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

    // Hardware-Sektion (immer sichtbar, wird zuerst gebraucht).
    var hardwareHtml = '<div class="shop-section-title">🖥️ Hardware</div>';
    var rechnerBought = !!s.purchases.rechner;
    var rechnerPrice  = 600;
    var rechnerCan    = s.money >= rechnerPrice && !rechnerBought;
    var rechnerLabel  = rechnerBought ? 'Gekauft ✓' : (s.money < rechnerPrice ? 'Zu teuer' : 'Kaufen');
    hardwareHtml +=
      '<div class="shop-card">' +
        '<div class="s-icon">💻</div>' +
        '<div class="s-info">' +
          '<b>Rechner</b>' +
          '<small>Voraussetzung für Frontend-Entwicklung · ' + fmtMoney(rechnerPrice) + '</small>' +
        '</div>' +
        '<button class="shop-buy-btn" data-hw="rechner" ' + (rechnerCan ? '' : 'disabled') + '>' + rechnerLabel + '</button>' +
      '</div>';

    // Gebäude-Sektion: in Phase 0/1 nur Farm (klein, Küken).
    // Ab Phase 2 zusätzlich Werbeagentur + Marketing-Center; Farm wird
    // dann direkt als Huhn gekauft (kleine Serverfarm gibt's nicht mehr).
    var buildingsHtml = '<div class="shop-section-title">🏗️ Gebäude</div>';
    var phase = RT.state.currentPhase();
    var types = (phase >= 2) ? ['farm', 'werbe', 'marketing'] : ['farm'];

    for (var i = 0; i < types.length; i++) {
      var tid = types[i];
      var t   = RT.state.BUILDING_TYPES[tid];
      var cost = RT.state.buildingCost(tid);
      var canAfford = s.money >= cost;
      var fitsHere  = !shopPreTile || RT.state.canPlace(tid, shopPreTile.col, shopPreTile.row);
      var disabled  = !canAfford || (shopPreTile && !fitsHere);
      var label;
      if (!canAfford)                    label = 'Zu teuer';
      else if (shopPreTile && !fitsHere) label = 'Passt hier nicht';
      else                               label = shopPreTile ? 'Hier bauen' : 'Wählen';

      var displayName = t.name;
      var displayIcon = t.icon;
      if (tid === 'farm') {
        // Ab Phase 2: neue Farmen starten als Huhn — im Shop trotzdem als
        // "Serverfarm" mit dem Gebäude-Icon (nicht Tier-Icon).
        displayName = (phase >= 2) ? 'Serverfarm' : 'kleine Serverfarm';
      }
      buildingsHtml +=
        '<div class="shop-card">' +
          '<div class="s-icon">' + displayIcon + '</div>' +
          '<div class="s-info">' +
            '<b>' + displayName + '</b>' +
            '<small>' + t.size + '×' + t.size + ' · ' + fmtMoney(cost) + '</small>' +
          '</div>' +
          '<button class="shop-buy-btn" data-t="' + tid + '" ' + (disabled ? 'disabled' : '') + '>' + label + '</button>' +
        '</div>';
    }

    openModal('🛒 Shop', '<div class="shop-hint">' + hint + '</div>' + hardwareHtml + buildingsHtml, { type: 'shop' });
  }

  // Deal durchgelaufen — Feuerwerk auf der Agentur markiert den Moment.
  // Der Bus-Event kommt aus dem Tick, das Grid ist danach schon neu gebaut.
  function onAdFinished(payload) {
    var host = document.querySelector('.building[data-instance-id="' + payload.instanceId + '"]');
    if (!host || !el.world) return;
    var r  = host.getBoundingClientRect();
    var wr = el.world.getBoundingClientRect();
    spawnFireworks(r.left + r.width / 2 - wr.left, r.top + r.height * 0.3 - wr.top);
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
    if (typeId === 'werbe') return 'gold';
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

  // ---- Online-Gang: Button + Launch-Sequenz ----
  // Button erscheint im World-Layer sobald alle 5 Nodes done sind und noch nicht
  // online. Wird von renderAll() live gepflegt.
  function updateOnlineButton() {
    if (!el.world || !RT.techtree) return;
    var s = RT.state.current;
    var shouldShow = RT.techtree.allPhase0Done() && !s.goLiveUnlocked;
    var btn = document.getElementById('rt-online-btn');

    if (shouldShow && !btn) {
      btn = document.createElement('button');
      btn.id = 'rt-online-btn';
      btn.className = 'rt-online-btn';
      btn.type = 'button';
      btn.textContent = '🚀 Plattform online stellen';
      btn.addEventListener('click', function () { showLaunchSequence(); });
      el.world.appendChild(btn);
    } else if (!shouldShow && btn) {
      btn.parentNode.removeChild(btn);
    }
  }

  function showLaunchSequence() {
    var s           = RT.state.current;
    var platformRaw = (s.player && s.player.platformName) || 'Deine Plattform';

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
      + '      <button class="rt-launch-weiter" id="rt-launch-weiter" type="button">Weiter →</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(overlay);

    var LINES = [
      { text: '> Verbindung wird aufgebaut...',    type: 'info',    bar: 15 },
      { text: '> Server werden gestartet...',       type: 'info',    bar: 32 },
      { text: '> Datenbank initialisiert.',         type: 'info',    bar: 52 },
      { text: '> SSL-Zertifikat aktiviert.',        type: 'info',    bar: 70 },
      { text: '> Connecting... Success.',           type: 'success', bar: 85 },
      { text: '> System bereit.',                   type: 'success', bar: 95 },
      { text: '> ✓ ' + platformRaw + ' ist jetzt ONLINE! 🚀', type: 'launch', bar: 100 }
    ];

    var consoleEl = overlay.querySelector('#rt-launch-console');
    var barEl     = overlay.querySelector('#rt-launch-bar');
    var footer    = overlay.querySelector('#rt-launch-footer');

    function addLine(idx) {
      if (idx >= LINES.length) {
        // Feuerwerk auf dem ganzen Overlay
        setTimeout(function () { if (footer) footer.style.display = ''; }, 700);
        return;
      }
      var line = LINES[idx];
      var lineEl = document.createElement('div');
      lineEl.className   = 'rt-launch-line rt-launch-line--' + line.type;
      lineEl.textContent = line.text;
      consoleEl.appendChild(lineEl);
      consoleEl.scrollTop = consoleEl.scrollHeight;
      if (barEl) barEl.style.width = line.bar + '%';
      setTimeout(function () { addLine(idx + 1); }, 480);
    }
    setTimeout(function () { addLine(0); }, 350);

    overlay.querySelector('#rt-launch-weiter').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var res = RT.actions.goLive();
      if (res.ok) {
        // Feuerwerk am HQ zur Feier
        var hq   = RT.state.instancesByType('hq')[0];
        var host = hq ? document.querySelector('.building[data-instance-id="' + hq.instanceId + '"]') : null;
        if (host && el.world) {
          var r  = host.getBoundingClientRect();
          var wr = el.world.getBoundingClientRect();
          var cx = r.left + r.width / 2 - wr.left;
          var cy = r.top  + r.height * 0.3 - wr.top;
          spawnFireworks(cx, cy);
        }
        showGoLiveInfoModal();
      }
    });
  }

  // Info-Modal nach Launch: erklärt die neu freigeschalteten Techtree-Reiter
  // (Marketing/Werbung) und das nächste Ziel (1 000 User → Investor).
  function showGoLiveInfoModal() {
    var s = RT.state.current;
    if (s.goLiveModalSeen) return;
    s.goLiveModalSeen = true;

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-golive-info">'
      + '  <div class="rt-golive-info__title">🎉 Plattform ist online!</div>'
      + '  <p class="rt-golive-info__sub">Solide technische Basis steht — jetzt musst du User holen.</p>'
      + '  <div class="rt-golive-info__box">'
      + '    <div class="rt-golive-info__head">🆕 Zwei neue Reiter im HQ</div>'
      + '    <ul class="rt-golive-info__list">'
      + '      <li><strong>📣 Marketing</strong> — Freunden erzählen und Flyer verteilen für einen ersten Schub.</li>'
      + '      <li><strong>📢 Werbung</strong> — erste Kooperation läuft im Hintergrund und bringt Geld.</li>'
      + '    </ul>'
      + '    <p class="rt-golive-info__goal">🏆 <strong>Nächstes Ziel:</strong> Erreiche <strong>1 000 User</strong> — dann meldet sich ein Investor.</p>'
      + '  </div>'
      + '  <button class="rt-launch-weiter" id="rt-golive-ok" type="button">Los geht\'s! 🚀</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#rt-golive-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      toast('🎉 Plattform ist online!');
    });
  }

  // Investor-Modal — wird bei bus 'investor:trigger' geöffnet.
  // Zwei-Seiten-Modal an v1 angelehnt (garageScreen.js:234-319), mit Bild
  // aus sprites/Investor.png. Belohnung: +50 000 € Startkapital UND die
  // Serverfarm wird kostenlos ausgebaut (technisch: erste Küken-Farm auf
  // Huhn upgegradet — im Text sprechen wir aber neutral vom Ausbau, damit
  // die Tier-Metapher hinter der Kulisse bleibt).
  function showInvestorModal() {
    var s    = RT.state.current;
    var name = (s.player && s.player.name) ? String(s.player.name) : 'du';

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-investor-info">'
      + '  <div id="rt-investor-p1" class="rt-investor-page">'
      + '    <img class="rt-investor-info__bear" src="sprites/Investor.png" alt="Marcus Bär">'
      + '    <h2 class="rt-investor-info__title">Du hast mich beeindruckt, ' + name + '! 🐻</h2>'
      + '    <p class="rt-investor-info__quote">'
      + '      „Ich beobachte deine Plattform seit Wochen — und ich bin ehrlich gesagt begeistert. '
      + '      Über <strong>1 000 User</strong>! Das ganze Viertel redet über dich. '
      + '      Du hast eine echte Gabe, Menschen zu begeistern. Ich will dabei sein, wenn das groß wird."'
      + '    </p>'
      + '    <p class="rt-investor-info__sig">— Marcus Bär, Investor</p>'
      + '    <button class="rt-launch-weiter" id="rt-investor-next" type="button">Was schlägst du vor? →</button>'
      + '  </div>'
      + '  <div id="rt-investor-p2" class="rt-investor-page" style="display:none">'
      + '    <div class="rt-investor-info__body">'
      + '      <img class="rt-investor-info__bear rt-investor-info__bear--sm" src="sprites/Investor.png" alt="Marcus Bär">'
      + '      <div class="rt-investor-info__right">'
      + '        <p class="rt-investor-info__truth">'
      + '          „Ich glaube an dein Potenzial — deshalb will ich einsteigen. '
      + '          Nicht nur mit Geld, sondern mit meiner Zeit, meinem Netzwerk und meinem Know-how. '
      + '          Ich weiß, wie man aus so einer Idee wirklich Geld macht — '
      + '          und die Technologien und das Wissen dahinter teile ich gerne mit dir. '
      + '          Und dein Server platzt sowieso gleich — den bauen wir zusammen aus."'
      + '        </p>'
      + '        <div class="rt-investor-info__deal">'
      + '          <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '            <span>💰 Investment</span><strong>+50 000 €</strong>'
      + '          </div>'
      + '          <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '            <span>🔨 Serverfarm-Ausbau</span><strong>Kapazität ×4</strong>'
      + '          </div>'
      + '          <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '            <span>🧠 Know-how &amp; Netzwerk</span><strong>neue Möglichkeiten</strong>'
      + '          </div>'
      + '          <div class="rt-investor-info__row">'
      + '            <span>🤝 Sein Anteil</span><strong>15 % der Firma</strong>'
      + '          </div>'
      + '        </div>'
      + '        <p class="rt-investor-info__whisper">'
      + '          „Und keine Sorge — ich will erstmal kein Geld zurück sehen. Alles bleibt in der Firma, '
      + '          alles wird reinvestiert. Ausschüttungen? Das besprechen wir, wenn ihr wirklich groß seid. '
      + '          Sagen wir … bei 500 000 Usern."'
      + '        </p>'
      + '      </div>'
      + '    </div>'
      + '    <button class="rt-launch-weiter" id="rt-investor-ok" type="button">Deal! 🤝</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#rt-investor-next').addEventListener('click', function () {
      document.getElementById('rt-investor-p1').style.display = 'none';
      document.getElementById('rt-investor-p2').style.display = '';
    });

    overlay.querySelector('#rt-investor-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      // Geld + Serverfarm-Ausbau
      RT.state.current.money += 50000;
      var res = RT.actions.investorUpgrade();
      RT.bus.emit('state:changed');
      if (res && res.ok) {
        toast('💰 +50 000 € · Serverfarm ausgebaut');
      } else {
        toast('💰 +50 000 € vom Investor');
      }
      // Ab hier läuft Phase 2 — der Trend wird jetzt relevant.
      setTimeout(showTrendIntroModal, 700);
    });
  }
  RT.bus.on('investor:trigger', showInvestorModal);

  // Feuerwerk: bunte Partikel explodieren vom Punkt (x, y) in alle Richtungen.
  // Für Belohnungs-Momente (z.B. Techtree-Node abgeschlossen).
  function spawnFireworks(x, y) {
    var colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#96CEB4', '#FFEAA7', '#DDA0DD', '#87CEEB', '#FF9F43'];
    var count  = 36;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'firework-piece';
      p.style.left = x + 'px';
      p.style.top  = y + 'px';
      p.style.background = colors[i % colors.length];
      var ang  = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      var dist = 80 + Math.random() * 70;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 20) + 'px');
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      el.world.appendChild(p);
      (function (node) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1400);
      })(p);
    }
  }

  // ---- Toast ----
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1800);
  }

  // ---- Trend-Info ----
  // Aufschlüsselung der aktiven Modifikatoren. Höchstens 5 Zeilen, der Rest
  // wird zu "Sonstiges" gebündelt — sonst wächst das Modal mit jedem neuen
  // Effekt zu einer unlesbaren Liste.
  function trendInfoHtml() {
    var s     = RT.state.current;
    var trend = RT.state.trendValue();
    var mods  = RT.state.activeTrendMods();
    var max   = RT.state.TREND_STACK_MAX;

    var shown = mods.slice(0, 5);
    var restV = 0;
    for (var i = 5; i < mods.length; i++) restV += mods[i].value;

    var rows = '';
    for (var j = 0; j < shown.length; j++) {
      var m   = shown[j];
      var sgn = m.value > 0 ? '+' : '';
      var ttl = '';
      if (m.expiresAt) {
        var restSec = Math.max(0, Math.round((m.expiresAt - Date.now()) / 1000));
        ttl = ' <span class="trend-row__ttl">noch ' + restSec + ' s</span>';
      }
      rows += '<div class="trend-row">'
            +   '<span class="trend-row__label">' + escapeTrend(m.label) + ttl + '</span>'
            +   '<span class="trend-row__val trend-row__val--' + (m.value > 0 ? 'pos' : 'neg') + '">'
            +     sgn + fmtTrendPlain(m.value) + '</span>'
            + '</div>';
    }
    if (restV) {
      rows += '<div class="trend-row">'
            +   '<span class="trend-row__label">Sonstiges (' + (mods.length - 5) + ')</span>'
            +   '<span class="trend-row__val trend-row__val--' + (restV > 0 ? 'pos' : 'neg') + '">'
            +     (restV > 0 ? '+' : '') + fmtTrendPlain(restV) + '</span>'
            + '</div>';
    }
    if (!rows) rows = '<div class="trend-row"><span class="trend-row__label">Nichts aktiv</span><span class="trend-row__val">0</span></div>';

    var wirkung;
    if (trend > 0) {
      wirkung = 'Alle ' + RT.state.TREND_CYCLE_SEC + ' Sekunden kommen <b>+' + fmtTrendPlain(trend)
              + ' %</b> deiner User dazu (aktuell <b>+' + fmtNum(Math.abs(RT.state.trendUsersPerCycle()))
              + '</b>). Es sammeln sich bis zu <b>' + max + ' Schübe</b> an — danach wartet der Trend '
              + 'auf deinen Klick.';
    } else if (trend < 0) {
      wirkung = 'Alle ' + RT.state.TREND_CYCLE_SEC + ' Sekunden verlierst du <b>'
              + fmtTrendPlain(trend) + ' %</b> deiner User (aktuell <b>'
              + fmtNum(RT.state.trendUsersPerCycle()) + '</b>). Ein Klick auf die Kachel halbiert '
              + 'den Verlust für ' + RT.state.TREND_SHIELD_SEC + ' Sekunden.';
    } else {
      wirkung = 'Bei einem Trend von 0 passiert nichts — weder Zulauf noch Abwanderung.';
    }

    return ''
      + '<div class="trend-modal">'
      + '  <div class="trend-modal__big trend-modal__big--' + (trend > 0 ? 'pos' : (trend < 0 ? 'neg' : 'neutral')) + '">'
      +      (trend > 0 ? '+' : '') + fmtTrendPlain(trend) + ' %'
      + '  </div>'
      + '  <p class="info-line">' + wirkung + '</p>'
      + '  <div class="trend-modal__head">Was gerade einzahlt</div>'
      +    rows
      + '  <p class="info-line trend-modal__hint">Werbung drückt den Trend, neue Features und '
      + '  Kampagnen heben ihn. Der Wert bewegt sich zwischen ' + RT.state.TREND_MIN
      + '  und +' + RT.state.TREND_MAX + '.</p>'
      + '</div>';
  }

  // Wie fmtTrend / escapeHTML in der Resource-Bar — die stecken aber im
  // zweiten IIFE, deshalb hier eigene Kopien.
  function fmtTrendPlain(v) {
    var r = Math.round(v * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1).replace('.', ','));
  }
  function escapeTrend(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function openTrendInfo() {
    openModal('📈 Trend', trendInfoHtml(), { type: 'trend' });
  }

  // Einmaliges Erklär-Modal beim Start von Phase 2.
  function showTrendIntroModal() {
    var s = RT.state.current;
    if (s.trendModalSeen) return;
    s.trendModalSeen = true;

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-golive-info">'
      + '  <div class="rt-golive-info__title">📈 Neu: der Trend</div>'
      + '  <p class="rt-golive-info__sub">Deine Plattform ist groß genug, dass sie ein Eigenleben entwickelt.</p>'
      + '  <div class="rt-golive-info__box">'
      + '    <div class="rt-golive-info__head">So funktioniert er</div>'
      + '    <ul class="rt-golive-info__list">'
      + '      <li><strong>Der Trend ist deine Wachstumsrate.</strong> +3 % heißt: alle '
      +          RT.state.TREND_CYCLE_SEC + ' Sekunden kommen 3 % deiner User dazu.</li>'
      + '      <li><strong>Es sammelt sich an.</strong> Bis zu ' + RT.state.TREND_STACK_MAX
      +          ' Schübe warten auf dich — dann klickst du sie in der Trend-Kachel ab.</li>'
      + '      <li><strong>Er kann negativ werden.</strong> Dann wandern User ab. '
      +          'Ein Klick halbiert den Schaden, während du das Problem behebst.</li>'
      + '      <li><strong>Vieles zahlt darauf ein</strong> — neue Features heben ihn, Werbung drückt ihn. '
      +          'Tippe jederzeit auf die Kachel, um zu sehen was gerade wirkt.</li>'
      + '    </ul>'
      + '  </div>'
      + '  <button class="rt-launch-weiter" id="rt-trend-intro-ok" type="button">Verstanden 📈</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#rt-trend-intro-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
  }

  RT.ui = { init: init, toast: toast, closeModal: closeModal, spawnFireworks: spawnFireworks,
            openTrendInfo: openTrendInfo, showTrendIntroModal: showTrendIntroModal };
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
      + '  <button class="rt-shop-btn" id="shop-btn" aria-label="Shop">🛒'
      + '    <span class="rt-notif-badge" id="rt-shop-badge" style="display:none">!</span>'
      + '  </button>'
      + '  <div class="rt-profile-bar__brand">'
      + '    <span class="rt-profile-bar__platform">' + platform + '</span>'
      + '    <span class="rt-profile-bar__online-dot" title="Online" aria-label="Online"></span>'
      +      (logo ? '<img class="rt-profile-bar__logo" src="' + logo + '" alt="">' : '')
      + '  </div>'
      + '</div>';
  }

  // Trend ohne Nachkommastelle wenn ganzzahlig — "+3 %" statt "+3.0 %".
  function fmtTrend(v) {
    var r = Math.round(v * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1).replace('.', ','));
  }

  // Fliegende Zahl von der Trend-Kachel zur User-Kachel. Positiv = User
  // strömen hin, negativ = sie fallen heraus.
  function flyUsers(fromEl, toEl, text, positive) {
    if (!fromEl || !toEl) return;
    var a = fromEl.getBoundingClientRect();
    var b = toEl.getBoundingClientRect();
    var fly = document.createElement('div');
    fly.className = 'rt-trend-fly ' + (positive ? 'rt-trend-fly--in' : 'rt-trend-fly--out');
    fly.textContent = '👥 ' + text;
    fly.style.left = (a.left + a.width / 2) + 'px';
    fly.style.top  = (a.top  + a.height / 2) + 'px';
    document.body.appendChild(fly);

    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = positive ? (b.top + b.height / 2) - (a.top + a.height / 2) : 70;
    // Nächster Frame, damit die Transition greift.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fly.style.transform = 'translate(-50%,-50%) translate(' + dx.toFixed(0) + 'px,'
                            + dy.toFixed(0) + 'px) scale(' + (positive ? 0.7 : 0.9) + ')';
        fly.style.opacity = '0';
      });
    });
    setTimeout(function () {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
    }, 1000);
  }

  // Trennstriche im Ernte-Balken — einer je Stapel-Grenze, damit sichtbar
  // ist, wann der nächste Schub fertig wird. Aus TREND_STACK_MAX abgeleitet,
  // damit die Striche bei geänderter Stapelzahl mitwandern.
  function trendTicksHTML() {
    var max = (RT.state && RT.state.TREND_STACK_MAX) || 5;
    var out = '';
    for (var i = 1; i < max; i++) {
      out += '<i style="left:' + (i / max * 100).toFixed(4) + '%"></i>';
    }
    return out;
  }

  // Resource-Bar für v3: 5 Kacheln (Geld · User · Watchtime · Trend · Server).
  // Geld + User haben die Sparkline im Hintergrund.
  function resourceBarHTML() {
    return ''
      + '<div class="rt-resources rt-resources--with-trend rt-resources--with-watchtime">'
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
      + '      <div class="rt-resource__flyer" id="rt-res-flyer" style="display:none">'
      + '        <span class="rt-resource__flyer-tag">Flyerbonus</span>'
      + '        <span class="rt-resource__flyer-fx">×1,10 / 8 s</span>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--watchtime rt-resource--phase2">'
      + '    <span class="rt-resource__icon">⏳</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Watchtime</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="watchtime">0</span></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--trend rt-resource--phase2" id="rt-trend-card">'
      + '    <div class="rt-trend-inner">'
      + '      <button class="rt-trend-head" id="rt-trend-info" type="button" title="Was ist der Trend?">'
      + '        <span class="rt-resource__label">Trend</span>'
      + '        <span class="rt-trend-value" id="rt-trend-value">0 %</span>'
      + '        <span class="rt-trend-help">?</span>'
      + '      </button>'
      + '      <div class="rt-trend-track">'
      + '        <div class="rt-trend-empty" id="rt-trend-empty"></div>'
      + '        <div class="rt-trend-marker"></div>'
      + '      </div>'
      + '      <button class="rt-trend-harvest" id="rt-trend-harvest" type="button" disabled>'
      + '        <span class="rt-trend-harvest__fill" id="rt-trend-fill"></span>'
      + '        <span class="rt-trend-harvest__ticks" id="rt-trend-ticks">' + trendTicksHTML() + '</span>'
      + '        <span class="rt-trend-harvest__body">'
      + '          <span class="rt-trend-harvest__label" id="rt-trend-harvest-label">—</span>'
      + '          <span class="rt-trend-stacks" id="rt-trend-stacks"></span>'
      + '        </span>'
      + '      </button>'
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
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--sw"  id="rt-server-seg-sw"></div>'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--usr" id="rt-server-seg-usr"></div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function bindResourceBar(container) {
    var refs = {
      money:          container.querySelector('[data-rt-res="money"]'),
      users:          container.querySelector('[data-rt-res="users"]'),
      watchtime:      container.querySelector('[data-rt-res="watchtime"]'),
      serverUsed:     container.querySelector('[data-rt-res="serverUsed"]'),
      serverCap:      container.querySelector('[data-rt-res="serverCap"]'),
      moneyCanvas:    container.querySelector('[data-spark="money"]'),
      usersCanvas:    container.querySelector('[data-spark="users"]'),
      moneyCard:      container.querySelector('#rt-res-money-card'),
      flyerChip:      container.querySelector('#rt-res-flyer'),
      watchtimeCard:  container.querySelector('.rt-resource--watchtime'),
      usersCard:      container.querySelector('#rt-res-users-card'),
      trendCard:      container.querySelector('#rt-trend-card'),
      trendEmpty:     container.querySelector('#rt-trend-empty'),
      trendValue:     container.querySelector('#rt-trend-value'),
      trendInfo:      container.querySelector('#rt-trend-info'),
      trendHarvest:   container.querySelector('#rt-trend-harvest'),
      trendFill:      container.querySelector('#rt-trend-fill'),
      trendTicks:     container.querySelector('#rt-trend-ticks'),
      trendLabel:     container.querySelector('#rt-trend-harvest-label'),
      trendStacks:    container.querySelector('#rt-trend-stacks'),
      serverSeg:      container.querySelector('#rt-server-seg-usr'),
      serverSegSw:    container.querySelector('#rt-server-seg-sw'),
      serverCard:     container.querySelector('.rt-resource--server')
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

      var prog      = RT.state.programmCapacity ? RT.state.programmCapacity() : 0;
      var totalUsed = users + prog;

      if (refs.money)          refs.money.textContent          = formatNumber(money);
      if (refs.users)          refs.users.textContent          = formatNumber(users);
      if (refs.watchtime)      refs.watchtime.textContent      = formatNumber(wt);
      if (refs.serverUsed)     refs.serverUsed.textContent     = formatNumber(totalUsed);
      if (refs.serverCap)      refs.serverCap.textContent      = formatNumber(cap);

      // Beide Segmente auf denselben Nenner (cap). Programm sitzt links, dann User.
      var progPct = cap > 0 ? Math.min(100, prog / cap * 100) : 0;
      var usrPct  = cap > 0 ? Math.min(100 - progPct, used / cap * 100) : 0;
      if (refs.serverSegSw) refs.serverSegSw.style.width = progPct.toFixed(2) + '%';
      if (refs.serverSeg)   refs.serverSeg.style.width   = usrPct.toFixed(2) + '%';
      if (refs.serverCard) {
        var totalPct = progPct + usrPct;
        refs.serverCard.classList.toggle('rt-resource--critical', cap > 0 && totalPct >= 95);
      }
      if (refs.moneyCard) refs.moneyCard.classList.toggle('rt-resource--money-negative', money < 0);

      // Phase-abhängig: Watchtime + Trend-Karten erst ab Phase 2, Flyerbonus
      // nur solange aktiv. Vor Phase 2 ist die Bar 3-spaltig (Geld/User/Server),
      // damit die drei sichtbaren Kacheln zentriert füllen.
      var phase = RT.state.currentPhase ? RT.state.currentPhase() : 2;
      if (refs.watchtimeCard) refs.watchtimeCard.style.display = phase >= 2 ? '' : 'none';
      if (refs.trendCard)     refs.trendCard.style.display     = phase >= 2 ? '' : 'none';
      var barEl = container.querySelector('.rt-resources');
      if (barEl) barEl.classList.toggle('rt-resources--compact', phase < 2);
      if (refs.flyerChip) {
        var flyerOn = RT.state.flyerBonusActive && RT.state.flyerBonusActive();
        refs.flyerChip.style.display = flyerOn ? '' : 'none';
      }

      // Shop-Badge live togglen (nicht im Grid, sondern in der Profile-Bar).
      var shopBadge = document.getElementById('rt-shop-badge');
      if (shopBadge) {
        var showShop = RT.state.badgeVisible && RT.state.badgeVisible('shop');
        shopBadge.style.display = showShop ? '' : 'none';
      }
    }

    // Trend-Kachel: Balken, Wert und der Ernte-Button darunter.
    // Positiv → "+X User einsammeln", negativ → "Schadensbegrenzung".
    function refreshTrend() {
      if (!refs.trendEmpty) return;
      var s     = RT.state.current;
      var trend = RT.state.trendValue();
      var max   = RT.state.TREND_STACK_MAX;

      // Balken: Skala TREND_MIN … TREND_MAX, Nullpunkt als Marker.
      var t = (trend - RT.state.TREND_MIN) / (RT.state.TREND_MAX - RT.state.TREND_MIN);
      t = Math.max(0, Math.min(1, t));
      refs.trendEmpty.style.width = ((1 - t) * 100).toFixed(1) + '%';
      if (refs.trendValue) {
        refs.trendValue.textContent = (trend > 0 ? '+' : '') + fmtTrend(trend) + ' %';
      }
      if (refs.trendCard) {
        refs.trendCard.classList.toggle('rt-trend--positive', trend > 0);
        refs.trendCard.classList.toggle('rt-trend--negative', trend < 0);
      }

      var btn = refs.trendHarvest;
      if (!btn) return;
      var stacks = s.trendStacks || 0;

      // Die Stapel-Striche ergeben nur beim Sammeln Sinn — im Negativ-Modus
      // zeigt derselbe Balken die Schild-Restzeit.
      if (refs.trendTicks) refs.trendTicks.style.display = trend < 0 ? 'none' : '';

      if (trend > 0) {
        var ready = RT.state.trendUsersReady();
        btn.classList.remove('rt-trend-harvest--danger');
        btn.classList.toggle('rt-trend-harvest--full', stacks >= max);
        btn.disabled = stacks <= 0;
        btn.dataset.mode = 'collect';
        if (refs.trendLabel) {
          refs.trendLabel.textContent = stacks > 0
            ? '👥 +' + formatNumber(ready) + ' einsammeln'
            : 'sammelt …';
        }
        // Füllstand: volle Stapel + laufender Zyklus.
        var frac = stacks >= max ? 1
          : (stacks + (s.trendCycleTime || 0) / RT.state.TREND_CYCLE_SEC) / max;
        if (refs.trendFill) refs.trendFill.style.width = (Math.min(1, frac) * 100).toFixed(1) + '%';
        if (refs.trendStacks) refs.trendStacks.textContent = stacks + '/' + max;
      } else if (trend < 0) {
        var perCycle = RT.state.trendUsersPerCycle();
        var shielded = RT.state.trendShieldActive();
        var ready2   = RT.state.trendShieldReady();
        btn.classList.add('rt-trend-harvest--danger');
        btn.classList.remove('rt-trend-harvest--full');
        btn.disabled = !ready2;
        btn.dataset.mode = 'shield';
        if (refs.trendLabel) {
          refs.trendLabel.textContent = shielded
            ? '🛡 Schaden halbiert'
            : (ready2 ? '🛡 Schadensbegrenzung' : '🛡 Cooldown …');
        }
        if (refs.trendStacks) {
          refs.trendStacks.textContent = formatNumber(perCycle) + ' / ' + RT.state.TREND_CYCLE_SEC + ' s';
        }
        // Füllstand zeigt hier die Restlaufzeit des Schilds bzw. den Cooldown.
        var pctBar = 0;
        if (shielded) {
          pctBar = (s.trendShieldUntil - Date.now()) / (RT.state.TREND_SHIELD_SEC * 1000);
        } else if (!ready2) {
          var cd = RT.state.TREND_SHIELD_CD_SEC * 1000;
          pctBar = 1 - (s.trendShieldReadyAt - Date.now()) / cd;
        }
        if (refs.trendFill) {
          refs.trendFill.style.width = (Math.max(0, Math.min(1, pctBar)) * 100).toFixed(1) + '%';
        }
      } else {
        btn.classList.remove('rt-trend-harvest--danger', 'rt-trend-harvest--full');
        btn.disabled = true;
        btn.dataset.mode = 'idle';
        if (refs.trendLabel)  refs.trendLabel.textContent = 'kein Trend';
        if (refs.trendStacks) refs.trendStacks.textContent = stacks > 0 ? stacks + '/' + max : '';
        if (refs.trendFill)   refs.trendFill.style.width = '0%';
      }
    }

    if (refs.trendHarvest) {
      refs.trendHarvest.addEventListener('click', function () {
        var mode = refs.trendHarvest.dataset.mode;
        if (mode === 'collect') {
          var res = RT.actions.collectTrend();
          if (res && res.ok) flyUsers(refs.trendHarvest, refs.usersCard, '+' + formatNumber(res.amount), true);
        } else if (mode === 'shield') {
          RT.actions.trendShield();
        }
        refreshTrend();
      });
    }
    if (refs.trendInfo) {
      refs.trendInfo.addEventListener('click', function () { RT.ui.openTrendInfo(); });
    }
    // Bei Abwanderung fallen die User sichtbar aus der Trend-Kachel heraus.
    // Gedrosselt und aufsummiert — der Abfluss feuert sonst mehrmals pro Sekunde.
    var lostAcc = 0, lostAt = 0;
    function onTrendLost(p) {
      if (!p || !p.amount) return;
      lostAcc += p.amount;
      var now = Date.now();
      if (now - lostAt < 2500) return;
      lostAt = now;
      flyUsers(refs.trendHarvest || refs.trendCard, refs.usersCard, '−' + formatNumber(lostAcc), false);
      lostAcc = 0;
    }
    RT.bus.on('trend:lost', onTrendLost);

    function drawSparks() {
      var h = RT.state.current.sparkHistory || { money: [], users: [] };
      drawSparkline(refs.moneyCanvas, h.money,
        'rgba(34,197,94,0.45)', 'rgba(34,197,94,0.10)');
      drawSparkline(refs.usersCanvas, h.users,
        'rgba(59,130,246,0.45)', 'rgba(59,130,246,0.10)');
    }

    refresh();
    refreshTrend();
    drawSparks();

    function onState() { refresh(); refreshTrend(); }
    RT.bus.on('state:changed', onState);

    // Tick emittiert state:changed nicht, aber Watchtime + Trend ändern sich
    // kontinuierlich. Throttled Refresh alle ~250 ms.
    var lastTickRefresh = 0;
    function onTick() {
      var now = performance.now();
      if (now - lastTickRefresh < 250) return;
      lastTickRefresh = now;
      refresh();
      refreshTrend();
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
      RT.bus.off('trend:lost', onTrendLost);
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

