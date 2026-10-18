/**
 * Nahrungsansicht: farbt die Karte nach dem Fuellstand der Nahrung.
 * Voll = unveraendert, abgefressen = braun und verdorrt. So wird Ueberweidung
 * direkt sichtbar.
 *
 * Gezeichnet wird ein kleines Bild mit einem Pixel je Weidezelle, weich
 * hochskaliert - billig genug fuer jedes Bild.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var canvas = null, ctx = null, img = null;

  /** mode: 'alles' oder ein Schluessel aus BT.FOOD_ORDER */
  function draw(target, sim, mode) {
    if (!sim || !mode || mode === 'aus' || typeof document === 'undefined') return;
    var f = sim.fields;
    if (!canvas || canvas.width !== f.cols || canvas.height !== f.rows) {
      canvas = document.createElement('canvas');
      canvas.width = f.cols; canvas.height = f.rows;
      ctx = canvas.getContext('2d');
      img = ctx.createImageData(f.cols, f.rows);
    }
    var keys = mode === 'alles' ? BT.FOOD_ORDER : [mode];
    var d = img.data, n = f.cols * f.rows;
    for (var i = 0; i < n; i++) {
      var v = 0, K = 0;
      for (var k = 0; k < keys.length; k++) { v += f.value[keys[k]][i]; K += f.capacity[keys[k]][i]; }
      var o = i * 4;
      if (K < 0.3) { d[o + 3] = 0; continue; }
      var empty = Math.max(0, Math.min(1, 1 - v / K));
      // voll: leicht gruen aufgehellt, leer: braun-verdorrt
      if (empty < 0.25) {
        d[o] = 90; d[o + 1] = 200; d[o + 2] = 90; d[o + 3] = Math.round((0.25 - empty) * 200);
      } else {
        d[o] = 105; d[o + 1] = 70; d[o + 2] = 35; d[o + 3] = Math.round(Math.min(1, (empty - 0.25) / 0.75) * 200);
      }
    }
    ctx.putImageData(img, 0, 0);
    target.save();
    target.imageSmoothingEnabled = true;
    target.drawImage(canvas, 0, 0, f.cols * f.size, f.rows * f.size);
    target.restore();
  }

  BT.FoodOverlay = { draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
