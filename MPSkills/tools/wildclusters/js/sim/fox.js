/**
 * Verhalten des Fuchses - das erste Tier, dessen Revier eine *Form* ist, und
 * das erste, das andere Tiere jagt.
 *
 * Das Bild, das entstehen soll: zwei bis vier Fuechse teilen sich die Karte in
 * ebenso viele Blasen auf. Jeder laeuft zweimal je Nacht ein Stueck seiner
 * eigenen Reviergrenze ab und quert dazwischen sein Revier von einer Seite zur
 * anderen, mit kurzen Stops unterwegs und einem Stueck Grenze am jeweils
 * anderen Ende (dem "Saum"). Kommt er ans Wasser, trinkt er - und
 * wenn dort eine Ente liegt, versucht er es kurz mit ihr. In der Daemmerung,
 * solange die Kaninchen noch draussen sind, hetzt er auch die; nachts sitzen
 * sie im Bau, und dann ignorieren sich beide. Gefangen wird nie etwas.
 *
 * Sechs Dinge sind daran nicht offensichtlich:
 *
 * 1. **Das Revier ist eine Radialkontur, kein Radius.** Kaninchen und Dachs
 *    haben einen Kreis um einen Punkt, das Wildschwein das umschliessende
 *    Rechteck einer Waldregion. Beides kann man nicht *ablaufen* - eine
 *    Reviergrenze braucht Stuetzstellen. Deshalb hier r(theta) als kleine
 *    Tabelle ueber dem Vollkreis (buildRange).
 * 2. **Der Radius folgt aus der Anzahl, nicht umgekehrt.** Die Reviere sollen
 *    die Karte gerecht aufteilen und sich dabei nur um rund 10 % ueberlappen -
 *    daraus ergibt sich die Groesse, und die ~520 u der Katalogtabelle sind
 *    darin der Sonderfall "zwei Fuechse" (data/tiere.md).
 * 3. **Die Kartenzellen liegen fest, nur die Mitte wird gezogen.** Damit ist
 *    "teilen sich das Spielfeld halbwegs gerecht auf" strukturell erfuellt und
 *    nicht durch Verwerfen erzwungen - dasselbe Prinzip wie beim Wald, der
 *    abzueglich eines Uferstreifens gestempelt wird.
 * 4. **Zwei *Teilrunden* je Nacht, nicht zwei volle.** Ein Umlauf misst bei
 *    36 u/s zwischen 55 und 75 s, eine Nacht hat rund 168 nutzbare Sekunden.
 *    Je Teilrunde 75 % des Umfangs - der Fuchs verbringt damit gut die Haelfte
 *    seiner Wachzeit im aeusseren Ring seines Reviers, was er tun soll. Zwei
 *    *volle* Runden waeren seit dem kleineren Revier zwar rechnerisch drin,
 *    liessen aber fuer Querung, Trinken und Jagd nichts uebrig. Begonnen wird
 *    dort, wo die letzte Runde aufgehoert hat (agent.patrolIndex) - erst
 *    dadurch ist die Blase ueber fuenf Naechte geschlossen abgelaufen.
 * 5. **"Im Revier bleiben" und "an der Grenze laufen" sind zwei Aufgaben, und
 *    sie ziehen gegeneinander.** Wer sich am Rand aufhaelt, tritt leichter
 *    hinaus; wer sicher drin bleiben soll, endet in der Mitte. Beides zugleich
 *    geht nur, wenn man weiss, *wodurch* er hinaustritt - gemessen kam die
 *    Haelfte aller Austritte aus der Flucht, ein Fuenftel aus dem Schlafplatz
 *    neben einem grenznahen Bau, und der groesste Zeitposten aus einer Sehne:
 *    eine Radialkontur ist sternfoermig, aber nicht konvex, und die Querung
 *    ist die laengste Sehne im Revier (pathInside, beginLeg, restingPlace,
 *    bendInward). Erst danach traegt der Saum am Ende jeder Querung
 *    (beginRim), ohne die Zeit ausserhalb wieder mitzubringen.
 * 6. **Die Jagd braucht keinen Eingriff bei der Beute.** Das Kaninchen flieht
 *    ab Groessenklasse 2 zum Bau, die Ente vor allem, was ans Wasser kommt -
 *    beide Zweige stehen seit dem jeweiligen Tier und liefen bis hierher
 *    weitgehend ins Leere. Und dass ein Kaninchen im Bau gar nicht erst als
 *    Beute auftaucht, entscheidet ctx.nearestPrey (js/sim/simulation.js), nicht
 *    eine Sonderregel hier.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});
  var A = WL.Agents;
  var S = A.STATES;
  var T = WL.TERRAIN;

  var TURN = 2.4;          // rad/s - wendiger als der Dachs (1.8), zaeher als das Kaninchen
  var HUNT_TURN = 4.6;     // hinter einer fliehenden Beute her wird scharf gedreht
  var FLEE_TURN = 4.0;
  var ARRIVE = 8;
  var CHECK_SECONDS = 0.25;

  // Wie die Karte aufgeteilt wird: [Spalten, Zeilen] je Fuchszahl. Feste
  // Zellen statt frei gewuerfelter Mittelpunkte - siehe Kopfkommentar.
  var LAYOUT = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2] };

  // Stichproben, mit denen ein Revierkandidat auf Wasser und Wald geprueft
  // wird. Fest auf Ringen statt gewuerfelt: derselbe Kandidat muss zweimal
  // dieselbe Bewertung ergeben, sonst haengt die Wahl an der Reihenfolge der
  // Versuche (dieselbe Vorsicht wie bei openShare in js/sim/rabbit.js).
  var SCORE_RINGS = [0.2, 0.4, 0.6, 0.8, 0.95];
  var SCORE_SPOKES = 16;
  // Wenn die enge Zelle weder Wasser noch Wald hergibt, darf der Mittelpunkt
  // weiter wandern. Die Ueberlappung faengt danach shrinkToFit ab.
  //
  // **Die dritte Stufe kam mit dem 20 % kleineren Revier (home.fill).** Eine
  // Blase mit 266 statt 332 u Radius trifft ein Gewaesser schlechter, und
  // zwei von 31 Revieren hatten danach gar keins mehr - das ist ein Verstoss,
  // kein Messwert (tools/simtest.js), denn dort kann der Fuchs nicht trinken.
  // Die Stufe ist bezahlbar, weil dasselbe kleinere Revier auch die
  // Ueberlappungsreserve vergroessert hat: die Mitte darf jetzt weiter
  // wandern, ohne dass zwei Blasen ineinanderlaufen.
  var JITTER_STAGES = [1, 2.5, 4.5];
  // Deckel der Bewertung: ein Revier, das zur Haelfte aus See besteht, soll
  // nicht gewinnen, nur weil es viel Wasser hat.
  var WATER_CAP = 0.08;
  var FOREST_CAP = 0.20;

  var ENTE = ['ente'];
  var KANINCHEN = ['kaninchen'];

  // Wie weit seitlich der direkten Linie nach einem Knickpunkt um einen See
  // herum gesucht wird, als Vielfaches der Luftlinie - siehe viaAround.
  var DETOUR_OFFSETS = [0.25, 0.45, 0.70, 1.00, 1.40];
  var MAX_DETOUR = 2.0;
  // Abstand, den der Bogen zum Wasser halten soll. Die 60 sind knapp mehr als
  // die 95 u Fluchtradius des Barsches halbiert - so weit weg, dass der Bogen
  // den Schwarm nicht laenger stoert als ein einzelner Gang ans Ufer, und nah
  // genug, dass es ihn in einem Revier mit See ueberhaupt gibt.
  var DETOUR_MARGINS = [60, 30, 0];

  // ------------------------------------------------------------- Revier

  /**
   * Eine Blase: Mittelpunkt plus eine Tabelle von Radien ueber dem Vollkreis.
   *
   *   r(theta) = ellipse(theta, rx, ry) * (1 + SUMME a_h * sin(h * theta + phi_h))
   *
   * **Warum eine Ellipse und kein Kreis.** Die Blase soll eine rechteckige
   * Kartenzelle ausfuellen (bei vier Fuechsen 800 x 500 u). Ein flaechengleicher
   * Kreis hat dort 748 u Durchmesser - er ragt also weit ueber die 500 u hohe
   * Zelle hinaus und laesst zugleich deren Ecken leer. Gemessen ueberlappten
   * sich zwei senkrecht benachbarte Reviere dadurch zu **53 %** statt der
   * zugesagten 10 %. Mit rx/ry im Seitenverhaeltnis der Zelle sind es rund 7 %,
   * und die Blase sieht nebenbei aus wie die Skizze des Nutzers: lang gezogen
   * und unrund, nicht rund.
   *
   * Die Wellen wuerden die eingeschlossene Flaeche vergroessern (die Flaeche
   * einer Radialkontur ist 0.5 * INTEGRAL r² dtheta, und der Mittelwert von r²
   * waechst um 0.5 * SUMME a_h²). Deshalb wird am Ende durch genau diesen
   * Faktor geteilt: die Blase ist unrund, aber flaechengleich mit der Ellipse -
   * und nur so haelt die gerechte Aufteilung.
   */
  function buildRange(cx, cy, rx, ry, home, rng) {
    var n = home.samples;
    var h = home.harmonics;
    var amps = [];
    var phases = [];
    var sumSq = 0;
    var i, k;

    for (k = 0; k < h.length; k++) {
      var a = rng.rangeIn(home.wobble) * (rng.chance(0.5) ? -1 : 1);
      amps.push(a);
      phases.push(rng.range(0, Math.PI * 2));
      sumSq += a * a;
    }
    var norm = Math.sqrt(1 + 0.5 * sumSq);

    var radii = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var theta = i / n * Math.PI * 2;
      var f = 1;
      for (k = 0; k < h.length; k++) f += amps[k] * Math.sin(h[k] * theta + phases[k]);
      var c = ry * Math.cos(theta);
      var s = rx * Math.sin(theta);
      radii[i] = rx * ry / Math.sqrt(c * c + s * s) * f / norm;
    }

    return {
      x: cx, y: cy,
      rx: rx, ry: ry,
      // Der flaechengleiche Radius - fuer alles, was nur eine Groessenordnung
      // braucht (Suchradien beim Bau).
      base: Math.sqrt(rx * ry),
      samples: n, radii: radii, inset: home.inset
    };
  }

  /** Radius der Kontur in dieser Richtung, linear zwischen zwei Stuetzstellen. */
  function radiusAt(range, theta) {
    var n = range.samples;
    var t = theta / (Math.PI * 2) * n;
    t = t - Math.floor(t / n) * n;
    var i0 = Math.floor(t);
    var frac = t - i0;
    var i1 = (i0 + 1) % n;
    return range.radii[i0] + (range.radii[i1] - range.radii[i0]) * frac;
  }

  function inRange(range, x, y) {
    var dx = x - range.x;
    var dy = y - range.y;
    var d2 = dx * dx + dy * dy;
    if (d2 <= 1) return true;
    var r = radiusAt(range, Math.atan2(dy, dx));
    return d2 <= r * r;
  }

  /**
   * Das Gelaende aus der Sicht eines Fuchses, der nicht ans Wasser will: Land,
   * aber mit einem Uferstreifen, den er nicht betritt.
   *
   * **Das ist die eigentliche Ursache der Uferringe, und sie sitzt nicht in
   * der Zielwahl.** Kein Ziel jenseits eines Sees wird gewaehlt (pathClear),
   * und wo doch eines liegt, wird darum herum geplant (viaAround) - trotzdem
   * zeichneten fuenf Naechte mit vier Fuechsen jede Seekontur als dicken roten
   * Ring nach. Denn *jede* Bewegung, die einen See streift, wird vom
   * Ausweichfaecher am Ufer entlanggefuehrt: die Querung, die eine Bucht
   * schneidet, die Flucht, die in den See laeuft, der Bogen um den See selbst.
   * Einzeln sind das ein paar Meter, ueber fuenf Naechte ist es der Ring.
   *
   * Ein Faecher, der den Uferstreifen gar nicht erst betritt, dreht schon
   * dort ab, wo der Ring sonst anfaengt. Der Fuchs kommt weiterhin ans
   * Wasser - zum Trinken, und wenn ihn eine Ente hinlockt -, aber nur mit
   * Absicht und nicht im Vorbeigehen (walkLand).
   */
  function makeDryLand(ctx, keep) {
    var land = ctx.land;
    var q = ctx.world.query;
    return {
      walkable: function (x, y) {
        return land.walkable(x, y) && q.distToWater(x, y) >= keep;
      }
    };
  }

  /**
   * Welches der beiden Gelaende gilt in diesem Tick? Drei Faelle, in denen der
   * Uferstreifen *nicht* gilt, und alle drei sind noetig:
   *
   *   1. Er will zum Wasser (Trinken) - dann ist das Ufer das Ziel.
   *   2. Er steht schon im Streifen (nach dem Trinken, nach einer Hetze) -
   *      sonst waere jede Richtung blockiert und er kaeme nie wieder heraus.
   *   3. Sein Ziel liegt im Streifen - ein Bau oder eine Grenzstuetzstelle
   *      dicht am Wasser soll erreichbar bleiben, sonst laeuft er bis zur
   *      Notbremse dagegen an.
   */
  function walkLand(agent, ctx, useTarget) {
    var q = ctx.world.query;
    var keep = agent.spec.detour.keep;
    if (agent.goal === 'wasser') return ctx.land;
    if (q.distToWater(agent.x, agent.y) <= keep) return ctx.land;
    if (useTarget && q.distToWater(agent.tx, agent.ty) <= keep) return ctx.land;
    return agent.dryLand;
  }

  /** Taugt dieser Punkt als Ziel - begehbar und ausserhalb des Uferstreifens? */
  function dryEnough(agent, ctx, p) {
    return ctx.land.walkable(p.x, p.y) &&
      ctx.world.query.distToWater(p.x, p.y) >= agent.spec.detour.keep;
  }

  /** Steht das Tier im aeusseren Ring seines Reviers (oder schon darueber)? */
  function nearRim(agent, share) {
    var range = agent.territory;
    var dx = agent.x - range.x;
    var dy = agent.y - range.y;
    return Math.hypot(dx, dy) >= radiusAt(range, Math.atan2(dy, dx)) * share;
  }

  /** Wie weit ausserhalb der Kontur steht das Tier? 0, wenn es drin ist. */
  function beyondRange(range, x, y) {
    var dx = x - range.x;
    var dy = y - range.y;
    return Math.max(0, Math.hypot(dx, dy) - radiusAt(range, Math.atan2(dy, dx)));
  }

  /**
   * Bleibt die gerade Strecke von hier nach dort innerhalb der Kontur?
   *
   * **Eine Radialkontur ist sternfoermig, aber nicht konvex** - und dieser
   * Unterschied war die groesste einzelne Quelle fuer Zeit ausserhalb des
   * Reviers. Jede Strecke von der Reviermitte nach draussen bleibt drin, weil
   * r(theta) genau das definiert; eine *Sehne* zwischen zwei Punkten darin aber
   * nicht: sie schneidet die Beulen ab, die die Blase erst zur Blase machen.
   * Die Querung ist ihrem Zweck nach die laengste Sehne, die es im Revier gibt,
   * und lief deshalb gemessen **17.7 % ihrer Zeit ausserhalb** - mehr als
   * Flucht, Jagd und Trinken zusammen.
   *
   * Verworfen wird ein solches Ziel deshalb nicht - es wird ueber die Mitte
   * angesteuert (beginLeg). Aus der Sternfoermigkeit folgt naemlich beides:
   * dass die Sehne reissen kann, und wie man sie flickt.
   */
  function pathInside(range, x0, y0, x1, y1) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var steps = Math.ceil(Math.hypot(dx, dy) / 20);
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      if (!inRange(range, x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /**
   * Eine Laufrichtung ins Revier zurueckdrehen, hoechstens um `limit`.
   *
   * Die Begrenzung ist der ganze Witz: bei einer Flucht zeigt `angle` vom
   * Stoerer weg, und eine unbegrenzte Drehung nach innen liefe womoeglich
   * genau auf ihn zu. Eine Vierteldrehung laesst den Fuchs stattdessen die
   * Grenze *entlang* laufen statt ueber sie hinweg - der Stoerer bleibt hinter
   * ihm, das Revier unter ihm.
   */
  function bendInward(range, x, y, angle, limit) {
    var inward = Math.atan2(range.y - y, range.x - x);
    var diff = Math.atan2(Math.sin(inward - angle), Math.cos(inward - angle));
    if (diff > limit) diff = limit;
    if (diff < -limit) diff = -limit;
    return angle + diff;
  }

  /** Stuetzstelle i der Grenze, ein Stueck nach innen versetzt. */
  function boundaryPoint(range, i) {
    var theta = i / range.samples * Math.PI * 2;
    var r = range.radii[i] * range.inset;
    return { x: range.x + Math.cos(theta) * r, y: range.y + Math.sin(theta) * r };
  }

  /**
   * Wieviel Wasser und Wald liegt in dieser Blase? Zwei Anteile aus einem
   * festen Stichprobenraster - daraus wird die Bewertung eines Kandidaten.
   * Wasser zaehlt doppelt, weil ohne Wasser die Trinkgaenge ausfallen und die
   * Entenjagd gleich mit.
   */
  function scoreRange(ctx, range) {
    var q = ctx.world.query;
    var water = 0;
    var forest = 0;
    var total = 0;
    for (var r = 0; r < SCORE_RINGS.length; r++) {
      for (var s = 0; s < SCORE_SPOKES; s++) {
        var theta = (s + 0.5) / SCORE_SPOKES * Math.PI * 2;
        var rad = radiusAt(range, theta) * SCORE_RINGS[r];
        var x = range.x + Math.cos(theta) * rad;
        var y = range.y + Math.sin(theta) * rad;
        if (!q.inBounds(x, y)) continue;
        total++;
        if (q.isWater(x, y)) water++;
        else if (q.isForest(x, y)) forest++;
      }
    }
    if (!total) return { score: -1, water: 0, forest: 0 };
    var ws = water / total;
    var fs = forest / total;
    return {
      score: Math.min(ws, WATER_CAP) / WATER_CAP * 2 + Math.min(fs, FOREST_CAP) / FOREST_CAP,
      water: ws,
      forest: fs
    };
  }

  /**
   * Anteil von a, der auch in b liegt - ueber ein festes Kartenraster, damit
   * derselbe Kandidat immer dasselbe Ergebnis bekommt.
   */
  function overlapShare(a, b, W, H, step) {
    var inA = 0;
    var both = 0;
    for (var x = step * 0.5; x < W; x += step) {
      for (var y = step * 0.5; y < H; y += step) {
        if (!inRange(a, x, y)) continue;
        inA++;
        if (inRange(b, x, y)) both++;
      }
    }
    return inA ? both / inA : 0;
  }

  /**
   * Die Blase so weit verkleinern, bis sie sich mit keinem schon vergebenen
   * Revier um mehr als home.maxOverlap ueberschneidet.
   *
   * **Warum das eigens gemacht wird und nicht aus der Geometrie faellt.** Zwei
   * gleiche Ellipsen im Abstand der Zellbreite halten die Grenze von selbst
   * ein - eine Blase mit Wellen aber nicht: eine Beule von 15 % zeigt
   * moeglicherweise genau auf den Nachbarn, und dort ist der oertliche Abstand
   * dann kleiner als der gerechnete. Gemessen kamen so **16 %** heraus, obwohl
   * die Ellipsen darunter bei 9 % lagen.
   *
   * Der Ausweg war nicht, die Wellen kleiner zu machen - dann waere aus der
   * Blase wieder eine Ellipse geworden, und die Form ist die Zusage. Statt-
   * dessen wird nachgemessen und nachgegeben: die zugesagten 10 % sind eine
   * Zahl aus data/tiere.md, also wird sie erzwungen und nicht erhofft.
   *
   * **Nachgegeben wird aber nur ein Rest** (home.minShrink). Dieselbe Funktion
   * hat mit einer zu grossen Mittelpunktstreuung schon einmal ein Revier auf
   * ein Viertel der Flaeche zusammengestaucht, weil dessen Mittelpunkt dem
   * Nachbarn zu nahe kam - die 10 % hielten dann zwar, aber von "teilen sich
   * das Spielfeld halbwegs gerecht auf" blieb nichts. Ein Revier, das gar
   * keins mehr ist, ist der schlechtere Fehler; die Reserve gehoert nach
   * vorne, in fill und jitter (js/sim/species.js).
   */
  function shrinkToFit(range, taken, home, W, H) {
    var scale = 1;
    while (scale > home.minShrink) {
      var worst = 0;
      for (var i = 0; i < taken.length; i++) {
        var o = overlapShare(range, taken[i], W, H, 20);
        if (o > worst) worst = o;
      }
      if (worst <= home.maxOverlap) break;
      for (var k = 0; k < range.samples; k++) range.radii[k] *= 0.97;
      range.rx *= 0.97;
      range.ry *= 0.97;
      range.base *= 0.97;
      scale *= 0.97;
    }
    range.shrunk = scale;
    return range;
  }

  /**
   * Alle Reviere einer Welt. Die Zellen liegen fest (LAYOUT), gezogen werden
   * nur Mittelpunkt und Wellenform - und davon gewinnt der Kandidat mit dem
   * meisten Wasser und Wald. Kein Verwerfen und kein Ausfall: enthaelt eine
   * Zelle wirklich kein Wasser, gewinnt eben der beste vorhandene Kandidat
   * (derselbe Rueckfall wie bei den Jagdgebieten der Fledermaus).
   */
  function buildRanges(ctx, spec, rng, count) {
    var home = spec.home;
    var W = ctx.world.query.width;
    var H = ctx.world.query.height;
    var layout = LAYOUT[count] || LAYOUT[4];
    var cols = layout[0];
    var rows = layout[1];
    var cellW = W / cols;
    var cellH = H / rows;

    /**
     * Die Blase fuellt ihre Zelle um den Faktor home.fill. Daraus folgt
     * alles Weitere - der Radius ist keine Konstante, sondern eine Folge der
     * Fuchszahl (data/tiere.md).
     *
     * **Warum aus der Zelle und nicht aus der Kartenflaeche.** Beide Rechnungen
     * ergeben aehnliche Radien, aber nur diese haelt die zugesagten 10 %
     * Ueberlappung ein. Zwei gleiche Ellipsen im Abstand d ueberlappen sich um
     * hoechstens 10 % ihrer Flaeche, wenn d/(2r) >= 0.80 ist - der Abstand ist
     * aber die Zellbreite, und die steht hier direkt daneben. Ueber die
     * Kartenflaeche gerechnet lag rx zufaellig genau an dieser Grenze, und die
     * Streuung des Mittelpunkts (damals das mittlere Drittel der Zelle, also
     * bis zu 266 u) frass die ganze Reserve: gemessen **36 % Ueberlappung**
     * statt 10 %. Streuung und Groesse muessen sich denselben Spielraum
     * teilen, und dafuer muessen beide aus derselben Zahl kommen.
     */
    var rx = cellW / 2 * home.fill;
    var ry = cellH / 2 * home.fill;
    var base = Math.sqrt(rx * ry);
    var jitterX = cellW * home.jitter;
    var jitterY = cellH * home.jitter;
    // So weit muss die Mitte von der Kartenkante wegbleiben, damit die Blase
    // nicht zur Haelfte ausserhalb liegt und die Aufteilung Loecher bekommt.
    var keepX = rx * 0.55;
    var keepY = ry * 0.55;
    var ranges = [];

    for (var i = 0; i < count; i++) {
      var cx = i % cols;
      var cy = (i - cx) / cols;
      var midX = (cx + 0.5) * cellW;
      var midY = (cy + 0.5) * cellH;

      /**
       * Zwei Stufen. Die zweite laeuft nur, wenn die enge Zelle weder Wasser
       * noch Wald hergab - dann darf der Mittelpunkt weiter wandern, auch auf
       * die Gefahr hin, dem Nachbarn naeher zu ruecken (das faengt
       * shrinkToFit ab). Dieselbe Vorsicht wie beim Kaninchen- und Dachsbau:
       * lieber eine gelockerte Bedingung als eine Zusage, die auf einem
       * unguenstigen Seed einfach ausfaellt.
       *
       * Ohne die zweite Stufe hatten auf zehn Seeds drei von 31 Revieren
       * keinen einzigen Waldflecken - bei vier Fuechsen ist eine Zelle nur
       * 800 x 500 u gross, und der Wald der Karte liegt in wenigen Klumpen.
       */
      var best = null;
      var bestScore = -Infinity;
      for (var g = 0; g < JITTER_STAGES.length; g++) {
        var jx = jitterX * JITTER_STAGES[g];
        var jy = jitterY * JITTER_STAGES[g];
        var loX = Math.max(midX - jx, keepX), hiX = Math.min(midX + jx, W - keepX);
        var loY = Math.max(midY - jy, keepY), hiY = Math.min(midY + jy, H - keepY);
        if (hiX < loX) { loX = hiX = midX; }
        if (hiY < loY) { loY = hiY = midY; }
        for (var t = 0; t < home.tries; t++) {
          var cand = buildRange(rng.range(loX, hiX), rng.range(loY, hiY), rx, ry, home, rng);
          var s = scoreRange(ctx, cand);
          cand.hasBoth = s.water > 0 && s.forest > 0;
          if (s.score <= bestScore) continue;
          bestScore = s.score;
          best = cand;
        }
        // Wasser *und* Wald gefunden: die zweite Stufe wird nicht gebraucht.
        if (best && best.hasBoth) break;
      }
      // Erst jetzt verkleinern: der Kandidat wird nach Wasser und Wald
      // ausgesucht, die Ueberlappung ist danach eine Korrektur an *einem*
      // Revier und nicht ein Filter, der alle Kandidaten gleich trifft.
      shrinkToFit(best, ranges, home, W, H);
      var after = scoreRange(ctx, best);
      best.waterShare = after.water;
      best.forestShare = after.forest;
      ranges.push(best);
    }
    return ranges;
  }

  // ------------------------------------------------------------- Anlegen

  function spawn(ctx) {
    var spec = ctx.species;
    var rng = ctx.rng;
    var count = rng.intIn(spec.count);
    var ranges = buildRanges(ctx, spec, rng, count);
    var dens = [];
    var agents = [];
    var i;

    for (i = 0; i < count; i++) dens.push(findDen(ctx, spec, rng, ranges[i]));
    var shared = shareBadgerDen(ctx, ranges, dens);

    for (i = 0; i < count; i++) {
      if (!dens[i]) continue;
      var agentRng = rng.fork('fuchs-' + i);
      var den = dens[i];
      var region = ctx.land.regionAt(den.x, den.y);
      var p = restingPlace(ctx, agentRng, den, spec, region, ranges[i], 5);
      var v = spec.variation;

      agents.push({
        index: 0,               // setzt die Simulation
        speciesId: spec.id,
        spec: spec,
        rng: agentRng,
        x: p.x,
        y: p.y,
        heading: agentRng.range(0, Math.PI * 2),
        state: S.sichern,
        // Die Aufzeichnung beginnt mitten in der Nacht, also mitten im
        // Wachfenster - ohne diese Zeile liefe der allererste Augenblick an
        // beginNight vorbei und alle Fuechse broechen gleichzeitig auf.
        stateTimer: agentRng.rangeIn(spec.sleep.wakeSpread),
        speedBase: 0,
        tx: p.x,
        ty: p.y,
        region: region,
        // Das Gelaende mit Uferstreifen - einmal je Fuchs angelegt, weil der
        // Faecher 30 000 Ticks lang darauf zugreift (siehe makeDryLand).
        dryLand: makeDryLand(ctx, spec.detour.keep),
        territory: ranges[i],
        burrow: den,            // zeichnet js/render/agentRenderer.js
        sharesDen: i === shared,
        /**
         * Die individuelle Streuung sitzt *nicht* in der Reviergroesse: ein
         * Fuchs mit 15 % mehr Radius haette 32 % mehr Flaeche, und die
         * gerechte Aufteilung samt der zugesagten 10 % Ueberlappung waere
         * dahin. Sie sitzt stattdessen darin, wie weit er auf einer Querung
         * wirklich hinausgeht - manche bleiben dichter am Bau als andere.
         */
        reach: Math.min(0.98, spec.cross.reach * (1 + agentRng.range(-v.range, v.range))),
        // Wie dreist dieser Fuchs auf Beute zugeht. Scheu (traits.shyness)
        // taugt dafuer nicht: sie steuert die Flucht, und ein scheues Tier
        // muss kein schlechter Jaeger sein.
        boldness: 1 + agentRng.range(-0.20, 0.20),
        traits: A.createTraits(agentRng, spec),
        mood: 1,
        moodFrom: 1,
        moodTo: 1,
        moodSpan: 1,
        moodTimer: 0,
        checkTimer: agentRng.range(0, CHECK_SECONDS),
        huntTimer: agentRng.range(0, CHECK_SECONDS),
        walkTimer: 0,
        goal: null,             // 'grenze' | 'saum' | 'quer' | 'wasser' | 'heim' | 'frei' | null
        // Die Patrouille laeuft immer in derselben Richtung um dasselbe
        // Revier - nur so setzen zwei Teilrunden je Nacht die Blase ueber
        // fuenf Naechte zu einer geschlossenen Linie zusammen.
        dir: agentRng.chance(0.5) ? 1 : -1,
        patrolIndex: Math.floor(agentRng.next() * ranges[i].samples),
        patrolLeft: 0,
        patrolsDone: 0,
        patrols: 0,
        patrolSeen: newSeen(ranges[i].samples),
        // Der Saum am Ende einer Querung laeuft auf einem eigenen Index -
        // siehe beginRim.
        rimIndex: 0,
        rimLeft: 0,
        crossTarget: null,
        legFinal: null,         // Endziel hinter einem Knickpunkt, siehe beginLeg
        detours: 0,             // Umwege auf diesem Zug, siehe shoreCheck
        shoreTimer: 0,          // wie lange schon dicht am Wasser
        legLeft: 0,
        prey: null,
        preyAwakeOnly: false,
        escapeAngle: 0,
        blocks: 0,              // wie oft hintereinander der Faecher blockiert hat
        huntCooldown: 0,
        hunts: 0,
        huntsEnte: 0,
        huntsKaninchen: 0,
        huntLog: [],            // liest tools/simtest.js, siehe beginHunt
        partner: -1,
        flight: null,           // laeuft nie in die Luft; das Feld liest die Stoerabfrage
        fleeAngle: 0,
        drinks: 0,
        // Durstzeiten streuen, sonst geht in der ersten Nacht jeder gleichzeitig.
        nextDrink: WL.SimTime.hours(agentRng.range(1, 5))
      });
    }

    return agents;
  }

  /**
   * Der Schlafplatz: neben dem Bau, aber nicht ausserhalb des Reviers.
   *
   * Der Bau liegt immer drin (findDen), die Streuung von sleep.spread daneben
   * aber nicht - und der Schlaf ist mit zwei Dritteln des Tages die weitaus
   * laengste Zeit, die der Fuchs an einem Ort verbringt. Ein Platz knapp
   * ausserhalb kostete deshalb mehr Reviertreue als jede Nachtstrecke: gemessen
   * gingen **18 % der gesamten Zeit ausserhalb** auf schlafende Fuechse.
   * Findet sich nichts, wird im Bau selbst geschlafen.
   */
  function restingPlace(ctx, rng, den, spec, region, range, rMin) {
    for (var i = 0; i < 8; i++) {
      var p = ctx.land.pointInRing(rng, den.x, den.y, rMin, spec.sleep.spread, -1, region);
      if (p && inRange(range, p.x, p.y)) return p;
    }
    return { x: den.x, y: den.y };
  }

  function newSeen(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(0);
    return out;
  }

  /**
   * Der Bau: eine Waldstelle im eigenen Revier. Gesucht wird von der
   * Reviermitte aus nach aussen - der Wald ist ein Viertel der Karte, ein
   * freier Griff ins Waldraster laege meistens in einem fremden Revier.
   *
   * Drei Stufen, damit die Art auf keinem Seed ausfaellt (dieselbe Vorsicht
   * wie beim Kaninchen- und beim Dachsbau). Die Reihenfolge der Stufen ist
   * dabei eine Aussage darueber, was an dieser Art wichtiger ist:
   *
   *   1. Wald *im* Revier
   *   2. irgendeine begehbare Stelle *im* Revier
   *   3. Wald irgendwo in der Naehe
   *
   * "Im Revier" schlaegt also "im Wald", und das ist nicht beliebig. Ein Fuchs
   * schlaeft zwei Drittel jedes Tages in seinem Bau: liegt der ausserhalb der
   * Blase, verbringt das Tier zwei Drittel seines Lebens ausserhalb des
   * eigenen Reviers, und die Reviertreue faellt von 97 % auf gemessene 54 % -
   * ein Revier, das dem Tier nicht mehr anzusehen ist. Ein Bau auf Gras statt
   * im Wald ist dagegen nur eine Abweichung im Detail.
   */
  function findDen(ctx, spec, rng, range) {
    if (!range) return null;
    var i, p;

    var check = function (x, y) { return inRange(range, x, y); };
    for (i = 0; i < spec.home.tries * 4; i++) {
      p = ctx.land.pointInRing(rng, range.x, range.y, 0, range.base * 1.1, T.FOREST, 0);
      if (!p) continue;
      if (ctx.land.regionAt(p.x, p.y) <= 0) continue;
      if (!WL.Rules.placement.foxDen(ctx.world.query, p, spec.home, check)) continue;
      return { x: p.x, y: p.y };
    }

    for (i = 0; i < spec.home.tries * 4; i++) {
      p = ctx.land.pointInRing(rng, range.x, range.y, 0, range.base * 0.7, -1, 0);
      if (!p || ctx.land.regionAt(p.x, p.y) <= 0) continue;
      if (!inRange(range, p.x, p.y)) continue;
      return { x: p.x, y: p.y };
    }

    p = ctx.land.forestNear(rng, range.x, range.y, range.base, 0, range.base * 2, 1, 999);
    if (p && ctx.land.regionAt(p.x, p.y) > 0) return { x: p.x, y: p.y };
    return null;
  }

  /**
   * "Ein Fuchs von den 2-4 hat seinen Schlafplatz mit in einem Dachsbau."
   *
   * Genau einer, und zwar der, bei dem ein Dachsbau am dichtesten an der
   * eigenen Reviermitte liegt - unter allen Paaren, bei denen der Bau
   * ueberhaupt im Revier des Fuchses liegt. Uebernommen wird *dasselbe*
   * Bau-Objekt: collectBurrows in js/render/agentRenderer.js entdoppelt ueber
   * Objektidentitaet, es wird also ein Loch gezeichnet und nicht zwei
   * uebereinander.
   *
   * Liegt in keinem Fuchsrevier ein Dachsbau, teilt in dieser Welt niemand -
   * das ist ein Messwert fuer tools/simtest.js und kein Fehler. Die Dachse
   * stehen frueher in WL.SPECIES_ORDER, ihre Baue sind hier also schon da.
   *
   * @returns {number} Nummer des Fuchses, der teilt, oder -1.
   */
  function shareBadgerDen(ctx, ranges, dens) {
    var others = ctx.agents || [];
    var burrows = [];
    var i, k;
    for (i = 0; i < others.length; i++) {
      if (others[i].speciesId !== 'dachs' || !others[i].burrow) continue;
      if (burrows.indexOf(others[i].burrow) < 0) burrows.push(others[i].burrow);
    }
    if (!burrows.length) return -1;

    var bestFox = -1;
    var bestBurrow = null;
    var bestDist = Infinity;
    for (i = 0; i < ranges.length; i++) {
      if (!ranges[i] || !dens[i]) continue;
      for (k = 0; k < burrows.length; k++) {
        var b = burrows[k];
        if (!inRange(ranges[i], b.x, b.y)) continue;
        var d = Math.hypot(b.x - ranges[i].x, b.y - ranges[i].y);
        if (d >= bestDist) continue;
        bestDist = d;
        bestFox = i;
        bestBurrow = b;
      }
    }
    if (bestFox < 0) return -1;
    // Dasselbe Objekt, nicht eine Kopie: collectHomes in
    // js/render/agentRenderer.js entdoppelt ueber Objektidentitaet.
    dens[bestFox] = bestBurrow;
    return bestFox;
  }

  // ------------------------------------------------------------- Schritt

  function update(agent, ctx, dt) {
    var spec = agent.spec;
    A.updateMood(agent, spec, dt);

    // Im Bau wird nicht erst hingeschaut - dort ist der Fuchs sicher, genau
    // wie Kaninchen und Dachs in ihrem.
    if (agent.state === S.schlafen) { sleepStep(agent, ctx, dt); return; }

    agent.checkTimer -= dt;
    if (agent.checkTimer <= 0) {
      agent.checkTimer = CHECK_SECONDS;
      if (checkThreat(agent, ctx)) return;
    }

    if (agent.state === S.fliehen) { fleeStep(agent, ctx, dt); return; }
    // Eine laufende Hetze wird nicht vom Feierabend unterbrochen - sie dauert
    // hoechstens 6 s und endet von selbst.
    if (agent.state === S.hetzen) { huntStep(agent, ctx, dt); return; }

    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (!awake || settling) { goHome(agent, ctx, dt); return; }

    agent.huntTimer -= dt;
    if (agent.huntTimer <= 0) {
      agent.huntTimer = CHECK_SECONDS;
      if (checkHunt(agent, ctx)) return;
    }

    if (agent.state === S.sichern) { pauseStep(agent, ctx, dt); return; }
    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }
    travelStep(agent, ctx, dt);
  }

  // ------------------------------------------------------- Ziel waehlen

  /**
   * Wie weit ist die Nacht schon fortgeschritten? 0 beim Aufwachen, 1 am Ende
   * des Wachfensters. Das Fenster laeuft ueber Mitternacht, ein einfacher
   * Vergleich reicht dafuer nicht.
   */
  function nightProgress(time, spec) {
    var f = WL.SimTime.dayFraction(time);
    var from = spec.awake[0];
    var to = spec.awake[1];
    var span = to > from ? to - from : 1 - from + to;
    var done = f >= from ? f - from : 1 - from + f;
    return span > 0 ? done / span : 0;
  }

  /**
   * Nach dem Aufwachen und nach jedem abgeschlossenen Zug.
   *
   * Feste Reihenfolge statt "wer ueberfaelliger ist" - dieselbe Entscheidung
   * wie beim Dachs und aus demselben Grund: nextDrink laeuft auch waehrend des
   * Schlafens weiter und ist beim Aufwachen praktisch immer laengst faellig,
   * waehrend die Patrouille als Nachtereignis gerade erst ansteht. Ein
   * Vergleich der Ueberfaelligkeit liesse den Durst jede Nacht gewinnen, und
   * von "laeuft zweimal je Nacht die Grenze ab" bliebe nichts uebrig.
   */
  function chooseTarget(agent, ctx) {
    var spec = agent.spec;

    if (agent.patrolsDone < spec.patrol.perNight &&
      (agent.patrolsDone === 0 ||
        nightProgress(ctx.time, spec) >= spec.patrol.secondHalf)) {
      beginPatrol(agent, ctx);
      return;
    }

    if (wantsDrink(agent, ctx)) { beginDrink(agent, ctx); return; }

    beginCross(agent, ctx);
  }

  function wantsDrink(agent, ctx) {
    var spec = agent.spec;
    var thirst = agent.nextDrink - ctx.time;
    return thirst <= 0 || (thirst <= WL.SimTime.hours(spec.drink.earlyHours) &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.nearby);
  }

  function setTravel(agent, goal, x, y, speedState) {
    agent.state = S.gehen;
    agent.goal = goal;
    // Jeder neu angesetzte Zug loescht einen offenen Knickpunkt und die
    // Umwegzaehlung: beide setzt nur, wer sie braucht (beginLeg, shoreCheck),
    // und zwar gleich danach. Sonst schleppte ein abgebrochener Zug sein altes
    // Endziel in den naechsten hinein.
    agent.legFinal = null;
    agent.detours = 0;
    agent.shoreTimer = 0;
    agent.tx = x;
    agent.ty = y;
    agent.speedBase = A.drawSpeed(agent, agent.spec, speedState || 'gehen');
    var dist = Math.hypot(x - agent.x, y - agent.y);
    // Notbremse gegen ein Ziel, das partout nicht erreicht wird.
    agent.walkTimer = 10 + dist / Math.max(1, agent.speedBase) * 2.5;
  }

  /**
   * Ein weiter Zug, der im Revier bleiben und nicht ins Wasser laufen soll
   * (Querung, Heimweg). Geht beides gerade, geht es gerade; sonst ueber genau
   * einen Knickpunkt.
   *
   * **Zwei verschiedene Hindernisse, zwei verschiedene Knickpunkte.** Haelt die
   * gerade Sehne die *Kontur* nicht, ist die Reviermitte der Knick
   * (viaCenter): die Strecke von der Mitte zu einem Punkt im Revier liegt
   * immer darin, das ist die Sternfoermigkeit einer Radialkontur. Liegt
   * dagegen *Wasser* im Weg, hilft die Mitte nichts - dann wird seitlich am
   * See vorbei gesucht (viaAround).
   *
   * Das Ziel wird dabei *nicht* naeher an die Mitte gezogen. Das war der erste
   * Versuch, und er nahm die Ansage "mehr an der Grenze" ueber die Hintertuer
   * wieder zurueck: die Querungsziele landeten im Mittel bei 0.6 statt 0.85
   * des oertlichen Radius, weil quer durchs Revier fast jede Sehne irgendeine
   * Beule anschneidet.
   */
  function beginLeg(agent, ctx, goal, x, y) {
    var range = agent.territory;
    var inside = inRange(range, agent.x, agent.y);
    var wet = !pathClear(ctx, agent.x, agent.y, x, y);
    var cuts = inside && !pathInside(range, agent.x, agent.y, x, y);
    var via = null;

    if (cuts) via = viaCenter(agent, ctx, x, y);
    if (!via && (wet || cuts)) via = viaAround(agent, ctx, x, y, inside ? range : null);

    if (via) {
      setTravel(agent, goal, via.x, via.y);
      agent.legFinal = { x: x, y: y };
      return;
    }
    setTravel(agent, goal, x, y);
  }

  /**
   * Der Weg um den See herum: ein Knickpunkt neben der direkten Linie, von dem
   * aus beide Teilstrecken trocken sind.
   *
   * **Warum das noetig ist, obwohl kein Ziel jenseits eines Sees gewaehlt
   * wird.** Weil es Faelle gibt, in denen es kein trockenes Ziel *gibt*: liegt
   * ein See mitten im Revier oder an seinem Rand, und steht der Fuchs auf der
   * falschen Seite, scheitert jeder Kandidat an pathClear, und beginCross
   * nimmt am Ende den ersten begehbaren - quer durchs Wasser. Der
   * Ausweichfaecher laesst ihn dann am Ufer entlanglaufen statt hinein, und
   * weil das Ziel drueben liegen bleibt, faengt er nach jedem Freilaufen von
   * vorne an. Gemessen kamen einzelne Fuechse so auf **30 % ihrer gesamten
   * Strecke dichter als 25 u am Wasser** und auf Ufermaersche von bis zu
   * **1300 u am Stueck** - das Bild, das der Nutzer beanstandet hat.
   *
   * Gesucht wird senkrecht zur Verbindungslinie, von nah nach fern und auf
   * beiden Seiten: der erste Abstand, der traegt, ist der kuerzeste Umweg um
   * den See. Fuer einen runden See ist dieser Punkt gerade die Tangente, und
   * genau so sieht der Weg dann auch aus.
   *
   * **Ein Umweg, kein Ufermarsch.** MAX_DETOUR deckelt den Weg auf das
   * Doppelte der Luftlinie. Was darueber liegt, ist kein Bogen um einen See
   * mehr, sondern genau das Abtraben des halben Ufers, das hier abgestellt
   * werden soll - dann lieber gerade und kurz.
   */
  function viaAround(agent, ctx, x, y, range) {
    var dx = x - agent.x;
    var dy = y - agent.y;
    var len = Math.hypot(dx, dy);
    if (len < 1) return null;
    var mx = (agent.x + x) / 2;
    var my = (agent.y + y) / 2;
    var nx = -dy / len;
    var ny = dx / len;
    var m, i, s;

    // Aeussere Schleife ist der Abstand zum Wasser, nicht die Weite des
    // Bogens: lieber ein weiter Umweg mit Abstand als ein knapper am Ufer
    // entlang (pathDry). Erst wenn mit Abstand gar nichts geht, wird er
    // aufgegeben - ein Weg am Ufer ist immer noch besser als keiner.
    for (m = 0; m < DETOUR_MARGINS.length; m++) {
      var margin = DETOUR_MARGINS[m];
      var best = null;
      var bestCost = Infinity;
      for (i = 0; i < DETOUR_OFFSETS.length; i++) {
        for (s = -1; s <= 1; s += 2) {
          var off = DETOUR_OFFSETS[i] * len * s;
          var p = { x: mx + nx * off, y: my + ny * off };
          if (!ctx.land.walkable(p.x, p.y)) continue;
          if (ctx.land.regionAt(p.x, p.y) !== agent.region) continue;
          if (!pathDry(ctx, agent.x, agent.y, p.x, p.y, margin)) continue;
          if (!pathDry(ctx, p.x, p.y, x, y, margin)) continue;
          var cost = Math.hypot(p.x - agent.x, p.y - agent.y) + Math.hypot(x - p.x, y - p.y);
          if (cost > len * MAX_DETOUR) continue;
          // Ein Bogen ausserhalb des Reviers ist erlaubt - er ist oft der
          // einzige -, aber unter sonst gleichen Umstaenden verliert er.
          if (range && !(pathInside(range, agent.x, agent.y, p.x, p.y) &&
            pathInside(range, p.x, p.y, x, y))) cost *= 1.35;
          if (cost < bestCost) { bestCost = cost; best = p; }
        }
        // Naeher an der Linie ist besser: die erste Weite, die traegt, gewinnt.
        if (best) return best;
      }
    }
    return null;
  }

  /**
   * Ein Knickpunkt nahe der Reviermitte, von dem aus beide Teilstrecken im
   * Revier liegen und keine durch Wasser fuehrt. Die Mitte selbst ist der
   * erste Versuch; liegt dort ein See oder eine fremde Landmasse, wird in
   * ihrer Umgebung gesucht.
   */
  function viaCenter(agent, ctx, x, y) {
    var range = agent.territory;
    var c = { x: range.x, y: range.y };
    for (var i = 0; i < 6; i++) {
      if (ctx.land.walkable(c.x, c.y) && ctx.land.regionAt(c.x, c.y) === agent.region &&
        pathClear(ctx, agent.x, agent.y, c.x, c.y) && pathClear(ctx, c.x, c.y, x, y) &&
        pathInside(range, agent.x, agent.y, c.x, c.y) && pathInside(range, c.x, c.y, x, y)) {
        return c;
      }
      c = ctx.land.pointInRing(agent.rng, range.x, range.y, 0, range.base * 0.3, -1, agent.region);
      if (!c) return null;
    }
    return null;
  }

  // ------------------------------------------------------------ Grenze

  /**
   * Eine Teilrunde: share des Umfangs, weiter dort, wo die letzte aufgehoert
   * hat, immer in derselben Richtung.
   */
  function beginPatrol(agent, ctx) {
    var spec = agent.spec;
    agent.patrolsDone++;
    agent.patrols++;
    agent.patrolLeft = Math.max(2, Math.round(agent.territory.samples * spec.patrol.share));
    if (!nextPatrolPoint(agent, ctx)) beginCross(agent, ctx);
  }

  /**
   * Die naechste erreichbare Stuetzstelle der Grenze. Stellen im Wasser,
   * ausserhalb der Karte oder hinter einem See werden uebersprungen - sie
   * zaehlen aber gegen das Rundenpensum und gelten als abgelaufen: der Fuchs
   * *hat* diesen Abschnitt seiner Grenze besucht, er konnte ihn nur nicht
   * betreten.
   *
   * **Der Wasserblick nach vorn (pathClear) ist hier genauso noetig wie bei
   * der Querung, und er war zuerst vergessen.** Liegt zwischen zwei
   * benachbarten Stuetzstellen ein See, laeuft der Ausweichfaecher den Fuchs
   * am Ufer entlang um das ganze Gewaesser herum - auf dem Vorschaubild
   * zeichneten vier Fuechse dadurch in fuenf Naechten *jede* Seekontur der
   * Karte als dicke Linie nach. Das sah aus wie ein Tier, das Teiche
   * umrundet, und trieb nebenbei den Barschschwarm aus seiner Ruhezone.
   */
  function nextPatrolPoint(agent, ctx) {
    var range = agent.territory;
    for (var i = 0; i < range.samples; i++) {
      if (agent.patrolLeft <= 0) return false;
      agent.patrolIndex = (agent.patrolIndex + agent.dir + range.samples) % range.samples;
      agent.patrolSeen[agent.patrolIndex] = 1;
      agent.patrolLeft--;
      var p = boundaryPoint(range, agent.patrolIndex);
      // Auch eine Stuetzstelle im Uferstreifen gilt als abgelaufen: sie ist
      // fuer den Faecher unerreichbar (walkLand), und ohne diese Zeile liefe
      // der Fuchs bis zur Notbremse dagegen an.
      if (!dryEnough(agent, ctx, p)) continue;
      if (ctx.land.regionAt(p.x, p.y) !== agent.region) continue;
      if (!pathClear(ctx, agent.x, agent.y, p.x, p.y)) continue;
      setTravel(agent, 'grenze', p.x, p.y);
      return true;
    }
    return false;
  }

  /**
   * Der Saum: ein kurzes Stueck Grenze am Ende einer Querung.
   *
   * Zwei Teilrunden je Nacht sind der eine Weg, den Fuchs an seine Grenze zu
   * bringen - und der einzige, der nicht mehr weiter aufgedreht werden kann
   * (species.js, patrol.share: das Zeitbudget traegt es, der Barschschwarm
   * nicht). Der zweite Weg ist dieser: die Querung endet ohnehin drueben am
   * Rand, und dort laeuft der Fuchs ein paar Stuetzstellen die Grenze entlang,
   * bevor er zurueckquert. Das kostet keine zusaetzliche Uferzeit, weil er
   * schon da ist, wo er ist.
   *
   * Weitergezaehlt wird dabei ein *eigener* Index (rimIndex), nicht der der
   * Patrouille: sonst spraenge die naechste Teilrunde dorthin, wo die letzte
   * Querung zufaellig geendet hat, und aus zwei Teilrunden je Nacht wuerde
   * ueber fuenf Naechte keine geschlossene Blase mehr.
   */
  function beginRim(agent, ctx) {
    var spec = agent.spec;
    var range = agent.territory;
    if (!agent.rng.chance(spec.cross.rimChance)) { chooseTarget(agent, ctx); return; }
    var theta = Math.atan2(agent.y - range.y, agent.x - range.x) / (Math.PI * 2) * range.samples;
    var idx = Math.round(theta) % range.samples;
    agent.rimIndex = (idx + range.samples) % range.samples;
    agent.rimLeft = agent.rng.intIn(spec.cross.rimSteps);
    if (!nextRimPoint(agent, ctx)) chooseTarget(agent, ctx);
  }

  /** Wie nextPatrolPoint, nur mit dem eigenen Index und ohne Rundenpensum. */
  function nextRimPoint(agent, ctx) {
    var range = agent.territory;
    for (var i = 0; i < range.samples; i++) {
      if (agent.rimLeft <= 0) return false;
      agent.rimLeft--;
      var p = boundaryPoint(range, agent.rimIndex);
      agent.rimIndex = (agent.rimIndex + agent.dir + range.samples) % range.samples;
      if (!dryEnough(agent, ctx, p)) continue;
      if (ctx.land.regionAt(p.x, p.y) !== agent.region) continue;
      if (!pathClear(ctx, agent.x, agent.y, p.x, p.y)) continue;
      setTravel(agent, 'saum', p.x, p.y);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------- Querung

  /**
   * Quer durchs Revier: das Ziel liegt auf der *gegenueberliegenden* Seite,
   * nicht irgendwo darin. Frei gewuerfelt bliebe der Fuchs um seinen Bau
   * haengen - ein Irrflug kommt nach acht Zuegen nur die Wurzel aus acht
   * Zuglaengen weit, das ist beim Kaninchen ausdruecklich das Mittel und hier
   * ausdruecklich der Fehler.
   *
   * Steht der Fuchs nach einer Hetze oder Flucht ausserhalb seines Reviers,
   * fuehrt die naechste Querung erst einmal wieder hinein.
   */
  /**
   * Liegt zwischen hier und dort kein Wasser?
   *
   * **Das ist keine Wegfindung, sondern Ruecksicht auf den Barsch.** Der
   * Ausweichfaecher (js/sim/agents.js) laesst ein Landtier am Ufer entlang
   * laufen, wenn sein Ziel jenseits eines Sees liegt - fuer Reh und Dachs faellt
   * das kaum auf, weil ihre Ziele nah beieinander liegen. Die Querung des
   * Fuchses geht dagegen absichtlich quer durch das *ganze* Revier und trifft
   * deshalb staendig auf Seen: gemessen verbrachte er **45 % jeder Nacht
   * naeher als 95 u am Wasser**, obwohl nur 25-30 % seines Reviers so nah
   * liegen. Der Barschschwarm, dessen Fluchtpruefung keine Groessenschwelle
   * kennt, wurde dadurch Nacht fuer Nacht aus seiner Ruhezone getrieben
   * (Abstand zum Ruhepunkt 39 -> 81 u auf Seed 777777).
   *
   * Ein Ziel, dessen gerader Weg durch einen See fuehrt, wird deshalb gar
   * nicht erst gewaehlt. Der Fuchs kommt weiterhin ans Wasser - zum Trinken
   * und zur Entenjagd, beides ausdruecklich gewollt -, aber er trabt nicht
   * mehr das halbe Ufer ab, nur weil sein Ziel dahinter liegt.
   */
  function pathClear(ctx, x0, y0, x1, y1) {
    var dx = x1 - x0;
    var dy = y1 - y0;
    var steps = Math.ceil(Math.hypot(dx, dy) / 20);
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      if (!ctx.land.walkable(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  /**
   * Wie pathClear, aber mit Sicherheitsabstand zum Wasser.
   *
   * **Ein Bogen um einen See soll Abstand halten.** Der erste Anlauf suchte nur
   * einen *trockenen* Weg um den See herum - und fand ihn dicht am Ufer, denn
   * dort ist er am kuerzesten. Fuers Bild war das ein Fortschritt (die Strecke
   * unter 25 u am Wasser fiel von 13.3 auf 9.8 %), fuer den Barschschwarm
   * nicht: der flieht vor allem, was naeher als 95 u kommt, und ein Fuchs, der
   * den halben See in 20 u Abstand umrundet, stoert ihn laenger als einer, der
   * einmal ans Ufer laeuft und wieder weg. Auf zwei von zehn Seeds war die
   * Nachtruhe des Schwarms danach nicht mehr messbar (tools/simtest.js).
   */
  function pathDry(ctx, x0, y0, x1, y1, margin) {
    if (margin <= 0) return pathClear(ctx, x0, y0, x1, y1);
    var q = ctx.world.query;
    var dx = x1 - x0;
    var dy = y1 - y0;
    var steps = Math.ceil(Math.hypot(dx, dy) / 20);
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var x = x0 + dx * t;
      var y = y0 + dy * t;
      if (!ctx.land.walkable(x, y)) return false;
      // Das letzte Stueck darf ans Ufer heranfuehren: das Ziel selbst kann
      // eine Grenzstuetzstelle am Wasser sein, und die soll erreichbar
      // bleiben. Verboten ist das *Entlanglaufen*, nicht das Ankommen.
      if (i < steps && q.distToWater(x, y) < margin) return false;
    }
    return true;
  }

  function beginCross(agent, ctx) {
    var spec = agent.spec;
    var range = agent.territory;
    var back = !inRange(range, agent.x, agent.y);
    var here = Math.atan2(agent.y - range.y, agent.x - range.x);
    var target = null;
    var fallback = null;
    var pass, i, theta, r, p;

    /**
     * Zwei Durchgaenge, und die Reihenfolge ist die Aussage: erst alle
     * Richtungen, deren gerade Sehne im Revier bleibt, und erst wenn keine
     * haelt, eine, die den Knick ueber die Mitte braucht (beginLeg). Ein
     * gerader Zug ist die schoenere Spur; der Knick ist der Preis dafuer, dass
     * die Grenze nicht geschnitten wird.
     */
    for (pass = 0; pass < 2 && !target; pass++) {
      for (i = 0; i < 14 && !target; i++) {
        if (back) {
          // Zurueck ins Revier: irgendwo in der inneren Haelfte.
          theta = agent.rng.range(0, Math.PI * 2);
          r = radiusAt(range, theta) * agent.rng.range(0, 0.5);
        } else {
          theta = here + Math.PI +
            agent.rng.range(-spec.cross.farSide / 2, spec.cross.farSide / 2);
          r = radiusAt(range, theta) * agent.reach * agent.rng.rangeIn(spec.cross.depth);
        }
        p = { x: range.x + Math.cos(theta) * r, y: range.y + Math.sin(theta) * r };
        if (!dryEnough(agent, ctx, p)) continue;
        if (ctx.land.regionAt(p.x, p.y) !== agent.region) continue;
        if (!fallback) fallback = p;
        // Ziele, deren gerader Weg durch einen See fuehrt, werden verworfen -
        // siehe pathClear.
        if (!pathClear(ctx, agent.x, agent.y, p.x, p.y)) continue;
        // Steht der Fuchs schon draussen, kann keine Strecke im Revier
        // bleiben - dann ist der Weg hinein wichtiger als der Weg darin.
        if (pass === 0 && !back && !pathInside(range, agent.x, agent.y, p.x, p.y)) continue;
        target = p;
      }
    }
    if (!target) target = fallback;
    // Findet sich gar nichts, geht es zum Bau - der liegt sicher im Revier.
    if (!target) target = { x: agent.burrow.x, y: agent.burrow.y };

    agent.crossTarget = target;
    agent.legLeft = agent.rng.rangeIn(spec.cross.leg);
    beginLeg(agent, ctx, 'quer', target.x, target.y);
  }

  // ------------------------------------------------------------- Trinken

  /**
   * Der Uferpunkt auf der Seite des Fuchses - nicht die Mitte des Gewaessers.
   * Getrunken wird da, wo er ankommt, und das ist das naechste Ufer: ein See,
   * dessen Mitte im Revier liegt, dessen Ufer davor aber nicht, fuehrt ihn aus
   * dem Revier heraus (gemessen 15 % der Trinkzeit ausserhalb).
   */
  function shorePoint(body, x, y) {
    var dx = x - body.x;
    var dy = y - body.y;
    var d = Math.hypot(dx, dy);
    if (d < 1) return { x: body.x, y: body.y };
    return { x: body.x + dx / d * body.radius, y: body.y + dy / d * body.radius };
  }

  /** Naechstes Gewaesser, gemessen ab seinem Ufer, unter einer Bedingung. */
  function nearestBody(agent, ctx, test) {
    var bodies = ctx.habitat.bodies;
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < bodies.length; i++) {
      if (test && !test(bodies[i])) continue;
      var d = Math.hypot(bodies[i].x - agent.x, bodies[i].y - agent.y) - bodies[i].radius;
      if (d < bestDist) { bestDist = d; best = bodies[i]; }
    }
    return best;
  }

  function beginDrink(agent, ctx) {
    var range = agent.territory;
    // Drei Stufen, wie beim Bau: erst das Gewaesser, dessen Ufer *auf seiner
    // Seite* im Revier liegt - dass ueberhaupt Wasser drin liegt, ist der
    // Grund fuer die Wasserbedingung bei der Revierwahl (buildRanges). Dann
    // eines, das wenigstens mit der Mitte drin liegt. Und zuletzt das
    // naechstgelegene ueberhaupt: lieber ein Ausflug als eine Art, die nie
    // trinkt.
    var best = nearestBody(agent, ctx, function (b) {
      if (!inRange(range, b.x, b.y)) return false;
      var s = shorePoint(b, agent.x, agent.y);
      return inRange(range, s.x, s.y);
    });
    if (!best) {
      best = nearestBody(agent, ctx, function (b) { return inRange(range, b.x, b.y); });
    }
    if (!best) best = nearestBody(agent, ctx, null);
    if (!best) {
      agent.nextDrink = ctx.time + WL.SimTime.hours(4);
      beginCross(agent, ctx);
      return;
    }
    setTravel(agent, 'wasser', best.x, best.y);
  }

  function beginDrinking(agent, ctx) {
    var spec = agent.spec;
    agent.state = S.trinken;
    agent.goal = null;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.drink.bout) * agent.traits.needs;
    agent.nextDrink = ctx.time + WL.SimTime.hours(agent.rng.rangeIn(spec.drink.intervalHours));
    agent.drinks++;
  }

  function drinkStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    agent.heading += Math.sin(ctx.time * 0.7 + agent.index) * 0.10 * dt;
    if (agent.stateTimer <= 0) chooseTarget(agent, ctx);
  }

  function giveUpDrinking(agent, ctx) {
    agent.nextDrink = ctx.time + WL.SimTime.hours(agent.rng.range(1, 3));
    beginCross(agent, ctx);
  }

  // -------------------------------------------------------------- Gehen

  /**
   * Merkt er, dass er am Ufer entlanglaeuft, statt irgendwo anzukommen?
   *
   * **Der Umweg bei der Zielwahl allein genuegt nicht.** Beim Aufbruch war der
   * Weg trocken, sonst waere er nicht gewaehlt worden - aber der
   * Ausweichfaecher (js/sim/agents.js) schiebt den Fuchs an jedem Baum und
   * jeder Bucht ein Stueck zur Seite, und ein paar solcher Schuebe spaeter
   * liegt der See zwischen ihm und seinem Ziel. Von da an laeuft er das Ufer
   * ab, ohne je anzukommen: der Faecher haelt ihn am Wasser entlang, walkStep
   * dreht ihn in jedem Tick wieder aufs Ziel zu, und beides zusammen ergibt
   * genau die Ufermaersche von ueber 1000 u, die auf dem Vorschaubild jede
   * Seekontur nachzeichnen.
   *
   * Drei Bedingungen, und alle drei sind noetig:
   *
   *   1. Er ist dicht am Wasser (detour.band),
   *   2. schon eine Weile (detour.patience) - ein Tier, das quer ueber eine
   *      Landzunge laeuft, soll nicht sofort umplanen,
   *   3. und sein Ziel liegt *jenseits* des Wassers (pathClear). Ohne diese
   *      dritte Bedingung wuerde auch die Grenzpatrouille umgeleitet, die an
   *      einem Ufer entlangfuehrt - die soll aber genau dort laufen.
   *
   * Dann wird derselbe Bogen gesucht wie bei der Zielwahl (viaAround). Findet
   * sich keiner, bleibt es beim geraden Weg: dann gibt es wirklich keinen Weg
   * um diesen See herum, und die Notbremse in travelStep loest ihn ab.
   */
  function shoreCheck(agent, ctx, dt) {
    var spec = agent.spec;
    if (agent.goal === 'wasser' || agent.detours >= spec.detour.tries) return;
    if (ctx.world.query.distToWater(agent.x, agent.y) > spec.detour.band) {
      agent.shoreTimer = 0;
      return;
    }
    agent.shoreTimer += dt;
    if (agent.shoreTimer < spec.detour.patience) return;
    agent.shoreTimer = 0;

    var final = agent.legFinal || { x: agent.tx, y: agent.ty };
    if (pathClear(ctx, agent.x, agent.y, final.x, final.y)) return;
    var range = agent.territory;
    var via = viaAround(agent, ctx, final.x, final.y,
      inRange(range, agent.x, agent.y) ? range : null);
    if (!via) return;

    var n = agent.detours;
    setTravel(agent, agent.goal, via.x, via.y);
    agent.legFinal = { x: final.x, y: final.y };
    agent.detours = n + 1;
  }

  function travelStep(agent, ctx, dt) {
    var spec = agent.spec;
    if (agent.goal === 'frei') { escapeStep(agent, ctx, dt); return; }
    agent.walkTimer -= dt;

    if (agent.goal === 'wasser' &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.drink.reach) {
      beginDrinking(agent, ctx);
      return;
    }

    shoreCheck(agent, ctx, dt);

    var x0 = agent.x;
    var y0 = agent.y;
    var result = A.walkStep(agent, walkLand(agent, ctx, true), dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);

    // Kurze Stops unterwegs, aber nur auf einer Querung: eine Patrouille ist
    // ein Zug am Stueck, sonst zerfaellt die Grenzlinie in lauter Punkte.
    if (agent.goal === 'quer' && result === 'moving') {
      agent.legLeft -= Math.hypot(agent.x - x0, agent.y - y0);
      if (agent.legLeft <= 0) {
        agent.legLeft = agent.rng.rangeIn(spec.cross.leg);
        if (agent.rng.chance(spec.cross.stopChance)) { beginPause(agent, ctx); return; }
      }
    }

    if (result === 'moving') agent.blocks = 0;

    if (result === 'arrived') {
      agent.blocks = 0;
      // Am Knickpunkt eines zweiteiligen Zugs: weiter zum eigentlichen Ziel.
      if (agent.legFinal) {
        var f = agent.legFinal;
        agent.legFinal = null;
        setTravel(agent, agent.goal, f.x, f.y);
        return;
      }
      if (agent.goal === 'grenze') {
        if (!nextPatrolPoint(agent, ctx)) chooseTarget(agent, ctx);
      } else if (agent.goal === 'saum') {
        if (!nextRimPoint(agent, ctx)) chooseTarget(agent, ctx);
      } else if (agent.goal === 'wasser') giveUpDrinking(agent, ctx);
      // Drueben angekommen: erst ein Stueck Grenze, dann die naechste Querung.
      else if (agent.goal === 'quer') beginRim(agent, ctx);
      else chooseTarget(agent, ctx);
      return;
    }

    if (result === 'blocked') agent.blocks++;

    if (result === 'blocked' || agent.walkTimer <= 0) {
      if (agent.goal === 'wasser') agent.nextDrink = ctx.time + WL.SimTime.hours(1);
      // Mehrmals hintereinander blockiert oder gar nicht angekommen: das ist
      // eine Sackgasse, und ein neues Ziel hilft dagegen nicht (beginEscape).
      if (agent.blocks >= 3 || agent.walkTimer <= 0) { beginEscape(agent, ctx); return; }
      // Auf der Grenze ist die erste Antwort nicht die Kehrtwende, sondern die
      // *naechste* Stuetzstelle: die liegt voraus, nicht zurueck.
      if (agent.goal === 'grenze') {
        if (!nextPatrolPoint(agent, ctx)) chooseTarget(agent, ctx);
        return;
      }
      if (agent.goal === 'saum') {
        if (!nextRimPoint(agent, ctx)) chooseTarget(agent, ctx);
        return;
      }
      chooseTarget(agent, ctx);
    }
  }

  /**
   * Freilaufen aus einer Sackgasse.
   *
   * Der Ausweichfaecher reicht nur ueber gut +/-109 Grad (js/sim/agents.js) -
   * ein Landtier, das zwischen Kartenrand und Ufer geraet, kommt aus eigener
   * Kraft nie wieder heraus. Beim Reh war das schon einmal ein Fehler; beim
   * Fuchs faellt er staerker auf, weil er als einziges Tier ein Ziel *jenseits*
   * des Reviers ansteuert (die gegenueberliegende Grenze) und deshalb oft
   * genug am Wasser vorbei muss.
   *
   * Ein blosses `heading += PI` genuegt dabei nicht, und das ist der Punkt:
   * walkStep dreht die Blickrichtung in jedem Tick wieder auf den Zielpunkt
   * zu, die Kehrtwende ist im naechsten Tick also schon wieder halb
   * zurueckgenommen. Gemessen lief ein Fuchs auf Seed 606060 dadurch die
   * letzten vier Tage der Aufzeichnung in einem 130 u langen Streifen am
   * Kartenrand auf und ab - 33 % Reviertreue statt 95 %, und er fand nie
   * wieder zu seinem Bau.
   *
   * Deshalb wird hier fuer ein paar Sekunden gar kein Ziel verfolgt, sondern
   * nur eine *Richtung* (roamStep) - dieselbe Bewegung wie bei der Flucht, und
   * die kommt aus Sackgassen nachweislich heraus, weil sie den Faecher die
   * Enge entlangfuehren laesst statt gegen ihre Wand.
   */
  function beginEscape(agent, ctx) {
    agent.state = S.gehen;
    agent.goal = 'frei';
    agent.crossTarget = null;
    agent.escapeAngle = agent.heading + Math.PI + agent.rng.range(-0.6, 0.6);
    // Steckt er ausserhalb des Reviers fest, zeigt die Kehrtwende nach Hause -
    // die Enge liegt dann meistens genau zwischen ihm und seinem Revier.
    if (!inRange(agent.territory, agent.x, agent.y)) {
      agent.escapeAngle = bendInward(agent.territory, agent.x, agent.y,
        agent.escapeAngle, agent.spec.reaction.bendHome);
    }
    agent.speedBase = A.drawSpeed(agent, agent.spec, 'gehen');
    agent.stateTimer = agent.rng.range(1.5, 3.5);
    agent.blocks = 0;
  }

  function escapeStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    var result = A.roamStep(agent, walkLand(agent, ctx, false), dt,
      A.effectiveSpeed(agent, agent.speedBase), agent.escapeAngle, TURN);
    // Wie beim Fliehen: geht es hier nicht weiter, wird die Richtung gedreht,
    // bis eine offene bleibt.
    if (result === 'blocked') agent.escapeAngle += 1.1;
    if (agent.stateTimer <= 0) chooseTarget(agent, ctx);
  }

  function beginPause(agent, ctx) {
    var spec = agent.spec;
    agent.state = S.sichern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.cross.pause) * agent.traits.needs;
  }

  /**
   * Nach dem Stop laeuft die angefangene Querung weiter, nicht eine neue -
   * und zwar zu dem Punkt, auf den sie gerade zulief (agent.tx/ty). Das ist
   * bei einem zweiteiligen Zug der Knickpunkt und nicht das Ziel dahinter;
   * legFinal bleibt derweil stehen und traegt den Rest.
   */
  function pauseStep(agent, ctx, dt) {
    agent.stateTimer -= dt;
    agent.heading += Math.sin(ctx.time * 0.9 + agent.index) * 0.25 * dt;
    if (agent.stateTimer > 0) return;
    if (agent.goal === 'quer' && agent.crossTarget) {
      setTravel(agent, 'quer', agent.tx, agent.ty);
    } else {
      chooseTarget(agent, ctx);
    }
  }

  // --------------------------------------------------------------- Jagd

  function inDusk(time, windows) {
    var f = WL.SimTime.dayFraction(time);
    for (var i = 0; i < windows.length; i++) {
      if (f >= windows[i][0] && f < windows[i][1]) return true;
    }
    return false;
  }

  /**
   * Beute in Sicht? Kaninchen nur in der Daemmerung, Enten nur wenn der Fuchs
   * ohnehin am Wasser ist - er geht nicht eigens auf Entenjagd.
   *
   * Dass ein Kaninchen *im Bau* und eine schlafende Ente gar nicht erst
   * auftauchen, steht nicht hier, sondern in ctx.nearestPrey
   * (js/sim/simulation.js): "nachts ignorieren sie sich" ist damit eine
   * Eigenschaft der Beutesuche und keine Sonderregel des Fuchses.
   */
  function checkHunt(agent, ctx) {
    var h = agent.spec.hunt;
    if (ctx.time < agent.huntCooldown) return false;

    if (inDusk(ctx.time, h.dusk)) {
      var rabbit = ctx.nearestPrey(agent, h.kaninchen.sight * agent.boldness,
        KANINCHEN, h.kaninchen.awakeOnly);
      if (rabbit) { beginHunt(agent, ctx, rabbit, h.kaninchen.awakeOnly); return true; }
    }

    // Und nur, solange noch ein Stueck Land zwischen ihm und dem Wasser liegt:
    // wer schon am Ufer steht, hat nichts mehr zu versuchen - die Ente ist
    // drueben. Ohne diese Bedingung begaenne die Hetze in dem Augenblick neu,
    // in dem huntStep sie am Ufer beendet hat.
    var toWater = ctx.world.query.distToWater(agent.x, agent.y);
    if (toWater <= h.ente.nearWater && toWater > h.shore) {
      var duck = ctx.nearestPrey(agent, h.ente.sight * agent.boldness,
        ENTE, h.ente.awakeOnly);
      if (duck) { beginHunt(agent, ctx, duck, h.ente.awakeOnly); return true; }
    }
    return false;
  }

  function beginHunt(agent, ctx, prey, awakeOnly) {
    var spec = agent.spec;
    agent.state = S.hetzen;
    agent.goal = null;
    agent.prey = prey;
    // Gemerkt, weil huntStep dieselbe Bedingung jeden Tick nachpruefen muss:
    // ein Kaninchen, das sich waehrend der Hetze hinlegt, ist nicht mehr
    // "draussen" - eine Ente, die weiterschlaeft, ist weiterhin Beute.
    agent.preyAwakeOnly = !!awakeOnly;
    agent.speedBase = A.drawSpeed(agent, spec, 'hetzen');
    agent.stateTimer = agent.rng.rangeIn(spec.hunt.bout);
    agent.hunts++;
    if (prey.speciesId === 'ente') agent.huntsEnte++;
    else if (prey.speciesId === 'kaninchen') agent.huntsKaninchen++;
    // Wann, hinter wem und in welchem Zustand - die Aufzeichnung haelt nur
    // x/y/state je Tier fest, aus ihr laesst sich also nicht ablesen, *wen*
    // ein hetzender Fuchs verfolgt hat. Ohne diese Zeile waeren die beiden
    // woertlichen Zusagen des Katalogs ("Kaninchen nur in der Daemmerung",
    // "nur solange sie noch draussen sind") nicht nachpruefbar, sondern nur
    // behauptet. tools/simtest.js liest das aus.
    agent.huntLog.push({ time: ctx.time, prey: prey.speciesId, preyState: prey.state });
  }

  /**
   * Hinter der Beute her. Das Ziel wird jeden Tick nachgefuehrt - eine
   * fliehende Ente oder ein zum Bau rennendes Kaninchen bewegt sich, ein
   * einmal gesetzter Zielpunkt liefe daneben.
   *
   * Gefangen wird nie etwas: die Hetze endet, wenn die Zeit um ist, die Beute
   * weit genug weg oder im Bau ist - oder wenn der Fuchs am Ufer steht
   * ('blocked'), denn er schwimmt nicht.
   */
  function huntStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;
    var prey = agent.prey;

    if (!prey || prey.state === S.bau) { endHunt(agent, ctx); return; }
    if (agent.preyAwakeOnly && prey.state === S.schlafen) { endHunt(agent, ctx); return; }
    var dist = Math.hypot(prey.x - agent.x, prey.y - agent.y);
    if (dist > spec.hunt.giveUp) { endHunt(agent, ctx); return; }
    /**
     * **Am Ufer ist Schluss, und das musste ausdruecklich hingeschrieben
     * werden.** Dass der Fuchs nicht schwimmt, erledigt der Ausweichfaecher -
     * aber er laesst ihn eben nicht stehen, sondern *am Ufer entlang* hinter
     * der davonschwimmenden Ente her. Gemessen lagen **76 % der gesamten
     * Hetzstrecke dichter als 25 u am Wasser**: die Entenjagd war der
     * dichteste Uferlaeufer des ganzen Katalogs, obwohl sie nur 4 % der
     * Strecke ausmacht. Ist die Beute im Wasser und der Fuchs am Ufer, ist der
     * Versuch vorbei - so, wie er im Katalog steht ("versucht es kurz mit
     * ihr").
     */
    if (!ctx.land.walkable(prey.x, prey.y) &&
      ctx.world.query.distToWater(agent.x, agent.y) <= spec.hunt.shore) {
      endHunt(agent, ctx);
      return;
    }
    // Ueber die eigene Grenze hinaus wird nicht verfolgt - jedenfalls nicht
    // weiter als hunt.beyond. Eine Ente, die ueber den See davonschwimmt,
    // zieht den Fuchs sonst am Ufer entlang aus seinem Revier heraus.
    if (beyondRange(agent.territory, agent.x, agent.y) > spec.hunt.beyond) {
      endHunt(agent, ctx);
      return;
    }

    agent.tx = prey.x;
    agent.ty = prey.y;
    var result = A.walkStep(agent, ctx.land, dt,
      A.effectiveSpeed(agent, agent.speedBase), HUNT_TURN, ARRIVE);
    if (result !== 'moving' || agent.stateTimer <= 0) endHunt(agent, ctx);
  }

  /**
   * Sperrzeit nach jeder Hetze. Ohne sie hetzt ein Fuchs, dessen Reviergrenze
   * am Kaninchenbau vorbeifuehrt, die halbe Nacht dasselbe Tier - derselbe
   * Unterschied zwischen "einmal erschrocken" und "Dauerzustand", den das
   * Kaninchen mit seiner Wartezeit im Bau schon einmal geloest hat.
   *
   * Und danach wird getrunken, wenn er ohnehin am Ufer steht: das ist die
   * Zeile "Fuechse trinken gerne mal dann am Wasser" aus data/tiere.md.
   */
  function endHunt(agent, ctx) {
    var spec = agent.spec;
    agent.prey = null;
    agent.huntCooldown = ctx.time + agent.rng.rangeIn(spec.hunt.cooldown);

    var toWater = ctx.world.query.distToWater(agent.x, agent.y);
    if (toWater <= spec.drink.reach && wantsDrink(agent, ctx)) {
      beginDrinking(agent, ctx);
      return;
    }
    chooseTarget(agent, ctx);
  }

  // ----------------------------------------------------------- Bau, Tag

  function goHome(agent, ctx, dt) {
    var spec = agent.spec;

    if (agent.state === S.trinken) { drinkStep(agent, ctx, dt); return; }

    if (agent.state !== S.gehen || agent.goal !== 'heim') {
      agent.goal = 'heim';
      agent.prey = null;
      agent.crossTarget = null;
      var p = restingPlace(ctx, agent.rng, agent.burrow, spec, agent.region,
        agent.territory, 0);
      // Auch der Heimweg ist eine Sehne quer durchs Revier - er wurde
      // gemessen zu 23 % ausserhalb gelaufen, bevor er ueber beginLeg ging.
      beginLeg(agent, ctx, 'heim', p.x, p.y);
    }

    agent.walkTimer -= dt;
    var result = A.walkStep(agent, walkLand(agent, ctx, true), dt,
      A.effectiveSpeed(agent, agent.speedBase), TURN, ARRIVE);

    // Der Knickpunkt eines zweiteiligen Heimwegs zaehlt nicht als angekommen.
    if (result === 'arrived' && agent.legFinal) {
      var f = agent.legFinal;
      agent.legFinal = null;
      setTravel(agent, 'heim', f.x, f.y);
      return;
    }

    // Auf dem Heimweg in eine Sackgasse geraten: einmal freilaufen und den
    // Weg neu ansetzen. Ohne das legt sich der Fuchs in der Enge schlafen -
    // und weil der Bau fest ist, laeuft er am naechsten Abend von dort aus
    // wieder in dieselbe Ecke (derselbe Fall wie beim Reh, js/sim/deer.js).
    if (result === 'blocked' && agent.blocks < 3) {
      agent.blocks++;
      agent.heading += Math.PI + agent.rng.range(-0.6, 0.6);
      return;
    }
    if (result === 'moving') { agent.blocks = 0; return; }

    // Angekommen, oder es geht partout nicht weiter: dann eben hier. Ein
    // Fuchs, der die ganze Nacht laeuft, waere schlimmer als einer, der
    // ausserhalb seines Baus schlaeft.
    if (result !== 'moving' || agent.walkTimer <= 0) {
      agent.state = S.schlafen;
      agent.speedBase = 0;
      agent.goal = null;
      agent.blocks = 0;
    }
  }

  function sleepStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.heading += Math.sin(ctx.time * 0.3 + agent.index) * 0.06 * dt;
    var awake = A.isAwake(ctx.time, spec);
    var settling = A.isSettling(ctx.time, spec, spec.sleep.leaveAt);
    if (awake && !settling) beginNight(agent, ctx);
  }

  /**
   * Der Aufbruch. patrolIndex wird ausdruecklich *nicht* zurueckgesetzt: dass
   * die naechste Teilrunde dort weitergeht, wo die letzte aufgehoert hat, ist
   * der ganze Grund, warum aus zwei Teilrunden je Nacht ueber fuenf Naechte
   * eine geschlossene Blase wird.
   */
  function beginNight(agent, ctx) {
    var spec = agent.spec;
    agent.patrolsDone = 0;
    agent.goal = null;
    agent.crossTarget = null;
    agent.state = S.sichern;
    agent.speedBase = 0;
    agent.stateTimer = agent.rng.rangeIn(spec.sleep.wakeSpread);
  }

  // ------------------------------------------------------------ Reaktion

  /**
   * Geflohen wird vor Groessenklasse >= 4 (Wildschwein, spaeter Baer). Beute
   * loest hier nichts aus: ein Kaninchen ist Groessenklasse 1, eine Ente 2.
   */
  function checkThreat(agent, ctx) {
    var spec = agent.spec;
    if (agent.state === S.fliehen) return false;

    var threat = ctx.nearestDisturber(agent, spec.reaction.fleeRadius * agent.traits.shyness,
      spec.reaction.ignore);
    if (!threat || !threat.spec || threat.spec.size < spec.reaction.fleeFromSize) return false;

    /**
     * Weg vom Stoerer - aber nicht aus dem Revier hinaus. Die Flucht dauert
     * 3-7 s bei 84 u/s und traegt damit weiter, als das Revier breit ist:
     * gemessen war sie die Ursache fuer **die Haelfte aller Austritte**, mehr
     * als Querung, Jagd und Patrouille zusammen. Wer am Rand steht, laeuft
     * deshalb die Grenze entlang statt ueber sie hinweg (bendInward,
     * hoechstens eine Vierteldrehung - der Stoerer bleibt hinter ihm).
     *
     * Nur am Rand: mitten im Revier ist die Fluchtrichtung eine Frage des
     * Stoerers und keine der Geografie.
     */
    agent.fleeAngle = Math.atan2(agent.y - threat.y, agent.x - threat.x);
    if (nearRim(agent, spec.reaction.bendFrom)) {
      agent.fleeAngle = bendInward(agent.territory, agent.x, agent.y, agent.fleeAngle,
        spec.reaction.bendHome);
    }
    agent.heading = agent.fleeAngle;
    agent.state = S.fliehen;
    agent.goal = null;
    agent.prey = null;
    agent.crossTarget = null;
    agent.speedBase = A.drawSpeed(agent, spec, 'fliehen');
    agent.stateTimer = agent.rng.rangeIn(spec.reaction.fleeSeconds);
    return true;
  }

  function fleeStep(agent, ctx, dt) {
    var spec = agent.spec;
    agent.stateTimer -= dt;
    agent.fleeAngle += Math.sin(ctx.time * 1.5 + agent.index) * 0.5 * dt;
    // Am Rand zieht die Richtung waehrend des Laufens weiter nach innen -
    // langsam, damit die Flucht eine Flucht bleibt und keine Wende. Erst
    // dadurch wird aus der Fluchtgeraden ein Bogen, der ins Revier passt:
    // 3-7 s Flucht sind bis zu 660 u, das Revier misst 266-376 u im Radius.
    if (nearRim(agent, spec.reaction.bendFrom)) {
      agent.fleeAngle = bendInward(agent.territory, agent.x, agent.y, agent.fleeAngle,
        spec.reaction.bendRate * dt);
    }
    // Auch die Flucht haelt den Uferstreifen ein: sie war mit 28 % der
    // gesamten Uferstrecke der zweitgroesste Ringzeichner, und ein Fuchs, der
    // vor einer Rotte in einen See laeuft, wird vom Faecher am Ufer entlang
    // geschoben, bis die Fluchtzeit um ist.
    var result = A.roamStep(agent, walkLand(agent, ctx, false), dt,
      A.effectiveSpeed(agent, agent.speedBase), agent.fleeAngle, FLEE_TURN);
    if (result === 'blocked') agent.fleeAngle += 1.1;
    // Nach der Flucht steht der Fuchs womoeglich ausserhalb seines Reviers -
    // beginCross fuehrt ihn dann zuerst wieder hinein.
    if (agent.stateTimer <= 0) beginCross(agent, ctx);
  }

  WL.Brains.fuchs = {
    spawn: spawn,
    update: update,
    // Fuer tools/simtest.js und den Renderer: die Reviergeometrie ist sonst
    // in dieser Datei eingeschlossen.
    inRange: inRange,
    boundaryPoint: boundaryPoint,
    radiusAt: radiusAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
