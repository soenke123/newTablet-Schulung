/* ── DEBUG TOOL ────────────────────────────────────────────────────────────
   Entfernen: diese Datei löschen + den <script>-Tag in index.html entfernen.
   Keine anderen Dateien werden verändert.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Warten bis alle RT-Module geladen sind
  function init() {
    if (!window.RT || !RT.state || !RT.screens || !RT.techtree || !RT.bus) {
      setTimeout(init, 80);
      return;
    }
    injectStyles();
    registerKeys();
    registerMagicFinger();
  }

  // ── CSS ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    var s = document.createElement('style');
    s.id = 'dbg-styles';
    s.textContent =
      '#dbg-panel{position:fixed;top:56px;right:0;width:256px;' +
      'background:#0f172a;color:#e2e8f0;font:12px/1.5 monospace;' +
      'border:1px solid #1e293b;border-right:none;border-radius:10px 0 0 10px;' +
      'padding:14px 14px 16px;z-index:99999;' +
      'box-shadow:-6px 8px 32px rgba(0,0,0,.7);' +
      'transform:translateX(100%);transition:transform .22s ease;' +
      'max-height:88vh;overflow-y:auto;}' +
      '#dbg-panel.dbg-open{transform:translateX(0);}' +
      '#dbg-panel h4{color:#4ade80;margin:0 0 6px;font-size:9px;' +
      'text-transform:uppercase;letter-spacing:1.2px;font-weight:bold;}' +
      '#dbg-panel hr{border:none;border-top:1px solid #1e293b;margin:10px 0;}' +
      '#dbg-panel label{display:block;margin:4px 0 2px;font-size:10px;color:#94a3b8;}' +
      '#dbg-panel .dbg-row{display:flex;gap:4px;margin-bottom:6px;align-items:stretch;}' +
      '#dbg-panel input[type=number]{flex:1;min-width:0;background:#020617;color:#f8fafc;' +
      'border:1px solid #334155;border-radius:4px;padding:4px 6px;font:11px monospace;}' +
      '#dbg-panel input[type=number]:focus{outline:none;border-color:#4ade80;}' +
      '#dbg-panel button{background:#1e293b;color:#cbd5e1;border:1px solid #334155;' +
      'border-radius:4px;padding:4px 9px;cursor:pointer;font:11px monospace;white-space:nowrap;' +
      'display:flex;align-items:center;justify-content:center;}' +
      '#dbg-panel button:hover{background:#334155;}' +
      '#dbg-panel .dbg-screens{display:flex;flex-wrap:wrap;gap:3px;}' +
      '#dbg-panel .dbg-screens button{font-size:10px;padding:3px 7px;}' +
      '#dbg-panel #dbg-mf-btn{width:100%;padding:8px;margin-top:2px;gap:6px;}' +
      '#dbg-panel #dbg-mf-btn.dbg-active{background:#450a0a;color:#f87171;border-color:#7f1d1d;}' +
      '#dbg-close{position:absolute;top:6px;right:9px;background:none;border:none;' +
      'color:#475569;cursor:pointer;font:15px/1 monospace;padding:3px 5px;}' +
      '#dbg-close:hover{color:#94a3b8;}' +
      '#dbg-status{font-size:10px;color:#64748b;margin:-4px 0 8px;line-height:1.6;' +
      'background:#020617;border-radius:4px;padding:5px 7px;border:1px solid #1e293b;}' +

      // Magischer Finger: Hover-Highlight auf verfügbare/laufende Nodes
      '.dbg-mf-on .rt-tt-node--available{cursor:crosshair!important;' +
      'outline:2px dashed #f87171!important;outline-offset:3px;}' +
      '.dbg-mf-on .rt-tt-node--in_progress{cursor:crosshair!important;' +
      'outline:2px dashed #fb923c!important;outline-offset:3px;}';
    document.head.appendChild(s);
  }

  // ── Panel HTML ───────────────────────────────────────────────────────────
  var panel = null;
  var magicFinger = false;

  function buildPanel() {
    var el = document.createElement('div');
    el.id = 'dbg-panel';
    el.innerHTML =
      '<button id="dbg-close">✕</button>' +
      '<div style="font-size:13px;font-weight:bold;color:#4ade80;margin-bottom:8px;">🐛 Debug</div>' +
      '<div id="dbg-status">–</div>' +

      '<h4>Ressourcen</h4>' +
      '<label>Geld (€)</label>' +
      '<div class="dbg-row">' +
        '<input type="number" id="dbg-money" placeholder="Betrag" min="0">' +
        '<button id="dbg-money-add">+1k</button>' +
        '<button id="dbg-money-set">Set</button>' +
      '</div>' +
      '<label>User</label>' +
      '<div class="dbg-row">' +
        '<input type="number" id="dbg-users" placeholder="Anzahl" min="0">' +
        '<button id="dbg-users-set">Set</button>' +
      '</div>' +
      '<label>Server-Kapazität</label>' +
      '<div class="dbg-row">' +
        '<input type="number" id="dbg-server" placeholder="Slots" min="0">' +
        '<button id="dbg-server-set">Set</button>' +
      '</div>' +
      '<label>Server Software-Last</label>' +
      '<div class="dbg-row">' +
        '<input type="number" id="dbg-server-sw" placeholder="Slots" min="0">' +
        '<button id="dbg-server-sw-set">Set</button>' +
      '</div>' +
      '<label>Server User-Last</label>' +
      '<div class="dbg-row">' +
        '<input type="number" id="dbg-server-usr" placeholder="Slots" min="0">' +
        '<button id="dbg-server-usr-set">Set</button>' +
      '</div>' +

      '<hr>' +
      '<h4>Screen-Jump</h4>' +
      '<div class="dbg-screens">' +
        '<button data-screen="intro">Intro</button>' +
        '<button data-screen="garage">Garage</button>' +
        '<button data-screen="campus">Campus</button>' +
        '<button data-screen="expansion">Expansion</button>' +
      '</div>' +

      '<hr>' +
      '<h4>Team-Stufe</h4>' +
      '<div class="dbg-screens" id="dbg-team-row">' +
        '<button data-team-stufe="0">Solo</button>' +
        '<button data-team-stufe="1">Duo</button>' +
        '<button data-team-stufe="2">Quartet</button>' +
        '<button data-team-stufe="3">Klein</button>' +
        '<button data-team-stufe="4">Team</button>' +
        '<button data-team-stufe="5">Groß</button>' +
        '<button data-team-stufe="6">Studio</button>' +
      '</div>' +

      '<hr>' +
      '<h4>Tools</h4>' +
      '<button id="dbg-mf-btn">🫵 Magischer Finger: AUS</button>';
    return el;
  }

  function refreshStatus() {
    if (!panel) return;
    var s = RT.state.get();
    var r = s.resources || {};
    var teamName = RT.team ? RT.team.getName() : '–';
    var teamSlots = RT.slots ? (RT.slots.used() + '/' + RT.slots.capacity()) : '–';
    panel.querySelector('#dbg-status').innerHTML =
      '💰 €' + Math.round(r.money || 0).toLocaleString('de-DE') +
      ' &nbsp;|&nbsp; 👤 ' + Math.round(r.users || 0).toLocaleString('de-DE') +
      '<br>🖥️ ' + (r.serverCapacity || 0) + ' Kap · SW:' + (r.serverSoftwareUsage || 0) + ' USR:' + (r.serverUsage || 0) +
      '<br>👥 ' + teamName + ' · Slots ' + teamSlots +
      '<br>📅 Monat ' + (s.month || 0) + ' · Phase: ' + (s.phase || '–');
  }

  function attachEvents(el) {
    el.querySelector('#dbg-close').addEventListener('click', function () {
      el.classList.remove('dbg-open');
    });

    el.querySelector('#dbg-money-add').addEventListener('click', function () {
      RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: 1000 });
      refreshStatus();
    });

    el.querySelector('#dbg-money-set').addEventListener('click', function () {
      var inp = el.querySelector('#dbg-money');
      var v = parseFloat(inp.value);
      if (!isNaN(v) && inp.value.trim() !== '') {
        RT.state.dispatch('SET_RESOURCE', { key: 'money', value: v });
        inp.value = '';
        refreshStatus();
      }
    });

    el.querySelector('#dbg-users-set').addEventListener('click', function () {
      var inp = el.querySelector('#dbg-users');
      var v = parseInt(inp.value, 10);
      if (!isNaN(v) && inp.value.trim() !== '') {
        RT.state.dispatch('SET_RESOURCE', { key: 'users', value: v });
        inp.value = '';
        refreshStatus();
      }
    });

    el.querySelector('#dbg-server-set').addEventListener('click', function () {
      var inp = el.querySelector('#dbg-server');
      var v = parseInt(inp.value, 10);
      if (!isNaN(v) && inp.value.trim() !== '') {
        RT.state.dispatch('SET_RESOURCE', { key: 'serverCapacity', value: v });
        inp.value = '';
        refreshStatus();
      }
    });

    el.querySelector('#dbg-server-sw-set').addEventListener('click', function () {
      var inp = el.querySelector('#dbg-server-sw');
      var v = parseInt(inp.value, 10);
      if (!isNaN(v) && inp.value.trim() !== '') {
        RT.state.dispatch('SET_RESOURCE', { key: 'serverSoftwareUsage', value: v });
        inp.value = '';
        refreshStatus();
      }
    });

    el.querySelector('#dbg-server-usr-set').addEventListener('click', function () {
      var inp = el.querySelector('#dbg-server-usr');
      var v = parseInt(inp.value, 10);
      if (!isNaN(v) && inp.value.trim() !== '') {
        RT.state.dispatch('SET_RESOURCE', { key: 'serverUsage', value: v });
        inp.value = '';
        refreshStatus();
      }
    });

    // Enter-Taste in Inputs triggert Set
    el.querySelectorAll('input[type=number]').forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var sibBtn = inp.parentNode.querySelector('button:last-child');
          if (sibBtn) sibBtn.click();
        }
      });
    });

    el.querySelectorAll('[data-screen]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var scr = btn.getAttribute('data-screen');
        var player = RT.state.get().player;
        RT.clock.stop();

        if (scr === 'intro') {
          RT.state.dispatch('RESET');
        } else if (scr === 'garage') {
          RT.state.dispatch('RESTORE_STATE', {
            phase: 'garage', month: 0, goLiveUnlocked: false, player: player, teamStufe: 0,
            resources: { money: 1000, users: 0, serverCapacity: 3000, serverUsage: 0,
                         workers: { occupied: 0, max: 1, capacity: 1 } },
            buildings: [], research: {}, purchases: {},
            techtree: {}, pendingCelebrations: [],
            campaigns: [],
            supportProgram: { active: false, tier: 0, workers: 0, costPerMonth: 30000, buildingGridSlot: -1, workSlotIndex: -1 },
            ccState: { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false },
            userGrowthRate: 0,
            transactions: [], sparkHistory: { money: [], users: [] },
            meta: { gameStarted: true, gameEnded: false }
          });
        } else if (scr === 'campus') {
          RT.state.dispatch('RESTORE_STATE', {
            phase: 'campus', month: 4, goLiveUnlocked: true, player: player, teamStufe: 0,
            marcusDealAccepted: false,
            expansionStartMonth: null, werbekriseActive: false, storyLog: [],
            resources: { money: 50000, users: 1200, serverCapacity: 10000,
                         serverSoftwareUsage: 500, serverUsage: 1200,
                         workers: { occupied: 0, max: 1, capacity: 1 } },
            buildings: [], research: {},
            purchases: { server1: true, rechner: true },
            techtree: { frontend1: 'done', backend1: 'done', account: 'done',
                        feed: 'done', bilder: 'done',
                        mk_freunde: 'done', mk_flyer: 'done', wb_coop: 'done' },
            pendingCelebrations: [], campaigns: [],
            supportProgram: { active: false, tier: 0, workers: 0, costPerMonth: 30000, buildingGridSlot: -1, workSlotIndex: -1 },
            ccState: { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false },
            userGrowthRate: 0.15,
            reputation: 0.02,
            transactions: [], sparkHistory: { money: [], users: [] },
            meta: { gameStarted: true, gameEnded: false,
                    seenTabMarketing: true, seenTabWerbung: true }
          });
        } else if (scr === 'expansion') {
          RT.state.dispatch('RESTORE_STATE', {
            phase: 'expansion', month: 24, goLiveUnlocked: true, marcusDealAccepted: true,
            expansionStartMonth: 24, werbekriseActive: false, storyLog: [],
            player: player, teamStufe: 3,
            resources: {
              money: 500000, users: 505000,
              serverCapacity: 610000, serverSoftwareUsage: 19400, serverUsage: 505000,
              workers: { occupied: 0, max: 4, capacity: 4 }
            },
            buildings: [
              { type: 'werbeagentur',    slot: 1, level: 0 },
              { type: 'marketingstudio', slot: 2, level: 0 },
              { type: 'serverfarm',      slot: 3, level: 1, structLevel: 1, expansionTier: 1 },
              { type: 'serverfarm',      slot: 4, level: 1, structLevel: 1, expansionTier: 1 }
            ],
            research: {},
            purchases: { server1: true, rechner: true },
            techtree: {
              frontend1: 'done', backend1: 'done', frontend2: 'done',
              account: 'done',   backend2: 'done',
              feed: 'done',      bilder: 'done',
              like: 'done',      kommentar: 'done', teilen: 'done',
              logoNeu: 'done',   dm: 'done',        gruppen: 'done',
              suche: 'done',     videos: 'done',
              mk_freunde: 'done', mk_flyer: 'done',
              mk_langzeit: 'done', mk_sprint: 'done', mk_nachhall: 'done',
              wb_coop: 'done', wb_display: 'done', wb_search: 'done', wb_video: 'done'
            },
            pendingCelebrations: [], campaigns: [],
            supportProgram: { active: false, tier: 0, workers: 0, costPerMonth: 30000, buildingGridSlot: -1, workSlotIndex: -1 },
            ccState: { donationCooldownUntil: 0, imageCooldownUntil: 0, imageCampaignActive: false },
            userGrowthRate: 0.15,
            reputation: 0.02,
            transactions: [], sparkHistory: { money: [], users: [] },
            werbeagentur: {
              workers: 0, capacity: 3, lastMonthRevenue: 0,
              settings: {
                banner:         { frequency: 10 },
                sponsored_post: { frequency: 10 },
                search_ad:      { frequency: 10 },
                video_ad:       { frequency: 10 }
              }
            },
            meta: { gameStarted: true, gameEnded: false,
                    seenTabMarketing: true, seenTabWerbung: true }
          });
        }

        RT.screens.show(scr);
        refreshStatus();
      });
    });

    el.querySelectorAll('[data-team-stufe]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stg = parseInt(btn.getAttribute('data-team-stufe'), 10);
        RT.state.dispatch('TEAM_SET_STAGE', { stage: stg });
        refreshStatus();
      });
    });

    el.querySelector('#dbg-mf-btn').addEventListener('click', function () {
      magicFinger = !magicFinger;
      this.textContent = '🫵 Magischer Finger: ' + (magicFinger ? 'AN' : 'AUS');
      this.classList.toggle('dbg-active', magicFinger);
      document.body.classList.toggle('dbg-mf-on', magicFinger);
    });
  }

  function togglePanel() {
    if (!panel) {
      panel = buildPanel();
      document.body.appendChild(panel);
      attachEvents(panel);
    }
    var opening = !panel.classList.contains('dbg-open');
    panel.classList.toggle('dbg-open', opening);
    if (opening) refreshStatus();
  }

  // ── Tastenkombination W+O ────────────────────────────────────────────────
  var _keys = {};
  function registerKeys() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      _keys[e.key.toLowerCase()] = true;
      if (_keys['w'] && _keys['o']) togglePanel();
    });
    document.addEventListener('keyup', function (e) {
      delete _keys[e.key.toLowerCase()];
    });
  }

  // ── Magischer Finger ─────────────────────────────────────────────────────
  // Klick auf verfügbaren/laufenden Node im Tech-Tree → sofort abschließen.
  // Voraussetzungen (requires, requiresPurchase, requiresGoLive, requiresUsers)
  // müssen erfüllt sein (erkennbar am CSS-Status des Node-Elements).
  function instantComplete(nodeId, nodeEl, wasInProgress) {
    var node = RT.techtree.getNode(nodeId);
    if (!node) return;
    var s = RT.state.get();

    if (!wasInProgress) {
      // Kostencheck
      if ((node.cost || 0) > 0 && (s.resources.money || 0) < node.cost) return;
      if ((node.cost || 0) > 0) {
        RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -node.cost });
      }
    } else {
      // Worker freigeben (wurden bei TECHTREE_START belegt)
      if ((node.workers || 0) > 0) {
        var w = s.resources.workers;
        RT.state.dispatch('SET_WORKERS', {
          occupied: Math.max(0, (w.occupied || 0) - node.workers)
        });
      }
    }

    RT.state.dispatch('TECHTREE_COMPLETE', { nodeId: nodeId });

    if (node.server) {
      RT.state.dispatch('ADD_RESOURCE', { key: 'serverSoftwareUsage', delta: node.server });
    }
    if (node.usersBonus) {
      RT.state.dispatch('ADD_RESOURCE', { key: 'users', delta: node.usersBonus });
    }
    if (node.moneyBonus) {
      RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: node.moneyBonus });
    }
    if (node.growthBonus) {
      RT.state.dispatch('ADD_GROWTH_RATE', { delta: node.growthBonus });
    }
    RT.bus.emit('techtree:completed', { nodeId: nodeId });

    // DOM sofort aktualisieren (vollständiges Re-Render folgt beim nächsten Clock-Tick)
    nodeEl.classList.remove('rt-tt-node--available', 'rt-tt-node--in_progress', 'rt-tt-node--locked');
    nodeEl.classList.add('rt-tt-node--done');
    var meta = nodeEl.querySelector('.rt-tt-node__meta');
    if (meta) meta.innerHTML = '<span class="rt-tt-badge rt-tt-badge--done">✓ Fertig</span>';

    refreshStatus();
  }

  function registerMagicFinger() {
    document.addEventListener('click', function (e) {
      if (!magicFinger) return;
      var nodeEl = e.target.closest ? e.target.closest('.rt-tt-node') : null;
      if (!nodeEl) return;
      var nodeId = nodeEl.getAttribute('data-id');
      if (!nodeId) return;

      var isAvail = nodeEl.classList.contains('rt-tt-node--available');
      var isRunning = nodeEl.classList.contains('rt-tt-node--in_progress');
      if (!isAvail && !isRunning) return;

      e.stopPropagation();
      e.preventDefault();
      instantComplete(nodeId, nodeEl, isRunning);
    }, true);
  }

  init();
})();
