// Musterlösung zum Arbeitsblatt Nebeltal (Stand: Sönkes Fassung vom 21.11.2026)
// node MPSkills/tools/Nebeltal/arbeitsblatt/quelle/loesung.cjs   → ../Nebeltal_Arbeitsblatt_Loesung.docx
// PDF: soffice --headless --convert-to pdf --outdir .. ../Nebeltal_Arbeitsblatt_Loesung.docx
const fs = require('fs'); process.chdir(__dirname);
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, VerticalAlign, TableLayoutType } = require('docx');
const C = { ink: '0B1A33', soft: '3E5577', acc: '0B9DB3', accD: 'D4F1F6', mint: '5CF2C4', green: '1F7A45', greenBg: 'EAF7EF', line: 'CFDCEA', head: '3E5577' };
const FW = 10432, F = 'Arial';

// _1 / _2 tiefgestellt, **fett**
function runs(str, o = {}) {
  const out = [];
  for (const part of str.split(/(\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    const bold = part.startsWith('**');
    const t = bold ? part.slice(2, -2) : part;
    const re = /_(\d)/g; let last = 0, m;
    const mk = (text, sub) => new TextRun({ text, font: F, bold: bold || o.bold, size: o.size || 19, color: o.color || C.ink, italics: o.italics, subScript: sub });
    while ((m = re.exec(t))) { if (m.index > last) out.push(mk(t.slice(last, m.index))); out.push(mk(m[1], true)); last = m.index + m[0].length; }
    if (last < t.length) out.push(mk(t.slice(last)));
  }
  return out;
}
const P = (str, o = {}) => new Paragraph({ children: runs(str, o), alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, line: 252 }, indent: o.indent, keepNext: o.keepNext });
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noB = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const thin = c => ({ style: BorderStyle.SINGLE, size: 4, color: c || C.line });
const allB = c => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });
const cell = (children, w, o = {}) => new TableCell({ children, width: { size: w, type: WidthType.DXA }, shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined, verticalAlign: o.v ?? VerticalAlign.TOP, margins: { top: o.mt ?? 70, bottom: o.mb ?? 70, left: o.ml ?? 110, right: o.mr ?? 110 }, borders: o.borders ?? { top: NB, bottom: NB, left: NB, right: NB } });
const table = (rows, widths, o = {}) => new Table({ rows, width: { size: widths.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: o.borders ?? noB });
const gap = (h = 100) => new Paragraph({ spacing: { before: 0, after: 0, line: h, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] });

function section(letter, title, right) {
  return table([new TableRow({ children: [
    cell([P(letter, { bold: true, size: 26, color: 'FFFFFF', align: AlignmentType.CENTER, after: 0 })], 560, { fill: C.acc, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
    cell([P(title, { bold: true, size: 24, after: 0 })], FW - 560 - 2600, { fill: C.accD, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
    cell([P(right || '', { size: 17, color: C.soft, align: AlignmentType.RIGHT, after: 0 })], 2600, { fill: C.accD, v: VerticalAlign.CENTER, mt: 40, mb: 40 }),
  ] })], [560, FW - 560 - 2600, 2600]);
}
// eingerückt (Tabelle direkt geht nicht einzurücken → Zelle davor)
function qaBlock(n, frage, antworten) {
  const a = (Array.isArray(antworten) ? antworten : [antworten]).map((s, i, arr) => P(s, { color: C.green, after: i === arr.length - 1 ? 0 : 50 }));
  return [
    new Paragraph({ keepNext: true, spacing: { before: 110, after: 40, line: 252 }, indent: { left: 340, hanging: 340 }, tabStops: [{ type: 'left', position: 340 }],
      children: [new TextRun({ text: n + '\t', font: F, bold: true, size: 19, color: C.acc }), ...runs(frage, { color: C.head, size: 18 })] }),
    table([new TableRow({ cantSplit: true, children: [
      cell([P('')], 340),
      cell(a, FW - 340, { fill: C.greenBg, ml: 140, borders: { left: { style: BorderStyle.SINGLE, size: 18, color: C.green }, top: NB, bottom: NB, right: NB } }),
    ] })], [340, FW - 340]),
  ];
}
const hdr = (t, w) => cell([P(t, { bold: true, size: 17, color: 'FFFFFF', after: 0 })], w, { fill: C.head, v: VerticalAlign.CENTER });
const td = (t, w, o = {}) => cell((Array.isArray(t) ? t : [t]).map(s => P(s, { size: 18, color: o.color, bold: o.bold, after: 30 })), w, { borders: allB(), fill: o.fill });

// ---------- Kopf ----------
const kopf = table([new TableRow({ children: [
  cell([
    P('NEBELTAL  ·  MUSTERLÖSUNG  ·  NUR FÜR LEHRKRÄFTE', { bold: true, size: 16, color: C.mint, after: 40 }),
    P('Wie ein neuronales Netz lernt', { bold: true, size: 38, color: 'FFFFFF', before: 60, after: 60 }),
    P('Lösungen zum Arbeitsblatt (Level 4–7). Lösungen in **Grün**, Aufgaben grau verkürzt.', { size: 18, color: 'D9E4F5', after: 0 }),
  ], FW - 1900, { fill: C.ink, ml: 240, mt: 110, mb: 110, v: VerticalAlign.CENTER }),
  cell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: fs.readFileSync('kopf.png'), transformation: { width: 112, height: 75 } })] })], 1900, { fill: C.ink, v: VerticalAlign.BOTTOM, mt: 60, mb: 0 }),
] })], [FW - 1900, 1900]);

