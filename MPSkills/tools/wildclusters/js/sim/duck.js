/**
 * Verhalten der Ente.
 *
 * Das Bild, das entstehen soll: ein paar Enten ziehen ueber einen Teich hin und
 * her, gruendeln am Ufer, mal schneller mal langsamer, allein oder lose zu
 * zweit. Ein paar Mal am Tag bricht eine auf und fliegt in einem flachen Bogen
 * zu einem anderen Gewaesser - und fast immer kommen die anderen kurz darauf
 * hinterher. Nachts schlafen sie am Ufer.
 *
 * Drei Dinge sind daran nicht offensichtlich:
 *
 * 1. Der Gewaesserwechsel wird nicht gezaehlt, sondern angestossen. Eine
 *    einzelne Ente hat einen Aufbruchstimer; die anderen folgen mit 85 %. Aus
 *    diesen beiden Zahlen ergeben sich die 2-5 Wechsel pro Tag, ohne dass
 *    irgendwo eine Tagesquote steht.
 * 2. Das Umherziehen auf dem Teich ist nicht Zufall, sondern Nahrungssuche:
 *    gegruendelte Stellen sind eine Weile leer, also zieht die Ente weiter.
 * 3. Die Reaktion auf andere Tiere ist gebaut, aber noch stumm - im Kernset
 *    gibt es bisher nur Enten. Barsch und Fledermaus werden ausdruecklich
 *    ignoriert, sie leben unter bzw. ueber der Wasserflaeche.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;

  var SWIM_TURN = 2.6;   // rad/s - Enten drehen auf dem Wasser zuegig
  var PANIC_TURN = 4.0;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    var habitat = ctx.habitat;

    var eligible = [];
    for (var i = 0; i < habitat.bodies.length; i++) {
      if (habitat.bodies[i].cellCount >= spec.home.minWaterCells) eligible.push(habitat.bodies[i]);
    }
    if (!eligible.length) return [];

    // Jedes Gewaesser der Karte ist Stammgewaesser: die Enten kennen alle und
    // fliegen jedes irgendwann an. Die Liste ist fuer alle Enten dieselbe -
    // nur so ergibt das Folgen ueberhaupt einen Sinn, denn wer hinterherfliegt,
    // muss das Ziel auch kennen.
    var homes = eligible;
    var homeIndices = homes.map(function (b) { return b.index; });

    var count = rng.intIn(spec.count);
    var agents = [];
    for (var k = 0; k < count; k++) {
      // Startverteilung nach Flaeche gewichtet: auf einem grossen Teich ist
      // mehr Ufer zum Gruendeln. Kleine Tuempel kommen vor, nur seltener -
      // angeflogen werden sie ohnehin alle.
      var startBody = pickWeighted(rng, homes);
      var agentRng = ctx.rng.fork('ente-' + k);
      var p = habitat.pointAtDepth(agentRng, startBody, spec.water.swimDepth[0], spec.water.swimDepth[1]);

      var agent = {
        index: 0,                 // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: p.x,
        y: p.y,
        heading: agentRng.range(0, Math.PI * 2),
        state: S.schwimmen,
        stateTimer: 0,
        speedBase: 0,
        tx: p.x,
        ty: p.y,
        bodyIndex: startBody.index,
        homes: homeIndices,
        partner: -1,
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        nextDeparture: 0,
        pending: null,
        flight: null,
        checkTimer: 0,
        waterChanges: 0
      };
      agents.push(agent);
    }

    // Lose Paare: "allein oder zu zweit ueber den See".
    for (var a = 0; a < agents.length; a++) {
      if (agents[a].partner >= 0) continue;
      for (var b = a + 1; b < agents.length; b++) {
        if (agents[b].partner >= 0) continue;
        if (rng.chance(spec.social.pairChance)) {
          agents[a].partner = b;
          agents[b].partner = a;
        }
        break;
      }
    }

    // Aufbruchszeiten streuen, sonst startet am ersten Morgen alles gleichzeitig.
    //
    // Gerechnet ab dem Augenblick des Anlegens und nicht ab 0: nextDeparture
    // ist eine *absolute* Uhrzeit, und fuer einen Nachzuegler (ctx.time steht
    // dann auf dem Bruch bei Tag 5) laege ein Termin aus Stunde 6 bis 14 fuenf
    // Tage in der Vergangenheit. Er flaege im ersten Tick nach seiner Ankunft
    // davon, statt seinen ersten Tag wie jede andere Ente zu beginnen. Fuer den
    // Startbestand ist ctx.time null, dort aendert sich dadurch nichts.
    var born = ctx.time || 0;
    for (var t = 0; t < agents.length; t++) {
      agents[t].nextDeparture = born + WL.SimTime.hours(rng.range(6, 14));
    }

    return agents;
  }

  /** Auswahl nach Flaeche: doppelt so viele Zellen, doppelt so wahrscheinlich. */
  function pickWeighted(rng, bodies) {
    var total = 0;
    var i;
    for (i = 0; i < bodies.length; i++) total += bodies[i].cellCount;
    var pick = rng.next() * total;
    for (i = 0; i < bodies.length; i++) {
      pick -= bodies[i].cellCount;
      if (pick <= 0) return bodies[i];
    }
    return bodies[bodies.length - 1];
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    A.updateMood(agent, agent.spec, dt);

    if (agent.flight) { flyStep(agent, ctx, dt); return; }

    var habitat = ctx.habitat;
    var body = habitat.bodies[agent.bodyIndex];
    var awake = A.isAwake(ctx.time, agent.spec);

    // Stoerungen nur viermal pro Sekunde pruefen - das reicht voellig und
    // haelt die Simulation der 5 Tage schnell.
    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = 0.25;
      checkDisturbance(agent, ctx, body, awake);
    }

    if (agent.state === S.fliehen || agent.state === S.ausweichen) {
      escapeStep(agent, ctx, body, dt);
      return;
    }

    if (!awake) { sleepStep(agent, ctx, body, dt); return; }

    // Erster Zustand nach dem Aufwachen: Aufbruchstimer nicht ueber Nacht
    // stauen lassen, sonst startet die ganze Gruppe im Morgengrauen.
    if (agent.state === S.schlafen) {
      agent.state = S.gruendeln;
      agent.stateTimer = 0;
      if (agent.nextDeparture < ctx.time) {
        agent.nextDeparture = ctx.time + agent.rng.range(20, 90);
      }
    }

    if (agent.pending && ctx.time >= agent.pending.at) {
      startFlight(agent, ctx, agent.pending.to);
      agent.pending = null;
      return;
    }
    if (!agent.pending && ctx.time >= agent.nextDeparture) {
      initiateDeparture(agent, ctx);
      return;
    }

    dayStep(agent, ctx, body, dt);
  }

  // --------------------------------------------------------------- Tag

  function dayStep(agent, ctx, body, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;

    if (agent.state === S.gruendeln) {
      // Fressen zehrt die Stelle aus; ist sie leer, zieht die Ente weiter.
      var food = spec.forage[spec.food];
      ctx.eatAt(agent.x, agent.y, food.eatPerSecond * agent.traits.needs * dt, spec.food);
      driftStep(agent, ctx, body, dt, A.effectiveSpeed(agent, agent.speedBase));
      if (agent.stateTimer <= 0 || ctx.foodAt(agent.x, agent.y, spec.food) < food.minEdible * 0.5) {
        beginSwim(agent, ctx, body);
      }
      return;
    }

    if (agent.state === S.ruhen) {
      driftStep(agent, ctx, body, dt, A.effectiveSpeed(agent, 1.2));
      if (agent.stateTimer <= 0) beginSwim(agent, ctx, body);
      return;
    }

    // schwimmen
    var result = A.swimStep(agent, ctx.habitat, body, dt,
      A.effectiveSpeed(agent, agent.speedBase), SWIM_TURN, 3);
    if (result !== 'moving' || agent.stateTimer <= 0) {
      if (agent.rng.chance(spec.water.restChance)) beginRest(agent);
      else beginForage(agent, ctx, body);
    }
  }

  function beginSwim(agent, ctx, body) {
    var spec = agent.spec;
    var target = pickFeedingTarget(agent, ctx, body);
    agent.tx = target.x;
    agent.ty = target.y;
    agent.state = S.schwimmen;
    // Tempo einmal pro Abschnitt ziehen: dadurch schwimmt dieselbe Ente
    // mal zuegig und mal traege ueber den Teich.
    agent.speedBase = A.drawSpeed(agent, spec, 'schwimmen');
    agent.stateTimer = agent.rng.rangeIn(spec.water.swimLeg);
  }

  function beginForage(agent, ctx, body) {
    var spec = agent.spec;
    agent.state = S.gruendeln;
    agent.speedBase = A.drawSpeed(agent, spec, 'gruendeln');
    agent.stateTimer = agent.rng.rangeIn(spec.water.forageBout) * agent.traits.needs;
    setDriftTarget(agent, ctx, body, 11);
  }

  function beginRest(agent) {
    agent.state = S.ruhen;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(agent.spec.water.restBout);
  }

  /**
   * Wohin als Naechstes? Ein paar Stellen am Ufer werden verglichen: viel
   * Nahrung zieht an, Entfernung stoesst ab. Wer einen Partner hat, sucht sich
   * die Stelle bevorzugt in dessen Naehe - daraus wird das lose Paar.
   */
  function pickFeedingTarget(agent, ctx, body) {
    var spec = agent.spec;
    var partner = ctx.agents[agent.partner];
    // Lose Leine: in der Naehe des Partners geht nur ein Teil der Ziele zu ihm
    // (das Paar soll nicht wie ein Schwarm aneinanderkleben), jenseits der
    // Leinenlaenge dagegen jedes - sonst driften die beiden ueber Stunden
    // auseinander und finden nicht mehr zurueck.
    var together = partner && partner.bodyIndex === agent.bodyIndex && !partner.flight;
    var nearPartner = together &&
      (Math.hypot(partner.x - agent.x, partner.y - agent.y) > spec.social.pairLeash ||
        agent.rng.chance(spec.social.pairBias));

    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < 7; i++) {
      // Beim Partner wird in dessen Umkreis gesucht, nicht auf dem ganzen
      // Teich. Sonst liegen von sieben Stichproben ueber ein grosses Gewaesser
      // alle sieben weit weg, und die "naechste" ist immer noch zu weit.
      var p = nearPartner ? pointNear(agent, ctx, body, partner, spec.social.pairDistance * 1.6) : null;
      if (!p) {
        p = ctx.habitat.pointAtDepth(agent.rng, body,
          spec.water.forageDepth[0], spec.water.forageDepth[1]);
      }
      var dist = Math.hypot(p.x - agent.x, p.y - agent.y);
      var score = ctx.foodAt(p.x, p.y, spec.food) - dist * 0.0022;
      if (nearPartner) {
        var pd = Math.hypot(p.x - partner.x, p.y - partner.y);
        score -= Math.max(0, pd - spec.social.pairDistance) * 0.010;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /** Punkt im Umkreis eines anderen Tieres, oder null wenn dort kein Wasser ist. */
  function pointNear(agent, ctx, body, other, radius) {
    for (var i = 0; i < 5; i++) {
      var a = agent.rng.range(0, Math.PI * 2);
      var r = radius * Math.sqrt(agent.rng.next());
      var x = other.x + Math.cos(a) * r;
      var y = other.y + Math.sin(a) * r;
      if (ctx.habitat.inBody(body, x, y)) return { x: x, y: y };
    }
    return null;
  }

  /** Kleine Zielpunkte in der Naehe - Gruendeln und Ruhen stehen nie ganz still. */
  function setDriftTarget(agent, ctx, body, radius) {
    for (var i = 0; i < 6; i++) {
      var a = agent.rng.range(0, Math.PI * 2);
      var r = radius * Math.sqrt(agent.rng.next());
      var nx = agent.x + Math.cos(a) * r;
      var ny = agent.y + Math.sin(a) * r;
      if (ctx.habitat.inBody(body, nx, ny)) { agent.tx = nx; agent.ty = ny; return; }
    }
    agent.tx = agent.x;
    agent.ty = agent.y;
  }

  function driftStep(agent, ctx, body, dt, speed) {
    var result = A.swimStep(agent, ctx.habitat, body, dt, speed, SWIM_TURN * 0.6, 1.5);
    if (result !== 'moving') setDriftTarget(agent, ctx, body, 11);
  }

  // -------------------------------------------------------------- Nacht

  function sleepStep(agent, ctx, body, dt) {
    var spec = agent.spec;
    if (agent.state !== S.schlafen) {
      agent.state = S.schlafen;
      agent.speedBase = A.drawSpeed(agent, spec, 'gruendeln');
      var partner = ctx.agents[agent.partner];
      var spot = null;
      // Zu zweit wird am selben Uferabschnitt geschlafen.
      if (partner && partner.bodyIndex === agent.bodyIndex && partner.state === S.schlafen) {
        for (var i = 0; i < 8; i++) {
          var p = ctx.habitat.pointAtDepth(agent.rng, body, spec.water.sleepDepth[0], spec.water.sleepDepth[1]);
          if (Math.hypot(p.x - partner.tx, p.y - partner.ty) < spec.social.pairDistance) { spot = p; break; }
        }
      }
      if (!spot) {
        spot = ctx.habitat.pointAtDepth(agent.rng, body, spec.water.sleepDepth[0], spec.water.sleepDepth[1]);
      }
      agent.tx = spot.x;
      agent.ty = spot.y;
    }

    var dist = Math.hypot(agent.tx - agent.x, agent.ty - agent.y);
    if (dist > 3) {
      A.swimStep(agent, ctx.habitat, body, dt, A.effectiveSpeed(agent, agent.speedBase), SWIM_TURN, 2.5);
    } else {
      // Am Platz: nur noch ein kaum sichtbares Treiben.
      agent.heading += Math.sin(ctx.time * 0.35 + agent.index) * 0.08 * dt;
    }
  }

  // ------------------------------------------------------- Gewaesserwechsel

  function initiateDeparture(agent, ctx) {
    var dest = pickDestination(agent, ctx);
    if (dest < 0) {
      agent.nextDeparture = ctx.time + WL.SimTime.hours(2);
      return;
    }
    var from = agent.bodyIndex;
    startFlight(agent, ctx, dest);

    // Die anderen auf demselben Gewaesser entscheiden sich kurz darauf.
    for (var i = 0; i < ctx.agents.length; i++) {
      var other = ctx.agents[i];
      if (other === agent || other.speciesId !== agent.speciesId) continue;
      if (other.flight || other.pending || other.bodyIndex !== from) continue;
      // Der Partner bleibt fast nie zurueck - sonst reisst das Paar beim
      // ersten Gewaesserwechsel auseinander und findet nie wieder zusammen.
      var chance = other.partner === agent.index
        ? agent.spec.social.partnerFollowChance
        : agent.spec.departure.followChance;
      if (!other.rng.chance(chance)) continue;
      other.pending = {
        at: ctx.time + other.rng.rangeIn(agent.spec.departure.followDelay),
        to: dest
      };
      other.nextDeparture = ctx.time + WL.SimTime.hours(other.rng.rangeIn(agent.spec.departure.intervalHours));
    }
  }

  function pickDestination(agent, ctx) {
    var options = [];
    for (var i = 0; i < agent.homes.length; i++) {
      if (agent.homes[i] !== agent.bodyIndex) options.push(agent.homes[i]);
    }
    if (!options.length) return -1;
    // Bewusst ohne Vorliebe: das Ziel ist eines der Stammgewaesser, sonst
    // keines. Ein Paar, das die Folgeregel getrennt hat, findet erst wieder
    // zusammen, wenn beide auf demselben Teich landen - das ist die Folge der
    // 85 %, nicht ein Fehler.
    return options[Math.floor(agent.rng.next() * options.length)];
  }

  /**
   * Flugbahn als quadratische Bezierkurve: im Kern gerade, der Kontrollpunkt
   * sitzt seitlich versetzt. Das ergibt den flachen Bogen statt einer
   * Linealstrecke, ohne dass ein Flugmodell noetig waere.
   */
  function startFlight(agent, ctx, destIndex) {
    var spec = agent.spec;
    var dest = ctx.habitat.bodies[destIndex];
    var land = ctx.habitat.pointAtDepth(agent.rng, dest,
      spec.departure.landingDepth[0], spec.departure.landingDepth[1]);

    var x0 = agent.x, y0 = agent.y;
    var x1 = land.x, y1 = land.y;
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.max(1, Math.hypot(dx, dy));
    var bend = dist * agent.rng.rangeIn(spec.departure.curve) * (agent.rng.chance(0.5) ? 1 : -1);

    var flight = {
      x0: x0, y0: y0, x1: x1, y1: y1,
      cx: (x0 + x1) / 2 - dy / dist * bend,
      cy: (y0 + y1) / 2 + dx / dist * bend,
      dest: destIndex,
      t: 0,
      elapsed: 0,
      speed: A.effectiveSpeed(agent, A.drawSpeed(agent, spec, 'fliegen')),
      length: 0
    };
    flight.length = bezierLength(flight);

    agent.flight = flight;
    agent.state = S.fliegen;
    agent.bodyIndex = -1;
    agent.tx = x1;
    agent.ty = y1;
  }

  function bezierAt(f, t) {
    var u = 1 - t;
    return {
      x: u * u * f.x0 + 2 * u * t * f.cx + t * t * f.x1,
      y: u * u * f.y0 + 2 * u * t * f.cy + t * t * f.y1
    };
  }

  function bezierLength(f) {
    var len = 0;
    var prev = bezierAt(f, 0);
    for (var i = 1; i <= 16; i++) {
      var p = bezierAt(f, i / 16);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    return Math.max(1, len);
  }

  function flyStep(agent, ctx, dt) {
    var f = agent.flight;
    f.elapsed += dt;
    // Auffliegen und Landen sind langsamer als die Reise dazwischen.
    var ramp = Math.min(1, 0.35 + f.elapsed / 1.1) * (f.t > 0.93 ? 0.6 : 1);
    f.t += f.speed * ramp * dt / f.length;

    if (f.t >= 1) {
      agent.x = f.x1;
      agent.y = f.y1;
      agent.bodyIndex = f.dest;
      agent.flight = null;
      agent.waterChanges++;
      agent.nextDeparture = ctx.time +
        WL.SimTime.hours(agent.rng.rangeIn(agent.spec.departure.intervalHours));
      beginForage(agent, ctx, ctx.habitat.bodies[f.dest]);
      return;
    }

    var p = bezierAt(f, f.t);
    agent.heading = Math.atan2(p.y - agent.y, p.x - agent.x);
    agent.x = p.x;
    agent.y = p.y;
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * Tags weichen Enten langsam aus (ein Tier kommt trinken), nachts fliehen
   * sie schnell auf die andere Seite des Gewaessers. Barsch und Fledermaus
   * sind ausgenommen. Solange nur Enten in der Welt sind, passiert hier nichts.
   */
  function checkDisturbance(agent, ctx, body, awake) {
    var spec = agent.spec;
    if (agent.state === S.fliehen) return;

    var night = !awake;
    var radius = (night ? spec.reaction.panicRadius : spec.reaction.evadeRadius) * agent.traits.shyness;
    var threat = ctx.nearestDisturber(agent, radius, spec.reaction.ignore);
    if (!threat) return;

    if (night) {
      var far = ctx.habitat.farPointIn(agent.rng, body, threat.x, threat.y,
        spec.water.swimDepth[0], spec.water.swimDepth[1]);
      agent.tx = far.x;
      agent.ty = far.y;
      agent.state = S.fliehen;
      agent.speedBase = A.drawSpeed(agent, spec, 'fliehen');
      agent.stateTimer = agent.rng.rangeIn(spec.reaction.panicSeconds);
      return;
    }

    if (agent.state === S.ausweichen) return;
    // Tagsueber genuegt es, gemaechlich vom Ufer wegzuschwimmen.
    var ax = agent.x - threat.x;
    var ay = agent.y - threat.y;
    var norm = Math.max(1, Math.hypot(ax, ay));
    var away = { x: agent.x + ax / norm * 90, y: agent.y + ay / norm * 90 };
    if (!ctx.habitat.inBody(body, away.x, away.y)) {
      away = ctx.habitat.farPointIn(agent.rng, body, threat.x, threat.y,
        spec.water.swimDepth[0], spec.water.swimDepth[1]);
    }
    agent.tx = away.x;
    agent.ty = away.y;
    agent.state = S.ausweichen;
    agent.speedBase = A.drawSpeed(agent, spec, 'ausweichen');
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.calmSeconds);
  }

  function escapeStep(agent, ctx, body, dt) {
    agent.stateTimer -= dt;
    var fast = agent.state === S.fliehen;
    var result = A.swimStep(agent, ctx.habitat, body, dt,
      A.effectiveSpeed(agent, agent.speedBase), fast ? PANIC_TURN : SWIM_TURN, 4);
    if (result !== 'moving' || agent.stateTimer <= 0) {
      beginForage(agent, ctx, body);
    }
  }

  WL.Brains.ente = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
