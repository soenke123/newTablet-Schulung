import { pageTransform } from './annotations.js';

/**
 * PDF → Word (.docx), pure and DOM-free. app.js reads text items, font names and images with PDF.js and hands them
 * to `layoutPage()`, which rebuilds lines, paragraphs, headings, indents and alignment from the positions;
 * `buildDocx()` writes the pages as one Word section each (own page size and margins) into a ZIP.
 * That is the mode „Fließtext“ (editable text, not a copy of the layout). The mode „Wie im PDF“ (`layoutFixed()`) keeps
 * the look instead: the page without its text is a picture behind the text, the text sits on top in text boxes at the
 * places and with the line breaks of the PDF.
 */

const PT_TWIP = 20, PT_EMU = 12700;
const BULLET = /^\s*([•●▪■◦○‣–\-*]|\d{1,3}[.)]|[a-z][.)])\s/i;
const FAMILIES = [
  [/^(arial|helvetica|liberationsans|arimo|nimbussans)/i, 'Arial'],
  [/^(times|liberationserif|tinos|nimbusrom)/i, 'Times New Roman'],
  [/^(courier|liberationmono|cousine|nimbusmon)/i, 'Courier New'],
  [/^(carlito|calibri)/i, 'Calibri'],
  [/^(caladea|cambria)/i, 'Cambria'],
];

// Symbol/Wingdings bullets as Word writes them into PDFs (private use area) → ordinary characters.
const SYMBOLS = { '\uf0b7': '•', '\uf0a7': '▪', '\uf06e': '■', '\uf0d8': '➢', '\uf0fc': '✓', '\uf076': '❖', '\uf0a8': '□', '\uf02d': '–', '\uf0e0': '→' };
const SYMBOL_RE = new RegExp(`[${Object.keys(SYMBOLS).join('')}]`, 'g');

/**
 * Page rotation that makes most of the text upright (0/90/180/270), so a sideways page still gives normal lines;
 * `fallback` (the page's rotation as shown) when there is no text.
 */
export function uprightRotation(items, fallback = 0) {
  const weight = [0, 0, 0, 0];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [a, b] = item.transform;
    const quarter = Math.abs(a) >= Math.abs(b) ? (a >= 0 ? 0 : 2) : (b > 0 ? 1 : 3);
    weight[quarter] += item.str.length;
  }
  const best = weight.indexOf(Math.max(...weight));
  return weight[best] ? best * 90 : fallback;
}

/**
 * `ABCDEF+TimesNewRomanPS-BoldItalicMT` → {family:'Times New Roman', bold:true, italic:true}. `anon` = the name says
 * nothing (`CIDFont+F1`, PDF.js `g_d0_f1`): no family, bold is guessed per page (guessBold).
 */
export function fontStyle(psName = '', fallback = {}) {
  const name = String(psName || '').replace(/^[^+]*\+/, '');
  const [base, ...rest] = name.split(/[-,]/);
  const style = rest.join('-') + ' ' + base;
  const bold = fallback.bold || /bold|black|heavy|semibold|demi/i.test(style);
  const italic = fallback.italic || /italic|oblique|kursiv/i.test(style);
  const plain = base.replace(/(PSMT|PS|MT)$/, '').replace(/(Bold|Italic|Oblique|Regular|Black|Heavy|Medium|Light)+$/i, '');
  const known = FAMILIES.find(([pattern]) => pattern.test(plain));
  const anon = plain.length < 2 || /^(g_d\d+_f\d+|f\d+|t3font_\d+)$/i.test(plain);
  const family = known ? (known[1] === 'Arial' && /black/i.test(style) ? 'Arial Black' : known[1]) : anon ? '' : plain.replace(/([a-z])([A-Z])/g, '$1 $2');
  return { family, bold, italic, anon };
}

