/* LANGE FASSUNG (erster Entwurf 14.11.2026, 4–7 Seiten je Blatt, nach lang/). Gilt als Ideensammlung.
   Baut die Arbeitsblätter zu Tiny LM (eins je Phase) und den Begleitzettel für Lehrkräfte als Word-Dateien.
   Aufruf: node build.cjs   (Bilder vorher: node screenshots.cjs · node schaubilder.cjs · python3 nummern.py)
   Aufbau jedes Arbeitsblatts nach Use – Modify – Create:
     Kennenlernen (Phase und Funktionen entdecken) → Verändern (Regler, Quellen gezielt manipulieren)
     → Erschaffen (Phase 1: Quellen gezielt verändern) bzw. Reflektieren (je später, desto mehr). */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, BorderStyle, Footer, PageNumber, LevelFormat, PositionalTab, PositionalTabAlignment,
  PositionalTabRelativeTo, PositionalTabLeader, VerticalAlign, TableLayoutType, HeightRule, PageBreak,
} = require('docx');

const DIR = __dirname;
const IMG = f => path.join(DIR, 'bilder', f);

/* ---------- Maße und Farben ---------- */
const PAGE_W = 11906, MARGIN = 850, CW = PAGE_W - 2 * MARGIN;   // Inhaltsbreite in DXA
const PX = dxa => Math.round(dxa / 1440 * 96);                   // DXA → Pixel (96 dpi)
const FULL = PX(CW);                                               // volle Bildbreite in px
const C = {
  violet: '6D4AFF', violetDark: '4B2FD6', ink: '1E1B3A', muted: '5B5880', lav: 'F4F1FF', lavLine: 'E4DEFA',
  use: '14A18F', useT: 'E2F5F1', mod: 'D4881A', modT: 'FCEFD9', cre: 'C2398A', creT: 'F9E3EF',
  ask: '5B5FC7', cand: 'E5534A', yellowT: 'FFF6E0',
};
const FONT = 'Arial';

/* ---------- Grundbausteine ---------- */
// Einfaches Inline-Markup: **fett**, __kursiv__
function runs(text, o = {}) {
  const out = [];
  String(text).split(/(\*\*[^*]+\*\*|__[^_]+__)/).forEach(part => {
    if (!part) return;
    if (part.startsWith('**')) out.push(new TextRun({ text: part.slice(2, -2), bold: true, font: FONT, size: o.size || 21, color: o.color || C.ink }));
    else if (part.startsWith('__')) out.push(new TextRun({ text: part.slice(2, -2), italics: true, font: FONT, size: o.size || 21, color: o.color || C.ink }));
    else out.push(new TextRun({ text: part, font: FONT, size: o.size || 21, color: o.color || C.ink, bold: o.bold, italics: o.italics }));
  });
  return out;
}
function p(text, o = {}) {
  return new Paragraph({
    children: Array.isArray(text) ? text : runs(text, o),
    alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 100, line: o.line },
    keepNext: o.keepNext, indent: o.indent,
  });
}
const gap = (n = 80) => new Paragraph({ children: [], spacing: { before: 0, after: n } });
const bullet = (text, o = {}) => new Paragraph({ children: runs(text, o), numbering: { reference: 'dots', level: 0 }, spacing: { after: 60 } });

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const thin = (color = C.lavLine) => ({ style: BorderStyle.SINGLE, size: 6, color });
const allThin = color => ({ top: thin(color), bottom: thin(color), left: thin(color), right: thin(color) });

function cell(children, o = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: o.w, type: WidthType.DXA },
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    borders: o.borders, verticalAlign: o.v || VerticalAlign.TOP, columnSpan: o.span,
    margins: { top: o.pt ?? 90, bottom: o.pb ?? 90, left: o.pl ?? 140, right: o.pr ?? 140 },
  });
}
function grid(rows, widths, o = {}) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
    layout: TableLayoutType.FIXED, borders: o.borders || noBorders, rows,
  });
}

/* ---------- Bilder ---------- */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function image(file, width) {
  const s = pngSize(IMG(file));
  return new ImageRun({ type: 'png', data: s.data, transformation: { width, height: Math.round(width * s.h / s.w) } });
}
function img(file, width = FULL, o = {}) {
  return new Paragraph({ children: [image(file, width)], alignment: o.align || AlignmentType.CENTER, spacing: { before: 60, after: o.after ?? 120 }, keepNext: o.keepNext ?? /gesamt/.test(file) });
}
function caption(text) { return p(text, { size: 17, color: C.muted, align: AlignmentType.CENTER, after: 60 }); }
// Mehrere Bilder nebeneinander, jedes mit Unterschrift
function imgRow(items, o = {}) {
  const n = items.length, w = Math.floor(CW / n);
  const iw = o.width || PX(w) - 24;
  return grid([new TableRow({
    children: items.map(([f, cap]) => cell([img(f, iw, { after: 40 }), caption(cap)], { w, pl: 60, pr: 60 })),
  })], items.map(() => w));
}
// Bild links, Inhalt rechts
function side(file, imgDxa, children, o = {}) {
  const right = CW - imgDxa;
  return grid([new TableRow({
    children: [
      cell([img(file, PX(imgDxa) - 16, { align: AlignmentType.LEFT, after: 0 }), ...(o.cap ? [caption(o.cap)] : [])], { w: imgDxa, pl: 0, pr: 120 }),
      cell(children, { w: right, pl: 160, pr: 0 }),
    ],
  })], [imgDxa, right]);
}

/* ---------- Bausteine fürs Arbeitsblatt ---------- */
const STAGE = {
  use: { label: 'KENNENLERNEN', color: C.use, tint: C.useT, nr: '1' },
  mod: { label: 'VERÄNDERN', color: C.mod, tint: C.modT, nr: '2' },
  cre: { label: 'ERSCHAFFEN', color: C.cre, tint: C.creT, nr: '3' },
  ref: { label: 'REFLEKTIEREN', color: C.cre, tint: C.creT, nr: '3' },
};

function head(kicker, title, sub, steps) {
  const out = [
    p([new TextRun({ text: kicker, font: FONT, size: 18, bold: true, color: C.violet, characterSpacing: 30 })], { after: 0 }),
    p([new TextRun({ text: title, font: FONT, size: 44, bold: true, color: C.ink })], { before: 40, after: 0 }),
    p([new TextRun({ text: sub, font: FONT, size: 24, color: C.muted })], { after: 120 }),
  ];
  if (steps) {
    // Leiste Kennenlernen → Verändern → Erschaffen/Reflektieren
    const w = Math.floor(CW / steps.length);
    out.push(grid([new TableRow({
      children: steps.map(([k, text]) => cell([
        p([new TextRun({ text: STAGE[k].nr + ' · ' + STAGE[k].label, font: FONT, size: 17, bold: true, color: STAGE[k].color })], { after: 0 }),
        p(text, { size: 17, color: C.muted, after: 0 }),
      ], { w, fill: STAGE[k].tint, pt: 70, pb: 70, borders: { top: NONE, bottom: NONE, right: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: STAGE[k].color } } })),
    })], steps.map(() => w)));
    out.push(gap(60));
  }
  out.push(p('Name: ________________________________     Kurs: __________     Datum: ______________', { size: 18, color: C.muted, before: 80, after: 160 }));
  return out;
}

