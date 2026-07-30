/* Screen-Registry und -Manager.
   Jeder Screen ist ein Objekt { enter(container, params), exit() }.
   show(id) räumt den alten Screen ab und ruft enter() des neuen. */
(function (RT) {
  'use strict';

  var registry = Object.create(null);
  var current = null; // { id, screen }
  var containerEl = null;

  function setContainer(el) { containerEl = el; }

  function register(id, screen) {
    if (typeof screen.enter !== 'function') {
      console.error('[screens] screen "' + id + '" hat kein enter()');
      return;
    }
    registry[id] = screen;
  }

  function show(id, params) {
    if (!containerEl) {
      console.error('[screens] kein Container gesetzt – setContainer() zuerst aufrufen');
      return;
    }
    var next = registry[id];
    if (!next) {
      console.error('[screens] unbekannter Screen:', id);
      return;
    }

    // alten Screen abräumen
    if (current && typeof current.screen.exit === 'function') {
      try { current.screen.exit(); }
      catch (e) { console.error('[screens] exit() error', e); }
    }
    containerEl.innerHTML = '';

    // neuen Screen rendern
    current = { id: id, screen: next };
    RT.bus.emit('screen:enter', { id: id, params: params });
    try { next.enter(containerEl, params || {}); }
    catch (e) { console.error('[screens] enter() error', e); }
  }

  function currentId() { return current ? current.id : null; }

  RT.screens = {
    setContainer: setContainer,
    register: register,
    show: show,
    current: currentId
  };
})(window.RT);
