/* KURZE FASSUNG (höchstens eine Doppelseite je Phase, nach kurz/). Die lange Fassung baut build-lang.cjs nach lang/.
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
let WIDTH = CW;   // Breite für fill()/lines(); side() setzt sie für die rechte Spalte
function side(file, imgDxa, children, o = {}) {
  const right = CW - imgDxa;
  if (typeof children === 'function') { WIDTH = right - 160; children = children(); WIDTH = CW; }
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
  if (steps) out.push(p('Name: ________________________________     Kurs: __________     Datum: ______________', { size: 18, color: C.muted, before: 80, after: 160 }));
  else out.push(gap(80));
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
    children: [cell(p(' ', { after: 0 }), { w: WIDTH, pt: 0, pb: 0, pl: 0, pr: 0, borders: { top: NONE, left: NONE, right: NONE, bottom: dot } })],
  }));
  return [grid(rows, [WIDTH]), gap(60)];
}
// Tabelle zum Ausfüllen: head = Spaltenköpfe, rows = Zeilen (Strings, '' = leer zum Schreiben)
function fill(headRow, rows, widths, o = {}) {
  const tint = o.tint || C.lav, color = o.color || C.violetDark;
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map(w => Math.round(w / total * WIDTH));
  ws[ws.length - 1] += WIDTH - ws.reduce((a, b) => a + b, 0);
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
  fs.writeFileSync(path.join(DIR, 'kurz', name), buf);
  console.log('geschrieben', name, Math.round(buf.length / 1024) + ' KB');
}

/* =====================================================================
   KURZE FASSUNG: höchstens eine Doppelseite je Phase (Sönke 14.11.2026: „maximal eine Doppelseite pro Phase“).
   Seite 1 = Kennenlernen, Seite 2 = Verändern + Erschaffen/Reflektieren. Die lange Fassung: build-lang.cjs → lang/.
   ===================================================================== */
const half = (CW - 200) / 2;

/* ---------- Arbeitsblatt Phase 1 · Frei schreiben ---------- */
function ab1() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 1', 'Phase 1 · Frei schreiben', 'Wie schreibt eine Maschine, die nur zählen kann?', [
      ['use', 'Spalten entdecken'], ['mod', 'Regler drehen'], ['cre', 'Tiny über die Quellen manipulieren'],
    ]),
    ...stage('use', 'Lerne Handy und Spalten kennen.'),
    side('p1-gesamt-nr.png', 5200, () => [
      task('Drück ▶ **Schreiben**. Schließ alle Spalten (⌄) und öffne ②, ③, ④ **einzeln**. Was zeigt jede Spalte im Handy?'),
      ...fill(['Spalte', 'Das sehe ich im Handy'], [['② Kandidaten', ''], ['③ Kontextfenster', ''], ['④ Quellen', '']], [2.2, 4], { h: 520 }),
    ], { cap: '① Handy ② Kandidaten ③ Kontextfenster ④ Quellen ⑤ Alle Quellen' }),
    img('d-p1-ablauf.png', 560, { after: 60 }),
    task('Tippe im Handy auf ein Wort – die Spalten zeigen genau diesen Schritt. Erkläre mit dem Schaubild, **warum** Tiny dieses Wort geschrieben hat.'),
    ...lines(3),
    ...merke('Tiny versteht kein Wort. Es schaut auf die letzten Wörter (**Kontextfenster**), zählt, was in den Quellen danach kam (**Kandidaten**), und würfelt.'),

    ...stage('mod', 'Dreh an den Reglern.'),
    side('k-p1-ngramm.png', 3600, () => [
      task('Stell **N-Gramm** (Spalte ③) auf 1, 3 und 7 und lass Tiny neu schreiben (↺, ▶).'),
      ...fill(['N', 'So klingt der Text', 'Wie viele Quellen pro Satz?'], [['1', '', ''], ['3', '', ''], ['7', '', '']], [0.7, 3, 2.6], { h: 480 }),
      p('Bei 7 klingt es am besten. Warum ist das **kein** gutes Zeichen?', { size: 20, before: 40 }),
      ...lines(2),
    ], { cap: '1-Gramm · 6-Gramm' }),
    task('Stell die **Temperatur** (Spalte ②) auf 0,2 und auf 2,0. Was passiert mit den Balken – und mit dem Text?'),
    ...lines(2),

    ...stage('cre', 'Ihr bestimmt, was Tiny schreibt – nur über die Quellen.'),
    task('**Mission Manipulation:** Bringt Tiny dazu, „**Der Hund fliegt mit einer Rakete zum Mars.**“ zu schreiben (oder eine eigene Behauptung). Ihr dürft in 📚 **Alle Quellen** Texte bearbeiten, ausschalten und eigene schreiben – aber nicht einfach den Satz einmal hineinkopieren.'),
    ...fill(['Versuch', 'Was haben wir an den Quellen geändert?', 'Geklappt?'], [['1', '', ''], ['2', '', '']], [1, 6, 1.6], { h: 640 }),
    task('Echte Chatbots lernen aus Texten aus dem Internet. Könnte man sie genauso manipulieren? Begründet.'),
    ...lines(2),
  ];
}

