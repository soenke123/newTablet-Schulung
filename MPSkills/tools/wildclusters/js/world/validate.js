/**
 * Selbsttest der erzeugten Welt.
 *
 * Prueft genau die Regeln aus der Aufgabenstellung. Das Ergebnis erscheint im
 * Debug-Overlay (Taste D) und wird vom Headless-Smoketest ueber viele Seeds
 * ausgewertet. Im Normalfall muss die Verstossliste leer sein.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  function validate(world) {
    var q = world.query;
    var cfg = world.config;
    var violations = [];
    var warnings = [];

    function rule(id, label, offenders) {
      if (offenders > 0) violations.push({ id: id, label: label, count: offenders });
    }

    function countBad(list, ok) {
      var n = 0;
      for (var i = 0; i < list.length; i++) if (!ok(list[i])) n++;
      return n;
    }

    // --- Objekte auf erlaubtem Untergrund
    rule('tree-outside-forest', 'Baum ausserhalb des Waldes',
      countBad(world.objects.trees, function (t) { return q.isForest(t.x, t.y); }));

    rule('resource-outside-forest', 'Ressource ausserhalb des Waldes',
      countBad(world.objects.resources, function (r) { return q.isForest(r.x, r.y); }));

    rule('apple-not-on-grass', 'Apfelbaum nicht auf Gras',
      countBad(world.objects.appleTrees, function (a) { return q.isGrass(a.x, a.y); }));

    rule('anthill-invalid', 'Ameisenhuegel auf Wasser oder im Wald',
      countBad(world.objects.anthills, function (a) { return q.isOpen(a.x, a.y); }));

    // --- Flaechenregel: Wald und Wasser duerfen sich nicht beruehren
    var grid = world.terrain.grid;
    var dist = world.fields.distToWater;
    var touching = 0;
    for (var i = 0; i < grid.data.length; i++) {
      if (grid.data[i] === T.FOREST && dist[i] <= cfg.forest.waterBuffer - 1) touching++;
    }
    rule('forest-touches-water', 'Waldzelle ohne Uferabstand zum Wasser', touching);

    // --- Anzahlen laut Vorgabe
    var counts = {
      waterBodies: world.terrain.waterBodies.length,
      forestRegions: world.terrain.forestRegions.length,
      grasslands: world.terrain.grasslands.length,
      trees: world.objects.trees.length,
      resourcePatches: world.objects.resourcePatches.length,
      resources: world.objects.resources.length,
      appleGroups: world.objects.appleGroups.length,
      appleTrees: world.objects.appleTrees.length,
      anthills: world.objects.anthills.length
    };

    function expect(id, label, value, min) {
      if (value < min) violations.push({ id: id, label: label + ' (' + value + ' < ' + min + ')', count: 1 });
    }

    expect('too-few-water', 'Zu wenige Wasserflaechen', counts.waterBodies, 3);
    expect('too-few-forest', 'Zu wenige Waldgebiete', counts.forestRegions, 2);
    expect('too-few-patches', 'Zu wenige Ressourcenbereiche', counts.resourcePatches, 3);
    expect('too-few-apple-groups', 'Zu wenige Apfelbaumgruppen', counts.appleGroups, 2);
    expect('too-few-anthills', 'Zu wenige Ameisenhuegel', counts.anthills, 3);
    expect('too-few-trees', 'Zu wenige Baeume', counts.trees, 120);

    // --- Flaechenverteilung
    var r = world.areaRatios;
    if (!(r.grass > r.forest && r.forest > r.water && r.water > r.visibleGround)) {
      violations.push({
        id: 'ratio-order',
        label: 'Reihenfolge Gras > Wald > Wasser > Boden verletzt',
        count: 1
      });
    }
    if (Math.abs(r.forest - cfg.targets.forest) > cfg.targets.tolerance) {
      warnings.push({
        id: 'forest-ratio',
        label: 'Waldanteil ausserhalb der Toleranz (' + (r.forest * 100).toFixed(1) + '%)'
      });
    }

    // --- Bewegungsraum fuer die spaetere Simulation
    var mainGrass = world.terrain.grasslands.length ? world.terrain.grasslands[0] : null;
    var mainShare = mainGrass ? mainGrass.cellCount / (world.cols * world.rows) : 0;
    if (mainShare < 0.18) {
      warnings.push({
        id: 'small-grassland',
        label: 'Groesste Graslandschaft klein (' + (mainShare * 100).toFixed(1) + '% der Karte)'
      });
    }

    return {
      ok: violations.length === 0,
      violations: violations,
      warnings: warnings,
      counts: counts,
      mainGrasslandShare: mainShare
    };
  }

  WL.validate = validate;
})(typeof window !== 'undefined' ? window : globalThis);
