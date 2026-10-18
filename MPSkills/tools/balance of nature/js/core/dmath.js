/**
 * Deterministische Mathematik.
 *
 * JavaScript legt +, -, *, /, Math.sqrt, floor, round usw. exakt fest (IEEE 754),
 * Math.sin, cos, atan2, exp, log, pow und hypot aber nicht: jede Engine darf
 * dort minimal anders runden. Fuer eine Simulation reicht das, damit derselbe
 * Seed auf einem iPad (Safari) und einem Android-Tablet (Chrome) nach einiger
 * Zeit verschiedene Verlaeufe zeigt.
 *
 * Deshalb benutzen Generator und Simulation diese Versionen, die nur aus exakt
 * festgelegten Grundrechenarten bestehen. Die Genauigkeit (~1e-12) ist fuer
 * alles hier mehr als genug. Darstellung und Oberflaeche duerfen weiter Math.*
 * benutzen.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var PI = 3.141592653589793;
  var TWO_PI = 6.283185307179586;
  var HALF_PI = 1.5707963267948966;
  var LN2 = 0.6931471805599453;

  /** sin auf [-pi/2, pi/2] als Taylor-Polynom (Horner). */
  function sinCore(x) {
    var x2 = x * x;
    return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 +
      x2 * (-1 / 39916800 + x2 * (1 / 6227020800 + x2 * (-1 / 1307674368000))))))));
  }

  function sin(x) {
    x = x - TWO_PI * Math.round(x / TWO_PI);           // -> [-pi, pi]
    if (x > HALF_PI) x = PI - x;
    else if (x < -HALF_PI) x = -PI - x;
    return sinCore(x);
  }

  function cos(x) { return sin(x + HALF_PI); }

  /** atan auf [0, 1] ueber Halbwinkel-Reduktion + Reihe. */
  function atanCore(x) {
    // atan(x) = 2 * atan(x / (1 + sqrt(1 + x^2))) zweimal -> |x| <= ~0.2
    var y = x / (1 + Math.sqrt(1 + x * x));
    y = y / (1 + Math.sqrt(1 + y * y));
    var y2 = y * y, term = y, sum = y;
    for (var k = 1; k < 12; k++) {
      term *= -y2;
      sum += term / (2 * k + 1);
    }
    return 4 * sum;
  }

  function atan(x) {
    if (x < 0) return -atan(-x);
    if (x > 1) return HALF_PI - atanCore(1 / x);
    return atanCore(x);
  }

  function atan2(y, x) {
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
    if (y > 0) return HALF_PI;
    if (y < 0) return -HALF_PI;
    return 0;
  }

  function pow2(k) {
    var r = 1;
    if (k >= 0) for (var i = 0; i < k; i++) r *= 2;
    else for (var j = 0; j > k; j--) r /= 2;
    return r;
  }

  function exp(x) {
    if (x > 700) return Infinity;
    if (x < -745) return 0;
    var k = Math.round(x / LN2);
    var r = x - k * LN2;                                // |r| <= ~0.35
    var term = 1, sum = 1;
    for (var n = 1; n < 18; n++) { term *= r / n; sum += term; }
    return sum * pow2(k);
  }

  function log(x) {
    if (x <= 0) return x === 0 ? -Infinity : NaN;
    var e = 0;
    while (x >= 1.4142135623730951) { x /= 2; e++; }
    while (x < 0.7071067811865476) { x *= 2; e--; }
    var s = (x - 1) / (x + 1), s2 = s * s, term = s, sum = s;
    for (var k = 1; k < 16; k++) { term *= s2; sum += term / (2 * k + 1); }
    return 2 * sum + e * LN2;
  }

  function pow(a, b) {
    if (b === 0) return 1;
    if (a === 0) return 0;
    if (b === Math.floor(b) && b > 0 && b < 64) {
      var r = 1;
      for (var i = 0; i < b; i++) r *= a;
      return r;
    }
    if (a < 0) return NaN;
    return exp(b * log(a));
  }

  function hypot(x, y) { return Math.sqrt(x * x + y * y); }

  BT.M = { sin: sin, cos: cos, atan2: atan2, exp: exp, log: log, pow: pow, hypot: hypot, PI: PI };
})(typeof window !== 'undefined' ? window : globalThis);
