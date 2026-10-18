import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPage, buildDocx, fontStyle, uprightRotation, crc32, zip } from '../js/docx.js';

const A4 = { x: 0, y: 0, width: 595, height: 842 };
// PDF.js-like text item: x/y = baseline start in PDF space, width from a rough 0.5 em per character.
const item = (str, x, y, { size = 11, font = 'f1', width, eol = false } = {}) => ({ str, transform: [size, 0, 0, size, x, y], width: width ?? str.length * size * 0.5, height: size, fontName: font, hasEOL: eol });
const fonts = new Map([['f1', { name: 'ABCDEF+Calibri' }], ['f2', { name: 'ABCDEF+Calibri-Bold' }], ['f3', { name: 'ABCDEF+TimesNewRomanPS-ItalicMT' }]]);

// Reads a stored ZIP (as written by zip()) back into name → text.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset), files = new Map(), dec = new TextDecoder();
  for (let at = 0; view.getUint32(at, true) === 0x04034b50;) {
    const size = view.getUint32(at + 18, true), nameLen = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    assert.equal(crc32(data), view.getUint32(at + 14, true), `CRC von ${name}`);
    files.set(name, data);
    at += 30 + nameLen + size;
  }
  return files;
}

test('CRC-32 und ZIP-Struktur', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const bytes = zip([{ name: 'a.txt', data: new TextEncoder().encode('Hallo') }, { name: 'ordner/ü.xml', data: new Uint8Array([1, 2, 3]) }]);
  const files = unzip(bytes);
  assert.deepEqual([...files.keys()], ['a.txt', 'ordner/ü.xml']);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 2);
});

test('Schriftnamen: Familie, fett, kursiv, namenlose Schriften', () => {
  assert.deepEqual(fontStyle('ABCDEF+TimesNewRomanPS-BoldItalicMT'), { family: 'Times New Roman', bold: true, italic: true, anon: false });
  assert.equal(fontStyle('ArialMT').family, 'Arial');
  assert.equal(fontStyle('Carlito-Regular').family, 'Calibri');
  assert.equal(fontStyle('BCDEEE+SegoeUI-Semibold').family, 'Segoe UI');
  assert.equal(fontStyle('BCDEEE+SegoeUI-Semibold').bold, true);
  assert.deepEqual(fontStyle('CIDFont+F2'), { family: '', bold: false, italic: false, anon: true });
});

test('aufrechte Drehung folgt der Schreibrichtung des Textes', () => {
  assert.equal(uprightRotation([item('Hallo Welt', 50, 700)], 90), 0);
  assert.equal(uprightRotation([{ ...item('Hallo Welt', 50, 50), transform: [0, 11, -11, 0, 50, 50] }]), 90);
  assert.equal(uprightRotation([], 270), 270);
});

test('Zeilen werden zu Absätzen, Überschriften und Listen', () => {
  const items = [
    item('Arbeitsblatt', 72, 760, { size: 22, font: 'f2', eol: true }),
    item('Das ist ein langer Absatz, der über mehrere Zeilen geht und am rechten Rand umbricht.', 72, 720, { width: 450, eol: true }),
    item('Hier geht er weiter und endet mit einer Trenn-', 72, 707, { width: 450, eol: true }),
    item('ung mitten im Wort.', 72, 694, { width: 100, eol: true }),
    item('Neuer Absatz nach einer Lücke.', 72, 660, { width: 160, eol: true }),
    item('• Erster Punkt', 72, 630, { eol: true }),
    item('• Zweiter Punkt', 72, 617, { eol: true }),
    item('Kursiv', 72, 590, { font: 'f3' }),
    item(' und normal.', 105, 590, { eol: true }),
  ];
  const page = layoutPage({ items, fonts, box: A4 });
  const paras = page.blocks.filter(b => b.type === 'p');
  const text = b => b.runs.map(r => r.text).join('');
  assert.equal(paras.length, 6);
  assert.equal(paras[0].heading, 1);
  assert.equal(text(paras[1]), 'Das ist ein langer Absatz, der über mehrere Zeilen geht und am rechten Rand umbricht. Hier geht er weiter und endet mit einer Trennung mitten im Wort.');
  assert.equal(text(paras[2]), 'Neuer Absatz nach einer Lücke.');
  assert.equal(text(paras[3]), '• Erster Punkt');
  assert.equal(text(paras[4]), '• Zweiter Punkt');
  assert.deepEqual(paras[5].runs.map(r => [r.text, r.italic, r.family]), [['Kursiv', true, 'Times New Roman'], [' und normal.', false, 'Calibri']]);
  assert.ok(paras[2].before > 0, 'Abstand vor dem Absatz nach der Lücke');
  assert.equal(page.text, true);
});

