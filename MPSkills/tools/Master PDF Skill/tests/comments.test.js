import test from 'node:test';
import assert from 'node:assert/strict';
import { importAnnotations, commentChanged, colorHex, parsePdfDate, pdfDate, charIndexAt, wordAt, selectionQuads, textInQuads, quadsBounds, commentHit, markupLines, highlightPolygons, noteRect, freeTextRect, freeTextLines } from '../js/comments.js';
import { buildPageText } from '../js/search.js';

const counter = () => { let n = 1; return () => n++; };
const rgb = (...v) => Uint8ClampedArray.from(v);

test('Kommentare aus PDF.js werden eingelesen, Antworten hängen am Kommentar', () => {
  const annots = [
    { id: '10R', subtype: 'Highlight', rect: [10, 10, 100, 30], quadPoints: Float32Array.from([10, 30, 100, 30, 10, 10, 100, 10]), color: rgb(255, 255, 0), contentsObj: { str: 'Wichtig' }, titleObj: { str: 'Frau Meyer' }, modificationDate: "D:20240115103000+01'00'", popupRef: '11R', annotationFlags: 4 },
    { id: '11R', subtype: 'Popup', rect: [100, 10, 200, 80] },
    { id: '12R', subtype: 'Text', rect: [50, 298, 72, 320], contentsObj: { str: 'Frage' }, titleObj: { str: 'Ben' } },
    { id: '13R', subtype: 'Text', rect: [50, 298, 72, 320], inReplyTo: '12R', replyType: 'R', contentsObj: { str: 'Antwort' }, titleObj: { str: 'Frau Meyer' }, modificationDate: 'D:20240116' },
    { id: '14R', subtype: 'Text', rect: [50, 298, 72, 320], inReplyTo: '13R', replyType: 'R', contentsObj: { str: 'Danke' }, modificationDate: 'D:20240117' },
    { id: '15R', subtype: 'Link', rect: [0, 0, 10, 10] },
    { id: '16R', subtype: 'Text', rect: [0, 0, 10, 10], annotationFlags: 2, contentsObj: { str: 'versteckt' } },
    { id: '17R', subtype: 'Ink', rect: [1, 2, 3, 4], color: rgb(0, 0, 255) },
  ];
  const { comments, owned } = importAnnotations(annots, counter());
  assert.deepEqual(comments.map(c => c.kind), ['highlight', 'note', 'ink']);
  const [hl, note, ink] = comments;
  assert.equal(hl.color, '#ffff00');
  assert.equal(hl.text, 'Wichtig');
  assert.equal(hl.author, 'Frau Meyer');
  assert.equal(hl.date, '2024-01-15T09:30:00.000Z');
  assert.deepEqual(hl.quads, [10, 30, 100, 30, 10, 10, 100, 10]);
  assert.deepEqual(note.rect, [50, 300, 70, 320], 'Notiz bekommt die feste Symbolgröße, oben links bleibt');
  assert.equal(note.color, '#facc15');
  assert.deepEqual(note.replies.map(r => [r.text, r.orig]), [['Antwort', '13R'], ['Danke', '14R']]);
  assert.equal(ink.color, '#0000ff');
  assert.deepEqual([...owned].sort(), ['10R', '11R', '12R', '13R', '14R', '17R']);
  assert.equal(commentChanged(hl), false);
  assert.equal(commentChanged({ ...hl, text: 'neu' }), true);
  assert.equal(commentChanged({ ...note, rect: noteRect(60, 320) }), true);
});

test('Farben und PDF-Datumsangaben', () => {
  assert.equal(colorHex(rgb(255, 128, 0)), '#ff8000');
  assert.equal(colorHex(null), null);
  assert.equal(parsePdfDate('D:2024'), '2024-01-01T00:00:00.000Z');
  assert.equal(parsePdfDate("D:20240115103000-05'30'"), '2024-01-15T16:00:00.000Z');
  assert.equal(parsePdfDate('Unsinn'), null);
  const date = new Date('2026-10-16T12:34:56Z');
  assert.match(pdfDate(date), /^D:\d{14}(Z|[+-]\d\d'\d\d')$/);
  assert.equal(parsePdfDate(pdfDate(date)), date.toISOString());
});

