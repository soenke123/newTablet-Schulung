/* Klausur „Buchladen Koreander“ (Datenbanken/SQL, Q2) als Word-Datei.
   node bauen.cjs  →  Klausur_DB_Buchladen.docx + Erwartungshorizont_DB_Buchladen.docx
   Das Klassendiagramm (diagramm.png) zeichnet diagramm.html mit dem Code von
   SQL Studio (node bild.cjs). Die SQL-Lösungen prüft pruefen.py gegen dieselben Daten. */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, ImageRun, LevelFormat, Footer, PageNumber, TabStopType, PageBreak
} = require('docx');

const DIR = __dirname;
const FONT = 'Arial', MONO = 'Consolas';
const ACC = '0887A6', HEAD = 'DCF0F5', EDGE = 'BCCDD3', ZEB = 'F2F6F7', FK = '2F6FD6', KEY = 'B57A06', MUTED = '5F706B';
const W = 9638; // Textbreite A4 mit 2 cm Rand

/* ── Daten (gleich wie pruefen.py) ─────────────────────────── */
const KUNDE = [
  ['Bastian', 'Bux', 12, 1712233445, 'Hamburg'],
  ['Mia', 'Kaya', 17, 1523456789, 'Kiel'],
  ['Jonas', 'Weber', 34, 405123456, 'Hamburg'],
  ['Anna', 'Schmidt', 68, 451234567, 'Lübeck'],
  ['Leonie', 'Park', 15, 1605551234, 'Hamburg']
];
const AUTOR = [
  [1, 'Michael Ende', 'deutsch'], [2, 'J. K. Rowling', 'britisch'], [3, 'Cornelia Funke', 'deutsch'],
  [4, 'Terry Pratchett & Neil Gaiman', 'britisch'], [5, 'Robert Galbraith', 'britisch'], [6, 'Kirsten Boie', 'deutsch']
];
const BUCH = [
  ['978-3-522-20260-1', 'Die unendliche Geschichte', 1, 'Fantasy, Jugendbuch', '22.00', 'Thienemann', 'Stuttgart', 3],
  ['978-3-522-17684-2', 'Momo', 1, 'Fantasy, Kinderbuch', '15.00', 'Thienemann', 'Stuttgart', 5],
  ['978-3-551-55167-3', 'Harry Potter und der Stein der Weisen', 2, 'Fantasy, Jugendbuch', '20.00', 'Carlsen', 'Hamburg', 4],
  ['978-3-551-55168-4', 'Harry Potter und die Kammer des Schreckens', 2, 'Fantasy', '20.00', 'Carlsen', 'Hamburg', 2],
  ['978-3-7915-0465-5', 'Tintenherz', 3, 'Fantasy, Jugendbuch', '24.00', 'Dressler', 'Hamburg', 1],
  ['978-3-453-43123-6', 'Ein gutes Omen', 4, 'Fantasy, Humor', '12.00', 'Heyne', 'München', 2],
  ['978-3-7645-0567-7', 'Der Ruf des Kuckucks', 5, 'Krimi', '14.00', 'Blanvalet', 'München', 1],
  ['978-3-7891-0812-8', 'Sommerby', 6, 'Kinderbuch', '15.00', 'Oetinger', 'Hamburg', 3]
];
const KAUF = [
  [1, 'Bastian', 'Bux', '978-3-522-20260-1', '2026-03-02'],
  [2, 'Bastian', 'Bux', '978-3-7915-0465-5', '2026-03-02'],
  [3, 'Mia', 'Kaya', '978-3-551-55167-3', '2026-04-11'],
  [4, 'Anna', 'Schmidt', '978-3-522-20260-1', '2026-05-20'],
  [5, 'Mia', 'Kaya', '978-3-453-43123-6', '2026-06-01'],
  [6, 'Jonas', 'Weber', '978-3-7645-0567-7', '2026-06-01'],
  [7, 'Leonie', 'Park', '978-3-551-55168-4', '2026-07-15'],
  [8, 'Bastian', 'Bux', '978-3-522-17684-2', '2026-09-03']
];

/* ── Bausteine ─────────────────────────────────────────────── */
const r = (text, o = {}) => new TextRun({ text, font: o.mono ? MONO : FONT, ...o });
const p = (runs, o = {}) => new Paragraph({ children: [].concat(runs).map(x => typeof x === 'string' ? r(x) : x), spacing: { after: 100, line: 276 }, ...o });
const gap = (n = 120) => new Paragraph({ children: [], spacing: { after: n } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function h1(text, pts) {
  return new Paragraph({
    keepNext: true, spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } },
    children: [r(text, { bold: true, size: 26, color: '0C1F27' }), ...(pts ? [r('   ' + pts, { size: 20, color: MUTED })] : [])]
  });
}
const h2 = text => new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, children: [r(text, { bold: true, size: 22, color: ACC })] });

