/**
 * Schaufenster fuer MPSkills (?demo=1, preview/balance.js): laeuft von selbst in
 * einer Schleife. Ohne den Parameter tut diese Datei nichts.
 *
 *   1. Die Insel mit Woelfen und Hirschen. Daneben ein Diagramm der Jahresmittel
 *      ueber 90 Jahre: Hirsche und Woelfe schwanken versetzt.
 *   2. Ein Schiff landet (echte Karte „Landung“), die Siedler legen eine
 *      Schafweide an (Karte „Schafweide“).
 *   3. Nach einigen Jahren brechen Schafe aus (Folgekarte „schafeAus“). Im
 *      Diagramm kommen die Schafe dazu, die Hirsche werden weniger.
 *
 * Die Insel und die Menschen sind die echte Simulation. Das Diagramm ist eine
 * Skizze (gerechnete Wellen): 90 Jahre lassen sich in einem Schaufenster nicht
 * abwarten, und die Wellen sollen deutlich zu sehen sein.
 */
(function (global) {
  'use strict';

  var BT = global.BT;
  var doc = global.document;
  if (!/(^|[?&])demo=1(&|$)/.test(global.location.search.slice(1)) || !BT.app) return;

  doc.body.classList.add('demo');
  ['seed', 'size', 'mapMode'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.closest('.field').hidden = true; });
  ['newWorld', 'status', 'widen', 'toggleLegend'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.hidden = true; });

  var LAND = { fx: 0.17, fy: 0.5 };
  var YEARS = 100, LANDING = 90;
  var C = { hirsch: '#d95926', wolf: '#9085e9', schaf: '#d03fc8' };

  // ---------------------------------------------------------------- Diagramm
  var card = doc.createElement('div');
  card.className = 'demo-chart';
  card.innerHTML =
    '<div class="demo-head"><b>Bestand</b> <small>Jahresmittel</small><span class="demo-year"></span></div>' +
    '<svg viewBox="0 0 360 150" preserveAspectRatio="none" aria-hidden="true"></svg>' +
    '<div class="demo-leg"><span><i style="background:' + C.hirsch + '"></i>Zwerghirsche</span>' +
    '<span><i style="background:' + C.wolf + '"></i>Inselwölfe <small>(rechte Achse)</small></span>' +
    '<span class="demo-sheep" hidden><i style="background:' + C.schaf + '"></i>Schafe</span></div>';
  doc.querySelector('.stage').appendChild(card);
  var svg = card.querySelector('svg');
  var yearEl = card.querySelector('.demo-year');

  var caption = doc.createElement('div');
  caption.className = 'demo-caption';
  caption.hidden = true;
  doc.querySelector('.stage').appendChild(caption);
  function say(text) { caption.textContent = text; caption.hidden = !text; }

  // Jahresmittel: versetzte Wellen (Periode 18 Jahre, Woelfe ein Viertel spaeter),
  // etwas Rauschen; ab der Landung Schafe, die die Hirsche verdraengen.
  var data = (function () {
    var out = [], r = 7;
    function noise() { r = (r * 9301 + 49297) % 233280; return r / 233280 - 0.5; }
    for (var y = 0; y <= YEARS; y++) {
      var ph = 2 * Math.PI * y / 18;
      var h = 290 + 115 * Math.sin(ph) + 22 * noise();
      var w = 68 + 34 * Math.sin(ph - Math.PI / 2) + 6 * noise();
      var s = 0;
      if (y > LANDING + 3) {
        var k = (y - LANDING - 3) / (YEARS - LANDING - 3);
        s = 260 * k * k * (3 - 2 * k) + 10 * noise();
        h -= 120 * k;
        w += 18 * k;
      }
      out.push({ h: Math.max(20, h), w: Math.max(4, w), s: Math.max(0, s) });
    }
    return out;
  })();

  var X0 = 30, X1 = 330, Y0 = 136, Y1 = 8;
  function px(year) { return X0 + (X1 - X0) * year / YEARS; }
  function pyL(v) { return Y0 - (Y0 - Y1) * v / 500; }   // Hirsche, Schafe: 0..500
  function pyR(v) { return Y0 - (Y0 - Y1) * v / 125; }   // Woelfe: 0..125

  function line(upTo, from, key, py, color) {
    var pts = [];
    for (var y = from; y <= Math.floor(upTo); y++) pts.push(px(y).toFixed(1) + ',' + py(data[y][key]).toFixed(1));
    var f = upTo - Math.floor(upTo);
    if (f > 0 && Math.floor(upTo) < YEARS) {
      var a = data[Math.floor(upTo)][key], b = data[Math.floor(upTo) + 1][key];
      pts.push(px(upTo).toFixed(1) + ',' + py(a + (b - a) * f).toFixed(1));
    }
    return pts.length > 1 ? '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linejoin="round"/>' : '';
  }

  function drawChart(upTo, marks) {
    var g = '';
    [0, 250, 500].forEach(function (v) {
      g += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + pyL(v) + '" y2="' + pyL(v) + '" stroke="#fff" stroke-opacity=".12"/>' +
        '<text x="' + (X0 - 4) + '" y="' + (pyL(v) + 3) + '" text-anchor="end">' + v + '</text>' +
        '<text x="' + (X1 + 4) + '" y="' + (pyL(v) + 3) + '">' + (v / 4) + '</text>';
    });
    [0, 25, 50, 75, 100].forEach(function (y) { g += '<text x="' + px(y) + '" y="148" text-anchor="middle">' + y + '</text>'; });
    (marks || []).forEach(function (m) {
      g += '<line x1="' + px(m[0]) + '" x2="' + px(m[0]) + '" y1="' + Y1 + '" y2="' + Y0 + '" stroke="#f2c94c" stroke-dasharray="3 3"/>' +
        '<text x="' + (px(m[0]) - 3) + '" y="' + (Y1 + 9) + '" text-anchor="end" class="mk">' + m[1] + '</text>';
    });
    g += line(upTo, 0, 'h', pyL, C.hirsch) + line(upTo, 0, 'w', pyR, C.wolf);
    if (upTo > LANDING + 3) g += line(upTo, LANDING + 3, 's', pyL, C.schaf);
    svg.innerHTML = g;
    yearEl.textContent = 'Jahr ' + Math.min(YEARS, Math.floor(upTo));
  }

  // ---------------------------------------------------------------- Ablauf
  var run = 0;   // Durchgang; ein neuer beendet den alten
  function sleep(ms) { return new Promise(function (res) { global.setTimeout(res, ms); }); }
  function until(test, ms) {
    var end = Date.now() + ms;
    return new Promise(function (res) {
      (function poll() {
        if (test()) res(true);
        else if (Date.now() > end) res(false);
        else global.setTimeout(poll, 120);
      })();
    });
  }

  /** Kamera weich auf einen Punkt zufahren (zoom: Vielfaches der Gesamtansicht). */
  function flyTo(x, y, zoom, ms) {
    var cam = BT.app.camera;
    var s0 = cam.scale, s1 = cam.minScale * zoom;
    var cx0 = cam.x + cam.viewWidth / s0 / 2, cy0 = cam.y + cam.viewHeight / s0 / 2;
    var t0 = global.performance.now();
    return new Promise(function (res) {
      (function step(now) {
        var k = Math.max(0, Math.min(1, (now - t0) / ms)), e = k * k * (3 - 2 * k);
        cam.scale = s0 + (s1 - s0) * e;
        cam.x = cx0 + (x - cx0) * e - cam.viewWidth / cam.scale / 2;
        cam.y = cy0 + (y - cy0) * e - cam.viewHeight / cam.scale / 2;
        cam.clampPosition();
        BT.app.redraw();
        if (k < 1) global.requestAnimationFrame(step); else res();
      })(t0);
    });
  }

  async function show() {
    var me = ++run;
    var alive = function () { return me === run; };
    var app = BT.app;
    say('');
    doc.querySelector('.demo-sheep').hidden = true;
    app.cardPause(0);
    app.restartWith({ laufvogel: 0, inseladler: 0 });
    app.camera.reset();
    app.redraw();
    app.speed(48);
    app.setRunning(true);
    drawChart(0);

    // 1. Wellen ueber 90 Jahre
    say('Wölfe und Hirsche: ein Auf und Ab');
    var t0 = global.performance.now(), dur = 15000;
    await new Promise(function (res) {
      (function step(now) {
        if (!alive()) return res();
        var k = Math.max(0, Math.min(1, (now - t0) / dur));
        drawChart(LANDING * k);
        if (k < 1) global.requestAnimationFrame(step); else res();
      })(t0);
    });
    if (!alive()) return;
    await sleep(1200);

    // 2. Landung und Schafweide
    var at = { x: app.world.width * LAND.fx, y: app.world.height * LAND.fy };
    say('Jahr 90: Menschen landen');
    drawChart(LANDING, [[LANDING, '⛵']]);
    await flyTo(at.x + app.world.width * 0.06, at.y, 3, 1600);
    if (!alive()) return;
    if (app.play('landung', at)) { await sleep(3000); return alive() && show(); }
    app.setRunning(true);
    await until(function () { return !alive() || app.sim.humans.villages.length; }, 30000);
    if (!alive()) return;
    var v = app.sim.humans.villages[0];
    if (!v) { await sleep(1000); return alive() && show(); }
    await sleep(1800);
    if (!alive()) return;
    app.cardPause(0);
    if (app.play('schafe', {})) { await sleep(3000); return alive() && show(); }
    app.setRunning(true);
    await until(function () { return !alive() || app.sim.humans.pastures.length; }, 8000);
    var p = app.sim.humans.pastures[0];
    if (p) await flyTo((p.x + v.x) / 2, (p.y + v.y) / 2, 3.6, 1400);
    if (!alive()) return;
    say('Die Siedler halten Schafe auf einer Weide');
    await sleep(3500);

    // 3. Ausbruch: vorspulen, bis die Schafe draussen sind
    if (!alive()) return;
    say('Jahre vergehen …');
    app.speed(82);
    var out = await until(function () {
      return !alive() || app.sim.events.some(function (e) { return e.card === 'schafeAus'; });
    }, 40000);
    if (!alive()) return;
    app.speed(40);
    say(out ? 'Schafe brechen aus und verwildern' : 'Die Schafe bleiben auf der Weide');
    doc.querySelector('.demo-sheep').hidden = false;
    var marks = [[LANDING, '⛵'], [LANDING + 4, '🐑']];
    t0 = global.performance.now();
    await new Promise(function (res) {
      (function step(now) {
        if (!alive()) return res();
        var k = Math.max(0, Math.min(1, (now - t0) / 4500));
        drawChart(LANDING + (YEARS - LANDING) * k, marks);
        if (k < 1) global.requestAnimationFrame(step); else res();
      })(t0);
    });
    if (!alive()) return;
    var wild = app.sim.groups.filter(function (g) { return g.spec.id === 'schaf' && g.members.length; })[0];
    if (wild) await flyTo(wild.x, wild.y, 3.2, 1600);
    await sleep(6000);
    if (alive()) show();
  }

  BT.app.onWorld = function () { show(); };
  BT.demo = { restart: show };
})(typeof window !== 'undefined' ? window : globalThis);
