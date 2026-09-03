/**
 * Die Aufzeichnung: zehn Tage Tierleben als abtastbare Kurve.
 *
 * Warum ueberhaupt aufzeichnen? Weil "auf jeden Zeitpunkt springen" nur geht,
 * wenn die Tage bereits vorliegen. Eine mitlaufende Simulation kaeme nur
 * vorwaerts. Also wird beim Weltaufbau einmal durchgerechnet und hier
 * abgelegt; Abspielen ist danach reines Nachschlagen - Springen, Zeitraffer
 * und Rueckwaertslaufen kosten alle dasselbe.
 *
 * Format: pro Tier drei parallele Reihen (x, y, Zustand) mit fester Abtastrate.
 * 10 Tage bei 5 Hz sind 15 000 Stuetzstellen je Tier, also rund 140 KB pro
 * Ente - das traegt auch ein Tablet ohne Nachdenken.
 *
 * Die *Spur* dagegen wird nie ueber zehn Tage gebaut, sondern immer nur ueber
 * die laufende Phase (setWindow, siehe dort). Das haelt die Zeichenkosten auf
 * dem Stand von vor der Zweiteilung.
 *
 * Zwischen den Stuetzstellen wird linear interpoliert; bei 5 Hz und den Tempi
 * aus data/tiere.md liegen selbst im Flug nur rund 13 Units dazwischen.
 *
 * Die Spur gibt es in mehreren Grobheitsstufen (trailAt). Grund ist der
 * Aufwand am fuenften Tag: die Spur waechst linear mit der Zeit, und in der
 * Gesamtansicht sind 45 Tiere x 3000 Punkte in jedem Bild zu zeichnen. Die
 * Stufen entstehen mit Douglas-Peucker, das nach dem *senkrechten Abstand zur
 * Sehne* geht und nicht nach der Schrittlaenge: eine schnurgerade Flugbahn
 * braucht zwei Punkte, egal wie lang sie ist. Bei einer garantierten
 * Abweichung von einem halben Bildschirmpixel bleibt so rund ein Drittel der
 * Punkte uebrig - unter der Breite der Linie, die daraus wird.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var AIRBORNE = WL.Agents.AIRBORNE;
  var ABSENT = WL.Agents.STATES.abwesend;

  var TRAIL_MIN_GAP = 2.0; // Weltunits - kuerzere Schritte fallen aus der Spur

  /**
   * Die Grobheitsstufen, in Weltunits garantierter Abweichung. Stufe 0 ist die
   * ungekuerzte Spur (starker Zoom), die groebste bedient das Handy, auf dem
   * die ganze Welt in 360 Pixel Breite passt. Wenige Stufen mit Abstand
   * zueinander: jeder Wechsel baut die Zeichenpfade neu auf, und zwischen zwei
   * dicht benachbarten Stufen liegt kein sichtbarer Unterschied.
   */
  var TRAIL_LODS = [0, 0.25, 0.6, 1.5, 3.5];

  function create(agentCount, sampleCount, sampleSeconds) {
    var total = agentCount * sampleCount;

    var rec = {
      agentCount: agentCount,
      sampleCount: sampleCount,
      sampleSeconds: sampleSeconds,
      duration: (sampleCount - 1) * sampleSeconds,
      x: new Float32Array(total),
      y: new Float32Array(total),
      state: new Uint8Array(total),
      _trails: [],

      // Das Fenster, ueber dem die Spur gebaut wird - anfangs die ganze
      // Aufzeichnung. Die Positionen selbst bleiben immer vollstaendig
      // abrufbar (at() rechnet weiter auf der absoluten Achse); begrenzt wird
      // nur, was als Linie auf der Karte landet.
      windowFrom: 0,
      windowTo: sampleCount - 1,

      /**
       * Die Spur auf einen Abschnitt beschraenken - beim Phasenwechsel auf
       * Tag 6-10, damit Phase 2 auf leerem Blatt beginnt. Die Grenzen sind
       * Stuetzstellen-Nummern und kommen aus WL.SimTime.phaseSamples; hier
       * wird nichts nachgerechnet, damit der Bruch nur an einer Stelle steht.
       *
       * Die gebauten Streckenzuege werden dabei *verworfen* und beim naechsten
       * Zugriff neu gebaut. Das kostet einmal so viel wie der erste Aufbau
       * heute und passiert genau dann, wenn ohnehin eine Pause ist. Der Gewinn
       * ist doppelt: die Spur zeigt wirklich nur die laufende Phase, und es
       * liegen nie mehr als 5 Tage Linie auf dem Schirm - die Zeichenkosten
       * bleiben also exakt die von vor der Zweiteilung, obwohl die
       * Aufzeichnung doppelt so lang ist.
       */
      setWindow: function (fromSample, toSample) {
        var from = fromSample;
        var to = toSample;
        if (from < 0) from = 0;
        if (to > sampleCount - 1) to = sampleCount - 1;
        if (to < from) to = from;
        if (from === rec.windowFrom && to === rec.windowTo) return;
        rec.windowFrom = from;
        rec.windowTo = to;
        rec._trails = [];
        rec._lods = [];
      },

      write: function (agentIndex, sampleIndex, agent) {
        var i = agentIndex * sampleCount + sampleIndex;
        rec.x[i] = agent.x;
        rec.y[i] = agent.y;
        rec.state[i] = agent.state;
      },

      /**
       * Ein Platz, der noch keinem Tier gehoert. Nachzuegler bekommen ihre
       * Zeile von Anfang an - die Nummerierung und damit die Signalkacheln
       * muessen ueber beide Phasen dieselben bleiben -, gefuellt wird sie aber
       * erst ab ihrer Ankunft.
       */
      writeAbsent: function (agentIndex, sampleIndex) {
        rec.state[agentIndex * sampleCount + sampleIndex] = ABSENT;
      },

      /**
       * Den Startplatz eines Nachzueglers rueckwaerts in seine leeren Zeilen
       * schreiben. Der Zustand bleibt 'abwesend' - gezeichnet und gemessen
       * wird weiterhin nichts.
       *
       * Warum ueberhaupt? Weil eine leere Zeile (0, 0) heisst, und das ist die
       * linke obere Kartenecke. Jeder, der die Aufzeichnung durchlaeuft, ohne
       * an den Zustand zu denken, sieht dann im Augenblick der Ankunft einen
       * Sprung ueber die halbe Karte - simtest meldete prompt zwei Rehe je
       * Seed als "zu schnell". Das an jeder Lesestelle einzeln abzufangen
       * waere eine Falle, die sich bei jedem neuen Leser wiederholt; eine
       * Aufzeichnung, die *immer* wohlgeformt ist, hat das Problem nicht.
       */
      backfill: function (agentIndex, untilSample, x, y) {
        var base = agentIndex * sampleCount;
        for (var i = 0; i < untilSample && i < sampleCount; i++) {
          rec.x[base + i] = x;
          rec.y[base + i] = y;
        }
      },

      /** Zustand eines Tieres zu einem beliebigen Zeitpunkt. */
      at: function (agentIndex, time, out) {
        var pos = time / sampleSeconds;
        if (pos < 0) pos = 0;
        if (pos > sampleCount - 1) pos = sampleCount - 1;
        var i0 = Math.floor(pos);
        var i1 = Math.min(sampleCount - 1, i0 + 1);
        var f = pos - i0;
        var base = agentIndex * sampleCount;
        var x0 = rec.x[base + i0], y0 = rec.y[base + i0];
        var x1 = rec.x[base + i1], y1 = rec.y[base + i1];

        var o = out || {};
        o.x = x0 + (x1 - x0) * f;
        o.y = y0 + (y1 - y0) * f;
        o.state = rec.state[base + (f < 0.5 ? i0 : i1)];
        o.airborne = !!AIRBORNE[o.state];
        // Blickrichtung aus der Bewegung ableiten - eine eigene Reihe dafuer
        // waere Speicher fuer eine Zahl, die ohnehin in den Positionen steckt.
        var dx = x1 - x0, dy = y1 - y0;
        if (dx * dx + dy * dy > 1e-4) o.heading = Math.atan2(dy, dx);
        else o.heading = headingFallback(rec, base, i0);
        return o;
      },

      /**
       * Die Bewegungsspur als ausgeduennter Streckenzug - die feinste Stufe.
       * Ausgeduennt, weil 7500 Punkte je Tier unnoetig sind: unter zwei Units
       * Abstand sieht man den Unterschied nicht.
       *
       * idx haelt zu jedem Punkt die Nummer der Stuetzstelle, damit beim
       * Zeichnen der Teil bis zum Abspielkopf gefunden werden kann.
       */
      trail: function (agentIndex) {
        if (rec._trails[agentIndex]) return rec._trails[agentIndex];
        var base = agentIndex * sampleCount;
        var xs = [], ys = [], idx = [], air = [];
        var last = rec.windowTo;
        var i;

        // Ein Nachzuegler steht vor seiner Ankunft auf 'abwesend' und traegt
        // dort seinen kuenftigen Startpunkt. Diese Stuetzstellen gehoeren
        // nicht in die Spur: sonst begaenne sie mit einem Punkt, an dem noch
        // gar kein Tier stand, und der Sprung dorthin waere als Linie zu
        // sehen. Die Abwesenheit liegt immer am Stueck am Anfang - ein Tier,
        // das da ist, verschwindet nicht wieder.
        var first = rec.windowFrom;
        while (first < last && rec.state[base + first] === ABSENT) first++;
        if (rec.state[base + first] === ABSENT) return (rec._trails[agentIndex] = pack([], [], [], []));

        var lastX = rec.x[base + first], lastY = rec.y[base + first];
        var lastAir = AIRBORNE[rec.state[base + first]] ? 1 : 0;
        xs.push(lastX); ys.push(lastY); idx.push(first); air.push(lastAir);

        for (i = first + 1; i <= last; i++) {
          var px = rec.x[base + i], py = rec.y[base + i];
          var a = AIRBORNE[rec.state[base + i]] ? 1 : 0;
          var far = (px - lastX) * (px - lastX) + (py - lastY) * (py - lastY) >
            TRAIL_MIN_GAP * TRAIL_MIN_GAP;
          // Der Wechsel Wasser <-> Flug muss erhalten bleiben, sonst laufen
          // Schwimmspur und Flugbahn ineinander.
          if (!far && a === lastAir && i !== last) continue;
          xs.push(px); ys.push(py); idx.push(i); air.push(a);
          lastX = px; lastY = py; lastAir = a;
        }

        rec._trails[agentIndex] = pack(xs, ys, idx, air);
        return rec._trails[agentIndex];
      },

      /**
       * Dieselbe Spur, aber nur so genau wie noetig: die groebste Stufe, deren
       * Abweichung unter tolerance (Weltunits) bleibt. Gebaut wird eine Stufe
       * erst, wenn sie gebraucht wird - beim Hineinzoomen kommt sonst Arbeit
       * fuer Ansichten dazu, die niemand aufruft.
       */
      trailAt: function (agentIndex, tolerance) {
        var level = rec.trailLevel(tolerance);
        if (level === 0) return rec.trail(agentIndex);
        var row = rec._lods[level] || (rec._lods[level] = []);
        if (!row[agentIndex]) {
          row[agentIndex] = simplify(rec.trail(agentIndex), TRAIL_LODS[level]);
        }
        return row[agentIndex];
      },

      /** Welche Stufe deckt diese Toleranz gerade noch ab? */
      trailLevel: function (tolerance) {
        var level = 0;
        for (var i = 1; i < TRAIL_LODS.length; i++) {
          if (TRAIL_LODS[i] <= tolerance) level = i;
        }
        return level;
      },

      /**
       * Anzahl Spurpunkte bis zu diesem Zeitpunkt (fuer das Zeichnen). Die
       * Stufe muss mitkommen: jede hat ihre eigene Punktfolge, und mit der
       * Laenge einer anderen zoege die Spur ins Leere.
       */
      trailLengthAt: function (agentIndex, time, tolerance) {
        var trail = tolerance ? rec.trailAt(agentIndex, tolerance) : rec.trail(agentIndex);
        var wanted = time / sampleSeconds;
        var lo = 0, hi = trail.count;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (trail.idx[mid] <= wanted) lo = mid + 1; else hi = mid;
        }
        return lo;
      },

      _lods: []
    };

    return rec;
  }

  function pack(xs, ys, idx, air) {
    return {
      count: xs.length,
      xs: new Float32Array(xs),
      ys: new Float32Array(ys),
      idx: new Int32Array(idx),
      air: new Uint8Array(air)
    };
  }

  /**
   * Douglas-Peucker: den Streckenzug so weit ausduennen, dass er nirgends
   * weiter als tolerance von der urspruenglichen Linie abweicht.
   *
   * Gemessen wird der *senkrechte* Abstand zur Sehne, nicht die Schrittlaenge -
   * darin liegt der ganze Gewinn: eine gerade Strecke braucht zwei Punkte,
   * egal wie lang sie ist, und die Fluege der Fledermaus sind gerade.
   *
   * Vereinfacht wird stueckweise zwischen den Wechseln Boden <-> Flug. Diese
   * Punkte bleiben immer stehen, sonst verschluckte eine gerade Sehne einen
   * kurzen Flug und Bodenspur und Flugbahn liefen ineinander.
   */
  function simplify(trail, tolerance) {
    var n = trail.count;
    if (n < 3) return trail;
    var keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;

    var runStart = 0;
    for (var i = 1; i < n; i++) {
      if (trail.air[i] === trail.air[i - 1] && i !== n - 1) continue;
      keep[i - 1] = 1;
      keep[i] = 1;
      reduce(trail, keep, runStart, i - 1, tolerance);
      runStart = i;
    }
    reduce(trail, keep, runStart, n - 1, tolerance);

    var xs = [], ys = [], idx = [], air = [];
    for (var k = 0; k < n; k++) {
      if (!keep[k]) continue;
      xs.push(trail.xs[k]); ys.push(trail.ys[k]);
      idx.push(trail.idx[k]); air.push(trail.air[k]);
    }
    return pack(xs, ys, idx, air);
  }

  /**
   * Der eigentliche Teile-und-herrsche-Schritt, mit eigenem Stapel statt
   * Rekursion: eine Spur hat bis zu 5000 Punkte, und die Aufteilung kann im
   * unguenstigen Fall genauso tief werden.
   */
  function reduce(trail, keep, from, to, tolerance) {
    if (to - from < 2) return;
    var stack = [from, to];
    var tol2 = tolerance * tolerance;
    while (stack.length) {
      var b = stack.pop();
      var a = stack.pop();
      if (b - a < 2) continue;
      var ax = trail.xs[a], ay = trail.ys[a];
      var ux = trail.xs[b] - ax, uy = trail.ys[b] - ay;
      var len2 = ux * ux + uy * uy;
      var best = -1, bestD = 0;
      for (var i = a + 1; i < b; i++) {
        var px = trail.xs[i] - ax, py = trail.ys[i] - ay;
        var d2;
        if (len2 === 0) {
          // Anfang und Ende fallen zusammen - das ist eine Schleife, und der
          // Abstand zaehlt dann zum Punkt selbst und nicht zu einer Sehne.
          d2 = px * px + py * py;
        } else {
          var t = (px * ux + py * uy) / len2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var qx = px - t * ux, qy = py - t * uy;
          d2 = qx * qx + qy * qy;
        }
        if (d2 > bestD) { bestD = d2; best = i; }
      }
      if (bestD <= tol2) continue;
      keep[best] = 1;
      stack.push(a, best, best, b);
    }
  }

  /** Steht das Tier still, gilt die letzte Richtung, in der es sich bewegt hat. */
  function headingFallback(rec, base, i0) {
    for (var back = i0; back > 0 && back > i0 - 40; back--) {
      var dx = rec.x[base + back] - rec.x[base + back - 1];
      var dy = rec.y[base + back] - rec.y[base + back - 1];
      if (dx * dx + dy * dy > 1e-4) return Math.atan2(dy, dx);
    }
    return 0;
  }

  WL.Recording = { create: create, TRAIL_MIN_GAP: TRAIL_MIN_GAP, TRAIL_LODS: TRAIL_LODS };
})(typeof window !== 'undefined' ? window : globalThis);
