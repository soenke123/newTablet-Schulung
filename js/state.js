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

  var FARM_CAPACITY_ANIMALS      = 8;   // max sichtbare Tiere / Slot-Anzahl
  var WATCHTIME_STACK_MAX        = 5;   // max Stapel
  var WATCHTIME_CYCLE_SEC        = 5;   // Zeit für 1 Stapel
  var WATCHTIME_PER_USER_PER_CYCLE = 1; // 1 Watchtime pro User pro Zyklus

  var GRID_SIZE = 5;

  // Gebäude-Katalog: kaufbar im Shop, HQ ist fix.
  var BUILDING_TYPES = {
    farm:      { name: 'Serverfarm',       cost: 3000, size: 2,
                 sprite: 'sprites/buildings/ServerfarmWeide.png', alt: 'Serverfarm', icon: '🏭' },
    werbe:     { name: 'Werbeagentur',     cost: 2000, size: 1,
                 sprite: 'sprites/buildings/AdStudio.png',        alt: 'Werbeagentur', icon: '📢' },
    marketing: { name: 'Marketing-Center', cost: 1500, size: 1,
                 sprite: 'sprites/buildings/MarketingArgentur.png', alt: 'Marketing-Center', icon: '📱' }
  };
  var HQ_SPRITE = { sprite: 'sprites/buildings/HeadQuarter0.png', alt: 'Headquarter' };

  // Default-State pro Gebäudetyp — bekommt jede neue Instanz zugewiesen.
  function defaultInstanceState(typeId) {
    if (typeId === 'farm')      return { tierId: 'kueken', stacks: 0, cycleTime: 0 };
    if (typeId === 'werbe')     return { slider: 0, moneyReady: 0 };
    if (typeId === 'marketing') return { active: null, ready: 0 };
    if (typeId === 'hq')        return { level: 0 };
    return {};
  }

  // --- Initialer State ---
  var initial = {
    money: 100000,
    users: 300,
    watchtime: 0,
    ruf: 0.02,
    lastPassiveTick: 0,
    instanceCounter: 1,
    player: { name: null, avatar: null, platformName: null, platformLogo: null },
    // sparkHistory: rollende Sample-Reihen für die Sparkline-Grafiken in der Resource-Bar.
    // Sampling alle 30 s, max 60 Punkte = 30 min sichtbarer Verlauf.
    sparkHistory: { money: [], users: [] },
    placedBuildings: [
      { instanceId: 'hq-1', id: 'hq', col: 0, row: 0, size: 1, state: { level: 0 } }
    ]
  };

  RT.state = {
    TIERS: TIERS,
    TIER_UPGRADE_COST: TIER_UPGRADE_COST,
    CAMPAIGNS: CAMPAIGNS,
    FARM_CAPACITY_ANIMALS:        FARM_CAPACITY_ANIMALS,
    WATCHTIME_STACK_MAX:          WATCHTIME_STACK_MAX,
    WATCHTIME_CYCLE_SEC:          WATCHTIME_CYCLE_SEC,
    WATCHTIME_PER_USER_PER_CYCLE: WATCHTIME_PER_USER_PER_CYCLE,
    GRID_SIZE:                    GRID_SIZE,
    BUILDING_TYPES:               BUILDING_TYPES,
    HQ_SPRITE:                    HQ_SPRITE,

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
      if (col < 0 || row < 0) return false;
      if (col + type.size > GRID_SIZE) return false;
      if (row + type.size > GRID_SIZE) return false;
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
      if (!farmInst) return 0;
      var t = this.tierById(farmInst.state.tierId);
      if (!t) return 0;
      var u = this.usersInFarm(farmInst);
      if (u <= 0) return 0;
      return Math.min(FARM_CAPACITY_ANIMALS, Math.ceil(u / t.users));
    },

    // Watchtime pro Sekunde = User in Farm × 1 / Zyklus.
    watchtimePerSec: function (farmInst) {
      if (!farmInst) return 0;
      return this.usersInFarm(farmInst) * WATCHTIME_PER_USER_PER_CYCLE / WATCHTIME_CYCLE_SEC;
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
