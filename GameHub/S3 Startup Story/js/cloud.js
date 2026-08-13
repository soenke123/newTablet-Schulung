/* Server-Persistenz (Migration 0061, Tabelle user_game_saves).
   Kapselt ALLES Server-Seitige — storage.js bleibt dadurch rein lokal,
   und das Spiel läuft ohne Backend, ohne Login und offline unverändert
   weiter. Wer nicht eingeloggt ist, merkt von diesem Modul nichts.

   Arbeitsteilung mit storage.js:
     storage.js  — localStorage: Gast-Speicher, Offline-Puffer, Cache
     cloud.js    — die Wahrheit für eingeloggte User

   Grundregel: SERVER GEWINNT BEIM LADEN. Ein lokaler Stand wird nur
   hochgeschoben, wenn der Dirty-Marker sagt, dass er nie beim Server
   angekommen ist (Offline-Runde, abgestürzter Tab).                  */
(function (RT) {
  'use strict';

  var GAME_ID   = 'game18';
  var DIRTY_KEY = 'startupStoryV3_dirty';

  // Der Takt, in dem gepusht wird. storage.js speichert lokal alle 1 s
  // (debounced) bzw. alle 5 s im Tick — das wäre als RPC-Frequenz absurd.
  // 20 s heißt: im schlimmsten Fall gehen 20 s Fortschritt verloren, und
  // das auch nur, wenn der Tab weder ausgeblendet noch geschlossen wird
  // (beide Wege pushen sofort).
  var PUSH_INTERVAL_MS = 20000;

  // fetch(keepalive) ist auf 64 KB Body gedeckelt. Darüber schickt der
  // Unload-Pfad einen normalen fetch — der kann vom Browser abgeschnitten
  // werden, ist aber besser als ein Push, der garantiert nicht rausgeht.
  var KEEPALIVE_MAX_BYTES = 60000;

  var rev       = null;   // zuletzt vom Server bestätigte Revision
  var inflight  = false;
  var timer     = null;
  var abandoned = false;  // stale_rev gesehen — siehe pushNow()
  var failed    = false;  // letzter Push ging nicht durch (offline, Netzfehler)
  var lastOkAt  = 0;      // wann der Stand zuletzt wirklich beim Server war

  /* „Wir wissen, was auf dem Server liegt." Gesetzt, sobald load() eine
     Antwort hatte — auch die Antwort „da ist nichts" zählt, denn auch das
     ist Wissen. Solange das nicht steht, wird NICHT gepusht.

     ⚠️ Der Grund ist der Fehlerfall: kommt load() nicht durch, weiß der
     Client nicht, ob der Server einen Stand hat. Ein Push wäre dann ein
     blindes Überschreiben — und mit rev = null würde der Server ihn sogar
     annehmen (p_base_rev null erzwingt den Schreibvorgang). Ein Tablet mit
     wackligem WLAN könnte so einen alten Gerätestand über den neueren
     Kontostand legen. Genau das darf „Server gewinnt" nicht zulassen.

     Ausnahme: opts.force. Das ist der Boot-Push einer ungepushten
     Offline-Runde — der einzige Fall, in dem der lokale Stand bewusst
     Vorrang hat, weil er nachweislich nie beim Server war.            */
  var synced = false;

  /* Debug-Modus: der Riegel, der das Modul stilllegt (js/debug.js).
     Er meldet den Spieler ab und spielt danach rein lokal weiter — der
     Serverstand des Kontos darf davon nichts mitbekommen.

     ⚠️ Der Riegel steht zusätzlich zum Abmelden, nicht statt seiner.
     window.__accessToken und der persistierte `lernwelt-auth`-Eintrag
     hängen im Moment des signOut noch einen Wimpernschlag nach, und
     token() liest beide. Ein Push in genau diesem Fenster schriebe den
     Debug-Stand in den echten Account.                                 */
  var debugDetached = false;

  /* ─── Status für die Anzeige ───────────────────────────────
     Das Konto-Abzeichen am Avatar (js/ui.js) liest das hier. Vier
     Zustände, absichtlich in dieser Rangfolge:

       'guest'    — nicht angemeldet, der Stand liegt nur auf diesem Gerät.
                    Der wichtigste Fall: heute merkt ein Schüler das erst
                    beim Gerätewechsel, und dann ist alles weg.
       'conflict' — ein anderes Gerät hat weitergespielt, dieser Tab
                    schreibt nicht mehr. Bisher nur ein Toast, den man
                    verpasst — als Zustand ist er nicht zu übersehen.
       'offline'  — angemeldet, aber der letzte Push ging nicht durch.
                    Kein Datenverlust, es wird nachgeholt.
       'account'  — alles im Konto.                                      */
  function status() {
    if (!isServerMode()) return { state: 'guest',    lastOkAt: 0 };
    if (abandoned)       return { state: 'conflict', lastOkAt: lastOkAt };
    if (failed)          return { state: 'offline',  lastOkAt: lastOkAt };
    return { state: 'account', lastOkAt: lastOkAt };
  }

  // Nur feuern, wenn sich wirklich etwas geändert hat — das Abzeichen hängt
  // sonst an einem Ereignis, das im Sekundentakt kommt.
  var lastState = null;
  function announce() {
    var st = status().state;
    if (st === lastState) return;
    lastState = st;
    RT.bus.emit('cloud:status', status());
  }

  /* ─── Token ────────────────────────────────────────────────
     Normalerweise steht window.__accessToken (session.js). Der
     localStorage-Fallback greift im Zeitfenster direkt nach dem Boot,
     bevor session.js sein erstes Auth-Event bekommen hat — gleiche
     Logik wie getAccessToken() in creatures.js.                     */
  function token() {
    if (typeof window.__accessToken === 'string' && window.__accessToken) {
      return window.__accessToken;
    }
    try {
      var raw = localStorage.getItem('lernwelt-auth');
      if (!raw) return null;
      var s = JSON.parse(raw);
      var t = (s && s.access_token) || (s && s.currentSession && s.currentSession.access_token) || null;
      var exp = (s && s.expires_at) || (s && s.currentSession && s.currentSession.expires_at) || null;
      if (!t) return null;
      if (exp && (Date.now() / 1000) >= exp) return null;
      return t;
    } catch (e) { return null; }
  }

  function isServerMode() {
    if (debugDetached) return false;
    return !!token() && !!window.SUPABASE_URL && !!window.SUPABASE_ANON_KEY;
  }

  /* ─── Wem gehört der Spielstand? ───────────────────────────
     Die User-Id aus dem JWT (`sub`) — und ausdrücklich NICHT aus
     window.getSessionUser().

     ⚠️ session.js setzt __session auf null, sobald der Profil-Fetch
     scheitert (applyAuthSession), und das passiert offline zuverlässig.
     Das Token liegt dann aber weiter im localStorage und trägt die Id
     mit sich. Über getSessionUser() wäre man beim Offline-Start also
     plötzlich „niemand" und verlöre den eigenen Stand.

     storage.js schreibt das Ergebnis in den localStorage-Umschlag und
     prüft es beim Laden. Ohne diese Marke ist ein Spielstand anonym —
     und dann spielt ihn jeder weiter, der das Gerät aufklappt.       */
  var ownerCache = { tok: null, id: null };
  function owner() {
    // Im Debug-Modus ist der lokale Stand ausdrücklich ein GAST-Stand: er
    // trägt keine Id, gehört keinem Konto und wird nach dem nächsten Login
    // von ownsLocal() verworfen. Ohne das läge ein Debug-Spielstand unter
    // der Id des echten Kontos im localStorage — und der Phasensprung, der
    // die Seite neu lädt, fände seinen eigenen Stand nicht wieder.
    if (debugDetached) return null;
    var t = token();
    if (!t) return null;
    if (ownerCache.tok === t) return ownerCache.id;
    var id = null;
    try {
      var part = t.split('.')[1];
      if (part) {
        // base64url → base64: JWTs benutzen - und _ statt + und /.
        var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        var claims = JSON.parse(atob(b64));
        if (claims && claims.sub) id = String(claims.sub);
      }
    } catch (e) { id = null; }
    if (!id && typeof window.getSessionUser === 'function') {
      var u = window.getSessionUser();
      if (u && u.id) id = String(u.id);
    }
    ownerCache = { tok: t, id: id };
    return id;
  }

  function rpc(name, body, keepalive) {
    var t = token();
    var opts = {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + t,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body || {})
    };
    if (keepalive && opts.body.length <= KEEPALIVE_MAX_BYTES) opts.keepalive = true;
    return fetch(window.SUPABASE_URL + '/rest/v1/rpc/' + name, opts)
      .then(function (res) {
        if (!res.ok) throw new Error(name + ' ' + res.status);
        return res.json();
      });
  }

  /* ─── Dirty-Marker ─────────────────────────────────────────
     Eigener localStorage-Key statt eines Feldes im Spielstand, damit
     der Blob byte-identisch zu dem ist, was auf dem Server liegt
     (gleiches Muster wie SHOP_DIRTY_KEY in creatures.js).

     Bedeutung: „der lokale Stand ist nie beim Server angekommen".
     Gesetzt bei jedem lokalen Save, gelöscht nach jedem erfolgreichen
     Push — bewusst OHNE Snapshot-Vergleich. Das Spiel tickt jede
     Sekunde weiter, ein Vergleich würde den Marker praktisch nie
     löschen. Dass dabei die ein, zwei Sekunden zwischen Push-Start und
     Antwort als „sauber" gelten, ist folgenlos: der 20-s-Takt gibt
     ohnehin bis zu 20 s preis, und anders als beim Shop gibt es hier
     keinen max-Merge, der einen alten Wert wiederbeleben könnte.     */
  function markDirty()  { try { localStorage.setItem(DIRTY_KEY, '1'); } catch (e) {} }
  function clearDirty() { try { localStorage.removeItem(DIRTY_KEY);   } catch (e) {} }
  function isDirty()    { try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; } }

  /* ─── Laden ────────────────────────────────────────────────
     Drei Ausgänge, und die Unterscheidung ist der ganze Punkt:

       { save, save_version, rev, age_sec }  — der Serverstand
       { empty: true }                       — der Server HAT nichts
       null                                  — nicht erreichbar / nicht eingeloggt

     ⚠️ „leer" und „unbekannt" dürfen nicht denselben Rückgabewert haben.
     Auf „leer" fängt das Spiel neu an (js/main.js), auf „unbekannt" spielt
     es lokal weiter, ohne zu pushen. Würden beide null liefern, hieße jeder
     Netzwerk-Wackler beim Boot „dein Konto ist leer" — und der Spielstand
     wäre weg.

     Bei Fehler bewusst null statt eines Wurfs: der Boot soll weiterlaufen,
     nicht abbrechen.                                                  */
  function load() {
    if (!isServerMode()) return Promise.resolve(null);
    return rpc('load_game_save', { p_game_id: GAME_ID })
      .then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || 'unknown');
        // Auch das ist eine gültige Antwort und macht uns synced: wir
        // wissen jetzt, dass für dieses Konto nichts gespeichert ist.
        failed   = false;
        lastOkAt = Date.now();
        synced   = true;
        if (!r.save) {
          rev = null;
          console.log('[cloud] kein Serverstand für dieses Konto.');
          return { empty: true };
        }
        rev = typeof r.rev === 'number' ? r.rev : null;
        console.log('[cloud] Serverstand geladen, rev=' + rev + ', Abwesenheit=' + r.age_sec + 's');
        return r;
      })
      .catch(function (e) {
        console.warn('[cloud] load fehlgeschlagen:', e.message);
        failed = true;
        return null;
      });
  }

  /* ─── Pushen ───────────────────────────────────────────────
     opts.keepalive — Unload-Pfad
     opts.force     — ohne rev schreiben (erster Save, nach Reset)

     ⚠️ savedAt wird hier NICHT angefasst. Es gehört storage.writeLocal()
     und steht dadurch immer auf dem Zeitpunkt des letzten lokalen Saves —
     im Spielbetrieb höchstens ein paar Sekunden alt. Würde der Push ihn
     auf jetzt setzen, verlöre der Boot-Push einer Offline-Runde genau die
     Information, aus der der Aufholpass die Abwesenheit rechnet.        */
  function pushNow(opts) {
    opts = opts || {};
    if (!isServerMode() || inflight || abandoned) return Promise.resolve(false);
    // Nichts schreiben, solange wir nicht wissen, was drüben liegt (siehe synced).
    if (!synced && !opts.force) return Promise.resolve(false);

    var payload = RT.state.current;

    inflight = true;
    return rpc('sync_game_save', {
      p_game_id:      GAME_ID,
      p_save:         payload,
      p_save_version: RT.storage.VERSION,
      p_base_rev:     opts.force ? null : rev
    }, opts.keepalive)
      .then(function (r) {
        if (r && r.ok) {
          rev = typeof r.rev === 'number' ? r.rev : rev;
          clearDirty();
          // Nach einem angenommenen Push kennen wir den Serverstand — er ist
          // ja unserer. Damit darf der 20-s-Takt weiterarbeiten, auch wenn
          // dieser Push ein force ohne vorheriges load() war.
          synced   = true;
          failed   = false;
          lastOkAt = Date.now();
          announce();
          return true;
        }
        var err = (r && r.error) || 'unknown';

        // Ein anderes Gerät (oder ein zweiter Tab) hat seit unserem
        // Laden geschrieben. Wir geben auf, statt darüberzuschreiben:
        // wer zuletzt GELADEN hat, spielt gerade wirklich — dieser Tab
        // hier hält einen Stand, der schon überholt ist.
        //
        // ⚠️ Der Dirty-Marker MUSS dabei weg. Sonst schöbe der nächste
        // Boot genau diesen überholten Stand als „ungepushte Offline-
        // Runde" nach oben und machte den Fortschritt des anderen
        // Geräts zunichte.
        if (err === 'stale_rev') {
          abandoned = true;
          clearDirty();
          console.warn('[cloud] stale_rev — dieser Tab schreibt nicht mehr.');
          RT.bus.emit('toast', '⚠️ Auf einem anderen Gerät wurde weitergespielt. Lade die Seite neu.');
          announce();
          return false;
        }
        // rate_limit ist harmlos: der nächste Takt-Push holt es nach — und
        // ausdrücklich KEIN 'offline'-Zustand, sonst flackert das Abzeichen
        // bei jedem Sofort-Push kurz nach dem Takt-Push.
        if (err !== 'rate_limit') {
          console.warn('[cloud] push abgelehnt:', err);
          failed = true;
          announce();
        }
        return false;
      })
      .catch(function (e) {
        // Offline oder Netzwerkfehler — Dirty-Marker bleibt stehen und
        // der nächste Boot schiebt den Stand nach.
        console.warn('[cloud] push fehlgeschlagen:', e.message);
        failed = true;
        announce();
        return false;
      })
      .finally(function () { inflight = false; });
  }

  function schedule() {
    if (!isServerMode() || abandoned || !synced || timer) return;
    timer = setTimeout(function () {
      timer = null;
      if (!isDirty()) return;
      pushNow({});
    }, PUSH_INTERVAL_MS);
  }

  /* Gibt das Promise des Pushs zurück (bzw. ein aufgelöstes, wenn es
     nichts zu tun gibt). Die Unload-Pfade ignorieren das wie bisher —
     gebraucht wird es vom Debug-Modus, der den echten Stand ERST oben
     wissen will, bevor er den Spieler abmeldet.                       */
  function flush(keepalive) {
    if (!isDirty()) return Promise.resolve(false);
    if (timer) { clearTimeout(timer); timer = null; }
    return pushNow({ keepalive: !!keepalive });
  }

  /* ─── Debug-Modus: Modul stilllegen ────────────────────────
     Ab hier gilt für alles, was dieses Modul tut, „nicht angemeldet":
     kein Push, kein Laden, kein Dirty-Marker, kein Besitzer am lokalen
     Stand. Es gibt bewusst KEINEN Weg zurück — wer wieder ins Konto
     will, lädt die Seite neu und meldet sich an.

     ⚠️ Der Dirty-Marker muss weg. Er stünde sonst für einen Stand, den
     dieser Tab gerade zum Gast-Stand erklärt hat, und der nächste Boot
     nach einem Login schöbe ihn als „ungepushte Offline-Runde" hoch.
     (ownsLocal() fängt das zwar auch ab — aber auf zwei Beinen.)      */
  function disableForDebug() {
    if (debugDetached) return;
    debugDetached = true;
    if (timer) { clearTimeout(timer); timer = null; }
    synced = false;
    clearDirty();
    console.warn('[cloud] Debug-Modus — ab jetzt nur noch lokal.');
    announce();
  }

  /* Serverstand löschen — Debug-Neustart. Ohne das zieht der nächste
     Boot den gerade gelöschten Stand wieder herunter.                */
  function reset() {
    rev = null;
    abandoned = false;
    if (timer) { clearTimeout(timer); timer = null; }
    clearDirty();
    if (!isServerMode()) return Promise.resolve();
    return rpc('reset_game_save', { p_game_id: GAME_ID })
      .then(function () {
        // Der Serverstand ist jetzt nachweislich leer — das ist Wissen wie
        // jedes andere, also darf wieder gepusht werden. Ohne das würde ein
        // Neustart ohne anschließenden Reload stillschweigend aufhören zu
        // speichern.
        synced = true;
      })
      .catch(function (e) { console.warn('[cloud] reset fehlgeschlagen:', e.message); });
  }

  /* Meilensteine: die drei Momente, in denen ein verlorener Fortschritt
     am meisten wehtut. Statt loop.js dafür anzufassen, wird hier beim
     state:changed verglichen — kein zusätzliches Ereignis, keine
     Kopplung in die andere Richtung.                                  */
  var MILESTONES = ['investorTriggered', 'phase3Triggered', 'phase4Triggered', 'goLiveUnlocked'];
  var lastFlags = null;

  function checkMilestones() {
    var s = RT.state.current, hit = false, i;
    if (!lastFlags) {
      lastFlags = {};
      for (i = 0; i < MILESTONES.length; i++) lastFlags[MILESTONES[i]] = !!s[MILESTONES[i]];
      return;
    }
    for (i = 0; i < MILESTONES.length; i++) {
      var k = MILESTONES[i];
      if (!!s[k] !== lastFlags[k]) { lastFlags[k] = !!s[k]; if (s[k]) hit = true; }
    }
    if (hit) flush(false);
  }

  function init() {
    // ⚠️ Vor dem isServerMode-Ausstieg: der Gast-Zustand ist genau der, den
    // das Abzeichen anzeigen soll. Ein `return` davor hieße, dass ausgerechnet
    // im wichtigsten Fall nie ein Ereignis kommt.
    announce();
    if (!isServerMode()) return;
    checkMilestones();   // Ausgangsstand merken, ohne zu pushen

    // Der Browser meldet, wenn die Verbindung zurück ist — dann sofort
    // nachschieben, statt bis zum nächsten Takt zu warten. Das Abzeichen
    // springt dadurch von „offline" zurück auf „im Konto", sobald es stimmt.
    window.addEventListener('online', function () { flush(false); });

    RT.bus.on('state:changed', function () { schedule(); checkMilestones(); });
    // Der Tick-Kanal ist nicht redundant: in reinen Produktionsphasen
    // feuert state:changed minutenlang nicht (siehe Kommentar in
    // storage.js), der Stand wächst aber trotzdem.
    RT.bus.on('tick', schedule);

    // pagehide und visibilitychange feuern auf Tablets zuverlässig, wo
    // beforeunload oft übersprungen wird — dieselben Aufhänger wie in
    // storage.js, nur mit keepalive.
    window.addEventListener('pagehide', function () { flush(true); });
    window.addEventListener('beforeunload', function () { flush(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush(true);
    });
  }

  RT.cloud = {
    isServerMode: isServerMode,
    owner:        owner,
    status:       status,
    load:         load,
    push:         pushNow,
    flush:        flush,
    reset:        reset,
    markDirty:    markDirty,
    clearDirty:   clearDirty,
    isDirty:      isDirty,
    disableForDebug: disableForDebug,
    init:         init
  };
})(window.RT3);