// Two lines of text, 10 pt high, 6 pt per character.
const items = [
  { str: 'Hallo Welt', transform: [10, 0, 0, 10, 100, 700], width: 60, height: 10, hasEOL: true },
  { str: 'zweite Zeile', transform: [10, 0, 0, 10, 100, 680], width: 72, height: 10 },
];
const { text, spans } = buildPageText(items);

test('Textauswahl: Zeichen unter dem Finger, Wort beim Antippen, Quads je Textstück', () => {
  assert.equal(charIndexAt(items, spans, 100, 703), 0);
  assert.equal(charIndexAt(items, spans, 131, 703), 5, 'zwischen „Hallo“ und „Welt“');
  assert.equal(charIndexAt(items, spans, 300, 703, Infinity), 10, 'rechts neben der Zeile: Zeilenende');
  assert.equal(charIndexAt(items, spans, 110, 683), 13, 'zweite Zeile');
  assert.equal(charIndexAt(items, spans, 100, 500), null, 'weit weg vom Text');
  assert.deepEqual(wordAt(text, 7), [6, 10]);
  assert.deepEqual(wordAt(text, 10), [6, 10], 'direkt hinter dem Wort');
  assert.deepEqual(wordAt(text, 5), [0, 5], 'Leerzeichen direkt hinter „Hallo“');
  assert.equal(wordAt('a  b', 2), null, 'nur Leerraum');
  const quads = selectionQuads(items, spans, 6, 17);
  assert.equal(quads.length, 16, 'zwei Zeilen → zwei Quads');
  assert.deepEqual(quads.slice(0, 8), [136, 709.5, 160, 709.5, 136, 697.8, 160, 697.8]);
  assert.equal(textInQuads(items, spans, text, quads), 'Welt zweite');
  assert.deepEqual(quadsBounds(quads), [100, 677.8, 160, 709.5]);
});

test('Treffertest, Linien und Flächen der Textkommentare', () => {
  const c = { kind: 'underline', quads: [10, 30, 100, 30, 10, 10, 100, 10], rect: [10, 10, 100, 30] };
  assert.equal(commentHit(c, 50, 20), true);
  assert.equal(commentHit(c, 50, 40), false);
  assert.equal(commentHit(c, 50, 31, 2), true);
  assert.deepEqual(markupLines(c), [{ points: [10, 12, 100, 12], width: 1.4 }]);
  assert.deepEqual(markupLines({ ...c, kind: 'strikeout' })[0].points, [10, 18.4, 100, 18.4]);
  const wave = markupLines({ ...c, kind: 'squiggly' })[0].points;
  assert.ok(wave.length > 8 && wave[0] === 10 && wave.at(-2) === 100);
  assert.deepEqual(highlightPolygons(c), [[10, 30, 100, 30, 100, 10, 10, 10]]);
  assert.equal(commentHit({ kind: 'ink', rect: [0, 0, 10, 10] }, 5, 5), true);
});

test('Zitat: ein angeschnittener Buchstabe zählt nicht als Wort', () => {
  // „Welt“ 136…160; the quad reaches 2 pt into the space before and over the „W“ only partly into „zweite“.
  assert.equal(textInQuads(items, spans, text, [134, 709, 162, 709, 134, 698, 162, 698]), 'Welt');
  assert.equal(textInQuads(items, spans, text, [100, 709, 112, 709, 100, 698, 112, 698]), '', 'nur 2 von 5 Buchstaben');
});

