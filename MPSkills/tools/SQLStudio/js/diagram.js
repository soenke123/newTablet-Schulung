/* ══════════════════════════════════════════════════════════════
   SQL Studio — js/diagram.js   ·   Das Klassendiagramm
   ══════════════════════════════════════════════════════════════
   Jede Tabelle ein Kasten (Name oben, darunter die Spalten mit
   Schlüssel-Zeichen und Datentyp), jeder Fremdschlüssel eine Linie
   von der Spalte zur Spalte, auf die sie zeigt — mit „1" und „n"
   an den Enden.

   Reines SVG, und zwar mit fertig ausgerechneten Farben statt
   var(--…): so lässt sich dasselbe Bild ohne Umweg als PNG
   speichern (ein <img> kennt die CSS-Variablen der Seite nicht).
   Die App ruft render() deshalb auch nach einem Hell/Dunkel-Wechsel.

   Die Anordnung ist automatisch (Spalten nach Abhängigkeit: wer auf
   niemanden zeigt, steht links) und lässt sich mit dem Finger
   verschieben; die App merkt sich die Lage je Datenbank.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const ROW = 24, HEAD = 34, PADB = 8, MINW = 170;
  const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let ctx2d = null;
  function textW(s, font) {
    if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
    ctx2d.font = font;
    return ctx2d.measureText(s).width;
  }

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return {
      bg: v('--dg-bg', '#f4f7f6'), dot: v('--dg-dot', '#d9e2df'),
      box: v('--surface', '#fff'), head: v('--dg-head', '#e8f6f0'), headInk: v('--ink', '#0d1a17'),
      line: v('--line', '#dfe7e5'), edge: v('--dg-edge', '#c5d2ce'), ink: v('--ink', '#0d1a17'), muted: v('--muted', '#5f706b'),
      key: v('--key', '#d4920f'), fk: v('--fk', '#2f6fd6'), link: v('--dg-link', '#7d8f8a'), hot: v('--accent', '#00b37e'),
      shadow: v('--dg-shadow', 'rgba(13,26,23,.10)')
    };
  }

  function create(host, opts = {}) {
    host.innerHTML = '<svg class="dg-svg" xmlns="' + NS + '" role="img" aria-label="Klassendiagramm"></svg>' +
      '<div class="dg-empty" hidden>Diese Datenbank hat noch keine Tabellen.</div>';
    const svg = host.querySelector('svg');
    const empty = host.querySelector('.dg-empty');
    let schema = null;
    let pos = {};               // name → {x, y}
    let view = { x: 40, y: 40, k: 1 };
    let showTypes = true;
    let boxes = {};             // name → {x,y,w,h,rows:[names]}
    let hot = null;             // hervorgehobene Tabelle
    let C = palette();

    /* ── Maße ──────────────────────────────────────────────── */
    function measure(t) {
      const fh = '700 14px ' + FONT, fr = '13px ' + FONT, ft = '11.5px ' + MONO;
      let w = textW(t.name, fh) + 48;
      for (const c of t.columns) {
        const tw = showTypes ? textW(typeLabel(c), ft) + 18 : 0;
        w = Math.max(w, 34 + textW(c.name, fr) + (c.fk ? 14 : 0) + tw + 16);
      }
      return { w: Math.ceil(Math.max(MINW, w)), h: HEAD + t.columns.length * ROW + PADB };
    }
    const typeLabel = c => c.enumValues ? 'ENUM' : (c.type || '').toUpperCase().replace(/\s+/g, ' ');

    /* ── Automatisch anordnen ──────────────────────────────── */
    function arrange() {
      if (!schema) return;
      const ts = schema.tables;
      const names = ts.map(t => t.name);
      const parents = {}, kids = {};
      names.forEach(n => { parents[n] = []; kids[n] = []; });
      ts.forEach(t => t.fks.forEach(f => {
        if (f.ref !== t.name && parents[f.ref] && !parents[t.name].includes(f.ref)) { parents[t.name].push(f.ref); kids[f.ref].push(t.name); }
      }));
      // Zwei Schichtungen: so früh wie möglich (Eltern ganz links) und so
      // spät wie möglich (Eltern dicht vor ihren Kindern). Genommen wird
      // die mit den kürzeren Linien.
      const longest = (next) => {
        const d = {};
        const visit = (n, stack) => {
          if (d[n] !== undefined) return d[n];
          if (stack.has(n)) return 0;
          stack.add(n);
          const v = next[n].length ? 1 + Math.max(...next[n].map(p => visit(p, stack))) : 0;
          stack.delete(n);
          return (d[n] = v);
        };
        names.forEach(n => visit(n, new Set()));
        return d;
      };
      const asap = longest(parents);
      const h = longest(kids);
      const H = Math.max(0, ...Object.values(h));
      const alap = Object.fromEntries(names.map(n => [n, H - h[n]]));
      const cost = (L) => ts.reduce((s, t) => s + parents[t.name].reduce((a, p) => a + Math.max(0, Math.abs(L[t.name] - L[p]) - 1), 0), 0);
      const layer = cost(alap) < cost(asap) ? alap : asap;
      const cols = [];
      names.forEach(n => { (cols[layer[n]] = cols[layer[n]] || []).push(n); });
      for (let i = 0; i < cols.length; i++) cols[i] = cols[i] || [];
      // Reihenfolge: mehrmals nach dem Mittel der Nachbarn sortieren
      const idx = {};
      cols.forEach(col => col.forEach((n, i) => { idx[n] = i; }));
      const nb = n => parents[n].concat(kids[n]);
      for (let it = 0; it < 6; it++) {
        const order = it % 2 ? cols.slice().reverse() : cols;
        order.forEach(col => {
          const bc = {};
          col.forEach(n => {
            const ns = nb(n).filter(m => layer[m] !== layer[n]);
            bc[n] = ns.length ? ns.reduce((s, m) => s + idx[m], 0) / ns.length : idx[n];
          });
          col.sort((a, b) => bc[a] - bc[b]);
          col.forEach((n, i) => { idx[n] = i; });
        });
      }
      const sizes = Object.fromEntries(ts.map(t => [t.name, measure(t)]));
      const GAPY = 46, GAPX = 130;
      const heights = cols.map(col => col.reduce((s, n) => s + sizes[n].h, 0) + Math.max(0, col.length - 1) * GAPY);
      const Hmax = Math.max(...heights, 0);
      let x = 0;
      pos = {};
      cols.forEach((col, ci) => {
        if (!col.length) return;
        const w = Math.max(...col.map(n => sizes[n].w));
        let y = (Hmax - heights[ci]) / 2;
        col.forEach(n => { pos[n] = { x: Math.round(x), y: Math.round(y) }; y += sizes[n].h + GAPY; });
        x += w + GAPX;
      });
      draw();
      fit();
      opts.onLayout && opts.onLayout(layout());
    }

    /* ── Zeichnen ──────────────────────────────────────────── */
    function el(name, attrs, parent) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }

    const KEY_PATH = 'M7.5 1.5a4 4 0 0 0-3.8 5.3L.5 10v2.5h2.5v-1.5h1.5V9.5H6l.7-.7A4 4 0 1 0 7.5 1.5zm1 2.2a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z';
    const LINK_PATH = 'M5.2 8.8 8.8 5.2M6.3 3.6l.9-.9a2.6 2.6 0 0 1 3.7 3.7l-.9.9M7.7 10.4l-.9.9a2.6 2.6 0 0 1-3.7-3.7l.9-.9';

    function draw() {
      C = palette();
      svg.innerHTML = '';
      boxes = {};
      if (!schema || !schema.tables.length) { empty.hidden = false; return; }
      empty.hidden = true;
      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'dgdots', width: 22, height: 22, patternUnits: 'userSpaceOnUse' }, defs);
      el('circle', { cx: 1.5, cy: 1.5, r: 1.2, fill: C.dot }, pat);
      const fl = el('filter', { id: 'dgsh', x: '-10%', y: '-10%', width: '120%', height: '130%' }, defs);
      el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 5, 'flood-color': C.shadow, 'flood-opacity': 1 }, fl);
      el('rect', { class: 'dg-bg', x: -50000, y: -50000, width: 100000, height: 100000, fill: 'url(#dgdots)' }, svg);
      const vp = el('g', { class: 'dg-vp' }, svg);
      const gl = el('g', { class: 'dg-links' }, vp);
      const gt = el('g', { class: 'dg-tables' }, vp);

      // Fehlende Lagen ergänzen (neue Tabelle) — rechts daneben
      let maxX = 0;
      Object.values(pos).forEach(p => { maxX = Math.max(maxX, p.x); });
      schema.tables.forEach((t, i) => {
        if (!pos[t.name]) { pos[t.name] = { x: maxX + 260, y: i * 30 }; maxX += 260; }
      });

      for (const t of schema.tables) {
        const { w, h } = measure(t);
        const p = pos[t.name];
        boxes[t.name] = { x: p.x, y: p.y, w, h, rows: t.columns.map(c => c.name) };
        const g = el('g', { class: 'dg-t', 'data-t': t.name, transform: 'translate(' + p.x + ',' + p.y + ')' }, gt);
        const isHot = hot === t.name;
        el('rect', { width: w, height: h, rx: 12, fill: C.box, stroke: isHot ? C.hot : C.edge, 'stroke-width': isHot ? 2 : 1, filter: 'url(#dgsh)' }, g);
        // Kopf mit runden Ecken oben
        el('path', { d: 'M0 12a12 12 0 0 1 12-12h' + (w - 24) + 'a12 12 0 0 1 12 12v' + (HEAD - 12) + 'h-' + w + 'z', fill: C.head }, g);
        el('line', { x1: 0, y1: HEAD, x2: w, y2: HEAD, stroke: C.edge }, g);
        const tt = el('text', { x: 14, y: 22, 'font-family': FONT, 'font-size': 14, 'font-weight': 700, fill: C.headInk }, g);
        tt.textContent = t.name;
        const rc = el('text', { x: w - 12, y: 22, 'font-family': FONT, 'font-size': 11, fill: C.muted, 'text-anchor': 'end' }, g);
        rc.textContent = t.rows === null || t.rows === undefined ? '' : String(t.rows);
        t.columns.forEach((c, i) => {
          const y = HEAD + i * ROW + 4;
          if (i % 2 === 1) el('rect', { x: 1, y: y, width: w - 2, height: ROW, fill: C.line, opacity: 0.35 }, g);
          if (c.pk) {
            const k = el('path', { d: KEY_PATH, fill: C.key, transform: 'translate(12,' + (y + 5.5) + ') scale(.95)' }, g);
            k.appendChild(document.createElementNS(NS, 'title')).textContent = 'Primärschlüssel';
          } else if (c.fk) {
            const k = el('path', { d: LINK_PATH, fill: 'none', stroke: C.fk, 'stroke-width': 1.6, 'stroke-linecap': 'round', transform: 'translate(12,' + (y + 5) + ')' }, g);
            k.appendChild(document.createElementNS(NS, 'title')).textContent = 'Fremdschlüssel → ' + c.fk.table;
          }
          const nm = el('text', { x: 32, y: y + 16, 'font-family': FONT, 'font-size': 13, fill: C.ink,
            'font-weight': c.pk ? 700 : 400, 'text-decoration': c.pk ? 'underline' : null }, g);
          nm.textContent = c.name;
          if (c.fk) {
            // ↑ hinter dem Attribut — die Schreibweise aus dem Unterricht
            // (relationales Schema: schueler(id, name, klasse_id↑))
            const up = el('text', { x: 34 + textW(c.name, (c.pk ? '700 ' : '') + '13px ' + FONT), y: y + 16, 'font-family': FONT,
              'font-size': 13, 'font-weight': 700, fill: C.fk }, g);
            up.textContent = '↑';
            up.appendChild(document.createElementNS(NS, 'title')).textContent = 'Fremdschlüssel → ' + c.fk.table + '.' + c.fk.col;
          }
          if (showTypes) {
            const ty = el('text', { x: w - 12, y: y + 16, 'font-family': MONO, 'font-size': 11.5, fill: C.muted, 'text-anchor': 'end' }, g);
            ty.textContent = typeLabel(c) + (c.notnull && !c.pk ? '' : '');
          }
        });
      }
      drawLinks(gl);
      applyView();
    }

    function anchorY(name, col) {
      const b = boxes[name];
      const i = b.rows.findIndex(r => r.toLowerCase() === String(col || '').toLowerCase());
      return b.y + (i < 0 ? HEAD / 2 : HEAD + i * ROW + 4 + ROW / 2);
    }

    function roundPath(pts) {
      // Orthogonaler Linienzug mit runden Ecken
      let d = 'M' + pts[0][0] + ' ' + pts[0][1];
      for (let i = 1; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const r = Math.min(10, Math.abs(x1 - x0) / 2 || 10, Math.abs(y1 - y0) / 2 || 10, Math.abs(x2 - x1) / 2 || 10, Math.abs(y2 - y1) / 2 || 10);
        const ax = x1 - Math.sign(x1 - x0) * r, ay = y1 - Math.sign(y1 - y0) * r;
        const bx = x1 + Math.sign(x2 - x1) * r, by = y1 + Math.sign(y2 - y1) * r;
        d += ' L' + ax + ' ' + ay + ' Q' + x1 + ' ' + y1 + ' ' + bx + ' ' + by;
      }
      const last = pts[pts.length - 1];
      return d + ' L' + last[0] + ' ' + last[1];
    }

    /* Wie oft schneidet ein waagrechtes/senkrechtes Stück einen Kasten? */
    function hits(seg, skip) {
      let n = 0;
      const [x1, y1, x2, y2] = seg;
      const ax = Math.min(x1, x2), bx = Math.max(x1, x2), ay = Math.min(y1, y2), by = Math.max(y1, y2);
      for (const k in boxes) {
        if (skip.includes(k)) continue;
        const b = boxes[k];
        if (bx > b.x - 6 && ax < b.x + b.w + 6 && by > b.y - 6 && ay < b.y + b.h + 6) n++;
      }
      return n;
    }
    const routeHits = (pts, skip) => {
      let n = 0;
      for (let i = 0; i < pts.length - 1; i++) n += hits([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]], skip);
      return n;
    };

    /* Weg von (sx,sy) nach rechts/links hinaus zu (ex,ey). Erst drei
       Stücke mit der Senkrechten in einer freien Lücke; geht das nicht
       ohne Kasten, außen herum über eine Gasse über/unter allen. */
    function route(sx, sy, sDir, ex, ey, eDir, skip, lane) {
      const off = 22 + (lane % 4) * 7;
      const a = sx + sDir * off, b = ex + eDir * off;
      const cand = new Set([Math.round((sx + ex) / 2), a, b]);
      // Lücken zwischen Kästen im Bereich
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const edges = [];
      Object.values(boxes).forEach(bx => { edges.push(bx.x - 1, bx.x + bx.w + 1); });
      edges.sort((p, q) => p - q);
      for (let i = 0; i < edges.length - 1; i++) {
        const m = (edges[i] + edges[i + 1]) / 2;
        if (m > lo && m < hi) cand.add(Math.round(m + ((lane % 3) - 1) * 7));
      }
      let best = null, bestN = Infinity, bestLen = Infinity;
      for (const x of cand) {
        if ((x - sx) * sDir < 10 || (x - ex) * eDir < 10) continue;
        const pts = [[sx, sy], [x, sy], [x, ey], [ex, ey]];
        const n = routeHits(pts, skip);
        const len = Math.abs(x - sx) + Math.abs(ey - sy) + Math.abs(ex - x);
        if (n < bestN || (n === bestN && len < bestLen)) { best = pts; bestN = n; bestLen = len; }
      }
      if (best && bestN === 0) return best;
      // Außen herum
      const xs = [Math.min(a, b), Math.max(a, b)];
      let top = Infinity, bot = -Infinity;
      Object.entries(boxes).forEach(([k, bx]) => {
        if (bx.x + bx.w < xs[0] - 10 || bx.x > xs[1] + 10) return;
        top = Math.min(top, bx.y); bot = Math.max(bot, bx.y + bx.h);
      });
      const yUp = top - 22 - (lane % 4) * 8, yDn = bot + 22 + (lane % 4) * 8;
      const up = [[sx, sy], [a, sy], [a, yUp], [b, yUp], [b, ey], [ex, ey]];
      const dn = [[sx, sy], [a, sy], [a, yDn], [b, yDn], [b, ey], [ex, ey]];
      const nu = routeHits(up, skip), nd = routeHits(dn, skip);
      const lu = Math.abs(sy - yUp) + Math.abs(ey - yUp), ld = Math.abs(sy - yDn) + Math.abs(ey - yDn);
      const around = (nu < nd || (nu === nd && lu <= ld)) ? up : dn;
      const na = Math.min(nu, nd);
      return (best && bestN <= na) ? best : around;
    }

    function drawLinks(gl) {
      let lane = 0;
      for (const t of schema.tables) {
        for (const f of t.fks) {
          if (!boxes[f.ref]) continue;
          const c = boxes[t.name], p = boxes[f.ref];
          const yc = anchorY(t.name, f.cols[0]);
          const yp = anchorY(f.ref, f.refCols[0]);
          const isHot = hot && (hot === t.name || hot === f.ref);
          let pts, sx, ex, sDir, eDir;
          if (t.name === f.ref) {
            const xo = c.x + c.w + 28;
            pts = [[c.x + c.w, yc], [xo, yc], [xo, yp], [c.x + c.w, yp]];
            sx = c.x + c.w; ex = c.x + c.w; sDir = 1; eDir = 1;
          } else {
            if (c.x + c.w + 40 <= p.x) { sx = c.x + c.w; sDir = 1; ex = p.x; eDir = -1; }
            else if (p.x + p.w + 40 <= c.x) { sx = c.x; sDir = -1; ex = p.x + p.w; eDir = 1; }
            else { sx = c.x + c.w; sDir = 1; ex = p.x + p.w; eDir = 1; }
            if (sDir === eDir) {
              const xo = Math.max(c.x + c.w, p.x + p.w) + 30 + (lane % 3) * 8;
              pts = [[sx, yc], [xo, yc], [xo, yp], [ex, yp]];
            } else {
              pts = route(sx, yc, sDir, ex, yp, eDir, [t.name, f.ref], lane);
            }
          }
          lane++;
          el('path', { d: roundPath(pts), fill: 'none', stroke: isHot ? C.hot : C.link, 'stroke-width': isHot ? 2.2 : 1.5,
            'class': 'dg-l' }, gl);
          // Enden: Punkt am Kind (n), Strich am Elternteil (1)
          el('circle', { cx: sx, cy: yc, r: 3, fill: isHot ? C.hot : C.link }, gl);
          el('line', { x1: ex + eDir * 7, y1: yp - 6, x2: ex + eDir * 7, y2: yp + 6, stroke: isHot ? C.hot : C.link, 'stroke-width': 1.6 }, gl);
          const col = t.columns.find(x => x.name.toLowerCase() === String(f.cols[0]).toLowerCase());
          const oneToOne = col && (col.unique || (col.pk && t.pk.length === 1));
          const lab = (x, y, s, dir) => {
            const tx = el('text', { x: x + dir * 10, y: y - 6, 'font-family': FONT, 'font-size': 12, 'font-weight': 700,
              fill: isHot ? C.hot : C.muted, 'text-anchor': dir > 0 ? 'start' : 'end' }, gl);
            tx.textContent = s;
          };
          lab(sx, yc, oneToOne ? '1' : 'n', sDir);
          lab(ex, yp, '1', eDir);
        }
      }
    }

    function applyView() {
      const vp = svg.querySelector('.dg-vp');
      if (vp) vp.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
    }

    function bounds() {
      const bs = Object.values(boxes);
      if (!bs.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      bs.forEach(b => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w + 40); y1 = Math.max(y1, b.y + b.h); });
      return { x0, y0, x1, y1 };
    }

    function fit() {
      const b = bounds();
      if (!b) return;
      const W = svg.clientWidth || host.clientWidth || 800, H = svg.clientHeight || host.clientHeight || 500;
      const m = 32;
      const k = Math.min(1.15, (W - 2 * m) / (b.x1 - b.x0), (H - 2 * m) / (b.y1 - b.y0));
      view.k = Math.max(0.25, k);
      view.x = (W - (b.x1 - b.x0) * view.k) / 2 - b.x0 * view.k;
      view.y = (H - (b.y1 - b.y0) * view.k) / 2 - b.y0 * view.k;
      applyView();
    }

    function zoomAt(f, cx, cy) {
      const W = svg.clientWidth, H = svg.clientHeight;
      if (cx === undefined) { cx = W / 2; cy = H / 2; }
      const k = Math.max(0.2, Math.min(2.5, view.k * f));
      view.x = cx - (cx - view.x) * (k / view.k);
      view.y = cy - (cy - view.y) * (k / view.k);
      view.k = k;
      applyView();
    }

    /* ── Finger und Maus ───────────────────────────────────── */
    const pts = new Map();
    let drag = null;      // { kind: 'pan'|'move', … }
    let pinch = null;

    function local(e) {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      svg.setPointerCapture(e.pointerId);
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
        drag = null;
        return;
      }
      const tg = e.target.closest('.dg-t');
      if (tg) {
        const n = tg.getAttribute('data-t');
        drag = { kind: 'move', name: n, sx: p.x, sy: p.y, ox: pos[n].x, oy: pos[n].y, moved: false, g: tg };
        tg.parentNode.appendChild(tg);   // nach vorn
      } else {
        drag = { kind: 'pan', sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: false };
      }
    });

    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.max(0.2, Math.min(2.5, pinch.k * d / pinch.d));
        view.k = k;
        view.x = pinch.cx - (pinch.cx - pinch.vx) * (k / pinch.k);
        view.y = pinch.cy - (pinch.cy - pinch.vy) * (k / pinch.k);
        applyView();
        return;
      }
      if (!drag) return;
      const dx = p.x - drag.sx, dy = p.y - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.kind === 'pan') {
        view.x = drag.vx + dx; view.y = drag.vy + dy; applyView();
      } else if (drag.moved) {
        pos[drag.name] = { x: Math.round(drag.ox + dx / view.k), y: Math.round(drag.oy + dy / view.k) };
        const b = boxes[drag.name];
        b.x = pos[drag.name].x; b.y = pos[drag.name].y;
        drag.g.setAttribute('transform', 'translate(' + b.x + ',' + b.y + ')');
        const gl = svg.querySelector('.dg-links');
        gl.innerHTML = '';
        drawLinks(gl);
      }
    });

    function up(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'move') {
        if (d.moved) opts.onLayout && opts.onLayout(layout());
        else {
          hot = hot === d.name ? null : d.name;
          draw();
          opts.onSelect && opts.onSelect(hot);
        }
      } else if (!d.moved && hot) { hot = null; draw(); opts.onSelect && opts.onSelect(null); }
    }
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('dblclick', (e) => {
      const tg = e.target.closest('.dg-t');
      if (tg && opts.onOpenTable) opts.onOpenTable(tg.getAttribute('data-t'));
    });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      else { view.x -= e.deltaX; applyView(); }
    }, { passive: false });

    function layout() {
      return { pos: JSON.parse(JSON.stringify(pos)), showTypes };
    }

    /* ── Als Bild ──────────────────────────────────────────── */
    async function exportPng(filename) {
      const b = bounds();
      if (!b) return;
      const m = 32, scale = 2;
      const W = Math.ceil(b.x1 - b.x0 + 2 * m), H = Math.ceil(b.y1 - b.y0 + 2 * m);
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      clone.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      clone.querySelector('.dg-bg').remove();
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', C.bg);
      clone.insertBefore(bg, clone.querySelector('.dg-vp'));
      clone.querySelector('.dg-vp').setAttribute('transform', 'translate(' + (m - b.x0) + ',' + (m - b.y0) + ')');
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = W * scale; cv.height = H * scale;
      const cx = cv.getContext('2d');
      cx.scale(scale, scale);
      cx.drawImage(img, 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    return {
      render(sc, lay) {
        schema = sc;
        if (lay && lay.pos) pos = JSON.parse(JSON.stringify(lay.pos));
        else pos = {};
        if (lay && typeof lay.showTypes === 'boolean') showTypes = lay.showTypes;
        // Lagen von Tabellen, die es nicht mehr gibt, fallen weg
        Object.keys(pos).forEach(n => { if (!sc.tables.some(t => t.name === n)) delete pos[n]; });
        if (hot && !sc.tables.some(t => t.name === hot)) hot = null;
        const fresh = !lay || !lay.pos || !Object.keys(pos).length;
        if (fresh && sc.tables.length) { arrange(); return; }
        draw();
      },
      redraw() { if (schema) draw(); },
      arrange, fit,
      zoom(f) { zoomAt(f); },
      get showTypes() { return showTypes; },
      setShowTypes(v) { showTypes = !!v; draw(); opts.onLayout && opts.onLayout(layout()); },
      exportPng,
      focusTable(n) { hot = n; draw(); }
    };
  }

  window.SQLDiagram = { create };
})();
