/* Team-Slot-Sidebar am rechten Bildschirmrand.
   Zeigt: großes Team-Bild (charakterabhängig für Solo/Duo), Stufen-Name,
   Upgrade-Button (ab Campus-Phase), Liste aller Slots mit Live-Progress-Bar.
   Sichtbar ab Garage-Phase (nach gameStarted), ausgeblendet im End-Screen. */
(function (RT) {
  'use strict';

  // Gibt den Sprite-Pfad für eine Stufe zurück.
  function getStageImg(idx, s) {
    var av = s.player && s.player.avatar;
    if (idx === 0) {
      return RT.assets && RT.assets.avatarSrc ? RT.assets.avatarSrc(av, 'body') : null;
    }
    if (idx === 1) {
      if (av === 'fuchs' || av === 'waschbaer') return 'sprites/Team/Duo Fuch Waschbär.png';
      return 'sprites/Team/Duo Otter Eichhörnchen.png';
    }
    var MAP = [
      null,
      null,
      'sprites/Team/Quartet.png',
      'sprites/Team/10 tiere.png',
      'sprites/Team/40 tiere.png',
      'sprites/Team/100 Tiere.png',
      'sprites/Team/1000 tiere.png'
    ];
    return MAP[idx] || null;
  }

  var STAGE_EMOJI = ['🧑‍💻', '👥', '🧑‍🤝‍🧑', '🏫', '🏢', '🏬', '🌆'];

  var el         = null;
  var _clockProg = 0;

  function ensureBuilt() {
    if (el) return el;
    el = document.createElement('aside');
    el.id = 'rt-slot-sidebar';
    el.className = 'rt-slot-sidebar';
    el.style.display = 'none';
    el.innerHTML =
      '<div class="rt-team-portrait" id="rt-team-portrait">' +
      '  <div class="rt-team-portrait__media" id="rt-team-portrait-media"></div>' +
      '  <div class="rt-team-portrait__name" id="rt-team-portrait-name">Solo</div>' +
      '</div>' +
      '<div class="rt-slot-list__header">' +
      '  <span class="rt-slot-list__title">Team</span>' +
      '  <span class="rt-slot-list__count" id="rt-slot-list-count">0/0</span>' +
      '</div>' +
      '<ul class="rt-slot-list" id="rt-slot-list"></ul>';
    document.body.appendChild(el);

    // Klick auf Slot-Liste: einzelne Slots via Delegation
    el.querySelector('#rt-slot-list').addEventListener('click', onSlotClick);

    return el;
  }

  function isInPhase() {
    var s = RT.state.get();
    return s.meta && s.meta.gameStarted && s.phase !== 'end';
  }

  function escapeHTML(s) {
    if (RT.ui && RT.ui.escapeHTML) return RT.ui.escapeHTML(s);
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function progressFor(slot, currentFull) {
    if (!slot.hasProgress || !slot.duration) return 0;
    var elapsed = Math.max(0, currentFull - (slot.startMonthFull || 0));
    return Math.min(1, elapsed / slot.duration);
  }

  function render() {
    var s       = RT.state.get();
    var inPhase = isInPhase();

    if (!el) {
      if (!inPhase) return;
      ensureBuilt();
    }
    el.style.display = inPhase ? '' : 'none';
    if (!inPhase) return;

    var idx    = RT.team.getStageIndex();
    var stage  = RT.team.getStage(idx);
    var imgSrc = getStageImg(idx, s);
    var emoji  = STAGE_EMOJI[idx] || '🧑‍💻';

    var media = el.querySelector('#rt-team-portrait-media');
    if (imgSrc) {
      media.innerHTML = '<img src="' + imgSrc + '" alt="' + escapeHTML(stage.name) + '" onerror="this.parentNode.textContent=\'' + emoji + '\'">';
    } else {
      media.textContent = emoji;
    }

    el.querySelector('#rt-team-portrait-name').textContent = stage.name;

    // Upgrade-Button: nur ab Campus-Phase, öffnet das Upgrade-Modal
    var portrait = el.querySelector('#rt-team-portrait');
    var existingBtn = portrait.querySelector('.rt-team-portrait__upgrade');
    if (s.phase !== 'garage') {
      var next = RT.team.nextStagePreview();
      if (!existingBtn) {
        var btn = document.createElement('button');
        btn.className = 'rt-team-portrait__upgrade';
        btn.id = 'rt-team-portrait-upgrade';
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (RT.teamUpgradeModal) RT.teamUpgradeModal.open();
        });
        portrait.appendChild(btn);
        existingBtn = btn;
      }
      if (next) {
        var money  = (s.resources && s.resources.money) || 0;
        var afford = money >= (next.upgradeCost || 0);
        existingBtn.textContent = 'Upgrade';
        existingBtn.disabled = false;
        existingBtn.classList.toggle('rt-team-portrait__upgrade--afford', afford);
      } else {
        existingBtn.textContent = 'Max. Stufe';
        existingBtn.disabled = true;
        existingBtn.classList.remove('rt-team-portrait__upgrade--afford');
      }
    } else if (existingBtn) {
      existingBtn.remove();
    }

    var cap         = RT.slots.capacity();
    var slots       = RT.slots.list();
    var listEl      = el.querySelector('#rt-slot-list');
    var currentFull = s.month + _clockProg;
    var html        = '';
    for (var i = 0; i < cap; i++) {
      var slot = slots[i];
      if (!slot) {
        html += '<li class="rt-slot-item rt-slot-item--free">' +
                '  <span class="rt-slot-item__icon">·</span>' +
                '  <span class="rt-slot-item__label">Frei</span>' +
                '</li>';
        continue;
      }
      var cls = 'rt-slot-item rt-slot-item--busy';
      if (slot.isDone)     cls += ' rt-slot-item--done';
      if (slot.hasProgress) cls += ' rt-slot-item--progress';

      var dataAttrs = ' data-slot-idx="' + i + '" data-task-type="' + (slot.taskType || '') + '"';
      if (slot.isDone && slot.taskType === 'pending' && typeof slot.pcIdx === 'number') {
        dataAttrs += ' data-pc-idx="' + slot.pcIdx + '"';
      }
      if (slot.taskType === 'metadaten') dataAttrs += ' data-metadaten="1"';

      var bodyHTML = '<span class="rt-slot-item__label">' + escapeHTML(slot.label) + '</span>';
      if (slot.hasProgress) {
        var prog    = progressFor(slot, currentFull);
        var progPct = (prog * 100).toFixed(1);
        var progLbl = prog >= 1 ? 'Gleich fertig!' : Math.round(prog * 100) + '%';
        bodyHTML +=
          '<div class="rt-slot-item__track"><div class="rt-slot-item__bar" style="width:' + progPct + '%"></div></div>' +
          '<span class="rt-slot-item__prog">' + progLbl + '</span>';
      } else if (slot.isDone) {
        bodyHTML += '<span class="rt-slot-item__prog rt-slot-item__prog--pulse">Klicken!</span>';
      }

      html += '<li class="' + cls + '"' + dataAttrs + '>' +
              '  <span class="rt-slot-item__icon">' + slot.icon + '</span>' +
              '  <div class="rt-slot-item__body">' + bodyHTML + '</div>' +
              '</li>';
    }
    listEl.innerHTML = html;
    el.querySelector('#rt-slot-list-count').textContent = slots.length + '/' + cap;
  }

  // Live-Update nur der Progress-Bars
  function onClockTick(d) {
    _clockProg = (d && typeof d.progress === 'number') ? d.progress : 0;
    if (!el || el.style.display === 'none') return;
    var s           = RT.state.get();
    var slots       = RT.slots.list();
    var currentFull = s.month + _clockProg;
    var cap         = RT.slots.capacity();
    for (var i = 0; i < cap; i++) {
      var slot = slots[i];
      if (!slot || !slot.hasProgress) continue;
      var prog = progressFor(slot, currentFull);
      var itemEl = el.querySelector('.rt-slot-item[data-slot-idx="' + i + '"]');
      if (!itemEl) continue;
      var bar  = itemEl.querySelector('.rt-slot-item__bar');
      var lbl  = itemEl.querySelector('.rt-slot-item__prog');
      if (bar) bar.style.width = (prog * 100).toFixed(1) + '%';
      if (lbl) lbl.textContent = prog >= 1 ? 'Gleich fertig!' : Math.round(prog * 100) + '%';
    }
  }

  // Klick auf einen Slot
  function onSlotClick(ev) {
    var li = ev.target.closest ? ev.target.closest('.rt-slot-item') : null;
    if (!li) return;

    if (li.getAttribute('data-task-type') === 'werbeagentur') {
      if (RT.werbeagentur && RT.werbeagentur.open) RT.werbeagentur.open();
      return;
    }
    if (li.getAttribute('data-task-type') === 'support') {
      if (RT.communitycenter && RT.communitycenter.open) RT.communitycenter.open();
      return;
    }
    if (li.getAttribute('data-metadaten') === '1') {
      if (RT.campus && RT.campus.showMetadatenModal) RT.campus.showMetadatenModal();
      return;
    }

    var pcIdxStr = li.getAttribute('data-pc-idx');
    if (pcIdxStr == null) return;
    var pcIdx = parseInt(pcIdxStr, 10);
    var s     = RT.state.get();
    var pc    = (s.pendingCelebrations || [])[pcIdx];
    if (!pc || typeof pc !== 'object') return;

    var host = (s.phase === 'garage' && RT.garage) ? RT.garage : RT.campus;
    if (!host) return;
    if (pc.kind === 'support_restart') {
      if (host.showSupportRestartMessage) host.showSupportRestartMessage(pc);
    } else if (pc.kind === 'campaign') {
      if (host.showCampaignCelebration) host.showCampaignCelebration(pc);
    } else {
      if (host.showCelebration) host.showCelebration(pc.nodeId);
    }
  }

  function attach() {
    RT.bus.on('team:changed',         render);
    RT.bus.on('resource:changed',     render);
    RT.bus.on('campaigns:changed',    render);
    RT.bus.on('campus:grid-changed',  render);
    RT.bus.on('phase:changed',        render);
    RT.bus.on('werbeagentur:changed', render);
    RT.state.subscribe(function () { render(); });
    RT.bus.on('clock:tick', onClockTick);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
  }

  RT.slotSidebar = { render: render };
  attach();
})(window.RT);
