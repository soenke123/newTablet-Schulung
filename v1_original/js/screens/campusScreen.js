/* campus — Haupt-Screen nach dem Investor-Event.
   2×3 Plot-Grid: Slot 0 = HQ (fest), Slots 1–5 = kaufbare Gebäude.
   Gebäude werden im Shop gekauft → Platzier-Mode → Klick auf freien Slot.
   HQ zeigt wie Garage: Fortschrittsbalken für laufende Entwicklungen + Feier-Modal. */
(function (RT) {
  'use strict';

  // GRID_SLOTS wird in renderGrid() dynamisch aus dem Phase-State ermittelt.

  var _unsubResources       = null;
  var _offGrid              = null;
  var _offTick              = null;
  var _offComplete          = null;
  var _offTabSeen           = null;
  var _offCampaigns         = null;
  var _offMonthAdv          = null;
  var _offUserCheck         = null;
  var _offBankrupt          = null;
  var _marcus500kTriggered  = false;
  var _clockProg            = 0;

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────────
  function buildingAtSlot(buildings, slot) {
    for (var i = 0; i < buildings.length; i++) {
      if (buildings[i].slot === slot) return buildings[i];
    }
    return null;
  }

  // Gibt alle laufenden Nodes eines bestimmten Gebäude-Grid-Slots zurück.
  function getNodesForBuilding(buildingGridSlot) {
    var tt     = RT.state.get().techtree || {};
    var result = [];
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (entry && typeof entry === 'object' && entry.status === 'in_progress') {
        var bgs = entry.buildingGridSlot !== undefined ? entry.buildingGridSlot : 0;
        if (bgs === buildingGridSlot) {
          result.push({ nodeId: nid, entry: entry, workSlotIndex: entry.workSlotIndex || 0 });
        }
      }
    }
    return result;
  }

  // Gibt alle laufenden Kampagnen eines bestimmten Gebäude-Grid-Slots zurück.
  function getCampaignsForBuilding(buildingGridSlot) {
    var camps  = RT.state.get().campaigns || [];
    var result = [];
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      if (c.phase === 'running' && c.buildingGridSlot === buildingGridSlot) {
        result.push(c);
      }
    }
    return result;
  }

  // Gibt Definition aus RT.marketing.CAMPAIGNS, RT.werbeagentur.DEALS oder RT.communitycenter.CC_ACTIONS zurück.
  function getCampaignDef(type) {
    var list = RT.marketing ? RT.marketing.CAMPAIGNS : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === type) return list[i];
    }
    var deals = RT.werbeagentur ? RT.werbeagentur.DEALS : [];
    for (var j = 0; j < deals.length; j++) {
      if (deals[j].id === type) return deals[j];
    }
    var ccActions = RT.communitycenter ? (RT.communitycenter.CC_ACTIONS || []) : [];
    for (var k = 0; k < ccActions.length; k++) {
      if (ccActions[k].id === type) return ccActions[k];
    }
    return null;
  }

  function isCCAction(type) {
    var ccActions = RT.communitycenter ? (RT.communitycenter.CC_ACTIONS || []) : [];
    for (var i = 0; i < ccActions.length; i++) {
      if (ccActions[i].id === type) return true;
    }
    return false;
  }

  function sfTileName(sl) {
    if (sl >= 2) return 'Rechenzentrum';
    if (sl >= 1) return 'Serverfarm';
    return 'Kleine Serverfarm';
  }

  function sfTileSprite(sl) {
    if (sl >= 2) return 'sprites/buildings/Serverfarm2.png';
    if (sl >= 1) return 'sprites/buildings/Serverfarm1.png';
    return RT.assets.buildingSrc('serverfarm', 0);
  }

  function sfTileBadge(sl, et) {
    if (sl >= 2) {
      var badges2 = ['50k · 0€/Mo', '300k · 2k€/Mo', '800k · 5k€/Mo', '2M · 10k€/Mo', '10M · 40k€/Mo', '100M · 300k€/Mo'];
      return '🚀 ' + (badges2[et + 2] || badges2[2]);
    }
    if (sl >= 1 && et >= 1) return '⚡ 300k · 2k€/Mo';
    return '🛰️ 50k';
  }

  function isWerbeDeal(type) {
    var deals = RT.werbeagentur ? (RT.werbeagentur.AD_TYPES || RT.werbeagentur.DEALS || []) : [];
    for (var i = 0; i < deals.length; i++) {
      if (deals[i].id === type) return true;
    }
    // backward compat: interstitial wurde entfernt aber kann in alten Saves noch auftauchen
    if (type === 'interstitial') return true;
    return false;
  }

  // ── HQ-Fortschrittsbalken (2 Slots, gleiche Struktur wie Bürogebäude) ────────
  function updateHqProgress() {
    var s          = RT.state.get();
    var slotNodes  = getNodesForBuilding(0);
    var byWSlot    = {};
    for (var ni = 0; ni < slotNodes.length; ni++) {
      byWSlot[slotNodes[ni].workSlotIndex] = slotNodes[ni];
    }
    var campsByWSlot = {};
    var hqCamps = getCampaignsForBuilding(0);
    for (var sci = 0; sci < hqCamps.length; sci++) {
      campsByWSlot[hqCamps[sci].workSlotIndex || 0] = hqCamps[sci];
    }
    var pcs          = s.pendingCelebrations || [];
    var celebByWSlot = {};
    for (var ci = 0; ci < pcs.length; ci++) {
      var c = pcs[ci];
      if ((typeof c === 'object' ? c.buildingGridSlot : 0) === 0) {
        celebByWSlot[typeof c === 'object' ? (c.workSlotIndex || 0) : 0] = c;
      }
    }

    for (var wi = 0; wi < 2; wi++) {
      var wrap = document.getElementById('rt-bld-w-0-' + wi);
      var bar  = document.getElementById('rt-bld-b-0-' + wi);
      var lbl  = document.getElementById('rt-bld-l-0-' + wi);
      var name = document.getElementById('rt-bld-n-0-' + wi);
      var icon = document.getElementById('rt-bld-i-0-' + wi);
      if (!wrap || !bar) continue;
      // Slot-spezifische Inline-Styles aus vorigen Durchläufen zurücksetzen
      wrap.style.pointerEvents = '';
      wrap.style.cursor = '';

      var inProg = byWSlot[wi];
      if (!inProg) {
        if (celebByWSlot[wi]) {
          var celebIsCampaign  = typeof celebByWSlot[wi] === 'object' && celebByWSlot[wi].kind === 'campaign';
          var celebIsMetadaten = typeof celebByWSlot[wi] === 'object' && celebByWSlot[wi].nodeId === 'metadaten';
          var metaWarn = false;
          if (celebIsMetadaten) {
            var mr = s.resources;
            metaWarn = ((mr.serverSoftwareUsage || 0) + (mr.serverUsage || 0) * 2) > (mr.serverCapacity || 0);
          }
          wrap.classList.remove('rt-bld-slot-wrap--idle');
          wrap.classList.add('rt-bld-slot-wrap--done');
          wrap.classList.remove('rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
          if (metaWarn) {
            wrap.classList.add('rt-bld-slot-wrap--metawarn');
          } else {
            wrap.classList.remove('rt-bld-slot-wrap--metawarn');
          }
          if (celebIsCampaign) {
            var celebType = celebByWSlot[wi].campaignType;
            wrap.classList.add(isWerbeDeal(celebType) ? 'rt-bld-slot-wrap--werbung'
              : isCCAction(celebType) ? 'rt-bld-slot-wrap--support'
              : 'rt-bld-slot-wrap--marketing');
          }
          if (icon) icon.innerHTML = '';
          if (name) name.textContent = '';
          bar.style.width = '100%';
          if (lbl) lbl.textContent = metaWarn ? '⚠️ Klicken!' : '🎉 Klicken!';
        } else if (campsByWSlot[wi]) {
          var campDef = getCampaignDef(campsByWSlot[wi].type);
          if (campDef) {
            var campElapsed = Math.max(0, (s.month + _clockProg) - campsByWSlot[wi].startMonthFull);
            var campProg    = Math.min(1, campElapsed / campDef.duration);
            var campColor   = isWerbeDeal(campsByWSlot[wi].type) ? 'rt-bld-slot-wrap--werbung'
              : isCCAction(campsByWSlot[wi].type) ? 'rt-bld-slot-wrap--support'
              : 'rt-bld-slot-wrap--marketing';
            wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
            wrap.classList.add(campColor);
            if (icon) icon.innerHTML = campDef.icon || '';
            if (name) name.textContent = campDef.name;
            bar.style.width = (campProg * 100).toFixed(1) + '%';
            if (lbl) lbl.textContent = campProg >= 1 ? 'Gleich fertig!' : Math.round(campProg * 100) + '%';
          }
        } else if (s.supportProgram && s.supportProgram.active
                   && s.supportProgram.buildingGridSlot === 0
                   && s.supportProgram.workSlotIndex === wi) {
          wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
          wrap.classList.add('rt-bld-slot-wrap--support');
          if (icon) icon.innerHTML = '🎧';
          if (name) name.textContent = 'User-Support';
          bar.style.width = '100%';
          if (lbl) lbl.textContent = 'Aktiv';
        } else {
          wrap.classList.add('rt-bld-slot-wrap--idle');
          wrap.classList.remove('rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
          if (icon) icon.innerHTML = '';
          if (name) name.textContent = '';
          bar.style.width = '0%';
          if (lbl) lbl.textContent = '';
        }
        continue;
      }

      var node = RT.techtree.getNode(inProg.nodeId);
      if (!node) {
        wrap.classList.add('rt-bld-slot-wrap--idle');
        wrap.classList.remove('rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
        continue;
      }
      var elapsed = Math.max(0, (s.month + _clockProg) - inProg.entry.startMonthFull);
      var prog    = Math.min(1, elapsed / node.months);
      wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
      if (icon) icon.innerHTML = node.icon || '';
      if (name) name.textContent = node.name;
      bar.style.width = (prog * 100).toFixed(1) + '%';
      if (lbl) lbl.textContent = prog >= 1 ? 'Gleich fertig!' : Math.round(prog * 100) + '%';
    }

    // Metadaten-Badge: ausstehende Aktivierung im originalen Slot anzeigen (Worker frei, Slot belegt)
    if (s.metadatenPendingActivation && !s.metadatenActive) {
      var mSlot = s.metadatenWorkSlot || 0;
      var mWrap = document.getElementById('rt-bld-w-0-' + mSlot);
      var mBar  = document.getElementById('rt-bld-b-0-' + mSlot);
      var mIcon = document.getElementById('rt-bld-i-0-' + mSlot);
      var mName = document.getElementById('rt-bld-n-0-' + mSlot);
      var mLbl  = document.getElementById('rt-bld-l-0-' + mSlot);
      if (mWrap && mBar) {
        var mr2    = s.resources;
        var canAct = ((mr2.serverSoftwareUsage || 0) + (mr2.serverUsage || 0) * 2) <= (mr2.serverCapacity || 0);
        mWrap.className = 'rt-bld-slot-wrap ' + (canAct ? 'rt-bld-slot-wrap--done' : 'rt-bld-slot-wrap--metawarn');
        mWrap.style.pointerEvents = 'auto';
        mWrap.style.cursor = 'pointer';
        if (mIcon) mIcon.innerHTML = '🗄️';
        if (mName) mName.textContent = 'Metadatenspeicherung';
        mBar.style.width = '100%';
        if (mLbl)  mLbl.textContent = canAct ? 'Jetzt aktivieren' : 'Warte auf Server';
      }
    }
  }

  // ── Büro-Fortschrittsbalken ───────────────────────────────────────────────────
  function buildingProgressHTML(gridSlot) {
    var html = '<div class="rt-bld-slots" id="rt-bld-g-' + gridSlot + '">';
    for (var i = 0; i < 2; i++) {
      html += '<div class="rt-bld-slot-wrap rt-bld-slot-wrap--idle" id="rt-bld-w-' + gridSlot + '-' + i + '">'
        + '<span class="rt-bld-slot-icon" id="rt-bld-i-' + gridSlot + '-' + i + '"></span>'
        + '<div class="rt-bld-slot-right">'
        + '<span class="rt-bld-slot-name" id="rt-bld-n-' + gridSlot + '-' + i + '"></span>'
        + '<div class="rt-bld-slot-track"><div class="rt-bld-slot-bar" id="rt-bld-b-' + gridSlot + '-' + i + '"></div></div>'
        + '<span class="rt-bld-slot-lbl" id="rt-bld-l-' + gridSlot + '-' + i + '"></span>'
        + '</div>'
        + '</div>';
    }
    return html + '</div>';
  }

  function updateBueroProgress() {
    var s         = RT.state.get();
    var buildings = s.buildings || [];
    for (var bi = 0; bi < buildings.length; bi++) {
      var bldg = buildings[bi];
      if (bldg.type !== 'buero') continue;
      var gridSlot  = bldg.slot;
      var slotNodes = getNodesForBuilding(gridSlot);
      var byWSlot   = {};
      for (var ni = 0; ni < slotNodes.length; ni++) {
        byWSlot[slotNodes[ni].workSlotIndex] = slotNodes[ni];
      }
      // Kampagnen für dieses Gebäude: workSlotIndex → Kampagne
      var campsByWSlot = {};
      var slotCamps = getCampaignsForBuilding(gridSlot);
      for (var sci = 0; sci < slotCamps.length; sci++) {
        campsByWSlot[slotCamps[sci].workSlotIndex || 0] = slotCamps[sci];
      }
      // Pending celebrations für dieses Gebäude: workSlotIndex → Eintrag
      var pcs           = s.pendingCelebrations || [];
      var celebByWSlot  = {};
      for (var ci = 0; ci < pcs.length; ci++) {
        var c = pcs[ci];
        if ((typeof c === 'object' ? c.buildingGridSlot : 0) === gridSlot) {
          celebByWSlot[typeof c === 'object' ? (c.workSlotIndex || 0) : 0] = c;
        }
      }
      for (var wi = 0; wi < 2; wi++) {
        var wrap = document.getElementById('rt-bld-w-' + gridSlot + '-' + wi);
        var bar  = document.getElementById('rt-bld-b-' + gridSlot + '-' + wi);
        var lbl  = document.getElementById('rt-bld-l-' + gridSlot + '-' + wi);
        var name = document.getElementById('rt-bld-n-' + gridSlot + '-' + wi);
        var icon = document.getElementById('rt-bld-i-' + gridSlot + '-' + wi);
        if (!wrap || !bar) continue;
        var inProg = byWSlot[wi];
        if (!inProg) {
          if (celebByWSlot[wi]) {
            var celebIsCampaign = typeof celebByWSlot[wi] === 'object' && celebByWSlot[wi].kind === 'campaign';
            wrap.classList.remove('rt-bld-slot-wrap--idle');
            wrap.classList.add('rt-bld-slot-wrap--done');
            wrap.classList.remove('rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
            if (celebIsCampaign) {
              var celebType = celebByWSlot[wi].campaignType;
              wrap.classList.add(isWerbeDeal(celebType) ? 'rt-bld-slot-wrap--werbung'
                : isCCAction(celebType) ? 'rt-bld-slot-wrap--support'
                : 'rt-bld-slot-wrap--marketing');
            }
            if (icon) icon.innerHTML = '';
            if (name) name.textContent = '';
            bar.style.width = '100%';
            if (lbl) lbl.textContent = '🎉 Klicken!';
          } else if (campsByWSlot[wi]) {
            // Laufende Kampagne/Deal auf diesem Slot — Farbe je nach Typ
            var campDef = getCampaignDef(campsByWSlot[wi].type);
            if (campDef) {
              var campElapsed = Math.max(0, (s.month + _clockProg) - campsByWSlot[wi].startMonthFull);
              var campProg    = Math.min(1, campElapsed / campDef.duration);
              var campColor   = isWerbeDeal(campsByWSlot[wi].type) ? 'rt-bld-slot-wrap--werbung'
                : isCCAction(campsByWSlot[wi].type) ? 'rt-bld-slot-wrap--support'
                : 'rt-bld-slot-wrap--marketing';
              wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
              wrap.classList.add(campColor);
              if (icon) icon.innerHTML = campDef.icon || '';
              if (name) name.textContent = campDef.name;
              bar.style.width = (campProg * 100).toFixed(1) + '%';
              if (lbl) lbl.textContent = campProg >= 1 ? 'Fertig!' : Math.round(campProg * 100) + '%';
            }
          } else if (s.supportProgram && s.supportProgram.active
                     && s.supportProgram.buildingGridSlot === gridSlot
                     && s.supportProgram.workSlotIndex === wi) {
            wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
            wrap.classList.add('rt-bld-slot-wrap--support');
            if (icon) icon.innerHTML = '🎧';
            if (name) name.textContent = 'User-Support';
            bar.style.width = '100%';
            if (lbl) lbl.textContent = 'Aktiv';
          } else {
            wrap.classList.add('rt-bld-slot-wrap--idle');
            wrap.classList.remove('rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
            if (icon) icon.innerHTML = '';
            if (name) name.textContent = '';
            bar.style.width = '0%';
            if (lbl) lbl.textContent = '';
          }
          continue;
        }
        var node = RT.techtree.getNode(inProg.nodeId);
        if (!node) {
          wrap.classList.add('rt-bld-slot-wrap--idle');
          wrap.classList.remove('rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung', 'rt-bld-slot-wrap--support');
          continue;
        }
        var elapsed = Math.max(0, (s.month + _clockProg) - inProg.entry.startMonthFull);
        var prog    = Math.min(1, elapsed / node.months);
        wrap.classList.remove('rt-bld-slot-wrap--idle', 'rt-bld-slot-wrap--done', 'rt-bld-slot-wrap--marketing', 'rt-bld-slot-wrap--werbung');
        if (icon) icon.innerHTML = node.icon || '';
        if (name) name.textContent = node.name;
        bar.style.width = (prog * 100).toFixed(1) + '%';
        if (lbl) lbl.textContent = prog >= 1 ? 'Fertig!' : Math.round(prog * 100) + '%';
      }
    }
  }

  // ── HQ-Badge (neue Techtree-Tabs) ───────────────────────────────────────────
  function updateHqBadge() {
    var badge = document.getElementById('rt-hq-new-badge');
    if (!badge) return;
    var s = RT.state.get();
    var hasNew = s.goLiveUnlocked
      && (!(s.meta && s.meta.seenTabMarketing) || !(s.meta && s.meta.seenTabWerbung));
    badge.style.display = hasNew ? '' : 'none';
  }

  // ── Konfetti ─────────────────────────────────────────────────────────────────
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

  // ── Marcus-Bär-Rückkehr bei 500k User ────────────────────────────────────────
  function showMarcusDealModal() {
    var s        = RT.state.get();
    var name     = RT.ui.escapeHTML(s.player.name || 'du');
    var balance  = Math.floor(s.resources.money || 0);
    var cut      = Math.floor(balance * 0.15);
    var keep     = balance - cut;

    var profitHTML =
      '<div style="background:rgba(74,56,41,0.06);border:2px solid rgba(74,56,41,0.25);border-radius:12px;padding:.75rem 1rem;margin:.6rem 0;">'
        + '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:.83rem;padding:.2rem 0;">'
        + '<span>Dein Kontostand</span><span>€ ' + balance.toLocaleString('de-DE') + '</span>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;font-weight:700;font-size:.83rem;padding:.2rem 0;border-top:1px dashed rgba(74,56,41,0.2);color:#c0392b;">'
        + '<span>🐻 Marcus\' Anteil (15 %)</span><span>− € ' + cut.toLocaleString('de-DE') + '</span>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;font-weight:800;font-size:.86rem;padding:.25rem 0;border-top:2px solid rgba(74,56,41,0.3);">'
        + '<span>Bleibt bei dir</span><span>€ ' + keep.toLocaleString('de-DE') + '</span>'
        + '</div>'
      + '</div>';

    spawnConfetti();
    RT.clock.pause();

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-investor-modal">'
      + '  <div id="rt-marcus2-p1">'
      + '    <img class="rt-investor-modal__bear" src="sprites/Investor.png" alt="Marcus B&auml;r">'
      + '    <h2 class="rt-investor-modal__headline">500k &mdash; das haben wir geschafft, ' + name + '! 🐻</h2>'
      + '    <p class="rt-investor-modal__quote">'
      + '      &bdquo;Ich bin stolz auf dich. Wirklich. 500.000 Menschen nutzen deine Plattform'
      + '      &mdash; das ist keine Kleinigkeit. Ich habe Kontakte, die ich f&uuml;r dich einsetzen'
      + '      kann. Creators, Netzwerke, Reichweite. Wir stehen erst am Anfang.&ldquo;'
      + '    </p>'
      + '    <p class="rt-investor-modal__sig">&mdash; Marcus B&auml;r, Investor</p>'
      + '    <div class="rt-modal__actions">'
      + '      <button class="rt-btn rt-btn--primary rt-btn--lg" id="rt-marcus2-next">Was erwartest du daf&uuml;r? &rarr;</button>'
      + '    </div>'
      + '  </div>'
      + '  <div id="rt-marcus2-p2" style="display:none">'
      + '    <div class="rt-investor-modal__body">'
      + '      <img class="rt-investor-modal__bear rt-investor-modal__bear--sm" src="sprites/Investor.png" alt="Marcus B&auml;r">'
      + '      <div class="rt-investor-modal__right">'
      + '        <p class="rt-investor-modal__truth">'
      + '          &bdquo;Ich habe uns etwas Land besorgt, das du nutzen k&ouml;nntest. Und meine'
      + '          Kontakte bringen neue Technologien mit &mdash; deine Plattform ist bereit'
      + '          f&uuml;r das n&auml;chste Level.&ldquo;'
      + '        </p>'
      + '        <div class="rt-investor-modal__deal">'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--win">'
      + '            <span>🔬 Neue Technologien</span>'
      + '            <span><strong>freigeschaltet</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--win">'
      + '            <span>⬆️ HQ-Upgrade</span>'
      + '            <span><strong>gr&ouml;&szlig;eres Geb&auml;ude</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--win">'
      + '            <span>🗺️ Mehr Land</span>'
      + '            <span><strong>campus w&auml;chst</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--cost">'
      + '            <span>💸 Einmalig jetzt</span>'
      + '            <span><strong>15 % des Kontostandes</strong></span>'
      + '          </div>'
      + '          <div class="rt-investor-modal__deal-row rt-investor-modal__deal-row--cost">'
      + '            <span>📅 Ab sofort monatl.</span>'
      + '            <span><strong>15 % des Gewinns</strong></span>'
      + '          </div>'
      + '        </div>'
      + profitHTML
      + '        <p class="rt-investor-modal__whisper">'
      + '          &bdquo;Wir hatten das besprochen, erinnerst du dich? Jetzt sind wir gro&szlig;'
      + '          genug. Ich verdiene nur, wenn du verdienst &mdash; und ich glaube daran,'
      + '          dass du noch sehr viel verdienen wirst.&ldquo;'
      + '        </p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="rt-modal__actions">'
      + '      <button class="rt-btn rt-btn--lg" id="rt-marcus2-confirm">Einverstanden</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-marcus2-next').addEventListener('click', function () {
      document.getElementById('rt-marcus2-p1').style.display = 'none';
      document.getElementById('rt-marcus2-p2').style.display = '';
    });

    modal.querySelector('#rt-marcus2-confirm').addEventListener('click', function () {
      if (cut > 0) RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -cut, label: 'marcus' });
      RT.state.dispatch('MARCUS_DEAL_ACCEPT');
      RT.state.dispatch('SET_PHASE', { phase: 'expansion' });
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      RT.clock.stop();
      RT.screens.show('expansion');
    });
  }

  // ── Metadaten-Aktivierungsmodal ───────────────────────────────────────────────
  function showMetadatenModal() {
    var s        = RT.state.get();
    var r        = s.resources;
    var swUsage  = r.serverSoftwareUsage || 0;
    var usrUsage = r.serverUsage         || 0;
    var cap      = r.serverCapacity      || 0;
    var canActivate = (swUsage + usrUsage * 2) <= cap;

    if (canActivate) spawnConfetti();

    var actionHTML;
    if (canActivate) {
      actionHTML = '<button class="rt-btn rt-btn--primary" id="rt-metadaten-ok">Aktivieren</button>'
        + '<button class="rt-btn rt-btn--ghost" id="rt-metadaten-skip">Sp&auml;ter</button>';
    } else {
      actionHTML = '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">Aktivieren</button>'
        + '<p style="margin-top:6px;font-size:0.82rem;color:#c0392b;font-weight:600;">Serverkapazit&auml;t nicht ausreichend</p>'
        + '<button class="rt-btn rt-btn--ghost" id="rt-metadaten-skip">Sp&auml;ter</button>';
    }

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-celebration-modal">'
      + '  <div class="rt-celebration-icon">&#128451;</div>'
      + '  <h2 class="rt-celebration-title">Forschung abgeschlossen!</h2>'
      + '  <p class="rt-celebration-name">Metadatenspeicherung bereit</p>'
      + '  <p class="rt-celebration-fx">'
      + '    Ab Aktivierung verbraucht jeder User 2 Servereinheiten statt 1.<br>'
      + '    Bedarf nach Aktivierung: <strong>'
      + (swUsage + usrUsage * 2).toLocaleString('de-DE')
      + '</strong> / ' + cap.toLocaleString('de-DE')
      + '  </p>'
      + '  <div class="rt-modal__actions">' + actionHTML + '</div>'
      + '</div>';

    document.body.appendChild(modal);

    var okBtn = modal.querySelector('#rt-metadaten-ok');
    if (okBtn) {
      okBtn.addEventListener('click', function () {
        RT.state.dispatch('ACTIVATE_METADATEN');

        // Watchtime startet fix bei 0,5 Std./Tag (= kleiner Schritt aus der Werbekrise ×0,4 heraus).
        // KI-Labor-Nodes in der Expansionsphase steigern den Wert von hier aus weiter.
        RT.state.dispatch('SET_WATCHTIME', { value: 0.5 });

        RT.state.dispatch('CELEBRATE_NODE', { nodeId: 'metadaten' });
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        updateHqProgress();
        updateBueroProgress();
        showWatchtimeInfoModal();
      });
    }
    modal.querySelector('#rt-metadaten-skip').addEventListener('click', function () {
      // Nur beim ersten "Später" (pendingCelebration noch vorhanden): Worker freigeben + Slot merken.
      // Bei erneutem Öffnen via Badge-Klick gibt es keinen pendingCelebration-Eintrag mehr.
      var pcs2 = RT.state.get().pendingCelebrations || [];
      for (var pi = 0; pi < pcs2.length; pi++) {
        var pc = pcs2[pi];
        if (typeof pc === 'object' && pc.nodeId === 'metadaten') {
          RT.state.dispatch('CELEBRATE_NODE', { nodeId: 'metadaten' });
          RT.state.dispatch('SET_METADATEN_PENDING', { slot: pc.workSlotIndex || 0 });
          break;
        }
      }
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      updateHqProgress();
      updateBueroProgress();
    });
  }

  // ── Watchtime-Info-Modal ─────────────────────────────────────────────────────
  function showWatchtimeInfoModal() {
    var isFirstTime = !RT.state.get().meta.seenWatchtimeInfo;
    var wt    = RT.state.get().watchtime || 0;
    var wtFmt = (Math.round(wt * 10) / 10).toFixed(1).replace('.', ',');

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-celebration-modal">'
      + '  <div class="rt-celebration-icon">⏱️</div>'
      + '  <h2 class="rt-celebration-title">' + (isFirstTime ? 'Watchtime freigeschaltet!' : 'Watchtime') + '</h2>'
      + '  <p class="rt-celebration-fx">'
      + '    Watchtime zeigt, wie viele Stunden deine User durchschnittlich die Plattform täglich nutzen.<br><br>'
      + '    <strong>Aktuell: Ø ' + wtFmt + ' Std./Tag</strong><br><br>'
      + '    Mehr Watchtime = mehr Werbeeinnahmen.<br><br>'
      + '    Die Watchtime kannst du durch neue Features im Tech Tree freischalten:<br>'
      + '    <em>z.B.: Infiniter Scroll, Push, Stories, Autoplay, Live-Streaming</em><br><br>'
      + '    Aber auch andere Aspekte werden die Watchtime beeinflussen.'
      + '  </p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary" id="rt-wt-info-ok">Verstanden</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-wt-info-ok').addEventListener('click', function () {
      RT.state.dispatch('MARK_WATCHTIME_INFO_SEEN');
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      if (isFirstTime) flashWatchtimeDisplay();
    });
  }

  function flashWatchtimeDisplay() {
    var el = document.getElementById('rt-res-watchtime');
    if (!el) return;
    el.classList.add('rt-res--flash');
    setTimeout(function () { el.classList.remove('rt-res--flash'); }, 2000);
  }

  // ── Feier-Modal ──────────────────────────────────────────────────────────────
  function showCelebration(nodeId) {
    var node = RT.techtree.getNode(nodeId);
    if (!node) {
      RT.state.dispatch('CELEBRATE_NODE', { nodeId: nodeId });
      updateHqProgress();
      return;
    }

    if (nodeId === 'metadaten') { showMetadatenModal(); return; }

    // Boni sofort beim "Klicken!"-Tap vergeben — bevor das Modal aufgeht.
    if (node.usersBonus)      RT.state.dispatch('ADD_RESOURCE',    { key: 'users', delta: node.usersBonus      });
    if (node.moneyBonus)      RT.state.dispatch('ADD_RESOURCE',    { key: 'money', delta: node.moneyBonus      });
    if (node.growthBonus)     RT.state.dispatch('ADD_GROWTH_RATE', { delta: node.growthBonus     });
    if (node.rufBonus)        RT.state.dispatch('ADD_REPUTATION',  { delta: node.rufBonus        });
    if (node.marketExpansion) RT.state.dispatch('UNLOCK_MARKET',   { market: node.marketExpansion });

    // Watchtime: Node-eigener watchtimeBonus (Phase-2-Features) — nur wenn Metadaten aktiv.
    if (node.watchtimeBonus && RT.state.get().metadatenActive) {
      RT.state.dispatch('ADD_WATCHTIME', { delta: node.watchtimeBonus });
    }

    // Watchtime: statische Beiträge bestimmter Features addieren (nur wenn Metadaten bereits aktiv).
    // Features die VOR Metadaten abgeschlossen wurden, werden bei der Aktivierung berücksichtigt.
    var wtDeltas = { videos: 0.8, gruppen: 0.2, dm: 0.15 };
    if (wtDeltas[nodeId] !== undefined && RT.state.get().metadatenActive) {
      RT.state.dispatch('ADD_WATCHTIME', { delta: wtDeltas[nodeId] });
    }

    spawnConfetti();

    // Logo Redesign: altes und neues Logo nebeneinander zeigen
    var extraHTML = '';
    if (nodeId === 'logoNeu') {
      var logoId   = RT.state.get().player.platformLogo;
      var logoData = RT.assets.LOGOS[logoId];
      if (logoData) {
        var oldSrc = 'sprites/Firmen%20logos/' + encodeURI(logoData.file);
        var newSrc = 'sprites/Firmen%20logos/' + encodeURI(logoData.niceFile);
        extraHTML = '<div class="rt-celebration-logo-compare">'
          + '<div class="rt-celebration-logo-item">'
          + '  <img class="rt-celebration-logo-img" src="' + oldSrc + '" alt="Altes Logo">'
          + '  <span class="rt-celebration-logo-label">Vorher</span>'
          + '</div>'
          + '<div class="rt-celebration-logo-arrow">→</div>'
          + '<div class="rt-celebration-logo-item">'
          + '  <img class="rt-celebration-logo-img" src="' + newSrc + '" alt="Neues Logo">'
          + '  <span class="rt-celebration-logo-label">Nachher ✨</span>'
          + '</div>'
          + '</div>';
      }
    }

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal rt-celebration-modal">'
      + '  <div class="rt-celebration-icon">' + node.icon + '</div>'
      + '  <h2 class="rt-celebration-title">🎉 Geschafft!</h2>'
      + '  <p class="rt-celebration-name">' + RT.ui.escapeHTML(node.name) + ' entwickelt!</p>'
      + '  <p class="rt-celebration-fx">' + RT.ui.escapeHTML(node.effectFull) + '</p>'
      + extraHTML
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary" id="rt-celebrate-ok">Super! 🚀</button>'
      + '  </div>'
      + '</div>';

    document.body.appendChild(modal);

    modal.querySelector('#rt-celebrate-ok').addEventListener('click', function () {
      RT.state.dispatch('CELEBRATE_NODE', { nodeId: nodeId });
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      updateHqProgress();
      updateBueroProgress();
      if (nodeId === 'logoNeu') setNavIdentity(RT.state.get().player);
    });
  }

  // ── Kampagnen-Feier (kurzer Toast, auto-close) ───────────────────────────────
  function showCampaignCelebration(pcEntry) {
    // Community Event: Boni vergeben + Feier-Modal
    if (pcEntry.campaignType === 'community_event') {
      var s          = RT.state.get();
      var userBonus  = Math.floor((s.resources.users || 0) * 0.02);
      if (userBonus > 0) RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: userBonus });
      RT.state.dispatch('ADD_REPUTATION', { delta: 0.03 });
      RT.state.dispatch('CELEBRATE_CAMPAIGN', { campaignId: pcEntry.campaignId });
      updateHqProgress();
      updateBueroProgress();
      spawnConfetti();
      var sAfter  = RT.state.get();
      var repAfter = typeof sAfter.reputation === 'number' ? sAfter.reputation : 0;
      var ceModal = document.createElement('div');
      ceModal.className = 'rt-modal-overlay is-open';
      ceModal.innerHTML = ''
        + '<div class="rt-modal rt-celebration-modal">'
        + '  <div class="rt-celebration-icon">🎪</div>'
        + '  <h2 class="rt-celebration-title">🎉 Event abgeschlossen!</h2>'
        + '  <p class="rt-celebration-name">Community Event erfolgreich!</p>'
        + '  <p class="rt-celebration-fx">'
        + '    <strong>+' + userBonus.toLocaleString('de-DE') + ' User</strong> (2&nbsp;% der aktuellen Userbasis)<br>'
        + '    <strong>+3,000&nbsp;% Ruf</strong> &mdash; jetzt: ' + (repAfter * 100).toFixed(3) + '&nbsp;%'
        + '  </p>'
        + '  <div class="rt-modal__actions">'
        + '    <button class="rt-btn rt-btn--primary" id="rt-cc-ev-ok">Super! 🚀</button>'
        + '  </div>'
        + '</div>';
      document.body.appendChild(ceModal);
      ceModal.querySelector('#rt-cc-ev-ok').addEventListener('click', function () {
        if (ceModal.parentNode) ceModal.parentNode.removeChild(ceModal);
      });
      return;
    }

    // Image-Kampagne: Slot freigeben + Toast
    if (pcEntry.campaignType === 'image_kampagne') {
      RT.state.dispatch('CELEBRATE_CAMPAIGN', { campaignId: pcEntry.campaignId });
      updateHqProgress();
      updateBueroProgress();
      var ikToast = document.createElement('div');
      ikToast.className = 'rt-campaign-toast';
      ikToast.textContent = '🌟 Image-Kampagne abgeschlossen!';
      document.body.appendChild(ikToast);
      setTimeout(function () {
        ikToast.classList.add('rt-campaign-toast--fade');
        setTimeout(function () { if (ikToast.parentNode) ikToast.parentNode.removeChild(ikToast); }, 400);
      }, 1400);
      return;
    }

    var def = getCampaignDef(pcEntry.campaignType);

    // users_once-Effekt erst jetzt vergeben (wurde beim Start zurückgehalten).
    if (def && def.effectType === 'users_once') {
      RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: def.effectValue });
    }
    RT.state.dispatch('CELEBRATE_CAMPAIGN', { campaignId: pcEntry.campaignId });
    updateHqProgress();
    updateBueroProgress();

    var msg;
    if (isWerbeDeal(pcEntry.campaignType)) {
      msg = '💰 Werbe-Deal abgeschlossen!';
    } else if (def && def.effectType === 'users_once') {
      msg = '📣 +' + (def.effectValue || 0).toLocaleString('de-DE') + ' neue Nutzer!';
    } else {
      msg = '📣 Kampagne abgeschlossen!';
    }

    var toast = document.createElement('div');
    toast.className = 'rt-campaign-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('rt-campaign-toast--fade');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 1400);
  }

  // ── Slot-Float: monatliche Produktion neben dem Slot anzeigen ────────────────
  function spawnSlotFloat(el, text) {
    var rect = el.getBoundingClientRect();
    var pop  = document.createElement('span');
    pop.className = 'rt-slot-float';
    pop.textContent = text;
    pop.style.left = (rect.right + 8) + 'px';
    pop.style.top  = (rect.top + rect.height / 2 - 10) + 'px';
    document.body.appendChild(pop);
    setTimeout(function () {
      if (pop.parentNode) pop.parentNode.removeChild(pop);
    }, 1200);
  }

  function showSlotMonthProduction() {
    var s    = RT.state.get();
    var sat  = RT.marketing ? RT.marketing.computeSaturation(s) : 0;
    var mult = Math.max(0, 1 - sat);
    var camps = s.campaigns || [];
    for (var i = 0; i < camps.length; i++) {
      var camp = camps[i];
      if (camp.phase !== 'running' || camp.buildingGridSlot < 0) continue;
      var def = getCampaignDef(camp.type);
      if (!def) continue;

      var slotEl = document.getElementById('rt-bld-w-' + camp.buildingGridSlot + '-' + (camp.workSlotIndex || 0));
      if (!slotEl) continue;

      if (def.effectType === 'users_per_month') {
        var delta = Math.round(def.effectValue * mult);
        if (delta > 0) spawnSlotFloat(slotEl, '+' + RT.ui.formatNumber(delta) + ' User');
      } else if (def.effectType === 'users_percent') {
        var bonus = Math.floor((s.resources.users || 0) * def.effectValue * mult);
        if (bonus > 0) spawnSlotFloat(slotEl, '+' + RT.ui.formatNumber(bonus) + ' User');
      } else if (def.effectType === 'income_per_user_month') {
        var income = Math.floor((s.resources.users || 0) * def.effectValue);
        if (income > 0) spawnSlotFloat(slotEl, '+€' + RT.ui.formatNumber(income));
      }
    }
  }

  // ── Monatliche Werbeeinnahmen für Resource-Bar ─────────────────────────────
  function calcMonthlyAdIncome() {
    var s     = RT.state.get();
    var camps = s.campaigns || [];
    var total = 0;
    for (var i = 0; i < camps.length; i++) {
      var camp = camps[i];
      if (camp.phase !== 'running') continue;
      var def = getCampaignDef(camp.type);
      if (!def || def.effectType !== 'income_per_user_month') continue;
      total += Math.floor((s.resources.users || 0) * def.effectValue);
    }
    return total;
  }

  function updateMonthlyIncome() {
    var el = document.querySelector('[data-rt-res="moneyMonth"]');
    if (!el) return;
    var amount = calcMonthlyAdIncome();
    if (amount > 0) {
      el.textContent = '+€' + RT.ui.formatNumber(amount) + '/Mon';
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  // ── HQ-Klick ──────────────────────────────────────────────────────────────────
  // Nur noch Techtree-Öffnen. Pending Celebrations und Metadaten-Aktivierung
  // werden jetzt direkt in der Slot-Sidebar geklickt.
  function onHqClick() {
    RT.techtree.open();
  }

  // ── Büro-Klick (Feier wenn ein Slot fertig ist) ───────────────────────────────
  function onBueroClick(gridSlot) {
    var s   = RT.state.get();
    var pcs = s.pendingCelebrations || [];
    for (var i = 0; i < pcs.length; i++) {
      var c = pcs[i];
      if ((typeof c === 'object' ? c.buildingGridSlot : 0) === gridSlot) {
        if (typeof c === 'object' && c.kind === 'support_restart') {
          showSupportRestartMessage(c);
          return;
        }
        if (typeof c === 'object' && c.kind === 'campaign') {
          showCampaignCelebration(c);
          return;
        }
        showCelebration(typeof c === 'object' ? c.nodeId : c);
        return;
      }
    }
    // Wenn Support-Programm oder CC-Kampagne auf diesem Slot läuft → CC-Modal öffnen
    var sp = s.supportProgram;
    if (sp && sp.active && sp.buildingGridSlot === gridSlot) {
      if (RT.communitycenter) RT.communitycenter.open();
      return;
    }
    var camps = s.campaigns || [];
    for (var ci = 0; ci < camps.length; ci++) {
      if (camps[ci].buildingGridSlot === gridSlot && isCCAction(camps[ci].type)) {
        if (RT.communitycenter) RT.communitycenter.open();
        return;
      }
    }
  }

  // ── Support-Programm Neustart-Hinweis ─────────────────────────────────────────
  function showSupportRestartMessage(pcEntry) {
    var TIER_LABELS = ['Basis', 'Nach EU-Expansion', 'Nach Amerika/Afrika', 'Nach Asien'];
    var TIER_COSTS  = ['30.000 €', '100.000 €', '300.000 €', '1.000.000 €'];
    var TIER_WORKERS = ['1', '2', '3', '5'];
    var newTier = pcEntry.newTier || 0;
    var label   = TIER_LABELS[newTier]  || '';
    var cost    = TIER_COSTS[newTier]   || '';
    var workers = TIER_WORKERS[newTier] || '';

    RT.state.dispatch('CLEAR_SUPPORT_RESTART', {});
    updateHqProgress();
    updateBueroProgress();

    var modal = document.createElement('div');
    modal.className = 'rt-modal-overlay is-open';
    modal.innerHTML = ''
      + '<div class="rt-modal">'
      + '  <div style="font-size:2rem;text-align:center;margin-bottom:.5rem;">🔄</div>'
      + '  <h2 class="rt-card__title">Support-Programm gestoppt</h2>'
      + '  <p>Durch die neue Marktexpansion (<strong>' + RT.ui.escapeHTML(label) + '</strong>) muss das Programm '
      + '  neu gestartet werden — auf höherem Niveau.</p>'
      + '  <p><strong>Neue Kosten:</strong> ' + cost + '/Monat · ' + workers + ' Mitarbeiter</p>'
      + '  <p>Starte es im <strong>Community Center</strong> neu.</p>'
      + '  <div class="rt-modal__actions">'
      + '    <button class="rt-btn rt-btn--primary" id="rt-sr-ok">Verstanden</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#rt-sr-ok').addEventListener('click', function () {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    });
  }

  // ── Grid rendern ─────────────────────────────────────────────────────────────
  function renderGrid() {
    var gridEl = document.getElementById('rt-campus-grid');
    if (!gridEl) return;

    var s         = RT.state.get();
    var buildings = s.buildings || [];
    var pending   = s.pendingPlacement;
    var html      = '';

    var dealDone   = !!s.marcusDealAccepted;
    // Grid-Größe hängt an der Phase: Campus max 8 Zellen, Expansion max 25 (5×5).
    // Team-Stufe entriegelt Zellen innerhalb dieses Rahmens.
    var phaseCap    = s.phase === 'expansion' ? 25 : 8;
    var teamMax     = RT.team ? RT.team.getGridCells() : phaseCap;
    var unlockedMax = Math.min(teamMax, phaseCap);
    var totalSlots  = phaseCap;
    // Compact-Modus immer aktiv (5-Spalten-Layout).
    gridEl.classList.add('rt-campus-grid--compact');

    for (var slot = 0; slot < totalSlots; slot++) {

      // Gesperrte Zellen (jenseits der Team-Stufe) — zeigen als locked-Placeholder.
      if (slot >= unlockedMax) {
        html += '<div class="rt-campus-tile rt-campus-tile--locked" data-slot="' + slot + '">'
          + '<span class="rt-campus-tile__lock">🔒</span>'
          + '</div>';
        continue;
      }

      if (slot === 0) {
        var hqSrc = RT.assets.buildingSrc('headquarter', dealDone ? 2 : 1);
        html += '<div class="rt-campus-tile rt-campus-tile--hq" id="rt-campus-hq" data-slot="0">'
          + '<img class="rt-campus-tile__img" src="' + hqSrc + '" alt="HQ">'
          + '<div class="rt-hq-label-wrap">'
          + '  <span class="rt-new-badge" id="rt-hq-new-badge" style="display:none">!</span>'
          + '  <span class="rt-hq-label" id="rt-hq-label">Tech Tree öffnen</span>'
          + '</div>'
          + '</div>';
        continue;
      }

      var bldg = buildingAtSlot(buildings, slot);

      if (bldg) {
        var src = (bldg.type === 'serverfarm')
          ? sfTileSprite(bldg.structLevel || 0)
          : RT.assets.buildingSrc(bldg.type, bldg.level || 0);
        var def      = RT.assets.BUILDINGS[bldg.type];
        var lbl      = bldg.type === 'serverfarm' ? sfTileName(bldg.structLevel || 0) : (def ? def.label : bldg.type);
        var progHTML    = '';
        var sfBadgeHTML = '';
        if (bldg.type === 'serverfarm') {
          sfBadgeHTML = '<span class="rt-sf-tile-badge rt-sf-tile-badge--ok">'
            + sfTileBadge(bldg.structLevel || 0, bldg.expansionTier || 0)
            + '</span>';
        }
        var waExtraHTML = '';
        if (bldg.type === 'werbeagentur') {
          var waS    = s.werbeagentur || {};
          var wbDone     = s.techtree && s.techtree['wb_display'] === 'done';
          var waSettings = waS.settings || {};
          var bannerFreq = waSettings.banner && waSettings.banner.frequency != null ? waSettings.banner.frequency : 0;
          var spFreq     = waSettings.sponsored_post && waSettings.sponsored_post.frequency != null ? waSettings.sponsored_post.frequency : 0;
          var anyAdNow   = wbDone && (bannerFreq > 0 || ((waS.workers || 0) > 0 && spFreq > 0));
          if (anyAdNow) {
            var lastRev  = waS.lastMonthRevenue || 0;
            var revLabel = lastRev > 0 ? '+' + lastRev.toLocaleString('de-DE') + ' €' : '0 €';
            waExtraHTML += '<div class="rt-bld-slots">'
              + '<div class="rt-bld-slot-wrap rt-bld-slot-wrap--werbung rt-wa-revenue-slot">'
              + '<span class="rt-bld-slot-icon">💰</span>'
              + '<div class="rt-bld-slot-right">'
              + '<span class="rt-bld-slot-name">Werbeeinnahmen</span>'
              + '<div class="rt-bld-slot-track"><div class="rt-bld-slot-bar" style="width:100%"></div></div>'
              + '<span class="rt-bld-slot-lbl">' + revLabel + '</span>'
              + '</div>'
              + '</div>'
              + '</div>';
          }
          if ((waS.workers || 0) > 0) {
            waExtraHTML += '<span class="rt-wa-worker-badge">'
              + '👤 ' + waS.workers + ' / ' + (waS.capacity || 1)
              + '</span>';
          }
        }
        var imgClass = 'rt-campus-tile__img'
          + (bldg.type === 'serverfarm' && (bldg.structLevel || 0) >= 2 ? ' rt-campus-tile__img--sf-large' : '');
        html += '<div class="rt-campus-tile rt-campus-tile--building" style="position:relative;"'
          + ' data-slot="' + slot + '" data-type="' + bldg.type + '">'
          + progHTML
          + waExtraHTML
          + sfBadgeHTML
          + '<img class="' + imgClass + '" src="' + src + '" alt="' + RT.ui.escapeHTML(lbl) + '">'
          + '<span class="rt-campus-tile__label">' + RT.ui.escapeHTML(lbl) + '</span>'
          + '</div>';      } else if (pending) {
        html += '<div class="rt-campus-tile rt-campus-tile--placeable rt-campus-tile--js-place"'
          + ' data-slot="' + slot + '">'
          + '<span class="rt-campus-tile__plus">+</span>'
          + '<span class="rt-campus-tile__label">Hier platzieren</span>'
          + '</div>';
      } else {
        html += '<div class="rt-campus-tile rt-campus-tile--empty" data-slot="' + slot + '">'
          + '<span class="rt-campus-tile__plus">+</span>'
          + '</div>';
      }
    }

    gridEl.innerHTML = html;
    bindGridEvents();
    updateBanner(pending);
    updateHqProgress();
    updateHqBadge();
    updateBueroProgress();
  }

  function bindGridEvents() {
    var hqEl = document.getElementById('rt-campus-hq');
    if (hqEl) {
      hqEl.addEventListener('click', onHqClick);
    }

    var bueroTiles = document.querySelectorAll('.rt-campus-tile--building[data-type="buero"]');
    for (var bi = 0; bi < bueroTiles.length; bi++) {
      (function (el) {
        el.addEventListener('click', function () {
          onBueroClick(parseInt(el.getAttribute('data-slot'), 10));
        });
      }(bueroTiles[bi]));
    }

    var mkTiles = document.querySelectorAll('.rt-campus-tile--building[data-type="marketingstudio"]');
    for (var mi = 0; mi < mkTiles.length; mi++) {
      mkTiles[mi].addEventListener('click', function () {
        if (RT.marketing) RT.marketing.open();
      });
    }

    var wbTiles = document.querySelectorAll('.rt-campus-tile--building[data-type="werbeagentur"]');
    for (var wi = 0; wi < wbTiles.length; wi++) {
      wbTiles[wi].addEventListener('click', function () {
        if (RT.werbeagentur) RT.werbeagentur.open();
      });
    }

    var ccTiles = document.querySelectorAll('.rt-campus-tile--building[data-type="communitycenter"]');
    for (var cci = 0; cci < ccTiles.length; cci++) {
      ccTiles[cci].addEventListener('click', function () {
        if (RT.communitycenter) RT.communitycenter.open();
      });
    }

    var sfTiles = document.querySelectorAll('.rt-campus-tile--building[data-type="serverfarm"]');
    for (var sfi = 0; sfi < sfTiles.length; sfi++) {
      (function (el) {
        el.addEventListener('click', function () {
          var slotNum = parseInt(el.getAttribute('data-slot'), 10);
          if (RT.serverfarm) RT.serverfarm.open(slotNum);
        });
      }(sfTiles[sfi]));
    }

    var placeSlots = document.querySelectorAll('.rt-campus-tile--js-place');
    for (var i = 0; i < placeSlots.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          var slotNum = parseInt(el.getAttribute('data-slot'), 10);
          var curr    = RT.state.get().pendingPlacement;
          if (!curr) return;
          RT.state.dispatch('PLACE_BUILDING', { type: curr, slot: slotNum });
        });
      }(placeSlots[i]));
    }

    var emptyTiles = document.querySelectorAll('.rt-campus-tile--empty');
    for (var ei = 0; ei < emptyTiles.length; ei++) {
      (function (el) {
        el.addEventListener('click', function () {
          var slotNum = parseInt(el.getAttribute('data-slot'), 10);
          RT.shop.open(slotNum);
        });
      }(emptyTiles[ei]));
    }
  }

  function updateBanner(pending) {
    var banner = document.getElementById('rt-placement-banner');
    if (!banner) return;
    if (pending) {
      var def   = RT.assets.BUILDINGS[pending];
      var label = def ? def.label : pending;
      banner.querySelector('.rt-placement-banner__text').textContent =
        '📍 ' + label + ' platzieren — tippe auf einen freien Slot';
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  // ── Platzierung abbrechen (Geld erstatten) ────────────────────────────────
  function cancelPlacement() {
    var s       = RT.state.get();
    var pending = s.pendingPlacement;
    if (!pending) return;
    var catalog = RT.shop.CATALOG;
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].id === pending) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: catalog[i].price, label: 'Rückerstattung' });
        break;
      }
    }
    RT.state.dispatch('SET_PENDING_PLACEMENT', { type: null });
  }

  // ── Nav-Identität setzen / löschen ────────────────────────────────────────
  function setNavIdentity(player) {
    var head     = RT.assets.avatarSrc(player.avatar, 'head');
    var logo     = RT.assets.logoSrcAuto(player.platformLogo);
    var platform = RT.ui.escapeHTML(player.platformName || '');
    var name     = RT.ui.escapeHTML(player.name || '');
    var isLive   = !!(RT.state.get().goLiveUnlocked);

    var navPlayer = document.getElementById('rt-nav-player');
    if (navPlayer) {
      navPlayer.innerHTML = (head ? '<img class="rt-nav-identity__head" src="' + head + '" alt="">' : '')
        + '<span class="rt-nav-identity__platform">' + name + '</span>';
      navPlayer.style.display = 'flex';
    }

    var navBrand = document.getElementById('rt-nav-brand');
    if (navBrand) {
      navBrand.innerHTML = '<div class="rt-nav-identity__text">'
        + '<span class="rt-nav-identity__platform">' + platform + '</span>'
        + (isLive ? '<span class="rt-live-status"><span class="rt-live-dot"></span>Online</span>' : '')
        + '</div>'
        + (logo ? '<img class="rt-nav-identity__logo" src="' + logo + '" alt="">' : '');
      navBrand.style.display = 'flex';
    }
  }

  function clearNavIdentity() {
    var navPlayer = document.getElementById('rt-nav-player');
    if (navPlayer) { navPlayer.innerHTML = ''; navPlayer.style.display = 'none'; }
    var navBrand = document.getElementById('rt-nav-brand');
    if (navBrand) { navBrand.innerHTML = ''; navBrand.style.display = 'none'; }
  }

  // ── Screen-Lifecycle ──────────────────────────────────────────────────────
  function enter(container) {
    RT.clock.start();
    _clockProg = 0;
    var player = RT.state.get().player;

    document.body.classList.add('rt-campus-mode');
    setNavIdentity(player);

    var shopBtnVis = document.getElementById('rt-shop-open');
    if (shopBtnVis) shopBtnVis.style.display = '';
    var questBtnVis = document.getElementById('rt-quest-open');
    if (questBtnVis) questBtnVis.style.display = '';

    // 500k-Trigger: nicht nochmal feuern wenn Deal bereits akzeptiert (z.B. aus Save)
    _marcus500kTriggered = !!RT.state.get().marcusDealAccepted;
    _offUserCheck = RT.bus.on('resource:changed', function (d) {
      if (d.key !== 'users') return;
      if (_marcus500kTriggered) return;
      if ((RT.state.get().resources.users || 0) >= 500000) {
        _marcus500kTriggered = true;
        setTimeout(showMarcusDealModal, 500);
      }
    });

    container.innerHTML = ''
      + '<section class="rt-screen rt-screen--campus">'
      +   RT.ui.resourceBarHTML({ withRep: true })
      + '  <div id="rt-placement-banner" class="rt-placement-banner" style="display:none">'
      + '    <span class="rt-placement-banner__text"></span>'
      + '    <button class="rt-btn rt-btn--ghost rt-placement-cancel-btn"'
      + '            style="padding:6px 14px;font-size:0.85rem;flex-shrink:0;">✕ Abbrechen</button>'
      + '  </div>'
      + '  <div class="rt-campus-area">'
      + '    <div class="rt-campus-grid" id="rt-campus-grid"></div>'
      + '  </div>'
      + '</section>';

    _unsubResources = RT.ui.bindResourceBar(container, { withRep: true });

    var wtResEl = container.querySelector('#rt-res-watchtime');
    if (wtResEl) {
      wtResEl.addEventListener('click', function () {
        if (RT.state.get().metadatenActive) showWatchtimeInfoModal();
      });
    }

    renderGrid();
    updateMonthlyIncome();

    _offGrid = RT.bus.on('campus:grid-changed', renderGrid);

    _offTick = RT.bus.on('clock:tick', function (d) {
      _clockProg = d.progress;
      updateHqProgress();
      updateBueroProgress();
    });

    _offComplete = RT.bus.on('techtree:completed', function () {
      updateHqProgress();
      updateBueroProgress();
    });

    _offTabSeen = RT.bus.on('techtree:tab-seen', function () {
      updateHqBadge();
    });

    _offCampaigns = RT.bus.on('campaigns:changed', function () {
      updateHqProgress();
      updateBueroProgress();
      updateMonthlyIncome();
    });

    _offMonthAdv = RT.bus.on('month:advance', function () {
      // _clockProg sofort auf 0 setzen, damit Fortschrittsbalken nicht kurz auf
      // 100 % springen (state.month ist bereits erhöht, _clockProg noch ~1.0).
      _clockProg = 0;
      showSlotMonthProduction();
      updateMonthlyIncome();

      // Metadaten-Aktivierung: Modal erneut zeigen, sobald Kapazität ausreicht.
      var sma = RT.state.get();
      if (sma.metadatenPendingActivation && !sma.metadatenActive) {
        var rma = sma.resources;
        var canNow = ((rma.serverSoftwareUsage || 0) + (rma.serverUsage || 0) * 2) <= (rma.serverCapacity || 0);
        if (canNow) showMetadatenModal();
      }
    });

    container.querySelector('.rt-placement-cancel-btn').addEventListener('click', cancelPlacement);

    _offBankrupt = RT.bus.on('game:bankrupt', showBankruptModal);
    if (RT.state.get().isBankrupt) showBankruptModal();
  }

  function showBankruptModal() {
    if (document.querySelector('.rt-bankrupt-overlay')) return;
    RT.clock && RT.clock.pause && RT.clock.pause();
    var overlay = document.createElement('div');
    overlay.className = 'rt-modal-overlay rt-bankrupt-overlay is-open';
    overlay.innerHTML = ''
      + '<div class="rt-modal rt-bankrupt-modal">'
      + '  <div class="rt-bankrupt-modal__icon">💸</div>'
      + '  <h2 class="rt-bankrupt-modal__title">Pleite</h2>'
      + '  <p class="rt-bankrupt-modal__body">'
      + '    Deine Schulden haben die Grenze von <strong>500.000 €</strong> überschritten.'
      + '    Die Investoren ziehen sich zurück &mdash; das Startup ist zahlungsunfähig.'
      + '  </p>'
      + '  <button class="rt-btn rt-btn--primary rt-btn--lg rt-bankrupt-restart-btn">Neu starten</button>'
      + '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.rt-bankrupt-restart-btn').addEventListener('click', function () {
      RT.state.dispatch('RESET', {});
      RT.persistence && RT.persistence.save && RT.persistence.save();
      window.location.reload();
    });
  }

  function exit() {
    if (_unsubResources) { _unsubResources(); _unsubResources = null; }
    if (_offGrid)        { _offGrid();        _offGrid        = null; }
    if (_offTick)        { _offTick();        _offTick        = null; }
    if (_offComplete)    { _offComplete();    _offComplete    = null; }
    if (_offTabSeen)     { _offTabSeen();     _offTabSeen     = null; }
    if (_offCampaigns)   { _offCampaigns();   _offCampaigns   = null; }
    if (_offMonthAdv)    { _offMonthAdv();    _offMonthAdv    = null; }
    if (_offUserCheck)   { _offUserCheck();   _offUserCheck   = null; }
    if (_offBankrupt)    { _offBankrupt();    _offBankrupt    = null; }
    document.body.classList.remove('rt-campus-mode');
    clearNavIdentity();
  }

  RT.screens.register('campus',    { enter: enter, exit: exit });
  RT.screens.register('expansion', { enter: enter, exit: exit });

  // Für Slot-Sidebar: klickbare Slot-Items lösen Celebration-Modals aus.
  RT.campus = {
    showCelebration:           showCelebration,
    showCampaignCelebration:   showCampaignCelebration,
    showSupportRestartMessage: showSupportRestartMessage,
    showMetadatenModal:        showMetadatenModal
  };
})(window.RT);
