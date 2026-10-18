import {
  PDFDocument, PDFArray, PDFName, PDFRef, PDFDict, PDFHexString, PDFString, PDFBool, StandardFonts, degrees, LineCapStyle, LineJoinStyle,
  PDFObjectCopier, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList,
  beginText, endText, setFontAndSize, moveText, showText,
  pushGraphicsState, popGraphicsState, setGraphicsState, setStrokingRgbColor, setFillingRgbColor, setLineWidth, setLineCap, setLineJoin,
  moveTo, lineTo, appendBezierCurve, closePath, stroke, fill, fillAndStroke, drawObject, concatTransformationMatrix,
} from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { hexToRgb, isHighlight, fillShare, strokeBox, markBounds, arrowWings, arrowLength, imageMatrix, localSize, textLines, textFontName, TEXT_FONTS, TEXT_LINE } from './annotations.js';
import { COMMENT_KINDS, COMMENT_STATES, HIGHLIGHT_OPACITY, NOTE_SIZE, NOTE_ICON, FREETEXT_SIZE, FREETEXT_BORDER, commentChanged, highlightPolygons, markupLines, freeTextLines, pdfDate } from './comments.js';

/**
 * Builds a new PDF from virtual page records `[{sourceId, pageIndex, rotation, marks?, comments?}]` (rotation is
 * absolute; marks are drawn permanently into the page content, see drawMarks; comments stay annotations, see
 * writeComments). `ownedAnnots(sourceId, pageIndex)` returns the ids of the source annotations the comments were read
 * from (comments.js importAnnotations). `formValues(sourceId)` returns the changed form field values of a source as
 * Map fieldName → value (forms.js), see writeForms.
 * Uses one copyPages call per source so shared resources (fonts, images) are stored only once,
 * even when pages repeat. `onProgress({phase:'copy'|'save', done, total})` may be async (to let the UI repaint).
 */
export async function buildPdf(pages, sourceBytes, onProgress = () => {}, { ownedAnnots = () => null, formValues = () => null } = {}) {
  const out = await PDFDocument.create();
  const bySource = new Map();
  pages.forEach((page, i) => {
    if (!bySource.has(page.sourceId)) bySource.set(page.sourceId, []);
    bySource.get(page.sourceId).push(i);
  });
  const copied = new Array(pages.length), annotRefs = new Array(pages.length), forms = new Map();
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
    const form = sourceForm(source, out);
    if (form) forms.set(sourceId, { ...form, values: formValues(sourceId) });
    done += positions.length;
  }
  const used = new Set();
  const font = pages.some(p => p.comments?.some(c => c.kind === 'freetext')) ? await textFont(out) : null;
  const images = await embedImages(out, pages), fonts = await embedTextFonts(out, pages);
  copied.forEach((page, i) => {
    page.setRotation(degrees(pages[i].rotation));
    drawMarks(page, pages[i].marks, images, fonts);
    out.addPage(page);
    if (annotRefs[i]) writeComments(page, pages[i].comments || [], annotRefs[i], ownedAnnots(pages[i].sourceId, pages[i].pageIndex) || new Set(), used, font);
  });
  const withForm = forms.size && await writeForms(out, copied.map((page, i) => ({ page, sourceId: pages[i].sourceId })), forms);
  await onProgress({ phase: 'save', done, total: pages.length });
  return out.save(withForm ? { updateFieldAppearances: false } : {});
}

const FIELD_KEYS = ['FT', 'Parent', 'T', 'TU', 'TM', 'Ff', 'V', 'DV', 'Opt', 'TI', 'I', 'MaxLen'].map(key => PDFName.of(key));
const [N_ANNOTS, N_SUBTYPE, N_WIDGET, N_PARENT, N_KIDS, N_T, N_FT, N_P, N_V, N_I, N_AP, N_DR, N_DA, N_ACROFORM, N_NEED] =
  ['Annots', 'Subtype', 'Widget', 'Parent', 'Kids', 'T', 'FT', 'P', 'V', 'I', 'AP', 'DR', 'DA', 'AcroForm', 'NeedAppearances'].map(key => PDFName.of(key));

