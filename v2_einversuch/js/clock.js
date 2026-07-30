/* requestAnimationFrame-Uhr. Sendet 'tick' mit dt (Sekunden) und now (performance.now()). */
(function (RT) {
  'use strict';
  var running = false;
  var last = 0;

  function step(now) {
    if (!running) return;
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    // Bei Tab-Wechsel kann dt sehr groß werden. Bei diesem MVP kappen wir auf 1 Sek
    // damit Progress-Bars nicht springen. (Echte Offline-Progression kommt später.)
    if (dt > 1) dt = 1;
    RT.bus.emit('tick', { dt: dt, now: now });
    requestAnimationFrame(step);
  }

  RT.clock = {
    start: function () {
      if (running) return;
      running = true;
      last = 0;
      requestAnimationFrame(step);
    },
    stop: function () { running = false; }
  };
})(window.RT2);
