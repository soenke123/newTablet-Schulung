import {
  PDFDocument, PDFArray, PDFName, degrees, LineCapStyle, LineJoinStyle,
  pushGraphicsState, popGraphicsState, setGraphicsState, setStrokingRgbColor, setLineWidth, setLineCap, setLineJoin,
  moveTo, lineTo, appendBezierCurve, closePath, stroke,
} from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { hexToRgb, isHighlight, arrowWings, arrowLength } from './annotations.js';

/**
 * Builds a new PDF from virtual page records `[{sourceId, pageIndex, rotation, marks?}]` (rotation is absolute;
 * marks are drawn permanently into the page content, see drawMarks).
 * Uses one copyPages call per source so shared resources (fonts, images) are stored only once,
 * even when pages repeat. `onProgress({phase:'copy'|'save', done, total})` may be async (to let the UI repaint).
 */
export async function buildPdf(pages, sourceBytes, onProgress = () => {}) {
  const out = await PDFDocument.create();
  const bySource = new Map();
  pages.forEach((page, i) => {
    if (!bySource.has(page.sourceId)) bySource.set(page.sourceId, []);
    bySource.get(page.sourceId).push(i);
  });
  const copied = new Array(pages.length);
  let done = 0;
  for (const [sourceId, positions] of bySource) {
    await onProgress({ phase: 'copy', done, total: pages.length });
    const source = await PDFDocument.load(sourceBytes(sourceId));
    const result = await out.copyPages(source, positions.map(i => pages[i].pageIndex));
    result.forEach((page, k) => { copied[positions[k]] = page; });
    done += positions.length;
  }
  copied.forEach((page, i) => { page.setRotation(degrees(pages[i].rotation)); drawMarks(page, pages[i].marks); out.addPage(page); });
  await onProgress({ phase: 'save', done, total: pages.length });
  return out.save();
}

/**
 * Draws marks (PDF user space, see annotations.js) as vector graphics on top of the page content; highlighter
 * strokes first (transparent, multiplied, so text stays readable), then everything else in drawing order.
 * Repeated pages share copied objects (copyPages caches even direct ones), so the page first gets its own
 * /Contents array – otherwise pdf-lib would append the marks to every copy of the page.
 */
export function drawMarks(page, marks) {
  const list = (marks || []).filter(m => m.points?.length >= 2);
  if (!list.length) return;
  const node = page.node, contents = node.context.lookup(node.get(PDFName.of('Contents')));
  if (contents instanceof PDFArray) node.set(PDFName.of('Contents'), node.context.obj(contents.asArray()));
  const states = new Map();
  const blendState = opacity => {
    if (!states.has(opacity)) states.set(opacity, node.newExtGState('GS', node.context.obj({ Type: 'ExtGState', CA: opacity, ca: opacity, BM: 'Multiply' })));
    return states.get(opacity);
  };
  const ops = [];
  for (const mark of [...list.filter(isHighlight), ...list.filter(m => !isHighlight(m))]) {
    ops.push(pushGraphicsState());
    if (isHighlight(mark)) ops.push(setGraphicsState(blendState(mark.opacity ?? 1)));
    ops.push(setStrokingRgbColor(...hexToRgb(mark.color)), setLineWidth(mark.width), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round));
    ops.push(...markPath(mark), stroke(), popGraphicsState());
  }
  page.pushOperators(...ops);
}

const KAPPA = 0.5522847498;
function markPath(mark) {
  const p = mark.points;
  if (mark.type === 'ink') {
    const ops = [moveTo(p[0], p[1])];
    if (p.length === 2) ops.push(lineTo(p[0], p[1]));
    for (let i = 2; i < p.length; i += 2) ops.push(lineTo(p[i], p[i + 1]));
    return ops;
  }
  const [x1, y1, x2, y2] = p;
  if (mark.type === 'rect') return [moveTo(x1, y1), lineTo(x2, y1), lineTo(x2, y2), lineTo(x1, y2), closePath()];
  if (mark.type === 'ellipse') {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2, kx = rx * KAPPA, ky = ry * KAPPA;
    return [moveTo(cx + rx, cy),
      appendBezierCurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
      appendBezierCurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
      appendBezierCurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
      appendBezierCurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy), closePath()];
  }
  const ops = [moveTo(x1, y1), lineTo(x2, y2)];
  if (mark.type === 'arrow') {
    const [a, b] = arrowWings(x1, y1, x2, y2, arrowLength(mark.width));
    ops.push(moveTo(a[0], a[1]), lineTo(x2, y2), lineTo(b[0], b[1]));
  }
  return ops;
}

/** Creates a one-page PDF with an empty page of the given size (PDF points). */
export async function createBlankPdf(width, height) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return doc.save();
}