/** /DR, /DA and /NeedAppearances of a source's form, copied into `out`; null when the source has no form fields. */
function sourceForm(source, out) {
  const acro = source.catalog.lookupMaybe(N_ACROFORM, PDFDict);
  if (!acro?.lookupMaybe(PDFName.of('Fields'), PDFArray)?.size()) return null;
  const dr = acro.lookupMaybe(N_DR, PDFDict), da = acro.lookup(N_DA);
  return {
    dr: dr ? PDFObjectCopier.for(source.context, out.context).copy(dr) : null,
    da: da instanceof PDFString || da instanceof PDFHexString ? da : null,
    need: acro.lookup(N_NEED) === PDFBool.True,
  };
}

/**
 * Form fields: copyPages brings the widgets (and the field dictionaries above them) along, but not the catalog's
 * /AcroForm, so other programs would no longer see a form. This collects the fields of the widgets that ended up on
 * the exported pages into a new /AcroForm:
 * - a page that is exported twice shares its widget objects (one copyPages per source): the second copy gets its own
 *   widget of the same field (a widget that is the field itself is split into field + two widgets first);
 * - widgets of pages that were not exported are dropped from /Kids;
 * - fields of different files with the same name are renamed ("Name_2"), they hold different values in the app.
 * Then the changed values (`forms.get(sourceId).values`, forms.js shapes) are set with new appearances (Helvetica);
 * a field pdf-lib cannot draw keeps the value and the form gets /NeedAppearances. Returns true when a form was written.
 */
async function writeForms(out, placed, forms) {
  const context = out.context, lookup = ref => context.lookup(ref);
  const parentOf = dict => { const parent = dict.get(N_PARENT); return parent instanceof PDFRef ? parent : null; };
  const isFieldWidget = dict => dict instanceof PDFDict && dict.get(N_SUBTYPE) === N_WIDGET && (dict.has(N_T) || dict.has(N_FT) || !!parentOf(dict));
  const seen = new Set(), sourceOf = new Map();
  for (const { page, sourceId } of placed) {
    if (!forms.has(sourceId)) continue;
    const annots = page.node.lookupMaybe(N_ANNOTS, PDFArray);
    if (!annots) continue;
    // Repeated pages share even direct objects (see drawMarks): every page gets its own /Annots array.
    const own = annots.asArray().slice();
    own.forEach((ref, k) => {
      if (!(ref instanceof PDFRef) || !isFieldWidget(lookup(ref))) return;
      if (seen.has(ref)) own[k] = ref = duplicateWidget(context, ref);
      lookup(ref).set(N_P, page.ref);
      seen.add(ref);
      sourceOf.set(ref, sourceId);
    });
    page.node.set(N_ANNOTS, context.obj(own));
  }
  if (!seen.size) return false;
  const fullName = ref => {
    const parts = [];
    for (let node = ref; node; node = parentOf(lookup(node))) {
      const t = lookup(node).lookup(N_T);
      if (t instanceof PDFString || t instanceof PDFHexString) parts.unshift(t.decodeText());
    }
    return parts.join('.');
  };
  const terminals = new Map(), roots = [], rootSource = new Map();
  for (const ref of seen) {
    const dict = lookup(ref);
    const terminal = dict.has(N_T) || !parentOf(dict) ? ref : parentOf(dict);
    if (!terminals.has(terminal)) terminals.set(terminal, { sourceId: sourceOf.get(ref), name: fullName(terminal) });
    let root = terminal;
    while (parentOf(lookup(root))) root = parentOf(lookup(root));
    if (!rootSource.has(root)) { rootSource.set(root, sourceOf.get(ref)); roots.push(root); }
  }
  const prune = ref => {
    const dict = lookup(ref), kids = dict.lookupMaybe(N_KIDS, PDFArray);
    if (!kids) return seen.has(ref);
    const left = kids.asArray().filter(kid => kid instanceof PDFRef && prune(kid));
    if (left.length !== kids.size()) dict.set(N_KIDS, context.obj(left));
    return left.length > 0 || seen.has(ref);
  };
  roots.forEach(prune);
  const names = new Map();
  for (const root of roots) {
    const dict = lookup(root), t = dict.lookup(N_T);
    if (!(t instanceof PDFString || t instanceof PDFHexString)) continue;
    const base = t.decodeText(), sourceId = rootSource.get(root);
    let name = base, n = 1;
    while (names.has(name) && names.get(name) !== sourceId) name = `${base}_${++n}`;
    if (name !== base) dict.set(N_T, text(name));
    names.set(name, sourceId);
  }
  const acro = context.obj({ Fields: roots });
  const dr = context.obj({});
  for (const sourceId of new Set(rootSource.values())) {
    const form = forms.get(sourceId);
    for (const [key, value] of form.dr?.entries() || []) {
      const into = dr.lookupMaybe(key, PDFDict), from = context.lookup(value);
      if (into && from instanceof PDFDict) { for (const [k, v] of from.entries()) if (!into.has(k)) into.set(k, v); }
      else if (!dr.has(key)) dr.set(key, from instanceof PDFDict ? from.clone(context) : value);
    }
    if (form.da && !acro.has(N_DA)) acro.set(N_DA, form.da);
    if (form.need) acro.set(N_NEED, PDFBool.True);
  }
  if (dr.keys().length) acro.set(N_DR, dr);
  out.catalog.set(N_ACROFORM, context.register(acro));
  const changed = [...terminals].filter(([, info]) => forms.get(info.sourceId).values?.has(info.name));
  if (!changed.length) return true;
  const form = out.getForm(), font = await out.embedFont(StandardFonts.Helvetica);
  const byRef = new Map(form.getFields().map(field => [field.ref, field]));
  for (const [ref, info] of changed) {
    const field = byRef.get(ref);
    if (field && !setFieldValue(field, forms.get(info.sourceId).values.get(info.name), font)) {
      // Readers then draw the value themselves; an old appearance would still show the old value.
      acro.set(N_NEED, PDFBool.True);
      if (!(field instanceof PDFCheckBox || field instanceof PDFRadioGroup)) for (const widget of field.acroField.getWidgets()) widget.dict.delete(N_AP);
    }
    if (field) form.markFieldAsClean(field.ref);
  }
  return true;
}

