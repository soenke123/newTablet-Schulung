/* Baut „Datenbanksysteme.docx“ (Skript) und „Datenbanksysteme_Loesungen.docx“
   aus inhalt.mjs. Beispiel-Ergebnisse und Lösungen werden live gegen die
   Dummy-Daten von YourSozialNet gerechnet (db.mjs).
     node build.mjs <ausgabeordner> */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { load, run } from './db.mjs';
import { DOC, TEILE, STUFEN } from './inhalt.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const D = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, WidthType, BorderStyle,
  ShadingType, PageBreak, Footer, Header, PageNumber, TabStopType, VerticalAlign, LevelFormat, TableLayoutType, HeightRule,
  HorizontalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide } = D;

// Querverweise [[id]] → „5 k)“, [[id:kurz]] → „k)“ (Buchstaben verschieben sich beim Kürzen)
const REF = {};
for (const b of DOC) if (b.t === 'task') b.items.forEach((it, i) => { if (it.id) REF[it.id] = { n: b.n, l: String.fromCharCode(97 + i) }; });
(function walk(o) {
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'string') o[k] = o[k].replace(/\[\[(\w+)(:kurz)?\]\]/g, (m, id, kurz) => { const r = REF[id]; if (!r) throw new Error('Verweis fehlt: ' + id); return kurz ? r.l + ')' : r.n + ' ' + r.l + ')'; });
    else if (o[k] && typeof o[k] === 'object') walk(o[k]);
  }
})(DOC);
const STAR = readFileSync(new URL('./bilder/knobeln.png', import.meta.url).pathname);
const star = (px = 13) => new ImageRun({ type: 'png', data: STAR, transformation: { width: px, height: px } });
const OUT = process.argv[2] || new URL('.', import.meta.url).pathname;
const IMG = new URL('./bilder/', import.meta.url).pathname;
const DAY = '2026-11-07';

/* ── Farben (YourSozialNet hell) ─────────────────────────── */
const C = { ink: '0B0D18', muted: '545B70', line: 'DFE2EB', line2: 'C3C8D6', soft: 'F3F4F8', head: 'ECEEFA', hub: '4F46E5', dim: 'EEEDFD',
  kw: '7C3AED', fn: '0F7EA8', str: 'B4541B', num: '0E7490', bad: 'D92D3E', badd: 'FDECEE', gold: 'D99A00', goldd: 'FFF6D6', goldi: '7A5600', ok: '12A150' };
const FONT = 'Arial', MONO = 'Consolas';
const W = 9638; // Satzspiegel A4, Ränder 2 cm (in DXA)
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NOB = { top: none, bottom: none, left: none, right: none };
const line = (c = C.line2, s = 4) => ({ style: BorderStyle.SINGLE, size: s, color: c });

/* ── Text mit **fett**, *kursiv*, `Code` ─────────────────── */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0, m;
  const s = String(text).replace(/\\\*/g, '\u0001');
  const fix = t => t.replace(/\u0001/g, '*');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(new TextRun({ text: fix(s.slice(last, m.index)), ...base }));
    if (m[2] !== undefined) out.push(...runs(fix(m[2]), { ...base, bold: true }));
    else if (m[3] !== undefined) out.push(new TextRun({ text: fix(m[3]), ...base, font: MONO, size: (base.size || 21) - 2, color: C.hub, shading: { type: ShadingType.CLEAR, fill: C.dim, color: 'auto' } }));
    else out.push(new TextRun({ text: fix(m[4]), ...base, italics: true }));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(new TextRun({ text: fix(s.slice(last)), ...base }));
  return out;
}
const P = (text, o = {}) => new Paragraph({ children: runs(text, o.run || {}), spacing: { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 276 }, alignment: o.align, indent: o.indent, keepNext: o.keepNext, tabStops: o.tabStops });

/* ── SQL einfärben ───────────────────────────────────────── */
const KW = new Set(('SELECT FROM WHERE AND OR NOT IN IS NULL AS JOIN LEFT RIGHT FULL INNER OUTER ON GROUP BY ORDER HAVING LIMIT ASC DESC DISTINCT ' +
  'INSERT INTO VALUES UPDATE SET DELETE CASE WHEN THEN ELSE END LIKE BETWEEN TRUE FALSE').split(' '));
