/* State — 4 feste Gebäude (HQ, Serverfarm, Werbeagentur, Marketing).
   Farmen heißen immer "Serverfarm (Stufe N)". Das Tier (kueken … elefant)
   ist nur die visuelle Repräsentation der Stufe — kein Gameplay-Element. */
(function (RT) {
  'use strict';

  // Tier-Stufen: interner Schlüssel für Sprite + User/Slot.
  // Kapazität = 8 × users pro Tier.
  var TIERS = [
    { id: 'kueken',  icon: '🐣', users: 500,        sprite: 'sprites/User/UserKüken.png',   alt: 'Küken'   },
    { id: 'huhn',    icon: '🐔', users: 2000,       sprite: 'sprites/User/UserHuhn.png',    alt: 'Huhn'    },
    { id: 'gans',    icon: '🦆', users: 10000,      sprite: 'sprites/User/UserGans.png',    alt: 'Gans'    },
    { id: 'schaf',   icon: '🐑', users: 50000,      sprite: 'sprites/User/UserZiege.png',   alt: 'Schaf'   },
    { id: 'schwein', icon: '🐷', users: 500000,     sprite: 'sprites/User/UserSchwein.png', alt: 'Schwein' },
    { id: 'kuh',     icon: '🐄', users: 5000000,    sprite: 'sprites/User/UserKuh.png',     alt: 'Kuh'     },
    { id: 'elefant', icon: '🐘', users: 50000000,   sprite: 'sprites/User/UserElefant.png', alt: 'Elefant' }
  ];

  // Upgrade-Kosten für den Sprung auf die jeweils nächste Stufe.
  var TIER_UPGRADE_COST = {
    kueken:  500,
    huhn:    3000,
    gans:    25000,
    schaf:   200000,
    schwein: 2000000,
    kuh:     20000000
  };

  // Marketing-Kampagnen: alle laufen im Marketing-Gebäude.
  var CAMPAIGNS = [
    { id: 'zettel', name: 'Kiez-Zettel', icon: '📮', cost: 100,   duration: 30,  users: 100 },
    { id: 'insta',  name: 'Insta-Reels', icon: '📱', cost: 1000,  duration: 60,  users: 1500 },
    { id: 'tv',     name: 'TV-Spot',     icon: '📺', cost: 10000, duration: 120, users: 20000 }
  ];

  // --- Werbearten ---
  // Ein Deal in der Werbeagentur läuft AD_CYCLES_MAX Zyklen und ist dann vorbei.
  // Jeder Zyklus kostet 'watchtime' (vorab abgebucht) und dauert 'duration'.
  // eur50/trend50 sind die Referenzwerte bei 50 % Intensität — siehe
  // adMoneyPerCycle() / adTrendMalus() für die Kurven dazwischen.
  //
  // Die drei Arten haben bewusst unterschiedliche Profile:
  //   Banner — billigster Einstieg, aber 10× so viel Trend-Schaden je Euro wie Feed
  //   Feed   — bestes €/Watchtime (0,100) und bestes €/s
  //   Video  — beste Trend-Effizienz (156 € je Trend-Sekunde), frisst dafür Watchtime
  var AD_TYPES = [
    { id: 'banner', name: 'Banner',        icon: '🪧', watchtime: 10000,  duration: 10, eur50: 500,  trend50: 5 },
    { id: 'feed',   name: 'Feed-Werbung',  icon: '📰', watchtime: 40000,  duration: 20, eur50: 4000, trend50: 2 },
    { id: 'video',  name: 'Werbevideo',    icon: '🎬', watchtime: 150000, duration: 45, eur50: 7000, trend50: 1 }
  ];
  var AD_CYCLES_MAX  = 5;     // Zyklen pro Deal, danach ist der Deal vorbei
  var AD_INTENSITY_MIN = 0.01;
  var AD_INTENSITY_MAX = 0.50;

  var FARM_CAPACITY_ANIMALS      = 8;   // max sichtbare Tiere / Slot-Anzahl
  var WATCHTIME_STACK_MAX        = 5;   // max Stapel
  var WATCHTIME_CYCLE_SEC        = 5;   // Zeit für 1 Stapel
  var WATCHTIME_PER_USER_PER_CYCLE = 1; // 1 Watchtime pro User pro Zyklus

  // --- Trend ---
  // Der Trend ist die User-Wachstumsrate in Prozentpunkten: Trend +3 heißt,
  // dass pro Zyklus 3 % der aktuellen User dazukommen. Er wird nie direkt
  // hoch- oder runtergezählt, sondern ist immer die Summe der aktiven
  // Modifikatoren in current.trendMods — dadurch bleibt die Aufschlüsselung
  // im Info-Modal per Konstruktion korrekt.
  var TREND_CYCLE_SEC     = 15;  // ein Zyklus = ein Stapel
  var TREND_STACK_MAX     = 5;   // danach steht die Produktion still
  var TREND_MIN           = -20;
  var TREND_MAX           = 20;
  var TREND_SHIELD_SEC    = 45;  // Schadensbegrenzung halbiert so lange den Abfluss
  var TREND_SHIELD_CD_SEC = 60;  // … und ist erst danach wieder klickbar

  var GRID_SIZE = 5;

  // Gebäude-Katalog: kaufbar im Shop, HQ ist fix.
  // cost = Basis-Preis Phase 0/1. Ab Phase 2 gilt für die Farm der höhere
  // Huhn-Preis (siehe buildingCost()). Werbe/Marketing sind nur ab Phase 2
  // im Shop, daher direkt der Phase-2-Preis.
  var BUILDING_TYPES = {
    farm:      { name: 'Serverfarm',       cost: 900,   size: 2,
                 sprite: 'sprites/buildings/ServerfarmWeide.png', alt: 'Serverfarm', icon: '🏭' },
    werbe:     { name: 'Werbeagentur',     cost: 15000, size: 1,
                 sprite: 'sprites/buildings/AdStudio.png',        alt: 'Werbeagentur', icon: '📢' },
    marketing: { name: 'Marketing-Center', cost: 15000, size: 1,
                 sprite: 'sprites/buildings/MarketingArgentur.png', alt: 'Marketing-Center', icon: '📱' }
  };
  var FARM_COST_PHASE2 = 10000;
  var HQ_SPRITE = { sprite: 'sprites/buildings/HeadQuarter0.png', alt: 'Headquarter' };

  // Default-State pro Gebäudetyp — bekommt jede neue Instanz zugewiesen.
  function defaultInstanceState(typeId) {
    if (typeId === 'farm')      return { tierId: 'kueken', stacks: 0, cycleTime: 0 };
    // werbe: deal = laufender Werbedeal (null = idle), lastDeal = letzte Wahl
    // für die Ein-Klick-Wiederbuchung auf dem Feld.
    if (typeId === 'werbe')     return { deal: null, moneyReady: 0, lastDeal: null };
    if (typeId === 'marketing') return { active: null, ready: 0 };
    if (typeId === 'hq')        return { level: 0 };
    return {};
  }

  // --- Initialer State ---
  var initial = {
    money: 1500,
    users: 0,
    watchtime: 0,
    // Trend-System (ab Phase 2 aktiv):
    //   trendMods       — id → { label, value, expiresAt } , Summe = Trend
    //   trendStacks     — gebunkerte Zyklen, max TREND_STACK_MAX
    //   trendCycleTime  — Sekunden bis zum nächsten Stapel
    //   trendDrainAcc   — Bruchteile abgewanderter User (negativer Trend)
    //   trendShield*    — Schadensbegrenzung: aktiv bis / wieder klickbar ab
    trendMods: { basis: { label: 'Grundinteresse', value: 3, expiresAt: 0 } },
    trendStacks: 0,
    trendCycleTime: 0,
    trendDrainAcc: 0,
    trendShieldUntil: 0,
    trendShieldReadyAt: 0,
    // Erklär-Modal zum Trend — einmalig beim Start von Phase 2.
    trendModalSeen: false,
    // Zeitstempel des letzten Speicherns — Basis für den Offline-Aufholpass.
    savedAt: 0,
    // Flyer-Bonus: alle 8 s werden User × 1,10 (Zinseszins), solange
    // mk_flyer 'done' ist UND users < 1000 UND Phase < 2. Der letzte
    // Tick-Zeitpunkt wird hier gemerkt.
    lastFlyerTick: 0,
    // Investor-Meilenstein bei 1000 Usern — einmalig. Löst Phase-2 aus.
    investorTriggered: false,
    // Go-Live-Info-Modal (erklärt neue Techtree-Reiter) — einmalig nach Launch.
    goLiveModalSeen: false,
    instanceCounter: 1,
    player: { name: null, avatar: null, platformName: null, platformLogo: null },
    // sparkHistory: rollende Sample-Reihen für die Sparkline-Grafiken in der Resource-Bar.
    // Sampling alle 30 s, max 60 Punkte = 30 min sichtbarer Verlauf.
    sparkHistory: { money: [], users: [] },
    // Techtree-Fortschritt: nodeId → { status, startAt } (status: 'in_progress' | 'done')
    // Nodes ohne Eintrag gelten als 'locked' oder 'available' (via nodeStatus()).
    techtree: {},
    // Hardware-Käufe aus dem Shop (einmalig).
    purchases: { rechner: false },
    // true nach erfolgreichem "Plattform online stellen" — schaltet Grid + Gebäude frei.
    goLiveUnlocked: false,
    // Gelbe "!"-Badges auf UI-Elementen mit neuem Inhalt. Werden bei Klick auf
    // das jeweilige Element auf true gesetzt und verschwinden dann dauerhaft.
    // hq_phase0/hq_phase1: HQ-Badge, taucht bei jeder Phase neu auf.
    seenBadges: {
      hq_phase0: false,
      hq_phase1: false,
      shop:      false,
      tab_marketing: false,
      tab_werbung:   false
    },
    placedBuildings: [
      { instanceId: 'hq-1', id: 'hq', col: 0, row: 0, size: 1, state: { level: 0 } }
    ]
  };

  RT.state = {
    TIERS: TIERS,
    TIER_UPGRADE_COST: TIER_UPGRADE_COST,
    CAMPAIGNS: CAMPAIGNS,
    AD_TYPES:                     AD_TYPES,
    AD_CYCLES_MAX:                AD_CYCLES_MAX,
    AD_INTENSITY_MIN:             AD_INTENSITY_MIN,
    AD_INTENSITY_MAX:             AD_INTENSITY_MAX,
    FARM_CAPACITY_ANIMALS:        FARM_CAPACITY_ANIMALS,
    WATCHTIME_STACK_MAX:          WATCHTIME_STACK_MAX,
    WATCHTIME_CYCLE_SEC:          WATCHTIME_CYCLE_SEC,
    WATCHTIME_PER_USER_PER_CYCLE: WATCHTIME_PER_USER_PER_CYCLE,
    TREND_CYCLE_SEC:              TREND_CYCLE_SEC,
    TREND_STACK_MAX:              TREND_STACK_MAX,
    TREND_MIN:                    TREND_MIN,
    TREND_MAX:                    TREND_MAX,
    TREND_SHIELD_SEC:             TREND_SHIELD_SEC,
    TREND_SHIELD_CD_SEC:          TREND_SHIELD_CD_SEC,
    GRID_SIZE:                    GRID_SIZE,
    BUILDING_TYPES:               BUILDING_TYPES,
    FARM_COST_PHASE2:             FARM_COST_PHASE2,
    HQ_SPRITE:                    HQ_SPRITE,

    // Aktueller Kaufpreis eines Gebäudetyps (phase-abhängig für 'farm').
    buildingCost: function (typeId) {
      if (typeId === 'farm' && this.currentPhase() >= 2) return FARM_COST_PHASE2;
      var t = BUILDING_TYPES[typeId];
      return t ? t.cost : 0;
    },

    current: JSON.parse(JSON.stringify(initial)),

    defaultInstanceState: defaultInstanceState,

    isOccupied: function (col, row) {
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        var b = pb[i];
        for (var dc = 0; dc < b.size; dc++) {
          for (var dr = 0; dr < b.size; dr++) {
            if (b.col + dc === col && b.row + dr === row) return true;
          }
        }
      }
      return false;
    },
    canPlace: function (typeId, col, row) {
      var type = BUILDING_TYPES[typeId];
      if (!type) return false;
      var gs = this.gridSizeEffective();
      // Baubar ist immer nur die Freizone [0, free-1] — nicht die grauen
      // Kranz-Felder aus Phase 2.
      if (col < 0 || row < 0) return false;
      if (col + type.size > gs.free) return false;
      if (row + type.size > gs.free) return false;
      for (var dc = 0; dc < type.size; dc++) {
        for (var dr = 0; dr < type.size; dr++) {
          if (this.isOccupied(col + dc, row + dr)) return false;
        }
      }
      return true;
    },
    getInstance: function (instanceId) {
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        if (pb[i].instanceId === instanceId) return pb[i];
      }
      return null;
    },
    instancesByType: function (typeId) {
      var out = [];
      var pb = this.current.placedBuildings;
      for (var i = 0; i < pb.length; i++) {
        if (pb[i].id === typeId) out.push(pb[i]);
      }
      return out;
    },
    newInstanceId: function (typeId) {
      this.current.instanceCounter += 1;
      return typeId + '-' + this.current.instanceCounter;
    },

    tierById: function (id) {
      for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return TIERS[i];
      return null;
    },
    tierIndex: function (id) {
      for (var i = 0; i < TIERS.length; i++) if (TIERS[i].id === id) return i;
      return -1;
    },
    nextTier: function (id) {
      var i = this.tierIndex(id);
      return (i >= 0 && i < TIERS.length - 1) ? TIERS[i + 1] : null;
    },
    // Stufen-Label 1..7 aus tierId — für "Serverfarm (Stufe N)" im UI.
    tierStufe: function (id) {
      var i = this.tierIndex(id);
      return i >= 0 ? i + 1 : 1;
    },
    campaignById: function (id) {
      for (var i = 0; i < CAMPAIGNS.length; i++) if (CAMPAIGNS[i].id === id) return CAMPAIGNS[i];
      return null;
    },

    // --- Werbedeal-Formeln (einzige Quelle, Loop UND UI rechnen hierüber) ---
    adTypeById: function (id) {
      for (var i = 0; i < AD_TYPES.length; i++) if (AD_TYPES[i].id === id) return AD_TYPES[i];
      return null;
    },
    clampAdIntensity: function (i) {
      if (typeof i !== 'number' || isNaN(i)) return AD_INTENSITY_MIN;
      return Math.max(AD_INTENSITY_MIN, Math.min(AD_INTENSITY_MAX, i));
    },

    // Geld wächst LINEAR mit der Intensität, der Trend-Malus QUADRATISCH.
    // Dadurch ist niedrige Intensität trend-effizient (aber watchtime-verschwendend)
    // und hohe Intensität watchtime-effizient (aber trend-teuer) — der Regler ist
    // damit eine echte Entscheidung statt eines reinen Tempo-Knopfes.
    adMoneyPerCycle: function (typeId, intensity) {
      var t = this.adTypeById(typeId);
      if (!t) return 0;
      var r = this.clampAdIntensity(intensity) / AD_INTENSITY_MAX;
      return t.eur50 * r * this.adRevenueMult();
    },
    adTrendMalus: function (typeId, intensity) {
      var t = this.adTypeById(typeId);
      if (!t) return 0;
      var r = this.clampAdIntensity(intensity) / AD_INTENSITY_MAX;
      return t.trend50 * r * r * this.adTrendMult();
    },

    // Techtree-Schnittstelle: bis Nodes dafür existieren, neutral bei 1.
    // Ein späterer Node ("Ad-Optimierung: +25 % Werbeertrag") ist dann eine
    // Zeile hier — analog zu flyerBonusActive().
    adRevenueMult: function () { return 1; },
    adTrendMult:   function () { return 1; },

    // Kapazität pro Farm = users pro Tier × Slot-Anzahl.
    farmCapacity: function (farmInst) {
      if (!farmInst) return 0;
      var t = this.tierById(farmInst.state.tierId);
      if (!t) return 0;
      return t.users * FARM_CAPACITY_ANIMALS;
    },

    // Summe aller Farm-Kapazitäten — das ist die Serverkapazität-Ressource.
    serverCapacityTotal: function () {
      var farms = this.instancesByType('farm');
      var total = 0;
      for (var i = 0; i < farms.length; i++) total += this.farmCapacity(farms[i]);
      return total;
    },

    // Sequenzielle User-Verteilung: Farm 1 (nach Kauf-Reihenfolge) läuft
    // zuerst voll, dann Farm 2, usw. Reihenfolge = placedBuildings-Array.
    usersInFarm: function (farmInst) {
      if (!farmInst) return 0;
      var farms = this.instancesByType('farm');
      var remaining = this.current.users;
      for (var i = 0; i < farms.length; i++) {
        var cap  = this.farmCapacity(farms[i]);
        var take = Math.min(cap, remaining);
        if (farms[i].instanceId === farmInst.instanceId) return take;
        remaining -= take;
      }
      return 0;
    },

    // Anzahl sichtbarer Tiere im Zaun (aufgerundet, letztes Tier ggf. partial).
    // 1250 User in Küken-Farm = ceil(1250/250) = 5 Küken; 1250 User in Huhn-Farm
    // = ceil(1250/1000) = 2 Hühner.
    animalsInFarm: function (farmInst) {
      var slots = this.farmSlots(farmInst);
      return slots.animals;
    },

    // Verteilung der 8 Slots pro Farm auf Kisten (Programm) und Tiere (User).
    // Kisten haben visuellen Slot-VORRANG. Tiere werden abgeschnitten wenn nötig,
    // aber die User-Kapazität wird numerisch NICHT reduziert (die Zahl bleibt im Modal).
    // Regel: min. 1 Kiste sobald Programm > 0.
    farmSlots: function (farmInst) {
      if (!farmInst) return { boxes: 0, animals: 0 };
      var t = this.tierById(farmInst.state.tierId);
      if (!t) return { boxes: 0, animals: 0 };
      var u = this.usersInFarm(farmInst);
      var p = this.programmInFarm(farmInst);

      var boxes = 0;
      if (p > 0) boxes = Math.max(1, Math.ceil(p / t.users));
      boxes = Math.min(FARM_CAPACITY_ANIMALS, boxes);

      var remainingSlots = FARM_CAPACITY_ANIMALS - boxes;
      var animals = 0;
      if (u > 0 && remainingSlots > 0) {
        animals = Math.min(remainingSlots, Math.ceil(u / t.users));
      }
      return { boxes: boxes, animals: animals };
    },

    // Watchtime pro Sekunde = User in Farm × 1 / Zyklus.
    watchtimePerSec: function (farmInst) {
      if (!farmInst) return 0;
      return this.usersInFarm(farmInst) * WATCHTIME_PER_USER_PER_CYCLE / WATCHTIME_CYCLE_SEC;
    },

    // Summe der Server-Kapazität, die aktive Techtree-Nodes belegen.
    // Zählt done + in_progress + ready — sobald eine Node gestartet wird, ist
    // ihr Server-Anteil reserviert. Das verhindert User-Überläufe während Bau.
    programmCapacity: function () {
      var tt = this.current.techtree || {};
      var nodes = (RT.techtree && RT.techtree.NODES) || {};
      var total = 0;
      for (var nid in nodes) {
        if (!Object.prototype.hasOwnProperty.call(nodes, nid)) continue;
        var entry = tt[nid];
        if (!entry) continue;
        if (entry.status === 'done' || entry.status === 'in_progress' || entry.status === 'ready') {
          total += nodes[nid].server || 0;
        }
      }
      return total;
    },

    // Sequenzielle Programm-Verteilung analog zu usersInFarm — Farm 1 wird
    // zuerst mit Programmen aufgefüllt, dann Farm 2. Für Kisten-Visualisierung.
    programmInFarm: function (farmInst) {
      if (!farmInst) return 0;
      var farms = this.instancesByType('farm');
      var remaining = this.programmCapacity();
      for (var i = 0; i < farms.length; i++) {
        var cap  = this.farmCapacity(farms[i]);
        var take = Math.min(cap, remaining);
        if (farms[i].instanceId === farmInst.instanceId) return take;
        remaining -= take;
      }
      return 0;
    },

    // --- Trend ---
    // Alle noch laufenden Modifikatoren, absteigend nach Betrag sortiert.
    // Das ist gleichzeitig die Datenquelle für die Aufschlüsselung im Modal.
    activeTrendMods: function () {
      var mods = this.current.trendMods || {};
      var now  = Date.now();
      var out  = [];
      for (var id in mods) {
        if (!Object.prototype.hasOwnProperty.call(mods, id)) continue;
        var m = mods[id];
        if (!m || !m.value) continue;
        if (m.expiresAt && m.expiresAt <= now) continue;
        out.push({ id: id, label: m.label, value: m.value, expiresAt: m.expiresAt || 0 });
      }
      out.sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); });
      return out;
    },

    // Der Trend selbst: Summe aller aktiven Modifikatoren, auf ±20 geklemmt.
    trendValue: function () {
      var mods = this.activeTrendMods();
      var sum  = 0;
      for (var i = 0; i < mods.length; i++) sum += mods[i].value;
      sum = Math.round(sum * 10) / 10;
      return Math.max(TREND_MIN, Math.min(TREND_MAX, sum));
    },

    // ttlSec > 0 macht den Modifikator befristet (z. B. Shitstorm).
    setTrendMod: function (id, label, value, ttlSec) {
      if (!this.current.trendMods) this.current.trendMods = {};
      this.current.trendMods[id] = {
        label:     label,
        value:     value,
        expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : 0
      };
    },
    removeTrendMod: function (id) {
      if (this.current.trendMods) delete this.current.trendMods[id];
    },
    // Abgelaufene Modifikatoren wegräumen — der Tick ruft das auf.
    pruneTrendMods: function () {
      var mods = this.current.trendMods || {};
      var now  = Date.now();
      for (var id in mods) {
        if (!Object.prototype.hasOwnProperty.call(mods, id)) continue;
        var m = mods[id];
        if (m && m.expiresAt && m.expiresAt <= now) delete mods[id];
      }
    },

    // Freie User-Plätze: Serverkapazität minus User minus laufende Programme.
    freeUserCapacity: function () {
      return Math.max(0, this.serverCapacityTotal() - this.current.users - this.programmCapacity());
    },

    // User-Veränderung, die ein einzelner Zyklus bringt (negativ = Abwanderung).
    trendUsersPerCycle: function () {
      var t = this.trendValue();
      if (!t) return 0;
      var n = Math.max(1, Math.floor(Math.abs(this.current.users) * Math.abs(t) / 100));
      return t < 0 ? -n : n;
    },

    // User, die die aktuell gebunkerten Stapel einbringen würden.
    // Linear pro Stapel — 5 Stapel bei +3 % sind +15 %, nicht 1,03^5.
    trendUsersReady: function () {
      var t  = this.trendValue();
      var st = this.current.trendStacks || 0;
      if (t <= 0 || st <= 0) return 0;
      return Math.max(st, Math.floor(this.current.users * t / 100 * st));
    },

    trendShieldActive: function () { return Date.now() <  (this.current.trendShieldUntil   || 0); },
    trendShieldReady:  function () { return Date.now() >= (this.current.trendShieldReadyAt || 0); },

    // Effektive Grid-Größe pro Phase.
    //   free  = spielbare Freizone (0..free-1 auf jeder Achse)
    //   min/max = Render-Range inkl. der ausgegrauten Kranz-Felder (Phase 2)
    //   total = max - min + 1 (nur für Debug/Overlay)
    // Phase 0/1: 3×3, keine Kranz-Felder.
    // Phase 2: 4×4 frei + 20×20 total, mit 8 grauen Reihen in jede Richtung.
    gridSizeEffective: function () {
      if (this.currentPhase() < 2) {
        return { free: 3, min: 0, max: 2, total: 3 };
      }
      return { free: 4, min: -8, max: 11, total: 20 };
    },

    // Spielphase: 0 = vor Go-Live, 1 = online, jagen die ersten 1000 User,
    // 2 = nach Investor (Watchtime + Trend werden erst hier relevant).
    currentPhase: function () {
      if (!this.current.goLiveUnlocked)  return 0;
      if (!this.current.investorTriggered) return 1;
      return 2;
    },

    // Notification-Badge sichtbar? Ein Badge (Key aus seenBadges) zeigt, dass
    // an einem UI-Element neuer Inhalt wartet. Bei Klick wird er dauerhaft weg.
    badgeVisible: function (key) {
      return !this.current.seenBadges[key];
    },
    markSeen: function (key) {
      if (this.current.seenBadges[key]) return;
      this.current.seenBadges[key] = true;
      if (RT.bus && RT.bus.emit) RT.bus.emit('state:changed');
    },

    // Flyerbonus aktiv: mk_flyer fertig UND wir sind noch in der 0..1000-Phase.
    flyerBonusActive: function () {
      if (this.currentPhase() >= 2) return false;
      if ((this.current.users || 0) >= 1000) return false;
      var e = (this.current.techtree || {}).mk_flyer;
      return !!(e && e.status === 'done');
    },

    // Player wird beim Onboarding (character + platform Screen) gesetzt.
    setPlayer: function (patch) {
      Object.assign(this.current.player, patch);
    },

    // Ein neuer Datenpunkt in die Sparkline-Historie schieben. Ältester fliegt raus.
    pushSparkSample: function () {
      var h = this.current.sparkHistory;
      h.money.push(this.current.money);
      if (h.money.length > 60) h.money.shift();
      h.users.push(this.current.users);
      if (h.users.length > 60) h.users.shift();
    }
  };
})(window.RT3);
