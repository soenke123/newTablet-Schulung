/**
 * Alle Stellschrauben der Weltgenerierung an einem Ort.
 *
 * Groessen sind in Weltunits angegeben (die Welt ist 1600 x 1000 Units gross).
 * Das Raster mit 5 Units pro Zelle bestimmt nur, wie fein die Formen aufgeloest
 * werden - die Kanten selbst werden als geglaettete Kurven gezeichnet.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  WL.TERRAIN = {
    GROUND: 0,
    GRASS: 1,
    FOREST: 2,
    WATER: 3
  };

  WL.TERRAIN_NAMES = ['Boden', 'Gras', 'Wald', 'Wasser'];

  WL.CONFIG = {
    width: 1600,
    height: 1000,
    cellSize: 5,

    /**
     * Zielverteilung der Flaechen. Reihenfolge laut Vorgabe:
     * Gras > Wald > Wasser > sichtbarer Boden.
     * Gras ergibt sich als Rest, Boden wird an den tatsaechlichen Wasseranteil
     * gekoppelt, damit die Reihenfolge immer eingehalten wird.
     */
    targets: {
      forest: 0.25,
      water: 0.11,
      groundFactorOfWater: 0.8, // Boden = 80% des Wasseranteils
      groundMax: 0.11,
      groundMin: 0.05,
      tolerance: 0.04
    },

    water: {
      bigPonds: [2, 3],
      smallPools: [1, 2],
      bigRadius: [105, 135],
      smallRadius: [42, 66],
      edgeMargin: 110,
      minSeparationBig: 440,
      minSeparationSmall: 240,
      warpScale: 0.0075,     // Frequenz der Randverzerrung
      warpReference: 120,    // Bezugsradius: kleinere Teiche werden staerker verzerrt
      warpLow: 0.58,         // minimaler Radiusfaktor
      warpHigh: 0.85,        // zusaetzlicher Radiusfaktor durch Noise
      minBodyCells: 90,      // kleinere Wasserflecken werden verworfen
      minBodies: 3,
      radiusScaleRange: [0.7, 1.3]
    },

    forest: {
      regions: [2, 3],
      blobsPerRegion: [4, 6],
      blobRadius: [115, 165],
      stepLength: [95, 150],
      turn: 0.6,             // maximale Richtungsaenderung pro Schritt (rad)
      maxSpan: 460,          // maximale Ausdehnung einer Region ab dem Startpunkt
      edgeAnchorChance: 0.6, // Wahrscheinlichkeit, dass eine Region am Rand startet
      minSeparation: 700,
      repelRadius: 560,      // Abstossung fremder Regionen beim Wachsen
      warpScale: 0.0062,
      warpReference: 130,
      warpLow: 0.55,
      warpHigh: 0.88,
      waterBuffer: 3,        // Zellen Abstand zwischen Wald und Wasser
      minRegionCells: 260,
      radiusScaleRange: [0.55, 1.55],
      separationPasses: 3    // Nachbesserung, falls Regionen zusammenwachsen
    },

    grass: {
      noiseScale: 0.0022,
      octaves: 4,
      minPatchCells: 240,    // kleinere Grasflecken werden zu Boden
      minLargestShare: 0.55  // Anteil der groessten Grasflaeche an allem Gras
    },

    trees: {
      minSpacing: 21,
      spacingJitter: 0.45,
      edgeInset: 8,          // Mindestabstand zum Waldrand in Weltunits
      densityScale: 0.006,
      densityFloor: 0.18,
      radius: [11, 17],
      maxCount: 1400
    },

    resources: {
      patches: [3, 5],
      perPatch: [6, 12],
      patchRadius: 42,
      minPatchSeparation: 230,
      minForestDepth: 26,    // Abstand zum Waldrand fuer das Zentrum
      itemSpacing: 13,
      treeClearance: 9
    },

    appleTrees: {
      groups: [2, 3],
      perGroup: [4, 6],
      groupRadius: 58,
      minGroupSeparation: 330,
      minDistToForest: 55,
      minDistToWater: 45,
      treeSpacing: 34,
      radius: [15, 20]
    },

    anthills: {
      count: [3, 4],
      minSeparation: 320,
      minDistToWater: 28,
      minDistToForest: 12,
      radius: [13, 19]
    },

    decor: {
      grassTuftsPerCell: 0.05,
      groundSpecksPerCell: 0.3,
      forestFloorDotsPerCell: 0.06
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
