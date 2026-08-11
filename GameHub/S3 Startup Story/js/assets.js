/* Zentrales Asset-Verzeichnis für Onboarding (Avatare + Logos).
   v3 ist autonom: alle Sprites liegen unter v3/sprites/.
   Screens fragen Pfade über RT3.assets.avatarSrc(id, 'body'|'head') bzw.
   RT3.assets.logoSrc(id) ab. */
(function (RT) {
  'use strict';

  var AVATARS = {
    fuchs:         { body: 'Fuch.png',         head: 'FuchsHead.png',         label: 'Fuchs',        defaultName: 'Felix'  },
    otter:         { body: 'Otter.png',        head: 'OtterHead.png',         label: 'Otter',        defaultName: 'Moana'  },
    waschbaer:     { body: 'Waschbär.png',     head: 'WaschbärHead.png',      label: 'Waschbär',     defaultName: 'Katara' },
    eichhoernchen: { body: 'Eichhörnchen.png', head: 'EichhörnchenHead.png',  label: 'Eichhörnchen', defaultName: 'Hazel'  }
  };

  // fileNice = aufgeräumte Profi-Variante desselben Motivs. Wird durch den
  // Techtree-Node 'logoNeu' (Logo Redesign) freigeschaltet und ersetzt danach
  // überall im Spiel das gemalte Original.
  var LOGOS = {
    bell:    { file: 'Logo1.png', fileNice: 'Logo1nice.png', label: 'Glocke',  defaultName: 'RingRing'   },
    connect: { file: 'Logo2.png', fileNice: 'Logo2nice.png', label: 'Connect', defaultName: 'Space'      },
    rocket:  { file: 'Logo3.png', fileNice: 'Logo3nice.png', label: 'Rakete',  defaultName: 'ToTheMoon'  },
    graph:   { file: 'Logo4.png', fileNice: 'Logo4nice.png', label: 'Graph',   defaultName: 'The River'  },
    trend:   { file: 'Logo5.png', fileNice: 'Logo5nice.png', label: 'Trend',   defaultName: 'Trendr'     },
    chat:    { file: 'Logo6.png', fileNice: 'Logo6nice.png', label: 'Plausch', defaultName: 'Großepause' },
    like:    { file: 'Logo7.png', fileNice: 'Logo7nice.png', label: 'Like',    defaultName: 'Liky'       },
    mesh:    { file: 'Logo8.png', fileNice: 'Logo8nice.png', label: 'Netz',    defaultName: 'Nexus'      }
  };

  var AVATAR_ORDER = ['fuchs', 'otter', 'waschbaer', 'eichhoernchen'];
  var LOGO_ORDER   = ['bell', 'connect', 'rocket', 'graph', 'trend', 'chat', 'like', 'mesh'];

  // Kleine System-Icons, die im Fließtext/auf Buttons ein Emoji ersetzen —
  // anders als AVATARS/LOGOS gibt es hier keine Varianten, nur einen Pfad.
  var ICONS = {
    stromWasser: 'sprites/StromWasserIcon.png' // ersetzt 🔌 im Serverkosten-System
  };

  function iconSrc(id) {
    return ICONS[id] || '';
  }

  // Fertiges <img>-Tag, mit der gemeinsamen Größenklasse (css: .rt-icon-sw).
  // Nur dort einsetzbar, wo das Ziel innerHTML rendert (Button-Text via
  // textContent bleibt Emoji, sonst zeigt sich das Tag als Literal-Text).
  function iconHtml(id, cls) {
    var src = iconSrc(id);
    if (!src) return '';
    return '<img class="rt-icon-sw' + (cls ? ' ' + cls : '') + '" src="' + src + '" alt="">';
  }

  function avatarList() {
    return AVATAR_ORDER.map(function (id) {
      return { id: id, label: AVATARS[id].label };
    });
  }

  function logoList() {
    return LOGO_ORDER.map(function (id) {
      return { id: id, label: LOGOS[id].label };
    });
  }

  function avatarSrc(id, kind) {
    var a = AVATARS[id];
    if (!a) return '';
    var file = (kind === 'head') ? a.head : a.body;
    return 'sprites/avatare/' + encodeURI(file);
  }

  // variant: 'nice' erzwingt die Profi-Variante, 'original' das gemalte Logo
  // (für die Vorher-Nachher-Gegenüberstellung). Ohne Angabe entscheidet der
  // Spielstand: ist 'logoNeu' erforscht, kommt automatisch das neue Logo.
  // Dadurch muss keine Aufrufstelle wissen, ob das Redesign schon durch ist.
  function logoSrc(id, variant) {
    var l = LOGOS[id];
    if (!l) return '';
    var nice = (variant === 'nice')
      || (variant === undefined && RT.state && RT.state.logoUpgraded && RT.state.logoUpgraded());
    var file = (nice && l.fileNice) ? l.fileNice : l.file;
    return 'sprites/Firmen%20logos/' + encodeURI(file);
  }

  RT.assets = {
    AVATARS:    AVATARS,
    LOGOS:      LOGOS,
    avatarList: avatarList,
    logoList:   logoList,
    avatarSrc:  avatarSrc,
    logoSrc:    logoSrc,
    iconSrc:    iconSrc,
    iconHtml:   iconHtml
  };
})(window.RT3);
