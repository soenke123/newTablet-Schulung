/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/welt.js   ·   Die Landschaften
   ══════════════════════════════════════════════════════════════
   Eine Welt ist ein Quadrat von -W bis +W (x nach rechts, z nach
   vorn) mit einer Höhe h(x, z). Alles, was das Spiel braucht:

     welt.h(x, z)        Höhe an der Stelle (für Bild UND Spiel)
     welt.grad(x, z)     Gefälle nach oben [dh/dx, dh/dz]
     welt.step(p, lr)    EIN Schritt Gradientenabstieg mit Lernrate lr
                         → neue Stelle {x, z}, out: true wenn raus
     welt.min            tiefster Punkt {x, z, h}
     welt.start          Startpunkt {x, z}
     welt.show(h)        Zahl, die das Spiel anzeigt (Höhe in m bzw.
                         Fehler) – mit Versatz, damit der tiefste Punkt
                         nicht einfach „0“ heißt

   Zwei Arten:
     hills(seed, n)  Hügel mit Mulden – Level 1–3. Mehrere Mulden =
                     lokale Minima, ein Rand ringsum hält einen drin.
     model(seed)     Level 4: die Welt IST der Fehler eines Modells.
                     Eine Gerade y = w·(x−5) + b soll durch Messpunkte
                     (Sonnenblume: Höhe nach Wochen). Rechts/links = w,
                     vor/zurück = b, Höhe = mittlerer quadratischer
                     Fehler (gestaucht, damit der Rand nicht in den
                     Himmel wächst – die Richtung bleibt dieselbe).
                     Geschritten wird in w und b, wie im echten Training.
   ══════════════════════════════════════════════════════════════ */

