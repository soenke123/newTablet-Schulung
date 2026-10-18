/**
 * Jahreszeiten auf der Karte: eine Farbschicht ueber dem fertigen Gelaende.
 *
 *   Fruehling  frisches Gruen auf Grasland und Busch
 *   Sommer     warmes, trockenes Gold
 *   Herbst     Waelder und Busch faerben sich rostrot
 *   Winter     Reif auf dem Land, Eis auf Seen; Schnee waechst von den Gipfeln
 *              bergab, in harten Wintern bis weit ins Tiefland
 *
 * Die Schicht wird jedes Bild neu gezeichnet (der Bildpuffer des Gelaendes
 * bleibt unveraendert). An den Grenzen gehen die Jahreszeiten weich ineinander
 * ueber. Reine Darstellung - die Simulation kennt nur cal.season.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  var FADE = 0.35;  // Uebergangsbreite in Jahreszeiten

  /**
   * Gewichte der vier Jahreszeiten fuer eine Position im Jahr.
   * @param pos  Jahreszeiten seit Jahresbeginn, 0..4 (2,5 = Mitte Herbst)
   */
  function weights(pos) {
    var w = [0, 0, 0, 0];
    var s = Math.floor(pos) % 4, f = pos - Math.floor(pos);
    if (f > 1 - FADE / 2) {
      var t = (f - (1 - FADE / 2)) / FADE;       // 0 .. 0,5
      w[s] = 1 - t; w[(s + 1) % 4] = t;
    } else if (f < FADE / 2) {
      var u = (FADE / 2 - f) / FADE;             // 0,5 .. 0
      w[s] = 1 - u; w[(s + 3) % 4] = u;
    } else {
      w[s] = 1;
    }
    return w;
  }

  // ---------------------------------------------------------------- Schnee
  // Der Schnee wird gezeichnet wie die Gipfel: geglaettete Flaechen mit hellem
  // Rand und Relief. Die Schneegrenze wandert im Laufe des Winters bergab, in
  // harten Wintern weit ins Tiefland, in milden bleibt es beim Bergland.
  var SNOW = {
    top: 0.80,            // Hoehe der Gipfel: darueber liegt immer Schnee
    mild: 0.56,           // tiefste Schneegrenze im mildesten Winter (Bergland)
    hard: 0.23,           // ... im haertesten Winter (grosse Teile der Insel)
    step: 0.03,           // Abstand der vorberechneten Schneegrenzen
    patchy: 0.08,         // Rauschen auf der Hoehe: unregelmaessige Grenze, Schneeflecken
    patchScale: 0.12,     // Frequenz der Flecken (je Zelle)
    layerAlpha: 0.5,      // Deckung je Stufe; uebereinander wird der Schnee dicht
    dense: 3              // ab so vielen Stufen ueber der Grenze bekommt der Schnee Relief
  };

  /** Hoehe fuer den Schnee je Zelle: Gelaendehoehe plus Rauschen, ohne Wasser und heisse Quellen. */
  function snowHeight(world) {
    if (world._snowHeight) return world._snowHeight;
    var cols = world.cols, rows = world.rows, h = world.height_, g = world.biome.data;
    var noise = new BT.Noise(new BT.Rng(world.seed).fork('snow').seed);
    var out = new Float32Array(cols * rows);
    for (var i = 0; i < out.length; i++) {
      var b = g[i];
      if (!BT.BIOME_INFO[b].land || b === B.THERMAL) { out[i] = -1; continue; }
      var x = i % cols, y = (i - x) / cols;
      out[i] = h[i] + (noise.fbm(x * SNOW.patchScale, y * SNOW.patchScale, 4) - 0.5) * 2 * SNOW.patchy;
    }
    // Um die heissen Quellen schmilzt der Schnee
    for (i = 0; i < out.length; i++) {
      if (g[i] !== B.THERMAL) continue;
      x = i % cols; y = (i - x) / cols;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) out[yy * cols + xx] = -1;
        }
      }
    }
    world._snowHeight = out;
    return out;
  }

  /** Schneeflaeche ab Stufe k (Hoehe top - k * step); einmal pro Welt und Stufe. */
  function snowLayer(world, k) {
    var cache = world._snowLayers || (world._snowLayers = []);
    if (cache[k] !== undefined) return cache[k];
    var e = snowHeight(world), level = SNOW.top - k * SNOW.step;
    var mask = new Uint8Array(e.length);
    for (var i = 0; i < e.length; i++) mask[i] = e[i] >= level ? 1 : 0;
    var noise = new BT.Noise(new BT.Rng(world.seed).fork('outline').seed);
    var polygons = BT.Contour.polygonsFromMask(mask, world.cols, world.rows, {
      cellSize: world.cellSize,
      smoothing: 3,
      minArea: world.cellSize * world.cellSize * 4,
      noise: noise,
      noiseAmp: world.cellSize * 0.7,
      noiseScale: 0.012
    });
    cache[k] = polygons.length ? BT.Contour.toPath(polygons) : null;
    return cache[k];
  }

  /**
   * Wie weit der Schnee gerade reicht (0 = nur Gipfel, 1 = tiefster Stand des
   * Winters). Er kommt Ende Herbst, liegt im Hochwinter am tiefsten und
   * schmilzt im ersten Fruehling.
   */
  function snowAmount(pos) {
    var p = pos < 1 ? pos + 4 : pos;
    var smooth = function (a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    return smooth(2.85, 3.45, p) * (1 - smooth(3.75, 4.3, p));
  }

  /**
   * Die Stufen werden halbtransparent uebereinander gelegt: oben, wo viele
   * Stufen liegen, ist der Schnee dicht, zur Schneegrenze hin duennt er aus und
   * Wald und Gras scheinen durch.
   */
  function drawSnow(ctx, world, shapes, amount, hardness, scale) {
    var P = BT.PALETTE.peak;
    var t = Math.max(0, Math.min(1, (hardness - BT.WEATHER.winter[0]) / (BT.WEATHER.winter[1] - BT.WEATHER.winter[0])));
    var low = SNOW.mild + (SNOW.hard - SNOW.mild) * t;
    var line = SNOW.top - amount * (SNOW.top - low);     // aktuelle Schneegrenze
    var pos = (SNOW.top - line) / SNOW.step;
    var n = Math.floor(pos), f = pos - n;                // n volle Stufen, die naechste zu f

    ctx.save();
    ctx.clip(shapes.island.path, 'evenodd');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = P.base;
    for (var k = 0; k <= n; k++) {
      var a = k < n ? SNOW.layerAlpha : SNOW.layerAlpha * f;
      var layer = a > 0.005 ? snowLayer(world, k) : null;
      if (!layer) continue;
      ctx.globalAlpha = a;
      ctx.fill(layer, 'evenodd');
    }
    // Zarter Rand an der Schneegrenze
    var edge = n > 0 ? snowLayer(world, n - 1) : null;
    if (edge) {
      ctx.globalAlpha = 0.35 * Math.min(1, n / 3);
      ctx.strokeStyle = P.edge;
      ctx.lineWidth = Math.max(1, 0.8 / scale);
      ctx.stroke(edge);
    }
    // Relief auf dem dichten Schnee, damit die Berge ihre Form behalten
    var shade = BT.TerrainRenderer.hillshade(world);
    var dense = n >= SNOW.dense ? snowLayer(world, n - SNOW.dense) : null;
    if (shade && dense) {
      ctx.clip(dense, 'evenodd');
      ctx.globalAlpha = 0.45;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, 0, 0, world.cols * world.cellSize, world.rows * world.cellSize);
    }
    ctx.restore();
  }

  /** Pfad aus mehreren Landbiomen (einmal pro Welt). */
  function biomePath(world, list, key) {
    var cacheKey = '_seasonPath_' + key;
    if (world[cacheKey]) return world[cacheKey];
    var shapes = BT.Shapes.build(world);
    var p = new Path2D();
    for (var k = 0; k < shapes.biomes.length; k++) {
      var e = shapes.biomes[k];
      if (list.indexOf(e.biome) >= 0 && e.shape.path) p.addPath(e.shape.path);
    }
    world[cacheKey] = p;
    return p;
  }

  function tint(ctx, path, color, alpha, op) {
    if (alpha <= 0.01) return;
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill(path, 'evenodd');
  }

  /**
   * @param ctx    auf Weltkoordinaten transformiert
   * @param pos       Position im Jahr in Jahreszeiten (0..4)
   * @param hardness  Haerte des Winters (BT.WEATHER.winter), bestimmt die Schneegrenze
   * @param scale     Weltunits -> Pixel
   */
  function draw(ctx, world, pos, hardness, scale) {
    if (typeof Path2D === 'undefined') return;
    var w = weights(pos);
    var shapes = BT.Shapes.build(world);
    var island = shapes.island.path;
    var open = biomePath(world, [B.TUSSOCK, B.SCRUB, B.SWAMP], 'open');
    var forest = biomePath(world, [B.SCRUB, B.FERN, B.MOSS], 'forest');

    ctx.save();
    // Fruehling: saftiges Gruen auf dem offenen Land
    tint(ctx, open, '#6fd35a', w[0] * 0.35, 'color');
    tint(ctx, open, '#9be36b', w[0] * 0.4, 'soft-light');
    tint(ctx, forest, '#4fc46a', w[0] * 0.3, 'soft-light');
    // Sommer: warmes Licht, Grasland trocknet aus
    tint(ctx, island, '#ffcf5a', w[1] * 0.4, 'soft-light');
    tint(ctx, open, '#d9a640', w[1] * 0.25, 'color');
    // Herbst: Laub faerbt sich rot und orange, Gras wird braun
    tint(ctx, forest, '#e2621c', w[2] * 0.55, 'color');
    tint(ctx, forest, '#ff9a3c', w[2] * 0.3, 'soft-light');
    tint(ctx, open, '#b07a36', w[2] * 0.3, 'color');
    // Winter: blasses Land mit Reif, Schnee von den Gipfeln abwaerts, Eis auf Seen
    if (w[3] > 0.01) {
      tint(ctx, island, '#808890', w[3] * 0.5, 'saturation');
      tint(ctx, island, '#e8f0f7', w[3] * 0.15, 'source-over');
    }
    var amount = snowAmount(pos);
    if (amount > 0.005) drawSnow(ctx, world, shapes, amount, hardness == null ? 1 : hardness, scale || 1);
    if (w[3] > 0.01 && shapes.lake.path) tint(ctx, shapes.lake.path, '#e4f2f8', w[3] * 0.55, 'source-over');
    ctx.restore();
  }

  BT.SeasonRenderer = { draw: draw, weights: weights, snowAmount: snowAmount };
})(typeof window !== 'undefined' ? window : globalThis);
