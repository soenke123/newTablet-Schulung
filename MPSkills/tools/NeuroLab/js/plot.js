/* ══════════════════════════════════════════════════════════════
   NeuroLab · plot.js — Diagramme: Fläche (2D), Würfel (3D), Kurve
   ══════════════════════════════════════════════════════════════
   NLPlot.draw(canvas, o)
     o = { sc, net, rows, slot, regions, lines, selected, pick(i), print }
   - 2D: Punkte = Beispiele, Hintergrund = was das Netz sagen würde,
     jede Gerade = ein Neuron der ersten Schicht (in seiner Farbe, wie
     der Punkt über dem Neuron im Feld).
   - 3D: dasselbe im Würfel, jedes Neuron der ersten Schicht = Ebene.
     Mit dem Finger drehen.
   - Kurve: ein Eingang → eine Zahl; jedes ReLU-Neuron = ein Knick.
   Falsch eingeordnete Beispiele bekommen einen Ring.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz;
  const F = window.NLFeld;
  const C0 = '#5c7cfa', C1 = '#f08c00';

  function css(name, fb) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(a, b, t) {
    const pa = a.replace('#', ''), pb = b.replace('#', '');
    const c = i => Math.round(parseInt(pa.slice(i, i + 2), 16) * (1 - t) + parseInt(pb.slice(i, i + 2), 16) * t);
    return [c(0), c(2), c(4)];
  }

  function range(rows, d, sc) {
    let lo = Infinity, hi = -Infinity;
    rows.forEach(r => { lo = Math.min(lo, r.x[d]); hi = Math.max(hi, r.x[d]); });
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const binary = rows.every(r => r.x[d] === 0 || r.x[d] === 1);
    if (binary) return [-0.5, 1.5];
    const p = (hi - lo) * 0.12;
    return [lo - p, hi + p];
  }

  function fit(canvas) {
    const dpr = (document.documentElement.dataset.motion === 'low') ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320, h = canvas.clientHeight || 260;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function connected(net) { return net && net.outputs.some(o => o.src); }

  /* Farbe, mit der ein Beispiel gemalt wird */
  function pointColor(sc, r, slot) {
    if (sc.groups && r.grp != null) return sc.groups[r.grp].color;
    const t = r.t[slot == null ? 0 : slot];
    return t >= 0.5 ? C1 : C0;
  }

  /* richtig eingeordnet? */
  function rowOk(sc, net, r, y, slot) {
    if (sc.cls) {
      let bi = -1, best = -Infinity;
      y.forEach((v, i) => { if (v != null && v > best) { best = v; bi = i; } });
      return bi >= 0 && r.t[bi] === 1;
    }
    const k = slot == null ? 0 : slot;
    if (y[k] == null) return null;
    return Math.abs(y[k] - r.t[k]) < (sc.tol || 0.5);
  }

  function draw(canvas, o) {
    const t = o.sc.plot && o.sc.plot.type;
    if (t === '3d') return draw3d(canvas, o);
    if (t === 'curve') return drawCurve(canvas, o);
    return draw2d(canvas, o);
  }

  /* ── Achsen-Beschriftung ─────────────────────────────────── */
  function niceStep(span) {
    const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function ticks(inp, lo, hi) {
    // in echten Einheiten, falls vorhanden
    if (inp && inp.real) {
      const a = inp.real(lo), b = inp.real(hi);
      const st = niceStep(b - a);
      const out = [];
      for (let v = Math.ceil(a / st) * st; v <= b; v += st) out.push({ n: inp.norm(v), s: String(Math.round(v)) });
      return out;
    }
    if (hi - lo <= 2.01 && lo >= -0.51 && hi <= 1.51) return [{ n: 0, s: '0' }, { n: 1, s: '1' }];
    const st = niceStep(hi - lo), out = [];
    for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push({ n: v, s: F.fmt(v, 1) });
    return out;
  }

  function draw2d(canvas, o) {
    const { sc, net, rows } = o;
    const { ctx, w, h } = fit(canvas);
    const P = o.print;
    const ink = P ? '#222' : css('--ink-soft', '#475853');
    const line = P ? '#ccc' : css('--line', '#dfe7e5');
    ctx.clearRect(0, 0, w, h);
    if (P) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    const [dx, dy] = sc.plot.ax;
    const rx = range(rows.length ? rows : [{ x: [0, 0] }, { x: [1, 1] }], dx, sc);
    const ry = range(rows.length ? rows : [{ x: [0, 0] }, { x: [1, 1] }], dy, sc);
    const padL = 46, padB = 38, padT = 12, padR = 12;
    const W = w - padL - padR, H = h - padT - padB;
    const X = v => padL + (v - rx[0]) / (rx[1] - rx[0]) * W;
    const Y = v => padT + H - (v - ry[0]) / (ry[1] - ry[0]) * H;
    const slot = o.slot || 0;
    const live = connected(net);

    // Hintergrund: Antwort des Netzes
    if (live && o.regions !== false) {
      // in ein kleines Bild rechnen und weich hochskalieren (keine Gitterstreifen)
      const G = 64;
      const off = canvas._off || (canvas._off = document.createElement('canvas'));
      off.width = G; off.height = G;
      const octx = off.getContext('2d');
      const img = octx.createImageData(G, G);
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
        const vx = rx[0] + (i + 0.5) / G * (rx[1] - rx[0]);
        const vy = ry[1] - (j + 0.5) / G * (ry[1] - ry[0]);
        const x = new Array(net.inputs.length).fill(0); x[dx] = vx; x[dy] = vy;
        const y = N.predict(net, x);
        let col = null, a = 0;
        if (sc.cls && sc.groups) {
          let bi = -1, best = -Infinity;
          y.forEach((v, k) => { if (v != null && v > best) { best = v; bi = k; } });
          if (bi >= 0) { col = mix(sc.groups[bi].color, sc.groups[bi].color, 0); a = 0.12 + 0.22 * Math.max(0, Math.min(1, best)); }
        } else {
          const v = y[slot];
          if (v != null) {
            const pos = sc.groups ? (sc.groups.find((g, gi) => rows.some(r => r.grp === gi && r.t[slot] === 1)) || {}).color || C1 : C1;
            const vv = Math.max(0, Math.min(1, v));
            col = mix(sc.groups ? '#9aa5b1' : C0, pos, vv); a = 0.16 + 0.2 * Math.abs(vv - 0.5) * 2;
          }
        }
        const k = (j * G + i) * 4;
        if (col) { img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = Math.round(a * 255); }
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = !(net.layers.some(L => L.some(n => n.act === 'step')));
      ctx.drawImage(off, padL, padT, W, H);
      ctx.restore();
    }

    // Achsen
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, W, H);
    ctx.fillStyle = ink; ctx.font = '11px Outfit, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ticks(sc.inputs[dx], rx[0], rx[1]).forEach(tk => {
      const x = X(tk.n); if (x < padL - 1 || x > padL + W + 1) return;
      ctx.fillText(tk.s, x, padT + H + 14);
      ctx.beginPath(); ctx.moveTo(x, padT + H); ctx.lineTo(x, padT + H + 4); ctx.stroke();
    });
    ctx.textAlign = 'right';
    ticks(sc.inputs[dy], ry[0], ry[1]).forEach(tk => {
      const y = Y(tk.n); if (y < padT - 1 || y > padT + H + 1) return;
      ctx.fillText(tk.s, padL - 6, y + 4);
    });
    ctx.textAlign = 'center'; ctx.font = '600 12px Outfit, system-ui, sans-serif';
    const lab = i => sc.inputs[i].label + (sc.inputs[i].unit ? ' (' + sc.inputs[i].unit + ')' : '');
    ctx.fillText(lab(dx), padL + W / 2, h - 6);
    ctx.save(); ctx.translate(12, padT + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(lab(dy), 0, 0); ctx.restore();

    // Punkte
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, W, H); ctx.clip();
    const pts = [];
    rows.forEach((r, i) => {
      const x = X(r.x[dx]), y = Y(r.x[dy]);
      pts.push({ x, y, i });
      const c = pointColor(sc, r, slot);
      const big = rows.length <= 16 ? 9 : 5;
      ctx.beginPath(); ctx.arc(x, y, big, 0, Math.PI * 2);
      if (r.test) { ctx.fillStyle = P ? '#fff' : css('--surface', '#fff'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke(); }
      else { ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke(); }
      if (live && !P) {
        const ok = rowOk(sc, net, r, N.predict(net, r.x), slot);
        if (ok === false) {
          ctx.beginPath(); ctx.arc(x, y, big + 4, 0, Math.PI * 2);
          ctx.lineWidth = 2; ctx.strokeStyle = css('--warn', '#d43a52'); ctx.stroke();
        }
      }
      if (o.selRow === i) {
        ctx.beginPath(); ctx.arc(x, y, big + 7, 0, Math.PI * 2);
        ctx.lineWidth = 2.5; ctx.strokeStyle = css('--ink', '#0d1a17'); ctx.stroke();
      }
    });

    // Geraden der ersten Schicht
    if (net && net.layers[0] && o.lines !== false && net.inputs.length === 2) {
      net.layers[0].forEach((nr, n) => {
        const [a, b] = [nr.w[dx], nr.w[dy]], c = nr.b;
        if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) return;
        let p1, p2;
        if (Math.abs(b) > Math.abs(a)) {
          p1 = [rx[0], -(a * rx[0] + c) / b]; p2 = [rx[1], -(a * rx[1] + c) / b];
        } else {
          p1 = [-(b * ry[0] + c) / a, ry[0]]; p2 = [-(b * ry[1] + c) / a, ry[1]];
        }
        const sel = o.selected && o.selected.l === 0 && o.selected.n === n;
        ctx.strokeStyle = P && P.bw ? '#000' : F.LINE_COLORS[n % F.LINE_COLORS.length];
        ctx.lineWidth = sel ? 4 : 2.4;
        ctx.setLineDash(sel ? [] : [8, 5]);
        ctx.beginPath(); ctx.moveTo(X(p1[0]), Y(p1[1])); ctx.lineTo(X(p2[0]), Y(p2[1])); ctx.stroke();
        // kleiner Pfeil auf die Seite, auf der das Neuron feuert
        const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
        const nl = Math.hypot(a, b);
        const sx = X(mx), sy = Y(my);
        const ex = X(mx + a / nl * (rx[1] - rx[0]) * 0.07), ey = Y(my + b / nl * (ry[1] - ry[0]) * 0.07);
        ctx.setLineDash([]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      });
      ctx.setLineDash([]);
    }
    ctx.restore();
    canvas._pts = pts;
    bindPick(canvas, o);
  }

  function bindPick(canvas, o) {
    canvas._pick = o.pick;
    if (canvas._bound) return;
    canvas._bound = true;
    canvas.addEventListener('click', (e) => {
      if (!canvas._pick || !canvas._pts || canvas._dragged) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 16;
      canvas._pts.forEach(p => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } });
      if (best) canvas._pick(best.i);
    });
  }

  /* ── Kurve ───────────────────────────────────────────────── */
  function drawCurve(canvas, o) {
    const { sc, net, rows } = o;
    const { ctx, w, h } = fit(canvas);
    const P = o.print;
    ctx.clearRect(0, 0, w, h);
    if (P) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    const padL = 40, padB = 30, padT = 12, padR = 12;
    const W = w - padL - padR, H = h - padT - padB;
    const rx = [-1.15, 1.15];
    let lo = Math.min(...rows.map(r => r.t[0])), hi = Math.max(...rows.map(r => r.t[0]));
    const p = (hi - lo) * 0.25; lo -= p; hi += p;
    const X = v => padL + (v - rx[0]) / (rx[1] - rx[0]) * W;
    const Y = v => padT + H - (v - lo) / (hi - lo) * H;
    ctx.strokeStyle = P ? '#ccc' : css('--line', '#ddd'); ctx.strokeRect(padL, padT, W, H);
    ctx.fillStyle = P ? '#222' : css('--ink-soft', '#555'); ctx.font = '11px Outfit, system-ui, sans-serif'; ctx.textAlign = 'center';
    [-1, -0.5, 0, 0.5, 1].forEach(v => ctx.fillText(F.fmt(v, 1), X(v), padT + H + 14));
    ctx.font = '600 12px Outfit, system-ui, sans-serif';
    ctx.fillText('x', padL + W / 2, h - 4);
    ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, W, H); ctx.clip();
    const pts = [];
    rows.forEach((r, i) => {
      const x = X(r.x[0]), y = Y(r.t[0]);
      pts.push({ x, y, i });
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      if (r.test) { ctx.lineWidth = 2; ctx.strokeStyle = C0; ctx.stroke(); }
      else { ctx.fillStyle = C0; ctx.fill(); }
    });
    if (connected(net)) {
      ctx.strokeStyle = P ? '#000' : C1; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const v = rx[0] + i / 200 * (rx[1] - rx[0]);
        const y = N.predict(net, [v])[0];
        if (i === 0) ctx.moveTo(X(v), Y(y)); else ctx.lineTo(X(v), Y(y));
      }
      ctx.stroke();
      // Knicke der ReLU-Neuronen in Schicht 1
      if (net.layers[0]) net.layers[0].forEach((nr, n) => {
        if (nr.act !== 'relu' || Math.abs(nr.w[0]) < 1e-6) return;
        const k = -nr.b / nr.w[0];
        if (k < rx[0] || k > rx[1]) return;
        ctx.strokeStyle = F.LINE_COLORS[n % F.LINE_COLORS.length]; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(X(k), padT); ctx.lineTo(X(k), padT + H); ctx.stroke(); ctx.setLineDash([]);
      });
    }
    ctx.restore();
    canvas._pts = pts;
    bindPick(canvas, o);
  }

  /* ── Würfel (3D) ─────────────────────────────────────────── */
  function draw3d(canvas, o) {
    const { sc, net, rows } = o;
    const { ctx, w, h } = fit(canvas);
    const P = o.print;
    if (!canvas._rot) { canvas._rot = { yaw: -0.7, pitch: 0.42 }; bindRotate(canvas); }
    canvas._redraw = () => draw3d(canvas, o);
    const R = canvas._rot;
    ctx.clearRect(0, 0, w, h);
    if (P) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    const ax = sc.plot.ax;
    const rg = ax.map(d => range(rows, d, sc));
    const c = rg.map(r => (r[0] + r[1]) / 2), hs = rg.map(r => (r[1] - r[0]) / 2);
    const s = Math.min(w, h) * 0.26;
    const cy = Math.cos(R.yaw), sy = Math.sin(R.yaw), cp = Math.cos(R.pitch), sp = Math.sin(R.pitch);
    // u = Würfelkoordinaten in [-1, 1]; Achse 0 → x, 1 → hoch, 2 → Tiefe
    const proj = (u) => {
      const x = u[0], y = u[1], z = u[2];
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return [w / 2 + x1 * s, h / 2 - y1 * s, z2];
    };
    const U = (x) => ax.map((d, k) => (x[d] - c[k]) / hs[k]);
    // Würfelkanten
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1]);
    const edges = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = (i ^ j); if (d === 1 || d === 2 || d === 4) edges.push([i, j]);
    }
    ctx.strokeStyle = P ? '#bbb' : css('--line', '#ccc'); ctx.lineWidth = 1;
    edges.forEach(([i, j]) => {
      const a = proj(corners[i]), b = proj(corners[j]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    // Achsennamen
    ctx.fillStyle = P ? '#222' : css('--ink-soft', '#555'); ctx.font = '600 12px Outfit, system-ui, sans-serif'; ctx.textAlign = 'center';
    [[1.25, -1, -1], [-1, 1.2, -1], [-1, -1, 1.3]].forEach((u, k) => {
      const p = proj(u); const inp = sc.inputs[ax[k]];
      ctx.fillText(inp.label + (inp.unit ? ' (' + inp.unit + ')' : ''), p[0], p[1]);
    });
    // Ebenen
    if (net && net.layers[0] && net.inputs.length === 3) {
      net.layers[0].forEach((nr, n) => {
        const a = ax.map((d, k) => nr.w[d] * hs[k]);
        const b = nr.b + ax.reduce((acc, d, k) => acc + nr.w[d] * c[k], 0);
        const pts = [];
        edges.forEach(([i, j]) => {
          const p = corners[i], q = corners[j];
          const fp = a[0] * p[0] + a[1] * p[1] + a[2] * p[2] + b;
          const fq = a[0] * q[0] + a[1] * q[1] + a[2] * q[2] + b;
          if ((fp > 0) === (fq > 0) || fp === fq) return;
          const t = fp / (fp - fq);
          pts.push(proj([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]));
        });
        if (pts.length < 3) return;
        const mx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, my = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length;
        pts.sort((p, q) => Math.atan2(p[1] - my, p[0] - mx) - Math.atan2(q[1] - my, q[0] - mx));
        const col = F.LINE_COLORS[n % F.LINE_COLORS.length];
        const sel = o.selected && o.selected.l === 0 && o.selected.n === n;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
        ctx.fillStyle = hexA(col, sel ? 0.32 : 0.14); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
      });
    }
    // Punkte nach Tiefe sortiert
    const live = connected(net);
    const pp = rows.map((r, i) => ({ r, i, p: proj(U(r.x)) })).sort((a, b) => a.p[2] - b.p[2]);
    const pts = [];
    pp.forEach(({ r, i, p }) => {
      const col = pointColor(sc, r, 0);
      pts.push({ x: p[0], y: p[1], i });
      ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
      if (r.test) { ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); }
      if (live && !P && rowOk(sc, net, r, N.predict(net, r.x), 0) === false) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2); ctx.lineWidth = 1.6; ctx.strokeStyle = css('--warn', '#d43a52'); ctx.stroke();
      }
    });
    canvas._pts = pts;
    bindPick(canvas, o);
  }

  function bindRotate(canvas) {
    let last = null;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; canvas._dragged = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!last) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1];
      if (Math.abs(dx) + Math.abs(dy) > 3) canvas._dragged = true;
      last = [e.clientX, e.clientY];
      canvas._rot.yaw += dx * 0.01;
      canvas._rot.pitch = Math.max(-1.4, Math.min(1.4, canvas._rot.pitch + dy * 0.01));
      if (canvas._redraw) canvas._redraw();
    });
    const end = () => { last = null; setTimeout(() => { canvas._dragged = false; }, 0); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /* Fehlerkurve */
  function drawLoss(canvas, hist, P) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!hist.length) return;
    const max = Math.max(...hist, 1e-6);
    ctx.strokeStyle = css('--line', '#ddd'); ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.strokeStyle = css('--accent', '#00b37e'); ctx.lineWidth = 2; ctx.beginPath();
    hist.forEach((v, i) => {
      const x = 4 + i / Math.max(1, hist.length - 1) * (w - 8), y = h - 4 - v / max * (h - 10);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  window.NLPlot = { draw, drawLoss, rowOk, pointColor };
})();
