/* Camera — Pinch-Zoom + Pan für den World-Layer.
   Wirkt auf #world-camera (der iso-grid + building-ui-layer enthält).
   Der äußere #world und alles außerhalb (Header, Modale, Toasts) bleibt
   unberührt.

   Nicht persistent: Scale/Pan werden bei jedem Reload zurückgesetzt.
*/
(function (RT) {
  'use strict';

  var MIN_SCALE = 0.5;
  var MAX_SCALE = 2.5;
  var DRAG_THRESHOLD = 8; // px — darunter wird als Tap durchgereicht

  var worldEl  = null;
  var cameraEl = null;
  var scale = 1.0;
  var panX  = 0;
  var panY  = 0;

  // Gesten-State
  var pinchStartDist = 0;
  var pinchStartScale = 1.0;
  var isPanning = false;
  var panStartX = 0;
  var panStartY = 0;
  var panOriginX = 0;
  var panOriginY = 0;
  var panMoved = false;
  var suppressNextClick = false;

  function applyTransform() {
    if (!cameraEl) return;
    cameraEl.style.transform =
      'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
  }

  function setScale(s) {
    if (s < MIN_SCALE) s = MIN_SCALE;
    if (s > MAX_SCALE) s = MAX_SCALE;
    scale = s;
    applyTransform();
  }

  function setPan(x, y) {
    panX = x;
    panY = y;
    applyTransform();
  }

  // Default-Zoom pro Phase — Phase 0/1 haben nur ein 3×3-Grid, das darf
  // größer wirken. Phase 2 hat 20×20 — Standardgröße, User zoomt selbst.
  function resetForPhase() {
    var phase = (RT.state && RT.state.currentPhase) ? RT.state.currentPhase() : 0;
    panX = 0;
    panY = 0;
    scale = (phase < 2) ? 1.5 : 1.0;
    applyTransform();
  }

  // ── Pinch ─────────────────────────────────────────────────────────────
  function twoFingerDistance(ts) {
    var dx = ts[0].clientX - ts[1].clientX;
    var dy = ts[0].clientY - ts[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onTouchStart(ev) {
    if (ev.touches.length === 2) {
      pinchStartDist  = twoFingerDistance(ev.touches);
      pinchStartScale = scale;
      isPanning = false;
      ev.preventDefault();
    } else if (ev.touches.length === 1) {
      isPanning = true;
      panMoved  = false;
      panStartX = ev.touches[0].clientX;
      panStartY = ev.touches[0].clientY;
      panOriginX = panX;
      panOriginY = panY;
    }
  }

  function onTouchMove(ev) {
    if (ev.touches.length === 2 && pinchStartDist > 0) {
      var d = twoFingerDistance(ev.touches);
      var ratio = d / pinchStartDist;
      setScale(pinchStartScale * ratio);
      ev.preventDefault();
    } else if (isPanning && ev.touches.length === 1) {
      var dx = ev.touches[0].clientX - panStartX;
      var dy = ev.touches[0].clientY - panStartY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        panMoved = true;
        suppressNextClick = true;
      }
      if (panMoved) {
        setPan(panOriginX + dx, panOriginY + dy);
        ev.preventDefault();
      }
    }
  }

  function onTouchEnd(ev) {
    if (ev.touches.length < 2) pinchStartDist = 0;
    // Übergang 2 → 1 Finger: Pan-Referenz auf verbleibenden Finger neu setzen,
    // sonst würde der nächste touchmove einen riesigen Delta melden.
    if (ev.touches.length === 1) {
      panStartX = ev.touches[0].clientX;
      panStartY = ev.touches[0].clientY;
      panOriginX = panX;
      panOriginY = panY;
      panMoved   = false;
      isPanning  = true;
    }
    if (ev.touches.length === 0) isPanning = false;
  }

  // ── Maus-Drag (Desktop) ───────────────────────────────────────────────
  function onMouseDown(ev) {
    // Nur linke Maustaste
    if (ev.button !== 0) return;
    isPanning = true;
    panMoved  = false;
    panStartX = ev.clientX;
    panStartY = ev.clientY;
    panOriginX = panX;
    panOriginY = panY;
  }

  function onMouseMove(ev) {
    if (!isPanning) return;
    var dx = ev.clientX - panStartX;
    var dy = ev.clientY - panStartY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      panMoved = true;
      suppressNextClick = true;
    }
    if (panMoved) {
      setPan(panOriginX + dx, panOriginY + dy);
    }
  }

  function onMouseUp() {
    isPanning = false;
  }

  // ── Wheel-Zoom (Desktop, mit Ctrl) ────────────────────────────────────
  function onWheel(ev) {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    var factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    setScale(scale * factor);
  }

  // ── Click-Suppression nach Drag ───────────────────────────────────────
  // Wenn wir gerade gepannt haben, soll der Tile-/Building-Klick nicht
  // ausgelöst werden. Capture-Phase greift vor der eigentlichen Handler-Kette.
  function onClickCapture(ev) {
    if (suppressNextClick) {
      ev.stopPropagation();
      ev.preventDefault();
      suppressNextClick = false;
    }
  }

  function init(_worldEl, _cameraEl) {
    worldEl  = _worldEl;
    cameraEl = _cameraEl;
    if (!worldEl || !cameraEl) return;

    worldEl.addEventListener('touchstart', onTouchStart, { passive: false });
    worldEl.addEventListener('touchmove',  onTouchMove,  { passive: false });
    worldEl.addEventListener('touchend',   onTouchEnd);
    worldEl.addEventListener('touchcancel', onTouchEnd);

    worldEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);

    worldEl.addEventListener('wheel',     onWheel, { passive: false });
    worldEl.addEventListener('click',     onClickCapture, true);

    resetForPhase();
  }

  RT.camera = {
    init:          init,
    setScale:      setScale,
    setPan:        setPan,
    resetForPhase: resetForPhase,
    getScale:      function () { return scale; }
  };
})(window.RT3);
