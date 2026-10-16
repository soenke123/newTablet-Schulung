import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRanges, formatPageRanges } from '../js/ranges.js';

test('Seitenbereiche werden in der eingegebenen Reihenfolge gelesen', () => {
  assert.deepEqual(parsePageRanges('1-3, 4 ,10-12', 12).indices, [0, 1, 2, 3, 9, 10, 11]);
  assert.deepEqual(parsePageRanges('5, 1', 5).indices, [4, 0]);
});

test('Leere Eingabe bedeutet alle Seiten', () => {
  assert.deepEqual(parsePageRanges('  ', 3).indices, [0, 1, 2]);
});

test('Offene und absteigende Bereiche', () => {
  assert.deepEqual(parsePageRanges('-2', 5).indices, [0, 1]);
  assert.deepEqual(parsePageRanges('4-', 5).indices, [3, 4]);
  assert.deepEqual(parsePageRanges('3-1', 5).indices, [2, 1, 0]);
  assert.deepEqual(parsePageRanges('1–2', 5).indices, [0, 1]);
});

test('Ungültige Angaben liefern eine verständliche Meldung', () => {
  assert.match(parsePageRanges('1-3, x', 5).error, /„x“/);
  assert.match(parsePageRanges('7', 5).error, /Seite 7 gibt es nicht/);
  assert.match(parsePageRanges('0-2', 5).error, /Seite 0/);
  assert.match(parsePageRanges('-', 5).error, /keine gültige/);
  assert.match(parsePageRanges('1 3', 5).error, /keine gültige/);
});

test('Auswahl wird als kompakte Bereiche formatiert', () => {
  assert.equal(formatPageRanges([0, 1, 2, 6, 9, 10]), '1-3, 7, 10-11');
  assert.equal(formatPageRanges([4]), '5');
  assert.equal(formatPageRanges([]), '');
  assert.deepEqual(parsePageRanges(formatPageRanges([0, 1, 2, 6]), 10).indices, [0, 1, 2, 6]);
});
