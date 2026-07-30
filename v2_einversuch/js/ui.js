/* UI-Modul: DOM-Referenzen + Handler + Renderer.
   Reagiert auf 'state:changed' (Voll-Render) und 'state:tick' (nur Progress-Elemente). */
(function (RT) {
  'use strict';

  var el = {};
  var lastUsers = 0, lastMoney = 1000;

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n < 1e6)  return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
    if (n < 1e9)  return (n / 1e6).toFixed(1) + 'M';
    return (n / 1e9).toFixed(2) + ' Mrd';
  }

  function fmtMoney(n) {
    return fmt(n).replace('.', ',');
  }

  function pop(node) {
    if (!node) return;
    node.classList.remove('pop');
    // Force reflow, damit die Animation neu triggert
    void node.offsetWidth;
    node.classList.add('pop');
  }

  // --- Ressourcen-Bar ---
  function renderResources() {
    var s = RT.state.get();
    el.users.textContent = fmt(s.users);
    el.money.textContent = fmtMoney(s.money);
    // Ruf als Prozent
    var rufPct = (s.ruf * 100).toFixed(0);
    el.ruf.textContent = (s.ruf >= 0 ? '+' : '') + rufPct + '%';
    el.rufWrap.classList.toggle('pos', s.ruf > 0);
    el.rufWrap.classList.toggle('neg', s.ruf < 0);

    if (Math.floor(s.users) > lastUsers) { pop(el.users); lastUsers = Math.floor(s.users); }
    if (Math.floor(s.money) > lastMoney) { pop(el.money); lastMoney = Math.floor(s.money); }
  }

  // --- HQ ---
  function renderHq() {
    var s = RT.state.get();
    if (s.hq.currentId) {
      el.hqProgress.hidden = false;
      el.hqBadge.hidden = true;
    } else {
      // Wenn alle fertig → kein Badge nötig; sonst: Badge zeigt "klick mich"
      var anyLeft = RT.state.FEATURES.some(function (f) { return !s.hq.done[f.id]; });
      el.hqBadge.hidden = !anyLeft;
      el.hqProgress.hidden = true;
    }
  }

  function tickHq() {
    var s = RT.state.get();
    if (!s.hq.currentId) return;
    var feat = RT.state.FEATURES.find(function (f) { return f.id === s.hq.currentId; });
    if (!feat) return;
    var elapsed = (performance.now() - s.hq.startedAt) / 1000;
    var pct = Math.min(100, (elapsed / feat.duration) * 100);
    el.hqProgressFill.style.width = pct.toFixed(1) + '%';
  }

  // --- Werbeagentur ---
  function renderAd() {
    var s = RT.state.get();
    el.bAd.hidden = !s.ad.unlocked;
    if (!s.ad.unlocked) return;

    el.adSliderVal.textContent = Math.round(s.ad.slider * 100) + '%';
    el.adSlider.value = Math.round(s.ad.slider * 100);

    if (s.ad.coinReady) {
      el.adCoin.hidden = false;
      el.adWait.hidden = true;
      el.adCoinVal.textContent = '+' + fmtMoney(s.ad.coinValue) + ' €';
    } else {
      el.adCoin.hidden = true;
      el.adWait.hidden = false;
    }
  }

  function tickAd() {
    var s = RT.state.get();
    if (!s.ad.unlocked || s.ad.coinReady) return;
    var left = Math.max(0, (s.ad.nextCoinAt - performance.now()) / 1000);
    el.adWaitSec.textContent = Math.ceil(left);
  }

  // --- Marketing-Button ---
  function renderMarketing() { tickMarketing(); }
  function tickMarketing() {
    var s = RT.state.get();
    var now = performance.now();
    if (RT.state.marketingReady(now)) {
      el.btnMarketing.disabled = false;
      el.marketingSub.textContent = '+' + s.marketing.baseUsers + ' User';
    } else {
      el.btnMarketing.disabled = true;
      var left = RT.state.marketingCooldownLeft(now);
      el.marketingSub.textContent = 'Bereit in ' + Math.ceil(left) + 's';
    }
  }

  // --- Sidebar (Slot-Liste) ---
  function renderSidebar() {
    var s = RT.state.get();
    var items = [];

    if (s.hq.currentId) {
      var feat = RT.state.FEATURES.find(function (f) { return f.id === s.hq.currentId; });
      if (feat) {
        var elapsed = (performance.now() - s.hq.startedAt) / 1000;
        var pct = Math.min(100, (elapsed / feat.duration) * 100).toFixed(0);
        items.push(
          '<li class="slot" data-slot="hq">' +
            '<span class="slot-icon">🛠️</span>' +
            '<span>' + escapeHtml(feat.name) + '</span>' +
            '<span class="slot-progress-track"><span class="slot-progress-fill" style="width:' + pct + '%"></span></span>' +
          '</li>'
        );
      }
    }

    if (s.ad.unlocked) {
      if (s.ad.coinReady) {
        items.push(
          '<li class="slot slot-done">💰 Werbeagentur — Klicken!</li>'
        );
      } else {
        var leftSec = Math.max(0, Math.ceil((s.ad.nextCoinAt - performance.now()) / 1000));
        items.push(
          '<li class="slot"><span class="slot-icon">📢</span>' +
            '<span>Werbeagentur läuft</span>' +
            '<span style="margin-left:auto;color:var(--ink-mute)">' + leftSec + 's</span>' +
          '</li>'
        );
      }
    }

    if (items.length === 0) items.push('<li class="slot slot-empty">Nichts läuft</li>');
    el.slotList.innerHTML = items.join('');
  }

  function tickSidebar() {
    var s = RT.state.get();
    if (!s.hq.currentId && !s.ad.unlocked) return;
    // Nur die kleinen Sub-Elemente updaten, nicht die ganze Liste — spart Reflow.
    var hqRow = el.slotList.querySelector('[data-slot="hq"] .slot-progress-fill');
    if (hqRow) {
      var feat = RT.state.FEATURES.find(function (f) { return f.id === s.hq.currentId; });
      if (feat) {
        var elapsed = (performance.now() - s.hq.startedAt) / 1000;
        var pct = Math.min(100, (elapsed / feat.duration) * 100).toFixed(1);
        hqRow.style.width = pct + '%';
      }
    }
  }

  // --- Modal ---
  function openFeatureModal() {
    var s = RT.state.get();
    var html = RT.state.FEATURES.map(function (feat) {
      var isDone    = !!s.hq.done[feat.id];
      var isRunning = s.hq.currentId === feat.id;
      var canAfford = s.money >= feat.cost;
      var cls = 'feature-item';
      if (isDone)                        cls += ' done';
      if (!isDone && (!canAfford || s.hq.currentId)) cls += ' locked';

      var meta, btnLabel, btnDisabled = false;
      if (isDone) {
        meta = '✔ Bereits fertig';
        btnLabel = 'Fertig';
        btnDisabled = true;
      } else if (isRunning) {
        meta = '⏳ Läuft gerade';
        btnLabel = 'Läuft…';
        btnDisabled = true;
      } else if (!canAfford) {
        meta = '💸 Zu teuer (' + feat.cost + '€ nötig)';
        btnLabel = 'Zu teuer';
        btnDisabled = true;
      } else if (s.hq.currentId) {
        meta = 'Etwas anderes läuft im HQ';
        btnLabel = 'Warten';
        btnDisabled = true;
      } else {
        meta = '⏱ ' + feat.duration + 's · 💰 ' + (feat.cost ? feat.cost + '€' : 'gratis');
        btnLabel = '▶ Starten';
      }

      return (
        '<div class="' + cls + '">' +
          '<div class="feature-info">' +
            '<div class="feature-name">' + escapeHtml(feat.name) + '</div>' +
            '<div class="feature-desc">' + escapeHtml(feat.desc) + '</div>' +
            '<div class="feature-meta">' + meta + '</div>' +
          '</div>' +
          '<button class="feature-start" data-feat="' + feat.id + '"' +
            (btnDisabled ? ' disabled' : '') + '>' + btnLabel + '</button>' +
        '</div>'
      );
    }).join('');
    el.featureList.innerHTML = html;
    el.modalBackdrop.hidden = false;
  }

  function closeFeatureModal() {
    el.modalBackdrop.hidden = true;
  }

  // --- Toast ---
  var toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1600);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- Voll-Render ---
  function renderAll() {
    renderResources();
    renderHq();
    renderAd();
    renderMarketing();
    renderSidebar();
  }

  // --- Frame-Tick (nur die Dinge die sich pro Frame ändern) ---
  function frameTick() {
    tickHq();
    tickAd();
    tickMarketing();
    tickSidebar();
  }

  // --- Init ---
  RT.ui = {
    init: function () {
      el.users        = $('res-users');
      el.money        = $('res-money');
      el.ruf          = $('res-ruf');
      el.rufWrap      = el.ruf.parentNode;

      el.bHq          = $('b-hq');
      el.hqProgress   = $('hq-progress');
      el.hqProgressFill = $('hq-progress-fill');
      el.hqBadge      = $('hq-badge');

      el.bAd          = $('b-ad');
      el.adSlider     = $('ad-slider');
      el.adSliderVal  = $('ad-slider-val');
      el.adCoin       = $('ad-coin');
      el.adCoinVal    = $('ad-coin-val');
      el.adWait       = $('ad-wait');
      el.adWaitSec    = $('ad-wait-sec');

      el.slotList     = $('slot-list');
      el.btnMarketing = $('btn-marketing');
      el.marketingSub = $('marketing-sub');

      el.modalBackdrop = $('modal-backdrop');
      el.featureList   = $('feature-list');
      el.modalClose    = $('modal-close');
      el.toast         = $('toast');

      // --- Events ---
      el.bHq.addEventListener('click', openFeatureModal);
      el.modalClose.addEventListener('click', closeFeatureModal);
      el.modalBackdrop.addEventListener('click', function (ev) {
        if (ev.target === el.modalBackdrop) closeFeatureModal();
      });
      el.featureList.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.feature-start');
        if (!btn || btn.disabled) return;
        var id = btn.getAttribute('data-feat');
        var res = RT.actions.startFeature(id);
        if (res && res.ok) closeFeatureModal();
      });

      el.adSlider.addEventListener('input', function () {
        RT.actions.setAdSlider(parseInt(el.adSlider.value, 10));
      });
      el.adCoin.addEventListener('click', RT.actions.collectCoin);

      el.btnMarketing.addEventListener('click', RT.actions.marketingClick);

      // --- Bus-Subscriptions ---
      RT.bus.on('state:changed', renderAll);
      RT.bus.on('state:tick',    frameTick);
      RT.bus.on('toast',         showToast);

      renderAll();
    }
  };
})(window.RT2);
