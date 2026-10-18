import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFArray, decodePDFRawStream } from '../lib/pdf-lib/pdf-lib.esm.min.js';
import { buildPdf, createBlankPdf } from '../js/export.js';
import { importFields, normalValue, storageValue, tappedValue, sameValue, originalValues, shownText, createdField, nextFieldName, isMultiline } from '../js/forms.js';

/** Two pages: "name" on both pages (two widgets), checkbox, radio group, drop-down on page 1, "notiz" on page 2. */
async function formPdf(nameValue = 'Mia') {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]); doc.addPage([400, 400]);
  const form = doc.getForm();
  const name = form.createTextField('name');
  name.setText(nameValue);
  name.addToPage(doc.getPage(0), { x: 20, y: 300, width: 200, height: 24 });
  name.addToPage(doc.getPage(1), { x: 20, y: 300, width: 200, height: 24 });
  form.createCheckBox('ok').addToPage(doc.getPage(0), { x: 20, y: 250, width: 16, height: 16 });
  const color = form.createRadioGroup('farbe');
  color.addOptionToPage('rot', doc.getPage(0), { x: 20, y: 200, width: 16, height: 16 });
  color.addOptionToPage('blau', doc.getPage(0), { x: 60, y: 200, width: 16, height: 16 });
  const klasse = form.createDropdown('klasse');
  klasse.addOptions(['5a', '5b']);
  klasse.addToPage(doc.getPage(0), { x: 20, y: 150, width: 100, height: 20 });
  form.createTextField('notiz').addToPage(doc.getPage(1), { x: 20, y: 100, width: 200, height: 60 });
  // Real forms carry /P on their widgets, pdf-lib does not write it.
  doc.getPages().forEach(page => page.node.Annots()?.asArray().forEach(ref => doc.context.lookup(ref).set(PDFName.of('P'), page.ref)));
  return doc.save();
}

const fieldNames = doc => doc.getForm().getFields().map(f => f.getName()).sort();
const widgetPages = (doc, field) => field.acroField.getWidgets().map(w => doc.getPages().findIndex(p => p.ref === w.P()));

test('Felder werden aus den PDF.js-Daten gelesen', () => {
  const fields = importFields([
    { annotationType: 20, id: '5R', fieldName: 'name', fieldType: 'Tx', rect: [20, 300, 220, 324], fieldValue: 'Mia', multiLine: false, maxLen: 10, textAlignment: 1, defaultAppearanceData: { fontSize: 11 } },
    { annotationType: 20, id: '6R', fieldName: 'ok', fieldType: 'Btn', checkBox: true, exportValue: 'Ja', rect: [20, 266, 36, 250], fieldValue: 'Off' },
    { annotationType: 20, id: '7R', fieldName: 'farbe', fieldType: 'Btn', radioButton: true, buttonValue: 'blau', rect: [60, 200, 76, 216], fieldValue: 'blau' },
    { annotationType: 20, id: '8R', fieldName: 'klasse', fieldType: 'Ch', combo: true, options: [{ exportValue: 'a', displayValue: '5a' }], rect: [0, 0, 1, 1], fieldValue: ['a'] },
    { annotationType: 20, id: '9R', fieldName: 'knopf', fieldType: 'Btn', pushButton: true, rect: [0, 0, 1, 1] },
    { annotationType: 20, id: '10R', fieldName: 'versteckt', fieldType: 'Tx', hidden: true, rect: [0, 0, 1, 1] },
    { annotationType: 1, id: '11R', rect: [0, 0, 1, 1] },
  ]);
  assert.deepEqual(fields.map(f => [f.name, f.kind]), [['name', 'text'], ['ok', 'checkbox'], ['farbe', 'radio'], ['klasse', 'choice']]);
  assert.deepEqual(fields[0], { id: '5R', name: 'name', kind: 'text', rect: [20, 300, 220, 324], value: 'Mia', readOnly: false, rotation: 0, multiline: false, fontSize: 11, align: 'center', maxLen: 10 });
  assert.deepEqual(fields[1].rect, [20, 250, 36, 266]);
  assert.equal(fields[1].on, 'Ja');
  assert.equal(fields[1].value, 'Off');
  assert.equal(fields[2].on, 'blau');
  assert.deepEqual(fields[3].options, [{ value: 'a', label: '5a' }]);
  assert.equal(shownText(fields[3], ['a']), '5a');
  assert.deepEqual(originalValues([fields, [{ ...fields[0], value: 'anders' }]]).get('name'), 'Mia');
});

