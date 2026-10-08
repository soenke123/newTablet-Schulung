/* ══════════════════════════════════════════════════════════════
   Savanne — Die Tiere (tiere.js)
   ══════════════════════════════════════════════════════════════

   Löwen, Elefanten, Zebras, Gnus und Krokodile, jeweils Papa,
   Mama und Kind. Fassung 1 (Oktober 2026), gebaut für den
   Showroom showroom-tiere.html und für das neue Projekt.

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
     Zeichenkontext: sammelt Formen, projiziert, sortiert nach Tiefe
     ══════════════════════════════════════════════════════════════ */
  function makeCtx(A, view) {
    const ch = Math.cos(A.h), sh = Math.sin(A.h), S = view.S, ox = view.ox, oy = view.oy;
    const SW = 1.5 * (0.6 + 0.4 * Math.min(1, S));
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
      return far > 0.02 ? shade(fill, 1 - 0.17 * far) : fill;
    }
    function push(p, o) {
      if (o) { if (o.op != null) p.op = o.op; if (o.tag) p.tag = o.tag; }
      prims.push(p); return p;
    }
    const C = {
      S, SW, pr, facing, prims, bones,
      depth: p => pr(p).d,
      cap(a, b, ra, rb, fill, o) {
        const A2 = pr(a), B2 = pr(b), f = tone(fill, o);
        return push({ d: capD(A2, B2, ra * S, rb * S), fill: f, stroke: (o && o.stroke) || shade(f, 0.5),
          sw: o && o.sw != null ? o.sw : SW, depth: (o && o.depth != null) ? o.depth : (A2.d + B2.d) / 2 + ((o && o.bias) || 0) }, o);
      },
      ball(c, r, fill, o) {
        const P = pr(c), f = tone(fill, o);
        return push({ d: circleD(P.x, P.y, r * S), fill: f, stroke: (o && o.stroke) || shade(f, 0.5),
          sw: o && o.sw != null ? o.sw : SW, depth: (o && o.depth != null) ? o.depth : P.d + ((o && o.bias) || 0) }, o);
      },
      fluff(c, r, n, fill, o) {
        const P = pr(c), f = tone(fill, o);
        return push({ d: fluffD(P.x, P.y, r * S, n, (o && o.rot) || 0), fill: f, stroke: (o && o.stroke) || shade(f, 0.55),
          sw: SW, depth: (o && o.depth != null) ? o.depth : P.d + ((o && o.bias) || 0) }, o);
      },
      // Umriss aus mehreren Kapseln ohne innere Nähte: erst Rand, dann Füllung
      blob(parts, fill, o) {
        let d = '', dep = 0, n = 0;
        const f = tone(fill, o);
        for (const [a, b, ra, rb] of parts) {
          const A2 = pr(a), B2 = pr(b);
          d += capD(A2, B2, ra * S, rb * S);
          dep += A2.d + B2.d; n += 2;
        }
        dep = dep / n + ((o && o.bias) || 0);
        push({ d, fill: shade(f, 0.5), stroke: shade(f, 0.5), sw: SW * 2, depth: dep }, o);
        return push({ d, fill: f, stroke: 'none', sw: 0, depth: dep + 0.001 }, o);
      },
      // Scheibe: Mittelpunkt + zwei Halbachsen im Raum (Ohr, Schatten)
      disc(c, u, v, fill, o) {
        let d = '';
        const N = 28;
        for (let i = 0; i < N; i++) {
          const a = i / N * TAU, P = pr(add(c, add(mul(u, Math.cos(a)), mul(v, Math.sin(a)))));
          d += (i ? 'L' : 'M') + f1(P.x) + ' ' + f1(P.y);
        }
        const f = tone(fill, o);
        return push({ d: d + 'Z', fill: f, stroke: o && o.stroke === 'none' ? 'none' : ((o && o.stroke) || shade(f, 0.55)),
          sw: SW, depth: (o && o.depth != null) ? o.depth : pr(c).d + ((o && o.bias) || 0) }, o);
      },
      line(pts, color, w, o) {
        let d = '', dep = 0;
        pts.forEach((p, i) => { const P = pr(p); d += (i ? 'L' : 'M') + f1(P.x) + ' ' + f1(P.y); dep += P.d; });
        return push({ d, fill: 'none', stroke: color, sw: w * S, line: true,
          depth: (o && o.depth != null) ? o.depth : dep / pts.length + ((o && o.bias) || 0) }, o);
      },
      // Ring um eine Achse (Streifen, Falten): nur das sichtbare Stück
      ring(c, axis, upHint, r, th0, th1, color, w, depth, o) {
        const ax = norm(axis), up = norm(sub(upHint, mul(ax, dot(upHint, ax)))), sd = cross(ax, up);
        const steps = 12;
        let run = [];
        const flush = () => { if (run.length > 1) C.line(run, color, w, Object.assign({ depth }, o)); run = []; };
        for (let i = 0; i <= steps; i++) {
          const th = (th0 + (th1 - th0) * i / steps) * DEG;
          const n = add(mul(up, Math.cos(th)), mul(sd, Math.sin(th)));
          if (facing(n) > -0.05) run.push(add(c, mul(n, r))); else flush();
        }
        flush();
      },
      // kleine Punkte auf einer Oberfläche (Flecken, Augen, Nägel)
      spot(c, n, r, fill, o) {
        if (facing(n) < 0.08) return null;
        return C.ball(c, r, fill, Object.assign({ stroke: 'none', sw: 0 }, o));
      },
      bone(a, b) { if (view.skel) bones.push([pr(a), pr(b)]); },
      // Schatten am Boden
      shadow(a, b, r) {
        const m = lerpV(a, b, 0.5), ax = v3(b.x - a.x, 0, b.z - a.z), half = len(ax) / 2;
        const fwd = half > 0.1 ? norm(ax) : v3(1, 0, 0), side = v3(-fwd.z, 0, fwd.x);
        return C.disc(v3(m.x, 0.5, m.z), mul(fwd, half + r * 1.05), mul(side, r * 1.05), '#000000',
          { stroke: 'none', depth: -1e6, op: 0.16 });
      }
    };
    return C;
  }

  /* ── Augen, Zzz, Futter ────────────────────────────────────── */
  function eye(C, H, p, r, closed, o) {
    const n = norm(sub(p, H));
    if (C.facing(n) < 0.12) return;
    const dep = C.depth(p) + 0.6;
    if (closed) {
      const t = (o && o.lid) || v3(0, 0, 0);
      C.line([add(p, mul(t, -r)), add(p, v3(0, -r * 0.35, 0)), add(p, mul(t, r))], '#1d1510', 1.1, { depth: dep });
      return;
    }
    if (o && o.iris) {
      C.ball(p, r, o.iris, { stroke: '#1d1510', sw: 0.8, depth: dep });
      C.line([add(p, v3(0, r * 0.75, 0)), add(p, v3(0, -r * 0.75, 0))], '#111', r * 0.45, { depth: dep + 0.01 });
      return;
    }
    C.prims.push({ d: circleD(C.pr(p).x, C.pr(p).y, r * C.S), fill: '#1d1510', stroke: 'none', sw: 0, depth: dep });
    const hl = C.pr(add(p, v3(r * 0.25, r * 0.35, 0)));
    C.prims.push({ d: circleD(hl.x, hl.y, r * 0.38 * C.S), fill: '#ffffff', stroke: 'none', sw: 0, depth: dep + 0.01 });
  }
  function zzz(A, C, top) {
    if (A.w.sleep < 0.6) return;
    const P = C.pr(top);
    for (let i = 0; i < 3; i++) {
      const u = ((A.t * 0.35 + i / 3) % 1), s = (4 + u * 6) * Math.max(0.7, C.S), x = P.x + 8 * C.S + u * 18 * C.S + Math.sin(u * 6) * 3, y = P.y - 6 - u * 34 * Math.max(0.6, C.S);
      C.prims.push({ d: 'M' + f1(x) + ' ' + f1(y) + 'h' + f1(s) + 'l' + f1(-s) + ' ' + f1(s) + 'h' + f1(s),
        fill: 'none', stroke: '#6d5dfc', sw: 1.6, line: true, depth: 1e5, op: (1 - u) * (A.w.sleep - 0.6) * 2.5 });
    }
  }
  function grass(C, base, op, t, k) {
    k = k || 1;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05, sw = Math.sin(t * 2 + i) * 1.5;
      const b = add(base, v3(Math.cos(a) * 3 * k, 0, Math.sin(a) * 3 * k));
      C.cap(b, add(b, v3(Math.cos(a) * 3 * k + sw, (9 + (i % 3) * 3) * k, Math.sin(a) * 2 * k)), 1.4 * k, 0.4 * k,
        i % 2 ? '#6aa33d' : '#4f8a2e', { op, sw: 0.6 });
    }
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
    const body = C.blob([[hip, mid, hr0, br], [mid, chest, br, cr], [N0, N1, nk.r1, (nk.r1 + nk.r2) / 2], [N1, H, (nk.r1 + nk.r2) / 2, nk.r2]], col.body);
    C.bone(hip, mid); C.bone(mid, chest); C.bone(chest, N0); C.bone(N0, N1); C.bone(N1, H);
    C.shadow(hip, chest, Math.max(cr, hr0) * (1 + lie * 0.3));

    const info = { H, f, u, r, F, hr, yaw, hp, N0, N1, chest, hip, mid, cr, br, hr0, body, lie, graze,
      closed: w.sleep > 0.5 || A.blinking, neckR: nk.r1 };

    /* Beine */
    const legDepth = [];
    LEGS.forEach((L, i) => {
      const P = L.front ? fl : hl, base = L.front ? chest : hip, bx = L.front ? D.chest.x : D.hip.x;
      const J = v3(base.x + P.jx, base.y + P.jy, L.side * P.w);
      const fo = footOffset(g, ph, i);
      let Fp = v3(bx + P.jx + P.home + fo.x + (L.front ? graze * 4 : 0), P.fr + fo.y, L.side * P.w);
      let hint = v3(P.bend, 0, 0);
      if (lie > 0) {
        const sphinx = (R.sleepFront || D.sleepFront) === 'sphinx';
        let Ft, Hn;
        if (L.front) {
          Ft = sphinx ? v3(J.x + (P.l1 + P.l2) * 0.78, P.fr, L.side * P.w * 0.85) : v3(J.x - P.l1 * 0.1, P.fr, L.side * P.w * 0.95);
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
      const lp = C.blob([[J, K, P.r1, P.r2], [K, Fp, P.r2, P.r3]], col.leg || col.body, { side: L.side });
      C.bone(J, K); C.bone(K, Fp);
      legDepth[i] = lp.depth;
      const fwd = v3(1, 0, 0);
      if (P.foot === 'hoof') {
        C.cap(add(Fp, v3(-0.8, -0.4, 0)), add(Fp, v3(2.4, -P.fr * 0.35, 0)), P.fr, P.fr * 0.82, col.hoof, { side: L.side, bias: 0.05 });
      } else if (P.foot === 'paw') {
        C.ball(add(Fp, v3(P.fr * 0.35, -0.5, 0)), P.fr, col.paw || col.body, { side: L.side, bias: 0.05 });
      } else {
        const pad = C.ball(Fp, P.fr, col.foot || col.body, { side: L.side, bias: 0.05 });
        for (let k = -1; k <= 1; k++) C.spot(add(Fp, v3(P.fr * 0.9, -P.fr * 0.35, k * P.fr * 0.5)), norm(v3(1, -0.1, k * 0.5)), P.fr * 0.22, col.nail, { depth: pad.depth + 0.01, bias: 0.4 });
      }
      if (D.legRings) D.legRings(A, C, J, K, Fp, P, lp.depth, fwd);
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
      C.cap(T, end, 2.6 * tk, 3.4 * tk, col.tuft || col.dark, { bias: 0.05 });
    }
    if (tl.ball) C.fluff(T, 4.6 * tk, 7, col.tuft, { bias: 0.05 });

    /* Kopf (je Art) und Extras */
    D.drawHead(A, C, info);
    if (D.drawBody) D.drawBody(A, C, info, legDepth);
    zzz(A, C, F(0, hr * 1.2, 0));
  }

  /* ── Löwe ──────────────────────────────────────────────────── */
  function lionHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    const chew = (A.D.eatLie ? w.eat : 0) * (0.5 + 0.5 * Math.sin(A.t * 9));
    // Reihenfolge am Kopf fest: Mähne < Schädel < Schnauze — von hinten umgekehrt
    const base = C.depth(H), toCam = C.facing(v3(f.x, 0, f.z)) * hr;
    const dFace = base + toCam + 0.3, dMane = base - toCam * 0.8 - 0.6;
    if (R.mane) {
      C.fluff(lerpV(I.N0, I.N1, 0.6), I.neckR * 1.35, 11, col.mane, { depth: dMane - 0.3, rot: 0.3 });
      C.fluff(F(-hr * 0.35, hr * 0.05, 0), hr * 1.72, 15, col.mane, { depth: dMane });
      C.fluff(F(-hr * 0.15, hr * 0.0, 0), hr * 1.38, 13, shade(col.mane, 1.18), { depth: dMane + 0.2, rot: 0.2 });
    }
    const ek = R.ear || 1;
    for (const s of [-1, 1]) C.ball(F(-hr * 0.22, hr * 0.78, s * hr * 0.6), hr * 0.3 * ek, col.body, R.mane ? { depth: dMane + 0.4 + s * 0.01, side: s } : { bias: 0.1, side: s });
    C.ball(H, hr, col.body);
    C.bone(H, F(hr * 1.2, -hr * 0.3, 0));
    const hinge = F(hr * 0.3, -hr * 0.55, 0), ja = 0.12 + chew * 0.35;
    const jd = add(mul(f, Math.cos(ja)), mul(u, -Math.sin(ja)));
    C.cap(hinge, add(hinge, mul(jd, hr * 0.78)), hr * 0.36, hr * 0.3, col.light, { depth: dFace - 0.05 });
    C.cap(F(hr * 0.35, -hr * 0.28, 0), F(hr * 1.02, -hr * 0.36, 0), hr * 0.56, hr * 0.48, col.light, { depth: dFace });
    C.spot(F(hr * 1.42, -hr * 0.16, 0), f, hr * 0.2, col.nose, { depth: dFace + 0.1, stroke: shade(col.nose, 0.6), sw: 0.8 });
    C.spot(F(hr * 1.3, -hr * 0.12, 0), norm(add(f, mul(u, 0.4))), hr * 0.22, col.nose, { depth: dFace + 0.1 });
    for (const s of [-1, 1]) eye(C, H, F(hr * 0.58, hr * 0.26, s * hr * 0.52), hr * 0.13 * (R.head > 1 ? 1.25 : 1), I.closed, { lid: f });
    if (R.spots) {
      // Flecken des Jungen auf Rumpf und Beinen
      const pts = [[0.2, 40], [0.35, 70], [0.5, 35], [0.62, 75], [0.78, 45], [0.3, 105], [0.7, 110]];
      for (const s of [-1, 1]) for (const [tt, th] of pts) {
        const c0 = lerpV(I.hip, I.chest, tt), rr = lerp(I.hr0, I.cr, tt);
        const n = v3(0, Math.cos(th * DEG), s * Math.sin(th * DEG));
        C.spot(add(c0, mul(n, rr * 0.98)), n, 2.4, shade(col.body, 0.82), { depth: I.body.depth + 0.02 });
      }
    }
    if (A.food === 'meat' && w.eat > 0.02) {
      const base = add(v3(H.x, 3, H.z), mul(v3(f.x, 0, f.z), hr * 1.1));
      C.cap(base, add(base, v3(-8, 0.5, 6)), 4.2, 3.6, '#b3473a', { op: w.eat, bias: 0.1 });
      C.cap(add(base, v3(3, 0, -4)), add(base, v3(-11, 0.5, 9)), 1.4, 1.4, '#efe6d2', { op: w.eat, bias: 0.05 });
      C.ball(add(base, v3(3.5, 0, -4.5)), 2, '#efe6d2', { op: w.eat, bias: 0.08 });
      C.ball(add(base, v3(-11.5, 0.5, 9.5)), 2, '#efe6d2', { op: w.eat, bias: 0.08 });
    }
  }

  /* ── Zebra ─────────────────────────────────────────────────── */
  function zebraLeg(A, C, J, K, Fp, P, dep) {
    const col = A.col.stripe;
    const segs = [[J, K, P.r1, P.r2, 3], [K, Fp, P.r2, P.r3, 4]];
    for (const [a, b, ra, rb, n] of segs) {
      const ax = sub(b, a);
      for (let k = 0; k < n; k++) {
        const tt = (k + 0.6) / (n + 0.4);
        C.ring(lerpV(a, b, tt), ax, v3(1, 0, 0), lerp(ra, rb, tt) * 1.01, -180, 180, col, 1.7, dep + 0.01);
      }
    }
  }
  function zebraBody(A, C, I) {
    const col = A.col.stripe, dep = I.body.depth + 0.02;
    const ax = sub(I.chest, I.hip);
    const N = 11;
    for (let k = 0; k < N; k++) {
      const tt = 0.04 + k * 0.92 / (N - 1);
      const c0 = tt < 0.5 ? lerpV(I.hip, I.mid, tt * 2) : lerpV(I.mid, I.chest, tt * 2 - 1);
      const rr = (tt < 0.5 ? lerp(I.hr0, I.br, tt * 2) : lerp(I.br, I.cr, tt * 2 - 1)) * 1.01;
      const tilt = tt < 0.35 ? (0.35 - tt) * 1.5 : 0;
      const axk = norm(add(norm(ax), v3(0, -tilt, 0)));
      C.ring(c0, axk, v3(0, 1, 0), rr, -112, 112, col, k % 2 ? 2.4 : 3.4, dep);
    }
    // Hals
    const segs = [[I.N0, I.N1, I.neckR, (I.neckR + A.D.neck.r2) / 2], [I.N1, I.H, (I.neckR + A.D.neck.r2) / 2, A.D.neck.r2]];
    for (const [a, b, ra, rb] of segs) for (let k = 0; k < 3; k++) {
      const tt = 0.2 + k * 0.3;
      C.ring(lerpV(a, b, tt), sub(b, a), v3(0, 1, 0), lerp(ra, rb, tt) * 1.01, -165, 165, col, 2.6, dep);
    }
  }
  function mane(A, C, I, color, alt, height) {
    const nr2 = A.D.neck.r2, pts = [];
    const r = I.r;
    for (let k = 0; k <= 6; k++) {
      const tt = k / 6;
      const c0 = tt < 0.5 ? lerpV(I.N0, I.N1, tt * 2) : lerpV(I.N1, I.H, tt * 2 - 1);
      const dir = norm(tt < 0.5 ? sub(I.N1, I.N0) : sub(I.H, I.N1));
      const upN = norm(cross(r, dir));
      const rr = lerp(I.neckR, nr2, tt);
      pts.push(add(c0, mul(upN, rr * 0.9 + height * 0.5)));
    }
    pts[0] = lerpV(pts[0], pts[1], 0.4);
    for (let k = 0; k < pts.length - 1; k++) {
      C.cap(pts[k], pts[k + 1], height * 0.55, height * 0.55, alt && k % 2 ? alt : color, { bias: 0.4 });
    }
    return pts;
  }
  function zebraHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    const chew = I.graze * (0.5 + 0.5 * Math.sin(A.t * 8));
    mane(A, C, I, col.stripe, col.body, R.foal ? 5.5 : 4.6);
    for (const s of [-1, 1]) {
      const e0 = F(-hr * 0.25, hr * 0.75, s * hr * 0.45), e1 = F(-hr * 0.55, hr * 1.95, s * hr * 0.95);
      C.cap(e0, e1, hr * 0.38, hr * 0.12, col.body, { side: s, bias: 0.1 });
      C.ring(lerpV(e0, e1, 0.55), sub(e1, e0), f, hr * 0.22, -60, 60, col.stripe, 1.2, C.depth(e1) + 0.05);
    }
    C.ball(H, hr, col.body);
    const m0 = F(hr * 0.4, -hr * 0.2, 0), m1 = F(hr * 2.35, -hr * 0.35, 0);
    const mz = C.cap(m0, m1, hr * 0.78, hr * 0.62, col.body, { bias: 0.3 });
    C.bone(H, m1);
    for (let k = 0; k < 3; k++) C.ring(lerpV(m0, m1, 0.15 + k * 0.22), sub(m1, m0), u, lerp(hr * 0.78, hr * 0.62, 0.15 + k * 0.22) * 1.02, -80, 80, col.stripe, 1.5, mz.depth + 0.02);
    C.ring(H, u, f, hr * 1.0, -70, 70, col.stripe, 1.6, C.depth(H) + 0.05);
    const ja = 0.08 + chew * 0.2, jd = add(mul(f, Math.cos(ja)), mul(u, -Math.sin(ja))), jh = F(hr * 1.2, -hr * 0.6, 0);
    C.cap(jh, add(jh, mul(jd, hr * 1.0)), hr * 0.4, hr * 0.42, col.muzzle, { bias: 0.25 });
    C.ball(F(hr * 2.35, -hr * 0.4, 0), hr * 0.66, col.muzzle, { bias: 0.5 });
    for (const s of [-1, 1]) C.spot(F(hr * 2.75, -hr * 0.2, s * hr * 0.3), norm(add(f, mul(r, s * 0.5))), hr * 0.12, '#000000', { bias: 0.9 });
    for (const s of [-1, 1]) eye(C, H, F(hr * 0.3, hr * 0.35, s * hr * 0.82), hr * 0.17, I.closed, { lid: f });
    if (w.eat > 0.02) grass(C, v3(m1.x + f.x * 4, 0, m1.z + f.z * 4), w.eat, A.t, 1);
  }

  /* ── Gnu ───────────────────────────────────────────────────── */
  function gnuBody(A, C, I) {
    if (!A.col.stripe) return;
    const dep = I.body.depth + 0.02;
    for (let k = 0; k < 6; k++) {
      const tt = 0.5 + k * 0.09;
      const c0 = lerpV(I.mid, I.chest, (tt - 0.5) * 2), rr = lerp(I.br, I.cr, (tt - 0.5) * 2) * 1.01;
      C.ring(c0, sub(I.chest, I.hip), v3(0, 1, 0), rr, -75, 75, A.col.stripe, 2, dep, { op: 0.75 });
    }
  }
  function gnuHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w;
    const chew = I.graze * (0.5 + 0.5 * Math.sin(A.t * 8));
    mane(A, C, I, col.mane, null, R.calf ? 4.5 : 6);
    // Bart unter dem Hals
    if (R.beard) {
      for (let k = 0; k < 5; k++) {
        const tt = 0.25 + k * 0.17;
        const c0 = tt < 0.5 ? lerpV(I.N0, I.N1, tt * 2) : lerpV(I.N1, I.H, tt * 2 - 1);
        const dir = norm(tt < 0.5 ? sub(I.N1, I.N0) : sub(I.H, I.N1));
        const dn = mul(norm(cross(r, dir)), -1);
        const top = add(c0, mul(dn, lerp(I.neckR, A.D.neck.r2, tt) * 0.8));
        const sw = Math.sin(A.t * 2 + k) * 1.2;
        C.cap(top, add(top, v3(sw, -(8 + k % 2 * 3) * R.beard, 0)), 2.6, 1.0, col.mane, { bias: 0.3 });
      }
    }
    for (const s of [-1, 1]) {
      const e0 = F(-hr * 0.2, hr * 0.5, s * hr * 0.7), e1 = F(-hr * 0.5, hr * 0.7, s * hr * 1.65);
      C.cap(e0, e1, hr * 0.3, hr * 0.12, col.body, { side: s, bias: 0.1 });
    }
    C.ball(H, hr, col.body);
    const m0 = F(hr * 0.4, -hr * 0.1, 0), m1 = F(hr * 2.3, -hr * 0.25, 0);
    C.cap(m0, m1, hr * 0.8, hr * 0.78, col.muzzle, { bias: 0.3 });
    C.bone(H, m1);
    const ja = 0.06 + chew * 0.2, jd = add(mul(f, Math.cos(ja)), mul(u, -Math.sin(ja))), jh = F(hr * 1.1, -hr * 0.55, 0);
    C.cap(jh, add(jh, mul(jd, hr * 1.1)), hr * 0.42, hr * 0.45, shade(col.muzzle, 0.9), { bias: 0.25 });
    for (const s of [-1, 1]) C.spot(F(hr * 2.85, -hr * 0.1, s * hr * 0.4), norm(add(f, mul(r, s * 0.5))), hr * 0.14, '#000000', { bias: 0.9 });
    if (R.beard) C.cap(F(hr * 1.4, -hr * 0.9, 0), F(hr * 1.3, -hr * 1.9 * R.beard, 0), hr * 0.3, hr * 0.12, col.mane, { bias: 0.2 });
    // Hörner: erst nach außen, dann nach unten, dann hoch
    if (R.horn) {
      const hk = R.horn;
      for (const s of [-1, 1]) {
        const p0 = F(-hr * 0.1, hr * 0.75, s * hr * 0.45);
        const p1 = add(p0, add(mul(r, s * hr * 1.0 * hk), mul(u, hr * 0.25 * hk)));
        const p2 = add(p1, add(mul(r, s * hr * 0.55 * hk), add(mul(u, -hr * 0.35 * hk), mul(f, -hr * 0.2 * hk))));
        const p3 = add(p2, add(mul(r, s * hr * 0.1 * hk), add(mul(u, hr * 0.85 * hk), mul(f, hr * 0.05 * hk))));
        C.blob([[p0, p1, 3.2 * Math.max(0.5, hk), 2.6 * hk], [p1, p2, 2.6 * hk, 2 * hk], [p2, p3, 2 * hk, 0.7]], col.horn, { side: s, bias: 0.4 });
      }
    }
    for (const s of [-1, 1]) eye(C, H, F(hr * 0.35, hr * 0.3, s * hr * 0.82), hr * 0.16, I.closed, { lid: f });
    if (w.eat > 0.02) grass(C, v3(m1.x + f.x * 4, 0, m1.z + f.z * 4), w.eat, A.t, 1);
  }

  /* ── Elefant ───────────────────────────────────────────────── */
  function eleLeg(A, C, J, K, Fp, P, dep) {
    for (let k = 0; k < 3; k++) {
      const tt = 0.45 + k * 0.15;
      C.ring(lerpV(K, Fp, tt), sub(Fp, K), v3(1, 0, 0), lerp(P.r2, P.r3, tt) * 1.01, -150, 150, shade(A.col.body, 0.72), 0.8, dep + 0.01, { op: 0.6 });
    }
  }
  function eleHead(A, C, I) {
    const { H, F, hr, f, u, r } = I, col = A.col, R = A.R, w = A.w, t = A.t;
    const ek = R.ear || 1;
    // Ohren fächeln; beim Rennen weit abgespreizt, im Schlaf angelegt
    for (const s of [-1, 1]) {
      const flap = lerp(lerp(0.32 + 0.22 * Math.sin(t * 1.5 + s * 0.8), 1.0, A.w.run), 0.05, A.w.sleep);
      const attach = F(-hr * 0.1, hr * 0.15, s * hr * 0.72);
      const back = mul(f, -1), out = mul(r, s);
      const vd = norm(add(mul(back, Math.cos(flap)), mul(out, Math.sin(flap))));
      const eu = mul(u, hr * 1.02 * ek), ev = mul(vd, hr * 0.78 * ek);
      const c0 = add(add(attach, mul(ev, 0.92)), mul(u, -hr * 0.12 * ek));
      const ear = C.disc(c0, eu, ev, col.ear, { side: s });
      const nrm = norm(cross(ev, eu));
      const inner = s > 0 ? nrm : mul(nrm, -1);
      if (C.facing(mul(inner, -1)) > 0) {
        C.disc(add(c0, mul(ev, -0.06)), mul(eu, 0.8), mul(ev, 0.78), col.earIn, { stroke: 'none', depth: ear.depth + 0.01, side: s });
      }
      C.bone(attach, add(attach, mul(ev, 1.8)));
    }
    C.ball(H, hr, col.body);
    // Rüssel: Kette aus 8 Gliedern
    const tr = A.D.trunk, n = tr.n, seg = tr.len * R.head / n;
    const e = (t * 0.32) % 1;
    const curlW = e < 0.42 ? 0 : e < 0.66 ? smooth((e - 0.42) / 0.24) : e < 0.84 ? 1 : 1 - smooth((e - 0.84) / 0.16);
    const eatW = A.D.eatTrunk ? w.eat : 0;
    let th = lerp(-74 + 6 * Math.sin(t * 0.7) * (1 - w.walk) + 6 * w.walk * Math.sin(TAU * A.phase), lerp(-80, -104, curlW), eatW);
    th = lerp(th, -86, w.sleep);
    let p = F(hr * 0.78, -hr * 0.22, 0);
    const root = p, tparts = [];
    for (let k = 0; k < n; k++) {
      const idle = 3 + 5 * Math.sin(t * 1.1 - k * 0.5) * (1 - w.sleep) + (k > n - 3 ? 10 : 0);
      const kap = lerp(idle, lerp(1, k < 2 ? 10 : 36, curlW), eatW);
      th += kap;
      const lat = 0.12 * Math.sin(t * 1.2 - k * 0.35) * (1 - w.sleep);
      const d = add(add(mul(f, Math.cos(th * DEG) * Math.cos(lat)), mul(u, Math.sin(th * DEG))), mul(r, Math.cos(th * DEG) * Math.sin(lat)));
      const r1 = lerp(tr.r1, tr.r2, k / n) * R.head, r2 = lerp(tr.r1, tr.r2, (k + 1) / n) * R.head;
      const nx = ground(add(p, mul(d, seg)), r2);
      tparts.push([p, nx, r1, r2]);
      C.bone(p, nx);
      p = nx;
    }
    const tb = C.blob(tparts, col.body, { bias: 0.4 });
    for (const [a, b, ra] of tparts.slice(1)) C.ring(lerpV(a, b, 0.5), sub(b, a), f, ra * 1.01, -60, 60, shade(col.body, 0.72), 0.7, tb.depth + 0.01, { op: 0.7 });
    C.ball(p, tparts[n - 1][3] * 1.12, shade(col.body, 0.9), { bias: 0.45 });
    // Unterlippe
    const lip = 0.15 + eatW * curlW * 0.25 * (0.5 + 0.5 * Math.sin(t * 8));
    const lh = F(hr * 0.55, -hr * 0.55, 0), ld = add(mul(f, Math.cos(lip)), mul(u, -Math.sin(lip)));
    C.cap(lh, add(lh, mul(ld, hr * 0.32)), hr * 0.2, hr * 0.15, shade(col.body, 0.88), { bias: 0.3 });
    // Stoßzähne
    if (R.tusk) {
      const L = 40 * R.tusk;
      for (const s of [-1, 1]) {
        const p0 = F(hr * 0.62, -hr * 0.42, s * hr * 0.36);
        const p1 = add(p0, add(add(mul(f, L * 0.45), mul(u, -L * 0.42)), mul(r, s * L * 0.06)));
        const p2 = add(p1, add(add(mul(f, L * 0.5), mul(u, L * 0.08)), mul(r, s * L * 0.02)));
        C.blob([[p0, p1, 4.6 * Math.sqrt(R.tusk), 3.6 * Math.sqrt(R.tusk)], [p1, p2, 3.6 * Math.sqrt(R.tusk), 1.2]], col.tusk, { bias: 0.5, side: s });
      }
    }
    for (const s of [-1, 1]) eye(C, H, F(hr * 0.55, hr * 0.12, s * hr * 0.74), hr * 0.085, I.closed, { lid: f });
    if (R.hair) for (let k = -2; k <= 2; k++) {
      const b0 = F(-hr * 0.1 + k * 2, hr * 0.97, k * 2.5);
      C.line([b0, add(b0, add(mul(u, 4), mul(f, k * 0.8 - 1)))], '#4d5257', 0.8, { bias: 0.6 });
    }
    // Futter: Gras am Boden, später im Rüssel
    if (eatW > 0.02) {
      const spot = v3(H.x + hr * 1.6, 0, H.z);
      grass(C, spot, eatW * (1 - curlW * 0.6), t, 1.3);
      if (curlW > 0.15) C.fluff(p, 4.5 * R.head + 1, 7, '#5d9a35', { op: eatW * curlW, bias: 0.5 });
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
    // Wirbel
    const nodes = sp.map(([x, rr], i) => {
      const tail = Math.max(0, i - 3);
      let y = i <= 3 ? high + hop + (i < 2 ? rock : -rock) : lerp(high, rr * 0.95, Math.min(1, tail / 5));
      const lat = und * Math.sin(TAU * ph - i * 0.65) * (0.2 + i * 0.12)
        + (1 - m) * (tail > 0 ? 2.2 * Math.sin(t * 0.9 - i * 0.5) * tail * 0.45 * (1 - w.sleep * 0.7) : 0);
      const r = rr + (i >= 1 && i <= 3 ? breathe : 0);
      return { p: v3(x, Math.max(y, r * 0.9), lat), r };
    });
    const parts = [];
    for (let i = 0; i < n - 1; i++) { parts.push([nodes[i].p, nodes[i + 1].p, nodes[i].r, nodes[i + 1].r]); C.bone(nodes[i].p, nodes[i + 1].p); }
    const body = C.blob(parts, col.body);
    C.shadow(nodes[0].p, nodes[4].p, 14);
    // Bänder (Jungtier) und Panzerplatten
    const up = v3(0, 1, 0);
    for (let i = 0; i < n - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (R.bands && i >= 1) C.ring(lerpV(a.p, b.p, 0.5), sub(b.p, a.p), up, lerp(a.r, b.r, 0.5) * 1.01, -85, 85, col.band, 2.4, body.depth + 0.01);
      for (const tt of [0.25, 0.75]) {
        const c0 = lerpV(a.p, b.p, tt), rr = lerp(a.r, b.r, tt);
        if (i < 4) for (const s of [-1, 1]) C.spot(add(c0, v3(0, rr * 0.86, s * rr * 0.42)), norm(v3(0, 0.86, s * 0.42)), Math.max(1.4, rr * 0.16), col.scute, { depth: body.depth + 0.02 });
        else C.spot(add(c0, v3(0, rr * 0.92, 0)), up, Math.max(1.1, rr * 0.24), col.scute, { depth: body.depth + 0.02 });
      }
    }
    // Beine
    const legs = [[1, true], [3, false]];
    let li = 0;
    for (const [ni, front] of legs) for (const side of [-1, 1]) {
      const i = li++;
      const nd = nodes[ni];
      const J = add(nd.p, v3(front ? 2 : -2, -nd.r * 0.3, side * nd.r * 0.72));
      const L = D.legs, l1 = front ? L.l1 : L.l1 * 1.15, l2 = front ? L.l2 : L.l2 * 1.1;
      const fo = footOffset(g, ph, LEGS.findIndex(q => q.front === front && q.side === side));
      const bx = sp[ni][0] + (front ? 6 : -1);
      let Fp = v3(bx + fo.x, L.fr + fo.y, side * (sp[ni][1] * 0.72 + L.spread));
      const lieF = v3(bx + (front ? 8 : -6), L.fr, side * (sp[ni][1] * 0.72 + L.spread + 4));
      Fp = lerpV(Fp, lieF, w.sleep);
      const leg = ik(J, Fp, l1, l2, norm(v3(0, 1, side * 0.5)));
      const K = leg.K; Fp = leg.F;
      const lp = C.blob([[J, K, L.r1, L.r2], [K, Fp, L.r2, L.r3]], col.body, { side });
      C.bone(J, K); C.bone(K, Fp);
      const toe = add(Fp, v3(front ? 5 : 4, -0.5, side * 2));
      C.cap(Fp, toe, L.r3, L.r3 * 0.7, shade(col.body, 0.92), { side, bias: 0.05 });
      if (R.bands) C.ring(lerpV(J, K, 0.5), sub(K, J), v3(0, 1, 0), lerp(L.r1, L.r2, 0.5), -90, 90, col.band, 1.6, lp.depth + 0.01);
    }
    // Kopf
    const N = nodes[0].p;
    const hk = R.head;
    const e = (t * 0.42) % 1;
    const eatW = w.eat;
    const openE = e < 0.62 ? smooth(e / 0.62) : e < 0.68 ? 1 - smooth((e - 0.62) / 0.06) : 0;
    const shake = e >= 0.68 && e < 0.95 ? Math.sin((e - 0.68) * 60) * 0.25 * (1 - (e - 0.68) / 0.27) : 0;
    let hp = lerp(4, 4 + openE * 22, eatW) * DEG;
    let jo = lerp(0.06 + 0.03 * Math.sin(t * 0.5), openE * 0.95, eatW);
    jo = lerp(jo, 0.32, w.sleep);
    const yaw = A.lookNow * 0.6 + shake * eatW;
    const H = add(N, rotY(v3(10, 1, 0), v3(0, 0, 0), yaw));
    const f = v3(Math.cos(hp) * Math.cos(yaw), Math.sin(hp), Math.cos(hp) * Math.sin(yaw));
    const r = v3(-Math.sin(yaw), 0, Math.cos(yaw)), u = cross(r, f);
    const F = (a, b, c) => v3(H.x + f.x * a + u.x * b + r.x * c, H.y + f.y * a + u.y * b + r.y * c, H.z + f.z * a + u.z * b + r.z * c);
    const L = D.head.len * hk, hr = D.head.r * hk;
    C.cap(N, H, nodes[0].r, hr, col.body);
    C.bone(N, H);
    // Unterkiefer
    const hinge = F(-1, -hr * 0.35, 0);
    const jd = add(mul(f, Math.cos(jo)), mul(u, -Math.sin(jo)));
    const jt = add(hinge, mul(jd, L * 0.95));
    const lower = C.blob([[hinge, jt, hr * 0.78, hr * 0.38]], col.jaw, { bias: -0.1 });
    C.bone(hinge, jt);
    if (jo > 0.12) {
      const ut = F(L * 0.6, -hr * 0.2, 0);
      C.cap(F(0, -hr * 0.3, 0), lerpV(ut, add(hinge, mul(jd, L * 0.6)), 0.5), hr * 0.55, hr * 0.32, col.mouth, { bias: -0.3, stroke: 'none' });
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
        const tp = add(hinge, add(mul(jd, L * (0.25 + k * 0.12)), add(mul(u, hr * 0.2), mul(r, s * hr * 0.3 * (1 - k * 0.1)))));
        C.cap(tp, add(tp, mul(u, 2.2 * hk)), 0.9 * hk, 0.3, col.teeth, { depth: lower.depth + 0.03, sw: 0.4 });
      }
    }
    // Oberkiefer: Schädel + lange Schnauze
    const sk = C.blob([[F(0, 0, 0), F(L * 0.3, -hr * 0.05, 0), hr, hr * 0.75], [F(L * 0.3, -hr * 0.05, 0), F(L, -hr * 0.2, 0), hr * 0.62, hr * 0.42]], col.body, { bias: 0.1 });
    C.bone(H, F(L, -hr * 0.2, 0));
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) {
      const tt = 0.3 + k * 0.1, rr = lerp(hr * 0.62, hr * 0.42, (tt - 0.3) / 0.7);
      const tp = F(L * tt, -hr * 0.2 - rr * 0.55, s * rr * 0.75);
      if (C.facing(mul(r, s)) > -0.2) C.cap(tp, add(tp, mul(u, -2 * hk)), 0.85 * hk, 0.3, col.teeth, { depth: sk.depth + 0.02, sw: 0.4 });
    }
    C.ball(F(L * 0.98, hr * 0.12, 0), hr * 0.3, col.body, { bias: 0.15 });
    for (const s of [-1, 1]) C.spot(F(L * 1.0, hr * 0.38, s * hr * 0.12), u, 0.9 * hk, '#151a0c', { depth: sk.depth + 0.05 });
    // Augen auf Höckern
    for (const s of [-1, 1]) {
      const bump = F(hr * 0.35, hr * 0.78, s * hr * 0.42);
      C.ball(bump, hr * 0.38, col.body, { bias: 0.25 });
      const ep = add(bump, add(mul(u, hr * 0.18), mul(r, s * hr * 0.12)));
      if (C.facing(norm(add(u, mul(r, s * 0.6)))) > 0.05) {
        if (w.sleep > 0.5 || A.blinking) C.line([add(ep, mul(f, -hr * 0.22)), add(ep, mul(f, hr * 0.22))], '#1b200f', 1.1, { depth: C.depth(bump) + 0.3 });
        else {
          C.ball(ep, hr * 0.24, col.eye, { stroke: '#1b200f', sw: 0.7, depth: C.depth(bump) + 0.3 });
          C.line([add(ep, mul(u, hr * 0.17)), add(ep, mul(u, -hr * 0.17))], '#111', hr * 0.09, { depth: C.depth(bump) + 0.31 });
        }
      }
    }
    // Fisch
    if (eatW > 0.02) {
      const inMouth = e >= 0.62;
      const fc = inMouth ? F(L * 0.55, -hr * 0.3, 0) : v3(H.x + L * 1.35, 3, H.z);
      const fd = inMouth ? r : f;
      const wig = Math.sin(t * 14) * (inMouth ? 0.6 : 0.2);
      const tailP = add(fc, add(mul(fd, -7 * hk), v3(0, 0, wig * 3)));
      C.cap(add(fc, mul(fd, 6 * hk)), tailP, 3.2 * hk, 1.4 * hk, '#8fb3c9', { op: eatW, bias: inMouth ? 0.6 : 0 });
      C.ball(add(tailP, mul(fd, -2 * hk)), 2.6 * hk, '#6f95ad', { op: eatW, bias: inMouth ? 0.55 : -0.01 });
    }
    zzz(A, C, F(hr * 0.3, hr * 1.4, 0));
  }

  /* ══════════════════════════════════════════════════════════════
     Die Arten
     ══════════════════════════════════════════════════════════════
     Maße in „Einheiten“ beim Papa; Mama und Kind skalieren mit s.
     fl / hl = Vorder- / Hinterbein: l1 Ober-, l2 Unterschenkel,
     r1…r3 Dicke oben, Knie, unten; w = halbe Spurbreite;
     jx/jy = Hüftgelenk relativ zur Rumpfmitte; bend = Knick vorn(+)/hinten(−);
     home = Fußpunkt vor(+)/hinter(−) dem Gelenk; fr = Fuß-/Hufgröße.
     gait: walkV/runV Tempo, walkF/runF Takt (Schritte je s),
     walkB/runB Anteil Bodenkontakt, liftW/liftR Fußhub.            */
  const SPECIES = {
    lion: {
      name: 'Löwen', kind: 'quad', box: '-140 -142 280 210',
      roles: {
        papa: { title: 'Löwe', s: 1, mane: 1 },
        mama: { title: 'Löwin', s: 0.88 },
        kind: { title: 'Löwenjunges', s: 0.5, head: 1.38, ear: 1.35, spots: 1, tailK: 0.8 }
      },
      col: { body: '#d9a45c', light: '#f2dcb0', mane: '#8a5426', nose: '#6b3b2e', tuft: '#5b3519' },
      chest: { x: 30, r: 23 }, hip: { x: -32, r: 19.5 }, belly: { r: 21, drop: 2 },
      fl: { l1: 25, l2: 25, r1: 10, r2: 7, r3: 6.5, w: 11, jx: 3, jy: -10, bend: 1, foot: 'paw', fr: 7.5, home: 2 },
      hl: { l1: 28, l2: 25, r1: 14, r2: 7.5, r3: 6.5, w: 11, jx: -3, jy: -7, bend: -1, foot: 'paw', fr: 7.5, home: -1 },
      neck: { bx: 10, by: 8, len: 22, a: 42, curve: -12, r1: 15, r2: 12.5, eatA: -28, sleepA: -22, runA: 12 },
      head: { r: 15.5, pitch: -8, runP: -12, eatP: -45, sleepP: -12, snout: 22 },
      tail: { n: 7, seg: 8.5, r1: 3.4, r2: 2.2, a: -72, curl: 13, sway: 0.25, run: 60, ball: 1 },
      gait: { walkV: 40, walkF: 0.9, walkB: 0.62, run: 'gallop', runV: 165, runF: 2.1, runB: 0.4, liftW: 8, liftR: 15, bob: 1.5, rock: 5, hop: 5, nod: 2 },
      eatLie: true, sleepFront: 'sphinx', food: 'meat',
      drawHead: lionHead
    },
    elephant: {
      name: 'Elefanten', kind: 'quad', box: '-170 -180 340 255',
      roles: {
        papa: { title: 'Elefantenbulle', s: 1, tusk: 1, sleepStand: 1 },
        mama: { title: 'Elefantenkuh', s: 0.84, tusk: 0.5, sleepStand: 1 },
        kind: { title: 'Elefantenkalb', s: 0.45, head: 1.18, ear: 1.08, hair: 1, sleepFront: 'sphinx' }
      },
      col: { body: '#9fa4a9', tuft: '#4a4e53', ear: '#979ca2', earIn: '#b29a9a', tusk: '#f3ead4', nail: '#ebe5d4', foot: '#959a9f' },
      chest: { x: 26, r: 38 }, hip: { x: -28, r: 35 }, belly: { r: 40, drop: 5 },
      fl: { l1: 36, l2: 32, r1: 16, r2: 13.5, r3: 14, w: 18, jx: 4, jy: -16, bend: 1, foot: 'pad', fr: 14, home: 2 },
      hl: { l1: 36, l2: 30, r1: 18, r2: 13.5, r3: 14, w: 18, jx: -4, jy: -14, bend: 1, foot: 'pad', fr: 14, home: -2 },
      neck: { bx: 14, by: 14, len: 16, a: 15, curve: 0, r1: 27, r2: 25, eatA: 2, sleepA: -12, runA: 8 },
      head: { r: 28, pitch: -5, eatP: -12, sleepP: -14, snout: 20 },
      trunk: { n: 8, len: 100, r1: 11, r2: 4.5 },
      tail: { n: 5, seg: 9, r1: 3, r2: 2, a: -82, curl: 2, sway: 0.35, run: 25, tuft: 1 },
      gait: { walkV: 38, walkF: 0.7, walkB: 0.62, run: 'amble', runV: 110, runF: 1.35, runB: 0.5, liftW: 9, liftR: 14, bob: 2, rock: 1.5, hop: 2, nod: 1.5 },
      sleepFront: 'tuck', eatTrunk: true, legRings: eleLeg,
      drawHead: eleHead
    },
    zebra: {
      name: 'Zebras', kind: 'quad', box: '-150 -168 300 225',
      roles: {
        papa: { title: 'Zebrahengst', s: 1 },
        mama: { title: 'Zebrastute', s: 0.92 },
        kind: { title: 'Zebrafohlen', s: 0.58, head: 1.28, legK: 1.18, foal: 1 }
      },
      col: { body: '#f6f4ee', stripe: '#1c1c1f', muzzle: '#2b2b30', hoof: '#2a2a2a', tuft: '#1c1c1f' },
      chest: { x: 30, r: 20 }, hip: { x: -30, r: 18.5 }, belly: { r: 19.5, drop: 2 },
      fl: { l1: 30, l2: 33, r1: 8.5, r2: 5.5, r3: 4.2, w: 8, jx: 2, jy: -9, bend: 1, foot: 'hoof', fr: 4.5, home: 1 },
      hl: { l1: 32, l2: 33, r1: 12, r2: 5.5, r3: 4.2, w: 8, jx: -2, jy: -6, bend: -1, foot: 'hoof', fr: 4.5, home: -2 },
      neck: { bx: 12, by: 6, len: 40, a: 55, curve: -8, r1: 13, r2: 9, eatA: -66, sleepA: 22, runA: 30 },
      head: { r: 10.5, pitch: -50, runP: -30, eatP: -88, sleepP: -55, snout: 30 },
      tail: { n: 4, seg: 8, r1: 2.6, r2: 2, a: -70, curl: 4, sway: 0.2, run: 35, tuft: 1 },
      gait: { walkV: 45, walkF: 0.95, walkB: 0.62, run: 'gallop', runV: 190, runF: 2.2, runB: 0.4, liftW: 10, liftR: 18, bob: 1.4, rock: 5, hop: 6, nod: 4 },
      graze: true, eatDrop: 6, sleepFront: 'tuck', legRings: zebraLeg,
      drawHead: zebraHead, drawBody: zebraBody
    },
    gnu: {
      name: 'Gnus', kind: 'quad', box: '-150 -168 300 225',
      roles: {
        papa: { title: 'Gnubulle', s: 1, horn: 1, beard: 1 },
        mama: { title: 'Gnukuh', s: 0.92, horn: 0.72, beard: 0.8 },
        kind: { title: 'Gnukalb', s: 0.58, head: 1.25, legK: 1.15, horn: 0.2, calf: 1 }
      },
      col: { body: '#6e7783', stripe: '#474e58', mane: '#1d1e22', horn: '#2c2c2e', muzzle: '#2e3136', hoof: '#222222', tail: '#2a2c31', tuft: '#1d1e22' },
      kidCol: { body: '#b48759', stripe: null, mane: '#5c3d22', muzzle: '#3e2a1c', tail: '#7a5634', tuft: '#4b311b' },
      chest: { x: 28, r: 23 }, hip: { x: -28, r: 17.5 }, belly: { r: 20, drop: 2 },
      fl: { l1: 30, l2: 32, r1: 9.5, r2: 5.5, r3: 4.3, w: 9, jx: 2, jy: -10, bend: 1, foot: 'hoof', fr: 4.5, home: 1 },
      hl: { l1: 29, l2: 29, r1: 11.5, r2: 5.5, r3: 4.3, w: 8, jx: -2, jy: -5, bend: -1, foot: 'hoof', fr: 4.5, home: -2 },
      neck: { bx: 12, by: 5, len: 30, a: 30, curve: -10, r1: 15.5, r2: 11, eatA: -62, sleepA: 5, runA: 12 },
      head: { r: 11.5, pitch: -60, runP: -40, eatP: -90, sleepP: -62, snout: 28 },
      tail: { n: 5, seg: 8, r1: 2.2, r2: 3.6, a: -75, curl: 3, sway: 0.3, run: 30, tuft: 1 },
      gait: { walkV: 45, walkF: 1, walkB: 0.62, run: 'gallop', runV: 185, runF: 2.25, runB: 0.4, liftW: 10, liftR: 17, bob: 1.5, rock: 5, hop: 6, nod: 3 },
      graze: true, eatDrop: 6, sleepFront: 'tuck',
      drawHead: gnuHead, drawBody: gnuBody
    },
    croc: {
      name: 'Krokodile', kind: 'croc', box: '-150 -125 300 225',
      roles: {
        papa: { title: 'Krokodil-Männchen', s: 1 },
        mama: { title: 'Krokodil-Weibchen', s: 0.82 },
        kind: { title: 'Jungtier', s: 0.4, head: 1.3, bands: 1 }
      },
      col: { body: '#587338', jaw: '#7d8f4c', scute: '#3a4f22', eye: '#e3c13a', teeth: '#f6f1df', mouth: '#c9786a' },
      kidCol: { body: '#7f9038', jaw: '#a7ae5c', scute: '#4a5520', band: '#3d4219' },
      spine: [[34, 11], [20, 13], [2, 14], [-18, 13], [-34, 10.5], [-50, 8.5], [-65, 7], [-79, 5.5], [-92, 4], [-104, 2.6]],
      lowY: 12.5, highY: 19,
      legs: { l1: 13, l2: 12, r1: 5.5, r2: 4.2, r3: 3.4, spread: 13, fr: 3 },
      head: { len: 50, r: 9.5 },
      gait: { walkV: 28, walkF: 0.75, walkB: 0.65, walkPat: 'trot', run: 'gallop', runV: 150, runF: 2.4, runB: 0.42, liftW: 6, liftR: 10, bob: 0.6, rock: 3, hop: 4, undW: 4, undR: 6 }
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
      blinkT: 1 + Math.random() * 3, blinking: false,
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
    // umschauen: manchmal zur Kamera, sonst irgendwohin
    A.lookT -= dt;
    if (A.lookT < 0) {
      A.lookT = 1.5 + Math.random() * 3;
      const cam = Math.atan2(Math.cos(A.h), Math.sin(A.h));
      A.look = Math.random() < 0.5 && Math.abs(cam) < 1.7 ? clamp(cam, -0.9, 0.9) : (Math.random() - 0.5) * 0.9;
    }
    const free = (1 - Math.min(1, mw)) * (1 - w.eat) * (1 - w.sleep);
    A.lookNow += (A.look * free - A.lookNow) * (1 - Math.exp(-2.5 * dt));
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