/* ---------- Arbeitsblatt Phase 2 · Frage & Antwort ---------- */
function ab2() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 2', 'Phase 2 · Frage & Antwort', 'Tiny schlägt nach, bevor es schreibt', [
      ['use', 'Suche verfolgen'], ['mod', 'Fragen verändern, Fallen testen'], ['ref', 'Quellen bewerten'],
    ]),
    ...stage('use', 'Verfolge, wie aus einer Frage eine Antwort wird.'),
    img('d-p2-ablauf.png', 600, { after: 60 }),
    side('p2-frage-zerlegen.png', 2600, () => [
      task('Frag Tiny „**Was frisst ein Hund?**“ und öffne **Frage zerlegen**.'),
      ...fill(['', ''], [['Gesucht werden:', ''], ['Gestrichen werden:', ''], ['Gewählte Texte A · B · C:', '']], [2.4, 4], { h: 520 }),
      p('Warum streicht Tiny manche Wörter?', { size: 20, before: 40 }),
      ...lines(2),
    ]),
    task('Öffne **Quellen**: Jedes Wort im Handy hat jetzt die Farbe seines Textes. Was ist anders als in Phase 1?'),
    ...lines(2),

    ...stage('mod', 'Formuliere um und stell Tiny Fallen.'),
    task('Stell dieselbe Frage anders. Passt die Antwort noch?'),
    ...fill(['Frage', 'Texte A · B · C', '✓ / ✗'], [['Was frisst ein Welpe?', '', ''], ['Was mag ein Hund am liebsten essen?', '', '']], [3.6, 4.6, 1], { h: 520 }),
    side('k-p2-fallen.png', 3500, () => [
      task('Frag „**Wie hoch ist der Eiffelturm?**“ – davon steht nichts in den Texten. Woher kommen die Wörter der Antwort? Wie nennt man das?'),
      ...lines(2),
      task('Frag „**Ist Pluto ein Planet?**“ In den Texten steckt eine Falschnachricht. Wer gewinnt – und was ändert sich, wenn ihr sie ausschaltet?'),
      ...lines(2),
    ], { cap: 'Eiffelturm · Erde' }),

    ...stage('ref', 'Bewerte das Nachschlagen.'),
    task('Viele echte Chatbots suchen auch zuerst im Internet und schreiben dann. Nenne einen Vorteil und eine Gefahr.'),
    ...fill(['Vorteil', 'Gefahr'], [['', '']], [1, 1], { boldFirst: false, h: 700 }),
    ...merke('Nachschlagen macht Antworten passender und Quellen sichtbar. Aber Tiny prüft nicht, ob eine Quelle **stimmt** – und wenn nichts passt, erfindet es: **Halluzinieren**.'),
  ];
}