const median = values => { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * One page → `{width, height, margins:{top,right,bottom,left}, blocks, text}` in pt, upright as `rotation` turns it.
 * `items`: PDF.js text items, `fonts`: Map fontName → {name, bold?, italic?} (PDF.js commonObjs), `box` as in pageSizes,
 * `images`: [{x0, y0, x1, y1 (PDF user space), ref}] – ref is passed through to the image block.
 * Blocks: {type:'p', runs:[{text, size, bold, italic, family}], heading 0..3, align, indent, firstLine, before, line},
 * {type:'image', ref, width, height, align, indent} and {type:'table', widths, indent, rows:[[runs]], header}.
 */
export function layoutPage({ items = [], fonts = new Map(), box, rotation = 0, images = [] }) {
  const map = pageTransform(box, rotation, 1);
  const turn = ((rotation % 360) + 360) % 360;
  const width = turn % 180 ? box.height : box.width, height = turn % 180 ? box.width : box.height;
  const content = readSegments(items, fonts, map).filter(s => s.text.trim());
  guessBold(content);
  const left = content.length ? Math.min(...content.map(l => l.x)) : 72;
  const right = content.length ? Math.max(...content.map(l => l.right)) : width - 72;
  const top = content.length ? Math.min(...content.map(l => l.baseline - l.size)) : 72;
  const bottom = content.length ? Math.max(...content.map(l => l.baseline + l.size * 0.3)) : height - 72;
  const pics = images.map(img => {
    const [ax, ay] = map.toView(img.x0, img.y0), [bx, by] = map.toView(img.x1, img.y1);
    return { ref: img.ref, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }).filter(p => p.w >= 12 && p.h >= 12 && !(content.length && p.w * p.h > width * height * 0.6));
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
  const imgLeft = pics.length ? Math.min(...pics.map(p => p.x)) : Infinity, imgRight = pics.length ? Math.max(...pics.map(p => p.x + p.w)) : -Infinity;
  const margins = {
    left: clamp(Math.min(left, imgLeft), 28, 100), right: clamp(width - Math.max(right, imgRight), 28, 100),
    top: clamp(Math.min(top, ...pics.map(p => p.y)) - 4, 20, 100), bottom: clamp(height - bottom - 8, 20, 90),
  };
  const textLeft = margins.left, textRight = width - margins.right;
  const tables = findTables(content, textLeft, textRight);
  const inTable = new Set(tables.flatMap(t => t.segs));
  const lines = mergeRows(content.filter(s => !inTable.has(s)));
  const body = bodySize(content);
  // Pictures and tables are placed before the first paragraph that starts below them.
  const floats = [
    ...pics.map(p => {
      const centre = p.x + p.w / 2;
      const align = Math.abs(centre - (textLeft + textRight) / 2) < 24 && p.x > textLeft + 12 ? 'center' : p.x + p.w > textRight - 12 && p.x > textLeft + 24 ? 'right' : 'left';
      return { top: p.y, bottom: p.y + p.h, block: { type: 'image', ref: p.ref, width: p.w, height: p.h, align, indent: align === 'left' ? Math.max(0, p.x - textLeft) : 0 } };
    }),
    ...tables.map(t => ({ top: t.top, bottom: t.bottom, block: { type: 'table', widths: t.widths, indent: Math.max(0, t.x - textLeft), rows: t.rows, header: t.header } })),
  ].sort((a, b) => a.top - b.top);
  const blocks = [];
  let prevBottom = null;
  const placeFloats = until => {
    while (floats.length && floats[0].top < until) {
      const f = floats.shift();
      blocks.push(f.block);
      prevBottom = f.bottom;
    }
  };
  for (const para of groupParagraphs(lines)) {
    const first = para[0], last = para[para.length - 1];
    placeFloats(first.baseline - first.size);
    const size = median(para.map(l => l.size));
    const runs = joinLines(para);
    const text = runs.map(r => r.text).join('');
    const allBold = runs.every(r => r.bold || !r.text.trim());
    const ratio = body ? size / body : 1;
    const heading = text.length > 160 ? 0 : ratio >= 1.6 ? 1 : ratio >= 1.25 ? 2 : allBold && ratio >= 1.08 ? 3 : 0;
    const contX = para.length > 1 ? median(para.slice(1).map(l => l.x)) : first.x;
    const centred = para.every(l => Math.abs((l.x + l.right) / 2 - (textLeft + textRight) / 2) < Math.max(12, l.size)) && first.x > textLeft + 2 * size;
    const rightAligned = !centred && para.every(l => Math.abs(l.right - textRight) < size) && first.x > textLeft + (textRight - textLeft) * 0.4;
    const gap = para.length > 1 ? median(para.slice(1).map((l, i) => l.baseline - para[i].baseline)) : 0;
    // A block of lines far to the right is a second column, not an indent: it starts at the margin in Word.
    const column = para.length > 1 && contX - textLeft > (textRight - textLeft) * 0.35;
    blocks.push({
      type: 'p', runs, heading,
      align: centred ? 'center' : rightAligned ? 'right' : 'left',
      indent: centred || rightAligned || column ? 0 : Math.max(0, Math.round(contX - textLeft)),
      firstLine: centred || rightAligned ? 0 : Math.round(first.x - contX),
      before: prevBottom == null ? 0 : Math.round(Math.min(36, Math.max(0, first.baseline - first.size - prevBottom - size * 0.35))),
      line: gap > 0 ? Math.round(Math.min(2.5, Math.max(1, gap / (size * 1.17))) * 20) / 20 : 1,
    });
    prevBottom = last.baseline + last.size * 0.3;
  }
  placeFloats(Infinity);
  return { width, height, margins, blocks, text: content.length > 0 };
}

/**
 * „Wie im PDF“: one page → `{width, height, fixed:true, background, boxes, text}`. Lines that continue each other (same x,
 * even spacing, same size) form one text box `{x, y, width, height, line, lines:[runs]}` in pt from the upper-left corner;
 * every PDF line stays a line (paragraph) of its own, so the text lands where it was. `items` may carry `color` (hex).
 */
export function layoutFixed({ items = [], fonts = new Map(), box, rotation = 0, background = null }) {
  const map = pageTransform(box, rotation, 1);
  const turn = ((rotation % 360) + 360) % 360;
  const width = turn % 180 ? box.height : box.width, height = turn % 180 ? box.width : box.height;
  const segs = readSegments(items, fonts, map).filter(s => s.text.trim());
  guessBold(segs);
  const groups = [];
  let cur = null;
  for (const s of segs) {
    const prev = cur?.lines[cur.lines.length - 1];
    const gap = prev ? s.baseline - prev.baseline : 0;
    const size = prev ? Math.max(s.size, prev.size) : s.size;
    const follows = prev && !s.joined && Math.abs(s.x - cur.x) < Math.max(2, s.size * 0.3) && gap > size * 0.8 && gap < size * 1.7
      && Math.abs(s.size - prev.size) < Math.min(s.size, prev.size) * 0.2 && (cur.gap == null || Math.abs(gap - cur.gap) < size * 0.15);
    if (follows) { cur.lines.push(s); cur.gap ??= gap; } else groups.push(cur = { x: s.x, lines: [s], gap: null });
  }
  const boxes = groups.map(g => {
    const size = Math.max(...g.lines.map(l => l.size));
    const line = g.gap ?? size * 1.2;
    const right = Math.max(...g.lines.map(l => l.right));
    const lines = g.lines.map(l => l.runs.map((r, i) => ({ ...r, text: i === l.runs.length - 1 ? r.text.replace(/\s+$/, '') : r.text })).filter(r => r.text));
    // Word puts the baseline of a line with exact spacing about one descent (≈ 0.22 em) above the bottom of the line.
    return { x: g.x, y: g.lines[0].baseline - line + size * 0.22, width: (right - g.x) * 1.15 + size, height: line * g.lines.length + size * 0.2, line, lines };
  });
  return { width, height, fixed: true, background, boxes, margins: { top: 14, right: 14, bottom: 14, left: 14 }, text: segs.length > 0 };
}

const LIST_MARK = /^\s*([•●▪■◦○‣–\-*]|\d{1,3}[.)]|[a-z][.)])\s*$/i;

