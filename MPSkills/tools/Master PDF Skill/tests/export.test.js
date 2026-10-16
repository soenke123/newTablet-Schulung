import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFArray, PDFName, PDFRawStream, PDFHexString, StandardFonts, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';
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

test('Deckkraft und Füllung von Formen landen im ExtGState (CA Linie, ca Füllung)', async () => {
  const bytes = await createBlankPdf(300, 300);
  const marks = [
    { type: 'rect', color: '#dc2626', width: 2, points: [10, 10, 60, 40], fill: 'light' },
    { type: 'ellipse', color: '#1d4ed8', width: 2, points: [100, 100, 200, 150], fill: 'solid' },
    { type: 'ink', color: '#111827', width: 3, opacity: 0.5, points: [0, 0, 50, 50] },
  ];
  const out = await PDFDocument.load(await buildPdf([{ sourceId: 'a', pageIndex: 0, rotation: 0, marks }], () => bytes));
  const page = out.getPage(0), content = pageContent(page);
  assert.match(content, / rg[\s\S]*10 10 m[\s\S]*h\s+B/, 'Rechteck gefüllt und umrandet');
  assert.match(content, /200 125 m[\s\S]*h\s+B/, 'Ellipse gefüllt und umrandet');
  const gs = page.node.Resources().lookup(PDFName.of('ExtGState'));
  const states = gs.keys().map(k => gs.lookup(k)).map(st => [st.get(PDFName.of('CA')).asNumber(), st.get(PDFName.of('ca')).asNumber(), !!st.get(PDFName.of('BM'))]);
  assert.deepEqual(states.sort(), [[0.5, 0.5, false], [1, 0.25, false]], 'volle Füllung braucht keinen eigenen Zustand');
});

// Comments stay real annotations: a source page with a highlight (+ popup), a note with a reply and a link.
async function sourceWithComments() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  const ctx = doc.context;
  const hl = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [10, 10, 100, 30], QuadPoints: [10, 30, 100, 30, 10, 10, 100, 10], C: [1, 1, 0], Contents: PDFHexString.fromText('Wichtig') }));
  const popup = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [100, 10, 200, 80], Parent: hl }));
  ctx.lookup(hl).set(PDFName.of('Popup'), popup);
  const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 300, 70, 320], Contents: PDFHexString.fromText('Frage') }));
  const reply = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 300, 70, 320], Contents: PDFHexString.fromText('Antwort'), IRT: note, RT: 'R' }));
  const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10] }));
  page.node.set(PDFName.of('Annots'), ctx.obj([hl, popup, note, reply, link]));
  const id = ref => `${ref.objectNumber}R`;
  const comments = [
    { id: 1, kind: 'highlight', color: '#ffff00', text: 'Wichtig', author: '', date: null, rect: [10, 10, 100, 30], quads: [10, 30, 100, 30, 10, 10, 100, 10], replies: [], orig: { id: id(hl), text: 'Wichtig', color: '#ffff00', rect: [10, 10, 100, 30] } },
    { id: 2, kind: 'note', color: '#facc15', text: 'Frage', author: '', date: null, rect: [50, 300, 70, 320], replies: [{ id: 3, author: '', text: 'Antwort', date: null, orig: id(reply) }], orig: { id: id(note), text: 'Frage', color: '#facc15', rect: [50, 300, 70, 320] } },
  ];
  return { bytes: await doc.save(), comments, owned: new Set([hl, popup, note, reply].map(id)) };
}
const annotsOf = page => (page.node.Annots()?.asArray() || []).map(ref => ({ ref, dict: page.node.context.lookup(ref) }));
const subtype = a => a.dict.get(PDFName.of('Subtype')).decodeText();
const contents = a => a.dict.get(PDFName.of('Contents'))?.decodeText();

test('Unveränderte Kommentare bleiben die Original-Annotationen, andere Annotationen bleiben stehen', async () => {
  const { bytes, comments, owned } = await sourceWithComments();
  const pages = [{ sourceId: 'a', pageIndex: 0, rotation: 0, comments }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, undefined, { ownedAnnots: () => owned }));
  const annots = annotsOf(out.getPage(0));
  assert.deepEqual(annots.map(subtype), ['Link', 'Highlight', 'Popup', 'Text', 'Text']);
  assert.deepEqual(annots.map(contents), [undefined, 'Wichtig', undefined, 'Frage', 'Antwort']);
  assert.equal(annots[2].dict.get(PDFName.of('Parent')), annots[1].ref);
  assert.equal(annots[4].dict.get(PDFName.of('IRT')), annots[3].ref);
});

