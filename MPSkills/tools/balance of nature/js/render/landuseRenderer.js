/**
 * Nutzung auf der Karte: gerodete Erde (mit Baumstuempfen), Dorfplatz, die
 * Wiese, die auf gerodetem Land nachwaechst, und Aecker.
 *
 * Acker: Farbe je Jahreszeit (Saat gruen, reif golden, Stoppeln, Brache), mit
 * Furchen. Wo Tiere das Getreide abgefressen haben, schimmert die Erde durch -
 * ein Bildpunkt je Weidezelle, weich vergroessert, einmal am Tag neu.
 *
 * Das Gelaende im Bildpuffer bleibt die Natur. Die Nutzung liegt als eigene
 * Schicht darueber: geglaettete Umrisse aus dem Raster (wie die Lebensraeume,
 * core/contour.js), neu gebaut nur, wenn sich die Nutzung aendert
 * (sim.landuse.version). Reine Darstellung.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  // Reihenfolge = Zeichenreihenfolge
  var LAYERS = [
    { code: B.MEADOW, key: 'wiese' },
    { code: B.SOIL, key: 'erde' },
    { code: B.VILLAGE, key: 'dorf' },
    { code: B.FIELD, key: 'acker' }
  ];

  var cache = null;

  function build(sim) {
    var world = sim.world, lu = sim.landuse, g = lu.ground, nat = world.biome.data;
    var n = g.length, cols = world.cols, rows = world.rows, cell = world.cellSize;
    var noise = new BT.Noise(new BT.Rng(world.seed).fork('nutzung').seed);
    var layers = [], stumps = [], tufts = [];
    for (var k = 0; k < LAYERS.length; k++) {
      var mask = new Uint8Array(n), any = false;
      for (var i = 0; i < n; i++) {
        if (g[i] === LAYERS[k].code && g[i] !== nat[i]) { mask[i] = 1; any = true; }
      }
      if (!any) continue;
      var polys = BT.Contour.polygonsFromMask(mask, cols, rows, {
        cellSize: cell, smoothing: 3, minArea: cell * cell * 2,
        noise: noise, noiseAmp: cell * 0.5, noiseScale: 0.03
      });
      layers.push({ key: LAYERS[k].key, path: BT.Contour.toPath(polys) });
    }
    // Streudetails mit festem Hash je Zelle: Stuempfe auf der Erde, Grasbueschel auf der Wiese
    for (i = 0; i < n; i++) {
      if (g[i] === nat[i]) continue;
      var h = Math.imul(i ^ (i >>> 9), 2246822519) >>> 0;
      var x = (i % cols + 0.2 + (h & 255) / 255 * 0.6) * cell;
      var y = (Math.floor(i / cols) + 0.2 + ((h >>> 8) & 255) / 255 * 0.6) * cell;
      if (g[i] === B.SOIL && BT.LANDUSE.woody.indexOf(nat[i]) >= 0 && h % 7 === 0) stumps.push({ x: x, y: y, r: 1.6 + (h >>> 16) % 3 * 0.5 });
      else if (g[i] === B.MEADOW && h % 4 === 0) tufts.push({ x: x, y: y });
    }
    return { sim: sim, version: lu.version, layers: layers, stumps: stumps, tufts: tufts };
  }

  function hex(h) { return [1, 3, 5].map(function (k) { return parseInt(h.substr(k, 2), 16); }); }

  /** Getreide je Weidezelle: Farbe der Jahreszeit, abgefressen Richtung Erde. */
  var crop = null;
  function cropImage(sim) {
    var f = sim.fields, doc = global.document;
    if (!crop || crop.small.width !== f.cols || crop.small.height !== f.rows) {
      var c = doc.createElement('canvas'); c.width = f.cols; c.height = f.rows;
      var big = doc.createElement('canvas'); big.width = f.cols * 4; big.height = f.rows * 4;
      crop = { small: c, canvas: big };
    }
    var A = BT.PALETTE.acker, season = sim.calendar.season;
    var top = hex([A.spring, A.summer, A.stubble, A.winter][season]), soil = hex(A.soil);
    var cx = crop.small.getContext('2d'), img = cx.createImageData(f.cols, f.rows), d = img.data;
    var v = f.value.korn, K = f.capacity.korn;
    for (var i = 0; i < v.length; i++) {
      if (K[i] <= 0) continue;
      // Fruehling: die Saat geht auf (gruener mit dem Wuchs); Sommer: reif oder abgefressen
      var t = season === 0 ? Math.min(1, 0.25 + v[i] / K[i] * 1.5) : season === 1 ? Math.min(1, v[i] / K[i] * 1.25) : 1;
      var o = i * 4;
      for (var k = 0; k < 3; k++) d[o + k] = Math.round(soil[k] + (top[k] - soil[k]) * t);
      d[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    var bx = crop.canvas.getContext('2d');
    bx.clearRect(0, 0, crop.canvas.width, crop.canvas.height);
    bx.imageSmoothingEnabled = true;
    bx.filter = 'blur(2px)';
    bx.drawImage(crop.small, 0, 0, crop.canvas.width, crop.canvas.height);
    bx.filter = 'none';
    crop.day = sim.day; crop.sim = sim;
    return crop;
  }

  function drawFields(ctx, sim, path, scale) {
    var f = sim.fields, A = BT.PALETTE.acker;
    if (!crop || crop.sim !== sim || crop.day !== sim.day) cropImage(sim);
    ctx.save();
    ctx.clip(path, 'evenodd');
    ctx.fillStyle = A.soil;
    ctx.fill(path, 'evenodd');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(crop.canvas, 0, 0, f.cols * f.size, f.rows * f.size);
    // Furchen: parallele Linien, je Acker eine Richtung
    ctx.strokeStyle = A.furrow;
    ctx.lineWidth = Math.max(0.8, 1 / scale);
    var fields = sim.humans.fields, R = BT.HUMANS.field.radius * 1.4;
    ctx.beginPath();
    for (var k = 0; k < fields.length; k++) {
      var fl = fields[k], dx = Math.cos(fl.angle), dy = Math.sin(fl.angle);
      for (var o = -R; o <= R; o += 5) {
        ctx.moveTo(fl.x - dx * R - dy * o, fl.y - dy * R + dx * o);
        ctx.lineTo(fl.x + dx * R - dy * o, fl.y + dy * R + dx * o);
      }
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = A.edge;
    ctx.lineWidth = Math.max(1, 1.4 / scale);
    ctx.stroke(path);
  }

  /** @param ctx  auf Weltkoordinaten transformiert */
  function draw(ctx, sim, view, scale) {
    if (!sim || !sim.landuse.version || typeof Path2D === 'undefined') return;
    if (!cache || cache.sim !== sim || cache.version !== sim.landuse.version) cache = build(sim);
    var P = BT.PALETTE;
    for (var k = 0; k < cache.layers.length; k++) {
      var l = cache.layers[k], c = P[l.key];
      if (l.key === 'acker') { drawFields(ctx, sim, l.path, scale); continue; }
      ctx.fillStyle = c.base;
      ctx.fill(l.path, 'evenodd');
      // dunkler Saum innen am Rand
      ctx.save();
      ctx.clip(l.path, 'evenodd');
      ctx.strokeStyle = c.band;
      ctx.lineWidth = 10;
      ctx.stroke(l.path);
      ctx.restore();
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = Math.max(1, 1.2 / scale);
      ctx.stroke(l.path);
    }
    if (scale < 0.3) return;
    var pad = 10;
    ctx.fillStyle = P.wiese.tuft;
    for (var i = 0; i < cache.tufts.length; i++) {
      var t = cache.tufts[i];
      if (!BT.TerrainRenderer.inView(t, view, pad)) continue;
      ctx.fillRect(t.x - 1.5, t.y - 0.6, 3, 1.2);
      ctx.fillRect(t.x - 0.6, t.y - 1.8, 1.2, 2.4);
    }
    for (i = 0; i < cache.stumps.length; i++) {
      var s = cache.stumps[i];
      if (!BT.TerrainRenderer.inView(s, view, pad)) continue;
      ctx.fillStyle = P.erde.stump;
      ctx.beginPath(); ctx.arc(s.x, s.y + 0.5, s.r * 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.erde.stumpTop;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.75, 0, Math.PI * 2); ctx.fill();
    }
  }

  BT.LanduseRenderer = { draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
