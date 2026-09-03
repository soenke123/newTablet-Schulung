/**
 * Verhalten des Rehs - das erste Landtier.
 *
 * Das Bild, das entstehen soll: ein einzelnes Reh steht lange auf einer Wiese
 * und aest, zieht dann in einem weiten Zug zur naechsten Stelle, gern in der
 * Naehe eines Waldrandes. Zwei- bis dreimal am Tag geht es zum Wasser. Sieht es
 * unterwegs einen Apfelbaum oder ein Nussnest, macht es einen Umweg, frisst
 * kurz und zieht weiter. Nachts liegt es im Wald dicht am Rand.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. Es gibt nichts oberhalb des Einzeltieres. Kein Revier, keine Gruppe, kein
 *    Rendezvous - der Gegenentwurf zum Schwarm des Barsches. Begegnen sich zwei
 *    Rehe, bleiben beide kurz stehen und gehen dann getrennt weiter.
 * 2. Das Reh *weiss* nicht, wo Aepfel und Nuesse liegen, es *sieht* sie: nur
 *    was im Umkreis von 150 u liegt, existiert fuer das Tier. Deshalb kennen
 *    zwei Rehe derselben Karte verschiedene Baeume, und derselbe Baum wird an
 *    einem Tag gefunden und am naechsten nicht.
 * 3. Weitergezogen wird nicht nach Zufall, sondern weil das Gras hier abgeaest
 *    ist: die Grasnahrung erholt sich sehr langsam, und die Wahl des naechsten
 *    Ziels sieht auf den Vorrat. Die abgeaesten Stellen sind der Grund, warum
 *    das Reh die Karte abwandert statt im Kreis zu laufen.
 * 4. Der Schlafplatz ist *nicht* fest. Gesucht wird der Waldrand, der abends
 *    gerade in der Naehe liegt - dadurch entsteht keine wiederkehrende Adresse,
 *    und das ist der beabsichtigte Unterschied zum Bau des Dachses.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 2.2;        // rad/s - ein Reh dreht an Land traeger als eine Ente
  var FLEE_TURN = 3.4;
  var ARRIVE = 7;        // Weltunits, ab denen ein Ziel als erreicht gilt
  var CHECK_SECONDS = 0.25;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    var land = ctx.land;

    var count = rng.intIn(spec.count);
    var agents = [];

    for (var k = 0; k < count; k++) {
      var agentRng = ctx.rng.fork('reh-' + k);
      // Auf Gras starten, nicht irgendwo: das ist der Ort, an dem ein Reh den
      // ueberwiegenden Teil seines Tages verbringt.
      var p = land.pointOfType(agentRng, T.GRASS, 0) ||
        land.pointOfType(agentRng, T.FOREST, 0);
      if (!p) continue;

      var agent = {
        index: 0,                // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: p.x,
        y: p.y,
        heading: agentRng.range(0, Math.PI * 2),
        state: S.aesen,
        stateTimer: 0,
        speedBase: 0,
        tx: p.x,
        ty: p.y,
        // Die Landmasse, auf der es lebt. Ein Ziel jenseits eines Sees waere
        // nicht erreichbar - das Tier bliebe am Ufer stehen und der Tag waere
        // vorbei. Auf fast allen Seeds gibt es nur eine Landmasse.
        region: land.regionAt(p.x, p.y),
        goal: 'gras',            // 'gras' | 'punkt' | 'wasser' | 'schlaf'
        roamAngle: agentRng.range(0, Math.PI * 2),
        foodKind: null,          // Ortsnahrung, auf die es gerade zugeht
        foodIndex: -1,
        skipKind: null,          // zuletzt leergefressene Stelle ...
        skipIndex: -1,
        skipUntil: 0,            // ... und bis wann sie uninteressant bleibt
        sleepSpot: null,
        sleepTries: 0,
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        // Durst, Blick und Reaktion laufen auf eigenen Uhren, damit sie sich
        // nicht gegenseitig takten.
        nextDrink: 0,
        lookTimer: 0,
        checkTimer: 0,
        peerUntil: 0,
        resumeState: S.aesen,
        walkTimer: 0,
        fleeAngle: 0,
        partner: -1,
        // Eigener Zaehler statt waterChanges: das Reh wechselt kein Gewaesser,
        // es geht trinken. Zwei verschiedene Dinge, zwei verschiedene Zeilen.
        drinks: 0
      };
      agent.stateTimer = agentRng.rangeIn(spec.graze.bout);
      agent.speedBase = A.drawSpeed(agent, spec, 'aesen');
      // Durstzeiten streuen, sonst gehen am ersten Morgen alle gleichzeitig.
      agent.nextDrink = WL.SimTime.hours(rng.range(6, 16));
      agents.push(agent);
    }

    return agents;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    var awake = A.isAwake(ctx.time, spec);

    // Umschauen kostet Rechenzeit und braucht keine 20 Hz.
    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = CHECK_SECONDS;
      if (checkThreat(agent, ctx)) return;
      if (awake) checkPeer(agent, ctx);
    }

    if (agent.state === S.fliehen) { fleeStep(agent, ctx, dt); return; }

    // Der Abend beginnt vor der Nacht: ab sleep.leaveAt hoert das Reh auf zu
    // aesen und zieht zum Waldrand. Der Weg gehoert damit zur Daemmerung, wo
    // er hingehoert, und nicht in die Nacht.
    var settling = WL.SimTime.dayFraction(ctx.time) >= spec.sleep.leaveAt;
    if (!awake || settling) { sleepStep(agent, ctx, dt); return; }

    // Erster Schritt nach dem Aufwachen. Auch ein Reh, das noch auf dem Weg
    // zum Schlafplatz war, laesst ihn jetzt liegen - der Platz von gestern
    // Abend ist kein Ziel von heute Morgen.
    if (agent.state === S.schlafen || agent.sleepSpot) {
      agent.sleepSpot = null;
      agent.sleepTries = 0;
      agent.foodKind = null;
      agent.foodIndex = -1;
      // Nicht am Schlafplatz aesen: der liegt im Wald, dort waechst kein Gras.
      // Der Morgen beginnt mit dem Weg hinaus auf die Wiese.
      beginWalkToGrass(agent, ctx);
    }

    if (agent.state === S.sichern) {
      agent.stateTimer -= dt;
      if (agent.stateTimer <= 0) resumeAfterPause(agent, ctx);
      return;
    }

    // Durst geht allem anderen vor - ausser der Flucht. Faellig ist er zur
    // vollen Zeit; steht das Reh aber schon in Wassernaehe, nimmt es den
    // Schluck etwas frueher mit, statt spaeter eigens hinzulaufen.
    if (agent.goal !== 'wasser' && agent.state !== S.trinken) {
      var thirst = agent.nextDrink - ctx.time;
      if (thirst <= 0 || (thirst <= WL.SimTime.hours(spec.drink.earlyHours) &&
        ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.nearby)) {
        beginDrink(agent, ctx);
      }
    }

    // Aepfel und Nuesse werden gesehen, nicht gesucht.
    agent.lookTimer -= dt;
    if (agent.lookTimer <= 0) {
      agent.lookTimer = spec.sight.interval;
      if (agent.goal === 'gras') lookForPointFood(agent, ctx);
    }

    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    if (agent.state === S.aesen) { grazeStep(agent, ctx, dt); return; }
    walkStep(agent, ctx, dt);
  }

  // ----------------------------------------------------------------- Aesen

  function beginGraze(agent, ctx) {
    var spec = agent.spec;
    agent.state = S.aesen;
    agent.speedBase = A.drawSpeed(agent, spec, 'aesen');
    var bout = agent.foodKind ? spec.sight.bout : spec.graze.bout;
    agent.stateTimer = agent.rng.rangeIn(bout) * agent.traits.needs;
    setDriftTarget(agent, ctx);
  }

  /**
   * Aesen heisst nicht stillstehen: das Reh zieht in kleinen Schritten weiter
   * und nimmt dabei die Stelle mit dem meisten Gras. Ueber eine ganze Aesphase
   * ergibt das den grasenden Zickzack statt eines Punktes auf der Spur.
   */
  function setDriftTarget(agent, ctx) {
    var spec = agent.spec;
    var land = ctx.land;
    // Beim Grasen bleibt das Reh auf dem Gras - sonst zieht es waehrend einer
    // Aesphase in den Wald und "aest" dort minutenlang auf einer Stelle ohne
    // jeden Vorrat. An einem Apfelbaum oder Nussnest ist der Untergrund egal.
    var type = agent.foodKind ? -1 : T.GRASS;
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < 4; i++) {
      var p = land.pointInRing(agent.rng, agent.x, agent.y, 2, spec.graze.driftRadius,
        type, agent.region);
      if (!p) continue;
      var score = agent.foodKind ? agent.rng.next() : ctx.foodAt(p.x, p.y, 'gras');
      if (score > bestScore) { bestScore = score; best = p; }
    }
    agent.tx = best ? best.x : agent.x;
    agent.ty = best ? best.y : agent.y;
  }

  function grazeStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;

    if (agent.foodKind) {
      // Ortsnahrung: der Vorrat haengt am Baum, nicht am Boden.
      var cfg = spec.forage[agent.foodKind];
      var left = ctx.eatPoint(agent.foodKind, agent.foodIndex,
        cfg.eatPerSecond * agent.traits.needs * dt);
      if (agent.stateTimer <= 0 || left < cfg.minEdible * 0.5) {
        forgetPoint(agent, ctx);
        beginWalkToGrass(agent, ctx);
        return;
      }
    } else {
      ctx.eatAt(agent.x, agent.y,
        spec.forage.gras.eatPerSecond * agent.traits.needs * dt, 'gras');
      if (agent.stateTimer <= 0) { beginWalkToGrass(agent, ctx); return; }
    }

    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN * 0.7, 2);
    if (result !== 'moving') setDriftTarget(agent, ctx);
  }

  // ---------------------------------------------------------------- Ziehen

  /**
   * Das naechste Grasziel. Ein paar Stellen im Umkreis werden verglichen: viel
   * Gras zieht an, Naehe zum Wald gibt einen kleinen Zuschlag. Bewusst *ohne*
   * Abzug fuer die Entfernung - genau das macht aus dem Tier einen Streifer
   * statt eines Tieres, das um seinen Startpunkt kreist.
   */
  function beginWalkToGrass(agent, ctx, near) {
    var spec = agent.spec;
    var land = ctx.land;
    var q = ctx.world.query;
    // Nach dem Trinken geht es nicht wieder quer ueber die Karte, sondern
    // aest gleich am Ufer weiter - sonst kostet jeder Schluck einen ganzen
    // Zug, und aus dem aesenden Tier wird ein wanderndes.
    var leg = near ? spec.graze.shortLeg : spec.graze.leg;
    var best = null;
    var bestScore = -Infinity;

    // Die Zugrichtung wandert von Zug zu Zug ein Stueck weiter und wird nur
    // gelegentlich ganz neu gewaehlt. Sie faengt sich damit auch wieder, wenn
    // das Reh am Kartenrand oder an einem Ufer angelaufen ist.
    if (agent.rng.chance(spec.graze.newDirectionChance)) {
      agent.roamAngle = agent.rng.range(0, Math.PI * 2);
    } else {
      agent.roamAngle += agent.rng.range(-spec.graze.turnPerLeg, spec.graze.turnPerLeg);
    }

    for (var i = 0; i < spec.graze.samples; i++) {
      var p = land.pointInRing(agent.rng, agent.x, agent.y, leg[0], leg[1],
        T.GRASS, agent.region);
      if (!p) continue;
      // Das Reh vergleicht, es rechnet nicht. Ohne den Zufallsanteil waere der
      // Waldrandzuschlag keine Vorliebe, sondern ein Gesetz: frisches Gras
      // steht ueberall auf 1.0, und dann gewinnt jedes Mal die Stelle am Wald.
      var score = ctx.foodAt(p.x, p.y, 'gras') + agent.rng.range(0, spec.graze.jitter);
      if (q.distToForest(p.x, p.y) < spec.graze.forestNear) score += spec.graze.forestBonus;
      score += Math.cos(Math.atan2(p.y - agent.y, p.x - agent.x) - agent.roamAngle) *
        spec.graze.headingBonus;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    // Kein Gras in Reichweite (tief im Wald): dann eben irgendwohin, von dort
    // aus sieht die Welt wieder anders aus.
    if (!best) {
      best = land.pointInRing(agent.rng, agent.x, agent.y, leg[0], leg[1], -1, agent.region);
    }
    if (!best) best = land.pointOfType(agent.rng, T.GRASS, agent.region);
    if (!best) { beginGraze(agent, ctx); return; }

    agent.goal = 'gras';
    agent.foodKind = null;
    agent.foodIndex = -1;
    beginWalk(agent, ctx, best.x, best.y, 'gehen');
  }

  /**
   * Umdrehen. Der Bewegungsfaecher in js/sim/agents.js reicht nur ueber gut
   * +/- 109 Grad - er kann einen Kurs am Ufer entlang lenken, aber nicht
   * zuruecknehmen. Laeuft ein Reh in eine Sackgasse (die engste liegt zwischen
   * Kartenrand und Teichufer), kommt es aus eigener Kraft nie wieder heraus und
   * bleibt dort bis zum Ende der Aufzeichnung stehen. Deshalb wird die
   * Blickrichtung bei "blockiert" ausdruecklich umgekehrt, bevor ein neues Ziel
   * gesucht wird.
   */
  function turnAround(agent) {
    agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
  }

  function beginWalk(agent, ctx, x, y, speedName) {
    agent.state = S.gehen;
    agent.tx = x;
    agent.ty = y;
    agent.speedBase = A.drawSpeed(agent, agent.spec, speedName);
    // Notbremse: laeuft das Reh deutlich laenger als die Luftlinie hergibt,
    // haengt es an einer Uferbucht fest und sucht sich ein neues Ziel.
    var dist = Math.hypot(x - agent.x, y - agent.y);
    agent.walkTimer = 10 + dist / Math.max(1, agent.speedBase) * 2.5;
  }

  function walkStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.walkTimer -= dt;

    // Am Wasser wird getrunken, sobald es erreichbar ist - der Zielpunkt liegt
    // in der Seemitte, dorthin kommt das Reh nie.
    if (agent.goal === 'wasser' &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.reach) {
      beginDrinking(agent, ctx);
      return;
    }

    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);

    if (result === 'arrived') {
      if (agent.goal === 'punkt') beginGraze(agent, ctx);
      else if (agent.goal === 'wasser') giveUpDrinking(agent, ctx);
      else beginGraze(agent, ctx);
      return;
    }
    if (result === 'blocked' || agent.walkTimer <= 0) {
      if (result === 'blocked') turnAround(agent);
      if (agent.goal === 'wasser') giveUpDrinking(agent, ctx);
      else {
        if (agent.goal === 'punkt') forgetPoint(agent, ctx);
        beginWalkToGrass(agent, ctx);
      }
    }
  }

  // --------------------------------------------------------- Ortsnahrung

  /**
   * Der Blick in die Umgebung. Welche Nahrungsart zuerst geprueft wird, wird
   * ausgewuerfelt - sonst faende ein Reh, das zwischen einem Apfelbaum und
   * einem Nussnest steht, immer nur die Aepfel.
   */
  function lookForPointFood(agent, ctx) {
    var first = agent.rng.chance(0.5) ? 'aepfel' : 'nuesse';
    if (tryPointFood(agent, ctx, first)) return;
    tryPointFood(agent, ctx, first === 'aepfel' ? 'nuesse' : 'aepfel');
  }

  function tryPointFood(agent, ctx, kind) {
    var spec = agent.spec;
    var cfg = spec.forage[kind];
    var skip = (agent.skipKind === kind && ctx.time < agent.skipUntil) ? agent.skipIndex : -1;
    var idx = ctx.foodInSight(agent.x, agent.y, spec.sight.radius, kind, cfg.minEdible, skip);
    if (idx < 0) return false;

    var p = ctx.foodPoint(kind, idx);
    // Was jenseits eines Sees liegt, sieht das Reh zwar, erreichen kann es das
    // Ufer aber nicht - es liefe sonst bis zum Abend am Wasser entlang.
    if (ctx.land.regionAt(p.x, p.y) !== agent.region) return false;

    agent.goal = 'punkt';
    agent.foodKind = kind;
    agent.foodIndex = idx;
    beginWalk(agent, ctx, p.x, p.y, 'wandern');
    return true;
  }

  function forgetPoint(agent, ctx) {
    agent.skipKind = agent.foodKind;
    agent.skipIndex = agent.foodIndex;
    agent.skipUntil = ctx.time + agent.rng.rangeIn(agent.spec.sight.cooldown);
    agent.foodKind = null;
    agent.foodIndex = -1;
    // Erst wieder auf die Wiese, dann wieder schauen.
    agent.lookTimer = agent.rng.rangeIn(agent.spec.sight.pause);
  }

  // ------------------------------------------------------------- Trinken

  function beginDrink(agent, ctx) {
    var bodies = ctx.habitat.bodies;
    if (!bodies.length) {
      agent.nextDrink = ctx.time + WL.SimTime.hours(4);
      return;
    }
    // Naechstes Gewaesser, gemessen ab seinem Ufer statt ab seiner Mitte -
    // sonst zieht ein grosser See in der Ferne staerker als der Tuempel nebenan.
    var best = bodies[0];
    var bestDist = Infinity;
    for (var i = 0; i < bodies.length; i++) {
      var d = Math.hypot(bodies[i].x - agent.x, bodies[i].y - agent.y) - bodies[i].radius;
      if (d < bestDist) { bestDist = d; best = bodies[i]; }
    }
    agent.goal = 'wasser';
    agent.foodKind = null;
    agent.foodIndex = -1;
    beginWalk(agent, ctx, best.x, best.y, 'wandern');
  }

  function beginDrinking(agent, ctx) {
    var spec = agent.spec;
    agent.state = S.trinken;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.drink.bout) * agent.traits.needs;
    agent.nextDrink = ctx.time + WL.SimTime.hours(agent.rng.rangeIn(spec.drink.intervalHours));
    agent.drinks++;
  }

  function drinkStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    // Am Wasser steht es still; nur der Kopf bewegt sich, und den zeichnet
    // niemand. Ein bisschen Drehen haelt die Blickrichtung lebendig.
    agent.heading += Math.sin(ctx.time * 0.7 + agent.index) * 0.10 * dt;
    if (agent.stateTimer <= 0) beginWalkToGrass(agent, ctx, true);
  }

  /** Kein Ufer erreicht: spaeter noch einmal versuchen, jetzt weiteraesen. */
  function giveUpDrinking(agent, ctx) {
    agent.nextDrink = ctx.time + WL.SimTime.hours(agent.rng.range(1, 3));
    beginWalkToGrass(agent, ctx);
  }

  // --------------------------------------------------------------- Nacht

  function sleepStep(agent, ctx, dt) {
    var spec = agent.spec;

    if (agent.state === S.schlafen) {
      agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.06 * dt;
      return;
    }

    if (!agent.sleepSpot) {
      var spot = ctx.land.forestEdgeNear(agent.rng, agent.x, agent.y,
        spec.sleep.searchRadius, agent.region, spec.sleep.maxDistance);
      // Kein Waldrand in Reichweite: dann wird eben im Gras uebernachtet -
      // besser, als die halbe Nacht dorthin unterwegs zu sein.
      agent.sleepSpot = spot || { x: agent.x, y: agent.y };
      agent.goal = 'schlaf';
      agent.foodKind = null;
      agent.foodIndex = -1;
      // Zum Schlafplatz wird gezielt gegangen: die Nacht ist kurz.
      beginWalk(agent, ctx, agent.sleepSpot.x, agent.sleepSpot.y, 'wandern');
    }

    agent.walkTimer -= dt;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);

    // In eine Sackgasse gelaufen: umdrehen und den Waldrand von der neuen
    // Stelle aus neu suchen. Ohne das legt sich das Reh in der Enge zwischen
    // Kartenrand und Ufer schlafen - jede Nacht wieder, weil es am naechsten
    // Abend von derselben Wiese aus wieder dorthin laeuft.
    if (result === 'blocked' && agent.sleepTries < 3) {
      agent.sleepTries++;
      turnAround(agent);
      agent.sleepSpot = null;
      return;
    }

    // Angekommen wird sich hingelegt. Braucht das Reh viel laenger als gedacht
    // oder findet es partout keinen Weg, legt es sich dort hin, wo es gerade
    // steht - ein Reh, das die ganze Nacht laeuft, waere schlimmer als eines,
    // das im Gras schlaeft.
    if (result !== 'moving' || agent.walkTimer <= 0) {
      agent.state = S.schlafen;
      agent.speedBase = 0;
    }
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * Vor grossen Tieren wird geflohen. Im Kernset gibt es davon noch keines -
   * der Zweig ist ueber den kuenstlichen Stoerer in tools/simtest.js geprueft.
   */
  function checkThreat(agent, ctx) {
    var spec = agent.spec;
    if (agent.state === S.fliehen) return false;

    var threat = ctx.nearestDisturber(agent, spec.reaction.fleeRadius * agent.traits.shyness,
      spec.reaction.ignore);
    if (!threat || !threat.spec || threat.spec.size < spec.reaction.fleeFromSize) return false;

    agent.fleeAngle = Math.atan2(agent.y - threat.y, agent.x - threat.x);
    agent.heading = agent.fleeAngle;
    agent.state = S.fliehen;
    agent.goal = 'gras';
    agent.sleepSpot = null;   // aufgeschreckt wird der Schlafplatz neu gesucht
    agent.foodKind = null;
    agent.foodIndex = -1;
    agent.speedBase = A.drawSpeed(agent, spec, 'fliehen');
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.fleeSeconds);
    return true;
  }

  function fleeStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    // Die Richtung wandert leicht, sonst laeuft die Flucht wie am Lineal.
    agent.fleeAngle += Math.sin(ctx.time * 1.7 + agent.index) * 0.6 * dt;
    var result = A.roamStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), agent.fleeAngle, FLEE_TURN);
    if (result === 'blocked') agent.fleeAngle += 1.1;
    if (agent.stateTimer <= 0) beginWalkToGrass(agent, ctx);
  }

  /**
   * Zwei Rehe sehen einander: beide bleiben kurz stehen und gehen dann weiter.
   * Das ist das ganze Sozialverhalten dieser Art. Die Sperrzeit danach ist
   * noetig, weil zwei Rehe, die zufaellig nebeneinander aesen, sonst dauerhaft
   * stillstuenden statt sich nur einmal anzusehen.
   */
  function checkPeer(agent, ctx) {
    var spec = agent.spec;
    if (agent.state !== S.aesen && agent.state !== S.gehen) return;
    if (ctx.time < agent.peerUntil) return;
    if (!ctx.nearestPeer(agent, spec.reaction.peerRadius)) return;

    agent.resumeState = agent.state;
    agent.state = S.sichern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.peerPause);
    agent.peerUntil = ctx.time + agent.rng.rangeIn(spec.reaction.peerCooldown);
  }

  function resumeAfterPause(agent, ctx) {
    if (agent.resumeState === S.aesen) {
      beginGraze(agent, ctx);
      return;
    }
    agent.state = S.gehen;
    agent.speedBase = A.drawSpeed(agent, agent.spec,
      agent.goal === 'gras' ? 'gehen' : 'wandern');
  }

  WL.Brains.reh = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
