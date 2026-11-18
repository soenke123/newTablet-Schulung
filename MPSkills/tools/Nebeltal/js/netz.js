/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/netz.js   ·   Kleine Netze lesbar zeichnen
   ══════════════════════════════════════════════════════════════
   Immer das GANZE Netz: Eingänge links, Neuronen in der Mitte, Ausgang
   rechts. Jede Kante trägt ihre Zahl. Die Farbe sagt, wer sie bewegt:
     a   = Welt A / die eine Welt (orange)
     b   = Welt B (violett)
     fix = steht fest (grau, gestrichelt)
   Die Dicke wächst mit der Größe des Gewichts.

   NTNetz.draw(canvas, net)
     net = { nodes: [{ id, x, y, label, kind: 'in'|'n'|'out', sym, bias, group, act (0…1 Füllung), labelPos ('above') }],
             edges: [{ from, to, w, group, fixed }] }
     dim: true an Kante/Knoten = zurückgenommen (blass, ohne Zahl) – Level 8 gemeinsam: nur der eigene Teil
     des Netzes ist hell; biasHide am Knoten = Bias-Zahl nicht zeigen
     x, y in 0…1 (Anteil der Zeichenfläche)

   NTNetz.lights(el, cases, opts)   die vier Nester (Level 6/7, braucht js/bilder.js)
     cases = [{ s1 = Mama, s2 = Papa (±1), y = Ei ok, o, A?, B? }], opts.hidden = A/B-Spalten zeigen
   ══════════════════════════════════════════════════════════════ */

