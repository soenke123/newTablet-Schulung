/* In-Game Tech Tree — öffnet sich per RT.techtree.open().
   Tabs: Entwicklung (Phase 0 Hauptbaum) | Marketing | Werbung (ab goLiveUnlocked).
   Node-Daten spiegeln techtree.html wider — immer dort nachschlagen!
   Nodes mit months:0 sind Sofort-Aktionen (kein Forschungs-Timer).
   Nodes mit usersBonus geben einmaligen User-Bonus bei Aktivierung/Fertigstellung. */
(function (RT) {
  'use strict';

  // ── SVG-Icons via Feather Icons ──────────────────────────────────────────
  function ico(name, opts) {
    var f = window.feather && feather.icons[name];
    return f ? f.toSvg(opts || {}) : '';
  }

  var ICO = {
    monitor:   ico('monitor'),
    server:    ico('server'),
    user:      ico('user'),
    list:      ico('list'),
    image:     ico('image'),
    lock:      ico('lock'),
    check:     ico('check', { 'stroke-width': 2.5 }),
    users:     ico('users'),
    fileText:  ico('file-text'),
    briefcase:  ico('briefcase'),
    smartphone: ico('smartphone'),
    thumbsUp:   ico('thumbs-up'),
    msgCircle:  ico('message-circle'),
    share:       ico('share-2'),
    calendar:    ico('calendar'),
    zap:         ico('zap'),
    trendingUp:  ico('trending-up'),
    award:       ico('award'),
    mail:        ico('mail'),
    usersPlus:   ico('users'),
    search:      ico('search'),
    video:       ico('video'),
    bell:        ico('bell'),
    circle:      ico('circle'),
    playCircle:  ico('play-circle')
  };

  // ── Phase-0-Nodes: Hauptbaum / Entwicklung ───────────────────────────────
  // Quelle: techtree.html → hauptbaum → phase:0
  var DEV_NODES = [
    // ── Phase 0 ──────────────────────────────────────────────────────────────
    {
      id: 'frontend1', tab: 'entwicklung',
      name: 'Frontend v1', icon: ICO.monitor,
      phase: 0, workers: 1, months: 1, server: 400, cost: 0,
      effect: 'Basis-Infrastruktur. Voraussetzung für Account-System.',
      effectFull: 'Du baust die visuelle Seite der Plattform. User können sie im Browser aufrufen. Voraussetzung für alle weiteren Features.',
      requires: [], requiresPurchase: ['rechner']
    },
    {
      id: 'backend1', tab: 'entwicklung',
      name: 'Backend v1', icon: ICO.server,
      phase: 0, workers: 1, months: 1, server: 400, cost: 0,
      effect: 'Basis-Infrastruktur. Ermöglicht Datenspeicherung.',
      effectFull: 'Die unsichtbare Seite der Plattform: Server-Logik, Datenbank, API. Ohne Backend keine User-Daten.',
      requires: [], requiresPurchase: ['server1']
    },
    // ── Phase 1 ──────────────────────────────────────────────────────────────
    {
      id: 'frontend2', tab: 'entwicklung',
      name: 'Frontend v2 (Mobile)', icon: ICO.smartphone,
      phase: 1, workers: 1, months: 2, server: 400, cost: 0,
      effect: 'Plattform läuft auf Smartphones. Ruf +1 %.',
      effectFull: 'Die Plattform bekommt eine mobile Ansicht für Smartphones. User bleiben länger und kommen häufiger zurück.',
      rufBonus: 0.01,
      requires: ['frontend1'], requiresPurchase: []
    },
    // ── Phase 0 (fortgesetzt) ─────────────────────────────────────────────────
    {
      id: 'account', tab: 'entwicklung',
      name: 'Account-System', icon: ICO.user,
      phase: 0, workers: 1, months: 0.5, server: 200, cost: 0,
      effect: 'Voraussetzung für Feed, Bilder, DM & alle Nutzer-Features.',
      effectFull: 'User können Konten erstellen, sich einloggen und Profile anlegen. Voraussetzung für Feed, Bilder und alle User-Features.',
      requires: ['frontend1', 'backend1'], requiresPurchase: []
    },
    {
      id: 'backend2', tab: 'entwicklung',
      name: 'Backend v2 (Skalierbar)', icon: ICO.server,
      phase: 1, workers: 1, months: 3, server: 600, cost: 300,
      effect: 'Plattform trägt mehr Last. Voraussetzung für DM, Gruppen und weitere Features. Ruf +0.5 %.',
      effectFull: 'Die Serverlogik wird neu aufgestellt und kann deutlich mehr Traffic verarbeiten. Stabiler Betrieb stärkt das Vertrauen.',
      rufBonus: 0.005,
      requires: ['backend1'], requiresPurchase: []
    },
    {
      id: 'metadaten', tab: 'entwicklung',
      name: 'Metadatenspeicherung', icon: ICO.server,
      phase: 2, workers: 3, months: 5, server: 0, cost: 0,
      effect: 'Jeder User belegt ab Aktivierung 2 statt 1 Servereinheit.',
      effectFull: 'Deine Plattform speichert Aktivitäts-, Präferenz- und Verbindungsdaten pro User. Das verdoppelt den Serverbedarf. Vor der Aktivierung wird geprüft, ob genug Kapazität vorhanden ist.',
      requires: ['backend2'], requiresPurchase: []
    },
    {
      id: 'feed', tab: 'entwicklung',
      name: 'News-Feed', icon: ICO.list,
      phase: 0, workers: 1, months: 0.25, server: 200, cost: 0,
      effect: 'Nutzer sehen Inhalte. Voraussetzung für Like, Kommentar, Teilen & Werbung.',
      effectFull: 'Chronologischer Feed: User können posten und Beiträge anderer sehen. Voraussetzung für Like, Kommentar, Teilen und erste Werbung.',
      requires: ['account'], requiresPurchase: []
    },
    {
      id: 'bilder', tab: 'entwicklung',
      name: 'Bilder hochladen', icon: ICO.image,
      phase: 0, workers: 1, months: 0.25, server: 200, cost: 0,
      effect: 'Erhöht Posting-Frequenz und Engagement. Voraussetzung für Videos.',
      effectFull: 'User können Fotos zu Beiträgen hinzufügen. Erhöht die Posting-Häufigkeit und Verweildauer. Voraussetzung für Videos.',
      requires: ['account'], requiresPurchase: []
    },
    {
      id: 'like', tab: 'entwicklung',
      name: 'Like-Funktion', icon: ICO.thumbsUp,
      phase: 1, workers: 1, months: 1, server: 200, cost: 0,
      effect: 'Soziale Bestätigung. Hält Nutzer aktiv. Ruf +1.5 %.',
      effectFull: 'Nutzer können Beiträge liken. Soziale Bestätigung motiviert zum Posten und sorgt für mehr Weiterempfehlungen.',
      rufBonus: 0.015,
      requires: ['feed'], requiresPurchase: []
    },
    {
      id: 'kommentar', tab: 'entwicklung',
      name: 'Kommentare', icon: ICO.msgCircle,
      phase: 1, workers: 1, months: 1, server: 200, cost: 0,
      effect: 'Nutzer treten in Dialog. Erhöht Verweildauer. Ruf +2 %.',
      effectFull: 'Nutzer können unter Beiträge kommentieren. Das fördert den Dialog und erhöht die Verweildauer.',
      rufBonus: 0.02,
      requires: ['feed'], requiresPurchase: []
    },
    {
      id: 'teilen', tab: 'entwicklung',
      name: 'Teilen-Funktion', icon: ICO.share,
      phase: 1, workers: 1, months: 1, server: 200, cost: 0,
      effect: 'Posts verbreiten sich organisch. Günstiges Nutzer-Wachstum. Ruf +2.5 %.',
      effectFull: 'Nutzer können Beiträge teilen und so die Plattform bekannt machen. Geteilte Posts bringen neue User ohne Werbekosten.',
      rufBonus: 0.025,
      requires: ['feed'], requiresPurchase: []
    },
    {
      id: 'logoNeu', tab: 'entwicklung',
      name: 'Logo Redesign', icon: ICO.award,
      phase: 1, workers: 1, months: 1, server: 600, cost: 500,
      effect: 'Professionelleres Logo. Ruf +1 %.',
      effectFull: 'Dein Team designt ein neues, professionelleres Logo. Das Firmen-Logo wird im gesamten Spiel durch die aufgewertete Variante ersetzt.',
      rufBonus: 0.01,
      requires: ['frontend2'], requiresPurchase: []
    },
    {
      id: 'dm', tab: 'entwicklung',
      name: 'Direktnachrichten', icon: ICO.mail,
      phase: 1, workers: 2, months: 4, server: 2000, cost: 0,
      effect: 'Private Kommunikation erhöht Nutzerbindung stark. Ruf +3 %.',
      effectFull: 'Nutzer können sich gegenseitig private Nachrichten schicken. Stärkt Beziehungen auf der Plattform und erhöht die Nutzerbindung deutlich.',
      rufBonus: 0.03,
      requires: ['backend2'], requiresPurchase: []
    },
    {
      id: 'gruppen', tab: 'entwicklung',
      name: 'Gruppen', icon: ICO.users,
      phase: 1, workers: 1, months: 3, server: 1200, cost: 0,
      effect: 'Community-Bildung. Ruf +2 %.',
      effectFull: 'Nutzer können eigene Gruppen gründen und Gleichgesinnte finden. Communities erhöhen die Verweildauer stark.',
      rufBonus: 0.02,
      requires: ['backend2'], requiresPurchase: []
    },
    {
      id: 'suche', tab: 'entwicklung',
      name: 'Suchfunktion', icon: ICO.search,
      phase: 1, workers: 1, months: 2, server: 400, cost: 0,
      effect: 'Nutzer können Inhalte und Personen finden. Ruf +0.5 %.',
      effectFull: 'Eine Suchleiste für Inhalte, Profile und Gruppen. Macht die Plattform deutlich benutzerfreundlicher.',
      rufBonus: 0.005,
      unlocks: 'Werbung: Search-Ad-System',
      requires: ['backend2'], requiresPurchase: []
    },
    {
      id: 'videos', tab: 'entwicklung',
      name: 'Videos hochladen', icon: ICO.video,
      phase: 1, workers: 3, months: 6, server: 6000, cost: 0,
      effect: 'Stärkster Ruf-Booster. Ruf +6 %.',
      effectFull: 'Nutzer können Videos hochladen und ansehen. Video-Content hält User viel länger auf der Plattform — der größte Engagement-Treiber.',
      rufBonus: 0.06,
      unlocks: 'Werbung: Video-Ad-Integration',
      requires: ['backend2'], requiresPurchase: []
    },
    // ── Phase 2 ──────────────────────────────────────────────────────────────
    {
      id: 'feedback_system', tab: 'entwicklung',
      name: 'Feedback-System', icon: ICO.msgCircle,
      phase: 2, workers: 2, months: 3, server: 5000, cost: 20000,
      effect: 'User können Bugs und Verbesserungen melden. Ruf +0,5 %. Freischaltet: User-Support-Programm.',
      effectFull: 'User können direkt in der App Fehler melden und Verbesserungen vorschlagen. Das stärkt das Vertrauen in deine Plattform. Freischaltet das User-Support-Programm im Community Center.',
      rufBonus: 0.005,
      unlocks: 'Community Center: User-Support-Programm',
      requires: ['dm'], requiresPurchase: [], requiresBuilding: 'communitycenter'
    },
    {
      id: 'pr_abteilung', tab: 'entwicklung',
      name: 'PR-Abteilung', icon: ICO.trendingUp,
      phase: 2, workers: 3, months: 4, server: 0, cost: 30000,
      effect: 'Professionelle Öffentlichkeitsarbeit. Ruf +0,5 %. Freischaltet: Community Event + Image-Kampagne.',
      effectFull: 'Du stellst ein professionelles Team für Öffentlichkeitsarbeit ein. Sie kommunizieren Erfolge nach außen und managen das Markenimage. Freischaltet Community Event und Image-Kampagne im Community Center.',
      rufBonus: 0.005,
      unlocks: 'Community Center: Community Event, Image-Kampagne',
      requires: [], requiresPurchase: [], requiresBuilding: 'communitycenter'
    },
    // ── Phase 2: Watchtime-Features ──────────────────────────────────────────
    {
      id: 'infiniteScroll', tab: 'entwicklung',
      name: 'Infiniter Scroll', icon: ICO.list,
      phase: 2, workers: 2, months: 2, server: 2000, cost: 5000,
      effect: 'Feed hört nicht mehr auf. User scrollen automatisch weiter. Watchtime +0,3 Std./Tag. Ruf sinkt leicht.',
      effectFull: 'Der Feed lädt automatisch nach — es gibt kein Ende mehr. User verlieren das Zeitgefühl und scrollen deutlich länger. Das ist das erste "Dark Pattern": Deine Plattform erhöht die Watchtime bewusst auf Kosten des Rufs.',
      rufBonus: -0.015,
      watchtimeBonus: 0.3,
      requires: ['feed', 'metadaten'], requiresPurchase: []
    },
    {
      id: 'pushNotifications', tab: 'entwicklung',
      name: 'Push-Benachrichtigungen', icon: ICO.bell,
      phase: 2, workers: 2, months: 4, server: 3000, cost: 15000,
      effect: 'Benachrichtigungen zu Likes und DMs. Holt User zurück. Watchtime +0,1 Std./Tag.',
      effectFull: 'User erhalten Push-Nachrichten wenn jemand ihren Post liked oder ihnen schreibt. Das holt sie häufiger auf die Plattform zurück und erhöht die Session-Häufigkeit. Die meisten User schätzen das Update zu ihren Inhalten.',
      rufBonus: 0.005,
      watchtimeBonus: 0.1,
      requires: ['like', 'dm', 'metadaten'], requiresPurchase: []
    },
    {
      id: 'stories', tab: 'entwicklung',
      name: 'Stories', icon: ICO.circle,
      phase: 2, workers: 2, months: 6, server: 10000, cost: 20000,
      effect: 'Kurzvideos mit 24h-Ablauf. Tägliche Rückkehr. Watchtime +0,2 Std./Tag. Voraussetzung für Autoplay.',
      effectFull: 'User können 24-Stunden-Kurzvideos posten. Da Inhalte ablaufen, kommen Nutzer jeden Tag zurück — sie wollen nichts verpassen. Stories schaffen ein Gefühl von Verpasstem ("FOMO") und erhöhen die Nutzungsfrequenz stark.',
      rufBonus: 0.01,
      watchtimeBonus: 0.2,
      unlocks: 'Hauptbaum: Autoplay',
      requires: ['videos', 'metadaten'], requiresPurchase: []
    },
    {
      id: 'autoplay', tab: 'entwicklung',
      name: 'Autoplay', icon: ICO.playCircle,
      phase: 2, workers: 1, months: 3, server: 2000, cost: 2000,
      effect: 'Nächste Story startet automatisch. Stärkster Watchtime-Booster. Ruf sinkt deutlich.',
      effectFull: 'Nach einer Story startet die nächste ohne Klick. User können nicht mehr aktiv aufhören — das ist das stärkste Dark Pattern. Viele merken: "Ich wollte eigentlich schon längst aufhören." Die Watchtime steigt stark, der Ruf sinkt.',
      rufBonus: -0.02,
      watchtimeBonus: 0.3,
      requires: ['stories'], requiresPurchase: []
    },
    {
      id: 'liveStreaming', tab: 'entwicklung',
      name: 'Live-Streaming', icon: ICO.video,
      phase: 2, workers: 3, months: 6, server: 20000, cost: 40000,
      effect: 'Echtzeit-Streams. Höchstes Engagement. Watchtime +0,4 Std./Tag. Ruf +2 %.',
      effectFull: 'User können live streamen. Zuschauer kommentieren in Echtzeit und schicken Reaktionen. Live-Events ziehen viele User gleichzeitig auf die Plattform und halten sie stundenlang — das teuerste aber ruf-freundlichste Watchtime-Feature.',
      rufBonus: 0.02,
      watchtimeBonus: 0.4,
      requires: ['videos', 'metadaten'], requiresPurchase: []
    }
  ];

  // ── Phase-0-Nodes: Marketing ─────────────────────────────────────────────
  // Quelle: techtree.html → marketing → phase:0
  // months:0 = Sofort-Aktivierung, workers:0 = kein Worker-Slot nötig.
  // usersBonus: einmalig bei Aktivierung (kein dauerhafter Boost).
  var MARKETING_NODES = [
    {
      id: 'mk_freunde', tab: 'marketing',
      name: 'Freunden erzählen', icon: ICO.users,
      phase: 0, workers: 0, months: 0.25, server: 0, cost: 0,
      usersBonus: 200,
      effect: '+200 User (einmalig)',
      effectFull: 'Du stellst dein Startup Freunden und Bekannten vor. Sie melden sich an und empfehlen die Plattform weiter.',
      requires: [], requiresPurchase: [], requiresGoLive: true
    },
    {
      id: 'mk_flyer', tab: 'marketing',
      name: 'Flyer verteilen', icon: ICO.fileText,
      phase: 0, workers: 0, months: 0.25, server: 0, cost: 20,
      usersBonus: 500,
      growthBonus: 0.15,
      effect: '+500 User (einmalig) · +15 %/Mon. Wachstum bis Ende Garage-Phase · kostet €20',
      effectFull: 'Du lässt Flyer drucken und verteilst sie in der Stadt. Der Hype hält an: +15 % Nutzer-Wachstum pro Monat — dieser Nachhall läuft nur in der Garage-Phase und endet automatisch beim Übergang in die Campus-Phase.',
      requires: [], requiresPurchase: [], requiresGoLive: true
    },
    {
      id: 'mk_langzeit', tab: 'marketing',
      name: 'Langzeit-Kampagnen', icon: ICO.calendar,
      phase: 1, workers: 1, months: 1, server: 0, cost: 0,
      unlocks: 'Marketing-Kampagnen: Partnerschafts-Programm, Empfehlungs-Welle',
      effect: 'Schaltet 2 Kampagnen frei: Partnerschafts-Programm und Empfehlungs-Welle.',
      effectFull: 'Dein Team entwickelt Strategien für langfristige Marketingkampagnen.',
      requires: ['mk_freunde'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    },
    {
      id: 'mk_sprint', tab: 'marketing',
      name: 'Sprint-Kampagnen', icon: ICO.zap,
      phase: 1, workers: 1, months: 1, server: 0, cost: 0,
      unlocks: 'Marketing-Kampagnen: Kampagnen-Sprint, Hype-Burst',
      effect: 'Schaltet 2 Kampagnen frei: Kampagnen-Sprint und Hype-Burst.',
      effectFull: 'Dein Team plant kurze, intensive Marketingaktionen mit hoher Reichweite.',
      requires: ['mk_flyer'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    },
    {
      id: 'mk_nachhall', tab: 'marketing',
      name: 'Langzeit-Kooperation', icon: ICO.trendingUp,
      phase: 1, workers: 2, months: 2, server: 0, cost: 0,
      unlocks: 'Marketing-Kampagne: Langzeit-Kooperation',
      effect: 'Schaltet Langzeit-Kooperation frei: 15 Mon +2%/Mon, dann 12 Mon +1% Nachhall.',
      effectFull: 'Dein Team entwickelt eine komplexe Kooperationsstrategie mit externen Partnern.',
      requires: ['mk_langzeit', 'mk_sprint'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    },
    {
      id: 'mk_eu', tab: 'marketing',
      name: 'EU-Expansion', icon: '🇪🇺',
      phase: 2, workers: 2, months: 3, server: 0, cost: 50000,
      marketExpansion: 'eu',
      effect: 'Öffnet EU-Märkte — +400 Mio. erreichbar. Sättigung sinkt, Kampagnen werden teurer.',
      effectFull: 'Dein Team baut internationale Marketing-Strukturen auf. Kampagnen erreichen jetzt bis zu 440 Mio. Menschen in Europa. Der Markt wächst — <strong>die Marktsättigung sinkt</strong> und bisherige Kampagnen werden wieder wirksamer.',
      tradeoffNote: '⚠️ Achtung: Internationale Kampagnen sind teurer als lokale. 💡 Tipp: Diese Expansion lohnt sich erst ab ca. 50 % Marktsättigung — vorher fressen die Mehrkosten den Vorteil des größeren Markts auf.',
      requires: ['mk_nachhall'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    },
    {
      id: 'mk_americas', tab: 'marketing',
      name: 'Amerika & Afrika', icon: '🌎',
      phase: 2, workers: 2, months: 4, server: 0, cost: 200000,
      marketExpansion: 'americas',
      effect: 'Amerika & Afrika — +1,6 Mrd. erreichbar. Sättigung sinkt, Kampagnen werden deutlich teurer.',
      effectFull: 'Deine Plattform geht in englischsprachigen amerikanischen und afrikanischen Märkten online. Über Kampagnen sind jetzt rund 2 Mrd. Menschen erreichbar. <strong>Die Marktsättigung sinkt deutlich.</strong>',
      tradeoffNote: '⚠️ Achtung: Kampagnen werden deutlich teurer. 💡 Tipp: Lohnt sich erst ab ca. 50 % Sättigung des EU-Markts — sonst überwiegen die Mehrkosten den Vorteil des größeren Markts.',
      requires: ['mk_eu'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    },
    {
      id: 'mk_asia', tab: 'marketing',
      name: 'Asien-Expansion', icon: '🌏',
      phase: 2, workers: 3, months: 5, server: 0, cost: 700000,
      marketExpansion: 'asia',
      effect: 'Asien — +3 Mrd. erreichbar. Größter Markt, aber teuerste Kampagnen.',
      effectFull: 'Der asiatische Markt ist der größte der Welt. Lokalisierung und Partner-Netzwerke erschließen 3 Mrd. weitere potenzielle User. <strong>Die Marktsättigung sinkt auf ein Minimum.</strong>',
      tradeoffNote: '⚠️ Achtung: Asiatische Kampagnen sind am teuersten. 💡 Tipp: Diese Expansion lohnt sich erst bei hoher Sättigung aller anderen Märkte (über 50 %) — nur dann überwiegt das Potenzial die Mehrkosten.',
      requires: ['mk_americas'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'marketingstudio'
    }
  ];

  // ── Phase-0-Nodes: Werbung ───────────────────────────────────────────────
  // Quelle: techtree.html → werbung → phase:0
  // wb_coop ist die Voraussetzung für alle Werbung-Phase-1-Nodes.
  var WERBUNG_NODES = [
    {
      id: 'wb_coop', tab: 'werbung',
      name: 'Erste Kooperation', icon: ICO.briefcase,
      phase: 0, workers: 0, months: 3, server: 0, cost: 0,
      moneyBonus: 300,
      requiresUsers: 200,
      effect: 'Lokales Unternehmen schaltet 3 Monate Werbung. Am Ende: +€300.',
      effectFull: 'Ein Bekannter eines lokalen Unternehmens will bei dir Werbung schalten. Laufzeit: 3 Monate — danach erhältst du €300. Voraussetzung: mindestens 200 User.',
      requires: [], requiresPurchase: [], requiresGoLive: true
    },
    {
      id: 'wb_display', tab: 'werbung',
      name: 'Feed-Werbefläche', icon: ICO.image,
      phase: 1, workers: 1, months: 2, server: 200, cost: 500,
      unlocks: 'Werbe-Deals: Banner-Kampagne, Sponsored Post',
      effect: 'Schaltet Banner-Kampagne und Sponsored Post frei.',
      effectFull: 'Du baust die technische Infrastruktur für bezahlte Anzeigen im Feed. Werbetreibende können jetzt Banner-Kampagnen und Sponsored Posts buchen.',
      requires: ['wb_coop'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'werbeagentur'
    },
    {
      id: 'wb_search', tab: 'werbung',
      name: 'Search-Ad-System', icon: ICO.search,
      phase: 1, workers: 1, months: 4, server: 1000, cost: 400,
      unlocks: 'Werbe-Deal: Search-Ad',
      effect: 'Schaltet Search-Ads frei. Gezielte Suchanzeigen mit hoher Klickrate.',
      effectFull: 'Du baust die Infrastruktur für bezahlte Suchanzeigen. User sehen Werbung genau dann, wenn sie nach relevanten Begriffen suchen — deutlich höhere Klickrate als Banner. Benötigt mind. 2 Mitarbeiter in der Werbeagentur.',
      requires: ['wb_display', 'suche'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'werbeagentur'
    },
    {
      id: 'wb_video', tab: 'werbung',
      name: 'Video-Ad-Integration', icon: ICO.video,
      phase: 1, workers: 2, months: 3, server: 5000, cost: 1000,
      unlocks: 'Werbe-Deal: Video-Ad',
      effect: 'Schaltet Video-Ads frei. Höchste Einnahmen, starke Ruf-Kosten.',
      effectFull: 'Pre-Roll und Mid-Roll Werbung in Videos. Bringt die meisten Einnahmen aller Werbeflächen — unterbricht aber das Nutzungserlebnis und kostet Ruf. Benötigt mind. 3 Mitarbeiter in der Werbeagentur.',
      requires: ['wb_display', 'videos'], requiresPurchase: [], requiresGoLive: true, requiresBuilding: 'werbeagentur'
    }
  ];

  var ALL_NODES = DEV_NODES.concat(MARKETING_NODES).concat(WERBUNG_NODES);

  // Aktueller Monatsfortschritt (0–1), wird per clock:tick synchron gehalten.
  var _clockProg = 0;

  // Aktiver Tab.
  var _activeTab = 'entwicklung';

  // ── Hilfsfunktionen ──────────────────────────────────────────────────────
  function getNode(id) {
    for (var i = 0; i < ALL_NODES.length; i++) {
      if (ALL_NODES[i].id === id) return ALL_NODES[i];
    }
    return null;
  }

  // Findet den nächsten freien Slot aus dem globalen Team-Pool.
  // Gibt { buildingGridSlot: 0, workSlotIndex: N } zurück oder null wenn alle belegt.
  // buildingGridSlot ist immer 0 (HQ) — Slots sind jetzt global, nicht mehr Gebäude-gebunden.
  // workSlotIndex ist rein informell für Legacy-Code (Metadaten-Pending, Celebration-Kaskaden).
  function findFreeSlot(s) {
    var cap  = RT.slots ? RT.slots.capacity() : ((s.resources.workers || {}).max || 0);
    var used = RT.slots ? RT.slots.used()     : ((s.resources.workers || {}).occupied || 0);
    if (used >= cap) return null;
    return { buildingGridSlot: 0, workSlotIndex: used };
  }

  // 'locked' | 'available' | 'in_progress' | 'done'
  function nodeStatus(nodeId) {
    var s     = RT.state.get();
    var entry = (s.techtree || {})[nodeId];
    if (entry === 'done') return 'done';
    if (entry && typeof entry === 'object' && entry.status === 'in_progress') return 'in_progress';
    var node = getNode(nodeId);
    if (!node) return 'locked';
    if (node.requiresGoLive && !s.goLiveUnlocked) return 'locked';
    if (node.requiresUsers && (s.resources.users || 0) < node.requiresUsers) return 'locked';
    if (node.requiresBuilding) {
      var bldgs = s.buildings || [];
      var hasBldg = false;
      for (var bi = 0; bi < bldgs.length; bi++) {
        if (bldgs[bi].type === node.requiresBuilding) { hasBldg = true; break; }
      }
      if (!hasBldg) return 'locked';
    }
    var purchases = s.purchases || {};
    for (var i = 0; i < node.requiresPurchase.length; i++) {
      if (!purchases[node.requiresPurchase[i]]) return 'locked';
    }
    var tt = s.techtree || {};
    for (var j = 0; j < node.requires.length; j++) {
      if (tt[node.requires[j]] !== 'done') return 'locked';
    }
    return 'available';
  }

  // Prüft bei jedem Tick ob laufende Forschungen fertig sind (nur months > 0).
  RT.bus.on('clock:tick', function (d) {
    _clockProg = d.progress;
    var s           = RT.state.get();
    var tt          = s.techtree || {};
    var currentFull = s.month + d.progress;
    var anyDone     = false;
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var entry = tt[nid];
      if (entry && typeof entry === 'object' && entry.status === 'in_progress') {
        var node = getNode(nid);
        if (node && currentFull >= entry.startMonthFull + node.months) {
          RT.state.dispatch('TECHTREE_COMPLETE', {
            nodeId:           nid,
            buildingGridSlot: entry.buildingGridSlot || 0,
            workSlotIndex:    entry.workSlotIndex    || 0,
            workers:          node.workers           || 0
          });
          // Alle Boni (usersBonus, moneyBonus, growthBonus, rufBonus) werden erst
          // vergeben wenn der Spieler auf das "Klicken!"-Feld tippt (CELEBRATE_NODE).
          RT.bus.emit('techtree:completed', { nodeId: nid });
          anyDone = true;
        }
      }
    }
    if (anyDone && overlay && overlay.classList.contains('is-open') && !activeNode) {
      render();
    }
  });

  // Gibt lesbaren Grund zurück, warum ein Node gesperrt ist.
  function lockReason(node) {
    var s = RT.state.get();
    var purchases = s.purchases || {};
    var tt = s.techtree || {};
    var missing = [];
    var shopNames = { server1: 'Server (Shop)', rechner: 'Rechner (Shop)' };
    var bldgNames = { marketingstudio: '📣 Marketing Studio', werbeagentur: '📢 Werbeagentur', ki: '🧠 KI-Labor', communitycenter: '🤝 Community Center' };
    if (node.requiresBuilding) {
      var bldgs2 = s.buildings || [];
      var hasBldg2 = false;
      for (var bi2 = 0; bi2 < bldgs2.length; bi2++) {
        if (bldgs2[bi2].type === node.requiresBuilding) { hasBldg2 = true; break; }
      }
      if (!hasBldg2) missing.push(bldgNames[node.requiresBuilding] || node.requiresBuilding);
    }
    if (node.requiresGoLive && !s.goLiveUnlocked) {
      missing.push('Plattform muss erst online gestellt werden');
    }
    if (node.requiresUsers && (s.resources.users || 0) < node.requiresUsers) {
      missing.push('mind. ' + node.requiresUsers + ' User (aktuell: ' + (s.resources.users || 0) + ')');
    }
    node.requiresPurchase.forEach(function (p) {
      if (!purchases[p]) missing.push(shopNames[p] || p);
    });
    node.requires.forEach(function (r) {
      if (tt[r] !== 'done') {
        var n = getNode(r);
        missing.push(n ? n.name : r);
      }
    });
    return missing.length ? 'Benötigt: ' + missing.join(', ') : '';
  }

  // ── Modal ────────────────────────────────────────────────────────────────
  var overlay = null;
  var activeNode = null;

  function open() {
    if (!overlay) { overlay = buildOverlay(); document.body.appendChild(overlay); }
    activeNode = null;
    _activeTab = 'entwicklung';
    render();
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'rt-modal-overlay';
    el.innerHTML = '<div class="rt-modal rt-tt-modal" id="rt-tt-inner"></div>';
    el.addEventListener('click', function (e) { if (e.target === el) close(); });
    return el;
  }

  function render() {
    if (activeNode) renderDetail(activeNode);
    else            renderTree();
  }

  var MARKETING_EDGES = [
    { from: 'mk_freunde',  to: 'mk_langzeit'  },
    { from: 'mk_flyer',    to: 'mk_sprint'    },
    { from: 'mk_langzeit', to: 'mk_nachhall'  },
    { from: 'mk_sprint',   to: 'mk_nachhall'  }
  ];

  var EXPANSION_EDGES = [
    { from: 'mk_eu', to: 'mk_americas' },
    { from: 'mk_americas', to: 'mk_asia' }
  ];

  var WERBUNG_EDGES = [
    { from: 'wb_coop',    to: 'wb_display' },
    { from: 'wb_display', to: 'wb_search'  },
    { from: 'wb_display', to: 'wb_video'   }
  ];

  var EDGES = [
    { from: 'frontend1', to: 'frontend2' },
    { from: 'frontend1', to: 'account'   },
    { from: 'backend1',  to: 'account'   },
    { from: 'backend1',  to: 'backend2'  },
    { from: 'account',   to: 'feed'      },
    { from: 'account',   to: 'bilder'    },
    { from: 'feed',      to: 'like'      },
    { from: 'feed',      to: 'kommentar' },
    { from: 'feed',      to: 'teilen'    },
    { from: 'frontend2', to: 'logoNeu'   },
    { from: 'backend2',  to: 'dm'              },
    { from: 'backend2',  to: 'gruppen'         },
    { from: 'backend2',  to: 'suche'           },
    { from: 'backend2',  to: 'videos'          },
    { from: 'backend2',  to: 'metadaten'       },
    { from: 'dm',        to: 'feedback_system'    },
    { from: 'feed',      to: 'infiniteScroll'    },
    { from: 'metadaten', to: 'infiniteScroll'    },
    { from: 'like',      to: 'pushNotifications' },
    { from: 'dm',        to: 'pushNotifications' },
    { from: 'metadaten', to: 'pushNotifications' },
    { from: 'videos',    to: 'stories'           },
    { from: 'metadaten', to: 'stories'           },
    { from: 'stories',   to: 'autoplay'          },
    { from: 'videos',    to: 'liveStreaming'      },
    { from: 'metadaten', to: 'liveStreaming'      }
  ];

  // ── Wirkung-Chips (geteilt zwischen Karte und Detailansicht) ────────────
  function buildEffectChips(node) {
    var rufVal  = node.rufBonus ? (Math.round(node.rufBonus * 1000) / 10) : 0;
    var rufSign = rufVal >= 0 ? '+' : '';
    return ''
      + (node.rufBonus    ? '<span class="rt-tt-effect-item">🏆 Ruf ' + rufSign + rufVal + ' %</span>' : '')
      + (node.watchtimeBonus ? '<span class="rt-tt-effect-item">⏱ Watchtime +' + node.watchtimeBonus.toFixed(1).replace('.', ',') + ' Std./Tag</span>' : '')
      + (node.growthBonus ? '<span class="rt-tt-effect-item">📈 +' + Math.round(node.growthBonus * 100) + ' %/Mon. Wachstum</span>' : '')
      + (node.usersBonus  ? '<span class="rt-tt-effect-item">👥 +' + node.usersBonus.toLocaleString('de-DE') + ' User</span>' : '')
      + (node.moneyBonus  ? '<span class="rt-tt-effect-item">💵 +€' + node.moneyBonus.toLocaleString('de-DE') + ' Einnahmen</span>' : '')
      + (node.unlocks     ? '<span class="rt-tt-effect-item">🔓 ' + RT.ui.escapeHTML(node.unlocks) + '</span>' : '');
  }

  // ── Node-Karte (shared für alle Tabs) ────────────────────────────────────
  function nodeCard(node) {
    var st = nodeStatus(node.id);
    var chips = buildEffectChips(node);
    return '<div class="rt-tt-node rt-tt-node--' + st + '" data-id="' + node.id + '">'
      + '<div class="rt-tt-node__ico">' + node.icon + '</div>'
      + '<div class="rt-tt-node__body">'
      + '  <div class="rt-tt-node__name">' + RT.ui.escapeHTML(node.name) + '</div>'
      + (chips ? '  <div class="rt-tt-node__fx rt-tt-effect-chips">' + chips + '</div>' : '')
      + '  <div class="rt-tt-node__meta">'
      + (st === 'done'       ? '<span class="rt-tt-badge rt-tt-badge--done">'    + ICO.check + ' Fertig</span>'
       : st === 'in_progress' ? '<span class="rt-tt-badge rt-tt-badge--progress">⏳ In Arbeit</span>'
       : st === 'locked'      ? '<span class="rt-tt-badge rt-tt-badge--locked">'  + ICO.lock  + ' Gesperrt</span>'
       : node.months === 0    ? '<span class="rt-tt-badge rt-tt-badge--ready">Sofort aktiv</span>'
       :                        '<span class="rt-tt-badge rt-tt-badge--ready">Bereit · ' + node.months + ' Mo.</span>'
        )
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  // ── Baumansicht ──────────────────────────────────────────────────────────
  function renderTree() {
    var inner    = overlay.querySelector('#rt-tt-inner');
    var s        = RT.state.get();
    var showTabs = !!s.goLiveUnlocked;

    var tabsHTML = '';
    if (showTabs) {
      var mkNew = !(s.meta && s.meta.seenTabMarketing);
      var wbNew = !(s.meta && s.meta.seenTabWerbung);
      tabsHTML = '<div class="rt-tt-tabs">'
        + '<button class="rt-tt-tab' + (_activeTab === 'entwicklung' ? ' rt-tt-tab--active' : '') + '" data-tab="entwicklung">⚙️ Entwicklung</button>'
        + '<button class="rt-tt-tab' + (_activeTab === 'marketing'   ? ' rt-tt-tab--active' : '') + '" data-tab="marketing">📣 Marketing'  + (mkNew ? '<span class="rt-new-badge">!</span>' : '') + '</button>'
        + '<button class="rt-tt-tab' + (_activeTab === 'werbung'     ? ' rt-tt-tab--active' : '') + '" data-tab="werbung">📢 Werbung'    + (wbNew ? '<span class="rt-new-badge">!</span>' : '') + '</button>'
        + '</div>';
    }

    var contentHTML;
    if (_activeTab === 'entwicklung' || !showTabs) {
      contentHTML = renderDevContent();
    } else if (_activeTab === 'marketing') {
      contentHTML = renderMarketingContent();
    } else {
      var wPhaseNum = (s.phase === 'campus' || s.phase === 'expansion') ? 1 : 0;
      contentHTML = renderWerbungContent(WERBUNG_NODES.filter(function (n) { return n.phase <= wPhaseNum; }));
    }

    inner.innerHTML = ''
      + '<h2 class="rt-card__title" style="margin-bottom:4px;">Tech Tree</h2>'
      + tabsHTML
      + '<p class="rt-tt-hint">Tippe auf eine Entwicklung für Details.</p>'
      + contentHTML
      + '<div class="rt-modal__actions">'
      + '  <button class="rt-btn rt-btn--ghost" id="rt-tt-close">Schließen</button>'
      + '</div>';

    if (_activeTab === 'entwicklung' || !showTabs) {
      requestAnimationFrame(function () { drawConnections(inner, EDGES); });
    } else if (_activeTab === 'marketing') {
      requestAnimationFrame(function () {
        drawConnections(inner, MARKETING_EDGES);
        drawConnections(inner, EXPANSION_EDGES, 'rt-tt-grid-wrap-exp', 'rt-tt-svg-exp');
      });
    } else if (_activeTab === 'werbung') {
      requestAnimationFrame(function () { drawConnections(inner, WERBUNG_EDGES); });
    }

    inner.querySelector('#rt-tt-close').addEventListener('click', close);

    if (showTabs) {
      inner.querySelectorAll('.rt-tt-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          _activeTab = tab.getAttribute('data-tab');
          if (_activeTab === 'marketing' || _activeTab === 'werbung') {
            RT.state.dispatch('MARK_TAB_SEEN', { tab: _activeTab });
            RT.bus.emit('techtree:tab-seen', { tab: _activeTab });
          }
          renderTree();
        });
      });
    }

    inner.querySelectorAll('.rt-tt-node').forEach(function (el) {
      el.addEventListener('click', function () {
        activeNode = el.getAttribute('data-id');
        render();
      });
    });
  }

  function renderDevContent() {
    var ph = RT.state.get().phase;
    var phaseNum = ph === 'expansion' ? 2 : (ph === 'campus' ? 1 : 0);
    var visible  = DEV_NODES.filter(function (n) { return n.phase <= phaseNum; });

    // pick() steuert die Anzeigereihenfolge unabhängig von DEV_NODES-Reihenfolge.
    var byId = {};
    visible.forEach(function (n) { byId[n.id] = n; });
    function pick(ids) {
      return ids.reduce(function (acc, id) {
        if (byId[id]) acc.push(byId[id]);
        return acc;
      }, []);
    }

    // col0: Wurzeln
    // col1: account oben (bündig mit feed), dann frontend2, backend2
    // col2: feed + bilder oben (wie Garage-Phase, verschiebt sich nie) · darunter Backend-v2-Kinder
    // col3: Feed-Kinder · logoNeu ganz unten (braucht frontend2)
    // col4: Phase-2-Watchtime-Features (Scroll, Push, Stories, Live)
    // col5: Autoplay (hängt an Stories in col4)
    var col0 = pick(['frontend1', 'backend1']);
    var col1 = pick(['account', 'frontend2', 'logoNeu', 'backend2', 'pr_abteilung']);
    var col2 = pick(['feed', 'bilder', 'dm', 'gruppen', 'suche', 'videos', 'metadaten']);
    var col3 = pick(['like', 'kommentar', 'teilen', 'feedback_system']);
    var col4 = pick(['infiniteScroll', 'pushNotifications', 'stories', 'liveStreaming']);
    var col5 = pick(['autoplay']);

    return '<div class="rt-tt-grid-wrap" id="rt-tt-grid-wrap">'
      + '  <svg class="rt-tt-svg" id="rt-tt-svg"></svg>'
      + '  <div class="rt-tt-grid" id="rt-tt-grid">'
      + '    <div class="rt-tt-col">' + col0.map(nodeCard).join('') + '</div>'
      + '    <div class="rt-tt-col">' + col1.map(nodeCard).join('') + '</div>'
      + '    <div class="rt-tt-col">' + col2.map(nodeCard).join('') + '</div>'
      + (col3.length > 0 ? '<div class="rt-tt-col">' + col3.map(nodeCard).join('') + '</div>' : '')
      + (col4.length > 0 ? '<div class="rt-tt-col">' + col4.map(nodeCard).join('') + '</div>' : '')
      + (col5.length > 0 ? '<div class="rt-tt-col">' + col5.map(nodeCard).join('') + '</div>' : '')
      + '  </div>'
      + '</div>';
  }

  function renderMarketingContent() {
    var ph       = RT.state.get().phase;
    var phaseNum = ph === 'expansion' ? 2 : (ph === 'campus' ? 1 : 0);
    var visible  = MARKETING_NODES.filter(function (n) { return n.phase <= phaseNum; });

    // Reguläre Nodes (immer sichtbar ab campus)
    var col0 = visible.filter(function (n) { return n.id === 'mk_freunde'  || n.id === 'mk_flyer';    });
    var col1 = visible.filter(function (n) { return n.id === 'mk_langzeit' || n.id === 'mk_sprint';   });
    var col2 = visible.filter(function (n) { return n.id === 'mk_nachhall'; });

    // Expansion-Nodes (nur in Expansionsphase, eigene Sektion oben)
    var expNodes = visible.filter(function (n) { return n.id === 'mk_eu' || n.id === 'mk_americas' || n.id === 'mk_asia'; });
    var expEU  = visible.filter(function (n) { return n.id === 'mk_eu';       });
    var expAM  = visible.filter(function (n) { return n.id === 'mk_americas'; });
    var expAS  = visible.filter(function (n) { return n.id === 'mk_asia';     });

    var expSection = expNodes.length > 0
      ? '<div class="rt-tt-exp-section">'
        + '<div class="rt-tt-exp-label">🌍 Internationale Märkte</div>'
        + '<div class="rt-tt-grid-wrap" id="rt-tt-grid-wrap-exp">'
        + '  <svg class="rt-tt-svg" id="rt-tt-svg-exp"></svg>'
        + '  <div class="rt-tt-grid" id="rt-tt-grid-exp">'
        + (expEU.length > 0 ? '<div class="rt-tt-col">' + expEU.map(nodeCard).join('') + '</div>' : '')
        + (expAM.length > 0 ? '<div class="rt-tt-col">' + expAM.map(nodeCard).join('') + '</div>' : '')
        + (expAS.length > 0 ? '<div class="rt-tt-col">' + expAS.map(nodeCard).join('') + '</div>' : '')
        + '  </div>'
        + '</div>'
        + '</div>'
      : '';

    return expSection
      + '<div class="rt-tt-grid-wrap" id="rt-tt-grid-wrap">'
      + '  <svg class="rt-tt-svg" id="rt-tt-svg"></svg>'
      + '  <div class="rt-tt-grid" id="rt-tt-grid">'
      + '    <div class="rt-tt-col">' + col0.map(nodeCard).join('') + '</div>'
      + (col1.length > 0 ? '    <div class="rt-tt-col">' + col1.map(nodeCard).join('') + '</div>' : '')
      + (col2.length > 0 ? '    <div class="rt-tt-col">' + col2.map(nodeCard).join('') + '</div>' : '')
      + '  </div>'
      + '</div>';
  }

  function renderWerbungContent(nodes) {
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    function pick(ids) {
      return ids.reduce(function (acc, id) {
        if (byId[id]) acc.push(byId[id]);
        return acc;
      }, []);
    }
    var col0 = pick(['wb_coop']);
    var col1 = pick(['wb_display']);
    var col2 = pick(['wb_search', 'wb_video']);
    return '<div class="rt-tt-grid-wrap" id="rt-tt-grid-wrap">'
      + '  <svg class="rt-tt-svg" id="rt-tt-svg"></svg>'
      + '  <div class="rt-tt-grid" id="rt-tt-grid">'
      + '    <div class="rt-tt-col">' + col0.map(nodeCard).join('') + '</div>'
      + (col1.length > 0 ? '    <div class="rt-tt-col">' + col1.map(nodeCard).join('') + '</div>' : '')
      + (col2.length > 0 ? '    <div class="rt-tt-col">' + col2.map(nodeCard).join('') + '</div>' : '')
      + '  </div>'
      + '</div>';
  }

  // Einfaches Wrap-Grid (Fallback, aktuell ungenutzt)
  function renderSimpleContent(nodes) {
    return '<div class="rt-tt-simple-list">'
      + nodes.map(nodeCard).join('')
      + '</div>';
  }

  function drawConnections(inner, edges, wrapId, svgId) {
    var wrap = inner.querySelector('#' + (wrapId || 'rt-tt-grid-wrap'));
    var svg  = inner.querySelector('#' + (svgId  || 'rt-tt-svg'));
    if (!wrap || !svg) return;

    var wR = wrap.getBoundingClientRect();
    svg.setAttribute('width',  wR.width);
    svg.setAttribute('height', wR.height);
    svg.innerHTML = '';

    var NS    = 'http://www.w3.org/2000/svg';
    var COLOR = 'rgba(74,56,41,0.6)';

    edges.forEach(function (edge) {
      var fromEl = inner.querySelector('[data-id="' + edge.from + '"]');
      var toEl   = inner.querySelector('[data-id="' + edge.to   + '"]');
      if (!fromEl || !toEl) return;

      var fR = fromEl.getBoundingClientRect();
      var tR = toEl.getBoundingClientRect();

      // Gleiche Spalte (horizontaler Überlapp) → vertikal verbinden: unten-Mitte → oben-Mitte
      var sameCol = fR.left < tR.right && tR.left < fR.right;
      var pX, pY, cX, cY, d;
      if (sameCol) {
        pX = fR.left + fR.width / 2 - wR.left;
        pY = fR.bottom              - wR.top;
        cX = tR.left + tR.width / 2 - wR.left;
        cY = tR.top                 - wR.top;
        var my = (pY + cY) / 2;
        d = 'M ' + pX + ' ' + pY + ' C ' + pX + ' ' + my + ', ' + cX + ' ' + my + ', ' + cX + ' ' + cY;
      } else {
        pX = fR.right             - wR.left;
        pY = fR.top + fR.height/2 - wR.top;
        cX = tR.left              - wR.left;
        cY = tR.top + tR.height/2 - wR.top;
        var mx = (pX + cX) / 2;
        d = 'M ' + pX + ' ' + pY + ' C ' + mx + ' ' + pY + ', ' + mx + ' ' + cY + ', ' + cX + ' ' + cY;
      }

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', COLOR);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    });
  }

  // ── Detailansicht ────────────────────────────────────────────────────────
  function renderDetail(nodeId) {
    var inner = overlay.querySelector('#rt-tt-inner');
    var node  = getNode(nodeId);
    var st    = nodeStatus(nodeId);
    var reason = (st === 'locked') ? lockReason(node) : '';
    var isInstant = node.months === 0;
    var btnLabel  = isInstant ? 'Aktivieren' : 'Entwickeln';

    var actionHTML;
    if (st === 'done') {
      actionHTML = '<span class="rt-tt-badge rt-tt-badge--done" style="font-size:1rem;padding:10px 18px;">' + ICO.check + ' Fertig</span>';
    } else if (st === 'in_progress') {
      actionHTML = '<span class="rt-tt-badge rt-tt-badge--progress" style="font-size:1rem;padding:10px 18px;">⏳ In Entwicklung…</span>';
    } else if (st === 'locked') {
      actionHTML = '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">' + ICO.lock + ' Gesperrt</button>';
    } else {
      var sRes       = RT.state.get().resources;
      var ws         = sRes.workers;
      var free       = (ws.max || 0) - (ws.occupied || 0);
      var freeServer = (sRes.serverCapacity || 0) - (sRes.serverSoftwareUsage || 0) - (sRes.serverUsage || 0);
      var needServer = node.server || 0;
      var nodeW      = node.workers || 0;
      var nodeCost   = node.cost || 0;
      var freeSlot   = !isInstant ? findFreeSlot(RT.state.get()) : true;

      if (!isInstant && !freeSlot) {
        actionHTML = '<p class="rt-tt-detail__no-workers">Alle Entwicklungs-Slots belegt — warte bis eine Entwicklung abgeschlossen ist.</p>'
          + '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">' + btnLabel + '</button>';
      } else if (nodeW > 0 && free < nodeW) {
        actionHTML = '<p class="rt-tt-detail__no-workers">Keine freien Teammates — aktuell belegt: '
          + (ws.occupied || 0) + '/' + (ws.max || 0) + '</p>'
          + '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">' + btnLabel + '</button>';
      } else if (needServer > 0 && freeServer < needServer) {
        actionHTML = '<p class="rt-tt-detail__no-workers">Zu wenig Server-Kapazität — frei: '
          + freeServer + ', benötigt: ' + needServer + ' (Server im Shop kaufen)</p>'
          + '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">' + btnLabel + '</button>';
      } else if (nodeCost > 0 && (sRes.money || 0) < nodeCost) {
        actionHTML = '<p class="rt-tt-detail__no-workers">Zu wenig Geld — benötigt: €' + nodeCost + '</p>'
          + '<button class="rt-btn" disabled style="opacity:0.45;cursor:not-allowed;">' + btnLabel + '</button>';
      } else {
        actionHTML = '<button class="rt-btn rt-btn--primary" id="rt-tt-develop">' + btnLabel + '</button>';
      }
    }

    function fmtMonths(m) {
      if (m === 0.25) return '1 Woche';
      if (m === 0.5)  return '2 Wochen';
      if (m === 0.75) return '3 Wochen';
      return m + (m === 1 ? ' Monat' : ' Monate');
    }

    var costChip     = node.cost > 0
      ? '<span class="rt-mk-chip rt-mk-chip--cost">💰 €' + node.cost + '</span>'
      : '<span class="rt-mk-chip rt-mk-chip--cost">kostenlos</span>';
    var durChip      = isInstant
      ? '<span class="rt-mk-chip rt-mk-chip--dur">⚡ Sofort</span>'
      : '<span class="rt-mk-chip rt-mk-chip--dur">⏱ ' + fmtMonths(node.months) + '</span>';
    var wkrChip      = node.workers > 0
      ? '<span class="rt-mk-chip rt-mk-chip--wkr">👤 ' + node.workers + '</span>' : '';
    var srvChip      = node.server > 0
      ? '<span class="rt-mk-chip rt-mk-chip--srv">🖥 +' + node.server + '</span>' : '';

    var effectChips = buildEffectChips(node);
    var effectsRow = effectChips
      ? '<div class="rt-tt-detail__effects">'
        + '<span class="rt-tt-detail__effects-label">Wirkung</span>'
        + '<div class="rt-tt-detail__effect-chips">' + effectChips + '</div>'
        + '</div>'
      : '';

    inner.innerHTML = ''
      + '<button class="rt-btn rt-btn--ghost rt-tt-back" id="rt-tt-back">← Zurück</button>'
      + '<div class="rt-tt-detail">'
      + '  <div class="rt-tt-detail__cols">'
      + '    <div class="rt-tt-detail__main">'
      + '      <div class="rt-tt-detail__header">'
      + '        <div class="rt-tt-detail__ico">' + node.icon + '</div>'
      + '        <h3 class="rt-tt-detail__name">' + RT.ui.escapeHTML(node.name) + '</h3>'
      + '      </div>'
      + '      <p class="rt-tt-detail__fx">' + node.effectFull + '</p>'
      + (node.tradeoffNote ? '<p class="rt-tt-detail__tradeoff">' + node.tradeoffNote + '</p>' : '')
      + effectsRow
      + '    </div>'
      + '    <div class="rt-tt-detail__right">'
      + '      <div class="rt-tt-detail__res-head">Ressourcen</div>'
      + '      <div class="rt-tt-detail__chips">' + costChip + durChip + wkrChip + srvChip + '</div>'
      + '    </div>'
      + '  </div>'
      + (reason ? '<p class="rt-tt-detail__lock">' + RT.ui.escapeHTML(reason) + '</p>' : '')
      + '</div>'
      + '<div class="rt-modal__actions">' + actionHTML + '</div>';

    inner.querySelector('#rt-tt-back').addEventListener('click', function () {
      activeNode = null;
      render();
    });

    var devBtn = inner.querySelector('#rt-tt-develop');
    if (devBtn) {
      devBtn.addEventListener('click', function () {
        var s2     = RT.state.get();
        var w2     = s2.resources.workers;
        var nodeW2 = node.workers || 0;
        var cost2  = node.cost || 0;

        if (nodeW2 > 0 && (w2.occupied || 0) + nodeW2 > (w2.max || 0)) return;
        if (cost2 > 0 && (s2.resources.money || 0) < cost2) return;

        if (cost2 > 0) {
          RT.state.dispatch('ADD_RESOURCE', { key: 'money', delta: -cost2, label: 'Forschung: ' + node.name });
        }

        if (isInstant) {
          // Sofort-Aktivierung (months:0) — Server sofort anrechnen
          if (node.server) {
            RT.state.dispatch('ADD_RESOURCE', { key: 'serverSoftwareUsage', delta: node.server });
          }
          RT.state.dispatch('TECHTREE_COMPLETE', { nodeId: nodeId });
          // Boni werden erst beim "Klicken!"-Tap vergeben (CELEBRATE_NODE in campusScreen).
          RT.bus.emit('techtree:completed', { nodeId: nodeId });
        } else {
          var slot = findFreeSlot(s2);
          if (!slot) return;
          // Forschungs-Timer starten — Server-Kapazität sofort reservieren
          if (node.server) {
            RT.state.dispatch('ADD_RESOURCE', { key: 'serverSoftwareUsage', delta: node.server });
          }
          RT.state.dispatch('TECHTREE_START', {
            nodeId:           nodeId,
            startMonthFull:   s2.month + _clockProg,
            buildingGridSlot: slot.buildingGridSlot,
            workSlotIndex:    slot.workSlotIndex,
            workers:          nodeW2
          });
          if (nodeW2 > 0) {
            RT.state.dispatch('SET_WORKERS', { occupied: (w2.occupied || 0) + nodeW2 });
          }
        }
        close();
      });
    }
  }

  RT.techtree = { open: open, close: close, getNode: getNode, findFreeSlot: findFreeSlot };
})(window.RT);
