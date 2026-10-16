import test from 'node:test';
import assert from 'node:assert/strict';
import { pageTransform, inkPath, markHit, markSvg, markBounds, moveMark, constrainEnd, hexToRgb } from '../js/annotations.js';

const box = { x: 10, y: 20, width: 200, height: 300 };
const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9, `${actual} ≠ ${expected}`));

test('Seitenecken landen bei jeder Drehung an der richtigen Stelle (wie PDF.js)', () => {
  // Unten links der Seite (x0, y0) liegt ungedreht unten links, bei 90° oben links, bei 180° oben rechts, bei 270° unten rechts.
  const cases = { 0: [0, 600], 90: [0, 0], 180: [400, 0], 270: [600, 400] };
  for (const [rotation, expected] of Object.entries(cases)) near(pageTransform(box, Number(rotation), 2).toView(10, 20), expected);
});

test('Ansicht und PDF-Koordinaten lassen sich verlustfrei umrechnen', () => {
  for (const rotation of [0, 90, 180, 270, -90, 450]) {
    const map = pageTransform(box, rotation, 1.5);
    near(map.toPdf(...map.toView(57.5, 123.25)), [57.5, 123.25]);
  }
});

test('Gedrehte Seiten tauschen Breite und Höhe', () => {
  const map = pageTransform(box, 90, 2);
  assert.equal(map.width, 600);
  assert.equal(map.height, 400);
});

test('Strichpfad und Einzelpunkt', () => {
  const map = pageTransform({ width: 100, height: 100 }, 0, 1);
  assert.equal(inkPath([0, 100, 50, 50], map.toView), 'M0 0L50 50');
  assert.equal(inkPath([10, 90], map.toView), 'M10 10L10 10');
  assert.equal(inkPath([], map.toView), '');
});

test('Radierer trifft Striche in der Nähe, berücksichtigt Strichstärke', () => {
  const mark = { type: 'ink', width: 4, points: [0, 0, 100, 0] };
  assert.ok(markHit(mark, 50, 3, 1));
  assert.ok(!markHit(mark, 50, 10, 1));
  assert.ok(markHit({ ...mark, points: [5, 5] }, 6, 6, 1));
});

test('Farbumrechnung', () => {
  assert.deepEqual(hexToRgb('#ff0000'), [1, 0, 0]);
  assert.deepEqual(hexToRgb('kaputt'), [0, 0, 0]);
});

test('Formen werden in Ansichtskoordinaten beschrieben, auch auf gedrehten Seiten', () => {
  const map = pageTransform({ width: 100, height: 200 }, 90, 2);
  const rect = markSvg({ type: 'rect', width: 1, points: [10, 20, 30, 60] }, map);
  assert.deepEqual(rect, { tag: 'rect', attrs: { x: 40, y: 20, width: 80, height: 40 }, width: 2 });
  const ellipse = markSvg({ type: 'ellipse', width: 1, points: [10, 20, 30, 60] }, map);
  assert.deepEqual(ellipse.attrs, { cx: 80, cy: 40, rx: 40, ry: 20 });
  const arrow = markSvg({ type: 'arrow', width: 1, points: [0, 0, 50, 0] }, pageTransform({ width: 100, height: 100 }, 0, 1));
  assert.match(arrow.attrs.d, /^M0 100L50 100M.+L50 100L.+$/);
});

test('Radierer und Auswahl treffen Formen nur am Rand', () => {
  const rect = { type: 'rect', width: 2, points: [0, 0, 100, 50] };
  assert.ok(markHit(rect, 100, 25, 2));
  assert.ok(!markHit(rect, 50, 25, 2));
  const ellipse = { type: 'ellipse', width: 2, points: [0, 0, 100, 50] };
  assert.ok(markHit(ellipse, 50, 50, 2));
  assert.ok(!markHit(ellipse, 50, 25, 2));
  const arrow = { type: 'arrow', width: 2, points: [0, 0, 100, 0] };
  assert.ok(markHit(arrow, 95, 3, 1));
});

test('Begrenzung, Verschieben und Shift-Einrasten', () => {
  assert.deepEqual(markBounds({ type: 'line', width: 2, points: [10, 20, 30, 5] }), { x0: 9, y0: 4, x1: 31, y1: 21 });
  const mark = { id: 7, type: 'ink', width: 1, points: [1, 2, 3, 4] };
  assert.deepEqual(moveMark(mark, 10, -1), { id: 7, type: 'ink', width: 1, points: [11, 1, 13, 3] });
  assert.deepEqual(mark.points, [1, 2, 3, 4]);
  assert.deepEqual(constrainEnd('rect', [0, 0], [10, -4]), [10, -10]);
  const [x, y] = constrainEnd('line', [0, 0], [10, 1]);
  assert.ok(Math.abs(x - Math.hypot(10, 1)) < 1e-9 && Math.abs(y) < 1e-9);
});
