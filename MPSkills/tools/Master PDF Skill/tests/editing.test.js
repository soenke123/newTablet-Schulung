import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, StandardFonts, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { buildPdf } from '../js/export.js';
import { watermarkLayout, textOutside, textInside, ocrItems, WATERMARK_DEFAULT } from '../js/editing.js';
import { analyzePage, glyphsIn } from '../js/textedit.js';

const dec = b => new TextDecoder('latin1').decode(b);
// A 1×1 white PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'), c => c.charCodeAt(0));

/** Every stream of the file, decoded, as one string – for "is this text still anywhere in the file?". */
function allStreams(doc) {
  let text = '';
  for (const [, obj] of doc.context.enumerateIndirectObjects()) if (obj instanceof PDFRawStream) { try { text += dec(decodePDFRawStream(obj).decode()) + '\n'; } catch { /* images */ } }
  return text;
}
function contentOf(doc, i) {
  const c = doc.getPage(i).node.Contents(), list = c.asArray ? c.asArray().map(r => doc.context.lookup(r)) : [c];
  return list.map(s => dec(decodePDFRawStream(s).decode())).join('\n');
}
const hexOf = s => Array.from(s, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
const hasText = (all, s) => all.toUpperCase().includes(hexOf(s)) || all.includes(`(${s})`);

async function letter() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('Datum: 12.10.2026', { x: 50, y: 200, size: 10, font });
  page.drawText('Geheimnis', { x: 50, y: 100, size: 10, font });
  return { bytes: await doc.save(), font };
}

test('Wasserzeichen: mittig, diagonal wie angezeigt, auch auf gedrehten Seiten', () => {
  const box = { x: 0, y: 0, width: 400, height: 300 }, widthOf = (t, s) => t.length * 0.6 * s;
  const a = watermarkLayout(box, 0, WATERMARK_DEFAULT, widthOf);
  assert.ok(Math.abs(a.angle - Math.atan2(300, 400) * 180 / Math.PI) < 1e-9);
  const mid = [a.origin[0] + a.dir[0] * a.width / 2 + a.up[0] * 0.36 * a.size, a.origin[1] + a.dir[1] * a.width / 2 + a.up[1] * 0.36 * a.size];
  assert.deepEqual(mid.map(Math.round), [200, 150]);
  const turned = watermarkLayout(box, 90, { ...WATERMARK_DEFAULT, layout: 'horizontal' }, widthOf);
  assert.equal(turned.angle, 90);
});

test('Text außerhalb der Schwärzung bleibt, Zeichen darunter fallen weg', () => {
  const items = [{ str: 'Name: Max Muster', transform: [10, 0, 0, 10, 0, 0], width: 160, height: 10 }];
  const kept = textOutside(items, [[60, -2, 160, 12]]);
  assert.deepEqual(kept.map(i => i.str.trim()), ['Name:']);
  assert.ok(kept[0].width <= 60);
  assert.deepEqual(textInside(kept, [[60, -2, 160, 12]]), []);
  assert.deepEqual(textInside(items, [[60, -2, 160, 12]]).join(''), 'MaxMuster');
});

test('OCR-Wörter werden Textstücke im PDF-Raum', () => {
  const lines = [{ bbox: { x0: 10, y0: 10, x1: 110, y1: 30 }, baseline: { x0: 10, y0: 26, x1: 110, y1: 26 }, words: [{ text: 'Hallo', bbox: { x0: 10, y0: 10, x1: 50, y1: 30 }, confidence: 90 }, { text: 'Welt', bbox: { x0: 60, y0: 10, x1: 110, y1: 30 }, confidence: 90 }] }];
  const items = ocrItems(lines, (x, y) => [x / 2, 300 - y / 2]);
  assert.deepEqual(items.map(i => i.str), ['Hallo', ' ', 'Welt']);
  assert.deepEqual(items[0].transform.slice(4), [5, 287]);
  assert.equal(items[0].width, 20);
  assert.equal(items.at(-1).hasEOL, true);
});

test('Schwärzen: Seite wird aus Bild + unsichtbarem Resttext neu gebaut, nichts Altes bleibt in der Datei', async () => {
  const { bytes } = await letter();
  const pages = [{ id: 1, sourceId: 's', pageIndex: 0, rotation: 0, marks: [{ id: 2, type: 'redact', points: [45, 95, 120, 112] }] }, { id: 3, sourceId: 's', pageIndex: 0, rotation: 90 }];
  const text = [{ str: 'Datum: 12.10.2026', transform: [10, 0, 0, 10, 50, 200], width: 85, height: 10 }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, () => {}, { rasters: new Map([[1, { data: PNG, png: true, box: { x: 0, y: 0, width: 400, height: 300 }, text }]]) }));
  assert.equal(out.getPageCount(), 2);
  const red = out.getPage(0), res = red.node.Resources();
  assert.deepEqual(res.lookup(PDFName.of('XObject'), PDFDict).keys().length, 1);
  const content = contentOf(out, 0);
  assert.match(content, /3 Tr/);
  assert.doesNotMatch(content, /\/\//);
  assert.ok(hasText(content, 'Datum: 12.10.2026'));
  assert.ok(!hasText(content, 'Geheimnis'));
  // The second (not redacted) copy still has its text: the secret is only kept there.
  assert.equal(out.getPage(1).getRotation().angle, 90);
});

