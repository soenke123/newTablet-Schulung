/**
 * Die Welt als ein Objekt - einzige Schnittstelle zwischen Generierung,
 * Darstellung und (spaeter) Simulation.
 *
 *   world
 *    ├─ biome      Raster, ein Lebensraum pro Zelle (BT.BIOME)
 *    ├─ height_    Hoehe [0, 1] (Land), negativ im Meer
 *    ├─ moisture   Feuchte [0, 1] (Rang unter den Landzellen)
 *    ├─ fields     distSea, distFresh (Abstandsfelder in Zellen)
 *    ├─ features   Bergruecken, Vulkan, Seen, Flusslaeufe, Thermalfelder
 *    ├─ decor      Streudetails fuer die Textur
 *    └─ query      raeumliche Abfragen in Weltkoordinaten
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  function createQuery(world) {
    var cell = world.cellSize, cols = world.cols, rows = world.rows;
    function idx(x, y) {
      var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
      return cy * cols + cx;
    }
    return {
      index: idx,
      biomeAt: function (x, y) {
        var i = idx(x, y);
        return i < 0 ? BT.BIOME.DEEP : world.biome.data[i];
      },
      heightAt: function (x, y) {
        var i = idx(x, y);
        return i < 0 ? -1 : world.height_[i];
      },
      moistureAt: function (x, y) {
        var i = idx(x, y);
        return i < 0 ? 0 : world.moisture[i];
      },
      /** Abstand zum naechsten Suesswasser in Weltunits. */
      freshWaterDistance: function (x, y) {
        var i = idx(x, y);
        return i < 0 ? Infinity : world.fields.distFresh[i] * cell;
      }
    };
  }

  function areaShares(world) {
    var counts = new Array(BT.BIOME_INFO.length).fill(0);
    var land = 0, d = world.biome.data;
    for (var i = 0; i < d.length; i++) {
      counts[d[i]]++;
      if (d[i] !== BT.BIOME.DEEP && d[i] !== BT.BIOME.SHALLOW) land++;
    }
    var shares = {};
    for (var b = 0; b < counts.length; b++) {
      if (BT.BIOME_INFO[b].use) continue;
      shares[BT.BIOME_INFO[b].key] = b <= BT.BIOME.SHALLOW ? counts[b] / d.length : counts[b] / Math.max(1, land);
    }
    shares.land = land / d.length;
    return shares;
  }

  function generate(seed, options) {
    var t0 = Date.now();
    var world = BT.Island.generate(seed, options);
    world.decor = BT.Decor.generate(world);
    world.query = createQuery(world);
    world.areaShares = areaShares(world);
    world.meta = { generationMs: Date.now() - t0 };
    return world;
  }

  BT.World = { generate: generate };
})(typeof window !== 'undefined' ? window : globalThis);
