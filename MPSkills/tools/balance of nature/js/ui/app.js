/**
 * Oberflaeche: Karte (Verschieben/Zoomen), Seed, Inselgroesse, Simulation mit
 * Zeitregler, Bestaende, Diagramme, Todesursachen, Startwerte.
 *
 * Der Seed steht in der Adresszeile (#seed=482917&size=mittel) - so laesst
 * sich dieselbe Insel teilen.
 *
 * Zeit: Der Regler bestimmt, wie viele Ticks pro Sekunde gerechnet werden.
 * Gezeichnet wird hoechstens einmal pro Bildschirmbild. Gleicher Seed und
 * gleiche Startwerte ergeben bei jeder Reglerstellung denselben Verlauf.
 */
(function (global) {
  'use strict';

  var BT = global.BT;
  var doc = global.document;
  var $ = function (id) { return doc.getElementById(id); };

  var canvas = $('map');
  var ctx = canvas.getContext('2d');
  var seedInput = $('seed');
  // Groesse und Inseltyp: Knoepfe mit Symbolen, verhalten sich wie ein Auswahlfeld
  // (Groesse: klein = Inselgroesse 'mittel', gross = 'gross')
  function picker(id, attr, value) {
    var buttons = [].slice.call(doc.querySelectorAll('#' + id + ' [data-' + attr + ']'));
    var pick = {
      value: value,
      set: function (v) {
        pick.value = v;
        buttons.forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset[attr] === v)); });
      },
      onPick: function (fn) {
        buttons.forEach(function (b) {
          b.addEventListener('click', function () {
            if (b.dataset[attr] === pick.value) return;
            pick.set(b.dataset[attr]);
            fn();
          });
        });
      }
    };
    return pick;
  }
  var sizeSelect = picker('size', 'size', 'mittel');
  var typeSelect = picker('type', 'type', 'ausgewogen');
  var tooltip = $('tooltip'), legend = $('legend'), legendBtn = $('toggleLegend');
  var status = $('status');
  var seasonBadge = $('season'), hlBadge = $('highlight');
  var SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
  var highlight = null;   // Art-ID, deren Tiere auf der Karte markiert sind
  var follow = null;      // Tier, dem die Kamera folgt
  var followBadge = $('follow'), followText = '';
  var aiming = null;      // Karte, fuer die gerade ein Ziel auf der Karte gewaehlt wird
  var aimUndo = false;    // ... um sie zurueckzunehmen (−)
  var infoCard = null;    // Karte im Infofenster
  var aimBadge = $('aim');
  // Karte: Weidezustand (Standard), reine Landschaft oder eine Nahrungsschicht
  var mapMode = $('mapMode');
  function showPlants() { return mapMode.value === 'weide'; }
  var playBtn = $('play'), speedInput = $('speed'), speedLabel = $('speedLabel'), clock = $('clock');

  var world = null, sim = null, camera = null;
  var dirty = true, dpr = 1;
  var running = false, tickAcc = 0, lastFrame = 0;
  var skipping = false;
  // Startbestand: empfohlen = passend zur Inselgroesse; mit den Reglern aenderbar.
  // Eigene Werte bleiben beim Wechsel des Seeds erhalten, bei anderer Inselgroesse
  // wird wieder auf die Empfehlung gesetzt.
  var startValues = {};
  var recommended = {};
  var customStart = false;
  var startSize = null;

  // Bildpuffer: ganze Insel einmal vorgezeichnet; beim Hineinzoomen zusaetzlich
  // ein scharfer Puffer fuer genau den sichtbaren Ausschnitt.
  var CACHE_MAX_PX = 4096;
  var VIEW_MARGIN = 0.3;    // Rand des scharfen Gelaendeausschnitts (Anteil der kurzen Bildseite)
  var cache = null, viewCache = null;
  var lastInteraction = 0, sharpTimer = null;

  // ---------------------------------------------------------------- Welt und Simulation
  function readHash() {
    var out = {};
    global.location.hash.replace(/^#/, '').split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) out[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }

  function writeHash(seed, size, type) {
    var hash = '#seed=' + seed + '&size=' + size + '&typ=' + type;
    if (global.history && global.history.replaceState) global.history.replaceState(null, '', hash);
    else global.location.hash = hash;
  }

  function load(seed, size, type) {
    status.textContent = 'erzeuge Insel …';
    setRunning(false);
    global.setTimeout(function () {
      world = BT.World.generate(seed, { size: size, type: type });
      seedInput.value = seed;
      sizeSelect.set(world.size);
      typeSelect.set(world.type);
      writeHash(seed, world.size, world.type);
      if (!camera) camera = new BT.Camera(world);
      else camera.setWorld(world);
      resize();
      cache = buildCache(world);
      viewCache = null;
      buildLegend();
      restart();
      status.textContent = world.cols + ' × ' + world.rows + ' Zellen · ' + world.meta.generationMs + ' ms';
      // Raum und Schaufenster (js/ui/room.js, js/ui/demo.js) setzen hier ihren Startbestand
      if (BT.app.onWorld) BT.app.onWorld(world);
    }, 10);
  }

  function restart() {
    if (!world) return;
    recommended = BT.Simulation.defaultStart(world);
    if (startSize !== world.size) { customStart = false; startSize = world.size; }
    if (!customStart) startValues = Object.assign({}, recommended);
    syncStartSliders();
    sim = new BT.Simulation(world, { start: startValues, cardPause: BT.Time.years(+$('cardPause').value) });
    if (chartView) chartView.events = sim.events;
    setAim(null);
    setFollow(null);
    tickAcc = 0;
    updatePanel(true);
    dirty = true;
  }

  /** Regler und Anzeigen an startValues/recommended angleichen. */
  // Startbestand gibt es nur fuer die Arten der Insel; Schafe und Hunde kommen mit den Menschen
  var NATIVE = BT.SPECIES_ORDER.filter(function (id) { return !BT.SPECIES[id].introduced; });

  function syncStartSliders() {
    NATIVE.forEach(function (id) {
      var rec = recommended[id] || BT.SPECIES[id].start;
      var max = Math.max(6, Math.ceil(rec * 3 / 2) * 2);
      var inp = doc.querySelector('#startInputs input[data-id="' + id + '"]');
      inp.max = max;
      inp.value = startValues[id];
      $('mark-' + id).style.left = 'calc(8px + (100% - 16px) * ' + (rec / max) + ')';
      $('sv-' + id).textContent = startValues[id];
      $('sv-' + id).classList.toggle('changed', startValues[id] !== rec);
      $('rec-' + id).textContent = 'empf. ' + rec;
    });
  }

  /** Startbestand geaendert: gilt ab dem naechsten Neustart (Knopf im Fenster). */
  function startValuesChanged() {
    customStart = BT.SPECIES_ORDER.some(function (id) { return startValues[id] !== recommended[id]; });
    syncStartSliders();
  }

  // ---------------------------------------------------------------- Zeit
  /** Regler 0..100 -> Ticks pro Sekunde, logarithmisch von 2 bis 2000 (~5 Jahre/s). */
  function ticksPerSecond() {
    return 2 * Math.pow(10, speedInput.value / 100 * 3);
  }

  // Zeitlupe, solange ein Schiff faehrt: Es soll zu sehen sein. Aendert nur das
  // Tempo, nicht den Verlauf.
  var SLOW_TPS = 8;
  function tickRate() {
    var tps = ticksPerSecond();
    return sim && sim.humans.busy() ? Math.min(tps, SLOW_TPS) : tps;
  }

  function updateSpeedLabel() {
    var daysPerSec = ticksPerSecond() / BT.Time.TICKS_PER_DAY;
    var text;
    if (daysPerSec < 1) text = (1 / daysPerSec).toFixed(1).replace('.', ',') + ' s pro Tag';
    else if (daysPerSec < BT.Time.DAYS_PER_YEAR / 2) text = Math.round(daysPerSec) + ' Tage/s';
    else text = (daysPerSec / BT.Time.DAYS_PER_YEAR).toFixed(1).replace('.', ',') + ' Jahre/s';
    speedLabel.textContent = text;
  }

  function setRunning(on) {
    running = on && !!sim;
    playBtn.textContent = running ? '⏸ Pause' : '▶ Start';
    lastFrame = 0;
  }

  /** Ohne Zeichnen vorspulen, in Haeppchen, damit die Seite bedienbar bleibt. */
  function skipYears(years) {
    if (!sim || skipping) return;
    var wasRunning = running;
    setRunning(false);
    skipping = true;
    var targetDay = sim.day + years * BT.Time.DAYS_PER_YEAR;
    $('skip').disabled = true;
    (function chunk() {
      var t0 = global.performance.now();
      while (sim.day < targetDay && global.performance.now() - t0 < 40) sim.runDays(1);
      clock.textContent = BT.Time.label(sim.day) + ' · spule vor …';
      updatePanel(true);
      dirty = true;
      if (sim.day < targetDay) global.setTimeout(chunk, 0);
      else {
        skipping = false;
        $('skip').disabled = false;
        setRunning(wasRunning);
        updatePanel(true);
      }
    })();
  }

  // ---------------------------------------------------------------- Zeichnen
  function resize() {
    dpr = global.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    if (camera) camera.setViewport(rect.width, rect.height);
    viewCache = null;
    dirty = true;
  }

  function buildCache(w) {
    var scale = Math.min(2, CACHE_MAX_PX / w.width, CACHE_MAX_PX / w.height);
    var c = doc.createElement('canvas');
    c.width = Math.ceil(w.width * scale);
    c.height = Math.ceil(w.height * scale);
    var cc = c.getContext('2d');
    cc.setTransform(scale, 0, 0, scale, 0, 0);
    BT.TerrainRenderer.draw(cc, w, { x: 0, y: 0, width: w.width, height: w.height }, scale);
    return { canvas: c, scale: scale };
  }

  function interacted() {
    lastInteraction = global.performance.now();
    dirty = true;
    if (sharpTimer) global.clearTimeout(sharpTimer);
    sharpTimer = global.setTimeout(function () { dirty = true; }, 180);
  }

  function setWorldTransform(c) {
    c.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, -camera.x * camera.scale * dpr, -camera.y * camera.scale * dpr);
  }

  /**
   * Gelaende: in der Gesamtansicht aus dem Bildpuffer der ganzen Welt, beim
   * Hineinzoomen scharf neu gezeichnet. Der scharfe Ausschnitt hat einen Rand,
   * damit eine mitlaufende Kamera (Tier folgen) ihn eine Weile weiterverwenden kann.
   */
  function drawTerrain() {
    var needSharp = camera.scale * dpr > cache.scale * 1.1;
    var idle = global.performance.now() - lastInteraction > 150;
    if (needSharp && idle) {
      var view = camera.visibleRect(0);
      var v = viewCache;
      var fits = v && v.scale === camera.scale && v.cw === canvas.width && v.ch === canvas.height &&
        view.x >= v.rect.x && view.y >= v.rect.y &&
        view.x + view.width <= v.rect.x + v.rect.width && view.y + view.height <= v.rect.y + v.rect.height;
      if (!fits) {
        var rect = camera.visibleRect(Math.min(view.width, view.height) * VIEW_MARGIN);
        var c = v ? v.canvas : doc.createElement('canvas');
        c.width = Math.ceil(rect.width * camera.scale * dpr);
        c.height = Math.ceil(rect.height * camera.scale * dpr);
        var vc = c.getContext('2d');
        vc.setTransform(1, 0, 0, 1, 0, 0);
        vc.fillStyle = BT.PALETTE.background;
        vc.fillRect(0, 0, c.width, c.height);
        var k = camera.scale * dpr;
        vc.setTransform(k, 0, 0, k, -rect.x * k, -rect.y * k);
        BT.TerrainRenderer.draw(vc, world, rect, camera.scale);
        viewCache = v = { canvas: c, rect: rect, scale: camera.scale, cw: canvas.width, ch: canvas.height };
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(v.canvas, Math.round((v.rect.x - camera.x) * camera.scale * dpr),
        Math.round((v.rect.y - camera.y) * camera.scale * dpr));
      setWorldTransform(ctx);
    } else {
      setWorldTransform(ctx);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cache.canvas, 0, 0, world.width, world.height);
    }
  }

  /** Position im Jahr in Jahreszeiten (0..4), stufenlos zwischen den Ticks. */
  function seasonPos(alpha) {
    var T = BT.Time;
    var days = sim.day % T.DAYS_PER_YEAR + ((sim.tick % T.TICKS_PER_DAY) + (alpha < 1 ? alpha : 0)) / T.TICKS_PER_DAY;
    return days / T.DAYS_PER_SEASON;
  }

  /** Haerte des Winters, der gerade liegt (im Fruehling: der vom Vorjahr). */
  function winterHardness(pos) {
    var y = Math.floor(sim.day / BT.Time.DAYS_PER_YEAR) - (pos < 1 ? 1 : 0);
    return y < 0 ? BT.WEATHER.winter[0] : sim.weather.year(y).winter;
  }

  function updateSeasonBadge() {
    var c = BT.Time.calendar(sim.day);
    seasonBadge.textContent = SEASON_ICON[c.season] + ' ' + c.seasonName;
    seasonBadge.dataset.season = c.season;
  }

  // ---------------------------------------------------------------- Hervorheben einer Art
  /** Klick auf eine Kachel: alle Tiere dieser Art auf der Karte markieren (nochmal: aus). */
  function setHighlight(id) {
    highlight = id && id !== highlight ? id : null;
    var tiles = doc.querySelectorAll('#tiles .tile');
    for (var i = 0; i < tiles.length; i++) {
      var on = tiles[i].dataset.id === highlight;
      tiles[i].classList.toggle('active', on);
      tiles[i].setAttribute('aria-pressed', String(on));
    }
    if (highlight) {
      var s = BT.SPECIES[highlight] || BT.RATS;
      hlBadge.innerHTML = '<i style="background:' + SERIES_COLOR[highlight] + '"></i>' + s.plural +
        ' hervorgehoben <span id="hlCount"></span> <button type="button" aria-label="Hervorhebung aufheben">✕</button>';
      updateHighlightCount();
    }
    hlBadge.hidden = !highlight;
    dirty = true;
  }

  // ---------------------------------------------------------------- Einem Tier folgen
  var FOLLOW_ZOOM = 5;   // so weit (mal Gesamtansicht) wird beim Folgen mindestens hineingezoomt

  /** Kamera folgt einem Tier (null: nicht mehr folgen). */
  function setFollow(a) {
    follow = a || null;
    followText = '';
    if (follow && camera && camera.scale < camera.minScale * FOLLOW_ZOOM) {
      camera.scale = Math.min(camera.maxScale, camera.minScale * FOLLOW_ZOOM);
      interacted();
    }
    followBadge.hidden = !follow;
    dirty = true;
  }

  /** Kamera auf das verfolgte Tier setzen; stirbt es, bleibt die Kamera stehen. */
  function trackFollow(alpha) {
    if (!follow || !camera) return;
    if (!follow.alive) {
      followBadge.innerHTML = '<span>' + follow.spec.name + ' ist gestorben</span> <button type="button" aria-label="Schließen">✕</button>';
      follow = null;
      return;
    }
    var a = follow;
    var x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha;
    camera.x = x - camera.viewWidth / camera.scale / 2;
    camera.y = y - camera.viewHeight / camera.scale / 2;
    camera.clampPosition();
    var text = animalText(a);
    if (text !== followText) {
      followText = text;
      followBadge.innerHTML = '<i style="background:' + SERIES_COLOR[a.spec.id] + '"></i><span>Kamera folgt: ' + text +
        '</span> <button type="button" aria-label="Nicht mehr folgen">✕</button>';
    }
  }

  function updateHighlightCount() {
    var el = $('hlCount');
    if (!el || !sim || !highlight) return;
    var row = sim.stats.latest();
    el.textContent = '(' + (highlight === 'ratten' ? '≈ ' + row.ratten.toLocaleString('de-DE') : row.count[highlight]) + ')';
  }

  function frame(now) {
    if (running && sim && !skipping) {
      if (lastFrame) {
        var dt = Math.min(0.25, (now - lastFrame) / 1000);
        tickAcc += dt * tickRate();
        var t0 = global.performance.now();
        var dayBefore = sim.day;
        // Rechnen mit Zeitbudget: reicht die Zeit nicht, laeuft es langsamer, aber gleich
        while (tickAcc >= 1 && global.performance.now() - t0 < 30) { sim.step(); tickAcc -= 1; }
        if (tickAcc > 1) tickAcc = 1;
        if (sim.day !== dayBefore) updatePanel(false);
      }
      lastFrame = now;
      dirty = true;
    }
    if (dirty && world && camera && cache) {
      dirty = false;
      var alpha = lastAlpha = running && tickRate() <= 90 ? Math.min(1, tickAcc) : 1;
      trackFollow(alpha);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BT.PALETTE.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawTerrain();
      if (sim) BT.LanduseRenderer.draw(ctx, sim, camera.visibleRect(0), camera.scale);
      if (sim) {
        var spos = seasonPos(alpha);
        BT.SeasonRenderer.draw(ctx, world, spos, winterHardness(spos), camera.scale);
      }
      // nach den Jahreszeiten, sonst faerbt der Fruehling den kahlen Boden gruen
      if (sim && showPlants()) BT.PlantRenderer.draw(ctx, world, sim);
      else if (sim) BT.FoodOverlay.draw(ctx, sim, mapMode.value);
      BT.HumanRenderer.drawGround(ctx, sim, camera.visibleRect(0), camera.scale, alpha);
      if (sim) BT.RatRenderer.draw(ctx, sim, camera.visibleRect(0), camera.scale, alpha,
        { highlight: highlight, highlightColor: highlight && SERIES_COLOR[highlight] });
      BT.AgentRenderer.draw(ctx, sim, camera.visibleRect(0), camera.scale, alpha,
        { highlight: highlight, highlightColor: highlight && SERIES_COLOR[highlight], follow: follow });
      BT.HumanRenderer.drawSea(ctx, sim, camera.visibleRect(0), camera.scale, alpha);
    }
    global.requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- Seitenleiste
  var SERIES_COLOR = {
    zwerghirsch: '#d95926', laufvogel: '#3987e5', inselwolf: '#9085e9', inseladler: '#c98500',
    schaf: '#d03fc8', hund: '#c4163f', ratten: '#8ccf1f',
    gras: '#199e70', frucht: '#e66767', laub: '#008300', insekten: '#d55181',
    korn: '#c9a227', kornMoeglich: '#efe2a0', gefressen: '#d95926'
  };
  var charts = [], bigCharts = [], chartView = null;
  // Raum in MPSkills (js/ui/room.js)
  var ROOM = /(^|[?&])(raum|demo)=/.test(global.location.search.slice(1));
  // Schichten mit Pflanzenzustand (Gras, Laub, ... - je nach Artentabelle)
  var HEALTH_KEYS = BT.FOOD_ORDER.filter(function (k) { return BT.FOOD[k].damage; });
  var lastPanelUpdate = 0;

  /**
   * Was alle Aecker heute tragen koennen (100 % im Ackerdiagramm), aus dem letzten Tag mit Acker. Fuer die ganze
   * Kurve dasselbe: Mit dem zweiten Acker rutscht alles davor auf 50 %, mit dem dritten auf 33 %.
   */
  var cropCapCache = { len: -1, hist: null, cap: 0 };
  function cropCap() {
    var h = sim ? sim.stats.history : null;
    if (!h) return 0;
    if (cropCapCache.hist === h && cropCapCache.len === h.length) return cropCapCache.cap;
    var cap = 0;
    for (var i = h.length - 1; i >= 0 && !cap; i--) if (h[i].crop) cap = h[i].crop.cap;
    cropCapCache = { hist: h, len: h.length, cap: cap };
    return cap;
  }

  function makeCharts(box, allowMean) {
    // Die Erklaerung in Klammern steht nur in der Grossansicht (allowMean), die Seitenleiste bleibt knapp
    var big = !!allowMean;
    // Im Raum gibt es das Jahresmittel auch in der Seitenleiste (und es ist am Anfang an)
    allowMean = allowMean || ROOM;
    function series(ids, get) {
      return ids.map(function (id) { return { sp: id, label: (BT.SPECIES[id] || BT.FOOD[id]).plural || BT.FOOD[id].name, color: SERIES_COLOR[id], get: get(id) }; });
    }
    var count = function (id) { return function (r) { return r.count[id]; }; };
    return [
      // Ratten (eco/rats.js) sind viel zahlreicher: die Linie ist durch 20 geteilt, die Legende nennt die echte Zahl
      new BT.LineChart(box, { view: chartView, allowMean: allowMean, title: big ? 'Pflanzenfresser (Linie der Ratten durch 20 geteilt)' : 'Pflanzenfresser',
        series: series(['zwerghirsch', 'laufvogel', 'schaf'], count).concat([
          { sp: 'ratten', label: 'Ratten', color: SERIES_COLOR.ratten, scale: 20, get: function (r) { return (r.ratten || 0) / 20; } }]) }),
      new BT.LineChart(box, { view: chartView, allowMean: allowMean, title: 'Räuber', series: series(['inselwolf', 'inseladler', 'hund'], count) }),
      new BT.LineChart(box, {
        view: chartView, allowMean: allowMean, title: big ? 'Nahrung (100 % = unberührte Insel)' : 'Nahrung', percent: true,
        series: ['gras', 'frucht', 'laub', 'insekten'].map(function (k) {
          // Mastjahre (Wetter, bis 2,4-fach) abschneiden: Rodung und Acker koennen Fruechte nur mindern,
          // und die Achse waechst nur, wenn der Mensch Flaeche dazugibt (Wiese: mehr Gras)
          var cap = BT.FOOD[k].mast ? 1 : Infinity;
          return { label: BT.FOOD[k].name, color: SERIES_COLOR[k], get: function (r) { return Math.min(cap, r.food[k]); } };
        })
      }),
      new BT.LineChart(box, {
        view: chartView, allowMean: allowMean, title: big ? 'Zustand der Pflanzen (100 % = unberührte Insel, sinkt bei Übernutzung, Rodung und Acker)' : 'Zustand der Pflanzen', percent: true,
        series: HEALTH_KEYS.map(function (k) {
          return { label: BT.FOOD[k].name, color: SERIES_COLOR[k], get: function (r) { return r.health && r.health[k] != null ? r.health[k] : 1; } };
        })
      }),
      // Erst mit dem ersten Acker sichtbar. Unten das Getreide, das wirklich steht, darueber (gestrichelt), was
      // ohne Fressen gestanden haette; die Flaeche dazwischen haben Tiere gefressen. Mit der Ernte faellt alles
      // auf 0. 100 % sind alle Aecker von heute, auch rueckwirkend: kommt ein Acker dazu, rutscht die Zeit davor nach unten (1 Acker = 50 %)
      new BT.LineChart(box, {
        view: chartView, allowMean: allowMean, title: big ? 'Äcker: Getreide und Fraßschaden (100 % = alle heutigen Äcker)' : 'Äcker: Getreide und Fraßschaden', percent: true,
        when: function (s) { return s.humans && s.humans.fields.length > 0; },
        series: [
          { label: 'ohne Fressen', color: SERIES_COLOR.kornMoeglich, dash: [5, 4], get: function (r) { return r.crop ? r.crop.could / cropCap() : 0; } },
          { label: 'real', color: SERIES_COLOR.korn, get: function (r) { return r.crop ? r.crop.ripe / cropCap() : 0; } },
          { label: 'gefressen', color: SERIES_COLOR.gefressen, between: [0, 1], get: function (r) { return r.crop ? (r.crop.could - r.crop.ripe) / cropCap() : 0; } }
        ]
      })
    ];
  }

  /** Eine Art gehoert zur Insel, wenn sie mit Startbestand begann oder je da war (Ratten: sobald das Feld laeuft). */
  function present(id) {
    if (id === 'ratten') return sim.rats.day != null;
    return sim.startCounts[id] > 0 || !!sim.stats.seen[id];
  }

  function updateCharts() {
    if (!sim) return;
    var h = sim.stats.history;
    var all = charts.concat(bigCharts);
    for (var c = 0; c < all.length; c++) {
      var ch = all[c];
      if (!ch.allSeries) ch.allSeries = ch.opts.series;
      if (ch.allSeries.some(function (x) { return x.sp; })) {
        var cur = ch.allSeries.filter(function (x) { return !x.sp || present(x.sp); });
        if (cur.length !== ch.opts.series.length || cur.some(function (x, j) { return x !== ch.opts.series[j]; })) ch.setSeries(cur);
      }
      if (ch.opts.when) ch.root.hidden = !ch.opts.when(sim);
    }
    for (var i = 0; i < charts.length; i++) charts[i].update(h);
    if (bigOpen()) for (i = 0; i < bigCharts.length; i++) bigCharts[i].update(h);
  }

  // Grossansicht: alle Diagramme ueber die volle Breite untereinander
  var bigBox = $('bigView');
  function bigOpen() { return !bigBox.hidden; }
  function setBig(open) {
    bigBox.hidden = !open;
    $('openBig').setAttribute('aria-expanded', String(open));
    chartView.setHover(null, null);
    if (open) { updateCharts(); $('closeBig').focus(); }
  }

  /** Kachelbilder aus den geladenen Sprites (aufgehellt wie auf der Karte). */
  function drawTileImages() {
    var canvases = doc.querySelectorAll('#tiles .tile-img');
    for (var i = 0; i < canvases.length; i++) {
      var c = canvases[i], img = c.dataset.id === 'ratten' ? BT.RatRenderer.image() : BT.Sprites.get(c.dataset.id, 'm', 'stand');
      if (!img) continue;
      var ctx = c.getContext('2d');
      var k = Math.min(c.width / img.width, c.height / img.height);
      var w = img.width * k, h = img.height * k;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    }
  }

  // ---------------------------------------------------------------- Karten (Menschen)
  /** Je Karte: antippen fuer die Erklaerung, darunter − Anzahl +. */
  function buildCards() {
    $('cards').innerHTML = BT.CARD_ORDER.map(function (id) {
      var c = BT.CARDS[id];
      return '<div class="card ' + c.kind + (c.soon ? ' soon' : '') + '" data-id="' + id + '">' +
        '<button type="button" class="card-face" data-act="info" title="' + c.name + ': Was macht die Karte?">' +
        (c.image ? '<img class="card-img" src="' + c.image + '" alt="">' : '<span class="card-icon">' + c.icon + '</span>') + '<span class="card-name">' + c.name + '</span></button>' +
        '<div class="card-ctl"><button type="button" class="card-minus" data-act="minus" aria-label="' + c.name + ' zurücknehmen">−</button>' +
        '<span class="card-count" id="cc-' + id + '">0</span>' +
        '<button type="button" class="card-plus" data-act="plus" aria-label="' + c.name + ' spielen">+</button></div></div>';
    }).join('');
  }

  function sheepOnPastures(H) {
    var n = 0;
    for (var i = 0; i < H.pastures.length; i++) n += H.pastures[i].sheep.length;
    return n;
  }

  function hunters(H, kind) {
    return H.hunters.filter(function (h) { return h.kind === kind; }).length;
  }

  function bagOf(H, ids) {
    return ids.reduce(function (n, id) { return n + (H.bag[id] || 0); }, 0);
  }

  function updateCards() {
    if (!sim) return;
    BT.CARD_ORDER.forEach(function (id) {
      var c = BT.CARDS[id];
      var el = doc.querySelector('#cards .card[data-id="' + id + '"]');
      var blocked = sim.cardBlocked(id), undoBlocked = sim.undoBlocked(id);
      var plus = el.querySelector('.card-plus'), minus = el.querySelector('.card-minus');
      plus.disabled = !!blocked;
      plus.title = blocked ? 'Spielen: ' + blocked : 'Spielen: ' + c.name;
      minus.disabled = !!undoBlocked;
      minus.title = undoBlocked ? 'Zurücknehmen: ' + undoBlocked : 'Zurücknehmen: ' + c.name;
      el.classList.toggle('aiming', aiming === id);
      el.classList.toggle('playable', !blocked);
      var n = sim.cardCount(id);
      $('cc-' + id).textContent = n;
      el.classList.toggle('active', n > 0);
    });
    if (infoCard) updateInfo();
    var H = sim.humans, lu = sim.landuse;
    var last = H.harvests.length ? H.harvests[H.harvests.length - 1] : null;
    var stats = [
      [H.people.length, 'Siedler'],
      [H.villages.length, H.villages.length === 1 ? 'Dorf' : 'Dörfer'],
      [H.houses.length, H.houses.length === 1 ? 'Haus' : 'Häuser'],
      [H.fields.length, H.fields.length === 1 ? 'Acker' : 'Äcker'],
      [sheepOnPastures(H), 'Schafe auf ' + (H.pastures.length === 1 ? 'der Weide' : H.pastures.length + ' Weiden')],
      [H.dogs.length, 'Hütehunde'],
      [pct(lu.counts.gerodet / lu.woodyCells), 'des Waldes gerodet'],
      [pct(H.usedShare), 'der Insel regelmäßig von Menschen genutzt'],
      [last ? pct(last.share) : '–', 'der letzten Ernte von Tieren gefressen']
    ];
    if (H.huntersKept.wolf || H.huntersKept.wild) {
      stats.push(
        [hunters(H, 'wild') + ' / ' + hunters(H, 'wolf'), 'Jäger / Wolfsjäger'],
        [bagOf(H, ['zwerghirsch', 'laufvogel', 'schaf']), 'Wild erlegt'],
        [bagOf(H, ['inselwolf', 'hund']), 'Wölfe und Hunde erlegt'],
        [H.attacks.total + ' / ' + H.attacks.hunters, 'Angriffe von Wölfen / Menschen getötet']);
    }
    if (H.huntersKept.sammel) {
      stats.push(
        [hunters(H, 'sammel'), 'Sammler'],
        [Math.round(H.gathered / BT.HUMANS.gather.basket), 'Körbe Früchte gesammelt']);
      if (!H.huntersKept.wolf && !H.huntersKept.wild) stats.push([H.attacks.total + ' / ' + H.attacks.hunters, 'Angriffe von Wölfen / Menschen getötet']);
    }
    $('peopleStats').innerHTML = !H.houses.length
      ? '<p class="ps-empty">' + (H.ships.length ? 'Ein Schiff ist unterwegs …' : sim.played('landung') ? 'Die Siedler haben die Insel verlassen.' : 'Noch keine Menschen auf der Insel. Spiele die Karte „Landung“.') + '</p>'
      : stats.map(function (st) { return '<div class="ps"><b>' + st[0] + '</b><span>' + st[1] + '</span></div>'; }).join('');
    // Wann darf die naechste Karte gespielt werden?
    var next = $('nextCard'), nd = sim.nextCardDay();
    var sailing = !H.villages.length && sim.cardCount('landung') > 0;
    var ready = !sailing && sim.day >= nd;
    next.textContent = sailing ? 'Das Schiff ist unterwegs …'
      : !H.villages.length ? 'Zuerst: Landung'
      : ready ? 'Nächste Karte: jetzt' : 'Nächste Karte: ' + BT.Time.label(nd).replace(' · ', ', ');
    next.classList.toggle('ready', !!ready);
    // Am Reiter zeigen, dass wieder eine Karte gespielt werden darf
  }

  // ---------------------------------------------------------------- Seitenleiste
  // Bereiche einklappen, Leiste breit (zwei Spalten), Fenster fuer den Neustart.
  function store(key, val) {
    try { if (val === undefined) return global.localStorage.getItem('biotop.' + key); global.localStorage.setItem('biotop.' + key, val); } catch (e) { /* ohne Speicher */ }
    return null;
  }

  function setFold(sec, open) {
    sec.classList.toggle('closed', !open);
    sec.querySelector('.fold-toggle').setAttribute('aria-expanded', String(open));
    store('fold2.' + sec.dataset.fold, open ? '1' : '0');
    if (open && chartView) chartView.drawAll();
  }

  function setWide(wide) {
    doc.body.classList.toggle('wide', wide);
    $('widen').setAttribute('aria-pressed', String(wide));
        // "Menschen auf der Insel" gehoert thematisch unter die Karten: im breiten Modus links
    var insel = doc.querySelector('.fold[data-fold="insel"]');
    if (wide) doc.querySelector('.col-l').appendChild(insel);
    else doc.querySelector('.col-r').insertBefore(insel, doc.querySelector('.fold-plain'));
    store('wide', wide ? '1' : '0');
    resize();
    if (chartView) chartView.drawAll();
    dirty = true;
  }

  function setRestartBox(open) {
    $('restartBox').hidden = !open;
    $('openRestart').setAttribute('aria-expanded', String(open));
  }

  function initPanel() {
    doc.querySelectorAll('.panel .fold').forEach(function (sec) {
      var saved = store('fold2.' + sec.dataset.fold);
      var open = saved === null ? !sec.dataset.closed : saved === '1';
      sec.classList.toggle('closed', !open);
      sec.querySelector('.fold-toggle').setAttribute('aria-expanded', String(open));
    });
    $('widen').addEventListener('click', function () { setWide(!doc.body.classList.contains('wide')); });
    $('openRestart').addEventListener('click', function () { setRestartBox($('restartBox').hidden); });
    $('restartClose').addEventListener('click', function () { setRestartBox(false); });
    doc.querySelector('.panel').addEventListener('click', function (e) {
      var t = e.target.closest('.fold-toggle');
      if (!t) return;
      var sec = t.closest('.fold');
      setFold(sec, sec.classList.contains('closed'));
    });
    if (store('wide') === '1') setWide(true);
  }

  function pct(v) {
    return (v < 0.1 ? (v * 100).toFixed(1).replace('.', ',') : Math.round(v * 100)) + ' %';
  }

  function updateChronicle() {
    if (!sim) return;
    function title(ev) {
      var c = BT.CARDS[ev.card];
      return ev.undo ? '↩ ' + c.icon + ' ' + c.name + ' zurückgenommen' : c.icon + ' ' + c.name;
    }
    var items = sim.events.map(function (ev) {
      return '<li' + (ev.undo ? ' class="undo"' : '') + '><span class="when">' + BT.Time.label(ev.day).replace(' · ', ', ') + '</span><span>' + title(ev) +
        (ev.at && ev.at.text ? '<small>' + ev.at.text + '</small>' : '') + '</span></li>';
    }).reverse();
    sim.pending.forEach(function (ev) {
      items.unshift('<li class="pending"><span class="when">gleich</span><span>' + title(ev) + '</span></li>');
    });
    $('chronicle').innerHTML = items.join('');
  }

  /**
   * Karte spielen (+) oder zuruecknehmen (−): Muss man dafuer auf die Insel
   * klicken (Kueste, oder welches Dorf), erst zielen, sonst sofort.
   */
  function chooseCard(id, undo) {
    if (!sim || (undo ? sim.undoBlocked(id) : sim.cardBlocked(id))) return;
    if (aiming === id && aimUndo === !!undo) { setAim(null); return; }
    if (sim.cardTarget(id, undo)) setAim(id, null, undo);
    else playCard(id, {}, undo);
  }

  function setAim(id, error, undo) {
    aiming = id;
    aimUndo = !!(id && undo);
    canvas.classList.toggle('aiming', !!id);
    if (id) {
      var c = BT.CARDS[id];
      var hint = sim.cardTarget(id, undo) === 'dorf'
        ? (undo ? 'Klicke auf das Dorf, in dem du „' + c.name + '“ zurücknimmst.' : 'Klicke auf das Dorf, für das die Karte gilt.')
        : c.hint;
      aimBadge.innerHTML = (aimUndo ? '− ' : '') + c.icon + ' ' + (error || hint) + '<small>Esc oder nochmal ' + (aimUndo ? '−' : '+') + ' antippen: abbrechen</small>';
      aimBadge.classList.toggle('error', !!error);
    }
    aimBadge.hidden = !id;
    updateCards();
  }

  function playCard(id, params, undo) {
    var err = undo ? sim.unplay(id, params) : sim.play(id, params);
    if (err) { setAim(id, err, undo); return err; }
    setAim(null);
    // Das Schiff soll man fahren sehen: die Zeit laeuft los
    if (!undo && !running && !skipping) setRunning(true);
    updateCards();
    updateChronicle();
    return null;
  }

  // ---------------------------------------------------------------- Infofenster einer Karte
  function openInfo(id) {
    infoCard = id;
    var c = BT.CARDS[id];
    $('ciTitle').textContent = c.icon + ' ' + c.name;
    $('ciText').textContent = c.more || c.text;
    $('ciUndo').textContent = c.undo || '';
    $('ciUndoHead').hidden = !c.undo;
    $('cardInfo').hidden = false;
    BT.CardInfo.draw($('ciImage'), id);
    updateInfo();
    $('ciClose').focus();
  }

  function closeInfo() {
    infoCard = null;
    $('cardInfo').hidden = true;
  }

  function updateInfo() {
    var id = infoCard, c = BT.CARDS[id];
    var blocked = c.soon ? 'Kommt bald' : sim.cardBlocked(id), undoBlocked = c.soon ? 'Kommt bald' : sim.undoBlocked(id);
    var n = sim.cardCount(id);
    $('ciCount').textContent = n;
    $('ciPlus').disabled = !!blocked;
    $('ciMinus').disabled = !!undoBlocked;
    $('ciState').textContent = c.soon ? 'Diese Karte kommt bald.'
      : (n ? 'Gerade ' + n + '× im Spiel. ' : 'Noch nicht im Spiel. ') + (blocked ? 'Spielen: ' + blocked + '.' : '');
  }

  function buildPanel() {
    // Kacheln je Art
    var tiles = $('tiles');
    tiles.innerHTML = BT.SPECIES_ORDER.map(function (id) {
      var s = BT.SPECIES[id];
      return '<div class="tile" role="button" tabindex="0" aria-pressed="false" data-id="' + id + '" title="Alle ' + s.plural + ' auf der Karte zeigen">' +
        '<canvas class="tile-img" width="76" height="66" data-id="' + id + '"></canvas><div><div class="tile-name">' +
        '<i style="background:' + SERIES_COLOR[id] + '"></i>' + s.plural + '</div>' +
        '<div class="tile-count" id="count-' + id + '">–</div><div class="tile-sub" id="sub-' + id + '"></div></div></div>';
    }).join('') +
      // Ratten: keine Art der Tabelle, sondern ein Feld (eco/rats.js); erscheinen mit der Karte
      '<div class="tile" role="button" tabindex="0" aria-pressed="false" data-id="ratten" title="Alle Ratten auf der Karte zeigen" hidden>' +
      '<canvas class="tile-img" width="76" height="66" data-id="ratten"></canvas><div><div class="tile-name">' +
      '<i style="background:' + SERIES_COLOR.ratten + '"></i>' + BT.RATS.plural + '</div>' +
      '<div class="tile-count" id="count-ratten">–</div><div class="tile-sub" id="sub-ratten"></div></div></div>';

    // Diagramme: kleine in der Seitenleiste, grosse in der Grossansicht.
    // Beide teilen Zeitraum und Fadenkreuz.
    chartView = new BT.ChartView();
    chartView.rangeButtons($('chartTools'));
    chartView.rangeButtons($('bigTools'));
    charts = makeCharts($('charts'));
    bigCharts = makeCharts($('bigCharts'), true);
    chartView.meanButton($('bigTools'));
    if (ROOM) { chartView.meanButton($('chartTools')); chartView.setMean(true); }
    // Bei geaendertem Zeitraum stehen die neuen Werte sofort in der Legende
    chartView.onRange(function () { updateCharts(); });
    buildCards();

    // Startbestand: ein Regler je Art, die Empfehlung ist als Strich markiert
    $('startInputs').innerHTML = NATIVE.map(function (id) {
      return '<div class="sv"><span class="sv-name"><i style="background:' + SERIES_COLOR[id] + '"></i>' + BT.SPECIES[id].plural + '</span>' +
        '<small id="rec-' + id + '" class="sv-rec"></small><b id="sv-' + id + '" class="sv-value"></b>' +
        '<div class="sv-track"><input type="range" min="0" step="1" data-id="' + id + '" aria-label="Startbestand ' + BT.SPECIES[id].plural + '">' +
        '<span class="sv-mark" id="mark-' + id + '"></span></div></div>';
    }).join('');
  }

  function updatePanel(force) {
    if (!sim) return;
    var now = global.performance.now();
    clock.textContent = BT.Time.label(sim.day);
    $('weather').textContent = BT.Weather.describe(sim.weatherNow);
    updateSeasonBadge();
    if (!force && now - lastPanelUpdate < 250) return;
    lastPanelUpdate = now;
    var row = sim.stats.latest();
    BT.SPECIES_ORDER.forEach(function (id) {
      // Eingeschleppte Arten erscheinen erst, wenn sie auf der Insel sind
      var tile = doc.querySelector('#tiles .tile[data-id="' + id + '"]');
      tile.hidden = !present(id);
      $('count-' + id).textContent = row.count[id];
      var g = row.groups[id];
      var kind = { herd: ['Herde', 'Herden'], flock: ['Gruppe', 'Gruppen'], pack: ['Rudel', 'Rudel'], pair: ['Paar/Revier', 'Paare/Reviere'] }[BT.SPECIES[id].group.kind];
      $('sub-' + id).textContent = row.count[id] ? row.young[id] + ' Jungtiere · ' + g + ' ' + kind[g === 1 ? 0 : 1] + (row.sick && row.sick[id] ? ' · ' + row.sick[id] + ' krank' : '')
        : sim.stats.extinct[id] != null ? 'ausgestorben in ' + BT.Time.label(sim.stats.extinct[id]).replace(/,.*/, '') : 'nicht auf der Insel';
    });
    var rt = doc.querySelector('#tiles .tile[data-id="ratten"]');
    rt.hidden = sim.rats.day == null;
    if (!rt.hidden) {
      $('count-ratten').textContent = '≈ ' + (Math.round(row.ratten / 10) * 10).toLocaleString('de-DE');
      $('sub-ratten').textContent = row.ratten ? 'auf ' + Math.round(row.rattenShare * 100) + ' % der Insel · ' + sim.rats.eaten.eggs + ' Eier, ' + sim.rats.eaten.chicks + ' Küken gefressen'
        : 'ausgestorben';
    }
    updateCharts();
    updateDeaths();
    updateHighlightCount();
    updateCards();
    updateChronicle();
  }

  function updateDeaths() {
    var causes = [['hunger', 'Hunger'], ['alter', 'Alter'], ['inselwolf', 'Wolf'], ['inseladler', 'Adler'], ['hund', 'Hund'], ['krankheit', 'Krankheit'], ['jagd', 'Jagd'], ['ratte', 'Ratte'], ['hofhund', 'Dorfhund']];
    var html = '<tr><th></th>' + causes.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
    BT.SPECIES_ORDER.forEach(function (id) {
      if (!present(id)) return;
      var d = sim.stats.deaths[id];
      html += '<tr><td>' + BT.SPECIES[id].plural + '</td>' + causes.map(function (c) {
        return '<td>' + (d[c[0]] || '·') + '</td>';
      }).join('') + '</tr>';
    });
    // Ratten: gerundet (ein Feld, keine einzelnen Tiere)
    if (sim.rats.day != null) {
      var rd = sim.rats.deaths;
      html += '<tr><td>' + BT.RATS.plural + '</td>' + causes.map(function (c) {
        var v = Math.round(rd[c[0]] || 0);
        return '<td>' + (v ? v.toLocaleString('de-DE') : '·') + '</td>';
      }).join('') + '</tr>';
    }
    $('deaths').innerHTML = html;
  }

  function buildLegend() {
    var P = BT.PALETTE;
    var shares = world.areaShares;
    var html = '<h2>Lebensräume</h2>';
    for (var b = BT.BIOME.BEACH; b < BT.BIOME_INFO.length; b++) {
      var info = BT.BIOME_INFO[b];
      if (info.use) continue;
      var pct = shares[info.key] * 100;
      if (pct < 0.05) continue;
      html += '<div class="row"><span class="swatch" style="background:' + P[info.key].base + '"></span>' +
        info.name + '<span class="pct">' + pct.toFixed(1) + ' %</span></div>';
    }
    if (showPlants()) {
      // Beispiel: Grasland und Farnwald, wie sie bei Uebernutzung ihre Farbe verlieren
      var hex = function (h) { return [1, 3, 5].map(function (k) { return parseInt(h.substr(k, 2), 16); }); };
      var sw = function (key, s) { return 'rgb(' + BT.PlantRenderer.sample(hex(P[key].base), s).join(',') + ')'; };
      var pair = function (s) {
        return '<span class="swatch" style="background:linear-gradient(90deg,' + sw('tussock', s) + ' 50%,' + sw('fern', s) + ' 50%)"></span>';
      };
      html += '<h2>Weidezustand</h2>' +
        '<div class="row">' + pair(0) + 'gesund</div>' +
        '<div class="row">' + pair(0.35) + 'abgefressen: blasser</div>' +
        '<div class="row">' + pair(1) + 'überweidet: grau und fahl</div>';
    }
    legend.innerHTML = html;
  }

  // ---------------------------------------------------------------- Eingabe Karte
  var pointers = new Map();
  var pinchDist = 0;
  var lastAlpha = 0;
  var clickStart = null;   // Zeigerposition beim Druecken: kaum bewegt = Klick

  function localPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localPos(e));
    clickStart = pointers.size === 1 ? localPos(e) : null;
    canvas.classList.add('dragging');
    if (pointers.size === 2) {
      var p = Array.from(pointers.values());
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    var pos = localPos(e);
    if (pointers.has(e.pointerId) && camera) {
      var prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, pos);
      if (pointers.size === 1) {
        if (follow && clickStart && Math.abs(pos.x - clickStart.x) + Math.abs(pos.y - clickStart.y) < 5) return;
        if (follow) setFollow(null);
        camera.panByScreen(pos.x - prev.x, pos.y - prev.y);
      } else if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinchDist > 0) camera.zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, d / pinchDist);
        pinchDist = d;
      }
      interacted();
      tooltip.hidden = true;
      return;
    }
    showTooltip(pos);
  });

  function endPointer(e) {
    // Klick auf ein Tier: die Kamera folgt ihm
    if (e.type === 'pointerup' && clickStart && pointers.size === 1 && sim && camera) {
      var pos = localPos(e);
      if (Math.abs(pos.x - clickStart.x) + Math.abs(pos.y - clickStart.y) < 5) {
        var w = camera.screenToWorld(pos.x, pos.y);
        if (aiming) playCard(aiming, { x: w.x, y: w.y }, aimUndo);
        else {
          var a = BT.AgentRenderer.pick(sim, w.x, w.y, Math.max(14, 12 / camera.scale));
          if (a) setFollow(a);
          else {
            var rg = BT.RatRenderer.pick(sim, w.x, w.y, camera.scale, lastAlpha);
            if (rg) showTooltip(pos);
          }
        }
      }
    }
    clickStart = null;
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
    pinchDist = 0;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', function () { tooltip.hidden = true; });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (!camera) return;
    var pos = localPos(e);
    camera.zoomAt(pos.x, pos.y, Math.exp(-e.deltaY * 0.0015));
    interacted();
  }, { passive: false });

  canvas.addEventListener('dblclick', function (e) {
    if (!camera) return;
    var pos = localPos(e);
    camera.zoomAt(pos.x, pos.y, 2);
    interacted();
  });

  var STATE_TEXT = {
    fressen: 'frisst', fliehen: 'flieht', meiden: 'meidet die Menschen', trinken: 'geht trinken', brueten: 'brütet',
    streifen: 'streift durchs Revier', jagen: 'jagt', heimflug: 'bringt Beute zum Horst', ruhen: 'ruht', aas: 'frisst Aas', wandern: 'sucht ein Revier',
    ausgebuechst: 'ist ausgebüchst und läuft weit weg', weiterziehen: 'zieht zu einer neuen Weide'
  };
  var GROUP_TEXT = { herd: 'Herde', flock: 'Gruppe', pack: 'Rudel', pair: 'Paar' };

  function stateText(g, a) {
    if (g.horst && BT.Behavior.inHorst(g, a)) return a.chick ? 'Küken im Horst' : 'brütet im Horst';
    if (g.horst && g.state !== 'heimflug') return (STATE_TEXT[g.state] || g.state) + ' (versorgt den Horst)';
    return STATE_TEXT[g.state] || g.state;
  }

  function animalText(a) {
    var years = a.age / BT.Time.DAYS_PER_YEAR;
    var g = a.group;
    return a.spec.name + (a.sex === 'f' ? ' ♀' : ' ♂') + ' · ' +
      (a.age < a.spec.maturity ? 'Jungtier' : years.toFixed(1).replace('.', ',') + ' Jahre') +
      ' · Energie ' + Math.round(a.energy * 100) + ' %' + (a.sick ? ' · krank' : a.immune ? ' · immun' : '') +
      (g ? ' · ' + GROUP_TEXT[a.spec.group.kind] + ' mit ' + g.members.length + ' · ' + stateText(g, a) : '');
  }

  function showTooltip(pos) {
    if (!world || !camera) return;
    var w = camera.screenToWorld(pos.x, pos.y);
    if (w.x < 0 || w.y < 0 || w.x >= world.width || w.y >= world.height) { tooltip.hidden = true; return; }
    var a = sim ? BT.AgentRenderer.pick(sim, w.x, w.y, Math.max(14, 12 / camera.scale)) : null;
    var text, rg;
    var hp = !a && sim ? BT.HumanRenderer.pick(sim, w.x, w.y, Math.max(14, 12 / camera.scale)) : null;
    if (hp) {
      text = hp.kind === 'haus' ? 'Haus' + (sim.humans.villages.length > 1 ? ' · ' + sim.humans.villageName(hp.obj.village) : '') + ' · gebaut ' + BT.Time.label(hp.obj.day)
        : hp.kind === 'schaf' ? 'Schaf auf der Weide (gehört den Siedlern)' + (sim.humans.escaped.schaf == null ? '' : ' · ein Teil der Herde ist ausgebüchst')
        : hp.kind === 'hund' ? 'Hütehund (gehört den Siedlern)'
        : hp.kind === 'jaeger' && hp.obj.kind === 'sammel' ? 'Sammler · ' + ({ daheim: 'im Dorf', unterwegs: hp.obj.gathering ? 'sammelt Früchte und Samen' : 'sucht Früchte', heim: 'bringt ' + Math.round(hp.obj.load / BT.HUMANS.gather.basket * 10) / 10 + ' Körbe heim' })[hp.obj.state].replace('.', ',')
        : hp.kind === 'jaeger' ? (hp.obj.kind === 'wolf' ? 'Wolfsjäger' : 'Jäger') + ' · ' + ({ daheim: 'im Dorf', unterwegs: hp.obj.target ? 'auf der Jagd nach ' + hp.obj.target.spec.plural : 'auf der Jagd', heim: hp.obj.carry ? 'bringt Beute heim (' + BT.SPECIES[hp.obj.carry.id].name + ')' : 'geht heim' })[hp.obj.state]
        : hp.kind === 'schiff' ? 'Schiff · ' + ({ anfahrt: 'fährt zur Küste', liegt: 'liegt vor Anker', abfahrt: 'fährt zurück' })[hp.obj.phase]
        : 'Siedler · ' + (hp.obj.working ? 'arbeitet' : 'unterwegs');
    } else if (a) {
      text = animalText(a);
    } else if (sim && (rg = BT.RatRenderer.pick(sim, w.x, w.y, camera.scale, lastAlpha))) {
      text = 'Ratten · dieses Bild steht für ' + (rg.count === 1 ? 'etwa 1 Ratte' : 'etwa ' + rg.count + ' Ratten') + ' (Zelle gesamt: etwa ' + Math.round(sim.rats.at(w.x, w.y)) + ')';
    } else {
      var b = sim ? sim.biomeAt(w.x, w.y) : world.query.biomeAt(w.x, w.y);
      text = BT.BIOME_INFO[b].name;
      if (sim && b === BT.BIOME.SOIL) text += ' · früher ' + BT.BIOME_INFO[world.query.biomeAt(w.x, w.y)].name + ', hier wächst noch nichts';
      if (sim && b === BT.BIOME.FIELD) {
        var fi = sim.fields.index(w.x, w.y);
        text += ' · Getreide ' + pctOf(sim.fields, 'korn', fi) + (sim.calendar.season >= 2 ? ' (abgeerntet)' : '');
      }
      if (BT.BIOME_INFO[b].land && sim && b !== BT.BIOME.FIELD) {
        var f = sim.fields, i = f.index(w.x, w.y);
        text += ' · Gras ' + pctOf(f, 'gras', i) + ' · Laub ' + pctOf(f, 'laub', i) +
          ' · Früchte ' + pctOf(f, 'frucht', i) + ' · Insekten ' + pctOf(f, 'insekten', i) +
          healthOf(f, i);
      }
      var rats = sim ? sim.rats.at(w.x, w.y) : 0;
      if (rats >= 1) text += ' · etwa ' + Math.round(rats) + (Math.round(rats) === 1 ? ' Ratte' : ' Ratten');
    }
    tooltip.textContent = text;
    tooltip.style.left = pos.x + 'px';
    tooltip.style.top = pos.y + 'px';
    tooltip.hidden = false;
  }

  /** Pflanzenzustand der Zelle, nur wenn durch Ueberweidung geschaedigt. */
  function healthOf(f, i) {
    var parts = [];
    ['gras', 'laub'].forEach(function (key) {
      if (f.capacity[key][i] > 0.05 && f.health[key][i] < 0.95) {
        parts.push(BT.FOOD[key].name.split(' ')[0] + ' ' + Math.round(f.health[key][i] * 100) + ' %');
      }
    });
    return parts.length ? ' · überweidet, Zustand: ' + parts.join(', ') : '';
  }

  function pctOf(f, key, i) {
    var K = f.capacity[key][i];
    return K > 0.05 ? Math.round(f.value[key][i] / K * 100) + ' %' : '–';
  }

  // ---------------------------------------------------------------- Bedienelemente
  function reload(seed) { load(seed, sizeSelect.value, typeSelect.value); }
  $('newWorld').addEventListener('click', function () { reload(BT.randomSeed()); });
  seedInput.addEventListener('change', function () { reload(BT.parseSeed(seedInput.value)); });
  sizeSelect.onPick(function () { reload(world ? world.seed : BT.randomSeed()); });
  typeSelect.onPick(function () { reload(world ? world.seed : BT.randomSeed()); });
  $('resetView').addEventListener('click', function () { if (camera) { setFollow(null); camera.reset(); interacted(); } });
  followBadge.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') setFollow(null); });
  legendBtn.addEventListener('click', function () {
    legend.hidden = !legend.hidden;
    legendBtn.setAttribute('aria-pressed', String(!legend.hidden));
  });
  playBtn.addEventListener('click', function () { setRunning(!running); });
  mapMode.addEventListener('change', function () { if (world) buildLegend(); dirty = true; });
  $('stepDay').addEventListener('click', function () {
    if (!sim || skipping) return;
    setRunning(false);
    sim.runDays(1);
    updatePanel(true);
    dirty = true;
  });
  $('skip').addEventListener('click', function () { skipYears(5); });
  $('cardPause').addEventListener('change', function () {
    if (sim) sim.cardPause = BT.Time.years(+$('cardPause').value);
    updateCards();
  });
  $('cards').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]'), card = e.target.closest('.card');
    if (!btn || !card || btn.disabled) return;
    var id = card.dataset.id, act = btn.dataset.act;
    if (act === 'info') openInfo(id);
    else chooseCard(id, act === 'minus');
  });
  $('ciClose').addEventListener('click', closeInfo);
  $('cardInfo').addEventListener('click', function (e) { if (e.target === $('cardInfo')) closeInfo(); });
  $('ciPlus').addEventListener('click', function () { var id = infoCard; closeInfo(); chooseCard(id, false); });
  $('ciMinus').addEventListener('click', function () { var id = infoCard; closeInfo(); chooseCard(id, true); });
  $('tiles').addEventListener('click', function (e) {
    var tile = e.target.closest('.tile');
    if (tile) setHighlight(tile.dataset.id);
  });
  $('tiles').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tile = e.target.closest('.tile');
    if (!tile) return;
    e.preventDefault();
    e.stopPropagation();
    setHighlight(tile.dataset.id);
  });
  hlBadge.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') setHighlight(null); });
  speedInput.addEventListener('input', updateSpeedLabel);
  $('startInputs').addEventListener('input', function (e) {
    var id = e.target.dataset && e.target.dataset.id;
    if (!id) return;
    startValues[id] = parseInt(e.target.value, 10) || 0;
    startValuesChanged();
  });
  $('defaults').addEventListener('click', function () {
    startValues = Object.assign({}, recommended);
    startValuesChanged();
  });
  $('restart').addEventListener('click', function () {
    setRestartBox(false);
    setRunning(false);
    restart();
    setRunning(true);
  });
  $('csv').addEventListener('click', function () {
    if (!sim) return;
    var blob = new global.Blob(['﻿' + sim.stats.toCSV()], { type: 'text/csv;charset=utf-8' });
    var a = doc.createElement('a');
    a.href = global.URL.createObjectURL(blob);
    a.download = 'balance-of-nature-seed' + world.seed + '-jahr' + BT.Time.calendar(sim.day).year + '.csv';
    a.click();
    global.setTimeout(function () { global.URL.revokeObjectURL(a.href); }, 1000);
  });
  global.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'r' || e.key === 'R') { if (camera) { setFollow(null); camera.reset(); interacted(); } }
    if (e.key === ' ') { e.preventDefault(); setRunning(!running); }
    if (e.key === 'Escape') { if (infoCard) closeInfo(); else if (!$('restartBox').hidden) setRestartBox(false); else if (bigOpen()) setBig(false); else if (aiming) setAim(null); else setHighlight(null); }
  });
  global.addEventListener('resize', function () {
    resize();
    chartView.drawAll();
  });
  $('openBig').addEventListener('click', function () { setBig(true); });
  $('closeBig').addEventListener('click', function () { setBig(false); });

  // ---------------------------------------------------------------- Start
  buildPanel();
  initPanel();
  updateSpeedLabel();
  BT.Sprites.preload(function () { dirty = true; drawTileImages(); });
  BT.RatRenderer.image(drawTileImages);
  BT.HumanRenderer.preload();
  var h = readHash();
  load(h.seed ? BT.parseSeed(h.seed) : BT.randomSeed(), h.size || BT.CONFIG.size, h.typ || BT.CONFIG.type);
  global.requestAnimationFrame(frame);

  // Fuer Tests und Screenshots
  BT.app = {
    get world() { return world; },
    get sim() { return sim; },
    get camera() { return camera; },
    onWorld: null,
    /** Inseltyp wechseln (gleicher Seed, gleiche Groesse); baut die Insel neu */
    setType: function (type) { if (world && type !== world.type) load(world.seed, world.size, type); },
    redraw: function () { dirty = true; },
    highlight: setHighlight,
    runDays: function (n) { sim.runDays(n); updatePanel(true); dirty = true; },
    /** Neu starten mit eigenen Startwerten, z. B. { inselwolf: 0, inseladler: 0 } */
    restartWith: function (start) {
      startValues = Object.assign({}, recommended, start);
      customStart = true;
      restart();
    },
    /** Stand der Insel festhalten (Simulation, Kamera, Tempo), um spaeter dorthin zurueckzukehren */
    snapshot: function () {
      return { sim: sim, startValues: startValues, customStart: customStart, speed: speedInput.value,
        cam: { x: camera.x, y: camera.y, scale: camera.scale } };
    },
    /** Festgehaltenen Stand wieder zeigen (pausiert) */
    restore: function (snap) {
      sim = snap.sim; startValues = snap.startValues; customStart = snap.customStart;
      speedInput.value = snap.speed; updateSpeedLabel();
      if (chartView) chartView.events = sim.events;
      setAim(null); setFollow(null);
      tickAcc = 0;
      setRunning(false);
      camera.x = snap.cam.x; camera.y = snap.cam.y; camera.scale = snap.cam.scale;
      camera.clampPosition();
      syncStartSliders();
      updatePanel(true);
      dirty = true;
    },
    setRunning: setRunning,
    get running() { return running; },
    /** Tempo-Regler 0..100 setzen */
    speed: function (v) { speedInput.value = v; updateSpeedLabel(); },
    /** Pause zwischen zwei Karten in Jahren (wie die Auswahl „Pause“) */
    cardPause: function (years) { $('cardPause').value = String(years); if (sim) sim.cardPause = BT.Time.years(years); },
    /** Bereich der Seitenleiste auf-/zuklappen: fold('menschen', true) */
    fold: function (name, open) { setFold(doc.querySelector('.fold[data-fold="' + name + '"]'), open !== false); },
    wide: setWide,
    /** Grossansicht der Diagramme oeffnen/schliessen */
    big: setBig,
    /** Karte spielen, z. B. play('landung', { x: 400, y: 800 }); liefert null oder einen Fehlertext */
    play: function (id, params) { return playCard(id, params || {}); },
    /** Karte zuruecknehmen, z. B. unplay('acker'); mit { x, y } in dem Dorf, das dort am naechsten liegt */
    unplay: function (id, params) { return playCard(id, params || {}, true); },
    info: function (id) { if (id) openInfo(id); else closeInfo(); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