test('Spalten mit gleichen Anfängen werden eine Tabelle, umbrochene Zellen bleiben in ihrer Zeile', () => {
  const s = 9.5;
  const items = [
    item('Einleitung über der Tabelle.', 63, 740, { eol: true }),
    item('App', 63, 696, { size: s, font: 'f2' }), item('Bereich', 173, 696, { size: s, font: 'f2' }), item('Hinweis', 283, 696, { size: s, font: 'f2', eol: true }),
    item('IServ', 63, 676, { size: s }), item(' ', 82, 676, { size: s, width: 121 }), item('Schule', 173, 676, { size: s }), item('E-Mail, Aufgaben, Dateien –', 283, 676, { size: s, eol: true }),
    item('immer aktuell halten.', 283, 664.4, { size: s, eol: true }),
    item('Pages', 63, 644, { size: s }), item('Text', 173, 644, { size: s }), item('Abgaben erstellen.', 283, 644, { size: s, eol: true }),
    item('Text unter der Tabelle, der über die ganze Breite der Seite läuft und deshalb nicht dazugehört.', 63, 600, { width: 470, eol: true }),
  ];
  const page = layoutPage({ items, fonts, box: A4 });
  assert.deepEqual(page.blocks.map(b => b.type), ['p', 'table', 'p']);
  const table = page.blocks[1];
  assert.equal(table.widths.length, 3);
  assert.equal(table.header, true);
  const cells = table.rows.map(row => row.map(runs => runs.map(r => r.text).join('')));
  assert.deepEqual(cells, [['App', 'Bereich', 'Hinweis'], ['IServ', 'Schule', 'E-Mail, Aufgaben, Dateien – immer aktuell halten.'], ['Pages', 'Text', 'Abgaben erstellen.']]);
});

test('einzelne Zeile mit großer Lücke bleibt ein Absatz mit Tabulator', () => {
  const page = layoutPage({ items: [item('Name:', 72, 700), item('Datum:', 350, 700, { eol: true })], fonts, box: A4 });
  assert.deepEqual(page.blocks.map(b => b.type), ['p']);
  assert.equal(page.blocks[0].runs.map(r => r.text).join(''), 'Name:\tDatum:');
});

test('namenlose Schriften: die seltenere gilt als fett', () => {
  const anon = new Map([['a', { name: 'CIDFont+F1' }], ['b', { name: 'CIDFont+F2' }]]);
  const page = layoutPage({ items: [item('Das Tablet ist ein ', 72, 700, { font: 'b' }), item('Arbeitsgerät', 170, 700, { font: 'a' }), item(' und kein Spielzeug, das sagen alle hier im Raum.', 236, 700, { font: 'b', eol: true })], fonts: anon, box: A4 });
  assert.deepEqual(page.blocks[0].runs.map(r => r.bold), [false, true, false]);
});

test('Bilder stehen an ihrer Stelle im Textfluss, Seitenränder folgen dem Inhalt', () => {
  const items = [item('Oben', 72, 760, { eol: true }), item('Unten', 72, 400, { eol: true })];
  const page = layoutPage({ items, fonts, box: A4, images: [{ ref: 'bild', x0: 200, y0: 500, x1: 395, y1: 700 }] });
  assert.deepEqual(page.blocks.map(b => b.type), ['p', 'image', 'p']);
  assert.equal(page.blocks[1].align, 'center');
  assert.equal(page.margins.left, 72);
  const rotated = layoutPage({ items: [], fonts, box: A4, rotation: 90 });
  assert.deepEqual([rotated.width, rotated.height, rotated.text], [842, 595, false]);
});

test('buildDocx schreibt ein gültiges Word-Paket mit Seiten, Tabellen und Bildern', () => {
  const s = 9.5;
  const first = layoutPage({ items: [
    item('Titel & <Test>', 72, 760, { size: 22, eol: true }), item('Ein ganz normaler Absatz mit genug Text für die Grundschrift.', 72, 700, { eol: true }),
    item('A', 63, 600, { size: s }), item('B', 173, 600, { size: s, eol: true }), item('1', 63, 580, { size: s }), item('2', 173, 580, { size: s, eol: true }),
  ], fonts, box: A4, images: [{ ref: 'logo', x0: 72, y0: 300, x1: 172, y1: 350 }] });
  const second = layoutPage({ items: [item('Seite zwei', 72, 500, { eol: true })], fonts, box: { x: 0, y: 0, width: 842, height: 595 } });
  const png = new Uint8Array([137, 80, 78, 71]);
  const files = unzip(buildDocx([first, second], new Map([['logo', { data: png, type: 'png' }]]), { title: 'Probe' }));
  assert.deepEqual([...files.keys()].sort(), ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/media/bild1.png', 'word/styles.xml']);
  const doc = new TextDecoder().decode(files.get('word/document.xml'));
  assert.match(doc, /Titel &amp; &lt;Test&gt;/);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.equal(doc.match(/<w:sectPr>/g).length, 2);
  assert.match(doc, /<w:type w:val="nextPage"\/>/);
  assert.match(doc, /<w:pgSz w:w="16840" w:h="11900" w:orient="landscape"\/>/);
  assert.equal(doc.match(/<w:tbl>/g).length, 1);
  assert.equal(doc.match(/<w:tc>/g).length, 4);
  assert.match(doc, /<a:blip r:embed="rIdImg1"\/>/);
  assert.match(new TextDecoder().decode(files.get('word/_rels/document.xml.rels')), /Target="media\/bild1.png"/);
  assert.match(new TextDecoder().decode(files.get('docProps/core.xml')), /<dc:title>Probe<\/dc:title>/);
  assert.ok(doc.lastIndexOf('<w:sectPr>') > doc.lastIndexOf('</w:p>'), 'letzte Section steht am Ende des Body');
});