test('Gemessene Buchstabenbreiten verschieben Auswahl und Quads', async () => {
  const { measureAdvances } = await import('../js/comments.js');
  assert.deepEqual(measureAdvances('iW', ch => (ch === 'W' ? 3 : 1)), [0, 0.25, 1]);
  assert.equal(measureAdvances('', () => 1), null);
  const narrow = [{ str: 'iiiiWWWW', transform: [10, 0, 0, 10, 0, 0], width: 80, height: 10 }];
  narrow[0].advances = measureAdvances(narrow[0].str, ch => (ch === 'W' ? 3 : 1));
  const built = buildPageText(narrow);
  assert.equal(charIndexAt(narrow, built.spans, 20.5, 3), 4, 'die schmalen i enden bei 20 pt (4 von 16 Breiteneinheiten)');
  assert.deepEqual(selectionQuads(narrow, built.spans, 4, 8).slice(0, 4), [20, 9.5, 80, 9.5]);
  assert.equal(textInQuads(narrow, built.spans, built.text, [15, 9, 81, 9, 15, 0, 81, 0]), 'iiiiWWWW', '5 von 8 Buchstaben: das ganze Wort');
});

test('Status (Review) wird als Status gelesen, nicht als Antwort; der neueste gewinnt', () => {
  const annots = [
    { id: '20R', subtype: 'Highlight', rect: [10, 10, 100, 30], contentsObj: { str: 'Bitte prüfen' } },
    { id: '21R', subtype: 'Text', rect: [10, 10, 30, 30], inReplyTo: '20R', replyType: 'R', state: { name: 'Accepted' }, stateModel: { name: 'Review' }, annotationFlags: 2 | 8 | 16, titleObj: { str: 'Ben' }, modificationDate: 'D:20240110' },
    { id: '22R', subtype: 'Text', rect: [10, 10, 30, 30], inReplyTo: '20R', replyType: 'R', state: 'Completed', stateModel: 'Review', annotationFlags: 2, titleObj: { str: 'Mia' }, modificationDate: 'D:20240112' },
    { id: '23R', subtype: 'Text', rect: [10, 10, 30, 30], inReplyTo: '20R', replyType: 'R', state: 'Marked', stateModel: 'Marked', annotationFlags: 2 },
  ];
  const { comments, owned } = importAnnotations(annots, counter());
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].replies, []);
  assert.deepEqual(comments[0].status, { state: 'completed', author: 'Mia', date: '2024-01-12T00:00:00.000Z', orig: '22R' });
  assert.ok(owned.has('21R') && owned.has('22R'));
  assert.ok(!owned.has('23R'), 'private Häkchen bleiben unangetastet');
});

test('Textfelder: Schrift und Farbe aus der Darstellung, Kasten wächst mit dem Text', () => {
  const annots = [{ id: '30R', subtype: 'FreeText', rect: [10, 100, 120, 130], contentsObj: { str: 'Gut gemacht' }, defaultAppearanceData: { fontSize: 14, fontColor: rgb(255, 0, 0) } }];
  const [c] = importAnnotations(annots, counter()).comments;
  assert.equal(c.kind, 'freetext');
  assert.equal(c.color, '#ff0000');
  assert.equal(c.fontSize, 14);
  assert.equal(c.fill, undefined);
  assert.equal(commentChanged(c), false);
  assert.equal(commentChanged({ ...c, fontSize: 18 }), true);
  const widthOf = (text, size) => text.length * size / 2;
  assert.deepEqual(freeTextRect(10, 200, 'abcdef\nab', 10, widthOf), [10, 169, 56, 200], 'Breite der längsten Zeile, zwei Zeilen hoch, plus Rand');
  assert.deepEqual(freeTextRect(10, 200, '', 10, widthOf), [10, 181.5, 56, 200], 'leer: Platz für ein paar Buchstaben');
  assert.deepEqual(freeTextLines({ rect: [10, 169, 56, 200], text: 'a\nb', fontSize: 10 }).map(l => [l.x, l.y]), [[13, 187.5], [13, 175]]);
});
