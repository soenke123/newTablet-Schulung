import {
  PDFDocument, PDFArray, PDFName, PDFRef, PDFDict, PDFHexString, PDFString, degrees, LineCapStyle, LineJoinStyle,
  pushGraphicsState, popGraphicsState, setGraphicsState, setStrokingRgbColor, setFillingRgbColor, setLineWidth, setLineCap, setLineJoin,
  moveTo, lineTo, appendBezierCurve, closePath, stroke, fill, fillAndStroke,
} from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { hexToRgb, isHighlight, arrowWings, arrowLength } from './annotations.js';
import { COMMENT_KINDS, HIGHLIGHT_OPACITY, NOTE_SIZE, NOTE_ICON, commentChanged, highlightPolygons, markupLines, pdfDate } from './comments.js';

/**
 * Builds a new PDF from virtual page records `[{sourceId, pageIndex, rotation, marks?, comments?}]` (rotation is
 * absolute; marks are drawn permanently into the page content, see drawMarks; comments stay annotations, see
 * writeComments). `ownedAnnots(sourceId, pageIndex)` returns the ids of the source annotations the comments were read
 * from (comments.js importAnnotations).
 * Uses one copyPages call per source so shared resources (fonts, images) are stored only once,
 * even when pages repeat. `onProgress({phase:'copy'|'save', done, total})` may be async (to let the UI repaint).
 */
export async function buildPdf(pages, sourceBytes, onProgress = () => {}, { ownedAnnots = () => null } = {}) {
  const out = await PDFDocument.create();
  const bySource = new Map();
  pages.forEach((page, i) => {
    if (!bySource.has(page.sourceId)) bySource.set(page.sourceId, []);
    bySource.get(page.sourceId).push(i);
  });
  const copied = new Array(pages.length), annotRefs = new Array(pages.length);
  let done = 0;
  for (const [sourceId, positions] of bySource) {
    await onProgress({ phase: 'copy', done, total: pages.length });
    const source = await PDFDocument.load(sourceBytes(sourceId));
    const result = await out.copyPages(source, positions.map(i => pages[i].pageIndex));
    result.forEach((page, k) => {
      const i = positions[k];
      copied[i] = page;
      if (pages[i].comments || ownedAnnots(sourceId, pages[i].pageIndex)?.size) annotRefs[i] = copiedAnnotRefs(source.getPage(pages[i].pageIndex), page);
    });
    done += positions.length;
  }
  const used = new Set();
  copied.forEach((page, i) => {
    page.setRotation(degrees(pages[i].rotation));
    drawMarks(page, pages[i].marks);
    out.addPage(page);
    if (annotRefs[i]) writeComments(page, pages[i].comments || [], annotRefs[i], ownedAnnots(pages[i].sourceId, pages[i].pageIndex) || new Set(), used);
  });
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

/** Map PDF.js annotation id ("12R", "12R1" for generation 1) → reference of its copy in the new document. */
function copiedAnnotRefs(sourcePage, copiedPage) {
  const refs = new Map();
  const original = sourcePage.node.Annots()?.asArray() || [], copy = copiedPage.node.Annots()?.asArray() || [];
  original.forEach((ref, i) => {
    if (ref instanceof PDFRef && copy[i] instanceof PDFRef) refs.set(`${ref.objectNumber}R${ref.generationNumber || ''}`, copy[i]);
  });
  return refs;
}

const text = value => PDFHexString.fromText(String(value ?? ''));
const FLAG_PRINT = 4, FLAG_NO_ZOOM = 8, FLAG_NO_ROTATE = 16;

/**
 * Replaces the annotations the comments were read from (`owned`, PDF.js ids) by the page's comments. Unchanged
 * comments keep their original annotation object (incl. popup and replies) – except on a repeated page, where they
 * are copied, because an annotation belongs to one page; changed ones are copied and updated, new ones created with
 * an appearance stream. Markup (highlight, underline, strike-out) is printed, notes are not (plan in
 * PLAN_SEITENBEARBEITUNG.md). Other annotations (links, form fields …) stay as they are. `used` collects the
 * references already placed on earlier pages.
 */
export function writeComments(page, comments, refs, owned, used) {
  const node = page.node, context = node.context;
  const ownedRefs = new Set([...owned].map(id => refs.get(id)).filter(Boolean));
  const entries = (node.Annots()?.asArray() || []).filter(ref => !ownedRefs.has(ref));
  if (!ownedRefs.size && !comments.length) return;
  const lookup = ref => context.lookup(ref, PDFDict);
  const register = dict => context.register(dict);
  const copyOf = ref => { const dict = context.obj({}); for (const [key, value] of lookup(ref).entries()) dict.set(key, value); return dict; };
  const popupOf = (parentRef, dict) => {
    const popup = dict.get(PDFName.of('Popup'));
    return popup instanceof PDFRef && ownedRefs.has(popup) && !used.has(popup) && lookup(popup).get(PDFName.of('Parent')) === parentRef ? popup : null;
  };
  const addPopup = (parentRef, dict, rect) => {
    const popup = register(context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [rect[2], rect[3] - 120, rect[2] + 200, rect[3]], Parent: parentRef, Open: false, F: FLAG_NO_ZOOM | FLAG_NO_ROTATE, P: page.ref }));
    dict.set(PDFName.of('Popup'), popup);
    entries.push(popup);
  };
  for (const c of comments) {
    const kind = COMMENT_KINDS[c.kind];
    if (!kind) continue;
    const origRef = c.orig && refs.get(c.orig.id);
    const keep = origRef && ownedRefs.has(origRef) && !commentChanged(c) && !used.has(origRef);
    let ref;
    if (keep) {
      ref = origRef;
      entries.push(ref);
      const popup = popupOf(ref, lookup(ref));
      if (popup) { entries.push(popup); used.add(popup); }
    } else {
      const dict = origRef && ownedRefs.has(origRef) ? copyOf(origRef) : newCommentDict(context, c, kind);
      dict.set(PDFName.of('P'), page.ref);
      dict.delete(PDFName.of('Popup'));
      if (!origRef || commentChanged(c)) {
        dict.set(PDFName.of('Contents'), text(c.text));
        dict.set(PDFName.of('M'), PDFString.of(pdfDate(c.date || new Date())));
        dict.set(PDFName.of('C'), context.obj(hexToRgb(c.color)));
        dict.set(PDFName.of('Rect'), context.obj(c.rect));
        if (kind.redraw && (!origRef || c.color !== c.orig.color || !dict.has(PDFName.of('AP')))) dict.set(PDFName.of('AP'), context.obj({ N: appearance(context, c) }));
      }
      ref = register(dict);
      entries.push(ref);
      if (c.kind !== 'freetext') addPopup(ref, dict, c.rect);
    }
    used.add(ref);
    for (const reply of c.replies || []) {
      const replyRef = reply.orig && refs.get(reply.orig);
      if (replyRef && ownedRefs.has(replyRef) && ref === origRef && !used.has(replyRef)) {
        entries.push(replyRef);
        used.add(replyRef);
        continue;
      }
      const dict = context.obj({
        Type: 'Annot', Subtype: 'Text', Rect: c.rect, Contents: text(reply.text), T: text(reply.author),
        M: PDFString.of(pdfDate(reply.date || new Date())), IRT: ref, RT: 'R', Name: 'Comment', C: hexToRgb(c.color), F: FLAG_NO_ZOOM | FLAG_NO_ROTATE, P: page.ref,
      });
      const added = register(dict);
      entries.push(added);
      used.add(added);
    }
  }
  if (entries.length) node.set(PDFName.of('Annots'), context.obj(entries));
  else node.delete(PDFName.of('Annots'));
}

