/**
 * Page marks drawn with the "Zeichnen" tools. Every mark has `{id, type, color, width, points}` with points as a
 * flat array [x0, y0, x1, y1, …] in PDF user space of the unrotated source page, so marks follow rotation and zoom
 * and are drawn into the page content on export unchanged. Mark arrays and marks are never mutated in place
 * (undo snapshots share them).
 * - type 'ink': freehand stroke; with `opacity` + `blend: 'multiply'` it is a highlighter stroke.
 * - type 'line' | 'arrow' | 'rect' | 'ellipse': points are the start and end of the drag [x1, y1, x2, y2].
 * - optional `opacity` (0…1, all types) and, for rect/ellipse, `fill: 'light' | 'solid'` (filled with the line colour).
 * Rectangles and ellipses keep their line inside the dragged box (the line runs half a width inside the edge). Line and
 * fill of a filled shape are drawn as one group: the fill (FILL_OPACITY share) lies under the opaque line and the
 * opacity applies to the whole group, so a transparent line never darkens where it covers the fill.
 */
export const PEN_COLORS = [
  { color: '#111827', label: 'Schwarz' },
  { color: '#1d4ed8', label: 'Blau' },
  { color: '#dc2626', label: 'Rot' },
];
export const PEN_WIDTH = { min: 0.5, max: 20, step: 0.5, initial: 2 };
export const MARKER_COLORS = [
  { color: '#facc15', label: 'Gelb' },
  { color: '#4ade80', label: 'Grün' },
  { color: '#f472b6', label: 'Pink' },
];
export const MARKER_WIDTH = { min: 4, max: 40, step: 1, initial: 14 };
export const MARKER_OPACITY = 0.4;
export const ERASER_SIZE = { min: 4, max: 60, step: 2, initial: 16 };
export const SHAPE_TYPES = ['line', 'arrow', 'rect', 'ellipse'];
export const FILLABLE = ['rect', 'ellipse'];
/** Fill of rectangles and ellipses (`mark.fill`): share of the line colour inside the shape (light = a quarter, solid = full). */
export const FILL_OPACITY = { light: 0.25, solid: 1 };

export const isHighlight = mark => mark.blend === 'multiply';
/** Share of the line colour in the fill of a mark (inside its group, before the opacity), 0 when it has none. */
export const fillShare = mark => FILLABLE.includes(mark.type) && FILL_OPACITY[mark.fill] || 0;

/**
 * Maps between PDF user space and view pixels for a page box `{x, y, width, height}` (PDF points, the
 * PDF.js `page.view`), an absolute rotation and a scale (view px per point). Matches PDF.js getViewport.
 */
export function pageTransform(box, rotation, scale) {
  const x0 = box.x || 0, y0 = box.y || 0, x1 = x0 + box.width, y1 = y0 + box.height;
  const turn = ((rotation % 360) + 360) % 360;
  const swap = turn % 180 !== 0;
  const toView = {
    0: (px, py) => [(px - x0) * scale, (y1 - py) * scale],
    90: (px, py) => [(py - y0) * scale, (px - x0) * scale],
    180: (px, py) => [(x1 - px) * scale, (py - y0) * scale],
    270: (px, py) => [(y1 - py) * scale, (x1 - px) * scale],
  }[turn];
  const toPdf = {
    0: (vx, vy) => [x0 + vx / scale, y1 - vy / scale],
    90: (vx, vy) => [x0 + vy / scale, y0 + vx / scale],
    180: (vx, vy) => [x1 - vx / scale, y0 + vy / scale],
    270: (vx, vy) => [x1 - vy / scale, y1 - vx / scale],
  }[turn];
  if (!toView) throw new Error(`Drehung ${rotation} wird nicht unterstützt`);
  return {
    scale,
    width: (swap ? box.height : box.width) * scale,
    height: (swap ? box.width : box.height) * scale,
    toView, toPdf,
  };
}

/** SVG path data for a flat point list, mapped with `toView`. A single point becomes a dot (round caps). */
export function inkPath(points, toView) {
  if (points.length < 2) return '';
  const parts = [];
  for (let i = 0; i < points.length; i += 2) {
    const [x, y] = toView(points[i], points[i + 1]);
    parts.push(`${i ? 'L' : 'M'}${round(x)} ${round(y)}`);
  }
  if (points.length === 2) parts.push(parts[0].replace('M', 'L'));
  return parts.join('');
}