// ---------- A ----------
const kreis = table([new TableRow({ children: [
  cell([new Paragraph({ children: [new ImageRun({ type: 'png', data: fs.readFileSync('kreislauf.png'), transformation: { width: 300, height: 186 } })] })], 4700, { ml: 0 }),
  cell([
    P('**1  Felder im Kreislauf**', { color: C.green, after: 60 }),
    ...[['①', 'Vorwärtspropagierung', 'Messwerte rein → Schätzung raus'],
        ['②', 'Fehlerberechnung', 'Ist und Soll nebeneinander'],
        ['③', 'Rückwärtspropagierung', 'Wer war wie stark schuld?'],
        ['④', 'Gradientenabstieg', 'alle Gewichte ein Stück bergab'],
        ['⑤', 'Lernrate', 'Drehknopf klein … groß']]
      .map(([n, b, h]) => P(n + '  **' + b + '**  – ' + h, { color: C.green, size: 18, after: 40 })),
    P('Reihenfolge = ein Sprung; „Training starten“ wiederholt den Kreis für immer neue Pinguine.', { color: C.soft, size: 16, italics: true, before: 60, after: 0 }),
  ], FW - 4700, { v: VerticalAlign.CENTER }),
] })], [4700, FW - 4700]);

const W1 = 3100, W2 = FW - W1;
const tabA = table([
  new TableRow({ tableHeader: true, children: [hdr('Begriff', W1), hdr('2  In Nebeltal sieht man … (Beispiele, andere Formulierungen gelten)', W2)] }),
  ...[['Fehlerberechnung', 'die **Höhe** (Höhenmesser links, Lernkurve oben rechts); im Kasten „Pinguin für Pinguin“ der rote Abstand Schätzung ↔ echt bzw. ✓/✗.'],
      ['Gradientenabstieg', 'der **Sprung bergab** („Lernschritt“, „Training starten“) in Richtung des Pfeils.'],
      ['Lernrate', 'der **Regler** unten; man sieht sie an der **Sprungweite** (große Lernrate = weite Sprünge, ggf. über das Tal hinaus).'],
      ['Rückwärtspropagierung', 'der **Pfeil unter den Füßen**: Er zeigt, welches Gewicht wie stark geändert werden muss (Richtung + Länge). In Level 7 hat jede Welt ihren eigenen Pfeil = Anteil von Neuron A bzw. B.'],
      ['Vorwärtspropagierung', 'der Kasten **„Pinguin für Pinguin“**: Messwerte → · w → Σ (+ b) → Schätzung / „Neuron sagt …“.']]
    .map(([b, s]) => new TableRow({ cantSplit: true, children: [td('**' + b + '**', W1, { fill: 'F1F6FB' }), td(s, W2, { color: C.green })] })),
], [W1, W2]);

