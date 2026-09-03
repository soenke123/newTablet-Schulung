/**
 * Reproduzierbarer Zufallszahlengenerator (mulberry32).
 *
 * Wichtig fuer das Projekt: derselbe Seed muss exakt dieselbe Welt erzeugen.
 * Deshalb wird in der gesamten Generierung ausschliesslich dieser RNG benutzt,
 * niemals Math.random().
 *
 * rng.fork(name) erzeugt einen eigenstaendigen Unter-Generator. Dadurch
 * verschiebt ein spaeter ergaenzter Generierungsschritt (z.B. Tiere in Phase 3)
 * nicht die Ergebnisse aller vorherigen Schritte.
 */
(function (global) {
  'use strict';

  var WL = global.WL || (global.WL = {});

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mix(a, b) {
    var h = (a ^ Math.imul(b ^ (b >>> 15), 2246822507)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function Rng(seed) {
    this.seed = (seed >>> 0) || 1;
    this._state = this.seed;
  }

  /** Gleichverteilt in [0, 1). */
  Rng.prototype.next = function () {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    var t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Gleichverteilt in [min, max). */
  Rng.prototype.range = function (min, max) {
    return min + this.next() * (max - min);
  };

  /** Ganzzahl in [min, max] (beide Grenzen inklusive). */
  Rng.prototype.int = function (min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  };

  /** Erwartet ein Paar [min, max] aus der Konfiguration. */
  Rng.prototype.intIn = function (pair) {
    return this.int(pair[0], pair[1]);
  };

  Rng.prototype.rangeIn = function (pair) {
    return this.range(pair[0], pair[1]);
  };

  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };

  Rng.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };

  /** Ungefaehr normalverteilt, Mittelwert 0, Standardabweichung 1. */
  Rng.prototype.gaussian = function () {
    var u = 1 - this.next();
    var v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  /** Zufaelliger Punkt in einem Kreis (gleichverteilt ueber die Flaeche). */
  Rng.prototype.pointInCircle = function (cx, cy, radius) {
    var a = this.next() * Math.PI * 2;
    var r = radius * Math.sqrt(this.next());
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };

  /**
   * Unabhaengiger Unter-Generator. Gleicher Name + gleicher Seed => gleiche Folge.
   */
  Rng.prototype.fork = function (name) {
    return new Rng(mix(this.seed, hashString(name)));
  };

  /**
   * Nutzereingabe -> Seed. Zahlen werden direkt uebernommen, alles andere
   * gehasht, damit auch "Wald" oder "6a" einen gueltigen Seed ergibt.
   */
  function parseSeed(value) {
    if (typeof value === 'number' && isFinite(value)) {
      return Math.abs(Math.floor(value)) >>> 0 || 1;
    }
    var text = String(value == null ? '' : value).trim();
    if (!text) return randomSeed();
    if (/^\d+$/.test(text)) {
      var n = parseInt(text, 10) >>> 0;
      return n || 1;
    }
    return hashString(text) || 1;
  }

  /** Sechsstelliger, gut merkbarer Seed fuer den "Neue Welt"-Button. */
  function randomSeed() {
    return 100000 + Math.floor(Math.random() * 900000);
  }

  WL.Rng = Rng;
  WL.hashString = hashString;
  WL.parseSeed = parseSeed;
  WL.randomSeed = randomSeed;
})(typeof window !== 'undefined' ? window : globalThis);
