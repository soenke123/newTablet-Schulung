/**
 * Statistik: einmal pro Tag Bestaende, Jungtiere, Gruppen, Nahrungsfuellstand,
 * Ratten (ein Feld, keine Tiere: row.ratten, row.rattenShare);
 * laufend Geburten und Todesfaelle nach Ursache.
 *
 * history[i] ist der Stand am Ende von Tag i - Grundlage fuer Diagramme und
 * CSV-Export.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  function Stats(sim) {
    this.sim = sim;
    this.history = [];
    this.births = {};
    this.deaths = {};
    this.eggs = {};
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var id = BT.SPECIES_ORDER[k];
      this.births[id] = 0;
      this.deaths[id] = {};
      this.eggs[id] = 0;
    }
    this.extinct = {};
    this.seen = {};             // Arten, die schon einmal auf der Insel waren
  }

  Stats.prototype.birth = function (id) { this.births[id]++; };
  Stats.prototype.nest = function (id, eggs) { this.eggs[id] += eggs; };
  Stats.prototype.death = function (id, cause) {
    this.deaths[id][cause] = (this.deaths[id][cause] || 0) + 1;
  };

  Stats.prototype.record = function () {
    var sim = this.sim;
    var row = { day: sim.day, count: {}, young: {}, groups: {}, sick: {}, food: sim.fields.levels(), health: sim.fields.healthLevels(), weather: sim.weatherNow,
      menschen: sim.humans ? sim.humans.people.length : 0, crop: this.cropNow(), used: sim.humans ? sim.humans.usedShare : 0,
      ratten: sim.rats ? Math.round(sim.rats.total) : 0, rattenShare: sim.rats ? sim.rats.share : 0 };
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var id = BT.SPECIES_ORDER[k];
      row.count[id] = 0; row.young[id] = 0; row.groups[id] = 0; row.sick[id] = 0;
    }
    for (var i = 0; i < sim.groups.length; i++) {
      var g = sim.groups[i];
      var sid = g.spec.id;
      if (!g.members.length) continue;
      row.groups[sid]++;
      for (var m = 0; m < g.members.length; m++) {
        row.count[sid]++;
        if (g.members[m].age < g.spec.maturity) row.young[sid]++;
        if (g.members[m].sick) row.sick[sid]++;
      }
    }
    for (k = 0; k < BT.SPECIES_ORDER.length; k++) {
      id = BT.SPECIES_ORDER[k];
      if (row.count[id] > 0) this.seen[id] = true;
      if (row.count[id] === 0 && this.extinct[id] == null && (sim.startCounts[id] > 0 || this.seen[id])) this.extinct[id] = sim.day;
    }
    this.history.push(row);
  };

  /**
   * Getreide auf den Aeckern in Mengen (nicht in Prozent): ripe = was wirklich steht, could = was ohne
   * Fressen stuende (die Differenz haben Tiere gefressen, seit der letzten Ernte; beide sind mit der
   * Ernte 0), cap = was alle Aecker an diesem Tag tragen koennen. Das Diagramm teilt durch cap von
   * heute (ui/app.js), so rutschen die Jahre vor einem neuen Acker nach unten. Ohne Acker null.
   */
  Stats.prototype.cropNow = function () {
    var sim = this.sim, H = sim.humans;
    if (!H || !H.fields.length) return null;
    var f = sim.fields, v = f.value.korn, p = f.potential, K = f.capacity.korn, sv = 0, sp = 0, sk = 0;
    for (var i = 0; i < v.length; i++) { sv += v[i]; sp += p[i]; sk += K[i]; }
    if (!(sk > 0)) return null;
    return { ripe: sv, could: Math.max(sv, sp), cap: sk };
  };

  Stats.prototype.latest = function () { return this.history[this.history.length - 1]; };

  /** Zeitreihe als CSV (Semikolon, deutsches Excel). */
  Stats.prototype.toCSV = function () {
    var head = ['Tag', 'Jahr', 'Jahreszeit'];
    var ids = BT.SPECIES_ORDER;
    for (var k = 0; k < ids.length; k++) head.push(BT.SPECIES[ids[k]].plural, BT.SPECIES[ids[k]].plural + ' (Jungtiere)');
    head.push(BT.RATS.plural);
    for (k = 0; k < BT.FOOD_ORDER.length; k++) head.push(BT.FOOD[BT.FOOD_ORDER[k]].name + ' (%)');
    var healthKeys = Object.keys(this.sim.fields.health);
    for (k = 0; k < healthKeys.length; k++) head.push('Zustand ' + BT.FOOD[healthKeys[k]].name + ' (%)');
    var lines = [head.join(';')];
    for (var i = 0; i < this.history.length; i++) {
      var r = this.history[i];
      var cal = BT.Time.calendar(r.day);
      var cells = [r.day, cal.year, cal.seasonName];
      for (k = 0; k < ids.length; k++) cells.push(r.count[ids[k]], r.young[ids[k]]);
      cells.push(r.ratten || 0);
      for (k = 0; k < BT.FOOD_ORDER.length; k++) cells.push(String(Math.round(r.food[BT.FOOD_ORDER[k]] * 1000) / 10).replace('.', ','));
      for (k = 0; k < healthKeys.length; k++) cells.push(String(Math.round(r.health[healthKeys[k]] * 1000) / 10).replace('.', ','));
      lines.push(cells.join(';'));
    }
    return lines.join('\n');
  };

  BT.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
