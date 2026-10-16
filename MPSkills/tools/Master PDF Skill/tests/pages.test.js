import test from 'node:test';
import assert from 'node:assert/strict';
import { movePages, insertPages, sameOrder, nextActiveAfterRemoval } from '../js/pages.js';

const pages = ids => ids.map(id => ({ id }));
const ids = list => list.map(page => page.id);

test('Seite nach hinten verschieben', () => {
  assert.deepEqual(ids(movePages(pages([1, 2, 3, 4]), new Set([1]), 3)), [2, 3, 1, 4]);
});

test('Seite nach vorne verschieben', () => {
  assert.deepEqual(ids(movePages(pages([1, 2, 3, 4]), new Set([4]), 1)), [1, 4, 2, 3]);
});

test('Mehrfachauswahl behält ihre Reihenfolge', () => {
  assert.deepEqual(ids(movePages(pages([1, 2, 3, 4, 5]), new Set([4, 2]), 0)), [2, 4, 1, 3, 5]);
  assert.deepEqual(ids(movePages(pages([1, 2, 3, 4, 5]), new Set([1, 3]), 5)), [2, 4, 5, 1, 3]);
});

test('Ziel innerhalb der Auswahl ist kein Fehler', () => {
  assert.deepEqual(ids(movePages(pages([1, 2, 3, 4]), new Set([2, 3]), 3)), [1, 2, 3, 4]);
});

test('Einfügen an Position und am Ende', () => {
  assert.deepEqual(ids(insertPages(pages([1, 2]), pages([9]), 1)), [1, 9, 2]);
  assert.deepEqual(ids(insertPages(pages([1, 2]), pages([9]), null)), [1, 2, 9]);
  assert.deepEqual(ids(insertPages(pages([1, 2]), pages([9]), 99)), [1, 2, 9]);
});

test('Reihenfolge vergleichen', () => {
  assert.equal(sameOrder(pages([1, 2]), pages([1, 2])), true);
  assert.equal(sameOrder(pages([1, 2]), pages([2, 1])), false);
});

test('Nach dem Löschen wird die nächste Seite aktiv', () => {
  assert.equal(nextActiveAfterRemoval(pages([1, 2, 3, 4]), new Set([2, 3])), 4);
  assert.equal(nextActiveAfterRemoval(pages([1, 2, 3]), new Set([3])), 2);
  assert.equal(nextActiveAfterRemoval(pages([1]), new Set([1])), null);
});