/** Length of an arrow head for a line width (same unit as the width). */
export const arrowLength = width => Math.max(8, width * 4);

/** The two wing points of an arrow head at (x2, y2) pointing away from (x1, y1). */
export function arrowWings(x1, y1, x2, y2, length) {
  const angle = Math.atan2(y2 - y1, x2 - x1), spread = Math.PI / 7;
  return [angle + Math.PI - spread, angle + Math.PI + spread].map(a => [x2 + Math.cos(a) * length, y2 + Math.sin(a) * length]);
}

/**
 * SVG description `{tag, attrs}` of a mark in view pixels. Rectangles and ellipses stay axis-aligned
 * because pages only rotate in steps of 90°.
 */
export function markSvg(mark, map) {
  if (mark.type === 'image') return { tag: 'image', attrs: { href: mark.src, x: 0, y: 0, width: 1, height: 1, preserveAspectRatio: 'none', transform: `matrix(${imageViewMatrix(mark, map).map(round).join(' ')})` }, width: 0 };
  const width = mark.width * map.scale;
  if (mark.type === 'ink') return { tag: 'path', attrs: { d: inkPath(mark.points, map.toView) }, width };
  if (FILLABLE.includes(mark.type)) {
    const fill = fillShare(mark) || null;
    const line = strokeBox(mark), [ax, ay] = map.toView(line.x0, line.y0), [bx, by] = map.toView(line.x1, line.y1);
    const box = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    if (mark.type === 'rect') return { tag: 'rect', attrs: { x: round(box.x), y: round(box.y), width: round(box.w), height: round(box.h) }, width: line.width * map.scale, fill };
    return { tag: 'ellipse', attrs: { cx: round(box.x + box.w / 2), cy: round(box.y + box.h / 2), rx: round(box.w / 2), ry: round(box.h / 2) }, width: line.width * map.scale, fill };
  }
  const [x1, y1] = map.toView(mark.points[0], mark.points[1]);
  const [x2, y2] = map.toView(mark.points[2], mark.points[3]);
  let d = `M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}`;
  if (mark.type === 'arrow') {
    const [a, b] = arrowWings(x1, y1, x2, y2, arrowLength(mark.width) * map.scale);
    d += `M${round(a[0])} ${round(a[1])}L${round(x2)} ${round(y2)}L${round(b[0])} ${round(b[1])}`;
  }
  return { tag: 'path', attrs: { d }, width };
}

/**
 * Images (tab "Einfügen": pictures and signatures) are marks `{id, type:'image', src (data URL, PNG or JPEG),
 * points [x0, y0, x1, y1] (box in PDF space), rot, label?}`. `rot` is the page rotation at the time of inserting:
 * the picture is turned against it, so it stands upright on the page as it was shown (later page turns turn it along).
 * imageMatrix maps the unit square of the picture (u right, v up) into PDF space – the `cm` operator of the export.
 */
export function imageMatrix(mark) {
  const { x0: l, y0: b, x1: r, y1: t } = pointsBox(mark), w = r - l, h = t - b;
  const turn = (((mark.rot || 0) % 360) + 360) % 360;
  if (turn === 90) return [0, h, -w, 0, r, b];
  if (turn === 180) return [-w, 0, 0, -h, r, t];
  if (turn === 270) return [0, -h, w, 0, l, t];
  return [w, 0, 0, h, l, b];
}

/** SVG matrix of an image in view px: maps the picture's unit square (y down, as SVG draws images) onto the page. */
export function imageViewMatrix(mark, map) {
  const [a, b, c, d, e, f] = imageMatrix(mark);
  const at = (u, v) => map.toView(a * u + c * v + e, b * u + d * v + f);
  const o = at(0, 1), x = at(1, 1), y = at(0, 0);
  return [x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]];
}

