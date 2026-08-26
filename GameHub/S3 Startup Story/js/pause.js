/* Pause — das Spiel steht still, bleibt aber vollständig lesbar.

   Zweck: in Ruhe schauen. Techtree aufmachen, Gebäude antippen, Trend-Modal
   lesen, ohne dass währenddessen die Watchtime läuft, ein Deal ausläuft oder
   eine Ereigniskarte auf den Tisch fällt. Alles ist anklickbar; nichts, was
   den Zustand ändert, geht durch.

   ── Wie das Anhalten funktioniert ────────────────────────────────────────
   Das Spiel rechnet an zwei verschiedenen Uhren:

     1. dt-Zähler  (fs.cycleTime, st.conv.cycleTime, s.trendCycleTime, …)
        Sie wachsen ausschließlich im Tick. Sobald tick() vorzeitig
        zurückkehrt, stehen sie von allein still — dafür ist hier nichts zu
        tun.

     2. absolute Zeitstempel (entry.startAt, m.holdUntil, e.nextAt, …)
        Die vergleichen sich mit Date.now() und laufen deshalb WEITER, auch
        wenn kein Tick mehr kommt. Sie müssen mitgeschoben werden.

   shiftClocks() erledigt (2): es addiert die verstrichene Tick-Zeit auf jeden
   dieser Stempel, wodurch die Differenz zu Date.now() konstant bleibt. Dasselbe
   Verfahren nutzt der Streik in loop.js für die Entwicklungs-Uhr (`entry.startAt
   += payload.dt`) — hier nur für alle Stempel gleichzeitig.

   ⚠️ Wer einen NEUEN absoluten Zeitstempel in den Spielstand legt, muss ihn in
   shiftClocks() eintragen. Sonst läuft genau dieses eine Ding in der Pause
   weiter — und das fällt erst auf, wenn jemand lange genug pausiert.

   ── Warum nicht RT.clock.stop() ──────────────────────────────────────────
   Weil die Oberfläche weiterlaufen soll: an 'tick' hängen auch der UI-Refresh
   (ui.js), das Autosave (storage.js) und der Server-Abgleich (cloud.js). Ein
   angehaltener Takt würde die Anzeige einfrieren, statt sie ruhig zu halten,
   und ein pausiertes Spiel könnte nicht mehr speichern.

   ── Warum die Sperre an RT.actions hängt ─────────────────────────────────
   Weil dort JEDE zustandsändernde Spieler-Handlung durchkommt — Ernten,
   Buchen, Bauen, Kaufen, Abbrechen, Techtree. Ein Riegel an dieser einen
   Stelle ist vollständig; dieselbe Sperre an dreißig Knöpfen wäre es nie. */
