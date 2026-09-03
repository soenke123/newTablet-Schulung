/**
 * Geometrie-Helfer: Abstaende, Clamping und Punktverteilung mit Mindestabstand.
 *
 * Das Dart-Throwing wird fuer alle Platzierungen benutzt (Teichzentren,
 * Waldanker, Baeume, Ressourcen, Apfelbaumgruppen, Ameisenhuegel). Es lockert
 * den Mindestabstand schrittweise, falls kein Platz gefunden wird - so kann die
 * Generierung nie haengen bleiben oder fehlschlagen.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.sqrt(dist2(ax, ay, bx, by));
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Raeumlicher Hash fuer schnelle "gibt es einen Punkt in Reichweite?"-Tests. */
  function SpatialHash(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  SpatialHash.prototype._key = function (cx, cy) {
    return cx + ',' + cy;
  };

  SpatialHash.prototype.insert = function (x, y, payload) {
    var cx = Math.floor(x / this.cellSize);
    var cy = Math.floor(y / this.cellSize);
    var key = this._key(cx, cy);
    var bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push({ x: x, y: y, payload: payload });
  };

  SpatialHash.prototype.hasWithin = function (x, y, radius) {
    var r2 = radius * radius;
    var span = Math.ceil(radius / this.cellSize);
    var cx = Math.floor(x / this.cellSize);
    var cy = Math.floor(y / this.cellSize);
    for (var gy = cy - span; gy <= cy + span; gy++) {
      for (var gx = cx - span; gx <= cx + span; gx++) {
        var bucket = this.cells.get(this._key(gx, gy));
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          if (dist2(x, y, bucket[i].x, bucket[i].y) < r2) return true;
        }
      }
    }
    return false;
  };

  /**
   * Verteilt bis zu `count` Punkte mit Mindestabstand.
   *
   * options:
   *   count        gewuenschte Anzahl
   *   minDistance  Mindestabstand zwischen den Punkten
   *   sample(rng)  liefert einen Kandidatenpunkt {x, y}
   *   accept(p)    optionale Zusatzpruefung (Terrainregeln)
   *   attempts     maximale Versuche
   *   relaxAfter   nach so vielen Fehlversuchen wird der Mindestabstand gelockert
   */
  function scatter(rng, options) {
    var count = options.count;
    var minDistance = options.minDistance;
    var sample = options.sample;
    var accept = options.accept;
    var attempts = options.attempts || Math.max(600, count * 200);
    var relaxAfter = options.relaxAfter || Math.max(40, Math.floor(attempts / 12));
    var relaxFactor = options.relaxFactor || 0.88;
    var minDistanceFloor = options.minDistanceFloor || minDistance * 0.35;

    var points = [];
    var hash = new SpatialHash(Math.max(minDistance, 1));
    var current = minDistance;

    // Erster Durchlauf: voller Mindestabstand.
    for (var i = 0; i < attempts && points.length < count; i++) {
      var p = sample(rng);
      if (!p) continue;
      if (accept && !accept(p)) continue;
      if (current > 0 && hash.hasWithin(p.x, p.y, current)) continue;
      points.push(p);
      hash.insert(p.x, p.y, p);
    }

    // Zweiter Durchlauf mit gelockertem Abstand, falls noch Punkte fehlen.
    var guard = 0;
    while (points.length < count && current > minDistanceFloor && guard < 12) {
      guard++;
      current *= relaxFactor;
      for (var j = 0; j < relaxAfter * 6 && points.length < count; j++) {
        var q = sample(rng);
        if (!q) continue;
        if (accept && !accept(q)) continue;
        if (current > 0 && hash.hasWithin(q.x, q.y, current)) continue;
        points.push(q);
        hash.insert(q.x, q.y, q);
      }
    }

    return points;
  }

  /** Flaeche eines geschlossenen Polygons (Gauss'sche Trapezformel). */
  function polygonArea(points) {
    var a = 0;
    for (var i = 0, n = points.length; i < n; i++) {
      var p = points[i];
      var q = points[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  WL.Geo = {
    clamp: clamp,
    dist: dist,
    dist2: dist2,
    smoothstep: smoothstep,
    SpatialHash: SpatialHash,
    scatter: scatter,
    polygonArea: polygonArea
  };
})(typeof window !== 'undefined' ? window : globalThis);
