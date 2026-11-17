/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/schnee.js   ·   Schneesturm über der Welt (Level 1/2)
   ══════════════════════════════════════════════════════════════
   2D-Canvas über dem WebGL-Bild. Der Schnee hängt NUR am Bildschirm:
   Fallen und Wind sind immer gleich schnell, egal wohin der Pinguin
   läuft oder die Kamera dreht (Sönke 17.11.2026 – im Showroom schob
   die Kamera den Schnee mit, das war beim Laufen viel zu heftig).
   Böen (0…1) kommen langsam; spiel.js verkleinert damit die Sicht
   und legt den Schleier #gust darüber.
   Sparmodus (LWMotion.low): kein Schnee, nur noch die Böen.

   NTSchnee.create(canvas) → { frame(dt, t, on), gust }
   ══════════════════════════════════════════════════════════════ */

window.NTSchnee = (function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const low = () => !!(window.LWMotion && LWMotion.low);

  // Polarnacht: viele feine Streifen, kühles Weiß
  const CFG = { n: 620, wind: 3.0, fall: 0.8, size: 1.3, streak: 1.2, col: '205,225,255' };

  function create(cv) {
    const cx = cv.getContext('2d');
    const flakes = [];
    for (let i = 0; i < CFG.n; i++) flakes.push({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, ph: Math.random() * 6.28 });
    let shown = false;
    const api = { gust: 0, frame };

    function gustAt(t) {
      const g = 0.5 + 0.28 * Math.sin(t * 0.31) + 0.18 * Math.sin(t * 0.83 + 1.7) + 0.1 * Math.sin(t * 2.1 + 0.4);
      return clamp((g - 0.45) / 0.55, 0, 1);
    }

    function frame(dt, t, on) {
      api.gust = on ? gustAt(t) : 0;
      const draw = on && !low();
      if (!draw) { if (shown) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); shown = false; } return api.gust; }
      shown = true;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      const wind = CFG.wind * (0.6 + api.gust * 0.9);
      // auf schmalen Geräten weniger Flocken, gleich dicht wirkend
      const n = Math.round(CFG.n * clamp(W * H / (1280 * 800), 0.4, 1));
      cx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const f = flakes[i], z = f.z;
        // Geschwindigkeit in Bildschirm-Breiten/-Höhen pro Sekunde – hängt nur von der Tiefe ab
        const vx = (wind * z + Math.sin(t * 1.3 + f.ph) * 0.15) * 0.18;
        const vy = (CFG.fall * z + 0.1) * 0.16;
        f.x += vx * dt; f.y += vy * dt;
        if (f.x > 1.05) f.x -= 1.1;
        if (f.y > 1.05) { f.y -= 1.1; f.x = Math.random(); }
        const X = f.x * W, Y = f.y * H, r = CFG.size * z;
        const len = CFG.streak * wind * z * 7 + 1, ang = Math.atan2(vy * H, vx * W);
        cx.strokeStyle = 'rgba(' + CFG.col + ',' + (0.3 + 0.6 * z).toFixed(2) + ')';
        cx.lineWidth = r;
        cx.beginPath(); cx.moveTo(X, Y); cx.lineTo(X - Math.cos(ang) * len, Y - Math.sin(ang) * len); cx.stroke();
      }
      return api.gust;
    }
    return api;
  }
  return { create };
})();
