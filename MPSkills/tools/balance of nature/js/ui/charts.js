/**
 * Liniendiagramme fuer die Zeitreihen (Canvas, ohne Bibliothek).
 *
 * Jedes Diagramm hat genau eine y-Achse. Bestaende sehr unterschiedlicher
 * Groesse (Hirsche vs. Woelfe) stehen deshalb in getrennten Diagrammen.
 * Die Legende ueber dem Diagramm nennt jede Reihe mit aktuellem Wert, damit
 * die Zuordnung nie nur an der Farbe haengt.
 *
 * Alle Diagramme teilen sich eine Ansicht (BT.ChartView):
 *   - Zeitraum: alles oder nur die letzten N Jahre
 *   - Fadenkreuz: Wer ueber ein Diagramm faehrt, sieht denselben Tag als
 *     Strich in allen Diagrammen; die Legenden zeigen dann die Werte dieses
 *     Tages. So lassen sich Zusammenhaenge (Hirsche - Woelfe - Gras) ablesen.
 */
(function (global) {
  'use strict';

  var BT = global.BT || (global.BT = {});
  var doc = global.document;

  var INK = { axis: 'rgba(232, 241, 244, 0.25)', grid: 'rgba(232, 241, 244, 0.08)', text: 'rgba(232, 241, 244, 0.7)', cross: 'rgba(232, 241, 244, 0.75)' };
  var SEASON_SHORT = ['Fr', 'So', 'He', 'Wi'];

  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  // ------------------------------------------------------------ gemeinsame Ansicht

  /** Zeitraum und Fadenkreuz, gemeinsam fuer alle angemeldeten Diagramme. */
  function ChartView() {
    this.years = 0;          // 0 = ganzer Verlauf
    this.mean = false;       // Jahresmittel statt Tageswerte (nur Diagramme mit `allowMean`)
    this.hoverDay = null;    // Tag unter dem Zeiger (in irgendeinem Diagramm)
    this.hoverChart = null;  // Diagramm, ueber dem der Zeiger steht (bekommt den Tooltip)
    this.charts = [];
    this.listeners = [];
  }

  ChartView.prototype.add = function (chart) { this.charts.push(chart); };

  /** Ausschnitt der Zeitreihe, der gerade gezeigt wird. */
  ChartView.prototype.slice = function (history) {
    if (!this.years || !history.length) return history;
    var from = history[history.length - 1].day - this.years * BT.Time.DAYS_PER_YEAR;
    if (history[0].day >= from) return history;
    // history[i].day === i (eine Zeile je Tag ab Tag 0); zur Sicherheit suchen
    var i = Math.max(0, Math.min(history.length - 1, from - history[0].day));
    while (i > 0 && history[i].day > from) i--;
    while (i < history.length - 1 && history[i].day < from) i++;
    return history.slice(i);
  };

  ChartView.prototype.setYears = function (y) {
    this.years = y;
    this.drawAll();
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](y);
  };

  ChartView.prototype.onRange = function (fn) { this.listeners.push(fn); };

  ChartView.prototype.setMean = function (on) {
    this.mean = on;
    this.drawAll();
  };

  /**
   * Umschalter "Jahresmittel": glaettet die Jahreszeiten weg, damit langsame
   * Veraenderungen ueber die Jahre leichter zu erkennen sind.
   */
  ChartView.prototype.meanButton = function (container) {
    var self = this;
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'mean-toggle';
    b.textContent = 'Jahresmittel';
    b.title = 'Jeden Tag als Mittel über ein Jahr zeigen (ohne die Schwankungen der Jahreszeiten)';
    b.setAttribute('aria-pressed', String(this.mean));
    b.addEventListener('click', function () {
      self.setMean(!self.mean);
      b.setAttribute('aria-pressed', String(self.mean));
    });
    container.appendChild(b);
    return b;
  };

  ChartView.prototype.setHover = function (day, chart) {
    if (day === this.hoverDay && chart === this.hoverChart) return;
    this.hoverDay = day;
    this.hoverChart = chart;
    this.drawAll();
  };

  ChartView.prototype.drawAll = function () {
    for (var i = 0; i < this.charts.length; i++) this.charts[i].draw();
  };

  /**
   * Knopfleiste fuer den Zeitraum. Mehrere Leisten (Seitenleiste, Grossansicht)
   * bleiben ueber die gemeinsame Ansicht im Gleichschritt.
   */
  ChartView.prototype.rangeButtons = function (container) {
    var self = this;
    var opts = [[0, 'Alles'], [100, '100 J'], [50, '50 J'], [10, '10 J'], [1, '1 J']];
    var bar = doc.createElement('div');
    bar.className = 'range-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Zeitraum der Diagramme');
    bar.innerHTML = opts.map(function (o) {
      return '<button type="button" data-years="' + o[0] + '" title="' +
        (o[0] ? 'Die letzten ' + (o[0] === 1 ? 'zwölf Monate' : o[0] + ' Jahre') : 'Ganzer Verlauf') + '">' + o[1] + '</button>';
    }).join('');
    function mark(y) {
      var bs = bar.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(+bs[i].dataset.years === y));
    }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) self.setYears(+b.dataset.years);
    });
    this.onRange(mark);
    mark(this.years);
    container.appendChild(bar);
    return bar;
  };

  // ------------------------------------------------------------ Diagramm

  /**
   * @param container  Element, in das Titel, Legende und Canvas kommen
   * @param opts       { title, series: [{label, color, get(row), dash, between: [oben, unten], scale}], percent, view, allowMean }
   *                 between: statt einer Linie die Flaeche zwischen zwei anderen Reihen (Indizes)
   *                 scale:   die Linie ist durch scale geteilt (Ratten); Legende und Tooltip nennen die
   *                          echte Zahl und dahinter den Wert der Linie, z. B. „17 810 (890 × 20)“
   */
  function LineChart(container, opts) {
    this.opts = opts;
    this.view = opts.view || new ChartView();
    this.view.add(this);
    this.root = doc.createElement('div');
    this.root.className = 'chart';
    this.root.innerHTML = '<div class="chart-head"><h3></h3><div class="chart-legend"></div></div>' +
      '<div class="chart-plot"><canvas></canvas><div class="chart-tip" hidden></div></div>';
    this.root.querySelector('h3').textContent = opts.title;
    this.legend = this.root.querySelector('.chart-legend');
    this.canvas = this.root.querySelector('canvas');
    this.tip = this.root.querySelector('.chart-tip');
    this.ctx = this.canvas.getContext('2d');
    this.history = [];
    this.layout = null;      // zuletzt gezeichneter Ausschnitt (fuer die Zeigerposition)
    container.appendChild(this.root);

    var self = this;
    this.canvas.addEventListener('pointermove', function (e) {
      var r = self.canvas.getBoundingClientRect();
      self.view.setHover(self.dayAt(e.clientX - r.left), self);
    });
    this.canvas.addEventListener('pointerleave', function () {
      if (self.view.hoverChart === self) self.view.setHover(null, null);
    });
    this.buildLegend();
  }

  LineChart.prototype.buildLegend = function () {
    var html = '';
    this.opts.series.forEach(function (s) {
      html += '<span class="lg"><i style="background:' + s.color + '"></i>' + s.label + ' <b>–</b></span>';
    });
    this.legend.innerHTML = html;
    this.values = this.legend.querySelectorAll('b');
  };

  LineChart.prototype.fmt = function (v, s) {
    if (this.opts.percent) return Math.round(v * 100) + ' %';
    var k = s && s.scale;
    if (!k) return String(Math.round(v));
    return Math.round(v * k).toLocaleString('de-DE') + ' (' + Math.round(v) + ' × ' + k + ')';
  };

  /** Tag unter einer x-Position im Canvas (oder null ausserhalb). */
  LineChart.prototype.dayAt = function (px) {
    var l = this.layout;
    if (!l || px < l.L - 4 || px > l.L + l.pw + 4) return null;
    var k = Math.round((px - l.L) / l.pw * (l.n - 1));
    return l.d0 + Math.max(0, Math.min(l.n - 1, k));
  };

  LineChart.prototype.update = function (history) {
    this.history = history;
    this.draw();
  };

  /**
   * Jahresmittel je Reihe ueber den ganzen Verlauf: Mittel ueber ein Jahr,
   * zentriert auf den Tag (am Rand ueber das, was da ist). Ueber
   * Praefixsummen; neu gerechnet nur, wenn der Verlauf gewachsen ist.
   */
  LineChart.prototype.yearMeans = function () {
    var h = this.history, series = this.opts.series;
    var c = this._means;
    if (c && c.history === h && c.length === h.length) return c.values;
    var n = h.length, half = Math.floor(BT.Time.DAYS_PER_YEAR / 2);
    var values = [];
    for (var s = 0; s < series.length; s++) {
      var sum = new Float64Array(n + 1);
      for (var i = 0; i < n; i++) sum[i + 1] = sum[i] + series[s].get(h[i]);
      var out = new Float32Array(n);
      for (i = 0; i < n; i++) {
        var a = Math.max(0, i - half), b = Math.min(n, i + half);
        out[i] = (sum[b] - sum[a]) / (b - a);
      }
      values.push(out);
    }
    this._means = { history: h, length: n, values: values };
    return values;
  };

  /** Legendenwerte: am Fadenkreuz der Wert dieses Tages, sonst der aktuelle. */
  LineChart.prototype.updateLegend = function (k, hovered) {
    if (k < 0) return;
    for (var i = 0; i < this.opts.series.length; i++) this.values[i].textContent = this.fmt(this.val(i, k), this.opts.series[i]);
    this.legend.classList.toggle('at-cursor', !!hovered);
  };

  LineChart.prototype.draw = function () {
    var c = this.canvas, ctx = this.ctx;
    var dpr = global.devicePixelRatio || 1;
    var W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;    // unsichtbar (z. B. Grossansicht geschlossen)
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var hist = this.view.slice(this.history), series = this.opts.series;
    var L = 34, R = 8, Tp = 6, Bt = 18;
    var pw = W - L - R, ph = H - Tp - Bt;
    var n = hist.length;
    // Werte: Tageswert oder Jahresmittel (k = Index im Ausschnitt)
    var mean = this.opts.allowMean && this.view.mean;
    var means = mean ? this.yearMeans() : null, off = this.history.length - n;
    this.val = mean ? function (s, k) { return means[s][off + k]; } : function (s, k) { return series[s].get(hist[k]); };
    this.root.classList.toggle('is-mean', !!mean);
    this.layout = null;
    this.tip.hidden = true;
    if (n < 2) { this.updateLegend(n - 1, false); return; }
    var d0 = hist[0].day;
    this.layout = { L: L, pw: pw, n: n, d0: d0 };

    var max = 0;
    for (var i = 0; i < n; i++) for (var s = 0; s < series.length; s++) max = Math.max(max, this.val(s, i));
    var rows = ph > 140 ? 4 : 2;
    if (this.opts.percent) {
      // 100 % ist der Startwert. Waechst die Menge darueber (mehr Acker, mehr Wiese), waechst die Achse mit:
      // Gitterlinien alle 25, 50, 100 ... %, so viele, wie in die Hoehe passen
      if (max < 1.01) max = 1;
      else {
        var step = ph > 140 ? 0.25 : 0.5, fit = ph > 140 ? 6 : 4;
        while (max / step > fit) step *= 2;
        max = Math.ceil(max / step - 1e-9) * step;
        rows = Math.round(max / step);
      }
    } else max = niceMax(Math.max(2, max * 1.05));

    var x = function (k) { return L + (k / (n - 1)) * pw; };
    var y = function (v) { return Tp + ph - (v / max) * ph; };

    // Gitter und Achsen
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = INK.text;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var t = 0; t <= rows; t++) {
      var v = max * t / rows;
      ctx.strokeStyle = t === 0 ? INK.axis : INK.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, Math.round(y(v)) + 0.5); ctx.lineTo(L + pw, Math.round(y(v)) + 0.5); ctx.stroke();
      ctx.fillText(this.fmt(v), L - 5, y(v));
    }

    // Wetter als Hintergrundbaender: Mastjahre gelb, harte Winter blau.
    // Zeilenweise geprueft, damit auch ein angeschnittenes Jahr markiert ist.
    var DPY = BT.Time.DAYS_PER_YEAR, DPS = BT.Time.DAYS_PER_SEASON;
    var bands = [
      { test: function (r) { return r.weather && r.weather.mast; }, color: 'rgba(242, 201, 76, 0.13)' },
      { test: function (r) { return r.weather && r.weather.winter > BT.Weather.HARD_WINTER && r.day % DPY >= 3 * DPS; }, color: 'rgba(120, 170, 255, 0.16)' }
    ];
    var half = pw / (n - 1) / 2;
    for (var b = 0; b < bands.length; b++) {
      ctx.fillStyle = bands[b].color;
      var runStart = -1;
      for (i = 0; i <= n; i++) {
        var on = i < n && bands[b].test(hist[i]);
        if (on && runStart < 0) runStart = i;
        if (!on && runStart >= 0) {
          var x0 = Math.max(L, x(runStart) - half), x1 = Math.min(L + pw, x(i - 1) + half);
          ctx.fillRect(x0, Tp, Math.max(1, x1 - x0), ph);
          runStart = -1;
        }
      }
    }

    // Ereignisse der Menschen als senkrechte Marke mit Symbol (Meldungen nur in der Chronik)
    var events = this.view.events || [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var e = 0; e < events.length; e++) {
      var info = BT.CARDS && BT.CARDS[events[e].card];
      if (info && info.kind === 'info') continue;          // Meldungen nur in der Chronik
      if (info && info.kind === 'folge' && !info.mark) continue;   // Folgen nur mit mark ins Diagramm
      var ek = events[e].day - d0;
      if (ek < 0 || ek > n - 1) continue;
      var ex = Math.round(x(ek)) + 0.5;
      // Gespielte Karte: durchgezogen orange; zurueckgenommen: lang gestrichelt blau;
      // Folge (tritt von selbst ein): gestrichelt rot
      var folge = info && info.kind === 'folge', undo = events[e].undo;
      ctx.strokeStyle = folge ? 'rgba(240, 110, 110, 0.85)' : undo ? 'rgba(150, 195, 235, 0.9)' : 'rgba(255, 170, 90, 0.9)'; ctx.lineWidth = 1.5;
      ctx.setLineDash(folge ? [3, 3] : undo ? [6, 2] : []);
      ctx.beginPath(); ctx.moveTo(ex, Tp); ctx.lineTo(ex, Tp + ph); ctx.stroke();
      ctx.setLineDash([]);
      var card = BT.CARDS && BT.CARDS[events[e].card];
      if (card) { ctx.font = '13px system-ui, sans-serif'; ctx.fillText(card.icon, ex, Tp + 2); ctx.font = '10px system-ui, sans-serif'; }
    }

    // Zeitmarken: Jahre, bei kurzem Zeitraum auch Jahreszeiten
    var years = (n - 1) / DPY;
    var maxLabels = Math.max(2, Math.floor(pw / 46));
    var stepY = Math.max(1, niceMax(years / maxLabels));
    var seasons = years <= 2.5;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (i = 0; i < n; i++) {
      var day = hist[i].day;
      if (day % DPS !== 0) continue;
      var cal = BT.Time.calendar(day);
      var px = Math.round(x(i)) + 0.5;
      if (cal.dayOfYear === 0 && (cal.year - 1) % stepY === 0) {
        ctx.strokeStyle = INK.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px, Tp); ctx.lineTo(px, Tp + ph); ctx.stroke();
        ctx.fillStyle = INK.text;
        ctx.fillText('J' + cal.year, x(i), Tp + ph + 4);
      } else if (seasons) {
        ctx.fillStyle = INK.text;
        ctx.globalAlpha = 0.6;
        ctx.fillText(SEASON_SHORT[cal.season], x(i), Tp + ph + 4);
        ctx.globalAlpha = 1;
      }
    }

    // Linien: hoechstens ein Punkt je Pixel
    var stride = Math.max(1, Math.floor(n / pw));
    // Flaeche zwischen zwei Reihen (series[].between = [oben, unten]); die Reihe selbst hat keine Linie
    for (s = 0; s < series.length; s++) {
      var bt = series[s].between;
      if (!bt) continue;
      ctx.fillStyle = series[s].color; ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (i = 0; i < n; i += stride) { if (i === 0) ctx.moveTo(x(i), y(this.val(bt[0], i))); else ctx.lineTo(x(i), y(this.val(bt[0], i))); }
      ctx.lineTo(x(n - 1), y(this.val(bt[0], n - 1)));
      ctx.lineTo(x(n - 1), y(this.val(bt[1], n - 1)));
      for (i = n - 1 - ((n - 1) % stride); i >= 0; i -= stride) ctx.lineTo(x(i), y(this.val(bt[1], i)));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (s = 0; s < series.length; s++) {
      if (series[s].between) continue;
      ctx.strokeStyle = series[s].color;
      ctx.setLineDash(series[s].dash || []);
      ctx.beginPath();
      for (i = 0; i < n; i += stride) {
        var lx = x(i), ly = y(this.val(s, i));
        if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      }
      ctx.lineTo(x(n - 1), y(this.val(s, n - 1)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Fadenkreuz: derselbe Tag in allen Diagrammen
    var hd = this.view.hoverDay;
    var idx = hd === null ? -1 : hd - d0;
    if (idx < 0 || idx >= n) { this.updateLegend(n - 1, false); return; }
    var row = hist[idx];
    var cx = Math.round(x(idx)) + 0.5;
    ctx.strokeStyle = INK.cross; ctx.lineWidth = 1;
    ctx.setLineDash(this.view.hoverChart === this ? [] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, Tp); ctx.lineTo(cx, Tp + ph); ctx.stroke();
    ctx.setLineDash([]);
    for (s = 0; s < series.length; s++) {
      if (series[s].between) continue;
      ctx.fillStyle = series[s].color;
      ctx.beginPath(); ctx.arc(x(idx), y(this.val(s, idx)), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    this.updateLegend(idx, true);

    // Tooltip nur im Diagramm unter dem Zeiger
    if (this.view.hoverChart !== this) return;
    var html = '<div class="tt-head">' + BT.Time.label(row.day) +
      (row.weather ? '<br>' + BT.Weather.describe(row.weather) : '') +
      (mean ? '<br>Mittel über ein Jahr' : '') + '</div>';
    for (s = 0; s < series.length; s++) {
      html += '<div><i style="background:' + series[s].color + '"></i>' + series[s].label + ' <b>' + this.fmt(this.val(s, idx), series[s]) + '</b></div>';
    }
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    var left = x(idx) + 10;
    if (left + 170 > W) left = x(idx) - 180;
    this.tip.style.left = left + 'px';
  };

  BT.ChartView = ChartView;
  BT.LineChart = LineChart;
})(typeof window !== 'undefined' ? window : globalThis);
