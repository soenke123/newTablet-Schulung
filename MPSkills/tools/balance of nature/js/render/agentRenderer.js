/**
 * Zeichnet Tiere, Nester und Aas ueber die Karte.
 *
 * Positionen werden zwischen zwei Ticks interpoliert (alpha 0..1), damit die
 * Bewegung bei langsamer Geschwindigkeit fluessig aussieht. Das aendert nur
 * das Bild, nie die Simulation.
 *
 * Die Sprites sind Seitenansichten (Blickrichtung in spec.sprites.facing);
 * laeuft ein Tier in die andere Richtung, wird gespiegelt statt gedreht.
 * Welches Bild ein Tier bekommt (Geschlecht, Jungtier, Haltung), entscheidet
 * pose() aus dem Zustand der Gruppe und der Bewegung im letzten Tick.
 *
 * Hervorhebung (opts.highlight = Art-ID): alle Tiere dieser Art bekommen einen
 * farbigen Ring und liegen obenauf, die uebrigen bleiben unveraendert. So
 * sieht man auch in der Gesamtansicht, wo sich z. B. alle Woelfe aufhalten.
 * Das Tier, dem die Kamera folgt (opts.follow), bekommt einen weissen Ring.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  // Tiere werden kleiner gezeichnet als spec.size, damit die Insel bei 1000 bis
  // 1500 Tieren nicht ueberfuellt wirkt. Reine Darstellung, die Simulation bleibt gleich.
  var SCALE = 0.6;
  var MIN_PX = 7;   // Mindestgroesse eines Tiers auf dem Bildschirm
  var EAT_TICKS = 3; // so viele Ticks (je 4 Stunden) fressen Raeuber nach einem Riss

  function draw(ctx, sim, view, scale, alpha, opts) {
    if (!sim) return;
    var pad = 30;
    var hl = opts && opts.highlight || null;
    var hlColor = opts && opts.highlightColor || '#ffffff';

    // Aas
    ctx.fillStyle = 'rgba(70, 40, 30, 0.75)';
    ctx.strokeStyle = 'rgba(240, 230, 210, 0.9)';
    ctx.lineWidth = Math.max(1, 1.2 / scale);
    for (var c = 0; c < sim.carcasses.length; c++) {
      var cc = sim.carcasses[c];
      if (!inView(cc, view, pad)) continue;
      var r = Math.max(3, 5 / scale) * Math.min(1, 0.4 + cc.meat);
      ctx.beginPath();
      ctx.ellipse(cc.x, cc.y, r * 1.4, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cc.x - r, cc.y - r * 0.2); ctx.lineTo(cc.x + r, cc.y + r * 0.2);
      ctx.stroke();
    }

    // Nester der Laufvoegel
    for (var i = 0; i < sim.groups.length; i++) {
      var g = sim.groups[i];
      if (!g.nest || !inView(g.nest, view, pad)) continue;
      var nr = drawSize(g.spec, scale) * 0.4;
      ctx.fillStyle = '#8a6a3c';
      ctx.beginPath(); ctx.arc(g.nest.x, g.nest.y, nr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6f0dc';
      for (var e = 0; e < Math.min(4, g.nest.eggs); e++) {
        var a = e * 1.7;
        ctx.beginPath();
        ctx.ellipse(g.nest.x + Math.cos(a) * nr * 0.4, g.nest.y + Math.sin(a) * nr * 0.4, nr * 0.32, nr * 0.24, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Horste der Greifvoegel: Reisig, waehrend der Brut mit Eiern
    for (i = 0; i < sim.predatorGroups.length; i++) {
      var h = sim.predatorGroups[i].horst;
      if (!h || !inView(h, view, pad)) continue;
      var hr = drawSize(sim.predatorGroups[i].spec, scale) * 0.5;
      ctx.fillStyle = '#5e4526';
      ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7d5f37';
      ctx.beginPath(); ctx.arc(h.x, h.y, hr * 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe6cf';
      for (e = 0; e < Math.min(3, h.eggs); e++) {
        a = e * 2.1;
        ctx.beginPath();
        ctx.ellipse(h.x + Math.cos(a) * hr * 0.3, h.y + Math.sin(a) * hr * 0.3, hr * 0.24, hr * 0.18, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tiere: Pflanzenfresser zuerst, Raeuber obenauf, hervorgehobene Art ganz oben
    drawList(ctx, sim, sim.herbivoreGroups, view, scale, alpha, pad, hl, false);
    drawList(ctx, sim, sim.predatorGroups, view, scale, alpha, pad, hl, false);
    if (hl) {
      drawRings(ctx, sim.groups, view, scale, alpha, pad, hl, hlColor);
      drawList(ctx, sim, sim.groups, view, scale, alpha, pad, hl, true);
    }
    if (opts && opts.follow) drawFollow(ctx, opts.follow, scale, alpha);
  }

  /** Das Tier, dem die Kamera folgt: weisser Ring mit dunklem Rand. */
  function drawFollow(ctx, a, scale, alpha) {
    var p = memberPos(a, alpha);
    var r = drawSize(a.spec, scale) * 0.75;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 4 / scale;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / scale;
    ctx.stroke();
  }

  function memberPos(a, alpha) {
    return { x: a.px + (a.x - a.px) * alpha, y: a.py + (a.y - a.py) * alpha };
  }

  /** Leuchtende Ringe unter den Tieren der hervorgehobenen Art. */
  function drawRings(ctx, groups, view, scale, alpha, pad, hl, color) {
    var r = Math.max(7 / scale, 4);
    ctx.beginPath();
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.spec.id !== hl) continue;
      for (var m = 0; m < g.members.length; m++) {
        var p = memberPos(g.members[m], alpha);
        if (!inView(p, view, pad)) continue;
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3 / scale, 1.5);
    ctx.stroke();
  }

  /**
   * Haltung eines Tiers: move, stand, eat oder rest.
   *
   * Ein Tick sind vier Stunden, Tiere ziehen dabei fast immer ein Stueck weiter.
   * Die Haltung kommt deshalb vor allem aus dem Zustand der Gruppe; beim
   * Fressen wechseln die Tiere reihum zwischen Fressen und Aufschauen, damit
   * eine Herde nicht im Gleichtakt grast.
   */
  function pose(sim, g, a) {
    var spec = g.spec;
    var moved = Math.sqrt((a.x - a.px) * (a.x - a.px) + (a.y - a.py) * (a.y - a.py)) / spec.speed;
    var turn = (sim.tick + a.id) % 3;
    // Nach einem Riss fressen die Raeuber erst eine Weile an der Beute, bevor
    // sie sich hinlegen (die Energie gibt es in der Simulation sofort)
    var feeding = g.state === 'ruhen' && g.ateTick !== undefined && sim.tick - g.ateTick < EAT_TICKS;
    if (spec.flies) {
      if (g.horst && BT.Behavior.inHorst(g, a)) return 'rest';
      if (g.state === 'aas') return atCarcass(g, moved, turn, 'stand');
      if (feeding) return 'eat';
      if (g.state === 'ruhen') return 'stand';
      return moved > 0.3 ? 'move' : 'stand';
    }
    switch (g.state) {
      case 'fressen':
      case 'brueten':
        if (moved > 1.5) return 'move';
        // Stehen und Sitzen nur, wenn das Tier gerade nicht weiterzieht
        if (turn === 0 && moved < 0.3) return g.state === 'brueten' ? 'rest' : 'stand';
        return 'eat';
      case 'aas':
        return atCarcass(g, moved, turn, 'rest');
      case 'trinken':
        return moved < 0.3 ? 'eat' : 'move';
      case 'ruhen':
        return feeding ? 'eat' : 'rest';
      default:
        return moved > 0.3 ? 'move' : 'stand';
    }
  }

  /**
   * Am Aas: Gefressen wird erst am Kadaver - wer noch hinlaeuft, laeuft. Wer
   * satt ist, liegt (Voegel: steht) daneben und wartet.
   */
  function atCarcass(g, moved, turn, full) {
    if (g.speedNow > 0 || moved > 0.5) return moved > 0.3 ? 'move' : 'stand';
    if (!(g.bite > 0.01)) return full;
    return turn === 0 ? 'stand' : 'eat';
  }

  /**
   * @param hl    hervorgehobene Art oder null
   * @param only  true: nur die hervorgehobene Art, false: alle anderen
   */
  function drawList(ctx, sim, groups, view, scale, alpha, pad, hl, only) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var spec = g.spec;
      if (hl && (spec.id === hl) !== only) continue;
      var base = drawSize(spec, scale);
      var facesRight = !spec.sprites || spec.sprites.facing !== 'left';
      for (var m = 0; m < g.members.length; m++) {
        var a = g.members[m];
        var p = memberPos(a, alpha), x = p.x, y = p.y;
        if (x < view.x - pad || x > view.x + view.width + pad || y < view.y - pad || y > view.y + view.height + pad) continue;
        var young = a.age < spec.maturity;
        var ps = pose(sim, g, a);
        var img = BT.Sprites.get(spec.id, young ? 'j' : a.sex, ps);
        // Jungtierbilder sind schon kleiner gezeichnet, sie wachsen nur noch etwas
        var size = !young ? base : base * (img ? 0.8 + 0.2 * a.age / spec.maturity : 0.55 + 0.45 * a.age / spec.maturity);
        // Schatten (fliegende Tiere: weiter versetzt)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        var so = spec.flies && ps === 'move' ? size * 0.6 : size * 0.12;
        ctx.ellipse(x + so, y + size * 0.3 + so, size * 0.36, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        // Kranke Tiere: ein gruener Punkt ueber dem Kopf
        if (a.sick) {
          ctx.fillStyle = '#8fd400';
          ctx.strokeStyle = '#2c4a00';
          ctx.lineWidth = Math.max(0.6, size * 0.04);
          ctx.beginPath(); ctx.arc(x, y - size * 0.5, size * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        if (img) {
          var h = size * img.height / img.width;
          ctx.save();
          ctx.translate(x, y);
          if ((Math.cos(a.heading) < 0) === facesRight) ctx.scale(-1, 1);
          ctx.drawImage(img, -size / 2, -h / 2, size, h);
          ctx.restore();
        } else {
          ctx.fillStyle = spec.color;
          ctx.beginPath(); ctx.arc(x, y, size * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  /** Gezeichnete Groesse einer Art in Weltunits bei diesem Zoom. */
  function drawSize(spec, scale) {
    return Math.max(spec.size * SCALE, MIN_PX / scale);
  }

  function inView(p, view, pad) {
    return p.x >= view.x - pad && p.x <= view.x + view.width + pad &&
      p.y >= view.y - pad && p.y <= view.y + view.height + pad;
  }

  /** Das Tier unter einem Weltpunkt (fuer Tooltip/Auswahl), sonst null. */
  function pick(sim, wx, wy, radius) {
    var best = null, bestD = radius;
    for (var i = 0; i < sim.groups.length; i++) {
      var g = sim.groups[i];
      for (var m = 0; m < g.members.length; m++) {
        var a = g.members[m];
        var d = Math.hypot(a.x - wx, a.y - wy);
        if (d < bestD) { bestD = d; best = a; }
      }
    }
    return best;
  }

  BT.AgentRenderer = { draw: draw, pick: pick, size: drawSize, SCALE: SCALE, MIN_PX: MIN_PX };
})(typeof window !== 'undefined' ? window : globalThis);