test('Schwärzen ohne weitere Kopie: der geschwärzte Text steht nirgends mehr in der Datei', async () => {
  const { bytes } = await letter();
  const pages = [{ id: 1, sourceId: 's', pageIndex: 0, rotation: 0, marks: [{ id: 2, type: 'redact', points: [45, 95, 120, 112] }] }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, () => {}, { rasters: new Map([[1, { data: PNG, png: true, box: { x: 0, y: 0, width: 400, height: 300 }, text: [] }]]) }));
  const all = allStreams(out);
  assert.ok(!hasText(all, 'Geheimnis'));
  assert.ok(!hasText(all, 'Datum'));
});

test('Text ändern: alte Zeichen raus, neuer Text in der Originalschrift an derselben Stelle', async () => {
  const { bytes, font } = await letter();
  const widths = (base, ch) => font.widthOfTextAtSize(ch, 1);
  const src = await PDFDocument.load(bytes);
  const a = analyzePage(src.getPage(0), widths);
  const hit = glyphsIn(a.glyphs, [[84, 198, 140, 208]]);
  assert.equal(hit.map(i => a.glyphs[i].text).join(''), '12.10.2026');
  const g = a.glyphs[hit[0]];
  const mark = { id: 5, type: 'edit', points: [84, 198, 140, 208], text: '13.11.2026', old: '12.10.2026', style: { res: g.font, size: g.size, th: g.th, tc: g.tc, rise: g.rise, matrix: g.matrix }, color: '#000000', font: 'sans', bold: false };
  const out = await PDFDocument.load(await buildPdf([{ id: 1, sourceId: 's', pageIndex: 0, rotation: 0, marks: [mark] }], () => bytes, () => {}, {}));
  const all = allStreams(out);
  assert.ok(!hasText(all, '12.10.2026'));
  assert.ok(hasText(all, '13.11.2026'));
  const again = analyzePage(out.getPage(0), widths);
  const moved = again.glyphs.filter(x => x.text && x.text !== ' ');
  assert.equal(moved.map(x => x.text).join(''), 'Datum:Geheimnis13.11.2026');
  assert.deepEqual(moved.at(-10).origin.map(v => Math.round(v * 100) / 100), g.origin.map(v => Math.round(v * 100) / 100));
});

test('Text ändern: fehlt ein Zeichen in der Schrift, wird eine Standardschrift genommen', async () => {
  const { bytes } = await letter();
  const mark = { id: 5, type: 'edit', points: [80, 198, 140, 208], text: 'morgen ✓', style: { res: 'NoSuchFont', size: 10, th: 1, tc: 0, rise: 0, matrix: [1, 0, 0, 1, 83, 200] }, color: '#cc0000', font: 'serif', bold: true };
  const out = await PDFDocument.load(await buildPdf([{ id: 1, sourceId: 's', pageIndex: 0, rotation: 0, marks: [mark] }], () => bytes, () => {}, {}));
  const fonts = out.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
  const names = fonts.keys().map(k => out.context.lookup(fonts.get(k)).lookup(PDFName.of('BaseFont')).asString());
  assert.ok(names.includes('/Times-Bold'));
  assert.ok(hasText(allStreams(out), 'morgen ?'));
});

test('Wasserzeichen und OCR-Text landen auf jeder exportierten Seite', async () => {
  const { bytes } = await letter();
  const ocr = [{ str: 'Scan', transform: [12, 0, 0, 12, 20, 20], width: 30, height: 12 }];
  const out = await PDFDocument.load(await buildPdf([{ id: 1, sourceId: 's', pageIndex: 0, rotation: 0 }, { id: 2, sourceId: 's', pageIndex: 0, rotation: 0 }], () => bytes, () => {}, { watermark: { ...WATERMARK_DEFAULT, text: 'KOPIE' }, invisibleText: new Map([[2, ocr]]) }));
  const page = i => contentOf(out, i);
  for (const i of [0, 1]) assert.ok(hasText(page(i), 'KOPIE'));
  assert.ok(!hasText(page(0), 'Scan'));
  assert.ok(hasText(page(1), 'Scan'));
  assert.match(page(1), /q BT 3 Tr[\s\S]*ET Q/);
  assert.match(page(0), /BT 0 Tr/);
});