function sqlRuns(lineText, size = 18) {
  const out = [];
  const re = /('[^']*'?)|(<[^>]+>)|(\$\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)|(\s+)|(.)/g;
  let m;
  const r = (t, o = {}) => out.push(new TextRun({ text: t, font: MONO, size, color: C.ink, ...o }));
  while ((m = re.exec(lineText))) {
    if (m[1]) r(m[1], { color: C.str });
    else if (m[2]) r(m[2], { color: C.hub, italics: true });
    else if (m[3]) r(m[3], { color: C.gold, bold: true });
    else if (m[4]) r(m[4], { color: C.num });
    else if (m[5]) {
      const up = m[5].toUpperCase(), next = lineText.slice(re.lastIndex).trimStart()[0];
      if (KW.has(up)) r(m[5], { color: C.kw, bold: true });
      else if (next === '(') r(m[5], { color: C.fn });
      else r(m[5]);
    } else r(m[6] || m[7]);
  }
  return out;
}
// einzeilige Lösungen umbrechen
function pretty(sql) {
  if (sql.includes('\n')) return sql;
  let out = '', depth = 0, q = false;
  const brk = /^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|SET|VALUES|JOIN|LEFT JOIN|RIGHT JOIN|SELECT)\b/i;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === ' ' && i > 0) {
      const rest = sql.slice(i + 1);
      const mm = rest.match(brk);
      if (mm && !(/(LEFT|RIGHT)$/i.test(sql.slice(0, i)) && /^JOIN/i.test(rest))) { out += '\n' + (/^(JOIN|LEFT|RIGHT)/i.test(rest) ? '' : ''); continue; }
    }
    out += ch;
  }
  return out;
}
const codeParas = (sql, size = 18) => sql.split('\n').map(l => new Paragraph({ children: l ? sqlRuns(l, size) : [new TextRun({ text: ' ', font: MONO, size })], spacing: { after: 0, line: 252 }, keepNext: true, keepLines: true }));

/* ── Zellen/Tabellen ─────────────────────────────────────── */
function cell(children, o = {}) {
  return new TableCell({ children, width: { size: o.w, type: WidthType.DXA }, shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    borders: o.borders || NOB, margins: o.margins || { top: 100, bottom: 100, left: 160, right: 160 }, verticalAlign: o.va, columnSpan: o.span });
}
function tbl(rows, widths, o = {}) {
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows, layout: TableLayoutType.FIXED,
    borders: o.borders || { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }, alignment: o.align });
}
const label = (t, color = C.muted) => new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 15, bold: true, color, characterSpacing: 10 })], spacing: { after: 60 }, keepNext: true });
const spacer = (after = 120) => new Paragraph({ children: [], spacing: { after, before: 0, line: 120 } });

// Codekarte: hellgrau, links ein Balken in Akzentfarbe
function codeCard(sql, title, w = W, size = 18) {
  const kids = [];
  if (title) kids.push(label(title.toUpperCase(), C.hub));
  kids.push(...codeParas(sql, size));
  return cell(kids, { w, fill: C.soft, borders: { top: line(C.line), bottom: line(C.line), right: line(C.line), left: { style: BorderStyle.SINGLE, size: 24, color: C.hub } } });
}

