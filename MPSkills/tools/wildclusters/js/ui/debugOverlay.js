/**
 * Debug- und Kontrollanzeige (Taste D).
 *
 * Zeigt, ob der Generator seine eigenen Regeln einhaelt: Flaechenanteile gegen
 * die Zielverteilung, Objektzahlen und das Ergebnis von world/validate.js.
 * Standardmaessig ausgeblendet - die eigentliche UI bleibt minimal.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function pct(value) {
    return (value * 100).toFixed(1) + '%';
  }

  function row(label, value, cssClass) {
    return '<tr><td>' + label + '</td><td' +
      (cssClass ? ' class="' + cssClass + '"' : '') + '>' + value + '</td></tr>';
  }

  /**
   * Die Merkmale, nach denen spaeter gruppiert wird - je Art gemittelt.
   * Steht hier, damit beim Einbau jedes neuen Tieres sofort sichtbar ist, ob
   * es sich von den bereits vorhandenen ueberhaupt unterscheidet.
   */
  function simSection(sim) {
    if (!sim || !sim.features) return '';
    var html = '<div class="section"><h2>Simulation</h2><table>';
    html += row('Tiere', sim.meta.agentCount);
    html += row('Aufzeichnung', (sim.duration / WL.SimTime.DAY_SECONDS).toFixed(0) + ' Tage, ' +
      sim.meta.samples + ' Stützstellen');
    html += row('Rechenzeit', sim.meta.simulationMs + ' ms für ' + sim.meta.ticks + ' Schritte');
    html += '</table></div>';

    var days = sim.duration / WL.SimTime.DAY_SECONDS;
    for (var id in sim.features.species) {
      var f = sim.features.species[id];
      html += '<div class="section"><h2>Merkmale ' + f.name + '</h2><table>';
      html += row('Nachtaktivität', pct(f.nightActivity));
      html += row('Zeit auf Gras', pct(f.shareGrass));
      html += row('Zeit im Wald', pct(f.shareForest));
      html += row('Zeit am Wasser', pct(f.shareWater));
      // Sichtbarer Boden ist die kleinste Flaeche der Karte und wird nur von
      // Wildschwein und Kaninchen genutzt - fuer die beiden ist es aber eine
      // der aussagekraeftigsten Zeilen ueberhaupt.
      html += row('Zeit auf Boden', pct(f.shareGround));
      html += row('Zeit über Land', pct(f.shareAir));
      html += row('Tempo (Mittel/bewegt)', f.meanSpeed.toFixed(1) + ' / ' + f.movingSpeed.toFixed(1) + ' u/s');
      html += row('Unruhe', f.restlessness.toFixed(2) + ' rad/s');
      html += row('genutztes Gebiet', Math.round(f.areaUsed / 1000) + 'k u²');
      html += row('Abstand Artgenosse', f.neighbourDistance == null ? '–' : Math.round(f.neighbourDistance) + ' u');
      html += row('feste Orte', f.places.toFixed(1));
      // Nur wandernde Arten zeigen diese Zeile - beim Barsch, der sein
      // Gewaesser nie verlaesst, waere eine 0 mit Warnfarbe schlicht falsch.
      if (f.waterChanges > 0) {
        html += row('Gewässerwechsel', (f.waterChanges / days).toFixed(1) + ' pro Tag',
          f.waterChanges / days >= 2 && f.waterChanges / days <= 5 ? 'ok' : 'warn');
      }
      // Dasselbe fuer Landtiere: nicht Gewaesserwechsel, sondern Trinkgaenge.
      if (f.drinks > 0) {
        html += row('Trinkgänge', (f.drinks / days).toFixed(1) + ' pro Tag',
          f.drinks / days >= 2 && f.drinks / days <= 3 ? 'ok' : 'warn');
      }
      // Und das Gegenstueck beim Kaninchen, das weder wandert noch trinkt:
      // wie oft es in seinen Bau geflohen ist.
      if (f.hides > 0) {
        html += row('Fluchten in den Bau', (f.hides / days).toFixed(1) + ' pro Tag');
      }
      html += '</table></div>';
    }
    return html;
  }

  function create(element) {
    var visible = false;

    var api = {
      isVisible: function () { return visible; },

      toggle: function () {
        visible = !visible;
        element.hidden = !visible;
        return visible;
      },

      update: function (world, renderer, sim) {
        if (!visible || !world) return;
        var v = world.validation;
        var r = world.areaRatios;
        var c = v.counts;
        var t = world.config.targets;
        var stats = renderer.stats();

        var html = '<h2>Kontrollanzeige</h2><table>';
        html += row('Seed', world.seed);
        html += row('Welt', world.width + ' x ' + world.height + ' (' + world.cols + 'x' + world.rows + ' Zellen)');
        html += row('Raster-Hash', world.meta.gridHash);
        html += row('Generierung', world.meta.generationMs + ' ms');
        html += row('Bild-Cache', stats.cacheMs + ' ms / ' + (stats.cachePixels / 1e6).toFixed(1) + ' MPx');
        html += '</table>';

        html += '<div class="section"><h2>Flächen (Ziel)</h2><table>';
        html += row('Gras', pct(r.grass) + ' (größte)');
        html += row('Wald', pct(r.forest) + ' (' + pct(t.forest) + ')');
        html += row('Wasser', pct(r.water) + ' (' + pct(t.water) + ')');
        html += row('Boden', pct(r.visibleGround) + ' (' + pct(world.meta.groundTarget) + ')');
        var ordered = r.grass > r.forest && r.forest > r.water && r.water > r.visibleGround;
        html += row('Reihenfolge', ordered ? 'Gras > Wald > Wasser > Boden' : 'verletzt',
          ordered ? 'ok' : 'bad');
        html += row('größte Wiese', pct(v.mainGrasslandShare) + ' der Karte');
        html += '</table></div>';

        html += '<div class="section"><h2>Objekte</h2><table>';
        html += row('Wasserflächen', c.waterBodies);
        html += row('Waldgebiete', c.forestRegions);
        html += row('Grasflächen', c.grasslands);
        html += row('Bäume', c.trees);
        html += row('Ressourcen', c.resources + ' in ' + c.resourcePatches + ' Bereichen');
        html += row('Apfelbäume', c.appleTrees + ' in ' + c.appleGroups + ' Gruppen');
        html += row('Ameisenhügel', c.anthills);
        html += '</table></div>';

        html += '<div class="section"><h2>Regelprüfung</h2><table>';
        if (v.violations.length === 0) {
          html += row('Verstöße', 'keine', 'ok');
        } else {
          for (var i = 0; i < v.violations.length; i++) {
            html += row(v.violations[i].label, v.violations[i].count + 'x', 'bad');
          }
        }
        for (var w = 0; w < v.warnings.length; w++) {
          html += row('Hinweis', v.warnings[w].label, 'warn');
        }
        html += '</table></div>';

        html += simSection(sim);
        element.innerHTML = html;
      }
    };

    return api;
  }

  WL.DebugOverlay = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
