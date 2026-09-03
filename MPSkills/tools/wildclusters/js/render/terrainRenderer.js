/**
 * Zeichnet die Landschaftsflaechen in der vorgegebenen Layer-Reihenfolge:
 * Boden -> Gras -> Waldflaeche -> Wasser.
 *
 * Gezeichnet werden die geglaetteten Vektorumrisse aus render/shapes.js, nie
 * einzelne Zellen. Tiefe entsteht durch innen liegende Farbbaender (Pfad wird
 * geclippt und dann breit gestrichen) - das wirkt stilisiert und bleibt bei
 * jedem Zoom sauber.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  /** Breites Band entlang der Innenkante einer Flaeche. */
  function innerBand(ctx, path, color, width) {
    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  function inView(p, view, pad) {
    return p.x >= view.x - pad && p.x <= view.x + view.width + pad &&
      p.y >= view.y - pad && p.y <= view.y + view.height + pad;
  }

  /** Streudetails als ein einziger Pfad pro Farbe - deutlich schneller. */
  function drawDots(ctx, items, view, color, scale, minRadius, filter) {
    ctx.beginPath();
    var drawn = 0;
    for (var i = 0; i < items.length; i++) {
      var d = items[i];
      if (filter && !filter(d)) continue;
      if (!inView(d, view, 8)) continue;
      var r = Math.max(d.r, minRadius / scale);
      ctx.moveTo(d.x + r, d.y);
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      drawn++;
    }
    if (!drawn) return;
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** Grasbueschel: zwei kurze Halme pro Punkt, in einem Zug gestrichen. */
  function drawTufts(ctx, items, view, color, scale, lineWidth, filter) {
    ctx.beginPath();
    var drawn = 0;
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      if (filter && !filter(t)) continue;
      if (!inView(t, view, 8)) continue;
      var h = t.r * 2.2;
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(t.x + t.rot * h * 0.6, t.y - h);
      ctx.moveTo(t.x + t.r, t.y);
      ctx.lineTo(t.x + t.r + t.rot * h * 0.4, t.y - h * 0.65);
      drawn++;
    }
    if (!drawn) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(lineWidth, 0.9 / scale);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx  bereits auf Weltkoordinaten transformiert
   * @param {Object} world
   * @param {{x:number,y:number,width:number,height:number}} view  sichtbarer Weltausschnitt
   * @param {number} scale  Weltunits -> Pixel (fuer Detailgrad und Mindestgroessen)
   */
  function draw(ctx, world, view, scale) {
    var P = WL.PALETTE;
    var shapes = WL.Shapes.build(world);
    var decor = world.decor;
    var fine = scale > 0.32; // feine Details erst ab mittlerer Vergroesserung

    // --- 1. Boden
    ctx.fillStyle = P.ground.base;
    ctx.fillRect(0, 0, world.width, world.height);

    if (fine) {
      drawDots(ctx, decor.groundSpecks, view, P.ground.speckDark, scale, 0.8,
        function (d) { return d.shade < 0; });
      drawDots(ctx, decor.groundSpecks, view, P.ground.speckLight, scale, 0.8,
        function (d) { return d.shade >= 0; });
    }

    // --- 2. Gras
    if (shapes.grass.path) {
      ctx.fillStyle = P.grass.base;
      ctx.fill(shapes.grass.path, 'evenodd');
      innerBand(ctx, shapes.grass.path, P.grass.shade, 14);
      ctx.strokeStyle = P.grass.edge;
      ctx.lineWidth = Math.max(1.6, 1.2 / scale);
      ctx.stroke(shapes.grass.path);
    }
    if (fine) {
      drawTufts(ctx, decor.grassTufts, view, P.grass.tuftDark, scale, 1.1,
        function (t) { return t.shade < 0; });
      drawTufts(ctx, decor.grassTufts, view, P.grass.tuftLight, scale, 1.1,
        function (t) { return t.shade >= 0; });
    }

    // --- 3. Waldflaeche
    if (shapes.forest.path) {
      ctx.fillStyle = P.forest.floorShade;
      ctx.fill(shapes.forest.path, 'evenodd');
      innerBand(ctx, shapes.forest.path, P.forest.floor, 22);
      ctx.strokeStyle = P.forest.edge;
      ctx.lineWidth = Math.max(1.8, 1.2 / scale);
      ctx.stroke(shapes.forest.path);
    }
    if (fine) {
      drawDots(ctx, decor.forestFloor, view, P.forest.dot, scale, 0.8, null);
    }

    // --- 4. Wasser
    if (shapes.water.path) {
      ctx.fillStyle = P.water.deep;
      ctx.fill(shapes.water.path, 'evenodd');
      innerBand(ctx, shapes.water.path, P.water.base, 30);
      innerBand(ctx, shapes.water.path, P.water.shallow, 11);
      ctx.strokeStyle = P.water.edge;
      ctx.lineWidth = Math.max(1.8, 1.2 / scale);
      ctx.stroke(shapes.water.path);
    }
  }

  WL.TerrainRenderer = { draw: draw, inView: inView };
})(typeof window !== 'undefined' ? window : globalThis);