// Ergebnis-Tabelle (Ausschnitt)
const db0 = load(DAY);
function exec(sqls, pre) {
  const db = load(DAY);
  if (pre) run(db, pre);
  return [].concat(sqls).map(s => { const res = run(db, s); return res.find(x => x.kind === 'error') || res[res.length - 1]; });
}
function resultBlock(r, { maxRows = 4, maxCols = 6, w = W, title = 'Ergebnis' } = {}) {
  if (!r) return [];
  if (r.kind === 'error') return [P('→ Fehlermeldung: *' + r.message + '*', { run: { size: 17, color: C.bad }, after: 120 })];
  if (!r.columns) return [P('→ ' + (r.changes ?? 0) + ' Zeile(n) geändert', { run: { size: 17, color: C.ok }, after: 120 })];
  const HIDE = ['password', 'bio', 'avatar', 'email', 'user_agent'];
  let idx = r.columns.map((c, i) => i);
  if (idx.length > maxCols) idx = idx.filter(i => !HIDE.includes(r.columns[i]));
  idx = idx.slice(0, maxCols);
  const cols = idx.map(i => r.columns[i]);
  const rows = r.rows.slice(0, maxRows).map(x => idx.map(i => x[i]));
  const cw = Math.floor(Math.min(w, 1500 * cols.length + 400) / cols.length);
  const fmt = v => { if (v === null) return 'NULL'; let s = typeof v === 'number' && !Number.isInteger(v) ? String(Math.round(v * 100) / 100) : String(v); s = s.replace(/\s+/g, ' '); return s.length > 26 ? s.slice(0, 25) + '…' : s; };
  const tr = (vals, head, last) => new TableRow({ cantSplit: true, children: vals.map(v => cell([new Paragraph({ children: [new TextRun({ text: head ? String(v) : fmt(v), font: head ? FONT : MONO, size: 15, bold: head, color: v === null && !head ? C.muted : C.ink, italics: v === null && !head })], spacing: { after: 0 }, keepNext: !last })],
    { w: cw, fill: head ? C.head : undefined, borders: { top: none, left: none, right: none, bottom: line(C.line) }, margins: { top: 40, bottom: 40, left: 90, right: 90 } })) });
  const more = r.rows.length > maxRows || r.columns.length > cols.length;
  return [
    new Paragraph({ children: [new TextRun({ text: title + ': ', font: FONT, size: 15, bold: true, color: C.muted }),
      new TextRun({ text: r.rows.length + (r.rows.length === 1 ? ' Zeile' : ' Zeilen') + (more ? ' (Ausschnitt)' : ''), font: FONT, size: 15, color: C.muted })], spacing: { before: 80, after: 40 }, keepNext: true }),
    tbl([tr(cols, true), ...rows.map((x, k) => tr(x, false, k === rows.length - 1))], cols.map(() => cw)),
    spacer(160)
  ];
}