// ---------- B ----------
const B1 = 2500, B2 = 5300, B3 = FW - B1 - B2;
const tabB = table([
  new TableRow({ tableHeader: true, children: [hdr('Schritt · Begriff', B1), hdr('Rechnung', B2), hdr('Ergebnis', B3)] }),
  ...[['a) Schätzen', 'Vorwärtspropagierung', 'Schätzung = 2 · 0,5 + 1 · 0,3 + 3,0 = 1,0 + 0,3 + 3,0', '**4,3 kg**'],
      ['b) Vergleichen', 'Fehlerberechnung', 'Fehler = echt − Schätzung = 5,1 − 4,3', '**0,8 kg**  (zu leicht geschätzt)'],
      ['c) Wer war schuld?', 'Rückwärtspropagierung', 'Fehler · Eingang:  w_1: 0,8 · 2 = 1,6   w_2: 0,8 · 1 = 0,8   b: 0,8 · 1 = 0,8', 'w_1 ist am stärksten „schuld“ (größter Eingang)'],
      ['d) Gewichte anpassen', 'Gradientenabstieg (mit Lernrate)', 'w_1 neu = 0,5 + 0,1 · 1,6 = 0,66\nw_2 neu = 0,3 + 0,1 · 0,8 = 0,38\nb neu = 3,0 + 0,1 · 0,8 = 3,08', '**w_1 = 0,66 · w_2 = 0,38 · b = 3,08**'],
      ['e) Kontrolle', '', 'Schätzung = 2 · 0,66 + 1 · 0,38 + 3,08 = 1,32 + 0,38 + 3,08 = 4,78\nFehler = 5,1 − 4,78', '**4,78 kg · Fehler 0,32** – kleiner (0,8 → 0,32)']]
    .map(([s, b, r, e]) => new TableRow({ cantSplit: true, children: [
      td(['**' + s + '**'].concat(b ? ['Begriff: **' + b + '**'] : []), B1, { fill: 'F1F6FB' }),
      td(r.split('\n'), B2, { color: C.green }), td(e, B3, { color: C.green })] })),
], [B1, B2, B3]);