/* Kasten mit farbigem Rand links (Situation, Brief, Hinweise) */
function box(paras, { fill = 'EEF6F8', color = ACC, italic = false } = {}) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: EDGE };
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      margins: { top: 140, bottom: 80, left: 220, right: 220 },
      borders: { top: b, bottom: b, right: b, left: { style: BorderStyle.SINGLE, size: 24, color } },
      children: paras.map(x => typeof x === 'string' ? p(r(x, { italics: italic })) : x)
    })] })]
  });
}

/* SQL-Code im Look des SQL-Studio-Editors */
function code(lines) {
  return lines.map((l, i) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F2F6F7', color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACC, space: 8 } },
    indent: { left: 400 },
    spacing: { after: i === lines.length - 1 ? 140 : 0, line: 260 },
    keepNext: i < lines.length - 1,
    children: [r(l || ' ', { mono: true, size: 19 })]
  }));
}

/* Datentabelle wie in SQL Studio: Kopf mit Tabellenname, Spaltenzeile, Zebra */
function dataTable(name, cols, rows, widths, fs = 18) {
  const total = widths.reduce((a, b) => a + b, 0);
  const b = { style: BorderStyle.SINGLE, size: 4, color: EDGE };
  const borders = { top: b, bottom: b, left: b, right: b };
  const cell = (children, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders, margins: { top: 45, bottom: 45, left: 70, right: 70 }, children, ...o });
  const head = new TableRow({ cantSplit: true, children: [cell([new Paragraph({ children: [r(name, { bold: true, size: 21 })] })], total,
    { columnSpan: cols.length, shading: { type: ShadingType.CLEAR, fill: HEAD, color: 'auto' } })] });
  const colRow = new TableRow({ cantSplit: true, children: cols.map((c, i) => cell([new Paragraph({ children: [
    r(c.n, { bold: true, size: fs, underline: c.pk ? {} : undefined, color: c.fk ? FK : '0C1F27' }),
    ...(c.fk ? [r(' ↑', { bold: true, size: fs, color: FK })] : [])
  ] })], widths[i], { shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' } })) });
  const body = rows.map((row, ri) => new TableRow({ cantSplit: true, children: row.map((v, i) => cell([new Paragraph({
    alignment: cols[i].num ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [r(String(v), { size: fs, font: cols[i].mono ? MONO : FONT })]
  })], widths[i], { shading: { type: ShadingType.CLEAR, fill: ri % 2 ? ZEB : 'FFFFFF', color: 'auto' } })) }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [head, colRow, ...body] });
}

/* Nummerierung a) b) c) mit i. ii. darunter — je Aufgabe eine eigene Liste */
const LISTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'e1', 'e2', 'e3', 'e4', 'e5'];
const numbering = {
  config: [
    ...LISTS.map(ref => ({ reference: ref, levels: [
      { level: 0, format: LevelFormat.LOWER_LETTER, text: '%1)', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 400 } }, run: { bold: true } } },
      { level: 1, format: LevelFormat.LOWER_ROMAN, text: '%2.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 400 } } } }
    ] })),
    { reference: 'dot', levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } }
    ] }
  ]
};
const item = (ref, runs, level = 0, o = {}) => p(runs, { numbering: { reference: ref, level }, spacing: { after: 90, line: 276 }, ...o });
const dot = (runs, level = 0) => item('dot', runs, level, { spacing: { after: 50, line: 264 } });
const attrs = s => r('(' + s + ')', { italics: true, color: MUTED });
const b = s => r(s, { bold: true });
const m = s => r(s, { mono: true, size: 20 });

function footer(label) {
  return new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: W }],
    children: [r(label, { size: 16, color: MUTED }), r('\tSeite ', { size: 16, color: MUTED }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: FONT }),
      r(' von ', { size: 16, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED, font: FONT })]
  })] });
}

function kopf(titel) {
  const nb = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const bd = { top: nb, left: nb, right: nb, bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC } };
  const c = (txt, w, right) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: bd, margins: { top: 60, bottom: 60 },
    children: [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [r(txt, { size: 20 })] })] });
  return [
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows: [
      new TableRow({ children: [c('Q2 Informatik', W / 2), c('Datum: ____________________', W / 2, true)] }),
      new TableRow({ children: [c('Name: ________________________________', W / 2), c('Thema: Datenbanken und SQL', W / 2, true)] })
    ] }),
    new Paragraph({ spacing: { before: 280, after: 160 }, alignment: AlignmentType.CENTER, children: [r(titel, { bold: true, size: 34 })] })
  ];
}

const diagramm = () => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new ImageRun({
  type: 'png', data: fs.readFileSync(path.join(DIR, 'diagramm.png')),
  transformation: { width: 640, height: 362 }
})] });
const legende = () => p([r('Primärschlüssel: ', { size: 18, color: MUTED }), r('Schlüssel, unterstrichen', { size: 18, bold: true, color: KEY }),
  r('   ·   Fremdschlüssel: ', { size: 18, color: MUTED }), r('Kette und ↑', { size: 18, bold: true, color: FK }),
  r('   ·   Linie mit 1 und n: eine Zeile dort, viele Zeilen hier (1 : n)', { size: 18, color: MUTED })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } });

