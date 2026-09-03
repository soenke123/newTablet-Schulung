/**
 * Raeumliche Abfragen und Platzierungsregeln.
 *
 * Alle Objektplatzierungen laufen ueber dieses Modul, damit die verbotenen
 * Kombinationen an genau einer Stelle definiert sind:
 *
 *   Wald x Wasser, Baum x Wasser, Baum ausserhalb Wald,
 *   Ressource x Wasser, Ressource ausserhalb Wald,
 *   Apfelbaum x Wasser, Apfelbaum x Wald, Ameisenhuegel x Wasser
 *
 * Spaeter nutzt die Tier-KI dieselben Abfragen ("wo ist Wasser?", "wie tief bin
 * ich im Wald?"), deshalb liegen sie bewusst nicht im Generator selbst.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var T = WL.TERRAIN;

  /**
   * @param {{cols:number, rows:number, cellSize:number, grid:Object, fields:Object}} data
   */
  function createQuery(data) {
    var cols = data.cols;
    var rows = data.rows;
    var cellSize = data.cellSize;
    var grid = data.grid;
    var fields = data.fields;
    var width = cols * cellSize;
    var height = rows * cellSize;

    function cellX(x) { return Math.floor(x / cellSize); }
    function cellY(y) { return Math.floor(y / cellSize); }

    var q = {
      width: width,
      height: height,
      cellSize: cellSize,

      inBounds: function (x, y) {
        return x >= 0 && y >= 0 && x < width && y < height;
      },

      terrainAt: function (x, y) {
        var cx = cellX(x), cy = cellY(y);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
        return grid.data[cy * cols + cx];
      },

      isWater: function (x, y) { return q.terrainAt(x, y) === T.WATER; },
      isForest: function (x, y) { return q.terrainAt(x, y) === T.FOREST; },
      isGrass: function (x, y) { return q.terrainAt(x, y) === T.GRASS; },
      isGround: function (x, y) { return q.terrainAt(x, y) === T.GROUND; },
      isOpen: function (x, y) {
        var t = q.terrainAt(x, y);
        return t === T.GRASS || t === T.GROUND;
      },

      /** Abstand zur naechsten Wasserzelle in Weltunits. */
      distToWater: function (x, y) { return sample(fields.distToWater, x, y); },
      /** Abstand zur naechsten Waldzelle in Weltunits (0 im Wald). */
      distToForest: function (x, y) { return sample(fields.distToForest, x, y); },
      /** Abstand zum Waldrand fuer Punkte im Wald (0 ausserhalb). */
      forestDepth: function (x, y) { return sample(fields.forestDepth, x, y); },

      /** Zellindex einer Weltposition, oder -1 ausserhalb der Karte. */
      cellIndex: function (x, y) {
        var cx = cellX(x), cy = cellY(y);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return -1;
        return cy * cols + cx;
      },

      /** Weltmittelpunkt einer Zelle. */
      cellCenter: function (index) {
        var cx = index % cols;
        var cy = (index - cx) / cols;
        return { x: (cx + 0.5) * cellSize, y: (cy + 0.5) * cellSize };
      }
    };

    function sample(field, x, y) {
      var cx = cellX(x), cy = cellY(y);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
      return field[cy * cols + cx] * cellSize;
    }

    return q;
  }

  /** Regeln pro Objekttyp - eine Wahrheit fuer Platzierung und Validierung. */
  var placement = {
    tree: function (q, p, cfg) {
      return q.isForest(p.x, p.y) && q.forestDepth(p.x, p.y) >= cfg.trees.edgeInset;
    },
    resource: function (q, p, cfg) {
      return q.isForest(p.x, p.y) && q.forestDepth(p.x, p.y) >= cfg.resources.itemSpacing * 0.4;
    },
    resourcePatch: function (q, p, cfg) {
      return q.isForest(p.x, p.y) && q.forestDepth(p.x, p.y) >= cfg.resources.minForestDepth;
    },
    appleTree: function (q, p, cfg) {
      return q.isGrass(p.x, p.y) &&
        q.distToWater(p.x, p.y) >= cfg.appleTrees.minDistToWater * 0.6 &&
        q.distToForest(p.x, p.y) >= cfg.appleTrees.minDistToForest * 0.5;
    },
    appleGroup: function (q, p, cfg) {
      return q.isGrass(p.x, p.y) &&
        q.distToWater(p.x, p.y) >= cfg.appleTrees.minDistToWater &&
        q.distToForest(p.x, p.y) >= cfg.appleTrees.minDistToForest;
    },
    anthill: function (q, p, cfg) {
      return q.isOpen(p.x, p.y) &&
        q.distToWater(p.x, p.y) >= cfg.anthills.minDistToWater &&
        q.distToForest(p.x, p.y) >= cfg.anthills.minDistToForest;
    },

    /**
     * Der Bau des Kaninchens. Die einzige Regel hier, die kein Weltobjekt
     * betrifft - die Simulation setzt den Bau selbst (data/tiere.md §1,
     * "Heimatorte"), aber eine Platzierungsregel gehoert laut Konvention
     * trotzdem hierher und nicht in das Tier.
     *
     * Deshalb ist der dritte Parameter auch nicht world.config wie oben,
     * sondern der home-Block der Art aus js/sim/species.js: die Zahlen einer
     * Tierart stehen dort, die Regel steht hier.
     *
     * Der Wasserabstand ist kein Naturgesetz, sondern Ruecksicht: das
     * Kaninchen soll den Enten nicht ans Ufer laufen und deren bereits
     * justierte Werte verschieben.
     */
    burrow: function (q, p, home) {
      return q.isOpen(p.x, p.y) && q.distToWater(p.x, p.y) >= home.minDistToWater;
    },

    /**
     * Der Bau des Dachses - derselbe Gedanke wie beim Kaninchen (die Simulation
     * setzt den Ort, die Regel dafuer gehoert trotzdem hierher), nur mit
     * anderer Oberflaeche: der Dachs liegt tagsueber im Wald, nicht auf offenem
     * Gelaende. Eine *Mindest*-Wasserdistanz ist hier nicht verlangt
     * (data/tiere.md, Dachs) - minDistToWater ist deshalb optional und faellt
     * ohne Angabe auf 0 zurueck.
     *
     * Umgekehrt gibt es zwei *Hoechst*-Abstaende: der Bau soll nah am Wasser und
     * nah an einem Ameisenhuegel liegen (beides home.maxDistToWater /
     * home.maxDistToAnthill, je 300 u). Das ist keine Biologie, sondern eine
     * Entscheidung ueber das Bild: liegen Trinkstelle und Lieblingsnahrung weit
     * auseinander, verbringt der Dachs die ganze Nacht auf zwei langen Strecken
     * hin und zurueck und kommt nie zum Umherstreifen.
     *
     * hills sind die Ameisenhuegel (world.objects.anthills). slack weitet beide
     * Hoechstabstaende auf, wenn ein Seed die enge Fassung nicht hergibt;
     * slack <= 0 laesst beide Bedingungen ganz fallen - die letzte Stufe, damit
     * auf einer unguenstigen Karte nicht die ganze Art ausfaellt.
     */
    forestBurrow: function (q, p, home, hills, slack) {
      if (!q.isForest(p.x, p.y)) return false;
      var toWater = q.distToWater(p.x, p.y);
      if (toWater < (home.minDistToWater || 0)) return false;
      if (!(slack > 0)) return true;
      if (home.maxDistToWater && toWater > home.maxDistToWater * slack) return false;
      if (home.maxDistToAnthill &&
        !withinAny(p, hills, home.maxDistToAnthill * slack)) return false;
      return true;
    },

    /**
     * Der Bau des Fuchses - die dritte Regel dieser Art (nach Kaninchen und
     * Dachs) und die erste, deren Bedingung keine Entfernung ist, sondern eine
     * *Form*: der Bau liegt im Wald und innerhalb des eigenen Reviers.
     *
     * Die Reviergeometrie kommt als Funktion herein (inRange(x, y)) und nicht
     * als Zahlenpaar. Das ist Absicht: eine Blase mit Wellen laesst sich nicht
     * als Radius ausdruecken, und ihre Erzeugung gehoert zum Tier
     * (js/sim/fox.js), waehrend die Bedingung "im Wald und im Revier" hierher
     * gehoert wie jede andere Platzierungsregel auch.
     *
     * Wie beim Dachs ohne Tiefenanforderung: der Fuchs liegt im Wald, nicht
     * ausdruecklich tief darin wie das Wildschwein.
     */
    foxDen: function (q, p, home, inRange) {
      if (!q.isForest(p.x, p.y)) return false;
      return !inRange || inRange(p.x, p.y);
    },

    /**
     * Der Horst des Bussards - die vierte Regel dieser Art und die einzige,
     * die an einem *vorhandenen* Weltobjekt haengt: gesucht wird kein Punkt im
     * Wald, sondern ein Baum darin (data/tiere.md: "hoher Baum"). Geprueft wird
     * hier trotzdem nur der Ort, nicht der Baum - der Aufrufer zieht die
     * Kandidaten aus world.objects.trees und fragt hier nach, ob die Stelle
     * taugt.
     *
     * minForestDepth haelt den Horst aus dem Waldsaum heraus: dort sitzt der
     * Bussard tagsueber ohnehin schon (seine Sitzpausen suchen genau die Tiefe
     * 1-4), und ein Schlafplatz an derselben Stelle wuerde die beiden Orte im
     * Merkmalsvektor zu einem einzigen verschmelzen.
     */
    eyrie: function (q, p, home) {
      return q.isForest(p.x, p.y) && q.forestDepth(p.x, p.y) >= home.minForestDepth;
    },

    /**
     * Der Ankerpunkt des Igels - die fuenfte Regel dieser Art und die einzige,
     * die keinen Schlafplatz beschreibt, sondern einen *Futterplatz*: der Igel
     * hat keinen Bau, er schlaeft dort, wo die Nacht ihn zurueckgelassen hat.
     *
     * Der Anker ist immer ein Apfelbaum (data/tiere.md §4: "mindestens ein
     * Apfelbaum ist dabei"), er wird vom Aufrufer aus world.objects.appleTrees
     * gezogen - hier steht nur die Bedingung an den Ort. Und die ist eine
     * einzige: Wasser in Reichweite. Der Igel trinkt jede Nacht genau einmal,
     * und bei 10 u/s ist ein weiter Trinkgang keine Zusatzstrecke, sondern die
     * halbe Nacht (dieselbe Ueberlegung wie beim Dachsbau, nur mit einem
     * langsameren Tier und deshalb schaerfer).
     *
     * slack weitet den Hoechstabstand auf, wenn ein Seed die enge Fassung nicht
     * hergibt - dieselbe Vorsicht wie bei jedem Heimatort hier.
     */
    hedgehogRange: function (q, p, home, slack) {
      return q.distToWater(p.x, p.y) <= home.maxDistToWater * (slack || 1);
    }
  };

  /** Liegt p naeher als radius an mindestens einem der Punkte? */
  function withinAny(p, points, radius) {
    if (!points) return false;
    for (var i = 0; i < points.length; i++) {
      var dx = points[i].x - p.x;
      var dy = points[i].y - p.y;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  }

  WL.Rules = {
    createQuery: createQuery,
    placement: placement
  };
})(typeof window !== 'undefined' ? window : globalThis);
