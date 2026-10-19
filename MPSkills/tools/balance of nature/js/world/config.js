/**
 * Alle Stellschrauben der Inselgenerierung an einem Ort.
 *
 * Groessen sind in Weltunits angegeben. Das Raster (cellSize Units pro Zelle)
 * ist die Wahrheit fuer Logik und Simulation; gezeichnet werden geglaettete
 * Konturen.
 *
 * Die Insel ist fiktiv: Vorbild ist Neuseeland (Tussock-Grasland, Baumfarnwald,
 * Flachs-Suempfe, Vulkan, Thermalfelder), mit einigen fantasievollen
 * Zuspitzungen (Moosnebelwald, farbige Thermalbecken, Lagunen).
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  /**
   * Lebensraeume. Die Zahl ist der Wert im Raster.
   * Reihenfolge = Zeichenreihenfolge der Landflaechen (spaetere liegen oben).
   */
  BT.BIOME = {
    DEEP: 0,       // offenes Meer
    SHALLOW: 1,    // Flachwasser, Lagune
    BEACH: 2,      // Strand
    TUSSOCK: 3,    // Buechelgras-Grasland (trocken, im Regenschatten)
    SCRUB: 4,      // Buschland (Manuka-artig, bluehend)
    FERN: 5,       // Baumfarnwald (feucht, tief bis mittel)
    MOSS: 6,       // Moosnebelwald (feucht, hoch) - fantasievoll
    SWAMP: 7,      // Flachs-Sumpf (sehr feucht, flach)
    ROCK: 8,       // Bergland, Geroell, dunkles Vulkangestein
    PEAK: 9,       // Gipfel, Schnee
    THERMAL: 10,   // Thermalfeld mit farbigen Becken - fantasievoll
    LAKE: 11,      // Suesswassersee
    RIVER: 12,     // Fluss
    // Nutzung durch den Menschen (eco/landuse.js) - entstehen nie bei der
    // Generierung, nur in der Simulation
    SOIL: 13,      // gerodet, nackte Erde
    VILLAGE: 14,   // Dorf, bebaut
    MEADOW: 15,    // auf gerodetem Land nachgewachsene Wiese
    FIELD: 16      // Acker
  };

  BT.BIOME_INFO = [
    { key: 'deep',    name: 'Offenes Meer',    land: false, water: 'salt' },
    { key: 'shallow', name: 'Lagune',          land: false, water: 'salt' },
    { key: 'beach',   name: 'Strand',          land: true },
    { key: 'tussock', name: 'Tussock-Grasland', land: true },
    { key: 'scrub',   name: 'Buschland',       land: true },
    { key: 'fern',    name: 'Farnwald',        land: true },
    { key: 'moss',    name: 'Moosnebelwald',   land: true },
    { key: 'swamp',   name: 'Flachs-Sumpf',    land: true },
    { key: 'rock',    name: 'Bergland',        land: true },
    { key: 'peak',    name: 'Gipfel',          land: true },
    { key: 'thermal', name: 'Thermalfeld',     land: true },
    { key: 'lake',    name: 'See',             land: false, water: 'fresh' },
    { key: 'river',   name: 'Fluss',           land: false, water: 'fresh' },
    { key: 'erde',    name: 'Gerodet (Erde)',  land: true, use: true },
    { key: 'dorf',    name: 'Dorf',            land: true, use: true },
    { key: 'wiese',   name: 'Wiese (nach Rodung)', land: true, use: true },
    { key: 'acker',   name: 'Acker',           land: true, use: true }
  ];

  /** Inselgroessen: gleiche Insel-Logik, andere Flaeche. In der Oberflaeche heisst
   *  'mittel' "klein" (die fruehere kleine Insel ist entfallen, dort starben die Wolfe meist aus). */
  BT.ISLAND_SIZES = {
    mittel: { width: 2400, height: 1600 },
    gross:  { width: 3200, height: 2150 }
  };

  /**
   * Inseltypen: dieselbe Insel (gleicher Seed = gleiche Kueste, Berge, Fluesse),
   * nur die Schwellen der Lebensraeume verschoben. Die Feuchte ist nach Rang
   * verteilt, also verschieben scrub-/fernMoisture direkt die Flaechenanteile.
   * Werte hier ueberschreiben BT.CONFIG. 'ausgewogen' ist die bisherige Insel.
   */
  BT.ISLAND_TYPES = {
    ausgewogen: {},
    // Gemessen mit tools/balance.js 8 30 (Mittel ab Jahr 10, ausgewogen: Hirsch 235,
    // Vogel 343, Wolf 55, Adler 12, alle Arten überlebt 12 von 16):
    // gras: Hirsch +29 %, Wolf +47 %, Vogel -24 %, Adler gleich; 7 von 8
    gras: { biome: { scrubMoisture: 0.63, fernMoisture: 0.80 } },
    // wald (mehr Busch statt nur hoher Wald, sonst verhungern die Adler: Deckung):
    // Vogel +17 %, Adler +13 %, Hirsch -20 %, Wolf -24 %; 12 von 16
    wald: { relief: { region: 0.34 }, biome: { scrubMoisture: 0.30, fernMoisture: 0.62, forest: { moisture: 0.55, moss: 0.22 } } },
    // fels (Bergland und Gipfel sind der groesste Lebensraum, mehr und hoehere Bergruecken):
    // weniger Futter fuer alle, Hirsch -8 %, Vogel -15 %, Wolf -18 %, Adler -33 %;
    // Adler stirbt oefter aus (5 von 8) - gewollt: die schwierige Insel
    fels: {
      relief: { region: 0.34, highland: 0.42, ridges: [0, 1], cliffs: { arc: 0.75, cells: 12, height: 0.6 },
        range: { count: [6, 8], length: [0.1, 0.22], width: [0.03, 0.05], height: [0.35, 0.6] } },
      biome: { rockHeight: 0.34, peakHeight: 0.84 }
    }
  };

  BT.CONFIG = {
    type: 'ausgewogen',
    size: 'mittel',
    cellSize: 6,

    shape: {
      // Grundform: verzerrte Ellipse, die zum Rand hin abfaellt.
      radiusX: 0.40,          // Halbachsen relativ zur Weltgroesse
      radiusY: 0.38,
      warpScale: 2.2,         // Frequenz der Randverzerrung (relativ zur Insel)
      warpAmount: 0.38,
      detailScale: 6.0,       // feine Kuestenausfransung
      detailAmount: 0.10,
      lobes: [2, 4],          // Halbinseln
      lobeSize: [0.25, 0.42],
      seaLevel: 0.0,
      minLandShare: 0.36,     // Anteil Land an der Weltflaeche
      maxLandShare: 0.55
    },

    relief: {
      ridges: [1, 2],                 // Bergruecken
      ridgeLength: [0.4, 0.7],        // relativ zur Inselbreite
      ridgeWidth: [0.07, 0.11],
      ridgeHeight: [0.6, 0.85],
      volcano: true,
      volcanoRadius: [0.065, 0.09],   // relativ zur Inselbreite
      volcanoHeight: 0.85,
      craterRadius: 0.42,             // Anteil am Vulkanradius
      craterDepth: 0.30,
      basins: [2, 4],                 // Mulden, in denen Seen entstehen koennen
      basinRadius: [0.035, 0.06],
      basinDepth: [0.06, 0.10],
      hillNoise: 0.22                 // huegeliges Rauschen ueberall
    },

    climate: {
      windAngle: [-0.35, 0.35],       // vorherrschender Westwind (rad, 0 = von Westen)
      rainShadow: 1.15,               // Staerke des Regenschattens hinter Bergen
      moistureNoise: 0.35
    },

    water: {
      lakeMinDepth: 0.008,            // Mindesttiefe einer Senke, um See zu werden
      lakeMinCells: 25,
      maxLakes: 6,
      riverThreshold: 320,            // Einzugsgebiet (Zellen) ab dem ein Fluss beginnt
      riverMinLength: 28,             // kuerzere Flusssysteme (in Zellen) entfallen
      meander: 0.06,                  // Rauschen auf der Abflusshoehe
      riverWidthMin: 4,               // Weltunits
      riverWidthMax: 18,
      shallowCells: 9                 // Breite der Lagune um die Kueste
    },

    biome: {
      beachCells: 3.6,
      rockHeight: 0.55,               // Hoehe ab der Bergland beginnt
      peakHeight: 0.80,
      mossHeight: 0.33,               // feuchter Wald oberhalb dieser Hoehe = Moosnebelwald
      swampMoisture: 0.80,
      swampMaxHeight: 0.24,
      swampMaxSlope: 0.012,
      swampFreshCells: 7,             // Sumpf nur nahe Fluss oder See
      fernMoisture: 0.66,
      scrubMoisture: 0.50,            // darunter Tussock
      thermalPatches: [2, 4],
      thermalRadius: [55, 95],        // Weltunits
      minPatchCells: 30               // kleinere Flecken werden vom Umfeld geschluckt
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