/**
 * Text (tab "Einfügen", written into the page on export as real, searchable text): marks `{id, type:'text', text,
 * font ('sans'|'serif'|'mono'), bold, size (pt), color, rot, boxWidth?, lines, points}`. Like pictures they are laid
 * out in their own upright frame (`rot`, see imageMatrix) whose upper-left corner is the anchor. Without `boxWidth`
 * the box follows the longest line; with it (pulled at an edge) lines wrap at that width. `lines` and `points` are
 * computed by layoutText with the metrics of the PDF standard fonts, so view and export need no measuring.
 */
export const TEXT_FONTS = {
  sans: { label: 'Serifenlos', pdf: ['Helvetica', 'Helvetica-Bold'], css: 'Helvetica, Arial, sans-serif' },
  serif: { label: 'Serif', pdf: ['Times-Roman', 'Times-Bold'], css: '"Times New Roman", Times, serif' },
  mono: { label: 'Schreibmaschine', pdf: ['Courier', 'Courier-Bold'], css: '"Courier New", Courier, monospace' },
};
export const TEXT_PAD = 2, TEXT_LINE = 1.25;
export const textFontName = mark => (TEXT_FONTS[mark.font] || TEXT_FONTS.sans).pdf[mark.bold ? 1 : 0];
const isBoxed = mark => mark.type === 'image' || mark.type === 'text' || mark.type === 'field';
const turnOf = rot => (((rot || 0) % 360) + 360) % 360;

/** Size of a box in its own upright frame (width along the text). */
export function localSize(mark) {
  const b = pointsBox(mark), w = b.x1 - b.x0, h = b.y1 - b.y0;
  return turnOf(mark.rot) % 180 ? { w: h, h: w } : { w, h };
}

/** Upper-left corner of the upright frame in PDF space. */
export function textAnchor(mark) {
  const [, , c, d, e, f] = imageMatrix(mark);
  return [c + e, d + f];
}

/** Box points of a frame w × h (upright size) whose upper-left corner is at `anchor`. */
export function frameRect([x, y], rot, w, h) {
  const dirs = { 0: [[1, 0], [0, -1]], 90: [[0, 1], [1, 0]], 180: [[-1, 0], [0, 1]], 270: [[0, -1], [-1, 0]] }[turnOf(rot)];
  const [[rx, ry], [dx, dy]] = dirs, ox = x + rx * w + dx * h, oy = y + ry * w + dy * h;
  return [Math.min(x, ox), Math.min(y, oy), Math.max(x, ox), Math.max(y, oy)].map(roundPoint);
}

