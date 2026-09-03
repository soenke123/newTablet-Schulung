/**
 * Die Zeitachse der Simulation.
 *
 * Ein Tag-Nacht-Zyklus dauert 5 Minuten Echtzeit. Diese Datei legt fest, was
 * "Zeit" im Projekt bedeutet; Simulation, Aufzeichnung und Abspieler rechnen
 * ausschliesslich mit den Werten von hier.
 *
 * Wichtig fuer das Verstaendnis des Rests: die Aufzeichnung wird beim
 * Weltaufbau einmal durchgerechnet und abgelegt. Deshalb gibt es zwei
 * Zeitbegriffe:
 *   - Simulationszeit: 0 .. TOTAL_SECONDS, die Achse der Aufzeichnung
 *   - Abspielzeit:     wo der Abspielkopf gerade steht (dieselbe Achse)
 * Der Zeitraffer aendert nur, wie schnell der Kopf ueber diese Achse laeuft,
 * niemals die Simulation selbst.
 *
 * ---------------------------------------------------------------------------
 * Zwei Phasen zu je 5 Tagen, und der Bruch dazwischen ist der Kern der
 * Unterrichtsstunde.
 *
 *   Tag  1- 5  Startbestand. Die Klasse beobachtet, gruppiert, begruendet.
 *   Tag  6-10  Drei Nachzuegler sind da. Die Muster aendern sich - sichtbar,
 *              und aus einem Grund, den man auf der Karte sehen kann.
 *
 * Es ist *eine* durchgehende Rechnung und nicht zwei Laeufe. Das ist der
 * ganze Punkt: Tag 1-5 sind hinterher bitgleich zu dem, was die Klasse gesehen
 * hat, weil es dieselbe Rechnung ist und nicht eine sorgfaeltig wiederholte.
 * Signal 17 bleibt Signal 17, dasselbe Tier mit derselben Streuung. Und kein
 * Tier flieht je vor etwas Unsichtbarem: vor dem Bruch existieren die
 * Nachzuegler nicht (Zustand 'abwesend'), danach sind sie zu sehen.
 *
 * Die Spur wird am Bruch geloescht - Phase 2 beginnt auf leerem Blatt. Das ist
 * zuerst eine didaktische Entscheidung (fuenf neue Tage sind mit fuenf alten
 * vergleichbar, zehn nicht) und nebenbei die, die das Zeichnen bezahlbar
 * haelt: nie mehr als 5 Tage Spur auf dem Schirm, also genau die Kosten von
 * heute. Siehe recording.setWindow.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  var DAY_SECONDS = 300;   // ein voller Tag (24 h) in Echtzeitsekunden
  var PHASE_DAYS = 5;      // Laenge einer Aufgabenphase in Tagen
  var PHASE_COUNT = 2;     // vorher / nachher
  var DAYS = PHASE_DAYS * PHASE_COUNT;
  var TICK_HZ = 20;        // Rechenschritte pro Sekunde waehrend der Simulation
  var SAMPLE_HZ = 5;       // abgelegte Stuetzstellen pro Sekunde je Tier

  // Phasengrenzen als Anteil des Tages (0 = Mitternacht), laut data/tiere.md.
  var PHASES = {
    dawnStart: 0.20,
    dayStart: 0.30,
    duskStart: 0.70,
    nightStart: 0.80
  };

  var PHASE_NAMES = ['Nacht', 'Morgendaemmerung', 'Tag', 'Abenddaemmerung'];

  var PHASE_SECONDS = DAY_SECONDS * PHASE_DAYS;

  var SimTime = {
    DAY_SECONDS: DAY_SECONDS,
    DAYS: DAYS,
    PHASE_DAYS: PHASE_DAYS,
    PHASE_COUNT: PHASE_COUNT,
    PHASE_SECONDS: PHASE_SECONDS,
    TICK_HZ: TICK_HZ,
    SAMPLE_HZ: SAMPLE_HZ,
    TOTAL_SECONDS: DAY_SECONDS * DAYS,
    PHASES: PHASES,

    /**
     * Der Augenblick, in dem die Nachzuegler auftauchen - das Ende von Phase 0
     * und der Anfang von Phase 1. Eine Zahl, nicht zwei: der Bruch ist ein
     * Punkt auf der Achse, kein Bereich, und wer ihn an zwei Stellen ausrechnet,
     * hat ihn irgendwann an einer davon verschoben.
     */
    BREAK_SECONDS: PHASE_SECONDS,

    /** In welcher Phase liegt dieser Zeitpunkt? 0 = vorher, 1 = nachher. */
    phaseOf: function (seconds) {
      var p = Math.floor(seconds / PHASE_SECONDS);
      return p < 0 ? 0 : (p > PHASE_COUNT - 1 ? PHASE_COUNT - 1 : p);
    },

    /**
     * Anfang und Ende einer Phase in Sekunden. Der Abspieler laeuft darin, und
     * die Aufzeichnung baut ihre Spur genau ueber diesem Fenster.
     */
    phaseRange: function (phase) {
      var p = phase < 0 ? 0 : (phase > PHASE_COUNT - 1 ? PHASE_COUNT - 1 : phase);
      return { from: p * PHASE_SECONDS, to: (p + 1) * PHASE_SECONDS };
    },

    /**
     * Dieselbe Phase als Stuetzstellen-Nummern, beide Grenzen einschliesslich.
     *
     * Der Bruch selbst gehoert zur *zweiten* Phase, deshalb endet die erste
     * eine Stuetzstelle davor. Das ist keine Feinheit: im Augenblick des
     * Bruchs stehen die Nachzuegler bereits auf der Karte, und zaehlte man ihn
     * noch zu Phase 1, taeuchten sie dort fuer einen Augenblick auf. Gefunden
     * hat das der Bitvergleich - der Abstand zum naechsten Artgenossen wich
     * bei je einem Reh in der zwoelften Nachkommastelle ab, weil ein einziger
     * Messpunkt zwei Rehe mehr sah.
     *
     * Wer die Grenze woanders braucht, holt sie hier ab und rechnet sie nicht
     * nach - sonst steht sie irgendwann an zwei Stellen verschieden.
     */
    phaseSamples: function (phase) {
      var r = SimTime.phaseRange(phase);
      var to = Math.round(r.to * SAMPLE_HZ);
      if (phase < PHASE_COUNT - 1) to -= 1;
      return { from: Math.round(r.from * SAMPLE_HZ), to: to };
    },

    /** Abspielgeschwindigkeiten: 1x = 5 min/Tag, 25x = alle 5 Tage in 1 min. */
    SPEEDS: [1, 5, 25],

    /** Anteil des laufenden Tages, 0 = Mitternacht, 0.5 = Mittag. */
    dayFraction: function (seconds) {
      var f = (seconds % DAY_SECONDS) / DAY_SECONDS;
      return f < 0 ? f + 1 : f;
    },

    /** Tagesnummer ab 1 - so wird sie auch angezeigt. */
    dayNumber: function (seconds) {
      return Math.floor(seconds / DAY_SECONDS) + 1;
    },

    /** 0 Nacht, 1 Morgendaemmerung, 2 Tag, 3 Abenddaemmerung. */
    phase: function (seconds) {
      var f = SimTime.dayFraction(seconds);
      if (f < PHASES.dawnStart) return 0;
      if (f < PHASES.dayStart) return 1;
      if (f < PHASES.duskStart) return 2;
      if (f < PHASES.nightStart) return 3;
      return 0;
    },

    phaseName: function (seconds) {
      return PHASE_NAMES[SimTime.phase(seconds)];
    },

    isNight: function (seconds) {
      return SimTime.phase(seconds) === 0;
    },

    /**
     * Helligkeit 0 (tiefe Nacht) bis 1 (heller Tag), weich ueber die
     * Daemmerung interpoliert. Der Renderer faerbt danach ein, und tagaktive
     * Tiere lesen daran ab, wie wach sie sind.
     */
    daylight: function (seconds) {
      var f = SimTime.dayFraction(seconds);
      if (f < PHASES.dawnStart) return 0;
      if (f < PHASES.dayStart) return (f - PHASES.dawnStart) / (PHASES.dayStart - PHASES.dawnStart);
      if (f < PHASES.duskStart) return 1;
      if (f < PHASES.nightStart) return 1 - (f - PHASES.duskStart) / (PHASES.nightStart - PHASES.duskStart);
      return 0;
    },

    /** Uhrzeit als "14:30" - Tagesanteil auf 24 Stunden umgerechnet. */
    clock: function (seconds) {
      var minutes = Math.floor(SimTime.dayFraction(seconds) * 24 * 60);
      var h = Math.floor(minutes / 60);
      var m = minutes % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    /** Vollstaendige Beschriftung fuer den Abspieler. */
    label: function (seconds) {
      return 'Tag ' + SimTime.dayNumber(seconds) + ' · ' + SimTime.clock(seconds);
    },

    /** Simulationsstunden in Sekunden - macht Tierparameter lesbar. */
    hours: function (h) {
      return h * DAY_SECONDS / 24;
    }
  };

  WL.SimTime = SimTime;
})(typeof window !== 'undefined' ? window : globalThis);