/* ── Bausteine ───────────────────────────────────────────── */
function pngSize(file) { const b = readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
function image(name, cm, caption) {
  const f = IMG + name + '.png', s = pngSize(f);
  const wpx = Math.round(cm * 37.795), hpx = Math.round(wpx * s.h / s.w);
  return [new Paragraph({ children: [new ImageRun({ type: 'png', data: readFileSync(f), transformation: { width: wpx, height: hpx } })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: caption ? 40 : 160 }, keepNext: !!caption }),
    ...(caption ? [P('*' + caption + '*', { align: AlignmentType.CENTER, run: { size: 16, color: C.muted }, after: 220 })] : [])];
}
function floatImage(name, cm) {
  const f = IMG + name + '.png', s = pngSize(f);
  const wpx = Math.round(cm * 37.795), hpx = Math.round(wpx * s.h / s.w);
  return new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: 'png', data: readFileSync(f), transformation: { width: wpx, height: hpx },
    floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.RIGHT },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
      wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LEFT }, margins: { left: 180000, bottom: 120000 } } })] });
}
// Text links, Bild rechts (Tabelle ohne Rahmen – hält in Word und LibreOffice)
function sideBlock(b) {
  const f = IMG + b.file + '.png', sz = pngSize(f);
  const iw = Math.round(b.cm * 567) + 120, lw = W - iw;
  const wpx = Math.round(b.cm * 37.795), hpx = Math.round(wpx * sz.h / sz.w);
  const left = [];
  for (const x of b.left) {
    if (x.t === 'p') left.push(P(x.text));
    else if (x.t === 'list') left.push(...x.items.map(t => new Paragraph({ children: runs(t, { size: 19 }), numbering: { reference: 'dot', level: 0 }, spacing: { after: 60, line: 264 } })));
  }
  const right = [new Paragraph({ children: [new ImageRun({ type: 'png', data: readFileSync(f), transformation: { width: wpx, height: hpx } })], alignment: AlignmentType.RIGHT, spacing: { after: 40 } })];
  if (b.caption) right.push(P('*' + b.caption + '*', { align: AlignmentType.CENTER, run: { size: 16, color: C.muted }, after: 0 }));
  return [tbl([new TableRow({ cantSplit: true, children: [cell(left, { w: lw, margins: { top: 0, bottom: 0, left: 0, right: 160 } }), cell(right, { w: iw, margins: { top: 0, bottom: 0, left: 120, right: 0 } })] })], [lw, iw]), spacer(200)];
}
function syntaxBlock(b) {
  const lw = 3900, rw = W - lw - 120;
  const left = cell([label('AUFBAU'), ...codeParas(b.aufbau, 17)], { w: lw, fill: 'FFFFFF', borders: { top: line(C.line2), bottom: line(C.line2), left: line(C.line2), right: line(C.line2) } });
  const gap = cell([new Paragraph({ children: [] })], { w: 120 });
  const right = codeCard(b.sql, 'Beispiel · ' + b.title, rw);
  const out = [tbl([new TableRow({ children: [left, gap, right], cantSplit: true })], [lw, 120, rw])];
  out.push(spacer(200));
  return out;
}
function codeBlock(b) {
  const out = [tbl([new TableRow({ children: [codeCard(b.sql, b.title)], cantSplit: true })], [W])];
  out.push(spacer(200));
  return out;
}
function compareTable(a, b, w = W, ta = 'Befehl 1', tb = 'Befehl 2') {
  const cw = Math.floor((w - 160) / 2);
  return tbl([new TableRow({ children: [codeCard(a, ta, cw, 17), cell([new Paragraph({ children: [] })], { w: 160 }), codeCard(b, tb, cw, 17)], cantSplit: true })], [cw, 160, cw]);
}
const BOX = { tipp: { fill: C.dim, bar: C.hub, ink: C.hub, name: 'TIPP' }, achtung: { fill: C.badd, bar: C.bad, ink: C.bad, name: 'ACHTUNG' }, denk: { fill: C.goldd, bar: C.gold, ink: C.goldi, name: 'NACHGEDACHT' }, loes: { fill: 'E8F6EE', bar: C.ok, ink: '0B6B36', name: 'HINWEIS' } };
function boxBlock(kind, title, texts, w = W) {
  const k = BOX[kind];
  const kids = [new Paragraph({ children: [new TextRun({ text: k.name + (title ? '  ·  ' : ''), font: FONT, size: 15, bold: true, color: k.ink }), new TextRun({ text: title || '', font: FONT, size: 20, bold: true, color: C.ink })], spacing: { after: 80 } }),
    ...texts.map((t, i) => P(t, { after: i === texts.length - 1 ? 0 : 100, run: { size: 19 } }))];
  return [tbl([new TableRow({ children: [cell(kids, { w, fill: k.fill, borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: k.bar } }, margins: { top: 140, bottom: 140, left: 220, right: 220 } })], cantSplit: true })], [w]), spacer(220)];
}
function plainTable(head, rows, widths) {
  const tot = widths.reduce((a, b) => a + b, 0), sc = Math.min(1, W / tot), ws = widths.map(x => Math.floor(x * sc));
  const tr = (vals, h) => new TableRow({ tableHeader: h, cantSplit: true, children: vals.map((v, i) => cell([P(v, { after: 0, run: { size: h ? 17 : 18, bold: h, color: C.ink } })],
    { w: ws[i], fill: h ? C.head : undefined, borders: { top: none, left: none, right: none, bottom: line(h ? C.line2 : C.line) }, margins: { top: 70, bottom: 70, left: 120, right: 120 } })) });
  return [tbl([tr(head, true), ...rows.map(r => tr(r))], ws, { borders: { top: line(C.line2), bottom: line(C.line2), left: line(C.line2), right: line(C.line2), insideHorizontal: none, insideVertical: none } }), spacer(200)];
}
function bullets(items) {
  return items.map(t => new Paragraph({ children: runs(t), numbering: { reference: 'dot', level: 0 }, spacing: { after: 80, line: 276 } })).concat([spacer(80)]);
}
const L = i => String.fromCharCode(97 + i);
function taskBlock(b) {
  const kids = [
    new Paragraph({ children: [new TextRun({ text: 'Aufgabe ' + b.n, font: FONT, size: 24, bold: true, color: C.hub })], spacing: { after: 60 }, keepNext: true }),
    P(b.intro, { after: 140, run: { size: 19, color: C.muted } })
  ];
  const iw = W - 440;
  if (b.ideas) kids.push(...b.ideas.map(t => new Paragraph({ children: runs(t, { size: 20 }), numbering: { reference: 'dot', level: 0 }, spacing: { after: 80, line: 276 } })));
  b.items.forEach((it, i) => {
    kids.push(new Paragraph({ children: [new TextRun({ text: L(i) + ')', font: FONT, size: 20, bold: true, color: C.hub }), new TextRun({ text: '\t', font: FONT }),
      ...(it.deep ? [new TextRun({ text: '* ', font: FONT, size: 20, bold: true, color: C.hub })] : []),
      ...(it.star ? [star(), new TextRun({ text: ' ', font: FONT, size: 20 })] : []), ...runs(it.text, { size: 20 })],
      tabStops: [{ type: TabStopType.LEFT, position: 400 }], indent: { left: 400, hanging: 400 }, spacing: { after: it.compare ? 80 : 110, line: 276 }, keepNext: !!it.compare }));
    if (it.compare) { kids.push(compareTable(it.compare[0], it.compare[1], iw)); kids.push(spacer(120)); }
  });
  const lg = [];
  if (b.items.some(x => x.deep)) lg.push(new TextRun({ text: '* nur mit tieferen SQL-Befehlen lösbar (Abschnitt 4)', font: FONT, size: 15, color: C.muted }));
  if (b.items.some(x => x.star)) { if (lg.length) lg.push(new TextRun({ text: '    ·    ', font: FONT, size: 15, color: C.muted })); lg.push(star(10), new TextRun({ text: ' zum Knobeln ', font: FONT, size: 15, color: C.muted })); }
  if (lg.length) kids.push(new Paragraph({ children: lg, alignment: AlignmentType.RIGHT, spacing: { after: 0 } }));
  return [tbl([new TableRow({ children: [cell(kids, { w: W, fill: 'FFFFFF', borders: { top: line(C.line2), bottom: line(C.line2), right: line(C.line2), left: { style: BorderStyle.SINGLE, size: 30, color: C.hub } }, margins: { top: 180, bottom: 160, left: 240, right: 240 } })] })], [W]), spacer(260)];
}
function tables2(b) {
  const mk = (t, w) => {
    const cw = Math.floor(w / t.head.length);
    return [label(t.title.toUpperCase(), C.ink), tbl([
      new TableRow({ children: t.head.map(h => cell([P(h, { after: 0, run: { size: 16, bold: true } })], { w: cw, fill: C.head, borders: { top: none, left: none, right: none, bottom: line(C.line2) }, margins: { top: 50, bottom: 50, left: 90, right: 90 } })) }),
      ...t.rows.map(r => new TableRow({ children: r.map(v => cell([P(v, { after: 0, run: { size: 17, font: MONO } })], { w: cw, borders: { top: none, left: none, right: none, bottom: line(C.line) }, margins: { top: 40, bottom: 40, left: 90, right: 90 } })) }))
    ], t.head.map(() => cw), { borders: { top: line(C.line2), bottom: line(C.line2), left: line(C.line2), right: line(C.line2), insideHorizontal: none, insideVertical: none } })];
  };
  const lw = 3600, rw = W - lw - 300;
  return [tbl([new TableRow({ children: [cell(mk(b.left, lw - 40), { w: lw, margins: { top: 0, bottom: 0, left: 0, right: 0 } }), cell([new Paragraph({ children: [] })], { w: 300 }), cell(mk(b.right, rw - 40), { w: rw, margins: { top: 0, bottom: 0, left: 0, right: 0 } })], cantSplit: true })], [lw, 300, rw]), spacer(200)];
}

