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
                     Ein Neuron ohne σ schätzt das Gewicht eines Pinguins
                     aus seiner Flosse: Gewicht = w·(Flosse − 20) + b.
                     Rechts/links = w, vor/zurück = b, Höhe = mittlerer
                     quadratischer Fehler (gestaucht, damit der Rand nicht
                     in den Himmel wächst – die Richtung bleibt dieselbe).
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
    const N = Math.min(320, Math.round(220 * W / 50));   // große Welten (Level 1/2) etwas gröber, das Nachrutschen findet den Boden
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
     Je Level eigene Größe und Schwierigkeit (CFG). Seit 17.11.2026
     größer und abwechslungsreicher (Sönke): außer Mulden und Hügeln je
     Welt ein GEBIRGE (Grat mit einem Pass), eine SCHLUCHT (schmale
     Rinne, deren Boden zu einem Ende abfällt – eine lange Falle) und
     eine TIEFERE EBENE (abgesenkte Fläche mit Stufe am Rand).
     Grundform: Kegel (überall etwa gleich steil, tilt) + Schüssel um
     (cx, cz). Der Kegel sorgt dafür, dass es auch weit weg vom Ziel
     NIE ganz flach ist – sonst kommt man in Level 3 mit Sprüngen dort
     nicht mehr weg (Sprungweite = Lernrate × Steilheit).
     Level 1 + 2: die tiefste Mulde schmal und abseits der Mitte (Laufen).
     Level 3: die tiefste Mulde nahe der Mitte – mit guter Lernrate
     erreichbar, zu kleine bleibt in den Fallen hängen, zu große fliegt raus.
     Alles wird mit k = W/50 mitskaliert, damit Hänge gleich steil bleiben. */
  const CFG = {
    1: { W: 110, pits: 17, hills: 13, tilt: 0.05, bowl: 0.0016, deep: [5.5, 2.5], deepOff: true, decoy: [3, 4], ps: [3.2, 4.5], hs: [6, 9],
         ridge: [7, 5], canyon: [4, 1.5], plain: [4.5, 1.5] },
    3: { W: 64, pits: 7, hills: 5, tilt: 0.55, bowl: 0.0012, deep: [5, 2], deepOff: false, decoy: [2, 3], ps: [3.2, 3.5], hs: [5, 7],
         ridge: [4, 2], canyon: [2.5, 1], plain: [2.5, 1] }   // simuliert: Lernrate 3 → 3 %, 6 → 46 %, 10 → 54 %, 15 → 33 % am Ziel (25 Sprünge)
  };
  CFG[2] = CFG[1];

  // Abstand von (x, z) zu einem Linienzug pts → [Abstand, t entlang 0…1]
  function polyDist(pts, x, z) {
    let best = Infinity, bt = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0], az = pts[i][1], dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az;
      const l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + u * dx - x, qz = az + u * dz - z, d = qx * qx + qz * qz;
      if (d < best) { best = d; bt = (i + u) / (pts.length - 1); }
    }
    return [Math.sqrt(best), bt];
  }
  // geschwungene Linie (quadratische Bézier) als Punkte + Rahmen zum schnellen Aussortieren
  function curve(r, Wl, len) {
    const ang = r() * Math.PI * 2, mx = (r() * 2 - 1) * 0.45 * Wl, mz = (r() * 2 - 1) * 0.45 * Wl;
    const hx = Math.cos(ang) * len / 2, hz = Math.sin(ang) * len / 2;
    const bend = (r() * 2 - 1) * len * 0.35;
    const p0 = [mx - hx, mz - hz], p2 = [mx + hx, mz + hz], p1 = [mx - hz / (len / 2) * bend, mz + hx / (len / 2) * bend];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      pts.push([clampW(a * p0[0] + b * p1[0] + c * p2[0], Wl + 6), clampW(a * p0[1] + b * p1[1] + c * p2[1], Wl + 6)]);
    }
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    return { pts, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] };
  }
  const inBox = (bx, x, z, m) => x > bx[0] - m && x < bx[1] + m && z > bx[2] - m && z < bx[3] + m;

  function hills(seed, level) {
    const C = CFG[level] || CFG[3], Wl = C.W, k = Wl / 50, sk = Math.sqrt(k);
    const r = rng(seed * 7919 + level * 104729);
    const bumps = [];
    const cx = (r() * 2 - 1) * 12 * k, cz = (r() * 2 - 1) * 12 * k;
    for (let i = 0; i < C.pits; i++) {
      const ang = r() * Math.PI * 2;
      const far = i === 0 && C.deepOff;
      // die tiefste Mulde: Level 1/2 weg von der Mitte, Level 3 nah an der Mitte
      const rad = far ? (0.35 + r() * 0.3) * Wl : i === 0 ? r() * 6 * k : (8 + r() * 34) * k;
      const ox = i === 0 ? cx : 0, oz = i === 0 ? cz : 0;
      const a = i === 0 ? C.deep[0] + r() * C.deep[1] : C.decoy[0] + r() * C.decoy[1];
      const sz = far ? 3.5 + r() * 2 : i === 0 ? 6 + r() * 2 : C.ps[0] + r() * C.ps[1] * sk;
      bumps.push({ x: clampW(ox + Math.cos(ang) * rad, Wl), z: clampW(oz + Math.sin(ang) * rad, Wl), a: -a, s: sz });
    }
    for (let i = 0; i < C.hills; i++) {
      bumps.push({ x: (r() * 2 - 1) * 40 * k, z: (r() * 2 - 1) * 40 * k,
                   a: 3 + r() * 5, s: (C.hs[0] + r() * C.hs[1]) * sk });
    }
    // Gebirge: Grat mit Zacken und einem Pass
    const ridge = curve(r, Wl, (0.9 + r() * 0.5) * Wl), rA = C.ridge[0] + r() * C.ridge[1], rS = (3.5 + r() * 1.5) * sk,
      rPass = 0.25 + r() * 0.5, rPh = r() * 6.28;
    // Schlucht: schmal, Boden fällt zu einem Ende ab
    const canyon = curve(r, Wl, (0.7 + r() * 0.4) * Wl), cA = C.canyon[0] + r() * C.canyon[1], cS = (1.6 + r() * 0.6) * sk,
      cDir = r() < 0.5 ? 0 : 1;
    // tiefere Ebene: Kreis, abgesenkt, mit weicher Stufe
    const ang = r() * 6.28, er = (0.25 + r() * 0.35) * Wl;
    const plain = { x: Math.cos(ang) * er, z: Math.sin(ang) * er, R: (12 + r() * 7) * k, a: C.plain[0] + r() * C.plain[1] };
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = (0.13 + r() * 0.08) / sk, f2 = (0.11 + r() * 0.08) / sk;
    const bowl = C.bowl / (k * k), tilt = C.tilt, c0 = 10 * k;

    function h(x, z) {
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      let v = bowl * d2 + tilt * Math.sqrt(d2 + c0 * c0);
      // steiler Rand ganz außen, damit man drin bleibt
      const e = Math.max(Math.abs(x), Math.abs(z)) - (Wl - 7);
      if (e > 0) v += 0.18 * e * e;
      for (const b of bumps) {
        const qx = x - b.x, qz = z - b.z;
        v += b.a * Math.exp(-(qx * qx + qz * qz) / (2 * b.s * b.s));
      }
      if (inBox(ridge.box, x, z, rS * 4)) {
        const [d, t] = polyDist(ridge.pts, x, z);
        const pass = 1 - 0.8 * Math.exp(-((t - rPass) ** 2) / 0.006);
        const ends = Math.min(1, t * 6, (1 - t) * 6);
        v += rA * pass * ends * (1 + 0.28 * Math.sin(t * 23 + rPh)) * Math.exp(-(d * d) / (2 * rS * rS));
      }
      if (inBox(canyon.box, x, z, cS * 4)) {
        const [d, t] = polyDist(canyon.pts, x, z);
        const along = cDir ? t : 1 - t, ends = Math.min(1, t * 8, (1 - t) * 8);
        v -= cA * (0.55 + 0.45 * along) * ends * Math.exp(-(d * d) / (2 * cS * cS));
      }
      const pd = Math.hypot(x - plain.x, z - plain.z);
      v -= plain.a / (1 + Math.exp((pd - plain.R) / (1.6 * sk)));
      v += 0.7 * Math.sin(f1 * x + p1) * Math.cos(f2 * z + p2);
      return v;
    }

    const min = findMin(h, Wl);
    // Start: hoch gelegen und weit weg vom tiefsten Punkt
    const cand = [];
    for (let i = 0; i < 500; i++) {
      const x = (r() * 2 - 1) * 0.76 * Wl, z = (r() * 2 - 1) * 0.76 * Wl;
      const d = Math.hypot(x - min.x, z - min.z);
      // Level 3 (Springen): nicht auf einer Kuppe starten – dort ist es flach und die Sprünge winzig
      if (d > 0.64 * Wl && (C.tilt < 0.3 || Math.hypot(...numGrad(h, x, z)) > 0.6 * C.tilt)) cand.push({ x, z, v: h(x, z) });
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

  /* ── Level 4: Wie schwer ist der Pinguin? ───────────────────
     Echte Messdaten (Palmer Penguins, Antarktis 2007–2009, CC0): alle
     342 Pinguine mit Flossenlänge (mm) und Körpergewicht (g) –
     151 Adelie, 68 Zügel, 123 Esel. Ein Neuron OHNE σ schätzt das
     Gewicht aus der Flosse:  Gewicht = w·(Flosse − 20 cm) + b.
     w = kg pro cm Flosse, b = Gewicht eines Pinguins mit 20-cm-Flosse.
     (− 20 cm: so liegen w und b nicht auf einer schrägen Rinne – in
     echt nennt man das „Daten zentrieren“.) Rechts/links = w,
     vor/zurück = b, Höhe = mittlerer quadratischer Fehler (gestaucht).
     Angezeigt wird die Wurzel daraus: „so viele kg liegt das Neuron im
     Schnitt daneben“. Bestes Neuron: w ≈ 0,50, b ≈ 4,16, ± 0,39 kg.
     Ab Lernrate ≈ 0,5 explodiert das Training (größter Eigenwert der
     Krümmung ≈ 4). Der Seed wählt nur den Start, die Daten bleiben. */
  const MASS = ["181,3.75;186,3.8;195,3.25;193,3.45;190,3.65;181,3.625;195,4.675;193,3.475;190,4.25;186,3.3;180,3.7;182,3.2;191,3.8;198,4.4;185,3.7;195,3.45;197,4.5;184,3.325;194,4.2;174,3.4;180,3.6;189,3.8;185,3.95;180,3.8;187,3.8;183,3.55;187,3.2;172,3.15;180,3.95;178,3.25;178,3.9;188,3.3;184,3.9;195,3.325;196,4.15;190,3.95;180,3.55;181,3.3;184,4.65;182,3.15;195,3.9;186,3.1;196,4.4;185,3;190,4.6;182,3.425;179,2.975;190,3.45;191,4.15;186,3.5;188,4.3;190,3.45;200,4.05;187,2.9;191,3.7;186,3.55;193,3.8;181,2.85;194,3.75;185,3.15;195,4.4;185,3.6;192,4.05;184,2.85;192,3.95;195,3.35;188,4.1;190,3.05;198,4.45;190,3.6;190,3.9;196,3.55;197,4.15;190,3.7;195,4.25;191,3.7;184,3.9;187,3.55;195,4;189,3.2;196,4.7;187,3.8;193,4.2;191,3.35;194,3.55;190,3.8;189,3.5;189,3.95;190,3.6;202,3.55;205,4.3;185,3.4;186,4.45;187,3.3;208,4.3;190,3.7;196,4.35;178,2.9;192,4.1;192,3.725;203,4.725;183,3.075;190,4.25;193,2.925;184,3.55;199,3.75;190,3.9;181,3.175;197,4.775;198,3.825;191,4.6;193,3.2;197,4.275;191,3.9;196,4.075;188,2.9;199,3.775;189,3.35;189,3.325;187,3.15;198,3.5;176,3.45;202,3.875;186,3.05;199,4;191,3.275;195,4.3;191,3.05;210,4;190,3.325;197,3.5;193,3.5;199,4.475;187,3.425;190,3.9;191,3.175;200,3.975;185,3.4;193,4.25;193,3.4;187,3.475;188,3.05;190,3.725;192,3;185,3.65;190,4.25;184,3.475;195,3.45;193,3.75;187,3.7;201,4", "192,3.5;196,3.9;193,3.65;188,3.525;197,3.725;198,3.95;178,3.25;197,3.75;195,4.15;198,3.7;193,3.8;194,3.775;185,3.7;201,4.05;190,3.575;201,4.05;197,3.3;181,3.7;190,3.45;195,4.4;181,3.6;191,3.4;187,2.9;193,3.8;195,3.3;197,4.15;200,3.4;200,3.8;191,3.7;205,4.55;187,3.2;201,4.3;187,3.35;203,4.1;195,3.6;199,3.9;195,3.85;210,4.8;192,2.7;205,4.5;210,3.95;187,3.65;196,3.55;196,3.5;196,3.675;201,4.45;190,3.4;212,4.3;187,3.25;198,3.675;199,3.325;201,3.95;193,3.6;203,4.05;187,3.35;197,3.45;191,3.25;203,4.05;202,3.8;194,3.525;206,3.95;189,3.65;195,3.65;207,4;202,3.4;193,3.775;210,4.1;198,3.775", "211,4.5;230,5.7;210,4.45;218,5.7;215,5.4;210,4.55;211,4.8;219,5.2;209,4.4;215,5.15;214,4.65;216,5.55;214,4.65;213,5.85;210,4.2;217,5.85;210,4.15;221,6.3;209,4.8;222,5.35;218,5.7;215,5;213,4.4;215,5.05;215,5;215,5.1;216,4.1;215,5.65;210,4.6;220,5.55;222,5.25;209,4.7;207,5.05;230,6.05;220,5.15;220,5.4;213,4.95;219,5.25;208,4.35;208,5.35;208,3.95;225,5.7;210,4.3;216,4.75;222,5.55;217,4.9;210,4.2;225,5.4;213,5.1;215,5.3;210,4.85;220,5.3;210,4.4;225,5;217,4.9;220,5.05;208,4.3;220,5;208,4.45;224,5.55;208,4.2;221,5.3;214,4.4;231,5.65;219,4.7;230,5.7;214,4.65;229,5.8;220,4.7;223,5.55;216,4.75;221,5;221,5.1;217,5.2;216,4.7;230,5.8;209,4.6;220,6;215,4.75;223,5.95;212,4.625;221,5.45;212,4.725;224,5.35;212,4.75;228,5.6;218,4.6;218,5.3;212,4.875;230,5.55;218,4.95;228,5.4;212,4.75;224,5.65;214,4.85;226,5.2;216,4.925;222,4.875;203,4.625;225,5.25;219,4.85;228,5.6;215,4.975;228,5.5;216,4.725;215,5.5;210,4.7;219,5.5;208,4.575;209,5.5;216,5;229,5.95;213,4.65;230,5.5;217,4.375;230,5.85;217,4.875;222,6;214,4.925;215,4.85;222,5.75;212,5.2;213,5.4"];
  const MASS_SP = ['adelie', 'chin', 'gentoo'];
  function model(seed) {
    const r = rng(seed * 31337 + 4);
    const pts = [];
    MASS.forEach((str, k) => {
      for (const q of str.split(';')) { const [f, m] = q.split(',').map(Number); pts.push({ x: f / 10, y: m, sp: MASS_SP[k] }); }
    });
    const X0 = 20;                                    // Flosse wird um 20 cm zentriert
    const W0 = -1, W1 = 2, B0 = 1.4, B1 = 7;
    const toW = x => W0 + (x + W) / (2 * W) * (W1 - W0);
    const toB = z => B0 + (z + W) / (2 * W) * (B1 - B0);
    const toX = w => (w - W0) / (W1 - W0) * 2 * W - W;
    const toZ = b => (b - B0) / (B1 - B0) * 2 * W - W;
    const pred = (w, b, x) => w * (x - X0) + b;

    function loss(w, b) {
      let s = 0;
      for (const p of pts) { const d = pred(w, b, p.x) - p.y; s += d * d; }
      return s / pts.length;
    }
    function lossGrad(w, b) {
      let gw = 0, gb = 0;
      for (const p of pts) {
        const d = pred(w, b, p.x) - p.y;
        gw += 2 * d * (p.x - X0); gb += 2 * d;
      }
      return [gw / pts.length, gb / pts.length];
    }
    const H = 24, L0 = 3;
    const lift = L => H * (1 - Math.exp(-L / L0));
    const h = (x, z) => lift(loss(toW(x), toB(z)));

    // Kleinster Fehler exakt (lineare Regression)
    let mx = 0, my = 0;
    for (const p of pts) { mx += p.x - X0; my += p.y; }
    mx /= pts.length; my /= pts.length;
    let sxy = 0, sxx = 0;
    for (const p of pts) { sxy += (p.x - X0 - mx) * (p.y - my); sxx += (p.x - X0 - mx) ** 2; }
    const wBest = sxy / sxx, bBest = my - wBest * mx;
    const min = { x: toX(wBest), z: toZ(bBest), h: h(toX(wBest), toZ(bBest)), w: wBest, b: bBest };

    const starts = [[1.75, 1.9], [-0.75, 6.5], [1.8, 6.4], [-0.7, 2.0], [0.5, 6.7], [0.4, 1.7]];
    const s = starts[Math.floor(r() * starts.length)];

    return {
      kind: 'model', W, seed, level: 4, dec: 2,
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
      // angezeigt wird der echte Fehler in kg (Wurzel des mittleren Quadrats), nicht die gestauchte Höhe
      show: v => Math.sqrt(-L0 * Math.log(Math.max(1e-9, 1 - v / H))),
      unit: 'kg', label: 'Fehler',
      pts, toW, toB, loss, pred, X0
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

  /* ── Level 6/7: Das Nest (XOR) ──────────────────────────────
     Pinguin-Eltern wechseln sich ab: einer brütet, der andere fischt.
     Eingänge Mama/Papa am Nest: ja = +1, nein = −1. Dem Ei geht es gut,
     wenn GENAU EINER am Nest ist (beide weg: Ei kühlt aus/Raubmöwe;
     beide da: niemand holt Futter) – das ist XOR. In den Formeln
     unten steht S1 = Mama, S2 = Papa, „Licht“ = Ei gut versorgt.
     Lernen über die vier Fälle, Fehler = mittlerer Log-Fehler.

     Level 6 – EIN Neuron:  Ei = σ(w₁·Mama + w₂·Papa)
       Ein Neuron zieht nur eine gerade Grenze; „verschieden“ liegt
       aber über Kreuz. Tiefster Punkt ist die Mitte (w = 0): dort sagt
       es überall 50 % – das Beste, was es kann, ist „weiß nicht“.

     Level 7 – ZWEI Neuronen A und B dazwischen:
       A = σ(a₁·S1 + a₂·S2 − 3),  B = σ(b₁·S1 + b₂·S2 − 3)
       Licht = σ(8·A + 8·B − 5)
       Lernbar sind nur die vier Kanten in A und B (a₁, a₂ = Welt A,
       b₁, b₂ = Welt B); Biase und die Kanten zur Lampe stehen fest
       (8, −3, −5), damit man das ganze Netz lesen kann. Lösung: A
       erkennt „nur Mama da“ (a ≈ (+5, −5)), B „nur Papa da“ – oder
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
      // Gewichte hier nur ±6 statt ±8 (Sönke 17.11.2026): bei ±8 waren die versteckten Neuronen
      // oft „satt“ (σ ganz 0 oder 1) → breite flache Terrassen, Sprünge von 0,1 m. Mit ±6 halb so
      // viele flache Stellen, ~80 % lernen es mit Lernrate 4 weiter, ~20 % bleiben bei 3 von 4 hängen.
      const R = 6, toW = x => x / W * R, toX = w => w / R * W, rnd = () => (r() * 2 - 1) * 0.7 * R;
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

  /* ── Labor: Pinguine in 3D (labor.html) ──────────────────────
     Alle 342 Pinguine mit vollständigen Maßen (Palmer Penguins, CC0):
     151 Adelie-, 68 Zügel-, 123 Eselspinguine; Eingänge Schnabellänge,
     Schnabelhöhe, Flossenlänge (zentriert, gleiche Streuung). Drei
     Ausgangsneuronen, je eines pro Art: p_k = σ(w_k·x + b_k) beantwortet
     „Bin das ich?“; die Art mit dem größten p gewinnt. 12 Werte =
     6 Welten (je Neuron: Länge/Höhe und Flosse/Bias).
     Fehler = Summe der drei Log-Fehler + kleine Strafe für große Gewichte
     (λ = 0,002, Regularisierung) – ohne sie läge das Tal der
     Eselspinguine im Unendlichen, weil sie sich perfekt abtrennen lassen. */
  const PENG3 = ["39.1,18.7,181;39.5,17.4,186;40.3,18,195;36.7,19.3,193;39.3,20.6,190;38.9,17.8,181;39.2,19.6,195;34.1,18.1,193;42,20.2,190;37.8,17.1,186;37.8,17.3,180;41.1,17.6,182;38.6,21.2,191;34.6,21.1,198;36.6,17.8,185;38.7,19,195;42.5,20.7,197;34.4,18.4,184;46,21.5,194;37.8,18.3,174;37.7,18.7,180;35.9,19.2,189;38.2,18.1,185;38.8,17.2,180;35.3,18.9,187;40.6,18.6,183;40.5,17.9,187;37.9,18.6,172;40.5,18.9,180;39.5,16.7,178;37.2,18.1,178;39.5,17.8,188;40.9,18.9,184;36.4,17,195;39.2,21.1,196;38.8,20,190;42.2,18.5,180;37.6,19.3,181;39.8,19.1,184;36.5,18,182;40.8,18.4,195;36,18.5,186;44.1,19.7,196;37,16.9,185;39.6,18.8,190;41.1,19,182;37.5,18.9,179;36,17.9,190;42.3,21.2,191;39.6,17.7,186;40.1,18.9,188;35,17.9,190;42,19.5,200;34.5,18.1,187;41.4,18.6,191;39,17.5,186;40.6,18.8,193;36.5,16.6,181;37.6,19.1,194;35.7,16.9,185;41.3,21.1,195;37.6,17,185;41.1,18.2,192;36.4,17.1,184;41.6,18,192;35.5,16.2,195;41.1,19.1,188;35.9,16.6,190;41.8,19.4,198;33.5,19,190;39.7,18.4,190;39.6,17.2,196;45.8,18.9,197;35.5,17.5,190;42.8,18.5,195;40.9,16.8,191;37.2,19.4,184;36.2,16.1,187;42.1,19.1,195;34.6,17.2,189;42.9,17.6,196;36.7,18.8,187;35.1,19.4,193;37.3,17.8,191;41.3,20.3,194;36.3,19.5,190;36.9,18.6,189;38.3,19.2,189;38.9,18.8,190;35.7,18,202;41.1,18.1,205;34,17.1,185;39.6,18.1,186;36.2,17.3,187;40.8,18.9,208;38.1,18.6,190;40.3,18.5,196;33.1,16.1,178;43.2,18.5,192;35,17.9,192;41,20,203;37.7,16,183;37.8,20,190;37.9,18.6,193;39.7,18.9,184;38.6,17.2,199;38.2,20,190;38.1,17,181;43.2,19,197;38.1,16.5,198;45.6,20.3,191;39.7,17.7,193;42.2,19.5,197;39.6,20.7,191;42.7,18.3,196;38.6,17,188;37.3,20.5,199;35.7,17,189;41.1,18.6,189;36.2,17.2,187;37.7,19.8,198;40.2,17,176;41.4,18.5,202;35.2,15.9,186;40.6,19,199;38.8,17.6,191;41.5,18.3,195;39,17.1,191;44.1,18,210;38.5,17.9,190;43.1,19.2,197;36.8,18.5,193;37.5,18.5,199;38.1,17.6,187;41.1,17.5,190;35.6,17.5,191;40.2,20.1,200;37,16.5,185;39.7,17.9,193;40.2,17.1,193;40.6,17.2,187;32.1,15.5,188;40.7,17,190;37.3,16.8,192;39,18.7,185;39.2,18.6,190;36.6,18.4,184;36,17.8,195;37.8,18.1,193;36,17.1,187;41.5,18.5,201", "46.5,17.9,192;50,19.5,196;51.3,19.2,193;45.4,18.7,188;52.7,19.8,197;45.2,17.8,198;46.1,18.2,178;51.3,18.2,197;46,18.9,195;51.3,19.9,198;46.6,17.8,193;51.7,20.3,194;47,17.3,185;52,18.1,201;45.9,17.1,190;50.5,19.6,201;50.3,20,197;58,17.8,181;46.4,18.6,190;49.2,18.2,195;42.4,17.3,181;48.5,17.5,191;43.2,16.6,187;50.6,19.4,193;46.7,17.9,195;52,19,197;50.5,18.4,200;49.5,19,200;46.4,17.8,191;52.8,20,205;40.9,16.6,187;54.2,20.8,201;42.5,16.7,187;51,18.8,203;49.7,18.6,195;47.5,16.8,199;47.6,18.3,195;52,20.7,210;46.9,16.6,192;53.5,19.9,205;49,19.5,210;46.2,17.5,187;50.9,19.1,196;45.5,17,196;50.9,17.9,196;50.8,18.5,201;50.1,17.9,190;49,19.6,212;51.5,18.7,187;49.8,17.3,198;48.1,16.4,199;51.4,19,201;45.7,17.3,193;50.7,19.7,203;42.5,17.3,187;52.2,18.8,197;45.2,16.6,191;49.3,19.9,203;50.2,18.8,202;45.6,19.4,194;51.9,19.5,206;46.8,16.5,189;45.7,17,195;55.8,19.8,207;43.5,18.1,202;49.6,18.2,193;50.8,19,210;50.2,18.7,198", "46.1,13.2,211;50,16.3,230;48.7,14.1,210;50,15.2,218;47.6,14.5,215;46.5,13.5,210;45.4,14.6,211;46.7,15.3,219;43.3,13.4,209;46.8,15.4,215;40.9,13.7,214;49,16.1,216;45.5,13.7,214;48.4,14.6,213;45.8,14.6,210;49.3,15.7,217;42,13.5,210;49.2,15.2,221;46.2,14.5,209;48.7,15.1,222;50.2,14.3,218;45.1,14.5,215;46.5,14.5,213;46.3,15.8,215;42.9,13.1,215;46.1,15.1,215;44.5,14.3,216;47.8,15,215;48.2,14.3,210;50,15.3,220;47.3,15.3,222;42.8,14.2,209;45.1,14.5,207;59.6,17,230;49.1,14.8,220;48.4,16.3,220;42.6,13.7,213;44.4,17.3,219;44,13.6,208;48.7,15.7,208;42.7,13.7,208;49.6,16,225;45.3,13.7,210;49.6,15,216;50.5,15.9,222;43.6,13.9,217;45.5,13.9,210;50.5,15.9,225;44.9,13.3,213;45.2,15.8,215;46.6,14.2,210;48.5,14.1,220;45.1,14.4,210;50.1,15,225;46.5,14.4,217;45,15.4,220;43.8,13.9,208;45.5,15,220;43.2,14.5,208;50.4,15.3,224;45.3,13.8,208;46.2,14.9,221;45.7,13.9,214;54.3,15.7,231;45.8,14.2,219;49.8,16.8,230;46.2,14.4,214;49.5,16.2,229;43.5,14.2,220;50.7,15,223;47.7,15,216;46.4,15.6,221;48.2,15.6,221;46.5,14.8,217;46.4,15,216;48.6,16,230;47.5,14.2,209;51.1,16.3,220;45.2,13.8,215;45.2,16.4,223;49.1,14.5,212;52.5,15.6,221;47.4,14.6,212;50,15.9,224;44.9,13.8,212;50.8,17.3,228;43.4,14.4,218;51.3,14.2,218;47.5,14,212;52.1,17,230;47.5,15,218;52.2,17.1,228;45.5,14.5,212;49.5,16.1,224;44.5,14.7,214;50.8,15.7,226;49.4,15.8,216;46.9,14.6,222;48.4,14.4,203;51.1,16.5,225;48.5,15,219;55.9,17,228;47.2,15.5,215;49.1,15,228;47.3,13.8,216;46.8,16.1,215;41.7,14.7,210;53.4,15.8,219;43.3,14,208;48.1,15.1,209;50.5,15.2,216;49.8,15.9,229;43.5,15.2,213;51.5,16.3,230;46.2,14.1,217;55.1,16,230;44.5,15.7,217;48.8,16.2,222;47.2,13.7,214;46.8,14.3,215;50.4,15.7,222;45.2,14.8,212;49.9,16.1,213"];
  function penguins3() {
    const raw = [];
    PENG3.forEach((s, y) => { for (const q of s.split(';')) { const v = q.split(',').map(Number); raw.push({ len: v[0], dep: v[1], fl: v[2], y }); } });
    const n = raw.length, K = ['len', 'dep', 'fl'];
    const m = K.map(k => raw.reduce((a, p) => a + p[k], 0) / n);
    const sd = K.map((k, j) => Math.sqrt(raw.reduce((a, p) => a + (p[k] - m[j]) ** 2, 0) / n));
    const pts = raw.map(p => ({ ...p, x: K.map((k, j) => (p[k] - m[j]) / sd[j]) }));
    const LAM = 0.002, R = 8;
    const sig = z => 1 / (1 + Math.exp(-z));
    const sp = z => z > 30 ? z : Math.log1p(Math.exp(z));
    const z = (w, x) => w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3];
    // Fehler EINES Neurons (mit seiner Strafe) – die Neuronen hängen im Fehler nicht voneinander ab
    function lossK(k, w) {
      let s = 0;
      for (const p of pts) { const v = z(w, p.x); s += p.y === k ? sp(-v) : sp(v); }
      return s / n + LAM / 2 * (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]);
    }
    function gradK(k, w) {
      const g = [0, 0, 0, 0];
      for (const p of pts) { const e = sig(z(w, p.x)) - (p.y === k ? 1 : 0); g[0] += e * p.x[0]; g[1] += e * p.x[1]; g[2] += e * p.x[2]; g[3] += e; }
      return g.map((v, j) => v / n + (j < 3 ? LAM * w[j] : 0));
    }
    const loss = W => W.reduce((a, w, k) => a + lossK(k, w), 0);
    const predict = (W, x) => { let b = 0, bv = -1; W.forEach((w, k) => { const v = sig(z(w, x)); if (v > bv) { bv = v; b = k; } }); return b; };
    const wrong = W => pts.reduce((c, p) => c + (predict(W, p.x) !== p.y ? 1 : 0), 0);
    return { pts, n, m, sd, R, LAM, sig, z, lossK, gradK, loss, predict, wrong,
      names: ['Adelie', 'Zügel', 'Esel'], feat: ['Länge', 'Höhe', 'Flosse'] };
  }

  return { W, hills, model, penguins, penguins3, xor, rng, CFG };   // CFG nur für Prüf-Skripte
})();
