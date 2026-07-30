/* Team-Upgrade-Modal: Übersicht aller 7 Stufen mit Bild, Kosten und Upgrade-Button.
   Erreichbar über Sidebar-Button (ab Campus) und Shop.
   Morph-Animation + Konfetti nach erfolgreichem Upgrade. */
(function (RT) {
  'use strict';

  var overlay = null;

  // Gibt den Sprite-Pfad für eine Stufe zurück — Solo zeigt den gewählten Charakter.
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

  function open() {
    var s = RT.state.get();
    if (!s.meta || !s.meta.gameStarted) return;
    if (s.phase === 'garage') return;
    if (!overlay) { overlay = build(); document.body.appendChild(overlay); }
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  function spawnConfetti() {
    var colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#96CEB4', '#FFEAA7', '#DDA0DD', '#87CEEB', '#FF9F43'];
    for (var i = 0; i < 64; i++) {
      var div = document.createElement('div');
      div.className = 'rt-confetti-piece';
      div.style.left            = Math.random() * 100 + 'vw';
      div.style.animationDelay  = (Math.random() * 0.5) + 's';
      div.style.animationDuration = (0.9 + Math.random() * 0.9) + 's';
      var size = 6 + Math.floor(Math.random() * 8);
      div.style.width  = size + 'px';
      div.style.height = size + 'px';
      div.style.background = colors[Math.floor(Math.random() * colors.length)];
      document.body.appendChild(div);
    }
    setTimeout(function () {
      var pieces = document.querySelectorAll('.rt-confetti-piece');
      for (var j = 0; j < pieces.length; j++) pieces[j].remove();
    }, 2500);
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.id = 'rt-tum-overlay';
    el.innerHTML = '<div class="rt-modal rt-team-upgrade-modal" id="rt-tum-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  function render() {
    var inner  = overlay.querySelector('#rt-tum-inner');
    var s      = RT.state.get();
    var curIdx = RT.team.getStageIndex();
    var stages = RT.team.STAGES;
    var money  = (s.resources && s.resources.money) || 0;
    var imgSrc = getStageImg(curIdx, s);

    var stagesHTML = '';
    for (var i = 0; i < stages.length; i++) {
      var stg = stages[i];
      var cls = 'rt-tum-stage-row';
      if (i < curIdx)       cls += ' rt-tum-stage-row--done';
      if (i === curIdx)     cls += ' rt-tum-stage-row--current';
      if (i === curIdx + 1) cls += ' rt-tum-stage-row--next';
      if (i > curIdx + 1)  cls += ' rt-tum-stage-row--locked';

      var badge = '';
      if (i === curIdx) badge = '<span class="rt-tum-badge rt-tum-badge--current">Aktuell</span>';
      if (i < curIdx)   badge = '<span class="rt-tum-badge rt-tum-badge--done">&#10003;</span>';

      var costsHTML = '';
      if (i > 0 && stg.upgradeCost) {
        costsHTML = '<span class="rt-tum-stage-row__costs">'
          + '€' + stg.upgradeCost.toLocaleString('de-DE') + ' einmalig'
          + (stg.monthlyCost ? ' · €' + stg.monthlyCost.toLocaleString('de-DE') + '/Mo' : '')
          + '</span>';
      }

      var upgradeBtn = '';
      if (i === curIdx + 1) {
        var canAfford = money >= (stg.upgradeCost || 0);
        upgradeBtn = '<button class="rt-btn rt-btn--primary rt-tum-upgrade-btn'
          + (canAfford ? ' rt-tum-upgrade-btn--afford' : '') + '"'
          + (canAfford ? '' : ' disabled')
          + ' data-stage-idx="' + i + '">'
          + (canAfford ? 'Upgrade €' : '€') + (stg.upgradeCost || 0).toLocaleString('de-DE')
          + '</button>';
      }

      stagesHTML += '<li class="' + cls + '">'
        + '<div class="rt-tum-stage-row__left">'
        + '  <span class="rt-tum-stage-row__name">' + stg.name + '</span>'
        + badge
        + '</div>'
        + '<span class="rt-tum-stage-row__stats">'
        + stg.slots + ' Slots · ' + stg.gridCells + ' Plätze'
        + '</span>'
        + costsHTML
        + upgradeBtn
        + '</li>';
    }

    inner.innerHTML = ''
      + '<button class="rt-tum-close" id="rt-tum-close">✕</button>'
      + '<h2 class="rt-tum-title">Team upgraden</h2>'
      + '<div class="rt-tum-layout">'
      + '  <div class="rt-tum-img-wrap">'
      + '    <img id="rt-tum-img" class="rt-tum-img" src="' + (imgSrc || '') + '" alt="Team">'
      + '  </div>'
      + '  <ul class="rt-tum-stage-list">' + stagesHTML + '</ul>'
      + '</div>'
      + '<div class="rt-modal__actions">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-tum-close2">Schließen</button>'
      + '</div>';

    inner.querySelector('#rt-tum-close').addEventListener('click', close);
    inner.querySelector('#rt-tum-close2').addEventListener('click', close);

    var upgradeBtn2 = inner.querySelector('.rt-tum-upgrade-btn');
    if (upgradeBtn2) {
      upgradeBtn2.addEventListener('click', function () {
        doUpgrade(inner);
      });
    }
  }

  function doUpgrade(inner) {
    var imgEl = inner.querySelector('#rt-tum-img');
    if (imgEl) imgEl.style.opacity = '0';

    RT.state.dispatch('TEAM_UPGRADE', {});

    setTimeout(function () {
      var newIdx = RT.team.getStageIndex();
      var newS   = RT.state.get();
      var newSrc = getStageImg(newIdx, newS);
      if (imgEl) {
        imgEl.src = newSrc || '';
        imgEl.style.opacity = '1';
      }
      spawnConfetti();

      inner.classList.add('is-shaking');
      setTimeout(function () { inner.classList.remove('is-shaking'); }, 500);

      var newStage = RT.team.getStage(newIdx);
      var old = inner.querySelector('.rt-tum-congrats');
      if (old) old.remove();
      var congrats = document.createElement('div');
      congrats.className = 'rt-tum-congrats';
      congrats.textContent = '🎉 Willkommen, ' + newStage.name + '!';
      var layout = inner.querySelector('.rt-tum-layout');
      if (layout) inner.insertBefore(congrats, layout);

      // Stufen-Liste neu rendern
      render();
    }, 420);
  }

  RT.teamUpgradeModal = { open: open, close: close };
})(window.RT);
