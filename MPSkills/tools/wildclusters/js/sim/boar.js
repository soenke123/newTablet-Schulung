/**
 * Verhalten des Wildschweins - das erste nachtaktive Tier und die erste
 * Gruppe, die keine Formation ist.
 *
 * Das Bild, das entstehen soll: eine Rotte von drei bis fuenf Tieren zieht die
 * Nacht ueber durch ihr Revier, von einem Nussnest zum naechsten. Sie wuehlt
 * lange an einer Stelle, legt sich zwischendurch auf eine Bodenflaeche und
 * suhlt sich, geht zweimal ans Wasser und verschwindet im Morgengrauen tief im
 * Wald, wo alle eng beieinander liegen. Dabei bleibt mal eins stehen und holt
 * die anderen wieder ein.
 *
 * Fuenf Dinge sind daran nicht offensichtlich:
 *
 * 1. **Die Rotte ist die handelnde Einheit, aber sie ist kein Schwarm.** Beim
 *    Barsch entsteht der Zusammenhalt aus Kraeften zwischen den Fischen - jeder
 *    sieht jeden an, und das ist der teuerste Teil der ganzen Simulation. Hier
 *    gibt es nur ein gemeinsames Ziel und einen Schwerpunkt, den ein Tier je
 *    Tick ausrechnet. Jedes Tier haelt einen eigenen Platz im Umkreis darum.
 * 2. **Dieser Platz wird staendig neu ausgewuerfelt.** Bliebe er fest, zoege
 *    die Rotte ihre Anordnung mit sich herum und waere doch eine Formation -
 *    ein starrer Versatz ist derselbe Fehler wie ein starres Ziel.
 * 3. **Stehenbleiben und Aufschliessen sind zwei Zahlen, nicht eine.** Ein Tier
 *    haelt nach seiner *eigenen* Uhr an. Damit es die Gruppe danach wieder
 *    einholt, braucht es ein eigenes, hoeheres Tempo - liefe es mit demselben
 *    Tempo weiter wie die anderen, bliebe der Abstand fuer immer bestehen.
 * 4. **Das Wildschwein sieht seine Nahrung nicht, es kennt sein Revier.** Das
 *    ist der ausdrueckliche Gegensatz zum Reh, das nur findet, was im Umkreis
 *    von 150 u liegt. Beim Anlegen sammelt die Rotte alle Nussnester,
 *    Apfelbaeume und Ameisenhuegel in ihrem Umkreis ein und waehlt daraus nach
 *    Vorliebe mal Vorrat.
 * 5. **Weiterziehen muss man ihm nicht beibringen.** Drei bis fuenf Tiere
 *    fressen an derselben Stelle, also ist deren Vorrat drei- bis fuenfmal so
 *    schnell leer wie beim einzeln lebenden Reh.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 2.0;          // rad/s - ein Wildschwein dreht traeger als ein Reh
  var FLEE_TURN = 3.2;
  var CHECK_SECONDS = 0.25;
  var FLEE_DISTANCE = 260; // wie weit das Fluchtziel vom Stoerer weg liegt

  /**
   * Ortsnahrung: ein Vorrat je Weltobjekt, und immer nur *ein* Tier frisst
   * daran. Die Flaechennahrung 'boden' steht bewusst nicht in dieser Liste -
   * sie hat keine Stellen, sondern liegt ueberall, wo sichtbarer Boden ist,
   * und wird deshalb getrennt behandelt.
   */
  var KINDS = ['nuesse', 'aepfel', 'ameisen'];

  var scratch = { x: 0, y: 0, value: 0 };

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    // Das Revier haengt an einem Nussnest, nicht an einem beliebigen Waldstueck:
    // es gibt nur 3-5 Nester auf der Karte und sie liegen tief im Wald. Ein
    // zufaellig gewaehltes Revier haette womoeglich keins erwischt - und dann
    // haette die Rotte ihre Hauptnahrung nie gefunden.
    var patches = ctx.world.objects.resourcePatches || [];
    if (!patches.length) return [];

    var sizes = splitIntoSounders(rng, spec);
    var taken = [];
    var agents = [];

    for (var g = 0; g < sizes.length; g++) {
      var patch = pickPatch(rng, patches, taken, spec, ctx.land);
      if (!patch) break;
      taken.push(patch);

      var sounder = createSounder(ctx, spec, patch, g);
      var size = sizes[g];

      for (var k = 0; k < size; k++) {
        var agentRng = ctx.rng.fork('wildschwein-' + g + '-' + k);
        // Beisammen starten: eine Rotte, die sich erst finden muss, sieht in
        // den ersten Minuten der Aufzeichnung falsch aus.
        var p = ctx.land.pointInRing(agentRng, patch.x, patch.y, 0,
          spec.sounder.spread, -1, sounder.region) || { x: patch.x, y: patch.y };

        var agent = {
          index: 0,                // setzt die Simulation
          speciesId: spec.id,
          spec: spec,
          rng: agentRng,
          x: p.x,
          y: p.y,
          heading: agentRng.range(0, Math.PI * 2),
          state: S.gehen,
          stateTimer: 0,
          speedBase: 0,
          tx: p.x,
          ty: p.y,
          region: sounder.region,
          sounder: sounder,
          // Der eigene Platz im Verband, als Winkel und Anteil des Umkreises.
          offAngle: agentRng.range(0, Math.PI * 2),
          offDist: Math.sqrt(agentRng.next()),
          offTimer: agentRng.rangeIn(spec.sounder.offsetSeconds),
          // Die eigene Uhr fuers Stehenbleiben. Sie laeuft unabhaengig von der
          // Rotte - sonst hielten alle gleichzeitig an, und aus dem Troedeln
          // wuerde eine gemeinsame Pause.
          lagTimer: agentRng.rangeIn(spec.sounder.lagInterval),
          catching: false,
          catchSpeed: 0,
          traits: A.createTraits(agentRng, spec),
          mood: 1,
          moodFrom: 1,
          moodTo: 1,
          moodSpan: 1,
          moodTimer: 0,
          partner: -1,
          flight: null,            // fliegt nie; das Feld liest die Stoerabfrage
          drinks: 0,
          wallows: 0
        };
        sounder.members.push(agent);
        agents.push(agent);
      }
    }

    return agents;
  }

  /**
   * Die Gesamtzahl auf Rotten aufteilen - dieselbe Richtung wie beim
   * Barschschwarm (js/sim/perch.js, splitIntoSchools): die Anzahl der Tiere
   * steht fest, wie viele Rotten daraus werden, ergibt sich daraus.
   *
   * Frueher lief es andersherum: erst die Rotten wuerfeln, dann jede fuer sich
   * fuellen. Das war bequem, machte spec.count aber zu einer blossen Notiz -
   * und seit ueber der ganzen Welt eine Obergrenze steht (WL.POPULATION,
   * js/sim/simulation.js), muss jede Art eine ihr zugeteilte Anzahl auch
   * wirklich einhalten koennen. Die erreichbaren Rottengroessen sind dieselben
   * geblieben (1x 3-5 oder 2x 3-5), nur ihre Haeufigkeiten haben sich
   * verschoben.
   */
  function splitIntoSounders(rng, spec) {
    var cfg = spec.sounder;
    var total = rng.intIn(spec.count);
    var lo = cfg.size[0];
    var hi = cfg.size[1];
    // So viele Rotten, wie sich mit dieser Gesamtzahl ueberhaupt fuellen
    // lassen: jede braucht mindestens lo Tiere und vertraegt hoechstens hi.
    var min = Math.max(cfg.groups[0], Math.ceil(total / hi));
    var max = Math.min(cfg.groups[1], Math.floor(total / lo));
    if (max < min) max = min;

    var count = rng.int(min, max);
    var sizes = [];
    var i;
    for (i = 0; i < count; i++) sizes.push(lo);

    // Der Rest wird verteilt, aber nur dort, wo noch Platz bis hi ist.
    var rest = total - count * lo;
    while (rest > 0) {
      var room = [];
      for (i = 0; i < count; i++) if (sizes[i] < hi) room.push(i);
      if (!room.length) break;
      sizes[rng.pick(room)]++;
      rest--;
    }
    return sizes;
  }

  /**
   * Ein Nussnest als Revierzentrum. Zwei Rotten sollen nicht auf demselben
   * Nest sitzen - sonst teilen sie sich denselben Vorrat und laufen einander
   * die ganze Nacht ueber den Weg.
   */
  function pickPatch(rng, patches, taken, spec, land) {
    var best = null;
    var bestDist = -1;
    for (var t = 0; t < 30; t++) {
      var p = patches[rng.int(0, patches.length - 1)];
      if (land.regionAt(p.x, p.y) <= 0) continue;
      var near = Infinity;
      for (var i = 0; i < taken.length; i++) {
        var d = Math.hypot(taken[i].x - p.x, taken[i].y - p.y);
        if (d < near) near = d;
      }
      if (near >= spec.home.minPatchDistance) return p;
      // Keins weit genug weg: dann wenigstens das entfernteste nehmen.
      if (near > bestDist) { bestDist = near; best = p; }
    }
    return best;
  }

  function createSounder(ctx, spec, patch, g) {
    var srng = ctx.rng.fork('rotte-' + g);
    var sounder = {
      rng: srng,
      members: [],
      region: ctx.land.regionAt(patch.x, patch.y),
      // Das Waldstueck, in dem das Nussnest liegt - es und nicht das Nest ist
      // das Revier. Findet sich keins (das Nest laege dann ausserhalb jeder
      // erkannten Waldregion), tut es der naechstgelegene Wald.
      forest: forestAt(ctx.world, patch.x, patch.y),
      margin: spec.home.margin,
      forestChanges: 0,        // wie oft sie das Waldstueck gewechselt hat
      spots: {},               // je Nahrungsart die Nummern der Stellen im Revier
      state: S.gehen,
      // Beim Anlegen steht die Rotte auf ihrem eigenen Zielpunkt und gilt damit
      // sofort als "angekommen". Sie darf deshalb nicht schon "futter" wollen -
      // eine Nahrungsstelle gewaehlt hat sie ja noch nicht, und waehlen kann
      // sie erst im ersten Tick, weil die Vorratskarten beim Anlegen noch nicht
      // erreichbar sind. "streifen" fuehrt genau dorthin.
      goal: 'streifen',        // 'futter' | 'suhle' | 'wasser' | 'schlaf' | 'streifen' | 'flucht'
      speed: 0,
      tx: patch.x,
      ty: patch.y,
      cx: patch.x,             // Schwerpunkt, einmal je Tick
      cy: patch.y,
      stateTimer: 0,
      walkTimer: 0,
      checkTimer: 0,
      foodKind: null,
      foodIndex: -1,
      skipKind: null,          // zuletzt leergewuehlte Stelle ...
      skipIndex: -1,
      skipUntil: 0,            // ... und bis wann sie gesperrt bleibt
      sleepSpot: null,
      sleepTries: 0,
      nextDrink: 0,
      nextWallow: 0
    };
    collectSpots(sounder, ctx, spec);
    // Beduerfnisse streuen, sonst geht in der ersten Nacht jede Rotte zur
    // selben Stunde ans Wasser.
    sounder.nextDrink = WL.SimTime.hours(srng.range(15, 22));
    sounder.nextWallow = WL.SimTime.hours(srng.range(14, 20));
    return sounder;
  }

  // ---------------------------------------------------------------- Revier

  /**
   * Das Waldstueck an dieser Stelle. Der Weltgenerator liefert die Waldregionen
   * mit Mittelpunkt und umschliessendem Rechteck (js/world/terrain.js,
   * componentMeta); mehr braucht die Rotte nicht.
   */
  function forestAt(world, x, y) {
    var regions = world.terrain.forestRegions;
    if (!regions || !regions.length) return null;
    var best = regions[0];
    var bestDist = Infinity;
    for (var i = 0; i < regions.length; i++) {
      var d = distToBounds(regions[i].bounds, x, y);
      if (d < bestDist) { bestDist = d; best = regions[i]; }
    }
    return best;
  }

  /** Abstand zu einem Rechteck, 0 innerhalb. */
  function distToBounds(b, x, y) {
    var dx = x < b.minX ? b.minX - x : (x > b.maxX ? x - b.maxX : 0);
    var dy = y < b.minY ? b.minY - y : (y > b.maxY ? y - b.maxY : 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Gehoert diese Stelle zum Revier? Das Revier ist das Waldstueck plus einen
   * Streifen ringsum - dort liegen die Apfelbaeume (die halten laut
   * Weltgenerator Abstand zum Wald), die Bodenflaechen und das Wasser.
   *
   * Ein Rechteck statt eines Kreises ist hier kein Notbehelf: ein Waldstueck
   * ist bis zu 900 u lang, ein Kreis darum waere entweder viel zu gross oder
   * wuerde die Haelfte des Waldes abschneiden.
   */
  function inTerritory(sounder, x, y, extra) {
    if (!sounder.forest) return true;
    return distToBounds(sounder.forest.bounds, x, y) <= sounder.margin + (extra || 0);
  }

  /**
   * Was liegt im Revier? Die Reihenfolge in world.objects ist dieselbe, aus der
   * js/sim/simulation.js seine Ortsnahrungskarte baut - die Nummer hier ist
   * also genau die Nummer dort, und mehr braucht das Tier nicht zu wissen.
   *
   * Wird beim Waldwechsel neu gerechnet: das Revier ist ein anderes, also sind
   * es auch die Nussnester darin.
   */
  function collectSpots(sounder, ctx, spec) {
    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k];
      var source = ctx.world.objects[spec.forage[kind].source] || [];
      var list = [];
      for (var i = 0; i < source.length; i++) {
        if (!inTerritory(sounder, source[i].x, source[i].y)) continue;
        // Was jenseits eines Sees liegt, ist nicht erreichbar - die Rotte
        // stuende sonst die halbe Nacht am Ufer.
        if (ctx.land.regionAt(source[i].x, source[i].y) !== sounder.region) continue;
        list.push(i);
      }
      sounder.spots[kind] = list;
    }
  }

  /**
   * Laeuft die Rotte gerade einem anderen Waldstueck ueber den Weg, zieht sie
   * unter Umstaenden dorthin um. Gefragt wird nur bei der Wahl einer neuen
   * Nahrungsstelle und nur mit kleiner Wahrscheinlichkeit - ein Revier soll
   * ueber die fuenf Tage erkennbar bleiben, aber kein Gefaengnis sein.
   */
  function maybeSwitchForest(sounder, spec, ctx) {
    if (!sounder.forest) return;
    if (!sounder.rng.chance(spec.home.switchChance)) return;

    var regions = ctx.world.terrain.forestRegions;
    for (var i = 0; i < regions.length; i++) {
      if (regions[i] === sounder.forest) continue;
      if (distToBounds(regions[i].bounds, sounder.cx, sounder.cy) > spec.home.switchDistance) continue;
      if (ctx.land.regionAt(regions[i].x, regions[i].y) !== sounder.region) continue;
      sounder.forest = regions[i];
      sounder.forestChanges++;
      collectSpots(sounder, ctx, spec);
      return;
    }
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    A.updateMood(agent, agent.spec, dt);
    var sounder = agent.sounder;
    // Die Rotte entscheidet einmal je Tick, nicht einmal je Tier. Das erste
    // Mitglied traegt diese Rolle; die Reihenfolge liegt seit dem Anlegen fest,
    // also bleibt der Ablauf reproduzierbar.
    if (sounder.members[0] === agent) updateSounder(sounder, agent.spec, ctx, dt);
    memberStep(agent, sounder, ctx, dt);
  }

  /** Die gemeinsamen Entscheidungen: Ziel, Tempo, Beduerfnisse, Tag/Nacht. */
  function updateSounder(sounder, spec, ctx, dt) {
    centroid(sounder);

    sounder.checkTimer -= dt;
    if (sounder.checkTimer <= 0) {
      sounder.checkTimer = CHECK_SECONDS;
      if (checkThreat(sounder, spec, ctx)) return;
    }

    if (sounder.state === S.fliehen) {
      sounder.stateTimer -= dt;
      if (sounder.stateTimer <= 0) beginForage(sounder, spec, ctx);
      return;
    }

    // Der Tag beginnt vor dem Hellwerden: ab sleep.leaveAt zieht die Rotte in
    // den Wald, damit der Weg dorthin noch in die Nacht faellt.
    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (!awake || settling) { sleepSounder(sounder, spec, ctx, dt); return; }

    // Erster Schritt nach dem Aufwachen. Der Platz von heute Morgen ist kein
    // Ziel von heute Abend - gesucht wird jeden Tag ein neuer.
    if (sounder.sleepSpot) {
      sounder.sleepSpot = null;
      sounder.sleepTries = 0;
      beginForage(sounder, spec, ctx);
    }

    /*
     * Durst und Suhlbeduerfnis gehen dem Fressen vor, aber nicht einander: wer
     * schon unterwegs zum Wasser ist, legt sich nicht vorher noch hin.
     *
     * Und sie unterbrechen keine laufende Fressphase, sondern warten auf deren
     * Ende. Das ist derselbe Zusammenstoss zweier Zusagen wie beim Reh
     * (data/tiere.md): mit zwei Trink- und zwei Suhlgaengen in einer Wachzeit
     * von 168 s wird jede Mahlzeit nach gut einer Minute zerschnitten, und dann
     * hilft auch keine laengere Fressphase mehr - gemessen blieb das Wuehlen
     * bei 15 %, egal ob die Phase 40 oder 88 s lang sein durfte. Die Phase
     * dauert ohnehin hoechstens 88 s, das Beduerfnis wartet also nie lange.
     */
    var busy = sounder.goal === 'wasser' || sounder.goal === 'suhle' ||
      sounder.state === S.trinken || sounder.state === S.suhlen ||
      sounder.state === S.wuehlen;

    if (!busy) {
      /*
       * Faellig ist ein Beduerfnis zur vollen Zeit; ist die Gelegenheit aber
       * ohnehin da - Wasser in der Naehe, Boden unter den Fuessen - wird es
       * etwas frueher erledigt, statt spaeter eigens hinzulaufen.
       *
       * Welches zuerst, entscheidet die laengere Wartezeit und nicht die
       * Reihenfolge im Code. Solange der Durst zuerst geprueft wurde, gewann er
       * bei aehnlichen Intervallen *jedes* Mal, und das Suhlen fiel von zwei
       * Gaengen je Nacht auf einen - eine Zusage aus data/tiere.md war damit
       * durch eine Zeilenreihenfolge ausgehebelt.
       */
      var thirst = sounder.nextDrink - ctx.time;
      var itch = sounder.nextWallow - ctx.time;
      var wantsDrink = thirst <= 0 || (thirst <= WL.SimTime.hours(spec.drink.earlyHours) &&
        ctx.world.query.distToWater(sounder.cx, sounder.cy) <= spec.drink.nearby);
      var wantsWallow = itch <= 0 || (itch <= WL.SimTime.hours(spec.wallow.earlyHours) &&
        memberOnGround(sounder, ctx));

      if (wantsDrink && (!wantsWallow || thirst <= itch)) beginDrink(sounder, spec, ctx);
      else if (wantsWallow) beginWallow(sounder, spec, ctx);
    }

    if (sounder.state === S.wuehlen) { rootStep(sounder, spec, ctx, dt); return; }
    if (sounder.state === S.suhlen || sounder.state === S.trinken) {
      sounder.stateTimer -= dt;
      if (sounder.stateTimer <= 0) afterRest(sounder, spec, ctx);
      return;
    }
    travelStep(sounder, spec, ctx, dt);
  }

  function centroid(sounder) {
    var cx = 0, cy = 0;
    var members = sounder.members;
    for (var i = 0; i < members.length; i++) {
      cx += members[i].x;
      cy += members[i].y;
    }
    sounder.cx = cx / members.length;
    sounder.cy = cy / members.length;
  }

  /**
   * Entfernung des naechsten Tieres zu einer Stelle - und *nicht* die des
   * Schwerpunkts.
   *
   * Der Unterschied ist der Unterschied zwischen einer Rotte, die frisst, und
   * einer, die den ganzen Tag laeuft: die Tiere stehen an zufaelligen Plaetzen
   * im Umkreis von 120 u um das Ziel, ihr Schwerpunkt liegt deshalb bei drei
   * bis fuenf Tieren um mehrere Dutzend Units daneben und erreicht den
   * Ankunftsradius unter Umstaenden nie. Gemessen kam die Rotte damit auf 2-6 %
   * Fresszeit und schlief tagsueber nur 5-16 % - sie war permanent unterwegs.
   *
   * "Angekommen ist, wer als Erster da ist" ist zugleich das richtige Bild: das
   * vorderste Tier erreicht die Eichel zuerst, die anderen kommen nach.
   */
  function nearestMemberDist(sounder, x, y) {
    var best = Infinity;
    var members = sounder.members;
    for (var i = 0; i < members.length; i++) {
      var d = Math.hypot(members[i].x - x, members[i].y - y);
      if (d < best) best = d;
    }
    return best;
  }

  // -------------------------------------------------------------- Ziehen

  function beginTravel(sounder, spec, ctx, x, y, speedName) {
    sounder.state = S.gehen;
    sounder.tx = x;
    sounder.ty = y;
    sounder.speed = sounder.rng.rangeIn(spec.speed[speedName]);
    // Das Anmarschtempo ueberlebt den Zustandswechsel: wer beim Trinken oder
    // Schlafen noch hinterherlaeuft, braucht ein Tempo, und "die Rotte trinkt
    // gerade" heisst fuer ihn nicht "geh mit Tempo 0".
    sounder.travelSpeed = sounder.speed;
    // Notbremse: braucht die Rotte deutlich laenger als die Luftlinie hergibt,
    // haengt sie an einer Uferbucht fest und sucht sich etwas anderes.
    var dist = Math.hypot(x - sounder.cx, y - sounder.cy);
    sounder.walkTimer = 14 + dist / Math.max(1, sounder.speed) * 3;
  }

  function travelStep(sounder, spec, ctx, dt) {
    sounder.walkTimer -= dt;

    // Am Wasser wird getrunken, sobald das Ufer erreichbar ist - der Zielpunkt
    // liegt in der Seemitte, dorthin kommt die Rotte nie. Gemessen wird auch
    // hier am vordersten Tier, nicht am Schwerpunkt.
    if (sounder.goal === 'wasser' && atWater(sounder, ctx, spec.drink.reach)) {
      beginDrinking(sounder, spec, ctx);
      return;
    }

    if (nearestMemberDist(sounder, sounder.tx, sounder.ty) <= spec.sounder.goalArrive) {
      arrive(sounder, spec, ctx);
      return;
    }

    if (sounder.walkTimer <= 0) {
      if (sounder.goal === 'wasser') giveUpDrinking(sounder, spec, ctx);
      else if (sounder.goal === 'suhle') giveUpWallow(sounder, spec, ctx);
      else { forgetSpot(sounder, spec, ctx); beginForage(sounder, spec, ctx); }
    }
  }

  /** Steht schon ein Tier der Rotte nah genug am Ufer? */
  function atWater(sounder, ctx, reach) {
    var q = ctx.world.query;
    for (var i = 0; i < sounder.members.length; i++) {
      if (q.distToWater(sounder.members[i].x, sounder.members[i].y) <= reach) return true;
    }
    return false;
  }

  function arrive(sounder, spec, ctx) {
    if (sounder.goal === 'suhle') beginWallowing(sounder, spec, ctx);
    else if (sounder.goal === 'wasser') beginDrinking(sounder, spec, ctx);
    // Auch am Ende eines blossen Streifzugs wird gewuehlt, nicht sofort das
    // naechste Ziel gesucht - sonst besteht eine Nacht ohne erreichbare
    // Nahrungsstelle nur aus Wegen.
    else beginRooting(sounder, spec, ctx);
  }

  /**
   * Ziellos ein Stueck durchs Revier - wenn gerade nichts zu holen ist.
   * Gezogen wird um den Mittelpunkt des Waldstuecks, nicht um die Rotte: sonst
   * entfernte sie sich mit jedem erfolglosen Zug ein Stueck weiter von ihrem
   * Wald, und das Revier waere nach fuenf Tagen keins mehr.
   */
  function beginRoam(sounder, spec, ctx) {
    /*
     * Gezogen wird um die Rotte herum und nur ein Stueck weit, nicht quer durch
     * das Revier: ein Waldstueck ist bis zu 900 u lang, und ein Streifzug ueber
     * diese Strecke kostet eine halbe Nacht. Dass die Rotte dabei nicht
     * abdriftet, besorgt die Reviergrenze, nicht die Zuglaenge.
     */
    var p = null;
    for (var i = 0; i < 14 && !p; i++) {
      var c = ctx.land.pointInRing(sounder.rng, sounder.cx, sounder.cy, 80, 300,
        -1, sounder.region);
      if (c && inTerritory(sounder, c.x, c.y)) p = c;
    }
    // Nichts im Revier erreichbar: dann zurueck in Richtung Wald.
    var home = sounder.forest || { x: sounder.cx, y: sounder.cy };
    sounder.goal = 'streifen';
    sounder.foodKind = null;
    sounder.foodIndex = -1;
    if (!p) p = { x: home.x, y: home.y };
    beginTravel(sounder, spec, ctx, p.x, p.y, 'gehen');
  }

  // ------------------------------------------------------------ Fressen

  /**
   * Nach dem Suhlen und dem Trinken wird gleich an Ort und Stelle
   * weitergewuehlt, sofern dort etwas im Boden ist.
   *
   * Ohne dieses Zugestaendnis kostet jeder Suhl- und jeder Trinkgang zusaetzlich
   * den Rueckweg zur naechsten Nahrungsstelle. Bei zwei von jedem in einer
   * Wachzeit von knapp drei Minuten sind das vier Wege, und aus dem fressenden
   * Tier wird ein wanderndes - gemessen fiel das Wuehlen dadurch von 30 % auf
   * 13 %. Das Reh hat aus demselben Grund seinen kurzen Zug nach dem Trinken
   * (graze.shortLeg), und dort steht in data/tiere.md derselbe Satz.
   *
   * Das Schwein steht nach dem Suhlen ohnehin auf Boden - es muss dafuer also
   * keinen Schritt tun.
   */
  function afterRest(sounder, spec, ctx) {
    // Steht schon das naechste Beduerfnis an, wird keine neue Fressphase
    // begonnen - die haette es wieder um eine ganze Bout verzoegert.
    // beginForage setzt den Zustand auf "gehen", und damit greift es im
    // naechsten Tick.
    if (sounder.nextDrink <= ctx.time || sounder.nextWallow <= ctx.time) {
      beginForage(sounder, spec, ctx);
      return;
    }

    var m = memberOnGround(sounder, ctx);
    if (m && ctx.foodAt(m.x, m.y, 'boden') >= spec.forage.boden.minEdible) {
      sounder.goal = 'futter';
      sounder.foodKind = 'boden';
      sounder.foodIndex = -1;
      sounder.tx = m.x;
      sounder.ty = m.y;
      // Ein Anmarschtempo braucht es trotzdem: die Nachzuegler sind noch
      // unterwegs, und suhlen/trinken kennen kein Tempo.
      sounder.travelSpeed = sounder.rng.rangeIn(spec.speed.gehen);
      beginRooting(sounder, spec, ctx);
      return;
    }
    beginForage(sounder, spec, ctx);
  }

  function beginForage(sounder, spec, ctx) {
    maybeSwitchForest(sounder, spec, ctx);
    var choice = pickSpot(sounder, spec, ctx);
    if (!choice) { beginRoam(sounder, spec, ctx); return; }
    sounder.goal = 'futter';
    sounder.foodKind = choice.kind;
    sounder.foodIndex = choice.index;
    beginTravel(sounder, spec, ctx, choice.x, choice.y, 'gehen');
  }

  /**
   * Die naechste Nahrungsstelle im Revier. Bewertet wird Vorliebe mal Vorrat;
   * die Entfernung zaehlt nur schwach dagegen, sonst bliebe die Rotte am
   * naechstgelegenen Nest kleben und kaeme nie zu den Apfelbaeumen.
   *
   * Der Zufallsanteil ist dieselbe Vorsichtsmassnahme wie beim Waldrand des
   * Rehs: sind alle Vorraete voll, entschiede die Vorliebe sonst *jede* Wahl
   * und aus "am liebsten Nuesse" wuerde "ausschliesslich Nuesse".
   */
  function pickSpot(sounder, spec, ctx) {
    var fc = spec.forageChoice;
    var choice = null;
    var bestScore = -Infinity;
    var dist, score;

    function offer(kind, index, x, y, value, weight) {
      dist = Math.hypot(x - sounder.cx, y - sounder.cy);
      score = value * weight - dist * fc.distanceCost + sounder.rng.range(0, fc.jitter);
      if (score <= bestScore) return;
      bestScore = score;
      choice = choice || {};
      choice.kind = kind;
      choice.index = index;
      choice.x = x;
      choice.y = y;
    }

    for (var k = 0; k < KINDS.length; k++) {
      var kind = KINDS[k];
      var cfg = spec.forage[kind];
      var list = sounder.spots[kind];
      for (var i = 0; i < list.length; i++) {
        var index = list[i];
        if (kind === sounder.skipKind && index === sounder.skipIndex &&
          ctx.time < sounder.skipUntil) continue;
        var p = ctx.foodPoint(kind, index, scratch);
        if (p.value < cfg.minEdible) continue;
        offer(kind, index, p.x, p.y, p.value, cfg.weight);
      }
    }

    /*
     * Bodenflaechen treten als gleichberechtigte Kandidaten an. Sie haben keine
     * Nummer, weil sie keine Weltobjekte sind - gezogen werden deshalb ein paar
     * Stichproben, so wie das Reh seine naechste Grasstelle zieht.
     *
     * Ohne sie waere "auf den Boden gehen und dort wuehlen" gar kein Ziel,
     * sondern hoechstens ein Zufall auf dem Weg zum naechsten Nussnest.
     */
    var ground = spec.forage.boden;
    for (var s = 0; s < fc.groundSamples; s++) {
      var g = ctx.land.pointInRing(sounder.rng, sounder.cx, sounder.cy, 0,
        spec.wallow.searchRadius, T.GROUND, sounder.region);
      if (!g || !inTerritory(sounder, g.x, g.y)) continue;
      var value = ctx.foodAt(g.x, g.y, 'boden');
      if (value < ground.minEdible) continue;
      offer('boden', -1, g.x, g.y, value, ground.weight);
    }

    return choice;
  }

  function beginRooting(sounder, spec, ctx) {
    sounder.state = S.wuehlen;
    sounder.speed = sounder.rng.rangeIn(spec.speed.wuehlen);
    sounder.stateTimer = sounder.rng.rangeIn(spec.forageChoice.bout);
  }

  function rootStep(sounder, spec, ctx, dt) {
    sounder.stateTimer -= dt;
    // Ohne Nahrungsstelle wird trotzdem gewuehlt - das ist der Streifzug, bei
    // dem die Rotte den Waldboden aufbricht, ohne dass etwas darin waere. Ohne
    // diesen Fall bestuende eine Nacht in einem abgefressenen Revier nur noch
    // aus Wandern (gemessen 9 % Wuehlen auf einem solchen Seed).
    if (!sounder.foodKind) {
      if (sounder.stateTimer <= 0) beginForage(sounder, spec, ctx);
      return;
    }
    var cfg = spec.forage[sounder.foodKind];
    // Gefressen wird von den einzelnen Tieren (memberStep) - hier wird nur
    // nachgesehen, ob sich das Bleiben noch lohnt. Auf Boden zaehlt der Wert
    // unter der Rotte, an einem Nussnest der des Nestes.
    var left = sounder.foodIndex < 0
      ? ctx.foodAt(sounder.tx, sounder.ty, sounder.foodKind)
      : ctx.foodPoint(sounder.foodKind, sounder.foodIndex, scratch).value;
    if (sounder.stateTimer <= 0 || left < cfg.minEdible * 0.5) {
      forgetSpot(sounder, spec, ctx);
      beginForage(sounder, spec, ctx);
    }
  }

  /**
   * Die eben leergewuehlte Stelle eine Weile nicht wieder ansteuern. Gemerkt
   * wird nur Ortsnahrung: eine Bodenflaeche hat keine Nummer, und dass die
   * Rotte nicht sofort dorthin zurueckkehrt, besorgt schon der gesunkene
   * Vorrat auf der Karte.
   */
  function forgetSpot(sounder, spec, ctx) {
    if (sounder.foodKind && sounder.foodIndex >= 0) {
      sounder.skipKind = sounder.foodKind;
      sounder.skipIndex = sounder.foodIndex;
      sounder.skipUntil = ctx.time + sounder.rng.rangeIn(spec.forageChoice.cooldown);
    }
    sounder.foodKind = null;
    sounder.foodIndex = -1;
  }

  // ------------------------------------------------------------- Suhlen

  /**
   * Sichtbarer Boden im Revier - die kleinste Flaeche der Karte und das
   * einzige, wofuer der Terraintyp GROUND im ganzen Katalog gebraucht wird.
   * Feste Suhlen gibt es nicht: gesucht wird die Stelle, die gerade in der
   * Naehe liegt.
   */
  function beginWallow(sounder, spec, ctx) {
    // Der Gelegenheitszweig zaehlt am einzelnen Tier, nicht am Schwerpunkt:
    // der kann auf einem Bodenfleck liegen, waehrend jedes Tier daneben im
    // Gras steht - dann suhlte sich die Rotte gemessen zu 0 % auf Boden.
    var here = memberOnGround(sounder, ctx);
    if (here) {
      sounder.tx = here.x;
      sounder.ty = here.y;
      beginWallowing(sounder, spec, ctx);
      return;
    }

    // Zwei Anlaeufe: erst in der Naehe, dann notfalls im weiten Umkreis. Auf
    // manchen Seeds hat ein Waldstueck ringsum schlicht keinen sichtbaren
    // Boden - ohne den zweiten Anlauf suhlte sich die Rotte dort nie.
    var best = searchGround(sounder, spec, ctx, spec.wallow.searchRadius, 160);
    if (!best) best = searchGround(sounder, spec, ctx, spec.wallow.searchRadius * 2, 480);
    // Dritter Anlauf ohne Reviergrenze. Auf manchen Seeds liegt um ein
    // Waldstueck herum gar kein sichtbarer Boden - ohne diesen Ausweg suhlte
    // sich die Rotte dort in fuenf Tagen kein einziges Mal.
    if (!best) best = searchGround(sounder, spec, ctx, spec.wallow.searchRadius * 3, Infinity);

    // Kein Boden in Reichweite: spaeter noch einmal versuchen. Lieber gar nicht
    // suhlen als quer durch die Karte laufen.
    if (!best) { giveUpWallow(sounder, spec, ctx); return; }

    sounder.goal = 'suhle';
    sounder.foodKind = null;
    sounder.foodIndex = -1;
    beginTravel(sounder, spec, ctx, best.x, best.y, 'gehen');
  }

  function searchGround(sounder, spec, ctx, radius, slack) {
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < 16; i++) {
      var p = ctx.land.pointInRing(sounder.rng, sounder.cx, sounder.cy, 0,
        radius, T.GROUND, sounder.region);
      if (!p) continue;
      // Im Revier bleiben, aber mit Luft: sichtbarer Boden ist die kleinste
      // Flaeche der Karte, und ein Waldstueck ganz ohne Boden ringsum bekaeme
      // sonst nie eine Suhle.
      if (!inTerritory(sounder, p.x, p.y, slack)) continue;
      // Nicht irgendein Bodenpunkt, sondern einer mit Boden um sich herum:
      // die Bodenflecken der Karte sind schmal, und eine Stelle an deren Rand
      // liegt schon zur Haelfte im Gras. Vier Proben genuegen, gefragt wird
      // hoechstens zweimal pro Nacht.
      var open = 0;
      for (var k = 0; k < 4; k++) {
        var a = (k / 4) * Math.PI * 2;
        var r = spec.wallow.spread * 1.8;   // breiter proben als die Rotte liegt
        if (ctx.land.terrainAt(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r) === T.GROUND) open++;
      }
      var score = open - Math.hypot(p.x - sounder.cx, p.y - sounder.cy) * 0.010;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /** Steht eines der Tiere gerade auf sichtbarem Boden? */
  function memberOnGround(sounder, ctx) {
    for (var i = 0; i < sounder.members.length; i++) {
      var m = sounder.members[i];
      if (ctx.land.terrainAt(m.x, m.y) === T.GROUND) return m;
    }
    return null;
  }

  function beginWallowing(sounder, spec, ctx) {
    sounder.state = S.suhlen;
    sounder.goal = 'suhle';
    sounder.speed = sounder.rng.rangeIn(spec.speed.suhlen);
    sounder.stateTimer = sounder.rng.rangeIn(spec.wallow.bout);
    sounder.nextWallow = ctx.time +
      WL.SimTime.hours(sounder.rng.rangeIn(spec.wallow.intervalHours));
    for (var i = 0; i < sounder.members.length; i++) sounder.members[i].wallows++;
  }

  function giveUpWallow(sounder, spec, ctx) {
    sounder.nextWallow = ctx.time + WL.SimTime.hours(sounder.rng.range(0.5, 1.5));
    beginForage(sounder, spec, ctx);
  }

  // ------------------------------------------------------------ Trinken

  function beginDrink(sounder, spec, ctx) {
    var bodies = ctx.habitat.bodies;
    if (!bodies.length) {
      sounder.nextDrink = ctx.time + WL.SimTime.hours(4);
      return;
    }
    // Naechstes Gewaesser, gemessen ab seinem Ufer statt ab seiner Mitte -
    // sonst zieht ein grosser See in der Ferne staerker als der Tuempel nebenan.
    var best = bodies[0];
    var bestDist = Infinity;
    for (var i = 0; i < bodies.length; i++) {
      var d = Math.hypot(bodies[i].x - sounder.cx, bodies[i].y - sounder.cy) - bodies[i].radius;
      if (d < bestDist) { bestDist = d; best = bodies[i]; }
    }
    sounder.goal = 'wasser';
    sounder.foodKind = null;
    sounder.foodIndex = -1;
    beginTravel(sounder, spec, ctx, best.x, best.y, 'wandern');
  }

  function beginDrinking(sounder, spec, ctx) {
    sounder.state = S.trinken;
    sounder.goal = 'wasser';
    sounder.speed = 0;
    // Getrunken wird dort, wo die Rotte gerade steht: das Reiseziel lag in der
    // Seemitte, und dorthin darf kein Tier laufen.
    sounder.tx = sounder.cx;
    sounder.ty = sounder.cy;
    sounder.stateTimer = sounder.rng.rangeIn(spec.drink.bout);
    sounder.nextDrink = ctx.time +
      WL.SimTime.hours(sounder.rng.rangeIn(spec.drink.intervalHours));
    for (var i = 0; i < sounder.members.length; i++) sounder.members[i].drinks++;
  }

  /** Kein Ufer erreicht: spaeter noch einmal versuchen, jetzt weiterfressen. */
  function giveUpDrinking(sounder, spec, ctx) {
    sounder.nextDrink = ctx.time + WL.SimTime.hours(sounder.rng.range(1, 3));
    beginForage(sounder, spec, ctx);
  }

  // ---------------------------------------------------------------- Tag

  /**
   * Tagsueber mitten im Wald, nicht am Rand wie das Reh - die Waldtiefe ist der
   * ganze Unterschied zwischen den beiden Schlafplaetzen. Fest ist er nicht:
   * gesucht wird jeden Morgen von dort aus, wo die Rotte gerade steht.
   */
  function sleepSounder(sounder, spec, ctx, dt) {
    if (sounder.state === S.schlafen) return;

    if (!sounder.sleepSpot) {
      var spot = ctx.land.forestNear(sounder.rng, sounder.cx, sounder.cy,
        spec.sleep.searchRadius, sounder.region, spec.sleep.maxDistance,
        spec.sleep.depth[0], spec.sleep.depth[1]);
      // Kein dichter Wald in Reichweite: dann wird eben hier geschlafen -
      // besser, als den halben Tag unterwegs zu sein.
      sounder.sleepSpot = spot || { x: sounder.cx, y: sounder.cy };
      sounder.goal = 'schlaf';
      sounder.foodKind = null;
      sounder.foodIndex = -1;
      beginTravel(sounder, spec, ctx, sounder.sleepSpot.x, sounder.sleepSpot.y, 'wandern');
    }

    sounder.walkTimer -= dt;
    var arrived = nearestMemberDist(sounder, sounder.tx, sounder.ty) <= spec.sounder.goalArrive;
    if (!arrived && sounder.walkTimer > 0) return;

    // Nicht angekommen und die Zeit ist um: die Rotte haengt an einer Bucht
    // oder in einer Sackgasse. Zweimal wird von der neuen Stelle aus neu
    // gesucht, danach wird dort geschlafen, wo sie gerade steht - eine Rotte,
    // die den ganzen Tag laeuft, waere schlimmer als eine, die im Gras liegt.
    if (!arrived && sounder.sleepTries < 2) {
      sounder.sleepTries++;
      sounder.sleepSpot = null;
      return;
    }

    sounder.state = S.schlafen;
    // Das Anmarschtempo bleibt stehen: die Nachzuegler muessen noch ankommen.
    sounder.speed = 0;
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * Groessenklasse 4: geflohen wird erst vor 5, und die gibt es im Kernset
   * nicht. Der Zweig ist ueber den kuenstlichen Stoerer in tools/simtest.js
   * geprueft. Gesucht wird von jedem Mitglied aus - ein Tier am Rand der Rotte
   * stoert die Rotte, nicht nur das Randtier.
   */
  function checkThreat(sounder, spec, ctx) {
    if (sounder.state === S.fliehen) return false;

    var threat = null;
    for (var i = 0; i < sounder.members.length; i++) {
      var m = sounder.members[i];
      threat = ctx.nearestDisturber(m, spec.reaction.fleeRadius * m.traits.shyness,
        spec.reaction.ignore);
      if (threat) break;
    }
    if (!threat || !threat.spec || threat.spec.size < spec.reaction.fleeFromSize) return false;

    var angle = Math.atan2(sounder.cy - threat.y, sounder.cx - threat.x);
    sounder.state = S.fliehen;
    sounder.goal = 'flucht';
    sounder.sleepSpot = null;      // aufgeschreckt wird der Platz neu gesucht
    sounder.foodKind = null;
    sounder.foodIndex = -1;
    sounder.speed = sounder.rng.rangeIn(spec.speed.fliehen);
    sounder.stateTimer = sounder.rng.rangeIn(spec.reaction.fleeSeconds);
    sounder.tx = sounder.cx + Math.cos(angle) * FLEE_DISTANCE;
    sounder.ty = sounder.cy + Math.sin(angle) * FLEE_DISTANCE;
    return true;
  }

  // -------------------------------------------------------- Das einzelne Tier

  /**
   * Ein Tier, ein Tick. Es hat keine eigenen Entscheidungen zu treffen ausser
   * einer: ob es gerade stehenbleibt. Alles andere ist "geh auf deinen Platz
   * und mach mit, was die Rotte macht".
   */
  function memberStep(agent, sounder, ctx, dt) {
    var spec = agent.spec;
    var sc = spec.sounder;

    // Der eigene Platz im Verband wird immer wieder neu ausgewuerfelt. Bliebe
    // er fest, zoege die Rotte ihre Anordnung mit sich herum - ein starrer
    // Versatz ist derselbe Fehler wie ein starres Ziel.
    //
    // Gewuerfelt wird nur, solange sich die Rotte ueberhaupt bewegt. Beim
    // Wuehlen gehoert das dazu (das ist das langsame Weiterwuehlen durch das
    // Nest), beim Suhlen, Trinken und Schlafen nicht: ein liegendes Tier stuende
    // sonst alle paar Sekunden wieder auf.
    var rooting = sounder.state === S.wuehlen;
    var mobile = rooting || sounder.state === S.gehen || sounder.state === S.fliehen;
    if (mobile) {
      agent.offTimer -= dt;
      if (agent.offTimer <= 0) {
        // Beim Wuehlen wechselt der Platz schneller: die Rotte arbeitet sich
        // durch das Nest, sie steht nicht darin.
        agent.offTimer = agent.rng.rangeIn(rooting ? spec.forageChoice.rootSeconds
          : sc.offsetSeconds);
        agent.offAngle = agent.rng.range(0, Math.PI * 2);
        agent.offDist = Math.sqrt(agent.rng.next());
      }
    }

    var spread = spreadFor(sounder, spec);
    agent.tx = sounder.tx + Math.cos(agent.offAngle) * agent.offDist * spread;
    agent.ty = sounder.ty + Math.sin(agent.offAngle) * agent.offDist * spread;
    // Der Mindestabstand kann nie groesser sein als der Umkreis, in dem die
    // Tiere ueberhaupt stehen sollen. Ohne diese Deckelung schoeben sich die
    // Tiere aus der 22 u kleinen Suhle heraus ins Gras daneben - gemessen
    // suhlten sie sich dann nur noch zu einem Viertel auf Boden. In der Suhle
    // und im Schlaf liegt eine Rotte eben dicht.
    keepGap(agent, sounder, Math.min(sc.minGap, spread * 0.9));

    // Stehenbleiben laeuft ab, egal was die Rotte gerade tut.
    if (agent.state === S.sichern) {
      agent.stateTimer -= dt;
      if (agent.stateTimer > 0) return;
    }

    var toGroup = Math.hypot(sounder.cx - agent.x, sounder.cy - agent.y);
    var fleeing = sounder.state === S.fliehen;

    // Abgehaengt: nicht mehr auf den eigenen Platz zu, sondern auf die Gruppe,
    // und mit eigenem Tempo. Liefe der Nachzuegler genauso schnell wie die
    // anderen, bliebe er fuer immer Nachzuegler. Auf der Flucht gilt das
    // nicht - da rennen alle vom Stoerer weg, nicht zueinander hin.
    if (toGroup > sc.catchUp && !fleeing) {
      if (!agent.catching) {
        agent.catching = true;
        agent.catchSpeed = A.drawSpeed(agent, spec, 'aufschliessen');
      }
      agent.tx = sounder.cx;
      agent.ty = sounder.cy;
      agent.state = S.gehen;
      agent.speedBase = agent.catchSpeed;
      stepTowards(agent, ctx, dt, TURN);
      return;
    }
    agent.catching = false;

    // Die eigene Uhr fuers Troedeln. Sie laeuft nur, solange die Rotte zieht:
    // wer schon frisst, bleibt nicht zusaetzlich stehen.
    if (sounder.state === S.gehen && !fleeing) {
      agent.lagTimer -= dt;
      if (agent.lagTimer <= 0) {
        agent.lagTimer = agent.rng.rangeIn(sc.lagInterval) * agent.traits.needs;
        agent.state = S.sichern;
        agent.speedBase = 0;
        agent.stateTimer = agent.rng.rangeIn(sc.lagSeconds);
        return;
      }
    }

    var dist = Math.hypot(agent.tx - agent.x, agent.ty - agent.y);
    var busy = sounder.state !== S.gehen && sounder.state !== S.fliehen;
    var near = dist <= sc.regroup;

    /*
     * Welchen Zustand zeigt das Tier?
     *
     * Beim Wuehlen nicht "es bewegt sich, also geht es": ein wuehlendes
     * Wildschwein schiebt sich staendig zur naechsten Stelle weiter, und wer
     * das als Gehen zaehlt, misst am Ende 3 % Fresszeit bei einem Tier, dessen
     * Hauptbeschaeftigung das Fressen sein soll.
     *
     * Beim Suhlen, Trinken und Schlafen gilt das *nicht*: dort wechselt der
     * Platz nicht mehr, der Anmarsch ist also einmalig, und ein Tier, das noch
     * durchs Gras zur Suhle laeuft, soll nicht als suhlend gezaehlt werden -
     * sonst steht in der Messung "suhlt sich", waehrend es gar nicht auf Boden
     * ist.
     */
    if (rooting && near) agent.state = S.wuehlen;
    else if (busy && dist <= sc.arrive) agent.state = sounder.state;
    else agent.state = fleeing ? S.fliehen : S.gehen;

    if (dist > sc.arrive) {
      // Zwei Tempi, und welches gilt, entscheidet die Entfernung. Nebenan wird
      // im Tempo der Taetigkeit weitergeschoben. Weiter weg gilt das
      // Anmarschtempo, sonst kroeche ein Nachzuegler mit Suhltempo hinterher
      // und ein Tier, dessen Rotte gerade trinkt, stuende mit Tempo 0 fest.
      var slow = busy && near && sounder.speed > 0.5;
      agent.speedBase = fleeing ? sounder.speed
        : (slow ? sounder.speed : sounder.travelSpeed);
      stepTowards(agent, ctx, dt, fleeing ? FLEE_TURN : TURN);
    } else {
      agent.speedBase = 0;
      // Steht es still, bewegt sich nur der Kopf - und den zeichnet niemand.
      // Ein bisschen Drehen haelt die Blickrichtung lebendig.
      var wobble = sounder.state === S.schlafen ? 0.06 : 0.12;
      agent.heading += Math.sin(ctx.time * 0.6 + agent.index) * wobble * dt;
    }

    if (agent.state === S.wuehlen) rootHere(agent, sounder, ctx, dt);
  }

  /**
   * Mindestabstand innerhalb der Rotte: kommt ein Tier einem anderen naeher als
   * minGap, wandert sein Zielpunkt von diesem weg.
   *
   * Ohne das haengt der Abstand allein am Umkreis, und der ist die falsche
   * Schraube: fuenf Tiere in einem Kreis stehen enger als drei, also waere der
   * gemessene Abstand von der Rottengroesse abhaengig statt von der Zusage.
   * Gemessen lagen grosse Rotten bei 29 u und damit fast auf dem Schwarmabstand
   * des Barsches (24 u) - der Unterschied zwischen "Schwarm" und "lose Gruppe"
   * waere im Merkmalsvektor verschwunden. Ein Umkreis, der gross genug fuer
   * fuenf Tiere ist, streute drei dagegen ueber das halbe Nussnest.
   *
   * Das ist dieselbe Idee wie die Abstossung im Barschschwarm, nur eine Ebene
   * hoeher: dort eine Kraft auf die Geschwindigkeit, hier eine Verschiebung des
   * Ziels. Die Rotte hat keine Traegheit, also braucht sie auch keine Kraft.
   */
  function keepGap(agent, sounder, minGap) {
    var members = sounder.members;
    for (var i = 0; i < members.length; i++) {
      var other = members[i];
      if (other === agent) continue;
      var dx = agent.tx - other.x;
      var dy = agent.ty - other.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d >= minGap) continue;
      if (d < 0.001) {
        // Exakt uebereinander: irgendeine Richtung, Hauptsache auseinander.
        dx = Math.cos(agent.heading);
        dy = Math.sin(agent.heading);
        d = 1;
      }
      agent.tx = other.x + dx / d * minGap;
      agent.ty = other.y + dy / d * minGap;
    }
  }

  /**
   * Was frisst dieses Tier gerade?
   *
   * An einem Nussnest haengt der Vorrat an *einem* Punkt - dort frisst also nur,
   * wer nah genug davorsteht. Fuer alle anderen waere die Fressphase sonst eine
   * Standphase: ein Tier wuehlt, vier sehen zu. Deshalb wuehlt jedes Tier, das
   * nicht am Nest steht, im Boden unter sich. Das geht nur dort, wo sichtbarer
   * Boden ist - ctx.eatAt prueft das selbst und tut sonst nichts.
   *
   * Beides sind getrennte Karten, es wird also nichts doppelt gefressen.
   */
  function rootHere(agent, sounder, ctx, dt) {
    var spec = agent.spec;
    var kind = sounder.foodKind;

    if (kind && sounder.foodIndex >= 0) {
      var p = ctx.foodPoint(kind, sounder.foodIndex, scratch);
      var reach = spec.forageChoice.pointReach;
      if ((p.x - agent.x) * (p.x - agent.x) + (p.y - agent.y) * (p.y - agent.y) <= reach * reach) {
        // Jedes Tier frisst fuer sich. Genau deshalb ist ein Nussnest bei fuenf
        // Wildschweinen fuenfmal so schnell leer wie bei einem Reh.
        ctx.eatPoint(kind, sounder.foodIndex,
          spec.forage[kind].eatPerSecond * agent.traits.needs * dt);
        return;
      }
    }

    ctx.eatAt(agent.x, agent.y,
      spec.forage.boden.eatPerSecond * agent.traits.needs * dt, 'boden');
  }

  /**
   * Wie weit steht die Rotte auseinander? Beim Ziehen lose, an einer
   * Nahrungsstelle enger, im Schlaf am engsten - "eng beieinander" ist eine
   * Zusage aus data/tiere.md und keine Nebensache.
   */
  function spreadFor(sounder, spec) {
    if (sounder.state === S.schlafen) return spec.sleep.spread;
    // Eine Suhle ist eine Pfuetze, kein Gelaende: streuten die Tiere dort so
    // weit wie an einem Nussnest, laege die Haelfte davon neben dem Boden im
    // Gras - und die Zusage "suhlt sich auf Boden" waere nur die halbe Wahrheit.
    if (sounder.state === S.suhlen) return spec.wallow.spread;
    if (sounder.state === S.gehen || sounder.state === S.fliehen) return spec.sounder.spread;
    return spec.sounder.tightSpread;
  }

  /**
   * Ein Schritt auf den eigenen Zielpunkt zu. Der Ausweichfaecher in
   * js/sim/agents.js reicht nur ueber gut +/- 109 Grad - er kann einen Kurs am
   * Ufer entlanglenken, aber nicht zuruecknehmen. Ohne das ausdrueckliche
   * Umdrehen bliebe ein Tier in einer Sackgasse zwischen Kartenrand und Ufer
   * bis zum Ende der Aufzeichnung stehen.
   */
  function stepTowards(agent, ctx, dt, turnRate) {
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), turnRate, 2);
    if (result === 'blocked') {
      agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
      // Neuer Platz im Verband: der alte lag offenbar hinter dem Hindernis.
      agent.offTimer = 0;
    }
  }

  WL.Brains.wildschwein = {
    spawn: spawn,
    update: update
  };
})(typeof window !== 'undefined' ? window : globalThis);
