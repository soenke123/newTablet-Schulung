/**
 * Nutzung: was der Mensch aus dem Gelaende macht (docs/MENSCH.md).
 *
 * world.biome bleibt die Natur, wie sie generiert wurde (und fuer jeden
 * Neustart gleich). Die Simulation rechnet mit `ground`: einer Kopie davon,
 * in der gerodete, bebaute und nachgewachsene Zellen eigene Codes haben
 * (BT.BIOME.SOIL, VILLAGE, MEADOW). Lebensraum, Deckung und Nahrung kommen
 * aus `ground` (sim.biomeAt, Fields.ground).
 *
 * Acker: offenes Land (oder Wald, der dafuer gerodet wird) wird zu Acker
 * (BT.BIOME.FIELD). Dort waechst Getreide (BT.FOOD.korn) und sonst nichts.
 *
 * Rodung: Wald und Busch werden zu nackter Erde. Dort waechst nichts. Nach
 * einigen Jahren (je Zelle verschieden, damit es fleckig gruen wird) wird die
 * Erde zur Wiese. Wald kommt in der Zeit, die man beobachtet, nicht zurueck.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  BT.LANDUSE = {
    bareYears: 3,           // so lange bleibt gerodete Erde kahl (mindestens) ...
    bareSpread: 2,          // ... plus bis zu so viele Jahre, je Zelle verschieden
    woody: [B.FERN, B.MOSS, B.SCRUB],  // was gerodet wird
    // was nie zu Acker wird: Wasser, Fels, Gipfel, Strand, Thermalfeld, Sumpf, Dorf
    noField: [B.DEEP, B.SHALLOW, B.LAKE, B.RIVER, B.ROCK, B.PEAK, B.BEACH, B.THERMAL, B.SWAMP, B.VILLAGE]
  };

  function Landuse(sim) {
    this.sim = sim;
    this.world = sim.world;
    this.ground = new Uint8Array(sim.world.biome.data);
    this.regrow = [];         // gerodete Zellen: { i, day } - wird zur Wiese an `day`
    this.version = 0;         // zaehlt Aenderungen (fuer die Darstellung)
    this.counts = { erde: 0, dorf: 0, wiese: 0, acker: 0, gerodet: 0 };
    var woody = 0, d = sim.world.biome.data;
    for (var i = 0; i < d.length; i++) if (BT.LANDUSE.woody.indexOf(d[i]) >= 0) woody++;
    this.woodyCells = woody;  // Wald und Busch zu Beginn
  }

  /** Lebensraum, mit dem die Tiere rechnen (Natur oder Nutzung). */
  Landuse.prototype.biomeAt = function (x, y) {
    var i = this.world.query.index(x, y);
    return i < 0 ? B.DEEP : this.ground[i];
  };

  /** Ist der Punkt (in Weltkoordinaten) gerodet, bebaut oder nachgewachsen? */
  Landuse.prototype.changed = function (i) { return this.ground[i] !== this.world.biome.data[i]; };

  /** Zellen im Umkreis, deren Mittelpunkt in der (unregelmaessigen) Form liegt. */
  function eachCell(world, cx, cy, radius, shape, fn) {
    var cell = world.cellSize, rc = Math.ceil(radius * 1.3 / cell);
    var gx0 = Math.floor(cx / cell), gy0 = Math.floor(cy / cell);
    for (var gy = gy0 - rc; gy <= gy0 + rc; gy++) {
      for (var gx = gx0 - rc; gx <= gx0 + rc; gx++) {
        if (gx < 0 || gy < 0 || gx >= world.cols || gy >= world.rows) continue;
        var px = (gx + 0.5) * cell - cx, py = (gy + 0.5) * cell - cy;
        var r = radius;
        if (shape) {
          var a = BT.M.atan2(py, px);
          r *= 1 + shape[0] * BT.M.sin(3 * a + shape[1]) + shape[2] * BT.M.sin(5 * a + shape[3]);
        }
        if (px * px + py * py <= r * r) fn(gy * world.cols + gx);
      }
    }
  }

  /** Liegt die Zelle in einer eingezaeunten Weide? Die bleibt, wie sie ist (kein Roden, Pfluegen, Bauen). */
  Landuse.prototype.fenced = function (i) {
    var h = this.sim.humans;
    return !!(h && h.fence && h.fence[i]);
  };

  /** Wie viele Wald- und Buschzellen (ausserhalb von Weiden) liegen im Umkreis? */
  Landuse.prototype.woodyAround = function (x, y, radius) {
    var n = 0, g = this.ground, woody = BT.LANDUSE.woody, self = this;
    eachCell(this.world, x, y, radius, null, function (i) { if (woody.indexOf(g[i]) >= 0 && !self.fenced(i)) n++; });
    return n;
  };

  /**
   * Wald und Busch in einer unregelmaessigen Flaeche roden. shape: vier Zahlen
   * fuer die Form des Randes (aus dem Zufall der Menschen). Liefert die Zahl
   * der gerodeten Zellen.
   */
  Landuse.prototype.clear = function (x, y, radius, shape) {
    var self = this, cfg = BT.LANDUSE, n = 0;
    eachCell(this.world, x, y, radius, shape, function (i) {
      if (cfg.woody.indexOf(self.ground[i]) < 0 || self.fenced(i)) return;
      self.soil(i);
      n++;
    });
    if (n) this.update();
    return n;
  };

  /** Zelle wird nackte Erde und waechst nach einigen Jahren wieder zu. */
  Landuse.prototype.soil = function (i) {
    var cfg = BT.LANDUSE;
    this.ground[i] = B.SOIL;
    // je Zelle eine eigene Wartezeit (fester Hash, kein Zufall noetig)
    var h = Math.imul(i ^ (i >>> 7), 2654435761) >>> 0;
    var wait = BT.Time.years(cfg.bareYears) + h % (BT.Time.years(cfg.bareSpread) + 1);
    this.regrow.push({ i: i, day: this.sim.day + wait });
  };

  /**
   * Aufgeben (Karte zurueckgenommen): Acker und Dorfplatz in `cells` werden
   * zu Erde. Was einmal Wald war, wird spaeter Wiese, alles andere wieder,
   * was es von Natur aus war (eco/landuse.js newDay).
   */
  Landuse.prototype.abandon = function (cells) {
    var n = 0;
    for (var k = 0; k < cells.length; k++) {
      var b = this.ground[cells[k]];
      if (b !== B.FIELD && b !== B.VILLAGE) continue;
      this.soil(cells[k]);
      n++;
    }
    if (n) this.update();
    return n;
  };

  /** Wie viele Zellen im Umkreis koennten Acker werden (und wie viele davon sind Wald, Acker, Weide)? */
  Landuse.prototype.fieldAround = function (x, y, radius) {
    var g = this.ground, cfg = BT.LANDUSE, self = this, out = { ok: 0, woody: 0, field: 0, fence: 0 };
    eachCell(this.world, x, y, radius, null, function (i) {
      if (self.fenced(i)) { out.fence++; return; }
      if (g[i] === B.FIELD) { out.field++; return; }
      if (cfg.noField.indexOf(g[i]) >= 0) return;
      out.ok++;
      if (cfg.woody.indexOf(g[i]) >= 0) out.woody++;
    });
    return out;
  };

  /** Acker anlegen: geeignetes Land in der Flaeche wird Acker. Liefert die Zahl der Zellen (die Zellen selbst in `out`). */
  Landuse.prototype.plow = function (x, y, radius, shape, out) {
    var self = this, cfg = BT.LANDUSE, n = 0;
    eachCell(this.world, x, y, radius, shape, function (i) {
      var b = self.ground[i];
      if (b === B.FIELD || cfg.noField.indexOf(b) >= 0 || self.fenced(i)) return;
      self.ground[i] = B.FIELD;
      if (out) out.push(i);
      n++;
    });
    if (n) {
      var g = this.ground;
      this.regrow = this.regrow.filter(function (r) { return g[r.i] === B.SOIL; });
      this.update();
    }
    return n;
  };

  /** Bebauen: alles Land im Umkreis wird Dorf (Haeuser, Wege, Gaerten). */
  Landuse.prototype.build = function (x, y, radius) {
    var self = this, n = 0;
    eachCell(this.world, x, y, radius, null, function (i) {
      var b = self.ground[i];
      if (!BT.BIOME_INFO[b].land || b === B.VILLAGE || b === B.FIELD || self.fenced(i)) return;
      self.ground[i] = B.VILLAGE;
      n++;
    });
    if (n) {
      // bebaute Erde waechst nicht mehr nach
      var g = this.ground;
      this.regrow = this.regrow.filter(function (r) { return g[r.i] === B.SOIL; });
      this.update();
    }
    return n;
  };

  /**
   * Einmal am Tag: Erde, deren Zeit gekommen ist, waechst zu: wo Wald war,
   * zu Wiese (Wald kommt nicht zurueck), sonst zu dem, was dort von Natur aus
   * war (ein aufgegebener Acker im Tussock wird wieder Tussock).
   */
  Landuse.prototype.newDay = function () {
    if (!this.regrow.length) return;
    var day = this.sim.day, g = this.ground, nat = this.world.biome.data, woody = BT.LANDUSE.woody, n = 0;
    for (var k = this.regrow.length - 1; k >= 0; k--) {
      var r = this.regrow[k];
      if (r.day > day) continue;
      if (g[r.i] === B.SOIL) { g[r.i] = woody.indexOf(nat[r.i]) >= 0 ? B.MEADOW : nat[r.i]; n++; }
      this.regrow.splice(k, 1);
    }
    if (n) this.update();
  };

  /** Nach jeder Aenderung: Nahrung neu berechnen, Flaechen zaehlen. */
  Landuse.prototype.update = function () {
    this.sim.fields.rebuildCapacity();
    var c = { erde: 0, dorf: 0, wiese: 0, acker: 0, gerodet: 0 }, g = this.ground, nat = this.world.biome.data;
    var woody = BT.LANDUSE.woody;
    for (var i = 0; i < g.length; i++) {
      if (g[i] === nat[i]) continue;
      if (g[i] === B.SOIL) c.erde++;
      else if (g[i] === B.VILLAGE) c.dorf++;
      else if (g[i] === B.MEADOW) c.wiese++;
      else if (g[i] === B.FIELD) c.acker++;
      if (woody.indexOf(nat[i]) >= 0) c.gerodet++;
    }
    this.counts = c;
    this.version++;
  };

  Landuse.eachCell = eachCell;
  BT.Landuse = Landuse;
})(typeof window !== 'undefined' ? window : globalThis);
