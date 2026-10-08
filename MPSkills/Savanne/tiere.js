/* ══════════════════════════════════════════════════════════════
   Savanne — Die Tiere (tiere.js)
   ══════════════════════════════════════════════════════════════

   Löwen, Elefanten, Zebras, Gnus und Krokodile, jeweils Papa,
   Mama und Kind. Fassung 3 (Oktober 2026), gebaut für den
   Showroom showroom-tiere.html und für das neue Projekt.

   ── Aussehen ──────────────────────────────────────────────────
   Von Hand gezeichnet wie die Wesen aus Knowledge Stack
   (tools/KnowledgeStack/creatures.js): eine Linienfarbe (INK),
   dicke runde Umrisse, Glanz oben links, Schatten unten rechts,
   Knopfaugen mit zwei Lichtpunkten, rosa Bäckchen. Kindchen-
   schema: großer Kopf, runder Bauch, kurze Beine.
   Fassung 2 (3D-Kugeln) sah gruselig aus — deshalb wieder echte
   Zeichnungen, je Art drei Ansichten:

     side   von der Seite, Blick nach rechts (links = gespiegelt)
     front  von vorn (läuft auf uns zu)
     back   von hinten (läuft von uns weg)

   Jede Zeichnung liegt im Kasten 0…120 × 0…100, Boden y = 92,
   Mitte x = 60 — wie die Wesen (dort 0…100).

   ── Das Skelett ───────────────────────────────────────────────
   Die Zeichnung ist in Gelenke zerlegt, die jedes Bild neu
   gestellt werden:

     Beine     Hüfte → Knie → Fuß. Der Fuß folgt dem Gangbild
               (Schritt, Trab, Galopp, Paßgang), das Knie rechnet
               eine kleine IK aus. Die Beine sind „Röhren“
               (Umriss + Farbe), Pfote/Huf sitzt am Fußpunkt.
     Rumpf     wippt und kippt (rootA/rootB), Hals als Röhre
     Kopf      dreht um den Halsansatz (Grasen, Schlafen)
     Schwanz   Kurve mit Quaste, schwingt
     Rüssel    Kette aus Gliedern (Elefant), rollt sich ein
     Kiefer    klappt (Krokodil), Ohren wackeln
   „Skelett“ im Showroom blendet Knochen und Gelenke ein.

   Streifen an Hals und Beinen sind gestrichelte Linien entlang
   der Röhre (stroke-dasharray) — so wandern sie mit.

   ── Was ein Tier kann (A.mode) ────────────────────────────────
     idle   stehen, atmen, blinzeln, ab und zu ein Funkelstern
     walk   gehen        run   laufen
     eat    fressen (Herzchen)      sleep  schlafen (Zzz)
   Zwischen den Zuständen wird weich übergeblendet (A.w).

   ── Schnittstelle (window.SavanneTiere) ───────────────────────
     create(art, rolle)    → Tier ('lion' …, 'papa'|'mama'|'kind')
     mount(tier, svgG)     → legt die Zeichengruppe an
     update(tier, dt)      → Uhr weiter (Sekunden)
     draw(tier, view)      → zeichnen; view = { ox, oy, S, skel,
                              ground, mark }; (ox, oy) = Fußpunkt
     A.h                   Laufrichtung am Bildschirm (0 = rechts,
                           π/2 = auf uns zu); daraus folgt die Ansicht
     A.s                   Größe in der Savanne, A.cardS im Kasten
     SPECIES, ORDER, ROLES, PITCH
   Läuft ohne Netz und ohne Build.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const PITCH = 0.42;
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#1e1b2e';
  const GROUND = 92;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const n1 = v => Math.round(v * 10) / 10;
  let UID = 0;

  /* ── Zeichenwerkzeug (wie creatures.js) ────────────────────── */
  const at = (w, x) => (w ? ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"' : '') + (x ? ' ' + x : '');
  const P = (d, fill, w, x) => '<path d="' + d + '" fill="' + fill + '"' + at(w === undefined ? 2.6 : w, x) + '/>';
  const E = (cx, cy, rx, ry, fill, w, x) => '<ellipse cx="' + n1(cx) + '" cy="' + n1(cy) + '" rx="' + n1(rx) + '" ry="' + n1(ry) + '" fill="' + fill + '"' + at(w === undefined ? 2.6 : w, x) + '/>';
  const C = (cx, cy, r, fill, w, x) => E(cx, cy, r, r, fill, w, x);
  const L = (d, col, w, x) => '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (x ? ' ' + x : '') + '/>';
  const shine = (d, w, o) => L(d, '#fff', w || 2.4, 'opacity="' + (o || 0.6) + '"');
  const hl = (cx, cy, r, o) => C(cx, cy, r, '#fff', 0, 'opacity="' + (o || 0.8) + '"');
  const shade = (d, o) => P(d, INK, 0, 'opacity="' + (o || 0.12) + '"');
  const G = (k, inner, x) => '<g data-k="' + k + '"' + (x ? ' ' + x : '') + '>' + inner + '</g>';
  // Röhre (Bein, Hals, Schwanz, Rüssel): Umriss + Farbe, die Form setzt draw()
  const tube = (k, col, w) => '<path data-k="' + k + 'O" fill="none" stroke="' + INK + '" stroke-width="' + n1(w + 3.2) + '" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path data-k="' + k + 'F" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  // Streifen entlang einer Röhre (gleiche Form, gestrichelt)
  const bands = (k, col, w, dash, op) => '<path data-k="' + k + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-dasharray="' + dash + '"' + (op ? ' opacity="' + op + '"' : '') + '/>';

  function darker(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = c => Math.round(clamp(c * k, 0, 255)).toString(16).padStart(2, '0');
    return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
  }
  function fluff(cx, cy, r, n, rot) {
    const br = r * Math.sin(Math.PI / n) * 1.25;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = (rot || 0) + i * TAU / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      d += (i ? 'A' + n1(br) + ' ' + n1(br) + ' 0 0 1 ' : 'M') + n1(x) + ' ' + n1(y) + ' ';
    }
    return d + 'Z';
  }
  const star = (x, y, s) => {
    const k = s * 0.22;
    return 'M ' + n1(x) + ' ' + n1(y - s) + ' Q ' + n1(x + k) + ' ' + n1(y - k) + ' ' + n1(x + s) + ' ' + n1(y)
      + ' Q ' + n1(x + k) + ' ' + n1(y + k) + ' ' + n1(x) + ' ' + n1(y + s)
      + ' Q ' + n1(x - k) + ' ' + n1(y + k) + ' ' + n1(x - s) + ' ' + n1(y)
      + ' Q ' + n1(x - k) + ' ' + n1(y - k) + ' ' + n1(x) + ' ' + n1(y - s) + ' Z';
  };
  const heart = (x, y, s) => 'M ' + n1(x) + ' ' + n1(y + s * 0.45) + ' C ' + n1(x - s * 1.15) + ' ' + n1(y - s * 0.3) + ' ' + n1(x - s * 0.45) + ' ' + n1(y - s * 1.1) + ' ' + n1(x) + ' ' + n1(y - s * 0.45)
    + ' C ' + n1(x + s * 0.45) + ' ' + n1(y - s * 1.1) + ' ' + n1(x + s * 1.15) + ' ' + n1(y - s * 0.3) + ' ' + n1(x) + ' ' + n1(y + s * 0.45) + ' Z';
  const dot = (x, y, r, fill, stroke, w) => '<circle cx="' + n1(x) + '" cy="' + n1(y) + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + w + '"/>';

  /* Gesicht: Knopfaugen offen / zu / glücklich, Wimpern, Bäckchen */
  function eyes(lx, rx, y, r, lashes) {
    const xs = [lx, rx].filter(x => x != null);
    const open = xs.map(x => E(x, y, r * 0.8, r, INK, 0) + hl(x - r * 0.26, y - r * 0.4, r * 0.34, 0.95) + hl(x + r * 0.26, y + r * 0.38, r * 0.15, 0.85)).join('');
    const closed = xs.map(x => L('M ' + n1(x - r * 0.9) + ' ' + n1(y) + ' Q ' + n1(x) + ' ' + n1(y + r * 0.8) + ' ' + n1(x + r * 0.9) + ' ' + n1(y), INK, 2)).join('');
    const happy = xs.map(x => L('M ' + n1(x - r * 0.9) + ' ' + n1(y + r * 0.3) + ' Q ' + n1(x) + ' ' + n1(y - r * 1.0) + ' ' + n1(x + r * 0.9) + ' ' + n1(y + r * 0.3), INK, 2)).join('');
    let lash = '';
    if (lashes) xs.forEach((x, i) => {
      const s = xs.length === 1 ? 1 : (i === 0 ? -1 : 1);
      lash += L('M ' + n1(x + s * r * 0.55) + ' ' + n1(y - r * 0.75) + ' l ' + n1(s * 1.5) + ' ' + n1(-1.5) + ' M ' + n1(x + s * r * 0.8) + ' ' + n1(y - r * 0.35) + ' l ' + n1(s * 1.8) + ' -0.5', INK, 1.2);
    });
    return G('eo', open + lash) + G('ec', closed, 'display="none"') + G('eh', happy + lash, 'display="none"');
  }
  const blush = (x, y, s) => E(x, y, 3.3 * (s || 1), 2 * (s || 1), '#ff6f9f', 0, 'opacity=".5"');
  function flower(x, y, s) {
    s = s || 1;
    let o = '';
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 - Math.PI / 2;
      o += C(x + Math.cos(a) * 2.1 * s, y + Math.sin(a) * 2.1 * s, 1.6 * s, '#ffffff', 0.9);
    }
    return o + C(x, y, 1.3 * s, '#ffd23f', 0.9);
  }
  const shadowEl = rx => '<g data-k="sh"><ellipse cx="60" cy="92.4" rx="' + rx + '" ry="3.4" fill="' + INK + '" opacity=".14"/></g>';

  /* ── Gangbild ──────────────────────────────────────────────── */
  // Phase je Bein: [links vorn, rechts vorn, links hinten, rechts hinten]
  const PAT = {
    walk:   [0.25, 0.75, 0, 0.5],
    trot:   [0, 0.5, 0.5, 0],
    gallop: [0.58, 0.45, 0, 0.12],
    amble:  [0.3, 0.8, 0, 0.5]
  };
  function blendOff(a, wa, b, wb) {
    const x = wa * Math.cos(TAU * a) + wb * Math.cos(TAU * b), y = wa * Math.sin(TAU * a) + wb * Math.sin(TAU * b);
    return ((Math.atan2(y, x) / TAU) % 1 + 1) % 1;
  }
  function gait(A) {
    const Gt = A.D.gait, w = A.w, mw = w.walk + w.run, m = Math.min(1, mw);
    const pw = PAT[Gt.walkPat || 'walk'], pr = PAT[Gt.run];
    const beta = mw > 1e-4 ? (w.walk * Gt.walkB + w.run * Gt.runB) / mw : Gt.walkB;
    const lift = mw > 1e-4 ? (w.walk * Gt.liftW + w.run * Gt.liftR) / mw * m : 0;
    const stride = A.freq > 0 ? A.v * beta / A.freq : 0;
    return {
      m,
      foot(i) {
        const p = (A.phase + blendOff(pw[i], w.walk + 1e-4, pr[i], w.run)) % 1;
        if (p < beta) return { x: stride * (0.5 - p / beta), y: 0 };
        const u = (p - beta) / (1 - beta);
        return { x: stride * (-0.5 + smooth(u)), y: lift * Math.sin(Math.PI * u) };
      }
    };
  }
  /* Zwei Knochen, ein Knie. bend −1: Knie nach vorn (Vorderbein), +1: nach hinten */
  function ik(H, F, l1, l2, bend) {
    let dx = F.x - H.x, dy = F.y - H.y, d = Math.hypot(dx, dy);
    const maxL = (l1 + l2) * 0.999;
    if (d > maxL) { F = { x: H.x + dx / d * maxL, y: H.y + dy / d * maxL }; dx = F.x - H.x; dy = F.y - H.y; d = maxL; }
    d = Math.max(d, Math.abs(l1 - l2) + 0.3);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    return { K: { x: H.x + ux * a - uy * h * bend, y: H.y + uy * a + ux * h * bend }, F };
  }
  // Punkt skalieren und drehen um piv (Grad), dann verschieben — wie das SVG-transform
  function tf(p, piv, deg, dx, dy, sc) {
    const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG), k = sc || 1;
    const x = (p[0] - piv[0]) * k, y = (p[1] - piv[1]) * k;
    return { x: piv[0] + x * c - y * s + (dx || 0), y: piv[1] + x * s + y * c + (dy || 0) };
  }
  // glatte Kurve durch Punkte (Catmull-Rom)
  function curve(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const g = i => pts[clamp(i, 0, n - 1)];
    let d = 'M' + n1(pts[0].x) + ' ' + n1(pts[0].y);
    for (let i = 0; i < n - 1; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += ' C' + n1(p1.x + (p2.x - p0.x) / 6) + ' ' + n1(p1.y + (p2.y - p0.y) / 6) + ' ' + n1(p2.x - (p3.x - p1.x) / 6) + ' ' + n1(p2.y - (p3.y - p1.y) / 6) + ' ' + n1(p2.x) + ' ' + n1(p2.y);
    }
    return d;
  }

  /* ══════════════════════════════════════════════════════════════
     Die Zeichnungen
     ══════════════════════════════════════════════════════════════
     Jede Ansicht liefert:
       body, head  Zeichnung (data-k für alles, was sich bewegt)
       headPiv     Drehpunkt des Kopfes
       legs        [links vorn, rechts vorn, links hinten, rechts
                   hinten]: hip, l1, l2, w, bend, home, splay
       tail        Wurzel, Ende in Ruhe, Dicke, Quaste
       neck        Hals als Röhre (Zebra, Gnu)
       trunk       Rüssel (Elefant)
       graze       Kopfstellung beim Grasen
       top         Punkt über dem Kopf (Zzz, Herzchen)          */
  const LEGK = ['lf', 'ln', 'hf', 'hn'];
  // Welche Beine sind weiter weg? Seite: die linken; vorn: die hinteren; hinten: die vorderen.
  const FAR = { side: [0, 2], front: [2, 3], back: [0, 1] };

  /* ── Löwe ──────────────────────────────────────────────────── */
  const pawSide = col => E(1.6, 0.6, 5.4, 3.6, col, 2.4) + L('M 4.4 -0.6 L 4.6 1.8 M 1.8 -0.8 L 2 1.9', INK, 1.1);
  const pawFront = col => E(0, 0.6, 4.6, 3.6, col, 2.4) + L('M -1.5 0.6 L -1.5 3 M 1.5 0.6 L 1.5 3', INK, 1.1);

  function lionSide(R, c) {
    const mane = R.mane ? P(fluff(85, 43, 25, 15, 0.2), c.mane, 2.6) + P(fluff(86, 43, 20.5, 13, 0.4), c.mane2, 2.2) : '';
    const spots = R.spots ? [[45, 56], [52, 60], [60, 55], [67, 59], [48, 66]].map(([x, y]) => E(x, y, 2.4, 1.7, c.spot, 0)).join('') : '';
    const tuft = R.tuft ? P('M 81 26.5 Q 81 20 86 20.5 Q 84 23 86.5 25.5 Q 88 21 91.5 23 Q 89 24 89.5 27 Z', c.mane2, 1.8) : '';
    const body = P('M 33 63 C 33 51 45 47.5 58 47.5 C 72 47.5 82 53 82 63 C 82 73 73 77.5 58 77.5 C 43 77.5 33 74 33 63 Z', c.body, 2.8)
      + E(58, 72.4, 14, 4.2, c.light, 0)
      + spots
      + shade('M 78 57 C 82.5 64 80 72 71 75.8 C 77 70 79.5 64 78 57 Z')
      + shine('M 39.5 56 C 41 52 45 50 50 49.4');
    const head = mane
      + G('earL', C(74.5, 28, 5.6, c.body, 2.4) + C(75, 28.6, 3, c.earIn, 0), 'data-piv="75 32"')
      + G('earR', C(96, 27, 5.2, c.body, 2.4) + C(95.6, 27.6, 2.8, c.earIn, 0), 'data-piv="95 31"')
      + C(86, 42, 17.5, c.body, 2.8)
      + tuft
      + shade('M 99.5 33 C 105 41 102 52 92.5 57.5 C 99.5 50.5 101.5 42 99.5 33 Z')
      + shine('M 73.5 38 C 74.5 32 78.5 28.5 83.5 27.5')
      + P('M 83.5 49 C 83.5 45 87.5 44 91.5 45 C 95.5 44 99.5 45 99.5 49 C 99.5 54 95.5 56 91.5 55 C 87.5 56 83.5 54 83.5 49 Z', c.light, 2.2)
      + C(87, 50, 0.6, INK, 0) + C(87.6, 48.2, 0.6, INK, 0) + C(96.6, 50, 0.6, INK, 0) + C(96, 48.2, 0.6, INK, 0)
      + G('mN', L('M 91.5 48.8 L 91.5 50.6 M 88.6 50.4 Q 90 52.4 91.5 50.6 Q 93 52.4 94.4 50.4', INK, 1.5))
      + G('mO', P('M 88.8 50.4 Q 91.5 56 94.2 50.4 Z', '#8a2f45', 1.5) + E(91.5, 53.2, 1.6, 1, '#ff7a93', 0), 'display="none"')
      + P('M 88.5 45.2 Q 91.5 43.6 94.5 45.2 Q 94 48.2 91.5 48.8 Q 89 48.2 88.5 45.2 Z', c.nose, 1.8) + hl(90.4, 45.5, 0.8, 0.9)
      + eyes(84, 97, 39.5, R.kid ? 3.9 : 3.5, R.lashes)
      + blush(80.2, 46.5) + blush(102, 46, 0.8)
      + (R.flower ? flower(73, 23.5, 1) : '');
    return {
      shadow: 26, body, head, headPiv: [78, 58],
      tail: { root: [35, 61], end: [18, 47], w: 3.4, tuft: P(fluff(0, 0, 4.4, 7), c.tuft, 2) },
      legs: [
        { hip: [77, 68], l1: 9.5, l2: 9.5, w: 8.6, bend: -1, home: 1 },
        { hip: [72, 70], l1: 9.5, l2: 9.5, w: 9, bend: -1, home: 1 },
        { hip: [49, 68], l1: 9.5, l2: 9.5, w: 8.6, bend: 1, home: -1 },
        { hip: [44, 70], l1: 9.5, l2: 9.5, w: 9, bend: 1, home: -1 }
      ],
      footY: 88, foot: pawSide, sphinx: true,
      top: [88, 20]
    };
  }
  function lionFront(R, c, back) {
    const maneF = R.mane ? P(fluff(60, 41, 27, 16), c.mane, 2.6) + P(fluff(60, 42, 22.5, 14, 0.2), c.mane2, 2.2) : '';
    const body = back
      ? P('M 39 64 C 39 54 48 50 60 50 C 72 50 81 54 81 64 C 81 74 72 79 60 79 C 48 79 39 74 39 64 Z', c.body, 2.8)
        + shade('M 76 58 C 81 64 79 73 70 77 C 75 71 77 64 76 58 Z') + shine('M 44 59 C 45 55 48 53 52 52.4')
        + L('M 60 68 L 60 77', INK, 1.2, 'opacity=".3"')
      : P('M 40 66 C 40 56 49 52 60 52 C 71 52 80 56 80 66 C 80 75 71 79 60 79 C 49 79 40 75 40 66 Z', c.body, 2.8)
        + E(60, 72, 10, 5, c.light, 0) + shade('M 75 60 C 80 66 78 74 70 77.5 C 75 72 77 66 75 60 Z');
    let head;
    if (!back) {
      head = maneF
        + G('earL', C(45, 27.5, 6, c.body, 2.4) + C(45.5, 28, 3.2, c.earIn, 0), 'data-piv="47 32"')
        + G('earR', C(75, 27.5, 6, c.body, 2.4) + C(74.5, 28, 3.2, c.earIn, 0), 'data-piv="73 32"')
        + C(60, 42, 18.5, c.body, 2.8)
        + (R.tuft ? P('M 55 25 Q 56 18.5 60.5 19.5 Q 58.5 22 61 24 Q 63 20 66 22.5 Q 63.5 23.5 64 25.5 Z', c.mane2, 1.8) : '')
        + shade('M 74 33 C 80 41 77 53 66 59 C 73.5 51.5 76.5 42 74 33 Z')
        + shine('M 46.5 38 C 47.5 32 51.5 28.5 56.5 27.5')
        + P('M 52 50 C 52 46 56 45 60 46 C 64 45 68 46 68 50 C 68 55 64 57 60 56 C 56 57 52 55 52 50 Z', c.light, 2.2)
        + C(55, 50.6, 0.6, INK, 0) + C(55.6, 48.8, 0.6, INK, 0) + C(65, 50.6, 0.6, INK, 0) + C(64.4, 48.8, 0.6, INK, 0)
        + G('mN', L('M 60 49.8 L 60 51.6 M 57.1 51.4 Q 58.5 53.4 60 51.6 Q 61.5 53.4 62.9 51.4', INK, 1.5))
        + G('mO', P('M 57.3 51.4 Q 60 57 62.7 51.4 Z', '#8a2f45', 1.5) + E(60, 54.2, 1.6, 1, '#ff7a93', 0), 'display="none"')
        + P('M 57 46.2 Q 60 44.6 63 46.2 Q 62.5 49.2 60 49.8 Q 57.5 49.2 57 46.2 Z', c.nose, 1.8) + hl(58.9, 46.5, 0.8, 0.9)
        + eyes(52.5, 67.5, 40.5, R.kid ? 4 : 3.6, R.lashes)
        + blush(48.5, 47) + blush(71.5, 47)
        + (R.flower ? flower(44, 23, 1) : '');
    } else {
      head = C(60, 40, 18, c.body, 2.8)
        + G('earL', C(45.5, 27, 6, c.body, 2.4), 'data-piv="47 31"') + G('earR', C(74.5, 27, 6, c.body, 2.4), 'data-piv="73 31"')
        + shine('M 47 36 C 48 31 51 28 55 27')
        + (R.mane ? P(fluff(60, 42, 25, 16), c.mane, 2.6) + P(fluff(60, 39, 15, 11, 0.3), c.mane2, 2) : '')
        + (R.tuft ? P('M 56 23.5 Q 57 18 61 19 Q 59 21.5 61.5 23.5 Z', c.mane2, 1.6) : '')
        + (R.flower ? flower(76, 23, 1) : '');
    }
    return {
      shadow: 22, body, head, headPiv: [60, 58],
      tail: back ? { root: [60, 62], end: [70, 44], w: 3.4, tuft: P(fluff(0, 0, 4.4, 7), c.tuft, 2) }
        : { root: [74, 64], end: [86, 52], w: 3.2, tuft: P(fluff(0, 0, 4, 7), c.tuft, 2), behind: true },
      legs: back ? [
        { hip: [53, 70], l1: 8, l2: 8, w: 8.4 }, { hip: [67, 70], l1: 8, l2: 8, w: 8.4 },
        { hip: [49, 72], l1: 8, l2: 8, w: 9.2 }, { hip: [71, 72], l1: 8, l2: 8, w: 9.2 }
      ] : [
        { hip: [51, 73], l1: 7.5, l2: 7.5, w: 9.2 }, { hip: [69, 73], l1: 7.5, l2: 7.5, w: 9.2 },
        { hip: [47, 70], l1: 8, l2: 8, w: 8.4 }, { hip: [73, 70], l1: 8, l2: 8, w: 8.4 }
      ],
      footY: 88, foot: pawFront, top: [60, 18]
    };
  }

  /* ── Elefant ───────────────────────────────────────────────── */
  const eleFoot = (col, far, nail) => E(0, 0.6, 7.4, 3.7, col, 2.5) + (far ? '' : C(-3.4, 2.6, 1.3, nail, 1) + C(0, 3, 1.4, nail, 1) + C(3.4, 2.6, 1.3, nail, 1));
  function eleSide(R, c) {
    const tk = R.tusk || 0;
    const tusk = tk ? P('M 92.5 50 Q ' + n1(95 + 3 * tk) + ' ' + n1(56 + 3 * tk) + ' ' + n1(98 + 9 * tk) + ' ' + n1(54 + 1.5 * tk) + ' Q ' + n1(97 + 4 * tk) + ' ' + n1(53 + 0.5 * tk) + ' 95.5 48.8 Z', c.tusk, 1.8) : '';
    const body = P('M 24 58 C 24 43 37 35 53 35 C 69 35 81 42 81 58 C 81 72 71 79 53 79 C 36 79 24 72 24 58 Z', c.body, 2.8)
      + shade('M 75 46 C 82 54 81 68 70 76 C 77 68 79 56 75 46 Z')
      + shine('M 31 50 C 33 44 38 40 45 38.4')
      + L('M 66 72 Q 68 75 66 77.5 M 40 72 Q 38 75 40 77.5', INK, 1.2, 'opacity=".25"');
    const head = C(86, 40, 19, c.body, 2.8)
      + L('M 84 21.4 Q 83 17 85.5 16 M 87 21.2 Q 88 16.5 91 16.8 M 81.5 22.5 Q 79 19 80.5 17', INK, 1.4)
      + shade('M 100 30 C 106 38 104 50 96 56 C 101 48 102 39 100 30 Z')
      + shine('M 74 34 C 76 29 80 25.5 85 24.5')
      + tube('trA', c.body, 9.6) + tube('trB', c.body, 6.6)
      + bands('trW', INK, 6.5, '0.7 3.2', 0.28)
      + G('trTip', E(0, 0, 3.4, 2.3, darker(c.body, 0.9), 2) + E(0.4, 0.2, 1.4, 0.9, INK, 0, 'opacity=".55"'))
      + tusk
      + L('M 89.5 51 Q 92 53.6 94.6 52.2', INK, 1.6)
      + eyes(88.5, 99.5, 37.5, R.kid ? 3.5 : 3.1, R.lashes)
      + blush(85.5, 45) + blush(103, 44.5, 0.75)
      + G('ear', P('M 80 29 C 69 22 58 30 60 43 C 61.5 54 71 59 79.5 52.5 C 84 48 84.5 35 80 29 Z', c.ear, 2.6)
        + P('M 78 33.5 C 70.5 29.5 64.5 35 65.5 43 C 66.5 50 72.5 52.5 77.5 49 Z', c.earIn, 0)
        + shine('M 63.5 38 C 64.5 33 67.5 30 71 29.4', 2, 0.5), 'data-piv="80 41"')
      + (R.flower ? flower(83.5, 23, 1.05) : '');
    return {
      shadow: 30, body, head, headPiv: [79, 52],
      trunk: { root: [96.5, 46.5], n: 6, len: R.trunkLen || 38, a0: 72 },
      tail: { root: [25, 56], end: [19, 72], w: 2.4, tuft: E(0, 1.5, 2.3, 3.4, c.tuft, 1.6) },
      legs: [
        { hip: [72, 72], l1: 8, l2: 7.6, w: 12, bend: -1, home: 1 },
        { hip: [67, 74], l1: 7.5, l2: 7.5, w: 13, bend: -1, home: 1 },
        { hip: [43, 72], l1: 8, l2: 7.6, w: 12, bend: -1, home: -1 },
        { hip: [38, 74], l1: 7.5, l2: 7.5, w: 13, bend: -1, home: -1 }
      ],
      footY: 87.8, foot: (col, far) => eleFoot(col, far, c.nail),
      top: [88, 15]
    };
  }
  function eleFront(R, c, back) {
    const ear = s => P('M 60 32 C ' + (60 + s * -14) + ' 20 ' + (60 + s * -38) + ' 26 ' + (60 + s * -36) + ' 44 C ' + (60 + s * -34) + ' 58 ' + (60 + s * -20) + ' 60 ' + (60 + s * -13) + ' 52 Z', c.ear, 2.6)
      + (back ? '' : P('M ' + (60 + s * -14) + ' 33 C ' + (60 + s * -20) + ' 27 ' + (60 + s * -33) + ' 31 ' + (60 + s * -31) + ' 44 C ' + (60 + s * -30) + ' 53 ' + (60 + s * -21) + ' 54 ' + (60 + s * -16) + ' 49 Z', c.earIn, 0));
    const body = back
      ? P('M 35 60 C 35 46 46 40 60 40 C 74 40 85 46 85 60 C 85 73 74 79 60 79 C 46 79 35 73 35 60 Z', c.body, 2.8)
        + shade('M 80 50 C 86 58 84 70 74 76 C 80 69 82 59 80 50 Z') + shine('M 41 52 C 42 47 46 44 51 42.5')
        + L('M 60 64 L 60 76', INK, 1.2, 'opacity=".25"')
      : P('M 36 62 C 36 51 46 46 60 46 C 74 46 84 51 84 62 C 84 74 74 79 60 79 C 46 79 36 74 36 62 Z', c.body, 2.8)
        + shade('M 79 54 C 85 61 83 72 73 77 C 79 70 81 61 79 54 Z');
    const tk = R.tusk || 0;
    const tusk = s => tk ? P('M ' + (60 + s * 5.5) + ' 50 Q ' + n1(60 + s * (9 + 2 * tk)) + ' ' + n1(55 + 5 * tk) + ' ' + n1(60 + s * (6.5 + 2 * tk)) + ' ' + n1(58 + 6 * tk) + ' Q ' + (60 + s * 6) + ' ' + n1(55 + 3 * tk) + ' ' + (60 + s * 3.2) + ' 51 Z', c.tusk, 1.8) : '';
    const head = back
      ? G('earL', ear(1), 'data-piv="52 42"') + G('earR', ear(-1), 'data-piv="68 42"')
        + C(60, 38, 18, c.body, 2.8) + shine('M 47 34 C 48.5 29 52 26 56.5 25')
        + L('M 58.5 20.5 Q 58 17 60 16 M 61.5 20.5 Q 62.5 17 64.5 17', INK, 1.4)
        + (R.flower ? flower(72, 24, 1.05) : '')
      : G('earL', ear(1), 'data-piv="52 42"') + G('earR', ear(-1), 'data-piv="68 42"')
        + C(60, 39, 18.5, c.body, 2.8)
        + L('M 58.5 21 Q 57.5 17 60 16 M 61.5 21 Q 62.5 17 65 17.5 M 56 22 Q 54 18.5 55.5 17', INK, 1.4)
        + shade('M 73 29 C 79 37 77 49 68 55 C 74 47 75.5 38 73 29 Z') + shine('M 46.5 35 C 48 29.5 51.5 26.5 56 25.5')
        + tube('trA', c.body, 9.8) + tube('trB', c.body, 7)
        + bands('trW', INK, 6.8, '0.7 3.2', 0.28)
        + G('trTip', E(0, 0, 3.6, 2.6, darker(c.body, 0.9), 2) + E(0, 0.3, 1.6, 1, INK, 0, 'opacity=".55"'))
        + tusk(-1) + tusk(1)
        + L('M 52.5 50.5 Q 54.5 52.6 56 51.6 M 67.5 50.5 Q 65.5 52.6 64 51.6', INK, 1.5)
        + eyes(53, 67, 37.5, R.kid ? 3.6 : 3.2, R.lashes)
        + blush(48.5, 45) + blush(71.5, 45)
        + (R.flower ? flower(48, 24, 1.05) : '');
    return {
      shadow: 27, body, head, headPiv: [60, 56],
      trunk: back ? null : { root: [60, 47], n: 6, len: (R.trunkLen || 38) * 0.82, front: true },
      tail: back ? { root: [60, 63], end: [61, 77], w: 2.4, tuft: E(0, 1.5, 2.3, 3.4, c.tuft, 1.6) } : null,
      legs: back ? [
        { hip: [49, 70], l1: 7, l2: 7, w: 12 }, { hip: [71, 70], l1: 7, l2: 7, w: 12 },
        { hip: [47, 74], l1: 7, l2: 7, w: 13 }, { hip: [73, 74], l1: 7, l2: 7, w: 13 }
      ] : [
        { hip: [49, 74], l1: 7, l2: 7, w: 13 }, { hip: [71, 74], l1: 7, l2: 7, w: 13 },
        { hip: [45, 71], l1: 7, l2: 7, w: 12 }, { hip: [75, 71], l1: 7, l2: 7, w: 12 }
      ],
      footY: 87.8, foot: (col, far) => eleFoot(col, far || back, c.nail),
      top: [60, 14]
    };
  }

  /* ── Zebra ─────────────────────────────────────────────────── */
  const hoofSide = (far, hoof) => P('M -3.6 -0.6 L 3.8 -0.6 Q 4.4 2.2 4.6 3.6 Q 4.6 4.6 3.5 4.6 L -3.3 4.6 Q -4.3 4.6 -4.1 3.6 Z', far ? darker(hoof, 0.86) : hoof, 2.2);
  const hoofFront = (far, hoof) => P('M -3.6 -0.6 L 3.6 -0.6 Q 4.2 2.4 4.2 3.6 Q 4.2 4.6 3.2 4.6 L -3.2 4.6 Q -4.2 4.6 -4.2 3.6 Q -4.2 2.4 -3.6 -0.6 Z', far ? darker(hoof, 0.86) : hoof, 2.2);

  function zebraSide(R, c, uid) {
    const clip = 'zc' + uid;
    const bodyD = 'M 34 60.5 C 34 50.5 44 47.5 56 47.5 C 69 47.5 78 52 78 60.5 C 78 70 70 74 56 74 C 43 74 34 70 34 60.5 Z';
    const stripes = [40, 47, 54, 61, 67.5, 73.5].map((x, i) => L('M ' + (x - 2) + ' 45 Q ' + (x + 2.5) + ' 58 ' + (x - 1) + ' 64', c.stripe, i % 2 ? 2.6 : 3.3)).join('')
      + L('M 33 55 Q 41 56.5 44 63 M 33 62 Q 39 62.5 41 68', c.stripe, 2.8);
    const body = '<clipPath id="' + clip + '"><path d="' + bodyD + '"/></clipPath>'
      + P(bodyD, c.body, 0) + '<g clip-path="url(#' + clip + ')">' + stripes + '</g>' + P(bodyD, 'none', 2.8)
      + shade('M 74 54 C 78.5 60 77 68 69 71.5 C 74 66.5 75.5 60 74 54 Z') + shine('M 40.5 53 C 42 50.5 45 49.4 48 49', 2.2, 0.5);
    const head = G('earL', P('M 80.5 20 Q 75.5 8.5 82 9.5 Q 85.5 12.5 84.5 20 Z', c.body, 2.3) + P('M 81.5 18 Q 78.6 11.5 82 12 Q 83.6 14 83.2 18 Z', c.earIn, 0), 'data-piv="82.5 20"')
      + G('earR', P('M 91.5 18 Q 93.5 6.5 98 9.5 Q 98 15 94.6 19.5 Z', c.body, 2.3) + P('M 92.8 16.8 Q 94.4 10.2 96.4 11.6 Q 96.2 15 94.4 17.6 Z', c.earIn, 0), 'data-piv="93 19"')
      + E(88, 28.5, 12.5, 12, c.body, 2.6)
      + L('M 79.6 22.5 Q 83.5 25 81.8 31 M 85 17.6 Q 88.5 21 86.4 26.2 M 91.5 17.5 Q 93.5 20 92.4 23.5', c.stripe, 2.3)
      + P('M 97 17 Q 92 12 87.5 16.5 Q 89 11 84.5 12.5 Q 86 9 91 10.5 Q 96 11 97 17 Z', c.stripe, 1.4)
      + E(96, 38, 8.6, 7.2, c.body, 2.4)
      + L('M 91 33.5 Q 94 34.6 93 38.5 M 95.4 32 Q 98.4 33.5 97.6 36.2', c.stripe, 2)
      + E(99.4, 41.4, 6.3, 5, c.muzzle, 2.4) + hl(97.4, 39.4, 1, 0.5)
      + E(101.6, 40, 1, 1.4, INK, 0) + E(97.8, 40.6, 0.9, 1.3, INK, 0)
      + L('M 96.4 44.2 Q 99 45.6 101.6 43.8', '#ffffff', 1.3, 'opacity=".8"')
      + shade('M 98.5 20 C 101.5 25 101 32 97 36 C 99 31 99.5 25 98.5 20 Z')
      + eyes(85, 95, 27, R.kid ? 3.4 : 3, R.lashes)
      + blush(82.5, 33.5) + blush(103.5, 33.5, 0.7)
      + (R.flower ? flower(81, 14.5, 1) : '');
    return {
      shadow: 24, body, head, headPiv: [82, 37],
      neck: { base: [72.5, 55], w: 13, col: c.body, stripe: c.stripe, mane: 'zebra', maneCol: c.stripe },
      graze: { dx: 8, dy: 30, rot: 42 },
      tail: { root: [35, 57], end: [27, 71], w: 2.6, tuft: P('M -2.4 -1 Q -3.4 5 0 9 Q 3.4 5 2.4 -1 Z', c.tuft, 1.6) },
      legs: [
        { hip: [75, 68], l1: 9.2, l2: 9.2, w: 7, bend: -1, home: 1 },
        { hip: [70, 70], l1: 9, l2: 9, w: 7.4, bend: -1, home: 1 },
        { hip: [48, 68], l1: 9.2, l2: 9.2, w: 7, bend: 1, home: -1 },
        { hip: [44, 70], l1: 9, l2: 9, w: 7.4, bend: 1, home: -1 }
      ],
      legBands: c.stripe,
      footY: 87.4, foot: (col, far) => hoofSide(far, c.hoof),
      top: [90, 6]
    };
  }
  function zebraFront(R, c, uid, back) {
    const clip = 'zf' + uid;
    const bodyD = back ? 'M 42 63 C 42 54 50 50 60 50 C 70 50 78 54 78 63 C 78 72 70 76 60 76 C 50 76 42 72 42 63 Z'
      : 'M 43 64 C 43 56 50 53 60 53 C 70 53 77 56 77 64 C 77 72 70 76 60 76 C 50 76 43 72 43 64 Z';
    const stripes = back
      ? L('M 44 58 Q 52 60 56 68 M 76 58 Q 68 60 64 68 M 45 66 Q 50 67 52 73 M 75 66 Q 70 67 68 73 M 60 51 L 60 56', c.stripe, 2.8)
      : [46, 52, 58, 64, 70, 75].map((x, i) => L('M ' + x + ' 52 Q ' + (x + (x < 60 ? -2 : 2)) + ' 62 ' + x + ' 67', c.stripe, i % 2 ? 2.4 : 3)).join('');
    const body = '<clipPath id="' + clip + '"><path d="' + bodyD + '"/></clipPath>'
      + P(bodyD, c.body, 0) + '<g clip-path="url(#' + clip + ')">' + stripes + '</g>' + P(bodyD, 'none', 2.8)
      + shade(back ? 'M 74 57 C 78 63 77 70 70 74 C 74 69 75.5 63 74 57 Z' : 'M 73 58 C 77 63 76 70 69 74 C 73 69 74.5 63 73 58 Z');
    const earL = P('M 49 21 Q 44 9.5 50.5 10.5 Q 54 13.5 53 21 Z', c.body, 2.3) + (back ? '' : P('M 50 19 Q 47.2 12.5 50.5 13 Q 52.2 15 51.8 19 Z', c.earIn, 0));
    const earR = P('M 71 21 Q 76 9.5 69.5 10.5 Q 66 13.5 67 21 Z', c.body, 2.3) + (back ? '' : P('M 70 19 Q 72.8 12.5 69.5 13 Q 67.8 15 68.2 19 Z', c.earIn, 0));
    const head = back
      ? G('earL', earL, 'data-piv="51 21"') + G('earR', earR, 'data-piv="69 21"')
        + E(60, 31, 12.5, 12.5, c.body, 2.6)
        + L('M 50 27 Q 60 23 70 27 M 51.5 33.5 Q 60 30 68.5 33.5 M 54 39 Q 60 37 66 39', c.stripe, 2.4)
        + P('M 60 17 Q 56 19 57 25 L 63 25 Q 64 19 60 17 Z', c.stripe, 1.4)
        + (R.flower ? flower(70, 16, 1) : '')
      : G('earL', earL, 'data-piv="51 21"') + G('earR', earR, 'data-piv="69 21"')
        + E(60, 30, 13, 12.5, c.body, 2.6)
        + L('M 50 25 Q 60 20.5 70 25 M 52.5 20 Q 60 16.5 67.5 20', c.stripe, 2.4)
        + P('M 55 18.5 Q 54 12.5 58 13.5 Q 60 10 62 13.5 Q 66 12.5 65 18.5 Z', c.stripe, 1.4)
        + E(60, 43, 8.6, 7.6, c.body, 2.4)
        + L('M 53.5 39 Q 60 37 66.5 39', c.stripe, 2.2)
        + E(60, 47, 7, 5, c.muzzle, 2.4) + hl(57.4, 45.4, 1, 0.5)
        + E(57, 46.6, 1, 1.4, INK, 0) + E(63, 46.6, 1, 1.4, INK, 0)
        + L('M 57 50 Q 60 51.5 63 50', '#ffffff', 1.3, 'opacity=".8"')
        + shade('M 70 22 C 74 27 73.5 35 69 39 C 71.5 33.5 72 27 70 22 Z')
        + eyes(53.5, 66.5, 30.5, R.kid ? 3.4 : 3.1, R.lashes)
        + blush(49.5, 36.5) + blush(70.5, 36.5)
        + (R.flower ? flower(50, 16, 1) : '');
    return {
      shadow: 19, body, head, headPiv: [60, 44],
      neck: { base: [60, back ? 54 : 57], w: 13, col: c.body, attach: [60, back ? 38 : 40] },
      graze: { dx: 0, dy: 26, rot: 0, scale: 0.92 },
      tail: back ? { root: [60, 58], end: [60, 74], w: 2.6, tuft: P('M -2.4 -1 Q -3.4 5 0 9 Q 3.4 5 2.4 -1 Z', c.tuft, 1.6) } : null,
      legs: back ? [
        { hip: [52, 70], l1: 8.5, l2: 8.5, w: 6.8 }, { hip: [68, 70], l1: 8.5, l2: 8.5, w: 6.8 },
        { hip: [50, 72], l1: 7.8, l2: 7.8, w: 7.4 }, { hip: [70, 72], l1: 7.8, l2: 7.8, w: 7.4 }
      ] : [
        { hip: [53, 72], l1: 7.8, l2: 7.8, w: 7.4 }, { hip: [67, 72], l1: 7.8, l2: 7.8, w: 7.4 },
        { hip: [50, 70], l1: 8.5, l2: 8.5, w: 6.8 }, { hip: [70, 70], l1: 8.5, l2: 8.5, w: 6.8 }
      ],
      legBands: c.stripe,
      footY: 87.4, foot: (col, far) => hoofFront(far, c.hoof),
      top: [60, 6]
    };
  }

  /* ── Gnu ───────────────────────────────────────────────────── */
  function horn(d, k, col) {
    const w = 4.4 * Math.max(0.6, k);
    return L(d, INK, n1(w + 3)) + L(d, col, n1(w)) + L(d, '#fff', 1, 'opacity=".35" stroke-dasharray="0.1 3"');
  }
  function gnuSide(R, c) {
    const k = R.horn || 0;
    const horns = k ? horn('M 83 21.5 C ' + n1(83 - 7 * k) + ' 21.5 ' + n1(83 - 11 * k) + ' ' + n1(20 - k) + ' ' + n1(83 - 10 * k) + ' ' + n1(21.5 - 8.5 * k), k, c.horn)
      + horn('M 93 20.5 C ' + n1(93 + 7 * k) + ' 20.5 ' + n1(93 + 11 * k) + ' ' + n1(19 - k) + ' ' + n1(93 + 10 * k) + ' ' + n1(20.5 - 8.5 * k), k, c.horn) : '';
    const body = P('M 34 62 C 34 54 42 50.5 52 49.5 C 64 47 76 47.5 80 56 C 83 64 78 72.5 64 73.8 C 50 75 34 72 34 62 Z', c.body, 2.8)
      + (c.stripe ? L('M 63 49.5 Q 66 56 64 62 M 68 49 Q 71 55 69.5 61 M 73 50 Q 75.5 55 74.5 60', c.stripe, 2, 'opacity=".55"') : '')
      + shade('M 76 55 C 80 61 78 69 70 72.6 C 75 67.5 77 61 76 55 Z') + shine('M 40.5 55.5 C 42 52.5 45 51 49 50.4', 2.2, 0.5);
    const head = horns
      + G('earL', P('M 81 27.5 Q 72.5 27 73.5 31 Q 77 32.5 81.5 30.5 Z', c.face, 2.2) + P('M 79.5 28.6 Q 75.6 28.6 76 30.2 Q 78 30.6 80 29.8 Z', c.earIn, 0), 'data-piv="81 29"')
      + G('earR', P('M 95.5 26.5 Q 104 25.5 103.5 29.5 Q 100 31.4 95.5 30 Z', c.face, 2.2) + P('M 97 27.6 Q 101 27.2 101.2 28.8 Q 99.4 29.8 97 29.2 Z', c.earIn, 0), 'data-piv="95.5 28"')
      + E(88, 30, 12.2, 11.6, c.face, 2.6)
      + P('M 84 19.5 Q 86 15 89 18 Q 91 14.5 93 19 Q 89 21.5 84 19.5 Z', c.mane, 1.4)
      + E(96, 39.6, 8.2, 7.6, c.muzzle, 2.4) + E(98.6, 43, 6.2, 4.8, darker(c.muzzle, 0.85), 2.2) + hl(95.6, 37, 1.2, 0.35)
      + E(100.6, 41.8, 1, 1.4, INK, 0) + E(96.8, 42.4, 0.9, 1.3, INK, 0)
      + L('M 95.6 45.8 Q 98.4 47.2 101 45.4', '#ffffff', 1.3, 'opacity=".7"')
      + (R.beard ? P('M 91.5 46 Q 91 53 93.5 ' + n1(55 + 2 * R.beard) + ' Q 95 52 96.5 ' + n1(55.5 + 2 * R.beard) + ' Q 98 50.5 97.5 46.5 Z', c.mane, 1.8) : '')
      + shade('M 98 22 C 101 27 100.5 33 97 36.5 C 99 31.5 99.4 26.5 98 22 Z')
      + shine('M 78.5 28 C 79 24.5 81.5 21.6 85 20.6', 2, 0.55)
      + eyes(84, 93.5, 29, R.kid ? 3.4 : 3, R.lashes)
      + blush(81.2, 35.2)
      + (R.flower ? flower(101.5, 13, 0.95) : '');
    return {
      shadow: 24, body, head, headPiv: [82, 38],
      neck: { base: [73, 55], w: 14, col: c.body, mane: 'gnu', maneCol: c.mane, beard: R.beard ? c.mane : null },
      graze: { dx: 8, dy: 29, rot: 40 },
      tail: { root: [35, 59], end: [27, 74], w: 3, tuft: P('M -3 -1 Q -4.6 6 0 11 Q 4.6 6 3 -1 Z', c.tuft, 1.6) },
      legs: [
        { hip: [75, 69], l1: 9, l2: 9, w: 6.8, bend: -1, home: 1 },
        { hip: [70, 71], l1: 8.8, l2: 8.8, w: 7.2, bend: -1, home: 1 },
        { hip: [49, 68.5], l1: 9, l2: 9, w: 6.8, bend: 1, home: -1 },
        { hip: [45, 70.5], l1: 8.8, l2: 8.8, w: 7.2, bend: 1, home: -1 }
      ],
      footY: 87.4, foot: (col, far) => hoofSide(far, c.hoof),
      top: [90, 6]
    };
  }
  function gnuFront(R, c, back) {
    const k = R.horn || 0;
    const horns = k ? [-1, 1].map(s => horn('M ' + (60 + s * 6) + ' 21 C ' + n1(60 + s * (6 + 9 * k)) + ' 21 ' + n1(60 + s * (6 + 14 * k)) + ' ' + n1(21 + k) + ' ' + n1(60 + s * (6 + 13 * k)) + ' ' + n1(21 - 9 * k), k, c.horn)).join('') : '';
    const body = back
      ? P('M 42 63 C 42 54 50 50 60 50 C 70 50 78 54 78 63 C 78 72 70 76 60 76 C 50 76 42 72 42 63 Z', c.body, 2.8)
        + shade('M 74 57 C 78 63 77 70 70 74 C 74 69 75.5 63 74 57 Z') + shine('M 46 58 C 47 55 49.5 53 52.5 52.4', 2.2, 0.5)
      : P('M 41 64 C 41 55 49 51 60 51 C 71 51 79 55 79 64 C 79 72 71 76 60 76 C 49 76 41 72 41 64 Z', c.body, 2.8)
        + (c.stripe ? L('M 48 54 Q 47 60 49 65 M 53 52.5 Q 52 59 53.5 64 M 72 54 Q 73 60 71 65 M 67 52.5 Q 68 59 66.5 64', c.stripe, 2, 'opacity=".55"') : '')
        + shade('M 74 58 C 78 63 77 70 70 74 C 74 69 75.5 63 74 58 Z');
    const earL = P('M 50 27.5 Q 40 26.5 41 30.5 Q 45 32.5 50.5 30.5 Z', c.face, 2.2);
    const earR = P('M 70 27.5 Q 80 26.5 79 30.5 Q 75 32.5 69.5 30.5 Z', c.face, 2.2);
    const head = back
      ? horns + G('earL', earL, 'data-piv="50 29"') + G('earR', earR, 'data-piv="70 29"')
        + E(60, 31, 12, 12, c.face, 2.6) + P('M 55 20 Q 57 15.5 60 18.5 Q 63 15.5 65 20 Q 60 22.5 55 20 Z', c.mane, 1.4)
        + L('M 60 24 L 60 42', c.mane, 4.2)
        + (R.flower ? flower(46, 12.5, 0.95) : '')
      : horns + G('earL', earL + P('M 48.6 28.4 Q 44 28.2 44.4 29.8 Q 46.6 30.6 49 29.6 Z', c.earIn, 0), 'data-piv="50 29"')
        + G('earR', earR + P('M 71.4 28.4 Q 76 28.2 75.6 29.8 Q 73.4 30.6 71 29.6 Z', c.earIn, 0), 'data-piv="70 29"')
        + E(60, 30, 12.6, 12, c.face, 2.6)
        + P('M 54.5 19 Q 56.5 14.5 60 17.5 Q 63.5 14.5 65.5 19 Q 60 21.5 54.5 19 Z', c.mane, 1.4)
        + E(60, 42, 8.6, 8, c.muzzle, 2.4) + E(60, 46, 7, 4.8, darker(c.muzzle, 0.85), 2.2) + hl(56.6, 39.4, 1.2, 0.35)
        + E(57, 45.6, 1, 1.4, INK, 0) + E(63, 45.6, 1, 1.4, INK, 0)
        + L('M 57 49 Q 60 50.5 63 49', '#ffffff', 1.3, 'opacity=".7"')
        + (R.beard ? P('M 55.5 49.5 Q 55 56 58 ' + n1(58 + 2 * R.beard) + ' Q 60 55 62 ' + n1(58 + 2 * R.beard) + ' Q 65 56 64.5 49.5 Z', c.mane, 1.8) : '')
        + shade('M 70 23 C 73.5 28 73 34 69 38 C 71.5 33 72 28 70 23 Z') + shine('M 50 28 C 50.5 24.5 53 22 56.5 21', 2, 0.55)
        + eyes(54, 66, 29.5, R.kid ? 3.4 : 3, R.lashes)
        + blush(50.5, 35.5) + blush(69.5, 35.5)
        + (R.flower ? flower(74, 12.5, 0.95) : '');
    return {
      shadow: 19, body, head, headPiv: [60, 44],
      neck: { base: [60, back ? 54 : 57], w: 14, col: c.body, attach: [60, back ? 38 : 40] },
      graze: { dx: 0, dy: 26, rot: 0, scale: 0.92 },
      tail: back ? { root: [60, 58], end: [60, 75], w: 3, tuft: P('M -3 -1 Q -4.6 6 0 11 Q 4.6 6 3 -1 Z', c.tuft, 1.6) } : null,
      legs: back ? [
        { hip: [52, 70], l1: 8.5, l2: 8.5, w: 6.6 }, { hip: [68, 70], l1: 8.5, l2: 8.5, w: 6.6 },
        { hip: [50, 72], l1: 7.8, l2: 7.8, w: 7.2 }, { hip: [70, 72], l1: 7.8, l2: 7.8, w: 7.2 }
      ] : [
        { hip: [53, 72], l1: 7.8, l2: 7.8, w: 7.2 }, { hip: [67, 72], l1: 7.8, l2: 7.8, w: 7.2 },
        { hip: [50, 70], l1: 8.5, l2: 8.5, w: 6.6 }, { hip: [70, 70], l1: 8.5, l2: 8.5, w: 6.6 }
      ],
      footY: 87.4, foot: (col, far) => hoofFront(far, c.hoof),
      top: [60, 6]
    };
  }

  /* ── Krokodil ──────────────────────────────────────────────── */
  const crocFoot = col => E(1.4, 0.3, 4.4, 2.4, col, 2.2) + C(4.2, 1.6, 0.7, INK, 0) + C(1.8, 2.3, 0.7, INK, 0) + C(-0.8, 2.1, 0.7, INK, 0);
  const crocFootF = col => E(0, 0.3, 4.4, 2.4, col, 2.2) + C(-2.4, 1.7, 0.7, INK, 0) + C(0, 2.3, 0.7, INK, 0) + C(2.4, 1.7, 0.7, INK, 0);
  function crocSide(R, c) {
    // Kopf; der Rumpf wird jedes Bild aus der Wirbelsäule gerechnet
    const head = G('mouth', P('M 82 81 L 104 81 L 104 84.5 L 84 85.5 Z', c.mouth, 0), 'display="none"')
      + G('jaw', P('M 82 80.5 C 79 87 85 88 92 87.2 L 105 86 C 108.5 85.4 108.5 81.2 105 81 Z', c.jaw, 2.4)
        + P('M 87 84.6 L 88.2 82.6 L 89.4 84.5 L 90.6 82.4 L 91.8 84.4 L 93 82.3 L 94.2 84.3 L 95.4 82.2 L 96.6 84.2 L 97.8 82.2 L 99 84.1 Z', c.teeth, 1), 'data-piv="81 82"')
      + P('M 73 74.5 C 74 66 84 65 90 68.5 C 96 70 103 70.5 107 72 C 112 73.5 112 80 107.5 81.4 C 99 82.8 88 83 79 82.6 C 74.5 82.4 72.5 79 73 74.5 Z', c.body, 2.6)
      + P('M 85.5 81.6 L 87 84.2 L 88.5 81.6 L 90 84.2 L 91.5 81.6 L 93 84.2 L 94.5 81.5 L 96 84 L 97.5 81.4 L 99 83.8 L 100.5 81.3 L 102 83.5 L 103.5 81.2 Z', c.teeth, 1.1)
      + C(106.5, 71.6, 2.6, c.body, 2) + C(107, 71, 0.7, INK, 0)
      + shine('M 93 70.8 C 97 70.8 101 71.4 104 72.3', 1.8, 0.55)
      + C(77, 68.8, 5, c.body, 2.4)
      + C(83.5, 67.6, 6, c.body, 2.4) + shine('M 80 65.6 C 80.6 63.6 82 62.6 83.8 62.3', 1.6, 0.6)
      + eyes(null, 84.6, 67.4, R.kid ? 3.4 : 3, R.lashes)
      + '<g data-k="eye2">' + E(77.6, 68.6, 2, 2.6, INK, 0) + hl(77, 67.6, 0.8, 0.9) + '</g>'
      + blush(94, 77.4, 0.95)
      + (R.flower ? flower(73.5, 66, 0.95) : '');
    return {
      shadow: 40, croc: true, head, headPiv: [74, 80],
      spine: [[8, 85.5, 1.2], [18, 84, 3], [29, 82.5, 5], [41, 80.5, 7.2], [53, 79.5, 8.8], [64, 79, 9.4], [75, 79, 9]],
      legs: [
        { hip: [67, 83], l1: 4.4, l2: 4.4, w: 6.4, bend: -1, home: 2 },
        { hip: [63, 85], l1: 4.4, l2: 4.4, w: 6.8, bend: -1, home: 2 },
        { hip: [41, 83], l1: 4.4, l2: 4.4, w: 6.4, bend: 1, home: -1 },
        { hip: [37, 85], l1: 4.4, l2: 4.4, w: 6.8, bend: 1, home: -1 }
      ],
      footY: 89.4, foot: crocFoot, top: [84, 58]
    };
  }
  function crocFront(R, c, back) {
    const body = back
      ? P('M 40 78 C 40 70 49 67 60 67 C 71 67 80 70 80 78 C 80 85 71 88 60 88 C 49 88 40 85 40 78 Z', c.body, 2.6)
        + [52, 60, 68].map(x => C(x, 71.5, 2.2, c.scute, 1.3) + C(x, 77, 2.2, c.scute, 1.3)).join('')
        + shine('M 45 74 C 46 71.5 48.5 70 51.5 69.4', 1.8, 0.55)
      : P('M 45 76 C 45 70 51 66.5 60 66.5 C 69 66.5 75 70 75 76 C 75 83 69 86 60 86 C 51 86 45 83 45 76 Z', c.body, 2.6)
        + [53, 60, 67].map(x => C(x, 68.2, 2, c.scute, 1.3)).join('');
    const head = back
      ? E(60, 68, 12, 6.4, c.body, 2.4) + C(51.5, 64.5, 4.4, c.body, 2.2) + C(68.5, 64.5, 4.4, c.body, 2.2)
        + (R.flower ? flower(60, 62.5, 0.95) : '')
      : G('mouth', P('M 51 82 L 69 82 L 68 90 L 52 90 Z', c.mouth, 0), 'display="none"')
        + G('jaw', P('M 49.5 81 Q 48 96.5 60 97 Q 72 96.5 70.5 81 Z', c.jaw, 2.4), 'data-piv="60 84"')
        + P('M 43 75.5 C 43 69.5 51 67.5 60 67.5 C 69 67.5 77 69.5 77 75.5 C 77 78.5 73 80 70.5 81 L 69.4 91 C 68.8 95.6 51.2 95.6 50.6 91 L 49.5 81 C 47 80 43 78.5 43 75.5 Z', c.body, 2.6)
        + [82.5, 85.4, 88.3, 91.2].map(y => P('M 50.2 ' + y + ' l -1.8 1 l 1.9 1 Z', c.teeth, 0.9) + P('M 69.8 ' + y + ' l 1.8 1 l -1.9 1 Z', c.teeth, 0.9)).join('')
        + C(57.4, 91.6, 0.9, INK, 0) + C(62.6, 91.6, 0.9, INK, 0)
        + shine('M 56 72 C 58 71 61 71 63.5 71.6', 1.6, 0.5)
        + C(51, 66.5, 6, c.body, 2.4) + C(69, 66.5, 6, c.body, 2.4)
        + shine('M 47.4 64.6 C 48 62.6 49.4 61.6 51.2 61.3', 1.6, 0.6) + shine('M 65.4 64.6 C 66 62.6 67.4 61.6 69.2 61.3', 1.6, 0.6)
        + eyes(51, 69, 66.4, R.kid ? 3.3 : 3, R.lashes)
        + blush(47, 76) + blush(73, 76)
        + (R.flower ? flower(60, 63, 0.95) : '');
    return {
      shadow: 24, croc: true, body, head, headPiv: [60, 80],
      tail: back ? { root: [60, 84], end: [60, 97], w: 6.5, tuft: '' } : { root: [66, 74], end: [94, 79], w: 6, tuft: '', behind: true },
      legs: back ? [
        { hip: [47, 75], l1: 4.4, l2: 4.4, w: 6.4, splay: -1 }, { hip: [73, 75], l1: 4.4, l2: 4.4, w: 6.4, splay: 1 },
        { hip: [45, 79], l1: 4.4, l2: 4.4, w: 6.8, splay: -1 }, { hip: [75, 79], l1: 4.4, l2: 4.4, w: 6.8, splay: 1 }
      ] : [
        { hip: [45, 79], l1: 4.4, l2: 4.4, w: 6.8, splay: -1 }, { hip: [75, 79], l1: 4.4, l2: 4.4, w: 6.8, splay: 1 },
        { hip: [47, 75], l1: 4.4, l2: 4.4, w: 6.4, splay: -1 }, { hip: [73, 75], l1: 4.4, l2: 4.4, w: 6.4, splay: 1 }
      ],
      footY: 89.4, foot: crocFootF, top: [60, 56]
    };
  }

  /* ══════════════════════════════════════════════════════════════
     Die Arten: Farben und Rollen
     ══════════════════════════════════════════════════════════════
     k = Größe in der Savanne (Elefant groß, Löwe klein);
     Rollen: s = Größe in der Familie, head = Kopf größer (Kind),
     lashes/flower = Mama, mane/tusk/horn/beard = Papa.            */
  const SPECIES = {
    lion: {
      name: 'Löwen', k: 0.85,
      roles: {
        papa: { title: 'Löwe', s: 1, mane: 1 },
        mama: { title: 'Löwin', s: 0.88, lashes: 1, flower: 1 },
        kind: { title: 'Löwenjunges', s: 0.58, kid: 1, spots: 1, tuft: 1, head: 1.14 }
      },
      col: { body: '#f6b950', light: '#ffeac2', mane: '#c4642a', mane2: '#e38b3b', nose: '#e8607a', earIn: '#ffb3a3', tuft: '#b55a24', spot: '#e3a046' },
      kidCol: { body: '#f9c870', mane2: '#e9a050', tuft: '#d08a3c' },
      views: { side: lionSide, front: (R, c) => lionFront(R, c, false), back: (R, c) => lionFront(R, c, true) },
      gait: { walkV: 26, walkF: 1.25, walkB: 0.62, run: 'gallop', runV: 88, runF: 2.6, runB: 0.4, liftW: 4.5, liftR: 7, bob: 0.9, rock: 3.5, hop: 3 },
      eatLie: true, food: 'meat'
    },
    elephant: {
      name: 'Elefanten', k: 1.25,
      roles: {
        papa: { title: 'Elefantenbulle', s: 1, tusk: 1, sleepStand: 1 },
        mama: { title: 'Elefantenkuh', s: 0.86, tusk: 0.5, sleepStand: 1, lashes: 1, flower: 1 },
        kind: { title: 'Elefantenkalb', s: 0.55, kid: 1, head: 1.12, trunkLen: 32 }
      },
      col: { body: '#aab7cd', ear: '#a1aec5', earIn: '#f7b6c8', tusk: '#fff6e3', nail: '#fff3dc', tuft: '#5d6577' },
      kidCol: { body: '#b8c3d7', ear: '#aebbd0' },
      views: { side: eleSide, front: (R, c) => eleFront(R, c, false), back: (R, c) => eleFront(R, c, true) },
      gait: { walkV: 20, walkF: 1.0, walkB: 0.62, run: 'amble', runV: 56, runF: 1.9, runB: 0.5, liftW: 4, liftR: 6, bob: 0.9, rock: 1.2, hop: 1.4 },
      food: 'grass'
    },
    zebra: {
      name: 'Zebras', k: 1,
      roles: {
        papa: { title: 'Zebrahengst', s: 1 },
        mama: { title: 'Zebrastute', s: 0.92, lashes: 1, flower: 1 },
        kind: { title: 'Zebrafohlen', s: 0.62, kid: 1, head: 1.12 }
      },
      col: { body: '#fdfcf7', stripe: '#2a2638', muzzle: '#5e5973', hoof: '#3a3550', tuft: '#2a2638', earIn: '#ffc2cf' },
      kidCol: { stripe: '#8b5c3d', muzzle: '#8a6a58', tuft: '#8b5c3d' },
      views: { side: zebraSide, front: (R, c, u) => zebraFront(R, c, u, false), back: (R, c, u) => zebraFront(R, c, u, true) },
      gait: { walkV: 26, walkF: 1.3, walkB: 0.62, run: 'gallop', runV: 92, runF: 2.7, runB: 0.4, liftW: 5, liftR: 8, bob: 0.9, rock: 3.5, hop: 3.5 },
      graze: true, food: 'grass'
    },
    gnu: {
      name: 'Gnus', k: 0.98,
      roles: {
        papa: { title: 'Gnubulle', s: 1, horn: 1, beard: 1 },
        mama: { title: 'Gnukuh', s: 0.92, horn: 0.72, beard: 0.6, lashes: 1, flower: 1 },
        kind: { title: 'Gnukalb', s: 0.62, kid: 1, head: 1.12, horn: 0.28 }
      },
      col: { body: '#8794b0', face: '#a6b1c8', stripe: '#6b7895', mane: '#3b3752', horn: '#5b566f', muzzle: '#4d4864', hoof: '#3b3752', tail: '#3b3752', tuft: '#3b3752', earIn: '#d7b0c0' },
      kidCol: { body: '#d9a26a', face: '#e6b884', stripe: null, mane: '#9a6438', horn: '#7a5236', muzzle: '#8a5c3c', tail: '#b07a4a', tuft: '#9a6438' },
      views: { side: gnuSide, front: (R, c) => gnuFront(R, c, false), back: (R, c) => gnuFront(R, c, true) },
      gait: { walkV: 26, walkF: 1.3, walkB: 0.62, run: 'gallop', runV: 92, runF: 2.7, runB: 0.4, liftW: 5, liftR: 8, bob: 0.9, rock: 3.5, hop: 3.5 },
      graze: true, food: 'grass'
    },
    croc: {
      name: 'Krokodile', k: 0.95,
      roles: {
        papa: { title: 'Krokodil-Männchen', s: 1 },
        mama: { title: 'Krokodil-Weibchen', s: 0.86, lashes: 1, flower: 1 },
        kind: { title: 'Jungtier', s: 0.55, kid: 1, head: 1.15, bands: 1 }
      },
      col: { body: '#72c45c', jaw: '#cde69c', belly: '#dff0a8', scute: '#5aa84d', teeth: '#ffffff', mouth: '#ff8fa3' },
      kidCol: { body: '#a2d46c', jaw: '#e4f0b4', scute: '#79b34c', band: '#6a9e42' },
      views: { side: crocSide, front: (R, c) => crocFront(R, c, false), back: (R, c) => crocFront(R, c, true) },
      gait: { walkV: 18, walkF: 1.15, walkB: 0.65, walkPat: 'trot', run: 'gallop', runV: 62, runF: 2.8, runB: 0.42, liftW: 2.6, liftR: 4.5, bob: 0.4, rock: 2, hop: 2 },
      food: 'fish'
    }
  };
  const ORDER = ['lion', 'elephant', 'zebra', 'gnu', 'croc'];
  const ROLES = [['papa', 'Papa'], ['mama', 'Mama'], ['kind', 'Kind']];
  const MODES = { idle: {}, walk: { walk: 1 }, run: { run: 1 }, eat: { eat: 1 }, sleep: { sleep: 1 } };

  /* ── Ein Tier anlegen ──────────────────────────────────────── */
  function create(key, role) {
    const sp = SPECIES[key];
    const R = Object.assign({ head: 1 }, sp.roles[role]);
    const col = Object.assign({}, sp.col, role === 'kind' && sp.kidCol ? sp.kidCol : {});
    return {
      key, role, D: sp, R, col, uid: ++UID,
      s: R.s * sp.k, cardS: R.s,
      x: 0, z: 0, h: 0, mode: 'idle',
      w: { walk: 0, run: 0, eat: 0, sleep: 0 },
      t: Math.random() * 20, phase: Math.random(), freq: sp.gait.walkF, v: 0, road: 0,
      blinkT: 1 + Math.random() * 3, blinking: false, seed: Math.random(),
      g: null, view: null, el: null
    };
  }

  function update(A, dt) {
    A.t += dt;
    const tg = MODES[A.mode] || MODES.idle;
    for (const k of ['walk', 'run', 'eat', 'sleep']) {
      const rate = k === 'sleep' ? 1.8 : 3.4;
      A.w[k] += ((tg[k] || 0) - A.w[k]) * (1 - Math.exp(-rate * dt));
    }
    const Gt = A.D.gait, w = A.w, mw = w.walk + w.run, fs = 1 / Math.sqrt(A.R.s);
    A.freq = (mw > 1e-3 ? (w.walk * Gt.walkF + w.run * Gt.runF) / mw : Gt.walkF) * fs;
    A.v = (w.walk * Gt.walkV + w.run * Gt.runV) * fs;
    A.phase = (A.phase + dt * A.freq) % 1;
    A.road += A.v * dt;
    A.blinkT -= dt;
    if (A.blinkT < 0) { A.blinking = true; if (A.blinkT < -0.14) { A.blinking = false; A.blinkT = 2 + Math.random() * 4; } }
  }

  /* ── Ansicht wählen und aufbauen ───────────────────────────── */
  function pickView(A) {
    const vy = Math.sin(A.h), vx = Math.cos(A.h), cur = A.view, band = 0.06;
    if (cur === 'front' && vy > 0.78 - band) return 'front';
    if (cur === 'back' && vy < -0.78 + band) return 'back';
    if (vy > 0.78 + (cur ? band : 0)) return 'front';
    if (vy < -0.78 - (cur ? band : 0)) return 'back';
    if (cur === 'side' && vx > -0.1) return 'side';
    if (cur === 'sideL' && vx < 0.1) return 'sideL';
    return vx >= 0 ? 'side' : 'sideL';
  }
  function mount(A, parent) {
    A.g = document.createElementNS(NS, 'g');
    A.g.setAttribute('class', 'tier');
    parent.appendChild(A.g);
    return A.g;
  }
  function legEls(V, idx, base, col) {
    return idx.map(i => {
      const k = LEGK[i], lg = V.legs[i], far = FAR[base].indexOf(i) >= 0;
      const c = far ? darker(col, 0.86) : col;
      return '<g data-k="' + k + '">' + tube(k, c, lg.w)
        + (V.legBands ? bands(k + 'S', V.legBands, lg.w, '2 2.6') : '')
        + G(k + 'P', V.foot(c, far)) + '</g>';
    }).join('');
  }
  function build(A, view) {
    const base = view === 'sideL' ? 'side' : view;
    const V = A.D.views[base](A.R, A.col, A.uid);
    const c = A.col, far = FAR[base], near = [0, 1, 2, 3].filter(i => far.indexOf(i) < 0);
    const farLegs = legEls(V, far, base, c.body), nearLegs = legEls(V, near, base, c.body);
    const headG = '<g data-k="rootB"><g data-k="head">' + V.head + '</g></g>';
    let s = '<g data-k="main">' + shadowEl(V.shadow) + '<g data-k="mark"></g>';
    if (V.croc && base === 'side') {
      s += farLegs
        + '<g data-k="rootA"><path data-k="cbF" fill="' + c.body + '"/><path data-k="cbB" fill="' + c.belly + '"/>'
        + (A.R.bands ? '<path data-k="cbN" fill="none" stroke="' + c.band + '" stroke-width="5" stroke-dasharray="3 5"/>' : '')
        + '<g data-k="scutes"></g><path data-k="cbO" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/></g>'
        + nearLegs + headG;
    } else {
      const tailT = V.tail ? '<g data-k="tail">' + tube('tl', c.tail || c.body, V.tail.w) + G('tlT', V.tail.tuft) + '</g>' : '';
      let neck = '';
      if (V.neck) {
        const nk = V.neck;
        neck = '<g data-k="neck">' + tube('nk', nk.col, nk.w)
          + (nk.stripe ? bands('nkS', nk.stripe, nk.w - 1, '2.8 4.2') : '')
          + (nk.mane === 'zebra' ? tube('mn', nk.maneCol, 4.6) + bands('mnS', c.body, 4.6, '2.4 2.6') : '')
          + (nk.mane === 'gnu' ? '<path data-k="mnO" fill="none" stroke="' + INK + '" stroke-width="8.4" stroke-linecap="round" stroke-dasharray="0.1 4.2"/><path data-k="mnF" fill="none" stroke="' + nk.maneCol + '" stroke-width="5.4" stroke-linecap="round" stroke-dasharray="0.1 4.2"/>' : '')
          + (nk.beard ? '<path data-k="bdO" fill="none" stroke="' + INK + '" stroke-width="7.4" stroke-linecap="round" stroke-dasharray="0.1 4"/><path data-k="bdF" fill="none" stroke="' + nk.beard + '" stroke-width="4.6" stroke-linecap="round" stroke-dasharray="0.1 4"/>' : '')
          + '</g>';
      }
      // Reihenfolge: was weiter weg ist, zuerst
      if (base === 'back') {
        s += headG + farLegs + '<g data-k="rootA">' + neck + V.body + tailT + '</g>' + nearLegs;
      } else if (base === 'front') {
        s += '<g data-k="rootA">' + (V.tail ? tailT : '') + '</g>' + farLegs
          + '<g data-k="rootA2">' + V.body + neck + '</g>' + nearLegs + headG;
      } else {
        s += farLegs + '<g data-k="rootA">' + tailT + neck + V.body + '</g>' + nearLegs + headG;
      }
    }
    s += '<g data-k="food"></g><g data-k="skel"></g></g><g data-k="fx"></g>';
    A.g.innerHTML = s;
    A.el = {};
    A.g.querySelectorAll('[data-k]').forEach(e => { A.el[e.getAttribute('data-k')] = e; });
    A.ears = ['earL', 'earR', 'ear'].filter(k => A.el[k]).map(k => ({ k, e: A.el[k], piv: A.el[k].getAttribute('data-piv') }));
    A.V = V; A.view = view; A.base = base; A.skelOn = null;
  }

  /* ══════════════════════════════════════════════════════════════
     Jedes Bild: Gelenke stellen
     ══════════════════════════════════════════════════════════════ */
  function setD(e, d) { if (e && e._d !== d) { e._d = d; e.setAttribute('d', d); } }
  function setT(e, t) { if (e && e._t !== t) { e._t = t; e.setAttribute('transform', t); } }
  function show(e, on) { if (e) { const v = on ? 'inline' : 'none'; if (e._v !== v) { e._v = v; e.setAttribute('display', v); } } }
  function setHTML(e, s) { if (e && e._s !== s) { e._s = s; e.innerHTML = s; } }
  const seg = (a, b) => 'M' + n1(a.x) + ' ' + n1(a.y) + ' L' + n1(b.x) + ' ' + n1(b.y);

  function draw(A, view) {
    const want = pickView(A);
    if (want !== A.view) build(A, want);
    const V = A.V, el = A.el, w = A.w, t = A.t, R = A.R, D = A.D;
    const mir = A.view === 'sideL' ? -1 : 1, S = view.S;
    setT(el.main, 'translate(' + n1(view.ox) + ' ' + n1(view.oy) + ') scale(' + Math.round(mir * S * 1000) / 1000 + ' ' + Math.round(S * 1000) / 1000 + ') translate(-60 -92)');
    const side = A.base === 'side';
    const gt = gait(A), ph = A.phase;

    /* Grundstellung: liegen (Schlaf; Löwe auch beim Fressen), grasen */
    const lie = clamp((R.sleepStand ? 0 : w.sleep) + (D.eatLie ? w.eat : 0), 0, 1);
    const graze = D.graze ? w.eat : 0;
    const legLen = V.legs[1].l1 + V.legs[1].l2;
    const drop = lie * legLen * (V.croc ? 0.45 : 0.78) + (R.sleepStand ? w.sleep * 1.2 : 0);
    const breathe = Math.sin(t * TAU * (w.sleep > 0.5 ? 0.22 : 0.3)) * (w.sleep > 0.5 ? 0.8 : 0.4);
    const bob = D.gait.bob * w.walk * Math.cos(ph * TAU * 2) - D.gait.hop * w.run * (0.5 + 0.5 * Math.sin(TAU * ph + 1.2));
    const rock = side ? D.gait.rock * w.run * Math.sin(TAU * (ph + 0.15)) : 0;
    const sway = side ? 0 : (w.walk * 1.6 + w.run * 2.4) * Math.sin(TAU * ph);
    const cx = side ? 58 : 60, cy = 64, rdy = drop + bob - breathe * 0.3, rr = -rock + sway;
    const rootT = 'translate(0 ' + n1(rdy) + ') rotate(' + n1(rr) + ' ' + cx + ' ' + cy + ')';
    setT(el.rootA, rootT); setT(el.rootA2, rootT); setT(el.rootB, rootT);
    const rootP = p => tf(p, [cx, cy], rr, 0, rdy);         // Rumpf-Koordinaten → Zeichnung
    const rootQ = q => rootP([q.x, q.y]);

    /* Kopf */
    const hp = V.headPiv;
    let hRot = side ? (Math.sin(t * 0.9) * 3 * (1 - gt.m) + w.walk * 2.5 * Math.sin(ph * TAU * 2 + 0.6) - w.run * 6) : 0;
    let hdx = 0, hdy = side ? 0 : w.walk * 0.8 * Math.sin(ph * TAU * 2);
    let hsc = R.head || 1;
    if (graze > 0 && V.graze) { hRot += V.graze.rot * graze; hdx += V.graze.dx * graze; hdy += V.graze.dy * graze; hsc *= lerp(1, V.graze.scale || 1, graze); }
    if (lie > 0) { hRot += (side ? 10 : 0) * w.sleep; hdy += (V.croc ? 1 : 3) * w.sleep; }
    if (R.sleepStand) { hRot += side ? 7 * w.sleep : 0; hdy += 2.5 * w.sleep; }
    if (D.eatLie && w.eat > 0) { hRot += (side ? 14 : 0) * w.eat; hdy += 5 * w.eat * (side ? 0.4 : 1); }
    let open = 0, snapE = 0;
    if (V.croc && w.eat > 0) {
      snapE = (t * 0.42) % 1;
      open = (snapE < 0.62 ? smooth(snapE / 0.62) : snapE < 0.68 ? 1 - smooth((snapE - 0.62) / 0.06) : 0) * w.eat;
      hRot += side ? -10 * open : 0;
      hdy += side ? 0 : -2 * open;
    }
    setT(el.head, 'translate(' + n1(hdx) + ' ' + n1(hdy) + ') rotate(' + n1(hRot) + ' ' + hp[0] + ' ' + hp[1] + ')'
      + (hsc !== 1 ? ' translate(' + hp[0] + ' ' + hp[1] + ') scale(' + Math.round(hsc * 100) / 100 + ') translate(' + -hp[0] + ' ' + -hp[1] + ')' : ''));
    const headP = p => tf(p, hp, hRot, hdx, hdy, hsc);      // Kopf-Koordinaten → Rumpf

    /* Gesicht, Ohren */
    const st = w.sleep > 0.5 || A.blinking ? 'c' : (w.eat > 0.5 && Math.sin(t * 1.7) > 0.2 ? 'h' : 'o');
    show(el.eo, st === 'o'); show(el.ec, st === 'c'); show(el.eh, st === 'h');
    show(el.eye2, st === 'o');
    const chew = w.eat > 0.5 && Math.sin(t * 9) > 0;
    show(el.mN, !chew); show(el.mO, chew);
    const flick = Math.max(0, Math.sin(t * 1.3 + A.seed * 6) - 0.92) * 120;
    const ele = A.key === 'elephant';
    A.ears.forEach(({ k, e, piv }) => {
      let a = (k === 'earR' ? -1 : 1) * flick * 0.25;
      if (ele) a = k === 'ear' ? Math.sin(t * 1.5) * 6 * (1 - w.sleep) + w.run * 10
        : (k === 'earL' ? 1 : -1) * (Math.sin(t * 1.5) * 5 * (1 - w.sleep) - w.run * 8);
      setT(e, 'rotate(' + n1(a) + ' ' + piv + ')');
    });

    /* Beine */
    const bones = [];
    V.legs.forEach((lg, i) => {
      const k = LEGK[i], H = rootP(lg.hip), fo = gt.foot(i);
      let F;
      if (side) {
        F = { x: lg.hip[0] + (lg.home || 0) + fo.x + (graze && i < 2 ? 1.5 * graze : 0), y: V.footY - fo.y };
        if (lie > 0) {
          const tx = i < 2 ? (V.sphinx || V.croc ? H.x + 9 : H.x + 1.5) : H.x + 3;
          F = { x: lerp(F.x, tx, lie), y: lerp(F.y, V.footY, lie) };
        }
      } else {
        F = { x: lg.hip[0] + (lg.splay || 0) * 5, y: V.footY - Math.max(0, fo.y) * 0.9 };
        if (lie > 0) F = { x: lerp(F.x, H.x + (lg.splay || 0) * 4, lie), y: lerp(F.y, Math.min(V.footY, H.y + 2), lie) };
      }
      const bend = side ? (lg.bend || 1) : (lg.splay ? -lg.splay * 0.6 : (lg.hip[0] < 60 ? 0.2 : -0.2));
      const leg = ik(H, F, lg.l1, lg.l2, bend);
      F = leg.F;
      const d = seg(H, leg.K) + ' L' + n1(F.x) + ' ' + n1(F.y);
      setD(el[k + 'O'], d); setD(el[k + 'F'], d); setD(el[k + 'S'], d);
      show(el[k], side || V.croc || lie < 0.6);
      setT(el[k + 'P'], 'translate(' + n1(F.x) + ' ' + n1(F.y) + ')');
      bones.push([H, leg.K], [leg.K, F]);
    });

    /* Schwanz (in Rumpf-Koordinaten) */
    if (V.tail && el.tlO) {
      const tl = V.tail;
      const swing = Math.sin(t * 1.8) * (1 + w.walk) * 4 + w.run * Math.sin(TAU * ph) * 4;
      let ex = tl.end[0], ey = tl.end[1];
      if (side) {
        ex += swing * 0.4 - w.run * 6; ey += -w.run * 8;
        if (lie > 0) { ex = lerp(ex, tl.root[0] - 16, lie); ey = lerp(ey, V.footY - drop - 1, lie); }
      } else ex += V.croc ? swing * 0.4 : swing;
      const r0 = { x: tl.root[0], y: tl.root[1] }, e2 = { x: ex, y: ey };
      const ctrl = side ? { x: lerp(tl.root[0], ex, 0.25) - 2, y: lerp(tl.root[1], ey, 0.8) + 3 } : { x: lerp(tl.root[0], ex, 0.2) + swing * 0.3, y: lerp(tl.root[1], ey, 0.6) };
      const d = 'M' + n1(r0.x) + ' ' + n1(r0.y) + ' Q' + n1(ctrl.x) + ' ' + n1(ctrl.y) + ' ' + n1(e2.x) + ' ' + n1(e2.y);
      setD(el.tlO, d); setD(el.tlF, d);
      setT(el.tlT, 'translate(' + n1(e2.x) + ' ' + n1(e2.y) + ') rotate(' + n1(Math.atan2(e2.y - ctrl.y, e2.x - ctrl.x) / DEG - 90) + ')');
      bones.push([rootQ(r0), rootQ(ctrl)], [rootQ(ctrl), rootQ(e2)]);
    }

    /* Hals (Zebra, Gnu): vom Rumpf zum Kopfansatz */
    if (V.neck && el.nkO) {
      const nk = V.neck, b0 = { x: nk.base[0], y: nk.base[1] };
      const a1 = headP(nk.attach || [hp[0] + 1, hp[1] - 2]);
      const d = seg(b0, a1);
      setD(el.nkO, d); setD(el.nkF, d); setD(el.nkS, d);
      const dx = a1.x - b0.x, dy = a1.y - b0.y, ln = Math.hypot(dx, dy) || 1;
      let nx = dy / ln, ny = -dx / ln;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const off = nk.w / 2 + 0.4;
      if (el.mnO) {
        const md = seg({ x: b0.x + nx * off - dx * 0.05, y: b0.y + ny * off - dy * 0.05 }, { x: a1.x + nx * off * 0.8, y: a1.y + ny * off * 0.8 });
        setD(el.mnO, md); setD(el.mnF, md); setD(el.mnS, md);
      }
      if (el.bdO) {
        const bd = seg({ x: lerp(b0.x, a1.x, 0.35) - nx * off, y: lerp(b0.y, a1.y, 0.35) - ny * off }, { x: lerp(b0.x, a1.x, 0.92) - nx * off, y: lerp(b0.y, a1.y, 0.92) - ny * off });
        setD(el.bdO, bd); setD(el.bdF, bd);
      }
      bones.push([rootQ(b0), rootQ(a1)]);
    }

    /* Rüssel (Elefant): Kette in Kopf-Koordinaten */
    let trunkTip = null, trunkCurl = 0;
    if (V.trunk && el.trAO) {
      const tr = V.trunk, n = tr.n, sl = tr.len / n;
      const e = (t * 0.32) % 1;
      const curlW = e < 0.42 ? 0 : e < 0.66 ? smooth((e - 0.42) / 0.24) : e < 0.84 ? 1 : 1 - smooth((e - 0.84) / 0.16);
      const eatW = w.eat;
      const pts = [{ x: tr.root[0], y: tr.root[1] }];
      if (tr.front) {
        // von vorn: hängt herab, die Spitze rollt sich nach oben
        const lift = eatW * curlW;
        for (let k = 1; k <= n; k++) {
          const u = k / n, sw = Math.sin(t * 1.2 - k * 0.4) * 1.6 * (1 - w.sleep) * u;
          pts.push({ x: tr.root[0] + sw + lift * Math.sin(u * Math.PI) * 4, y: tr.root[1] + sl * k * lerp(1, 0.42, lift * u) - (u > 0.75 ? (u - 0.75) * 10 * (1 - lift) : 0) });
        }
      } else {
        let th = (tr.a0 - 6 * Math.sin(t * 0.7) * (1 - gt.m) - 6 * w.walk * Math.sin(TAU * ph)) * DEG;
        th = lerp(th, lerp(78, 100, curlW) * DEG, eatW);
        th = lerp(th, 84 * DEG, w.sleep);
        let p = pts[0];
        for (let k = 0; k < n; k++) {
          const idle = (k >= n - 2 ? -24 : -1) + 3 * Math.sin(t * 1.1 - k * 0.5) * (1 - w.sleep);
          const kap = lerp(lerp(idle, k >= n - 2 ? -6 : 0, w.sleep), lerp(-1, k < 2 ? -8 : -40, curlW), eatW);
          th += kap * DEG;
          p = { x: p.x + Math.cos(th) * sl, y: Math.min(p.y + Math.sin(th) * sl, GROUND - 4 - hdy - rdy) };
          pts.push(p);
        }
      }
      const cut = Math.ceil(n * 0.55), a = curve(pts.slice(0, cut + 1)), all = curve(pts);
      setD(el.trAO, a); setD(el.trAF, a); setD(el.trBO, all); setD(el.trBF, all); setD(el.trW, all);
      const lp = pts[n], pp = pts[n - 1];
      setT(el.trTip, 'translate(' + n1(lp.x) + ' ' + n1(lp.y) + ') rotate(' + n1(Math.atan2(lp.y - pp.y, lp.x - pp.x) / DEG - 90) + ')');
      trunkTip = rootQ(headP([lp.x, lp.y])); trunkCurl = curlW * eatW;
      for (let k = 0; k < n; k++) bones.push([rootQ(headP([pts[k].x, pts[k].y])), rootQ(headP([pts[k + 1].x, pts[k + 1].y]))]);
    }

    /* Krokodil: Rumpf aus der Wirbelsäule (Rumpf-Koordinaten) */
    if (V.croc && side) {
      const sp = V.spine, und = w.walk * 1.4 + w.run * 2.2;
      const pts = sp.map(([x, y, r], i) => {
        const tail = (sp.length - 1 - i) / (sp.length - 1);
        const wave = und * Math.sin(TAU * ph + i * 0.9) * tail + Math.sin(t * 0.9 + i * 0.7) * 0.8 * tail * (1 - gt.m);
        return { x, y: Math.min(y + wave, GROUND - rdy - r * 0.85), r: r + (i > 3 ? breathe * 0.3 : 0) };
      });
      const hd = headP([V.headPiv[0] + 2, V.headPiv[1] - 1]);
      const top = pts.map(p => ({ x: p.x, y: p.y - p.r })), bot = pts.map(p => ({ x: p.x, y: p.y + p.r * 0.85 })).reverse();
      top.push({ x: hd.x + 3, y: hd.y - 8.5 });
      bot.unshift({ x: hd.x + 3, y: hd.y + 6.5 });
      const outline = curve(top) + ' L' + curve(bot).slice(1) + ' Z';
      setD(el.cbF, outline); setD(el.cbO, outline);
      const bel = pts.map(p => ({ x: p.x, y: p.y + p.r * 0.35 })).concat([{ x: hd.x + 3, y: hd.y + 3 }]);
      const belB = pts.map(p => ({ x: p.x, y: p.y + p.r * 0.84 })).concat([{ x: hd.x + 3, y: hd.y + 6.3 }]).reverse();
      setD(el.cbB, curve(bel) + ' L' + curve(belB).slice(1) + ' Z');
      if (el.cbN) setD(el.cbN, curve(pts.map(p => ({ x: p.x, y: p.y - p.r * 0.15 }))));
      let sc = '';
      for (let i = 1; i < pts.length; i++) for (const u of [0.25, 0.75]) {
        const r = lerp(pts[i - 1].r, pts[i].r, u);
        if (r > 2) sc += C(lerp(pts[i - 1].x, pts[i].x, u), lerp(top[i - 1].y, top[i].y, u) + 0.6, Math.max(1.4, r * 0.24), A.col.scute, 1.2);
      }
      setHTML(el.scutes, sc);
      for (let i = 1; i < pts.length; i++) bones.push([rootQ(pts[i - 1]), rootQ(pts[i])]);
      bones.push([rootQ(pts[pts.length - 1]), rootQ(hd)]);
    }
    if (V.croc && el.jaw) {
      const o2 = open + (w.sleep > 0.5 ? 0.25 : 0);
      setT(el.jaw, side ? 'rotate(' + n1(o2 * 26) + ' 81 82)' : 'translate(0 ' + n1(o2 * 4) + ')');
      show(el.mouth, o2 > 0.08);
    }

    /* Futter */
    let food = '';
    if (w.eat > 0.03) {
      const op = ' opacity="' + Math.round(w.eat * 100) / 100 + '"';
      if (D.food === 'grass') {
        const gx = side ? (ele ? 108 : 98) : 60, gy = side ? 92 : 95;
        food = '<g' + op + '>' + [-3, 0, 3].map((k, i) => L('M ' + (gx + k) + ' ' + gy + ' Q ' + n1(gx + k * 1.4 + Math.sin(t * 2 + i)) + ' ' + (gy - 6) + ' ' + (gx + k * 2) + ' ' + (gy - 10 + (i % 2) * 2), i % 2 ? '#7cc24a' : '#5aa33a', 2.4)).join('')
          + flower(gx + 1, gy - 10.5, 0.7) + '</g>';
        if (trunkTip && trunkCurl > 0.2) food += '<g opacity="' + Math.round(trunkCurl * 100) / 100 + '">' + C(trunkTip.x, trunkTip.y, 2.6, '#7cc24a', 1.4) + '</g>';
      } else if (D.food === 'meat') {
        const mx = side ? 106 : 60, my = side ? 89 : 92;
        food = '<g' + op + '>' + L('M ' + (mx - 7) + ' ' + my + ' L ' + (mx + 1) + ' ' + my, INK, 5.2) + L('M ' + (mx - 7) + ' ' + my + ' L ' + (mx + 1) + ' ' + my, '#fff6e6', 2.6)
          + C(mx - 8.4, my - 1.3, 1.8, '#fff6e6', 1.2) + C(mx - 8.4, my + 1.3, 1.8, '#fff6e6', 1.2)
          + E(mx + 4, my - 0.5, 6, 4.4, '#e0644f', 2.2) + hl(mx + 2, my - 2.4, 1.3, 0.6) + '</g>';
      } else if (D.food === 'fish') {
        const inMouth = snapE >= 0.62;
        const fx0 = side ? (inMouth ? 98 : 116) : 60, fy0 = side ? (inMouth ? 82 : 89) : (inMouth ? 85 : 95);
        const wig = Math.sin(t * 14) * (inMouth ? 8 : 3);
        food = '<g' + op + ' transform="rotate(' + n1(wig) + ' ' + fx0 + ' ' + fy0 + ')">' + P('M ' + (fx0 - 5) + ' ' + fy0 + ' L ' + (fx0 - 9.5) + ' ' + (fy0 - 3) + ' L ' + (fx0 - 9.5) + ' ' + (fy0 + 3) + ' Z', '#6aa8d8', 1.4)
          + E(fx0, fy0, 6, 3.4, '#8fd0f0', 1.8) + C(fx0 + 3, fy0 - 0.8, 0.7, INK, 0) + '</g>';
      }
    }
    setHTML(el.food, food);

    /* Markierung, Laufband */
    let mk = '';
    if (view.mark) mk += E(60, 92.6, V.shadow + 6, 6, 'none', 0, 'stroke="#6d5dfc" stroke-width="2.4" stroke-dasharray="4 3" opacity=".9"');
    if (view.ground) {
      const gap = 18, off = ((A.road % gap) + gap) % gap;
      if (side) for (let k = -4; k <= 4; k++) mk += L('M ' + n1(60 + k * gap - off - 2) + ' 96 h4', '#8a8f99', 1.4, 'opacity=".5"');
      else for (let k = 0; k < 4; k++) {
        const u = ((k / 4 + (A.view === 'front' ? 1 : -1) * off / gap / 4) % 1 + 1) % 1, y = 93 + u * 9;
        mk += L('M 20 ' + n1(y) + ' h6 M 94 ' + n1(y) + ' h6', '#8a8f99', 1.4, 'opacity="' + Math.round((1 - u) * 50) / 100 + '"');
      }
    }
    setHTML(el.mark, mk);

    /* Skelett: Knochen und Gelenke über der Zeichnung */
    if (A.skelOn !== !!view.skel) {
      A.skelOn = !!view.skel;
      Array.prototype.forEach.call(el.main.children, ch => {
        const k = ch.getAttribute('data-k');
        if (k !== 'skel' && k !== 'mark' && k !== 'sh') { if (A.skelOn) ch.setAttribute('opacity', '0.35'); else ch.removeAttribute('opacity'); }
      });
    }
    let sk = '';
    if (view.skel) {
      const s1 = rootP(side ? [38, 62] : [60, 66]), s2 = rootP(side ? [74, 58] : [60, 56]), h2 = rootQ(headP([hp[0], hp[1] - 8]));
      bones.push([s1, s2], [s2, h2]);
      bones.forEach(([a, b]) => { sk += L(seg(a, b), '#e11d48', 1.8); });
      bones.forEach(([a, b]) => { sk += dot(a.x, a.y, 1.5, '#fff', '#e11d48', 1) + dot(b.x, b.y, 1.5, '#fff', '#e11d48', 1); });
    }
    setHTML(el.skel, sk);

    /* Zzz, Herzchen, Funkeln (nicht gespiegelt) */
    const tp = rootQ(headP(V.top));
    const fxX = view.ox + (tp.x - 60) * mir * S, fxY = view.oy + (tp.y - 92) * S, k = Math.max(0.7, S);
    let fx = '';
    if (w.sleep > 0.6) {
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.33 + i / 3) % 1, s = (3.4 + u * 4) * k;
        const x = fxX + 4 * k + u * 12 * k + Math.sin(u * 6) * 2, y = fxY - 2 - u * 22 * k;
        const d = 'M' + n1(x) + ' ' + n1(y) + 'h' + n1(s) + 'l' + n1(-s) + ' ' + n1(s) + 'h' + n1(s);
        const op = Math.round(Math.sin(u * Math.PI) * (w.sleep - 0.6) * 250) / 100;
        fx += L(d, INK, n1(3.4 * k), 'opacity="' + op + '"') + L(d, '#c7d2fe', n1(1.5 * k), 'opacity="' + op + '"');
      }
    }
    if (w.eat > 0.5) {
      const u = (t * 0.45) % 1;
      if (u < 0.8) fx += P(heart(fxX + 8 * k + Math.sin(u * 7) * 2, fxY - u * 20 * k, (2.6 + u * 1.6) * k), '#ff6f91', n1(1.1 * k), 'opacity="' + Math.round(Math.sin(u / 0.8 * Math.PI) * (w.eat - 0.5) * 200) / 100 + '"');
    }
    if ((1 - gt.m) * (1 - w.sleep) * (1 - w.eat) > 0.5) {
      const u = (t * 0.25 + A.seed) % 1;
      if (u < 0.3) {
        const s = Math.sin(u / 0.3 * Math.PI) * 3.2 * k, a = A.seed * 20;
        fx += P(star(fxX + Math.cos(a) * 16 * k, fxY + 2 * k + Math.sin(a) * 5 * k, s), '#ffd23f', n1(0.8 * k)) + P(star(fxX - Math.cos(a) * 12 * k, fxY - 6 * k, s * 0.65), '#ffffff', n1(0.7 * k));
      }
    }
    setHTML(el.fx, fx);
  }

  window.SavanneTiere = { SPECIES, ORDER, ROLES, PITCH, create, update, draw, mount };
})();
