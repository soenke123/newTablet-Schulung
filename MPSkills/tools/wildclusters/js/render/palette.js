/**
 * Farbpalette der Welt - freundlich, stilisiert, leicht comicartig.
 *
 * Wichtig fuer das Spielziel: die vier Landschaftstypen muessen auf einen Blick
 * unterscheidbar sein, ohne dass die Karte unruhig wirkt. Deshalb kraeftige,
 * klar getrennte Grundtoene und nur sehr dezente Texturfarben.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  WL.PALETTE = {
    backdrop: '#e6dcc4',
    outside: '#ddd2b8',

    ground: {
      base: '#d9c69d',
      shade: '#cdb88b',
      speckLight: '#e5d6b2',
      speckDark: '#bfa87c'
    },

    grass: {
      base: '#8ec95f',
      shade: '#7fbc50',
      edge: '#74ad48',
      tuftLight: '#a3d873',
      tuftDark: '#6ba63e'
    },

    forest: {
      floor: '#5c9c4a',
      floorShade: '#4f8b3f',
      edge: '#437a37',
      dot: '#4a8639',
      canopy: '#3f8f3a',
      canopyLight: '#54a747',
      canopyDark: '#2f6d2d',
      trunk: '#7d5a36',
      shadow: 'rgba(38, 62, 32, 0.18)'
    },

    water: {
      base: '#5fc0e6',
      deep: '#45a9d4',
      shallow: '#9fdff3',
      edge: '#3d94bd'
    },

    appleTree: {
      canopy: '#69b94f',
      canopyLight: '#80cc62',
      canopyDark: '#4f9639',
      trunk: '#8a6238',
      apple: '#e04a3f',
      appleLight: '#f2705f',
      shadow: 'rgba(38, 62, 32, 0.18)'
    },

    anthill: {
      base: '#b57c4d',
      light: '#cd9564',
      dark: '#835634',
      speck: '#6b452a',
      shadow: 'rgba(60, 45, 30, 0.16)'
    },

    resource: {
      cap: '#dd7154',
      capLight: '#ee9077',
      stem: '#f4e6d2',
      nut: '#a87a41',
      nutLight: '#c2955a',
      shadow: 'rgba(38, 62, 32, 0.2)'
    },

    /**
     * Artfarben - nur noch fuer die Entwicklung.
     *
     * Im Browser traegt jedes Tier seit der Gruppierungsphase seine *eigene*
     * Farbe (siehe signals weiter unten): Kachel, Spur und Tier zeigen
     * dieselbe, und ein Cluster faerbt seine Mitglieder um. Eine Farbe je Art
     * waere dort die Loesung der Aufgabe.
     *
     * Fuer tools/preview.js bleiben sie stehen und sind dort auch richtig:
     * das Werkzeug prueft das Verhalten *einer Art* am Bild ("laeuft der Fuchs
     * sein Revier wirklich ab?"), und 50 Einzelfarben waeren dafuer nur
     * Spaghetti. Die Begruendungen darunter sind deshalb weiter gueltig - sie
     * gelten dem Untergrund, auf dem die Spur liegt.
     */
    agents: {
      shadow: 'rgba(30, 45, 60, 0.22)',
      selection: '#ffffff',
      selectionEdge: 'rgba(20, 35, 50, 0.55)',
      // Der Ton fuer ein Tier ohne Signalfarbe: offene Sicht mit
      // abgeschalteten Spuren. Ein gedecktes Fell-/Erdbraun, das auf Gras wie
      // auf Wasser liegen kann, ohne einer Kachel zu gehoeren.
      plain: '#8a8175',
      ente: {
        trail: '#1f4f6d',
        flight: '#c2551f',
        body: '#8d7f6a',
        belly: '#efe7d8',
        head: '#2f6b4a',
        beak: '#e0a33c'
      },
      // Der Barsch zieht dieselben Gewaesser ab wie die Ente, seine Spur muss
      // sich davon also deutlich abheben - und von Wasser, Gras und Wald
      // gleichermassen. Deshalb ein Ton, den die Landschaft nicht kennt.
      barsch: {
        trail: '#8c2f66',
        flight: '#8c2f66',   // fliegt nie; gleiche Farbe, damit nichts auffaellt
        body: '#6e7f4a',
        belly: '#e8dfc6',
        head: '#4b5c36',
        beak: '#c98a3c'
      },
      // Das Reh laeuft ueber Gras und durch Wald, seine Spur muss sich also vor
      // beiden Gruentoenen halten. Ein Braun oder Orange kann sie nicht sein:
      // der Flug der Ente ist bereits orange, und ueber der Wiese liegen dann
      // zwei kaum unterscheidbare Linien. Violett kommt in der Landschaft
      // nirgends vor und steht zugleich weit weg vom Beere-Ton des Barsches.
      reh: {
        trail: '#7040d8',
        flight: '#7040d8',   // fliegt nie
        body: '#a97046',
        belly: '#e8d6bd',
        head: '#8a5734',
        beak: '#4a3524'
      },
      // Die Rotte zieht durch denselben Wald wie das Reh, ihre Spur muss sich
      // also vor allem von dessen Violett abheben - und weil das Wildschwein
      // nachtaktiv ist, liegt sie ueberwiegend auf der blau eingefaerbten
      // Nachtkarte. Ein warmes Gelbgruen haelt beidem stand und ist zugleich
      // hell genug, um im Dunkeln noch als Linie zu lesen.
      wildschwein: {
        trail: '#c9d92f',
        flight: '#c9d92f',   // fliegt nie
        body: '#584b46',
        belly: '#8d7d70',
        head: '#3f3531',
        beak: '#2a2320'
      },
      // Das Kaninchen bleibt sein Leben lang auf einem Fleck Wiese, seine Spur
      // ist also ein dichtes Knaeuel auf Gruen und Sand - sie muss hell und
      // kraeftig sein, damit das Knaeuel nicht zur Flaeche zerlaeuft. Rot und
      // Orange scheiden aus (der Flug der Ente ist orange, und die Fluglinien
      // kreuzen jede Wiese), Violett gehoert dem Reh, Gelbgruen der Rotte.
      // Bleibt Pink: das hellere Gegenstueck zum dunklen Beere-Ton des
      // Barsches, der ohnehin nie das Wasser verlaesst.
      kaninchen: {
        trail: '#ff3d8b',
        flight: '#ff3d8b',   // fliegt nie
        body: '#b09277',
        belly: '#f0e6d8',
        head: '#9a7c62',
        beak: '#5e4634'
      },
      // Die Fledermaus ist als einzige Art fast nur nachts unterwegs, ihre
      // Spur liegt also fast immer unter der blauen Nachteinfaerbung - dort
      // muss sie zuerst lesbar bleiben, nicht tagsueber gegen Gras oder Wald.
      // Ein helles Cyan haelt dem stand und ist von allen bisherigen Toenen
      // (Blau, Beere, Violett, Gelbgruen, Pink) klar unterscheidbar.
      fledermaus: {
        trail: '#2ee6c8',
        flight: '#2ee6c8',   // fliegt praktisch immer, solange sie wach ist
        body: '#4a4550',
        belly: '#6d6672',
        head: '#332f3a',
        beak: '#231f28'
      },
      // Der Dachs teilt sich Wald und Nacht mit dem Wildschwein (gelbgruen)
      // und der Fledermaus (cyan) - seine Spur muss sich also von beiden
      // absetzen, obwohl sie auf derselben dunklen, blau eingefaerbten
      // Waldflaeche liegt. Ein warmes Gold/Amber ist von Gelbgruen weit genug
      // im Farbkreis entfernt und deutlich waermer als das kuehle Cyan; vom
      // Flugorange der Ente (#c2551f, eher rostbraun) unterscheidet es sich
      // durch mehr Saettigung und weniger Rot.
      dachs: {
        trail: '#f0a63c',
        flight: '#f0a63c',   // fliegt nie
        body: '#5a5a5a',
        belly: '#c8c4bc',
        head: '#2c2c2c',
        beak: '#1a1a1a'
      },
      // Der Fuchs zieht als einziges Tier eine lange geschlossene Linie um
      // sein Revier - quer ueber Gras, Wald, Boden und an Ufern entlang, und
      // fast immer auf der blau eingefaerbten Nachtkarte. Sie muss also auf
      // *jedem* Untergrund lesbar bleiben, nicht nur auf einem. Rot ist
      // dafuer der letzte freie kraeftige Ton: das Flugorange der Ente
      // (#c2551f) ist rostbraun und liegt ohnehin nur als kurze Gerade auf
      // der Karte, das Gold des Dachses (#f0a63c) ist deutlich waermer und
      // heller. Es ist zugleich die Farbe, in der der Nutzer die Reviere
      // gezeichnet hat (Fuchsreviermuster.png).
      fuchs: {
        trail: '#ff4433',
        flight: '#ff4433',   // fliegt nie
        body: '#c4622a',
        belly: '#f2e4d4',
        head: '#a94e20',
        beak: '#3a2418'
      },
      // Der Bussard ist das einzige Tier, das den ganzen hellen Tag ueber der
      // offenen Landschaft steht - seine Schleifen liegen also auf Gras und
      // Sand, bei voller Helligkeit und ohne Nachtfaerbung, die sie abdunkeln
      // wuerde. Dort halten die dunklen Toene (Beere, Violett, Blau) am
      // wenigsten stand. Ein helles, kaltes Himmelblau ist der letzte freie
      // Ton, der sich zugleich vom Cyan der Fledermaus (gruener, und ohnehin
      // nur nachts zu sehen) und vom dunklen Wasserblau der Ente absetzt.
      bussard: {
        trail: '#59b8ff',
        flight: '#59b8ff',   // fliegt praktisch immer, solange er wach ist
        body: '#6b5643',
        belly: '#e6dcc9',
        head: '#4d3f31',
        beak: '#e8c24a'
      },
      // Der Hecht verlaesst sein Gewaesser nie - seine Spur liegt also
      // ausschliesslich auf Wasser, und zwar auf demselben wie die des
      // Barsches (Beere) und die der Ente (dunkelblau). Sie ist dabei fast
      // kein Strich, sondern eine Kette von Punkten mit kurzen Verbindungen:
      // was nicht sofort ins Auge faellt, verschwindet hier ganz. Ein
      // kraeftiges Gruen ist der letzte freie Ton, der das leistet - im Wasser
      // kommt kein Gruen vor, und von Gelbgruen (Rotte, ueber Wald) und Cyan
      // (Fledermaus, ueber Nachtland) ist es weit genug entfernt, zumal keine
      // der beiden je auf dem See liegt.
      hecht: {
        trail: '#3ddc4a',
        flight: '#3ddc4a',   // fliegt nie; das Feld meint bei ihm "nicht greifbar"
        body: '#5d6f4a',
        belly: '#d8dcc0',
        head: '#3f4d32',
        beak: '#2a3320'
      },
      // Der Igel ist die kleinste Spur des Katalogs: drei bis fuenf Fleckchen
      // mit kurzen Verbindungen, nachts, auf Gras und am Waldrand. Sie muss
      // deshalb vor allem *auffallen*, und zwar auf der blau eingefaerbten
      // Nachtkarte. Ein warmes Orange leistet das und ist von den beiden Toenen,
      // die dort sonst liegen, weit genug entfernt: das Gold des Dachses
      // (#f0a63c) ist deutlich heller und gelber, das Rot des Fuchses
      // (#ff4433) hat kein Gelb.
      igel: {
        trail: '#ff8c1a',
        flight: '#ff8c1a',   // fliegt nie
        body: '#6e5a44',
        belly: '#d9c9b0',
        head: '#4e3f30',
        beak: '#2b221a'
      }
    },

    /**
     * Der Bau. Er ist kein Weltobjekt (der Generator kennt ihn nicht), sondern
     * wird von der Simulation gesetzt - gezeichnet wird er trotzdem, weil sonst
     * niemand sieht, worum das Kaninchen die ganze Zeit herumhoppelt.
     */
    burrow: {
      hole: '#4a3526',
      rim: '#8a6f52',
      shadow: 'rgba(45, 35, 25, 0.22)'
    },

    /** Nachtfaerbung: kuehl und zurueckhaltend, die Karte bleibt lesbar. */
    night: {
      tint: '32, 52, 96',
      maxAlpha: 0.34
    },

    /**
     * Verdeckte Sicht: die Karte ohne Landschaft und ohne Artmerkmale.
     *
     * Uebrig bleiben Bewegung und Tageszeit - genau die beiden Dinge, nach
     * denen spaeter gruppiert werden soll. Der Hintergrund ist deshalb eine
     * einzige Flaeche, die nur die Uhrzeit verraet, und alle Tiere teilen sich
     * eine Farbe; jede zweite Farbe waere ein Hinweis auf die Art.
     *
     * Die Tinte muss sowohl auf dem dunklen Blau der Nacht als auch auf dem
     * hellen Gelb des Tages lesbar sein - und unterwegs passiert der Verlauf
     * zwangslaeufig genau die Helligkeit der Tinte selbst. Deshalb liegt unter
     * jeder Linie ein dunkler Saum: er traegt den kurzen Moment in der
     * Daemmerung, in dem Rot auf Olivgrau sonst verschwaende.
     */
    masked: {
      night: '#17305f',
      day: '#f7e6a1',
      ink: '#e5342b',
      halo: '#17130c',
      edge: 'rgba(255, 255, 255, 0.22)'
    },

    /**
     * Signalfarben: eine je Tier, und sie ist das Band zwischen Karte und
     * Liste. Kachel, Spur und Tier tragen dieselbe Farbe, ein Cluster faerbt
     * seine Mitglieder auf die seine um - so ist eine begonnene Gruppierung
     * auf der Karte zu sehen und nicht nur in der Liste.
     *
     * Drei Dinge machen die Farben brauchbar:
     *
     * - **Goldener Winkel.** Die Nummern stehen sortiert nebeneinander, die
     *   Tiere dahinter sind gemischt. Aufeinanderfolgende Kacheln muessen sich
     *   also unterscheiden, nicht nur weit auseinanderliegende - 137.5 Grad
     *   Sprung gibt ueber jede Laenge den groessten Mindestabstand.
     * - **Gleiche Helligkeit.** Reines Gelb ist in HSL viermal so hell wie
     *   reines Blau. Ohne Ausgleich waeren die Gelben auf dem Mittagshimmel
     *   und die Blauen auf dem Nachthimmel unlesbar - je nach Uhrzeit
     *   verschwaende die halbe Liste. Deshalb wird nicht die HSL-Helligkeit
     *   festgelegt, sondern die *wahrgenommene* (CIE L*), und der HSL-Wert
     *   dazu gesucht.
     * - **Ein dunkler Saum unter jeder Linie.** L* 58 liegt zwischen Nacht
     *   und Tag, wird aber in der Daemmerung zwangslaeufig einmal genau vom
     *   Himmel durchlaufen - und in der offenen Sicht liegt Gras bei L* 75,
     *   Wasser bei L* 65. Der Saum traegt beide Faelle; er ist der Preis
     *   dafuer, dass die Farbe die Nummer meint und nicht den Untergrund.
     */
    signals: {
      targetLightness: 58,          // CIE L*, siehe oben
      saturations: [0.86, 0.66, 0.97],
      hueStart: 18,
      fallback: '#e5342b',

      /**
       * Die Farbe des Nachzuegler-Clusters (js/ui/signals.js): fuenf Tiere
       * kommen am Bruch bei Tag 5 dazu, und sie sollen auf einen Blick zu
       * finden sein - unter vierzig bekannten faende man sie sonst nur, indem
       * man die Nummern von hinten durchgeht.
       *
       * Sie faellt ueber die *Helligkeit* auf und nicht ueber den Farbton, und
       * das ist keine Geschmacksfrage: der goldene Winkel verteilt die Toene
       * ueber den ganzen Kreis, ein freier Ton ist also gar nicht mehr zu
       * haben. Was keine Signalfarbe je sein kann, ist etwas anderes als
       * L* 58 bei voller Saettigung - ein kuehles Fastweiss.
       *
       * Kuehl und nicht neutral, weil der Tageshimmel der verdeckten Sicht
       * warm ist (#f7e6a1); rein weiss waere es zudem die Farbe des
       * Auswahlrings, und das Cluster kommt ausgewaehlt an. Auf dem
       * Nachthimmel steht es ohnehin, und den hellen Mittag traegt der dunkle
       * Saum unter Linie und Figur.
       */
      newcomer: '#eaf6ff'
    }
  };

  /**
   * n Signalfarben. Deterministisch aus dem Index - dieselbe Kachelnummer
   * traegt in jeder Welt dieselbe Farbe, und das ist im Unterricht die
   * Voraussetzung dafuer, ueber "die Blaue" reden zu koennen.
   */
  WL.PALETTE.signals.build = function (count) {
    var cfg = WL.PALETTE.signals;
    var out = [];
    for (var i = 0; i < count; i++) {
      var hue = (i * 137.508 + cfg.hueStart) % 360;
      var sat = cfg.saturations[i % cfg.saturations.length];
      out.push(rgbToHex(atLightness(hue, sat, cfg.targetLightness)));
    }
    return out;
  };

  /**
   * Die HSL-Helligkeit suchen, bei der die Farbe die gewuenschte wahrgenommene
   * Helligkeit hat. L* waechst mit der HSL-Helligkeit streng monoton, also
   * reicht eine Intervallhalbierung - 18 Schritte sind mehr als eine
   * Achtelstufe von 255 und damit unter der Aufloesung der Ausgabe.
   */
  function atLightness(hue, sat, targetL) {
    var lo = 0, hi = 1, mid, rgb;
    for (var i = 0; i < 18; i++) {
      mid = (lo + hi) / 2;
      rgb = hslToRgb(hue, sat, mid);
      if (lStar(rgb) < targetL) lo = mid; else hi = mid;
    }
    return hslToRgb(hue, sat, (lo + hi) / 2);
  }

  function hslToRgb(h, s, l) {
    var t = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [channel(p, q, t + 1 / 3), channel(p, q, t), channel(p, q, t - 1 / 3)];
  }

  function channel(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  /** Wahrgenommene Helligkeit 0..100 (CIE L* ueber die sRGB-Leuchtdichte). */
  function lStar(rgb) {
    var y = 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
    return y > 0.008856 ? 116 * Math.pow(y, 1 / 3) - 16 : 903.3 * y;
  }

  function toLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToHex(rgb) {
    var hex = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(rgb[i] * 255);
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      hex += (v < 16 ? '0' : '') + v.toString(16);
    }
    return hex;
  }

  /**
   * Himmelsfarbe der verdeckten Sicht zu einer Helligkeit (0 Nacht, 1 Tag).
   * Steht hier und nicht im Zeichner, weil die PNG-Vorschau denselben Verlauf
   * braucht, ohne den Renderer zu laden.
   */
  WL.PALETTE.masked.skyAt = function (daylight) {
    var t = daylight < 0 ? 0 : daylight > 1 ? 1 : daylight;
    return mixHex(WL.PALETTE.masked.night, WL.PALETTE.masked.day, t);
  };

  /** Zwei Hexfarben mischen; das Ergebnis bleibt Hex, damit auch die
   *  PNG-Vorschau damit rechnen kann (sie kennt nur #rrggbb). */
  function mixHex(a, b, t) {
    var ca = parseInt(a.slice(1), 16);
    var cb = parseInt(b.slice(1), 16);
    var out = 0;
    for (var shift = 16; shift >= 0; shift -= 8) {
      var va = (ca >> shift) & 255;
      var vb = (cb >> shift) & 255;
      out |= Math.round(va + (vb - va) * t) << shift;
    }
    var hex = out.toString(16);
    while (hex.length < 6) hex = '0' + hex;
    return '#' + hex;
  }

  /**
   * Aufhellen / abdunkeln einer Signalfarbe. Die neutrale Tierform braucht aus
   * einer Farbe drei (Rumpf, Bauch, Kopf); sie hier auszurechnen haelt die
   * Figur an jede Farbe gebunden, die spaeter dazukommt.
   */
  WL.PALETTE.mix = mixHex;
  WL.PALETTE.lighten = function (hex, t) { return mixHex(hex, '#ffffff', t); };
  WL.PALETTE.darken = function (hex, t) { return mixHex(hex, '#000000', t); };
})(typeof window !== 'undefined' ? window : globalThis);
