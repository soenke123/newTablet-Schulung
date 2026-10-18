/**
 * Zeichnet die Menschen: Schiffe, Haeuser, Siedler, Jaeger und Sammler, Weiden mit Zaun,
 * Schafe auf der Weide und Huetehunde (mit den Bildern der Arten schaf, hund).
 *
 * Bilder in assets/ (zugeschnitten auf den Umriss): schiff.png (Bug links),
 * haus_fachwerk.png, haus_holz.png und in assets/doerfler/ die Menschen von vorn:
 * villager_<n> (Siedler), jagdwild_<n> (Jaeger), jagdwolf_<n> (Wolfsjaeger),
 * sammeln_<n> (Sammler). Jedes Haus und jeder Mensch bekommt eines der Bilder
 * seiner Sorte, fest nach seiner Nummer (variant), aber ohne Muster.
 * Solange ein Bild noch laedt, steht dort ein farbiger Punkt.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  function numbered(prefix, n) {
    var list = [];
    for (var k = 1; k <= n; k++) list.push('assets/doerfler/' + prefix + '_' + k + '.png');
    return list;
  }

  // Je Sorte eine Liste von Bildern (Varianten)
  var FILES = {
    schiff: ['assets/schiff.png'],
    haus: ['assets/haus_fachwerk.png', 'assets/haus_holz.png'],
    siedler: numbered('villager', 11),
    wild: numbered('jagdwild', 7),
    wolf: numbered('jagdwolf', 7),
    sammel: numbered('sammeln', 5)
  };
  var images = {};

  function image(name, k) {
    var key = name + k;
    if (images[key] !== undefined) return images[key];
    images[key] = null;
    var file = FILES[name] && FILES[name][k];
    if (!file || typeof global.Image === 'undefined') return null;
    var img = new global.Image();
    img.onload = function () { images[key] = img; if (BT.app) BT.app.redraw(); };
    img.src = file;
    return null;
  }

  /** Bild Nummer (id gestreut) aus der Sorte name. */
  function variant(name, id) {
    var h = Math.imul(id + 1, 0x9e3779b1) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    return image(name, ((h ^ (h >>> 13)) >>> 0) % FILES[name].length);
  }

  /** Alle Bilder vorab laden (sonst erst, wenn sie zum ersten Mal gebraucht werden). */
  function preload() {
    for (var name in FILES) for (var k = 0; k < FILES[name].length; k++) image(name, k);
  }

  var SHIP_SIZE = 58, HOUSE_SIZE = 30, PERSON = 1.7;   // Menschen: so hoch (mal HUMANS.settler.size)

  function lerp(o, alpha) {
    return { x: o.px + (o.x - o.px) * alpha, y: o.py + (o.y - o.py) * alpha };
  }

  function inView(p, view, pad) {
    return p.x >= view.x - pad && p.x <= view.x + view.width + pad &&
      p.y >= view.y - pad && p.y <= view.y + view.height + pad;
  }

  /** Haeuser und Siedler (unter den Tieren). */
  function drawGround(ctx, sim, view, scale, alpha) {
    var H = sim && sim.humans;
    if (!H || !H.houses.length) return;
    for (var k = 0; k < H.pastures.length; k++) {
      var pa = H.pastures[k];
      if (inView(pa, view, pa.r * 1.3)) drawPasture(ctx, sim, H, pa, view, scale, alpha);
    }
    var hs = Math.max(HOUSE_SIZE, 18 / scale);
    for (var i = 0; i < H.houses.length; i++) {
      var h = H.houses[i];
      if (inView(h, view, hs * 2)) drawHouse(ctx, h, hs);
    }
    var ps = Math.max(BT.HUMANS.settler.size, 10 / scale) * PERSON;
    for (i = 0; i < H.people.length; i++) {
      var p = H.people[i];
      if (p.inside) continue;
      var q = lerp(p, alpha);
      if (inView(q, view, ps * 2)) drawSettler(ctx, p, q, ps);
    }
    for (i = 0; i < H.hunters.length; i++) {
      var hu = H.hunters[i];
      if (hu.state === 'daheim' && H.night) continue;
      var hq = lerp(hu, alpha);
      if (inView(hq, view, ps * 2)) drawHunter(ctx, hu, hq, ps * 1.05);
    }
    var hund = BT.SPECIES.hund, ds = BT.AgentRenderer.size(hund, scale);
    for (i = 0; i < H.dogs.length; i++) {
      var d = H.dogs[i], dq = lerp(d, alpha);
      if (!inView(dq, view, ds * 2)) continue;
      var moving = Math.abs(d.x - d.px) + Math.abs(d.y - d.py) > 0.5;
      drawAnimal(ctx, hund, d.sex, moving ? 'move' : 'stand', d, dq, ds);
    }
  }

  /** Weide: Zaun aus Pfosten und Latten, darin die Schafe. */
  function drawPasture(ctx, sim, H, pa, view, scale, alpha) {
    var N = 40, pts = [];
    for (var k = 0; k < N; k++) {
      var a = k / N * Math.PI * 2, r = H.pastureRadius(pa, a);
      pts.push({ x: pa.x + Math.cos(a) * r, y: pa.y + Math.sin(a) * r });
    }
    ctx.lineWidth = Math.max(1.2, 1.6 / scale);
    ctx.strokeStyle = '#6b4a2a';
    for (var rail = 0; rail < 2; rail++) {
      ctx.beginPath();
      for (k = 0; k <= N; k++) {
        var p = pts[k % N];
        if (k === 0) ctx.moveTo(p.x, p.y - rail * 3); else ctx.lineTo(p.x, p.y - rail * 3);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#4a3220';
    var pw = Math.max(1.6, 2 / scale);
    for (k = 0; k < N; k++) ctx.fillRect(pts[k].x - pw / 2, pts[k].y - 6, pw, 7);
    var schaf = BT.SPECIES.schaf, ss = BT.AgentRenderer.size(schaf, scale);
    for (k = 0; k < pa.sheep.length; k++) {
      var s = pa.sheep[k], q = lerp(s, alpha);
      if (!inView(q, view, ss * 2)) continue;
      var moving = Math.abs(s.x - s.px) + Math.abs(s.y - s.py) > 0.4;
      var pose = moving ? 'move' : s.eating ? 'eat' : H.night ? 'rest' : 'stand';
      drawAnimal(ctx, schaf, s.young ? 'j' : s.sex, pose, s, q, s.young ? ss * 0.75 : ss);
    }
  }

  /** Haustier mit dem Bild seiner Art (wie in agentRenderer), sonst ein farbiger Punkt. */
  function drawAnimal(ctx, spec, kind, pose, o, q, size) {
    var img = BT.Sprites && BT.Sprites.get(spec.id, kind, pose);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath(); ctx.ellipse(q.x + size * 0.12, q.y + size * 0.42, size * 0.36, size * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    if (!img) {
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, size * 0.3, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var facesRight = spec.sprites.facing !== 'left';
    var h = size * img.height / img.width;
    ctx.save();
    ctx.translate(q.x, q.y);
    if ((Math.cos(o.heading) < 0) === facesRight) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -h / 2, size, h);
    ctx.restore();
  }

  /** Schiffe (ueber allem, sie fahren auf dem Meer). */
  function drawSea(ctx, sim, view, scale, alpha) {
    var H = sim && sim.humans;
    if (!H) return;
    var ss = Math.max(SHIP_SIZE, 34 / scale);
    for (var i = 0; i < H.ships.length; i++) {
      var s = H.ships[i];
      var q = lerp(s, alpha);
      if (inView(q, view, ss * 2)) drawShip(ctx, s, q, ss, scale);
    }
  }

  function drawHouse(ctx, h, size) {
    var img = variant('haus', h.id);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath(); ctx.ellipse(h.x + size * 0.08, h.y + size * 0.4, size * 0.66, size * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    if (!img) return;
    var w = size * 1.2, ih = w * img.height / img.width;
    ctx.drawImage(img, h.x - w / 2, h.y + size * 0.48 - ih, w, ih);
  }

  /**
   * Ein Mensch (Bild von vorn, Fuesse bei y + height * 0.3). Wer geht, wippt
   * im Schritt: Das haengt am Weg, nicht an der Uhr, und steht still, wenn er steht.
   */
  function drawPerson(ctx, img, q, height, moving, dot) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath(); ctx.ellipse(q.x, q.y + height * 0.3, height * 0.2, height * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (!img) {
      ctx.fillStyle = dot;
      ctx.beginPath(); ctx.arc(q.x, q.y, height * 0.2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var bob = moving ? Math.abs(Math.sin((q.x + q.y) / (height * 0.22))) * height * 0.05 : 0;
    var w = height * img.width / img.height;
    ctx.drawImage(img, q.x - w / 2, q.y + height * 0.3 - height - bob, w, height);
  }

  function drawSettler(ctx, p, q, height) {
    var moving = Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 0.3;
    drawPerson(ctx, variant('siedler', p.id), q, height, moving, '#3d6fb0');
  }

  /** Jaeger, Wolfsjaeger, Sammler. Ein Jaeger mit Beute traegt sie ueber der Schulter. */
  function drawHunter(ctx, h, q, height) {
    var moving = Math.abs(h.x - h.px) + Math.abs(h.y - h.py) > 0.3;
    drawPerson(ctx, variant(h.kind, h.id), q, height, moving, h.kind === 'wolf' ? '#4a4f45' : h.kind === 'sammel' ? '#b0643a' : '#5f7a2e');
    if (!h.carry) return;
    var spec = BT.SPECIES[h.carry.id];
    var img = BT.Sprites && BT.Sprites.get(spec.id, 'm', 'rest');
    var w = height * 0.7, x = q.x + height * 0.18, y = q.y - height * 0.32;
    if (!img) {
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.ellipse(x, y, w * 0.35, w * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var ih = w * img.height / img.width;
    ctx.drawImage(img, x - w / 2, y - ih / 2, w, ih);
  }

  /** Schiff (das Bild zeigt den Bug links) mit Kielwasser, solange es faehrt. */
  function drawShip(ctx, s, q, size, scale) {
    if (s.phase !== 'liegt') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = Math.max(1, 1.5 / scale);
      var bx = -Math.cos(s.heading), by = -Math.sin(s.heading);
      for (var k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(q.x + bx * size * 0.35, q.y + by * size * 0.35 + size * 0.3);
        ctx.lineTo(q.x + bx * size * 1.1 - by * k * size * 0.25, q.y + by * size * 1.1 + bx * k * size * 0.25 + size * 0.3);
        ctx.stroke();
      }
    }
    var img = variant('schiff', 0);
    if (!img) return;
    var ih = size * img.height / img.width;
    ctx.save();
    ctx.translate(q.x, q.y);
    if (Math.cos(s.heading) > 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, size * 0.4 - ih, size, ih);
    ctx.restore();
  }

  /** Haus oder Siedler unter einem Weltpunkt (fuer den Tooltip), sonst null. */
  function pick(sim, wx, wy, radius) {
    var H = sim && sim.humans;
    if (!H) return null;
    var best = null, bestD = radius;
    for (var i = 0; i < H.people.length; i++) {
      var p = H.people[i];
      if (p.inside) continue;
      var d = Math.hypot(p.x - wx, p.y - wy);
      if (d < bestD) { bestD = d; best = { kind: 'siedler', obj: p }; }
    }
    for (i = 0; i < H.houses.length; i++) {
      var h = H.houses[i];
      d = Math.hypot(h.x - wx, h.y - wy);
      if (d < Math.max(bestD, HOUSE_SIZE * 0.6)) { bestD = d; best = { kind: 'haus', obj: h }; }
    }
    for (i = 0; i < H.hunters.length; i++) {
      var hu = H.hunters[i];
      if (hu.state === 'daheim' && H.night) continue;
      d = Math.hypot(hu.x - wx, hu.y - wy);
      if (d < bestD) { bestD = d; best = { kind: 'jaeger', obj: hu }; }
    }
    for (i = 0; i < H.dogs.length; i++) {
      d = Math.hypot(H.dogs[i].x - wx, H.dogs[i].y - wy);
      if (d < bestD) { bestD = d; best = { kind: 'hund', obj: H.dogs[i] }; }
    }
    for (var k = 0; k < H.pastures.length; k++) {
      var pa = H.pastures[k];
      for (i = 0; i < pa.sheep.length; i++) {
        d = Math.hypot(pa.sheep[i].x - wx, pa.sheep[i].y - wy);
        if (d < bestD) { bestD = d; best = { kind: 'schaf', obj: pa.sheep[i], pasture: pa }; }
      }
    }
    for (i = 0; i < H.ships.length; i++) {
      var s = H.ships[i];
      d = Math.hypot(s.x - wx, s.y - wy);
      if (d < Math.max(bestD, SHIP_SIZE * 0.5)) { bestD = d; best = { kind: 'schiff', obj: s }; }
    }
    return best;
  }

  BT.HumanRenderer = { drawGround: drawGround, drawSea: drawSea, pick: pick, preload: preload, FILES: FILES };
})(typeof window !== 'undefined' ? window : globalThis);
