import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from '../lib/pdf-lib/pdf-lib.esm.min.js';

test('pdf-lib kann Seiten erstellen, kopieren, drehen, exportieren und wieder öffnen', async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([400, 300]);
  const input = await source.save();
  const loaded = await PDFDocument.load(input);
  assert.equal(loaded.getPageCount(), 2);
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(loaded, [1]);
  page.setRotation(degrees(90));
  output.addPage(page);
  const exported = await output.save();
  const reopened = await PDFDocument.load(exported);
  assert.equal(reopened.getPageCount(), 1);
  assert.equal(reopened.getPage(0).getRotation().angle, 90);
});

