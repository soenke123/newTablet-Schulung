/**
 * Artentabelle - die fachliche Wahrheit der Simulation steht in Daten, nicht
 * im Code. Eine neue (oder eingeschleppte) Art ist ein neuer Eintrag; das
 * Verhalten in eco/behavior.js ist fuer alle Arten dasselbe.
 *
 * Alle Zahlen sind Startwerte fuer die Abstimmung (tools/balance.js), keine
 * biologisch kalibrierten Daten. Zeiten in Jahren werden mit BT.Time.years()
 * in Tage umgerechnet.
 *
 * Einheiten:
 *   energy     0..1, Anteil der vollen Reserve
 *   speed      Weltunits pro Tick
 *   range      Weltunits
 *   costPerDay Energieverbrauch pro Tag (Anteil der Reserve)
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var B = BT.BIOME;

  // ------------------------------------------------------------ Nahrungsschichten
  /**
   * Pflanzen und Insekten sind Felder (ein Wert je Weidezelle), keine Tiere.
   * capacity: maximale Menge je Weidezelle und Lebensraum
   * growth:   Wachstumsrate pro Tag. Pflanzen wachsen aus ihrer Blattmasse: halb
   *           abgefressen waechst am schnellsten nach, kahl gefressen nur sehr
   *           langsam (aus dem Rest `seed`, Wurzeln und Samenbank).
   * seed:     Rest, aus dem auch eine kahle Flaeche nachwaechst (Anteil von capacity)
   * season:   Wachstumsfaktor je Jahreszeit [Fruehling, Sommer, Herbst, Winter]
   * water:    so viel Durst loescht eine gefressene Einheit (Pflanzen enthalten Wasser,
   *           Fruechte und Insekten mehr als Gras) - Trinken bleibt trotzdem noetig
   * damage:   Ueberweidung. Wird eine Weidezelle immer wieder unter `below` (Anteil der
   *           Kapazitaet) abgefressen, sinkt ihr Pflanzenzustand um `loss` je Tag: die
   *           Pflanzen sterben ab, es waechst weniger nach. Erst nach `rest` Tagen ohne
   *           Ueberweidung erholt sich der Zustand, um `recover` je Tag (mal Jahreszeit,
   *           mal 0,2 + 0,8 * Zustand: kahler Boden braucht am laengsten). Voellig
   *           ueberweidet traegt die Zelle nur noch `dead` (Anteil der Kapazitaet).
   *           area: statt der einzelnen Zelle zaehlt die Umgebung (so viele Weidezellen
   *           im Umkreis, gemessen an dem, was sie heute traegt) - fuer Nahrung, die ein
   *           Trupp im Vorbeiziehen abfrisst. season: Jahreszeiten, in denen Schaden
   *           entsteht (sonst jede mit kraeftigem Wachstum).
   * healthOf: diese Schicht haengt am Zustand einer anderen (Fruechte an den Bueschen)
   * decay:    Schwund pro Tag je Jahreszeit (Fruechte verrotten, Insekten sterben im Winter)
   * mast:     in einem Mastjahr steigt die Kapazitaet um diesen Faktor (Sommer/Herbst)
   */
  BT.FOOD = {
    gras: {
      name: 'Gras und Kräuter',
      water: 0.04,
      growth: 0.13, seed: 0.05,
      season: [1.5, 1.0, 0.7, 0.3],
      damage: { below: 0.25, loss: 0.05, recover: 0.006, rest: 60, dead: 0.02 },
      capacity: cap({ TUSSOCK: 13, SCRUB: 5.5, SWAMP: 6, BEACH: 1.66, FERN: 1.66, MOSS: 1.1, THERMAL: 1.66, ROCK: 1.1, MEADOW: 8.8 })
    },
    laub: {
      name: 'Triebe und Laub',
      water: 0.06,
      growth: 0.1, seed: 0.05,
      season: [1.4, 1.0, 0.6, 0.25],
      damage: { below: 0.3, loss: 0.03, recover: 0.004, rest: 60, dead: 0.02 },
      capacity: cap({ FERN: 7.04, MOSS: 5.28, SCRUB: 6.16, SWAMP: 1.76, TUSSOCK: 0.88, MEADOW: 0.88 })
    },
    frucht: {
      name: 'Früchte und Samen',
      water: 0.16,
      growth: 0.18, seed: 0.05,
      season: [0.2, 1.0, 1.6, 0.0],
      decay: [0, 0, 0.015, 0.07],
      mast: 2.4,
      healthOf: 'laub',
      capacity: cap({ SCRUB: 3.3, FERN: 2.2, MOSS: 1.65, TUSSOCK: 1.1, SWAMP: 1.1, MEADOW: 0.55 })
    },
    insekten: {
      name: 'Insekten',
      water: 0.14,
      growth: 0.3, seed: 0.35,          // Eier und Larven ueberwintern
      season: [1.3, 1.5, 0.7, 0.05],
      decay: [0, 0, 0.03, 0.12],
      // Zu viele Laufvoegel scharren ganze Gegenden leer: Larven und Puppen
      // fehlen, im naechsten Jahr schluepfen weniger Insekten
      damage: { below: 0.3, area: 2, season: [0, 1, 1, 0], loss: 0.1, recover: 0.006, rest: 120, dead: 0.03 },
      capacity: cap({ SWAMP: 3.85, FERN: 2.2, MOSS: 1.65, TUSSOCK: 1.65, SCRUB: 1.65, BEACH: 0.55, MEADOW: 1.65 })
    },
    // Getreide waechst nur auf dem Acker: gesaet im Fruehling, geerntet zu
    // Beginn des Herbstes (eco/humans.js), danach Stoppeln bis zum naechsten Jahr
    korn: {
      name: 'Getreide',
      water: 0.05,
      growth: 0.2, seed: 0.1,         // seed: die Saat
      season: [1.4, 1.1, 0, 0],
      capacity: cap({ FIELD: 14 })
    },
    // Grasnarbe: der unterste Teil des Grases, so kurz, dass nur Schafe ihn abbeissen
    // (kein heimisches Tier frisst ihn). Haengt am Zustand des Grases.
    narbe: {
      name: 'Grasnarbe',
      water: 0.02,
      growth: 0.05, seed: 0.1,
      season: [1.5, 1.0, 0.7, 0.3],
      healthOf: 'gras',
      capacity: cap({ TUSSOCK: 2.75, SCRUB: 1.4, SWAMP: 1.65, BEACH: 0.4, FERN: 0.4, MOSS: 0.3, THERMAL: 0.4, ROCK: 0.3, MEADOW: 2.2 })
    }
  };
  BT.FOOD_ORDER = ['gras', 'laub', 'frucht', 'insekten', 'korn', 'narbe'];

  function cap(byName) {
    var arr = new Array(BT.BIOME_INFO.length).fill(0);
    for (var k in byName) arr[B[k]] = byName[k];
    return arr;
  }

  // ------------------------------------------------------------ Arten
  /*
   * sprites: Bilder auf der Karte, assets/<name>_<f|m|j>_<Datei der Haltung>.png
   *          (j = Jungtier). Haltungen: move, stand, eat, rest; fehlt `stand`,
   *          wird `move` genommen. facing: Blickrichtung der Bilder.
   *          lighten: hellt die Bilder auf (Farbe, mit der die dunklen Toene aufgehellt werden).
   *          tint: faerbt die Bilder ein (Platzhalter: eine Art mit den Bildern einer anderen).
   * scheu:   wie stark die Art Menschen meidet (0..1, mal Stoerung, eco/humans.js)
   * scarce:  Suchbild (eco/behavior.js): Sieht ein Raeuber im Mittel der letzten Wochen weniger
   *          als so viele Tiere dieser Art je 100 x 100 Sichtflaeche, sucht er nur noch halb so
   *          gezielt nach ihr, bei sehr wenigen kaum noch. Er kennt nur seine Umgebung, nicht den
   *          Bestand der Insel; die Schwelle gilt deshalb fuer jede Inselgroesse.
   * introduced: kommt erst mit den Menschen auf die Insel (Startbestand 0, eco/humans.js).
   *          Die heimischen Arten bleiben unveraendert; eine eingeschleppte Art bringt
   *          ihre Beziehungen zu ihnen selbst mit:
   *   preyOf:     { raeuber: Gewicht } - so gern fressen heimische Raeuber diese Art
   *               (wird beim Laden in deren prey eingetragen; ohne die Art wirkungslos)
   *   preyMaxAgeOf: { raeuber: Alter } - nur Jungtiere bis zu diesem Alter
   *   unknownTo:  [arten] - diese Arten kennen den Raeuber nicht und fliehen nicht (Inselzahmheit)
   *   easyPrey:   so viel leichter gelingt ein Angriff auf diese Art (Faktor auf den Jagderfolg)
   * fleeToWater: [durstig, verzweifelt] (0..1): gejagt flieht die Gruppe zum Wasser, durstig nur vom
   *          Raeuber weg, verzweifelt auch seitlich (nur nicht direkt auf ihn zu). Verzweifelt flieht
   *          sie nur vor Raeubern naeher als 60 und geht sonst trinken
   */
  var Y = function (y) { return BT.Time.years(y); };

  BT.SPECIES = {
    zwerghirsch: {
      id: 'zwerghirsch',
      name: 'Zwerghirsch',
      plural: 'Zwerghirsche',
      role: 'herbivore',
      sprites: { name: 'hirsch', facing: 'right', lighten: '#3c322a', poses: { move: 'gehend', stand: 'stehend', eat: 'essend', rest: 'liegend' } },
      size: 24,                       // Weltunits (Darstellung)
      color: '#c9874a',
      group: { kind: 'herd', min: 2, max: 16, spread: 26, start: [5, 10] },
      start: 300,                     // Tiere zu Beginn
      scarce: 1.3,                    // Suchbild: als Beute halb so gefragt, wenn der Raeuber weniger als 1,3 je 100 x 100 sieht
      // Nahrung: Energie je verzehrter Einheit
      diet: { gras: 0.11, laub: 0.09, korn: 0.14 },   // Getreide: nahrhaft und lecker
      bite: 0.38,                     // Einheiten je Fressschritt und Tier
      costPerDay: 0.05,
      winterCost: 0.015,              // zusaetzlich im Winter
      // Kein Durst: Auf der regenreichen Insel finden die Tiere ueberall Wasser.
      // thirstDays > 0 schaltet ihn wieder ein (so viele Tage ohne Wasser, dann Tod)
      thirstDays: 0,
      speed: 4.5, fleeSpeed: 13, sprintTicks: 4,
      vision: 180,                    // erkennt Raeuber
      scheu: 1.0,                     // meidet Menschen (0..1, eco/humans.js)
      searchRadius: 260,              // sucht Futter
      habitat: pref({ TUSSOCK: 1.0, SCRUB: 1.0, FERN: 0.8, SWAMP: 0.5, MOSS: 0.5, BEACH: 0.3, THERMAL: 0.3, ROCK: 0.15, PEAK: 0, MEADOW: 1.0, SOIL: 0.1, FIELD: 1.0 }),
      maturity: Y(1), maxAge: Y(8),
      // food: weniger Kaelber, je weiter die Weiden ringsum abgefressen sind
      breed: { kind: 'each-female', season: 0, day: 4, chance: 0.85, litter: [1, 1], minEnergy: 0.4, cost: 0.15,
        food: { key: 'gras', r: 3, low: 0.3, high: 0.65 } },
      newbornEnergy: 0.6,
      meat: 3                       // Energie, die ein erlegtes Tier liefert
    },

    laufvogel: {
      id: 'laufvogel',
      name: 'Laufvogel',
      plural: 'Laufvögel',
      role: 'herbivore',
      sprites: { name: 'laufvogel', facing: 'right', poses: { move: 'gehend', eat: 'essend', rest: 'sitzend' } },
      size: 18,
      color: '#5d8fc9',
      group: { kind: 'flock', min: 2, max: 6, spread: 16, start: [2, 4] },
      start: 160,                     // Tiere zu Beginn
      scarce: 0.5,
      diet: { frucht: 0.1, insekten: 0.11, korn: 0.1 },   // kein Gras: das Gras haengt allein an den Hirschen; Koerner vom Acker (inselzahm) schon
      bite: 0.32,
      costPerDay: 0.055,
      winterCost: 0.015,
      thirstDays: 0,                  // kein Durst (siehe Zwerghirsch)
      speed: 3.2, fleeSpeed: 11, sprintTicks: 3,
      vision: 120,
      scheu: 0.2,                     // inselzahm: kennt keine Menschen
      searchRadius: 200,
      habitat: pref({ SCRUB: 1.0, FERN: 1.0, MOSS: 0.8, SWAMP: 0.9, TUSSOCK: 0.7, BEACH: 0.4, THERMAL: 0.3, ROCK: 0.1, PEAK: 0, MEADOW: 0.6, SOIL: 0.1, FIELD: 0.4 }),
      maturity: Y(1), maxAge: Y(7),
      // Bodenbrueter: Gelege im Fruehling, Kueken schluepfen nach einigen Tagen
      breed: { kind: 'pair', season: 0, day: 2, chance: 0.85, litter: [2, 4], minEnergy: 0.35, cost: 0.15, incubation: 8 },
      newbornEnergy: 0.55,
      meat: 0.6
    },

    inselwolf: {
      id: 'inselwolf',
      name: 'Inselwolf',
      plural: 'Inselwölfe',
      role: 'predator',
      sprites: { name: 'wolf', facing: 'left', poses: { move: 'gehend', stand: 'stehend', eat: 'essend', rest: 'liegend' } },
      size: 22,
      color: '#7c7c86',
      group: { kind: 'pack', min: 1, max: 12, spread: 18, start: [3, 5] },
      start: 40,                      // Tiere, verteilt auf Rudel
      prey: { zwerghirsch: 1.0, laufvogel: 0.13 },   // Laufvoegel nur, wo sehr viele sind (unter 0,12 nie)
      // Wie sein Vorbild frisst er nebenher Insekten und Fruechte - das traegt
      // ihn durch Zeiten mit wenig Beute, reicht aber nicht fuer Nachwuchs
      diet: { frucht: 0.06, insekten: 0.06 },
      dietSeason: [0.6, 0.6, 0.8, 1], // so viel davon je Jahreszeit (vorher 0,3 / 0,3 / 0,5 / 1): haelt die Woelfe
                                      // durch Jahre mit wenigen Hirschen, ohne die Hirsche staerker zu jagen
      bite: 0.15,
      costPerDay: 0.052,
      winterCost: 0.015,
      thirstDays: 0,                  // kein Durst (siehe Zwerghirsch)
      speed: 6, chaseSpeed: 19,
      vision: 230,
      scheu: 0.9,
      huntChance: 0.32,               // je Angriff und Jaeger, steigt mit der Rudelgroesse
      maxChaseTicks: 12,
      territory: 380,                 // Radius des Reviers
      hungry: 0.7,                    // jagt, wenn Energie darunter
      habitat: pref({ TUSSOCK: 1, SCRUB: 1, FERN: 1, MOSS: 1, SWAMP: 0.7, BEACH: 0.6, THERMAL: 0.6, ROCK: 0.6, PEAK: 0.1, MEADOW: 1, SOIL: 0.6, FIELD: 0.8 }),
      maturity: Y(1.5), maxAge: Y(9),
      // minEnergy 0,45 (vorher 0,5): Bei Hirschen an der Grenze des Futters lagen die Woelfe im
      // Fruehling um 0,5, viele Wuerfe fielen aus, und wenige Rudel erholten sich nicht mehr
      breed: { kind: 'group-pair', season: 0, day: 6, chance: 0.85, litter: [2, 4], minEnergy: 0.45, cost: 0.15 },
      newbornEnergy: 0.6,
      // Mehr Jagd mit Welpen (rearing: { age: Y(0.5), hungry: 0.76 }) wurde
      // getestet: die Woelfe ueberjagen dann die Hirsche und sterben haeufiger aus
      disperse: { season: 2, minAge: Y(1.5), minGroup: 4, chance: 0.6 },
      meat: 1.2
    },

    inseladler: {
      id: 'inseladler',
      name: 'Inseladler',
      plural: 'Inseladler',
      role: 'predator',
      sprites: { name: 'adler', facing: 'right', poses: { move: 'fliegend', stand: 'stehend', eat: 'essend', rest: 'sitzend' } },
      size: 22,
      color: '#b0703a',
      flies: true,
      group: { kind: 'pair', min: 1, max: 3, spread: 30, start: [2, 2] },
      start: 12,                      // Tiere, verteilt auf Paare
      // Greift Jungtiere des Hirschs und Laufvoegel an, sieht nicht unter Baeume
      prey: { laufvogel: 1.0, zwerghirsch: 0.25 },   // Kaelber selten: sonst fehlen sie den Woelfen
      preyMaxAge: { zwerghirsch: Y(0.5) },
      costPerDay: 0.03,
      winterCost: 0.005,
      thirstDays: 0,                  // trinkt nicht (Wasser aus der Beute)
      speed: 8, chaseSpeed: 22,
      vision: 300,
      scheu: 0.5,
      huntChance: 0.3,
      maxChaseTicks: 6,
      territory: 330,
      // Junge Adler ohne Revier (Floater) werden geduldet: sie jagen ueberall,
      // nur nicht naeher als `core` am Horst eines Paares, und sind bis zum
      // Erwachsenenalter ungeuebt (Jagderfolg mal `skill`)
      floater: { core: 150, skill: 0.85 },
      // Je mehr andere Adler im Umkreis jagen, desto seltener gelingt ein Angriff
      crowding: { radius: 250, k: 0.25 },
      hungry: 0.65,
      habitat: pref({ TUSSOCK: 1, SCRUB: 1, FERN: 1, MOSS: 1, SWAMP: 1, BEACH: 1, THERMAL: 1, ROCK: 1, PEAK: 1, MEADOW: 1, SOIL: 1, VILLAGE: 0.5, FIELD: 1 }),
      maturity: Y(2), maxAge: Y(14),
      // Horst: Ein Paar mit Revier legt im Fruehling 2-3 Eier. Brut: einer sitzt,
      // der andere jagt, bei jeder Beute wird gewechselt. Nestlinge: beide jagen
      // und fuettern. Flugge Junge verlassen den Horst und suchen sich ein Revier.
      breed: { kind: 'horst', season: 0, day: 1, chance: 0.85, litter: [1, 3], minEnergy: 0.55, cost: 0.1 },
      horst: {
        incubation: 10,               // Tage Brut
        nestling: 15,                 // Tage, bis die Kueken fluegge sind
        dependence: 60,               // Tage, die die Jungen danach noch mit den Eltern fliegen und mitfressen
        radius: 300,                  // gejagt wird in diesem Umkreis um den Horst
        hungry: 0.95,                 // jagt fast ununterbrochen
        huntBonus: 1.3,               // kennt die Umgebung des Horsts genau
        abandon: 0.25,                // sinkt die Energie des Brutvogels (oder beider Eltern) darunter, wird die Brut aufgegeben
        chickCost: 0.045,              // Kueken wachsen: zusaetzlicher Verbrauch je Tag
        selfFirst: 0.4,               // so weit fressen die Eltern sich zuerst satt
        sites: pref({ FERN: 1, MOSS: 1, ROCK: 1, PEAK: 0.8, SCRUB: 0.5 })   // Baeume und Felsen
      },
      newbornEnergy: 0.6,
      disperse: { season: 2, minAge: Y(1), minGroup: 3, chance: 1 },
      meat: 0.8
    }
  };

  // ------------------------------------------------------------ mit den Menschen eingeschleppt
  /*
   * Startbestand 0. Sie kommen ueber die Karten "Schafweide" und "Huetehunde"
   * auf die Insel und brechen nach einigen Jahren aus (eco/humans.js). Ihre Bilder
   * liegen in eigenen Ordnern (assets/schaf, assets/hund).
   */
  BT.SPECIES.schaf = {
    id: 'schaf',
    name: 'Schaf',
    plural: 'Schafe',
    role: 'herbivore',
    introduced: true,
    sprites: { name: 'schaf/schaf', facing: 'right', poses: { move: 'gehend', stand: 'stehend', eat: 'essend', rest: 'sitzend' } },
    size: 17,                       // das Bild fuellt den Rahmen mehr aus als beim Hirsch
    color: '#e05ad8',
    // Grosse Herden bis 100, mit Abstand (spacing: Weltunits je Tier, der Radius waechst mit
    // der Herde). split: Ist die Herde ab `min` Tieren im Mittel hungriger als `energy`, zieht
    // die Haelfte dist[0]..dist[1] weit auf eine neue Weide; danach `rest` Tage Ruhe.
    group: { kind: 'herd', min: 3, max: 100, spread: 30, spacing: 10, start: [8, 8],
      split: { min: 24, energy: 0.5, rest: 90, dist: [250, 500] } },
    start: 0,
    // Suchbild: Ein Rudel (Sicht 230) sucht erst gezielt nach Schafen, wenn es etwa 15 im Blick hat.
    // Mit 0,3 galten schon 6 frisch ausgebrochene Schafe als Suchbild, und sie wurden meist gefressen
    scarce: 0.9,
    // Leichte Beute: Woelfe (und Hunde) nehmen Schafe lieber als Hirsche, Adler nur Laemmer.
    // Wenige Schafe schuetzt das Suchbild (scarce): Ausreisser werden kaum gejagt.
    preyOf: { inselwolf: 1.3, inseladler: 0.25 },
    preyMaxAgeOf: { inseladler: Y(0.5) },
    easyPrey: 1.2,                    // langsam, wenig wachsam, auf Zahmheit gezuechtet
    // Fressen das Gras bis auf die Grasnarbe (narbe: nur Schafe) und kommen mit wenig aus,
    // dazu Triebe und Laub im Busch und am Waldrand (fast wie der Hirsch, 0,09)
    diet: { gras: 0.12, laub: 0.08, korn: 0.12, narbe: 0.1 },
    bite: 0.42,
    costPerDay: 0.035,                // genuegsam: Hirsch 0,05
    winterCost: 0.008,                // Wolle: Hirsch 0,015
    thirstDays: 0,                    // kein Durst (siehe Zwerghirsch); mit Durst: 20
    fleeToWater: [0.5, 0.7],         // gejagt und durstig: zum Wasser fliehen (nur mit Durst)
    speed: 3.5, fleeSpeed: 11.5, sprintTicks: 4,
    vision: 150,
    scheu: 0.6,                       // verwildert: meidet die Doerfer und flieht vor Jaegern (mit 0,4 grasten sie bis an die Haeuser und wurden dort erlegt)
    searchRadius: 240,
    habitat: pref({ TUSSOCK: 1.0, MEADOW: 1.0, ROCK: 0.6, SCRUB: 0.8, BEACH: 0.4, THERMAL: 0.3, SWAMP: 0.2, FERN: 0.5, MOSS: 0.3, PEAK: 0.1, SOIL: 0.1, FIELD: 1.0 }),
    // Schneller erwachsen und mehr Laemmer als der Hirsch (reif mit 1 Jahr, 1 Kalb, Chance 0,85)
    maturity: Y(0.5), maxAge: Y(9),
    // food: weniger Laemmer bei knapper Weide - sonst wachsen die Schafe bis zum Kahlfrass, die
    // Hirsche verhungern, danach die Schafe und zuletzt die Woelfe. Die Schafe beissen kuerzer und
    // bekommen deshalb noch Laemmer, wo der Hirsch keine Kaelber mehr hat (Hirsch 0,3 / 0,65):
    // Sie druecken das Gras unter das, wovon der Hirsch leben kann (Konkurrenz)
    breed: { kind: 'each-female', season: 0, day: 3, chance: 0.95, litter: [1, 2], minEnergy: 0.4, cost: 0.15,
      food: { key: 'gras', r: 3, low: 0.05, high: 0.3 } },
    newbornEnergy: 0.6,
    meat: 2.6                         // etwas weniger als ein Hirsch (3); vorher 1,3 zu Hirsch 1,5
  };

  // Verwilderte Hunde sind wie Woelfe (alle uebrigen Werte vom Inselwolf), nur etwas
  // staerker: Sie jagen erfolgreicher, scheuen die Menschen kaum, die Laufvoegel
  // kennen sie nicht (unknownTo) und werden deshalb oefter erbeutet, und sie tragen
  // eine Krankheit, an der Woelfe in ihrer Naehe erkranken (disease, eco/simulation.js).
  BT.SPECIES.hund = Object.assign({}, BT.SPECIES.inselwolf, {
    id: 'hund',
    name: 'Hund',
    plural: 'Hunde',
    introduced: true,
    sprites: { name: 'hund/hund', facing: 'right', poses: { move: 'gehend', stand: 'stehend', eat: 'essend', rest: 'sitzend' } },
    size: 19,                         // Wolf 22, das Bild fuellt den Rahmen mehr aus
    color: '#c4163f',
    start: 0,
    scheu: 0.3,                       // kennt die Menschen
    // Abfaelle: Bis 800 von einem Dorf finden sie jeden Tag etwas (Energie 0,015; Verbrauch 0,052).
    // Ohne das verhungerten die 2-3 Ausreisser oft im ersten Winter
    scraps: { radius: 800, energy: 0.015 },
    prey: { zwerghirsch: 1.0, schaf: 1.3, laufvogel: 0.15 },  // Laufvoegel fliehen nicht (Wolf 0,13); mit 0,6 verhungerten die Adler
    unknownTo: ['laufvogel'],
    // Verdraengung (Vorbild Dingo und Beutelwolf): In einem Revier der Hunde gruenden Woelfe kein
    // Revier und werden als Wanderer vertrieben. Die Hunde selbst achten nur auf andere Hunde
    dominates: ['inselwolf'],
    /*
     * Krankheit (Vorbild Staupe): Die Hunde selbst erkranken nicht. Jeden Tag steckt
     * sich jedes gesunde Tier der Arten in `victims` im Umkreis `radius` eines
     * Hunderudels mit `chance` an, im eigenen Rudel mit `spread` je krankem Tier.
     * Kranke Tiere verbrauchen `cost` mehr Energie am Tag, bekommen keine Jungen und
     * sterben je Tag mit `death` (Ursache "krankheit"). Mit `recover` je Tag werden
     * sie gesund und sind danach immun.
     */
    disease: { name: 'Staupe', victims: ['inselwolf'], radius: 300, chance: 0.03, spread: 0.03, cost: 0.02, death: 0.015, recover: 0.006 }
  });

  BT.SPECIES_ORDER = ['zwerghirsch', 'laufvogel', 'inselwolf', 'inseladler', 'schaf', 'hund'];

  // Eingeschleppte Arten als Beute der heimischen Raeuber eintragen (preyOf)
  BT.SPECIES_ORDER.forEach(function (id) {
    var s = BT.SPECIES[id];
    for (var pred in s.preyOf || {}) BT.SPECIES[pred].prey[id] = s.preyOf[pred];
    for (pred in s.preyMaxAgeOf || {}) {
      var p = BT.SPECIES[pred];
      p.preyMaxAge = Object.assign({}, p.preyMaxAge);
      p.preyMaxAge[id] = s.preyMaxAgeOf[pred];
    }
  });

  function pref(byName) {
    var arr = new Array(BT.BIOME_INFO.length).fill(0);
    for (var k in byName) arr[B[k]] = byName[k];
    return arr;
  }

  /** Beansprucht ein Revier der Art `owner` den Platz auch fuer die Art `spec`? */
  BT.claims = function (owner, spec) {
    return owner === spec || (!!owner.dominates && owner.dominates.indexOf(spec.id) >= 0);
  };

  /** Lebensraeume, durch die eine Art sich am Boden nicht bewegen kann. */
  BT.isBlocked = function (biome, spec) {
    if (spec && spec.flies) return false;
    return biome === B.DEEP || biome === B.SHALLOW || biome === B.LAKE;
  };
})(typeof window !== 'undefined' ? window : globalThis);