/* ---------- Arbeitsblatt Phase 3 · Wörter als Punkte ---------- */
function ab3() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 3', 'Phase 3 · Wörter als Punkte', 'Tiny sucht nach Bedeutung statt nach gleichen Wörtern', [
      ['use', 'Wortwolke erkunden'], ['mod', 'Sprünge verändern'], ['ref', 'Was heißt „Bedeutung“?'],
    ]),
    ...stage('use', 'Erkunde die Wortwolke.'),
    img('d-p3-wolke.png', 600, { after: 60 }),
    task('Öffne die **Wortwolke**, dreh sie und such die Wörter („Wort suchen“). Welche Nachbarn haben sie – und was haben sie gemeinsam?'),
    ...fill(['Wort', 'Nachbarn', 'Gemeinsam?'], [['Hund', '', ''], ['Mars', '', ''], ['frisst', '', '']], [1.4, 4, 4], { h: 480 }),
    side('p3-frage-punkt.png', 3000, () => [
      task('Frag „**Was frisst ein Welpe?**“ in Phase 2 und in Phase 3.'),
      ...fill(['', 'Gefundene Texte'], [['Phase 2', ''], ['Phase 3', '']], [1.4, 4], { h: 620 }),
      p('Warum findet Phase 3 „Der Hund“, obwohl dort nie „Welpe“ steht?', { size: 20, before: 40 }),
      ...lines(2),
    ]),

    ...stage('mod', 'Lass Tiny springen.'),
    side('p3-sprung.png', 2800, () => [
      task('Stell die **Sprungwahrscheinlichkeit** (Spalte Wolken-Sprung) auf 0 %, ≈ 9 % und ganz hoch. Frag jedes Mal dasselbe.'),
      ...fill(['Sprung', 'Tinys Antwort'], [['0 %', ''], ['≈ 9 %', ''], ['hoch', '']], [1, 5], { h: 560 }),
      p('Notiere einen **guten** und einen **schlechten** Sprung:', { size: 20, before: 40 }),
      ...lines(2),
    ], { cap: 'Wolken-Sprung' }),

    ...stage('ref', 'Denk über Bedeutung nach.'),
    task('„Nah in der Wolke“ heißt nicht „kommt als Nächstes“. Erkläre den Unterschied an einem Beispiel.'),
    ...lines(2),
    task('„Ein Welpe frisst Fisch“ – entstanden durch einen Sprung. Ist das auch Halluzinieren? Begründe.'),
    ...lines(2),
    ...merke('Jedes Wort wird zu einer Liste von Zahlen (**Embedding**). Wörter, die an ähnlichen Stellen stehen, bekommen ähnliche Zahlen und liegen nah.'),
  ];
}

/* ---------- Arbeitsblatt Phase 4 · Echtes Netz ---------- */
function ab4() {
  taskNo = 0;
  return [
    ...head('TINY LM · ARBEITSBLATT 4', 'Phase 4 · Echtes Netz', 'Tiny lernt – und braucht die Texte danach nicht mehr', [
      ['use', 'Training beobachten'], ['mod', 'Frage-Stärke verändern'], ['ref', 'Phasen vergleichen, Grenzen'],
    ]),
    ...stage('use', 'Beobachte, wie das Netz lernt.'),
    img('d-p4-netz.png', 560, { after: 60 }),
    task('Frag „**Was frisst ein Hund?**“ – erst **vor** dem Training, dann nach **3 Minuten** Training.'),
    ...fill(['', 'Antwort von Tiny'], [['vorher', ''], ['nachher', '']], [1.3, 7], { h: 520 }),
    task('Beobachte die **Fehlerlinie** und öffne **Das Netz von innen**. Was passiert beim Training mit den Zahlen im Netz? Wo steckt danach das Wissen?'),
    ...lines(3),
    ...stage('mod', 'Verändere die Frage-Stärke.'),
    side('k-p4-fragestaerke.png', 3200, () => [
      task('Stell die **Frage-Stärke** (Spalte Frage) auf 0, 1 und 3. Was passiert? Warum ziehen Thema und Satzbau gegeneinander?'),
      ...lines(4),
    ], { cap: 'Frage-Stärke 1× · 3×' }),

    ...stage('ref', 'Vergleiche alle vier Phasen.'),
    task('Fülle die Tabelle mit deinen Erfahrungen aus allen Phasen.'),
    ...fill(['', '1 · Zählen', '2 · Nachschlagen', '3 · Bedeutung', '4 · Netz'], [
      ['Woher kommt das nächste Wort?', '', '', '', ''],
      ['Kann Tiny die Quelle zeigen?', '', '', '', ''],
      ['Typischer Fehler', '', '', '', ''],
    ], [2.2, 2, 2, 2, 2], { h: 680 }),
    img('d-vergleich-fenster.png', 470, { after: 40 }),
    task('**Kontextfenster:** Warum wurde ein langes Fenster mit N-Grammen schwierig? Und warum braucht ein Chatbot ein großes (langes Gespräch, hochgeladenes PDF)?'),
    ...lines(3),
    task('Was fehlt Tiny zum echten Chatbot – und welche Gefahren bleiben auch bei echten Chatbots?'),
    ...fill(['Das fehlt Tiny', 'Diese Gefahren bleiben'], [['', '']], [1, 1], { boldFirst: false, h: 1000 }),
  ];
}

