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
    var hint = document.getElementById('hint');

    var renderer = new WL.Renderer(canvas);
    var overlay = WL.DebugOverlay.create(document.getElementById('debugOverlay'));
    var agentLayer = WL.AgentRenderer.create();
    var world = null;
    var sim = null;
    var input = null;
    var hintTimer = 0;
    var maskedView = false;
    var showTrails = true;
    // Wer die Gruppierung mitlesen will. Steht hier oben, weil der Rueckruf der
    // Signalliste ihn braucht, bevor irgendwer ihn setzen kann.
    var clusterHook = null;
    // Wer erfahren will, dass gerade eine neue Welt fertig geworden ist. Der
    // Aufbau ist zweistufig und laeuft ueber zwei setTimeout - von aussen ist
    // "fertig" sonst nicht abzuwarten, sondern nur zu erraten.
    var worldHook = null;

    var signals = WL.Signals.create({
      grid: document.getElementById('signalGrid'),
      allBtn: document.getElementById('signalAllBtn')
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

    // Tierbilder laden; bis sie da sind, wird die neutrale Form gezeichnet.
    WL.Sprites.preload(function () { renderer.requestDraw(); });

    function updateViewControls() {
      resetViewBtn.hidden = renderer.camera ? renderer.camera.isFitted() : true;
    }

    /**
     * Offene gegen verdeckte Sicht. Wie bei der Auswahl wird der Zustand an
     * genau einer Stelle gesetzt: der Renderer laesst die Landschaft weg, die
     * Tierebene malt Hintergrund und Tiere einfarbig - laufen die beiden
     * auseinander, sieht man entweder Terrain unter einer deckenden Flaeche
     * oder umgekehrt.
     */
    function setMaskedView(flag) {
      maskedView = !!flag;
      renderer.setMasked(maskedView);
      agentLayer.setMasked(maskedView);
      viewModeBtn.setAttribute('aria-pressed', maskedView ? 'true' : 'false');
      renderer.requestDraw();
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

    function showHint() {
      hint.classList.remove('faded');
      if (hintTimer) clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hint.classList.add('faded'); }, 8000);
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
          showHint();
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

    viewModeBtn.addEventListener('click', function () {
      setMaskedView(!maskedView);
    });

    trailsBtn.addEventListener('click', function () {
      setTrails(!showTrails);
    });

    global.addEventListener('keydown', function (e) {
      if (!e.key) return;
      // Liegt der Fokus auf einem Bedienelement, gehoert die Taste diesem -
      // sonst schaltet die Leertaste den Knopf und zusaetzlich das Abspielen,
      // und die Pfeiltasten springen doppelt.
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      var key = e.key.toLowerCase();

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
        setMaskedView(!maskedView);
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
     * Die drei Haken (setClusterHook, setWorldHook, applyGroups) sind der
     * ganze Unterschied zwischen "laeuft allein" und "laeuft in einem Raum".
     * Sie sind bewusst Haken und keine Ereignisse: es gibt genau einen
     * Zuhoerer, und der ist entweder da oder nicht.
     */
    global.WILDCLUSTERS = {
      get world() { return world; },
      get sim() { return sim; },
      get phase() { return currentPhase; },
      get masked() { return maskedView; },
      renderer: renderer,
      player: player,
      agentLayer: agentLayer,
      signals: signals,
      rebuild: build,
      setMaskedView: setMaskedView,
      setTrails: setTrails,
      setPhase: setPhase,
      applyGroups: function (list) { signals.applyGroups(list); },
      setClusterHook: function (fn) { clusterHook = fn || null; },
      setWorldHook: function (fn) { worldHook = fn || null; }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
