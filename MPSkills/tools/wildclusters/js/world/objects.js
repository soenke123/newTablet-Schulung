/**
 * Objekte und lokale Orte: Baeume, Ressourcenbereiche, Apfelbaumgruppen,
 * Ameisenhuegel - dazu die Streudekoration fuer die Bodentextur.
 *
 * Alle Kandidaten werden gegen WL.Rules.placement geprueft. Verteilungen sind
 * bewusst ungleichmaessig: Baeume folgen einem Dichte-Noise (Lichtungen und
 * dichte Stellen), Ressourcen sitzen in wenigen lokalen Nestern statt gleichmaessig
 * im Wald. Das ist die Grundlage dafuer, dass Tiere spaeter erkennbare
 * Stammrouten zwischen bestimmten Orten entwickeln koennen.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function cellsOfType(grid, type) {
    var list = [];
    for (var i = 0; i < grid.data.length; i++) if (grid.data[i] === type) list.push(i);
    return list;
  }

  function sampler(cells, cols, cellSize) {
    return function (rng) {
      if (!cells.length) return null;
      var idx = cells[Math.floor(rng.next() * cells.length)];
      var cx = idx % cols;
      var cy = (idx - cx) / cols;
      return {
        x: (cx + rng.next()) * cellSize,
        y: (cy + rng.next()) * cellSize
      };
    };
  }

  // ----------------------------------------------------------------- Baeume

  function placeTrees(env, q, forestCells) {
    var cfg = env.config.trees;
    var rng = env.rng.fork('trees');
    var density = new WL.Noise(rng.fork('tree-density').seed);
    var pick = sampler(forestCells, env.cols, env.cellSize);

    var forestArea = forestCells.length * env.cellSize * env.cellSize;
    var wanted = Math.min(cfg.maxCount, Math.round(forestArea / (cfg.minSpacing * cfg.minSpacing) * 0.85));
    var attempts = wanted * 14;

    var hash = new WL.Geo.SpatialHash(cfg.minSpacing);
    var trees = [];

    for (var i = 0; i < attempts && trees.length < wanted; i++) {
      var p = pick(rng);
      if (!p) break;
      if (!WL.Rules.placement.tree(q, p, env.config)) continue;

      // Dichte-Noise: entscheidet ueber Annahme UND ueber den lokalen Abstand,
      // dadurch entstehen Lichtungen und dichte Nester statt eines Gitters.
      var d = density.fbm(p.x * cfg.densityScale, p.y * cfg.densityScale, 3);
      if (rng.next() > cfg.densityFloor + (1 - cfg.densityFloor) * d) continue;
      var spacing = cfg.minSpacing * (1 + cfg.spacingJitter * (1 - d) - cfg.spacingJitter * 0.4);
      if (hash.hasWithin(p.x, p.y, spacing)) continue;

      hash.insert(p.x, p.y);
      trees.push({
        x: p.x,
        y: p.y,
        r: rng.rangeIn(cfg.radius) * (0.85 + 0.3 * d),
        variant: rng.int(0, 2),
        tilt: rng.range(-0.5, 0.5),
        shade: rng.range(-1, 1)
      });
    }

    return { trees: trees, hash: hash };
  }

  // ------------------------------------------------------------ Ressourcen

  function placeResources(env, q, forestCells, treeHash) {
    var cfg = env.config.resources;
    var rng = env.rng.fork('resources');
    var pick = sampler(forestCells, env.cols, env.cellSize);

    var centers = WL.Geo.scatter(rng, {
      count: rng.intIn(cfg.patches),
      minDistance: cfg.minPatchSeparation,
      sample: pick,
      accept: function (p) { return WL.Rules.placement.resourcePatch(q, p, env.config); },
      attempts: 4000
    });

    var patches = [];
    var items = [];

    for (var c = 0; c < centers.length; c++) {
      var center = centers[c];
      var patch = { id: c, x: center.x, y: center.y, radius: cfg.patchRadius, items: [] };
      var localHash = new WL.Geo.SpatialHash(cfg.itemSpacing);
      var wanted = rng.intIn(cfg.perPatch);
      var attempts = wanted * 40;

      for (var i = 0; i < attempts && patch.items.length < wanted; i++) {
        var p = rng.pointInCircle(center.x, center.y, cfg.patchRadius);
        if (!WL.Rules.placement.resource(q, p, env.config)) continue;
        if (localHash.hasWithin(p.x, p.y, cfg.itemSpacing)) continue;
        if (treeHash.hasWithin(p.x, p.y, cfg.treeClearance)) continue;

        localHash.insert(p.x, p.y);
        var item = {
          x: p.x,
          y: p.y,
          patch: c,
          r: rng.range(3.2, 5.4),
          variant: rng.int(0, 2),
          rot: rng.range(0, Math.PI * 2)
        };
        patch.items.push(item);
        items.push(item);
      }
      if (patch.items.length) patches.push(patch);
    }

    return { patches: patches, items: items };
  }

  // ------------------------------------------------------------ Apfelbaeume

  function placeAppleTrees(env, q, grasslands) {
    var cfg = env.config.appleTrees;
    var rng = env.rng.fork('apples');

    // Bevorzugt die grosse Graslandschaft, ansonsten jede ausreichend grosse Wiese.
    var pool = [];
    for (var g = 0; g < grasslands.length; g++) {
      if (g === 0 || grasslands[g].cellCount > 600) pool = pool.concat(grasslands[g].cells);
    }
    if (!pool.length) return { groups: [], trees: [] };
    var pick = sampler(pool, env.cols, env.cellSize);

    var centers = WL.Geo.scatter(rng, {
      count: rng.intIn(cfg.groups),
      minDistance: cfg.minGroupSeparation,
      sample: pick,
      accept: function (p) { return WL.Rules.placement.appleGroup(q, p, env.config); },
      attempts: 5000
    });

    var groups = [];
    var trees = [];

    for (var c = 0; c < centers.length; c++) {
      var center = centers[c];
      var group = { id: c, x: center.x, y: center.y, radius: cfg.groupRadius, trees: [] };
      var hash = new WL.Geo.SpatialHash(cfg.treeSpacing);
      var wanted = rng.intIn(cfg.perGroup);

      for (var i = 0; i < wanted * 60 && group.trees.length < wanted; i++) {
        var p = rng.pointInCircle(center.x, center.y, cfg.groupRadius);
        if (!WL.Rules.placement.appleTree(q, p, env.config)) continue;
        if (hash.hasWithin(p.x, p.y, cfg.treeSpacing)) continue;
        hash.insert(p.x, p.y);

        var radius = rng.rangeIn(cfg.radius);
        var apples = [];
        var appleCount = rng.int(3, 6);
        for (var a = 0; a < appleCount; a++) {
          var ang = rng.range(0, Math.PI * 2);
          var rr = radius * rng.range(0.25, 0.72);
          apples.push({ dx: Math.cos(ang) * rr, dy: Math.sin(ang) * rr, r: rng.range(2.1, 3.1) });
        }
        var tree = { x: p.x, y: p.y, r: radius, group: c, apples: apples, shade: rng.range(-1, 1) };
        group.trees.push(tree);
        trees.push(tree);
      }
      if (group.trees.length) groups.push(group);
    }

    return { groups: groups, trees: trees };
  }

  // ---------------------------------------------------------- Ameisenhuegel

  function placeAnthills(env, q, openCells) {
    var cfg = env.config.anthills;
    var rng = env.rng.fork('anthills');
    var pick = sampler(openCells, env.cols, env.cellSize);

    var points = WL.Geo.scatter(rng, {
      count: rng.intIn(cfg.count),
      minDistance: cfg.minSeparation,
      sample: pick,
      accept: function (p) { return WL.Rules.placement.anthill(q, p, env.config); },
      attempts: 6000,
      minDistanceFloor: cfg.minSeparation * 0.5
    });

    return points.map(function (p, i) {
      var radius = rng.rangeIn(cfg.radius);
      var specks = [];
      var n = rng.int(6, 11);
      for (var s = 0; s < n; s++) {
        var ang = rng.range(0, Math.PI * 2);
        var rr = radius * rng.range(0.15, 0.85);
        specks.push({ dx: Math.cos(ang) * rr, dy: Math.sin(ang) * rr, r: rng.range(0.9, 1.7) });
      }
      return { id: i, x: p.x, y: p.y, r: radius, specks: specks, rot: rng.range(0, Math.PI) };
    });
  }

  // -------------------------------------------------------------- Dekoration

  function buildDecor(env, grid) {
    var cfg = env.config.decor;
    var rng = env.rng.fork('decor');
    var cellSize = env.cellSize;
    var cols = env.cols;

    var tufts = [];
    var specks = [];
    var floorDots = [];

    for (var i = 0; i < grid.data.length; i++) {
      var type = grid.data[i];
      if (type === T.WATER) continue;
      var chance = type === T.GRASS ? cfg.grassTuftsPerCell
        : type === T.GROUND ? cfg.groundSpecksPerCell
          : cfg.forestFloorDotsPerCell;
      if (rng.next() > chance) continue;

      var cx = i % cols;
      var cy = (i - cx) / cols;
      var p = {
        x: (cx + rng.next()) * cellSize,
        y: (cy + rng.next()) * cellSize,
        r: rng.range(1.1, 2.6),
        rot: rng.range(-0.6, 0.6),
        shade: rng.range(-1, 1)
      };
      if (type === T.GRASS) tufts.push(p);
      else if (type === T.GROUND) specks.push(p);
      else floorDots.push(p);
    }

    return { grassTufts: tufts, groundSpecks: specks, forestFloor: floorDots };
  }

  function build(env, terrain, q) {
    var grid = terrain.grid;
    var forestCells = cellsOfType(grid, T.FOREST);
    var openCells = [];
    for (var i = 0; i < grid.data.length; i++) {
      if (grid.data[i] === T.GRASS || grid.data[i] === T.GROUND) openCells.push(i);
    }

    var treeResult = placeTrees(env, q, forestCells);
    var resourceResult = placeResources(env, q, forestCells, treeResult.hash);
    var appleResult = placeAppleTrees(env, q, terrain.grasslands);
    var anthills = placeAnthills(env, q, openCells);
    var decor = buildDecor(env, grid);

    return {
      trees: treeResult.trees,
      resources: resourceResult.items,
      resourcePatches: resourceResult.patches,
      appleTrees: appleResult.trees,
      appleGroups: appleResult.groups,
      anthills: anthills,
      decor: decor
    };
  }

  WL.Objects = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