function stage(k, text) {
  // Als Absatz (nicht Tabelle), damit „mit nächstem Absatz zusammenhalten“ wirkt und das Band nie allein unten steht.
  const s = STAGE[k];
  return [new Paragraph({
    children: [
      new TextRun({ text: s.nr + '  ' + s.label, font: FONT, size: 22, bold: true, color: s.color }),
      new TextRun({ text: '   ' + text, font: FONT, size: 19, color: C.muted }),
    ],
    shading: { type: ShadingType.CLEAR, fill: s.tint, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 36, color: s.color, space: 6 } },
    indent: { left: 120 }, spacing: { before: 240, after: 120 }, keepNext: true, keepLines: true,
  })];
}

let taskNo = 0;
function task(text, o = {}) {
  taskNo += 1;
  const color = o.color || C.violet;
  return p([
    new TextRun({ text: ' A' + taskNo + ' ', font: FONT, size: 20, bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: color, color: 'auto' } }),
    new TextRun({ text: '  ', font: FONT, size: 21 }),
    ...runs(text),
  ], { before: 140, after: 80, keepNext: true });
}
function lines(n = 3) {
  // Schreiblinien als Tabelle: aufeinanderfolgende Absätze mit gleichem Rahmen fasst Word zu einem Block zusammen.
  const dot = { style: BorderStyle.DOTTED, size: 6, color: 'B9B3D9' };
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(new TableRow({
    height: { value: 440, rule: HeightRule.EXACT }, cantSplit: true,
    children: [cell(p(' ', { after: 0 }), { w: CW, pt: 0, pb: 0, pl: 0, pr: 0, borders: { top: NONE, left: NONE, right: NONE, bottom: dot } })],
  }));
  return [grid(rows, [CW]), gap(60)];
}
// Tabelle zum Ausfüllen: head = Spaltenköpfe, rows = Zeilen (Strings, '' = leer zum Schreiben)
function fill(headRow, rows, widths, o = {}) {
  const tint = o.tint || C.lav, color = o.color || C.violetDark;
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map(w => Math.round(w / total * CW));
  ws[ws.length - 1] += CW - ws.reduce((a, b) => a + b, 0);
  const hr = new TableRow({
    tableHeader: true,
    children: headRow.map((h, i) => cell(p(h, { size: 18, bold: true, color, after: 0 }), { w: ws[i], fill: tint, borders: allThin(C.lavLine), pt: 60, pb: 60 })),
  });
  const body = rows.map(r => new TableRow({
    height: { value: o.h || 560, rule: HeightRule.ATLEAST }, cantSplit: true,
    children: r.map((t, i) => cell(p(t, { size: 19, after: 0, bold: i === 0 && o.boldFirst !== false && t !== '' }), { w: ws[i], borders: allThin(C.lavLine), v: VerticalAlign.CENTER, pt: 60, pb: 60 })),
  }));
  return [grid(headRow.every(h => !h) ? body : [hr, ...body], ws, { borders: { top: thin(), bottom: thin(), left: thin(), right: thin(), insideHorizontal: thin(), insideVertical: thin() } }), gap(80)];
}
function box(title, text, o = {}) {
  const children = [p([new TextRun({ text: title, font: FONT, size: 21, bold: true, color: o.color || C.violetDark })], { after: 40 })];
  (Array.isArray(text) ? text : [text]).forEach(t => children.push(typeof t === 'string' ? p(t, { after: 40, size: 20 }) : t));
  return [gap(60), grid([new TableRow({ cantSplit: true, children: [cell(children, { w: CW, fill: o.fill || C.lav, pt: 110, pb: 110, pl: 200, pr: 200, borders: { top: NONE, bottom: NONE, right: NONE, left: { style: BorderStyle.SINGLE, size: 36, color: o.color || C.violet } } })] })], [CW]), gap(100)];
}
const merke = text => box('💡  Merke', text);
const tip = text => p('Tipp: ' + text, { size: 18, color: C.muted, after: 80 });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

/* ---------- Dokument ---------- */
function doc(footerText, children) {
  return new Document({
    creator: 'MPSkills', title: footerText,
    styles: { default: { document: { run: { font: FONT, size: 21, color: C.ink } } } },
    numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 800, bottom: 800, left: MARGIN, right: MARGIN } } },
      footers: { default: new Footer({ children: [new Paragraph({ children: [
        new TextRun({ text: footerText, font: FONT, size: 16, color: C.muted }),
        new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.NONE }), 'Seite ', PageNumber.CURRENT], font: FONT, size: 16, color: C.muted }),
      ] })] }) },
      children,
    }],
  });
}
async function save(name, d) {
  const buf = await Packer.toBuffer(d);
  fs.writeFileSync(path.join(DIR, 'lang', name), buf);
  console.log('geschrieben', name, Math.round(buf.length / 1024) + ' KB');
}

/* =====================================================================
   Arbeitsblatt Phase 1 · Frei schreiben
   ===================================================================== */
