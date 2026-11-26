/* Klausur „Buchladen Koreander“ (Datenbanken/SQL, Q1) als Word-Datei.
   node bauen.cjs  →  Klausur_DB_Buchladen.docx + Erwartungshorizont_DB_Buchladen.docx
   Daten: daten.json (auch für pruefen.py, das die SQL-Lösungen nachrechnet).
   Klassendiagramme: diagramm-haupt.png / diagramm-tracking.png aus diagramm.html
   mit dem Zeichencode von SQL Studio (node bild.cjs). */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  BorderStyle, AlignmentType, ImageRun, LevelFormat, Footer, PageNumber, TabStopType, PageBreak, TableLayoutType
} = require('docx');

const DIR = __dirname;
const D = JSON.parse(fs.readFileSync(path.join(DIR, 'daten.json'), 'utf8'));
const FONT = 'Arial', MONO = 'Consolas';
const ACC = '0887A6', HEAD = 'DCF0F5', EDGE = 'BCCDD3', ZEB = 'F2F6F7', FK = '2F6FD6', KEY = 'B57A06', MUTED = '5F706B', RED = 'C93C2F';
const W = 9638; // Textbreite A4 mit 2 cm Rand

/* ── Bausteine ─────────────────────────────────────────────── */
const r = (text, o = {}) => new TextRun({ text, font: o.mono ? MONO : FONT, ...o });
const p = (runs, o = {}) => new Paragraph({ children: [].concat(runs).map(x => typeof x === 'string' ? r(x) : x), spacing: { after: 100, line: 276 }, ...o });
const gap = (n = 120) => new Paragraph({ children: [], spacing: { after: n } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function h1(text, pts, top) {
  return new Paragraph({
    keepNext: true, spacing: { before: top ? 0 : 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } },
    children: [r(text, { bold: true, size: top ? 24 : 26, color: '0C1F27' }), ...(pts ? [r('   ' + pts, { size: 20, color: MUTED })] : [])]
  });
}

/* Kasten mit farbigem Rand links (Situation, Zitate, Hinweise) */
function box(paras, { fill = 'EEF6F8', color = ACC } = {}) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: EDGE };
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      margins: { top: 140, bottom: 80, left: 220, right: 220 },
      borders: { top: b, bottom: b, right: b, left: { style: BorderStyle.SINGLE, size: 24, color } },
      children: paras.map(x => typeof x === 'string' ? p(x) : x)
    })] })]
  });
}

/* SQL-Code im Look des SQL-Studio-Editors */
function code(lines, indent = 400) {
  return lines.map((l, i) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F2F6F7', color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACC, space: 8 } },
    indent: { left: indent },
    spacing: { after: i === lines.length - 1 ? 140 : 0, line: 260 },
    keepNext: i < lines.length - 1,
    children: [r(l || ' ', { mono: true, size: 19 })]
  }));
}

/* Datentabelle wie in SQL Studio: Kopf mit Tabellenname, Spaltenzeile, Zebra.
   cols: { n, pk, fk, num, mono } — Daten aus daten.json.
   parts() liefert die Zellen je Zeile, damit mehrere Tabellen nebeneinander
   in EINER Word-Tabelle stehen können (verschachtelte Tabellen zerfallen in LibreOffice). */
