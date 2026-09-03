/**
 * Datenmodell der Welt und Orchestrierung der Generierung.
 *
 * Das erzeugte world-Objekt ist die einzige Schnittstelle zwischen Generierung
 * und Darstellung - und spaeter zwischen Welt und Tier-Simulation:
 *
 *   world
 *    +- terrain   grid, waterBodies, forestRegions, grasslands
 *    +- fields    Abstandsfelder (Wasser, Wald, Waldtiefe)
 *    +- objects   trees, resources, resourcePatches, appleTrees, appleGroups, anthills
 *    +- decor     Streudetails fuer die Textur
 *    +- query     raeumliche Abfragen (auch fuer die spaetere Tier-KI)
 *    +- areaRatios / meta / seed
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function generate(seedInput, overrides) {
    var started = now();
    var seed = WL.parseSeed(seedInput);
    var config = overrides ? Object.assign({}, WL.CONFIG, overrides) : WL.CONFIG;

    var cellSize = config.cellSize;
    var cols = Math.round(config.width / cellSize);
    var rows = Math.round(config.height / cellSize);

    var env = {
      seed: seed,
      rng: new WL.Rng(seed),
      config: config,
      width: config.width,
      height: config.height,
      cellSize: cellSize,
      cols: cols,
      rows: rows
    };

    var terrain = WL.Terrain.build(env);

    var query = WL.Rules.createQuery({
      cols: cols,
      rows: rows,
      cellSize: cellSize,
      grid: terrain.grid,
      fields: terrain.fields
    });

    var objects = WL.Objects.build(env, terrain, query);

    var total = cols * rows;
    var areaRatios = {
      grass: terrain.grid.count(T.GRASS) / total,
      forest: terrain.grid.count(T.FOREST) / total,
      water: terrain.grid.count(T.WATER) / total,
      visibleGround: terrain.grid.count(T.GROUND) / total
    };

    var world = {
      seed: seed,
      width: config.width,
      height: config.height,
      cellSize: cellSize,
      cols: cols,
      rows: rows,
      config: config,

      terrain: {
        grid: terrain.grid,
        waterBodies: terrain.waterBodies,
        forestRegions: terrain.forestRegions,
        grasslands: terrain.grasslands
      },
      fields: terrain.fields,
      objects: {
        trees: objects.trees,
        resources: objects.resources,
        resourcePatches: objects.resourcePatches,
        appleTrees: objects.appleTrees,
        appleGroups: objects.appleGroups,
        anthills: objects.anthills
      },
      decor: objects.decor,
      query: query,
      areaRatios: areaRatios,

      meta: {
        generationMs: 0,
        gridHash: WL.Grid.hash(terrain.grid),
        grassThreshold: terrain.debug.grassThreshold,
        groundTarget: terrain.debug.groundTarget
      }
    };

    world.meta.generationMs = Math.round((now() - started) * 10) / 10;
    world.validation = WL.validate ? WL.validate(world) : null;
    return world;
  }

  WL.World = { generate: generate };
})(typeof window !== 'undefined' ? window : globalThis);
