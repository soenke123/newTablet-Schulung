/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Diagramm"   ·   tool.js
   ══════════════════════════════════════════════════════════════
   Mindmaps, Concept Map, Klassen- und Objektdiagramme zeichnen.
   Vorbild draw.io, aber je Diagrammart nur die Bausteine, die sie
   braucht (Migration 0258, Details in CLAUDE.md daneben).

   Aufbau dieser Datei:
     1  Kleinkram (Farben, Maße, Text messen)
     2  Diagrammarten (KINDS): Bausteine und Verbindungen je Art
     3  Zeichnen (svg) — reine Funktion doc → SVG-Text
     4  Canvas: eine Zeichenfläche (Verschieben, Zoomen, Bearbeiten)
        — dieselbe Klasse für den Editor und die Beamer-Ansicht
        (readonly), damit beide gleich aussehen.
     5  Editor (Werkzeugleiste, Auswahl-Leiste, Text-Overlay)
     6  Rollen: Tablet (participant), Lehrkraft (presenter), Schaufenster
     7  Anmeldung beim System

   Speichern: Tablet → dg_mine_put (1,5 s nach der letzten Änderung).
   Lehrkraft → Reiter „Klasse": dg_class_list alle 3 s (nur Kopfdaten),
   dg_class_get nur für die gewählten Diagramme und nur bei neuem rev.
   Ihr eigenes Diagramm liegt vorerst nur im Gerät (localStorage
   dg.own.<code>) — Teilen mit der Klasse kommt später.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════
     1  Kleinkram
     ════════════════════════════════════════════════════════════ */
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll/gesperrt */ } };

  /* Farben: [Füllung, Rand]. Pastell mit dunkler Schrift — lesbar auf
     heller und dunkler Fläche, und am Beamer auch noch blass genug. */
  const COLORS = [
    ['#e0f2fe', '#0284c7'],   // blau
    ['#dcfce7', '#16a34a'],   // grün
    ['#fef3c7', '#d97706'],   // gelb/orange
    ['#fce7f3', '#db2777'],   // pink
    ['#ede9fe', '#7c3aed'],   // lila
    ['#ffedd5', '#ea580c'],   // orange
    ['#ccfbf1', '#0d9488'],   // türkis
    ['#f1f5f9', '#475569']    // grau
  ];
  const COLOR_NAMES = ['Blau', 'Grün', 'Gelb', 'Pink', 'Lila', 'Orange', 'Türkis', 'Grau'];
  const TEXT = '#0f172a';
  const LINE = 'var(--dg-line)';      // Bleistift; beim Export VARS_EXPORT
  const LINK = 'var(--dg-link)';      // Linien im UML-Kleid (wie SQL Studio)
  /* Pfeilfarben im Concept Map (edge.f): schwarz (Bleistift), grün, rot.
     Was die Farben bedeuten, legt die Klasse fest — der Skill rechnet
     nichts daraus. Vorher (bis 03.11.2026) gab es +/− (edge.s); sane()
     übersetzt alte Diagramme: − → rot, sonst schwarz. */
  const ARROW = { k: LINE, g: '#16a34a', r: '#dc2626' };
  const ARROW_NAME = { k: 'schwarz', g: 'grün', r: 'rot' };

  /* Zwei Kleider (03.11.2026):
       Papier  — Mindmap und Concept Map: Zettel auf einem Tisch,
                 dezent: fast eckig, leichter Schatten, beim Ziehen
                 hebt sich der Zettel. Schrift Outfit.
       Karte   — Klassen- und Objektdiagramm wie das Klassendiagramm
                 in SQL Studio (tools/SQLStudio/js/diagram.js): weiße
                 Karte, Kopf in Petrol, Zebrastreifen, Typen rechts in
                 Mono. Schrift Inter.
     Farben, die mit hell/dunkel kippen, stehen als var(--dg-…) in den
     Attributen (gesetzt in tool.css an .dg-canvas.k-<art>); beim Export
     ersetzt VARS_EXPORT sie durch die helle Fassung. */
  const FONT  = "Outfit, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const FONT_U = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const MONO  = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
  const FS = 15;               // Schriftgröße auf den Zetteln
  const LH = 20;               // Zeilenhöhe
  const MAXW = 240;            // ab hier wird umgebrochen (Zettel)
  const U_ROW = 24, U_HEAD = 34, U_MINW = 170;   // wie SQL Studio
  const PAPER = '#fffdf8';
  const isUml = kind => kind === 'klasse' || kind === 'objekt';

  const VARS_EXPORT = {
    '--dg-line': '#57534e', '--dg-link': '#7a97a3', '--dg-paper': '#ffffff',
    '--dg-card': '#ffffff', '--dg-card-edge': '#bccdd3', '--dg-head': '#dcf0f5',
    '--dg-uml-ink': '#0c1f27', '--dg-muted': '#55707b', '--dg-zebra': '#d3e0e4'
  };
  const DEFS = '<defs>'
    + '<filter id="dgPaper" x="-20%" y="-20%" width="140%" height="160%">'
    +   '<feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#3b2f1e" flood-opacity=".16"/>'
    +   '<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3b2f1e" flood-opacity=".08"/></filter>'
    + '<filter id="dgLift" x="-25%" y="-25%" width="150%" height="190%">'
    +   '<feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#3b2f1e" flood-opacity=".22"/></filter>'
    + '<filter id="dgCard" x="-10%" y="-10%" width="120%" height="130%">'
    +   '<feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0c1f27" flood-opacity=".10"/></filter>'
    + '</defs>';

  let measureCtx = null;
  function textW(s, size, bold, fam) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${bold ? '700 ' : ''}${size || FS}px ${fam || FONT}`;
    return measureCtx.measureText(s).width;
  }

  // Zeilen eines Texts, mit Umbruch an Wortgrenzen bei maxW.
  function wrap(text, maxW, size, bold) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (line && textW(t, size, bold) > maxW) { out.push(line); line = w; }
        else line = t;
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }
  const linesOf = s => String(s || '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');

  /* ════════════════════════════════════════════════════════════
     2  Diagrammarten
     ════════════════════════════════════════════════════════════
     node: { id, type, x, y, t, c, a, o, k }
       type  center | topic (Mindmap) · box (Concept Map) ·
             class · object · note (überall)
       x, y  Mitte des Knotens
       t     Text bzw. Name;  a Attribute;  o Methoden;  k Klasse (Objekt)
       c     Farbindex in COLORS
     edge: { id, a, b, type, f, l, m1, m2, pa, pb, lo, o1, o2 }
       type  branch · effect · assoc · directed · inherit · aggr ·
             comp · dep · link · line · arrow
       f     Pfeilfarbe in der Concept Map (k/g/r)
       l     Beschriftung;  m1/m2 Multiplizitäten (UML)
       pa/pb Andockpunkt am Anfang/Ende, selbst verschoben: [u, v] in
             -1…1 (Anteil der halben Breite/Höhe, liegt auf dem Rand) —
             wächst der Kasten, wandert der Punkt mit. Fehlt = von selbst.
       lo/o1/o2  Feinjustierung der Beschriftung bzw. der Anzahlen:
             [dx, dy] in px relativ zu ihrem ausgerechneten Platz,
             höchstens ±LAB_MAX — sie wandern mit der Linie mit.
     doc.ortho (nur Klassen-/Objektdiagramm): Linien rechtwinklig wie
       im Klassendiagramm von SQL Studio statt schräg.                 */
  const KINDS = {
    mindmap: {
      label: 'Mindmap', icon: '🧠',
      hint: 'Themen mit Gedanken als Äste drumherum – eins oder mehrere.',
      node: 'topic', edge: 'branch',
      add: [{ type: 'center', label: 'Thema' }, { type: 'topic', label: 'Ast' }, { type: 'note', label: 'Notiz' }],
      edges: ['branch', 'line', 'arrow']
    },
    wirkung: {   // id bleibt 'wirkung' (gespeicherte Diagramme), heißt seit 03.11.2026 Concept Map
      label: 'Concept Map', icon: '🔄',
      hint: 'Begriffe mit Pfeilen verbinden – schwarz, grün oder rot – und beschriften.',
      node: 'box', edge: 'effect',
      add: [{ type: 'box', label: 'Begriff' }, { type: 'note', label: 'Notiz' }],
      edges: ['effect']
    },
    klasse: {
      label: 'Klassendiagramm', icon: '🧩',
      hint: 'Klassen mit Attributen und Methoden und ihre Beziehungen (UML).',
      node: 'class', edge: 'assoc',
      add: [{ type: 'class', label: 'Klasse' }, { type: 'note', label: 'Notiz' }],
      edges: ['assoc', 'directed', 'inherit', 'aggr', 'comp', 'dep']
    },
    objekt: {
      label: 'Objektdiagramm', icon: '📦',
      hint: 'Konkrete Objekte mit ihren Attributwerten und Verbindungen (UML).',
      node: 'object', edge: 'link',
      add: [{ type: 'object', label: 'Objekt' }, { type: 'note', label: 'Notiz' }],
      edges: ['link', 'directed']
    }
  };
  const KIND_IDS = Object.keys(KINDS);

  const EDGE_LABEL = {
    branch: 'Ast', line: 'Linie', arrow: 'Pfeil', effect: 'Wirkung',
    assoc: 'Assoziation', directed: 'gerichtet', inherit: 'Vererbung',
    aggr: 'Aggregation', comp: 'Komposition', dep: 'Abhängigkeit', link: 'Verbindung'
  };
  // Kleine Bildchen für die Auswahl-Leiste (24×12).
  const EDGE_ICON = {
    branch:   '<path d="M2 10 C10 10 12 2 22 2" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    line:     '<path d="M2 6H22" stroke="currentColor" stroke-width="1.8"/>',
    arrow:    '<path d="M2 6H21M16 2l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    effect:   '<path d="M2 6H21M16 2l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    assoc:    '<path d="M2 6H22" stroke="currentColor" stroke-width="1.8"/>',
    directed: '<path d="M2 6H21M16 2l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    inherit:  '<path d="M2 6H15" stroke="currentColor" stroke-width="1.8"/><path d="M15 1.5L22 6 15 10.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    aggr:     '<path d="M10 6H22" stroke="currentColor" stroke-width="1.8"/><path d="M1.5 6L6 2.5 10.5 6 6 9.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    comp:     '<path d="M10 6H22" stroke="currentColor" stroke-width="1.8"/><path d="M1.5 6L6 2.5 10.5 6 6 9.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.6"/>',
    dep:      '<path d="M2 6H21" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.5"/><path d="M16 2l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    link:     '<path d="M2 6H22" stroke="currentColor" stroke-width="1.8"/>'
  };
  const EDGE_HINT = {
    assoc: 'kennt / benutzt', directed: 'kennt (nur in Pfeilrichtung)',
    inherit: 'ist ein (Pfeil zur Oberklasse)', aggr: 'hat ein (Raute am Ganzen)',
    comp: 'besteht aus (Raute am Ganzen)', dep: 'hängt ab von'
  };

  function emptyDoc(kind) {
    const d = { v: 1, kind, nodes: [], edges: [] };
    if (kind === 'mindmap') d.nodes.push({ id: uid(), type: 'center', x: 0, y: 0, t: 'Thema', c: 0 });
    return d;
  }

  /* UML-Zeile in links/rechts teilen, wie SQL Studio Name und Typ:
       Attribut  „- name: String"        → „- name"        | „String"
       Methode   „+ fahren(km: int): void"→ „+ fahren(km: int)" | „void"
       Objekt    „marke = "VW""          → „marke"         | „= "VW""   */
  function umlRow(line, how) {
    const s = line.trim();
    if (how === 'obj') {
      const i = s.indexOf('=');
      return i > 0 ? { l: s.slice(0, i).trim(), r: '= ' + s.slice(i + 1).trim(), val: true } : { l: s, r: '' };
    }
    const close = s.lastIndexOf(')');
    const i = close >= 0 ? s.indexOf(':', close) : s.indexOf(':');
    return i > 0 ? { l: s.slice(0, i).trim(), r: s.slice(i + 1).trim() } : { l: s, r: '' };
  }

  /* ════════════════════════════════════════════════════════════
     3  Zeichnen
     ════════════════════════════════════════════════════════════
     Größe eines Knotens hängt nur an seinem Text: measure() rechnet
     sie aus und legt Zeilen + Kasten in n._m ab (wird nie
     gespeichert — clean() schneidet alles mit _ ab). */
  function measure(n) {
    if (n.type === 'class' || n.type === 'object') {
      const obj = n.type === 'object';
      const title = obj ? ((n.t || '') + ' : ' + (n.k || 'Klasse')) : (n.t || 'Klasse');
      const a = linesOf(n.a).map(l => umlRow(l, obj ? 'obj' : 'attr'));
      const o = obj ? [] : linesOf(n.o).map(l => umlRow(l, 'op'));
      const rowW = r => textW(r.l, 13, false, FONT_U) + (r.r ? 24 + textW(r.r, 11.5, false, MONO) : 0);
      const w = Math.ceil(Math.max(U_MINW, textW(title, 14, true, FONT_U) + 28, ...a.map(rowW).map(x => x + 26), ...o.map(rowW).map(x => x + 26)));
      const ha = a.length ? a.length * U_ROW + 12 : 14;
      const ho = obj ? 0 : (o.length ? o.length * U_ROW + 12 : 14);
      n._m = { w, h: U_HEAD + ha + ho, title, a, o, ha, ho, empty: obj ? !n.t && !n.k : !n.t };
      return n._m;
    }
    const big = n.type === 'center';
    const size = big ? 19 : FS;
    const lines = wrap(n.t || '', big ? 260 : MAXW, size, big);
    const tw = Math.max(...lines.map(l => textW(l, size, big)), big ? 60 : 30);
    const padX = big ? 26 : (n.type === 'note' ? 14 : 16);
    const padY = big ? 18 : (n.type === 'box' ? 12 : 10);
    const w = Math.ceil(tw + padX * 2);
    const h = Math.ceil(lines.length * (big ? 25 : LH) + padY * 2 + (n.type === 'box' ? 3 : 0));
    n._m = { w, h, lines, size, big, lh: big ? 25 : LH };
    return n._m;
  }

  function box(n) {
    const m = n._m || measure(n);
    return { x: n.x - m.w / 2, y: n.y - m.h / 2, w: m.w, h: m.h };
  }

  // Wo verlässt die Strecke von der Mitte nach (tx,ty) den Kasten?
  function clipToBox(n, tx, ty, extra) {
    const m = n._m || measure(n);
    const dx = tx - n.x, dy = ty - n.y;
    if (!dx && !dy) return { x: n.x, y: n.y };
    const hw = m.w / 2 + (extra || 0), hh = m.h / 2 + (extra || 0);
    const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return { x: n.x + dx * t, y: n.y + dy * t };
  }

  function textLines(lines, x, y0, lh, opts) {
    const o = opts || {};
    return lines.map((l, i) =>
      `<text x="${x}" y="${y0 + i * lh}" font-family="${o.fam || FONT}" font-size="${o.size || FS}"${o.bold ? ' font-weight="700"' : ''}`
      + `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.under ? ' text-decoration="underline"' : ''}`
      + ` fill="${o.fill || TEXT}" dominant-baseline="central">${esc(l)}</text>`).join('');
  }

  // Ein UML-Abschnitt (Attribute bzw. Methoden) mit Zebrastreifen wie SQL Studio.
  function umlRows(rows, b, y) {
    let g = '';
    rows.forEach((r, i) => {
      const ry = y + 6 + i * U_ROW;
      if (i % 2 === 1) g += `<rect x="${b.x + 1}" y="${ry}" width="${b.w - 2}" height="${U_ROW}" fill="var(--dg-zebra)" opacity=".35"/>`;
      g += `<text x="${b.x + 14}" y="${ry + 16}" font-family="${FONT_U}" font-size="13" fill="var(--dg-uml-ink)">${esc(r.l)}</text>`;
      if (r.r) g += `<text x="${b.x + b.w - 12}" y="${ry + 16}" font-family="${MONO}" font-size="11.5" text-anchor="end" fill="${r.val ? 'var(--dg-uml-ink)' : 'var(--dg-muted)'}">${esc(r.r)}</text>`;
    });
    return g;
  }

  function nodeSVG(n, st) {
    const m = measure(n);
    const b = box(n);
    const [fill, stroke] = COLORS[n.c || 0] || COLORS[0];
    const sel = st.selSet && st.selSet.has(n.id);
    const lift = st.lift && st.lift.has(n.id);
    let g = `<g class="dg-node${sel ? ' is-sel' : ''}" data-node="${n.id}">`;
    if (n.type === 'class' || n.type === 'object') {
      // Karte wie SQL Studio; Farbe 0 = Petrol-Kopf der Seite, sonst Pastell
      const headFill = (n.c || 0) ? fill : 'var(--dg-head)';
      const headInk = (n.c || 0) ? TEXT : 'var(--dg-uml-ink)';
      g += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="12" fill="var(--dg-card)" stroke="var(--dg-card-edge)" stroke-width="1" filter="url(#${lift ? 'dgLift' : 'dgCard'})"/>`;
      g += `<path d="M${b.x} ${b.y + 12}a12 12 0 0 1 12-12h${b.w - 24}a12 12 0 0 1 12 12v${U_HEAD - 12}h-${b.w}z" fill="${headFill}"/>`;
      g += `<line x1="${b.x}" y1="${b.y + U_HEAD}" x2="${b.x + b.w}" y2="${b.y + U_HEAD}" stroke="var(--dg-card-edge)"/>`;
      g += `<text x="${b.x + 14}" y="${b.y + 22}" font-family="${FONT_U}" font-size="14" font-weight="700" fill="${m.empty ? 'var(--dg-muted)' : headInk}"${n.type === 'object' ? ' text-decoration="underline"' : ''}>${esc(m.title)}</text>`;
      g += umlRows(m.a, b, b.y + U_HEAD);
      if (n.type === 'class') {
        const y2 = b.y + U_HEAD + m.ha;
        g += `<line x1="${b.x}" y1="${y2}" x2="${b.x + b.w}" y2="${y2}" stroke="var(--dg-card-edge)"/>`;
        g += umlRows(m.o, b, y2);
      }
    } else if (n.type === 'center') {
      // Großer Zettel mit einem Streifen Klebeband
      g += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="${PAPER}" stroke="#e4dccb" stroke-width="1" filter="url(#${lift ? 'dgLift' : 'dgPaper'})"/>`;
      g += `<rect x="${b.x}" y="${b.y + b.h - 4}" width="${b.w}" height="4" fill="${stroke}" opacity=".85"/>`;
      g += `<rect x="${n.x - 30}" y="${b.y - 8}" width="60" height="16" fill="#e7dcc0" opacity=".85" transform="rotate(-2 ${n.x} ${b.y})"/>`;
      g += textLines(m.lines, n.x, n.y - 2 - (m.lines.length - 1) * m.lh / 2, m.lh, { size: m.size, bold: true, anchor: 'middle' });
    } else if (n.type === 'note') {
      const f = 10;
      g += `<path d="M${b.x} ${b.y}H${b.x + b.w}V${b.y + b.h - f}L${b.x + b.w - f} ${b.y + b.h}H${b.x}Z" fill="#fdf3b8" filter="url(#${lift ? 'dgLift' : 'dgPaper'})"/>`;
      g += `<path d="M${b.x + b.w} ${b.y + b.h - f}L${b.x + b.w - f} ${b.y + b.h - f}V${b.y + b.h}Z" fill="#e9d98a"/>`;
      g += textLines(m.lines, b.x + 14, n.y - (m.lines.length - 1) * m.lh / 2, m.lh, { fill: '#3f3a2a' });
    } else if (n.type === 'box') {
      // Karteikarte mit farbigem Streifen oben
      g += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="${PAPER}" stroke="#e4dccb" stroke-width="1" filter="url(#${lift ? 'dgLift' : 'dgPaper'})"/>`;
      g += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="4" rx="1" fill="${stroke}"/>`;
      g += textLines(m.lines, n.x, n.y + 2 - (m.lines.length - 1) * m.lh / 2, m.lh, { anchor: 'middle' });
    } else {
      // Mindmap-Ast: farbiger Zettel
      g += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-opacity=".28" stroke-width="1" filter="url(#${lift ? 'dgLift' : 'dgPaper'})"/>`;
      g += textLines(m.lines, n.x, n.y - (m.lines.length - 1) * m.lh / 2, m.lh, { anchor: 'middle' });
    }
    if (!(n.t || '').trim() && n.type !== 'class' && n.type !== 'object') {
      g += `<text x="${n.x}" y="${n.y}" font-family="${FONT}" font-size="${FS}" fill="#a8a29e" text-anchor="middle" dominant-baseline="central">…</text>`;
    }
    if (sel) {
      const r = n.type === 'class' || n.type === 'object' ? 15 : 7;
      g += `<rect class="dg-selbox" x="${b.x - 5}" y="${b.y - 5}" width="${b.w + 10}" height="${b.h + 10}" rx="${r}" fill="none"/>`;
    }
    return g + '</g>';
  }

  // Pfeilspitzen als eigene Pfade (statt <marker>): so folgen sie der
  // Linienfarbe in hell und dunkel und beim Export.
  function head(kind, p, ang, color) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pt = (u, v) => `${(p.x + u * c - v * s).toFixed(1)} ${(p.y + u * s + v * c).toFixed(1)}`;
    if (kind === 'open')    return `<path d="M${pt(-13, -7)}L${pt(0, 0)}L${pt(-13, 7)}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
    if (kind === 'solid')   return `<path d="M${pt(-13, -6.5)}L${pt(0, 0)}L${pt(-13, 6.5)}Z" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>`;
    if (kind === 'tri')     return `<path d="M${pt(-17, -10)}L${pt(0, 0)}L${pt(-17, 10)}Z" fill="var(--dg-card)" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
    if (kind === 'diamond') return `<path d="M${pt(0, 0)}L${pt(-11, -7)}L${pt(-22, 0)}L${pt(-11, 7)}Z" fill="var(--dg-card)" stroke="${color}" stroke-width="1.6"/>`;
    if (kind === 'diamondF')return `<path d="M${pt(0, 0)}L${pt(-11, -7)}L${pt(-22, 0)}L${pt(-11, 7)}Z" fill="${color}" stroke="${color}" stroke-width="1.6"/>`;
    return '';
  }
  // Wie weit die Linie vor der Spitze aufhört (sonst ragt sie hinein).
  const HEAD_BACK = { tri: 17, diamond: 22, diamondF: 22, solid: 6, open: 0 };

  // Beschriftung bzw. Anzahl: lab = 'l' | 'm1' | 'm2' — daran lässt sie sich
  // im Editor ein Stück verschieben (lo/o1/o2).
  function labelSVG(x, y, text, opts) {
    if (!text) return '';
    const fam = (opts && opts.fam) || FONT;
    const w = textW(text, 13, false, fam) + 12;
    return `<g class="dg-elabel" data-lab="l"><rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="5" fill="var(--dg-paper)" opacity=".92"/>`
      + `<text x="${x}" y="${y}" font-family="${fam}" font-size="13" text-anchor="middle" dominant-baseline="central" fill="${(opts && opts.fill) || LINE}">${esc(text)}</text></g>`;
  }

  /* ── Andockpunkte ───────────────────────────────────────────── */
  const LAB_MAX = 70;            // so weit lassen sich Beschriftungen verschieben
  const nudge = v => Array.isArray(v) ? [Number(v[0]) || 0, Number(v[1]) || 0] : [0, 0];

  // Seite eines Andockpunkts u als Richtung nach außen.
  function sideOf(u) {
    return Math.abs(u[0]) >= Math.abs(u[1]) ? [u[0] >= 0 ? 1 : -1, 0] : [0, u[1] >= 0 ? 1 : -1];
  }
  function anchorPt(n, u) {
    const m = n._m || measure(n);
    return { x: n.x + u[0] * m.w / 2, y: n.y + u[1] * m.h / 2, d: sideOf(u) };
  }
  // Nächster Punkt auf dem Rand von n zu (x, y), als u. Mitte einer Seite rastet ein.
  function borderU(n, x, y) {
    const m = n._m || measure(n);
    const hw = m.w / 2, hh = m.h / 2;
    let px = clamp(x - n.x, -hw, hw), py = clamp(y - n.y, -hh, hh);
    const dl = px + hw, dr = hw - px, dt = py + hh, db = hh - py;
    const mn = Math.min(dl, dr, dt, db);
    if (mn === dr) px = hw; else if (mn === dl) px = -hw; else if (mn === db) py = hh; else py = -hh;
    return [px / hw, py / hh].map(v => { const r = Math.round(v * 100) / 100; return Math.abs(r) < 0.1 ? 0 : r; });
  }

  /* ── Rechtwinklige Linien (Klassen-/Objektdiagramm, doc.ortho) ──
     Wie in SQL Studio: waagrecht aus der Seite heraus, senkrecht in
     der Mitte, waagrecht hinein (bzw. gedreht, wenn die Kästen
     übereinander stehen). Liegen sie ineinander, geht es außen
     rechts herum. Selbst gesetzte Andockpunkte bestimmen die Seite. */
  function orthoEnds(A, B, e, twin) {
    const ba = box(A), bb = box(B);
    const gx = Math.max(bb.x - (ba.x + ba.w), ba.x - (bb.x + bb.w));
    const gy = Math.max(bb.y - (ba.y + ba.h), ba.y - (bb.y + bb.h));
    const shift = twin ? (e.a < e.b ? -10 : 10) : 0;
    let p1, p2;
    if (gx >= 24) {
      const r = B.x >= A.x ? 1 : -1;
      const top = Math.max(ba.y, bb.y), bot = Math.min(ba.y + ba.h, bb.y + bb.h);
      const y1 = bot - top > 16 ? (top + bot) / 2 : A.y, y2 = bot - top > 16 ? (top + bot) / 2 : B.y;
      p1 = { x: r > 0 ? ba.x + ba.w : ba.x, y: y1 + shift, d: [r, 0] };
      p2 = { x: r > 0 ? bb.x : bb.x + bb.w, y: y2 + shift, d: [-r, 0] };
    } else if (gy >= 24) {
      const r = B.y >= A.y ? 1 : -1;
      const l = Math.max(ba.x, bb.x), rr = Math.min(ba.x + ba.w, bb.x + bb.w);
      const x1 = rr - l > 16 ? (l + rr) / 2 : A.x, x2 = rr - l > 16 ? (l + rr) / 2 : B.x;
      p1 = { x: x1 + shift, y: r > 0 ? ba.y + ba.h : ba.y, d: [0, r] };
      p2 = { x: x2 + shift, y: r > 0 ? bb.y : bb.y + bb.h, d: [0, -r] };
    } else {
      p1 = { x: ba.x + ba.w, y: A.y + shift, d: [1, 0] };
      p2 = { x: bb.x + bb.w, y: B.y + shift, d: [1, 0] };
    }
    if (e.pa) p1 = anchorPt(A, e.pa);
    if (e.pb) p2 = anchorPt(B, e.pb);
    return [p1, p2];
  }
  function orthoRoute(p1, p2) {
    const OFF = 24;
    const d1 = p1.d, d2 = p2.d;
    const a = { x: p1.x + d1[0] * OFF, y: p1.y + d1[1] * OFF };
    const b = { x: p2.x + d2[0] * OFF, y: p2.y + d2[1] * OFF };
    const h1 = d1[0] !== 0, h2 = d2[0] !== 0;
    let mid;
    if (h1 && h2) {
      if (d1[0] === -d2[0] && (b.x - a.x) * d1[0] >= 0) { const mx = (p1.x + p2.x) / 2; mid = [[mx, p1.y], [mx, p2.y]]; }
      else if (d1[0] === d2[0]) { const x = d1[0] > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x); mid = [[x, p1.y], [x, p2.y]]; }
      else { const my = (p1.y + p2.y) / 2; mid = [[a.x, p1.y], [a.x, my], [b.x, my], [b.x, p2.y]]; }
    } else if (!h1 && !h2) {
      if (d1[1] === -d2[1] && (b.y - a.y) * d1[1] >= 0) { const my = (p1.y + p2.y) / 2; mid = [[p1.x, my], [p2.x, my]]; }
      else if (d1[1] === d2[1]) { const y = d1[1] > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y); mid = [[p1.x, y], [p2.x, y]]; }
      else { const mx = (p1.x + p2.x) / 2; mid = [[p1.x, a.y], [mx, a.y], [mx, b.y], [p2.x, b.y]]; }
    } else if (h1) {
      if ((p2.x - p1.x) * d1[0] > 0 && (p1.y - p2.y) * d2[1] > 0) mid = [[p2.x, p1.y]];
      else mid = [[a.x, p1.y], [a.x, b.y], [p2.x, b.y]];
    } else {
      if ((p2.y - p1.y) * d1[1] > 0 && (p1.x - p2.x) * d2[0] > 0) mid = [[p1.x, p2.y]];
      else mid = [[p1.x, a.y], [b.x, a.y], [b.x, p2.y]];
    }
    const raw = [[p1.x, p1.y], ...mid, [p2.x, p2.y]];
    // Doppelte und gerade durchlaufende Punkte weg
    const pts = [];
    for (const q of raw) {
      const l = pts[pts.length - 1];
      if (l && Math.abs(l[0] - q[0]) < 0.5 && Math.abs(l[1] - q[1]) < 0.5) continue;
      if (pts.length >= 2) {
        const k = pts[pts.length - 2];
        if ((Math.abs(k[0] - l[0]) < 0.5 && Math.abs(l[0] - q[0]) < 0.5) || (Math.abs(k[1] - l[1]) < 0.5 && Math.abs(l[1] - q[1]) < 0.5)) pts.pop();
      }
      pts.push(q);
    }
    return pts;
  }
  function roundPath(pts) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const r = Math.min(10, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
      const ax = x1 - Math.sign(x1 - x0) * r, ay = y1 - Math.sign(y1 - y0) * r;
      const bx = x1 + Math.sign(x2 - x1) * r, by = y1 + Math.sign(y2 - y1) * r;
      d += `L${ax} ${ay}Q${x1} ${y1} ${bx} ${by}`;
    }
    const l = pts[pts.length - 1];
    return d + `L${l[0]} ${l[1]}`;
  }
  // Punkt auf halber Länge eines Linienzugs, mit Richtung des Stücks dort.
  function halfway(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let rest = total / 2;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (rest <= len || i === pts.length - 1) {
        const t = len ? Math.min(1, rest / len) : 0;
        return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dx: (x1 - x0) / (len || 1), dy: (y1 - y0) / (len || 1) };
      }
      rest -= len;
    }
    return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
  }

  function edgeSVG(e, doc, byId, st) {
    const A = byId[e.a], B = byId[e.b];
    if (!A || !B) return '';
    const sel = st.selSet && st.selSet.has(e.id);
    const uml = isUml(doc.kind);
    let color = uml ? LINK : LINE;
    let width = uml ? 1.5 : 1.6;
    let dash = '';
    const fam = uml ? FONT_U : FONT;
    if (e.type === 'branch') {
      color = (COLORS[B.c || 0] || COLORS[0])[1];
      width = A.type === 'center' ? 3.2 : 2.2;
    }
    if (e.type === 'dep') dash = ' stroke-dasharray="6 5"';
    if (e.type === 'effect') { color = ARROW[e.f] || LINE; width = e.f && e.f !== 'k' ? 2 : 1.6; }

    const twin = e.type !== 'branch' && doc.edges.some(o => o !== e && o.a === e.b && o.b === e.a);
    const endHead = { effect: 'solid', arrow: 'solid', directed: 'open', dep: 'open', inherit: 'tri' }[e.type];
    const startHead = { aggr: 'diamond', comp: 'diamondF' }[e.type];

    let d, p1, p2, mid, nrm = null, out1, out2, heads = '';
    if (e.type === 'branch') {
      // Waagrechter Schwung vom Elternteil zum Kind.
      const right = B.x >= A.x;
      const ba = box(A), bb = box(B);
      p1 = A.type === 'center' ? clipToBox(A, B.x, B.y) : { x: right ? ba.x + ba.w : ba.x, y: A.y };
      p2 = { x: right ? bb.x : bb.x + bb.w, y: B.y };
      if (Math.abs(B.x - A.x) < (ba.w + bb.w) / 2) {         // Kind steht drüber/drunter
        p1 = clipToBox(A, B.x, B.y); p2 = clipToBox(B, A.x, A.y);
        d = `M${p1.x} ${p1.y}L${p2.x} ${p2.y}`;
      } else {
        const k = (p2.x - p1.x) * 0.5;
        d = `M${p1.x} ${p1.y}C${p1.x + k} ${p1.y} ${p2.x - k} ${p2.y} ${p2.x} ${p2.y}`;
      }
      mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    } else if (uml && doc.ortho) {
      [p1, p2] = orthoEnds(A, B, e, twin);
      const pts = orthoRoute(p1, p2);
      const n = pts.length;
      const angEnd = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]);
      const angStart = Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]);
      out1 = angStart + Math.PI; out2 = angEnd + Math.PI;
      const cut = pts.map(q => q.slice());
      if (endHead) { cut[n - 1][0] -= Math.cos(angEnd) * HEAD_BACK[endHead]; cut[n - 1][1] -= Math.sin(angEnd) * HEAD_BACK[endHead]; }
      if (startHead) { cut[0][0] -= Math.cos(angStart) * HEAD_BACK[startHead]; cut[0][1] -= Math.sin(angStart) * HEAD_BACK[startHead]; }
      d = roundPath(cut);
      const h = halfway(pts);
      mid = { x: h.x, y: h.y };
      nrm = { x: -h.dy, y: h.dx };
      heads = [endHead && head(endHead, p2, angEnd, color), startHead && head(startHead, p1, angStart, color)].filter(Boolean).join('');
    } else {
      // Gegenläufige Kante dazwischen? Dann beide leicht biegen.
      const bend = twin ? 28 : 0;
      const qa = e.pa ? anchorPt(A, e.pa) : null, qb = e.pb ? anchorPt(B, e.pb) : null;
      const ax = qa ? qa.x : A.x, ay = qa ? qa.y : A.y, bx = qb ? qb.x : B.x, by = qb ? qb.y : B.y;
      const mx0 = (ax + bx) / 2, my0 = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const cx = mx0 + nx * bend, cy = my0 + ny * bend;
      p1 = qa || clipToBox(A, cx, cy, 2);
      p2 = qb || clipToBox(B, cx, cy, 2);
      const angEnd = Math.atan2(p2.y - cy, p2.x - cx);
      const angStart = Math.atan2(p1.y - cy, p1.x - cx);
      out1 = angStart + Math.PI; out2 = angEnd + Math.PI;
      // Linie an der Spitze kürzen
      const q2 = endHead ? { x: p2.x - Math.cos(angEnd) * HEAD_BACK[endHead], y: p2.y - Math.sin(angEnd) * HEAD_BACK[endHead] } : p2;
      const q1 = startHead ? { x: p1.x - Math.cos(angStart) * HEAD_BACK[startHead], y: p1.y - Math.sin(angStart) * HEAD_BACK[startHead] } : p1;
      d = bend ? `M${q1.x} ${q1.y}Q${cx} ${cy} ${q2.x} ${q2.y}` : `M${q1.x} ${q1.y}L${q2.x} ${q2.y}`;
      mid = bend ? { x: (p1.x + 2 * cx + p2.x) / 4, y: (p1.y + 2 * cy + p2.y) / 4 } : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      nrm = { x: nx, y: ny };
      heads = [endHead && head(endHead, p2, angEnd, color), startHead && head(startHead, p1, angStart, color)].filter(Boolean).join('');
    }
    if (st.ends && e.type !== 'branch') st.ends[e.id] = { p1, p2 };

    let g = `<g class="dg-edge${sel ? ' is-sel' : ''}" data-edge="${e.id}">`;
    g += `<path class="dg-hit" d="${d}" fill="none" stroke="transparent" stroke-width="18"/>`;
    if (sel) g += `<path d="${d}" fill="none" stroke="var(--dg-sel)" stroke-width="${width + 7}" stroke-linecap="round" opacity=".35"/>`;
    g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    g += heads;

    const lo = nudge(e.lo);
    if (e.l && e.type === 'effect' && nrm) {
      // Beschriftung neben den Pfeil statt darauf: über waagrechte, rechts neben senkrechte
      // (sonst verdeckt sie bei kurzen Pfeilen die ganze Linie).
      let ux = nrm.x, uy = nrm.y;
      if (uy > 1e-6 || (Math.abs(uy) <= 1e-6 && ux < 0)) { ux = -ux; uy = -uy; }
      const lw = textW(e.l, 13, false, fam) + 12;
      const off = 15 * Math.abs(uy) + (lw / 2 + 6) * Math.abs(ux);
      g += labelSVG(mid.x + ux * off + lo[0], mid.y + uy * off + lo[1], e.l, { fam, fill: color });
    } else if (e.l) {
      g += labelSVG(mid.x + lo[0], mid.y + lo[1], e.l, uml ? { fam, fill: 'var(--dg-muted)' } : { fam });
    }
    // Multiplizitäten an den Enden
    if ((e.m1 || e.m2) && out1 != null) {
      const off = (p, ang, t, key) => {
        if (!t) return '';
        const o = nudge(e[key === 'm1' ? 'o1' : 'o2']);
        const ox = p.x + Math.cos(ang) * 24 + Math.cos(ang + Math.PI / 2) * 12 + o[0];
        const oy = p.y + Math.sin(ang) * 24 + Math.sin(ang + Math.PI / 2) * 12 + o[1];
        return `<g class="dg-elabel" data-lab="${key}"><circle cx="${ox}" cy="${oy}" r="13" fill="transparent"/>`
          + `<text x="${ox}" y="${oy}" font-family="${fam}" font-size="12" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="var(--dg-muted)">${esc(t)}</text></g>`;
      };
      g += off(p1, out1, e.m1, 'm1') + off(p2, out2, e.m2, 'm2');
    }
    return g + '</g>';
  }

  function docSVG(doc, st) {
    const byId = {};
    for (const n of doc.nodes) { byId[n.id] = n; measure(n); }
    let s = '';
    for (const e of doc.edges) s += edgeSVG(e, doc, byId, st);
    for (const n of doc.nodes) s += nodeSVG(n, st);
    return s;
  }

  function bounds(doc) {
    if (!doc.nodes.length) return { x: -200, y: -150, w: 400, h: 300 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of doc.nodes) {
      const b = box(n);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ════════════════════════════════════════════════════════════
     Mindmap ordnen
     ════════════════════════════════════════════════════════════
     Jedes Thema (center) mit seinem Baum; das erste bei (0,0), die
     weiteren darunter. Äste erster Ebene abwechselnd rechts und links,
     jeder Teilbaum bekommt so viel Höhe, wie seine Blätter brauchen.
     Ein Baum endet an einem anderen Thema. */
  function layoutMindmap(doc) {
    const centers = doc.nodes.filter(n => n.type === 'center');
    if (!centers.length) return false;
    const kids = {};
    for (const e of doc.edges) {
      if (e.type !== 'branch') continue;
      (kids[e.a] = kids[e.a] || []).push(e.b);
    }
    const byId = {}; doc.nodes.forEach(n => { byId[n.id] = n; measure(n); });
    const GAP_Y = 14, GAP_X = 60, GAP_TREE = 70;
    const seen = new Set(centers.map(c => c.id));
    const childrenOf = id => (kids[id] || []).filter(k => byId[k] && byId[k].type !== 'center' && !seen.has(k) && (seen.add(k), true));
    const tree = id => ({ id, kids: childrenOf(id).map(tree) });
    const height = t => {
      const own = byId[t.id]._m.h;
      const kh = t.kids.reduce((s, k) => s + height(k), 0) + Math.max(0, t.kids.length - 1) * GAP_Y;
      t.h = Math.max(own, kh);
      return t.h;
    };
    const place = (t, x, yTop, dir, out) => {
      const n = byId[t.id];
      out.push(n);
      n.x = Math.round(x + dir * n._m.w / 2);
      n.y = Math.round(yTop + t.h / 2);
      let y = yTop + (t.h - (t.kids.reduce((s, k) => s + k.h, 0) + Math.max(0, t.kids.length - 1) * GAP_Y)) / 2;
      for (const k of t.kids) {
        place(k, x + dir * (n._m.w + GAP_X), y, dir, out);
        y += k.h + GAP_Y;
      }
    };
    let cursor = null;
    for (const center of centers) {
      const root = tree(center.id);
      const R = [], L = [];
      root.kids.forEach((k, i) => (i % 2 ? L : R).push(k));
      center.x = 0; center.y = 0;
      const out = [center];
      for (const [side, dir] of [[R, 1], [L, -1]]) {
        side.forEach(height);
        const total = side.reduce((s, k) => s + k.h, 0) + Math.max(0, side.length - 1) * GAP_Y * 2;
        let y = -total / 2;
        for (const k of side) {
          place(k, dir * (center._m.w / 2 + GAP_X + 20), y, dir, out);
          y += k.h + GAP_Y * 2;
        }
      }
      // Bäume untereinander
      const top = Math.min(...out.map(n => n.y - n._m.h / 2));
      const bot = Math.max(...out.map(n => n.y + n._m.h / 2));
      const dy = cursor == null ? 0 : Math.round(cursor - top);
      if (dy) out.forEach(n => { n.y += dy; });
      cursor = bot + dy + GAP_TREE;
    }
    return true;
  }

  /* ════════════════════════════════════════════════════════════
     4  Canvas — eine Zeichenfläche
     ════════════════════════════════════════════════════════════ */
  function Canvas(host, opts) {
    const o = opts || {};
    const self = this;
    this.doc = emptyDoc('mindmap');
    this.sel = null;              // { kind: 'node'|'edge', id } — zuletzt angetippt
    this.multi = null;            // Set mehrerer ids (Strg+Klick), enthält sel
    this.view = { x: 0, y: 0, k: 1 };
    this.readonly = !!o.readonly;
    this.onChange = o.onChange || (() => {});
    this.onSelect = o.onSelect || (() => {});
    this.onEdit = o.onEdit || (() => {});
    this.onBefore = o.onBefore || (() => {});

    host.classList.add('dg-canvas');
    host.innerHTML = `<svg class="dg-svg" xmlns="${NS}">${DEFS}<g class="dg-world"><g class="dg-content"></g><g class="dg-overlay"></g></g></svg>`;
    this.host = host;
    this.svg = host.querySelector('svg');
    this.world = host.querySelector('.dg-world');
    this.content = host.querySelector('.dg-content');
    // Erst mit geladener Webschrift stimmen die gemessenen Breiten.
    if (document.fonts && document.fonts.load) {
      Promise.all([document.fonts.load(`15px ${FONT}`), document.fonts.load(`700 15px ${FONT}`),
                   document.fonts.load(`13px ${FONT_U}`), document.fonts.load(`700 14px ${FONT_U}`),
                   document.fonts.load(`11.5px ${MONO}`)])
        .then(() => { if (self.svg.isConnected) self.render(); }).catch(() => {});
    }
    this.overlay = host.querySelector('.dg-overlay');

    /* ── Zeiger ─────────────────────────────────────────────── */
    const ptrs = new Map();
    let drag = null;      // { mode: 'pan'|'node'|'link'|'pinch', ... }
    let lastTap = { t: 0, id: null, x: 0, y: 0 };

    const toWorld = (cx, cy) => {
      const r = self.svg.getBoundingClientRect();
      return { x: (cx - r.left - self.view.x) / self.view.k, y: (cy - r.top - self.view.y) / self.view.k };
    };
    this.toWorld = toWorld;

    const pinchInfo = () => {
      const [a, b] = [...ptrs.values()];
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };

    function down(ev) {
      if (ev.button > 0) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { self.svg.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
      if (ptrs.size === 2) {
        // Zweiter Finger: was auch lief, wird zum Zoomen.
        if (drag && drag.mode === 'node' && drag.moved) self.onChange();
        self.lift = null;
        self.overlay.innerHTML = '';
        const p = pinchInfo();
        drag = { mode: 'pinch', start: p, view: Object.assign({}, self.view) };
        return;
      }
      if (ptrs.size > 2) return;
      const w = toWorld(ev.clientX, ev.clientY);
      const t = ev.target;
      const handle = !self.readonly && t.closest && t.closest('[data-handle]');
      const endEl = !self.readonly && t.closest && t.closest('[data-end]');
      const labEl = !self.readonly && t.closest && t.closest('[data-lab]');
      const nodeEl = t.closest && t.closest('[data-node]');
      const edgeEl = t.closest && t.closest('[data-edge]');
      const add = ev.ctrlKey || ev.metaKey;     // Strg/⌘ + Klick = zur Auswahl dazu
      if (endEl) {
        // Andockpunkt einer gewählten Verbindung am Rand entlang schieben
        drag = { mode: 'end', id: endEl.dataset.edge, which: endEl.dataset.end, sx: ev.clientX, sy: ev.clientY, moved: false };
        ev.preventDefault();
        return;
      }
      if (labEl && edgeEl) {
        // Beschriftung/Anzahl ein Stück verschieben (Feinjustierung)
        const e = self.edge(edgeEl.dataset.edge);
        const key = { l: 'lo', m1: 'o1', m2: 'o2' }[labEl.dataset.lab];
        drag = { mode: 'lab', id: edgeEl.dataset.edge, key, orig: nudge(e && e[key]), start: w, sx: ev.clientX, sy: ev.clientY, moved: false, add };
        ev.preventDefault();
        return;
      }
      if (handle) {
        const from = self.node(handle.dataset.handle);
        drag = { mode: 'link', from, dir: handle.dataset.dir, sx: ev.clientX, sy: ev.clientY, moved: false, w };
        ev.preventDefault();
        return;
      }
      if (nodeEl && !self.readonly) {
        const n = self.node(nodeEl.dataset.node);
        // Mehrere gewählt und einer davon gefasst: alle wandern mit.
        // Mindmap: der ganze Ast (bzw. das Thema mit seinen Ästen) wandert mit.
        const inMulti = !!(self.multi && self.multi.has(n.id));
        const ids = inMulti ? [...self.multi].filter(id => self.node(id)) : [n.id];
        const set = new Map();
        for (const id of ids) for (const g of (self.doc.kind === 'mindmap' ? self.subtree(id) : [self.node(id)])) set.set(g.id, g);
        const group = [...set.values()];
        drag = { mode: 'node', n, group, inMulti, add, start: w, orig: group.map(g => ({ g, x: g.x, y: g.y })), sx: ev.clientX, sy: ev.clientY, moved: false };
        return;
      }
      if (edgeEl && !self.readonly) {
        drag = { mode: 'edge', id: edgeEl.dataset.edge, sx: ev.clientX, sy: ev.clientY, add };
        return;
      }
      drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, view: Object.assign({}, self.view), moved: false, w };
    }

    function move(ev) {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (!drag) return;
      if (drag.mode === 'pinch' && ptrs.size >= 2) {
        const p = pinchInfo();
        const r = self.svg.getBoundingClientRect();
        const k = clamp(drag.view.k * p.d / drag.start.d, 0.2, 3);
        // Punkt unter der Fingermitte bleibt stehen, und die Mitte wandert mit.
        const wx = (drag.start.cx - r.left - drag.view.x) / drag.view.k;
        const wy = (drag.start.cy - r.top - drag.view.y) / drag.view.k;
        self.view.k = k;
        self.view.x = p.cx - r.left - wx * k;
        self.view.y = p.cy - r.top - wy * k;
        self.applyView();
        return;
      }
      const dist = Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy);
      if (drag.mode === 'pan') {
        if (dist > 3) drag.moved = true;
        self.view.x = drag.view.x + (ev.clientX - drag.sx);
        self.view.y = drag.view.y + (ev.clientY - drag.sy);
        self.applyView();
      } else if (drag.mode === 'node') {
        if (!drag.moved && dist < 5) return;
        if (!drag.moved) {
          self.onBefore(); drag.moved = true; self.lift = new Set(drag.group.map(g => g.id));
          if (drag.inMulti) { self.sel = { kind: 'node', id: drag.n.id }; self.onSelect(self.sel); }
          else self.select({ kind: 'node', id: drag.n.id }, true);
        }
        const w = toWorld(ev.clientX, ev.clientY);
        const dx = w.x - drag.start.x, dy = w.y - drag.start.y;
        for (const it of drag.orig) { it.g.x = Math.round(it.x + dx); it.g.y = Math.round(it.y + dy); }
        self.render();
      } else if (drag.mode === 'end') {
        if (!drag.moved && dist < 3) return;
        const e = self.edge(drag.id);
        const n = e && self.node(drag.which === 'a' ? e.a : e.b);
        if (!n) return;
        if (!drag.moved) { self.onBefore(); drag.moved = true; }
        const w = toWorld(ev.clientX, ev.clientY);
        e[drag.which === 'a' ? 'pa' : 'pb'] = borderU(n, w.x, w.y);
        self.render();
      } else if (drag.mode === 'lab') {
        if (!drag.moved && dist < 4) return;
        const e = self.edge(drag.id);
        if (!e) return;
        if (!drag.moved) { self.onBefore(); drag.moved = true; }
        const w = toWorld(ev.clientX, ev.clientY);
        const v = [Math.round(clamp(drag.orig[0] + w.x - drag.start.x, -LAB_MAX, LAB_MAX)),
                   Math.round(clamp(drag.orig[1] + w.y - drag.start.y, -LAB_MAX, LAB_MAX))];
        if (v[0] || v[1]) e[drag.key] = v; else delete e[drag.key];
        self.render();
      } else if (drag.mode === 'link') {
        if (dist > 6) drag.moved = true;
        const w = toWorld(ev.clientX, ev.clientY);
        const target = self.nodeAt(w.x, w.y, drag.from.id);
        const p1 = clipToBox(drag.from, w.x, w.y, 2);
        const tb = target ? box(target) : null;
        self.overlay.innerHTML = (tb ? `<rect class="dg-target" x="${tb.x - 6}" y="${tb.y - 6}" width="${tb.w + 12}" height="${tb.h + 12}" rx="10"/>` : '')
          + `<path class="dg-ghost" d="M${p1.x} ${p1.y}L${w.x} ${w.y}"/><circle class="dg-ghost-dot" cx="${w.x}" cy="${w.y}" r="6"/>`;
      }
    }

    function up(ev) {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      if (!drag) return;
      if (drag.mode === 'pinch') { if (ptrs.size === 0) drag = null; return; }
      const d = drag; drag = null;
      const now = Date.now();
      const w = toWorld(ev.clientX, ev.clientY);
      if (d.mode === 'pan') {
        if (!d.moved) {
          const dbl = lastTap.id === '#bg' && now - lastTap.t < 380 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 24;
          lastTap = { t: now, id: '#bg', x: ev.clientX, y: ev.clientY };
          if (dbl && !self.readonly) { self.onEdit({ create: true, x: w.x, y: w.y }); lastTap.t = 0; }
          else if (!(ev.ctrlKey || ev.metaKey)) self.select(null);
        }
      } else if (d.mode === 'node') {
        if (d.moved) { self.lift = null; self.render(); self.onChange(); }
        else if (d.add) self.toggle(d.n.id);
        else {
          const dbl = lastTap.id === d.n.id && now - lastTap.t < 420;
          lastTap = { t: now, id: d.n.id, x: ev.clientX, y: ev.clientY };
          self.select({ kind: 'node', id: d.n.id });
          self.reveal(d.n);
          if (dbl) { self.onEdit({ id: d.n.id }); lastTap.t = 0; }
        }
      } else if (d.mode === 'edge') {
        if (d.add) self.toggle(d.id);
        else self.select({ kind: 'edge', id: d.id });
      } else if (d.mode === 'end') {
        if (d.moved) { self.onChange(); self.onSelect(self.sel); }
      } else if (d.mode === 'lab') {
        if (d.moved) { self.onChange(); if (self.sel && self.sel.id === d.id) self.onSelect(self.sel); }
        else if (d.add) self.toggle(d.id);
        else self.select({ kind: 'edge', id: d.id });
      } else if (d.mode === 'link') {
        self.overlay.innerHTML = '';
        const target = self.nodeAt(w.x, w.y, d.from.id);
        if (target) self.onEdit({ link: true, from: d.from.id, to: target.id });
        else if (d.moved) self.onEdit({ link: true, from: d.from.id, x: w.x, y: w.y });
        else self.onEdit({ link: true, from: d.from.id, dir: d.dir });
      }
    }

    function cancel(ev) { ptrs.delete(ev.pointerId); if (ptrs.size === 0) { drag = null; self.lift = null; self.overlay.innerHTML = ''; self.render(); } }

    // Mausrad zoomt; Zweifinger-Wischen am Touchpad (deltaX dabei) verschiebt,
    // Zusammenziehen am Touchpad kommt als ctrl+Rad und zoomt.
    function wheel(ev) {
      ev.preventDefault();
      const r = self.svg.getBoundingClientRect();
      if (!ev.ctrlKey && ev.deltaMode === 0 && ev.deltaX !== 0) {
        self.view.x -= ev.deltaX; self.view.y -= ev.deltaY; self.applyView();
        return;
      }
      const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : (ev.deltaMode ? 0.05 : 0.0015)));
      self.zoomAt(ev.clientX - r.left, ev.clientY - r.top, f);
    }

    this.svg.addEventListener('pointerdown', down);
    this.svg.addEventListener('pointermove', move);
    this.svg.addEventListener('pointerup', up);
    this.svg.addEventListener('pointercancel', cancel);
    this.svg.addEventListener('wheel', wheel, { passive: false });
    this.svg.addEventListener('dblclick', ev => ev.preventDefault());
    this.destroy = () => {
      this.svg.removeEventListener('pointerdown', down);
      this.svg.removeEventListener('pointermove', move);
      this.svg.removeEventListener('pointerup', up);
      this.svg.removeEventListener('pointercancel', cancel);
      this.svg.removeEventListener('wheel', wheel);
      host.innerHTML = '';
    };
  }

  Canvas.prototype.node = function (id) { return this.doc.nodes.find(n => n.id === id) || null; };
  Canvas.prototype.edge = function (id) { return this.doc.edges.find(e => e.id === id) || null; };
  Canvas.prototype.nodeAt = function (x, y, except) {
    for (let i = this.doc.nodes.length - 1; i >= 0; i--) {
      const n = this.doc.nodes[i];
      if (n.id === except) continue;
      const b = box(n);
      if (x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6) return n;
    }
    return null;
  };
  Canvas.prototype.subtree = function (id) {
    const out = [], seen = new Set();
    const go = nid => {
      if (seen.has(nid)) return; seen.add(nid);
      const n = this.node(nid); if (!n) return;
      if (n.type === 'center' && nid !== id) return;     // ein anderes Thema bleibt stehen
      out.push(n);
      for (const e of this.doc.edges) if (e.type === 'branch' && e.a === nid) go(e.b);
    };
    go(id);
    return out;
  };
  Canvas.prototype.setDoc = function (doc, keepView) {
    this.doc = doc;
    this.sel = null; this.multi = null;
    this.render();
    if (!keepView) this.fit();
  };
  Canvas.prototype.select = function (sel, silent) {
    this.sel = sel;
    this.multi = null;
    this.render();
    if (!silent || sel) this.onSelect(sel);
  };
  // Alles, was gerade gewählt ist (eine oder mehrere ids).
  Canvas.prototype.selSet = function () {
    const s = new Set(this.multi || []);
    if (this.sel) s.add(this.sel.id);
    return s;
  };
  Canvas.prototype.kindOf = function (id) { return this.node(id) ? 'node' : 'edge'; };
  // Mehrere wählen: ids (Knoten und Verbindungen gemischt).
  Canvas.prototype.selectMany = function (ids) {
    const s = new Set(ids.filter(id => this.node(id) || this.edge(id)));
    if (s.size <= 1) return this.select(s.size ? { kind: this.kindOf([...s][0]), id: [...s][0] } : null);
    this.multi = s;
    const last = [...s][s.size - 1];
    this.sel = { kind: this.kindOf(last), id: last };
    this.render();
    this.onSelect(this.sel);
  };
  // Strg+Klick: id zur Auswahl dazu bzw. wieder heraus.
  Canvas.prototype.toggle = function (id) {
    const s = this.selSet();
    if (s.has(id)) s.delete(id); else s.add(id);
    const list = [...s];
    if (s.has(id)) { list.splice(list.indexOf(id), 1); list.push(id); }   // zuletzt angetippt = vorne
    this.selectMany(list);
  };
  Canvas.prototype.applyView = function () {
    const v = this.view;
    this.world.setAttribute('transform', `translate(${v.x.toFixed(1)} ${v.y.toFixed(1)}) scale(${v.k.toFixed(4)})`);
    this.host.style.setProperty('--dg-k', v.k);
    // Zwei Ebenen beim Papier: Punkte wandern mit, das Korn bleibt fein.
    this.host.style.backgroundSize = `${22 * v.k}px ${22 * v.k}px, 160px 160px`;
    this.host.style.backgroundPosition = `${v.x}px ${v.y}px, 0 0`;
    if (this.onView) this.onView();
  };
  Canvas.prototype.zoomAt = function (sx, sy, f) {
    const v = this.view;
    const k = clamp(v.k * f, 0.2, 3);
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    v.k = k; v.x = sx - wx * k; v.y = sy - wy * k;
    this.applyView();
  };
  Canvas.prototype.zoom = function (f) {
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, f);
  };
  Canvas.prototype.fit = function () {
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) { requestAnimationFrame(() => { if (this.svg.isConnected) this.fit(); }); return; }
    const b = bounds(this.doc);
    const pad = 40;
    const k = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), 0.25, 1.15);
    this.view.k = k;
    this.view.x = r.width / 2 - (b.x + b.w / 2) * k;
    this.view.y = r.height / 2 - (b.y + b.h / 2) * k;
    this.applyView();
  };
  // Knoten ins Bild holen, falls er (teilweise) draußen liegt.
  Canvas.prototype.reveal = function (n) {
    const r = this.svg.getBoundingClientRect();
    if (!r.width) return;
    const b = box(n), v = this.view, m = 56;   // Platz für die Anfasser
    const x0 = v.x + b.x * v.k, x1 = v.x + (b.x + b.w) * v.k;
    const y0 = v.y + b.y * v.k, y1 = v.y + (b.y + b.h) * v.k;
    let dx = 0, dy = 0;
    if (x0 < m) dx = m - x0; else if (x1 > r.width - m) dx = Math.max(r.width - m - x1, m - x0);
    if (y0 < m) dy = m - y0; else if (y1 > r.height - 90) dy = Math.max(r.height - 90 - y1, m - y0);
    if (dx || dy) { v.x += dx; v.y += dy; this.applyView(); }
  };
  Canvas.prototype.center = function (x, y) {
    const r = this.svg.getBoundingClientRect();
    this.view.x = r.width / 2 - x * this.view.k;
    this.view.y = r.height / 2 - y * this.view.k;
    this.applyView();
  };
  Canvas.prototype.render = function () {
    const st = { selSet: this.selSet(), lift: this.lift, ends: {} };
    this.host.classList.toggle('k-uml', isUml(this.doc.kind));
    this.host.classList.toggle('k-paper', !isUml(this.doc.kind));
    let s = docSVG(this.doc, st);
    // Gewählte Verbindung: Andockpunkte an beiden Enden zum Verschieben.
    if (!this.readonly && !this.multi && this.sel && this.sel.kind === 'edge' && st.ends[this.sel.id]) {
      const { p1, p2 } = st.ends[this.sel.id];
      s += [['a', p1], ['b', p2]].map(([w, p]) =>
        `<g class="dg-end" data-end="${w}" data-edge="${this.sel.id}"><circle cx="${p.x}" cy="${p.y}" r="14" class="dg-handle-hit"/>`
        + `<circle cx="${p.x}" cy="${p.y}" r="6" class="dg-end-dot"/></g>`).join('');
    }
    // Anfasser am gewählten Knoten: vier Punkte zum Verbinden.
    if (!this.readonly && !this.multi && this.sel && this.sel.kind === 'node') {
      const n = this.node(this.sel.id);
      if (n) {
        const b = box(n);
        const H = [['r', b.x + b.w + 20, n.y], ['l', b.x - 20, n.y], ['b', n.x, b.y + b.h + 20], ['t', n.x, b.y - 20]];
        s += H.map(([dir, x, y]) =>
          `<g class="dg-handle" data-handle="${n.id}" data-dir="${dir}"><circle cx="${x}" cy="${y}" r="16" class="dg-handle-hit"/>`
          + `<circle cx="${x}" cy="${y}" r="10" class="dg-handle-dot"/><path d="M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}" class="dg-handle-plus"/></g>`).join('');
      }
    }
    this.content.innerHTML = s;
  };

  /* Export: das Diagramm als eigenständiges SVG (für PNG und Datei). */
  // clear = ohne weißen Hintergrund (PNG-Download: durchsichtig)
  function exportSVG(doc, scale, clear) {
    const b = bounds(doc);
    const pad = 30;
    const w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
    let body = docSVG(doc, {});
    for (const [k, v] of Object.entries(VARS_EXPORT)) body = body.split(`var(${k})`).join(v);
    return {
      w: w * (scale || 1), h: h * (scale || 1),
      svg: `<svg xmlns="${NS}" width="${w * (scale || 1)}" height="${h * (scale || 1)}" viewBox="${b.x - pad} ${b.y - pad} ${w} ${h}">`
         + `${fontCSS ? `<style>${fontCSS}</style>` : ''}${DEFS}`
         + (clear ? '' : `<rect x="${b.x - pad}" y="${b.y - pad}" width="${w}" height="${h}" fill="#fff"/>`) + `${body}</svg>`
    };
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* Ein als <img> gezeichnetes SVG kennt die Webschriften der Seite
     nicht. Für den Export werden sie deshalb einmal geholt und als
     data:-Adressen hineingeschrieben (nur latin, Outfit/Inter/JetBrains
     Mono, je eine variable Datei) — sonst stünde im Bild eine
     Ersatzschrift, die nicht in die gemessenen Kästen passt. */
  const FONT_CSS_URL = (() => {
    try { return new URL('../../../fonts/outfit-inter-jetbrainsmono-985fda.css', document.currentScript.src).href; }
    catch (e) { return null; }
  })();
  let fontCSS = '', fontLoading = null;
  function loadExportFonts() {
    if (fontCSS || !FONT_CSS_URL) return Promise.resolve();
    if (fontLoading) return fontLoading;
    fontLoading = (async () => {
      const css = await (await fetch(FONT_CSS_URL)).text();
      const blocks = css.split('/* latin */').slice(1).map(x => x.slice(0, x.indexOf('}') + 1));
      const seen = {};
      let out = '';
      for (const bl of blocks) {
        const fam = (bl.match(/font-family:\s*'([^']+)'/) || [])[1];
        const url = (bl.match(/url\(([^)]+)\)/) || [])[1];
        if (!fam || !url) continue;
        if (!seen[url]) {
          const buf = await (await fetch(new URL(url, FONT_CSS_URL))).arrayBuffer();
          let bin = ''; const u8 = new Uint8Array(buf);
          for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          seen[url] = 'data:font/woff2;base64,' + btoa(bin);
        }
        const wt = (bl.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
        out += `@font-face{font-family:'${fam}';font-weight:${wt};src:url(${seen[url]}) format('woff2');}`;
      }
      fontCSS = out;
    })().catch(e => { console.warn('[diagramm] Schriften für den Export:', e.message); });
    return fontLoading;
  }

  // Datei → Speichern: das Diagramm als JSON-Datei, die „Öffnen" wieder liest.
  function saveFile(doc, title) {
    const data = { app: 'mpskills-diagramm', v: 1, title: title || '', doc: clean(doc) };
    download(fileName(title || KINDS[doc.kind].label) + '.diagramm.json',
      new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  }

  async function exportPNG(doc, name) {
    await loadExportFonts();
    return new Promise(resolve => {
      const { svg, w, h } = exportSVG(doc, 2, true);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        c.toBlob(bl => { if (bl) download(name + '.png', bl); resolve(!!bl); }, 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
      img.src = url;
    });
  }

  const fileName = s => (String(s || '').trim() || 'Diagramm').replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);

  // Was gespeichert wird: ohne die Messwerte (_m, _heads).
  function clean(doc) {
    return {
      v: 1, kind: doc.kind,
      ...(doc.ortho && isUml(doc.kind) ? { ortho: true } : {}),
      nodes: doc.nodes.map(n => {
        const o = {};
        for (const k of Object.keys(n)) if (k[0] !== '_' && n[k] !== '' && n[k] != null) o[k] = n[k];
        return o;
      }),
      edges: doc.edges.map(e => {
        const o = {};
        for (const k of Object.keys(e)) if (k[0] !== '_' && e[k] !== '' && e[k] != null) o[k] = e[k];
        return o;
      })
    };
  }

  // Was vom Server kommt, nur so weit glauben, wie es gebraucht wird.
  // ids landen in data-Attributen der Lehrkraft-Ansicht — nur einfache
  // Zeichen, sonst könnte ein selbstgebautes Diagramm dort HTML einschleusen.
  const ID_OK = /^[A-Za-z0-9_-]{1,40}$/;
  function sane(doc, kind) {
    const k = KIND_IDS.includes(kind) ? kind : (doc && KIND_IDS.includes(doc.kind) ? doc.kind : 'mindmap');
    const d = { v: 1, kind: k, nodes: [], edges: [] };
    if (!doc || typeof doc !== 'object') return emptyDoc(k);
    if (doc.ortho === true && isUml(k)) d.ortho = true;
    // [u, v] auf dem Rand (-1…1) bzw. [dx, dy] Verschiebung (±LAB_MAX), sonst weg
    const pair = (v, lim) => Array.isArray(v) && v.length === 2 && v.every(x => Number.isFinite(Number(x)))
      ? v.map(x => Math.round(clamp(Number(x), -lim, lim) * 100) / 100) : undefined;
    const ids = new Set();
    for (const n of Array.isArray(doc.nodes) ? doc.nodes : []) {
      if (!n || typeof n.id !== 'string' || !ID_OK.test(n.id) || ids.has(n.id)) continue;
      ids.add(n.id);
      d.nodes.push({
        id: n.id, type: ['center', 'topic', 'box', 'class', 'object', 'note'].includes(n.type) ? n.type : 'topic',
        x: Number(n.x) || 0, y: Number(n.y) || 0, t: String(n.t || '').slice(0, 400),
        c: clamp(Number(n.c) || 0, 0, COLORS.length - 1),
        a: n.a ? String(n.a).slice(0, 2000) : undefined, o: n.o ? String(n.o).slice(0, 2000) : undefined,
        k: n.k ? String(n.k).slice(0, 80) : undefined
      });
    }
    for (const e of Array.isArray(doc.edges) ? doc.edges : []) {
      if (!e || !ids.has(e.a) || !ids.has(e.b)) continue;
      d.edges.push({
        id: ID_OK.test(String(e.id || '')) ? String(e.id) : uid(), a: e.a, b: e.b,
        type: EDGE_LABEL[e.type] ? e.type : 'line',
        f: e.type === 'effect' ? (['k', 'g', 'r'].includes(e.f) ? e.f : (e.s === '-' ? 'r' : 'k')) : undefined,
        l: e.l ? String(e.l).slice(0, 80) : undefined,
        m1: e.m1 ? String(e.m1).slice(0, 12) : undefined, m2: e.m2 ? String(e.m2).slice(0, 12) : undefined,
        pa: pair(e.pa, 1), pb: pair(e.pb, 1),
        lo: pair(e.lo, LAB_MAX), o1: pair(e.o1, LAB_MAX), o2: pair(e.o2, LAB_MAX)
      });
    }
    return d;
  }

  /* ════════════════════════════════════════════════════════════
     5  Editor
     ════════════════════════════════════════════════════════════
     Werkzeugleiste oben, Zeichenfläche, Auswahl-Leiste unten (nur
     wenn etwas gewählt ist), Text-Overlay über dem Knoten.        */
  const ICON = {
    undo:  '<svg viewBox="0 0 24 24"><path d="M9 7H4V2M4 7a9 9 0 1 1-1 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    redo:  '<svg viewBox="0 0 24 24"><path d="M15 7h5V2M20 7a9 9 0 1 0 1 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fit:   '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus:  '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    pen:   '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    img:   '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tidy:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 12h3M6 12h3M18 7h3M18 17h3M3 7h3M3 17h3M18 7v10M6 7v10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    // Linienführung: schräg (direkt) bzw. rechtwinklig — als Bild statt Wort
    slant: '<svg viewBox="0 0 24 24"><path d="M4 19L19 5M11 5h8v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ortho: '<svg viewBox="0 0 24 24"><path d="M4 4h8v13h8M16.5 13.5l3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy:  '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    paste: '<svg viewBox="0 0 24 24"><path d="M9 4h6v3H9zM15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    cut:   '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 16L19 4M16 16L5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    eye:   '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    file:  '<svg viewBox="0 0 24 24"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    down:  '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    open:  '<svg viewBox="0 0 24 24"><path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    pic:   '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    inbox: '<svg viewBox="0 0 24 24"><path d="M12 3v10M8 9l4 4 4-4M4 14h4l1 3h6l1-3h4v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    swap:  '<svg viewBox="0 0 24 24"><path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  const HELP = {
    common: [
      ['Antippen', 'wählt einen Baustein oder eine Verbindung aus.'],
      ['Doppelt tippen', 'auf einen Baustein: Text schreiben. Auf die leere Fläche: neuer Baustein.'],
      ['Ziehen', 'verschiebt einen Baustein. Die leere Fläche ziehen verschiebt das Blatt.'],
      ['Blaue Punkte', 'am gewählten Baustein: antippen = neuer Baustein daneben, auf einen anderen Baustein ziehen = verbinden.'],
      ['Verbindung', 'antippen: an den Punkten an beiden Enden lässt sich verschieben, wo sie am Baustein andockt. Beschriftungen lassen sich ein Stück verschieben.'],
      ['Strg + Klick', 'wählt mehrere aus. Strg+C kopieren, Strg+X ausschneiden, Strg+V einfügen, Strg+A alles.'],
      ['Textfenster', 'lässt sich am Griff oben verschieben, falls es im Weg ist.'],
      ['Zwei Finger', 'zoomen. Am Rechner: Mausrad.']
    ],
    mindmap: [['Thema', 'legt ein weiteres Thema an – eine Mindmap kann mehrere haben.'],
              ['Tastatur', 'Tab = neuer Ast, Enter = Nachbar-Ast, Entf = löschen.'], ['Ordnen', 'räumt die Mindmap auf.']],
    wirkung: [['Pfeilfarbe', 'Pfeil antippen und unten schwarz, grün oder rot wählen. Der nächste Pfeil bekommt dieselbe Farbe.'],
              ['Beschriftung', 'Pfeil antippen und unten in das Feld über dem Pfeil schreiben.']],
    klasse:  [['Klasse', 'doppelt tippen: Name, Attribute (z. B. - name: String) und Methoden (z. B. + fahren(): void) eintragen, je Zeile eins.'],
              ['Beziehung', 'eine Verbindung antippen und unten die Art wählen: Assoziation, Vererbung, Aggregation …'],
              ['Linien', 'oben zwischen schräg und rechtwinklig umschalten.']],
    objekt:  [['Objekt', 'doppelt tippen: Objektname, Klasse und Attributwerte (z. B. farbe = "rot") eintragen.'],
              ['Linien', 'oben zwischen schräg und rechtwinklig umschalten.']]
  };

  /* Zwischenablage für Strg+C/X/V: gilt für alle Editoren der Seite
     (auch zwischen „Mein Diagramm" und einem neuen), aber nur für
     dieselbe Diagrammart. */
  let CLIP = null;     // { kind, data: JSON von clean(), n: wie oft eingefügt }

  function Editor(host, opts) {
    const self = this;
    const o = opts || {};
    this.o = o;
    this.kindLocked = o.kindLocked || null;
    this.undo = []; this.redo = [];
    this.title = '';
    this.edgeType = {};
    this.editPin = null;      // selbst verschobenes Textfenster: { x, y } in der Bühne

    host.innerHTML = `
      <div class="dg-ed">
        <div class="dg-bar">
          <div class="dg-bar-l">
            <div class="dg-file">
              <button type="button" class="dg-filebtn" data-act="file" aria-haspopup="menu" aria-expanded="false">${ICON.file}<span>Datei</span>${ICON.down}</button>
              <div class="dg-menu" data-k="menu" role="menu" hidden></div>
            </div>
            <span class="dg-kind" data-k="kind"></span>
            <input class="dg-title" data-k="title" maxlength="80" placeholder="Titel" aria-label="Titel des Diagramms"/>
          </div>
          <div class="dg-bar-m" data-k="adds"></div>
          <div class="dg-bar-r" data-k="share"></div>
        </div>
        <div class="dg-stage">
          <div class="dg-paper" data-k="paper"></div>
          <div class="dg-status" data-k="status" aria-live="polite"></div>
          <div class="dg-help" data-k="help" hidden></div>
          <div class="dg-edit" data-k="edit" hidden></div>
          <div class="dg-ctx" data-k="ctx" hidden></div>
          <div class="dg-tools" role="toolbar" aria-label="Ansicht">
            <button type="button" class="dg-tb" data-act="undo" title="Rückgängig (Strg+Z)">${ICON.undo}</button>
            <button type="button" class="dg-tb" data-act="redo" title="Wiederholen (Strg+Y)">${ICON.redo}</button>
            <span class="dg-tsep"></span>
            <button type="button" class="dg-tb" data-act="zout" title="Verkleinern">${ICON.minus}</button>
            <button type="button" class="dg-tb" data-act="fit" title="Alles zeigen">${ICON.fit}</button>
            <button type="button" class="dg-tb" data-act="zin" title="Vergrößern">${ICON.plus}</button>
            <span class="dg-tsep"></span>
            <button type="button" class="dg-tb" data-act="help" title="Wie geht das?">${ICON.help}</button>
          </div>
        </div>
        <input type="file" data-k="fileinp" accept=".json,application/json" hidden/>
      </div>`;
    this.host = host;
    const $ = k => host.querySelector(`[data-k="${k}"]`);
    this.$ = $;
    this.cv = new Canvas($('paper'), {
      onChange: () => this.changed(),
      onBefore: () => this.snap(),
      onSelect: sel => this.showCtx(sel),
      onEdit: req => this.handleEdit(req)
    });
    this.cv.onView = () => { if (this.editing) this.placeEdit(); };

    this.onClick = ev => {
      const b = ev.target.closest('[data-act]');
      if (!b || !host.contains(b)) return;
      this.act(b.dataset.act, b);
    };
    this.onInput = ev => {
      const t = ev.target;
      if (t.matches('[data-k="title"]')) { this.title = t.value; this.changed(true); }
      if (t.matches('[data-ef]')) this.ctxInput(t);
    };
    this.onKey = ev => this.key(ev);
    // Datei-Menü schließt bei einem Tipp daneben
    this.onDocDown = ev => { if (!ev.target.closest || !ev.target.closest('.dg-file')) this.menu(false); };
    document.addEventListener('pointerdown', this.onDocDown);
    $('fileinp').addEventListener('change', ev => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (f) this.readFile(f); });
    host.addEventListener('click', this.onClick);
    host.addEventListener('input', this.onInput);
    document.addEventListener('keydown', this.onKey);
    this.ro = new ResizeObserver(() => { if (this.cv.svg.isConnected && !this._fitted) { this._fitted = true; this.cv.fit(); } });
    this.ro.observe($('paper'));
  }

  Editor.prototype.destroy = function () {
    this.host.removeEventListener('click', this.onClick);
    this.host.removeEventListener('input', this.onInput);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('pointerdown', this.onDocDown);
    this.ro.disconnect();
    this.cv.destroy();
  };

  /* ── Datei-Menü ─────────────────────────────────────────── */
  Editor.prototype.menu = function (on) {
    const m = this.$('menu'), b = this.host.querySelector('[data-act="file"]');
    const show = on == null ? m.hidden : on;
    if (!show) { if (!m.hidden) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } return; }
    const it = (act, icon, label) => `<button type="button" role="menuitem" class="dg-mi" data-act="${act}">${icon}<span><b>${label}</b></span></button>`;
    m.innerHTML = (this.o.onNew ? it('f-new', ICON.plus, 'Neu') : '')
      + it('f-open', ICON.open, 'Öffnen …')
      + it('f-save', ICON.img, 'Speichern')
      + it('png', ICON.pic, 'Als Bild (PNG)')
      + (this.o.teacherAvail && this.o.teacherAvail() ? '<span class="dg-msep"></span>' + it('f-teacher', ICON.inbox, 'Diagramm der Lehrkraft') : '');
    m.hidden = false;
    b.setAttribute('aria-expanded', 'true');
  };
  // Datei → Öffnen: eine mit „Speichern" geladene Datei (oder nur das doc)
  Editor.prototype.readFile = function (f) {
    const bad = () => this.o.toast && this.o.toast('Das ist keine Diagramm-Datei.', true);
    if (f.size > 1000000) return bad();
    const r = new FileReader();
    r.onload = () => {
      let j;
      try { j = JSON.parse(String(r.result)); } catch (e) { return bad(); }
      const doc = j && j.doc ? j.doc : j;
      if (!doc || !KIND_IDS.includes(doc.kind) || !Array.isArray(doc.nodes)) return bad();
      const title = String((j && j.title) || f.name.replace(/\.(diagramm\.)?json$/i, '') || '').slice(0, 80);
      const d = sane(doc, doc.kind);
      if (this.o.onOpen) this.o.onOpen(d, title);
      else { this.snap(); this.load(d, title); this.changed(); }
    };
    r.onerror = bad;
    r.readAsText(f);
  };
  // Rechts oben: Teilen-Knöpfe der Rolle (Tablet bzw. Lehrkraft)
  Editor.prototype.setShare = function (html) { this.$('share').innerHTML = html || ''; };

  Editor.prototype.load = function (doc, title) {
    this.cv.setDoc(doc);
    this._fitted = false;
    this.title = title || '';
    this.undo = []; this.redo = [];
    this.closeEdit(false);
    this.$('title').value = this.title;
    this.paintBar();
    this.showCtx(null);
  };

  Editor.prototype.paintBar = function () {
    const k = KINDS[this.cv.doc.kind];
    this.$('kind').innerHTML = `<span aria-hidden="true">${k.icon}</span> ${esc(k.label)}`;
    this.$('kind').title = k.hint;
    let adds = k.add.map(a => `<button type="button" class="dg-add" data-act="add" data-type="${a.type}">${ICON.plus}<span>${esc(a.label)}</span></button>`).join('');
    if (this.cv.doc.kind === 'mindmap') adds += `<button type="button" class="dg-add dg-add--soft" data-act="tidy" title="Mindmap aufräumen">${ICON.tidy}<span>Ordnen</span></button>`;
    if (isUml(this.cv.doc.kind)) {
      const on = !!this.cv.doc.ortho;
      // Zwei Bilder nebeneinander, das gewählte ist gefüllt
      adds += `<div class="dg-lines" role="radiogroup" aria-label="Linien">`
        + `<button type="button" class="dg-lb${on ? '' : ' is-on'}" data-act="ortho" data-v="0" role="radio" aria-checked="${!on}" title="Linien schräg (direkt)">${ICON.slant}</button>`
        + `<button type="button" class="dg-lb${on ? ' is-on' : ''}" data-act="ortho" data-v="1" role="radio" aria-checked="${on}" title="Linien rechtwinklig (wie in SQL Studio)">${ICON.ortho}</button>`
        + `</div>`;
    }
    if (CLIP && CLIP.kind === this.cv.doc.kind) adds += `<button type="button" class="dg-add dg-add--soft" data-act="paste" title="Einfügen (Strg+V)">${ICON.paste}<span>Einfügen</span></button>`;
    this.$('adds').innerHTML = adds;
    this.paintUndo();
  };
  Editor.prototype.paintUndo = function () {
    const u = this.host.querySelector('[data-act="undo"]'), r = this.host.querySelector('[data-act="redo"]');
    if (u) u.disabled = !this.undo.length;
    if (r) r.disabled = !this.redo.length;
  };

  Editor.prototype.snap = function () {
    this.undo.push(JSON.stringify(clean(this.cv.doc)));
    if (this.undo.length > 80) this.undo.shift();
    this.redo = [];
    this.paintUndo();
  };
  Editor.prototype.changed = function () {
    if (this.o.onChange) this.o.onChange();
  };
  Editor.prototype.restore = function (from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(clean(this.cv.doc)));
    const d = JSON.parse(from.pop());
    this.cv.doc = sane(d, d.kind);
    this.cv.sel = null; this.cv.multi = null;
    this.cv.render();
    this.showCtx(null);
    this.paintBar();
    this.changed();
  };

  Editor.prototype.status = function (txt, cls) {
    const s = this.$('status');
    s.textContent = txt || '';
    s.className = 'dg-status' + (cls ? ' is-' + cls : '');
  };

  /* ── Neue Bausteine ───────────────────────────────────────── */
  Editor.prototype.newNode = function (type, x, y, from) {
    const doc = this.cv.doc;
    const n = { id: uid(), type, x: Math.round(x), y: Math.round(y), t: '', c: 0 };
    if (type === 'class') { n.t = ''; n.a = ''; n.o = ''; n.c = 0; }
    if (type === 'object') { n.c = 0; }
    if (type === 'box') { n.c = 0; }
    if (type === 'center') {
      // weiteres Thema: eine Farbe, die noch kein Thema hat
      const used = doc.nodes.filter(x => x.type === 'center').map(x => x.c || 0);
      n.c = [0, 1, 2, 3, 4, 5, 6, 7].find(c => !used.includes(c)) ?? 0;
    }
    if (type === 'topic' && from) {
      // Farbe vom Ast; Kinder der Mitte bekommen jede ihre eigene.
      if (from.type === 'center') {
        const used = doc.edges.filter(e => e.a === from.id).map(e => (this.cv.node(e.b) || {}).c);
        n.c = [1, 2, 3, 4, 5, 6, 0].find(c => !used.includes(c)) ?? (used.length % 7);
      } else n.c = from.c || 0;
    } else if (type === 'topic') n.c = 1;
    doc.nodes.push(n);
    return n;
  };

  Editor.prototype.newEdge = function (a, b) {
    const doc = this.cv.doc;
    const A = this.cv.node(a), B = this.cv.node(b);
    if (!A || !B || a === b) return null;
    if (doc.edges.some(e => e.a === a && e.b === b)) return null;
    const k = KINDS[doc.kind];
    let type = this.edgeType[doc.kind] || k.edge;
    if (A.type === 'note' || B.type === 'note') type = 'line';
    // Zu einem anderen Thema führt kein Ast (das bliebe sonst an dessen Baum hängen), nur eine Linie.
    if (doc.kind === 'mindmap' && type === 'branch' && B.type === 'center') type = 'line';
    const e = { id: uid(), a, b, type };
    if (type === 'effect') e.f = this.arrowCol || 'k';   // Farbe wie beim letzten Pfeil
    doc.edges.push(e);
    return e;
  };

  // Platz neben einem Knoten, der noch frei ist.
  Editor.prototype.freeSpot = function (from, dir) {
    const b = box(from);
    const step = { r: [1, 0], l: [-1, 0], b: [0, 1], t: [0, -1] }[dir] || [1, 0];
    const gapX = this.cv.doc.kind === 'klasse' || this.cv.doc.kind === 'objekt' ? 120 : 80;
    let x = from.x + step[0] * (b.w / 2 + gapX + 60);
    let y = from.y + step[1] * (b.h / 2 + 70 + 20);
    // Mindmap: Kinder rechts untereinander stapeln
    if (this.cv.doc.kind === 'mindmap' && step[1] === 0) {
      const sibs = this.cv.doc.edges.filter(e => e.a === from.id).map(e => this.cv.node(e.b)).filter(n => n && Math.sign(n.x - from.x) === step[0]);
      if (sibs.length) y = Math.max(...sibs.map(s => s.y + box(s).h / 2)) + 34;
    }
    for (let i = 0; i < 12 && this.cv.nodeAt(x, y); i++) {
      if (step[0]) y += 60; else x += 140;
    }
    return { x, y };
  };

  Editor.prototype.handleEdit = function (req) {
    const doc = this.cv.doc;
    const k = KINDS[doc.kind];
    if (req.create) {
      this.snap();
      const n = this.newNode(k.node, req.x, req.y);
      this.cv.select({ kind: 'node', id: n.id }, true);
      this.changed();
      this.openEdit(n.id);
      return;
    }
    if (req.link) {
      const from = this.cv.node(req.from);
      if (!from) return;
      if (req.to) {
        this.snap();
        const e = this.newEdge(req.from, req.to);
        if (!e) { this.undo.pop(); this.paintUndo(); return; }
        this.cv.select({ kind: 'edge', id: e.id });
        this.changed();
        return;
      }
      this.snap();
      const type = from.type === 'note' ? 'note' : (doc.kind === 'mindmap' ? 'topic' : k.node);
      const p = req.dir ? this.freeSpot(from, req.dir) : { x: req.x, y: req.y };
      const n = this.newNode(type, p.x, p.y, from);
      this.newEdge(from.id, n.id);
      this.cv.select({ kind: 'node', id: n.id }, true);
      this.changed();
      this.openEdit(n.id);
      return;
    }
    if (req.id) this.openEdit(req.id);
  };

  Editor.prototype.act = function (a, btn) {
    const cv = this.cv;
    if (a === 'undo') return this.restore(this.undo, this.redo);
    if (a === 'redo') return this.restore(this.redo, this.undo);
    if (a === 'zin') return cv.zoom(1.25);
    if (a === 'zout') return cv.zoom(0.8);
    if (a === 'fit') return cv.fit();
    if (a === 'file') return this.menu();
    if (a === 'png') {
      this.menu(false);
      this.closeEdit(true);
      return exportPNG(clean(cv.doc), fileName(this.title || KINDS[cv.doc.kind].label));
    }
    if (a === 'f-new') { this.menu(false); return this.o.onNew && this.o.onNew(); }
    if (a === 'f-open') { this.menu(false); return this.$('fileinp').click(); }
    if (a === 'f-save') { this.menu(false); this.closeEdit(true); return saveFile(cv.doc, this.title); }
    if (a === 'f-teacher') { this.menu(false); return this.o.onTeacher && this.o.onTeacher(); }
    if (a === 'help') return this.toggleHelp();
    if (a === 'add') {
      this.closeEdit(true);
      this.snap();
      const r = cv.svg.getBoundingClientRect();
      const c = cv.toWorld(r.left + r.width / 2, r.top + r.height / 2);
      let x = c.x, y = c.y;
      for (let i = 0; i < 20 && cv.nodeAt(x, y); i++) { x += 30; y += 30; }
      const sel = cv.sel && cv.sel.kind === 'node' ? cv.node(cv.sel.id) : null;
      const type = btn.dataset.type;
      // Mindmap: „Ast" hängt sich an den gewählten Knoten (oder an ein Thema).
      if (type === 'topic' && cv.doc.kind === 'mindmap') {
        const par = (sel && sel.type !== 'note') ? sel : cv.doc.nodes.find(n => n.type === 'center');
        if (par) {
          const p = this.freeSpot(par, par.type === 'center' ? (cv.doc.edges.filter(e => e.a === par.id).length % 2 ? 'l' : 'r') : this.side(par));
          const n = this.newNode('topic', p.x, p.y, par);
          this.newEdge(par.id, n.id);
          cv.select({ kind: 'node', id: n.id }, true);
          this.changed();
          return this.openEdit(n.id);
        }
      }
      if (type === 'center' && cv.doc.nodes.length) {
        // weiteres Thema: unter alles, was schon da ist
        const b = bounds(cv.doc);
        const first = cv.doc.nodes.find(n => n.type === 'center');
        x = first ? first.x : b.x + b.w / 2; y = b.y + b.h + 80;
      }
      const n = this.newNode(type, x, y);
      cv.select({ kind: 'node', id: n.id }, true);
      if (type === 'center') cv.reveal(n);
      this.changed();
      return this.openEdit(n.id);
    }
    if (a === 'tidy') {
      this.snap();
      layoutMindmap(cv.doc);
      cv.render(); cv.fit();
      return this.changed();
    }
    if (a === 'del') return this.remove();
    if (a === 'copy') return this.copy();
    if (a === 'cut') return this.copy() && this.remove();
    if (a === 'paste') return this.paste();
    if (a === 'ortho') {
      const want = btn.dataset.v === '1';
      if (want === !!cv.doc.ortho) return;
      this.snap();
      if (want) cv.doc.ortho = true; else delete cv.doc.ortho;
      cv.render(); this.paintBar();
      return this.changed();
    }
    if (a === 'eredo') {
      // Andockpunkte und verschobene Beschriftungen wieder von selbst
      const e = cv.sel && cv.edge(cv.sel.id);
      if (!e) return;
      this.snap();
      ['pa', 'pb', 'lo', 'o1', 'o2'].forEach(k => { delete e[k]; });
      cv.render(); this.showCtx(cv.sel);
      return this.changed();
    }
    if (a === 'edit') return cv.sel && this.openEdit(cv.sel.id);
    if (a === 'color') {
      const nodes = [...cv.selSet()].map(id => cv.node(id)).filter(x => x && x.type !== 'note');
      if (!nodes.length) return;
      this.snap();
      const c = Number(btn.dataset.c);
      // Mindmap: der ganze Ast nimmt die Farbe mit.
      for (const n of nodes) {
        const group = cv.doc.kind === 'mindmap' && n.type === 'topic' ? cv.subtree(n.id).filter(x => x.type === 'topic') : [n];
        group.forEach(x => { x.c = c; });
      }
      cv.render(); this.showCtx(cv.sel);
      return this.changed();
    }
    if (a === 'etype') {
      const e = cv.sel && cv.edge(cv.sel.id);
      if (!e) return;
      this.snap();
      e.type = btn.dataset.t;
      if (e.type === 'effect' && !e.f) e.f = 'k';
      this.edgeType[cv.doc.kind] = e.type;      // die nächste Verbindung wird genauso
      cv.render(); this.showCtx(cv.sel);
      return this.changed();
    }
    if (a === 'acol') {
      const e = cv.sel && cv.edge(cv.sel.id);
      if (!e) return;
      this.snap();
      e.f = btn.dataset.f;
      this.arrowCol = e.f;
      cv.render(); this.showCtx(cv.sel);
      return this.changed();
    }
    if (a === 'flip') {
      const e = cv.sel && cv.edge(cv.sel.id);
      if (!e) return;
      this.snap();
      [e.a, e.b] = [e.b, e.a];
      [e.m1, e.m2] = [e.m2, e.m1];
      cv.render(); this.showCtx(cv.sel);
      return this.changed();
    }
    if (a === 'helpx') return this.toggleHelp(false);
    if (a === 'editok') return this.closeEdit(true);
  };

  Editor.prototype.remove = function () {
    const cv = this.cv;
    const ids = cv.selSet();
    if (!ids.size) return;
    // Das letzte Thema der Mindmap bleibt stehen.
    const centers = cv.doc.nodes.filter(n => n.type === 'center');
    if (centers.length && centers.every(n => ids.has(n.id))) {
      ids.delete(centers[0].id);
      this.o.toast && this.o.toast('Ein Thema bleibt stehen.');
      if (!ids.size) return;
    }
    this.snap();
    cv.doc.nodes = cv.doc.nodes.filter(x => !ids.has(x.id));
    cv.doc.edges = cv.doc.edges.filter(e => !ids.has(e.id) && !ids.has(e.a) && !ids.has(e.b));
    cv.select(null);
    this.changed();
    return true;
  };

  /* ── Kopieren, Ausschneiden, Einfügen ─────────────────────── */
  Editor.prototype.copy = function () {
    const cv = this.cv;
    const ids = cv.selSet();
    const nodes = cv.doc.nodes.filter(n => ids.has(n.id));
    if (!nodes.length) return false;
    const have = new Set(nodes.map(n => n.id));
    // Verbindungen zwischen den kopierten Bausteinen kommen mit.
    const edges = cv.doc.edges.filter(e => have.has(e.a) && have.has(e.b));
    CLIP = { kind: cv.doc.kind, data: JSON.stringify(clean({ kind: cv.doc.kind, nodes, edges })), n: 0 };
    this.paintBar();
    return true;
  };
  Editor.prototype.paste = function () {
    const cv = this.cv;
    if (!CLIP) return;
    if (CLIP.kind !== cv.doc.kind) { this.o.toast && this.o.toast('Das passt nicht in diese Diagrammart.'); return; }
    this.closeEdit(true);
    const src = sane(JSON.parse(CLIP.data), CLIP.kind);
    CLIP.n++;
    const off = 30 * CLIP.n;
    const map = {};
    this.snap();
    for (const n of src.nodes) {
      const id = uid(); map[n.id] = id;
      cv.doc.nodes.push(Object.assign({}, n, { id, x: n.x + off, y: n.y + off }));
    }
    for (const e of src.edges) cv.doc.edges.push(Object.assign({}, e, { id: uid(), a: map[e.a], b: map[e.b] }));
    cv.selectMany(Object.values(map));
    this.changed();
  };

  // Mindmap: Auf welcher Seite seines Themas steht ein Ast? Dorthin wachsen seine Kinder.
  Editor.prototype.side = function (n) {
    const cv = this.cv;
    let cur = n;
    for (let i = 0; i < 60 && cur && cur.type !== 'center'; i++) {
      const pe = cv.doc.edges.find(e => e.type === 'branch' && e.b === cur.id);
      cur = pe ? cv.node(pe.a) : null;
    }
    const root = cur || cv.doc.nodes.find(x => x.type === 'center');
    return n.x < (root ? root.x : 0) ? 'l' : 'r';
  };

  Editor.prototype.key = function (ev) {
    if (!this.host.isConnected || this.host.offsetParent === null) return;
    const t = ev.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const mod = ev.ctrlKey || ev.metaKey;
    if (typing) {
      if (ev.key === 'Escape' && this.editing) { ev.preventDefault(); this.closeEdit(true); }
      return;
    }
    // Nur, wenn der Editor sichtbar ist und nichts anderes den Fokus hat.
    if (t && t !== document.body && !this.host.contains(t)) return;
    const cv = this.cv;
    const k = (ev.key || '').toLowerCase();
    if (mod && k === 'c') { if (this.copy()) ev.preventDefault(); return; }
    if (mod && k === 'x') { if (this.copy()) { ev.preventDefault(); this.remove(); } return; }
    if (mod && k === 'v') { if (CLIP) { ev.preventDefault(); this.paste(); } return; }
    if (mod && k === 'a') { ev.preventDefault(); return cv.selectMany(cv.doc.nodes.map(n => n.id)); }
    if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); return ev.shiftKey ? this.restore(this.redo, this.undo) : this.restore(this.undo, this.redo); }
    if (mod && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); return this.restore(this.redo, this.undo); }
    if (!cv.sel) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); return this.remove(); }
    if (ev.key === 'Escape') return cv.select(null);
    if (cv.sel.kind !== 'node' || cv.multi) return;
    const n = cv.node(cv.sel.id);
    if (!n) return;
    if (ev.key === 'F2' || (ev.key === 'Enter' && cv.doc.kind !== 'mindmap')) { ev.preventDefault(); return this.openEdit(n.id); }
    if (cv.doc.kind === 'mindmap' && (ev.key === 'Tab' || ev.key === 'Enter')) {
      ev.preventDefault();
      let par = n;
      if (ev.key === 'Enter') {
        const pe = cv.doc.edges.find(e => e.type === 'branch' && e.b === n.id);
        par = pe ? cv.node(pe.a) : null;
        if (!par) return this.openEdit(n.id);
      }
      const dir = par.type === 'center' ? (n.x < par.x && ev.key === 'Enter' ? 'l' : 'r') : this.side(par);
      this.handleEdit({ link: true, from: par.id, dir });
    }
  };

  /* ── Auswahl-Leiste ───────────────────────────────────────── */
  Editor.prototype.showCtx = function (sel) {
    const box_ = this.$('ctx');
    if (this.editing && (!sel || sel.id !== this.editing || this.cv.multi)) this.closeEdit(true);
    if (!sel) { box_.hidden = true; box_.innerHTML = ''; return; }
    const cv = this.cv;
    let h = '';
    if (cv.multi) {
      // Mehrere gewählt (Strg+Klick): Farbe für alle, kopieren, löschen
      const ids = cv.selSet();
      const nodes = [...ids].map(id => cv.node(id)).filter(Boolean);
      h += `<span class="dg-cnum">${ids.size} ausgewählt</span>`;
      if (nodes.some(n => n.type !== 'note')) {
        const cur = nodes.find(n => n.type !== 'note').c || 0;
        h += '<span class="dg-csep"></span><div class="dg-colors" role="group" aria-label="Farbe">'
          + COLORS.map(([f, s], i) => `<button type="button" class="dg-col${cur === i && nodes.every(n => n.type === 'note' || (n.c || 0) === i) ? ' is-on' : ''}" data-act="color" data-c="${i}" title="${COLOR_NAMES[i]}" style="--f:${f};--s:${s}"></button>`).join('')
          + '</div>';
      }
      if (nodes.length) h += `<span class="dg-csep"></span><button type="button" class="dg-cb" data-act="copy" title="Kopieren (Strg+C)">${ICON.copy}</button>`
        + `<button type="button" class="dg-cb" data-act="cut" title="Ausschneiden (Strg+X)">${ICON.cut}</button>`;
      h += `<span class="dg-csep"></span><button type="button" class="dg-cb dg-cb--del" data-act="del" title="Löschen (Entf)">${ICON.trash}</button>`;
    } else if (sel.kind === 'node') {
      const n = cv.node(sel.id);
      if (!n) { box_.hidden = true; return; }
      h += `<button type="button" class="dg-cb dg-cb--main" data-act="edit">${ICON.pen}<span>Text</span></button>`;
      if (n.type !== 'note') {
        h += '<span class="dg-csep"></span><div class="dg-colors" role="group" aria-label="Farbe">'
          + COLORS.map(([f, s], i) => `<button type="button" class="dg-col${(n.c || 0) === i ? ' is-on' : ''}" data-act="color" data-c="${i}" title="${COLOR_NAMES[i]}" style="--f:${f};--s:${s}"></button>`).join('')
          + '</div>';
      }
      h += `<span class="dg-csep"></span><button type="button" class="dg-cb" data-act="copy" title="Kopieren (Strg+C)">${ICON.copy}</button>`;
      const lastCenter = n.type === 'center' && cv.doc.nodes.filter(x => x.type === 'center').length < 2;
      if (!lastCenter) h += `<button type="button" class="dg-cb dg-cb--del" data-act="del" title="Löschen (Entf)">${ICON.trash}</button>`;
    } else {
      const e = cv.edge(sel.id);
      if (!e) { box_.hidden = true; return; }
      const kinds = KINDS[cv.doc.kind].edges;
      if (cv.doc.kind === 'wirkung' && e.type === 'effect') {
        h += '<div class="dg-acols" role="group" aria-label="Pfeilfarbe">'
          + ['k', 'g', 'r'].map(f => `<button type="button" class="dg-ac dg-ac--${f}${(e.f || 'k') === f ? ' is-on' : ''}" data-act="acol" data-f="${f}">`
            + `<svg viewBox="0 0 24 12"><path d="M2 6H20M15 2l5 4-5 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${ARROW_NAME[f]}</span></button>`).join('')
          + '</div><span class="dg-csep"></span>';
      }
      if (kinds.length > 1) {
        h += '<div class="dg-etypes" role="group" aria-label="Art der Verbindung">'
          + kinds.map(t => `<button type="button" class="dg-et${e.type === t ? ' is-on' : ''}" data-act="etype" data-t="${t}" title="${esc(EDGE_HINT[t] || EDGE_LABEL[t])}"><svg viewBox="0 0 24 12">${EDGE_ICON[t]}</svg><span>${EDGE_LABEL[t]}</span></button>`).join('')
          + '</div><span class="dg-csep"></span>';
      }
      if (e.type !== 'branch' && e.type !== 'line' && e.type !== 'assoc' && e.type !== 'link') {
        h += `<button type="button" class="dg-cb" data-act="flip" title="Richtung umdrehen">${ICON.swap}<span>umdrehen</span></button>`;
      }
      if (['pa', 'pb', 'lo', 'o1', 'o2'].some(k => e[k])) {
        h += `<button type="button" class="dg-cb" data-act="eredo" title="Andockpunkte und Beschriftung wieder von selbst setzen">${ICON.reset}<span>zurücksetzen</span></button>`;
      }
      h += `<span class="dg-csep"></span><button type="button" class="dg-cb dg-cb--del" data-act="del" title="Löschen (Entf)">${ICON.trash}</button>`;
      if (e.type !== 'branch') h += edgeForm(e, cv);
    }
    box_.innerHTML = h;
    box_.hidden = false;
  };

  /* Die Verbindung als kleine Skizze, immer von links (Anfang) nach
     rechts (Ende), mit den Namen der beiden Bausteine. Die Felder
     stehen dort, wo ihr Text später am Pfeil steht: Beschriftung über
     der Mitte, Anzahlen (UML) an den beiden Enden. */
  const PV_END = {
    effect: '<path d="M1 1L13 6 1 11Z" fill="currentColor"/>', arrow: '<path d="M1 1L13 6 1 11Z" fill="currentColor"/>',
    directed: '<path d="M1 1L13 6 1 11" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    dep: '<path d="M1 1L13 6 1 11" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    inherit: '<path d="M1 1L13 6 1 11Z" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/>'
  };
  const PV_START = {
    aggr: '<path d="M1 6L7 1.5 13 6 7 10.5Z" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/>',
    comp: '<path d="M1 6L7 1.5 13 6 7 10.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.6"/>'
  };
  function edgeForm(e, cv) {
    const name = id => {
      const n = cv.node(id);
      const t = n ? (n.type === 'object' && n.k ? (n.t || '') + ' : ' + n.k : (n.t || '').split('\n')[0]) : '';
      return t.trim() || '…';
    };
    const mult = cv.doc.kind === 'klasse' && ['assoc', 'directed', 'aggr', 'comp'].includes(e.type);
    const ph = { effect: 'z. B. fördert', inherit: '', assoc: 'z. B. besitzt', directed: 'z. B. kennt',
                 aggr: 'z. B. hat', comp: 'z. B. besteht aus', link: 'z. B. fährt', dep: 'z. B. benutzt' }[e.type] || 'Beschriftung';
    const svg = (m, cls) => m ? `<svg class="${cls}" viewBox="0 0 14 12">${m}</svg>` : '';
    return `<div class="dg-epv">
        <span class="dg-epv-n" title="Anfang">${esc(name(e.a))}</span>
        <div class="dg-epv-mid">
          <div class="dg-epv-row">
            ${mult ? `<input class="dg-ein dg-ein--m" data-ef="m1" maxlength="12" placeholder="1" title="Anzahl am Anfang" value="${esc(e.m1 || '')}"/>` : '<span></span>'}
            <input class="dg-ein dg-ein--l" data-ef="l" maxlength="80" placeholder="${esc(ph)}" title="Beschriftung" value="${esc(e.l || '')}"/>
            ${mult ? `<input class="dg-ein dg-ein--m" data-ef="m2" maxlength="12" placeholder="0..*" title="Anzahl am Ende" value="${esc(e.m2 || '')}"/>` : '<span></span>'}
          </div>
          <div class="dg-epv-line${e.type === 'dep' ? ' is-dash' : ''}"${e.type === 'effect' && e.f && e.f !== 'k' ? ` style="color:${ARROW[e.f]}"` : ''}>
            ${svg(PV_START[e.type], 'dg-epv-h')}<i></i>${svg(PV_END[e.type], 'dg-epv-h')}
          </div>
        </div>
        <span class="dg-epv-n" title="Ende">${esc(name(e.b))}</span>
      </div>`;
  }

  let ctxSnapT = 0;
  Editor.prototype.ctxInput = function (inp) {
    const cv = this.cv;
    const e = cv.sel && cv.sel.kind === 'edge' && cv.edge(cv.sel.id);
    if (!e) return;
    // Ein Schnappschuss je Tipp-Strecke, nicht je Buchstabe.
    if (Date.now() - ctxSnapT > 1500) this.snap();
    ctxSnapT = Date.now();
    e[inp.dataset.ef] = inp.value.slice(0, Number(inp.maxLength) || 80);
    cv.render();
    this.changed();
  };

  /* ── Text bearbeiten ──────────────────────────────────────── */
  Editor.prototype.openEdit = function (id) {
    const n = this.cv.node(id);
    if (!n) return;
    if (this.editing && this.editing !== id) this.closeEdit(true);
    this.editing = id;
    this.editSnap = JSON.stringify(clean(this.cv.doc));
    const ed = this.$('edit');
    const f = (key, label, ph, multi, rows) => multi
      ? `<label class="dg-ef"><span>${label}</span><textarea data-f="${key}" rows="${rows || 3}" placeholder="${esc(ph)}" spellcheck="false">${esc(n[key] || '')}</textarea></label>`
      : `<label class="dg-ef"><span>${label}</span><input data-f="${key}" placeholder="${esc(ph)}" value="${esc(n[key] || '')}" spellcheck="false"/></label>`;
    let h;
    if (n.type === 'class') {
      h = f('t', 'Klassenname', 'Auto') + f('a', 'Attribute (je Zeile eins)', '- marke: String\n- kmStand: int', true, 3)
        + f('o', 'Methoden (je Zeile eine)', '+ fahren(km: int): void', true, 3);
    } else if (n.type === 'object') {
      h = f('t', 'Objektname', 'meinAuto') + f('k', 'Klasse', 'Auto')
        + f('a', 'Attributwerte (je Zeile eins)', 'marke = "VW"\nkmStand = 12000', true, 3);
    } else {
      h = `<textarea class="dg-etext" data-f="t" rows="2" placeholder="Text …" spellcheck="true">${esc(n.t || '')}</textarea>`;
    }
    ed.innerHTML = `<div class="dg-edit-in${n.type === 'class' || n.type === 'object' ? ' is-form' : ''}">
      <div class="dg-grip" data-grip title="Fenster verschieben (doppelt tippen: wieder an den Baustein)" aria-hidden="true"><i></i></div>${h}
      <button type="button" class="dg-ok" data-act="editok">Fertig</button></div>`;
    ed.hidden = false;
    // Das Fenster lässt sich am Griff frei verschieben; der Platz gilt,
    // bis der Griff doppelt angetippt wird (dann wieder am Baustein).
    ed.onpointerdown = ev => {
      if (!ev.target.closest('[data-grip]')) return;
      ev.preventDefault();
      const r0 = { x: parseFloat(ed.style.left) || 0, y: parseFloat(ed.style.top) || 0, cx: ev.clientX, cy: ev.clientY };
      const now = Date.now();
      if (now - (this._gripTap || 0) < 380) { this.editPin = null; this._gripTap = 0; this.placeEdit(); return; }
      this._gripTap = now;
      const mv = e2 => {
        this.editPin = { x: r0.x + e2.clientX - r0.cx, y: r0.y + e2.clientY - r0.cy };
        this.placeEdit();
      };
      const upf = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upf); window.removeEventListener('pointercancel', upf); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', upf);
      window.addEventListener('pointercancel', upf);
    };
    ed.oninput = ev => {
      const el = ev.target.closest('[data-f]');
      if (!el) return;
      // Mindmap-Ast wächst vom Elternteil weg, nicht in ihn hinein:
      // die Kante zum Elternteil bleibt stehen.
      const pe = n.type === 'topic' && this.cv.doc.edges.find(e => e.type === 'branch' && e.b === n.id);
      const par = pe && this.cv.node(pe.a);
      const before = box(n);
      n[el.dataset.f] = el.value.slice(0, el.dataset.f === 't' ? 400 : 2000);
      measure(n);
      if (par) {
        const after = box(n);
        n.x = Math.round(n.x < par.x ? before.x + before.w - after.w / 2 : before.x + after.w / 2);
      }
      this.cv.render();
      this.cv.reveal(n);
      this.placeEdit();
      this.changed();
    };
    ed.onkeydown = ev => {
      if (ev.key === 'Enter' && !ev.shiftKey && ev.target.matches('.dg-etext, input')) {
        ev.preventDefault();
        if (ev.target.matches('input')) {
          const all = [...ed.querySelectorAll('[data-f]')];
          const nx = all[all.indexOf(ev.target) + 1];
          if (nx) { nx.focus(); return; }
        }
        this.closeEdit(true);
      } else if (ev.key === 'Tab' && ev.target.matches('.dg-etext') && this.cv.doc.kind === 'mindmap') {
        ev.preventDefault();
        this.closeEdit(true);
        this.handleEdit({ link: true, from: id, dir: n.type === 'center' ? 'r' : this.side(n) });
      }
    };
    this.cv.reveal(n);
    this.placeEdit();
    const first = ed.querySelector('[data-f]');
    if (first) { first.focus(); try { first.setSelectionRange(first.value.length, first.value.length); } catch (e) { /* egal */ } if (n.t === '' || n.t == null) { /* leer */ } else first.select(); }
  };

  Editor.prototype.placeEdit = function () {
    const n = this.editing && this.cv.node(this.editing);
    const ed = this.$('edit');
    if (!n) return;
    const b = box(n), v = this.cv.view;
    const stage = this.host.querySelector('.dg-stage').getBoundingClientRect();
    const inner = ed.firstElementChild;
    const w = inner ? inner.offsetWidth : 260, h = inner ? inner.offsetHeight : 80;
    if (this.editPin) {
      const px = clamp(this.editPin.x, 0, Math.max(0, stage.width - w)), py = clamp(this.editPin.y, 0, Math.max(0, stage.height - h));
      ed.style.left = px + 'px'; ed.style.top = py + 'px';
      return;
    }
    let x = v.x + (b.x + b.w / 2) * v.k - w / 2;
    let y = v.y + (b.y + b.h) * v.k + 10;
    if (y + h > stage.height - 8) y = v.y + b.y * v.k - h - 10;
    ed.style.left = clamp(x, 8, Math.max(8, stage.width - w - 8)) + 'px';
    ed.style.top = clamp(y, 8, Math.max(8, stage.height - h - 8)) + 'px';
  };

  Editor.prototype.closeEdit = function (keep) {
    if (!this.editing) return;
    const ed = this.$('edit');
    const before = this.editSnap;
    this.editing = null;
    ed.hidden = true; ed.innerHTML = ''; ed.oninput = null; ed.onkeydown = null; ed.onpointerdown = null;
    if (keep && before && before !== JSON.stringify(clean(this.cv.doc))) {
      this.undo.push(before);
      if (this.undo.length > 80) this.undo.shift();
      this.redo = [];
      this.paintUndo();
    }
  };

  Editor.prototype.toggleHelp = function (on) {
    const h = this.$('help');
    const show = on == null ? h.hidden : on;
    if (!show) { h.hidden = true; return; }
    const rows = HELP.common.concat(HELP[this.cv.doc.kind] || []);
    h.innerHTML = `<div class="dg-help-h"><b>So geht's</b><button type="button" class="dg-x" data-act="helpx" aria-label="Schließen">✕</button></div>`
      + '<dl>' + rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('') + '</dl>';
    h.hidden = false;
  };

  /* ════════════════════════════════════════════════════════════
     Startseite: Diagrammart wählen
     ════════════════════════════════════════════════════════════ */
  // Kleine Vorschaubilder je Art (aus echten Mini-Diagrammen gezeichnet).
  const SAMPLES = {
    mindmap: { kind: 'mindmap', nodes: [
      { id: 'c', type: 'center', x: 0, y: 0, t: 'Wald', c: 1 },
      { id: 'a', type: 'topic', x: 170, y: -50, t: 'Tiere', c: 2 }, { id: 'b', type: 'topic', x: 170, y: 40, t: 'Pflanzen', c: 1 },
      { id: 'd', type: 'topic', x: -170, y: -30, t: 'Boden', c: 5 }, { id: 'e', type: 'topic', x: -170, y: 50, t: 'Klima', c: 0 }],
      edges: [{ id: '1', a: 'c', b: 'a', type: 'branch' }, { id: '2', a: 'c', b: 'b', type: 'branch' }, { id: '3', a: 'c', b: 'd', type: 'branch' }, { id: '4', a: 'c', b: 'e', type: 'branch' }] },
    wirkung: { kind: 'wirkung', nodes: [
      { id: 'a', type: 'box', x: -140, y: -60, t: 'Hasen', c: 1 }, { id: 'b', type: 'box', x: 140, y: -60, t: 'Füchse', c: 5 },
      { id: 'c', type: 'box', x: 0, y: 80, t: 'Gras', c: 1 }],
      edges: [{ id: '1', a: 'a', b: 'b', type: 'effect', f: 'g' }, { id: '2', a: 'b', b: 'a', type: 'effect', f: 'r' }, { id: '3', a: 'c', b: 'a', type: 'effect', f: 'g', l: 'Nahrung' }, { id: '4', a: 'a', b: 'c', type: 'effect', f: 'r' }] },
    klasse: { kind: 'klasse', nodes: [
      { id: 'a', type: 'class', x: -120, y: 0, t: 'Fahrzeug', a: '- marke: String', o: '+ fahren(): void', c: 0 },
      { id: 'b', type: 'class', x: 140, y: -60, t: 'Auto', a: '- türen: int', o: '', c: 0 },
      { id: 'c', type: 'class', x: 140, y: 70, t: 'Fahrrad', a: '- gänge: int', o: '', c: 0 }],
      edges: [{ id: '1', a: 'b', b: 'a', type: 'inherit' }, { id: '2', a: 'c', b: 'a', type: 'inherit' }] },
    objekt: { kind: 'objekt', nodes: [
      { id: 'a', type: 'object', x: -130, y: 0, t: 'meinAuto', k: 'Auto', a: 'marke = "VW"\ntüren = 5', c: 0 },
      { id: 'b', type: 'object', x: 140, y: 0, t: 'mia', k: 'Person', a: 'alter = 16', c: 0 }],
      edges: [{ id: '1', a: 'b', b: 'a', type: 'link', l: 'fährt' }] }
  };
  function thumb(kind) {
    const d = sane(SAMPLES[kind], kind);
    const { svg } = exportSVG(d, 1);
    return svg.replace(/width="[^"]+" height="[^"]+"/, 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
              .replace(/<rect[^>]*fill="#fff"\/>/, '');
  }

  function pickHTML(note) {
    return `<div class="dg-pick">
      <h3>Was möchtest du zeichnen?</h3>
      ${note ? `<p class="dg-pick-note">${note}</p>` : ''}
      <div class="dg-pick-t" data-k="tpick"></div>
      <div class="dg-pick-grid">
        ${KIND_IDS.map(k => `<button type="button" class="dg-pcard" data-pick="${k}">
          <span class="dg-pthumb ${isUml(k) ? 'k-uml' : 'k-paper'}">${thumb(k)}</span>
          <b>${KINDS[k].icon} ${esc(KINDS[k].label)}</b><span>${esc(KINDS[k].hint)}</span></button>`).join('')}
      </div></div>`;
  }

  /* ════════════════════════════════════════════════════════════
     6  Rollen
     ════════════════════════════════════════════════════════════ */
  let root = null, ctx = null, view = null;
  let mode = null;          // 'participant' | 'presenter'
  let demo = false;

  // Tablet
  let ed = null, kind = null, loaded = false, saveT = null, saving = false, dirty = false, lastErr = '';
  let pShared = false, pAsk = null, tInfo = null, pollMT = null;   // Teilen (0260)
  // Lehrkraft
  let tab = 'class', classList = [], picked = [], panes = {}, pollT = null, listHidden = false, ownKey = null;
  let tShare = null;        // eigenes, an die Klasse gegebenes Diagramm: { rev, title, kind } | null
  let onVis = null;
  let modalOpen = false;

  /* Kleines Fenster mitten über dem Skill: Frage + Knöpfe → Promise mit
     dem Wert des gedrückten Knopfs (null = abgebrochen). sticky: kein
     Schließen durch Tipp daneben oder Esc. */
  function modal(o) {
    return new Promise(res => {
      const host = root && root.querySelector('.dg');
      if (!host) return res(null);
      modalOpen = true;
      const el = document.createElement('div');
      el.className = 'dg-modal-back';
      el.innerHTML = `<div class="dg-modal" role="dialog" aria-modal="true" aria-labelledby="dgMt">
          ${o.icon ? `<span class="dg-modal-ic">${o.icon}</span>` : ''}
          <h3 id="dgMt">${esc(o.title)}</h3>
          ${o.text ? `<p>${esc(o.text)}</p>` : ''}${o.html || ''}
          <div class="dg-modal-btns${o.stack ? ' is-stack' : ''}">${o.buttons.map(b =>
            `<button type="button" class="dg-mb${b.pri ? ' is-pri' : ''}" data-mv="${esc(b.v)}">${esc(b.label)}</button>`).join('')}</div>
        </div>`;
      host.appendChild(el);
      const done = v => { el.remove(); modalOpen = false; document.removeEventListener('keydown', key, true); res(v); };
      el.addEventListener('click', ev => {
        const b = ev.target.closest('[data-mv]');
        if (b) done(b.dataset.mv);
        else if (ev.target === el && !o.sticky) done(null);
      });
      const key = ev => { if (ev.key === 'Escape' && !o.sticky) { ev.stopPropagation(); done(null); } };
      document.addEventListener('keydown', key, true);
      const pri = el.querySelector('.dg-mb.is-pri') || el.querySelector('.dg-mb');
      if (pri) setTimeout(() => pri.focus(), 30);
    });
  }
  const askYes = (title, text, yes) => modal({ title, text, buttons: [{ v: 'no', label: 'Abbrechen' }, { v: 'yes', label: yes, pri: true }] }).then(v => v === 'yes');
  // Leer = nichts Eigenes drin (frische Mindmap mit „Thema" zählt als leer)
  const isEmptyDoc = d => !d || !d.nodes.length || (d.nodes.length === 1 && !d.edges.length && d.nodes[0].type === 'center' && (!d.nodes[0].t || d.nodes[0].t === 'Thema'));
  const roomCode = () => (view && view.room && view.room.code) || 'x';

  const settingsKind = () => {
    const k = view && view.room && view.room.settings && view.room.settings.kind;
    return KIND_IDS.includes(k) ? k : null;
  };
  const toast = (m, err) => ctx && ctx.toast && ctx.toast(m, err);
  const errText = c => (ctx && ctx.errText) ? ctx.errText(c) : c;

  /* ── Tablet ─────────────────────────────────────────────────── */
  function participantMount() {
    root.innerHTML = '<div class="dg"><div class="dg-main"><p class="dg-boot">Diagramm wird geladen …</p></div></div>';
    (async () => {
      const r = await ctx.actions.call('dg_mine_get', {});
      if (!root) return;
      if (!r || !r.ok) {
        root.querySelector('.dg-main').innerHTML = `<div class="dg-msg">${esc(errText(r && r.error))}</div>`;
        return;
      }
      loaded = true;
      pShared = !!r.shared; pAsk = r.ask || null;
      if (r.doc && r.kind) startEditor(sane(r.doc, r.kind), r.title || '');
      else {
        const fixed = settingsKind();
        if (fixed) startEditor(emptyDoc(fixed), '');
        else showPick();
      }
      pollMine();
    })();
  }

  /* ── Tablet: Teilen mit der Lehrkraft (0260) ──────────────────
     dg_mine_poll alle 5 s: geteilt?, Anfrage der Lehrkraft?, hat sie
     ein Diagramm an die Klasse gegeben (nur Kopfdaten)? */
  async function pollMine() {
    clearTimeout(pollMT); pollMT = null;
    if (!root || mode !== 'participant') return;
    if (!document.hidden && !demo) {
      const r = await ctx.actions.call('dg_mine_poll', {});
      if (!root) return;
      if (r && r.ok) {
        const was = pShared;
        pShared = !!r.shared; pAsk = r.ask || null; tInfo = r.teacher || null;
        if (was !== pShared) paintShare();
        paintPickTeacher();
        if (!modalOpen) {
          if (pAsk === 'open') askModal();
          else if (tInfo && String(tInfo.rev) !== String(jget('dg.tseen.' + roomCode(), ''))) teacherModal(true);
        }
      }
    }
    if (root) pollMT = setTimeout(pollMine, 5000);
  }

  function paintShare() {
    if (!ed) return;
    if (mode === 'participant') {
      ed.setShare(pShared
        ? `<span class="dg-chip is-on" title="Deine Lehrkraft kann dein Diagramm ansehen">${ICON.eye}<span>Lehrkraft sieht mit</span></span>`
          + `<button type="button" class="dg-sbtn dg-sbtn--soft" data-sact="unshare">Teilen beenden</button>`
        : `<button type="button" class="dg-sbtn" data-sact="share" title="Deine Lehrkraft darf dein Diagramm ansehen">${ICON.share}<span>Mit Lehrkraft teilen</span></button>`);
    } else {
      ed.setShare(tShare
        ? `<span class="dg-chip is-on" title="„${esc(tShare.title || 'Diagramm')}“ ist an die Klasse gegeben">${ICON.share}<span>Mit Klasse geteilt</span></span>`
          + `<button type="button" class="dg-sbtn dg-sbtn--soft" data-sact="tupdate" title="Den jetzigen Stand noch einmal an die Klasse geben">Neu geben</button>`
          + `<button type="button" class="dg-sbtn dg-sbtn--soft" data-sact="tunshare">Zurücknehmen</button>`
        : `<button type="button" class="dg-sbtn" data-sact="tshare" title="Die Klasse bekommt dein Diagramm als Kopie zum Weiterarbeiten">${ICON.share}<span>Mit Klasse teilen</span></button>`);
    }
  }

  // Erst speichern (die Zeile muss es geben), dann teilen.
  async function ensureSaved() {
    if (demo) return true;
    dirty = true;
    for (let i = 0; i < 30 && saving; i++) await new Promise(r => setTimeout(r, 100));
    await saveNow();
    return !dirty;
  }

  async function shareMine(on) {
    if (on) {
      if (!await ensureSaved()) { toast('Erst muss gespeichert werden – gleich noch einmal versuchen.', true); return; }
    } else if (!await askYes('Teilen beenden?', 'Deine Lehrkraft sieht dein Diagramm dann nicht mehr. Du kannst es später wieder teilen.', 'Teilen beenden')) return;
    const r = demo ? { ok: true } : await ctx.actions.call('dg_mine_share', { p_on: on });
    if (!r || !r.ok) { toast(errText(r && r.error), true); return; }
    pShared = on; pAsk = null;
    paintShare();
    toast(on ? 'Deine Lehrkraft kann dein Diagramm jetzt ansehen.' : 'Teilen beendet.');
  }

  async function askModal() {
    const v = await modal({
      sticky: true, icon: ICON.eye,
      title: 'Deine Lehrkraft fragt',
      text: 'Darf deine Lehrkraft sich dein Diagramm ansehen? Sie sieht dann mit, was du zeichnest, bis du das Teilen beendest.',
      buttons: [{ v: 'no', label: 'Nein, lieber nicht' }, { v: 'yes', label: 'Ja, teilen', pri: true }]
    });
    if (!root) return;
    if (v === 'yes' && !await ensureSaved()) { toast('Erst muss gespeichert werden – gleich noch einmal versuchen.', true); return; }
    const r = await ctx.actions.call('dg_mine_answer', { p_yes: v === 'yes' });
    if (r && r.ok) { pShared = !!r.shared; pAsk = v === 'yes' ? null : 'declined'; paintShare(); }
  }

  /* Die Lehrkraft hat ein Diagramm an die Klasse gegeben. auto = vom
     Poll aufgerufen (einmal je rev, gemerkt in dg.tseen.<code>);
     sonst aus Datei → „Diagramm der Lehrkraft". */
  async function teacherModal(auto) {
    if (!tInfo) return;
    jset('dg.tseen.' + roomCode(), String(tInfo.rev));
    const own = ed && !isEmptyDoc(ed.cv.doc);
    const what = `„${tInfo.title || 'Ohne Titel'}“ (${KINDS[tInfo.kind] ? KINDS[tInfo.kind].label : 'Diagramm'})`;
    const v = await modal({
      icon: ICON.inbox, stack: own,
      title: 'Deine Lehrkraft hat ein Diagramm geteilt',
      text: own
        ? `${what}. Du kannst es als eigene Kopie öffnen – dein jetziges Diagramm wird dabei ersetzt. Lade es vorher herunter, wenn du es behalten willst.`
        : `${what}. Du bekommst eine eigene Kopie zum Weiterarbeiten.`,
      html: auto ? '<p class="dg-modal-k">Später findest du es unter Datei → Diagramm der Lehrkraft.</p>' : '',
      buttons: own
        ? [{ v: 'keep', label: 'Meins herunterladen, dann öffnen', pri: true }, { v: 'drop', label: 'Meins verwerfen und öffnen' }, { v: 'later', label: 'An meinem weiterarbeiten' }]
        : [{ v: 'later', label: 'Später' }, { v: 'drop', label: 'Öffnen', pri: true }]
    });
    if (!root || (v !== 'keep' && v !== 'drop')) return;
    if (v === 'keep' && ed) saveFile(ed.cv.doc, ed.title);
    openTeacherDoc();
  }

  async function openTeacherDoc() {
    const r = await ctx.actions.call('dg_mine_teacher_get', {});
    if (!root) return;
    if (!r || !r.ok || !r.doc) { toast(r && r.error === 'not_found' ? 'Die Lehrkraft hat das Diagramm wieder zurückgenommen.' : errText(r && r.error), true); return; }
    startEditor(sane(r.doc, r.kind), r.title || '');
    dirty = true; saveSoon();
  }

  // Auf der Startseite (noch kein Diagramm): Knopf zum Diagramm der Lehrkraft
  function paintPickTeacher() {
    const slot = root && root.querySelector('[data-k="tpick"]');
    if (!slot) return;
    slot.innerHTML = tInfo && mode === 'participant'
      ? `<button type="button" class="dg-sbtn" data-topen>${ICON.inbox}<span>Diagramm der Lehrkraft öffnen: „${esc(tInfo.title || 'Ohne Titel')}“</span></button>` : '';
  }

  function showPick(note) {
    if (ed) { ed.destroy(); ed = null; }
    const main = root.querySelector('.dg-main');
    main.innerHTML = pickHTML(note);
    paintPickTeacher();
    main.onclick = ev => {
      if (ev.target.closest('[data-topen]')) { jset('dg.tseen.' + roomCode(), String(tInfo && tInfo.rev)); return openTeacherDoc(); }
      const b = ev.target.closest('[data-pick]');
      if (!b) return;
      main.onclick = null;
      startEditor(emptyDoc(b.dataset.pick), '');
      if (mode === 'participant') { dirty = true; saveSoon(); }
      else saveOwn();
    };
  }

  function startEditor(doc, title) {
    const main = root.querySelector('.dg-main');
    main.onclick = null;
    if (ed) ed.destroy();
    kind = doc.kind;
    ed = new Editor(main, {
      kindLocked: settingsKind(),
      toast,
      onNew: () => newDiagram(),
      onOpen: (d, t) => openDoc(d, t),
      teacherAvail: () => mode === 'participant' && !!tInfo,
      onTeacher: () => teacherModal(false),
      onChange: () => {
        if (mode === 'participant') { dirty = true; saveSoon(); }
        else saveOwn();
      }
    });
    ed.load(doc, title);
    // Mindmap neu: gleich den Text der Mitte schreiben lassen.
    if (doc.kind === 'mindmap' && doc.nodes.length === 1 && doc.nodes[0].t === 'Thema' && !demo) {
      ed.cv.select({ kind: 'node', id: doc.nodes[0].id }, true);
      setTimeout(() => ed && ed.openEdit(doc.nodes[0].id), 60);
    }
    main.onclick = ev => {
      const b = ev.target.closest('[data-sact]');
      if (!b) return;
      const a = b.dataset.sact;
      if (a === 'share') shareMine(true);
      else if (a === 'unshare') shareMine(false);
      else if (a === 'tshare' || a === 'tupdate') shareClass(a === 'tupdate');
      else if (a === 'tunshare') unshareClass();
    };
    paintShare();
    if (mode === 'participant') paintSave();
  }

  // Datei → Öffnen: ersetzt das jetzige Diagramm (nach Rückfrage)
  async function openDoc(d, title) {
    const fixed = mode === 'participant' ? settingsKind() : null;
    if (fixed && d.kind !== fixed) { toast(`In diesem Raum zeichnet ihr: ${KINDS[fixed].label}. Die Datei ist ein${d.kind === 'mindmap' ? 'e' : ''} ${KINDS[d.kind].label}.`, true); return; }
    if (ed && !isEmptyDoc(ed.cv.doc)
        && !await askYes('Datei öffnen?', 'Das jetzige Diagramm wird dabei ersetzt. Lade es vorher über Datei → Speichern herunter, wenn du es behalten willst.', 'Öffnen')) return;
    startEditor(d, title);
    if (mode === 'participant') { dirty = true; saveSoon(); } else saveOwn();
  }

  async function newDiagram() {
    if (ed && !isEmptyDoc(ed.cv.doc)
        && !await askYes('Neues Diagramm anfangen?', 'Das jetzige wird dabei gelöscht. Lade es vorher über Datei → Speichern herunter, wenn du es behalten willst.', 'Neu anfangen')) return;
    const fixed = mode === 'participant' ? settingsKind() : null;
    if (fixed) { startEditor(emptyDoc(fixed), ''); dirty = true; saveSoon(); }
    else showPick();
  }

  function saveSoon() {
    clearTimeout(saveT);
    paintSave();
    saveT = setTimeout(saveNow, 1500);
  }
  async function saveNow() {
    clearTimeout(saveT); saveT = null;
    if (!ed || !dirty || saving || demo) return;
    saving = true; dirty = false;
    paintSave();
    const r = await ctx.actions.call('dg_mine_put', {
      p_doc: clean(ed.cv.doc), p_title: ed.title || '', p_kind: ed.cv.doc.kind
    });
    saving = false;
    if (!r || !r.ok) {
      dirty = true;
      lastErr = r && r.error;
      if (lastErr === 'payload_too_big') toast('Das Diagramm ist zu groß zum Speichern. Lösche ein paar Bausteine.', true);
      // Netz weg: in 5 s noch einmal
      if (root && lastErr !== 'payload_too_big' && lastErr !== 'blocked' && lastErr !== 'removed') saveT = setTimeout(saveNow, 5000);
    } else lastErr = '';
    if (dirty && !saveT && root) saveT = setTimeout(saveNow, 1500);
    paintSave();
  }
  function paintSave() {
    if (!ed || mode !== 'participant') return;
    if (lastErr && dirty) ed.status(lastErr === 'network' ? 'Keine Verbindung – wird nachgeholt' : errText(lastErr), 'err');
    else if (dirty || saving) ed.status('speichert …', 'busy');
    else ed.status('gespeichert ✓', 'ok');
  }

  /* ── Lehrkraft ──────────────────────────────────────────────── */
  function presenterMount() {
    root.innerHTML = `<div class="dg dg--teacher">
      <div class="dg-tabs" role="tablist">
        <button type="button" class="dg-tab" data-tab="class" role="tab">Diagramme der Klasse <span class="dg-count" data-k="count"></span></button>
        <button type="button" class="dg-tab" data-tab="own" role="tab">Mein Diagramm</button>
        <span class="dg-tabs-r" data-k="tabsr"></span>
      </div>
      <div class="dg-pane-class" data-k="pclass">
        <aside class="dg-list" data-k="list"></aside>
        <section class="dg-compare" data-k="compare"></section>
      </div>
      <div class="dg-main" data-k="pown" hidden></div>
    </div>`;
    root.addEventListener('click', presenterClick);
    paintTabs();
    paintList();
    paintCompare();
    onVis = () => { if (!document.hidden) pollClass(); };
    document.addEventListener('visibilitychange', onVis);
    pollClass();
  }

  function paintTabs() {
    root.querySelectorAll('.dg-tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelector('[data-k="pclass"]').hidden = tab !== 'class';
    root.querySelector('[data-k="pown"]').hidden = tab !== 'own';
    root.querySelector('[data-k="tabsr"]').innerHTML = tab === 'class'
      ? `<button type="button" class="dg-ib dg-ib--txt" data-tact="togglelist">${listHidden ? 'Liste zeigen' : 'Liste ausblenden'}</button>`
      : '';
    root.querySelector('.dg-pane-class').classList.toggle('is-nolist', listHidden);
    if (tab === 'own' && !ed) openOwn();
    if (tab === 'class') requestAnimationFrame(() => Object.values(panes).forEach(p => p.cv && p.autofit && p.cv.fit()));
  }

  function openOwn() {
    // Der Reiter trägt selbst die Klasse .dg-main — startEditor/showPick finden ihn.
    const saved = demo ? null : jget(ownKey || 'dg.own', null);
    if (saved && saved.doc) startEditor(sane(saved.doc, saved.doc.kind), saved.title || '');
    else showPick('Dein eigenes Diagramm liegt auf diesem Gerät. Mit „Mit Klasse teilen“ bekommt die Klasse eine Kopie.');
  }

  /* ── Lehrkraft → Klasse (0260) ───────────────────────────────
     Ein Schnappschuss des eigenen Diagramms geht in dg_shared; die
     Tablets sehen es im Poll und öffnen es auf Wunsch als Kopie.
     Spätere Änderungen gehen erst mit „Neu geben" hinaus. */
  async function shareClass(again) {
    if (!ed) return;
    const ok = await askYes(again ? 'Jetzigen Stand neu geben?' : 'Mit der Klasse teilen?',
      again ? 'Die Klasse bekommt den jetzigen Stand noch einmal angeboten. Wer schon eine Kopie hat, wird gefragt, ob er sie ersetzen will.'
            : 'Alle in der Klasse bekommen dein Diagramm angeboten und können es als eigene Kopie weiterbearbeiten. Was du danach änderst, geht erst mit „Neu geben“ hinaus.',
      again ? 'Neu geben' : 'Teilen');
    if (!ok || !ed) return;
    const doc = clean(ed.cv.doc);
    const r = demo ? { ok: true, rev: (tShare ? tShare.rev : 0) + 1 }
      : await ctx.actions.call('dg_class_share', { p_doc: doc, p_title: ed.title || '', p_kind: doc.kind });
    if (!r || !r.ok) { toast(r && r.error === 'payload_too_big' ? 'Das Diagramm ist zu groß zum Teilen.' : errText(r && r.error), true); return; }
    tShare = { rev: r.rev, title: ed.title || '', kind: doc.kind };
    paintShare();
    toast(again ? 'Neuer Stand ist bei der Klasse.' : 'Die Klasse hat dein Diagramm bekommen.');
  }
  async function unshareClass() {
    if (!await askYes('Zurücknehmen?', 'Die Klasse bekommt dein Diagramm nicht mehr angeboten. Kopien, die schon geöffnet wurden, bleiben bei den Schülerinnen und Schülern.', 'Zurücknehmen')) return;
    const r = demo ? { ok: true } : await ctx.actions.call('dg_class_unshare', {});
    if (!r || !r.ok) { toast(errText(r && r.error), true); return; }
    tShare = null;
    paintShare();
  }

  // Ansehen anfragen: am Tablet erscheint die Frage, Ja = geteilt.
  async function askStudent(id) {
    const it = classList.find(x => x.participant === id);
    if (!it) return;
    const again = it.ask === 'declined';
    const ok = await askYes(again ? 'Noch einmal fragen?' : 'Ansehen anfragen?',
      `${it.person} bekommt auf dem Tablet die Frage, ob du das Diagramm ansehen darfst. Erst wenn ${it.person} zustimmt, siehst du es.`
        + (again ? ` Beim letzten Mal hat ${it.person} abgelehnt.` : ''), 'Anfragen');
    if (!ok) return;
    const r = demo ? demoAsk(id) : await ctx.actions.call('dg_class_ask', { p_participant: id });
    if (!r || !r.ok) { toast(r && r.error === 'too_fast' ? 'Gerade erst gefragt – bitte einen Moment warten.' : errText(r && r.error), true); return; }
    it.ask = r.shared ? null : 'open';
    paintList();
    if (r.shared) pollClass();
  }

  let ownT = null;
  function saveOwn() {
    if (demo || !ed) return;
    clearTimeout(ownT);
    ownT = setTimeout(() => { if (ed) jset(ownKey || 'dg.own', { doc: clean(ed.cv.doc), title: ed.title || '' }); }, 600);
  }

  const ago = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 15) return 'gerade eben';
    if (s < 60) return 'vor ' + Math.round(s) + ' s';
    if (s < 3600) return 'vor ' + Math.round(s / 60) + ' min';
    return 'vor ' + Math.round(s / 3600) + ' h';
  };

  function paintList() {
    const el = root && root.querySelector('[data-k="list"]');
    if (!el) return;
    const c = root.querySelector('[data-k="count"]');
    const nShared = classList.filter(x => x.shared).length;
    if (c) c.textContent = classList.length ? `(${nShared}/${classList.length})` : '';
    if (!classList.length) {
      el.innerHTML = `<p class="dg-list-empty">Noch keine Diagramme. Sobald die Klasse zeichnet, stehen sie hier.</p>`;
      return;
    }
    el.innerHTML = `<p class="dg-list-h">Geteilte antippen = vorne zeigen · bis zu zwei nebeneinander</p>`
      + classList.map(it => {
        if (!it.shared) {
          // Nicht geteilt: nur Name und Art, dazu Anfragen
          const st = it.ask === 'open' ? 'angefragt …' : it.ask === 'declined' ? 'abgelehnt' : 'nicht geteilt';
          return `<div class="dg-li is-locked">
            <span class="dg-li-k" title="${esc(KINDS[it.kind] ? KINDS[it.kind].label : '')}">${KINDS[it.kind] ? KINDS[it.kind].icon : ''}</span>
            <span class="dg-li-t"><b>${esc(it.person)}</b><small>${st}</small></span>
            ${it.ask === 'open' ? '<span class="dg-li-a">wartet</span>'
              : `<button type="button" class="dg-ask" data-ask="${esc(it.participant)}">${it.ask === 'declined' ? 'erneut fragen' : 'Ansehen anfragen'}</button>`}
          </div>`;
        }
        const i = picked.indexOf(it.participant);
        const live = Date.now() - new Date(it.updated_at).getTime() < 20000;
        return `<button type="button" class="dg-li${i >= 0 ? ' is-on' : ''}" data-pp="${esc(it.participant)}">
          ${i >= 0 ? `<span class="dg-li-n">${i + 1}</span>` : ''}
          <span class="dg-li-k" title="${esc(KINDS[it.kind] ? KINDS[it.kind].label : '')}">${KINDS[it.kind] ? KINDS[it.kind].icon : ''}</span>
          <span class="dg-li-t"><b>${esc(it.person)}</b><small>${esc(it.title || (KINDS[it.kind] ? KINDS[it.kind].label : ''))} · ${it.nodes} Bausteine</small></span>
          <span class="dg-li-a${live ? ' is-live' : ''}">${live ? '● zeichnet' : ago(it.updated_at)}</span>
        </button>`;
      }).join('');
  }

  function paintCompare() {
    const el = root && root.querySelector('[data-k="compare"]');
    if (!el) return;
    // Panes, die nicht mehr gewählt sind, abbauen
    for (const id of Object.keys(panes)) {
      if (!picked.includes(id)) { panes[id].cv && panes[id].cv.destroy(); delete panes[id]; }
    }
    if (!picked.length) {
      el.innerHTML = `<div class="dg-cmp-empty"><b>Diagramme vergleichen</b><p>Links ein geteiltes Diagramm antippen – es erscheint hier groß.
        Ein zweites antippen, und beide stehen nebeneinander. Was die Klasse weiterzeichnet, läuft vorne mit.</p>
        <p>Die Klasse entscheidet selbst, ob sie teilt. Bei nicht geteilten kannst du fragen („Ansehen anfragen“).</p></div>`;
      return;
    }
    el.classList.toggle('is-two', picked.length === 2);
    // Reihenfolge der Panes = Reihenfolge in picked; vorhandene wiederverwenden.
    const have = new Set([...el.querySelectorAll('.dg-cmp')].map(p => p.dataset.pp));
    if (picked.length !== have.size || picked.some(p => !have.has(p)) || el.querySelector('.dg-cmp-empty')) {
      el.innerHTML = picked.map((id, i) => `<div class="dg-cmp" data-pp="${esc(id)}">
          <div class="dg-cmp-h"><span class="dg-li-n">${i + 1}</span><b data-k="name"></b><small data-k="sub"></small>
            <span class="dg-cmp-tools">
              <button type="button" class="dg-ib" data-tact="zout" title="Verkleinern">${ICON.minus}</button>
              <button type="button" class="dg-ib" data-tact="fit" title="Alles zeigen">${ICON.fit}</button>
              <button type="button" class="dg-ib" data-tact="zin" title="Vergrößern">${ICON.plus}</button>
              <button type="button" class="dg-ib" data-tact="png" title="Als Bild speichern">${ICON.img}</button>
              <button type="button" class="dg-ib" data-tact="close" title="Aus der Ansicht nehmen">✕</button>
            </span></div>
          <div class="dg-cmp-paper"></div>
        </div>`).join('');
      for (const id of Object.keys(panes)) { panes[id].cv && panes[id].cv.destroy(); }
      for (const id of picked) {
        const host = el.querySelector(`.dg-cmp[data-pp="${CSS.escape(id)}"] .dg-cmp-paper`);
        const old = panes[id] || {};
        const cv = new Canvas(host, { readonly: true });
        panes[id] = { cv, rev: old.rev || 0, doc: old.doc || null, autofit: true };
        if (old.doc) { cv.setDoc(sane(old.doc, old.doc.kind)); }
        // Wer selbst zoomt/verschiebt, behält seine Ansicht beim Mitlaufen.
        host.addEventListener('pointerdown', () => { panes[id] && (panes[id].autofit = false); });
        host.addEventListener('wheel', () => { panes[id] && (panes[id].autofit = false); }, { passive: true });
      }
    }
    picked.forEach((id, i) => {
      const it = classList.find(x => x.participant === id);
      const box_ = el.querySelector(`.dg-cmp[data-pp="${CSS.escape(id)}"]`);
      if (!box_ || !it) return;
      box_.querySelector('.dg-li-n').textContent = i + 1;
      box_.querySelector('[data-k="name"]').textContent = it.person;
      box_.querySelector('[data-k="sub"]').textContent = (it.title ? it.title + ' · ' : '') + (KINDS[it.kind] ? KINDS[it.kind].label : '');
    });
  }

  async function pollClass() {
    clearTimeout(pollT); pollT = null;
    if (!root || mode !== 'presenter') return;
    if (!document.hidden && tab === 'class') {
      const r = demo ? demoList() : await ctx.actions.call('dg_class_list', {});
      if (!root) return;
      if (r && r.ok) {
        // Ohne Migration 0260 fehlt `shared` — dann wie früher: alles sichtbar
        classList = (r.items || []).map(x => ('shared' in x) ? x : Object.assign({}, x, { shared: true }));
        const t = r.teacher || null;
        if (JSON.stringify(t && t.rev) !== JSON.stringify(tShare && tShare.rev)) { tShare = t; if (tab === 'own') paintShare(); }
        // Wer das Teilen beendet, verschwindet von vorne.
        picked = picked.filter(id => classList.some(x => x.participant === id && x.shared));
        paintList();
        paintCompare();
        for (const id of picked) {
          const it = classList.find(x => x.participant === id);
          const p = panes[id];
          if (it && p && it.rev !== p.rev) loadPane(id, it.rev);
        }
      }
    }
    if (root) pollT = setTimeout(pollClass, demo ? 2500 : 3000);
  }

  async function loadPane(id) {
    const p = panes[id];
    if (!p || p.busy) return;
    p.busy = true;
    const r = demo ? demoGet(id) : await ctx.actions.call('dg_class_get', { p_participant: id });
    p.busy = false;
    if (!root || panes[id] !== p) return;
    if (!r || !r.ok) return;
    const first = !p.doc;
    p.rev = r.rev; p.doc = r.doc;
    p.cv.setDoc(sane(r.doc, r.kind), !(first || p.autofit));
  }

  function presenterClick(ev) {
    const t = ev.target;
    const ask = t.closest('[data-ask]');
    if (ask) { askStudent(ask.dataset.ask); return; }
    const tb = t.closest('.dg-tab');
    if (tb) { tab = tb.dataset.tab; paintTabs(); if (tab === 'class') pollClass(); return; }
    const li = t.closest('button.dg-li');
    if (li) {
      const id = li.dataset.pp;
      const i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1);
      else { picked.push(id); if (picked.length > 2) picked.shift(); }
      paintList(); paintCompare();
      const it = classList.find(x => x.participant === id);
      if (i < 0 && it) loadPane(id, it.rev);
      return;
    }
    const b = t.closest('[data-tact]');
    if (!b) return;
    const a = b.dataset.tact;
    if (a === 'togglelist') { listHidden = !listHidden; paintTabs(); setTimeout(() => Object.values(panes).forEach(p => p.autofit && p.cv.fit()), 60); return; }
    const pane = b.closest('.dg-cmp');
    const id = pane && pane.dataset.pp;
    const p = id && panes[id];
    if (!p) return;
    if (a === 'close') { picked = picked.filter(x => x !== id); paintList(); paintCompare(); return; }
    if (a === 'fit') { p.autofit = true; p.cv.fit(); return; }
    if (a === 'zin') { p.autofit = false; p.cv.zoom(1.25); return; }
    if (a === 'zout') { p.autofit = false; p.cv.zoom(0.8); return; }
    if (a === 'png') {
      const it = classList.find(x => x.participant === id);
      exportPNG(clean(p.cv.doc), fileName((it ? it.person + ' – ' : '') + (it && it.title || 'Diagramm')));
    }
  }

  /* ── Schaufenster: eine erfundene Klasse ───────────────────── */
  let demoT0 = 0;
  const DEMO_PEOPLE = [
    { participant: 'd1', person: 'Mia', seat: 1, title: 'Räuber und Beute', kind: 'wirkung', shared: true },
    { participant: 'd2', person: 'Leon', seat: 2, title: 'Füchse und Hasen', kind: 'wirkung', shared: true },
    { participant: 'd3', person: 'Emma', seat: 3, title: 'Der Wald', kind: 'mindmap', shared: true },
    { participant: 'd4', person: 'Noah', seat: 4, title: 'Fahrzeuge', kind: 'klasse', shared: false }
  ];
  let demoAsks = {};       // Schaufenster: angefragt → nach 3 s sagt das „Tablet" Ja
  function demoAsk(id) {
    demoAsks[id] = Date.now();
    return { ok: true, ask: 'open' };
  }
  function demoDoc(id) {
    if (id === 'd1') return SAMPLES.wirkung;
    if (id === 'd3') return SAMPLES.mindmap;
    if (id === 'd4') return SAMPLES.klasse;
    // Leon „zeichnet" gerade: mit der Zeit kommt ein Baustein dazu.
    const steps = Math.min(3, Math.floor((Date.now() - demoT0) / 5000));
    const d = { kind: 'wirkung', nodes: [
      { id: 'a', type: 'box', x: -150, y: 0, t: 'Hasen', c: 1 }, { id: 'b', type: 'box', x: 150, y: 0, t: 'Füchse', c: 5 }],
      edges: [{ id: '1', a: 'a', b: 'b', type: 'effect', f: 'g' }] };
    if (steps >= 1) d.edges.push({ id: '2', a: 'b', b: 'a', type: 'effect', f: 'r' });
    if (steps >= 2) d.nodes.push({ id: 'c', type: 'box', x: 0, y: 140, t: 'Jäger', c: 7 });
    if (steps >= 3) d.edges.push({ id: '3', a: 'c', b: 'b', type: 'effect', f: 'r', l: 'jagen' });
    return d;
  }
  function demoList() {
    return { ok: true, items: DEMO_PEOPLE.map(p => {
      const d = demoDoc(p.participant);
      const live = p.participant === 'd2';
      const asked = demoAsks[p.participant];
      const shared = p.shared || (asked && Date.now() - asked > 3000);
      return Object.assign({}, p, { shared, ask: !shared && asked ? 'open' : null, nodes: d.nodes.length, rev: live ? 1 + Math.min(3, Math.floor((Date.now() - demoT0) / 5000)) : 1,
        updated_at: new Date(Date.now() - (live ? 2000 : 240000 * p.seat)).toISOString() });
    }) };
  }
  function demoGet(id) {
    const it = demoList().items.find(x => x.participant === id);
    return { ok: true, doc: JSON.parse(JSON.stringify(demoDoc(id))), kind: it.kind, title: it.title, rev: it.rev };
  }

  /* ════════════════════════════════════════════════════════════
     7  Anmeldung beim System
     ════════════════════════════════════════════════════════════ */
  window.MPTool.register('diagramm', {
    settingsFields: [{
      key: 'kind', type: 'choice', label: 'Was zeichnet die Klasse?', default: 'free',
      options: [
        { value: 'free',    label: 'frei wählen',      hint: 'Jede Person wählt selbst: Mindmap, Concept Map, Klassen- oder Objektdiagramm.' },
        { value: 'mindmap', label: 'Mindmap',          hint: KINDS.mindmap.hint },
        { value: 'wirkung', label: 'Concept Map',      hint: KINDS.wirkung.hint },
        { value: 'klasse',  label: 'Klassendiagramm',  hint: KINDS.klasse.hint },
        { value: 'objekt',  label: 'Objektdiagramm',   hint: KINDS.objekt.hint }
      ]
    }],

    mount(el, context) {
      root = el; ctx = context; view = null;
      demo = !!(ctx && ctx.preview);
      mode = (demo || ctx.role === 'presenter') ? 'presenter' : 'participant';
      ed = null; kind = null; loaded = false; saveT = null; saving = false; dirty = false; lastErr = '';
      tab = 'class'; classList = []; picked = []; panes = {}; pollT = null; listHidden = false; ownKey = null;
      pShared = false; pAsk = null; tInfo = null; pollMT = null; tShare = null; modalOpen = false; demoAsks = {};
      demoT0 = Date.now();
      if (demo) picked = ['d1', 'd2'];
      if (mode === 'presenter') presenterMount();
      else {
        participantMount();
        onVis = () => { if (!document.hidden && loaded) pollMine(); };
        document.addEventListener('visibilitychange', onVis);
      }
    },

    update(v) {
      view = v;
      if (!root) return;
      if (mode === 'presenter' && !ownKey && v && v.room && v.room.code) ownKey = 'dg.own.' + v.room.code;
      // Die Lehrkraft hat die Art festgelegt, und hier liegt noch die Auswahl offen
      if (mode === 'participant' && loaded && !ed && settingsKind()) startEditor(emptyDoc(settingsKind()), '');
    },

    unmount() {
      clearTimeout(pollT); clearTimeout(ownT); clearTimeout(pollMT);
      if (saveT && dirty && mode === 'participant' && ctx && ed) {
        // letzter Stand noch hinaus, bevor alles abgeräumt wird
        ctx.actions.call('dg_mine_put', { p_doc: clean(ed.cv.doc), p_title: ed.title || '', p_kind: ed.cv.doc.kind });
      }
      if (ed && mode === 'presenter' && !demo) jset(ownKey || 'dg.own', { doc: clean(ed.cv.doc), title: ed.title || '' });
      clearTimeout(saveT);
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      if (root) root.removeEventListener('click', presenterClick);
      if (ed) ed.destroy();
      Object.values(panes).forEach(p => p.cv && p.cv.destroy());
      root = null; ctx = null; view = null; ed = null; panes = {}; onVis = null;
    }
  });

  // Für Prüfstände und das Schaufenster.
  window.MPDiagramm = { KINDS, SAMPLES, sane, clean, layoutMindmap, exportSVG, measure, orthoRoute, orthoEnds, borderU, docSVG };
})();