/* ═════════════════════════════════════════════════════════════
   KLAUSUR
   ═════════════════════════════════════════════════════════════ */
const klausur = [
  ...kopf('Klausur Nr. 2 – Der Buchladen von Herrn Koreander'),

  box([
    p([b('Ausgangssituation. '), r('Herr Koreander führt seit vielen Jahren einen kleinen Buchladen in Hamburg. Bisher hat er alles von Hand in ein dickes Kassenbuch geschrieben. Nachdem ihm seine Nichte von ihrem Informatikunterricht erzählt hat, hat er die Datenbank für seinen Laden kurzerhand '), b('selbst gebaut'), r(' (Material M2 und M3).')]),
    p('Die Datenbank funktioniert: Herr Koreander kann damit schon viele Fragen zu seinem Laden beantworten. Ein paar Dinge hat er beim Entwurf aber nicht zu Ende gedacht. Nun bittet er Sie um Hilfe (Brief M1).')
  ]),
  gap(160),

  h1('Material M1 – Brief von Herrn Koreander'),
  box([
    p(r('Liebe Datenbank-Expertinnen und -Experten,', { italics: true })),
    p(r('meine Datenbank läuft! Endlich sehe ich auf einen Blick, wer bei mir welches Buch gekauft hat. Ein paar Dinge wundern mich allerdings.', { italics: true })),
    p(r('Letzte Woche wollte ich eine neue Stammkundin eintragen: Anna Schmidt aus Kiel. Das Programm hat sich geweigert, weil es angeblich schon eine Anna Schmidt gibt. Die gibt es auch – aber das ist doch eine ganz andere Frau aus Lübeck!', { italics: true })),
    p(r('Außerdem habe ich zwei Wünsche. Erstens möchte ich die Bücher von J. K. Rowling nicht mehr verkaufen, weil ich ihre öffentlichen Äußerungen nicht mit den Werten meines Ladens vereinbaren kann. Zweitens überlege ich, ein System einzubauen, das mir zeigt, wo sich meine Kundschaft im Laden aufhält. Können Sie mir helfen?', { italics: true })),
    p(r('Herzliche Grüße', { italics: true })),
    p(r('K. Koreander', { italics: true, bold: true }))
  ], { fill: 'FFFBF0', color: 'D4920F' }),

  gap(160),
  h1('Material M2 – Klassendiagramm (so hat Herr Koreander die Datenbank angelegt)'),
  diagramm(),
  legende(),

  pageBreak(),
  h1('Material M3 – Beispieldaten'),
  dataTable('Kunde', [{ n: 'Vorname', pk: 1 }, { n: 'Nachname', pk: 1 }, { n: 'Alter', num: 1 }, { n: 'Telefon', num: 1, mono: 1 }, { n: 'Wohnort' }],
    KUNDE, [1900, 1900, 1100, 2000, 2000]),
  gap(),
  dataTable('Autor', [{ n: 'Id', pk: 1, num: 1 }, { n: 'Name' }, { n: 'Nationalitaet' }], AUTOR, [800, 3900, 2000]),
  gap(),
  dataTable('Buch', [{ n: 'ISBN', pk: 1, mono: 1 }, { n: 'Titel' }, { n: 'Autor_Id', fk: 1, num: 1 }, { n: 'Genre' }, { n: 'Preis', num: 1 },
    { n: 'Verlag' }, { n: 'Verlagsort' }, { n: 'Bestand', num: 1 }],
    BUCH, [1850, 1900, 980, 1250, 650, 1100, 1050, 850], 16),
  gap(),
  dataTable('Kauf', [{ n: 'Nr', pk: 1, num: 1 }, { n: 'Vorname', fk: 1 }, { n: 'Nachname', fk: 1 }, { n: 'ISBN', fk: 1, mono: 1 }, { n: 'Datum', mono: 1 }],
    KAUF, [700, 1600, 1600, 2200, 1500]),

  pageBreak(),

  h1('Aufgabe 1 – Grundlagen', '(ca. 3 + 4 + 3 Pkt.)'),
  item('a1', [r('Erklären Sie, was ein '), b('Fremdschlüssel'), r(' ist und welche Aufgabe er in einer relationalen Datenbank erfüllt. Verdeutlichen Sie Ihre Erklärung an einem Fremdschlüssel aus Herrn Koreanders Datenbank.')]),
  item('a1', [r('Zwischen zwei Tabellen der Datenbank besteht eine '), b('n:m-Beziehung'), r('. Benennen Sie die beiden Tabellen und belegen Sie die Beziehung mit konkreten Datensätzen aus M3. Erklären Sie, wie die n:m-Beziehung in der Datenbank umgesetzt ist.')]),
  item('a1', [r('Die Tabellen '), b('Kunde'), r(', '), b('Buch'), r(' und '), b('Kauf'), r(' haben unterschiedliche Arten von Primärschlüsseln. Benennen und erläutern Sie diese.')]),

  h1('Aufgabe 2 – Herrn Koreanders Datenbank unter der Lupe', '(ca. 9 + 2 + 4 Pkt.)'),
  item('a2', [r('Herr Koreander hat beim Entwurf mehrere Fehler gemacht. Einer davon zeigt sich bereits in seinem Brief (M1). Erläutern Sie '), b('drei'), r(' Schwachstellen der Datenbank und geben Sie jeweils einen Verbesserungsvorschlag an.')]),
  item('a2', [r('Das Buch „Ein gutes Omen“ haben Terry Pratchett und Neil Gaiman gemeinsam geschrieben.')]),
  item('a2', [r('Erläutern Sie, warum Herr Koreander beide Namen in '), b('einen'), r(' Datensatz der Tabelle Autor geschrieben hat, und welches Problem dadurch entsteht.')], 1),
  item('a2', [r('Ändern Sie das Klassendiagramm so, dass ein Buch mehrere Autorinnen und Autoren haben kann. Ergänzen Sie passende Beispieldaten für „Ein gutes Omen“. (Zeichnen Sie die Tabellen und nutzen Sie '), b('keine'), r(' SQL-Befehle.)')], 1),

  h1('Aufgabe 3 – SQL', '(ca. 1 + 3 + 3 + 4 + 4 Pkt.)'),
  p('Erstellen Sie SQL-Befehle, welche die beschriebenen Tabellen ausgeben. Die Tabellen sollen genau die angegebenen Attribute enthalten. Verwenden Sie die Datenbank so, wie Herr Koreander sie angelegt hat (M2).'),
  item('a3', [r('Alle Bücher, die weniger als 20 € kosten. '), attrs('Titel, Preis')]),
  item('a3', [r('Alle Fantasy-Bücher – auch die, die zusätzlich zu einem weiteren Genre gehören –, das teuerste zuerst. '), attrs('Titel, Genre, Preis')]),
  item('a3', [r('Eine Tabelle, aus der hervorgeht, wie viele Bücher jede Autorin und jeder Autor im Sortiment hat. '), attrs('Name, Anzahl_Buecher')]),
  item('a3', [r('Alle Kundinnen und Kunden, die ein Buch von Michael Ende gekauft haben. '), attrs('Vorname, Nachname, Titel')]),
  item('a3', [r('Wie viel Geld jede Kundin und jeder Kunde bisher im Laden ausgegeben hat, nach Betrag absteigend sortiert. '), attrs('Vorname, Nachname, Umsatz')]),

  h1('Aufgabe 4 – Datenbank verändern', '(ca. 3 + 2 + 3 + 2 + 3 Pkt.)'),
  item('a4', [r('Herr Koreander möchte J. K. Rowling aus seinem Sortiment nehmen (M1): Alle ihre Bücher und die Autorin selbst sollen aus der Datenbank gelöscht werden. Er hat die Fremdschlüssel '), b('ohne'), r(' '), m('ON DELETE CASCADE'), r(' angelegt.')]),
  item('a4', 'Geben Sie die nötigen SQL-Befehle an. Begründen Sie die Reihenfolge der Befehle.', 1),
  item('a4', 'Beurteilen Sie, ob Herrn Koreanders Ziel damit vollständig erreicht ist und welche Daten dabei verloren gehen.', 1),
  item('a4', 'Zum Jahreswechsel führt Herr Koreander jedes Jahr folgenden Befehl aus:', 0, { keepNext: true }),
  ...code(['UPDATE Kunde SET Alter = Alter + 1;']),
  p('Beschreiben Sie, was der Befehl bewirkt, und beurteilen Sie, ob die Daten danach korrekt sind.', { indent: { left: 400 } }),
  item('a4', 'Wegen gestiegener Papierpreise erhöht der Carlsen-Verlag seine Preise um 10 %.'),
  item('a4', 'Formulieren Sie einen SQL-Befehl, der die Preise aller Carlsen-Bücher in der Datenbank um 10 % erhöht.', 1),
  item('a4', 'Nach dem Update führt Herr Koreander Ihre Abfrage aus Aufgabe 3 e) erneut aus und wundert sich: Laut Datenbank hat Mia Kaya plötzlich mehr Geld in seinem Laden ausgegeben als vorher. Erklären Sie dieses Ergebnis und schlagen Sie eine Änderung der Datenbank vor, die das Problem behebt.', 1),

  h1('Aufgabe 5 – Kundschaft im Blick', '(ca. 3 + 3 + 6 Pkt.)'),
  box([p('Herr Koreander lässt an jedem Regal einen kleinen Bluetooth-Sender (Beacon) anbringen. Seine neue Kundenkarten-App „Koreander Plus“ erkennt auf dem Handy den nächsten Sender und meldet alle 10 Sekunden, vor welchem Regal die Person gerade steht. Wer die App nutzt, bekommt 5 % Rabatt auf jeden Einkauf.')]),
  gap(100),
  item('a5', 'Ergänzen Sie das Klassendiagramm um eine oder mehrere Tabellen, in denen diese Positionsdaten gespeichert werden können. Geben Sie Datentypen sowie Primär- und Fremdschlüssel an.'),
  item('a5', 'Nennen Sie drei Möglichkeiten, wie Herr Koreander die gespeicherten Daten für seinen Laden nutzen kann.'),
  item('a5', [r('Im Unterricht haben Sie in '), b('YourSozialNet'), r(' ein eigenes soziales Netzwerk betrieben. Dort wurde in den Tabellen '), m('sessions'), r(' und '), m('views'), r(' im Hintergrund mitgespeichert, wer das Netzwerk wann besucht und welches Foto wie lange angesehen hat. Vergleichen Sie Herrn Koreanders System mit dem Tracking in YourSozialNet und beurteilen Sie es kritisch. Gehen Sie dabei auch darauf ein, welche Informationen entstehen, wenn die Positionsdaten mit den Tabellen Kunde und Kauf verknüpft werden.')]),

  gap(300),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [r('Viel Erfolg!', { bold: true, size: 26 })] })
];

