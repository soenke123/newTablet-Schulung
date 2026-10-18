/**
 * Tierbilder laden. Je Art gibt es Bilder fuer Weibchen, Maennchen und
 * Jungtier (f, m, j) in mehreren Haltungen (spec.sprites). Ohne Bild (noch
 * nicht geladen, Datei fehlt) zeichnet der Renderer einen farbigen Punkt -
 * das Programm haengt nie an den Grafiken.
 *
 * Unter file:// laedt ein <img> problemlos; das Canvas wird dadurch "tainted",
 * was nichts ausmacht, weil nirgends Pixel zurueckgelesen werden.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var images = {};
  var KINDS = ['f', 'm', 'j'];

  function key(id, kind, pose) { return id + '_' + kind + '_' + pose; }

  /**
   * Hellt ein Bild einmalig auf: "screen" mit einer Farbe hebt die dunklen Toene
   * stark in Richtung dieser Farbe, die hellen kaum; danach schneidet das Bild
   * selbst den Umriss wieder aus.
   * Liest keine Pixel zurueck, funktioniert also auch unter file://.
   */
  /**
   * tint: danach mit "color" einfaerben - Farbton und Saettigung kommen von der
   * Farbe, die Helligkeit (Fell, Schatten, Konturen) bleibt vom Bild. So wird
   * aus einem Hirsch ein bunter Platzhalter fuer eine andere Art.
   */
  function lightened(img, color, tint) {
    var c = global.document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    if (color) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    if (tint) {
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0);
    return c;
  }

  BT.Sprites = {
    preload: function (onLoad) {
      if (typeof global.Image === 'undefined') return;
      BT.SPECIES_ORDER.forEach(function (id) {
        var sp = BT.SPECIES[id].sprites;
        if (!sp) return;
        KINDS.forEach(function (kind) {
          for (var pose in sp.poses) load(key(id, kind, pose), 'assets/' + sp.name + '_' + kind + '_' + sp.poses[pose] + '.png', sp.lighten, sp.tint);
        });
      });
      function load(k, src, lighten, tint) {
        if (images[k] !== undefined) return;
        images[k] = null;
        var img = new global.Image();
        img.onload = function () { images[k] = lighten || tint ? lightened(img, lighten, tint) : img; if (onLoad) onLoad(k); };
        img.src = src;
      }
    },

    /**
     * Bild fuer ein Tier. kind: 'f', 'm' oder 'j'; pose: move, stand, eat, rest.
     * Fehlt die Haltung, wird `move` genommen.
     */
    get: function (id, kind, pose) {
      return images[key(id, kind, pose)] || images[key(id, kind, 'move')] || null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
