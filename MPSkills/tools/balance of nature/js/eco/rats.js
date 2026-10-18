/**
 * Ratten: eingeschleppt mit einem Vorratsschiff (Karte "Ratten an Bord").
 *
 * Ratten sind keine einzelnen Tiere der Simulation, sondern ein Feld: eine
 * Zahl je Weidezelle (wie die Nahrung in eco/fields.js). Sonst waeren es
 * Zehntausende Tiere. Gezeichnet werden sie als gestreute Rattengruppen
 * (render/ratRenderer.js), dichter, wo viele sind.
 *
 * Einmal am Tag je Zelle:
 *   Fressen     Abfaelle und Vorraete im Dorf, Aas, dann Fruechte, Insekten und
 *               Getreide (dieselbe Nahrung wie die Laufvoegel). fed = gefressen / Bedarf.
 *   Geburten    von Fruehling bis Herbst, mal fed, mal Platz in der Zelle (Kapazitaet
 *               aus dem Lebensraum).
 *   Sterben     Grundsterblichkeit (Ratten leben kurz), dazu Hunger. Im Winter gibt es
 *               draussen kaum Futter: viele verhungern, am Dorf nicht.
 *   Abwandern   ein kleiner Teil immer, mehr, wenn die Zelle voll ist oder Futter fehlt,
 *               in die Nachbarzellen mit Lebensraum. Ratten wandern nicht weit, aber die
 *               Front schiebt sich ueber die Jahre ueber die Insel.
 *   Nester      Ratten fressen Eier und Kueken der Laufvoegel (BT.RATS.prey).
 *
 * Als Beute (BT.RATS.eatenBy): Hungrige Woelfe, Hunde und Adler fangen Ratten in
 * der Zelle, in der sie gerade sind (eco/behavior.js catchRats).
 *
 * Ohne Ratten (vor der Karte) passiert hier nichts und es wird kein Zufall
 * verbraucht: Die Simulation laeuft genau wie ohne diese Datei. Die Ratten haben
 * ihren eigenen Zufallsgenerator.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  function pref(byName) {
    var arr = new Array(BT.BIOME_INFO.length).fill(0);
    for (var k in byName) arr[B[k]] = byName[k];
    return arr;
  }

  /*
   * Alle Zahlen sind Startwerte fuer die Abstimmung (tools/invasion.js), Begruendung
   * in data/arten.md ("Ratten"). Zeiten in Tagen (1 Jahr = 60 Tage).
   */
  BT.RATS = {
    name: 'Ratte', plural: 'Ratten',
    ship: 40,                       // so viele kommen mit einem Vorratsschiff an Land
    max: 14,                        // Ratten je Weidezelle bei Lebensraum 1 (Platz fuer Nester)
    // Lebensraum (Platz, Verstecke): Im Dorf draengen sie sich (Scheunen, Vorraete), auf dem Acker
    // viele, im Busch und Wald etwas weniger, auf offenem Grasland deutlich weniger (keine
    // Verstecke), im Gebirge kaum, am Gipfel nicht
    habitat: pref({ SCRUB: 0.7, FERN: 0.6, MOSS: 0.5, SWAMP: 0.9, TUSSOCK: 0.12, BEACH: 0.6, THERMAL: 0.2, ROCK: 0.05, PEAK: 0,
      SOIL: 0.2, VILLAGE: 3, MEADOW: 0.15, FIELD: 2 }),
    water: { dist: 40, bonus: 0.6 },  // am Suesswasser (Ufer, Fluss) mehr: Lebensraum mal 1 + bonus, nach aussen abnehmend
    mast: { K: 1.8, birth: 1.5 },     // Mastjahr (Sommer, Herbst): so viel mehr Platz und Junge - Rattenplage
    winter: 0.025,                    // zusaetzliche Sterblichkeit je Wintertag mal Winterhaerte² (im Dorf ein Viertel)
    crop: 0.08,                       // Getreide, das eine Ratte am Tag frisst und verdirbt (Einheiten, zusaetzlich zum Bedarf)
    diet: { frucht: 0.1, insekten: 0.11, korn: 0.1 },   // Energie je Einheit (wie der Laufvogel)
    // Anfressen und Verderben: Ratten benagen mehr, als sie brauchen (Einheiten je Ratte und Tag, zusaetzlich
    // zum Bedarf, ohne Energie). Wie `crop` beim Getreide; es mindert die Nahrung der anderen Arten.
    spoil: { frucht: 0.002, insekten: 0.003 },
    // Huetehunde im Dorf: Im Umkreis `radius` jedes Hundes sterben je Tag `kill` der Ratten (mehrere Hunde
    // addieren sich bis `max`). Die Ratten rücken von aussen nach, sind dort aber duenn.
    guard: { radius: 70, kill: 0.015, max: 0.08 },
    need: 0.0003,                   // Energie je Ratte und Tag (Laufvogel 0,055)
    winterNeed: 0.5,                // im Winter mehr (mal Winterhaerte), nicht im Dorf
    birth: [0.1, 0.1, 0.06, 0],     // Junge je Ratte und Tag nach Jahreszeit, satt und mit Platz
    death: 0.012,                   // Grundsterblichkeit je Tag (im Mittel etwa 1,5 Jahre)
    starve: 0.12,                   // zusaetzlich je Tag bei voellig fehlendem Futter
    // Abwandern je Tag: base, sobald die Zelle halb voll ist (vorher anteilig: wenige bleiben
    // beisammen), crowd je Anteil ueber `at` der Kapazitaet, hungry bei fehlendem Futter
    disperse: { base: 0.2, crowd: 0.3, at: 0.7, hungry: 0.1 },
    // Dorf: Vorraete und Abfaelle im Umkreis jedes Hauses, auch im Winter; dort draengen sie sich (K: mehr Platz je Zelle)
    village: { radius: 70, food: 0.03, K: 30 },
    // Gelege: Je Tag frisst eine Ratte ein Ei bzw. Kueken mit egg bzw. chick * d / (d + half)
    // (d: Ratten in der Zelle). Kueken nur bis maxAge Tage.
    prey: {
      laufvogel: { egg: 0.2, chick: 0.08, maxAge: 15, half: 6 }
    },
    // Raeuber, die Ratten fangen: unter der Energie `below` (oder ihrer Jagdschwelle) je Tick und Jaeger
    // mit chance * d / (d + half), mal (1 - Deckung * cover); jede Ratte bringt `energy`.
    // lure: so stark zieht eine Gegend mit Ratten hungrige Raeuber an
    eatenBy: {
      inselwolf: { chance: 0.8, half: 2, cover: 0.3, energy: 0.08, below: 0.9, lure: 4 },
      hund: { chance: 0.8, half: 2, cover: 0.3, energy: 0.08, below: 0.9, lure: 4 },
      inseladler: { chance: 0.7, half: 2, cover: 0.5, energy: 0.08, below: 0.85, lure: 5 }
    },
    plague: 0.25                    // Rattenplage: Ratten auf diesem Anteil der Insel
  };

  // Nachbarzellen: 4 direkte (Gewicht 1) und 4 schraege (Gewicht 0,7)
  var NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 0.7], [-1, 1, 0.7], [1, -1, 0.7], [-1, -1, 0.7]];

  function Rats(sim) {
    this.sim = sim;
    this.rng = new BT.Rng(sim.world.seed).fork('ratten');
    var f = sim.fields, n = f.cols * f.rows;
    this.n = new Float64Array(n);       // Ratten je Weidezelle
    this.next = new Float64Array(n);
    this.fed = new Float64Array(n);     // Futterlage gestern (fuer die Darstellung: 0..1)
    this.K = new Float64Array(n);       // Kapazitaet je Zelle
    this.scrap = new Float64Array(n);   // Futter aus dem Dorf je Zelle und Tag
    this.guard = new Float64Array(n);   // Anteil der Ratten, den Huetehunde je Tag erwischen
    this.kVersion = -1;
    this.total = 0;                     // Ratten auf der Insel (gestern)
    this.cells = 0;                     // Zellen mit mindestens einer Ratte
    this.landCells = 0;
    this.share = 0;                     // Anteil der Insel mit Ratten
    this.day = null;                    // Tag der ersten Ratten
    this.plagueDay = null;
    this.deaths = {};                   // Ratten nach Todesursache (gerundet in der Anzeige)
    this.eaten = { eggs: 0, chicks: 0 };
    this.cropEaten = 0;                 // Getreide, das Ratten gefressen haben (fuer die Ernte-Bilanz)
    this.year = { eggs: 0, chicks: 0, caught: {} };
  }

  /** Ratten an Land setzen (Vorratsschiff an der Kueste bei x, y). */
  Rats.prototype.release = function (x, y, count) {
    var f = this.sim.fields, i = f.index(x, y);
    if (i < 0) return;
    this.updateK();
    this.updateScraps();
    // in die beste Zelle gleich hinter der Kueste (im Umkreis von 2 Zellen)
    var best = -1, bestK = 0, cx = i % f.cols, cy = (i - cx) / f.cols;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var x2 = cx + dx, y2 = cy + dy;
        if (x2 < 0 || y2 < 0 || x2 >= f.cols || y2 >= f.rows) continue;
        var k = this.K[y2 * f.cols + x2] + this.scrap[y2 * f.cols + x2] / BT.RATS.need;
        if (k > bestK) { bestK = k; best = y2 * f.cols + x2; }
      }
    }
    if (best < 0) return;
    this.n[best] += count;
    this.total += count;
    if (this.day == null) this.day = this.sim.day;
  };

  /** Ratten in der Zelle bei (x, y). */
  Rats.prototype.at = function (x, y) {
    if (!this.total) return 0;
    var i = this.sim.fields.index(x, y);
    return i < 0 ? 0 : this.n[i];
  };

  /** Ein Raeuber (id) faengt bis zu `count` Ratten in Zelle i. Liefert, wie viele. */
  Rats.prototype.take = function (i, count, id) {
    var got = Math.min(count, Math.floor(this.n[i]));
    if (got <= 0) return 0;
    this.n[i] -= got;
    this.total -= got;
    this.deaths[id] = (this.deaths[id] || 0) + got;
    this.year.caught[id] = (this.year.caught[id] || 0) + got;
    return got;
  };

  /** Kapazitaet je Weidezelle aus dem Lebensraum (mit Nutzung), neu bei jeder Aenderung des Gelaendes. */
  Rats.prototype.updateK = function () {
    var sim = this.sim, lu = sim.landuse;
    if (this.kVersion === lu.version) return;
    this.kVersion = lu.version;
    var f = sim.fields, w = sim.world, g = lu.ground, s = f.step, H = BT.RATS.habitat, land = 0;
    for (var fy = 0; fy < f.rows; fy++) {
      for (var fx = 0; fx < f.cols; fx++) {
        var sum = 0, count = 0;
        for (var y = fy * s; y < Math.min(w.rows, fy * s + s); y++) {
          for (var x = fx * s; x < Math.min(w.cols, fx * s + s); x++) { sum += H[g[y * w.cols + x]]; count++; }
        }
        var k = sum / count * BT.RATS.max;
        // am Suesswasser mehr Ratten
        var W = BT.RATS.water, wd = w.query.freshWaterDistance((fx + 0.5) * f.size, (fy + 0.5) * f.size);
        if (k > 0 && wd < W.dist) k *= 1 + W.bonus * (1 - wd / W.dist);
        this.K[fy * f.cols + fx] = k;
        if (k > 0) land++;
      }
    }
    this.landCells = Math.max(1, land);
  };

  /** Futter aus den Doerfern: im Umkreis jedes Hauses, je Zelle hoechstens einmal. */
  Rats.prototype.updateScraps = function () {
    var f = this.sim.fields, houses = this.sim.humans.houses, V = BT.RATS.village;
    this.scrap.fill(0);
    var rc = Math.ceil(V.radius / f.size);
    for (var h = 0; h < houses.length; h++) {
      var hx = Math.floor(houses[h].x / f.size), hy = Math.floor(houses[h].y / f.size);
      for (var dy = -rc; dy <= rc; dy++) {
        for (var dx = -rc; dx <= rc; dx++) {
          var x = hx + dx, y = hy + dy;
          if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) continue;
          var cx = (x + 0.5) * f.size - houses[h].x, cy = (y + 0.5) * f.size - houses[h].y;
          if (cx * cx + cy * cy <= V.radius * V.radius) this.scrap[y * f.cols + x] = V.food;
        }
      }
    }
  };

  /** Huetehunde: Zellen im Umkreis jedes Hundes, deren Ratten er jagt (summiert bis `max`). */
  Rats.prototype.updateGuards = function () {
    var f = this.sim.fields, dogs = this.sim.humans.dogs, G = BT.RATS.guard;
    this.guard.fill(0);
    var rc = Math.ceil(G.radius / f.size);
    for (var h = 0; h < dogs.length; h++) {
      var hx = Math.floor(dogs[h].x / f.size), hy = Math.floor(dogs[h].y / f.size);
      for (var dy = -rc; dy <= rc; dy++) {
        for (var dx = -rc; dx <= rc; dx++) {
          var x = hx + dx, y = hy + dy;
          if (x < 0 || y < 0 || x >= f.cols || y >= f.rows) continue;
          var cx = (x + 0.5) * f.size - dogs[h].x, cy = (y + 0.5) * f.size - dogs[h].y;
          if (cx * cx + cy * cy <= G.radius * G.radius) {
            var j = y * f.cols + x;
            this.guard[j] = Math.min(G.max, this.guard[j] + G.kill);
          }
        }
      }
    }
  };

  /** Einmal am Tag (aus Simulation.newDay, nach dem Wachstum der Pflanzen). */
  Rats.prototype.newDay = function () {
    if (!this.total) return;
    var sim = this.sim, R = BT.RATS, f = sim.fields, cal = sim.calendar;
    this.updateK();
    this.updateScraps();
    this.updateGuards();
    this.eatCarrion();
    var n = this.n, next = this.next, K = this.K, cols = f.cols, rows = f.rows;
    var winter = cal.season === 3;
    var mast = sim.weatherNow.mast && (cal.season === 1 || cal.season === 2);
    var birth = R.birth[cal.season] * (mast ? R.mast.birth : 1), D = R.disperse, mk = mast ? R.mast.K : 1;
    var hard = sim.weatherNow.winter;
    var cold = winter ? 1 + R.winterNeed * hard : 1;
    var frost = winter ? R.winter * hard * hard : 0;
    var korn = f.value.korn, crop = 0, spoil = Object.keys(R.spoil);
    next.fill(0);
    var total = 0, cells = 0;
    for (var i = 0; i < n.length; i++) {
      var r = n[i];
      if (r <= 0) continue;
      if (K[i] <= 0) { this.die(r, 'hunger'); continue; }      // Gelaende hat sich geaendert (sollte kaum vorkommen)
      // Fressen: erst Dorf, dann Aas (schon in eatCarrion), dann die Felder
      var village = this.scrap[i] > 0;
      var need = r * R.need * (village ? 1 : cold);
      var got = Math.min(need, this.scrap[i] + (this.carrion ? this.carrion[i] : 0));
      if (got < need) got += f.eat(i, R.diet, (need - got) / 0.1);
      var fed = need > 0 ? Math.min(1, got / need) : 1;
      this.fed[i] = fed;
      // Getreide: Ratten fressen und verderben viel mehr, als sie brauchen
      if (korn[i] > 0) {
        var c = Math.min(korn[i], r * R.crop);
        korn[i] -= c; f.eaten.korn += c; crop += c;
      }
      // Anfressen und Verderben von Fruechten und Insekten (ohne Energie)
      for (var sk = 0; sk < spoil.length; sk++) {
        var key = spoil[sk], sv = f.value[key];
        var bit = Math.min(sv[i], r * R.spoil[key]);
        if (bit > 0) { sv[i] -= bit; f.bitten[key][i] += bit; f.eaten[key] += bit; }
      }
      // Geburten und Tod; Kaelte im Winter (im Dorf geschuetzt)
      var Ki = (K[i] + (village ? R.village.K : 0)) * mk;
      var room = Math.max(0, 1 - r / Ki);
      var born = r * birth * fed * room;
      var old = r * R.death, hunger = r * (R.starve * (1 - fed) + frost * (village ? 0.25 : 1));
      this.die(old, 'alter');
      this.die(hunger, 'hunger');
      var dogs = r * this.guard[i];
      this.die(dogs, 'hofhund');
      r = Math.max(0, r + born - old - hunger - dogs);
      // Abwandern in die Nachbarzellen mit Lebensraum
      var share = Math.min(0.5, D.base * Math.min(1, 2 * r / Ki) + D.crowd * Math.max(0, r / Ki - D.at) + D.hungry * (1 - fed));
      var cx = i % cols, cy = (i - cx) / cols, wsum = 0, k, j;
      for (k = 0; k < 8; k++) {
        j = nb(cx, cy, k, cols, rows);
        if (j >= 0 && K[j] > 0) wsum += NB[k][2] * K[j];
      }
      if (wsum > 0) {
        var out = r * share;
        for (k = 0; k < 8; k++) {
          j = nb(cx, cy, k, cols, rows);
          if (j >= 0 && K[j] > 0) next[j] += out * NB[k][2] * K[j] / wsum;
        }
        r -= out;
      }
      next[i] += r;
    }
    for (i = 0; i < n.length; i++) {
      var v = next[i];
      if (v > 0 && v < 0.05) { v = 0; }             // verlaufen: so wenige bleiben nicht
      n[i] = v;
      total += v;
      if (v >= 1) cells++;
    }
    this.total = total;
    this.cells = cells;
    this.cropEaten += crop;
    this.share = cells / this.landCells;
    this.carrion = null;
    this.raidNests();
    this.events();
  };

  function nb(cx, cy, k, cols, rows) {
    var x = cx + NB[k][0], y = cy + NB[k][1];
    return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : y * cols + x;
  }

  Rats.prototype.die = function (count, cause) {
    if (count > 0) this.deaths[cause] = (this.deaths[cause] || 0) + count;
  };

  /**
   * Aas: Ratten fressen an jedem Kadaver in ihrer Zelle, so viel sie brauchen.
   * Was sie fressen, fehlt den Woelfen und Adlern.
   */
  Rats.prototype.eatCarrion = function () {
    var sim = this.sim, f = sim.fields, R = BT.RATS, list = sim.carcasses;
    if (!list.length) return;
    var food = this.carrion = new Float64Array(this.n.length);
    for (var c = list.length - 1; c >= 0; c--) {
      var cc = list[c], i = f.index(cc.x, cc.y);
      if (i < 0 || this.n[i] < 1) continue;
      var want = this.n[i] * R.need * 2 - food[i];
      if (want <= 0) continue;
      var take = Math.min(cc.meat, want);
      cc.meat -= take;
      food[i] += take;
      if (cc.meat < 0.05) list.splice(c, 1);
    }
  };

  /** Eier und Kueken der Bodenbrueter (BT.RATS.prey). */
  Rats.prototype.raidNests = function () {
    var sim = this.sim, P = BT.RATS.prey;
    var groups = sim.herbivoreGroups;
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i], p = P[g.spec.id];
      if (!p || !g.members.length) continue;
      if (g.nest && g.nest.eggs) {
        var d = this.at(g.nest.x, g.nest.y);
        if (d >= 1) {
          var pe = p.egg * d / (d + p.half), lost = 0;
          for (var e = 0; e < g.nest.eggs; e++) if (this.rng.chance(pe)) lost++;
          if (lost) {
            g.nest.eggs -= lost;
            this.eaten.eggs += lost;
            this.year.eggs += lost;
            if (!g.nest.eggs) g.nest = null;
          }
        }
      }
      var chicks = null;
      for (var m = 0; m < g.members.length; m++) if (g.members[m].age <= p.maxAge) (chicks || (chicks = [])).push(g.members[m]);
      if (!chicks) continue;
      for (m = 0; m < chicks.length; m++) {
        var a = chicks[m], dc = this.at(a.x, a.y);
        if (dc < 1 || !this.rng.chance(p.chick * dc / (dc + p.half))) continue;
        sim.kill(a, 'ratte');
        this.eaten.chicks++;
        this.year.chicks++;
      }
    }
  };

  /** Folgekarte Rattenplage (Chronik); zu Jahresbeginn wird die Jahreszaehlung zurueckgesetzt. */
  Rats.prototype.events = function () {
    var sim = this.sim;
    if (this.plagueDay == null && this.share >= BT.RATS.plague) {
      this.plagueDay = sim.day;
      sim.events.push({ day: sim.day, tick: sim.tick, card: 'rattenplage', params: {},
        at: { text: 'Ratten leben schon auf ' + Math.round(this.share * 100) + ' % der Insel, etwa ' + roundRats(this.total) } });
    }
    if (sim.calendar.dayOfYear !== 0) return;
    this.year = { eggs: 0, chicks: 0, caught: {} };
  };

  /** Anzahl fuer Texte: auf Zehner bzw. Hunderter gerundet. */
  function roundRats(n) {
    var step = n >= 1000 ? 100 : n >= 100 ? 10 : 1;
    return (Math.round(n / step) * step).toLocaleString('de-DE') + ' Ratten';
  }

  Rats.roundText = roundRats;
  BT.Rats = Rats;
})(typeof window !== 'undefined' ? window : globalThis);