test('Gelöschte, geänderte und neue Kommentare landen als Annotationen im Export', async () => {
  const { bytes, comments, owned } = await sourceWithComments();
  const changed = { ...comments[0], text: 'Sehr wichtig', color: '#4ade80' };
  const added = { id: 9, kind: 'underline', color: '#60a5fa', text: 'Neu', author: 'Mia', date: '2026-10-16T10:00:00.000Z', rect: [10, 50, 80, 62], quads: [10, 62, 80, 62, 10, 50, 80, 50], replies: [{ id: 10, author: 'Ben', text: 'Ok', date: null }] };
  const pages = [{ sourceId: 'a', pageIndex: 0, rotation: 0, comments: [changed, added] }];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, undefined, { ownedAnnots: () => owned }));
  const page = out.getPage(0), annots = annotsOf(page);
  assert.deepEqual(annots.map(subtype), ['Link', 'Highlight', 'Popup', 'Underline', 'Popup', 'Text'], 'Notiz samt Antwort gelöscht');
  const [, hl, , ul, , reply] = annots;
  assert.equal(contents(hl), 'Sehr wichtig');
  assert.deepEqual(hl.dict.get(PDFName.of('C')).asArray().map(n => Math.round(n.asNumber() * 255)), [74, 222, 128]);
  assert.ok(hl.dict.get(PDFName.of('AP')), 'neue Darstellung für die neue Farbe');
  assert.equal(hl.dict.get(PDFName.of('P')), page.ref);
  assert.equal(contents(ul), 'Neu');
  assert.equal(ul.dict.get(PDFName.of('T')).decodeText(), 'Mia');
  assert.equal(ul.dict.get(PDFName.of('F')).asNumber(), 4, 'Textkommentare werden mitgedruckt');
  assert.equal(ul.dict.get(PDFName.of('QuadPoints')).size(), 8);
  const appearance = out.context.lookup(ul.dict.get(PDFName.of('AP')).get(PDFName.of('N')));
  assert.match(new TextDecoder().decode(decodePDFRawStream(appearance).decode()), /10 51\.2 m\s+80 51\.2 l\s+S/);
  assert.equal(reply.dict.get(PDFName.of('IRT')), ul.ref);
  assert.equal(contents(reply), 'Ok');
});

test('Neue Notiz ohne Druck-Flag; Kommentare auf wiederholten Seiten sind eigene Objekte', async () => {
  const { bytes, comments, owned } = await sourceWithComments();
  const note = { id: 5, kind: 'note', color: '#facc15', text: 'Hallo', author: '', date: null, rect: [20, 380, 40, 400], replies: [] };
  const pages = [
    { sourceId: 'a', pageIndex: 0, rotation: 0, comments },
    { sourceId: 'a', pageIndex: 0, rotation: 90, comments: [...comments, note] },
  ];
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, undefined, { ownedAnnots: () => owned }));
  const [first, second] = out.getPages().map(annotsOf);
  assert.equal(first.length, 5);
  assert.deepEqual(second.map(subtype), ['Link', 'Highlight', 'Popup', 'Text', 'Popup', 'Text', 'Text', 'Popup']);
  const firstRefs = new Set(first.map(a => a.ref));
  assert.ok(second.slice(1).every(a => !firstRefs.has(a.ref)), 'Kommentare der zweiten Kopie gehören nur ihr');
  assert.equal(second[5].dict.get(PDFName.of('IRT')), second[3].ref);
  assert.equal(second[6].dict.get(PDFName.of('F')).asNumber(), 24, 'Notiz: NoZoom + NoRotate, nicht drucken');
  assert.equal(second[6].dict.get(PDFName.of('Name')).asString(), '/Comment');
});

test('Seiten ohne Kommentare behalten ihre Annotationen unverändert', async () => {
  const { bytes } = await sourceWithComments();
  const out = await PDFDocument.load(await buildPdf([{ sourceId: 'a', pageIndex: 0, rotation: 0 }], () => bytes));
  assert.deepEqual(annotsOf(out.getPage(0)).map(subtype), ['Highlight', 'Popup', 'Text', 'Text', 'Link']);
});