/** A second widget of the same field for a repeated page (see writeForms); returns its reference. */
function duplicateWidget(context, ref) {
  const dict = context.lookup(ref), clone = dict.clone(context);
  let field = dict.get(N_PARENT);
  if (dict.has(N_T)) {
    // The widget is the field itself: move the field entries into a new parent with both widgets as kids.
    const node = context.obj({});
    for (const key of FIELD_KEYS) if (dict.has(key)) { node.set(key, dict.get(key)); dict.delete(key); clone.delete(key); }
    const nodeRef = context.register(node), parent = node.get(N_PARENT);
    const siblings = parent instanceof PDFRef ? context.lookup(parent).lookupMaybe(N_KIDS, PDFArray) : null;
    if (siblings) siblings.asArray().forEach((kid, i) => { if (kid === ref) siblings.set(i, nodeRef); });
    node.set(N_KIDS, context.obj([ref]));
    dict.set(N_PARENT, nodeRef);
    field = nodeRef;
  }
  clone.set(N_PARENT, field);
  const cloneRef = context.register(clone);
  context.lookup(field).lookup(N_KIDS, PDFArray).push(cloneRef);
  return cloneRef;
}

/** Sets a value (forms.js shape) and draws the field anew; false when pdf-lib cannot draw it (value is set anyway). */
function setFieldValue(field, value, font) {
  try {
    if (field instanceof PDFTextField) {
      try { field.setText(value || undefined); } catch { field.acroField.dict.set(N_V, text(value)); }
    } else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
      // Radio buttons with /Opt have numbered states; PDF.js may report the option text instead.
      if (field instanceof PDFRadioGroup && value && value !== 'Off' && !field.acroField.getOnValues().some(on => on.decodeText() === value) && field.getOptions().includes(value)) field.select(value);
      else field.acroField.setValue(PDFName.of(value || 'Off'));
      return true;
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const values = Array.isArray(value) ? value : [];
      if (!values.length) field.acroField.dict.delete(N_V);
      else field.acroField.dict.set(N_V, values.length === 1 ? text(values[0]) : field.acroField.dict.context.obj(values.map(v => text(v))));
      field.acroField.dict.delete(N_I);
    } else return true;
    field.updateAppearances(font);
    return true;
  } catch (error) {
    console.warn('Formularfeld konnte nicht neu gezeichnet werden', field.getName?.(), error);
    return false;
  }
}

