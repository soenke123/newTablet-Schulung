/* Bootstrap.

   Der Boot ist asynchron, seit der Spielstand am Account hängt (Migration
   0061). Die Entscheidung „Intro oder direkt ins Spiel" darf erst fallen,
   wenn feststeht, welcher Stand gilt — sonst blitzt bei jedem Start kurz
   der Intro-Screen auf und wird eine Sekunde später ersetzt. Solange
   gelesen wird, steht ein schlichter Ladehinweis im #app.

   Reihenfolge und ihre Gründe:
     1. lokal laden        — Gast und Offline können sofort weiterspielen
     2. Session abwarten   — session.js hat ein eigenes 3-s-Sicherheitsnetz
     3. dirty? → pushen    — eine Offline-Runde retten, BEVOR der Server
                             gewinnt. Andersherum wäre sie weg.
     4. Serverstand laden  — er gewinnt, und zwar AUCH WENN ER LEER IST:
                             dann beginnt das Spiel neu, egal was im
                             localStorage liegt. Nur wenn der Server gar
                             nicht antwortet, bleibt der Gerätestand stehen
                             (siehe js/cloud.js, load() und synced).
     5. Aufholpass         — mit age_sec von der Serveruhr, lokal savedAt  */
(function (RT) {
  'use strict';

  function bootSplash(container) {
    container.innerHTML =
      '<div class="rt-boot"><div class="rt-boot__spinner"></div>' +
      '<div class="rt-boot__text">Spielstand wird geladen …</div></div>';
  }

  function boot() {
    var container = document.getElementById('app');
    RT.screens.setContainer(container);
    bootSplash(container);

    var loaded = false;
    var server = null;
    // Der lokale Zeitstempel VOR allem Server-Verkehr. Er ist die einzige
    // Quelle für die Abwesenheit, wenn der eigene Stand hochgeschoben wurde
    // (siehe start()).
    var localSavedAt = 0;
    var pushedOwn    = false;

    var ready = Promise.resolve();
    if (typeof window.waitForSession === 'function') {
      ready = window.waitForSession().catch(function () {});
    }

    ready
      .then(function () {
        // ⚠️ Der lokale Stand wird erst NACH der Session gelesen, nicht davor.
        // session.js räumt bei Logout und User-Wechsel den localStorage leer
        // (clearLocalGameState) — und das passiert erst, wenn das Auth-Event
        // da ist. Wer vorher liest, hält auf einem geteilten Tablet den
        // Spielstand des vorigen Schülers in der Hand und schöbe ihn gleich
        // darauf in den frisch eingeloggten Account.
        loaded       = RT.storage.load();
        localSavedAt = RT.state.current.savedAt || 0;

        if (!RT.cloud.isServerMode()) return null;
        // Ungepushter lokaler Stand (Offline-Runde, abgestürzter Tab) muss
        // hoch, bevor der Serverstand ihn überschreibt.
        if (!RT.cloud.isDirty() || !loaded) return null;
        console.log('[main] ungepushter lokaler Stand — wird zuerst hochgeschoben.');
        pushedOwn = true;
        return RT.cloud.push({ force: true });
      })
      .then(function () {
        if (!RT.cloud.isServerMode()) return null;
        return RT.cloud.load();
      })
      .then(function (payload) {
        if (!RT.cloud.isServerMode()) return;      // Gast: lokal bleibt lokal

        if (payload && payload.save && RT.storage.applyServerSave(payload)) {
          server = payload;
          loaded = true;
          return;
        }

        if (!payload) {
          // Der Server war nicht erreichbar. Wir wissen NICHT, ob er einen
          // Stand hat — also weder den lokalen wegwerfen noch ihn
          // hochschieben. Es wird lokal weitergespielt, cloud.js pusht in
          // dieser Sitzung nichts (synced bleibt false) und der Dirty-Marker
          // sorgt dafür, dass der nächste Boot es nachholt. Das Konto-
          // Abzeichen steht derweil auf „offline".
          console.warn('[main] Serverstand nicht lesbar — lokal weiterspielen, ohne zu pushen.');
          return;
        }

        // Ab hier: der Server hat für dieses Konto NICHTS Gültiges —
        // entweder gar keine Zeile (payload.empty) oder einen Blob mit
        // fremder save_version, den applyServerSave verworfen hat.
        //
        // Dann fängt das Spiel neu an, auch wenn im localStorage noch etwas
        // liegt. Der Stand gehört dem Konto, nicht dem Gerät: was hier läge,
        // wäre ein Gast-Spielstand von vor dem Login oder der Rest eines
        // anderen Kontos — beides darf sich nicht in ein leeres Konto
        // einschleichen.
        //
        // ⚠️ Eine ungepushte Offline-Runde ist davon NICHT betroffen: die ist
        // dirty und wurde einen Schritt weiter oben bereits hochgeschoben,
        // der Server ist dann nicht mehr leer. Ist dieser Push gescheitert,
        // scheitert auch load() und wir sind im Zweig darüber gelandet.
        if (loaded) {
          console.log('[main] kein Serverstand — lokaler Stand wird verworfen, Spiel beginnt neu.');
          RT.storage.dropLocal();
          RT.state.resetCurrent();
          loaded       = false;
          localSavedAt = 0;
          pushedOwn    = false;
        }
      })
      .catch(function (e) {
        console.warn('[main] Server-Boot fehlgeschlagen:', e.message);
      })
      .then(function () {
        start(loaded, server, pushedOwn, localSavedAt);
      });
  }

  function start(loaded, server, pushedOwn, localSavedAt) {
    RT.storage.init();
    if (RT.cloud) RT.cloud.init();
    RT.debug.init();

    // Abwesenheit nachholen, bevor der erste Frame steht.
    //
    // ⚠️ Bei einem FREMDEN Serverstand zählt age_sec und nicht savedAt:
    // savedAt kommt von der Uhr des Geräts, das zuletzt gespeichert hat. Ein
    // Tablet mit falsch gestellter Uhr könnte das Aufhol-Fenster sonst
    // wiederholt abgreifen oder ganz verlieren.
    //
    // ⚠️ Haben wir aber gerade unseren EIGENEN Stand hochgeschoben (Offline-
    // Runde), ist age_sec ≈ 0 — der Serverstand ist ja Sekunden alt. Die echte
    // Abwesenheit steht dann nur noch im lokalen savedAt von vor dem Push.
    var offline = null;
    if (loaded) {
      var useServerClock = server && !pushedOwn;
      var elapsedMs = useServerClock
        ? (server.age_sec || 0) * 1000
        : (localSavedAt ? Date.now() - localSavedAt : 0);
      offline = RT.actions.offlineCatchUp(elapsedMs);
    }

    if (loaded && RT.state.current.player && RT.state.current.player.name) {
      RT.screens.show('game');
      reportOffline(offline);
    } else {
      RT.screens.show('intro');
    }
  }

  /* „Während du weg warst" — als eigenes Overlay und nicht über RT.ui's
     einzigen Modal-Slot. Beim Wiederkommen kann sich sonst der Kartentisch
     (Phase 4) oder eine Erklär-Tour um dieselbe Fläche streiten, und der
     frühere Toast kam mit 900 ms Verzögerung genau in dieses Getümmel. */
  function reportOffline(r) {
    if (!r) return;
    var f = RT.ledger.fmt;
    var rows = [];
    if (r.watchtime   > 0) rows.push(['⏳', 'Watchtime produziert', f.num(r.watchtime)]);
    if (r.wtStacks    > 0) rows.push(['🌾', 'Farmen zum Ernten bereit', r.wtStacks + ' Stapel']);
    if (r.metadata    > 0) rows.push(['🗃️', 'Metadaten gesammelt', f.num(r.metadata)]);
    if (r.adMoney     > 0) rows.push(['💰', 'Werbedeals eingespielt', f.money(r.adMoney)]);
    if (r.usersGained > 0) rows.push(['👥', 'neue User', f.num(r.usersGained)]);
    if (r.trendStacks > 0) rows.push(['⭐', 'Trend-Schübe zum Einsammeln', r.trendStacks]);
    if (r.usersLost   > 0) rows.push(['📉', 'User abgewandert', '−' + f.num(r.usersLost)]);
    if (!rows.length) return;

    var html =
      '<div class="rt-offline__box">' +
        '<div class="rt-offline__head">⏱ Während du weg warst</div>' +
        '<div class="rt-offline__sub">' + awayLabel(r.seconds) + ' offline</div>' +
        '<div class="rt-offline__rows">' +
          rows.map(function (row) {
            return '<div class="rt-offline__row"><span class="rt-offline__icon">' + row[0] +
                   '</span><span class="rt-offline__label">' + row[1] +
                   '</span><span class="rt-offline__val">' + row[2] + '</span></div>';
          }).join('') +
        '</div>' +
        '<button class="rt-offline__ok" type="button">Weiter</button>' +
      '</div>';

    var el = document.createElement('div');
    el.className = 'rt-offline';
    el.innerHTML = html;
    document.body.appendChild(el);
    function close() { if (el.parentNode) el.parentNode.removeChild(el); }
    el.querySelector('.rt-offline__ok').addEventListener('click', close);
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
  }

  // Die gemeldete Zeit ist die ECHTE Abwesenheit, nicht das Aufhol-Fenster.
  // „8 Stunden weg, das kam dabei heraus" ist die ehrliche Aussage — dass
  // nur die ersten zwei Minuten zählen, steht als Regel im Spiel und nicht
  // in einer geschönten Zahl.
  function awayLabel(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    if (sec < 90)   return sec + ' Sekunden';
    if (sec < 5400) return Math.round(sec / 60) + ' Minuten';
    if (sec < 172800) return Math.round(sec / 3600) + ' Stunden';
    return Math.round(sec / 86400) + ' Tage';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.RT3);
