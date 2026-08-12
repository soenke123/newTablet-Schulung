/* Touren — visuelle Erklärungen an den Stellen, an denen etwas Neues
   auftaucht, das sich nicht von selbst erklärt:

     intro   — Spielanfang: Grid, HQ, die drei Zahlen, Shop, "los geht's"
     golive  — nach dem Launch: neue HQ-Reiter und das nächste Ziel (1 Karte)
     phase2  — nach dem Investor: Trend, Watchtime, die drei neuen Gebäude
     phase3  — nach Marcus' Rückkehr: Modelle, Metadaten, das KI-Labor
     wtmult  — erstes Feature mit watchtimeMult: was der ×-Chip bedeutet

   Prinzip: der Bildschirm wird abgedunkelt, das jeweils erklärte ECHTE
   UI-Element bleibt hell und live (der Trend-Balken zählt weiter), ein Pfeil
   zeigt darauf, darunter eine kompakte Karte mit Bild und wenig Text.

   Die Abdunkelung entsteht durch einen Riesen-Schatten um ein "Loch"
   (.rt-tour__hole) — dadurch liegt nie etwas ÜBER dem Ziel, und es muss
   nicht am z-index der Ressourcen-Bar gedreht werden.

   Farbgebung zieht die Theme-Variablen des gewählten Plattform-Logos
   (--rt-primary / -soft / -wash aus theme.js).

   Aufrufer:
     • gameScreen.js — beim Betreten des Spiels (startIfNew, wählt die
       Tour nach Phase)
     • ui.js — nach dem Investor-Deal (startIfNew('phase2')) und beim
       Einsammeln der ersten watchtimeMult-Node (startIfNew('wtmult', id))
     • "?"-Button neben dem Shop — start(), ignoriert das Flag

   Jede Tour merkt sich ihr eigenes "gesehen"-Flag im State (TOURS). */
