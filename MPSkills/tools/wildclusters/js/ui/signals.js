/**
 * Die Signalliste rechts neben der Karte - und die Gruppierung darin.
 *
 * Ein "Signal" ist ein Tier, aber ohne alles, was es verraten wuerde: keine
 * Art, kein Bild, kein Name - nur eine Nummer und eine Farbe. Zwei Dinge
 * halten die Aufgabe offen:
 *
 *   - Die Nummern stehen sortiert (01, 02, 03 ...), die *Tiere dahinter sind
 *     gemischt* (sim.signalOrder). In agents liegen sie nach Arten sortiert;
 *     ungemischt staenden die Artgruppen als Bloecke untereinander und die
 *     Loesung waere abgelesen.
 *   - Die Farbe gehoert der Nummer, nicht der Art. Sie ist das Band zwischen
 *     Liste und Karte: dieselbe Farbe traegt dort die Spur und das Tier.
 *
 * Gruppiert wird per Ziehen: eine Kachel auf eine andere ergibt ein Cluster,
 * weitere Kacheln und ganze Cluster lassen sich hineinziehen, einzelne Tiere
 * wieder herausziehen. Alle Mitglieder eines Clusters tragen dessen Farbe -
 * damit ist die begonnene Einteilung auf der Karte zu sehen und nicht nur in
 * der Liste. Die Regeln des Zusammenfuegens stehen in js/ui/clusters.js; hier
 * liegt nur das Ziehen und das Zeichnen.
 *
 * Gezogen wird ueber Pointer-Events, nicht ueber HTML5-Drag-and-Drop: das
 * kennt der Finger nicht, und das Geraet ist ein Tablet. Die Kacheln stehen
 * deshalb auf touch-action: pan-y - senkrecht scrollt weiter die Liste,
 * waagerecht beginnt das Ziehen.
 *
 * Die Auswahl ist eine Menge und kein einzelnes Tier: eine Kachel meint eines,
 * ein Clusterkopf alle seine Mitglieder, und was gerade gezogen wird, ist
 * ausgewaehlt. Auf der Karte heisst ausgewaehlt "kraeftige Spur und Ring" -
 * damit laesst sich eine begonnene Gruppe als Gruppe pruefen, statt ihre
 * Mitglieder einzeln nacheinander anzusehen.
 *
 * Sichtbarkeit liegt nicht hier, sondern im AgentRenderer; dieses Modul meldet
 * nur, was angetippt wurde, und richtet sein Aussehen danach aus.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var EYE_SVG =
    '<svg class="eye" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="eye-lid" d="M1.8 12S5.6 5.8 12 5.8 22.2 12 22.2 12 18.4 18.2 12 18.2 1.8 12 1.8 12z"/>' +
    '<circle class="eye-pupil" cx="12" cy="12" r="2.7"/>' +
    '<line class="eye-slash" x1="4.2" y1="19.8" x2="19.8" y2="4.2"/>' +
    '</svg>';

  // Ab hier ist eine Fingerbewegung gemeint und kein Wackeln beim Tippen.
  var DRAG_THRESHOLD = 7;

  /*
   * Der zweite Weg in die Geste: stillhalten.
   *
   * Waagerecht zu ziehen war lange der einzige - senkrecht gehoert dem
   * Blaettern der Liste (touch-action: pan-y), und der Browser nimmt uns die
   * Geste weg, sobald er sie fuer ein Blaettern haelt. Nur liegen die Cluster
   * OBEN und die freien Kacheln darunter: das Ziehen, das die Aufgabe verlangt,
   * geht damit fast immer nach oben, und genau das ging nicht.
   *
   * Wer 220 ms aufsetzt, ohne zu wandern, hat kein Blaettern gemeint. Der
   * Browser hat zu diesem Zeitpunkt noch nichts angefangen (der Finger stand),
   * und ab hier haelt der touchmove-Zuhoerer weiter unten das Blaettern auf.
   * Danach zaehlt jede Richtung.
   */
  var HOLD_MS = 220;
  // Wie weit der Finger dabei wandern darf. Grosszuegiger als die Schwelle
  // oben: hier soll nur "der wollte blaettern" erkannt werden.
  var HOLD_SLOP = 9;

  /*
   * Wo ueberall nachgesehen wird, ob dort etwas liegt, worauf sich ablegen
   * laesst (Bildschirmpixel um den Finger herum).
   *
   * Der Punkt unter dem Finger allein war zu streng: zwischen zwei Kacheln
   * liegt der freie Bereich, und der nimmt von einer freien Kachel nichts an -
   * ein Ablegen zwei Pixel neben dem Ziel tat dann gar nichts, und das sah aus
   * wie ein Aussetzer. Gesucht wird nur weiter, wenn unter dem Finger nichts
   * Zustaendiges liegt; eine ausdrueckliche Absage (die eigene Kachel, das
   * eigene Cluster) bleibt eine Absage.
   */
  var PROBE = [[0, 0], [0, -14], [0, 14], [-14, 0], [14, 0]];

  /**
   * @param elements  { grid, allBtn }
   * @param callbacks { onSelect(agentIndices),
   *                    onVisibility(agentIndices|null, hidden),
   *                    onColors(colorsByAgentIndex),
   *                    onClusters(groups),
   *                    onDrag(active) }
   *                  agentIndices === null bei onVisibility meint "alle";
   *                  bei onSelect ist die leere Liste "nichts ausgewaehlt".
   *                  onDrag meldet Beginn und Ende einer Ziehgeste.
   *                  onClusters meldet die Gruppierung, sobald sie sich
   *                  aendert - siehe panel.groups().
   */
  function create(elements, callbacks) {
    var grid = elements.grid;
    var allBtn = elements.allBtn;
    var onSelect = (callbacks && callbacks.onSelect) || function () {};
    var onVisibility = (callbacks && callbacks.onVisibility) || function () {};
    var onColors = (callbacks && callbacks.onColors) || function () {};
    var onClusters = (callbacks && callbacks.onClusters) || function () {};
    var onDrag = (callbacks && callbacks.onDrag) || function () {};

    var model = WL.Clusters.create();
    var order = [];        // Signal -> Tier (gemischt)
    var signalOf = [];     // Tier -> Signal
    var hidden = [];       // je Signal, Spiegel des Renderer-Zustands
    var tiles = [];        // je Signal { root, pick, eye }
    var boxes = [];        // je Cluster { group, root, head, eye, count }
    var looseZone = null;  // der freie Bereich - Ablegen dort loest heraus
    var selected = [];     // je Signal (nicht Tier): gehoert es zur Auswahl?
    var labelWidth = 2;
    var drag = null;
    var suppressClick = false;
    // Wie viele Kacheln gerade zu sehen sind. In Phase 1 der Startbestand, in
    // Phase 2 alle. Die Nachzuegler stehen hinten in der Mischung, deshalb ist
    // "die ersten n" hier eine vollstaendige Antwort und kein Filter.
    var shownCount = 0;
    var baseCount = 0;
    // Die Nachzuegler als Signalnummern, und ob sie schon zusammengefasst
    // wurden. Beides gehoert zur Welt und nicht zur Phase: einmal
    // auseinandergenommen bleiben sie auseinander.
    var newcomers = [];
    var newcomersGrouped = false;

    var panel = {};

    /** Baut die Liste neu auf - eine Kachel je Tier der Aufzeichnung. */
    panel.setSimulation = function (sim) {
      var count = sim ? sim.agents.length : 0;
      order = [];
      signalOf = [];
      hidden = [];
      selected = [];

      for (var i = 0; i < count; i++) {
        // Ohne Mischung aus der Simulation waere die Reihenfolge die der
        // Arten - die Liste faellt dann auf 01..N zurueck, aber die Aufgabe
        // waere geschenkt. Deshalb ist das ein Rueckfall, kein Normalfall.
        order.push(sim.signalOrder ? sim.signalOrder[i] : i);
        hidden.push(false);
      }
      for (var k = 0; k < count; k++) signalOf[order[k]] = k;

      // Zweistellig, solange es reicht: "01" neben "40" liest sich als Liste,
      // "1" neben "40" als Zufall.
      labelWidth = Math.max(2, String(count).length);
      // Die Farben werden ueber *alle* Tiere gebaut, auch die noch nicht
      // sichtbaren. Sonst rechnete der goldene Winkel in Phase 2 mit einer
      // anderen Anzahl, und saemtliche Kacheln bekaemen am Bruch neue Farben -
      // eine begonnene Gruppierung waere auf der Karte nicht wiederzufinden.
      model.setCount(count, WL.PALETTE.signals.build(count));
      baseCount = sim && sim.baseCount != null ? sim.baseCount : count;
      shownCount = baseCount;

      // Die Nachzuegler kommen als Tiernummern herein; gerechnet wird hier in
      // Signalnummern. Sortiert, damit der Kasten sie in derselben Ordnung
      // zeigt wie jedes andere Cluster.
      newcomers = [];
      newcomersGrouped = false;
      var late = (sim && sim.newcomers) || [];
      for (var n = 0; n < late.length; n++) {
        if (signalOf[late[n]] != null) newcomers.push(signalOf[late[n]]);
      }
      newcomers.sort(function (a, b) { return a - b; });

      render();
      publishColors();
      return count;
    };

    /**
     * Die Nachzuegler dazunehmen (Phase 2) oder wieder wegnehmen (Phase 1).
     *
     * An der bereits geleisteten Arbeit aendert sich nichts: Reihenfolge,
     * Farben und die gebildeten Cluster bleiben, wie sie sind. Genau darauf
     * kommt es an - die Klasse hat in Phase 1 gruppiert, und das muss den
     * Bruch ueberleben.
     *
     * Dazu kommt *ein* neuer Kasten: die Nachzuegler, zusammen und in einer
     * Farbe, die keine Kachel haben kann (WL.PALETTE.signals.newcomer). Unter
     * vierzig bekannten Signalen faende man fuenf neue sonst nur, indem man
     * die Nummern von hinten durchgeht. Sie sind dabei ausgewaehlt, also auf
     * der Karte hervorgehoben - die zweite Aufgabe faengt mit der Frage an,
     * wohin sie gehoeren, und die stellt sich am besten an ihren Spuren.
     *
     * Zusammengeschoben wird genau einmal je Welt: wer sie danach auseinander
     * nimmt, soll sie beim naechsten Umschalten nicht wieder als Haufen
     * vorfinden.
     */
    panel.setPhase = function (phase) {
      shownCount = phase > 0 ? order.length : baseCount;
      var formed = false;
      if (phase > 0 && !newcomersGrouped && newcomers.length >= 2) {
        newcomersGrouped = true;
        formed = model.formGroup(newcomers, WL.PALETTE.signals.newcomer) >= 0;
      }
      render();
      if (!formed) return;
      publishColors();
      report(newcomers);
    };

    /**
     * Kommt von aussen: die Auswahl kann auch auf der Karte entstehen. Sie ist
     * eine Menge - ein einzelnes Tier von der Karte, ein ganzes Cluster aus der
     * Liste. Herein kommen Tiernummern, gerechnet wird in Signalnummern.
     */
    panel.setSelection = function (agentIndices) {
      var list = toList(agentIndices);
      selected = [];
      var first = -1;
      for (var k = 0; k < list.length; k++) {
        var s = signalOf[list[k]];
        if (s == null) continue;
        selected[s] = true;
        if (first < 0 || s < first) first = s;
      }
      updateAll();
      // Waehrend eines Ziehvorgangs nicht scrollen: die Auswahl folgt dort dem,
      // was gerade in der Hand liegt - die Liste unter dem Finger wegzuziehen
      // brauchte niemand.
      var tile = (first >= 0 && !drag) ? tiles[first] : null;
      if (tile && tile.root.scrollIntoView) tile.root.scrollIntoView({ block: 'nearest' });
    };

    panel.setHidden = function (agentIndex, flag) {
      var s = signalOf[agentIndex];
      if (s == null) return;
      hidden[s] = !!flag;
      updateAll();
    };

    panel.isHidden = function (agentIndex) {
      var s = signalOf[agentIndex];
      return s == null ? false : !!hidden[s];
    };

    /** Die Gruppierung, wie sie gerade steht - fuer Konsole und Auswertung. */
    panel.clusters = function () { return model; };

    /**
     * Die Gruppierung zum Mitnehmen: eine Liste aus { m: Signalnummern,
     * c: Farbe }.
     *
     * Zwei Entscheidungen daran sind nicht offensichtlich.
     *
     * **Signalnummern und nicht Tiernummern.** Sonst spricht diese Datei nach
     * aussen ausschliesslich in Tiernummern (siehe Kopf) - hier nicht, und aus
     * einem Grund: was herausgeht, geht bei applyGroups genau so wieder hinein,
     * und das Modell rechnet in Signalnummern. Eine Umrechnung hin und zurueck
     * haette zwei Stellen, an denen sie falsch sein kann, ohne dass irgendwer
     * etwas davon haette. Beides ist ohnehin dasselbe Tier: die Zuordnung
     * kommt aus dem Seed und ist auf jedem Geraet dieselbe.
     *
     * **Die Farbe steht dabei.** Beim Zusammenfuegen gewinnt die Farbe des
     * Ziels - aus den Mitgliedern allein waere sie nicht zurueckzurechnen, und
     * ein Haufen, der beim Wiederherstellen die Farbe wechselt, ist fuer den,
     * der ihn gebaut hat, ein anderer Haufen.
     */
    panel.groups = function () {
      var out = [];
      var groups = model.groups();
      for (var i = 0; i < groups.length; i++) {
        out.push({ m: groups[i].members.slice(), c: groups[i].color });
      }
      return out;
    };

    /**
     * Eine Gruppierung von aussen auflegen - der Weg zurueck fuer eine Welt,
     * die schon einmal bearbeitet wurde (Wechsel zwischen den Welten eines
     * Raums, ein Neuladen, ein zweites Geraet), und der Weg, auf dem am Beamer
     * die Arbeit einer Schuelerin sichtbar wird.
     *
     * Ersetzt und ergaenzt nicht: was hier hereinkommt, ist der ganze Stand.
     * Ein Rest von vorher waere eine Gruppierung, die nie jemand gebildet hat.
     */
    panel.applyGroups = function (list) {
      model.clear();
      for (var i = 0; i < (list || []).length; i++) {
        var g = list[i] || {};
        model.formGroup(g.m || g.members || [], g.c || g.color || null);
      }
      render();
      publishColors();
    };

    // ------------------------------------------------------------ Aufbau

    function render() {
      grid.textContent = '';
      tiles = [];
      boxes = [];
      for (var i = 0; i < order.length; i++) tiles.push(null);

      var groups = model.groups();
      for (var g = 0; g < groups.length; g++) {
        var box = buildCluster(groups[g]);
        if (box) grid.appendChild(box);
      }

      looseZone = document.createElement('div');
      looseZone.className = 'loose';
      looseZone.setAttribute('data-drop', 'frei');
      var loose = model.loose();
      for (var k = 0; k < loose.length; k++) {
        if (loose[k] >= shownCount) continue;   // Nachzuegler, noch nicht da
        looseZone.appendChild(buildTile(loose[k]));
      }
      grid.appendChild(looseZone);

      updateAll();
    }

    /**
     * Ein Cluster ist ein Kasten mit eigenem Kopf: dort steht, wie viele
     * Signale darin liegen, und dort sitzt das Auge, das alle auf einmal
     * ausblendet. Der Kopf ist zugleich der Griff - am Kasten selbst zu
     * ziehen wuerde mit dem Ziehen der Kacheln darin kollidieren.
     *
     * Und er ist der Schalter: getippt hebt er alle Mitglieder auf der Karte
     * hervor. Genau dafuer ist ein Cluster da - man legt Tiere zusammen, um zu
     * sehen, ob ihre Spuren zueinander passen, und dazu muessen sie sich als
     * Gruppe ansehen lassen und nicht nur eines nach dem anderen.
     */
    function buildCluster(group) {
      // Nur Mitglieder, die es in dieser Phase schon gibt. Betrifft heute
      // allein das Nachzuegler-Cluster, und dort alle auf einmal: zurueck in
      // Phase 1 geschaltet duerfte es nicht als leerer Kasten stehenbleiben
      // und die Neuen ankuendigen, bevor es sie gibt.
      var shown = [];
      for (var m = 0; m < group.members.length; m++) {
        if (group.members[m] < shownCount) shown.push(group.members[m]);
      }
      if (!shown.length) return null;

      var root = document.createElement('div');
      root.className = 'cluster';
      root.setAttribute('data-drop', 'cluster');
      root.setAttribute('data-group', String(group.id));

      var head = document.createElement('div');
      head.className = 'cluster-head';
      head.setAttribute('data-drag', 'group');
      head.setAttribute('data-group', String(group.id));
      head.title = 'Cluster antippen: alle Mitglieder auf der Karte hervorheben · ' +
        'ziehen: auf ein anderes legen fügt zusammen, im freien Bereich löst es sich auf';

      head.addEventListener('click', function () {
        if (swallowClick()) return;
        // Steht genau dieses Cluster schon in der Auswahl, hebt der zweite Tipp
        // sie auf - dieselbe Umschaltung wie bei der einzelnen Kachel.
        report(isExactly(group.members) ? [] : group.members.slice());
      });

      var count = document.createElement('span');
      count.className = 'cluster-count';

      var eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'signal-eye';
      eye.innerHTML = EYE_SVG;
      eye.addEventListener('click', function (e) {
        // Das Auge sitzt im Kopf, und der Kopf waehlt aus: ohne diesen Halt
        // liefe nach jedem Ausblenden auch noch das Hervorheben.
        if (e && e.stopPropagation) e.stopPropagation();
        if (swallowClick()) return;
        // Solange noch ein Mitglied zu sehen ist, raeumt das Auge auf; erst
        // wenn alle weg sind, holt es alle zurueck - wie das Auge oben ueber
        // der ganzen Liste.
        var next = !allHidden(group.members);
        setHiddenFor(group.members, next);
      });

      head.appendChild(count);
      head.appendChild(eye);
      root.appendChild(head);

      var body = document.createElement('div');
      body.className = 'cluster-body';
      for (var i = 0; i < shown.length; i++) body.appendChild(buildTile(shown[i]));
      root.appendChild(body);

      boxes.push({ group: group, root: root, head: head, eye: eye, count: count });
      return root;
    }

    function buildTile(signal) {
      var label = pad(signal + 1, labelWidth);

      var root = document.createElement('div');
      root.className = 'signal';
      root.setAttribute('data-drag', 'signal');
      root.setAttribute('data-drop', 'signal');
      root.setAttribute('data-signal', String(signal));

      var pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'signal-pick';
      pick.textContent = label;
      pick.setAttribute('aria-pressed', 'false');
      pick.title = 'Signal ' + label + ' verfolgen · ziehen gruppiert';

      var eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'signal-eye';
      eye.innerHTML = EYE_SVG;
      eye.setAttribute('aria-pressed', 'false');

      pick.addEventListener('click', function () {
        if (swallowClick()) return;
        // Ein ausgeblendetes Signal auszuwaehlen ergaebe eine Auswahl, die man
        // nicht sieht - also wird es beim Antippen wieder eingeblendet. Sonst
        // schaltet der Tipp die Auswahl um, genau wie auf der Karte.
        if (hidden[signal]) {
          setHiddenFor([signal], false);
          report([signal]);
        } else {
          // Nur wenn genau dieses Signal allein ausgewaehlt ist, hebt der Tipp
          // die Auswahl auf. Steckt es in einem ausgewaehlten Cluster, engt er
          // sie auf dieses eine Tier ein - sonst raeumte der Blick auf ein
          // einzelnes Mitglied die ganze Gruppe vom Bild.
          report(isExactly([signal]) ? [] : [signal]);
        }
      });

      eye.addEventListener('click', function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (swallowClick()) return;
        setHiddenFor([signal], !hidden[signal]);
      });

      root.appendChild(pick);
      root.appendChild(eye);
      tiles[signal] = { root: root, pick: pick, eye: eye };
      return root;
    }

    // ------------------------------------------------------------ Zustand

    function setHiddenFor(signals, flag) {
      var agentIndices = [];
      for (var i = 0; i < signals.length; i++) {
        hidden[signals[i]] = !!flag;
        agentIndices.push(order[signals[i]]);
      }
      onVisibility(agentIndices, !!flag);
      updateAll();
    }

    function allHidden(signals) {
      for (var i = 0; i < signals.length; i++) if (!hidden[signals[i]]) return false;
      return true;
    }

    function allSelected(signals) {
      if (!signals.length) return false;
      for (var i = 0; i < signals.length; i++) if (!selected[signals[i]]) return false;
      return true;
    }

    /**
     * Ist genau das ausgewaehlt und nichts sonst? Nur dann schaltet ein
     * zweiter Tipp die Auswahl ab - andernfalls engt er sie ein.
     */
    function isExactly(signals) {
      var n = 0;
      for (var i = 0; i < selected.length; i++) if (selected[i]) n++;
      return n === signals.length && allSelected(signals);
    }

    /**
     * Die Auswahl nach aussen melden. Gerechnet wird hier in Signalnummern,
     * gesprochen wird ausschliesslich in Tiernummern - app.js soll nichts
     * umrechnen muessen.
     */
    function report(signals) {
      var out = [];
      for (var i = 0; i < signals.length; i++) out.push(order[signals[i]]);
      onSelect(out);
    }

    function visibleCount() {
      var n = 0;
      // Nur bis shownCount: ein Nachzuegler vor dem Bruch hat keine Kachel und
      // ist nicht "eingeblendet". Zaehlte er mit, waere das Sammelauge ueber
      // der Liste nie ganz zu, obwohl alle sichtbaren Signale aus sind.
      for (var i = 0; i < shownCount && i < hidden.length; i++) if (!hidden[i]) n++;
      return n;
    }

    function updateAll() {
      var i;
      for (i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        if (!tile) continue;
        var on = !!selected[i];
        var color = model.colorOf(i);
        tile.root.classList.toggle('on', on);
        tile.root.classList.toggle('off', hidden[i]);
        // Die Farbe steht im style und nicht in einer Klasse: sie wechselt mit
        // jeder Gruppierung, und ein Stylesheet mit vierzig Farbklassen waere
        // dieselbe Information an einer zweiten Stelle.
        tile.pick.style.background = color;
        tile.root.style.borderColor = WL.PALETTE.darken(color, 0.34);
        tile.pick.setAttribute('aria-pressed', on ? 'true' : 'false');
        tile.eye.setAttribute('aria-pressed', hidden[i] ? 'true' : 'false');
        tile.eye.title = hidden[i] ? 'Signal einblenden' : 'Signal ausblenden';
        tile.eye.setAttribute('aria-label', tile.eye.title);
      }

      for (i = 0; i < boxes.length; i++) {
        var box = boxes[i];
        var members = box.group.members;
        var off = allHidden(members);
        box.root.style.borderColor = box.group.color;
        box.head.style.background = box.group.color;
        box.count.textContent = members.length + ' Signale';
        box.root.classList.toggle('off', off);
        // Der Ring um den Kasten meint dasselbe wie der um eine Kachel: was
        // hier steht, ist auf der Karte hervorgehoben. Er erscheint nur, wenn
        // *alle* Mitglieder ausgewaehlt sind - bei einem einzelnen daraus
        // traegt die Kachel den Ring, und nur sie.
        box.root.classList.toggle('on', allSelected(members));
        box.eye.classList.toggle('off', off);
        box.eye.setAttribute('aria-pressed', off ? 'true' : 'false');
        box.eye.title = off ? 'Cluster einblenden' : 'Cluster ausblenden';
        box.eye.setAttribute('aria-label', box.eye.title);
      }

      // Kein Zaehler "sichtbar/gesamt" mehr: die Gesamtzahl der Tiere ist eine
      // Angabe ueber die Welt, und die Liste soll nichts darueber sagen. Wie
      // viele gerade zu sehen sind, zeigt der Zustand der Augen selbst.
      var visible = visibleCount();
      if (allBtn) {
        var allOff = tiles.length > 0 && visible === 0;
        allBtn.classList.toggle('off', allOff);
        allBtn.setAttribute('aria-pressed', allOff ? 'true' : 'false');
        allBtn.title = allOff ? 'Alle Signale einblenden' : 'Alle Signale ausblenden';
        allBtn.setAttribute('aria-label', allBtn.title);
        allBtn.disabled = tiles.length === 0;
      }
    }

    /**
     * Die Farben nach aussen: dort landen sie auf Spur und Tier.
     *
     * Und im selben Zug die Gruppierung. Die beiden haengen nicht zufaellig
     * zusammen: eine Kachel wechselt ihre Farbe genau dann, wenn sie ein
     * Cluster betritt oder verlaesst. Wer die Farben veroeffentlicht, hat also
     * gerade eine strukturelle Aenderung hinter sich - eine zweite Liste von
     * Aufrufstellen waere dieselbe Liste, nur eine, die man vergisst.
     */
    function publishColors() {
      var out = [];
      for (var s = 0; s < order.length; s++) out[order[s]] = model.colorOf(s);
      onColors(out);
      onClusters(panel.groups());
    }

    if (allBtn) {
      allBtn.innerHTML = EYE_SVG;
      allBtn.addEventListener('click', function () {
        var next = visibleCount() > 0;
        for (var i = 0; i < hidden.length; i++) hidden[i] = next;
        onVisibility(null, next);
        updateAll();
      });
    }

    // -------------------------------------------------------- Gruppieren

    /**
     * Das Ziehen selbst. Delegiert am Rahmen der Liste, damit ein Neuaufbau
     * nach jedem Zusammenfuegen nicht saemtliche Handler neu haengen muss.
     */
    grid.addEventListener('pointerdown', function (e) {
      // Ganz oben und vor jeder Abkuerzung: die Sperre gilt nur dem Klick, den
      // der Browser nach einem Ziehen von selbst nachschiebt. Wer neu aufsetzt,
      // meint etwas Neues - stuende das hinter den Abbruchbedingungen, bliebe
      // sie beim Aufsetzen auf ein Auge stehen und verschluckte das Ausblenden.
      suppressClick = false;
      if (drag) return;
      // Das Auge gehoert sich selbst - sonst hinge an jedem Ausblenden ein
      // halber Ziehvorgang.
      if (ancestorWithClass(e.target, 'signal-eye')) return;
      var handleEl = ancestorWith(e.target, 'data-drag');
      if (!handleEl) return;

      drag = {
        pointerId: e.pointerId,
        touch: e.pointerType === 'touch',
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        source: handleOf(handleEl),
        sourceEl: handleEl.getAttribute('data-drag') === 'group'
          ? handleEl.parentNode : handleEl,
        active: false,
        ghost: null,
        over: null,
        scroller: 0,
        frame: 0,
        hold: 0
      };
      if (grid.setPointerCapture) grid.setPointerCapture(e.pointerId);
      if (drag.touch) armHold();
    });

    /** Der Finger haelt still - nach HOLD_MS liegt die Kachel in der Hand. */
    function armHold() {
      if (typeof setTimeout !== 'function') return;
      drag.hold = setTimeout(function () {
        if (!drag || drag.active) return;
        drag.hold = 0;
        beginDrag();
        follow();
      }, HOLD_MS);
    }

    function clearHold() {
      if (!drag || !drag.hold) return;
      if (typeof clearTimeout === 'function') clearTimeout(drag.hold);
      drag.hold = 0;
    }

    /*
     * Solange die Kachel in der Hand liegt, darf die Liste nicht blaettern.
     * touch-action: pan-y erlaubt dem Browser genau das, und ein Bild spaeter
     * waere die Geste bei ihm statt bei uns. Zurueckzunehmen ist das nur von
     * einem nicht-passiven Zuhoerer - deshalb hier und nicht im CSS.
     */
    grid.addEventListener('touchmove', function (e) {
      if (!drag || !drag.active || !drag.touch) return;
      if (e.cancelable !== false && e.preventDefault) e.preventDefault();
    }, { passive: false });

    // Ein Finger, der liegen bleibt, ist fuer das System ein langer Druck -
    // und der oeffnet auf einem Tablet gern ein Menue. Genau darauf beruht
    // hier aber das Aufnehmen der Kachel.
    grid.addEventListener('contextmenu', function (e) {
      if (drag && drag.active && e.preventDefault) e.preventDefault();
    });

    /**
     * Die Fingerbewegung setzt nur die Koordinaten; gezeichnet wird einmal je
     * Bild. Ein Tablet liefert Bewegungen schneller, als der Browser Bilder
     * baut - und elementFromPoint zwingt ihn jedes Mal, das Layout der ganzen
     * Liste neu zu rechnen. Ungebremst waere das mehrfache Arbeit fuer ein
     * Ergebnis, das ohnehin nur einmal je Bild zu sehen ist.
     */
    grid.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag.x = e.clientX;
      drag.y = e.clientY;

      if (!drag.active) {
        var dx = drag.x - drag.startX;
        var dy = drag.y - drag.startY;
        if (drag.touch) {
          // Waagerecht ist sofort das Ziehen - senkrecht gehoert dem Blaettern
          // der Liste (CSS touch-action: pan-y). Wer nach oben will, haelt
          // erst still; dann uebernimmt armHold, und dieser Zweig hier hat
          // nur noch zu erkennen, dass der Finger stattdessen losgewandert
          // ist - das war ein Wisch, und der gehoert der Liste.
          if (Math.abs(dx) > DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
            clearHold();
            beginDrag();
          } else if (Math.abs(dx) > HOLD_SLOP || Math.abs(dy) > HOLD_SLOP) {
            endDrag();
            return;
          } else {
            return;
          }
        } else {
          // Mit der Maus gibt es nichts zu blaettern, dort zaehlt jede Richtung.
          if (Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
          beginDrag();
        }
      }
      requestFollow();
    });

    /** Ghost und Ziel dem Finger nachfuehren - hoechstens einmal je Bild. */
    function requestFollow() {
      if (!drag || drag.frame || typeof requestAnimationFrame !== 'function') {
        if (drag && typeof requestAnimationFrame !== 'function') follow();
        return;
      }
      drag.frame = requestAnimationFrame(function () {
        if (!drag) return;
        drag.frame = 0;
        follow();
      });
    }

    function follow() {
      if (drag.ghost) {
        // transform statt left/top: das Verschieben bleibt damit Sache des
        // Compositors und loest kein neues Layout aus.
        drag.ghost.style.transform =
          'translate3d(' + drag.x + 'px, ' + drag.y + 'px, 0) translate(-50%, -50%)';
      }
      hoverAt(drag.x, drag.y);
    }

    grid.addEventListener('pointerup', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      // Quelle und Ziel muessen vor dem Aufraeumen gerettet werden - danach
      // gibt es keinen Ziehvorgang mehr, aus dem sie zu lesen waeren.
      var target = drag.active ? drag.over : null;
      var source = drag.source;
      endDrag();
      if (target) applyDrop(source, target);
    });

    grid.addEventListener('pointercancel', function (e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      endDrag();
    });

    function beginDrag() {
      drag.active = true;
      // Der Klick nach dem Ziehen kommt trotzdem - ohne diese Sperre waehlte
      // jedes Gruppieren nebenbei ein Tier aus.
      suppressClick = true;
      // Die Uhr steht, solange der Finger unten ist. Ein Bild der Karte kostet
      // die Spuren aller Tiere; laeuft sie waehrend des Ziehens weiter,
      // kaempfen Geste und Karte um denselben Hauptthread, und die Geste
      // verliert. Angehalten wird nur die Zeit, nicht der Abspielzustand -
      // beim Loslassen laeuft es weiter, wo es aufgehoert hat.
      onDrag(true);
      drag.sourceEl.classList.add('dragging');
      if (document.body) document.body.classList.add('signal-dragging');

      var members = model.membersOf(drag.source);
      // Was in der Hand liegt, ist ausgewaehlt: waehrend des Ziehens zeigt die
      // Karte genau die Spuren, um die es gerade geht. Ohne das muesste man vor
      // jedem Gruppieren erst antippen, um zu sehen, was man da zusammenlegt.
      report(members);
      var ghost = document.createElement('div');
      ghost.className = 'signal-ghost';
      ghost.textContent = members.length > 1
        ? members.length + ' Signale'
        : pad(members[0] + 1, labelWidth);
      ghost.style.background = model.colorOf(members[0]);
      if (document.body) document.body.appendChild(ghost);
      drag.ghost = ghost;
      // Gleich an den Finger setzen: der Kasten sitzt sonst bis zum naechsten
      // Bild in der linken oberen Ecke und blitzt dort auf.
      follow();

      // Die Cluster sammeln sich oben, die ungruppierten Signale stehen
      // darunter - bei vierzig Tieren liegt das Ziel deshalb regelmaessig
      // ausserhalb des Ausschnitts. Ohne dieses Scrollen am Rand waere es mit
      // dem Finger schlicht nicht erreichbar. Ein Timer und nicht der
      // Bewegungshandler, denn ein am Rand *stehender* Finger loest keine
      // pointermove-Ereignisse aus.
      if (typeof setInterval === 'function') {
        drag.scroller = setInterval(function () {
          if (!drag) return;
          var step = edgeScroll(drag.y);
          if (!step) return;
          grid.scrollTop += step;
          // Durch dieselbe Bremse wie die Fingerbewegung: das Ziel unter dem
          // Finger zu suchen ist auch von hier aus eine Layoutrechnung.
          requestFollow();
        }, 30);
      }
    }

    /** Wie weit soll die Liste rollen, wenn der Finger hier steht? */
    function edgeScroll(y) {
      var rect = grid.getBoundingClientRect ? grid.getBoundingClientRect() : null;
      if (!rect) return 0;
      var zone = 46;
      if (y < rect.top + zone) return -Math.min(14, (rect.top + zone - y) * 0.4);
      if (y > rect.bottom - zone) return Math.min(14, (y - rect.bottom + zone) * 0.4);
      return 0;
    }

    function endDrag() {
      clearHold();
      if (drag.scroller && typeof clearInterval === 'function') clearInterval(drag.scroller);
      if (drag.frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(drag.frame);
      if (drag.active) {
        onDrag(false);
        drag.sourceEl.classList.remove('dragging');
        if (document.body) document.body.classList.remove('signal-dragging');
        if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
        markOver(null);
      }
      if (grid.releasePointerCapture) {
        try { grid.releasePointerCapture(drag.pointerId); } catch (err) { /* schon weg */ }
      }
      drag = null;
    }

    /**
     * Was liegt unter dem Finger? Der Schwebekasten ist in CSS auf
     * pointer-events: none gesetzt, sonst faende elementFromPoint immer nur
     * ihn selbst.
     */
    function hoverAt(x, y) {
      markOver(dropUnder(x, y));
    }

    /**
     * Worauf zeigt der Finger? Erst genau darunter, dann ein Stueck daneben.
     *
     * Der Punkt allein war zu streng: die Kacheln stehen mit 6 px Abstand, und
     * dazwischen liegt der freie Bereich - der von einer freien Kachel nichts
     * annimmt. Ein Ablegen zwei Pixel neben der Kachel tat deshalb gar nichts,
     * und das sah nicht aus wie danebengegriffen, sondern wie ein Aussetzer.
     *
     * Weitergesucht wird aber nur, wenn unter dem Finger nichts Zustaendiges
     * liegt. Wer auf seiner eigenen Kachel oder in seinem eigenen Cluster
     * loslaesst, meint "nichts tun" - das ist eine Absage und kein Fehlgriff,
     * und der Nachbar daneben waere die falsche Antwort darauf.
     */
    function dropUnder(x, y) {
      if (!document.elementFromPoint) return null;
      for (var i = 0; i < PROBE.length; i++) {
        var el = document.elementFromPoint(x + PROBE[i][0], y + PROBE[i][1]);
        var dropEl = el ? ancestorWith(el, 'data-drop') : null;
        if (!dropEl || !contains(grid, dropEl)) continue;
        if (allowedDrop(dropEl)) return dropEl;
        if (i === 0 && partOfSource(dropEl)) return null;
      }
      return null;
    }

    /** Gehoert dieses Ziel zu dem, was gerade in der Hand liegt? */
    function partOfSource(el) {
      return el === drag.sourceEl || contains(drag.sourceEl, el) || contains(el, drag.sourceEl);
    }

    function markOver(el) {
      if (drag.over === el) return;
      if (drag.over) drag.over.classList.remove('drop-target');
      drag.over = el;
      if (el) el.classList.add('drop-target');
    }

    /** Nur Ziele markieren, an denen das Ablegen wirklich etwas bewirkt. */
    function allowedDrop(el) {
      var kind = el.getAttribute('data-drop');
      // Der freie Bereich nimmt nur an, was gerade in einem Cluster steckt -
      // sonst leuchtete er bei jedem Ziehen mit, ohne etwas zu tun.
      if (kind === 'frei') return model.canDetach(drag.source);
      return model.canJoin(drag.source, handleOf(el));
    }

    /**
     * Ablegen. Im freien Bereich bedeutet es "wieder ohne Gruppierung" - ein
     * einzelnes Signal verlaesst sein Cluster, ein ganzes Cluster loest sich
     * auf. Ueberall sonst wird zusammengefuegt.
     */
    function applyDrop(source, el) {
      var loosen = el.getAttribute('data-drop') === 'frei';
      // Vor der Aenderung merken: danach gibt es die Gruppe der Quelle unter
      // Umstaenden nicht mehr, aus der sich ihre Mitglieder lesen liessen.
      var moved = model.membersOf(source);
      var changed = loosen ? model.detach(source) : model.join(source, handleOf(el));
      if (!changed) return;
      // Die Auswahl haengt am Signal, nicht an der Kachel - sie ueberlebt den
      // Neuaufbau, weil sie in Signalnummern gefuehrt wird.
      render();
      publishColors();
      // Ausgewaehlt ist danach, was gerade entstanden ist: beim Zusammenfuegen
      // das ganze neue Cluster (nicht nur das hineingezogene Stueck - die Frage
      // ist ja, ob es zu den anderen passt), beim Herausziehen das Herausgezogene.
      report(loosen ? moved : resultOf(moved));
    }

    /** Das Cluster, in dem diese Signale nach dem Ablegen liegen. */
    function resultOf(moved) {
      var id = moved.length ? model.groupOf(moved[0]) : -1;
      return id >= 0 ? model.membersOf(WL.Clusters.group(id)) : moved;
    }

    function handleOf(el) {
      var group = el.getAttribute('data-group');
      if (group != null) return WL.Clusters.group(parseInt(group, 10));
      return WL.Clusters.signal(parseInt(el.getAttribute('data-signal'), 10));
    }

    /** Nach einem Ziehen ist der folgende Klick nicht gemeint. */
    function swallowClick() {
      if (!suppressClick) return false;
      suppressClick = false;
      return true;
    }

    // ------------------------------------------------------------- Helfer

    function ancestorWith(el, attr) {
      while (el) {
        if (el.getAttribute && el.getAttribute(attr) != null) return el;
        el = el.parentNode;
      }
      return null;
    }

    function ancestorWithClass(el, name) {
      while (el) {
        if (el.classList && el.classList.contains(name)) return el;
        el = el.parentNode;
      }
      return null;
    }

    function contains(root, el) {
      while (el) {
        if (el === root) return true;
        el = el.parentNode;
      }
      return false;
    }

    /** -1, eine Tiernummer oder eine Liste davon - alles wird zur Liste. */
    function toList(value) {
      if (value == null) return [];
      if (typeof value === 'number') return value >= 0 ? [value] : [];
      return value;
    }

    function pad(n, width) {
      var s = String(n);
      while (s.length < width) s = '0' + s;
      return s;
    }

    updateAll();
    return panel;
  }

  WL.Signals = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