const EB = { style: BorderStyle.SINGLE, size: 4, color: EDGE };
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
function parts(name, cols, widths, fs = 18) {
  const rows = D[name].rows;
  const total = widths.reduce((a, b) => a + b, 0);
  const borders = { top: EB, bottom: EB, left: EB, right: EB };
  const cell = (children, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders, margins: { top: fs < 18 ? 20 : 45, bottom: fs < 18 ? 20 : 45, left: 70, right: 70 }, children, ...o });
  const out = [];
  out.push([cell([new Paragraph({ children: [r(name, { bold: true, size: 21 })] })], total,
    { columnSpan: cols.length, shading: { type: ShadingType.CLEAR, fill: HEAD, color: 'auto' } })]);
  out.push(cols.map((c, i) => cell([new Paragraph({ children: [
    r(c.n, { bold: true, size: fs, underline: c.pk ? {} : undefined, color: c.fk ? FK : '0C1F27' }),
    ...(c.fk ? [r(' ↑', { bold: true, size: fs, color: FK })] : [])
  ] })], widths[i], { shading: { type: ShadingType.CLEAR, fill: 'FFFFFF', color: 'auto' } })));
  rows.forEach((row, ri) => out.push(row.map((v, i) => cell([new Paragraph({
    alignment: cols[i].num ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [r(String(v), { size: fs, font: cols[i].mono ? MONO : FONT })]
  })], widths[i], { shading: { type: ShadingType.CLEAR, fill: ri % 2 ? ZEB : 'FFFFFF', color: 'auto' } }))));
  return { name, widths, total, rows: out };
}
/* Eine oder mehrere Tabellen nebeneinander, getrennt durch eine randlose Lücke */
function tables(list, gapW = 360) {
  const widths = [];
  list.forEach((t, k) => { if (k) widths.push(gapW); widths.push(...t.widths); });
  const H = Math.max(...list.map(t => t.rows.length));
  const blank = w => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: { top: NB, bottom: NB, left: NB, right: NB }, children: [new Paragraph({ children: [] })] });
  const rows = [];
  for (let y = 0; y < H; y++) {
    const cells = [];
    list.forEach((t, k) => {
      if (k) cells.push(blank(gapW));
      if (t.rows[y]) cells.push(...t.rows[y]);
      else cells.push(new TableCell({ width: { size: t.total, type: WidthType.DXA }, columnSpan: t.widths.length, borders: { top: NB, bottom: NB, left: NB, right: NB }, children: [new Paragraph({ children: [] })] }));
    });
    rows.push(new TableRow({ cantSplit: true, children: cells }));
  }
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({ layout: TableLayoutType.FIXED, width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows });
}

function bild(file, wpx, hpx) {
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new ImageRun({
    type: 'png', data: fs.readFileSync(path.join(DIR, file)), transformation: { width: wpx, height: hpx }
  })] });
}
const legende = () => p([r('Primärschlüssel: ', { size: 18, color: MUTED }), r('Schlüssel, unterstrichen', { size: 18, bold: true, color: KEY }),
  r('   ·   Fremdschlüssel: ', { size: 18, color: MUTED }), r('Kette und ↑', { size: 18, bold: true, color: FK }),
  r('   ·   Linie mit 1 und n: eine Zeile dort, viele Zeilen hier (1 : n)', { size: 18, color: MUTED })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } });

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
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 260 } } } }
    ] }
  ]
};
const item = (ref, runs, level = 0, o = {}) => p(runs, { numbering: { reference: ref, level }, spacing: { after: 90, line: 276 }, ...o });
const dot = (runs, level = 0) => item('dot', runs, level, { spacing: { after: 50, line: 264 } });
const attrs = s => r('(' + s + ')', { italics: true, color: MUTED });
const b = s => r(s, { bold: true });
const i_ = s => r(s, { italics: true });
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
      new TableRow({ children: [c('Q1 Informatik', W / 2), c('Datum: ____________________', W / 2, true)] }),
      new TableRow({ children: [c('Name: ________________________________', W / 2), c('Thema: Datenbanken und SQL', W / 2, true)] })
    ] }),
    new Paragraph({ spacing: { before: 280, after: 160 }, alignment: AlignmentType.CENTER, children: [r(titel, { bold: true, size: 34 })] })
  ];
}

/* Spalten der Tabellen (Schlüssel wie im Klassendiagramm);
   jede Funktion liefert parts(), tables([...]) setzt sie ein */
