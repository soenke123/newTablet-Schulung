/**
 * Zeichnet die Objekte in der vorgegebenen Reihenfolge:
 * Baeume -> Nuss-/Pilzbereiche -> Apfelbaeume -> Ameisenhuegel.
 *
 * Alles ist reines Canvas-2D, keine Bilddateien. Jedes Objekt bringt seine
 * eigenen Zufallswerte (Groesse, Variante, Neigung) aus der Generierung mit -
 * der Renderer bleibt dadurch deterministisch und zustandslos.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var inView = function (p, view, pad) {
    return p.x >= view.x - pad && p.x <= view.x + view.width + pad &&
      p.y >= view.y - pad && p.y <= view.y + view.height + pad;
  };

  function circle(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  // ----------------------------------------------------------------- Baeume

  function drawTrees(ctx, trees, view, scale) {
    var P = WL.PALETTE.forest;
    var detailed = scale > 0.3;
    var i, t;

    // Schatten aller Baeume in einem Zug.
    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x + t.r * 0.16, t.y + t.r * 0.22, t.r * 0.95);
    }
    ctx.fillStyle = P.shadow;
    ctx.fill();

    if (!detailed) {
      // Herausgezoomt genuegt eine geschlossene Kronenflaeche.
      ctx.beginPath();
      for (i = 0; i < trees.length; i++) {
        t = trees[i];
        if (!inView(t, view, t.r * 2)) continue;
        circle(ctx, t.x, t.y, t.r * 0.92);
      }
      ctx.fillStyle = P.canopy;
      ctx.fill();
      return;
    }

    // Grundkrone: je nach Variante zwei bis drei ueberlappende Kreise.
    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      var lean = t.tilt * t.r * 0.35;
      circle(ctx, t.x, t.y, t.r * 0.86);
      circle(ctx, t.x - t.r * 0.42 + lean, t.y + t.r * 0.30, t.r * 0.60);
      circle(ctx, t.x + t.r * 0.44 + lean, t.y + t.r * 0.24, t.r * 0.56);
      if (t.variant === 2) circle(ctx, t.x + lean * 0.5, t.y - t.r * 0.46, t.r * 0.52);
    }
    ctx.fillStyle = P.canopy;
    ctx.fill();

    // Dunkle Unterseite.
    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x + t.r * 0.10, t.y + t.r * 0.40, t.r * 0.52);
    }
    ctx.fillStyle = P.canopyDark;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Lichtkante oben links.
    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x - t.r * 0.26 + t.tilt * t.r * 0.2, t.y - t.r * 0.30, t.r * 0.40);
    }
    ctx.fillStyle = P.canopyLight;
    ctx.fill();
  }

  // ------------------------------------------------------- Nuesse und Pilze

  function drawResources(ctx, resources, view, scale) {
    if (scale < 0.5) return; // zu klein, um herausgezoomt sinnvoll zu wirken
    var P = WL.PALETTE.resource;
    var i, r;

    ctx.beginPath();
    for (i = 0; i < resources.length; i++) {
      r = resources[i];
      if (!inView(r, view, 12)) continue;
      circle(ctx, r.x + r.r * 0.2, r.y + r.r * 0.35, r.r * 0.85);
    }
    ctx.fillStyle = P.shadow;
    ctx.fill();

    // Zwei Erscheinungsformen, aber bewusst eine gemeinsame Kategorie
    // "Ressourcenbereich" im Datenmodell.
    ctx.beginPath();
    for (i = 0; i < resources.length; i++) {
      r = resources[i];
      if (r.variant === 2 || !inView(r, view, 12)) continue;
      circle(ctx, r.x, r.y, r.r);
    }
    ctx.fillStyle = P.cap;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < resources.length; i++) {
      r = resources[i];
      if (r.variant !== 2 || !inView(r, view, 12)) continue;
      circle(ctx, r.x, r.y, r.r * 0.85);
    }
    ctx.fillStyle = P.nut;
    ctx.fill();

    if (scale < 1.1) return;
    ctx.beginPath();
    for (i = 0; i < resources.length; i++) {
      r = resources[i];
      if (!inView(r, view, 12)) continue;
      circle(ctx, r.x - r.r * 0.28, r.y - r.r * 0.30, r.r * 0.30);
    }
    ctx.fillStyle = P.stem;
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ Apfelbaeume

  function drawAppleTrees(ctx, trees, view, scale) {
    var P = WL.PALETTE.appleTree;
    var detailed = scale > 0.3;
    var i, t;

    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x + t.r * 0.18, t.y + t.r * 0.26, t.r * 0.98);
    }
    ctx.fillStyle = P.shadow;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x, t.y, t.r);
      circle(ctx, t.x - t.r * 0.5, t.y + t.r * 0.28, t.r * 0.62);
      circle(ctx, t.x + t.r * 0.5, t.y + t.r * 0.24, t.r * 0.60);
      circle(ctx, t.x, t.y - t.r * 0.52, t.r * 0.58);
    }
    ctx.fillStyle = P.canopy;
    ctx.fill();

    if (!detailed) return;

    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      circle(ctx, t.x - t.r * 0.28, t.y - t.r * 0.30, t.r * 0.46);
    }
    ctx.fillStyle = P.canopyLight;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      for (var a = 0; a < t.apples.length; a++) {
        circle(ctx, t.x + t.apples[a].dx, t.y + t.apples[a].dy, t.apples[a].r);
      }
    }
    ctx.fillStyle = P.apple;
    ctx.fill();

    if (scale < 0.9) return;
    ctx.beginPath();
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(t, view, t.r * 2)) continue;
      for (var b = 0; b < t.apples.length; b++) {
        circle(ctx, t.x + t.apples[b].dx - t.apples[b].r * 0.3,
          t.y + t.apples[b].dy - t.apples[b].r * 0.3, t.apples[b].r * 0.38);
      }
    }
    ctx.fillStyle = P.appleLight;
    ctx.fill();
  }

  // ---------------------------------------------------------- Ameisenhuegel

  function drawAnthills(ctx, hills, view, scale) {
    var P = WL.PALETTE.anthill;
    var i, h;

    ctx.beginPath();
    for (i = 0; i < hills.length; i++) {
      h = hills[i];
      if (!inView(h, view, h.r * 2)) continue;
      circle(ctx, h.x + h.r * 0.14, h.y + h.r * 0.20, h.r * 1.05);
    }
    ctx.fillStyle = P.shadow;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < hills.length; i++) {
      h = hills[i];
      if (!inView(h, view, h.r * 2)) continue;
      circle(ctx, h.x, h.y, h.r);
    }
    ctx.fillStyle = P.dark;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < hills.length; i++) {
      h = hills[i];
      if (!inView(h, view, h.r * 2)) continue;
      circle(ctx, h.x, h.y, h.r * 0.76);
    }
    ctx.fillStyle = P.base;
    ctx.fill();

    ctx.beginPath();
    for (i = 0; i < hills.length; i++) {
      h = hills[i];
      if (!inView(h, view, h.r * 2)) continue;
      circle(ctx, h.x - h.r * 0.14, h.y - h.r * 0.16, h.r * 0.42);
    }
    ctx.fillStyle = P.light;
    ctx.fill();

    if (scale < 0.45) return;
    ctx.beginPath();
    for (i = 0; i < hills.length; i++) {
      h = hills[i];
      if (!inView(h, view, h.r * 2)) continue;
      for (var s = 0; s < h.specks.length; s++) {
        circle(ctx, h.x + h.specks[s].dx, h.y + h.specks[s].dy, h.specks[s].r);
      }
    }
    ctx.fillStyle = P.speck;
    ctx.fill();
  }

  function draw(ctx, world, view, scale) {
    var o = world.objects;
    drawTrees(ctx, o.trees, view, scale);
    drawResources(ctx, o.resources, view, scale);
    drawAppleTrees(ctx, o.appleTrees, view, scale);
    drawAnthills(ctx, o.anthills, view, scale);
  }

  WL.ObjectRenderer = { draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
