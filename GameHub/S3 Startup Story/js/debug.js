/* Debug-Overlay. Halte W+I gleichzeitig gedrückt → Overlay öffnet sich.
   Erlaubt Geld-Cheats und Phase-Sprünge. Nur für Development. */
(function (RT) {
  'use strict';

  var pressed = { w: false, i: false };
  var overlay = null;

  // --- Hotkey ---
  function onKeydown(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k !== 'w' && k !== 'i') return;
    pressed[k] = true;
    if (pressed.w && pressed.i && !overlay) openOverlay();
  }
  function onKeyup(ev) {
    var k = (ev.key || '').toLowerCase();
    if (k === 'w' || k === 'i') pressed[k] = false;
  }
  function onBlur() { pressed.w = false; pressed.i = false; }

  // --- Overlay ---
  function openOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'rt-debug-overlay';
    overlay.style.cssText = ''
      + 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      + 'z-index:99999;background:#1a1a1a;color:#fff;padding:24px 28px;'
      + 'border:2px solid #f0c;border-radius:8px;font-family:sans-serif;'
      + 'min-width:340px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    overlay.innerHTML = ''
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '  <div style="font-size:18px;font-weight:bold;">🛠 Debug</div>'
      + '  <button id="rt-debug-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;">×</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">💰 Geld hinzufügen</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">'
      + '  <button class="rt-dbg-money" data-amt="1000"     style="' + btnCss() + '">+1k</button>'
      + '  <button class="rt-dbg-money" data-amt="10000"    style="' + btnCss() + '">+10k</button>'
      + '  <button class="rt-dbg-money" data-amt="100000"   style="' + btnCss() + '">+100k</button>'
      + '  <button class="rt-dbg-money" data-amt="1000000"  style="' + btnCss() + '">+1M</button>'
      + '</div>'
      // Seit Phase 3 sind Metadaten eine echte Währung (Nodes, Targeting,
      // Zielgruppen-Offensive). Ohne diesen Knopf kostet es mehrere Minuten
      // Spielzeit, bis sich irgendetwas davon überhaupt auslösen lässt.
      + '<div style="margin-bottom:10px;font-weight:bold;">🗃️ Metadaten hinzufügen</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">'
      + '  <button class="rt-dbg-meta" data-amt="100000"   style="' + btnCss() + '">+100k</button>'
      + '  <button class="rt-dbg-meta" data-amt="500000"   style="' + btnCss() + '">+500k</button>'
      + '  <button class="rt-dbg-meta" data-amt="2000000"  style="' + btnCss() + '">+2M</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">📈 Trend setzen</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'
      + '  <button class="rt-dbg-trend" data-v="-8" style="' + btnCss('#933') + '">-8</button>'
      + '  <button class="rt-dbg-trend" data-v="-3" style="' + btnCss('#933') + '">-3</button>'
      + '  <button class="rt-dbg-trend" data-v="0"  style="' + btnCss() + '">0</button>'
      + '  <button class="rt-dbg-trend" data-v="3"  style="' + btnCss('#396') + '">+3</button>'
      + '  <button class="rt-dbg-trend" data-v="8"  style="' + btnCss('#396') + '">+8</button>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">'
      + '  <button id="rt-dbg-trend-fill" style="' + btnCss() + '">Stapel voll</button>'
      + '  <button id="rt-dbg-trend-clear" style="' + btnCss() + '">Debug-Mod weg</button>'
      + '</div>'
      + '<div style="margin-bottom:10px;font-weight:bold;">🚀 Phase springen</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">'
      + '  <button id="rt-dbg-restart" style="' + btnCss('#c33') + '">Kompletter Neustart</button>'
      + '  <button id="rt-dbg-phase2"  style="' + btnCss('#396') + '">Zum Anfang von Phase 2</button>'
      + '  <button id="rt-dbg-phase3"  style="' + btnCss('#369') + '">Zum Anfang von Phase 3</button>'
      + '  <button id="rt-dbg-phase4"  style="' + btnCss('#636') + '">Zum Anfang von Phase 4</button>'
      + '</div>'
      + '<div style="margin:16px 0 10px;font-weight:bold;">🃏 Ereigniskarten</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '  <button id="rt-dbg-ev-now"  style="' + btnCss() + '">Runde jetzt</button>'
      + '  <button id="rt-dbg-ev-open" style="' + btnCss() + '">Tisch öffnen</button>'
      + '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#rt-debug-close').onclick = closeOverlay;

    var moneyBtns = overlay.querySelectorAll('.rt-dbg-money');
    for (var i = 0; i < moneyBtns.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          var amt = parseInt(btn.getAttribute('data-amt'), 10);
          RT.state.current.money += amt;
          RT.bus.emit('state:changed');
        };
      })(moneyBtns[i]);
    }

    var metaBtns = overlay.querySelectorAll('.rt-dbg-meta');
    for (var m = 0; m < metaBtns.length; m++) {
      (function (btn) {
        btn.onclick = function () {
          var amt = parseInt(btn.getAttribute('data-amt'), 10);
          RT.state.current.metadata = (RT.state.current.metadata || 0) + amt;
          RT.bus.emit('state:changed');
        };
      })(metaBtns[m]);
    }

    // Setzt einen Debug-Modifikator, der den Trend auf den Zielwert zieht.
    // Läuft über setTrendMod, damit er in der Aufschlüsselung sichtbar ist.
    // Lange Haltezeit, damit er zum Testen nicht sofort wegklingt.
    var trendBtns = overlay.querySelectorAll('.rt-dbg-trend');
    for (var t = 0; t < trendBtns.length; t++) {
      (function (btn) {
        btn.onclick = function () {
          var target = parseFloat(btn.getAttribute('data-v'));
          RT.state.removeTrendMod('debug');
          var rest = RT.state.trendValue();
          RT.state.setTrendMod('debug', '🛠 Debug', Math.round((target - rest) * 10) / 10, 3600);
          RT.bus.emit('state:changed');
        };
      })(trendBtns[t]);
    }
    overlay.querySelector('#rt-dbg-trend-fill').onclick = function () {
      RT.state.current.trendStacks    = RT.state.TREND_STACK_MAX;
      RT.state.current.trendCycleTime = 0;
      RT.bus.emit('state:changed');
    };
    overlay.querySelector('#rt-dbg-trend-clear').onclick = function () {
      RT.state.removeTrendMod('debug');
      RT.bus.emit('state:changed');
    };

    overlay.querySelector('#rt-dbg-restart').onclick = function () {
      if (!confirm('Kompletter Neustart — Spielstand geht verloren. Sicher?')) return;
      // wipe() löscht auch den Serverstand (RPC) und ist deshalb async.
      // Vor dem Reload abwarten, sonst stirbt der RPC mit der Seite und der
      // nächste Boot lädt den gerade gelöschten Stand wieder herunter.
      RT.storage.wipe().then(function () { location.reload(); });
    };
    overlay.querySelector('#rt-dbg-phase2').onclick = function () {
      if (!confirm('Zum Anfang von Phase 2 springen? Aktueller Spielstand geht verloren.')) return;
      applyPhase2Seed();
      RT.storage.save();
      location.reload();
    };
    overlay.querySelector('#rt-dbg-phase3').onclick = function () {
      if (!confirm('Zum Anfang von Phase 3 springen? Aktueller Spielstand geht verloren.')) return;
      applyPhase3Seed();
      RT.storage.save();
      location.reload();
    };
    overlay.querySelector('#rt-dbg-phase4').onclick = function () {
      if (!confirm('Zum Anfang von Phase 4 springen? Aktueller Spielstand geht verloren.')) return;
      applyPhase4Seed();
      RT.storage.save();
      location.reload();
    };

    // Die Uhr vorspulen statt fünf Minuten zu warten. Der Tick zieht die
    // Runde dann selbst — dadurch läuft der Testweg über denselben Pfad
    // wie das echte Spiel und nicht über einen zweiten Einstieg.
    overlay.querySelector('#rt-dbg-ev-now').onclick = function () {
      if (!RT.events || !RT.events.active()) { alert('Ereigniskarten laufen erst ab Phase 4.'); return; }
      RT.events.state().nextAt = 0;
      closeOverlay();
    };
    overlay.querySelector('#rt-dbg-ev-open').onclick = function () {
      if (!RT.events || !RT.events.active()) { alert('Ereigniskarten laufen erst ab Phase 4.'); return; }
      closeOverlay();
      RT.events.open();
    };
  }

  function closeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function btnCss(bg) {
    return 'background:' + (bg || '#333') + ';color:#fff;border:1px solid #555;'
         + 'padding:8px 14px;border-radius:4px;cursor:pointer;font-size:14px;';
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
    // Debug-Modifikator dazu; er steht sichtbar in der Trend-Aufschlüsselung
    // und lässt sich oben mit „Debug-Mod weg" jederzeit abräumen.
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