(function (RT) {
  'use strict';

  var PAD       = 6;   // Luft zwischen Ziel und Loch-Rand
  var ARROW_GAP = 26;  // Platz für den Pfeil zwischen Ziel und Karte

  var _open  = false;
  var _id    = null;
  var _idx   = 0;
  var _steps = null;
  var _root  = null;
  var _refs  = {};

  // Registrierte Touren: Aufbau + eigenes "gesehen"-Flag im State.
  // Die Definitionen stehen weiter unten; das Objekt wird am Ende gefüllt.
  var TOURS = {
    intro:  { flag: 'introTourSeen',      build: function () { return buildIntroSteps();  } },
    golive: { flag: 'goLiveModalSeen',    build: function () { return buildGoLiveSteps(); } },
    phase2: { flag: 'trendModalSeen',     build: function () { return buildPhase2Steps(); } },
    phase3: { flag: 'phase3TourSeen',     build: function () { return buildPhase3Steps(); } },
    phase4: { flag: 'phase4TourSeen',     build: function () { return buildPhase4Steps(); } },
    wtmult: { flag: 'watchtimeMultSeen',  build: function (ctx) { return buildWtMultSteps(ctx); } },
    // Wie 'wtmult' beide an ein EREIGNIS gehängt, nicht an eine Phase:
    // der Netzwerkeffekt überschreitet seine Schwelle irgendwann in Phase 2
    // oder 3, und wann das erste Vertrauens-Feature fertig wird, entscheidet
    // der Spieler. Beide stehen deshalb auch nicht in forPhase().
    network: { flag: 'networkTourSeen',   build: function () { return buildNetworkSteps(); } },
    whitepattern: { flag: 'whitePatternSeen',
                    build: function (ctx) { return buildWhitePatternSteps(ctx); } }
  };

  // Welche Tour zur aktuellen Phase gehört — Grundlage für den "?"-Button
  // und für den Aufruf beim Betreten des Spiels. Jede Phase zeigt das, was
  // an ihrem Anfang erklärt wurde: Phase 1 also die Go-Live-Karte und nicht
  // die Intro-Tour, deren Inhalt dort längst abgehakt ist.
  //
  // 'wtmult' steht bewusst NICHT in dieser Liste: sie hängt an einem
  // Ereignis, nicht an einer Phase (die auslösende Node kann in Phase 2 oder
  // 3 fallen), und die dauerhafte Aufschlüsselung sitzt ohnehin hinter dem
  // Chip an der Watchtime-Kachel.
  function forPhase() {
    var p = RT.state.currentPhase();
    if (p >= 4) return 'phase4';
    if (p === 3) return 'phase3';
    if (p === 2) return 'phase2';
    if (p === 1) return 'golive';
    return 'intro';
  }

  function sprite(typeId) {
    var t = RT.state.BUILDING_TYPES[typeId];
    return t ? t.sprite : '';
  }

  // Gebäude-Kachel für Schritt 3. Bild und Text sitzen in zwei Blöcken,
  // damit dieselbe Auszeichnung nebeneinander (breit) und untereinander
  // (schmal, Bild links) funktioniert.
  function bldHTML(typeId, name, text) {
    return ''
      + '<div class="rt-tour-bld">'
      + '  <img src="' + sprite(typeId) + '" alt="">'
      + '  <div class="rt-tour-bld__txt">'
      + '    <b class="rt-tour-bld__name">' + name + '</b>'
      + '    <span class="rt-tour-bld__desc">' + text + '</span>'
      + '  </div>'
      + '</div>';
  }

  // Trennstriche im Demo-Balken — dieselbe Aufteilung wie im echten
  // Ernte-Button (ui.js trendTicksHTML), damit das Bild nicht lügt.
  function ticksHTML() {
    var max = RT.state.TREND_STACK_MAX || 5;
    var out = '';
    for (var i = 1; i < max; i++) {
      out += '<i style="left:' + (i / max * 100).toFixed(2) + '%"></i>';
    }
    return out;
  }

  // Umriss aller Grid-Felder zusammen. Das Iso-Grid selbst ist deutlich
  // größer als die bespielte Fläche (Kranz + Kamera-Spielraum), taugt als
  // Spotlight-Ziel also nicht — die Felder tun es.
  function tilesRect() {
    // Gebäude gehören dazu: das HQ-Sprite ragt über seine Kachel hinaus und
    // läge sonst zur Hälfte im Dunkeln.
    var tiles = document.querySelectorAll('#iso-grid .iso-tile, #iso-grid .building');
    if (!tiles.length) return null;
    var box = null;
    for (var i = 0; i < tiles.length; i++) {
      var r = tiles[i].getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (!box) box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      else {
        box.left   = Math.min(box.left,   r.left);
        box.top    = Math.min(box.top,    r.top);
        box.right  = Math.max(box.right,  r.right);
        box.bottom = Math.max(box.bottom, r.bottom);
      }
    }
    if (!box) return null;
    // Unter der Ressourcen-Bar abschneiden: die Felder reichen optisch
    // darunter weiter, das Loch soll die Bar aber nicht anknabbern.
    var world = document.getElementById('world');
    if (world) box.top = Math.max(box.top, world.getBoundingClientRect().top);
    return { left: box.left, top: box.top,
             width: box.right - box.left, height: box.bottom - box.top };
  }

  function hqSelector() {
    var hq = RT.state.instancesByType('hq')[0];
    return hq ? '.building[data-instance-id="' + hq.instanceId + '"]' : null;
  }

  // ── Intro-Tour: der Spielanfang, sobald das Grid zum ersten Mal steht ──
  function buildIntroSteps() {
    var player = RT.state.current.player || {};
    var name   = player.name ? String(player.name) : 'du';
    var body   = player.avatar ? RT.assets.avatarSrc(player.avatar, 'body') : '';
    var logo   = player.platformLogo ? RT.assets.logoSrc(player.platformLogo) : '';
    var plat   = player.platformName ? String(player.platformName) : 'deine Plattform';

    return [
      {
        rect:   tilesRect,
        inside: true,
        title:  '🌱 Dein Grundstück',
        body: ''
          + '<p class="rt-tour-line">Hier wächst dein Unternehmen. Auf jedes freie Feld '
          + 'kannst du später ein <b>Gebäude</b> setzen.</p>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">9 Felder zum Start</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">später kaufst du Land dazu</span>'
          + '</div>'
      },
      {
        target: hqSelector(),
        title:  '🏚️ Deine Garage — das HQ',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic">'
          + '    <span class="rt-tour-pic__stage">'
          + '      <img src="' + RT.state.HQ_SPRITE.sprite + '" alt="">'
          + '    </span>'
          + '    <figcaption>HQ</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">🧩</span>'
          + '    <figcaption>Features</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li>Ein <b>Klick aufs HQ</b> öffnet deinen <b>Entwicklungs-Baum</b>.</li>'
          + '  <li>Dort entwickelst du <b>Features</b> — jedes braucht <b>Zeit</b>.</li>'
          + '  <li>Es läuft immer nur <b>eine Entwicklung</b> gleichzeitig.</li>'
          + '</ul>'
      },
      {
        target: '.rt-resources',
        title:  '📊 Deine drei Zahlen',
        body: ''
          + '<div class="rt-tour-blds">'
          + resHTML('💰', 'Geld',   'dein Startkapital — davon kaufst du <b>Hardware</b> und <b>Gebäude</b>.')
          + resHTML('👥', 'User',   'noch <b>keine</b>. Die kommen erst, wenn die Plattform <b>online</b> ist.')
          + resHTML('🖥️', 'Server', '<b>Kapazität</b> für deine Features — sie kommt aus <b>Serverfarmen</b>.')
          + '</div>',
        wide: true
      },
      {
        target: '#shop-btn',
        title:  '🛒 Der Shop',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">💻</span>'
          + '    <figcaption>Rechner</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">+</span>'
          + '  <figure class="rt-tour-pic">'
          + '    <span class="rt-tour-pic__stage"><img src="' + sprite('farm') + '" alt=""></span>'
          + '    <figcaption>Serverfarm</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<p class="rt-tour-line">Hier kaufst du <b>Hardware</b> und <b>Gebäude</b>. '
          + 'Beides zusammen brauchst du für dein <b>erstes Feature</b>.</p>'
      },
      {
        title: '🛠️ Ran an die Arbeit, ' + name + '!',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + (body ? '<figure class="rt-tour-pic rt-tour-pic--hero">'
                  + '  <span class="rt-tour-pic__stage"><img src="' + body + '" alt=""></span>'
                  + '  <figcaption>' + name + '</figcaption>'
                  + '</figure>' : '')
          + (logo ? '<figure class="rt-tour-pic rt-tour-pic--hero">'
                  + '  <span class="rt-tour-pic__stage"><img src="' + logo + '" alt=""></span>'
                  + '  <figcaption>' + plat + '</figcaption>'
                  + '</figure>' : '')
          + '</div>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">🛠️ entwickeln</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip">🚀 online gehen</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">👥 User</span>'
          + '</div>'
          + '<p class="rt-tour-line">Bevor jemand deine Plattform nutzen kann, muss sie '
          + '<b>gebaut</b> werden. An User denkst du danach.</p>'
          + '<p class="rt-tour-hint">Nächster Schritt: <b>Rechner und Serverfarm</b> kaufen — '
          + 'dann im HQ das erste Feature starten.</p>',
        cta: 'Los geht\'s! 🛠️'
      }
    ];
  }

  // ── Go-Live: eine einzelne Karte zwischen Phase 0 und 1 ──
  // Kein Spotlight — es ist ein Moment, kein Zeigefinger. Deshalb auch
  // nur ein Schritt: was neu ist und was das nächste Ziel ist.
  function buildGoLiveSteps() {
    var player = RT.state.current.player || {};
    var plat   = player.platformName ? String(player.platformName) : 'Deine Plattform';
    var logo   = player.platformLogo ? RT.assets.logoSrc(player.platformLogo) : '';
    var goal   = RT.actions.INVESTOR_USER_THRESHOLD || 1000;

    return [
      {
        title: '🎉 ' + plat + ' ist online!',
        body: ''
          + (logo
              ? '<div class="rt-tour-flow rt-tour-flow--pics">'
              + '  <figure class="rt-tour-pic rt-tour-pic--hero rt-tour-pic--brand">'
              + '    <span class="rt-tour-pic__stage"><img src="' + logo + '" alt=""></span>'
              + '    <figcaption><span class="rt-tour-live"></span> live</figcaption>'
              + '  </figure>'
              + '</div>'
              : '')
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip rt-tour-chip--done">✅ entwickelt</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">🌐 online</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip">👥 User</span>'
          + '</div>'
          + '<div class="rt-tour-sub">🆕 Neu im HQ</div>'
          + '<div class="rt-tour-blds">'
          + resHTML('📣', 'Marketing', 'Freunden erzählen und Flyer verteilen — deine ersten <b>User</b>.')
          + resHTML('📢', 'Werbung',   'Die erste Kooperation läuft im Hintergrund und bringt <b>Geld</b>.')
          + '</div>'
          // Bewusst nur das Ziel — was bei 1 000 Usern passiert, soll der
          // Investor-Moment selbst erzählen und nicht vorher verraten werden.
          + '<div class="rt-tour-goal">'
          + '  <span class="rt-tour-goal__label">🎯 Nächstes Ziel</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">👥 ' + fmtNum(goal) + ' User</span>'
          + '</div>',
        cta: 'Los geht\'s! 🚀'
      }
    ];
  }

  // 1000 → "1 000". Kleine eigene Formatierung, damit das Modul nicht an
  // der Zahlen-Formatierung der UI hängt.
  function fmtNum(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Gekürzte Beträge für die Phase-4-Säulen — dort stehen drei Zahlen
  // nebeneinander in einer schmalen Spalte, ausgeschrieben passt das nicht.
  function fmtMoney(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return (a / 1e9).toFixed(1).replace('.', ',') + ' Mrd €';
    if (a >= 1e6) return Math.round(a / 1e6) + ' Mio €';
    if (a >= 1e3) return Math.round(a / 1e3) + ' Tsd €';
    return Math.round(a) + ' €';
  }

  // Eine der drei Zahlen als Kachel — gleiche Bauart wie die Gebäude-Kacheln
  // in der Phase-2-Tour, nur mit Emoji statt Sprite.
  function resHTML(icon, name, text) {
    return ''
      + '<div class="rt-tour-bld">'
      + '  <span class="rt-tour-bld__emoji">' + icon + '</span>'
      + '  <div class="rt-tour-bld__txt">'
      + '    <b class="rt-tour-bld__name">' + name + '</b>'
      + '    <span class="rt-tour-bld__desc">' + text + '</span>'
      + '  </div>'
      + '</div>';
  }

  // Schritte werden bei jedem Start neu gebaut — die Texte ziehen Zahlen
  // aus dem State, und der Spielstand kann sich zwischendurch ändern.
  function buildPhase2Steps() {
    var cyc  = RT.state.TREND_CYCLE_SEC  || 15;
    var base = RT.state.TREND_BASE_START || 3;

    return [
      {
        target: '#rt-trend-card',
        title:  '⭐ Trend = dein Wachstum',
        body: ''
          + '<div class="rt-tour-bar">'
          + '  <span class="rt-tour-bar__fill"></span>'
          + '  <span class="rt-tour-bar__ticks">' + ticksHTML() + '</span>'
          + '  <span class="rt-tour-bar__label">Schub abholen</span>'
          + '</div>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">⭐ +' + base + ' %</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">👥 +' + base + ' % User</span>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li><b>+' + base + ' %</b> heißt: alle ' + cyc + ' s wachsen deine User um ' + base + ' %.</li>'
          + '  <li>Der Balken füllt sich — mit einem <b>Klick abholen</b>.</li>'
          + '  <li><b>Negativ?</b> Dann wandern User ab. Ein Klick halbiert den Schaden.</li>'
          + '  <li><b>Steigern?</b> Fertige Features aus dem <b>HQ</b> geben Rückenwind — '
          +      'Werbedeals drücken ihn.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Details jederzeit über das <b>?</b> auf der Kachel.</p>'
      },
      {
        target: '.rt-resource--watchtime',
        title:  '⏳ Watchtime — was deine User dalassen',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic">'
          + '    <span class="rt-tour-pic__stage">'
          + '      <img src="' + sprite('farm') + '" alt="">'
          + '      <b class="rt-tour-bubble rt-tour-bubble--1">⏳</b>'
          + '      <b class="rt-tour-bubble rt-tour-bubble--2">⏳</b>'
          + '      <b class="rt-tour-bubble rt-tour-bubble--3">⏳</b>'
          + '    </span>'
          + '    <figcaption>Serverfarm</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">⏳</span>'
          + '    <figcaption>Watchtime</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<p class="rt-tour-line">Auf den Serverfarmen produzieren deine <b>User</b> '
          + 'laufend Watchtime. <b>Klick auf die Farm</b> = ernten.</p>'
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">⏳</span>'
          + '    <figcaption>Watchtime</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic">'
          + '    <span class="rt-tour-pic__stage"><img src="' + sprite('werbe') + '" alt=""></span>'
          + '    <figcaption>Werbeagentur</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">💰</span>'
          + '    <figcaption>Geld</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<p class="rt-tour-line">Zu <b>Geld</b> wird sie nur in der <b>Werbeagentur</b>.</p>'
      },
      // Serverkosten. Sie laufen ab Phase 2 mit, und der erste Kontakt darf
      // nicht das blaue Icon auf einer plötzlich langsamen Farm sein.
      // Spotlight auf die Server-Kachel, weil dort die Tarifstufe steht —
      // dieselbe Regel wie beim Watchtime-Multiplikator: erklärt wird da, wo
      // die Zahl zum ersten Mal auftaucht.
      {
        target: '.rt-resource--server',
        title:  RT.assets.iconHtml('stromWasser') + ' Strom, Wasser & Wartung',
        body: ''
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">🖥️ Kapazität</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--bad">' + RT.assets.iconHtml('stromWasser') + ' laufende Kosten</span>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li>Deine Serverfarmen wollen <b>versorgt</b> werden — alle '
          +      RT.state.serverUpkeepCycles() + ' Zyklen mit einem Klick auf das '
          +      '<b>' + RT.assets.iconHtml('stromWasser') + '-Symbol</b> an der Farm.</li>'
          + '  <li>Bezahlt wird nach <b>Kapazität</b>. Je größer deine Anlage, '
          +      'desto teurer wird jede Einheit — die Stufe steht in der Server-Kachel.</li>'
          + '  <li><b>Unversorgt?</b> Die Farm läuft erst halb so schnell, dann auf '
          +      'Sparflamme — und belegte Farmen drücken den <b>Trend</b>.</li>'
          + '  <li><b>Leere</b> Farmen dürfen dunkel bleiben. Die kosten nichts.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Antippen der Stufe zeigt alle Tarife.</p>'
      },
      {
        target: '#shop-btn',
        title:  '🏗️ Drei neue Gebäude',
        body: ''
          + '<div class="rt-tour-blds">'
          + bldHTML('werbe',     'Werbeagentur <b class="rt-tour-bld__first">zuerst</b>',
                    'macht <b>Watchtime zu Geld</b> — kostet <b>Trend</b>.')
          + bldHTML('marketing', 'Marketing-Center',
                    'macht <b>Geld zu Usern</b> — oder kauft <b>Trend</b> zurück.')
          + bldHTML('buero',     'Bürogebäude',
                    'entwickelt <b>parallel</b> zum HQ.')
          + '</div>'
          // ⚠️ Die Reihenfolge steht hier und nicht nur als Sperre im Shop:
          // die Werbeagentur ist die einzige Geldquelle des Spiels, und wer
          // sein Investment vorher in Marketing und Büro steckt, hat kein
          // Einkommen mehr (js/state.js, buildingLocked). Der Shop lässt die
          // beiden deshalb erst danach zu — gesagt werden muss es trotzdem.
          + '<p class="rt-tour-hint">Alle drei findest du im 🛒 <b>Shop</b> — '
          + 'die anderen beiden schaltet die <b>Werbeagentur</b> frei.</p>',
        wide: true,
        cta:  'Starte dein Wachstum 🚀'
      }
    ];
  }

  // ── Phase 3: KI-Labor, User-Modelle, Metadaten ──
  // Ausgelöst nach Marcus' Rückkehr (ui.js, showPhase3Modal) — derselbe
  // Anschluss wie beim Investor-Deal, der die Phase2-Tour anstößt. Gleiche
  // Bauart wie buildPhase2Steps: erst die neue Produktionskette (hier zwei
  // Schritte statt einem, weil Modelle UND Metadaten je ihre eigene Kachel
  // haben), dann die Kapazitäts-Entscheidung, zuletzt das neue Gebäude.
  function buildPhase3Steps() {
    var lab  = RT.state.BUILDING_TYPES.kilabor || {};
    var cost = lab.cost || 25000;

    return [
      {
        target: '.rt-resource--models',
        title:  '🧠 User-Modelle — aus Watchtime gebaut',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">⏳</span>'
          + '    <figcaption>Watchtime</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic">'
          + '    <span class="rt-tour-pic__stage"><img src="' + sprite('kilabor') + '" alt=""></span>'
          + '    <figcaption>KI-Labor</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">🧠</span>'
          + '    <figcaption>Modelle</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<p class="rt-tour-line">Genau wie die Werbeagentur ist das <b>KI-Labor</b> ein '
          + 'Konverter: du buchst eine Umwandlung, sie kostet <b>Watchtime</b> aus demselben '
          + 'Lager — nur kommt am Ende kein Geld heraus, sondern ein neues <b>User-Modell</b>.</p>'
          + '<p class="rt-tour-line">Ein fertiges Modell zieht in eine deiner <b>Serverfarmen</b> '
          + 'ein — dieselbe Weide, auf der auch deine Tiere leben.</p>'
      },
      {
        target: '.rt-resource--meta',
        title:  '🗃️ Metadaten — was die Modelle abwerfen',
        body: ''
          + '<div class="rt-tour-flow rt-tour-flow--pics">'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">'
          + '      🧠'
          + '      <b class="rt-tour-bubble rt-tour-bubble--1">🗃️</b>'
          + '      <b class="rt-tour-bubble rt-tour-bubble--2">🗃️</b>'
          + '      <b class="rt-tour-bubble rt-tour-bubble--3">🗃️</b>'
          + '    </span>'
          + '    <figcaption>Modelle</figcaption>'
          + '  </figure>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <figure class="rt-tour-pic rt-tour-pic--icon">'
          + '    <span class="rt-tour-pic__stage">🗃️</span>'
          + '    <figcaption>Metadaten</figcaption>'
          + '  </figure>'
          + '</div>'
          + '<p class="rt-tour-line">Solange ein Modell in einer Farm steht, produziert es '
          + '<b>Metadaten</b> — genauso von selbst wie deine User Watchtime produzieren. '
          + '<b>Klick auf die Farm</b> erntet ab jetzt <b>beides zusammen</b>.</p>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">📢 Targeting</span>'
          + '  <span class="rt-tour-chip">🎯 Zielgruppen-Offensive</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">🧩 KI-Features</span>'
          + '</div>'
          + '<p class="rt-tour-hint">Metadaten machen deine Werbung treffsicherer, kaufen Trend '
          + 'zurück oder schalten neue Features frei.</p>'
      },
      {
        target: '.rt-resource--server',
        title:  '⚖️ Modelle oder User — deine Kapazität entscheidet',
        body: ''
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">👥 User</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">⏳ Watchtime</span>'
          + '</div>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">🧠 Modell</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--bad">🗃️ Metadaten</span>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li>Ein Modell belegt genau <b>1 Server-Kapazität</b> — exakt wie ein User.</li>'
          + '  <li>Kapazität, die ein Modell trägt, trägt <b>keinen User</b> mehr.</li>'
          + '  <li>Es gibt keinen Deckel: <b>du</b> entscheidest, wie viel Plattform du in '
          +      'Daten umwandelst.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Wird die Kapazität knapp, hilft nur eins: mehr '
          + 'Serverfarmen — derselbe Ausbau wie bisher.</p>'
      },
      {
        target: '#shop-btn',
        title:  '🏗️ Neu im Shop: das KI-Labor',
        body: ''
          + '<div class="rt-tour-blds">'
          + bldHTML('kilabor', 'KI-Labor',
                    'wandelt <b>Watchtime in User-Modelle</b> — buchbar wie ein Werbedeal.')
          + '</div>'
          + '<p class="rt-tour-hint">Kostet ' + fmtNum(cost) + ' € im 🛒 <b>Shop</b>.</p>',
        cta: 'Ab ins Labor 🧠'
      }
    ];
  }

  // ── Watchtime-Multiplikator: eine Karte beim ersten Feature dieser Achse ──
  // Ausgelöst wird sie datengetrieben über watchtimeMult (ui.js), nicht über
  // eine Node-Liste — welche der sechs Phase-2-Nodes bzw. der Phase-3-Nodes
  // zuerst kommt, ist Sache des Spielers.
  //
  // Der Aufhänger ist der ×-Chip an der Watchtime-Kachel: er erscheint in
  // genau diesem Moment zum ersten Mal (ui.js, refs.wtMult bei wm > 1) und
  // wäre sonst eine unerklärte Zahl. Deshalb Spotlight auf die Kachel und
  // nicht auf das Gebäude, das gerade entwickelt hat.
  // Kompakte Netzwerkeffekt-Leiter für die Karten. Baut auf denselben
  // .rt-netz-Klassen auf wie die Leiter im Trend-Modal (css/game.css) —
  // gezeichnet wird sie hier trotzdem eigenständig, weil die Karte zwei
  // Leitern mit UNTERSCHIEDLICHEM k übereinander stellt und die Version im
  // Modal immer den echten Stand zeigt.
  //
  // ⚠️ Die Leitern hier hören am GIPFEL auf (peakOnly). Die Sättigungs-Sprossen
  // dahinter gehören ins Trend-Modal, nicht auf eine Karte, die vom Steigen
  // handelt: sie fallen, und die letzte zeigt in beiden Leitern 0 — über die
  // Steigung sagt sie damit nichts. Acht Sprossen wären in der Kartenbreite
  // außerdem nicht mehr lesbar (~36 px je Sprosse).
  function ladderHtml(k) {
    var rungs = RT.state.networkLadder(k, true);
    var out   = '';
    for (var i = 0; i < rungs.length; i++) {
      var r = rungs[i];
      out += '<div class="rt-netz__rung' + (r.reached ? ' is-reached' : '')
           +   (r.here ? ' is-here' : '') + '">'
           +   '<div class="rt-netz__users">' + fmtNum(r.users) + '</div>'
           +   '<div class="rt-netz__val">+' + trendStr(r.value) + '</div>'
           + '</div>';
    }
    return '<div class="rt-netz rt-netz--compact">' + out + '</div>';
  }
  function trendStr(v) { return v.toFixed(1).replace('.', ','); }

  // ── Phase-4-Tour: die Ereigniskarten ──────────────────────────────────
  // Erklärt AUSSCHLIESSLICH die Mechanik der Karten — Deck, Tisch, Krisen,
  // Chancen, Folgen. Nur ein Schritt hat ein Spotlight (der Knopf neben dem
  // Shop); alles andere sind Vollbild-Bilder, weil der Kartentisch beim
  // Erklären noch gar nicht liegt.
  //
  // ⚠️ Der erste Kartenzug wartet, solange eine Tour offen ist (events.js
  // fragt tour.isOpen()). Ohne das läge das Karten-Modal über der Tour, die
  // es gerade erklärt.
  function buildPhase4Steps() {
    var min = Math.round((RT.events ? RT.events.ROUND_SEC : 300) / 60);
    var w   = RT.events ? RT.events.firmenwert() : 0;
    // Die Beispiel-Beträge werden aus dem ECHTEN Firmenwert gerechnet. Eine
    // erfundene Zahl wäre bei „5 % von deinem Konzern" genau die falsche.
    function five(f) { return fmtMoney(Math.round(w * 0.05 * f)); }

    return [
      {
        title: '🌍 Die Welt schaut zurück',
        body: ''
          + '<div class="rt-tour-ev-ill">'
          + '  <span class="rt-tour-ev-orbit" style="left:20%;top:14%">📰</span>'
          + '  <span class="rt-tour-ev-orbit" style="right:20%;top:14%;animation-delay:.5s">⚖️</span>'
          + '  <span class="rt-tour-ev-orbit" style="left:14%;bottom:14%;animation-delay:1s">🏛️</span>'
          + '  <span class="rt-tour-ev-orbit" style="right:14%;bottom:14%;animation-delay:1.5s">🔥</span>'
          + '  <span class="rt-tour-ev-core">🌐</span>'
          + '</div>'
          + '<p class="rt-tour-line">Deine Plattform ist groß geworden. Ab hier ist sie '
          + '<b>nicht mehr nur dein Geschäft</b>.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li>Presse, Gerichte und Politik reden mit.</li>'
          + '  <li>Konkurrenten, Lobbyisten und dein eigenes Team auch.</li>'
          + '  <li>Alle <b>' + min + ' Minuten</b> musst du dich entscheiden.</li>'
          + '</ul>'
      },
      {
        target: '#rt-events-btn',
        title:  '🃏 Hier liegt dein Tisch',
        body: ''
          + '<p class="rt-tour-line">Der Knopf neben dem Shop zeigt, <b>wann die nächste '
          + 'Karte kommt</b> — und wie viele Krisen gerade offen sind.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li>Du kannst ihn <b>jederzeit</b> öffnen und nachsehen.</li>'
          + '  <li>Ist eine Runde fällig, geht der Tisch <b>von allein</b> auf.</li>'
          + '  <li>Dann schließt er erst wieder, wenn du <b>eine Karte gespielt</b> hast.</li>'
          + '</ul>'
      },
      {
        title: '🂠 Drei Karten. Du nimmst eine.',
        body: ''
          + '<div class="rt-tour-ev-ill">'
          + '  <div class="rt-tour-ev-row">'
          + '    <span class="rt-tour-ev-back"></span>'
          + '    <span class="rt-tour-ev-back is-up"></span>'
          + '    <span class="rt-tour-ev-back"></span>'
          + '  </div>'
          + '</div>'
          + '<p class="rt-tour-line">Was du <b>nicht</b> anfasst, wandert ungesehen zurück ins '
          + 'Deck — du erfährst nie, was es war.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li><b>Chance oder Krise</b> — verdeckt sieht man das nicht.</li>'
          + '  <li>Eine schlechte Karte zu ziehen ist <b>Pech, kein Fehler</b>.</li>'
          + '  <li>Gespielte Chancen kommen <b>nie wieder</b>.</li>'
          + '</ul>'
      },
      {
        title: '🎲 Jede Entscheidung legt neue Karten ins Deck',
        body: ''
          + '<div class="rt-tour-ev-ill">'
          + '  <div class="rt-tour-ev-flow">'
          + '    <span class="rt-tour-ev-mini is-chance">🎭</span>'
          + '    <span class="rt-tour-ev-arrow">➜</span>'
          + '    <span class="rt-tour-ev-stack"><i></i><i></i><i></i><b>🔥</b></span>'
          + '  </div>'
          + '</div>'
          + '<p class="rt-tour-line">Krisen kommen <b>nicht aus dem Nichts</b>. Auf jeder steht, '
          + 'wodurch sie ausgelöst wurde.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li>🎭 Der Deal mit dem Lobbyisten → <b>Shitstorm</b></li>'
          + '  <li>🤖 Kein Moderations-Team → <b>Bot-Netzwerke</b></li>'
          + '  <li>📈 Je öfter du schlecht entscheidest, desto <b>voller</b> wird dein Deck.</li>'
          + '</ul>'
      },
      {
        title: '⏳ Eine Krise, die du aussitzt, bleibt liegen',
        body: ''
          + '<div class="rt-tour-ev-ill is-bad">'
          + '  <div class="rt-tour-ev-row">'
          + '    <span class="rt-tour-ev-back"></span>'
          + '    <span class="rt-tour-ev-crisis">🔥<i>⏳ 2</i></span>'
          + '    <span class="rt-tour-ev-back"></span>'
          + '  </div>'
          + '</div>'
          + '<p class="rt-tour-line">Sie belegt einen der drei Plätze — solange sie da ist, '
          + 'ziehst du <b>eine Karte weniger</b>.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li>⭐ Ihr Malus läuft die <b>ganze Zeit</b> mit.</li>'
          + '  <li>⏳ In der Ecke steht, <b>wie lange noch</b>.</li>'
          + '  <li>⚖️ Ein Urteil wird nach der Frist vollstreckt — <b>doppelt</b>.</li>'
          + '</ul>'
      },
      {
        title: '💶 Was so etwas kostet',
        body: ''
          + '<div class="rt-tour-ev-ill">'
          + '  <div class="rt-tour-ev-bars">'
          + '    <div><b style="height:26px">5 %</b><span>klein</span><small>' + five(0.2) + '</small></div>'
          + '    <div><b style="height:56px">5 %</b><span>groß</span><small>' + five(1) + '</small></div>'
          + '    <div><b style="height:88px">5 %</b><span>riesig</span><small>' + five(5) + '</small></div>'
          + '  </div>'
          + '</div>'
          + '<p class="rt-tour-line">Strafen und Angebote hängen an der <b>Größe deines '
          + 'Konzerns</b> — nicht an einer festen Zahl.</p>'
          + '<ul class="rt-tour-list">'
          + '  <li>Auf der Karte steht immer ein <b>klarer Betrag</b>.</li>'
          + '  <li>Er wird beim Auflegen <b>eingefroren</b> und ändert sich nicht mehr.</li>'
          + '</ul>',
        cta: 'Erste Runde 🃏'
      }
    ];
  }

  // Der Netzwerkeffekt ist die einzige Trend-Quelle ohne Klick — und deshalb
  // die einzige, die man übersehen kann. Die Karte kommt, sobald er +2,0
  // überschreitet: früh genug, dass noch viel Leiter übrig ist, spät genug,
  // dass die Zahl schon etwas bedeutet.
  function buildNetworkSteps() {
    var val = RT.state.networkEffect();
    var k   = RT.state.networkK();
    return [
      {
        target: '.rt-resource--trend',
        title:  '🌐 Netzwerkeffekt +' + trendStr(val),
        body: ''
          + '<p class="rt-tour-line">Deine Plattform ist groß genug, dass sie <b>von allein</b> '
          + 'interessant wird. Leute kommen, weil schon Leute da sind.</p>'
          + ladderHtml()
          + '<ul class="rt-tour-list">'
          + '  <li>Der Wert steigt <b>ohne dein Zutun</b> — du musst nichts anklicken.</li>'
          + '  <li>Jede <b>Verzehnfachung</b> deiner User bringt <b>+' + trendStr(k) + '</b> dazu.</li>'
          + '  <li>Bei <b>1 Mrd</b> Usern ist der Gipfel — danach <b>sinkt</b> der Wert wieder, '
          +      'weil kaum noch jemand übrig bleibt, den die Plattform noch anziehen könnte.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Im HQ gibt es <b>Vertrauens-Features</b>, die diese '
          + 'Stufen größer machen. Sie geben heute wenig und später sehr viel.</p>',
        cta: 'Verstanden 🌐'
      }
    ];
  }

  // Das erste Vertrauens-Feature. Die Karte muss EINE Sache leisten: zeigen,
  // dass die Node die Leiter angehoben hat, obwohl der Trend sich kaum bewegt.
  // Zwei Leitern untereinander sagen das ohne einen einzigen Zahlenvergleich
  // im Text — oben die alte Steigung, darunter die neue, gleiche Plattform.
  // Die Sprossen stehen dabei senkrecht übereinander (css/tour.css).
  function buildWhitePatternSteps(nodeId) {
    var nodes = (RT.techtree && RT.techtree.NODES) || {};
    var def   = nodeId ? nodes[nodeId] : null;
    var name  = def ? String(def.name) : 'Dein Vertrauens-Feature';
    var kNew  = RT.state.networkK();
    var kOld  = def && def.networkK ? kNew - def.networkK : kNew;
    var late  = RT.state.networkEffect(100000000, kNew)
              - RT.state.networkEffect(100000000, kOld);

    return [
      {
        target: '.rt-resource--trend',
        title:  '🌱 ' + name,
        body: ''
          + '<p class="rt-tour-line">Das hier gibt dir <b>keinen Trend-Schub</b>. Es macht '
          + 'deinen <b>Netzwerkeffekt steiler</b> — jede Stufe deiner Plattform ist ab '
          + 'jetzt mehr wert.</p>'
          + '<div class="rt-tour-ba">'
          + '  <div class="rt-tour-ba__col">'
          + '    <div class="rt-tour-ba__cap">vorher</div>' + ladderHtml(kOld)
          + '  </div>'
          + '  <div class="rt-tour-ba__col">'
          + '    <div class="rt-tour-ba__cap rt-tour-ba__cap--good">jetzt</div>' + ladderHtml(kNew)
          + '  </div>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li>Gleiche Plattform, <b>höhere Stufen</b> — die Wirkung wächst mit dir.</li>'
          + '  <li>Bei <b>100 Mio</b> Usern wäre das <b>+' + trendStr(late) + '</b> allein '
          +      'aus diesem Feature.</li>'
          + '  <li>Es bleibt <b>dauerhaft</b> und lässt sich nicht abnutzen.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Das Gegenstück zu den <b>Dark Patterns</b>: die bringen '
          + 'sofort Watchtime und kosten dauerhaft Ruf. Das hier ist andersherum.</p>',
        cta: 'Stark 🌱'
      }
    ];
  }

  function buildWtMultSteps(nodeId) {
    var nodes = (RT.techtree && RT.techtree.NODES) || {};
    var def   = nodeId ? nodes[nodeId] : null;
    var mult  = RT.state.watchtimeMult();
    var name  = def ? String(def.name) : 'Dein neues Feature';
    var multS = mult.toFixed(2).replace('.', ',');
    // Rechenbeispiel an einer runden Zahl statt an der eigenen Produktion:
    // die schwankt im Sekundentakt, und erklärt werden soll der Faktor.
    var EX    = 1000;

    return [
      {
        target: '.rt-resource--watchtime',
        title:  '✨ ×' + multS + ' auf deine Watchtime',
        body: ''
          + '<p class="rt-tour-line"><b>' + name + '</b> hält deine User länger auf der '
          + 'Plattform. Dieselben User lassen ab jetzt <b>mehr Watchtime</b> da.</p>'
          + '<div class="rt-tour-flow">'
          + '  <span class="rt-tour-chip">⏳ ' + fmtNum(EX) + '</span>'
          + '  <span class="rt-tour-flow__arrow">×</span>'
          + '  <span class="rt-tour-chip">✨ ' + multS + '</span>'
          + '  <span class="rt-tour-flow__arrow">→</span>'
          + '  <span class="rt-tour-chip rt-tour-chip--good">⏳ '
          +      fmtNum(Math.round(EX * mult)) + '</span>'
          + '</div>'
          + '<ul class="rt-tour-list">'
          + '  <li>Gilt für <b>alle Serverfarmen</b> und greift beim <b>Ernten</b>.</li>'
          + '  <li>Anders als der Rückenwind beim <b>Trend</b> bleibt er <b>dauerhaft</b> — '
          +      'er nutzt sich nicht ab.</li>'
          + '  <li>Weitere Features dieser Art <b>multiplizieren sich</b> dazu.</li>'
          + '</ul>'
          + '<p class="rt-tour-hint">Die Zahl steht ab jetzt an der <b>Watchtime-Kachel</b>. '
          + 'Ein Klick darauf zeigt, woher sie kommt.</p>',
        cta: 'Alles klar ✨'
      }
    ];
  }

  function dotsHTML() {
    // Bei einer einzelnen Karte wäre der eine Punkt sinnlos.
    if (_steps.length < 2) return '';
    var out = '';
    for (var i = 0; i < _steps.length; i++) {
      out += '<i' + (i === _idx ? ' class="is-active"' : '') + '></i>';
    }
    return out;
  }

  function render() {
    var st   = _steps[_idx];
    var last = (_idx === _steps.length - 1);
    _refs.title.innerHTML = st.title;
    _refs.body.innerHTML  = st.body;
    _refs.dots.innerHTML  = dotsHTML();
    _refs.next.textContent = last ? (st.cta || 'Fertig') : 'Weiter →';
    _refs.next.classList.toggle('rt-tour__next--cta', last);
    _refs.card.classList.toggle('rt-tour__card--wide', !!st.wide);
    // Karte neu einblenden, damit jeder Schritt sichtbar "ankommt".
    _refs.card.classList.remove('is-in');
    // Erst messen, wenn der neue Inhalt im Layout steht.
    requestAnimationFrame(function () {
      position();
      _refs.card.classList.add('is-in');
    });
  }

  // Ohne Ziel gibt es keinen Spotlight — dann übernimmt der Klick-Fänger
  // die Abdunkelung, sonst stünde die Karte plötzlich auf hellem Grund.
  function centerCard() {
    _refs.hole.style.display  = 'none';
    _refs.arrow.style.display = 'none';
    _root.classList.add('rt-tour--nospot');
    _refs.card.classList.add('rt-tour__card--center');
    _refs.card.style.left = '';
    _refs.card.style.top  = '';
  }

  // Ziel-Rechteck eines Schritts: entweder ein Selektor oder eine Funktion,
  // die den Umriss selbst ausrechnet (z. B. alle Grid-Felder zusammen).
  function stepRect(st) {
    if (typeof st.rect === 'function') return st.rect();
    if (!st.target) return null;
    var el = document.querySelector(st.target);
    return el ? el.getBoundingClientRect() : null;
  }

  function position() {
    if (!_root) return;
    var st = _steps[_idx];
    var r  = stepRect(st);

    // Kein Ziel (fehlendes Element, Kachel noch ausgeblendet) → Karte
    // zentriert ohne Spotlight. Die Tour darf daran nie hängen bleiben.
    if (!r || r.width < 2 || r.height < 2) { centerCard(); return; }

    _refs.card.classList.remove('rt-tour__card--center');
    _root.classList.remove('rt-tour--nospot');

    var vw = window.innerWidth;
    var vh = window.innerHeight;

    _refs.hole.style.display = '';
    _refs.hole.style.left    = (r.left - PAD) + 'px';
    _refs.hole.style.top     = (r.top  - PAD) + 'px';
    _refs.hole.style.width   = (r.width  + PAD * 2) + 'px';
    _refs.hole.style.height  = (r.height + PAD * 2) + 'px';

    var cw = _refs.card.offsetWidth;
    var ch = _refs.card.offsetHeight;
    var cx = r.left + r.width / 2;

    var left = Math.max(12, Math.min(vw - cw - 12, cx - cw / 2));
    var top  = r.bottom + PAD + ARROW_GAP;
    // Passt sie unten nicht mehr hin, so weit hoch wie nötig — dann
    // überlappt sie eventuell das Ziel, und der Pfeil entfällt.
    if (top + ch > vh - 12) top = Math.max(12, vh - ch - 12);
    // Große Ziele (Grid, Ressourcen-Bar) füllen den halben Bildschirm; dort
    // sieht die Karte am unteren Rand verloren aus. Sie rückt dann in die
    // Mitte des Ziels — der Spotlight bleibt, nur der Pfeil entfällt.
    if (st.inside) {
      top = Math.max(12, Math.min(vh - ch - 12, r.top + r.height / 2 - ch / 2));
    }

    _refs.card.style.left = left + 'px';
    _refs.card.style.top  = top  + 'px';

    var arrowFits = top > r.bottom + PAD + 8;
    _refs.arrow.style.display = arrowFits ? '' : 'none';
    _refs.arrow.style.left    = cx + 'px';
    _refs.arrow.style.top     = (r.bottom + PAD) + 'px';
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { finish(); }
    else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); next(); }
  }

  function next() {
    if (_idx < _steps.length - 1) { _idx++; render(); }
    else finish();
  }

  function finish() {
    if (!_open) return;
    _open = false;
    window.removeEventListener('resize', position);
    window.removeEventListener('keydown', onKey);
    if (_root && _root.parentNode) _root.parentNode.removeChild(_root);
    _root = null;
    _refs = {};
    // Erst hier gesetzt, nicht beim Öffnen: wer mitten in der Tour neu
    // lädt, soll sie nochmal bekommen. Gegen Doppelstarts schützt _open.
    RT.state.current[TOURS[_id].flag] = true;
    RT.bus.emit('state:changed');
  }

  // ctx ist optional und geht unverändert an den Aufbau der Tour. Bisher
  // braucht ihn nur 'wtmult' (die auslösende Node-ID) — die übrigen Touren
  // ziehen alles aus dem State und ignorieren ihn.
  function start(id, ctx) {
    if (_open) return;
    id = TOURS[id] ? id : forPhase();
    _open  = true;
    _id    = id;
    _idx   = 0;
    _steps = TOURS[id].build(ctx);

    _root = document.createElement('div');
    _root.className = 'rt-tour';
    _root.innerHTML = ''
      + '<div class="rt-tour__block"></div>'
      + '<div class="rt-tour__hole"></div>'
      + '<div class="rt-tour__arrow"></div>'
      + '<div class="rt-tour__card">'
      + '  <button class="rt-tour__skip" type="button" aria-label="Überspringen">✕</button>'
      + '  <div class="rt-tour__title"></div>'
      + '  <div class="rt-tour__body"></div>'
      + '  <div class="rt-tour__foot">'
      + '    <span class="rt-tour__dots"></span>'
      + '    <button class="rt-tour__next" type="button"></button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(_root);

    _refs = {
      hole:  _root.querySelector('.rt-tour__hole'),
      arrow: _root.querySelector('.rt-tour__arrow'),
      card:  _root.querySelector('.rt-tour__card'),
      title: _root.querySelector('.rt-tour__title'),
      body:  _root.querySelector('.rt-tour__body'),
      dots:  _root.querySelector('.rt-tour__dots'),
      next:  _root.querySelector('.rt-tour__next')
    };

    _refs.next.addEventListener('click', next);
    _root.querySelector('.rt-tour__skip').addEventListener('click', finish);
    window.addEventListener('resize', position);
    window.addEventListener('keydown', onKey);

    render();
  }

  function startIfNew(id, ctx) {
    id = TOURS[id] ? id : forPhase();
    if (!RT.state.current[TOURS[id].flag]) start(id, ctx);
  }

  // isOpen wird von js/events.js gebraucht: der Kartentisch darf nicht
  // aufgehen, während eine Tour läuft — er läge sonst über der Erklärung,
  // die ihn gerade beschreibt.
  RT.tour = { start: start, startIfNew: startIfNew, forPhase: forPhase,
              isOpen: function () { return _open; } };
})(window.RT3);
