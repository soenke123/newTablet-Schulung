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
     net = { nodes: [{ id, x, y, label, kind: 'in'|'n'|'out', sym, bias, group }],
             edges: [{ from, to, w, group, fixed }] }
     x, y in 0…1 (Anteil der Zeichenfläche)

   NTNetz.lights(el, cases, opts)   Wahrheitstabelle Treppenhaus-Licht
     cases = [{ s1, s2, y, o, A?, B? }], opts.hidden = A/B-Spalten zeigen
   ══════════════════════════════════════════════════════════════ */

window.NTNetz = (function () {
  'use strict';

  const fmt = (v, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const COL = { a: '#f27828', b: '#8b5cf6', fix: null };

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
    const pad = 14, R = Math.max(12, Math.min(19, H * 0.12));
    const P = n => [pad + 34 + n.x * (W - 2 * pad - 68), pad + n.y * (H - 2 * pad)];
    const byId = {};
    for (const n of net.nodes) byId[n.id] = n;
    const col = g => COL[g] || soft;

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
      x.globalAlpha = e.fixed ? 0.75 : 0.95;
      x.beginPath(); x.moveTo(x0 + ux * r0, y0 + uy * r0); x.lineTo(x1 - ux * r1, y1 - uy * r1); x.stroke();
      x.setLineDash([]); x.globalAlpha = 1;
      // Zahl etwas vor der Mitte, auf der Seite des Ziels versetzt
      const t = e.labelAt || 0.42;
      if (!e.noLabel) labels.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, txt: (e.w > 0 && !e.fixed ? '+' : '') + fmt(e.w, e.fixed ? 0 : 1), color: col(e.group), fixed: e.fixed });
    }
    x.font = '700 11.5px Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const l of labels) {
      const w = x.measureText(l.txt).width + 8;
      x.fillStyle = surf; x.globalAlpha = 0.92;
      x.beginPath(); roundRect(x, l.x - w / 2, l.y - 8, w, 16, 5); x.fill();
      x.globalAlpha = 1; x.fillStyle = l.fixed ? soft : l.color;
      x.fillText(l.txt, l.x, l.y + 0.5);
    }

    // Knoten
    for (const n of net.nodes) {
      const [px, py] = P(n);
      if (n.kind === 'in') {
        x.fillStyle = ink; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill();
        x.font = '600 12px Outfit, sans-serif'; x.textAlign = 'right'; x.fillStyle = ink;
        x.fillText(n.label, px - 9, py + 0.5);
      } else if (n.kind === 'out') {
        x.fillStyle = ink; x.beginPath(); x.moveTo(px + 8, py); x.lineTo(px - 4, py - 6); x.lineTo(px - 4, py + 6); x.fill();
        x.font = '600 12px Outfit, sans-serif'; x.textAlign = 'left';
        x.fillText(n.label, px + 12, py + 0.5);
      } else {
        x.fillStyle = surf; x.strokeStyle = n.group ? col(n.group) : ink; x.lineWidth = n.group ? 2.6 : 2;
        x.beginPath(); x.arc(px, py, R, 0, 7); x.fill(); x.stroke();
        x.fillStyle = ink; x.textAlign = 'center';
        x.font = '700 ' + Math.round(R * 0.8) + 'px Outfit, sans-serif';
        x.fillText(n.sym || 'σ', px, py + 1);
        if (n.label) { x.font = '700 12px Outfit, sans-serif'; x.fillStyle = n.group ? col(n.group) : soft; x.textAlign = 'left'; x.fillText(n.label, px + R + 4, py - R + 3); x.textAlign = 'center'; }
        if (n.bias != null) {
          x.font = '600 10.5px Outfit, sans-serif'; x.fillStyle = n.biasGroup ? col(n.biasGroup) : soft;
          x.fillText((n.biasName ? n.biasName + ' ' : 'Bias ') + (n.bias > 0 ? '+' : '') + fmt(n.bias, n.biasGroup ? 0 : 0), px, py + R + 9);
        }
      }
    }
  }

  function roundRect(x, l, t, w, h, r) {
    x.moveTo(l + r, t); x.lineTo(l + w - r, t); x.quadraticCurveTo(l + w, t, l + w, t + r);
    x.lineTo(l + w, t + h - r); x.quadraticCurveTo(l + w, t + h, l + w - r, t + h);
    x.lineTo(l + r, t + h); x.quadraticCurveTo(l, t + h, l, t + h - r);
    x.lineTo(l, t + r); x.quadraticCurveTo(l, t, l + r, t);
  }

  // Schalter als kleine Wippe: oben = an
  const sw = s => '<span class="sw ' + (s > 0 ? 'up' : 'dn') + '" title="' + (s > 0 ? 'oben' : 'unten') + '"><i></i></span>';
  const lamp = (v, cls) => '<span class="lamp ' + (cls || '') + '" style="--on:' + v.toFixed(3) + '"></span>';
  const pct = v => Math.round(v * 100) + ' %';

  function lights(el, cases, opts) {
    opts = opts || {};
    let h = '<table class="lights"><thead><tr><th>S1</th><th>S2</th><th>soll</th>' +
      (opts.hidden ? '<th class="ha">A</th><th class="hb">B</th>' : '') + '<th>Netz</th></tr></thead><tbody>';
    for (const c of cases) {
      const ok = (c.o > 0.5) === (c.y === 1);
      h += '<tr class="' + (ok ? 'ok' : 'bad') + '"><td>' + sw(c.s1) + '</td><td>' + sw(c.s2) + '</td><td>' + lamp(c.y, 'soll') + '</td>' +
        (opts.hidden ? '<td class="ha">' + pct(c.A) + '</td><td class="hb">' + pct(c.B) + '</td>' : '') +
        '<td class="net">' + lamp(c.o) + '<b>' + pct(c.o) + '</b></td></tr>';
    }
    el.innerHTML = h + '</tbody></table>';
  }

  return { draw, lights };
})();