/* ── Überschriften, Titelseite, Rahmen ───────────────────── */
const H1 = t => new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 40, bold: true, color: C.ink })], spacing: { before: 0, after: 260 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C.hub, space: 6 } }, outlineLevel: 0 });
const H2 = t => new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 30, bold: true, color: C.hub })], spacing: { before: 320, after: 140 }, keepNext: true, outlineLevel: 1 });
const H3 = t => new Paragraph({ children: [new TextRun({ text: t, font: FONT, size: 24, bold: true, color: C.ink })], spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 2 });

function titlePage(sub) {
  const t = (text, o) => new Paragraph({ children: [new TextRun({ text, font: FONT, ...o })], spacing: { after: 0 } });
  return [
    spacer(1400),
    t('INFORMATIK · QUALIFIKATIONSPHASE', { size: 20, bold: true, color: C.hub, characterSpacing: 40 }),
    spacer(200),
    t('DATENBANK', { size: 88, bold: true, color: C.ink }),
    t('SYSTEME', { size: 88, bold: true, color: C.hub }),
    spacer(160),
    t(sub, { size: 28, color: C.muted }),
    spacer(500),
    ...image('db_nm', 15.5),
    spacer(700),
    t('Sönke Birkner', { size: 24, bold: true, color: C.ink }),
    t('soenke.birkner@mps-ki.de', { size: 20, color: C.muted }),
    new Paragraph({ children: [new PageBreak()] })
  ];
}
const footer = (txt, nr = true) => new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: W }], border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.line, space: 6 } },
  children: [new TextRun({ text: txt, font: FONT, size: 15, color: C.muted }), ...(nr ? [new TextRun({ text: '\t', font: FONT }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 15, bold: true, color: C.hub })] : [])] })] });

