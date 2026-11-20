/* ══════════════════════════════════════════════════════════════
   NeuroLab · feld.js — das Netz als Bild (SVG) und seine Gesten
   ══════════════════════════════════════════════════════════════
   NLFeld.render(svg, o) baut das ganze Bild neu (die Netze sind klein,
   das kostet nichts und hält den Zustand an EINER Stelle: im Netz).

   o = {
     net, sc,
     values:   Ergebnis von NLNetz.forward(net, x) oder null (dann keine Zahlen)
     targets:  Soll-Werte je Ausgang (oder null)
     edit:     { structure, weights, ioCount }    was hier verändert werden darf
     rules:    { maxNeurons, maxLayers }
     selected: { l, n } | null                   hervorgehobenes Neuron
     deltas:   { gw, gb } | null                  Zeitlupe: geplante Änderungen
     print:    Druck-Optionen | null
     on:       { change(kind), neuron(l, n), input(i), output(k), connect(k, src) }
   }

   Ausgänge (rechts) sind FEST. Angedockt wird vom Punkt rechts am Neuron:
   ziehen und auf einem Ausgang loslassen — oder Punkt antippen, dann den
   Ausgang antippen (Tablet). Das × am Ausgang löst die Leitung.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const N = window.NLNetz;
  const NS = 'http://www.w3.org/2000/svg';

  const COL_W = 250, NW = 156, NH = 72, IW = 118, IH = 46, OW = 158, OH = 64;
  const HEAD = 64;
  const LINE_COLORS = ['#2f80ed', '#e5484d', '#1fa971', '#f08c00', '#8e4ec6', '#0aa4a4', '#d6409f', '#8d6e63', '#5c7cfa', '#94a000'];

  const fmt = (v, d) => {
    if (v == null || isNaN(v)) return '–';
    const r = Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(d == null ? 2 : d);
    return String(r).replace('.', ',').replace('-', '−');
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    const t = el('text', { x, y, class: cls || '', 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = s;
    return t;
  }

  const ACT_PATH = {
    step: 'M0 20 H20 V4 H40',
    sigmoid: 'M0 20 C14 20 16 4 40 4',
    relu: 'M0 20 H20 L40 2',
    tanh: 'M0 21 C16 21 22 3 40 3',
    linear: 'M2 22 L38 2'
  };

  let pending = null;          // angetippter Ausgangspunkt { l, n }
  let lastOpts = null;

  /* Positionen aller Knoten */
  function layout(net) {
    const L = net.layers.length;
    const cols = [];
    const ROW_I = net.inputs.length > 5 ? 62 : 84;
    const counts = [net.inputs.length].concat(net.layers.map(x => x.length));
    const hIn = net.inputs.length * ROW_I;
    const hL = net.layers.map(x => x.length * 128);
    const hO = net.outputs.length * 92;
    const H = Math.max(hIn, ...hL, hO, 240);
    const yOf = (k, cnt, row) => HEAD + (H - cnt * row) / 2 + row * k + row / 2;
    cols.push(net.inputs.map((_, i) => ({ x: 20, y: yOf(i, counts[0], ROW_I) })));
    net.layers.forEach((layer, l) => {
      cols.push(layer.map((_, n) => ({ x: 20 + IW + 70 + l * COL_W, y: yOf(n, layer.length, 128) })));
    });
    const ox = 20 + IW + 70 + L * COL_W + 40;
    const outs = net.outputs.map((_, k) => ({ x: ox, y: yOf(k, net.outputs.length, 92) }));
    return { cols, outs, W: ox + OW + 30, H: H + HEAD + 30 };
  }

  function lineColor(l, n) { return l === 0 ? LINE_COLORS[n % LINE_COLORS.length] : null; }

  function render(svg, o) {
    lastOpts = o;
    const { net } = o;
    const P = o.print || null;
    const lay = layout(net);
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${lay.W} ${lay.H}`);
    svg.classList.toggle('is-print', !!P);
    svg.classList.toggle('bw', !!(P && P.bw));
    const ed = o.edit || {};
    const gEdges = el('g', { class: 'edges' }, svg);
    const gLabels = el('g', { class: 'elabels' }, svg);
    const gNodes = el('g', { class: 'nodes' }, svg);
    const gHead = el('g', { class: 'heads' }, svg);

    const totalEdges = net.layers.reduce((s, L) => s + L.length * (L[0] ? L[0].w.length : 0), 0);
    const showAllLabels = P ? P.weights !== 'off' : totalEdges <= 30;
    const vals = o.values;

    /* ── Kanten ───────────────────────────────────────────── */
    net.layers.forEach((layer, l) => {
      const src = lay.cols[l];
      layer.forEach((nr, n) => {
        const dst = lay.cols[l + 1][n];
        const k = nr.w.length;
        nr.w.forEach((w, i) => {
          const s = src[i];
          const sx = l === 0 ? s.x + IW : s.x + NW + 14;
          const sy = s.y;
          const spread = k > 1 ? (i / (k - 1) - 0.5) * (NH - 22) : 0;
          const tx = dst.x, ty = dst.y + spread;
          const mx = (sx + tx) / 2;
          const d = `M${sx} ${sy} C${mx} ${sy} ${mx} ${ty} ${tx} ${ty}`;
          const aw = Math.abs(w);
          const cls = 'edge ' + (w > 0.005 ? 'pos' : w < -0.005 ? 'neg' : 'zero');
          const sel = o.selected && o.selected.l === l && o.selected.n === n;
          const p = el('path', { d, class: cls + (sel ? ' sel' : ''), 'stroke-width': (1.2 + Math.min(aw, 4) * 1.4).toFixed(2) }, gEdges);
          if (vals && !P) {
            const act = Math.abs(w * ((l === 0 ? vals.x : vals.ys[l - 1])[i] || 0));
            p.style.opacity = (0.25 + Math.min(act, 1.5) / 1.5 * 0.75).toFixed(2);
          }
          if (ed.weights || ed.view) p.addEventListener('click', () => o.on.neuron(l, n, { w: i }));
          // Beschriftung nahe am Ziel, entlang der Kante gestaffelt
          if (showAllLabels || sel) {
            const t = 0.72;
            const bx = (1 - t) ** 3 * sx + 3 * (1 - t) ** 2 * t * mx + 3 * (1 - t) * t * t * mx + t ** 3 * tx;
            const by = (1 - t) ** 3 * sy + 3 * (1 - t) ** 2 * t * sy + 3 * (1 - t) * t * t * ty + t ** 3 * ty;
            const gap = P && P.weights === 'gap';
            const s2 = gap ? '____' : fmt(w, 2);
            const g = el('g', { class: 'elabel ' + (w < -0.005 ? 'neg' : 'pos') }, gLabels);
            const wdt = s2.length * 6.6 + 10;
            el('rect', { x: bx - wdt / 2, y: by - 9, width: wdt, height: 18, rx: 5 }, g);
            txt(g, bx, by + 4, s2, '');
            if (ed.weights || ed.view) g.addEventListener('click', () => o.on.neuron(l, n, { w: i }));
          }
          // Zeitlupe: geplante Änderung
          if (o.deltas && o.deltas.gw[l] && o.deltas.gw[l][n]) {
            const dv = o.deltas.gw[l][n][i];
            if (Math.abs(dv) >= 0.0005) {
              const t = 0.45;
              const bx = (1 - t) ** 3 * sx + 3 * (1 - t) ** 2 * t * mx + 3 * (1 - t) * t * t * mx + t ** 3 * tx;
              const by = (1 - t) ** 3 * sy + 3 * (1 - t) ** 2 * t * sy + 3 * (1 - t) * t * t * ty + t ** 3 * ty;
              const g = el('g', { class: 'delta ' + (dv > 0 ? 'up' : 'down') }, gLabels);
              const s3 = (dv > 0 ? '+' : '') + fmt(dv, 3);
              const wdt = s3.length * 6.6 + 12;
              el('rect', { x: bx - wdt / 2, y: by - 10, width: wdt, height: 20, rx: 10 }, g);
              txt(g, bx, by + 4, s3, '');
            }
          }
        });
      });
    });

    /* Leitungen zu den Ausgängen */
    net.outputs.forEach((out, k) => {
      if (!out.src) return;
      if (P && !P.slots) return;
      const s = lay.cols[out.src.l + 1][out.src.n];
      const t = lay.outs[k];
      const sx = s.x + NW + 14, sy = s.y, tx = t.x, ty = t.y;
      const mx = (sx + tx) / 2;
      el('path', { d: `M${sx} ${sy} C${mx} ${sy} ${mx} ${ty} ${tx} ${ty}`, class: 'wire' }, gEdges);
    });

    /* ── Eingänge ─────────────────────────────────────────── */
    const sc = o.sc;
    net.inputs.forEach((inp, i) => {
      const p = lay.cols[0][i];
      const g = el('g', { class: 'inp', transform: `translate(${p.x},${p.y - IH / 2})` }, gNodes);
      el('rect', { width: IW, height: IH, rx: IH / 2 }, g);
      const showV = vals && (!P || P.inputs);
      txt(g, IW / 2, showV ? 19 : 28, inp.label, 'inp-l');
      if (showV) {
        const scIn = sc && sc.inputs[i];
        const v = vals.x[i];
        txt(g, IW / 2, 37, scIn && scIn.real ? `${fmt(v, 2)}  (${scIn.real(v)} ${scIn.unit})` : fmt(v, 2), 'inp-v');
      }
      if (o.on.input) g.addEventListener('click', () => o.on.input(i));
    });

    /* ── Neuronen ─────────────────────────────────────────── */
    net.layers.forEach((layer, l) => {
      layer.forEach((nr, n) => {
        const p = lay.cols[l + 1][n];
        const sel = o.selected && o.selected.l === l && o.selected.n === n;
        const g = el('g', { class: 'neuron act-' + nr.act + (sel ? ' sel' : ''), transform: `translate(${p.x},${p.y - NH / 2})` }, gNodes);
        const y = vals ? vals.ys[l][n] : null;
        const z = vals ? vals.zs[l][n] : null;
        const lc = lineColor(l, n);
        // Bias
        const showB = !P || P.bias !== 'off';
        if (showB) {
          el('line', { x1: NW * 0.25, y1: NH, x2: NW * 0.25, y2: NH + 14, class: 'bias-l' }, g);
          txt(g, NW * 0.25, NH + 27, 'b = ' + (P && P.bias === 'gap' ? '____' : fmt(nr.b, 2)), 'bias-t');
        }
        const body = el('rect', { width: NW, height: NH, rx: 16, class: 'nbody' }, g);
        if (y != null && !P) {
          const a = Math.max(0, Math.min(1, nr.act === 'tanh' ? (y + 1) / 2 : nr.act === 'relu' || nr.act === 'linear' ? Math.min(1, Math.abs(y)) : y));
          body.style.setProperty('--fill', (a * 0.55).toFixed(2));
          body.classList.add('lit');
        }
        el('line', { x1: NW / 2, y1: 6, x2: NW / 2, y2: NH - 6, class: 'ndiv' }, g);
        txt(g, NW * 0.25, 33, 'Σ', 'sig');
        if (vals && (!P || P.values)) txt(g, NW * 0.25, 56, 'z = ' + fmt(z, 2), 'nval');
        const realAct = !P || P.act !== 'fz';
        if (realAct) {
          el('path', { d: ACT_PATH[nr.act], class: 'actp', transform: `translate(${NW * 0.75 - 20},${vals && (!P || P.values) ? 14 : 22})` }, g);
        } else txt(g, NW * 0.75, 41, 'f(z)', 'fz');
        if (vals && (!P || P.values)) txt(g, NW * 0.75, 62, 'y = ' + fmt(y, 2), 'nval');
        // Kopf: Name + Aktivierung
        const name = 'N' + (l + 1) + '.' + (n + 1);
        txt(g, 10, -8, name, 'nname', 'start');
        if (realAct) txt(g, NW - 8, -8, N.ACTS[nr.act].name, 'nact', 'end');
        if (lc && !P) el('circle', { cx: NW / 2, cy: -12, r: 5, fill: lc, class: 'ldot' }, g);
        // Ausgangspunkt (zum Andocken)
        const connected = net.outputs.some(out => out.src && out.src.l === l && out.src.n === n);
        el('line', { x1: NW, y1: NH / 2, x2: NW + 14, y2: NH / 2, class: 'stub' }, g);
        const knob = el('circle', { cx: NW + 14, cy: NH / 2, r: 9,
          class: 'knob' + (connected ? ' on' : '') + (pending && pending.l === l && pending.n === n ? ' pending' : '') }, g);
        // großes, unsichtbares Ziel für Finger
        const hit = el('circle', { cx: NW + 14, cy: NH / 2, r: 20, class: 'knob-hit' }, g);
        if (o.edit && o.edit.connect && !P) attachKnob(svg, hit, l, n, o);
        el('rect', { width: NW, height: NH, rx: 16, class: 'nhit' }, g)
          .addEventListener('click', () => o.on.neuron(l, n, {}));
      });
    });

    /* ── Ausgänge (fest) ──────────────────────────────────── */
    const outVals = vals ? N.outValues(net, vals) : null;
    net.outputs.forEach((out, k) => {
      const p = lay.outs[k];
      const g = el('g', { class: 'slot' + (out.src ? ' filled' : ' empty'), 'data-slot': k, transform: `translate(${p.x},${p.y - OH / 2})` }, gNodes);
      el('rect', { width: OW, height: OH, rx: 12, class: 'sbody', 'data-slot': k }, g);
      el('circle', { cx: 0, cy: OH / 2, r: 7, class: 'sport', 'data-slot': k }, g);
      txt(g, OW / 2, 24, out.label, 'slabel').setAttribute('data-slot', k);
      if (!out.src && !P) {
        txt(g, OW / 2, 46, pending ? 'hier antippen' : 'Neuron andocken', 'sempty').setAttribute('data-slot', k);
      } else if (outVals && (!P || P.values)) {
        const v = outVals[k];
        const t = o.targets ? o.targets[k] : null;
        const ok = t == null || v == null ? null : (o.isOk ? o.isOk(v, t, k) : Math.abs(v - t) < 0.5);
        txt(g, OW / 2, 47, 'ist ' + fmt(v, 2) + (t != null ? '  ·  soll ' + fmt(t, 2) : ''), 'sval' + (ok == null ? '' : ok ? ' ok' : ' bad')).setAttribute('data-slot', k);
      }
      if (out.src && o.edit && o.edit.connect && !P) {
        const x = el('g', { class: 'sx', transform: `translate(${OW - 4},4)` }, g);
        el('circle', { r: 11 }, x);
        txt(x, 0, 4, '×', '');
        x.addEventListener('click', (e) => { e.stopPropagation(); out.src = null; o.on.change('connect'); });
      }
      g.addEventListener('click', () => {
        if (pending && o.edit && o.edit.connect) { connect(o, k, pending); pending = null; }
        else if (o.on.output) o.on.output(k);
      });
    });

    /* ── Spaltenköpfe & Bau-Knöpfe ────────────────────────── */
    const isPrint = !!P;
    const colX0 = lay.cols[0][0] ? lay.cols[0][0].x : 20;
    head(gHead, colX0 + IW / 2, 'Eingänge', ed.ioCount && !isPrint ? {
      minus: net.inputs.length > 1 ? () => o.on.change('inputs-') : null,
      plus: net.inputs.length < 6 ? () => o.on.change('inputs+') : null } : null);
    const total = N.countNeurons(net);
    const maxN = (o.rules && o.rules.maxNeurons) || 40;
    const maxL = (o.rules && o.rules.maxLayers) || 4;
    net.layers.forEach((layer, l) => {
      const x = 20 + IW + 70 + l * COL_W + NW / 2;
      head(gHead, x, 'Schicht ' + (l + 1), ed.structure && !isPrint ? {
        minus: () => o.on.change('neuron-', l),
        plus: total < maxN && layer.length < 12 ? () => o.on.change('neuron+', l) : null,
        del: net.layers.length > 1 ? () => o.on.change('layer-', l) : null } : null);
    });
    if (!net.layers.length && ed.structure && !isPrint) {
      // gar keine Schicht: großer Knopf
    }
    const ox = lay.outs[0] ? lay.outs[0].x : lay.W - OW - 30;
    head(gHead, ox + OW / 2, 'Ausgänge', ed.ioCount && !isPrint ? {
      minus: net.outputs.length > 1 ? () => o.on.change('outputs-') : null,
      plus: net.outputs.length < 4 ? () => o.on.change('outputs+') : null } : null, !ed.ioCount ? 'fest' : '');
    // „+ Schicht“ in jeder Lücke
    if (ed.structure && !isPrint && net.layers.length < maxL && total < maxN) {
      for (let p = 0; p <= net.layers.length; p++) {
        const x = p === 0 ? 20 + IW + 35 : 20 + IW + 70 + (p - 1) * COL_W + NW + (p === net.layers.length ? 40 : 47);
        const g = el('g', { class: 'addlayer', transform: `translate(${x},${HEAD - 26})` }, gHead);
        el('rect', { x: -15, y: -14, width: 30, height: 28, rx: 9 }, g);
        txt(g, 0, 6, '+', '');
        const t = el('title', null, g); t.textContent = 'Schicht hier einfügen';
        g.addEventListener('click', () => o.on.change('layer+', p));
      }
    }
  }

  function head(g0, cx, title, btn, tag) {
    const g = el('g', { class: 'colhead', transform: `translate(${cx},22)` }, g0);
    txt(g, 0, 0, title, 'ctitle');
    if (tag) txt(g, 0, 16, tag, 'ctag');
    if (!btn) return;
    const mk = (dx, s, fn, cls) => {
      const b = el('g', { class: 'cbtn ' + (cls || '') + (fn ? '' : ' off'), transform: `translate(${dx},${-5})` }, g);
      el('rect', { x: -13, y: -13, width: 26, height: 26, rx: 8 }, b);
      txt(b, 0, 5, s, '');
      if (fn) b.addEventListener('click', fn);
    };
    const w = title.length * 4.4 + 22;
    if (btn.minus !== undefined) mk(-w - 16, '−', btn.minus);
    if (btn.plus !== undefined) mk(w + 16, '+', btn.plus);
    if (btn.del) mk(w + 46, '×', btn.del, 'del');
  }

  function connect(o, k, src) {
    const net = o.net;
    // ein Neuron hängt höchstens an einem Ausgang
    net.outputs.forEach(out => { if (out.src && out.src.l === src.l && out.src.n === src.n) out.src = null; });
    net.outputs[k].src = { l: src.l, n: src.n };
    o.on.change('connect');
  }

  /* Ziehen vom Ausgangspunkt — oder antippen (dann Ausgang antippen). */
  function attachKnob(svg, hit, l, n, o) {
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const pt = (ev) => {
        const m = svg.getScreenCTM();
        const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
        return p.matrixTransform(m.inverse());
      };
      const start = pt(e);
      const sx = +hit.getAttribute('cx'), sy = +hit.getAttribute('cy');
      const tr = hit.parentNode.transform.baseVal.consolidate().matrix;
      const ax = tr.e + sx, ay = tr.f + sy;
      let line = null, moved = false;
      const move = (ev) => {
        const p = pt(ev);
        if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 8) return;
        moved = true;
        if (!line) line = el('path', { class: 'wire drag' }, svg);
        const mx = (ax + p.x) / 2;
        line.setAttribute('d', `M${ax} ${ay} C${mx} ${ay} ${mx} ${p.y} ${p.x} ${p.y}`);
        document.querySelectorAll('.slot.hover').forEach(s => s.classList.remove('hover'));
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const sl = under && under.closest && under.closest('.slot');
        if (sl) sl.classList.add('hover');
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (line) line.remove();
        if (!moved) {
          pending = pending && pending.l === l && pending.n === n ? null : { l, n };
          render(svg, o);
          return;
        }
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const k = under && under.closest && under.closest('[data-slot]');
        pending = null;
        if (k) connect(o, +k.getAttribute('data-slot'), { l, n });
        else render(svg, o);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  function clearPending() { pending = null; }

  window.NLFeld = { render, fmt, LINE_COLORS, lineColor, clearPending, ACT_PATH };
})();
