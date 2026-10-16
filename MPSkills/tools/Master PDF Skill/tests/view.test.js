import test from 'node:test';
import assert from 'node:assert/strict';
import { CSS_UNITS, MIN_ZOOM, MAX_ZOOM, clampZoom, stepZoom, pageRows, fitZoom } from '../js/view.js';

const a4 = { width: 595, height: 842 }, landscape = { width: 842, height: 595 };

test('Zoomstufen springen zur nächsten Voreinstellung', () => {
  assert.equal(stepZoom(1, 1), 1.1);
  assert.equal(stepZoom(1, -1), 0.9);
  assert.equal(stepZoom(1.17, 1), 1.25);
  assert.equal(stepZoom(1.17, -1), 1.1);
  assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(stepZoom(MIN_ZOOM, -1), MIN_ZOOM);
});

test('Zoom wird begrenzt', () => {
  assert.equal(clampZoom(10), MAX_ZOOM);
  assert.equal(clampZoom(0.01), MIN_ZOOM);
  assert.equal(clampZoom(NaN), 1);
});

test('Seitenzeilen: einzeln oder paarweise', () => {
  assert.deepEqual(pageRows(3, false), [[0], [1], [2]]);
  assert.deepEqual(pageRows(5, true), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(pageRows(0, true), []);
});

test('Seitenbreite richtet sich nach der breitesten Seite', () => {
  const area = { width: 1000, height: 600 };
  assert.equal(fitZoom('width', [[a4], [landscape]], area), 1000 / (842 * CSS_UNITS));
});

test('Ganze Seite passt Höhe und Breite ein', () => {
  const area = { width: 1000, height: 600 };
  assert.equal(fitZoom('page', [[a4]], area), 600 / (842 * CSS_UNITS));
  assert.equal(fitZoom('page', [[landscape]], { width: 400, height: 2000 }), 400 / (842 * CSS_UNITS));
});

test('Doppelseite rechnet beide Seiten und den Abstand ein', () => {
  assert.equal(fitZoom('width', [[a4, a4]], { width: 1016, height: 900 }, 16), 1000 / (1190 * CSS_UNITS));
});

test('Automatisch ist Seitenbreite mit Obergrenze', () => {
  assert.equal(fitZoom('auto', [[a4]], { width: 3000, height: 900 }), 1.25);
  assert.equal(fitZoom('auto', [[a4]], { width: 500, height: 900 }), 500 / (595 * CSS_UNITS));
  assert.equal(fitZoom('auto', [], { width: 500, height: 900 }), 1);
});
