/**
 * Tierbilder laden und bereitstellen.
 *
 * Die Darstellung ist von Anfang an umschaltbar: Sprite (jetzt, zum Bauen und
 * Justieren) gegen neutrale Form (spaeter im Spiel, damit die Schuelerinnen und
 * Schueler nach Verhalten gruppieren und nicht nach Vorwissen ueber Enten).
 * Das ist ein Schalter, kein Umbau - deshalb liefert get() einfach null, wenn
 * gerade keine Bilder gewuenscht oder noch nicht geladen sind, und der
 * Zeichner faellt auf die neutrale Form zurueck.
 *
 * Unter file:// laedt ein <img> problemlos; das Canvas wird dadurch "tainted",
 * was hier nichts ausmacht, weil nirgends Pixel zurueckgelesen werden.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var images = {};
  var mode = 'sprite';
  var onLoad = null;

  function load(name, url) {
    if (typeof global.Image === 'undefined') return;
    if (images[name]) return;
    var img = new global.Image();
    img.onload = function () {
      images[name] = img;
      if (onLoad) onLoad(name);
    };
    img.onerror = function () {
      // Kein Drama: ohne Bild wird die neutrale Form gezeichnet.
      images[name] = null;
    };
    img.src = url;
  }

  WL.Sprites = {
    /** Alle Arten aus dem Katalog vorladen. */
    preload: function (callback) {
      onLoad = callback || null;
      // Die Nachzuegler-Arten stehen nicht in SPECIES_ORDER (sie werden erst am
      // Bruch angelegt), brauchen ihr Bild aber genauso - und zwar vorher, denn
      // geladen wird beim Start und nicht, wenn das Tier auftaucht.
      var order = (WL.SPECIES_ORDER || []).concat(WL.NEW_SPECIES || []);
      for (var i = 0; i < order.length; i++) {
        var spec = WL.SPECIES[order[i]];
        if (spec && spec.sprite) load(spec.id, spec.sprite);
      }
    },

    get: function (id) {
      if (mode !== 'sprite') return null;
      return images[id] || null;
    },

    setMode: function (value) { mode = value; },
    getMode: function () { return mode; },
    toggleMode: function () {
      mode = mode === 'sprite' ? 'neutral' : 'sprite';
      return mode;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
