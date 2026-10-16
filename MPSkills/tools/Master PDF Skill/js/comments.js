/**
 * Comments (tab "Kommentieren"): notes, highlight/underline/strike-out bound to text, plus comments read from the
 * opened PDF. They stay PDF annotations on export (see writeComments in export.js), unlike the drawings in
 * annotations.js, which are flattened into the page.
 *
 * A comment lives in `p.comments` of a page record (arrays and comments are replaced, never mutated – undo snapshots
 * share them), all coordinates in PDF user space of the unrotated source page:
 *   {id, kind, color, text, author, date (ISO string|null), rect [x0, y0, x1, y1], quads? [8 numbers per quad:
 *    upper-left, upper-right, lower-left, lower-right], opacity?, quote?, replies [{id, author, text, date, orig?}],
 *    orig? {id, text, color, rect, fontSize?}, status? {state, author, date, orig?}, fontSize? + fill? (freetext)}
 * Text boxes (`freetext`) use `color` for the text, `fontSize` in points and an optional background `fill`; their
 * rect follows the text (freeTextRect). `status` is the review state (COMMENT_STATES) – in the PDF a hidden reply
 * with /State and /StateModel /Review, as Acrobat writes it; `orig` is the id of that reply when it was read in.
 * `orig` marks a comment read from the source PDF (`id` = PDF.js annotation id, e.g. "12R") together with its values
 * at import time, so the export can keep the original annotation object when nothing changed.
 * Kinds with `redraw` are hidden in the PDF.js canvas and drawn by the app (so they can be recoloured, moved and
 * deleted per page copy); the others keep their original appearance from the canvas.
 */
import { matchPieces } from './search.js';

export const COMMENT_KINDS = {
  note: { label: 'Notiz', subtype: 'Text', redraw: true },
  highlight: { label: 'Markierung', subtype: 'Highlight', redraw: true, markup: true },
  underline: { label: 'Unterstrichen', subtype: 'Underline', redraw: true, markup: true },
  strikeout: { label: 'Durchgestrichen', subtype: 'StrikeOut', redraw: true, markup: true },
  squiggly: { label: 'Wellenlinie', subtype: 'Squiggly', redraw: true, markup: true },
  freetext: { label: 'Textfeld', subtype: 'FreeText', redraw: true },
  ink: { label: 'Freihand', subtype: 'Ink' },
  square: { label: 'Rechteck', subtype: 'Square' },
  circle: { label: 'Ellipse', subtype: 'Circle' },
  line: { label: 'Linie', subtype: 'Line' },
  polygon: { label: 'Vieleck', subtype: 'Polygon' },
  polyline: { label: 'Linienzug', subtype: 'PolyLine' },
  stamp: { label: 'Stempel', subtype: 'Stamp' },
  caret: { label: 'Einfügezeichen', subtype: 'Caret' },
};
const KIND_BY_SUBTYPE = Object.fromEntries(Object.entries(COMMENT_KINDS).map(([kind, k]) => [k.subtype, kind]));

export const COMMENT_COLORS = [
  { color: '#facc15', label: 'Gelb' },
  { color: '#4ade80', label: 'Grün' },
  { color: '#60a5fa', label: 'Blau' },
  { color: '#f472b6', label: 'Pink' },
  { color: '#ef4444', label: 'Rot' },
];
export const DEFAULT_COMMENT_COLORS = { note: '#facc15', highlight: '#facc15', underline: '#60a5fa', strikeout: '#ef4444', freetext: '#dc2626' };
/** Text colours of text boxes (the pale comment colours would be hard to read as text). */
export const FREETEXT_COLORS = [
  { color: '#111827', label: 'Schwarz' },
  { color: '#dc2626', label: 'Rot' },
  { color: '#1d4ed8', label: 'Blau' },
  { color: '#15803d', label: 'Grün' },
  { color: '#ea580c', label: 'Orange' },
];
export const FREETEXT_SIZES = [8, 10, 12, 14, 18, 24];
export const FREETEXT_SIZE = 12;
/** Inner margin of a text box and line height (times the font size). */
export const FREETEXT_PAD = 3;
export const FREETEXT_LINE = 1.25;

