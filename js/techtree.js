/* Techtree — Phase-0-Hauptbaum (5 Nodes), im Layout-Stil aus v1.
   Zwei Ansichten: Baum (default) und Detail (nach Klick auf Node).
   Nutzt Feather-Icons via CDN (feather.replace() nach Render).
   SVG-Bezier-Verbindungen zwischen Nodes. */
(function (RT) {
  'use strict';

  // ── Tab-Konfiguration ─────────────────────────────────────────────────
  // Reihenfolge im UI. Marketing & Werbung erst nach goLiveUnlocked sichtbar.
  // minPhase: Reiter taucht erst ab dieser Phase auf. Der KI-Reiter ist damit
  // der sichtbare Anfang von Phase 3 — dort steht alles, was mit Metadaten und
  // User-Modellen zu tun hat.
  var TABS = [
    { id: 'entwicklung', label: 'Entwicklung', icon: '⚙️', requiresGoLive: false },
    { id: 'marketing',   label: 'Marketing',   icon: '📣', requiresGoLive: true  },
    { id: 'werbung',     label: 'Werbung',     icon: '📢', requiresGoLive: true  },
    { id: 'ki',          label: 'KI',          icon: '🧠', requiresGoLive: true, minPhase: 3 }
  ];

  // ── Node-Definitionen ─────────────────────────────────────────────────
  // tab: welcher Reiter — entwicklung (Kern-Baum) | marketing | werbung.
  // phase: ab welcher Spielphase die Node überhaupt auftaucht (0 = Garage,
  //        1 = online, 2 = nach dem Investor). Phase-2-Nodes sind vorher
  //        unsichtbar, nicht nur gesperrt.
  // durationSec: 20 s = 1 v1-Monat.
  // server: belegt Programm-Kapazität in der ersten Serverfarm (visuell als Kiste).
  //         Nur entwicklung-Nodes brauchen Server-Kap + HQ-Slot; marketing/werbung
  //         laufen parallel, ohne HQ zu blockieren.
  // Belohnungen: usersBonus (einmalig +User), moneyBonus (einmalig +€),
  //              trendBonus (dauerhafter Trend-Modifikator, siehe TREND-BUDGET).
  // requiresGoLive: Node erst nach Plattform-Launch verfügbar.
  // requiresUsers: Mindest-User zum Starten.
  //
  // ── TREND-BUDGET (Balance-Knopf) ──────────────────────────────────────
  // Die trendBonus-Werte entsprechen den rufBonus-Werten aus v1. Sie lagen
  // zwischenzeitlich bei einem Drittel bis der Hälfte davon — die beiden
  // Dark Patterns waren aber 1:1 aus v1 übernommen. Dadurch war der Schaden
  // auf v1-Maßstab kalibriert und der Nutzen auf einen halb so großen; die
  // Dark Patterns wirkten dominant, ohne dass ihre eigenen Zahlen schuld
  // waren. Beide Seiten stehen jetzt wieder auf demselben Maßstab.
  //
  // Achtung beim Vergleich mit v1: dort war der Ruf auf +6 gedeckelt und
  // wurde pro Monat (= Button-Klick) abgerechnet. Hier ist der Cap +20 und
  // die Uhr läuft alle TREND_CYCLE_SEC = 12 s automatisch. Videos (+6,0)
  // heißt also ×1,34 User pro Minute, solange der Bonus voll anliegt.
  // Wenn das zu wild wird: an TREND_HOLD_NODE_SEC drehen, nicht an den
  // Einzelwerten — das erhält die Rangfolge der Nodes.
  //
  // ── VERDOPPLUNG 2026-08-04: weniger Nodes, dafür größere ──────────────
  // Alle 13 Trend+-Nodes des Hauptbaums haben durationSec UND trendBonus
  // verdoppelt bekommen. Ziel war nicht mehr Wachstum, sondern WENIGER
  // abgeschlossene Nodes in derselben Spielzeit (Messung: 13 von 13 in
  // 20 Minuten war zu viel, angepeilt sind ~8).
  //
  // Dass das Wachstum dabei ungefähr stehen bleibt, ist Rechnung, nicht
  // Zufall — trendBonus ×2 bedeutet Wirkung ×3,66 (der Abkling-Schwanz ist
  // quadratisch, siehe unten), und ~8 verdoppelte Nodes liefern damit
  // praktisch dasselbe wie 13 alte:
  //     13 Nodes alt   8.595 Trend-Sekunden
  //      8 Nodes neu   8.920 Trend-Sekunden
  // ⚠️ Wer die Dauer wieder senkt, ohne den Trend mitzusenken, kippt genau
  // diese Balance — die beiden Faktoren gehören zusammen.
  //
  // Die Summe (+49,0) liegt weit über dem Cap von +20, und das ist jetzt
  // KEIN reiner Extremfall mehr: Videos allein ist +12,0. Zwei größere
  // Nodes kurz nacheinander abgeholt, und der Überhang verfällt lautlos.
  // Falls das im Test stört, ist TREND_MAX der Knopf, nicht die
  // Einzelwerte. Nebeneffekt der spitzeren Kurve: Werbedeals im Peak
  // kosten fast nichts (im Cap sogar gar nichts), im Tal dagegen viel —
  // daraus entsteht Timing-Spiel, das vorher nicht da war.
  //
  // Kleiner Werte sind nicht linear schwächer: weil der Decay linear im
  // Betrag läuft, hat ein größerer Bonus auch einen proportional längeren
  // Schwanz. Videos mit +1,5 ergibt 315 Trend-Sekunden, mit +6,0 sind es
  // 3.960 — Wert ×4, Wirkung ×12,6. Hier zu drehen wirkt stärker als es
  // aussieht.
  //
  // ⚠️ Deshalb ist ein FLACHER Aufschlag (jede Node +0,5) etwas ganz
  // anderes als ein FAKTOR (alle ×1,5). Flach hebt die kleinen Nodes
  // dreimal so stark wie Videos (+0,5 → +1,0 verdreifacht die Wirkung,
  // +6,0 → +6,5 hebt sie um 17 %) und ebnet damit die Rangfolge ein.
  // Ein Faktor lässt die Rangfolge stehen. Wer "mehr Trend insgesamt"
  // will, nimmt den Faktor; wer "die kleinen Nodes fühlen sich wertlos an"
  // lösen will, nimmt den flachen Aufschlag. Das sind zwei verschiedene
  // Probleme.
  var NODES = {
    frontend1: {
      id: 'frontend1', tab: 'entwicklung', phase: 0, name: 'Frontend v1', icon: 'monitor',
      durationSec: 15, server: 500, cost: 0,
      effect: 'Basis-Infrastruktur. Voraussetzung für Account-System.',
      effectFull: 'Du baust die visuelle Seite der Plattform. User können sie im Browser aufrufen. Voraussetzung für alle weiteren Features.',
      requires: [],
      requiresPurchase: ['rechner'],
      requiresBuilding: 'farm'
    },
    backend1: {
      id: 'backend1', tab: 'entwicklung', phase: 0, name: 'Backend v1', icon: 'server',
      durationSec: 15, server: 500, cost: 0,
      effect: 'Basis-Infrastruktur. Ermöglicht Datenspeicherung.',
      effectFull: 'Die unsichtbare Seite der Plattform: Server-Logik, Datenbank, API. Ohne Backend keine User-Daten.',
      requires: [],
      requiresPurchase: [],
      requiresBuilding: 'farm'
    },
    account: {
      id: 'account', tab: 'entwicklung', phase: 0, name: 'Account-System', icon: 'user',
      durationSec: 10, server: 300, cost: 0,
      effect: 'Voraussetzung für Feed & Bilder.',
      effectFull: 'User können Konten erstellen, sich einloggen und Profile anlegen. Voraussetzung für Feed und Bilder.',
      requires: ['frontend1', 'backend1'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    feed: {
      id: 'feed', tab: 'entwicklung', phase: 0, name: 'News-Feed', icon: 'list',
      durationSec: 5, server: 300, cost: 0,
      effect: 'User sehen Inhalte. Voraussetzung für Werbung.',
      effectFull: 'Chronologischer Feed: User können posten und Beiträge anderer sehen. Voraussetzung für Like, Kommentar, Teilen und erste Werbung.',
      requires: ['account'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    bilder: {
      id: 'bilder', tab: 'entwicklung', phase: 0, name: 'Bilder hochladen', icon: 'image',
      durationSec: 5, server: 300, cost: 0,
      effect: 'Erhöht Posting-Frequenz. Voraussetzung für Videos.',
      effectFull: 'User können Fotos zu Beiträgen hinzufügen. Erhöht die Posting-Häufigkeit und Verweildauer.',
      requires: ['account'],
      requiresPurchase: [],
      requiresBuilding: null
    },
    // ── Phase 2: Hauptbaum ──────────────────────────────────────────────
    // Zwei Achsen: Features, die User mögen (Trend rauf), und die
    // Infrastruktur, die sie überhaupt möglich macht (Server-Kapazität).
    frontend2: {
      id: 'frontend2', tab: 'entwicklung', phase: 2, name: 'Frontend v2 (Mobile)', icon: 'smartphone',
      durationSec: 80, server: 600, cost: 2000, trendBonus: 2,
      effect: 'Plattform läuft auf Smartphones. Trend +2,0.',
      effectFull: 'Die Plattform bekommt eine mobile Ansicht. User bleiben länger und kommen häufiger zurück — statt nur am Rechner sind sie jetzt überall dabei.',
      requires: ['frontend1'], requiresPurchase: [], requiresBuilding: null
    },
    backend2: {
      id: 'backend2', tab: 'entwicklung', phase: 2, name: 'Backend v2 (Skalierbar)', icon: 'hard-drive',
      durationSec: 120, server: 900, cost: 5000, trendBonus: 1,
      effect: 'Trägt mehr Last. Tor zu DM, Gruppen, Suche und Videos. Trend +1,0.',
      effectFull: 'Die Serverlogik wird neu aufgestellt und verkraftet deutlich mehr Traffic. Stabiler Betrieb stärkt das Vertrauen — und ohne dieses Fundament geht keines der großen Features.',
      requires: ['backend1'], requiresPurchase: [], requiresBuilding: null
    },
    like: {
      id: 'like', tab: 'entwicklung', phase: 2, name: 'Like-Funktion', icon: 'thumbs-up',
      durationSec: 40, server: 300, cost: 1000, trendBonus: 3,
      effect: 'Soziale Bestätigung hält User aktiv. Trend +3,0.',
      effectFull: 'User können Beiträge liken. Die soziale Bestätigung motiviert zum Posten und sorgt dafür, dass Leute wiederkommen um zu sehen, wie gut ihr Beitrag ankam.',
      requires: ['feed'], requiresPurchase: [], requiresBuilding: null
    },
    kommentar: {
      id: 'kommentar', tab: 'entwicklung', phase: 2, name: 'Kommentare', icon: 'message-circle',
      durationSec: 40, server: 300, cost: 1500, trendBonus: 4,
      effect: 'User treten in Dialog. Trend +4,0.',
      effectFull: 'User können unter Beiträgen kommentieren. Das fördert echte Gespräche und erhöht die Zeit, die jemand auf der Plattform verbringt.',
      requires: ['feed'], requiresPurchase: [], requiresBuilding: null
    },
    teilen: {
      id: 'teilen', tab: 'entwicklung', phase: 2, name: 'Teilen-Funktion', icon: 'share-2',
      durationSec: 40, server: 300, cost: 2000, trendBonus: 5,
      effect: 'Posts verbreiten sich von allein. Trend +5,0.',
      effectFull: 'User können Beiträge weiterreichen und die Plattform so bekannt machen. Geteilte Posts bringen neue Leute, ohne dass du eine einzige Kampagne bezahlst.',
      unlocks: 'Marketing: Sprint-Kampagnen',
      requires: ['feed'], requiresPurchase: [], requiresBuilding: null
    },
    logoNeu: {
      id: 'logoNeu', tab: 'entwicklung', phase: 2, name: 'Logo Redesign', icon: 'award',
      durationSec: 40, server: 400, cost: 3000, trendBonus: 2,
      effect: 'Tauscht dein Logo gegen eine Profi-Version. Trend +2,0.',
      effectFull: 'Dein Team überarbeitet das Logo: aus dem gemalten Entwurf wird eine klare Wortmarke — dasselbe Motiv, nur professionell umgesetzt. Das neue Logo ersetzt danach überall im Spiel das alte.',
      unlocks: 'Neues Firmenlogo',
      requires: ['frontend2'], requiresPurchase: [], requiresBuilding: null
    },
    dm: {
      id: 'dm', tab: 'entwicklung', phase: 2, name: 'Direktnachrichten', icon: 'mail',
      durationSec: 160, server: 8000, cost: 12000, trendBonus: 6,
      effect: 'Private Kommunikation bindet User stark. Trend +6,0.',
      effectFull: 'User können sich gegenseitig private Nachrichten schicken. Wer seine Freunde nur noch hier erreicht, wechselt so schnell nicht mehr die Plattform.',
      requires: ['backend2'], requiresPurchase: [], requiresBuilding: null
    },
    gruppen: {
      id: 'gruppen', tab: 'entwicklung', phase: 2, name: 'Gruppen', icon: 'users',
      durationSec: 120, server: 4000, cost: 8000, trendBonus: 4,
      effect: 'Communities bilden sich. Trend +4,0.',
      effectFull: 'User können eigene Gruppen gründen und Gleichgesinnte finden. Wo eine Community entsteht, bleibt sie meistens auch.',
      requires: ['backend2'], requiresPurchase: [], requiresBuilding: null
    },
    suche: {
      id: 'suche', tab: 'entwicklung', phase: 2, name: 'Suchfunktion', icon: 'search',
      durationSec: 80, server: 600, cost: 6000, trendBonus: 1,
      effect: 'User finden Inhalte und Personen. Trend +1,0.',
      effectFull: 'Eine Suchleiste für Beiträge, Profile und Gruppen. Macht die Plattform spürbar benutzerfreundlicher — und verrät dir nebenbei, wonach deine User suchen.',
      unlocks: 'Werbung: Search-Ad-System',
      requires: ['backend2'], requiresPurchase: [], requiresBuilding: null
    },
    videos: {
      id: 'videos', tab: 'entwicklung', phase: 2, name: 'Videos hochladen', icon: 'video',
      durationSec: 240, server: 20000, cost: 30000, trendBonus: 12,
      effect: 'Stärkster Trend-Booster, aber sehr serverhungrig. Trend +12,0.',
      effectFull: 'User können Videos hochladen und ansehen. Video-Content hält Leute am längsten auf der Plattform — kostet dafür aber so viel Serverplatz wie kein anderes Feature.',
      unlocks: 'Werbung: Video-Ad-Integration',
      requires: ['backend2'], requiresPurchase: [], requiresBuilding: null
    },
    polls: {
      id: 'polls', tab: 'entwicklung', phase: 2, name: 'Umfragen', icon: 'bar-chart-2',
      durationSec: 40, server: 300, cost: 4000, trendBonus: 2,
      effect: 'Mitmachen ist einfacher als schreiben. Trend +2,0.',
      effectFull: 'User können Umfragen posten. Abstimmen kostet einen Klick — dadurch beteiligen sich auch die, die nie selbst etwas schreiben würden.',
      requires: ['kommentar'], requiresPurchase: [], requiresBuilding: null
    },
    events: {
      id: 'events', tab: 'entwicklung', phase: 2, name: 'Events-Feature', icon: 'calendar',
      durationSec: 80, server: 6000, cost: 10000, trendBonus: 4,
      effect: 'Bringt User regelmäßig zurück. Trend +4,0.',
      effectFull: 'Gruppen können Termine anlegen, zu denen sich User anmelden. Ein Event im Kalender ist ein Grund, wiederzukommen — immer wieder.',
      requires: ['gruppen'], requiresPurchase: [], requiresBuilding: null
    },
    // Die technische Voraussetzung dafür, dass Firmen überhaupt auf der
    // Plattform auftreten können — und damit das Nadelöhr vor der GANZEN
    // Anziehungskraft-Achse im Marketing-Reiter (mk_presse und alles dahinter).
    //
    // Die beiden Vorbedingungen sind inhaltlich zwingend, nicht dekorativ:
    // ein Firmenprofil IST technisch eine Gruppe, und ohne Suche findet es
    // niemand. Dadurch liegt der Node auf Ebene 4 des Hauptbaums, und die
    // Anziehungskraft-Kampagnen dahinter werden tief, ohne dass der
    // Marketing-Reiter künstlich verlängert werden muss.
    unternehmen: {
      id: 'unternehmen', tab: 'entwicklung', phase: 2,
      name: 'Unternehmensprofile', icon: 'briefcase',
      durationSec: 160, server: 12000, cost: 12000, trendBonus: 3,
      effect: 'Firmen bekommen eigene Profile. Trend +3,0.',
      effectFull: 'Firmen und Anbieter bekommen eigene, verifizierte Profile — mit Impressum, Kontaktdaten und einer Seite, die man über die Suche findet. Deine Plattform ist damit nicht mehr nur ein Ort unter Freunden, sondern einer, an dem auch Unternehmen auftreten.',
      unlocks: 'Marketing: Partner-Programm',
      requires: ['gruppen', 'suche'], requiresPurchase: [], requiresBuilding: null
    },

    // ── Phase 2: Watchtime-Features ─────────────────────────────────────
    // Zweite Achse des Baums. Alle geben einen DAUERHAFTEN Watchtime-
    // Multiplikator (watchtimeMult, multiplikativ verrechnet).
    //
    // Der Unterschied liegt beim Trend, und er ist der pädagogische Kern:
    //   Features, die User mögen  → trendBonus, befristet (nutzt sich ab)
    //   Dark Patterns             → trendBase,  DAUERHAFT (Schaden bleibt)
    // trendBase verschiebt den Ruhewert des Trends. Wer beide Dark Patterns
    // nimmt, dessen Plattform pendelt sich dauerhaft im Minus ein.
    //
    // ── DIE ZWEI HÄLFTEN DER DAUERHAFTEN TREND-WIRKUNG ────────────────────
    // Seit dem 2026-08-06 gibt es sie in BEIDE Richtungen:
    //
    //   Dark Pattern  (darkPattern) → trendBase, ein fester Abzug, für immer
    //   White Pattern (whitePattern) → networkK, hebt die STEIGUNG des
    //                                  Netzwerkeffekts (state.js)
    //
    // Das ist bewusst kein Spiegel, sondern zwei verschiedene Formen:
    //
    //   Dark  = sofort spürbar, konstant, wird mit der Plattform relativ
    //           kleiner (−7,0 sind bei einem Trend von 30 nicht mehr viel)
    //   White = heute fast nichts, wächst mit jeder Verzehnfachung mit
    //
    // Daraus entsteht der Bogen, den das Spiel erzählen soll, ganz ohne
    // Warntext: DARK PATTERNS SIND DIE ABKÜRZUNG, DIE SICH GROSSARTIG ANFÜHLT
    // UND DIE MAN ÜBERWÄCHST. Wer sie nimmt, gewinnt die erste halbe Stunde;
    // wer die Vertrauens-Features baut, gewinnt das Endspiel. Der Schüler liest
    // das an seinen eigenen Zahlen ab, statt es gesagt zu bekommen.
    //
    // ── ZWISCHENSTAND, DER NICHT ZURÜCK DARF ─────────────────────────────
    // Die Schuld stand zwischenzeitlich auf −4,1 (halbiert), weil sie ohne
    // Gegengewicht nicht bezahlbar war, sondern tödlich: Ruhewert −8,0 gegen
    // drei Kampagnenplätze (+9,0) ergab netto +1,0, und ein einziger Video-Deal
    // drückte das auf +0,375 — bei 1 Mio Usern rund 50 Minuten je Verdopplung.
    // Ausweichen konnte man auch nicht: wb_adserver verlangt infiniteScroll,
    // wb_retarget verlangt ki_profile.
    //
    // Der Netzwerkeffekt bezahlt das jetzt: bei 1 Mio Usern bringt er +4,0
    // (k = 2,0), also praktisch genau die Halbierung, die hier zurückgenommen
    // wird. Deshalb stehen die Werte wieder nahe am Original — mit einer
    // Ausnahme:
    //
    // ⚠️ DIE PHASE-2-MUSTER BLEIBEN AUF ZWEI DRITTELN (−1,0 / −1,5 statt
    // −1,5 / −2,0). Sie schlagen bei ~100k–300k Usern zu, wo der
    // Netzwerkeffekt erst bei +2,0 bis +2,5 steht und man oft nur einen
    // Kampagnenplatz hat. Die Phase-3-Muster (−1,5 / −1,0 / −2,0) stehen
    // dagegen wieder voll auf dem v1-Maßstab. Summe: −7,0.
    //
    // ⚠️ Reihenfolge beim Ändern: Diese Werte hängen am Netzwerkeffekt, nicht
    // am Anziehungskraft-Budget allein. Wer NETWORK_K_BASE senkt, muss hier
    // mitsenken.
    pushNotifications: {
      id: 'pushNotifications', tab: 'entwicklung', phase: 2,
      name: 'Push-Benachrichtigungen', icon: 'bell',
      durationSec: 80, server: 1500, cost: 15000,
      watchtimeMult: 1.05, trendBonus: 0.5,
      effect: 'Holt User zurück. Watchtime +5 %, Trend +0,5.',
      effectFull: 'User bekommen eine Nachricht, wenn jemand ihren Beitrag liked oder ihnen schreibt. Das holt sie häufiger zurück — und die meisten finden es sogar praktisch.',
      requires: ['like', 'dm'], requiresPurchase: [], requiresBuilding: null
    },
    stories: {
      id: 'stories', tab: 'entwicklung', phase: 2, name: 'Stories', icon: 'circle',
      durationSec: 120, server: 4000, cost: 20000,
      watchtimeMult: 1.10, trendBonus: 1,
      effect: 'Kurzvideos mit 24-h-Ablauf. Watchtime +10 %, Trend +1,0.',
      effectFull: 'User posten Kurzvideos, die nach 24 Stunden verschwinden. Weil Inhalte ablaufen, schauen viele täglich rein — sie wollen nichts verpassen.',
      unlocks: 'Autoplay',
      requires: ['videos'], requiresPurchase: [], requiresBuilding: null
    },
    gamification: {
      id: 'gamification', tab: 'entwicklung', phase: 2,
      name: 'Streaks & Abzeichen', icon: 'award',
      durationSec: 60, server: 800, cost: 12000,
      watchtimeMult: 1.10, trendBonus: 1.5,
      effect: 'Tägliche Serien und Abzeichen. Watchtime +10 %, Trend +1,5.',
      effectFull: 'Wer jeden Tag vorbeischaut, baut eine Serie auf und sammelt Abzeichen. Das motiviert — auch wenn manche irgendwann nur noch kommen, um die Serie nicht zu verlieren.',
      requires: ['gruppen'], requiresPurchase: [], requiresBuilding: null
    },
    liveStreaming: {
      id: 'liveStreaming', tab: 'entwicklung', phase: 2,
      name: 'Live-Streaming', icon: 'radio',
      durationSec: 140, server: 8000, cost: 40000,
      watchtimeMult: 1.20, trendBonus: 2,
      effect: 'Echtzeit-Streams. Stärkster Watchtime-Schub, Trend +2,0.',
      effectFull: 'User können live senden, Zuschauer kommentieren in Echtzeit. Ein Stream zieht viele Leute gleichzeitig an und hält sie stundenlang — das teuerste Feature im Baum, aber auch das beliebteste.',
      requires: ['videos'], requiresPurchase: [], requiresBuilding: null
    },
    infiniteScroll: {
      id: 'infiniteScroll', tab: 'entwicklung', phase: 2,
      name: 'Infiniter Scroll', icon: 'refresh-cw',
      durationSec: 60, server: 1500, cost: 5000,
      watchtimeMult: 1.15, trendBase: -1, darkPattern: true,
      effect: 'Der Feed hört nie auf. Watchtime +15 %, Trend dauerhaft −1,0.',
      effectFull: 'Der Feed lädt endlos nach — es gibt kein Ende mehr, an dem man aufhören könnte. User verlieren das Zeitgefühl. Das ist dein erstes Dark Pattern: Die Watchtime steigt, aber der Ruf deiner Plattform nimmt bleibenden Schaden. Diese Entscheidung lässt sich nicht rückgängig machen.',
      requires: ['stories'], requiresPurchase: [], requiresBuilding: null
    },
    autoplay: {
      id: 'autoplay', tab: 'entwicklung', phase: 2, name: 'Autoplay', icon: 'play-circle',
      durationSec: 60, server: 1500, cost: 8000,
      watchtimeMult: 1.15, trendBase: -1.5, darkPattern: true,
      effect: 'Das nächste Video startet von selbst. Watchtime +15 %, Trend dauerhaft −1,5.',
      effectFull: 'Nach einer Story startet automatisch die nächste — ohne Klick, ohne Pause. Wer aufhören will, muss sich aktiv wehren. Das stärkste Dark Pattern im Baum, und der Rufschaden bleibt für immer.',
      requires: ['stories'], requiresPurchase: [], requiresBuilding: null
    },

    // ── Vertrauens-Features (White Patterns) ────────────────────────────
    // Das Gegenstück zu den Dark Patterns, aber in anderer FORM: sie geben
    // keinen Sockel, sondern heben `networkK` — die Steigung des
    // Netzwerkeffekts (state.js). Bei 100k Usern ist das fast nichts, bei
    // 1 Mrd das Doppelte des Grundwerts.
    //
    // Inhaltlich sind es alles Dinge, die die Plattform PRAKTISCH machen. Kein
    // Feature davon hat einen Haken; das ist der Punkt. Der Preis ist die
    // Investition selbst:
    //
    // ⚠️ SIE KOSTEN VIEL SERVER, UND ZWAR ABSICHTLICH. Das ist ihr einziger
    // Balance-Knopf. Zum Maßstab: der komplette Hauptbaum belegt 53.700 —
    // die Offene Schnittstelle allein kostet mehr als das Doppelte. Im
    // Belegungs-Balken der Farm ist das ein Block, den man nicht übersieht,
    // und er ist dauerhaft (programmCapacity zählt fertige Nodes für immer).
    // „Das ist Code, der liegt auf deinen Farmen" ist damit wörtlich wahr.
    //
    // ⚠️ Das ist eine bewusste Abweichung von CLAUDE.md §9 („wer den Baum
    // bremsen will, dreht an durationSec, NICHT an server"). Die Regel steht
    // dort, damit die Farmen nicht zum Feature-Lager werden — bei drei Nodes
    // trägt das Bild noch, bei dreißig nicht mehr.
    //
    // ⚠️ Kosten können den Bonus ohnehin nicht „ausbalancieren": networkK
    // wirkt auf die Wachstums-RATE, Kapazität ist linear. 30 % Kapazität weg
    // sind bei +10 %/min nach drei Minuten wieder drin. Die Kosten entscheiden
    // also nicht OB, sondern WANN — sie sind Taktung, nicht Balance. Wer hier
    // schraubt, verschiebt den Zeitpunkt, nicht die Rangfolge.
    barrierefrei: {
      id: 'barrierefrei', tab: 'entwicklung', phase: 2,
      name: 'Barrierefreiheit', icon: 'eye',
      durationSec: 200, server: 30000, cost: 25000,
      networkK: 0.25, whitePattern: true,
      effect: 'Untertitel, Screenreader, Kontraste. Netzwerkeffekt wächst schneller.',
      effectFull: 'Untertitel, Screenreader-Unterstützung, ordentliche Kontraste, Bedienung ohne Maus. Leute, die deine Plattform vorher schlicht nicht benutzen konnten, sind jetzt dabei — und sie bringen ihre Leute mit. Das wirkt heute kaum und in ein paar Größenordnungen sehr stark: es macht nicht den Trend größer, sondern die Steigung, mit der er wächst.',
      requires: ['frontend2'], requiresPurchase: [], requiresBuilding: null
    },
    moderation: {
      id: 'moderation', tab: 'entwicklung', phase: 3,
      name: 'Moderations-Team', icon: 'shield',
      durationSec: 250, server: 80000, cost: 45000, metadata: 200000,
      networkK: 0.35, whitePattern: true,
      effect: 'Es bleibt erträglich hier. Netzwerkeffekt wächst schneller.',
      effectFull: 'Echte Menschen, die sich Meldungen ansehen, statt eines Filters, der alles durchwinkt. Es ist teuer und es skaliert schlecht — aber es ist der Unterschied zwischen einer Plattform, die man weiterempfiehlt, und einer, die man nur noch benutzt. Je größer du wirst, desto mehr trägt das.',
      requires: ['kommentar', 'gruppen'], requiresPurchase: [], requiresBuilding: null
    },
    api: {
      id: 'api', tab: 'entwicklung', phase: 3,
      name: 'Offene Schnittstelle', icon: 'share-2',
      durationSec: 300, server: 120000, cost: 60000,
      networkK: 0.40, whitePattern: true,
      effect: 'Andere Dienste docken an. Netzwerkeffekt wächst schneller.',
      effectFull: 'Andere Programme dürfen sich an deine Plattform anschließen: Kalender, Shops, Redaktionssysteme, kleine Werkzeuge, an die du nie gedacht hättest. Du hörst auf, eine Webseite zu sein, und wirst die Stelle, über die alles läuft. Das stärkste der drei Vertrauens-Features — und das teuerste.',
      requires: ['backend2', 'suche'], requiresPurchase: [], requiresBuilding: null
    },

    // ── Phase 3: KI-Reiter ──────────────────────────────────────────────
    // Eigener Reiter, sichtbar ab Phase 3. Hier steht alles, was mit
    // Metadaten und User-Modellen zu tun hat.
    //
    // ⚠️ ALLE Nodes hier setzen das KI-LABOR voraus (requiresBuilding), nicht
    // umgekehrt. Das Gebäude ist der Einstieg in Phase 3, nicht ihre
    // Belohnung: zuerst baut man das Labor, dann forscht man darin. Wer das
    // dreht, sperrt den Reiter hinter einem Gebäude, das man nur kaufen kann,
    // wenn man den Reiter schon durch hat.
    //
    // Zwei Ausbau-Hebel, beide multiplikativ:
    //   modelYieldMult — mehr Modelle je Zyklus (Watchtime → Modell)
    //   metadataMult   — mehr Metadaten je Modell (Modell → Metadaten)
    //
    // ── DIE KOSTENREGEL: € FÄLLT, METADATEN STEIGEN ───────────────────────
    // Je tiefer im Baum, desto mehr wird in Metadaten und desto weniger in
    // Euro bezahlt. Am deutlichsten bei den drei Dark Patterns: sie sind die
    // billigsten in Euro und die teuersten in Metadaten — man KAUFT sie
    // nicht, man FÖRDERT sie.
    //
    // Damit konkurrieren die Nodes direkt mit dem Targeting in der
    // Werbeagentur um dasselbe Lager ("Node oder drei Feed-Deals
    // personalisiert"). Genau diese Konkurrenz hält Metadaten am Leben,
    // wenn der Reiter einmal durch ist — Nodes allein wären ein Abfluss mit
    // Ende (phase3.md §3).
    //
    // Maßstab: bei 500k Usern und 10 % Abdeckung fließen ~3.125 Metadaten/s.
    // 150.000 ≈ 48 s · 400.000 ≈ 2 min · 1.200.000 ≈ 6 min.
    ki_speicher: {
      id: 'ki_speicher', tab: 'ki', phase: 3,
      name: 'Metadaten-Speicherung', icon: 'database',
      durationSec: 80, server: 4000, cost: 25000,
      metadataMult: 1.5,
      effect: 'Modelle liefern +50 % Metadaten.',
      effectFull: 'Bisher hast du nur gezählt, wie viele Leute da sind. Ab jetzt speicherst du, WAS sie tun: wann sie online sind, wie lange sie an einem Beitrag hängen, worauf sie klicken. Je mehr davon liegen bleibt, desto mehr wirft jedes Modell ab.',
      requires: [], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    ki_training: {
      id: 'ki_training', tab: 'ki', phase: 3,
      name: 'Trainings-Optimierung', icon: 'cpu',
      durationSec: 100, server: 5000, cost: 40000, metadata: 100000,
      modelYieldMult: 1.5,
      effect: 'Aus derselben Watchtime entstehen +50 % Modelle.',
      effectFull: 'Das Labor lernt, aus weniger Rohmaterial mehr herauszuholen: bessere Vorverarbeitung, weniger Ausschuss. Derselbe Watchtime-Einsatz, anderthalb mal so viele Modelle.',
      requires: ['ki_speicher'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    // ⚠️ Heißt „Fine Tuning", die ID bleibt aber ki_netz — genau wie die
    // Umwandlungsart 'netz' in state.js. Eine ID-Umbenennung bräuchte eine
    // Migration für laufende Umwandlungen und fertige Nodes; für einen
    // Anzeigenamen ist das der falsche Preis. Wer hier sucht: der Name steht
    // an zwei Stellen (hier und CONV_TYPES), die ID an keiner sichtbaren.
    ki_netz: {
      id: 'ki_netz', tab: 'ki', phase: 3,
      name: 'Fine Tuning', icon: 'sliders',
      durationSec: 120, server: 7000, cost: 35000, metadata: 250000,
      unlocks: 'Umwandlung: Fine Tuning (KI-Labor)',
      effect: 'Schaltet eine doppelt so effiziente Umwandlung frei.',
      effectFull: 'Statt jedes Modell bei null anzufangen, schleifst du ein vorhandenes auf deine User nach. Aus derselben Watchtime entstehen doppelt so viele Modelle — und weil es an einem Anteil deiner User arbeitet, wächst es mit der Plattform mit, statt eine feste Stückzahl zu liefern.',
      requires: ['ki_training'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    // ⚠️ Hier stand „KI-Agents" (60.000 € + 400.000 Metadaten). Die Node war
    // ein reiner Freischalter für die Moderation im Community Center — ein
    // Werkzeug, das nie gebaut wurde, in einem Gebäude, das es seit dem
    // 2026-08-09 nicht mehr gibt. Ohne beides tat sie schlicht nichts, deshalb
    // ersatzlos gestrichen. Sie war ein Blatt hinter Fine Tuning; am Rest des
    // KI-Reiters ändert sich dadurch nichts.
    ki_profile: {
      id: 'ki_profile', tab: 'ki', phase: 3,
      name: 'Profilbildung', icon: 'user-check',
      durationSec: 140, server: 9000, cost: 30000, metadata: 350000,
      metadataMult: 1.6, trendBase: -1.5, darkPattern: true,
      effect: 'Modelle liefern +60 % Metadaten. Trend dauerhaft −1,5.',
      effectFull: 'Die Modelle verknüpfen jetzt, was vorher getrennt lag: Standort, Freundeskreis, Uhrzeit, Kaufverhalten. Aus vielen kleinen Spuren wird ein Bild einer Person — und das war nie Teil der Abmachung mit deinen Usern. Der Rufschaden bleibt. Ohne diese Profile bleibt dir allerdings die gesamte personalisierte Werbung verschlossen.',
      requires: ['ki_training'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    // ── Die Aufmerksamkeits-Kette: +10 % → +10 % → +20 % ──────────────────
    // Zusammen ×1,452. Sie war vorher zwei Nodes mit ×1,75; jetzt sind es
    // drei flachere Stufen mit einem Dark Pattern in der MITTE statt nur am
    // Ende. Dadurch steht die Entscheidung früher an und kostet weniger auf
    // einmal — und der harmlose Empfehlungs-Algorithmus bleibt eine Node,
    // die man ohne schlechtes Gewissen nimmt.
    ki_empfehlung: {
      id: 'ki_empfehlung', tab: 'ki', phase: 3,
      name: 'Empfehlungs-Algorithmus', icon: 'target',
      durationSec: 120, server: 6000, cost: 50000, metadata: 150000,
      watchtimeMult: 1.10, trendBonus: 1,
      effect: 'Watchtime +10 %, Trend +1,0.',
      effectFull: 'Die Modelle wissen jetzt, was wen interessiert — und der Feed sortiert danach. Die meisten finden das erstmal gut: es ist ja wirklich passender.',
      requires: ['ki_speicher'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    ki_collab: {
      id: 'ki_collab', tab: 'ki', phase: 3,
      name: 'Collaborative Filtering', icon: 'git-merge',
      durationSec: 120, server: 8000, cost: 40000, metadata: 500000,
      watchtimeMult: 1.10, trendBase: -1, darkPattern: true,
      effect: 'Watchtime +10 %. Trend dauerhaft −1,0.',
      effectFull: 'Statt dich zu fragen, was dich interessiert, schaut der Algorithmus, was Leute wie du geklickt haben — und zeigt dir das. Er braucht dich nicht mehr zu verstehen, es reicht, dich einzusortieren. Deine User merken, dass ihnen jemand Dinge zeigt, die sie nie gesucht haben. Der Rufschaden bleibt.',
      requires: ['ki_empfehlung'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },
    ki_sog: {
      id: 'ki_sog', tab: 'ki', phase: 3,
      name: 'Aufmerksamkeits-Sog', icon: 'zap',
      durationSec: 160, server: 10000, cost: 35000, metadata: 1200000,
      watchtimeMult: 1.20, trendBase: -2, darkPattern: true,
      effect: 'Watchtime +20 %. Trend dauerhaft −2,0.',
      effectFull: 'Der Algorithmus sortiert nicht mehr nach „was interessiert dich", sondern nach „was hält dich am längsten hier". Das ist nicht dasselbe — und die Modelle wissen inzwischen genau, wo der Unterschied liegt. Der Rufschaden bleibt für immer.',
      requires: ['ki_collab'], requiresPurchase: [], requiresBuilding: 'kilabor'
    },

    // ── Energie & Wartung (Phase 3) ─────────────────────────────────────
    // Ein eigener, vom Rest LOSGELÖSTER Strang im Hauptbaum: er hängt an
    // nichts und nichts hängt an ihm. Das ist Absicht — die Serverkosten
    // laufen ab Phase 2 ohnehin, diese drei Nodes machen sie nur billiger und
    // bequemer. Wer sie ignoriert, spielt weiter; er zahlt nur mehr und klickt
    // öfter.
    //
    // Zusammen senken sie die Betriebskosten um 44 %:
    //   Effizientere Farmen  25 → 30 Zyklen je Zahlung   −17 %
    //   Erneuerbare Energien Tarif je 1.500 statt 1.000  −33 %
    //
    // ⚠️ Beide sind Auto-Picks — bei Massiv-Tarif sind −44 % mehrere Millionen
    // pro Sekunde, jeder Preis ist in Minuten wieder drin. Das ist in Ordnung
    // (die Kosten entscheiden nicht OB, sondern WANN, siehe Vertrauens-
    // Features), heißt aber: preise sie für den Phase-3-EINSTEIGER. Für den
    // Endspieler sind sie ohnehin gratis.
    en_zentral: {
      id: 'en_zentral', tab: 'entwicklung', phase: 3,
      name: 'Zentrale Energieverwaltung', icon: 'zap',
      durationSec: 120, server: 4000, cost: 30000,
      effect: 'Schaltet das Strom- & Wasserwerk im Shop frei.',
      effectFull: 'Bisher hängt jede Serverfarm an ihrer eigenen Zuleitung, und jede will einzeln versorgt werden. Eine zentrale Verwaltung legt Strom, Wasser und Wartungsverträge zusammen. Das Werk übernimmt danach alle großen Farmen ab Stufe 5 auf einen Klick — die kleinen bleiben Handarbeit.',
      unlocks: 'Gebäude: Strom- & Wasserwerk',
      requires: [], requiresPurchase: [], requiresBuilding: null
    },
    en_effizient: {
      id: 'en_effizient', tab: 'entwicklung', phase: 3,
      name: 'Effizientere Farmen', icon: 'trending-down',
      durationSec: 150, server: 6000, cost: 40000,
      effect: 'Eine Versorgung hält 30 statt 25 Zyklen — Betriebskosten −17 %.',
      effectFull: 'Bessere Luftführung, gedrosselte Nachtlast, Wartung nach Zustand statt nach Kalender. Eine Ladung Strom und Wasser trägt die Farmen dadurch fünf Zyklen weiter. Weniger Klicks, und je produzierter Watchtime rund ein Sechstel weniger Kosten.',
      requires: ['en_zentral'], requiresPurchase: [], requiresBuilding: 'energie'
    },
    en_erneuerbar: {
      id: 'en_erneuerbar', tab: 'entwicklung', phase: 3,
      name: 'Erneuerbare Energien', icon: 'sun',
      durationSec: 200, server: 10000, cost: 60000,
      trendBonus: 2,
      effect: 'Tarif gilt je 1.500 statt 1.000 Kapazität — Betriebskosten −33 %. Trend +2,0.',
      effectFull: 'Eigene Solarflächen auf den Hallendächern, Windstrom im Direktvertrag, und die Abwärme der Server heizt den Wasserkreislauf statt die Umgebung. Der Tarif rechnet ab jetzt je 1.500 Kapazität statt je 1.000 — ein Drittel weniger, dauerhaft. Und deine User finden es gut, dass ihre Plattform nicht mehr Strom frisst als eine Kleinstadt.',
      requires: ['en_zentral'], requiresPurchase: [], requiresBuilding: 'energie'
    },

    // ── Marketing (nach Go-Live) ────────────────────────────────────────
    mk_freunde: {
      id: 'mk_freunde', tab: 'marketing', phase: 1, name: 'Freunden erzählen', icon: 'users',
      durationSec: 5, server: 0, cost: 0,
      effect: '+200 User (einmalig).',
      effectFull: 'Du erzählst deinen Freunden von der Plattform. Ein kleiner, aber sicherer Boost.',
      usersBonus: 200,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true
    },
    mk_flyer: {
      id: 'mk_flyer', tab: 'marketing', phase: 1, name: 'Flyer verteilen', icon: 'file-text',
      durationSec: 5, server: 0, cost: 20,
      effect: '+600 User + Flyerbonus: alle 8 s ×1,10 (bis 1 000).',
      effectFull: 'Du verteilst Flyer im Kiez. +600 User sofort — und danach der Flyerbonus: alle 8 Sekunden wachsen die aktuellen User um 10 % (Zinseszins), bis du die Marke von 1 000 knackst.',
      usersBonus: 600,
      activatesFlyerBonus: true,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true
    },

    // ── Phase 2: Marketing ──────────────────────────────────────────────
    // Diese Nodes bauen keine Features, sondern schalten Kampagnen im
    // Marketing-Center frei (CAMPAIGNS.unlockedBy in state.js) — dieselbe
    // Bauart wie der Werbung-Reiter. Deshalb geben sie BEWUSST KEINEN
    // trendBonus: Trend gibt es für gebaute Features, und die stehen im
    // Entwicklung-Reiter. Hier wird nur freigeschaltet.
    //
    // Server kosten sie trotzdem — auch eine Kampagnen-Infrastruktur läuft
    // auf den Farmen, und das hält den Reiter am Farm-Loop hängen.
    //
    // Zwei Zweige, die sich im Partner-Programm wieder zusammenführen, plus
    // zwei Cross-Abhängigkeiten in den Hauptbaum. Die sind thematisch, nicht
    // dekorativ:
    //   Hype-Burst       braucht die Teilen-Funktion (ein Hype verbreitet sich)
    //   Partner-Programm braucht Unternehmensprofile — wer Partner bezahlen
    //                    will, braucht sie erst einmal als offizielle
    //                    Gegenstelle.
    //
    // ⚠️ DIE INFRASTRUKTUR-BREMSE IST AM 2026-08-07 EINEN NODE NACH HINTEN
    // GERÜCKT. Vorher hing schon die VERIFIZIERUNGSSTELLE an `unternehmen` und
    // damit die gesamte Anziehungskraft-Achse an backend2 → gruppen + suche →
    // unternehmen: 24.000 € und 3.600 Server Umweg, bevor der Spieler die
    // erste positive Trend-Quelle überhaupt sehen konnte. Anziehungskraft ist
    // die EINZIGE wiederholbare positive Trend-Quelle (CLAUDE.md §8) — solange
    // sie fehlt, ist der Trend eine Einbahnstraße: Grundinteresse verebbt,
    // Werbedeals drücken, und es gibt nichts dagegenzuhalten. Im Test war
    // genau dieses Fenster zu lang.
    //
    // Jetzt liegt die Verifizierungsstelle flach (nur mk_langzeit) und bringt
    // die GRUNDLAST-Kampagne mit; das Partner-Programm trägt die Infrastruktur-
    // Voraussetzung und die Spitzenlast. Die Aussage „Anziehungskraft ohne
    // Plattform-Infrastruktur wäre unehrlich" bleibt damit erhalten, sie
    // greift nur eine Stufe später.
    //
    // Der Knopf, falls das Fenster immer noch zu lang ist, sind die Kosten von
    // mk_presse — nicht die Struktur der Kette.
    mk_langzeit: {
      id: 'mk_langzeit', tab: 'marketing', phase: 2,
      name: 'Langzeit-Kampagnen', icon: 'calendar',
      durationSec: 40, server: 300, cost: 2000,
      effect: 'Schaltet die Kampagne Empfehlungs-Welle frei.',
      effectFull: 'Dein Team lernt, Kampagnen über längere Zeiträume zu planen statt jeden Tag neu loszurennen. Die Empfehlungs-Welle läuft dadurch viermal so lange wie eine Stadtaktion. Sie ist nicht billiger je User — sie ist ruhiger.',
      unlocks: 'Kampagne: Empfehlungs-Welle',
      requires: ['mk_freunde'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },
    mk_sprint: {
      id: 'mk_sprint', tab: 'marketing', phase: 2,
      name: 'Sprint-Kampagnen', icon: 'zap',
      durationSec: 60, server: 800, cost: 8000,
      effect: 'Schaltet die Kampagne Hype-Burst frei. Braucht die Teilen-Funktion.',
      effectFull: 'Kurze, laute Aktionen mit maximaler Reichweite — möglich erst, seit deine User Beiträge weiterteilen können. Der Hype-Burst bringt 20.000 User am Stück und läuft danach zweieinhalb Minuten ohne dein Zutun. Der teuerste Kurs im Spiel, dafür der mit Abstand geringste Klick-Aufwand.',
      unlocks: 'Kampagne: Hype-Burst',
      requires: ['mk_flyer', 'teilen'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },
    mk_presse: {
      id: 'mk_presse', tab: 'marketing', phase: 2,
      name: 'Verifizierungsstelle', icon: 'mic',
      durationSec: 60, server: 800, cost: 10000,
      effect: 'Schaltet die Anziehungskraft-Kampagne Verifizierte Marken-Profile frei.',
      effectFull: 'Eine offizielle Anlaufstelle für Presse und Öffentlichkeit: Pressemitteilungen, ein Postfach für Anfragen — und ein Verfahren, mit dem sich Marken bei dir bestätigen lassen können. Ab jetzt kannst du Verifizierte Marken-Profile buchen: die erste Möglichkeit, den Trend mit Geld zurückzukaufen, statt ihn nur zu verkaufen. Fünf Minuten Grundlast zum besten Kurs im ganzen Bereich. Dazu öffnet sich dein erster Kampagnenplatz — so viele Anziehungskraft-Kampagnen darf deine Plattform gleichzeitig laufen lassen, egal wie viele Marketing-Center du baust.',
      unlocks: 'Anziehungskraft-Kampagne: Verifizierte Marken-Profile · Kampagnenplatz 1',
      requires: ['mk_langzeit'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },
    mk_partner: {
      id: 'mk_partner', tab: 'marketing', phase: 2,
      name: 'Partner-Programm', icon: 'link',
      durationSec: 100, server: 1200, cost: 20000,
      effect: 'Schaltet die Anziehungskraft-Kampagne Creator-Beteiligung frei. Braucht Unternehmensprofile.',
      effectFull: 'Ein eigenes Programm für die Leute, die auf deiner Plattform veröffentlichen: Verträge, Betreuung, ein Anteil an dem, was sie einbringen. Möglich wird das erst mit den Unternehmensprofilen — wer Creator bezahlen will, braucht sie erst einmal als offizielle Gegenstelle. Wie hoch du beteiligst, entscheidest du bei jeder Buchung selbst — von sehr niedrig bis sehr hoch, und bei voller Beteiligung mit dem dreifachen Ausschlag der Marken-Profile, dafür nur eine Minute lang. Mit dem zweiten Kampagnenplatz laufen beide ab jetzt nebeneinander statt gegeneinander.',
      unlocks: 'Anziehungskraft-Kampagne: Creator-Beteiligung · +1 Kampagnenplatz',
      requires: ['mk_presse', 'mk_sprint', 'unternehmen'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },
    // ── Reine Platz-Nodes ─────────────────────────────────────────────────
    // Die einzigen Nodes im Spiel, die weder ein Feature bauen noch etwas
    // freischalten, sondern nur eine PARALLELITÄT erhöhen — das Gegenstück zum
    // Bürogebäude, nur für Anziehungskraft-Kampagnen statt für Entwicklung.
    //
    // ⚠️ Sie sind bewusst billig. Der Platz selbst kostet fast nichts, weil er
    // ohne laufende Kampagne wertlos ist: bezahlt wird er im Betrieb (ein
    // Dauer-Influencer sind 667 €/s, für immer). Das ist der Unterschied zum
    // Bürogebäude, wo der Platz nach dem Kauf gratis arbeitet und der Preis
    // deshalb die einzige Bremse ist (CLAUDE.md §9).
    //
    // ⚠️ Wer hier an den Kosten dreht, verschiebt nur den Zeitpunkt. Die
    // eigentliche Balance-Frage ist die ANZAHL — sie ist die Trend-Obergrenze
    // der Anziehungskraft-Kampagnen (PR_SLOT_NODES in js/state.js).
    mk_team: {
      id: 'mk_team', tab: 'marketing', phase: 2,
      name: 'Kampagnen-Team aufstocken', icon: 'user-plus',
      durationSec: 30, server: 600, cost: 6000,
      effect: 'Ein Kampagnenplatz mehr — eine Anziehungskraft-Kampagne zusätzlich gleichzeitig.',
      effectFull: 'Bisher macht eine Handvoll Leute die gesamte Öffentlichkeitsarbeit, und mehr als zwei Sachen gleichzeitig gehen nicht. Mit ein paar zusätzlichen Stellen läuft eine dritte Anziehungskraft-Kampagne parallel. Der Platz selbst kostet wenig — teuer sind die Kampagnen, die darauf laufen.',
      unlocks: '+1 Kampagnenplatz',
      requires: ['mk_partner'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },

    // ── Werbung (nach Go-Live) ──────────────────────────────────────────
    wb_coop: {
      id: 'wb_coop', tab: 'werbung', phase: 1, name: 'Erste Kooperation', icon: 'briefcase',
      durationSec: 30, server: 0, cost: 0,
      effect: 'Läuft 30 s, dann +300 €. Braucht ≥ 200 User.',
      effectFull: 'Ein lokaler Laden bucht bei dir eine kleine Werbekooperation. Nach 30 Sekunden bekommst du 300 €.',
      moneyBonus: 300,
      requires: [], requiresPurchase: [], requiresBuilding: null,
      requiresGoLive: true,
      requiresUsers: 200
    },

    // ── Phase 2: Werbung ────────────────────────────────────────────────
    // Diese Nodes bauen keine Features, sondern schalten Werbearten in der
    // Agentur frei (AD_TYPES.unlockedBy in state.js). Ohne sie bleibt es beim
    // Banner — der billigsten und trend-teuersten Art.
    wb_display: {
      id: 'wb_display', tab: 'werbung', phase: 2, name: 'Feed-Werbefläche', icon: 'layout',
      durationSec: 40, server: 300, cost: 3000,
      effect: 'Schaltet die Werbeart Feed-Werbung frei.',
      effectFull: 'Du baust die technische Infrastruktur für bezahlte Anzeigen mitten im Feed. Feed-Werbung holt aus derselben Watchtime doppelt so viel Geld wie ein Banner — und schadet dem Trend deutlich weniger.',
      unlocks: 'Werbeart: Feed-Werbung',
      requires: ['wb_coop'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },
    wb_search: {
      id: 'wb_search', tab: 'werbung', phase: 2, name: 'Search-Ad-System', icon: 'search',
      durationSec: 80, server: 1000, cost: 8000,
      effect: 'Schaltet die Werbeart Search-Ad frei. Braucht die Suchfunktion.',
      effectFull: 'Bezahlte Anzeigen in den Suchergebnissen. User sehen Werbung genau dann, wenn sie ohnehin nach etwas suchen — das nervt weniger als Feed-Werbung und schont deshalb den Trend.',
      unlocks: 'Werbeart: Search-Ad',
      requires: ['wb_display', 'suche'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },
    wb_video: {
      id: 'wb_video', tab: 'werbung', phase: 2, name: 'Video-Ad-Integration', icon: 'film',
      durationSec: 60, server: 3000, cost: 20000,
      effect: 'Schaltet die Werbeart Werbevideo frei. Braucht Videos.',
      effectFull: 'Werbung vor und mitten in Videos. Frisst enorm viel Watchtime, ist dafür aber die trend-schonendste Art überhaupt — der Deal fürs Spätspiel, wenn die Farmen ins Absurde skalieren.',
      unlocks: 'Werbeart: Werbevideo',
      requires: ['wb_display', 'videos'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },

    // Die Volumen-Brücke. Sie steht in Phase 2, weil genau hier die längste
    // Durststrecke des Spiels liegt: der Verbrauch eines Deals ist eine feste
    // Zahl, die Produktion wächst mit den Usern — ab ~600.000 Usern kommt
    // keine bezahlbare Zahl von Agenturen mehr hinterher, und aufgelöst wurde
    // das bisher erst vom Ad-Server tief in Phase 3.
    //
    // ⚠️ Sie ist eine STUFE, kein globaler Multiplikator. Als globaler Faktor
    // läge das ×4 nach dem Forschen auf jedem Deal an, und eine kleine
    // Plattform könnte gar keinen mehr durchhalten (Video bräuchte 1,6 Mio
    // Watchtime je Zyklus). Als Stufe ist es eine Wahl je Buchung — und sie
    // gattet sich selbst, weil man die vierfache Menge im Lager haben muss.
    wb_adopt: {
      id: 'wb_adopt', tab: 'werbung', phase: 2, name: 'Anzeigen-Optimierung', icon: 'edit-3',
      durationSec: 80, server: 2000, cost: 12000,
      unlocks: 'Volumen-Stufe „fest ×4"',
      effect: 'Ein Deal liefert wahlweise die vierfache Menge aus — vierfaches Geld bei unverändertem Trend-Malus.',
      effectFull: 'Deine Anzeigen werden laufend gegeneinander getestet: welches Bild, welcher Satz, welche Farbe. Was nicht funktioniert, fliegt raus. Was übrig bleibt, ist gut genug, dass du das Vierfache davon ausspielen kannst, ohne dass es mehr nervt — dieselbe Buchung frisst dann viermal so viel Watchtime und bringt viermal so viel Geld, zum selben Preis in Trend. Du brauchst die Menge allerdings im Lager, sonst bricht der Deal ab.',
      requires: ['wb_display'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },

    // ── Phase 3: Werbung ────────────────────────────────────────────────
    // Hier wohnt die Infrastruktur des Metadaten-Abflusses. Die Trennung zum
    // KI-Reiter ist die lesbare Fassung des Kreislaufs: der KI-Reiter MACHT
    // Daten, der Werbung-Reiter GIBT SIE AUS.
    //
    // Zwei Werkzeuge gegen zwei verschiedene Wände (phase3.md §2):
    //   Targeting — greift die TREND-Wand an. Mehr Geld je Deal heißt weniger
    //               Deals für dasselbe Geld heißt weniger Rufschaden. Das
    //               einzige Werkzeug im Spiel, das € je Trend-Punkt hebt.
    //   Anteil    — greift die WACHSTUMS-Wand an. Der Verbrauch skaliert
    //               endlich mit der Plattform mit, statt eine feste Zahl zu
    //               bleiben, die jede Farm irgendwann überholt.
    //
    // ⚠️ Beide hängen direkt an der Feed-Werbefläche und nicht mehr
    // aneinander. Vorher lag der Ad-Server hinter dem Retargeting und damit
    // hinter der ganzen Kette ki_speicher → ki_training → ki_profile — der
    // Anteils-Kurs war nur über ein Dark Pattern und die vollen Retargeting-
    // Metadaten erreichbar. Als Geschwister ist es eine Wahl.
    //
    // ⚠️ Retargeting ist mit 500.000 die teuerste Node des Reiters — mehr als
    // die beiden Anteils-Stufen zusammen. Es ist das einzige Werkzeug im Spiel,
    // das € je Trend-Punkt hebt, und es zahlt DANACH weiter in Metadaten
    // (TARGETING_META_PER_WT je Zyklus). Der Einstiegspreis ist damit die
    // Entscheidung, ob die Abdeckung diesen Dauerabfluss überhaupt trägt.
    wb_retarget: {
      id: 'wb_retarget', tab: 'werbung', phase: 3, name: 'Retargeting', icon: 'crosshair',
      durationSec: 100, server: 4000, cost: 40000, metadata: 500000,
      unlocks: 'Personalisierte Werbedeals',
      effect: 'Schaltet den Targeting-Schalter in der Werbeagentur frei. Braucht Profilbildung.',
      effectFull: 'Du zeigst Werbung nicht mehr allen, sondern denen, bei denen sie wirkt — dieselbe Anzeige bringt dadurch das Zweieinhalbfache. Möglich wird das erst mit der Profilbildung: ohne ein Bild der einzelnen Person gibt es niemanden, den man wiedererkennen könnte. Personalisierte Deals kosten Metadaten je Zyklus, dafür keinen zusätzlichen Trend.',
      requires: ['wb_display', 'ki_profile'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },
    // Die beiden Anteils-Stufen. Ihre Kosten stehen bewusst steil (200k →
    // 400k Metadaten): die höhere Stufe ist Tempo beim Abbau eines vollen
    // Lagers, kein besserer Kurs, und soll sich nicht nebenbei mitnehmen
    // lassen.
    //
    // ⚠️ Die Abhängigkeit auf infiniteScroll ist die beste thematische im
    // Entwurf und keine Deko: vielfaches Werbevolumen setzt vielfachen
    // Werbeplatz voraus, und endlosen Werbeplatz gibt es nur mit endlosem Feed.
    wb_adserver: {
      id: 'wb_adserver', tab: 'werbung', phase: 3, name: 'Ad-Server', icon: 'server',
      durationSec: 100, server: 4000, cost: 40000, metadata: 200000,
      unlocks: 'Werbung nach Anteil buchen',
      effect: 'Ein Deal frisst einen Anteil deines Lagers statt einer festen Menge. Braucht den Infiniten Scroll.',
      effectFull: 'Eine eigene Maschine, die Anzeigen ausliefert, statt sie einzeln einzubuchen — und die sich nimmt, was da ist, statt eine feste Stückzahl. Ab hier wächst deine Werbung mit der Plattform mit: je größer dein Watchtime-Lager, desto größer der Deal, bei unverändertem Trend-Schaden. Möglich wird das erst durch den endlosen Feed, denn mehr Werbung braucht mehr Werbeplatz.',
      requires: ['wb_display', 'infiniteScroll'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },
    wb_programmatic: {
      id: 'wb_programmatic', tab: 'werbung', phase: 3, name: 'Programmatic Advertising', icon: 'cpu',
      durationSec: 120, server: 6000, cost: 60000, metadata: 400000,
      unlocks: 'Anteil ×3',
      effect: 'Dreifacher Anteil je Zyklus — und dreifacher Trend-Malus.',
      effectFull: 'Werbeplätze werden nicht mehr verhandelt, sondern automatisch zugeteilt — Software gegen Software, ohne dass ein Mensch den einzelnen Platz je sieht. Die höchste Stufe leert dein Lager am schnellsten, bringt dir auf Dauer aber nicht mehr Geld, sondern dasselbe Geld schneller: im Dauerbetrieb bleibt die kleine Anteils-Stufe die günstigere, weil sie dasselbe verdient und ein Drittel Trend kostet.',
      requires: ['wb_adserver'], requiresPurchase: [], requiresBuilding: 'werbe',
      requiresGoLive: true
    },

    // ── Phase 3: Marketing ──────────────────────────────────────────────
    // Der Reiter hatte ab Phase 3 nichts mehr anzubieten: seine drei
    // Reichweiten-Kampagnen liefern ABSOLUTE Zahlen und werden mit wachsender
    // Plattform zwangsläufig zum Rundungsfehler (CLAUDE.md §7.1). Die
    // Zielgruppen-Offensive ist die prozentuale Antwort darauf — und
    // gleichzeitig der zweite wiederholbare Metadaten-Abfluss neben dem
    // Targeting. Beide ziehen aus demselben Lager, das ist die Entscheidung.
    mk_analyse: {
      id: 'mk_analyse', tab: 'marketing', phase: 3, name: 'Marktanalyse', icon: 'pie-chart',
      durationSec: 100, server: 3000, cost: 45000, metadata: 200000,
      unlocks: 'Anziehungskraft-Kampagne: Zielgruppen-Offensive · +1 Kampagnenplatz',
      effect: 'Schaltet die Zielgruppen-Offensive frei — die stärkste Anziehungskraft-Kampagne je Platz — und einen Kampagnenplatz mehr. Braucht Profilbildung.',
      effectFull: 'Deine eigenen Daten sagen dir, wen es da draußen noch gibt: welche Gruppen fehlen, worauf sie ansprechen, wo man sie erreicht. Die Zielgruppen-Offensive hebt den Trend um +4,0 und damit stärker als jede andere — bezahlt fast ausschließlich mit Metadaten, die sonst ins Targeting deiner Werbedeals geflossen wären. Der Preis wächst mit deiner Plattform mit, wie oft du sie fahren kannst hängt deshalb an deiner Abdeckung, nicht an deiner Größe. Dazu kommt ein dritter Kampagnenplatz: ab jetzt laufen drei Anziehungskraft-Kampagnen gleichzeitig.',
      requires: ['mk_partner', 'ki_profile'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },
    // Der zweite reine Platz-Node, siehe mk_team. Kostet zusätzlich Metadaten:
    // ein Monitoring liest aus den eigenen Daten, also aus demselben Strom, aus
    // dem auch Targeting und Zielgruppen-Offensive ziehen. Anders als dort ist
    // es eine EINMALIGE Zahlung — der Platz läuft danach kostenlos weiter.
    mk_monitoring: {
      id: 'mk_monitoring', tab: 'marketing', phase: 3,
      name: 'Trend-Monitoring', icon: 'activity',
      durationSec: 30, server: 2000, cost: 25000, metadata: 250000,
      effect: 'Ein Kampagnenplatz mehr. Kostet einmalig Metadaten.',
      effectFull: 'Ein System, das laufend mitliest, welche Themen auf deiner Plattform gerade hochkommen — aus deinen eigenen Daten. Dein Kampagnen-Team muss dadurch nicht mehr raten, welche Kampagne wann sinnvoll ist, und kann eine weitere parallel fahren. Die Metadaten sind einmalig fällig; der Platz arbeitet danach umsonst.',
      unlocks: '+1 Kampagnenplatz',
      requires: ['mk_team', 'mk_analyse'], requiresPurchase: [], requiresBuilding: 'marketing',
      requiresGoLive: true
    },

    // ── Phase 3: Hauptbaum ──────────────────────────────────────────────
    // Der Unterschied zum KI-Reiter: dort stehen ALGORITHMEN (globale
    // Multiplikatoren), hier FEATURES, die man auf der Plattform sehen würde.
    //
    // Beide geben deutlich weniger Trend als die Phase-2-Nodes des
    // Hauptbaums (+1,0 / +2,0 gegen bis zu +12,0). Das ist Absicht: der
    // positive Trend der Phase 3 kommt aus dem Netzwerkeffekt und den
    // Kampagnenplätzen, nicht mehr aus dem Feature-Baum.
    kurzvideos: {
      id: 'kurzvideos', tab: 'entwicklung', phase: 3, name: 'Kurzvideos', icon: 'smartphone',
      durationSec: 140, server: 10000, cost: 45000, metadata: 250000,
      watchtimeMult: 1.30, trendBonus: 1,
      effect: 'Watchtime +30 %, Trend +1,0.',
      effectFull: 'Videos von wenigen Sekunden, senkrecht, eines nach dem anderen. Das Format lebt vom Algorithmus: bei zehn Sekunden Länge entscheidet nicht mehr, was jemand sucht, sondern was ihm als Nächstes vorgelegt wird. Ohne den Empfehlungs-Algorithmus wäre es nur eine kürzere Videoseite.',
      requires: ['videos', 'ki_empfehlung'], requiresPurchase: [], requiresBuilding: null
    },
    // Die einzige Node im ganzen Phase-3-Entwurf, in der Daten etwas tun, das
    // die User MÖGEN. Sie hängt deshalb bewusst an ki_speicher und NICHT an
    // der Profilbildung — hinter einem Dark Pattern wäre das Gegenbeispiel
    // keins mehr, und Phase 3 hieße „Daten sind Werbung und Dark Patterns".
    freundevorschlag: {
      id: 'freundevorschlag', tab: 'entwicklung', phase: 3,
      name: 'Freundschaftsvorschläge', icon: 'user-plus',
      durationSec: 120, server: 6000, cost: 35000, metadata: 150000,
      watchtimeMult: 1.10, trendBonus: 2,
      effect: 'Watchtime +10 %, Trend +2,0.',
      effectFull: '„Kennst du vielleicht …" — aus gemeinsamen Kontakten, Gruppen und Orten schlägt die Plattform Leute vor, die man wirklich kennt. Deine User finden alte Bekannte wieder und erzählen davon. Dieselbe Datenauswertung, die anderswo Werbung verkauft, macht hier schlicht das Produkt besser.',
      requires: ['dm', 'ki_speicher'], requiresPurchase: [], requiresBuilding: null
    },
    // ⚠️ Diese Node hing bis zum 2026-08-09 am Community Center und stand im
    // Entwicklung-Reiter. Mit dem Gebäude ist sie in den Marketing-Reiter
    // gewandert, weil sie jetzt auf die Creator-Beteiligung wirkt — die
    // Kampagne, die die Umsatzbeteiligung des CC ersetzt hat.
    //
    // Sie macht die Kampagne nicht STÄRKER, sondern BILLIGER: die Creator
    // bekommen weiter den vollen Betrag, die Trend-Wirkung bleibt exakt gleich,
    // nur die Netto-Kosten sinken (148 → 118 €/Trend-Sekunde am Reglerende).
    //
    // ⚠️ KEIN Metadaten-Preis: der anständige Weg kommt ohne den Datenweg aus.
    // Das ist die Währungstrennung aus phase3.md §2.
    //
    // liveStreaming als Voraussetzung, weil Creator dort entstehen, wo man
    // senden kann — das war schon die Begründung zum CC und gilt unverändert.
    marketplace: {
      id: 'marketplace', tab: 'marketing', phase: 3, name: 'Marktplatz', icon: 'shopping-bag',
      durationSec: 120, server: 6000, cost: 40000,
      effect: 'Provision auf die Creator-Beteiligung — bis 20 %, abhängig vom Trend.',
      effectFull: 'Deine Creator verkaufen direkt an ihr Publikum: Merch, Vorlagen, Zugänge. Die Plattform behält eine Provision, die einen Teil der Creator-Beteiligung wieder hereinholt. Wie viel dabei herauskommt, hängt am Trend — auf einer Plattform, die niemand mag, kauft auch niemand etwas. Die Creator bekommen weiterhin den vollen Betrag; billiger wird es nur für dich.',
      unlocks: 'Provision auf die Creator-Beteiligung',
      requires: ['mk_partner', 'liveStreaming'], requiresPurchase: [],
      requiresBuilding: 'marketing', requiresGoLive: true
    }
  };

  var NODE_ORDER = ['frontend1', 'backend1', 'account', 'feed', 'bilder'];

  // Spaltenzuordnung fürs Layout. Nodes, deren Phase noch nicht erreicht ist,
  // werden beim Rendern rausgefiltert — Spalten die dadurch leer werden,
  // fallen komplett weg. In Phase 0/1 bleibt so exakt das alte 3-Spalten-Bild.
  //
  // ⚠️ Eine Node gehört IMMER rechts von allen ihren requires. Steht sie in
  // derselben Spalte wie ein Vorgänger, zieht drawConnections eine vertikale
  // Kurve, die hinter den Karten dazwischen verschwindet — die Linie sieht
  // dann aus, als liefe sie ins Leere. Genau das war bei polls der Fall
  // (hing an kommentar, stand aber daneben statt dahinter).
  var COLS = [
    // en_zentral hängt an nichts (siehe EDGES) und darf deshalb ganz vorn
    // stehen — die ersten beiden Spalten hatten sonst viel Leerraum.
    ['frontend1', 'backend1', 'en_zentral'],
    ['account', 'frontend2', 'backend2', 'en_effizient', 'en_erneuerbar'],
    ['feed', 'bilder', 'logoNeu', 'barrierefrei', 'dm', 'gruppen', 'suche', 'videos'],
    ['like', 'kommentar', 'teilen', 'events', 'unternehmen', 'stories', 'liveStreaming'],
    ['polls', 'infiniteScroll', 'pushNotifications', 'gamification', 'autoplay',
     '@ki_speicher', '@ki_empfehlung'],
    // Die beiden Phase-3-Vertrauens-Features stehen bewusst neben den anderen
    // Phase-3-Nodes und nicht bei den Dark Patterns: sie sind kein Gegenstück
    // zu einer einzelnen Node, sondern eine eigene Achse.
    ['freundevorschlag', 'kurzvideos', 'moderation', 'api']
  ];

  // Kanten für die SVG-Verbindungslinien. Kanten mit unsichtbarem Endpunkt
  // überspringt drawConnections von selbst.
  var EDGES = [
    { from: 'frontend1', to: 'account'   },
    { from: 'backend1',  to: 'account'   },
    { from: 'account',   to: 'feed'      },
    { from: 'account',   to: 'bilder'    },
    { from: 'frontend1', to: 'frontend2' },
    { from: 'backend1',  to: 'backend2'  },
    { from: 'frontend2', to: 'logoNeu'   },
    { from: 'feed',      to: 'like'      },
    { from: 'feed',      to: 'kommentar' },
    { from: 'feed',      to: 'teilen'    },
    { from: 'backend2',  to: 'dm'        },
    { from: 'backend2',  to: 'gruppen'   },
    { from: 'backend2',  to: 'suche'     },
    { from: 'backend2',  to: 'videos'    },
    { from: 'kommentar', to: 'polls'     },
    { from: 'gruppen',   to: 'events'    },
    { from: 'gruppen',   to: 'unternehmen' },
    { from: 'suche',     to: 'unternehmen' },
    // Watchtime-Achse
    { from: 'videos',    to: 'stories'            },
    { from: 'videos',    to: 'liveStreaming'      },
    { from: 'stories',   to: 'autoplay'           },
    { from: 'stories',   to: 'infiniteScroll'     },
    { from: 'like',      to: 'pushNotifications'  },
    { from: 'dm',        to: 'pushNotifications'  },
    { from: 'gruppen',   to: 'gamification'       },
    // Vertrauens-Features (White Patterns)
    { from: 'frontend2', to: 'barrierefrei' },
    { from: 'kommentar', to: 'moderation'   },
    { from: 'gruppen',   to: 'moderation'   },
    { from: 'backend2',  to: 'api'          },
    { from: 'suche',     to: 'api'          },
    // Phase 3 — beide Features setzen Arbeit aus dem KI-Reiter voraus.
    { from: 'videos',         to: 'kurzvideos'       },
    { from: '@ki_empfehlung', to: 'kurzvideos'       },
    { from: 'dm',             to: 'freundevorschlag' },
    { from: '@ki_speicher',   to: 'freundevorschlag' },
    // Energie & Wartung — ein eigener Strang ohne Anschluss an den Rest.
    { from: 'en_zentral',     to: 'en_effizient'     },
    { from: 'en_zentral',     to: 'en_erneuerbar'    }
  ];

  // Der Marketing-Reiter ab Phase 2: zwei Zweige aus den beiden Phase-1-
  // Wurzeln, die sich im Partner-Programm wieder zusammenfinden.
  //
  // Zwei Voraussetzungen kommen aus dem Hauptbaum: teilen → mk_sprint und
  // unternehmen → mk_partner. Ihre Startpunkte liegen in einem anderen Reiter,
  // es gäbe hier also nichts zu zeichnen — die Karte hing dadurch sichtbar in
  // der Luft. Sie stehen deshalb als GEIST-KARTE (@-Präfix) im Layout: eine
  // flache Karte, die den Status des echten Nodes spiegelt und per Klick
  // dorthin springt. drawConnections braucht dafür keine Sonderbehandlung —
  // die Geist-Karte trägt ein ganz normales data-id.
  var MARKETING_COLS = [
    ['mk_freunde', 'mk_flyer', '@teilen'],
    ['mk_langzeit', 'mk_sprint'],
    // @unternehmen steht direkt VOR mk_partner statt eine Spalte früher: die
    // Geist-Karte gehört neben den Node, der sie braucht, sonst wird ihre Kante
    // zur langen (gestrichelten) Verbindung, die sich einen Korridor suchen muss.
    ['mk_presse', '@unternehmen'],
    // @liveStreaming steht wie @unternehmen direkt vor der Node, die es
    // braucht (marketplace) — sonst würde seine Kante zur langen, gestrichelten
    // Verbindung, die sich erst einen Korridor suchen muss.
    ['mk_partner', '@ki_profile', '@liveStreaming'],
    // mk_team, mk_analyse und marketplace hängen alle direkt an mk_partner und
    // stehen deshalb in derselben Spalte — mk_monitoring braucht zwei davon und
    // muss eine Spalte weiter rechts (sonst verschwindet seine Linie hinter den
    // Karten, siehe CLAUDE.md §9 zur Baum-Ansicht).
    ['mk_analyse', 'mk_team', 'marketplace'],
    ['mk_monitoring']
  ];
  var MARKETING_EDGES = [
    { from: 'mk_freunde',   to: 'mk_langzeit' },
    { from: 'mk_flyer',     to: 'mk_sprint'   },
    { from: '@teilen',      to: 'mk_sprint'   },
    { from: 'mk_langzeit',  to: 'mk_presse'   },
    { from: 'mk_presse',    to: 'mk_partner'  },
    { from: 'mk_sprint',    to: 'mk_partner'  },
    { from: '@unternehmen', to: 'mk_partner'  },
    { from: 'mk_partner',   to: 'mk_team'     },
    // Phase 3
    { from: 'mk_partner',   to: 'mk_analyse'  },
    { from: '@ki_profile',  to: 'mk_analyse'  },
    { from: 'mk_partner',     to: 'marketplace' },
    { from: '@liveStreaming', to: 'marketplace' },
    { from: 'mk_team',      to: 'mk_monitoring' },
    { from: 'mk_analyse',   to: 'mk_monitoring' }
  ];

  // Der Werbung-Reiter bekommt ab Phase 2 einen eigenen kleinen Baum.
  // suche → wb_search und videos → wb_video laufen genauso über Geist-Karten.
  //
  // Alles hinter der Feed-Werbefläche steht NEBENEINANDER statt hintereinander:
  // Anzeigen-Optimierung (Phase 2, Volumen-Brücke), Retargeting (Trend-Wand)
  // und Ad-Server (Wachstums-Wand) sind drei Geschwister aus einer Wurzel.
  // Vorher war das eine Kette, in der der Ad-Server hinter dem Retargeting und
  // damit hinter der halben KI-Achse lag — ein Schlauch ohne Wahl.
  //
  // ⚠️ Die drei Kanten aus wb_display in Spalte 4 sind lang und teilen sich
  // nach der Routing-Regel „ein Strang je Quelle" einen Kanal. Die Geister für
  // Spalte 4 müssen deshalb in Spalte 3 stehen — eine Node gehört immer in
  // eine Spalte rechts von ALLEN ihren requires.
  var WERBUNG_COLS = [
    ['wb_coop'],
    ['wb_display', '@suche', '@videos'],
    ['wb_search', 'wb_video', '@ki_profile', '@infiniteScroll'],
    ['wb_adopt', 'wb_retarget', 'wb_adserver'],
    ['wb_programmatic']
  ];
  var WERBUNG_EDGES = [
    { from: 'wb_coop',    to: 'wb_display' },
    { from: 'wb_display', to: 'wb_search'  },
    { from: '@suche',     to: 'wb_search'  },
    { from: 'wb_display', to: 'wb_video'   },
    { from: '@videos',    to: 'wb_video'   },
    { from: 'wb_display', to: 'wb_adopt'   },
    // Phase 3
    { from: 'wb_display',      to: 'wb_retarget'     },
    { from: '@ki_profile',     to: 'wb_retarget'     },
    { from: 'wb_display',      to: 'wb_adserver'     },
    { from: '@infiniteScroll', to: 'wb_adserver'     },
    { from: 'wb_adserver',     to: 'wb_programmatic' }
  ];

  // Der KI-Reiter ab Phase 3. Zwei Zweige aus der Metadaten-Speicherung:
  // links die Daten-Achse (mehr Modelle, mehr Metadaten), rechts die
  // Watchtime-Achse (mehr Nachschub für die Umwandlung). Beide enden in einem
  // Dark Pattern — die Entscheidung am Ende jedes Zweigs ist dieselbe Frage
  // in zwei Währungen.
  //
  // Oben die Datenseite (Modelle, Metadaten), unten die Aufmerksamkeitsseite
  // (Watchtime). Die Aufmerksamkeitsseite ist eine Kette von drei flachen
  // Stufen, damit ihr Dark Pattern in der Mitte sitzt und nicht erst am Ende.
  var KI_COLS = [
    ['ki_speicher'],
    ['ki_training', 'ki_empfehlung'],
    ['ki_netz', 'ki_profile', 'ki_collab'],
    ['ki_sog']
  ];
  var KI_EDGES = [
    { from: 'ki_speicher',   to: 'ki_training'   },
    { from: 'ki_speicher',   to: 'ki_empfehlung' },
    { from: 'ki_training',   to: 'ki_netz'       },
    { from: 'ki_training',   to: 'ki_profile'    },
    { from: 'ki_empfehlung', to: 'ki_collab'     },
    { from: 'ki_collab',     to: 'ki_sog'        }
  ];

  // Node in der aktuellen Phase überhaupt sichtbar?
  function nodeVisible(nodeId) {
    var def = NODES[nodeId];
    if (!def) return false;
    return (def.phase || 0) <= RT.state.currentPhase();
  }

  // Trend-Bonus einer gerade eingesammelten Node setzen. Einmal-Effekt: er
  // hält TREND_HOLD_NODE_SEC voll an und klingt danach mit
  // TREND_DECAY_PER_SEC ab. Ein Feature wirkt also nur, solange es neu ist —
  // deshalb wird hier auch nichts beim Laden rekonstruiert.
  function applyTrendBonus(nodeId) {
    var def = NODES[nodeId];
    if (!def || !def.trendBonus) return;
    RT.state.setTrendMod('node:' + nodeId, def.name, def.trendBonus,
                         RT.state.TREND_HOLD_NODE_SEC);
  }

  // ── Status-Helper ─────────────────────────────────────────────────────
  function nodeStatus(nodeId) {
    var s   = RT.state.current;
    var tt  = s.techtree || {};
    var def = NODES[nodeId];
    if (!def) return 'locked';
    var entry = tt[nodeId];
    if (entry && entry.status === 'done')        return 'done';
    if (entry && entry.status === 'ready')       return 'ready';
    if (entry && entry.status === 'in_progress') return 'in_progress';

    // Phasen-Sperre — greift nur als Sicherheitsnetz, gerendert wird die
    // Node vorher ohnehin nicht (siehe nodeVisible).
    if (!nodeVisible(nodeId)) return 'locked';

    for (var i = 0; i < def.requires.length; i++) {
      var pre = tt[def.requires[i]];
      if (!pre || pre.status !== 'done') return 'locked';
    }
    for (var j = 0; j < def.requiresPurchase.length; j++) {
      if (!s.purchases[def.requiresPurchase[j]]) return 'locked';
    }
    if (def.requiresBuilding) {
      if (RT.state.instancesByType(def.requiresBuilding).length === 0) return 'locked';
    }
    if (def.requiresGoLive && !s.goLiveUnlocked) return 'locked';
    if (def.requiresUsers && (s.users || 0) < def.requiresUsers) return 'locked';
    return 'available';
  }

  function lockReasons(nodeId) {
    var s   = RT.state.current;
    var tt  = s.techtree || {};
    var def = NODES[nodeId];
    var out = [];
    if (!def) return out;
    if (!nodeVisible(nodeId)) out.push('Phase ' + (def.phase || 0));
    for (var i = 0; i < def.requires.length; i++) {
      var pre = tt[def.requires[i]];
      if (!pre || pre.status !== 'done') {
        out.push('Node „' + (NODES[def.requires[i]] || { name: def.requires[i] }).name + '" muss fertig sein');
      }
    }
    var shopNames = { rechner: '💻 Rechner (Shop)' };
    for (var j = 0; j < def.requiresPurchase.length; j++) {
      var pid = def.requiresPurchase[j];
      if (!s.purchases[pid]) out.push(shopNames[pid] || pid + ' (Shop)');
    }
    if (def.requiresBuilding) {
      if (RT.state.instancesByType(def.requiresBuilding).length === 0) {
        var typeName = (RT.state.BUILDING_TYPES[def.requiresBuilding] || { name: def.requiresBuilding }).name;
        out.push(typeName + ' bauen');
      }
    }
    if (def.requiresGoLive && !s.goLiveUnlocked) {
      out.push('Plattform muss online sein');
    }
    if (def.requiresUsers && (s.users || 0) < def.requiresUsers) {
      out.push('Mind. ' + def.requiresUsers + ' User');
    }
    return out;
  }

  // ⚠️ activeNode() und readyNode() liefern IRGENDEINE laufende bzw. fertige
  // Node — seit es mehrere Entwicklungs-Plätze gibt (HQ + Bürogebäude), können
  // das mehrere gleichzeitig sein, und die Reihenfolge im Objekt entscheidet.
  // Für alles, was ein Gebäude betrifft (Ring, Abhol-Button, Feuerwerk), ist
  // nodesAtBuilding() die richtige Abfrage.
  function activeNode() {
    var tt = RT.state.current.techtree || {};
    for (var nid in tt) {
      if (tt[nid] && tt[nid].status === 'in_progress') {
        return { id: nid, entry: tt[nid], def: NODES[nid] };
      }
    }
    return null;
  }

  // Node, die abholbereit ist (Zeit abgelaufen, wartet auf Klick).
  function readyNode() {
    var tt = RT.state.current.techtree || {};
    for (var nid in tt) {
      if (tt[nid] && tt[nid].status === 'ready') {
        return { id: nid, entry: tt[nid], def: NODES[nid] };
      }
    }
    return null;
  }

  // ── Entwicklungs-Plätze ───────────────────────────────────────────────
  // Nur entwicklung-Nodes belegen einen Platz; Marketing/Werbung laufen
  // parallel und blockieren nichts.
  //
  // Ein Platz = ein Gebäude, in dem entwickelt werden kann: das HQ plus jedes
  // gekaufte Bürogebäude. Welche Node auf welchem Gebäude läuft, steht als
  // entry.slot am Techtree-Eintrag — daraus ergibt sich, wo Ring und
  // Abhol-Button erscheinen.
  //
  // Ein Platz gilt als belegt, solange die Node läuft ODER fertig auf das
  // Abholen wartet. Das ist Absicht: sonst könnte man Nodes stapeln, ohne sie
  // je einzusammeln, und der Trend-Bonus (der erst beim Abholen greift) wäre
  // beliebig aufschiebbar.

  // Gebäude, auf dem eine Node sitzt. Fällt auf das erste Entwicklungs-
  // Gebäude zurück, wenn der Eintrag noch kein slot trägt (alter Spielstand)
  // oder auf ein Gebäude zeigt, das es nicht mehr gibt.
  function slotOf(entry) {
    var devs = RT.state.devBuildings();
    if (!devs.length) return null;
    if (entry && entry.slot) {
      for (var i = 0; i < devs.length; i++) {
        if (devs[i].instanceId === entry.slot) return entry.slot;
      }
    }
    return devs[0].instanceId;
  }

  // instanceId → { id, entry, def } für jeden belegten Platz.
  function devSlotUsage() {
    var tt  = RT.state.current.techtree || {};
    var out = {};
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var e = tt[nid];
      if (!e || (e.status !== 'in_progress' && e.status !== 'ready')) continue;
      var def = NODES[nid];
      if (!def || def.tab !== 'entwicklung') continue;
      var slot = slotOf(e);
      if (slot && !out[slot]) out[slot] = { id: nid, entry: e, def: def };
    }
    return out;
  }

  // Was läuft/wartet gerade in diesem Gebäude? Datenquelle für Ring + Button.
  //
  // Anders als devSlotUsage() zählt das ALLE Nodes mit — auch Marketing und
  // Werbung. Die belegen zwar keinen Platz, brauchen aber trotzdem einen Ort,
  // an dem ihr Fortschritt und ihr Abhol-Button erscheinen; sonst entwickelt
  // man sie blind und findet nichts zum Einsammeln.
  //
  // Ring und Button sind zwei getrennte Elemente und dürfen deshalb
  // unterschiedliche Nodes zeigen: läuft eine Entwicklung, während eine
  // Marketing-Node abholbereit ist, dreht sich der Ring weiter UND der Button
  // steht bereit. Bei mehreren Kandidaten gewinnt die Entwicklung — sie ist
  // die, die den Platz blockiert.
  function nodesAtBuilding(instanceId) {
    var tt  = RT.state.current.techtree || {};
    var res = { active: null, ready: null };
    for (var nid in tt) {
      if (!Object.prototype.hasOwnProperty.call(tt, nid)) continue;
      var e = tt[nid];
      if (!e) continue;
      var key = (e.status === 'in_progress') ? 'active'
              : (e.status === 'ready')       ? 'ready' : null;
      if (!key) continue;
      var def = NODES[nid];
      if (!def) continue;
      if (slotOf(e) !== instanceId) continue;
      var cur = res[key];
      if (!cur || (def.tab === 'entwicklung' && cur.def.tab !== 'entwicklung')) {
        res[key] = { id: nid, entry: e, def: def };
      }
    }
    return res;
  }

  // Freies Entwicklungs-Gebäude für eine neue Node. preferredId ist das
  // Gebäude, aus dem der Spieler das Modal geöffnet hat — ist es frei,
  // bekommt es die Node, damit der Fortschritt dort erscheint, wo geklickt
  // wurde. Sonst das erste freie in Kauf-Reihenfolge (HQ zuerst).
  function freeDevBuilding(preferredId) {
    var used = devSlotUsage();
    var devs = RT.state.devBuildings();
    if (preferredId && !used[preferredId]) {
      for (var i = 0; i < devs.length; i++) {
        if (devs[i].instanceId === preferredId) return preferredId;
      }
    }
    for (var j = 0; j < devs.length; j++) {
      if (!used[devs[j].instanceId]) return devs[j].instanceId;
    }
    return null;
  }

  function devSlotsUsed() { return Object.keys(devSlotUsage()).length; }

  // Gebäude für eine Node, die keinen Platz belegt (Marketing/Werbung): das
  // geöffnete, sonst das HQ. Belegt oder nicht spielt hier keine Rolle —
  // geprüft wird nur, dass es überhaupt ein Entwicklungs-Gebäude ist.
  function devBuildingOr1st(preferredId) {
    var devs = RT.state.devBuildings();
    if (!devs.length) return null;
    for (var i = 0; i < devs.length; i++) {
      if (devs[i].instanceId === preferredId) return preferredId;
    }
    return devs[0].instanceId;
  }

  // Wartet irgendwo eine fertige Entwicklung aufs Abholen? Ändert nur den
  // Erklärtext, wenn kein Platz frei ist ("abholen" statt "warten").
  function anyDevReady() {
    var used = devSlotUsage();
    for (var id in used) {
      if (Object.prototype.hasOwnProperty.call(used, id) &&
          used[id].entry.status === 'ready') return true;
    }
    return false;
  }

  // Progress einer bestimmten Node (0..1). Nur sinnvoll bei in_progress.
  function progressOf(nodeId) {
    var entry = (RT.state.current.techtree || {})[nodeId];
    var def   = NODES[nodeId];
    if (!entry || !def || entry.status !== 'in_progress') return 0;
    var elapsed = (Date.now() - entry.startAt) / 1000;
    return Math.max(0, Math.min(1, elapsed / def.durationSec));
  }
  // Legacy-Alias, wird in bestehendem Code noch verwendet.
  function activeProgress() {
    var a = activeNode();
    return a ? progressOf(a.id) : null;
  }

  // True wenn alle 5 Phase-0-Nodes 'done' sind. Voraussetzung für Online-Gang.
  function allPhase0Done() {
    var tt = RT.state.current.techtree || {};
    for (var i = 0; i < NODE_ORDER.length; i++) {
      var e = tt[NODE_ORDER[i]];
      if (!e || e.status !== 'done') return false;
    }
    return true;
  }

  // ── Modal-State ───────────────────────────────────────────────────────
  // buildingId = Gebäude, aus dem das Modal geöffnet wurde (HQ oder ein Büro).
  // Eine hier gestartete Node landet bevorzugt genau dort.
  var viewState = { detailNodeId: null, activeTab: 'entwicklung', buildingId: null };
  var refreshTimer = null;

  function tabVisible(tabId) {
    var s = RT.state.current;
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id !== tabId) continue;
      if (TABS[i].requiresGoLive && !s.goLiveUnlocked) return false;
      if (TABS[i].minPhase && RT.state.currentPhase() < TABS[i].minPhase) return false;
      return true;
    }
    return false;
  }

  // buildingInstanceId: HQ oder Bürogebäude, aus dem geklickt wurde. Ohne
  // Angabe (z. B. Aufruf von außen) übernimmt das HQ.
  function open(buildingInstanceId) {
    viewState.detailNodeId = null;
    viewState.buildingId   = buildingInstanceId || null;
    if (!tabVisible(viewState.activeTab)) viewState.activeTab = 'entwicklung';
    resetView();
    renderModal();
  }

  // Modal-Titel: sagt, in welchem Gebäude man gerade steht. Bei mehreren
  // Büros wäre "HQ — Entwicklung" sonst schlicht falsch.
  function modalTitle() {
    var inst = viewState.buildingId ? RT.state.getInstance(viewState.buildingId) : null;
    if (inst && inst.id === 'buero') return 'Bürogebäude — Entwicklung';
    return 'HQ — Entwicklung';
  }

  // ── Rendering: Node-Card (im Baum) ────────────────────────────────────
  function badgeForStatus(st) {
    if (st === 'done')        return '<span class="rt-tt-badge rt-tt-badge--done">✓ Fertig</span>';
    if (st === 'ready')       return '<span class="rt-tt-badge rt-tt-badge--collect">✓ Abholen!</span>';
    if (st === 'in_progress') return '<span class="rt-tt-badge rt-tt-badge--progress">⏳ In Arbeit</span>';
    if (st === 'locked')      return '<span class="rt-tt-badge rt-tt-badge--locked">🔒 Gesperrt</span>';
    return '<span class="rt-tt-badge rt-tt-badge--ready">Bereit</span>';
  }

  // Der Ertrag der Node als Chip-Reihe — steht in JEDEM Status auf der Karte,
  // auch im gesperrten: genau dort will man wissen, ob sich der Weg dorthin
  // lohnt. Die Dauer stand hier vorher und ist in der Übersicht die
  // uninteressanteste Zahl; sie bleibt im Detail als Kostenposten stehen.
  //
  // Eine Node kann mehrere Erträge haben (die Watchtime-Achse gibt Multi-
  // plikator UND Trend), deshalb eine Liste statt eines einzelnen Werts.
  function yieldChipsHtml(def) {
    var F = RT.ledger.fmt;
    var chips = [];
    function chip(kind, text) {
      chips.push('<span class="rt-tt-chip rt-tt-chip--' + kind + '">' + text + '</span>');
    }

    if (def.trendBonus)    chip('trend', '⭐ ' + F.trend(def.trendBonus));
    // trendBase ist die einzige unumkehrbare Trend-Wirkung im Spiel — das
    // "dauerhaft" gehört deshalb schon in die Übersicht, nicht erst ins Detail.
    if (def.trendBase)     chip('perm',  '⭐ ' + F.trend(def.trendBase) + ' dauerhaft');
    // ⚠️ Vertrauens-Features zeigen ZWEI echte Zahlen statt einer Steigung.
    // „+12,5 % Netzwerk-Steigung" wäre die korrekte Angabe und trotzdem
    // unlesbar; „jetzt / bei 100 Mio" erklärt die ganze Mechanik in vier
    // Wörtern — und macht ehrlich sichtbar, dass es HEUTE wenig ist. Genau
    // das ist die Eigenschaft, für die man sie kauft.
    if (def.networkK) {
      var now  = Math.round(def.networkK * RT.state.networkDecades() * 10) / 10;
      var late = Math.round(def.networkK * RT.state.networkDecades(100000000) * 10) / 10;
      chip('network', '🌐 ' + F.trend(now) + ' jetzt · ' + F.trend(late) + ' bei 100 Mio');
    }
    if (def.watchtimeMult) chip('wt',    '⏳ ' + F.pctMult(def.watchtimeMult));
    // Senkt den Verbrauch statt den Ertrag zu heben — pctMult liefert dafür
    // von selbst ein Minus (0,75 → „−25 %"), es braucht keinen Sonderfall.
    if (def.adWatchtimeMult) chip('wt',   '⏳ ' + F.pctMult(def.adWatchtimeMult) + ' je Deal');
    if (def.metadataMult)   chip('meta',  '🗃️ ' + F.pctMult(def.metadataMult));
    if (def.modelYieldMult) chip('model', '🧠 ' + F.pctMult(def.modelYieldMult));
    if (def.usersBonus)    chip('users', '👥 +' + F.num(def.usersBonus));
    if (def.moneyBonus)    chip('money', '💰 +' + F.money(def.moneyBonus));
    if (def.unlocks)       chip('unlock', '🔓 Freischaltung');

    // Die Phase-0-Nodes haben schlicht keinen Ertrag — dort ist die Dauer die
    // einzige Zahl, die es überhaupt zu zeigen gibt.
    if (!chips.length) chip('time', '⏱ ' + F.sec(def.durationSec));

    return chips.join('');
  }

  function nodeCardHtml(def) {
    var st = nodeStatus(def.id);
    // Dark Patterns bekommen eine eigene Optik — ihre Wirkung auf den Trend
    // ist die einzige im Spiel, die man nicht zurücknehmen kann. Sie hat
    // Vorrang vor der Freischalter-Optik, falls eine Node je beides wäre.
    var tone = '';
    if (def.darkPattern)       tone = ' rt-tt-node--dark';
    else if (def.whitePattern) tone = ' rt-tt-node--white';
    else if (def.unlocks)      tone = ' rt-tt-node--unlock';
    return ''
      + '<div class="rt-tt-node rt-tt-node--' + st + tone + '" data-id="' + def.id + '">'
      + '  <div class="rt-tt-node__ico"><i data-feather="' + def.icon + '"></i></div>'
      + '  <div class="rt-tt-node__body">'
      + '    <div class="rt-tt-node__name">' + def.name + '</div>'
      + '    <div class="rt-tt-node__fx">' + def.effect + '</div>'
      + '    <div class="rt-tt-node__meta">'
      +        badgeForStatus(st) + yieldChipsHtml(def)
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  // ── Rendering: Geist-Karte (Voraussetzung aus einem anderen Reiter) ────
  // Referenz-ID ist '@' + echte Node-ID. Die Karte zeigt den Status des
  // Originals und springt per Klick dorthin — die Verbindungslinie kann
  // dadurch ganz normal gezeichnet werden, statt im Nichts zu enden.
  function ghostRefId(colEntry) {
    return (colEntry.charAt(0) === '@') ? colEntry.slice(1) : null;
  }

  function tabOf(tabId) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].id === tabId) return TABS[i];
    }
    return { icon: '', label: tabId };
  }

  function ghostCardHtml(refId) {
    var def = NODES[refId];
    if (!def) return '';
    var st  = nodeStatus(refId);
    var tab = tabOf(def.tab);
    return ''
      + '<div class="rt-tt-node rt-tt-node--ghost rt-tt-node--' + st + '"'
      +      ' data-id="@' + refId + '" data-goto="' + refId + '">'
      + '  <div class="rt-tt-ghost__tab">' + tab.icon + '</div>'
      + '  <div class="rt-tt-ghost__body">'
      + '    <div class="rt-tt-ghost__name">' + def.name + '</div>'
      + '    <div class="rt-tt-ghost__hint">'
      +        (st === 'done' ? '✓ steht' : 'fehlt noch') + ' · ' + tab.label
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  // ── Rendering: Tab-Leiste ─────────────────────────────────────────────
  function tabsHtml() {
    var s = RT.state.current;
    var out = '<div class="rt-tt-tabs">';
    for (var i = 0; i < TABS.length; i++) {
      var t = TABS[i];
      if (!tabVisible(t.id)) continue;
      var active = (viewState.activeTab === t.id) ? ' rt-tt-tab--active' : '';
      // Badge nur zeigen, wenn der Key explizit im seenBadges-Schema steht
      // (entwicklung z.B. hat keinen Key und soll nie ein "!" bekommen).
      var badgeKey = 'tab_' + t.id;
      var hasKey   = s.seenBadges && (badgeKey in s.seenBadges);
      var badge    = (hasKey && !s.seenBadges[badgeKey])
        ? '<span class="rt-notif-badge">!</span>' : '';
      out += '<button class="rt-tt-tab' + active + '" data-tab="' + t.id + '">'
           + t.icon + ' ' + t.label + badge + '</button>';
    }
    out += '</div>';
    return out;
  }

  // ── Rendering: Spalten-Baum + SVG ─────────────────────────────────────
  // Leere Spalten (alle Nodes noch phasen-unsichtbar) fallen komplett weg,
  // damit kein Loch im Layout entsteht.
  function treeHtml(cols) {
    var colsHtml = '';
    for (var i = 0; i < cols.length; i++) {
      var col = cols[i];
      var colHtml = '';
      for (var j = 0; j < col.length; j++) {
        var ref = ghostRefId(col[j]);
        // Geist-Karten hängen an der Sichtbarkeit ihres Originals: solange der
        // echte Node phasen-unsichtbar ist, gibt es auch keine Voraussetzung
        // zu zeigen.
        if (!nodeVisible(ref || col[j])) continue;
        colHtml += ref ? ghostCardHtml(ref) : nodeCardHtml(NODES[col[j]]);
      }
      if (colHtml) colsHtml += '<div class="rt-tt-col">' + colHtml + '</div>';
    }
    // .rt-tt-viewport ist der Ausschnitt (overflow: hidden — bewusst KEIN
    // Scroll-Container, sonst stünde neben der des Modals eine zweite
    // Scrollleiste), .rt-tt-pan die per translate() verschobene Ebene.
    return ''
      + '<div class="rt-tt-viewport" id="rt-tt-viewport">'
      + '  <div class="rt-tt-pan" id="rt-tt-pan">'
      + '    <svg class="rt-tt-svg" id="rt-tt-svg"></svg>'
      + '    <div class="rt-tt-grid" id="rt-tt-grid">' + colsHtml + '</div>'
      + '  </div>'
      + '  <div class="rt-tt-zoom">'
      + '    <button type="button" data-zoom="out" title="Herauszoomen">−</button>'
      + '    <button type="button" data-zoom="fit" title="Ganzen Baum zeigen">⤢</button>'
      + '    <button type="button" data-zoom="in" title="Hineinzoomen">+</button>'
      + '  </div>'
      + '</div>';
  }

  // ── Rendering: einfache Liste (Marketing) ─────────────────────────────
  function simpleListHtml(tabId) {
    var cards = '';
    for (var nid in NODES) {
      if (!Object.prototype.hasOwnProperty.call(NODES, nid)) continue;
      var def = NODES[nid];
      if (def.tab !== tabId) continue;
      if (!nodeVisible(nid)) continue;
      cards += nodeCardHtml(def);
    }
    if (!cards) {
      return '<p class="rt-tt-hint">Noch keine Nodes in diesem Reiter.</p>';
    }
    return '<div class="rt-tt-simple">' + cards + '</div>';
  }

  // Kanten des gerade sichtbaren Reiters — drawConnections braucht sie.
  function edgesForTab(tabId) {
    if (tabId === 'entwicklung') return EDGES;
    if (tabId === 'werbung')     return WERBUNG_EDGES;
    if (tabId === 'marketing')   return MARKETING_EDGES;
    if (tabId === 'ki')          return KI_EDGES;
    return null;
  }

  // Wählt das passende Rendering für den aktiven Reiter.
  // simpleListHtml() bleibt als Fallback für Reiter ohne eigenes Layout —
  // in Phase 0/1 rendert der Marketing-Reiter über MARKETING_COLS bereits
  // dasselbe Bild wie vorher: eine Spalte mit zwei Karten, der Rest fällt
  // mangels sichtbarer Nodes weg.
  function treeContentHtml() {
    if (viewState.activeTab === 'entwicklung') return treeHtml(COLS);
    if (viewState.activeTab === 'werbung')     return treeHtml(WERBUNG_COLS);
    if (viewState.activeTab === 'marketing')   return treeHtml(MARKETING_COLS);
    if (viewState.activeTab === 'ki')          return treeHtml(KI_COLS);
    return simpleListHtml(viewState.activeTab);
  }

  // ── Rendering: Detail-Ansicht ─────────────────────────────────────────
  function detailContentHtml(nodeId) {
    var def = NODES[nodeId];
    if (!def) return '';
    var s  = RT.state.current;
    var st = nodeStatus(nodeId);

    var actionHtml = '';
    if (st === 'done') {
      actionHtml = '<span class="rt-tt-badge rt-tt-badge--done rt-tt-badge--lg">✓ Fertig</span>';
    } else if (st === 'ready') {
      actionHtml = ''
        + '<p class="rt-tt-detail__note">Fertig entwickelt — klick zum Abschließen.</p>'
        + '<button class="rt-btn-tt rt-btn-tt--collect" data-complete="' + nodeId + '">✓ Abschließen</button>';
    } else if (st === 'in_progress') {
      var prog = progressOf(nodeId);
      actionHtml = ''
        + '<div class="rt-tt-detail__progress">'
        + '  <div class="rt-tt-detail__progress-bar" style="width:' + (prog * 100).toFixed(1) + '%"></div>'
        + '</div>'
        + '<span class="rt-tt-badge rt-tt-badge--progress rt-tt-badge--lg">⏳ Läuft… (' + Math.max(0, Math.ceil((1 - prog) * def.durationSec)) + ' s)</span>';
    } else if (st === 'locked') {
      var reasons = lockReasons(nodeId);
      actionHtml = ''
        + '<div class="rt-tt-detail__lock">'
        + '  Benötigt: ' + reasons.join(', ')
        + '</div>'
        + '<button class="rt-btn-tt" disabled>🔒 Gesperrt</button>';
    } else {
      // Entwicklungs-Plätze blockieren nur entwicklung-Nodes. Marketing und
      // Werbung laufen parallel und brauchen kein Gebäude.
      var isEntw     = (def.tab === 'entwicklung');
      var freeSlot   = isEntw ? freeDevBuilding(viewState.buildingId) : true;
      var affordable = s.money >= def.cost;
      // Metadaten sind eine eigene Währung und bekommen deshalb eine eigene
      // Absage: „zu teuer" würde auf das Konto zeigen, wo nichts fehlt.
      var metaOk     = (s.metadata || 0) >= (def.metadata || 0);
      if (!freeSlot) {
        var note = anyDevReady()
          ? 'Alle Entwicklungs-Plätze sind belegt — eine Entwicklung ist fertig und wartet aufs Abholen.'
          : 'Alle Entwicklungs-Plätze sind belegt (' + devSlotsUsed() + '/' + RT.state.devSlotsTotal() + ').';
        // Der Hinweis aufs Büro nur, wenn es auch kaufbar ist — in Phase 0/1
        // gibt es im Shop nur die Serverfarm.
        if (RT.state.currentPhase() >= 2) {
          note += ' Ein Bürogebäude aus dem Shop gibt dir einen weiteren Platz.';
        }
        actionHtml = ''
          + '<p class="rt-tt-detail__note">' + note + '</p>'
          + '<button class="rt-btn-tt" disabled>Kein freier Platz</button>';
      } else if (!affordable) {
        actionHtml = ''
          + '<p class="rt-tt-detail__note">Zu wenig Geld — benötigt: ' + RT.ledger.fmt.money(def.cost) + '</p>'
          + '<button class="rt-btn-tt" disabled>Zu teuer</button>';
      } else if (!metaOk) {
        actionHtml = ''
          + '<p class="rt-tt-detail__note">Zu wenig Metadaten — benötigt: '
          +   RT.ledger.fmt.num(def.metadata) + ' 🗃️, vorhanden: '
          +   RT.ledger.fmt.num(Math.floor(s.metadata || 0)) + '. '
          +   'Metadaten entstehen aus den User-Modellen in deinen Serverfarmen.</p>'
          + '<button class="rt-btn-tt" disabled>Zu wenig Metadaten</button>';
      } else {
        var label = isEntw ? '▶ Entwickeln' : '▶ Starten';
        actionHtml = '<button class="rt-btn-tt rt-btn-tt--primary" data-develop="' + nodeId + '">' + label + '</button>';
      }
    }

    // Kosten links, Ertrag rechts — dieselbe Aufteilung wie in Werbeagentur
    // und Marketing-Center. Zeit und Serverbedarf zählen als Kosten: beides
    // ist etwas, das die Node verbraucht, bevor sie etwas abwirft.
    // Ohne Beschriftungen an den Zahlen: die Icons sind dieselben wie in der
    // Ressourcen-Bar oben. Wie lange ein Trend-Bonus anliegt und dass der
    // Watchtime-Multiplikator bleibt, steht im Beschreibungstext links.
    var F = RT.ledger.fmt;
    var cost = [];
    var gain = [];

    cost.push(def.cost > 0
      ? { res: 'money', icon: '💰', value: F.money(def.cost) }
      : { res: 'money', icon: '💰', value: 'kostenlos' });
    // Metadaten direkt hinter dem Geld: sie sind die zweite Währung, nicht
    // ein Nebenposten wie Zeit und Server.
    if (def.metadata > 0) {
      cost.push({ res: 'meta', icon: '🗃️', value: F.num(def.metadata) });
    }
    cost.push({ res: 'time', icon: '⏱', value: F.sec(def.durationSec) });
    if (def.server > 0) {
      cost.push({ res: 'server', icon: '🖥', value: F.num(def.server) });
    }
    // Dark Patterns verschieben den Ruhewert des Trends unumkehrbar — deshalb
    // stehen sie als Warnung in den Kosten, nicht als Fußnote am Ertrag. Das
    // ist die eine Zeile, die eine Beschriftung behält: "dauerhaft" ist der
    // ganze Unterschied zum befristeten Bonus in der Ertrags-Spalte.
    if (def.trendBase) {
      cost.push({ icon: '⚠️', value: F.trend(def.trendBase) + ' %',
                  label: 'dauerhaft', warn: true });
    }

    if (def.trendBonus) {
      gain.push({ res: 'trend', icon: '⭐', value: F.trend(def.trendBonus) + ' %' });
    }
    // Vertrauens-Features: zwei Zeilen statt einer, weil der Ertrag hier eine
    // ZEITACHSE hat. Eine einzelne Zahl wäre in jedem Moment richtig und in
    // der Sache falsch — der ganze Sinn der Node ist, dass sie später mehr
    // wert ist als heute. Die zweite Zeile ist deshalb keine Wiederholung,
    // sondern der eigentliche Kaufgrund.
    if (def.networkK) {
      var nNow  = Math.round(def.networkK * RT.state.networkDecades() * 10) / 10;
      var nLate = Math.round(def.networkK * RT.state.networkDecades(100000000) * 10) / 10;
      gain.push({ res: 'trend', icon: '🌐', value: F.trend(nNow) + ' %',
                  label: 'bei deiner Größe' });
      gain.push({ res: 'trend', icon: '🌐', value: F.trend(nLate) + ' %',
                  label: 'bei 100 Mio Usern' });
    }
    if (def.watchtimeMult) {
      gain.push({ res: 'watchtime', icon: '⏳', value: F.pctMult(def.watchtimeMult) });
    }
    if (def.adWatchtimeMult) {
      gain.push({ res: 'watchtime', icon: '⏳', value: F.pctMult(def.adWatchtimeMult),
                  label: 'je Werbezyklus' });
    }
    if (def.metadataMult) {
      gain.push({ res: 'meta', icon: '🗃️', value: F.pctMult(def.metadataMult) });
    }
    if (def.modelYieldMult) {
      gain.push({ res: 'model', icon: '🧠', value: F.pctMult(def.modelYieldMult) });
    }
    if (def.usersBonus) gain.push({ res: 'users', icon: '👥', value: '+' + F.num(def.usersBonus) });
    if (def.moneyBonus) gain.push({ res: 'money', icon: '💰', value: '+' + F.money(def.moneyBonus) });
    // Keine Ressourcen, sondern Freischaltungen: eigene, neutrale Optik und
    // kleinere Schrift — das sind Sätze, keine Zahlen.
    if (def.unlocks)    gain.push({ text: true, icon: '🔓', value: def.unlocks });
    if (def.activatesFlyerBonus) {
      gain.push({ text: true, icon: '📈', value: 'Flyerbonus ×1,10 alle 8 s' });
    }

    return ''
      + '<button class="rt-btn-tt rt-btn-tt--ghost rt-tt-back" id="rt-tt-back">← Zurück</button>'
      + RT.ledger.card({
          variant: def.darkPattern ? 'dark' : (def.whitePattern ? 'white' : ''),
          icon:    '<i data-feather="' + def.icon + '"></i>',
          title:   def.name,
          desc:    def.effectFull,
          cost:    cost,
          gain:    gain,
          // Aktionen gehören in die linke Spalte, direkt unter den Text —
          // vorher standen sie als eigener Block unter der ganzen Karte.
          action:  actionHtml
        });
  }

  // ── SVG-Verbindungen ──────────────────────────────────────────────────
  // Orthogonale Pfade („Platinen-Optik") statt freier Beziers. Der Grund ist
  // nicht Geschmack: eine Bezier-Kurve zwischen zwei nicht benachbarten
  // Spalten legt ihren Kontrollpunkt mitten in die übersprungene Spalte und
  // verschwindet dort hinter den Karten (die liegen auf z-index 1, das SVG
  // auf 0) — die Linie sah dann aus, als endete sie im Nichts.
  //
  // Deshalb laufen alle senkrechten Schenkel in den Lücken zwischen den
  // Spalten, und die waagerechten in den Lücken zwischen den Karten. Über
  // eine Karte läuft dadurch nie eine Linie — und keine muss außen herum.
  var ROUND       = 8;  // Eckenradius
  var CARD_MARGIN = 6;  // Sicherheitsabstand um eine Karte bei der Korridorsuche
  var BAND_MIN    = 11; // schmaler als das ist ein Korridor nicht brauchbar
  var LANE_FIRST  = 18; // Notausgang unter dem Grid, falls gar nichts frei ist
  var LANE_STEP   = 14;

  function sgn(n) { return n > 0 ? 1 : (n < 0 ? -1 : 0); }

  // Orthogonale Punktfolge → Pfad mit abgerundeten Ecken. Nullstrecken
  // fliegen vorher raus, sonst entartet der Bogen an der Ecke.
  function roundedPath(pts, r) {
    var p = [];
    for (var i = 0; i < pts.length; i++) {
      var prev = p[p.length - 1];
      if (prev && Math.abs(prev.x - pts[i].x) < 0.5 && Math.abs(prev.y - pts[i].y) < 0.5) continue;
      p.push(pts[i]);
    }
    if (p.length < 2) return '';

    var d = 'M ' + p[0].x + ' ' + p[0].y;
    for (var k = 1; k < p.length - 1; k++) {
      var c = p[k], a = p[k - 1], b = p[k + 1];
      var inLen  = Math.abs(c.x - a.x) + Math.abs(c.y - a.y);
      var outLen = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
      var rr = Math.min(r, inLen / 2, outLen / 2);
      d += ' L ' + (c.x - sgn(c.x - a.x) * rr) + ' ' + (c.y - sgn(c.y - a.y) * rr)
         + ' Q ' + c.x + ' ' + c.y
         + ', '  + (c.x + sgn(b.x - c.x) * rr) + ' ' + (c.y + sgn(b.y - c.y) * rr);
    }
    return d + ' L ' + p[p.length - 1].x + ' ' + p[p.length - 1].y;
  }

  function drawConnections(root, edges) {
    var pan  = root.querySelector('#rt-tt-pan');
    var grid = root.querySelector('#rt-tt-grid');
    var svg  = root.querySelector('#rt-tt-svg');
    if (!pan || !grid || !svg || !edges) return;

    svg.innerHTML = '';
    pan.style.paddingBottom = '';

    // Alle Koordinaten relativ zur Pan-Ebene. Der Pan-Offset kürzt sich dabei
    // heraus, der ZOOM nicht: getBoundingClientRect() liefert Bildschirm-Pixel,
    // das SVG liegt aber selbst in der skalierten Ebene. Ohne die Division
    // würde jede Linie ein zweites Mal skaliert.
    var pR = pan.getBoundingClientRect();
    var z  = treeZoom.s || 1;
    function box(el) {
      var r = el.getBoundingClientRect();
      return {
        left: (r.left - pR.left) / z, right: (r.right - pR.left) / z,
        top:  (r.top  - pR.top)  / z, bottom: (r.bottom - pR.top) / z,
        midY: (r.top + r.height / 2 - pR.top) / z
      };
    }

    var gridBox = box(grid);
    var colEls  = grid.querySelectorAll('.rt-tt-col');
    var colBox  = [];
    for (var c = 0; c < colEls.length; c++) colBox.push(box(colEls[c]));

    function colIndexOf(el) {
      for (var k = 0; k < colEls.length; k++) {
        if (colEls[k].contains(el)) return k;
      }
      return -1;
    }

    // Lücke g liegt zwischen Spalte g und g+1. Außerhalb des Grids (kann bei
    // einer Kante in die erste Spalte vorkommen) wird Platz dazuerfunden.
    function gapBounds(g) {
      if (g < 0)                return { l: colBox[0].left - 56,  r: colBox[0].left - 8 };
      if (g >= colBox.length - 1) {
        var last = colBox[colBox.length - 1];
        return { l: last.right + 8, r: last.right + 56 };
      }
      return { l: colBox[g].right, r: colBox[g + 1].left };
    }

    var cardEls = grid.querySelectorAll('.rt-tt-node');
    var cardBox = [];
    for (var m = 0; m < cardEls.length; m++) cardBox.push(box(cardEls[m]));

    // Freie waagerechte Korridore zwischen x1 und x2 — also die Höhen, auf
    // denen eine Linie ZWISCHEN den Karten hindurchläuft statt außen herum.
    // Das ist der Ersatz für die alten Lanes unter dem Grid: die kosteten
    // einen Bogen unter einer ganzen Spalte, obwohl zwischen den Karten
    // dieser Spalte Platz ist.
    function freeBands(x1, x2) {
      var iv = [];
      for (var i = 0; i < cardBox.length; i++) {
        var b = cardBox[i];
        if (b.right > x1 + 2 && b.left < x2 - 2) iv.push([b.top - CARD_MARGIN, b.bottom + CARD_MARGIN]);
      }
      iv.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      for (var j = 0; j < iv.length; j++) {
        var last = merged[merged.length - 1];
        if (last && iv[j][0] <= last[1]) last[1] = Math.max(last[1], iv[j][1]);
        else merged.push([iv[j][0], iv[j][1]]);
      }
      var bands = [], top = gridBox.top - 26;
      for (var k = 0; k < merged.length; k++) {
        if (merged[k][0] - top >= BAND_MIN) bands.push([top, merged[k][0]]);
        top = merged[k][1];
      }
      bands.push([top, gridBox.bottom + 40]);
      return bands;
    }

    // ── Durchgang 1: Kanten vermessen ───────────────────────────────────
    var plans = [];
    edges.forEach(function (edge) {
      var fromEl = root.querySelector('[data-id="' + edge.from + '"]');
      var toEl   = root.querySelector('[data-id="' + edge.to   + '"]');
      if (!fromEl || !toEl) return;
      var fc = colIndexOf(fromEl), tc = colIndexOf(toEl);
      if (fc < 0 || tc < 0) return;
      plans.push({
        edge: edge, from: box(fromEl), to: box(toEl),
        fc: fc, tc: tc, long: (tc - fc) !== 1
      });
    });

    // ── Durchgang 2: Korridor je langer Kante ───────────────────────────
    // Der x-Bereich kommt aus der Spalten-Geometrie, nicht aus dem noch gar
    // nicht vergebenen Kanal — sonst hinge die Kanalvergabe am Korridor und
    // der Korridor am Kanal.
    var usedBand = {};
    function pickCorridor(plan) {
      var bands = freeBands(colBox[plan.fc].right, plan.to.left);
      var want  = plan.to.midY;
      function bandFree(y) {
        for (var i = 0; i < bands.length; i++) {
          if (y > bands[i][0] + 1 && y < bands[i][1] - 1) return true;
        }
        return false;
      }
      // Liegt die Zielhöhe selbst frei, braucht die Kante gar keinen Knick:
      // sie läuft zwischen den Karten schnurgerade ins Ziel.
      if (bandFree(want)) return want;
      // Sonst zuerst die EIGENE Höhe versuchen: die Kante verlässt ihre Karte
      // waagerecht, läuft geradeaus durch und steigt erst unmittelbar vor dem
      // Ziel. Ohne diesen Schritt landete z. B. mk_sprint → mk_partner im Band
      // ÜBER mk_presse — der Bogen ging erst hoch und gleich wieder runter,
      // obwohl auf Höhe von mk_sprint alles frei ist.
      if (bandFree(plan.from.midY)) return plan.from.midY;
      var best = null, bestD = Infinity;
      for (var j = 0; j < bands.length; j++) {
        var lo = bands[j][0], hi = bands[j][1];
        if (hi - lo < BAND_MIN) continue;
        var c = (lo + hi) / 2;
        // Schon belegt? Innerhalb des Bandes ausweichen, solange Platz ist.
        while (usedBand[Math.round(c)] && c + 7 < hi - 4) c += 7;
        var d = Math.abs(c - want);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best !== null) usedBand[Math.round(best)] = true;
      return best;
    }
    plans.forEach(function (plan) {
      if (!plan.long) return;
      plan.corridorY = pickCorridor(plan);
      // Nur wenn der Korridor nicht ohnehin auf Zielhöhe liegt, braucht es
      // in der Lücke vor der Zielspalte noch einen senkrechten Anstieg.
      plan.needsIn = plan.corridorY !== null && Math.abs(plan.corridorY - plan.to.midY) > 1;
    });

    // ── Durchgang 3: Kanäle in den Lücken vergeben ──────────────────────
    // ⚠️ Der Schlüssel ist die QUELLE, nicht die Kante: alle Kanten, die von
    // derselben Node ausgehen, teilen sich einen senkrechten Strang mit
    // Abzweigen. Aus vier eng nebeneinander laufenden Parallelen hinter
    // backend2 wird so eine Linie — das war der eigentliche Grund, warum der
    // Baum nicht zu entwirren war.
    var chan = {};
    function need(gap, key, y) {
      var g = (chan[gap] = chan[gap] || {});
      if (!g[key]) g[key] = { y: y, x: 0 };
      else g[key].y = Math.min(g[key].y, y);
      return g[key];
    }
    plans.forEach(function (plan) {
      plan.out = need(plan.fc, 'S' + plan.edge.from, plan.from.midY);
      if (plan.long && plan.needsIn) {
        plan['in'] = need(plan.tc - 1, 'T' + plan.edge.to, plan.to.midY);
      }
    });
    Object.keys(chan).forEach(function (g) {
      var keys = Object.keys(chan[g]).sort(function (a, b) {
        return chan[g][a].y - chan[g][b].y;
      });
      var b = gapBounds(parseInt(g, 10));
      for (var i = 0; i < keys.length; i++) {
        chan[g][keys[i]].x = b.l + (b.r - b.l) * (i + 1) / (keys.length + 1);
      }
    });

    // ── Durchgang 4: zeichnen ───────────────────────────────────────────
    // Nach Deckkraft gruppiert: gemeinsame Stränge werden von jeder Kante
    // erneut gezeichnet, und mit Alpha PRO PFAD würden sie sich zu einem
    // dunkleren Strich aufaddieren. Die Deckkraft sitzt deshalb auf der
    // Gruppe — innerhalb einer Gruppe verschmelzen die Linien sauber.
    var NS      = 'http://www.w3.org/2000/svg';
    var gridBot = gridBox.bottom;
    var laneIdx = 0;
    var groups  = {};
    function groupFor(alpha) {
      if (!groups[alpha]) {
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('opacity', alpha);
        g.setAttribute('stroke', 'rgb(139, 90, 43)');
        g.setAttribute('stroke-width', '2.5');
        g.setAttribute('stroke-linecap', 'round');
        g.setAttribute('fill', 'none');
        svg.appendChild(g);
        groups[alpha] = g;
      }
      return groups[alpha];
    }

    plans.forEach(function (plan) {
      var f = plan.from, t = plan.to, outX = plan.out.x, pts;

      if (!plan.long) {
        pts = [{ x: f.right, y: f.midY }, { x: outX, y: f.midY },
               { x: outX, y: t.midY },    { x: t.left, y: t.midY }];
      } else if (plan.corridorY === null) {
        // Notausgang: kein freier Korridor. Sollte im aktuellen Baum nicht
        // vorkommen, ist aber die einzige Route, die immer existiert.
        var laneY = gridBot + LANE_FIRST + laneIdx * LANE_STEP;
        laneIdx++;
        var inX0 = plan['in'] ? plan['in'].x : gapBounds(plan.tc - 1).r - 12;
        pts = [{ x: f.right, y: f.midY }, { x: outX, y: f.midY },
               { x: outX, y: laneY },     { x: inX0, y: laneY },
               { x: inX0, y: t.midY },    { x: t.left, y: t.midY }];
      } else if (!plan.needsIn) {
        // Korridor liegt auf Zielhöhe → wie eine kurze Kante, nur länger.
        pts = [{ x: f.right, y: f.midY },     { x: outX, y: f.midY },
               { x: outX, y: plan.corridorY }, { x: t.left, y: plan.corridorY }];
      } else {
        var inX = plan['in'].x;
        pts = [{ x: f.right, y: f.midY },      { x: outX, y: f.midY },
               { x: outX, y: plan.corridorY }, { x: inX, y: plan.corridorY },
               { x: inX, y: t.midY },          { x: t.left, y: t.midY }];
      }

      // Die Linie trägt denselben Zustand wie die Karte, auf die sie zeigt:
      // erledigte Wege kräftig, gesperrte blass.
      var st    = nodeStatus((plan.edge.to.charAt(0) === '@') ? plan.edge.to.slice(1) : plan.edge.to);
      var alpha = st === 'done' ? 0.75 : (st === 'locked' ? 0.28 : 0.55);

      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', roundedPath(pts, ROUND));
      // Lange Kanten gestrichelt — man soll sehen, dass sie eine Ebene
      // überspringen, statt sie für eine normale Nachbarschaft zu halten.
      if (plan.long) path.setAttribute('stroke-dasharray', '7 5');
      groupFor(alpha).appendChild(path);
    });

    // SVG auf die INHALTS-Größe, nicht auf den sichtbaren Ausschnitt: vorher
    // stand hier die Breite des Scroll-Containers, wodurch der ganze rechte
    // Teil des Baums schlicht abgeschnitten wurde.
    var lanesH = laneIdx ? LANE_FIRST + laneIdx * LANE_STEP : 0;
    svg.setAttribute('width',  Math.ceil(gridBox.right));
    svg.setAttribute('height', Math.ceil(gridBot + lanesH));
    if (lanesH) pan.style.paddingBottom = lanesH + 'px';
  }

  // ── Pan & Zoom: den Baum frei verschieben und skalieren ───────────────
  // Muster aus js/camera.js (Drag-Schwelle + Klick-Unterdrückung in der
  // Capture-Phase), erweitert um Pinch: der Baum ist breiter als jedes Modal,
  // und „einmal alles sehen" geht nur über Herauszoomen.
  //
  // Der Offset lebt bewusst im Modul und nicht im DOM: renderModal() baut bei
  // JEDEM state:changed den kompletten Baum neu, und der Loop feuert im
  // Sekundentakt. Ein DOM-Scroll-Offset wäre dadurch permanent zurückgesetzt.
  // Für den Zoom gilt dasselbe.
  var PAN_THRESHOLD = 8; // px — darunter gilt es als Tap
  var ZOOM_MIN = 0.3, ZOOM_MAX = 1.6, ZOOM_STEP = 1.25;
  var treePan  = { x: 0, y: 0 };
  var treeZoom = { s: 1 };
  var panSuppressClick = false;
  // Liegt ein Finger auf? Dann darf state:changed NICHT neu rendern: der
  // Neuaufbau wirft den Ausschnitt samt laufender Geste weg, und ab da kommt
  // kein pointermove mehr an. Beim Ziehen fiel das kaum auf (ein Ruckler pro
  // Sekunde), ein Pinch dauert aber länger als der Loop-Takt.
  var gestureActive = false;

  // Beim Reiterwechsel nur den Ausschnitt zurücksetzen, NICHT den Zoom: wer
  // herausgezoomt hat, um den Überblick zu haben, will ihn im nächsten Reiter
  // auch. Zurück auf 1 geht es erst beim Öffnen des Modals (resetView).
  function resetPan()  { treePan.x = 0; treePan.y = 0; }
  function resetView() { resetPan(); treeZoom.s = 1; gestureActive = false; }

  function clampZoom(s) { return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s)); }

  function applyView(panEl, viewport) {
    // Nicht über die Inhaltsgrenzen hinaus — ein leerer Ausschnitt wäre die
    // gleiche Sackgasse wie eine Linie, die ins Nichts läuft. offsetWidth ist
    // die unskalierte Layout-Größe, die sichtbare Fläche also × Zoom.
    var w = panEl.offsetWidth  * treeZoom.s;
    var h = panEl.offsetHeight * treeZoom.s;
    treePan.x = Math.max(Math.min(0, viewport.clientWidth  - w), Math.min(0, treePan.x));
    treePan.y = Math.max(Math.min(0, viewport.clientHeight - h), Math.min(0, treePan.y));
    panEl.style.transform = 'translate(' + treePan.x + 'px,' + treePan.y + 'px) '
                          + 'scale(' + treeZoom.s + ')';
  }

  function bindPan(root) {
    var viewport = root.querySelector('#rt-tt-viewport');
    var panEl    = root.querySelector('#rt-tt-pan');
    if (!viewport || !panEl) return;

    applyView(panEl, viewport);

    var start = null;
    var moved = false;
    var pointers = {};  // pointerId → letzte Position, für die Pinch-Erkennung
    var pinch = null;

    function pointerIds() { return Object.keys(pointers); }

    // Zoom um einen festen Punkt (Ausschnitts-Koordinaten): der Inhalt unter
    // dem Finger bzw. dem Mauszeiger bleibt dort stehen.
    function zoomAt(vx, vy, factor) {
      var s0 = treeZoom.s, s1 = clampZoom(s0 * factor);
      if (s1 === s0) return;
      treePan.x = vx - (vx - treePan.x) * s1 / s0;
      treePan.y = vy - (vy - treePan.y) * s1 / s0;
      treeZoom.s = s1;
      applyView(panEl, viewport);
    }

    // „Alles zeigen": auf die Inhaltsgröße einpassen, aber nie über 1 hinaus
    // vergrößern — ein kleiner Reiter soll nicht plötzlich riesig sein.
    function fitAll() {
      var w = panEl.offsetWidth, h = panEl.offsetHeight;
      if (!w || !h) return;
      treeZoom.s = clampZoom(Math.min(viewport.clientWidth / w,
                                      viewport.clientHeight / h, 1));
      treePan.x = 0; treePan.y = 0;
      applyView(panEl, viewport);
    }

    function startPinch() {
      var ids = pointerIds();
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var vr = viewport.getBoundingClientRect();
      var mx = (a.x + b.x) / 2 - vr.left, my = (a.y + b.y) / 2 - vr.top;
      pinch = {
        dist: Math.max(1, Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2))),
        s0: treeZoom.s,
        // Der Inhaltspunkt unter der Fingermitte — er bleibt während der
        // ganzen Geste dort. Dadurch zoomt und schiebt dieselbe Geste.
        cx: (mx - treePan.x) / treeZoom.s,
        cy: (my - treePan.y) / treeZoom.s,
        vr: vr
      };
      // Zwei Finger sind nie ein Tap auf eine Karte.
      start = null;
      moved = true;
      panSuppressClick = true;
    }

    viewport.addEventListener('pointerdown', function (ev) {
      // Die Zoom-Knöpfe liegen im Ausschnitt, sind aber keine Zieh-Fläche.
      // Das Flag muss trotzdem fallen: sonst frisst die Klick-Unterdrückung
      // aus dem vorangegangenen Drag den Knopfdruck.
      if (ev.target.closest && ev.target.closest('.rt-tt-zoom')) {
        panSuppressClick = false;
        return;
      }
      if (ev.button) return; // nur linke Maustaste / Finger
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      gestureActive = true;
      if (pointerIds().length === 2) { startPinch(); return; }
      if (pointerIds().length > 2) return;
      // Jede neue Geste startet sauber. Wichtig: auf den Klick als Aufräumer
      // ist kein Verlass — endet ein Drag außerhalb des Ausschnitts, kommt
      // gar kein click, und das Flag würde sonst den NÄCHSTEN Tap fressen.
      panSuppressClick = false;
      start = { x: ev.clientX, y: ev.clientY, px: treePan.x, py: treePan.y };
      moved = false;
    });

    viewport.addEventListener('pointermove', function (ev) {
      if (pointers[ev.pointerId]) {
        pointers[ev.pointerId].x = ev.clientX;
        pointers[ev.pointerId].y = ev.clientY;
      }

      if (pinch) {
        var ids = pointerIds();
        if (ids.length < 2) return;
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.max(1, Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)));
        treeZoom.s = clampZoom(pinch.s0 * d / pinch.dist);
        var mx = (a.x + b.x) / 2 - pinch.vr.left;
        var my = (a.y + b.y) / 2 - pinch.vr.top;
        treePan.x = mx - pinch.cx * treeZoom.s;
        treePan.y = my - pinch.cy * treeZoom.s;
        applyView(panEl, viewport);
        ev.preventDefault();
        return;
      }

      if (!start) return;
      var dx = ev.clientX - start.x;
      var dy = ev.clientY - start.y;
      if (!moved) {
        if (Math.abs(dx) <= PAN_THRESHOLD && Math.abs(dy) <= PAN_THRESHOLD) return;
        moved = true;
        panSuppressClick = true;
        viewport.classList.add('rt-tt-viewport--dragging');
        // Erst JETZT capturen, nicht schon beim pointerdown: ein reiner Tap
        // soll den Klick auf die Karte ganz normal auslösen.
        if (viewport.setPointerCapture) viewport.setPointerCapture(ev.pointerId);
      }
      treePan.x = start.px + dx;
      treePan.y = start.py + dy;
      applyView(panEl, viewport);
      ev.preventDefault();
    });

    function endDrag(ev) {
      if (ev) delete pointers[ev.pointerId];
      var rest = pointerIds();
      if (pinch && rest.length < 2) {
        pinch = null;
        // Ein Finger liegt noch auf: als Zieh-Geste weiterführen, statt sie
        // abzuwürgen. Ohne den neuen Startpunkt springt der Baum um die ganze
        // Strecke, die während des Pinch zurückgelegt wurde.
        if (rest.length === 1) {
          start = { x: pointers[rest[0]].x, y: pointers[rest[0]].y,
                    px: treePan.x, py: treePan.y };
          if (ev) ev.preventDefault();
          return;
        }
      }
      if (rest.length) return; // Mehrfinger-Geste noch nicht zu Ende
      start = null;
      moved = false;
      // Letzter Finger ist weg — der Loop darf wieder rendern. Bewusst NICHT
      // von hier aus: renderModal() würde den Ausschnitt sofort ersetzen, und
      // der gleich folgende click liefe dann ins Leere statt in die
      // Unterdrückung unten — ein Ziehen würde die Karte darunter öffnen.
      // Der nächste state:changed kommt ohnehin binnen einer Sekunde.
      gestureActive = false;
      viewport.classList.remove('rt-tt-viewport--dragging');
      // Der Browser gibt den Capture beim pointerup zwar selbst frei; bleibt
      // er doch mal hängen, landen ALLE folgenden Zeiger-Ereignisse hier und
      // der Baum nimmt keine Klicks mehr an.
      if (ev && viewport.hasPointerCapture && viewport.hasPointerCapture(ev.pointerId)) {
        viewport.releasePointerCapture(ev.pointerId);
      }
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // Nach einem Drag darf der Klick nicht die Detail-Ansicht der Karte unter
    // dem Finger öffnen. Capture-Phase greift vor dem Node-Handler.
    viewport.addEventListener('click', function (ev) {
      // Die Zoom-Knöpfe sind kein Baum-Inhalt — sie dürfen nie unterdrückt
      // werden, auch nicht direkt nach einem Drag.
      if (ev.target.closest && ev.target.closest('.rt-tt-zoom')) return;
      if (!panSuppressClick) return;
      panSuppressClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);

    // Ohne native Scrollleiste braucht der Desktop eine Rad-Alternative.
    // Mit Strg (bzw. Trackpad-Pinch, den der Browser als ctrlKey meldet) zoomt
    // dasselbe Rad — das ist die Maus-Entsprechung zur Zwei-Finger-Geste.
    viewport.addEventListener('wheel', function (ev) {
      if (ev.ctrlKey || ev.metaKey) {
        var vr = viewport.getBoundingClientRect();
        zoomAt(ev.clientX - vr.left, ev.clientY - vr.top,
               ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      } else {
        if (ev.shiftKey) treePan.x -= ev.deltaY;
        else             treePan.y -= ev.deltaY;
        applyView(panEl, viewport);
      }
      ev.preventDefault();
    }, { passive: false });

    // Knöpfe im Ausschnitt: dieselben drei Aktionen für alle, die weder
    // zwei Finger noch ein Mausrad haben.
    var zoomEls = viewport.querySelectorAll('.rt-tt-zoom [data-zoom]');
    zoomEls.forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var what = btn.getAttribute('data-zoom');
        if (what === 'fit') { fitAll(); return; }
        zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2,
               what === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
      });
    });
  }

  // ── Modal-Rendering ───────────────────────────────────────────────────
  function renderModal() {
    var body    = document.getElementById('modal-body');
    var title   = document.getElementById('modal-title');
    var backdrop= document.getElementById('modal-backdrop');
    var modal   = document.getElementById('modal');
    if (!body || !title || !backdrop) return;

    title.textContent = modalTitle();

    var content;
    if (viewState.detailNodeId) {
      content = detailContentHtml(viewState.detailNodeId);
    } else {
      // Platz-Anzeige nur, wenn es mehr als einen gibt — vorher wäre "1/1"
      // eine Information über eine Regel, die es noch gar nicht gibt.
      var slotsHint = '';
      if (RT.state.devSlotsTotal() > 1) {
        slotsHint = ' <span class="rt-tt-slots">Entwicklungs-Plätze: '
                  + devSlotsUsed() + '/' + RT.state.devSlotsTotal() + ' belegt</span>';
      }
      // Der Baum hat keine Scrollleiste mehr — ohne diesen Hinweis wäre nicht
      // zu erraten, dass man ihn ziehen kann.
      content = tabsHtml()
              + '<p class="rt-tt-hint">Tippe auf einen Baustein für Details · '
              +   'ziehen zum Verschieben, zwei Finger zum Zoomen.' + slotsHint + '</p>'
              + treeContentHtml();
    }
    // Marker-Element: daran erkennen Auto-Refresh und der state:changed-Hook,
    // dass gerade der Techtree im Modal steht. Vorher lief das über einen
    // Vergleich des Titel-Textes — der ist jetzt gebäudeabhängig.
    body.innerHTML = '<div id="rt-tt-root">' + content + '</div>';
    if (modal) {
      modal.classList.add('modal-lg');
      // In der Baum-Ansicht scrollt das Modal NICHT: Reiterleiste und
      // Hinweiszeile stehen fest, der Baum darunter wird gezogen. Die
      // Detail-Ansicht bleibt dagegen ein ganz normales Scroll-Modal.
      modal.classList.toggle('modal-tree', !viewState.detailNodeId);
    }
    backdrop.classList.add('open');

    // Feather-Icons ersetzen
    if (window.feather && typeof window.feather.replace === 'function') {
      window.feather.replace();
    }

    // Tab-Klick → Reiter wechseln
    var tabEls = body.querySelectorAll('.rt-tt-tab[data-tab]');
    tabEls.forEach(function (tabEl) {
      tabEl.addEventListener('click', function () {
        var tabId = tabEl.getAttribute('data-tab');
        viewState.activeTab = tabId;
        // Jeder Reiter hat sein eigenes Layout — der Ausschnitt des alten
        // wäre im neuen willkürlich.
        resetPan();
        RT.state.markSeen('tab_' + tabId);
        renderModal();
      });
    });

    // Node-Klick → Detail-Ansicht. Geist-Karten (data-goto) zeigen auf eine
    // Node in einem anderen Reiter und springen dorthin.
    var nodeEls = body.querySelectorAll('.rt-tt-node[data-id]');
    nodeEls.forEach(function (nodeEl) {
      nodeEl.addEventListener('click', function () {
        var goto = nodeEl.getAttribute('data-goto');
        if (goto && NODES[goto]) {
          viewState.activeTab = NODES[goto].tab;
          resetPan();
        }
        viewState.detailNodeId = goto || nodeEl.getAttribute('data-id');
        renderModal();
      });
    });

    // Zurück-Button
    var backBtn = body.querySelector('#rt-tt-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        viewState.detailNodeId = null;
        renderModal();
      });
    }

    // Entwickeln-Button — schließt Modal, damit man den Fortschritt am HQ sieht
    var devBtn = body.querySelector('[data-develop]');
    if (devBtn) {
      devBtn.addEventListener('click', function () {
        var nid = devBtn.getAttribute('data-develop');
        // Das geöffnete Gebäude ist der Wunschplatz — ist es besetzt, sucht
        // startTechNode selbst den nächsten freien.
        var res = RT.actions.startTechNode(nid, viewState.buildingId);
        if (!res.ok) {
          RT.bus.emit('toast', res.msg || 'Kann nicht gestartet werden');
        } else {
          stopAutoRefresh();
          if (RT.ui && RT.ui.closeModal) RT.ui.closeModal();
        }
      });
    }

    // Abschließen-Button — schließt Modal, damit man das Feuerwerk am HQ sieht
    var completeBtn = body.querySelector('[data-complete]');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        var nid = completeBtn.getAttribute('data-complete');
        // Platz VOR dem Abschließen merken — danach ist der Eintrag 'done'
        // und zählt nicht mehr als belegt.
        var slotId = slotOf((RT.state.current.techtree || {})[nid]);
        var res = RT.actions.completeTechNode(nid);
        if (!res.ok) { RT.bus.emit('toast', res.msg || 'Kann nicht abgeschlossen werden'); return; }
        stopAutoRefresh();
        if (RT.ui && RT.ui.closeModal) RT.ui.closeModal();
        // Feuerwerk über dem Gebäude, das die Node entwickelt hat
        var host = slotId ? document.querySelector('.building[data-instance-id="' + slotId + '"]') : null;
        var world= document.getElementById('world');
        if (host && world && RT.ui && RT.ui.spawnFireworks) {
          var r  = host.getBoundingClientRect();
          var wr = world.getBoundingClientRect();
          var cx = r.left + r.width / 2 - wr.left;
          var cy = r.top  + r.height * 0.3 - wr.top;
          RT.ui.spawnFireworks(cx, cy);
        }
      });
    }

    // Pan gilt für jede Baum-Ansicht, auch für Reiter ohne Kanten.
    if (!viewState.detailNodeId) bindPan(body);

    // SVG-Verbindungen zeichnen nur in den Baum-Ansichten (nicht im Detail,
    // nicht in einer flachen Liste ohne eigenes Kanten-Layout).
    var edges = edgesForTab(viewState.activeTab);
    if (!viewState.detailNodeId && edges) {
      requestAnimationFrame(function () {
        drawConnections(body, edges);
        // drawConnections reserviert unten Platz für die Lanes — danach ist
        // der Inhalt höher und der Pan muss neu begrenzt werden.
        var vp = body.querySelector('#rt-tt-viewport');
        var pe = body.querySelector('#rt-tt-pan');
        if (vp && pe) applyView(pe, vp);
      });
    }

    startAutoRefresh();
  }

  // Auto-Refresh läuft NUR wenn die gerade betrachtete Node in_progress ist —
  // dort muss die Progress-Bar mit-updaten. In allen anderen Fällen kein
  // Refresh → verhindert dass Klicks verschluckt werden, weil renderModal()
  // den kompletten DOM inkl. Listener neu baut.
  function needsAutoRefresh() {
    var nid = viewState.detailNodeId;
    if (!nid) return false;
    var entry = (RT.state.current.techtree || {})[nid];
    return !!(entry && entry.status === 'in_progress');
  }
  function startAutoRefresh() {
    stopAutoRefresh();
    if (!needsAutoRefresh()) return;
    refreshTimer = setInterval(function () {
      var backdrop = document.getElementById('modal-backdrop');
      if (!backdrop || !backdrop.classList.contains('open')) {
        stopAutoRefresh();
        return;
      }
      if (!document.getElementById('rt-tt-root')) {
        stopAutoRefresh();
        return;
      }
      if (!needsAutoRefresh()) {
        stopAutoRefresh();
        return;
      }
      renderModal();
    }, 500);
  }
  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  // Bei state:changed neu rendern, falls Modal offen
  RT.bus.on('state:changed', function () {
    // Während einer Zieh- oder Pinch-Geste nicht neu bauen — siehe
    // gestureActive. Der nächste Tick holt es nach.
    if (gestureActive) return;
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop && backdrop.classList.contains('open')
        && document.getElementById('rt-tt-root')) {
      renderModal();
    }
  });

  RT.techtree = {
    NODES:          NODES,
    NODE_ORDER:     NODE_ORDER,
    EDGES:          EDGES,
    // Die Spalten-Layouts nach außen, damit sich prüfen lässt, dass jede Node
    // in genau einem steht und rechts von allen ihren requires (CLAUDE.md §9).
    // Beides fällt sonst erst im gerenderten Baum auf — als Karte, die fehlt,
    // oder als Linie, die hinter anderen Karten verschwindet.
    COLS:           COLS,
    MARKETING_COLS: MARKETING_COLS,
    WERBUNG_COLS:   WERBUNG_COLS,
    KI_COLS:        KI_COLS,
    nodeVisible:     nodeVisible,
    applyTrendBonus: applyTrendBonus,
    nodeStatus:     nodeStatus,
    lockReasons:    lockReasons,
    activeNode:     activeNode,
    readyNode:      readyNode,
    activeProgress: activeProgress,
    allPhase0Done:  allPhase0Done,
    // Entwicklungs-Plätze (HQ + Bürogebäude)
    slotOf:          slotOf,
    nodesAtBuilding:  nodesAtBuilding,
    freeDevBuilding:  freeDevBuilding,
    devBuildingOr1st: devBuildingOr1st,
    devSlotsUsed:    devSlotsUsed,
    open:           open
  };
})(window.RT3);