const T = {
  Kunde: () => parts('Kunde', [{ n: 'Vorname', pk: 1 }, { n: 'Nachname' }, { n: 'Geburtsdatum', mono: 1 }, { n: 'Telefon', num: 1, mono: 1 }, { n: 'Wohnort' }],
    [1100, 1050, 1350, 1300, 1000], 16),
  Autor: () => parts('Autor', [{ n: 'Id', pk: 1, num: 1 }, { n: 'Name' }, { n: 'Nationalitaet' }], [450, 1700, 1200], 16),
  Buch_Autor: () => parts('Buch_Autor', [{ n: 'ISBN', pk: 1, fk: 1, mono: 1 }, { n: 'Autor_Id', pk: 1, fk: 1, num: 1 }], [1850, 1050], 16),
  Buch: () => parts('Buch', [{ n: 'ISBN', pk: 1 }, { n: 'Titel' }, { n: 'Genre' }, { n: 'Preis', num: 1 },
    { n: 'Verlag' }, { n: 'Verlagsort' }, { n: 'Verlagstel', num: 1, mono: 1 }, { n: 'Bestand', num: 1 }],
    [1650, 1780, 1600, 600, 1050, 950, 1200, 800], 16),
  Kauf: () => parts('Kauf', [{ n: 'Nr', pk: 1, num: 1 }, { n: 'Vorname', fk: 1 }, { n: 'ISBN', fk: 1, mono: 1 }, { n: 'Zeitpunkt', mono: 1 }],
    [450, 1050, 1850, 1750], 16),
  Bewegung: () => parts('Bewegung', [{ n: 'Nr', pk: 1, num: 1 }, { n: 'Geraet', mono: 1 }, { n: 'Geraetename' }, { n: 'Standort' }, { n: 'Zeitpunkt', mono: 1 }],
    [450, 2000, 1450, 1700, 1850], 16)
};

/* ═════════════════════════════════════════════════════════════
   KLAUSUR
   ═════════════════════════════════════════════════════════════ */
