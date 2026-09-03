/**
 * Zellraster als "Wahrheit" der Welt.
 *
 * Jede Zelle hat genau einen Terrain-Typ. Dadurch sind verbotene
 * Ueberschneidungen (z.B. Wald x Wasser) strukturell unmoeglich und nicht nur
 * nachtraeglich geprueft. Gezeichnet wird das Raster nie direkt - dafuer
 * liefert core/contour.js geglaettete Konturen.
 *
 * Ausserdem hier: Flood-Fill (zusammenhaengende Flaechen), Dilatation
 * (Pufferzonen) und Distanz-Transformation (Abstandsfelder). Die Abstandsfelder
 * werden in Phase 3 fuer die Tier-KI wiederverwendet ("Durst -> naechstes Wasser").
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function Grid(cols, rows, fill) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8Array(cols * rows);
    if (fill) this.data.fill(fill);
  }

  Grid.prototype.index = function (x, y) {
    return y * this.cols + x;
  };

  Grid.prototype.inBounds = function (x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  };

  Grid.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return this.data[y * this.cols + x];
  };

  Grid.prototype.set = function (x, y, value) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.data[y * this.cols + x] = value;
  };

  Grid.prototype.count = function (value) {
    var n = 0;
    var d = this.data;
    for (var i = 0; i < d.length; i++) if (d[i] === value) n++;
    return n;
  };

  Grid.prototype.clone = function () {
    var g = new Grid(this.cols, this.rows);
    g.data.set(this.data);
    return g;
  };

  /** 0/1-Maske aller Zellen mit dem gegebenen Wert. */
  Grid.prototype.mask = function (value) {
    var m = new Uint8Array(this.data.length);
    for (var i = 0; i < this.data.length; i++) m[i] = this.data[i] === value ? 1 : 0;
    return m;
  };

  /** Maske aller Zellen, die NICHT den gegebenen Wert haben. */
  Grid.prototype.maskNot = function (value) {
    var m = new Uint8Array(this.data.length);
    for (var i = 0; i < this.data.length; i++) m[i] = this.data[i] === value ? 0 : 1;
    return m;
  };

  /**
   * Zusammenhaengende Flaechen einer Maske (4er-Nachbarschaft, iterativ -
   * kein rekursiver Flood-Fill, damit grosse Flaechen den Stack nicht sprengen).
   * Liefert Label-Array und Komponentenliste, nach Groesse absteigend sortiert.
   */
  function connectedComponents(mask, cols, rows) {
    var labels = new Int32Array(mask.length).fill(-1);
    var components = [];
    var stack = new Int32Array(mask.length);

    for (var start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start] !== -1) continue;
      var id = components.length;
      var size = 0;
      var sumX = 0;
      var sumY = 0;
      var minX = cols, minY = rows, maxX = -1, maxY = -1;
      var cells = [];
      var sp = 0;
      stack[sp++] = start;
      labels[start] = id;

      while (sp > 0) {
        var idx = stack[--sp];
        var x = idx % cols;
        var y = (idx - x) / cols;
        size++;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        cells.push(idx);

        if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) { labels[idx - 1] = id; stack[sp++] = idx - 1; }
        if (x < cols - 1 && mask[idx + 1] && labels[idx + 1] === -1) { labels[idx + 1] = id; stack[sp++] = idx + 1; }
        if (y > 0 && mask[idx - cols] && labels[idx - cols] === -1) { labels[idx - cols] = id; stack[sp++] = idx - cols; }
        if (y < rows - 1 && mask[idx + cols] && labels[idx + cols] === -1) { labels[idx + cols] = id; stack[sp++] = idx + cols; }
      }

      components.push({
        id: id,
        size: size,
        cells: cells,
        cx: sumX / size,
        cy: sumY / size,
        bbox: { minX: minX, minY: minY, maxX: maxX, maxY: maxY }
      });
    }

    components.sort(function (a, b) { return b.size - a.size; });
    return { labels: labels, components: components };
  }

  /**
   * Chamfer-Distanztransformation (3-4-Metrik, zwei Durchlaeufe).
   * Ergebnis: Abstand jeder Zelle zur naechsten Zelle mit mask === 1, in Zellen.
   */
  function distanceTransform(mask, cols, rows) {
    var INF = 1e9;
    var dist = new Float32Array(mask.length);
    var i, x, y, idx, v;

    for (i = 0; i < mask.length; i++) dist[i] = mask[i] ? 0 : INF;

    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        idx = y * cols + x;
        v = dist[idx];
        if (v === 0) continue;
        if (x > 0) v = Math.min(v, dist[idx - 1] + 1);
        if (y > 0) v = Math.min(v, dist[idx - cols] + 1);
        if (x > 0 && y > 0) v = Math.min(v, dist[idx - cols - 1] + 1.4142);
        if (x < cols - 1 && y > 0) v = Math.min(v, dist[idx - cols + 1] + 1.4142);
        dist[idx] = v;
      }
    }
    for (y = rows - 1; y >= 0; y--) {
      for (x = cols - 1; x >= 0; x--) {
        idx = y * cols + x;
        v = dist[idx];
        if (v === 0) continue;
        if (x < cols - 1) v = Math.min(v, dist[idx + 1] + 1);
        if (y < rows - 1) v = Math.min(v, dist[idx + cols] + 1);
        if (x < cols - 1 && y < rows - 1) v = Math.min(v, dist[idx + cols + 1] + 1.4142);
        if (x > 0 && y < rows - 1) v = Math.min(v, dist[idx + cols - 1] + 1.4142);
        dist[idx] = v;
      }
    }
    return dist;
  }

  /** Maske um `radius` Zellen verbreitern - erzeugt z.B. den Uferstreifen. */
  function dilate(mask, cols, rows, radius) {
    var dist = distanceTransform(mask, cols, rows);
    var out = new Uint8Array(mask.length);
    for (var i = 0; i < mask.length; i++) out[i] = dist[i] <= radius ? 1 : 0;
    return out;
  }

  /** Einfacher Hash ueber das Raster - zum Pruefen der Seed-Reproduzierbarkeit. */
  function hashGrid(grid) {
    var h = 2166136261 >>> 0;
    var d = grid.data;
    for (var i = 0; i < d.length; i++) {
      h ^= d[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  Grid.connectedComponents = connectedComponents;
  Grid.distanceTransform = distanceTransform;
  Grid.dilate = dilate;
  Grid.hash = hashGrid;

  WL.Grid = Grid;
})(typeof window !== 'undefined' ? window : globalThis);
