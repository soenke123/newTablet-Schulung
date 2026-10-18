/**
 * Zeichnet die Insel: Meer -> Lagune -> Inselgrund (Strand) -> Landbiome ->
 * Seen -> Fluesse -> Streudetails.
 *
 * Gezeichnet werden geglaettete Vektorumrisse (render/shapes.js), nie
 * einzelne Zellen. Tiefe entsteht wie in Wild Clusters durch Farbbaender an der
 * Innenkante (Pfad clippen, dann breit streichen).
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  function innerBand(ctx, path, color, width) {
    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  function fillShape(ctx, path, colors, bandWidth, scale) {
    if (!path) return;
    ctx.fillStyle = colors.base;
    ctx.fill(path, 'evenodd');
    if (colors.band && bandWidth) innerBand(ctx, path, colors.band, bandWidth);
    if (colors.edge) {
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = Math.max(1.4, 1.1 / scale);
      ctx.stroke(path);
    }
  }

  function inView(p, view, pad) {
    return p.x >= view.x - pad && p.x <= view.x + view.width + pad &&
      p.y >= view.y - pad && p.y <= view.y + view.height + pad;
  }

  function circles(ctx, items, view, color, scale, radiusFactor, offX, offY, filter) {
    if (!items) return;
    ctx.beginPath();
    var drawn = 0;
    for (var i = 0; i < items.length; i++) {
      var d = items[i];
      if (filter && !filter(d)) continue;
      if (!inView(d, view, 20)) continue;
      var r = Math.max(d.r * radiusFactor, 0.6 / scale);
      var x = d.x + (offX || 0) * d.r, y = d.y + (offY || 0) * d.r;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      drawn++;
    }
    if (!drawn) return;
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokes(ctx, items, view, color, scale, width, fn) {
    if (!items) return;
    ctx.beginPath();
    for (var i = 0; i < items.length; i++) {
      var d = items[i];
      if (!inView(d, view, 20)) continue;
      fn(ctx, d);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(width, 0.8 / scale);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /** Offener Streckenzug glaetten (Chaikin), Breite wird mitinterpoliert. */
  function smoothLine(pts, iterations) {
    for (var it = 0; it < iterations; it++) {
      var out = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, w: a.w * 0.75 + b.w * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, w: a.w * 0.25 + b.w * 0.75 });
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  /**
   * Flusslaeufe zum Zeichnen. Muendet ein Fluss ins Meer, wird das letzte
   * Stueck (der Treppenschritt ins Wasser) durch eine gerade Verlaengerung in
   * Fliessrichtung ersetzt: daraus wird die Muendung.
   */
  function riverLines(world) {
    if (world._riverLines) return world._riverLines;
    var cell = world.cellSize, B = BT.BIOME;
    world._riverLines = world.features.rivers.map(function (r) {
      var end = r[r.length - 1];
      var endBiome = world.query.biomeAt(end.x, end.y);
      var toSea = endBiome === B.SHALLOW || endBiome === B.DEEP;
      var pts = r.slice();
      if (toSea && pts.length > 5) {
        pts.pop();
        var a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 5)];
        var dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy) || 1;
        for (var k = 1; k <= 4; k++) {
          pts.push({ x: a.x + dx / len * cell * 1.6 * k, y: a.y + dy / len * cell * 1.6 * k, w: a.w });
        }
      }
      var line = smoothLine(pts, 3);
      line.toSea = toSea;
      if (toSea) {
        // Ab wo liegt die Linie an der Kueste? Ab dort weitet sie sich zur Muendung.
        var dist = world.fields.distSea;
        for (var i = 0; i < line.length; i++) {
          var cx = Math.floor(line[i].x / cell), cy = Math.floor(line[i].y / cell);
          var ds = cx >= 0 && cy >= 0 && cx < world.cols && cy < world.rows ? dist[cy * world.cols + cx] : 0;
          var t = Math.max(0, Math.min(1, (5 - ds) / 5));   // 0 im Land, 1 an/hinter der Kueste
          line[i].mouth = t;
          line[i].w = line[i].w * (1 + 1.6 * t);
        }
      }
      return line;
    });
    return world._riverLines;
  }

  function mixColor(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function drawRivers(ctx, world, P, scale) {
    var lines = riverLines(world);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Binnenlauf: Segmente nach Breite buendeln -> wenige stroke()-Aufrufe
    for (var pass = 0; pass < 2; pass++) {
      var buckets = {};
      for (var r = 0; r < lines.length; r++) {
        var pts = lines[r];
        for (var i = 1; i < pts.length; i++) {
          if (pts[i].mouth > 0) break;
          var w = Math.round((pts[i - 1].w + pts[i].w) / 2);
          var path = buckets[w] || (buckets[w] = new Path2D());
          path.moveTo(pts[i - 1].x, pts[i - 1].y);
          path.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.strokeStyle = pass === 0 ? P.river.edge : P.river.base;
      for (var key in buckets) {
        var width = +key;
        ctx.lineWidth = Math.max(pass === 0 ? width + 3 : width, 0.8 / scale);
        ctx.stroke(buckets[key]);
      }
    }
    // Muendungen: breiter werdend, Farbe geht in die Lagune ueber, der Ufersaum verblasst
    for (r = 0; r < lines.length; r++) {
      pts = lines[r];
      if (!pts.toSea) continue;
      for (pass = 0; pass < 2; pass++) {
        for (i = 1; i < pts.length; i++) {
          var t = pts[i].mouth;
          if (!(t > 0) && !(pts[i - 1].mouth > 0)) continue;
          if (pass === 0 && t > 0.7) continue;
          ctx.strokeStyle = pass === 0 ? P.river.edge : mixColor(P.river.base, P.shallow.base, t);
          var ww = (pts[i - 1].w + pts[i].w) / 2;
          ctx.lineWidth = Math.max(pass === 0 ? ww + 3 * (1 - t) : ww, 0.8 / scale);
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
    }
  }

  /**
   * Reliefschattierung: Licht von Nordwesten, ein Pixel pro Zelle, beim
   * Zeichnen weich hochskaliert. Einmal pro Welt berechnet.
   */
  function hillshade(world) {
    if (world._hillshade !== undefined) return world._hillshade;
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc) { world._hillshade = null; return null; }
    var cols = world.cols, rows = world.rows, h = world.height_, g = world.biome.data;
    var c = doc.createElement('canvas');
    c.width = cols; c.height = rows;
    var cx = c.getContext('2d');
    var img = cx.createImageData(cols, rows);
    var Z = 26; // Ueberhoehung
    var lx = -0.6, ly = -0.6, lz = 0.53;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var o = i * 4;
        if (g[i] === BT.BIOME.DEEP || g[i] === BT.BIOME.SHALLOW) continue;
        var xl = Math.max(0, x - 1), xr = Math.min(cols - 1, x + 1);
        var yu = Math.max(0, y - 1), yd = Math.min(rows - 1, y + 1);
        var dx = (Math.max(0, h[y * cols + xr]) - Math.max(0, h[y * cols + xl])) * Z;
        var dy = (Math.max(0, h[yd * cols + x]) - Math.max(0, h[yu * cols + x])) * Z;
        var len = Math.sqrt(dx * dx + dy * dy + 1);
        var shade = (-dx * lx - dy * ly + lz) / len - lz; // 0 = flach
        // An der Kueste ausblenden: der Sprung Land/Meer ist keine Hangkante
        var ds = world.fields.distSea[i];
        if (ds < 4) shade *= Math.max(0, (ds - 1) / 3);
        if (shade > 0) {
          img.data[o] = 255; img.data[o + 1] = 250; img.data[o + 2] = 230;
          img.data[o + 3] = Math.min(150, shade * 200);
        } else {
          img.data[o] = 30; img.data[o + 1] = 40; img.data[o + 2] = 70;
          img.data[o + 3] = Math.min(150, -shade * 210);
        }
      }
    }
    cx.putImageData(img, 0, 0);
    world._hillshade = c;
    return c;
  }

  function drawDecor(ctx, world, view, scale, P) {
    var d = world.decor;
    // Tussock: zwei Halme je Bueschel
    var tuft = function (c, t) {
      var h = t.r * 2;
      c.moveTo(t.x, t.y); c.lineTo(t.x + t.rot * h * 0.5, t.y - h);
      c.moveTo(t.x + t.r * 0.6, t.y); c.lineTo(t.x + t.r * 0.6 + t.rot * h * 0.3 + h * 0.3, t.y - h * 0.8);
      c.moveTo(t.x - t.r * 0.6, t.y); c.lineTo(t.x - t.r * 0.6 + t.rot * h * 0.3 - h * 0.3, t.y - h * 0.7);
    };
    strokes(ctx, d.tuft && d.tuft.filter(function (t) { return t.shade < 0; }), view, P.tussock.tuftDark, scale, 1.1, tuft);
    strokes(ctx, d.tuft && d.tuft.filter(function (t) { return t.shade >= 0; }), view, P.tussock.tuftLight, scale, 1.1, tuft);

    // Sumpf: Flachsblaetter als Faecher
    var flax = function (c, t) {
      for (var k = -2; k <= 2; k++) {
        c.moveTo(t.x, t.y);
        c.lineTo(t.x + k * t.r * 0.45 + t.rot, t.y - t.r * (2.2 - Math.abs(k) * 0.35));
      }
    };
    circles(ctx, d.puddle, view, P.swamp.puddle, scale, 1);
    strokes(ctx, d.flax, view, P.swamp.flax, scale, 1.3, flax);

    // Buschland
    circles(ctx, d.bush, view, P.scrub.bush, scale, 1, 0.12, 0.15);
    circles(ctx, d.bush, view, P.scrub.bushLight, scale, 0.72, -0.12, -0.12);
    circles(ctx, d.blossom, view, P.scrub.blossom, scale, 1, 0, 0, function (t) { return t.shade < 0.4; });
    circles(ctx, d.blossom, view, P.scrub.blossomPink, scale, 1, 0, 0, function (t) { return t.shade >= 0.4; });

    // Farnwald: Kronen mit Schatten und Licht, dazwischen Baumfarne als Sterne
    circles(ctx, d.tree, view, P.fern.treeDark, scale, 1.05, 0.18, 0.22);
    circles(ctx, d.tree, view, P.fern.tree, scale, 1);
    circles(ctx, d.tree, view, P.fern.treeLight, scale, 0.55, -0.22, -0.25);
    strokes(ctx, d.fern, view, P.fern.frond, scale, 1.2, function (c, t) {
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 3 + t.rot;
        c.moveTo(t.x, t.y);
        c.lineTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r);
      }
    });

    // Moosnebelwald: Kronen mit violettem Schimmer, Nebelschwaden
    circles(ctx, d.mosstree, view, P.fern.treeDark, scale, 1.05, 0.18, 0.22);
    circles(ctx, d.mosstree, view, P.moss.tree, scale, 1);
    circles(ctx, d.mosstree, view, P.moss.treeViolet, scale, 0.5, -0.2, -0.22, function (t) { return t.shade < -0.2; });
    circles(ctx, d.mosstree, view, P.moss.treeLight, scale, 0.5, -0.2, -0.22, function (t) { return t.shade >= -0.2; });
    ctx.globalAlpha = 0.35;
    circles(ctx, d.mist, view, P.moss.mist, scale, 1);
    ctx.globalAlpha = 1;

    // Bergland und Gipfel
    circles(ctx, d.stone, view, P.rock.stoneDark, scale, 1, 0.2, 0.25);
    circles(ctx, d.stone, view, P.rock.stone, scale, 0.85);
    circles(ctx, d.snow, view, P.peak.snow, scale, 1);

    // Thermalfeld: tuerkise Becken mit orangem Rand, Dampf
    circles(ctx, d.pool, view, P.thermal.poolRim, scale, 1.35);
    circles(ctx, d.pool, view, P.thermal.poolRim2, scale, 1.15);
    circles(ctx, d.pool, view, P.thermal.pool, scale, 0.95);
    ctx.globalAlpha = 0.45;
    circles(ctx, d.steam, view, P.thermal.steam, scale, 1);
    ctx.globalAlpha = 1;

    circles(ctx, d.shell, view, P.beach.shell, scale, 1);
  }

  /**
   * @param ctx    bereits auf Weltkoordinaten transformiert
   * @param view   sichtbarer Weltausschnitt {x, y, width, height}
   * @param scale  Weltunits -> Pixel
   */
  function draw(ctx, world, view, scale) {
    var P = BT.PALETTE;
    var shapes = BT.Shapes.build(world);

    // Meer
    ctx.fillStyle = P.deep.base;
    ctx.fillRect(0, 0, world.width, world.height);

    // Lagune als breiter heller Saum, Insel darueber
    fillShape(ctx, shapes.shallow.path, P.shallow, 26, scale);
    fillShape(ctx, shapes.island.path, P.beach, 10, scale);

    for (var k = 0; k < shapes.biomes.length; k++) {
      var entry = shapes.biomes[k];
      var colors = P[BT.BIOME_INFO[entry.biome].key];
      fillShape(ctx, entry.shape.path, colors, entry.biome === B.PEAK ? 8 : 16, scale);
    }

    if (scale > 0.22) drawDecor(ctx, world, view, scale, P);

    // Relief ueber Land und Deko, unter Seen und Fluessen
    var shade = hillshade(world);
    if (shade) {
      ctx.save();
      ctx.clip(shapes.island.path, 'evenodd');
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, 0, 0, world.cols * world.cellSize, world.rows * world.cellSize);
      ctx.restore();
    }

    if (shapes.lake.path) {
      ctx.fillStyle = P.lake.base;
      ctx.fill(shapes.lake.path, 'evenodd');
      innerBand(ctx, shapes.lake.path, P.lake.band, 18);
      innerBand(ctx, shapes.lake.path, P.lake.shallow, 7);
      ctx.strokeStyle = P.lake.edge;
      ctx.lineWidth = Math.max(1.6, 1.1 / scale);
      ctx.stroke(shapes.lake.path);
    }

    drawRivers(ctx, world, P, scale);
  }

  BT.TerrainRenderer = { draw: draw, inView: inView, hillshade: hillshade };
})(typeof window !== 'undefined' ? window : globalThis);
