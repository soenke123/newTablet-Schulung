/**
 * Verhalten des Barsches.
 *
 * Das Bild, das entstehen soll: ein enger Schwarm zieht tagsueber kreuz und
 * quer durch seinen See, immer in Bewegung, nie ans Ufer und niemals hinaus.
 * Wird er gestoert, schiesst er auf die andere Seite und meidet die Stelle
 * danach eine Weile. Nachts sammelt er sich in der Seemitte und kreist dort
 * langsam bis zum Morgen.
 *
 * Vier Dinge sind daran nicht offensichtlich:
 *
 * 1. **Der Schwarm ist die handelnde Einheit, nicht der Fisch.** Ziel,
 *    Abschnittstempo und Ruhezone gehoeren dem Schwarm; jeder Fisch bekommt
 *    davon nur seine Streuung und Tagesform obendrauf. Zoege jeder sein
 *    eigenes Ziel, risse der Schwarm binnen Sekunden auseinander.
 * 2. **Der Zusammenhalt entsteht trotzdem lokal, und zwar traege.** Drei
 *    Kraefte je Fisch - zusammenhalten, ausrichten, Abstand halten - dazu das
 *    gemeinsame Ziel und eine Kraft weg vom Ufer. Sie wirken nicht auf eine
 *    Wunschrichtung, sondern auf eine Geschwindigkeit (A.driftStep): der Fisch
 *    wird zum Schwarmmittelpunkt gezogen, *schiesst hindurch* und wird
 *    zurueckgeholt. Dieses Ueberschiessen ist das Wogen. Ohne Traegheit dreht
 *    jeder Fisch nur auf dieselbe gefilterte Richtung ein, keiner ueberholt,
 *    und der Schwarm gleitet als starre Formation ueber den See.
 *    Der Zusammenhalt zieht deshalb *entfernungsabhaengig* wie eine Feder -
 *    ein normierter Zug waere fuer den Fisch in der Mitte genauso stark wie
 *    fuer den am Rand und ergaebe wieder Stillstand statt Umschichtung.
 * 3. **Der See wird abgekaemmt, nicht durchirrt.** Die Zielwahl bevorzugt
 *    Stellen mit Vorrat, und gefressene Stellen sind eine Weile leer.
 * 4. **Meiden ist nicht Fliehen.** Nach dem Sprint bleibt die Stoerstelle als
 *    Sperrzone gemerkt; Ziele darin werden verworfen. Erst das ergibt den
 *    Sicherheitsabstand, statt nur eines kurzen Schrecks.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;

  var GOAL_DISTANCE_COST = 0.0012; // Entfernung gegen Vorrat bei der Zielwahl
  var AVOID_PENALTY = 2;           // so viel Punktabzug hat ein Ziel in der Sperrzone
  var AVOID_ACCEL = 55;            // u/s^2 weg von der Stoerstelle, dicht davor
  var CHECK_SECONDS = 0.25;        // viermal je Sekunde nach Stoerern sehen

  /*
   * Die Schwarmkraefte sind der teuerste Teil der ganzen Simulation: jeder
   * Fisch sieht jeden anderen seines Schwarms an, und das 20 Mal je Sekunde
   * ueber 5 Tage. Die Nachbarschaft aendert sich in 150 ms aber kaum (bei 22
   * u/s sind das 3 u Weg bei 70 u Sichtweite), also wird die Beschleunigung nur
   * alle 0.15 s neu bestimmt und dazwischen beibehalten. *Integriert* wird
   * weiterhin jeden Tick - sonst waere die Bewegung ruckartig und von der
   * Auffrischrate abhaengig. Am Bild aendert das nichts, an der Rechenzeit das
   * Dreifache.
   *
   * Die Fische sind dabei gegeneinander versetzt, damit nicht der ganze
   * Schwarm im selben Tick rechnet.
   */
  var STEER_SECONDS = 0.15;
  var STEER_STAGGER = 0.05;

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    var habitat = ctx.habitat;
    var i;

    // Ein Schwarm braucht Platz: Tuempel bleiben fischfrei.
    var eligible = [];
    for (i = 0; i < habitat.bodies.length; i++) {
      if (habitat.bodies[i].cellCount >= spec.water.minWaterCells) eligible.push(habitat.bodies[i]);
    }
    if (!eligible.length) return [];

    var sizes = splitIntoSchools(rng, spec, eligible.length);
    var pool = eligible.slice();
    var agents = [];

    for (var si = 0; si < sizes.length; si++) {
      var body = takeWeighted(rng, pool);
      var school = createSchool(ctx, spec, body, si);
      var start = habitat.pointAtDepth(school.rng, body, spec.water.depth[0], spec.water.depth[1]);
      school.tx = start.x;
      school.ty = start.y;

      for (var k = 0; k < sizes[si]; k++) {
        var agentRng = ctx.rng.fork('barsch-' + si + '-' + k);
        // Beisammen starten - ein Schwarm, der sich erst finden muss, sieht in
        // den ersten Minuten der Aufzeichnung falsch aus.
        var p = pointNear(agentRng, habitat, body, start.x, start.y, spec.school.neighbourRadius * 0.5);
        // Beisammen, aber nicht gleichgerichtet und nicht gleich schnell: der
        // Schwarm soll sich in den ersten Sekunden sortieren, nicht starten wie
        // eine Formation.
        var heading = agentRng.range(0, Math.PI * 2);
        var v0 = agentRng.rangeIn(spec.speed.schwimmen);
        var agent = {
          index: 0,               // setzt die Simulation
          speciesId: spec.id,
          spec: spec,
          rng: agentRng,
          x: p.x,
          y: p.y,
          heading: heading,
          vx: Math.cos(heading) * v0,
          vy: Math.sin(heading) * v0,
          state: S.schwimmen,
          stateTimer: 0,
          speedBase: 0,
          tx: start.x,
          ty: start.y,
          bodyIndex: body.index,
          // Ein Barsch hat genau ein Gewaesser - das ist die harte Grenze, die
          // ihn von der Ente trennt. tools/simtest.js prueft gegen diese Liste.
          homes: [body.index],
          partner: -1,
          traits: A.createTraits(agentRng, spec),
          mood: 1,
          moodFrom: 1,
          moodTo: 1,
          moodSpan: 1,
          moodTimer: 0,
          flight: null,           // fliegt nie - das Feld liest die Stoerabfrage
          school: school,
          ax: 0,                  // gemerkte Beschleunigung, siehe STEER_SECONDS
          ay: 0,
          steerTimer: k * STEER_STAGGER,
          waterChanges: 0
        };
        school.members.push(agent);
        agents.push(agent);
      }
    }

    return agents;
  }

  /**
   * Die Gesamtzahl auf Schwaerme aufteilen. Zusage aus data/tiere.md: mehrere
   * Seen, aber in einem besetzten See nie weniger als minSize. Deshalb bekommt
   * erst jeder Schwarm sein Minimum, und der Rest wird verteilt.
   */
  function splitIntoSchools(rng, spec, waterCount) {
    var total = rng.intIn(spec.count);
    var minSize = spec.school.minSize;
    var possible = Math.min(Math.floor(total / minSize), waterCount, spec.school.maxSchools);
    if (possible < 2) return [total];

    var count = rng.int(2, possible);
    var sizes = [];
    for (var i = 0; i < count; i++) sizes.push(minSize);
    var rest = total - count * minSize;
    for (var r = 0; r < rest; r++) sizes[rng.int(0, count - 1)]++;
    return sizes;
  }

  /** Auswahl nach Flaeche, ohne Zuruecklegen - grosse Seen zuerst. */
  function takeWeighted(rng, pool) {
    var total = 0;
    var i;
    for (i = 0; i < pool.length; i++) total += pool[i].cellCount;
    var pick = rng.next() * total;
    for (i = 0; i < pool.length; i++) {
      pick -= pool[i].cellCount;
      if (pick <= 0) break;
    }
    if (i >= pool.length) i = pool.length - 1;
    return pool.splice(i, 1)[0];
  }

  function createSchool(ctx, spec, body, si) {
    var schoolRng = ctx.rng.fork('schwarm-' + si);
    // Die Ruhezone liegt so tief im See, wie er es hergibt, und gilt fuer alle
    // fuenf Naechte. Derselbe Ort jede Nacht ist der Punkt daran: daraus wird
    // ein wiedererkennbarer Stammplatz statt eines beliebigen Schlafflecks.
    var rest = ctx.habitat.pointAtDepth(schoolRng, body, spec.water.restDepth[0], spec.water.restDepth[1]);
    var school = {
      bodyIndex: body.index,
      members: [],
      rng: schoolRng,
      state: S.schwimmen,
      speed: 0,
      tx: rest.x,
      ty: rest.y,
      legTimer: 0,
      night: false,
      restX: rest.x,
      restY: rest.y,
      restRadius: schoolRng.rangeIn(spec.water.restRadius),
      restPhase: schoolRng.range(0, Math.PI * 2),
      avoidX: 0,
      avoidY: 0,
      avoidUntil: -1,
      checkTimer: 0,
      // Der Lauerjaeger im eigenen See und die Entscheidung, ihn zu beachten.
      // Getrennt, weil das eine sich staendig aendert (er zieht um) und das
      // andere genau einmal je Abschnitt gezogen wird - siehe beginLeg.
      lurker: null,
      avoidLurker: false
    };
    // In einem kleinen See passt der Ring nicht; dann wird er enger, bis er
    // ganz im Wasser liegt.
    while (school.restRadius > 6 && !ringFits(ctx.habitat, body, school)) {
      school.restRadius *= 0.75;
    }
    return school;
  }

  function ringFits(habitat, body, school) {
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      if (!habitat.inBody(body, school.restX + Math.cos(a) * school.restRadius,
        school.restY + Math.sin(a) * school.restRadius)) return false;
    }
    return true;
  }

  /** Punkt im Umkreis, oder der Mittelpunkt selbst, wenn dort kein Wasser ist. */
  function pointNear(rng, habitat, body, x, y, radius) {
    for (var i = 0; i < 6; i++) {
      var a = rng.range(0, Math.PI * 2);
      var r = radius * Math.sqrt(rng.next());
      var nx = x + Math.cos(a) * r;
      var ny = y + Math.sin(a) * r;
      if (habitat.inBody(body, nx, ny)) return { x: nx, y: ny };
    }
    return { x: x, y: y };
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    A.updateMood(agent, agent.spec, dt);
    var school = agent.school;
    // Der Schwarm entscheidet einmal je Tick, nicht einmal je Fisch. Das erste
    // Mitglied traegt diese Rolle; die Reihenfolge liegt seit dem Anlegen fest,
    // also bleibt der Ablauf reproduzierbar.
    if (school.members[0] === agent) updateSchool(school, agent.spec, ctx, dt);
    swarmStep(agent, school, ctx, dt);
  }

  /** Die gemeinsamen Entscheidungen: Ziel, Tempo, Tag/Nacht, Stoerungen. */
  function updateSchool(school, spec, ctx, dt) {
    var body = ctx.habitat.bodies[school.bodyIndex];
    var awake = A.isAwake(ctx.time, spec);

    school.checkTimer -= dt;
    if (school.checkTimer <= 0) {
      school.checkTimer = CHECK_SECONDS;
      checkDisturbance(school, spec, ctx, body);
      // Wo der Hecht *gerade* liegt, wird laufend nachgesehen; *ob* er beachtet
      // wird, entscheidet einmal je Abschnitt (beginLeg). Ohne die Trennung
      // schoebe die Abstoessung den Schwarm die ganze Nacht von einer Stelle
      // weg, an der er laengst nicht mehr liegt - nachts gibt es keine
      // Abschnitte, an denen sich die Frage neu stellte.
      school.lurker = findLurker(school, spec, ctx);
    }

    if (school.state === S.fliehen) {
      school.legTimer -= dt;
      // Der Sprint endet, die Sperrzone gilt weiter - das ist der Unterschied
      // zwischen "erschrocken" und "haelt Abstand".
      if (school.legTimer <= 0) beginLeg(school, spec, ctx, body, awake);
      return;
    }

    if (school.night !== !awake) {         // Tag/Nacht hat gewechselt
      school.night = !awake;
      beginLeg(school, spec, ctx, body, awake);
    }

    if (!awake) {
      // Nachts kreist das Ziel langsam um die Ruhezone. Der Schwarm bleibt
      // dadurch in Bewegung, ohne den See zu verlassen - "deutlich langsamer",
      // nicht "steht still".
      school.restPhase += spec.water.restTurn * dt;
      school.tx = school.restX + Math.cos(school.restPhase) * school.restRadius;
      school.ty = school.restY + Math.sin(school.restPhase) * school.restRadius;
      return;
    }

    school.legTimer -= dt;
    if (school.legTimer <= 0 || reachedGoal(school, spec)) {
      beginLeg(school, spec, ctx, body, true);
    }
  }

  function beginLeg(school, spec, ctx, body, awake) {
    /*
     * **Die 90 % werden hier gezogen, einmal je Abschnitt** - nicht je
     * Stichprobe und nicht je Tick. Je Stichprobe waere es keine Zusage,
     * sondern eine Aufweichung (bei sieben Kandidaten kaeme im Mittel jedes
     * Mal einer durch), je Tick eine Lotterie mit zwanzig Ziehungen pro
     * Sekunde, in der das Loch praktisch immer offen ist.
     *
     * Gezogen wird nur, wenn ueberhaupt einer da ist. Das ist kein Sparen,
     * sondern Pflicht: school.rng ist derselbe Generator, aus dem Ziel, Tempo
     * und Ruhezone kommen. Ein Wurf ohne Hecht verschoebe den ganzen
     * Barschlauf - in Phase 1, wo es die Art noch nicht gibt, und in jedem
     * Vergleichslauf ohne sie. Genau das schliesst der Bitvergleich in
     * tools/simtest.js aus.
     */
    if (school.lurker) {
      school.avoidLurker = school.rng.chance(spec.reaction.avoid.chance);
    }

    if (!awake) {
      school.state = S.ruhen;
      school.speed = school.rng.rangeIn(spec.speed.ruhen);
      school.legTimer = 0;
      return;
    }
    school.state = S.schwimmen;
    // Tempo einmal je Abschnitt und fuer den ganzen Schwarm: mal zieht er
    // zuegig durch den See, mal traege.
    school.speed = school.rng.rangeIn(spec.speed.schwimmen);
    school.legTimer = school.rng.rangeIn(spec.school.legSeconds);
    var target = pickTarget(school, spec, ctx, body);
    school.tx = target.x;
    school.ty = target.y;
  }

  function centroid(school, out) {
    var cx = 0, cy = 0;
    for (var i = 0; i < school.members.length; i++) {
      cx += school.members[i].x;
      cy += school.members[i].y;
    }
    out.x = cx / school.members.length;
    out.y = cy / school.members.length;
    return out;
  }

  var scratch = { x: 0, y: 0 };

  function reachedGoal(school, spec) {
    var c = centroid(school, scratch);
    var dx = school.tx - c.x;
    var dy = school.ty - c.y;
    var r = spec.school.arriveRadius;
    return dx * dx + dy * dy < r * r;
  }

  /**
   * Wohin als Naechstes? Stichproben ueber das ganze Gewaesser: viel Vorrat
   * zieht an, Entfernung stoesst nur schwach ab (schwaecher als bei der Ente -
   * der Schwarm soll den See durchqueren, nicht an einer Ecke kleben). Ziele
   * in der Sperrzone bekommen kraeftigen Abzug.
   */
  function pickTarget(school, spec, ctx, body) {
    var c = centroid(school, scratch);
    var cx = c.x, cy = c.y;
    var best = null;
    var bestScore = -Infinity;
    var lurker = activeLurker(school);
    var lr = spec.reaction.avoid ? spec.reaction.avoid.radius : 0;
    for (var i = 0; i < spec.school.samples; i++) {
      var p = ctx.habitat.pointAtDepth(school.rng, body, spec.water.depth[0], spec.water.depth[1]);
      var dist = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
      var score = ctx.foodAt(p.x, p.y, spec.food) - dist * GOAL_DISTANCE_COST;
      if (inAvoidZone(school, spec, ctx.time, p.x, p.y)) score -= AVOID_PENALTY;
      if (lurker && near(p, lurker, lr)) score -= AVOID_PENALTY;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /**
   * Der Lauerjaeger im eigenen See - oder null, wenn keiner da ist oder der
   * Schwarm gerade eine der zehn Prozent hat, in denen er ihn nicht beachtet.
   *
   * **Meiden ist nicht Fliehen, und das ist hier der ganze Entwurf.** Der Hecht
   * liegt Tag und Nacht reglos im selben Gewaesser; ueber die Fluchtabfrage
   * behandelt ergaebe er fuenf Tage Dauerpanik statt gelegentlicher Schrecken -
   * dieselbe Falle, die das schlafende Reh am Ufer schon einmal gestellt hat.
   * Er ist deshalb fuer ctx.nearestDisturber unsichtbar (js/sim/pike.js setzt
   * agent.flight), und der Schwarm beruecksichtigt ihn stattdessen dort, wo
   * eine Entscheidung faellt: bei der Wahl des naechsten Ziels.
   *
   * Die Lotterie wird **einmal je Zielwahl** gezogen und nicht je Stichprobe.
   * Je Stichprobe waere sie keine Zusage, sondern eine Aufweichung: bei sieben
   * Kandidaten kaeme im Mittel jedes Mal einer durch, und aus "meidet ihn in
   * neun von zehn Faellen" wuerde "meidet ihn nie ganz".
   *
   * Entschieden wird ueber das *Gewaesser* und nicht ueber die Entfernung: ein
   * Hecht im Nachbarteich geht den Schwarm nichts an, auch wenn er naeher
   * liegt als das andere Ende des eigenen Sees.
   */
  function findLurker(school, spec, ctx) {
    var cfg = spec.reaction.avoid;
    if (!cfg || !ctx.nearestOfSpecies) return null;
    var found = ctx.nearestOfSpecies(school.members[0], cfg.search, cfg.species);
    // Entschieden wird ueber das *Gewaesser* und nicht ueber die Entfernung:
    // ein Hecht im Nachbarteich geht den Schwarm nichts an, auch wenn er
    // naeher liegt als das andere Ende des eigenen Sees.
    return found && found.bodyIndex === school.bodyIndex ? found : null;
  }

  /** Der Hecht, sofern dieser Abschnitt ihn ueberhaupt beachtet (die 90 %). */
  function activeLurker(school) {
    return school.avoidLurker ? school.lurker : null;
  }

  function near(p, other, radius) {
    var dx = p.x - other.x;
    var dy = p.y - other.y;
    return dx * dx + dy * dy < radius * radius;
  }

  function inAvoidZone(school, spec, time, x, y) {
    if (school.avoidUntil <= time) return false;
    var dx = x - school.avoidX;
    var dy = y - school.avoidY;
    var r = spec.reaction.safeDistance;
    return dx * dx + dy * dy < r * r;
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * Enten werden ausdruecklich ignoriert (sie sitzen auf der Oberflaeche).
   * Alles andere: der ganze Schwarm sprintet auf die abgewandte Seite, und die
   * Stelle bleibt danach Sperrzone. Gesucht wird von jedem Mitglied aus - ein
   * Tier am Rand des Schwarms stoert den Schwarm, nicht nur den Randfisch.
   */
  function checkDisturbance(school, spec, ctx, body) {
    var threat = null;
    for (var i = 0; i < school.members.length; i++) {
      var m = school.members[i];
      threat = ctx.nearestDisturber(m, spec.reaction.evadeRadius * m.traits.shyness,
        spec.reaction.ignore);
      if (threat) break;
    }
    if (!threat) return;

    school.avoidX = threat.x;
    school.avoidY = threat.y;
    school.avoidUntil = ctx.time + school.rng.rangeIn(spec.reaction.forgetSeconds);
    if (school.state === S.fliehen) return;

    var far = ctx.habitat.farPointIn(school.rng, body, threat.x, threat.y,
      spec.water.depth[0], spec.water.depth[1]);
    school.tx = far.x;
    school.ty = far.y;
    school.state = S.fliehen;
    school.speed = school.rng.rangeIn(spec.speed.fliehen);
    school.legTimer = school.rng.rangeIn(spec.reaction.panicSeconds);
  }

  // ------------------------------------------------------------- Schwarm

  /**
   * Ein Fisch, ein Tick: Beschleunigung auffrischen (nicht jeden Tick, siehe
   * STEER_SECONDS), fahren, fressen.
   */
  function swarmStep(agent, school, ctx, dt) {
    var spec = agent.spec;
    var sc = spec.school;
    var habitat = ctx.habitat;
    var body = habitat.bodies[school.bodyIndex];

    agent.state = school.state;

    agent.steerTimer -= dt;
    if (agent.steerTimer <= 0) {
      agent.steerTimer = STEER_SECONDS;
      steerForce(agent, school, ctx);
    }

    /*
     * Das Tempoband macht aus dem gemeinsamen Abschnittstempo eine Spanne, in
     * der sich das Einzeltempo frei einstellt: erst dadurch ueberholt ein Fisch
     * seinen Nachbarn, und erst dadurch schichtet sich der Schwarm um.
     *
     * Im Sprint ist es eng. Das ist nicht nur Zahlenpflege gegenueber dem
     * Katalog (data/tiere.md nennt 58 u/s als Fluchttempo, und ein Band nach
     * oben wuerde das ueberschreiten), sondern das richtige Bild: ein
     * aufgeschreckter Schwarm schiesst geschlossen weg, er woget dabei nicht.
     */
    var band = school.state === S.fliehen ? sc.fleeBand : sc.speedBand;
    var cruise = A.effectiveSpeed(agent, school.speed);
    agent.speedBase = school.speed;

    var result = A.driftStep(agent, habitat, body, dt, agent.ax, agent.ay,
      cruise * band[0], cruise * band[1]);
    // In eine Bucht geraten, aus der keine der Faecherrichtungen herausfuehrt:
    // umdrehen und beim naechsten Auffrischen neu entscheiden.
    if (result === 'blocked') {
      agent.vx = -agent.vx;
      agent.vy = -agent.vy;
      agent.heading += Math.PI;
      agent.steerTimer = 0;
    }

    if (school.state === S.schwimmen) {
      ctx.eatAt(agent.x, agent.y,
        spec.forage[spec.food].eatPerSecond * agent.traits.needs * dt, spec.food);
    }

    // Nur fuer Anzeige und Fehlersuche - gefahren wird ueber die Richtung.
    agent.tx = school.tx;
    agent.ty = school.ty;
  }

  /**
   * Die Beschleunigung dieses Fisches, nach agent.ax/ay. Sechs Kraefte, alle
   * in u/s^2: zusammenhalten, ausrichten, Abstand halten, zum gemeinsamen
   * Ziel, weg vom Ufer, weg von der Sperrzone.
   *
   * Zusammenhalt und Ausrichtung sind bewusst *nicht* normiert:
   *
   * - Zusammenhalt zieht wie eine Feder, proportional zum Abstand vom
   *   Schwerpunkt der Nachbarn. Der Fisch am Rand wird kraeftig hineingezogen,
   *   schiesst durch die Mitte hindurch und landet auf der anderen Seite -
   *   das ist die Umschichtung, die einen Schwarm ausmacht. Ein normierter Zug
   *   waere in der Mitte genauso stark wie am Rand: jeder haelt Position.
   * - Ausrichtung zieht die eigene Geschwindigkeit auf die mittlere der
   *   Nachbarn zu (Differenz, nicht Richtung). Damit wirkt sie zugleich als
   *   Daempfung der Feder - ohne sie schwaenge der Schwarm auf.
   */
  function steerForce(agent, school, ctx) {
    var spec = agent.spec;
    var sc = spec.school;
    var habitat = ctx.habitat;
    var members = school.members;

    var fx = 0, fy = 0, len;
    var cx = 0, cy = 0;      // Schwerpunkt der sichtbaren Nachbarn
    var mvx = 0, mvy = 0;    // deren mittlere Geschwindigkeit
    var sx = 0, sy = 0;      // Abstossung von den zu nahen
    var n = 0;
    var r2 = sc.neighbourRadius * sc.neighbourRadius;
    var sep2 = sc.separation * sc.separation;

    for (var i = 0; i < members.length; i++) {
      var other = members[i];
      if (other === agent) continue;
      var dx = other.x - agent.x;
      var dy = other.y - agent.y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      n++;
      cx += other.x;
      cy += other.y;
      mvx += other.vx;
      mvy += other.vy;
      if (d2 < sep2 && d2 > 1e-6) {
        // Einheitsvektor mal Naehe: nah stoesst stark ab, am Rand des
        // Trennabstands gar nicht mehr - sonst ist dort ein Sprung.
        var d = Math.sqrt(d2);
        var push = (1 - d / sc.separation) / d;
        sx -= dx * push;
        sy -= dy * push;
      }
    }

    if (n) {
      fx += (cx / n - agent.x) * sc.cohesion;
      fy += (cy / n - agent.y) * sc.cohesion;
      fx += (mvx / n - agent.vx) * sc.alignment;
      fy += (mvy / n - agent.vy) * sc.alignment;
      fx += sx * sc.separationAccel;
      fy += sy * sc.separationAccel;
    }

    var gx = school.tx - agent.x;
    var gy = school.ty - agent.y;
    len = Math.sqrt(gx * gx + gy * gy);
    if (len > 0.001) { fx += gx / len * sc.goalAccel; fy += gy / len * sc.goalAccel; }

    // Weg vom Ufer: der Tiefengradient schiebt ins Wasser hinein. Ein Barsch
    // im Uferschlick sieht falsch aus - und es haelt ihn zugleich aus dem
    // Gruendelbereich der Ente heraus.
    var here = habitat.depthAt(agent.x, agent.y);
    var want = spec.water.minDepth * habitat.cellSize;
    if (here < want) {
      var probe = habitat.cellSize * 2;
      var dxd = habitat.depthAt(agent.x + probe, agent.y) - habitat.depthAt(agent.x - probe, agent.y);
      var dyd = habitat.depthAt(agent.x, agent.y + probe) - habitat.depthAt(agent.x, agent.y - probe);
      len = Math.sqrt(dxd * dxd + dyd * dyd);
      if (len > 0.001) {
        var w = sc.shoreAccel * (1 - here / want);
        fx += dxd / len * w;
        fy += dyd / len * w;
      }
    }

    /*
     * **Hier steht mit Absicht keine Kraft gegen den Hecht** - und das ist der
     * teuerste Befund dieser Art gewesen.
     *
     * Der naheliegende Griff war, ihn wie die Sperrzone zu behandeln: eine
     * Abstossung je Fisch, nur schwaecher und ohne Panik. Gemessen ueber zehn
     * Seeds (Sprints des Hechts, also die Faelle, in denen ein Barsch ihm
     * wirklich zu nahe kam):
     *
     *   nur Zielwahl                 159   <70 u: 5.0 %   Mittel 147 u
     *   gar keine Meidung            172   <70 u: 5.5 %   Mittel 146 u
     *   Zielwahl + Abstossung 22     194   <70 u: 8.7 %   Mittel 140 u
     *
     * Die Abstossung treibt sie also **zusammen** statt auseinander, und der
     * Grund steht zwei Absaetze weiter oben im Kopfkommentar dieser Datei: der
     * Barsch faehrt mit Traegheit. Eine Kraft ergibt hier keine Wand, sondern
     * ein Ueberschiessen - genau das Ueberschiessen, das den Schwarm wogen
     * laesst. Ein Fisch, der vom Hecht weggedrueckt wird, wird von der
     * Kohaesion zurueckgeholt, schiesst durch den Schwarm hindurch und kommt
     * auf der anderen Seite naeher heraus als er vorher war.
     *
     * Was bleibt, ist die Zielwahl (pickTarget) - und die wirkt, wenn auch
     * bescheiden. Der groesste Teil des Abstands ist ohnehin **strukturell**:
     * der Hecht liegt bei Ufertiefe 2-4, und dort schiebt shoreAccel den
     * Schwarm ohnehin heraus. Wer die Zahlen oben fuer klein haelt, hat recht -
     * sie sind der Rest, den die Geografie uebriggelassen hat.
     */

    // Sicherheitsabstand: solange die Sperrzone gilt, schiebt sie jeden Fisch
    // einzeln von der Stelle weg - nicht nur das gemeinsame Ziel.
    if (school.avoidUntil > ctx.time) {
      var adx = agent.x - school.avoidX;
      var ady = agent.y - school.avoidY;
      var ad = Math.sqrt(adx * adx + ady * ady);
      var safe = spec.reaction.safeDistance;
      if (ad < safe && ad > 0.001) {
        var aw = AVOID_ACCEL * (1 - ad / safe);
        fx += adx / ad * aw;
        fy += ady / ad * aw;
      }
    }

    agent.ax = fx;
    agent.ay = fy;
  }

  WL.Brains.barsch = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
