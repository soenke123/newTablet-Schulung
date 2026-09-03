/**
 * Der Merkmalsvektor - das, was die Schuelerinnen und Schueler spaeter messen.
 *
 * Wird ab dem ersten Tier mitgeschrieben, damit fruehzeitig sichtbar ist, ob
 * sich die Arten ueberhaupt trennen lassen. Die sieben Merkmale stehen in
 * data/tiere.md, Abschnitt 6; die Reihenfolge hier ist dieselbe.
 *
 * Gerechnet wird ausschliesslich auf der fertigen Aufzeichnung, nicht waehrend
 * der Simulation. Das ist wichtig: die Merkmale sind damit genau das, was auch
 * ein Beobachter am Bildschirm haette ablesen koennen, und nicht ein Blick in
 * die inneren Variablen der Tiere.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;
  var ABSENT = WL.Agents.STATES.abwesend;

  var BIN = 40;           // Kantenlaenge der Aufenthaltsraster-Zelle in Units
  // Verkettungsabstand: knapp ueber der Diagonale zweier Bins (57 u), damit ein
  // zusammenhaengender Aufenthaltsbereich eine Kette bildet - aber weit unter
  // dem Mindestabstand zweier Gewaesser (240 u), damit zwei Teiche nicht
  // versehentlich zu einem Ort verschmelzen.
  var PLACE_LINK = 75;
  var PLACE_SHARE = 0.04;  // Mindestanteil der Zeit, damit ein Ort zaehlt
  // Zellen, die nur durchquert werden, muessen vor dem Verketten heraus -
  // sonst haengt eine Wegstrecke zwei Orte zu einem zusammen. Ein Aufenthalts-
  // bin haelt Prozente der Gesamtzeit, ein Durchgangsbin Bruchteile davon.
  var PLACE_MIN_DWELL = 0.004;

  /**
   * Den Merkmalsvektor messen - wahlweise nur ueber eine Phase.
   *
   * Gemessen wird immer *ein* Abschnitt, nie beide zusammen. Zwei Gruende:
   *
   * - Ein Nachzuegler ist vor dem Bruch gar nicht da. Ueber zehn Tage gemittelt
   *   haetten seine Werte fuenf Tage Nichts darin - er saehe im Vektor
   *   langsamer und ortstreuer aus, als er ist.
   * - Und die alten Arten sollen vergleichbar bleiben: ihre Werte vor dem
   *   Bruch sind genau die aus data/tiere.md §6, ihre Werte danach die neuen.
   *   Der Unterschied zwischen beiden ist das, was die neuen Tiere angerichtet
   *   haben - und damit die interessanteste Tabelle, die das Projekt bekommt.
   *
   * phase: 0 (vorher), 1 (nachher) oder null fuer die ganze Aufzeichnung.
   */
  function measure(sim, phase) {
    var rec = sim.recording;
    var world = sim.world;
    var agents = sim.agents;
    var n = agents.length;
    var samples = rec.sampleCount;
    var dt = rec.sampleSeconds;
    if (!n || samples < 2) return { agents: [], species: {} };

    var from = 0, to = samples - 1;
    if (phase != null) {
      var range = WL.SimTime.phaseSamples(phase);
      from = range.from;
      to = Math.min(samples - 1, range.to);
    }

    var perAgent = [];
    var i, k;

    for (i = 0; i < n; i++) perAgent.push(newRecord(agents[i], world, BIN));

    // Ein Durchgang ueber die Zeit: alles, was mehrere Tiere gleichzeitig
    // betrifft (Abstand zum naechsten Artgenossen), braucht diese Reihenfolge.
    var px = new Float64Array(n), py = new Float64Array(n);
    var prevHeading = new Float64Array(n);
    var hasHeading = new Uint8Array(n);
    var hasPrev = new Uint8Array(n);

    for (var s = from; s <= to; s++) {
      for (i = 0; i < n; i++) {
        var base = i * samples + s;
        var x = rec.x[base], y = rec.y[base];
        var r = perAgent[i];

        // Noch nicht da: keine Zeit, keine Strecke, kein Ort. Sonst zaehlte
        // die Abwesenheit als Aufenthalt an der Kartenecke (0,0).
        if (rec.state[base] === ABSENT) { hasPrev[i] = 0; continue; }
        r.time += dt;

        if (hasPrev[i]) {
          var dx = x - px[i], dy = y - py[i];
          var dist = Math.sqrt(dx * dx + dy * dy);
          r.distance += dist;
          if (isNight(s * dt)) r.nightDistance += dist;
          if (dist > 0.05) {
            var heading = Math.atan2(dy, dx);
            if (hasHeading[i]) r.turn += Math.abs(WL.Agents.angleDelta(prevHeading[i], heading));
            prevHeading[i] = heading;
            hasHeading[i] = 1;
            r.movingTime += dt;
          }
        }
        px[i] = x; py[i] = y;
        hasPrev[i] = 1;

        var terrain = world.query.terrainAt(x, y);
        if (terrain === T.GRASS) r.timeGrass += dt;
        else if (terrain === T.FOREST) r.timeForest += dt;
        else if (terrain === T.WATER) r.timeWater += dt;
        else if (terrain === T.GROUND) r.timeGround += dt;

        if (WL.Agents.AIRBORNE[rec.state[base]]) r.timeAir += dt;
        if (isNight(s * dt)) r.nightTime += dt;

        var key = Math.floor(x / BIN) + ',' + Math.floor(y / BIN);
        r.bins[key] = (r.bins[key] || 0) + dt;
      }

      // Abstand zum naechsten Artgenossen, alle 2 Sekunden abgetastet.
      if (n > 1 && s % 10 === 0) {
        for (i = 0; i < n; i++) {
          if (!hasPrev[i]) continue;
          var best = Infinity;
          for (k = 0; k < n; k++) {
            if (k === i || agents[k].speciesId !== agents[i].speciesId) continue;
            if (!hasPrev[k]) continue;
            var ddx = px[k] - px[i], ddy = py[k] - py[i];
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 < best) best = d2;
          }
          if (best < Infinity) {
            perAgent[i].neighbourSum += Math.sqrt(best);
            perAgent[i].neighbourCount++;
          }
        }
      }
    }

    var duration = (to - from) * dt;
    var out = [];
    // Gemessen wird gegen die Zeit, die *dieses Tier* da war, nicht gegen die
    // Laenge des Abschnitts. Fuer alle Arten des Startbestands ist das
    // dasselbe; fuer einen Nachzuegler in Phase 0 waere es eine Division durch
    // fuenf Tage Abwesenheit.
    for (i = 0; i < n; i++) out.push(finish(perAgent[i], agents[i], perAgent[i].time || duration));

    return { agents: out, species: aggregate(out), duration: duration };
  }

  function isNight(time) {
    return WL.SimTime.isNight(time);
  }

  function newRecord(agent, world, bin) {
    return {
      agent: agent,
      bins: {},
      time: 0,          // wie lange dieses Tier im gemessenen Abschnitt da war
      distance: 0,
      nightDistance: 0,
      nightTime: 0,
      movingTime: 0,
      turn: 0,
      timeGrass: 0,
      timeForest: 0,
      timeWater: 0,
      timeGround: 0,
      timeAir: 0,
      neighbourSum: 0,
      neighbourCount: 0
    };
  }

  function finish(r, agent, duration) {
    var binArea = BIN * BIN;
    var cells = [];
    var totalTime = 0;
    for (var key in r.bins) {
      var parts = key.split(',');
      cells.push({
        x: (Number(parts[0]) + 0.5) * BIN,
        y: (Number(parts[1]) + 0.5) * BIN,
        time: r.bins[key]
      });
      totalTime += r.bins[key];
    }
    cells.sort(function (a, b) { return b.time - a.time; });

    return {
      index: agent.index,
      species: agent.speciesId,
      name: WL.SPECIES[agent.speciesId].name,

      // War das Tier in diesem Abschnitt ueberhaupt da? Ein Nachzuegler vor
      // dem Bruch ist es nicht - seine Zeile bleibt stehen (die Nummern
      // duerfen sich nicht verschieben), zaehlt aber nirgends mit.
      present: r.time > 0,
      presentTime: r.time,

      // 1 Anteil der Aktivitaet bei Nacht
      nightActivity: r.distance > 0 ? r.nightDistance / r.distance : 0,
      // 2 Anteil der Zeit auf Gras / im Wald / am oder im Wasser
      shareGrass: r.timeGrass / duration,
      shareForest: r.timeForest / duration,
      shareWater: r.timeWater / duration,
      shareGround: r.timeGround / duration,
      shareAir: r.timeAir / duration,
      // 3 mittleres Tempo und Bewegungsunruhe (Richtungswechsel pro Sekunde)
      meanSpeed: r.distance / duration,
      movingSpeed: r.movingTime > 0 ? r.distance / r.movingTime : 0,
      restlessness: r.movingTime > 0 ? r.turn / r.movingTime : 0,
      // 4 Groesse des genutzten Gebiets
      areaUsed: cells.length * BIN * BIN,
      // 5 typischer Abstand zum naechsten Artgenossen
      neighbourDistance: r.neighbourCount ? r.neighbourSum / r.neighbourCount : null,
      // 6 Nahrungsart
      food: WL.SPECIES[agent.speciesId].food,
      // 7 Anzahl regelmaessig besuchter fester Orte
      places: countPlaces(cells, totalTime),

      travelled: r.distance,
      waterChanges: agent.waterChanges || 0,
      drinks: agent.drinks || 0,
      wallows: agent.wallows || 0,
      hides: agent.hides || 0
    };
  }

  /**
   * Feste Orte: die besuchten Rasterzellen werden zu zusammenhaengenden
   * Gebieten verkettet, und was danach mindestens 4 % der Zeit haelt, zaehlt
   * als Ort.
   *
   * Verkettet wird ueber die Nachbarschaft (Einzelverkettung), nicht ueber den
   * Abstand zum Schwerpunkt. Der Unterschied ist wesentlich: ein grosser Teich
   * ist breiter als jeder sinnvolle Schwerpunktradius und wuerde sonst in zwei
   * Orte zerfallen, waehrend zwei Teiche mit Wiese dazwischen keine Kette
   * bilden koennen - dort fehlen schlicht die Zellen.
   */
  function countPlaces(cells, totalTime) {
    var places = [];
    var i, p, m;

    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.time / totalTime < PLACE_MIN_DWELL) continue;
      var hits = [];
      for (p = 0; p < places.length; p++) {
        if (touches(places[p], c)) hits.push(p);
      }
      if (!hits.length) {
        places.push({ points: [c], time: c.time });
        continue;
      }
      var target = places[hits[0]];
      target.points.push(c);
      target.time += c.time;
      // Die Zelle kann zwei bisher getrennte Gebiete verbinden.
      for (m = hits.length - 1; m >= 1; m--) {
        var other = places[hits[m]];
        target.points = target.points.concat(other.points);
        target.time += other.time;
        places.splice(hits[m], 1);
      }
    }

    var count = 0;
    for (i = 0; i < places.length; i++) {
      if (places[i].time / totalTime >= PLACE_SHARE) count++;
    }
    return count;
  }

  function touches(place, cell) {
    for (var i = 0; i < place.points.length; i++) {
      var dx = place.points[i].x - cell.x;
      var dy = place.points[i].y - cell.y;
      if (dx * dx + dy * dy < PLACE_LINK * PLACE_LINK) return true;
    }
    return false;
  }

  /** Mittelwerte je Art - der Punkt, an dem sich Arten trennen muessen. */
  function aggregate(records) {
    // shareGround gehoert seit dem ersten Landtier dazu: fuer Wassertiere war
    // es immer 0, fuer ein Reh am Ufer oder auf offenem Boden nicht.
    var keys = ['nightActivity', 'shareGrass', 'shareForest', 'shareWater', 'shareGround', 'shareAir',
      'meanSpeed', 'movingSpeed', 'restlessness', 'areaUsed', 'neighbourDistance',
      'places', 'waterChanges', 'drinks', 'wallows', 'hides'];
    var groups = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      // Ein Tier, das in diesem Abschnitt gar nicht da war, gehoert nicht ins
      // Artmittel. Es traegt sonst lauter Nullen bei und zieht die ganze Art
      // herunter - das erste, was der Nachzuegler kaputtgemacht hat: zwei noch
      // nicht angekommene Rehe druecken den Grasanteil der Art von 60 auf 36 %
      // und loesen einen Verstoss aus, ohne dass ein einziges Reh anders
      // gelaufen waere.
      if (!r.present) continue;
      var g = groups[r.species] || (groups[r.species] = { count: 0, name: r.name, food: r.food });
      g.count++;
      for (var k = 0; k < keys.length; k++) {
        var v = r[keys[k]];
        if (v == null) continue;
        g[keys[k]] = (g[keys[k]] || 0) + v;
        g['_n_' + keys[k]] = (g['_n_' + keys[k]] || 0) + 1;
      }
    }
    for (var species in groups) {
      for (var j = 0; j < keys.length; j++) {
        var n = groups[species]['_n_' + keys[j]];
        if (n) groups[species][keys[j]] /= n;
        delete groups[species]['_n_' + keys[j]];
      }
    }
    return groups;
  }

  WL.Tracker = { measure: measure };
})(typeof window !== 'undefined' ? window : globalThis);
