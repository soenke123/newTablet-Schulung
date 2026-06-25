/* Echtzeit-Spieluhr.
   MONTH_MS = Millisekunden pro Spielmonat (10 000 = 10 Sek., später 30 000).
   Jeder Tick emittiert 'clock:tick' { progress: 0–1 } für den Fortschrittsring.
   Wenn ein Monat voll ist → ADVANCE_MONTH dispatch (state emittiert 'month:advance'). */
(function (RT) {
  'use strict';

  var MONTH_MS = 10000;   // ← hier später auf 30 000 erhöhen
  var _timer              = null;
  var _t0                 = null;    // Timestamp: Beginn des aktuellen Spielmonats
  var _pauseCount         = 0;
  var _elapsedBeforePause = 0;

  function start() {
    if (_timer) return;
    _t0    = Date.now();
    _timer = setInterval(_tick, 80);   // ~12 fps – reicht für den Ring
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _pauseCount = 0;
    _elapsedBeforePause = 0;
  }

  // Pausiert die Uhr (zählt Schachtelungen: jedes pause() braucht ein resume()).
  function pause() {
    if (_pauseCount === 0 && _timer) {
      _elapsedBeforePause = Date.now() - _t0;
      clearInterval(_timer);
      _timer = null;
    }
    _pauseCount++;
  }

  // Nimmt eine Pausierung zurück; setzt die Uhr fort, sobald alle Pauses aufgehoben sind.
  function resume() {
    if (_pauseCount > 0) _pauseCount--;
    if (_pauseCount === 0 && !_timer) {
      _t0    = Date.now() - _elapsedBeforePause;
      _elapsedBeforePause = 0;
      _timer = setInterval(_tick, 80);
    }
  }

  function _tick() {
    var elapsed = Date.now() - _t0;
    if (elapsed >= MONTH_MS) {
      // _t0 und progress VOR advanceMonth() zurücksetzen, damit alle
      // Subscriber (campus grid, techtree…) schon _clockProg=0 sehen,
      // wenn ihre month:advance-Handler campus:grid-changed auslösen.
      _t0 = Date.now();
      RT.bus.emit('clock:tick', { progress: 0 });
      RT.tick.advanceMonth();
    } else {
      RT.bus.emit('clock:tick', { progress: elapsed / MONTH_MS });
    }
  }

  RT.clock = { start: start, stop: stop, pause: pause, resume: resume, MONTH_MS: MONTH_MS };
})(window.RT);