function makeDoc(children, foot, { nr = true, title = true } = {}) {
  return new Document({
    creator: 'Sönke Birkner', title: 'Datenbanksysteme', description: 'Informatik Q-Phase mit YourSozialNet',
    styles: { default: { document: { run: { font: FONT, size: 21, color: C.ink } } } },
    numbering: { config: [{ reference: 'dot', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } }, run: { color: C.hub, bold: true } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, titlePage: title },
      footers: { default: footer(foot, nr), first: new Footer({ children: [new Paragraph({ children: [] })] }) }, children }]
  });
}

/* ── Skript ──────────────────────────────────────────────── */
function render(blocks, kids = []) {
for (const b of blocks) {
  if (b.t === 'title') kids.push(...titlePage('Relationale Datenbanken und SQL – mit YourSozialNet'));
  else if (b.t === 'h1') kids.push(H1(b.text));
  else if (b.t === 'h2') kids.push(H2(b.text));
  else if (b.t === 'h3') kids.push(H3(b.text));
  else if (b.t === 'p') kids.push(P(b.text));
  else if (b.t === 'list') kids.push(...bullets(b.items));
  else if (b.t === 'img') kids.push(...image(b.file, b.cm, b.caption));
  else if (b.t === 'float') kids.push(floatImage(b.file, b.cm));
  else if (b.t === 'side') kids.push(...sideBlock(b));
  else if (b.t === 'syntax') kids.push(...syntaxBlock(b));
  else if (b.t === 'code') kids.push(...codeBlock(b));
  else if (b.t === 'compare') { kids.push(P('**' + b.title + '**', { keepNext: true, after: 80 })); kids.push(compareTable(b.a.sql, b.b.sql, W, b.a.title, b.b.title)); kids.push(spacer(220)); }
  else if (b.t === 'box') kids.push(...boxBlock(b.kind, b.title, b.text));
  else if (b.t === 'table') kids.push(...plainTable(b.head, b.rows, b.widths));
  else if (b.t === 'tables2') kids.push(...tables2(b));
  else if (b.t === 'task') kids.push(...taskBlock(b));
  else if (b.t === 'page') kids.push(new Paragraph({ children: [new PageBreak()] }));
}
return kids;
}
const kids = render(DOC);
writeFileSync(OUT + '/Datenbanksysteme.docx', await Packer.toBuffer(makeDoc(kids, 'Datenbanksysteme · Informatik Q-Phase · YourSozialNet')));

