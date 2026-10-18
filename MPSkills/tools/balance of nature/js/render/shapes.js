/**
 * Aus dem Biomraster werden einmal pro Welt geglaettete Umrisse gebaut
 * (Marching Squares + Chaikin, core/contour.js).
 *
 * Damit zwischen zwei benachbarten Biomen keine Luecke bleibt, wird jede
 * Landflaeche um eine Zelle in ihre Landnachbarn hinein verbreitert. Spaeter
 * gezeichnete Schichten liegen dann leicht ueber frueheren.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  // Zeichenreihenfolge der Landbiome (unten -> oben)
  var LAND_ORDER = [B.TUSSOCK, B.SCRUB, B.SWAMP, B.FERN, B.MOSS, B.ROCK, B.PEAK, B.THERMAL];

  function grow(mask, limit, cols, rows) {
    var out = new Uint8Array(mask);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        if (mask[i] || !limit[i]) continue;
        if ((x > 0 && mask[i - 1]) || (x < cols - 1 && mask[i + 1]) ||
            (y > 0 && mask[i - cols]) || (y < rows - 1 && mask[i + cols])) out[i] = 1;
      }
    }
    return out;
  }

  function layer(world, mask, noise, opts) {
    var polygons = BT.Contour.polygonsFromMask(mask, world.cols, world.rows, {
      cellSize: world.cellSize,
      smoothing: 3,
      minArea: world.cellSize * world.cellSize * (opts.minCells || 6),
      noise: noise,
      noiseAmp: world.cellSize * (opts.amp || 0.6),
      noiseScale: opts.scale || 0.012
    });
    return { polygons: polygons, path: BT.Contour.toPath(polygons) };
  }

  function build(world) {
    if (world._shapes) return world._shapes;
    var noise = new BT.Noise(new BT.Rng(world.seed).fork('outline').seed);
    var g = world.biome.data, n = g.length, cols = world.cols, rows = world.rows;

    var landNoWater = new Uint8Array(n);
    var notDeep = new Uint8Array(n);
    var land = new Uint8Array(n);
    var lake = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var b = g[i];
      notDeep[i] = b !== B.DEEP ? 1 : 0;
      land[i] = b !== B.DEEP && b !== B.SHALLOW ? 1 : 0;
      landNoWater[i] = land[i] && b !== B.LAKE && b !== B.RIVER ? 1 : 0;
      lake[i] = b === B.LAKE ? 1 : 0;
    }

    var shapes = {
      shallow: layer(world, notDeep, noise, { amp: 1.2, scale: 0.01, minCells: 20 }),
      island: layer(world, land, noise, { amp: 0.5, scale: 0.02, minCells: 20 }),
      lake: layer(world, lake, noise, { amp: 0.4, scale: 0.02, minCells: 6 }),
      biomes: []
    };

    for (var k = 0; k < LAND_ORDER.length; k++) {
      var biome = LAND_ORDER[k];
      var mask = new Uint8Array(n);
      for (i = 0; i < n; i++) mask[i] = g[i] === biome ? 1 : 0;
      // Fluss- und Seezellen mitfuellen, damit unter dem Wasser kein Strand durchscheint
      mask = grow(mask, landNoWater, cols, rows);
      shapes.biomes.push({ biome: biome, shape: layer(world, mask, noise, { amp: 0.7, scale: 0.012, minCells: 8 }) });
    }

    world._shapes = shapes;
    return shapes;
  }

  BT.Shapes = { build: build, LAND_ORDER: LAND_ORDER };
})(typeof window !== 'undefined' ? window : globalThis);
