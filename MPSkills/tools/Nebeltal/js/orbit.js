/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/orbit.js   ·   Karte frei drehen (Sönke 18.11.2026)
   ══════════════════════════════════════════════════════════════
   Nach dem Auflösen eines Levels (spiel.js, zwei.js) und auf der
   Karte der Lehrkraft am Rundenende (mehr.js) kann man die Welt
   ansehen und drehen:
     1 Finger / Maus ziehen   = drehen (links/rechts) und kippen (hoch/runter)
     2 Finger                 = zoomen (auseinander/zusammen) und schieben
     Mausrad                  = zoomen, rechte Maustaste / Shift = schieben

   const o = NTOrbit.create(element)
   o.set({ eye, at })    Kamera übernehmen (z. B. die Übersicht nach dem Auflösen)
   o.on = true/false     nur dann reagiert es auf Finger/Maus
   o.cam()               → { eye, at } für G.frame
   o.spin = 0.06         dreht sich langsam von selbst, bis jemand anfasst
   o.limit = W           wie weit man den Mittelpunkt schieben darf
   o.floor = (x, z) => h Boden der Welt: die Kamera bleibt darüber
   ══════════════════════════════════════════════════════════════ */
window.NTOrbit = (function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function create(el) {
    const o = {
      on: false, yaw: 0, pitch: 0.8, dist: 60, at: [0, 0, 0], spin: 0, limit: 200, floor: null,
      minD: 6, maxD: 400, touched: false, last: performance.now(),
      set(c) {
        const d = [c.eye[0] - c.at[0], c.eye[1] - c.at[1], c.eye[2] - c.at[2]];
        o.dist = Math.hypot(d[0], d[1], d[2]) || 1;
        o.pitch = Math.asin(clamp(d[1] / o.dist, -1, 1));
        o.yaw = Math.atan2(d[0], d[2]);
        o.at = c.at.slice();
        o.maxD = Math.max(o.maxD, o.dist * 2.2);
        o.touched = false;
        o.last = performance.now();
      },
      cam() {
        const now = performance.now(), dt = Math.min(0.1, (now - o.last) / 1000);
        o.last = now;
        if (o.spin && !o.touched && !ptrs.size) o.yaw += o.spin * dt;
        const cp = Math.cos(o.pitch);
        const eye = [o.at[0] + o.dist * Math.sin(o.yaw) * cp, o.at[1] + o.dist * Math.sin(o.pitch), o.at[2] + o.dist * Math.cos(o.yaw) * cp];
        if (o.floor) { const g = o.floor(eye[0], eye[2]) + 2; if (eye[1] < g) eye[1] = g; }   // nie in den Hang
        return { eye, at: o.at.slice() };
      }
    };
    const ptrs = new Map();
    let pinch = null;

    function pan(dx, dy) {
      // in Bildschirmrichtung schieben (rechts/vor auf dem Boden)
      const k = o.dist * 0.0016;
      const rx = -Math.cos(o.yaw), rz = Math.sin(o.yaw);          // rechts auf dem Bild
      const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);         // „vor“ (vom Auge weg)
      o.at[0] = clamp(o.at[0] - (rx * dx - fx * dy) * k, -o.limit, o.limit);
      o.at[2] = clamp(o.at[2] - (rz * dx - fz * dy) * k, -o.limit, o.limit);
    }
    function two() {
      const [a, b] = [...ptrs.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    el.addEventListener('pointerdown', e => {
      if (!o.on) return;
      o.touched = true;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
      if (ptrs.size === 2) pinch = Object.assign(two(), { dist: o.dist });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    el.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!o.on || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size >= 2 && pinch) {
        const t = two();
        o.dist = clamp(pinch.dist * pinch.d / Math.max(20, t.d), o.minD, o.maxD);
        pan(t.x - pinch.x, t.y - pinch.y);
        pinch.x = t.x; pinch.y = t.y;
        return;
      }
      if (p.pan) { pan(dx, dy); return; }
      o.yaw -= dx * 0.006;
      o.pitch = clamp(o.pitch + dy * 0.0035, 0.25, 1.5);
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      if (!o.on) return;
      e.preventDefault();
      o.touched = true;
      o.dist = clamp(o.dist * Math.exp(e.deltaY * 0.0012), o.minD, o.maxD);
    }, { passive: false });
    el.addEventListener('contextmenu', e => { if (o.on) e.preventDefault(); });
    return o;
  }
  return { create };
})();
