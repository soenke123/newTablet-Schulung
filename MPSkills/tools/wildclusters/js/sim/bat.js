/**
 * Verhalten der Fledermaus - die zweite Art ganz ohne Nahrung, und die erste,
 * die sich frei bewegt statt an eine Domaene (Wasser oder Land) gebunden zu
 * sein.
 *
 * Das Bild, das entstehen soll: nachts fliegen ein paar Fledermaeuse von einem
 * von zwei Schlafplaetzen je Wald zu einem von 5-7 ovalen Jagdgebieten,
 * huschen dort in schnellen, zackigen Stoessen umher und drehen am Rand des
 * Gebiets in einer engen Schleife bei statt einfach umzukehren. Einmal pro
 * Nacht wechseln sie unabhaengig voneinander das Jagdgebiet, vor der
 * Morgendaemmerung geht es zurueck zu einem (jeden Tag neu gewuerfelten)
 * Schlafplatz.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Sie frisst nicht, trinkt nicht, reagiert auf niemanden.** Wie das
 *    Kaninchen kein forage-Block, kein Durst - aber anders als das Kaninchen
 *    auch keine Bedrohungsabfrage. data/tiere.md ist hier ausdruecklich:
 *    "keine Interaktion mit anderen Tieren". agent.flight sorgt dafuer, dass
 *    sie umgekehrt fuer niemanden als Stoerung zaehlt (ctx.nearestDisturber) -
 *    ohne das wuerde sie, wenn ein Jagdgebiet ueber einem See liegt, jeden
 *    Barschschwarm darunter aufschrecken, denn dessen Fluchtpruefung kennt
 *    keine Groessenschwelle.
 * 2. **Schlafplaetze und Jagdgebiete sind weltweite Pools, keine Reviere.**
 *    Alle Fledermaeuse der Karte wuerfeln unabhaengig voneinander taeglich
 *    einen Schlafplatz und naechtlich ein Jagdgebiet aus demselben Topf -
 *    Naehe zu anderen entsteht aus Zufall, nicht aus Zusammenhalt. Das ist die
 *    vierte Form von Sozialverhalten im Katalog (nach Schwarm, Rotte und der
 *    Familie am Bau) und die loseste von allen: nicht einmal ein gemeinsamer
 *    fester Ort verbindet zwei Fledermaeuse laenger als eine Nacht.
 * 3. **Der Flug braucht keinen Ausweichfaecher.** Wasser- und Landtiere weichen
 *    dem Ufer fächerförmig aus (js/sim/agents.js, FAN), weil sie ihre Domaene
 *    nie verlassen duerfen. Eine Fledermaus darf ueberall hinfliegen - ihre
 *    Bewegung ist deshalb komplett domaenenfrei und braucht die geteilten
 *    Schritt-Funktionen aus agents.js gar nicht, genau wie schon der Flug der
 *    Ente (js/sim/duck.js) seine eigene, domaenenfreie Flugbahn mitbringt.
 * 4. **Zwei Bewegungsarten, keine.** "Zackig" entsteht aus haeufigen, harten
 *    Kursspruengen (beginDart) - nicht aus sanftem Eindrehen wie beim Fliehen
 *    anderer Tiere. Der "Wendekreis" ist eine eigene, zeitlich begrenzte
 *    Schleife (beginCircle/circleStep), die ausschliesslich am Rand des
 *    Jagdgebiets ausgeloest wird, wenn der naechste Kursstoss sonst
 *    hinausfuehren wuerde - nicht bei jeder Kursaenderung.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TRAVEL_ARRIVE = 6;
  // Sicherheitsabstand der Jagdgebiete zum Kartenrand - groesszuegiger als der
  // Wendekreis (siehe beginCircle) je ausschlagen kann, damit der auch dort
  // noch Platz hat, wo ein Gebiet sonst bis an den Rand reichen wuerde.
  var EDGE_MARGIN = 60;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;

    /*
     * Zwei weltweite Pools, einmal je Welt gesucht - nicht je Tier. Beide Forks
     * liegen unter derselben Art-RNG wie die einzelnen Fledermaeuse (ctx.rng),
     * aber unter eigenem Namen, damit sie unabhaengig von der spaeteren Tierzahl
     * immer dieselben Orte ergeben.
     *
     * Ein Nachzuegler *uebernimmt* sie von den schon lebenden Fledermaeusen
     * (A.livingOf; beim Aufbau der Welt ist diese Liste leer). Sie neu zu suchen
     * waere hier die teuerste Art, es falsch zu machen: sein eigener Fork ergaebe
     * einen *zweiten* Satz Schlafplaetze und Jagdgebiete, die Art haette zwei
     * Landkarten, und der Neue flaege fuenf Tage lang an keinen Ort, an dem je
     * ein Artgenosse war. Genau das ist der Grund, warum das Flag lateArrival
     * nicht einfach an jeder Art stehen darf.
     */
    var known = A.livingOf(ctx.agents, spec.id);
    var roosts = known.length ? known[0].roosts : findRoosts(ctx, spec, rng.fork('schlafplaetze'));
    var grounds = known.length ? known[0].grounds
      : findHuntingGrounds(ctx, spec, rng.fork('jagdgebiete'));
    if (!roosts.length || !grounds.length) return [];

    var count = rng.intIn(spec.count);
    var agents = [];

    for (var k = 0; k < count; k++) {
      // Der Nachzuegler haengt an fork('nachzuegler-N') und trifft damit trotz
      // desselben Namens einen anderen Zufallsstrom als die Fledermaus 0 des
      // Startbestands, die unter fork('fledermaus') liegt.
      var agentRng = ctx.rng.fork('fledermaus-' + k);
      var roost = roosts[agentRng.int(0, roosts.length - 1)];
      var ground = grounds[agentRng.int(0, grounds.length - 1)];

      var agent = {
        index: 0,               // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: roost.x,
        y: roost.y,
        heading: agentRng.range(0, Math.PI * 2),
        state: S.schlafen,
        stateTimer: 0,
        speedBase: 0,
        tx: roost.x,
        ty: roost.y,
        roosts: roosts,
        grounds: grounds,
        roost: roost,
        ground: ground,
        homebound: false,
        // Gestreut, damit nicht alle Fledermaeuse in derselben ersten Nacht
        // gleichzeitig das Jagdgebiet wechseln.
        groundTimer: WL.SimTime.hours(agentRng.range(0, spec.grounds.switchHours[1])),
        dartTimer: 0,
        circling: false,
        circleCap: 0,
        circleDir: 1,
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        partner: -1,
        flight: null,            // true, solange sie in der Luft ist - siehe update()
        switches: 0              // wie oft sie das Jagdgebiet innerhalb einer Nacht wechselt
      };
      agents.push(agent);
    }

    return agents;
  }

  /**
   * Zwei Schlafplaetze je Waldstueck. Es gibt keine weitere Bedingung (data/
   * tiere.md nennt keine) - "ist Wald" ist bereits die ganze Regel, und die
   * liefert world.query.isForest schon fertig; ein eigener Eintrag in
   * js/world/rules.js waere hier nur ein Wrapper ohne eigenen Inhalt.
   */
  function findRoosts(ctx, spec, rng) {
    var regions = ctx.world.terrain.forestRegions;
    var roosts = [];
    for (var r = 0; r < regions.length; r++) {
      for (var k = 0; k < spec.roost.perForest; k++) {
        roosts.push(pointInForestRegion(ctx, rng, regions[r]));
      }
    }
    return roosts;
  }

  function pointInForestRegion(ctx, rng, region) {
    var b = region.bounds;
    for (var t = 0; t < 20; t++) {
      var x = rng.range(b.minX, b.maxX);
      var y = rng.range(b.minY, b.maxY);
      if (ctx.land.terrainAt(x, y) === T.FOREST) return { x: x, y: y };
    }
    // Ein Waldstueck ohne eigene Waldzelle in seinem umschliessenden Rechteck
    // gibt es praktisch nicht, aber der Mittelpunkt ist ein sicherer Rueckfall.
    return { x: region.x, y: region.y };
  }

  /**
   * 5-7 Ovale ueber Gras, Wasser oder beidem (data/tiere.md) - anders als
   * jede andere Ortsregel im Katalog haengen sie an keinem Weltobjekt,
   * sondern werden nach dem Terrain darunter ausgesucht: mehrere
   * Kandidatenmittelpunkte, je ein paar Stichproben im Oval, genommen wird
   * der mit dem groessten Anteil aus Gras und Wasser. Das ist derselbe
   * Rueckfall wie beim Kaninchenbau (openShare in js/sim/rabbit.js) - lieber
   * der beste gefundene Platz als gar keiner.
   */
  function findHuntingGrounds(ctx, spec, rng) {
    var q = ctx.world.query;
    var cfg = spec.grounds;
    var totalArea = q.width * q.height;
    var count = rng.intIn(cfg.count);
    var grounds = [];

    for (var g = 0; g < count; g++) {
      var areaShare = rng.range(cfg.areaShare[0], cfg.areaShare[1]);
      var aspect = rng.range(cfg.aspect[0], cfg.aspect[1]);
      var area = totalArea * areaShare;
      var ry = Math.sqrt(area / (Math.PI * aspect));
      var rx = ry * aspect;
      // Sicherheitsabstand zum Kartenrand: nicht nur die Ellipse selbst muss
      // auf die Karte passen, sondern auch der Wendekreis am Rand des
      // Jagdgebiets (siehe beginCircle) braucht noch etwas Luft dahinter.
      rx = Math.min(rx, q.width * 0.45 - EDGE_MARGIN);
      ry = Math.min(ry, q.height * 0.45 - EDGE_MARGIN);
      grounds.push(pickGroundSpot(q, rng, cfg, rx, ry));
    }
    return grounds;
  }

  function pickGroundSpot(q, rng, cfg, rx, ry) {
    var best = null;
    var bestShare = -1;
    for (var t = 0; t < cfg.tries; t++) {
      var cx = rng.range(rx + EDGE_MARGIN, q.width - rx - EDGE_MARGIN);
      var cy = rng.range(ry + EDGE_MARGIN, q.height - ry - EDGE_MARGIN);
      var share = openWaterShare(q, cx, cy, rx, ry, cfg.samples);
      if (share > bestShare) { bestShare = share; best = { x: cx, y: cy, rx: rx, ry: ry }; }
      if (share >= 0.7) break;
    }
    return best;
  }

  /** Anteil der Stichproben (Mitte plus Ring) auf Gras oder Wasser. */
  function openWaterShare(q, cx, cy, rx, ry, samples) {
    var hits = 0;
    for (var i = 0; i < samples; i++) {
      var x, y;
      if (i === 0) { x = cx; y = cy; }
      else {
        var a = (i - 1) / (samples - 1) * Math.PI * 2;
        x = cx + Math.cos(a) * rx * 0.7;
        y = cy + Math.sin(a) * ry * 0.7;
      }
      var terrain = q.terrainAt(x, y);
      if (terrain === T.GRASS || terrain === T.WATER) hits++;
    }
    return hits / samples;
  }

  function insideGround(ground, x, y) {
    var dx = (x - ground.x) / ground.rx;
    var dy = (y - ground.y) / ground.ry;
    return dx * dx + dy * dy <= 1;
  }

  /** Gleichverteilter Punkt in einem Oval - fuer das Anflugziel. */
  function randomPointIn(ground, rng) {
    var a = rng.range(0, Math.PI * 2);
    var r = Math.sqrt(rng.next());
    return {
      x: ground.x + Math.cos(a) * r * ground.rx,
      y: ground.y + Math.sin(a) * r * ground.ry
    };
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);
    // Wie bei der fliegenden Ente zaehlt sie waehrend des Fluges fuer andere
    // Tiere nicht als greifbare Stoerung - siehe Kopfkommentar, Punkt 1.
    agent.flight = agent.state !== S.schlafen;

    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);

    if (!awake || settling) {
      if (agent.state === S.schlafen) { restStep(agent, ctx, dt); return; }
      if (!agent.homebound) { beginReturn(agent, ctx); return; }
      travelStep(agent, ctx, dt);
      return;
    }

    if (agent.state === S.schlafen) { beginDeparture(agent, ctx); return; }
    if (agent.state === S.fliegen) { travelStep(agent, ctx, dt); return; }

    agent.groundTimer -= dt;
    if (agent.groundTimer <= 0) { beginGroundSwitch(agent, ctx); return; }

    huntStep(agent, ctx, dt);
  }

  /** Am Schlafplatz: kaum merkliches Ruehren, kein eigener Zustand noetig. */
  function restStep(agent, ctx, dt) {
    agent.heading += Math.sin(ctx.time * 0.4 + agent.index) * 0.05 * dt;
  }

  // ------------------------------------------------------------- Reiseflug

  /**
   * Direkter Flug auf tx/ty zu, ganz ohne Domaenenpruefung - siehe Punkt 3.
   *
   * Anders als walkStep/swimStep dreht das nicht mit einer begrenzten Rate
   * auf das Ziel ein, sondern zeigt jeden Tick genau dorthin: "ein normaler
   * Zielflug, gerader ... als das Jagen" (data/tiere.md) ist eine gerade
   * Strecke, kein Bogen. Das ist nicht nur die einfachere Umsetzung, sondern
   * auch die einzige, die garantiert auf der Karte bleibt - ein Bogen mit
   * begrenzter Drehrate kann kurz ueber ein Ziel nah am Kartenrand
   * hinausschwingen, bevor er einschwenkt, ein direkter Kurs auf einen Punkt
   * innerhalb der Karte dagegen nie: die Karte ist ein Rechteck, und jeder
   * Punkt auf der geraden Strecke zwischen zwei Punkten darin liegt selbst
   * darin.
   */
  function flyTowards(agent, dt, speed, arriveRadius) {
    var dx = agent.tx - agent.x;
    var dy = agent.ty - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= arriveRadius) return 'arrived';
    agent.heading = Math.atan2(dy, dx);
    var step = Math.min(speed * dt, dist);
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;
    return 'moving';
  }

  function travelStep(agent, ctx, dt) {
    var result = flyTowards(agent, dt, A.effectiveSpeed(agent, agent.speedBase), TRAVEL_ARRIVE);
    if (result !== 'arrived') return;
    if (agent.homebound) arriveAtRoost(agent);
    else arriveAtGround(agent);
  }

  function beginDeparture(agent, ctx) {
    var spec = agent.spec;
    var target = randomPointIn(agent.ground, agent.rng);
    agent.tx = target.x;
    agent.ty = target.y;
    agent.state = S.fliegen;
    agent.homebound = false;
    agent.speedBase = A.drawSpeed(agent, spec, 'reisen');
    agent.groundTimer = WL.SimTime.hours(agent.rng.rangeIn(spec.grounds.switchHours));
  }

  function beginGroundSwitch(agent, ctx) {
    var spec = agent.spec;
    agent.ground = pickOtherGround(agent);
    agent.switches++;
    var target = randomPointIn(agent.ground, agent.rng);
    agent.tx = target.x;
    agent.ty = target.y;
    agent.state = S.fliegen;
    agent.homebound = false;
    agent.circling = false;
    agent.speedBase = A.drawSpeed(agent, spec, 'reisen');
    agent.groundTimer = WL.SimTime.hours(agent.rng.rangeIn(spec.grounds.switchHours));
  }

  function pickOtherGround(agent) {
    var grounds = agent.grounds;
    if (grounds.length < 2) return agent.ground;
    for (var t = 0; t < 6; t++) {
      var next = grounds[agent.rng.int(0, grounds.length - 1)];
      if (next !== agent.ground) return next;
    }
    return agent.ground;
  }

  /**
   * Feierabend: nicht zum bisherigen Schlafplatz zurueck, sondern zu einem
   * frisch gewuerfelten - data/tiere.md ist hier ausdruecklich: jeden Tag neu.
   */
  function beginReturn(agent, ctx) {
    var spec = agent.spec;
    agent.roost = agent.roosts[agent.rng.int(0, agent.roosts.length - 1)];
    agent.tx = agent.roost.x;
    agent.ty = agent.roost.y;
    agent.state = S.fliegen;
    agent.homebound = true;
    agent.circling = false;
    agent.speedBase = A.drawSpeed(agent, spec, 'reisen');
  }

  function arriveAtGround(agent) {
    var spec = agent.spec;
    agent.state = S.jagen;
    agent.speedBase = A.drawSpeed(agent, spec, 'jagen');
    agent.dartTimer = 0;      // sofort die erste Kursaenderung
    agent.circling = false;
  }

  function arriveAtRoost(agent) {
    agent.state = S.schlafen;
    agent.speedBase = 0;
    agent.homebound = false;
  }

  // --------------------------------------------------------------- Jagen

  /**
   * Das zackige Jagen: solange kein Wendekreis laeuft, alle paar Zehntel-
   * sekunden ein neuer, hart gewuerfelter Kurs (beginDart). Fuehrt der naechste
   * Schritt aus dem Jagdgebiet hinaus, wird der Schritt verworfen und
   * stattdessen die Schleife ausgeloest - die Fledermaus bleibt also immer
   * innerhalb, ausser waehrend der Schleife selbst (siehe circleStep).
   */
  function huntStep(agent, ctx, dt) {
    if (agent.circling) { circleStep(agent, ctx, dt); return; }

    agent.dartTimer -= dt;
    if (agent.dartTimer <= 0) beginDart(agent);

    var speed = A.effectiveSpeed(agent, agent.speedBase);
    var nx = agent.x + Math.cos(agent.heading) * speed * dt;
    var ny = agent.y + Math.sin(agent.heading) * speed * dt;

    if (!insideGround(agent.ground, nx, ny)) { beginCircle(agent); return; }

    agent.x = nx;
    agent.y = ny;
  }

  function beginDart(agent) {
    var hunt = agent.spec.hunt;
    agent.heading += agent.rng.range(-hunt.jitter, hunt.jitter);
    agent.dartTimer = agent.rng.rangeIn(hunt.dartSeconds);
  }

  /**
   * Der Wendekreis: eine feste Drehrichtung, gewaehlt zur kuerzeren Seite in
   * Richtung Gebietsmitte, dann eine konstante Drehrate. Beendet wird die
   * Schleife nicht nach einer festen Zeitspanne, sondern sobald der Kurs
   * wirklich zurueck ins Gebiet zeigt - jeden Tick neu geprueft.
   *
   * Das ist kein Feinschliff: eine feste Dauer dreht oft laenger als noetig
   * (die Fledermaus zeigt schon nach einem Bruchteil der Zeit zur Mitte,
   * dreht aber weiter und schwenkt wieder hinaus) und manchmal zu kurz. Beides
   * kann sie ueber den Kartenrand hinaustreiben, wenn ein Jagdgebiet nah genug
   * am Rand liegt - genau das ist der Fehler, den tools/simtest.js gefunden
   * hat, bevor diese Version stand.
   */
  function beginCircle(agent) {
    var hunt = agent.spec.hunt;
    var toCenter = Math.atan2(agent.ground.y - agent.y, agent.ground.x - agent.x);
    agent.circleDir = A.angleDelta(agent.heading, toCenter) >= 0 ? 1 : -1;
    agent.circling = true;
    // Notbremse: eine gute Umdrehung reicht immer, um wieder zurueck ins
    // Gebiet zu finden - mehr braucht die Schleife bei keiner Geometrie.
    agent.circleCap = (Math.PI * 2 / hunt.circleRate) * 1.3;
  }

  function circleStep(agent, ctx, dt) {
    var hunt = agent.spec.hunt;
    agent.heading += agent.circleDir * hunt.circleRate * dt;
    var speed = A.effectiveSpeed(agent, agent.speedBase);
    var nx = agent.x + Math.cos(agent.heading) * speed * dt;
    var ny = agent.y + Math.sin(agent.heading) * speed * dt;
    agent.x = nx;
    agent.y = ny;

    agent.circleCap -= dt;
    if (insideGround(agent.ground, nx, ny) || agent.circleCap <= 0) {
      agent.circling = false;
      beginDart(agent);
    }
  }

  WL.Brains.fledermaus = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
