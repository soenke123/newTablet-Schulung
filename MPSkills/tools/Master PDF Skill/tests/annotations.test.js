import test from 'node:test';
import assert from 'node:assert/strict';
import { pageTransform, inkPath, markHit, markSvg, markBounds, moveMark, constrainEnd, hexToRgb, eraseMarks, fillShare, strokeBox, scaleMark, pointsBox } from '../js/annotations.js';

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
  assert.deepEqual(rect, { tag: 'rect', attrs: { x: 41, y: 21, width: 78, height: 38 }, width: 2, fill: null }, 'Linie läuft innen an der Kante');
  const ellipse = markSvg({ type: 'ellipse', width: 1, points: [10, 20, 30, 60] }, map);
  assert.deepEqual(ellipse.attrs, { cx: 80, cy: 40, rx: 39, ry: 19 });
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

test('Gefüllte Formen treffen auch innen, ungefüllte nur am Rand', () => {
  const rect = { type: 'rect', color: '#000000', width: 2, points: [0, 0, 100, 50] };
  assert.equal(markHit(rect, 50, 25, 2), false);
  assert.equal(markHit({ ...rect, fill: 'light' }, 50, 25, 2), true);
  const ellipse = { ...rect, type: 'ellipse', fill: 'solid' };
  assert.equal(markHit(ellipse, 50, 25, 0), true);
  assert.equal(markHit(ellipse, 8, 4, 0), false, 'Ecke liegt außerhalb der Ellipse');
  assert.equal(fillShare({ ...rect, fill: 'light', opacity: 0.5 }), 0.25, 'Anteil in der Gruppe, Deckkraft kommt obendrauf');
  assert.equal(fillShare({ type: 'line', fill: 'solid', points: [] }), 0);
});

test('Radieren schneidet Striche an der Stelle auf und lässt den Rest unverändert', () => {
  let id = 100;
  const nextId = () => id++;
  const ink = { id: 1, type: 'ink', color: '#111827', width: 2, opacity: 0.5, points: [0, 0, 100, 0] };
  const far = { id: 2, type: 'ink', color: '#111827', width: 2, points: [0, 50, 100, 50] };
  const marks = [ink, far];
  assert.equal(eraseMarks(marks, 50, 20, 5, nextId), marks, 'nichts getroffen → dasselbe Array');
  const next = eraseMarks(marks, 50, 0, 5, nextId);
  assert.notEqual(next, marks);
  assert.equal(next.at(-1), far, 'nicht getroffene Elemente bleiben dieselben Objekte');
  const pieces = next.filter(m => m !== far);
  assert.equal(pieces.length, 2);
  for (const piece of pieces) {
    assert.equal(piece.type, 'ink');
    assert.equal(piece.opacity, 0.5);
    for (let i = 0; i < piece.points.length; i += 2) assert.ok(Math.abs(piece.points[i] - 50) > 6 - 1e-9, `Punkt ${piece.points[i]} liegt im radierten Bereich`);
  }
  assert.ok(pieces[0].points.at(-2) >= 42 && pieces[1].points[0] <= 58, 'Schnitt dicht am Radierer (höchstens ein Zwischenschritt)');
  assert.deepEqual(eraseMarks([{ ...ink, points: [0, 0, 4, 0] }], 2, 0, 5, nextId), [], 'ganz überdeckt → weg');
});

test('Radieren macht aus getroffenen Formen Striche ohne Füllung', () => {
  const rect = { id: 1, type: 'rect', color: '#dc2626', width: 2, points: [0, 0, 100, 50], fill: 'solid' };
  const next = eraseMarks([rect], 50, 0, 5, () => 9);
  assert.equal(next.length, 1, 'Rechteck an einer Seite aufgeschnitten = ein offener Linienzug');
  assert.equal(next[0].type, 'ink');
  assert.equal(next[0].fill, undefined);
  assert.equal(next[0].color, '#dc2626');
  assert.equal(eraseMarks([rect], 50, 25, 5, () => 9)[0], rect, 'Radieren innen in der Füllung ändert nichts');
});

test('Rand von Rechteck und Ellipse liegt innen an der Kante', () => {
  const rect = { type: 'rect', width: 4, points: [0, 0, 100, 50], fill: 'light' };
  assert.deepEqual(strokeBox(rect), { x0: 2, y0: 2, x1: 98, y1: 48, width: 4 });
  assert.deepEqual(markBounds(rect), { x0: 0, y0: 0, x1: 100, y1: 50 }, 'außen genau der gezogene Kasten');
  assert.equal(strokeBox({ type: 'rect', width: 10, points: [0, 0, 4, 40] }).width, 4, 'Linie wird bei sehr schmalen Formen schmaler');
  const svg = markSvg(rect, pageTransform({ width: 100, height: 100 }, 0, 1));
  assert.deepEqual(svg.attrs, { x: 2, y: 52, width: 96, height: 46 });
  assert.equal(svg.fill, 0.25);
});

test('Größe ändern streckt die Punkte je Achse, flache Elemente werden nur verschoben', () => {
  const ink = { type: 'ink', width: 2, points: [0, 0, 10, 20, 20, 0] };
  assert.deepEqual(scaleMark(ink, [0, 0], [20, 20], [10, 0], [50, 10]).points, [10, 0, 30, 10, 50, 0]);
  const flat = { type: 'ink', width: 2, points: [0, 5, 20, 5] };
  assert.deepEqual(scaleMark(flat, [0, 5], [20, 5], [0, 8], [40, 8]).points, [0, 8, 40, 8]);
  assert.deepEqual(pointsBox({ type: 'rect', points: [50, 40, 10, 0] }), { x0: 10, y0: 0, x1: 50, y1: 40 });
  assert.equal(scaleMark(ink, [0, 0], [20, 20], [10, 0], [50, 10]).width, 2, 'Strichstärke bleibt');
});
