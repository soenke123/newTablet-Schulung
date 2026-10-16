import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryStack, createSnapshot } from '../js/history.js';

test('Undo/Redo stellt Seitenzustand einschließlich Auswahl wieder her', () => {
  const state = { pages: [{ id: 1, rotation: 0 }, { id: 2, rotation: 0 }], selected: new Set([1]), anchor: 1, activePageId: 1 };
  const history = new HistoryStack(3);
  history.push(createSnapshot(state));
  state.pages[0].rotation = 90;
  const restored = history.undo(createSnapshot(state));
  assert.equal(restored.pages[0].rotation, 0);
  assert.deepEqual(restored.selected, [1]);
  const forward = history.redo(createSnapshot({ ...state, pages: restored.pages, selected: new Set(restored.selected) }));
  assert.equal(forward.pages[0].rotation, 90);
  history.push(restored);
  assert.equal(history.canRedo, false);
});

test('HistoryStack begrenzt die Anzahl gespeicherter Schritte', () => {
  const history = new HistoryStack(2);
  history.push({ n: 1 }); history.push({ n: 2 }); history.push({ n: 3 });
  assert.equal(history.undoStack.length, 2);
  assert.equal(history.undo({ n: 4 }).n, 3);
});

test('clear leert Undo- und Redo-Verlauf (neues Dokument)', () => {
  const history = new HistoryStack(5);
  history.push({ n: 1 }); history.push({ n: 2 }); history.undo({ n: 3 });
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});