/** Lines of a text: paragraphs at "\n", wrapped at spaces to `maxWidth` (long words are broken), `widthOf(text)` in pt. */
export function wrapText(text, maxWidth, widthOf) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    if (!(maxWidth < Infinity)) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/(?<= )/)) {
      if (widthOf((line + word).trimEnd()) <= maxWidth) { line += word; continue; }
      if (line) { out.push(line.trimEnd()); line = ''; }
      let rest = word;
      while (widthOf(rest.trimEnd()) > maxWidth && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && widthOf(rest.slice(0, n)) > maxWidth) n--;
        out.push(rest.slice(0, n)); rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** The text mark with `lines` and `points` for its text, size and font, kept at its anchor; widthOf(text, size, pdfFont). */
export function layoutText(mark, widthOf) {
  const size = mark.size, font = textFontName(mark), measure = t => widthOf(t, size, font);
  const lines = wrapText(mark.text, mark.boxWidth ? Math.max(size, mark.boxWidth - 2 * TEXT_PAD) : Infinity, measure);
  const w = mark.boxWidth ?? Math.max(size * 2, ...lines.map(measure)) + 2 * TEXT_PAD;
  const h = lines.length * size * TEXT_LINE + 2 * TEXT_PAD;
  return { ...mark, lines, points: frameRect(textAnchor(mark), mark.rot, w, h) };
}

/** Baselines of the lines in the upright frame, measured from its top: `{text, x, y}` in pt. */
export function textLines(mark) {
  return (mark.lines || []).map((text, i) => ({ text, x: TEXT_PAD, y: roundPoint(TEXT_PAD + (i * TEXT_LINE + 0.95) * mark.size) }));
}

/** Polylines (flat arrays, PDF space) along which a mark is drawn – used for hit tests. */
export function markOutline(mark) {
  const p = mark.points;
  if (mark.type === 'ink') return [p];
  if (isBoxed(mark)) { const b = pointsBox(mark); return [[b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1, b.x0, b.y0]]; }
  const [x1, y1, x2, y2] = p;
  if (mark.type === 'line') return [p];
  if (mark.type === 'arrow') {
    const [a, b] = arrowWings(x1, y1, x2, y2, arrowLength(mark.width));
    return [p, [a[0], a[1], x2, y2, b[0], b[1]]];
  }
  if (mark.type === 'rect') { const b = strokeBox(mark); return [[b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1, b.x0, b.y0]]; }
  if (mark.type === 'ellipse') {
    const b = strokeBox(mark), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2, ring = [];
    for (let i = 0; i <= 48; i++) ring.push(cx + rx * Math.cos(i * Math.PI / 24), cy + ry * Math.sin(i * Math.PI / 24));
    return [ring];
  }
  return [];
}

/** Normalised box `{x0, y0, x1, y1}` (PDF space) of the points of a mark: the dragged box of shapes, the extent of strokes. */
export function pointsBox(mark) {
  const xs = mark.points.filter((_, i) => i % 2 === 0), ys = mark.points.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Box along which the line of a rectangle or ellipse runs: the dragged box moved inwards by half the line width, so
 * the line ends at the edge. Very small shapes collapse to their centre line; `width` is the line width that still fits.
 */
export function strokeBox(mark) {
  const b = pointsBox(mark), w = mark.width || 0;
  const inX = Math.min(w / 2, (b.x1 - b.x0) / 2), inY = Math.min(w / 2, (b.y1 - b.y0) / 2);
  return { x0: b.x0 + inX, y0: b.y0 + inY, x1: b.x1 - inX, y1: b.y1 - inY, width: Math.max(Math.min(w, 2 * Math.min(inX, inY)), Math.min(w, 0.5)) };
}

/**
 * A copy of the mark stretched so that the box with corners a, b (PDF space) becomes the box a2, b2, each axis on its
 * own (a box that is flat on one axis is only moved along it). Line widths stay as they are.
 */
export function scaleMark(mark, [ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const sx = bx - ax ? (dx - cx) / (bx - ax) : null, sy = by - ay ? (dy - cy) / (by - ay) : null;
  return { ...mark, points: mark.points.map((v, i) => roundPoint(i % 2
    ? (sy == null ? v + (cy - ay) : cy + (v - ay) * sy)
    : (sx == null ? v + (cx - ax) : cx + (v - ax) * sx))) };
}

/** True if the point (PDF space) lies within `radius` of the drawn line, counting half its line width. */
export function markHit(mark, x, y, radius) {
  if (isBoxed(mark)) { const b = pointsBox(mark); return x >= b.x0 - radius && x <= b.x1 + radius && y >= b.y0 - radius && y <= b.y1 + radius; }
  if (fillShare(mark) && insideShape(mark, x, y)) return true;
  const reach = radius + (mark.width || 0) / 2;
  for (const p of markOutline(mark)) {
    if (p.length === 2 && Math.hypot(x - p[0], y - p[1]) <= reach) return true;
    for (let i = 2; i < p.length; i += 2) {
      if (segmentDistance(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= reach) return true;
    }
  }
  return false;
}

/** Bounding box `{x0, y0, x1, y1}` in PDF space, including half the line width. */
export function markBounds(mark) {
  const xs = [], ys = [];
  for (const p of markOutline(mark)) for (let i = 0; i < p.length; i += 2) { xs.push(p[i]); ys.push(p[i + 1]); }
  const pad = (mark.width || 0) / 2;
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

/** A copy of the mark shifted by (dx, dy) in PDF space. */
export function moveMark(mark, dx, dy) {
  return { ...mark, points: mark.points.map((v, i) => roundPoint(v + (i % 2 ? dy : dx))) };
}

/**
 * A pasted copy: shifted by (dx, dy) in PDF space, then pushed back inside the page box `{x, y, width, height}` so it
 * stays reachable on a smaller page (a copy larger than the page keeps its upper-left corner on the page).
 */
export function placeMark(mark, box, dx = 0, dy = 0) {
  const b = markBounds(mark);
  const fit = (lo, hi, min, max) => hi - lo > max - min ? max - hi : lo < min ? min - lo : hi > max ? max - hi : 0;
  const x0 = b.x0 + dx, x1 = b.x1 + dx, y0 = b.y0 + dy, y1 = b.y1 + dy;
  const fx = x1 - x0 > box.width ? box.x - x0 : fit(x0, x1, box.x, box.x + box.width);
  const fy = y1 - y0 > box.height ? box.y + box.height - y1 : fit(y0, y1, box.y, box.y + box.height);
  return moveMark(mark, dx + fx, dy + fy);
}

/**
 * End point of a shape drag with Shift held (view space): lines and arrows snap to 45° steps,
 * rectangles and ellipses become squares and circles.
 */
export function constrainEnd(type, [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  if (type === 'rect' || type === 'ellipse') {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    return [x1 + Math.sign(dx || 1) * size, y1 + Math.sign(dy || 1) * size];
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(dx, dy);
  return [x1 + Math.cos(angle) * length, y1 + Math.sin(angle) * length];
}

/**
 * Real erasing ("Radieren"): removes everything within `radius` of the point (x, y) (PDF space) from the marks.
 * Lines are cut there; the remaining pieces become ink strokes with the same style. Shapes that are touched turn
 * into strokes as well (their fill is dropped, a filled area cannot be cut along the eraser). Returns the same array
 * when nothing was touched, otherwise a new array; `nextId()` gives ids for the new pieces.
 */
export function eraseMarks(marks, x, y, radius, nextId) {
  let changed = false;
  const result = [];
  for (const mark of marks) {
    if (isBoxed(mark)) { result.push(mark); continue; } // pictures, text and form fields cannot be cut; "Ganze Elemente" removes them
    const reach = radius + (mark.width || 0) / 2, b = markBounds(mark);
    if (x < b.x0 - radius || x > b.x1 + radius || y < b.y0 - radius || y > b.y1 + radius || !markHit({ ...mark, fill: undefined }, x, y, radius)) { result.push(mark); continue; }
    changed = true;
    const { id, type, points, fill, ...style } = mark;
    for (const line of markOutline(mark)) {
      const dense = densify(line, Math.max(0.25, reach / 3), x, y, reach), runs = [];
      let run = [], cut = false;
      for (let i = 0; i < dense.length; i += 2) {
        if (Math.hypot(dense[i] - x, dense[i + 1] - y) <= reach) { cut = true; if (run.length) runs.push(run); run = []; }
        else run.push(dense[i], dense[i + 1]);
      }
      if (run.length) runs.push(run);
      // A closed outline (rectangle, ellipse) cut once stays one open line: its end continues into its start.
      const kept = i => Math.hypot(dense[i] - x, dense[i + 1] - y) > reach;
      const closed = line.length > 4 && Math.hypot(line[0] - line.at(-2), line[1] - line.at(-1)) < 1e-6;
      if (closed && cut && runs.length > 1 && kept(0) && kept(dense.length - 2)) runs.unshift([...runs.pop(), ...runs.shift().slice(2)]);
      for (const piece of runs) if (piece.length >= 4) result.push({ ...style, id: nextId(), type: 'ink', points: piece.map(roundPoint) });
    }
  }
  return changed ? result : marks;
}

/** Adds points on the segments that pass near (x, y), so cuts there land at most `step` from the eraser edge. */
function densify(line, step, x, y, reach) {
  if (line.length < 4) return line.slice();
  const out = [line[0], line[1]];
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2], ay = line[i - 1], bx = line[i], by = line[i + 1];
    const n = segmentDistance(x, y, ax, ay, bx, by) <= reach + step ? Math.ceil(Math.hypot(bx - ax, by - ay) / step) : 1;
    for (let k = 1; k <= n; k++) out.push(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
  }
  return out;
}

function insideShape(mark, x, y) {
  const [x1, y1, x2, y2] = mark.points;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
  if (Math.abs(x - cx) > rx || Math.abs(y - cy) > ry) return false;
  return mark.type === 'rect' || (rx > 0 && ry > 0 && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
}

/** '#rrggbb' → [r, g, b] in 0…1. */
export function hexToRgb(hex) {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '000000';
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
}

export const roundPoint = v => Math.round(v * 100) / 100;
const round = v => Math.round(v * 10) / 10;

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
