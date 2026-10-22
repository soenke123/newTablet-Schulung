import test from 'node:test';
import assert from 'node:assert/strict';
import { speechChunks, spokenWordAt, paragraphStarts } from '../js/speak.js';

test('Kurzer Text ist ein Stück, Leerraum am Anfang fällt weg', () => {
  assert.deepEqual(speechChunks('  Hallo Welt.'), [{ start: 2, end: 13 }]);
});

test('Lange Texte werden an Satzenden geteilt, Offsets bleiben die des Seitentexts', () => {
  const text = 'Erster Satz hier. Zweiter Satz folgt jetzt. Dritter Satz kommt zum Schluss.';
  const chunks = speechChunks(text, 0, text.length, 40);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].end, 18);
  for (const c of chunks) assert.ok(c.end - c.start <= 40 && c.end > c.start);
  assert.equal(text.slice(chunks.at(-1).start, chunks.at(-1).end), 'Dritter Satz kommt zum Schluss.');
});

test('Ohne Satzende wird an Leerzeichen geteilt, ohne Leerzeichen hart', () => {
  const words = 'wort '.repeat(30);
  for (const c of speechChunks(words, 0, words.length, 50)) assert.ok(c.end - c.start <= 50);
  const glued = 'x'.repeat(130);
  assert.deepEqual(speechChunks(glued, 0, glued.length, 50).map(c => c.end - c.start), [50, 50, 30]);
});

test('Bereich von bis und leerer Text', () => {
  assert.deepEqual(speechChunks('Eins zwei drei', 5, 9), [{ start: 5, end: 9 }]);
  assert.deepEqual(speechChunks('   '), []);
});

test('Wort ohne Satzzeichen, auch mitten im Wort und vor Leerraum', () => {
  const text = 'Hallo, „Welt“! Ende';
  assert.deepEqual(spokenWordAt(text, 0), { start: 0, end: 5 });
  assert.deepEqual(spokenWordAt(text, 3), { start: 0, end: 5 });
  assert.deepEqual(spokenWordAt(text, 6), { start: 8, end: 12 });
  assert.equal(spokenWordAt('Ende   ', 4), null);
  assert.deepEqual(spokenWordAt('...', 0), { start: 0, end: 3 });
});

test('Absatzanfänge: größerer Zeilenabstand beginnt einen neuen Absatz', () => {
  const line = (str, y) => ({ str, transform: [10, 0, 0, 10, 0, y], width: str.length * 5, height: 10 });
  const items = [line('Eins ', 100), line('zwei. ', 88), line('Drei ', 60), line('vier ', 48), line('Fünf', 20)];
  let pos = 0;
  const spans = items.map((it, i) => { const s = { start: pos, end: pos + it.str.length, item: i }; pos = s.end; return s; });
  assert.deepEqual(paragraphStarts(items, spans), [0, 11, 21]);
});
