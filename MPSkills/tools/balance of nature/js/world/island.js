/**
 * Inselgenerator.
 *
 * Reihenfolge (jeder Schritt mit eigenem Sub-RNG, siehe core/rng.js):
 *
 *   1. Form      verzerrte Ellipse -> Kuestenlinie, nur die groesste Landmasse bleibt
 *   2. Relief    Huegel + Bergruecken + Vulkan mit Krater
 *   3. Wasser    Senken fuellen (Priority-Flood) -> Seen; Abfluss + Einzugsgebiet -> Fluesse
 *   4. Klima     Westwind mit Regenschatten hinter den Bergen, Kuesten- und Gewaessernaehe
 *   5. Biome     aus Hoehe, Feuchte, Hangneigung; Thermalfelder am Vulkan; Flecken glaetten
 *
 * Ergebnis ist ein Raster mit genau einem Lebensraum pro Zelle (BT.BIOME) plus
 * Hoehen-, Feuchte- und Abstandsfelder, die spaeter die Simulation braucht.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // 8er-Nachbarschaft
  var DX = [1, -1, 0, 0, 1, 1, -1, -1];
  var DY = [0, 0, 1, -1, 1, -1, 1, -1];

  // ------------------------------------------------------------ Min-Heap
  function Heap(capacity) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
    this.size = 0;
  }
  Heap.prototype.push = function (key, val) {
    var i = this.size++;
    var k = this.keys, v = this.vals;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    var k = this.keys, v = this.vals;
    var top = v[0];
    var n = --this.size;
    if (n > 0) {
      var key = k[n], val = v[n];
      var i = 0;
      for (;;) {
        var l = 2 * i + 1;
        if (l >= n) break;
        var r = l + 1;
        var c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c];
        i = c;
      }
      k[i] = key; v[i] = val;
    }
    return top;
  };

  // ------------------------------------------------------------ 1. Form
  function buildShape(ctx, rng, scaleBoost) {
    var cfg = ctx.cfg.shape;
    var cols = ctx.cols, rows = ctx.rows;
    var noise = new BT.Noise(rng.fork('warp').seed);
    var detail = new BT.Noise(rng.fork('detail').seed);
    var cx = 0.5 + rng.range(-0.03, 0.03);
    var cy = 0.5 + rng.range(-0.03, 0.03);
    var rx = cfg.radiusX * scaleBoost;
    var ry = cfg.radiusY * scaleBoost;
    var ox = rng.range(0, 100), oy = rng.range(0, 100);
    var base = new Float32Array(cols * rows);

    // Lappen: kleinere Ellipsen am Rand -> Halbinseln und Buchten
    var lobes = [];
    var nLobes = rng.intIn(cfg.lobes);
    for (var l = 0; l < nLobes; l++) {
      var la = rng.range(0, Math.PI * 2);
      var ld = rng.range(0.75, 1.05);
      lobes.push({
        x: cx + BT.M.cos(la) * rx * ld, y: cy + BT.M.sin(la) * ry * ld,
        rx: rx * rng.rangeIn(cfg.lobeSize), ry: ry * rng.rangeIn(cfg.lobeSize)
      });
    }

    for (var y = 0; y < rows; y++) {
      var v = (y + 0.5) / rows;
      for (var x = 0; x < cols; x++) {
        var u = (x + 0.5) / cols;
        var dx = (u - cx) / rx;
        var dy = (v - cy) / ry;
        var wx = noise.signed(ox + u * cfg.warpScale, oy + v * cfg.warpScale, 3);
        var wy = noise.signed(oy + 40 + u * cfg.warpScale, ox + 40 + v * cfg.warpScale, 3);
        dx += wx * cfg.warpAmount;
        dy += wy * cfg.warpAmount;
        var d = Math.sqrt(dx * dx + dy * dy);
        for (var lb = 0; lb < lobes.length; lb++) {
          var L = lobes[lb];
          var lx = (u - L.x) / L.rx + wx * cfg.warpAmount * 1.4;
          var ly = (v - L.y) / L.ry + wy * cfg.warpAmount * 1.4;
          // Lappen mit gleicher "Hoehe" wie die Hauptform an derselben Stelle
          var dl = Math.sqrt(lx * lx + ly * ly);
          if (dl < d) d = d * 0.35 + dl * 0.65;
        }
        var b = 1 - d + detail.signed(u * cfg.detailScale, v * cfg.detailScale, 3) * cfg.detailAmount;
        // Rand der Welt ist immer Meer.
        var edge = Math.min(u, 1 - u, v, 1 - v);
        if (edge < 0.04) b = Math.min(b, -0.05);
        base[y * cols + x] = b;
      }
    }

    // Nur die groesste Landmasse behalten - die Insel ist abgeschlossen.
    var mask = new Uint8Array(cols * rows);
    for (var i = 0; i < mask.length; i++) mask[i] = base[i] > cfg.seaLevel ? 1 : 0;
    var cc = BT.Grid.connectedComponents(mask, cols, rows);
    var land = new Uint8Array(cols * rows);
    if (cc.components.length) {
      var main = cc.components[0].cells;
      for (var j = 0; j < main.length; j++) land[main[j]] = 1;
    }
    // Seen im Land, die zum Meer "durchgerutscht" waeren, gehoeren zum Land:
    // alles Wasser, das nicht mit dem Weltrand verbunden ist, wird Land.
    var sea = new Uint8Array(cols * rows);
    for (i = 0; i < sea.length; i++) sea[i] = land[i] ? 0 : 1;
    var seaCC = BT.Grid.connectedComponents(sea, cols, rows);
    for (var c = 1; c < seaCC.components.length; c++) {
      var cells = seaCC.components[c].cells;
      for (j = 0; j < cells.length; j++) { land[cells[j]] = 1; base[cells[j]] = Math.max(base[cells[j]], 0.01); }
    }

    var landCount = 0;
    for (i = 0; i < land.length; i++) landCount += land[i];
    return { base: base, land: land, share: landCount / land.length, cx: cx, cy: cy };
  }

  // ------------------------------------------------------------ 2. Relief
  function buildRelief(ctx, rng, shape) {
    var cfg = ctx.cfg.relief;
    var cols = ctx.cols, rows = ctx.rows, cell = ctx.cellSize;
    var W = ctx.width, H = ctx.height;
    var land = shape.land, base = shape.base;
    var height = new Float32Array(cols * rows);
    var hills = new BT.Noise(rng.fork('hills').seed);

    // Abstand zur Kueste (in Zellen) als Grundanstieg ins Landesinnere.
    var seaMask = new Uint8Array(cols * rows);
    for (var i = 0; i < seaMask.length; i++) seaMask[i] = land[i] ? 0 : 1;
    var distSea = BT.Grid.distanceTransform(seaMask, cols, rows);
    var maxDist = 1;
    for (i = 0; i < distSea.length; i++) if (land[i] && distSea[i] > maxDist) maxDist = distSea[i];

    var maxBase = 0.01;
    for (i = 0; i < base.length; i++) if (land[i] && base[i] > maxBase) maxBase = base[i];

    // Inselbreite in Weltunits (fuer relative Groessen)
    var islandSpan = Math.min(W, H) * 0.8;

    // Landpunkte fuer die Platzierung
    function randomLandPoint(r, minDist) {
      for (var t = 0; t < 400; t++) {
        var x = r.int(0, cols - 1), y = r.int(0, rows - 1);
        var idx = y * cols + x;
        if (land[idx] && distSea[idx] >= minDist) return { x: (x + 0.5) * cell, y: (y + 0.5) * cell };
      }
      return { x: shape.cx * W, y: shape.cy * H };
    }

    // Bergruecken als Segmente
    var ridgeRng = rng.fork('ridges');
    var ridges = [];
    var nRidges = ridgeRng.intIn(cfg.ridges);
    for (var r = 0; r < nRidges; r++) {
      var mid = randomLandPoint(ridgeRng, maxDist * 0.35);
      var ang = ridgeRng.range(0, Math.PI);
      var len = ridgeRng.rangeIn(cfg.ridgeLength) * islandSpan;
      ridges.push({
        ax: mid.x - BT.M.cos(ang) * len / 2, ay: mid.y - BT.M.sin(ang) * len / 2,
        bx: mid.x + BT.M.cos(ang) * len / 2, by: mid.y + BT.M.sin(ang) * len / 2,
        width: ridgeRng.rangeIn(cfg.ridgeWidth) * islandSpan,
        height: ridgeRng.rangeIn(cfg.ridgeHeight)
      });
    }

    // Vulkan: weit im Landesinneren, nicht direkt auf einem Bergruecken
    var volRng = rng.fork('volcano');
    var volcano = null;
    if (cfg.volcano) {
      var best = null, bestScore = -1;
      for (var t = 0; t < 30; t++) {
        var p = randomLandPoint(volRng, maxDist * 0.45);
        var dRidge = Infinity;
        for (r = 0; r < ridges.length; r++) dRidge = Math.min(dRidge, segDist(p.x, p.y, ridges[r]));
        var score = Math.min(dRidge, islandSpan * 0.3) + volRng.range(0, islandSpan * 0.05);
        if (score > bestScore) { bestScore = score; best = p; }
      }
      volcano = { x: best.x, y: best.y, radius: volRng.rangeIn(cfg.volcanoRadius) * islandSpan };
    }

    // Mulden fuer Seen: im Landesinneren, nicht auf dem Vulkan
    var basinRng = rng.fork('basins');
    var basins = [];
    var nBasins = basinRng.intIn(cfg.basins);
    for (var bt = 0; bt < nBasins * 20 && basins.length < nBasins; bt++) {
      var bp = randomLandPoint(basinRng, maxDist * 0.25);
      if (volcano && BT.M.hypot(bp.x - volcano.x, bp.y - volcano.y) < volcano.radius * 2.6) continue;
      var close = false;
      for (var q = 0; q < basins.length; q++) if (BT.M.hypot(basins[q].x - bp.x, basins[q].y - bp.y) < islandSpan * 0.18) close = true;
      if (close) continue;
      basins.push({ x: bp.x, y: bp.y, radius: basinRng.rangeIn(cfg.basinRadius) * islandSpan, depth: basinRng.rangeIn(cfg.basinDepth) });
    }

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var idx = y * cols + x;
        if (!land[idx]) { height[idx] = Math.min(base[idx], -0.001); continue; }
        var wx = (x + 0.5) * cell, wy = (y + 0.5) * cell;
        // Glatter Anstieg aus der Inselform (das Abstandsfeld haette Knicke)
        var inland = clamp(base[idx] / maxBase, 0, 1);
        var h = 0.04 + BT.M.pow(inland, 0.8) * 0.26;
        h += hills.fbm(wx * 0.0035, wy * 0.0035, 4) * cfg.hillNoise * smoothstep(0, 0.25, inland);
        var coastFade = smoothstep(0, 0.12, inland);
        for (r = 0; r < ridges.length; r++) {
          var rd = ridges[r];
          var sd = segDistT(wx, wy, rd);
          var taper = BT.M.pow(BT.M.sin(Math.PI * sd.t), 0.6);
          var rough = 0.65 + 0.35 * hills.fbm(wx * 0.012 + 50, wy * 0.012, 3);
          h += rd.height * BT.M.exp(-BT.M.pow(sd.d / rd.width, 2)) * taper * rough * coastFade;
        }
        if (volcano) {
          var vd = BT.M.hypot(wx - volcano.x, wy - volcano.y) / volcano.radius;
          if (vd < 2.2) {
            h += cfg.volcanoHeight * BT.M.pow(Math.max(0, 1 - vd / 2.2), 1.6);
            if (vd < cfg.craterRadius) h -= cfg.craterDepth * (1 - vd / cfg.craterRadius);
          }
        }
        for (var bi = 0; bi < basins.length; bi++) {
          var bs = basins[bi];
          var bd = BT.M.hypot(wx - bs.x, wy - bs.y) / bs.radius;
          bd += hills.signed(wx * 0.02 + bi * 7, wy * 0.02, 2) * 0.35;
          if (bd < 1) h -= bs.depth * (1 - bd * bd);
        }
        height[idx] = Math.max(0.001, h);
      }
    }

    // Auf [0, 1] normieren (nur Land)
    var maxH = 0;
    for (i = 0; i < height.length; i++) if (land[i] && height[i] > maxH) maxH = height[i];
    for (i = 0; i < height.length; i++) if (land[i]) height[i] /= maxH;

    return { height: height, distSea: distSea, ridges: ridges, volcano: volcano, basins: basins };
  }

  function segDistT(px, py, s) {
    var vx = s.bx - s.ax, vy = s.by - s.ay;
    var len2 = vx * vx + vy * vy;
    var t = len2 ? clamp(((px - s.ax) * vx + (py - s.ay) * vy) / len2, 0, 1) : 0;
    var qx = s.ax + vx * t, qy = s.ay + vy * t;
    return { d: BT.M.hypot(px - qx, py - qy), t: t };
  }
  function segDist(px, py, s) { return segDistT(px, py, s).d; }

  // ------------------------------------------------------------ 3. Wasser
  /**
   * Priority-Flood (Barnes et al.): fuellt alle Senken so auf, dass jede
   * Zelle zum Meer entwaessert. Was dabei aufgefuellt wird, ist potenziell See.
   * Liefert auch die Reihenfolge, in der die Zellen erreicht wurden
   * (aufsteigend) - rueckwaerts gelesen ist das die Abflussreihenfolge.
   */
  function priorityFlood(height, land, cols, rows) {
    var n = cols * rows;
    var filled = new Float32Array(n);
    var done = new Uint8Array(n);
    var order = new Int32Array(n);
    var heap = new Heap(n);
    var count = 0;
    var EPS = 1e-5;
    var i;
    for (i = 0; i < n; i++) {
      if (!land[i]) { filled[i] = height[i]; done[i] = 1; }
    }
    // Startfront: Landzellen, die ans Meer grenzen
    for (i = 0; i < n; i++) {
      if (!land[i]) continue;
      var x = i % cols, y = (i - x) / cols;
      for (var k = 0; k < 8; k++) {
        var nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (!land[ny * cols + nx]) { filled[i] = height[i]; done[i] = 1; heap.push(height[i], i); break; }
      }
    }
    while (heap.size) {
      var c = heap.pop();
      order[count++] = c;
      var cx = c % cols, cy = (c - cx) / cols;
      for (var d = 0; d < 8; d++) {
        var ax = cx + DX[d], ay = cy + DY[d];
        if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue;
        var a = ay * cols + ax;
        if (done[a]) continue;
        done[a] = 1;
        filled[a] = Math.max(height[a], filled[c] + EPS);
        heap.push(filled[a], a);
      }
    }
    return { filled: filled, order: order.subarray(0, count) };
  }

  function buildWater(ctx, rng, shape, relief, moisture) {
    var cfg = ctx.cfg.water;
    var cols = ctx.cols, rows = ctx.rows, n = cols * rows;
    var land = shape.land, height = relief.height;
    // Fuer den Abfluss leicht verrauschte Hoehe -> Fluesse maeandern statt geradeaus zu laufen
    var meander = new BT.Noise(rng.fork('meander').seed);
    var routing = new Float32Array(n);
    for (var mi = 0; mi < n; mi++) {
      var mx = mi % cols, my = (mi - mx) / cols;
      routing[mi] = height[mi] + (land[mi] ? meander.signed(mx * 0.08, my * 0.08, 3) * cfg.meander : 0);
    }
    var flood = priorityFlood(routing, land, cols, rows);
    var filled = flood.filled;

    // Seen: deutlich aufgefuellte Senken, nur die groessten
    var lakeMask = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      if (land[i] && filled[i] - routing[i] > cfg.lakeMinDepth) lakeMask[i] = 1;
    }
    var cc = BT.Grid.connectedComponents(lakeMask, cols, rows);
    var lake = new Uint8Array(n);
    var lakes = [];
    for (var c = 0; c < cc.components.length && lakes.length < cfg.maxLakes; c++) {
      var comp = cc.components[c];
      if (comp.size < cfg.lakeMinCells) break;
      for (var j = 0; j < comp.cells.length; j++) lake[comp.cells[j]] = 1;
      lakes.push({ cells: comp.size, cx: (comp.cx + 0.5) * ctx.cellSize, cy: (comp.cy + 0.5) * ctx.cellSize });
    }

    // Abflussrichtung: steilster Abstieg auf der aufgefuellten Flaeche
    var down = new Int32Array(n).fill(-1);
    for (i = 0; i < n; i++) {
      if (!land[i]) continue;
      var x = i % cols, y = (i - x) / cols;
      var best = -1, bestH = filled[i];
      for (var k = 0; k < 8; k++) {
        var nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var a = ny * cols + nx;
        var h = filled[a];
        if (h < bestH) { bestH = h; best = a; }
      }
      down[i] = best;
    }

    // Einzugsgebiet: Regen (abhaengig von der Feuchte) talwaerts aufsummieren
    var acc = new Float32Array(n);
    var order = flood.order;
    for (i = order.length - 1; i >= 0; i--) {
      var cIdx = order[i];
      acc[cIdx] += 0.4 + moisture[cIdx];
      if (down[cIdx] >= 0) acc[down[cIdx]] += acc[cIdx];
    }

    var river = new Uint8Array(n);
    for (i = 0; i < n; i++) {
      if (land[i] && !lake[i] && acc[i] >= cfg.riverThreshold) river[i] = 1;
    }

    // Laenge des laengsten Laufs oberhalb jeder Flusszelle (Quellen zuerst)
    var runLen = new Int32Array(n);
    for (i = order.length - 1; i >= 0; i--) {
      var ci = order[i];
      if (!river[ci]) continue;
      var dn = down[ci];
      if (dn >= 0 && river[dn] && runLen[ci] + 1 > runLen[dn]) runLen[dn] = runLen[ci] + 1;
    }
    // Muendung jeder Flusszelle (Meer- oder Seeseitig zuerst)
    var mouth = new Int32Array(n).fill(-1);
    for (i = 0; i < order.length; i++) {
      var co = order[i];
      if (!river[co]) continue;
      var dd = down[co];
      mouth[co] = dd >= 0 && river[dd] ? mouth[dd] : co;
    }
    // Ganze Flusssysteme entfernen, deren laengster Lauf zu kurz ist
    for (i = 0; i < n; i++) {
      if (river[i] && runLen[mouth[i]] < cfg.riverMinLength) river[i] = 0;
    }

    // Flusslaeufe als Streckenzuege (zum Zeichnen), von den Quellen talwaerts
    var hasUpRiver = new Uint8Array(n);
    for (i = 0; i < n; i++) if (river[i] && down[i] >= 0) hasUpRiver[down[i]] = 1;
    var visited = new Uint8Array(n);
    var rivers = [];
    var logMax = BT.M.log(60);
    function widthAt(idx) {
      var t = clamp(BT.M.log(acc[idx] / cfg.riverThreshold) / logMax, 0, 1);
      return cfg.riverWidthMin + (cfg.riverWidthMax - cfg.riverWidthMin) * t;
    }
    // Quellen nach Einzugsgebiet sortieren -> lange Hauptlaeufe zuerst
    var sources = [];
    for (i = 0; i < n; i++) if (river[i] && !hasUpRiver[i]) sources.push(i);
    for (var s = 0; s < sources.length; s++) {
      var cur = sources[s];
      var pts = [];
      while (cur >= 0) {
        var px = cur % cols, py = (cur - px) / cols;
        pts.push({ x: (px + 0.5) * ctx.cellSize, y: (py + 0.5) * ctx.cellSize, w: river[cur] ? widthAt(cur) : cfg.riverWidthMax });
        if (!river[cur] || visited[cur]) break; // Muendung (See, Meer) oder Zusammenfluss
        visited[cur] = 1;
        cur = down[cur];
      }
      if (pts.length >= 2) rivers.push(pts);
    }

    return { filled: filled, lake: lake, lakes: lakes, river: river, rivers: rivers, down: down, acc: acc };
  }

  // ------------------------------------------------------------ 4. Klima
  function buildMoisture(ctx, rng, shape, relief, fresh) {
    var cfg = ctx.cfg.climate;
    var cols = ctx.cols, rows = ctx.rows, n = cols * rows;
    var land = shape.land, height = relief.height;
    var noise = new BT.Noise(rng.fork('moisture').seed);
    var ang = rng.fork('wind').rangeIn(cfg.windAngle);
    var wdx = BT.M.cos(ang), wdy = BT.M.sin(ang);
    var raw = new Float32Array(n);
    var STEP = 3, STEPS = 28;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        if (!land[i]) continue;
        // Regenschatten: hoechster Punkt in Windrichtung davor
        var maxUp = 0;
        for (var s = 1; s <= STEPS; s++) {
          var ux = Math.round(x - wdx * s * STEP), uy = Math.round(y - wdy * s * STEP);
          if (ux < 0 || uy < 0 || ux >= cols || uy >= rows) break;
          var hu = height[uy * cols + ux];
          if (hu > maxUp) maxUp = hu;
        }
        var shadow = Math.max(0, maxUp - height[i] * 0.6);
        var m = 0.65 - cfg.rainShadow * shadow;
        m += 0.18 * BT.M.exp(-relief.distSea[i] / 18);           // Kuestennebel
        m += 0.25 * height[i];                                    // Steigungsregen in der Hoehe
        m += noise.signed(x * 0.025, y * 0.025, 4) * cfg.moistureNoise;
        if (fresh) m += 0.35 * BT.M.exp(-fresh[i] / 5);           // Gewaessernaehe
        raw[i] = m;
      }
    }
    return rankNormalize(raw, land);
  }

  /** Werte der Landzellen auf ihren Rang in [0, 1] abbilden -> stabile Flaechenanteile. */
  function rankNormalize(values, land) {
    var idx = [];
    for (var i = 0; i < values.length; i++) if (land[i]) idx.push(i);
    idx.sort(function (a, b) { return values[a] - values[b]; });
    var out = new Float32Array(values.length);
    for (var r = 0; r < idx.length; r++) out[idx[r]] = idx.length > 1 ? r / (idx.length - 1) : 0.5;
    return out;
  }

  // ------------------------------------------------------------ 5. Biome
  function buildBiomes(ctx, rng, shape, relief, water, moisture, fresh) {
    var cfg = ctx.cfg.biome;
    var cols = ctx.cols, rows = ctx.rows, n = cols * rows, cell = ctx.cellSize;
    var land = shape.land, height = relief.height;
    var grid = new BT.Grid(cols, rows, B.DEEP);
    var g = grid.data;
    var edgeNoise = new BT.Noise(rng.fork('biome-edges').seed);

    // Abstand zum Land (fuer die Lagune)
    var distLand = BT.Grid.distanceTransform(land, cols, rows);

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var en = edgeNoise.signed(x * 0.05, y * 0.05, 3);
        if (!land[i]) {
          g[i] = distLand[i] <= ctx.cfg.water.shallowCells * (1 + 0.9 * en) ? B.SHALLOW : B.DEEP;
          continue;
        }
        if (water.lake[i]) { g[i] = B.LAKE; continue; }
        var h = height[i];
        var m = moisture[i];
        // Strand: breit an flachen Kuesten, schmal oder gar keiner an steilen
        var beachW = cfg.beachCells * (1 + 0.6 * en) * clamp(1.4 - h * 6, 0, 1.4);
        if (relief.distSea[i] <= beachW) { g[i] = B.BEACH; continue; }
        if (h >= cfg.peakHeight + en * 0.03) { g[i] = B.PEAK; continue; }
        if (h >= cfg.rockHeight + en * 0.05) { g[i] = B.ROCK; continue; }
        var slope = slopeAt(height, cols, rows, x, y);
        if (m >= cfg.swampMoisture && h < cfg.swampMaxHeight && slope < cfg.swampMaxSlope && fresh[i] <= cfg.swampFreshCells) { g[i] = B.SWAMP; continue; }
        if (m >= cfg.fernMoisture) { g[i] = h >= cfg.mossHeight + en * 0.04 ? B.MOSS : B.FERN; continue; }
        g[i] = m >= cfg.scrubMoisture ? B.SCRUB : B.TUSSOCK;
      }
    }

    // Thermalfelder an den Vulkanflanken
    var thermal = [];
    if (relief.volcano) {
      var tr = rng.fork('thermal');
      var count = tr.intIn(cfg.thermalPatches);
      var v = relief.volcano;
      for (var t = 0; t < count * 12 && thermal.length < count; t++) {
        var a = tr.range(0, Math.PI * 2);
        var d = v.radius * tr.range(1.3, 2.6);
        var px = v.x + BT.M.cos(a) * d, py = v.y + BT.M.sin(a) * d;
        var gx = Math.floor(px / cell), gy = Math.floor(py / cell);
        if (!grid.inBounds(gx, gy)) continue;
        var gi = gy * cols + gx;
        if (!land[gi] || water.lake[gi] || g[gi] === B.PEAK || g[gi] === B.BEACH) continue;
        var tooClose = false;
        for (var q = 0; q < thermal.length; q++) if (BT.M.hypot(thermal[q].x - px, thermal[q].y - py) < 160) tooClose = true;
        if (tooClose) continue;
        thermal.push({ x: px, y: py, radius: tr.rangeIn(cfg.thermalRadius) });
      }
      for (q = 0; q < thermal.length; q++) {
        var th = thermal[q];
        var span = Math.ceil(th.radius * 1.4 / cell);
        var tx = Math.floor(th.x / cell), ty = Math.floor(th.y / cell);
        for (var yy = ty - span; yy <= ty + span; yy++) {
          for (var xx = tx - span; xx <= tx + span; xx++) {
            if (!grid.inBounds(xx, yy)) continue;
            var ii = yy * cols + xx;
            if (!land[ii] || g[ii] === B.LAKE || g[ii] === B.BEACH || g[ii] === B.PEAK) continue;
            var wx = (xx + 0.5) * cell, wy = (yy + 0.5) * cell;
            var dd = BT.M.hypot(wx - th.x, wy - th.y) / th.radius;
            if (dd < 1 + 0.35 * edgeNoise.signed(wx * 0.02, wy * 0.02, 2)) g[ii] = B.THERMAL;
          }
        }
      }
    }

    removeSmallPatches(grid, cfg.minPatchCells);

    // Fluesse zuletzt - sie schneiden durch alle Landbiome
    for (var r = 0; r < n; r++) if (water.river[r] && land[r] && g[r] !== B.LAKE) g[r] = B.RIVER;

    return { grid: grid, thermal: thermal };
  }

  function slopeAt(h, cols, rows, x, y) {
    var xl = Math.max(0, x - 1), xr = Math.min(cols - 1, x + 1);
    var yu = Math.max(0, y - 1), yd = Math.min(rows - 1, y + 1);
    var gx = (h[y * cols + xr] - h[y * cols + xl]) / 2;
    var gy = (h[yd * cols + x] - h[yu * cols + x]) / 2;
    return Math.sqrt(gx * gx + gy * gy);
  }

  /** Kleine Flecken eines Landbioms uebernehmen das haeufigste Nachbarbiom. */
  function removeSmallPatches(grid, minCells) {
    var cols = grid.cols, rows = grid.rows, g = grid.data;
    var info = BT.BIOME_INFO;
    for (var pass = 0; pass < 2; pass++) {
      for (var b = 0; b < info.length; b++) {
        if (!info[b].land || b === B.BEACH) continue;
        var cc = BT.Grid.connectedComponents(grid.mask(b), cols, rows);
        for (var c = 0; c < cc.components.length; c++) {
          var comp = cc.components[c];
          if (comp.size >= minCells) continue;
          var votes = {};
          for (var j = 0; j < comp.cells.length; j++) {
            var i = comp.cells[j];
            var x = i % cols, y = (i - x) / cols;
            for (var k = 0; k < 4; k++) {
              var nx = x + DX[k], ny = y + DY[k];
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              var nb = g[ny * cols + nx];
              if (nb !== b && info[nb].land) votes[nb] = (votes[nb] || 0) + 1;
            }
          }
          var best = -1, bestV = 0;
          for (var key in votes) if (votes[key] > bestV) { bestV = votes[key]; best = +key; }
          if (best < 0) continue;
          for (j = 0; j < comp.cells.length; j++) g[comp.cells[j]] = best;
        }
      }
    }
  }

  // ------------------------------------------------------------ Gesamt
  function generate(seed, options) {
    var opts = options || {};
    var cfg = BT.CONFIG;
    var sizeKey = BT.ISLAND_SIZES[opts.size] ? opts.size : cfg.size;   // auch alte Links mit size=klein
    var dims = BT.ISLAND_SIZES[sizeKey];
    var cellSize = cfg.cellSize;
    var cols = Math.round(dims.width / cellSize);
    var rows = Math.round(dims.height / cellSize);
    var ctx = {
      cfg: cfg, cellSize: cellSize, cols: cols, rows: rows,
      width: cols * cellSize, height: rows * cellSize
    };
    var rng = new BT.Rng(seed);

    // Form so lange nachjustieren, bis der Landanteil passt
    var shape, boost = 1;
    for (var attempt = 0; attempt < 6; attempt++) {
      shape = buildShape(ctx, rng.fork('shape'), boost);
      if (shape.share < cfg.shape.minLandShare) boost *= 1.08;
      else if (shape.share > cfg.shape.maxLandShare) boost *= 0.93;
      else break;
    }

    var relief = buildRelief(ctx, rng.fork('relief'), shape);
    var climateRng = rng.fork('climate');
    // Erst ohne Gewaesser (fuer den Regen der Flussberechnung), dann mit.
    var moisture0 = buildMoisture(ctx, climateRng, shape, relief, null);
    var water = buildWater(ctx, rng.fork('water'), shape, relief, moisture0);
    var freshMask = new Uint8Array(cols * rows);
    for (var i = 0; i < freshMask.length; i++) freshMask[i] = water.lake[i] || water.river[i] ? 1 : 0;
    var distFresh = BT.Grid.distanceTransform(freshMask, cols, rows);
    var moisture = buildMoisture(ctx, climateRng, shape, relief, distFresh);
    var biomes = buildBiomes(ctx, rng.fork('biomes'), shape, relief, water, moisture, distFresh);

    return {
      seed: seed,
      size: sizeKey,
      width: ctx.width,
      height: ctx.height,
      cols: cols,
      rows: rows,
      cellSize: cellSize,
      biome: biomes.grid,
      height_: relief.height,
      moisture: moisture,
      land: shape.land,
      fields: { distSea: relief.distSea, distFresh: distFresh },
      features: {
        ridges: relief.ridges,
        volcano: relief.volcano,
        lakes: water.lakes,
        rivers: water.rivers,
        thermal: biomes.thermal
      }
    };
  }

  BT.Island = { generate: generate };
})(typeof window !== 'undefined' ? window : globalThis);