window.NTWelt = (function () {
  'use strict';

  const W = 50;

  function rng(seed) {                    // mulberry32
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function numGrad(h, x, z) {
    const e = 0.04;
    return [(h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e)];
  }

  // Tiefsten Punkt suchen: grobes Raster, dann fein nachrutschen.
  function findMin(h) {
    let best = { x: 0, z: 0, h: Infinity };
    const N = 220;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const x = -W + 2 * W * i / N, z = -W + 2 * W * j / N, v = h(x, z);
      if (v < best.h) best = { x, z, h: v };
    }
    let { x, z } = best;
    for (let k = 0; k < 400; k++) {
      const g = numGrad(h, x, z);
      x -= 0.05 * g[0]; z -= 0.05 * g[1];
    }
    return { x, z, h: h(x, z) };
  }

  /* ── Hügel-Landschaft ──────────────────────────────────────
     n = Level: Level 3 bekommt mehr kleine Mulden (Fallen für zu
     kleine Lernraten). */
  function hills(seed, level) {
    const r = rng(seed * 7919 + level * 104729);
    const bumps = [];
    const pits = level >= 3 ? 8 : 5;
    for (let i = 0; i < pits; i++) {
      const ang = r() * Math.PI * 2, rad = 8 + r() * 32;
      bumps.push({ x: Math.cos(ang) * rad, z: Math.sin(ang) * rad,
                   a: -(2.5 + r() * (i === 0 ? 7 : 4.5)), s: 3.5 + r() * (level >= 3 ? 5 : 7) });
    }
    for (let i = 0; i < 5; i++) {
      bumps.push({ x: (r() * 2 - 1) * 40, z: (r() * 2 - 1) * 40,
                   a: 3 + r() * 5, s: 5 + r() * 8 });
    }
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = 0.13 + r() * 0.08, f2 = 0.11 + r() * 0.08;
    const cx = (r() * 2 - 1) * 12, cz = (r() * 2 - 1) * 12;

    function h(x, z) {
      const dx = x - cx, dz = z - cz;
      let v = 0.0034 * (dx * dx + dz * dz);
      // steiler Rand ganz außen, damit man drin bleibt
      const e = Math.max(Math.abs(x), Math.abs(z)) - (W - 7);
      if (e > 0) v += 0.18 * e * e;
      for (const b of bumps) {
        const qx = x - b.x, qz = z - b.z;
        v += b.a * Math.exp(-(qx * qx + qz * qz) / (2 * b.s * b.s));
      }
      v += 0.7 * Math.sin(f1 * x + p1) * Math.cos(f2 * z + p2);
      return v;
    }

    const min = findMin(h);
    // Start: hoch gelegen und weit weg vom tiefsten Punkt
    const cand = [];
    for (let i = 0; i < 500; i++) {
      const x = (r() * 2 - 1) * 38, z = (r() * 2 - 1) * 38;
      const d = Math.hypot(x - min.x, z - min.z);
      if (d > 32) cand.push({ x, z, v: h(x, z) });
    }
    cand.sort((a, b) => b.v - a.v);
    const top = cand.slice(0, Math.max(1, Math.floor(cand.length * 0.3)));
    const st = top[Math.floor(r() * top.length)] || { x: -30, z: 30 };
    const off = 3 + Math.round(r() * 40) / 10 - min.h;

    return {
      kind: 'hills', W, seed, level,
      h,
      grad: (x, z) => numGrad(h, x, z),
      step(p, lr) {
        const g = numGrad(h, p.x, p.z);
        const x = p.x - lr * g[0], z = p.z - lr * g[1];
        return { x, z, out: Math.abs(x) > W || Math.abs(z) > W };
      },
      min, start: { x: st.x, z: st.z },
      show: v => v + off,
      unit: 'm', label: 'Höhe'
    };
  }

  /* ── Level 4: der Fehler eines Modells ──────────────────────
     Sonnenblume, Höhe in cm nach Woche 1 … 9. Modell
     y = w·(x − 5) + b: w = Wachstum pro Woche, b = Höhe in Woche 5.
     (x − 5) statt x: so liegen w und b nicht auf einer schrägen
     Rinne, das Tal wird nur länglich – in echt nennt man das
     „Daten zentrieren“.) */
  function model(seed) {
    const r = rng(seed * 31337 + 4);
    const wTrue = 9 + r() * 6, bTrue = 50 + r() * 25;
    const pts = [];
    for (let x = 1; x <= 9; x++) {
      const noise = (r() + r() + r() - 1.5) * 12;
      pts.push({ x, y: Math.max(2, wTrue * (x - 5) + bTrue + noise) });
    }
    const W0 = -10, W1 = 30, B0 = 0, B1 = 130;
    const toW = x => W0 + (x + W) / (2 * W) * (W1 - W0);
    const toB = z => B0 + (z + W) / (2 * W) * (B1 - B0);
    const toX = w => (w - W0) / (W1 - W0) * 2 * W - W;
    const toZ = b => (b - B0) / (B1 - B0) * 2 * W - W;

    function loss(w, b) {
      let s = 0;
      for (const p of pts) { const d = w * (p.x - 5) + b - p.y; s += d * d; }
      return s / pts.length;
    }
    function lossGrad(w, b) {
      let gw = 0, gb = 0;
      for (const p of pts) {
        const d = w * (p.x - 5) + b - p.y;
        gw += 2 * d * (p.x - 5); gb += 2 * d;
      }
      return [gw / pts.length, gb / pts.length];
    }
    const H = 24, L0 = 1600;
    const lift = L => H * (1 - Math.exp(-L / L0));
    const h = (x, z) => lift(loss(toW(x), toB(z)));

    // Kleinster Fehler exakt (lineare Regression)
    let mx = 0, my = 0;
    for (const p of pts) { mx += p.x - 5; my += p.y; }
    mx /= pts.length; my /= pts.length;
    let sxy = 0, sxx = 0;
    for (const p of pts) { sxy += (p.x - 5 - mx) * (p.y - my); sxx += (p.x - 5 - mx) ** 2; }
    const wBest = sxy / sxx, bBest = my - wBest * mx;
    const min = { x: toX(wBest), z: toZ(bBest), h: h(toX(wBest), toZ(bBest)), w: wBest, b: bBest };

    const starts = [[26, 8], [-6, 120], [27, 118], [-7, 12]];
    const s = starts[Math.floor(r() * starts.length)];

    return {
      kind: 'model', W, seed, level: 4,
      h,
      grad: (x, z) => numGrad(h, x, z),
      step(p, lr) {
        const w = toW(p.x), b = toB(p.z);
        const g = lossGrad(w, b);
        const w2 = w - lr * g[0], b2 = b - lr * g[1];
        const x = toX(w2), z = toZ(b2);
        return { x, z, out: Math.abs(x) > W || Math.abs(z) > W };
      },
      min, start: { x: toX(s[0]), z: toZ(s[1]) },
      // angezeigt wird der echte Fehler, nicht die gestauchte Höhe
      show: v => -L0 * Math.log(Math.max(1e-9, 1 - v / H)),
      unit: '', label: 'Fehler',
      pts, toW, toB, loss
    };
  }

  return { W, hills, model, rng };
})();
