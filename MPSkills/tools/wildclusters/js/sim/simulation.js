/**
 * Die Simulation der 5 Tage - einmal beim Weltaufbau, dann nie wieder.
 *
 * Ablauf: Gewaesser aufbereiten, Tiere anlegen, 30 000 Rechenschritte
 * durchlaufen und alle 0.2 s eine Stuetzstelle je Tier ablegen. Heraus kommt
 * eine Aufzeichnung (js/sim/recording.js), auf der der Abspieler arbeitet.
 *
 * Determinismus ist hier genauso Pflicht wie im Weltgenerator: derselbe Seed
 * muss denselben Tagesverlauf ergeben, sonst kann man im Unterricht nicht
 * ueber dieselbe Welt reden. Deshalb bekommt jede Art und jedes Tier einen
 * eigenen rng.fork(), und die Tiere werden in fester Reihenfolge aktualisiert.
 *
 * Die Flaechennahrung liegt ebenfalls hier: ein Wert je Wasserzelle, der beim
 * Fressen sinkt und langsam nachwaechst. Nachgewachsen wird nicht jeden Tick
 * fuer alle 64 000 Zellen, sondern beim Nachschlagen aus der verstrichenen
 * Zeit - das ist derselbe Wert zu einem Bruchteil der Kosten.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function run(world, options) {
    var opts = options || {};
    var Time = WL.SimTime;
    var started = now();

    var totalSeconds = opts.seconds || Time.TOTAL_SECONDS;
    var tickDt = 1 / Time.TICK_HZ;
    var ticksPerSample = Math.round(Time.TICK_HZ / Time.SAMPLE_HZ);
    var sampleSeconds = 1 / Time.SAMPLE_HZ;
    var sampleCount = Math.round(totalSeconds * Time.SAMPLE_HZ) + 1;

    // Der Bruch: hier tauchen die Nachzuegler auf. Liegt er hinter dem Ende
    // des Laufs, kommt keiner - und genau das macht einen verkuerzten Lauf
    // (opts.seconds = PHASE_SECONDS) zum unveraenderten Lauf von frueher. Das
    // ist der Vergleichsmassstab, an dem sich beweisen laesst, dass Tag 1-5
    // bitgleich geblieben sind.
    var breakSeconds = opts.breakSeconds != null ? opts.breakSeconds : Time.BREAK_SECONDS;
    var breakSample = Math.round(breakSeconds * Time.SAMPLE_HZ);
    // Strikt kleiner als die letzte Stuetzstelle: ein Lauf, der *genau* am
    // Bruch endet, hat keine zweite Phase. Ohne das taucht der Nachzuegler im
    // allerletzten Augenblick noch fuer eine Stuetzstelle auf - gefunden vom
    // Bitvergleich, nicht durch Nachdenken.
    var hasBreak = breakSample > 0 && breakSample < sampleCount - 1;

    var habitat = WL.Habitat.build(world);
    var land = WL.Land.build(world);
    var rootRng = new WL.Rng(world.seed).fork('sim');

    // ---------------------------------------------------------- Nahrung
    //
    // Eine Karte je Nahrungsart, nicht eine fuer alle: Wasserpflanzen (Ente)
    // und Kleintiere (Barsch) liegen auf denselben Zellen, sind aber nicht
    // derselbe Vorrat. Mit einer gemeinsamen Karte wuerde die Ankunft des
    // Barsches das Fressverhalten der Ente veraendern - und damit ihre bereits
    // justierten Merkmalswerte.
    //
    // Zwei Formen, beide mit demselben Nachwachsen aus der verstrichenen Zeit:
    // Flaechennahrung liegt auf Zellen eines Terraintyps, Ortsnahrung auf den
    // Weltobjekten, die der Generator ohnehin schon gesetzt hat. Der
    // Weltgenerator wird dafuer nicht angefasst - der Vorrat lebt hier.
    var cellCount = world.cols * world.rows;
    var grid = world.terrain.grid.data;
    var foodMaps = {};

    var AREA_SOURCES = { water: T.WATER, grass: T.GRASS, forest: T.FOREST, ground: T.GROUND };

    /**
     * Eine Karte je Nahrungsart - und die gehoert der *Art des Futters*, nicht
     * der Tierart. Zwei Tiere, die dieselbe Nahrung fressen, teilen sich damit
     * denselben Vorrat und nehmen einander wirklich etwas weg (Reh und
     * Wildschwein bei den Nuessen). Wer das nicht will, gibt der zweiten Art
     * eine eigene Nahrungsart mit eigenem Namen.
     *
     * Angelegt wird die Karte von der Art, die in WL.SPECIES_ORDER zuerst
     * kommt; die Nachwachsrate aller spaeteren ist damit wirkungslos. Was je
     * Art gilt, ist eatPerSecond - das steht im Tier, nicht in der Karte.
     */
    function ensureFood(spec) {
      if (!spec.forage) return;
      for (var kind in spec.forage) {
        if (foodMaps[kind]) continue;
        foodMaps[kind] = buildFoodMap(spec.forage[kind]);
      }
    }

    function buildFoodMap(cfg) {
      var terrain = AREA_SOURCES[cfg.source];
      var i;
      if (terrain != null) {
        var values = new Float32Array(cellCount);
        for (i = 0; i < cellCount; i++) values[i] = grid[i] === terrain ? 1 : 0;
        return {
          terrain: terrain,
          values: values,
          stamps: new Float32Array(cellCount),
          regrow: cfg.regrowPerSecond
        };
      }

      // Ortsnahrung: ein Vorrat je Weltobjekt. Die Objekte selbst bleiben
      // unveraendert, hier stehen nur ihre Koordinaten und ihr Fuellstand.
      var source = world.objects[cfg.source] || [];
      var px = new Float32Array(source.length);
      var py = new Float32Array(source.length);
      var pv = new Float32Array(source.length);
      var ps = new Float32Array(source.length);
      for (i = 0; i < source.length; i++) {
        px[i] = source[i].x;
        py[i] = source[i].y;
        pv[i] = 1;
      }
      return {
        points: true,
        x: px, y: py, values: pv, stamps: ps,
        count: source.length,
        regrow: cfg.regrowPerSecond
      };
    }

    // ------------------------------------------------------------- Tiere
    var agents = [];
    var order = opts.species || WL.SPECIES_ORDER;

    // Wie viele Tiere je Art - gezogen aus den Spannen des Katalogs, aber
    // gedeckelt durch die Obergrenze der Welt (WL.POPULATION.max). Der eigene
    // fork() sorgt dafuer, dass die Ziehung keinen Tierlauf verschiebt.
    var population = opts.population || drawPopulation(rootRng.fork('bestand'), order);

    for (var s = 0; s < order.length; s++) {
      var spec = WL.SPECIES[order[s]];
      var brain = WL.Brains[order[s]];
      if (!spec || !brain) continue;
      ensureFood(spec);
      var born = brain.spawn({
        world: world,
        habitat: habitat,
        land: land,
        species: withCount(spec, population[spec.id]),
        rng: rootRng.fork(spec.id),
        // Wann dieses Tier entsteht. Fuer den Startbestand ist das der Anfang
        // der Aufzeichnung; ein Nachzuegler bekommt hier den Bruch (spawnLate).
        // Wer eine *absolute* Uhr stellt - die Ente ihren Aufbruch - muss von
        // dieser Zeit aus rechnen und nicht von 0, sonst ist der Termin bei
        // seiner Ankunft fuenf Tage ueberfaellig.
        time: 0,
        // Die bereits angelegten Tiere der frueheren Arten. Eine Art, die
        // spaeter in SPECIES_ORDER steht, kann damit auf deren feste Orte
        // zugreifen - der Fuchs sucht sich so den Dachsbau, an dem einer von
        // ihnen mitschlaeft. Wer frueher steht, sieht eine kuerzere Liste;
        // deshalb bleibt die Reihenfolge auch hier die Wahrheit.
        agents: agents
      });
      // Ein Verhaltensmodul kennt nur seine eigenen Tiere und nummeriert sie ab
      // 0. Hier werden daraus fortlaufende Nummern ueber alle Arten - inklusive
      // der Partnerverweise, sonst zeigen sie ab der zweiten Art ins Leere.
      var base = agents.length;
      for (var b = 0; b < born.length; b++) {
        // Der Klon aus withCount war nur fuer die Anzahl da - das Tier gehoert
        // seiner echten Art, sonst zeigen alle spec-Verweise auf eine Kopie.
        born[b].spec = spec;
        born[b].index = base + b;
        if (born[b].partner >= 0) born[b].partner += base;
        agents.push(born[b]);
      }
    }

    var baseCount = agents.length;

    // ------------------------------------------------------- Nachzuegler
    //
    // Sie werden hier *nicht* angelegt, nur gezaehlt. Angelegt werden sie am
    // Bruch (siehe unten), und das ist der Punkt: ein Tier, das erst an Tag 6
    // entsteht, stellt seine Uhren auch auf Tag 6. Legte man es an Tag 0 an
    // und liesse es nur schlafen, waeren am Bruch saemtliche Beduerfnisse
    // fuenf Tage ueberfaellig - es traenke sofort, fraesse sofort und liefe
    // seinen ersten Tag voellig anders als jeder Artgenosse. Das ist dieselbe
    // Zeitbudget-Falle, die beim Dachs schon einmal die Trinkgaenge auf 0.0
    // gedrueckt hat, nur von der anderen Seite.
    //
    // Ihre *Plaetze* in der Aufzeichnung gibt es dagegen von Anfang an: die
    // Nummer eines Tieres darf sich nie verschieben, und die Signalkacheln
    // sollen ueber beide Phasen dieselben bleiben. Bis zur Ankunft steht in
    // diesen Zeilen der Zustand 'abwesend'.
    var lateIds = opts.lateArrivals || planLateArrivals(rootRng.fork('nachzuegler'));
    if (!hasBreak) lateIds = [];
    var lateAgents = [];
    var totalSlots = baseCount + lateIds.length;

    /**
     * Wie viele Tiere je Art? Erst zieht jede Art ihren Wunsch aus ihrer
     * eigenen Spanne (data/tiere.md §3), dann wird so lange je ein Tier
     * abgezogen, bis die Welt unter die Obergrenze passt (WL.POPULATION.max).
     *
     * **Gedeckelt wird vor dem Anlegen, nicht danach.** Ein Tier hinterher
     * wieder herauszunehmen risse es aus seinem Schwarm, seiner Rotte oder
     * seiner Familie - die Gruppe ist bei mehreren Arten die handelnde
     * Einheit, und ihre Groesse steht schon in ihrem eigenen Zustand.
     *
     * Abgezogen wird immer bei der Art mit dem groessten Abstand zu ihrer
     * *eigenen* Untergrenze: wer hoch gezogen hat, gibt zuerst ab, und keine
     * Art faellt unter ihr Minimum (die Summe der Minima liegt mit 27 deutlich
     * unter der Grenze). Bei Gleichstand entscheidet der Zufall - sonst zahlte
     * in jeder Welt dieselbe Art die Zeche.
     *
     * **Der Wunsch wird aus dem Strom der Art selbst gezogen** (fork(spec.id)),
     * und zwar an genau der Stelle, an der ihn frueher ihr Verhaltensmodul
     * gezogen hat - fork() ist rein, dieselbe Gabel liefert zweimal denselben
     * ersten Wert. Deshalb ist eine Welt, die ohnehin unter die Grenze passt,
     * Stuetzstelle fuer Stuetzstelle dieselbe wie vor der Obergrenze. Nur der
     * Zufall fuer den Gleichstand kommt aus einer eigenen Gabel.
     */
    function drawPopulation(rng, ids) {
      var out = {};
      var pool = [];
      var total = 0;
      var i;
      for (i = 0; i < ids.length; i++) {
        var spec = WL.SPECIES[ids[i]];
        if (!spec || !WL.Brains[ids[i]] || !spec.count) continue;
        out[spec.id] = rootRng.fork(spec.id).intIn(spec.count);
        total += out[spec.id];
        pool.push(spec);
      }

      var max = (WL.POPULATION && WL.POPULATION.max) || 0;
      while (max > 0 && total > max) {
        var widest = [];
        var slack = 0;
        for (i = 0; i < pool.length; i++) {
          var room = out[pool[i].id] - pool[i].count[0];
          if (room < slack) continue;
          if (room > slack) { slack = room; widest.length = 0; }
          widest.push(pool[i].id);
        }
        // Alle sitzen auf ihrer Untergrenze - mehr gibt der Katalog nicht her.
        if (!slack) break;
        out[rng.pick(widest)]--;
        total--;
      }
      return out;
    }

    /**
     * Ein Klon der Art mit fester Anzahl - dieselbe Form wie bei den
     * Nachzueglern (spawnLate). Das Verhaltensmodul zieht seine Anzahl weiter
     * selbst aus spec.count, es bekommt nur eine Spanne der Breite eins;
     * dadurch bleibt der Zufallsstrom jeder Art an derselben Stelle wie zuvor.
     */
    function withCount(spec, n) {
      if (n == null) return spec;
      var out = {};
      for (var k in spec) out[k] = spec[k];
      out.count = [n, n];
      return out;
    }

    /**
     * Wer taucht auf: erst die bekannten Arten, dann die neue.
     *
     * Gezogen wird aus dem Weltseed, damit eine Klasse ueber dieselbe Welt
     * reden kann, und ueber einen eigenen fork() - die Ziehung darf keinen
     * Tierlauf verschieben.
     */
    function planLateArrivals(rng) {
      var cfg = WL.LATE_ARRIVALS || { known: 0, newcomer: 0 };
      var out = [];
      var i;

      // Bekannte Arten: nur solche, deren spawn() ein einzelnes Tier vertraegt
      // (spec.lateArrival, siehe js/sim/species.js).
      var pool = [];
      for (i = 0; i < order.length; i++) {
        var s = WL.SPECIES[order[i]];
        if (s && s.lateArrival && WL.Brains[s.id]) pool.push(s.id);
      }
      out = out.concat(drawDistinct(rng, pool, cfg.known));

      // Und die neuen Arten, je Welt aus dem Vorrat gezogen.
      var fresh = [];
      for (i = 0; i < (WL.NEW_SPECIES || []).length; i++) {
        if (WL.SPECIES[WL.NEW_SPECIES[i]] && WL.Brains[WL.NEW_SPECIES[i]]) {
          fresh.push(WL.NEW_SPECIES[i]);
        }
      }
      out = out.concat(drawDistinct(rng, fresh, cfg.newcomer));

      return out;
    }

    /**
     * n verschiedene Arten aus einem Vorrat - **ohne Zuruecklegen**, und daran
     * haengt bei beiden Ziehungen der ganze Zweck.
     *
     * Bei den bekannten Arten: drei Nachzuegler sollen in *drei verschiedene*
     * selbst gebildete Gruppen gehoeren. Dreimal dieselbe Art waere eine Frage
     * statt dreien.
     *
     * Bei den neuen Arten: zwei Fremde sollen zwei Fremde sein. Zweimal
     * dieselbe waeren ein Paar - sie fielen zusammen in einen Haufen, und die
     * Aufgabe "gehoert das eine zum anderen?" gaebe es gar nicht mehr.
     *
     * Reicht der Vorrat nicht, kommen eben weniger - das ist der Fall zu Beginn
     * einer Bauphase, in der erst eine neue Art steht.
     */
    function drawDistinct(rng, pool, n) {
      var rest = pool.slice();
      var out = [];
      while (out.length < (n || 0) && rest.length) {
        out.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]);
      }
      return out;
    }

    /**
     * Ein einzelnes Tier einer Art anlegen, mitten im Lauf.
     *
     * spec.count wird dafuer auf genau eins gezwungen - der Rest der Art bleibt
     * unangetastet, das Tier ist ein vollwertiges Reh mit allen Reh-Werten.
     * Der eigene fork('nachzuegler') sorgt dafuer, dass die bereits laufenden
     * Tiere derselben Art davon nichts merken: sie haengen an fork('reh') und
     * sind seit Tag 0 unterwegs.
     */
    function spawnLate(speciesId, tag) {
      var spec = WL.SPECIES[speciesId];
      var brain = WL.Brains[speciesId];
      if (!spec || !brain) return [];
      ensureFood(spec);

      var born = brain.spawn({
        world: world, habitat: habitat, land: land,
        species: withCount(spec, 1),
        rng: rootRng.fork('nachzuegler-' + tag),
        time: breakSeconds,
        // Hier stehen die laufenden Tiere *einschliesslich der eigenen Art* -
        // beim Aufbau der Welt ist das nie so. Genau daran erkennt ein spawn(),
        // dass es dazustellt statt anzufangen, und holt sich Bau, Familie oder
        // Jagdgebiete bei den Artgenossen ab (WL.Agents.groupsOf / livingOf).
        agents: agents
      });
      // Der Klon war nur fuer die Anzahl da; das Tier gehoert seiner echten Art.
      for (var b = 0; b < born.length; b++) born[b].spec = spec;
      return born;
    }

    function cellAt(x, y) {
      var cx = Math.floor(x / world.cellSize);
      var cy = Math.floor(y / world.cellSize);
      if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) return -1;
      return cy * world.cols + cx;
    }

    /** Nachgewachsener Wert eines Vorrats, gedeckelt auf 1. */
    function grown(map, i) {
      var v = map.values[i] + (ctx.time - map.stamps[i]) * map.regrow;
      return v > 1 ? 1 : v;
    }

    var ctx = {
      world: world,
      habitat: habitat,
      land: land,
      agents: agents,
      time: 0,

      /**
       * Vorrat dieser Nahrungsart an dieser Stelle, 0..1. Nachgewachsen wird
       * nicht jeden Tick fuer alle Zellen, sondern hier beim Nachschlagen aus
       * der verstrichenen Zeit - derselbe Wert zu einem Bruchteil der Kosten.
       */
      foodAt: function (x, y, kind) {
        var map = foodMaps[kind];
        if (!map || map.points) return 0;
        var i = cellAt(x, y);
        if (i < 0 || grid[i] !== map.terrain) return 0;
        return grown(map, i);
      },

      eatAt: function (x, y, amount, kind) {
        var map = foodMaps[kind];
        if (!map || map.points) return;
        var i = cellAt(x, y);
        if (i < 0 || grid[i] !== map.terrain) return;
        var v = grown(map, i) - amount;
        map.values[i] = v < 0 ? 0 : v;
        map.stamps[i] = ctx.time;
      },

      /**
       * Ortsnahrung in Sichtweite: die naechstgelegene Stelle mit genug Vorrat.
       * Linear ueber alle Objekte - es sind pro Karte weniger als hundert, und
       * gefragt wird nur alle paar Zehntelsekunden.
       *
       * Zurueck kommt die Nummer der Stelle, nicht ein Punkt: das Tier merkt
       * sich damit, welchen Baum es gerade leergefressen hat.
       */
      foodInSight: function (x, y, radius, kind, minValue, skip) {
        var map = foodMaps[kind];
        if (!map || !map.points) return -1;
        var best = -1;
        var bestDist = radius * radius;
        for (var i = 0; i < map.count; i++) {
          if (i === skip) continue;
          var dx = map.x[i] - x;
          var dy = map.y[i] - y;
          var d = dx * dx + dy * dy;
          if (d >= bestDist) continue;
          if (grown(map, i) < minValue) continue;
          bestDist = d;
          best = i;
        }
        return best;
      },

      foodPoint: function (kind, index, out) {
        var map = foodMaps[kind];
        var o = out || {};
        o.x = map.x[index];
        o.y = map.y[index];
        o.value = grown(map, index);
        return o;
      },

      eatPoint: function (kind, index, amount) {
        var map = foodMaps[kind];
        if (!map || !map.points || index < 0) return 0;
        var v = grown(map, index) - amount;
        map.values[index] = v < 0 ? 0 : v;
        map.stamps[index] = ctx.time;
        return map.values[index];
      },

      /**
       * Naechstes stoerendes Tier. Artgenossen stoeren nicht, ausdruecklich
       * ignorierte Arten auch nicht, und was gerade fliegt, wird von der Ente
       * nicht als Bedrohung am Wasser wahrgenommen.
       *
       * Ein *schlafendes* Tier stoert ebenfalls nicht. Das klingt nach einer
       * Feinheit, ist aber der Unterschied zwischen einer Stoerung und einem
       * Dauerzustand: der Waldrand liegt oft keine 90 u vom Ufer entfernt, und
       * ein dort liegendes Reh haette die Enten sonst die ganze Nacht ueber
       * von einer Seite des Teichs zur anderen getrieben.
       */
      nearestDisturber: function (agent, radius, ignore) {
        var best = null;
        var bestDist = radius * radius;
        for (var i = 0; i < agents.length; i++) {
          var other = agents[i];
          if (other === agent || other.speciesId === agent.speciesId) continue;
          if (ignore && ignore.indexOf(other.speciesId) >= 0) continue;
          if (other.flight || other.state === WL.Agents.STATES.schlafen) continue;
          var dx = other.x - agent.x;
          var dy = other.y - agent.y;
          var d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = other; }
        }
        return best;
      },

      /**
       * Naechstes erreichbares Beutetier. Das dritte Gegenstueck zu
       * nearestDisturber, und das erste, das *aktiv sucht* statt zu reagieren:
       * bis zum Fuchs hat kein Tier des Katalogs ein anderes gesucht.
       *
       * Anders als nearestDisturber wird ausdruecklich *nach Arten* gefragt
       * statt gegen eine Groessenschwelle geprueft: wer Beute ist, steht im
       * Katalog beim Raeuber, nicht in einer Zahl.
       *
       * Zwei Zustaende sind ausgenommen, und der Unterschied zwischen ihnen
       * war eine Entwurfsentscheidung:
       *
       * - **`bau` immer.** Ein Kaninchen im Bau ist koerperlich unerreichbar,
       *   fuer jeden Raeuber und zu jeder Zeit. Das gehoert deshalb hierher.
       * - **`schlafen` nur auf Wunsch** (awakeOnly). Schlaf ist keine Mauer:
       *   eine Ente schlaeft am Ufer auf offenem Wasser, und genau die ist der
       *   klassische Fall fuer einen Fuchs. Beim Kaninchen dagegen sagt der
       *   Katalog "nachts schlafen sie tief im Bau, da ignorieren sie sich" -
       *   also fragt der Fuchs dort mit awakeOnly. Eine Regel "Schlafende sind
       *   nie Beute" haette die Entenjagd praktisch abgeschafft, weil die Ente
       *   fast das ganze Wachfenster des Fuchses ueber schlaeft.
       */
      nearestPrey: function (agent, radius, preyIds, awakeOnly) {
        var best = null;
        var bestDist = radius * radius;
        for (var i = 0; i < agents.length; i++) {
          var other = agents[i];
          if (preyIds.indexOf(other.speciesId) < 0) continue;
          if (other.state === WL.Agents.STATES.bau) continue;
          if (awakeOnly && other.state === WL.Agents.STATES.schlafen) continue;
          if (other.flight) continue;
          var dx = other.x - agent.x;
          var dy = other.y - agent.y;
          var d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = other; }
        }
        return best;
      },

      /**
       * Naechster Artgenosse. Das Gegenstueck zu nearestDisturber - beim Reh
       * ist gerade der eigene Artgenosse das, was eine Reaktion ausloest
       * (kurzes Stehenbleiben), waehrend fremde Arten es kaltlassen.
       */
      nearestPeer: function (agent, radius) {
        var best = null;
        var bestDist = radius * radius;
        for (var i = 0; i < agents.length; i++) {
          var other = agents[i];
          if (other === agent || other.speciesId !== agent.speciesId) continue;
          var dx = other.x - agent.x;
          var dy = other.y - agent.y;
          var d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = other; }
        }
        return best;
      },

      /**
       * Das naechste Tier einer genannten Art - *ohne* Ruecksicht auf Zustand
       * und flight-Flag. Die dritte Art, wie ein Tier ein anderes wahrnimmt,
       * und sie ist bewusst die einzige, die durch alle Filter hindurchsieht:
       *
       * - nearestDisturber ist die Reaktion auf eine *Stoerung* und ueberspringt
       *   deshalb, was schlaeft oder fliegt.
       * - nearestPrey ist die Suche eines Raeubers und ueberspringt, was
       *   koerperlich unerreichbar ist.
       * - nearestOfSpecies ist das *Meiden*, und Meiden ist keine Reaktion,
       *   sondern eine Entscheidung: der Barschschwarm legt sein naechstes Ziel
       *   nicht dorthin, wo der Hecht liegt, gerade *weil* der reglos im Kraut
       *   steht und nichts tut. Liefe die Abfrage durch dieselben Filter,
       *   waere der lauernde Hecht unsichtbar - und genau der ist gemeint.
       *
       * Der Radius ist hier nur eine Abkuerzung; wer wirklich zaehlt, entscheidet
       * der Aufrufer (js/sim/perch.js prueft das Gewaesser).
       */
      nearestOfSpecies: function (agent, radius, ids) {
        var best = null;
        var bestDist = radius * radius;
        for (var i = 0; i < agents.length; i++) {
          var other = agents[i];
          if (other === agent || ids.indexOf(other.speciesId) < 0) continue;
          var dx = other.x - agent.x;
          var dy = other.y - agent.y;
          var d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; best = other; }
        }
        return best;
      }
    };

    // ------------------------------------------------------- Durchrechnen
    var recording = WL.Recording.create(totalSlots, sampleCount, sampleSeconds);
    var brains = {};
    for (var a = 0; a < agents.length; a++) brains[agents[a].speciesId] = WL.Brains[agents[a].speciesId];

    for (var step = 0; step < sampleCount; step++) {
      // Der Bruch. Die Nachzuegler entstehen hier - mit ctx.time bereits auf
      // dem Bruch, damit ihre Uhren von hier an laufen und nicht von Tag 0.
      if (step === breakSample && lateAgents.length === 0 && lateIds.length) {
        ctx.time = breakSeconds;
        for (var n = 0; n < lateIds.length; n++) {
          var born = spawnLate(lateIds[n], n);
          if (!born.length) continue;
          var late = born[0];
          late.index = baseCount + lateAgents.length;
          late.partner = -1;      // ein Einzelner hat keinen, auch wenn die Art einen kennt
          brains[late.speciesId] = WL.Brains[late.speciesId];
          lateAgents.push(late);
          agents.push(late);
          recording.backfill(late.index, step, late.x, late.y);
        }
      }

      for (var w = 0; w < totalSlots; w++) {
        if (w < agents.length) recording.write(w, step, agents[w]);
        else recording.writeAbsent(w, step);
      }

      if (step === sampleCount - 1) break;
      for (var t = 0; t < ticksPerSample; t++) {
        ctx.time = step * sampleSeconds + t * tickDt;
        for (var u = 0; u < agents.length; u++) {
          brains[agents[u].speciesId].update(agents[u], ctx, tickDt);
        }
      }
    }

    // Die Nachzuegler haengen *hinten* an der Mischung, statt mitgemischt zu
    // werden. Ihre Kacheln sind damit die letzten - und das ist kein Leck: die
    // Klasse weiss ja, dass drei Tiere dazugekommen sind, und die Nummer
    // verraet weiterhin keine Art. Mitgemischt waeren sie schlimmer, denn dann
    // fehlten in Phase 1 drei Nummern mitten im Raster, und *das* waere ein
    // Hinweis - man koennte die Neuen an ihrer Luecke erkennen, bevor sie da
    // sind.
    var signalOrder = shuffledOrder(baseCount, new WL.Rng(world.seed).fork('signale'));
    for (var L = 0; L < lateAgents.length; L++) signalOrder.push(lateAgents[L].index);

    var result = {
      world: world,
      habitat: habitat,
      land: land,
      agents: agents,
      recording: recording,
      signalOrder: signalOrder,
      duration: (sampleCount - 1) * sampleSeconds,

      // Der Bruch und wer dahinter steht - die Oberflaeche braucht beides, um
      // Phase 1 auf den Startbestand zu beschraenken.
      breakTime: hasBreak ? breakSeconds : null,
      baseCount: baseCount,
      newcomers: lateAgents.map(function (a) { return a.index; }),

      meta: {
        simulationMs: Math.round((now() - started) * 10) / 10,
        ticks: (sampleCount - 1) * ticksPerSample,
        samples: sampleCount,
        agentCount: agents.length
      }
    };

    // Rueckrichtung der Mischung: welche Kachel gehoert zu diesem Tier?
    result.signalOf = new Array(agents.length);
    for (var q = 0; q < result.signalOrder.length; q++) result.signalOf[result.signalOrder[q]] = q;

    // Je Phase ein eigener Vektor. result.features bleibt der von *vor* dem
    // Bruch - das sind genau die justierten Werte aus data/tiere.md §6, und
    // alles, was sie bisher gelesen hat (Kontrollanzeige, simtest), liest
    // damit unveraendert weiter. Was die Nachzuegler angerichtet haben, steht
    // in featuresByPhase[1].
    if (WL.Tracker) {
      result.featuresByPhase = [];
      for (var ph = 0; ph < (hasBreak ? Time.PHASE_COUNT : 1); ph++) {
        result.featuresByPhase.push(WL.Tracker.measure(result, hasBreak ? ph : null));
      }
      result.features = result.featuresByPhase[0];
    } else {
      result.features = null;
    }
    return result;
  }

  /**
   * Die Zuordnung Kachel -> Tier fuer die Signalliste.
   *
   * Die Tiere stehen in agents nach Arten sortiert (erst alle Enten, dann alle
   * Barsche, ...) - naehme die Liste diese Reihenfolge, staenden die Artgruppen
   * als Bloecke untereinander und die Aufgabe waere abgelesen statt geloest.
   * Die Nummern bleiben deshalb sortiert (01, 02, 03 ...), die Tiere dahinter
   * werden gemischt.
   *
   * Gemischt wird aus dem Weltseed, nicht aus Math.random: eine Klasse, die
   * ueber denselben Seed redet, muss auch dieselbe "17" meinen. Ein eigener
   * fork() sorgt dafuer, dass die Mischung keinen der Tierlaeufe verschiebt -
   * dieselbe Welt ergibt mit und ohne Signalliste denselben Tagesverlauf.
   */
  function shuffledOrder(count, rng) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(i);
    for (var k = count - 1; k > 0; k--) {
      var j = Math.floor(rng.next() * (k + 1));
      var tmp = out[k]; out[k] = out[j]; out[j] = tmp;
    }
    return out;
  }

  WL.Simulation = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