/** Bytes of a base64 data URL. */
export function dataUrlBytes(url) {
  const bin = atob(String(url).slice(String(url).indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Every picture (image mark) once per document, also when it is used on several pages: data URL → image ref. */
async function embedImages(doc, pages) {
  const images = new Map();
  for (const page of pages) for (const mark of page.marks || []) {
    if (mark.type !== 'image' || images.has(mark.src)) continue;
    const bytes = dataUrlBytes(mark.src);
    const image = mark.src.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    images.set(mark.src, image.ref);
  }
  return images;
}

/** A standard font (WinAnsi) with `ref`, `widthOf(text, size)` and `encode(text)`; characters it cannot show become "?". */
async function standardFont(doc, name) {
  const font = await doc.embedFont(name);
  const known = new Set(font.getCharacterSet());
  const clean = value => Array.from(String(value), ch => known.has(ch.codePointAt(0)) ? ch : '?').join('');
  return { ref: font.ref, widthOf: (value, size) => font.widthOfTextAtSize(clean(value), size), encode: value => font.encodeText(clean(value)), unknown: value => [...new Set(Array.from(String(value)).filter(ch => ch !== '\n' && !known.has(ch.codePointAt(0))))] };
}

/** The standard fonts used by text marks, once per document: PDF font name → standardFont. */
async function embedTextFonts(doc, pages) {
  const fonts = new Map();
  for (const page of pages) for (const mark of page.marks || []) {
    const name = mark.type === 'text' && textFontName(mark);
    if (name && !fonts.has(name)) fonts.set(name, await standardFont(doc, name));
  }
  return fonts;
}

/** Text measuring for text marks in the app (same metrics as the export): widthOf(text, size, pdfFont), unknown(text, pdfFont). */
export async function fontMetrics() {
  const doc = await PDFDocument.create(), fonts = new Map();
  for (const font of Object.values(TEXT_FONTS)) for (const name of font.pdf) fonts.set(name, await standardFont(doc, name));
  const get = name => fonts.get(name) || fonts.get('Helvetica');
  return { widthOf: (text, size, name) => get(name).widthOf(text, size), unknown: (text, name) => get(name).unknown(text) };
}

/**
 * Draws marks (PDF user space, see annotations.js) as vector graphics on top of the page content; highlighter
 * strokes first (transparent, multiplied, so text stays readable), then everything else in drawing order.
 * Opacity goes into an ExtGState. A filled rectangle or ellipse becomes a transparency group (form XObject): fill
 * under the opaque line inside, the opacity applied to the whole group – no darker overlap and no seam.
 * Pictures (tab "Einfügen") are image XObjects placed with imageMatrix, text marks real text in a standard font in
 * the same upright frame (searchable, selectable), both in drawing order with the strokes.
 * Repeated pages share copied objects (copyPages caches even direct ones), so the page first gets its own
 * /Contents array – otherwise pdf-lib would append the marks to every copy of the page.
 */
export function drawMarks(page, marks, images = new Map(), fonts = new Map()) {
  const list = (marks || []).filter(m => m.points?.length >= 2);
  if (!list.length) return;
  const node = page.node, contents = node.context.lookup(node.get(PDFName.of('Contents')));
  if (contents instanceof PDFArray) node.set(PDFName.of('Contents'), node.context.obj(contents.asArray()));
  const states = new Map();
  const graphicsState = (stroke, fillAlpha, multiply) => {
    const key = `${stroke}|${fillAlpha}|${multiply}`;
    if (!states.has(key)) states.set(key, node.newExtGState('GS', node.context.obj({ Type: 'ExtGState', CA: stroke, ca: fillAlpha, ...(multiply ? { BM: 'Multiply' } : {}) })));
    return states.get(key);
  };
  const ops = [];
  for (const mark of [...list.filter(isHighlight), ...list.filter(m => !isHighlight(m))]) {
    if (mark.type === 'text') {
      const font = fonts.get(textFontName(mark)), lines = textLines(mark);
      if (!font || !lines.length) continue;
      // Frame in pt with the origin at its lower-left corner, y up: the unit square of imageMatrix scaled by its size.
      const [a, b, c, d, e, f] = imageMatrix(mark), { w, h } = localSize(mark);
      const name = node.newFontDictionary('F', font.ref);
      const text = [beginText(), setFontAndSize(name, mark.size), setFillingRgbColor(...hexToRgb(mark.color || '#000000'))];
      let last = [0, 0];
      for (const line of lines) { const pos = [line.x, h - line.y]; text.push(moveText(pos[0] - last[0], pos[1] - last[1]), showText(font.encode(line.text))); last = pos; }
      ops.push(pushGraphicsState(), concatTransformationMatrix(a / w, b / w, c / h, d / h, e, f), ...text, endText(), popGraphicsState());
      continue;
    }
    if (mark.type === 'image') {
      const ref = images.get(mark.src);
      if (ref) ops.push(pushGraphicsState(), concatTransformationMatrix(...imageMatrix(mark)), drawObject(node.newXObject('Im', ref)), popGraphicsState());
      continue;
    }
    const opacity = mark.opacity ?? 1, share = fillShare(mark), color = hexToRgb(mark.color);
    const width = mark.type === 'rect' || mark.type === 'ellipse' ? strokeBox(mark).width : mark.width;
    const line = [setStrokingRgbColor(...color), setLineWidth(width), setLineCap(LineCapStyle.Round), setLineJoin(mark.type === 'rect' ? LineJoinStyle.Miter : LineJoinStyle.Round), ...markPath(mark), stroke()];
    ops.push(pushGraphicsState());
    if (isHighlight(mark) || opacity < 1) ops.push(setGraphicsState(graphicsState(opacity, opacity, isHighlight(mark))));
    if (share) {
      const b = markBounds(mark);
      const group = [pushGraphicsState(), ...(share < 1 ? [setGraphicsState('G0')] : []), setFillingRgbColor(...color), ...markPath(mark), fill(), popGraphicsState(), ...line];
      const ref = node.context.register(node.context.formXObject(group, {
        BBox: [b.x0 - 1, b.y0 - 1, b.x1 + 1, b.y1 + 1], Group: { S: 'Transparency', CS: 'DeviceRGB' },
        Resources: { ExtGState: { G0: { Type: 'ExtGState', ca: share } } },
      }));
      ops.push(drawObject(node.newXObject('Fm', ref)));
    } else ops.push(...line);
    ops.push(popGraphicsState());
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
  if (mark.type === 'rect') { const b = strokeBox(mark); return [moveTo(b.x0, b.y0), lineTo(b.x1, b.y0), lineTo(b.x1, b.y1), lineTo(b.x0, b.y1), closePath()]; }
  const [x1, y1, x2, y2] = p;
  if (mark.type === 'ellipse') {
    const b = strokeBox(mark), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = (b.x1 - b.x0) / 2, ry = (b.y1 - b.y0) / 2, kx = rx * KAPPA, ky = ry * KAPPA;
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

/**
 * Helvetica (standard font, WinAnsi) for text boxes: `ref` for the appearance resources, `widthOf(text, size)` in
 * points and `encode(text)`, which replaces characters the font cannot show with "?".
 */
async function textFont(doc) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const known = new Set(font.getCharacterSet());
  const clean = value => Array.from(String(value), ch => known.has(ch.codePointAt(0)) ? ch : '?').join('');
  return { ref: font.ref, widthOf: (value, size) => font.widthOfTextAtSize(clean(value), size), encode: value => font.encodeText(clean(value)) };
}

/** Text measuring for the app (same Helvetica metrics as the exported text boxes). */
export async function textMetrics() {
  const { widthOf } = await textFont(await PDFDocument.create());
  return widthOf;
}
const FLAG_HIDDEN = 2, FLAG_PRINT = 4, FLAG_NO_ZOOM = 8, FLAG_NO_ROTATE = 16;

/**
 * Replaces the annotations the comments were read from (`owned`, PDF.js ids) by the page's comments. Unchanged
 * comments keep their original annotation object (incl. popup and replies) – except on a repeated page, where they
 * are copied, because an annotation belongs to one page; changed ones are copied and updated, new ones created with
 * an appearance stream. Markup (highlight, underline, strike-out) is printed, notes are not (plan in
 * PLAN_SEITENBEARBEITUNG.md). Other annotations (links, form fields …) stay as they are. `used` collects the
 * references already placed on earlier pages.
 */
export function writeComments(page, comments, refs, owned, used, font = null) {
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
        dict.set(PDFName.of('Rect'), context.obj(c.rect));
        if (c.kind === 'freetext') {
          // Text boxes: /C would be read as background by some readers, the text colour goes into /DA.
          if (c.fill) dict.set(PDFName.of('C'), context.obj(hexToRgb(c.fill))); else dict.delete(PDFName.of('C'));
          // Frame: width in /BS, colour in /MK /BC (read back by PDF.js as borderColor); no frame = width 0.
          dict.set(PDFName.of('BS'), context.obj({ W: c.border ? FREETEXT_BORDER : 0, S: 'S' }));
          if (c.border) dict.set(PDFName.of('MK'), context.obj({ BC: hexToRgb(c.border) })); else dict.delete(PDFName.of('MK'));
          dict.set(PDFName.of('DA'), PDFString.of(`/Helv ${c.fontSize || FREETEXT_SIZE} Tf ${hexToRgb(c.color).map(v => Math.round(v * 1000) / 1000).join(' ')} rg`));
          if (font) dict.set(PDFName.of('AP'), context.obj({ N: freeTextAppearance(context, c, font) }));
        } else {
          dict.set(PDFName.of('C'), context.obj(hexToRgb(c.color)));
          if (kind.redraw && (!origRef || c.color !== c.orig.color || !dict.has(PDFName.of('AP')))) dict.set(PDFName.of('AP'), context.obj({ N: appearance(context, c) }));
        }
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
    const status = c.status && COMMENT_STATES[c.status.state];
    if (status) {
      const statusRef = c.status.orig && refs.get(c.status.orig);
      if (statusRef && ownedRefs.has(statusRef) && ref === origRef && !used.has(statusRef)) {
        entries.push(statusRef);
        used.add(statusRef);
      } else {
        // Hidden reply with the review state, as Acrobat writes it ("Status festlegen").
        const dict = context.obj({
          Type: 'Annot', Subtype: 'Text', Rect: c.rect, Contents: text(`${status.label}${c.status.author ? ` (${c.status.author})` : ''}`),
          M: PDFString.of(pdfDate(c.status.date || new Date())), IRT: ref, Name: 'Comment', F: FLAG_HIDDEN | FLAG_NO_ZOOM | FLAG_NO_ROTATE, P: page.ref,
        });
        dict.set(PDFName.of('State'), PDFString.of(status.pdf));
        dict.set(PDFName.of('StateModel'), PDFString.of('Review'));
        if (c.status.author) dict.set(PDFName.of('T'), text(c.status.author));
        const added = register(dict);
        entries.push(added);
        used.add(added);
      }
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

/** Appearance stream of a text box: optional background and frame (inside the rect), then the lines in Helvetica. */
function freeTextAppearance(context, c, font) {
  const size = c.fontSize || FREETEXT_SIZE, [x0, y0, x1, y1] = c.rect, ops = [];
  if (c.fill) ops.push(setFillingRgbColor(...hexToRgb(c.fill)), moveTo(x0, y0), lineTo(x1, y0), lineTo(x1, y1), lineTo(x0, y1), closePath(), fill());
  if (c.border) {
    const w = FREETEXT_BORDER, h = w / 2;
    ops.push(setStrokingRgbColor(...hexToRgb(c.border)), setLineWidth(w), moveTo(x0 + h, y0 + h), lineTo(x1 - h, y0 + h), lineTo(x1 - h, y1 - h), lineTo(x0 + h, y1 - h), closePath(), stroke());
  }
  ops.push(beginText(), setFontAndSize('Helv', size), setFillingRgbColor(...hexToRgb(c.color)));
  let last = [0, 0];
  for (const line of freeTextLines(c)) {
    ops.push(moveText(line.x - last[0], line.y - last[1]), showText(font.encode(line.text)));
    last = [line.x, line.y];
  }
  ops.push(endText());
  return context.register(context.formXObject(ops, { BBox: c.rect, Resources: { Font: { Helv: font.ref } } }));
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