/* ---------- Begleitzettel: eine Seite je Phase ---------- */
function sec(title, color) {
  return [p([new TextRun({ text: title, font: FONT, size: 28, bold: true, color: color || C.violet })], { before: 0, after: 60, keepNext: true })];
}
function sub(title, color) {
  return p([new TextRun({ text: title.toUpperCase(), font: FONT, size: 17, bold: true, color: color || C.violetDark, characterSpacing: 20 })], { before: 100, after: 30, keepNext: true });
}
const b = t => new Paragraph({ children: runs(t, { size: 19 }), numbering: { reference: 'dots', level: 0 }, spacing: { after: 30 } });
function twoCol(litems, ritems) {
  const w = Math.floor(CW / 2);
  const col = (t, items, color, fillC) => cell([
    p([new TextRun({ text: t, font: FONT, size: 19, bold: true, color })], { after: 40 }),
    ...items.map(b),
  ], { w, fill: fillC, pt: 90, pb: 90, pl: 160, pr: 160, borders: { top: NONE, bottom: NONE, left: { style: BorderStyle.SINGLE, size: 30, color }, right: { style: BorderStyle.SINGLE, size: 40, color: 'FFFFFF' } } });
  return [grid([new TableRow({ children: [col('Ziele – die SuS können …', litems, C.use, C.useT), col('Grenzen des Modells', ritems, C.cand, 'FDECEA')] })], [w, CW - w]), gap(40)];
}
function phase(title, color, ziele, grenzen, stolper, impulse, erwartung, extra = []) {
  return [
    ...sec(title, color),
    ...twoCol(ziele, grenzen),
    sub('Stolpersteine und Grenzfragen an Tiny'), ...stolper.map(b),
    sub('Diskussionsimpulse'), ...impulse.map(b),
    sub('Erwartungshorizont'), ...erwartung.map(b),
    ...extra,
  ];
}

