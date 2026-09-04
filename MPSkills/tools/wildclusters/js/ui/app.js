/**
 * Einstiegspunkt: verbindet Weltgenerierung, Simulation, Renderer und UI.
 *
 * Der Ablauf beim Aufbau einer Welt ist bewusst zweistufig: erst wird die Welt
 * erzeugt und gezeigt, dann werden die 5 Tage Tierleben durchgerechnet. Das
 * Durchrechnen blockiert den Hauptthread fuer einen Moment - deshalb steht das
 * Bild vorher schon da, und der Knopf sagt, was gerade passiert.
 *
 * Danach laeuft alles ueber den Abspielkopf: die Simulation ist fertig, die UI
 * bewegt nur noch einen Zeitpunkt ueber die Aufzeichnung.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var canvas = document.getElementById('worldCanvas');
    var seedInput = document.getElementById('seedInput');
    var generateBtn = document.getElementById('generateBtn');
    var resetViewBtn = document.getElementById('resetViewBtn');
    var viewModeBtn = document.getElementById('viewModeBtn');
    var trailsBtn = document.getElementById('trailsBtn');
    var infoBtn = document.getElementById('infoBtn');
    var infoBox = document.getElementById('infoBox');

    var renderer = new WL.Renderer(canvas);
    var overlay = WL.DebugOverlay.create(document.getElementById('debugOverlay'));
    var agentLayer = WL.AgentRenderer.create();
    var world = null;
    var sim = null;
    var input = null;
    /* Zwei Schleier: die Landschaft und die Tiere. Der Knopf schaltet beide
       zusammen, der Unterricht kann sie einzeln oeffnen (siehe setMaskedParts).
     *
     * In einem Rahmen faengt es VERDECKT an, und das ist keine Vorsicht,
     * sondern ein behobener Fehler: der Aufbau einer Welt ist zweistufig, und
     * zwischen "Bild steht" und "zehn Tage gerechnet" liegen auf einem Tablet
     * mehrere Sekunden. Wer den Schleier erst danach setzt (so kam er frueher
     * ueber die Bruecke), zeigt der Klasse in genau dieser Zeit die Landschaft,
     * die sie noch nicht sehen soll - beim Neuladen der Seite jedes Mal.
     * Der Raum darf aufdecken; anfangen muss er zugedeckt. */
    var maskedWorld = !!global.WC_EMBEDDED;
    var maskedAgents = !!global.WC_EMBEDDED;
    var showTrails = true;
    // Wer die Gruppierung mitlesen will. Steht hier oben, weil der Rueckruf der
    // Signalliste ihn braucht, bevor irgendwer ihn setzen kann.
    var clusterHook = null;
    // Wer erfahren will, dass gerade eine neue Welt fertig geworden ist. Der
    // Aufbau ist zweistufig und laeuft ueber zwei setTimeout - von aussen ist
    // "fertig" sonst nicht abzuwarten, sondern nur zu erraten.
    var worldHook = null;
    /* Und wer erfahren will, dass einer ANFAENGT. Das ist nicht die Kehrseite
       aus Symmetrie, sondern der einzige Weg, den Aufbau von aussen als
       Zeitraum zu sehen: dazwischen meldet die Signalliste eine leere
       Gruppierung (setSimulation -> publishColors), und wer nur das Ende kennt,
       haelt diese Meldung fuer die Arbeit eines Menschen an der Welt, die
       gerade noch dastand. Anfangen kann ein Aufbau auch ohne Zutun von aussen
       - "Neue Welt" und das Seed-Feld sitzen in dieser Seite. */
    var buildHook = null;

    var signals = WL.Signals.create({
      grid: document.getElementById('signalGrid'),
      allBtn: document.getElementById('signalAllBtn'),
      undoBtn: document.getElementById('signalUndoBtn')
    }, {
      onSelect: function (indices) { setSelection(indices); },
      onVisibility: function (indices, hiddenFlag) {
        // null meint "alle" - der Knopf ueber der Liste. Sonst ist es eine
        // Liste von Tieren: ein einzelnes vom Auge der Kachel, mehrere vom
        // Auge eines Clusters.
        var hitSelection = indices === null;
        if (indices === null) {
          agentLayer.setAllHidden(hiddenFlag);
        } else {
          for (var i = 0; i < indices.length; i++) {
            if (agentLayer.isSelected(indices[i])) hitSelection = true;
            agentLayer.setHidden(indices[i], hiddenFlag);
          }
        }
        // Eine unsichtbare Auswahl waere eine Auswahl, die niemand findet.
        // Ausgeblendet wird immer das Ganze (eine Kachel, ein Cluster, alle) -
        // deshalb faellt auch die Auswahl ganz weg und nicht nur teilweise.
        if (hiddenFlag && hitSelection) setSelection([]);
        else renderer.requestDraw();
      },
      // Die Gruppierung faerbt die Tiere um - ohne diesen Weg auf die Karte
      // waere sie nur eine Sortierung in der Liste.
      onColors: function (colors) {
        agentLayer.setColors(colors);
        renderer.requestDraw();
      },
      // Die Gruppierung nach draussen - fuer alles, was ausserhalb dieser
      // Seite liegt. Hier hoert normalerweise niemand zu; erst wenn Wild
      // Clusters in einem Raum steckt (MPSkills, js/ui/bridge.js), haengt
      // sich jemand ein und traegt sie zum Server.
      onClusters: function (groups) {
        if (clusterHook) clusterHook(groups);
      },
      // Waehrend einer Ziehgeste steht die Uhr. Ein Bild der Karte zeichnet
      // die Spuren aller Tiere; laeuft sie nebenher weiter, teilen sich Geste
      // und Karte denselben Hauptthread und der Finger wartet. hold/release
      // statt pause/play: der Knopf soll nicht behaupten, jemand haette
      // gestoppt - nach dem Ablegen laeuft es weiter, wo es stand.
      onDrag: function (active) {
        if (active) player.hold(); else player.release();
      }
    });

    var player = WL.Player.create({
      playBtn: document.getElementById('playBtn'),
      slider: document.getElementById('timeSlider'),
      label: document.getElementById('timeLabel'),
      phase: document.getElementById('phaseLabel'),
      speedBtns: document.querySelectorAll('.player .speeds button')
    }, {
      onFrame: function (time) {
        agentLayer.setTime(time);
        renderer.requestDraw();
        updateAdvanceBtn();
      }
    });

    var advanceBtn = document.getElementById('advanceBtn');
    var currentPhase = 0;

    /**
     * Der Knopf in die naechste Phase - sichtbar nur am Ende der laufenden.
     *
     * Gepruefte Bedingung ist die *Zeit*, nicht der Abspielzustand. Wer auf
     * isPlaying() prueft, bekommt den Knopf nie zu sehen: der Abspieler meldet
     * beim Anhalten den letzten Augenblick, *bevor* er stehenbleibt (siehe
     * tick() in player.js), playing steht dort also noch auf true - und danach
     * meldet er gar nichts mehr. Ueber die Zeit stimmt es ausserdem auch fuer
     * den, der die Zeitleiste mit dem Finger ans Ende zieht: auch der ist am
     * Ende von Tag 5 angekommen.
     *
     * Der halbe Sekunde Spielraum ist derselbe wie beim Abspielknopf: mit dem
     * Finger trifft niemand die letzte Zehntelsekunde genau.
     */
    function updateAdvanceBtn() {
      if (!advanceBtn) return;
      var phases = sim && sim.featuresByPhase ? sim.featuresByPhase.length : 1;
      var more = !!sim && currentPhase < phases - 1;
      advanceBtn.hidden = !(more && player.time() >= player.rangeEnd() - 0.5);
    }

    // Die beiden Schleier auch wirklich haengen, bevor das erste Bild faellt.
    // Die Variablen oben sind nur die Buchhaltung - gezeichnet wird nach dem,
    // was Renderer und Tierebene wissen.
    if (maskedWorld || maskedAgents) setMaskedParts(maskedWorld, maskedAgents);

    // Tierbilder laden; bis sie da sind, wird die neutrale Form gezeichnet.
    WL.Sprites.preload(function () { renderer.requestDraw(); });

    function updateViewControls() {
      resetViewBtn.hidden = renderer.camera ? renderer.camera.isFitted() : true;
    }

    /**
     * Offene gegen verdeckte Sicht - und zwar in zwei Haelften.
     *
     * Verdeckt ist nicht ein Zustand, sondern zwei: die LANDSCHAFT (Terrain
     * weg, deckende Flaeche darueber) und die TIERE (Farbkreis mit Nummer
     * statt Bild). Aufloesen heisst im Unterricht nicht zwangslaeufig beides
     * auf einmal - "erst die Welt, dann die Tiere" ist die spannendere
     * Reihenfolge, und "nur die Tiere" beantwortet die Frage der Stunde, ohne
     * gleich zu verraten, wo sie gelebt haben.
     *
     * Gesetzt wird weiterhin an genau einer Stelle: der Renderer laesst sein
     * statisches Bild aus, die Tierebene malt Hintergrund und Tiere - laufen
     * die beiden auseinander, sieht man Terrain unter einer deckenden Flaeche
     * oder umgekehrt.
     */
    function setMaskedParts(worldFlag, agentFlag) {
      maskedWorld = !!worldFlag;
      maskedAgents = !!agentFlag;
      renderer.setMasked(maskedWorld);
      agentLayer.setMaskedWorld(maskedWorld);
      agentLayer.setMaskedAgents(maskedAgents);
      // Der Knopf kennt nur zwei Stellungen. Halb verdeckt ist fuer ihn
      // verdeckt - er faellt in dem Fall ohnehin unter die Lehrkraft.
      viewModeBtn.setAttribute('aria-pressed',
        (maskedWorld || maskedAgents) ? 'true' : 'false');
      renderer.requestDraw();
    }

    /** Beide Haelften auf einmal - der Knopf und die Taste V. */
    function setMaskedView(flag) {
      setMaskedParts(flag, flag);
    }

    /**
     * Spuren an oder aus - der zweite Blick auf dieselbe Aufzeichnung.
     *
     * Die Spur zeigt fuenf Tage auf einmal; ohne sie sieht man, was ein Tier
     * *gerade* tut, und ob mehrere zusammen unterwegs sind. Beides gehoert zur
     * Gruppierungsaufgabe, das eine ist nur nicht durch das andere zu ersetzen.
     * Der Knopf ist deshalb unabhaengig von der verdeckten Sicht: alle vier
     * Kombinationen sind sinnvoll.
     */
    function setTrails(flag) {
      showTrails = !!flag;
      agentLayer.setTrails(showTrails);
      // Gedrueckt heisst wie beim Nachbarknopf "Sonderzustand" - hier also
      // *ohne* Spuren, denn mit ihnen faengt die Karte an.
      trailsBtn.setAttribute('aria-pressed', showTrails ? 'false' : 'true');
      renderer.requestDraw();
    }

    /**
     * Die Bedienung hinter dem kleinen „i" - auf Nachfrage und nicht von
     * selbst.
     *
     * Frueher blendete bei jeder neuen Karte unten ein Streifen mit allen
     * Tasten auf. Er war an der falschen Stelle (quer ueber der Karte), fuer
     * die falschen Leute (auf einem Tablet ist keine dieser Tasten zu
     * druecken) und kam zum falschen Zeitpunkt (genau dann, wenn jemand die
     * neue Welt ansehen wollte). Wer die Tasten braucht, ist die Lehrkraft -
     * und die fragt einmal, nicht bei jeder Welt.
     */
    function setInfo(open) {
      if (!infoBox || !infoBtn) return;
      infoBox.hidden = !open;
      infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    /** Seed aus der Adresszeile - macht Welten im Unterricht teilbar. */
    function seedFromHash() {
      var match = /seed=([^&]+)/.exec(global.location.hash || '');
      return match ? decodeURIComponent(match[1]) : null;
    }

    /*
     * Es gibt bewusst keine Anzeige zum ausgewaehlten Tier und keinen Bestand
     * ("12 Enten, 8 Barsche"). Beides stand frueher in der Fusszeile und war
     * die Loesung der Aufgabe im Klartext: der Bestand nannte Artenzahl und
     * Gruppengroessen, die Einzelzeile die Art des angetippten Tieres. Was ein
     * Tier tut, soll auf der Karte abgelesen werden, nicht in einer Zeile
     * darunter. Die Werte selbst sind nicht weg - sie stehen in
     * sim.features und in der Kontrollanzeige (Taste D), die dem Entwickeln
     * dient und nicht dem Unterricht.
     */

    /**
     * Die einzige Stelle, an der die Auswahl gesetzt wird - Karte und
     * Signalliste zeigen dieselben Tiere, egal wo getippt wurde. Die Auswahl
     * ist eine Menge: von der Karte kommt immer ein einzelnes Tier, aus der
     * Liste auch ein ganzes Cluster.
     */
    function setSelection(indices) {
      agentLayer.setSelection(indices);
      signals.setSelection(indices);
      renderer.requestDraw();
    }

    function selectAgentAt(point) {
      if (!sim) return;
      // Grosszuegiger Trefferbereich: auf dem Tablet ist eine Ente klein.
      var radius = Math.max(18, 26 / renderer.camera.scale);
      var found = agentLayer.pick(point.x, point.y, radius);
      // Ein Tipp auf die Karte meint genau ein Tier, auch wenn es in einem
      // ausgewaehlten Cluster steckt - dann engt er die Auswahl darauf ein.
      // Nur wenn es schon allein ausgewaehlt war, hebt der zweite Tipp auf.
      var alone = found >= 0 && agentLayer.isSelected(found) && agentLayer.selectedCount() === 1;
      setSelection(alone ? [] : found);
    }

    function build(seedValue) {
      var seed = WL.parseSeed(seedValue);
      // Ganz zuerst und nicht erst im Rueckruf: ab hier gilt alles, was diese
      // Seite ueber die Gruppierung meldet, der neuen Welt - auch das, was sie
      // noch unter der alten meldet, weil die neue erst am Ende steht.
      if (buildHook) buildHook();
      generateBtn.disabled = true;
      generateBtn.textContent = 'Erzeuge …';
      player.pause();

      // Kurz Luft lassen, damit der Button-Zustand sichtbar wird, bevor der
      // Hauptthread mit der Generierung belegt ist.
      setTimeout(function () {
        world = WL.World.generate(seed);
        seedInput.value = String(world.seed);
        try {
          global.history.replaceState(null, '', '#seed=' + world.seed);
        } catch (e) { /* file:// erlaubt kein replaceState - unkritisch */ }

        renderer.setWorld(world);
        renderer.setDynamicLayers([agentLayer.draw]);
        if (!input) {
          input = WL.Input.attach(canvas, renderer, {
            onChange: updateViewControls,
            onGestureEnd: function () { renderer.refreshLater(); },
            onTap: selectAgentAt
          });
        }
        updateViewControls();

        // Zweiter Schritt: die 5 Tage durchrechnen. Das Weltbild steht bereits.
        generateBtn.textContent = 'Simuliere …';
        setTimeout(function () {
          sim = WL.Simulation.run(world);
          agentLayer.setSimulation(sim);
          signals.setSimulation(sim);
          setPhase(0);
          overlay.update(world, renderer, sim);
          generateBtn.disabled = false;
          generateBtn.textContent = 'Neue Welt';

          if (!world.validation.ok) {
            console.warn('Weltgenerator: Regelverstöße', world.validation.violations);
          }
          // Zuletzt, und wirklich zuletzt: erst hier steht alles, was jemand
          // von aussen anfassen wuerde - Welt, Simulation, Signalliste, Phase.
          if (worldHook) worldHook(world.seed);
        }, 16);
      }, 16);
    }

    /**
     * Die Phase umschalten - der Bruch bei Tag 5.
     *
     * Vier Dinge auf einmal, und sie gehoeren zusammen, weil jedes einzelne
     * fuer sich einen halb umgeschalteten Zustand ergaebe:
     *   1. die Spur wird verworfen und ueber dem neuen Abschnitt neu gebaut
     *      (recording.setWindow) - Phase 2 beginnt auf leerem Blatt,
     *   2. der Abspieler bekommt den neuen Abschnitt,
     *   3. die Signalliste zeigt ab jetzt auch die Nachzuegler,
     *   4. der Abspielkopf steht am Anfang der neuen Phase.
     *
     * Wie das *ausgeloest* wird, steht noch nicht fest - deshalb gibt es hier
     * noch keinen Knopf, nur diese Funktion (erreichbar als
     * WILDCLUSTERS.setPhase). Sie ist die eine Tuer, durch die der Wechsel geht;
     * was daran haengt - ein Knopf, ein Lehrercode, ein Ergebnis der
     * Gruppierungsaufgabe - ist eine Zeile.
     */
    function setPhase(phase) {
      if (!sim) return;
      var count = sim.featuresByPhase ? sim.featuresByPhase.length : 1;
      phase = Math.max(0, Math.min(count - 1, phase));
      var window = WL.SimTime.phaseSamples(phase);
      var last = sim.recording.sampleCount - 1;
      if (window.to > last) window.to = last;

      currentPhase = phase;
      sim.recording.setWindow(window.from, window.to);
      agentLayer.setPhase(phase);
      signals.setPhase(phase);
      // setRange springt an den Anfang der Phase und loest dabei onFrame aus -
      // der Knopf verschwindet damit von selbst, ohne dass er hier eigens
      // versteckt werden muesste.
      player.setRange(window.from * sim.recording.sampleSeconds,
        window.to * sim.recording.sampleSeconds);
      renderer.refreshLater();
    }

    if (advanceBtn) {
      advanceBtn.addEventListener('click', function () {
        setPhase(currentPhase + 1);
      });
    }

    generateBtn.addEventListener('click', function () {
      // Unveraenderter Seed im Feld bedeutet: der Nutzer will eine neue Welt.
      var typed = seedInput.value.trim();
      var useSeed = (world && typed === String(world.seed)) || typed === ''
        ? WL.randomSeed()
        : typed;
      build(useSeed);
    });

    seedInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        seedInput.blur();
        build(seedInput.value);
      }
    });

    resetViewBtn.addEventListener('click', function () {
      if (input) input.reset();
    });

    // Halb verdeckt zaehlt als verdeckt: der naechste Druck deckt dann alles
    // auf. Sonst waere die erste Betaetigung ein Zustandswechsel, den niemand
    // vorhersagen kann.
    viewModeBtn.addEventListener('click', function () {
      setMaskedView(!(maskedWorld || maskedAgents));
    });

    trailsBtn.addEventListener('click', function () {
      setTrails(!showTrails);
    });

    if (infoBtn) {
      infoBtn.addEventListener('click', function () {
        setInfo(infoBox.hidden);
      });
      // Ein Tipp auf die Karte schliesst es wieder: der Kasten liegt ueber ihr,
      // und ein Erklaerkasten, den man nur ueber denselben kleinen Knopf wieder
      // los wird, steht auf einer Leinwand laenger als er soll.
      canvas.addEventListener('pointerdown', function () { setInfo(false); });
    }

    global.addEventListener('keydown', function (e) {
      if (!e.key) return;
      // Liegt der Fokus auf einem Bedienelement, gehoert die Taste diesem -
      // sonst schaltet die Leertaste den Knopf und zusaetzlich das Abspielen,
      // und die Pfeiltasten springen doppelt.
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      var key = e.key.toLowerCase();

      /* Strg+Z (auf dem Mac Cmd+Z) fuehrt durch dieselbe Tuer wie der Pfeil
         ueber der Signalliste. Vor der Kette der einzelnen Buchstaben, damit
         eine Tastenkombination nie nebenbei einen Einzelbuchstaben ausloest. */
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        signals.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.nudge(e.shiftKey ? WL.SimTime.DAY_SECONDS : WL.SimTime.hours(1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.nudge(e.shiftKey ? -WL.SimTime.DAY_SECONDS : -WL.SimTime.hours(1));
      } else if (key === 'd') {
        overlay.toggle();
        overlay.update(world, renderer, sim);
      } else if (key === 'v') {
        setMaskedView(!(maskedWorld || maskedAgents));
      } else if (key === 's') {
        setTrails(!showTrails);
      } else if (key === 'n') {
        // Sprite <-> neutrale Form: der Schalter fuer die spaetere Spielphase.
        WL.Sprites.toggleMode();
        renderer.requestDraw();
      } else if (key === 'r' && renderer.camera) {
        if (input) input.reset();
      }
    });

    var resizeTimer = 0;
    global.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        renderer.resize();
        updateViewControls();
      }, 120);
    });

    /*
     * Erste Welt: Seed aus der Adresszeile, sonst der Wert im Eingabefeld.
     *
     * Ausser in einem Rahmen (MPSkills): dort sagt der Raum, welche Welt gilt,
     * und die kommt binnen Millisekunden herein. Hier trotzdem eine zu bauen
     * hiesse, zehn Tage Tierleben zu rechnen und sie sofort wegzuwerfen - auf
     * einem Tablet sind das ein paar Sekunden, in denen nichts geht. Das Flag
     * setzt js/ui/bridge.js, und zwar beim Laden des Skripts und damit vor
     * diesem Rueckruf.
     */
    if (!global.WC_EMBEDDED) build(seedFromHash() || seedInput.value);

    /*
     * Fuer die Konsole, fuer spaetere Phasen - und seit dem Einzug in MPSkills
     * fuer die Bruecke (js/ui/bridge.js), die das hier von aussen bedient.
     *
     * Die vier Haken (setBuildHook, setWorldHook, setClusterHook, applyGroups)
     * sind der ganze Unterschied zwischen "laeuft allein" und "laeuft in einem
     * Raum". Sie sind bewusst Haken und keine Ereignisse: es gibt genau einen
     * Zuhoerer, und der ist entweder da oder nicht.
     *
     * Der Aufbau meldet sich an BEIDEN Enden (setBuildHook, setWorldHook), und
     * das ist keine Zierde: dazwischen liegen zwei setTimeout, und in dieser
     * Zeit meldet die Signalliste eine leere Gruppierung - unter dem Seed der
     * Welt, die gerade noch dastand. Wer nur das Ende kennt, schreibt damit
     * fremde Arbeit tot.
     */
    global.WILDCLUSTERS = {
      get world() { return world; },
      get sim() { return sim; },
      get phase() { return currentPhase; },
      // `masked` bleibt die Frage "ist ueberhaupt etwas verdeckt" - daran
      // haengen aeltere Aufrufer. Wer die Haelften einzeln braucht, fragt die
      // beiden darunter.
      get masked() { return maskedWorld || maskedAgents; },
      get maskedWorld() { return maskedWorld; },
      get maskedAnimals() { return maskedAgents; },
      renderer: renderer,
      player: player,
      agentLayer: agentLayer,
      signals: signals,
      rebuild: build,
      setMaskedView: setMaskedView,
      setMaskedParts: setMaskedParts,
      setTrails: setTrails,
      setPhase: setPhase,
      /* Die Kontrollanzeige zumachen, wenn sie offen steht - der Raum nimmt
         sie den Tablets weg (js/ui/bridge.js). Ueber diese Tuer und nicht per
         element.hidden von aussen: die Anzeige fuehrt ihren eigenen Zustand,
         und ein von aussen verstecktes Fenster braeuchte danach zwei
         Tastendruecke, um wieder aufzugehen. */
      hideDetails: function () { if (overlay.isVisible()) overlay.toggle(); },
      applyGroups: function (list) { signals.applyGroups(list); },
      setClusterHook: function (fn) { clusterHook = fn || null; },
      setWorldHook: function (fn) { worldHook = fn || null; },
      setBuildHook: function (fn) { buildHook = fn || null; }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