/**
 * Text items → segments in view space: {x, right, baseline, size, runs, text, joined}. A segment ends at hasEOL, a jump
 * in y, a step back to the left or a wide gap (≥ 1.4 em, e.g. between table cells); after a gap `joined` is true.
 */
function readSegments(items, fonts, map) {
  const segs = [];
  let seg = null;
  const tracking = letterSpacing(items);
  for (const [index, item] of items.entries()) {
    if (typeof item.str !== 'string') continue;
    const t = item.transform;
    const size = Math.hypot(t[2], t[3]) || item.height || 10;
    const dir = Math.hypot(t[0], t[1]) || 1;
    const [x, baseline] = map.toView(t[4], t[5]);
    const [ex] = map.toView(t[4] + item.width * t[0] / dir, t[5] + item.width * t[1] / dir);
    // PDF.js fills gaps with whitespace items that may reach into the next column: they only mean "space here".
    if (!item.str.trim()) { if (seg && item.str) seg.space = true; }
    else {
      const tol = Math.max(size, seg?.size || 0) * 0.5;
      const gap = seg ? x - seg.right : 0;
      const sameLine = seg && Math.abs(baseline - seg.baseline) <= tol && x >= seg.right - Math.max(size, seg.size);
      const wide = sameLine && gap > Math.max(size, seg.size) * 1.4 && !LIST_MARK.test(seg.text);
      if (!sameLine || wide) {
        seg = { x, right: x, baseline, size, runs: [], text: '', joined: !!wide };
        segs.push(seg);
      }
      const font = fonts.get(item.fontName) || {};
      const style = fontStyle(font.name, font);
      let str = item.str.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
      const plain = str.replace(SYMBOL_RE, c => SYMBOLS[c]);
      if (plain !== str) { str = plain; style.family = ''; }
      if (seg.text && (seg.space || x - seg.right > size * 0.18 + (tracking.get(index) || 0)) && !/\s$/.test(seg.text) && !/^\s/.test(str)) str = ' ' + str;
      seg.space = false;
      if (str) {
        const run = { text: str, size: Math.round(size * 2) / 2, bold: style.bold, italic: style.italic, family: style.family, font: item.fontName, anon: style.anon, color: item.color || '', ink: item.ink, chars: str.length };
        const prev = seg.runs[seg.runs.length - 1];
        if (prev && sameStyle(prev, run) && prev.font === run.font) prev.text += str; else seg.runs.push(run);
        seg.text += str;
      }
      seg.right = Math.max(seg.right, Math.max(x, ex));
      if (Math.abs(baseline - seg.baseline) < 0.5 && size > seg.size) seg.size = size;
    }
    if (item.hasEOL) seg = null;
  }
  return segs;
}

