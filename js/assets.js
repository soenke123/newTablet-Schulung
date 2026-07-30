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

  var LOGOS = {
    bell:    { file: 'Logo1.png', label: 'Glocke',  defaultName: 'RingRing'   },
    connect: { file: 'Logo2.png', label: 'Connect', defaultName: 'Space'      },
    rocket:  { file: 'Logo3.png', label: 'Rakete',  defaultName: 'ToTheMoon'  },
    graph:   { file: 'Logo4.png', label: 'Graph',   defaultName: 'The River'  },
    trend:   { file: 'Logo5.png', label: 'Trend',   defaultName: 'Trendr'     },
    chat:    { file: 'Logo6.png', label: 'Plausch', defaultName: 'Großepause' },
    like:    { file: 'Logo7.png', label: 'Like',    defaultName: 'Liky'       },
    mesh:    { file: 'Logo8.png', label: 'Netz',    defaultName: 'Nexus'      }
  };

  var AVATAR_ORDER = ['fuchs', 'otter', 'waschbaer', 'eichhoernchen'];
  var LOGO_ORDER   = ['bell', 'connect', 'rocket', 'graph', 'trend', 'chat', 'like', 'mesh'];

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

  function logoSrc(id) {
    var l = LOGOS[id];
    if (!l) return '';
    return 'sprites/Firmen%20logos/' + encodeURI(l.file);
  }

  RT.assets = {
    AVATARS:    AVATARS,
    LOGOS:      LOGOS,
    avatarList: avatarList,
    logoList:   logoList,
    avatarSrc:  avatarSrc,
    logoSrc:    logoSrc
  };
})(window.RT3);
