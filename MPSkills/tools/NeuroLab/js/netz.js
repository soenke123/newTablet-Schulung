/* ══════════════════════════════════════════════════════════════
   NeuroLab · netz.js — das Netz als Rechenmodell (ohne DOM)
   ══════════════════════════════════════════════════════════════
   Ein Netz:
     { inputs:  [{ key, label }],
       layers:  [ [neuron, …], … ],          Schicht 0 hängt an den Eingängen,
                                             Schicht l an Schicht l-1
       outputs: [{ key, label, src }] }      src = { l, n } oder null

   Ein Neuron: { act, w: [Gewicht je Eingang der Schicht], b }

   Die Ausgänge gehören dem SZENARIO und stehen fest. Welches Neuron
   an welchem Ausgang hängt, sagt src — die Reihenfolge der Neuronen
   ist damit egal (das war im alten NeuroLab das Problem bei XOR,
   AND & Co.: dort war „Ausgang 2“ einfach das zweite Neuron).

   Ein Neuron darf zugleich an einem Ausgang hängen UND in die
   nächste Schicht weiterleiten. Neuronen, die nirgends hinführen,
   rechnen mit, lernen aber nichts (Gradient 0).

   Läuft auch unter Node (tests/netz.test.mjs): module.exports.
   ══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  const ACTS = {
    step:    { name: 'Stufe',   f: z => (z > 0 ? 1 : 0), d: () => 1 },
    sigmoid: { name: 'Sigmoid', f: z => 1 / (1 + Math.exp(-z)), d: (y) => y * (1 - y) },
    relu:    { name: 'ReLU',    f: z => (z > 0 ? z : 0), d: (y, z) => (z > 0 ? 1 : 0) },
    tanh:    { name: 'Tanh',    f: z => Math.tanh(z), d: (y) => 1 - y * y },
    linear:  { name: 'Linear',  f: z => z, d: () => 1 }
  };

  function rnd(seed) {           // mulberry32 — gleiche Startgewichte bei gleichem Samen
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function inCount(net, l) { return l === 0 ? net.inputs.length : net.layers[l - 1].length; }

  function makeNeuron(n, act) { return { act: act || 'sigmoid', w: new Array(n).fill(0), b: 0 }; }

  /* Nach jeder Änderung am Aufbau: Gewichtslisten passend machen,
     Ausgänge lösen, deren Neuron es nicht mehr gibt. */
  function sync(net) {
    net.layers = net.layers.filter(L => L.length > 0);
    net.layers.forEach((L, l) => {
      const k = inCount(net, l);
      L.forEach(nr => {
        if (nr.w.length > k) nr.w.length = k;
        while (nr.w.length < k) nr.w.push(0);
      });
    });
    net.outputs.forEach(o => {
      if (o.src && !(net.layers[o.src.l] && net.layers[o.src.l][o.src.n])) o.src = null;
    });
    return net;
  }

  function randomize(net, seed) {
    const r = rnd(seed == null ? (Date.now() & 0xffffff) : seed);
    net.layers.forEach((L, l) => {
      const k = Math.max(1, inCount(net, l));
      L.forEach(nr => {
        const s = nr.act === 'relu' ? Math.sqrt(2 / k) : 1 / Math.sqrt(k);
        nr.w = nr.w.map(() => (r() * 2 - 1) * s * 1.6);
        nr.b = (r() * 2 - 1) * 0.3;
      });
    });
    return net;
  }

  /* Vorwärts: liefert je Schicht z und y. */
  function forward(net, x) {
    const zs = [], ys = [];
    let prev = x;
    net.layers.forEach((L) => {
      const z = [], y = [];
      L.forEach(nr => {
        let s = nr.b;
        for (let i = 0; i < nr.w.length; i++) s += nr.w[i] * (prev[i] || 0);
        z.push(s);
        y.push(ACTS[nr.act].f(s));
      });
      zs.push(z); ys.push(y); prev = y;
    });
    return { x, zs, ys };
  }

  function outValues(net, run) {
    return net.outputs.map(o => (o.src ? run.ys[o.src.l][o.src.n] : null));
  }

  function predict(net, x) { return outValues(net, forward(net, x)); }

  /* Fehler (halber quadratischer Fehler) nur an angeschlossenen Ausgängen. */
  function sampleLoss(net, x, t) {
    const y = predict(net, x);
    let s = 0;
    y.forEach((v, i) => { if (v != null && t[i] != null) s += (v - t[i]) * (v - t[i]); });
    return s / 2;
  }

  /* Rückwärts für ein Beispiel. Liefert die Gradienten
     { gw: [[[…]]], gb: [[…]], err: [Ausgang - Soll] } — ohne sie anzuwenden
     (die Zeitlupe zeigt sie erst). */
  function gradients(net, x, t) {
    const run = forward(net, x);
    const dy = run.ys.map(y => y.map(() => 0));     // dE/dy je Neuron
    const err = net.outputs.map((o, i) => {
      if (!o.src || t[i] == null) return null;
      const e = run.ys[o.src.l][o.src.n] - t[i];
      dy[o.src.l][o.src.n] += e;
      return e;
    });
    const gw = net.layers.map(L => L.map(nr => nr.w.map(() => 0)));
    const gb = net.layers.map(L => L.map(() => 0));
    for (let l = net.layers.length - 1; l >= 0; l--) {
      const prevY = l === 0 ? x : run.ys[l - 1];
      net.layers[l].forEach((nr, n) => {
        if (dy[l][n] === 0) return;
        const act = ACTS[nr.act];
        // Die Stufe hat keine brauchbare Ableitung — wie beim Perzeptron
        // geht der Fehler unverändert durch (Ableitung 1).
        const delta = dy[l][n] * act.d(run.ys[l][n], run.zs[l][n]);
        gb[l][n] = delta;
        nr.w.forEach((w, i) => {
          gw[l][n][i] = delta * (prevY[i] || 0);
          if (l > 0) dy[l - 1][i] += delta * w;
        });
      });
    }
    return { gw, gb, err, run };
  }

  function apply(net, g, lr) {
    net.layers.forEach((L, l) => L.forEach((nr, n) => {
      nr.w = nr.w.map((w, i) => clampW(w - lr * g.gw[l][n][i]));
      nr.b = clampW(nr.b - lr * g.gb[l][n]);
    }));
  }
  const clampW = v => (v > 50 ? 50 : v < -50 ? -50 : v);

  function trainSample(net, x, t, lr) {
    const g = gradients(net, x, t);
    apply(net, g, lr);
    return g;
  }

  /* Durchschnittlicher Fehler und Trefferquote über einen Datensatz.
     „Treffer“: bei Klassen (cls) der größte Ausgang = Soll-Klasse, sonst
     jeder Ausgang auf weniger als tol am Soll. */
  function evaluate(net, rows, opt) {
    opt = opt || {};
    const tol = opt.tol == null ? 0.5 : opt.tol;
    if (!rows.length) return { loss: 0, acc: 0 };
    let loss = 0, ok = 0;
    rows.forEach(r => {
      const y = predict(net, r.x);
      let s = 0, hit = true;
      y.forEach((v, i) => {
        if (r.t[i] == null) return;
        if (v == null) { hit = false; s += 0.5 * r.t[i] * r.t[i]; return; }
        s += 0.5 * (v - r.t[i]) * (v - r.t[i]);
        if (!opt.cls && Math.abs(v - r.t[i]) >= tol) hit = false;
      });
      if (opt.cls) {
        let best = -1, bi = -1;
        y.forEach((v, i) => { if (v != null && v > best) { best = v; bi = i; } });
        hit = bi >= 0 && r.t[bi] === 1;
      }
      loss += s; if (hit) ok++;
    });
    return { loss: loss / rows.length, acc: ok / rows.length };
  }

  function clone(net) { return JSON.parse(JSON.stringify(net)); }

  function countNeurons(net) { return net.layers.reduce((s, L) => s + L.length, 0); }

  const API = { ACTS, rnd, makeNeuron, sync, randomize, forward, predict, outValues,
    sampleLoss, gradients, apply, trainSample, evaluate, clone, inCount, countNeurons };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.NLNetz = API;
})(typeof window !== 'undefined' ? window : globalThis);
