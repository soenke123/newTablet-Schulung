/**
 * Der Abspieler fuer die aufgezeichneten 5 Tage.
 *
 * Die Simulation ist zu diesem Zeitpunkt fertig - hier wird nur noch ein
 * Abspielkopf ueber die Zeitachse bewegt. Deshalb kostet Springen genauso
 * wenig wie Abspielen, und der Zeitraffer ist nichts weiter als ein groesserer
 * Schritt pro Bild.
 *
 * Geschwindigkeiten: 1x entspricht einem Tag in 5 Minuten, 25x den vollen
 * 5 Tagen in einer Minute.
 *
 * Am Ende haelt der Abspieler an, statt von vorn zu laufen. Das ist der
 * Zeitpunkt, auf den die ganze Aufzeichnung hinauslaeuft: fuenf Tage Spur
 * liegen vollstaendig auf der Karte, und genau dieses Bild ist das
 * Arbeitsmaterial der Gruppierungsaufgabe. Liefe es von vorn los, waere es
 * genau dann weg, wenn man anfaengt hinzusehen. Wer es noch einmal laufen
 * lassen will, drueckt Abspielen - dann faengt es vorn an (siehe start).
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function create(elements, options) {
    var opts = options || {};
    var onFrame = opts.onFrame || function () {};

    // Der Abspieler laeuft immer ueber *eine* Phase, nicht ueber die ganze
    // Aufzeichnung: Tag 1-5 vor dem Bruch, Tag 6-10 danach. Deshalb hat er
    // einen Anfang und nicht nur ein Ende - vorher war der Anfang immer 0.
    var rangeFrom = 0;
    var duration = 1;
    var time = 0;
    var speed = 1;
    var playing = false;
    var held = false;
    var frame = 0;
    var lastMs = 0;

    var el = elements;

    function label() {
      el.label.textContent = WL.SimTime.label(time);
      el.phase.textContent = WL.SimTime.phaseName(time);
    }

    function syncSlider() {
      el.slider.value = String(time);
    }

    function emit() {
      label();
      onFrame(time);
    }

    function tick(ms) {
      frame = 0;
      if (!playing || held) return;
      var dt = lastMs ? Math.min(0.25, (ms - lastMs) / 1000) : 0;
      lastMs = ms;
      time += dt * speed;
      // Am Ende anhalten und das volle Netz stehen lassen. Genau auf duration
      // gesetzt und nicht auf den ueberschossenen Wert: sonst zeigte die
      // Zeitleiste je nach Bildwiederholrate ein anderes Ende.
      if (time >= duration) {
        time = duration;
        syncSlider();
        emit();
        stop();
        return;
      }
      syncSlider();
      emit();
      frame = global.requestAnimationFrame(tick);
    }

    function start() {
      if (playing) return;
      // Vom Ende aus gibt es nichts mehr abzuspielen - der Knopf waere tot.
      // Wer dort auf Abspielen drueckt, meint "noch einmal", also von vorn.
      // Der Rand ist grosszuegig: mit dem Finger auf der Zeitleiste trifft
      // niemand die letzte Zehntelsekunde genau.
      if (time >= duration - 0.5) player.seek(rangeFrom);
      playing = true;
      lastMs = 0;
      el.playBtn.textContent = '❚❚';
      el.playBtn.setAttribute('aria-label', 'Pause');
      if (!held && !frame) frame = global.requestAnimationFrame(tick);
    }

    function stop() {
      playing = false;
      el.playBtn.textContent = '▶';
      el.playBtn.setAttribute('aria-label', 'Abspielen');
      if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
    }

    el.playBtn.addEventListener('click', function () {
      if (playing) stop(); else start();
    });

    el.slider.addEventListener('input', function () {
      time = Number(el.slider.value);
      emit();
    });

    for (var i = 0; i < el.speedBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          speed = Number(btn.getAttribute('data-speed'));
          for (var k = 0; k < el.speedBtns.length; k++) {
            el.speedBtns[k].classList.toggle('on', el.speedBtns[k] === btn);
          }
        });
      })(el.speedBtns[i]);
    }

    var player = {
      setDuration: function (seconds) {
        player.setRange(0, seconds);
      },

      /**
       * Den abspielbaren Abschnitt setzen - beim Phasenwechsel auf Tag 6-10.
       * Die Zeitleiste zeigt danach nur noch diesen Abschnitt; die Beschriftung
       * bleibt die absolute ("Tag 7 · 03:20"), denn es ist derselbe Kalender.
       */
      setRange: function (from, to) {
        rangeFrom = Math.max(0, from);
        duration = Math.max(rangeFrom + 1, to);
        el.slider.min = String(rangeFrom);
        el.slider.max = String(duration);
        el.slider.step = '0.1';
        player.seek(rangeFrom);
      },

      seek: function (seconds) {
        time = Math.max(rangeFrom, Math.min(duration, seconds));
        syncSlider();
        emit();
      },

      /** Um einen Betrag springen, mit Umlauf innerhalb der Phase. */
      nudge: function (seconds) {
        var span = duration - rangeFrom;
        var t = time + seconds;
        while (t < rangeFrom) t += span;
        while (t > duration) t -= span;
        player.seek(t);
      },

      toggle: function () { if (playing) stop(); else start(); },
      play: start,
      pause: stop,

      /**
       * Die Uhr kurz festhalten, ohne den Abspielzustand anzutasten - fuer die
       * Dauer einer Fingergeste (siehe js/ui/signals.js). Anhalten und wieder
       * Loslaufen sind hier zwei verschiedene Dinge: pause() wechselt den Knopf
       * auf "Abspielen", und wer eine Kachel zieht, hat nicht gestoppt. Nach
       * dem Loslassen laeuft es von selbst weiter, wenn es vorher lief.
       */
      hold: function () {
        if (held) return;
        held = true;
        if (frame) { global.cancelAnimationFrame(frame); frame = 0; }
      },

      release: function () {
        if (!held) return;
        held = false;
        // lastMs zuruecksetzen, sonst holt der erste Schritt die gesamte
        // Haltezeit auf einmal nach.
        lastMs = 0;
        if (playing && !frame) frame = global.requestAnimationFrame(tick);
      },

      isPlaying: function () { return playing; },
      time: function () { return time; },
      speed: function () { return speed; },

      /**
       * Anfang und Ende der laufenden Phase. Die Oberflaeche braucht das Ende,
       * um zu erkennen, dass der Abspieler dort steht - "am Ende angekommen"
       * laesst sich sonst nur an isPlaying() ablesen, und das ist falsch:
       * beim Anhalten meldet tick() den letzten Augenblick *bevor* stop()
       * laeuft, playing steht in diesem Moment also noch auf true.
       */
      rangeStart: function () { return rangeFrom; },
      rangeEnd: function () { return duration; }
    };

    return player;
  }

  WL.Player = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
