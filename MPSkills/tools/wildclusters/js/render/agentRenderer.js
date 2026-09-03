/**
 * Tiere, Bewegungsspuren und Tag-/Nacht-Faerbung.
 *
 * Wird als dynamische Ebene in den Renderer gehaengt (setDynamicLayers) und
 * liegt damit ueber dem zwischengespeicherten Bild der statischen Welt. Das
 * Zeichnen laeuft in Weltkoordinaten; Linienbreiten werden durch den Zoom
 * geteilt, damit sie auf dem Bildschirm gleich dick bleiben.
 *
 * Die Spur ist hier die Hauptsache, nicht das Tier: ueber 5 Tage zeigt sie die
 * Stammgewaesser als dichte Knaeuel und die Fluege dazwischen als klare Boegen.
 *
 * Gefaerbt wird nach *Signal*, nicht nach Art: jedes Tier hat seine eigene
 * Farbe, und sobald jemand Tiere zu einem Cluster zusammenzieht, tragen alle
 * Mitglieder dieselbe (setColors, gesetzt von js/ui/signals.js). Die Karte
 * zeigt damit die begonnene Einteilung - das ist der ganze Zweck. Eine Farbe
 * je Art gibt es nicht mehr; sie waere die Loesung der Aufgabe.
 *
 * In der verdeckten Sicht steht zusaetzlich die Kachelnummer am Tier (siehe
 * drawLabel): dort sind alle gleich gross und gleich geformt, und die Farbe
 * allein reicht bei rund vierzig Signalen nicht mehr, um ein Tier auf der
 * Karte seiner Kachel zuzuordnen.
 *
 * Gezeichnet wird die Spur nur so genau, wie der Zoom es hergibt: recording.js
 * haelt sie in mehreren Grobheitsstufen bereit, und gewaehlt wird die
 * groebste, die auf dem Bildschirm nicht weiter als TRAIL_ERROR_PX von der
 * Aufzeichnung abweicht - weniger als die Linie breit ist. In der
 * Gesamtansicht bleibt davon rund ein Drittel der Punkte uebrig.
 *
 * Die fertigen Streckenzuege bleiben als Path2D liegen und wachsen nur am
 * Ende weiter (trailPaths). Das ist der Unterschied zwischen fluessig und
 * zaeh: ein Bild am Ende der fuenf Tage baut sonst rund 280 000 Liniensegmente
 * neu auf, obwohl von einem Bild zum naechsten nur eine Handvoll Punkte
 * dazukommt. Solange die Zeit vorwaerts laeuft und der Zoom steht, kostet ein
 * Bild damit die neuen Punkte und nichts weiter.
 *
 * Warum ein *Pfad* und nicht ein zweites Offscreen-Canvas: die Spuren liegen
 * halbdurchsichtig uebereinander (ein Barsch umrundet sein Gewaesser fuenf
 * Tage lang). Ein einzelnes stroke() ueber den ganzen Streckenzug ergibt dort
 * eine gleichmaessige Flaeche; stueckweise nachgezogen addierte sich das Alpha
 * und das Knaeuel liefe mit der Zeit zu. Der wachsende Pfad behaelt das eine
 * stroke() und damit genau das alte Bild.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var SPRITE_WIDTH = 30;      // Weltunits, in denen ein Tiersprite gezeichnet wird
  var TRAIL_ERROR_PX = 0.5;   // Pixel - so weit darf die Spur von der Aufzeichnung abweichen
  var LABEL_PX = 11;          // Bildschirmpixel - die Nummer bleibt beim Zoomen gleich gross

  function create() {
    var view = {
      sim: null,
      time: 0,
      showTrails: true,
      masked: false,
      _pos: [],
      _order: [],
      _hidden: [],
      _absent: [],
      _selected: [],
      _colors: [],
      _labels: [],
      _burrows: [],
      _paths: []
    };

    view.setSimulation = function (sim) {
      view.sim = sim;
      view._selected = [];
      view._pos = [];
      view._order = [];
      view._hidden = [];
      view._colors = [];
      view._paths = [];
      view._labels = buildLabels(sim);
      view._burrows = collectHomes(sim, 'burrow');
      if (sim) {
        for (var i = 0; i < sim.agents.length; i++) {
          view._pos.push({ x: 0, y: 0, state: 0, heading: 0, airborne: false });
          view._order.push(i);
          view._hidden.push(false);
        }
        // Zeichenreihenfolge nach Ebene: der Barsch schwimmt unter der
        // Wasseroberflaeche, die Ente sitzt darauf, die Fledermaus fliegt
        // spaeter darueber. Die Nummern der Tiere bleiben davon unberuehrt -
        // sie stammen aus der Aufzeichnung und duerfen sich nie verschieben.
        view._order.sort(function (a, b) {
          return layerOf(sim.agents[a]) - layerOf(sim.agents[b]) || a - b;
        });
        view.setTime(view.time);
      }
    };

    view.setTime = function (time) {
      view.time = time;
      if (!view.sim) return;
      for (var i = 0; i < view._pos.length; i++) view.sim.recording.at(i, time, view._pos[i]);
    };

    view.positions = function () { return view._pos; };

    /**
     * Die Auswahl ist eine *Menge* von Tieren, kein einzelnes.
     *
     * Ein Tipp auf eine Kachel meint eines, ein Tipp auf einen Clusterkopf alle
     * seine Mitglieder, und wer gerade etwas zieht, hat genau das ausgewaehlt.
     * Angenommen wird beides - eine Tiernummer oder eine Liste davon -, damit
     * die Karte (immer ein Tier) und die Liste (auch ein ganzes Cluster)
     * dieselbe Tuer benutzen. -1 und die leere Liste heissen "nichts".
     */
    view.setSelection = function (indices) {
      var list = toList(indices);
      // Bewusst duenn besetzt: die Auswahl ist meistens leer oder klein, und
      // ein volles Feld je Tier muesste bei jedem Tipp neu geschrieben werden.
      view._selected = [];
      for (var k = 0; k < list.length; k++) {
        if (list[k] >= 0) view._selected[list[k]] = true;
      }
    };

    view.isSelected = function (index) { return !!view._selected[index]; };

    view.selectedCount = function () {
      var n = 0;
      for (var i = 0; i < view._selected.length; i++) if (view._selected[i]) n++;
      return n;
    };

    /**
     * Eine Farbe je Tier, von der Signalliste gesetzt (js/ui/signals.js).
     *
     * Sie gehoert der Kachelnummer und nicht der Art - und sie aendert sich,
     * sobald jemand Tiere zu einem Cluster zusammenzieht: dann tragen alle
     * Mitglieder die Farbe des Clusters. Genau das macht eine begonnene
     * Gruppierung auf der Karte sichtbar statt nur in der Liste. Der Index ist
     * die Nummer in der Aufzeichnung, damit das Zeichnen nicht umrechnen muss.
     */
    view.setColors = function (colors) { view._colors = colors || []; };

    /**
     * Spuren an oder aus.
     *
     * Aus heisst mehr als "eine Linie weniger": in der offenen Sicht verliert
     * damit auch das Tier selbst seine Signalfarbe (siehe drawAgent). Wer die
     * Spuren wegnimmt, will die Tiere im Augenblick sehen - ein bunter Fleck
     * unter jedem Sprite waere dann der letzte Rest der Gruppierung auf einer
     * Karte, die gerade nichts von ihr zeigen soll. Verdeckt bleibt die Farbe:
     * dort ist das Tier nur ein Punkt, und ohne sie waeren alle gleich.
     */
    view.setTrails = function (flag) { view.showTrails = !!flag; };

    /**
     * Verdeckte Sicht: Landschaft weg, Artfarben weg. Der Renderer laesst
     * dafuer sein statisches Bild aus, diese Ebene malt den einheitlichen
     * Hintergrund selbst - sie ist die einzige, die die Uhrzeit kennt.
     */
    view.setMasked = function (flag) { view.masked = !!flag; };

    /**
     * Ausgeblendete Tiere. Ausgeblendet heisst wirklich unsichtbar: kein
     * Sprite, keine Spur, kein Bau - und unantippbar,
     * denn sonst waehlte ein Tipp ins Leere ein Tier aus, das gar nicht da ist.
     */
    view.isHidden = function (index) { return !!view._hidden[index]; };

    view.setHidden = function (index, flag) {
      if (index < 0 || index >= view._hidden.length) return;
      view._hidden[index] = !!flag;
    };

    view.setAllHidden = function (flag) {
      for (var i = 0; i < view._hidden.length; i++) view._hidden[i] = !!flag;
    };

    /**
     * Welche Tiere gibt es in dieser Phase ueberhaupt? Ein Nachzuegler vor dem
     * Bruch ist nicht ausgeblendet, sondern *nicht da* - deshalb eine eigene
     * Liste und nicht ein gesetztes _hidden. Das Auge darf ihn nicht wieder
     * einblenden, und "alle einblenden" darf ihn nicht hervorzaubern.
     */
    view.setPhase = function (phase) {
      view._absent = [];
      var feat = view.sim && view.sim.featuresByPhase ? view.sim.featuresByPhase[phase] : null;
      if (!view.sim) return;
      for (var i = 0; i < view.sim.agents.length; i++) {
        view._absent.push(feat ? !feat.agents[i].present : false);
      }
    };

    /** Naechstes Tier zu einem Weltpunkt, oder -1. */
    view.pick = function (x, y, radius) {
      var best = -1;
      var bestDist = radius * radius;
      for (var i = 0; i < view._pos.length; i++) {
        if (gone(view, i)) continue;
        var p = view._pos[i];
        var d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    view.draw = function (ctx, world, rect, scale) {
      drawBackdrop(ctx, rect, view.time, view.masked);
      if (!view.sim) return;
      var agents = view.sim.agents;
      var order = view._order;
      var i, k;

      drawBurrows(ctx, visibleHomes(view, view._burrows), view.masked);

      if (view.showTrails) {
        // Zwei Durchgaenge: erst alles Uebrige, dann die Auswahl. Die kraeftige
        // Spur gehoert nach oben - bei einem ganzen ausgewaehlten Cluster
        // zeichnete sonst das naechstbeste andere Tier sie wieder zu.
        for (k = 0; k < order.length; k++) {
          i = order[k];
          if (!view._selected[i] && !gone(view, i)) drawTrail(ctx, view, i, scale, false);
        }
        for (k = 0; k < order.length; k++) {
          i = order[k];
          if (view._selected[i] && !gone(view, i)) drawTrail(ctx, view, i, scale, true);
        }
      }

      // Ohne Spuren traegt in der offenen Sicht auch das Tier keine
      // Signalfarbe mehr - tint bleibt dann leer und drawAgent greift zum
      // farblosen Ton. Verdeckt bleibt die Farbe immer: sie ist dort alles,
      // was ein Tier von einem anderen unterscheidet.
      var colored = view.masked || view.showTrails;
      for (k = 0; k < order.length; k++) {
        i = order[k];
        if (gone(view, i)) continue;
        drawAgent(ctx, agents[i], view._pos[i], scale, !!view._selected[i], view.masked,
          colored ? colorOf(view, i) : null);
      }

      // Die Nummern zuletzt und in einem eigenen Durchgang: sonst deckt das
      // naechste Tier die Zahl des vorigen zu, und gerade dort, wo mehrere
      // beieinanderstehen, ist sie am noetigsten.
      if (view.masked) {
        for (k = 0; k < order.length; k++) {
          i = order[k];
          if (gone(view, i)) continue;
          drawLabel(ctx, view._labels[i], view._pos[i], scale, colorOf(view, i));
        }
      }
    };

    return view;
  }

  /**
   * -1, eine Tiernummer oder eine Liste davon - alles wird zur Liste. Die
   * Karte kennt nur einzelne Tiere, die Signalliste auch ganze Cluster; beide
   * sollen dieselbe Tuer benutzen, statt sich vorher abzustimmen.
   */
  function toList(value) {
    if (value == null) return [];
    if (typeof value === 'number') return value >= 0 ? [value] : [];
    return value;
  }

  /** Die Signal- bzw. Clusterfarbe dieses Tieres. */
  /**
   * Nicht auf der Karte - aus dem einen oder dem anderen Grund.
   *
   * Zwei verschiedene Sachverhalte mit demselben sichtbaren Ergebnis: das Auge
   * hat das Tier ausgeblendet, oder es ist in dieser Phase noch nicht da. Weil
   * das Ergebnis dasselbe ist (kein Sprite, keine Spur, kein Bau, nicht
   * antippbar), fragt der Renderer an *einer* Stelle danach - sonst waere die
   * naechste Zeichenschleife die, in der einer der beiden Faelle vergessen
   * wird.
   */
  function gone(view, index) {
    return !!view._hidden[index] || !!view._absent[index];
  }

  function colorOf(view, index) {
    return view._colors[index] || WL.PALETTE.signals.fallback;
  }

  /**
   * Die Kachelnummer je Tier, fertig ausgeschrieben ("07").
   *
   * Sie kommt aus sim.signalOf und wird genauso aufgefuellt wie in der Liste
   * (js/ui/signals.js) - eine "7" auf der Karte neben einer "07" in der Liste
   * waere zwei Nummern fuer dasselbe Tier. Einmal beim Setzen der Simulation
   * gerechnet, nicht je Bild: das sind bis zu 53 Zeichenketten pro Frame.
   */
  function buildLabels(sim) {
    var out = [];
    if (!sim) return out;
    var count = sim.agents.length;
    var width = Math.max(2, String(count).length);
    for (var i = 0; i < count; i++) {
      var signal = sim.signalOf ? sim.signalOf[i] : i;
      var s = String(signal + 1);
      while (s.length < width) s = '0' + s;
      out.push(s);
    }
    return out;
  }

  function layerOf(agent) {
    return agent.spec && agent.spec.layer != null ? agent.spec.layer : 1;
  }

  // ------------------------------------------------------------------ Bau

  /**
   * Ortsfeste Anlagen der Tiere: der Bau der Kaninchen. Er steht nicht in
   * world.objects - der Weltgenerator kennt ihn nicht, die Simulation setzt
   * ihn - und wird deshalb aus den Tieren selbst eingesammelt statt geplant
   * durchgereicht. Das Fuchsrevier ist bewusst *keine* solche Anlage: es
   * steuert das Verhalten, wird aber nicht gezeichnet - eine sichtbare
   * Grenze verriete die Art, nach der spaeter gruppiert werden soll.
   *
   * Gezeichnet werden sie hier und nicht im Terrain-Cache, weil sie zur
   * Simulation gehoeren: eine neue Welt hat andere, dieselbe Welt immer
   * dieselben.
   *
   * Mitgefuehrt werden die Besitzer, weil ein ausgeblendetes Tier sonst durch
   * seinen Bau doch noch auf der Karte staende. Mehrere Kaninchen teilen sich
   * einen Bau - der verschwindet erst, wenn alle ausgeblendet sind.
   */
  function collectHomes(sim, key) {
    var out = [];
    if (!sim) return out;
    for (var i = 0; i < sim.agents.length; i++) {
      var item = sim.agents[i][key];
      if (!item) continue;
      var found = -1;
      for (var k = 0; k < out.length; k++) if (out[k].item === item) { found = k; break; }
      if (found < 0) out.push({ item: item, owners: [i] });
      else out[found].owners.push(i);
    }
    return out;
  }

  /** Nur die Anlagen, von denen mindestens ein Besitzer sichtbar ist. */
  function visibleHomes(view, homes) {
    var out = [];
    for (var i = 0; i < homes.length; i++) {
      var owners = homes[i].owners;
      for (var k = 0; k < owners.length; k++) {
        if (!gone(view, owners[k])) { out.push(homes[i].item); break; }
      }
    }
    return out;
  }

  function drawBurrows(ctx, burrows, masked) {
    // In der verdeckten Sicht bleibt der Bau ganz weg. Er war dort ein
    // ortsfester Punkt, den kein anderes Tier hat - also ein Artmerkmal, das
    // die Kaninchen auf einen Blick aus der Gruppierungsaufgabe herausnahm.
    // Ihr Verhalten verraet sich ohnehin: die Spur laeuft immer wieder auf
    // dieselbe Stelle zu, und genau danach soll gesucht werden.
    if (masked || !burrows.length) return;
    var c = WL.PALETTE.burrow;
    for (var i = 0; i < burrows.length; i++) {
      var b = burrows[i];
      ctx.fillStyle = c.shadow;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 2, 15, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Aufgeworfene Erde um ein dunkles Loch - aus der Vogelperspektive ist
      // das alles, was man von einem Bau sieht.
      ctx.fillStyle = c.rim;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 13, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.hole;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - 0.5, 7.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- Nacht

  /**
   * Offene Sicht: ein kuehler Schleier ueber der Landschaft, je dunkler, desto
   * spaeter. Verdeckte Sicht: derselbe Tagesverlauf, aber als deckende Flaeche -
   * von der Welt bleibt dann nur noch die Uhrzeit uebrig.
   */
  function drawBackdrop(ctx, rect, time, masked) {
    var daylight = WL.SimTime.daylight(time);
    if (masked) {
      ctx.fillStyle = WL.PALETTE.masked.skyAt(daylight);
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      return;
    }
    var alpha = (1 - daylight) * WL.PALETTE.night.maxAlpha;
    if (alpha <= 0.002) return;
    ctx.fillStyle = 'rgba(' + WL.PALETTE.night.tint + ', ' + alpha.toFixed(3) + ')';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // ----------------------------------------------------------------- Spur

  function drawTrail(ctx, view, agentIndex, scale, strong) {
    var rec = view.sim.recording;
    // Die Grobheit der Spur folgt dem Zoom: erlaubt ist eine Abweichung von
    // einem halben Bildschirmpixel, also weniger als die Linie breit ist.
    var tolerance = TRAIL_ERROR_PX / scale;
    var upTo = rec.trailLengthAt(agentIndex, view.time, tolerance);
    if (upTo < 2) return;

    var paths = trailPaths(view, agentIndex, tolerance, upTo);
    if (!paths) return;
    var color = colorOf(view, agentIndex);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Der dunkle Saum unter der Linie, und zwar in *beiden* Sichten. Frueher
    // war er nur verdeckt noetig, weil die Artfarben von Hand auf ihren
    // Untergrund abgestimmt waren (Barschbeere auf Wasser, Rehviolett auf
    // Gruen). Die Signalfarbe kennt ihren Untergrund nicht - sie gehoert einer
    // Nummer - und liegt mal auf Gras, mal auf Wasser, mal auf dem
    // Daemmerungshimmel. Der Saum ist der Preis dafuer.
    strokePath(ctx, paths.all, WL.PALETTE.masked.halo, (strong ? 3.6 : 2.3) / scale,
      strong ? 0.5 : 0.16);

    if (view.masked) {
      // Ein einziger Zug ueber alle Stuecke: haette der Flug einen eigenen
      // Linienstil, waere die Bewegungsart schon abgelesen, bevor jemand die
      // Spur betrachtet hat.
      strokePath(ctx, paths.all, color, (strong ? 2.2 : 1.1) / scale, strong ? 0.95 : 0.42);
      return;
    }

    // Offen darf der Flug sich abheben - aber in derselben Farbe, nur heller:
    // eine zweite Farbe waere eine zweite Zuordnung, und die Kachel hat nur
    // eine.
    strokePath(ctx, paths.ground, color, (strong ? 2.2 : 1.0) / scale, strong ? 0.9 : 0.36);
    strokePath(ctx, paths.air, WL.PALETTE.lighten(color, 0.45), (strong ? 2.0 : 1.0) / scale,
      strong ? 0.95 : 0.45);
  }

  function strokePath(ctx, path, color, width, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }

  /**
   * Die drei Streckenzuege eines Tieres bis zum Abspielkopf: alle Stuecke
   * (Saum und verdeckte Sicht), nur Boden und nur Flug (offene Sicht).
   *
   * Sie werden aufbewahrt und wachsen mit der Zeit weiter. Neu gebaut wird nur,
   * wenn der Zoom eine andere Grobheitsstufe der Spur verlangt oder wenn die
   * Spur kuerzer geworden ist - also beim Zurueckspringen. Die Pfade stehen in
   * Weltkoordinaten; Verschieben der Karte laesst sie unberuehrt.
   *
   * Die Stufe und nicht der Zoom ist der Schluessel: sonst wuerde waehrend
   * jeder Pinch-Geste in jedem Bild alles verworfen, obwohl sich an der
   * gezeichneten Linie nichts aendert.
   *
   * Ohne Path2D gibt es keine Spuren. Denselben Weg geht core/contour.js, und
   * ohne sie stuende ohnehin schon die Landschaft nicht auf dem Bild.
   */
  function trailPaths(view, agentIndex, tolerance, upTo) {
    if (typeof Path2D === 'undefined') return null;
    var level = view.sim.recording.trailLevel(tolerance);
    var cached = view._paths[agentIndex];

    if (!cached || cached.level !== level || cached.upTo > upTo) {
      cached = view._paths[agentIndex] = {
        level: level,
        upTo: 1,
        all: newPen(),
        ground: newPen(),
        air: newPen()
      };
    }
    if (cached.upTo < upTo) {
      extend(cached, view.sim.recording.trailAt(agentIndex, tolerance), upTo);
      cached.upTo = upTo;
    }
    return { all: cached.all.path, ground: cached.ground.path, air: cached.air.path };
  }

  function newPen() {
    return { path: new Path2D(), open: false };
  }

  /** Die Segmente von cached.upTo bis upTo an die drei Pfade anhaengen. */
  function extend(cached, trail, upTo) {
    for (var i = cached.upTo; i < upTo; i++) {
      var x0 = trail.xs[i - 1], y0 = trail.ys[i - 1];
      var x1 = trail.xs[i], y1 = trail.ys[i];
      var isAir = trail.air[i] === 1 || trail.air[i - 1] === 1;
      addSegment(cached.all, x0, y0, x1, y1);
      // Das jeweils andere Stueck bekommt eine Luecke: Boden- und Flugbahn
      // sind zwei Streckenzuege durch dieselbe Punktfolge, nicht einer.
      (isAir ? cached.ground : cached.air).open = false;
      addSegment(isAir ? cached.air : cached.ground, x0, y0, x1, y1);
    }
  }

  /**
   * Ausgeduennt wird hier nichts mehr: das erledigt die Grobheitsstufe der
   * Spur (recording.js), und zwar nach dem senkrechten Abstand zur Sehne statt
   * nach der Schrittlaenge. Der alte Filter nach Bildschirmabstand liess eine
   * lange gerade Flugbahn vollstaendig stehen - genau dort, wo zwei Punkte
   * gereicht haetten.
   */
  function addSegment(pen, x0, y0, x1, y1) {
    if (!pen.open) {
      pen.path.moveTo(x0, y0);
      pen.open = true;
    }
    pen.path.lineTo(x1, y1);
  }

  // ----------------------------------------------------------------- Tier

  /**
   * tint === null heisst "dieses Tier hat gerade keine Farbe" (offene Sicht
   * ohne Spuren). Der Fleck unter dem Sprite faellt dann weg, und die neutrale
   * Form nimmt den farblosen Ton - eine Signalfarbe waere hier eine Zuordnung,
   * die auf dieser Karte sonst nirgends mehr steht.
   */
  function drawAgent(ctx, agent, pos, scale, selected, masked, tint) {
    var spec = agent.spec;
    var color = tint || WL.PALETTE.agents.plain;
    // Im Flug etwas groesser und mit Schatten darunter: so ist ohne Legende
    // klar, dass das Tier gerade ueber Land zieht. Das bleibt auch in der
    // verdeckten Sicht sichtbar - Fliegen ist Verhalten. Die Koerpergroesse
    // dagegen ist ein Artmerkmal und faellt dort weg: alle gleich gross.
    var base = masked ? 0.82 : (0.72 + spec.size * 0.14);
    var size = SPRITE_WIDTH * base * (pos.airborne ? 1.15 : 1);

    if (pos.airborne) {
      ctx.fillStyle = masked ? WL.PALETTE.masked.halo : WL.PALETTE.agents.shadow;
      ctx.save();
      ctx.globalAlpha = masked ? 0.3 : 1;
      ctx.beginPath();
      ctx.ellipse(pos.x + size * 0.16, pos.y + size * 0.30, size * 0.26, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (selected) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = WL.PALETTE.agents.selectionEdge;
      ctx.lineWidth = 3.4 / scale;
      ctx.stroke();
      ctx.strokeStyle = WL.PALETTE.agents.selection;
      ctx.lineWidth = 1.8 / scale;
      ctx.stroke();
    }

    // In der verdeckten Sicht nie ein Sprite: das Bild eines Fuchses waere die
    // Antwort. Der Schalter N (Sprite/neutral) bleibt davon unberuehrt.
    var image = (!masked && WL.Sprites) ? WL.Sprites.get(agent.speciesId) : null;

    // Unter dem Sprite ein Fleck in der Signalfarbe. Ohne ihn traegt die
    // offene Sicht die Farbe nur in der Spur, und das Tier selbst - der Punkt,
    // an dem die Zeit gerade steht - waere das einzige, was sich nicht der
    // Kachel zuordnen laesst.
    if (image && tint) {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, size * 0.40, size * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    // Das Sprite ist eine Seitenansicht nach links. Statt es zu drehen (was
    // von oben falsch aussaehe) wird es gespiegelt, sobald das Tier nach
    // rechts zieht - dieselbe Loesung wie in jedem 2D-Spiel.
    if (Math.cos(pos.heading) > 0) ctx.scale(-1, 1);

    if (image) {
      var h = size * image.height / image.width;
      ctx.drawImage(image, -size / 2, -h / 2, size, h);
    } else if (masked) {
      drawSilhouette(ctx, size, color);
    } else {
      drawNeutral(ctx, color, size);
    }
    ctx.restore();
  }

  /**
   * Die Kachelnummer neben dem Tier - nur in der verdeckten Sicht.
   *
   * Dort sind alle Tiere gleich gross und gleich geformt; die Farbe allein
   * traegt die Zuordnung zur Liste, und bei rund vierzig Signalen liegen
   * benachbarte Farbtoene dicht genug beieinander, dass "welche Nummer ist
   * das?" auf der Karte nicht mehr sicher zu beantworten ist. Die Zahl macht
   * daraus wieder eine Antwort - und sie verraet nichts, denn sie ist genau
   * das, was auch auf der Kachel steht. In der offenen Sicht bleibt sie weg:
   * dort steht das Sprite fuer sich, und vierzig Zahlen ueber der Landschaft
   * waeren nur Rauschen.
   *
   * Schriftgroesse und Abstand rechnen in Bildschirmpixeln (geteilt durch den
   * Zoom), sonst waere die Zahl herausgezoomt groesser als das Tier darunter.
   */
  function drawLabel(ctx, text, pos, scale, tint) {
    if (!text) return;
    var size = SPRITE_WIDTH * 0.82 * (pos.airborne ? 1.15 : 1);
    // Mindestens ein fester Abstand ueber der Mitte, bei starkem Zoom aber
    // ueber dem Koerper - sonst liegt die Zahl irgendwann mitten im Tier.
    var dy = Math.max(LABEL_PX * 0.9, size * 0.55 * scale) / scale;

    ctx.font = 'bold ' + (LABEL_PX / scale) + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Derselbe dunkle Saum wie unter der Spur, aus demselben Grund: die Farbe
    // gehoert der Nummer und kennt ihren Untergrund nicht - der Himmel
    // durchlaeuft in der Daemmerung genau ihre eigene Helligkeit.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.8 / scale;
    ctx.strokeStyle = WL.PALETTE.masked.halo;
    ctx.strokeText(text, pos.x, pos.y - dy);
    ctx.fillStyle = tint;
    ctx.fillText(text, pos.x, pos.y - dy);
  }

  /**
   * Die Form der neutralen Figur, aber flach in einer Farbe - erkennbar als
   * Tier und als Blickrichtung, sonst nichts. Die Farbe ist die des Signals
   * und nicht die der Art: sie sagt "das ist Nummer 17", nicht "das ist ein
   * Fuchs". Zweimal gezeichnet: erst etwas groesser im dunklen Saum, damit die
   * Figur auch auf dem hellen Mittagshimmel eine Kante hat.
   */
  function drawSilhouette(ctx, size, tint) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = WL.PALETTE.masked.halo;
    body(size * 1.16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint;
    body(size);
    ctx.restore();

    function body(s) {
      var r = s * 0.30;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.66, 0, 0, Math.PI * 2);
      ctx.moveTo(-r * 0.32, -r * 0.30);
      ctx.arc(-r * 0.72, -r * 0.30, r * 0.40, 0, Math.PI * 2);
      // Der Schnabel laeuft in derselben Richtung um wie Rumpf und Kopf -
      // gegenlaeufig loeschte er beim Fuellen (nonzero) das Stueck Kopf weg,
      // das er ueberlappt.
      ctx.moveTo(-r * 1.05, -r * 0.30);
      ctx.lineTo(-r * 1.02, -r * 0.06);
      ctx.lineTo(-r * 1.48, -r * 0.16);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Neutrale Form: erkennbar als Tier, aber ohne Artmerkmale. Fuer die
   * Spielphase, in der nach Verhalten gruppiert werden soll und ein Entenbild
   * die Antwort verraten wuerde.
   *
   * Die drei Toene fuer Rumpf, Bauch und Kopf werden aus der einen
   * Signalfarbe gerechnet statt aus einer Tabelle geholt: die Farbe wechselt
   * mit jeder Gruppierung, und eine Tabelle muesste bei jeder Aenderung
   * mitgepflegt werden.
   */
  function drawNeutral(ctx, tint, size) {
    var r = size * 0.30;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WL.PALETTE.lighten(tint, 0.55);
    ctx.beginPath();
    ctx.ellipse(r * 0.12, r * 0.16, r * 0.62, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WL.PALETTE.darken(tint, 0.26);
    ctx.beginPath();
    ctx.arc(-r * 0.72, -r * 0.30, r * 0.40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WL.PALETTE.darken(tint, 0.62);
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, -r * 0.30);
    ctx.lineTo(-r * 1.48, -r * 0.16);
    ctx.lineTo(-r * 1.02, -r * 0.06);
    ctx.closePath();
    ctx.fill();
  }

  WL.AgentRenderer = { create: create, SPRITE_WIDTH: SPRITE_WIDTH };
})(typeof window !== 'undefined' ? window : globalThis);
