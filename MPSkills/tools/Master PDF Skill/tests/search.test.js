import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPageText, searchPattern, findMatches, matchPieces, snippet, pieceRect } from '../js/search.js';

const item = (str, x, y, extra = {}) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, ...extra });

test('Seitentext setzt Textstücke zusammen und merkt sich die Herkunft', () => {
  const { text, spans } = buildPageText([item('Hallo ', 0, 0), item('Welt', 30, 0, { hasEOL: true }), item('Zeile', 0, -12)]);
  assert.equal(text, 'Hallo Welt\nZeile');
  assert.deepEqual(spans, [{ start: 0, end: 6, item: 0 }, { start: 6, end: 10, item: 1 }, { start: 11, end: 16, item: 2 }]);
});

test('Suche ignoriert Groß-/Kleinschreibung und Umbrüche zwischen Wörtern', () => {
  const pattern = searchPattern('welt zeile');
  assert.deepEqual(findMatches('Hallo Welt\nZeile', pattern), [{ start: 6, end: 16 }]);
  assert.deepEqual(findMatches('ÄPFEL und äpfel', searchPattern('äpfel')), [{ start: 0, end: 5 }, { start: 10, end: 15 }]);
  assert.deepEqual(findMatches('WeltZeile', pattern), [{ start: 0, end: 9 }]);
});

test('Sonderzeichen in der Suche werden wörtlich genommen', () => {
  assert.deepEqual(findMatches('Preis (netto): 3.50 €', searchPattern('(netto)')), [{ start: 6, end: 13 }]);
  assert.deepEqual(findMatches('3x50', searchPattern('3.50')), []);
  assert.equal(searchPattern('   '), null);
});

test('Treffer über mehrere Textstücke werden aufgeteilt', () => {
  const { spans } = buildPageText([item('Hallo ', 0, 0), item('Welt', 30, 0)]);
  assert.deepEqual(matchPieces(spans, 3, 8), [{ item: 0, from: 3, to: 6 }, { item: 1, from: 0, to: 2 }]);
});

test('Ausschnitt um den Treffer', () => {
  const s = snippet('eins zwei drei vier fünf', 10, 14, 6);
  assert.deepEqual(s, { before: '…zwei ', match: 'drei', after: ' vier…' });
});

test('Rechteck um Zeichen eines Textstücks', () => {
  const [x1, y1, x2, y2] = pieceRect(item('abcd', 100, 200), 1, 3);
  assert.equal(x1, 105); assert.equal(x2, 115);
  assert.ok(y1 < 200 && y2 > 205);
  const [rx1, ry1, rx2, ry2] = pieceRect({ str: 'ab', transform: [0, 10, -10, 0, 50, 50], width: 20, height: 10 }, 0, 2);
  assert.ok(rx2 - rx1 < 15 && ry2 - ry1 >= 20, 'gedrehter Text verläuft senkrecht');
});