const klausur = [
  ...kopf('Klausur Nr. 1 – Der Buchladen von Herrn Koreander'),

  box([
    p([r('Herr Koreander führt seit vielen Jahren einen kleinen Buchladen in Hamburg. Bisher hat er alles von Hand in ein dickes Kassenbuch geschrieben. Nachdem ihm seine Nichte von ihrem Informatikunterricht erzählt hat, hat er die Datenbank für seinen Laden kurzerhand '), b('selbst gebaut'), r(' (Anlagen A1 und A2).')]),
    p('Die Datenbank funktioniert: Herr Koreander kann damit schon viele Fragen zu seinem Laden beantworten. Ein paar Dinge hat er beim Entwurf aber nicht zu Ende gedacht. Weil im Alltag doch einige Fehler auftreten, bittet er Sie als Datenbank-Expertin bzw. Datenbank-Experte um Hilfe.'),
    p('In den Aufgaben 1 bis 3 machen Sie sich zunächst mit der Datenbank vertraut. In Aufgabe 4 helfen Sie ihm bei den Problemen in der Datenbankstruktur, und in Aufgabe 5 beraten Sie ihn bei weiterem „modernem Kram“.')
  ]),

  h1('Aufgabe 1 – Beziehungen', '(ca. 2 + 4 + 2 Pkt.)'),
  item('a1', [r('Erklären Sie, was ein '), b('Fremdschlüssel'), r(' ist und welche Aufgabe er in einer relationalen Datenbank erfüllt.')]),
  item('a1', [r('In Herrn Koreanders Datenbank gibt es zwei '), b('n:m-Beziehungen'), r('. Eine davon besteht zwischen Autor und Buch.')]),
  item('a1', 'Erläutern Sie, was eine n:m-Beziehung bedeutet und warum zwischen Autor und Buch eine n:m-Beziehung nötig ist.', 1),
  item('a1', 'Benennen Sie die zweite n:m-Beziehung und Dateneinträge, die zu ihr gehören (A2).', 1),

  h1('Aufgabe 2 – SQL', '(ca. 1 + 3 + 2 + 3 + 4 Pkt.)'),
  p('Erstellen Sie SQL-Befehle, welche die beschriebenen Tabellen ausgeben. Die Ausgaben sollen passende Attribute enthalten. Verwenden Sie die Datenbank so, wie Herr Koreander sie angelegt hat (A1).'),
  item('a2', 'Alle Bücher, die weniger als 20 € kosten.'),
  item('a2', 'Alle Fantasy-Bücher – auch die, die zusätzlich zu einem weiteren Genre gehören –, das teuerste zuerst.'),
  item('a2', 'Alle Bücher, deren Verlag in Hamburg sitzt und von denen weniger als 3 Exemplare vorrätig sind.'),
  item('a2', 'Alle Kundinnen und Kunden, die am 30.11.2026 ein Buch gekauft haben. Jede Person soll nur einmal erscheinen.'),
  item('a2', [r('Wie viel Geld jede Kundin und jeder Kunde bisher im Laden ausgegeben hat, nach Betrag absteigend sortiert. '), attrs('Vorname, Nachname, Umsatz')]),

  h1('Aufgabe 3 – Datenbank verändern', '(ca. 2 + 3 Pkt.)'),
  item('a3', 'Wegen gestiegener Papierpreise erhöht der Carlsen-Verlag seine Preise um 10 %. Formulieren Sie einen SQL-Befehl, der die Preise aller Carlsen-Bücher in der Datenbank um 10 % erhöht.'),
  item('a3', 'Herr Koreander möchte J. K. Rowling aus seinem Sortiment nehmen. Geben Sie die nötigen SQL-Befehle an, mit denen alle Bücher von J. K. Rowling und die Autorin selbst aus der Datenbank gelöscht werden.'),

  h1('Aufgabe 4 – Herrn Koreanders Datenbank unter der Lupe', '(ca. 3 + 3 + 3 Pkt.)'),
  item('a4', 'Herr Koreander schildert Ihnen zwei Probleme aus seinem Alltag. Erläutern Sie jeweils aus Sicht der Datenbank, welcher Fehler im Entwurf dahintersteckt, und korrigieren Sie ihn.', 0, { keepNext: true }),
  item('a4', [i_('„Letzte Woche wollte ich eine neue Stammkundin eintragen: Anna Schmidt aus Kiel. Das Programm hat sich geweigert!“')], 1),
  item('a4', [i_('„Ich kann in der Datenbank die Telefonnummern nicht richtig abspeichern. Da fehlen immer mal wieder Nullen.“')], 1),
  item('a4', [r('Die Datenbank enthält '), b('weitere'), r(' Fehler, die Herrn Koreander bisher nicht aufgefallen sind. Benennen und erläutern Sie '), b('einen'), r(' und geben Sie eine Korrektur an.')]),

  h1('Aufgabe 5 – Kundschaft im Blick', '(ca. 4 + 6 Pkt.)'),
  box([
    p('Herr Koreander hat im Internet gesehen, dass man die Bewegungen der Kundschaft im Laden festhalten kann. Deshalb hat er an fünf Stellen kleine Bluetooth-Sender aufgestellt. Sie erkennen Handys in der Nähe und speichern in der neuen Tabelle Bewegung, welches Gerät (Kennung und Name) wann an welchem Standort war.')
  ]),
  gap(100),
  tables([T.Bewegung()]),
  gap(60),
  item('a5', 'Bisher sind die Bewegungsdaten nicht mit den Kundendaten verknüpft. Beschreiben Sie zwei Vorteile, die Herr Koreander aus diesen Daten ziehen kann.'),
  item('a5', 'Nun schafft Herr Koreander es, die Bewegungsdaten mit den Kundendaten zu verknüpfen. Würden Sie Herrn Koreander diesen Schritt empfehlen? Bewerten Sie dieses Vorgehen.'),

  gap(300),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [r('Viel Erfolg!', { bold: true, size: 26 })] }),

  pageBreak(),
  h1('Anlage A1 – Klassendiagramm (so hat Herr Koreander die Datenbank angelegt)', null, true),
  bild('diagramm-haupt.png', 600, 294),
  legende(),
  h1('Anlage A2 – Beispieldaten'),
  tables([T.Kunde(), T.Autor()], 400), gap(80),
  tables([T.Buch()]), gap(80),
  tables([T.Kauf(), T.Buch_Autor()], 400)
];

