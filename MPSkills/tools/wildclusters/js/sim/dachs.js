/**
 * Verhalten des Dachses - das erste Tier mit einem festen Bau, das trotzdem
 * kein Verband ist.
 *
 * Das Bild, das entstehen soll: eine Familie liegt tagsueber gemeinsam in
 * ihrem Bau im Wald - und der Bau liegt nah an Wasser und an einem
 * Ameisenhuegel. Nachts bricht jeder Dachs fuer sich auf und steuert *einen*
 * Ameisenhuegel an, frisst dort eine Weile in kleinen Zickzacklinien ueber den
 * Huegel und laeuft danach geradewegs zurueck in sein Revier um den Bau. Dort
 * spielt sich der Rest der Nacht ab: Nuss- und Pilzstellen in der Naehe,
 * Wasser, und dazwischen immer wieder lose Streifzuege mit haeufigem
 * Stehenbleiben, vor allem im Wald. Kein Tier auf der Karte laesst sich so
 * wenig aus der Ruhe bringen.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Die Familie teilt nur den Bau, sonst nichts.** Wie beim Kaninchen
 *    (js/sim/rabbit.js) gibt es kein gemeinsames Ziel und keine Kraefte -
 *    jeder Dachs entscheidet fuer sich. Anders als beim Kaninchen ist der Bau
 *    hier aber der Tages-Schlafplatz einer *nachtaktiven* Art.
 * 2. **Der Ameisenhuegel-Ausflug kennt kein Revier, der Rest der Nacht schon.**
 *    Nuss- und Pilzstellen werden wie beim Wildschwein einmal im Umkreis des
 *    Baus eingesammelt (`spec.home.radius`) und nie darueber hinaus gesucht.
 *    Ameisenhuegel dagegen werden ueber die *ganze* von der Familie
 *    erreichbare Landmasse gesucht, nur schwach nach Entfernung gewichtet -
 *    "muss nicht der naechste sein" aus data/tiere.md bleibt moeglich, ist
 *    aber nicht mehr die Regel. Dass es meistens trotzdem nicht weit ist,
 *    entscheidet schon der Bauplatz: er liegt hoechstens 300 u von einem
 *    Huegel entfernt (`findBurrow`). Genau *einer* pro Nacht: ist er einmal
 *    gewaehlt (`agent.antDone`), bleibt der Rest der Nacht beim Revier.
 * 3. **Nach dem Ameisenhuegel geht es zuerst nach Hause, nicht zum naechsten
 *    Ziel.** `beginReturnHome` haengt zwischen dem Fressen am Huegel und dem
 *    gewoehnlichen Streifen einen eigenen Heimweg ein - sonst haette ein
 *    weit entfernter Ausflug das restliche genutzte Gebiet der Nacht auf dem
 *    ganzen Rueckweg mit aufgebauscht, statt als einzelne Linie zum Huegel und
 *    zurueck sichtbar zu bleiben.
 * 4. **Gezielt und streifend ist dieselbe Bewegung mit demselben Tempo**, nur
 *    mit verschiedener Zielwahl: ein Punkt gegen ein Stueck freie Richtung.
 *    Der Rhythmus "geradewegs - streifen - geradewegs" entsteht daraus, dass
 *    nach jedem Fressen oder Trinken erst eine Streifphase mit haeufigen
 *    Pausen folgt, bevor wieder ein Ziel gesucht wird - nicht aus einem
 *    eigenen Tempo fuers Streifen.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 1.8;          // rad/s - gemaechlicher als das Wildschwein (2.0)
  var FLEE_TURN = 3.0;
  var ARRIVE = 8;
  var CHECK_SECONDS = 0.25;
  // Ameisenhuegel sind bewusst nicht dabei - die werden nicht ans Revier
  // gebunden gesammelt, sondern je Ausflug frisch ueber die ganze Landmasse
  // gesucht (siehe pickAnthill).
  var LOCAL_KINDS = ['nuesse', 'pilze'];
  // Der Dachs graebt die Brut aus, das Wildschwein frisst die Ameisen - zwei
  // Vorraete auf denselben Huegeln, damit die Familie ihren Huegel leergraben
  // kann, ohne dem Wildschwein etwas wegzunehmen (js/sim/species.js, forage).
  var ANT = 'ameisenbrut';

  /**
   * Womit eine Nacht anfaengt - je Dachs und Nacht neu gezogen, gleichverteilt.
   * Ohne das beginnt jede Nacht fuer jedes Familienmitglied gleich (erst der
   * Ameisenhuegel, weil der laut data/tiere.md §3 dem Durst vorgeht), und die
   * ganze Familie zieht als Pulk zum selben Huegel - genau das Gegenteil von
   * "nachts ist jeder fuer sich". Der Ameisenhuegel bleibt Pflicht, er rueckt
   * nur nach hinten: nach dem Trinken oder der kurzen Streifphase ist er beim
   * naechsten chooseTarget wieder an der Reihe.
   */
  var OPENINGS = ['wasser', 'ameisen', 'streifen'];

  var scratch = { x: 0, y: 0, value: 0 };

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    var count = rng.intIn(spec.count);
    // Bis 5 Tiere eine Familie, ab 6 zwei - siehe data/tiere.md.
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
      var region = ctx.land.regionAt(burrows[f].x, burrows[f].y);
      var family = {
        burrow: burrows[f],
        region: region,
        // Einmal je Familie eingesammelt, nicht je Tier - dieselbe Liste,
        // aber keine gemeinsame Entscheidung: jedes Mitglied waehlt daraus
        // fuer sich (siehe pickSpot).
        spots: collectSpots(ctx, spec, burrows[f], region)
      };
      var size = Math.floor(count / burrows.length) + (f < count % burrows.length ? 1 : 0);

      for (k = 0; k < size; k++) {
        var agentRng = ctx.rng.fork('dachs-' + f + '-' + k);
        var p = ctx.land.pointInRing(agentRng, family.burrow.x, family.burrow.y, 5,
          spec.sleep.spread, -1, family.region) || { x: family.burrow.x, y: family.burrow.y };

        var agent = {
          index: 0,               // setzt die Simulation
          speciesId: spec.id,
          spec: spec,
          rng: agentRng,
          x: p.x,
          y: p.y,
          heading: agentRng.range(0, Math.PI * 2),
          state: S.sichern,
          // Die Aufzeichnung beginnt mitten in der Nacht, also mitten im
          // Wachfenster: ohne diese beiden Zeilen liefe der allererste
          // Augenblick der Aufzeichnung an beginNight vorbei und die ganze
          // Familie broeche gleichzeitig zum selben Huegel auf - genau der
          // Moment, den man beim Start als Erstes sieht.
          stateTimer: agentRng.rangeIn(spec.sleep.wakeSpread),
          speedBase: 0,
          tx: p.x,
          ty: p.y,
          region: family.region,
          family: family,
          burrow: family.burrow,
          // Eigene Reviergroesse: nicht jeder Dachs streift gleich weit.
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
          goal: null,              // 'futter' | 'wasser' | 'streifen' | null (noch nichts entschieden)
          foodKind: null,
          foodIndex: -1,
          skipKind: null,          // zuletzt leergefressene Stelle ...
          skipIndex: -1,
          skipUntil: 0,            // ... und bis wann sie gesperrt bleibt
          roaming: false,          // steckt gerade in einer Streifphase?
          roamUntil: 0,
          // Womit diese Nacht anfaengt (siehe OPENINGS) - fuer die angebrochene
          // erste Nacht schon hier, danach je Nacht neu in beginNight.
          opening: OPENINGS[Math.floor(agentRng.next() * OPENINGS.length)],
          zig: null,               // Zickzack ueber den Ameisenhuegel, nur waehrend des Fressens dort
          antDone: false,          // war heute Nacht schon am Ameisenhuegel?
          sleepSpot: null,
          sleepTries: 0,
          partner: -1,
          flight: null,            // laeuft nie in die Luft; das Feld liest die Stoerabfrage
          fleeAngle: 0,
          drinks: 0,
          // Durstzeiten streuen, sonst geht am ersten Morgen jeder gleichzeitig.
          nextDrink: WL.SimTime.hours(agentRng.range(2, 7))
        };
        family.members = family.members || [];
        family.members.push(agent);
        agents.push(agent);
      }
    }

    return agents;
  }

  /**
   * Ein Platz fuer den Bau: im Wald, nah an Wasser *und* an einem
   * Ameisenhuegel (je 300 u, Regel in js/world/rules.js), weit genug vom
   * anderen Bau.
   *
   * Gesucht wird deshalb nicht mehr irgendwo im Wald, sondern im Umkreis eines
   * zufaellig gezogenen Ameisenhuegels - die Bedingung ist eng genug, dass ein
   * freier Griff ins Waldraster sie fast nie erfuellt (Wald ist ein Viertel der
   * Karte, die 300-u-Kreise um 3-4 Huegel sind zusammen keine zwei Zehntel).
   *
   * Vier Stufen, damit auf einem unguenstigen Seed nicht die ganze Art
   * ausfaellt - dieselbe Vorsicht wie beim Kaninchenbau (js/sim/rabbit.js), nur
   * mit einer Bedingung mehr zum Lockern: erst rueckt der zweite Bau naeher,
   * dann werden die Hoechstabstaende geweitet, und erst zuletzt faellt die
   * Naehe ganz weg (slack 0 = irgendwo im Wald, der alte Zustand).
   */
  var BURROW_STAGES = [
    { slack: 1.0, apart: 1.0 },
    { slack: 1.0, apart: 0.5 },
    { slack: 1.6, apart: 0.5 },
    { slack: 0, apart: 0.5 }
  ];

  function findBurrow(ctx, spec, rng, taken) {
    var home = spec.home;
    var hills = ctx.world.objects.anthills || [];

    for (var s = 0; s < BURROW_STAGES.length; s++) {
      var stage = BURROW_STAGES[s];
      for (var t = 0; t < home.tries; t++) {
        var p = stage.slack > 0
          ? forestNearHill(ctx, rng, hills, home.maxDistToAnthill * stage.slack)
          : ctx.land.pointOfType(rng, T.FOREST, 0);
        if (!p) continue;
        if (ctx.land.regionAt(p.x, p.y) <= 0) continue;
        if (!WL.Rules.placement.forestBurrow(ctx.world.query, p, home, hills, stage.slack)) continue;
        if (tooClose(p, taken, home.minBurrowDistance * stage.apart)) continue;
        return p;
      }
    }
    return null;
  }

  /** Eine Waldstelle im Umkreis eines zufaellig gezogenen Ameisenhuegels. */
  function forestNearHill(ctx, rng, hills, radius) {
    if (!hills.length) return null;
    var hill = hills[Math.floor(rng.next() * hills.length)];
    return ctx.land.pointInRing(rng, hill.x, hill.y, 0, radius, T.FOREST, 0);
  }

  function tooClose(p, taken, minDistance) {
    for (var i = 0; i < taken.length; i++) {
      if (Math.hypot(taken[i].x - p.x, taken[i].y - p.y) < minDistance) return true;
    }
    return false;
  }

  /**
   * Was liegt im (kleinen) Revier? Dieselbe Idee wie beim Waldstueck der
   * Rotte (js/sim/boar.js, collectSpots), nur einfacher: ein Kreis um den Bau
   * statt eines Rechtecks um eine Waldregion. Nur Nuesse und Pilze - der
   * Ameisenhuegel-Ausflug sucht separat und ohne Reviergrenze (pickAnthill).
   */
  function collectSpots(ctx, spec, burrow, region) {
    var spots = {};
    for (var k = 0; k < LOCAL_KINDS.length; k++) {
      var kind = LOCAL_KINDS[k];
      var source = ctx.world.objects[spec.forage[kind].source] || [];
      var list = [];
      for (var i = 0; i < source.length; i++) {
        var dx = source[i].x - burrow.x;
        var dy = source[i].y - burrow.y;
        if (dx * dx + dy * dy > spec.home.radius * spec.home.radius) continue;
        if (ctx.land.regionAt(source[i].x, source[i].y) !== region) continue;
        list.push(i);
      }
      spots[kind] = list;
    }
    return spots;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    // Im Bau wird nicht erst hingeschaut - dort ist die Familie sicher, genau
    // wie das Kaninchen im eigenen Bau (data/tiere.md).
    if (agent.state === S.schlafen) { sleepStep(agent, ctx, dt); return; }

    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = CHECK_SECONDS;
      if (checkThreat(agent, ctx)) return;
    }

    if (agent.state === S.fliehen) { fleeStep(agent, ctx, dt); return; }

    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (!awake || settling) { goHome(agent, ctx, dt); return; }

    if (agent.state === S.sichern) { pauseStep(agent, ctx, dt); return; }
    if (agent.state === S.wuehlen) { eatStep(agent, ctx, dt); return; }
    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    travelStep(agent, ctx, dt);
  }

  // --------------------------------------------------- Ziel waehlen (Durst/Futter)

  /**
   * Nach dem Aufwachen und nach jeder Streifphase.
   *
   * Der Ameisenhuegel geht *vor* dem Durst, nicht "je nachdem was faelliger
   * ist" wie beim Wildschwein (Durst/Suhlen, js/sim/boar.js) - "bevorzugt"
   * steht so in data/tiere.md §3. Das ist hier kein Stilbruch, sondern
   * notwendig: nextDrink laeuft die ganze Schlafzeit ueber weiter, waehrend
   * das Trinkintervall (3.5-8.5 h) viel kuerzer ist als ein Tag - am
   * Aufwachen ist der Durst darum praktisch *immer* laengst faellig
   * (gemessen: -170 bis -190 s Rueckstand), und ein Vergleich der
   * Ueberfaelligkeit wie beim Wildschwein wuerde ihn deshalb jede Nacht
   * gewinnen lassen. Damit blieb der Ameisenhuegel bei einer ersten Fassung
   * praktisch immer aus (in 5 Tagen hoechstens einmal besucht) - "verbringen
   * dort viel Zeit" war nur behauptet.
   *
   * Der erste Zug der Nacht ist davon ausgenommen und ausgewuerfelt
   * (agent.opening, siehe OPENINGS). Ein fester Vorrang ist eine
   * Reihenfolge, und eine Reihenfolge, die fuer alle gleich ist, macht aus
   * einer Familie von Einzelgaengern einen Pulk: gemessen brachen alle
   * Mitglieder innerhalb von 2-5 s zum selben Huegel auf. Ausserdem war der
   * Durst dadurch faktisch abgeschafft - eine Nacht ist nur rund 120 s lang,
   * und Huegel plus Heimweg plus eine Streifphase fuellen sie bereits ganz
   * (gemessen: 0.0-0.1 Trinkgaenge je Nacht statt der zugesagten 1-3).
   */
  function chooseTarget(agent, ctx) {
    var spec = agent.spec;

    // Nur der erste Zug der Nacht, danach wieder null.
    if (agent.opening) {
      var opening = agent.opening;
      agent.opening = null;
      if (opening === 'wasser') { beginDrink(agent, ctx); return; }
      if (opening === 'streifen') {
        beginRoam(agent, ctx, agent.rng.rangeIn(spec.roam.opening));
        return;
      }
      // 'ameisen': einfach die gewoehnliche Reihenfolge unten.
    }

    if (!agent.antDone) {
      agent.antDone = true;   // fuer diese Nacht abgehakt, ob der Versuch klappt oder nicht
      var hill = pickAnthill(agent, ctx);
      if (hill) {
        agent.goal = ANT;
        agent.foodKind = ANT;
        agent.foodIndex = hill.index;
        beginTravel(agent, ctx, hill.x, hill.y);
        return;
      }
    }

    if (wantsDrink(agent, ctx)) { beginDrink(agent, ctx); return; }

    var choice = pickLocalSpot(agent, ctx);
    if (!choice) { beginRoam(agent, ctx); return; }

    agent.goal = 'futter';
    agent.foodKind = choice.kind;
    agent.foodIndex = choice.index;
    beginTravel(agent, ctx, choice.x, choice.y);
  }

  /**
   * Durst: entweder ueberfaellig, oder bald faellig und das Wasser gerade nah.
   * Als eigene Funktion, weil der Durst an zwei Stellen geprueft wird - bei der
   * gewoehnlichen Zielwahl und direkt nach dem Ameisenhuegel (beginReturnHome).
   */
  function wantsDrink(agent, ctx) {
    var spec = agent.spec;
    var thirst = agent.nextDrink - ctx.time;
    return thirst <= 0 || (thirst <= WL.SimTime.hours(spec.drink.earlyHours) &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.nearby);
  }

  /**
   * *Der* Ameisenhuegel der Nacht - einer von allen, die die Familie
   * ueberhaupt erreichen kann, nicht nur die im Revier.
   *
   * Die Entfernung zaehlt hier mit, aber nur schwach (antDistanceCost, ein
   * Sechstel des Abzugs bei Nuessen und Pilzen) und gegen einen breiteren
   * Zufall (antJitter). Voellig entfernungsblind wie in der ersten Fassung
   * ging nicht auf: bei 3-4 Huegeln auf der ganzen Karte lag der Griff im
   * Mittel rund 500 u weit weg, und eine Nacht dauert nur etwa 120 s - Hin-
   * und Rueckweg waren damit die Nacht. "Muss nicht der naechste sein"
   * (data/tiere.md) bleibt trotzdem wahr: ein voller weiter Huegel schlaegt
   * einen leergefressenen nahen.
   */
  function pickAnthill(agent, ctx) {
    var spec = agent.spec;
    var cfg = spec.forage[ANT];
    var fc = spec.forageChoice;
    var source = ctx.world.objects.anthills || [];
    var best = null;
    var bestScore = -Infinity;

    for (var i = 0; i < source.length; i++) {
      if (agent.skipKind === ANT && agent.skipIndex === i && ctx.time < agent.skipUntil) continue;
      if (ctx.land.regionAt(source[i].x, source[i].y) !== agent.region) continue;
      var p = ctx.foodPoint(ANT, i, scratch);
      if (p.value < cfg.minEdible) continue;
      var dist = Math.hypot(p.x - agent.x, p.y - agent.y);
      var score = p.value - dist * fc.antDistanceCost + agent.rng.range(0, fc.antJitter);
      if (score <= bestScore) continue;
      bestScore = score;
      best = { index: i, x: p.x, y: p.y };
    }
    return best;
  }

  /**
   * Die naechste Nuss- oder Pilzstelle im kleinen Revier um den Bau.
   * Bewertet wird Vorliebe mal Vorrat, die Entfernung zaehlt kraeftig
   * dagegen - anders als beim Ameisenhuegel soll dieser Teil der Nacht nah am
   * Bau bleiben.
   */
  function pickLocalSpot(agent, ctx) {
    var spec = agent.spec;
    var fc = spec.forageChoice;
    var spots = agent.family.spots;
    var choice = null;
    var bestScore = -Infinity;

    for (var k = 0; k < LOCAL_KINDS.length; k++) {
      var kind = LOCAL_KINDS[k];
      var cfg = spec.forage[kind];
      var list = spots[kind];
      for (var i = 0; i < list.length; i++) {
        var index = list[i];
        if (kind === agent.skipKind && index === agent.skipIndex &&
          ctx.time < agent.skipUntil) continue;
        var p = ctx.foodPoint(kind, index, scratch);
        if (p.value < cfg.minEdible) continue;
        var dist = Math.hypot(p.x - agent.x, p.y - agent.y);
        var score = p.value * cfg.weight - dist * fc.distanceCost + agent.rng.range(0, fc.jitter);
        if (score <= bestScore) continue;
        bestScore = score;
        choice = { kind: kind, index: index, x: p.x, y: p.y };
      }
    }
    return choice;
  }

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
      if (agent.goal === 'futter' || agent.goal === ANT) beginEating(agent, ctx);
      else if (agent.goal === 'wasser') giveUpDrinking(agent, ctx);
      // Zuhause angekommen wird neu entschieden, nicht einfach gestreift:
      // sonst haengt an den Ameisenhuegel immer eine ganze Streifphase, und
      // der Durst kommt in der kurzen Nacht nie an die Reihe.
      else if (agent.goal === 'heimkehr') chooseTarget(agent, ctx);
      else roamLegStep(agent, ctx);   // 'streifen': einen Streifschritt erreicht
      return;
    }
    if (result === 'blocked' || agent.walkTimer <= 0) {
      if (result === 'blocked') turnAround(agent);
      if (agent.goal === 'wasser') giveUpDrinking(agent, ctx);
      else if (agent.goal === 'futter' || agent.goal === ANT) {
        forgetSpot(agent, ctx);
        beginRoam(agent, ctx);
      } else if (agent.goal === 'heimkehr') beginRoam(agent, ctx);
      else beginRoamLeg(agent, ctx);   // beim Streifen: einfach neu versuchen
    }
  }

  function turnAround(agent) {
    agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
  }

  // ------------------------------------------------------------ Fressen

  function beginEating(agent, ctx) {
    var spec = agent.spec;
    var isAnt = agent.foodKind === ANT;
    agent.state = S.wuehlen;
    agent.speedBase = A.drawSpeed(agent, spec, 'wuehlen');
    agent.stateTimer = agent.rng.rangeIn(
      isAnt ? spec.forageChoice.antBout : spec.forageChoice.bout) * agent.traits.needs;
    if (isAnt) beginZigzag(agent, ctx);
    else agent.zig = null;
  }

  /**
   * Der Zickzack ueber den Ameisenhuegel. Am Nuss- und Pilznest steht der Dachs
   * weiter still und wuehlt an einer Stelle - der Ameisenhuegel dagegen wird
   * abgesucht: kurze Schenkel quer darueber, bei jeder Kehre ein Stueck zur
   * Seite versetzt, sodass die Spur den Huegel nach und nach abfaehrt und die
   * Richtung wieder umkehrt, wenn sie am Rand angekommen ist.
   *
   * Die Schenkel haengen am Radius des Huegels (13-19 u), nicht an einer festen
   * Laenge - sonst liefe der Dachs auf einem kleinen Huegel darueber hinaus.
   */
  function beginZigzag(agent, ctx) {
    var cfg = agent.spec.antZigzag;
    var hill = (ctx.world.objects.anthills || [])[agent.foodIndex];
    var r = (hill && hill.radius) || cfg.radius;
    var z = {
      x: hill ? hill.x : agent.x,
      y: hill ? hill.y : agent.y,
      axis: agent.rng.range(0, Math.PI * 2),
      span: r * cfg.span,
      step: r * cfg.stepAcross,
      max: r * cfg.maxAcross,
      side: agent.rng.next() < 0.5 ? -1 : 1,
      drift: 1
    };
    z.across = -z.max;
    agent.zig = z;
    zigTarget(agent);
  }

  /** Das Ende des naechsten Schenkels: quer ueber den Huegel, seitlich versetzt. */
  function zigTarget(agent) {
    var z = agent.zig;
    var c = Math.cos(z.axis);
    var s = Math.sin(z.axis);
    agent.tx = z.x + c * z.side * z.span - s * z.across;
    agent.ty = z.y + s * z.side * z.span + c * z.across;
  }

  /**
   * Ein Schritt des Zickzacks. Angekommen wie blockiert fuehren beide zur
   * Kehre - laeuft der Dachs am Rand des Huegels ins Wasser, ist das derselbe
   * Wendepunkt wie das erreichte Schenkelende.
   */
  function zigzagStep(agent, ctx, dt) {
    var z = agent.zig;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), agent.spec.antZigzag.turn, 3);
    if (result === 'moving') return;

    z.side = -z.side;
    z.across += z.step * z.drift;
    if (z.across > z.max || z.across < -z.max) {
      z.across = z.drift > 0 ? z.max : -z.max;
      z.drift = -z.drift;
    }
    zigTarget(agent);
  }

  function eatStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;
    if (agent.zig) zigzagStep(agent, ctx, dt);
    else {
      // Am Nuss- oder Pilznest kaum Kopfbewegung, nicht das unruhige Schaukeln
      // einer frueheren Fassung (0.20 bei 0.8 Hz sah wie Hin-und-her-Trippeln
      // aus, nicht wie graben) - ruhiger noch als das Stehen in der
      // Streifpause (roamLegStep/pauseStep, 0.15).
      agent.heading += Math.sin(ctx.time * 0.4 + agent.index) * 0.05 * dt;
    }

    var cfg = spec.forage[agent.foodKind];
    var left = ctx.eatPoint(agent.foodKind, agent.foodIndex,
      cfg.eatPerSecond * agent.traits.needs * dt);

    if (agent.stateTimer <= 0 || left < cfg.minEdible * 0.5) {
      // War es der Ameisenhuegel-Ausflug der Nacht, geht es zuerst nach
      // Hause - sonst faerbt der Rueckweg das ganze restliche genutzte
      // Gebiet der Nacht ein, statt eine einzelne Linie zu bleiben.
      var wasAnt = agent.foodKind === ANT;
      agent.zig = null;
      if (left < cfg.minEdible * 0.5) forgetSpot(agent, ctx);
      else { agent.foodKind = null; agent.foodIndex = -1; }
      if (wasAnt) beginReturnHome(agent, ctx);
      else beginRoam(agent, ctx);
    }
  }

  function forgetSpot(agent, ctx) {
    agent.skipKind = agent.foodKind;
    agent.skipIndex = agent.foodIndex;
    agent.skipUntil = ctx.time + agent.rng.rangeIn(agent.spec.forageChoice.cooldown);
    agent.foodKind = null;
    agent.foodIndex = -1;
  }

  // ------------------------------------------------------------- Trinken

  function beginDrink(agent, ctx) {
    var bodies = ctx.habitat.bodies;
    if (!bodies.length) {
      agent.nextDrink = ctx.time + WL.SimTime.hours(4);
      beginRoam(agent, ctx);
      return;
    }
    var best = bodies[0];
    var bestDist = Infinity;
    for (var i = 0; i < bodies.length; i++) {
      var d = Math.hypot(bodies[i].x - agent.x, bodies[i].y - agent.y) - bodies[i].radius;
      if (d < bestDist) { bestDist = d; best = bodies[i]; }
    }
    agent.goal = 'wasser';
    agent.foodKind = null;
    agent.foodIndex = -1;
    beginTravel(agent, ctx, best.x, best.y);
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
    agent.heading += Math.sin(ctx.time * 0.7 + agent.index) * 0.10 * dt;
    if (agent.stateTimer <= 0) beginRoam(agent, ctx);
  }

  function giveUpDrinking(agent, ctx) {
    agent.nextDrink = ctx.time + WL.SimTime.hours(agent.rng.range(1, 3));
    beginRoam(agent, ctx);
  }

  // ------------------------------------------------------------- Streifen

  /**
   * Nach jedem Fressen und Trinken folgt eine Streifphase, bevor wieder ein
   * Ziel gesucht wird - das ist der Rhythmus aus data/tiere.md ("geradewegs -
   * streifen - geradewegs"). seconds legt fest, wie lange sie insgesamt
   * dauert; einzelne Streifschritte und die Pausen dazwischen laufen in
   * roamLegStep/pauseStep.
   */
  /**
   * Der Heimweg vom Ameisenhuegel: ein eigener, gezielter Zug zurueck in die
   * Naehe des Baus, bevor mit dem gewoehnlichen Streifen weitergemacht wird.
   * Ohne diesen Zwischenschritt begaenne die naechste Streifphase dort, wo
   * der Ausflug endete - moeglicherweise weit draussen - und "kehren zurueck
   * zu ihrem Wald" (data/tiere.md) waere nur behauptet, nicht gebaut.
   */
  function beginReturnHome(agent, ctx) {
    var spec = agent.spec;
    // Steht Durst an, geht es vom Huegel aus direkt ans Wasser statt erst
    // heimzulaufen. Das ist kein Umweg, sondern derselbe Weg: das Wasser liegt
    // hoechstens 300 u vom Bau (spec.home). Ohne diesen Zweig kommt der Durst
    // in der kurzen Nacht kaum noch dran - Huegelbesuch plus Heimweg fuellen
    // sie fast ganz (gemessen: 0.55 statt der zugesagten 1-3 Trinkgaenge).
    if (wantsDrink(agent, ctx)) { beginDrink(agent, ctx); return; }
    var p = ctx.land.pointInRing(agent.rng, agent.burrow.x, agent.burrow.y, 0,
      spec.home.radius * 0.7, -1, agent.region) || { x: agent.burrow.x, y: agent.burrow.y };
    agent.goal = 'heimkehr';
    agent.foodKind = null;
    agent.foodIndex = -1;
    beginTravel(agent, ctx, p.x, p.y);
  }

  /** seconds nur fuer die kurze Streifphase als Nachtauftakt (chooseTarget). */
  function beginRoam(agent, ctx, seconds) {
    agent.goal = 'streifen';
    agent.foodKind = null;
    agent.foodIndex = -1;
    agent.roaming = true;
    agent.roamUntil = ctx.time +
      (seconds || agent.rng.rangeIn(agent.spec.roam.seconds));
    beginRoamLeg(agent, ctx);
  }

  function beginRoamLeg(agent, ctx) {
    var spec = agent.spec;
    var p = ctx.land.pointInRing(agent.rng, agent.x, agent.y, 10, spec.roam.leg[1], -1, agent.region);
    // Nicht weiter als das eigene Revier - sonst wanderte der Dachs beim
    // Streifen aus seinem Bau heraus und faende am Ende der Phase keinen
    // gezielten Weg mehr zurueck.
    if (p && Math.hypot(p.x - agent.burrow.x, p.y - agent.burrow.y) > agent.range) p = null;
    if (!p) p = { x: agent.burrow.x, y: agent.burrow.y };
    agent.state = S.gehen;
    agent.goal = 'streifen';
    agent.tx = p.x;
    agent.ty = p.y;
    agent.speedBase = A.drawSpeed(agent, spec, 'gehen');
    var dist = Math.hypot(p.x - agent.x, p.y - agent.y);
    agent.walkTimer = 8 + dist / Math.max(1, agent.speedBase) * 2.5;
  }

  /** Am Ende eines Streifschritts: entweder weiterziehen, oder Zeit fuer ein Ziel. */
  function roamLegStep(agent, ctx) {
    if (ctx.time >= agent.roamUntil) { agent.roaming = false; chooseTarget(agent, ctx); return; }
    beginPause(agent, ctx);
  }

  /**
   * Stehenbleiben zwischen zwei Streifschritten. Im Wald deutlich laenger und
   * damit haeufiger sichtbar - "bleiben gern mal stehen, vor allem im Wald"
   * (data/tiere.md).
   */
  function beginPause(agent, ctx) {
    var spec = agent.spec;
    var inForest = ctx.land.terrainAt(agent.x, agent.y) === T.FOREST;
    agent.state = S.sichern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(inForest ? spec.roam.forestPause : spec.roam.pause) *
      agent.traits.needs;
  }

  function pauseStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    agent.heading += Math.sin(ctx.time * 0.5 + agent.index) * 0.15 * dt;
    if (agent.stateTimer > 0) return;

    if (!agent.roaming || ctx.time >= agent.roamUntil) { agent.roaming = false; chooseTarget(agent, ctx); }
    else beginRoamLeg(agent, ctx);
  }

  // ----------------------------------------------------------- Bau, Nacht

  /**
   * Der Weg zum Bau, wenn die Nacht zu Ende geht - mit einem letzten Schluck,
   * falls der Durst noch offen ist.
   *
   * Der Trinkzweig steht hier und nicht nur in chooseTarget, weil sonst jede
   * vierte Nacht ganz trocken bliebe: der Ameisenhuegel ist Pflicht und kostet
   * mit Hin- und Rueckweg gut die Haelfte der rund 105 nutzbaren Sekunden, und
   * was danach nicht mehr hineinpasst, fiel bisher ersatzlos aus. Ein Umweg
   * ist es nicht - das Wasser liegt hoechstens 300 u vom Bau (spec.home), der
   * Heimweg fuehrt ohnehin daran vorbei.
   */
  function goHome(agent, ctx, dt) {
    var spec = agent.spec;

    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    if (agent.goal === 'wasser') { travelStep(agent, ctx, dt); return; }
    // Nur einmal: nach dem Trinken (oder einem Fehlversuch) liegt nextDrink in
    // der Zukunft, der Zweig greift also nicht noch einmal.
    if (agent.goal !== 'heim' && agent.nextDrink <= ctx.time) {
      beginDrink(agent, ctx);
      return;
    }

    if (agent.state !== S.gehen || agent.goal !== 'heim') {
      agent.state = S.gehen;
      agent.goal = 'heim';
      agent.foodKind = null;
      agent.foodIndex = -1;
      agent.roaming = false;
      agent.speedBase = A.drawSpeed(agent, spec, 'gehen');
      var p = ctx.land.pointInRing(agent.rng, agent.burrow.x, agent.burrow.y, 0,
        spec.sleep.spread, -1, agent.region) || { x: agent.burrow.x, y: agent.burrow.y };
      agent.tx = p.x;
      agent.ty = p.y;
      agent.walkTimer = 10 + Math.hypot(p.x - agent.x, p.y - agent.y) /
        Math.max(1, agent.speedBase) * 2.5;
    }

    agent.walkTimer -= dt;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);
    if (result === 'blocked') turnAround(agent);
    if (result !== 'moving' || agent.walkTimer <= 0) {
      agent.state = S.schlafen;
      agent.speedBase = 0;
      agent.goal = null;
    }
  }

  function sleepStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.06 * dt;
    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (awake && !settling) beginNight(agent, ctx);
  }

  /**
   * Der Aufbruch. Das Wachfenster gilt fuer die ganze Art gleich, deshalb
   * wachen alle Mitglieder einer Familie in derselben Sekunde auf - erst das
   * Trödeln am Bau (sleep.wakeSpread) und der ausgewuerfelte erste Zug
   * (OPENINGS) machen daraus die Einzelgaenger, die sie sein sollen. Der
   * Ameisenhuegel der letzten Nacht zaehlt fuer die neue nicht mehr.
   */
  function beginNight(agent, ctx) {
    var spec = agent.spec;
    agent.antDone = false;
    agent.opening = OPENINGS[Math.floor(agent.rng.next() * OPENINGS.length)];
    agent.roaming = false;
    agent.goal = null;
    agent.state = S.sichern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.sleep.wakeSpread);
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * "Laesst sich von niemandem aus der Ruhe bringen": gemieden wird nur
   * Groessenklasse >= 5, im Kernset also niemand. Der Zweig ist ueber den
   * kuenstlichen Stoerer in tools/simtest.js geprueft, wie beim Reh und beim
   * Wildschwein.
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
    agent.goal = 'streifen';         // danach wird wieder gestreift, nicht sofort ein Ziel gesucht
    agent.roaming = false;
    agent.foodKind = null;
    agent.foodIndex = -1;
    agent.speedBase = A.drawSpeed(agent, spec, 'fliehen');
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.fleeSeconds);
    return true;
  }

  function fleeStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    agent.fleeAngle += Math.sin(ctx.time * 1.5 + agent.index) * 0.5 * dt;
    var result = A.roamStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), agent.fleeAngle, FLEE_TURN);
    if (result === 'blocked') agent.fleeAngle += 1.1;
    if (agent.stateTimer <= 0) beginRoam(agent, ctx);
  }

  WL.Brains.dachs = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
