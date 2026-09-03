/**
 * Aus dem Zellraster werden einmal pro Welt geglaettete Umrisse gebaut.
 *
 * Das passiert genau einmal nach der Generierung. Danach zeichnet der Renderer
 * nur noch Vektorpfade - unabhaengig vom Zoom bleiben die Kanten dadurch weich
 * und scharf zugleich.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function buildLayer(world, type, options) {
    var polygons = WL.Contour.polygonsFromMask(
      world.terrain.grid.mask(type),
      world.cols,
      world.rows,
      {
        cellSize: world.cellSize,
        smoothing: options.smoothing,
        minArea: options.minArea,
        noise: options.noise,
        noiseAmp: options.noiseAmp,
        noiseScale: options.noiseScale
      }
    );
    return { polygons: polygons, path: WL.Contour.toPath(polygons) };
  }

  /**
   * @returns {{grass:Object, forest:Object, water:Object}} Polygone + Path2D
   */
  function build(world) {
    if (world._shapes) return world._shapes;

    // Eigenes Noise fuer den Randversatz, aus dem Weltseed abgeleitet -
    // dadurch bleibt auch die Kantenform bei gleichem Seed identisch.
    var noise = new WL.Noise(new WL.Rng(world.seed).fork('outline').seed);
    var cell = world.cellSize;

    var shapes = {
      grass: buildLayer(world, T.GRASS, {
        smoothing: 3,
        minArea: cell * cell * 60,
        noise: noise,
        noiseAmp: cell * 0.8,
        noiseScale: 0.012
      }),
      forest: buildLayer(world, T.FOREST, {
        smoothing: 3,
        minArea: cell * cell * 80,
        noise: noise,
        noiseAmp: cell * 0.7,
        noiseScale: 0.009
      }),
      water: buildLayer(world, T.WATER, {
        smoothing: 3,
        minArea: cell * cell * 40,
        noise: noise,
        noiseAmp: cell * 0.5,
        noiseScale: 0.016
      })
    };

    world._shapes = shapes;
    return shapes;
  }

  WL.Shapes = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