function ab1() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 1 VON 4', 'Phase 1 · Frei schreiben', 'Wie schreibt eine Maschine, die nur zählen kann?', [
      ['use', 'Handy und Spalten entdecken'], ['mod', 'Regler drehen, Texte ausschalten'], ['cre', 'Tiny gezielt manipulieren'],
    ]),
    p('Tiny ist ein Mini-Sprachmodell. Es kennt nur **90 kurze Texte** – und schreibt trotzdem. Links siehst du das Handy (so wie jeder Chatbot von außen aussieht), rechts kannst du Tiny **auseinandernehmen**.', { after: 120 }),
    img('p1-gesamt-nr.png', FULL),
    caption('① Handy  ② Kandidaten  ③ Kontextfenster  ④ Quellen  ⑤ Alle Quellen (die 90 Texte)'),

    ...stage('use', 'Lerne die Phase und ihre Spalten kennen.'),
    task('Drück im Handy auf **▶ Schreiben**. Schließe dann alle Spalten rechts (Pfeil ⌄) und öffne sie **einzeln** wieder. Was verändert sich jedes Mal im Handy?'),
    ...fill(['Spalte', 'Welche Frage beantwortet sie?', 'Das sehe ich dann im Handy'], [
      ['② Kandidaten', '', ''], ['③ Kontextfenster', '', ''], ['④ Quellen', '', ''],
    ], [2, 4, 4]),
    img('d-p1-ablauf.png', FULL - 40, { keepNext: false }),
    task('Tippe im Handy auf ein beliebiges Wort. Die Spalten zeigen jetzt genau diesen Schritt. Erkläre mit dem Schaubild oben in 2–3 Sätzen, **warum Tiny genau dieses Wort** geschrieben hat.'),
    ...lines(3),
    ...merke('Tiny versteht kein einziges Wort. Es schaut auf die letzten Wörter (**Kontextfenster**), zählt, was in den Quellen danach kam (**Kandidaten**), und würfelt nach diesen Häufigkeiten. Jedes Wort und jedes Satzzeichen ist ein **Token**.'),

    ...stage('mod', 'Dreh an den Reglern und verändere die Quellen.'),
    task('Stell den Regler **N-Gramm** (Spalte Kontextfenster) auf 1, 3, 5 und 7. Lass Tiny jedes Mal neu schreiben (↺, dann ▶).'),
    imgRow([['p1-handy-1gramm.png', '1-Gramm: Tiny schaut auf kein Wort davor'], ['p1-handy-6gramm.png', '6-Gramm: Tiny schaut auf 5 Wörter davor']], { width: 200 }),
    ...fill(['N-Gramm', 'So klingt der Text (++ / + / – / – –)', 'Aus wie vielen Quellen kommt ein Satz? (④)'], [
      ['1-Gramm', '', ''], ['3-Gramm', '', ''], ['5-Gramm', '', ''], ['7-Gramm', '', ''],
    ], [2, 4, 4], { h: 460 }),
    img('d-p1-fenster.png', FULL - 60),
    task('Bei 7-Gramm klingen die Sätze am besten. Erkläre mit dem Schaubild, **warum** – und warum das trotzdem **kein gutes Zeichen** für ein Sprachmodell ist.'),
    ...lines(3),
    task('Stell die **Temperatur** (Spalte Kandidaten) einmal auf 0,2 und einmal auf 2,0. Was passiert mit den Balken? Wann wiederholt sich Tiny, wann schreibt es Unsinn?'),
    imgRow([['p1-kandidaten-sicher.png', 'Temperatur 0,2 – sicher'], ['p1-kandidaten-wild.png', 'Temperatur 2,0 – wild']], { width: 210 }),
    ...lines(3),
    task('Öffne oben rechts **📚 Alle Quellen** und schalte eine ganze Textwelt aus (Häkchen am Reiter). Lass Tiny neu schreiben. Welche Wörter kommen nicht mehr vor? Was bedeutet das für eine KI, die nur mit einseitigen Texten gelernt hat?'),
    ...lines(3),
    tip('In „Alle Quellen“ kannst du jeden Text anklicken und **bearbeiten**. „↺ Zurücksetzen“ holt das Original zurück.'),

    ...stage('cre', 'Ihr bestimmt, was Tiny schreibt – nur über die Quellen.'),
    task('**Mission Manipulation.** Wählt zu zweit eine Mission:'),
    bullet('**a)** Tiny soll den Satz „Der Hund fliegt mit einer Rakete zum Mars.“ schreiben.'),
    bullet('**b)** Tiny soll behaupten, dass Hausaufgaben verboten sind.'),
    bullet('**c)** Eure eigene Idee: ______________________________________________'),
    p('**Regeln:** Ihr dürft Texte bearbeiten, ausschalten und eigene Texte schreiben. N-Gramm und Temperatur dürft ihr frei einstellen. Ihr dürft aber nicht einfach den ganzen Satz einmal hineinkopieren und 7-Gramm wählen – das wäre Abschreiben.', { size: 20, before: 60 }),
    ...fill(['Versuch', 'Was haben wir an den Quellen geändert?', 'N-Gramm / Temp.', 'Geklappt? Wie oft?'], [
      ['1', '', '', ''], ['2', '', '', ''], ['3', '', '', ''],
    ], [1.2, 5, 1.8, 2], { h: 700 }),
    task('Wie viele Stellen musstet ihr ändern, bis Tiny „mitgespielt“ hat? Echte Sprachmodelle lernen aus Milliarden Texten aus dem Internet. Könnte jemand sie auf dieselbe Art manipulieren? Begründet.'),
    ...lines(4),
  ];
}

/* =====================================================================
   Arbeitsblatt Phase 2 · Frage & Antwort
   ===================================================================== */
function ab2() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 2 VON 4', 'Phase 2 · Frage & Antwort', 'Tiny schlägt nach, bevor es schreibt', [
      ['use', 'Suche und Quellen verfolgen'], ['mod', 'Fragen und Quellen verändern'], ['ref', 'Halluzinieren und Quellen bewerten'],
    ]),
    p('Jetzt kannst du Tiny **Fragen stellen**. Tiny sucht zuerst die passendsten Texte heraus – und schreibt dann wie in Phase 1, aber nur noch mit diesen Texten.', { after: 120 }),
    img('p2-gesamt-nr.png', FULL),
    caption('① Chat im Handy  ② Frage zerlegen  ③ Kandidaten  ④ Kontextfenster  ⑤ Quellen'),

    ...stage('use', 'Verfolge, wie aus einer Frage eine Antwort wird.'),
    img('d-p2-ablauf.png', FULL - 40),
    task('Frag Tiny: „**Was frisst ein Hund?**“ Öffne ② **Frage zerlegen**. Trag ein:'),
    side('p2-frage-zerlegen.png', 3000, [
      ...fill(['', ''], [
        ['Diese Wörter werden gesucht:', ''], ['Diese Wörter werden gestrichen:', ''], ['Text A:', ''], ['Text B:', ''], ['Text C:', ''],
      ], [4, 5], { h: 520 }),
      p('Warum streicht Tiny manche Wörter?', { size: 20, before: 40 }),
      ...lines(2),
    ]),
    task('Öffne ⑤ **Quellen**. Im Handy hat jetzt jedes Wort die Farbe seines Textes (A, B oder C). Was ist anders als beim freien Schreiben in Phase 1?'),
    ...lines(2),

    ...stage('mod', 'Verändere Fragen und Quellen gezielt.'),
    task('Stell dieselbe Frage in anderen Worten. Welche Texte findet Tiny – und passt die Antwort?'),
    ...fill(['Frage', 'Gefundene Texte A · B · C', 'Antwort passt? ✓ / ✗'], [
      ['Was frisst ein Hund?', '', ''], ['Was frisst ein Welpe?', '', ''], ['Was mag ein Hund am liebsten essen?', '', ''], ['', '', ''],
    ], [3.5, 4.5, 2]),
    p('Warum klappt es bei manchen Formulierungen schlechter, obwohl die Frage dasselbe meint?', { size: 20 }),
    ...lines(2),
    side('p2-handy-eiffelturm.png', 2700, [
      task('Frag: „**Wie hoch ist der Eiffelturm?**“ In keinem der 90 Texte steht etwas über den Eiffelturm. Woher kommen dann die Wörter der Antwort?'),
      ...lines(3),
      p('Warum ist eine sicher klingende, erfundene Antwort gefährlicher als „Das weiß ich nicht“?', { size: 20 }),
      ...lines(3),
    ], { cap: 'Tiny halluziniert' }),
    gap(80),
    side('p2-handy-erde.png', 2700, [
      task('Unter Tinys 90 Texten stecken **zwei Falschnachrichten** (Tipp: Textwelt Sonnensystem). Findet sie in 📚 Alle Quellen.'),
      ...lines(2),
      p('Frag „**Ist die Erde eine Scheibe?**“ und „**Ist Pluto ein Planet?**“. Wer gewinnt – Wahrheit oder Falschnachricht? Was ändert sich, wenn ihr eine Falschnachricht ausschaltet oder sie dreimal als eigenen Text hinzufügt?', { size: 20 }),
      ...lines(3),
    ], { cap: 'Welche Quellen nutzt Tiny?' }),
    task('Stell im ④ **Kontextfenster** den N-Gramm-Regler auf 2 und auf 6 und frag dasselbe. Werden die Antworten dadurch **richtiger** – oder nur **abgeschriebener**?'),
    ...lines(2),

    ...stage('ref', 'Bewerte, was Nachschlagen kann – und was nicht.'),
    task('**Tiny etwas beibringen:** Schreibt in 📚 Alle Quellen einen eigenen Text, sodass Tiny die Eiffelturm-Frage richtig beantwortet. Klappt es? Ist Tiny dadurch **schlauer** geworden? Begründet.'),
    ...lines(3),
    task('Viele echte Chatbots machen es genauso: Sie suchen zuerst im Internet oder in Dokumenten und schreiben dann (Fachbegriff: **Retrieval**). Nenne je zwei Vorteile und Gefahren.'),
    ...fill(['Vorteile', 'Gefahren'], [['', ''], ['', '']], [1, 1], { boldFirst: false, h: 620 }),
    ...merke('Nachschlagen macht Antworten passender und zeigt die **Quellen**. Aber Tiny prüft nicht, ob eine Quelle stimmt. Und wenn nichts passt, setzt es trotzdem Wörter zusammen – es **halluziniert**.'),
  ];
}

