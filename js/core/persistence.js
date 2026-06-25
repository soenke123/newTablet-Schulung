/* Vollständiger Save/Load des Spielstands in localStorage.
   Auto-Save: 400 ms nach jeder State-Änderung (debounced).
   Auto-Clear: bei RESET.
   Load: einmalig in main.js beim Boot. */
(function (RT) {
  'use strict';

  var KEY = 'rt_startup_v2';

  // Felder die gespeichert werden (alles außer temporären UI-Dingen).
  var SAVE_FIELDS = [
    'phase', 'month', 'goLiveUnlocked', 'player',
    'resources', 'buildings', 'research', 'purchases',
    'techtree', 'pendingCelebrations', 'userGrowthRate', 'reputation',
    'campaigns', 'meta', 'werbeagentur', 'marcusDealAccepted', 'transactions',
    'sparkHistory'
  ];

  // ── Save (debounced) ─────────────────────────────────────────────────────
  var _timer = null;

  function scheduleSave() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    try {
      var s       = RT.state.get();
      var payload = {};
      for (var i = 0; i < SAVE_FIELDS.length; i++) {
        payload[SAVE_FIELDS[i]] = s[SAVE_FIELDS[i]];
      }
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[persistence] save failed', e);
    }
  }

  // ── Load ─────────────────────────────────────────────────────────────────
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      RT.state.dispatch('RESTORE_STATE', data);
      return true;
    } catch (e) {
      console.warn('[persistence] load failed', e);
      return false;
    }
  }

  // ── Clear ────────────────────────────────────────────────────────────────
  function clear() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // ── Hilfsfunktionen für main.js ──────────────────────────────────────────
  function hasIdentity() {
    var p = RT.state.get().player || {};
    return !!(p.avatar && p.platformLogo);
  }

  function savedPhase() {
    return RT.state.get().phase || 'garage';
  }

  // ── Subscriber: nach jeder relevanten Action speichern ───────────────────
  RT.state.subscribe(function (state, action) {
    if (!action || action.type === 'RESTORE_STATE') return;
    if (action.type === 'RESET') { clear(); return; }
    scheduleSave();
  });

  RT.persistence = {
    load:        load,
    clear:       clear,
    hasIdentity: hasIdentity,
    savedPhase:  savedPhase
  };
})(window.RT);
