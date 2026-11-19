const fs = require('fs'); process.chdir(__dirname);
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, VerticalAlign, PageBreak, TableLayoutType } = require('docx');
const C = { ink:'0B1A33', soft:'3E5577', faint:'6F82A3', acc:'0B9DB3', accD:'D4F1F6', mint:'5CF2C4', or:'F2711C', vi:'7C5CFF', red:'E0464B', green:'1F9D55', line:'CFDCEA', bg:'F1F6FB' };
const FW = 10432; // Inhaltsbreite
const F = 'Arial';
// Text mit _1/_2 als tiefgestellt, **fett**
function runs(str, o = {}) {
  const out = [];
  for (const part of str.split(/(\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    const bold = part.startsWith('**');
    const t = bold ? part.slice(2, -2) : part;
    for (const p of t.split(/([a-zŷ])_(\d)/)) {}
    const re = /_(\d)/g; let last = 0, m;
    while ((m = re.exec(t))) {
      if (m.index > last) out.push(new TextRun({ text: t.slice(last, m.index), font: F, bold: bold || o.bold, size: o.size || 19, color: o.color || C.ink, italics: o.italics }));
      out.push(new TextRun({ text: m[1], font: F, bold: bold || o.bold, size: o.size || 19, color: o.color || C.ink, subScript: true }));
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push(new TextRun({ text: t.slice(last), font: F, bold: bold || o.bold, size: o.size || 19, color: o.color || C.ink, italics: o.italics }));
  }
  return out;
}
const P = (str, o = {}) => new Paragraph({ children: runs(str, o), alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, line: o.line ?? 252 }, indent: o.indent, keepNext: o.keepNext });
const img = (file, w, h, o = {}) => new Paragraph({ alignment: o.align ?? AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: w, height: h } })] });
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noB = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const thin = c => ({ style: BorderStyle.SINGLE, size: 4, color: c || C.line });
const allB = c => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });
const cell = (children, w, o = {}) => new TableCell({ children, width: { size: w, type: WidthType.DXA }, columnSpan: o.span, shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined, verticalAlign: o.v ?? VerticalAlign.TOP, margins: { top: o.mt ?? 80, bottom: o.mb ?? 80, left: o.ml ?? 110, right: o.mr ?? 110 }, borders: o.borders ?? { top: NB, bottom: NB, left: NB, right: NB } });
const table = (rows, widths, o = {}) => new Table({ rows, width: { size: widths.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: o.borders ?? noB });
const line = () => new Paragraph({ spacing: { before: 0, after: 0, line: 330 }, border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: 'A9BAD6', space: 1 } }, children: [new TextRun({ text: ' ', font: F, size: 19 })] });
const lines = (n, w = FW) => [new Table({ width: { size: w, type: WidthType.DXA }, columnWidths: [w], layout: TableLayoutType.FIXED, borders: noB,
  rows: Array.from({ length: n }, () => new TableRow({ height: { value: 380, rule: 'exact' }, children: [new TableCell({ width: { size: w, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: NB, left: NB, right: NB, bottom: { style: BorderStyle.DOTTED, size: 6, color: 'A9BAD6' } }, children: [new Paragraph({ children: [] })] })] })) })];
const gap = (h = 80) => new Paragraph({ spacing: { before: 0, after: 0, line: h, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] });

