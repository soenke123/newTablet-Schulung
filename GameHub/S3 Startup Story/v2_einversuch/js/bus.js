/* Simpler Pub/Sub. Same-Pattern wie v1, aber ohne Extras. */
(function (RT) {
  'use strict';
  var subs = {};
  RT.bus = {
    on: function (evt, fn) {
      (subs[evt] = subs[evt] || []).push(fn);
    },
    off: function (evt, fn) {
      if (!subs[evt]) return;
      subs[evt] = subs[evt].filter(function (f) { return f !== fn; });
    },
    emit: function (evt, data) {
      var list = subs[evt];
      if (!list) return;
      for (var i = 0; i < list.length; i++) list[i](data);
    }
  };
})(window.RT2);