(function (RT) {
  'use strict';

  var paused    = false;
  var banner    = null;
  var lastToast = 0;

  /* ── Absolute Zeitstempel mitschieben ─────────────────────────────── */
  function shiftClocks(dt) {
    if (!(dt > 0)) return;
    var s = RT.state && RT.state.current;
    if (!s) return;

    // 1) Techtree. startAt trägt den Fortschrittsring; readyAt/doneAt sind
    // Anzeige-Stempel („vor 12 s fertig geworden") und sollen in der Pause
    // ebenfalls nicht altern.
    var tt = s.techtree || {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (!entry) continue;
      if (entry.startAt) entry.startAt += dt;
      if (entry.readyAt) entry.readyAt += dt;
      if (entry.doneAt)  entry.doneAt  += dt;
    }

    // 2) Laufende Marketing-Kampagnen.
    var mks = RT.state.instancesByType ? RT.state.instancesByType('marketing') : [];
    for (var i = 0; i < mks.length; i++) {
      var act = mks[i].state && mks[i].state.active;
      if (act && act.startAt) act.startAt += dt;
    }

    // 3) Flyerbonus (8-s-Takt in Phase 0/1).
    if (s.lastFlyerTick) s.lastFlyerTick += dt;

    // 4) Trend-Modifikatoren. holdUntil trägt BEIDE Phasen: solange es in der
    // Zukunft liegt, hält der volle Wert; liegt es in der Vergangenheit,
    // rechnet trendModValue() den Abbau aus (now − holdUntil). Mitschieben
    // friert deshalb Halten UND Abklingen gleichzeitig ein.
    var mods = s.trendMods || {};
    for (var id in mods) {
      if (!Object.prototype.hasOwnProperty.call(mods, id)) continue;
      if (mods[id] && mods[id].holdUntil) mods[id].holdUntil += dt;
    }

    // 5) Schadensbegrenzung (Laufzeit + Cooldown).
    if (s.trendShieldUntil)   s.trendShieldUntil   += dt;
    if (s.trendShieldReadyAt) s.trendShieldReadyAt += dt;

    // 6) Ereigniskarten. Direkt über s.events statt über RT.events.state() —
    // dessen ev() LEGT den Block an, wenn er fehlt, und das wäre hier ein
    // Nebeneffekt in jedem Spielstand vor Phase 4.
    var e4 = s.events;
    if (e4) {
      if (e4.nextAt)       e4.nextAt       += dt;
      if (e4.adMalusUntil) e4.adMalusUntil += dt;
      if (e4.prSlotUntil)  e4.prSlotUntil  += dt;
    }
  }

  /* ── Hinweis-Streifen ─────────────────────────────────────────────── */
  // Hängt in #world und nicht am <body>: dort trägt ihn das Layout von allein
  // (position:relative + overflow:hidden), ohne dass die Höhe der Kopfleiste
  // irgendwo als Zahl nachgepflegt werden müsste. Und er sitzt damit über der
  // Fläche, um die es geht.
  //
  // pointer-events: none (im CSS) — der Streifen darf nichts verdecken, was
  // der Spieler gerade in Ruhe anschauen will.
  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.className = 'rt-pause-banner';
    banner.innerHTML = '<span class="rt-pause-banner__icon">⏸️</span>'
                     + '<span>Pause — schau dich in Ruhe um. '
                     + 'Zum Weiterspielen oben auf ▶️ tippen.</span>';
    (document.getElementById('world') || document.body).appendChild(banner);
  }
  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  /* ── Umschalten ───────────────────────────────────────────────────── */
  function set(v) {
    v = !!v;
    if (v === paused) return;
    paused = v;
    document.body.classList.toggle('rt-paused', paused);
    if (paused) showBanner(); else hideBanner();
    RT.bus.emit('pause:changed', { paused: paused });
    RT.bus.emit('state:changed');
  }

  /* ── Sperre für zustandsändernde Handlungen ───────────────────────── */
  // Gibt true zurück, wenn der Aufrufer abbrechen soll. Der Toast wird
  // gedrosselt: ein Spieler, der in der Pause auf eine Farm haut, tippt
  // schnell mehrfach, und drei identische Meldungen hintereinander sind Lärm.
  function blocked() {
    if (!paused) return false;
    var now = Date.now();
    if (now - lastToast > 1200) {
      lastToast = now;
      RT.bus.emit('toast', '⏸️ Pause — zum Weiterspielen oben auf ▶️ tippen');
    }
    return true;
  }

  /* Alle RT.actions.* hinter die Sperre legen.
     Der Rückgabewert im Sperrfall muss zur Konvention der jeweiligen Action
     passen — sonst liest ein Aufrufer eine Blockade als Erfolg:
       Zahl-Actions   (Ernten)  geben 0 zurück, 0 = „nichts bekommen"
       Bool-Actions   (Buchen)  geben false zurück
       Rest                     gibt { ok:false, msg } zurück
     Ein pauschales { ok:false } wäre bei `if (RT.actions.startCampaign(…))`
     ein WAHRER Wert und die Kampagne liefe scheinbar los. */
  var BLOCKED_RETURN = {
    harvestFarm:           0,
    harvestFarmMetadata:   0,
    collectModels:         0,
    collectWerbeMoney:     0,
    collectMarketingUsers: 0,
    cancelAdDeal:          false,
    upgradeFarm:           false,
    startCampaign:         false
  };
  // offlineCatchUp läuft im Boot und ist keine Spieler-Handlung.
  var NEVER_BLOCK = { offlineCatchUp: true };

  function install() {
    var A = RT.actions;
    if (!A) return;
    for (var name in A) {
      if (!Object.prototype.hasOwnProperty.call(A, name)) continue;
      if (typeof A[name] !== 'function' || NEVER_BLOCK[name]) continue;
      A[name] = (function (fn, key) {
        var fallback = Object.prototype.hasOwnProperty.call(BLOCKED_RETURN, key)
          ? BLOCKED_RETURN[key]
          : { ok: false, msg: '⏸️ Pause — zum Weiterspielen oben auf ▶️ tippen' };
        return function () {
          if (blocked()) return fallback;
          return fn.apply(this, arguments);
        };
      })(A[name], name);
    }
  }

  /* ── Tastatur: P ──────────────────────────────────────────────────── */
  // Nicht in Eingabefeldern — dort ist „p" ein Buchstabe (Plattformname,
  // Debug-Passwort).
  function onKey(ev) {
    if ((ev.key || '').toLowerCase() !== 'p') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // Nur im laufenden Spiel — auf Intro/Charakter/Plattform gibt es nichts
    // anzuhalten, und der Knopf steht dort auch nicht.
    if (!document.getElementById('rt-pause-btn')) return;
    toggle();
  }
  window.addEventListener('keydown', onKey);

  function toggle() { set(!paused); }

  RT.pause = {
    isPaused:    function () { return paused; },
    set:         set,
    toggle:      toggle,
    blocked:     blocked,
    shiftClocks: shiftClocks
  };

  install();
})(window.RT3);
