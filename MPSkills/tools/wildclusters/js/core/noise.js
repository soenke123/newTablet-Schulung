/**
 * Selbst implementiertes Value-Noise mit fBm (fractional Brownian motion).
 *
 * Wird gebraucht, damit Kuesten- und Waldgrenzen organisch ausfransen statt
 * geometrisch zu wirken. Bewusst keine externe Library.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function fade(t) {
    // Quintische Glaettung -> keine sichtbaren Gitterartefakte.
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function Noise(seed) {
    var rng = new WL.Rng(seed);
    var perm = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = rng.int(0, i);
      var tmp = perm[i];
      perm[i] = perm[j];
      perm[j] = tmp;
    }
    this.perm = perm;
    this.values = new Float32Array(256);
    for (i = 0; i < 256; i++) this.values[i] = rng.next();
  }

  Noise.prototype._lattice = function (xi, yi) {
    var p = this.perm;
    return this.values[p[(p[xi & 255] + (yi & 255)) & 255]];
  };

  /** Value-Noise in [0, 1]. */
  Noise.prototype.value = function (x, y) {
    var xi = Math.floor(x);
    var yi = Math.floor(y);
    var u = fade(x - xi);
    var v = fade(y - yi);
    var a = this._lattice(xi, yi);
    var b = this._lattice(xi + 1, yi);
    var c = this._lattice(xi, yi + 1);
    var d = this._lattice(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };

  /**
   * Mehrere ueberlagerte Oktaven -> Ergebnis in [0, 1].
   * Niedrige Oktaven geben die grobe Form, hohe die feine Ausfransung.
   */
  Noise.prototype.fbm = function (x, y, octaves, lacunarity, gain) {
    octaves = octaves || 4;
    lacunarity = lacunarity || 2.0;
    gain = gain || 0.5;
    var sum = 0;
    var amp = 1;
    var norm = 0;
    var fx = x;
    var fy = y;
    for (var i = 0; i < octaves; i++) {
      sum += this.value(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  };

  /** fBm zentriert auf [-1, 1] - praktisch als Verzerrung/Offset. */
  Noise.prototype.signed = function (x, y, octaves) {
    return this.fbm(x, y, octaves) * 2 - 1;
  };

  WL.Noise = Noise;
  WL.noiseFade = fade;
  WL.lerp = lerp;
})(typeof window !== 'undefined' ? window : globalThis);
