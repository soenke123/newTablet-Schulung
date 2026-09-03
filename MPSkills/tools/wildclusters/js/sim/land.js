/**
 * Das Land als Lebensraum - das Gegenstueck zu js/sim/habitat.js.
 *
 * Der Weltgenerator liefert ein Raster mit einem Terraintyp je Zelle. Wer
 * darauf lebt, braucht daraus vier Dinge: "kann ich hier hin", "gehoert das
 * noch zu meiner Landmasse", "gib mir eine Grasstelle in dieser Richtung" und
 * "wo ist der naechste Waldrand". Genau das steht hier, einmal pro Welt
 * berechnet und danach nur noch abgefragt.
 *
 * Die Landgebiete (Breitensuche ueber alles, was kein Wasser ist) sind der
 * Grund, warum ein Landtier nie ein Ziel jenseits eines Sees waehlt: es koennte
 * dort nicht hinlaufen, wuerde am Ufer haengenbleiben und stuende den Rest des
 * Tages an derselben Stelle. Auf den meisten Seeds gibt es genau ein Gebiet -
 * die Pruefung kostet aber nichts und faengt den Ausreisser ab.
 *
 * Der Waldrand liegt hier und nicht beim Reh: Kaninchen (Bau am Waldrand),
 * Wildschwein (dichter Wald) und Dachs brauchen dieselbe Abfrage, nur mit
 * anderer Tiefe.
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
    var count = cols * rows;
    var forestDepth = world.fields.forestDepth;
    var i, cx, cy;

    // Zellvorrat je Terraintyp. Daraus wird gezogen, wenn ein Tier "irgendwo
    // auf Gras" oder "irgendwo im Wald" sucht - eine Verwerfungsstichprobe
    // ueber das ganze Raster braeuchte bei 11 % Wasseranteil zwar auch nur
    // wenige Versuche, bei "Wald" (25 %) aber schon vier.
    var byType = [[], [], [], []];
    for (i = 0; i < count; i++) byType[grid[i]].push(i);

    // Waldzellen nach Tiefe, als Rueckfalliste fuer forestNear. Gebaut wird
    // erst, wenn eine Tiefenspanne zum ersten Mal gefragt wird: das Reh will
    // den Rand (1-4), das Wildschwein den dichten Wald (5 und tiefer), und
    // welche Spannen ueberhaupt vorkommen, entscheiden die Tiere.
    var depthPools = {};

    function poolByDepth(minDepth, maxDepth) {
      var key = minDepth + ':' + maxDepth;
      var pool = depthPools[key];
      if (pool) return pool;
      pool = [];
      for (var k = 0; k < byType[T.FOREST].length; k++) {
        var fi = byType[T.FOREST][k];
        if (forestDepth[fi] >= minDepth && forestDepth[fi] <= maxDepth) pool.push(fi);
      }
      depthPools[key] = pool;
      return pool;
    }

    // Zusammenhaengende Landmassen (alles ausser Wasser), Breitensuche.
    var region = new Int16Array(count);
    var regionCount = 0;
    for (i = 0; i < count; i++) region[i] = grid[i] === T.WATER ? -1 : 0;
    var queue = new Int32Array(count);
    for (i = 0; i < count; i++) {
      if (region[i] !== 0) continue;
      regionCount++;
      var mark = regionCount;
      var head = 0;
      var tail = 0;
      region[i] = mark;
      queue[tail++] = i;
      while (head < tail) {
        var idx = queue[head++];
        cx = idx % cols;
        cy = (idx - cx) / cols;
        if (cx > 0) tail = push(idx - 1, mark, tail);
        if (cx < cols - 1) tail = push(idx + 1, mark, tail);
        if (cy > 0) tail = push(idx - cols, mark, tail);
        if (cy < rows - 1) tail = push(idx + cols, mark, tail);
      }
    }

    function push(n, mark, tail) {
      if (region[n] !== 0) return tail;
      region[n] = mark;
      queue[tail++] = n;
      return tail;
    }

    function cellIndex(x, y) {
      var ix = Math.floor(x / cellSize);
      var iy = Math.floor(y / cellSize);
      if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) return -1;
      return iy * cols + ix;
    }

    function center(idx, rng) {
      var ix = idx % cols;
      var iy = (idx - ix) / cols;
      // Innerhalb der Zelle streuen, sonst sitzen alle Tiere auf einem Raster.
      var half = cellSize * 0.38;
      return {
        x: (ix + 0.5) * cellSize + rng.range(-half, half),
        y: (iy + 0.5) * cellSize + rng.range(-half, half)
      };
    }

    var land = {
      cellSize: cellSize,
      regionCount: regionCount,

      /** Alles ausser Wasser und ausserhalb der Karte. */
      walkable: function (x, y) {
        var idx = cellIndex(x, y);
        return idx >= 0 && grid[idx] !== T.WATER;
      },

      terrainAt: function (x, y) {
        var idx = cellIndex(x, y);
        return idx < 0 ? -1 : grid[idx];
      },

      /** Nummer der Landmasse, oder -1 auf Wasser bzw. ausserhalb. */
      regionAt: function (x, y) {
        var idx = cellIndex(x, y);
        return idx < 0 ? -1 : region[idx];
      },

      /** Abstand zum Waldrand in Zellen (0 ausserhalb des Waldes). */
      forestDepthAt: function (x, y) {
        var idx = cellIndex(x, y);
        return idx < 0 ? 0 : forestDepth[idx];
      },

      /** Zufaellige Stelle des gewuenschten Terraintyps in dieser Landmasse. */
      pointOfType: function (rng, type, inRegion) {
        var pool = byType[type];
        if (!pool.length) return null;
        for (var t = 0; t < 24; t++) {
          var idx = pool[Math.floor(rng.next() * pool.length)];
          if (inRegion > 0 && region[idx] !== inRegion) continue;
          return center(idx, rng);
        }
        return null;
      },

      /**
       * Stelle in einem Ring um einen Punkt. type < 0 laesst jedes begehbare
       * Terrain zu. Gezogen wird gleichverteilt ueber die Flaeche des Rings,
       * damit ein Tier nicht staendig dicht vor der eigenen Nase landet.
       */
      pointInRing: function (rng, x, y, rMin, rMax, type, inRegion) {
        for (var t = 0; t < 20; t++) {
          var a = rng.range(0, Math.PI * 2);
          var r = Math.sqrt(rng.range(rMin * rMin, rMax * rMax));
          var nx = x + Math.cos(a) * r;
          var ny = y + Math.sin(a) * r;
          var idx = cellIndex(nx, ny);
          if (idx < 0 || grid[idx] === T.WATER) continue;
          if (type >= 0 && grid[idx] !== type) continue;
          if (inRegion > 0 && region[idx] !== inRegion) continue;
          return { x: nx, y: ny };
        }
        return null;
      },

      /**
       * Ein Platz im Wald in einer bestimmten Tiefe. minDepth/maxDepth zaehlen
       * Zellen ab dem Waldrand: 1-4 ist "dicht am Rand" (Reh), 5 und mehr ist
       * "mitten im Wald" (Wildschwein).
       *
       * Es genuegt nicht, im Umkreis irgendeinen Waldpunkt zu ziehen: der
       * liegt bei 25 % Waldanteil fast immer *innen*, nicht am Rand. Deshalb
       * wird ueber Stichproben der naechstgelegene Punkt gesucht, der die
       * Tiefenbedingung wirklich erfuellt, und erst wenn das scheitert, die
       * Liste der passenden Zellen abgesucht.
       *
       * maxDistance begrenzt den Rueckweg: ein Tier, das mitten auf einer
       * riesigen Wiese steht, soll nicht die halbe Nacht unterwegs sein, um
       * seinen Schlafplatz zu erreichen. Findet sich keiner, bekommt der
       * Aufrufer null und entscheidet selbst - beim Reh heisst das "dann eben
       * im Gras".
       */
      forestNear: function (rng, x, y, radius, inRegion, maxDistance, minDepth, maxDepth) {
        var best = null;
        var bestDist = Infinity;
        var i, idx, dx, dy, d;

        for (i = 0; i < 40; i++) {
          var p = land.pointInRing(rng, x, y, 0, radius, T.FOREST, inRegion);
          if (!p) continue;
          idx = cellIndex(p.x, p.y);
          if (forestDepth[idx] < minDepth || forestDepth[idx] > maxDepth) continue;
          d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bestDist) { bestDist = d; best = p; }
        }
        if (best) return best;

        var pool = poolByDepth(minDepth, maxDepth);
        var limit = maxDistance ? maxDistance * maxDistance : Infinity;
        var bestCell = -1;
        bestDist = limit;
        for (i = 0; i < pool.length; i++) {
          idx = pool[i];
          if (inRegion > 0 && region[idx] !== inRegion) continue;
          var ix = idx % cols;
          var iy = (idx - ix) / cols;
          dx = (ix + 0.5) * cellSize - x;
          dy = (iy + 0.5) * cellSize - y;
          d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestCell = idx; }
        }
        return bestCell < 0 ? null : center(bestCell, rng);
      },

      /** Der Waldrand - die Tiefenspanne, mit der das Reh gebaut wurde. */
      forestEdgeNear: function (rng, x, y, radius, inRegion, maxDistance) {
        return land.forestNear(rng, x, y, radius, inRegion, maxDistance, 1, 4);
      }
    };

    return land;
  }

  WL.Land = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
