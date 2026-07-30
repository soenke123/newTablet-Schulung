/* Clock — requestAnimationFrame. Emit 'tick' mit {dt, now}. dt capped für Tab-Switches. */
(function (RT) {
  'use strict';
  var running = false;
  var lastFrame = 0;

  function frame(t) {
    if (!running) return;
    var now = performance.now();
    if (lastFrame === 0) lastFrame = now;
    var dt = now - lastFrame;
    if (dt > 1000) dt = 1000; // cap: verhindert Riesen-Sprünge nach Tab-Wechsel
    lastFrame = now;
    RT.bus.emit('tick', { dt: dt, now: now });
    requestAnimationFrame(frame);
  }

  RT.clock = {
    start: function () {
      if (running) return;
      running = true;
      lastFrame = 0;
      requestAnimationFrame(frame);
    },
    stop: function () { running = false; }
  };
})(window.RT3);
