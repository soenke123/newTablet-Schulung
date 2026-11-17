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
      kind: 'hills', W, seed, level, dec: 1,
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
      kind: 'model', W, seed, level: 4, dec: 0,
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

  /* ── Level 5: ein Neuron sortiert Pinguine ─────────────────
     Echte Messdaten (Palmer Penguins, Antarktis 2007–2009, frei
     nutzbar CC0): Schnabellänge und Schnabelhöhe in mm von 68
     Adeliepinguinen (gleichmäßig aus 151 gezogen) und allen 68
     Zügelpinguinen. Ein Neuron mit Sigmoid sagt, wie sicher es
     „Zügelpinguin“ meint: p = σ(w₁·x₁ + w₂·x₂). x₁, x₂ sind die
     Messwerte zentriert und auf gleiche Streuung gebracht, darum
     braucht es keinen Bias (die Linie geht durch die Mitte der
     Daten). Rechts/links = w₁ (Länge), vor/zurück = w₂ (Höhe).
     Höhe der Welt = mittlerer Log-Fehler (Kreuzentropie), gestaucht.
     Richtung vom Mittelpunkt = Winkel der Trennlinie, Abstand =
     wie scharf das Neuron entscheidet. Die Arten überlappen kaum,
     das Tal liegt deshalb weit draußen am Ende einer langen Rinne. */
  const PENG_A = '39.1,18.7;40.3,18;39.3,20.6;39.2,19.6;42,20.2;41.1,17.6;34.6,21.1;38.7,19;34.4,18.4;37.8,18.3;38.2,18.1;35.3,18.9;40.5,17.9;40.5,18.9;39.5,17.8;36.4,17;38.8,20;37.6,19.3;36.5,18;44.1,19.7;39.6,18.8;37.5,18.9;42.3,21.2;35,17.9;34.5,18.1;39,17.5;36.5,16.6;35.7,16.9;41.1,18.2;41.6,18;41.1,19.1;41.8,19.4;39.6,17.2;35.5,17.5;40.9,16.8;36.2,16.1;34.6,17.2;35.1,19.4;41.3,20.3;36.9,18.6;38.9,18.8;34,17.1;36.2,17.3;38.1,18.6;33.1,16.1;35,17.9;37.8,20;39.7,18.9;38.2,20;43.2,19;39.7,17.7;39.6,20.7;38.6,17;35.7,17;36.2,17.2;41.4,18.5;40.6,19;41.5,18.3;44.1,18;36.8,18.5;38.1,17.6;35.6,17.5;37,16.5;40.2,17.1;40.7,17;39,18.7;36.6,18.4;37.8,18.1';
  const PENG_C = '46.5,17.9;50,19.5;51.3,19.2;45.4,18.7;52.7,19.8;45.2,17.8;46.1,18.2;51.3,18.2;46,18.9;51.3,19.9;46.6,17.8;51.7,20.3;47,17.3;52,18.1;45.9,17.1;50.5,19.6;50.3,20;58,17.8;46.4,18.6;49.2,18.2;42.4,17.3;48.5,17.5;43.2,16.6;50.6,19.4;46.7,17.9;52,19;50.5,18.4;49.5,19;46.4,17.8;52.8,20;40.9,16.6;54.2,20.8;42.5,16.7;51,18.8;49.7,18.6;47.5,16.8;47.6,18.3;52,20.7;46.9,16.6;53.5,19.9;49,19.5;46.2,17.5;50.9,19.1;45.5,17;50.9,17.9;50.8,18.5;50.1,17.9;49,19.6;51.5,18.7;49.8,17.3;48.1,16.4;51.4,19;45.7,17.3;50.7,19.7;42.5,17.3;52.2,18.8;45.2,16.6;49.3,19.9;50.2,18.8;45.6,19.4;51.9,19.5;46.8,16.5;45.7,17;55.8,19.8;43.5,18.1;49.6,18.2;50.8,19;50.2,18.7';
  function penguins(seed) {
    const raw = [];
    for (const [s, y] of [[PENG_A, 0], [PENG_C, 1]])
      for (const q of s.split(';')) { const [l, d] = q.split(',').map(Number); raw.push({ len: l, dep: d, y }); }
    const n = raw.length;
    const m1 = raw.reduce((a, p) => a + p.len, 0) / n, m2 = raw.reduce((a, p) => a + p.dep, 0) / n;
    const s1 = Math.sqrt(raw.reduce((a, p) => a + (p.len - m1) ** 2, 0) / n);
    const s2 = Math.sqrt(raw.reduce((a, p) => a + (p.dep - m2) ** 2, 0) / n);
    const pts = raw.map(p => ({ len: p.len, dep: p.dep, y: p.y, a: (p.len - m1) / s1, b: (p.dep - m2) / s2 }));
    const R = 20;                                   // Gewichte von −20 bis +20 (Tal bei ≈ 15,9)
    const toW = x => x / W * R, toX = w => w / R * W;
    const sig = z => 1 / (1 + Math.exp(-z));
    const softplus = z => z > 30 ? z : Math.log1p(Math.exp(z));
    function loss(w1, w2) {
      let s = 0;
      for (const p of pts) { const z = w1 * p.a + w2 * p.b; s += p.y ? softplus(-z) : softplus(z); }
      return s / n;
    }
    function lossGrad(w1, w2) {
      let g1 = 0, g2 = 0;
      for (const p of pts) { const e = sig(w1 * p.a + w2 * p.b) - p.y; g1 += e * p.a; g2 += e * p.b; }
      return [g1 / n, g2 / n];
    }
    const wrong = (w1, w2) => pts.reduce((c, p) => c + ((w1 * p.a + w2 * p.b > 0) !== (p.y === 1) ? 1 : 0), 0);
    const H = 24, L0 = 2;
    const lift = L => H * (1 - Math.exp(-L / L0));
    const h = (x, z) => lift(loss(toW(x), toW(z)));

    // tiefster Punkt: Newton-Schritte vom Mittelpunkt aus
    let a = 0, b = 0;
    for (let k = 0; k < 60; k++) {
      let g1 = 0, g2 = 0, h11 = 0, h12 = 0, h22 = 0;
      for (const p of pts) {
        const q = sig(a * p.a + b * p.b), e = q - p.y, v = q * (1 - q);
        g1 += e * p.a; g2 += e * p.b; h11 += v * p.a * p.a; h12 += v * p.a * p.b; h22 += v * p.b * p.b;
      }
      const det = h11 * h22 - h12 * h12;
      if (!(det > 1e-12)) break;
      a -= (h22 * g1 - h12 * g2) / det; b -= (h11 * g2 - h12 * g1) / det;
    }
    const min = { x: toX(a), z: toX(b), h: h(toX(a), toX(b)), w1: a, w2: b };

    // Start: Linie falsch herum (oder quer), mittel bis weit draußen
    const r = rng(seed * 6007 + 5);
    const ang0 = Math.atan2(b, a), ang = ang0 + Math.PI * (0.55 + r() * 0.9) * (r() < 0.5 ? -1 : 1);
    const rad = (0.45 + r() * 0.3) * R;
    const start = { x: toX(Math.cos(ang) * rad), z: toX(Math.sin(ang) * rad) };

    return {
      kind: 'penguin', W, seed, level: 5, dec: 2,
      h,
      grad: (x, z) => numGrad(h, x, z),
      step(p, lr) {
        const w1 = toW(p.x), w2 = toW(p.z);
        const g = lossGrad(w1, w2);
        const x = toX(w1 - lr * g[0]), z = toX(w2 - lr * g[1]);
        return { x, z, out: Math.abs(x) > W || Math.abs(z) > W };
      },
      min, start,
      show: v => -L0 * Math.log(Math.max(1e-9, 1 - v / H)),
      unit: '', label: 'Fehler',
      pts, toW, loss, wrong, sig, m1, m2, s1, s2
    };
  }

  /* ── Level 6/7: Treppenhaus-Licht (Wechselschaltung = XOR) ──
     Zwei Schalter, oben = +1, unten = −1. Das Licht brennt, wenn die
     Schalter VERSCHIEDEN stehen (so ist ein Treppenhaus verdrahtet).
     Lernen über die vier Fälle, Fehler = mittlerer Log-Fehler.

     Level 6 – EIN Neuron:  Licht = σ(w₁·S1 + w₂·S2)
       Ein Neuron zieht nur eine gerade Grenze; „verschieden“ liegt
       aber über Kreuz. Tiefster Punkt ist die Mitte (w = 0): dort sagt
       es überall 50 % – das Beste, was es kann, ist „weiß nicht“.

     Level 7 – ZWEI Neuronen A und B dazwischen:
       A = σ(a₁·S1 + a₂·S2 − 3),  B = σ(b₁·S1 + b₂·S2 − 3)
       Licht = σ(8·A + 8·B − 5)
       Lernbar sind nur die vier Kanten in A und B (a₁, a₂ = Welt A,
       b₁, b₂ = Welt B); Biase und die Kanten zur Lampe stehen fest
       (8, −3, −5), damit man das ganze Netz lesen kann. Lösung: A
       erkennt „nur S1 oben“ (a ≈ (+5, −5)), B „nur S2 oben“ – oder
       umgekehrt. Zwei gleich gute Täler; lernen beide dasselbe, hängt
       man fest (3 von 4 richtig). */
  function xor(seed) {
    const CASES = [[1, 1, 0], [1, -1, 1], [-1, 1, 1], [-1, -1, 0]];
    const C = 3, V = 8, D = 5, R = 8;
    const sig = z => 1 / (1 + Math.exp(-z));
    const ce = (o, y) => -(y ? Math.log(Math.max(o, 1e-12)) : Math.log(Math.max(1 - o, 1e-12)));
    const toW = x => x / W * R, toX = w => w / R * W;
    const H = 24, L0 = 0.8;
    const lift = L => H * (1 - Math.exp(-L / L0));
    const show = v => -L0 * Math.log(Math.max(1e-9, 1 - v / H));

    function fwd2(a1, a2, b1, b2) {
      return CASES.map(([s1, s2, y]) => {
        const A = sig(a1 * s1 + a2 * s2 - C), B = sig(b1 * s1 + b2 * s2 - C);
        return { s1, s2, y, A, B, o: sig(V * A + V * B - D) };
      });
    }
    function loss2(a1, a2, b1, b2) { return fwd2(a1, a2, b1, b2).reduce((t, c) => t + ce(c.o, c.y), 0) / 4; }
    function grad2(a1, a2, b1, b2) {
      const g = [0, 0, 0, 0];
      for (const c of fwd2(a1, a2, b1, b2)) {
        const e = c.o - c.y, dA = e * V * c.A * (1 - c.A), dB = e * V * c.B * (1 - c.B);
        g[0] += dA * c.s1; g[1] += dA * c.s2; g[2] += dB * c.s1; g[3] += dB * c.s2;
      }
      return g.map(v => v / 4);
    }
    function fwd1(w1, w2) { return CASES.map(([s1, s2, y]) => ({ s1, s2, y, o: sig(w1 * s1 + w2 * s2) })); }
    function loss1(w1, w2) { return fwd1(w1, w2).reduce((t, c) => t + ce(c.o, c.y), 0) / 4; }
    function grad1(w1, w2) {
      let g1 = 0, g2 = 0;
      for (const c of fwd1(w1, w2)) { g1 += (c.o - c.y) * c.s1; g2 += (c.o - c.y) * c.s2; }
      return [g1 / 4, g2 / 4];
    }
    const right = cs => cs.filter(c => (c.o > 0.5) === (c.y === 1)).length;

    const r = rng(seed * 4241 + 6);
    const rnd = () => (r() * 2 - 1) * 0.7 * R;

    // Level 6: eine Welt, ein Neuron
    function one() {
      const h = (x, z) => lift(loss1(toW(x), toW(z)));
      let st;
      do { st = { x: toX(rnd()), z: toX(rnd()) }; } while (Math.hypot(st.x, st.z) < 0.35 * W);
      return {
        kind: 'xor1', W, seed, level: 6, dec: 2, h,
        grad: (x, z) => numGrad(h, x, z),
        step(p, lr) {
          const w1 = toW(p.x), w2 = toW(p.z), g = grad1(w1, w2);
          const x = toX(w1 - lr * g[0]), z = toX(w2 - lr * g[1]);
          return { x, z, out: Math.abs(x) > W || Math.abs(z) > W };
        },
        min: { x: 0, z: 0, h: h(0, 0) }, start: st,
        show, unit: '', label: 'Fehler',
        toW, cases: (x, z) => fwd1(toW(x), toW(z)), right
      };
    }

    // Level 7: zwei Welten, ein Netz. Jede Welt ist ein Schnitt: Welt A
    // zeigt den Fehler über a₁/a₂, während b₁/b₂ dort stehen, wo die
    // Figur in Welt B gerade steht (und umgekehrt).
    function two() {
      let A0, B0, tries = 0;
      do {
        A0 = [rnd(), rnd()]; B0 = [rnd(), rnd()]; tries++;
      } while (tries < 50 && (right(fwd2(A0[0], A0[1], B0[0], B0[1])) > 2 || Math.hypot(A0[0] - B0[0], A0[1] - B0[1]) < 3));
      const sol = [[5, -5, -5, 5], [-5, 5, 5, -5]];
      return {
        kind: 'xor2', W, seed, level: 7, dec: 2, R, toW, toX, lift, show,
        H, start: [{ x: toX(A0[0]), z: toX(A0[1]) }, { x: toX(B0[0]), z: toX(B0[1]) }],
        loss: loss2, grad: grad2, fwd: fwd2, right, sol,
        // Höhe in Welt k bei (x, z), die andere Welt steht bei o = {x, z}
        h(k, x, z, o) {
          const a = k === 0 ? [toW(x), toW(z), toW(o.x), toW(o.z)] : [toW(o.x), toW(o.z), toW(x), toW(z)];
          return lift(loss2(a[0], a[1], a[2], a[3]));
        }
      };
    }
    return { one, two };
  }

  return { W, hills, model, penguins, xor, rng };
})();