/**
 * Letter-spaced text (S P A C E D  titles) comes as single characters with small gaps; there a gap only means a space
 * when it is clearly wider than the usual one between the letters. Returns Map item index → extra gap tolerance in pt.
 */
function letterSpacing(items) {
  const extra = new Map();
  let chain = [];
  const flush = () => {
    if (chain.length >= 4) {
      const gaps = chain.slice(1).map((c, k) => c.x - chain[k].end).sort((a, b) => a - b);
      const usual = gaps[Math.floor(gaps.length / 2)];
      if (usual > 0) chain.forEach(c => extra.set(c.index, usual));
    }
    chain = [];
  };
  items.forEach((item, index) => {
    const str = item.str?.trim() || '';
    if (str.length !== 1 || item.str.length !== 1) { if (str) flush(); return; }
    const t = item.transform, prev = chain[chain.length - 1];
    if (prev && (Math.abs(t[5] - prev.y) > 0.5 || t[4] < prev.end)) flush();
    chain.push({ index, x: t[4], end: t[4] + item.width, y: t[5] });
  });
  flush();
  return extra;
}

const sameStyle = (a, b) => a.bold === b.bold && a.italic === b.italic && a.family === b.family && (a.color || '') === (b.color || '') && Math.abs(a.size - b.size) < 0.6;

/**
 * Fonts without a usable name (Chrome/Skia print `CIDFont+F1`, `F2` …) give no hint at bold. On such pages the font with
 * most characters is the regular one; other unnamed fonts mixed into the same lines or used for larger text count as bold.
 */
