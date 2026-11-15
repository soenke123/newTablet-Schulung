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

  const clampW = (v, Wl) => Math.max(-(Wl - 12), Math.min(Wl - 12, v));

  function numGrad(h, x, z) {
    const e = 0.04;
    return [(h(x + e, z) - h(x - e, z)) / (2 * e), (h(x, z + e) - h(x, z - e)) / (2 * e)];
  }

  // Tiefsten Punkt suchen: grobes Raster, dann fein nachrutschen.
  function findMin(h, Wl) {
    const W = Wl || 50;
    let best = { x: 0, z: 0, h: Infinity };
    const N = Math.round(220 * W / 50);
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
     Je Level eigene Größe und Schwierigkeit (CFG). Level 1 + 2: große
     Welt (W 85), viele Mulden fast so tief wie die tiefste (Fallen),
     die tiefste ist schmal und liegt NICHT in der Mitte der großen
     Schüssel. Level 3: kleinere Welt, viele kleine Mulden (Fallen für
     zu kleine Lernraten). Alles wird mit k = W/50 mitskaliert, damit
     Hänge gleich steil bleiben. */
  const CFG = {
    1: { W: 85, pits: 13, hills: 10, bowl: 0.0024, deep: [5, 2.5], decoy: [3, 4], ps: [3.2, 4.5], hs: [6, 9] },
    2: { W: 85, pits: 13, hills: 10, bowl: 0.0024, deep: [5, 2.5], decoy: [3, 4], ps: [3.2, 4.5], hs: [6, 9] },
    3: { W: 50, pits: 8, hills: 5, bowl: 0.0034, deep: [2.5, 7], decoy: [2.5, 4.5], ps: [3.5, 5], hs: [5, 8] }
  };
  function hills(seed, level) {
    const C = CFG[level] || CFG[3], Wl = C.W, k = Wl / 50;
    const r = rng(seed * 7919 + level * 104729);
    const bumps = [];
    const cx = (r() * 2 - 1) * 12 * k, cz = (r() * 2 - 1) * 12 * k;
    for (let i = 0; i < C.pits; i++) {
      const ang = r() * Math.PI * 2;
      // die tiefste Mulde weg von der Mitte, die anderen überall
      const rad = i === 0 && k > 1 ? (0.35 + r() * 0.3) * Wl : (8 + r() * 32) * k;
      const ox = i === 0 && k > 1 ? cx : 0, oz = i === 0 && k > 1 ? cz : 0;
      const a = i === 0 ? C.deep[0] + r() * C.deep[1] : C.decoy[0] + r() * C.decoy[1];
      const sz = i === 0 && k > 1 ? 3.5 + r() * 2 : C.ps[0] + r() * C.ps[1] * k;
      bumps.push({ x: clampW(ox + Math.cos(ang) * rad, Wl), z: clampW(oz + Math.sin(ang) * rad, Wl), a: -a, s: sz });
    }
    for (let i = 0; i < C.hills; i++) {
      bumps.push({ x: (r() * 2 - 1) * 40 * k, z: (r() * 2 - 1) * 40 * k,
                   a: 3 + r() * 5, s: (C.hs[0] + r() * C.hs[1]) * Math.sqrt(k) });
    }
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = (0.13 + r() * 0.08) / Math.sqrt(k), f2 = (0.11 + r() * 0.08) / Math.sqrt(k);
    const bowl = C.bowl / (k * k);

    function h(x, z) {
      const dx = x - cx, dz = z - cz;
      let v = bowl * (dx * dx + dz * dz);
      // steiler Rand ganz außen, damit man drin bleibt
      const e = Math.max(Math.abs(x), Math.abs(z)) - (Wl - 7);
      if (e > 0) v += 0.18 * e * e;
      for (const b of bumps) {
        const qx = x - b.x, qz = z - b.z;
        v += b.a * Math.exp(-(qx * qx + qz * qz) / (2 * b.s * b.s));
      }
      v += 0.7 * Math.sin(f1 * x + p1) * Math.cos(f2 * z + p2);
      return v;
    }

    const min = findMin(h, Wl);
    // Start: hoch gelegen und weit weg vom tiefsten Punkt
    const cand = [];
    for (let i = 0; i < 500; i++) {
      const x = (r() * 2 - 1) * 0.76 * Wl, z = (r() * 2 - 1) * 0.76 * Wl;
      const d = Math.hypot(x - min.x, z - min.z);
      if (d > 0.64 * Wl) cand.push({ x, z, v: h(x, z) });
    }
    cand.sort((a, b) => b.v - a.v);
    const top = cand.slice(0, Math.max(1, Math.floor(cand.length * 0.3)));
    const st = top[Math.floor(r() * top.length)] || { x: -0.6 * Wl, z: 0.6 * Wl };
    const off = 3 + Math.round(r() * 40) / 10 - min.h;
    const W = Wl;

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