test('Werte: Form in der App, Speicher von PDF.js, Antippen', () => {
  assert.equal(normalValue('text', null), '');
  assert.equal(normalValue('checkbox', null), 'Off');
  assert.deepEqual(normalValue('choice', 'x'), ['x']);
  assert.deepEqual(normalValue('choice', ''), []);
  const box = { kind: 'checkbox', on: 'Ja' }, radio = { kind: 'radio', on: 'blau' };
  assert.equal(storageValue(box, 'Ja'), true);
  assert.equal(storageValue(radio, 'rot'), false);
  assert.equal(tappedValue(box, 'Off'), 'Ja');
  assert.equal(tappedValue(box, 'Ja'), 'Off');
  assert.equal(tappedValue(radio, 'blau'), 'blau');
  assert.ok(sameValue(['a'], ['a']));
  assert.ok(!sameValue(['a'], 'a'));
});

test('Export behält das Formular, auch ohne Änderungen', async () => {
  const bytes = await formPdf();
  const out = await PDFDocument.load(await buildPdf([0, 1].map(i => ({ sourceId: 'a', pageIndex: i, rotation: 0 })), () => bytes));
  assert.deepEqual(fieldNames(out), ['farbe', 'klasse', 'name', 'notiz', 'ok']);
  const form = out.getForm();
  assert.equal(form.getTextField('name').getText(), 'Mia');
  assert.deepEqual(widgetPages(out, form.getTextField('name')), [0, 1]);
});

test('Geänderte Werte landen im exportierten Formular', async () => {
  const bytes = await formPdf();
  const values = new Map([['name', 'Leon'], ['ok', 'Yes'], ['farbe', 'blau'], ['klasse', ['5b']], ['notiz', 'Zeile 1\nZeile 2']]);
  const out = await PDFDocument.load(await buildPdf([0, 1].map(i => ({ sourceId: 'a', pageIndex: i, rotation: 0 })), () => bytes, () => {}, { formValues: () => values }));
  const form = out.getForm();
  assert.equal(form.getTextField('name').getText(), 'Leon');
  assert.equal(form.getCheckBox('ok').isChecked(), true);
  assert.equal(form.getRadioGroup('farbe').getSelected(), 'blau');
  assert.deepEqual(form.getDropdown('klasse').getSelected(), ['5b']);
  assert.equal(form.getTextField('notiz').getText(), 'Zeile 1\nZeile 2');
  // New appearance: the widget shows the new text, not the old one.
  const ap = form.getTextField('name').acroField.getWidgets()[0].getNormalAppearance();
  const content = new TextDecoder().decode(decodePDFRawStream(out.context.lookup(ap)).decode());
  assert.match(content, /<4C656F6E>|\(Leon\)/);
});

test('Doppelte Seite bekommt eigene Widgets desselben Felds', async () => {
  const bytes = await formPdf();
  const out = await PDFDocument.load(await buildPdf([0, 0].map(i => ({ sourceId: 'a', pageIndex: i, rotation: 0 })), () => bytes));
  const [first, second] = out.getPages().map(p => p.node.lookup(PDFName.of('Annots'), PDFArray).asArray());
  assert.equal(first.length, 5);
  assert.ok(first.every(ref => !second.includes(ref)));
  const form = out.getForm();
  assert.deepEqual(fieldNames(out), ['farbe', 'klasse', 'name', 'ok']);
  assert.deepEqual(widgetPages(out, form.getTextField('name')), [0, 1]);
  assert.deepEqual(widgetPages(out, form.getCheckBox('ok')), [0, 1]);
  assert.deepEqual(widgetPages(out, form.getRadioGroup('farbe')).sort(), [0, 0, 1, 1]);
});

test('Teil-Export nimmt nur die Felder der exportierten Seiten mit', async () => {
  const bytes = await formPdf();
  const out = await PDFDocument.load(await buildPdf([{ sourceId: 'a', pageIndex: 1, rotation: 0 }], () => bytes));
  assert.deepEqual(fieldNames(out), ['name', 'notiz']);
  assert.deepEqual(widgetPages(out, out.getForm().getTextField('name')), [0]);
});

test('Gleiche Feldnamen aus zwei Dateien bleiben getrennt', async () => {
  const sources = { a: await formPdf('Mia'), b: await formPdf('Leon') };
  const values = { b: new Map([['notiz', 'nur B']]) };
  const out = await PDFDocument.load(await buildPdf(
    [{ sourceId: 'a', pageIndex: 1, rotation: 0 }, { sourceId: 'b', pageIndex: 1, rotation: 0 }],
    id => sources[id], () => {}, { formValues: id => values[id] || null },
  ));
  assert.deepEqual(fieldNames(out), ['name', 'name_2', 'notiz', 'notiz_2']);
  const form = out.getForm();
  assert.equal(form.getTextField('name').getText(), 'Mia');
  assert.equal(form.getTextField('name_2').getText(), 'Leon');
  assert.equal(form.getTextField('notiz').getText(), undefined);
  assert.equal(form.getTextField('notiz_2').getText(), 'nur B');
});

