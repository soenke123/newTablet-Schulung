/**
 * Zusammensetzung des Bildes.
 *
 * Die statische Welt (Terrain + Objekte) wird in ein Offscreen-Canvas gerendert
 * und beim Verschieben nur noch kopiert. Neu gerendert wird nur, wenn der
 * sichtbare Ausschnitt den Puffer verlaesst oder sich der Zoom geaendert hat -
 * waehrend einer Pinch-Geste bleibt das vorhandene Bild stehen und wird kurz
 * skaliert, danach wieder scharf nachgezeichnet.
 *
 * setDynamicLayers() ist der vorbereitete Einstiegspunkt fuer die spaeteren
 * Phasen (Tiere, Bewegungsspuren, Tag-/Nacht-Faerbung).
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var MAX_CACHE_PIXELS = 7.5e6; // Obergrenze fuer den Offscreen-Puffer
  var CACHE_MARGIN = 0.28;      // Puffer rund um den sichtbaren Ausschnitt
  var REFRESH_DELAY = 130;      // ms bis zum scharfen Nachzeichnen nach dem Zoom

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = null;
    this.camera = null;
    this.dpr = 1;
    this.cache = null;
    this.cacheCanvas = document.createElement('canvas');
    this.dynamicLayers = [];
    this.masked = false;
    this._frame = 0;
    this._refreshTimer = 0;
    this._lastCacheMs = 0;
  }

  Renderer.prototype.setWorld = function (world) {
    this.world = world;
    if (!this.camera) this.camera = new WL.Camera(world);
    else this.camera.setWorld(world);
    this.cache = null;
    this.resize();
  };

  Renderer.prototype.setDynamicLayers = function (layers) {
    this.dynamicLayers = layers || [];
    this.requestDraw();
  };

  /**
   * Verdeckte Sicht: Terrain und Objekte werden gar nicht erst gezeichnet, der
   * Puffer bleibt unberuehrt (beim Zurueckschalten steht er sofort wieder zur
   * Verfuegung). Den einheitlichen Hintergrund malt die dynamische Ebene - sie
   * ist die einzige, die weiss, wie spaet es gerade ist.
   */
  Renderer.prototype.setMasked = function (flag) {
    this.masked = !!flag;
    this.requestDraw();
  };

  Renderer.prototype.resize = function () {
    if (!this.world) return;
    var rect = this.canvas.getBoundingClientRect();
    var width = Math.max(1, Math.round(rect.width));
    var height = Math.max(1, Math.round(rect.height));
    // Pixeldichte deckeln: auf Handys sonst unnoetig teuer.
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.camera.setViewport(width, height);
    this.cache = null;
    this.requestDraw();
  };

  Renderer.prototype.invalidate = function () {
    this.cache = null;
    this.requestDraw();
  };

  Renderer.prototype.requestDraw = function () {
    if (this._frame) return;
    var self = this;
    this._frame = global.requestAnimationFrame(function () {
      self._frame = 0;
      self.draw();
    });
  };

  /** Deckt der Puffer den sichtbaren Bereich noch ab? */
  Renderer.prototype._cacheCovers = function () {
    var c = this.cache;
    if (!c) return false;
    var cam = this.camera;
    var visW = cam.viewWidth / cam.scale;
    var visH = cam.viewHeight / cam.scale;
    var eps = 0.5;
    return cam.x >= c.x - eps && cam.y >= c.y - eps &&
      cam.x + visW <= c.x + c.width + eps &&
      cam.y + visH <= c.y + c.height + eps;
  };

  Renderer.prototype._cacheIsSharp = function () {
    var c = this.cache;
    if (!c) return false;
    var wanted = this.camera.scale * this.dpr;
    return Math.abs(c.renderScale - wanted) / wanted < 0.03;
  };

  Renderer.prototype._buildCache = function () {
    var started = (global.performance && performance.now) ? performance.now() : Date.now();
    var cam = this.camera;
    var world = this.world;

    var visW = cam.viewWidth / cam.scale;
    var visH = cam.viewHeight / cam.scale;
    var scale = cam.scale * this.dpr;
    var x, y, width, height, px, py;

    // Erst den Puffer rund um den Ausschnitt verkleinern, bevor an der
    // Aufloesung gespart wird - Schaerfe ist wichtiger als seltenes Nachladen.
    var margins = [CACHE_MARGIN, 0.1, 0];
    for (var m = 0; m < margins.length; m++) {
      var margin = margins[m];
      x = Math.max(0, cam.x - visW * margin);
      y = Math.max(0, cam.y - visH * margin);
      width = Math.min(world.width - x, visW * (1 + 2 * margin));
      height = Math.min(world.height - y, visH * (1 + 2 * margin));
      px = Math.ceil(width * scale);
      py = Math.ceil(height * scale);
      if (px * py <= MAX_CACHE_PIXELS) break;
    }

    if (px * py > MAX_CACHE_PIXELS) {
      var k = Math.sqrt(MAX_CACHE_PIXELS / (px * py));
      scale *= k;
      px = Math.ceil(width * scale);
      py = Math.ceil(height * scale);
    }

    var canvas = this.cacheCanvas;
    canvas.width = px;
    canvas.height = py;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);

    var view = { x: x, y: y, width: width, height: height };
    var detailScale = scale / this.dpr;

    ctx.fillStyle = WL.PALETTE.backdrop;
    ctx.fillRect(x, y, width, height);
    WL.TerrainRenderer.draw(ctx, world, view, detailScale);
    WL.ObjectRenderer.draw(ctx, world, view, detailScale);

    this.cache = { x: x, y: y, width: width, height: height, renderScale: scale };
    this._lastCacheMs = Math.round(
      ((global.performance && performance.now) ? performance.now() : Date.now()) - started
    );
  };

  Renderer.prototype._scheduleRefresh = function () {
    if (this._refreshTimer) global.clearTimeout(this._refreshTimer);
    var self = this;
    this._refreshTimer = global.setTimeout(function () {
      self._refreshTimer = 0;
      if (!self._cacheIsSharp() || !self._cacheCovers()) {
        self._buildCache();
        self.draw();
      }
    }, REFRESH_DELAY);
  };

  /** Nach einer Geste scharf nachzeichnen (verzoegert, damit es nicht ruckelt). */
  Renderer.prototype.refreshLater = function () {
    this._scheduleRefresh();
  };

  Renderer.prototype.draw = function () {
    if (!this.world) return;
    var ctx = this.ctx;
    var cam = this.camera;

    if (!this.masked) {
      if (!this.cache || !this._cacheCovers()) this._buildCache();
      else if (!this._cacheIsSharp()) this._scheduleRefresh();
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = WL.PALETTE.outside;
    ctx.fillRect(0, 0, cam.viewWidth, cam.viewHeight);

    if (!this.masked) {
      var c = this.cache;
      var dx = (c.x - cam.x) * cam.scale;
      var dy = (c.y - cam.y) * cam.scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.cacheCanvas, dx, dy, c.width * cam.scale, c.height * cam.scale);
      this._strokeWorldEdge(ctx, cam, 'rgba(70, 60, 40, 0.28)');
    }

    if (this.dynamicLayers.length) {
      var s = cam.scale * this.dpr;
      ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
      var view = cam.visibleRect(40);
      for (var i = 0; i < this.dynamicLayers.length; i++) {
        this.dynamicLayers[i](ctx, this.world, view, cam.scale);
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // In der verdeckten Sicht erst hier: der deckende Hintergrund der
    // dynamischen Ebene haette den Rand sonst gerade wieder uebermalt.
    if (this.masked) this._strokeWorldEdge(ctx, cam, WL.PALETTE.masked.edge);
  };

  /** Weltrand andeuten, damit die Karte als Objekt lesbar bleibt. */
  Renderer.prototype._strokeWorldEdge = function (ctx, cam, color) {
    var origin = cam.worldToScreen(0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      origin.x - 0.5, origin.y - 0.5,
      this.world.width * cam.scale + 1, this.world.height * cam.scale + 1
    );
  };

  Renderer.prototype.stats = function () {
    return {
      cacheMs: this._lastCacheMs,
      cachePixels: this.cacheCanvas.width * this.cacheCanvas.height,
      dpr: this.dpr
    };
  };

  WL.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
