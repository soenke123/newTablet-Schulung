/* Zentrales Asset-Verzeichnis. Spiegelt die Dateien in sprites/ wider –
   ein einziger Ort, an dem Datei-, Label- und ID-Zuordnungen leben.
   Screens fragen Pfade über RT.assets.avatarSrc(id, 'body'|'head') bzw.
   RT.assets.logoSrc(id) ab. */
(function (RT) {
  'use strict';

  // body = volle Figur, head = rundes Profil-Foto. label = Anzeige-Name.
  var AVATARS = {
    fuchs:         { body: 'Fuch.png',         head: 'FuchsHead.png',         label: 'Fuchs',        defaultName: 'Felix'  },
    otter:         { body: 'Otter.png',        head: 'OtterHead.png',         label: 'Otter',        defaultName: 'Moana'  },
    waschbaer:     { body: 'Waschbär.png',     head: 'WaschbärHead.png',      label: 'Waschbär',     defaultName: 'Katara' },
    eichhoernchen: { body: 'Eichhörnchen.png', head: 'EichhörnchenHead.png',  label: 'Eichhörnchen', defaultName: 'Hazel'  }
  };

  var LOGOS = {
    bell:    { file: 'Logo1.png', niceFile: 'Logo1nice.png', label: 'Glocke',  defaultName: 'RingRing'   },
    connect: { file: 'Logo2.png', niceFile: 'Logo2nice.png', label: 'Connect', defaultName: 'Space'      },
    rocket:  { file: 'Logo3.png', niceFile: 'Logo3nice.png', label: 'Rakete',  defaultName: 'ToTheMoon'  },
    graph:   { file: 'Logo4.png', niceFile: 'Logo4nice.png', label: 'Graph',   defaultName: 'The River'  },
    trend:   { file: 'Logo5.png', niceFile: 'Logo5nice.png', label: 'Trend',   defaultName: 'Trendr'     },
    chat:    { file: 'Logo6.png', niceFile: 'Logo6nice.png', label: 'Plausch', defaultName: 'Großepause' },
    like:    { file: 'Logo7.png', niceFile: 'Logo7nice.png', label: 'Like',    defaultName: 'Liky'       },
    mesh:    { file: 'Logo8.png', niceFile: 'Logo8nice.png', label: 'Netz',    defaultName: 'Nexus'      }
  };

  // Iter-Helfer für die Screens, damit die Reihenfolge der Auswahl-Grids
  // hier zentral festgelegt wird.
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

  // Wie logoSrc, gibt aber die "nice"-Variante zurück wenn logoNeu erforscht ist.
  function logoSrcAuto(id) {
    var l = LOGOS[id];
    if (!l) return '';
    var nice = window.RT && RT.state && (RT.state.get().techtree || {}).logoNeu === 'done';
    var file = (nice && l.niceFile) ? l.niceFile : l.file;
    return 'sprites/Firmen%20logos/' + encodeURI(file);
  }

  // Gebäude-Sprites unter sprites/buildings/. Suffix '0' = Ausgangsstufe.
  // Spätere Upgrades sollten als HeadQuarter1.png, …2.png etc. folgen.
  var BUILDINGS = {
    headquarter:     { stages: ['HeadQuarter0.png', 'HeadQuarter1.png', 'HeadQuarter2.png'], label: 'Hauptquartier' },
    buero:           { stages: ['Büro.png'],              label: 'Bürogebäude'      },
    serverfarm:      { stages: ['Serverfarm.png'],         label: 'Kleine Serverfarm' },
    marketingstudio: { stages: ['MarketingArgentur.png'],  label: 'Marketing-Studio' },
    werbeagentur:    { stages: ['AdStudio.png'],           label: 'Werbeagentur'     },
    creatorstudio:   { stages: ['CreatorStutio.png'],      label: 'Creator-Studio'   },
    communitycenter: { stages: ['CommunityCenter.png'],    label: 'Community Center' },
    kilabor:         { stages: ['KILabor.png'],            label: 'KI-Labor'         },
  };

  function buildingSrc(id, stage) {
    var b = BUILDINGS[id];
    if (!b) return '';
    var idx = Math.min(stage || 0, b.stages.length - 1);
    return 'sprites/buildings/' + encodeURI(b.stages[idx]);
  }

  RT.assets = {
    AVATARS:     AVATARS,
    LOGOS:       LOGOS,
    BUILDINGS:   BUILDINGS,
    avatarList:  avatarList,
    logoList:    logoList,
    avatarSrc:   avatarSrc,
    logoSrc:     logoSrc,
    logoSrcAuto: logoSrcAuto,
    buildingSrc: buildingSrc
  };
})(window.RT);
