/**
 * Nahrungsfelder: Gras, Laub, Fruechte, Insekten als Menge je Weidezelle.
 *
 * Eine Weidezelle fasst FIELD_CELLS x FIELD_CELLS Rasterzellen zusammen. Das
 * ist grob genug, um auch Jahrzehnte schnell zu rechnen, und fein genug, dass
 * abgeweidete Flaechen auf der Karte sichtbar werden.
 *
 * Wachstum pro Tag:  v += rate * jahreszeit * (v + seed * K) * (1 - v / K)
 * Pflanzen wachsen aus ihren Blaettern: Halb abgefressen waechst am meisten
 * nach, kahl gefressen fast nichts (nur aus Wurzeln und Samenbank, `seed`).
 *
 * Ueberweidung: Wird eine Zelle immer wieder kahl gefressen, sinkt ihr
 * Pflanzenzustand (health, 0..1). Abgestorbene Pflanzen tragen weniger:
 * K = Kapazitaet * (dead + (1 - dead) * health), dead aus BT.FOOD[..].damage.
 * Bei den Insekten ist es die Brut im Boden: Scharren zu viele Laufvoegel eine
 * Gegend leer, schluepfen dort weniger nach. Erholen kann sich eine
 * Zelle erst nach einer Schonzeit ohne Ueberweidung (damage.rest Tage), und
 * dann umso langsamer, je kaputter sie ist: Kahler Boden muss erst wieder
 * besiedelt werden. Ganz verschwinden kann eine Pflanzenschicht nicht.
 *
 * Jahreswetter (eco/weather.js): Wachstum mal weather.growth, im Winter geteilt
 * durch die Winterhaerte; im Mastjahr traegt eine Schicht mit `mast` im Sommer
 * und Herbst entsprechend mehr; Schichten mit `decay` schwinden (Fruechte
 * verrotten, Insekten sterben im Winter), in harten Wintern schneller.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var FIELD_CELLS = 4;

  function Fields(world) {
    this.world = world;
    this.step = FIELD_CELLS;
    this.size = world.cellSize * FIELD_CELLS;           // Weltunits je Weidezelle
    this.cols = Math.ceil(world.cols / FIELD_CELLS);
    this.rows = Math.ceil(world.rows / FIELD_CELLS);
    var n = this.cols * this.rows;
    this.capacity = {};
    this.value = {};
    this.health = {};     // Pflanzenzustand je Schicht mit Ueberweidung
    this.bitten = {};     // heute gefressen (fuer die Ueberweidung)
    this.rest = {};       // Tage seit der letzten Ueberweidung
    this.eaten = {};      // insgesamt gefressen je Schicht (fuer die Ernte-Bilanz)
    this.potential = new Float32Array(n);   // Getreide, das stuende, wenn nie gefressen wuerde (Schattenrechnung, nur korn)
    for (var k = 0; k < BT.FOOD_ORDER.length; k++) {
      var key = BT.FOOD_ORDER[k];
      this.capacity[key] = new Float32Array(n);
      this.value[key] = new Float32Array(n);
      this.bitten[key] = new Float32Array(n);
      this.eaten[key] = 0;
      if (BT.FOOD[key].damage) {
        this.health[key] = new Float32Array(n).fill(1);
        this.rest[key] = new Uint16Array(n).fill(65535);
      }
    }
    this.rebuildCapacity();
    // Start: alles voll ausgewachsen
    for (k = 0; k < BT.FOOD_ORDER.length; k++) {
      key = BT.FOOD_ORDER[k];
      this.value[key].set(this.capacity[key]);
    }
    // Kapazitaet der unberuehrten Insel: 100 % in den Diagrammen (Rodung, Acker und Dorf senken sie)
    this.startTotal = {};
    for (k = 0; k < BT.FOOD_ORDER.length; k++) {
      key = BT.FOOD_ORDER[k];
      var t = 0;
      for (var i = 0; i < n; i++) t += this.capacity[key][i];
      this.startTotal[key] = t;
    }
  }

  /**
   * Kapazitaet aus den Lebensraeumen berechnen. Wird nach Rodung, Bebauung
   * und Nachwachsen erneut aufgerufen (eco/landuse.js).
   */
  Fields.prototype.rebuildCapacity = function () {
    // ground: Lebensraum mit Nutzung (eco/landuse.js), sonst die Natur
    var w = this.world, g = this.ground || w.biome.data, s = this.step;
    for (var fy = 0; fy < this.rows; fy++) {
      for (var fx = 0; fx < this.cols; fx++) {
        var sums = {}, count = 0;
        for (var k = 0; k < BT.FOOD_ORDER.length; k++) sums[BT.FOOD_ORDER[k]] = 0;
        for (var y = fy * s; y < Math.min(w.rows, fy * s + s); y++) {
          for (var x = fx * s; x < Math.min(w.cols, fx * s + s); x++) {
            var b = g[y * w.cols + x];
            for (k = 0; k < BT.FOOD_ORDER.length; k++) {
              var key = BT.FOOD_ORDER[k];
              sums[key] += BT.FOOD[key].capacity[b];
            }
            count++;
          }
        }
        var i = fy * this.cols + fx;
        for (k = 0; k < BT.FOOD_ORDER.length; k++) {
          key = BT.FOOD_ORDER[k];
          this.capacity[key][i] = sums[key] / count;
          if (this.value[key][i] > this.capacity[key][i]) this.value[key][i] = this.capacity[key][i];
        }
        if (this.potential[i] > this.capacity.korn[i]) this.potential[i] = this.capacity.korn[i];
      }
    }
  };

  Fields.prototype.index = function (x, y) {
    var fx = Math.floor(x / this.size), fy = Math.floor(y / this.size);
    if (fx < 0 || fy < 0 || fx >= this.cols || fy >= this.rows) return -1;
    return fy * this.cols + fx;
  };

  Fields.prototype.center = function (i) {
    var fx = i % this.cols, fy = (i - fx) / this.cols;
    return { x: (fx + 0.5) * this.size, y: (fy + 0.5) * this.size };
  };

  /** Anteil der Kapazitaet, den der Zustand einer Schicht in Zelle i erlaubt. */
  Fields.prototype.factor = function (key, i) {
    var dmg = BT.FOOD[key].damage, h = this.health[key];
    return h ? dmg.dead + (1 - dmg.dead) * h[i] : 1;
  };

  /**
   * Kapazitaet einer Zelle unter Beruecksichtigung des Pflanzenzustands: der
   * eigene und der einer anderen Schicht
   * (Fruechte wachsen an den Bueschen, also am Laub).
   */
  Fields.prototype.carrying = function (key, i) {
    var def = BT.FOOD[key];
    var K = this.capacity[key][i] * this.factor(key, i);
    return def.healthOf ? K * this.factor(def.healthOf, i) : K;
  };

  /**
   * Fuellstand der Umgebung je Weidezelle: Summe der Nahrung durch Summe dessen,
   * was die Gegend beim heutigen Zustand tragen kann, im Quadrat mit Radius r
   * (Weidezellen). Ueber Praefixsummen.
   */
  Fields.prototype.regionShare = function (key, r) {
    var C = this.cols, R = this.rows, v = this.value[key];
    var cap = this._carry || (this._carry = new Float32Array(C * R));
    for (var c = 0; c < C * R; c++) cap[c] = this.carrying(key, c);
    var W = C + 1, n = W * (R + 1);
    if (!this._sv || this._sv.length !== n) { this._sv = new Float64Array(n); this._sk = new Float64Array(n); }
    var sv = this._sv, sk = this._sk;
    for (var y = 0; y < R; y++) {
      var rv = 0, rk = 0;
      for (var x = 0; x < C; x++) {
        var i = y * C + x;
        rv += v[i]; rk += cap[i];
        sv[(y + 1) * W + x + 1] = sv[y * W + x + 1] + rv;
        sk[(y + 1) * W + x + 1] = sk[y * W + x + 1] + rk;
      }
    }
    var out = this._share || (this._share = new Float32Array(C * R));
    if (out.length !== C * R) out = this._share = new Float32Array(C * R);
    for (y = 0; y < R; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(R, y + r + 1);
      for (x = 0; x < C; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(C, x + r + 1);
        var a = sv[y1 * W + x1] - sv[y0 * W + x1] - sv[y1 * W + x0] + sv[y0 * W + x0];
        var b = sk[y1 * W + x1] - sk[y0 * W + x1] - sk[y1 * W + x0] + sk[y0 * W + x0];
        out[y * C + x] = b > 0 ? a / b : 1;
      }
    }
    return out;
  };

  /** Ein Tag: Ueberweidung bzw. Erholung, dann Wachstum und Schwund. */
  Fields.prototype.grow = function (season, weather) {
    var w = weather || { growth: 1, winter: 1, mast: false };
    for (var k = 0; k < BT.FOOD_ORDER.length; k++) {
      var key = BT.FOOD_ORDER[k];
      var def = BT.FOOD[key];
      var v = this.value[key], cap = this.capacity[key], bit = this.bitten[key];
      var dmg = def.damage, h = this.health[key], rest = this.rest[key];
      if (dmg) {
        var rec = dmg.recover * def.season[season];
        // Schaden nur, wenn in der Wachstumszeit kahl gefressen wird - im
        // Winter ruhen die Pflanzen, Abweiden schadet dann kaum. `damage.season`
        // legt die Jahreszeiten fest, sonst gilt jede mit kraeftigem Wachstum.
        var loss = dmg.loss * Math.min(1, def.season[season]);
        var active = dmg.season ? dmg.season[season] > 0 : def.season[season] >= 0.5;
        // Bei Nahrung, die ein umherziehender Trupp nur kurz abfrisst und die
        // schnell nachwaechst (Insekten), zaehlt die Umgebung (`damage.area`
        // Weidezellen im Umkreis), gemessen an dem, was sie heute tragen kann:
        // Ein durchziehender Trupp schadet nicht, nur zu viele Tiere in der
        // ganzen Gegend. (Gemessen an einer gesunden Gegend lag eine einmal
        // verarmte Gegend fuer immer unter der Schwelle, jedes Fressen schadete
        // weiter, und die Insel verarmte ueber die Jahrzehnte.)
        var region = dmg.area ? this.regionShare(key, dmg.area) : null;
        for (var i = 0; i < v.length; i++) {
          if (cap[i] <= 0) continue;
          var Kh = this.carrying(key, i);
          var bare = bit[i] > 0 && (region ? region[i] < dmg.below : v[i] < dmg.below * Kh);
          if (bare && active) {
            h[i] = Math.max(0, h[i] - loss);
            rest[i] = 0;
          } else {
            if (rest[i] < 65535) rest[i]++;
            if (h[i] < 1 && rest[i] >= dmg.rest) h[i] = Math.min(1, h[i] + rec * (0.2 + 0.8 * h[i]));
          }
        }
      }
      bit.fill(0);
      var r = def.growth * def.season[season] * w.growth;
      if (season === 3) r /= w.winter;
      var mult = w.mast && def.mast && (season === 1 || season === 2) ? def.mast : 1;
      var decay = def.decay ? def.decay[season] * (season === 3 ? w.winter : 1) : 0;
      var seed = def.seed;
      for (i = 0; i < v.length; i++) {
        if (cap[i] <= 0) continue;
        var K = this.carrying(key, i) * mult;
        // ueber der Kapazitaet (Zustand gesunken): Pflanzen sterben ab
        if (v[i] > K) v[i] -= (v[i] - K) * 0.1;
        else if (r > 0) v[i] += r * (v[i] + seed * K) * (1 - v[i] / K);
        if (decay > 0) v[i] -= v[i] * decay;
      }
      // Getreide: dasselbe Wachstum noch einmal, aber ohne dass Tiere fressen (was haette stehen koennen)
      if (key === 'korn') {
        var pv = this.potential;
        for (i = 0; i < pv.length; i++) {
          if (cap[i] <= 0) continue;
          K = cap[i] * mult;
          if (pv[i] > K) pv[i] -= (pv[i] - K) * 0.1;
          else if (r > 0) pv[i] += r * (pv[i] + seed * K) * (1 - pv[i] / K);
        }
      }
    }
  };

  /** Wie viel Energie bietet diese Zelle einer Art? (Summe ueber ihre Nahrung) */
  Fields.prototype.energyAt = function (i, diet) {
    if (i < 0) return 0;
    var e = 0;
    for (var key in diet) e += this.value[key][i] * diet[key];
    return e;
  };

  /** Energie, die Zelle i fuer diese Kost truege, wenn alles voll stuende (ohne Schaden). */
  Fields.prototype.fullEnergyAt = function (i, diet) {
    if (i < 0) return 0;
    var e = 0;
    for (var key in diet) e += this.capacity[key][i] * diet[key];
    return e;
  };

  /**
   * Fressen: bis zu `amount` Einheiten, ergiebigste Nahrung zuerst.
   * Liefert die gewonnene Energie; das mitgefressene Wasser steht danach in
   * this.lastWater (wie viel Durst es loescht).
   */
  Fields.prototype.eat = function (i, diet, amount) {
    this.lastWater = 0;
    if (i < 0) return 0;
    var gained = 0;
    var keys = Object.keys(diet).sort(function (a, b) { return diet[b] - diet[a]; });
    for (var k = 0; k < keys.length && amount > 0; k++) {
      var v = this.value[keys[k]];
      var take = Math.min(amount, v[i]);
      v[i] -= take;
      this.bitten[keys[k]][i] += take;
      this.eaten[keys[k]] += take;
      amount -= take;
      gained += take * diet[keys[k]];
      this.lastWater += take * BT.FOOD[keys[k]].water;
    }
    return gained;
  };

  /**
   * Fuellstand je Nahrungsart (fuer die Statistik), gemessen an der Kapazitaet der
   * unberuehrten Insel: Wird Land gerodet, bebaut oder gepfluegt, sinkt der Wert
   * dauerhaft (10 % der Gras-Flaeche weg = hoechstens 90 %), waechst die Flaeche
   * (Wiese: mehr Gras, mehr Acker), steigt er ueber 100 %. Nahrung, die es zu Beginn
   * nicht gab (Getreide), wird an allen heutigen Aeckern gemessen.
   */
  Fields.prototype.levels = function () {
    var out = {};
    for (var k = 0; k < BT.FOOD_ORDER.length; k++) {
      var key = BT.FOOD_ORDER[k];
      var v = this.value[key], sv = 0, sk = this.startTotal[key];
      for (var i = 0; i < v.length; i++) sv += v[i];
      // Getreide gab es zu Beginn nicht: gemessen an den heutigen Aeckern (100 % = alle Aecker reif)
      if (!(sk > 0)) { var K = this.capacity[key]; for (i = 0; i < K.length; i++) sk += K[i]; }
      out[key] = sk > 0 ? sv / sk : 0;
    }
    return out;
  };

  /**
   * Mittlerer Pflanzenzustand je Schicht mit Ueberweidung: was heute noch (gesund)
   * waechst, im Verhaeltnis zur unberuehrten Insel. Verlorene Flaeche zaehlt wie
   * toter Bestand, der Wert sinkt also auch bei Rodung und Acker; neue Flaeche
   * (Wiese) hebt ihn ueber 100 %.
   */
  Fields.prototype.healthLevels = function () {
    var out = {};
    for (var key in this.health) {
      var h = this.health[key], K = this.capacity[key], sh = 0, sk = this.startTotal[key];
      for (var i = 0; i < h.length; i++) sh += h[i] * K[i];
      out[key] = sk > 0 ? sh / sk : 1;
    }
    return out;
  };

  BT.Fields = Fields;
})(typeof window !== 'undefined' ? window : globalThis);