/* ── Lösungen ────────────────────────────────────────────── */
const sol = [...titlePage('Lösungen und Hinweise für die Lehrkraft')];
sol.push(H1('Hinweise zum Einsatz'));
sol.push(...bullets([
  '**Reihenfolge der Tabellen** (Startseite der Lehrkraft → Tabellen für alle Netzwerke → Erstellen, danach „Füllen“): II.1 nur **users** · II.2 **photos** und **comments** · II.3 **tags** (bringt photo_tag mit), **follows** und **likes** · II.7 **sessions** und **views** · II.8 **ads**.',
  '**Daten neu füllen vor Kapitel 7:** In Kapitel 6 löschen die Schülerinnen und Schüler u. a. alle Minderjährigen (tim.richter, ida.hsn, lasse.ld …) und ändern Likes, Fotos und Passwörter. Vor Analytics deshalb **users → Leeren** und danach alles wieder **Füllen** (Leeren nimmt die abhängigen Tabellen mit).',
  '**Ergebnisse** wurden mit den Dummy-Daten gerechnet (Netzwerk „Liky“, Stichtag ' + DAY + '). Alle Zeiten (Alter, Registrierung, Posts) wachsen mit dem Raum mit – Aussagen wie „Erna ist 78“ oder „Noah wird morgen 18“ gelten an jedem Stichtag. Absolute Datumswerte unterscheiden sich.',
  '**Eigene Zeilen der Klasse** verändern einige Ergebnisse: Das eigene Admin-Konto ist die neueste Registrierung und hat die Rolle admin; eigene Posts sind die neuesten Fotos. Die eigene id ist in den Lösungen **71**.',
  '**E-Mail-Domain** = Name des Netzwerks, klein und ohne Sonderzeichen (hier `@liky.test`).',
  '**Klassen-Netz:** Für Aufgabe 12 und 13 c) brauchen die Gruppen dort Admin-Rechte: `UPDATE users SET role = \'admin\' WHERE username IN (…)`. Im Klassen-Netz gibt es keine Dummy-User, aber die Beispiel-Werbung.',
  '**Fehlermeldungen sind manchmal gewollt** (7 l, 10 a, 10 d): Sie sind in den Lösungen rot markiert.',
  '**\\*** an einer Teilaufgabe = nur mit den Befehlen aus Abschnitt 4 (Tiefer in SQL) lösbar; Stern = zum Knobeln (freiwillig, schwerer).'
]));
sol.push(new Paragraph({ children: [new PageBreak()] }));
for (const b of DOC) {
  if (b.t !== 'task') continue;
  sol.push(H2('Aufgabe ' + b.n));
  if (b.open) sol.push(P('*Offene Aufgabe – jede und jeder findet etwas anderes. Beispiele für mögliche Befehle:*', { run: { size: 18, color: C.muted } }));
  if (b.note) sol.push(...boxBlock('loes', '', [b.note]));
  (b.open ? b.examples : b.items).forEach((it, i) => {
    sol.push(new Paragraph({ children: [new TextRun({ text: L(i) + ')', font: FONT, size: 20, bold: true, color: C.hub }), new TextRun({ text: '\t' }), ...(it.star ? [star(12), new TextRun({ text: ' ' })] : []), ...runs(it.text, { size: 18, color: C.muted })],
      tabStops: [{ type: TabStopType.LEFT, position: 400 }], indent: { left: 400, hanging: 400 }, spacing: { before: 120, after: 80 }, keepNext: true }));
    if (it.deep) sol.push(P('*braucht Abschnitt 4 (Tiefer in SQL)*', { run: { size: 15, color: C.hub }, indent: { left: 400 }, after: 60 }));
    const sqls = it.sol ? [].concat(it.sol) : [];
    const res = sqls.length ? exec(sqls, it.pre) : [];
    if (it.pre) sol.push(P('*Vorher angenommen:* `' + it.pre + '`', { run: { size: 16, color: C.muted }, indent: { left: 400 }, after: 60 }));
    sqls.forEach((s, j) => {
      sol.push(tbl([new TableRow({ children: [codeCard(pretty(s), sqls.length > 1 ? 'Befehl ' + (j + 1) : null, W - 400, 17)], cantSplit: true })], [W - 400], { align: AlignmentType.RIGHT }));
      sol.push(...resultBlock(res[j], { w: W - 400, maxRows: 3 }).map(x => x));
    });
    if (!sqls.length) sol.push(P('*Offene Aufgabe – keine feste Lösung.*', { run: { size: 18, color: C.muted }, indent: { left: 400 } }));
    if (it.note) sol.push(...boxBlock('loes', '', [it.note], W - 400).map((x, k) => k === 0 ? tbl([new TableRow({ children: [cell([], { w: 400 }), cell([x], { w: W - 400, margins: { top: 0, bottom: 0, left: 0, right: 0 } })] })], [400, W - 400]) : x));
  });
}
writeFileSync(OUT + '/Datenbanksysteme_Loesungen.docx', await Packer.toBuffer(makeDoc(sol, 'Datenbanksysteme · Lösungen · nur für Lehrkräfte')));

/* ── Bausteine fürs Arbeitsmaterial ──────────────────────────
   material/ wird veröffentlicht (Vercel), arbeitsblatt/ nicht. Dort liegen:
   Skript (Word + PDF), teile/*.pdf (ohne Seitenzahlen – die stempelt die
   Seite beim Zusammensetzen neu), material.json und das Lösungsheft (PDF).
   Die PDFs macht LibreOffice. Damit sie wie in Word umbrechen, braucht es
   die Ersatzschrift für Consolas (schrift.py) – sonst bricht der Bau ab. */
