/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/erarbeitung.js   ·   Tafelbild „Wie lernt ein Neuron?“
   ══════════════════════════════════════════════════════════════
   Erarbeitung zwischen Level 3 und Level 4. 2. Fassung (Sönke
   18.11.2026: „viel zu kompliziert und überladen … so versteht das
   keiner“): EIN Neuron statt Netz 2-2-1, EIN Gedanke je Schritt.

     1 Raten        Pinguin (Umriss) → zwei Messwerte → · w₁, · w₂ → σ → „x % Zügel“
     2 Vergleichen  Art aufdecken, Soll vs. Ist, Abstand = Fehler
     3 Anpassen     jedes Gewicht rückt ein Stück, die Antwort rückt näher ans Soll
     4 Ins Tal      (3. Fassung 18.11.2026) links dasselbe Bild wie „Anpassen“, rechts die
                    Karte der ECHTEN Fehler-Landschaft über (w₁, w₂); jeder „Sprung“ =
                    neuer Pinguin testen + einmal anpassen = ein Sprung auf der Karte

   Das Neuron ist genau das aus Level 5 (NTWelt.penguins: 68 Adelie +
   68 Zügel, Schnabel standardisiert, σ ohne Bias) – die Karte in
   Schritt 4 ist also die Welt aus Level 5 von oben.
   Lernregel (σ + Log-Fehler, exakt):  neu = alt + Lernrate × Fehler × Eingang
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  // Lernpfad allein (js/pfad.js): Erarbeitung einmal geöffnet = dieser Halt ist geschafft
  if (!/[?&]demo=/.test(location.search)) { try { localStorage.setItem('nt.done.erarb', '1'); } catch (e) { /* egal */ } }
  let low = !!(window.LWMotion && LWMotion.low);
  window.addEventListener('lernwelt:motion', () => { low = !!(window.LWMotion && LWMotion.low); drawAll(); });

  /* ── Zahlen ── */
  const MINUS = '−';
  const f = (v, d) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d == null ? 1 : d).replace('.', ',');
  const sf = (v, d) => (v >= 0 ? '+' : '') + f(v, d);
  const pct = v => Math.round(v * 100) + ' %';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sig = z => 1 / (1 + Math.exp(-z));
  const COL = { pos: '#ff9d4d', neg: '#6aa8ff', mint: '#5cf2c4', vio: '#a98bff', red: '#ff6b8b', ink: '#e8f1ff', soft: '#a9bad6', faint: '#6f82a3', line: '#26406a' };

  /* ── Daten + Neuron (wie Level 5) ── */
  const WP = NTWelt.penguins(1000), PTS = WP.pts, N = PTS.length, R = 20;
  const out = (w, q) => sig(w[0] * q.a + w[1] * q.b);
  const START = [-3, 2.5];               // sortiert fast alles falsch herum
  const S = { step: 1, w: START.slice(), oi: 0, cyc: null, lr: 3, trail: [], losses: [], n: 0, drag: false };
  const order = (() => { const r = NTWelt.rng(42), a = PTS.map((q, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  // erster Pinguin: ein Zügel, den das Startneuron für einen Adelie hält
  // (beide Messwerte deutlich ≠ 0, sonst ändert sich beim Anpassen kaum etwas)
  S.oi = Math.max(0, order.findIndex(i => PTS[i].y === 1 && out(START, PTS[i]) < 0.25 && Math.abs(PTS[i].a) > 0.5 && Math.abs(PTS[i].b) > 0.5));

  function newCycle() {
    const pt = PTS[order[S.oi % N]], before = S.w.slice(), y = out(before, pt), err = pt.y - y;
    S.cyc = { pt, before, y, err, applied: false };
    plan();
  }
  function plan() {
    const c = S.cyc;
    c.after = [c.before[0] + S.lr * c.err * c.pt.a, c.before[1] + S.lr * c.err * c.pt.b];
    c.yAfter = out(c.after, c.pt);
  }
  function record() {
    S.losses.push(WP.loss(S.w[0], S.w[1])); if (S.losses.length > 300) S.losses.shift();
    S.trail.push(S.w.slice()); if (S.trail.length > 300) S.trail.shift();
  }
  record();
  newCycle();

  /* ── Bühne (Schritt 1–3): ein Bild, quer oder hochkant ── */
  const LAY = {
    h: { vb: [960, 400], peng: [110, 300, 210], name: [110, 336], in: [[310, 128], [310, 278]], n: [610, 203, 50],
         arr: [[662, 203], [706, 203]], outT: [822, 64], big: [822, 122], bar: [760, 885, 205], heads: 26, lab: 254, err: 300 },
    v: { vb: [440, 726], peng: [220, 160, 142], name: [220, 186], in: [[118, 270], [322, 270]], n: [220, 462, 46],
         arr: [[220, 510], [220, 542]], outT: [220, 570], big: [220, 616], bar: [92, 348, 668], heads: 24, lab: 712, err: null }
  };
  let lay = LAY.h;
  function pill(x, y, txt, col, sel) {
    const w = Math.max(62, txt.replace(/<[^>]+>/g, '').length * 10.4 + 20);
    return '<g class="pill" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"><rect x="' + (-w / 2) + '" y="-16" width="' + w + '" height="32" rx="11" stroke="' + (sel ? COL.mint : col) + '"/>' +
      '<text y="6" text-anchor="middle" font-size="17">' + txt + '</text></g>';
  }
  const T = (x, y, txt, size, fill, w, anchor) => '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + (w || 600) + '" fill="' + (fill || COL.soft) +
    '" text-anchor="' + (anchor || 'middle') + '">' + txt + '</text>';

  function drawStage() {
    // quer/hochkant nach der GANZEN Bühne (main) – in „Ins Tal“ ist #stage schmaler, das Bild soll aber
    // genauso stehen wie in „Anpassen“ (Sönke 18.11.2026: „nicht drehen“)
    const box = $('main').getBoundingClientRect();
    lay = box.height > box.width * 0.95 ? LAY.v : LAY.h;
    const L = lay, c = S.cyc, q = c.pt, hide = S.step === 1;
    // Schritt 4 zeigt das Bild aus „Anpassen“ (letzter Test); nach „Lernen zurücksetzen“ wie „Vergleichen“
    const st = S.step === 4 ? (c.applied ? 3 : 2) : S.step;
    const w = st === 3 ? c.after : c.before;
    let h = '';
    // Pinguin
    const [px, pb, ph] = L.peng, file = (q.y ? 'chin_' : 'adelie_') + ((S.oi % 2) + 1);
    h += '<ellipse cx="' + px + '" cy="' + (pb - 2) + '" rx="' + ph * 0.3 + '" ry="7" fill="#000" opacity=".35"/>';
    // Raten: schwarze Silhouette mit weißem Rand als SVG-Filter (CSS-filter an <image> kann Safari/iPad nicht)
    h += '<defs><filter id="sil" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2.5" result="d"/>' +
      '<feFlood flood-color="#eef4fb"/><feComposite in2="d" operator="in" result="rand"/><feFlood flood-color="#05080f"/><feComposite in2="SourceAlpha" operator="in" result="sw"/>' +
      '<feMerge><feMergeNode in="rand"/><feMergeNode in="sw"/></feMerge></filter></defs>';
    h += '<g' + (hide ? ' filter="url(#sil)"' : '') + '><image class="pgimg" href="img/frei/' + file + '.webp" x="' + (px - ph * 0.42) + '" y="' + (pb - ph) + '" width="' + ph * 0.84 + '" height="' + ph + '" preserveAspectRatio="xMidYMax meet"/></g>';
    if (hide) h += T(px + ph * 0.34, pb - ph + 30, '?', 34, COL.faint, 700);
    h += T(L.name[0], L.name[1], hide ? 'Welche Art?' : (q.y ? 'Zügelpinguin' : 'Adeliepinguin'), 19, hide ? COL.soft : COL.ink, 700);
    h += T(L.name[0], L.name[1] + 22, 'antippen = anderer Pinguin', 12.5, COL.faint, 600);
    // Trefferfläche: Pinguin antippen = ein anderer Pinguin mit anderen Werten (Sönke 18.11.2026)
    h += '<rect class="pghit" x="' + (px - ph * 0.5) + '" y="' + (pb - ph - 10) + '" width="' + ph + '" height="' + (ph + 52) + '" fill="transparent"/>';
    // Kanten Eingang → Neuron
    const [nx, ny, nr] = L.n;
    for (let k = 0; k < 2; k++) {
      const [ix, iy] = L.in[k], wv = w[k], col = wv >= 0 ? COL.pos : COL.neg, sw = 2 + Math.min(Math.abs(wv), 10) * 0.9;
      const x0 = lay === LAY.h ? ix + 60 : ix, y0 = lay === LAY.h ? iy : iy + 58;
      h += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + nx + '" y2="' + ny + '" stroke="' + col + '" stroke-width="' + sw.toFixed(1) + '" stroke-linecap="round" opacity=".85"/>';
    }
    for (let k = 0; k < 2; k++) {
      const [ix, iy] = L.in[k], x0 = lay === LAY.h ? ix + 60 : ix, y0 = lay === LAY.h ? iy : iy + 58;
      const t = lay === LAY.h ? 0.5 : 0.32, mx = x0 + (nx - x0) * t, my = y0 + (ny - y0) * t, wv = w[k];
      const txt = st === 3 ? f(c.before[k]) + (lay === LAY.h ? ' → ' : '→') + '<tspan fill="' + (c.after[k] >= c.before[k] ? COL.mint : COL.red) + '">' + f(c.after[k], 2) + '</tspan>'
                           : '· ' + f(wv);
      h += pill(mx, my, txt, wv >= 0 ? COL.pos : COL.neg, st === 3);
      if (lay === LAY.h) h += T(mx, my + (k ? 36 : -26), 'w' + (k ? '₂' : '₁'), 14, COL.faint, 700);
    }
    // Eingänge
    const names = ['Schnabel-Länge', 'Schnabel-Höhe'], mm = [q.len, q.dep], xs = [q.a, q.b];
    for (let k = 0; k < 2; k++) {
      const [ix, iy] = L.in[k];
      h += T(ix, iy - 40, names[k], 15, COL.soft, 600);
      h += '<rect x="' + (ix - 60) + '" y="' + (iy - 28) + '" width="120" height="56" rx="15" fill="#0f1b31" stroke="' + COL.mint + '" stroke-width="2"/>';
      h += T(ix, iy + 9, sf(xs[k], 2), 24, COL.ink, 700);
      h += T(ix, iy + 50, f(mm[k], 1) + ' mm', 13.5, COL.faint, 600);
    }
    // Neuron
    h += '<circle cx="' + nx + '" cy="' + ny + '" r="' + nr + '" fill="#0f1b31" stroke="' + COL.mint + '" stroke-width="3"/>';
    h += T(nx, ny + 12, 'σ', 34, COL.ink, 700);
    // ab „Vergleichen“: was σ genau rechnet (Ist nachvollziehbar)
    if (st >= 2) {
      const z = w[0] * q.a + w[1] * q.b;
      if (lay === LAY.h) h += T(nx, ny + nr + 26, 'σ(' + f(z, 2) + ') = ' + f(sig(z), 2), 16, COL.mint, 700);
      else h += T(nx + nr + 12, ny + 6, 'σ(' + f(z, 2) + ')', 15, COL.mint, 700, 'start') + T(nx + nr + 12, ny + 26, '= ' + f(sig(z), 2), 15, COL.mint, 700, 'start');
    }
    // Pfeil zum Ausgang
    const [[ax0, ay0], [ax1, ay1]] = L.arr, ang = Math.atan2(ay1 - ay0, ax1 - ax0);
    h += '<line x1="' + ax0 + '" y1="' + ay0 + '" x2="' + (ax1 - 8 * Math.cos(ang)) + '" y2="' + (ay1 - 8 * Math.sin(ang)) + '" stroke="' + COL.ink + '" stroke-width="2.5"/>' +
      '<path d="M' + ax1 + ',' + ay1 + ' l' + (-12 * Math.cos(ang - 0.45)).toFixed(1) + ',' + (-12 * Math.sin(ang - 0.45)).toFixed(1) +
      ' l' + (12 * Math.cos(ang - 0.45) - 12 * Math.cos(ang + 0.45)).toFixed(1) + ',' + (12 * Math.sin(ang - 0.45) - 12 * Math.sin(ang + 0.45)).toFixed(1) + 'z" fill="' + COL.ink + '"/>';
    // Ausgang: Prozent + Leiste Adelie 0 … Zügel 1
    const y = st === 3 ? c.yAfter : c.y;
    h += T(L.outT[0], L.outT[1], 'DAS NEURON SAGT', 12.5, COL.faint, 700);
    h += T(L.big[0], L.big[1], pct(y) + ' <tspan font-size="19" fill="' + COL.soft + '">Zügel</tspan>', 44, COL.ink, 700);
    const [b0, b1, by] = L.bar, X = v => b0 + v * (b1 - b0), hr = L.heads;
    h += NTBild.head('adelie', b0 - hr - 10, by, hr) + NTBild.head('chin', b1 + hr + 10, by, hr);
    h += T(b0 - hr - 10, L.lab, 'Adelie = 0', 13.5, COL.soft, 600) + T(b1 + hr + 10, L.lab, 'Zügel = 1', 13.5, COL.soft, 600);
    h += '<line x1="' + b0 + '" y1="' + by + '" x2="' + b1 + '" y2="' + by + '" stroke="' + COL.line + '" stroke-width="10" stroke-linecap="round"/>';
    if (st >= 2) {
      const sx = X(q.y), ix = X(y);
      h += '<line x1="' + ix.toFixed(1) + '" y1="' + by + '" x2="' + sx.toFixed(1) + '" y2="' + by + '" stroke="' + COL.red + '" stroke-width="10" stroke-linecap="round" opacity=".85"/>';
      h += '<circle cx="' + sx + '" cy="' + by + '" r="14" fill="none" stroke="' + COL.ink + '" stroke-width="2.4" stroke-dasharray="4 4"/>' + T(sx, by - 24, 'SOLL', 12.5, COL.ink, 700);
      if (st === 3) h += '<circle cx="' + X(c.y).toFixed(1) + '" cy="' + by + '" r="8" fill="' + COL.soft + '" opacity=".45"/>';
      const ex = lay === LAY.h ? (ix + sx) / 2 : L.big[0];
      h += T(ex.toFixed(1), L.err != null ? L.err : by + 34, 'Fehler ' + sf(q.y - y, 2), 15, COL.red, 700);
    }
    h += '<g class="mk" style="transform:translate(' + X(y).toFixed(1) + 'px,' + by + 'px)"><circle r="10" fill="' + COL.mint + '" stroke="#04201a" stroke-width="2"/></g>';
    const vb = L.vb;
    $('#stage').setAttribute('viewBox', '0 0 ' + vb[0] + ' ' + vb[1]);
    $('#stage').innerHTML = h;
  }

  /* ── Schritt 4: Karte der Fehler-Landschaft über (w₁, w₂) = Level 5 von oben ── */
  const MG = 64, NETC = [[11, 110, 106], [43, 120, 176], [109, 95, 208], [201, 182, 242]];
  let mapOff = null, segs = null;
  const peng = new Image(); peng.src = 'img/frei/main.webp'; peng.onload = () => { if (S.step === 4) drawMap(); };
  function buildMap() {
    const v = new Float32Array(MG * MG);
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < MG; j++) for (let i = 0; i < MG; i++) {
      const a = -R + (i + 0.5) / MG * 2 * R, b = R - (j + 0.5) / MG * 2 * R, L = Math.log(WP.loss(a, b) + 0.02);
      v[j * MG + i] = L; if (L < mn) mn = L; if (L > mx) mx = L;
    }
    mapOff = document.createElement('canvas'); mapOff.width = mapOff.height = MG;
    const ctx = mapOff.getContext('2d'), img = ctx.createImageData(MG, MG), lv = new Float32Array(MG * MG);
    for (let k = 0; k < MG * MG; k++) {
      const t = (v[k] - mn) / (mx - mn), s = t * 3, i0 = Math.min(2, Math.floor(s)), u = s - i0, c0 = NETC[i0], c1 = NETC[i0 + 1];
      for (let ch = 0; ch < 3; ch++) img.data[k * 4 + ch] = c0[ch] + (c1[ch] - c0[ch]) * u;
      img.data[k * 4 + 3] = 255; lv[k] = t * 12;
    }
    ctx.putImageData(img, 0, 0);
    segs = [];
    const P = (x, y) => [(x + 0.5) / MG, (y + 0.5) / MG];
    for (let y = 0; y < MG - 1; y++) for (let x = 0; x < MG - 1; x++) {
      const a = lv[y * MG + x], b = lv[y * MG + x + 1], c = lv[(y + 1) * MG + x + 1], d = lv[(y + 1) * MG + x];
      for (let k = Math.max(1, Math.ceil(Math.min(a, b, c, d))); k <= Math.min(11, Math.max(a, b, c, d)); k++) {
        const pts = [];
        const cut = (v0, v1, x0, y0, x1, y1) => { if ((v0 < k) === (v1 < k)) return; const t = (k - v0) / (v1 - v0); pts.push(P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)); };
        cut(a, b, x, y, x + 1, y); cut(b, c, x + 1, y, x + 1, y + 1); cut(c, d, x + 1, y + 1, x, y + 1); cut(d, a, x, y + 1, x, y);
        if (pts.length >= 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        if (pts.length === 4) segs.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      }
    }
  }
  function drawMap() {
    const cv = $('#map'), wrap = $('#mapWrap');
    const Z = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight) - 4);
    if (Z < 60) return;
    if (!mapOff) buildMap();
    const dpr = low ? 1 : Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(Z * dpr)) { cv.width = cv.height = Math.round(Z * dpr); cv.style.width = cv.style.height = Z + 'px'; }
    const x = cv.getContext('2d'), W = Z, H = Z;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.imageSmoothingEnabled = true;
    x.drawImage(mapOff, 0, 0, W, H);
    x.strokeStyle = 'rgba(235,245,255,.28)'; x.lineWidth = 1; x.beginPath();
    for (let q = 0; q < segs.length; q += 4) { x.moveTo(segs[q] * W, segs[q + 1] * H); x.lineTo(segs[q + 2] * W, segs[q + 3] * H); }
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.setLineDash([3, 5]); x.beginPath();
    x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); x.setLineDash([]);
    const toPx = w => [(clamp(w[0], -R, R) / R + 1) / 2 * W, (1 - clamp(w[1], -R, R) / R) / 2 * H];
    // Achsen
    x.font = '700 13px JetBrains Mono, monospace'; x.fillStyle = 'rgba(255,255,255,.85)';
    x.textAlign = 'right'; x.fillText('w₁ Länge →', W - 8, H / 2 - 8);
    x.textAlign = 'left'; x.fillText('↑ w₂ Höhe', W / 2 + 8, 18);
    // Spur
    if (S.trail.length > 1) {
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 2; x.beginPath();
      S.trail.forEach((t, i) => { const p = toPx(t); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
      x.stroke();
      x.fillStyle = '#fff';
      for (const t of S.trail) { const p = toPx(t); x.beginPath(); x.arc(p[0], p[1], 2.2, 0, 7); x.fill(); }
    }
    // Pfeil = der letzte Sprung (alt → neu, genau die Zahlen links an den Kanten)
    const cur = toPx(S.w);
    if (S.cyc.applied) {
      const from = toPx(S.cyc.before), dx = cur[0] - from[0], dy = cur[1] - from[1];
      if (Math.hypot(dx, dy) > 4) {
        const a = Math.atan2(dy, dx);
        x.strokeStyle = COL.mint; x.fillStyle = COL.mint; x.lineWidth = 4; x.lineCap = 'round';
        x.beginPath(); x.moveTo(from[0], from[1]); x.lineTo(cur[0] - 8 * Math.cos(a), cur[1] - 8 * Math.sin(a)); x.stroke();
        x.beginPath(); x.moveTo(cur[0], cur[1]);
        x.lineTo(cur[0] - 14 * Math.cos(a - 0.45), cur[1] - 14 * Math.sin(a - 0.45)); x.lineTo(cur[0] - 14 * Math.cos(a + 0.45), cur[1] - 14 * Math.sin(a + 0.45)); x.fill();
      }
    }
    if (peng.complete && peng.naturalWidth) {
      const ph = Math.max(34, Z * 0.09), pw = ph * peng.naturalWidth / peng.naturalHeight;
      x.drawImage(peng, cur[0] - pw / 2, cur[1] - ph + 4, pw, ph);
    }
  }
  function sideHtml() {
    const right = N - WP.wrong(S.w[0], S.w[1]);
    return '<span><b>Ort</b> = w₁, w₂</span><span><b>Höhe</b> = Fehler aller 136</span><span><b>Pfeil</b> = letzter Sprung</span>' +
      '<span class="sc">richtig sortiert <b>' + right + '</b> von ' + N + '</span>';
  }
  function bindMap() {
    const cv = $('#map');
    const set = ev => {
      const r = cv.getBoundingClientRect();
      S.w = [clamp(((ev.clientX - r.left) / r.width * 2 - 1) * R, -R, R), clamp((1 - (ev.clientY - r.top) / r.height * 2) * R, -R, R)];
      S.trail = [S.w.slice()]; S.losses = [WP.loss(S.w[0], S.w[1])];
      newCycle(); S.n = 0;
      drawTal(); drawStage(); $('#explain').innerHTML = explain();
    };
    cv.addEventListener('pointerdown', ev => { S.drag = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ } set(ev); });
    cv.addEventListener('pointermove', ev => { if (S.drag) set(ev); });
    const up = () => { S.drag = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  bindMap();
  function drawTal() {
    $('#side').innerHTML = sideHtml();
    drawMap();
  }
  // Ins Tal: neuer Pinguin testen + einmal anpassen = ein Sprung auf der Karte
  function hop() {
    S.oi++; newCycle();
    S.w = S.cyc.after.slice(); S.cyc.applied = true; record(); S.n++;
    render();
  }
  function resetLearn() {
    S.w = START.slice(); S.trail = []; S.losses = []; record(); S.n = 0;
    newCycle();
    render();
  }
  // Pinguin antippen = ein anderer Pinguin (in „Anpassen“ mit seiner eigenen Anpassung)
  function otherPeng() {
    if (S.step === 4) { hop(); return; }
    const c = S.cyc;
    if (c.applied) { S.w = c.before.slice(); S.trail.pop(); S.losses.pop(); }
    S.oi++; newCycle();
    if (S.step === 3) { S.w = S.cyc.after.slice(); S.cyc.applied = true; record(); }
    render();
  }
  $('#stage').addEventListener('click', e => { if (e.target.closest && e.target.closest('.pghit')) otherPeng(); });

  /* ── Text + Knöpfe ── */
  const STEPS = ['Raten', 'Vergleichen', 'Anpassen', 'Ins Tal'];
  // die Lernregel einmal mit Zahlen – für das obere Gewicht w₁ (w₂ rechnet die Klasse selbst nach)
  const par = v => v < 0 ? '(' + f(v, 2) + ')' : f(v, 2);
  function w1Rule(c) {
    return '<span class="f">w₁ neu = ' + f(c.before[0], 2) + ' + ' + f(S.lr, S.lr < 1 ? 2 : 1) + ' × ' + par(c.err) + ' × ' + par(c.pt.a) +
      ' ≈ <b>' + f(c.after[0], 2) + '</b></span>';
  }
  function explain() {
    const c = S.cyc, q = c.pt, z = c.before[0] * q.a + c.before[1] * q.b;
    switch (S.step) {
      case 1: return '<p>Das Neuron sieht kein Foto – nur <b>zwei Zahlen</b> vom Schnabel. Es rechnet sie mal seine <b>Gewichte</b> w₁, w₂ und sagt: <b>' + pct(c.y) + ' Zügel</b>.</p>' +
        '<span class="f">Länge · w₁ + Höhe · w₂ → σ → %</span>';
      case 2: return '<p>Es ist ein <b>' + (c.pt.y ? 'Zügelpinguin' : 'Adeliepinguin') + '</b>. Das Neuron lag um <b>' + f(Math.abs(c.err), 2) + '</b> daneben – das ist der <b>Fehler</b>.</p>' +
        '<span class="f">Ist = σ(' + f(q.a, 2) + ' · ' + f(c.before[0], 2) + ' + ' + f(q.b, 2) + ' · ' + f(c.before[1], 2) + ') = σ(' + f(z, 2) + ') = ' + f(c.y, 2) + '</span> ' +
        '<span class="f">Fehler = Soll − Ist = ' + c.pt.y + ' − ' + f(c.y, 2) + ' = ' + sf(c.err, 2) + '</span>';
      case 3: return '<p>Jedes Gewicht rückt ein Stück – so, dass der Fehler <b>kleiner</b> wird. Jetzt sagt das Neuron <b>' + pct(c.yAfter) + ' Zügel</b>' +
        (Math.abs(c.pt.y - c.yAfter) < Math.abs(c.err) ? ' – näher dran.' : ' – zu weit! Lernrate zu groß.') + '</p>' +
        '<span class="f">neu = alt + Lernrate × Fehler × Eingang</span> ' + w1Rule(c);
      default: return c.applied
        ? '<p><b>Test ' + (S.n + 1) + ':</b> ' + (q.y ? 'Zügelpinguin' : 'Adeliepinguin') + ' – das Neuron sagte <b>' + pct(c.y) + ' Zügel</b>, Fehler <b>' + sf(c.err, 2) + '</b>. ' +
          'Einmal angepasst = <b>ein Sprung</b> auf der Karte.</p><span class="f">neu = alt + Lernrate × Fehler × Eingang</span> ' + w1Rule(c)
        : '<p>Jeder <b>Sprung</b>: einen neuen Pinguin testen, den Fehler messen, die Gewichte <b>einmal anpassen</b>.</p>';
    }
  }
  const lrPos = v => Math.round(Math.log(v / 0.5) / Math.log(60) * 100);   // 0,5 … 30
  const lrVal = s => 0.5 * Math.pow(60, s / 100);
  function ctrlHtml() {
    const st = S.step, back = st > 1 ? '<button class="btn" id="bBack" type="button">‹</button>' : '';
    if (st === 1) return '<button class="btn primary" id="bNext" type="button">Auflösen ›</button>';
    if (st === 2) return back + '<button class="btn primary" id="bNext" type="button">Gewichte anpassen ›</button>';
    if (st === 3) return back + '<button class="btn" id="bAgain" type="button">↻ Nächster Pinguin</button><button class="btn primary" id="bNext" type="button">Ins Tal ›</button>';
    return back + '<button class="btn" id="bReset" type="button">Lernen zurücksetzen</button>' +
      '<button class="btn primary" id="bJump" type="button">Neuer Pinguin · Sprung ›</button>';
  }

  function drawAll() { drawStage(); if (S.step === 4) drawTal(); }
  function render() {
    const st = S.step;
    $('#steps').innerHTML = STEPS.map((s, i) => '<button class="stp' + (i + 1 === st ? ' on' : i + 1 < st ? ' done' : '') + '" data-s="' + (i + 1) + '" type="button"><i>' + (i + 1) + '</i><span>' + s + '</span></button>').join('');
    $('#steps').querySelectorAll('.stp').forEach(b => b.addEventListener('click', () => go(+b.dataset.s)));
    document.body.classList.toggle('s4', st === 4);
    $('#tal').hidden = st !== 4;
    // Lernrate oben über dem Netz, ab „Anpassen“ und bleibt in „Ins Tal“ (Sönke 18.11.2026)
    document.body.classList.toggle('lrOn', st >= 3);
    $('#lrBox').hidden = st < 3;
    $('#lr').value = lrPos(S.lr); $('#lrV').textContent = f(S.lr, S.lr < 1 ? 2 : 1);
    $('#explain').innerHTML = explain();
    $('#ctrl').innerHTML = ctrlHtml();
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('#bBack', () => go(st - 1));
    on('#bNext', () => go(st + 1));
    on('#bAgain', () => { S.oi++; newCycle(); go(1, true); });
    on('#bJump', hop);
    on('#bReset', resetLearn);
    requestAnimationFrame(drawAll);
  }
  // Schritt wechseln: 3 übernimmt die neuen Gewichte, zurück davor nimmt sie wieder weg
  function go(n, keep) {
    n = clamp(n, 1, 4);
    const from = S.step, c = S.cyc;
    if (n === 3 && !c.applied) { plan(); S.w = c.after.slice(); c.applied = true; record(); }
    if (n < 3 && c.applied && !keep) { S.w = c.before.slice(); c.applied = false; S.trail.pop(); S.losses.pop(); }
    if (from === 4 && n < 4) { newCycle(); if (n === 3) { S.w = S.cyc.after.slice(); S.cyc.applied = true; record(); } }
    S.step = n;
    render();
  }
  // Lernrate ändern: in „Anpassen“ rechnet derselbe Pinguin die Anpassung neu (Bild + Formel), in „Ins Tal“ gilt sie ab dem nächsten Sprung
  $('#lr').addEventListener('input', () => {
    S.lr = +lrVal(+$('#lr').value).toFixed(1); $('#lrV').textContent = f(S.lr, S.lr < 1 ? 2 : 1);
    if (S.step === 3) { S.trail.pop(); S.losses.pop(); plan(); S.w = S.cyc.after.slice(); record(); drawStage(); $('#explain').innerHTML = explain(); }
    else if (S.step === 4 && !S.cyc.applied) plan();
  });
  window.addEventListener('resize', drawAll);
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && S.step < 4) go(S.step + 1);
    else if (e.key === 'ArrowLeft' && S.step > 1) go(S.step - 1);
  });
  render();
})();