function newCommentDict(context, c, kind) {
  const dict = context.obj({
    Type: 'Annot', Subtype: kind.subtype, Rect: c.rect, Contents: text(c.text), C: hexToRgb(c.color),
    M: PDFString.of(pdfDate(c.date || new Date())), CreationDate: PDFString.of(pdfDate(c.date || new Date())),
    F: c.kind === 'note' ? FLAG_NO_ZOOM | FLAG_NO_ROTATE : FLAG_PRINT,
  });
  if (c.author) dict.set(PDFName.of('T'), text(c.author));
  if (c.kind === 'note') { dict.set(PDFName.of('Name'), PDFName.of('Comment')); dict.set(PDFName.of('Open'), context.obj(false)); }
  if (c.quads) dict.set(PDFName.of('QuadPoints'), context.obj(c.quads));
  if (c.kind === 'highlight') dict.set(PDFName.of('CA'), context.obj(c.opacity ?? HIGHLIGHT_OPACITY));
  return dict;
}

/** Appearance stream (form XObject) of a note, highlight, underline, strike-out or squiggly comment. */
function appearance(context, c) {
  const rgb = hexToRgb(c.color);
  if (c.kind === 'note') {
    const flip = (x, y) => [x, NOTE_SIZE - y];
    const outline = NOTE_ICON.outline, ops = [setFillingRgbColor(...rgb), setStrokingRgbColor(0.2, 0.2, 0.2), setLineWidth(1), setLineJoin(LineJoinStyle.Round), moveTo(...flip(outline[0], outline[1]))];
    for (let i = 2; i < outline.length; i += 2) ops.push(lineTo(...flip(outline[i], outline[i + 1])));
    ops.push(closePath(), fillAndStroke());
    for (const [x1, y1, x2, y2] of NOTE_ICON.lines) ops.push(moveTo(...flip(x1, y1)), lineTo(...flip(x2, y2)));
    ops.push(stroke());
    return context.register(context.formXObject(ops, { BBox: [0, 0, NOTE_SIZE, NOTE_SIZE] }));
  }
  if (c.kind === 'highlight') {
    const opacity = c.opacity ?? HIGHLIGHT_OPACITY;
    const ops = [pushGraphicsState(), setGraphicsState('GS0'), setFillingRgbColor(...rgb)];
    for (const poly of highlightPolygons(c)) {
      ops.push(moveTo(poly[0], poly[1]));
      for (let i = 2; i < poly.length; i += 2) ops.push(lineTo(poly[i], poly[i + 1]));
      ops.push(closePath());
    }
    ops.push(fill(), popGraphicsState());
    return context.register(context.formXObject(ops, {
      BBox: c.rect, Resources: { ExtGState: { GS0: { Type: 'ExtGState', CA: opacity, ca: opacity, BM: 'Multiply' } } },
    }));
  }
  const ops = [setStrokingRgbColor(...rgb), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round)];
  for (const { points, width } of markupLines(c)) {
    ops.push(setLineWidth(width), moveTo(points[0], points[1]));
    for (let i = 2; i < points.length; i += 2) ops.push(lineTo(points[i], points[i + 1]));
    ops.push(stroke());
  }
  return context.register(context.formXObject(ops, { BBox: c.rect }));
}

/** Creates a one-page PDF with an empty page of the given size (PDF points). */
export async function createBlankPdf(width, height) {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return doc.save();
}
