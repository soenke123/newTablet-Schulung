/**
 * Weidezustand auf der Karte: Wo Pflanzen abgefressen oder durch Ueberweidung
 * abgestorben sind, verliert die Landschaft ihre Farbe.
 *
 *   abgefressen   Gras und Laub unter ihrem Hoechststand -> etwas blasser
 *   ueberweidet   Pflanzenzustand gesunken -> grau und fahl
 *
 * Keine Farbschicht darueber: Die Textur des Gelaendes bleibt sichtbar und
 * wird nur entsaettigt (Mischmodus "saturation") und leicht aufgehellt
 * ("screen"). Eine Maske mit einem Bildpunkt je Weidezelle, weich vergroessert
 * und auf die Insel beschnitten. Neu berechnet wird nur, wenn ein neuer Tag
 * beginnt. Reine Darstellung - liest sim.fields, veraendert nichts.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var KEYS = ['gras', 'laub'];
  var FULL_CAP = 4;             // ab dieser Pflanzenmenge je Zelle volle Wirkung
  var GRAY = [128, 128, 128];   // Quelle fuer die Entsaettigung (Farbton egal, Saettigung 0)
  var FADE = [112, 106, 94];    // Aufhellung: fahles, leicht warmes Grau
  var FADE_ALPHA = 0.4;         // Aufhellung im Verhaeltnis zur Entsaettigung

  var UP = 4;                   // Vergroesserung des weichgezeichneten Puffers

  function build(sim, cache) {
    var f = sim.fields, doc = global.document;
    var c = cache && cache.small, big = cache && cache.canvas;
    if (!c || c.width !== f.cols || c.height !== f.rows) {
      c = doc.createElement('canvas');
      c.width = f.cols; c.height = f.rows;
      big = doc.createElement('canvas');
      big.width = f.cols * UP; big.height = f.rows * UP;
    }
    var cx = c.getContext('2d');
    var img = cx.createImageData(f.cols, f.rows);
    var d = img.data, n = f.cols * f.rows;
    for (var i = 0; i < n; i++) {
      var cap = 0, val = 0, lost = 0;
      for (var k = 0; k < KEYS.length; k++) {
        var key = KEYS[k], K = f.capacity[key][i];
        if (K <= 0) continue;
        cap += K;
        val += f.value[key][i];
        var h = f.health[key];
        if (h) lost += K * (1 - h[i]);
      }
      if (cap < 0.3) continue;
      var eaten = Math.max(0, 1 - val / cap);   // 0 = voll, 1 = kahl
      var dead = lost / cap;                     // 0 = gesund, 1 = abgestorben
      var weight = Math.min(1, cap / FULL_CAP);
      // Abgefressen ist nur ein Hauch (im Winter ist ohnehin wenig da),
      // abgestorbene Pflanzen dagegen deutlich: offener Boden
      var e = Math.max(0, eaten - 0.5) / 0.5;
      var a = weight * Math.min(1, 0.35 * e + 1.4 * dead);
      if (a < 0.02) continue;
      var o = i * 4;
      d[o] = GRAY[0]; d[o + 1] = GRAY[1]; d[o + 2] = GRAY[2];
      d[o + 3] = Math.round(a * 255);
    }
    cx.putImageData(img, 0, 0);
    // Weich vergroessern, damit keine Weidezellen-Kanten zu sehen sind
    // (filter fehlt in manchen Browsern - dann bleibt es bei der Glaettung)
    var bx = big.getContext('2d');
    bx.clearRect(0, 0, big.width, big.height);
    bx.imageSmoothingEnabled = true;
    bx.filter = 'blur(' + UP * 0.6 + 'px)';
    bx.drawImage(c, 0, 0, big.width, big.height);
    bx.filter = 'none';
    return { small: c, canvas: big, day: sim.day, sim: sim };
  }

  var cache = null;

  /** @param ctx  auf Weltkoordinaten transformiert */
  function draw(ctx, world, sim) {
    if (!sim || typeof Path2D === 'undefined') return;
    if (!cache || cache.sim !== sim || cache.day !== sim.day) cache = build(sim, cache);
    var f = sim.fields;
    var island = BT.Shapes.build(world).island.path;
    ctx.save();
    if (island) ctx.clip(island, 'evenodd');
    ctx.imageSmoothingEnabled = true;
    var w = f.cols * f.size, h = f.rows * f.size;
    // 1. Farbe herausnehmen: Saettigung der Maske (0) uebernehmen, Helligkeit
    //    und Relief bleiben
    ctx.globalCompositeOperation = 'saturation';
    ctx.drawImage(cache.canvas, 0, 0, w, h);
    // 2. fahl machen: dieselbe Maske als warmes Grau aufhellend darueber
    if (!cache.fade) cache.fade = tint(cache.canvas, FADE);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = FADE_ALPHA;
    ctx.drawImage(cache.fade, 0, 0, w, h);
    ctx.restore();
  }

  /** Maske in einer anderen Farbe (gleiche Deckkraft). */
  function tint(mask, rgb) {
    var c = global.document.createElement('canvas');
    c.width = mask.width; c.height = mask.height;
    var x = c.getContext('2d');
    x.drawImage(mask, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = 'rgb(' + rgb.join(',') + ')';
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /** Farbe eines Lebensraums, wie sie bei abgefressenen/ueberweideten Pflanzen erscheint (Legende). */
  function sample(rgb, strength) {
    var l = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
    return rgb.map(function (v, k) {
      var g = v + (l - v) * strength;                        // entsaettigen
      var f = 255 - (255 - g) * (255 - FADE[k]) / 255;       // screen
      return Math.round(g + (f - g) * FADE_ALPHA * strength);
    });
  }

  BT.PlantRenderer = { draw: draw, sample: sample };
})(typeof window !== 'undefined' ? window : globalThis);
