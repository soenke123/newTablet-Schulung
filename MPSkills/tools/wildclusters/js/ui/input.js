/**
 * Bedienung der Karte: Verschieben und Zoomen.
 *
 * Alles laeuft ueber Pointer-Events, damit Maus, Finger und Stift denselben
 * Codepfad benutzen:
 *   - ein Zeiger  -> Karte verschieben
 *   - zwei Finger -> Pinch-Zoom um den Fingermittelpunkt herum
 *   - Mausrad     -> Zoom auf den Cursor
 *   - Doppeltipp / Doppelklick -> heranzoomen bzw. zurueck zur Gesamtansicht
 *
 * Das Canvas hat in CSS touch-action: none, sonst faengt der Browser die Gesten
 * ab und scrollt stattdessen die Seite.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function attach(canvas, renderer, options) {
    var opts = options || {};
    var onChange = opts.onChange || function () {};
    var onGestureEnd = opts.onGestureEnd || function () {};
    // Einzeltipp waehlt ein Tier aus; der Doppeltipp zoomt wie bisher.
    var onTap = opts.onTap || function () {};

    var pointers = new Map();
    var pinch = null;       // { distance, midX, midY }
    var moved = false;
    var lastTapTime = 0;
    var lastTapX = 0;
    var lastTapY = 0;

    function localPoint(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function pointerList() {
      var list = [];
      pointers.forEach(function (p) { list.push(p); });
      return list;
    }

    function startPinch() {
      var list = pointerList();
      if (list.length < 2) { pinch = null; return; }
      var dx = list[1].x - list[0].x;
      var dy = list[1].y - list[0].y;
      pinch = {
        distance: Math.max(1, Math.hypot(dx, dy)),
        midX: (list[0].x + list[1].x) / 2,
        midY: (list[0].y + list[1].y) / 2
      };
    }

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      var p = localPoint(e);
      pointers.set(e.pointerId, p);
      moved = false;
      if (pointers.size === 2) startPinch();
      canvas.classList.add('dragging');
    });

    canvas.addEventListener('pointermove', function (e) {
      var stored = pointers.get(e.pointerId);
      if (!stored) return;
      var p = localPoint(e);

      if (pointers.size === 1) {
        var dx = p.x - stored.x;
        var dy = p.y - stored.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;
        renderer.camera.panByScreen(dx, dy);
        pointers.set(e.pointerId, p);
        renderer.requestDraw();
        onChange();
        return;
      }

      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        moved = true;
        var list = pointerList();
        var ndx = list[1].x - list[0].x;
        var ndy = list[1].y - list[0].y;
        var distance = Math.max(1, Math.hypot(ndx, ndy));
        var midX = (list[0].x + list[1].x) / 2;
        var midY = (list[0].y + list[1].y) / 2;
        if (!pinch) startPinch();

        // Erst der Zoom um den Fingermittelpunkt, dann die Verschiebung des
        // Mittelpunkts selbst - so bleibt der Punkt unter den Fingern liegen.
        renderer.camera.zoomAt(midX, midY, distance / pinch.distance);
        renderer.camera.panByScreen(midX - pinch.midX, midY - pinch.midY);
        pinch = { distance: distance, midX: midX, midY: midY };
        renderer.requestDraw();
        onChange();
      }
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      var p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);

      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) startPinch(); // verbleibender Finger uebernimmt

      if (pointers.size === 0) {
        canvas.classList.remove('dragging');
        if (!moved) handleTap(p);
        onGestureEnd();
      }
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    function handleTap(p) {
      var nowMs = Date.now();
      var isDouble = nowMs - lastTapTime < 320 &&
        Math.abs(p.x - lastTapX) < 40 && Math.abs(p.y - lastTapY) < 40;
      lastTapTime = nowMs;
      lastTapX = p.x;
      lastTapY = p.y;
      if (!isDouble) {
        onTap(renderer.camera.screenToWorld(p.x, p.y));
        return;
      }

      lastTapTime = 0;
      var cam = renderer.camera;
      if (cam.isFitted()) cam.zoomAt(p.x, p.y, 2.6);
      else cam.reset();
      renderer.requestDraw();
      onChange();
      onGestureEnd();
    }

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = localPoint(e);
      // Zeilen- und Seitenmodus mit umrechnen, sonst zoomt Firefox winzig.
      var delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      renderer.camera.zoomAt(p.x, p.y, Math.exp(-delta * 0.0016));
      renderer.requestDraw();
      onChange();
      onGestureEnd();
    }, { passive: false });

    canvas.addEventListener('dblclick', function (e) { e.preventDefault(); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    return {
      reset: function () {
        renderer.camera.reset();
        renderer.requestDraw();
        onChange();
        onGestureEnd();
      }
    };
  }

  WL.Input = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