// ---------- D ----------
const D = [
  ['LEVEL 4 · Wie schwer ist der Pinguin?', [
    ['Welche Werte sind die zwei Richtungen der Welt? Ist hier etwas fest?',
      ['Die eine Richtung ist das **Gewicht w** (wie viel kg mehr je cm Flosse), die andere der **Bias b** (Grundgewicht bei 20 cm Flosse).',
       'Fest ist hier **nichts** – das Neuron hat nur diese zwei Werte, beide lernen mit. Fest sind nur die Daten (342 echte Pinguine).']],
    ['Lernrate 0,03 · 0,3 · 0,6 – Lernkurven? Zusammenhang mit C 2?',
      ['**0,03:** Kurve fällt nur langsam, nach 30 Schritten noch nicht unten (zu kleine Sprünge).',
       '**0,3:** Kurve fällt schnell und glatt bis fast ganz unten (± 0,4 kg).',
       '**0,6:** Kurve springt zackig auf und ab bzw. steigt – die Sprünge gehen über das Tal hinaus, das Training „explodiert“ (ab ≈ 0,5).',
       'Genau das passiert in **C 2** mit Lernrate 1: Der Sprung ist so weit, dass man über die Mulde hinaus und höher landet.']],
  ]],
  ['LEVEL 5 · Pinguine sortieren', [
    ['Im Kreis um die Talmitte, dann gerade weg – was passiert mit der Trennlinie?',
      ['**Im Kreis:** Die Trennlinie **dreht sich** (die Richtung vom Mittelpunkt bestimmt den Winkel der Linie).',
       '**Gerade weg:** Die Linie behält ihre Richtung, aber der Übergang wird **schärfer** – das Neuron wird sich sicherer (große Gewichte = sichere 0 % / 100 %). Auf der richtigen Seite wird der Fehler kleiner, auf der falschen wächst er stark.']],
    ['Auch ganz unten im Tal bleibt ein Pinguin falsch – begründe mit der Trennlinie.',
      ['Das Neuron kann nur eine **gerade Linie** ziehen. Die beiden Arten überlappen sich bei Schnabellänge/-höhe: Ein Pinguin liegt zwischen den anderen der anderen Art. Jede gerade Linie, die ihn richtig einsortiert, würde mehrere andere falsch machen – das Tal ist der beste Kompromiss.']],
  ]],
  ['LEVEL 6 · Das Nest', [
    ['Beste Gerade für ein Neuron? Warum schafft es nie alle vier Nester?',
      ['Die grünen Nester („nur Mama“, „nur Papa“) liegen **diagonal gegenüber**, ebenso die roten („leer“, „beide“). Eine einzige gerade Linie kann die beiden grünen nie von den beiden roten trennen – das Problem ist **nicht linear trennbar** (XOR). Jede Gerade macht mindestens ein Nest falsch.']],
    ['Im Tal sind beide Gewichte ≈ 0. Was sagt das Neuron – warum ist das der kleinste Fehler?',
      ['Das Neuron sagt **überall 50 %** („weiß nicht“), es gibt keine Linie mehr.',
       'Jede echte Gerade macht Nester **sicher falsch**, und sicher falsch kostet viel Fehler. 50 % ist bei allen vier Nestern nur „halb falsch“ – zusammen ist das der kleinste Fehler, den ein Neuron hier erreichen kann.']],
    ['Der Bias ist hier fest (Regler). Was ändert er, was nicht?',
      ['Der Bias **verschiebt die Gerade parallel** (Lage), ändert aber **nicht ihre Richtung** – die bestimmen die Gewichte.',
       'Er macht die Aufgabe nicht lösbar: Mit Bias stimmen höchstens 3 von 4 Nestern, das Tal bleibt in der Mitte.']],
  ]],
  ['LEVEL 7 · Zwei Neuronen', [
    ['Geraden von A und B – welches Nest schneidet jede ab? Was macht das Ausgangsneuron daraus?',
      ['Bei der Lösung schneidet **A ein grünes Nest** ab (z. B. „nur Mama am Nest“) und **B das andere** („nur Papa am Nest“) – je eine Ecke.',
       'Das Ausgangsneuron (8·A + 8·B − 5) ist an, wenn **A oder B** an ist: „Ei ok“ genau dann, wenn einer der beiden Fälle vorliegt = genau ein Elternteil am Nest.']],
    ['Grau = fest, Welt A zeigt nur a_1 und a_2. Warum verbiegt sich Welt A, wenn Pinguin B springt?',
      ['Die Höhe ist der Fehler des **ganzen Netzes**. Welt A ist nur ein Schnitt bei den aktuellen Werten von B. Ändert B seine Gewichte, ändert sich die Ausgabe und damit der Fehler an jeder Stelle von Welt A – die Landschaft verbiegt sich.']],
    ['Nur 3 von 4 richtig: Was haben A und B gelernt? Wie heißt so eine Stelle?',
      ['A und B haben **dasselbe gelernt** – beide schneiden dasselbe Nest ab, das andere grüne Nest bleibt falsch.',
       'So eine Stelle heißt **lokales Minimum**: Ringsum geht es bergauf, aber es ist nicht der tiefste Punkt.']],
  ]],
];
const dBlocks = D.flatMap(([titel, fr]) => [
  P(titel, { bold: true, size: 19, color: C.acc, before: 160, after: 20, keepNext: true }),
  ...fr.flatMap(([f, a], i) => qaBlock('›', f, a)),
]);

