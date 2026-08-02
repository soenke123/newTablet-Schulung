/* Techtree — Phase-0-Hauptbaum (5 Nodes), im Layout-Stil aus v1.
   Zwei Ansichten: Baum (default) und Detail (nach Klick auf Node).
   Nutzt Feather-Icons via CDN (feather.replace() nach Render).
   SVG-Bezier-Verbindungen zwischen Nodes. */
(function (RT) {
  'use strict';

  // ── Tab-Konfiguration ─────────────────────────────────────────────────
  // Reihenfolge im UI. Marketing & Werbung erst nach goLiveUnlocked sichtbar.
  var TABS = [
    { id: 'entwicklung', label: 'Entwicklung', icon: '⚙️', requiresGoLive: false },
    { id: 'marketing',   label: 'Marketing',   icon: '📣', requiresGoLive: true  },
    { id: 'werbung',     label: 'Werbung',     icon: '📢', requiresGoLive: true  }
  ];

  // ── Node-Definitionen ─────────────────────────────────────────────────
  // tab: welcher Reiter — entwicklung (Kern-Baum) | marketing | werbung.
  // durationSec: 20 s = 1 v1-Monat.
  // server: belegt Programm-Kapazität in der ersten Serverfarm (visuell als Kiste).
  //         Nur entwicklung-Nodes brauchen Server-Kap + HQ-Slot; marketing/werbung
  //         laufen parallel, ohne HQ zu blockieren.
  // Belohnungen: usersBonus (einmalig +User), moneyBonus (einmalig +€),
  //              growthRatePerSec (dauerhaft +User/s, trend-unabhängig).
  // requiresGoLive: Node erst nach Plattform-Launch verfügbar.
  // requiresUsers: Mindest-User zum Starten.
  var NODES = {
    frontend1: {
      id: 'frontend1', tab: 'entwicklung', name: 'Frontend v1', icon: 'monitor',
      durationSec: 20, server: 500, cost: 0,
      effect: 'Basis-Infrastruktur. Voraussetzung für Account-System.',
      effectFull: 'Du baust die visuelle Seite der Plattform. User können sie im Browser aufrufen. Voraussetzung für alle weiteren Features.',
      requires: [],
      requiresPurchase: ['rechner'],
      requiresBuilding: 'farm'
    },
    backend1: {
      id: 'backend1', tab: 'entwicklung', name: 'Backend v1', icon: 'server',
      durationSec: 20, server: 500, cost: 0,
      effect: 'Basis-Infrastruktur. Ermöglicht Datenspeicherung.',
      effectFull: 'Die unsichtbare Seite der Plattform: Server-Logik, Datenbank, API. Ohne Backend keine User-Daten.',
      requires: [],
      requiresPurchase: [],
      requiresBuilding: 'farm'
    },
    account: {
      id: 'account', tab: 'entwicklung', name: 'Account-System', icon: 'user',
      durationSec: 10, server: 300, cost: 0,
      effect: 'Voraussetzung für Feed & Bilder.',
      effectFull: 'User können Konten erstellen, sich einloggen und Profile anlegen. Voraussetzung für Feed und Bilder.',
      requires: ['frontend1', 'backend1'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    feed: {
      id: 'feed', tab: 'entwicklung', name: 'News-Feed', icon: 'list',
      durationSec: 5, server: 300, cost: 0,
      effect: 'User sehen Inhalte. Voraussetzung für Werbung.',
      effectFull: 'Chronologischer Feed: User können posten und Beiträge anderer sehen. Voraussetzung für Like, Kommentar, Teilen und erste Werbung.',
      requires: ['account'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    bilder: {
      id: 'bilder', tab: 'entwicklung', name: 'Bilder hochladen', icon: 'image',
      durationSec: 5, server: 300, cost: 0,
      effect: 'Erhöht Posting-Frequenz. Voraussetzung für Videos.',
      effectFull: 'User können Fotos zu Beiträgen hinzufügen. Erhöht die Posting-Häufigkeit und Verweildauer.',
      requires: ['account'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    // ── Marketing (nach Go-Live) ────────────────────────────────────────
    mk_freunde: {
      id: 'mk_freunde', tab: 'marketing', name: 'Freunden erzählen', icon: 'users',
      durationSec: 5, server: 0, cost: 0,
      effect: '+200 User (einmalig).',
      effectFull: 'Du erzählst deinen Freunden von der Plattform. Ein kleiner, aber sicherer Boost.',
      usersBonus: 200,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true
    },
    mk_flyer: {
      id: 'mk_flyer', tab: 'marketing', name: 'Flyer verteilen', icon: 'file-text',
      durationSec: 5, server: 0, cost: 20,
      effect: '+500 User + Flyerbonus: alle 8 s ×1,10 (bis 1 000).',
      effectFull: 'Du verteilst Flyer im Kiez. +500 User sofort — und danach der Flyerbonus: alle 8 Sekunden wachsen die aktuellen User um 10 % (Zinseszins), bis du die Marke von 1 000 knackst.',
      usersBonus: 500,
      activatesFlyerBonus: true,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true
    },
    // ── Werbung (nach Go-Live) ──────────────────────────────────────────
    wb_coop: {
      id: 'wb_coop', tab: 'werbung', name: 'Erste Kooperation', icon: 'briefcase',
      durationSec: 60, server: 0, cost: 0,
      effect: 'Läuft 60 s, dann +300 €. Braucht ≥ 200 User.',
      effectFull: 'Ein lokaler Laden bucht bei dir eine kleine Werbekooperation. Nach 60 Sekunden bekommst du 300 €.',
      moneyBonus: 300,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true,
      requiresUsers: 200
    }
  };

  var NODE_ORDER = ['frontend1', 'backend1', 'account', 'feed', 'bilder'];

  // Spaltenzuordnung fürs Layout (nur entwicklung-Tab — die anderen Tabs
  // zeigen ihre Nodes als einfaches Grid ohne SVG-Verbindungen).
  var COLS = [
    ['frontend1', 'backend1'],
    ['account'],
    ['feed', 'bilder']
  ];

  // Kanten für die SVG-Verbindungslinien (nur entwicklung).
  var EDGES = [
    { from: 'frontend1', to: 'account' },
    { from: 'backend1',  to: 'account' },
    { from: 'account',   to: 'feed'    },
    { from: 'account',   to: 'bilder'  }
  ];

  // ── Status-Helper ─────────────────────────────────────────────────────
  function nodeStatus(nodeId) {
    var s   = RT.state.current;
    var tt  = s.techtree || {};
    var def = NODES[nodeId];
    if (!def) return 'locked';
    var entry = tt[nodeId];
    if (entry && entry.status === 'done')        return 'done';
    if (entry && entry.status === 'ready')       return 'ready';
    if (entry && entry.status === 'in_progress') return 'in_progress';

    for (var i = 0; i < def.requires.length; i++) {
      var pre = tt[def.requires[i]];
      if (!pre || pre.status !== 'done') return 'locked';
    }
    for (var j = 0; j < def.requiresPurchase.length; j++) {
      if (!s.purchases[def.requiresPurchase[j]]) return 'locked';
    }
    if (def.requiresBuilding) {
      if (RT.state.instancesByType(def.requiresBuilding).length === 0) return 'locked';
    }
    if (def.requiresGoLive && !s.goLiveUnlocked) return 'locked';
    if (def.requiresUsers && (s.users || 0) < def.requiresUsers) return 'locked';
    return 'available';
  }

  function lockReasons(nodeId) {
    var s   = RT.state.current;
    var tt  = s.techtree || {};
    var def = NODES[nodeId];
    var out = [];
    if (!def) return out;
    for (var i = 0; i < def.requires.length; i++) {
      var pre = tt[def.requires[i]];
      if (!pre || pre.status !== 'done') {
        out.push('Node „' + (NODES[def.requires[i]] || { name: def.requires[i] }).name + '" muss fertig sein');
      }
    }
    var shopNames = { rechner: '💻 Rechner (Shop)' };
    for (var j = 0; j < def.requiresPurchase.length; j++) {
      var pid = def.requiresPurchase[j];
      if (!s.purchases[pid]) out.push(shopNames[pid] || pid + ' (Shop)');
    }
    if (def.requiresBuilding) {
      if (RT.state.instancesByType(def.requiresBuilding).length === 0) {
        var typeName = (RT.state.BUILDING_TYPES[def.requiresBuilding] || { name: def.requiresBuilding }).name;
        out.push(typeName + ' bauen');
      }
    }
    if (def.requiresGoLive && !s.goLiveUnlocked) {
      out.push('Plattform muss online sein');
    }
    if (def.requiresUsers && (s.users || 0) < def.requiresUsers) {
      out.push('Mind. ' + def.requiresUsers + ' User');
    }
    return out;
  }

  function activeNode() {
    var tt = RT.state.current.techtree || {};
    for (var nid in tt) {
      if (tt[nid] && tt[nid].status === 'in_progress') {
        return { id: nid, entry: tt[nid], def: NODES[nid] };
      }
    }
    return null;
  }

  // Node, die abholbereit ist (Zeit abgelaufen, wartet auf Klick).
  function readyNode() {
    var tt = RT.state.current.techtree || {};
    for (var nid in tt) {
      if (tt[nid] && tt[nid].status === 'ready') {
        return { id: nid, entry: tt[nid], def: NODES[nid] };
      }
    }
    return null;
  }

  // HQ-Slot-Blocker: nur entwicklung-Nodes belegen das HQ. Marketing/Werbung
  // laufen parallel und blockieren nichts.
  function entwicklungActive() {
    var a = activeNode();
    return (a && a.def && a.def.tab === 'entwicklung') ? a : null;
  }
  function entwicklungReady() {
    var r = readyNode();
    return (r && r.def && r.def.tab === 'entwicklung') ? r : null;
  }

  // Progress einer bestimmten Node (0..1). Nur sinnvoll bei in_progress.
  function progressOf(nodeId) {
    var entry = (RT.state.current.techtree || {})[nodeId];
    var def   = NODES[nodeId];
    if (!entry || !def || entry.status !== 'in_progress') return 0;
    var elapsed = (Date.now() - entry.startAt) / 1000;
    return Math.max(0, Math.min(1, elapsed / def.durationSec));
  }
  // Legacy-Alias, wird in bestehendem Code noch verwendet.
  function activeProgress() {
    var a = activeNode();
    return a ? progressOf(a.id) : null;
  }

  // True wenn alle 5 Phase-0-Nodes 'done' sind. Voraussetzung für Online-Gang.
  function allPhase0Done() {
    var tt = RT.state.current.techtree || {};
    for (var i = 0; i < NODE_ORDER.length; i++) {
      var e = tt[NODE_ORDER[i]];
      if (!e || e.status !== 'done') return false;
    }
    return true;
  }

  // ── Modal-State ───────────────────────────────────────────────────────
  var viewState = { detailNodeId: null, activeTab: 'entwicklung' };
  var refreshTimer = null;

  function tabVisible(tabId) {
    var s = RT.state.current;
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id !== tabId) continue;
      if (TABS[i].requiresGoLive && !s.goLiveUnlocked) return false;
      return true;
    }
    return false;
  }

  function open() {
    viewState.detailNodeId = null;
    if (!tabVisible(viewState.activeTab)) viewState.activeTab = 'entwicklung';
    renderModal();
  }

  // ── Rendering: Node-Card (im Baum) ────────────────────────────────────
  function badgeForStatus(st, def) {
    if (st === 'done')        return '<span class="rt-tt-badge rt-tt-badge--done">✓ Fertig</span>';
    if (st === 'ready')       return '<span class="rt-tt-badge rt-tt-badge--collect">✓ Abholen!</span>';
    if (st === 'in_progress') return '<span class="rt-tt-badge rt-tt-badge--progress">⏳ In Arbeit</span>';
    if (st === 'locked')      return '<span class="rt-tt-badge rt-tt-badge--locked">🔒 Gesperrt</span>';
    return '<span class="rt-tt-badge rt-tt-badge--ready">Bereit · ' + def.durationSec + ' s</span>';
  }

  function nodeCardHtml(def) {
    var st = nodeStatus(def.id);
    return ''
      + '<div class="rt-tt-node rt-tt-node--' + st + '" data-id="' + def.id + '">'
      + '  <div class="rt-tt-node__ico"><i data-feather="' + def.icon + '"></i></div>'
      + '  <div class="rt-tt-node__body">'
      + '    <div class="rt-tt-node__name">' + def.name + '</div>'
      + '    <div class="rt-tt-node__fx">' + def.effect + '</div>'
      + '    <div class="rt-tt-node__meta">' + badgeForStatus(st, def) + '</div>'
      + '  </div>'
      + '</div>';
  }

  // ── Rendering: Tab-Leiste ─────────────────────────────────────────────
  function tabsHtml() {
    var s = RT.state.current;
    var out = '<div class="rt-tt-tabs">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      if (!tabVisible(t.id)) continue;
      var active = (viewState.activeTab === t.id) ? ' rt-tt-tab--active' : '';
      // Badge nur zeigen, wenn der Key explizit im seenBadges-Schema steht
      // (entwicklung z.B. hat keinen Key und soll nie ein "!" bekommen).
      var badgeKey = 'tab_' + t.id;
      var hasKey   = s.seenBadges && (badgeKey in s.seenBadges);
      var badge    = (hasKey && !s.seenBadges[badgeKey])
        ? '<span class="rt-notif-badge">!</span>' : '';
      out += '<button class="rt-tt-tab' + active + '" data-tab="' + t.id + '">'
           + t.icon + ' ' + t.label + badge + '</button>';
    }
    out += '</div>';
    return out;
  }

  // ── Rendering: Entwicklung-Baum (COLS/EDGES + SVG) ────────────────────
  function entwicklungTreeHtml() {
    var colsHtml = '';
    for (var i = 0; i < COLS.length; i++) {
      var col = COLS[i];
      var colHtml = '';
      for (var j = 0; j < col.length; j++) {
        var def = NODES[col[j]];
        if (def) colHtml += nodeCardHtml(def);
      }
      colsHtml += '<div class="rt-tt-col">' + colHtml + '</div>';
    }
    return ''
      + '<div class="rt-tt-grid-wrap" id="rt-tt-grid-wrap">'
      + '  <svg class="rt-tt-svg" id="rt-tt-svg"></svg>'
      + '  <div class="rt-tt-grid" id="rt-tt-grid">' + colsHtml + '</div>'
      + '</div>';
  }

  // ── Rendering: einfache Liste (Marketing/Werbung) ─────────────────────
  function simpleListHtml(tabId) {
    var cards = '';
    for (var nid in NODES) {
      if (!Object.prototype.hasOwnProperty.call(NODES, nid)) continue;
      var def = NODES[nid];
      if (def.tab !== tabId) continue;
      cards += nodeCardHtml(def);
    }
    if (!cards) {
      return '<p class="rt-tt-hint">Noch keine Nodes in diesem Reiter.</p>';
    }
    return '<div class="rt-tt-simple">' + cards + '</div>';
  }

  // Wählt das passende Rendering für den aktiven Reiter.
  function treeContentHtml() {
    if (viewState.activeTab === 'entwicklung') return entwicklungTreeHtml();
    return simpleListHtml(viewState.activeTab);
  }

  // ── Rendering: Detail-Ansicht ─────────────────────────────────────────
  function detailContentHtml(nodeId) {
    var def = NODES[nodeId];
    if (!def) return '';
    var s  = RT.state.current;
    var st = nodeStatus(nodeId);

    var actionHtml = '';
    if (st === 'done') {
      actionHtml = '<span class="rt-tt-badge rt-tt-badge--done" style="font-size:0.9rem;padding:8px 16px;">✓ Fertig</span>';
    } else if (st === 'ready') {
      actionHtml = ''
        + '<p class="rt-tt-detail__note">Fertig entwickelt — klick zum Abschließen.</p>'
        + '<button class="rt-btn-tt rt-btn-tt--collect" data-complete="' + nodeId + '">✓ Abschließen</button>';
    } else if (st === 'in_progress') {
      var prog = progressOf(nodeId);
      actionHtml = ''
        + '<div class="rt-tt-detail__progress">'
        + '  <div class="rt-tt-detail__progress-bar" style="width:' + (prog * 100).toFixed(1) + '%"></div>'
        + '</div>'
        + '<span class="rt-tt-badge rt-tt-badge--progress" style="font-size:0.9rem;padding:8px 16px;">⏳ Läuft… (' + Math.max(0, Math.ceil((1 - prog) * def.durationSec)) + ' s)</span>';
    } else if (st === 'locked') {
      var reasons = lockReasons(nodeId);
      actionHtml = ''
        + '<div class="rt-tt-detail__lock">'
        + '  Benötigt: ' + reasons.join(', ')
        + '</div>'
        + '<button class="rt-btn-tt" disabled>🔒 Gesperrt</button>';
    } else {
      // HQ-Slot blockiert nur entwicklung-Nodes. Marketing/Werbung laufen parallel.
      var isEntw     = (def.tab === 'entwicklung');
      var anyRunning = isEntw && !!entwicklungActive();
      var anyReady   = isEntw && !!entwicklungReady();
      var affordable = s.money >= def.cost;
      if (anyReady) {
        actionHtml = ''
          + '<p class="rt-tt-detail__note">Erst die abholbereite Entwicklung abschließen.</p>'
          + '<button class="rt-btn-tt" disabled>HQ ist besetzt</button>';
      } else if (anyRunning) {
        actionHtml = ''
          + '<p class="rt-tt-detail__note">Es läuft schon eine andere Entwicklung im HQ — bitte warten.</p>'
          + '<button class="rt-btn-tt" disabled>HQ ist besetzt</button>';
      } else if (!affordable) {
        actionHtml = ''
          + '<p class="rt-tt-detail__note">Zu wenig Geld — benötigt: ' + def.cost + ' €</p>'
          + '<button class="rt-btn-tt" disabled>Zu teuer</button>';
      } else {
        var label = isEntw ? '▶ Entwickeln' : '▶ Starten';
        actionHtml = '<button class="rt-btn-tt rt-btn-tt--primary" data-develop="' + nodeId + '">' + label + '</button>';
      }
    }

    var chips = '';
    chips += def.cost > 0
      ? '<span class="rt-tt-chip rt-tt-chip--cost">💰 ' + def.cost + ' €</span>'
      : '<span class="rt-tt-chip rt-tt-chip--cost">kostenlos</span>';
    chips += '<span class="rt-tt-chip rt-tt-chip--dur">⏱ ' + def.durationSec + ' s</span>';
    if (def.server > 0) {
      chips += '<span class="rt-tt-chip rt-tt-chip--srv">🖥 +' + def.server + '</span>';
    }
    if (def.usersBonus)          chips += '<span class="rt-tt-chip rt-tt-chip--reward">👥 +' + def.usersBonus + '</span>';
    if (def.moneyBonus)          chips += '<span class="rt-tt-chip rt-tt-chip--reward">💰 +' + def.moneyBonus + ' €</span>';
    if (def.activatesFlyerBonus) chips += '<span class="rt-tt-chip rt-tt-chip--reward">📈 Flyerbonus: ×1,10 alle 8 s</span>';

    return ''
      + '<button class="rt-btn-tt rt-btn-tt--ghost rt-tt-back" id="rt-tt-back">← Zurück</button>'
      + '<div class="rt-tt-detail">'
      + '  <div class="rt-tt-detail__cols">'
      + '    <div class="rt-tt-detail__main">'
      + '      <div class="rt-tt-detail__header">'
      + '        <div class="rt-tt-detail__ico"><i data-feather="' + def.icon + '"></i></div>'
      + '        <h3 class="rt-tt-detail__name">' + def.name + '</h3>'
      + '      </div>'
      + '      <p class="rt-tt-detail__fx">' + def.effectFull + '</p>'
      + '    </div>'
      + '    <div class="rt-tt-detail__right">'
      + '      <div class="rt-tt-detail__res-head">Ressourcen</div>'
      + '      <div class="rt-tt-detail__chips">' + chips + '</div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '<div class="rt-tt-actions">' + actionHtml + '</div>';
  }

  // ── SVG-Bezier-Verbindungen ───────────────────────────────────────────
  function drawConnections(root) {
    var wrap = root.querySelector('#rt-tt-grid-wrap');
    var svg  = root.querySelector('#rt-tt-svg');
    if (!wrap || !svg) return;

    var wR = wrap.getBoundingClientRect();
    svg.setAttribute('width',  wR.width);
    svg.setAttribute('height', wR.height);
    svg.innerHTML = '';

    var NS    = 'http://www.w3.org/2000/svg';
    var COLOR = 'rgba(139, 90, 43, 0.55)'; // Wood-Ton aus v3

    EDGES.forEach(function (edge) {
      var fromEl = root.querySelector('[data-id="' + edge.from + '"]');
      var toEl   = root.querySelector('[data-id="' + edge.to   + '"]');
      if (!fromEl || !toEl) return;

      var fR = fromEl.getBoundingClientRect();
      var tR = toEl.getBoundingClientRect();

      var sameCol = fR.left < tR.right && tR.left < fR.right;
      var pX, pY, cX, cY, d;
      if (sameCol) {
        pX = fR.left + fR.width / 2 - wR.left;
        pY = fR.bottom              - wR.top;
        cX = tR.left + tR.width / 2 - wR.left;
        cY = tR.top                 - wR.top;
        var my = (pY + cY) / 2;
        d = 'M ' + pX + ' ' + pY + ' C ' + pX + ' ' + my + ', ' + cX + ' ' + my + ', ' + cX + ' ' + cY;
      } else {
        pX = fR.right             - wR.left;
        pY = fR.top + fR.height/2 - wR.top;
        cX = tR.left              - wR.left;
        cY = tR.top + tR.height/2 - wR.top;
        var mx = (pX + cX) / 2;
        d = 'M ' + pX + ' ' + pY + ' C ' + mx + ' ' + pY + ', ' + mx + ' ' + cY + ', ' + cX + ' ' + cY;
      }

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', COLOR);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    });
  }

  // ── Modal-Rendering ───────────────────────────────────────────────────
  function renderModal() {
    var body    = document.getElementById('modal-body');
    var title   = document.getElementById('modal-title');
    var backdrop= document.getElementById('modal-backdrop');
    var modal   = document.getElementById('modal');
    if (!body || !title || !backdrop) return;

    title.textContent = 'HQ — Entwicklung';

    var content;
    if (viewState.detailNodeId) {
      content = detailContentHtml(viewState.detailNodeId);
    } else {
      content = tabsHtml()
              + '<p class="rt-tt-hint">Tippe auf einen Baustein für Details.</p>'
              + treeContentHtml();
    }
    body.innerHTML = content;
    if (modal) modal.classList.add('modal-lg');
    backdrop.classList.add('open');

    // Feather-Icons ersetzen
    if (window.feather && typeof window.feather.replace === 'function') {
      window.feather.replace();
    }

    // Tab-Klick → Reiter wechseln
    var tabEls = body.querySelectorAll('.rt-tt-tab[data-tab]');
    tabEls.forEach(function (tabEl) {
      tabEl.addEventListener('click', function () {
        var tabId = tabEl.getAttribute('data-tab');
        viewState.activeTab = tabId;
        RT.state.markSeen('tab_' + tabId);
        renderModal();
      });
    });

    // Node-Klick → Detail-Ansicht
    var nodeEls = body.querySelectorAll('.rt-tt-node[data-id]');
    nodeEls.forEach(function (nodeEl) {
      nodeEl.addEventListener('click', function () {
        viewState.detailNodeId = nodeEl.getAttribute('data-id');
        renderModal();
      });
    });

    // Zurück-Button
    var backBtn = body.querySelector('#rt-tt-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        viewState.detailNodeId = null;
        renderModal();
      });
    }

    // Entwickeln-Button — schließt Modal, damit man den Fortschritt am HQ sieht
    var devBtn = body.querySelector('[data-develop]');
    if (devBtn) {
      devBtn.addEventListener('click', function () {
        var nid = devBtn.getAttribute('data-develop');
        var res = RT.actions.startTechNode(nid);
        if (!res.ok) {
          RT.bus.emit('toast', res.msg || 'Kann nicht gestartet werden');
        } else {
          stopAutoRefresh();
          if (RT.ui && RT.ui.closeModal) RT.ui.closeModal();
        }
      });
    }

    // Abschließen-Button — schließt Modal, damit man das Feuerwerk am HQ sieht
    var completeBtn = body.querySelector('[data-complete]');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        var nid = completeBtn.getAttribute('data-complete');
        var def = NODES[nid];
        var res = RT.actions.completeTechNode(nid);
        if (!res.ok) { RT.bus.emit('toast', res.msg || 'Kann nicht abgeschlossen werden'); return; }
        stopAutoRefresh();
        if (RT.ui && RT.ui.closeModal) RT.ui.closeModal();
        // Feuerwerk am HQ auslösen
        var hq   = RT.state.instancesByType('hq')[0];
        var host = hq ? document.querySelector('.building[data-instance-id="' + hq.instanceId + '"]') : null;
        var world= document.getElementById('world');
        if (host && world && RT.ui && RT.ui.spawnFireworks) {
          var r  = host.getBoundingClientRect();
          var wr = world.getBoundingClientRect();
          var cx = r.left + r.width / 2 - wr.left;
          var cy = r.top  + r.height * 0.3 - wr.top;
          RT.ui.spawnFireworks(cx, cy);
        }
      });
    }

    // SVG-Verbindungen zeichnen nur in Entwicklung-Baum-Ansicht
    if (!viewState.detailNodeId && viewState.activeTab === 'entwicklung') {
      requestAnimationFrame(function () { drawConnections(body); });
    }

    startAutoRefresh();
  }

  // Auto-Refresh läuft NUR wenn die gerade betrachtete Node in_progress ist —
  // dort muss die Progress-Bar mit-updaten. In allen anderen Fällen kein
  // Refresh → verhindert dass Klicks verschluckt werden, weil renderModal()
  // den kompletten DOM inkl. Listener neu baut.
  function needsAutoRefresh() {
    var nid = viewState.detailNodeId;
    if (!nid) return false;
    var entry = (RT.state.current.techtree || {})[nid];
    return !!(entry && entry.status === 'in_progress');
  }
  function startAutoRefresh() {
    stopAutoRefresh();
    if (!needsAutoRefresh()) return;
    refreshTimer = setInterval(function () {
      var backdrop = document.getElementById('modal-backdrop');
      if (!backdrop || !backdrop.classList.contains('open')) {
        stopAutoRefresh();
        return;
      }
      var title = document.getElementById('modal-title');
      if (!title || title.textContent !== 'HQ — Entwicklung') {
        stopAutoRefresh();
        return;
      }
      if (!needsAutoRefresh()) {
        stopAutoRefresh();
        return;
      }
      renderModal();
    }, 500);
  }
  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // Bei state:changed neu rendern, falls Modal offen
  RT.bus.on('state:changed', function () {
    var backdrop = document.getElementById('modal-backdrop');
    var title    = document.getElementById('modal-title');
    if (backdrop && backdrop.classList.contains('open')
        && title && title.textContent === 'HQ — Entwicklung') {
      renderModal();
    }
  });

  RT.techtree = {
    NODES:          NODES,
    NODE_ORDER:     NODE_ORDER,
    EDGES:          EDGES,
    nodeStatus:     nodeStatus,
    lockReasons:    lockReasons,
    activeNode:     activeNode,
    readyNode:      readyNode,
    activeProgress: activeProgress,
    allPhase0Done:  allPhase0Done,
    open:           open
  };
})(window.RT3);