/* =====================================================================
   Arbeitsblatt Phase 3 · Wörter als Punkte
   ===================================================================== */
function ab3() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 3 VON 4', 'Phase 3 · Wörter als Punkte', 'Tiny sucht nach Bedeutung statt nach Buchstaben', [
      ['use', 'Die Wortwolke erkunden'], ['mod', 'Sprünge und Quellen verändern'], ['ref', 'Was heißt „Bedeutung“ für eine Maschine?'],
    ]),
    p('In Phase 2 hat Tiny nur gleiche Wörter gefunden. Jetzt wird jedes Wort zu einem **Punkt**. Wörter, die oft an ähnlichen Stellen stehen, liegen **nah beieinander**.', { after: 120 }),
    img('d-p3-wolke.png', FULL - 40),

    ...stage('use', 'Erkunde die Wortwolke.'),
    img('p3-gesamt-nr.png', FULL - 80, { after: 40 }),
    caption('① Chat im Handy  ② Frage als Punkt  ③ Kandidaten  ④ Kontextfenster  · weiter unten: Wolken-Sprung und Wortwolke'),
    task('Öffne die **Wortwolke** und dreh sie mit dem Finger. Such die Wörter unten (Feld „Wort suchen“) und tippe sie an. Welche Nachbarn haben sie?'),
    ...fill(['Wort', 'Die 3 nächsten Nachbarn', 'Was haben sie gemeinsam?'], [
      ['Hund', '', ''], ['Mars', '', ''], ['Lehrerin', '', ''], ['frisst', '', ''],
    ], [1.6, 4, 4]),
    task('Stell die Frage „**Was frisst ein Welpe?**“ in Phase 2 und in Phase 3. Vergleiche die gefundenen Texte.'),
    side('p3-frage-punkt.png', 3300, [
      ...fill(['', 'Gefundene Texte A · B · C'], [
        ['Phase 2 (gleiche Wörter)', ''], ['Phase 3 (nahe Punkte)', ''],
      ], [2, 5], { h: 900 }),
      p('Warum findet Phase 3 den Text „Der Hund“, obwohl dort nie „Welpe“ steht?', { size: 20, before: 40 }),
      ...lines(3),
    ]),

    ...stage('mod', 'Verändere Sprünge und Quellen.'),
    side('p3-sprung.png', 2900, [
      task('Manchmal **springt** Tiny in der Wolke: Es tauscht ein Wort gegen einen Nachbarn. Stell die **Sprungwahrscheinlichkeit** (Spalte Wolken-Sprung) auf 0 %, auf ≈ 9 % und ganz nach rechts. Frag jedes Mal dasselbe.'),
      ...fill(['Sprung', 'Beispielsatz von Tiny'], [['0 %', ''], ['≈ 9 %', ''], ['ganz hoch', '']], [1.4, 5], { h: 640 }),
    ], { cap: 'Wolken-Sprung: Fleisch → Fisch' }),
    task('Sucht einen **guten** und einen **schlechten** Sprung (Spalte Wolken-Sprung zeigt alle). Warum hat der eine gepasst, der andere nicht?'),
    ...fill(['', 'von → nach', 'Warum gut / schlecht?'], [['guter Sprung', '', ''], ['schlechter Sprung', '', '']], [2, 2.5, 5]),
    task('Schalte in 📚 Alle Quellen die Textwelt **Haustiere** aus. Wo liegt „Welpe“ jetzt, welche Nachbarn hat „Hund“? Was folgt daraus: **Woher** bekommt ein Wort für Tiny seine Bedeutung?'),
    ...lines(3),

    ...stage('ref', 'Denke über Bedeutung und Ähnlichkeit nach.'),
    task('„Nah in der Wolke“ heißt **nicht** „kommt als Nächstes“. Erkläre den Unterschied an einem Beispiel aus der Wolke.'),
    ...lines(3),
    task('Ein Sprung kann eine Antwort retten – oder eine falsche Tatsache erschaffen („Ein Welpe frisst Fisch“). Ist das auch **Halluzinieren**? Diskutiert und haltet eure Meinung fest.'),
    ...lines(3),
    task('Die Wolke zeigt nur **3 Richtungen**, Tiny rechnet aber mit **20 Zahlen** pro Wort (siehe Satz unter der Wolke). Was geht im Bild verloren?'),
    ...lines(2),
    ...merke('Jedes Wort wird zu einer Liste von Zahlen – Fachbegriff **Embedding**. Wörter, die an ähnlichen Stellen stehen, bekommen ähnliche Zahlen und liegen nah. Echte Sprachmodelle rechnen mit Hunderten bis Tausenden solcher Zahlen pro Token.'),
  ];
}

/* =====================================================================
   Arbeitsblatt Phase 4 · Echtes Netz
   ===================================================================== */
