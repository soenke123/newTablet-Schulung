import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFArray, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { buildPdf, createBlankPdf } from '../js/export.js';

async function sourceWithSharedFont(count) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++) doc.addPage([200 + i, 300]).drawText(`Seite ${i + 1}`, { font, x: 20, y: 20 });
  return doc.save();
}

test('Export übernimmt Reihenfolge, Duplikate, Drehung und mehrere Quellen', async () => {
  const sources = { a: await sourceWithSharedFont(3), b: await createBlankPdf(500, 400) };
  const pages = [
    { sourceId: 'a', pageIndex: 2, rotation: 0 },
    { sourceId: 'b', pageIndex: 0, rotation: 90 },
    { sourceId: 'a', pageIndex: 0, rotation: 180 },
    { sourceId: 'a', pageIndex: 2, rotation: 270 },
  ];
  const phases = [];
  const out = await PDFDocument.load(await buildPdf(pages, id => sources[id], p => phases.push(p.phase)));
  assert.equal(out.getPageCount(), 4);
  assert.deepEqual(out.getPages().map(p => p.getWidth()), [202, 500, 200, 202]);
  assert.deepEqual(out.getPages().map(p => p.getRotation().angle), [0, 90, 180, 270]);
  assert.equal(phases.at(-1), 'save');
});

test('Gemeinsame Schriften werden beim Export nur einmal gespeichert', async () => {
  const bytes = await sourceWithSharedFont(20);
  const pages = Array.from({ length: 20 }, (_, i) => ({ sourceId: 'a', pageIndex: i, rotation: 0 }));
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes));
  const fontCount = out.context.enumerateIndirectObjects().filter(([, obj]) => String(obj).includes('/Type /Font')).length;
  assert.equal(fontCount, 1);
});

test('Leere Seite hat die gewünschte Größe', async () => {
  const doc = await PDFDocument.load(await createBlankPdf(595.28, 841.89));
  assert.equal(doc.getPageCount(), 1);
  assert.equal(Math.round(doc.getPage(0).getHeight()), 842);
});

const ink = { type: 'ink', color: '#ff0000', width: 3, points: [10, 10, 50, 60, 90, 20] };
function pageContent(page) {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => page.node.context.lookup(ref)) : [contents];
  return streams.map(s => new TextDecoder().decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n');
}

test('Zeichnungen werden fest in die Seite geschrieben, nur auf der gezeichneten Kopie', async () => {
  const bytes = await sourceWithSharedFont(1);
  const pages = [{ sourceId: 'a', pageIndex: 0, rotation: 0, marks: [ink] }, { sourceId: 'a', pageIndex: 0, rotation: 0 }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes));
  const [drawn, plain] = out.getPages().map(pageContent);
  assert.match(drawn, /1 0 0 RG/);
  assert.match(drawn, /10 10 m\s+50 60 l\s+90 20 l\s+S/);
  assert.match(drawn, /Seite 1|BT/);
  assert.doesNotMatch(plain, /RG/);
});

test('Gemeinsames Contents-Array wird vor dem Zeichnen getrennt', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('x', { x: 5, y: 5 });
  const shared = doc.context.obj(page.node.Contents().asArray());
  page.node.set(PDFName.of('Contents'), doc.context.register(shared));
  const bytes = await doc.save();
  const pages = [{ sourceId: 'a', pageIndex: 0, rotation: 0 }, { sourceId: 'a', pageIndex: 0, rotation: 0, marks: [ink] }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes));
  const [plain, drawn] = out.getPages().map(pageContent);
  assert.doesNotMatch(plain, /RG/);
  assert.match(drawn, /1 0 0 RG/);
});

test('Formen und Textmarker werden als Vektoren exportiert, Textmarker transparent darunter', async () => {
  const bytes = await createBlankPdf(300, 300);
  const marks = [
    { type: 'rect', color: '#000000', width: 2, points: [10, 10, 60, 40] },
    { type: 'ellipse', color: '#000000', width: 2, points: [100, 100, 200, 150] },
    { type: 'arrow', color: '#000000', width: 2, points: [0, 0, 100, 0] },
    { type: 'ink', color: '#facc15', width: 14, opacity: 0.4, blend: 'multiply', points: [20, 200, 200, 200] },
  ];
  const out = await PDFDocument.load(await buildPdf([{ sourceId: 'a', pageIndex: 0, rotation: 0, marks }], () => bytes));
  const page = out.getPage(0), content = pageContent(page);
  assert.match(content, /10 10 m\s+60 10 l\s+60 40 l\s+10 40 l\s+h/);
  assert.match(content, /200 125 m\s+[\d. ]+c/);
  assert.ok(content.indexOf('/GS') < content.indexOf('10 10 m'), 'Textmarker zuerst');
  const gs = page.node.Resources().lookup(PDFName.of('ExtGState'));
  const state = gs.lookup(gs.keys()[0]);
  assert.equal(state.get(PDFName.of('CA')).asNumber(), 0.4);
  assert.equal(state.get(PDFName.of('BM')).toString(), '/Multiply');
});