const FOOT = 'Datenbanksysteme · Informatik Q-Phase · YourSozialNet';
const MAT = new URL('../material/', import.meta.url).pathname;
if (!process.argv.includes('--ohne-teile')) {
  const cons = execFileSync('fc-match', ['Consolas'], { encoding: 'utf8' });
  if (!/"Consolas"/.test(cons)) { console.error('Consolas fehlt für LibreOffice (' + cons.trim() + '). Erst: python3 ' + new URL('./schrift.py', import.meta.url).pathname); process.exit(1); }
  const seg = {}; let cur = null;
  for (const b of DOC) { if (b.t === 'teil') { cur = b.id; seg[cur] = []; continue; } if (cur) seg[cur].push(b); }
  const lead = bl => { const x = bl.slice(); while (x.length && x[0].t === 'page') x.shift(); return x; };
  const tmp = mkdtempSync(tmpdir() + '/dbs-teile-');
  const docs = {
    deckblatt: makeDoc(titlePage('Relationale Datenbanken und SQL – mit YourSozialNet').slice(0, -1), FOOT, { nr: false, title: true })
  };
  const IT = TEILE.filter(t => t.kap === 'I');
  IT.forEach((t, k) => { docs['I-stand' + (k + 1)] = makeDoc(render(lead(IT.slice(0, k + 1).flatMap(x => seg[x.id]))), FOOT, { nr: false, title: false }); });
  for (const t of TEILE.filter(t => t.kap === 'II')) docs[t.id] = makeDoc(render(lead(seg[t.id])), FOOT, { nr: false, title: false });
  for (const [k, d] of Object.entries(docs)) writeFileSync(tmp + '/' + k + '.docx', await Packer.toBuffer(d));
  copyFileSync(OUT + '/Datenbanksysteme.docx', tmp + '/Datenbanksysteme.docx');
  const pdf = (files, outdir) => execFileSync('soffice', ['-env:UserInstallation=file://' + tmp + '/lo', '--headless', '--convert-to', 'pdf', '--outdir', outdir, ...files],
    { env: { ...process.env, SAL_USE_VCLPLUGIN: 'svp' }, stdio: 'ignore', timeout: 600000 });
  rmSync(MAT + 'teile', { recursive: true, force: true });
  mkdirSync(MAT + 'teile', { recursive: true });
  pdf(Object.keys(docs).map(k => tmp + '/' + k + '.docx'), MAT + 'teile');
  pdf([tmp + '/Datenbanksysteme.docx'], MAT);
  copyFileSync(OUT + '/Datenbanksysteme.docx', MAT + 'Datenbanksysteme.docx');
  const pages = f => { const b = readFileSync(f, 'latin1'); return (b.match(/\/Type\s*\/Page[^s]/g) || []).length; };
  const hash = f => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 10);
  const teile = readdirSync(MAT + 'teile').filter(f => f.endsWith('.pdf'));
  const manifest = {
    titel: 'Datenbanksysteme', untertitel: 'Relationale Datenbanken und SQL – mit YourSozialNet', fuss: FOOT,
    erstellt: new Date().toISOString().slice(0, 10),
    dateien: { word: 'Datenbanksysteme.docx', pdf: 'Datenbanksysteme.pdf' },
    loesungen: 'Datenbanksysteme_Loesungen.pdf',
    deckblatt: 'teile/deckblatt.pdf',
    staende: IT.map((t, k) => ({ id: t.id, label: t.label, datei: 'teile/I-stand' + (k + 1) + '.pdf', seiten: pages(MAT + 'teile/I-stand' + (k + 1) + '.pdf') })),
    teile: TEILE.filter(t => t.kap === 'II').map(t => ({ ...t, datei: 'teile/' + t.id + '.pdf', seiten: pages(MAT + 'teile/' + t.id + '.pdf') })),
    stufen: STUFEN,
    version: hash(MAT + 'Datenbanksysteme.pdf') + '.' + teile.map(f => hash(MAT + 'teile/' + f)).join('').slice(0, 10)
  };
  writeFileSync(MAT + 'material.json', JSON.stringify(manifest, null, 2) + '\n');
  // Lösungsheft als PDF – liegt neben dem Skript (Sönke 09.11.2026: kein Hochladen, PDF reicht)
  copyFileSync(OUT + '/Datenbanksysteme_Loesungen.docx', tmp + '/Datenbanksysteme_Loesungen.docx');
  pdf([tmp + '/Datenbanksysteme_Loesungen.docx'], MAT);
  rmSync(OUT + '/Datenbanksysteme_Loesungen.pdf', { force: true });
  rmSync(tmp, { recursive: true, force: true });
  console.log('Teile:', manifest.staende.map(x => x.id + ' ' + x.seiten + ' S.').join(', '), '|', manifest.teile.map(x => x.id + ' ' + x.seiten).join(', '));
}
console.log('fertig');
