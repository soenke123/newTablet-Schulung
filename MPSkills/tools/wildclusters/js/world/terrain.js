/**
 * Erzeugung der Landschaftsflaechen: Wasser -> Wald -> Gras -> Boden.
 *
 * Reihenfolge ist wichtig:
 *   - Wasser zuerst, damit alles andere ausweichen kann.
 *   - Wald danach, abzueglich eines Uferstreifens um das Wasser. Dadurch ist die
 *     Regel "Wald x Wasser verboten" strukturell erfuellt, nicht nur geprueft.
 *   - Gras auf dem Rest, per Noise-Schwellwert, sodass bewusst offene
 *     Bodenflaechen uebrig bleiben.
 *
 * Keine Flaeche entsteht als Kreis oder Rechteck: jeder Radius wird punktweise
 * durch fBm verzerrt, Waelder wachsen zusaetzlich entlang einer gekruemmten Achse.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /**
   * Zeichnet einen organisch verzerrten Klecks in eine Maske.
   * Der Radius wird richtungsabhaengig durch Noise moduliert -> Ausbuchtungen
   * und Einschnuerungen statt eines Kreises.
   */
  function stampBlob(mask, cols, rows, cellSize, blob, noise, cfg, blocked) {
    var reach = blob.r * (cfg.warpLow + cfg.warpHigh) * 1.05;
    // Verzerrungsfrequenz an die Groesse koppeln: sonst bekommt ein kleiner
    // Tuempel ueber seine ganze Flaeche fast denselben Noise-Wert - und wird
    // damit zum Kreis. Kleine Formen brauchen kurzwelligere Stoerung.
    var warpScale = cfg.warpScale * (cfg.warpReference || 120) / blob.r;
    var minX = Math.max(0, Math.floor((blob.x - reach) / cellSize));
    var maxX = Math.min(cols - 1, Math.ceil((blob.x + reach) / cellSize));
    var minY = Math.max(0, Math.floor((blob.y - reach) / cellSize));
    var maxY = Math.min(rows - 1, Math.ceil((blob.y + reach) / cellSize));

    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var idx = y * cols + x;
        if (blocked && blocked[idx]) continue;
        if (mask[idx]) continue;
        var wx = (x + 0.5) * cellSize;
        var wy = (y + 0.5) * cellSize;
        var dx = wx - blob.x;
        var dy = wy - blob.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach) continue;
        // Kern liegt in jedem Fall innen - Noise nur im Randband auswerten.
        if (d < blob.r * cfg.warpLow) { mask[idx] = 1; continue; }
        var n = noise.fbm(
          (wx + blob.ox) * warpScale,
          (wy + blob.oy) * warpScale,
          3
        );
        if (d < blob.r * (cfg.warpLow + cfg.warpHigh * n)) mask[idx] = 1;
      }
    }
  }

  function maskRatio(mask) {
    var n = 0;
    for (var i = 0; i < mask.length; i++) if (mask[i]) n++;
    return n / mask.length;
  }

  /** Komponenten unterhalb einer Mindestgroesse aus der Maske entfernen. */
  function pruneSmall(mask, cols, rows, minCells) {
    var cc = WL.Grid.connectedComponents(mask, cols, rows);
    var kept = [];
    for (var i = 0; i < cc.components.length; i++) {
      var comp = cc.components[i];
      if (comp.size < minCells) {
        for (var k = 0; k < comp.cells.length; k++) mask[comp.cells[k]] = 0;
      } else {
        kept.push(comp);
      }
    }
    return kept;
  }

  function componentMeta(comp, cellSize, extra) {
    var meta = {
      id: comp.id,
      cells: comp.cells,
      cellCount: comp.size,
      x: (comp.cx + 0.5) * cellSize,
      y: (comp.cy + 0.5) * cellSize,
      area: comp.size * cellSize * cellSize,
      bounds: {
        minX: comp.bbox.minX * cellSize,
        minY: comp.bbox.minY * cellSize,
        maxX: (comp.bbox.maxX + 1) * cellSize,
        maxY: (comp.bbox.maxY + 1) * cellSize
      }
    };
    if (extra) for (var key in extra) meta[key] = extra[key];
    return meta;
  }

  // ---------------------------------------------------------------- Wasser

  function buildWater(env) {
    var cfg = env.config.water;
    var rng = env.rng.fork('water');
    var noise = new WL.Noise(rng.fork('water-shape').seed);
    var W = env.width, H = env.height;
    var margin = cfg.edgeMargin;

    var bigCount = rng.intIn(cfg.bigPonds);
    var smallCount = rng.intIn(cfg.smallPools);

    var bigCenters = WL.Geo.scatter(rng, {
      count: bigCount,
      minDistance: cfg.minSeparationBig,
      sample: function (r) {
        return { x: r.range(margin, W - margin), y: r.range(margin, H - margin) };
      }
    });

    var smallCenters = WL.Geo.scatter(rng, {
      count: smallCount,
      minDistance: cfg.minSeparationSmall,
      sample: function (r) {
        return { x: r.range(margin * 0.7, W - margin * 0.7), y: r.range(margin * 0.7, H - margin * 0.7) };
      },
      accept: function (p) {
        for (var i = 0; i < bigCenters.length; i++) {
          if (WL.Geo.dist(p.x, p.y, bigCenters[i].x, bigCenters[i].y) < cfg.minSeparationBig * 0.62) return false;
        }
        return true;
      }
    });

    var blobs = [];
    var i;
    for (i = 0; i < bigCenters.length; i++) {
      blobs.push({
        x: bigCenters[i].x, y: bigCenters[i].y,
        r: rng.rangeIn(cfg.bigRadius),
        ox: rng.range(0, 4000), oy: rng.range(0, 4000),
        big: true
      });
    }
    for (i = 0; i < smallCenters.length; i++) {
      blobs.push({
        x: smallCenters[i].x, y: smallCenters[i].y,
        r: rng.rangeIn(cfg.smallRadius),
        ox: rng.range(0, 4000), oy: rng.range(0, 4000),
        big: false
      });
    }

    // Radien nachregeln: erst auf den Zielanteil, dann notfalls verkleinern,
    // damit die geforderte Anzahl getrennter Wasserflaechen erhalten bleibt.
    var target = env.config.targets.water;
    var tolerance = env.config.targets.tolerance;
    var range = cfg.radiusScaleRange;
    var scale = 1;
    var mask, bodies;

    for (var attempt = 0; attempt < 6; attempt++) {
      mask = new Uint8Array(env.cols * env.rows);
      for (i = 0; i < blobs.length; i++) {
        stampBlob(mask, env.cols, env.rows, env.cellSize,
          { x: blobs[i].x, y: blobs[i].y, r: blobs[i].r * scale, ox: blobs[i].ox, oy: blobs[i].oy },
          noise, cfg, null);
      }
      bodies = pruneSmall(mask, env.cols, env.rows, cfg.minBodyCells);
      var ratio = maskRatio(mask);
      var enoughBodies = bodies.length >= Math.min(cfg.minBodies, blobs.length);

      if (!enoughBodies) {
        scale = clamp(scale * 0.88, range[0], range[1]);
        continue;
      }
      if (Math.abs(ratio - target) <= tolerance * 0.4 || ratio <= 0.0001) break;
      var next = clamp(scale * clamp(Math.sqrt(target / ratio), 0.85, 1.18), range[0], range[1]);
      if (Math.abs(next - scale) < 0.005) break;
      scale = next;
    }

    var meta = [];
    for (i = 0; i < bodies.length; i++) {
      meta.push(componentMeta(bodies[i], env.cellSize, {
        kind: bodies[i].size * env.cellSize * env.cellSize > 22000 ? 'pond' : 'pool'
      }));
    }
    return { mask: mask, bodies: meta, ratio: maskRatio(mask) };
  }

  // ------------------------------------------------------------------ Wald

  function planForestRegions(rng, env, cfg) {
    var W = env.width, H = env.height;
    var count = rng.intIn(cfg.regions);
    var anchors = WL.Geo.scatter(rng, {
      count: count,
      minDistance: cfg.minSeparation,
      sample: function (r) {
        return { x: r.range(W * 0.12, W * 0.88), y: r.range(H * 0.12, H * 0.88) };
      }
    });

    // Startpunkte festlegen. Ein Teil der Waelder beginnt bewusst am naechsten
    // Kartenrand und laeuft an ihm entlang - laut Vorgabe ausdruecklich
    // erwuenscht. Weil auf den *naechstgelegenen* Rand projiziert wird, bleibt
    // der Abstand der Regionen zueinander dabei erhalten.
    var starts = [];
    for (var i = 0; i < anchors.length; i++) {
      var start = { x: anchors[i].x, y: anchors[i].y };
      var angle = rng.range(0, Math.PI * 2);

      if (rng.chance(cfg.edgeAnchorChance)) {
        var dLeft = start.x, dRight = W - start.x, dTop = start.y, dBottom = H - start.y;
        var min = Math.min(dLeft, dRight, dTop, dBottom);
        if (min === dTop) { start.y = rng.range(-30, 30); angle = 0; }
        else if (min === dBottom) { start.y = H + rng.range(-30, 30); angle = 0; }
        else if (min === dLeft) { start.x = rng.range(-30, 30); angle = Math.PI / 2; }
        else { start.x = W + rng.range(-30, 30); angle = Math.PI / 2; }
        // entlang des Randes, Richtung zufaellig
        angle += (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.35, 0.35);
      }
      starts.push({ x: start.x, y: start.y, angle: angle });
    }

    var regions = [];
    for (var s = 0; s < starts.length; s++) {
      var origin = starts[s];
      var blobs = [];
      var n = rng.intIn(cfg.blobsPerRegion);
      var px = origin.x, py = origin.y, a = origin.angle;

      for (var b = 0; b < n; b++) {
        blobs.push({
          x: px, y: py,
          r: rng.rangeIn(cfg.blobRadius),
          ox: rng.range(0, 4000), oy: rng.range(0, 4000)
        });

        var step = rng.rangeIn(cfg.stepLength);
        a += rng.range(-cfg.turn, cfg.turn);
        var nx = px + Math.cos(a) * step;
        var ny = py + Math.sin(a) * step;

        // 1. Abstossung von fremden Regionen - haelt die Waldgebiete getrennt.
        var rx = 0, ry = 0;
        for (var o = 0; o < starts.length; o++) {
          if (o === s) continue;
          var ddx = nx - starts[o].x;
          var ddy = ny - starts[o].y;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          if (dd < cfg.repelRadius) {
            var w = (cfg.repelRadius - dd) / cfg.repelRadius;
            rx += (ddx / dd) * w;
            ry += (ddy / dd) * w;
          }
        }
        // 2. Rueckbindung an den Startpunkt - begrenzt die Ausdehnung.
        var spanX = nx - origin.x;
        var spanY = ny - origin.y;
        var span = Math.sqrt(spanX * spanX + spanY * spanY);
        if (span > cfg.maxSpan) {
          rx -= (spanX / span) * ((span - cfg.maxSpan) / cfg.maxSpan + 0.5);
          ry -= (spanY / span) * ((span - cfg.maxSpan) / cfg.maxSpan + 0.5);
        }
        // 3. Nicht zu weit aus der Karte hinauslaufen.
        if (nx < -70) rx += 1; else if (nx > W + 70) rx -= 1;
        if (ny < -70) ry += 1; else if (ny > H + 70) ry -= 1;

        if (rx !== 0 || ry !== 0) {
          a = Math.atan2(Math.sin(a) + ry, Math.cos(a) + rx);
          nx = px + Math.cos(a) * step;
          ny = py + Math.sin(a) * step;
        }
        px = nx;
        py = ny;
      }
      regions.push({ blobs: blobs });
    }
    return regions;
  }

  function buildForest(env, waterMask) {
    var cfg = env.config.forest;
    var rng = env.rng.fork('forest');
    var noise = new WL.Noise(rng.fork('forest-shape').seed);
    var target = env.config.targets.forest;
    var tolerance = env.config.targets.tolerance;

    // Uferstreifen: hier darf kein Wald wachsen.
    var blocked = WL.Grid.dilate(waterMask, env.cols, env.rows, cfg.waterBuffer);

    var plan = planForestRegions(rng, env, cfg);
    var range = cfg.radiusScaleRange;
    var wantedRegions = Math.min(2, plan.length);
    var scale = 1;
    var mask = null;
    var comps = [];

    function stampAll(s) {
      var m = new Uint8Array(env.cols * env.rows);
      for (var r = 0; r < plan.length; r++) {
        var blobs = plan[r].blobs;
        for (var b = 0; b < blobs.length; b++) {
          stampBlob(m, env.cols, env.rows, env.cellSize,
            { x: blobs[b].x, y: blobs[b].y, r: blobs[b].r * s, ox: blobs[b].ox, oy: blobs[b].oy },
            noise, cfg, blocked);
        }
      }
      return m;
    }

    // Schritt 1: Radien auf den Zielanteil der Weltflaeche einregeln.
    for (var attempt = 0; attempt < 6; attempt++) {
      mask = stampAll(scale);
      var ratio = maskRatio(mask);
      if (ratio <= 0.0001) break;
      if (Math.abs(ratio - target) <= tolerance * 0.4) break;
      var next = clamp(scale * clamp(Math.sqrt(target / ratio), 0.78, 1.3), range[0], range[1]);
      if (Math.abs(next - scale) < 0.005) break;
      scale = next;
    }

    // Schritt 2: Sind die Gebiete zusammengewachsen, Radien schrittweise
    // zuruecknehmen - lieber etwas weniger Waldflaeche als ein einziger Block.
    var separationScale = scale;
    // pruneSmall raeumt die Maske direkt mit auf - Maske und Komponentenliste
    // bleiben dadurch immer konsistent.
    var best = { mask: mask, comps: pruneSmall(mask, env.cols, env.rows, cfg.minRegionCells) };
    for (var pass = 0; pass < cfg.separationPasses; pass++) {
      var candidate = stampAll(separationScale);
      var candidateComps = pruneSmall(candidate, env.cols, env.rows, cfg.minRegionCells);
      if (candidateComps.length > best.comps.length) {
        best = { mask: candidate, comps: candidateComps };
      }
      if (best.comps.length >= wantedRegions) break;
      separationScale = clamp(separationScale * 0.9, range[0], range[1]);
    }

    mask = best.mask;
    comps = best.comps;
    var regions = [];
    for (var i = 0; i < comps.length; i++) {
      regions.push(componentMeta(comps[i], env.cellSize, {}));
    }
    return {
      mask: mask,
      regions: regions,
      ratio: maskRatio(mask),
      debug: { radiusScale: scale, plannedRegions: plan.length }
    };
  }

  // ------------------------------------------------------------------ Gras

  function buildGrass(env, grid, groundTarget) {
    var cfg = env.config.grass;
    var rng = env.rng.fork('grass');
    var noise = new WL.Noise(rng.fork('grass-shape').seed);
    var total = env.cols * env.rows;

    // Noise nur einmal auswerten, danach nur noch den Schwellwert variieren.
    var free = [];
    var values = [];
    for (var y = 0; y < env.rows; y++) {
      for (var x = 0; x < env.cols; x++) {
        var idx = y * env.cols + x;
        if (grid.data[idx] !== T.GROUND) continue;
        var wx = (x + 0.5) * env.cellSize;
        var wy = (y + 0.5) * env.cellSize;
        free.push(idx);
        values.push(noise.fbm(wx * cfg.noiseScale, wy * cfg.noiseScale, cfg.octaves));
      }
    }

    var mask = new Uint8Array(total);
    var patches = [];
    var threshold = 0.5;

    for (var retry = 0; retry < 3; retry++) {
      // Binaersuche: Schwellwert so, dass der offene Bodenanteil das Ziel trifft.
      var lo = 0, hi = 1;
      for (var step = 0; step < 16; step++) {
        threshold = (lo + hi) / 2;
        var groundCells = 0;
        for (var i = 0; i < values.length; i++) if (values[i] <= threshold) groundCells++;
        var groundRatio = groundCells / total;
        if (groundRatio > groundTarget) hi = threshold; else lo = threshold;
      }
      threshold -= retry * 0.05; // Nachversuch: mehr Gras zulassen

      mask = new Uint8Array(total);
      for (var j = 0; j < free.length; j++) if (values[j] > threshold) mask[free[j]] = 1;

      patches = pruneSmall(mask, env.cols, env.rows, cfg.minPatchCells);
      var totalGrass = 0;
      for (var p = 0; p < patches.length; p++) totalGrass += patches[p].size;
      if (patches.length && totalGrass > 0 && patches[0].size / totalGrass >= cfg.minLargestShare) break;
    }

    var meta = [];
    for (var m = 0; m < patches.length; m++) {
      meta.push(componentMeta(patches[m], env.cellSize, { main: m === 0 }));
    }
    return { mask: mask, patches: meta, ratio: maskRatio(mask), threshold: threshold };
  }

  // -------------------------------------------------------------- Pipeline

  function build(env) {
    var grid = new WL.Grid(env.cols, env.rows, T.GROUND);
    var i;

    var water = buildWater(env);
    for (i = 0; i < water.mask.length; i++) if (water.mask[i]) grid.data[i] = T.WATER;

    var forest = buildForest(env, water.mask);
    for (i = 0; i < forest.mask.length; i++) if (forest.mask[i]) grid.data[i] = T.FOREST;

    // Bodenanteil an den tatsaechlichen Wasseranteil koppeln, damit die
    // geforderte Reihenfolge Gras > Wald > Wasser > Boden immer stimmt.
    var t = env.config.targets;
    var groundTarget = clamp(water.ratio * t.groundFactorOfWater, t.groundMin, t.groundMax);

    var grass = buildGrass(env, grid, groundTarget);
    for (i = 0; i < grass.mask.length; i++) if (grass.mask[i]) grid.data[i] = T.GRASS;

    // Abstandsfelder - sofort fuer die Objektplatzierung gebraucht und spaeter
    // fuer die Tier-KI (Durst, Deckung, Reviergrenzen) wiederverwendbar.
    var waterMask = grid.mask(T.WATER);
    var forestMask = grid.mask(T.FOREST);
    var fields = {
      distToWater: WL.Grid.distanceTransform(waterMask, env.cols, env.rows),
      distToForest: WL.Grid.distanceTransform(forestMask, env.cols, env.rows),
      forestDepth: WL.Grid.distanceTransform(grid.maskNot(T.FOREST), env.cols, env.rows)
    };

    return {
      grid: grid,
      waterBodies: water.bodies,
      forestRegions: forest.regions,
      grasslands: grass.patches,
      fields: fields,
      debug: {
        grassThreshold: grass.threshold,
        groundTarget: groundTarget,
        waterRatio: water.ratio,
        forestRadiusScale: forest.debug.radiusScale,
        plannedForestRegions: forest.debug.plannedRegions
      }
    };
  }

  WL.Terrain = { build: build, stampBlob: stampBlob };
})(typeof window !== 'undefined' ? window : globalThis);
