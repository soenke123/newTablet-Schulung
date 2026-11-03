/* ══════════════════════════════════════════════════════════════
   MPSkills — Skill „Diagramm"   ·   tool.js
   ══════════════════════════════════════════════════════════════
   Mindmaps, Wirkungsgefüge, Klassen- und Objektdiagramme zeichnen.
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
  /* Pfeilfarben im Wirkungsgefüge (edge.f): schwarz (Bleistift), grün, rot.
     Was die Farben bedeuten, legt die Klasse fest — der Skill rechnet
     nichts daraus. Vorher (bis 03.11.2026) gab es +/− (edge.s); sane()
     übersetzt alte Diagramme: − → rot, sonst schwarz. */
  const ARROW = { k: LINE, g: '#16a34a', r: '#dc2626' };
  const ARROW_NAME = { k: 'schwarz', g: 'grün', r: 'rot' };

  /* Zwei Kleider (03.11.2026):
       Papier  — Mindmap und Wirkungsgefüge: Zettel auf einem Tisch,
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
       type  center | topic (Mindmap) · box (Wirkungsgefüge) ·
             class · object · note (überall)
       x, y  Mitte des Knotens
       t     Text bzw. Name;  a Attribute;  o Methoden;  k Klasse (Objekt)
       c     Farbindex in COLORS
     edge: { id, a, b, type, s, l, m1, m2 }
       type  branch · effect · assoc · directed · inherit · aggr ·
             comp · dep · link · line · arrow
       s     Vorzeichen beim Wirkungsgefüge ('+' / '-')
       l     Beschriftung;  m1/m2 Multiplizitäten (UML)              */
  const KINDS = {
    mindmap: {
      label: 'Mindmap', icon: '🧠',
      hint: 'Ein Thema in der Mitte, Gedanken als Äste drumherum.',
      node: 'topic', edge: 'branch',
      add: [{ type: 'topic', label: 'Ast' }, { type: 'note', label: 'Notiz' }],
      edges: ['branch', 'line', 'arrow']
    },
    wirkung: {
      label: 'Wirkungsgefüge', icon: '🔄',
      hint: 'Größen mit Pfeilen verbinden – schwarz, grün oder rot – und beschriften.',
      node: 'box', edge: 'effect',
      add: [{ type: 'box', label: 'Größe' }, { type: 'note', label: 'Notiz' }],
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
    const sel = st.sel && st.sel.id === n.id;
    const hl = st.hl && st.hl.has(n.id);
    const lift = st.lift && st.lift.has(n.id);
    let g = `<g class="dg-node${sel ? ' is-sel' : ''}${hl ? ' is-hl' : ''}" data-node="${n.id}">`;
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
    if (sel || hl) {
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

  function labelSVG(x, y, text, opts) {
    if (!text) return '';
    const fam = (opts && opts.fam) || FONT;
    const w = textW(text, 13, false, fam) + 12;
    return `<g class="dg-elabel"><rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="5" fill="var(--dg-paper)" opacity=".92"/>`
      + `<text x="${x}" y="${y}" font-family="${fam}" font-size="13" text-anchor="middle" dominant-baseline="central" fill="${(opts && opts.fill) || LINE}">${esc(text)}</text></g>`;
  }

  function edgeSVG(e, doc, byId, st) {
    const A = byId[e.a], B = byId[e.b];
    if (!A || !B) return '';
    const sel = st.sel && st.sel.id === e.id;
    const hl = st.hl && st.hl.has(e.id);
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
    if (hl) { color = '#f59e0b'; width += 1.5; }

    // Gegenläufige Kante dazwischen? Dann beide leicht biegen.
    const twin = e.type !== 'branch' && doc.edges.some(o => o !== e && o.a === e.b && o.b === e.a);
    const bend = twin ? 28 : 0;
    const mx0 = (A.x + B.x) / 2, my0 = (A.y + B.y) / 2;
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const cx = mx0 + nx * bend, cy = my0 + ny * bend;

    let d, p1, p2, mid, angEnd, angStart, heads = '';
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
    } else {
      p1 = clipToBox(A, cx, cy, 2);
      p2 = clipToBox(B, cx, cy, 2);
      angEnd = Math.atan2(p2.y - cy, p2.x - cx);
      angStart = Math.atan2(p1.y - cy, p1.x - cx);
      // Linie an der Spitze kürzen
      const endHead = { effect: 'solid', arrow: 'solid', directed: 'open', dep: 'open', inherit: 'tri' }[e.type];
      const startHead = { aggr: 'diamond', comp: 'diamondF' }[e.type];
      const q2 = endHead ? { x: p2.x - Math.cos(angEnd) * HEAD_BACK[endHead], y: p2.y - Math.sin(angEnd) * HEAD_BACK[endHead] } : p2;
      const q1 = startHead ? { x: p1.x - Math.cos(angStart) * HEAD_BACK[startHead], y: p1.y - Math.sin(angStart) * HEAD_BACK[startHead] } : p1;
      d = bend ? `M${q1.x} ${q1.y}Q${cx} ${cy} ${q2.x} ${q2.y}` : `M${q1.x} ${q1.y}L${q2.x} ${q2.y}`;
      mid = bend ? { x: (p1.x + 2 * cx + p2.x) / 4, y: (p1.y + 2 * cy + p2.y) / 4 } : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      heads = [endHead && head(endHead, p2, angEnd, color), startHead && head(startHead, p1, angStart, color)].filter(Boolean).join('');
    }

    let g = `<g class="dg-edge${sel ? ' is-sel' : ''}" data-edge="${e.id}">`;
    g += `<path class="dg-hit" d="${d}" fill="none" stroke="transparent" stroke-width="18"/>`;
    if (sel) g += `<path d="${d}" fill="none" stroke="var(--dg-sel)" stroke-width="${width + 7}" stroke-linecap="round" opacity=".35"/>`;
    g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"${dash}/>`;
    g += heads;

    if (e.type === 'effect') {
      // Beschriftung neben den Pfeil statt darauf: über waagrechte, rechts neben senkrechte
      // (sonst verdeckt sie bei kurzen Pfeilen die ganze Linie).
      if (e.l) {
        let ux = nx, uy = ny;
        if (uy > 1e-6 || (Math.abs(uy) <= 1e-6 && ux < 0)) { ux = -ux; uy = -uy; }
        const lw = textW(e.l, 13, false, fam) + 12;
        const off = 15 * Math.abs(uy) + (lw / 2 + 6) * Math.abs(ux);
        g += labelSVG(mid.x + ux * off, mid.y + uy * off, e.l, { fam, fill: color });
      }
    } else if (e.l) {
      g += labelSVG(mid.x, mid.y, e.l, uml ? { fam, fill: 'var(--dg-muted)' } : { fam });
    }
    // Multiplizitäten an den Enden
    if (e.m1 || e.m2) {
      const off = (p, ang, t) => {
        if (!t) return '';
        const ox = p.x + Math.cos(ang) * 24 + Math.cos(ang + Math.PI / 2) * 12;
        const oy = p.y + Math.sin(ang) * 24 + Math.sin(ang + Math.PI / 2) * 12;
        return `<text x="${ox}" y="${oy}" font-family="${fam}" font-size="12" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="var(--dg-muted)">${esc(t)}</text>`;
      };
      const a1 = Math.atan2(cy - p1.y, cx - p1.x), a2 = Math.atan2(cy - p2.y, cx - p2.x);
      g += off(p1, a1, e.m1) + off(p2, a2, e.m2);
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
     Wirkungsgefüge: Kreisläufe finden
     ════════════════════════════════════════════════════════════
     Jeder einfache Kreis entlang der Pfeile — nur gefunden und
     hervorgehoben, nicht gedeutet (die Farben bedeuten, was die Klasse
     festlegt). Höchstens 30 Kreise, damit ein Knäuel die Seite nicht
     anhält. */
  function findLoops(doc) {
    const out = [];
    const effects = doc.edges.filter(e => e.type === 'effect');
    const adj = {};
    for (const e of effects) (adj[e.a] = adj[e.a] || []).push(e);
    const ids = doc.nodes.map(n => n.id);
    const order = {}; ids.forEach((id, i) => { order[id] = i; });
    for (const start of ids) {
      // DFS, nur über Knoten mit größerem Index als start (jeder Kreis einmal)
      const walk = (v, path, seen) => {
        if (out.length >= 30) return;
        for (const e of adj[v] || []) {
          if (e.b === start) { out.push(path.concat(e)); continue; }
          if (order[e.b] <= order[start] || seen.has(e.b)) continue;
          seen.add(e.b); walk(e.b, path.concat(e), seen); seen.delete(e.b);
        }
      };
      walk(start, [], new Set([start]));
    }
    const byId = {}; doc.nodes.forEach(n => { byId[n.id] = n; });
    return out.map(edges => ({
      edges, nodes: edges.map(e => e.a),
      names: edges.map(e => (byId[e.a] && byId[e.a].t) || '…')
    }));
  }

  /* ════════════════════════════════════════════════════════════
     Mindmap ordnen
     ════════════════════════════════════════════════════════════
     Mitte bei (0,0), Äste erster Ebene abwechselnd rechts und links,
     jeder Teilbaum bekommt so viel Höhe, wie seine Blätter brauchen. */
  function layoutMindmap(doc) {
    const center = doc.nodes.find(n => n.type === 'center');
    if (!center) return false;
    const kids = {};
    const hasParent = new Set();
    for (const e of doc.edges) {
      if (e.type !== 'branch') continue;
      (kids[e.a] = kids[e.a] || []).push(e.b);
      hasParent.add(e.b);
    }
    const byId = {}; doc.nodes.forEach(n => { byId[n.id] = n; measure(n); });
    const GAP_Y = 14, GAP_X = 60;
    const seen = new Set([center.id]);
    const childrenOf = id => (kids[id] || []).filter(k => byId[k] && !seen.has(k) && (seen.add(k), true));
    const tree = id => ({ id, kids: childrenOf(id).map(tree) });
    const root = tree(center.id);
    const height = t => {
      const own = byId[t.id]._m.h;
      const kh = t.kids.reduce((s, k) => s + height(k), 0) + Math.max(0, t.kids.length - 1) * GAP_Y;
      t.h = Math.max(own, kh);
      return t.h;
    };
    const place = (t, x, yTop, dir) => {
      const n = byId[t.id];
      n.x = Math.round(x + dir * n._m.w / 2);
      n.y = Math.round(yTop + t.h / 2);
      let y = yTop + (t.h - (t.kids.reduce((s, k) => s + k.h, 0) + Math.max(0, t.kids.length - 1) * GAP_Y)) / 2;
      for (const k of t.kids) {
        place(k, x + dir * (n._m.w + GAP_X), y, dir);
        y += k.h + GAP_Y;
      }
    };
    const R = [], L = [];
    root.kids.forEach((k, i) => (i % 2 ? L : R).push(k));
    center.x = 0; center.y = 0;
    for (const [side, dir] of [[R, 1], [L, -1]]) {
      side.forEach(height);
      const total = side.reduce((s, k) => s + k.h, 0) + Math.max(0, side.length - 1) * GAP_Y * 2;
      let y = -total / 2;
      for (const k of side) {
        place(k, dir * (center._m.w / 2 + GAP_X + 20), y, dir);
        y += k.h + GAP_Y * 2;
      }
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
    this.sel = null;              // { kind: 'node'|'edge', id }
    this.hl = null;               // Set hervorgehobener ids (Kreisläufe)
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
      const nodeEl = t.closest && t.closest('[data-node]');
      const edgeEl = t.closest && t.closest('[data-edge]');
      if (handle) {
        const from = self.node(handle.dataset.handle);
        drag = { mode: 'link', from, dir: handle.dataset.dir, sx: ev.clientX, sy: ev.clientY, moved: false, w };
        ev.preventDefault();
        return;
      }
      if (nodeEl && !self.readonly) {
        const n = self.node(nodeEl.dataset.node);
        // Mindmap: der ganze Ast wandert mit.
        const group = (self.doc.kind === 'mindmap' && n.type !== 'center') ? self.subtree(n.id) : [n];
        drag = { mode: 'node', n, group, start: w, orig: group.map(g => ({ g, x: g.x, y: g.y })), sx: ev.clientX, sy: ev.clientY, moved: false };
        return;
      }
      if (edgeEl && !self.readonly) {
        drag = { mode: 'edge', id: edgeEl.dataset.edge, sx: ev.clientX, sy: ev.clientY };
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
        if (!drag.moved) { self.onBefore(); drag.moved = true; self.lift = new Set(drag.group.map(g => g.id)); self.select({ kind: 'node', id: drag.n.id }, true); }
        const w = toWorld(ev.clientX, ev.clientY);
        const dx = w.x - drag.start.x, dy = w.y - drag.start.y;
        for (const it of drag.orig) { it.g.x = Math.round(it.x + dx); it.g.y = Math.round(it.y + dy); }
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
          else self.select(null);
        }
      } else if (d.mode === 'node') {
        if (d.moved) { self.lift = null; self.render(); self.onChange(); }
        else {
          const dbl = lastTap.id === d.n.id && now - lastTap.t < 420;
          lastTap = { t: now, id: d.n.id, x: ev.clientX, y: ev.clientY };
          self.select({ kind: 'node', id: d.n.id });
          self.reveal(d.n);
          if (dbl) { self.onEdit({ id: d.n.id }); lastTap.t = 0; }
        }
      } else if (d.mode === 'edge') {
        self.select({ kind: 'edge', id: d.id });
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
      const n = this.node(nid); if (n) out.push(n);
      for (const e of this.doc.edges) if (e.type === 'branch' && e.a === nid) go(e.b);
    };
    go(id);
    return out;
  };
  Canvas.prototype.setDoc = function (doc, keepView) {
    this.doc = doc;
    this.sel = null; this.hl = null;
    this.render();
    if (!keepView) this.fit();
  };
  Canvas.prototype.select = function (sel, silent) {
    this.sel = sel;
    this.render();
    if (!silent || sel) this.onSelect(sel);
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
    const st = { sel: this.sel, hl: this.hl, lift: this.lift };
    this.host.classList.toggle('k-uml', isUml(this.doc.kind));
    this.host.classList.toggle('k-paper', !isUml(this.doc.kind));
    let s = docSVG(this.doc, st);
    // Anfasser am gewählten Knoten: vier Punkte zum Verbinden.
    if (!this.readonly && this.sel && this.sel.kind === 'node') {
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
  function exportSVG(doc, scale) {
    const b = bounds(doc);
    const pad = 30;
    const w = Math.ceil(b.w + pad * 2), h = Math.ceil(b.h + pad * 2);
    let body = docSVG(doc, {});
    for (const [k, v] of Object.entries(VARS_EXPORT)) body = body.split(`var(${k})`).join(v);
    return {
      w: w * (scale || 1), h: h * (scale || 1),
      svg: `<svg xmlns="${NS}" width="${w * (scale || 1)}" height="${h * (scale || 1)}" viewBox="${b.x - pad} ${b.y - pad} ${w} ${h}">`
         + `${fontCSS ? `<style>${fontCSS}</style>` : ''}${DEFS}`
         + `<rect x="${b.x - pad}" y="${b.y - pad}" width="${w}" height="${h}" fill="#fff"/>${body}</svg>`
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

  async function exportPNG(doc, name) {
    await loadExportFonts();
    return new Promise(resolve => {
      const { svg, w, h } = exportSVG(doc, 2);
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
        m1: e.m1 ? String(e.m1).slice(0, 12) : undefined, m2: e.m2 ? String(e.m2).slice(0, 12) : undefined
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
    loop:  '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    swap:  '<svg viewBox="0 0 24 24"><path d="M4 8h14l-4-4M20 16H6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  const HELP = {
    common: [
      ['Antippen', 'wählt einen Baustein oder eine Verbindung aus.'],
      ['Doppelt tippen', 'auf einen Baustein: Text schreiben. Auf die leere Fläche: neuer Baustein.'],
      ['Ziehen', 'verschiebt einen Baustein. Die leere Fläche ziehen verschiebt das Blatt.'],
      ['Blaue Punkte', 'am gewählten Baustein: antippen = neuer Baustein daneben, auf einen anderen Baustein ziehen = verbinden.'],
      ['Zwei Finger', 'zoomen. Am Rechner: Mausrad.']
    ],
    mindmap: [['Tastatur', 'Tab = neuer Ast, Enter = Nachbar-Ast, Entf = löschen.'], ['Ordnen', 'räumt die Mindmap auf.']],
    wirkung: [['Pfeilfarbe', 'Pfeil antippen und unten schwarz, grün oder rot wählen. Der nächste Pfeil bekommt dieselbe Farbe.'],
              ['Beschriftung', 'Pfeil antippen und unten in das Feld über dem Pfeil schreiben.'],
              ['Kreisläufe', 'zeigt geschlossene Kreise: Pfeil-Wege, die wieder am Anfang ankommen.']],
    klasse:  [['Klasse', 'doppelt tippen: Name, Attribute (z. B. - name: String) und Methoden (z. B. + fahren(): void) eintragen, je Zeile eins.'],
              ['Beziehung', 'eine Verbindung antippen und unten die Art wählen: Assoziation, Vererbung, Aggregation …']],
    objekt:  [['Objekt', 'doppelt tippen: Objektname, Klasse und Attributwerte (z. B. farbe = "rot") eintragen.']]
  };

  function Editor(host, opts) {
    const self = this;
    const o = opts || {};
    this.o = o;
    this.kindLocked = o.kindLocked || null;
    this.undo = []; this.redo = [];
    this.title = '';
    this.edgeType = {};
    this.loops = null;

    host.innerHTML = `
      <div class="dg-ed">
        <div class="dg-bar">
          <div class="dg-bar-l">
            <span class="dg-kind" data-k="kind"></span>
            <input class="dg-title" data-k="title" maxlength="80" placeholder="Titel" aria-label="Titel des Diagramms"/>
          </div>
          <div class="dg-bar-m" data-k="adds"></div>
          <div class="dg-bar-r">
            <button type="button" class="dg-ib" data-act="undo" title="Rückgängig (Strg+Z)">${ICON.undo}</button>
            <button type="button" class="dg-ib" data-act="redo" title="Wiederholen (Strg+Y)">${ICON.redo}</button>
            <span class="dg-sep"></span>
            <button type="button" class="dg-ib" data-act="zout" title="Verkleinern">${ICON.minus}</button>
            <button type="button" class="dg-ib" data-act="fit" title="Alles zeigen">${ICON.fit}</button>
            <button type="button" class="dg-ib" data-act="zin" title="Vergrößern">${ICON.plus}</button>
            <span class="dg-sep"></span>
            <button type="button" class="dg-ib" data-act="png" title="Als Bild speichern (PNG)">${ICON.img}</button>
            <button type="button" class="dg-ib" data-act="help" title="Wie geht das?">${ICON.help}</button>
            ${o.extraRight || ''}
          </div>
        </div>
        <div class="dg-stage">
          <div class="dg-paper" data-k="paper"></div>
          <div class="dg-status" data-k="status" aria-live="polite"></div>
          <div class="dg-loops" data-k="loops" hidden></div>
          <div class="dg-help" data-k="help" hidden></div>
          <div class="dg-edit" data-k="edit" hidden></div>
          <div class="dg-ctx" data-k="ctx" hidden></div>
        </div>
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
    this.ro.disconnect();
    this.cv.destroy();
  };

  Editor.prototype.load = function (doc, title) {
    this.cv.setDoc(doc);
    this._fitted = false;
    this.title = title || '';
    this.undo = []; this.redo = [];
    this.closeEdit(false);
    this.$('title').value = this.title;
    this.paintBar();
    this.showCtx(null);
    this.hideLoops();
  };

  Editor.prototype.paintBar = function () {
    const k = KINDS[this.cv.doc.kind];
    this.$('kind').innerHTML = `<span aria-hidden="true">${k.icon}</span> ${esc(k.label)}`;
    this.$('kind').title = k.hint;
    let adds = k.add.map(a => `<button type="button" class="dg-add" data-act="add" data-type="${a.type}">${ICON.plus}<span>${esc(a.label)}</span></button>`).join('');
    if (this.cv.doc.kind === 'mindmap') adds += `<button type="button" class="dg-add dg-add--soft" data-act="tidy" title="Mindmap aufräumen">${ICON.tidy}<span>Ordnen</span></button>`;
    if (this.cv.doc.kind === 'wirkung') adds += `<button type="button" class="dg-add dg-add--soft" data-act="loops" title="Kreisläufe finden">${ICON.loop}<span>Kreisläufe</span></button>`;
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
  Editor.prototype.changed = function (titleOnly) {
    if (!titleOnly && this.loops) this.findLoops(true);
    if (this.o.onChange) this.o.onChange();
  };
  Editor.prototype.restore = function (from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(clean(this.cv.doc)));
    const d = JSON.parse(from.pop());
    this.cv.doc = sane(d, d.kind);
    this.cv.sel = null; this.cv.hl = null;
    this.cv.render();
    this.showCtx(null);
    this.paintUndo();
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
    if (doc.kind === 'mindmap' && type === 'branch' && B.type === 'center') return null;
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
    if (a === 'png') {
      this.closeEdit(true);
      return exportPNG(clean(cv.doc), fileName(this.title || KINDS[cv.doc.kind].label));
    }
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
      // Mindmap: „Ast" hängt sich an den gewählten Knoten (oder die Mitte).
      if (type === 'topic' && cv.doc.kind === 'mindmap') {
        const par = (sel && sel.type !== 'note') ? sel : cv.doc.nodes.find(n => n.type === 'center');
        if (par) {
          const p = this.freeSpot(par, par.type === 'center' ? (cv.doc.edges.filter(e => e.a === par.id).length % 2 ? 'l' : 'r') : (par.x < 0 ? 'l' : 'r'));
          const n = this.newNode('topic', p.x, p.y, par);
          this.newEdge(par.id, n.id);
          cv.select({ kind: 'node', id: n.id }, true);
          this.changed();
          return this.openEdit(n.id);
        }
      }
      const n = this.newNode(type, x, y);
      cv.select({ kind: 'node', id: n.id }, true);
      this.changed();
      return this.openEdit(n.id);
    }
    if (a === 'tidy') {
      this.snap();
      layoutMindmap(cv.doc);
      cv.render(); cv.fit();
      return this.changed();
    }
    if (a === 'loops') return this.loops ? this.hideLoops() : this.findLoops();
    if (a === 'del') return this.remove();
    if (a === 'edit') return cv.sel && this.openEdit(cv.sel.id);
    if (a === 'color') {
      const n = cv.sel && cv.node(cv.sel.id);
      if (!n) return;
      this.snap();
      const c = Number(btn.dataset.c);
      // Mindmap: der ganze Ast nimmt die Farbe mit.
      const group = cv.doc.kind === 'mindmap' && n.type === 'topic' ? cv.subtree(n.id).filter(x => x.type === 'topic') : [n];
      group.forEach(x => { x.c = c; });
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
    if (a === 'loop') {
      const i = Number(btn.dataset.i);
      const L = this.loops && this.loops[i];
      if (!L) return;
      cv.hl = new Set([...L.nodes, ...L.edges.map(e => e.id)]);
      this.$('loops').querySelectorAll('[data-i]').forEach(b => b.classList.toggle('is-on', b === btn));
      cv.render();
      return;
    }
    if (a === 'loopsx') return this.hideLoops();
    if (a === 'helpx') return this.toggleHelp(false);
    if (a === 'editok') return this.closeEdit(true);
  };

  Editor.prototype.remove = function () {
    const cv = this.cv;
    if (!cv.sel) return;
    if (cv.sel.kind === 'node') {
      const n = cv.node(cv.sel.id);
      if (!n) return;
      if (n.type === 'center') { this.o.toast && this.o.toast('Die Mitte der Mindmap bleibt stehen.'); return; }
      this.snap();
      cv.doc.nodes = cv.doc.nodes.filter(x => x.id !== n.id);
      cv.doc.edges = cv.doc.edges.filter(e => e.a !== n.id && e.b !== n.id);
    } else {
      this.snap();
      cv.doc.edges = cv.doc.edges.filter(e => e.id !== cv.sel.id);
    }
    cv.select(null);
    this.changed();
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
    if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); return ev.shiftKey ? this.restore(this.redo, this.undo) : this.restore(this.undo, this.redo); }
    if (mod && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); return this.restore(this.redo, this.undo); }
    if (!cv.sel) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); return this.remove(); }
    if (ev.key === 'Escape') return cv.select(null);
    if (cv.sel.kind !== 'node') return;
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
      const dir = par.type === 'center' ? (n.x < par.x && ev.key === 'Enter' ? 'l' : 'r') : (par.x < 0 ? 'l' : 'r');
      this.handleEdit({ link: true, from: par.id, dir });
    }
  };

  /* ── Auswahl-Leiste ───────────────────────────────────────── */
  Editor.prototype.showCtx = function (sel) {
    const box_ = this.$('ctx');
    if (this.editing && (!sel || sel.id !== this.editing)) this.closeEdit(true);
    if (!sel) { box_.hidden = true; box_.innerHTML = ''; return; }
    const cv = this.cv;
    let h = '';
    if (sel.kind === 'node') {
      const n = cv.node(sel.id);
      if (!n) { box_.hidden = true; return; }
      h += `<button type="button" class="dg-cb dg-cb--main" data-act="edit">${ICON.pen}<span>Text</span></button>`;
      if (n.type !== 'note') {
        h += '<span class="dg-csep"></span><div class="dg-colors" role="group" aria-label="Farbe">'
          + COLORS.map(([f, s], i) => `<button type="button" class="dg-col${(n.c || 0) === i ? ' is-on' : ''}" data-act="color" data-c="${i}" title="${COLOR_NAMES[i]}" style="--f:${f};--s:${s}"></button>`).join('')
          + '</div>';
      }
      if (n.type !== 'center') h += `<span class="dg-csep"></span><button type="button" class="dg-cb dg-cb--del" data-act="del" title="Löschen (Entf)">${ICON.trash}</button>`;
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
    ed.innerHTML = `<div class="dg-edit-in${n.type === 'class' || n.type === 'object' ? ' is-form' : ''}">${h}
      <button type="button" class="dg-ok" data-act="editok">Fertig</button></div>`;
    ed.hidden = false;
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
        this.handleEdit({ link: true, from: id, dir: n.x < 0 ? 'l' : 'r' });
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
    ed.hidden = true; ed.innerHTML = ''; ed.oninput = null; ed.onkeydown = null;
    if (keep && before && before !== JSON.stringify(clean(this.cv.doc))) {
      this.undo.push(before);
      if (this.undo.length > 80) this.undo.shift();
      this.redo = [];
      this.paintUndo();
    }
  };

  /* ── Kreisläufe ───────────────────────────────────────────── */
  Editor.prototype.findLoops = function (quiet) {
    const L = findLoops(this.cv.doc);
    this.loops = L;
    const box_ = this.$('loops');
    box_.innerHTML = `<div class="dg-loops-h"><b>Kreisläufe</b><button type="button" class="dg-x" data-act="loopsx" aria-label="Schließen">✕</button></div>`
      + (L.length ? L.map((l, i) => `<button type="button" class="dg-loop" data-act="loop" data-i="${i}">
            <span class="dg-lt">${i + 1}</span>
            <span>${l.names.map(esc).join(' → ')} → ↺</span></button>`).join('')
        : '<p class="dg-loops-none">Noch kein geschlossener Kreis. Verbinde die Größen so, dass ein Pfeil-Weg wieder am Anfang ankommt.</p>')
      + (L.length ? '<p class="dg-loops-k">Antippen hebt den Kreis im Diagramm hervor.</p>' : '');
    box_.hidden = false;
    if (!quiet) { this.cv.hl = null; this.cv.render(); }
  };
  Editor.prototype.hideLoops = function () {
    this.loops = null;
    this.$('loops').hidden = true;
    if (this.cv.hl) { this.cv.hl = null; this.cv.render(); }
  };

  Editor.prototype.toggleHelp = function (on) {
    const h = this.$('help');
    const show = on == null ? h.hidden : on;
    if (!show) { h.hidden = true; return; }
    const rows = HELP.common.concat(HELP[this.cv.doc.kind] || []);
    h.innerHTML = `<div class="dg-loops-h"><b>So geht's</b><button type="button" class="dg-x" data-act="helpx" aria-label="Schließen">✕</button></div>`
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
  // Lehrkraft
  let tab = 'class', classList = [], picked = [], panes = {}, pollT = null, listHidden = false, ownKey = null;
  let onVis = null;

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
      if (r.doc && r.kind) startEditor(sane(r.doc, r.kind), r.title || '');
      else {
        const fixed = settingsKind();
        if (fixed) startEditor(emptyDoc(fixed), '');
        else showPick();
      }
    })();
  }

  function showPick(note) {
    if (ed) { ed.destroy(); ed = null; }
    const main = root.querySelector('.dg-main');
    main.innerHTML = pickHTML(note);
    main.onclick = ev => {
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
    const canSwitch = mode === 'presenter' || !settingsKind();
    ed = new Editor(main, {
      kindLocked: settingsKind(),
      toast,
      extraRight: canSwitch ? `<span class="dg-sep"></span><button type="button" class="dg-ib dg-ib--txt" data-act="neu" title="Neues Diagramm">Neu</button>` : '',
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
    main.onclick = ev => { if (ev.target.closest('[data-act="neu"]')) newDiagram(); };
    if (mode === 'participant') paintSave();
  }

  async function newDiagram() {
    const empty = !ed || ed.cv.doc.nodes.length <= 1;
    if (!empty) {
      const ok = await (ctx.confirm ? ctx.confirm('Neues Diagramm anfangen? Das jetzige wird dabei gelöscht.') : Promise.resolve(window.confirm('Neues Diagramm anfangen?')));
      if (!ok) return;
    }
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
    else showPick('Dein eigenes Diagramm bleibt vorerst auf diesem Gerät. Teilen mit der Klasse kommt später.');
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
    if (c) c.textContent = classList.length ? `(${classList.length})` : '';
    if (!classList.length) {
      el.innerHTML = `<p class="dg-list-empty">Noch keine Diagramme. Sobald die Klasse zeichnet, stehen sie hier.</p>`;
      return;
    }
    el.innerHTML = `<p class="dg-list-h">Antippen = vorne zeigen · bis zu zwei nebeneinander</p>`
      + classList.map(it => {
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
      el.innerHTML = `<div class="dg-cmp-empty"><b>Diagramme vergleichen</b><p>Links ein Diagramm antippen – es erscheint hier groß.
        Ein zweites antippen, und beide stehen nebeneinander. Was die Klasse weiterzeichnet, läuft vorne mit.</p></div>`;
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
        classList = r.items || [];
        picked = picked.filter(id => classList.some(x => x.participant === id));
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
    const tb = t.closest('.dg-tab');
    if (tb) { tab = tb.dataset.tab; paintTabs(); if (tab === 'class') pollClass(); return; }
    const li = t.closest('.dg-li');
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
    { participant: 'd1', person: 'Mia', seat: 1, title: 'Räuber und Beute', kind: 'wirkung' },
    { participant: 'd2', person: 'Leon', seat: 2, title: 'Füchse und Hasen', kind: 'wirkung' },
    { participant: 'd3', person: 'Emma', seat: 3, title: 'Der Wald', kind: 'mindmap' },
    { participant: 'd4', person: 'Noah', seat: 4, title: 'Fahrzeuge', kind: 'klasse' }
  ];
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
      return Object.assign({}, p, { nodes: d.nodes.length, rev: live ? 1 + Math.min(3, Math.floor((Date.now() - demoT0) / 5000)) : 1,
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
        { value: 'free',    label: 'frei wählen',      hint: 'Jede Person wählt selbst: Mindmap, Wirkungsgefüge, Klassen- oder Objektdiagramm.' },
        { value: 'mindmap', label: 'Mindmap',          hint: KINDS.mindmap.hint },
        { value: 'wirkung', label: 'Wirkungsgefüge',   hint: KINDS.wirkung.hint },
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
      demoT0 = Date.now();
      if (demo) picked = ['d1', 'd2'];
      if (mode === 'presenter') presenterMount();
      else participantMount();
    },

    update(v) {
      view = v;
      if (!root) return;
      if (mode === 'presenter' && !ownKey && v && v.room && v.room.code) ownKey = 'dg.own.' + v.room.code;
      // Die Lehrkraft hat die Art festgelegt, und hier liegt noch die Auswahl offen
      if (mode === 'participant' && loaded && !ed && settingsKind()) startEditor(emptyDoc(settingsKind()), '');
    },

    unmount() {
      clearTimeout(pollT); clearTimeout(ownT);
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
  window.MPDiagramm = { KINDS, SAMPLES, sane, clean, findLoops, layoutMindmap, exportSVG, measure };
})();
