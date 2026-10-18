import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, StandardFonts } from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { tokenize, readGlyphs, parseCMap, analyzePage, glyphsIn, removeGlyphs, textOps, mul } from '../js/textedit.js';

const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder('latin1').decode(b);

const TO_UNICODE = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
3 beginbfchar <0003> <0020> <0011> <0031> <0012> <0032> endbfchar
1 beginbfrange <0013> <0015> <0033> endbfrange
endcmap CMapName currentdict /CMap defineresource pop end end`;

// A page with a simple font (widths 500 per char, WinAnsi) and a Type0 Identity-H font (ToUnicode: 1→0011, 2→0012, 3→0013 …).
async function samplePage(content) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const ctx = doc.context;
  const simple = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: 'ABCDEF+Calibri', FirstChar: 32, LastChar: 126, Widths: Array(95).fill(500), Encoding: 'WinAnsiEncoding' }));
  const toUni = ctx.register(ctx.stream(TO_UNICODE));
  const cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'XYZABC+Arial-BoldMT', CIDSystemInfo: { Registry: ctx.obj('Adobe'), Ordering: ctx.obj('Identity'), Supplement: 0 }, DW: 1000, W: [3, [250], 17, 21, 600] }));
  const type0 = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'XYZABC+Arial-BoldMT', Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: toUni }));
  page.node.set(PDFName.of('Resources'), ctx.obj({ Font: { F1: simple, F2: type0 } }));
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(content)));
  return { doc, page };
}

test('Inhaltsstrom: Operatoren, Strings, Arrays, Inline-Bild', () => {
  const ops = tokenize(enc('q 1 0 0 1 10 20 cm BT /F1 12 Tf (a\\(b\\)\\101) Tj [<0102> -250 (c)] TJ ET BI /W 2 /H 1 ID \x00EI\x01 EI Q % Kommentar\n'));
  assert.deepEqual(ops.map(o => o.op), ['q', 'cm', 'BT', 'Tf', 'Tj', 'TJ', 'ET', 'BI', 'Q']);
  assert.deepEqual(ops[1].args, [1, 0, 0, 1, 10, 20]);
  assert.equal(dec(ops[4].args[0].bytes), 'a(b)A');
  assert.deepEqual([...ops[5].args[0][0].bytes], [1, 2]);
  assert.equal(ops[5].args[0][1], -250);
  assert.equal(ops[3].args[0].name, 'F1');
});

test('CMap: bfchar, bfrange, Codebereiche', () => {
  const cmap = parseCMap(enc(TO_UNICODE));
  assert.equal(cmap.unicode.get(0x11), '1');
  assert.equal(cmap.unicode.get(0x14), '4');
  assert.equal(cmap.spaces[0].len, 2);
});

test('Glyphen: Position, Breite, Farbe und Text', async () => {
  const { page } = await samplePage('BT /F1 10 Tf 0 0 1 rg 1 0 0 1 50 100 Tm (Datum: 12.10.) Tj ET');
  const a = analyzePage(page);
  assert.equal(a.glyphs.length, 13);
  assert.equal(a.glyphs.map(g => g.text).join(''), 'Datum: 12.10.');
  assert.deepEqual(a.glyphs[1].origin.map(v => Math.round(v * 100) / 100), [55, 100]);
  assert.equal(a.glyphs[0].color, '#0000ff');
  assert.equal(a.fonts.get('F1').family, 'sans');
});

test('Glyphen entfernen: der Rest der Zeile bleibt an seinem Platz', async () => {
  const { page } = await samplePage('BT /F1 10 Tf 1 0 0 1 50 100 Tm (Am 12.10. um) Tj ET');
  const a = analyzePage(page);
  // "12.10." = characters 3–8, x 65 … 95
  const hit = glyphsIn(a.glyphs, [[64, 98, 96, 108]]);
  assert.deepEqual(hit, [3, 4, 5, 6, 7, 8]);
  const bytes = removeGlyphs(a, hit);
  assert.match(dec(bytes), /\[<416d20> -3000 <20756d>\] TJ/);
  // Positions after the removal: same as before for the kept glyphs.
  const glyphs = readGlyphs(tokenize(bytes), a.fontFor);
  assert.equal(glyphs.map(g => g.text).join(''), 'Am  um');
  assert.deepEqual(glyphs.at(-1).origin.map(Math.round), [105, 100]);
});

test('Zusammengesetzte Schrift (Identity-H): zwei Byte je Zeichen, /W-Breiten, Text kodieren', async () => {
  const { page } = await samplePage('BT /F2 20 Tf 100 50 Td <0011001200030013> Tj ET');
  const a = analyzePage(page);
  assert.equal(a.glyphs.map(g => g.text).join(''), '12 3');
  assert.deepEqual(a.glyphs.map(g => g.origin[0]), [100, 112, 124, 129]);
  const font = a.fonts.get('F2');
  assert.equal(font.bold, true);
  assert.deepEqual([...font.encode('31')], [0, 0x13, 0, 0x11]);
  assert.equal(font.encode('9'), null);
  const bytes = removeGlyphs(a, [0]);
  assert.match(dec(bytes), /\[-600 <001200030013>\] TJ/);
});

test('Neuer Text mit der Matrix des alten (Größe, Drehung, Farbe)', async () => {
  const { page } = await samplePage('q 0 1 -1 0 300 0 cm BT /F1 12 Tf 80 Tz 1 0 0 1 10 20 Tm (x) Tj ET Q');
  const g = analyzePage(page).glyphs[0];
  assert.deepEqual(g.matrix, mul([1, 0, 0, 1, 10, 20], [0, 1, -1, 0, 300, 0]));
  const ops = textOps(g, 'F1', new Uint8Array([0x41]), '#ff0000');
  assert.match(ops, /\/F1 12 Tf 80 Tz .* 1 0 0 rg 0 1 -1 0 280 10 Tm <41> Tj/);
});

test('Standardschrift ohne /Widths: Breiten über stdWidth', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('AB', { x: 10, y: 10, size: 10, font });
  const bytes = await doc.save();
  const loaded = await PDFDocument.load(bytes);
  const a = analyzePage(loaded.getPage(0), (base, ch) => base === 'Helvetica' ? font.widthOfTextAtSize(ch, 1) : 0);
  assert.equal(a.glyphs.length, 2);
  assert.ok(Math.abs(a.glyphs[1].origin[0] - (10 + font.widthOfTextAtSize('A', 10))) < 0.01);
});
