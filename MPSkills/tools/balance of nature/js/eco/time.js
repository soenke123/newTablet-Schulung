/**
 * Gestauchte Zeit (funktional, nicht real).
 *
 *   1 Tick  = ein Bewegungsschritt
 *   1 Tag   = TICKS_PER_DAY Ticks
 *   1 Jahr  = 4 Jahreszeiten x DAYS_PER_SEASON Tage
 *
 * Lebensdauer, Fortpflanzung und Wachstum sind so gewaehlt, dass in wenigen
 * Minuten mehrere Generationen sichtbar werden.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  var TICKS_PER_DAY = 6;
  var DAYS_PER_SEASON = 15;
  var DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
  var SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];

  BT.Time = {
    TICKS_PER_DAY: TICKS_PER_DAY,
    DAYS_PER_SEASON: DAYS_PER_SEASON,
    DAYS_PER_YEAR: DAYS_PER_YEAR,
    SEASONS: SEASONS,

    /** Jahre -> Tage (fuer Lebensdauer, Reife usw.) */
    years: function (y) { return Math.round(y * DAYS_PER_YEAR); },

    /** Zerlegt einen Tageszaehler in Jahr, Jahreszeit, Tag im Jahr. */
    calendar: function (day) {
      var doy = day % DAYS_PER_YEAR;
      var season = Math.floor(doy / DAYS_PER_SEASON);
      return {
        year: Math.floor(day / DAYS_PER_YEAR) + 1,
        dayOfYear: doy,
        season: season,
        seasonName: SEASONS[season],
        dayOfSeason: doy % DAYS_PER_SEASON + 1
      };
    },

    /** Lesbarer Zeitstempel: "Jahr 3 · Sommer, Tag 7" */
    label: function (day) {
      var c = BT.Time.calendar(day);
      return 'Jahr ' + c.year + ' · ' + c.seasonName + ', Tag ' + c.dayOfSeason;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