function ab4() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 4 VON 4', 'Phase 4 · Echtes Netz', 'Tiny lernt – und braucht die Texte danach nicht mehr', [
      ['use', 'Training beobachten'], ['mod', 'Netz und Frage verändern'], ['ref', 'Phasen vergleichen, Grenzen und Gefahren'],
    ]),
    p('Jetzt zählt Tiny nicht mehr. Ein kleines **neuronales Netz** lernt aus den Texten, welches Wort wahrscheinlich als Nächstes kommt. Danach steckt das Wissen **in Zahlen**.', { after: 120 }),
    img('d-p4-netz.png', FULL - 40),

    ...stage('use', 'Beobachte, wie das Netz lernt.'),
    img('p4-gesamt-nr.png', FULL - 80, { after: 40 }),
    caption('① Chat im Handy  ② Training  ③ Frage  ④ Kandidaten  ⑤ Kontextfenster  · unten: Das Netz von innen'),
    task('Stell Tiny **vor dem Training** die Frage „Was frisst ein Hund?“. Starte dann das **Training** und lass es mindestens **3 Minuten** laufen. Frag danach noch einmal (↻ Nochmal).'),
    ...fill(['', 'Antwort von Tiny', 'Fehler'], [['vor dem Training', '', '–'], ['nach 1 Minute', '', ''], ['nach 3 Minuten', '', '']], [2.2, 6, 1.4]),
    img('d-p4-training.png', FULL - 60),
    img('p4-training.png', FULL - 60),
    task('Beobachte die **Fehlerlinie**. Beschreibe, was sie zeigt, und erkläre mit dem Schaubild, was beim Training mit den Zahlen im Netz passiert.'),
    ...lines(3),
    task('Öffne unten **Das Netz von innen** und „Wie viele Zahlen sind das?“. Tippe ein orangefarbenes Hidden-Neuron an.'),
    img('p4-netz.png', FULL - 160),
    ...fill(['', ''], [['So viele Zahlen hat Tiny:', ''], ['Mein Neuron schiebt diese Wörter an:', ''], ['… und bremst diese:', '']], [4, 6], { h: 560 }),

    ...stage('mod', 'Verändere Netz, Frage und Quellen.'),
    task('Wähle im ⑤ **Kontextfenster** nacheinander **3, 4 und 5 Wörter**. Jede Wahl ist ein eigenes Netz – trainiere jedes etwa 2 Minuten.'),
    ...fill(['Kontextfenster', 'Fehler nach 2 Min.', 'Antwort auf „Was frisst ein Hund?“'], [['3 Wörter', '', ''], ['4 Wörter', '', ''], ['5 Wörter', '', '']], [2, 2, 6]),
    task('Stell im ③ **Frage**-Reiter die **Frage-Stärke** auf 0, 1 und 3. Was passiert mit der Antwort? Warum ziehen **Thema** und **Satzbau** gegeneinander?'),
    imgRow([['p4-handy.png', 'Frage-Stärke 1×'], ['p4-handy-fragestaerke3.png', 'Frage-Stärke 3×']], { width: 190 }),
    ...lines(3),
    task('Ändere in 📚 Alle Quellen einen Text oder schalte eine Textwelt aus. Was meldet das Handy? Warum reicht es nicht, nur den Text zu ändern?'),
    ...lines(2),

    ...stage('ref', 'Vergleiche alle vier Phasen – und frag nach Grenzen.'),
    img('d-vergleich-phasen.png', FULL - 40),
    task('Fülle die Tabelle aus. Nutze deine Notizen von allen vier Arbeitsblättern.'),
    ...fill(['', '1 · Frei schreiben', '2 · Frage & Antwort', '3 · Wörter als Punkte', '4 · Echtes Netz'], [
      ['So entsteht das nächste Wort', '', '', '', ''],
      ['Wie weit schaut Tiny zurück?', '', '', '', ''],
      ['Woher kommt das Wissen?', '', '', '', ''],
      ['Kann Tiny die Quelle zeigen?', '', '', '', ''],
      ['Typischer Fehler', '', '', '', ''],
    ], [2.2, 2, 2, 2, 2], { h: 820 }),
    img('d-vergleich-fenster.png', FULL - 40),
    task('**Kontextfenster.**'),
    bullet('**a)** Warum wurde es mit N-Grammen (Phase 1–3) bei einem langen Kontextfenster schwierig? (Denk an AB 1, Aufgabe 4.)'),
    ...lines(2),
    bullet('**b)** Warum kann ein neuronales Netz besser mit Wörtern umgehen, die es so noch nie hintereinander gesehen hat?'),
    ...lines(2),
    bullet('**c)** Echte Chatbots haben Kontextfenster mit über 100.000 Tokens. Warum ist das wichtig – z. B. in einem langen Gespräch oder mit einem hochgeladenen PDF?'),
    ...lines(2),
    task('**Warum ist Tiny (noch) kein echter Chatbot?** Was haben echte Chatbots zusätzlich?'),
    ...box('Wortspeicher', 'Trainingsdaten (Milliarden Texte) · Milliarden Zahlen statt 163.000 · Aufmerksamkeit / Attention (Transformer) · großes Kontextfenster · Feinabstimmung mit menschlichem Feedback · Sicherheitsregeln · Suche im Internet · Rechenzentren', { fill: C.yellowT, color: C.mod }),
    ...fill(['Das kann Tiny schon', 'Das fehlt Tiny'], [['', ''], ['', ''], ['', '']], [1, 1], { boldFirst: false, h: 520 }),
    task('**Gefahren.** Sammelt aus allen vier Phasen, was schiefgehen kann.'),
    ...fill(['Gefahr', 'Wo hast du es bei Tiny gesehen?', 'Gilt das auch für echte Chatbots? Warum?'], [
      ['Halluzinieren', '', ''], ['Falschnachrichten in den Trainingsdaten', '', ''], ['Vorurteile (Tipp: Textwelt Berufe in Phase 1)', '', ''],
      ['Keine Quellenangabe', '', ''], ['', '', ''],
    ], [2.4, 3.5, 4], { h: 720 }),
    ...merke('Ein neuronales Netz speichert keine Texte, sondern **Zahlen (Gewichte)**. Darum kann es Neues kombinieren und mit ähnlichen Wörtern umgehen – aber es kann nicht mehr sagen, **woher** es etwas weiß. Ein kleiner Fehler beim Training heißt nur: Es sagt die Trainingstexte gut voraus – nicht, dass seine Antworten stimmen.'),
  ];
}

/* =====================================================================
   Begleitzettel für Lehrkräfte
   ===================================================================== */
function sec(title, color) {
  return [gap(80), p([new TextRun({ text: title, font: FONT, size: 30, bold: true, color: color || C.violet })], { after: 80, keepNext: true })];
}
function sub(title, color) {
  return p([new TextRun({ text: title.toUpperCase(), font: FONT, size: 18, bold: true, color: color || C.violetDark, characterSpacing: 20 })], { before: 120, after: 50, keepNext: true });
}
// Zwei Spalten: links Ziele, rechts Grenzen des Modells
function twoCol(lt, litems, rt, ritems, lc, rc) {
  const w = Math.floor(CW / 2);
  const col = (t, items, color, fillC) => cell([
    p([new TextRun({ text: t, font: FONT, size: 20, bold: true, color })], { after: 60 }),
    ...items.map(i => bullet(i, { size: 19 })),
  ], { w, fill: fillC, pt: 110, pb: 110, pl: 180, pr: 180, borders: { top: NONE, bottom: NONE, left: { style: BorderStyle.SINGLE, size: 30, color }, right: { style: BorderStyle.SINGLE, size: 40, color: 'FFFFFF' } } });
  return [grid([new TableRow({ cantSplit: false, children: [col(lt, litems, lc || C.use, C.useT), col(rt, ritems, rc || C.cand, 'FDECEA')] })], [w, CW - w]), gap(60)];
}