test('Ohne Formular schreibt der Export kein /AcroForm', async () => {
  const bytes = await createBlankPdf(200, 200);
  const out = await PDFDocument.load(await buildPdf([{ sourceId: 'a', pageIndex: 0, rotation: 0 }], () => bytes));
  assert.equal(out.catalog.get(PDFName.of('AcroForm')), undefined);
});

const fieldMark = (id, kind, name, points, rot = 0) => ({ id, type: 'field', kind, name, points, rot });

test('Angelegte Felder: Name, Art, mehrzeilig', () => {
  assert.equal(nextFieldName('text', new Set(['Textfeld 1', 'Textfeld 3'])), 'Textfeld 2');
  assert.equal(nextFieldName('checkbox', new Set()), 'Kontrollkästchen 1');
  assert.ok(!isMultiline(fieldMark(1, 'text', 'a', [0, 0, 100, 22])));
  assert.ok(isMultiline(fieldMark(1, 'text', 'a', [0, 0, 100, 60])));
  assert.ok(isMultiline(fieldMark(1, 'text', 'a', [0, 0, 60, 100], 90)));
  const box = createdField(fieldMark(7, 'checkbox', 'Kontrollkästchen 1', [10, 10, 24, 24], 90));
  assert.deepEqual(box, { id: 'm7', name: 'Kontrollkästchen 1', kind: 'checkbox', owner: 'new', created: true, readOnly: false, rect: [10, 10, 24, 24], rotation: 90, value: 'Off', on: 'Yes' });
});

test('Angelegte Felder werden echte Formularfelder mit Werten', async () => {
  const bytes = await createBlankPdf(400, 400);
  const pages = [
    { sourceId: 'a', pageIndex: 0, rotation: 0, marks: [fieldMark(1, 'text', 'Textfeld 1', [20, 300, 200, 322]), fieldMark(2, 'checkbox', 'Kontrollkästchen 1', [20, 250, 34, 264]), fieldMark(3, 'text', 'Textfeld 2', [20, 100, 300, 200])] },
    { sourceId: 'a', pageIndex: 0, rotation: 90, marks: [fieldMark(4, 'text', 'Textfeld 3', [100, 100, 122, 280], 90)] },
  ];
  const values = new Map([['Textfeld 1', 'Mia'], ['Kontrollkästchen 1', 'Yes'], ['Textfeld 2', 'a\nb']]);
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes, () => {}, { newFields: values }));
  const form = out.getForm();
  assert.deepEqual(fieldNames(out), ['Kontrollkästchen 1', 'Textfeld 1', 'Textfeld 2', 'Textfeld 3']);
  assert.equal(form.getTextField('Textfeld 1').getText(), 'Mia');
  assert.equal(form.getCheckBox('Kontrollkästchen 1').isChecked(), true);
  assert.equal(form.getTextField('Textfeld 2').isMultiline(), true);
  assert.equal(form.getTextField('Textfeld 2').getText(), 'a\nb');
  assert.equal(form.getTextField('Textfeld 3').getText(), undefined);
  // The widget covers the drawn box (plus half the frame), also on a turned page.
  const near = (r, box) => Math.abs(r.x - box[0]) <= 0.5 && Math.abs(r.y - box[1]) <= 0.5 && Math.abs(r.x + r.width - box[2]) <= 0.5 && Math.abs(r.y + r.height - box[3]) <= 0.5;
  assert.ok(near(form.getTextField('Textfeld 1').acroField.getWidgets()[0].getRectangle(), [20, 300, 200, 322]));
  assert.ok(near(form.getTextField('Textfeld 3').acroField.getWidgets()[0].getRectangle(), [100, 100, 122, 280]));
  assert.deepEqual(widgetPages(out, form.getTextField('Textfeld 3')), [1]);
  assert.equal(form.getTextField('Textfeld 1').acroField.getWidgets()[0].getAppearanceCharacteristics().getBackgroundColor(), undefined);
});

test('Angelegtes Feld auf doppelter Seite ist ein Feld; belegter Name bekommt einen Zusatz', async () => {
  const bytes = await formPdf();
  const mark = fieldMark(1, 'text', 'name', [20, 50, 200, 72]);
  const pages = [0, 0].map(i => ({ sourceId: 'a', pageIndex: i, rotation: 0, marks: [mark] }));
  const out = await PDFDocument.load(await buildPdf(pages, () => bytes));
  assert.deepEqual(fieldNames(out), ['farbe', 'klasse', 'name', 'name_2', 'ok']);
  assert.deepEqual(widgetPages(out, out.getForm().getTextField('name_2')), [0, 1]);
});
