/**
 * Verhalten des Igels - die erste Art, deren Nacht ein Drehbuch ist.
 *
 * Das Bild, das entstehen soll: ein kleines, gemaechliches Tier, das zwischen
 * drei bis fuenf dicht beieinanderliegenden Futterplaetzen hin und her wechselt
 * und sonst nichts tut. Jede Nacht laeuft gleich ab:
 *
 *   aufwachen  - er liegt an dem Platz, an dem die letzte Nacht endete
 *   Auftakt    - dort ein paar Bissen, mit winzigen Schritten dazwischen
 *   Trinken    - einmal zum naechsten Gewaesser, kurz, dann wieder weg
 *   Umzug      - zielstrebig zu einem *anderen* seiner Plaetze
 *   Nacht      - dort den ganzen Rest der Nacht fressen
 *   Schlafen   - und dort auch einschlafen
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Die Reihenfolge ist fest, nicht abgewogen.** Bei Reh, Wildschwein und
 *    Dachs entsteht die Nacht aus einem Vergleich von Beduerfnissen ("wer ist
 *    ueberfaelliger"). Genau das kann "jede Nacht ist aehnlich" nicht
 *    einhalten, weil ein Vergleich in jeder Nacht anders ausgeht. Der Igel hat
 *    deshalb keinen Durstzaehler, sondern einen Ablauf (agent.phase).
 * 2. **Sein Revier sind Punkte, kein Gebiet.** Was er besitzt, ist eine Liste
 *    von 3-5 Futterplaetzen um einen Apfelbaum herum (findHome). Er waehlt nie
 *    einen Ort, der nicht darin steht - "er geht keine weiten Strecken" ist
 *    damit strukturell erfuellt und nicht ueber einen Radius erzwungen.
 * 3. **Der Schlafplatz ist der Futterplatz.** Er hat keinen Bau und sucht
 *    abends nichts: wo er zuletzt gefressen hat, schlaeft er. Die einzige
 *    Ausnahme steht so im Katalog - am Ameisenhuegel, also auf offener Flaeche,
 *    zieht er noch zum naechsten Waldrand. Dadurch beginnt die naechste Nacht
 *    von selbst dort, wo es auch etwas zu fressen gibt.
 * 4. **Er flieht nicht, er rollt sich ein** (Zustand einrollen). Das ist die
 *    einzige Reaktion des ganzen Katalogs, bei der ein Tier *langsamer* wird,
 *    und sie braucht deshalb eine Sperrzeit: ein aesendes Reh steht minutenlang
 *    daneben, und ohne sie laege der Igel die halbe Nacht als Kugel im Gras -
 *    dieselbe Stoerung-gegen-Dauerzustand-Falle wie beim schlafenden Reh am
 *    Ufer.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 1.4;            // rad/s - gemaechlicher noch als der Dachs (1.8)
  var ARRIVE = 7;
  var NIBBLE_ARRIVE = 2.5;   // die Schrittchen beim Fressen sind kurz
  var CHECK_SECONDS = 0.3;

  var APPLE = 'fallobst';
  var ANT = 'ameisenstrasse';
  var EDGE = 'waldboden';

  var scratch = { x: 0, y: 0, value: 0 };

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var count = ctx.rng.intIn(spec.count);
    var agents = [];
    var k;

    for (k = 0; k < count; k++) {
      var rng = ctx.rng.fork('igel-' + k);
      var home = findHome(ctx, spec, rng);
      if (!home) continue;

      // Angefangen wird an einem seiner Plaetze - die Aufzeichnung beginnt um
      // Mitternacht, also mitten im Wachfenster. Wer hier einen festen Platz
      // naehme, liesse alle Igel einer Welt am selben Baum sitzen.
      var spot = home.spots[Math.floor(rng.next() * home.spots.length)];

      var agent = {
        index: 0,               // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: rng,
        x: spot.x,
        y: spot.y,
        heading: rng.range(0, Math.PI * 2),
        speedBase: 0,
        tx: spot.x,
        ty: spot.y,
        region: home.region,
        spots: home.spots,
        spot: spot,
        traits: A.createTraits(rng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        checkTimer: rng.range(0, CHECK_SECONDS),
        // Der Ablauf der Nacht: 'auftakt' | 'wasser' | 'umzug' | 'nacht' | 'bett'.
        phase: 'auftakt',
        goal: 'fressen',
        state: S.wuehlen,
        stateTimer: 0,
        // Zaehler in Sekunden statt Zeitpunkten: ein Nachzuegler entsteht
        // mitten im Lauf, und eine absolute Uhrzeit aus dem Anlegen waere fuer
        // ihn schon abgelaufen, bevor er den ersten Schritt getan hat.
        feedTimer: rng.rangeIn(spec.feed.opening),
        nibbleTimer: rng.rangeIn(spec.feed.nibble),
        stepping: false,
        empty: 0,               // wie lange er hier schon nichts mehr findet
        walkTimer: 0,
        rollUntil: 0,
        partner: -1,
        flight: null,           // laeuft nie in die Luft; das Feld liest die Stoerabfrage
        drinks: 0,
        moves: 0,               // Platzwechsel
        rolls: 0
      };
      agent.speedBase = A.drawSpeed(agent, spec, 'wuehlen');
      agents.push(agent);
    }

    return agents;
  }

  /**
   * Die Futterplaetze einer Igels.
   *
   * Gesucht wird vom Apfelbaum aus und nicht von einer freien Stelle im
   * Gelaende - dieselbe Umkehrung wie beim Dachsbau, und aus demselben Grund:
   * "mindestens ein Apfelbaum ist dabei" ist eine Bedingung, die ein freier
   * Griff ins Raster praktisch nie erfuellt (8-18 Baeume auf 1600 x 1000 u).
   *
   * Drei Stufen lockern nacheinander den Umkreis und den Wasserabstand, damit
   * auf einer unguenstigen Karte nicht die ganze Art ausfaellt.
   *
   * **Die letzte Stufe war einmal auf 1.5 gedeckelt und ist es wieder nicht.**
   * Der Gedanke war richtig - sie weitet den Umkreis auf 520 u, und auf Seed
   * 315927 lagen die Plaetze danach 506 u auseinander, der Igel lief mehr als
   * er frass. Gemessen half der Deckel aber nicht, sondern schadete: auf 315927
   * fand die Suche gar keinen Platz mehr (kein Igel in dieser Welt), und auf
   * 13579 traf sie stattdessen einen *schlechteren* Ankerbaum mit weiterem
   * Wasser - dort kippte der Laufanteil erst recht (19 % fressen gegen 32 %
   * gehen, vorher 31 gegen 18). **Eine engere Suche findet nicht das gleiche
   * Ergebnis in kleiner, sondern ein anderes.** Der weite Fall bleibt deshalb
   * stehen und wird gemessen statt wegjustiert (tools/simtest.js).
   */
  var STAGES = [1.0, 1.4, 2.0];

  function findHome(ctx, spec, rng) {
    var home = spec.home;
    var trees = ctx.world.objects.appleTrees || [];
    if (!trees.length) return null;

    for (var s = 0; s < STAGES.length; s++) {
      var slack = STAGES[s];
      for (var t = 0; t < home.tries; t++) {
        var pick = Math.floor(rng.next() * trees.length);
        var anchor = trees[pick];
        if (!WL.Rules.placement.hedgehogRange(ctx.world.query, anchor, home, slack)) continue;
        var region = ctx.land.regionAt(anchor.x, anchor.y);
        if (region <= 0) continue;
        var spots = collectSpots(ctx, spec, rng, anchor, pick, region, home.radius * slack);
        if (spots.length < home.minSpots) continue;
        return { region: region, spots: spots };
      }
    }
    return null;
  }

  /**
   * Was liegt um den Ankerbaum herum? Der Reihe nach: der Baum selbst, ein
   * Ameisenhuegel (wenn einer daliegt - es gibt nur 3-4 auf der Karte), ein
   * zweiter Apfelbaum (nur wenn er weit genug entfernt steht, innerhalb einer
   * Baumgruppe ist er das selten), und aufgefuellt wird mit Waldrandstellen.
   *
   * Jeder Platz muss von allen bisherigen mindestens minApart und hoechstens
   * radius entfernt sein (siehe fits) - unten die Bedingung, dass zwei Plaetze
   * im Merkmalsvektor nicht zu *einem* festen Ort verschmelzen, oben die, dass
   * sie "relativ eng beieinander" liegen.
   */
  function collectSpots(ctx, spec, rng, anchor, anchorIndex, region, radius) {
    var home = spec.home;
    var want = rng.intIn(home.spots);
    var spots = [{ kind: APPLE, index: anchorIndex, x: anchor.x, y: anchor.y }];
    var i;

    var hills = ctx.world.objects.anthills || [];
    for (i = 0; i < hills.length && spots.length < want; i++) {
      if (!fits(spots, hills[i], radius, home.minApart)) continue;
      if (ctx.land.regionAt(hills[i].x, hills[i].y) !== region) continue;
      spots.push({ kind: ANT, index: i, x: hills[i].x, y: hills[i].y });
      break;                   // hoechstens einer, sie liegen 320 u auseinander
    }

    var trees = ctx.world.objects.appleTrees || [];
    for (i = 0; i < trees.length && spots.length < want; i++) {
      if (i === anchorIndex) continue;
      if (!fits(spots, trees[i], radius, home.minApart)) continue;
      if (ctx.land.regionAt(trees[i].x, trees[i].y) !== region) continue;
      spots.push({ kind: APPLE, index: i, x: trees[i].x, y: trees[i].y });
      break;
    }

    // Der Waldrand fuellt auf - er ist die einzige der drei Nahrungsarten, die
    // nicht an einem Weltobjekt haengt und deshalb beliebig oft vorkommt.
    for (i = 0; i < 60 && spots.length < want; i++) {
      var p = ctx.land.pointInRing(rng, anchor.x, anchor.y, 0, radius, T.FOREST, region);
      if (!p) continue;
      var depth = ctx.land.forestDepthAt(p.x, p.y);
      if (depth < home.edgeDepth[0] || depth > home.edgeDepth[1]) continue;
      if (!fits(spots, p, radius, home.minApart)) continue;
      spots.push({ kind: EDGE, index: -1, x: p.x, y: p.y });
    }

    return spots;
  }

  /**
   * Nah genug an allen bisherigen Plaetzen - und weit genug von jedem.
   *
   * **Die Obergrenze gilt paarweise und nicht nur zum Anker, und das ist der
   * Unterschied zwischen "eng beieinander" und "irgendwo im Umkreis".** Zwei
   * Plaetze auf gegenueberliegenden Seiten des Ankerkreises sind zwei Radien
   * auseinander; auf Seed 315927 lagen so 607 u zwischen zweien, und der Igel
   * verbrachte danach ebenso viel Zeit mit Laufen wie mit Fressen. Paarweise
   * gemessen liegen alle Plaetze in einem Kreis vom *Durchmesser* radius, und
   * "er geht keine weiten Strecken" folgt aus der Geometrie statt aus einer
   * Pruefschwelle.
   */
  function fits(spots, p, radius, minApart) {
    for (var i = 0; i < spots.length; i++) {
      var d = Math.hypot(spots[i].x - p.x, spots[i].y - p.y);
      if (d < minApart || d > radius) return false;
    }
    return true;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    if (agent.state === S.schlafen) { sleepStep(agent, ctx, dt); return; }

    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = CHECK_SECONDS;
      if (checkThreat(agent, ctx)) return;
    }

    // Das Einrollen geht allem vor, auch der Morgendaemmerung: ein Igel, der
    // sich eingerollt hat, laeuft nicht deswegen los, weil es hell wird.
    if (agent.state === S.einrollen) { rollStep(agent, ctx, dt); return; }

    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (!awake || settling) { goToBed(agent, ctx, dt); return; }

    if (agent.state === S.wuehlen) { feedStep(agent, ctx, dt); return; }
    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    travelStep(agent, ctx, dt);
  }

  // -------------------------------------------------------------- Fressen

  function beginFeed(agent, ctx) {
    agent.state = S.wuehlen;
    agent.goal = 'fressen';
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'wuehlen');
    agent.nibbleTimer = agent.rng.rangeIn(agent.spec.feed.nibble);
    agent.stepping = false;
    agent.empty = 0;
  }

  /**
   * Stehen, ein paar Bissen, ein kleiner Schritt - und das den ganzen Rest der
   * Nacht. Die Schritte laufen im Zustand wuehlen und nicht in gehen: es ist
   * dasselbe Fressen, kein Ortswechsel. Dieselbe Loesung wie der Zickzack des
   * Dachses ueber dem Ameisenhuegel.
   */
  function feedStep(agent, ctx, dt) {
    var spec = agent.spec;

    if (eat(agent, ctx, dt)) agent.empty = 0;
    else {
      agent.empty += dt;
      // Hier ist nichts mehr: weiterstochern statt warten. Bei der
      // Flaechennahrung am Waldrand ist das der Regelfall und der Grund fuer
      // die kleinen Bewegungen - eine Zelle ist nach ein paar Sekunden leer.
      if (!agent.stepping) agent.nibbleTimer = 0;
    }

    if (agent.stepping) {
      var result = A.walkStep(agent, ctx.land, dt,
        A.effectiveSpeed(agent, agent.speedBase), TURN, NIBBLE_ARRIVE);
      if (result !== 'moving') {
        agent.stepping = false;
        agent.nibbleTimer = agent.rng.rangeIn(spec.feed.nibble);
      }
    } else {
      agent.nibbleTimer -= dt;
      // Kopfwiegen statt Ortsaenderung - beim Dachs war genau das der Fund:
      // was nach Bewegung aussieht, muss keine sein.
      agent.heading += Math.sin(ctx.time * 0.6 + agent.index) * 0.08 * dt;
      if (agent.nibbleTimer <= 0) beginNibbleStep(agent, ctx);
    }

    if (agent.phase === 'auftakt') {
      agent.feedTimer -= dt;
      if (agent.feedTimer <= 0) beginDrink(agent, ctx);
      return;
    }
    if (agent.empty >= spec.feed.giveUp) beginMove(agent, ctx);
  }

  /** Ein Schrittchen im Umkreis des Futterplatzes. */
  function beginNibbleStep(agent, ctx) {
    var spec = agent.spec;
    var spot = agent.spot;
    // Am Waldrand muss der Schritt im Wald bleiben, sonst steht er auf der
    // Wiese und findet dort gar nichts; an Baum und Huegel haengt der Vorrat
    // am Objekt, dort darf er ueberall hin.
    var type = spot.kind === EDGE ? T.FOREST : -1;
    var p = ctx.land.pointInRing(agent.rng, spot.x, spot.y, 0, spec.feed.radius,
      type, agent.region);
    if (!p) { agent.nibbleTimer = agent.rng.rangeIn(spec.feed.nibble); return; }
    agent.tx = p.x;
    agent.ty = p.y;
    agent.stepping = true;
  }

  /** @returns {boolean} ob hier ueberhaupt noch etwas zu holen war */
  function eat(agent, ctx, dt) {
    var spot = agent.spot;
    var cfg = agent.spec.forage[spot.kind];
    var amount = cfg.eatPerSecond * agent.traits.needs * dt;

    if (spot.index >= 0) {
      var p = ctx.foodPoint(spot.kind, spot.index, scratch);
      if (p.value < cfg.minEdible) return false;
      ctx.eatPoint(spot.kind, spot.index, amount);
      return true;
    }
    if (ctx.foodAt(agent.x, agent.y, spot.kind) < cfg.minEdible) return false;
    ctx.eatAt(agent.x, agent.y, amount, spot.kind);
    return true;
  }

  // ------------------------------------------------------------- Trinken

  /**
   * Der feste Punkt im Drehbuch. Er wird nicht mit etwas anderem verglichen -
   * nach dem Auftakt wird getrunken, und danach geht es weiter. Klappt es
   * nicht (kein Gewaesser in Reichweite), faellt der Gang ersatzlos aus und der
   * Umzug kommt gleich.
   */
  function beginDrink(agent, ctx) {
    var bodies = ctx.habitat.bodies;
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < bodies.length; i++) {
      var d = Math.hypot(bodies[i].x - agent.x, bodies[i].y - agent.y) - bodies[i].radius;
      if (d < bestDist) { bestDist = d; best = bodies[i]; }
    }
    if (!best || bestDist > agent.spec.drink.maxDistance) { beginMove(agent, ctx); return; }
    agent.phase = 'wasser';
    agent.goal = 'wasser';
    beginTravel(agent, ctx, best.x, best.y);
  }

  function beginDrinking(agent, ctx) {
    agent.state = S.trinken;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(agent.spec.drink.bout) * agent.traits.needs;
    agent.drinks++;
  }

  function drinkStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    agent.heading += Math.sin(ctx.time * 0.7 + agent.index) * 0.10 * dt;
    if (agent.stateTimer <= 0) beginMove(agent, ctx);
  }

  // -------------------------------------------------------------- Umzug

  /**
   * Zum naechsten Futterplatz - und ausdruecklich zu einem *anderen* als dem,
   * an dem er gerade steht. Gewaehlt wird nach Vorrat, die Entfernung zaehlt
   * schwach dagegen; daraus ergibt sich das Hin und Her ueber die fuenf Naechte
   * von selbst, denn was er gestern leergefressen hat, ist heute die schlechte
   * Wahl.
   */
  function beginMove(agent, ctx) {
    var next = pickSpot(agent, ctx);
    agent.phase = 'nacht';
    if (!next) { beginFeed(agent, ctx); return; }
    agent.spot = next;
    agent.moves++;
    agent.goal = 'futter';
    beginTravel(agent, ctx, next.x, next.y);
  }

  function pickSpot(agent, ctx) {
    var spec = agent.spec;
    var f = spec.feed;
    var best = null;
    var bestScore = -Infinity;

    for (var i = 0; i < agent.spots.length; i++) {
      var spot = agent.spots[i];
      if (spot === agent.spot) continue;
      var dist = Math.hypot(spot.x - agent.x, spot.y - agent.y);
      var score = spotValue(agent, ctx, spot) - dist * f.distanceCost +
        agent.rng.range(0, f.jitter);
      if (score <= bestScore) continue;
      bestScore = score;
      best = spot;
    }
    return best;
  }

  /**
   * Wie gut ist ein Platz gerade?
   *
   * Bei Baum und Huegel ist das eine einzige Zahl - der Vorrat haengt am
   * Objekt. Bei der Waldrandstelle nicht: dort liegt der Vorrat auf Zellen von
   * 5 u, und der Igel frisst in einem ganzen Umkreis darum. Fragte man nur die
   * *Mittelzelle*, saehe jeder schon einmal besuchte Waldrand fuer den Rest der
   * Nacht leer aus, obwohl ringsum alles voll steht.
   *
   * **Gezaehlt werden dabei nur Stichproben, die wirklich im Wald liegen, und
   * das war der Fehler, der die ganze Art auf zwei Plaetze festgenagelt hat.**
   * Eine Waldrandstelle hat per Definition Nachbarn ausserhalb des Waldes, und
   * dort liefert foodAt eine 0 - nicht weil nichts mehr da waere, sondern weil
   * dort nie etwas war. Ein Waldrandplatz bekam damit einen *festen* Abschlag,
   * der sich nie aendert, weil Wiese nicht nachwaechst: er verlor dauerhaft
   * gegen einen halb leergefressenen Apfelbaum, und der Igel pendelte in fuenf
   * Naechten sechsmal zwischen denselben zwei Plaetzen hin und her (Seed
   * 100001, Protokoll der Zielwahl - angekommen ist er dabei jedes Mal auf 7 u
   * genau, es war nie das Laufen). **Eine Flaechennahrung am Rand ihrer Flaeche
   * zu mitteln, misst die Flaeche und nicht den Vorrat.**
   *
   * Neun feste Stichproben ueber den Fressumkreis (Mitte, vier innen, vier
   * aussen ueber Kreuz); der Zufall der Wahl steckt in f.jitter und nicht hier.
   */
  var SAMPLES = [
    [0, 0],
    [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45],
    [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]
  ];

  function spotValue(agent, ctx, spot) {
    if (spot.index >= 0) return ctx.foodPoint(spot.kind, spot.index, scratch).value;
    var reach = agent.spec.feed.radius;
    var sum = 0;
    var n = 0;
    for (var i = 0; i < SAMPLES.length; i++) {
      var x = spot.x + SAMPLES[i][0] * reach;
      var y = spot.y + SAMPLES[i][1] * reach;
      if (ctx.land.terrainAt(x, y) !== T.FOREST) continue;
      sum += ctx.foodAt(x, y, spot.kind);
      n++;
    }
    return n ? sum / n : ctx.foodAt(spot.x, spot.y, spot.kind);
  }

  // -------------------------------------------------------------- Laufen

  function beginTravel(agent, ctx, x, y) {
    agent.state = S.gehen;
    agent.tx = x;
    agent.ty = y;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'gehen');
    var dist = Math.hypot(x - agent.x, y - agent.y);
    agent.walkTimer = 12 + dist / Math.max(1, agent.speedBase) * 2.5;
  }

  function travelStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.walkTimer -= dt;

    if (agent.goal === 'wasser' &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.reach) {
      beginDrinking(agent, ctx);
      return;
    }

    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);

    if (result === 'arrived') {
      if (agent.goal === 'bett') fallAsleep(agent);
      else if (agent.goal === 'wasser') beginMove(agent, ctx);   // kein Ufer gefunden
      else beginFeed(agent, ctx);
      return;
    }
    if (result === 'blocked' || agent.walkTimer <= 0) {
      // Der Ausweichfaecher kann nicht umdrehen (js/sim/agents.js, FAN) - eine
      // Sackgasse muss ausdruecklich verlassen werden, sonst steht das Tier
      // dort bis zum Ende der Aufzeichnung.
      if (result === 'blocked') agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
      if (agent.goal === 'bett') fallAsleep(agent);
      else if (agent.goal === 'wasser') beginMove(agent, ctx);
      else beginFeed(agent, ctx);
    }
  }

  // --------------------------------------------------------- Nacht, Schlaf

  /**
   * Die Morgendaemmerung. Er hat keinen Schlafplatz: wo er zuletzt gefressen
   * hat, legt er sich hin. Nur am Ameisenhuegel nicht - der liegt auf offener
   * Flaeche, und dort zieht er zum naechsten Waldrand weiter (data/tiere.md).
   */
  function goToBed(agent, ctx, dt) {
    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    if (agent.goal !== 'bett') beginBed(agent, ctx);
    travelStep(agent, ctx, dt);
  }

  function beginBed(agent, ctx) {
    var spec = agent.spec;
    var target = agent.spot;

    if (!target || target.kind === ANT) {
      var shelter = nearestSpot(agent, EDGE) || nearestSpot(agent, APPLE);
      if (shelter) { target = shelter; agent.spot = shelter; }
    }

    agent.phase = 'bett';
    agent.goal = 'bett';
    var p = target && ctx.land.pointInRing(agent.rng, target.x, target.y, 0,
      spec.sleep.spread, -1, agent.region);
    if (!p) p = target ? { x: target.x, y: target.y } : { x: agent.x, y: agent.y };
    beginTravel(agent, ctx, p.x, p.y);
  }

  function nearestSpot(agent, kind) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < agent.spots.length; i++) {
      var spot = agent.spots[i];
      if (kind && spot.kind !== kind) continue;
      var d = Math.hypot(spot.x - agent.x, spot.y - agent.y);
      if (d < bestDist) { bestDist = d; best = spot; }
    }
    return best;
  }

  function fallAsleep(agent) {
    agent.state = S.schlafen;
    agent.speedBase = 0;
    agent.goal = null;
    agent.stepping = false;
  }

  function sleepStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.05 * dt;
    if (A.isAwake(ctx.time, spec) && !A.isSettling(ctx.time, spec, spec.sleep.leaveAt)) {
      beginNight(agent, ctx);
    }
  }

  /** Der Auftakt: an Ort und Stelle ein wenig fressen, danach zum Wasser. */
  function beginNight(agent, ctx) {
    var spec = agent.spec;
    agent.phase = 'auftakt';
    agent.feedTimer = agent.rng.rangeIn(spec.feed.opening) * agent.traits.needs;
    if (!agent.spot) agent.spot = nearestSpot(agent, null);
    beginFeed(agent, ctx);
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * "Rollt sich bei Gefahr ein" - die einzige Reaktion des Katalogs, die kein
   * Tempo hat. Der Igel bleibt dabei fuer andere greifbar (kein agent.flight):
   * er ist ja da, er ist nur eine Kugel.
   */
  function checkThreat(agent, ctx) {
    var spec = agent.spec;
    if (agent.state === S.einrollen || ctx.time < agent.rollUntil) return false;

    var threat = ctx.nearestDisturber(agent, spec.reaction.rollRadius * agent.traits.shyness,
      spec.reaction.ignore);
    if (!threat || !threat.spec || threat.spec.size < spec.reaction.rollFromSize) return false;

    agent.state = S.einrollen;
    agent.speedBase = 0;
    agent.stepping = false;
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.rollSeconds);
    agent.rolls++;
    return true;
  }

  function rollStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    if (agent.stateTimer > 0) return;
    agent.rollUntil = ctx.time + agent.rng.rangeIn(agent.spec.reaction.rollCooldown);
    // Weiter, wo er war: die Kugel unterbricht die Nacht, sie wirft sie nicht
    // um. Nur der Weg zum Wasser ist danach hinfaellig - er hat sich beim
    // Einrollen nicht bewegt, aber das Drehbuch ist ein Stueck weiter.
    if (agent.goal === 'gehen' || agent.goal === 'fressen' || !agent.goal) beginFeed(agent, ctx);
    else beginTravel(agent, ctx, agent.tx, agent.ty);
  }

  WL.Brains.igel = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
