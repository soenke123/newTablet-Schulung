/**
 * Bild fuer das Infofenster einer Karte (Kartenleiste, js/ui/app.js).
 *
 * Die Bilder sind Ausschnitte der echten Inselkarte, aufgenommen mit
 * tools/kartenbilder.js: assets/karte_<id>.png. Nur die hier eingetragenen
 * Karten haben ein Bild, damit keine fehlende Datei die Konsole fuellt.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var FILES = {};
  ['landung', 'dorf', 'acker', 'schafe', 'hunde', 'woelfeJagen', 'wildJagen', 'sammeln', 'ratten'].forEach(function (id) {
    FILES[id] = 'assets/karte_' + id + '.png';
  });
  var images = {};

  /** Bild der Karte in das Canvas zeichnen (fuellt es ganz aus). */
  function draw(canvas, id) {
    var ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    canvas.dataset.card = id;
    var file = FILES[id];
    if (!file) return;
    var img = images[id];
    if (!img) {
      img = images[id] = new global.Image();
      img.src = file;
    }
    if (!img.complete || !img.naturalWidth) {
      img.onload = function () { if (canvas.dataset.card === id) draw(canvas, id); };
      return;
    }
    var k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    ctx.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  }

  BT.CardInfo = { draw: draw, FILES: FILES };
})(typeof window !== 'undefined' ? window : globalThis);
