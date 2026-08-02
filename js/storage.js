/* LocalStorage-Persistence. Throttled Save an state:changed, synchroner
   Flush bei beforeunload. Wird später durch Server-Persistence ersetzt. */
(function (RT) {
  'use strict';

  var KEY = 'startupStoryV3';
  // v2: Ruf → Trend. Alte Stände enthalten kein trendMods und werden verworfen.
  var VERSION = 2;
  var SAVE_DEBOUNCE_MS = 1000;
  var saveTimer = null;
  var wiped = false;

  function save() {
    // Nach wipe() (z. B. Debug-Neustart) kein Rebound aus dem beforeunload-Flush.
    if (wiped) return;
    try {
      // Zeitstempel mitschreiben — daraus berechnet main.js den Offline-Aufholpass.
      RT.state.current.savedAt = Date.now();
      var payload = { v: VERSION, data: RT.state.current };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) { /* Quota / Private-Mode — ignorieren */ }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      save();
    }, SAVE_DEBOUNCE_MS);
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== VERSION || !parsed.data) return false;
      // Shallow-Merge: neue Felder in initial bleiben mit ihrem Default erhalten.
      Object.keys(parsed.data).forEach(function (k) {
        RT.state.current[k] = parsed.data[k];
      });
      migrate();
      return true;
    } catch (e) { return false; }
  }

  // Kleine Anpassungen an geladenen Ständen, die keinen VERSION-Bump (und
  // damit das Löschen aller Spielstände) rechtfertigen.
  function migrate() {
    var s = RT.state.current;
    // Werbeagentur-Umbau: der alte globale 'werbung'-Modifikator aus der
    // Slider-Ära wird nicht mehr gesetzt, hat aber expiresAt 0 und würde
    // sonst ewig im Trend hängenbleiben. Die Deals registrieren stattdessen
    // pro Agentur einen eigenen Modifikator ('werbe:<instanceId>').
    if (s.trendMods) delete s.trendMods.werbung;
  }

  function wipe() {
    wiped = true;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function init() {
    RT.bus.on('state:changed', scheduleSave);
    window.addEventListener('beforeunload', save);
  }

  RT.storage = { save: save, load: load, wipe: wipe, init: init };
})(window.RT3);
