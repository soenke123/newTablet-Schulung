/**
 * Die Gewaesser als Lebensraum aufbereitet.
 *
 * Der Weltgenerator liefert Wasserflaechen als Zellmengen. Wer darin lebt,
 * braucht mehr: "wie weit bin ich vom Ufer weg", "gib mir einen Punkt am Ufer",
 * "wo ist die andere Seite dieses Teichs", "welche Gewaesser liegen in
 * Reichweite". Genau das steht hier - einmal pro Welt berechnet, danach nur
 * noch abgefragt.
 *
 * Die Ufertiefe wird als Breitensuche von den Uferzellen nach innen bestimmt
 * (Tiefe 1 = Zelle mit Landkontakt). Sie ist das Gegenstueck zu
 * world.fields.forestDepth an Land und wird von Ente, Barsch und spaeter Otter
 * und Hecht gleichermassen gebraucht - deshalb liegt sie hier und nicht bei
 * der Ente.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function build(world) {
    var cols = world.cols;
    var rows = world.rows;
    var cellSize = world.cellSize;
    var grid = world.terrain.grid.data;
    var sources = world.terrain.waterBodies;

    // Zelle -> Index des Gewaessers (-1 = Land). Macht "in welchem Teich bin
    // ich?" zu einer einzigen Feldabfrage.
    var owner = new Int16Array(cols * rows);
    for (var i = 0; i < owner.length; i++) owner[i] = -1;
    for (var b = 0; b < sources.length; b++) {
      var cells = sources[b].cells;
      for (var c = 0; c < cells.length; c++) owner[cells[c]] = b;
    }

    var depth = new Int16Array(cols * rows); // Zellen bis zum Ufer, 0 an Land
    var bodies = [];

    for (var bi = 0; bi < sources.length; bi++) {
      bodies.push(buildBody(sources[bi], bi));
    }

    /** Breitensuche vom Ufer nach innen, danach Zellen nach Tiefe sortieren. */
    function buildBody(src, index) {
      var cells = src.cells;
      var queue = [];
      var k, idx, cx, cy;

      for (k = 0; k < cells.length; k++) {
        idx = cells[k];
        cx = idx % cols;
        cy = (idx - cx) / cols;
        if (isShore(cx, cy)) {
          depth[idx] = 1;
          queue.push(idx);
        }
      }

      var head = 0;
      var maxDepth = 1;
      while (head < queue.length) {
        idx = queue[head++];
        var d = depth[idx];
        if (d > maxDepth) maxDepth = d;
        cx = idx % cols;
        cy = (idx - cx) / cols;
        pushNeighbour(cx - 1, cy, d);
        pushNeighbour(cx + 1, cy, d);
        pushNeighbour(cx, cy - 1, d);
        pushNeighbour(cx, cy + 1, d);
      }

      function pushNeighbour(nx, ny, d) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
        var n = ny * cols + nx;
        if (owner[n] !== index || depth[n] !== 0) return;
        depth[n] = d + 1;
        queue.push(n);
      }

      // Nach Tiefe sortiert ablegen: eine Tiefenspanne ist danach ein
      // zusammenhaengender Abschnitt, aus dem gleichverteilt gezogen wird.
      var counts = new Int32Array(maxDepth + 2);
      for (k = 0; k < cells.length; k++) counts[depth[cells[k]]]++;
      var offset = new Int32Array(maxDepth + 3);
      for (var d2 = 1; d2 <= maxDepth; d2++) offset[d2 + 1] = offset[d2] + counts[d2];
      var cursor = offset.slice();
      var sorted = new Int32Array(cells.length);
      for (k = 0; k < cells.length; k++) {
        var dd = depth[cells[k]];
        sorted[cursor[dd]++] = cells[k];
      }

      return {
        id: src.id,
        index: index,
        x: src.x,
        y: src.y,
        area: src.area,
        cellCount: src.cellCount,
        bounds: src.bounds,
        radius: Math.sqrt(src.area / Math.PI),
        maxDepth: maxDepth,
        sorted: sorted,
        offset: offset,
        neighbours: []       // wird unten gefuellt, sobald alle Koerper stehen
      };
    }

    function isShore(cx, cy) {
      return neighbourIsLand(cx - 1, cy) || neighbourIsLand(cx + 1, cy) ||
        neighbourIsLand(cx, cy - 1) || neighbourIsLand(cx, cy + 1);
    }

    function neighbourIsLand(nx, ny) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return true;
      return grid[ny * cols + nx] !== T.WATER;
    }

    // Nachbarschaft: jedes Gewaesser kennt die anderen nach Entfernung sortiert.
    for (var a = 0; a < bodies.length; a++) {
      var list = [];
      for (var o = 0; o < bodies.length; o++) {
        if (o === a) continue;
        list.push({
          index: o,
          distance: Math.hypot(bodies[o].x - bodies[a].x, bodies[o].y - bodies[a].y)
        });
      }
      list.sort(function (p, q) { return p.distance - q.distance; });
      bodies[a].neighbours = list;
    }

    function cellIndex(x, y) {
      var cx = Math.floor(x / cellSize);
      var cy = Math.floor(y / cellSize);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
      return cy * cols + cx;
    }

    function cellCenter(idx) {
      var cx = idx % cols;
      return { x: (cx + 0.5) * cellSize, y: ((idx - cx) / cols + 0.5) * cellSize };
    }

    var habitat = {
      bodies: bodies,
      cellSize: cellSize,

      /** Index des Gewaessers an dieser Stelle, oder -1 an Land. */
      bodyIndexAt: function (x, y) {
        var idx = cellIndex(x, y);
        return idx < 0 ? -1 : owner[idx];
      },

      bodyAt: function (x, y) {
        var i = habitat.bodyIndexAt(x, y);
        return i < 0 ? null : bodies[i];
      },

      /** Abstand zum Ufer in Weltunits (0 an Land). */
      depthAt: function (x, y) {
        var idx = cellIndex(x, y);
        return idx < 0 ? 0 : depth[idx] * cellSize;
      },

      /** Liegt der Punkt in genau diesem Gewaesser? */
      inBody: function (body, x, y) {
        var idx = cellIndex(x, y);
        return idx >= 0 && owner[idx] === body.index;
      },

      /**
       * Zufaelliger Punkt mit Ufertiefe in [dMin, dMax] Zellen. Ist die Spanne
       * fuer dieses Gewaesser zu tief angesetzt (kleine Tuempel haben keine
       * Mitte), rutscht sie automatisch nach aussen.
       */
      pointAtDepth: function (rng, body, dMin, dMax) {
        var lo = Math.max(1, Math.min(dMin, body.maxDepth));
        var hi = Math.max(lo, Math.min(dMax, body.maxDepth));
        var from = body.offset[lo];
        var to = body.offset[hi + 1];
        if (to <= from) { from = 0; to = body.sorted.length; }
        var pick = body.sorted[from + Math.floor(rng.next() * (to - from))];
        return jitter(rng, cellCenter(pick));
      },

      /**
       * Der am weitesten entfernte brauchbare Punkt im selben Gewaesser -
       * "auf die andere Seite des Sees". Aus Stichproben bestimmt, weil die
       * exakte Loesung hier nichts sichtbar besser macht.
       */
      farPointIn: function (rng, body, x, y, dMin, dMax) {
        var best = null;
        var bestDist = -1;
        for (var t = 0; t < 24; t++) {
          var p = habitat.pointAtDepth(rng, body, dMin, dMax);
          var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d > bestDist) { bestDist = d; best = p; }
        }
        return best;
      }
    };

    function jitter(rng, p) {
      // Innerhalb der Zelle streuen, sonst sitzen alle Tiere auf einem Raster.
      var half = cellSize * 0.38;
      return { x: p.x + rng.range(-half, half), y: p.y + rng.range(-half, half) };
    }

    return habitat;
  }

  WL.Habitat = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