function guessBold(segs) {
  const count = new Map(), ink = new Map();
  for (const s of segs) for (const r of s.runs) if (r.anon) {
    count.set(r.font, (count.get(r.font) || 0) + r.text.length);
    if (r.ink > 0) { const [sum, n] = ink.get(r.font) || [0, 0]; ink.set(r.font, [sum + r.ink * r.chars, n + r.chars]); }
  }
  if (count.size < 2) return;
  const regular = [...count].sort((a, b) => b[1] - a[1])[0][0];
  // With the rendered page (mode „Wie im PDF“) the share of dark pixels tells: bold fonts carry clearly more ink, italics do not.
  const inkOf = font => { const v = ink.get(font); return v ? v[0] / v[1] : 0; };
  const base = inkOf(regular);
  for (const s of segs) for (const r of s.runs) if (r.anon && r.font !== regular && !r.italic) r.bold = base && inkOf(r.font) ? inkOf(r.font) > base * 1.35 : true;
}

/** Font size most of the characters have (the body text). */
function bodySize(lines) {
  const count = new Map();
  for (const l of lines) for (const r of l.runs) count.set(r.size, (count.get(r.size) || 0) + r.text.length);
  let best = 0, most = -1;
  for (const [size, n] of count) if (n > most) { best = size; most = n; }
  return best;
}

/**
 * Tables: rows of segments that start at the same x positions (columns) and stay inside their column. A wrapped cell
 * continues in the lines below; a new row starts after a larger gap (> 1.55 em) and needs at least two cells.
 * Returns [{segs, x, top, bottom, widths, rows:[[runs per column]], header}].
 */
function findTables(segs, textLeft, textRight) {
  const sorted = [...segs].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const groups = [];
  for (const s of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(s.baseline - g.baseline) < Math.max(s.size, g.size) * 0.4) g.segs.push(s);
    else groups.push({ baseline: s.baseline, size: s.size, segs: [s] });
  }
  groups.forEach(g => { g.segs.sort((a, b) => a.x - b.x); g.size = Math.max(...g.segs.map(s => s.size)); });
  const tables = [];
  for (let i = 0; i < groups.length;) {
    const start = groups[i];
    if (start.segs.length < 2) { i++; continue; }
    const cols = start.segs.map(s => s.x);
    const tol = Math.max(4, start.size * 0.6);
    const column = s => cols.findIndex((x, c) => Math.abs(s.x - x) <= tol && s.right <= (c + 1 < cols.length ? cols[c + 1] : textRight + 72) + tol);
    if (start.segs.some(s => column(s) < 0) || new Set(start.segs.map(column)).size !== start.segs.length) { i++; continue; }
    const region = [start];
    let j = i + 1;
    while (j < groups.length) {
      const g = groups[j], gap = g.baseline - region[region.length - 1].baseline;
      if (gap > g.size * 3.5 || g.segs.some(s => column(s) < 0)) break;
      if (gap > g.size * 1.55 && g.segs.length < 2) break;
      region.push(g);
      j++;
    }
    const rows = [];
    region.forEach((g, k) => {
      if (!k || g.baseline - region[k - 1].baseline > g.size * 1.55) rows.push(cols.map(() => []));
      for (const s of g.segs) rows[rows.length - 1][column(s)].push(s);
    });
    if (rows.length < 2 || region.filter(g => g.segs.length > 1).length < 2) { i++; continue; }
    const all = region.flatMap(g => g.segs);
    const lastRight = Math.max(...all.filter(s => column(s) === cols.length - 1).map(s => s.right));
    const pad = Math.max(3, Math.min(8, (cols[1] - cols[0]) * 0.05));
    const x = cols[0] - pad, end = Math.min(textRight, Math.max(lastRight + pad, x + 40 * cols.length));
    const widths = cols.map((c, k) => (k + 1 < cols.length ? cols[k + 1] : end + pad) - (k ? c : x));
    const cells = rows.map(row => row.map(list => list.length ? joinLines(list) : []));
    tables.push({
      segs: all, x, widths, rows: cells,
      top: region[0].baseline - region[0].size, bottom: region[region.length - 1].baseline + region[region.length - 1].size * 0.3,
      header: cells[0].every(c => c.length && c.every(r => r.bold || !r.text.trim())),
    });
    i = j;
  }
  return tables;
}

/** Segments that were split at a wide gap but are no table go back into their line, separated by a tab. */
function mergeRows(segs) {
  const lines = [];
  for (const s of segs) {
    const prev = lines[lines.length - 1];
    if (s.joined && prev && Math.abs(s.baseline - prev.baseline) < s.size * 0.5 && s.x > prev.right) {
      const tab = { ...prev.runs[prev.runs.length - 1], text: '\t' };
      lines[lines.length - 1] = { ...prev, right: s.right, runs: [...prev.runs, tab, ...s.runs], text: prev.text + '\t' + s.text, size: Math.max(prev.size, s.size) };
    } else lines.push(s);
  }
  return lines;
}

