/* Team-System: eine Stufe (0–6) statt variable Mitarbeiter-Zahl.
   Jede Stufe definiert Slot-Kapazität, freigeschaltete Grid-Zellen und Monatskosten.
   Slots sind der GLOBALE Pool, aus dem alle Konsumenten (Werbeagentur, Techtree,
   Kampagnen, Community Center …) sich bedienen. */
(function (RT) {
  'use strict';

  // Stufen-Tabelle — Reihenfolge = Stufen-Index.
  // teamSize ist rein visuell/erzählerisch, slots ist die Gameplay-Kapazität.
  // upgradeCost = Kosten, um DIESE Stufe zu erreichen (aus der vorigen).
  //   Solo hat null (Start), Studio hat den Preis von Groß→Studio.
  var STAGES = [
    { key: 'solo',    name: 'Solo',          teamSize: 1,    slots: 1,  gridCells: 4,  monthlyCost: 0,          upgradeCost: null       },
    { key: 'duo',     name: 'Duo',           teamSize: 2,    slots: 2,  gridCells: 7,  monthlyCost: 2500,       upgradeCost: 2500       },
    { key: 'quartet', name: 'Quartet',       teamSize: 4,    slots: 3,  gridCells: 10, monthlyCost: 10000,      upgradeCost: 10000      },
    { key: 'small',   name: 'Kleines Team',  teamSize: 10,   slots: 5,  gridCells: 13, monthlyCost: 25000,      upgradeCost: 25000      },
    { key: 'team',    name: 'Team',          teamSize: 40,   slots: 7,  gridCells: 17, monthlyCost: 100000,     upgradeCost: 100000     },
    { key: 'large',   name: 'Großes Team',   teamSize: 100,  slots: 10, gridCells: 20, monthlyCost: 1000000,    upgradeCost: 1000000    },
    { key: 'studio',  name: 'Studio',        teamSize: 1000, slots: 15, gridCells: 25, monthlyCost: 1000000000, upgradeCost: 1000000000 }
  ];

  function count()    { return STAGES.length; }
  function maxIndex() { return STAGES.length - 1; }

  function getStageIndex() {
    var s = RT.state.get();
    return typeof s.teamStufe === 'number' ? Math.max(0, Math.min(maxIndex(), s.teamStufe)) : 0;
  }

  function getStage(idx) {
    if (idx == null) idx = getStageIndex();
    return STAGES[Math.max(0, Math.min(maxIndex(), idx))];
  }

  function getName(idx)         { return getStage(idx).name; }
  function getTeamSize(idx)     { return getStage(idx).teamSize; }
  function getSlotCapacity(idx) { return getStage(idx).slots; }
  function getGridCells(idx)    { return getStage(idx).gridCells; }
  function getMonthlyCost(idx)  { return getStage(idx).monthlyCost; }
  function getUpgradeCost(idx)  { return getStage(idx).upgradeCost; }

  function canUpgrade() {
    var idx = getStageIndex();
    if (idx >= maxIndex()) return false;
    var cost = STAGES[idx + 1].upgradeCost;
    if (cost == null) return false;
    var money = (RT.state.get().resources && RT.state.get().resources.money) || 0;
    return money >= cost;
  }

  function nextStagePreview() {
    var idx = getStageIndex();
    if (idx >= maxIndex()) return null;
    return STAGES[idx + 1];
  }

  RT.team = {
    STAGES:          STAGES,
    count:           count,
    maxIndex:        maxIndex,
    getStageIndex:   getStageIndex,
    getStage:        getStage,
    getName:         getName,
    getTeamSize:     getTeamSize,
    getSlotCapacity: getSlotCapacity,
    getGridCells:    getGridCells,
    getMonthlyCost:  getMonthlyCost,
    getUpgradeCost:  getUpgradeCost,
    canUpgrade:      canUpgrade,
    nextStagePreview: nextStagePreview
  };
})(window.RT);
