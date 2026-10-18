/**
 * Verhalten, einmal pro Tick und Gruppe.
 *
 * Entschieden wird auf Ebene der Gruppe (Herde, Schwarm, Rudel, Paar): wohin,
 * fliehen, trinken, fressen, jagen. Die einzelnen Tiere folgen dem Anker der
 * Gruppe mit eigenem Versatz (siehe Simulation.moveMembers). Das ist
 * realistischer als lauter Einzelgaenger und guenstig zu rechnen.
 *
 * Ein Verhalten fuer alle Arten - die Unterschiede stehen in BT.SPECIES.
 *
 * Zustaende:
 *   Pflanzenfresser  fressen · fliehen · trinken · brueten · meiden
 *   Raeuber          streifen · jagen · ruhen · trinken · wandern (ohne Revier)
 *                    heimflug (Greifvogel bringt Beute zum Horst) · meiden
 *
 * Meiden: Wo Menschen stoeren (sim.humans, mal spec.scheu), zieht die Gruppe
 * weg vom naechsten Haus und sucht dort weder Futter noch Beute.
 *
 * Horst (spec.horst): Tiere im Horst (Brutvogel, Kueken) bleiben dort, der
 * Anker der Gruppe sind die jagenden Eltern. Jede Beute wird zum Horst
 * gebracht und dort verteilt.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  // Deckung: so viel schlechter werden Beutetiere hier entdeckt und erwischt
  var COVER = new Array(BT.BIOME_INFO.length).fill(0);   // Erde, Dorf, Wiese: keine Deckung
  COVER[B.FERN] = 0.5; COVER[B.MOSS] = 0.6; COVER[B.SCRUB] = 0.35; COVER[B.SWAMP] = 0.25;

  // So viele Tage kostet es, eine seltene Beute vergeblich zu suchen
  var SEARCH_DAYS = 1;

  // Suchbild (look, interest):
  //   memoryDays: ueber so viele Tage mittelt ein Raeuber, wie viel Beute er zu sehen bekommt
  //   desperate:  unter dieser Energie (Mittel der Gruppe) zaehlt das Suchbild bei der Wahl der
  //               Beute immer weniger, bei der zweiten gar nicht mehr - dann wird jede Beute in
  //               Sicht gejagt
  //   skill:      so stark sinkt der Jagderfolg ohne Suchbild (1: mal Suchbild, 0: gar nicht)
  var SEARCH = BT.SEARCH = { memoryDays: 20, desperate: [0.5, 0.25], skill: 1 };

  // Pflanzenfresser ziehen weiter, wenn die Weide unter diesen Anteil ihrer
  // vollen Menge abgefressen ist (knapp ueber der Schwelle der Ueberweidung)
  var MOVE_ON = 0.35;

  // So nah muss ein Rudel an seinem Riss sein, um ihn gegen Greifvoegel zu verteidigen
  var GUARD = 80;

  function dist(a, b) { return BT.M.hypot(a.x - b.x, a.y - b.y); }

  function avg(members, key) {
    var s = 0;
    for (var i = 0; i < members.length; i++) s += members[i][key];
    return members.length ? s / members.length : 0;
  }

  function maxOf(members, key) {
    var m = 0;
    for (var i = 0; i < members.length; i++) if (members[i][key] > m) m = members[i][key];
    return m;
  }

  // ------------------------------------------------------------ gemeinsame Teile

  /** Schritt der Gruppe; Weidezaeune halten auf (sim.humans.barrier). */
  function go(sim, spec, g, tx, ty, sp) {
    return BT.Move.stepToward(sim.world, spec, g, tx, ty, sp, sim.humans.barrier(g, g.x, g.y));
  }

  function away(sim, spec, g, fx, fy, sp) {
    return BT.Move.stepAway(sim.world, spec, g, fx, fy, sp, sim.humans.barrier(g, g.x, g.y));
  }

  /** Liegt der Punkt fuer diese Art hinter einem Weidezaun? */
  function fencedFor(sim, spec, x, y) {
    return !!sim.humans.fence && !(spec && spec.flies) && sim.humans.fenced(x, y);
  }

  /** Durst: zum Wasser gehen, am Wasser trinken. true, solange damit beschaeftigt. */
  function handleThirst(sim, g, speed) {
    var spec = g.spec;
    if (!spec.thirstDays) return false;
    if (g.state !== 'trinken' && maxOf(g.members, 'thirst') < 0.45) return false;
    g.state = 'trinken';
    if (BT.Move.atWater(sim.world, g.x, g.y, sim.humans.waterDist)) {
      for (var i = 0; i < g.members.length; i++) g.members[i].thirst = 0;
      g.state = spec.role === 'predator' ? 'streifen' : 'fressen';
      g.tx = null;
      return false;
    }
    var wp = BT.Move.waterWaypoint(sim.world, g.x, g.y, 10, sim.humans.waterDist);
    if (!wp) { for (i = 0; i < g.members.length; i++) g.members[i].thirst = 0; return false; }
    go(sim, spec, g, wp.x, wp.y, speed * 2.5);
    return true;
  }

  /**
   * Menschen meiden: Liegt die Gruppe in gestoerter Gegend, zieht sie vom
   * naechsten Haus weg. Durst geht vor (das Wasser kann im Dorf liegen).
   * true, solange damit beschaeftigt.
   */
  function avoidPeople(sim, g) {
    var H = sim.humans;
    if (!H.active || !g.spec.scheu || g.nest || g.horst) return false;
    if (!H.avoids(g.spec, g.x, g.y)) return false;
    if (g.spec.thirstDays && maxOf(g.members, 'thirst') > 0.75) return false;
    var h = H.nearestHouse(g.x, g.y);
    var sp = g.spec.speed * 2;
    g.state = 'meiden';
    g.tx = null;
    away(sim, g.spec, g, h.x, h.y, sp);
    g.speedNow = sp;
    return true;
  }

  /** Zufaelliger erreichbarer Punkt im Umkreis. */
  function randomPointNear(sim, spec, x, y, radius) {
    for (var t = 0; t < 12; t++) {
      var a = sim.rng.range(0, Math.PI * 2);
      var r = radius * Math.sqrt(sim.rng.next());
      var px = x + BT.M.cos(a) * r, py = y + BT.M.sin(a) * r;
      if (!BT.Move.blockedAt(sim.world, spec, px, py) && !fencedFor(sim, spec, px, py)) return { x: px, y: py };
    }
    return { x: x, y: y };
  }

  /**
   * Weit weg ziehen (spec, ausgebuechst oder Herde geteilt): g.runaway = { x, y,
   * ticks, join }. Die Gruppe laeuft zuegig zum Ziel und sucht erst dort
   * Futter bzw. ein Revier; mit `join` schliesst sie sich dort dieser Gruppe an
   * (so viele, wie Platz haben). true, solange damit beschaeftigt.
   */
  var RUNAWAY_HUNGRY = 0.6;

  function runAway(sim, g) {
    var r = g.runaway;
    if (!r) return false;
    var j = r.join && r.join.members.length ? r.join : null;
    var tx = j ? j.x : r.x, ty = j ? j.y : r.y;
    // Ausreisser, die unterwegs hungrig werden, bleiben, wo sie sind, und suchen Futter
    var hungry = false;
    if (r.state === 'ausgebuechst') {
      var e = 0;
      for (var m = 0; m < g.members.length; m++) e += g.members[m].energy;
      hungry = e < g.members.length * RUNAWAY_HUNGRY;
    }
    if (BT.M.hypot(tx - g.x, ty - g.y) < 30 || r.ticks-- <= 0 || hungry) {
      if (j && BT.M.hypot(j.x - g.x, j.y - g.y) < 120) sim.joinGroup(g, j);
      g.runaway = null;
      g.tx = null;
      g.state = g.spec.role === 'predator' ? (g.home ? 'streifen' : 'wandern') : 'fressen';
      return false;
    }
    var sp = g.spec.speed * 2.5;
    g.state = r.state || 'weiterziehen';
    go(sim, g.spec, g, tx, ty, sp);
    g.speedNow = sp;
    return true;
  }

  /**
   * Ziel fuer eine Gruppe, die weit weg zieht: von einigen Punkten im Abstand
   * dmin..dmax von `from` der mit dem besten Lebensraum (Pflanzenfresser: und
   * dem meisten Futter), nah am Wasser, nicht hinter Zaeunen und nicht bei den Menschen.
   */
  function farPoint(sim, spec, from, dmin, dmax) {
    var f = sim.fields, best = null, bestScore = -Infinity;
    for (var t = 0; t < 16; t++) {
      var a = sim.humans.rng.range(0, Math.PI * 2), r = sim.humans.rng.range(dmin, dmax);
      var px = from.x + BT.M.cos(a) * r, py = from.y + BT.M.sin(a) * r;
      if (BT.Move.blockedAt(sim.world, spec, px, py) || fencedFor(sim, spec, px, py)) continue;
      var pref = spec.habitat[sim.biomeAt(px, py)];
      if (pref <= 0 || sim.humans.avoids(spec, px, py)) continue;
      var score = pref + (spec.diet && spec.role !== 'predator' ? f.energyAt(f.index(px, py), spec.diet) * pref : 0);
      // nicht zu weit vom Wasser
      score -= Math.max(0, sim.world.query.freshWaterDistance(px, py) - 120) * 0.004;
      if (score > bestScore) { bestScore = score; best = { x: px, y: py }; }
    }
    return best;
  }

  // ------------------------------------------------------------ Pflanzenfresser

  function nearestThreat(sim, g) {
    var spec = g.spec;
    // Mehr Augen sehen mehr: Wachsamkeit waechst mit der Gruppe
    var vision = spec.vision * Math.min(1.5, 1 + 0.05 * (g.members.length - 1));
    var best = null, bestD = vision;
    var preds = sim.predatorGroups;
    for (var i = 0; i < preds.length; i++) {
      var p = preds[i];
      if (!p.members.length || !p.spec.prey[spec.id]) continue;
      // Inselzahm: vor fremden Raeubern (z. B. Hunden) flieht die Art nicht
      if (p.spec.unknownTo && p.spec.unknownTo.indexOf(spec.id) >= 0) continue;
      var d = dist(g, p);
      // Geflohen wird vor einem Raeuber, der genau diese Gruppe jagt, und vor
      // streifenden Landraeubern aus kurzer Distanz. Ruhende und
      // kreisende Greifvoegel ohne Jagdabsicht werden geduldet.
      var hunting = p.state === 'jagen' && p.prey === g;
      if (!hunting && (p.spec.flies || p.state === 'ruhen' || d > vision * 0.3)) continue;
      if (d < bestD) { bestD = d; best = p; }
    }
    // Jaeger (sim.humans.hunters): scheue Arten fliehen, wenn einer nah ist
    var H = sim.humans, J = BT.HUMANS.hunt;
    if (H.hunters.length && spec.scheu >= J.flee) {
      var near = Math.min(bestD, spec.vision * J.notice);
      for (i = 0; i < H.hunters.length; i++) {
        var h = H.hunters[i];
        if (h.state === 'daheim') continue;
        d = dist(g, h);
        if (d < near) { near = d; best = h; }
      }
    }
    return best;
  }

  function chooseForageTarget(sim, g, cx, cy, radius) {
    var spec = g.spec, f = sim.fields, w = sim.world;
    var winter = sim.calendar.season === 3;
    var best = null, bestScore = -Infinity;
    for (var t = 0; t < 10; t++) {
      var a = sim.rng.range(0, Math.PI * 2);
      var r = radius * Math.sqrt(sim.rng.next());
      var px = cx + BT.M.cos(a) * r, py = cy + BT.M.sin(a) * r;
      if (BT.Move.blockedAt(w, spec, px, py) || fencedFor(sim, spec, px, py)) continue;
      var b = sim.biomeAt(px, py);
      var pref = spec.habitat[b];
      if (pref <= 0) continue;
      if (sim.humans.avoids(spec, px, py)) continue;
      var food = f.energyAt(f.index(px, py), spec.diet);
      var score = food * pref - BT.M.hypot(px - g.x, py - g.y) * 0.0015;
      // Im Winter sind die Thermalfelder warm: dort kostet die Kaelte weniger
      if (winter && b === B.THERMAL) score += 0.25;
      if (score > bestScore) { bestScore = score; best = { x: px, y: py }; }
    }
    // Aecker kennt man: Wer Getreide frisst, prueft auch die Aecker in der Naehe
    var fields = sim.humans.fields;
    if (fields.length && spec.diet.korn) {
      for (var k = 0; k < fields.length; k++) {
        var fl = fields[k];
        if (BT.M.hypot(fl.x - cx, fl.y - cy) > radius * 1.5) continue;
        a = sim.rng.range(0, Math.PI * 2);
        r = BT.HUMANS.field.radius * 0.7 * Math.sqrt(sim.rng.next());
        px = fl.x + BT.M.cos(a) * r; py = fl.y + BT.M.sin(a) * r;
        if (BT.Move.blockedAt(w, spec, px, py) || sim.humans.avoids(spec, px, py) || fencedFor(sim, spec, px, py)) continue;
        score = f.energyAt(f.index(px, py), spec.diet) * spec.habitat[sim.biomeAt(px, py)] - BT.M.hypot(px - g.x, py - g.y) * 0.0015;
        if (score > bestScore) { bestScore = score; best = { x: px, y: py }; }
      }
    }
    return best;
  }

  /** Wegpunkt zum Wasser waehrend der Flucht, oder null (siehe spec.fleeToWater). */
  function waterInFlight(sim, g, limits) {
    var thirst = maxOf(g.members, 'thirst');
    if (thirst <= limits[0]) return null;
    var wp = BT.Move.waterWaypoint(sim.world, g.x, g.y, 10, sim.humans.waterDist);
    if (!wp) return null;
    var wx = wp.x - g.x, wy = wp.y - g.y, ax = g.x - g.fleeFrom.x, ay = g.y - g.fleeFrom.y;
    var len = Math.sqrt((wx * wx + wy * wy) * (ax * ax + ay * ay));
    var cos = len > 0 ? (wx * ax + wy * ay) / len : 1;
    return cos > (thirst > limits[1] ? -0.7 : 0) ? wp : null;
  }

  function herbivore(sim, g) {
    var spec = g.spec;

    // 1. Gefahr. Verzweifelt durstig (spec.fleeToWater[1]) flieht die Gruppe nur noch
    // vor Raeubern ganz in der Naehe und geht sonst zum Wasser
    var threat = nearestThreat(sim, g);
    var desperate = spec.fleeToWater && maxOf(g.members, 'thirst') > spec.fleeToWater[1];
    if (threat && desperate && dist(g, threat) > 60) {
      threat = null;
      if (g.state === 'fliehen') { g.state = 'fressen'; g.fleeTicks = 0; }
    }
    if (threat) {
      if (g.state !== 'fliehen') g.fleeTicks = 0;
      g.state = 'fliehen';
      g.fleeFrom = { x: threat.x, y: threat.y };
      g.stateTicks = 4;
    }
    if (g.state === 'fliehen') {
      if (g.stateTicks-- <= 0) { g.state = 'fressen'; g.tx = null; g.fleeTicks = 0; }
      else {
        // Ausdauer: nach einem kurzen Sprint nur noch Trab
        g.fleeTicks = (g.fleeTicks || 0) + 1;
        var fs = g.fleeTicks <= spec.sprintTicks ? spec.fleeSpeed : spec.fleeSpeed * 0.55;
        // Durstig: zum Wasser fliehen (spec.fleeToWater = [durstig, verzweifelt]). Durstig nur,
        // wenn das Wasser vom Raeuber weg liegt; verzweifelt, solange es nicht direkt auf ihn zu liegt
        var wp = spec.fleeToWater ? waterInFlight(sim, g, spec.fleeToWater) : null;
        if (wp) go(sim, spec, g, wp.x, wp.y, fs);
        else away(sim, spec, g, g.fleeFrom.x, g.fleeFrom.y, fs);
        g.speedNow = fs;
        return;
      }
    }

    // 2. Menschen meiden
    if (avoidPeople(sim, g)) return;

    // 3. Durst
    if (handleThirst(sim, g, spec.speed)) { g.speedNow = spec.speed * 2.5; return; }

    // 4. Weit weg ziehen (ausgebuechst, Herde geteilt)
    if (runAway(sim, g)) return;

    // 5. Fressen (beim Brueten nur rund ums Nest)
    g.state = g.nest ? 'brueten' : 'fressen';
    var cx = g.nest ? g.nest.x : g.x, cy = g.nest ? g.nest.y : g.y;
    var radius = g.nest ? 50 : spec.searchRadius;
    var fi = sim.fields.index(g.x, g.y);
    var here = sim.fields.energyAt(fi, spec.diet);
    // Weiterziehen, bevor die Weide unter die Schwelle der Ueberweidung faellt
    // (Anteil MOVE_ON dessen, was sie voll traegt) oder kaum noch etwas bietet
    var poor = here < Math.max(0.4, MOVE_ON * sim.fields.fullEnergyAt(fi, spec.diet));
    var reached = g.tx !== null && BT.M.hypot(g.tx - g.x, g.ty - g.y) < 12;
    if (g.tx === null || (reached && poor) || g.stateTicks-- <= 0) {
      var target = chooseForageTarget(sim, g, cx, cy, radius);
      if (target) { g.tx = target.x; g.ty = target.y; }
      else { g.tx = g.x; g.ty = g.y; }
      g.stateTicks = 18;
    }
    // Auf abgeweideter Flaeche zuegig weiterziehen, am Futterplatz langsam grasen
    var sp = poor && !g.nest ? spec.speed * 2.5 : spec.speed;
    go(sim, spec, g, g.tx, g.ty, sp);
    g.speedNow = sp;
    g.grazing = true;
  }

  // ------------------------------------------------------------ Raeuber

  /** Sitzt dieses Tier im Horst (Brutvogel oder Kueken)? */
  function inHorst(g, a) {
    var h = g.horst;
    return !!h && (a.chick || (h.phase === 'brut' && a.id === h.sitter));
  }

  /**
   * Ab welcher Energie gejagt wird: Wer Junge versorgt, jagt mehr - am Horst
   * fast ununterbrochen, im Rudel mit Welpen frueher als sonst.
   */
  function hungerThreshold(g) {
    var spec = g.spec;
    if (g.horst) return spec.horst.hungry;
    var r = spec.rearing;
    if (r) for (var i = 0; i < g.members.length; i++) if (g.members[i].age < r.age) return r.hungry;
    return spec.hungry;
  }

  /** Mittelpunkt und Radius, in dem die Gruppe jagt und streift (null: ohne Revier). */
  function huntArea(g) {
    if (g.horst) return { x: g.horst.x, y: g.horst.y, r: g.spec.horst.radius };
    if (g.home) return { x: g.home.x, y: g.home.y, r: g.spec.territory };
    return null;
  }

  function eligibleVictims(pred, preyGroup) {
    var maxAge = pred.spec.preyMaxAge && pred.spec.preyMaxAge[preyGroup.spec.id];
    if (!maxAge) return preyGroup.members;
    return preyGroup.members.filter(function (m) { return m.age <= maxAge; });
  }

  /**
   * Liegt der Punkt in einem fremden Revier, aus dem der Wanderer vertrieben
   * wird? Woelfe verteidigen das ganze Revier. Adler dulden junge Artgenossen
   * ohne Revier (spec.floater) und vertreiben sie nur aus der Naehe des Horsts.
   * Reviere einer ueberlegenen Art (spec.dominates, Hunde ueber Woelfe) zaehlen mit.
   */
  function insideForeignTerritory(sim, g, x, y) {
    var spec = g.spec;
    var r = spec.floater ? spec.floater.core : spec.territory;
    for (var i = 0; i < sim.predatorGroups.length; i++) {
      var o = sim.predatorGroups[i];
      if (o === g || !BT.claims(o.spec, spec) || !o.home || !o.members.length) continue;
      var c = o.horst || o.home;
      if (BT.M.hypot(c.x - x, c.y - y) < r) return true;
    }
    return false;
  }

  /**
   * Suchbild (Holling Typ III): Einmal am Tag zaehlt der Raeuber, wie viele Tiere jeder
   * Beuteart er im Blick hat (Deckung verbirgt sie), und mittelt ueber die letzten Wochen
   * (g.seen: Tiere je 100 x 100 Sichtflaeche). Er kennt nur, was er selbst sieht, nicht den
   * Bestand der Insel. Gezaehlt wird die ganze Gruppe, auch wenn er nur Jungtiere nimmt (Adler):
   * Wo Herden sind, gibt es auch Kaelber.
   */
  function look(sim, g) {
    var spec = g.spec, count = {}, id;
    var seen = g.seen || (g.seen = {});
    for (id in spec.prey) count[id] = 0;
    for (var i = 0; i < sim.herbivoreGroups.length; i++) {
      var p = sim.herbivoreGroups[i];
      if (!(p.spec.id in count) || !p.members.length) continue;
      var vision = spec.vision * (1 - COVER[sim.biomeAt(p.x, p.y)] * (spec.flies ? 1.3 : 0.6));
      if (vision > 0 && dist(g, p) <= vision) count[p.spec.id] += p.members.length;
    }
    var area = spec.vision * spec.vision * 3.14159 / 10000;
    for (id in count) {
      var d = count[id] / area;
      seen[id] = seen[id] == null ? d : seen[id] + (d - seen[id]) / SEARCH.memoryDays;
    }
  }

  /**
   * Wie gefragt ist diese Beute (0..1)? Sieht der Raeuber weniger als prey.scarce Tiere je
   * 100 x 100, halb so sehr, bei sehr wenigen kaum noch: Er hat kein Suchbild mehr fuer sie.
   * Je hungriger er ist, desto weniger zaehlt das (SEARCH.desperate): Ausgehungert jagt er alles,
   * was er sieht.
   */
  function interest(g, id, energy) {
    var s = g.seen && g.seen[id], h = BT.SPECIES[id].scarce;
    if (s == null || !h) return 1;
    var i = s * s / (s * s + h * h);
    var D = SEARCH.desperate;
    var need = Math.max(0, Math.min(1, (D[0] - energy) / (D[0] - D[1])));
    return i + (1 - i) * need;
  }

  function findPrey(sim, g, energy) {
    var spec = g.spec, w = sim.world;
    var best = null, bestScore = 0, bestWeight = 0;
    var groups = sim.herbivoreGroups;
    for (var i = 0; i < groups.length; i++) {
      var p = groups[i];
      var weight = spec.prey[p.spec.id];
      if (!weight || !p.members.length) continue;
      weight *= interest(g, p.spec.id, energy);
      if (weight < 0.12) continue;      // sehr seltene Beute lohnt die Suche nicht
      var cover = COVER[sim.biomeAt(p.x, p.y)];
      var vision = spec.vision * (1 - cover * (spec.flies ? 1.3 : 0.6));
      if (vision <= 0) continue;
      var d = dist(g, p);
      if (d > vision) continue;
      // Der Revierbesitzer jagt im eigenen Revier; Wanderer ohne Revier werden
      // aus fremden Revieren vertrieben und jagen nur dazwischen
      // Am Horst nur in dessen Umkreis
      if (g.horst && BT.M.hypot(p.x - g.horst.x, p.y - g.horst.y) > spec.horst.radius) continue;
      if (g.home && BT.M.hypot(p.x - g.home.x, p.y - g.home.y) > spec.territory * 1.4) continue;
      if (!g.home && insideForeignTerritory(sim, g, p.x, p.y)) continue;
      if (!eligibleVictims(g, p).length) continue;
      if (sim.humans.avoids(spec, p.x, p.y)) continue;
      var score = weight * (1 - d / vision);
      if (score > bestScore) { bestScore = score; best = p; bestWeight = weight; }
    }
    // Seltene Beute wird nicht nur seltener gewaehlt, sondern auch seltener
    // verfolgt (Holling Typ III): die Raeuber hungern, bevor die Beute verschwindet.
    // Die vergebliche Suche kostet Zeit - sonst wuerde der Raeuber es einfach im
    // naechsten Tick wieder versuchen, und die Seltenheit braechte nichts.
    if (best && !sim.rng.chance(Math.min(1, bestWeight / spec.prey[best.spec.id]))) {
      g.cooldown = sim.ticksPerDay * SEARCH_DAYS;
      return null;
    }
    return best;
  }

  function attack(sim, g, prey) {
    var spec = g.spec;
    var victims = eligibleVictims(g, prey);
    if (!victims.length) return false;
    var hunters = 0;
    for (var i = 0; i < g.members.length; i++) {
      var h = g.members[i];
      if (h.age >= spec.maturity * 0.6 && !inHorst(g, h)) hunters++;
    }
    hunters = Math.max(1, Math.min(hunters, 5));
    var p = 1 - BT.M.pow(1 - spec.huntChance, hunters);
    if (g.horst) p = Math.min(1, p * spec.horst.huntBonus);
    // Junge Wanderer sind ungeuebt und erwischen seltener etwas
    if (spec.floater && !g.home && maxOf(g.members, 'age') < spec.maturity) p *= spec.floater.skill;
    p *= 1 - COVER[sim.biomeAt(prey.x, prey.y)] * (spec.flies ? 0.9 : 0.4);
    var watch = prey.spec.vigilance != null ? prey.spec.vigilance : 0.03;
    p /= 1 + watch * (prey.members.length - 1);          // Wachsamkeit der Gruppe
    // Konkurrenz: Jagen viele Artgenossen in der Naehe, wird die Beute frueher
    // gewarnt und Beute streitig gemacht - der Jagderfolg sinkt
    var crowd = spec.crowding;
    if (crowd) {
      var near = 0;
      for (i = 0; i < sim.predatorGroups.length; i++) {
        var o = sim.predatorGroups[i];
        if (o !== g && o.spec === spec && o.members.length && BT.M.hypot(o.x - prey.x, o.y - prey.y) < crowd.radius) near++;
      }
      p /= 1 + crowd.k * near;
    }
    // Gut genaehrte Beute entkommt leichter, ausgehungerte kaum: Raeuber
    // haben es leicht, wenn die Pflanzenfresser ihre Weiden kahl gefressen haben
    p *= 1.1 - 0.3 * avg(victims, 'energy');
    p *= prey.spec.easyPrey || 1;                       // leichte Beute (Haustiere)
    // Ohne Suchbild (lange kaum gesehen) misslingt die Jagd oefter: Uebrig sind die
    // vorsichtigsten Tiere, und dem Raeuber fehlt die Uebung
    p *= 1 - SEARCH.skill * (1 - interest(g, prey.spec.id, 1));
    if (!sim.rng.chance(p)) return false;

    // Opfer: bevorzugt Jungtiere und geschwaechte Tiere
    var totalW = 0, weights = [];
    for (i = 0; i < victims.length; i++) {
      var v = victims[i];
      var wgt = (v.age < v.spec.maturity ? 3 : 1) * (v.energy < 0.3 ? 2 : 1) * (v.age > v.spec.maxAge * 0.8 ? 2 : 1);
      weights.push(wgt); totalW += wgt;
    }
    var pick = sim.rng.next() * totalW, victim = victims[victims.length - 1];
    for (i = 0; i < victims.length; i++) { pick -= weights[i]; if (pick <= 0) { victim = victims[i]; break; } }

    var meat = victim.spec.meat * (victim.age < victim.spec.maturity ? 0.5 : 1);
    var vx = victim.x, vy = victim.y;
    sim.kill(victim, spec.id);
    // Am Horst wird die Beute heimgebracht und dort verteilt
    if (g.horst) { g.carry = (g.carry || 0) + meat; return true; }
    var rest = sim.feed(g, meat);
    var left = sim.addCarcass(vx, vy, rest * 0.8);     // Reste fuer Aasfresser
    if (left && !spec.flies) g.carcass = left;         // das Rudel bleibt am Riss (stayAtCarcass)
    g.ateTick = sim.tick;                   // nur fuers Bild: die Tiere fressen an der Beute
    return true;
  }

  /**
   * Revierkenntnis: hungrige Raeuber ziehen dorthin, wo sich Beute aufhaelt
   * (einige Kandidaten im Revier, der mit der meisten Beute in der Naehe gewinnt).
   */
  function preyRichPoint(sim, g, c, r) {
    var spec = g.spec;
    // -Infinity: auch wenn alle Kandidaten im Dorf liegen, gibt es ein Ziel
    var best = null, bestScore = -Infinity;
    for (var t = 0; t < 6; t++) {
      var p = randomPointNear(sim, spec, c.x, c.y, r);
      var score = sim.rng.next() * 0.5;
      if (sim.humans.avoids(spec, p.x, p.y)) score -= 100;
      for (var i = 0; i < sim.herbivoreGroups.length; i++) {
        var h = sim.herbivoreGroups[i];
        var w = spec.prey[h.spec.id];
        if (!w || !h.members.length) continue;
        var d = BT.M.hypot(h.x - p.x, h.y - p.y);
        if (d < 220) score += w * h.members.length * (1 - d / 220);
      }
      // Ratten (eco/rats.js): eine Gegend mit vielen Ratten lohnt auch
      var R = sim.rats.total && BT.RATS.eatenBy[spec.id];
      if (R) { var rd = sim.rats.at(p.x, p.y); score += R.lure * rd / (rd + R.half); }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /**
   * Wanderer ohne Revier suchen einen Partner: Ziel ist die naechste Gruppe
   * der eigenen Art, der genau das eigene Geschlecht fehlt. Wanderer desselben
   * Geschlechts suchen sich nicht gegenseitig - sonst folgen sich zwei junge
   * Maennchen ueber die Insel, oder es bilden sich Trupps ohne Nachwuchs.
   */
  function isF(a) { return a.sex === 'f'; }
  function isM(a) { return a.sex === 'm'; }

  // Fehlt der Gruppe ein (bei Rudeln: erwachsenes) Tier dieses Geschlechts? Wie beim Anschliessen
  // (Simulation.joinPack): Ein Rudel mit junger Tochter, aber ohne erwachsenes Weibchen, sucht eins
  function lacksSex(o, test) {
    var mature = o.spec.group.kind === 'pair' ? 0 : o.spec.maturity;
    for (var i = 0; i < o.members.length; i++) if (test(o.members[i]) && o.members[i].age >= mature) return false;
    return true;
  }

  function mateSearchPoint(sim, g) {
    var best = null, bestD = Infinity;
    var hasF = g.members.some(isF), hasM = g.members.some(isM);
    if (hasF && hasM) return null;
    for (var i = 0; i < sim.predatorGroups.length; i++) {
      var o = sim.predatorGroups[i];
      if (o === g || o.spec !== g.spec || !o.members.length || o.horst) continue;
      var lacks = (hasF && lacksSex(o, isF)) || (hasM && lacksSex(o, isM));
      if (!lacks) continue;
      var d = BT.M.hypot(o.x - g.x, o.y - g.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Wanderer mit Partner suchen gezielt freien Platz fuer ein Revier: der
   * naechste von einigen Punkten, der weit genug von allen Revieren liegt.
   */
  function freeHomePoint(sim, g) {
    var spec = g.spec;
    var mature = spec.group.kind === 'pair' ? 0 : spec.maturity;
    var f = false, m = false;
    for (var i = 0; i < g.members.length; i++) {
      var a = g.members[i];
      if (a.age < mature) continue;
      if (a.sex === 'f') f = true; else m = true;
    }
    if (!f || !m) return null;
    var best = null, bestD = Infinity;
    for (var t = 0; t < 12; t++) {
      var p = randomPointNear(sim, spec, g.x, g.y, spec.territory * 3);
      if (spec.habitat[sim.biomeAt(p.x, p.y)] <= 0 || !sim.homeIsFree(spec, p.x, p.y)) continue;
      if (sim.humans.avoids(spec, p.x, p.y)) continue;
      var d = BT.M.hypot(p.x - g.x, p.y - g.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /**
   * Ratten fangen (BT.RATS.eatenBy): Ein hungriger Raeuber (unter `below`), der streift, erwischt in
   * seiner Zelle Ratten, je mehr es dort gibt, desto leichter; Deckung versteckt sie
   * (vor allem vor Greifvoegeln). Jeder Jaeger der Gruppe versucht es einmal je Tick.
   * Am Horst wird die Beute heimgebracht. true, wenn etwas gefangen wurde.
   */
  function catchRats(sim, g, energy, hungry) {
    var R = sim.rats, how = BT.RATS.eatenBy[g.spec.id];
    if (!R.total || !how || energy >= Math.max(hungry, how.below || 0)) return false;
    var i = sim.fields.index(g.x, g.y);
    var d = i < 0 ? 0 : R.n[i];
    if (d < 1) return false;
    var p = how.chance * d / (d + how.half) * (1 - COVER[sim.biomeAt(g.x, g.y)] * how.cover);
    if (p <= 0) return false;
    var caught = 0;
    for (var k = 0; k < g.members.length; k++) {
      var a = g.members[k];
      if (a.age >= g.spec.maturity * 0.6 && !inHorst(g, a) && R.rng.chance(p)) caught++;
    }
    caught = caught && R.take(i, caught, g.spec.id);
    if (!caught) return false;
    var e = caught * how.energy;
    if (g.horst) { g.carry = (g.carry || 0) + e; g.state = 'heimflug'; g.tx = null; return true; }
    sim.feed(g, e);
    g.ateTick = sim.tick;
    g.state = 'ruhen'; g.stateTicks = 1; g.speedNow = 0;
    return true;
  }

  /** Ein Rudel bewacht seinen Riss: Liegt ein Landraeuber daneben, kommt kein Greifvogel heran. */
  function guarded(sim, c) {
    for (var i = 0; i < sim.predatorGroups.length; i++) {
      var o = sim.predatorGroups[i];
      if (!o.spec.flies && o.members.length && BT.M.hypot(o.x - c.x, o.y - c.y) < GUARD) return true;
    }
    return false;
  }

  /** Zum naechsten Aas gehen und fressen. true, solange damit beschaeftigt. */
  function scavenge(sim, g) {
    var spec = g.spec;
    var best = null, bestD = spec.vision * 0.7;
    for (var i = 0; i < sim.carcasses.length; i++) {
      var c = sim.carcasses[i];
      if (c === g.shunned) continue;                                       // von dort vertrieben
      if (c.meat < 0.25 && BT.M.hypot(c.x - g.x, c.y - g.y) > 40) continue;   // lohnt den Weg nicht
      if (spec.flies && guarded(sim, c)) continue;
      var d = BT.M.hypot(c.x - g.x, c.y - g.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return false;
    g.state = 'aas';
    g.carcass = best;
    if (bestD < 20) { eatAt(sim, g, best); return true; }
    g.bite = 0;
    go(sim, spec, g, best.x, best.y, spec.speed * 1.3);
    g.speedNow = spec.speed * 1.3;
    return true;
  }

  /**
   * Am Aas fressen, hoechstens 0.6 je Tick. Der Anker rueckt auf den Kadaver,
   * damit die Tiere darum herum stehen. g.bite: so viel wurde gerade gefressen
   * (fuer die Darstellung: fressen oder satt daneben liegen).
   */
  function eatAt(sim, g, c) {
    g.state = 'aas';
    g.carcass = c;
    g.x += (c.x - g.x) * 0.5; g.y += (c.y - g.y) * 0.5;
    g.speedNow = 0;
    var before = c.meat, bite = Math.min(before, 0.6);
    c.meat = sim.feed(g, bite) + before - bite;
    g.bite = before - c.meat;
    if (c.meat < 0.05) sim.carcasses.splice(sim.carcasses.indexOf(c), 1);
  }

  /** Ein groesseres Rudel, das am Aas frisst oder darauf zuhaelt. */
  function biggerPackAt(sim, g, c) {
    for (var i = 0; i < sim.predatorGroups.length; i++) {
      var o = sim.predatorGroups[i];
      if (o === g || o.spec.flies || o.carcass !== c || o.state !== 'aas') continue;
      if (o.members.length > g.members.length && BT.M.hypot(o.x - c.x, o.y - c.y) < GUARD) return o;
    }
    return null;
  }

  /**
   * Landraeuber bleiben an ihrem Aas, bis es leer ist: hungrig fressen sie,
   * satt liegen sie daneben. Ein groesseres Rudel vertreibt sie.
   */
  function stayAtCarcass(sim, g) {
    var c = g.carcass;
    if (!c || g.spec.flies) return false;
    if (c.meat < 0.05 || sim.carcasses.indexOf(c) < 0 || BT.M.hypot(c.x - g.x, c.y - g.y) > 30) {
      g.carcass = null;
      return false;
    }
    var rival = biggerPackAt(sim, g, c);
    if (rival) {
      g.carcass = null; g.shunned = c; g.bite = 0;
      g.state = 'streifen'; g.stateTicks = 20;
      var dx = g.x - rival.x, dy = g.y - rival.y, d = Math.max(1, BT.M.hypot(dx, dy));
      g.tx = g.x + dx / d * GUARD * 2; g.ty = g.y + dy / d * GUARD * 2;
      if (BT.Move.blockedAt(sim.world, g.spec, g.tx, g.ty)) g.tx = null;
      return false;
    }
    eatAt(sim, g, c);
    return true;
  }

  /**
   * Beute zum Horst bringen: dort wird sie verteilt, die Hungrigsten (meist
   * Brutvogel und Kueken) zuerst. Waehrend der Brut loesen sich die Eltern ab.
   */
  function flyHome(sim, g) {
    var spec = g.spec, h = g.horst;
    if (!h) { g.carry = 0; g.state = 'streifen'; return false; }
    var sp = spec.speed * 1.5;
    if (BT.M.hypot(h.x - g.x, h.y - g.y) > 15) {
      go(sim, spec, g, h.x, h.y, sp);
      g.speedNow = sp;
      return true;
    }
    // Die Eltern versorgen zuerst sich selbst, dann die Kueken in der Reihenfolge
    // des Schluepfens - in mageren Zeiten kommt nur das aelteste durch
    var food = g.carry || 0, order = [], k;
    for (k = 0; k < g.members.length; k++) if (!g.members[k].chick) order.push({ a: g.members[k], to: spec.horst.selfFirst });
    for (k = 0; k < g.members.length; k++) if (g.members[k].chick) order.push({ a: g.members[k], to: 1 });
    for (k = 0; k < order.length && food > 0.001; k++) {
      var take = Math.max(0, Math.min(order[k].to - order[k].a.energy, food));
      order[k].a.energy += take; food -= take;
    }
    var rest = sim.feed(g, food);
    sim.addCarcass(h.x, h.y, rest * 0.8);
    g.carry = 0;
    g.ateTick = sim.tick;
    if (h.phase === 'brut') {
      for (var i = 0; i < g.members.length; i++) {
        var a = g.members[i];
        if (a.id !== h.sitter && !a.chick && a.age >= spec.maturity) { h.sitter = a.id; break; }
      }
    }
    g.state = 'ruhen'; g.stateTicks = 1; g.tx = null;
    g.speedNow = 0;
    return true;
  }

  function predator(sim, g) {
    var spec = g.spec;
    var energy = avg(g.members, 'energy');
    var hungry = hungerThreshold(g);
    g.grazing = false;
    if (sim.tick % sim.ticksPerDay === g.id % sim.ticksPerDay) look(sim, g);

    if (g.state === 'heimflug' && flyHome(sim, g)) return;

    if (g.state === 'ruhen') {
      g.speedNow = 0;
      if (g.stateTicks-- > 0) return;
      g.state = 'streifen';
    }

    if (handleThirst(sim, g, spec.speed)) { g.speedNow = spec.speed * 2.5; return; }

    if (runAway(sim, g)) return;

    // Jagd laeuft
    if (g.state === 'jagen') {
      var prey = g.prey;
      if (!prey || !prey.members.length || g.stateTicks <= 0 || ++g.stalkTicks > 60 || sim.humans.avoids(spec, prey.x, prey.y)) {
        g.state = 'streifen'; g.prey = null; g.cooldown = 6; g.tx = null;
      } else {
        // Anschleichen, solange die Beute noch nichts merkt, dann Sprint
        var close = dist(g, prey) < prey.spec.vision * 0.55 || prey.state === 'fliehen';
        // Beim Anschleichen mindestens so schnell wie die ziehende Herde
        var stalk = Math.min(spec.chaseSpeed * 0.7, Math.max(spec.speed * 1.2, (prey.speedNow || 0) + 2));
        var sp = close ? spec.chaseSpeed : stalk;
        if (close) g.stateTicks--;
        else g.stateTicks++;           // Anschleichen verbraucht keine Sprintzeit
        go(sim, spec, g, prey.x, prey.y, sp);
        g.speedNow = sp;
        if (dist(g, prey) < 30) {
          if (attack(sim, g, prey)) {
            if (g.carry) { g.state = 'heimflug'; g.prey = null; g.tx = null; return; }
            // Satt wird geruht, sonst nach kurzem Fressen weitergejagt
            var full = avg(g.members, 'energy') >= hungry;
            g.state = 'ruhen'; g.stateTicks = full ? sim.ticksPerDay * 2 : 2; g.prey = null; g.tx = null;
          } else {
            // Beute flieht, die Jagd geht weiter, bis die Zeit um ist
            prey.state = 'fliehen'; prey.fleeFrom = { x: g.x, y: g.y }; prey.stateTicks = 5;
          }
        }
        return;
      }
    }

    if (avoidPeople(sim, g)) return;

    // Am Aas bleiben, bis es leer ist
    if (stayAtCarcass(sim, g)) return;

    // Aas in der Naehe? Leichter als jagen.
    if (energy < hungry && scavenge(sim, g)) return;

    // Hungrig? Beute suchen
    if (g.cooldown > 0) g.cooldown--;
    if (energy < hungry && !g.cooldown) {
      var target = findPrey(sim, g, energy);
      if (target) {
        g.state = 'jagen'; g.prey = target; g.stateTicks = spec.maxChaseTicks; g.stalkTicks = 0;
        return;
      }
    }

    // Unterwegs Ratten fangen, wo es welche gibt (BT.RATS.eatenBy[..].below: schon unter dieser Energie)
    if (catchRats(sim, g, energy, hungry)) return;

    // Streifen im Revier oder wandern auf der Suche nach einem. Wer auch
    // Pflanzliches oder Insekten frisst (spec.diet), sucht dabei nebenher Futter.
    g.state = g.home ? 'streifen' : 'wandern';
    if (spec.diet && energy < hungry) g.grazing = true;
    if (g.tx === null || BT.M.hypot(g.tx - g.x, g.ty - g.y) < 20 || g.stateTicks-- <= 0) {
      var area = huntArea(g);
      var p;
      if (!area) p = mateSearchPoint(sim, g) || freeHomePoint(sim, g) || randomPointNear(sim, spec, g.x, g.y, spec.territory * 2.5);
      else if (energy < hungry * 1.15) p = preyRichPoint(sim, g, area, area.r);
      else p = randomPointNear(sim, spec, area.x, area.y, area.r);
      for (var t = 0; t < 4 && sim.humans.avoids(spec, p.x, p.y); t++) p = randomPointNear(sim, spec, area ? area.x : g.x, area ? area.y : g.y, area ? area.r : spec.territory * 2.5);
      g.tx = p.x; g.ty = p.y;
      g.stateTicks = 40;
    }
    var sp = energy < hungry ? spec.speed * 1.3 : spec.speed;
    go(sim, spec, g, g.tx, g.ty, sp);
    g.speedNow = sp;
  }

  BT.Behavior = {
    herbivore: herbivore,
    predator: predator,
    randomPointNear: randomPointNear,
    farPoint: farPoint,
    inHorst: inHorst,
    COVER: COVER
  };
})(typeof window !== 'undefined' ? window : globalThis);
