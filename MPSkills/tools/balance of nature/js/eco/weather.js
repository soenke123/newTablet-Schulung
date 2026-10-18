/**
 * Jahreswetter: kein Jahr ist wie das andere.
 *
 * Zu Beginn jedes Jahres wird gewuerfelt:
 *   growth    wie gut die Pflanzen in diesem Jahr wachsen (0,75 - 1,25)
 *   winter    Haerte des Winters (0,55 mild - 1,5 hart): mehr Energieverbrauch,
 *             weniger Wachstum, Fruechte und Insekten schwinden schneller
 *   mast      Mastjahr: Buesche und Baeume tragen massenhaft Fruechte
 *             (Vorbild: Mastjahre der Suedbuchen in Neuseeland)
 *
 * Das Wetter hat einen eigenen Zufallsgenerator. Dieselbe Insel hat deshalb
 * dieselbe Wetterfolge, egal mit welchen Startbestaenden man sie laufen
 * laesst - Vergleichslaeufe sind fair.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});

  BT.WEATHER = {
    growth: [0.75, 1.25],
    winter: [0.55, 1.5],
    mastChance: 0.16
  };

  function Weather(seed) {
    this.rng = new BT.Rng(seed).fork('weather');
    this.years = [];
  }

  /** Wetter fuer Jahr y (ab 0); wird bei Bedarf der Reihe nach erzeugt. */
  Weather.prototype.year = function (y) {
    var cfg = BT.WEATHER, r = this.rng;
    while (this.years.length <= y) {
      // Mittel aus zwei Wuerfen: mittlere Jahre sind haeufiger als Extreme
      var g = (r.next() + r.next()) / 2;
      var w = (r.next() + r.next()) / 2;
      var prev = this.years[this.years.length - 1];
      var mast = r.chance(cfg.mastChance) && !(prev && prev.mast);
      this.years.push({
        growth: cfg.growth[0] + (cfg.growth[1] - cfg.growth[0]) * g,
        winter: cfg.winter[0] + (cfg.winter[1] - cfg.winter[0]) * w,
        mast: mast
      });
    }
    return this.years[y];
  };

  /** Kurzbeschreibung fuer die Oberflaeche. */
  Weather.describe = function (w) {
    var parts = [];
    if (w.mast) parts.push('Mastjahr');
    if (w.growth > 1.1) parts.push('gutes Jahr');
    else if (w.growth < 0.9) parts.push('mageres Jahr');
    if (w.winter > 1.22) parts.push('harter Winter');
    else if (w.winter < 0.83) parts.push('milder Winter');
    return parts.join(' · ') || 'durchschnittliches Jahr';
  };

  Weather.HARD_WINTER = 1.22;

  BT.Weather = Weather;
})(typeof window !== 'undefined' ? window : globalThis);
