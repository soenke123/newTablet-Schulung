/**
 * Zeichnet die Ratten (eco/rats.js). Ratten sind ein Feld (Anzahl je
 * Weidezelle), keine einzelnen Tiere: Je Zelle werden so viele Ratten-Bilder
 * (zehn Bildvarianten assets/Ratten/Ratte_N.png, je eine Ratte, zufaellig verteilt) gestreut, wie es der Dichte
 * entspricht. Lage und Spiegelung haengen fest an Zelle und Nummer, dazu
 * wuseln die Gruppen ein wenig hin und her. Reine Darstellung, die Simulation
 * bleibt gleich.
 *
 * Aus der Ferne (kleiner Zoom) nur eine Gruppe je Zelle, sonst wird die Insel
 * zum Teppich. Hervorgehoben (opts.highlight === 'ratten') bekommen die Gruppen
 * einen farbigen Ring.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var SIZE = 13;        // Breite einer Rattengruppe in Weltunits
  var MIN_PX = 6;       // Mindestbreite auf dem Bildschirm
  var PER = 4;          // so viele Ratten je gezeichnetem Bild
  var MAX = 6;          // hoechstens so viele Gruppen je Zelle (Dorf: dort draengen sie sich)
  var FAR = 0.9;        // unter diesem Zoom (Pixel je Weltunit) nur eine Gruppe je Zelle

  var VARIANTS = 10;    // assets/Ratten/Ratte_1.png ... Ratte_10.png
  var imgs = [], loading = false;

  /** Die Bilder der Ratten (Eintraege null, solange sie laden); onLoad wird je geladenem Bild gerufen. */
  function images(onLoad) {
    if (loading || typeof global.Image === 'undefined') return imgs;
    loading = true;
    for (var v = 0; v < VARIANTS; v++) (function (v) {
      var i = new global.Image();
      i.onload = function () { imgs[v] = i; if (BT.app) BT.app.redraw(); if (onLoad) onLoad(); };
      i.src = 'assets/Ratten/Ratte_' + (v + 1) + '.png';
    })(v);
    return imgs;
  }

  /** Irgendein geladenes Bild (fuer die Kachel in der Seitenleiste), sonst null. */
  function image(onLoad) {
    var l = images(onLoad);
    return l[0] || null;
  }

  /** Fester Zufallswert 0..1 je Zelle und Nummer. */
  function hash(i, k, salt) {
    var h = Math.imul(i * 8 + k + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  /**
   * Geht alle gezeichneten Ratten im Ausschnitt durch und ruft fn(x, y, i, k, count, far)
   * mit Ort und Zahl der Tiere, fuer die dieses Bild steht.
   */
  function each(sim, view, scale, alpha, size, fn) {
    var R = sim.rats, f = sim.fields, far = scale < FAR;
    var t = (sim.tick + (alpha || 0)) * 0.35, q = sim.world.query;
    var x0 = Math.max(0, Math.floor((view.x - size) / f.size)), x1 = Math.min(f.cols - 1, Math.floor((view.x + view.width + size) / f.size));
    var y0 = Math.max(0, Math.floor((view.y - size) / f.size)), y1 = Math.min(f.rows - 1, Math.floor((view.y + view.height + size) / f.size));
    for (var cy = y0; cy <= y1; cy++) {
      for (var cx = x0; cx <= x1; cx++) {
        var i = cy * f.cols + cx, n = R.n[i];
        if (n < 1) continue;
        var groups = far ? (n >= 2 ? 1 : 0) : Math.min(MAX, Math.ceil(n / PER));
        for (var k = 0; k < groups; k++) {
          var ph = hash(i, k, 3) * 6.283;
          var x = (cx + 0.15 + 0.7 * hash(i, k, 1)) * f.size + Math.sin(t + ph) * 2.5;
          var y = (cy + 0.15 + 0.7 * hash(i, k, 2)) * f.size + Math.cos(t * 0.8 + ph) * 1.5;
          if (BT.isBlocked(q.biomeAt(x, y), null)) continue;
          // fern: eine Gruppe fuer die ganze Zelle; sonst je Bild PER Tiere, das letzte Bild den Rest
          var count = far ? n : (k === groups - 1 ? n - k * PER : PER);
          fn(x, y, i, k, count, far);
        }
      }
    }
  }

  function draw(ctx, sim, view, scale, alpha, opts) {
    var R = sim && sim.rats;
    if (!R || !R.total) return;
    var list = images();
    var size = Math.max(SIZE, MIN_PX / scale);
    var hl = opts && opts.highlight === 'ratten', ring = [];
    each(sim, view, scale, alpha, size, function (x, y, i, k, count, far) {
      var pic = list[Math.floor(hash(i, k, 5) * VARIANTS)];
      // wenige Ratten: blasser (das Bild steht fuer weniger als PER)
      ctx.globalAlpha = far ? Math.min(1, 0.35 + count / 12) : Math.min(1, 0.45 + 0.55 * count / PER);
      if (pic) {
        var h = size * pic.height / pic.width;
        ctx.save();
        ctx.translate(x, y);
        if (hash(i, k, 4) < 0.5) ctx.scale(-1, 1);
        ctx.drawImage(pic, -size / 2, -h / 2, size, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#7a6a58';
        ctx.beginPath(); ctx.ellipse(x, y, size * 0.4, size * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (hl) ring.push(x, y);
    });
    ctx.globalAlpha = 1;
    if (ring.length) {
      var r = size * 0.65;
      ctx.beginPath();
      for (var j = 0; j < ring.length; j += 2) { ctx.moveTo(ring[j] + r, ring[j + 1]); ctx.arc(ring[j], ring[j + 1], r, 0, Math.PI * 2); }
      ctx.strokeStyle = opts.highlightColor || '#ffffff';
      ctx.lineWidth = Math.max(2 / scale, 1);
      ctx.stroke();
    }
  }

  /** Die Rattengruppe unter dem Punkt (Welt) als { x, y, count } oder null; scale = Pixel je Weltunit. */
  function pick(sim, wx, wy, scale, alpha) {
    var R = sim && sim.rats;
    if (!R || !R.total) return null;
    var size = Math.max(SIZE, MIN_PX / scale), rad = size * 0.6, best = null, bd = rad * rad;
    var view = { x: wx - size, y: wy - size, width: 2 * size, height: 2 * size };
    each(sim, view, scale, alpha, size, function (x, y, i, k, count) {
      var d = (x - wx) * (x - wx) + (y - wy) * (y - wy);
      if (d <= bd) { bd = d; best = { x: x, y: y, count: Math.max(1, Math.round(count)) }; }
    });
    return best;
  }

  BT.RatRenderer = { draw: draw, pick: pick, image: image };
})(typeof window !== 'undefined' ? window : globalThis);