function section(letter, title, right) {
  return table([new TableRow({ children: [
    cell([P(letter, { bold: true, size: 26, color: 'FFFFFF', align: AlignmentType.CENTER, after: 0 })], 560, { fill: C.acc, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
    cell([P(title, { bold: true, size: 24, after: 0 })], FW - 560 - 2600, { fill: C.accD, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
    cell([P(right || '', { size: 17, color: C.soft, align: AlignmentType.RIGHT, after: 0 })], 2600, { fill: C.accD, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
  ] })], [560, FW - 560 - 2600, 2600]);
}
const num = (n, txt, o = {}) => new Paragraph({ spacing: { before: o.before ?? 60, after: 40, line: 252 }, indent: { left: 300, hanging: 300 }, children: [new TextRun({ text: n + '\t', font: F, bold: true, size: 19, color: C.acc }), ...runs(txt)], tabStops: [{ type: 'left', position: 300 }] });

// ---------- Seite 1 ----------
const kopf = table([new TableRow({ children: [
  cell([
    P('NEBELTAL  ·  ARBEITSBLATT  ·  NACH DER ERARBEITUNG', { bold: true, size: 16, color: C.mint, after: 40 }),
    P('Wie ein neuronales Netz lernt', { bold: true, size: 38, color: 'FFFFFF', before: 60, after: 60, line: 276 }),
    P('Spiele **Level 4 bis 7 allein**.  Ort in der Welt = Werte der Gewichte  ·  Höhe = Fehler', { size: 18, color: 'D9E4F5', after: 0 }),
  ], FW - 1900, { fill: C.ink, ml: 240, mt: 110, mb: 110, v: VerticalAlign.CENTER }),
  cell([img('kopf.png', 112, 75)], 1900, { fill: C.ink, v: VerticalAlign.BOTTOM, mt: 60, mb: 0 }),
] })], [FW - 1900, 1900]);
const nameZeile = new Paragraph({ spacing: { before: 120, after: 100 }, tabStops: [{ type: 'left', position: 5000 }, { type: 'left', position: 7900 }], children: [
  new TextRun({ text: 'Name: ______________________________', font: F, size: 18, color: C.soft }),
  new TextRun({ text: '\tKurs: ______________', font: F, size: 18, color: C.soft }),
  new TextRun({ text: '\tDatum: ______________', font: F, size: 18, color: C.soft }),
] });
const chip = t => new TextRun({ text: `\u00A0${t.replace(/ /g, '\u00A0')}\u00A0`, font: F, size: 18, bold: true, color: C.ink, shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.accD } });
const bank = new Paragraph({ spacing: { before: 60, after: 60, line: 360 }, children: [chip('Backpropagation'), new TextRun({ text: '  ', size: 18 }), chip('Learning Rate'), new TextRun({ text: '  ', size: 18 }), chip('Forward Propagation'), new TextRun({ text: '  ', size: 18 }), chip('Gradient Descent'), new TextRun({ text: '  ', size: 18 }), chip('Loss Calculation')] });
const IW = 6600;
const aRow = table([new TableRow({ children: [
  cell([img('kreislauf.png', 372, 231)], IW, { ml: 0, mr: 60, mt: 40 }),
  cell([
    num('1', 'Ordne die fünf Begriffe den Feldern ① – ⑤ im Kreislauf zu.'),
    bank,
    num('2', 'Ergänze in der Tabelle unten jeden Begriff mit einem eigenen Satz und dem, was du in Nebeltal dazu siehst.'),
    new Paragraph({ spacing: { before: 120, after: 0, line: 252 }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.bg }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: C.acc, space: 6 } }, indent: { left: 120 }, children: runs('**Ein Durchlauf des Kreises = ein Sprung in Nebeltal.** Beim „Training starten“ läuft der Kreis viele Male hintereinander.', { size: 18 }) }),
  ], FW - IW, { ml: 120, mr: 0, mt: 120 }),
] })], [IW, FW - IW]);
const TW = [4000, 3832, 2600];
const th = (t, w) => cell([P(t, { bold: true, size: 17, color: 'FFFFFF', after: 0 })], w, { fill: C.soft, borders: allB(C.soft), mt: 50, mb: 50 });
const begriffRow = (de, en) => new TableRow({ height: { value: 500, rule: 'exact' }, children: [
  cell([new Paragraph({ spacing: { before: 0, after: 0 }, children: [...runs(de, { bold: true, size: 18 }), ...runs('  ' + en, { size: 15, color: C.faint, italics: true })] })], TW[0], { borders: allB(), fill: C.bg, mt: 20, mb: 20, v: VerticalAlign.CENTER }),
  cell([P('')], TW[1], { borders: allB() }), cell([P('')], TW[2], { borders: allB() }),
] });
const begriffe = table([
  new TableRow({ tableHeader: true, children: [th('Begriff', TW[0]), th('Was passiert dabei? (ein Satz, eigene Worte)', TW[1]), th('In Nebeltal sieht man …', TW[2])] }),
  begriffRow('Fehlerberechnung', 'Loss Calculation'),
  begriffRow('Gradientenabstieg', 'Gradient Descent'),
  begriffRow('Lernrate', 'Learning Rate'),
  begriffRow('Rückwärtspropagierung', 'Backpropagation'),
  begriffRow('Vorwärtspropagierung', 'Forward Propagation'),
], TW, { borders: { top: thin(), bottom: thin(), left: thin(), right: thin(), insideHorizontal: thin(), insideVertical: thin() } });

const formel = [
  P('**Formeln**', { size: 18, color: C.acc, after: 30 }),
  P('Schätzung:   ŷ = w_1·x_1 + w_2·x_2 + b', { size: 17, after: 20 }),
  P('Fehler:   e = y − ŷ          Loss:   L = ½ · e²', { size: 17, after: 20 }),
  P('Anteile:   ∂L/∂w_1 = −e·x_1    ∂L/∂w_2 = −e·x_2    ∂L/∂b = −e', { size: 17, after: 20 }),
  P('Lernschritt:   neu = alt − η · ∂L/∂(Wert)', { size: 17, after: 0 }),
  P('(dasselbe wie in der Erarbeitung: neu = alt + η · e · Eingang)', { size: 15, color: C.faint, italics: true, after: 0 }),
];
const NW = 5000;
const bTop = table([new TableRow({ children: [
  cell([img('neuron.png', 340, 94, { align: AlignmentType.LEFT })], NW, { ml: 0, mt: 40, v: VerticalAlign.CENTER }),
  cell(formel, FW - NW, { fill: C.bg, ml: 180, mt: 100, mb: 100, borders: { left: { style: BorderStyle.SINGLE, size: 18, color: C.acc } } }),
] })], [NW, FW - NW]);
const RW = [2700, 5032, 2700];
const step = (a, sub, rech, erg, h = 460) => new TableRow({ height: { value: h, rule: 'atLeast' }, children: [
  cell([P(a, { bold: true, size: 18, after: 20 }), ...(sub ? [P(sub, { size: 15, color: C.faint, after: 0 })] : [])], RW[0], { borders: allB(), fill: C.bg, mt: 30, mb: 30 }),
  cell([P(rech, { size: 17, color: C.faint, after: 0 })], RW[1], { borders: allB(), mt: 50 }),
  cell([P(erg, { size: 17, color: C.faint, after: 0, line: 300 })], RW[2], { borders: allB(), mt: 50 }),
] });
const rechnen = table([
  new TableRow({ tableHeader: true, children: [th('Schritt', RW[0]), th('Rechnung', RW[1]), th('Ergebnis', RW[2])] }),
  step('a) Schätzung berechnen', 'Begriff: ____________________', 'ŷ = ', 'ŷ = '),
  step('b) Vergleichen', 'Begriff: ____________________', 'e = ', 'e =             L = '),
  step('c) Anteile am Loss', 'Begriff: ____________________', '∂L/∂w_1 =              ∂L/∂w_2 =              ∂L/∂b =', '', 500),
  step('d) Werte anpassen', 'Begriff: ____________________', 'w_1 neu =                 w_2 neu =                 b neu =', '', 500),
  step('e) Kontrolle', 'a) und b) mit neuen Werten', 'ŷ = ', 'ŷ =             L = '),
], RW, { borders: { top: thin(), bottom: thin(), left: thin(), right: thin(), insideHorizontal: thin(), insideVertical: thin() } });

// ---------- Seite 2 ----------
const WW = 5300;
const cTop = table([new TableRow({ children: [
  cell([img('welt.png', 345, 179, { align: AlignmentType.LEFT })], WW, { ml: 0, mt: 40 }),
  cell([
    P('Das Neuron aus B hat **drei** Werte (w_1, w_2, b) – eine Welt hat aber nur **zwei** Richtungen. Diese Welt zeigt w_1 und b, **w_2 ist fest auf 0,3 gesetzt**. Die Linien sind Höhenlinien des Loss für deinen Pinguin.', { size: 17, after: 40 }),
    num('1', 'Trage deinen neuen Ort aus B d) ein und zeichne den Sprung als Pfeil.', { before: 20 }),
    num('2', 'Rechne B d) noch einmal mit **η = 1**, trage auch diesen Ort ein und berechne den neuen Loss. Was ist passiert?', { before: 20 }),
    P('w_1 = ________   b = ________   L = ________', { size: 17, color: C.faint, indent: { left: 300 }, before: 60, after: 40 }),
    num('3', 'Wie steht der Sprung zu den Höhenlinien? Was sagt das über den Gradienten?', { before: 20 }),
  ], FW - WW, { ml: 160, mr: 0, mt: 40 }),
] })], [WW, FW - WW]);
const cMore = [
  num('4', 'Beim Sprung hat sich auch w_2 verändert. Was passiert deshalb mit dieser Welt? In welchem Level siehst du genau das – und warum ist es dort so?', { before: 60 }),
  ...lines(2),
  num('5', '**Knobel:** Für einen einzelnen Pinguin ist die tiefste Stelle eine **Rinne**, keine Mulde. Warum? Was ändert sich, wenn alle 342 Pinguine zählen?', { before: 80 }),
  ...lines(2),
];
const LW = [2400, 2816, 2400, 2816];
const lvHead = (n, t) => P(`LEVEL ${n}  ·  ${t}`, { bold: true, size: 17, color: C.acc, after: 40 });
const bul = t => new Paragraph({ spacing: { before: 20, after: 30, line: 245 }, indent: { left: 200, hanging: 200 }, children: [new TextRun({ text: '›\t', font: F, bold: true, size: 18, color: C.acc }), ...runs(t, { size: 17 })], tabStops: [{ type: 'left', position: 200 }] });
const net = t => P(t, { size: 15, color: C.soft, italics: true, after: 50 });
const lvB = { top: thin(), bottom: thin(), left: thin(), right: thin() };
const dTable = table([
  new TableRow({ children: [
    cell([lvHead(4, 'Wie schwer ist der Pinguin?'), net('Netz: Flosse → · w → Σ + b → Gewicht'),
      bul('Welche Werte sind die zwei Richtungen der Welt? Ist hier etwas fest?'),
      bul('Trainiere mit Lernrate 0,03 · 0,3 · 0,6 und beschreibe die Lernkurven. Was hat das mit C 2 zu tun?'),
      ...lines(2, LW[0] + LW[1] - 220)], LW[0] + LW[1], { span: 2, borders: lvB, fill: 'FFFFFF' }),
    cell([lvHead(5, 'Pinguine sortieren'), net('Netz: Schnabellänge, Schnabelhöhe → · w_1, · w_2 → σ → „Zügel?“'),
      bul('Laufe einmal im Kreis um die Talmitte, dann gerade von ihr weg. Was passiert jeweils mit der Trennlinie?'),
      bul('Auch ganz unten im Tal bleibt ein Pinguin falsch. Begründe mit der Trennlinie.'),
      ...lines(2, LW[2] + LW[3] - 220)], LW[2] + LW[3], { span: 2, borders: lvB }),
  ] }),
  new TableRow({ children: [
    cell([img('nest6.png', 152, 143)], LW[0], { borders: { top: thin(), bottom: thin(), left: thin(), right: NB }, ml: 40, mr: 0, v: VerticalAlign.CENTER }),
    cell([lvHead(6, 'Das Nest'), net('Ein Neuron: Mama, Papa → σ → „Ei ok?“'),
      bul('Zeichne die beste Gerade für **ein** Neuron ein. Warum schafft es nie alle vier Nester?'),
      bul('Im Tal sind beide Gewichte ≈ 0. Was sagt das Neuron dann – und warum ist das trotzdem der kleinste Fehler?'),
      bul('Der Bias ist hier **fest** (Regler). Was ändert er, was nicht?')], LW[1], { borders: { top: thin(), bottom: thin(), right: thin(), left: NB }, ml: 60 }),
    cell([img('nest7.png', 152, 143)], LW[2], { borders: { top: thin(), bottom: thin(), left: thin(), right: NB }, ml: 40, mr: 0, v: VerticalAlign.CENTER }),
    cell([lvHead(7, 'Zwei Neuronen'), net('Mama, Papa → A, B → σ(8A + 8B − 5)'),
      bul('Zeichne die Geraden von A und B ein. Welches Nest schneidet jede ab? Was macht das Ausgangsneuron daraus?'),
      bul('Grau = fest, Welt A zeigt nur a_1 und a_2. Warum verbiegt sich Welt A, wenn Pinguin B springt?'),
      bul('Nur 3 von 4 richtig: Was haben A und B dann gelernt? Wie heißt so eine Stelle?')], LW[3], { borders: { top: thin(), bottom: thin(), right: thin(), left: NB }, ml: 60 }),
  ] }),
], LW);
const fazit = [
  P('**Zum Schluss:** Erkläre in drei Sätzen, warum ein Netz mit **mehreren** Neuronen Dinge lernen kann, die ein einzelnes Neuron nie schafft – und was das mit Level 8 zu tun hat.', { size: 18, before: 140, after: 40 }),
  ...lines(3), gap(20),
];

const doc = new Document({
  creator: 'MPSkills', title: 'Nebeltal – Wie ein neuronales Netz lernt',
  styles: { default: { document: { run: { font: F, size: 19, color: C.ink } } } },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 567, bottom: 567, left: 737, right: 737 } } },
    children: [
      kopf, nameZeile,
      section('A', 'Der Lernkreislauf', 'nach Level 4–7'), gap(60), aRow, gap(60), begriffe,
      gap(90), section('B', 'Ein Lernschritt von Hand', 'Rechnung'), gap(60), P('Ein Neuron wie in Level 4 schätzt das Gewicht eines Eselspinguins – diesmal aus **zwei** Messwerten. Rechne **einen Lernschritt** mit der Lernrate **η = 0,1** durch (auf zwei Nachkommastellen).', { size: 18, after: 40 }), bTop, gap(60), rechnen,
      new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] }),
      section('C', 'Rechnung = Sprung: eine Welt hält Werte fest', 'zu B'), gap(80), cTop, ...cMore,
      gap(160), section('D', 'Die vier Netze', 'Level 4–7 allein'), gap(80), dTable, ...fazit,
    ] }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync('../Nebeltal_Arbeitsblatt.docx', b); console.log('ok'); });