/* ═════════════════════════════════════════════════════════════
   ERWARTUNGSHORIZONT
   ═════════════════════════════════════════════════════════════ */
const pk = s => r(' [' + s + ']', { bold: true, color: ACC });
const erg = s => p(r(s, { size: 19, color: MUTED }), { indent: { left: 400 } });
const eh = [
  ...kopf('Erwartungshorizont – Klausur Nr. 1 „Buchladen Koreander“'),
  box([p([b('Hinweis. '), r('Gesamt ca. 45 Punkte. Die Datenbank enthält absichtlich mehr Schwachstellen, als in Aufgabe 2 verlangt sind; jede sachlich richtige ist zu werten. Die SQL-Lösungen sind gegen die Beispieldaten geprüft (pruefen.py). Andere korrekte Schreibweisen (Aliase, Join über WHERE, Unterabfragen) sind gleichwertig.')])]),

  h1('Aufgabe 1 – Beziehungen (AFB I/II)', '8 Pkt.'),
  item('e1', [b('Fremdschlüssel'), pk('2')]),
  dot('Attribut (oder Attributkombination) einer Tabelle, das auf den Primärschlüssel einer anderen (oder derselben) Tabelle verweist.'),
  dot('Aufgabe: stellt die Beziehung zwischen Tabellen her, ohne Daten doppelt zu speichern; sorgt für referenzielle Integrität (es darf nur auf vorhandene Datensätze verwiesen werden).'),
  dot('Beispiel: Kauf.ISBN ↑ verweist auf Buch.ISBN – Kauf 1 mit 978-3-522-20260-1 → „Die unendliche Geschichte“. Ebenso Kauf.Vorname → Kunde, Buch_Autor.Autor_Id → Autor.'),
  item('e1', [b('n:m-Beziehungen')]),
  item('e1', [r('Bedeutung und Autor – Buch'), pk('4')], 1),
  dot('n:m bedeutet: Ein Datensatz der einen Tabelle kann mit vielen Datensätzen der anderen verbunden sein – und umgekehrt. Umgesetzt wird das mit einer Zwischentabelle, die Fremdschlüssel auf beide Tabellen enthält (hier Buch_Autor).'),
  dot('Eine Autorin schreibt viele Bücher (Michael Ende: „Die unendliche Geschichte“, „Momo“; Rowling: zwei Harry-Potter-Bände).'),
  dot('Ein Buch kann von mehreren Personen geschrieben werden, z. B. „Ein gutes Omen“ von Terry Pratchett und Neil Gaiman, Schulbücher, Sammelbände. Dass in den Beispieldaten jedes Buch nur eine Person hat, ändert nichts: Die Struktur muss alle Fälle abbilden, die vorkommen können. Mit einem Fremdschlüssel Autor_Id in Buch (1:n) ginge nur eine Person je Buch.'),
  item('e1', [r('Zweite n:m-Beziehung: Kunde – Buch über Kauf'), pk('2')], 1),
  dot('Bastian kauft „Die unendliche Geschichte“, „Tintenherz“, „Momo“ und „Harry Potter und der Stein der Weisen“ (Kauf 1, 2, 6, 7).'),
  dot('„Die unendliche Geschichte“ kaufen Bastian und Anna (Kauf 1, 5); „Stein der Weisen“ kaufen Mia und Bastian (Kauf 3, 7).'),

  h1('Aufgabe 2 – SQL (AFB II)', '13 Pkt.'),
  item('e2', [b('Bücher unter 20 €'), pk('1')]),
  ...code(['SELECT Titel, Preis', 'FROM Buch', 'WHERE Preis < 20;']),
  erg('Ergebnis: Momo, Der Ruf des Kuckucks.'),
  item('e2', [b('Fantasy-Bücher, teuerstes zuerst'), pk('3'), r(' – LIKE mit % (1), ORDER BY … DESC (1), Rest (1). Mit Genre = \'Fantasy\' findet man nur die beiden Bücher, die ausschließlich Fantasy sind (max. 1 Pkt.).')]),
  ...code(['SELECT Titel, Genre, Preis', 'FROM Buch', "WHERE Genre LIKE '%Fantasy%'", 'ORDER BY Preis DESC;']),
  erg('Ergebnis: 5 Bücher, Tintenherz (24,00) zuerst, Momo (15,00) zuletzt.'),
  item('e2', [b('Hamburger Verlage, weniger als 3 vorrätig'), pk('2'), r(' – zwei Bedingungen mit AND. Wer Verlagsort nicht erkennt oder Verlag = \'Hamburg\' schreibt: max. 1 Pkt.')]),
  ...code(['SELECT Titel, Verlag, Bestand', 'FROM Buch', "WHERE Verlagsort = 'Hamburg' AND Bestand < 3;"]),
  erg('Ergebnis: Harry Potter und die Kammer des Schreckens (2), Tintenherz (1).'),
  item('e2', [b('Käufe am 30.11.2026, jede Person einmal'), pk('3'), r(' – Datum (1), DISTINCT (1), Join/Attribute (1). Ohne Nachnamen reicht auch Kauf allein ohne Join.')]),
  ...code(['SELECT DISTINCT Kunde.Vorname, Kunde.Nachname', 'FROM Kunde', 'JOIN Kauf ON Kauf.Vorname = Kunde.Vorname', "WHERE DATE(Kauf.Zeitpunkt) = '2026-11-30';"]),
  dot("Gleichwertig: WHERE Kauf.Zeitpunkt LIKE '2026-11-30%' oder BETWEEN '2026-11-30 00:00' AND '2026-11-30 23:59'; ohne Nachnamen: SELECT DISTINCT Vorname FROM Kauf WHERE …"),
  erg('Ergebnis: Anna Schmidt, Bastian Bux (Bastian hat zweimal gekauft und erscheint ohne DISTINCT doppelt).'),
  item('e2', [b('Umsatz je Person'), pk('4'), r(' – zwei Joins (1), SUM (1), GROUP BY (1), ORDER BY … DESC (1).')]),
  ...code(['SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz', 'FROM Kunde', 'JOIN Kauf ON Kauf.Vorname = Kunde.Vorname', 'JOIN Buch ON Buch.ISBN = Kauf.ISBN', 'GROUP BY Kunde.Vorname, Kunde.Nachname', 'ORDER BY Umsatz DESC;']),
  erg('Ergebnis: Bastian Bux 81,00 · Anna Schmidt 22,00 · Leonie Park 20,00 · Mia Kaya 20,00.'),

  h1('Aufgabe 3 – Datenbank verändern (AFB II)', '5 Pkt.'),
  item('e3', [b('Preiserhöhung Carlsen'), pk('2')]),
  ...code(['UPDATE Buch', 'SET Preis = Preis * 1.1', "WHERE Verlag = 'Carlsen';"]),
  item('e3', [b('J. K. Rowling löschen'), pk('3')]),
  ...code(['DELETE FROM Kauf       WHERE ISBN IN (SELECT ISBN FROM Buch_Autor WHERE Autor_Id = 2);',
    "DELETE FROM Buch_Autor WHERE Autor_Id = 2;",
    "DELETE FROM Buch       WHERE ISBN IN ('978-3-551-55167-3', '978-3-551-55168-4');",
    'DELETE FROM Autor      WHERE Id = 2;'], 900),
  dot('Reihenfolge: Ein Datensatz, auf den noch ein Fremdschlüssel zeigt, darf nicht gelöscht werden (referenzielle Integrität). Kauf 3, 4 und 7 verweisen auf die Harry-Potter-Bücher, Buch_Autor verweist auf Buch und Autor – also erst Kauf, dann Buch_Autor, dann Buch, dann Autor.'),
  dot('Stolperstein: Nach dem Löschen aus Buch_Autor findet die Unterabfrage die ISBNs nicht mehr. Daher ISBNs direkt angeben, Buch vorher über eine Unterabfrage merken oder Bücher ohne Eintrag in Buch_Autor löschen (WHERE ISBN NOT IN (SELECT ISBN FROM Buch_Autor)). Mit ON DELETE CASCADE ginge es einfacher – wer das begründet nutzt, bekommt die Punkte.'),
  dot([b('Zusatz: '), r('„Robert Galbraith“ ist ein Pseudonym von J. K. Rowling – „Der Ruf des Kuckucks“ bliebe im Laden. Wer das anmerkt, zeigt Überblick (nicht verlangt).')]),

  h1('Aufgabe 4 – Schwachstellen (AFB II)', '9 Pkt.'),
  item('e4', [b('Probleme aus dem Alltag'), r(' – je 1 Pkt. Ursache benennen, 1 Pkt. erläutern, 1 Pkt. Korrektur')]),
  item('e4', [b('Anna Schmidt'), pk('3')], 1),
  dot('Primärschlüssel von Kunde ist nur der Vorname. Ein Primärschlüssel muss eindeutig sein; da es bereits „Anna“ gibt, weist die Datenbank den neuen Datensatz ab. Vornamen wiederholen sich ständig.'),
  dot('Auch Vorname + Nachname reicht nicht: Beide Frauen heißen Anna Schmidt. Kein natürliches Attribut ist hier sicher eindeutig.'),
  dot('Korrektur: künstlicher Schlüssel Kunde.Id INT (AUTO_INCREMENT); Kauf verweist dann mit Kunde_Id ↑ statt mit Vorname auf Kunde.'),
  item('e4', [b('Telefonnummern'), pk('3')], 1),
  dot('Telefon hat den Datentyp INT. Zahlen werden ohne führende Null gespeichert (01712233445 → 1712233445) – derselbe Fehler steckt in Buch.Verlagstel (0711 555012 → 711555012). Außerdem gehen +49, Leerzeichen, Schrägstrich nicht, lange Nummern sprengen den Wertebereich von INT.'),
  dot('Mit Telefonnummern wird nicht gerechnet – es sind Zeichenketten aus Ziffern. Korrektur: Telefon (und Verlagstel) VARCHAR.'),
  item('e4', [b('Weiterer Fehler'), r(' – einer genügt'), pk('3')]),
  dot([b('Genre enthält mehrere Werte'), r(' („Fantasy, Jugendbuch, Klassiker“): nicht atomar, Suchen nur mit LIKE, Tippfehler erzeugen neue Genres. → Tabelle Genre(Id, Bezeichnung) und Zwischentabelle Buch_Genre(ISBN ↑, Genre_Id ↑).')]),
  dot([b('Verlagsdaten stehen in Buch'), r(' (Verlag, Verlagsort, Verlagstel): Sie hängen nur vom Verlag ab, nicht vom Buch, und stehen bei jedem Buch desselben Verlags erneut (Thienemann, Carlsen je zweimal). Redundanz: Zieht ein Verlag um oder ändert die Telefonnummer, müssen mehrere Zeilen geändert werden, sonst widersprüchliche Daten (Änderungsanomalie); ein Verlag ohne Buch kann nicht gespeichert werden. → eigene Tabelle Verlag(Id, Name, Ort, Telefon), Buch.Verlag_Id ↑ – eine 1:n-Beziehung (ein Verlag, viele Bücher).')]),
  dot([b('Kauf speichert keinen Preis'), r(': ändert sich Buch.Preis (z. B. Aufgabe 3 a), ändern sich rückwirkend alle alten Umsätze. → Preis DECIMAL(5,2) in Kauf (Verkaufspreis zum Zeitpunkt des Kaufs).')]),

  h1('Aufgabe 5 – Kundschaft im Blick (AFB I/III)', '10 Pkt.'),
  item('e5', [b('Zwei Vorteile ohne Verknüpfung'), r(' – je 2 Pkt.'), pk('4')]),
  dot('Welche Ecken ziehen Kundschaft an und wie lange bleibt sie dort? Das iPhone ist von 15:03 bis 15:11 in der Fantasy-Ecke → Fantasy funktioniert. Regale und Neuheiten danach anordnen.'),
  dot('Wer schaut nur und kauft nichts? Das Galaxy steht am Krimi-Regal und geht ohne Kasse wieder raus → Angebot/Sortiment prüfen.'),
  dot('Wie viele kommen herein, zu welchen Zeiten? → Personal zu Stoßzeiten einplanen, Wirkung des Schaufensters/von Aktionen messen.'),
  dot('Laufwege durch den Laden erkennen (Eingang → Fantasy → Kasse) → Ladenaufbau verbessern.'),
  item('e5', [b('Verknüpfung bewerten'), r(' – Wie geht es? 1, Nutzen 1, Kritik 2, Abwägung und begründete Empfehlung 2'), pk('6')]),
  dot([b('Wie es geht: '), r('Abgleich an der Kasse: Das iPhone ist am 30.11. um 15:11 an der Kasse, Kauf 6 und 7 um 15:12 → das Gerät gehört Bastian. Der Gerätename „Leonies Pixel“ verrät den Namen direkt. Das Galaxy war nie an der Kasse und bleibt unbekannt. Technisch: neues Attribut/Tabelle, das Geraet einem Kunden zuordnet.')]),
  dot([b('Nutzen: '), r('Kundschaft gezielt ansprechen („Bastian mag Fantasy“, Anruf bei Neuerscheinungen), Stammkundschaft erkennen, Interessen ohne Kauf kennen.')]),
  dot([b('Kritisch: '), r('Niemand weiß davon oder hat eingewilligt; Gerätekennungen sind personenbezogene Daten (DSGVO: Information, Einwilligung, Zweckbindung, Löschfristen). Mit Geburtsdatum, Wohnort, Telefon und Käufen entsteht ein Personenprofil – bei Kindern (Bastian 12, Leonie 15) besonders heikel. Auch Menschen, die nie etwas kaufen, werden erfasst. Fehlzuordnungen sind möglich (zwei Personen an der Kasse, Familienhandy, Handys wechseln ihre Bluetooth-Kennung). Vertrauensverlust, wenn es herauskommt.')]),
  dot([b('Vergleich (möglich): '), r('wie views/sessions in YourSozialNet – läuft unbemerkt im Hintergrund; erst die Verknüpfung macht aus Messwerten Überwachung einzelner Personen.')]),
  dot('Empfehlung, z. B.: Für das eigentliche Ziel („welche Ecken funktionieren?“) reichen die anonymen Daten (Datensparsamkeit). Die Verknüpfung nur mit Einwilligung, Information im Laden und ohne Kinder – sonst abraten. Bewertet wird die Begründung, nicht die Position.')
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
    [klausur, 'Q1 Informatik · Klausur Nr. 1 · Datenbanken und SQL', 'Klausur_DB_Buchladen.docx'],
    [eh, 'Erwartungshorizont · Klausur Nr. 1 · Datenbanken und SQL', 'Erwartungshorizont_DB_Buchladen.docx']
  ]) {
    fs.writeFileSync(path.join(DIR, file), await Packer.toBuffer(doc(kids, label)));
    console.log('geschrieben:', file);
  }
})();
