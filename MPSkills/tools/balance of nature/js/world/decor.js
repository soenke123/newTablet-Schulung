/**
 * Streudetails fuer die Textur: Grasbueschel, Farnkronen, Bluetenpunkte,
 * Steine, Thermalbecken. Rein dekorativ - die Simulation liest nur das Raster.
 *
 * Jitter pro Zelle mit biomeigener Wahrscheinlichkeit, eigener Sub-RNG,
 * dadurch bei gleichem Seed identisch.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  // Wahrscheinlichkeit je Zelle und Art des Details pro Biom
  var RULES = {};
  RULES[B.TUSSOCK] = [{ kind: 'tuft', p: 0.22, r: [2.6, 4.2] }];
  RULES[B.SCRUB] = [{ kind: 'bush', p: 0.16, r: [5, 8] }, { kind: 'blossom', p: 0.18, r: [1.1, 1.8] }];
  RULES[B.FERN] = [{ kind: 'tree', p: 0.30, r: [7, 11] }, { kind: 'fern', p: 0.07, r: [5, 7] }];
  RULES[B.MOSS] = [{ kind: 'mosstree', p: 0.30, r: [7, 12] }, { kind: 'mist', p: 0.05, r: [10, 18] }];
  RULES[B.SWAMP] = [{ kind: 'flax', p: 0.22, r: [3, 5] }, { kind: 'puddle', p: 0.05, r: [3, 6] }];
  RULES[B.ROCK] = [{ kind: 'stone', p: 0.12, r: [2, 4.5] }];
  RULES[B.PEAK] = [{ kind: 'snow', p: 0.10, r: [2, 4] }];
  RULES[B.BEACH] = [{ kind: 'shell', p: 0.05, r: [0.8, 1.4] }];
  RULES[B.THERMAL] = [{ kind: 'pool', p: 0.06, r: [4, 9] }, { kind: 'steam', p: 0.03, r: [6, 10] }];

  function generate(world) {
    var rng = new BT.Rng(world.seed).fork('decor');
    var cols = world.cols, rows = world.rows, cell = world.cellSize, g = world.biome.data;
    var items = {};
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var b = g[y * cols + x];
        var rules = RULES[b];
        if (!rules) continue;
        for (var k = 0; k < rules.length; k++) {
          var rule = rules[k];
          if (rng.next() >= rule.p) continue;
          var list = items[rule.kind] || (items[rule.kind] = []);
          list.push({
            x: (x + rng.next()) * cell,
            y: (y + rng.next()) * cell,
            r: rng.rangeIn(rule.r),
            shade: rng.range(-1, 1),
            rot: rng.range(-1, 1)
          });
        }
      }
    }
    // Baeume von oben nach unten zeichnen, damit untere Kronen vorne liegen
    ['tree', 'mosstree', 'bush'].forEach(function (k) {
      if (items[k]) items[k].sort(function (a, b) { return a.y - b.y; });
    });
    return items;
  }

  BT.Decor = { generate: generate };
})(typeof window !== 'undefined' ? window : globalThis);
