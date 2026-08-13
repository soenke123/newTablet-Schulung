/* Debug-Overlay. Halte W+I gleichzeitig gedrückt → Passwort-Abfrage,
   danach die Phasen-Sprünge. Seit das Spiel online ist, hängt daran
   zweierlei:

   1. Es kann NUR noch Phasen springen. Geld, Metadaten, Trend und der
      Ereignis-Takt sind raus — das waren Werkzeuge zum Balancen, und
      im Betrieb sind sie schlicht Cheats.

   2. Wer sich freischaltet, wird ABGEMELDET und spielt ab da rein
      lokal weiter (RT.cloud.disableForDebug()). Ein gesprungener
      Spielstand darf den Kontostand nicht anfassen: er käme sonst über
      user_game_saves auf jedes Gerät des Schülers, und der Hub leitet
      aus demselben Blob Kreatur, Wachstum und Münzen ab (CLAUDE.md
      §10.6). Der echte Stand wird vorher noch hochgeschoben, geht also
      nicht verloren — zurück ins Konto geht es über Seite neu laden
      und anmelden.

   ⚠️ Das Passwort ist ein Riegel gegen Neugier, kein Schutz. Der Hash
   steht im ausgelieferten Code und lässt sich offline durchprobieren,
   und wer die Konsole öffnet, braucht dieses Overlay ohnehin nicht.
   Echter Schutz ginge nur serverseitig (Debug-Flag am Account).       */
