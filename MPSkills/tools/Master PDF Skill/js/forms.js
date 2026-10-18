/**
 * Form fields (AcroForm) of the opened PDFs – pure logic, no DOM.
 *
 * Fields are read once per page from the PDF.js annotation data (widgets). A field can have several widgets (radio
 * buttons, the same text field on two pages); they share the fully qualified `name`. Values:
 * - text: string
 * - checkbox, radio: the name of the "on" state of the chosen widget, 'Off' = nothing chosen (as /V in the PDF)
 * - choice: array of export values (one entry for a drop-down list)
 * Coordinates (`rect`) are PDF user space of the unrotated source page, like marks and comments.
 */

export const FIELD_KINDS = {
  text: { label: 'Textfeld' },
  checkbox: { label: 'Kontrollkästchen' },
  radio: { label: 'Optionsfeld' },
  choice: { label: 'Auswahlliste' },
};

const WIDGET = 20;

/** Kind of a PDF.js widget, null for anything that cannot be filled in (push buttons, signatures, …). */
export function fieldKind(data) {
  if (data.fieldType === 'Tx') return 'text';
  if (data.fieldType === 'Btn') return data.checkBox ? 'checkbox' : data.radioButton ? 'radio' : null;
  if (data.fieldType === 'Ch') return 'choice';
  return null;
}

/** The widgets of one page as fields the app can show; hidden widgets and widgets without a name are left out. */
export function importFields(annotations) {
  const fields = [];
  for (const data of annotations || []) {
    if (data.annotationType !== WIDGET || data.hidden || !data.fieldName) continue;
    const kind = fieldKind(data);
    if (!kind || !Array.isArray(data.rect)) continue;
    const [x0, y0, x1, y1] = data.rect;
    const field = {
      id: data.id, name: data.fieldName, kind, rect: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
      value: normalValue(kind, data.fieldValue), readOnly: !!data.readOnly, rotation: ((data.rotation || 0) % 360 + 360) % 360,
    };
    if (data.alternativeText) field.tip = data.alternativeText;
    if (kind === 'text') {
      field.multiline = !!data.multiLine;
      field.fontSize = data.defaultAppearanceData?.fontSize || 0;
      field.align = ['left', 'center', 'right'][data.textAlignment] || 'left';
      if (data.maxLen > 0) field.maxLen = data.maxLen;
      if (data.comb) field.comb = true;
    } else if (kind === 'checkbox') field.on = String(data.exportValue ?? 'Yes');
    else if (kind === 'radio') field.on = String(data.buttonValue ?? '');
    else {
      field.options = (data.options || []).map(o => ({ value: String(o.exportValue ?? o.displayValue ?? ''), label: String(o.displayValue ?? o.exportValue ?? '') }));
      field.combo = !!data.combo;
      field.multiple = !!data.multiSelect;
      field.fontSize = data.defaultAppearanceData?.fontSize || 0;
    }
    fields.push(field);
  }
  return fields;
}

/** A field value from the PDF in the app's shape (see top of file). */
export function normalValue(kind, value) {
  if (kind === 'text') return Array.isArray(value) ? value.join('\n') : String(value ?? '');
  if (kind === 'checkbox' || kind === 'radio') return value == null || value === '' ? 'Off' : String(value);
  if (Array.isArray(value)) return value.map(String);
  return value == null || value === '' ? [] : [String(value)];
}

export function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/** What PDF.js expects in its annotation storage for one widget to draw `value` (ENABLE_STORAGE rendering). */
export function storageValue(field, value) {
  if (field.kind === 'checkbox' || field.kind === 'radio') return value === field.on;
  return value;
}

/** New value after tapping a checkbox or radio widget: a checkbox toggles, a radio button stays chosen. */
export function tappedValue(field, value) {
  if (field.kind === 'checkbox') return value === field.on ? 'Off' : field.on;
  return field.on;
}

/** Key of a field in the app: fields of different files are separate even if they have the same name. */
export const fieldKey = (sourceId, name) => `${sourceId}\u0000${name}`;

/** Original values of all fields of one source: name → value (the first widget of a name counts). */
export function originalValues(fieldsPerPage) {
  const values = new Map();
  for (const fields of fieldsPerPage) for (const f of fields || []) if (!values.has(f.name)) values.set(f.name, f.value);
  return values;
}

/**
 * Font size (pt) for showing a text or choice field. PDF.js replaces the automatic size ("0 Tf") by the size that lets one
 * line fill the field, which is far too big for a multi-line field: then 11 pt are used. Single lines stay within the height.
 */
export function fieldFontSize(field) {
  const [x0, y0, x1, y1] = field.rect, height = field.rotation % 180 ? x1 - x0 : y1 - y0;
  const size = field.fontSize || 0;
  if (field.multiline) return size && size <= height / 2 ? size : 11;
  return Math.max(4, Math.min(size || 12, height * 0.75));
}

/** Text for the field's view: the label of a chosen option, or the text itself. */
export function shownText(field, value) {
  if (field.kind !== 'choice') return String(value ?? '');
  return value.map(v => field.options.find(o => o.value === v)?.label ?? v).join(', ');
}
