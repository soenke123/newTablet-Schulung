/**
 * Der Tierkatalog als Parametersatz.
 *
 * Fachliche Wahrheit ist data/tiere.md - diese Datei bildet sie ab. Steht hier
 * eine Zahl, die dort nicht steht, ist das ein Fehler. Umgekehrt gilt: was am
 * laufenden Bild nachjustiert wird, wandert zurueck in data/tiere.md.
 *
 * Ein neues Tier ist im Normalfall nur ein Eintrag hier plus ein Verhalten in
 * js/sim/<tier>.js. Alles, was mehrere Arten teilen (Streuung, Tagesform,
 * Bewegung im Wasser), liegt bewusst nicht hier, sondern in agents.js.
 *
 * Zeitangaben in Simulationsstunden (ein Tag = 24 h = 300 s Echtzeit),
 * Tempi in Weltunits pro Sekunde, Entfernungen in Weltunits.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var SPECIES = {
    ente: {
      id: 'ente',
      name: 'Ente',
      plural: 'Enten',         // die UI ist deutsch, und "Barschn" gibt es nicht
      sprite: 'Ente.png',
      size: 2,                 // Groessenklasse 1..5
      domain: 'water',         // lebt auf dem Wasser, ueberquert Land nur im Flug
      layer: 1,                // Zeichenebene: auf der Oberflaeche, ueber dem Barsch
      active: 'tag',
      count: [2, 5],
      food: 'wasserpflanzen',

      /**
       * Darf als einzelner Nachzuegler am Bruch auftauchen (WL.LATE_ARRIVALS).
       * Die Ente ist der billigste Fall des ganzen Katalogs - sie hat gar nichts
       * Gemeinsames: die Liste der Stammgewaesser kommt aus der Weltgeometrie
       * und nicht aus dem Zufall, eine einzeln angelegte Ente bekommt also
       * dieselbe wie alle anderen. Ohne Partner zu bleiben ist bei ihr kein
       * Mangel, sondern die Haelfte des Katalogeintrags ("allein oder zu
       * zweit").
       *
       * Angepasst werden musste trotzdem etwas, und es war nicht zu sehen,
       * sondern nur zu erschliessen: nextDeparture ist eine *absolute* Uhrzeit
       * (js/sim/duck.js). Ab 0 gerechnet waere der erste Aufbruch eines
       * Nachzueglers fuenf Tage ueberfaellig - er flaege sofort weiter.
       */
      lateArrival: true,

      /**
       * Tempo je Zustand. ruhig/wandern/fliehen aus data/tiere.md sind
       * 6 / 13 / 62 - die Spannen hier streuen um genau diese Werte.
       * "fliehen" auf dem Wasser ist ein eigener Wert: die Ente rennt ueber
       * das Wasser, sie fliegt dabei nicht weg.
       */
      speed: {
        schlafen: [0, 0],
        gruendeln: [4, 8],
        schwimmen: [9, 18],
        ausweichen: [5, 8],
        fliehen: [30, 38],
        fliegen: [55, 68]
      },

      /** Feste Streuung pro Individuum (Anteil, +/-). */
      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      /** Tagesform: langsam driftender Faktor auf das Tempo. */
      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 70
      },

      /** Sozialverhalten: lose Paare, sonst allein (data/tiere.md: eng, 40 u). */
      social: {
        pairChance: 0.55,
        pairDistance: 40,
        pairBias: 0.65,            // Anteil der Schwimmziele, die zum Partner ziehen
        pairLeash: 110,            // darueber hinaus zieht jedes Ziel zum Partner
        partnerFollowChance: 0.97  // der Partner bleibt beim Aufbruch fast nie zurueck
      },

      /**
       * Die Ente kennt *alle* Gewaesser der Karte und kann jedes anfliegen.
       * minWaterCells schliesst nur Tuempel aus, die zu klein zum Schwimmen
       * waeren - der Weltgenerator verwirft ohnehin schon alles unter 90
       * Zellen, die Grenze ist also eine Vorsichtsmassnahme fuer den Fall,
       * dass sich das dort einmal aendert.
       */
      home: {
        minWaterCells: 90
      },

      /**
       * Auf dem Wasser: gruendeln am Ufer, dazwischen schwimmen, gelegentlich
       * treiben lassen. Tiefe in Zellen ab dem Ufer (eine Zelle = 5 u).
       */
      water: {
        forageDepth: [1, 4],   // gegruendelt wird am Ufer, nicht in der Mitte
        swimDepth: [1, 8],
        sleepDepth: [1, 2],
        forageBout: [5, 16],   // Sekunden am Stueck
        swimLeg: [6, 24],
        restChance: 0.22,
        restBout: [4, 12]
      },

      /**
       * Eine Zeile je Nahrungsart, jede mit eigener Karte (data/tiere.md §1).
       * source sagt, worauf die Karte liegt: 'water'/'grass'/'forest' sind
       * Flaechennahrung (ein Wert je Zelle), 'appleTrees'/'resources' sind
       * Ortsnahrung (ein Vorrat je Weltobjekt).
       */
      forage: {
        wasserpflanzen: {
          source: 'water',
          eatPerSecond: 0.22,
          regrowPerSecond: 0.012,
          minEdible: 0.35,
          radius: 12           // Umkreis, in dem eine Ente Nahrung wahrnimmt
        }
      },

      /**
       * Gewaesserwechsel: 2-5 Mal pro Tag. Erreicht wird das nicht ueber einen
       * festen Zaehler, sondern ueber den Anstoss durch ein einzelnes Tier -
       * die anderen folgen mit hoher Wahrscheinlichkeit und kommen dadurch
       * auf ein Vielfaches der eigenen Anstoesse.
       */
      departure: {
        intervalHours: [2, 7],
        followChance: 0.85,
        followDelay: [1.5, 7],  // Sekunden nach dem Anstoss
        curve: [0.06, 0.22],    // seitliche Auslenkung der Flugbahn, Anteil der Strecke
        landingDepth: [1, 5]
      },

      /** Wach von Morgendaemmerung bis Abenddaemmerung (Anteil des Tages). */
      awake: [0.26, 0.78],

      /**
       * Reaktion auf andere Tiere. Barsch, Hecht und Fledermaus werden
       * ignoriert - die beiden Fische sind unter Wasser, die Fledermaus in der
       * Luft.
       *
       * Beim Hecht ist diese eine Zeile keine Kosmetik, sondern die Stelle, an
       * der die Stoerung-gegen-Dauerzustand-Falle des Rehs ein zweites Mal
       * zugeschlagen haette: er lauert bei Ufertiefe 2-5 Zellen, also genau in
       * dem Streifen, in dem die Ente gruendelt (forageDepth [1,4]). Ohne
       * diesen Eintrag stuende fuenf Tage lang ein Stoerer im Gruendelbereich
       * und triebe sie ununterbrochen um den Teich.
       */
      reaction: {
        ignore: ['barsch', 'hecht', 'fledermaus'],
        evadeRadius: 75,       // tags: langsam wegschwimmen
        panicRadius: 90,       // nachts: schnell auf die andere Seite
        calmSeconds: [4, 9],
        panicSeconds: [6, 14]
      }
    },

    barsch: {
      id: 'barsch',
      name: 'Barsch',
      plural: 'Barsche',
      sprite: 'Barsch.png',
      size: 1,
      domain: 'water',
      layer: 0,                // unter der Wasseroberflaeche, also unter der Ente
      active: 'tag',
      count: [6, 12],
      food: 'kleintiere',

      /**
       * Katalog r/w/f = 3 / 9-22 / 58. "ruhig" ist beim Barsch der Nachtwert:
       * er schlaeft nicht, er wird nur sehr langsam. Deshalb gibt es hier kein
       * "schlafen" - der Schwarm kreist die Nacht ueber weiter.
       */
      speed: {
        ruhen: [2, 5],
        schwimmen: [9, 22],
        fliehen: [40, 58]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 55
      },

      /**
       * Der Schwarm, nicht der einzelne Fisch, ist die handelnde Einheit:
       * Ziel, Abschnittstempo und Ruhezone gehoeren ihm. Individuell bleiben
       * Streuung, Tagesform und - innerhalb des Tempobands - das Einzeltempo.
       *
       * minSize 3 ist die Zusage "in einem besetzten See sind nie weniger als
       * drei"; maxSchools haelt ein paar Gewaesser bewusst fischfrei.
       *
       * Die Kraefte sind Beschleunigungen, keine Gewichte: sie wirken auf die
       * Geschwindigkeit des Fisches (js/sim/agents.js, driftStep), nicht auf
       * eine Wunschrichtung. Deshalb hat der Schwarm keine turnRate mehr - wie
       * eng ein Fisch die Kurve nimmt, ergibt sich aus Kraft gegen Tempo.
       */
      school: {
        minSize: 3,
        maxSchools: 3,
        neighbourRadius: 70,     // Sichtweite innerhalb des Schwarms
        // Abstossung und Zusammenhalt stehen sich im Gleichgewicht gegenueber;
        // wo es sich einstellt, ergibt den Schwarmabstand aus data/tiere.md
        // (25 u). Zu klein, und die Sprites liegen uebereinander - ein Barsch
        // ist 26 u breit.
        separation: 58,          // darunter stossen sich zwei Fische ab
        // Federkonstante zum Schwerpunkt der Nachbarn, 1/s^2. Sie bestimmt,
        // wie schnell der Schwarm wogt: die Schwingungsdauer ist rund
        // 2*PI/sqrt(cohesion), hier also gut 5 s.
        cohesion: 1.4,
        // 1/s, zieht auf die mittlere Nachbargeschwindigkeit zu und daempft
        // dabei die Feder. Der empfindlichste Wert des ganzen Schwarms: er
        // allein bestimmt, wie parallel die Fische ziehen. Bei 0.55 zieht der
        // Schwarm als Formation (gemessene Polarisation 0.97), bei 0.15 wogt
        // er (0.92 - derselbe Wert wie ein klassischer Boids-Schwarm).
        alignment: 0.15,
        separationAccel: 34,     // u/s^2 bei vollem Zusammenstoss
        goalAccel: 3.5,          // u/s^2 zum gemeinsamen Ziel; klein, sonst ziehen alle parallel
        shoreAccel: 55,          // u/s^2 vom Ufer weg, im flachsten Wasser
        // Tempoband um das Abschnittstempo. Ohne Band ueberholt kein Fisch den
        // anderen und der Schwarm bleibt eine starre Formation; im Sprint ist
        // es eng, weil ein aufgeschreckter Schwarm geschlossen wegschiesst
        // (und weil das Fluchttempo aus data/tiere.md sonst ueberschritten
        // wuerde).
        speedBand: [0.45, 1.35],
        fleeBand: [0.85, 1.0],
        legSeconds: [8, 22],     // wie lange ein Ziel gilt
        arriveRadius: 26,        // gemessen am Schwerpunkt des Schwarms
        samples: 7               // Stichproben bei der Zielwahl
      },

      /**
       * Tiefe in Zellen ab dem Ufer (eine Zelle = 5 u). depth ist bewusst bis
       * ans Ende offen: der Schwarm zieht durch den *ganzen* See, waehrend die
       * Ente am Ufer bleibt. minDepth haelt ihn aus dem Uferschlick heraus.
       */
      water: {
        minWaterCells: 140,
        minDepth: 2,
        depth: [2, 99],
        restDepth: [4, 99],      // die Ruhezone liegt so tief wie der See hergibt
        restRadius: [16, 34],
        restTurn: 0.30           // rad/s, mit der das Nachtziel um sie kreist
      },

      forage: {
        kleintiere: {
          source: 'water',
          eatPerSecond: 0.10,
          regrowPerSecond: 0.020
        }
      },

      /** Wach von der Morgendaemmerung bis in die Abenddaemmerung hinein. */
      awake: [0.24, 0.80],

      /**
       * Enten werden ausdruecklich ignoriert - sie sitzen auf der Oberflaeche.
       * Alles andere loest einen Sprint auf die abgewandte Seite aus, und die
       * Stelle bleibt danach eine Weile Sperrzone (das ist der Unterschied
       * zwischen "erschrocken" und "haelt Sicherheitsabstand").
       */
      reaction: {
        ignore: ['ente'],
        evadeRadius: 95,
        safeDistance: 110,
        panicSeconds: [4, 9],
        forgetSeconds: [25, 50],

        /**
         * **Meiden ist nicht Fliehen, und der Hecht ist der Grund, warum das
         * jetzt zwei getrennte Mechanismen sind.**
         *
         * Alles bisher Aufgezaehlte ist eine *Reaktion*: etwas kommt zu nah,
         * der Schwarm sprintet weg. Der Hecht liegt aber Tag und Nacht reglos
         * im selben See - er kommt nie "dazu". Ihn ueber die Fluchtabfrage zu
         * behandeln ergaebe fuenf Tage Dauerpanik, dieselbe Falle wie beim
         * schlafenden Reh am Ufer (data/tiere.md, Reh).
         *
         * Stattdessen greift er bei der *Zielwahl* des Schwarms: Stellen in
         * seinem Umkreis fallen als Ziel durch. Das ist eine Entscheidung und
         * keine Reaktion, und deshalb sieht sie ihn auch dann, wenn er fuer
         * jede andere Abfrage unsichtbar ist (ctx.nearestOfSpecies).
         *
         * chance ist die Zusage aus data/tiere.md: in neun von zehn Zielwahlen
         * wird er gemieden, in der zehnten nicht - und *daraus* entstehen die
         * gelegentlichen Begegnungen, die er dann mit einem Sprint beantwortet.
         * Eine Sperre ohne dieses Loch waere ein Gesetz und kein Meiden, und
         * der Hecht kaeme nie zum Zug.
         *
         * search ist nur eine Abkuerzung fuer die Suche - entschieden wird
         * ueber das Gewaesser (js/sim/perch.js, lurkerIn).
         *
         * **radius muss deutlich kleiner sein als der See, sonst tut die Sperre
         * gar nichts.** Der erste Anlauf stand auf 150 u - bei einem Gewaesser
         * von rund 140 u Radius deckte die Sperrzone damit die *ganze* Flaeche
         * ab, jeder der sieben Kandidaten bekam denselben Abzug, und aus einem
         * Vergleich wurde eine Konstante: gemessen hielt der Schwarm 135 u
         * Abstand mit gegen 124 u ohne Meidung, also praktisch keinen
         * Unterschied. Das ist dieselbe Falle wie der Waldrandbonus des Rehs,
         * nur andersherum - ein Abzug, den alle bekommen, entscheidet nichts.
         */
        avoid: {
          species: ['hecht'],
          search: 900,
          radius: 70,
          chance: 0.90
          /**
           * **Es gibt hier bewusst keine Abstossungskraft**, obwohl der Schwarm
           * fuer seine Sperrzone laengst eine hat. Sie war eingebaut und ist
           * nach der Messung wieder herausgeflogen - Begruendung und Zahlen
           * stehen in js/sim/perch.js bei steerForce. Kurz: eine Kraft ergibt
           * in einem traegen Schwarm keine Wand, sondern ein Ueberschiessen,
           * und sie trieb die Fische messbar *naeher* an den Hecht heran.
           *
           * Gemessen wird die Meidung ueber alle zehn Seeds zusammen
           * (tools/simtest.js), nicht ueber einen: ein einzelner Ausfall wirft
           * den Tagesverlauf des ganzen Schwarms um, und die Streuung zwischen
           * zwei Seeds ist groesser als der Unterschied, den die Regel macht.
           */
        }
      }
    },

    reh: {
      id: 'reh',
      name: 'Reh',
      plural: 'Rehe',
      sprite: 'Reh.png',
      size: 3,
      domain: 'land',          // erstes Landtier - siehe js/sim/land.js
      layer: 2,                // ueber der Wasseroberflaeche, also ueber der Ente
      active: 'tag',
      count: [3, 6],
      food: 'gras',            // Hauptnahrung; Aepfel und Nuesse kommen dazu

      /**
       * Darf als einzelner Nachzuegler am Bruch auftauchen (WL.LATE_ARRIVALS) -
       * und war die erste Art mit diesem Flag, weil sie die Bedingung ohne jede
       * Arbeit erfuellt: sie zieht sich nur eine Grasstelle und hat weder Revier
       * noch Bau noch Verband.
       *
       * **Die Bedingung lautet inzwischen anders**, und die Umformulierung ist
       * das, was Ente, Kaninchen und Fledermaus dazugebracht hat. Frueher: das
       * spawn() darf fuer ein einzelnes Tier nichts anlegen, was der ganzen Art
       * gehoert. Heute: **was der ganzen Art gehoert, wird bei den Artgenossen
       * abgeholt statt neu angelegt** (WL.Agents.groupsOf / livingOf; die Liste
       * der laufenden Tiere steht im spawn-Kontext und ist nur beim Nachzuegler
       * gefuellt).
       *
       * Damit ist ein Beitritt fuer jede Art moeglich, deren Gemeinsames ein
       * *Objekt* ist: Familie, Rotte, Schwarm, ein Satz weltweiter Orte. Offen
       * bleiben Barsch, Wildschwein und Dachs - machbar, nur noch nicht gebaut.
       *
       * **Der Fuchs bleibt grundsaetzlich draussen.** Sein Revier ist keine
       * Eigenschaft eines Fuchses, sondern eine Aufteilung der Karte nach ihrer
       * *Anzahl* (LAYOUT in js/sim/fox.js). Da gibt es nichts abzuholen: ein
       * hinzukommender Fuchs muesste alle vorhandenen Reviere neu schneiden und
       * damit das Verhalten der schon laufenden Fuechse ab Tag 6 aendern - aus
       * einem Grund, der mit dem Bruch nichts zu tun hat.
       */
      lateArrival: true,

      /**
       * Katalog r/w/f = 5 / 24 / 75. "gehen" ist das Streifen von einer
       * Grasstelle zur naechsten, "wandern" der gezielte Weg zum Wasser oder
       * zu einem gesichteten Baum - derselbe Zustand, anderes Tempo.
       */
      speed: {
        schlafen: [0, 0],
        sichern: [0, 0],
        trinken: [0, 0],
        aesen: [3, 7],
        gehen: [14, 24],
        wandern: [22, 32],
        fliehen: [60, 85]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 80
      },

      /**
       * Einzelgaenger - kein social-Block, und das ist die Aussage: es gibt
       * beim Reh nichts oberhalb des Einzeltieres. Kein gemeinsames Ziel, kein
       * Rendezvous, kein Revier. Der Gegenentwurf zum Schwarm des Barsches.
       */

      forage: {
        // Gras erholt sich langsam: eine abgeaeste Stelle bleibt lange leer,
        // und genau das schiebt das Reh ueber die Karte.
        gras: {
          source: 'grass',
          eatPerSecond: 0.34,
          regrowPerSecond: 0.0035,
          minEdible: 0.30
        },
        aepfel: {
          source: 'appleTrees',
          eatPerSecond: 0.055,
          regrowPerSecond: 0.0022,
          minEdible: 0.30
        },
        nuesse: {
          source: 'resources',
          eatPerSecond: 0.050,
          regrowPerSecond: 0.0018,
          minEdible: 0.30
        }
      },

      /** Aesen: lange an einer Stelle, dann ein weiter Zug zur naechsten. */
      graze: {
        // Das Verhaeltnis dieser beiden Zahlen waegt "aest lange auf Gras"
        // gegen "streift umher" ab. Die Aesphase darf dabei nicht laenger
        // werden als der Abstand zweier Trinkgaenge (62-94 s), sonst wird
        // ohnehin jede zweite davon vom Durst zerschnitten und laengere Werte
        // aendern am gemessenen Anteil gar nichts mehr.
        bout: [34, 72],        // Sekunden an einer Stelle
        driftRadius: 13,       // wie weit es dabei weiterzieht
        leg: [190, 440],       // Entfernung zum naechsten Grasziel
        shortLeg: [40, 140],   // dasselbe, direkt nach einem Trinkgang
        samples: 6,
        // Der "minimale" Waldrandbezug aus data/tiere.md: ein kleiner Zuschlag
        // im Vergleich zum Nahrungswert (0..1), kein Magnet. Er wirkt nur
        // zusammen mit jitter - ohne den Zufallsanteil wuerde er jede Wahl
        // entscheiden, weil frisches Gras ueberall gleich gut ist.
        forestBonus: 0.10,
        forestNear: 120,
        jitter: 0.35,
        // Ein Reh zieht ueber die Wiese, es wuerfelt nicht bei jedem Schritt
        // eine neue Himmelsrichtung. Ohne diese Beharrung ist die Folge der
        // Ziele ein Irrflug: nach acht Zuegen ist das Tier nur die Wurzel aus
        // acht Zuglaengen weit gekommen statt acht Zuglaengen, und es haengt
        // fuer immer um denselben Teich. Das ist der Unterschied zwischen
        // "streift durch das ganze Feld" und "hat doch ein Revier".
        headingBonus: 0.55,
        turnPerLeg: 0.45,        // wie weit die Richtung je Zug wandert (rad)
        newDirectionChance: 0.15 // ... und wie oft sie ganz neu gewuerfelt wird
      },

      /**
       * Aepfel und Nuesse werden gesehen, nicht gewusst: ausserhalb dieses
       * Umkreises existieren sie fuer das Tier nicht. Deshalb kennen zwei Rehe
       * derselben Karte verschiedene Baeume.
       */
      sight: {
        radius: 150,
        interval: 0.6,         // Sekunden zwischen zwei Blicken
        bout: [8, 20],
        cooldown: [40, 90],    // dieselbe Stelle nicht sofort wieder ansteuern
        // "Frisst da ein wenig und geht dann weiter": nach einem Halt schaut
        // das Reh eine Weile gar nicht mehr. Ohne diese Pause haengt es in
        // einem Nussnest fest, denn dort liegen 6-12 Stellen im Umkreis von
        // 42 u - es waere von einer zur naechsten gewandert und nie wieder
        // auf die Wiese zurueckgekehrt. Die Laenge der Pause bestimmt zugleich,
        // wie oft ein Umweg ueberhaupt vorkommt: rund ein bis zwei am Tag.
        pause: [90, 200]
      },

      /**
       * Trinken 2-3 Mal am Tag - der einzige weite Weg mit klarem Ziel. Der
       * Abstand ist deutlich kuerzer als 24/3, weil nur tagsueber getrunken
       * wird: in die Wachzeit von rund 13 Simulationsstunden (0.20 bis
       * sleep.leaveAt) muessen alle Gaenge passen.
       */
      drink: {
        intervalHours: [5.2, 7.2],
        bout: [5, 11],
        reach: 12,             // Abstand zum Wasser, ab dem getrunken wird
        // Kommt das Reh ohnehin am Wasser vorbei und ist der Durst bald
        // faellig, trinkt es gleich mit. Ohne das laeuft es fuer jeden
        // Schluck eigens quer ueber die Karte, und der Marsch zum See wird
        // zur Hauptbeschaeftigung statt des Aesens.
        earlyHours: 1.2,
        nearby: 130
      },

      /**
       * Nachts im Wald dicht am Rand, aber nicht jede Nacht am selben Platz.
       * maxDistance ist die Notbremse: eine Nacht dauert 120 s, ein weiterer
       * Weg als dieser waere die halbe Nacht im Marsch.
       */
      sleep: {
        searchRadius: 420,
        maxDistance: 620,
        // Aufgebrochen wird schon in der Abenddaemmerung, nicht erst wenn es
        // dunkel ist. Sonst faellt der ganze Weg zum Waldrand in die Nacht -
        // das Reh saehe nachtaktiver aus als es ist, und unterwegs scheuchte
        // es auf dem Weg am Ufer noch den Barschschwarm auf.
        leaveAt: 0.73
      },

      /** Wach von der Morgendaemmerung bis zum Ende der Abenddaemmerung. */
      awake: [0.20, 0.80],

      /**
       * Zwei ganz verschiedene Reaktionen: vor grossen Tieren flieht es, vor
       * dem eigenen Artgenossen bleibt es nur kurz stehen. Die Sperrzeit danach
       * ist noetig, weil zwei Rehe, die zufaellig nebeneinander aesen, sonst
       * dauerhaft stillstuenden.
       */
      reaction: {
        ignore: ['ente', 'barsch'],
        fleeFromSize: 4,
        fleeRadius: 140,
        fleeSeconds: [5, 11],
        peerRadius: 100,
        peerPause: [2, 4],
        peerCooldown: [20, 40]
      }
    },

    wildschwein: {
      id: 'wildschwein',
      name: 'Wildschwein',
      plural: 'Wildschweine',
      sprite: 'Wildschwein.png',
      size: 4,
      domain: 'land',
      layer: 2,
      active: 'nacht',         // das erste nachtaktive Tier des Katalogs
      // Die Gesamtzahl der Rotten*tiere*, und sie ist die Wahrheit: wie viele
      // Rotten daraus werden und wie gross jede wird, rechnet js/sim/boar.js
      // daraus aus (splitIntoSounders, dieselbe Richtung wie beim Barsch).
      // Frueher lief es andersherum - dann kann die Art aber keine ihr
      // zugeteilte Anzahl einhalten, und genau das verlangt die Obergrenze der
      // Welt (WL.POPULATION).
      count: [3, 10],
      food: 'nuesse',          // Hauptnahrung; Aepfel und Ameisen kommen dazu

      /**
       * Katalog r/w/f = 5 / 15 / 48. Zwei Werte gibt es beim Reh nicht:
       * "suhlen" ist kein Stillstand, sondern ein Waelzen fast auf der Stelle,
       * und "aufschliessen" ist das Tempo eines Nachzueglers, der die Rotte
       * wieder einholt. Ohne diesen zweiten Wert bliebe ein Nachzuegler fuer
       * immer Nachzuegler - er liefe ja genauso schnell wie die anderen.
       */
      speed: {
        schlafen: [0, 0],
        sichern: [0, 0],
        trinken: [0, 0],
        suhlen: [0, 1.2],
        wuehlen: [3, 6],
        gehen: [11, 18],
        wandern: [20, 28],
        aufschliessen: [24, 34],
        fliehen: [40, 55]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 75
      },

      /**
       * Die Rotte. Sie ist wie der Schwarm des Barsches die handelnde Einheit -
       * aber sie haelt *nicht* ueber Kraefte zwischen den Tieren zusammen,
       * sondern ueber ein gemeinsames Ziel und einen Platz je Tier darum herum.
       * Das ist billiger (kein Tier sieht jedes andere an) und ergibt genau den
       * loseren Verband, der gewuenscht ist.
       *
       * Die drei Zahlen, die aus einer Formation einen losen Haufen machen:
       * spread streut die Tiere um das Ziel, offsetSeconds wuerfelt diesen Platz
       * immer wieder neu (sonst zoege die Rotte ihre Anordnung mit sich herum),
       * und lag* laesst einzelne Tiere stehenbleiben.
       */
      sounder: {
        groups: [1, 2],
        size: [3, 5],
        // Der Umkreis ist nicht der Abstand zweier Tiere: vier Tiere in einem
        // Kreis von 105 u haben rund 45 u zum naechsten Nachbarn. Mit den
        // urspruenglichen 45 u kam die Rotte auf 20 u und lag damit enger
        // beieinander als der Barschschwarm - Sprites uebereinander, und das
        // Merkmal "Abstand zum Artgenossen" haette Rotte und Schwarm nicht mehr
        // getrennt. Ein Wildschwein ist rund 33 u breit.
        spread: 130,             // Umkreis, in dem die Rotte um ihr Ziel steht
        tightSpread: 90,
        // Mindestabstand zweier Tiere. Er haengt nicht am Umkreis, sondern wird
        // eigens gehalten (keepGap in js/sim/boar.js) - sonst stuenden fuenf
        // Tiere enger als drei, und der gemessene Abstand zum Artgenossen
        // haenge an der Rottengroesse statt an dieser Zusage.
        minGap: 42,         // ... beim Wuehlen und Trinken enger
        offsetSeconds: [4, 9],   // ... und wie oft der eigene Platz darin wechselt
        arrive: 16,              // ab hier ist ein Tier auf seinem Platz
        // ... und ab hier gilt die Rotte als am Ziel. Gemessen wird das am
        // *vordersten* Tier, nicht am Schwerpunkt - siehe nearestMemberDist
        // in js/sim/boar.js.
        goalArrive: 30,
        regroup: 150,            // ab hier gilt das Anmarsch- statt des Taetigkeitstempos
        catchUp: 190,            // ... und darueber hinaus wird aufgeschlossen
        lagInterval: [9, 26],    // wie oft ein Tier stehenbleibt
        lagSeconds: [1.5, 4.5]   // ... und wie lange
      },

      /**
       * Das Revier ist ein *Waldstueck*, kein Kreis: die Rotte nutzt ihre
       * Waldregion ganz und dazu einen Streifen ringsum, in dem Apfelbaeume,
       * Bodenflaechen und das Wasser liegen. Ein fester Radius um einen Punkt
       * waere kleiner als der Wald selbst gewesen - die Rotte haette in einer
       * Ecke davon gelebt.
       *
       * Angefangen wird trotzdem an einem Nussnest: es gibt nur 3-5 davon auf
       * der Karte, sie liegen tief im Wald, und ein zufaellig gewaehltes
       * Waldstueck haette womoeglich keins - dann fehlte der Rotte ihre
       * Hauptnahrung. Aus dem Nest ergibt sich das Waldstueck, nicht umgekehrt.
       */
      home: {
        margin: 280,             // Streifen um das Waldstueck herum
        minPatchDistance: 500,   // zwei Rotten sitzen nicht auf demselben Nest
        // Waldwechsel: laeuft die Rotte einem anderen Waldstueck ueber den Weg,
        // zieht sie unter Umstaenden dorthin um. Selten genug, dass ein Revier
        // ueber die 5 Tage erkennbar bleibt, haeufig genug, dass es vorkommt.
        switchChance: 0.05,
        switchDistance: 220      // so nah muss das andere Waldstueck sein
      },

      /**
       * Drei Ortsnahrungen mit einer Vorliebe davor. Die Karten von 'nuesse'
       * und 'aepfel' gehoeren dem Reh (es steht frueher in SPECIES_ORDER), also
       * teilen sich die beiden Arten diese Vorraete wirklich - die Rotte frisst
       * dem Reh die Nuesse weg. Genau so gewollt, siehe data/tiere.md §1.
       * regrowPerSecond ist hier deshalb ohne Wirkung und steht nur zur Kontrolle
       * gleich; wirksam bleibt eatPerSecond, das je Art gilt.
       */
      forage: {
        nuesse: {
          source: 'resources',
          eatPerSecond: 0.008,
          regrowPerSecond: 0.0018,
          minEdible: 0.25,
          weight: 1.00
        },
        /**
         * Wurzeln und Bodentiere - die einzige Flaechennahrung des
         * Wildschweins und der Grund, warum es ueberhaupt auf den sichtbaren
         * Boden geht. Sie ist nicht bloss Beiwerk: an einem Nussnest frisst
         * immer nur *ein* Tier am Vorrat, alle anderen haetten sonst nichts zu
         * tun und stuenden daneben herum. Mit dem Boden wuehlt jedes Tier fuer
         * sich, dort wo es gerade steht.
         *
         * Sie erholt sich schneller als Nuesse (aufgebrochene Erde ist nach
         * einer Nacht wieder interessant), aber langsam genug, dass die Rotte
         * weiterzieht statt an einer Stelle zu bleiben.
         */
        boden: {
          source: 'ground',
          eatPerSecond: 0.018,
          regrowPerSecond: 0.0040,
          minEdible: 0.30,
          weight: 0.72
        },
        aepfel: {
          source: 'appleTrees',
          eatPerSecond: 0.008,
          regrowPerSecond: 0.0022,
          minEdible: 0.25,
          weight: 0.55
        },
        ameisen: {
          source: 'anthills',
          eatPerSecond: 0.011,
          regrowPerSecond: 0.0030,
          minEdible: 0.30,
          weight: 0.30
        }
      },

      /**
       * Anders als das Reh sucht die Rotte ihre Nahrung nicht mit den Augen,
       * sie kennt ihr Revier. Gewaehlt wird nach Vorliebe mal Vorrat; die
       * Entfernung zaehlt nur schwach dagegen, sonst bliebe die Rotte am
       * naechstgelegenen Nest kleben.
       */
      forageChoice: {
        jitter: 0.30,
        distanceCost: 0.0050,
        bout: [30, 58],          // Sekunden Wuehlen an einer Stelle
        cooldown: [60, 140],     // ... und wie lange sie danach gesperrt ist
        groundSamples: 5,        // Stichproben auf Bodenflaechen bei der Wahl
        // Wie nah ein Tier an einer Ortsnahrung stehen muss, um von ihr zu
        // fressen. Wer weiter weg ist, wuehlt stattdessen im Boden unter sich -
        // das ist der Unterschied zwischen einer fressenden Rotte und einer,
        // bei der ein Tier frisst und vier zusehen.
        pointReach: 70,
        // Beim Wuehlen wechselt der eigene Platz schneller als beim Ziehen:
        // die Rotte arbeitet sich durch das Nest, sie steht nicht darin.
        rootSeconds: [2.5, 6]
      },

      /**
       * Suhlen auf sichtbarem Boden - die zweite Hauptbeschaeftigung und das
       * einzige, wofuer im ganzen Katalog der Terraintyp GROUND gebraucht wird.
       * Feste Suhlen gibt es nicht: gesucht wird die Bodenstelle, die gerade
       * im Revier in der Naehe liegt.
       */
      wallow: {
        intervalHours: [4.5, 6.5],
        bout: [26, 48],
        searchRadius: 300,
        spread: 16,              // eine Suhle ist eine Pfuetze, kein Gelaende
        // Steht die Rotte ohnehin auf Boden, legt sie sich frueher hin, statt
        // eigens loszulaufen - dasselbe Zugestaendnis wie beim Reh am Wasser.
        earlyHours: 1.5
      },

      /**
       * Zwei Trinkgaenge, und beide fallen in die Nacht: mehr passt in die
       * Wachzeit von rund 12 Simulationsstunden nicht hinein.
       */
      drink: {
        intervalHours: [4.2, 5.5],
        bout: [6, 10],
        reach: 12,
        earlyHours: 1.5,
        nearby: 130
      },

      /**
       * Tagsueber mitten im Wald, nicht am Rand wie das Reh - depth ist der
       * ganze Unterschied zwischen den beiden Schlafplaetzen. spread ist enger
       * als sounder.spread: beim Ziehen ist die Rotte lose, im Schlaf liegt
       * sie eng beieinander.
       */
      sleep: {
        searchRadius: 400,
        maxDistance: 600,
        depth: [7, 99],
        spread: 45,
        leaveAt: 0.24
      },

      /** Wach ueber Mitternacht hinweg - siehe A.isAwake. */
      awake: [0.70, 0.30],

      /**
       * Groessenklasse 4: geflohen wird erst vor 5, und die gibt es im Kernset
       * nicht (der Baer ist Bonus). Der Zweig ist ueber den kuenstlichen
       * Stoerer in tools/simtest.js geprueft. "Vertreibt Groessenklasse 1"
       * wartet auf das Kaninchen - solange es kein Tier dieser Groesse an Land
       * gibt, waere das eine Regel ohne Gegenstand.
       */
      reaction: {
        ignore: ['ente', 'barsch'],
        fleeFromSize: 5,
        fleeRadius: 130,
        fleeSeconds: [4, 9]
      }
    },

    kaninchen: {
      id: 'kaninchen',
      name: 'Kaninchen',
      plural: 'Kaninchen',
      sprite: 'Kaninchen.png',
      size: 1,
      domain: 'land',
      layer: 2,
      active: 'tag',
      count: [4, 10],
      /**
       * Die einzige Art ohne Nahrung, und das ist eine Festlegung, keine
       * Luecke (data/tiere.md §1): das Kaninchen hoppelt und sitzt, es sucht
       * nichts. Es gibt deshalb auch keinen forage-Block - die Simulation legt
       * fuer diese Art gar keine Nahrungskarte an. Im Merkmalsvektor ist
       * 'keine' ein Wert wie jeder andere.
       */
      food: 'keine',

      /**
       * Darf als einzelner Nachzuegler am Bruch auftauchen (WL.LATE_ARRIVALS) -
       * und ist von allen bekannten Arten die, bei der sich das am meisten
       * lohnt: seine Spur strahlt sternfoermig von genau dem Punkt weg, von dem
       * auch die anderen Kaninchenspuren ausgehen. Einsortierbar auf einen
       * Blick, und trotzdem nur ueber das Verhalten.
       *
       * Bedingung dafuer ist, dass er einer *vorhandenen* Familie beitritt
       * (js/sim/rabbit.js). Ein eigener Bau waere ein neuer ortsfester Punkt an
       * Tag 6 - also ein Artmerkmal, das die Kaninchen aus der Aufgabe
       * herausnaehme, und der Renderer wuerde ihn wirklich zeichnen (collectHomes
       * in js/render/agentRenderer.js).
       */
      lateArrival: true,

      /**
       * Katalog r/w/f = - / 30 / 88. Ein "ruhig"-Tempo gibt es nicht: das
       * Kaninchen bewegt sich entweder mit vollem Hoppeltempo oder gar nicht.
       * Genau dieses Alles-oder-nichts trennt es im Merkmalsvektor vom Reh,
       * dessen Mittel- und Bewegungstempo dicht beieinanderliegen.
       */
      speed: {
        schlafen: [0, 0],
        bau: [0, 0],
        sichern: [0, 0],
        hoppeln: [24, 34],
        gehen: [20, 28],       // der kurze Weg heim zum Bau
        fliehen: [80, 96]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20,
        range: 0.20            // Reviergroesse, data/tiere.md §2
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 45       // kuerzer als beim Reh: ein hektisches Tier
      },

      /**
       * Die Familie ist *kein* handelnder Verband wie Rotte oder Schwarm - sie
       * teilt sich nur einen Ort. Jedes Kaninchen hoppelt fuer sich; das
       * Einzige, was alle verbindet, ist der Bau in ihrer Mitte. Das ist die
       * dritte Form von Sozialverhalten im Katalog und die billigste: kein
       * gemeinsames Ziel, kein Schwerpunkt, keine Kraefte.
       *
       * splitAt aus data/tiere.md: bis 7 Tiere eine Familie, ab 8 zwei.
       */
      family: {
        splitAt: 7
      },

      /**
       * Der Bau. radius ist das Revier drumherum, alles Weitere sind
       * Platzierungsbedingungen - die Regel selbst steht in js/world/rules.js
       * (WL.Rules.placement.burrow).
       */
      home: {
        radius: 130,
        minDistToWater: 260,   // so weit, dass kein Hopser in Entennaehe kommt
        minBurrowDistance: 520,
        minOpenShare: 0.75,    // Anteil offener Stichproben im Revier
        samples: 8,            // ... aus so vielen
        tries: 80              // Versuche, einen Platz zu finden
      },

      /**
       * Hoppeln: ein Satz, dann stehenbleiben. Die Richtung wird jedes Mal frei
       * gewuerfelt - anders als beim Reh, dessen Richtung beharrt. Genau das
       * haelt das Kaninchen von selbst am Bau: ein Irrflug kommt nach acht
       * Zuegen nur die Wurzel aus acht Zuglaengen weit. Der Radius ist die
       * Sicherung dahinter, nicht der Grund.
       */
      hop: {
        length: [22, 70],
        pause: [1.0, 4.0],
        longPauseChance: 0.15,
        longPause: [5, 12],
        homeBias: 0.80,        // ab diesem Anteil des Radius zieht es zurueck
        spreadAtEdge: 1.0,     // Streuung um die Heimrichtung (rad)
        tries: 8               // Richtungen, bis eine offene Stelle passt
      },

      /** Aufenthalt im Bau nach einer Flucht - und der Blick heraus danach. */
      burrow: {
        hideBout: [8, 20],
        peekBout: [3, 7],
        arrive: 8,
        // Schlafumkreis. Er ist nicht der Bau selbst, sondern der Platz drumherum:
        // ein Kaninchensprite ist 26 u breit, bei engerem Umkreis liegt die
        // Familie als ein einziger Fleck auf der Karte.
        spread: 34
      },

      /**
       * Nachts im Bau. Der Weg dorthin ist hoechstens ein Revierradius lang,
       * deshalb bricht das Kaninchen viel spaeter auf als das Reh (0.73) - es
       * braucht keinen Vorlauf.
       */
      sleep: {
        leaveAt: 0.74
      },

      awake: [0.24, 0.78],

      /**
       * Groessenklasse 1, das kleinste Tier des Katalogs: geflohen wird vor
       * allem ab Groessenklasse 2, und zwar *zum Bau* statt vom Stoerer weg.
       * Ente und Barsch werden ignoriert - Wassertiere, denen das Kaninchen
       * dank des Wasserabstands seines Baus ohnehin nie begegnet.
       */
      reaction: {
        ignore: ['ente', 'barsch'],
        fleeFromSize: 2,
        fleeRadius: 150
      }
    },

    fledermaus: {
      id: 'fledermaus',
      name: 'Fledermaus',
      plural: 'Fledermäuse',
      sprite: 'Fledermaus.png',
      size: 1,
      domain: 'air',            // fliegt frei, keine Wasser- oder Landbindung
      layer: 3,                 // ueber allem anderen - sie fliegt am hoechsten
      active: 'nacht',
      count: [4, 10],

      /**
       * Die zweite Art ganz ohne Nahrung, nach dem Kaninchen (data/tiere.md
       * §1: die urspruengliche Planung "Insekten als Flaechennahrung" ist
       * zurueckgenommen). Kein forage-Block, kein Durst, keine
       * Bedrohungsabfrage - das Jagen ist reine Bewegungsanimation.
       */
      food: 'keine',

      /**
       * Darf als einzelner Nachzuegler am Bruch auftauchen (WL.LATE_ARRIVALS).
       * Sie bringt als einzige der drei einen nachtaktiven Flieger als Ziel mit
       * - drei Nachzuegler in drei verschiedene Gruppen ist die reichere
       * Aufgabe als dreimal dieselbe.
       *
       * Bedingung: sie uebernimmt Schlafplaetze und Jagdgebiete von den schon
       * lebenden Fledermaeusen (js/sim/bat.js). Neu gesucht ergaeben sie einen
       * zweiten Satz weltweiter Orte - die Art haette zwei Landkarten, und der
       * Neue flaege nie dorthin, wo seine Artgenossen sind.
       */
      lateArrival: true,

      /**
       * Katalog: "schnell, zackig, kleine Kreise zum Wenden". Es gibt kein
       * "ruhig"-Tempo - im Schlafplatz ist sie voellig still, unterwegs immer
       * schnell. 'reisen' ist der geradlinige Flug zwischen Schlafplatz und
       * Jagdgebiet, 'jagen' das Tempo der Kursstoesse dort drin.
       */
      speed: {
        schlafen: [0, 0],
        reisen: [55, 75],
        jagen: [45, 70]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 40         // hektisches Tier, kurze Tagesform-Perioden
      },

      /**
       * Zwei weltweite Pools statt eines Reviers je Tier. Jeder Wald bekommt
       * beim Anlegen zwei Schlafplaetze, aus denen *alle* Fledermaeuse der
       * Karte jeden Tag neu waehlen - nicht nur die des naechstgelegenen
       * Waldes. Naehe entsteht dadurch zufaellig, so wie beim Kaninchen aus
       * dem gemeinsamen Bau, nur ganz ohne Bindung an einen festen Ort.
       */
      roost: {
        perForest: 2
      },

      /**
       * 5-7 ovale Jagdgebiete pro Welt, unabhaengig vom Terrain darunter (ueber
       * Gras, Wasser oder beidem). Jede Fledermaus wechselt unabhaengig von
       * den anderen einmal pro Nacht das Gebiet - kein Mitziehen wie bei der
       * Ente, Ueberschneidung mehrerer Tiere ist reiner Zufall.
       */
      grounds: {
        count: [5, 7],
        areaShare: [0.05, 0.10],   // Anteil der Kartenflaeche je Gebiet
        aspect: [1.3, 2.2],        // Laenge/Breite-Verhaeltnis des Ovals
        switchHours: [3, 7],       // im Mittel gut einmal pro Nacht
        // Gesucht wird ueber Gras oder Wasser, nicht ueber Wald oder Boden
        // (data/tiere.md). tries Kandidatenmittelpunkte, je samples
        // Stichproben im Oval - genommen wird der beste Treffer, damit kein
        // Seed ganz ohne Jagdgebiete dasteht.
        tries: 16,
        samples: 9
      },

      /**
       * Das zackige Jagen: kurze schnelle Vorstoesse mit haeufigem
       * Richtungswechsel. circleRate ist der Wendekreis, der nur am Rand des
       * Jagdgebiets ausgeloest wird, nicht im Regelbetrieb, und so lange
       * dreht, bis der Kurs wirklich zurueck ins Gebiet zeigt (js/sim/bat.js,
       * beginCircle) - bei rund 55 u/s Jagdtempo und 3.4 rad/s ergibt das
       * einen Radius von gut 16 u, ein enger Kreis statt eines weiten Bogens.
       */
      hunt: {
        dartSeconds: [0.3, 0.7],
        jitter: 1.6,
        circleRate: 3.4
      },

      /**
       * Aktiv nur nachts (data/tiere.md: "Nacht", nicht "Nacht + Daemmerung"
       * wie beim Wildschwein). leaveAt liegt kurz vor dem Ende des
       * Wachfensters, damit der Heimflug noch in die Nacht faellt.
       */
      sleep: {
        leaveAt: 0.15
      },
      awake: [0.80, 0.20],

      /**
       * Kein reaction-Block: Groessenklasse 1 loest bei keiner anderen Art
       * eine Fluchtschwelle aus, und die Fledermaus selbst prueft nie auf
       * Bedrohung (data/tiere.md: "keine Interaktion mit anderen Tieren").
       * js/sim/bat.js setzt agent.flight, solange sie in der Luft ist - genau
       * wie bei der fliegenden Ente zaehlt sie dadurch fuer niemanden als
       * greifbare Stoerung (ctx.nearestDisturber), auch nicht fuer den
       * Barsch, dessen Fluchtpruefung keine Groessenschwelle kennt.
       */
    },

    dachs: {
      id: 'dachs',
      name: 'Dachs',
      plural: 'Dachse',
      sprite: 'Dachs.png',
      size: 2,
      domain: 'land',
      layer: 2,
      active: 'nacht',
      count: [3, 6],
      food: 'ameisenbrut',      // Hauptnahrung, deutlich vor Nuessen und Pilzen

      /**
       * Katalog r/w/f = 7 / 22 / 48, oberes Ende der Stufe "langsam"
       * (data/tiere.md §2) - vorher 6 / 16 / 40, das untere Ende derselben
       * Stufe. Am Bild wirkte der Dachs damit eher schleichend als gemuetlich;
       * das Bummelige der Art traegt ohnehin die Pausenhaeufigkeit, nicht das
       * Tempo. Es gibt kein eigenes "streifen"-Tempo: Zielgang und Streifzug
       * benutzen dasselbe "gehen", der Unterschied liegt in der Zielwahl (ein
       * Punkt gegen ein Stueck freie Richtung) und in den haeufigen Pausen des
       * Streifens, nicht im Tempo. "wuehlen" ist hier das Fressen an einer
       * Ortsnahrung (Ameisenhuegel, Nuss- oder Pilznest) - derselbe Zustand
       * wie beim Wildschwein, nur ohne dessen Rottenlogik; am Ameisenhuegel
       * traegt dieses Tempo zusaetzlich die Zickzacklinien (antZigzag).
       */
      speed: {
        schlafen: [0, 0],
        sichern: [0, 0],
        trinken: [0, 0],
        wuehlen: [5, 9],
        gehen: [17, 27],
        fliehen: [42, 54]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20,
        range: 0.20            // Reviergroesse, data/tiere.md §2
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 90       // gemaechlich, driftet langsamer als das Reh
      },

      /**
       * Die Familie teilt nur den Bau, keinen Verband: kein gemeinsames Ziel
       * wie die Rotte, keine Kraefte wie der Schwarm - genau wie beim
       * Kaninchen (js/sim/rabbit.js), nur nachts statt tags unterwegs und ohne
       * dessen Heimlauf bei Gefahr. splitAt aus data/tiere.md: bis 5 Tiere
       * eine Familie, ab 6 zwei.
       */
      family: {
        splitAt: 5
      },

      /**
       * Der Bau liegt im Wald, ohne Tiefenanforderung (anders als der
       * Schlafplatz des Wildschweins) und ohne Mindestabstand zum Wasser
       * (anders als beim Kaninchen) - beides ausdruecklich so besprochen.
       *
       * Neu sind zwei *Hoechst*-Abstaende: der Bau soll hoechstens 300 u vom
       * Wasser und hoechstens 300 u von einem Ameisenhuegel entfernt liegen
       * (Regel: js/world/rules.js, placement.forestBurrow). Das ist eine
       * Entscheidung ueber das Bild, keine Biologie: eine Nacht ist nur rund
       * 120 s lang, und lagen Trinkstelle und Lieblingsnahrung beide weit weg,
       * bestand sie fast vollstaendig aus zwei langen Wegen hin und zurueck.
       * Mit beidem in Reichweite bleibt Zeit zum Umherstreifen.
       *
       * radius ist das Revier um den Bau, aus dem sich der Dachs seine Nuss-
       * und Pilzstellen zusammensucht und in dem der groesste Teil der Nacht
       * ("weiter Kram") spielt - bewusst grosszuegig (500 u), damit der Dachs
       * wirklich weit laeuft statt in einem engen Fleck zu kreisen. Der
       * Ameisenhuegel-Ausflug (js/sim/dachs.js, pickAnthill) ist trotzdem
       * *nicht* an dieses Revier gebunden, sondern sucht ueber die ganze
       * erreichbare Landmasse - ein 500-u-Revier waere sonst kaum noch von
       * "irgendwo auf der Karte" zu unterscheiden.
       */
      home: {
        radius: 500,
        minDistToWater: 140,
        maxDistToWater: 300,
        maxDistToAnthill: 300,
        // Mit dem groesseren Revier mitgewachsen (war 400) - sonst ueber-
        // lappten sich zwei 500-u-Reviere fast vollstaendig.
        minBurrowDistance: 700,
        tries: 60
      },

      /**
       * Drei Ortsnahrungen mit einer Vorliebe davor. Nur 'nuesse' teilt sich
       * die Karte wirklich mit einer anderen Art (Reh, data/tiere.md §1);
       * 'pilze' und 'ameisenbrut' sind eigene Nahrungsarten auf Objekten, an
       * denen schon eine andere Art frisst - dieselbe Idee wie
       * Wasserpflanzen/Kleintiere bei Ente und Barsch: ein Ort, zwei getrennte
       * Vorraete.
       *
       * Bei der Ameisenbrut ist das eine bewusste Korrektur: seit der Bau am
       * Ameisenhuegel steht und der Dachs den nahen Huegel bevorzugt, graebt
       * die ganze Familie Nacht fuer Nacht denselben Huegel leer. Auf einer
       * geteilten Karte hat das dem Wildschwein eine seiner Nahrungsquellen
       * dauerhaft entzogen und seine bereits justierten Werte verschoben
       * (gemessen: wuehlt 20 % -> 14 %, suhlt auf Boden 72 % -> 58 %). Mit
       * eigenem Vorrat ist der Einfluss des Dachses auf das Wildschwein wieder
       * exakt null - und aus dem Bild ist nichts davon zu sehen: es sind
       * dieselben Huegel.
       *
       * weight wirkt nur bei Nuessen und Pilzen (js/sim/dachs.js,
       * pickLocalSpot) - der Ameisenhuegel der Nacht wird ohne Vorliebegewicht
       * gewaehlt, nur nach Vorrat und schwach nach Entfernung.
       */
      forage: {
        ameisenbrut: {
          source: 'anthills',
          eatPerSecond: 0.010,
          regrowPerSecond: 0.0030,
          minEdible: 0.30,
          weight: 1.00
        },
        nuesse: {
          source: 'resources',
          eatPerSecond: 0.007,
          regrowPerSecond: 0.0018,
          minEdible: 0.25,
          weight: 0.55
        },
        pilze: {
          source: 'resources',
          eatPerSecond: 0.007,
          regrowPerSecond: 0.0022,
          minEdible: 0.25,
          weight: 0.55
        }
      },

      /**
       * Der Dachs sieht seine Nahrung nicht (anders als das Reh), er kennt
       * sein Revier (wie das Wildschwein) - beim Anlegen sammelt jede Familie
       * die Nuss- und Pilzstellen im Umkreis ihres Baus ein (die Ameisenhuegel
       * nicht, die sucht jede Nacht neu). Die Entfernung zaehlt bei Nuessen und
       * Pilzen kraeftiger gegen den Vorrat als beim
       * Wildschwein: ein einzelner Dachs soll nicht quer durchs Revier laufen,
       * wenn eine schwaechere Stelle naeher liegt.
       */
      forageChoice: {
        jitter: 0.30,
        distanceCost: 0.0060,
        bout: [40, 90],          // Sekunden an einer Nuss- oder Pilzstelle
        /**
         * Am Ameisenhuegel etwas kuerzer als an Nuss- und Pilzstellen (war
         * dieselbe Spanne). Nicht, weil er dort weniger gern graebt - es
         * bleibt mit Abstand seine laengste Einzelbeschaeftigung und rund die
         * Haelfte der Nacht -, sondern weil eine Nacht nur rund 105 nutzbare
         * Sekunden hat: mit 40-90 s am Huegel plus Hin- und Rueckweg blieb fuer
         * das Trinken nichts uebrig (gemessen 0.66 statt 1-3 Trinkgaenge).
         */
        antBout: [35, 70],
        cooldown: [60, 140],
        pointReach: 20,

        /**
         * Der Ameisenhuegel der Nacht wird weiterhin ueber die ganze Landmasse
         * gesucht, aber nicht mehr voellig entfernungsblind: bei nur 3-4
         * Huegeln auf 1600 x 1000 u lag der freie Griff im Mittel rund 500 u
         * entfernt, und Hin- und Rueckweg fuellten damit den groessten Teil der
         * Nacht. antDistanceCost ist deutlich schwaecher als distanceCost oben
         * (ein Sechstel) und antJitter dafuer breiter - der nahe Huegel gewinnt
         * meistens, ein voller weiter Huegel schlaegt einen leergefressenen
         * nahen aber immer noch. "Muss nicht der naechste sein" bleibt damit
         * wahr, ist aber nicht mehr die Regel.
         */
        antJitter: 0.50,
        antDistanceCost: 0.0010
      },

      /**
       * Am Ameisenhuegel steht der Dachs nicht mehr still, sondern laeuft in
       * kleinen Zickzacklinien darueber - der Huegel wird abgesucht, nicht an
       * einem Punkt abgetragen. Die Zahlen sind Vielfache des Huegelradius
       * (js/world/config.js, anthills.radius = 13-19 u), damit ein grosser
       * Huegel weitere Schenkel bekommt als ein kleiner:
       *
       *   span       halbe Laenge eines Schenkels quer ueber den Huegel
       *   stepAcross Versatz zur Seite bei jeder Umkehr
       *   maxAcross  wie weit der Versatz wandert, bevor er zuruecklaeuft
       *   radius     Rueckfall, falls ein Huegel keinen Radius mitbringt
       *
       * turn ist bewusst hoeher als das gemaechliche TURN des Gehens
       * (js/sim/dachs.js): mit 1.8 rad/s braucht eine Kehrtwende fast zwei
       * Sekunden und die Zacken werden zu Schleifen.
       */
      antZigzag: {
        span: 0.85,
        stepAcross: 0.45,
        maxAcross: 0.70,
        radius: 16,
        turn: 4.0
      },

      /**
       * Trinken 1-3 Mal in der Nacht. Die Wachzeit ist mit rund 9.6
       * Simulationsstunden (reine Nachtphase) kuerzer als beim Wildschwein -
       * das Intervall ist entsprechend breiter gestreut, damit auch mal nur
       * ein Gang in eine Nacht passt.
       */
      /**
       * Das Intervall ist von 3.5-8.5 h auf 2.5-5.5 h verkuerzt. Grund ist
       * nicht mehr Durst, sondern die Laenge der Nacht: bei 3.5 h Mindestpause
       * (44 s) und rund 105 nutzbaren Sekunden passte nach dem ersten Trinken
       * nie ein zweites in dieselbe Nacht, und wurde das erste vom
       * Ameisenhuegel verdraengt, blieb die Nacht ganz trocken (gemessen 0.74
       * statt der zugesagten 1-3 Trinkgaenge).
       *
       * earlyHours/nearby (vorzeitig trinken, wenn das Wasser ohnehin nah ist)
       * bleiben bei 1.2 h - der Zweig laeuft beim Dachs praktisch nie, weil
       * nextDrink auch waehrend des Schlafens weiterlaeuft und der Durst
       * deshalb bei jeder Pruefung laengst ueberfaellig ist. Ein Versuch, ihn
       * auf 3.0 h zu oeffnen, aenderte gemessen keine einzige Stelle.
       */
      drink: {
        intervalHours: [2.5, 5.5],
        bout: [6, 12],
        reach: 12,
        earlyHours: 1.2,
        nearby: 130
      },

      /**
       * Der Rhythmus einer Nacht: nach dem Aufbruch (und nach jeder
       * Streifphase) geht der Dachs geradewegs zu Futter oder Wasser, je
       * nachdem was faelliger ist (siehe js/sim/dachs.js, chooseTarget) - und
       * erst danach streift er wieder. leg ist ein einzelner Streifschritt,
       * pause die Stehpause danach; im Wald bleibt er spuerbar laenger und
       * oefter stehen ("lassen sich von niemandem aus der Ruhe bringen").
       * seconds ist die Gesamtdauer einer Streifphase, bevor wieder ein Ziel
       * gesucht wird.
       *
       * leg ist bewusst deutlich laenger als beim ersten Anlauf (war 30-90):
       * bei einem 500-u-Revier braeuchte ein Dachs mit kurzen Schritten viele
       * Streifphasen, um ueberhaupt einmal an den Rand zu kommen - "sollen
       * immer weiter laufen" heisst, ein einzelner Streifzug muss selbst
       * schon einen guten Teil des Reviers zuruecklegen koennen.
       */
      roam: {
        leg: [60, 220],
        pause: [2, 5],
        forestPause: [5, 12],
        /**
         * Eine Streifphase am Stueck - von 45-110 s auf 25-60 s gekuerzt. Eine
         * Nacht hat nur rund 105 nutzbare Sekunden: bei der alten Spanne war
         * *eine* Streifphase die ganze Nacht, chooseTarget kam danach nie mehr
         * an die Reihe, und der versprochene Wechsel "geradewegs - streifen -
         * geradewegs" fand genau einmal je Nacht statt. Gestreift wird
         * deswegen nicht weniger, nur oefter neu entschieden.
         */
        seconds: [25, 60],
        // Faengt die Nacht mit Streifen an, dann kuerzer als sonst: eine volle
        // Streifphase waere bei rund 120 s Nachtlaenge fast die halbe Nacht,
        // und der Ameisenhuegel kaeme nicht mehr dran.
        opening: [15, 45]
      },

      /**
       * Aktiv nur nachts, wie die Fledermaus (nicht "Nacht + Daemmerung" wie
       * beim Wildschwein). leaveAt liegt kurz vor dem Ende des Wachfensters,
       * damit der Heimweg noch in die Nacht faellt.
       */
      sleep: {
        leaveAt: 0.15,
        spread: 30,             // Umkreis, in dem die Familie tagsueber am Bau liegt
        /**
         * Wie lange ein Dachs nach dem Aufwachen noch am Bau herumsteht, bevor
         * er losgeht. Das Wachfenster gilt fuer alle gleich - ohne diese
         * Streuung bricht die ganze Familie in derselben Sekunde auf und
         * laeuft als Pulk los, obwohl jeder fuer sich unterwegs sein soll
         * (gemessen: alle innerhalb von 2-5 s ausserhalb des Bauumkreises).
         *
         * Nicht mehr, obwohl mehr besser streuen wuerde: eine Nacht hat nur
         * rund 105 nutzbare Sekunden, und 15 s Troedeln sind davon schon ein
         * Siebtel. Bei 22 u/s liegen selbst 15 s Unterschied als 300 u
         * zwischen zwei Aufbrechenden.
         */
        wakeSpread: [0, 15]
      },
      awake: [0.80, 0.20],

      /**
       * "Laesst sich von niemandem aus der Ruhe bringen": gemieden wird nur
       * Groessenklasse >= 5 - im Kernset niemand (nur der Baer, Bonus, hat
       * diese Klasse). Der Zweig ist ueber den kuenstlichen Stoerer in
       * tools/simtest.js geprueft, wie schon bei Reh und Wildschwein.
       */
      reaction: {
        ignore: ['ente', 'barsch'],
        fleeFromSize: 5,
        fleeRadius: 130,
        fleeSeconds: [4, 9]
      }
    },

    fuchs: {
      id: 'fuchs',
      name: 'Fuchs',
      plural: 'Füchse',
      sprite: 'Fuchs.png',
      size: 2,
      domain: 'land',
      layer: 2,
      active: 'nacht',
      count: [2, 4],

      /**
       * Die dritte Art ohne forage-Block, aber aus einem dritten Grund. Das
       * Kaninchen sucht nichts, die Fledermaus jagt ohne Vorrat, der Fuchs
       * jagt *echte Tiere* - nur toetet er sie nicht, also sinkt nirgends ein
       * Vorrat. 'beutetiere' ist deshalb ein eigener Wert im Merkmalsvektor
       * und nicht noch einmal 'keine': am Bildschirm sieht man den Unterschied
       * (eine Ente schwimmt weg, ein Kaninchen rennt heim), im Vektor bisher
       * nicht.
       */
      food: 'beutetiere',

      /**
       * Katalog r/w/f = - / 36 / 86. Ein "ruhig"-Tempo gibt es nicht: der
       * Fuchs steht entweder (Stop, Trinken, Schlaf) oder ist unterwegs.
       * 'gehen' traegt Patrouille und Querung gleichermassen - der Unterschied
       * zwischen beiden liegt in der Zielwahl, nicht im Tempo (dieselbe
       * Entscheidung wie beim Dachs).
       *
       * 'hetzen' ist der eigene Zustand fuer die Jagd (js/sim/agents.js, 16),
       * 'fliehen' dasselbe Tempo in die andere Richtung: ein Fuchs, der vor
       * einer Rotte wegrennt, ist nicht langsamer als einer, der einem
       * Kaninchen hinterherrennt.
       */
      speed: {
        schlafen: [0, 0],
        sichern: [0, 0],
        trinken: [0, 0],
        gehen: [31, 41],
        hetzen: [74, 94],
        fliehen: [74, 94]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20,
        range: 0.15            // Reviergroesse, data/tiere.md §2
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 60
      },

      /**
       * Das Revier - bei dieser Art kein Suchraum wie beim Dachs, sondern die
       * Form, an der das ganze Tier haengt (data/tiere.md, Fuchs).
       *
       * Der Radius steht hier *nicht*, weil er keine Konstante ist: die Karte
       * wird in so viele gleich grosse Zellen geteilt, wie es Fuechse gibt
       * (js/sim/fox.js, LAYOUT), und jede Blase fuellt ihre Zelle um `fill`.
       *
       *   rx = Zellbreite / 2 * fill      ry = Zellhoehe / 2 * fill
       *   2 Fuechse -> ~376 u    3 -> ~307 u    4 -> ~266 u  (flaechengleich)
       *
       * Die ~520 u der Katalogtabelle waren immer der Fall "zwei Fuechse".
       * Bei vier festen 520-u-Revieren laegen 3.4 Millionen u² auf einer Karte
       * von 1.6 Millionen - die Reviere haetten sich zur Haelfte gedeckt.
       *
       * `fill` und `jitter` teilen sich denselben Spielraum und gehoeren
       * deshalb zusammen gelesen. Zwei gleiche Ellipsen im Abstand d
       * ueberlappen sich um hoechstens 10 %, wenn d/(2r) >= 0.80 ist; der
       * Abstand ist die Zellbreite, verkuerzt um zweimal die Streuung:
       *
       *   (1 - 2 * jitter) / fill >= 0.80
       *   0.84 und 0.07  ->  1.02    (haelt mit Reserve)
       *
       * **fill 1.05 -> 0.84 ist die Ansage "Reviere 20 % kleiner".** Linear,
       * nicht in der Flaeche: 20 % kleiner heisst 20 % kuerzerer Radius, die
       * eingeschlossene Flaeche sinkt dabei auf 0.64. Seither beruehren sich
       * die Ellipsen im Zellabstand rechnerisch gar nicht mehr (1.02 > 1) -
       * es bleiben Luecken zwischen den Revieren, und das ist der sichtbare
       * Preis der kleineren Blasen. Auf die Haelfte der Seeds faellt die
       * gemessene Ueberlappung dadurch auf 0 %; die 10 % im schlimmsten Fall
       * bleiben aber stehen, denn was sich jetzt noch ueberschneidet, sind
       * ausschliesslich Beulen zweier Konturen - und die schrumpft
       * shrinkToFit weiterhin auf die Zusage zurueck.
       *
       * Was dadurch seltener wird, ist der geteilte Dachsbau: er muss *im*
       * Fuchsrevier liegen, und ein kleineres Revier trifft weniger Baue.
       * Gemessen 5 von 10 Welten statt 8 (data/tiere.md).
       *
       * **Beide Zahlen sind schon einmal in die falsche Richtung gelaufen.**
       * Mit jitter 0.04 unterschieden sich die 24 Kandidaten praktisch nicht
       * mehr im Mittelpunkt, sondern nur in der Wellenform - die Suche nach
       * Wasser und Wald lief ins Leere (5-6 Reviere ohne eine einzige
       * Waldstichprobe). Mit jitter 0.12 bei fill 1.12 rueckten zwei
       * Mittelpunkte auf 390 statt 500 u zusammen, und die Nachkorrektur
       * unten musste das eine Revier auf ein Viertel der Flaeche
       * zusammenstauchen, um die 10 % zu halten - "halbwegs gerecht" war
       * damit weg. Die Reserve muss vorne stimmen; nachkorrigieren laesst
       * sich nur ein Rest.
       *
       * maxOverlap selbst ist die Zusage aus data/tiere.md und wird
       * *erzwungen* statt erhofft (js/sim/fox.js, shrinkToFit): eine Beule der
       * Kontur kann genau auf den Nachbarn zeigen, und dort ist der oertliche
       * Abstand kleiner als der gerechnete. minShrink begrenzt, wieviel dabei
       * nachgegeben wird - lieber ein Revier knapp ueber der Grenze als eins,
       * das kein Revier mehr ist.
       *
       * Die Blase entsteht aus wenigen Wellen ueber der Ellipse:
       *
       *   r(theta) = ellipse(theta) * (1 + SUMME a_h * sin(h * theta + phi_h))
       *
       * harmonics sind die h, wobble die Spanne der a_h. Zwei tiefe Wellen
       * geben die grobe Beule, die fuenfte die Unruhe am Rand; mehr braucht es
       * nicht, und weniger sieht wie eine Ellipse aus.
       */
      home: {
        fill: 0.84,            // wie weit die Blase ihre Kartenzelle fuellt
        jitter: 0.07,          // Streuung des Mittelpunkts, als Anteil der Zelle
        maxOverlap: 0.10,      // hoechste Ueberlappung zweier Reviere
        minShrink: 0.75,       // so weit darf dafuer hoechstens verkleinert werden
        harmonics: [2, 3, 5],
        wobble: [0.08, 0.16],
        samples: 32,           // Stuetzstellen der Kontur
        /**
         * Die Patrouille laeuft knapp innerhalb der Grenze. 0.92 -> 0.90, weil
         * die Sehne zwischen zwei benachbarten Stuetzstellen an einer
         * *einwaerts* gebeulten Stelle der Kontur nach draussen ragt - ein
         * Fuenftel aller Austritte kam daher. Am gemessenen Randanteil aendert
         * das nichts: gezaehlt wird ab 0.75.
         */
        inset: 0.90,
        tries: 24              // Kandidaten je Kartenzelle
      },

      /**
       * Zwei *Teilrunden* je Nacht, nicht zwei volle - und das ist gerechnet,
       * nicht gespart. Die Nacht hat rund 168 nutzbare Sekunden, ein voller
       * Umlauf misst bei 36 u/s zwischen 55 s (vier Fuechse, kleines Revier)
       * und 75 s (zwei Fuechse). Zwei volle Runden waeren zwar seit dem
       * kleineren Revier und dem hoeheren Tempo rechnerisch drin - aber dann
       * fielen Querung, Trinken und Jagd auf den Rest zusammen, und das ist
       * die Zeitbudget-Falle, die beim Dachs schon einmal die Trinkgaenge auf
       * 0.0 gedrueckt hat.
       *
       * share ist der Anteil des Umfangs je Teilrunde. Begonnen wird dort, wo
       * die letzte aufgehoert hat: erst dadurch ergibt sich ueber fuenf
       * Naechte die geschlossene Blase auf der Spur.
       *
       * **share 0.40 -> 0.75 ist die Ansage "mehr am Revierrand".** Sie ist
       * nicht bloss eine Erhoehung, sondern zuerst ein Ausgleich: ein Revier
       * mit 20 % kuerzerem Radius, abgelaufen mit 20 % mehr Tempo, kostet je
       * Teilrunde nur noch zwei Drittel der alten Zeit - bei share 0.40 waere
       * der Fuchs nach der Aenderung *weniger* am Rand unterwegs gewesen
       * (gemessen 39 % der Wachzeit vorher, ~27 % mit den neuen Zahlen bei
       * altem share). Erst 0.75 dreht das um.
       *
       * **Weiter geht es nicht, und die Grenze steht nicht beim Fuchs.** Das
       * Zeitbudget haette 0.85 noch getragen (gemessen 50 % statt 47 % der
       * Wachzeit im aeusseren Ring, Trinkgaenge unveraendert 1.8) - der
       * Barsch traegt es nicht. Ein Fuchs, der laenger auf seiner Grenze
       * laeuft, ist laenger am Ufer, und der Schwarm flieht vor allem, was
       * naeher als 95 u kommt, ohne Groessenschwelle: auf Seed 315927 war die
       * Ruhe des Schwarms danach nicht mehr messbar ("nachts nicht deutlich
       * langsamer", tools/simtest.js). Diese Schwelle ist wegen des Fuchses
       * schon einmal nachgegeben worden (0.85 -> 0.90, data/tiere.md §6); ein
       * zweites Mal waere sie keine Zusage mehr, sondern eine Nachlaufzahl.
       *
       * **Mit dem Saum (cross.rimChance) wurde 0.85 noch einmal probiert und
       * wieder verworfen.** Es brachte einen einzigen Punkt mehr Randanteil
       * (53 statt 52 %) und kostete dafuer den halben Abstand zur
       * Barsch-Schwelle: das Nachttempo des Schwarms stieg auf Seed 315927 von
       * 72 auf 86 % des Tagtempos, erlaubt sind 90. Der Saum liefert dieselben
       * fuenf Punkte fuer nichts, weil er dort laeuft, wo der Fuchs ohnehin
       * schon steht - deshalb steht die Ansage "mehr an der Grenze" heute
       * dort und nicht hier.
       */
      patrol: {
        share: 0.75,
        perNight: 2,
        secondHalf: 0.5,       // die zweite Teilrunde erst in der zweiten Nachthaelfte
        arrive: 14
      },

      /**
       * Quer durchs Revier. Das Ziel liegt auf der *gegenueberliegenden* Seite
       * (Winkel zur Reviermitte plus PI, gestreut um farSide) - frei
       * gewuerfelt bliebe der Fuchs um seinen Bau haengen, dieselbe Ueberlegung
       * wie bei der Beharrung der Zugrichtung beim Reh.
       */
      cross: {
        leg: [90, 260],
        pause: [1.5, 4.0],
        stopChance: 0.55,
        farSide: 2.2,          // Streuung um die Gegenrichtung (rad)
        /**
         * Wie weit hinaus, als Anteil des Revierradius. reach ist die
         * persoenliche Obergrenze (in spawn um variation.range gestreut und
         * bei 0.98 gedeckelt), depth die Streuung Zug fuer Zug. Zusammen
         * landet ein Querungsziel im Mittel bei 0.85 des oertlichen Radius,
         * je nach Fuchs und Zug zwischen 0.66 und 0.98.
         *
         * **0.85 x [0.7, 1.0] -> 0.92 x [0.85, 1.0] ist die Ansage "mehr an
         * der Grenze".** Vorher lag ein Querungsziel im Mittel bei 0.72 r und
         * damit knapp *unter* dem aeusseren Ring, an dem gemessen wird - der
         * Fuchs drehte also regelmaessig kurz vor seiner eigenen Grenze um.
         */
        reach: 0.92,
        depth: [0.85, 1.0],
        /**
         * Der Saum: die Wahrscheinlichkeit, am Ende einer Querung noch ein
         * Stueck Grenze mitzunehmen, und wie viele Stuetzstellen das sind
         * (js/sim/fox.js, beginRim).
         *
         * Das ist der zweite Weg, den Fuchs an seine Grenze zu bringen; der
         * erste (patrol.share) ist ausgereizt, weil eine laengere Teilrunde
         * mehr Uferzeit bedeutet und der Barschschwarm die nicht traegt. Der
         * Saum kostet keine zusaetzliche Uferzeit: der Fuchs ist am Ende einer
         * Querung ohnehin schon dort, wo er ist.
         */
        rimChance: 0.90,
        rimSteps: [6, 14]
      },

      /**
       * Der Weg um den See herum (js/sim/fox.js, viaAround und shoreCheck).
       *
       * Ein Ziel jenseits eines Sees wird gar nicht erst gewaehlt - aber es
       * gibt Reviere, in denen *jedes* Ziel jenseits eines Sees liegt, weil
       * der See mitten darin oder an seinem Rand liegt. Dann lief der Fuchs
       * bisher am Ufer entlang, ohne je anzukommen: einzelne Tiere kamen auf
       * 30 % ihrer gesamten Strecke dichter als 25 u am Wasser und auf
       * Ufermaersche von 1300 u am Stueck. Statt dessen wird jetzt seitlich
       * vorbei geplant.
       *
       * band ist der Abstand, ab dem "am Ufer" gilt, patience die Zeit, die er
       * dort laufen darf, bevor umgeplant wird (eine Landzunge quert man in
       * weniger), tries die Zahl der Umwege je Zug - danach ist es kein See
       * mehr, um den sich herumkommen laesst, und die Notbremse uebernimmt.
       */
      detour: {
        /**
         * Der Uferstreifen, den er beim Laufen nicht betritt (js/sim/fox.js,
         * makeDryLand). Das ist die Zeile, die die Uferringe wirklich
         * abstellt: nicht die Zielwahl zeichnet sie, sondern der
         * Ausweichfaecher, der *jede* Bewegung, die einen See streift, am Ufer
         * entlangfuehrt. 20 u sind gut ein Sprite breit - genug, dass die
         * Spur sichtbar Abstand haelt, wenig genug, dass zwischen zwei nahen
         * Seen noch ein Weg bleibt.
         *
         * Er gilt nicht fuer den Weg zum Wasser, nicht wenn der Fuchs schon
         * drin steht, und nicht wenn sein Ziel darin liegt - sonst waere das
         * Trinken unmoeglich und ein Bau am See unerreichbar.
         */
        keep: 20,
        band: 35,
        patience: 2.5,
        tries: 2
      },

      /**
       * Trinken 1-2 Mal je Nacht, am naechsten Gewaesser *im eigenen Revier* -
       * dass dort eines liegt, ist der Grund fuer die Wasserbedingung bei der
       * Revierwahl. earlyHours/nearby ist der Gelegenheitsschluck von Reh und
       * Wildschwein; beim Fuchs traegt er vor allem die Zeile "trinkt gerne
       * mal dann am Wasser" nach einer Entenjagd.
       */
      drink: {
        intervalHours: [4, 7],
        bout: [5, 10],
        reach: 12,
        earlyHours: 1.5,
        nearby: 130
      },

      /**
       * Die Jagd. Wer Beute ist, steht hier und nicht als Groessenschwelle -
       * ein Fuchs jagt kein Reh, obwohl es groesser ist als ein Kaninchen.
       *
       * Beim Kaninchen stehen zwei Bedingungen, und sie sind nicht dasselbe:
       * duskOnly ist die Tageszeit ("nur in der Daemmerung"), awakeOnly der
       * Zustand ("solange sie noch draussen sind"). Ein Kaninchen, das um
       * 0.76 schon am Bau liegt, ist von der Daemmerung noch erfasst, aber
       * eben nicht mehr draussen. Bei der Ente fehlt awakeOnly ausdruecklich:
       * eine schlafende Ente am Ufer *ist* der klassische Fall, und sie
       * schlaeft fast das ganze Wachfenster des Fuchses ueber.
       *
       * nearWater bei der Ente: der Fuchs geht nicht eigens auf Entenjagd, er
       * versucht es, wenn er ohnehin am Wasser ist.
       *
       * cooldown ist die Sperrzeit nach einer Hetze. Ohne sie hetzt ein Fuchs,
       * dessen Reviergrenze am Kaninchenbau vorbeifuehrt, die halbe Nacht
       * dasselbe Tier - derselbe Unterschied zwischen "einmal erschrocken" und
       * "Dauerzustand", den das Kaninchen mit seiner Wartezeit im Bau loest.
       */
      hunt: {
        prey: ['ente', 'kaninchen'],
        ente: { sight: 130, nearWater: 90, awakeOnly: false },
        kaninchen: { sight: 150, duskOnly: true, awakeOnly: true },
        dusk: [[0.20, 0.30], [0.70, 0.80]],
        bout: [3, 6],
        giveUp: 130,
        // So weit folgt er einer Beute ueber die eigene Reviergrenze hinaus -
        // eine Ente, die ueber den See davonschwimmt, zoege ihn sonst am Ufer
        // entlang aus seinem Revier heraus.
        beyond: 45,
        /**
         * Der Abstand zum Wasser, ab dem eine Hetze auf eine schwimmende Beute
         * vorbei ist - und zugleich der, unterhalb dessen sie gar nicht erst
         * beginnt (js/sim/fox.js, huntStep und checkHunt).
         *
         * "Er schwimmt nicht" hat der Ausweichfaecher bisher allein erledigt,
         * und zwar falsch: er laesst den Fuchs nicht stehen, sondern am Ufer
         * entlang hinter der Ente her. **76 % der gesamten Hetzstrecke lagen
         * dichter als 25 u am Wasser.** 22 u liegt knapp ueber drink.reach
         * (12): er kommt weiterhin ans Ufer, er laeuft es nur nicht mehr ab.
         */
        shore: 22,
        cooldown: [20, 45]
      },

      /**
       * Nacht + beide Daemmerungen, Fenster ueber Mitternacht wie beim
       * Wildschwein. wakeSpread ist kuerzer als beim Dachs (0-15 s): die
       * Fuechse leben in getrennten Revieren und koennen gar keinen Pulk
       * bilden - gestreut wird nur, damit der allererste Augenblick der
       * Aufzeichnung nicht alle gleichzeitig losmarschieren zeigt.
       *
       * leaveAt liegt bei 0.28 und nicht frueher, weil daran die
       * Kaninchenjagd haengt: das Kaninchen wacht bei 0.24 auf, der Fuchs
       * jagt es nur in der Daemmerung, und wer ab 0.26 nach Hause laeuft,
       * hat morgens nur sechs Sekunden Ueberschneidung. Mit 0.28 sind es
       * zwoelf - immer noch wenig, aber "versucht sein Glueck" statt
       * "kommt praktisch nie vor".
       */
      sleep: {
        leaveAt: 0.28,
        spread: 20,
        wakeSpread: [0, 12]
      },
      awake: [0.70, 0.30],

      /**
       * Groessenklasse 2. Geflohen wird vor Groessenklasse >= 4 (Wildschwein,
       * spaeter Baer). Barsch und Fledermaus werden ausdruecklich ignoriert -
       * der eine unter, die andere ueber ihm. Ente und Kaninchen stehen hier
       * *nicht* in ignore: sie sind Beute, und die Jagd laeuft ohnehin ueber
       * hunt.prey statt ueber diese Liste.
       */
      reaction: {
        ignore: ['barsch', 'fledermaus'],
        fleeFromSize: 4,
        fleeRadius: 120,
        fleeSeconds: [3, 7],
        /**
         * Die Flucht bleibt im Revier. 3-7 s bei 84 u/s tragen weiter, als das
         * Revier breit ist - der Fuchs lief dadurch 45 % seiner Fluchtzeit
         * ausserhalb.
         *
         * bendHome ist die groesste erlaubte Drehung der Fluchtrichtung nach
         * innen (rad), bendRate die Nachfuehrung waehrend des Laufens (rad/s).
         * Eine knappe Vierteldrehung ist die Obergrenze mit Bedeutung: mehr
         * hiesse, der Fuchs koennte auf den Stoerer zulaufen, weniger, dass er
         * die Grenze nicht mehr entlanglaeuft, sondern ueber sie hinweg.
         *
         * bendFrom ist der Radiusanteil, ab dem ueberhaupt gedreht wird.
         * Mitten im Revier ist die Fluchtrichtung eine Frage des Stoerers und
         * keine der Geografie - erst am Rand kehrt sich das um.
         */
        bendFrom: 0.80,
        bendHome: 1.5,
        bendRate: 1.2
      }
    },

    /**
     * Der Bussard - die erste Art, die nicht zum Kernset gehoert, sondern als
     * *Nachzuegler* am Bruch bei Tag 5 auftaucht (WL.NEW_SPECIES ganz unten).
     * Er erscheint deshalb als genau ein Individuum, egal was count sagt.
     *
     * Daraus folgt die harte Bedingung an spawn(): es darf nichts anlegen, was
     * der ganzen Art gehoert. Beim Fuchs waere das unmoeglich (er teilt die
     * Karte nach Anzahl in Reviere auf, ein einzelner bekaeme die ganze), beim
     * Barsch entstuende ein Schwarm aus einem Fisch. Der Bussard hat deshalb
     * *kein Revier*: seine Kreise wandern ueber die ganze Karte, und alles, was
     * er besitzt, gehoert ihm allein - ein Horst.
     */
    bussard: {
      id: 'bussard',
      name: 'Bussard',
      plural: 'Bussarde',
      sprite: 'Busard.png',     // Schreibweise der Bilddatei, kein Tippfehler
      size: 2,
      domain: 'air',            // fliegt frei wie die Fledermaus, keine Domaene
      layer: 3,
      active: 'tag',
      count: [1, 3],            // als Nachzuegler immer genau eins

      /**
       * Die vierte Art ohne forage-Block, und aus demselben Grund wie beim
       * Fuchs: er jagt sichtbar, toetet aber nichts, also sinkt nirgends ein
       * Vorrat. Getrunken wird auch nicht - das haette ihn taeglich ans Ufer
       * gebracht, wo die Fluchtschwelle des Barschschwarms schon zweimal wegen
       * des Fuchses nachgegeben hat.
       */
      food: 'beutetiere',

      /**
       * Katalog: 0 sitzen / 45 kreisen, 55 reisen / 85 abfliegen. Drei
       * Flugtempi statt eines, und der Unterschied ist im Bild zu sehen:
       * das Kreisen ist gemaechlich, die Strecke zwischen zwei Kreisen zuegig,
       * und der Abflug nach dem Jagdkreis ueber den Kaninchen ist das, was
       * "und dann ist er weg" bedeutet.
       */
      speed: {
        schlafen: [0, 0],
        sichern: [0, 0],
        kreisen: [40, 50],
        fliegen: [50, 62],
        abflug: [78, 92]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 55
      },

      /**
       * Der Horst: ein Baum im Wald, einmal pro Welt gesucht, jede Nacht
       * derselbe (js/sim/buzzard.js, findEyrie; Regel in js/world/rules.js,
       * placement.eyrie). Er ist der einzige feste Ort dieser Art.
       *
       * minForestDepth haelt ihn aus dem Waldsaum heraus - dort sitzt der
       * Bussard tagsueber ohnehin (perch.depth), und beides an derselben
       * Stelle waere im Merkmal "feste Orte" ein Ort statt zwei.
       */
      home: {
        minForestDepth: 5,
        tries: 80
      },

      /**
       * Das Kreisen: der Kern dieser Art.
       *
       * radius ist "mal enger, mal weiter" (data/tiere.md), bout die Dauer je
       * Kreis, hop der Abstand zum naechsten Mittelpunkt. Die Mittelpunkte
       * werden ueber *offener* Flaeche gesucht (Gras oder Boden, nicht Wald,
       * nicht Wasser) - nach demselben Kandidaten-plus-Stichproben-Muster wie
       * der Kaninchenbau und die Jagdgebiete der Fledermaus. Ohne diesen
       * Terrainbezug landete die Fledermaus gemessen zu 77 % ihrer Zeit ueber
       * dem Wald, obwohl im Katalog Gras und Wasser standen.
       *
       * edgeMargin ist der Abstand, den ein Mittelpunkt *zusaetzlich* zu
       * seinem Radius vom Kartenrand haelt. Der Kreis wird als Kreis geflogen
       * (Winkel statt Drehrate, js/sim/buzzard.js circleStep), liegt also
       * beweisbar ganz innerhalb dieses Abstands - das ist die Antwort auf die
       * Falle, an der die Fledermaus zweimal von der Karte geflogen ist.
       */
      circle: {
        radius: [70, 260],
        bout: [10, 26],
        hop: [150, 500],
        tries: 6,
        samples: 7,
        edgeMargin: 40
      },

      /**
       * Die Sitzpausen am Waldrand. Nach `after` Sekunden Kreisen wird mit
       * `chance` gelandet - nicht jedes Mal, sonst waere aus dem Suchflug ein
       * Takt geworden.
       *
       * depth ist die Waldtiefe in Zellen: 1-4 ist der Rand (dieselbe Spanne,
       * mit der das Reh seinen Schlafplatz sucht), waehrend der Horst tief
       * drinnen liegt.
       */
      perch: {
        /**
         * **after zaehlt nur die Kreiszeit, und das war beim ersten Anlauf der
         * ganze Unterschied.** Mit [25, 60] und chance 0.35 kam gemessen weniger
         * als *eine* Pause je Tag heraus (4 % der Zeit statt der geplanten 18):
         * bis der Zaehler ablaeuft, vergehen im Mittel schon zwei bis drei
         * Kreise samt der Fluege dazwischen, und danach wird noch gewuerfelt.
         * Zwei Wartezeiten hintereinander ergeben eine dritte, viel laengere -
         * bei einem Wachfenster von nur 138 s reicht das nicht.
         */
        /**
         * Es gibt keine zusaetzliche Wahrscheinlichkeit mehr, und das war die
         * eigentliche Reparatur: laeuft die Wartezeit ab, wird gelandet. Eine
         * Lotterie *nach* einer Wartezeit ergibt eine dritte, viel laengere
         * Wartezeit, und die Streuung liefert die Spanne oben ohnehin schon.
         * Gemessen kam die erste Fassung ([25,60] plus 35 %) auf weniger als
         * eine Pause je Tag statt der geplanten anderthalb.
         */
        after: [18, 40],
        bout: [16, 38],
        // Reichweite der Suche nach einem Waldrand. Gross genug, dass sie ueber
        // einer weiten Wiese nicht regelmaessig ins Leere laeuft - genau das
        // war neben der Wartezeit der zweite Grund fuer die zu seltenen Pausen.
        radius: 380,
        maxDistance: 620,
        depth: [1, 4],
        // Findet sich trotzdem keiner, wird beim naechsten Kreis gleich wieder
        // gesucht statt die Pause bis zur naechsten vollen Wartezeit
        // aufzuschieben.
        retry: 8
      },

      /**
       * Einmal am Tag bei den Kaninchen (data/tiere.md).
       *
       * `at` ist der Tagesanteil, zu dem er aufbricht - je Tag neu gewuerfelt,
       * damit es nicht jeden Tag zur selben Minute passiert. Es ist
       * ausdruecklich *keine* Bedingung, die mit etwas anderem verglichen wird:
       * ein diskretes Einmal-Ereignis verliert gegen jede laufende
       * Beschaeftigung strukturell, und genau daran sind beim Dachs die
       * Ameisenhuegel-Ausfluege von fuenf auf einen gesunken.
       *
       * Waehrend des engen Kreises ueber dem Bau ist er als einziger seiner
       * Zustaende fuer andere Tiere greifbar (js/sim/buzzard.js, update).
       * Groessenklasse 2 erreicht genau die Fluchtschwelle des Kaninchens -
       * an js/sim/rabbit.js ist dafuer nichts zu aendern.
       *
       * away ist die Mindestentfernung des naechsten Kreismittelpunkts danach:
       * er fliegt weg, und die Kaninchen kommen von selbst wieder heraus.
       */
      visit: {
        // Wer besucht wird, steht wie beim Fuchs hier und nicht als
        // Groessenschwelle - der Bussard kennt genau einen Ort dieser Art.
        prey: 'kaninchen',
        // Die Obergrenze ist nicht frei gewaehlt: zwischen dem Auslesen der
        // Uhrzeit und dem Ankommen liegen ein angefangener Kreis (bis 26 s)
        // und der Hinflug (bis rund 30 s), zusammen gut 0.19 eines Tages. Bei
        // 0.55 ist der Besuch also sicher vor dem Aufbruch zum Horst (0.72)
        // beendet; spaeter angesetzt fiele er gelegentlich ganz aus, und die
        // Zusage "einmal am Tag" waere keine mehr.
        at: [0.34, 0.55],
        radius: [35, 70],
        bout: [14, 26],
        away: 500
      },

      /**
       * Tagaktiv, und zwar deutlich: das Wachfenster liegt ganz im hellen Tag
       * (Nacht ist 0.80-0.20, die Daemmerungen liegen davor und dahinter).
       * leaveAt bei 0.72 - der Heimflug zum Horst gehoert in die
       * Abenddaemmerung, nicht in die Nacht, dieselbe Ueberlegung wie beim Reh.
       */
      sleep: {
        leaveAt: 0.72
      },
      awake: [0.26, 0.74]

      /**
       * Kein reaction-Block, wie bei der Fledermaus: er reagiert auf niemanden.
       * Umgekehrt zaehlt er fuer andere nur im engen Jagdkreis als Stoerung -
       * ueberall sonst setzt js/sim/buzzard.js agent.flight, genau wie bei der
       * fliegenden Ente und der Fledermaus.
       */
    },

    /**
     * Der Hecht - die zweite Nachzuegler-Art, und der Gegenentwurf zum
     * Bussard: der eine hat die ganze Karte und steht nie still, der andere
     * einen einzigen See und steht fast immer.
     *
     * Er teilt sein Gewaesser mit dem Barschschwarm, und das ist der Punkt.
     * Bis hierher hat jede neue Art die alten *unterwegs* getroffen; der Hecht
     * ist die erste, die dauerhaft im Wohnzimmer einer anderen sitzt. Daraus
     * folgt die ganze Konstruktion (siehe barsch.reaction.avoid): fuer die
     * Fluchtabfrage ist er unsichtbar, solange er lauert oder umzieht, und nur
     * der Sprint macht ihn greifbar.
     *
     * Die Nachzuegler-Bedingung ist bei ihm leicht zu halten: er besitzt
     * nichts, was der ganzen Art gehoert - kein Revier, keinen Verband, nur
     * seinen jeweils aktuellen Lauerplatz.
     */
    hecht: {
      id: 'hecht',
      name: 'Hecht',
      plural: 'Hechte',
      sprite: 'Hecht.png',
      size: 2,
      domain: 'water',
      layer: 0,                 // unter der Wasseroberflaeche, wie der Barsch
      // Kein Wachfenster, siehe awake. 'tag' steht hier nur, weil das Feld die
      // Spalte "Aktiv" aus data/tiere.md spiegelt; gelesen wird es nirgends.
      active: 'immer',
      count: [1, 3],            // als Nachzuegler immer genau eins
      food: 'beutetiere',       // dritte Art mit diesem Wert, kein forage-Block

      /**
       * Katalog r/w/f = 4 / 12 / 70. "ruhig" ist beim Hecht **null** und nicht
       * 4: Lauern heisst reglos, und ein Tier, das sich mit 4 u/s bewegt, hat
       * nach einer Minute 240 u zurueckgelegt und seinen Uferstreifen
       * verlassen. Er wiegt stattdessen nur den Kopf (js/sim/pike.js,
       * lurkStep) - dieselbe Loesung wie beim sitzenden Bussard, und beim
       * Dachs war genau das der Fund: die vermeintliche Bewegung am
       * Ameisenhuegel war eine Idle-Animation und keine Ortsaenderung.
       */
      speed: {
        lauern: [0, 0],
        schwimmen: [9, 15],
        hetzen: [60, 78]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 55
      },

      /**
       * Das Lauern in Ufernaehe: der Kern dieser Art.
       *
       * depth ist die Ufertiefe in Zellen (eine Zelle = 5 u), also 10-25 u vom
       * Ufer. Das ist bewusst genau der Rand des Barschgebiets: der Schwarm
       * wird ab minDepth 2 vom Ufer weggeschoben und zieht darueber hinweg -
       * die gelegentliche Begegnung entsteht damit aus der Geografie und nicht
       * aus einer Wahrscheinlichkeit.
       *
       * bout ist die Standzeit, hop der Abstand zum naechsten Lauerplatz.
       * Beide zusammen ergeben den Anteil "reglos": bei 30-75 s Stehen und
       * 120-300 u Umzug mit rund 12 u/s sind das gut zwei Drittel. Die Zahl
       * ist die Zusage aus data/tiere.md und wird in tools/simtest.js gemessen
       * - eine Ansage ohne Messung ist keine.
       */
      lurk: {
        depth: [2, 4],
        bout: [30, 75],
        hop: [120, 300],
        tries: 8,               // Anlaeufe fuer einen Lauerplatz in Reichweite
        /**
         * **Ein Ankunftsradius ist bei einem Ufertier kein Rundungsfehler,
         * sondern ein Versatz in eine Richtung.** Mit 6 u blieb der Hecht
         * regelmaessig sechs Unit vor seinem Lauerplatz stehen - und weil er
         * immer aus dem tieferen Wasser kommt, waren das systematisch ein bis
         * zwei Zellen zu tief. Gemessen lag ein Drittel seiner Lauerzeit bei
         * Ufertiefe 6-8 Zellen, obwohl jedes gezogene Ziel bei 2-4 lag (3000
         * Ziehungen nachgeprueft: die Zielwahl war nie das Problem).
         */
        arriveRadius: 2.5
      },

      /**
       * Der Ausfall aus der Lauerstellung.
       *
       * radius ist die Reichweite, in der ein Barsch den Sprint ausloest -
       * deutlich kleiner als jeder Fluchtradius im Katalog, weil ein
       * Lauerjaeger erst losschiesst, wenn die Beute wirklich da ist.
       *
       * Danach kehrt er an *denselben* Platz zurueck (js/sim/pike.js). Das ist
       * die Entscheidung, die ihn zum Lauerjaeger und nicht zum Hetzjaeger
       * macht: die Spur zeigt einen Punkt mit ein paar Zacken daran, nicht
       * eine Verfolgungslinie quer durch den See.
       *
       * cooldown verhindert die Kettenreaktion. Der Schwarm sprintet nach
       * einem Ausfall auf die andere Seite und merkt sich die Stelle 25-50 s
       * als Sperrzone - ganz noetig ist die Sperre also nicht, aber ein
       * einzelner nachzuegelnder Fisch wuerde sonst einen zweiten Ausfall im
       * selben Augenblick ausloesen, und aus einem Stoss wuerde ein Zittern.
       */
      strike: {
        prey: ['barsch'],
        radius: 48,
        /**
         * **Die Leine.** Was den Sprint wirklich beendet, ist nicht bout,
         * sondern dieser Abstand zum Lauerplatz. Bei 70 u/s traegt eine
         * Hoechstdauer von 3 s den Fisch 210 u weit - er waere damit ein
         * Hetzjaeger, und seine Spur zeigte eine Verfolgungslinie quer durch
         * den See statt eines Punktes mit ein paar Zacken. bout ist nur noch
         * die Obergrenze fuer den Fall, dass die Beute vor ihm herzieht.
         */
        reach: 90,
        bout: [1.5, 3.0],
        cooldown: [6, 14]
      },

      /**
       * **Tag und Nacht wach - die erste Art des Katalogs ohne Tagesrhythmus.**
       *
       * [0, 1] ist kein Platzhalter, sondern die Aussage: A.isAwake prueft
       * `f >= 0 && f < 1` und ist damit immer wahr. Es gibt keinen
       * Schlafzustand, keinen Aufbruch zum Schlafplatz und kein leaveAt - das
       * Lauern selbst ist seine Ruhe.
       *
       * Im Merkmalsvektor ist das seine trennschaerfste Zeile: alle anderen
       * Arten haben ein Fenster und liegen entweder klar unter oder klar ueber
       * der Haelfte, er landet bei genau dem Nachtanteil des Tages.
       */
      awake: [0, 1]

      /**
       * Kein reaction-Block: er reagiert auf niemanden. Umgekehrt ist er fuer
       * andere nur waehrend des Sprints greifbar - ueberall sonst setzt
       * js/sim/pike.js agent.flight, genau wie der Bussard ausserhalb seines
       * Jagdkreises. Wer ihn meidet, tut das ueber barsch.reaction.avoid und
       * damit ueber die Zielwahl, nicht ueber die Fluchtabfrage.
       */
    },

    /**
     * Der Igel - die dritte und letzte Nachzuegler-Art, und der schwerste Fall
     * der zweiten Aufgabe (data/tiere.md §4): klein, nachtaktiv, ortstreu,
     * winziges Gebiet - im Merkmalsraum liegt er dicht am Kaninchen.
     *
     * Was ihn traegt, ist nicht ein Mechanismus, sondern ein **Drehbuch**: jede
     * Nacht laeuft gleich ab (aufwachen und an Ort und Stelle ein wenig
     * fressen, trinken, zu einem anderen Futterplatz ziehen, dort den Rest der
     * Nacht fressen, dort einschlafen). Bei jeder anderen Landart entsteht die
     * Nacht aus einem Vergleich von Beduerfnissen; hier ist die Reihenfolge
     * fest. Das ist keine Vereinfachung, sondern die Zusage - "jede Nacht ist
     * aehnlich" laesst sich mit einem Vergleich gar nicht einhalten, weil der
     * Vergleich in jeder Nacht anders ausgeht.
     *
     * Die Nachzuegler-Bedingung ist erfuellt: er besitzt nur seine eigenen
     * Futterplaetze, keinen Verband, keinen Bau, kein nach Anzahl aufgeteiltes
     * Revier.
     */
    igel: {
      id: 'igel',
      name: 'Igel',
      plural: 'Igel',
      sprite: 'Igel.png',
      size: 1,
      domain: 'land',
      layer: 2,
      active: 'nacht',
      count: [2, 5],            // als Nachzuegler immer genau eins
      food: 'fallobst',         // Hauptnahrung; Ameisen und Waldboden kommen dazu

      /**
       * Katalog r/w/f = 4 / 9 / -. Die 20 der Bonustabelle ist gestrichen, und
       * das ist die Aussage dieser Art: **sie hat kein Fluchttempo.** Wo jedes
       * andere Tier des Katalogs schneller wird, wird der Igel langsamer - er
       * rollt sich ein (Zustand einrollen, js/sim/agents.js 20). Ein Igel, der
       * mit 20 u/s davonlaeuft, waere ein sehr langsames Kaninchen; einer, der
       * stehenbleibt, ist ein Igel.
       *
       * 'gehen' traegt beides, den Weg zum Wasser und den zum naechsten
       * Futterplatz: "zielstrebig" ist bei ihm die *Zielwahl* (ein bekannter
       * Punkt statt eines Streifzugs) und nicht ein zweites Tempo - dieselbe
       * Entscheidung wie beim Dachs.
       */
      speed: {
        schlafen: [0, 0],
        trinken: [0, 0],
        einrollen: [0, 0],
        wuehlen: [3, 5],
        gehen: [8, 12]
      },

      variation: {
        speed: 0.12,
        needs: 0.15,
        shyness: 0.20,
        range: 0.20            // Reviergroesse, data/tiere.md §2
      },

      mood: {
        min: 0.75,
        max: 1.10,
        driftSeconds: 95       // das gemaechlichste Tier des Katalogs
      },

      /**
       * Die Futterplaetze - was bei anderen Arten das Revier ist.
       *
       * Gesucht wird nicht ein Gebiet, sondern eine Handvoll *Punkte*, und der
       * erste davon ist immer ein Apfelbaum (data/tiere.md: "mindestens ein
       * Apfelbaum ist dabei"). Um ihn herum kommen im Umkreis von radius ein
       * Ameisenhuegel, wenn einer daliegt, und Waldrandstellen dazu, bis spots
       * voll ist.
       *
       * minApart ist die Zeile, ohne die das Ganze nichts waere: liegen zwei
       * Plaetze naeher als 75 u beieinander, verschmelzen sie im Merkmalsvektor
       * zu *einem* festen Ort (js/sim/tracker.js, PLACE_LINK) - und "wechselt
       * zwischen 3 bis 5 Nahrungsplaetzen" waere eine Behauptung ueber ein Bild,
       * auf dem ein einziger Fleck zu sehen ist.
       *
       * maxDistToWater ist die Dachs-Lektion in einer Zahl: eine Nacht hat rund
       * 180 nutzbare Sekunden, und bei 10 u/s kostet ein Trinkgang ueber 300 u
       * Hin- und Rueckweg schon ein Drittel davon.
       */
      home: {
        radius: 260,
        spots: [3, 5],
        minSpots: 3,
        minApart: 95,
        maxDistToWater: 300,
        edgeDepth: [1, 4],     // Waldrand, dieselbe Tiefe wie beim Reh
        tries: 60
      },

      /**
       * Drei Nahrungsarten, und **alle drei haben einen eigenen Namen, obwohl
       * sie auf Objekten liegen, an denen schon jemand frisst.** Das ist keine
       * Vorsicht, sondern die Anwendung des teuersten Befunds dieses Projekts
       * (data/tiere.md §1, Ameisenbrut): eine geteilte Nahrungskarte vertraegt
       * zwei umherziehende Arten, aber nicht eine *ortsfeste*, die direkt auf
       * einer Fundstelle wohnt. Der Igel wohnt auf seinen Fundstellen - er
       * frisst Nacht fuer Nacht an denselben drei bis fuenf Punkten. Mit
       * 'aepfel' und 'ameisen' haette er Reh, Wildschwein und Fuchs dauerhaft
       * je eine Quelle entzogen.
       *
       * fallobst       Aepfel am Boden - er klettert nicht.
       * ameisenstrasse Die Ameisen *um* den Huegel; das Wildschwein frisst die
       *                Ameisen, der Dachs graebt die Brut aus.
       * waldboden      Wuermer, Kaefer und Schnecken im Waldboden, die einzige
       *                Flaechennahrung dieser Art und der Grund, warum "der
       *                Waldrand" ueberhaupt ein Futterplatz sein kann: dort
       *                steht kein Weltobjekt, an dem ein Vorrat haengen
       *                koennte. Sie ist bewusst schnell erschoepft und traegt
       *                damit die kleinen Bewegungen ("er isst da, wo er ist,
       *                ein wenig") - nach ein paar Sekunden ist die Stelle
       *                unter ihm leer und er muss einen Schritt weiter.
       *
       * **Die beiden Raten tragen zusammen die Zusage "wechselt zwischen 3 bis
       * 5 Plaetzen hin und her", und beide standen anfangs falsch.**
       *
       * eatPerSecond ist so bemessen, dass ein Platz *genau eine* Nacht traegt:
       * die lange Fressphase dauert rund 105 s, bei 0.0055 sind das 0.58 vom
       * Vorrat, mit dem Auftakt gut 0.69. Mit den urspruenglichen 0.009 war ein
       * Apfelbaum vor Ende der Nacht leer, und aus "da bleibt er den Rest der
       * Nacht" wurde ein zweiter Umzug.
       *
       * regrowPerSecond ist die eigentliche Feder der Rotation, und zwar
       * dieselbe wie beim Gras des Rehs: **eine leergefressene Stelle muss
       * lange leer bleiben.** Mit 0.0030 stand ein Platz nach einer einzigen
       * Nacht wieder auf 1.0 - alle Kandidaten waren gleich gut, und die Wahl
       * entschied allein der Zufall (gemessen: auf vier von zehn Seeds blieb
       * einer der Plaetze bei unter 3 % der Zeit liegen, auf zweien wurde er
       * gar nicht besucht). Mit 0.0010 braucht ein besuchter Platz zweieinhalb
       * Tage, bis er wieder die beste Wahl ist - und *daraus* entsteht das Hin
       * und Her, statt aus einer Regel.
       */
      forage: {
        fallobst: {
          source: 'appleTrees',
          eatPerSecond: 0.0055,
          regrowPerSecond: 0.0010,
          minEdible: 0.25
        },
        ameisenstrasse: {
          source: 'anthills',
          eatPerSecond: 0.0065,
          regrowPerSecond: 0.0012,
          minEdible: 0.25
        },
        /**
         * Die Raten der Flaechennahrung sind an *seiner Fressflaeche* bemessen
         * und nicht am Vorrat eines Objekts: in feed.radius (20 u) liegen rund
         * 50 Rasterzellen, und er beruehrt in einer Nacht etwa die Haelfte
         * davon. Eine Zelle ist bei 0.26/s nach knapp vier Sekunden leer, also
         * genau in einem Bissen (feed.nibble) - *das* ist der Motor der kleinen
         * Bewegungen. Ueber die ganze Nacht sinkt der Platz damit auf rund die
         * Haelfte und ist im Vergleich zum Apfelbaum eine ehrliche Wahl.
         */
        waldboden: {
          source: 'forest',
          eatPerSecond: 0.26,
          regrowPerSecond: 0.0008,
          minEdible: 0.30
        }
      },

      /**
       * Das Fressen selbst: stehen, ein paar Bissen, ein kleiner Schritt.
       *
       * opening ist der kurze Auftakt an der Stelle, an der er aufgewacht ist
       * ("isst da wo er ist ein wenig"), danach geht es zum Wasser. Der lange
       * Teil der Nacht hat keine Dauer - er endet mit der Morgendaemmerung
       * (sleep.leaveAt) oder damit, dass der Platz leer ist.
       *
       * radius ist der Umkreis, in dem er dabei umherstochert. Er ist deutlich
       * kleiner als minApart oben: was er beim Fressen an Flaeche benutzt, darf
       * zwei Futterplaetze nicht zu einem verketten.
       *
       * giveUp ist die Geduld an einem leergefressenen Platz. Ohne sie stuende
       * er den Rest der Nacht auf einer abgegrasten Waldrandstelle - fuer eine
       * Flaechennahrung gibt es kein "der Vorrat ist alle", nur ein "hier nicht
       * mehr".
       */
      feed: {
        opening: [12, 26],
        nibble: [2.0, 5.0],
        /**
         * 34 -> 20 u. Der Umkreis ist nicht bloss Kosmetik, er ist bei der
         * Flaechennahrung das Mass, an dem sich Erschoepfung ueberhaupt zeigen
         * kann: in 34 u liegen 140 Rasterzellen, und die rund 25, die der Igel
         * in einer Nacht beruehrt, sind davon ein Fuenftel - der Waldrandplatz
         * sah danach so gut aus wie vorher und wurde nie ausgetauscht. In 20 u
         * sind es 50 Zellen, also die Haelfte, und der Platz faellt sichtbar
         * ab. Nebenbei ist ein 20-u-Fleck naeher an "kleine Bewegungen" als ein
         * 34-u-Fleck.
         */
        radius: 20,
        giveUp: 7,

        /**
         * **distanceCost ist der einzige Wert dieser Art, der schon einmal um
         * das Vierfache falsch stand.** Mit 0.0030 kostete ein Weg von 250 u
         * einen Abzug von 0.75 - mehr, als der ganze Vorrat (0..1) und der
         * Zufall zusammen ausmachen koennen. Der naechste Platz gewann damit
         * *immer*, und aus drei bis fuenf Futterplaetzen wurde ein Pendeln
         * zwischen zweien (gemessen: 2-3 genutzte Plaetze, auf einem Seed lag
         * der dritte bei 2 % der Zeit). Mit 0.0008 kostet derselbe Weg 0.20 und
         * faerbt die Wahl, statt sie zu entscheiden - der Vorrat gewinnt, und
         * *daraus* entsteht das Hin und Her: was gestern leergefressen wurde,
         * ist heute die schlechte Wahl.
         *
         * Dass er trotzdem keine weiten Wege macht, steht nicht hier, sondern
         * in der Geometrie: alle Plaetze liegen im Umkreis von home.radius um
         * denselben Apfelbaum. Ein Abzug muss das nicht noch einmal erzwingen -
         * dasselbe Prinzip wie beim Waldrandbonus des Rehs, nur andersherum.
         */
        jitter: 0.35,
        distanceCost: 0.0008
      },

      /**
       * **Ein Trinkgang je Nacht, und zwar ohne Intervall.** Jede andere Art
       * traegt einen Durstzaehler mit sich herum und vergleicht ihn mit anderen
       * Beduerfnissen; beim Igel steht das Trinken als fester Punkt im
       * Drehbuch zwischen Auftakt und Umzug. Das ist genau die Konstruktion,
       * mit der beim Bussard "einmal am Tag bei den Kaninchen" eine Zusage
       * wurde und beim Dachs der Ameisenhuegel eine geworden ist: ein diskretes
       * Einmal-Ereignis verliert gegen jede laufende Beschaeftigung, wenn man
       * es in einen Vergleich stellt statt es fest einzuplanen.
       *
       * maxDistance ist die Notbremse fuer den Fall, dass die Lockerungsstufen
       * bei der Platzsuche das Wasser doch weit haben liegen lassen.
       */
      drink: {
        bout: [4, 8],
        reach: 12,
        maxDistance: 420
      },

      /**
       * Er hat keinen Schlafplatz - er schlaeft an dem Futterplatz, an dem die
       * Nacht ihn zurueckgelassen hat (data/tiere.md: "unter den Apfelbaeumen
       * oder am Waldrand"). Nur am Ameisenhuegel nicht: der liegt auf offener
       * Flaeche, und dort geht er zum Waldrand.
       *
       * leaveAt 0.20 ist der Beginn der Morgendaemmerung; das Wachfenster endet
       * bei 0.30. Die zehn Prozent Tag dazwischen sind der Weg zum Schlafplatz,
       * und sie sind nicht grosszuegig gewaehlt, sondern gerechnet: 30 s bei
       * rund 10 u/s tragen 300 u weit, also einmal quer durch das eigene
       * Gebiet.
       */
      sleep: {
        leaveAt: 0.20,
        spread: 14
      },

      /** Nacht + beide Daemmerungen, Fenster ueber Mitternacht. */
      awake: [0.70, 0.30],

      /**
       * "Ignoriert Kleinere, rollt sich bei Gefahr ein" (data/tiere.md §4).
       *
       * rollFromSize 3 ist die Standardregel aus §2 (eigene Klasse + 2) - Fuchs,
       * Dachs, Bussard und Kaninchen laesst er also an sich vorbei, Reh und
       * Wildschwein nicht. Ente, Barsch, Hecht und Fledermaus stehen in ignore:
       * die drei Wassertiere trifft er nur am Ufer, und keines davon ist fuer
       * einen Igel eine Gefahr.
       *
       * cooldown ist die Stoerung-gegen-Dauerzustand-Regel des Rehs, hier
       * besonders noetig: ein aesendes Reh steht minutenlang an derselben
       * Stelle, und ohne die Sperrzeit laege der Igel daneben die halbe Nacht
       * als Kugel im Gras.
       */
      reaction: {
        ignore: ['ente', 'barsch', 'hecht', 'fledermaus'],
        rollFromSize: 3,
        rollRadius: 90,
        rollSeconds: [4, 9],
        rollCooldown: [15, 40]
      }
    }
  };

  WL.SPECIES = SPECIES;

  /**
   * Reihenfolge, in der Arten angelegt werden. Sie bestimmt die Nummern der
   * Tiere in der Aufzeichnung und bleibt deshalb stabil - neue Arten kommen
   * hinten dazu. Gezeichnet wird dagegen nach spec.layer.
   */
  WL.SPECIES_ORDER = ['ente', 'barsch', 'reh', 'wildschwein', 'kaninchen', 'fledermaus', 'dachs',
    'fuchs'];

  /**
   * Wie viele Tiere eine Welt in der ersten Phase hoechstens hat.
   *
   * Die acht Spannen oben sind je fuer sich richtig, nebeneinander ergeben sie
   * aber bis zu 63 Tiere - und 63 namenlose Kacheln lassen sich mit dem Finger
   * nicht mehr sinnvoll gruppieren. Die Grenze steht deshalb ueber der ganzen
   * Welt und nicht in den Spannen: durchgesetzt wird sie in
   * js/sim/simulation.js (drawPopulation), *bevor* ein Tier angelegt ist.
   *
   * Warum nicht einfach engere Spannen: die Summe von acht unabhaengigen
   * Ziehungen liegt fast immer in der Mitte. Um die Spitze auf 40 zu druecken,
   * muessten alle acht Spannen auf ein Drittel schrumpfen - dann saehe jede
   * Welt gleich aus, und der Mittelwert laege bei 33 statt bei 40. Eine
   * Obergrenze trifft genau die Spitze und laesst die Spannen in Ruhe.
   *
   * Mit den Nachzueglern (WL.LATE_ARRIVALS) sind es in der zweiten Phase
   * hoechstens 45.
   */
  WL.POPULATION = { max: 40 };

  /**
   * Die Nachzuegler: wer am Bruch bei Tag 5 dazukommt.
   *
   * known    Wieviele Tiere *bereits bekannter* Arten auftauchen. Sie muessen
   *          sich in eine der selbst gebildeten Gruppen einsortieren lassen.
   * newcomer Wieviele Tiere *neuer* Arten - je eines je Art, gezogen aus
   *          WL.NEW_SPECIES. Ein einzelnes Individuum ist ein einzelner Punkt im
   *          Merkmalsraum und gehoert per Konstruktion in keine der gebildeten
   *          Gruppen. Das ist der didaktische Kern der zweiten Aufgabe, und der
   *          Grund, warum hier nicht die Anzahlen aus data/tiere.md §4 gelten.
   *
   * Zusammen fuenf, denn die Nachzuegler kommen als *ein* Cluster an
   * (js/ui/signals.js). **Drei und zwei, nicht vier und eins** - und diese
   * Verschiebung ist die eigentliche Festlegung:
   *
   * - Drei bekannte gehen in drei *verschiedene* Gruppen, seit der Vorrat mehr
   *   als eine Art hergibt (Ente, Reh, Kaninchen, Fledermaus). Vier Rehe waren
   *   eine Frage, viermal gestellt - und sie verdoppelten nebenbei den Bestand
   *   einer einzigen Art, deren Messwerte in Phase 2 danach kippten.
   * - Zwei Fremde statt einem, weil ein einzelner Fremder zum "Rest" wird. Zwei
   *   verfuehren dazu, sie *zusammen* in einen Haufen zu legen - und genau daran
   *   laesst sich zeigen, dass "passt in keine meiner Gruppen" keine
   *   Gemeinsamkeit ist.
   *
   * Beide Ziehungen laufen **ohne Zuruecklegen** (drawDistinct in
   * js/sim/simulation.js). Zweimal dieselbe neue Art waeren ein Paar und keine
   * zwei Fremden, und der ganze Effekt waere weg.
   *
   * Bussard, Hecht und Igel stehen im Vorrat - die Liste ist damit vollstaendig
   * (data/tiere.md §4). Aus dreien zwei zu ziehen laesst alle drei Paarungen zu;
   * Hecht + Igel ist dabei die schwerste Welt, weil sich beide wenig bewegen und
   * die verdeckte Sicht kein Wasser zeigt - trennbar bleiben sie ueber den
   * Tagesrhythmus (der Igel strikt nachts, der Hecht rund um die Uhr). Wer eine
   * bestimmte Art messen oder ansehen will, nagelt die Liste fest (fullWith in
   * tools/simtest.js, --neu= in tools/preview.js).
   *
   * Wer hier eine Art eintraegt, hat damit eine Zusage gemacht: ihr spawn() muss
   * ein einzelnes Tier vertragen, ohne etwas anzulegen, was der ganzen Art
   * gehoert - siehe den Kommentar bei reh.lateArrival.
   */
  WL.LATE_ARRIVALS = { known: 3, newcomer: 2 };

  WL.NEW_SPECIES = ['bussard', 'hecht', 'igel'];
})(typeof window !== 'undefined' ? window : globalThis);