/** Lines (in content order) → paragraphs. Breaks at larger gaps, size/weight changes, list items, indents and lines that end early. */
function groupParagraphs(lines) {
  const colRight = l => Math.max(...lines.filter(o => o.text.trim() && Math.abs(o.x - l.x) < Math.max(o.size, l.size) * 3).map(o => o.right));
  const weight = l => l.runs.filter(r => r.text.trim()).every(r => r.bold);
  const paragraphs = [];
  let para = null;
  for (const line of lines) {
    const prev = para?.[para.length - 1];
    let start = !prev;
    if (prev) {
      const size = Math.max(prev.size, line.size);
      const gap = line.baseline - prev.baseline;
      const usual = para.length > 1 ? para[para.length - 1].baseline - para[para.length - 2].baseline : size * 1.5;
      const cont = para.length > 1 ? para[1].x : null;
      start = gap <= 0 || gap > Math.max(usual * 1.3, size * 1.1) && gap > size * 1.55 || gap > size * 2.6
        || Math.abs(line.size - prev.size) > Math.min(line.size, prev.size) * 0.15
        || weight(line) !== weight(prev)
        || BULLET.test(line.text)
        || prev.right < colRight(prev) - size * 4
        || (cont != null ? Math.abs(line.x - cont) > size : line.x > prev.x + size && !BULLET.test(prev.text) || line.x < prev.x - size * 3);
    }
    if (start) paragraphs.push(para = [line]); else para.push(line);
  }
  return paragraphs;
}

/** Lines of one paragraph → runs; a line break becomes a space, a hyphen before a lowercase word joins the halves. */
function joinLines(lines) {
  const runs = [];
  lines.forEach((line, i) => {
    line.runs.forEach((r, k) => {
      let text = r.text;
      if (k === line.runs.length - 1 && i < lines.length - 1) {
        const next = lines[i + 1].text.trimStart();
        if (/[a-zäöüß][-­]$/.test(text) && /^[a-zäöüß]/.test(next)) text = text.slice(0, -1);
        else if (text.endsWith('­')) text = text.slice(0, -1);
        else if (!/\s$/.test(text)) text += ' ';
      }
      if (i === lines.length - 1 && k === line.runs.length - 1) text = text.replace(/\s+$/, '');
      if (i === 0 && k === 0) text = text.replace(/^\s+/, '');
      const prev = runs[runs.length - 1];
      const run = { ...r, text };
      if (prev && sameStyle(prev, run)) prev.text += text; else if (text) runs.push(run);
    });
  });
  return runs;
}

// ---------- DOCX writing ----------

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const escapeXml = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const twip = pt => Math.round(pt * PT_TWIP);

function runXml(r, heading) {
  const props = [
    r.family ? `<w:rFonts w:ascii="${escapeXml(r.family)}" w:hAnsi="${escapeXml(r.family)}" w:cs="${escapeXml(r.family)}"/>` : '',
    r.bold ? '<w:b/><w:bCs/>' : heading ? '<w:b w:val="0"/><w:bCs w:val="0"/>' : '', r.italic ? '<w:i/><w:iCs/>' : '',
    /^#?[0-9a-f]{6}$/i.test(r.color || '') ? `<w:color w:val="${r.color.replace('#', '').toUpperCase()}"/>` : '',
    r.size ? `<w:sz w:val="${Math.max(2, Math.round(r.size * 2))}"/><w:szCs w:val="${Math.max(2, Math.round(r.size * 2))}"/>` : '',
  ].join('');
  const parts = r.text.split('\t').map(t => t ? `<w:t xml:space="preserve">${escapeXml(t)}</w:t>` : '');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.join('<w:tab/>')}</w:r>`;
}

function sectionXml(page, last) {
  const { width, height, margins: m } = page;
  return `<w:sectPr><w:pgSz w:w="${twip(width)}" w:h="${twip(height)}"${width > height ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${twip(m.top)}" w:right="${twip(m.right)}" w:bottom="${twip(m.bottom)}" w:left="${twip(m.left)}" w:header="0" w:footer="0" w:gutter="0"/>${last ? '' : '<w:type w:val="nextPage"/>'}</w:sectPr>`;
}