/** Review states of a comment (Acrobat: "Status festlegen"); `pdf` is the /State value. */
export const COMMENT_STATES = {
  accepted: { label: 'Angenommen', pdf: 'Accepted' },
  rejected: { label: 'Abgelehnt', pdf: 'Rejected' },
  cancelled: { label: 'Abgebrochen', pdf: 'Cancelled' },
  completed: { label: 'Erledigt', pdf: 'Completed' },
};
const STATE_BY_PDF = Object.fromEntries(Object.entries(COMMENT_STATES).map(([key, s]) => [s.pdf.toLowerCase(), key]));
/** Opacity of new highlights (drawn multiplied, like a text marker). */
export const HIGHLIGHT_OPACITY = 0.5;
/** Edge length of a note icon in points. */
export const NOTE_SIZE = 20;
/** Speech bubble of the note icon in a NOTE_SIZE box, y pointing down: outline polygon and two text lines. */
export const NOTE_ICON = {
  outline: [2, 2, 18, 2, 18, 14, 10, 14, 5, 18.5, 5, 14, 2, 14],
  lines: [[5.5, 6, 14.5, 6], [5.5, 10, 12, 10]],
};

export const isRedrawn = c => !!COMMENT_KINDS[c.kind]?.redraw;
export const isMarkup = c => !!COMMENT_KINDS[c.kind]?.markup;
export const roundPoint = v => Math.round(v * 100) / 100;

/** PDF.js colour (RGB 0…255) → '#rrggbb', null without colour. */
export function colorHex(rgb) {
  if (!rgb || rgb.length < 3) return null;
  return '#' + [0, 1, 2].map(i => Math.max(0, Math.min(255, Math.round(rgb[i]))).toString(16).padStart(2, '0')).join('');
}

