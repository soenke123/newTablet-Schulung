/**
 * Schaufenster fuer MPSkills (?demo=1, preview/balance.js): laeuft von selbst in
 * einer Schleife, mit der kompletten Oberflaeche (Seitenleiste, echte Diagramme).
 * Ohne den Parameter tut diese Datei nichts.
 *
 *   1. Die Insel mit Woelfen und Hirschen, 90 Jahre im Zeitraffer. Die Kurven
 *      sind die echten Jahresmittel der Simulation.
 *   2. Ein Schiff landet (echte Karte „Landung“), die Siedler legen eine
 *      Schafweide an (Karte „Schafweide“).
 *   3. Nach einigen Jahren brechen Schafe aus (Folgekarte „schafeAus“).
 */
(function (global) {
  'use strict';

  var BT = global.BT;
  var doc = global.document;
  if (!/(^|[?&])demo=1(&|$)/.test(global.location.search.slice(1)) || !BT.app) return;

  doc.body.classList.add('demo');
  ['seed', 'size', 'type'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.closest('.field').hidden = true; });
  ['newWorld', 'status', 'defaults', 'csv'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.hidden = true; });

  var LAND = { fx: 0.17, fy: 0.5 };
  var LANDING = 90;

  var caption = doc.createElement('div');
  caption.className = 'demo-caption';
  caption.hidden = true;
  doc.querySelector('.stage').appendChild(caption);
  function say(text) { caption.textContent = text; caption.hidden = !text; }

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
    app.cardPause(0);
    app.restartWith({ laufvogel: 0, inseladler: 0 });
    app.camera.reset();
    app.redraw();
    app.speed(48);
    app.setRunning(true);

    // 1. Wellen ueber 90 Jahre (echte Simulation im Zeitraffer)
    say('Wölfe und Hirsche: ein Auf und Ab');
    app.speed(100);
    await until(function () { return !alive() || app.sim.day >= BT.Time.years(LANDING); }, 60000);
    if (!alive()) return;
    app.setRunning(false);
    await sleep(1200);
    app.speed(48);
    app.setRunning(true);

    // 2. Landung und Schafweide
    var at = { x: app.world.width * LAND.fx, y: app.world.height * LAND.fy };
    say('Jahr 90: Menschen landen');
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
    await sleep(4500);
    if (!alive()) return;
    var wild = app.sim.groups.filter(function (g) { return g.spec.id === 'schaf' && g.members.length; })[0];
    if (wild) await flyTo(wild.x, wild.y, 3.2, 1600);
    await sleep(6000);
    if (alive()) show();
  }

  BT.app.onWorld = function () { show(); };
  BT.demo = { restart: show };
})(typeof window !== 'undefined' ? window : globalThis);