(function (RT) {
  'use strict';

  // sha256(SALT + Passwort). Der Klartext steht nirgends im Repo.
  var SALT      = 'rt3-debug:';
  var PASS_HASH = 'e2b66e7e5240357d684a504bdc367d82dfa3838672193e2cf9a2547d84393d95';

  var pressed  = { w: false, i: false };
  var overlay  = null;
  // Gilt für diesen Seitenaufruf. Nach einem Phasensprung (lädt die Seite
  // neu) wird wieder gefragt — der Abmelde-Schritt ist dann ein No-op.
  var unlocked = false;

  /* ─── SHA-256 ──────────────────────────────────────────────
     Von Hand statt über crypto.subtle: das gibt es nur im secure
     context. Über Vercel wäre es da, beim direkten Öffnen der
     index.html per file:// nicht — und genau dort wird entwickelt. */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function hex8(x)    { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }

  function utf8Bytes(str) {
    var bytes = [], i, c, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0xd800 || c >= 0xe000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else {
        i++;
        cp = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    return bytes;
  }

  function sha256(str) {
    var bytes = utf8Bytes(str);
    var bits  = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    // 64-Bit-Länge, big endian. Das obere Wort ist bei Passwortlängen 0.
    bytes.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64), off, t;
    for (off = 0; off < bytes.length; off += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) |
               (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var g0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var g1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + g0 + w[t - 7] + g1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var s1  = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch  = (e & f) ^ (~e & g);
        var t1  = (hh + s1 + ch + K[t] + w[t]) | 0;
        var s0  = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2  = (s0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = '';
    for (t = 0; t < 8; t++) out += hex8(h[t]);
    return out;
  }

  // --- Hotkey ---
  function onKeydown(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k !== 'w' && k !== 'i') return;
    pressed[k] = true;
    // Der overlay-Riegel ist hier doppelt wichtig: die beiden Buchstaben
    // kommen im Passwortfeld selbst vor.
    if (pressed.w && pressed.i && !overlay) {
      if (unlocked) openPanel(); else openGate();
    }
  }
  function onKeyup(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k === 'w' || k === 'i') pressed[k] = false;
  }
  function onBlur() { pressed.w = false; pressed.i = false; }

  // --- Rahmen ---
  function makeOverlay(html) {
    closeOverlay();
    overlay = document.createElement('div');
    overlay.id = 'rt-debug-overlay';
    overlay.style.cssText = ''
      + 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      + 'z-index:99999;background:#1a1a1a;color:#fff;padding:24px 28px;'
      + 'border:2px solid #f0c;border-radius:8px;font-family:sans-serif;'
      + 'min-width:340px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    var close = overlay.querySelector('#rt-debug-close');
    if (close) close.onclick = closeOverlay;
    return overlay;
  }

  function closeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function btnCss(bg) {
    return 'background:' + (bg || '#333') + ';color:#fff;border:1px solid #555;'
         + 'padding:8px 14px;border-radius:4px;cursor:pointer;font-size:14px;';
  }

  function headHtml(title) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
         + '  <div style="font-size:18px;font-weight:bold;">' + title + '</div>'
         + '  <button id="rt-debug-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>'
         + '</div>';
  }

  // --- Passwort-Abfrage ---
  function openGate() {
    var el = makeOverlay(''
      + headHtml('🔒 Debug')
      + '<div style="font-size:13px;line-height:1.5;color:#bbb;margin-bottom:14px;max-width:300px;">'
      +   'Nach dem Freischalten wirst du <b style="color:#fff;">abgemeldet</b> und spielst nur noch '
      +   'auf diesem Gerät weiter. Dein Spielstand im Konto bleibt, wie er jetzt ist.'
      + '</div>'
      + '<input id="rt-dbg-pw" type="password" autocomplete="off" placeholder="Passwort" '
      +   'style="width:100%;box-sizing:border-box;background:#0f0f0f;color:#fff;border:1px solid #555;'
      +   'border-radius:4px;padding:9px 10px;font-size:15px;margin-bottom:10px;">'
      + '<div id="rt-dbg-err" style="color:#f66;font-size:13px;min-height:18px;margin-bottom:8px;"></div>'
      + '<button id="rt-dbg-go" style="' + btnCss('#396') + 'width:100%;">Freischalten</button>');

    var input = el.querySelector('#rt-dbg-pw');
    var err   = el.querySelector('#rt-dbg-err');
    var go    = el.querySelector('#rt-dbg-go');

    function submit() {
      if (sha256(SALT + input.value) !== PASS_HASH) {
        err.textContent = 'Falsches Passwort.';
        input.value = '';
        input.focus();
        return;
      }
      err.textContent = '';
      input.disabled = true;
      go.disabled    = true;
      go.textContent = 'Wird abgemeldet …';
      detach().then(function () {
        unlocked = true;
        // Wer während des Abmeldens auf × drückt, will kein Panel. Der
        // Riegel ist trotzdem gefallen — zurück ins Konto geht nur über
        // Neuladen, und genau das steht in der Erklärung oben.
        if (overlay !== el) return;
        openPanel();
      });
    }

    go.onclick = submit;
    input.addEventListener('keydown', function (ev) {
      // Sonst tippt der Hotkey-Zuhörer beim „w" im Passwort mit.
      ev.stopPropagation();
      if (ev.key === 'Enter') submit();
    });
    input.focus();
  }

  /* Abmelden und das Cloud-Modul stilllegen.

     Reihenfolge, und jeder Schritt hat einen Grund:
       1. flush()   — den ECHTEN Stand hochschieben, solange es noch geht.
                      Ohne das verliert der Spieler bis zu 20 s (Push-Takt).
       2. signOut() — die Session ist weg, damit auch die des Hubs und
                      aller anderen Tabs. Genau das ist gewollt.
       3. disable() — der Riegel in cloud.js, siehe dort.
       4. save()    — der laufende Stand einmal als GAST-Stand schreiben
                      (owner null). Der Phasensprung lädt die Seite neu und
                      findet ihn sonst nicht wieder, weil ownsLocal() einen
                      Stand mit fremdem Besitzer verwirft.

     Fehler werden bewusst verschluckt: schlägt der signOut fehl (offline),
     bleibt der Riegel trotzdem stehen. Dieser Tab schreibt dann nichts mehr
     nach oben, und der nächste Boot holt sich ganz normal den Serverstand —
     der Debug-Sprung ist dann weg, der echte Stand aber unversehrt.      */
  function detach() {
    if (!RT.cloud || !RT.cloud.isServerMode()) {
      // Schon Gast — nichts abzumelden, nichts zu retten.
      return Promise.resolve();
    }
    return Promise.resolve(RT.cloud.flush(false))
      .catch(function () {})
      .then(function () {
        var c = window.supabaseClient;
        if (c && c.auth && c.auth.signOut) return c.auth.signOut();
      })
      .catch(function () {})
      .then(function () {
        RT.cloud.disableForDebug();
        RT.storage.save();
      });
  }

  // --- Panel ---
  function openPanel() {
    var el = makeOverlay(''
      + headHtml('🛠 Debug')
      + '<div style="font-size:12px;color:#8c8;background:#132;border:1px solid #264;'
      +   'border-radius:4px;padding:7px 9px;margin-bottom:16px;">'
      +   '● Nur lokal — abgemeldet, dieser Spielstand geht nicht ins Konto.'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">🚀 Phase springen</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">'
      + '  <button id="rt-dbg-restart" style="' + btnCss('#c33') + '">Kompletter Neustart</button>'
      + '  <button id="rt-dbg-phase2"  style="' + btnCss('#396') + '">Zum Anfang von Phase 2</button>'
      + '  <button id="rt-dbg-phase3"  style="' + btnCss('#369') + '">Zum Anfang von Phase 3</button>'
      + '  <button id="rt-dbg-phase4"  style="' + btnCss('#636') + '">Zum Anfang von Phase 4</button>'
      + '</div>');

    el.querySelector('#rt-dbg-restart').onclick = function () {
      if (!confirm('Kompletter Neustart — Spielstand geht verloren. Sicher?')) return;
      // wipe() löscht auch den Serverstand (RPC) und ist deshalb async.
      // Im Debug-Modus ist der RPC ein No-op (kein Server mehr), das Warten
      // kostet aber nichts und der Pfad bleibt derselbe wie im Normalfall.
      RT.storage.wipe().then(function () { location.reload(); });
    };
    el.querySelector('#rt-dbg-phase2').onclick = function () { jump(applyPhase2Seed, 2); };
    el.querySelector('#rt-dbg-phase3').onclick = function () { jump(applyPhase3Seed, 3); };
    el.querySelector('#rt-dbg-phase4').onclick = function () { jump(applyPhase4Seed, 4); };
  }

  function jump(seed, n) {
    if (!confirm('Zum Anfang von Phase ' + n + ' springen? Aktueller Spielstand geht verloren.')) return;
    seed();
    RT.storage.save();
    location.reload();
  }

  // --- Phase-2-Seed ---
  // Zustand wie unmittelbar nach dem "Deal!"-Klick im Investor-Modal:
  // 1000 User, +50 000 € gutgeschrieben, Küken-Farm auf Huhn upgegradet,
  // 5 Kern-Nodes done. Ohne Werbeagentur — die kauft der Spieler in Phase 2
  // selbst, und genau dieser Einstieg soll testbar sein.
  function ensurePlayer(s) {
    if (!s.player || !s.player.name) {
      s.player = { name: 'DebugDev', avatar: null,
                   platformName: 'DebugPlatform', platformLogo: null };
    }
  }

  function applyPhase2Seed() {
    var s = RT.state.current;
    ensurePlayer(s);
    s.money = 51500;
    s.users = 1000;
    // Vorrat für einen Banner-Deal (15k je Zyklus), sobald die erste
    // Werbeagentur steht. Feed, Search und Video sind erst nach den
    // Werbung-Nodes buchbar — das ist der echte Phase-2-Start, den der
    // Seed nachstellt.
    s.watchtime = 60000;
    // Phase-3-Ressourcen zurücksetzen. ⚠️ Ein Seed muss JEDEN Wert setzen,
    // den er nicht will — was er ausspart, trägt der alte Spielstand
    // unbemerkt weiter (placedBuildings wird ersetzt, die globalen Zähler
    // nicht). In Phase 2 gibt es weder Modelle noch Metadaten.
    s.models    = 0;
    s.metadata  = 0;
    s.trendMods          = {};
    s.phase2Sec          = 0;
    s.trendStacks        = 0;
    s.trendCycleTime     = 0;
    s.trendShieldUntil   = 0;
    s.trendShieldReadyAt = 0;
    // Die Intro-Tour hat der Spieler an dieser Stelle hinter sich, die
    // Phase-2-Tour ist genau das, was hier getestet werden soll.
    s.introTourSeen      = true;
    s.trendModalSeen     = false;
    // Die Watchtime-Achse ist in diesem Seed unangetastet — die Karte gehört
    // also noch bevor. Muss explizit zurück, sonst trägt ein Sprung aus einem
    // laufenden Spiel das gesetzte Flag mit (siehe phase3Triggered unten).
    s.watchtimeMultSeen  = false;
    // Liegt noch weit vor diesem Seed — explizit zurück aus demselben Grund.
    s.phase3TourSeen     = false;
    s.goLiveUnlocked    = true;
    s.investorTriggered = true;
    // ⚠️ Muss explizit zurück, sonst bleibt ein Sprung AUS Phase 3 heraus in
    // Phase 3 stecken: currentPhase() liest das Flag, und der Seed hatte es
    // vorher schlicht nicht angefasst.
    s.phase3Triggered   = false;
    s.investorCutAmount = 0;
    s.goLiveModalSeen   = true;
    s.lastFlyerTick   = 0;
    s.sparkHistory = { money: [], users: [] };
    s.purchases    = { rechner: true };
    s.seenBadges   = { hq_phase0: true, hq_phase1: true, shop: true,
                       tab_marketing: true, tab_werbung: true };
    // 5 Kern-Nodes (Voraussetzung für Go-Live, siehe loop.js:405) + die drei
    // Phase-1-Nodes, die der Spieler auf dem Weg zu 1000 Usern natürlich hat:
    // mk_freunde, mk_flyer (Marketing), wb_coop (erste Werbekooperation).
    s.techtree = {
      frontend1:  { status: 'done', startAt: 0 },
      backend1:   { status: 'done', startAt: 0 },
      account:    { status: 'done', startAt: 0 },
      feed:       { status: 'done', startAt: 0 },
      bilder:     { status: 'done', startAt: 0 },
      mk_freunde: { status: 'done', startAt: 0 },
      mk_flyer:   { status: 'done', startAt: 0 },
      wb_coop:    { status: 'done', startAt: 0 }
    };
    // Nur HQ + Serverfarm (Huhn) — genau die Belegung, die der Investor-Deal
    // hinterlässt. Werbeagentur und Marketing-Center kauft der Spieler in
    // Phase 2 selbst über den Shop; der Seed darf ihm das nicht abnehmen,
    // sonst testet er einen Einstieg, den es im Spiel nicht gibt.
    s.instanceCounter = 2;
    s.placedBuildings = [
      { instanceId: 'hq-1',    id: 'hq',    col: 0, row: 0, size: 1,
        state: { level: 1 } },
      { instanceId: 'farm-2',  id: 'farm',  col: 1, row: 0, size: 2,
        state: { tierId: 'huhn', stacks: 0, cycleTime: 0, upkeepCycles: 0 } }
    ];
  }

  // --- Phase-3-Seed ---
  // Die Schwelle für Phase 3 ist RT.actions.PHASE3_USER_THRESHOLD (1 Mio);
  // dieser Seed stellt eine Plattform deutlich dahinter her (1,2 Mio). Er ist
  // der Sprungpunkt, um die Phase-3-Inhalte zu testen, ohne Phase 2 vorher zu
  // spielen.
  //
  // Der Seed setzt phase3Triggered direkt — Marcus' Rückkehr wird dadurch
  // übersprungen, inklusive seines Griffs in die Kasse. Wer den Auftritt sehen
  // will, seedet Phase 2 und spielt hoch. Der laufende 15-%-Abzug auf die
  // Werbeerträge (state.adRevenueMult) hängt am Flag und gilt hier trotzdem.
  //
  // ⚠️ Metadaten-Speicherung ist bewusst NICHT mit erforscht: das KI-Labor
  // steht dahinter, und der Weg dorthin ist genau das, was sich in Phase 3
  // testen lässt. Wer direkt Modelle trainieren will, muss die Node erst
  // durchlaufen — sonst testet er einen Einstieg, den es im Spiel nicht gibt.
  //
  // Belegung: 1.280.000 Serverkapazität (3× Stufe 4 + 1× Stufe 3) gegen
  // 1.200.000 User + 56.700 Programm der fertigen Nodes = 23.300 frei. Das ist
  // knapp und mit Absicht so: die acht offenen Nodes kosten zusammen 23.600
  // Server, wer sie alle will, muss vorher ausbauen.
  //
  // ⚠️ Derselbe freie Platz deckelt jetzt auch das KI-Labor — Modelle belegen
  // Kapazität wie User, und gebucht werden kann nur, was hineinpasst. Eine
  // Clustering-Buchung (15.000 Modelle) füllt die 23.300 also schon gut zur
  // Hälfte. Das ist der Ausbau-Druck, um den es in Phase 3 geht, und der
  // Seed soll ihn zeigen — nicht ihn wegräumen. Wer mehr Luft zum Messen
  // braucht, stuft farm-5 auf 'ziege' hoch (+320.000).
  function applyPhase3Seed() {
    var s = RT.state.current;
    ensurePlayer(s);
    s.money     = 200000;
    s.users     = 1200000;
    // Eine Clustering-Buchung kostet 300.000 Watchtime (5 Zyklen à 3.000
    // Modelle × 20 wt). Der Seed gibt gut anderthalb davon — genug, um den
    // Einstieg zu sehen, zu wenig, um ihn geschenkt zu bekommen.
    s.watchtime = 500000;
    // Siehe Phase-2-Seed: beide Zähler müssen explizit zurück, sonst trägt
    // ein Sprung aus einem laufenden Spiel die alten Werte mit.
    s.metadata  = 0;
    s.models    = 0;
    // Dito: sonst zeigt ein Sprung aus einem laufenden Spiel Marcus' alten
    // Griff im Modal an, das dieser Seed gar nicht öffnet.
    s.investorCutAmount = 0;

    // Grundinteresse ist nach 300 s Phase-2-Zeit auf 0 — bei einer Plattform
    // dieser Größe längst durch. Die geforderten +5 % kommen deshalb als
    // Debug-Modifikator dazu; er steht sichtbar in der Trend-Aufschlüsselung.
    s.trendMods          = {};
    s.phase2Sec          = 1200;
    s.trendStacks        = 0;
    s.trendCycleTime     = 0;
    s.trendShieldUntil   = 0;
    s.trendShieldReadyAt = 0;

    s.introTourSeen     = true;
    s.trendModalSeen    = true;
    // Auch hier ist die Watchtime-Achse komplett offen (siehe done-Liste
    // unten) — die Karte kommt beim ersten Feature dieser Art.
    s.watchtimeMultSeen = false;
    // Der Seed setzt phase3Triggered direkt und überspringt damit Marcus'
    // Modal (siehe Kommentar oben) — und mit ihm den Anstoß der Phase-3-Tour.
    // false lässt sie stattdessen über den Nachhol-Pfad in gameScreen.js
    // laufen, sonst wäre dieser Seed der einzige Weg, die KI-Labor-Tour NIE
    // zu Gesicht zu bekommen.
    s.phase3TourSeen    = false;
    s.goLiveUnlocked    = true;
    s.investorTriggered = true;
    s.phase3Triggered   = true;
    s.goLiveModalSeen   = true;
    s.lastFlyerTick     = 0;
    s.sparkHistory      = { money: [], users: [] };
    s.purchases         = { rechner: true };
    s.seenBadges        = { hq_phase0: true, hq_phase1: true, shop: true,
                            tab_marketing: true, tab_werbung: true };

    // Marketing- und Werbung-Reiter komplett durch, Hauptbaum bis auf die
    // letzte Spalte (polls, infiniteScroll, pushNotifications, gamification,
    // autoplay) sowie events, stories und liveStreaming.
    //
    // Damit ist auch die ganze Watchtime-Achse noch offen — watchtimeMult()
    // steht auf 1, die Farmen produzieren also den nackten Grundwert.
    var done = ['frontend1', 'backend1', 'account', 'feed', 'bilder',
                'frontend2', 'backend2', 'like', 'kommentar', 'teilen',
                'logoNeu', 'dm', 'gruppen', 'suche', 'videos', 'unternehmen',
                'mk_freunde', 'mk_flyer', 'mk_langzeit', 'mk_sprint',
                'mk_presse', 'mk_partner',
                // Der Werbung-Reiter ist in Phase 2 komplett — inklusive der
                // Anzeigen-Optimierung, sonst startet der Seed ohne die
                // Volumen-Spalte und die Phase-3-Stufen hätten keinen
                // Vergleichswert daneben.
                'wb_coop', 'wb_display', 'wb_search', 'wb_video', 'wb_adopt'];
    s.techtree = {};
    for (var i = 0; i < done.length; i++) {
      s.techtree[done[i]] = { status: 'done', startAt: 0, slot: 'hq-1' };
    }

    // Freizone ist 5×4 (Spalten 0–4, Zeilen 0–3) = 20 Felder. HQ + vier
    // 2×2-Farmen belegen davon 17, für fünf 1×1-Gebäude bleiben drei — die
    // beiden übrigen stehen auf zwei dazugekauften Feldern links daneben.
    s.ownedTiles = ['-1,2', '-1,3'];
    s.instanceCounter = 10;
    s.placedBuildings = [
      { instanceId: 'hq-1',        id: 'hq',        col:  0, row: 0, size: 1,
        state: { level: 2 } },
      { instanceId: 'farm-2',      id: 'farm',      col:  1, row: 0, size: 2,
        state: { tierId: 'ziege', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-3',      id: 'farm',      col:  3, row: 0, size: 2,
        state: { tierId: 'ziege', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-4',      id: 'farm',      col:  1, row: 2, size: 2,
        state: { tierId: 'ziege', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-5',      id: 'farm',      col:  3, row: 2, size: 2,
        state: { tierId: 'gans',  stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'werbe-6',     id: 'werbe',     col:  0, row: 1, size: 1,
        state: { deal: null, moneyReady: 0, lastDeal: null } },
      { instanceId: 'werbe-7',     id: 'werbe',     col:  0, row: 2, size: 1,
        state: { deal: null, moneyReady: 0, lastDeal: null } },
      { instanceId: 'marketing-8', id: 'marketing', col:  0, row: 3, size: 1,
        state: { active: null, ready: 0 } },
      { instanceId: 'marketing-9', id: 'marketing', col: -1, row: 2, size: 1,
        state: { active: null, ready: 0 } },
      { instanceId: 'buero-10',    id: 'buero',     col: -1, row: 3, size: 1,
        state: {} }
    ];

    // Muss nach dem Leeren von trendMods stehen, sonst räumt das den
    // Modifikator gleich wieder weg. holdUntil ist ein absoluter Zeitstempel
    // und übersteht damit das Speichern + Neuladen.
    RT.state.setTrendMod('debug', '🛠 Debug', 5, 3600);
  }

  // --- Phase-4-Seed ---
  // Eine Plattform knapp über RT.actions.PHASE4_USER_THRESHOLD (45 Mio) mit
  // dem Konto, das die Ereigniskarten voraussetzen: sie rechnen ihre Beträge
  // in Prozent vom Firmenwert (Geld + User × 2), hier also 150 Mio € — eine
  // 5-%-Strafe sind 7,5 Mio.
  //
  // ⚠️ phase4Triggered bleibt FALSE. Anders als beim Phase-3-Seed ist der
  // Auftritt hier genau das, was sich testen lässt: der nächste Tick löst
  // Gratulations-Modal und Tour aus, danach kommt die erste Runde. Ein
  // gesetztes Flag würde beides überspringen.
  //
  // Der Techtree ist bewusst LÜCKENHAFT — jede Lücke ist die Bedingung
  // einer Krisenkarte, und ohne sie läge das halbe Deck brach:
  //   kein moderation    → Bot-Netzwerke
  //   kein api           → Datenleck (zusammen mit ki_profile)
  //   kein en_erneuerbar → Umweltkritik
  //   infiniteScroll + autoplay → Verurteilt: Jugendschutz
  function applyPhase4Seed() {
    var s = RT.state.current;
    ensurePlayer(s);
    s.money     = 60000000;
    s.users     = 45000000;
    s.watchtime = 20000000;
    s.metadata  = 2000000;
    s.models    = 0;
    s.investorCutAmount = 0;

    s.trendMods          = {};
    s.phase2Sec          = 3000;
    s.trendStacks        = 0;
    s.trendCycleTime     = 0;
    s.trendShieldUntil   = 0;
    s.trendShieldReadyAt = 0;

    s.introTourSeen     = true;
    s.trendModalSeen    = true;
    s.watchtimeMultSeen = true;
    s.phase3TourSeen    = true;
    s.phase4TourSeen    = false;
    s.goLiveUnlocked    = true;
    s.investorTriggered = true;
    s.phase3Triggered   = true;
    s.phase4Triggered   = false;
    s.goLiveModalSeen   = true;
    s.networkTourSeen   = true;
    s.whitePatternSeen  = true;
    s.networkSeen       = RT.state.networkEffect();
    s.networkSatSeen    = false;
    s.lastFlyerTick     = 0;
    s.sparkHistory      = { money: [], users: [] };
    s.purchases         = { rechner: true };
    s.seenBadges        = { hq_phase0: true, hq_phase1: true, shop: true,
                            tab_marketing: true, tab_werbung: true };
    // Frischer Kartenzustand — sonst trägt ein Sprung aus einem laufenden
    // Phase-4-Spiel Deck, Tisch und dauerhafte Schuld mit.
    s.events = null;

    var done = ['frontend1', 'backend1', 'account', 'feed', 'bilder',
                'frontend2', 'backend2', 'like', 'kommentar', 'teilen',
                'logoNeu', 'dm', 'gruppen', 'suche', 'videos', 'unternehmen',
                'polls', 'events', 'barrierefrei',
                // Watchtime-Achse inklusive beider Phase-2-Dark-Patterns —
                // ohne sie hätte das Jugendschutz-Urteil keine Grundlage.
                'infiniteScroll', 'autoplay', 'pushNotifications', 'gamification',
                'stories', 'liveStreaming',
                'mk_freunde', 'mk_flyer', 'mk_langzeit', 'mk_sprint',
                'mk_presse', 'mk_partner', 'mk_team',
                'wb_coop', 'wb_display', 'wb_search', 'wb_video', 'wb_adopt',
                // Phase 3: KI-Labor steht, Profilbildung auch (Datenleck).
                'ki_speicher', 'ki_training', 'ki_profile'];
    s.techtree = {};
    for (var i = 0; i < done.length; i++) {
      if (!RT.techtree.NODES[done[i]]) continue;   // Node umbenannt → still überspringen
      s.techtree[done[i]] = { status: 'done', startAt: 0, slot: 'hq-1' };
    }

    s.ownedTiles = ['-1,0', '-1,1', '-1,2', '-1,3'];
    s.instanceCounter = 12;
    s.placedBuildings = [
      { instanceId: 'hq-1',         id: 'hq',        col:  0, row: 0, size: 1,
        state: { level: 3 } },
      { instanceId: 'farm-2',       id: 'farm',      col:  1, row: 0, size: 2,
        state: { tierId: 'kuh', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-3',       id: 'farm',      col:  3, row: 0, size: 2,
        state: { tierId: 'kuh', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-4',       id: 'farm',      col:  1, row: 2, size: 2,
        state: { tierId: 'kuh', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'farm-5',       id: 'farm',      col:  3, row: 2, size: 2,
        state: { tierId: 'kuh', stacks: 0, cycleTime: 0, upkeepCycles: 0 } },
      { instanceId: 'werbe-6',      id: 'werbe',     col:  0, row: 1, size: 1,
        state: { deal: null, moneyReady: 0, lastDeal: null } },
      { instanceId: 'werbe-7',      id: 'werbe',     col:  0, row: 2, size: 1,
        state: { deal: null, moneyReady: 0, lastDeal: null } },
      { instanceId: 'marketing-8',  id: 'marketing', col:  0, row: 3, size: 1,
        state: { active: null, ready: 0, lastTrend: null } },
      { instanceId: 'marketing-9',  id: 'marketing', col: -1, row: 3, size: 1,
        state: { active: null, ready: 0, lastTrend: null } },
      { instanceId: 'buero-10',     id: 'buero',     col: -1, row: 2, size: 1,
        state: {} },
      { instanceId: 'kilabor-11',   id: 'kilabor',   col: -1, row: 1, size: 1,
        state: { conv: null, modelsReady: 0, lastConv: null } }
    ];
  }

  function init() {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    window.addEventListener('blur', onBlur);
  }

  RT.debug = { init: init };
})(window.RT3);
