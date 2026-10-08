/* ══════════════════════════════════════════════════════════════
   Savanne — Die Tiere (tiere.js)
   ══════════════════════════════════════════════════════════════

   Löwen, Elefanten, Zebras, Gnus und Krokodile, jeweils Papa,
   Mama und Kind. Fassung 2 (Oktober 2026), gebaut für den
   Showroom showroom-tiere.html und für das neue Projekt.

   ── Aussehen (Fassung 2) ──────────────────────────────────────
   Im Stil der Wesen aus Knowledge Stack (creatures.js): großer
   Kopf, runder Bauch, kurze Beine; eine Linienfarbe (INK) mit
   dicken runden Umrissen; Glanzbogen oben links, Schattensichel
   unten rechts; Knopfaugen mit zwei Lichtpunkten, rosa Bäckchen.
   Mama hat Wimpern und ein Blümchen, Papa Mähne/Stoßzähne/Hörner,
   die Kinder eigene Farben (Flecken, braune Streifen, Bänder).
   Fressen = Herzchen und glückliche Augen, Schlafen = Zzz,
   Stehen = ab und zu ein Funkelstern. Der Kopf schaut wie im
   Zeichentrick meist schräg zum Betrachter.

   ── Wie ein Tier gebaut ist ───────────────────────────────────
   Jedes Tier ist ein SKELETT IM RAUM (x = vorn, y = oben,
   z = rechts) und kein fertiges Bild. Knochen sind Strecken
   zwischen zwei Gelenken; um jeden Knochen liegt ein „Muskel“ —
   eine Kapsel, die vom einen Ende zum anderen dünner oder dicker
   wird. Eine Kapsel sieht aus jeder Richtung gleich aus (zwei
   Kreise und ihre Tangenten), deshalb kann das Tier in JEDE
   Richtung gehen: wir drehen das Skelett, projizieren es schräg
   von oben (Kamera um PITCH geneigt) und sortieren die Teile
   nach Tiefe — was näher ist, wird später gezeichnet.

     Rumpf     Hüfte → Bauch → Brust, dazu Hals (2 Knochen) als
               ein Umriss (blob), damit keine Nähte zu sehen sind
     Beine     je 2 Knochen; das Knie rechnet eine kleine IK aus
               (Hüftgelenk + Fußpunkt → Kniepunkt)
     Gang      Schritt (Passgang-Folge), Trab, Galopp, Paßgang;
               die Fußlänge kommt aus Tempo und Takt, darum
               rutscht im Stehen kein Fuß über den Boden
     Schwanz   Kette, schwingt mit Verzögerung nach
     Krokodil  Wirbelsäule als Kette mit Seitwärts-Welle,
               gespreizte Beine (Knie nach oben/außen)
     Elefant   Rüssel als Kette (8 Glieder), Ohren als Scheiben

   ── Was ein Tier kann (A.mode) ────────────────────────────────
     idle   stehen, atmen, blinzeln, schaut auch mal her
     walk   gehen        run   laufen (Galopp, beim Elefanten Paß)
     eat    fressen      sleep schlafen (Zzz)
   Zwischen den Zuständen wird weich übergeblendet (A.w).

   ── Schnittstelle (window.SavanneTiere) ───────────────────────
     create(art, rolle)    → Tier ('lion' …, 'papa'|'mama'|'kind')
     mount(tier, svgG)     → legt die Zeichengruppe an
     update(tier, dt)      → Uhr weiter (Sekunden)
     draw(tier, view)      → zeichnen; view = { ox, oy, S, skel,
                              ground, mark }
     SPECIES, ORDER, ROLES, PITCH
   Läuft ohne Netz und ohne Build.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const PITCH = 0.42, SP = Math.sin(PITCH), CP = Math.cos(PITCH);
  const NS = 'http://www.w3.org/2000/svg';

  /* ── Vektoren ──────────────────────────────────────────────── */
  const v3 = (x, y, z) => ({ x, y, z });
  const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const len = a => Math.hypot(a.x, a.y, a.z);
  const norm = a => { const l = len(a) || 1; return mul(a, 1 / l); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const rotY = (p, piv, a) => {
    const c = Math.cos(a), s = Math.sin(a), x = p.x - piv.x, z = p.z - piv.z;
    return v3(piv.x + x * c - z * s, p.y, piv.z + x * s + z * c);
  };
  const ground = (p, r) => (p.y < r ? v3(p.x, r, p.z) : p);
  const f1 = n => Math.round(n * 10) / 10;

  /* ── Farben ────────────────────────────────────────────────── */
  const shadeMemo = new Map();
  function shade(hex, k) {
    const key = hex + k;
    if (shadeMemo.has(key)) return shadeMemo.get(key);
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (k <= 1) { r *= k; g *= k; b *= k; }
    else { const t = k - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    const out = '#' + [r, g, b].map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join('');
    shadeMemo.set(key, out);
    return out;
  }

  /* ── 2D-Formen ─────────────────────────────────────────────── */
  function circleD(cx, cy, r) {
    return 'M' + f1(cx - r) + ' ' + f1(cy) + 'A' + f1(r) + ' ' + f1(r) + ' 0 1 0 ' + f1(cx + r) + ' ' + f1(cy)
      + 'A' + f1(r) + ' ' + f1(r) + ' 0 1 0 ' + f1(cx - r) + ' ' + f1(cy) + 'Z';
  }
  /* Kapsel: zwei Kreise (ra, rb) und ihre äußeren Tangenten */
  function capD(a, b, ra, rb) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < Math.abs(ra - rb) + 0.05) return ra > rb ? circleD(a.x, a.y, ra) : circleD(b.x, b.y, rb);
    const ang = Math.atan2(dy, dx), phi = Math.acos(clamp((ra - rb) / d, -1, 1));
    const c1 = Math.cos(ang + phi), s1 = Math.sin(ang + phi), c2 = Math.cos(ang - phi), s2 = Math.sin(ang - phi);
    return 'M' + f1(a.x + ra * c1) + ' ' + f1(a.y + ra * s1)
      + 'L' + f1(b.x + rb * c1) + ' ' + f1(b.y + rb * s1)
      + 'A' + f1(rb) + ' ' + f1(rb) + ' 0 ' + (phi > Math.PI / 2 ? 1 : 0) + ' 0 ' + f1(b.x + rb * c2) + ' ' + f1(b.y + rb * s2)
      + 'L' + f1(a.x + ra * c2) + ' ' + f1(a.y + ra * s2)
      + 'A' + f1(ra) + ' ' + f1(ra) + ' 0 ' + (phi < Math.PI / 2 ? 1 : 0) + ' 0 ' + f1(a.x + ra * c1) + ' ' + f1(a.y + ra * s1) + 'Z';
  }
  /* Wuschel (Mähne, Quaste): Kreis mit Bögen nach außen */
  function fluffD(cx, cy, r, n, rot) {
    const br = r * Math.sin(Math.PI / n) * 1.3;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = rot + i * TAU / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      d += i === 0 ? 'M' + f1(x) + ' ' + f1(y) : 'A' + f1(br) + ' ' + f1(br) + ' 0 0 1 ' + f1(x) + ' ' + f1(y);
    }
    return d + 'Z';
  }

  /* ── Gangarten: Phase je Bein (LV, RV, LH, RH) ─────────────── */
  const PAT = {
    walk:   [0.25, 0.75, 0, 0.5],
    trot:   [0, 0.5, 0.5, 0],
    gallop: [0.58, 0.45, 0, 0.12],
    amble:  [0.3, 0.8, 0, 0.5]
  };
  const LEGS = [{ front: true, side: -1 }, { front: true, side: 1 }, { front: false, side: -1 }, { front: false, side: 1 }];
  function blendOff(a, wa, b, wb) {
    const x = wa * Math.cos(TAU * a) + wb * Math.cos(TAU * b), y = wa * Math.sin(TAU * a) + wb * Math.sin(TAU * b);
    return ((Math.atan2(y, x) / TAU) % 1 + 1) % 1;
  }
  function gaitInfo(A) {
    const G = A.D.gait, w = A.w, mw = w.walk + w.run, m = Math.min(1, mw);
    const pw = PAT[G.walkPat || 'walk'], pr = PAT[G.run];
    const beta = mw > 1e-4 ? (w.walk * G.walkB + w.run * G.runB) / mw : G.walkB;
    const lift = mw > 1e-4 ? (w.walk * G.liftW + w.run * G.liftR) / mw * m : 0;
    const stride = A.freq > 0 ? A.v * beta / A.freq : 0;
    return { beta, lift, stride, m, off: i => blendOff(pw[i], w.walk + 1e-4, pr[i], w.run) };
  }
  function footOffset(g, phase, i) {
    const p = (phase + g.off(i)) % 1;
    if (p < g.beta) return { x: g.stride * (0.5 - p / g.beta), y: 0 };
    const u = (p - g.beta) / (1 - g.beta);
    return { x: g.stride * (-0.5 + smooth(u)), y: g.lift * Math.sin(Math.PI * u) };
  }

  /* Zwei Knochen, ein Knie: wo liegt das Knie? hint zeigt, wohin es knickt. */
  function ik(J, F, l1, l2, hint) {
    let d = sub(F, J), dl = len(d);
    const maxL = (l1 + l2) * 0.999, minL = Math.abs(l1 - l2) + 0.5;
    if (dl > maxL) { F = add(J, mul(d, maxL / dl)); d = sub(F, J); dl = maxL; }
    if (dl < minL) dl = minL;
    const dir = norm(d);
    const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pv = norm(sub(hint, mul(dir, dot(hint, dir))));
    return { K: add(add(J, mul(dir, a)), mul(pv, h)), F };
  }


  /* ══════════════════════════════════════════════════════════════
     Stil — wie die Wesen aus Knowledge Stack (creatures.js)
     ══════════════════════════════════════════════════════════════
     * eine Linienfarbe (INK), dicke runde Umrisse
     * Glanz oben links (weißer Bogen), Schatten unten rechts
       (Sichel aus einem Verlauf mit harter Kante, je Farbe einmal)
     * Knopfaugen: dunkles Oval, großer und kleiner Lichtpunkt
     * rosa Bäckchen, kleiner Mund, Funkelsterne, Herzchen, Zzz      */
  const INK = '#1e1b2e';
  const BLUSH = '#ff7aa2';
  let defsEl = null;
  const gradMade = new Set();
  function gradFill(hex) {
    if (typeof document === 'undefined' || !hex || hex[0] !== '#') return hex;
    const id = 'sv' + hex.slice(1);
    if (!gradMade.has(id)) {
      if (!defsEl) {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        defsEl = document.createElementNS(NS, 'defs');
        svg.appendChild(defsEl);
        (document.body || document.documentElement).appendChild(svg);
      }
      const g = document.createElementNS(NS, 'radialGradient');
      g.setAttribute('id', id); g.setAttribute('cx', '.36'); g.setAttribute('cy', '.3'); g.setAttribute('r', '.8');
      [[0, shade(hex, 1.12)], [0.42, hex], [0.78, hex], [0.79, shade(hex, 0.85)], [1, shade(hex, 0.8)]].forEach(([o, c]) => {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', o); s.setAttribute('stop-color', c);
        g.appendChild(s);
      });
      defsEl.appendChild(g);
      gradMade.add(id);
    }
    return 'url(#' + id + ')';
  }
  function ellD(cx, cy, rx, ry) {
    return 'M' + f1(cx - rx) + ' ' + f1(cy) + 'A' + f1(rx) + ' ' + f1(ry) + ' 0 1 0 ' + f1(cx + rx) + ' ' + f1(cy)
      + 'A' + f1(rx) + ' ' + f1(ry) + ' 0 1 0 ' + f1(cx - rx) + ' ' + f1(cy) + 'Z';
  }
  function starD(x, y, s) {
    const k = s * 0.22;
    return 'M' + f1(x) + ' ' + f1(y - s) + 'Q' + f1(x + k) + ' ' + f1(y - k) + ' ' + f1(x + s) + ' ' + f1(y)
      + 'Q' + f1(x + k) + ' ' + f1(y + k) + ' ' + f1(x) + ' ' + f1(y + s)
      + 'Q' + f1(x - k) + ' ' + f1(y + k) + ' ' + f1(x - s) + ' ' + f1(y)
      + 'Q' + f1(x - k) + ' ' + f1(y - k) + ' ' + f1(x) + ' ' + f1(y - s) + 'Z';
  }
  function heartD(x, y, s) {
    return 'M' + f1(x) + ' ' + f1(y + s * 0.45) + 'C' + f1(x - s * 1.15) + ' ' + f1(y - s * 0.3) + ' ' + f1(x - s * 0.45) + ' ' + f1(y - s * 1.1) + ' ' + f1(x) + ' ' + f1(y - s * 0.45)
      + 'C' + f1(x + s * 0.45) + ' ' + f1(y - s * 1.1) + ' ' + f1(x + s * 1.15) + ' ' + f1(y - s * 0.3) + ' ' + f1(x) + ' ' + f1(y + s * 0.45) + 'Z';
  }

  /* ══════════════════════════════════════════════════════════════
     Zeichenkontext: sammelt Formen, projiziert, sortiert nach Tiefe
     ══════════════════════════════════════════════════════════════ */
  function makeCtx(A, view) {
    const ch = Math.cos(A.h), sh = Math.sin(A.h), S = view.S, ox = view.ox, oy = view.oy;
    const SW = (view.lw || 2.6) * (0.55 + 0.45 * Math.min(1.2, S));
    const prims = [], bones = [];
    function pr(p) {
      const wx = p.x * ch - p.z * sh, wz = p.x * sh + p.z * ch;
      return { x: ox + S * wx, y: oy + S * (-p.y * CP + wz * SP), d: wz * CP + p.y * SP };
    }
    // > 0: die Fläche mit Normale n zeigt zur Kamera
    const facing = n => n.y * SP + (n.x * sh + n.z * ch) * CP;
    // die abgewandte Seite (z. B. das hintere Bein) etwas dunkler
    function tone(fill, o) {
      if (!o || !o.side) return fill;
      const far = clamp(-o.side * ch, 0, 1);
      return far > 0.02 ? shade(fill, 1 - 0.15 * far) : fill;
    }
    const paint = (f, o) => (o && o.flat ? f : gradFill(f));
    const dep = (o, d) => (o && o.depth != null ? o.depth : d + ((o && o.bias) || 0));
    function push(p, o) {
      if (o && o.op != null) p.op = o.op;
      prims.push(p); return p;
    }
    // Glanz: weißer Bogen oben links
    function shineBall(P, r, d) {
      const rr = r * 0.66, a1 = 200 * DEG, a2 = 248 * DEG;
      prims.push({ d: 'M' + f1(P.x + rr * Math.cos(a1)) + ' ' + f1(P.y + rr * Math.sin(a1)) + 'A' + f1(rr) + ' ' + f1(rr) + ' 0 0 1 '
        + f1(P.x + rr * Math.cos(a2)) + ' ' + f1(P.y + rr * Math.sin(a2)),
        fill: 'none', stroke: '#ffffff', sw: Math.max(0.8, r * 0.17), op: 0.62, depth: d + 0.002 });
    }
    function shineCap(A2, B2, ra, rb, d) {
      const dx = B2.x - A2.x, dy = B2.y - A2.y, L = Math.hypot(dx, dy);
      if (L < Math.max(ra, rb) * 0.9) { shineBall(ra > rb ? A2 : B2, Math.max(ra, rb), d); return; }
      let nx = dy / L, ny = -dx / L;
      if (ny > 0 || (Math.abs(ny) < 0.25 && nx > 0)) { nx = -nx; ny = -ny; }
      let s = '';
      [0.18, 0.4, 0.62].forEach((t, i) => {
        const r = lerp(ra, rb, t) * 0.6;
        s += (i ? 'L' : 'M') + f1(A2.x + dx * t + nx * r) + ' ' + f1(A2.y + dy * t + ny * r);
      });
      prims.push({ d: s, fill: 'none', stroke: '#ffffff', sw: Math.max(0.8, Math.min(ra, rb) * 0.22), op: 0.55, depth: d + 0.002 });
    }
    const C = {
      S, SW, pr, facing, prims, bones,
      depth: p => pr(p).d,
      cap(a, b, ra, rb, fill, o) {
        const A2 = pr(a), B2 = pr(b), f = tone(fill, o), d = dep(o, (A2.d + B2.d) / 2);
        const p = push({ d: capD(A2, B2, ra * S, rb * S), fill: paint(f, o), stroke: (o && o.stroke) || INK,
          sw: o && o.sw != null ? o.sw : SW, depth: d }, o);
        if (o && o.shine) shineCap(A2, B2, ra * S, rb * S, d);
        return p;
      },
      ball(c, r, fill, o) {
        const P = pr(c), f = tone(fill, o), d = dep(o, P.d);
        const p = push({ d: circleD(P.x, P.y, r * S), fill: paint(f, o), stroke: (o && o.stroke) || INK,
          sw: o && o.sw != null ? o.sw : SW, depth: d }, o);
        if (o && o.shine) shineBall(P, r * S, d);
        return p;
      },
      fluff(c, r, n, fill, o) {
        const P = pr(c), f = tone(fill, o), d = dep(o, P.d);
        return push({ d: fluffD(P.x, P.y, r * S, n, (o && o.rot) || 0), fill: paint(f, o), stroke: INK,
          sw: SW * 0.9, depth: d }, o);
      },
      // Umriss aus mehreren Kapseln ohne innere Nähte: erst Rand, dann Füllung
      blob(parts, fill, o) {
        let d = '', dp = 0, n = 0;
        const f = tone(fill, o);
        const P2 = parts.map(([a, b, ra, rb]) => {
          const A2 = pr(a), B2 = pr(b);
          d += capD(A2, B2, ra * S, rb * S);
          dp += A2.d + B2.d; n += 2;
          return [A2, B2, ra * S, rb * S];
        });
        dp = dep(o, dp / n);
        push({ d, fill: INK, stroke: INK, sw: SW * 2, depth: dp }, o);
        const p = push({ d, fill: paint(f, o), stroke: 'none', sw: 0, depth: dp + 0.001 }, o);
        if (o && o.shine != null) { const s = P2[o.shine] || P2[0]; shineCap(s[0], s[1], s[2], s[3], dp + 0.001); }
        return p;
      },
      // Scheibe: Mittelpunkt + zwei Halbachsen im Raum (Ohr, Schatten)
      disc(c, u, v, fill, o) {
        let d = '';
        const N = 30;
        for (let i = 0; i < N; i++) {
          const a = i / N * TAU, P = pr(add(c, add(mul(u, Math.cos(a)), mul(v, Math.sin(a)))));
          d += (i ? 'L' : 'M') + f1(P.x) + ' ' + f1(P.y);
        }
        const f = tone(fill, o);
        return push({ d: d + 'Z', fill: paint(f, o), stroke: o && o.stroke === 'none' ? 'none' : ((o && o.stroke) || INK),
          sw: o && o.sw != null ? o.sw : SW, depth: dep(o, pr(c).d) }, o);
      },
      line(pts, color, w, o) {
        let d = '', dp = 0;
        pts.forEach((p, i) => { const P = pr(p); d += (i ? 'L' : 'M') + f1(P.x) + ' ' + f1(P.y); dp += P.d; });
        return push({ d, fill: 'none', stroke: color, sw: w, depth: dep(o, dp / pts.length) }, o);
      },
      // gebogene Linie durch drei Punkte (Mund, Falten)
      curve(a, m, b, color, w, o) {
        const A2 = pr(a), M2 = pr(m), B2 = pr(b);
        const cx = 2 * M2.x - (A2.x + B2.x) / 2, cy = 2 * M2.y - (A2.y + B2.y) / 2;
        return push({ d: 'M' + f1(A2.x) + ' ' + f1(A2.y) + 'Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(B2.x) + ' ' + f1(B2.y),
          fill: 'none', stroke: color, sw: w, depth: dep(o, (A2.d + B2.d) / 2) }, o);
      },
      // Ring um eine Achse (Streifen, Falten): nur das sichtbare Stück
      ring(c, axis, upHint, r, th0, th1, color, w, depth, o) {
        const ax = norm(axis), up = norm(sub(upHint, mul(ax, dot(upHint, ax)))), sd = cross(ax, up);
        const steps = 12;
        let run = [];
        const flush = () => { if (run.length > 1) C.line(run, color, w * S, Object.assign({}, o, { depth })); run = []; };
        for (let i = 0; i <= steps; i++) {
          const th = (th0 + (th1 - th0) * i / steps) * DEG;
          const n = add(mul(up, Math.cos(th)), mul(sd, Math.sin(th)));
          if (facing(n) > -0.05) run.push(add(c, mul(n, r))); else flush();
        }
        flush();
      },
      // kleiner Fleck auf einer Oberfläche, nur wenn er zu sehen ist
      spot(c, n, r, fill, o) {
        if (facing(n) < 0.08) return null;
        return C.ball(c, r, fill, Object.assign({ stroke: 'none', sw: 0, flat: true }, o));
      },
      // Oval in Bildschirmrichtung (Augen, Bäckchen)
      oval(P, rx, ry, fill, o) {
        return push({ d: ellD(P.x, P.y, rx, ry), fill, stroke: (o && o.stroke) || 'none', sw: (o && o.sw) || 0, depth: o.depth }, o);
      },
      raw(d, fill, stroke, sw, depth, op) { return push({ d, fill, stroke, sw, depth }, op != null ? { op } : null); },
      bone(a, b) { if (view.skel) bones.push([pr(a), pr(b)]); },
      // Schatten am Boden
      shadow(a, b, r) {
        const m = lerpV(a, b, 0.5), ax = v3(b.x - a.x, 0, b.z - a.z), half = len(ax) / 2;
        const fwd = half > 0.1 ? norm(ax) : v3(1, 0, 0), side = v3(-fwd.z, 0, fwd.x);
        return C.disc(v3(m.x, 0.5, m.z), mul(fwd, half + r * 1.05), mul(side, r * 1.05), '#000000',
          { stroke: 'none', depth: -1e6, op: 0.14, flat: true });
      }
    };
    return C;
  }

  /* ── Gesicht ───────────────────────────────────────────────── */
  // Reihenfolge am Kopf steht fest (Hinterkopf < Schädel < Gesicht), von hinten umgekehrt.
  function headFrame(C, H, f, hr) {
    const base = C.depth(H), toCam = C.facing(v3(f.x, 0, f.z)) * hr;
    return { base, toCam, dFace: base + toCam + 0.3, dBack: base - toCam * 0.8 - 0.6, dEar: base - 0.2 - toCam * 0.3 };
  }
  function eyeState(A) {
    if (A.w.sleep > 0.5) return 'closed';
    if (A.blinking) return 'closed';
    if (A.w.eat > 0.5 && Math.sin(A.t * 1.7) > 0.2) return 'happy';
    return 'open';
  }
  function cuteEye(C, I, p, er, o) {
    o = o || {};
    const n = norm(sub(p, I.H)), vis = C.facing(n);
    if (vis < 0.1) return;
    const P = C.pr(p), sq = clamp(0.38 + vis * 0.8, 0.38, 1), e = er * C.S, d = I.dFace + 0.5;
    const st = I.eye, lw = Math.max(1, C.SW * 0.95);
    if (st === 'closed') {
      C.raw('M' + f1(P.x - 0.85 * e * sq) + ' ' + f1(P.y - 0.05 * e) + 'Q' + f1(P.x) + ' ' + f1(P.y + 0.75 * e) + ' ' + f1(P.x + 0.85 * e * sq) + ' ' + f1(P.y - 0.05 * e), 'none', INK, lw, d);
    } else if (st === 'happy') {
      C.raw('M' + f1(P.x - 0.85 * e * sq) + ' ' + f1(P.y + 0.3 * e) + 'Q' + f1(P.x) + ' ' + f1(P.y - 0.95 * e) + ' ' + f1(P.x + 0.85 * e * sq) + ' ' + f1(P.y + 0.3 * e), 'none', INK, lw, d);
    } else {
      C.oval(P, 0.8 * e * sq, e, INK, { depth: d });
      C.oval({ x: P.x - 0.26 * e * sq, y: P.y - 0.4 * e }, 0.34 * e * sq, 0.34 * e, '#ffffff', { depth: d + 0.01, op: 0.95 });
      C.oval({ x: P.x + 0.26 * e * sq, y: P.y + 0.38 * e }, 0.15 * e * sq, 0.15 * e, '#ffffff', { depth: d + 0.01, op: 0.85 });
    }
    if (o.lashes && st !== 'closed') {
      const out = Math.sign(C.pr(add(p, mul(I.r, o.side))).x - P.x) || o.side;
      const ly = st === 'happy' ? P.y - 0.5 * e : P.y - 0.72 * e;
      C.raw('M' + f1(P.x + out * 0.5 * e * sq) + ' ' + f1(ly) + 'l' + f1(out * 0.45 * e) + ' ' + f1(-0.42 * e)
        + 'M' + f1(P.x + out * 0.72 * e * sq) + ' ' + f1(ly + 0.3 * e) + 'l' + f1(out * 0.5 * e) + ' ' + f1(-0.18 * e), 'none', INK, lw * 0.75, d);
    }
  }
  function cheek(C, I, p, b) {
    const n = norm(sub(p, I.H)), vis = C.facing(n);
    if (vis < 0.12) return;
    const sq = clamp(0.38 + vis * 0.8, 0.38, 1);
    C.oval(C.pr(p), 1.15 * b * C.S * sq, 0.62 * b * C.S, BLUSH, { depth: I.dFace + 0.45, op: 0.55 });
  }
  // Blümchen (Mama trägt eins): fünf Blätter, gelbe Mitte
  function flower(C, p, s, d, col) {
    const P = C.pr(p), r = s * C.S;
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 - Math.PI / 2;
      C.oval({ x: P.x + Math.cos(a) * r * 0.9, y: P.y + Math.sin(a) * r * 0.9 }, r * 0.62, r * 0.62, col || '#ffffff', { depth: d, stroke: INK, sw: C.SW * 0.55 });
    }
    C.oval(P, r * 0.55, r * 0.55, '#ffd23f', { depth: d + 0.01, stroke: INK, sw: C.SW * 0.55 });
  }
  /* Zzz, Herzchen, Funkeln (bleiben in Bildrichtung) */
  function effects(A, C, top) {
    const P = C.pr(top), k = Math.max(0.65, C.S), w = A.w;
    if (w.sleep > 0.6) {
      for (let i = 0; i < 3; i++) {
        const u = ((A.t * 0.33 + i / 3) % 1), s = (4 + u * 5) * k;
        const x = P.x + 6 * k + u * 16 * k + Math.sin(u * 6) * 2, y = P.y - 4 - u * 30 * k;
        const d = 'M' + f1(x) + ' ' + f1(y) + 'h' + f1(s) + 'l' + f1(-s) + ' ' + f1(s) + 'h' + f1(s);
        const op = Math.sin(u * Math.PI) * (w.sleep - 0.6) * 2.5;
        C.raw(d, 'none', INK, 3.6 * k, 1e5, op);
        C.raw(d, 'none', '#c7d2fe', 1.6 * k, 1e5 + 0.1, op);
      }
    }
    if (w.eat > 0.5) {
      const u = (A.t * 0.45) % 1;
      if (u < 0.8) {
        const s = (3 + u * 2) * k, x = P.x + 10 * k + Math.sin(u * 7) * 3, y = P.y - u * 26 * k;
        C.raw(heartD(x, y, s), '#ff6f91', INK, 1.1 * k, 1e5, Math.sin(u / 0.8 * Math.PI) * (w.eat - 0.5) * 2);
      }
    }
    const idle = (1 - Math.min(1, w.walk + w.run)) * (1 - w.sleep) * (1 - w.eat);
    if (idle > 0.5) {
      const u = (A.t * 0.25 + A.seed) % 1;
      if (u < 0.3) {
        const s = Math.sin(u / 0.3 * Math.PI) * 3.6 * k;
        const a = A.seed * 20;
        C.raw(starD(P.x + Math.cos(a) * 20 * k, P.y - 6 * k + Math.sin(a) * 8 * k, s), '#ffd23f', INK, 0.8 * k, 1e5);
        C.raw(starD(P.x - Math.cos(a) * 16 * k, P.y - 14 * k, s * 0.65), '#ffffff', INK, 0.7 * k, 1e5);
      }
    }
  }
  function grass(C, base, op, t, k) {
    k = k || 1;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25, sw = Math.sin(t * 2 + i) * 1.2;
      const b = add(base, v3(Math.cos(a) * 2.6 * k, 0, Math.sin(a) * 2.6 * k));
      C.cap(b, add(b, v3(Math.cos(a) * 2.5 * k + sw, (8 + (i % 3) * 3) * k, Math.sin(a) * 1.6 * k)), 1.6 * k, 0.6 * k,
        i % 2 ? '#7cc24a' : '#5aa33a', { op, sw: C.SW * 0.6 });
    }
    const P = C.pr(add(base, v3(0, 12 * k, 0)));
    flower(C, add(base, v3(0.5 * k, 12.5 * k, 0)), 1.6 * k, P.d + 0.05, '#ff9cc2');
  }

  /* ══════════════════════════════════════════════════════════════
     Vierbeiner (Löwe, Elefant, Zebra, Gnu)
     ══════════════════════════════════════════════════════════════ */
  function buildQuad(A, C) {
    const D = A.D, R = A.R, w = A.w, t = A.t, G = D.gait, col = A.col;
    const g = gaitInfo(A), ph = A.phase;
    const sleepLie = R.sleepStand ? 0 : w.sleep;
    const lie = clamp(sleepLie + (D.eatLie ? w.eat : 0), 0, 1);
    const graze = D.graze ? w.eat : 0;
    const fl = D.fl, hl = D.hl;
    const standF = fl.fr + 0.96 * (fl.l1 + fl.l2) - fl.jy;
    const standH = hl.fr + 0.96 * (hl.l1 + hl.l2) - hl.jy;

    const bob = G.bob * w.walk * Math.cos(ph * TAU * 2);
    const rock = G.rock * w.run * Math.sin(TAU * (ph + 0.15));
    const hop = G.hop * w.run * (0.5 + 0.5 * Math.sin(TAU * ph + 1.2));
    const slow = w.sleep > 0.5;
    const breathe = Math.sin(t * TAU * (slow ? 0.22 : 0.32)) * (slow ? 1.4 : 0.6);
    const sag = (R.sleepStand ? 3 * w.sleep : 0) + (D.eatDrop || 0) * graze;

    const chestY = lerp(standF - sag, D.chest.r * 0.92, lie) + bob + hop + rock;
    const hipY = lerp(standH - (R.sleepStand ? 2 * w.sleep : 0), D.hip.r * 0.92, lie) + bob + hop - rock;
    const chest = v3(D.chest.x, chestY, 0), hip = v3(D.hip.x, hipY, 0);
    const cr = D.chest.r + breathe * 0.35, hr0 = D.hip.r;
    const mid = v3((chest.x + hip.x) / 2, Math.max((chestY + hipY) / 2 - D.belly.drop, D.belly.r * 0.88), 0);
    const br = D.belly.r + breathe * 0.45;

    /* Hals und Kopf */
    const nk = D.neck, hd = D.head;
    let na = nk.a + (G.nod || 0) * w.walk * Math.sin(ph * TAU * 2 + 0.6);
    na = lerp(na, nk.runA, w.run);
    na = lerp(na, nk.eatA, w.eat);
    na = lerp(na, nk.sleepA, w.sleep);
    let hp = lerp(lerp(lerp(hd.pitch, hd.runP != null ? hd.runP : hd.pitch, w.run), hd.eatP, w.eat), hd.sleepP, w.sleep);
    hp += 4 * Math.sin(t * 0.9) * (1 - w.sleep) * (1 - Math.min(1, w.walk + w.run));
    const N0 = v3(chest.x + nk.bx, chest.y + nk.by, 0);
    const a1 = na * DEG, a2 = (na + nk.curve) * DEG, half = nk.len / 2;
    let N1 = add(N0, v3(Math.cos(a1) * half, Math.sin(a1) * half, 0));
    let H = add(N1, v3(Math.cos(a2) * half, Math.sin(a2) * half, 0));
    const yaw = A.lookNow;
    N1 = rotY(N1, N0, yaw); H = rotY(H, N0, yaw);
    const hr = hd.r * R.head;
    if (H.y < hr * 0.85) H = v3(H.x, hr * 0.85, H.z);
    const mouth = (hd.snout || hr * 1.3) * R.head;
    if (H.y + Math.sin(hp * DEG) * mouth < 2.5) hp = Math.asin(clamp((2.5 - H.y) / mouth, -1, 1)) / DEG;

    const f = v3(Math.cos(hp * DEG) * Math.cos(yaw), Math.sin(hp * DEG), Math.cos(hp * DEG) * Math.sin(yaw));
    const r = v3(-Math.sin(yaw), 0, Math.cos(yaw)), u = cross(r, f);
    const F = (a, b, c) => v3(H.x + f.x * a + u.x * b + r.x * c, H.y + f.y * a + u.y * b + r.y * c, H.z + f.z * a + u.z * b + r.z * c);

    /* Rumpf + Hals als ein Umriss */
    const body = C.blob([[hip, mid, hr0, br], [mid, chest, br, cr], [N0, N1, nk.r1, (nk.r1 + nk.r2) / 2], [N1, H, (nk.r1 + nk.r2) / 2, nk.r2]], col.body, { shine: 1 });
    C.bone(hip, mid); C.bone(mid, chest); C.bone(chest, N0); C.bone(N0, N1); C.bone(N1, H);
    C.shadow(hip, chest, Math.max(cr, hr0) * (1 + lie * 0.3));

    const I = Object.assign({ H, f, u, r, F, hr, yaw, hp, N0, N1, chest, hip, mid, cr, br, hr0, body, lie, graze,
      neckR: nk.r1, eye: eyeState(A) }, headFrame(C, H, f, hr));

    /* Beine */
    LEGS.forEach((L, i) => {
      const P = L.front ? fl : hl, base = L.front ? chest : hip, bx = L.front ? D.chest.x : D.hip.x;
      const J = v3(base.x + P.jx, base.y + P.jy, L.side * P.w);
      const fo = footOffset(g, ph, i);
      let Fp = v3(bx + P.jx + P.home + fo.x + (L.front ? graze * 3 : 0), P.fr + fo.y, L.side * P.w);
      let hint = v3(P.bend, 0, 0);
      if (lie > 0) {
        const sphinx = (R.sleepFront || D.sleepFront) === 'sphinx';
        let Ft, Hn;
        if (L.front) {
          Ft = sphinx ? v3(J.x + (P.l1 + P.l2) * 0.8, P.fr, L.side * P.w * 0.85) : v3(J.x - P.l1 * 0.1, P.fr, L.side * P.w * 0.95);
          Hn = sphinx ? v3(0.1, 1, 0) : v3(1, 0.3, 0);
        } else {
          Ft = v3(J.x + P.l1 * 0.6, P.fr, L.side * P.w * 1.3);
          Hn = v3(-0.5, 1, 0);
        }
        Fp = lerpV(Fp, Ft, lie);
        hint = norm(lerpV(hint, Hn, lie));
      }
      const leg = ik(J, Fp, P.l1, P.l2, hint);
      let K = leg.K; Fp = leg.F;
      if (K.y < P.r2) K = v3(K.x, P.r2, K.z);
      const lp = C.blob([[J, K, P.r1, P.r2], [K, Fp, P.r2, P.r3]], col.leg || col.body, { side: L.side, shine: 0 });
      C.bone(J, K); C.bone(K, Fp);
      const sd = { side: L.side, bias: 0.05 };
      if (P.foot === 'hoof') {
        C.cap(add(Fp, v3(-1, -0.6, 0)), add(Fp, v3(2.2, -P.fr * 0.35, 0)), P.fr, P.fr * 0.9, col.hoof, Object.assign({ shine: true }, sd));
      } else if (P.foot === 'paw') {
        const pc = add(Fp, v3(P.fr * 0.3, -0.5, 0));
        const paw = C.ball(pc, P.fr, col.paw || col.body, Object.assign({ shine: true }, sd));
        if (C.facing(v3(1, 0.3, 0)) > 0.15) for (const k of [-1, 1]) {
          const a0 = add(pc, v3(P.fr * 0.92, -P.fr * 0.05, k * P.fr * 0.28));
          C.line([a0, add(a0, v3(-P.fr * 0.1, -P.fr * 0.45, 0))], INK, C.SW * 0.6, { depth: paw.depth + 0.01 });
        }
      } else {
        const pad = C.ball(Fp, P.fr, col.foot || col.body, sd);
        for (let k = -1; k <= 1; k++) C.spot(add(Fp, v3(P.fr * 0.88, -P.fr * 0.3, k * P.fr * 0.48)), norm(v3(1, -0.1, k * 0.5)), P.fr * 0.24, col.nail, { depth: pad.depth + 0.01, stroke: INK, sw: C.SW * 0.5 });
      }
      if (D.legRings) D.legRings(A, C, J, K, Fp, P, lp.depth);
    });

    /* Schwanz */
    const tl = D.tail, tk = R.tailK || 1;
    let T = v3(hip.x - hr0 * 0.88, hip.y + hr0 * 0.3, 0);
    let th = lerp(lerp(tl.a, tl.a + tl.run, w.run), -12, lie * 0.9);
    const tparts = [];
    for (let k = 0; k < tl.n; k++) {
      th += tl.curl * (1 - lie * 0.8);
      const sw = tl.sway * Math.sin(t * 1.6 - k * 0.55) * (1 + w.walk * 0.6) + 0.25 * w.run * Math.sin(TAU * ph - k * 0.4);
      const d = v3(-Math.cos(th * DEG) * Math.cos(sw), Math.sin(th * DEG), Math.cos(th * DEG) * Math.sin(sw));
      const rr = lerp(tl.r1, tl.r2, k / (tl.n - 1)) * tk;
      const nx = ground(add(T, mul(d, tl.seg * tk)), rr);
      tparts.push([T, nx, lerp(tl.r1, tl.r2, k / tl.n) * tk, rr]);
      C.bone(T, nx);
      T = nx;
    }
    C.blob(tparts, col.tail || col.body);
    if (tl.tuft) {
      const last = tparts[tparts.length - 1], dir = norm(sub(last[1], last[0]));
      const end = ground(add(T, mul(dir, 7 * tk)), 2.5 * tk);
      C.cap(T, end, 2.4 * tk, 3.6 * tk, col.tuft || INK, { bias: 0.05, shine: true });
    }
    if (tl.ball) C.fluff(T, 5 * tk, 8, col.tuft, { bias: 0.05 });

    /* Kopf (je Art) und Extras */
    D.drawHead(A, C, I);
    if (D.drawBody) D.drawBody(A, C, I);
    effects(A, C, F(0, hr * 1.15, 0));
  }

  /* ── Löwe ──────────────────────────────────────────────────── */
  function lionHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    if (R.mane) {
      C.fluff(lerpV(I.N0, I.N1, 0.7), I.neckR * 1.3, 11, col.mane, { depth: I.dBack - 0.3, rot: 0.3 });
      C.fluff(F(-hr * 0.22, hr * 0.02, 0), hr * 1.5, 14, col.mane, { depth: I.dBack });
      C.fluff(F(-hr * 0.1, hr * 0.0, 0), hr * 1.24, 12, col.mane2, { depth: I.dBack + 0.2, rot: 0.25 });
    }
    const ek = R.ear || 1;
    for (const s of [-1, 1]) {
      const ep = F(-hr * 0.05, hr * 0.8, s * hr * 0.6);
      const ear = C.ball(ep, hr * 0.28 * ek, col.body, { depth: (R.mane ? I.dBack + 0.4 : I.dEar) + s * 0.01, side: s });
      if (C.facing(f) > -0.15) C.ball(add(ep, mul(f, hr * 0.1)), hr * 0.15 * ek, col.earIn, { depth: ear.depth + 0.01, flat: true, stroke: 'none' });
      if (R.flower && s === -1) flower(C, add(ep, v3(0, hr * 0.15, 0)), hr * 0.17, ear.depth + 0.03, '#ffffff');
    }
    C.ball(H, hr, col.body, { shine: true });
    if (R.tuft) {
      for (const k of [-1, 0, 1]) {
        const b0 = F(-hr * 0.05, hr * 0.9, k * hr * 0.12);
        C.cap(b0, add(b0, add(mul(u, hr * 0.32), mul(f, hr * (0.18 - 0.08 * k)))), hr * 0.1, hr * 0.03, col.mane2, { depth: I.base + 0.05 - I.toCam * 0.02 });
      }
    }
    C.bone(H, F(hr, -hr * 0.2, 0));
    // Schnauze: zwei Bäckchen-Kugeln, Kinn, Nase, Katzenmund
    C.ball(F(hr * 0.68, -hr * 0.52, 0), hr * 0.2, col.light, { depth: I.dFace - 0.05 });
    for (const s of [-1, 1]) C.ball(F(hr * 0.78, -hr * 0.28, s * hr * 0.2), hr * 0.27, col.light, { depth: I.dFace + s * 0.001 * Math.sign(I.toCam || 1) });
    if (C.facing(f) > -0.25) {
      const nz = F(hr * 1.02, -hr * 0.08, 0);
      C.blob([[F(hr * 0.98, -hr * 0.04, -hr * 0.11), F(hr * 0.98, -hr * 0.04, hr * 0.11), hr * 0.1, hr * 0.1], [nz, F(hr * 1.0, -hr * 0.17, 0), hr * 0.1, hr * 0.05]], col.nose, { depth: I.dFace + 0.2 });
      C.spot(F(hr * 1.05, -hr * 0.0, -hr * 0.05), f, hr * 0.035, '#ffffff', { depth: I.dFace + 0.22, op: 0.8 });
      const m0 = F(hr * 1.0, -hr * 0.2, 0), lw = C.SW * 0.8;
      C.line([m0, F(hr * 1.0, -hr * 0.3, 0)], INK, lw, { depth: I.dFace + 0.21 });
      for (const s of [-1, 1]) C.curve(F(hr * 1.0, -hr * 0.3, 0), F(hr * 0.98, -hr * 0.4, s * hr * 0.09), F(hr * 0.95, -hr * 0.32, s * hr * 0.18), INK, lw, { depth: I.dFace + 0.21 });
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) C.spot(F(hr * 0.98, -hr * (0.22 + k * 0.08), s * hr * (0.3 + (k % 2) * 0.06)), norm(add(f, mul(r, s * 0.6))), hr * 0.025, INK, { depth: I.dFace + 0.21, op: 0.6 });
    }
    const er = hr * (R.head > 1 ? 0.23 : 0.2);
    for (const s of [-1, 1]) {
      cuteEye(C, I, F(hr * 0.64, hr * 0.16, s * hr * 0.38), er, { lashes: R.lashes, side: s });
      cheek(C, I, F(hr * 0.6, -hr * 0.18, s * hr * 0.58), hr * 0.13);
    }
    if (R.brows && I.eye === 'open') for (const s of [-1, 1]) {
      const b0 = F(hr * 0.66, hr * 0.42, s * hr * 0.24), b1 = F(hr * 0.6, hr * 0.48, s * hr * 0.5);
      if (C.facing(norm(add(f, mul(r, s * 0.6)))) > 0.1) C.line([b0, b1], INK, C.SW * 1.1, { depth: I.dFace + 0.55 });
    }
    if (R.spots) {
      const pts = [[0.2, 45], [0.38, 72], [0.52, 38], [0.66, 76], [0.8, 48], [0.3, 105], [0.7, 108]];
      for (const s of [-1, 1]) for (const [tt, th] of pts) {
        const c0 = lerpV(I.hip, I.chest, tt), rr = lerp(I.hr0, I.cr, tt);
        const n = v3(0, Math.cos(th * DEG), s * Math.sin(th * DEG));
        C.spot(add(c0, mul(n, rr * 0.98)), n, 2.2, shade(col.body, 0.83), { depth: I.body.depth + 0.02 });
      }
    }
    if (A.food === 'meat' && w.eat > 0.02) {
      // Keule mit Knochen vor den Pfoten
      const fh = norm(v3(f.x, 0, f.z)), sd = v3(-fh.z, 0, fh.x);
      const base = add(v3(H.x, 4.5, H.z), mul(fh, hr * 1.45));
      const o = { op: w.eat };
      const m1 = add(base, mul(sd, 5)), b1 = add(base, mul(sd, -7));
      C.ball(m1, 6, '#d9614c', Object.assign({ bias: 0.1, shine: true }, o));
      C.cap(add(base, mul(sd, 1)), b1, 1.7, 1.7, '#fff6e6', Object.assign({ bias: 0.08 }, o));
      for (const k of [-1, 1]) C.ball(add(b1, add(mul(sd, -1.6), mul(fh, k * 1.7))), 1.9, '#fff6e6', Object.assign({ bias: 0.09 }, o));
    }
  }

  /* ── Zebra ─────────────────────────────────────────────────── */
  function zebraLeg(A, C, J, K, Fp, P, dep) {
    const col = A.col.stripe;
    const segs = [[J, K, P.r1, P.r2, 2], [K, Fp, P.r2, P.r3, 2]];
    for (const [a, b, ra, rb, n] of segs) {
      const ax = sub(b, a);
      for (let k = 0; k < n; k++) {
        const tt = (k + 0.7) / (n + 0.6);
        C.ring(lerpV(a, b, tt), ax, v3(1, 0, 0), lerp(ra, rb, tt) * 1.0, -180, 180, col, 2.6, dep + 0.01);
      }
    }
  }
  function zebraBody(A, C, I) {
    const col = A.col.stripe, dep = I.body.depth + 0.02;
    const ax = sub(I.chest, I.hip), Lb = len(ax), axn = norm(ax);
    // Streifen über den ganzen Rumpf, auch über die runden Enden
    const T = [-0.42, -0.12, 0.2, 0.5, 0.8, 1.12];
    T.forEach((tt, k) => {
      let c0, rr;
      if (tt < 0) { c0 = add(I.hip, mul(axn, tt * Lb)); rr = Math.sqrt(Math.max(0, I.hr0 * I.hr0 - (tt * Lb) ** 2)); }
      else if (tt > 1) { c0 = add(I.chest, mul(axn, (tt - 1) * Lb)); rr = Math.sqrt(Math.max(0, I.cr * I.cr - ((tt - 1) * Lb) ** 2)); }
      else { c0 = tt < 0.5 ? lerpV(I.hip, I.mid, tt * 2) : lerpV(I.mid, I.chest, tt * 2 - 1); rr = tt < 0.5 ? lerp(I.hr0, I.br, tt * 2) : lerp(I.br, I.cr, tt * 2 - 1); }
      if (rr < 3) return;
      const tilt = tt < 0.3 ? (0.3 - tt) * 1.1 : 0;
      const axk = norm(add(axn, v3(0, -tilt, 0)));
      C.ring(c0, axk, v3(0, 1, 0), rr, -100, 100, col, k % 2 ? 2.4 : 3, dep);
    });
    const segs = [[I.N0, I.N1, I.neckR, (I.neckR + A.D.neck.r2) / 2], [I.N1, I.H, (I.neckR + A.D.neck.r2) / 2, A.D.neck.r2]];
    for (const [a, b, ra, rb] of segs) {
      C.ring(lerpV(a, b, 0.5), sub(b, a), v3(0, 1, 0), lerp(ra, rb, 0.5), -150, 150, col, 2.6, dep);
    }
  }
  // Bürstenmähne entlang des Halses (oben auf dem Hals)
  function mane(A, C, I, color, alt, height, flowerAt) {
    const nr2 = A.D.neck.r2, pts = [];
    for (let k = 0; k <= 6; k++) {
      const tt = k / 6;
      const c0 = tt < 0.5 ? lerpV(I.N0, I.N1, tt * 2) : lerpV(I.N1, I.H, tt * 2 - 1);
      const dir = norm(tt < 0.5 ? sub(I.N1, I.N0) : sub(I.H, I.N1));
      const upN = norm(cross(I.r, dir));
      const rr = lerp(I.neckR, nr2, tt);
      pts.push(add(c0, mul(upN, rr * 0.82 + height * 0.45)));
    }
    pts[0] = lerpV(pts[0], pts[1], 0.4);
    pts[6] = add(I.F(-I.hr * 0.25, I.hr * 0.8, 0), v3(0, 0, 0));
    const d0 = I.body.depth + 0.3;
    for (let k = 0; k < pts.length - 1; k++) {
      C.cap(pts[k], pts[k + 1], height * 0.55, height * 0.55, alt && k % 2 ? alt : color, { depth: d0 + k * 0.001 });
    }
    if (flowerAt != null) flower(C, pts[flowerAt], height * 0.75, d0 + 0.05, '#ff9cc2');
    return pts;
  }
  function zebraHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    mane(A, C, I, col.stripe, col.body, R.foal ? 7.5 : 6.5, R.flower ? 3 : null);
    for (const s of [-1, 1]) {
      const e0 = F(-hr * 0.2, hr * 0.68, s * hr * 0.42), e1 = F(-hr * 0.38, hr * 1.55, s * hr * 0.62);
      const ear = C.cap(e0, e1, hr * 0.27, hr * 0.08, col.body, { side: s, depth: I.dEar + s * 0.01 });
      if (C.facing(f) > -0.1) C.cap(lerpV(e0, e1, 0.15), lerpV(e0, e1, 0.75), hr * 0.13, hr * 0.04, col.earIn, { depth: ear.depth + 0.01, flat: true, stroke: 'none' });
      C.ring(lerpV(e0, e1, 0.3), sub(e1, e0), f, hr * 0.2, -70, 70, col.stripe, 2.2, ear.depth + 0.02);
    }
    // Stirnlocke
    for (const k of [-1, 0, 1]) {
      const b0 = F(hr * 0.05, hr * 0.88, k * hr * 0.12);
      C.cap(b0, add(b0, add(mul(u, hr * 0.32), mul(f, hr * (0.22 - 0.06 * Math.abs(k))))), hr * 0.11, hr * 0.03, col.stripe, { depth: I.base + 0.25 + k * 0.001 });
    }
    const sk = C.ball(H, hr, col.body, { shine: true });
    C.ring(F(-hr * 0.15, 0, 0), f, u, hr * 0.99, -70, 70, col.stripe, 3, sk.depth + 0.03);
    C.ring(F(hr * 0.22, 0, 0), f, u, hr * 0.97, -55, 55, col.stripe, 2.6, sk.depth + 0.03);
    // Schnauze
    const m0 = F(hr * 0.45, -hr * 0.3, 0), m1 = F(hr * 1.05, -hr * 0.48, 0);
    const mz = C.cap(m0, m1, hr * 0.62, hr * 0.6, col.body, { depth: I.dFace - 0.1 });
    C.ring(lerpV(m0, m1, 0.35), sub(m1, m0), u, hr * 0.62, -75, 75, col.stripe, 2.6, mz.depth + 0.02);
    const nose = C.ball(F(hr * 1.22, -hr * 0.55, 0), hr * 0.46, col.muzzle, { depth: I.dFace, shine: true });
    for (const s of [-1, 1]) C.spot(F(hr * 1.6, -hr * 0.38, s * hr * 0.22), norm(add(f, mul(r, s * 0.4))), hr * 0.09, INK, { depth: nose.depth + 0.02 });
    if (C.facing(f) > -0.2) C.curve(F(hr * 1.5, -hr * 0.78, -hr * 0.2), F(hr * 1.62, -hr * 0.9, 0), F(hr * 1.5, -hr * 0.78, hr * 0.2), '#ffffff', C.SW * 0.7, { depth: nose.depth + 0.02, op: 0.7 });
    for (const s of [-1, 1]) {
      cuteEye(C, I, F(hr * 0.5, hr * 0.22, s * hr * 0.52), hr * (R.head > 1 ? 0.25 : 0.22), { lashes: R.lashes, side: s });
      cheek(C, I, F(hr * 0.75, -hr * 0.25, s * hr * 0.52), hr * 0.15);
    }
    if (w.eat > 0.02) grass(C, v3(H.x + f.x * hr * 1.4, 0, H.z + f.z * hr * 1.4), w.eat, A.t, 1);
  }

  /* ── Gnu ───────────────────────────────────────────────────── */
  function gnuBody(A, C, I) {
    if (!A.col.stripe) return;
    const dep = I.body.depth + 0.02;
    for (let k = 0; k < 5; k++) {
      const tt = 0.5 + k * 0.1;
      const c0 = lerpV(I.mid, I.chest, (tt - 0.5) * 2), rr = lerp(I.br, I.cr, (tt - 0.5) * 2);
      C.ring(c0, sub(I.chest, I.hip), v3(0, 1, 0), rr, -75, 75, A.col.stripe, 2.4, dep, { op: 0.7 });
    }
  }
  function gnuHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    // Zottelmähne
    const nr2 = A.D.neck.r2;
    for (let k = 0; k <= 5; k++) {
      const tt = k / 5;
      const c0 = tt < 0.5 ? lerpV(I.N0, I.N1, tt * 2) : lerpV(I.N1, I.H, tt * 2 - 1);
      const dir = norm(tt < 0.5 ? sub(I.N1, I.N0) : sub(I.H, I.N1));
      const upN = norm(cross(r, dir));
      C.fluff(add(c0, mul(upN, lerp(I.neckR, nr2, tt) * 0.85)), R.calf ? 3.6 : 4.6, 6, col.mane, { depth: I.body.depth + 0.3 + k * 0.001, rot: k });
    }
    if (R.beard) {
      for (let k = 0; k < 4; k++) {
        const tt = 0.3 + k * 0.2;
        const c0 = tt < 0.5 ? lerpV(I.N0, I.N1, tt * 2) : lerpV(I.N1, I.H, tt * 2 - 1);
        const dir = norm(tt < 0.5 ? sub(I.N1, I.N0) : sub(I.H, I.N1));
        const dn = mul(norm(cross(r, dir)), -1);
        const top = add(c0, mul(dn, lerp(I.neckR, nr2, tt) * 0.8));
        const sw = Math.sin(A.t * 2 + k) * 1.2;
        C.cap(top, add(top, v3(sw, -(6 + (k % 2) * 3) * R.beard, 0)), 3.2, 1.6, col.mane, { depth: I.body.depth + 0.25 });
      }
    }
    for (const s of [-1, 1]) {
      const e0 = F(-hr * 0.1, hr * 0.45, s * hr * 0.7), e1 = F(-hr * 0.35, hr * 0.62, s * hr * 1.45);
      const ear = C.cap(e0, e1, hr * 0.26, hr * 0.12, col.body, { side: s, depth: I.dEar + s * 0.01 });
      if (C.facing(u) > 0) C.cap(lerpV(e0, e1, 0.2), lerpV(e0, e1, 0.8), hr * 0.12, hr * 0.05, col.earIn, { depth: ear.depth + 0.01, flat: true, stroke: 'none' });
    }
    // Hörner: erst nach außen, dann nach unten, dann hoch
    if (R.horn) {
      const hk = R.horn;
      for (const s of [-1, 1]) {
        const p0 = F(-hr * 0.05, hr * 0.78, s * hr * 0.4);
        const p1 = add(p0, add(mul(r, s * hr * 0.75 * hk), mul(u, hr * 0.15 * hk)));
        const p2 = add(p1, add(mul(r, s * hr * 0.45 * hk), add(mul(u, -hr * 0.3 * hk), mul(f, -hr * 0.12 * hk))));
        const p3 = add(p2, add(mul(r, s * hr * 0.05 * hk), add(mul(u, hr * 0.7 * hk), mul(f, hr * 0.05 * hk))));
        const hw = Math.max(0.6, hk);
        C.blob([[p0, p1, 4.2 * hw, 3.4 * hw], [p1, p2, 3.4 * hw, 2.6 * hw], [p2, p3, 2.6 * hw, 1]], col.horn, { side: s, depth: I.dEar + 0.05 + s * 0.01, shine: 0 });
        if (R.flower && s === 1) flower(C, p1, 2.8, I.dEar + 0.1, '#ffffff');
      }
    }
    C.ball(H, hr, col.body, { shine: true });
    const m0 = F(hr * 0.55, -hr * 0.45, 0), m1 = F(hr * 1.1, -hr * 0.58, 0);
    C.cap(m0, m1, hr * 0.52, hr * 0.56, col.muzzle, { depth: I.dFace - 0.1, shine: true });
    const nose = C.ball(F(hr * 1.22, -hr * 0.62, 0), hr * 0.5, shade(col.muzzle, 0.92), { depth: I.dFace });
    for (const s of [-1, 1]) C.spot(F(hr * 1.62, -hr * 0.5, s * hr * 0.24), norm(add(f, mul(r, s * 0.4))), hr * 0.1, INK, { depth: nose.depth + 0.02 });
    if (C.facing(f) > -0.2) C.curve(F(hr * 1.5, -hr * 0.92, -hr * 0.2), F(hr * 1.6, -hr * 1.02, 0), F(hr * 1.5, -hr * 0.92, hr * 0.2), '#ffffff', C.SW * 0.7, { depth: nose.depth + 0.02, op: 0.6 });
    if (R.beard) C.fluff(F(hr * 0.85, -hr * 1.08, 0), hr * 0.3 * R.beard, 6, col.mane, { depth: I.dFace - 0.15 });
    for (const s of [-1, 1]) {
      cuteEye(C, I, F(hr * 0.48, hr * 0.2, s * hr * 0.55), hr * (R.head > 1 ? 0.24 : 0.21), { lashes: R.lashes, side: s });
      cheek(C, I, F(hr * 0.72, -hr * 0.25, s * hr * 0.56), hr * 0.14);
    }
    if (w.eat > 0.02) grass(C, v3(H.x + f.x * hr * 1.5, 0, H.z + f.z * hr * 1.5), w.eat, A.t, 1);
  }

  /* ── Elefant ───────────────────────────────────────────────── */
  function eleLeg(A, C, J, K, Fp, P, dep) {
    for (let k = 0; k < 2; k++) {
      const tt = 0.45 + k * 0.2;
      C.ring(lerpV(K, Fp, tt), sub(Fp, K), v3(1, 0, 0), lerp(P.r2, P.r3, tt), -60, 60, INK, 0.9, dep + 0.01, { op: 0.35 });
    }
  }
  function eleHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w, t = A.t;
    const ek = R.ear || 1;
    // Ohren fächeln; beim Rennen weit abgespreizt, im Schlaf angelegt
    for (const s of [-1, 1]) {
      const flap = lerp(lerp(0.72 + 0.2 * Math.sin(t * 1.5 + s * 0.8), 1.15, w.run), 0.4, w.sleep);
      const attach = F(-hr * 0.28, hr * 0.12, s * hr * 0.68);
      const vd = norm(add(mul(f, -Math.cos(flap)), mul(r, s * Math.sin(flap))));
      const eu = mul(u, hr * 0.88 * ek), ev = mul(vd, hr * 0.64 * ek);
      const c0 = add(add(attach, mul(ev, 0.9)), mul(u, -hr * 0.08 * ek));
      const ear = C.disc(c0, eu, ev, col.ear, { side: s });
      const nrm = norm(cross(ev, eu)), inner = s > 0 ? nrm : mul(nrm, -1);
      if (C.facing(mul(inner, -1)) > 0) C.disc(add(c0, mul(ev, -0.05)), mul(eu, 0.74), mul(ev, 0.72), col.earIn, { stroke: 'none', depth: ear.depth + 0.01, side: s });
      if (R.flower && s === -1) flower(C, add(attach, add(mul(u, hr * 0.75), mul(f, hr * 0.15))), hr * 0.13, Math.max(ear.depth, I.base) + 0.4, '#ffffff');
      C.bone(attach, add(attach, mul(ev, 1.8)));
    }
    C.ball(H, hr, col.body, { shine: true });
    // Haarbüschel: drei kleine Locken
    for (let k = -1; k <= 1; k++) {
      const b0 = F(-hr * 0.02, hr * 0.97, k * hr * 0.1), L = hr * (R.hair ? 0.2 : 0.13);
      C.curve(b0, add(b0, add(mul(u, L * 0.7), mul(r, k * L * 0.35))), add(b0, add(mul(u, L), add(mul(r, k * L * 0.75), mul(f, L * 0.25)))), INK, C.SW * 0.7, { depth: I.base + 0.1 });
    }
    // Rüssel: Kette, Spitze nach oben eingerollt
    const tr = A.D.trunk, n = tr.n, seg = tr.len * R.head / n;
    const e = (t * 0.32) % 1;
    const curlW = e < 0.42 ? 0 : e < 0.66 ? smooth((e - 0.42) / 0.24) : e < 0.84 ? 1 : 1 - smooth((e - 0.84) / 0.16);
    const eatW = w.eat;
    let th = lerp(-80 + 6 * Math.sin(t * 0.7) * (1 - w.walk) + 6 * w.walk * Math.sin(TAU * A.phase), lerp(-84, -100, curlW), eatW);
    th = lerp(th, -84, w.sleep);
    let p = F(hr * 0.82, -hr * 0.25, 0);
    const tparts = [];
    for (let k = 0; k < n; k++) {
      const idle = (k >= n - 3 ? 15 : 0.5) + 4 * Math.sin(t * 1.1 - k * 0.5) * (1 - w.sleep);
      const kap = lerp(lerp(idle, k >= n - 3 ? 6 : 1, w.sleep), lerp(1, k < 2 ? 8 : 34, curlW), eatW);
      th += kap;
      const lat = 0.12 * Math.sin(t * 1.2 - k * 0.35) * (1 - w.sleep);
      const d = add(add(mul(f, Math.cos(th * DEG) * Math.cos(lat)), mul(u, Math.sin(th * DEG))), mul(r, Math.cos(th * DEG) * Math.sin(lat)));
      const r1 = lerp(tr.r1, tr.r2, k / n) * R.head, r2 = lerp(tr.r1, tr.r2, (k + 1) / n) * R.head;
      const nx = ground(add(p, mul(d, seg)), r2);
      tparts.push([p, nx, r1, r2]);
      C.bone(p, nx);
      p = nx;
    }
    const tb = C.blob(tparts, col.body, { depth: I.dFace + 0.1, shine: 1 });
    for (const [a, b, ra] of tparts.slice(1, -1)) C.ring(lerpV(a, b, 0.5), sub(b, a), f, ra * 1.0, -55, 55, INK, 0.9, tb.depth + 0.01, { op: 0.35 });
    const tipR = tparts[n - 1][3];
    const tip = C.ball(p, tipR * 1.15, col.body, { depth: tb.depth + 0.02 });
    const last = norm(sub(tparts[n - 1][1], tparts[n - 1][0]));
    if (C.facing(last) > 0.2) C.spot(add(p, mul(last, tipR * 0.6)), last, tipR * 0.42, INK, { depth: tip.depth + 0.01, op: 0.7 });
    // Lächeln und Zunge unter dem Rüssel
    if (C.facing(f) > -0.1) {
      for (const s of [-1, 1]) C.curve(F(hr * 0.72, -hr * 0.48, s * hr * 0.32), F(hr * 0.78, -hr * 0.62, s * hr * 0.22), F(hr * 0.8, -hr * 0.6, s * hr * 0.12), INK, C.SW * 0.8, { depth: I.dFace + 0.05 });
    }
    // Stoßzähne
    if (R.tusk) {
      const L = 22 * R.tusk;
      for (const s of [-1, 1]) {
        const p0 = F(hr * 0.68, -hr * 0.45, s * hr * 0.32);
        const p1 = add(p0, add(add(mul(f, L * 0.45), mul(u, -L * 0.35)), mul(r, s * L * 0.08)));
        const p2 = add(p1, add(add(mul(f, L * 0.45), mul(u, L * 0.25)), mul(r, s * L * 0.02)));
        const tw = 3.8 * Math.sqrt(R.tusk);
        C.blob([[p0, p1, tw, tw * 0.8], [p1, p2, tw * 0.8, 1.2]], col.tusk, { depth: I.dFace + 0.15 + s * 0.01 * Math.sign(I.toCam || 1), side: s, shine: 0 });
      }
    }
    for (const s of [-1, 1]) {
      cuteEye(C, I, F(hr * 0.6, hr * 0.14, s * hr * 0.44), hr * (R.head > 1 ? 0.17 : 0.15), { lashes: R.lashes, side: s });
      cheek(C, I, F(hr * 0.55, -hr * 0.14, s * hr * 0.62), hr * 0.12);
    }
    // Futter: Gras am Boden, später im Rüssel
    if (eatW > 0.02) {
      grass(C, v3(H.x + f.x * hr * 1.9, 0, H.z + f.z * hr * 1.9), eatW * (1 - curlW * 0.6), t, 1.3);
      if (curlW > 0.15) C.fluff(p, 4.5 * R.head + 1, 7, '#7cc24a', { op: eatW * curlW, depth: tip.depth + 0.05 });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     Krokodil: Wirbelsäule als Kette, gespreizte Beine
     ══════════════════════════════════════════════════════════════ */
  function buildCroc(A, C) {
    const D = A.D, R = A.R, w = A.w, t = A.t, G = D.gait, col = A.col;
    const g = gaitInfo(A), ph = A.phase, m = g.m;
    const sp = D.spine, n = sp.length;
    const high = lerp(lerp(D.lowY, D.highY, Math.min(1, w.walk * 1.2 + w.run)), D.lowY - 1.5, w.sleep);
    const hop = G.hop * w.run * (0.5 + 0.5 * Math.sin(TAU * ph + 1.2));
    const rock = G.rock * w.run * Math.sin(TAU * (ph + 0.15));
    const und = G.undW * w.walk + G.undR * w.run;
    const breathe = Math.sin(t * TAU * 0.2) * 0.5;
    const nodes = sp.map(([x, rr], i) => {
      const tail = Math.max(0, i - 3);
      const y = i <= 3 ? high + hop + (i < 2 ? rock : -rock) : lerp(high, rr * 0.95, Math.min(1, tail / 5));
      const lat = und * Math.sin(TAU * ph - i * 0.65) * (0.2 + i * 0.12)
        + (1 - m) * (tail > 0 ? 2.2 * Math.sin(t * 0.9 - i * 0.5) * tail * 0.45 * (1 - w.sleep * 0.7) : 0);
      const r = rr + (i >= 1 && i <= 3 ? breathe : 0);
      return { p: v3(x, Math.max(y, r * 0.9), lat), r };
    });
    const parts = [];
    for (let i = 0; i < n - 1; i++) { parts.push([nodes[i].p, nodes[i + 1].p, nodes[i].r, nodes[i + 1].r]); C.bone(nodes[i].p, nodes[i + 1].p); }
    const body = C.blob(parts, col.body, { shine: 1 });
    C.shadow(nodes[0].p, nodes[4].p, 15);
    const up = v3(0, 1, 0);
    for (let i = 0; i < n - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (R.bands && i >= 1) C.ring(lerpV(a.p, b.p, 0.5), sub(b.p, a.p), up, lerp(a.r, b.r, 0.5), -80, 80, col.band, 3, body.depth + 0.01);
      // Rückenhöcker: Kugeln mit Umriss
      for (const tt of [0.3, 0.8]) {
        const c0 = lerpV(a.p, b.p, tt), rr = lerp(a.r, b.r, tt);
        const bs = Math.max(1.6, rr * 0.2);
        if (i < 4) for (const s of [-1, 1]) {
          const nn = norm(v3(0, 0.9, s * 0.42));
          if (C.facing(nn) > 0.05) C.ball(add(c0, mul(nn, rr * 0.94)), bs, col.scute, { depth: body.depth + 0.02, sw: C.SW * 0.6 });
        } else if (C.facing(up) > 0.05) C.ball(add(c0, v3(0, rr * 0.95, 0)), bs * 1.05, col.scute, { depth: body.depth + 0.02, sw: C.SW * 0.6 });
      }
    }
    // Beine
    const legs = [[1, true], [3, false]];
    for (const [ni, front] of legs) for (const side of [-1, 1]) {
      const nd = nodes[ni];
      const J = add(nd.p, v3(front ? 2 : -2, -nd.r * 0.3, side * nd.r * 0.72));
      const L = D.legs, l1 = front ? L.l1 : L.l1 * 1.12, l2 = front ? L.l2 : L.l2 * 1.08;
      const fo = footOffset(g, ph, LEGS.findIndex(q => q.front === front && q.side === side));
      const bx = sp[ni][0] + (front ? 5 : -1);
      let Fp = v3(bx + fo.x, L.fr + fo.y, side * (sp[ni][1] * 0.72 + L.spread));
      Fp = lerpV(Fp, v3(bx + (front ? 7 : -5), L.fr, side * (sp[ni][1] * 0.72 + L.spread + 3)), w.sleep);
      const leg = ik(J, Fp, l1, l2, norm(v3(0, 1, side * 0.5)));
      const K = leg.K; Fp = leg.F;
      const lp = C.blob([[J, K, L.r1, L.r2], [K, Fp, L.r2, L.r3]], col.body, { side, shine: 0 });
      C.bone(J, K); C.bone(K, Fp);
      const foot = C.ball(add(Fp, v3(1.5, -0.6, side * 0.8)), L.r3 * 1.1, col.body, { side, depth: lp.depth + 0.01 });
      for (const k of [-1, 0, 1]) {
        const tp = add(Fp, v3(1.5 + L.r3 * 1.05, -0.8, side * 0.8 + k * L.r3 * 0.55));
        if (C.facing(v3(0, 1, 0)) > 0) C.ball(tp, L.r3 * 0.32, '#fff6e6', { depth: foot.depth + 0.01, sw: C.SW * 0.5 });
      }
      if (R.bands) C.ring(lerpV(J, K, 0.5), sub(K, J), v3(0, 1, 0), lerp(L.r1, L.r2, 0.5), -90, 90, col.band, 2, lp.depth + 0.01);
    }
    // Kopf
    const N = nodes[0].p, hk = R.head;
    const e = (t * 0.42) % 1, eatW = w.eat;
    const openE = e < 0.62 ? smooth(e / 0.62) : e < 0.68 ? 1 - smooth((e - 0.62) / 0.06) : 0;
    const shake = e >= 0.68 && e < 0.95 ? Math.sin((e - 0.68) * 60) * 0.25 * (1 - (e - 0.68) / 0.27) : 0;
    const hp = lerp(6, 6 + openE * 22, eatW) * DEG;
    let jo = lerp(0.08 + 0.04 * Math.sin(t * 0.5), openE * 0.85, eatW);
    jo = lerp(jo, 0.3, w.sleep);
    const yaw = A.lookNow * 0.6 + shake * eatW;
    const L = D.head.len * hk, hr = D.head.r * hk;
    const H = add(N, rotY(v3(hr * 0.75, 1, 0), v3(0, 0, 0), yaw));
    const f = v3(Math.cos(hp) * Math.cos(yaw), Math.sin(hp), Math.cos(hp) * Math.sin(yaw));
    const r = v3(-Math.sin(yaw), 0, Math.cos(yaw)), u = cross(r, f);
    const F = (a, b, c) => v3(H.x + f.x * a + u.x * b + r.x * c, H.y + f.y * a + u.y * b + r.y * c, H.z + f.z * a + u.z * b + r.z * c);
    const I = Object.assign({ H, f, u, r, F, hr, eye: eyeState(A) }, headFrame(C, H, f, hr));
    C.bone(N, H);
    // Unterkiefer
    const hinge = F(-hr * 0.2, -hr * 0.4, 0);
    const jd = add(mul(f, Math.cos(jo)), mul(u, -Math.sin(jo)));
    const jt = add(hinge, mul(jd, L * 0.95));
    const lower = C.blob([[hinge, jt, hr * 0.7, hr * 0.42]], col.jaw, { depth: I.base - 0.2 });
    C.bone(hinge, jt);
    if (jo > 0.12) {
      C.cap(F(0, -hr * 0.35, 0), lerpV(F(L * 0.6, -hr * 0.2, 0), add(hinge, mul(jd, L * 0.6)), 0.5), hr * 0.5, hr * 0.3, col.mouth, { depth: I.base - 0.25, flat: true });
      for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
        const tp = add(hinge, add(mul(jd, L * (0.3 + k * 0.13)), add(mul(u, hr * 0.32), mul(r, s * hr * 0.3 * (1 - k * 0.1)))));
        C.cap(tp, add(tp, mul(u, 2.4 * hk)), 1.1 * hk, 0.35, col.teeth, { depth: lower.depth + 0.03, sw: C.SW * 0.45 });
      }
    }
    // Oberkiefer: runder Schädel + Schnauze
    const sk = C.blob([[F(0, 0, 0), F(L * 0.35, -hr * 0.08, 0), hr, hr * 0.78], [F(L * 0.35, -hr * 0.08, 0), F(L, -hr * 0.2, 0), hr * 0.68, hr * 0.56]], col.body, { depth: I.base, shine: 0 });
    C.bone(H, F(L, -hr * 0.2, 0));
    // Zähnchen: das Krokodil-Lächeln
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
      const tt = 0.3 + k * 0.12, rr = lerp(hr * 0.68, hr * 0.56, (tt - 0.3) / 0.7);
      const tp = F(L * tt, -hr * 0.2 - rr * 0.62, s * rr * 0.72);
      if (C.facing(mul(r, s)) > -0.1) C.cap(tp, add(tp, mul(u, -2.6 * hk)), 1.15 * hk, 0.35, col.teeth, { depth: sk.depth + 0.02, sw: C.SW * 0.45 });
    }
    const nb = C.ball(F(L * 0.96, hr * 0.15, 0), hr * 0.32, col.body, { depth: sk.depth + 0.03 });
    for (const s of [-1, 1]) C.spot(F(L * 1.0, hr * 0.42, s * hr * 0.13), u, 1.1 * hk, INK, { depth: nb.depth + 0.01 });
    for (const s of [-1, 1]) cheek(C, I, F(L * 0.45, -hr * 0.05, s * hr * 0.66), hr * 0.18);
    // Augen auf Höckern
    for (const s of [-1, 1]) {
      const bump = F(hr * 0.2, hr * 0.85, s * hr * 0.48);
      const bb = C.ball(bump, hr * 0.48, col.body, { depth: sk.depth + 0.1 + s * 0.001 * Math.sign(I.toCam || 1), side: s, shine: true });
      const ep = add(bump, add(mul(f, hr * 0.26), add(mul(u, hr * 0.12), mul(r, s * hr * 0.26))));
      const Ib = Object.assign({}, I, { H: bump, dFace: bb.depth });
      cuteEye(C, Ib, ep, hr * (R.head > 1 ? 0.27 : 0.24), { lashes: R.lashes, side: s });
    }
    if (R.flower) flower(C, F(-hr * 0.45, hr * 0.95, 0), hr * 0.22, sk.depth + 0.3, '#ffffff');
    // Fisch
    if (eatW > 0.02) {
      const inMouth = e >= 0.62;
      const fc = inMouth ? F(L * 0.55, -hr * 0.3, 0) : v3(H.x + L * 1.45, 3.5, H.z);
      const fd = inMouth ? r : f;
      const wig = Math.sin(t * 14) * (inMouth ? 0.6 : 0.2);
      const tailP = add(fc, add(mul(fd, -6 * hk), v3(0, 0, wig * 3)));
      const fo = { op: eatW, bias: inMouth ? 0.6 : 0 };
      C.cap(add(tailP, mul(fd, -2.5 * hk)), add(tailP, mul(fd, -4 * hk)), 1, 3 * hk, '#6aa8d8', fo);
      const fb = C.cap(add(fc, mul(fd, 4.5 * hk)), tailP, 3.4 * hk, 2 * hk, '#8fd0f0', Object.assign({ shine: true }, fo));
      if (C.facing(v3(0, 1, 0)) > 0) C.spot(add(fc, add(mul(fd, 4.5 * hk), v3(0, 1.2 * hk, 0))), v3(0, 1, 0), 0.8 * hk, INK, { depth: fb.depth + 0.01, op: eatW });
    }
    effects(A, C, F(hr * 0.2, hr * 1.4, 0));
  }

  /* ══════════════════════════════════════════════════════════════
     Die Arten
     ══════════════════════════════════════════════════════════════
     Maße in „Einheiten" beim Papa; Mama und Kind skalieren mit s.
     Kindchenschema: großer Kopf, runder Bauch, kurze Beine.
     fl / hl = Vorder- / Hinterbein: l1 Ober-, l2 Unterschenkel,
     r1…r3 Dicke oben, Knie, unten; w = halbe Spurbreite;
     jx/jy = Hüftgelenk relativ zur Rumpfmitte; bend = Knick vorn(+)/hinten(−);
     home = Fußpunkt vor(+)/hinter(−) dem Gelenk; fr = Fuß-/Hufgröße.
     gait: walkV/runV Tempo, walkF/runF Takt (Schritte je s),
     walkB/runB Anteil Bodenkontakt, liftW/liftR Fußhub.            */
  const SPECIES = {
    lion: {
      name: 'Löwen', kind: 'quad', box: '-112 -118 224 168',
      roles: {
        papa: { title: 'Löwe', s: 1, mane: 1 },
        mama: { title: 'Löwin', s: 0.88, lashes: 1, flower: 1 },
        kind: { title: 'Löwenjunges', s: 0.55, head: 1.12, ear: 1.25, spots: 1, tuft: 1, tailK: 0.85 }
      },
      col: { body: '#f2b45a', light: '#fff1d6', mane: '#b5642a', mane2: '#d9843a', nose: '#e0607e', earIn: '#ffb3a7', tuft: '#a5561f', paw: '#f7c47a' },
      kidCol: { body: '#f5c271', mane2: '#e6a04f' },
      chest: { x: 15, r: 21 }, hip: { x: -17, r: 19 }, belly: { r: 22.5, drop: 2 },
      fl: { l1: 14, l2: 13, r1: 8.5, r2: 7, r3: 7, w: 10.5, jx: 2, jy: -10, bend: 1, foot: 'paw', fr: 7.5, home: 2 },
      hl: { l1: 15, l2: 13, r1: 11, r2: 7, r3: 7, w: 10.5, jx: -2, jy: -8, bend: -1, foot: 'paw', fr: 7.5, home: -1 },
      neck: { bx: 9, by: 9, len: 12, a: 55, curve: -25, r1: 14, r2: 13, eatA: 15, sleepA: -25, runA: 25 },
      head: { r: 24, pitch: -4, runP: -8, eatP: -24, sleepP: -10, snout: 26 },
      tail: { n: 6, seg: 7, r1: 3.2, r2: 2.4, a: -60, curl: 15, sway: 0.25, run: 55, ball: 1 },
      gait: { walkV: 30, walkF: 1.15, walkB: 0.62, run: 'gallop', runV: 120, runF: 2.5, runB: 0.4, liftW: 7, liftR: 12, bob: 1.4, rock: 4, hop: 4, nod: 2 },
      eatLie: true, sleepFront: 'sphinx', food: 'meat',
      drawHead: lionHead
    },
    elephant: {
      name: 'Elefanten', kind: 'quad', box: '-140 -158 280 210',
      roles: {
        papa: { title: 'Elefantenbulle', s: 1, tusk: 1, sleepStand: 1 },
        mama: { title: 'Elefantenkuh', s: 0.84, tusk: 0.55, sleepStand: 1, lashes: 1, flower: 1 },
        kind: { title: 'Elefantenkalb', s: 0.52, head: 1.1, ear: 1.08, hair: 1, sleepFront: 'sphinx' }
      },
      col: { body: '#a9b4c6', ear: '#a1acbf', earIn: '#f5b3c4', tusk: '#fff8e8', nail: '#fff6e6', foot: '#b3bdcd', tuft: '#5d6577' },
      kidCol: { body: '#b4bfd1', ear: '#acb7c9' },
      chest: { x: 16, r: 32 }, hip: { x: -16, r: 30 }, belly: { r: 34, drop: 3 },
      fl: { l1: 17, l2: 15, r1: 12.5, r2: 11.5, r3: 12, w: 16, jx: 3, jy: -15, bend: 1, foot: 'pad', fr: 12, home: 2 },
      hl: { l1: 17, l2: 14, r1: 14.5, r2: 11.5, r3: 12, w: 16, jx: -3, jy: -13, bend: 1, foot: 'pad', fr: 12, home: -2 },
      neck: { bx: 12, by: 12, len: 8, a: 20, curve: 0, r1: 23, r2: 22, eatA: 5, sleepA: -10, runA: 10 },
      head: { r: 31, pitch: 0, eatP: -10, sleepP: -12, snout: 20 },
      trunk: { n: 8, len: 62, r1: 10, r2: 5.5 },
      tail: { n: 5, seg: 7, r1: 2.6, r2: 2, a: -82, curl: 3, sway: 0.35, run: 25, tuft: 1 },
      gait: { walkV: 28, walkF: 0.85, walkB: 0.62, run: 'amble', runV: 85, runF: 1.6, runB: 0.5, liftW: 7, liftR: 11, bob: 1.6, rock: 1.2, hop: 1.6, nod: 1.5 },
      sleepFront: 'tuck', legRings: eleLeg,
      drawHead: eleHead
    },
    zebra: {
      name: 'Zebras', kind: 'quad', box: '-118 -132 236 177',
      roles: {
        papa: { title: 'Zebrahengst', s: 1 },
        mama: { title: 'Zebrastute', s: 0.92, lashes: 1, flower: 1 },
        kind: { title: 'Zebrafohlen', s: 0.6, head: 1.12, legK: 1.12, foal: 1 }
      },
      col: { body: '#fbfaf5', stripe: '#1e1b2e', muzzle: '#6e6886', hoof: '#3b3650', tuft: '#1e1b2e', earIn: '#ffc2cf' },
      kidCol: { stripe: '#7a4b35', muzzle: '#6b4a3a', tuft: '#7a4b35' },
      chest: { x: 16, r: 18.5 }, hip: { x: -16, r: 17.5 }, belly: { r: 19.5, drop: 2 },
      fl: { l1: 17, l2: 16, r1: 7.5, r2: 6, r3: 6, w: 8.5, jx: 2, jy: -8, bend: 1, foot: 'hoof', fr: 5.5, home: 1 },
      hl: { l1: 18, l2: 16, r1: 10, r2: 6, r3: 6, w: 8.5, jx: -2, jy: -6, bend: -1, foot: 'hoof', fr: 5.5, home: -2 },
      neck: { bx: 9, by: 7, len: 22, a: 62, curve: -15, r1: 11.5, r2: 10.5, eatA: -55, sleepA: 25, runA: 35 },
      head: { r: 19, pitch: -22, runP: -12, eatP: -70, sleepP: -35, snout: 30 },
      tail: { n: 4, seg: 6.5, r1: 2.4, r2: 2, a: -70, curl: 4, sway: 0.2, run: 35, tuft: 1 },
      gait: { walkV: 34, walkF: 1.1, walkB: 0.62, run: 'gallop', runV: 135, runF: 2.5, runB: 0.4, liftW: 8, liftR: 13, bob: 1.3, rock: 4, hop: 5, nod: 3 },
      graze: true, eatDrop: 5, sleepFront: 'tuck', legRings: zebraLeg,
      drawHead: zebraHead, drawBody: zebraBody
    },
    gnu: {
      name: 'Gnus', kind: 'quad', box: '-118 -132 236 177',
      roles: {
        papa: { title: 'Gnubulle', s: 1, horn: 1, beard: 1 },
        mama: { title: 'Gnukuh', s: 0.92, horn: 0.72, beard: 0.75, lashes: 1, flower: 1 },
        kind: { title: 'Gnukalb', s: 0.6, head: 1.12, legK: 1.1, horn: 0.25, calf: 1 }
      },
      col: { body: '#7d8aa3', stripe: '#5b6680', mane: '#2e2b40', horn: '#4a4560', muzzle: '#3d3a52', hoof: '#2e2b40', tail: '#3d3a52', tuft: '#2e2b40', earIn: '#c9a7b8' },
      kidCol: { body: '#d39a62', stripe: null, mane: '#8a5733', muzzle: '#6b4430', tail: '#b07a4a', tuft: '#8a5733', horn: '#6b4430' },
      chest: { x: 15, r: 21 }, hip: { x: -16, r: 16.5 }, belly: { r: 19, drop: 2 },
      fl: { l1: 17, l2: 16, r1: 8, r2: 6, r3: 6, w: 9, jx: 2, jy: -9, bend: 1, foot: 'hoof', fr: 5.5, home: 1 },
      hl: { l1: 16, l2: 15, r1: 9.5, r2: 6, r3: 6, w: 8.5, jx: -2, jy: -5, bend: -1, foot: 'hoof', fr: 5.5, home: -2 },
      neck: { bx: 9, by: 5, len: 18, a: 42, curve: -15, r1: 13, r2: 11.5, eatA: -55, sleepA: 10, runA: 22 },
      head: { r: 17, pitch: -30, runP: -18, eatP: -72, sleepP: -45, snout: 28 },
      tail: { n: 5, seg: 6.5, r1: 2.2, r2: 3, a: -75, curl: 3, sway: 0.3, run: 30, tuft: 1 },
      gait: { walkV: 34, walkF: 1.15, walkB: 0.62, run: 'gallop', runV: 135, runF: 2.55, runB: 0.4, liftW: 8, liftR: 13, bob: 1.4, rock: 4, hop: 5, nod: 3 },
      graze: true, eatDrop: 5, sleepFront: 'tuck',
      drawHead: gnuHead, drawBody: gnuBody
    },
    croc: {
      name: 'Krokodile', kind: 'croc', box: '-118 -100 236 177',
      roles: {
        papa: { title: 'Krokodil-Männchen', s: 1 },
        mama: { title: 'Krokodil-Weibchen', s: 0.84, lashes: 1, flower: 1 },
        kind: { title: 'Jungtier', s: 0.5, head: 1.15, bands: 1 }
      },
      col: { body: '#6fbf5a', jaw: '#c9e29a', scute: '#4f9a45', teeth: '#ffffff', mouth: '#ff8fa3' },
      kidCol: { body: '#9ccf5e', jaw: '#e1eeb0', scute: '#6fae45', band: '#5a8f3a' },
      spine: [[22, 12.5], [10, 15], [-4, 15.5], [-18, 14], [-31, 11], [-43, 8.5], [-54, 6.5], [-64, 4.8], [-73, 3.2]],
      lowY: 14, highY: 18,
      legs: { l1: 9, l2: 8.5, r1: 5.8, r2: 5, r3: 4.6, spread: 8, fr: 4.2 },
      head: { len: 34, r: 14 },
      gait: { walkV: 24, walkF: 0.95, walkB: 0.65, walkPat: 'trot', run: 'gallop', runV: 100, runF: 2.6, runB: 0.42, liftW: 5, liftR: 9, bob: 0.6, rock: 3, hop: 3.5, undW: 3.5, undR: 5 }
    }
  };
  const ORDER = ['lion', 'elephant', 'zebra', 'gnu', 'croc'];
  const ROLES = [['papa', 'Papa'], ['mama', 'Mama'], ['kind', 'Kind']];
  const MODES = { idle: {}, walk: { walk: 1 }, run: { run: 1 }, eat: { eat: 1 }, sleep: { sleep: 1 } };


  /* ── Ein Tier anlegen ──────────────────────────────────────── */
  function create(key, role) {
    const sp = SPECIES[key];
    const R = Object.assign({ head: 1, legK: 1, ear: 1, tailK: 1 }, sp.roles[role]);
    // Maße kopieren; Kinder: längere Beine (Fohlen, Kälber)
    const D = Object.assign({}, sp);
    if (sp.kind === 'quad') {
      D.fl = Object.assign({}, sp.fl, { l1: sp.fl.l1 * R.legK, l2: sp.fl.l2 * R.legK });
      D.hl = Object.assign({}, sp.hl, { l1: sp.hl.l1 * R.legK, l2: sp.hl.l2 * R.legK });
    }
    const col = Object.assign({}, sp.col, role === 'kind' && sp.kidCol ? sp.kidCol : {});
    return {
      key, role, D, R, col, s: R.s, food: sp.food,
      x: 0, z: 0, h: 0, mode: 'idle',
      w: { walk: 0, run: 0, eat: 0, sleep: 0 },
      t: Math.random() * 20, phase: Math.random(), freq: sp.gait.walkF, v: 0,
      look: 0, lookNow: 0, lookT: 1 + Math.random() * 3,
      blinkT: 1 + Math.random() * 3, blinking: false, seed: Math.random(),
      g: null, pool: []
    };
  }

  function update(A, dt) {
    A.t += dt;
    const tg = MODES[A.mode] || MODES.idle;
    for (const k of ['walk', 'run', 'eat', 'sleep']) {
      const rate = k === 'sleep' ? 1.6 : 3.2;
      A.w[k] += ((tg[k] || 0) - A.w[k]) * (1 - Math.exp(-rate * dt));
    }
    const G = A.D.gait, w = A.w, mw = w.walk + w.run, fs = 1 / Math.sqrt(A.s);
    A.freq = (mw > 1e-3 ? (w.walk * G.walkF + w.run * G.runF) / mw : G.walkF) * fs;
    A.v = (w.walk * G.walkV + w.run * G.runV) * fs;
    A.phase = (A.phase + dt * A.freq) % 1;
    A.road = (A.road || 0) + A.v * dt;
    // blinzeln
    A.blinkT -= dt;
    if (A.blinkT < 0) { A.blinking = true; if (A.blinkT < -0.13) { A.blinking = false; A.blinkT = 2 + Math.random() * 4; } }
    // Kopf zum Betrachter: wie im Zeichentrick schaut das Tier meist schräg nach vorn
    A.lookT -= dt;
    if (A.lookT < 0) {
      A.lookT = 1.5 + Math.random() * 3;
      A.look = Math.random() < 0.55 ? 0 : (Math.random() - 0.5) * 0.9;
    }
    const cam = Math.atan2(Math.cos(A.h), Math.sin(A.h));
    const bias = Math.abs(cam) < 1.75 ? clamp(cam, -0.75, 0.75) * 0.85 : 0;
    const free = (1 - Math.min(1, mw)) * (1 - w.eat) * (1 - w.sleep);
    const target = bias * (1 - 0.4 * w.sleep) + A.look * free;
    A.lookNow += (target - A.lookNow) * (1 - Math.exp(-3 * dt));
  }

  /* ── Zeichnen ──────────────────────────────────────────────── */
  function mount(A, parent) {
    A.g = document.createElementNS(NS, 'g');
    A.g.setAttribute('class', 'tier');
    A.g.setAttribute('stroke-linejoin', 'round');
    A.g.setAttribute('stroke-linecap', 'round');
    parent.appendChild(A.g);
    A.pool = [];
    return A.g;
  }
  function setA(e, k, v) { if (e['_' + k] !== v) { e['_' + k] = v; e.setAttribute(k, v); } }

  function draw(A, view) {
    const C = makeCtx(A, view);
    (A.D.kind === 'croc' ? buildCroc : buildQuad)(A, C);
    const prims = C.prims;
    if (view.ground) groundDots(A, C, view);
    if (view.mark) C.disc(v3(0, 0.3, 0), v3(A.D.kind === 'croc' ? 70 : 55, 0, 0), v3(0, 0, 32), '#6d5dfc',
      { stroke: '#6d5dfc', depth: -9e5, op: 0.28 });
    prims.sort((a, b) => a.depth - b.depth);
    if (view.skel) {
      for (const p of prims) if (p.depth > -5e5 && p.depth < 5e4) p.op = (p.op == null ? 1 : p.op) * 0.3;
      const seen = new Set();
      for (const [a, b] of C.bones) {
        prims.push({ d: 'M' + f1(a.x) + ' ' + f1(a.y) + 'L' + f1(b.x) + ' ' + f1(b.y), fill: 'none', stroke: '#e11d48', sw: 2.2, line: true, depth: 2e5 });
        for (const q of [a, b]) {
          const k = Math.round(q.x) + ',' + Math.round(q.y);
          if (seen.has(k)) continue;
          seen.add(k);
          prims.push({ d: circleD(q.x, q.y, 2.3), fill: '#ffffff', stroke: '#e11d48', sw: 1.2, depth: 2e5 + 1 });
        }
      }
    }
    const pool = A.pool, g = A.g;
    for (let i = 0; i < prims.length; i++) {
      let e = pool[i];
      if (!e) { e = document.createElementNS(NS, 'path'); g.appendChild(e); pool.push(e); }
      const p = prims[i];
      setA(e, 'd', p.d);
      setA(e, 'fill', p.fill);
      setA(e, 'stroke', p.stroke);
      setA(e, 'stroke-width', String(f1(p.sw * 10) / 10));
      setA(e, 'opacity', p.op == null ? '1' : String(Math.round(clamp(p.op, 0, 1) * 100) / 100));
      setA(e, 'display', 'inline');
    }
    for (let i = prims.length; i < pool.length; i++) setA(pool[i], 'display', 'none');
  }

  // Laufband im Kasten: Punkte am Boden ziehen vorbei
  function groundDots(A, C, view) {
    const gap = 46, ox = view.ox, oy = view.oy;
    const dx = Math.cos(A.h) * A.road, dz = Math.sin(A.h) * A.road;
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) {
      const X = i * gap - (((dx % gap) + gap) % gap), Z = j * gap - (((dz % gap) + gap) % gap);
      if (Math.abs(X) > 150 || Math.abs(Z) > 110) continue;
      const x = ox + X, y = oy + Z * SP;
      C.prims.push({ d: 'M' + f1(x - 4) + ' ' + f1(y) + 'h8', fill: 'none', stroke: '#8a8f99', sw: 1.6, line: true, depth: -1e6 - 1, op: 0.45 });
    }
  }

  window.SavanneTiere = { SPECIES, ORDER, ROLES, PITCH, create, update, draw, mount };
})();
