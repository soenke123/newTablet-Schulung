/**
 * Verhalten des Hechts - die zweite Nachzuegler-Art, und der Gegenentwurf zum
 * Bussard: der eine hat die ganze Karte und steht nie still, der andere einen
 * einzigen See und steht fast immer.
 *
 * Das Bild, das entstehen soll: ein einzelner Fisch liegt reglos im Uferkraut,
 * Tag und Nacht, und ist auf der Karte kaum mehr als ein Punkt. Alle paar
 * Minuten zieht er an eine andere Stelle des Ufers um. Der Barschschwarm zieht
 * um ihn herum, ohne ihn zu beachten - bis er ihm doch einmal zu nahe kommt.
 * Dann schiesst der Hecht heraus, der Schwarm stiebt auseinander, und der
 * Hecht kehrt an dieselbe Stelle zurueck und liegt wieder still.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Er ist die erste Art, die dauerhaft im Wohnzimmer einer anderen sitzt.**
 *    Bis hierher hat jede neue Art die alten *unterwegs* getroffen: das Reh am
 *    Ufer, der Fuchs auf seiner Runde, der Bussard fuer zwanzig Sekunden ueber
 *    einem Bau. Der Hecht liegt fuenf Tage lang im See des Barsches. Ihn ueber
 *    die normale Stoerabfrage laufen zu lassen ergaebe deshalb keine Stoerung,
 *    sondern einen Dauerzustand - dieselbe Falle, die das schlafende Reh am
 *    Ufer schon einmal gestellt hat (data/tiere.md, Reh). Also: agent.flight
 *    ist in *jedem* Zustand gesetzt ausser dem Sprint, genau wie beim Bussard
 *    ausserhalb seines Jagdkreises. Nur der Ausfall macht ihn greifbar, und
 *    dann loest er die Fluchtlogik des Barsches aus, an der dafuer nichts zu
 *    aendern war.
 * 2. **Gemieden wird er trotzdem - aber bei der Zielwahl, nicht in der
 *    Flucht.** Der Schwarm legt sein naechstes Ziel in neun von zehn Faellen
 *    nicht dorthin, wo der Hecht liegt (js/sim/perch.js, lurkerIn). Das ist
 *    eine Entscheidung und keine Reaktion, und sie sieht ihn gerade deshalb,
 *    weil er reglos daliegt. Die zehnte Wahl ist das Loch in der Regel, und
 *    aus ihm entstehen die Begegnungen - ohne sie kaeme der Hecht nie zum Zug.
 * 3. **Der Sprint endet am Ende einer Leine, nicht nach einer Zeit.** Er hat
 *    zwar eine Hoechstdauer, aber was ihn wirklich beendet, ist der Abstand zum
 *    Lauerplatz (strike.reach). Ein Lauerjaeger, der 70 u/s drei Sekunden lang
 *    faehrt, ist 210 u weit weg und damit ein Hetzjaeger - und die Spur zeigte
 *    eine Verfolgungslinie quer durch den See statt eines Punktes mit Zacken.
 * 4. **Er hat kein Wachfenster.** Kein Schlaf, kein Feierabend, kein Aufbruch
 *    zum Schlafplatz: das Lauern *ist* seine Ruhe. Damit ist er die erste Art
 *    des Katalogs ohne Tagesrhythmus, und im Merkmalsvektor ist genau das seine
 *    trennschaerfste Zeile.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;

  // Drehrate beim Umziehen, rad/s. Wie bei der Ente ein Modulwert und keiner
  // aus species.js: er beschreibt, wie ein Fisch die Kurve nimmt, und nicht,
  // was diese Art ausmacht.
  var SWIM_TURN = 2.4;

  // Notbremse fuer den Umzug. Die Teiche sind rundlich, der Ausweichfaecher
  // kommt also praktisch immer durch - aber "praktisch immer" ist keine
  // Zusage, und ein Fisch, der den Rest der Aufzeichnung an einer Uferzunge
  // klebt, waere derselbe Fehler wie das Reh in seiner Sackgasse. Gemessen
  // greift diese Grenze nie (tools/simtest.js zaehlt sie mit).
  var TRAVEL_MAX = 45;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;

    var body = pickWater(ctx, spec);
    if (!body) return [];

    var count = rng.intIn(spec.count);
    var agents = [];

    for (var k = 0; k < count; k++) {
      var agentRng = ctx.rng.fork('hecht-' + k);
      var p = ctx.habitat.pointAtDepth(agentRng, body, spec.lurk.depth[0], spec.lurk.depth[1]);
      var agent = {
        index: 0,               // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: p.x,
        y: p.y,
        heading: agentRng.range(0, Math.PI * 2),
        state: S.lauern,
        stateTimer: agentRng.rangeIn(spec.lurk.bout),
        speedBase: 0,
        tx: p.x,
        ty: p.y,
        bodyIndex: body.index,
        // Wie der Barsch: genau ein Gewaesser, und es wird nie verlassen.
        homes: [body.index],
        // Der Lauerplatz, an den der Sprint zurueckfuehrt. Er ist kein fester
        // Ort im Sinne des Kaninchenbaus - er wandert alle paar Minuten -,
        // aber innerhalb eines Ausfalls ist er der Anker.
        lurkX: p.x,
        lurkY: p.y,
        strikeTimer: 0,
        travelTimer: 0,
        partner: -1,
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        // Siehe update(): ueberall true ausser im Sprint. Das Feld heisst
        // "flight", weil die fliegende Ente es zuerst gebraucht hat; gelesen
        // wird es von ctx.nearestDisturber als "nicht greifbar". Beim Hecht
        // ist das kein Flug, sondern das Stillliegen im Kraut.
        flight: true,
        strikes: 0,             // fuer die Messung
        stuck: 0                // wie oft TRAVEL_MAX gegriffen hat
      };
      agents.push(agent);
    }

    return agents;
  }

  /**
   * Sein Gewaesser: der groesste See, in dem Barsche leben.
   *
   * "Er ist immer in einem Teich, in dem auch Barsche sind" (data/tiere.md) -
   * gefragt wird deshalb nicht das Raster, sondern der Bestand. Die Barsche
   * stehen beim Anlegen des Hechts laengst da: er kommt erst am Bruch dazu,
   * sie schwimmen seit Tag 1.
   *
   * Der Rueckfall ist fuer isolierte Testlaeufe da (WL.Simulation.run mit einer
   * Artenliste ohne Barsch) und nicht fuer den Unterricht. Ohne ihn faellt die
   * Art dort ersatzlos aus, und ein Vergleichslauf haette gar kein Tier zu
   * vergleichen.
   */
  function pickWater(ctx, spec) {
    var bodies = ctx.habitat.bodies;
    var occupied = {};
    var i;

    for (i = 0; ctx.agents && i < ctx.agents.length; i++) {
      var other = ctx.agents[i];
      if (spec.strike.prey.indexOf(other.speciesId) >= 0 && other.bodyIndex != null) {
        occupied[other.bodyIndex] = true;
      }
    }

    var best = null;
    for (i = 0; i < bodies.length; i++) {
      if (!occupied[bodies[i].index]) continue;
      if (!best || bodies[i].cellCount > best.cellCount) best = bodies[i];
    }
    if (best) return best;

    for (i = 0; i < bodies.length; i++) {
      if (!best || bodies[i].cellCount > best.cellCount) best = bodies[i];
    }
    return best;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    A.updateMood(agent, agent.spec, dt);

    // **Die eine Zeile, an der die ganze Stoerwirkung dieser Art haengt.**
    // Lauernd liegt er reglos im Kraut, umziehend ist er ein Fisch unter
    // anderen - in beiden Faellen zaehlt er fuer ctx.nearestDisturber nicht
    // als greifbares Tier. Nur im Sprint ist er da, und genau dort soll er es
    // sein. Ohne diese Zeile flieht der Barschschwarm fuenf Tage am Stueck.
    agent.flight = agent.state !== S.hetzen;

    if (agent.strikeTimer > 0) agent.strikeTimer -= dt;

    if (agent.state === S.hetzen) { strikeStep(agent, ctx, dt); return; }
    if (agent.state === S.schwimmen) { travelStep(agent, ctx, dt); return; }
    lurkStep(agent, ctx, dt);
  }

  // -------------------------------------------------------------- Lauern

  /**
   * Reglos. Der Fisch wiegt nur den Kopf - eine Idle-Animation ohne
   * Ortsaenderung, dieselbe Loesung wie beim sitzenden Bussard.
   *
   * Beim Dachs war genau das einmal ein Fund: das gemeldete "Herumtrippeln" am
   * Ameisenhuegel war gar keine Positionsaenderung, sondern ein zu kraeftiges
   * Kopfwiegen. Wer hier eine Zahl erhoeht, bewegt kein Tier - er macht nur die
   * Nadel unruhig.
   */
  function lurkStep(agent, ctx, dt) {
    agent.heading += Math.sin(ctx.time * 0.5 + agent.index) * 0.05 * dt;
    agent.speedBase = 0;
    agent.stateTimer -= dt;

    // Der Ausfall geht immer vor dem Umzug: kommt in der letzten Sekunde einer
    // Standzeit ein Barsch vorbei, ist das der Augenblick, auf den diese Art
    // wartet, und nicht der Moment zum Weiterziehen.
    if (agent.strikeTimer <= 0) {
      var prey = ctx.nearestPrey(agent, agent.spec.strike.radius, agent.spec.strike.prey, false);
      if (prey) { beginStrike(agent); return; }
    }

    if (agent.stateTimer <= 0) beginMove(agent, ctx);
  }

  /**
   * **Der Anker wird hier ausdruecklich *nicht* gesetzt** - er gehoert dem
   * gewaehlten Lauerplatz (beginMove) und nicht der Stelle, an der der Fisch
   * gerade zu liegen kommt. Der Unterschied sind 2.5 u, und er hat eine
   * Ratsche gebaut:
   *
   * Ein Sprint traegt den Hecht bis zu 90 u ins tiefe Wasser hinaus. Auf dem
   * Rueckweg haelt er 2.5 u vor dem Anker an - immer auf der Seeseite, denn
   * von dort kommt er. Setzte man den Anker auf diese Stelle, waere er nach
   * dem naechsten Sprint wieder 2.5 u weiter draussen, und so fort. Gemessen
   * auf Seed 13579 (32 Sprints): die Lauertiefe wanderte ueber die fuenf Tage
   * von 4 auf 11 Zellen hinaus, und **alle** 19 zu tiefen Lauerplaetze kamen
   * vom Rueckweg eines Sprints, kein einziger von einem Umzug. Ein Fehler von
   * der Groesse eines halben Rasterfeldes, der sich zwanzigmal addiert.
   */
  function beginLurk(agent) {
    agent.state = S.lauern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(agent.spec.lurk.bout);
  }

  // --------------------------------------------------------------- Umzug

  /**
   * Der naechste Lauerplatz: wieder in Ufernaehe, in Reichweite hop. Gezogen
   * wird aus der Tiefenspanne des Gewaessers, verworfen wird, was zu nah oder
   * zu weit liegt; bleibt nichts uebrig, gewinnt der beste Anlauf.
   *
   * Ein Mindestabstand ist noetig, sonst bestuende der "Umzug" regelmaessig
   * aus zwei Metern und die Kette aus Punkten am Ufer, die diese Art auf die
   * Karte legen soll, waere ein einziger Fleck.
   */
  function beginMove(agent, ctx) {
    var cfg = agent.spec.lurk;
    var body = ctx.habitat.bodies[agent.bodyIndex];
    var best = null;
    var bestMiss = Infinity;
    var mid = (cfg.hop[0] + cfg.hop[1]) / 2;

    for (var t = 0; t < cfg.tries; t++) {
      var p = ctx.habitat.pointAtDepth(agent.rng, body, cfg.depth[0], cfg.depth[1]);
      var d = Math.sqrt((p.x - agent.x) * (p.x - agent.x) + (p.y - agent.y) * (p.y - agent.y));
      if (d >= cfg.hop[0] && d <= cfg.hop[1]) { best = p; break; }
      var miss = Math.abs(d - mid);
      if (miss < bestMiss) { bestMiss = miss; best = p; }
    }

    agent.tx = best.x;
    agent.ty = best.y;
    // Der Anker ist der *gewaehlte* Platz, nicht der erreichte - siehe
    // beginLurk. Nur so fuehrt jeder Sprint an dieselbe Stelle zurueck.
    agent.lurkX = best.x;
    agent.lurkY = best.y;
    agent.state = S.schwimmen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'schwimmen');
    agent.travelTimer = TRAVEL_MAX;
  }

  /**
   * Unterwegs zum Lauerplatz - und zugleich der Rueckweg nach einem Sprint.
   * Beides ist derselbe Zustand mit demselben Tempo; unterschieden wird nur,
   * *wohin* tx/ty zeigen. Ein eigener Zustand "kehrt zurueck" waere eine
   * Zeile mehr im Merkmalsvektor und keine im Bild.
   */
  function travelStep(agent, ctx, dt) {
    var body = ctx.habitat.bodies[agent.bodyIndex];
    var result = A.swimStep(agent, ctx.habitat, body, dt,
      A.effectiveSpeed(agent, agent.speedBase), SWIM_TURN, agent.spec.lurk.arriveRadius);

    agent.travelTimer -= dt;

    if (result === 'arrived') { beginLurk(agent); return; }
    // Sackgasse oder ein Ziel, das der Faecher nicht erreicht: nicht stehen
    // bleiben, sondern ein neues Ziel suchen. Ein Fisch, der den Rest der
    // Aufzeichnung an einer Uferzunge klebt, ist derselbe Fehler wie das Reh
    // in seiner Sackgasse - dort hat er nur niemandem gefehlt.
    if (result === 'blocked' || agent.travelTimer <= 0) {
      agent.stuck++;
      beginMove(agent, ctx);
    }
  }

  // -------------------------------------------------------------- Sprint

  function beginStrike(agent) {
    agent.state = S.hetzen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'hetzen');
    agent.stateTimer = agent.rng.rangeIn(agent.spec.strike.bout);
    agent.strikes++;
  }

  /**
   * Der Ausfall. Er faehrt auf den Barsch zu, der gerade am naechsten ist -
   * neu gefragt in jedem Tick, sonst schoesse er auf eine Stelle, an der
   * laengst kein Fisch mehr steht.
   *
   * Beendet wird er an der *Leine*: sobald der Abstand zum Lauerplatz
   * strike.reach ueberschreitet, ist Schluss, auch wenn die Zeit noch laeuft.
   * Ohne diese Grenze traegt ihn ein Sprint mit 70 u/s ueber drei Sekunden
   * 210 u weit - und aus dem Lauerjaeger, dessen Spur ein Punkt mit ein paar
   * Zacken ist, wuerde einer, der den halben See durchquert.
   *
   * Getoetet wird nichts: der Sprint endet damit, dass die Beute weg ist.
   */
  function strikeStep(agent, ctx, dt) {
    var body = ctx.habitat.bodies[agent.bodyIndex];
    var cfg = agent.spec.strike;

    var prey = ctx.nearestPrey(agent, cfg.reach, cfg.prey, false);
    if (prey) { agent.tx = prey.x; agent.ty = prey.y; }

    A.swimStep(agent, ctx.habitat, body, dt,
      A.effectiveSpeed(agent, agent.speedBase), SWIM_TURN, 1.5);

    agent.stateTimer -= dt;

    var dx = agent.x - agent.lurkX;
    var dy = agent.y - agent.lurkY;
    if (agent.stateTimer > 0 && dx * dx + dy * dy < cfg.reach * cfg.reach) return;

    // Zurueck an dieselbe Stelle. Das ist die Entscheidung, die ihn zum
    // Lauerjaeger macht - nicht das Tempo, nicht die Reichweite.
    agent.tx = agent.lurkX;
    agent.ty = agent.lurkY;
    agent.state = S.schwimmen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'schwimmen');
    agent.travelTimer = TRAVEL_MAX;
    agent.strikeTimer = agent.rng.rangeIn(cfg.cooldown);
  }

  WL.Brains.hecht = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
