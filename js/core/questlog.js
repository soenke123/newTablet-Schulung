/* Questlog – leitet Quest-Status aus bestehendem State ab, kein eigenes State-Feld. */
(function (RT) {
  'use strict';

  var QUESTS = [
    { id: 'q1', text: 'Entwickle die Software-Basis einer Onlineplattform, die Leute verbindet' },
    { id: 'q2', text: 'Erreiche 1.000 User' },
    { id: 'q3', text: 'Erreiche 500.000 User' },
    { id: 'q4', text: 'Erreiche 50.000.000 User' }
  ];

  var _panel          = null;
  var _isOpen         = false;
  var _badgeDismissed = false;
  var _prevStatuses   = null;

  function computeStatuses() {
    var s     = RT.state.get();
    var live  = !!s.goLiveUnlocked;
    var users = (s.resources && s.resources.users) || 0;
    return [
      live               ? 'done' : 'active',
      users >= 1000      ? 'done' : (live            ? 'active' : 'locked'),
      users >= 500000    ? 'done' : (users >= 1000   ? 'active' : 'locked'),
      users >= 50000000  ? 'done' : (users >= 500000 ? 'active' : 'locked')
    ];
  }

  function checkNewCompletions(statuses) {
    if (!_prevStatuses) return;
    for (var i = 0; i < statuses.length; i++) {
      var curr = statuses[i];
      var prev = _prevStatuses[i];
      if (curr !== prev && (curr === 'active' || curr === 'done')) {
        _badgeDismissed = false;
        break;
      }
    }
  }

  function updateBadge(statuses) {
    var badge = document.getElementById('rt-quest-badge');
    if (!badge) return;
    var hasNotable = false;
    for (var i = 0; i < statuses.length; i++) {
      if (statuses[i] === 'active' || statuses[i] === 'done') { hasNotable = true; break; }
    }
    badge.style.display = (hasNotable && !_badgeDismissed && !_isOpen) ? '' : 'none';
  }

  function ensurePanel() {
    if (_panel) return;
    _panel = document.createElement('div');
    _panel.className = 'rt-quest-panel';
    document.body.appendChild(_panel);
    document.addEventListener('click', function (e) {
      if (!_isOpen) return;
      var btn = document.getElementById('rt-quest-open');
      if (_panel.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      close();
    }, true);
  }

  var ICONS = { done: '✓', active: '▶', locked: '🔒' };

  function render(statuses) {
    var html = '<div class="rt-quest-panel__title">📋 Quests</div><div class="rt-quest-list">';
    for (var i = 0; i < QUESTS.length; i++) {
      var st = statuses[i];
      if (st === 'locked') continue;
      html += '<div class="rt-quest-item rt-quest-item--' + st + '">'
            + '<span class="rt-quest-item__status">' + ICONS[st] + '</span>'
            + '<span class="rt-quest-item__text">' + RT.ui.escapeHTML(QUESTS[i].text) + '</span>'
            + '</div>';
    }
    html += '</div>'
          + '<div class="rt-quest-panel__actions">'
          + '<button class="rt-btn rt-btn--ghost" id="rt-quest-close" '
          + 'style="padding:var(--rt-space-2) var(--rt-space-4);font-size:0.88rem;">Schließen</button>'
          + '</div>';
    _panel.innerHTML = html;
    _panel.querySelector('#rt-quest-close').addEventListener('click', close);
  }

  function open() {
    ensurePanel();
    _isOpen         = true;
    _badgeDismissed = true;
    var statuses = computeStatuses();
    render(statuses);
    _panel.classList.add('is-open');
    updateBadge(statuses);
  }

  function close() {
    if (!_panel) return;
    _isOpen = false;
    _panel.classList.remove('is-open');
    updateBadge(computeStatuses());
  }

  function update() {
    var statuses = computeStatuses();
    checkNewCompletions(statuses);
    if (_isOpen && _panel) render(statuses);
    updateBadge(statuses);
    _prevStatuses = statuses.slice();
  }

  function init() {
    var btn = document.getElementById('rt-quest-open');
    if (btn) {
      btn.addEventListener('click', function () { _isOpen ? close() : open(); });
    }

    RT.bus.on('resource:changed', function (d) {
      if (d && d.key === 'users') update();
    });

    RT.state.subscribe(function (s, action) {
      if (!action) return;
      if (action.type === 'SET_GOLIVE_UNLOCKED') update();
      if (action.type === 'RESTORE_STATE')        update();
      if (action.type === 'RESET') {
        _badgeDismissed = false;
        _prevStatuses   = null;
        _isOpen         = false;
        if (_panel) _panel.classList.remove('is-open');
        update();
      }
    });

    _prevStatuses = computeStatuses();
    updateBadge(_prevStatuses);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  RT.questlog = { open: open, close: close };

})(window.RT);
