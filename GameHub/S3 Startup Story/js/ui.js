/* UI — isometrische Welt, Gebäude als Instanzen (mehrere pro Typ).
   Klick auf Gebäude → Modal je Instanz. Klick auf leeres Feld → Shop (pre-scoped).
   Shop-Button oben öffnet Shop; nach Wahl aktiviert Placement-Mode mit Tile-Highlights. */
(function (RT) {
  'use strict';

  var el = {};      // Gecachte DOM-Referenzen
  var modalContext = null; // 'farm' | 'werbe' | 'marketing' | 'hq' | 'shop' | null
  var sliderDragging = false;
  // Zuletzt am Intensitäts-Slider eingestellter Wert (in %). Der Slider selbst
  // schreibt nichts in den State — ohne diesen Merker würde ihn aber jedes
  // state:changed-Rerender auf die Vorgabe zurückwerfen, mitten im Vergleichen.
  var werbeIntensity = null;
  // Dieselbe Begründung für Volumen und Targeting: beides ist eine Auswahl
  // für die NÄCHSTE Buchung und steht nirgends im State, bis gebucht wird.
  // null heißt "noch nichts gewählt" — dann gilt, was der letzte Deal hatte.
  var werbeVolume    = null;
  var werbeTargeting = null;
  var werbeRenew     = null;
  // Dasselbe für den Regler der Creator-Beteiligung im Marketing-Center:
  // die gewählte STUFE (1…5), nicht der Trend-Wert.
  var creatorStep    = null;
  var shopPreTile   = null;   // { col, row } wenn Shop aus Tile-Klick geöffnet wurde
  var placementMode = null;   // { typeId } — aktiviert Tile-Highlighting

  // ---- Helpers ----
  // Kurzform für Buttons auf den Gebäuden und die Ressourcen-Bar — dort ist der
  // Platz knapp. Die vollständige Zahl steht im Ledger (RT.ledger.fmt.num), das
  // ab 1 Mio nach derselben Regel kürzt.
  //
  // ⚠️ Deutsches Dezimalkomma und "Mio" statt "M" (2026-08-11). Vorher stand
  // auf den Ernte-Buttons "2.3M" — ein englischer Dezimalpunkt mitten in einem
  // sonst deutschen UI, der sich außerdem als Tausenderpunkt lesen lässt.
  function fmtShort(n, unit) {
    var neg = n < 0;
    var a   = Math.abs(Math.floor(n));
    // Die Schwellen liegen knapp UNTER der runden Zahl: 999.999 rundet auf eine
    // Nachkommastelle sonst zu "1000k" statt zu "1 Mio".
    var out;
    if      (a >= 999950000) out = (a / 1000000000).toFixed(1).replace(/\.0$/, '') + ' Mrd';
    else if (a >= 999950)    out = (a / 1000000).toFixed(1).replace(/\.0$/, '')    + ' Mio';
    else if (a >= 1000)      out = (a / 1000).toFixed(1).replace(/\.0$/, '')       + 'k';
    else                     out = String(a);
    return (neg ? '−' : '') + out.replace('.', ',') + (unit || '');
  }
  function fmtMoney(n) { return fmtShort(n, ' €'); }
  function fmtNum(n)   { return fmtShort(n, ''); }
  function fmtPct(f) {
    var v = Math.round(f * 1000) / 10;
    return (v > 0 ? '+' : '') + v + '%';
  }
  // Ohne Vorzeichen — für Prozentwerte, die keine Veränderung sind, sondern
  // ein Anteil ("2 % deiner User"). Ein "+" davor läse sich dort wie ein
  // Zuschlag auf etwas anderes.
  function fmtPctPlain(f) {
    return String(Math.round(f * 1000) / 10).replace('.', ',') + ' %';
  }
  // Knopf mit Bild-Icon beschriften, OHNE das <img> anzufassen.
  //
  // ⚠️ `btn.innerHTML = iconHtml(...) + text` sieht harmlos aus, baut aber bei
  // JEDEM Aufruf ein frisches <img>. Diese Knöpfe werden im Sekundentakt
  // aktualisiert, und auf iPads blitzt das Icon dabei sichtbar weg — Safari
  // dekodiert das Bild neu, auch wenn es im Cache liegt. Also: Icon einmal
  // anlegen, danach nur noch den Text daneben schreiben.
  function setIconLabel(target, iconId, text) {
    var lbl = target.querySelector('[data-icon-label]');
    if (!lbl) {
      target.innerHTML = RT.assets.iconHtml(iconId) + ' <span data-icon-label></span>';
      lbl = target.querySelector('[data-icon-label]');
    }
    if (lbl.textContent !== text) lbl.textContent = text;
  }

  // Selbst gewählte Namen (Plattform, Spieler) landen per innerHTML in Modals —
  // die zweite IIFE weiter unten hat ihr eigenes escapeHTML, das hier ist das
  // Gegenstück für diesen Modul-Scope.
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    // ⚠️ Der Shop-Badge geht über RT.state.badgeVisible() und nicht über
    // s.seenBadges: dort steckt der zweite Grund (Phase 2 ohne Werbeagentur).
    // Die Profile-Bar in der zweiten IIFE dieser Datei fragt dieselbe Stelle —
    // eine Kopie hier wäre genau die Art Doppelung, die auseinanderläuft.
    if (uiKey === 'shop')          return RT.state.badgeVisible('shop');
    if (uiKey === 'tab_marketing') return !s.seenBadges.tab_marketing;
    if (uiKey === 'tab_werbung')   return !s.seenBadges.tab_werbung;
    return false;
  }

  // ---- DOM-Wiederverwendung des Iso-Grids ----
  //
  // buildIsoGrid() läuft bei JEDEM state:changed, also im Sekundentakt und
  // zusätzlich nach jedem Klick. Vorher warf es dabei alles per innerHTML=''
  // weg und baute ~420 Kacheln, alle Gebäude und die komplette UI-Ebene neu.
  // Auf iPads sah man genau das: die Häuser waren für einen Moment weg, weil
  // ein frisches <img> erst wieder dekodiert werden muss — Cache hin oder her.
  //
  // Deshalb behält jeder Knoten seinen Platz in einer Map und wird nur noch
  // aktualisiert. Was in einem Durchlauf nicht mehr vorkommt (abgerissenes
  // Gebäude, Kachel außerhalb des Kranzes, Phase-abhängige UI), räumt
  // pruneGridNodes() am Ende weg.
  //
  // ⚠️ Die Maps hängen an konkreten Container-Elementen. gameScreen.enter()
  // baut den Screen bei einem Re-Entry neu — dann zeigen sie auf abgehängte
  // Knoten und müssen verworfen werden (gridHost-Vergleich unten).
  var gridNodes = { tile: {}, bld: {}, farmUi: {}, devUi: {}, mkUi: {}, wbUi: {}, labUi: {}, plantUi: {} };
  var gridSeen  = {};
  var gridHost  = null;
  var gridUiHost = null;

  function resetGridNodes() {
    for (var kind in gridNodes) gridNodes[kind] = {};
  }

  // Liefert den vorhandenen Knoten oder legt ihn einmalig an. `create` wird
  // nur beim ersten Mal aufgerufen — dort gehören Struktur und Listener hin,
  // alles Wechselnde in den Aufrufer danach.
  function gridNode(kind, key, parent, create) {
    var map  = gridNodes[kind];
    var node = map[key];
    if (!node) {
      node = create();
      map[key] = node;
      parent.appendChild(node);
    }
    gridSeen[kind + '|' + key] = true;
    return node;
  }

  function pruneGridNodes() {
    for (var kind in gridNodes) {
      var map = gridNodes[kind];
      for (var key in map) {
        if (gridSeen[kind + '|' + key]) continue;
        var node = map[key];
        if (node.parentNode) node.parentNode.removeChild(node);
        delete map[key];
      }
    }
  }

  // Sprite eines Gebäudes nachziehen, ohne das <img> zu ersetzen. Ein neu
  // gesetztes src auf denselben Wert löst keinen Ladevorgang aus, ein neues
  // Element schon — deshalb wird hier verglichen statt gebaut.
  function syncBuildingArt(b, inst, sprite, alt) {
    var img = b.querySelector('img.b-img');
    if (sprite) {
      if (!img) {
        // Vorher Emoji-Platzhalter, jetzt gibt es ein Sprite.
        var ph = b.querySelector('.b-img');
        if (ph) ph.parentNode.removeChild(ph);
        img = document.createElement('img');
        img.className = 'b-img';
        img.setAttribute('draggable', 'false');
        b.insertBefore(img, b.firstChild);
      }
      if (img.getAttribute('src') !== sprite) img.setAttribute('src', sprite);
      if (img.getAttribute('alt') !== alt)    img.setAttribute('alt', alt || '');
      return;
    }
    // Kein Sprite → Emoji-Platzhalter (aktuell nur das Strom- & Wasserwerk).
    if (img) img.parentNode.removeChild(img);
    if (!b.querySelector('.b-img--emoji')) {
      var ph2 = document.createElement('div');
      ph2.className = 'b-img b-img--emoji';
      ph2.setAttribute('role', 'img');
      ph2.setAttribute('aria-label', alt || '');
      ph2.textContent = (RT.state.BUILDING_TYPES[inst.id] || {}).icon || '🏢';
      b.insertBefore(ph2, b.firstChild);
    }
  }

  function buildIsoGrid() {
    var grid = document.getElementById('iso-grid');
    if (!grid) return;

    var uiLayerEl = document.getElementById('building-ui-layer');
    if (grid !== gridHost || uiLayerEl !== gridUiHost) {
      // Neuer Screen-Aufbau: die alten Knoten hängen an einem Container, der
      // nicht mehr im Dokument steht.
      resetGridNodes();
      gridHost   = grid;
      gridUiHost = uiLayerEl;
    }
    gridSeen = {};

    var world = el.world;
    var w = world.clientWidth;
    var h = world.clientHeight;

    // Grid-Konfiguration: Phase 0/1 → 3×3 Freizone. Phase 2 → 5×4 Freizone
    // eingebettet in einen Kranz aus grauen (gesperrten) Feldern.
    var gs = RT.state.gridSizeEffective();

    // Zentriert die Freizone im Weltcontainer: Diamant-Mitte der Freizone
    // sitzt exakt auf (w/2, h/2). Mittelpunkt in Grid-Koordinaten ist
    // ((freeCols-1)/2, (freeRows-1)/2); die Iso-Projektion darunter ist
    // dieselbe wie bei den Kacheln (tx/ty in der Schleife).
    var midC = (gs.freeCols - 1) / 2;
    var midR = (gs.freeRows - 1) / 2;
    var offsetX = w / 2 - (midC - midR) * TILE_W / 2;
    var offsetY = h / 2 - (midC + midR) * TILE_H / 2;

    // Rasenkacheln zeichnen. Drei Sorten:
    //   eigen      → klickbar (Shop/Placement)
    //   kaufbar    → rechtwinklig angrenzend, mit "+"-Symbol, Klick öffnet Kauf-Modal
    //   gesperrt   → nur angedeutet, kein Klick
    for (var r = gs.minRow; r <= gs.maxRow; r++) {
      for (var c = gs.minCol; c <= gs.maxCol; c++) {
        var tx = (c - r) * TILE_W / 2 + offsetX;
        var ty = (c + r) * TILE_H / 2 + offsetY;
        var isOwned = RT.state.isTileOwned(c, r);
        var isBuy   = !isOwned && RT.state.isTilePurchasable(c, r);
        var kind    = isOwned ? 'own' : (isBuy ? 'buy' : 'locked');

        var tile = gridNode('tile', c + ',' + r, grid, (function (cc, rr) {
          return function () {
            var t = document.createElement('div');
            t.dataset.col = cc;
            t.dataset.row = rr;
            return t;
          };
        })(c, r));

        // Eine Kachel wechselt ihre Sorte (gekauft, kaufbar, gesperrt) —
        // dann muss auch der passende Klick-Handler wechseln. Beide sind
        // benannte Funktionen, removeEventListener greift also.
        if (tile._tileKind !== kind) {
          if (tile._tileKind === 'own')      tile.removeEventListener('click', onTileClick);
          else if (tile._tileKind === 'buy') tile.removeEventListener('click', onBuyTileClick);
          if (isOwned)    tile.addEventListener('click', onTileClick);
          else if (isBuy) tile.addEventListener('click', onBuyTileClick);
          tile._tileKind = kind;
          // Placement-Highlights setzt updateTileHighlights direkt danach neu.
          tile.className = isOwned ? 'iso-tile'
                         : (isBuy ? 'iso-tile iso-tile--buy' : 'iso-tile iso-tile--locked');
        }
        tile.style.left = tx + 'px';
        tile.style.top  = ty + 'px';
      }
    }

    // Gebäude setzen (aus placedBuildings)
    var pb = RT.state.current.placedBuildings;
    for (var i = 0; i < pb.length; i++) {
      var inst = pb[i];
      var sprite, alt;
      if (inst.id === 'hq') {
        sprite = RT.state.hqSprite(inst);
        alt    = RT.state.HQ_SPRITE.alt;
      } else if (inst.id === 'farm') {
        sprite = RT.state.farmSprite(inst);
        alt    = RT.state.BUILDING_TYPES.farm.alt;
      } else if (inst.id === 'energie') {
        sprite = RT.state.energieSprite();
        alt    = RT.state.BUILDING_TYPES.energie.alt;
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

      // Gebäude ohne Sprite fallen auf ihr Emoji zurück (aktuell nur das
      // Strom- & Wasserwerk). So lässt sich ein Gebäudetyp fertig bauen und
      // spielen, während der Sprite noch entsteht — syncBuildingArt kennt
      // beide Fälle und wechselt notfalls zwischen ihnen.
      var b = gridNode('bld', inst.instanceId, grid, (function (instance) {
        return function () {
          var node = document.createElement('div');
          node.setAttribute('data-b', instance.id);
          node.setAttribute('data-instance-id', instance.instanceId);
          node.innerHTML = (instance.id === 'farm'
            ? '<div class="farm-animals" data-animals></div>'
            : '') + '<div class="b-hitbox"></div>';
          node.addEventListener('click', onBuildingClick);
          return node;
        };
      })(inst));

      // classList statt className: is-throttled/is-dark hängen hier drauf
      // (updateFarmAnimals) und dürfen nicht bei jedem Durchlauf wegfallen.
      b.classList.add('building');
      b.classList.toggle('building-2x2', inst.size === 2);
      b.style.left = bx + 'px';
      b.style.top  = by + 'px';
      b.style.zIndex = String(10 + zFront);
      syncBuildingArt(b, inst, sprite, alt);

      if (inst.id === 'farm') updateFarmAnimals(b, inst);
    }

    // Separates UI-Layer über allen Buildings: Progress-Ring + Aktions-Button.
    var uiLayer = uiLayerEl;
    if (uiLayer) {
      // Farm-Ernte-UI (Ring + Harvest-Button) erst ab Phase 2 relevant —
      // Watchtime tickt vorher nicht, also kein Sinn im Kreis.
      var phaseNow = RT.state.currentPhase ? RT.state.currentPhase() : 2;
      var farms = phaseNow >= 2 ? RT.state.instancesByType('farm') : [];
      for (var fi = 0; fi < farms.length; fi++) {
        var f = farms[fi];
        var fExtraY = (f.size === 2) ? TILE_H / 2 : 0;
        var fbx = (f.col - f.row) * TILE_W / 2 + offsetX;
        var fby = (f.col + f.row) * TILE_H / 2 + offsetY + fExtraY;

        var ui = gridNode('farmUi', f.instanceId, uiLayer, (function (farm) {
          return function () {
            var node = document.createElement('div');
            node.setAttribute('data-instance-id', farm.instanceId);
            // Zwei ineinanderliegende Ringe: außen Watchtime (Tiere), innen
            // Metadaten (User-Modelle). Der innere hängt im Loch des äußeren
            // und wird nur eingeblendet, wenn diese Farm Modelle hat.
            node.innerHTML =
              '<div class="farm-progress-ring" data-progress>' +
                '<div class="farm-progress-ring-inner">' +
                  '<div class="farm-progress-ring--meta" data-progress-meta style="display:none">' +
                    '<div class="farm-progress-ring-inner"></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<button class="farm-harvest-btn" data-harvest type="button"></button>' +
              '<button class="farm-upkeep-btn" data-upkeep type="button"></button>';
            var hBtn = node.querySelector('[data-harvest]');
            hBtn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              harvestFromField(farm.instanceId, hBtn);
            });
            node.querySelector('[data-upkeep]').addEventListener('click', function (ev) {
              ev.stopPropagation();
              var res = RT.actions.payServerUpkeep(farm.instanceId);
              if (!res.ok) { toast(res.msg || 'Geht nicht'); return; }
            });
            return node;
          };
        })(f));
        ui.className = 'farm-ui' + (f.size === 2 ? ' farm-ui-2x2' : '');
        ui.style.left = fbx + 'px';
        ui.style.top  = fby + 'px';
        updateFarmUi(ui, f);
      }

      // Entwicklungs-UI: Ring während der Entwicklung + pulsierender
      // Collect-Button, sobald die Node fertig ist. Steht auf JEDEM Gebäude,
      // in dem entwickelt werden kann — HQ und Bürogebäude —, und zeigt nur
      // die Node, die auf genau diesem Gebäude läuft (entry.slot).
      var devs = RT.state.devBuildings();
      for (var hi = 0; hi < devs.length; hi++) {
        var dev = devs[hi];
        var hqExtraY = (dev.size === 2) ? TILE_H / 2 : 0;
        var hqbx = (dev.col - dev.row) * TILE_W / 2 + offsetX;
        var hqby = (dev.col + dev.row) * TILE_H / 2 + offsetY + hqExtraY;

        var hqui = gridNode('devUi', dev.instanceId, uiLayer, (function (devInst) {
          return function () {
            var node = document.createElement('div');
            node.className = 'mk-ui'; // Wiederverwendung des Marketing-UI-Layouts
            node.setAttribute('data-hq-ui', devInst.instanceId);
            // Das "!"-Badge gehört zum HQ — es markiert neue Techtree-Inhalte
            // nach einem Phasen-Wechsel, nicht das einzelne Gebäude. Es steht
            // fest im Markup und wird unten nur ein-/ausgeblendet.
            node.innerHTML =
              '<div class="mk-ring" data-hq-ring>' +
                '<div class="mk-ring-inner"><span class="mk-ring-text" data-hq-ring-text></span></div>' +
              '</div>' +
              '<button class="mk-collect-btn" data-hq-collect type="button"></button>' +
              (devInst.id === 'hq'
                ? '<span class="rt-notif-badge rt-notif-badge--hq" style="display:none">!</span>'
                : '');
            node.querySelector('[data-hq-collect]').addEventListener('click', function (ev) {
              ev.stopPropagation();
              var slotNode = RT.techtree.nodesAtBuilding(devInst.instanceId).ready;
              if (!slotNode) return;
              var res = RT.actions.completeTechNode(slotNode.id);
              if (!res.ok) { toast(res.msg || 'Kann nicht abgeschlossen werden'); return; }
              // Feuerwerk über dem Gebäude, das entwickelt hat + Node-Name
              var host = document.querySelector('.building[data-instance-id="' + devInst.instanceId + '"]');
              if (host && el.world) {
                var r  = host.getBoundingClientRect();
                var wr = el.world.getBoundingClientRect();
                var cx = r.left + r.width / 2 - wr.left;
                var cy = r.top  + r.height * 0.3 - wr.top;
                spawnFireworks(cx, cy);
                spawnFloatText(cx, cy, '✓ ' + slotNode.def.name, 'green');
              }
            });
            return node;
          };
        })(dev));
        hqui.style.left = hqbx + 'px';
        hqui.style.top  = hqby + 'px';
        var hqBadge = hqui.querySelector('.rt-notif-badge--hq');
        if (hqBadge) hqBadge.style.display = (dev.id === 'hq' && shouldShowBadge('hq')) ? '' : 'none';
        updateDevUi(hqui, dev);
      }

      // Marketing-UI: gleiche Struktur wie Farm — Ring mit Countdown + Collect-Button
      var mks = RT.state.instancesByType('marketing');
      for (var mi = 0; mi < mks.length; mi++) {
        var m = mks[mi];
        var mExtraY = (m.size === 2) ? TILE_H / 2 : 0;
        var mbx = (m.col - m.row) * TILE_W / 2 + offsetX;
        var mby = (m.col + m.row) * TILE_H / 2 + offsetY + mExtraY;

        var mui = gridNode('mkUi', m.instanceId, uiLayer, (function (mk) {
          return function () {
            var node = document.createElement('div');
            node.className = 'mk-ui';
            node.setAttribute('data-instance-id', mk.instanceId);
            node.innerHTML =
              '<div class="mk-ring" data-ring>' +
                '<div class="mk-ring-inner"><span class="mk-ring-text" data-ring-text></span></div>' +
              '</div>' +
              '<button class="mk-collect-btn" data-collect type="button"></button>';
            var cBtn = node.querySelector('[data-collect]');
            cBtn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              collectFromField(mk.instanceId, cBtn);
            });
            return node;
          };
        })(m));
        mui.style.left = mbx + 'px';
        mui.style.top  = mby + 'px';
        updateMarketingUi(mui, m);
      }

      // Werbeagentur-UI: Ring zeigt den laufenden Deal-Zyklus, der Gold-Button
      // sammelt Geld ein bzw. bucht den letzten Deal mit einem Klick neu.
      var wbs = phaseNow >= 2 ? RT.state.instancesByType('werbe') : [];
      for (var wi = 0; wi < wbs.length; wi++) {
        var wb = wbs[wi];
        var wExtraY = (wb.size === 2) ? TILE_H / 2 : 0;
        var wbx = (wb.col - wb.row) * TILE_W / 2 + offsetX;
        var wby = (wb.col + wb.row) * TILE_H / 2 + offsetY + wExtraY;

        var wui = gridNode('wbUi', wb.instanceId, uiLayer, (function (agency) {
          return function () {
            var node = document.createElement('div');
            node.className = 'wb-ui';
            node.setAttribute('data-instance-id', agency.instanceId);
            // Werbeagentur erzeugt immer Geld → Ring fest grün, kein Wechsel.
            node.innerHTML =
              '<div class="mk-ring mk-ring--money" data-ring>' +
                '<div class="mk-ring-inner"><span class="mk-ring-text" data-ring-text></span></div>' +
              '</div>' +
              '<button class="farm-harvest-btn" data-collect type="button"></button>';
            var cBtn = node.querySelector('[data-collect]');
            cBtn.addEventListener('click', function (ev) {
              ev.stopPropagation();
              collectMoneyFromField(agency.instanceId, cBtn);
            });
            return node;
          };
        })(wb));
        wui.style.left = wbx + 'px';
        wui.style.top  = wby + 'px';
        updateWerbeUi(wui, wb);
      }

      // KI-Labor-UI: dieselbe Bauart wie die Werbeagentur, nur produziert es
      // User-Modelle statt Geld — deshalb der orange Ring (--res-model-ink).
      var labs = phaseNow >= 3 ? RT.state.instancesByType('kilabor') : [];
      for (var li = 0; li < labs.length; li++) {
        var lab  = labs[li];
        var lbx  = (lab.col - lab.row) * TILE_W / 2 + offsetX;
        var lby  = (lab.col + lab.row) * TILE_H / 2 + offsetY;

        var lui = gridNode('labUi', lab.instanceId, uiLayer, (function (labo) {
          return function () {
            var node = document.createElement('div');
            node.className = 'wb-ui';
            node.setAttribute('data-instance-id', labo.instanceId);
            node.innerHTML =
              '<div class="mk-ring mk-ring--model" data-ring>' +
                '<div class="mk-ring-inner"><span class="mk-ring-text" data-ring-text></span></div>' +
              '</div>' +
              '<button class="farm-harvest-btn" data-collect-models type="button"></button>';
            node.querySelector('[data-collect-models]').addEventListener('click', function (ev) {
              ev.stopPropagation();
              var got = RT.actions.collectModels(labo.instanceId);
              if (got > 0) toast('🧠 ' + fmtNum(got) + ' User-Modelle sind eingezogen');
            });
            return node;
          };
        })(lab));
        lui.style.left = lbx + 'px';
        lui.style.top  = lby + 'px';
        updateKiLaborUi(lui, lab);
      }

      // Strom- & Wasserwerk: nur ein Knopf, kein Ring. Es produziert nichts,
      // es bündelt den Versorgungs-Klick der großen Farmen. Ein Ring würde
      // einen Fortschritt versprechen, den es hier nicht gibt.
      var plants = RT.state.instancesByType('energie');
      for (var pi = 0; pi < plants.length; pi++) {
        var pl  = plants[pi];
        var pbx = (pl.col - pl.row) * TILE_W / 2 + offsetX;
        var pby = (pl.col + pl.row) * TILE_H / 2 + offsetY;

        var pui = gridNode('plantUi', pl.instanceId, uiLayer, (function (plant) {
          return function () {
            var node = document.createElement('div');
            node.className = 'wb-ui';
            node.setAttribute('data-instance-id', plant.instanceId);
            node.innerHTML =
              '<button class="farm-upkeep-btn farm-upkeep-btn--plant" data-upkeep-all type="button"></button>';
            node.querySelector('[data-upkeep-all]').addEventListener('click', function (ev) {
              ev.stopPropagation();
              var res = RT.actions.payServerUpkeepAll();
              if (!res.ok) toast(res.msg || 'Geht nicht');
            });
            return node;
          };
        })(pl));
        pui.style.left = pbx + 'px';
        pui.style.top  = pby + 'px';
        updateEnergyPlantUi(pui);
      }
    }

    // Was in diesem Durchlauf nicht mehr vorkam, fliegt raus — abgerissene
    // Gebäude, Kacheln außerhalb des Kranzes, phasenabhängige UI.
    pruneGridNodes();
  }

  // Der Knopf am Werk zeigt, was ALLE abgedeckten Farmen zusammen kosten.
  // Sichtbar wird er erst, wenn sich ein Klick wirklich lohnt — mindestens
  // eine Farm ist fällig oder wartet schon ENERGY_PLANT_ALERT_CYCLES Zyklen
  // (RT.state.farmsNeedingUpkeepAlert). Vorher blinkte er nach jedem einzelnen
  // produzierten Zyklus einer abgedeckten Farm auf, also alle 8 Sekunden.
  // Bezahlt wird beim Klick trotzdem ALLES, was angefallen ist — anteilig
  // zahlen ist ausdrücklich erlaubt (siehe RT.state.serverUpkeepDueCost), die
  // Schwelle betrifft nur die Sichtbarkeit.
  function updateEnergyPlantUi(uiEl) {
    var btn = uiEl.querySelector('[data-upkeep-all]');
    if (!btn) return;
    if (!RT.state.farmsNeedingUpkeepAlert().length) {
      btn.style.display = 'none';
      return;
    }
    var farms = RT.state.farmsAwaitingUpkeep(true);
    var total = 0, anyDue = false;
    for (var i = 0; i < farms.length; i++) {
      total += RT.state.serverUpkeepDueCost(farms[i]);
      if (RT.state.farmUpkeepDue(farms[i])) anyDue = true;
    }
    btn.style.display = '';
    setIconLabel(btn, 'stromWasser', fmtMoney(Math.ceil(total)));
    btn.classList.toggle('is-due', anyDue);
    btn.disabled = false;
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

  // Zeichnet Kisten (Programm) + Tiere (User) + User-Modelle organisch auf der
  // Weide. Slot-Vorrang von hinten nach vorn: Kisten, dann Tiere, dann
  // Modelle. Dieselbe Reihenfolge wie in state.farmSlots() und im
  // Belegungs-Balken — liefen die auseinander, zeigte die Weide eine andere
  // Belegung als das Modal.
  function updateFarmAnimals(bldEl, inst) {
    var fs   = inst.state;
    var tier = RT.state.tierById(fs.tierId);
    if (!tier) return;

    // Unversorgte Farmen sind sichtbar am Ende: gedrosselt fahl, auf
    // Sparflamme grau und ohne Bewegung. Der Zustand muss am GEBÄUDE zu sehen
    // sein und nicht nur am Knopf — sonst steht irgendwo im Grid eine Farm
    // still, und man findet sie nicht.
    var speed = RT.state.farmSpeedFactor(inst);
    bldEl.classList.toggle('is-throttled', speed < 1 && speed > RT.state.SERVER_UPKEEP_CRAWL);
    bldEl.classList.toggle('is-dark',      speed <= RT.state.SERVER_UPKEEP_CRAWL);

    var animalsEl = bldEl.querySelector('[data-animals]');
    if (!animalsEl) return;

    var slots  = RT.state.farmSlots(inst);
    var boxes  = slots.boxes;
    var models = slots.models || 0;
    var count  = slots.animals;
    var total  = boxes + models + count;

    // Signatur zum Diff-Vergleich, damit wir nicht bei jedem Frame neu rendern.
    var sig = tier.id + ':' + boxes + ':' + count + ':' + models;
    var currentSig = animalsEl.getAttribute('data-sig');
    if (currentSig === sig) return;
    animalsEl.setAttribute('data-sig', sig);

    var html = '';
    for (var i = 0; i < total; i++) {
      var p = ANIMAL_POSITIONS[i % ANIMAL_POSITIONS.length];
      var kind = i < boxes ? 'box' : (i < boxes + count ? 'animal' : 'model');
      var src, alt, cls;
      if (kind === 'box') {
        src = 'sprites/User/Codekiste.png'; alt = 'Programmcode'; cls = ' farm-box';
      } else if (kind === 'model') {
        src = tier.modelSprite; alt = 'User-Modell'; cls = ' farm-model';
      } else {
        src = tier.sprite; alt = tier.alt; cls = '';
      }
      html += '<img class="farm-animal' + cls + '"'
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

    // Ein Stapel-Zähler, zwei Ressourcen: Watchtime aus den Tieren und
    // Metadaten aus den Modellen hängen beide an fs.stacks / fs.cycleTime.
    // Jeder Ring wird deshalb nur danach ein-/ausgeblendet, ob SEINE Ressource
    // in dieser Farm überhaupt entsteht.
    var full     = fs.stacks >= maxStacks;
    var pct      = full ? 100
                 : Math.min(100, (fs.cycleTime / RT.state.WATCHTIME_CYCLE_SEC) * 100);
    var hasUsers = RT.state.usersInFarm(inst) > 0;
    var hasModel = RT.state.currentPhase() >= 3 && RT.state.modelsInFarm(inst) > 0;

    // Radial-Progress (außen) — Watchtime aus den Tieren.
    var ring = uiEl.querySelector('[data-progress]');
    if (ring) {
      ring.style.setProperty('--p', pct);
      ring.classList.toggle('is-full', full);
      // Keine User = keine Watchtime = kein Ring. Nicht über is-full/visibility,
      // weil der Metadaten-Ring darin hängt und mit verschwinden würde.
      ring.classList.toggle('farm-progress-ring--wt-off', !hasUsers);
    }

    // Zweiter Ring (innen) — Metadaten aus den User-Modellen.
    //
    // ⚠️ Er läuft auf DERSELBEN Uhr wie der äußere und zeigt deshalb immer
    // denselben Stand. Er ist kein zweiter Fortschritt, sondern ein
    // Vorhandensein-Signal: „in dieser Farm liegen Modelle, hier entstehen
    // auch Metadaten". Wer ihm wieder eigene Information geben will, muss den
    // Metadaten-Zyklus vom Watchtime-Zyklus lösen — dann braucht die Farm
    // aber auch wieder zwei Stapel-Zähler.
    var metaRing = uiEl.querySelector('[data-progress-meta]');
    if (metaRing) metaRing.style.display = hasModel ? '' : 'none';

    // Ernte-Button — Größe skaliert mit Stack-Anzahl. Beschriftet wird nach
    // dem, was tatsächlich bereitliegt: eine Farm, deren Slots alle Modelle
    // sind, hat keine Watchtime und trotzdem etwas zu ernten.
    var btn = uiEl.querySelector('[data-harvest]');
    if (btn) {
      var total     = farmHarvestAmount(inst);
      var metaTotal = farmMetaHarvestAmount(inst);
      btn.style.setProperty('--stacks', fs.stacks);
      if (total > 0 || metaTotal > 0) {
        btn.classList.add('is-ready');
        var parts = [];
        if (total > 0)     parts.push(fmtNum(total) + ' ⏳');
        if (metaTotal > 0) parts.push(fmtNum(metaTotal) + ' 🗃️');
        btn.textContent = '🌾 ' + parts.join(' · ');
        btn.disabled = false;
      } else {
        btn.classList.remove('is-ready');
        btn.textContent = '⏳';
        btn.disabled = true;
      }
    }

    // Versorgungs-Knopf — Strom, Wasser und Wartung. Er erscheint erst, wenn
    // die Farm fällig ist, und zeigt den Preis. Vorher gibt es nichts zu tun.
    //
    // ⚠️ Bleibt AUCH sichtbar, wenn das Energiewerk diese Farm abdeckt. Der
    // Sammelklick ist alles-oder-nichts (RT.actions.payServerUpkeepAll) — reicht
    // das Geld nicht für alle abgedeckten Farmen, bleiben sie alle unversorgt.
    // Der einzelne Knopf ist der Notausgang: er rettet genau diese eine Farm
    // vor der Drosselung, wenn die Kasse für den Sammelklick nicht reicht.
    var upBtn = uiEl.querySelector('[data-upkeep]');
    if (upBtn) {
      var due = RT.state.farmUpkeepDue(inst);
      if (due) {
        var upCost = Math.ceil(RT.state.serverUpkeepDueCost(inst));
        upBtn.style.display = '';
        setIconLabel(upBtn, 'stromWasser', fmtMoney(upCost));
        upBtn.classList.toggle('is-dark',
          RT.state.farmSpeedFactor(inst) <= RT.state.SERVER_UPKEEP_CRAWL);
        upBtn.disabled = false;
      } else {
        upBtn.style.display = 'none';
      }
    }
  }

  // Ring-Farbe = Ressource, die dort gerade entsteht (Farb-Regel in game.css
  // bei .mk-ring). Gebäude, die immer dasselbe produzieren, tragen ihre Klasse
  // fest im Template; hier stehen nur die, deren Ausstoß wechselt.
  var RING_TONES = ['mk-ring--money', 'mk-ring--users', 'mk-ring--watchtime',
                    'mk-ring--trend', 'mk-ring--none'];
  function setRingTone(ring, tone) {
    if (!ring) return;
    for (var i = 0; i < RING_TONES.length; i++) ring.classList.remove(RING_TONES[i]);
    ring.classList.add('mk-ring--' + tone);
  }

  // Welche Ressource wirft diese Techtree-Node ab? Watchtime-Nodes zuerst:
  // die Dark Patterns unter ihnen SENKEN den Trend, für die wäre Rosa gelogen.
  function nodeRingTone(def) {
    if (!def) return 'none';
    if (def.watchtimeMult)     return 'watchtime';
    if (def.trendBonus > 0)    return 'trend';
    return 'none';             // Werbung/Marketing: schalten frei, erzeugen nichts
  }

  // Entwicklungs-UI eines Gebäudes (HQ oder Büro): Ring zählt die Restzeit
  // der Node runter, die auf DIESEM Gebäude läuft; der Button erscheint,
  // sobald sie abholbereit ist. Beides versteckt, wenn der Platz frei ist.
  function updateDevUi(uiEl, inst) {
    if (!RT.techtree) return;
    var ring     = uiEl.querySelector('[data-hq-ring]');
    var ringText = uiEl.querySelector('[data-hq-ring-text]');
    var btn      = uiEl.querySelector('[data-hq-collect]');

    // Ring und Button unabhängig voneinander: eine laufende Entwicklung und
    // eine abholbereite Marketing-Node können gleichzeitig auf demselben
    // Gebäude sitzen (Marketing/Werbung belegen keinen Platz).
    var at     = RT.techtree.nodesAtBuilding(inst.instanceId);
    var active = at.active;
    var ready  = at.ready;

    if (active) {
      var elapsed   = (Date.now() - active.entry.startAt) / 1000;
      var remaining = Math.max(0, active.def.durationSec - elapsed);
      var pct       = Math.min(100, (elapsed / active.def.durationSec) * 100);
      if (ring) {
        ring.style.setProperty('--p', pct);
        ring.style.visibility = 'visible';
        ring.classList.add('is-active');
        setRingTone(ring, nodeRingTone(active.def));
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
        // Reichweite bringt User (blau), PR bringt Trend (rosa).
        var camp = RT.state.campaignById(mkS.active.campaignId);
        setRingTone(ring, (camp && camp.kind === 'trend') ? 'trend' : 'users');
        if (ringText) {
          // > 100 s → Minuten (aufgerundet), sonst Sekunden.
          if (remaining > 100) ringText.textContent = Math.ceil(remaining / 60) + 'm';
          else                 ringText.textContent = Math.ceil(remaining) + 's';
        }
      } else {
        ring.style.setProperty('--p', 0);
        ring.classList.remove('is-active');
        setRingTone(ring, 'none');
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
  // Der Gold-Button ist reiner Einsammel-Button: liegt Geld bereit, ist er da,
  // sonst nicht. Neu gebucht wird ausschließlich im Modal (Klick aufs Gebäude) —
  // ein Wiederbuchen-Button an derselben Stelle wechselt sonst unter dem Finger
  // die Bedeutung.
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
        // Das ↻ hinter dem Zähler ist die einzige Stelle, an der Dauerbetrieb
        // AUF DEM FELD sichtbar ist — sonst sähe eine Agentur, die von selbst
        // weiterläuft, aus wie eine, die gleich stehenbleibt.
        if (ringText) ringText.textContent = (ws.deal.cyclesDone + 1) + '/' + RT.state.AD_CYCLES_MAX
                                           + (ws.deal.autoRenew ? '↻' : '');
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
      return;
    }

    btn.style.visibility = 'hidden';
    btn.classList.remove('is-ready');
    btn.disabled = true;
  }

  // KI-Labor auf dem Feld: Ring = laufender Umwandlungs-Zyklus, Button =
  // fertige Modelle einsammeln. Baugleich zu updateWerbeUi().
  function updateKiLaborUi(uiEl, inst) {
    var st       = inst.state;
    var ring     = uiEl.querySelector('[data-ring]');
    var ringText = uiEl.querySelector('[data-ring-text]');
    var btn      = uiEl.querySelector('[data-collect-models]');
    var type     = st.conv ? RT.state.convTypeById(st.conv.typeId) : null;

    if (ring) {
      if (st.conv && type) {
        ring.style.setProperty('--p', Math.min(100, (st.conv.cycleTime / type.duration) * 100));
        ring.classList.add('is-active');
        if (ringText) ringText.textContent = (st.conv.cyclesDone + 1) + '/' + RT.state.CONV_CYCLES_MAX;
      } else {
        ring.style.setProperty('--p', 0);
        ring.classList.remove('is-active');
        if (ringText) ringText.textContent = '';
      }
    }

    if (!btn) return;
    var ready = Math.floor(st.modelsReady || 0);
    if (ready > 0) {
      btn.style.visibility = '';
      btn.classList.add('is-ready');
      btn.textContent = '🧠 +' + fmtNum(ready);
      btn.disabled = false;
      return;
    }
    btn.style.visibility = 'hidden';
    btn.classList.remove('is-ready');
    btn.disabled = true;
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
    // freeUserCapacity() rechnet Code UND User-Modelle mit ein — von Hand
    // gerechnet flögen hier mehr User zur Kachel, als die Action tatsächlich
    // gutschreibt.
    var free = RT.state.freeUserCapacity();
    var willAdd = Math.min(ready, free);

    if (willAdd <= 0) {
      // Kein Platz — Action feuert Toast.
      RT.actions.collectMarketingUsers(instanceId);
      return;
    }

    // Erst Effekt (Rect aus dem Button greifen), dann Action.
    var cap = RT.state.serverCapacityTotal();
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
  // Ernte-Klick — vom Feld UND aus dem Farm-Modal (beide Knöpfe hängen hier
  // dran). Der Stapel trägt zwei Ressourcen, und beide fliegen zu ihrer
  // eigenen Kachel.
  //
  // ⚠️ Die Abbruchbedingung muss BEIDE prüfen. Sie stand auf `total <= 0`,
  // also allein auf der Watchtime — eine Farm, in der nur Modelle liegen,
  // hat davon keine, und der Klick lief ins Leere, obwohl der Knopf korrekt
  // „60k 🗃️ ernten" anzeigte.
  function harvestFromField(instanceId, btnEl) {
    var inst = RT.state.getInstance(instanceId);
    if (!inst) return;
    var stacks = Math.max(1, Math.min(RT.state.WATCHTIME_STACK_MAX, inst.state.stacks));
    var total  = farmHarvestAmount(inst);
    var meta   = farmMetaHarvestAmount(inst);
    if (total <= 0 && meta <= 0) return;
    // Pop-Scale wächst mit Stacks: 1.3 (1 stack) … 2.1 (5 stacks)
    if (total > 0) {
      spawnWatchtimeFly(btnEl, total, stacks);
      popResourceCard(el.watchtimeCard, 1.3 + stacks * 0.16);
    }
    if (meta > 0 && el.metaCard) {
      spawnFly(btnEl, el.metaCard, 'meta-fly', '+' + fmtNum(meta) + ' 🗃️',
               { fontSize: 20 + stacks * 6 });
      popResourceCard(el.metaCard, 1.3 + stacks * 0.16);
    }
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
    el.metaCard         = document.querySelector('.rt-resource--meta');
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

    // Delegiert statt direkt am Knopf: gameScreen.enter() baut die Profile-Bar
    // bei jedem Betreten neu, RT.ui.init() läuft aber nur einmal. Ein direkt
    // gebundener Handler hinge nach einem Re-Entry an einem Knopf, der gar
    // nicht mehr im Dokument steht.
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('#rt-account-btn')) openAccountModal();
      if (e.target.closest('#rt-hub-btn'))     leaveToHub();
    });
    updateAccountBadge();
    RT.bus.on('cloud:status', updateAccountBadge);

    RT.bus.on('state:changed', onStateChanged);
    RT.bus.on('effect',        onEffect);
    RT.bus.on('tick',          frameTick);
    RT.bus.on('toast',         toast);
    RT.bus.on('ad:finished',   onAdFinished);
    RT.bus.on('tile:bought',   onTileBought);

    // Sekundentakt für den Countdown auf dem Ereignis-Knopf. Läuft
    // unabhängig vom Spiel-Tick, weil er nur eine Anzeige treibt.
    if (RT.events && RT.events.startClock) RT.events.startClock();

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
      openHQModal(inst);
    }
    // Das Bürogebäude öffnet denselben Techtree wie das HQ — es ist ein
    // weiterer Entwicklungs-Platz, kein eigener Baum.
    else if (inst.id === 'buero') openHQModal(inst);
    else if (inst.id === 'kilabor') openKiLaborModal(inst);
    // Das Werk hat kein eigenes Modal — es tut nur eine Sache, und die sitzt
    // auf dem Knopf davor. Der Klick aufs Gebäude zeigt deshalb dasselbe wie
    // der Stufen-Knopf im Serverkapazitäts-Panel: worum es hier geht.
    else if (inst.id === 'energie') showServerUpkeepModal();
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

  // Klick auf ein angrenzendes, noch nicht gekauftes Feld → Kauf-Nachfrage.
  // Im Placement-Mode hat das Feld keine Bedeutung — Klick bricht dort ab.
  function onBuyTileClick(e) {
    if (placementMode) { exitPlacement(); return; }
    var c = parseInt(e.currentTarget.dataset.col, 10);
    var r = parseInt(e.currentTarget.dataset.row, 10);
    openTileBuyModal(c, r);
  }

  function openTileBuyModal(col, row) {
    openModal('🧱 Neues Feld kaufen', tileBuyHtml(col, row), { type: 'tilebuy', col: col, row: row });
  }
  function tileBuyHtml(col, row) {
    var s     = RT.state.current;
    var cost  = RT.state.nextTileCost();
    var nr    = (s.ownedTiles || []).length + 1;
    var can   = s.money >= cost;
    return '' +
      '<div class="tile-buy">' +
        '<p class="tile-buy-q">Dieses Feld dazukaufen?</p>' +
        '<div class="tile-buy-price">' + fmtMoney(cost) + '</div>' +
        '<small class="tile-buy-meta">' + nr + '. Feld · Kasse: ' + fmtMoney(s.money) + '</small>' +
        '<div class="tile-buy-actions">' +
          '<button class="tile-buy-btn tile-buy-btn--ghost" id="tile-buy-cancel" type="button">Abbrechen</button>' +
          // Keine Ledger-Karte und deshalb keine blasse Kachel — der Preis
          // steht hier als große Zahl allein da. Die Beschriftung folgt
          // trotzdem der gemeinsamen Form, damit „Zu wenig 💰" im ganzen
          // Spiel dasselbe heißt.
          '<button class="tile-buy-btn" id="tile-buy-ok" type="button" ' +
            'data-col="' + col + '" data-row="' + row + '" ' + (can ? '' : 'disabled') + '>' +
            (can ? 'Kaufen' : 'Zu wenig 💰') +
          '</button>' +
        '</div>' +
      '</div>';
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
      // Belegt ist alles, was Kapazität frisst: User + Code + User-Modelle.
      // Mit `s.users` allein blieb die Kachel grün, während die Modelle den
      // Server längst dichtgemacht hatten — genau dann braucht der Spieler
      // aber die Warnung.
      var used = cap - RT.state.freeUserCapacity();
      var full = cap > 0 && used >= cap;
      var warn = cap > 0 && used >= cap * 0.95;
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

    // Konto-Abzeichen mitziehen. Es hängt zwar am 'cloud:status'-Ereignis,
    // aber die Profile-Bar kann seitdem neu gebaut worden sein — dann steht
    // dort ein Abzeichen ohne Zustand.
    updateAccountBadge();

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

  /* ─── Konto-Abzeichen am Avatar ────────────────────────────
     Zeigt, wo der Spielstand liegt. Die Zustände kommen aus
     RT.cloud.status(); das Abzeichen selbst weiß nichts über RPCs.

     ⚠️ Es sitzt links beim Spieler, nicht rechts bei der Plattform —
     dort steht der grüne Online-Punkt für „deine Plattform ist live".
     Deshalb auch bewusst KEIN Grün für „angemeldet": die eine Farbe in
     dieser Leiste gehört schon einer anderen Aussage.                  */
  var ACCOUNT_STATES = {
    account: {
      mod: 'is-account', glyph: '☁',
      title: 'Angemeldet — dein Spielstand liegt in deinem Konto.'
    },
    offline: {
      mod: 'is-offline', glyph: '⇅',
      title: 'Keine Verbindung — dein Fortschritt wird gespeichert, sobald sie zurück ist.'
    },
    conflict: {
      mod: 'is-conflict', glyph: '!',
      title: 'Auf einem anderen Gerät wurde weitergespielt. Bitte die Seite neu laden.'
    },
    guest: {
      mod: 'is-guest', glyph: '☁',
      title: 'Nicht angemeldet — dein Spielstand liegt nur auf diesem Gerät.'
    }
  };

  function accountState() {
    return (RT.cloud && RT.cloud.status)
      ? RT.cloud.status()
      : { state: 'guest', lastOkAt: 0 };
  }

  // Jedes Mal frisch aus dem DOM geholt, nicht in `el` gecacht: die
  // Profile-Bar wird bei jedem Betreten des Spiel-Screens neu gebaut.
  function updateAccountBadge() {
    var badge = document.getElementById('rt-account-badge');
    if (!badge) return;
    var st  = accountState();
    var def = ACCOUNT_STATES[st.state] || ACCOUNT_STATES.guest;
    badge.className   = 'rt-account-badge ' + def.mod;
    badge.textContent = def.glyph;
    var btn = document.getElementById('rt-account-btn');
    if (btn) btn.title = def.title;
  }

  function agoLabel(ts) {
    if (!ts) return null;
    var sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 60)   return 'vor ' + sec + ' Sekunden';
    if (sec < 3600) return 'vor ' + Math.round(sec / 60) + ' Minuten';
    return 'vor ' + Math.round(sec / 3600) + ' Stunden';
  }

  /* Liegt hier ein Spielstand, der einem Konto gehört? Der localStorage
     wird direkt gelesen statt über storage.js: dessen load() hat den Stand
     ja gerade abgelehnt und trägt die Begründung nicht nach außen. */
  function hasForeignSave() {
    try {
      var raw = localStorage.getItem('startupStoryV3');
      if (!raw) return false;
      var p = JSON.parse(raw);
      return !!(p && p.owner);
    } catch (e) { return false; }
  }

  function openAccountModal() {
    var st    = accountState();
    var saved = agoLabel(st.lastOkAt);
    var title, lead, note = '', action = null;

    if (st.state === 'guest') {
      title  = '☁ Du spielst als Gast';
      lead   = 'Dein Spielstand liegt nur auf <b>diesem Gerät</b>. An einem anderen Tablet '
             + 'fängst du von vorne an, und beim Abmelden ist er weg.';
      note   = 'Melde dich in der Lernwelt an, dann folgt dir dein Konzern überallhin.';
      // ⚠️ Der Fall, der sonst wie ein Datenverlust aussieht: auf dem Gerät
      // liegt ein Spielstand aus einem Konto, aber ohne Anmeldung ist er
      // nicht spielbar (storage.ownsLocal). Ohne diesen Satz steht der
      // Schüler vor einem leeren Spiel und hält seinen Konzern für weg.
      if (hasForeignSave()) {
        lead = 'Auf diesem Gerät liegt ein Spielstand, der zu einem <b>Konto</b> gehört. '
             + 'Ohne Anmeldung lässt er sich nicht weiterspielen — dein Konzern ist aber '
             + 'nicht verloren, er wartet in deinem Konto auf dich.';
        note = 'Melde dich in der Lernwelt an, dann ist er wieder da.';
      }
      action = { id: 'rt-account-login', label: 'Zur Lernwelt' };
    } else if (st.state === 'conflict') {
      title  = '⚠️ Auf einem anderen Gerät wurde weitergespielt';
      lead   = 'Damit dort nichts verloren geht, speichert dieses Fenster nicht mehr. '
             + 'Was du hier gerade siehst, ist nicht mehr der neueste Stand.';
      note   = 'Lade die Seite neu — dann bekommst du den aktuellen Spielstand.';
      action = { id: 'rt-account-reload', label: 'Neu laden' };
    } else if (st.state === 'offline') {
      title  = '⇅ Gerade keine Verbindung';
      lead   = 'Dein Fortschritt liegt sicher auf diesem Gerät und wird ins Konto '
             + 'übertragen, sobald die Verbindung zurück ist. Du kannst einfach weiterspielen.';
      note   = saved ? 'Zuletzt im Konto gesichert: ' + saved + '.' : '';
    } else {
      title  = '☁ Angemeldet';
      lead   = 'Dein Spielstand liegt in deinem Konto — du kannst an jedem Gerät '
             + 'weiterspielen, an dem du dich anmeldest.';
      note   = saved ? 'Zuletzt gesichert: ' + saved + '.' : '';
    }

    var html = '<div class="rt-account-modal">'
             + '<p class="rt-account-modal__lead">' + lead + '</p>'
             + (note ? '<p class="rt-account-modal__note">' + note + '</p>' : '')
             + (action
                 ? '<button class="rt-account-modal__btn" id="' + action.id + '" type="button">'
                   + action.label + '</button>'
                 : '')
             // ─── Neu anfangen ────────────────────────────────────
             // Sitzt hier und nicht im Shop: das Konto-Abzeichen ist der
             // einzige Ort im Spiel, an dem es um den Spielstand als Ganzes
             // geht — und ein Neustart ist genau das. Abgesetzt hinter einer
             // Trennlinie, damit er nicht wie eine der Antworten auf den
             // Verbindungs-Zustand darüber aussieht.
             + '<div class="rt-account-danger">'
             + '  <div class="rt-account-danger__label">Von vorne anfangen</div>'
             + '  <p class="rt-account-danger__note">Löscht deinen Konzern vollständig — '
             + '     auf diesem Gerät und im Konto. Das lässt sich nicht rückgängig machen.</p>'
             + '  <button class="rt-account-modal__btn rt-account-modal__btn--danger"'
             + '          id="rt-account-restart" type="button">🗑 Spiel neu starten</button>'
             + '</div>'
             + '</div>';

    // context bewusst null: das ist eine Erklärung, kein lebendes Modal.
    // Mit einem context würde refreshModal() bei jedem state:changed
    // versuchen, den Inhalt neu zu bauen — den es gar nicht kennt.
    openModal(title, html, null);

    var btn = el.modalBody.querySelector('#rt-account-login');
    if (btn) btn.addEventListener('click', function () { window.location.href = '../index.html'; });
    btn = el.modalBody.querySelector('#rt-account-reload');
    if (btn) btn.addEventListener('click', function () { location.reload(); });
    btn = el.modalBody.querySelector('#rt-account-restart');
    if (btn) btn.addEventListener('click', openRestartModal);
  }

  /* ─── Zurück in die Lernwelt ───────────────────────────────
     Erst speichern, dann gehen. Der Hub liest den Spielstand als Blob und
     leitet daraus Ei, Monster und Münzen ab — läge dort noch der Stand von
     vor bis zu 20 Sekunden (PUSH_INTERVAL_MS in js/cloud.js), hinkte die
     Belohnungs-Sequenz eine Sitzung hinterher.

     ⚠️ Das Warten ist gedeckelt und der Ausgang egal: ein Push kann
     rate_limit bekommen oder schon inflight sein, und offline scheitert er
     ohnehin. Den Spieler dafür im Spiel festzuhalten wäre der schlechtere
     Handel — er verliert höchstens ein paar Sekunden Wachstum, die beim
     nächsten Hub-Besuch nachkommen.                                     */
  var HUB_PUSH_WAIT_MS = 1500;

  function leaveToHub() {
    var btn = document.getElementById('rt-hub-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    // Lokal sofort durchschreiben — das ist der Blob, den der Hub im
    // Gast-Modus liest, und er kennt keinen Push.
    try { RT.storage.save(); } catch (e) {}

    var go = function () { window.location.href = '../index.html'; };
    if (!RT.cloud || !RT.cloud.isServerMode()) { go(); return; }

    var done = false;
    var once = function () { if (!done) { done = true; go(); } };
    setTimeout(once, HUB_PUSH_WAIT_MS);
    RT.cloud.push().then(once, once);
  }

  /* ─── Neustart, zweiter Schritt ────────────────────────────
     Bewusst ein eigener Modal-Schritt statt `confirm()`: der Browser-Dialog
     kann nicht sagen, WAS verloren geht, und auf Tablets sieht er aus wie
     eine Systemmeldung, die man wegtippt. Hier steht der eigene Konzern in
     Zahlen daneben — das ist die Rückfrage, die wirklich zählt.

     ⚠️ Der Abbrechen-Weg führt zurück ins Konto-Modal und nicht ins Spiel:
     wer hier landet, wollte etwas am Spielstand tun.                    */
  function openRestartModal() {
    var s = RT.state.current;
    var F = RT.ledger.fmt;
    var st = accountState();

    var html = '<div class="rt-account-modal">'
             + '<p class="rt-account-modal__lead">Das hier ist dann weg:</p>'
             + '<div class="rt-account-loss">'
             + '  <div class="rt-account-loss__row"><span>👥 User</span><b>'
             +      F.num(s.users || 0) + '</b></div>'
             + '  <div class="rt-account-loss__row"><span>💰 Geld</span><b>'
             +      F.money(s.money || 0) + '</b></div>'
             + '  <div class="rt-account-loss__row"><span>🏗 Gebäude</span><b>'
             +      F.num((s.placedBuildings || []).length) + '</b></div>'
             + '  <div class="rt-account-loss__row"><span>🧩 Features</span><b>'
             +      F.num(completedNodeCount()) + '</b></div>'
             // Die einzige Zeile, die nicht aus diesem Spiel kommt. Sie steht
             // trotzdem hier: der Neustart löscht auch das Tier in der
             // Lernwelt, und das ist für die meisten Spieler der teurere
             // Verlust. Das Freilassen selbst macht der Hub beim nächsten
             // Besuch (er erkennt den leeren Spielstand von allein).
             + '  <div class="rt-account-loss__row"><span>🥚 Monster in der Lernwelt</span>'
             + '    <b>wird freigelassen</b></div>'
             + '</div>'
             + '<p class="rt-account-modal__note">'
             + (st.state === 'guest'
                 ? 'Der Spielstand auf diesem Gerät wird gelöscht.'
                 : 'Der Spielstand wird auf diesem Gerät <b>und in deinem Konto</b> gelöscht — '
                   + 'auch auf allen anderen Geräten.')
             + ' Danach fängst du wieder bei der ersten Zeile Code an.</p>'
             + '<button class="rt-account-modal__btn rt-account-modal__btn--danger"'
             + '        id="rt-account-restart-go" type="button">Ja, alles löschen</button>'
             + '<button class="rt-account-modal__btn" id="rt-account-restart-no"'
             + '        type="button">Abbrechen</button>'
             + '</div>';

    openModal('🗑 Wirklich komplett neu anfangen?', html, null);

    var no = el.modalBody.querySelector('#rt-account-restart-no');
    if (no) no.addEventListener('click', openAccountModal);

    var go = el.modalBody.querySelector('#rt-account-restart-go');
    if (go) go.addEventListener('click', function () {
      // Beide Knöpfe sofort tot: wipe() ist async (Server-RPC), und ein
      // zweiter Klick in dieser Zeit würde einen zweiten Reset absetzen.
      go.disabled = true;
      go.textContent = 'Wird gelöscht …';
      if (no) no.disabled = true;
      // Erst wenn der Serverstand wirklich weg ist, neu laden — sonst stirbt
      // der RPC mit der Seite und der nächste Boot zieht den gerade
      // gelöschten Stand wieder herunter (siehe storage.wipe).
      RT.storage.wipe().then(function () { location.reload(); });
    });
  }

  function completedNodeCount() {
    var tt = (RT.state.current && RT.state.current.techtree) || {};
    var n = 0;
    for (var k in tt) {
      if (Object.prototype.hasOwnProperty.call(tt, k) && tt[k] && tt[k].status === 'done') n++;
    }
    return n;
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
    var labs = RT.state.instancesByType('kilabor');
    for (var li = 0; li < labs.length; li++) {
      var liid = labs[li].instanceId;
      var luiEl = document.querySelector('.wb-ui[data-instance-id="' + liid + '"]');
      if (luiEl) updateKiLaborUi(luiEl, labs[li]);
    }
    var plnts = RT.state.instancesByType('energie');
    for (var pi2 = 0; pi2 < plnts.length; pi2++) {
      var pEl = document.querySelector('.wb-ui[data-instance-id="' + plnts[pi2].instanceId + '"]');
      if (pEl) updateEnergyPlantUi(pEl);
    }
    var devs = RT.state.devBuildings();
    for (var hi = 0; hi < devs.length; hi++) {
      var hquiEl = document.querySelector('[data-hq-ui="' + devs[hi].instanceId + '"]');
      if (hquiEl) updateDevUi(hquiEl, devs[hi]);
    }
  }

  // ---- Modal ----
  function openModal(title, bodyHtml, context) {
    modalContext = context;
    // innerHTML statt textContent: die Serverfarm hängt ihr Zyklen-Badge an
    // den Titel (farmUpkeepBadgeHtml). Alle Titel hier sind feste Strings,
    // kein User-Input — Escaping ist deshalb nicht nötig.
    el.modalTitle.innerHTML = title;
    el.modalBody.innerHTML    = bodyHtml;
    el.modal.classList.remove('modal-lg');   // Standard-Größe für Farm/Shop
    el.modal.classList.remove('modal-tree'); // Techtree-Baum: nicht scrollend
    // Modals mit Ledger-Karten laufen auf Papier-Hintergrund, damit die creme
    // Karten nicht auf reinem Weiß schwimmen. Sie stellen ihre Angebote
    // außerdem zweispaltig auf und brauchen dafür die breitere Bühne.
    // Die Serverfarm läuft ebenfalls auf Ledger-Karten, stellt aber nur zwei
    // davon untereinander — sie braucht den Papier-Hintergrund, nicht die
    // breite Bühne für nebeneinander stehende Angebote. Der Shop bekam die
    // breite Bühne am 2026-08-09 dazu, im selben Zug wie `.rt-shop-grid`:
    // ohne die Ertrag-Spalte sind die Karten schmal genug, um zweispaltig zu
    // laufen — dafür fehlte vorher der Platz.
    var tt = context && (context.type === 'werbe' || context.type === 'marketing' ||
                         context.type === 'farm'  || context.type === 'shop');
    var wide = !!tt && context.type !== 'farm';
    el.modal.classList.toggle('modal-tt', !!tt);
    el.modal.classList.toggle('modal-wide', wide);
    // Modale, die einen eigenen Abbrechen-Button mitbringen, brauchen den
    // globalen "Schließen" nicht — zwei Buttons für dieselbe Aktion.
    if (el.modalClose) {
      el.modalClose.style.display = (context && context.type === 'tilebuy') ? 'none' : '';
    }
    el.modalBackdrop.classList.add('open');
    wireModalButtons();
  }
  function closeModal() {
    modalContext = null;
    sliderDragging = false;
    werbeIntensity = null;
    werbeVolume    = null;
    werbeTargeting = null;
    werbeRenew     = null;
    creatorStep    = null;
    shopPreTile   = null;
    el.modalBackdrop.classList.remove('open');
    el.modal.classList.remove('modal-lg');
    // Das Techtree-Modal setzt seine Klassen selbst und läuft nicht über
    // openModal — ohne das hier bliebe modal-tt aus dem Werbe-Modal hängen.
    el.modal.classList.remove('modal-tt');
    el.modal.classList.remove('modal-wide');
    el.modal.classList.remove('modal-tree');
    el.modalBody.innerHTML = '';
  }
  function refreshModal() {
    if (!modalContext) return;
    if (modalContext.type === 'trend') { el.modalBody.innerHTML = trendInfoHtml(); return; }
    // Feldkauf: Preis steht fest, aber die Absage hängt am Kontostand.
    if (modalContext.type === 'tilebuy') {
      el.modalBody.innerHTML = tileBuyHtml(modalContext.col, modalContext.row);
      wireModalButtons();
      return;
    }
    // Serverkosten-Modal hat keine Instanz (kein Gebäude dahinter) — es zeigt
    // nur die fünf Tarifstufen und den aktuellen Stand. Ohne diese Zeile griff
    // der Fallback unten: getInstance(undefined) lieferte nichts, also schloss
    // JEDER folgende state:changed-Tick das Modal sofort wieder — es blitzte
    // nur kurz auf. Dieselbe Ausnahme steht in refreshModalLive() schon.
    if (modalContext.type === 'shop' || modalContext.type === 'hq' ||
        modalContext.type === 'serverUpkeep') return;
    var inst = RT.state.getInstance(modalContext.instanceId);
    if (!inst) { closeModal(); return; }
    if (modalContext.type === 'farm')      renderFarmBody(inst);
    else if (modalContext.type === 'werbe')     renderWerbeBody(inst);
    else if (modalContext.type === 'marketing') renderMarketingBody(inst);
    else if (modalContext.type === 'kilabor')   renderKiLaborBody(inst);
  }
  // Zieht die blassen Kacheln EINER Ledger-Karte nach, ohne sie neu zu bauen.
  // Gebraucht in den Modalen, die ihre Knöpfe im Sekundentakt aktualisieren
  // (Werbeagentur, KI-Labor): dort ist die Deckung eine laufende Zahl, ein
  // Neuaufbau der Karte würde aber den Intensitäts-Regler den Finger kosten.
  //
  // Gesucht wird ausschließlich in der KOSTEN-Spalte — in der Ertrags-Spalte
  // stehen dieselben Ressourcen-Klassen (ein Werbedeal bringt 💰 und kostet ⏳),
  // und eine blasse Ertrags-Kachel wäre schlicht gelogen.
  function markShortTiles(btn, costItems) {
    var card = (btn && btn.closest) ? btn.closest('.rt-led-card') : null;
    if (!card) return;
    for (var i = 0; i < costItems.length; i++) {
      var it = costItems[i];
      if (!it.res) continue;
      var tile = card.querySelector('.rt-led__col--cost .rt-led__item--' + it.res);
      if (tile) tile.classList.toggle('rt-led__item--short', !!it.short);
    }
  }

  function refreshModalLive() {
    if (!modalContext) return;
    // Trend-Modal komplett neu zeichnen — die Werte laufen kontinuierlich.
    if (modalContext.type === 'trend') { el.modalBody.innerHTML = trendInfoHtml(); return; }
    // Modale ohne laufende Werte. Die Serverkosten stehen mit dabei: sie ändern
    // sich nur, wenn Kapazität dazukommt — und dann ist das Modal längst zu.
    if (modalContext.type === 'shop' || modalContext.type === 'hq' ||
        modalContext.type === 'tilebuy' || modalContext.type === 'serverUpkeep') return;
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


      // Laufender Deal: Restzeit + Zyklus-Fortschritt. Nur diese zwei Stellen
      // der Karte bewegen sich — Werbeart und Intensität stehen fest.
      var runInfoW = document.getElementById('werbe-running-info');
      var fillW    = document.getElementById('werbe-modal-fill');
      if (ws.deal) {
        var tW = RT.state.adTypeById(ws.deal.typeId);
        if (tW) {
          if (runInfoW) {
            runInfoW.textContent =
              'Zyklus ' + (ws.deal.cyclesDone + 1) + ' / ' + RT.state.AD_CYCLES_MAX + ', noch ' +
              Math.max(0, Math.ceil(tW.duration - ws.deal.cycleTime)) + ' s' +
              (ws.deal.autoRenew ? ' · läuft danach weiter' : '');
          }
          if (fillW) fillW.style.width = Math.min(100, (ws.deal.cycleTime / tW.duration) * 100) + '%';
        }
      }

      // Buchen-Buttons: Watchtime kann sich jederzeit ändern. Beschriftung UND
      // blasse Kachel laufen hier im Sekundentakt mit — auf einer Anteils-Stufe
      // ist die Deckung eine laufende Zahl, und „gerade reicht's nicht, gleich
      // schon" ist genau die Aussage, die der Spieler braucht.
      var adBtnsLive = document.querySelectorAll('[data-ad]');
      var liveSel    = werbeSelection(ws);
      for (var bi = 0; bi < adBtnsLive.length; bi++) {
        var b    = adBtnsLive[bi];
        var aDef = RT.state.adTypeById(b.getAttribute('data-ad'));
        if (!aDef) continue;
        // Gegen die eingestellte Stufe prüfen, nicht gegen den Grundpreis:
        // auf einer Anteils-Stufe blieben die Knöpfe sonst aktiv, bis der
        // Deal beim Buchen scheitert.
        var liveCost = [
          { res: 'watchtime', need: RT.state.adWatchtimePerCycle(aDef.id, liveSel.volume) },
          { res: 'meta',      need: RT.state.adMetadataPerCycle(aDef.id, liveSel.volume,
                                                                liveSel.targeting) }
        ];
        var liveNeed = RT.ledger.cover(liveCost);
        // Läuft schon ein Deal, ist die Deckung nicht die Frage — dann bleibt
        // die Spalte farbig und nur der Knopf trägt den Grund.
        if (ws.deal) for (var k = 0; k < liveCost.length; k++) liveCost[k].short = false;
        b.disabled = !!ws.deal || !liveNeed.ok;
        b.textContent = ws.deal ? 'Es läuft schon ein Deal'
                      : (liveNeed.label ||
                         (aDef.id === (ws.lastDeal && ws.lastDeal.typeId) ? '▶ Erneut buchen'
                                                                          : '▶ Buchen'));
        markShortTiles(b, liveCost);
      }
    }
    // KI-Labor: Restzeit, Zyklus-Balken und Einsammel-Knopf laufen zwischen
    // zwei state:changed weiter — ohne diesen Block stünde der Balken still,
    // bis irgendetwas anderes den State anfasst.
    if (modalContext.type === 'kilabor') {
      var ls = inst.state;
      var lReady = Math.floor(ls.modelsReady || 0);
      var lBtn = document.getElementById('conv-collect-btn');
      if (lBtn) {
        lBtn.disabled    = lReady <= 0;
        lBtn.textContent = '🧠 Einsammeln (' + fmtNum(lReady) + ')';
        lBtn.classList.toggle('rt-btn-tt--collect', lReady > 0);
      }
      var lInfo = document.getElementById('conv-running-info');
      var lFill = document.getElementById('conv-modal-fill');
      if (ls.conv) {
        var lt = RT.state.convTypeById(ls.conv.typeId);
        if (lt) {
          if (lInfo) {
            lInfo.textContent = 'Zyklus ' + (ls.conv.cyclesDone + 1) + ' / ' +
                                RT.state.CONV_CYCLES_MAX + ', noch ' +
                                Math.max(0, Math.ceil(lt.duration - ls.conv.cycleTime)) + ' s';
          }
          if (lFill) lFill.style.width = Math.min(100, (ls.conv.cycleTime / lt.duration) * 100) + '%';
        }
      }
      // Buchen-Knöpfe: die Watchtime kann sich jederzeit ändern.
      var lBtns = document.querySelectorAll('[data-conv]');
      for (var ci = 0; ci < lBtns.length; ci++) {
        var cb = lBtns[ci];
        var cDef = RT.state.convTypeById(cb.getAttribute('data-conv'));
        if (!cDef) continue;
        var cBlocked = convBlockedReason(ls, cDef.id);
        cb.disabled = !!cBlocked;
        // Der Knopf TRÄGT den Grund als Beschriftung (siehe Aufbau der Karte) —
        // ohne das Nachziehen stünde „Umwandlung starten" auf einem gesperrten
        // Knopf. Seit der Platz der Deckel ist, wechselt der Grund im Betrieb:
        // die User wachsen weiter und nehmen ihn dem Labor weg.
        cb.textContent = cBlocked || 'Umwandlung starten';
        if (cBlocked) cb.setAttribute('title', cBlocked); else cb.removeAttribute('title');
        // Blasse Kachel dazu — aber nur, wenn wirklich die Watchtime fehlt.
        // „Serverkapazität voll" und „es läuft schon eine Umwandlung" sind
        // keine Ressourcen-Frage und lassen die Spalte farbig.
        var cCost = [{ res: 'watchtime',
                       need: ls.conv ? undefined : RT.state.convWatchtimePerCycle(cDef.id) }];
        RT.ledger.cover(cCost);
        markShortTiles(cb, cCost);
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
        runInfo.textContent = camp.icon + ' ' + campaignRunLabel(camp, mkS.active)
                            + ' läuft — noch ' + remaining + 's';
      }
      var runFill = document.getElementById('mk-modal-fill');
      if (runFill && mkS.active) {
        var pct = Math.min(100, ((Date.now() - mkS.active.startAt) / 1000 / mkS.active.duration) * 100);
        runFill.style.width = pct + '%';
      }
    }
    if (modalContext.type === 'farm') {
      // Nur die drei Stellen, die zwischen zwei state:changed weiterlaufen.
      // Der Belegungs-Balken bleibt stehen — User und Code ändern sich nur
      // über den State, und dann rendert refreshModal die Karte ohnehin neu.
      var lblEl = document.getElementById('farm-stack-label');
      if (lblEl) lblEl.textContent = farmStackLabel(inst);
      var fillEl = document.getElementById('farm-stack-fill');
      if (fillEl) fillEl.style.width = (farmStackProgress(inst.state) * 100).toFixed(1) + '%';
      var harvestBtn = document.getElementById('farm-harvest-btn');
      if (harvestBtn) {
        var amount = farmHarvestAmount(inst);
        // ⚠️ Die Metadaten müssen hier mit. Diese Zeile läuft im Sekundentakt
        // über das Ergebnis von renderFarmBodyHtml() drüber — ohne sie stünde
        // auf dem Knopf für einen Frame beides und danach dauerhaft nur die
        // Watchtime.
        var metaAmount = farmMetaHarvestAmount(inst);
        var anyReady = amount > 0 || metaAmount > 0;
        harvestBtn.disabled  = !anyReady;
        harvestBtn.textContent = farmHarvestLabel(amount, metaAmount);
        harvestBtn.classList.toggle('rt-btn-tt--collect', anyReady);
      }
    }
  }

  function wireModalButtons() {
    var slider = document.getElementById('werbe-slider');
    if (slider) {
      // Der Slider setzt nichts im State — sein Wert wird erst beim Buchen
      // übernommen. Hier läuft nur die Live-Vorschau aller Werbearten.
      //
      // Gepatcht werden gezielt die drei Zellen, die von der Intensität
      // abhängen (Geld/Zyklus, Trend-Malus, Geld gesamt). Watchtime und Dauer
      // bleiben stehen — sie sind intensitätsunabhängig. Ein Neuaufbau der
      // Karten würde hier den Slider-Griff unter dem Finger wegziehen.
      slider.addEventListener('input', function (e) {
        var pct = parseInt(e.target.value, 10);
        werbeIntensity = pct;
        var lbl = document.getElementById('werbe-slider-label');
        if (lbl) lbl.innerHTML = 'Intensität: <b>' + pct + '%</b>';

        var F     = RT.ledger.fmt;
        var types = RT.state.adTypesUnlocked();
        // Volumen und Targeting stehen fest, während am Slider gezogen wird —
        // sie müssen trotzdem in die Rechnung, sonst zeigt die Vorschau die
        // Zahlen eines ×1-Deals ohne Targeting.
        var wInst = RT.state.getInstance(slider.getAttribute('data-inst'));
        var wSel  = werbeSelection(wInst ? wInst.state : {});
        for (var p = 0; p < types.length; p++) {
          var id = types[p].id;
          setLedgerVal('ad-' + id + '-money',
            F.money(Math.round(RT.state.adMoneyPerCycle(id, pct / 100, wSel.volume, wSel.targeting))));
          setLedgerVal('ad-' + id + '-trend',
            F.trend(-RT.state.adTrendMalus(id, pct / 100, wSel.volume)) + ' %');
        }
      });
      slider.addEventListener('pointerdown', function () { sliderDragging = true; });
      slider.addEventListener('pointerup',   function () { sliderDragging = false; });
      slider.addEventListener('pointercancel', function () { sliderDragging = false; });
    }

    // Regler der Creator-Beteiligung im Marketing-Center. Gleiche Bauart wie
    // der Intensitäts-Regler oben: gepatcht werden nur die Zellen, die vom
    // Regler abhängen — Preis, Provisionsabzug und Trend. Alles andere an der
    // Karte ist reglerunabhängig und bliebe beim Neuaufbau ohnehin gleich.
    var mkSlider = document.getElementById('mk-trend-slider');
    if (mkSlider) {
      mkSlider.addEventListener('input', function (e) {
        var step = parseInt(e.target.value, 10);
        creatorStep = step;
        var cid = e.target.getAttribute('data-c');
        updateCampaignSliderCells(cid, step);
      });
      mkSlider.addEventListener('pointerdown',   function () { sliderDragging = true; });
      mkSlider.addEventListener('pointerup',     function () { sliderDragging = false; });
      mkSlider.addEventListener('pointercancel', function () { sliderDragging = false; });
    }

    // Volumen-Knöpfe und Targeting-Schalter ändern die angezeigten Kosten
    // (Watchtime, Metadaten-Zeile kommt und geht) — deshalb ein voller
    // Neuaufbau statt eines Zell-Patches wie beim Slider. Beides sind Klicks,
    // da geht kein Griff unter dem Finger verloren.
    var volBtns = document.querySelectorAll('[data-vol]');
    for (var vi = 0; vi < volBtns.length; vi++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          werbeVolume = parseInt(btn.getAttribute('data-vol'), 10);
          var vInst = RT.state.getInstance(btn.getAttribute('data-inst'));
          if (vInst) renderWerbeBody(vInst);
        });
      })(volBtns[vi]);
    }

    var targBox = document.getElementById('werbe-targeting');
    if (targBox) {
      targBox.addEventListener('change', function () {
        werbeTargeting = targBox.checked;
        var tInst = RT.state.getInstance(targBox.getAttribute('data-inst'));
        if (tInst) renderWerbeBody(tInst);
      });
    }

    // Dauerbetrieb ändert keine einzige Zahl in den Karten — hier reicht der
    // Merker, ein Neuaufbau wäre nur Flackern. Die Checkbox trägt ihren
    // Zustand selbst, bis das nächste state:changed das Modal neu baut.
    var renewBox = document.getElementById('werbe-renew');
    if (renewBox) {
      renewBox.addEventListener('change', function () {
        werbeRenew = renewBox.checked;
      });
    }

    // "?"-Knöpfe der Optionen-Zeilen: klappen ihre eigene Erklärung auf/zu,
    // ohne das Modal neu zu bauen — reines DOM-Toggle.
    var tipBtns = document.querySelectorAll('.rt-targ__help');
    for (var ti = 0; ti < tipBtns.length; ti++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var tip = document.getElementById(btn.getAttribute('data-tip'));
          if (tip) tip.classList.toggle('is-open');
        });
      })(tipBtns[ti]);
    }

    var adBtns = document.querySelectorAll('[data-ad]');
    for (var ai = 0; ai < adBtns.length; ai++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var sl  = document.getElementById('werbe-slider');
          var pct = sl ? parseInt(sl.value, 10) : 25;
          var bInst = RT.state.getInstance(btn.getAttribute('data-inst'));
          var bSel  = werbeSelection(bInst ? bInst.state : {});
          var res = RT.actions.bookAdDeal(btn.getAttribute('data-inst'),
                                          btn.getAttribute('data-ad'), pct / 100,
                                          bSel.volume, bSel.targeting, bSel.autoRenew);
          if (res.ok) closeModal();
          else toast(res.msg || 'Deal kann nicht starten');
        });
      })(adBtns[ai]);
    }

    // KI-Labor: Umwandlung buchen bzw. fertige Modelle einsammeln.
    var convBtns = document.querySelectorAll('[data-conv]');
    for (var ti = 0; ti < convBtns.length; ti++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var res = RT.actions.startConversion(btn.getAttribute('data-inst'),
                                               btn.getAttribute('data-conv'));
          if (res.ok) closeModal();
          else toast(res.msg || 'Umwandlung kann nicht starten');
        });
      })(convBtns[ti]);
    }
    var convCollect = document.getElementById('conv-collect-btn');
    if (convCollect) convCollect.addEventListener('click', function () {
      var got = RT.actions.collectModels(convCollect.getAttribute('data-inst'));
      if (got > 0) toast('🧠 ' + fmtNum(got) + ' User-Modelle sind eingezogen');
    });

    var cancelWerbe = document.getElementById('werbe-cancel-btn');
    if (cancelWerbe) cancelWerbe.addEventListener('click', function () {
      RT.actions.cancelAdDeal(cancelWerbe.getAttribute('data-inst'));
    });

    var collectWerbe = document.getElementById('werbe-collect-btn');
    if (collectWerbe) collectWerbe.addEventListener('click', function () {
      collectMoneyFromField(collectWerbe.getAttribute('data-inst'), collectWerbe);
    });

    // Wie der Ernte-Knopf auf dem Feld — inklusive Flug-Bubble und Puls auf
    // der Watchtime-Kachel. Es ist derselbe Vorgang, also auch dasselbe
    // Feedback (analog collectMoneyFromField beim Werbe-Einsammeln).
    var harvestBtn = document.getElementById('farm-harvest-btn');
    if (harvestBtn) harvestBtn.addEventListener('click', function () {
      harvestFromField(harvestBtn.getAttribute('data-inst'), harvestBtn);
    });

    var upgradeBtn = document.getElementById('farm-upgrade-btn');
    if (upgradeBtn) upgradeBtn.addEventListener('click', function () {
      var ok = RT.actions.upgradeFarm(upgradeBtn.getAttribute('data-inst'));
      if (!ok) toast('Zu wenig 💰 für den Ausbau');
    });

    var mkCollect = document.getElementById('mk-collect-btn');
    if (mkCollect) mkCollect.addEventListener('click', function () {
      RT.actions.collectMarketingUsers(mkCollect.getAttribute('data-inst'));
    });

    // Kampagne-Start-Buttons. Auf [data-c] filtern, nicht auf .mk-start-btn
    // allein: Werbearten teilten sich früher dieselbe Button-Klasse, bekamen
    // dadurch diesen Handler zusätzlich und lösten bei jedem Buchen einen
    // falschen "Kampagne kann nicht gestartet werden"-Toast aus (startCampaign
    // steigt bei einer werbe-Instanz sofort mit false aus). Die Werbe-Buttons
    // tragen die Klasse inzwischen nicht mehr — der Filter bleibt als Schutz.
    var campBtns = document.querySelectorAll('.mk-start-btn[data-c]');
    for (var i = 0; i < campBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var cid = btn.getAttribute('data-c');
          var iid = btn.getAttribute('data-inst');
          // Der Reglerwert kommt vom Slider der Karte, nicht aus creatorStep:
          // die Modulvariable ist leer, solange niemand gezogen hat. Kampagnen
          // ohne Regler haben keinen Slider und übergeben undefined — dort gilt
          // dann der feste Wert aus der Definition.
          var ok = RT.actions.startCampaign(iid, cid, campaignSliderTrend(cid));
          if (ok) closeModal();
          else toast('Kampagne kann nicht gestartet werden.');
        });
      })(campBtns[i]);
    }

    var tileOk = document.getElementById('tile-buy-ok');
    if (tileOk) tileOk.addEventListener('click', function () {
      var c = parseInt(tileOk.getAttribute('data-col'), 10);
      var r = parseInt(tileOk.getAttribute('data-row'), 10);
      var res = RT.actions.buyTile(c, r);
      if (res.ok) closeModal();
      else toast(res.msg);
    });
    var tileCancel = document.getElementById('tile-buy-cancel');
    if (tileCancel) tileCancel.addEventListener('click', closeModal);

    // Shop-Kauf-Buttons. `shop-buy-btn` ist reiner Handler-Haken, das Aussehen
    // kommt von `rt-btn-tt` wie überall sonst. Auf [data-hw]/[data-t] filtern:
    // welche Aktion gemeint ist, steht im Attribut, nicht in der Klasse.
    var buyBtns = document.querySelectorAll('.shop-buy-btn[data-hw], .shop-buy-btn[data-t]');
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

  // Kleines Zyklen-Badge hinter dem Modal-Titel: wie viele Produktions-
  // Zyklen noch übrig sind, bevor die Farm wieder Geld sehen will —
  // absteigend (25/25 frisch bezahlt → 15/25 nach 10 verbrauchten Zyklen).
  // Ein Mini-Ring trägt die Zahl, damit es nicht nur Text ist: derselbe
  // conic-gradient-Trick wie beim Produktions-Ring auf dem Feld, nur klein
  // genug fürs Titel-Zeile. Vor Phase 2 gibt es keine Serverkosten, also
  // auch kein Badge.
  function farmUpkeepBadgeHtml(inst) {
    if (RT.state.currentPhase() < 2) return '';
    var total = RT.state.serverUpkeepCycles();
    if (total <= 0) return '';
    var used = Math.min(inst.state.upkeepCycles || 0, total);
    var rest = total - used;
    var pct  = (rest / total) * 100;
    var due  = RT.state.farmUpkeepDue(inst);
    var dark = RT.state.farmSpeedFactor(inst) <= RT.state.SERVER_UPKEEP_CRAWL;
    var cls  = 'farm-upkeep-badge' + (due ? ' is-due' : '') + (dark ? ' is-dark' : '');
    return ''
      + '<span class="' + cls + '" title="Produktions-Zyklen bis zur nächsten Versorgung">'
      +   '<span class="farm-upkeep-badge__ring" style="--p:' + pct.toFixed(1) + '"></span>'
      +   '<span class="farm-upkeep-badge__txt">' + rest + '/' + total + '</span>'
      + '</span>';
  }

  function farmModalTitle(inst) {
    return 'Serverfarm (Stufe ' + RT.state.tierStufe(inst.state.tierId) + ')' + farmUpkeepBadgeHtml(inst);
  }
  function openFarmModal(inst) {
    openModal(farmModalTitle(inst), renderFarmBodyHtml(inst), { type: 'farm', instanceId: inst.instanceId });
  }
  function renderFarmBody(inst) {
    el.modalTitle.innerHTML = farmModalTitle(inst);
    el.modalBody.innerHTML = renderFarmBodyHtml(inst);
    wireModalButtons();
  }
  // Was hier geerntet würde — inklusive Watchtime-Multiplikator, denn der
  // greift bei der Ernte (siehe actions.harvestFarm). Ohne ihn zeigte der
  // Button weniger an, als am Ende gutgeschrieben wird.
  function farmHarvestAmount(inst) {
    return Math.floor(inst.state.stacks * RT.state.usersInFarm(inst)
                      * RT.state.WATCHTIME_PER_USER_PER_CYCLE * RT.state.watchtimeMult());
  }

  // Metadaten, die bereitliegen. Kein Multiplikator — die Watchtime-Nodes
  // wirken auf die Watchtime, nicht auf die Modelle.
  function farmMetaHarvestAmount(inst) {
    if (RT.state.currentPhase() < 3) return 0;
    return Math.floor(inst.state.stacks * RT.state.metadataPerCycle(inst));
  }

  function farmHarvestLabel(amount, meta) {
    var parts = [];
    if (amount > 0) parts.push(fmtNum(amount) + ' ⏳');
    if (meta   > 0) parts.push(fmtNum(meta)   + ' 🗃️');
    return parts.length ? '🌾 ' + parts.join(' · ') + ' ernten' : '⏳ Nichts zu ernten';
  }

  // Stapel-Fortschritt als Anteil von 0..1. Der angefangene Zyklus zählt
  // anteilig mit, damit sich der Balken so kontinuierlich bewegt wie der Ring
  // auf dem Feld — sonst stünde er 8 Sekunden still und ruckte dann weiter.
  function farmStackProgress(fs) {
    var max = RT.state.WATCHTIME_STACK_MAX;
    var partial = Math.min(1, (fs.cycleTime || 0) / RT.state.WATCHTIME_CYCLE_SEC);
    return Math.min(1, (Math.min(fs.stacks, max) + (fs.stacks >= max ? 0 : partial)) / max);
  }

  // Der Stapel trägt beides: Watchtime aus den Usern und Metadaten aus den
  // Modellen. Eine Farm mit Modellen produziert also weiter, auch wenn kein
  // User mehr drin wohnt — die Zeile muss das sagen, sonst liest sie sich wie
  // ein Stillstand.
  function farmStackLabel(inst) {
    var fs  = inst.state;
    var max = RT.state.WATCHTIME_STACK_MAX;
    if (RT.state.usersInFarm(inst) <= 0 && RT.state.modelsInFarm(inst) <= 0) {
      return 'Keine User — keine Produktion.';
    }
    if (RT.state.usersInFarm(inst) <= 0 && fs.stacks < max) {
      var restM = Math.max(0, Math.ceil(RT.state.WATCHTIME_CYCLE_SEC - (fs.cycleTime || 0)));
      return 'Nur Modelle — Stapel ' + fs.stacks + ' / ' + max +
             ' · nächster in ' + restM + ' s';
    }
    if (fs.stacks >= max) return 'Stapel ' + max + ' / ' + max + ' — voll, die Produktion steht.';
    var rest = Math.max(0, Math.ceil(RT.state.WATCHTIME_CYCLE_SEC - (fs.cycleTime || 0)));
    return 'Stapel ' + fs.stacks + ' / ' + max + ' · nächster in ' + rest + ' s';
  }

  // Belegungs-Balken: User, Code und freier Platz als ein Streifen, die
  // exakten Zahlen darunter. Die acht Slots vom Feld tauchen hier bewusst
  // NICHT auf — sie sind gerundete Grid-Deko (ein Tier kann für 1 User oder
  // für 2.000 stehen). Im Modal geht es um die genaue Verteilung.
  //
  // Bezugsgröße ist die Kapazität; nur bei Überbelegung (im laufenden Spiel
  // unmöglich, jede User-Quelle prüft freeUserCapacity) wächst der Maßstab auf
  // die tatsächliche Belegung, und eine Markierung zeigt, wo das Dach liegt.
  function farmCapBarHtml(users, code, cap, models) {
    models    = models || 0;
    var used  = users + code + models;
    var scale = Math.max(cap, used, 1);
    var free  = Math.max(0, cap - used);
    var over  = Math.max(0, used - cap);
    var pct   = function (n) { return (n / scale * 100).toFixed(2) + '%'; };

    var keys = ''
      + '<span class="rt-cap__key rt-cap__key--users"><b>' + RT.ledger.fmt.num(users) + '</b> User</span>'
      + '<span class="rt-cap__key rt-cap__key--code"><b>'  + RT.ledger.fmt.num(code)  + '</b> Code</span>'
      // Die Modell-Zeile erscheint erst, wenn welche da sind — vor Phase 3 ist
      // sie sonst eine dauerhafte Null, die nichts erklärt.
      + (models > 0
          ? '<span class="rt-cap__key rt-cap__key--models"><b>' + RT.ledger.fmt.num(models) + '</b> Modelle</span>'
          : '')
      + (over > 0
          ? '<span class="rt-cap__key rt-cap__key--over"><b>' + RT.ledger.fmt.num(over) + '</b> über Kapazität</span>'
          : '<span class="rt-cap__key rt-cap__key--free"><b>' + RT.ledger.fmt.num(free) + '</b> frei</span>');

    return ''
      + '<div class="rt-cap' + (over > 0 ? ' is-over' : '') + '">'
      +   '<div class="rt-cap__top"><span>Kapazität</span><b>' + RT.ledger.fmt.num(cap) + '</b></div>'
      +   '<div class="rt-cap__bar">'
      +     '<div class="rt-cap__seg rt-cap__seg--users"  style="width:' + pct(users)  + '"></div>'
      +     '<div class="rt-cap__seg rt-cap__seg--code"   style="width:' + pct(code)   + '"></div>'
      +     '<div class="rt-cap__seg rt-cap__seg--models" style="width:' + pct(models) + '"></div>'
      +     (over > 0 ? '<div class="rt-cap__cap" style="left:' + pct(cap) + '"></div>' : '')
      +   '</div>'
      +   '<div class="rt-cap__keys">' + keys + '</div>'
      + '</div>';
  }

  function renderFarmBodyHtml(inst) {
    var s     = RT.state.current;
    var fs    = inst.state;
    var stufe = RT.state.tierStufe(fs.tierId);
    var next  = RT.state.nextTier(fs.tierId);
    var iid   = inst.instanceId;
    var F     = RT.ledger.fmt;

    var users  = RT.state.usersInFarm(inst);
    var code   = RT.state.programmInFarm(inst);
    var cap    = RT.state.farmCapacity(inst);
    var mult   = RT.state.watchtimeMult();
    var modCap = RT.state.modelsInFarm(inst);
    var amount = farmHarvestAmount(inst);
    var meta   = farmMetaHarvestAmount(inst);
    // In Phase 0/1 gibt es keine Sanduhr-Ökonomie (siehe Tick in js/loop.js)
    // und keinen Ausbau — die Farm ist dort nur Kapazität für User und die
    // Features aus dem HQ. Alles Watchtime-bezogene bleibt deshalb weg, statt
    // eine Produktion anzuzeigen, die gar nicht läuft.
    var phase2 = RT.state.currentPhase() >= 2;

    // --- Karte 1: Belegung (ab Phase 2 auch Produktion) ---
    // Die Zahl ist der Ertrag EINES Zyklus, nicht je Sekunde: der Stapel unter
    // der Kachel zählt in Zyklen, und der Ernte-Knopf zahlt in Zyklen aus.
    // Eine Sekunden-Zahl wäre die einzige Größe im Modal, die auf einer anderen
    // Uhr läuft — dass ein Zyklus 8 s dauert, sagt schon die Zeile über der Karte.
    var prod = [{ res: 'watchtime', icon: '⏳',
                  value: F.num(Math.round(RT.state.watchtimePerSec(inst) *
                                          RT.state.WATCHTIME_CYCLE_SEC)) }];
    if (mult > 1) {
      prod.push({ res: 'watchtime', icon: '✨', value: F.pctMult(mult), label: 'aus HQ-Features' });
    }
    // Metadaten im selben Takt wie die Watchtime — beide Zahlen beziehen sich
    // auf denselben Zyklus, deshalb braucht die Zeile keine Zeitangabe.
    if (modCap > 0) {
      prod.push({ res: 'meta', icon: '🗃️',
                  value: F.num(Math.round(RT.state.metadataPerCycle(inst))) });
    }

    var statusOpts = {
      variant: 'live',
      icon:  '🖥️',
      title: 'Belegung',
      sub:   'Stufe ' + stufe,
      body:  farmCapBarHtml(users, code, cap, modCap),
      cost: false,
      gain: false
    };
    if (phase2) {
      var ready = amount > 0 || meta > 0;
      statusOpts.body += '<div class="rt-cap__stack" id="farm-stack-label">' +
                         farmStackLabel(inst) + '</div>';
      statusOpts.progress   = farmStackProgress(fs);
      statusOpts.progressId = 'farm-stack-fill';
      statusOpts.gainHead   = 'Produziert';
      statusOpts.gain       = prod;
      statusOpts.action =
        '<button class="rt-btn-tt' + (ready ? ' rt-btn-tt--collect' : '') + '" ' +
        'id="farm-harvest-btn" data-inst="' + iid + '"' + (ready ? '' : ' disabled') + '>' +
        farmHarvestLabel(amount, meta) + '</button>';
    }
    var statusHtml = RT.ledger.card(statusOpts);

    // --- Karte 2: Ausbau (erst ab Phase 2) ---
    // Dieselbe Karte wie ein Werbedeal oder eine Kampagne: links was passiert,
    // rechts Kosten über Ertrag. Die Höchststufe ist eine gesperrte Karte statt
    // einer grauen Textzeile — eine Karte, die etwas ankündigt, liest sich als
    // Ausblick, ein Nebensatz nicht.
    //
    // Vor Phase 2 fehlt der Abschnitt komplett. Der einzige Ausbau, den es dort
    // gäbe, ist der Sprung Küken→Huhn, und der IST der Investor-Deal — ihn als
    // gesperrte Karte anzukündigen würde die Überraschung vorwegnehmen.
    var upgradeHtml = '';
    if (!phase2) {
      upgradeHtml = '';
    } else if (!next) {
      upgradeHtml = RT.ledger.card({
        variant: 'locked compact',
        icon:  '🏆',
        title: 'Stufe ' + stufe,
        desc:  'Höchste Stufe erreicht — mehr Kapazität gibt es nur über weitere Serverfarmen.',
        cost: false, gain: false
      });
    } else {
      var cost    = RT.state.TIER_UPGRADE_COST[fs.tierId];
      var nextCap = next.users * RT.state.FARM_CAPACITY_ANIMALS;
      // Der Investor-Sprung (Küken→Huhn) kostet nichts — `need` bleibt weg,
      // damit eine leere Kasse die „kostenlos"-Kachel nicht blass färbt.
      var upCost  = [{ res: 'money', icon: '💰',
                       value: cost > 0 ? F.money(cost) : 'kostenlos',
                       need:  cost > 0 ? cost : undefined }];
      var upNeed  = RT.ledger.cover(upCost);
      // Kompakt und ohne Erklärtext: die Belegung ist der Grund, warum das
      // Modal offen ist, der Ausbau die Option daneben. Zwei gleich große
      // Karten hätten beides gleich wichtig aussehen lassen.
      upgradeHtml = RT.ledger.card({
        variant: 'compact',
        icon:  '⬆️',
        title: 'Stufe ' + (stufe + 1),
        chip:  'aktuell Stufe ' + stufe,
        body:  '<div class="rt-cap__step">' + F.num(cap) + ' <span>→</span> <b>' + F.num(nextCap) +
               '</b> Kapazität</div>',
        cost: upCost,
        // Nur die Kapazität. Mehr Watchtime ist keine eigene Wirkung des
        // Ausbaus, sondern die Folge daraus, dass mehr User Platz haben — sie
        // hier danebenzustellen hätte denselben Gewinn zweimal versprochen.
        //
        // Ohne Beschriftung: wovon die Rede ist, steht direkt daneben schon
        // zweimal (Balken-Kopf und die Zeile "16.000 → 80.000 Kapazität").
        gain: [{ res: 'server', icon: '🖥️', value: '+' + F.num(nextCap - cap) }],
        action: '<button class="rt-btn-tt rt-btn-tt--primary" id="farm-upgrade-btn" data-inst="' + iid +
                '"' + (upNeed.ok ? '' : ' disabled') + '>' +
                (upNeed.ok ? '⬆️ Auf Stufe ' + (stufe + 1) + ' ausbauen' : upNeed.label) +
                '</button>'
      });
    }

    var intro = phase2
      ? 'Hier leben deine User und produzieren <b>Watchtime</b> — 1 Watchtime je User alle ' +
        RT.state.WATCHTIME_CYCLE_SEC + ' s. Ist der Stapel voll, steht die Produktion still, ' +
        'bis du erntest.'
      : 'Hier leben deine User — und die Features, die du im HQ entwickelst, belegen denselben Platz.';

    return (
      '<div class="info-line">' + intro + '</div>' +
      statusHtml +
      (upgradeHtml ? '<div class="rt-led-sec">Ausbau</div>' + upgradeHtml : '') +
      '<div class="info-line info-small">Die Kapazität deiner Serverfarmen ist gleichzeitig deine ' +
        '<b>Serverkapazität</b> — sie begrenzt, was du im HQ entwickeln kannst.</div>'
    );
  }

  // Serverkosten-Aufschlüsselung. Hängt am Stufen-Knopf im Serverkapazitäts-
  // Panel und erklärt in einem Rutsch, was der Posten ist, wonach er sich
  // richtet und was als Nächstes kommt.
  //
  // ⚠️ Die nächste Grenze steht bewusst ganz unten und mit dem Faktor daneben.
  // Die Tarife sind FLACH, nicht gestaffelt — beim Überschreiten springt der
  // Preis für die gesamte Kapazität. Das ist verkraftbar (~1–3 % des
  // Einkommens), aber ohne Ansage wäre es ein unerklärter Kostenschub.
  // Eine Spalte im „Dein Tarif"-Block: Überschrift oben, Wert darunter.
  function srvNowCell(label, value) {
    return '<div><span class="rt-srv-now__lbl">' + label + '</span>'
         +      '<b class="rt-srv-now__val">' + value + '</b></div>';
  }
  function showServerUpkeepModal() {
    var F     = RT.ledger.fmt;
    var tiers = RT.state.SERVER_UPKEEP_TIERS;
    var cur   = RT.state.serverUpkeepTier();
    var next  = RT.state.serverUpkeepNextTier();
    var cap   = RT.state.serverCapacityTotal();
    var unit  = RT.state.serverUpkeepUnit();
    var cyc   = RT.state.serverUpkeepCycles();

    var rows = '';
    for (var i = 0; i < tiers.length; i++) {
      var t   = tiers[i];
      var isC = t.id === cur.id;
      var bis = (t.upTo === Infinity) ? 'darüber' : 'bis ' + F.num(t.upTo);
      rows += '<div class="rt-srv-row' + (isC ? ' is-current' : '') + '">'
            +   '<span class="rt-srv-row__name">' + t.name + '</span>'
            +   '<span class="rt-srv-row__cap">' + bis + '</span>'
            +   '<span class="rt-srv-row__rate">' + t.rate + ' €</span>'
            + '</div>';
    }

    // Was eine volle Runde über ALLE Farmen kostet — die Zahl, gegen die der
    // Spieler seine Einnahmen rechnet.
    var farms = RT.state.instancesByType('farm');
    var full  = 0;
    for (var f = 0; f < farms.length; f++) full += RT.state.serverUpkeepFullCost(farms[f]);

    var html =
      '<div class="info-line">Deine Serverfarmen brauchen <b>Strom, Wasser und Wartung</b>. '
    + 'Bezahlt wird je <b>' + cyc + ' Produktionszyklen</b> — was nicht produziert, kostet auch nichts.</div>'

    + '<div class="rt-led-sec">Dein Tarif</div>'
    + '<div class="rt-srv-now">'
    +   srvNowCell('Kapazität',                     F.num(cap))
    +   srvNowCell('Stufe',                         cur.name)
    +   srvNowCell('je ' + F.num(unit) + ' Kapazität', cur.rate + ' €')
    +   srvNowCell('alle Farmen zusammen',          F.money(Math.ceil(full)))
    + '</div>'

    + '<div class="rt-led-sec">Die fünf Stufen</div>'
    + '<div class="rt-srv-table">' + rows + '</div>'

    + '<div class="info-line info-small">Bleibt eine Farm unversorgt, läuft sie nach '
    +   cyc + ' Zyklen nur noch <b>halb so schnell</b> und nach ' + RT.state.serverUpkeepCrawlAt()
    +   ' Zyklen auf <b>Sparflamme</b> (20 %). Belegte Farmen ohne Versorgung drücken außerdem '
    +   'den Trend („Serverprobleme"). Leere Farmen dürfen dunkel bleiben.</div>'

    + (next
        ? '<div class="info-line info-small">Ab <b>' + F.num(cur.upTo) + '</b> Kapazität gilt <b>'
          + next.name + '</b> — ' + next.rate + ' € je ' + F.num(unit) + ' Kapazität, also das '
          + (Math.round(next.rate / cur.rate * 10) / 10).toString().replace('.', ',')
          + '-fache. Der Sprung gilt dann für deine gesamte Kapazität.</div>'
        : '<div class="info-line info-small">Höchste Stufe — teurer wird es nicht mehr.</div>')

    + (RT.state.nodeDone('en_effizient') || RT.state.nodeDone('en_erneuerbar')
        ? '<div class="info-line info-small">Aktiv: '
          + (RT.state.nodeDone('en_effizient')  ? '<b>Effizientere Farmen</b> (30 statt 25 Zyklen) ' : '')
          + (RT.state.nodeDone('en_erneuerbar') ? '<b>Erneuerbare Energien</b> (Tarif je 1.500 statt 1.000)' : '')
          + '</div>'
        : '');

    openModal(RT.assets.iconHtml('stromWasser') + ' Serverkosten', html, { type: 'serverUpkeep' });
  }

  // KI-Labor — gebaut wie die Werbeagentur: oben die laufende Umwandlung mit
  // Einsammel-Knopf, darunter die buchbaren Arten. Beide Gebäude sind
  // Konverter und sollen sich deshalb gleich anfühlen; der Unterschied ist
  // nur, was hinten herauskommt (Geld bzw. User-Modelle).
  function openKiLaborModal(inst) {
    openModal('🧠 KI-Labor', renderKiLaborBodyHtml(inst),
              { type: 'kilabor', instanceId: inst.instanceId });
  }
  function renderKiLaborBody(inst) {
    el.modalBody.innerHTML = renderKiLaborBodyHtml(inst);
    wireModalButtons();
  }
  // Warum eine Art gerade nicht buchbar ist — oder '' für „geht". Steht
  // einmal hier, weil die Prüfung an zwei Stellen gebraucht wird: beim Aufbau
  // der Karte und beim sekündlichen Nachziehen der Knöpfe (updateModalLive).
  //
  // ⚠️ „Kein Platz" hat zwei Gründe und braucht zwei Texte: entweder sind die
  // Server wirklich voll, oder es liegen fertige Modelle im Labor, die den
  // freien Platz rechnerisch schon belegen. Im zweiten Fall muss der Spieler
  // nur einsammeln — „bau mehr Farmen" wäre dort schlicht falsch.
  function convBlockedReason(labState, typeId) {
    if (labState.conv) return 'Es läuft schon eine Umwandlung';
    var cost = RT.state.convWatchtimePerCycle(typeId);
    if (cost <= 0) {
      return RT.state.modelsPendingTotal() > 0
        ? 'Erst die fertigen Modelle einsammeln'
        : 'Serverkapazität voll';
    }
    // Über cover() statt eines eigenen Vergleichs: dieselbe Beschriftung wie
    // an jeder anderen Kauffläche („Zu wenig ⏳"), und die Zuordnung
    // Ressource → Konto steht nur einmal im Spiel.
    return RT.ledger.cover([{ res: 'watchtime', need: cost }]).label;
  }

  function renderKiLaborBodyHtml(inst) {
    var s    = RT.state.current;
    var F    = RT.ledger.fmt;
    var st   = inst.state;
    var iid  = inst.instanceId;
    var maxC = RT.state.CONV_CYCLES_MAX;
    var ready = Math.floor(st.modelsReady || 0);

    // Der Kapazitäts-Balken als erste Zeile — derselbe wie im Farm-Modal, nur
    // über alle Farmen summiert. Er ist die Größe, an der die Mechanik jetzt
    // hängt: Modelle und User teilen sich denselben Platz, und der freie Rest
    // ist genau das, was eine Buchung noch unterbringen kann.
    //
    // ⚠️ Hier stand vorher ein Abdeckungs-Balken (Modelle gegen User). Der
    // hatte seine Berechtigung, solange die User-Zahl der Deckel war; seit der
    // Deckel die Kapazität ist, zeigte er die falsche Grenze — und mit der
    // flachen Clustering-Stufe bewegte er sich je Zyklus um Bruchteile eines
    // Prozents, stand also praktisch still.
    var models = Math.floor(s.models || 0);
    var users  = Math.floor(s.users || 0);
    var cov    = RT.state.modelCoverage();
    var html = '<div class="info-line">Das Labor macht aus <b>Watchtime</b> '
             + '<b>User-Modelle</b>. Ein Modell belegt <b>1 Platz</b> auf deinen Servern — '
             + 'wie ein User — und produziert dort <b>Metadaten</b>. Eine Umwandlung läuft '
             + '<b>' + maxC + ' Zyklen</b>; die Zahlen unten gelten <b>je Zyklus</b> und '
             + 'werden jedes Mal im Voraus abgebucht.</div>'
             + farmCapBarHtml(users, RT.state.programmCapacity(),
                              RT.state.serverCapacityTotal(), models)
             // Die Abdeckung erst zeigen, wenn es etwas abzudecken gibt — „0 %"
             // neben dem Hinweis, dass 100 % keine Grenze sind, erklärt nichts.
             + (models > 0
                 ? '<div class="info-line info-small">Das sind <b>'
                   + F.num(Math.round(cov * 100)) + ' %</b> deiner User — '
                   + 'ein zweites Modell desselben Users ist ein feineres, '
                   + 'die Marke von 100 % ist also keine Grenze.</div>'
                 : '');

    // Karte 1: laufende Umwandlung + Einsammeln. Nur wenn es etwas zu zeigen
    // gibt — eine leere „idle"-Karte über den Angeboten wäre nur Luft.
    if (st.conv || ready > 0) {
      var body    = '';
      // Kosten und Ertrag der laufenden Umwandlung — dieselben zwei Spalten
      // wie beim laufenden Deal in der Werbeagentur. Ohne sie war die Karte
      // die einzige im Modal ohne Zahlenspalte, und man konnte nicht sehen,
      // was der Zyklus, der da gerade läuft, eigentlich kostet und bringt.
      var runCost = false, runGain = false;
      if (st.conv) {
        var ct = RT.state.convTypeById(st.conv.typeId);
        body += '<div class="rt-cap__stack" id="conv-running-info">'
              + 'Zyklus ' + (st.conv.cyclesDone + 1) + ' / ' + maxC + ', noch '
              + Math.max(0, Math.ceil(ct.duration - st.conv.cycleTime)) + ' s</div>';
        // Aus dem, was beim Zyklus-Start abgebucht wurde (`chargedModels`),
        // nicht aus einer Neuberechnung: der freie Platz ändert sich während
        // des Zyklus, und die Karte zeigt den GEBUCHTEN Zyklus, nicht den
        // nächsten.
        var runModels = Math.floor(st.conv.chargedModels || 0);
        runCost = [{ res: 'watchtime', icon: '⏳',
                     value: F.num(Math.ceil(runModels * ct.wtPerModel)) },
                   { res: 'time', icon: '⏱', value: F.sec(ct.duration) }];
        runGain = [{ res: 'model', icon: '🧠', value: '+' + F.num(runModels) }];
      } else {
        body += '<div class="rt-cap__stack">Keine Umwandlung aktiv.</div>';
      }
      html += RT.ledger.card({
        variant: 'live',
        icon:  st.conv ? RT.state.convTypeById(st.conv.typeId).icon : '🧠',
        title: st.conv ? RT.state.convTypeById(st.conv.typeId).name : 'Fertige Modelle',
        sub:   ready > 0 ? F.num(ready) + ' Modelle warten' : '—',
        body:  body,
        progress:   st.conv ? Math.min(1, st.conv.cycleTime / RT.state.convTypeById(st.conv.typeId).duration) : 0,
        progressId: 'conv-modal-fill',
        cost: runCost,
        gain: runGain,
        action: '<button class="rt-btn-tt' + (ready > 0 ? ' rt-btn-tt--collect' : '') + '" ' +
                'id="conv-collect-btn" data-inst="' + iid + '"' + (ready > 0 ? '' : ' disabled') + '>' +
                '🧠 Einsammeln (' + F.num(ready) + ')</button>'
      });
    }

    // Karte je freigeschalteter Umwandlungsart.
    var types = RT.state.convTypesUnlocked();
    if (!types.length) {
      return html + '<div class="info-line info-small">Noch keine Umwandlung freigeschaltet — '
                  + 'schau in den <b>KI</b>-Reiter im HQ.</div>';
    }
    for (var i = 0; i < types.length; i++) {
      var t       = types[i];
      var perCyc  = RT.state.convModelsPerCycle(t.id);
      var cost    = RT.state.convWatchtimePerCycle(t.id);
      var blocked = convBlockedReason(st, t.id);
      // Die Stückzahl ist bei beiden Arten die Leitzahl — sie ist das, was der
      // Spieler gleich im Kapazitäts-Balken oben wiederfindet. Der Prozentsatz
      // kommt nur bei der mitwachsenden Art dazu, weil er dort die Größe ist,
      // die unabhängig von der Plattformgröße gleich bleibt. Bei der flachen
      // Art wäre er eine Zahl, die mit jedem User kleiner wird.
      //
      // ⚠️ Er steht in Klammern HINTER der Stückzahl, nicht in einer eigenen
      // Kachel. Zwei Kacheln mit demselben Icon lasen sich wie zwei Posten, die
      // sich addieren — es ist aber zweimal dieselbe Zahl. Dieselbe Bauart wie
      // die Anteils-Stufe in der Werbeagentur (adLedgerItems).
      var modelVal = '+' + F.num(perCyc);
      if (t.coverage) {
        modelVal += ' (' + fmtPctPlain(t.coverage * RT.state.modelYieldMult()) + ')';
      }
      var gain = [{ res: 'model', icon: '🧠', value: modelVal }];
      // ⚠️ Keine Beschriftungen an den Zellen — hier stand vorher je ein
      // `qualifier: 'je Zyklus'`, ein Feld, das RT.ledger.card() gar nicht
      // kennt und kommentarlos schluckt. Die Regel „die Zahlen gelten je
      // Zyklus" steht jetzt einmal oben im Modal, genau wie in der
      // Werbeagentur.
      //
      // `need` nur, solange keine Umwandlung läuft: sonst wäre die Kachel
      // blass, obwohl die Watchtime des laufenden Zyklus längst bezahlt ist
      // und der Knopf ohnehin „Es läuft schon eine Umwandlung" sagt.
      var convCost = [{ res: 'watchtime', icon: '⏳', value: F.num(cost),
                        need: st.conv ? undefined : cost },
                      { res: 'time', icon: '⏱', value: F.sec(t.duration) }];
      RT.ledger.cover(convCost);
      html += RT.ledger.card({
        variant: 'shop' + (st.lastConv === t.id ? ' last' : ''),
        icon:  t.icon,
        title: t.name,
        // Die Gesamtbilanz gehört in die Unterzeile, nicht in ein `note`-Feld —
        // das kennt RT.ledger.card() nicht und schluckt es kommentarlos.
        sub:   t.desc + ' · ' + maxC + ' Zyklen ≈ ' + F.num(perCyc * maxC) + ' Modelle',
        cost:  convCost,
        gain:  gain,
        // Der Knopf gehört unter den Text, nicht unter die Zahlenspalte: das
        // Labor ist wie die Werbeagentur ein Modal, das EIN Angebot füllt und
        // die Frage „was bringt mir das?" stellt — kein Shop-Listeneintrag,
        // bei dem nur „Preis? Ja/Nein" zu klären ist.
        action: '<button class="rt-btn-tt rt-btn-tt--primary" data-conv="' + t.id + '" ' +
                'data-inst="' + iid + '"' + (blocked ? ' disabled title="' + blocked + '"' : '') +
                '>' + (blocked || 'Umwandlung starten') + '</button>'
      });
    }

    html += '<div class="info-line info-small">Modelle belegen Serverkapazität — '
          + 'denselben Platz wie deine User. Ist sie voll, wächst beides nicht '
          + 'mehr, bis du ausgebaut hast.</div>';
    return html;
  }

  function openWerbeModal(inst) {
    openModal('Werbeagentur', renderWerbeBodyHtml(inst), { type: 'werbe', instanceId: inst.instanceId });
  }
  function renderWerbeBody(inst) {
    if (sliderDragging) return;
    el.modalBody.innerHTML = renderWerbeBodyHtml(inst);
    wireModalButtons();
  }
  // Was gerade für die NÄCHSTE Buchung eingestellt ist. Erst die Wahl des
  // Spielers in dieser Modal-Sitzung, sonst der letzte Deal, sonst die
  // Vorgabe. Beides läuft am Ende durch die Clamps aus state.js, damit hier
  // nichts angeboten werden kann, was bookAdDeal ablehnen würde.
  function werbeSelection(ws) {
    var vol = (werbeVolume !== null) ? werbeVolume
            : ((ws.lastDeal && ws.lastDeal.volume) || 1);
    var targ = (werbeTargeting !== null) ? werbeTargeting
             : !!(ws.lastDeal && ws.lastDeal.targeting);
    // Dauerbetrieb ist an, solange nichts anderes gewählt wurde — dieselbe
    // Vorgabe wie in bookAdDeal. Ein alter lastDeal ohne das Feld zählt
    // ebenfalls als an, sonst fiele der Spieler nach einem Update stumm auf
    // das alte Verhalten zurück.
    var renew = (werbeRenew !== null) ? werbeRenew
              : !(ws.lastDeal && ws.lastDeal.autoRenew === false);
    return {
      volume:    RT.state.clampAdVolume(vol),
      targeting: targ && RT.state.adTargetingUnlocked(),
      autoRenew: renew
    };
  }

  function renderWerbeBodyHtml(inst) {
    var ws     = inst.state;
    var iid    = inst.instanceId;
    var mReady = Math.floor(ws.moneyReady || 0);
    var maxC   = RT.state.AD_CYCLES_MAX;
    // Intensität für die Buchungs-Vorschau: was der Spieler zuletzt am Slider
    // eingestellt hat, sonst die des letzten Deals, sonst 25 %.
    var pct = werbeIntensity !== null
      ? werbeIntensity
      : Math.round(((ws.lastDeal && ws.lastDeal.intensity) || 0.25) * 100);
    var sel = werbeSelection(ws);

    // --- Laufender Deal ---
    // Dieselbe Ledger-Karte wie ein buchbares Angebot, nur mit den tatsächlich
    // gebuchten Werten und einem Fortschrittsbalken. Der Spieler vergleicht
    // dadurch Läuft-gerade und Könnte-ich-buchen in derselben Darstellung.
    var runningHtml = '';
    if (ws.deal) {
      var t   = RT.state.adTypeById(ws.deal.typeId);
      var rem = Math.max(0, Math.ceil(t.duration - ws.deal.cycleTime));
      var li  = adLedgerItems(t.id, ws.deal.intensity, false, ws.deal.volume,
                              ws.deal.targeting, ws.deal.grossWt);
      // Der Chip trägt alle drei Einstellungen des laufenden Deals — sonst
      // sähen ein fester und ein anteiliger Deal in der Kopfzeile gleich aus.
      var runChip = Math.round(ws.deal.intensity * 100) + ' %'
                  + (!RT.state.adIsBaseVolume(RT.state.clampAdVolume(ws.deal.volume))
                      ? ' · ' + RT.state.adStepLabel(ws.deal.typeId, ws.deal.volume) : '')
                  + (ws.deal.targeting ? ' · 🎯' : '')
                  + (ws.deal.autoRenew ? ' · ↻' : '');
      runningHtml = RT.ledger.card({
        variant: 'live',
        icon:  t.icon,
        title: t.name,
        chip:  runChip,
        sub:   'Zyklus ' + (ws.deal.cyclesDone + 1) + ' / ' + maxC + ', noch ' + rem + ' s'
                 + (ws.deal.autoRenew ? ' · läuft danach weiter' : ''),
        subId: 'werbe-running-info',
        progress:   ws.deal.cycleTime / t.duration,
        progressId: 'werbe-modal-fill',
        cost: li.cost,
        gain: li.gain,
        desc: 'Bricht der Deal ab, verfällt die Watchtime des angefangenen Zyklus — ' +
              'der Trend-Malus bleibt trotzdem bestehen.',
        action: '<button class="rt-btn-tt rt-btn-tt--ghost" id="werbe-cancel-btn" ' +
                'data-inst="' + iid + '">✖ Deal abbrechen</button>'
      });
    } else {
      runningHtml = '<div class="info-line">Kein Deal aktiv — die Agentur kostet gerade keinen Trend.</div>';
    }

    // --- Buchbare Werbearten ---
    // Gesperrte Arten tauchen gar nicht erst auf; ein Hinweis unter der Liste
    // sagt, dass im HQ noch mehr zu holen ist.
    var unlocked = RT.state.adTypesUnlocked();
    var lastId   = ws.lastDeal ? ws.lastDeal.typeId : null;
    var cardsHtml = '';
    for (var i = 0; i < unlocked.length; i++) {
      var a = unlocked[i];
      var isLast = a.id === lastId;
      // Die Posten prüfen sich über adLedgerItems selbst — dort stehen sie
      // gegen die GEWÄHLTE Stufe, nicht gegen den Grundpreis der Werbeart (auf
      // einer Anteils-Stufe hat der mit dem, was der Zyklus kostet, nichts
      // mehr zu tun). Vorher wurde dieselbe Prüfung hier ein zweites Mal
      // gerechnet und landete nur in einem `title`, den auf dem Tablet
      // niemand sieht.
      var items  = adLedgerItems(a.id, pct / 100, true, sel.volume, sel.targeting);
      var adNeed = ws.deal ? { ok: true, label: '' } : RT.ledger.cover(items.cost);
      var label  = ws.deal ? 'Es läuft schon ein Deal'
                 : (adNeed.label || (isLast ? '▶ Erneut buchen' : '▶ Buchen'));
      cardsHtml += RT.ledger.card({
        variant: isLast ? 'last' : '',
        icon:  a.icon,
        title: a.name,
        chip:  isLast ? 'zuletzt' : '',
        desc:  a.desc || '',
        cost:  items.cost,
        gain:  items.gain,
        action: '<button class="rt-btn-tt rt-btn-tt--primary" data-ad="' + a.id +
                '" data-inst="' + iid + '"' +
                (ws.deal || !adNeed.ok ? ' disabled' : '') + '>' + label + '</button>'
      });
    }

    return (
      // Die Regel steht hier einmal für alle Karten, damit an den Zahlen selbst
      // keine Erklärungszeilen kleben müssen.
      '<div class="info-line">Ein Deal läuft <b>' + maxC + ' Zyklen</b> und ist dann vorbei. ' +
        'Die Zahlen unten gelten <b>je Zyklus</b> — Watchtime wird jedes Mal im Voraus ' +
        'abgebucht, geht sie aus, bricht der Deal ab. Nur der <b>Trend-Malus zählt einmal</b> ' +
        'für den ganzen Deal.</div>' +
      runningHtml +
      '<button class="modal-btn collect" id="werbe-collect-btn" data-inst="' + iid + '" ' + (mReady <= 0 ? 'disabled' : '') + '>' +
        '💰 Einsammeln (' + fmtMoney(mReady).replace(' €', '€') + ')' +
      '</button>' +
      '<div class="rt-led-sec">Neuen Deal buchen</div>' +
      werbeConfigHtml(iid, sel, pct) +
      // Zweispaltig, damit beim Ziehen am Slider alle freigeschalteten Arten
      // gleichzeitig im Blick bleiben — genau darum geht es beim Vergleichen.
      '<div class="rt-led-grid">' + cardsHtml + '</div>' +
      (unlocked.length < RT.state.AD_TYPES.length
        ? '<div class="info-line info-small">Weitere Werbearten schaltest du im HQ frei — Reiter „Werbung".</div>'
        : '') +
      '<div class="info-line">Verfügbare Watchtime: <span class="info-highlight" id="werbe-wt-val">' +
        fmtNum(RT.state.current.watchtime) + '</span></div>' +
      '<div class="info-line info-small">Der Trend-Malus lässt sich mit der Anziehungskraft im ' +
        '<b>Marketing-Center</b> gegenfinanzieren.</div>'
    );
  }

  // ── Die Deal-Regler nebeneinander ───────────────────────────────────────
  // Intensität · Volumen · Optionen sind Einstellungen an derselben Buchung
  // — untereinander gestapelt schoben sie die Werbekarten aus dem Bild, und
  // man musste scrollen, um zu sehen, was die eigene Einstellung an den
  // Zahlen ändert. Nebeneinander passen Regler und Karten gemeinsam auf den
  // Schirm.
  //
  // Personalisierung und Dauerbetrieb standen früher als zwei eigene Spalten
  // daneben — zusammen mit ihren Erklärtexten haben sie mehr Platz gefressen
  // als Intensität und Volumen zusammen. Sie stehen jetzt gestapelt in EINER
  // Spalte ("Optionen"), die Erklärung sitzt nicht mehr offen daneben,
  // sondern hinter einem kleinen "?" je Zeile (siehe werbeOptionRowHtml).
  //
  // Volumen taucht erst auf, wenn seine Node steht. Bis dahin bleibt nur
  // Intensität + Optionen übrig.
  function werbeConfigHtml(iid, sel, pct) {
    return ''
      + '<div class="rt-adcfg">'
      +   werbeIntensityHtml(iid, pct)
      +   werbeVolumeHtml(iid, sel)
      +   werbeOptionsHtml(iid, sel)
      + '</div>';
  }

  function werbeIntensityHtml(iid, pct) {
    return ''
      + '<div class="rt-adcfg__col">'
      + '  <div class="rt-adcfg__head" id="werbe-slider-label">Intensität: <b>' + pct + '%</b></div>'
      + '  <input type="range" id="werbe-slider" data-inst="' + iid + '" min="1" max="50" value="' + pct + '">'
      + '  <div class="slider-info"><span>1% schont</span><span>50% Ertrag</span></div>'
      + '  <div class="rt-adcfg__note">Der Preis pro Zyklus bleibt gleich — hohe Intensität holt '
      +      'mehr Geld aus derselben Watchtime, kostet aber überproportional Trend.</div>'
      + '</div>';
  }

  // ── Volumen: vier Knöpfe statt eines Reglers ───────────────────────────
  // Die Stufen sind durch die Nodes ohnehin diskret; ein Regler würde eine
  // Stufenlosigkeit vortäuschen, die es nicht gibt.
  //
  // Die Knöpfe tragen die STUFE (fest · fest ×4 · Anteil · Anteil ×3), nicht
  // den Prozentwert: die Reihe gilt für alle vier Werbekarten, und ein
  // Prozentwert wäre dort für drei von vier Arten falsch. Was die Stufe für
  // eine bestimmte Art bedeutet, steht in ihrer Karte — die Watchtime-Zeile
  // trägt den Anteil in Klammern dahinter.
  //
  // Die vier stehen als 2×2 statt als Viererreihe: in einem Drittel der
  // Modalbreite wären vier Knöpfe nebeneinander schmaler als ihre Beschriftung.
  //
  // Die Spalte erscheint erst, wenn die zweite Stufe ENTWICKELT ist — nicht
  // schon mit der Phase. Vorher gibt es nur die Voreinstellung „fest", und
  // ein Regler mit einer einzigen wählbaren Stellung ist kein Regler, sondern
  // eine Ankündigung, die dem Modal Platz wegnimmt. Sobald die Mechanik dem
  // Spieler gehört, bleiben die noch fehlenden Stufen sichtbar und tragen den
  // Namen ihrer Node — innerhalb einer Sache, die man hat, ist die gesperrte
  // Stufe ein Wegweiser statt eines Versprechens ins Blaue.
  function werbeVolumeHtml(iid, sel) {
    if (RT.state.adVolumeOpenCount() <= 1) return '';
    var steps = RT.state.AD_VOLUME_STEPS;
    var btns  = '';
    for (var i = 0; i < steps.length; i++) {
      var v    = steps[i].step;
      var open = RT.state.adVolumeUnlocked(v);
      var nDef = steps[i].unlockedBy && RT.techtree && RT.techtree.NODES
        ? RT.techtree.NODES[steps[i].unlockedBy] : null;
      btns += '<button type="button" class="rt-vol__btn'
            + (sel.volume === v ? ' is-active' : '')
            + (open ? '' : ' is-locked')
            + '" data-vol="' + v + '" data-inst="' + iid + '"'
            + (open ? '' : ' disabled title="' + (nDef ? nDef.name : 'Noch nicht freigeschaltet') + '"')
            + '>' + steps[i].label + '</button>';
    }
    return ''
      + '<div class="rt-adcfg__col">'
      + '  <div class="rt-adcfg__head">Volumen</div>'
      + '  <div class="rt-vol__steps">' + btns + '</div>'
      + '  <div class="rt-adcfg__note">Anteil deines Watchtime-Lagers je Zyklus. '
      +      'Eine höhere Stufe verdient nicht besser — sie holt dasselbe nur '
      +      '<b>schneller</b> aus dem Lager und kostet dafür linear mehr Trend.</div>'
      + '</div>';
  }

  // ── Optionen: Personalisierung + Dauerbetrieb, gestapelt in einer Spalte ──
  // Beide waren früher eigene Spalten mit offen sichtbarem Erklärtext darunter
  // — zusammen breiter als Intensität und Volumen. Untereinander in EINEM
  // Feld sparen sie die Hälfte der Breite; die Erklärung steht nicht mehr
  // ständig da, sondern hinter einem kleinen "?" je Zeile (werbeOptionRowHtml),
  // das die Übersicht nicht mehr vollstopft.
  //
  // Personalisierung erscheint erst, wenn Retargeting ENTWICKELT ist — vorher
  // hätte der Schalter nur eine erreichbare Stellung, und ein Schalter, den
  // man nicht umlegen kann, ist ein Schild (dieselbe Regel wie beim Volumen).
  // Dauerbetrieb steht dagegen IMMER da, ab der ersten Werbeagentur in Phase 2
  // — er hängt an keiner Node.
  function werbeOptionsHtml(iid, sel) {
    var rows = '';
    if (RT.state.adTargetingUnlocked()) {
      rows += werbeOptionRowHtml({
        iid: iid, cls: '', inputId: 'werbe-targeting', tipId: 'werbe-tip-targeting',
        checked: sel.targeting, label: '🎯 Personalisiert',
        info: 'Kostet Metadaten je Zyklus, bringt das '
            + String(RT.state.TARGETING_REVENUE_MULT).replace('.', ',')
            + '-fache Geld — und <b>keinen zusätzlichen Trend</b>. '
            + 'Das einzige Werkzeug, das den Kurs je Trend-Punkt hebt.'
      });
    }
    // Der Text nennt beide Seiten des Dauerbetriebs. Dass der Trend-Malus
    // durchgehend anliegt, ist keine Nebenwirkung, sondern der Preis des
    // Schalters — versteckt er sich hinter dem "?", sieht der Spieler dort
    // wenigstens einmal nach, statt sich später zu wundern, warum sein Trend
    // nicht mehr hochkommt.
    rows += werbeOptionRowHtml({
      iid: iid, cls: ' rt-targ--renew', inputId: 'werbe-renew', tipId: 'werbe-tip-renew',
      checked: sel.autoRenew, label: '↻ Dauerbetrieb',
      info: 'Der Deal beginnt nach dem letzten Zyklus wieder von vorn, bis die '
          + 'Watchtime nicht mehr reicht. Dafür liegt der <b>Trend-Malus '
          + 'durchgehend an</b> — er erholt sich nicht mehr zwischen zwei Deals.'
    });
    return ''
      + '<div class="rt-adcfg__col">'
      + '  <div class="rt-adcfg__head">Optionen</div>'
      + '  <div class="rt-targ-stack">' + rows + '</div>'
      + '</div>';
  }

  // Eine Zeile: Schalter + "?"-Knopf daneben, Erklärung darunter (zu bis sie
  // aufgeklappt wird). Der "?"-Knopf sitzt bewusst AUSSERHALB des <label> —
  // läge er darin, würde ein Klick darauf die Checkbox gleich mit umlegen.
  function werbeOptionRowHtml(o) {
    return ''
      + '<div class="rt-targ-row">'
      + '  <label class="rt-targ' + o.cls + '">'
      + '    <input type="checkbox" id="' + o.inputId + '" data-inst="' + o.iid + '"'
      +       (o.checked ? ' checked' : '') + '>'
      + '    <span class="rt-targ__title">' + o.label + '</span>'
      + '  </label>'
      + '  <button type="button" class="rt-targ__help" data-tip="' + o.tipId
      +       '" aria-label="Info">?</button>'
      + '  <div class="rt-adcfg__note rt-adcfg__note--tip" id="' + o.tipId + '">'
      +      o.info + '</div>'
      + '</div>';
  }

  // Kosten/Ertrag einer Werbeart bei gegebener Intensität.
  //
  // Bewusst ohne Erklärungszusätze an den Zahlen: dass alles je Zyklus zählt
  // und nur der Trend-Malus einmal für den ganzen Deal gilt, sagt der
  // Modal-Kopf einmal für alle Karten (siehe bookAdDeal in js/loop.js).
  //
  // `live` = true nur für die Karte des buchbaren Angebots: sie bekommt die
  // data-led-val-Marker, über die der Slider ihre Werte patcht. Die Karte des
  // laufenden Deals bleibt unmarkiert — ihre Intensität steht fest, der
  // Slider darf sie nicht mit verstellen.
  // `grossWt` nur für einen LAUFENDEN Deal: dessen Zyklus ist schon bezahlt,
  // und auf einer Anteils-Stufe wäre eine Live-Rechnung kleiner als das, was
  // gleich tatsächlich ausgezahlt wird (das Lager ist inzwischen um genau
  // diesen Posten geschrumpft). Für Angebote bleibt der Parameter leer.
  function adLedgerItems(typeId, intensity, live, volume, targeting, grossWt) {
    var a = RT.state.adTypeById(typeId);
    if (!a) return { cost: [], gain: [] };
    var F = RT.ledger.fmt;
    // Keine Beschriftungen: die Icons sind dieselben wie in der Ressourcen-
    // Bar oben, das reicht zum Wiedererkennen. Beim Trend steht ein % dahinter
    // — er ist eine Wachstumsrate, keine Stückzahl, und das soll man sehen,
    // ohne es zu wissen.
    //
    // Die Watchtime-Zeile kommt aus adWatchtimePerCycle statt aus a.watchtime:
    // seit Volumen und Anzeigen-Optimierung ist der Grundpreis der Werbeart
    // nicht mehr das, was der Zyklus tatsächlich kostet.
    //
    // Auf einer Anteils-Stufe steht der Prozentwert dahinter. Er ist hier die
    // eigentliche Information — die absolute Zahl ändert sich mit dem Lager,
    // der Anteil ist das, was der Spieler eingestellt hat.
    var hasGross = (typeof grossWt === 'number' && !isNaN(grossWt));
    var wtLabel = F.num(hasGross
      ? Math.ceil(grossWt * RT.state.adWatchtimeMult())
      : RT.state.adWatchtimePerCycle(typeId, volume));
    if (RT.state.adStep(RT.state.clampAdVolume(volume)).pct) {
      wtLabel += ' (' + RT.state.adStepLabel(typeId, volume) + ')';
    }
    // `need` nur für ANGEBOTE (`live`): beim laufenden Deal ist der Zyklus
    // längst bezahlt, dort wäre eine blasse Kachel schlicht falsch.
    var cost = [
      { res: 'watchtime', icon: '⏳', value: wtLabel,
        need: live ? RT.state.adWatchtimePerCycle(typeId, volume) : undefined }
    ];
    // Die Metadaten-Zeile taucht nur bei personalisierten Deals auf. Weil sie
    // dadurch erscheint und verschwindet, patcht der Intensitäts-Slider sie
    // nicht — das Umschalten baut die Karten ohnehin neu.
    var meta = RT.state.adMetadataPerCycle(typeId, volume, targeting);
    if (meta > 0) {
      cost.push({ res: 'meta', icon: '🗃️', value: F.num(meta),
                  need: live ? meta : undefined });
    }
    cost.push({ res: 'time', icon: '⏱', value: F.sec(a.duration) });
    cost.push({ res: 'trend', icon: '⭐',
                value: F.trend(-RT.state.adTrendMalus(typeId, intensity, volume)) + ' %',
                id: live ? 'ad-' + a.id + '-trend' : '' });
    return {
      cost: cost,
      gain: [
        { res: 'money', icon: '💰',
          value: F.money(Math.round(
            RT.state.adMoneyPerCycle(typeId, intensity, volume, targeting,
                                     hasGross ? grossWt : undefined))),
          id: live ? 'ad-' + a.id + '-money' : '' }
      ]
    };
  }

  // Schreibt alle Ledger-Zellen mit dieser Marke neu.
  function setLedgerVal(id, text) {
    var cells = document.querySelectorAll('[data-led-val="' + id + '"]');
    for (var i = 0; i < cells.length; i++) cells[i].textContent = text;
  }

  function openMarketingModal(inst) {
    openModal('Marketing-Center', renderMarketingBodyHtml(inst), { type: 'marketing', instanceId: inst.instanceId });
  }
  function renderMarketingBody(inst) {
    // Gleiche Regel wie in der Werbeagentur: während am Regler der
    // Creator-Beteiligung gezogen wird, darf die Karte nicht neu gebaut
    // werden — sonst verliert der Griff den Finger.
    if (sliderDragging) return;
    el.modalBody.innerHTML = renderMarketingBodyHtml(inst);
    wireModalButtons();
  }

  // --- Regler der Creator-Beteiligung -----------------------------------
  // Der Slider läuft über STUFEN (1…5), nicht über Trend-Werte: am Regler
  // steht „wie hoch beteilige ich", nicht eine Zahl, die man erst umrechnen
  // muss. Die Trend-Zahl steht weiterhin auf der Ertrags-Kachel der Karte,
  // wie bei jeder anderen Kampagne auch.
  var CREATOR_STEP_LABELS = ['sehr niedrig', 'niedrig', 'mittel', 'hoch', 'sehr hoch'];
  function creatorStepLabel(campaignId, step) {
    var n = RT.state.campaignTrendSteps(campaignId);
    // Fällt die Stufenzahl je von 5 ab, greift die Beschriftung nach der
    // relativen Lage statt ins Leere — ein Regler ohne Text wäre schlimmer
    // als eine leicht andere Wortwahl.
    if (n === CREATOR_STEP_LABELS.length) return CREATOR_STEP_LABELS[step - 1];
    var i = Math.round((step - 1) / Math.max(1, n - 1) * (CREATOR_STEP_LABELS.length - 1));
    return CREATOR_STEP_LABELS[Math.max(0, Math.min(CREATOR_STEP_LABELS.length - 1, i))];
  }
  function campaignStep(c, mkS) {
    if (creatorStep !== null) return creatorStep;
    var last = mkS && mkS.lastTrend;
    // Ohne vorherige Buchung startet der Regler auf der höchsten Stufe: dort
    // ist der Kurs am besten, und wer weniger ausgeben will, zieht ihn herunter.
    if (typeof last !== 'number') return RT.state.campaignTrendSteps(c.id);
    return RT.state.campaignStepOfTrend(c.id, last);
  }
  // Reglerwert einer Karte für den Start-Knopf. Ohne Slider (jede andere
  // Kampagne) undefined — startCampaign nimmt dann den festen Wert.
  function campaignSliderTrend(campaignId) {
    var sl = document.getElementById('mk-trend-slider');
    if (!sl || sl.getAttribute('data-c') !== campaignId) return undefined;
    return RT.state.campaignTrendAtStep(campaignId, parseInt(sl.value, 10));
  }
  // Nur die Zellen patchen, die vom Regler abhängen. Der Rest der Karte ist
  // reglerunabhängig.
  function updateCampaignSliderCells(campaignId, step) {
    var F     = RT.ledger.fmt;
    var trend = RT.state.campaignTrendAtStep(campaignId, step);
    var gross = RT.state.campaignCostGross(campaignId, trend);
    var net   = RT.state.campaignCost(campaignId, trend);
    var lbl   = document.getElementById('mk-trend-slider-label');
    if (lbl) {
      lbl.innerHTML = 'Beteiligung: <b>' + escapeHTML(creatorStepLabel(campaignId, step)) + '</b>';
    }
    setLedgerVal('mk-' + campaignId + '-cost',  F.money(net));
    setLedgerVal('mk-' + campaignId + '-cut',   '−' + F.money(gross - net));
    setLedgerVal('mk-' + campaignId + '-trend', F.trend(trend) + ' %');

    // Deckung am Regler mitziehen. Die Regler-Kampagne (Creator-Beteiligung)
    // kostet ausschließlich Geld — deshalb reicht hier der direkte Vergleich
    // statt eines cover()-Laufs über eine Kostenspalte, die es im DOM gar
    // nicht mehr als Array gibt.
    var poor = RT.state.current.money < net;
    var cell = document.querySelector('[data-led-val="mk-' + campaignId + '-cost"]');
    var tile = cell && cell.closest ? cell.closest('.rt-led__item') : null;
    if (tile) tile.classList.toggle('rt-led__item--short', poor);
    var btn = document.querySelector('.mk-start-btn[data-c="' + campaignId + '"]');
    if (btn && !btn.hasAttribute('data-locked')) {
      btn.disabled = poor;
      // Der Knopf TRÄGT den Grund — ohne das Nachziehen stünde beim Ziehen auf
      // eine teurere Stufe weiter „▶ Starten" auf einem gesperrten Knopf.
      btn.textContent = poor ? 'Zu wenig 💰' : '▶ Starten';
    }
  }
  // Beschriftung der laufenden Kampagne. Bei einer Regler-Kampagne gehört die
  // gebuchte Stufe dazu — sonst steht dort dieselbe Zeile, egal ob „sehr
  // niedrig" oder „sehr hoch" bezahlt wurde. Genannt wird die Stufe und nicht
  // der Trend-Wert, damit im ganzen Modal dieselbe Sprache steht.
  function campaignRunLabel(c, active) {
    if (!c) return '';
    if (!c.trendMin || typeof active.trend !== 'number') return c.name;
    return c.name + ' ('
         + escapeHTML(creatorStepLabel(c.id, RT.state.campaignStepOfTrend(c.id, active.trend)))
         + ')';
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
        '<div class="info-line" id="mk-running-info">' + camp.icon + ' ' +
          campaignRunLabel(camp, mkS.active) + ' läuft — noch ' + remaining + 's</div>' +
        '<div class="progress"><div class="progress-fill" id="mk-modal-fill" style="width:' + pct + '%"></div></div>';
    }

    // Eine Ledger-Karte pro Kampagne — dieselbe Kosten/Ertrag-Aufteilung wie
    // in Werbeagentur und Techtree. Reichweite zahlt in User aus,
    // Anziehungskraft in Trend.
    //
    // Gesperrte Kampagnen bleiben stehen und nennen die Node, die sie öffnet.
    // Die Werbeagentur blendet gesperrte Werbearten aus — hier wäre die
    // Anziehungskraft-Spalte zu Beginn von Phase 2 dann aber komplett leer,
    // und die gesperrte Karte ist gleichzeitig der Wegweiser ins HQ.
    // Kampagnenplätze gelten für die ganze Plattform, nicht je Gebäude —
    // deshalb einmal hier oben ausgerechnet und nicht in jeder Karte neu.
    var prTotal = RT.state.prSlotsTotal();
    var prUsed  = RT.state.prSlotsUsed().length;
    var prFree  = prUsed < prTotal;

    function campCard(c) {
      var unlocked = RT.state.campaignUnlocked(c.id);
      // Über campaignMetadata(): der Preis der Zielgruppen-Offensive ist ein
      // Betrag je User und wächst mit der Plattform mit.
      var metaCost = RT.state.campaignMetadata(c.id);
      var isTrend  = c.kind === 'trend';
      // Regler-Kampagne: Trend und Preis kommen aus der Reglerstellung, alles
      // andere ist identisch zu einer festen Kampagne.
      var hasSlider = !!c.trendMin;
      var step      = hasSlider ? campaignStep(c, mkS) : 0;
      var trendVal  = hasSlider ? RT.state.campaignTrendAtStep(c.id, step) : c.trend;
      // ⚠️ Über campaignCost(), nicht c.cost: sonst prüft der Knopf gegen einen
      // anderen Preis, als auf der Karte steht.
      var gross     = RT.state.campaignCostGross(c.id, trendVal);
      var money     = RT.state.campaignCost(c.id, trendVal);
      var F = RT.ledger.fmt;
      // Prozentuale Kampagnen zeigen die Stückzahl, die JETZT herauskäme, mit
      // dem Prozentsatz als Beschriftung. Nur der Prozentsatz wäre nicht mit
      // den absoluten Kampagnen daneben vergleichbar; nur die Stückzahl würde
      // verschweigen, dass sie mitwächst.
      var gain;
      if (isTrend) {
        gain = [{ res: 'trend', icon: '⭐', value: F.trend(trendVal) + ' %',
                  id: hasSlider ? 'mk-' + c.id + '-trend' : undefined }];
      } else if (c.usersPct) {
        gain = [{ res: 'users', icon: '👥', value: '+' + F.num(RT.state.campaignUsers(c.id)),
                  label: Math.round(c.usersPct * 100) + ' % deiner User' }];
      } else {
        gain = [{ res: 'users', icon: '👥', value: '+' + F.num(c.users) }];
      }

      var cost = [{ res: 'money', icon: '💰', value: F.money(money),
                    need: money,
                    id: hasSlider ? 'mk-' + c.id + '-cost' : undefined }];
      // Die Marktplatz-Provision trägt als einzige Kachel ihr eigenes Icon
      // statt einer Beschriftung — sie ist ein Abzug auf die Zeile darüber, und
      // zwei 💰-Kacheln untereinander läsen sich sonst als zwei Posten, die man
      // addieren muss.
      if (hasSlider && gross > money) {
        cost.push({ res: 'money', icon: '🛍️', value: '−' + F.money(gross - money),
                    id: 'mk-' + c.id + '-cut' });
      }
      // Bei einem Preis JE USER dazuschreiben, woher die Zahl kommt — sonst
      // sieht der Spieler sie nur wachsen und hält es für einen Fehler.
      if (metaCost > 0) {
        cost.push({ res: 'meta', icon: '🗃️', value: F.num(metaCost),
                    need: metaCost,
                    label: c.metadataPerUser ? c.metadataPerUser + ' je User' : '' });
      }
      cost.push({ res: 'time', icon: '⏱', value: F.sec(c.duration) });

      // ⚠️ Nicht prüfen, wenn die Karte gesperrt ist oder schon eine Kampagne
      // läuft: dort ist der Grund kein Konto, und eine blasse Kachel neben
      // „🔒 … erforschen" wäre Rauschen.
      var mkNeed = (unlocked && !mkS.active) ? RT.ledger.cover(cost)
                                             : { ok: true, label: '' };
      var canStart = unlocked && !mkS.active && mkNeed.ok && (!isTrend || prFree);

      var action;
      if (unlocked && isTrend && !prFree && !mkS.active) {
        // Der Grund gehört auf den Knopf. Ein bloß graues „▶ Starten" liest
        // sich wie „zu teuer" — und der Spieler würde Geld sammeln für etwas,
        // das an einer Stückzahl hängt.
        // data-locked: der Regler-Handler zieht den Knopf nur nach, wenn der
        // Grund wirklich das Geld ist — sonst machte er aus „Alle Plätze
        // belegt" beim ersten Ziehen einen aktiven Start-Knopf.
        action = '<button class="rt-btn-tt" data-locked disabled>⏳ Alle Plätze belegt</button>';
      } else if (unlocked) {
        action = '<button class="rt-btn-tt rt-btn-tt--primary mk-start-btn" data-c="' + c.id +
                 '" data-inst="' + iid + '" ' +
                 (mkS.active ? 'data-locked ' : '') +
                 (canStart ? '' : 'disabled') + '>' +
                 (mkNeed.label || '▶ Starten') + '</button>';
      } else {
        var node = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[c.unlockedBy] : null;
        action = '<button class="rt-btn-tt" data-locked disabled>🔒 ' +
                 escapeHTML((node ? node.name : c.unlockedBy) + ' erforschen') + '</button>';
      }

      // Der Regler sitzt IM Körper der Karte, nicht darüber: er gehört zu
      // dieser einen Kampagne, und die Kosten-/Trend-Kacheln direkt darunter
      // sind seine Anzeige. Gesperrt oder während einer laufenden Kampagne
      // gibt es ihn nicht — er könnte dort nichts bewirken.
      // ⚠️ Die .rt-adcfg-Hülle ist nicht dekorativ: die Regler-Optik in
      // css/game.css hängt an ihr (`.rt-adcfg input[type=range]`). Ohne sie
      // steht dort ein ungestylter Standard-Slider.
      // ⚠️ `step="1"` und die ganzzahlige Skala sind das, was den Regler
      // einrasten lässt — es gibt keine Zwischenwerte, weder optisch noch im
      // gebuchten Trend.
      var body = '';
      if (hasSlider && unlocked && !mkS.active) {
        var steps = RT.state.campaignTrendSteps(c.id);
        body = '<div class="rt-adcfg">'
             + '<div class="rt-adcfg__col">'
             + '  <div class="rt-adcfg__head" id="mk-trend-slider-label">Beteiligung: <b>'
             +      escapeHTML(creatorStepLabel(c.id, step)) + '</b></div>'
             + '  <input type="range" id="mk-trend-slider" data-c="' + c.id + '" '
             +      'min="1" max="' + steps + '" step="1" value="' + step + '">'
             + '  <div class="slider-info"><span>' + escapeHTML(creatorStepLabel(c.id, 1))
             +      '</span><span>' + escapeHTML(creatorStepLabel(c.id, steps)) + '</span></div>'
             + '</div>'
             + '</div>';
      }

      return RT.ledger.card({
        variant: (isTrend ? 'pr ' : '') + (unlocked ? '' : 'locked'),
        icon:  c.icon,
        title: c.name,
        desc:  c.desc || '',
        body: body,
        cost: cost,
        gain: gain,
        action: action
      });
    }

    var reachHtml = '', prHtml = '';
    var reach = RT.state.campaignsOfKind('users');
    var prs   = RT.state.campaignsOfKind('trend');
    for (var i = 0; i < reach.length; i++) reachHtml += campCard(reach[i]);
    for (var j = 0; j < prs.length;   j++) prHtml    += campCard(prs[j]);

    return (
      '<div class="info-line">Immer nur <b>eine</b> Kampagne gleichzeitig — Reichweite oder Anziehungskraft.</div>' +
      runningHtml +
      '<button class="modal-btn collect" id="mk-collect-btn" data-inst="' + iid + '" ' + (mkS.ready <= 0 ? 'disabled' : '') + '>' +
        '👥 User einsammeln (' + fmtNum(mkS.ready) + ')' +
      '</button>' +
      // Die beiden Sorten stehen nebeneinander statt untereinander: links, was
      // absolute User bringt, rechts, was prozentual auf den Trend zahlt. Sie
      // teilen sich denselben Slot — das ist eine Entscheidung zwischen zwei
      // Spalten, keine Liste zum Durchscrollen.
      '<div class="rt-led-grid rt-led-grid--split">' +
        '<div class="rt-led-grid__col">' +
          '<div class="rt-led-sec">📣 Reichweite</div>' +
          // Was vorher als Zusatz an jeder Zahl klebte, steht jetzt einmal hier:
          // Kosten sofort, Dauer = Laufzeit, User warten danach aufs Einsammeln.
          '<div class="info-line info-small">Die Kosten fallen <b>sofort</b> an, die Zeit ist die ' +
            '<b>Laufzeit</b> — danach warten die User auf den Sammel-Button oben. ' +
            (RT.state.currentPhase() >= 3
              ? 'Alle drei liefern <b>feste Zahlen</b> und werden mit deiner Plattform ' +
                'immer unbedeutender. Was jetzt noch trägt, steht rechts.'
              : 'Feste Zahlen: je größer deine Plattform wird, desto weniger fällt das ins Gewicht.') +
          '</div>' +
          reachHtml +
        '</div>' +
        '<div class="rt-led-grid__col">' +
          '<div class="rt-led-sec">🤝 Anziehungskraft' +
            (prTotal > 0
              ? '<span class="rt-led-sec__chip">' + prUsed + ' / ' + prTotal + ' Plätze</span>'
              : '') +
          '</div>' +
          '<div class="info-line info-small">Bringt keine User direkt, sondern <b>hebt den Trend</b> — ' +
            'und der wächst prozentual, skaliert also mit. Der Trend-Wert liegt über die ganze ' +
            'Laufzeit voll an und ist ' + RT.state.PR_DECAY_SEC + ' s nach dem Ende wieder weg. ' +
            'Das Gegenstück zu den Werbedeals, die den Trend laufend drücken.</div>' +
          // Die Platz-Regel steht hier und nicht erst auf dem gesperrten Knopf:
          // sie ist der Grund, warum ein zweites Marketing-Center für PR nichts
          // bringt, und das soll man VOR dem Kauf wissen.
          (prTotal > 0
            ? '<div class="info-line info-small">Die Plätze gelten für die <b>ganze Plattform</b>, ' +
              'nicht je Gebäude — mehr Marketing-Center bringen hier nichts. Jede ' +
              'Forschung dieser Kette öffnet einen Platz.</div>'
            : '') +
          prHtml +
          // Die Provision ist die einzige Stelle im Spiel, an der Trend
          // unmittelbar Geld wert ist — das gehört erklärt, sobald die Node steht.
          (RT.state.nodeDone('marketplace')
            ? '<div class="info-line info-small">🛍️ <b>Marktplatz:</b> aktuell kommen ' +
              '<b>' + Math.round(RT.state.creatorCut() * 100) + ' %</b> der Creator-Beteiligung ' +
              'als Provision zurück. Die Creator bekommen weiterhin den vollen Betrag — ' +
              'billiger wird es nur für dich, und nur solange der Trend hoch ist.</div>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  // inst = HQ oder Bürogebäude. Eine hier gestartete Node läuft bevorzugt in
  // genau diesem Gebäude, damit der Ring dort erscheint, wo geklickt wurde.
  function openHQModal(inst) {
    // Techtree-Modul übernimmt die Anzeige.
    modalContext = { type: 'hq', instanceId: inst ? inst.instanceId : null };
    if (RT.techtree && RT.techtree.open) {
      RT.techtree.open(inst ? inst.instanceId : null);
    }
  }

  // ---- Shop ----
  // Was ein Gebäude tut, steht sonst nirgends im Spiel — die Modale erklären
  // erst, wenn es schon steht. Ein Satz, ohne Zahlen: die Zahl ist der Preis
  // rechts daneben, und alles Weitere lernt man im Gebäude selbst.
  var SHOP_DESC = {
    farm:      'Beherbergt deine User und liefert die Server-Kapazität für neue Features.',
    werbe:     'Bucht Werbedeals — macht Watchtime zu Geld, drückt dafür den Trend.',
    marketing: 'Startet Kampagnen: Reichweite bringt User, Anziehungskraft hebt den Trend.',
    buero:     'Ein zusätzlicher Entwicklungs-Platz — eine Entwicklung mehr parallel zum HQ.',
    kilabor:   'Trainiert aus Watchtime User-Modelle. Die ziehen in deine Serverfarmen und produzieren dort Metadaten.',
    energie:   'Versorgt alle Serverfarmen ab Stufe 5 auf einen Klick mit Strom, Wasser und Wartung. Kleinere Farmen bleiben Handarbeit.'
  };

  // ⚠️ Bis zum 2026-08-09 stand hier `shopGain()` und jede Karte zeigte eine
  // eigene Ertrag-Spalte. Bei sieben, acht Gebäuden nebeneinander wurde die
  // Liste dadurch unübersichtlich — der Shop soll die Frage "was kostet es,
  // baue ich es" schnell beantworten, nicht "was bringt es" (das lernt man im
  // Gebäude selbst, siehe SHOP_DESC für den Ein-Satz-Vorgeschmack). Die
  // rechte Spalte ist seitdem ausschließlich Preis + Kaufen-Button.

  // Gebäude zeigen ihr Grid-Sprite, Hardware ihr Emoji. Beides landet in
  // derselben Icon-Kachel der Ledger-Karte.
  function shopIconHtml(typeId) {
    var t = RT.state.BUILDING_TYPES[typeId];
    if (t && t.sprite) return '<img src="' + t.sprite + '" alt="">';
    return t ? t.icon : '';
  }

  function openShopModal(preTile) {
    shopPreTile = preTile || null;
    var hint;
    if (shopPreTile) {
      hint = 'Für Feld <b>(' + shopPreTile.col + ', ' + shopPreTile.row + ')</b> — die Serverfarm braucht 2×2 Platz.';
    } else {
      hint = 'Gebäude wählen — danach das Feld anklicken (Serverfarm braucht 2×2).';
    }

    var s = RT.state.current;
    var F = RT.ledger.fmt;
    var phase = RT.state.currentPhase();

    // Eine Ledger-Karte pro Angebot, Variante `shop`: schmale Zeile, Preis
    // und Kauf-Button rechts. Keine Ertrag-Spalte — siehe die Begründung
    // oben; `gain: false` macht die Karte einspaltig.
    // `cost` kommt als fertiges Array herein, damit die Aufrufstelle vorher
    // RT.ledger.cover() darauf laufen lassen und die Beschriftung ihres Knopfs
    // aus derselben Rechnung ziehen kann. Ein blanker Preis hier hätte zwei
    // getrennte Prüfungen bedeutet — genau das, was der Shop vorher hatte.
    function shopCard(opts) {
      return RT.ledger.card({
        variant: 'shop' + (opts.owned ? ' owned' : '') +
                 (opts.variant ? ' ' + opts.variant : ''),
        icon:   opts.icon,
        title:  opts.title,
        sub:    opts.desc,
        cost:   opts.cost,
        gain:   false,
        action: opts.action,
        actionRight: true
      });
    }
    // Ein Angebot im Shop kostet nur Geld — die Kostenspalte ist eine einzige
    // Kachel. Trotzdem über cover(): der Knopftext („Zu wenig 💰") und die
    // blasse Kachel kommen so auch hier aus derselben Rechnung wie überall.
    function moneyCost(amount) {
      return [{ res: 'money', icon: '💰', value: F.money(amount), need: amount }];
    }

    // Hardware-Sektion. Der Rechner ist eine einmalige Voraussetzung fürs
    // erste Feature — ab Phase 2 steht er längst und die Sektion wäre nur noch
    // eine abgehakte Zeile über den Gebäuden. Deshalb fällt sie dort ganz weg
    // statt als "Gekauft ✓" stehen zu bleiben.
    var hardwareHtml = '';
    if (phase < 2) {
      var rechnerBought = !!s.purchases.rechner;
      var rechnerCost   = moneyCost(600);
      // Ein gekaufter Rechner ist bezahlt — die Kachel darf dann nicht blass
      // werden, nur weil die Kasse inzwischen leer ist.
      var rechnerNeed   = rechnerBought ? { ok: true, label: '' } : RT.ledger.cover(rechnerCost);
      hardwareHtml =
        '<div class="rt-led-sec rt-led-sec--first">🖥️ Hardware</div>' +
        shopCard({
          icon:  '💻',
          title: 'Rechner',
          desc:  'Ohne ihn läuft im HQ keine Frontend-Entwicklung.',
          cost:  rechnerCost,
          owned: rechnerBought,
          action: '<button class="rt-btn-tt rt-btn-tt--primary shop-buy-btn" data-hw="rechner" ' +
                  (rechnerBought || !rechnerNeed.ok ? 'disabled' : '') + '>' +
                  (rechnerBought ? 'Gekauft ✓' : (rechnerNeed.label || 'Kaufen')) + '</button>'
        });
    }

    // Gebäude-Sektion: in Phase 0/1 nur Farm (klein, Küken).
    // Ab Phase 2 zusätzlich Werbeagentur, Marketing-Center und Bürogebäude;
    // Farm wird dann direkt als Huhn gekauft (kleine Serverfarm gibt's nicht mehr).
    // Ohne Hardware darüber ist das die erste Sektion und braucht deren Abstand.
    var buildingsHtml = '<div class="rt-led-sec' +
                        (hardwareHtml ? '' : ' rt-led-sec--first') + '">🏗️ Gebäude</div>';
    var types = ['farm'];
    // ⚠️ Die Werbeagentur steht in Phase 2 GANZ OBEN, solange keine steht —
    // sie ist dort keine Option unter vieren, sondern der nächste Zug (siehe
    // RT.state.buildingLocked). Sobald eine gebaut ist, kehrt die gewohnte
    // Reihenfolge zurück; ein Shop, der seine Zeilen dauerhaft umsortiert,
    // wäre schwerer zu bedienen als einer mit fester Ordnung.
    var needsAgency = phase >= 2 && !RT.state.hasAgency();
    if (phase >= 2) {
      types = needsAgency
        ? ['werbe', 'farm', 'marketing', 'buero']
        : ['farm', 'werbe', 'marketing', 'buero'];
    }
    // Das KI-Labor ist der EINSTIEG in Phase 3, nicht ihre Belohnung: die
    // Nodes im KI-Reiter setzen das Gebäude voraus (requiresBuilding), nicht
    // umgekehrt. Es steht deshalb ohne Freischaltung im Shop.
    if (phase >= 3) types.push('kilabor');
    // Das Werk ist der einzige Gebäudetyp, der eine NODE voraussetzt — es ist
    // die Belohnung für „Zentrale Energieverwaltung", nicht ihr Einstieg.
    if (RT.state.nodeDone('en_zentral')) types.push('energie');

    for (var i = 0; i < types.length; i++) {
      var tid = types[i];
      var t   = RT.state.BUILDING_TYPES[tid];
      // Ein Werk versorgt die ganze Plattform — ein zweites hätte schlicht
      // nichts zu tun.
      var capped    = (tid === 'energie' &&
                       RT.state.instancesByType('energie').length >= RT.state.ENERGY_PLANT_MAX);
      // Marketing und Büro produzieren nichts — ohne Werbeagentur führt ihr
      // Kauf in eine Sackgasse ohne Einkommen (RT.state.buildingLocked).
      var locked    = RT.state.buildingLocked(tid);
      var fitsHere  = !shopPreTile || RT.state.canPlace(tid, shopPreTile.col, shopPreTile.row);
      var tCost     = moneyCost(RT.state.buildingCost(tid));
      // ⚠️ „Schon gebaut", „Passt hier nicht" und die fehlende Werbeagentur
      // sind keine Ressourcen-Frage — dort bleibt die Kachel farbig und nur
      // der Knopf trägt den Grund. Blass heißt im ganzen Spiel: eine Zahl ist
      // zu klein.
      var tNeed     = (capped || locked || !fitsHere) ? { ok: true, label: '' } : RT.ledger.cover(tCost);
      var disabled  = capped || locked || !fitsHere || !tNeed.ok;
      var label;
      if (capped)                        label = 'Schon gebaut';
      else if (locked)                   label = 'Erst 📢 Werbeagentur';
      else if (shopPreTile && !fitsHere) label = 'Passt hier nicht';
      else if (!tNeed.ok)                label = tNeed.label;
      else                               label = shopPreTile ? 'Hier bauen' : 'Kaufen';

      // Ab Phase 2: neue Farmen starten als Huhn — im Shop trotzdem als
      // "Serverfarm" mit dem Gebäude-Sprite (nicht dem Tier-Icon).
      var displayName = (tid === 'farm' && phase < 2) ? 'kleine Serverfarm' : t.name;

      // Solange die erste Agentur fehlt, trägt ihre Karte denselben gelben "!"
      // wie der Shop-Knopf darüber — der Badge führt damit vom Knopf bis zur
      // Zeile durch, statt am Modal-Rand aufzuhören.
      var urgent = (tid === 'werbe' && needsAgency);

      buildingsHtml += shopCard({
        icon:  shopIconHtml(tid) +
               (urgent ? '<span class="rt-notif-badge rt-notif-badge--card">!</span>' : ''),
        title: displayName,
        desc:  urgent
                 ? '<b>Dein nächster Schritt.</b> ' + SHOP_DESC[tid]
                 : (SHOP_DESC[tid] || ''),
        variant: (urgent ? 'urgent' : '') + (locked ? ' locked' : ''),
        action: '<button class="rt-btn-tt rt-btn-tt--primary shop-buy-btn" data-t="' + tid + '" ' +
                (disabled ? 'disabled' : '') + '>' + label + '</button>',
        cost:  tCost
      });
    }

    // Warum zwei Karten gesperrt sind, gehört über die Liste und nicht auf den
    // Knopf: der trägt nur den Grund in drei Wörtern, die Begründung braucht
    // einen Satz. Ohne ihn liest sich die Sperre wie ein Fehler.
    if (needsAgency) {
      hint = '📢 <b>Zuerst die Werbeagentur.</b> Sie ist das einzige Gebäude, das ' +
             'deine <b>Watchtime zu Geld</b> macht — ohne sie verdienst du nichts mehr. ' +
             'Marketing-Center und Bürogebäude bleiben so lange gesperrt.' +
             (shopPreTile
               ? ' Gebaut wird auf Feld <b>(' + shopPreTile.col + ', ' + shopPreTile.row + ')</b>.'
               : '');
    }

    // Zweispaltig ab genug Breite (`.rt-shop-grid`, CSS) — bei sieben, acht
    // Gebäuden ist eine einzelne Kolonne unnötig viel Scrollen. Die
    // Sektionsüberschriften spannen beide Spalten.
    openModal('🛒 Shop',
      '<div class="info-line">' + hint + '</div>' +
      '<div class="rt-shop-grid">' + hardwareHtml + buildingsHtml + '</div>',
      { type: 'shop' });
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
  // Feld gekauft — Funken auf der frisch freigeschalteten Kachel. Das Grid ist
  // hier schon neu gebaut (state:changed feuert vor tile:bought).
  function onTileBought(payload) {
    var tile = document.querySelector('.iso-tile[data-col="' + payload.col + '"][data-row="' + payload.row + '"]');
    if (!tile || !el.world) return;
    var r  = tile.getBoundingClientRect();
    var wr = el.world.getBoundingClientRect();
    var cx = r.left + r.width / 2 - wr.left;
    var cy = r.top  + r.height / 2 - wr.top;
    spawnBurst(cx, cy, '✨');
    spawnFloatText(cx, cy, '−' + fmtMoney(payload.cost), 'gold');
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
      // innerHTML statt textContent: ein einzelnes Emoji-Zeichen verhält sich
      // identisch, aber payload.icon darf jetzt auch ein <img>-Tag sein
      // (RT.assets.iconHtml) — kein Aufrufer schickt hier User-Input.
      s.innerHTML = icon;
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

  // Nach dem Launch: die neu freigeschalteten Techtree-Reiter (Marketing/
  // Werbung) und das nächste Ziel. Steckt als einzelne Karte in der
  // Tour-Mechanik (js/tour.js, Tour 'golive') — ohne Spotlight, weil es ein
  // Moment ist und kein Zeigefinger.
  function showGoLiveInfoModal() {
    RT.tour.startIfNew('golive');
  }

  // Investor-Modal — wird bei bus 'investor:trigger' geöffnet.
  // Zwei-Seiten-Modal an v1 angelehnt (garageScreen.js:234-319), mit Bild
  // aus sprites/Investor.png. Belohnung: +50 000 € Startkapital UND die
  // Serverfarm wird kostenlos ausgebaut (technisch: erste Küken-Farm auf
  // Huhn upgegradet — im Text sprechen wir aber neutral vom Ausbau, damit
  // die Tier-Metapher hinter der Kulisse bleibt).
  // Meilenstein-Zahlen in Prosa: „1 000 000" statt „1.0 Mio", mit schmalen
  // geschützten Leerzeichen wie im übrigen Investorentext.
  //
  // ⚠️ Beide Schwellen standen vorher AUSGESCHRIEBEN im Text und kamen aus
  // js/loop.js nur in der Mechanik vor. Wer dort drehte, machte Marcus zum
  // Lügner — genau das ist beim Verschieben von Phase 3 auf 1 Mio passiert.
  function milestoneText(n) {
    return Math.round(n).toLocaleString('de-DE').replace(/\./g, ' ');
  }

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
      + '      Über <strong>' + milestoneText(RT.actions.INVESTOR_USER_THRESHOLD) + ' User</strong>! Das ganze Viertel redet über dich. '
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
      + '          Sagen wir … bei ' + milestoneText(RT.actions.PHASE3_USER_THRESHOLD) + ' Usern."'
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
      // Ab hier läuft Phase 2 — Trend, Watchtime und die drei neuen
      // Gebäude werden in der Tour erklärt (js/tour.js).
      setTimeout(function () { RT.tour.startIfNew('phase2'); }, 700);
    });
  }
  RT.bus.on('investor:trigger', showInvestorModal);

  // Marcus' Rückkehr — der Gegenpol zum Phase-2-Auftritt. Dort hat er gegeben,
  // hier holt er sich seinen Anteil, und zwar zweimal: einmal vom Kontostand
  // und ab jetzt dauerhaft von jedem Werbeertrag (state.adRevenueMult).
  //
  // ⚠️ OHNE ENTSCHEIDUNG. Lange war ein „auszahlen oder behalten" geplant; das
  // hätte aus einer Beteiligung eine Verhandlung gemacht. Er ist zu 15 % an der
  // Firma beteiligt — das war der Deal, den der Spieler in Phase 2 selbst
  // angenommen hat, und Beteiligungen fragen nicht. Genau das ist die Lehre.
  //
  // ⚠️ Das Geld ist zum Zeitpunkt dieses Aufrufs SCHON WEG (loop.js,
  // maybeTriggerPhase3). Das Modal berichtet nur — es rechnet nichts und bucht
  // nichts ab, sonst gäbe es zwei Wahrheiten über denselben Betrag.
  //
  // Zwei Seiten, damit der Moment nicht auf einer schlechten Nachricht endet:
  // erst die Rechnung, dann das, was Phase 3 aufmacht.
  function showPhase3Modal() {
    var s    = RT.state.current;
    var name = (s.player && s.player.name) ? String(s.player.name) : 'du';
    var cut  = Math.round(s.investorCutAmount || 0);
    var pct  = Math.round(RT.state.INVESTOR_PAYOUT_SHARE * 100);

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-investor-info">'
      + '  <div id="rt-phase3-p1" class="rt-investor-page">'
      + '    <div class="rt-investor-info__body">'
      + '      <img class="rt-investor-info__bear rt-investor-info__bear--sm" src="sprites/Investor.png" alt="Marcus Bär">'
      + '      <div class="rt-investor-info__right">'
      + '        <h2 class="rt-investor-info__title">Ich hab’s dir versprochen, ' + name + '. 🐻</h2>'
      + '        <p class="rt-investor-info__quote">'
      + '          „<strong>' + milestoneText(RT.actions.PHASE3_USER_THRESHOLD) + ' User.</strong> '
      + '          Weißt du noch, was ich damals gesagt habe? Ausschüttungen besprechen wir, '
      + '          wenn ihr wirklich groß seid. Ihr seid wirklich groß."'
      + '        </p>'
      + '        <div class="rt-investor-info__deal">'
      + '          <div class="rt-investor-info__row">'
      + '            <span>🤝 Sein Anteil</span><strong>' + pct + ' % der Firma</strong>'
      + '          </div>'
      + '          <div class="rt-investor-info__row">'
      + '            <span>💸 Ausschüttung, jetzt</span><strong>− ' + fmtMoney(cut) + '</strong>'
      + '          </div>'
      + '          <div class="rt-investor-info__row">'
      + '            <span>📉 Werbeerträge, ab jetzt</span><strong>− ' + pct + ' %</strong>'
      + '          </div>'
      + '        </div>'
      + '        <p class="rt-investor-info__whisper">'
      + '          „Keine Sorge, ich bleibe an Bord. Ich nehme nur, was mir sowieso gehört — '
      + '          und das gilt ab heute auch für das, was deine Werbung einbringt."'
      + '        </p>'
      + '      </div>'
      + '    </div>'
      + '    <button class="rt-launch-weiter" id="rt-phase3-next" type="button">Und jetzt? →</button>'
      + '  </div>'
      + '  <div id="rt-phase3-p2" class="rt-investor-page" style="display:none">'
      + '    <h2 class="rt-investor-info__title">Willkommen in Phase 3! 🧠</h2>'
      + '    <p class="rt-investor-info__quote">'
      + '      Deine Plattform ist groß genug, dass sich aus dem, was die Leute '
      + '      anschauen, etwas bauen lässt: <strong>User-Modelle</strong>.'
      + '    </p>'
      + '    <div class="rt-investor-info__deal">'
      + '      <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '        <span>🧠 KI-Labor</span><strong>neu im Shop</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '        <span>🗃️ Metadaten</span><strong>neue Ressource</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row">'
      + '        <span>⏳ Modell trainieren</span><strong>kostet Watchtime</strong>'
      + '      </div>'
      + '    </div>'
      + '    <p class="rt-investor-info__whisper">'
      + '      Ein Modell zieht in eine deiner Serverfarmen und produziert dort '
      + '      Metadaten — es belegt aber einen Platz, auf dem sonst User wohnen würden.'
      + '    </p>'
      + '    <button class="rt-launch-weiter" id="rt-phase3-ok" type="button">Los geht\'s! 🚀</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#rt-phase3-next').addEventListener('click', function () {
      document.getElementById('rt-phase3-p1').style.display = 'none';
      document.getElementById('rt-phase3-p2').style.display = '';
    });
    overlay.querySelector('#rt-phase3-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      RT.bus.emit('state:changed');
      // Ab hier läuft Phase 3 — Modelle, Metadaten und das KI-Labor werden in
      // der Tour erklärt (js/tour.js), genau wie der Investor-Deal die
      // Phase2-Tour anstößt.
      setTimeout(function () { RT.tour.startIfNew('phase3'); }, 700);
    });
  }
  RT.bus.on('phase3:trigger', showPhase3Modal);

  // ── Phase 4: die Welt schaut zurück ─────────────────────────────────────
  // Zwei Seiten wie bei den beiden Meilensteinen davor, aber ohne Marcus:
  // hier gratuliert niemand von außen, weil es niemanden mehr gibt, der
  // über der Plattform steht. Genau das ist die Aussage — der Spieler ist
  // groß genug, dass Presse, Gerichte und Politik ihn als Gegenüber
  // behandeln statt als Startup.
  //
  // ⚠️ Das Modal bucht nichts ab und schaltet nichts frei. Phase 4 bringt
  // keine Ressource, sondern Entscheidungen; alles Mechanische steckt in
  // js/events.js. Der einzige Effekt beim Schließen ist, dass die Uhr für
  // die erste Runde neu startet — mit FIRST_ROUND_SEC statt einer vollen
  // Runde, denn nach einer Erklärung will man das Erklärte auch sehen.
  function showPhase4Modal() {
    var s    = RT.state.current;
    var name = (s.player && s.player.name) ? String(s.player.name) : 'du';
    var plat = (s.player && s.player.platformName) ? escapeHTML(String(s.player.platformName))
                                                   : 'deine Plattform';

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    // Die id ist kein Styling-Haken: events.js hält den Kartentisch an,
    // solange dieses Modal steht — sonst legt er sich darüber, wenn der
    // Spieler die zwei Seiten länger liest als der Vorlauf dauert.
    overlay.id = 'rt-phase4-modal';
    overlay.innerHTML = ''
      + '<div class="rt-investor-info">'
      + '  <div id="rt-phase4-p1" class="rt-investor-page">'
      + '    <h2 class="rt-investor-info__title">' + milestoneText(RT.actions.PHASE4_USER_THRESHOLD)
      +        ' User, ' + escapeHTML(name) + '. 🚀</h2>'
      + '    <p class="rt-investor-info__quote">'
      + '      Das ist keine Plattform mehr, das ist <strong>Infrastruktur</strong>. '
      +        plat + ' ist für Millionen Menschen der Ort, an dem sie sich '
      + '      informieren, streiten und verabreden. Du hast es geschafft: '
      + '      ab hier geht es nur noch ums Wachstum — und darum, ein '
      + '      <strong>Imperium</strong> zu werden.'
      + '    </p>'
      + '    <div class="rt-investor-info__deal">'
      + '      <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '        <span>👥 User</span><strong>' + milestoneText(RT.actions.PHASE4_USER_THRESHOLD) + '+</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '        <span>🌐 Netzwerkeffekt</span><strong>trägt dich von allein</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row rt-investor-info__row--win">'
      + '        <span>🏆 Phase 4</span><strong>Imperium</strong>'
      + '      </div>'
      + '    </div>'
      + '    <button class="rt-launch-weiter" id="rt-phase4-next" type="button">Und der Haken? →</button>'
      + '  </div>'
      + '  <div id="rt-phase4-p2" class="rt-investor-page" style="display:none">'
      + '    <h2 class="rt-investor-info__title">Aber jetzt schaut die Welt zurück. 🌍</h2>'
      + '    <p class="rt-investor-info__quote">'
      + '      So groß zu sein heißt auch: du bist <strong>interessant geworden</strong>. '
      + '      Presse, Gerichte, Regierungen, Lobbyisten, Konkurrenten — sie alle '
      + '      wollen etwas von dir. Ab jetzt kommen <strong>äußere Einflüsse</strong>, '
      + '      und die haben echte Wirkung auf deine Plattform.'
      + '    </p>'
      + '    <div class="rt-investor-info__deal">'
      + '      <div class="rt-investor-info__row">'
      + '        <span>🃏 Ereigniskarten</span><strong>alle '
      +            Math.round(RT.events.ROUND_SEC / 60) + ' Minuten</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row">'
      + '        <span>🎲 Drei Karten</span><strong>du nimmst eine</strong>'
      + '      </div>'
      + '      <div class="rt-investor-info__row">'
      + '        <span>🔥 Krisen</span><strong>bleiben liegen, bis du handelst</strong>'
      + '      </div>'
      + '    </div>'
      + '    <p class="rt-investor-info__whisper">'
      + '      Jede Entscheidung legt neue Karten in dein Deck. Wer oft schlecht '
      + '      entscheidet, hat irgendwann ein Deck voller Krisen — und zieht sie dann auch.'
      + '    </p>'
      + '    <button class="rt-launch-weiter" id="rt-phase4-ok" type="button">Zeig mir, wie das geht 🃏</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#rt-phase4-next').addEventListener('click', function () {
      document.getElementById('rt-phase4-p1').style.display = 'none';
      document.getElementById('rt-phase4-p2').style.display = '';
    });
    overlay.querySelector('#rt-phase4-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      // Die Uhr startet HIER, nicht beim Auslösen von Phase 4 — und mit einem
      // kürzeren Vorlauf als eine reguläre Runde. Die Tour davor hält sie an
      // (events.js), der Spieler bekommt die zwei Minuten also vollständig
      // nach der Erklärung und nicht währenddessen.
      RT.events.state().nextAt = Date.now() + RT.events.FIRST_ROUND_SEC * 1000;
      RT.bus.emit('state:changed');
      // ⚠️ Warten, falls gerade eine andere Tour läuft. tour.start() hat
      // einen Doppelstart-Guard und würde sonst STILL nichts tun — der
      // Spieler bekäme den Kartentisch ohne die Erklärung davor. Die
      // ereignisgebundenen Touren (Netzwerkeffekt, Vertrauens-Feature)
      // hängen an 'state:changed' und können genau hier dazwischenkommen.
      (function warten(n) {
        if (n > 0 && RT.tour.isOpen()) { setTimeout(function () { warten(n - 1); }, 500); return; }
        RT.tour.startIfNew('phase4');
      })(40);
    });
  }
  RT.bus.on('phase4:trigger', showPhase4Modal);

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
  // ── Die Netzwerkeffekt-Leiter ──────────────────────────────────────────
  // Der wichtigste Baustein der ganzen Mechanik, weil ein Bonus auf eine
  // STEIGUNG unsichtbar ist, wenn man ihn nicht zeigt. Die Leiter leistet
  // vier Dinge auf einmal:
  //   1. den aktuellen Wert            (die Sprosse mit „du bist hier")
  //   2. dass er STEIGT                (die Sprossen rechts davon)
  //   3. das nächste Ziel              (die nächste Sprosse, als Motivation)
  //   4. dass es eine Decke gibt       (MAX auf der letzten)
  // Und der eigentliche Zweck: baut man ein Vertrauens-Feature, gehen ALLE
  // Zahlen auf der Leiter hoch. Das ist der sichtbare Beweis, dass die Node
  // etwas getan hat, obwohl sich der Trend gerade kaum bewegt.
  //
  // `k` optional — die Erklär-Karte stellt damit zwei Leitern (vorher/nachher)
  // nebeneinander.
  // Sprossen jenseits einer Milliarde als „1 Mrd" statt „1000M" — die Leiter
  // ist die einzige Stelle im Spiel, an der solche Zahlen vorkommen, deshalb
  // steht das hier lokal und nicht im globalen fmtNum.
  function fmtLadderUsers(n) {
    if (n >= 1000000000) return String(n / 1000000000).replace('.', ',') + ' Mrd';
    return fmtNum(n);
  }
  function networkLadderHtml(k, compact) {
    var rungs = RT.state.networkLadder(k);
    var cells = '';
    for (var i = 0; i < rungs.length; i++) {
      var r   = rungs[i];
      var cls = 'rt-netz__rung'
              + (r.reached ? ' is-reached' : '')
              + (r.here    ? ' is-here'    : '')
              // Die fallenden Sprossen bekommen eine eigene Optik. Ohne sie
              // läse sich die Leiter wie ein Fehler: erst steigende Zahlen,
              // dann ohne Vorwarnung sinkende.
              + (r.past    ? ' is-past'    : '');
      cells += '<div class="' + cls + '">'
            +    '<div class="rt-netz__users">' + fmtLadderUsers(r.users) + '</div>'
            +    '<div class="rt-netz__val">' + (r.value ? '+' : '')
            +      fmtTrendPlain(r.value) + '</div>'
            +    (r.isMax  ? '<div class="rt-netz__max">MAX</div>' : '')
            +    (r.isFull ? '<div class="rt-netz__full">Welt voll</div>' : '')
            +    (r.here   ? '<div class="rt-netz__here">du bist hier</div>' : '')
            + '</div>';
    }
    return '<div class="rt-netz' + (compact ? ' rt-netz--compact' : '') + '">' + cells + '</div>';
  }

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
      // Zwei Zustände: voll angelegt (mit Restzeit) oder schon am Abklingen.
      var ttl = '', arrow = '';
      if (m.network) {
        // ⚠️ Der Netzwerkeffekt ist dauerhaft, aber NICHT unumkehrbar wie ein
        // Dark Pattern. Bekäme er denselben roten „dauerhaft"-Vermerk, läse
        // sich die einzige gute dauerhafte Kraft im Spiel wie eine Warnung.
        ttl   = ' <span class="trend-row__ttl trend-row__ttl--grow">wächst mit dir</span>';
        arrow = trendArrow('perm');
      } else if (m.permanent) {
        ttl   = ' <span class="trend-row__ttl trend-row__ttl--perm">dauerhaft</span>';
        arrow = trendArrow('perm');
      } else if (m.fading) {
        ttl   = ' <span class="trend-row__ttl">klingt ab</span>';
        arrow = trendArrow('fade');
      } else if (m.holdUntil) {
        var restSec = Math.max(0, Math.round((m.holdUntil - Date.now()) / 1000));
        ttl   = ' <span class="trend-row__ttl">noch ' + restSec + ' s voll</span>';
        arrow = trendArrow('hold');
      }
      rows += '<div class="trend-row">'
            +   '<span class="trend-row__label">' + escapeTrend(m.label) + ttl + '</span>'
            +   '<span class="trend-row__right">'
            +     '<span class="trend-row__val trend-row__val--' + (m.value > 0 ? 'pos' : 'neg') + '">'
            +       sgn + fmtTrendPlain(m.value) + '</span>'
            +     arrow
            +   '</span>'
            + '</div>';
    }
    if (restV) {
      // Kein Pfeil — das Bündel mischt Zustände. Der Platzhalter hält die
      // Zahl trotzdem in derselben Spalte wie die Zeilen darüber.
      rows += '<div class="trend-row">'
            +   '<span class="trend-row__label">Sonstiges (' + (mods.length - 5) + ')</span>'
            +   '<span class="trend-row__right">'
            +     '<span class="trend-row__val trend-row__val--' + (restV > 0 ? 'pos' : 'neg') + '">'
            +       (restV > 0 ? '+' : '') + fmtTrendPlain(restV) + '</span>'
            +     '<span class="trend-row__arrow"></span>'
            +   '</span>'
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

    // Die Leiter erscheint erst, wenn der Netzwerkeffekt überhaupt läuft
    // (ab NETWORK_U0 = 10.000 Usern). Davor wäre sie eine Tabelle mit lauter
    // Nullen in der ersten Spalte und einem Versprechen in den übrigen.
    var netzBlock = '';
    if (RT.state.networkEffect() > 0) {
      // Drei Zustände statt zwei. Der dritte ist der wichtigste: ein Posten,
      // der jahrelang nur gestiegen ist und plötzlich fällt, braucht seinen
      // Grund an Ort und Stelle — sonst liest er sich wie ein Fehler.
      var satz;
      if (RT.state.networkSaturating()) {
        satz = ' Die Welt füllt sich: ab <b>1 Mrd</b> Usern bleiben immer weniger '
             + 'übrig, die noch dazukommen könnten. Bei <b>3 Mrd</b> ist der Effekt '
             + 'aufgebraucht — deine Plattform ist dann nicht schlechter, sie hat '
             + 'nur alle.';
      } else if (RT.state.networkAtCap()) {
        satz = ' Du hast das Maximum erreicht: mehr „da sind ja alle" gibt es nicht.';
      } else {
        satz = ' Vertrauens-Features im HQ machen diese Stufen größer.';
      }
      netzBlock = ''
        + '<div class="trend-modal__head">🌐 Netzwerkeffekt'
        +   '<span class="trend-modal__headval">+' + fmtTrendPlain(RT.state.networkEffect()) + '</span>'
        + '</div>'
        + '<p class="info-line info-small">Je mehr User, desto attraktiver wird die Plattform '
        + 'von allein — jede Verzehnfachung bringt <b>+' + fmtTrendPlain(RT.state.networkK())
        + '</b>.' + satz + '</p>'
        + networkLadderHtml();
    }

    return ''
      + '<div class="trend-modal">'
      + '  <div class="trend-modal__big trend-modal__big--' + (trend > 0 ? 'pos' : (trend < 0 ? 'neg' : 'neutral')) + '">'
      +      (trend > 0 ? '+' : '') + fmtTrendPlain(trend) + ' %'
      + '  </div>'
      + '  <p class="info-line">' + wirkung + '</p>'
      + '  <div class="trend-modal__head">Was gerade einzahlt</div>'
      +    rows
      +    netzBlock
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

  // Pfeil hinter dem Wert: waagerecht = liegt voll an, 45° abwärts = klingt
  // gerade ab. Der Text daneben bleibt stehen, der Pfeil ist die schnelle
  // Lesart — man sieht die Spalte auf einen Blick, ohne jede Zeile zu lesen.
  // Als SVG statt Emoji, damit Strichstärke und Farbe zum Modal passen.
  function trendArrow(kind) {
    var d = kind === 'fade'
      ? '<path d="M4 4 L11.3 11.3"/><path d="M6.8 11.3 H11.3 V6.8"/>'
      : '<path d="M2.5 8 H11.5"/><path d="M8.2 4.8 L11.5 8 L8.2 11.2"/>';
    return '<svg class="trend-row__arrow trend-row__arrow--' + kind + '"'
         + ' viewBox="0 0 16 16" aria-hidden="true">' + d + '</svg>';
  }

  function openTrendInfo() {
    openModal('📈 Trend', trendInfoHtml(), { type: 'trend' });
  }

  // Aufschlüsselung des Watchtime-Multiplikators — dieselbe Logik wie beim
  // Trend: die Zahl in der Kachel soll nie unerklärt dastehen.
  function openWatchtimeInfo() {
    var mods = RT.state.watchtimeMultMods();
    var mult = RT.state.watchtimeMult();
    var rows = '';
    for (var i = 0; i < mods.length; i++) {
      rows += '<div class="trend-row">'
            +   '<span class="trend-row__label">' + escapeTrend(mods[i].label) + '</span>'
            +   '<span class="trend-row__val trend-row__val--pos">×'
            +     mods[i].value.toFixed(2).replace('.', ',') + '</span>'
            + '</div>';
    }
    if (!rows) {
      rows = '<div class="trend-row"><span class="trend-row__label">Noch keine Features</span>'
           + '<span class="trend-row__val">×1,00</span></div>';
    }
    openModal('⏳ Watchtime-Multiplikator',
      '<div class="info-line">Deine Features halten User länger auf der Plattform. '
      + 'Der Multiplikator wirkt auf <b>alle Serverfarmen</b> und greift beim Ernten.</div>'
      + rows
      + '<div class="trend-row trend-row--total">'
      +   '<span class="trend-row__label"><b>Gesamt</b></span>'
      +   '<span class="trend-row__val trend-row__val--pos"><b>×'
      +     mult.toFixed(2).replace('.', ',') + '</b></span>'
      + '</div>'
      + '<div class="info-line info-small">Jedes dieser Features wirkt <b>dauerhaft</b> — '
      + 'einmal gebaut, bleibt der Faktor.</div>',
      { type: 'watchtime' });
  }

  // Der Phase-2-Einstieg wird nicht mehr hier erklärt, sondern von der
  // dreistufigen Tour in js/tour.js (Trend · Watchtime · neue Gebäude).

  // Logo-Redesign abgeschlossen: zeigt alt → neu nebeneinander und tauscht
  // danach das Logo in der Profilleiste aus. Die Leiste wird nur beim Betreten
  // des Screens gebaut, deshalb hier direkt am <img> nachziehen.
  function showLogoRedesignModal() {
    var player = RT.state.current.player || {};
    if (!player.platformLogo || !RT.assets) return;

    var oldSrc = RT.assets.logoSrc(player.platformLogo, 'original');
    var newSrc = RT.assets.logoSrc(player.platformLogo, 'nice');
    var name   = escapeHTML(player.platformName || 'Deine Plattform');
    // Trend-Wert aus der Node ziehen statt hier zu wiederholen — sonst steht
    // im Modal irgendwann was anderes als im Techtree.
    var node   = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES.logoNeu : null;
    var bonus  = (node && node.trendBonus) || 0;
    var bonusS = '+' + bonus.toFixed(1).replace('.', ',');

    var overlay = document.createElement('div');
    overlay.className = 'rt-launch-overlay';
    overlay.innerHTML = ''
      + '<div class="rt-golive-info">'
      + '  <div class="rt-golive-info__title">✨ Neues Logo</div>'
      + '  <p class="rt-golive-info__sub">Dein Team hat das Logo von ' + name + ' überarbeitet.</p>'
      + '  <div class="rt-logo-reveal">'
      + '    <figure class="rt-logo-reveal__side">'
      + '      <img src="' + oldSrc + '" alt="Logo vorher">'
      + '      <figcaption>vorher</figcaption>'
      + '    </figure>'
      + '    <div class="rt-logo-reveal__arrow">→</div>'
      + '    <figure class="rt-logo-reveal__side rt-logo-reveal__side--new">'
      + '      <img src="' + newSrc + '" alt="Logo nachher">'
      + '      <figcaption>nachher</figcaption>'
      + '    </figure>'
      + '  </div>'
      + '  <div class="rt-golive-info__box">'
      + '    <div class="rt-golive-info__head">Was das bringt</div>'
      + '    <ul class="rt-golive-info__list">'
      + '      <li>Aus dem gemalten Entwurf ist eine <strong>klare Wortmarke</strong> geworden — '
      +          'die gleiche Idee, nur professionell umgesetzt.</li>'
      + '      <li>Deine Plattform wirkt <strong>seriöser</strong>. Das gibt dir erstmal '
      +          'Rückenwind beim Trend: <strong>' + bonusS + '</strong>.</li>'
      + '    </ul>'
      + '  </div>'
      + '  <button class="rt-launch-weiter" id="rt-logo-ok" type="button">Sieht gut aus ✨</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#rt-logo-ok').addEventListener('click', function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });

    var barLogo = document.querySelector('.rt-profile-bar__logo');
    if (barLogo) barLogo.src = newSrc;
  }

  RT.bus.on('techtree:completed', function (d) {
    if (!d || !d.nodeId) return;
    if (d.nodeId === 'logoNeu') showLogoRedesignModal();

    // Erstes Feature der Watchtime-Achse: hier taucht der ×-Chip an der
    // Watchtime-Kachel zum ersten Mal auf, und eine unerklärte Zahl ist keine
    // Belohnung. Die Bedingung liest watchtimeMult statt einer Node-Liste —
    // damit ist egal, welche der Nodes zuerst kommt und in welcher Phase.
    // Das Flag setzt die Tour selbst, beim Beenden.
    //
    // Beim Abholen AUS dem Techtree-Modal heraus schließt sich das Modal
    // gleich nach diesem Ereignis (techtree.js); die Tour misst ihr Ziel erst
    // im nächsten Frame und findet die Kachel dann frei.
    var def = (RT.techtree && RT.techtree.NODES) ? RT.techtree.NODES[d.nodeId] : null;
    if (def && def.watchtimeMult && RT.tour) RT.tour.startIfNew('wtmult', d.nodeId);
    // Erstes Vertrauens-Feature. Dieselbe Begründung, nur umgekehrt: hier
    // passiert im Moment des Abholens SICHTBAR fast nichts — der Trend rührt
    // sich kaum. Ohne Karte sähe die teuerste Node im Baum wie ein Fehlkauf
    // aus. Bedingung ist `networkK`, nicht eine Node-Liste.
    //
    // ⚠️ Nach der wtmult-Zeile, damit bei einer Node, die je beides hätte,
    // die Watchtime-Karte zuerst käme — der _open-Guard im Tour-Modul lässt
    // ohnehin nur eine gleichzeitig zu.
    if (def && def.networkK && RT.tour) RT.tour.startIfNew('whitepattern', d.nodeId);
  });

  // Der Netzwerkeffekt hat keinen Auslöser, den man abholen könnte — er
  // wächst still mit. Der Toast aus loop.js meldet jede halbe Stufe; beim
  // ERSTEN Überschreiten von +2,0 kommt stattdessen einmal die Erklärung.
  //
  // ⚠️ Die Schwelle ist bewusst höher als der Einstieg bei 10.000 Usern:
  // dort steht der Wert bei 0,0 und es gäbe nichts zu zeigen. Bei +2,0 hat
  // die Leiter zwei erreichte Sprossen und vier offene — das ist der Moment,
  // in dem sie als Fortschritt lesbar ist.
  RT.bus.on('state:changed', function () {
    if (!RT.tour) return;
    if (RT.state.current.networkTourSeen) return;
    if (RT.state.networkEffect() < 2) return;
    RT.tour.startIfNew('network');
  });

  RT.ui = { init: init, toast: toast, closeModal: closeModal, spawnFireworks: spawnFireworks,
            openTrendInfo: openTrendInfo, openWatchtimeInfo: openWatchtimeInfo,
            showLogoRedesignModal: showLogoRedesignModal,
            // Muss über RT.ui raus: diese Datei läuft in ZWEI getrennten IIFEs
            // (siehe Kommentar ab Zeile 3682), und der Klick-Handler auf das
            // Tarifstufen-Badge sitzt im zweiten. Ohne den Export bekommt der
            // reine Funktionsname dort einen ReferenceError — genau der Bug,
            // der den Klick bisher ins Leere hat laufen lassen.
            showServerUpkeepModal: showServerUpkeepModal };
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
    if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace('.', ',') + ' Mrd';
    if (n >= 1000000)    return (n / 1000000).toFixed(1).replace('.', ',') + ' Mio';
    if (n >= 1000)        return (n / 1000).toFixed(1).replace('.', ',') + ' k';
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
      // Konto-Abzeichen unten rechts am Avatar-Kopf. Es sitzt bewusst LINKS
      // beim Spieler und nicht rechts bei der Plattform: dort steht schon der
      // grüne Online-Punkt, und der bedeutet „deine Plattform ist live". Zwei
      // grüne Punkte in einer Leiste mit zwei verschiedenen Bedeutungen wären
      // die perfekte Verwechslung — deshalb andere Seite, andere Form.
      + '    <button class="rt-profile-bar__avatar" id="rt-account-btn" type="button"'
      + '            aria-label="Speicher-Status">'
      +        (head ? '<img class="rt-profile-bar__head" src="' + head + '" alt="">' : '')
      + '      <span class="rt-account-badge" id="rt-account-badge"></span>'
      + '    </button>'
      + '    <span class="rt-profile-bar__name">' + name + '</span>'
      + '  </div>'
      // Shop + "?" bleiben eine Einheit in der Mitte — sonst zieht
      // space-between den Shop-Button aus der Mitte, sobald das "?" dazukommt.
      + '  <div class="rt-profile-bar__tools">'
      // Rückweg in die Lernwelt. Er muss hier stehen und für JEDEN Konto-
      // zustand: der einzige Weg zurück lag vorher im Gast-Zweig des Konto-
      // Modals, ein angemeldeter Spieler kam also gar nicht mehr heraus. Und
      // im Hub wartet die Belohnung — Ei, Monster, Münzen zeigt ausschließlich
      // die Lernwelt (GameHub/creatures.js, syncStartupStory).
      + '    <button class="rt-shop-btn rt-shop-btn--help" id="rt-hub-btn" type="button"'
      + '            title="Zurück zur Lernwelt"'
      + '            aria-label="Zurück zur Lernwelt">🏠</button>'
      + '    <button class="rt-shop-btn" id="shop-btn" aria-label="Shop">🛒'
      + '      <span class="rt-notif-badge" id="rt-shop-badge" style="display:none">!</span>'
      + '    </button>'
      // Ereigniskarten (Phase 4). Bewusst im Shop-Stil und direkt daneben:
      // es ist der zweite Ort, an dem der Spieler regelmäßig etwas
      // entscheidet. Der Countdown steht auf dem Knopf selbst — die Frage
      // „wann kommt die nächste Karte" soll man nicht aufmachen müssen.
      + '    <button class="rt-shop-btn rt-events-btn" id="rt-events-btn" type="button"'
      + '            style="display:none" title="Ereignisse"'
      + '            aria-label="Ereignisse">🃏'
      + '      <span class="rt-events-btn__crises" id="rt-events-crises" style="display:none"></span>'
      + '      <span class="rt-events-btn__clock"  id="rt-events-clock"></span>'
      + '    </button>'
      // Ruft die Erklär-Tour der aktuellen Phase erneut auf (js/tour.js).
      + '    <button class="rt-shop-btn rt-shop-btn--help" id="rt-help-btn" type="button"'
      + '            title="Erklärung nochmal ansehen"'
      + '            aria-label="Erklärung nochmal ansehen">?</button>'
      + '  </div>'
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

  // Wo auf dem Trend-Balken die Null liegt — dieselbe Rechnung wie die Füllung
  // in refreshTrend(), nur für den festen Wert 0. Steht als eigene Funktion da,
  // weil sie im Markup an zwei Stellen hängt (Nullstrich und Farbwechsel des
  // Verlaufs) und beide nie auseinanderlaufen dürfen.
  function trendZeroPct() {
    var lo = RT.state.TREND_MIN, hi = RT.state.TREND_MAX;
    return ((0 - lo) / (hi - lo) * 100).toFixed(2);
  }

  // Resource-Bar für v3: Geld · User · Watchtime · Modelle · Metadaten ·
  // Trend · Server. Geld + User haben die Sparkline im Hintergrund und sind
  // volle Kacheln; die Produktionskette in der Mitte läuft schmal.
  // Phase-Sichtbarkeit: --phase2 ab Phase 2, --phase3 ab Phase 3.
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
      // Watchtime · Modelle · Metadaten sind die Produktionskette und stehen
      // deshalb als kompakte Dreiergruppe zusammen — schmaler als Geld und
      // User, die die beiden Kennzahlen sind, auf die man dauernd schaut.
      + '  <div class="rt-resource rt-resource--watchtime rt-resource--phase2 rt-resource--slim">'
      + '    <span class="rt-resource__icon">⏳</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Watchtime</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="watchtime">0</span></div>'
      + '      <button class="rt-resource__wt-mult" id="rt-res-wt-mult" type="button"'
      + '              style="display:none" title="Woher kommt der Multiplikator?"></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--models rt-resource--phase3 rt-resource--slim">'
      + '    <span class="rt-resource__icon">🧠</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Modelle</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="models">0</span></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--meta rt-resource--phase3 rt-resource--slim">'
      + '    <span class="rt-resource__icon">🗃️</span>'
      + '    <div>'
      + '      <div class="rt-resource__label">Metadaten</div>'
      + '      <div class="rt-resource__value"><span data-rt-res="metadata">0</span></div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="rt-resource rt-resource--trend rt-resource--phase2" id="rt-trend-card">'
      + '    <div class="rt-trend-inner">'
      + '      <button class="rt-trend-head" id="rt-trend-info" type="button" title="Was ist der Trend?">'
      // Der Stern ist die Kennung des Trends: dieselbe steht in den Ledger-
      // Kacheln der Werbeagentur, wo die Beschriftung weggelassen ist.
      + '        <span class="rt-resource__icon rt-resource__icon--inline">⭐</span>'
      + '        <span class="rt-resource__label">Trend</span>'
      + '        <span class="rt-trend-value" id="rt-trend-value">0 %</span>'
      + '        <span class="rt-trend-help">?</span>'
      + '      </button>'
      // ⚠️ Der Nullpunkt wird aus TREND_MIN/TREND_MAX gerechnet, nicht auf 50 %
      // gesetzt. Die Skala ist seit TREND_MAX = 40 unsymmetrisch (−20 … +40),
      // die Mitte des Balkens ist also +10 und nicht 0 — der Strich stand
      // vorher an einer Stelle, an der der Trend längst positiv ist. An
      // derselben Marke hängt auch der Farbwechsel des Verlaufs (rot →
      // gelb → grün): der Umschlagpunkt IST der Nullpunkt.
      + '      <div class="rt-trend-track" style="--rt-trend-zero:' + trendZeroPct() + '%">'
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
      // Dieselbe Reihenfolge und dieselben Farben wie der Belegungs-Balken im
      // Farm-Modal: User · Code · Modelle. Der Balken oben ist die Summe
      // dessen, was dort je Farm einzeln steht — zwei verschiedene
      // Farbzuordnungen für dieselbe Sache wären nicht zu lesen.
      + '      <div class="rt-server-bar">'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--usr"   id="rt-server-seg-usr"></div>'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--code"  id="rt-server-seg-code"></div>'
      + '        <div class="rt-server-bar__seg rt-server-bar__seg--model" id="rt-server-seg-model"></div>'
      + '      </div>'
      // Tarifstufe der Serverkosten — UNTER dem Kapazitätsbalken, nicht mehr
      // neben "Server": sie gehört zur Kapazität, die der Balken zeigt, nicht
      // zum Label der Kachel. Klick öffnet die Aufschlüsselung aller fünf
      // Stufen samt der nächsten Grenze.
      // Icon fest im Markup, Text in einem eigenen Span: der Knopf wird im
      // Sekundentakt aktualisiert, und ein dabei neu gebautes <img> flackert
      // auf iPads (siehe setIconLabel im UI-Modul darüber).
      + '      <button class="rt-srv-tier" id="rt-srv-tier" type="button" style="display:none">'
      +          RT.assets.iconHtml('stromWasser')
      + '        <span id="rt-srv-tier-label"></span>'
      + '      </button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function bindResourceBar(container) {
    var refs = {
      money:          container.querySelector('[data-rt-res="money"]'),
      users:          container.querySelector('[data-rt-res="users"]'),
      watchtime:      container.querySelector('[data-rt-res="watchtime"]'),
      models:         container.querySelector('[data-rt-res="models"]'),
      metadata:       container.querySelector('[data-rt-res="metadata"]'),
      modelsCard:     container.querySelector('.rt-resource--models'),
      metaCard:       container.querySelector('.rt-resource--meta'),
      serverUsed:     container.querySelector('[data-rt-res="serverUsed"]'),
      serverCap:      container.querySelector('[data-rt-res="serverCap"]'),
      moneyCanvas:    container.querySelector('[data-spark="money"]'),
      usersCanvas:    container.querySelector('[data-spark="users"]'),
      moneyCard:      container.querySelector('#rt-res-money-card'),
      flyerChip:      container.querySelector('#rt-res-flyer'),
      watchtimeCard:  container.querySelector('.rt-resource--watchtime'),
      wtMult:         container.querySelector('#rt-res-wt-mult'),
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
      helpBtn:        container.querySelector('#rt-help-btn'),
      evBtn:          container.querySelector('#rt-events-btn'),
      evClock:        container.querySelector('#rt-events-clock'),
      evCrises:       container.querySelector('#rt-events-crises'),
      evStrip:        container.querySelector('#rt-event-strip'),
      serverSeg:      container.querySelector('#rt-server-seg-usr'),
      serverSegSw:    container.querySelector('#rt-server-seg-code'),
      serverSegModel: container.querySelector('#rt-server-seg-model'),
      serverCard:     container.querySelector('.rt-resource--server'),
      srvTier:        container.querySelector('#rt-srv-tier'),
      srvTierLabel:   container.querySelector('#rt-srv-tier-label')
    };

    if (refs.srvTier) {
      refs.srvTier.addEventListener('click', function (ev) {
        ev.stopPropagation();
        RT.ui.showServerUpkeepModal();
      });
    }

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
      // User-Modelle belegen dieselbe Serverkapazität wie User und Code —
      // in der Server-Kachel müssen sie deshalb mitzählen, sonst zeigt sie
      // freien Platz an, den freeUserCapacity() längst vergeben hat.
      var modCap    = RT.state.modelCapacityTotal ? RT.state.modelCapacityTotal() : 0;
      var totalUsed = users + prog + modCap;

      // Modelle sind eine globale Zahl — 1 Modell = 1 Kapazität, also ist die
      // Stückzahl gleichzeitig der Kapazitätsanteil.
      var modelCount = modCap;

      if (refs.money)          refs.money.textContent          = formatNumber(money);
      if (refs.users)          refs.users.textContent          = formatNumber(users);
      if (refs.watchtime)      refs.watchtime.textContent      = formatNumber(wt);
      if (refs.models)         refs.models.textContent         = formatNumber(modelCount);
      if (refs.metadata)       refs.metadata.textContent       = formatNumber(Math.floor(s.metadata || 0));
      if (refs.serverUsed)     refs.serverUsed.textContent     = formatNumber(totalUsed);
      if (refs.serverCap)      refs.serverCap.textContent      = formatNumber(cap);

      // Alle Segmente auf denselben Nenner (cap), in der Reihenfolge
      // User · Code · Modelle. Jedes wird gegen den bereits belegten Rest
      // gedeckelt, damit die Summe nie über 100 % läuft.
      var usrPct  = cap > 0 ? Math.min(100, used / cap * 100) : 0;
      var progPct = cap > 0 ? Math.min(100 - usrPct, prog / cap * 100) : 0;
      var modPct  = cap > 0 ? Math.min(100 - usrPct - progPct, modCap / cap * 100) : 0;
      if (refs.serverSeg)      refs.serverSeg.style.width      = usrPct.toFixed(2) + '%';
      if (refs.serverSegSw)    refs.serverSegSw.style.width    = progPct.toFixed(2) + '%';
      if (refs.serverSegModel) refs.serverSegModel.style.width = modPct.toFixed(2) + '%';
      if (refs.serverCard) {
        var totalPct = usrPct + progPct + modPct;
        refs.serverCard.classList.toggle('rt-resource--critical', cap > 0 && totalPct >= 95);
      }
      if (refs.moneyCard) refs.moneyCard.classList.toggle('rt-resource--money-negative', money < 0);

      // Tarifstufe der Serverkosten — erst ab Phase 2, davor gibt es keine
      // Watchtime-Ökonomie und damit auch nichts zu bezahlen. Sie leuchtet auf,
      // solange irgendwo Serverprobleme anliegen.
      if (refs.srvTier) {
        var phaseSrv = RT.state.currentPhase ? RT.state.currentPhase() : 2;
        if (phaseSrv >= 2 && cap > 0) {
          var srvT = RT.state.serverUpkeepTier();
          refs.srvTier.style.display = '';
          // ⚠️ Kein innerHTML mit dem Icon: dieser Block läuft bei jedem
          // state:changed, und ein jedes Mal neu gebautes <img> flackerte auf
          // iPads sichtbar. Icon steht fest im Markup, hier wandert nur der
          // Name der Tarifstufe ins Label.
          if (refs.srvTierLabel && refs.srvTierLabel.textContent !== srvT.name) {
            refs.srvTierLabel.textContent = srvT.name;
          }
          refs.srvTier.title         = 'Serverkosten: ' + srvT.name + ' — '
                                     + srvT.rate + ' € je ' + formatNumber(RT.state.serverUpkeepUnit())
                                     + ' Kapazität. Antippen für die Stufen.';
          refs.srvTier.classList.toggle('is-trouble', RT.state.serverTrouble());
        } else {
          refs.srvTier.style.display = 'none';
        }
      }

      // Phase-abhängig: Watchtime + Trend-Karten erst ab Phase 2, Flyerbonus
      // nur solange aktiv. Vor Phase 2 ist die Bar 3-spaltig (Geld/User/Server),
      // damit die drei sichtbaren Kacheln zentriert füllen.
      var phase = RT.state.currentPhase ? RT.state.currentPhase() : 2;
      if (refs.watchtimeCard) refs.watchtimeCard.style.display = phase >= 2 ? '' : 'none';
      if (refs.wtMult) {
        var wm = RT.state.watchtimeMult();
        if (phase >= 2 && wm > 1) {
          refs.wtMult.style.display = '';
          refs.wtMult.textContent = '×' + wm.toFixed(2).replace('.', ',');
        } else {
          refs.wtMult.style.display = 'none';
        }
      }
      if (refs.trendCard)     refs.trendCard.style.display     = phase >= 2 ? '' : 'none';
      // Modelle + Metadaten erst ab Phase 3. Vorher sind es zwei Nullen, die
      // nichts erklären und nur die Kette in der Mitte auseinanderziehen.
      if (refs.modelsCard)    refs.modelsCard.style.display    = phase >= 3 ? '' : 'none';
      if (refs.metaCard)      refs.metaCard.style.display      = phase >= 3 ? '' : 'none';
      // (Die frühere --compact-Klasse ist weg: die Bar liegt jetzt im Flex und
      // verteilt die je nach Phase sichtbaren Kacheln von allein.)
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
    if (refs.wtMult) {
      refs.wtMult.addEventListener('click', function () { RT.ui.openWatchtimeInfo(); });
    }
    if (refs.helpBtn) {
      // start() statt startIfNew() — hier ist die Wiederholung gewollt.
      refs.helpBtn.addEventListener('click', function () { RT.tour.start(); });
    }
    if (refs.evBtn) {
      refs.evBtn.addEventListener('click', function () { RT.events.open(); });
    }

    // ── Ereigniskarten: Knopf-Countdown und Krisen-Leiste ───────────────
    // Beide zeigen dasselbe aus zwei Entfernungen: der Knopf sagt „wann",
    // die Leiste sagt „was gerade an dir zerrt". Ohne die Leiste stünden
    // die Mali ausschließlich in einem Modal, das man aufmachen muss —
    // und ein Malus, den man nicht sieht, ist keine Rückmeldung.
    function refreshEvents() {
      if (!refs.evBtn || !RT.events) return;
      var on = RT.events.active();
      refs.evBtn.style.display = on ? '' : 'none';
      if (refs.evStrip && !on) { refs.evStrip.innerHTML = ''; return; }
      if (!on) return;

      var due = RT.events.pending();
      refs.evBtn.classList.toggle('is-due', due);
      if (refs.evClock) {
        var sec = RT.events.secondsLeft();
        refs.evClock.textContent = due
          ? 'zieh!'
          : Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
      }
      var lying = RT.events.lying();
      if (refs.evCrises) {
        refs.evCrises.style.display = lying.length ? '' : 'none';
        refs.evCrises.textContent   = lying.length;
      }
      if (refs.evStrip) refs.evStrip.innerHTML = eventStripHtml();
    }

    // Die Leiste selbst. Sie führt nur auf, was JETZT wirkt — dauerhafte
    // Posten stehen im Trend- bzw. Watchtime-Modal, wo sie hingehören.
    function eventStripHtml() {
      var st = RT.events.state(), out = '', now = Date.now();
      var lying = RT.events.lying();
      for (var i = 0; i < lying.length; i++) {
        var def  = RT.events.CARDS[lying[i].id];
        var rest = def.runden - lying[i].alter;
        var val  = (def.liegt || lying[i].zusatz)
          ? '⭐ ' + RT.ledger.fmt.trend((def.liegt || 0) + (lying[i].zusatz || 0))
          : (def.liegtTxt || '');
        out += '<span class="rt-ev-strip__item" data-ev-open="1">'
             + def.icon + ' ' + escapeHTML(def.name)
             + ' <b class="rt-ev-strip__val">' + val + '</b>'
             + ' <span class="rt-ev-strip__note">noch ' + rest + '×</span></span>';
      }
      if (now < (st.adMalusUntil || 0)) {
        out += '<span class="rt-ev-strip__item" data-ev-open="1">📉 Preiskampf'
             + ' <b class="rt-ev-strip__val">Werbung −40 %</b>'
             + ' <span class="rt-ev-strip__note">noch '
             + Math.ceil((st.adMalusUntil - now) / 60000) + ' min</span></span>';
      }
      if (now < (st.prSlotUntil || 0)) {
        out += '<span class="rt-ev-strip__item is-good" data-ev-open="1">📣 Hilfsorganisation'
             + ' <b class="rt-ev-strip__val">+1 Kampagnenplatz</b>'
             + ' <span class="rt-ev-strip__note">noch '
             + Math.ceil((st.prSlotUntil - now) / 60000) + ' min</span></span>';
      }
      return out;
    }

    if (refs.evStrip) {
      refs.evStrip.addEventListener('click', function (e) {
        if (e.target.closest('[data-ev-open]')) RT.events.open();
      });
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
    refreshEvents();
    drawSparks();

    function onState() { refresh(); refreshTrend(); refreshEvents(); }
    RT.bus.on('state:changed', onState);
    // Der Sekundentakt der Karten-Uhr (js/events.js) — nur dafür da, den
    // Countdown auf dem Knopf laufen zu lassen.
    RT.bus.on('events:clock', refreshEvents);

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
      RT.bus.off('events:clock', refreshEvents);
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

