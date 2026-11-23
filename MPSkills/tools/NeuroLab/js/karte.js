/* ══════════════════════════════════════════════════════════════
   NeuroLab · karte.js — die Landkarte für „Das Revier der Wildkatzen“
   ══════════════════════════════════════════════════════════════
   Ein Tal von 12 × 10 km. x₁ = Osten, x₂ = Norden (km). Nach Sönkes
   Skizze (23.11.2026): Das Revier liegt zwischen drei Grenzen, die die
   Kinder nicht kennen (NLKarte.TRUTH):
     Fluss       im Westen, macht in der Mitte eine deutliche Biegung nach
                 Westen (riverX(x₂) = Lage des Flusses) – Revier liegt östlich
     Landstraße  x₂ = −¾·x₁ + 12   Revier liegt darunter (die Straße selbst
                 verläuft knapp einen Kilometer weiter nordöstlich)
     Stadtrand   x₂ = ⅔·x₁ − 2     Revier liegt darüber (die Stadt beginnt
                 erst gut einen Kilometer weiter südöstlich)
   Kameras (alle auf ganzen km, keine auf einer Grenze), wie in der Skizze:
     YEAR1  Jahr 1: gelb (westlich des Flusses, keine Katze) + rot (Katze).
            Eine Gerade trennt sie, z. B. x₂ = −3·x₁ + 19 (LINES.fluss).
     ALL    + rosa (Katze) und blau (keine): jetzt braucht es Straße und Stadt.
     BEND   die zwei lila Kameras IN der Flussbiegung: Katze! Keine einzelne
            Fluss-Gerade trennt sie von den Kameras westlich des Flusses
            (sie liegen zwischen (3|8) und (4|2)) → zwei Geraden (LINES.oben/unten).
     ALL2   ALL + BEND
     NOISY  ALL2, fünf Kameras sagen etwas anderes (OUTLIERS) – Overfitting
     TEST   neue Kameras zwischen den alten (Testdaten)
   Gemalt wird die Landschaft erst, wenn das Revier gefunden ist (reveal 0 … 1)
   – vorher ist es nur ein Gitter.

   makeMap(o) → { el, set(opts), draw() }  opts:
     cams     [{p, soll, mark, markColor, neu, label}]  Dreieck = Katze gesehen, Kreis = keine (wie Teil 1); neu = heller Hof
     judge    p → 0|1   was das Netz an diesem Ort sagt (rote Ringe bei Fehlern)
     region   p → 0|1   Fläche, auf der das Netz feuert (gold getönt)
     lines    [{w, b, color, dash, faint, width, num, arrow}]   Geraden z = 0 (num = Nummer des Neurons)
     at       [x₁, x₂]  Eingabe des Neurons (oranges Fadenkreuz wie in Teil 1)
     pencil   [{P, Q, color}]   Bleistiftlinie durch zwei gewählte Punkte
     pick     fn(p)  Gitterpunkt antippen (Punkte wählen)
     handles  {P, Q, color, onMove(P, Q)}  zwei ziehbare Punkte (rasten auf ganzen km ein) mit Gerade dazwischen
     tapCam   fn(p)  Kamera antippen
     rings    [{p, r, color}]  gestrichelte Kreise (r in km)
     reveal   0 … 1
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const DOM = [[0, 12], [0, 10]];
  /* Der Fluss: Stützpunkte [x₂, x₁] von Nord nach Süd, dazwischen Catmull-Rom */
  const RIV = [[10.4, 3.3], [9, 3.5], [8, 3.5], [7, 3.0], [6, 2.3], [5, 2.0], [4, 2.3], [3, 3.6], [2, 5.0], [1, 5.8], [-0.4, 6.3]];
  function riverX(y) {
    const P = RIV;
    if (y >= P[0][0]) return P[0][1];
    for (let i = 0; i < P.length - 1; i++) {
      const [y0, x0] = P[i], [y1, x1] = P[i + 1];
      if (y <= y0 && y >= y1) {
        const t = (y0 - y) / (y0 - y1), xm = P[i - 1] ? P[i - 1][1] : x0, xp = P[i + 2] ? P[i + 2][1] : x1;
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * x0 + (-xm + x1) * t + (2 * xm - 5 * x0 + 4 * x1 - xp) * t2 + (-xm + 3 * x0 - 3 * x1 + xp) * t3);
      }
    }
    return P[P.length - 1][1];
  }
  const TRUTH = [
    { id: 'fluss', name: 'Fluss', river: true },
    { id: 'strasse', name: 'Landstraße', w: [-0.75, -1], b: 12 },
    { id: 'stadt', name: 'Stadtrand', w: [-2 / 3, 1], b: 2 },
  ];
  const zOf = (t, p) => t.w[0] * p[0] + t.w[1] * p[1] + t.b;
  const inRevier = p => p[0] > riverX(p[1]) && TRUTH.every(t => t.river || zOf(t, p) > 0);
  /* Musterlösungen (Geraden durch ganze km, Zahlen im Bereich der Neuronen) */
  const LINES = {
    fluss: { P: [3, 10], Q: [5, 4], w: [3, 1], b: -19 },            // x₂ = −3·x₁ + 19, Revier oberhalb (östlich)
    strasse: { P: [4, 9], Q: [8, 6], w: [-0.75, -1], b: 12 },       // x₂ = −¾·x₁ + 12, Revier unterhalb
    stadt: { P: [3, 0], Q: [6, 2], w: [-2 / 3, 1], b: 2 },          // x₂ = ⅔·x₁ − 2, Revier oberhalb
    oben: { P: [2, 5], Q: [4, 9], w: [2, -1], b: 1 },               // x₂ = 2·x₁ + 1, Revier unterhalb (östlich)
    unten: { P: [2, 4], Q: [6, 1], w: [0.75, 1], b: -5.5 },         // x₂ = −¾·x₁ + 5,5, Revier oberhalb
  };

  /* ── Kameras (wie in Sönkes Skizze) ──────────────────────── */
  const GELB = [[2, 9], [3, 8], [1, 7], [1, 6], [1, 4], [2, 3], [3, 2], [4, 2], [1, 1], [5, 1]];
  const ROT = [[5, 7], [6, 7], [5, 5], [6, 5], [7, 6], [8, 5], [6, 4], [7, 4], [6, 3], [4, 8]];
  const ROSA = [[7, 5], [5, 6], [8, 4], [7, 3]];
  const BLAU = [[1, 10], [4, 10], [6, 10], [8, 9], [10, 9], [7, 8], [11, 8], [9, 7], [11, 6], [11, 5], [0, 8], [0, 5], [0, 2],
    [2, 0], [5, 0], [8, 0], [7, 1], [12, 1], [8, 2], [10, 2], [9, 3], [11, 3]];
  const LILA = [[3, 6], [3, 4]];
  const cam = (p, k) => ({ p, soll: inRevier(p) ? 1 : 0, k });
  const YEAR1 = GELB.map(p => cam(p, 'gelb')).concat(ROT.map(p => cam(p, 'rot')));
  const ALL = YEAR1.concat(ROSA.map(p => cam(p, 'rosa')), BLAU.map(p => cam(p, 'blau')));
  const BEND = LILA.map(p => Object.assign(cam(p, 'lila'), { bend: true }));
  const ALL2 = ALL.concat(BEND);
  const OUTLIERS = [[2, 9, 'Diese Katze ist durch den Fluss geschwommen.'], [8, 2, 'Eine Katze hat sich bis an die Stadt gewagt.'],
    [9, 7, 'Eine junge Katze war auf Wanderschaft – über die Straße.'], [6, 5, 'Hier hat die Kamera die Katze verpasst (Akku leer).'],
    [7, 4, 'Hier stand ein Busch vor der Kamera.']];
  const outOf = (i, j) => OUTLIERS.find(o => o[0] === i && o[1] === j);
  const NOISY = ALL2.map(c => { const o = outOf(c.p[0], c.p[1]); return o ? Object.assign({}, c, { soll: 1 - c.soll, out: o[2] }) : c; });
  // Testdaten: neue Kameras zwischen den alten, nicht direkt an einer Grenze
  const hash = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
  const nearEdge = p => Math.abs(p[0] - riverX(p[1])) < 0.3 || TRUTH.some(t => !t.river && Math.abs(zOf(t, p)) / Math.hypot(t.w[0], t.w[1]) < 0.15);
  const TEST = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 10; j++) {
    if (hash(i, j) < 0.3) continue;
    const p = [i + 0.5 + (hash(j, i) - 0.5) * 0.3, j + 0.5 + (hash(i + 7, j + 3) - 0.5) * 0.3];
    if (nearEdge(p)) continue;
    TEST.push({ p: [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100], soll: inRevier(p) ? 1 : 0, test: true });
  }

  /* ── Malen ───────────────────────────────────────────────── */
  const css = n => (window.NLTheme && NLTheme.var(n)) || '#888';
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* Landschaft in Weltkoordinaten auf eine eigene Leinwand malen
     (Licht von links oben, keine schwarzen Umrisse). */
  function paintLand(W, H, X, Y, s) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const R = rng(20261121);
    const P = p => [X(p[0]), Y(p[1])];
    const x0 = X(0), x1 = X(12), y0 = Y(10), y1 = Y(0);
    c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    // Wiese
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#cfe2a4'); g.addColorStop(1, '#a9c97f');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let k = 0; k < 260; k++) {
      const px = x0 + R() * (x1 - x0), py = y0 + R() * (y1 - y0), r = (0.25 + R() * 0.7) * s;
      c.fillStyle = R() < 0.5 ? 'rgba(110,150,60,.07)' : 'rgba(245,250,210,.08)';
      c.beginPath(); c.ellipse(px, py, r, r * (0.5 + R() * 0.4), R() * 3, 0, Math.PI * 2); c.fill();
    }
    // Felder im Westen (jenseits des Flusses)
    [[0.2, 6.6, 1.5, 1.2, '#e2d58e'], [0.3, 8.4, 1.4, 1.1, '#d9cf86'], [0.2, 2.2, 1.3, 1.1, '#c9d98a']].forEach(([a, b, w, hh, col]) => {
      c.fillStyle = col; c.globalAlpha = 0.75;
      c.fillRect(X(a), Y(b + hh), w * s, hh * s);
      c.strokeStyle = 'rgba(150,130,60,.35)'; c.lineWidth = 1;
      for (let q = 1; q < 6; q++) { c.beginPath(); c.moveTo(X(a), Y(b) - q * hh * s / 6); c.lineTo(X(a + w), Y(b) - q * hh * s / 6); c.stroke(); }
      c.globalAlpha = 1;
    });
    // Stadt im Südosten: ausgefranster Rand gut einen Kilometer hinter dem Revier, bis an die Landstraße
    const TOWN = [[5.9, -0.4], [6.3, 0.5], [7.3, 0.6], [7.8, 1.5], [8.9, 1.6], [9.4, 2.6], [10.5, 2.7], [10.9, 3.6], [12.4, 3.6], [12.4, -0.4]];
    const inTown = p => { let ins = false; for (let i = 0, j = TOWN.length - 1; i < TOWN.length; j = i++) { const [xi, yi] = TOWN[i], [xj, yj] = TOWN[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
    c.beginPath(); TOWN.map(P).forEach((q, i) => i ? c.lineTo(...q) : c.moveTo(...q)); c.closePath();
    c.fillStyle = '#ddd6c8'; c.fill();
    // Häuser im Raster, schräg wie der Stadtrand
    const ang = Math.atan2(2, 3), d = [Math.cos(ang), Math.sin(ang)], n = [Math.sin(ang), -Math.cos(ang)];
    const roofs = ['#b85c4a', '#a24b3c', '#c7745a', '#8e8a84', '#9c6b4e'];
    for (let u = -2; u < 14; u += 0.62) for (let v = 0.3; v < 8; v += 0.58) {
      if (Math.round(v / 0.58) % 4 === 0 || Math.round(u / 0.62) % 5 === 0) continue;    // Straßen frei lassen
      const cx = 6 + d[0] * u + n[0] * v, cy = 0.6 + d[1] * u + n[1] * v;
      if (cx < -0.2 || cx > 12.4 || cy < -0.4 || cy > 10.4 || !inTown([cx, cy])) continue;
      if (R() < 0.12) continue;
      const w = (0.36 + R() * 0.1) * s, hh = (0.3 + R() * 0.08) * s;
      c.save(); c.translate(X(cx), Y(cy)); c.rotate(-ang + (R() - 0.5) * 0.06);
      c.fillStyle = 'rgba(60,50,40,.22)'; c.fillRect(-w / 2 + 2, -hh / 2 + 2, w, hh);
      const col = roofs[Math.floor(R() * roofs.length)];
      c.fillStyle = col; c.fillRect(-w / 2, -hh / 2, w, hh);
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-w / 2, -hh / 2, w, hh / 2);
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0); c.stroke();
      c.restore();
    }
    // Kirchturm
    c.fillStyle = '#7d756b'; c.beginPath(); c.arc(X(10.3), Y(1.2), 0.22 * s, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a99f92'; c.beginPath(); c.arc(X(10.25), Y(1.25), 0.12 * s, 0, Math.PI * 2); c.fill();
    const road = (pts, wid) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#8c8a86'; c.lineWidth = wid + 3; c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(...P(q)) : c.moveTo(...P(q))); c.stroke();
      c.strokeStyle = '#b9b6b0'; c.lineWidth = wid; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.3; c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]);
    };
    // Fluss: von Norden nach Süden, mit der Biegung nach Westen
    const riv = [];
    for (let y = 10.4; y >= -0.4; y -= 0.08) { const off = 0.05 * Math.sin(y * 2.3) + 0.03 * Math.sin(y * 5.1); riv.push([riverX(y) + off, y]); }
    const strokeP = (pts, col, wd) => { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(...P(q)) : c.moveTo(...P(q))); c.stroke(); };
    c.lineCap = 'round'; c.lineJoin = 'round';
    strokeP(riv, '#8fb07a', 0.42 * s);
    strokeP(riv, '#4f8fc4', 0.26 * s);
    strokeP(riv, '#79b4e2', 0.15 * s);
    c.globalAlpha = 0.5; strokeP(riv.map(q => [q[0] + 0.03, q[1]]), '#cfe8f8', 0.04 * s); c.globalAlpha = 1;
    // Landstraße im Nordosten (knapp 1 km hinter der Reviergrenze), Ortsstraße in die Stadt
    road([[3.9, 10.4], [12.4, 4.0]], 0.17 * s);
    road([[11.2, 4.6], [10.4, 2.9], [9.6, 2.0]], 0.11 * s);
    // Bäume: dicht im Revier (Wildkatzen leben im Wald), sonst vereinzelt
    const roadD = p => Math.abs(0.75 * p[0] + p[1] - 12.9) / 1.25;
    const trees = [];
    for (let k = 0; k < 1300; k++) {
      const p = [R() * 12.4 - 0.2, R() * 10.4 - 0.2];
      if (inTown(p) || Math.abs(p[0] - riverX(p[1])) < 0.35 || roadD(p) < 0.3) continue;
      if ((p[0] < 1.8 && ((p[1] > 6.5 && p[1] < 9.6) || (p[1] > 2.1 && p[1] < 3.4)))) continue;   // Felder
      const dense = inRevier(p) ? 0.55 : (p[0] > riverX(p[1]) ? 0.05 : 0.035);
      if (R() > dense) continue;
      trees.push({ p, r: (0.17 + R() * 0.15) * s, t: R() });
    }
    trees.sort((a, b) => Y(a.p[1]) - Y(b.p[1]));
    trees.forEach(({ p, r, t }) => {
      const [px, py] = P(p);
      c.fillStyle = 'rgba(40,60,25,.25)'; c.beginPath(); c.ellipse(px + r * 0.35, py + r * 0.4, r, r * 0.8, 0, 0, Math.PI * 2); c.fill();
      const gr = c.createRadialGradient(px - r * 0.4, py - r * 0.45, r * 0.1, px, py, r);
      const dark = t < 0.3 ? ['#8dbd63', '#3c6d2b'] : t < 0.7 ? ['#7fb35a', '#355f27'] : ['#a3c26a', '#4d7430'];
      gr.addColorStop(0, dark[0]); gr.addColorStop(1, dark[1]);
      c.fillStyle = gr; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
    });
    // Wildkatzen (sitzend, Schwanz mit Ringen)
    const cat = (p, k, flip) => {
      const [px, py] = P(p); c.save(); c.translate(px, py); c.scale(flip ? -k : k, k);
      c.fillStyle = 'rgba(40,30,20,.25)'; c.beginPath(); c.ellipse(2, 13, 11, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#7a6650';
      c.beginPath(); c.ellipse(0, 4, 7, 9, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(0, -8, 5.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(-5, -10); c.lineTo(-4, -17); c.lineTo(-1, -12); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(5, -10); c.lineTo(4, -17); c.lineTo(1, -12); c.closePath(); c.fill();
      c.strokeStyle = '#7a6650'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(5, 11); c.quadraticCurveTo(16, 12, 15, 2); c.stroke();
      c.strokeStyle = '#3d3226'; c.lineWidth = 4.2;
      [[13.5, 9.5], [15.4, 6]].forEach(([a, b]) => { c.beginPath(); c.moveTo(a - 0.6, b - 0.6); c.lineTo(a + 0.6, b + 0.6); c.stroke(); });
      c.beginPath(); c.arc(15, 2.2, 1.6, 0, Math.PI * 2); c.fillStyle = '#3d3226'; c.fill();
      c.fillStyle = '#d6c7a2'; c.beginPath(); c.ellipse(0, 6, 3.5, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8d36a'; c.beginPath(); c.arc(-2.1, -8.6, 1.1, 0, Math.PI * 2); c.arc(2.1, -8.6, 1.1, 0, Math.PI * 2); c.fill();
      c.restore();
    };
    const k = s / 36;
    cat([5.5, 6.4], k, false); cat([7.5, 4.5], k * 0.9, true); cat([3.4, 5.1], k * 0.8, false);     // eine sitzt in der Flussbiegung
    // Beschriftungen
    const label = (txt, p, rot, size) => {
      c.save(); c.translate(...P(p)); c.rotate(rot);
      c.font = `italic 700 ${size}px Georgia, "Times New Roman", serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.strokeText(txt, 0, 0);
      c.fillStyle = '#2f3b2a'; c.fillText(txt, 0, 0); c.restore();
    };
    const fs = Math.max(11, s * 0.36);
    label('Fluss', [1.6, 5.0], -Math.PI / 2 + 0.25, fs);
    label('Landstraße', [8.6, 7.95], Math.atan2(0.75, 1), fs * 0.85);
    label('Stadt', [11.1, 0.9], 0, fs * 1.2);
    c.restore();
    return cv;
  }

  /* Kamera wie die Punkte in „Wie arbeitet ein Neuron?“: Katze gesehen =
     goldenes Dreieck (soll feuern), keine Katze = weißer Kreis */
  function camGlyph(c, x, y, r, soll, onLand) {
    c.beginPath();
    if (soll) { c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.08, y + r * 0.8); c.lineTo(x - r * 1.08, y + r * 0.8); c.closePath(); }
    else c.arc(x, y, r * 0.85, 0, Math.PI * 2);
    c.fillStyle = soll ? css('gold') : css('surface'); c.fill();
    c.lineWidth = 2; c.strokeStyle = soll ? (onLand ? '#5a4206' : css('surface')) : css('ink-soft'); c.stroke();
  }

  function makeMap(o = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'rv-map';
    const cv = document.createElement('canvas');
    wrap.appendChild(cv);
    let opts = {}, G = null, hoverP = null, land = null, landKey = '';
    const off = document.createElement('canvas');

    function draw() {
      cv.style.touchAction = opts.handles ? 'none' : '';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const Wc = cv.clientWidth || 480, Hc = cv.clientHeight || 420;
      cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const padL = 46, padB = 40, padT = 10, padR = 12;
      const s = Math.min((Wc - padL - padR) / 12, (Hc - padT - padB) / 10);
      const ox = padL + ((Wc - padL - padR) - 12 * s) / 2, oy = padT;
      const X = v => ox + v * s, Y = v => oy + (10 - v) * s;
      const iX = px => (px - ox) / s, iY = py => 10 - (py - oy) / s;
      G = { X, Y, iX, iY, s };
      // Grund
      c.fillStyle = css('surface-2'); c.fillRect(ox, oy, 12 * s, 10 * s);
      const rv = opts.reveal || 0;
      if (rv > 0) {
        const key = [Wc, Hc, dpr].join('x');
        if (key !== landKey) { landKey = key; land = paintLand(Math.round(Wc * dpr), Math.round(Hc * dpr), v => X(v) * dpr, v => Y(v) * dpr, s * dpr); }
        c.save(); c.globalAlpha = rv; c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(land, 0, 0); c.restore();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      c.save(); c.beginPath(); c.rect(ox, oy, 12 * s, 10 * s); c.clip();
      // Fläche, auf der das Netz feuert
      if (opts.region) {
        const nx = Math.max(48, Math.round(12 * s / 2)), ny = Math.round(nx * 10 / 12);
        const img = new ImageData(nx, ny);
        const gd = rgbOf(rv > 0 ? css('gold') : css('gold-dim'));
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const p = [(i + 0.5) / nx * 12, 10 - (j + 0.5) / ny * 10];
          const k = (j * nx + i) * 4;
          if (opts.region(p)) { img.data[k] = gd[0]; img.data[k + 1] = gd[1]; img.data[k + 2] = gd[2]; img.data[k + 3] = rv > 0 ? 110 : 255; }
        }
        off.width = nx; off.height = ny; off.getContext('2d').putImageData(img, 0, 0);
        c.imageSmoothingEnabled = false; c.drawImage(off, ox, oy, 12 * s, 10 * s); c.imageSmoothingEnabled = true;
      }
      // Gitter
      c.lineWidth = 1;
      for (let v = 0; v <= 12; v++) { c.strokeStyle = rv > 0.5 ? 'rgba(255,255,255,.28)' : css('line-soft'); c.beginPath(); c.moveTo(X(v), oy); c.lineTo(X(v), oy + 10 * s); c.stroke(); }
      for (let v = 0; v <= 10; v++) { c.beginPath(); c.moveTo(ox, Y(v)); c.lineTo(ox + 12 * s, Y(v)); c.stroke(); }
      // Bleistift
      (opts.pencil || []).forEach(pc => {
        if (pc.P && pc.Q && (pc.P[0] !== pc.Q[0] || pc.P[1] !== pc.Q[1])) {
          const dx = pc.Q[0] - pc.P[0], dy = pc.Q[1] - pc.P[1], L = Math.hypot(dx, dy);
          c.strokeStyle = pc.color || css('ink-soft'); c.globalAlpha = 0.75; c.lineWidth = 2; c.setLineDash([3, 5]);
          c.beginPath(); c.moveTo(X(pc.P[0] - dx / L * 30), Y(pc.P[1] - dy / L * 30)); c.lineTo(X(pc.P[0] + dx / L * 30), Y(pc.P[1] + dy / L * 30)); c.stroke();
          c.setLineDash([]); c.globalAlpha = 1;
        }
        [['P', pc.P], ['Q', pc.Q]].forEach(([n, q]) => {
          if (!q) return;
          const x = X(q[0]), y = Y(q[1]);
          c.strokeStyle = pc.color || css('ink'); c.lineWidth = 2.6;
          c.beginPath(); c.moveTo(x - 7, y - 7); c.lineTo(x + 7, y + 7); c.moveTo(x + 7, y - 7); c.lineTo(x - 7, y + 7); c.stroke();
          c.font = '700 13px "JetBrains Mono", monospace'; c.fillStyle = pc.color || css('ink');
          c.lineWidth = 3; c.strokeStyle = css('surface'); c.strokeText(n, x + 8, y - 8); c.fillText(n, x + 8, y - 8);
        });
      });
      // Ziehbare Gerade (zwei Griffe)
      if (opts.handles) {
        const hd = opts.handles, col = hd.color || css('ink');
        const [P, Q] = [hd.P, hd.Q], dx = Q[0] - P[0], dy = Q[1] - P[1], L = Math.hypot(dx, dy);
        if (L > 0) {
          c.strokeStyle = col; c.globalAlpha = 0.85; c.lineWidth = 2.4; c.setLineDash([7, 5]); c.lineCap = 'round';
          c.beginPath(); c.moveTo(X(P[0] - dx / L * 30), Y(P[1] - dy / L * 30)); c.lineTo(X(P[0] + dx / L * 30), Y(P[1] + dy / L * 30)); c.stroke();
          c.setLineDash([]); c.globalAlpha = 1;
        }
        [['P', P], ['Q', Q]].forEach(([n, q]) => {
          const x = X(q[0]), y = Y(q[1]);
          c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fillStyle = col; c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 1;
          c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 2.5; c.strokeStyle = css('surface'); c.stroke();
          c.font = '700 13px "JetBrains Mono", monospace'; c.fillStyle = css('ink'); c.lineWidth = 3.5; c.strokeStyle = css('surface');
          const t = `${n} (${q[0]} | ${q[1]})`, left = x > X(12) - 120;
          c.textAlign = left ? 'right' : 'left';
          c.strokeText(t, left ? x - 12 : x + 12, y - 12); c.fillText(t, left ? x - 12 : x + 12, y - 12); c.textAlign = 'left';
        });
      }
      // Gestrichelte Kreise (z. B. gemerkte Ausreißer)
      (opts.rings || []).forEach(rg => {
        c.beginPath(); c.arc(X(rg.p[0]), Y(rg.p[1]), rg.r * s, 0, Math.PI * 2);
        c.strokeStyle = rg.color || css('in'); c.lineWidth = 2; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]);
      });
      // Geraden
      (opts.lines || []).forEach(L => {
        const [w1, w2] = L.w, b = L.b, pts = [];
        const ok = p => p[0] >= -1e-9 && p[0] <= 12 + 1e-9 && p[1] >= -1e-9 && p[1] <= 10 + 1e-9;
        if (Math.abs(w2) > 1e-9) [0, 12].forEach(a => { const d = -(w1 * a + b) / w2; if (ok([a, d])) pts.push([a, d]); });
        if (Math.abs(w1) > 1e-9) [0, 10].forEach(d => { const a = -(w2 * d + b) / w1; if (ok([a, d])) pts.push([a, d]); });
        if (pts.length < 2) return;
        const A = pts[0], B = pts.find(q => Math.hypot(q[0] - A[0], q[1] - A[1]) > 1e-6) || pts[1];
        c.globalAlpha = L.faint ? 0.35 : 1;
        c.lineCap = 'round';
        c.strokeStyle = rv > 0.5 ? 'rgba(255,255,255,.9)' : css('surface'); c.lineWidth = (L.width || 3.4) + 3;
        c.beginPath(); c.moveTo(X(A[0]), Y(A[1])); c.lineTo(X(B[0]), Y(B[1])); c.stroke();
        c.strokeStyle = L.color; c.lineWidth = L.width || 3.4; if (L.dash) c.setLineDash(L.dash);
        c.beginPath(); c.moveTo(X(A[0]), Y(A[1])); c.lineTo(X(B[0]), Y(B[1])); c.stroke(); c.setLineDash([]);
        if (L.num) {
          // Nummer des Neurons an der Geraden (Farbe = Neuron im Netz)
          // am Rand, wo die Gerade in die Karte kommt – 24 px nach innen
          const len = Math.hypot(X(B[0]) - X(A[0]), Y(B[1]) - Y(A[1])) || 1, f = Math.min(0.5, 24 / len);
          const bx = X(A[0]) + f * (X(B[0]) - X(A[0])), by = Y(A[1]) + f * (Y(B[1]) - Y(A[1]));
          c.globalAlpha = 1; c.beginPath(); c.arc(bx, by, 10, 0, Math.PI * 2); c.fillStyle = L.color; c.fill();
          c.lineWidth = 2; c.strokeStyle = css('surface'); c.stroke();
          c.fillStyle = '#fff'; c.font = '700 12px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.fillText(L.num, bx, by + 4); c.textAlign = 'left';
        }
        if (!L.faint && L.arrow) {
          // Pfeil zur feuernden Seite (Richtung auf dem Bild: Normale (w₁, −w₂))
          const mx = (X(A[0]) + X(B[0])) / 2 + (L.shift || 0) * (X(B[0]) - X(A[0])), my = (Y(A[1]) + Y(B[1])) / 2 + (L.shift || 0) * (Y(B[1]) - Y(A[1]));
          const nl = Math.hypot(w1, w2) || 1, nx = w1 / nl * 26, ny = -w2 / nl * 26;
          c.strokeStyle = L.color; c.fillStyle = L.color; c.lineWidth = 3;
          c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + nx, my + ny); c.stroke();
          const an = Math.atan2(ny, nx);
          c.beginPath(); c.moveTo(mx + nx * 1.35, my + ny * 1.35);
          c.lineTo(mx + nx - 7 * Math.sin(an), my + ny + 7 * Math.cos(an)); c.lineTo(mx + nx + 7 * Math.sin(an), my + ny - 7 * Math.cos(an)); c.closePath(); c.fill();
          if (L.tag) {
            c.font = '700 12px "JetBrains Mono", monospace'; c.textAlign = 'center';
            c.lineWidth = 3.5; c.strokeStyle = css('surface'); c.strokeText(L.tag, mx + nx * 1.9, my + ny * 1.9 + 4); c.fillText(L.tag, mx + nx * 1.9, my + ny * 1.9 + 4);
            c.textAlign = 'left';
          }
        }
        c.globalAlpha = 1;
      });
      // Kameras
      const r = Math.max(6, Math.min(8, s * 0.22));
      (opts.cams || []).forEach(cm => {
        const x = X(cm.p[0]), y = Y(cm.p[1]);
        if (cm.neu) { c.beginPath(); c.arc(x, y, r * 1.9, 0, Math.PI * 2); c.fillStyle = css('accent'); c.globalAlpha = 0.2; c.fill(); c.globalAlpha = 1; }
        camGlyph(c, x, y, r, cm.soll, rv > 0.3);
        if (opts.judge && (!cm.mark || cm.bend) && opts.judge(cm.p) !== cm.soll) { c.beginPath(); c.arc(x, y, r * 1.6, 0, Math.PI * 2); c.strokeStyle = css('neg'); c.lineWidth = 2.2; c.stroke(); }
        if (cm.mark) { c.beginPath(); c.arc(x, y, r * 2.1, 0, Math.PI * 2); c.strokeStyle = cm.markColor || css('in'); c.lineWidth = 3; c.stroke(); }
        if (cm.label) {
          c.font = '800 14px "Space Grotesk", sans-serif'; c.lineWidth = 3.5; c.strokeStyle = css('surface'); c.fillStyle = css('ink');
          c.strokeText(cm.label, x + r + 3, y - r - 2); c.fillText(cm.label, x + r + 3, y - r - 2);
        }
      });
      // Eingabe des Neurons (wie in Teil 1: oranges Fadenkreuz)
      if (opts.at) {
        const ax = X(opts.at[0]), ay = Y(opts.at[1]);
        c.strokeStyle = css('in'); c.lineWidth = 3;
        c.beginPath(); c.arc(ax, ay, 12, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(ax - 17, ay); c.lineTo(ax - 7, ay); c.moveTo(ax + 7, ay); c.lineTo(ax + 17, ay);
        c.moveTo(ax, ay - 17); c.lineTo(ax, ay - 7); c.moveTo(ax, ay + 7); c.lineTo(ax, ay + 17); c.stroke();
      }
      // Antippen-Hilfe
      if (opts.pick && hoverP) {
        c.beginPath(); c.arc(X(hoverP[0]), Y(hoverP[1]), 9, 0, Math.PI * 2);
        c.strokeStyle = opts.pickColor || css('accent'); c.lineWidth = 2.5; c.stroke();
        c.font = '600 12px "JetBrains Mono", monospace'; c.fillStyle = css('ink');
        const t = `(${hoverP[0]} | ${hoverP[1]})`; c.lineWidth = 3; c.strokeStyle = css('surface');
        c.strokeText(t, X(hoverP[0]) + 12, Y(hoverP[1]) + 18); c.fillText(t, X(hoverP[0]) + 12, Y(hoverP[1]) + 18);
      }
      c.restore();
      // Achsen
      c.strokeStyle = css('ink-faint'); c.lineWidth = 1.2; c.strokeRect(ox, oy, 12 * s, 10 * s);
      c.fillStyle = css('ink-faint'); c.font = '11px "JetBrains Mono", monospace';
      c.textAlign = 'center'; for (let v = 0; v <= 12; v += (s < 26 ? 2 : 1)) c.fillText(v, X(v), oy + 10 * s + 14);
      c.textAlign = 'right'; for (let v = 0; v <= 10; v += (s < 26 ? 2 : 1)) c.fillText(v, ox - 6, Y(v) + 4);
      c.fillStyle = css('in-ink'); c.font = '600 12px "Space Grotesk", system-ui, sans-serif';
      c.textAlign = 'center'; c.fillText('Osten in km  (x₁)', ox + 6 * s, oy + 10 * s + 31);
      c.save(); c.translate(13, oy + 5 * s); c.rotate(-Math.PI / 2); c.fillText('Norden in km  (x₂)', 0, 0); c.restore();
      c.textAlign = 'left';
    }
    const gridAt = e => {
      if (!G) return null;
      const r = cv.getBoundingClientRect();
      const a = Math.round(G.iX(e.clientX - r.left)), d = Math.round(G.iY(e.clientY - r.top));
      if (a < 0 || a > 12 || d < 0 || d > 10) return null;
      const dist = Math.hypot(G.X(a) - (e.clientX - r.left), G.Y(d) - (e.clientY - r.top));
      return dist < Math.max(18, G.s * 0.55) ? [a, d] : null;
    };
    cv.addEventListener('pointermove', e => {
      if (!opts.pick) { if (hoverP) { hoverP = null; draw(); } cv.style.cursor = ''; return; }
      const p = gridAt(e);
      cv.style.cursor = p ? 'pointer' : 'crosshair';
      if (String(p) !== String(hoverP)) { hoverP = p; draw(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!drag || !opts.handles) return;
      const p = km(e), hd = opts.handles, other = drag === 'P' ? hd.Q : hd.P;
      if (p[0] === other[0] && p[1] === other[1]) return;                  // beide Griffe nie auf demselben Punkt
      if (p[0] === hd[drag][0] && p[1] === hd[drag][1]) return;
      hd[drag] = p; draw();
      if (hd.onMove) hd.onMove(hd.P.slice(), hd.Q.slice());
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { drag = null; }));
    cv.addEventListener('pointerleave', () => { if (hoverP) { hoverP = null; draw(); } });
    let drag = null;
    const km = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(12, Math.round(G.iX(e.clientX - r.left)))), Math.max(0, Math.min(10, Math.round(G.iY(e.clientY - r.top))))]; };
    const near = (e, q, rad) => { const r = cv.getBoundingClientRect(); return Math.hypot(G.X(q[0]) - (e.clientX - r.left), G.Y(q[1]) - (e.clientY - r.top)) < rad; };
    cv.addEventListener('pointerdown', e => {
      if (!G) return;
      const hd = opts.handles;
      if (hd) {
        const w = near(e, hd.P, 26) && (!near(e, hd.Q, 26) || false) ? 'P' : near(e, hd.Q, 26) ? 'Q' : near(e, hd.P, 26) ? 'P' : null;
        if (w) { e.preventDefault(); drag = w; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* egal */ } return; }
      }
      if (opts.tapCam) {
        const rad = Math.max(14, G.s * 0.4);
        const c = (opts.cams || []).find(cm => near(e, cm.p, rad));
        if (c) { e.preventDefault(); opts.tapCam(c.p); return; }
      }
      if (!opts.pick) return;
      const p = gridAt(e);
      if (p) { e.preventDefault(); hoverP = null; opts.pick(p); }
    });
    new ResizeObserver(() => { if (cv.isConnected) draw(); }).observe(cv);
    return {
      el: wrap, draw,
      set(n) { opts = Object.assign({}, opts, n); draw(); },
      get opts() { return opts; },
      reveal(done) {
        const t0 = performance.now(), from = opts.reveal || 0;
        const tick = t => { const k = Math.min(1, (t - t0) / 1400); opts.reveal = from + (1 - from) * (k * k * (3 - 2 * k)); draw(); if (k < 1) requestAnimationFrame(tick); else if (done) done(); };
        requestAnimationFrame(tick);
      },
      snapshot(w, hh, n) {
        // für das Arbeitsblatt: ein Bild der Karte in fester Größe
        const keepO = opts; opts = Object.assign({}, opts, n || {});
        const st = cv.getAttribute('style'); cv.style.width = w + 'px'; cv.style.height = hh + 'px';
        draw(); const url = cv.toDataURL('image/png');
        opts = keepO; if (st === null) cv.removeAttribute('style'); else cv.setAttribute('style', st); draw();
        return url;
      },
    };
  }

  const rgbCache = {};
  function rgbOf(col) {
    if (rgbCache[col]) return rgbCache[col];
    const k = document.createElement('canvas'); k.width = k.height = 1;
    const c = k.getContext('2d'); c.fillStyle = col; c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    return (rgbCache[col] = [d[0], d[1], d[2]]);
  }

  window.NLKarte = { DOM, TRUTH, LINES, zOf, riverX, inRevier, YEAR1, ALL, BEND, ALL2, NOISY, TEST, OUTLIERS, makeMap };
})();
