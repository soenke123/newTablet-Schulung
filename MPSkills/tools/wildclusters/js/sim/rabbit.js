/**
 * Verhalten des Kaninchens - die kuerzeste Art des Katalogs.
 *
 * Das Bild, das entstehen soll: vier bis sieben Kaninchen hoppeln rund um einen
 * festen Bau auf der Wiese, jedes fuer sich, in staendig wechselnde Richtungen,
 * und bleiben zwischen zwei Hopsern sitzen. Kommt ein groesseres Tier, rennen
 * alle zum Bau - nicht weg, sondern *hin* - und sitzen dort, bis die Luft rein
 * ist. Nachts liegt die Familie beieinander am Bau.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Es frisst nicht.** Kein forage-Block, keine Nahrungskarte, kein Durst.
 *    Bei allen vier Arten davor ist die Nahrung der Motor der Bewegung; hier
 *    ist die Bewegung das ganze Verhalten. Das ist ausdruecklich so festgelegt
 *    (data/tiere.md, Kaninchen) und der Gegenentwurf zum Rest des Kernsets.
 * 2. **Die Richtung wird bei jedem Hopser neu gewuerfelt.** Beim Reh waere das
 *    ein Fehler - dessen Beharrung ist der Grund, warum es ueber die Karte
 *    kommt. Hier ist es das Mittel: ein Irrflug kommt nach acht Zuegen nur die
 *    Wurzel aus acht Zuglaengen weit und bleibt damit von selbst am Bau. Der
 *    Radius sichert nur den Rest.
 * 3. **Die Familie ist kein Verband.** Sie teilt einen Ort, sonst nichts - kein
 *    gemeinsames Ziel wie die Rotte, keine Kraefte wie der Schwarm. Das ist die
 *    dritte Form von Sozialverhalten im Katalog und die billigste von allen.
 * 4. **Im Bau wird nicht geflohen.** Die Bedrohungsabfrage laeuft in diesem
 *    Zustand gar nicht erst. Ohne diese Regel wuerde ein Reh, das zufaellig
 *    neben dem Bau aest, das ganze Tier uebersteuern - dasselbe Problem wie
 *    beim schlafenden Reh am Ufer, nur von der anderen Seite.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 4.2;          // rad/s - ein Kaninchen dreht schneller als jedes andere Tier
  var FLEE_TURN = 5.0;
  var ARRIVE = 5;
  var CHECK_SECONDS = 0.25;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;

    /*
     * Ein Nachzuegler zieht in eine *vorhandene* Familie ein, statt sich einen
     * eigenen Bau zu suchen. Vorhandene Artgenossen gibt es nur in diesem Fall
     * (A.groupsOf) - beim Aufbau der Welt ist die Liste leer, und es geht unten
     * weiter wie eh und je.
     *
     * Das ist die ganze Arbeit an der Art, und es ist die richtige: ein zweiter
     * Bau waere ein neuer ortsfester Punkt an Tag 6, also ein Artmerkmal, das
     * die Kaninchen aus der Gruppierungsaufgabe herausnaehme. So laeuft die Spur
     * des Neuen sternfoermig von genau der Stelle weg, von der auch die anderen
     * Kaninchenspuren ausgehen - einsortierbar, aber nur ueber das Verhalten.
     *
     * Bei zwei Bauen wird gezogen. Der naechstgelegene waere keine Wahl, denn
     * einen Ort hat der Nachzuegler noch gar nicht - er entsteht ja erst hier.
     */
    var known = A.groupsOf(ctx.agents, spec.id, 'family');
    if (known.length) {
      return [makeRabbit(ctx, spec, rng.fork('nachzuegler'), rng.pick(known))];
    }

    var count = rng.intIn(spec.count);
    // Bis 7 Tiere eine Familie, ab 8 zwei - so steht es in data/tiere.md.
    var families = count <= spec.family.splitAt ? 1 : 2;
    var burrows = [];
    var agents = [];
    var f, k;

    for (f = 0; f < families; f++) {
      var burrow = findBurrow(ctx, spec, rng, burrows);
      if (!burrow) break;
      burrows.push(burrow);
    }
    if (!burrows.length) return [];

    for (f = 0; f < burrows.length; f++) {
      var family = {
        burrow: burrows[f],
        region: ctx.land.regionAt(burrows[f].x, burrows[f].y),
        members: []
      };
      // Rest verteilen: bei 9 Tieren also 5 + 4, nicht 4 + 4 und eins uebrig.
      var size = Math.floor(count / burrows.length) + (f < count % burrows.length ? 1 : 0);

      for (k = 0; k < size; k++) {
        agents.push(makeRabbit(ctx, spec, ctx.rng.fork('kaninchen-' + f + '-' + k), family));
      }
    }

    return agents;
  }

  /**
   * Ein Kaninchen an seinem Bau. Getrennt vom Anlegen der Familie, weil es zwei
   * Wege hierher gibt: den Aufbau der Welt und den Beitritt eines Nachzueglers.
   * Beide sollen dasselbe Tier ergeben - ein Nachzuegler ist kein Sonderfall im
   * Verhalten, sondern nur einer im Zeitpunkt.
   */
  function makeRabbit(ctx, spec, agentRng, family) {
    var p = ctx.land.pointInRing(agentRng, family.burrow.x, family.burrow.y, 10,
      spec.home.radius * 0.7, -1, family.region) || { x: family.burrow.x, y: family.burrow.y };

    var agent = {
      index: 0,              // setzt die Simulation
      speciesId: spec.id,
      spec: spec,
      rng: agentRng,
      x: p.x,
      y: p.y,
      heading: agentRng.range(0, Math.PI * 2),
      state: S.sichern,
      stateTimer: 0,
      speedBase: 0,
      tx: p.x,
      ty: p.y,
      region: family.region,
      family: family,
      burrow: family.burrow,
      // Eigene Reviergroesse: manche Geschwister bleiben dichter am Bau als
      // andere. Ohne diese Streuung sieht die Familie wie ein Zirkel aus.
      range: spec.home.radius *
        (1 + agentRng.range(-spec.variation.range, spec.variation.range)),
      traits: A.createTraits(agentRng, spec),
      mood: 1,
      moodFrom: 1,
      moodTo: 1,
      moodSpan: 1,
      moodTimer: 0,
      checkTimer: agentRng.range(0, CHECK_SECONDS),
      walkTimer: 0,
      partner: -1,
      flight: null,          // hoppelt nie in die Luft; das Feld liest die Stoerabfrage
      hides: 0               // wie oft es in den Bau geflohen ist
    };
    agent.stateTimer = agentRng.rangeIn(spec.hop.pause);
    family.members.push(agent);
    return agent;
  }

  /**
   * Ein Platz fuer den Bau: offen (Gras oder Boden), weit genug vom Wasser, weit
   * genug vom anderen Bau - und mit offener Umgebung, damit das Revier nicht zur
   * Haelfte im Wald oder ausserhalb der Karte liegt.
   *
   * Gesucht wird in drei Stufen, weil auf einem ungluecklichen Seed sonst gar
   * kein Platz herauskommt und die Art ausfiele: erst alle Bedingungen, dann
   * ohne die offene Umgebung, dann mit halbiertem Wasserabstand. Die letzte
   * Stufe findet immer etwas.
   */
  function findBurrow(ctx, spec, rng, taken) {
    var home = spec.home;
    var stages = [
      { open: home.minOpenShare, water: home.minDistToWater, apart: home.minBurrowDistance },
      { open: 0, water: home.minDistToWater, apart: home.minBurrowDistance },
      { open: 0, water: home.minDistToWater * 0.5, apart: home.minBurrowDistance * 0.5 }
    ];

    for (var s = 0; s < stages.length; s++) {
      var stage = stages[s];
      for (var t = 0; t < home.tries; t++) {
        // Gras und Boden im Wechsel: Boden ist die kleinste Flaeche der Karte,
        // aus einer gemeinsamen Ziehung kaeme er praktisch nie heraus.
        var type = rng.chance(0.75) ? T.GRASS : T.GROUND;
        var p = ctx.land.pointOfType(rng, type, 0);
        if (!p) continue;
        if (ctx.land.regionAt(p.x, p.y) <= 0) continue;
        if (!WL.Rules.placement.burrow(ctx.world.query, p, { minDistToWater: stage.water })) continue;
        if (tooClose(p, taken, stage.apart)) continue;
        if (stage.open > 0 && openShare(ctx, p, spec) < stage.open) continue;
        return p;
      }
    }
    return null;
  }

  function tooClose(p, taken, minDistance) {
    for (var i = 0; i < taken.length; i++) {
      if (Math.hypot(taken[i].x - p.x, taken[i].y - p.y) < minDistance) return true;
    }
    return false;
  }

  /**
   * Wie viel vom Revier ist offenes Gelaende? Ein Bau am Waldrand oder in einer
   * Kartenecke waere zwar regelkonform, aber das Kaninchen haette dann sein
   * halbes Revier im Wald - und "bleibt meist auf Gras und Boden" waere eine
   * Zusage, die an der Platzierung scheitert statt am Verhalten.
   */
  function openShare(ctx, p, spec) {
    // Die Stichproben liegen fest auf einem Ring statt gewuerfelt: derselbe
    // Punkt muss zweimal dasselbe ergeben, sonst haengt die Wahl des Baus an
    // der Reihenfolge der Versuche.
    var q = ctx.world.query;
    var r = spec.home.radius * 0.75;
    var open = 0;
    for (var i = 0; i < spec.home.samples; i++) {
      var a = (i + 0.5) / spec.home.samples * Math.PI * 2;
      if (q.isOpen(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r)) open++;
    }
    return open / spec.home.samples;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    // Im Bau und im Schlaf wird gar nicht erst hingeschaut: dort ist das
    // Kaninchen sicher, und eine Bedrohung davor haette keine Wirkung.
    if (agent.state === S.schlafen) { sleepStep(agent, ctx, dt); return; }
    if (agent.state === S.bau) { burrowStep(agent, ctx, dt); return; }

    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = CHECK_SECONDS;
      if (checkThreat(agent, ctx)) return;
    }

    if (agent.state === S.fliehen) { fleeStep(agent, ctx, dt); return; }

    // Feierabend: heim zum Bau. Der Weg ist hoechstens einen Revierradius lang,
    // deshalb genuegt ein spaeter Aufbruch - anders als beim Reh, das quer ueber
    // die Karte zu seinem Waldrand muss.
    var awake = A.isAwake(ctx.time, spec);
    var settling = WL.SimTime.dayFraction(ctx.time) >= spec.sleep.leaveAt;
    if (!awake || settling) { goHome(agent, ctx, dt); return; }

    if (agent.state === S.gehen) { beginHop(agent, ctx); }   // morgens am Bau
    if (agent.state === S.sichern) { sitStep(agent, ctx, dt); return; }
    hopStep(agent, ctx, dt);
  }

  // -------------------------------------------------------------- Hoppeln

  /**
   * Ein Hopser. Die Richtung ist frei - ausser das Tier ist an den Rand seines
   * Reviers geraten, dann zeigt sie grob zum Bau zurueck.
   */
  function beginHop(agent, ctx) {
    var spec = agent.spec;
    var hop = spec.hop;
    var dx = agent.burrow.x - agent.x;
    var dy = agent.burrow.y - agent.y;
    var home = Math.sqrt(dx * dx + dy * dy);

    var base;
    if (home > agent.range * hop.homeBias) {
      base = Math.atan2(dy, dx) + agent.rng.range(-hop.spreadAtEdge, hop.spreadAtEdge);
    } else {
      base = agent.rng.range(0, Math.PI * 2);
    }

    var length = agent.rng.rangeIn(hop.length);
    var target = null;
    var fallback = null;
    for (var i = 0; i < hop.tries; i++) {
      var a = i === 0 ? base : agent.rng.range(0, Math.PI * 2);
      var nx = agent.x + Math.cos(a) * length;
      var ny = agent.y + Math.sin(a) * length;
      if (!ctx.land.walkable(nx, ny)) continue;
      if (ctx.land.regionAt(nx, ny) !== agent.region) continue;
      if (Math.hypot(nx - agent.burrow.x, ny - agent.burrow.y) > agent.range) continue;
      if (!fallback) fallback = { x: nx, y: ny };
      // Gras und Boden zuerst; der Wald ist erlaubt, aber nur als Rueckfall.
      // "Bleiben meist auf Gras und Boden" ist damit eine Vorliebe und keine
      // Wand - genau wie der Waldrandbezug beim Reh.
      if (!ctx.world.query.isOpen(nx, ny)) continue;
      target = { x: nx, y: ny };
      break;
    }
    if (!target) target = fallback;
    // Voellig eingeklemmt: dann eben ein Stueck Richtung Bau.
    if (!target) {
      target = {
        x: agent.x + Math.cos(Math.atan2(dy, dx)) * Math.min(length, home),
        y: agent.y + Math.sin(Math.atan2(dy, dx)) * Math.min(length, home)
      };
    }

    agent.state = S.hoppeln;
    agent.tx = target.x;
    agent.ty = target.y;
    agent.speedBase = A.drawSpeed(agent, spec, 'hoppeln');
    agent.walkTimer = 2 + length / Math.max(1, agent.speedBase) * 2.5;
  }

  function hopStep(agent, ctx, dt) {
    agent.walkTimer -= dt;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);
    // Der Faecher reicht nur ueber gut +/-109 Grad - wer in eine Sackgasse
    // hoppelt, muss ausdruecklich umgedreht werden (siehe js/sim/deer.js).
    if (result === 'blocked') agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
    if (result !== 'moving' || agent.walkTimer <= 0) beginSit(agent, ctx);
  }

  /** Sitzen zwischen zwei Hopsern, gelegentlich deutlich laenger. */
  function beginSit(agent, ctx) {
    var hop = agent.spec.hop;
    agent.state = S.sichern;
    agent.speedBase = 0;
    var range = agent.rng.chance(hop.longPauseChance) ? hop.longPause : hop.pause;
    agent.stateTimer = agent.rng.rangeIn(range) * agent.traits.needs;
  }

  function sitStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    // Ein sitzendes Kaninchen sichert: der Kopf dreht sich, das Tier nicht.
    agent.heading += Math.sin(ctx.time * 1.3 + agent.index) * 0.5 * dt;
    if (agent.stateTimer <= 0) beginHop(agent, ctx);
  }

  // ----------------------------------------------------------- Bau, Nacht

  /** Zum Bau laufen und sich dort hinlegen. */
  function goHome(agent, ctx, dt) {
    var spec = agent.spec;
    if (agent.state !== S.gehen) {
      agent.state = S.gehen;
      agent.speedBase = A.drawSpeed(agent, spec, 'gehen');
      var p = ctx.land.pointInRing(agent.rng, agent.burrow.x, agent.burrow.y, 0,
        spec.burrow.spread, -1, agent.region) || { x: agent.burrow.x, y: agent.burrow.y };
      agent.tx = p.x;
      agent.ty = p.y;
      agent.walkTimer = 8 + Math.hypot(p.x - agent.x, p.y - agent.y) /
        Math.max(1, agent.speedBase) * 2.5;
    }

    agent.walkTimer -= dt;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);
    if (result === 'blocked') agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
    if (result !== 'moving' || agent.walkTimer <= 0) {
      agent.state = S.schlafen;
      agent.speedBase = 0;
    }
  }

  function sleepStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.06 * dt;
    var awake = A.isAwake(ctx.time, spec);
    var settling = WL.SimTime.dayFraction(ctx.time) >= spec.sleep.leaveAt;
    if (awake && !settling) beginHop(agent, ctx);
  }

  /**
   * Im Bau. Nach der Zeit wird herausgeschaut - steht der Stoerer noch da,
   * bleibt das Kaninchen drin. Das ist der Unterschied zwischen "einmal
   * erschrocken" und "wartet ab".
   */
  function burrowStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;
    agent.heading += Math.sin(ctx.time * 0.9 + agent.index) * 0.3 * dt;
    if (agent.stateTimer > 0) return;

    if (threatNear(agent, ctx)) {
      agent.stateTimer = agent.rng.rangeIn(spec.burrow.peekBout);
      return;
    }

    var awake = A.isAwake(ctx.time, spec);
    var settling = WL.SimTime.dayFraction(ctx.time) >= spec.sleep.leaveAt;
    if (!awake || settling) {
      agent.state = S.schlafen;
      agent.speedBase = 0;
      return;
    }
    beginHop(agent, ctx);
  }

  // ------------------------------------------------------------ Reaktion

  function threatNear(agent, ctx) {
    var spec = agent.spec;
    var threat = ctx.nearestDisturber(agent, spec.reaction.fleeRadius * agent.traits.shyness,
      spec.reaction.ignore);
    return !!(threat && threat.spec && threat.spec.size >= spec.reaction.fleeFromSize);
  }

  /**
   * Fluchtziel ist immer der Bau, nie "weg". Steht der Stoerer zwischen
   * Kaninchen und Bau, laeuft es an ihm vorbei - das ist ausdruecklich gewollt
   * und der sichtbare Unterschied zur Flucht des Rehs, die nur eine Richtung
   * kennt und sonst nichts.
   */
  function checkThreat(agent, ctx) {
    if (agent.state === S.fliehen) return false;
    if (!threatNear(agent, ctx)) return false;

    agent.state = S.fliehen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'fliehen');
    agent.tx = agent.burrow.x;
    agent.ty = agent.burrow.y;
    agent.hides++;
    // Notbremse: der Bau liegt hoechstens einen Revierradius entfernt, ein
    // Kaninchen darf also nie minutenlang "fliehen".
    agent.walkTimer = 6 + agent.range / Math.max(1, agent.speedBase) * 3;
    return true;
  }

  function fleeStep(agent, ctx, dt) {
    agent.walkTimer -= dt;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), FLEE_TURN, agent.spec.burrow.arrive);
    if (result === 'blocked') agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
    if (result === 'arrived') { enterBurrow(agent, ctx); return; }
    // Kommt es partout nicht an den Bau, sitzt es sich wenigstens fest statt
    // die restliche Aufzeichnung zu rennen.
    if (agent.walkTimer <= 0) beginSit(agent, ctx);
  }

  function enterBurrow(agent, ctx) {
    agent.state = S.bau;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(agent.spec.burrow.hideBout) * agent.traits.needs;
  }

  WL.Brains.kaninchen = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