window.NTNetz = (function () {
  'use strict';

  const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const COL = { a: '#f27828', b: '#8b5cf6', fix: null, c0: '#2f80ed', c1: '#f27828', c2: '#12a37a' };   // c0–c2: Labor (Adelie, Zügel, Esel)

  function draw(c, net) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#222';
    const soft = css.getPropertyValue('--ink-faint').trim() || '#888';
    const surf = css.getPropertyValue('--surface').trim() || '#fff';
    // net.big (Level 8, Kasten groß in der Mitte): Kreise und Zahlen größer
    const fz = net.big ? 1.4 : 1, F = n => Math.round(n * fz * 10) / 10 + 'px';
    const pad = 14, R = net.biasInside ? Math.max(17, Math.min(net.big ? 36 : 23, H * 0.11)) : Math.max(12, Math.min(19, H * 0.12));
    const P = n => [pad + 34 + n.x * (W - 2 * pad - 68), pad + n.y * (H - 2 * pad)];
    const byId = {};
    for (const n of net.nodes) byId[n.id] = n;
    const col = g => COL[g] || (g && g[0] === '#' ? g : soft);   // Gruppe oder direkt eine Farbe

    // Kanten
    const labels = [];
    for (const e of net.edges) {
      const a = byId[e.from], b = byId[e.to];
      const [x0, y0] = P(a), [x1, y1] = P(b);
      const r0 = a.kind === 'in' ? 5 : R, r1 = b.kind === 'out' ? 8 : R;
      const d = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / d, uy = (y1 - y0) / d;
      x.strokeStyle = col(e.group);
      x.lineWidth = e.fixed ? 1.6 : 1.2 + Math.min(7, Math.abs(e.w) * 0.75);
      x.setLineDash(e.fixed ? [4, 4] : []);
      x.globalAlpha = e.dim ? 0.16 : e.fixed ? 0.75 : 0.95;
      if (e.dim) x.lineWidth = Math.min(x.lineWidth, 2.4);
      x.beginPath(); x.moveTo(x0 + ux * r0, y0 + uy * r0); x.lineTo(x1 - ux * r1, y1 - uy * r1); x.stroke();
      x.setLineDash([]); x.globalAlpha = 1;
      // Zahl etwas vor der Mitte, auf der Seite des Ziels versetzt
      const t = e.labelAt || 0.42;
      if (!e.noLabel && !e.dim) labels.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, txt: (e.w > 0 && !e.fixed ? '+' : '') + fmt(e.w, e.fixed ? 0 : 1), color: col(e.group), fixed: e.fixed });
    }
    x.font = '700 ' + F(11.5) + ' Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const l of labels) {
      const w = x.measureText(l.txt).width + 8 * fz;
      x.fillStyle = surf; x.globalAlpha = 0.92;
      x.beginPath(); roundRect(x, l.x - w / 2, l.y - 8 * fz, w, 16 * fz, 5); x.fill();
      x.globalAlpha = 1; x.fillStyle = l.fixed ? soft : l.color;
      x.fillText(l.txt, l.x, l.y + 0.5);
    }

    // Knoten
    for (const n of net.nodes) {
      const [px, py] = P(n);
      x.globalAlpha = n.dim ? 0.4 : 1;
      if (n.kind === 'in') {
        x.fillStyle = ink; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
        x.font = '600 ' + F(12) + ' Outfit, sans-serif'; x.textAlign = 'right'; x.fillStyle = ink;
        x.fillText(n.label, px - 9, py + 0.5);
      } else if (n.kind === 'out') {
        x.fillStyle = ink; x.beginPath(); x.moveTo(px + 8, py); x.lineTo(px - 4, py - 6); x.lineTo(px - 4, py + 6); x.fill();
        x.font = '600 12px Outfit, sans-serif'; x.textAlign = 'left';
        x.fillText(n.label, px + 12, py + 0.5);
      } else {
        x.fillStyle = surf; x.strokeStyle = n.group ? col(n.group) : ink; x.lineWidth = n.group ? 2.6 : 2;
        x.beginPath(); x.arc(px, py, R, 0, 7); x.fill();
        // n.act (0…1): wie stark das Neuron gerade „ja“ sagt – füllt es in seiner Farbe (Level 8, Pinguin für Pinguin)
        if (n.act != null) { x.globalAlpha = 0.08 + 0.62 * Math.max(0, Math.min(1, n.act)); x.fillStyle = col(n.group); x.fill(); x.globalAlpha = n.dim ? 0.4 : 1; }
        x.stroke();
        x.fillStyle = ink; x.textAlign = 'center';
        // Bias im Neuron (net.biasInside): Zeichen oben, Bias-Zahl darunter
        const inside = net.biasInside && n.bias != null && !n.biasHide;
        x.font = '700 ' + Math.round(R * (inside ? 0.62 : 0.8)) + 'px Outfit, sans-serif';
        x.fillText(n.sym || 'σ', px, inside ? py - R * 0.3 : py + 1);
        if (inside) {
          x.font = '700 ' + Math.round(Math.min(12 * fz, R * 0.52)) + 'px Outfit, sans-serif';
          x.fillStyle = n.biasGroup ? col(n.biasGroup) : soft;
          x.fillText((n.bias > 0 ? '+' : '') + fmt(n.bias, n.biasD || 0), px, py + R * 0.42);
        }
        if (n.label) {
          x.font = '700 ' + F(12) + ' Outfit, sans-serif'; x.fillStyle = n.group ? col(n.group) : soft;
          // labelPos 'above': mittig über dem Neuron – rechts oben läge die Zahl der Kante zum Ausgang
          if (n.labelPos === 'above') { x.textAlign = 'center'; x.fillText(n.label, px, py - R - 6); }
          else { x.textAlign = 'left'; x.fillText(n.label, px + R + 4, py - R + 3); }
          x.textAlign = 'center';
        }
        if (n.bias != null && !net.biasInside && !n.biasHide) {
          x.font = (n.biasD ? '700 11.5px' : '600 10.5px') + ' Outfit, sans-serif'; x.fillStyle = n.biasGroup ? col(n.biasGroup) : soft;
          x.fillText((n.biasName ? n.biasName + ' ' : 'Bias ') + (n.bias > 0 ? '+' : '') + fmt(n.bias, n.biasD || 0), px, py + R + 9);
        }
      }
    }
    x.globalAlpha = 1;
  }

  function roundRect(x, l, t, w, h, r) {
    x.moveTo(l + r, t); x.lineTo(l + w - r, t); x.quadraticCurveTo(l + w, t, l + w, t + r);
    x.lineTo(l + w, t + h - r); x.quadraticCurveTo(l + w, t + h, l + w - r, t + h);
    x.lineTo(l + r, t + h); x.quadraticCurveTo(l, t + h, l, t + h - r);
    x.lineTo(l, t + r); x.quadraticCurveTo(l, t, l + r, t);
  }

  // Das Nest: Elternteil am Nest = kleiner Pinguin, weg = Welle mit Fisch;
  // „soll“ = Haken/Kreuz, „Netz“ = Ei, je grüner, desto sicherer „gut versorgt“.
  const pct = v => Math.round(v * 100) + ' %';
  const who = (s, scarf, name) => '<span class="who" title="' + name + (s > 0 ? ' am Nest' : ' fischt') + '">' +
    (s > 0 ? NTBild.icon('peng', scarf) : NTBild.icon('away')) + '</span>';

  function lights(el, cases, opts) {
    opts = opts || {};
    let h = '<table class="lights"><thead><tr><th>Mama</th><th>Papa</th><th>soll</th>' +
      (opts.hidden ? '<th class="ha">A</th><th class="hb">B</th>' : '') + '<th>Netz: Ei ok?</th></tr></thead><tbody>';
    for (const c of cases) {
      const ok = (c.o > 0.5) === (c.y === 1);
      h += '<tr class="' + (ok ? 'ok' : 'bad') + '"><td>' + who(c.s1, '#12a37a', 'Mama') + '</td><td>' + who(c.s2, '#e0a210', 'Papa') + '</td>' +
        '<td>' + NTBild.icon('ok', c.y === 1) + '</td>' +
        (opts.hidden ? '<td class="ha">' + pct(c.A) + '</td><td class="hb">' + pct(c.B) + '</td>' : '') +
        '<td class="net">' + NTBild.icon('egg', c.o) + '<b>' + pct(c.o) + '</b></td></tr>';
    }
    el.innerHTML = h + '</tbody></table>';
  }

  /* ── Die vier Nester als Diagramm (Level 6 und 7, Sönke 17.11.2026) ──
     x = Mama (links fischt, rechts am Nest), y = Papa (unten fischt, oben am Nest).
     In den vier Ecken die echten Nester (Bilder), Hintergrund = was das Netz an
     jeder Stelle sagt (grün = „Ei ok“, rot = „nicht ok“). Jedes versteckte
     Neuron ist eine GERADE: a·Mama + b·Papa = c, Pfeil zur Seite, auf der es
     „an“ ist; am Ende der Geraden steht die Figur, die dieses Neuron IST.
       o = { cases, out(m, p) → 0…1, lines: [{ a, b, c, col, team, name }], hi = Index des umkreisten Nests } */
  const IMGS = {};
  let plotAgain = null;
  function img(name) {
    if (IMGS[name]) return IMGS[name];
    const im = new Image();
    im.onload = () => { im.ok = true; if (plotAgain) plotAgain(); };
    im.src = (window.NTBild ? NTBild.IMG : 'img/frei/') + name + '.webp';
    return (IMGS[name] = im);
  }
  ['nest', 'nest_mama', 'nest_papa', 'nest_beide', 'main', 'main_a', 'main_b'].forEach(img);
  const NESTF = (m, p) => m > 0 && p > 0 ? 'nest_beide' : m > 0 ? 'nest_mama' : p > 0 ? 'nest_papa' : 'nest';

  function nestPlot(cv, o) {
    plotAgain = () => nestPlot(cv, o);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue('--ink').trim() || '#222', soft = cs.getPropertyValue('--ink-faint').trim() || '#888';
    const okC = cs.getPropertyValue('--accent-ink').trim() || '#12a37a', bad = cs.getPropertyValue('--warn').trim() || '#d43a52';
    const L = 18, B = 18, T = 2, R = 2, S = 1.75;                 // Rand, Bereich −S…S
    const pw = W - L - R, ph = H - T - B;
    const X = m => L + (m + S) / (2 * S) * pw, Y = p => T + (1 - (p + S) / (2 * S)) * ph;

    // Hintergrund: was das Netz sagt
    const N = 36, cw = pw / N, ch = ph / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const m = -S + (i + 0.5) / N * 2 * S, p = S - (j + 0.5) / N * 2 * S, v = o.out(m, p);
      x.fillStyle = v > 0.5 ? 'rgba(18,190,130,' + ((v - 0.5) * 0.7).toFixed(3) + ')' : 'rgba(225,70,95,' + ((0.5 - v) * 0.55).toFixed(3) + ')';
      x.fillRect(L + i * cw, T + j * ch, cw + 0.6, ch + 0.6);
    }
    x.strokeStyle = soft; x.globalAlpha = 0.5; x.lineWidth = 1; x.setLineDash([3, 4]);
    x.beginPath(); x.moveTo(X(0), T); x.lineTo(X(0), T + ph); x.moveTo(L, Y(0)); x.lineTo(L + pw, Y(0)); x.stroke();
    x.setLineDash([]); x.globalAlpha = 1;
    x.strokeStyle = soft; x.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);

    // Achsen
    x.fillStyle = soft; x.font = '600 10.5px Space Grotesk, Outfit, sans-serif'; x.textBaseline = 'alphabetic';
    x.textAlign = 'center';
    x.fillText('fischt', X(-1), H - 5); x.fillText('am Nest', X(1), H - 5);
    x.font = '700 10.5px Space Grotesk, Outfit, sans-serif'; x.fillText('Mama →', X(0), H - 5);
    x.save(); x.translate(12, 0); x.rotate(-Math.PI / 2);
    x.font = '600 10.5px Space Grotesk, Outfit, sans-serif';
    x.fillText('fischt', -Y(-1), 0); x.fillText('am Nest', -Y(1), 0);
    x.font = '700 10.5px Space Grotesk, Outfit, sans-serif'; x.fillText('Papa →', -Y(0), 0);
    x.restore();

    // die Nester
    const nw = Math.min(pw, ph) * 0.4;
    o.cases.forEach((c, ci) => {
      const cx = X(c.s1), cy = Y(c.s2), im = img(NESTF(c.s1, c.s2));
      if (ci === o.hi) {                             // das Nest, das oben gerade durchs Neuron geht
        x.strokeStyle = ink; x.lineWidth = 2.4; x.setLineDash([5, 3]);
        const l = Math.max(L + 2, cx - nw * 0.6), r = Math.min(L + pw - 2, cx + nw * 0.6);
        const t = Math.max(T + 2, cy - nw * 0.42), bo = Math.min(T + ph - 2, cy + nw * 0.14 + 18);
        x.beginPath(); rr(x, l, t, r - l, bo - t, 12); x.stroke(); x.setLineDash([]);
      }
      const want = c.y === 1, right = (c.o > 0.5) === want;
      if (want) {                                    // so soll es sein: grüner Rahmen
        x.strokeStyle = okC; x.lineWidth = 2.2;
        x.beginPath(); rr(x, cx - nw * 0.56, cy - nw * 0.36, nw * 1.12, nw * 0.62, 10); x.stroke();
      }
      if (im.ok) {
        const h = nw * im.naturalHeight / im.naturalWidth;
        x.drawImage(im, cx - nw / 2, cy + nw * 0.14 - h, nw, h);
      }
      x.font = '700 11.5px JetBrains Mono, monospace'; x.textAlign = 'center';
      const t = Math.round(c.o * 100) + ' %', ty = cy + nw * 0.14 + 12;
      const tw = x.measureText(t).width + 10;
      x.fillStyle = right ? 'rgba(18,163,122,.92)' : 'rgba(212,58,82,.92)';
      x.beginPath(); rr(x, cx - tw / 2, ty - 10.5, tw, 14, 7); x.fill();
      x.fillStyle = '#fff'; x.fillText(t, cx, ty);
    });

    // die Geraden der Neuronen
    const figs = [];
    x.save(); x.beginPath(); x.rect(L, T, pw, ph); x.clip();
    for (const ln of o.lines || []) {
      const n = Math.hypot(ln.a, ln.b);
      if (n < 0.08) continue;                        // fast 0: das Neuron sagt überall dasselbe
      // Schnitt der Geraden a·m + b·p = c mit dem Rand des Bereichs
      const pts = [];
      const add = (m, p) => { if (m >= -S - 1e-6 && m <= S + 1e-6 && p >= -S - 1e-6 && p <= S + 1e-6) pts.push([m, p]); };
      if (Math.abs(ln.b) > 1e-6) { add(-S, (ln.c + ln.a * S) / ln.b); add(S, (ln.c - ln.a * S) / ln.b); }
      if (Math.abs(ln.a) > 1e-6) { add((ln.c + ln.b * S) / ln.a, -S); add((ln.c - ln.b * S) / ln.a, S); }
      if (pts.length < 2) continue;
      pts.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
      const p0 = pts[0], p1 = pts[pts.length - 1];
      x.strokeStyle = ln.col; x.lineWidth = 3.2; x.lineCap = 'round';
      x.shadowColor = ln.col; x.shadowBlur = 8;
      x.beginPath(); x.moveTo(X(p0[0]), Y(p0[1])); x.lineTo(X(p1[0]), Y(p1[1])); x.stroke();
      x.shadowBlur = 0;
      // Pfeil zur „an“-Seite (dorthin, wo a·m + b·p größer wird)
      const mm = (p0[0] + p1[0]) / 2, mp = (p0[1] + p1[1]) / 2, ux = ln.a / n, uy = ln.b / n;
      const ax = X(mm), ay = Y(mp), bx = ax + ux * 22, by = ay - uy * 22;
      x.lineWidth = 2.4; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      const ang = Math.atan2(by - ay, bx - ax);
      x.fillStyle = ln.col; x.beginPath();
      x.moveTo(bx + Math.cos(ang) * 6, by + Math.sin(ang) * 6);
      x.lineTo(bx + Math.cos(ang + 2.4) * 7, by + Math.sin(ang + 2.4) * 7);
      x.lineTo(bx + Math.cos(ang - 2.4) * 7, by + Math.sin(ang - 2.4) * 7); x.fill();
      // die Figur am Ende der Geraden = dieses Neuron (gezeichnet nach dem Zuschnitt, s. unten)
      // an das Ende, das weiter weg von den Nestern liegt (sonst verdeckt die Figur ein Nest)
      const far = q => Math.min(...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(c => Math.hypot(q[0] - c[0], q[1] - c[1])));
      const e = Math.abs(far(p0) - far(p1)) > 0.15 ? (far(p0) > far(p1) ? p0 : p1) : (ln.end === 0 ? p0 : p1);
      figs.push({ team: ln.team, x: X(e[0]) + (X(mm) - X(e[0])) * 0.2, y: Y(e[1]) + (Y(mp) - Y(e[1])) * 0.2 });
      if (ln.name) {
        x.font = '700 12px Space Grotesk, Outfit, sans-serif'; x.fillStyle = ln.col; x.textAlign = 'center';
        x.fillText(ln.name, bx + ux * 12, by - uy * 12 + 4);
      }
    }
    x.restore();
    for (const f of figs) {
      const pi = img(f.team === 'a' ? 'main_a' : f.team === 'b' ? 'main_b' : 'main');
      if (!pi.ok) continue;
      const h = 40, w = h * pi.naturalWidth / pi.naturalHeight;
      x.drawImage(pi, Math.max(L + 2, Math.min(L + pw - w - 2, f.x - w / 2)), Math.max(T + 2, Math.min(T + ph - h - 2, f.y - h * 0.6)), w, h);
    }
  }
  function rr(x, l, t, w, h, r) { roundRect(x, l, t, w, h, r); }

  return { draw, lights, nestPlot };
})();