function lehrkraft() {
  return [
    ...head('TINY LM · FÜR LEHRKRÄFTE', 'Begleitzettel', 'Ziele, Grenzen, Impulse und Erwartungen je Phase'),
    ...fill(['Phase', 'Kernfrage', 'Zeit', 'Begriffe'], [
      ['1 · Frei schreiben', 'Wie schreibt eine Maschine, die nur zählt? (**Create:** Quellen manipulieren)', '2 Std.', 'Token, N-Gramm, Kontextfenster, Temperatur, Trainingsdaten'],
      ['2 · Frage & Antwort', 'Wie beantwortet ein Modell Fragen?', '1 Std.', 'Retrieval, Quelle, Halluzinieren'],
      ['3 · Wörter als Punkte', 'Wie kommt Bedeutung in Zahlen? (Prototyp)', '1 Std.', 'Embedding, Ähnlichkeit'],
      ['4 · Echtes Netz', 'Was ändert ein Netz – und was fehlt zum Chatbot?', '2 Std.', 'Training, Fehler, Gewichte, Kontextfenster'],
    ], [2, 4.6, 0.9, 3.6], { h: 360 }),
    p('**Im Raum:** Phasen einzeln teilen (Symbol neben dem Reiter). Geänderte Quellen bleiben nur auf dem jeweiligen Tablet („↺ Zurücksetzen“ in Alle Quellen). Tiny würfelt – jedes Tablet schreibt anders, das ist gewollt.', { size: 19, after: 120 }),
    ...phase('Phase 1 · Frei schreiben', C.use,
      ['erklären, dass ein Sprachmodell **Token für Token** nach Wahrscheinlichkeit wählt,', 'Kontextfenster und Temperatur in ihrer Wirkung beschreiben,', 'zeigen, dass die Ausgabe **direkt an den Trainingsdaten** hängt.'],
      ['Tiny findet nur **exakt gleiche** Wortfolgen, versteht nichts.', 'Es kann kein Wort schreiben, das in keiner Quelle steht.', 'Langes Fenster → Tiny **schreibt ab**.'],
      ['1-Gramm = Wortsalat, 7-Gramm = Kopie (Quellen-Spalte zeigt nur noch einen Text). Echte Zahlen: „frisst“ 22×, „Hund frisst“ 2×, „der Hund frisst“ 1×.', 'Textwelt **Berufe** ist absichtlich einseitig (die Chefin, die Ärztin, der Krankenpfleger).', 'Grenzfrage: „Kann Tiny ein Wort erfinden?“ – Nein. Flüssig **und** neu geht mit Zählen kaum.'],
      ['Tiny kopiert einen Satz 1:1 – **wem gehört** er?', 'Ist ein Text gut, nur weil er flüssig klingt?', 'Wer entscheidet, mit welchen Texten eine KI lernt?'],
      ['**A1:** Kandidaten = ?-Kachel, Kontextfenster = Rahmen um die letzten Wörter, Quellen = Farben.', '**A3:** Kleines N → viele Quellen, holprig; großes N → eine Quelle, kopiert (lange Folgen kommen nur einmal vor).', '**A4:** 0,2 → immer das häufigste Wort, Schleifen; 2,0 → Unsinn.', '**A5/A6:** Mehrfache gleiche Wortfolgen erhöhen die Wahrscheinlichkeit; seltene Themen kippen schnell. Übertragung: **Data Poisoning**.']),
    gap(120),
    ...phase('Phase 2 · Frage & Antwort', C.ask,
      ['den Ablauf **Suchen → Schreiben** (Retrieval) beschreiben,', 'Grenzen einer Stichwortsuche benennen,', 'erklären, wie **Halluzinationen** entstehen, und Quellen prüfen.'],
      ['Suche nur nach gleichen Wortstämmen („Welpe“ ≠ „Hund“).', 'Tiny prüft nicht, ob eine Quelle stimmt.', 'Antwort bleibt N-Gramm-Text und kann abdriften.'],
      ['Eiffelturm → Tiny antwortet trotzdem, Hinweis „Ausgedacht!“.', 'Pluto: „echter (Planet)“ 3× gegen „Zwergplanet“ 2× – **die Falschnachricht gewinnt**, weil das Thema selten ist. Bei der flachen Erde verliert sie gegen viele Texte.', 'Grenzfrage: „Was frisst ein Hund **nicht**?“ – das „nicht“ wird gestrichen.'],
      ['Warum klingt eine Halluzination so sicher wie eine richtige Antwort?', 'Sollte ein Chatbot öfter „Weiß ich nicht“ sagen?', 'Ein Chatbot nennt eine Quelle – ist die Antwort damit richtig?'],
      ['**A1:** gesucht „frisst“, „Hund“; gestrichen „was“, „ein“ – Füllwörter stehen in jedem Text.', '**A3:** „Welpe“ steht kaum in den Texten → andere Texte. Gleiche Bedeutung ≠ gleiche Wörter.', '**A4:** Wörter aus fremden Texten zusammengesetzt = Halluzinieren.', '**A6:** Vorteil: aktuell, nachprüfbar. Gefahr: falsche Quellen, Scheinsicherheit.']),
    gap(120),
    ...phase('Phase 3 · Wörter als Punkte', C.ask,
      ['erklären, dass Wörter als **Zahlenlisten (Embeddings)** dargestellt werden,', 'Nähe als ähnlichen Gebrauch deuten,', 'Bedeutungssuche und Stichwortsuche vergleichen.'],
      ['Wolke aus 90 Texten – Nähe ist oft eher **Thema** als Bedeutung.', 'Bild zeigt 3 von 20 Richtungen.', 'Der Sprung ist nachgebaut; in echten Netzen passiert er von selbst.'],
      ['„Welpe“ findet „Der Hund“, obwohl das Wort dort fehlt.', 'Sprünge wie Fleisch → Fisch erzeugen **plausible, falsche** Aussagen.', 'Grenzfrage: „Was frisst ein Planet?“ – Tiny antwortet trotzdem.'],
      ['Ist Nachbarn-Zählen schon „Verstehen“?', 'Welche Vorurteile könnten aus Internettexten in die Zahlen wandern?', 'Ist der Sprung kreativ oder gefährlich?'],
      ['**A1:** Hund – Katze, Welpe; Mars – Jupiter, Saturn: stehen in ähnlichen Sätzen.', '**A2:** Welpe liegt nah bei Hund → Text „Der Hund“ liegt nah an der Frage.', '**A4:** Nah = austauschbar an derselben Stelle, nicht Fortsetzung.', '**A5:** Ja, in der Wirkung – aber hier ist der Sprung sichtbar.']),
    gap(120),
    ...phase('Phase 4 · Echtes Netz', C.cre,
      ['Aufbau Eingang → Hidden → Ausgang und Training als **Fehlerverkleinerung** beschreiben,', 'erklären, warum das Wissen in **Gewichten** steckt und keine Quelle mehr sichtbar ist,', 'alle Phasen vergleichen und die Rolle großer **Kontextfenster** begründen.'],
      ['Rund 163.000 Zahlen statt Milliarden; **keine Attention**, nur 3–5 Wörter + Frage.', '90 Texte, Training im Browser (3–4 Min.) – Sätze bleiben holprig.', '**Kleiner Fehler ≠ gute Antwort** (Tiny sagt die Trainingstexte voraus).'],
      ['Training früh starten; ohne Training reiner Zufall.', 'Frage-Stärke 3× → „frisst frisst frisst“: Thema schlägt Grammatik.', 'Grenzfrage: Frage zu einem Thema ohne Text – das Netz kann kein „Ausgedacht!“ mehr melden.'],
      ['Warum gehen 100.000 Tokens nicht mit N-Grammen, aber mit Netzen?', 'Wissen steckt in Zahlen: Kann man einen Text wieder **löschen**?', 'Tiny: 3 Min. Tablet – große Modelle: Monate in Rechenzentren. Energie, Kosten, Macht?'],
      ['**A2:** Gewichte werden bei jedem Beispiel ein Stück verschoben; das Wissen steckt danach in den Zahlen, nicht in den Texten.', '**A3:** Frage zieht zum Thema, Kontext sorgt für Satzbau; zu stark → nur noch Thema.', '**A5:** Lange Folgen kommen in Texten nie zweimal vor → keine Auswahl/Kopie. Netz verallgemeinert über ähnliche Zahlen; ein Chatbot muss das ganze Gespräch/PDF sehen.', '**A6:** Fehlt: Datenmenge, Größe, Attention, Feinabstimmung auf Gespräche, Sicherheitsregeln. Gefahren: Halluzinieren, Vorurteile, Falschnachrichten, keine Quelle.'],
      [sub('Lösung Vergleichstabelle (A4)'),
        ...fill(['', '1 · Zählen', '2 · Nachschlagen', '3 · Bedeutung', '4 · Netz'], [
          ['Nächstes Wort', 'zählen + würfeln', '3 Texte suchen, darin zählen', 'nach Bedeutung suchen, springen', 'Netz rechnet'],
          ['Quelle zeigen?', 'ja', 'ja, A · B · C', 'ja', 'nein'],
          ['Typ. Fehler', 'Salat / Kopie', 'Halluzinieren', 'falsche Sprünge', 'holprig, keine Quelle'],
        ], [1.6, 2, 2.2, 2.2, 2], { h: 300 })]),
  ];
}

(async () => {
  await save('TinyLM_AB1_Frei_schreiben.docx', doc('Tiny LM · Arbeitsblatt 1 · Frei schreiben', ab1()));
  await save('TinyLM_AB2_Frage_und_Antwort.docx', doc('Tiny LM · Arbeitsblatt 2 · Frage & Antwort', ab2()));
  await save('TinyLM_AB3_Woerter_als_Punkte.docx', doc('Tiny LM · Arbeitsblatt 3 · Wörter als Punkte', ab3()));
  await save('TinyLM_AB4_Echtes_Netz.docx', doc('Tiny LM · Arbeitsblatt 4 · Echtes Netz', ab4()));
  await save('TinyLM_Begleitzettel_Lehrkraft.docx', doc('Tiny LM · Begleitzettel für Lehrkräfte', lehrkraft()));
})();
