/* Initialisiert das globale RT-Namespace-Objekt.
   Muss als ALLERERSTES geladen werden, alle anderen Module hängen sich hier ein. */
(function (global) {
  'use strict';
  global.RT = global.RT || {};
  global.RT.version = '0.1.0-skeleton';
  global.RT.debug = true; // Konsolen-Logs in dev, später per URL-Param ?debug=0 abschaltbar
})(window);
