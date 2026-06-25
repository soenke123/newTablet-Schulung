/* Pub/Sub-Event-Bus für entkoppelte Modulkommunikation.
   Events folgen dem Muster 'subsystem:action' (z.B. 'month:advance', 'resource:changed'). */
(function (RT) {
  'use strict';

  var listeners = Object.create(null);

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(handler);
    return function off() { offListener(event, handler); };
  }

  function offListener(event, handler) {
    var list = listeners[event];
    if (!list) return;
    var i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  }

  function emit(event, payload) {
    if (RT.debug) console.log('[bus]', event, payload);
    var list = listeners[event];
    if (!list) return;
    // Kopie, damit handler die Liste während des Loops verändern dürfen
    var snapshot = list.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try { snapshot[i](payload); }
      catch (e) { console.error('[bus] handler error for', event, e); }
    }
  }

  RT.bus = { on: on, off: offListener, emit: emit };
})(window.RT);