/* ═════════════════════════════════════════════════════════════
   ERWARTUNGSHORIZONT
   ═════════════════════════════════════════════════════════════ */
const pk = s => r(' [' + s + ']', { bold: true, color: ACC });
const eh = [
  ...kopf('Erwartungshorizont – Klausur Nr. 2 „Buchladen Koreander“'),
  box([p([b('Hinweis. '), r('Gesamt ca. 64 Punkte. Die Datenbank enthält absichtlich mehr Schwachstellen, als in Aufgabe 2 a) verlangt sind; jede sachlich richtige ist zu werten. Die SQL-Lösungen sind gegen die Beispieldaten aus M3 geprüft (pruefen.py). Andere korrekte Schreibweisen (z. B. Aliase, ältere Join-Schreibweise mit WHERE) sind gleichwertig.')])]),

  h1('Aufgabe 1 – Grundlagen (AFB I)', '10 Pkt.'),
  item('e1', [b('Fremdschlüssel'), pk('3')]),
  dot('Attribut (oder Attributkombination) einer Tabelle, das auf den Primärschlüssel einer anderen (oder derselben) Tabelle verweist.'),
  dot('Aufgabe: stellt die Beziehung zwischen Tabellen her, ohne Daten doppelt zu speichern; sorgt für referenzielle Integrität (es darf nur auf existierende Datensätze verwiesen werden).'),
  dot('Beispiel: Buch.Autor_Id ↑ verweist auf Autor.Id – „Momo“ hat Autor_Id 1 → Michael Ende. Ebenso Kauf.ISBN → Buch.ISBN oder Kauf.(Vorname, Nachname) → Kunde.'),
  item('e1', [b('n:m-Beziehung Kunde – Buch'), pk('4')]),
  dot('Eine Person kann viele Bücher kaufen: Bastian Bux kauft „Die unendliche Geschichte“, „Tintenherz“ und „Momo“ (Kauf 1, 2, 8).'),
  dot('Ein Buch kann von vielen Personen gekauft werden: „Die unendliche Geschichte“ kaufen Bastian Bux und Anna Schmidt (Kauf 1, 4).'),
  dot('Umsetzung über die Zwischentabelle (Verknüpfungstabelle) Kauf: sie enthält Fremdschlüssel auf beide Tabellen (Vorname/Nachname ↑ und ISBN ↑) und löst die n:m-Beziehung in zwei 1:n-Beziehungen auf. Zusätzlich speichert sie Angaben zur Beziehung selbst (Datum).'),
  item('e1', [b('Arten von Primärschlüsseln'), pk('3')]),
  dot('Kauf.Nr: künstlicher Schlüssel (Surrogatschlüssel), eine fortlaufende Nummer ohne eigene Bedeutung.'),
  dot('Buch.ISBN: natürlicher Schlüssel – ein Merkmal, das das Buch ohnehin hat und das weltweit eindeutig ist.'),
  dot('Kunde (Vorname, Nachname): zusammengesetzter Schlüssel aus mehreren Attributen (hier zusätzlich natürlich).'),

  h1('Aufgabe 2 – Schwachstellen (AFB II/III)', '15 Pkt.'),
  item('e2', [b('Drei Schwachstellen mit Verbesserung'), r(' – je 1 Pkt. Benennen, 1 Pkt. Erläutern, 1 Pkt. Verbesserung'), pk('9')]),
  dot([b('Primärschlüssel Vorname + Nachname'), r(' ist nicht eindeutig: zwei Anna Schmidt können nicht gespeichert werden (Brief M1). Außerdem muss Kauf beide Namen als Fremdschlüssel wiederholen; heiratet jemand, müssen alle Käufe mitgeändert werden. → künstlicher Schlüssel Kunde.Id INT, in Kauf Kunde_Id ↑.')]),
  dot([b('Alter wird direkt gespeichert'), r(': stimmt nach einem Geburtstag nicht mehr, muss ständig gepflegt werden. → Geburtsdatum DATE speichern, Alter bei Bedarf berechnen.')]),
  dot([b('Telefon als INT'), r(': die führende 0 geht verloren (01712233445 → 1712233445), +49, Leerzeichen oder Bindestriche sind nicht möglich, lange Nummern sprengen den Wertebereich. Mit Telefonnummern wird nicht gerechnet. → VARCHAR(20).')]),
  dot([b('Genre enthält mehrere Werte'), r(' („Fantasy, Jugendbuch“): nicht atomar (1. Normalform verletzt), Suchen nur mit LIKE, Tippfehler erzeugen neue Genres. → Tabelle Genre(Id, Bezeichnung) und Zwischentabelle Buch_Genre(ISBN ↑, Genre_Id ↑).')]),
  dot([b('Verlag und Verlagsort stehen in Buch'), r(': redundant (Carlsen, Hamburg mehrfach); Umzug des Verlags = mehrere Zeilen ändern, Gefahr widersprüchlicher Daten (Änderungsanomalie). → Tabelle Verlag(Id, Name, Ort), Buch.Verlag_Id ↑.')]),
  dot([b('Nur ein Autor je Buch'), r(' (Buch.Autor_Id, 1:n) – siehe b).')]),
  dot([b('Kauf speichert keinen Preis'), r(': alte Käufe ändern bei einer Preisänderung rückwirkend ihren Wert – siehe 4 c).')]),
  dot([b('Zusatz'), r(': „Alter“ ist ein SQL-Schlüsselwort (ALTER) und muss in manchen Systemen in Anführungszeichen/Backticks stehen; ein Kauf mit mehreren Exemplaren desselben Buchs ist nicht vorgesehen (keine Anzahl).')]),
  item('e2', [b('Ein gutes Omen'), pk('2 + 4')]),
  dot('i. Buch hat nur ein Attribut Autor_Id, also kann ein Buch nur auf einen einzigen Autor verweisen (1:n). Um beide zu nennen, hat Herr Koreander eine „Fantasie-Person“ angelegt. Problem: Pratchett und Gaiman existieren nicht als eigene Personen. Eine Abfrage nach allen Büchern von Neil Gaiman findet „Ein gutes Omen“ nicht (bzw. nur mit LIKE), Daten zur Person (Nationalität) lassen sich nicht einzeln speichern, Bücher, die einer allein geschrieben hat, hängen an einem anderen Datensatz.', 0),
  dot('ii. Neue Zwischentabelle Buch_Autor mit ISBN ↑ und Autor_Id ↑ (zusammengesetzter Primärschlüssel aus beiden); Buch.Autor_Id entfällt. Beziehungen: Buch 1 – n Buch_Autor n – 1 Autor.', 0),
  dot('Beispieldaten: Autor (4, Terry Pratchett, britisch), (7, Neil Gaiman, britisch); Buch_Autor (978-3-453-43123-6, 4), (978-3-453-43123-6, 7).', 0),

  h1('Aufgabe 3 – SQL (AFB II)', '15 Pkt.'),
  item('e3', [b('Bücher unter 20 €'), pk('1')]),
  ...code(['SELECT Titel, Preis', 'FROM Buch', 'WHERE Preis < 20;']),
  p(r('Ergebnis: Momo, Ein gutes Omen, Der Ruf des Kuckucks, Sommerby.', { size: 19, color: MUTED }), { indent: { left: 400 } }),
  item('e3', [b('Fantasy-Bücher, teuerstes zuerst'), pk('3'), r(' – LIKE mit % (1), Sortierung DESC (1), Rest (1). Wer nur Genre = \'Fantasy\' schreibt, findet nur „Kammer des Schreckens“ (max. 1 Pkt.).')]),
  ...code(['SELECT Titel, Genre, Preis', 'FROM Buch', "WHERE Genre LIKE '%Fantasy%'", 'ORDER BY Preis DESC;']),
  p(r('Ergebnis: 6 Bücher, Tintenherz (24,00) zuerst, Ein gutes Omen (12,00) zuletzt.', { size: 19, color: MUTED }), { indent: { left: 400 } }),
  item('e3', [b('Anzahl Bücher je Autor'), pk('3'), r(' – JOIN (1), COUNT mit Alias (1), GROUP BY (1).')]),
  ...code(['SELECT Autor.Name, COUNT(*) AS Anzahl_Buecher', 'FROM Autor', 'JOIN Buch ON Buch.Autor_Id = Autor.Id', 'GROUP BY Autor.Name;']),
  item('e3', [b('Käufe von Büchern von Michael Ende'), pk('4'), r(' – zwei Joins über drei Tabellen (2), Bedingung (1), Attribute (1). Die Tabelle Kunde wird nicht gebraucht, da Vor- und Nachname in Kauf stehen; ein zusätzlicher Join mit Kunde ist ebenfalls richtig.')]),
  ...code(['SELECT Kauf.Vorname, Kauf.Nachname, Buch.Titel', 'FROM Kauf', 'JOIN Buch  ON Kauf.ISBN = Buch.ISBN', 'JOIN Autor ON Buch.Autor_Id = Autor.Id', "WHERE Autor.Name = 'Michael Ende';"]),
  p(r('Ergebnis: Bastian Bux – Die unendliche Geschichte; Anna Schmidt – Die unendliche Geschichte; Bastian Bux – Momo.', { size: 19, color: MUTED }), { indent: { left: 400 } }),
  item('e3', [b('Umsatz je Person'), pk('4'), r(' – Join über den zusammengesetzten Schlüssel mit AND (1), SUM (1), GROUP BY über beide Namen (1), ORDER BY … DESC (1).')]),
  ...code(['SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz', 'FROM Kunde', 'JOIN Kauf ON Kauf.Vorname = Kunde.Vorname', '          AND Kauf.Nachname = Kunde.Nachname', 'JOIN Buch ON Buch.ISBN = Kauf.ISBN', 'GROUP BY Kunde.Vorname, Kunde.Nachname', 'ORDER BY Umsatz DESC;']),
  p(r('Ergebnis: Bastian Bux 61,00 · Mia Kaya 32,00 · Anna Schmidt 22,00 · Leonie Park 20,00 · Jonas Weber 14,00. Auch hier reicht Kauf + Buch ohne Kunde.', { size: 19, color: MUTED }), { indent: { left: 400 } }),

  h1('Aufgabe 4 – Datenbank verändern (AFB II/III)', '13 Pkt.'),
  item('e4', [b('J. K. Rowling löschen')]),
  item('e4', [r('Befehle'), pk('3')], 1),
  ...code(["DELETE FROM Kauf  WHERE ISBN IN (SELECT ISBN FROM Buch WHERE Autor_Id = 2);", 'DELETE FROM Buch  WHERE Autor_Id = 2;', 'DELETE FROM Autor WHERE Id = 2;']),
  dot('Reihenfolge: Ohne ON DELETE CASCADE verhindert die referenzielle Integrität, dass ein Datensatz gelöscht wird, auf den noch ein Fremdschlüssel zeigt. Kauf 3 und 7 verweisen auf die Harry-Potter-Bücher, die Bücher verweisen auf Autor 2 – also von „unten“ nach „oben“: erst Kauf, dann Buch, dann Autor. Statt die Id 2 zu nennen, ist auch eine Unterabfrage über den Namen richtig.'),
  item('e4', [r('Beurteilung'), pk('2')], 1),
  dot('Verloren gehen die Käufe von Mia Kaya und Leonie Park: Umsätze, Kaufhistorie und Statistik stimmen nicht mehr (Aufgabe 3 e liefert für Mia nur noch 12,00). Für Buchhaltung/Steuer sind Verkäufe aufzubewahren. Besser: Bücher nicht löschen, sondern ein Attribut im_Sortiment BOOLEAN auf FALSE setzen (bzw. Bestand 0).'),
  dot([b('Nicht vollständig erreicht: '), r('„Robert Galbraith“ ist ein Pseudonym von J. K. Rowling. „Der Ruf des Kuckucks“ bleibt im Sortiment. Die Datenbank kann das nicht erkennen, weil sie Pseudonyme nicht abbildet (Zusatzpunkt; Fachwissen nicht vorausgesetzt).')]),
  item('e4', [b('UPDATE Alter'), pk('3')]),
  dot('Der Befehl erhöht bei allen Kundinnen und Kunden das Alter um 1.'),
  dot('Nicht korrekt: Kaum jemand hat am 1. Januar Geburtstag – das Alter stimmt den größten Teil des Jahres nicht. Wird der Befehl vergessen oder zweimal ausgeführt, sind alle Werte falsch, ohne dass man es merkt. Neue Kundschaft, die im Dezember eingetragen wurde, wird nach wenigen Tagen älter. Lösung: Geburtsdatum speichern (siehe 2 a).'),
  item('e4', [b('Preiserhöhung Carlsen')]),
  item('e4', [r('SQL'), pk('2')], 1),
  ...code(['UPDATE Buch', 'SET Preis = Preis * 1.1', "WHERE Verlag = 'Carlsen';"]),
  item('e4', [r('Erklärung und Verbesserung'), pk('3')], 1),
  dot('Kauf speichert keinen Preis. Der Umsatz wird über Buch.Preis berechnet, also mit dem heutigen Preis. Mia hat „Harry Potter und der Stein der Weisen“ für 20,00 € gekauft, nach dem Update rechnet die Abfrage mit 22,00 € → 34,00 € statt 32,00 €. Vergangene Käufe ändern rückwirkend ihren Wert.'),
  dot('Verbesserung: Attribut Preis DECIMAL(5,2) in Kauf (Verkaufspreis zum Zeitpunkt des Kaufs). Das ist keine schädliche Redundanz, da es ein anderer Wert ist (historischer Preis, ggf. mit Rabatt).'),

  h1('Aufgabe 5 – Kundschaft im Blick (AFB II/I/III)', '12 Pkt.'),
  item('e5', [b('Tabellen für Positionsdaten'), pk('3')]),
  dot('Regal(Id INT PK, Bezeichnung VARCHAR(40), Beacon VARCHAR(20)) und Aufenthalt(Id INT PK, Vorname ↑, Nachname ↑ bzw. Kunde_Id ↑, Regal_Id ↑, Zeitpunkt DATETIME). Alternativ statt jeder Meldung: Beginn/Ende oder Dauer INT in Sekunden.'),
  dot('Beziehungen: Kunde 1 – n Aufenthalt n – 1 Regal (also wieder eine n:m-Beziehung über eine Zwischentabelle). Eine Tabelle Position(x, y) ohne Regal-Tabelle ist ebenfalls zu werten.'),
  item('e5', [b('Nutzen'), r(' – je 1 Pkt., drei verlangt'), pk('3')]),
  dot('Beliebte Regale und Laufwege erkennen → Bestseller/Neuheiten dorthin stellen, Ladenlayout verbessern.'),
  dot('Stoßzeiten erkennen → Personal planen.'),
  dot('Verweildauer ohne Kauf → Interesse erkennen, Sortiment anpassen; Erfolg von Aktionen/Schaufenstern messen.'),
  dot('Personalisierte Angebote in der App („Sie haben sich lange die Krimis angesehen …“).'),
  item('e5', [b('Vergleich und kritische Beurteilung'), r(' – Vergleich 2, Verknüpfung 2, begründetes Urteil 2'), pk('6')]),
  dot([b('Gemeinsamkeiten: '), r('Aufenthalt entspricht views (Was wurde wie lange angesehen? Regal ↔ Foto, Verweildauer), der Ladenbesuch entspricht sessions (wann, wie lange, mit welchem Gerät). Beides läuft still im Hintergrund, die Person merkt beim Benutzen nichts davon. Wie bei der Werbung in YourSozialNet können die Daten für gezielte Angebote genutzt werden.')]),
  dot([b('Unterschiede: '), r('In Koreanders Laden entsteht ein Bewegungsprofil in der echten Welt. Der Rabatt ist ein Anreiz, die Daten herzugeben („Daten gegen Rabatt“), die Freiwilligkeit ist dadurch fraglich. YourSozialNet war ein Unterrichtsnetz mit späterer Aufdeckung, Koreanders System ist ernst gemeint.')]),
  dot([b('Verknüpfung mit Kunde und Kauf: '), r('Aus „wer stand wo, wie lange“ + Name, Wohnort, Telefon, Alter + Käufe wird ein Personenprofil: Interessen, Kaufkraft, Gewohnheiten (wann im Laden), was jemand angesehen, aber nicht gekauft hat. Aus Regalen wie Gesundheit, Religion oder Ratgeber („Schwangerschaft“, „Trauer“) lassen sich sehr sensible Dinge ableiten (besondere Kategorien nach Art. 9 DSGVO).')]),
  dot([b('Datenschutz: '), r('Einwilligung muss informiert und freiwillig sein; Bastian (12), Leonie (15) und Mia (17) sind minderjährig – unter 16 braucht es nach Art. 8 DSGVO die Zustimmung der Eltern. Zweckbindung, Datensparsamkeit (für das Ladenlayout reichen anonyme Zählungen ohne Kundenbezug), Löschfristen, Auskunftsrecht.')]),
  dot('Urteil: begründet, z. B. „Nutzen für den Laden ja, aber nur anonym/aggregiert und freiwillig ohne Rabattdruck“ oder „Verzicht, da das Vertrauen der Stammkundschaft wichtiger ist“. Bewertet wird die Begründung, nicht die Position.')
];

/* ── Ausgabe ───────────────────────────────────────────────── */
function doc(children, label) {
  return new Document({
    creator: 'MPS Informatik', title: label,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } },
      footers: { default: footer(label) },
      children
    }]
  });
}

(async () => {
  for (const [kids, label, file] of [
    [klausur, 'Q2 Informatik · Klausur Nr. 2 · Datenbanken und SQL', 'Klausur_DB_Buchladen.docx'],
    [eh, 'Erwartungshorizont · Klausur Nr. 2 · Datenbanken und SQL', 'Erwartungshorizont_DB_Buchladen.docx']
  ]) {
    fs.writeFileSync(path.join(DIR, file), await Packer.toBuffer(doc(kids, label)));
    console.log('geschrieben:', file);
  }
})();
