/**
 * Bewegung auf der Insel: Schritt in Richtung eines Ziels mit Ausweichen um
 * Hindernisse (Meer, Seen), Weg zum naechsten Suesswasser.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  // Ausweichwinkel, falls der direkte Schritt blockiert ist
  var DETOURS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];

  function blockedAt(world, spec, x, y) {
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
    return BT.isBlocked(world.query.biomeAt(x, y), spec);
  }

  /**
   * Bewegt `obj` (mit x, y, heading) hoechstens `speed` auf (tx, ty) zu.
   * Liefert true, wenn ein Schritt moeglich war. `fence(x, y)` (optional):
   * weitere Sperre, z. B. der Zaun einer Weide (eco/humans.js barrier).
   */
  function stepToward(world, spec, obj, tx, ty, speed, fence) {
    var dx = tx - obj.x, dy = ty - obj.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return true;
    var len = Math.min(speed, d);
    var base = BT.M.atan2(dy, dx);
    for (var k = 0; k < DETOURS.length; k++) {
      var a = base + DETOURS[k];
      var nx = obj.x + BT.M.cos(a) * len, ny = obj.y + BT.M.sin(a) * len;
      if (!blockedAt(world, spec, nx, ny) && !(fence && fence(nx, ny))) {
        obj.x = nx; obj.y = ny; obj.heading = a;
        return true;
      }
    }
    return false;
  }

  /** Bewegt sich weg von (fx, fy). */
  function stepAway(world, spec, obj, fx, fy, speed, fence) {
    return stepToward(world, spec, obj, obj.x * 2 - fx, obj.y * 2 - fy, speed, fence);
  }

  /**
   * Naechstes Suesswasser: dem Abstandsfeld bergab folgen und einen Punkt
   * einige Zellen voraus liefern. null, wenn schon am Wasser. `field`
   * (optional): ein anderes Abstandsfeld in Zellen, z. B. um Weidezaeune herum
   * (eco/humans.js waterDist).
   */
  function waterWaypoint(world, x, y, lookahead, field) {
    var cell = world.cellSize, cols = world.cols, rows = world.rows;
    var dist = field || world.fields.distFresh;
    var cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return null;
    if (dist[cy * cols + cx] <= 1.5) return null;
    for (var s = 0; s < (lookahead || 8); s++) {
      var best = dist[cy * cols + cx], bx = cx, by = cy;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          var v = dist[ny * cols + nx];
          if (v < best) { best = v; bx = nx; by = ny; }
        }
      }
      if (bx === cx && by === cy) break;
      cx = bx; cy = by;
      if (best <= 1) break;
    }
    return { x: (cx + 0.5) * cell, y: (cy + 0.5) * cell };
  }

  function atWater(world, x, y, field) {
    if (!field) return world.query.freshWaterDistance(x, y) <= world.cellSize * 2;
    var i = world.query.index(x, y);
    return i >= 0 && field[i] <= 2;
  }

  BT.Move = {
    stepToward: stepToward,
    stepAway: stepAway,
    waterWaypoint: waterWaypoint,
    atWater: atWater,
    blockedAt: blockedAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