const doc = new Document({
  creator: 'MPSkills', title: 'Nebeltal – Musterlösung',
  styles: { default: { document: { run: { font: F, size: 19 } } } },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 567, bottom: 567, left: 737, right: 737 } } },
    children: [
      kopf, gap(160),
      section('A', 'Der Lernkreislauf', 'nach Level 4–7'), gap(100),
      kreis, gap(100), tabA, gap(160),
      section('B', 'Ein Lernschritt von Hand', 'Lernrate 0,1'),
      P('Werte aus dem Bild: x_1 = 2 (Flosse − 20 cm), x_2 = 1 (Schnabelhöhe − 14 mm), w_1 = 0,5, w_2 = 0,3, b = 3,0, echt = 5,1 kg.', { size: 18, color: C.soft, before: 80, after: 80 }),
      tabB, gap(160),
      new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] }),
      section('C', 'Rechnung = Sprung auf der Karte', 'zu B'),
      P('Fehler der Karte = mittleres Fehlerquadrat der fünf Pinguine (b = 3,0 fest; tiefste Stelle bei w_1 = 0,9 | w_2 = 0,3).', { size: 17, color: C.soft, italics: true, before: 80, after: 0 }),
      ...qaBlock('1', 'Neuen Ort aus B d) eintragen, Sprung als Pfeil. Tiefer gekommen?',
        ['Neuer Ort **(0,66 | 0,38)**, Pfeil von Start (0,5 | 0,3) schräg nach rechts oben, Richtung Mulde.',
         '**Ja, tiefer:** Fehler auf der Karte etwa 0,96 → 0,27 (heller Bereich). b = 3,08 wird nicht eingetragen, die Karte gilt für b = 3,0.']),
      ...qaBlock('2', 'B d) mit Lernrate 1 – Ort eintragen. Was ist passiert?',
        ['w_1 = 0,5 + 1 · 1,6 = **2,1**,  w_2 = 0,3 + 1 · 0,8 = **1,1**  (b wäre 3,8).',
         'Der Sprung geht **weit über die Mulde hinaus** und landet oben rechts im dunklen Bereich – viel **höher** als vorher (Fehler ≈ 16 statt 0,96). Die Lernrate ist zu groß.']),
      ...qaBlock('3', 'Welche Lernrate würdest du wählen? Begründe mit der Karte.',
        ['Eine **kleine bis mittlere** Lernrate, z. B. **0,1**: Der Sprung landet sicher tiefer und zeigt zur Mulde. Mit 1 springt man über das Tal. Ist sie viel zu klein (z. B. 0,01), kommt man kaum voran und braucht sehr viele Sprünge.']),
      ...qaBlock('4', 'Knobel: Warum wäre bei nur einem Pinguin die tiefste Stelle eine lange Rinne?',
        ['Für deinen Pinguin muss gelten: 2 · w_1 + 1 · w_2 + 3,0 = 5,1, also **2 · w_1 + w_2 = 2,1**.',
         'Das erfüllen **unendlich viele** Paare, z. B. (1 | 0,1), (0,9 | 0,3), (0,5 | 1,1) – sie liegen alle auf einer **Geraden**. Überall dort ist der Fehler 0 → eine Rinne statt einer Mulde. Erst mehrere Pinguine mit verschiedenen Messwerten legen gemeinsam **einen** Punkt fest.']),
      gap(160),
      section('D', 'Die vier Netze', 'Level 4–7 allein'),
      ...dBlocks,
      gap(120),
      ...qaBlock('★', 'Zum Schluss: Warum lernt ein Netz mit mehreren Neuronen, was ein einzelnes Neuron nie schafft?',
        ['Ein einzelnes Neuron kann nur **eine gerade Trennlinie** ziehen. Mehrere Neuronen ziehen **mehrere Linien**, und ein weiteres Neuron dahinter verbindet ihre Antworten (z. B. „A oder B“).',
         'So entstehen Bereiche, die man mit einer Linie nicht abgrenzen kann – wie beim Nest, wo die beiden richtigen Fälle diagonal gegenüberliegen.']),
    ] }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync('../Nebeltal_Arbeitsblatt_Loesung.docx', b); console.log('ok'); });
