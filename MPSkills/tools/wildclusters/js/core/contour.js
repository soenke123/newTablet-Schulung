/**
 * Vom Zellraster zur organischen Form.
 *
 * Das Raster ist nur die Logik-Wahrheit. Gezeichnet wird nie Zelle fuer Zelle -
 * das gaebe die typischen Treppenkanten. Stattdessen:
 *
 *   1. Marching Squares  -> geschlossene Konturzuege um die Maske
 *   2. Chaikin-Glaettung -> die 90-Grad-Ecken werden zu weichen Kurven
 *   3. Noise-Versatz     -> zusaetzliche Unregelmaessigkeit, nichts wirkt "rund"
 *
 * Ergebnis sind Polygone in Weltkoordinaten, die bei jedem Zoom scharf bleiben.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  // Kantenmittelpunkte einer Marching-Squares-Zelle, relativ zum Gitterpunkt (i, j):
  //   N = oben, E = rechts, S = unten, W = links
  var N = 0, E = 1, S = 2, W = 3;
  var EDGE_OFFSET = [
    [0.5, 0.0], // N
    [1.0, 0.5], // E
    [0.5, 1.0], // S
    [0.0, 0.5]  // W
  ];

  // Index = TL*8 + TR*4 + BR*2 + BL. Jede Kante ist so gerichtet, dass die
  // gefuellte Flaeche links der Laufrichtung liegt - dadurch lassen sich die
  // Segmente eindeutig zu geschlossenen Ringen verketten.
  var CASES = [
    [],                 // 0
    [[S, W]],           // 1
    [[E, S]],           // 2
    [[E, W]],           // 3
    [[N, E]],           // 4
    [[N, E], [S, W]],   // 5  (mehrdeutig: diagonal getrennt)
    [[N, S]],           // 6
    [[N, W]],           // 7
    [[W, N]],           // 8
    [[S, N]],           // 9
    [[W, N], [E, S]],   // 10 (mehrdeutig: diagonal getrennt)
    [[E, N]],           // 11
    [[W, E]],           // 12
    [[S, E]],           // 13
    [[W, S]],           // 14
    []                  // 15
  ];

  /**
   * Marching Squares ueber eine 0/1-Maske.
   * Rueckgabe: Liste geschlossener Ringe aus Punkten in Gitterpunkt-Koordinaten.
   */
  function marchingSquares(mask, cols, rows) {
    function at(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return 0;
      return mask[y * cols + x];
    }

    // Punkte liegen auf halben Koordinaten -> als Ganzzahl-Schluessel verdoppeln.
    var stride = (cols + 4) * 2;
    function key(x, y) {
      return Math.round((y + 1) * 2) * stride + Math.round((x + 1) * 2);
    }

    var starts = new Map(); // Schluessel des Startpunkts -> Segment
    var segments = [];

    for (var j = -1; j < rows; j++) {
      for (var i = -1; i < cols; i++) {
        var tl = at(i, j);
        var tr = at(i + 1, j);
        var br = at(i + 1, j + 1);
        var bl = at(i, j + 1);
        var code = tl * 8 + tr * 4 + br * 2 + bl;
        var list = CASES[code];
        if (!list.length) continue;

        for (var k = 0; k < list.length; k++) {
          var fromEdge = list[k][0];
          var toEdge = list[k][1];
          var a = { x: i + EDGE_OFFSET[fromEdge][0], y: j + EDGE_OFFSET[fromEdge][1] };
          var b = { x: i + EDGE_OFFSET[toEdge][0], y: j + EDGE_OFFSET[toEdge][1] };
          var seg = { a: a, b: b, used: false };
          segments.push(seg);
          starts.set(key(a.x, a.y), seg);
        }
      }
    }

    var rings = [];
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      if (seg.used) continue;
      var ring = [];
      var cursor = seg;
      var guard = 0;
      while (cursor && !cursor.used && guard < segments.length + 4) {
        cursor.used = true;
        ring.push(cursor.a);
        cursor = starts.get(key(cursor.b.x, cursor.b.y));
        guard++;
      }
      if (ring.length >= 4) rings.push(ring);
    }
    return rings;
  }

  /**
   * Chaikin: ersetzt jede Ecke durch zwei Punkte bei 25% und 75% der Kante.
   * Zwei bis drei Durchlaeufe genuegen fuer weiche, handgezeichnet wirkende Raender.
   */
  function chaikin(points, iterations) {
    var pts = points;
    for (var it = 0; it < iterations; it++) {
      var n = pts.length;
      if (n < 4) break;
      var out = new Array(n * 2);
      for (var i = 0; i < n; i++) {
        var p = pts[i];
        var q = pts[(i + 1) % n];
        out[i * 2] = { x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 };
        out[i * 2 + 1] = { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 };
      }
      pts = out;
    }
    return pts;
  }

  /** Punkte mit zu geringem Abstand zusammenfassen - haelt die Pfade schlank. */
  function simplify(points, minStep) {
    if (points.length < 8) return points;
    var out = [points[0]];
    var min2 = minStep * minStep;
    for (var i = 1; i < points.length; i++) {
      var last = out[out.length - 1];
      var dx = points[i].x - last.x;
      var dy = points[i].y - last.y;
      if (dx * dx + dy * dy >= min2) out.push(points[i]);
    }
    // Ringschluss pruefen
    if (out.length > 3) {
      var first = out[0];
      var lastPt = out[out.length - 1];
      if ((first.x - lastPt.x) * (first.x - lastPt.x) + (first.y - lastPt.y) * (first.y - lastPt.y) < min2) {
        out.pop();
      }
    }
    return out;
  }

  /**
   * Erzeugt geglaettete Polygone in Weltkoordinaten aus einer Rastermaske.
   *
   * options:
   *   cellSize     Weltgroesse einer Zelle
   *   smoothing    Chaikin-Durchlaeufe (Standard 3)
   *   minArea      kleinere Ringe werden verworfen (Weltflaeche)
   *   noise        WL.Noise fuer den zusaetzlichen Versatz
   *   noiseAmp     Staerke des Versatzes in Weltunits
   *   noiseScale   Frequenz des Versatzes
   */
  function polygonsFromMask(mask, cols, rows, options) {
    var opts = options || {};
    var cellSize = opts.cellSize || 1;
    var smoothing = opts.smoothing == null ? 3 : opts.smoothing;
    var minArea = opts.minArea || 0;
    var noise = opts.noise;
    var noiseAmp = opts.noiseAmp || 0;
    var noiseScale = opts.noiseScale || 0.01;

    var rings = marchingSquares(mask, cols, rows);
    var polygons = [];

    for (var r = 0; r < rings.length; r++) {
      // Gitterpunkt (i, j) entspricht dem Mittelpunkt der Zelle (i, j).
      var world = rings[r].map(function (p) {
        return { x: (p.x + 0.5) * cellSize, y: (p.y + 0.5) * cellSize };
      });

      world = simplify(world, cellSize * 0.9);
      world = chaikin(world, smoothing);
      // Chaikin vervierfacht bis verachtfacht die Punktzahl - danach wieder
      // ausduennen, sonst werden die Pfade unnoetig teuer.
      world = simplify(world, cellSize * 0.55);

      if (noise && noiseAmp > 0) {
        for (var i = 0; i < world.length; i++) {
          var pt = world[i];
          pt.x += noise.signed(pt.x * noiseScale, pt.y * noiseScale, 2) * noiseAmp;
          pt.y += noise.signed(pt.x * noiseScale + 31.7, pt.y * noiseScale - 12.3, 2) * noiseAmp;
        }
        world = chaikin(world, 1);
      }

      if (minArea > 0 && Math.abs(WL.Geo.polygonArea(world)) < minArea) continue;
      polygons.push(world);
    }

    return polygons;
  }

  /** Polygone zu einem Path2D zusammenfassen (Loecher via evenodd-Fuellregel). */
  function toPath(polygons) {
    if (typeof Path2D === 'undefined') return null;
    var path = new Path2D();
    for (var p = 0; p < polygons.length; p++) {
      var ring = polygons[p];
      if (ring.length < 3) continue;
      path.moveTo(ring[0].x, ring[0].y);
      for (var i = 1; i < ring.length; i++) path.lineTo(ring[i].x, ring[i].y);
      path.closePath();
    }
    return path;
  }

  WL.Contour = {
    marchingSquares: marchingSquares,
    chaikin: chaikin,
    polygonsFromMask: polygonsFromMask,
    toPath: toPath
  };
})(typeof window !== 'undefined' ? window : globalThis);