/** PDF date string (D:YYYYMMDDHHmmSS+HH'mm') → ISO string, null if it cannot be read. */
export function parsePdfDate(value) {
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?/.exec(String(value || '').trim());
  if (!m) return null;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', s = '00', sign, oh = '00', om = '00'] = m;
  let time = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  if (sign === '+' || sign === '-') time -= (sign === '+' ? 1 : -1) * (+oh * 60 + +om) * 60000;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** ISO string or Date → PDF date string in local time with offset, e.g. D:20261016143000+02'00'. */
export function pdfDate(value = new Date()) {
  const date = new Date(value), pad = n => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset(), abs = Math.abs(offset);
  return `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    + (offset ? `${offset > 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}'${pad(abs % 60)}'` : 'Z');
}

const normRect = r => [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])].map(roundPoint);
export const noteRect = (x, y) => [x, y - NOTE_SIZE, x + NOTE_SIZE, y].map(roundPoint);

/**
 * Reads the annotations of one page (PDF.js `page.getAnnotations()`) into comments. Replies (IRT) are attached to
 * the comment they answer, popups belong to their parent. Returns the comments and `owned` – the ids of every
 * annotation the comments stand for (incl. replies and popups); on export exactly these are replaced by the
 * comments. Hidden annotations, links, form fields etc. are not touched.
 */
export function importAnnotations(annots, nextId) {
  const comments = [], byId = new Map(), owned = new Set(), replies = [], states = [];
  for (const a of annots || []) {
    const kind = KIND_BY_SUBTYPE[a.subtype];
    // Review states are hidden replies; "Marked" (private check marks) stays in the PDF untouched.
    if (kind === 'note' && a.inReplyTo && a.state != null) { if (pdfName(a.stateModel) === 'Review') states.push(a); continue; }
    if (!kind || !a.id || !a.rect || (a.annotationFlags & (2 | 32))) continue; // Hidden, NoView
    if (a.inReplyTo) { if (a.replyType !== 'Group') replies.push(a); continue; }
    const rect = normRect(a.rect);
    const c = { id: nextId(), kind, color: colorHex(a.color) || DEFAULT_COMMENT_COLORS[kind] || '#facc15', text: a.contentsObj?.str || '', author: a.titleObj?.str || '', date: parsePdfDate(a.modificationDate || a.creationDate), rect, replies: [] };
    if (kind === 'note') c.rect = noteRect(rect[0], rect[3]);
    if (kind === 'freetext') {
      const da = a.defaultAppearanceData || {};
      c.color = colorHex(da.fontColor) || '#000000';
      c.fontSize = Math.round((da.fontSize || 10) * 10) / 10;
      const fill = colorHex(a.color);
      if (fill) c.fill = fill;
    }
    if (COMMENT_KINDS[kind].markup) {
      c.quads = a.quadPoints?.length >= 8 ? Array.from(a.quadPoints, roundPoint) : [rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]];
      if (typeof a.opacity === 'number' && a.opacity > 0) c.opacity = a.opacity;
    }
    c.orig = { id: a.id, text: c.text, color: c.color, rect: c.rect, ...(c.fontSize ? { fontSize: c.fontSize } : {}) };
    comments.push(c);
    byId.set(a.id, c);
    owned.add(a.id);
    if (a.popupRef) owned.add(a.popupRef);
  }
  // Replies may answer replies: follow them to the comment at the root of the thread.
  const root = new Map();
  let pending = replies;
  while (pending.length) {
    const rest = [];
    for (const a of pending) {
      const parent = byId.get(a.inReplyTo) || root.get(a.inReplyTo);
      if (!parent) { rest.push(a); continue; }
      root.set(a.id, parent);
      parent.replies.push({ id: nextId(), author: a.titleObj?.str || '', text: a.contentsObj?.str || '', date: parsePdfDate(a.modificationDate || a.creationDate), orig: a.id });
      owned.add(a.id);
      if (a.popupRef) owned.add(a.popupRef);
    }
    if (rest.length === pending.length) break;
    pending = rest;
  }
  for (const c of comments) c.replies.sort((x, y) => String(x.date || '').localeCompare(String(y.date || '')));
  // The newest review state of a thread wins; older ones are dropped on export (they are owned).
  for (const a of states) {
    const parent = byId.get(a.inReplyTo) || root.get(a.inReplyTo);
    if (!parent) continue;
    owned.add(a.id);
    if (a.popupRef) owned.add(a.popupRef);
    const date = parsePdfDate(a.modificationDate || a.creationDate), state = STATE_BY_PDF[String(pdfName(a.state) || '').toLowerCase()];
    if (parent.status && String(parent.status.date || '') > String(date || '')) continue;
    parent.status = state ? { state, author: a.titleObj?.str || '', date, orig: a.id } : null;
  }
  for (const c of comments) if (c.status === null) delete c.status;
  return { comments, owned };
}

/** Name or string value from PDF.js data (names arrive as `{name}` objects or plain strings). */
const pdfName = v => typeof v === 'string' ? v : v?.name ?? null;

/** True if a comment read from the PDF differs from its original (text, colour or position). */
export function commentChanged(c) {
  const o = c.orig;
  return !o || c.text !== o.text || c.color !== o.color || c.rect.some((v, i) => v !== o.rect[i]) || (c.fontSize ?? null) !== (o.fontSize ?? null);
}

// --- Text boxes ---
// Lines break only where the text has line breaks. `widthOf(text, size)` measures a line in points (Helvetica, the
// font of the exported box); the box grows with its text from the upper-left corner.

/** Rect [x0, y0, x1, y1] of a text box with its upper-left corner at (x, top). Empty boxes get room for a few letters. */
export function freeTextRect(x, top, text, fontSize, widthOf) {
  const lines = String(text || '').split('\n');
  const width = Math.max(fontSize * 4, ...lines.map(line => widthOf(line, fontSize)));
  const height = lines.length * fontSize * FREETEXT_LINE;
  return [x, top - height - 2 * FREETEXT_PAD, x + width + 2 * FREETEXT_PAD, top].map(roundPoint);
}

/** Lines of a text box with their baseline start (PDF space). */
export function freeTextLines(c) {
  const size = c.fontSize || FREETEXT_SIZE;
  return String(c.text || '').split('\n').map((text, i) => ({ text, x: roundPoint(c.rect[0] + FREETEXT_PAD), y: roundPoint(c.rect[3] - FREETEXT_PAD - (i * FREETEXT_LINE + 0.95) * size) }));
}

// --- Text geometry (PDF.js text items, as in search.js) ---
// PDF.js only knows where a text item starts and how wide it is. Without `item.advances` (cumulative share of the item
// width before each character, length str.length + 1, see measureAdvances) characters are assumed to be equally wide.

function itemFrame(item) {
  const [a, b, c, d, e, f] = item.transform;
  const scaleX = Math.hypot(a, b) || 1, scaleY = Math.hypot(c, d);
  const dir = [a / scaleX, b / scaleX];
  const up = scaleY ? [c / scaleY, d / scaleY] : [-dir[1], dir[0]];
  const width = item.width || 0, length = item.str.length || 1, adv = item.advances?.length === item.str.length + 1 ? item.advances : null;
  return { e, f, dir, up, width, height: item.height || scaleY || scaleX, length, pos: k => width * (adv ? adv[k] : k / length) };
}

/** Cumulative character widths of an item as shares of its width, measured with `measure(text)` (e.g. canvas measureText). */
export function measureAdvances(str, measure) {
  const out = [0];
  let sum = 0;
  for (const ch of str) {
    sum += Math.max(0, measure(ch));
    for (let k = 0; k < ch.length; k++) out.push(sum);
  }
  return sum > 0 ? out.map(v => v / sum) : null;
}

/** Character boundary of a frame nearest to the distance s along the text. */
function nearestBoundary(fr, s) {
  let best = 0;
  for (let k = 1; k <= fr.length; k++) if (Math.abs(fr.pos(k) - s) < Math.abs(fr.pos(best) - s)) best = k;
  return best;
}

/** Quad (upper-left, upper-right, lower-left, lower-right) around characters from..to of a text item; follows rotated text. */
export function pieceQuad(item, from, to) {
  const fr = itemFrame(item);
  const s0 = fr.pos(from), s1 = fr.pos(to);
  const at = (s, t) => [fr.e + fr.dir[0] * s + fr.up[0] * t, fr.f + fr.dir[1] * s + fr.up[1] * t];
  const top = 0.95 * fr.height, bottom = -0.22 * fr.height;
  return [...at(s0, top), ...at(s1, top), ...at(s0, bottom), ...at(s1, bottom)].map(roundPoint);
}

/**
 * Character offset in the page text (buildPageText) nearest to the point (PDF space); null if no text item is
 * within `reach` points. Distance across lines counts much more than along them, so a drag stays on its line.
 */
export function charIndexAt(items, spans, x, y, reach = 24) {
  let best = null;
  for (const span of spans) {
    const item = items[span.item], fr = itemFrame(item);
    const dx = x - fr.e, dy = y - fr.f;
    const s = dx * fr.dir[0] + dy * fr.dir[1], t = dx * fr.up[0] + dy * fr.up[1];
    const ds = s < 0 ? -s : s > fr.width ? s - fr.width : 0;
    const low = -0.22 * fr.height, high = 0.95 * fr.height;
    const dt = t < low ? low - t : t > high ? t - high : 0;
    const score = ds + dt * 50;
    if (!best || score < best.score) {
      const char = Math.min(span.end - span.start, nearestBoundary(fr, s));
      best = { score, distance: Math.hypot(ds, dt), offset: span.start + char };
    }
  }
  return best && best.distance <= reach ? best.offset : null;
}

/** Word around a character offset (for a tap without dragging): [start, end), or null on whitespace. */
export function wordAt(text, offset) {
  const word = /[\p{L}\p{N}_'’-]/u;
  let start = offset, end = offset;
  if (!word.test(text[offset] || '') && word.test(text[offset - 1] || '')) start = end = offset - 1;
  if (!word.test(text[start] || '')) return null;
  while (start > 0 && word.test(text[start - 1])) start--;
  while (end < text.length && word.test(text[end])) end++;
  return [start, end];
}

/** Quads for the characters start..end of the page text, one per text item piece. */
export function selectionQuads(items, spans, start, end) {
  return matchPieces(spans, start, end).filter(p => p.to > p.from).map(p => pieceQuad(items[p.item], p.from, p.to)).flat();
}

const quadCorners = (q, i) => ({ ul: [q[i], q[i + 1]], ur: [q[i + 2], q[i + 3]], ll: [q[i + 4], q[i + 5]], lr: [q[i + 6], q[i + 7]] });

/**
 * Text under the quads of a markup comment, whitespace collapsed. Character positions inside a text item are only
 * estimated (proportional), so a word counts when most of its characters have their centre inside a quad.
 */
export function textInQuads(items, spans, text, quads) {
  const boxes = [];
  for (let i = 0; i + 7 < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]], ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
    boxes.push([Math.min(...xs) - 0.5, Math.min(...ys) - 0.5, Math.max(...xs) + 0.5, Math.max(...ys) + 0.5]);
  }
  const inside = new Uint8Array(text.length);
  for (const span of spans) {
    const fr = itemFrame(items[span.item]);
    for (let k = 0; k < span.end - span.start; k++) {
      const s = (fr.pos(k) + fr.pos(k + 1)) / 2, t = 0.3 * fr.height;
      const x = fr.e + fr.dir[0] * s + fr.up[0] * t, y = fr.f + fr.dir[1] * s + fr.up[1] * t;
      if (boxes.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) inside[span.start + k] = 1;
    }
  }
  for (const word of text.matchAll(/[\p{L}\p{N}_'’-]+/gu)) {
    let count = 0;
    for (let k = 0; k < word[0].length; k++) count += inside[word.index + k];
    inside.fill(count * 2 > word[0].length ? 1 : 0, word.index, word.index + word[0].length);
  }
  let out = '', last = -1;
  for (let offset = 0; offset < text.length; offset++) {
    if (!inside[offset]) continue;
    if (last >= 0 && offset > last + 1) out += ' ';
    out += text[offset];
    last = offset;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Bounding box [x0, y0, x1, y1] of quads. */
export function quadsBounds(quads) {
  const xs = quads.filter((_, i) => i % 2 === 0), ys = quads.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(roundPoint);
}

/** True if the point (PDF space) lies on a markup quad or inside the rectangle of another comment (not notes, see the app). */
export function commentHit(c, x, y, pad = 0) {
  if (c.quads) {
    for (let i = 0; i + 7 < c.quads.length; i += 8) {
      const b = quadsBounds(c.quads.slice(i, i + 8));
      if (x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad) return true;
    }
    return false;
  }
  const [x0, y0, x1, y1] = c.rect;
  return x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
}

/** Highlight areas as polygons (UL, UR, LR, LL) in PDF space. */
export function highlightPolygons(c) {
  const out = [];
  for (let i = 0; i + 7 < c.quads.length; i += 8) {
    const { ul, ur, ll, lr } = quadCorners(c.quads, i);
    out.push([...ul, ...ur, ...lr, ...ll]);
  }
  return out;
}

/**
 * Lines of an underline, strike-out or squiggly comment in PDF space: [{points, width}] per quad. The underline sits
 * just above the bottom of the quad (between baseline and descender), the strike-out through the middle of the
 * lower-case letters.
 */
export function markupLines(c) {
  const out = [];
  for (let i = 0; i + 7 < c.quads.length; i += 8) {
    const { ul, ur, ll, lr } = quadCorners(c.quads, i);
    const height = Math.hypot(ul[0] - ll[0], ul[1] - ll[1]);
    const width = Math.max(0.6, roundPoint(height * 0.07));
    const along = (k, a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    const level = c.kind === 'strikeout' ? 0.42 : 0.1;
    const p = along(level, ll, ul), q = along(level, lr, ur);
    if (c.kind !== 'squiggly') { out.push({ points: [...p, ...q].map(roundPoint), width }); continue; }
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]), wave = Math.max(2, height * 0.16), steps = Math.max(2, Math.round(length / wave));
    const nx = (ul[0] - ll[0]) / (height || 1), ny = (ul[1] - ll[1]) / (height || 1), amp = height * 0.05;
    const points = [];
    for (let k = 0; k <= steps; k++) {
      const [x, y] = along(k / steps, p, q), sign = k % 2 ? 1 : -1;
      points.push(roundPoint(x + nx * amp * sign), roundPoint(y + ny * amp * sign));
    }
    out.push({ points, width });
  }
  return out;
}