function imageXml(block, rel, id, maxW, maxH) {
  const scale = Math.min(1, maxW / block.width, maxH / block.height);
  const cx = Math.round(block.width * scale * PT_EMU), cy = Math.round(block.height * scale * PT_EMU);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Bild ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="bild${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const emu = pt => Math.round(pt * PT_EMU);

// A drawing at a fixed place on the page (not in the text flow); behind = under the text.
function anchorXml(id, z, x, y, w, h, behind, graphic) {
  return `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${z}" behindDoc="${behind ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(y)}</wp:posOffset></wp:positionV><wp:extent cx="${emu(w)}" cy="${emu(h)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${behind ? 'Seitenbild' : 'Textfeld'} ${id}"/><wp:cNvGraphicFramePr/>${graphic}</wp:anchor>`;
}

function backgroundXml(page, rel, id) {
  const pic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="seite${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(page.width)}" cy="${emu(page.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  return `<w:r><w:drawing>${anchorXml(id, 1, 0, 0, page.width, page.height, true, pic)}</w:drawing></w:r>`;
}

function textBoxXml(box, id, z) {
  const lines = box.lines.map(runs => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.max(20, twip(box.line))}" w:lineRule="exact"/></w:pPr>${runs.map(r => runXml(r)).join('')}</w:p>`).join('');
  const shape = `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx><w:txbxContent>${lines}</w:txbxContent></wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic>`;
  return `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>${anchorXml(id, z, box.x, box.y, box.width, box.height, false, shape)}</w:drawing></mc:Choice></mc:AlternateContent></w:r>`;
}

const BORDER = 'w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"';

function tableXml(block, maxW) {
  const total = block.widths.reduce((a, b) => a + b, 0);
  const indent = Math.min(block.indent || 0, Math.max(0, maxW - total));
  const scale = Math.min(1, (maxW - indent) / total);
  const widths = block.widths.map(w => twip(w * scale));
  const cell = (runs, k, header) => `<w:tc><w:tcPr><w:tcW w:w="${widths[k]}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${runs.map(r => runXml(header ? { ...r, bold: true } : r)).join('')}</w:p></w:tc>`;
  const rows = block.rows.map((row, i) => `<w:tr>${i === 0 && block.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row.map((runs, k) => cell(runs, k, i === 0 && block.header)).join('')}</w:tr>`);
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${indent > 1 ? `<w:tblInd w:w="${twip(indent)}" w:type="dxa"/>` : ''}<w:tblBorders><w:top ${BORDER}/><w:left ${BORDER}/><w:bottom ${BORDER}/><w:right ${BORDER}/><w:insideH ${BORDER}/><w:insideV ${BORDER}/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}

/**
 * Pages from layoutPage or layoutFixed → .docx bytes. `images`: Map ref → {data: Uint8Array, type: 'png'|'jpeg'}; image blocks whose ref
 * is missing are left out. Each page is its own section, so page size and margins follow the PDF and every PDF page
 * starts a new Word page.
 */
export function buildDocx(pages, images = new Map(), { title = '' } = {}) {
  const media = [], rels = new Map();
  let drawingId = 0;
  const body = [];
  const relOf = ref => {
    const img = images.get(ref);
    if (!img) return null;
    if (!rels.has(ref)) {
      const name = `bild${media.length + 1}.${img.type === 'jpeg' ? 'jpeg' : 'png'}`;
      media.push({ name, data: img.data });
      rels.set(ref, { id: `rIdImg${media.length}`, name });
    }
    return rels.get(ref).id;
  };
  pages.forEach((page, pi) => {
    const last = pi === pages.length - 1;
    if (page.fixed) {
      // One paragraph carries the page picture (behind) and the text boxes; the section break makes the next page.
      const rel = page.background && relOf(page.background);
      const drawings = [rel ? backgroundXml(page, rel, ++drawingId) : '', ...page.boxes.map((b, i) => textBoxXml(b, ++drawingId, 2 + i))];
      body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${last ? '' : sectionXml(page, false)}</w:pPr>${drawings.join('')}</w:p>`);
      if (last) body.push(sectionXml(page, true));
      return;
    }
    const maxW = page.width - page.margins.left - page.margins.right, maxH = page.height - page.margins.top - page.margins.bottom - 4;
    const paras = [];
    for (const block of page.blocks) {
      const ppr = [];
      if (block.type === 'image') {
        const rel = relOf(block.ref);
        if (!rel) continue;
        if (block.align !== 'left') ppr.push(`<w:jc w:val="${block.align}"/>`);
        else if (block.indent > 1) ppr.push(`<w:ind w:left="${twip(Math.min(block.indent, Math.max(0, maxW - block.width)))}"/>`);
        paras.push({ ppr: '<w:spacing w:before="0" w:after="120"/>' + ppr.join(''), content: imageXml(block, rel, ++drawingId, maxW, maxH) });
        continue;
      }
      if (block.type === 'table') {
        paras.push({ table: tableXml(block, maxW) });
        continue;
      }
      if (block.heading) ppr.push(`<w:pStyle w:val="Heading${block.heading}"/>`);
      ppr.push(`<w:spacing w:before="${twip(block.before || 0)}" w:after="0" w:line="${Math.round((block.line || 1) * 240)}" w:lineRule="auto"/>`);
      if (block.indent || block.firstLine) {
        const indent = Math.max(0, block.indent || 0), first = block.firstLine || 0;
        ppr.push(`<w:ind w:left="${twip(indent)}"${first > 0 ? ` w:firstLine="${twip(first)}"` : first < 0 ? ` w:hanging="${twip(Math.min(-first, indent))}"` : ''}/>`);
      }
      if (block.align === 'center' || block.align === 'right') ppr.push(`<w:jc w:val="${block.align}"/>`);
      paras.push({ ppr: ppr.join(''), content: block.runs.map(r => runXml(r, block.heading)).join('') });
    }
    // A section ends in a paragraph, so after a table at the end of the page comes an empty one.
    if (!paras.length || paras[paras.length - 1].table) paras.push({ ppr: '', content: '' });
    paras.forEach((p, i) => {
      if (p.table) { body.push(p.table); return; }
      const sect = i === paras.length - 1 && !last ? sectionXml(page, false) : '';
      body.push(`<w:p>${p.ppr || sect ? `<w:pPr>${p.ppr}${sect}</w:pPr>` : ''}${p.content}</w:p>`);
    });
    if (last) body.push(sectionXml(page, true));
  });
  const document = `${HEAD}<w:document ${NS}><w:body>${body.join('')}</w:body></w:document>`;
  const headingStyle = (n, size) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const styles = `${HEAD}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headingStyle(1, 32)}${headingStyle(2, 26)}${headingStyle(3, 24)}</w:styles>`;
  const docRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${[...rels.values()].map(r => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${r.name}"/>`).join('')}</Relationships>`;
  const rootRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const core = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title><dc:creator>Master PDF Skill</dc:creator></cp:coreProperties>`;
  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const text = s => new TextEncoder().encode(s);
  return zip([
    { name: '[Content_Types].xml', data: text(types) },
    { name: '_rels/.rels', data: text(rootRels) },
    { name: 'docProps/core.xml', data: text(core) },
    { name: 'word/document.xml', data: text(document) },
    { name: 'word/styles.xml', data: text(styles) },
    { name: 'word/_rels/document.xml.rels', data: text(docRels) },
    ...media.map(m => ({ name: `word/media/${m.name}`, data: m.data })),
  ]);
}

// ---------- ZIP (stored, no compression – images are compressed already, the XML is small) ----------

let crcTable = null;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** [{name, data: Uint8Array}] → ZIP bytes (method 0, UTF-8 names, fixed date 1.1.2020 so the output is reproducible). */
export function zip(files) {
  const enc = new TextEncoder(), chunks = [], central = [];
  let offset = 0;
  const TIME = 0, DATE = (40 << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = enc.encode(file.name), data = file.data, crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, TIME, true); local.setUint16(12, DATE, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
    entry.setUint16(12, TIME, true); entry.setUint16(14, DATE, true); entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
