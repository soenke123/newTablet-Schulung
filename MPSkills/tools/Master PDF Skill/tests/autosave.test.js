import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionDoc, restoredState, SESSION_VERSION } from '../js/autosave.js';

const sampleState = () => ({
  sources: new Map([
    ['source-1', { id: 'source-1', name: 'a.pdf', bytes: new Uint8Array([1, 2]), pdf: { destroy() {} }, pageSizes: [], color: '#9bb5df', tint: '#f3f6fc', ocr: [[{ str: 'Hallo' }]] }],
    ['source-4', { id: 'source-4', name: 'Leere Seite', bytes: new Uint8Array([3]), pdf: {}, color: '#d5dbe5', tint: '#fff', blank: true, blankKey: '595x842' }]
  ]),
  pages: [
    { id: 2, sourceId: 'source-1', pageIndex: 0, rotation: 90, marks: [{ id: 9, type: 'ink', points: [0, 0, 1, 1] }] },
    { id: 5, sourceId: 'source-4', pageIndex: 0, rotation: 0, comments: [{ id: 11, kind: 'note', replies: [{ id: 12 }] }] }
  ],
  selected: new Set([5]), anchor: 5, activePageId: 5,
  forms: new Map([['source-1\u0000Name', 'Mia']]), watermark: { text: 'ENTWURF' }, meta: { title: 'T', clean: true }, nextId: 13
});

test('Sicherung enthält Seiten, Formulare und Quellen ohne Bytes und PDF.js-Objekte', () => {
  const doc = sessionDoc(sampleState(), 'a.pdf');
  assert.equal(doc.version, SESSION_VERSION);
  assert.equal(doc.name, 'a.pdf');
  assert.deepEqual(doc.sources.map(s => s.id), ['source-1', 'source-4']);
  assert.ok(doc.sources.every(s => !('bytes' in s) && !('pdf' in s) && !('pageSizes' in s)));
  assert.equal(doc.sources[0].ocr[0][0].str, 'Hallo');
  assert.equal(doc.sources[1].blank, true);
  assert.deepEqual(doc.selected, [5]);
  assert.deepEqual(doc.forms, [['source-1\u0000Name', 'Mia']]);
  assert.equal(doc.watermark.text, 'ENTWURF');
  assert.doesNotThrow(() => structuredClone(doc));
});

test('Wiederherstellen setzt Seiten, Auswahl, Formulare und Zähler zurück', () => {
  const doc = structuredClone(sessionDoc(sampleState()));
  const back = restoredState(doc, new Set(['source-1', 'source-4']));
  assert.equal(back.pages.length, 2);
  assert.equal(back.pages[0].marks[0].id, 9);
  assert.deepEqual([...back.selected], [5]);
  assert.equal(back.activePageId, 5);
  assert.equal(back.forms.get('source-1\u0000Name'), 'Mia');
  assert.equal(back.meta.title, 'T');
  assert.equal(back.nextId, 13);
});

test('Seiten einer nicht mehr lesbaren Quelle fallen weg, Auswahl rückt nach', () => {
  const doc = sessionDoc(sampleState());
  const back = restoredState(doc, new Set(['source-1']));
  assert.deepEqual(back.pages.map(p => p.id), [2]);
  assert.equal(back.activePageId, 2);
  assert.deepEqual([...back.selected], [2]);
  assert.equal(back.anchor, 2);
});

test('Zähler liegt immer über allen gesicherten Ids', () => {
  const doc = { ...sessionDoc(sampleState()), nextId: 3 };
  assert.equal(restoredState(doc, new Set(['source-1', 'source-4'])).nextId, 13);
});
