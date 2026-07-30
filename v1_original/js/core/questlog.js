/* Questlog – zeigt Quests und Story-Nachrichten aus dem State. */
(function (RT) {
  'use strict';

  var QUESTS = [
    { id: 'q1', text: 'Entwickle die Software-Basis einer Onlineplattform, die Leute verbindet' },
    { id: 'q2', text: 'Erreiche 1.000 User' },
    { id: 'q3', text: 'Erreiche 500.000 User' },
    { id: 'q4', text: 'Erreiche 50.000.000 User' }
  ];

  var _panel               = null;
  var _isOpen              = false;
  var _badgeDismissed      = false;
  var _prevStatuses        = null;
  var _lastSeenStoryCount  = 0;
  var _storyDetailEl       = null;

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
      if (statuses[i] !== _prevStatuses[i] && (statuses[i] === 'active' || statuses[i] === 'done')) {
        _badgeDismissed = false;
        break;
      }
    }
  }

  function countUnreadStories() {
    var s = RT.state.get();
    return Math.max(0, ((s.storyLog || []).length) - _lastSeenStoryCount);
  }

  function updateBadge(statuses) {
    var badge = document.getElementById('rt-quest-badge');
    if (!badge) return;
    var hasNotable = false;
    for (var i = 0; i < statuses.length; i++) {
      if (statuses[i] === 'active' || statuses[i] === 'done') { hasNotable = true; break; }
    }
    var hasUnread = countUnreadStories() > 0;
    badge.style.display = ((hasNotable || hasUnread) && !_badgeDismissed && !_isOpen) ? '' : 'none';
  }

  function showStoryDetail(entry) {
    if (_storyDetailEl) { document.body.removeChild(_storyDetailEl); _storyDetailEl = null; }
    var mo = document.createElement('div');
    mo.className = 'rt-modal-overlay is-open';
    var bodyHtml = RT.ui.escapeHTML(entry.body || '').replace(/\n/g, '<br>');
    mo.innerHTML = '<div class="rt-modal rt-mk-modal" style="max-width:460px;">'
      + '<h2 class="rt-card__title" style="margin-bottom:6px;">' + RT.ui.escapeHTML(entry.title) + '</h2>'
      + '<p style="font-size:0.78em;opacity:0.5;margin-bottom:14px;">Monat ' + (entry.month || '?') + '</p>'
      + '<div style="font-size:0.88em;line-height:1.65;">' + bodyHtml + '</div>'
      + '<div class="rt-modal__actions" style="margin-top:16px;">'
      + '<button class="rt-btn rt-btn--primary" id="rt-story-detail-close">Schließen</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(mo);
    _storyDetailEl = mo;
    mo.querySelector('#rt-story-detail-close').addEventListener('click', function () {
      document.body.removeChild(mo); _storyDetailEl = null;
    });
    mo.addEventListener('click', function (e) {
      if (e.target === mo) { document.body.removeChild(mo); _storyDetailEl = null; }
    });
  }

  var ICONS = { done: '✓', active: '▶', locked: '🔒' };

  function render(statuses) {
    var s       = RT.state.get();
    var stories = (s.storyLog || []).slice();

    var html = '<div class="rt-quest-panel__title">📋 Quests</div><div class="rt-quest-list">';
    for (var i = 0; i < QUESTS.length; i++) {
      var st = statuses[i];
      if (st === 'locked') continue;
      html += '<div class="rt-quest-item rt-quest-item--' + st + '">'
            + '<span class="rt-quest-item__status">' + ICONS[st] + '</span>'
            + '<span class="rt-quest-item__text">' + RT.ui.escapeHTML(QUESTS[i].text) + '</span>'
            + '</div>';
    }
    html += '</div>';

    if (stories.length > 0) {
      html += '<div class="rt-quest-panel__title" style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);">📨 Nachrichten</div>'
            + '<div class="rt-quest-list">';
      for (var j = stories.length - 1; j >= 0; j--) {
        var entry = stories[j];
        html += '<div class="rt-quest-item rt-quest-item--active rt-quest-story" '
              + 'data-story-idx="' + j + '" style="cursor:pointer;flex-direction:column;align-items:flex-start;gap:4px;">'
              + '<div style="display:flex;align-items:center;gap:8px;width:100%;">'
              + '<span class="rt-quest-item__status">📩</span>'
              + '<span class="rt-quest-item__text" style="flex:1;">' + RT.ui.escapeHTML(entry.title) + '</span>'
              + '<span style="font-size:0.75em;opacity:0.45;flex-shrink:0;">M' + (entry.month || '?') + '</span>'
              + '</div>'
              + '</div>';
      }
      html += '</div>';
    }

    html += '<div class="rt-quest-panel__actions">'
          + '<button class="rt-btn rt-btn--ghost" id="rt-quest-close" '
          + 'style="padding:var(--rt-space-2) var(--rt-space-4);font-size:0.88rem;">Schließen</button>'
          + '</div>';

    _panel.innerHTML = html;
    _panel.querySelector('#rt-quest-close').addEventListener('click', close);

    var storyItems = _panel.querySelectorAll('.rt-quest-story');
    for (var k = 0; k < storyItems.length; k++) {
      (function (el, storyList) {
        el.addEventListener('click', function () {
          var idx = parseInt(el.getAttribute('data-story-idx'), 10);
          if (storyList[idx]) showStoryDetail(storyList[idx]);
        });
      }(storyItems[k], stories));
    }
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

  function open() {
    ensurePanel();
    _isOpen        = true;
    _badgeDismissed = true;
    var s = RT.state.get();
    _lastSeenStoryCount = (s.storyLog || []).length;
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

    RT.bus.on('storylog:changed', function () {
      _badgeDismissed = false;
      update();
    });

    RT.bus.on('story:show-popup', function (e) {
      if (!e || !e.id) return;
      var s = RT.state.get();
      var stories = s.storyLog || [];
      for (var pi = 0; pi < stories.length; pi++) {
        if (stories[pi].id === e.id) { showStoryDetail(stories[pi]); return; }
      }
    });

    RT.state.subscribe(function (s, action) {
      if (!action) return;
      if (action.type === 'SET_GOLIVE_UNLOCKED') update();
      if (action.type === 'RESTORE_STATE')        update();
      if (action.type === 'RESET') {
        _badgeDismissed     = false;
        _prevStatuses       = null;
        _isOpen             = false;
        _lastSeenStoryCount = 0;
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
