// Tab "Bearbeiten": pure helpers for the watermark, the text that stays searchable on redacted pages and the text
// read by OCR. Text items have the PDF.js shape {str, transform [a b c d e f] (user space, size included), width, height,
// advances?} (advances: cumulative character shares, comments.js measureAdvances).

export const WATERMARK_COLORS = [
  { color: '#9aa3b2', label: 'Grau' }, { color: '#d93636', label: 'Rot' }, { color: '#2f5fd0', label: 'Blau' }, { color: '#2f9e5b', label: 'Grün' },
];
export const WATERMARK_SIZES = { small: 0.45, medium: 0.65, large: 0.85 };
export const WATERMARK_DEFAULT = { text: 'ENTWURF', color: WATERMARK_COLORS[0].color, opacity: 0.3, size: 'medium', layout: 'diagonal' };
const CAP = 0.72; // cap height of Helvetica-Bold

/**
 * Where the watermark goes on a page: `{size, angle (degrees, user space), origin [x, y] (start of the baseline), dir, up}`.
 * The text runs from lower left to upper right (or straight) as the page is shown, i.e. after its rotation, and is
 * centred in the page box. `widthOf(text, size)` measures Helvetica-Bold.
 */
export function watermarkLayout(box, rotation, wm, widthOf) {
  const turned = ((rotation % 360) + 360) % 360, sideways = turned % 180 !== 0;
  const vw = sideways ? box.height : box.width, vh = sideways ? box.width : box.height;
  const view = wm.layout === 'horizontal' ? 0 : Math.atan2(vh, vw);
  const length = wm.layout === 'horizontal' ? vw : Math.hypot(vw, vh);
  const unit = Math.max(1e-6, widthOf(wm.text, 1));
  const size = Math.max(4, Math.min((WATERMARK_SIZES[wm.size] || WATERMARK_SIZES.medium) * length / unit, Math.min(vw, vh) * 0.4));
  const angle = view * 180 / Math.PI + turned;
  const rad = angle * Math.PI / 180, dir = [Math.cos(rad), Math.sin(rad)], up = [-dir[1], dir[0]];
  const width = unit * size, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const origin = [cx - dir[0] * width / 2 - up[0] * CAP * size / 2, cy - dir[1] * width / 2 - up[1] * CAP * size / 2];
  return { size, angle, origin, dir, up, width };
}

function frame(item) {
  const [a, b, c, d, e, f] = item.transform;
  const sx = Math.hypot(a, b) || 1, sy = Math.hypot(c, d) || sx;
  const dir = [a / sx, b / sx], up = [c / sy, d / sy];
  const len = item.str.length || 1, adv = item.advances?.length === item.str.length + 1 ? item.advances : null;
  return { e, f, dir, up, height: item.height || sy, pos: k => (item.width || 0) * (adv ? adv[k] : k / len) };
}

const charBox = (fr, k, low = -0.22, high = 0.95) => {
  const pts = [[fr.pos(k), low * fr.height], [fr.pos(k + 1), low * fr.height], [fr.pos(k + 1), high * fr.height], [fr.pos(k), high * fr.height]]
    .map(([s, t]) => [fr.e + fr.dir[0] * s + fr.up[0] * t, fr.f + fr.dir[1] * s + fr.up[1] * t]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const overlaps = (a, b) => a[0] < Math.max(b[0], b[2]) && a[2] > Math.min(b[0], b[2]) && a[1] < Math.max(b[1], b[3]) && a[3] > Math.min(b[1], b[3]);

/**
 * The text items without every character that touches one of the rectangles: items are cut into pieces, each with its
 * own start point and width. Used for the searchable text of a redacted page (nothing under a black box survives).
 */
export function textOutside(items, rects) {
  const out = [];
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const fr = frame(item);
    if (!rects.length) { out.push(item); continue; }
    let from = null;
    const flush = to => {
      if (from == null) return;
      const str = item.str.slice(from, to);
      if (str.trim()) {
        const s = fr.pos(from), [a, b, c, d, e, f] = item.transform;
        out.push({ str, transform: [a, b, c, d, e + fr.dir[0] * s, f + fr.dir[1] * s], width: fr.pos(to) - s, height: item.height });
      }
      from = null;
    };
    for (let k = 0; k < item.str.length; k++) {
      if (rects.some(r => overlaps(charBox(fr, k), r))) flush(k);
      else if (from == null) from = k;
    }
    flush(item.str.length);
  }
  return out;
}

/** Characters (other than spaces) whose centre lies inside one of the rectangles – the check after exporting a redaction. */
export function textInside(items, rects, shrink = 0.5) {
  const found = [];
  for (const item of items) {
    if (!item.str) continue;
    const fr = frame(item);
    for (let k = 0; k < item.str.length; k++) {
      if (!item.str[k].trim()) continue;
      const s = (fr.pos(k) + fr.pos(k + 1)) / 2, t = 0.3 * fr.height;
      const x = fr.e + fr.dir[0] * s + fr.up[0] * t, y = fr.f + fr.dir[1] * s + fr.up[1] * t;
      if (rects.some(([x0, y0, x1, y1]) => x > Math.min(x0, x1) + shrink && x < Math.max(x0, x1) - shrink && y > Math.min(y0, y1) + shrink && y < Math.max(y0, y1) - shrink)) found.push(item.str[k]);
    }
  }
  return found;
}

/**
 * OCR result (Tesseract lines with words, bounding boxes in image pixels, y down) → text items in PDF user space.
 * `toPdf(x, y)` maps an image pixel to the page. Font size from the line's height (ascender to descender), baseline
 * from the line's baseline where Tesseract gives one.
 */
export function ocrItems(lines, toPdf, minConfidence = 30) {
  const items = [];
  for (const line of lines) {
    const words = (line.words || []).filter(w => w.text?.trim() && (w.confidence ?? 100) >= minConfidence);
    if (!words.length) continue;
    const lb = line.bbox, height = Math.max(1, lb.y1 - lb.y0);
    const base = line.baseline && Number.isFinite(line.baseline.y0) && Number.isFinite(line.baseline.y1) && line.baseline.x1 !== line.baseline.x0 ? line.baseline : null;
    const baseAt = x => base ? base.y0 + (base.y1 - base.y0) * (x - base.x0) / (base.x1 - base.x0) : lb.y1 - height * 0.2;
    words.forEach((w, i) => {
      const y = baseAt(w.bbox.x0);
      const p0 = toPdf(w.bbox.x0, y), p1 = toPdf(w.bbox.x1, y), pu = toPdf(w.bbox.x0, y - height);
      const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), lineH = Math.hypot(pu[0] - p0[0], pu[1] - p0[1]);
      if (!width || !lineH) return;
      const size = lineH * 0.8, dir = [(p1[0] - p0[0]) / width, (p1[1] - p0[1]) / width], up = [(pu[0] - p0[0]) / lineH, (pu[1] - p0[1]) / lineH];
      const r = v => Math.round(v * 100) / 100;
      items.push({ str: w.text.trim(), transform: [dir[0] * size, dir[1] * size, up[0] * size, up[1] * size, p0[0], p0[1]].map(r), width: r(width), height: r(size), dir: 'ltr', fontName: 'ocr', hasEOL: false, ocr: true });
      if (i < words.length - 1) items.push({ str: ' ', transform: [dir[0] * size, dir[1] * size, up[0] * size, up[1] * size, r(p1[0]), r(p1[1])], width: 0, height: r(size), dir: 'ltr', fontName: 'ocr', hasEOL: false, ocr: true });
    });
    if (items.length) items.at(-1).hasEOL = true;
  }
  return items;
}