function lehrkraft() {
  return [
    ...head('TINY LM · FÜR LEHRKRÄFTE', 'Begleitzettel zu den vier Phasen', 'Ziele, Grenzen des Modells, Diskussionsimpulse und Erwartungshorizont'),
    p('Die Schülerinnen und Schüler lernen in vier Phasen, wie ein Chatbot aufgebaut ist – vom Wörterzählen bis zum neuronalen Netz. Jedes Arbeitsblatt folgt **Kennenlernen → Verändern → Erschaffen/Reflektieren**. In Phase 1 liegt der Schwerpunkt auf dem gezielten Manipulieren der Quellen, danach wird es zunehmend reflektierend; Phase 4 vergleicht alle Phasen.', { after: 120 }),
    img('d-vergleich-phasen.png', FULL - 60),
    ...fill(['Phase', 'Kernfrage', 'Zeit', 'Schwerpunkt', 'Schlüsselbegriffe'], [
      ['1 · Frei schreiben', 'Wie schreibt eine Maschine, die nur zählt?', '2 Std.', 'Use · Modify · **Create**: Quellen manipulieren', 'Token, N-Gramm, Kontextfenster, Wahrscheinlichkeit, Temperatur, Trainingsdaten'],
      ['2 · Frage & Antwort', 'Wie beantwortet ein Modell Fragen?', '1–2 Std.', 'Use · Modify · Reflexion', 'Retrieval, Quelle, Halluzinieren, Falschnachricht'],
      ['3 · Wörter als Punkte', 'Wie kommt Bedeutung in Zahlen?', '1 Std.', 'Use · Modify · Reflexion', 'Embedding, Ähnlichkeit, Vektor, Dimension'],
      ['4 · Echtes Netz', 'Was ändert ein neuronales Netz – und was fehlt noch?', '2 Std.', 'Use · Modify · **viel Reflexion**, Vergleich', 'Training, Fehler (Loss), Gewichte, Neuron, Kontextfenster, Skip-Verbindung'],
    ], [2, 3, 1, 2.6, 3.4], { h: 500 }),
    ...box('Vorbereitung im Raum', [
      bullet('Raum mit Tiny LM anlegen. Jede Phase wird **einzeln geteilt** (Teilen-Symbol neben dem Reiter oben). Ohne geteilte Phase sehen die Tablets „Gleich geht’s los“.', { size: 19 }),
      bullet('Alles, was die Klasse an den Quellen ändert, bleibt **nur auf dem jeweiligen Tablet** (im Browser). „↺ Zurücksetzen“ in 📚 Alle Quellen holt das Original zurück. Am Beamer sieht die Klasse Ihren eigenen Stand.', { size: 19 }),
      bullet('Phase 4: Das Training läuft im Browser und braucht **3–4 Minuten**, bis die Antworten passen. Früh starten lassen; es läuft weiter, während man in Phase 4 andere Spalten öffnet. Das trainierte Netz bleibt beim Phasenwechsel erhalten, geänderte Quellen verlangen „Netz neu bauen“.', { size: 19 }),
      bullet('Jedes Tablet würfelt anders – unterschiedliche Ergebnisse sind gewollt und gutes Gesprächsmaterial.', { size: 19 }),
    ]),

    /* ---------- Phase 1 ---------- */
    pageBreak(),
    ...sec('Phase 1 · Frei schreiben', C.use),
    ...twoCol('Ziele – die SuS können …', [
      'erklären, dass ein Sprachmodell **Token für Token** das nächste Wort aus Wahrscheinlichkeiten wählt,',
      'Kontextfenster (N-Gramm) und Temperatur beschreiben und ihre Wirkung vorhersagen,',
      'zeigen, dass die Ausgabe **direkt von den Trainingsdaten** abhängt – und sie gezielt manipulieren.',
    ], 'Grenzen von Tiny in dieser Phase', [
      'Tiny versteht nichts, es findet nur **exakt gleiche Wortfolgen**.',
      'Tiny kann kein Wort schreiben, das in keiner Quelle steht.',
      'Langes Fenster → Tiny **schreibt ab** (Auswendiglernen statt Verallgemeinern).',
      'Tokens sind hier ganze Wörter; echte Modelle zerlegen in Wortteile.',
    ]),
    sub('Eingebaute Stolpersteine'),
    bullet('1-Gramm = Wortsalat (nur Häufigkeit zählt), 7-Gramm = Abschreiben (die Quellen-Spalte zeigt dann meist nur einen Text).'),
    bullet('Echte Zahlen (Schaubild AB 1): „frisst“ 22× mit vielen Fortsetzungen · „Hund frisst“ 2× → immer „Fleisch“ · „der Hund frisst“ 1× → Kopie.'),
    bullet('Textwelt **Berufe** ist absichtlich einseitig (die Chefin, die Ärztin, der Krankenpfleger) – Tiny übernimmt das ungefragt.'),
    bullet('Zwei Falschnachrichten im Sonnensystem (flache Erde, Pluto) – Material für Phase 2.'),
    sub('Grenzfragen an Tiny'),
    bullet('„Kann Tiny ein Wort erfinden?“ – Nein, alles stammt aus den Quellen. Was heißt das für „Kreativität“?'),
    bullet('„Gibt es eine Einstellung, bei der Tiny flüssig **und** neu schreibt?“ – Kaum: Kurz = neu, aber holprig; lang = flüssig, aber kopiert. Genau dieses Dilemma lösen erst Netze (Phase 4).'),
    sub('Diskussionsimpulse'),
    bullet('Tiny kopiert bei 7-Gramm einen Satz 1:1. **Wem gehört der Satz?** (Urheberrecht, Trainingsdaten)'),
    bullet('Ist ein Text gut, nur weil er flüssig klingt?'),
    bullet('Wer entscheidet, mit welchen Texten eine KI lernt – und was fehlt dann?'),
    bullet('Ist Würfeln (Temperatur) schon Kreativität?'),
    sub('Erwartungshorizont (Auszug)'),
    bullet('**A1:** Kandidaten – welches Wort kommt? (?-Kachel im Handy) · Kontextfenster – worauf schaut Tiny? (Rahmen um die letzten Wörter) · Quellen – aus welchem Text? (Farben + Legende).'),
    bullet('**A3/A4:** Kleines N → viele Quellen pro Satz, grammatisch kaputt; großes N → eine Quelle, Satz abgeschrieben. Lange Wortfolgen kommen in 90 Texten fast nie zweimal vor → keine Auswahl.'),
    bullet('**A5:** Niedrige Temperatur → immer das häufigste Wort, Schleifen; hohe → seltene Wörter, Unsinn.'),
    bullet('**A7/A8:** Mehrere Texte mit derselben Wortfolge erhöhen die Wahrscheinlichkeit; schon wenige gezielte Änderungen reichen, wenn ein Thema selten ist. Übertragung: **Data Poisoning** – manipulierte Webseiten können Trainingsdaten echter Modelle vergiften.'),

    /* ---------- Phase 2 ---------- */
    pageBreak(),
    ...sec('Phase 2 · Frage & Antwort', C.ask),
    ...twoCol('Ziele – die SuS können …', [
      'den Ablauf **Suchen → Schreiben** (Retrieval) beschreiben,',
      'Grenzen einer Stichwortsuche benennen (Synonyme, Umformulierungen),',
      'erklären, wie **Halluzinationen** entstehen, und Quellen kritisch prüfen.',
    ], 'Grenzen von Tiny in dieser Phase', [
      'Die Suche vergleicht nur **Wortstämme**, keine Bedeutung („Welpe“ ≠ „Hund“).',
      'Tiny prüft nicht, ob eine Quelle **stimmt** – die Mehrheit der Texte gewinnt.',
      'Die Antwort ist weiter N-Gramm-Text: Sie kann vom Thema abdriften.',
      'Wenn nichts passt, rät Tiny trotzdem (mit Warnhinweis im Chat).',
    ], C.use),
    sub('Eingebaute Stolpersteine'),
    bullet('„**Wie hoch ist der Eiffelturm?**“ → Tiny beginnt „Der Eiffelturm ist …“ und setzt Wörter aus fremden Texten zusammen; Hinweis „Ausgedacht!“.'),
    bullet('„**Ist die Erde eine Scheibe?**“ → Der Text „Die geheime Wahrheit über die Erde“ steht gegen mehrere Texte mit „Die Erde ist eine Kugel“ und verliert meistens.'),
    bullet('„**Pluto ist ein …**“ → „echter“ 3× gegen „Zwergplanet“ 2×: **Die Falschnachricht gewinnt**, weil das Thema selten ist. Mehrheit ≠ Wahrheit.'),
    bullet('„Wie lange dauert eine Reise zum Mars?“ findet auch das Interview mit einer Ärztin (wegen „lange“, „dauert“) – Grenzen der Stichwortsuche, Brücke zu Phase 3.'),
    sub('Grenzfragen an Tiny'),
    bullet('„**Was frisst ein Hund nicht?**“ – Achtet Tiny auf das „nicht“? (Kleine Wörter werden oft gestrichen.)'),
    bullet('Zweimal dieselbe Frage: gleiche Antwort? Warum nicht?'),
    bullet('Frage zu einem Thema mit nur einem Text: Wie stark hängt die Antwort an diesem einen Text?'),
    sub('Diskussionsimpulse'),
    bullet('Warum klingt eine Halluzination genauso sicher wie eine richtige Antwort?'),
    bullet('Sollte ein Chatbot öfter „Das weiß ich nicht“ sagen? Warum tun es viele selten?'),
    bullet('Ein Chatbot nennt eine Quelle – ist die Antwort damit richtig? Wie prüft man das?'),
    bullet('Wer haftet, wenn ein Chatbot mit einer falschen Quelle falsch berät?'),
    sub('Erwartungshorizont (Auszug)'),
    bullet('**A1:** gesucht „frisst“, „Hund“; gestrichen „was“, „ein“ (Füllwörter tragen keine Information, sie stehen in fast jedem Text).'),
    bullet('**A3:** „Welpe“ steht kaum in den Texten → andere Texte werden gewählt. Gleiche Bedeutung ≠ gleiche Wörter.'),
    bullet('**A7:** Tiny ist nicht schlauer, nur besser **versorgt** – das Wissen liegt in den Quellen, nicht im Modell.'),
    bullet('**A8:** Vorteile: aktuelle Informationen, nachprüfbare Quellen, weniger Erfinden. Gefahren: falsche/manipulierte Quellen, Quelle wird falsch zusammengefasst, Scheinsicherheit.'),

    /* ---------- Phase 3 ---------- */
    pageBreak(),
    ...sec('Phase 3 · Wörter als Punkte', C.ask),
    p('Hinweis: Phase 3 ist noch ein **Prototyp**. Bitte vorher einmal selbst durchklicken.', { size: 19, color: C.muted }),
    ...twoCol('Ziele – die SuS können …', [
      'erklären, dass Wörter als **Zahlenlisten (Embeddings)** dargestellt werden,',
      'beschreiben, dass Nähe = **ähnlicher Gebrauch** im Text bedeutet,',
      'Suche nach Bedeutung und Stichwortsuche vergleichen,',
      'erkennen, dass ein 3D-Bild nur einen Teil der Information zeigt.',
    ], 'Grenzen von Tiny in dieser Phase', [
      'Die Wolke stammt aus nur 90 Texten – Nähe ist oft eher **Thema** als Bedeutung.',
      'Das Bild zeigt 3 von 20 Richtungen; nur etwa ein Drittel der Nachbarn bleibt im Bild nah.',
      'Der Wolken-Sprung ist **nachgebaut** – in echten Netzen passiert er von selbst (ähnliche Zahlen → ähnliche Vorhersage).',
      'Nach einem Sprung passt der Artikel nicht immer.',
    ], C.use),
    sub('Eingebaute Stolpersteine'),
    bullet('„Was frisst ein Welpe?“ → findet „Der Hund“, obwohl „Welpe“ dort nicht vorkommt.'),
    bullet('Sprünge wie Fleisch → Fisch oder Körner erzeugen **plausible, aber falsche** Tatsachen.'),
    bullet('Sprungwahrscheinlichkeit 0 = reines N-Gramm wie in Phase 2.'),
    sub('Grenzfragen an Tiny'),
    bullet('„**Was frisst ein Planet?**“ – Tiny antwortet trotzdem. Woran liegt das?'),
    bullet('Liegen „Lehrer“ und „Lehrerin“ nah? Und „Chefin“ und „Krankenpfleger“? Was verraten die Nachbarn über die Texte?'),
    sub('Diskussionsimpulse'),
    bullet('Was „bedeutet“ ein Wort für eine Maschine, die nur Nachbarn zählt? Ist das Verstehen?'),
    bullet('Echte Modelle lernen Nähe aus Internettexten: Welche Vorurteile könnten dabei in die Zahlen wandern?'),
    bullet('Ist der Sprung kreativ – oder gefährlich?'),
    sub('Erwartungshorizont (Auszug)'),
    bullet('**A1:** Hund – Katze, Welpe, Hamster (Haustiere); Mars – Jupiter, Saturn (Planeten); Nachbarn stehen in ähnlichen Sätzen.'),
    bullet('**A5:** Ohne Haustier-Texte fehlen die gemeinsamen Satzumgebungen – „Welpe“ verliert seine Nachbarn. Bedeutung entsteht aus dem **Kontext in den Daten**.'),
    bullet('**A6:** Nah = austauschbar an derselben Stelle („Hund“/„Katze“), nicht Fortsetzung („Hund“ → „frisst“).'),
    bullet('**A7:** Ja, in der Wirkung: eine sicher formulierte, nicht belegte Aussage. Unterschied: Hier ist der Sprung sichtbar.'),

    /* ---------- Phase 4 ---------- */
    pageBreak(),
    ...sec('Phase 4 · Echtes Netz', C.cre),
    ...twoCol('Ziele – die SuS können …', [
      'den Aufbau **Eingang → Hidden-Schicht → Ausgang** beschreiben,',
      'Training als schrittweise **Fehlerverkleinerung** erklären,',
      'erklären, warum das Wissen nach dem Training in **Gewichten** steckt und Quellen nicht mehr sichtbar sind,',
      'alle Phasen vergleichen und die Bedeutung großer **Kontextfenster** begründen,',
      'Unterschiede zu echten Chatbots und deren Gefahren benennen.',
    ], 'Grenzen von Tiny in dieser Phase', [
      'Eine Hidden-Schicht, rund **163.000 Zahlen** – echte Modelle haben Milliarden.',
      '**Keine Aufmerksamkeit (Attention)**: Tiny sieht nur 3–5 Wörter + Frage.',
      'Trainiert auf 90 Texten im Browser – die Sätze bleiben holprig.',
      'Artikel + Nomen der Frage werden als Antwortanfang übernommen (gestrichelte Kacheln) – eine Hilfskonstruktion.',
      'Der Fehler steigt teils, weil das Netz auch Antwortanfänge üben muss: **kleiner Fehler ≠ gute Antwort**.',
    ], C.use),
    sub('Eingebaute Stolpersteine'),
    bullet('Untrainiert: alle 1.243 Wörter fast gleich wahrscheinlich – reiner Zufall.'),
    bullet('Frage-Stärke 3× → „frisst frisst frisst“: Thema schlägt Grammatik. Die **Abkürzung (Skip-Verbindung)** gibt es auch in großen Modellen (Residualverbindungen).'),
    bullet('Spalte Quellen: „Das fertige Netz braucht die Quellen nicht mehr.“ – Kernsatz für die Reflexion.'),
    bullet('Quellen ändern → „Netz neu bauen“: Neues Wissen braucht neues Training.'),
    sub('Grenzfragen an Tiny'),
    bullet('Frage zu einem Thema, das in keinem Text vorkommt: Was macht das Netz? Kann es jetzt noch „Ausgedacht!“ melden?'),
    bullet('Frag nach dem Training nach einem Text, den du vorher geändert hast: Weiß das Netz davon?'),
    bullet('Woher weiß das Netz, welche Quelle stimmt? (Gar nicht – es mittelt.)'),
    sub('Diskussionsimpulse'),
    bullet('**Kontextfenster:** Warum gehen 100.000 Tokens mit N-Grammen nicht? (So lange Folgen kommen nie zweimal vor.) Warum schafft es ein Netz? (Ähnliche Wörter → ähnliche Zahlen, es verallgemeinert; echte Modelle gewichten mit Attention, welche Wörter im Fenster wichtig sind.)'),
    bullet('Wenn das Wissen in Zahlen steckt: Kann man einen einzelnen Text wieder **löschen** (Recht auf Vergessen, Urheberrecht)?'),
    bullet('Warum können echte Chatbots ihre Quellen oft nicht nennen – und warum suchen viele deshalb zusätzlich (Phase 2)?'),
    bullet('Tiny trainiert 3 Minuten auf einem Tablet; große Modelle Monate auf Tausenden Grafikkarten. Was heißt das für **Energie, Kosten und Macht**?'),
    bullet('Was fehlt Tiny zum Chatbot? Datenmenge, Modellgröße, Attention/Transformer, Feinabstimmung auf Gespräche mit menschlichem Feedback, Sicherheitsregeln, Werkzeuge (Suche, Rechner).'),
    sub('Erwartungshorizont: Vergleichstabelle (A7)'),
    ...fill(['', '1 · Frei schreiben', '2 · Frage & Antwort', '3 · Wörter als Punkte', '4 · Echtes Netz'], [
      ['Nächstes Wort', 'zählen + würfeln', 'erst 3 Texte suchen, darin zählen', 'nach Bedeutung suchen, zählen, manchmal springen', 'Netz rechnet Wahrscheinlichkeiten aus'],
      ['Zurückschauen', '0–6 Wörter (N-Gramm)', '0–6 Wörter + Frage nur zur Suche', '0–6 Wörter + Wolke', '3–5 Wörter + Frage als eigener Eingang'],
      ['Wissen', 'in den Quellen', 'in 3 ausgewählten Quellen', 'Quellen + Wortpunkte', 'in den Gewichten (Zahlen)'],
      ['Quelle zeigen?', 'ja, jedes Wort', 'ja, A · B · C', 'ja (Sprünge markiert)', 'nein'],
      ['Typischer Fehler', 'Wortsalat oder Kopie', 'Halluzinieren, falsche Quellen', 'falsche Sprünge', 'holprige Sätze, Wiederholung, keine Quelle'],
    ], [2, 2, 2, 2, 2], { h: 420 }),
    sub('Erwartungshorizont (weitere Aufgaben)'),
    bullet('**A1/A2:** Vor dem Training Zufallswörter; die Fehlerlinie fällt; bei jedem Beispiel werden alle Gewichte ein kleines Stück so verschoben, dass das richtige Wort wahrscheinlicher wird.'),
    bullet('**A4:** Mehr Wörter → oft niedrigerer Fehler, aber mehr Auswendiglernen und langsameres Training.'),
    bullet('**A5:** Die Frage zieht zum Thema, der Kontext sorgt für den Satzbau; ist die Frage zu stark, gewinnt nur noch das Thema.'),
    bullet('**A6:** Die Gewichte enthalten das alte Wissen; neue Daten erfordern neues Training.'),
    bullet('**A9:** Tiny kann: Wahrscheinlichkeiten lernen, Fragen berücksichtigen, verallgemeinern. Fehlt: riesige Datenmenge, Milliarden Parameter, Attention, langes Kontextfenster, Feinabstimmung auf Dialoge, Sicherheitsregeln, Werkzeuge.'),
    bullet('**A10:** Halluzinieren, Falschnachrichten und Vorurteile in den Daten, fehlende Quellen – alles gilt auch für echte Chatbots, nur schwerer zu sehen.'),
  ];
}

(async () => {
  await save('TinyLM_AB1_Frei_schreiben.docx', doc('Tiny LM · Arbeitsblatt 1 · Frei schreiben', ab1()));
  await save('TinyLM_AB2_Frage_und_Antwort.docx', doc('Tiny LM · Arbeitsblatt 2 · Frage & Antwort', ab2()));
  await save('TinyLM_AB3_Woerter_als_Punkte.docx', doc('Tiny LM · Arbeitsblatt 3 · Wörter als Punkte', ab3()));
  await save('TinyLM_AB4_Echtes_Netz.docx', doc('Tiny LM · Arbeitsblatt 4 · Echtes Netz', ab4()));
  await save('TinyLM_Begleitzettel_Lehrkraft.docx', doc('Tiny LM · Begleitzettel für Lehrkräfte', lehrkraft()));
})();
