/**
 * Verhalten des Bussards - die erste Art ausserhalb des Kernsets und der erste
 * *Nachzuegler*: er taucht nicht zu Beginn auf, sondern am Bruch bei Tag 5, und
 * zwar als genau ein Tier (js/sim/species.js, WL.NEW_SPECIES).
 *
 * Das Bild, das entstehen soll: ein einzelner Vogel zieht am hellen Tag weite
 * Kreise ueber den offenen Flaechen der Karte - mal enger, mal weiter -, sitzt
 * dazwischen reglos am Waldrand, und einmal am Tag steht er ueber einem
 * Kaninchenbau und dreht dort enge Runden, bis die Familie im Bau verschwunden
 * ist. Danach fliegt er schnell und geradlinig davon; die Kaninchen kommen von
 * selbst wieder heraus. Nachts schlaeft er auf demselben Baum wie jede Nacht.
 *
 * Fuenf Dinge sind daran nicht offensichtlich:
 *
 * 1. **Er hat kein Revier, und das ist eine Bedingung, keine Laune.** Ein
 *    Nachzuegler wird als einzelnes Tier angelegt (spec.count auf [1,1]
 *    gezwungen, js/sim/simulation.js). Alles, was einer Art *als Ganzes*
 *    gehoert, ist damit verboten: der Fuchs teilt die Karte nach Anzahl in
 *    Reviere auf und bekaeme allein die ganze, ein einzelner Barsch waere ein
 *    Schwarm aus einem Fisch. Der Bussard besitzt deshalb nur einen einzigen
 *    Ort - seinen Horst -, und der gehoert ihm allein.
 * 2. **Der Kreis wird als Kreis geflogen, nicht als Drehrate.** Position und
 *    Blickrichtung folgen einem Winkel auf einem festen Mittelpunkt. Das ist
 *    die Antwort auf die Falle, an der die Fledermaus zweimal von der Karte
 *    geflogen ist (data/tiere-workflow.md): ein Bogen mit begrenzter Drehrate
 *    kann ueber den Rand hinausschwingen, ein Kreis mit bekanntem Mittelpunkt
 *    und bekanntem Radius nicht - er bleibt beweisbar innerhalb von r um den
 *    Mittelpunkt, und der haelt r + edgeMargin Abstand zum Kartenrand. Die
 *    geraden Fluege dazwischen sind aus demselben Grund direkte Kurse.
 * 3. **Er stoert genau eine Art, und auch das ist strukturell.** agent.flight
 *    ist in *jedem* Zustand gesetzt ausser dem engen Jagdkreis - beim Kreisen
 *    ist er zu hoch, beim Sitzen und Schlafen reglos. Nur ueber dem Bau wird er
 *    greifbar, und dort loest Groessenklasse 2 genau die Fluchtschwelle des
 *    Kaninchens aus. An js/sim/rabbit.js ist dafuer nichts zu aendern, so wie
 *    schon fuer den Fuchs nichts zu aendern war.
 * 4. **Der Kaninchenbesuch ist eingeplant, nicht erhofft.** Er hat eine feste
 *    Uhrzeit je Tag und konkurriert mit nichts. Beim Dachs ist genau daran
 *    einmal die Zusage "1x pro Nacht" auf 0.1 gefallen: ein diskretes
 *    Einmal-Ereignis verliert gegen jede laufende Beschaeftigung, wenn man es
 *    in einen Vergleich stellt statt es einzuplanen.
 * 5. **Die Kreismittelpunkte brauchen Terrainbezug.** Rein geometrisch verteilt
 *    landen sie im Wald - die Fledermaus verbrachte so 77 % ihrer Zeit ueber
 *    Waldflaeche, obwohl im Katalog Gras und Wasser standen. Gesucht wird
 *    deshalb wie beim Kaninchenbau: mehrere Kandidaten, ein paar Stichproben,
 *    der beste gewinnt.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TAU = Math.PI * 2;
  var ARRIVE = 5;
  // Zeitzuschlag fuer den Hinflug zum Waldrand bei der Frage, ob eine Pause vor
  // dem Feierabend ueberhaupt noch lohnt (beginPerch).
  var PERCH_FLIGHT = 10;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;

    // Der Horst wird einmal gesucht, unter eigenem Namen: er gehoert zum Ort
    // und nicht zum Tier, auch wenn hier nur ein Tier daran haengt.
    var eyrie = findEyrie(ctx, spec, rng.fork('horst'));
    if (!eyrie) return [];

    var burrows = preyHomes(ctx.agents, spec.visit.prey);
    var count = rng.intIn(spec.count);
    var agents = [];

    for (var k = 0; k < count; k++) {
      var agentRng = ctx.rng.fork('bussard-' + k);
      var agent = {
        index: 0,               // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: eyrie.x,
        y: eyrie.y,
        heading: agentRng.range(0, TAU),
        state: S.schlafen,
        stateTimer: 0,
        speedBase: 0,
        tx: eyrie.x,
        ty: eyrie.y,
        eyrie: eyrie,
        // Die Baue der Beuteart, so wie sie beim Anlegen dastanden. Der Bussard
        // *sucht* nicht (das ist ctx.nearestPrey und gehoert dem Fuchs), er
        // kennt den Ort - wie der Dachs seinen Ameisenhuegel.
        burrows: burrows,
        circle: null,           // {x, y, r, dir} - der Kreis, der gerade gilt
        angle: 0,               // Winkel darauf
        circleTimer: 0,
        perchTimer: agentRng.rangeIn(spec.perch.after),
        after: 'kreis',         // was nach dem geraden Flug kommt
        visitDay: -1,
        visitAt: 0,
        visitDone: false,
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        partner: -1,
        flight: null,           // siehe update(): ueberall true ausser im Jagdkreis
        visits: 0               // wie oft er bei den Kaninchen war
      };
      agents.push(agent);
    }

    return agents;
  }

  /**
   * Der Horst: ein Baum tief genug im Wald (Regel in js/world/rules.js,
   * placement.eyrie). Gezogen wird aus den Baeumen der Welt und nicht aus dem
   * Raster - "hoher Baum" steht so im Katalog, und die Baeume liegen fertig da.
   *
   * Zwei Rueckfaelle dahinter, dieselbe Vorsicht wie beim Kaninchenbau: findet
   * sich unter den Kandidaten kein passender Baum, wird eine Waldstelle der
   * verlangten Tiefe gesucht, und zuletzt irgendeine Waldzelle. Eine Art, die
   * auf einem ungluecklichen Seed ganz ausfaellt, waere der schlechtere Fehler.
   */
  function findEyrie(ctx, spec, rng) {
    var q = ctx.world.query;
    var trees = ctx.world.objects.trees || [];
    var rule = WL.Rules.placement.eyrie;

    for (var t = 0; t < spec.home.tries && trees.length; t++) {
      var tree = trees[Math.floor(rng.next() * trees.length)];
      if (rule(q, tree, spec.home)) return { x: tree.x, y: tree.y };
    }

    var deep = ctx.land.forestNear(rng, q.width / 2, q.height / 2,
      Math.max(q.width, q.height), 0, 0, spec.home.minForestDepth, 99);
    return deep || ctx.land.pointOfType(rng, T.FOREST, 0);
  }

  /** Die festen Baue einer Art, jeder nur einmal - mehrere Tiere teilen sich einen. */
  function preyHomes(agents, speciesId) {
    var out = [];
    if (!agents) return out;
    for (var i = 0; i < agents.length; i++) {
      if (agents[i].speciesId !== speciesId || !agents[i].burrow) continue;
      if (out.indexOf(agents[i].burrow) < 0) out.push(agents[i].burrow);
    }
    return out;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    // **Die eine Zeile, an der die ganze Stoerwirkung dieser Art haengt.**
    // Kreisend ist er zu hoch, sitzend und schlafend reglos - in beiden Faellen
    // zaehlt er fuer ctx.nearestDisturber nicht als greifbares Tier, genau wie
    // die fliegende Ente und die Fledermaus. Nur im engen Jagdkreis ueber dem
    // Bau ist er da, und genau dort soll er es sein.
    agent.flight = agent.state !== S.jagen;

    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);

    if (!awake || settling) {
      if (agent.state === S.schlafen) { restStep(agent, ctx, dt); return; }
      // Einen laufenden Besuch bringt er zu Ende. Er dauert hoechstens ein
      // paar Sekunden, und ein auf halber Runde abgebrochener Jagdkreis waere
      // genau die Zusage, die hier gemessen wird.
      if (agent.state === S.jagen) { visitStep(agent, ctx, dt); return; }
      if (agent.after !== 'horst') { beginReturn(agent); return; }
      travelStep(agent, ctx, dt);
      return;
    }

    if (agent.state === S.schlafen) { beginSearch(agent, ctx, 'fliegen'); return; }
    if (agent.state === S.fliegen) { travelStep(agent, ctx, dt); return; }
    if (agent.state === S.jagen) { visitStep(agent, ctx, dt); return; }

    // Kreisen und Sitzen sind die beiden Zustaende, aus denen heraus der
    // Tagesbesuch beginnen darf - unterwegs waere er nur ein Umweg im Umweg.
    if (checkVisit(agent, ctx)) return;
    if (agent.state === S.sichern) { perchStep(agent, ctx, dt); return; }
    circleStep(agent, ctx, dt);
  }

  /** Am Horst: kaum merkliches Ruehren, kein eigener Zustand noetig. */
  function restStep(agent, ctx, dt) {
    agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.04 * dt;
  }

  // ------------------------------------------------------------ Reiseflug

  /**
   * Direkter Flug auf tx/ty zu, ohne Domaenenpruefung und ohne Eindrehen -
   * derselbe Kurs wie bei der Fledermaus (js/sim/bat.js, flyTowards) und aus
   * demselben Grund: die Karte ist ein Rechteck, und die gerade Strecke
   * zwischen zwei Punkten darin liegt selbst darin.
   */
  function flyTowards(agent, dt, speed) {
    var dx = agent.tx - agent.x;
    var dy = agent.ty - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= ARRIVE) return 'arrived';
    agent.heading = Math.atan2(dy, dx);
    var step = Math.min(speed * dt, dist);
    agent.x += Math.cos(agent.heading) * step;
    agent.y += Math.sin(agent.heading) * step;
    return 'moving';
  }

  function travelStep(agent, ctx, dt) {
    if (flyTowards(agent, dt, A.effectiveSpeed(agent, agent.speedBase)) !== 'arrived') return;
    if (agent.after === 'horst') { agent.state = S.schlafen; agent.speedBase = 0; return; }
    if (agent.after === 'sitzen') { arriveAtPerch(agent, ctx); return; }
    if (agent.after === 'jagd') { arriveAtVisit(agent); return; }
    arriveAtCircle(agent);
  }

  function beginReturn(agent) {
    agent.tx = agent.eyrie.x;
    agent.ty = agent.eyrie.y;
    agent.state = S.fliegen;
    agent.after = 'horst';
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'fliegen');
  }

  // -------------------------------------------------------------- Kreisen

  /**
   * Den naechsten Suchkreis waehlen und geradewegs dorthin aufbrechen.
   *
   * Das Anflugziel ist nicht der Mittelpunkt, sondern der Punkt auf dem Kreis,
   * der dem Bussard am naechsten liegt - dadurch geht die Gerade ohne Knick in
   * die Schleife ueber, und der Kreis beginnt genau dort, wo der Flug endet.
   */
  function beginSearch(agent, ctx, speedKey, minDist, maxDist) {
    var cfg = agent.spec.circle;
    var circle = pickCircle(agent, ctx,
      minDist == null ? cfg.hop[0] : minDist,
      maxDist == null ? cfg.hop[1] : maxDist);
    agent.circle = circle;
    agent.angle = Math.atan2(agent.y - circle.y, agent.x - circle.x);
    agent.tx = circle.x + Math.cos(agent.angle) * circle.r;
    agent.ty = circle.y + Math.sin(agent.angle) * circle.r;
    agent.state = S.fliegen;
    agent.after = 'kreis';
    agent.speedBase = A.drawSpeed(agent, agent.spec, speedKey);
  }

  /**
   * Ein Kreismittelpunkt ueber offener Flaeche, in Reichweite. Kandidaten
   * werden gezogen und nach dem Terrain darunter bewertet (openShare); der
   * beste gewinnt, ein sehr guter bricht die Suche vorzeitig ab.
   *
   * Der Mittelpunkt wird auf den Bereich geklemmt, in dem der ganze Kreis auf
   * die Karte passt. Das ist die einzige Randpruefung, die diese Art braucht -
   * alles andere folgt daraus.
   */
  function pickCircle(agent, ctx, minDist, maxDist) {
    var cfg = agent.spec.circle;
    var q = ctx.world.query;
    var rng = agent.rng;
    var r = rng.rangeIn(cfg.radius);
    var margin = r + cfg.edgeMargin;
    var best = null;
    var bestShare = -1;

    for (var t = 0; t < cfg.tries; t++) {
      var a = rng.range(0, TAU);
      var d = rng.range(minDist, maxDist);
      var cx = A.clamp(agent.x + Math.cos(a) * d, margin, q.width - margin);
      var cy = A.clamp(agent.y + Math.sin(a) * d, margin, q.height - margin);
      var share = openShare(q, cx, cy, r, cfg.samples);
      if (share > bestShare) {
        bestShare = share;
        best = { x: cx, y: cy, r: r, dir: 1 };
      }
      if (share >= 0.8) break;
    }
    best.dir = rng.chance(0.5) ? 1 : -1;
    return best;
  }

  /** Anteil der Stichproben (Mitte plus Ring) auf Gras oder offenem Boden. */
  function openShare(q, cx, cy, r, samples) {
    var hits = 0;
    for (var i = 0; i < samples; i++) {
      var x, y;
      if (i === 0) { x = cx; y = cy; }
      else {
        var a = (i - 1) / (samples - 1) * TAU;
        x = cx + Math.cos(a) * r * 0.7;
        y = cy + Math.sin(a) * r * 0.7;
      }
      var terrain = q.terrainAt(x, y);
      if (terrain === T.GRASS || terrain === T.GROUND) hits++;
    }
    return hits / samples;
  }

  function arriveAtCircle(agent) {
    agent.state = S.kreisen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'kreisen');
    agent.circleTimer = agent.rng.rangeIn(agent.spec.circle.bout);
  }

  /**
   * Ein Schritt auf dem Kreis. Gerechnet wird im Winkel und nicht in der
   * Richtung: die Bahn ist damit exakt der Kreis und driftet ueber eine lange
   * Schleife nicht davon (siehe Kopfkommentar, Punkt 2).
   */
  function ride(agent, dt) {
    var c = agent.circle;
    var speed = A.effectiveSpeed(agent, agent.speedBase);
    agent.angle += c.dir * (speed / c.r) * dt;
    agent.x = c.x + Math.cos(agent.angle) * c.r;
    agent.y = c.y + Math.sin(agent.angle) * c.r;
    agent.heading = agent.angle + c.dir * Math.PI / 2;
  }

  function circleStep(agent, ctx, dt) {
    ride(agent, dt);
    agent.circleTimer -= dt;
    agent.perchTimer -= dt;
    if (agent.circleTimer > 0) return;

    var perch = agent.spec.perch;
    if (agent.perchTimer <= 0) {
      agent.perchTimer = agent.rng.rangeIn(perch.after);
      if (beginPerch(agent, ctx)) return;
      // Fehlversuch (zu spaet am Tag, oder kein Waldrand in Reichweite): gleich
      // beim naechsten Kreis noch einmal. Ohne diesen kurzen Nachlauf kostet
      // ein Fehlversuch eine volle Wartezeit, und bei einem Wachfenster von
      // 138 s ist das die halbe Chance des Tages - gemessen fielen so drei bis
      // vier von sieben Versuchen ersatzlos aus. Nebenwirkung und Absicht
      // zugleich: wer abends zu spaet dran war, sitzt am naechsten Morgen
      // frueh, statt wieder eine volle Wartezeit anzufangen.
      agent.perchTimer = perch.retry;
    }
    beginSearch(agent, ctx, 'fliegen');
  }

  // ------------------------------------------------------------- Sitzen

  /**
   * Landen am Waldrand. Findet sich in Reichweite keiner (mitten in einer
   * grossen Wiese kommt das vor), wird weitergekreist - der Aufrufer erfaehrt
   * das am Rueckgabewert.
   */
  function beginPerch(agent, ctx) {
    var perch = agent.spec.perch;

    // Kurz vor dem Aufbruch zum Horst lohnt keine Pause mehr - sie wuerde nach
    // wenigen Sekunden vom Heimflug abgebrochen. Das war nicht theoretisch:
    // gemessen begannen vier von zehn Pausen zwischen 0.68 und 0.71 (leaveAt
    // ist 0.72) und dauerten 2.6 bis 7.8 s statt der zugesagten 12-30.
    //
    // Verglichen wird mit der *kuerzesten* Pause plus dem Hinflug, nicht mit
    // der laengsten: gegen bout[1] geprueft sperrte diese Zeile das letzte
    // Zehntel des Tages komplett und kostete mehr Pausen, als sie gerettet hat
    // (auf einem Seed blieben null uebrig). Was am Ende des Tages noch bleibt,
    // sitzt er eben kuerzer - siehe arriveAtPerch.
    if (timeLeft(agent, ctx) < perch.bout[0] + PERCH_FLIGHT) return false;

    // Gemessen scheitert diese Suche nie (0 von 32 Versuchen ueber fuenf
    // Seeds) - die zu seltenen Pausen kamen ausschliesslich aus den
    // Wartezeiten, nicht aus dem Gelaende. Der Rueckgabewert bleibt trotzdem
    // ehrlich: eine Karte mit weniger Wald gibt es.
    var p = ctx.land.forestNear(agent.rng, agent.x, agent.y, perch.radius, 0,
      perch.maxDistance, perch.depth[0], perch.depth[1]);
    if (!p) return false;
    agent.tx = p.x;
    agent.ty = p.y;
    agent.state = S.fliegen;
    agent.after = 'sitzen';
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'fliegen');
    return true;
  }

  function arriveAtPerch(agent, ctx) {
    agent.state = S.sichern;
    agent.speedBase = 0;
    // Gedeckelt auf das, was der Tag noch hergibt: so endet die Pause von
    // selbst, statt vom Heimflug mittendrin abgeschnitten zu werden.
    agent.stateTimer = Math.min(agent.rng.rangeIn(agent.spec.perch.bout), timeLeft(agent, ctx));
  }

  /** Sekunden bis zum Aufbruch zum Horst. */
  function timeLeft(agent, ctx) {
    var left = agent.spec.sleep.leaveAt - WL.SimTime.dayFraction(ctx.time);
    return left * WL.SimTime.DAY_SECONDS;
  }

  function perchStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    // Der sitzende Vogel dreht den Kopf - sichtbar, aber ohne Ortsaenderung.
    agent.heading += Math.sin(ctx.time * 0.8 + agent.index) * 0.06 * dt;
    if (agent.stateTimer <= 0) beginSearch(agent, ctx, 'fliegen');
  }

  // -------------------------------------------------- Besuch bei den Kaninchen

  /**
   * Einmal am Tag, zu einer je Tag gewuerfelten Uhrzeit. Der Zeitpunkt wird
   * beim ersten Tick des Tages gezogen und nicht beim Aufbruch - sonst haenge
   * er daran, wann der Bussard gerade zufaellig kreist.
   *
   * visitDone wird auch dann gesetzt, wenn es gar keinen Bau gibt: ohne
   * Kaninchen auf der Karte faellt der Besuch aus, und zwar einmal und nicht
   * fuenfundzwanzigmal je Sekunde.
   */
  function checkVisit(agent, ctx) {
    var v = agent.spec.visit;
    var day = WL.SimTime.dayNumber(ctx.time);

    if (agent.visitDay !== day) {
      agent.visitDay = day;
      agent.visitAt = agent.rng.rangeIn(v.at);
      agent.visitDone = false;
    }
    if (agent.visitDone) return false;
    if (WL.SimTime.dayFraction(ctx.time) < agent.visitAt) return false;

    agent.visitDone = true;
    var burrow = nearestBurrow(agent);
    if (!burrow) return false;
    beginVisit(agent, ctx, burrow);
    return true;
  }

  function nearestBurrow(agent) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < agent.burrows.length; i++) {
      var b = agent.burrows[i];
      var d = (b.x - agent.x) * (b.x - agent.x) + (b.y - agent.y) * (b.y - agent.y);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  /**
   * Der enge Kreis ueber dem Bau. Der Mittelpunkt ist der Bau selbst, nur auf
   * die Karte geklemmt - ein Bau so dicht am Rand, dass der Kreis hinausragte,
   * gibt es zwar nicht (er braucht offenes Gelaende ringsum), aber die
   * Randbedingung dieser Art soll an genau einer Stelle stehen und nicht an
   * zweien mit einer Ausnahme dazwischen.
   */
  function beginVisit(agent, ctx, burrow) {
    var v = agent.spec.visit;
    var q = ctx.world.query;
    var r = agent.rng.rangeIn(v.radius);
    var margin = r + agent.spec.circle.edgeMargin;

    agent.circle = {
      x: A.clamp(burrow.x, margin, q.width - margin),
      y: A.clamp(burrow.y, margin, q.height - margin),
      r: r,
      dir: agent.rng.chance(0.5) ? 1 : -1
    };
    agent.angle = Math.atan2(agent.y - agent.circle.y, agent.x - agent.circle.x);
    agent.tx = agent.circle.x + Math.cos(agent.angle) * r;
    agent.ty = agent.circle.y + Math.sin(agent.angle) * r;
    agent.state = S.fliegen;
    agent.after = 'jagd';
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'fliegen');
  }

  function arriveAtVisit(agent) {
    agent.state = S.jagen;
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'kreisen');
    agent.circleTimer = agent.rng.rangeIn(agent.spec.visit.bout);
    agent.visits++;
  }

  /**
   * Der Jagdkreis - dieselbe Bahn wie beim Suchkreis, nur enger und mit
   * agent.flight auf false (siehe update). Danach geht es schnell und weit
   * weg: erst dadurch kommen die Kaninchen wieder aus dem Bau, denn ihre
   * Wartezeit drin laeuft nur, solange nichts Neues sie erschreckt.
   */
  function visitStep(agent, ctx, dt) {
    ride(agent, dt);
    agent.circleTimer -= dt;
    if (agent.circleTimer > 0) return;
    var v = agent.spec.visit;
    beginSearch(agent, ctx, 'abflug', v.away, v.away + agent.spec.circle.hop[1]);
  }

  WL.Brains.bussard = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
