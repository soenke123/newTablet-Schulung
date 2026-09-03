/**
 * Kamera: Ausschnitt, Zoom und Umrechnung Bildschirm <-> Welt.
 *
 * Start ist immer die Gesamtansicht (die ganze Welt passt ins Bild). Weiter
 * herauszoomen als das ist nicht moeglich, und die Welt kann auch nicht aus dem
 * Sichtfeld geschoben werden - auf einem Tablet geht sonst schnell die
 * Orientierung verloren.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  function Camera(world) {
    this.world = world;
    this.viewWidth = 1;
    this.viewHeight = 1;
    this.scale = 1;
    this.minScale = 1;
    this.maxScale = 6;
    // Weltkoordinate, die links oben im Sichtfenster liegt
    this.x = 0;
    this.y = 0;
  }

  Camera.prototype.setWorld = function (world) {
    this.world = world;
    this.reset();
  };

  Camera.prototype.setViewport = function (width, height) {
    var wasFitted = Math.abs(this.scale - this.minScale) < 0.0005;
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.minScale = Math.min(this.viewWidth / this.world.width, this.viewHeight / this.world.height);
    this.maxScale = Math.max(this.minScale * 8, this.minScale + 3);
    if (wasFitted) this.reset();
    else {
      this.scale = clamp(this.scale, this.minScale, this.maxScale);
      this.clampPosition();
    }
  };

  /** Gesamtansicht wiederherstellen. */
  Camera.prototype.reset = function () {
    this.minScale = Math.min(this.viewWidth / this.world.width, this.viewHeight / this.world.height);
    this.maxScale = Math.max(this.minScale * 8, this.minScale + 3);
    this.scale = this.minScale;
    this.clampPosition();
  };

  Camera.prototype.isFitted = function () {
    return Math.abs(this.scale - this.minScale) < 0.0005;
  };

  /** Haelt die Welt im Bild; kleinere Achsen werden zentriert. */
  Camera.prototype.clampPosition = function () {
    var visibleW = this.viewWidth / this.scale;
    var visibleH = this.viewHeight / this.scale;

    if (visibleW >= this.world.width) this.x = (this.world.width - visibleW) / 2;
    else this.x = clamp(this.x, 0, this.world.width - visibleW);

    if (visibleH >= this.world.height) this.y = (this.world.height - visibleH) / 2;
    else this.y = clamp(this.y, 0, this.world.height - visibleH);
  };

  Camera.prototype.panByScreen = function (dxScreen, dyScreen) {
    this.x -= dxScreen / this.scale;
    this.y -= dyScreen / this.scale;
    this.clampPosition();
  };

  /** Zoomt so, dass der Punkt unter dem Finger / Cursor stehen bleibt. */
  Camera.prototype.zoomAt = function (screenX, screenY, factor) {
    var before = this.screenToWorld(screenX, screenY);
    this.scale = clamp(this.scale * factor, this.minScale, this.maxScale);
    var after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPosition();
  };

  Camera.prototype.screenToWorld = function (sx, sy) {
    return { x: this.x + sx / this.scale, y: this.y + sy / this.scale };
  };

  Camera.prototype.worldToScreen = function (wx, wy) {
    return { x: (wx - this.x) * this.scale, y: (wy - this.y) * this.scale };
  };

  /** Sichtbarer Weltausschnitt - fuer das Culling beim Zeichnen. */
  Camera.prototype.visibleRect = function (padding) {
    var pad = padding || 0;
    return {
      x: this.x - pad,
      y: this.y - pad,
      width: this.viewWidth / this.scale + pad * 2,
      height: this.viewHeight / this.scale + pad * 2
    };
  };

  WL.Camera = Camera;
})(typeof window !== 'undefined' ? window : globalThis);
