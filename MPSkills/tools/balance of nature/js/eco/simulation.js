/**
 * Die Simulation: Zustand und Ablauf.
 *
 * Pro Tick:   jede Gruppe entscheidet (eco/behavior.js), die Tiere folgen ihrer
 *             Gruppe, fressen, verbrauchen Energie, werden durstig.
 * Pro Tag:    Pflanzen wachsen, Alter, Geburten, Nester und Horste, Abwanderung,
 *             Teilen und Zusammenlegen von Gruppen, Statistik.
 *
 * Deterministisch: aller Zufall kommt aus einem RNG, der aus dem Seed der
 * Welt abgeleitet ist. Gleicher Seed + gleiche Startwerte = gleicher Verlauf,
 * egal wie schnell gerechnet oder gezeichnet wird.
 *
 * Todesursachen werden festgehalten: hunger, durst, alter, oder die id der Art,
 * die das Tier gerissen hat.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var T = BT.Time;

  function Simulation(world, options) {
    var opts = options || {};
    this.world = world;
    this.fields = new BT.Fields(world);
    this.landuse = new BT.Landuse(this);
    this.fields.ground = this.landuse.ground;
    this.rng = new BT.Rng(world.seed).fork('sim' + (opts.variant || ''));
    this.ticksPerDay = T.TICKS_PER_DAY;
    this.tick = 0;
    this.day = 0;
    this.calendar = T.calendar(0);
    this.weather = new BT.Weather(world.seed);
    this.weatherNow = this.weather.year(0);
    this.groups = [];
    this.carcasses = [];            // Aas: { x, y, meat, day }
    this.herbivoreGroups = [];
    this.predatorGroups = [];
    this.nextId = 1;
    this.startCounts = {};
    var defaults = Simulation.defaultStart(world);
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var id = BT.SPECIES_ORDER[k];
      this.startCounts[id] = opts.start && opts.start[id] != null ? opts.start[id] : defaults[id];
    }
    this.humans = new BT.Humans(this);
    this.rats = new BT.Rats(this);  // Ratten als Feld, erst mit der Karte "Ratten an Bord" (eco/rats.js)
    this.events = [];               // gespielte Karten: { day, tick, card, params, at, undo }
    this.cardPause = opts.cardPause != null ? opts.cardPause : BT.Time.years(BT.CARD_RULES.pauseYears);
    this.pending = [];              // gespielt, wird beim naechsten Tick ausgefuehrt
    this.stats = new BT.Stats(this);
    this.populate();
    this.stats.record();
  }

  // ------------------------------------------------------------ Tiere und Gruppen

  Simulation.prototype.makeAnimal = function (spec, x, y, age, sex, energy) {
    return {
      id: this.nextId++,
      spec: spec,
      sex: sex,
      age: age,
      energy: energy,
      thirst: this.rng.range(0, 0.3),
      x: x, y: y, px: x, py: y,
      heading: this.rng.range(0, Math.PI * 2),
      ox: 0, oy: 0,
      group: null,
      alive: true
    };
  };

  Simulation.prototype.makeGroup = function (spec, x, y) {
    var g = {
      id: this.nextId++,
      spec: spec,
      members: [],
      x: x, y: y,
      heading: 0,
      state: spec.role === 'predator' ? 'streifen' : 'fressen',
      stateTicks: 0,
      tx: null, ty: null,
      home: null,
      prey: null,
      cooldown: 0,
      nest: null,
      horst: null,                  // Greifvoegel: { x, y, phase: 'brut'|'nestlinge', eggs, day, sitter }
      horstSite: null,              // Horst wird jedes Jahr wieder benutzt
      carry: 0,                     // Beute auf dem Weg zum Horst
      speedNow: 0,
      grazing: false
    };
    this.groups.push(g);
    (spec.role === 'predator' ? this.predatorGroups : this.herbivoreGroups).push(g);
    return g;
  };

  Simulation.prototype.addToGroup = function (g, a) {
    a.group = g;
    var u = Math.sqrt(this.rng.next());
    var ang = this.rng.range(0, Math.PI * 2);
    if (g.spec.group.spacing) {
      // Grosse Herden (spec.group.spacing): Versatz relativ zum Radius der Herde,
      // der mit der Zahl der Tiere waechst (spreadOf)
      a.nx = BT.M.cos(ang) * u; a.ny = BT.M.sin(ang) * u;
      var R = spreadOf(g.spec, g.members.length + 1);
      a.ox = a.nx * R; a.oy = a.ny * R;
    } else {
      var r = g.spec.group.spread * u;
      a.ox = BT.M.cos(ang) * r; a.oy = BT.M.sin(ang) * r;
    }
    g.members.push(a);
  };

  /**
   * Radius einer Gruppe: spec.group.spread, bei grossen Herden mit
   * spec.group.spacing so viel, dass jedes Tier etwa diesen Abstand hat.
   */
  function spreadOf(spec, n) {
    var G = spec.group;
    return G.spacing ? Math.max(G.spread, G.spacing * Math.sqrt(n)) : G.spread;
  }

  /** Tiere der Gruppe g schliessen sich der Gruppe other an, so viele dort Platz haben. */
  Simulation.prototype.joinGroup = function (g, other) {
    var room = other.spec.group.max - other.members.length;
    var moving = g.members.slice(0, Math.max(0, room));
    for (var k = 0; k < moving.length; k++) { this.removeFromGroup(moving[k]); this.addToGroup(other, moving[k]); }
    return moving.length;
  };

  Simulation.prototype.removeFromGroup = function (a) {
    var g = a.group;
    if (!g) return;
    var i = g.members.indexOf(a);
    if (i >= 0) g.members.splice(i, 1);
    a.group = null;
  };

  Simulation.prototype.kill = function (a, cause) {
    if (!a.alive) return;
    a.alive = false;
    this.removeFromGroup(a);
    this.stats.death(a.spec.id, cause);
    // Wer verhungert, verdurstet oder an Altersschwaeche stirbt, bleibt als Aas liegen
    if (cause === 'hunger' || cause === 'durst' || cause === 'alter') {
      this.addCarcass(a.x, a.y, a.spec.meat * (a.age < a.spec.maturity ? 0.4 : 0.7));
    }
  };

  Simulation.prototype.addCarcass = function (x, y, meat) {
    if (meat < 0.05) return null;
    var c = { x: x, y: y, meat: meat, day: this.day };
    this.carcasses.push(c);
    return c;
  };

  /** Beute unter den Gruppenmitgliedern aufteilen, die Hungrigsten zuerst. */
  /** Liefert, was uebrig bleibt (wird zu Aas). */
  Simulation.prototype.feed = function (g, energy) {
    var ms = g.members.slice().sort(function (a, b) { return a.energy - b.energy; });
    var share = energy / Math.max(1, ms.length);
    var rest = energy;
    for (var pass = 0; pass < 2 && rest > 0.001; pass++) {
      for (var i = 0; i < ms.length && rest > 0.001; i++) {
        var take = Math.min(1 - ms[i].energy, pass === 0 ? share : rest);
        if (take <= 0) continue;
        ms[i].energy += take;
        ms[i].thirst = Math.max(0, ms[i].thirst - take * 0.5);   // Fleisch enthaelt Wasser
        rest -= take;
      }
    }
    return rest;
  };

  // ------------------------------------------------------------ Start

  Simulation.prototype.randomHabitatPoint = function (spec, minPref) {
    var w = this.world;
    for (var t = 0; t < 400; t++) {
      var x = this.rng.range(0, w.width), y = this.rng.range(0, w.height);
      var b = this.biomeAt(x, y);
      if (BT.isBlocked(b, null)) continue;
      if (spec.habitat[b] >= (minPref || 0.7)) return { x: x, y: y };
    }
    return null;
  };

  Simulation.prototype.homeIsFree = function (spec, x, y) {
    for (var i = 0; i < this.predatorGroups.length; i++) {
      var o = this.predatorGroups[i];
      if (!BT.claims(o.spec, spec) || !o.home || !o.members.length) continue;
      if (BT.M.hypot(o.home.x - x, o.home.y - y) < spec.territory * (spec.spacing || 1.1)) return false;
    }
    return true;
  };

  Simulation.prototype.populate = function () {
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var spec = BT.SPECIES[BT.SPECIES_ORDER[k]];
      var left = this.startCounts[spec.id];
      var guard = 0;
      while (left > 0 && guard++ < 500) {
        var p = null;
        for (var t = 0; t < 40; t++) {
          var cand = this.randomHabitatPoint(spec, 0.7);
          if (!cand) break;
          if (spec.role !== 'predator' || this.homeIsFree(spec, cand.x, cand.y) || t > 30) { p = cand; break; }
        }
        if (!p) break;
        var size = Math.min(left, this.rng.intIn(spec.group.start));
        var g = this.makeGroup(spec, p.x, p.y);
        if (spec.role === 'predator') g.home = { x: p.x, y: p.y };
        for (var i = 0; i < size; i++) {
          // ueberwiegend Erwachsene, ausgeglichene Geschlechter
          var adult = i < 2 || this.rng.chance(0.75);
          var age = adult ? this.rng.range(spec.maturity, spec.maxAge * 0.6) : this.rng.range(0, spec.maturity);
          var sex = i % 2 === 0 ? 'f' : 'm';
          var a = this.makeAnimal(spec, p.x, p.y, Math.round(age), sex, this.rng.range(0.7, 0.95));
          this.addToGroup(g, a);
          a.x = p.x + a.ox; a.y = p.y + a.oy; a.px = a.x; a.py = a.y;
        }
        left -= size;
      }
    }
  };

  /** Lebensraum an einem Punkt, mit der Nutzung durch den Menschen (eco/landuse.js). */
  Simulation.prototype.biomeAt = function (x, y) { return this.landuse.biomeAt(x, y); };

  // ------------------------------------------------------------ Karten (Menschen)

  /**
   * Tag der zuletzt gespielten Karte (auch wartende), sonst null. Meldungen,
   * Folgekarten und zurueckgenommene Karten zaehlen nicht.
   */
  Simulation.prototype.lastCardDay = function () {
    for (var i = 0; i < this.pending.length; i++) if (!this.pending[i].undo) return this.day;
    for (i = this.events.length - 1; i >= 0; i--) {
      var k = BT.CARDS[this.events[i].card].kind;
      if (!this.events[i].undo && (k === 'start' || k === 'aktiv')) return this.events[i].day;
    }
    return null;
  };

  /** Ab diesem Tag darf die naechste aktive Karte gespielt werden. */
  Simulation.prototype.nextCardDay = function () {
    var last = this.lastCardDay();
    return last == null ? 0 : last + this.cardPause;
  };

  /** Wie oft wurde diese Karte schon gespielt (einschliesslich wartender, ohne Zuruecknahmen)? */
  Simulation.prototype.played = function (id) {
    var n = 0, i;
    for (i = 0; i < this.events.length; i++) if (this.events[i].card === id && !this.events[i].undo) n++;
    for (i = 0; i < this.pending.length; i++) if (this.pending[i].card === id && !this.pending[i].undo) n++;
    return n;
  };

  /** Wie oft wirkt die Karte gerade (gespielt minus zurueckgenommen, wartende mitgezaehlt)? */
  Simulation.prototype.cardCount = function (id) {
    var n = this.humans.count(id);
    for (var i = 0; i < this.pending.length; i++) if (this.pending[i].card === id) n += this.pending[i].undo ? -1 : 1;
    return Math.max(0, n);
  };

  /** Darf die Karte jetzt gespielt werden? Fehlertext oder null. */
  Simulation.prototype.cardBlocked = function (id) {
    var c = BT.CARDS[id];
    if (!c) return 'Unbekannte Karte';
    if (c.soon) return 'Kommt bald';
    if (c.needs === 'landung' && !this.humans.villages.length) {
      return this.cardCount('landung') ? 'Das Schiff ist noch nicht angekommen' : 'Erst „' + BT.CARDS.landung.name + '“ spielen';
    }
    if (!c.repeat && this.played(id)) return 'Schon gespielt';
    if ((c.kind === 'aktiv' || c.kind === 'start') && this.day < this.nextCardDay()) return 'Nächste Karte ' + BT.Time.label(this.nextCardDay()).replace(' · ', ', ');
    return null;
  };

  /** Darf die Karte jetzt zurueckgenommen werden? Fehlertext oder null. Fuer die Pause zaehlt das nicht. */
  Simulation.prototype.undoBlocked = function (id) {
    var c = BT.CARDS[id];
    if (!c || c.soon || (c.kind !== 'start' && c.kind !== 'aktiv')) return 'Lässt sich nicht zurücknehmen';
    if (c.fixed) return c.fixed;
    for (var i = 0; i < this.pending.length; i++) if (this.pending[i].card === id) return 'Moment, die Karte wird gerade ausgeführt';
    if (!this.humans.villagesWith(id).length) {
      return id === 'landung' && this.cardCount('landung') ? 'Das Schiff ist noch nicht angekommen' : 'Nichts zurückzunehmen';
    }
    return null;
  };

  /**
   * Muss man fuer die Karte auf die Insel klicken? 'kueste' (Landung), 'dorf'
   * (es gibt mehrere Doerfer, welches ist gemeint?) oder null.
   */
  Simulation.prototype.cardTarget = function (id, undo) {
    var c = BT.CARDS[id];
    if (undo) return this.humans.villagesWith(id).length > 1 ? 'dorf' : null;
    if (c.target) return c.target;
    return c.needs === 'landung' && this.humans.villages.length > 1 ? 'dorf' : null;
  };

  /**
   * Karte spielen. Ausgefuehrt wird beim naechsten Tick (oder bei params.tick),
   * damit der Verlauf nicht davon abhaengt, wann im Bild geklickt wurde.
   * params.x/y: Ort (Kueste bei der Landung, sonst das Dorf, fuer das die Karte gilt).
   * Liefert null oder einen Fehlertext.
   */
  Simulation.prototype.play = function (id, params) {
    var err = this.cardBlocked(id);
    if (!err && id === 'landung') err = this.humans.checkLanding(params);
    if (err) return err;
    var p = params || {};
    this.pending.push({ card: id, params: p, tick: p.tick != null ? p.tick : this.tick });
    return null;
  };

  /**
   * Karte zuruecknehmen (die zuletzt gespielte dieser Sorte; params.x/y waehlt
   * das Dorf). Die Folgen bleiben, siehe eco/humans.js remove. Wie play.
   */
  Simulation.prototype.unplay = function (id, params) {
    var err = this.undoBlocked(id);
    if (err) return err;
    var p = params || {};
    this.pending.push({ card: id, params: p, tick: p.tick != null ? p.tick : this.tick, undo: true });
    return null;
  };

  Simulation.prototype.applyPending = function () {
    for (var i = 0; i < this.pending.length; i++) {
      var ev = this.pending[i];
      if (ev.tick > this.tick) continue;
      this.pending.splice(i--, 1);
      if (ev.undo) {
        this.events.push({ day: this.day, tick: this.tick, card: ev.card, params: ev.params, undo: true, at: this.humans.remove(ev.card, ev.params) });
        continue;
      }
      var at = this.humans.apply(ev.card, ev.params);
      this.events.push({ day: this.day, tick: this.tick, card: ev.card, params: ev.params, at: at });
    }
  };

  // ------------------------------------------------------------ Ablauf

  Simulation.prototype.step = function () {
    if (this.pending.length) this.applyPending();
    this.humans.step();
    var groups = this.groups;
    var winter = this.calendar.season === 3;
    var perTick = 1 / this.ticksPerDay;

    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!g.members.length) continue;
      g.grazing = false;
      if (g.spec.role === 'predator') BT.Behavior.predator(this, g);
      else BT.Behavior.herbivore(this, g);
    }

    for (i = 0; i < groups.length; i++) {
      g = groups[i];
      if (!g.members.length) continue;
      this.moveMembers(g);
      var spec = g.spec;
      // Wer am Wasser vorbeikommt, trinkt
      var drinks = spec.thirstDays && BT.Move.atWater(this.world, g.x, g.y, this.humans.waterDist);
      var onThermal = this.biomeAt(g.x, g.y) === BT.BIOME.THERMAL;
      var cost = (spec.costPerDay + (winter ? spec.winterCost * this.weatherNow.winter * (onThermal ? 0.3 : 1) : 0)) * perTick;
      var thirst = spec.thirstDays ? perTick / spec.thirstDays : 0;
      var bite = spec.dietSeason ? spec.bite * spec.dietSeason[this.calendar.season] : spec.bite;
      // Rueckwaerts, weil Tiere dabei sterben koennen
      for (var m = g.members.length - 1; m >= 0; m--) {
        var a = g.members[m];
        if (g.grazing && a.energy < 0.98) {
          var gain = this.fields.eat(this.fields.index(a.x, a.y), spec.diet, bite);
          a.energy = Math.min(1, a.energy + gain);
          a.thirst = Math.max(0, a.thirst - this.fields.lastWater);
        }
        a.energy -= a.chick ? cost + spec.horst.chickCost * perTick : cost;
        a.thirst = drinks ? 0 : a.thirst + thirst;
        if (a.energy <= 0) this.kill(a, 'hunger');
        else if (a.thirst >= 1) this.kill(a, 'durst');
      }
    }

    this.tick++;
    if (this.tick % this.ticksPerDay === 0) this.newDay();
  };

  /** Die Tiere folgen dem Anker ihrer Gruppe, jedes mit eigenem, langsam wanderndem Versatz. */
  Simulation.prototype.moveMembers = function (g) {
    var spread = spreadOf(g.spec, g.members.length) * (g.state === 'fliehen' || g.state === 'jagen' ? 0.6 : g.state === 'aas' ? 0.4 : 1);
    var spaced = !!g.spec.group.spacing;
    // Am Aas laufen die Nachzuegler zuegig zum Kadaver
    var maxStep = Math.max(g.speedNow * 1.4, g.spec.speed * (g.state === 'aas' ? 1 : 0.6));
    var H = this.humans;
    for (var i = 0; i < g.members.length; i++) {
      var a = g.members[i];
      a.px = a.x; a.py = a.y;
      if (spaced) {
        // Versatz relativ zum Radius: waechst die Herde, ruecken die Tiere auseinander
        a.nx += this.rng.range(-2, 2) / spread; a.ny += this.rng.range(-2, 2) / spread;
        var rn = BT.M.hypot(a.nx, a.ny);
        if (rn > 1) { a.nx /= rn; a.ny /= rn; }
        a.ox = a.nx * spread; a.oy = a.ny * spread;
      } else {
        a.ox += this.rng.range(-2, 2); a.oy += this.rng.range(-2, 2);
        var r = BT.M.hypot(a.ox, a.oy);
        if (r > spread) { a.ox *= spread / r; a.oy *= spread / r; }
      }
      // Ruhende Tiere bleiben liegen, wo sie sind
      if (g.state === 'ruhen') continue;
      var tx = g.x + a.ox, ty = g.y + a.oy;
      // Brutvogel und Kueken bleiben im Horst
      if (g.horst && BT.Behavior.inHorst(g, a)) { tx = g.horst.x + a.ox * 0.25; ty = g.horst.y + a.oy * 0.25; }
      // Weidezaun: nur Huetehunde und jagende Raeuber gehen hinein
      var fence = H.fence ? H.barrier(g, a.x, a.y) : null;
      if (BT.Move.blockedAt(this.world, g.spec, tx, ty) || (fence && fence(tx, ty))) { tx = g.x; ty = g.y; }
      var dx = tx - a.x, dy = ty - a.y, d = BT.M.hypot(dx, dy);
      if (d > 0.01) {
        var s = Math.min(maxStep, d);
        var nx = a.x + dx / d * s, ny = a.y + dy / d * s;
        if (fence && fence(nx, ny)) continue;
        if (!BT.Move.blockedAt(this.world, g.spec, nx, ny)) { a.x = nx; a.y = ny; }
        else { a.x = g.x; a.y = g.y; }
        if (s > 0.3) a.heading = BT.M.atan2(dy, dx);
      }
    }
  };

  Simulation.prototype.newDay = function () {
    this.day++;
    this.calendar = T.calendar(this.day);
    var cal = this.calendar;
    this.weatherNow = this.weather.year(cal.year - 1);
    this.landuse.newDay();
    this.fields.grow(cal.season, this.weatherNow);
    this.humans.newDay();
    // Aas verwest
    for (var c = this.carcasses.length - 1; c >= 0; c--) {
      var cc = this.carcasses[c];
      cc.meat -= 0.12;
      if (cc.meat <= 0 || this.day - cc.day > 10) this.carcasses.splice(c, 1);
    }

    // Reihenfolge der Gruppen einmal am Tag mischen - sonst haetten immer
    // dieselben Gruppen den ersten Zugriff aufs Futter
    shuffle(this.groups, this.rng);
    this.disease();
    this.scraps();
    this.rats.newDay();

    var groups = this.groups.slice();
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!g.members.length) continue;
      this.ageGroup(g);
      if (!g.members.length) continue;
      this.breed(g, cal);
      this.hatch(g);
      this.tendHorst(g);
      this.leaveParents(g);
      this.disperse(g, cal);
    }
    this.reorganize();
    this.cleanup();
    this.stats.record();
  };

  /**
   * Krankheiten, einmal am Tag (spec.disease der Traegerart, z. B. Staupe der
   * Hunde): Anstecken in der Naehe der Traeger und im eigenen Rudel, Kranke
   * verlieren Energie, sterben oder werden gesund und immun. Ohne Traeger und
   * ohne Kranke wird kein Zufall verbraucht - der Verlauf bleibt wie ohne Krankheit.
   */
  Simulation.prototype.disease = function () {
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var D = BT.SPECIES[BT.SPECIES_ORDER[k]], dis = D.disease;
      if (!dis) continue;
      var carriers = this.groups.filter(function (g) { return g.spec === D && g.members.length; });
      for (var i = 0; i < this.groups.length; i++) {
        var g = this.groups[i];
        if (!g.members.length || dis.victims.indexOf(g.spec.id) < 0) continue;
        var near = false, sick = 0, m, a;
        for (var c = 0; c < carriers.length && !near; c++) near = BT.M.hypot(carriers[c].x - g.x, carriers[c].y - g.y) < dis.radius;
        for (m = 0; m < g.members.length; m++) if (g.members[m].sick) sick++;
        if (!near && !sick) continue;
        var p = 1 - (1 - (near ? dis.chance : 0)) * BT.M.pow(1 - dis.spread, sick);
        var newly = 0;
        for (m = 0; m < g.members.length; m++) {
          a = g.members[m];
          if (a.sick || a.immune || !this.rng.chance(p)) continue;
          a.sick = true;
          newly++;
        }
        if (newly && !this.diseaseDay) {
          this.diseaseDay = this.day;
          this.events.push({ day: this.day, tick: this.tick, card: 'krankheit', params: {},
            at: { x: g.x, y: g.y, text: dis.name + ': die ersten ' + g.spec.plural + ' sind krank' } });
        }
        for (m = g.members.length - 1; m >= 0; m--) {
          a = g.members[m];
          if (!a.sick) continue;
          a.energy -= dis.cost;
          if (this.rng.chance(dis.death)) this.kill(a, 'krankheit');
          else if (this.rng.chance(dis.recover)) { a.sick = false; a.immune = true; }
        }
      }
    }
  };

  /**
   * Abfaelle der Doerfer (spec.scraps, verwilderte Hunde), einmal am Tag: Ist eine
   * Gruppe naeher als `radius` an einem Dorf, bekommt jedes Tier `energy` dazu. Ohne
   * Doerfer oder ohne solche Arten aendert sich nichts.
   */
  Simulation.prototype.scraps = function () {
    var villages = this.humans.villages;
    if (!villages.length) return;
    for (var i = 0; i < this.groups.length; i++) {
      var g = this.groups[i], sc = g.spec.scraps;
      if (!sc || !g.members.length) continue;
      var near = false;
      for (var k = 0; k < villages.length && !near; k++) near = BT.M.hypot(villages[k].x - g.x, villages[k].y - g.y) < sc.radius;
      if (!near) continue;
      for (var m = 0; m < g.members.length; m++) g.members[m].energy = Math.min(1, g.members[m].energy + sc.energy);
    }
  };

  Simulation.prototype.ageGroup = function (g) {
    for (var m = g.members.length - 1; m >= 0; m--) {
      var a = g.members[m];
      a.age++;
      var max = a.spec.maxAge;
      if (a.age > max * 0.75) {
        // Alterssterblichkeit steigt gegen Lebensende steil an
        var t = (a.age - max * 0.75) / (max * 0.25);
        if (a.age >= max * 1.15 || this.rng.chance(0.02 * t * t)) this.kill(a, 'alter');
      }
    }
  };

  function adults(g, sex) {
    var n = 0;
    for (var i = 0; i < g.members.length; i++) {
      var a = g.members[i];
      if (a.sex === sex && a.age >= a.spec.maturity) n++;
    }
    return n;
  }

  function anyAge(g, sex) {
    var n = 0;
    for (var i = 0; i < g.members.length; i++) if (g.members[i].sex === sex) n++;
    return n;
  }

  Simulation.prototype.birth = function (g, mother) {
    var spec = g.spec;
    var b = spec.breed;
    var n = this.rng.intIn(b.litter);
    if (spec.role === 'predator') n = Math.min(n, spec.group.max - g.members.length);
    for (var k = 0; k < n; k++) {
      var c = this.makeAnimal(spec, mother.x, mother.y, 0, this.rng.chance(0.5) ? 'f' : 'm', spec.newbornEnergy);
      this.addToGroup(g, c);
      this.stats.birth(spec.id);
    }
    mother.energy -= b.cost;
  };

  Simulation.prototype.breed = function (g, cal) {
    var spec = g.spec, b = spec.breed;
    if (cal.season !== b.season || cal.dayOfSeason !== b.day) return;
    // Raeuber ziehen nur im eigenen Revier Junge gross, und ein volles Rudel
    // (Paar mit Jungem) keine weiteren
    if (spec.role === 'predator' && (!g.home || g.members.length >= spec.group.max)) return;
    var males = adults(g, 'm');
    if (!males) return;
    var mothers = g.members.filter(function (a) {
      return a.sex === 'f' && a.age >= spec.maturity && a.energy >= b.minEnergy && !a.sick;
    });
    if (!mothers.length) return;

    if (b.kind === 'each-female') {
      var chance = b.chance * this.breedFood(b, g);
      for (var i = 0; i < mothers.length; i++) if (this.rng.chance(chance)) this.birth(g, mothers[i]);
    } else if (b.kind === 'group-pair') {
      // Nur das ranghoechste (aelteste) Paar pflanzt sich fort
      mothers.sort(function (x, y) { return y.age - x.age; });
      if (this.rng.chance(b.chance)) this.birth(g, mothers[0]);
    } else if (b.kind === 'horst') {
      // Greifvogel: das Paar legt die Eier in seinen Horst, einer brütet immer
      mothers.sort(function (x, y) { return y.age - x.age; });
      if (!this.rng.chance(b.chance)) return;
      if (!g.horstSite) g.horstSite = this.horstSite(spec, g.home);
      var eggs = this.rng.intIn(b.litter);
      mothers[0].energy -= b.cost;
      g.horst = { x: g.horstSite.x, y: g.horstSite.y, phase: 'brut', eggs: eggs, day: this.day, sitter: mothers[0].id };
      this.stats.nest(spec.id, eggs);
    } else if (b.kind === 'pair') {
      // Bodenbrueter: ein gemeinsames Nest, Kueken schluepfen spaeter
      var pairs = Math.min(mothers.length, males);
      var eggs = 0;
      // Wo Sammler unterwegs waren, legen die Paare seltener (eco/humans.js nestFactor)
      var calm = this.humans.nestFactor(g.x, g.y);
      for (i = 0; i < pairs; i++) {
        if (!this.rng.chance(b.chance * calm)) continue;
        eggs += this.rng.intIn(b.litter);
        mothers[i].energy -= b.cost;
      }
      if (eggs) {
        g.nest = { x: g.x, y: g.y, eggs: eggs, hatchDay: this.day + b.incubation };
        this.stats.nest(spec.id, eggs);
      }
    }
  };

  /**
   * Futterlage fuer den Nachwuchs (spec.breed.food = { key, r, low, high }): Je
   * weiter die Weiden rund um die Gruppe abgefressen sind, desto weniger Junge.
   * Fuellstand der Schicht `key` im Umkreis r (Weidezellen): ab `high` volle
   * Chance, bei `low` keine. So bremst sich ein Bestand, bevor er die Weiden
   * zerstoert. Ohne `food` immer 1.
   */
  Simulation.prototype.breedFood = function (b, g) {
    var f = b.food;
    if (!f) return 1;
    var c = this._breedShare;
    if (!c || c.day !== this.day || c.key !== f.key) c = this._breedShare = { day: this.day, key: f.key, share: this.fields.regionShare(f.key, f.r).slice() };
    var s = c.share[this.fields.index(g.x, g.y)];
    return Math.max(0, Math.min(1, (s - f.low) / (f.high - f.low)));
  };

  Simulation.prototype.hatch = function (g) {
    var nest = g.nest;
    if (!nest || this.day < nest.hatchDay) return;
    for (var k = 0; k < nest.eggs; k++) {
      var c = this.makeAnimal(g.spec, nest.x, nest.y, 0, this.rng.chance(0.5) ? 'f' : 'm', g.spec.newbornEnergy);
      this.addToGroup(g, c);
      this.stats.birth(g.spec.id);
    }
    g.nest = null;
  };

  /** Platz fuer den Horst nahe der Reviermitte, am liebsten auf Baeumen oder Felsen. */
  Simulation.prototype.horstSite = function (spec, home) {
    var best = { x: home.x, y: home.y }, bestScore = -1;
    for (var t = 0; t < 10; t++) {
      var p = BT.Behavior.randomPointNear(this, spec, home.x, home.y, spec.territory * 0.35);
      var score = spec.horst.sites[this.biomeAt(p.x, p.y)] + this.rng.next() * 0.1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  };

  /**
   * Horst, einmal am Tag: Nach der Brut schluepfen die Kueken, nach der
   * Nestlingszeit fliegen sie aus und suchen sich jedes fuer sich ein Revier.
   * Brutvogel verhungert, allein oder Eltern ausgehungert -> Brut aufgegeben.
   */
  Simulation.prototype.tendHorst = function (g) {
    var h = g.horst;
    if (!h) return;
    var spec = g.spec, hs = spec.horst;
    var parents = g.members.filter(function (a) { return !a.chick && a.age >= spec.maturity; });
    if (h.phase === 'brut') {
      var sitter = null;
      for (var i = 0; i < parents.length; i++) if (parents[i].id === h.sitter) sitter = parents[i];
      if (parents.length < 2 || !sitter || sitter.energy < hs.abandon) { this.endHorst(g); return; }
      if (this.day - h.day < hs.incubation) return;
      for (var k = 0; k < h.eggs; k++) {
        var c = this.makeAnimal(spec, h.x, h.y, 0, this.rng.chance(0.5) ? 'f' : 'm', spec.newbornEnergy);
        c.chick = true;
        this.addToGroup(g, c);
        c.x = h.x; c.y = h.y; c.px = c.x; c.py = c.y;
        this.stats.birth(spec.id);
      }
      h.phase = 'nestlinge'; h.day = this.day; h.eggs = 0;
      return;
    }
    var chicks = g.members.filter(function (a) { return a.chick; });
    // Hungern die Eltern selbst, geben sie die Brut auf: Ein langlebiger Vogel
    // setzt nicht sein Leben fuer eine Brut aufs Spiel
    var weak = parents.length && parents.every(function (a) { return a.energy < hs.abandon; });
    if (!chicks.length || !parents.length || weak) { this.endHorst(g); return; }
    if (this.day - h.day < hs.nestling) return;
    // Fluegge: Die Jungen fliegen mit den Eltern und bekommen von deren Beute ab
    // (Fuehrungszeit, hs.dependence Tage), dann sucht sich jedes seinen eigenen Platz
    for (k = 0; k < chicks.length; k++) {
      chicks[k].chick = false;
      chicks[k].fledged = this.day;
    }
    this.endHorst(g);
  };

  /** Nach der Fuehrungszeit verlassen die Jungen die Eltern. */
  Simulation.prototype.leaveParents = function (g) {
    var hs = g.spec.horst;
    if (!hs) return;
    var day = this.day;
    var leaving = g.members.filter(function (a) { return a.fledged != null && day - a.fledged >= (hs.dependence || 0); });
    for (var k = 0; k < leaving.length; k++) {
      leaving[k].fledged = null;
      var ng = this.makeGroup(g.spec, g.x, g.y);
      this.removeFromGroup(leaving[k]);
      this.addToGroup(ng, leaving[k]);
      ng.state = 'wandern';
    }
  };

  /** Horst verlassen: verbliebene Kueken (verwaist) werden zu Wanderern. */
  Simulation.prototype.endHorst = function (g) {
    var orphans = g.members.filter(function (a) { return a.chick; });
    for (var i = 0; i < orphans.length; i++) {
      var ng = this.makeGroup(g.spec, g.horst.x, g.horst.y);
      this.removeFromGroup(orphans[i]);
      this.addToGroup(ng, orphans[i]);
      ng.state = 'wandern';
    }
    for (i = 0; i < orphans.length; i++) orphans[i].chick = false;
    if (g.carry) { this.feed(g, g.carry); g.carry = 0; }
    if (g.state === 'heimflug') g.state = 'streifen';
    g.horst = null;
  };

  /** Junge Raeuber verlassen im Herbst das Rudel bzw. die Eltern. */
  Simulation.prototype.disperse = function (g, cal) {
    var d = g.spec.disperse;
    if (!d || g.horst || cal.season !== d.season || cal.dayOfSeason !== 1) return;
    if (g.members.length < d.minGroup) return;
    var oldest = g.members.slice().sort(function (a, b) { return b.age - a.age; });
    var breeders = [];
    var f = null, m = null;
    for (var i = 0; i < oldest.length; i++) {
      if (!f && oldest[i].sex === 'f') f = oldest[i];
      if (!m && oldest[i].sex === 'm') m = oldest[i];
    }
    if (f) breeders.push(f);
    if (m) breeders.push(m);
    var leaving = g.members.filter(function (a) {
      return breeders.indexOf(a) < 0 && a.age >= d.minAge;
    });
    var self = this;
    leaving = leaving.filter(function () { return self.rng.chance(d.chance); });
    if (!leaving.length) return;
    var ng = this.makeGroup(g.spec, g.x, g.y);
    for (i = 0; i < leaving.length; i++) {
      this.removeFromGroup(leaving[i]);
      this.addToGroup(ng, leaving[i]);
    }
    ng.state = 'wandern';
  };

  /** Herden teilen, Einzelgaenger zusammenlegen, wandernde Raeuber sesshaft machen. */
  Simulation.prototype.reorganize = function () {
    var groups = this.groups.slice();
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (!g.members.length) continue;
      var spec = g.spec;

      // Zu gross -> teilen
      if (g.members.length > spec.group.max && spec.group.kind !== 'pack' && spec.group.kind !== 'pair') {
        var half = g.members.slice(Math.floor(g.members.length / 2));
        var p = BT.Behavior.randomPointNear(this, spec, g.x, g.y, 120);
        var ng = this.makeGroup(spec, g.x, g.y);
        ng.tx = p.x; ng.ty = p.y;
        for (var k = 0; k < half.length; k++) { this.removeFromGroup(half[k]); this.addToGroup(ng, half[k]); }
        continue;
      }

      if (spec.role === 'predator') { this.reorganizePredator(g); continue; }
      // Unterwegs zu einem fernen Ziel: erst dort wird die Gruppe neu geordnet
      if (g.runaway) continue;

      // Zu wenig Futter fuer die grosse Herde -> ein Teil zieht weit weg (spec.group.split)
      if (this.splitHungry(g)) continue;

      // Zu klein -> Anschluss an eine nahe Gruppe derselben Art
      if (g.members.length < spec.group.min) {
        var other = this.nearestGroupOf(spec, g, 160);
        if (other && other.members.length + g.members.length <= spec.group.max && !g.nest && !other.nest) {
          var moving = g.members.slice();
          for (k = 0; k < moving.length; k++) { this.removeFromGroup(moving[k]); this.addToGroup(other, moving[k]); }
        }
      }
    }
  };

  /**
   * Grosse Herde, zu wenig Futter (spec.group.split): Sind die Tiere im Mittel
   * hungrig, zieht die Haelfte weit weg auf eine neue Weide. Danach ruhen beide
   * Teile `rest` Tage, bevor sie sich wieder teilen. Ohne split nichts.
   */
  Simulation.prototype.splitHungry = function (g) {
    var S = g.spec.group.split;
    if (!S || g.members.length < S.min || (g.splitDay != null && this.day - g.splitDay < S.rest)) return false;
    var e = 0;
    for (var i = 0; i < g.members.length; i++) e += g.members[i].energy;
    if (e / g.members.length >= S.energy) return false;
    var to = BT.Behavior.farPoint(this, g.spec, g, S.dist[0], S.dist[1]);
    if (!to) return false;
    var ng = this.makeGroup(g.spec, g.x, g.y);
    var half = g.members.slice(Math.floor(g.members.length / 2));
    for (var k = 0; k < half.length; k++) { this.removeFromGroup(half[k]); this.addToGroup(ng, half[k]); }
    ng.runaway = { x: to.x, y: to.y, ticks: this.ticksPerDay * 4 };
    g.splitDay = ng.splitDay = this.day;
    return true;
  };

  /**
   * Raeuber: Ein Rudel ohne Brutpaar gibt sein Revier nach einem Jahr auf und
   * wird zum Wanderer. Wanderer schliessen sich Gruppen an, denen ein
   * Geschlecht fehlt, oder finden sich zu zweit zusammen. Mit Partner und
   * freiem Platz gruenden sie ein Revier.
   *
   * Paare (Greifvoegel) verpaaren sich schon als Jungvoegel: Ein junges Paar
   * besetzt ein freies Revier und brütet, sobald beide erwachsen sind.
   * Wanderer schliessen sich nur einem Partner an, nie Artgenossen desselben
   * Geschlechts - sonst bildeten sich Trupps, die nie ein Revier gruenden.
   */
  Simulation.prototype.reorganizePredator = function (g) {
    var spec = g.spec;
    var pairs = spec.group.kind === 'pair';
    var count = pairs ? anyAge : adults;
    var f = count(g, 'f'), m = count(g, 'm');
    if (g.home) {
      g.lonelyDays = f && m ? 0 : (g.lonelyDays || 0) + 1;
      if (g.lonelyDays > T.DAYS_PER_YEAR) { g.home = null; g.lonelyDays = 0; }
      return;
    }
    // Ausgebuechst und noch unterwegs: erst weit weg, dann ein Revier
    if (g.runaway) return;
    var self = this;
    var k;
    if (pairs && g.members.length > 1 && !(f && m)) {
      // Gleichgeschlechtliche Wanderer gehen getrennte Wege
      var rest = g.members.slice(1);
      for (k = 0; k < rest.length; k++) {
        var ng = this.makeGroup(spec, g.x, g.y);
        this.removeFromGroup(rest[k]); this.addToGroup(ng, rest[k]);
        ng.state = 'wandern';
      }
    }
    if (!pairs && this.joinPack(g)) return;
    var other = pairs && !(f && m) && this.nearestGroupOf(spec, g, 260, function (o) {
      if (o.members.length + g.members.length > spec.group.max || o.horst) return false;
      return (!count(o, 'f') && count(g, 'f')) || (!count(o, 'm') && count(g, 'm'));
    });
    if (other) {
      var moving = g.members.slice();
      for (k = 0; k < moving.length; k++) { self.removeFromGroup(moving[k]); self.addToGroup(other, moving[k]); }
      return;
    }
    if (f && m && this.homeIsFree(spec, g.x, g.y)) {
      g.home = { x: g.x, y: g.y };
      g.horstSite = null;
      g.state = 'streifen';
    }
  };

  /**
   * Rudel: Ein Wanderer-Trupp schliesst sich einer nahen Gruppe an, der ein
   * erwachsenes Tier seines Geschlechts fehlt. Wechseln muessen nur die Tiere,
   * die dort fehlen und Platz haben - sonst blieben grosse Trupps aus lauter
   * Maennchen (oder Weibchen) fuer immer unter sich und bekaemen nie Junge.
   * Hat der Trupp selbst schon beide Geschlechter, sucht er ein eigenes Revier.
   */
  Simulation.prototype.joinPack = function (g) {
    var spec = g.spec;
    var f = adults(g, 'f'), m = adults(g, 'm');
    if ((f && m) || (!f && !m)) return false;
    var sex = f ? 'f' : 'm';
    var other = this.nearestGroupOf(spec, g, 260, function (o) {
      return o.members.length < spec.group.max && !adults(o, sex);
    });
    if (!other) return false;
    var room = spec.group.max - other.members.length;
    var moving = g.members.filter(function (a) { return a.sex === sex && a.age >= spec.maturity; }).slice(0, room);
    for (var k = 0; k < moving.length; k++) { this.removeFromGroup(moving[k]); this.addToGroup(other, moving[k]); }
    return true;
  };

  Simulation.prototype.nearestGroupOf = function (spec, from, maxDist, filter) {
    var best = null, bestD = maxDist;
    var list = spec.role === 'predator' ? this.predatorGroups : this.herbivoreGroups;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === from || o.spec !== spec || !o.members.length) continue;
      if (filter && !filter(o)) continue;
      var d = BT.M.hypot(o.x - from.x, o.y - from.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  };

  Simulation.prototype.cleanup = function () {
    function alive(g) { return g.members.length > 0; }
    this.groups = this.groups.filter(alive);
    this.herbivoreGroups = this.herbivoreGroups.filter(alive);
    this.predatorGroups = this.predatorGroups.filter(alive);
    for (var i = 0; i < this.predatorGroups.length; i++) {
      var g = this.predatorGroups[i];
      if (g.prey && !g.prey.members.length) g.prey = null;
    }
  };

  /** Mehrere Tage am Stueck (fuer Vorspulen und Tests). */
  Simulation.prototype.runDays = function (days) {
    var target = this.tick + days * this.ticksPerDay;
    while (this.tick < target) this.step();
  };

  Simulation.prototype.count = function (id) {
    var n = 0;
    for (var i = 0; i < this.groups.length; i++) if (this.groups[i].spec.id === id) n += this.groups[i].members.length;
    return n;
  };

  /**
   * Startbestaende passend zur Inselgroesse: die Werte in der Artentabelle
   * gelten fuer die mittlere Insel und werden mit der Landflaeche skaliert.
   */
  Simulation.defaultStart = function (world) {
    var ref = BT.ISLAND_SIZES.mittel;
    var factor = world.width * world.height / (ref.width * ref.height);
    var out = {};
    for (var k = 0; k < BT.SPECIES_ORDER.length; k++) {
      var id = BT.SPECIES_ORDER[k];
      // eingeschleppte Arten kommen erst mit den Menschen (Startbestand 0)
      out[id] = BT.SPECIES[id].introduced ? 0 : Math.max(2, Math.round(BT.SPECIES[id].start * factor));
    }
    return out;
  };

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  BT.Simulation = Simulation;
})(typeof window !== 'undefined' ? window : globalThis);
