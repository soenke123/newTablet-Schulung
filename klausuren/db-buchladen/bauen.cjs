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

function h1(text, pts) {
  return new Paragraph({
    keepNext: true, spacing: { before: 280, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACC, space: 2 } },
    children: [r(text, { bold: true, size: 26, color: '0C1F27' }), ...(pts ? [r('   ' + pts, { size: 20, color: MUTED })] : [])]
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
  const cell = (children, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders, margins: { top: 45, bottom: 45, left: 70, right: 70 }, children, ...o });
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

/* Spalten der Tabellen (Schlüssel wie im Klassendiagramm) */
const T = {
  /* jede Funktion liefert parts(); tables([...]) setzt sie ein */
  Kunde: () => parts('Kunde', [{ n: 'Vorname', pk: 1 }, { n: 'Nachname' }, { n: 'Geburtsdatum', mono: 1 }, { n: 'Telefon', num: 1, mono: 1 }, { n: 'Wohnort' }],
    [1700, 1700, 1800, 2000, 1800]),
  Autor: () => parts('Autor', [{ n: 'Id', pk: 1, num: 1 }, { n: 'Name' }, { n: 'Nationalitaet' }], [550, 2250, 1450]),
  Buch_Autor: () => parts('Buch_Autor', [{ n: 'ISBN', pk: 1, fk: 1, mono: 1 }, { n: 'Autor_Id', pk: 1, fk: 1, num: 1 }], [2200, 1200]),
  Buch: () => parts('Buch', [{ n: 'ISBN', pk: 1, mono: 1 }, { n: 'Titel' }, { n: 'Genre' }, { n: 'Preis', num: 1 },
    { n: 'Verlag' }, { n: 'Verlagsort' }, { n: 'Bestand', num: 1 }], [1900, 2650, 1400, 700, 1100, 1050, 830], 16),
  Kauf: () => parts('Kauf', [{ n: 'Nr', pk: 1, num: 1 }, { n: 'Vorname', fk: 1 }, { n: 'ISBN', fk: 1, mono: 1 }, { n: 'Zeitpunkt', mono: 1 }],
    [700, 1700, 2300, 2100]),
  Sensor: () => parts('Sensor', [{ n: 'Id', pk: 1, num: 1 }, { n: 'Ort' }], [500, 2100], 16),
  Bewegung: () => parts('Bewegung', [{ n: 'Nr', pk: 1, num: 1 }, { n: 'Geraet', mono: 1 }, { n: 'Geraetename' }, { n: 'Sensor_Id', fk: 1, num: 1 }, { n: 'Zeitpunkt', mono: 1 }],
    [500, 1950, 1350, 1100, 1750], 16)
};

/* ═════════════════════════════════════════════════════════════
   KLAUSUR
   ═════════════════════════════════════════════════════════════ */
const klausur = [
  ...kopf('Klausur Nr. 2 – Der Buchladen von Herrn Koreander'),

  box([
    p([b('Ausgangssituation. '), r('Herr Koreander führt seit vielen Jahren einen kleinen Buchladen in Hamburg. Bisher hat er alles von Hand in ein dickes Kassenbuch geschrieben. Nachdem ihm seine Nichte von ihrem Informatikunterricht erzählt hat, hat er die Datenbank für seinen Laden kurzerhand '), b('selbst gebaut'), r(' (Anlagen A1 und A2).')]),
    p('Die Datenbank funktioniert: Herr Koreander kann damit schon viele Fragen zu seinem Laden beantworten. Ein paar Dinge hat er beim Entwurf aber nicht zu Ende gedacht. Weil im Alltag doch einige Fehler auftreten, bittet er Sie als Datenbank-Expertin bzw. Datenbank-Experte um Hilfe.')
  ]),

  h1('Aufgabe 1 – Beziehungen', '(ca. 3 + 4 + 3 Pkt.)'),
  item('a1', [r('Erklären Sie, was ein '), b('Fremdschlüssel'), r(' ist und welche Aufgabe er in einer relationalen Datenbank erfüllt. Verdeutlichen Sie Ihre Erklärung an einem Fremdschlüssel aus Herrn Koreanders Datenbank.')]),
  item('a1', [r('In Herrn Koreanders Datenbank gibt es zwei '), b('n:m-Beziehungen'), r('. Eine davon besteht zwischen Autor und Buch.')]),
  item('a1', 'Benennen Sie die zweite n:m-Beziehung und belegen Sie sie mit konkreten Datensätzen aus A2. Erklären Sie, wie diese n:m-Beziehung in der Datenbank umgesetzt ist.', 1),
  item('a1', 'In den Beispieldaten hat jedes Buch genau eine Autorin oder einen Autor. Erläutern Sie, warum zwischen Autor und Buch trotzdem eine n:m-Beziehung nötig ist.', 1),

  h1('Aufgabe 2 – Herrn Koreanders Datenbank unter der Lupe', '(ca. 3 + 3 + 3 Pkt.)'),
  item('a2', 'Herr Koreander schildert Ihnen zwei Probleme aus seinem Alltag. Erläutern Sie jeweils aus Sicht der Datenbank, welcher Fehler im Entwurf dahintersteckt, und korrigieren Sie ihn.', 0, { keepNext: true }),
  item('a2', [i_('„Letzte Woche wollte ich eine neue Stammkundin eintragen: Anna Schmidt aus Kiel. Das Programm hat sich geweigert, weil es angeblich schon eine Anna gibt. Die gibt es auch – aber das ist doch eine ganz andere Frau!“')], 1),
  item('a2', [i_('„Wenn ein bestelltes Buch da ist, rufe ich meine Kundschaft an. Ich komme aber nie durch: Bei allen Telefonnummern fehlt vorne die Null.“')], 1),
  item('a2', [r('Die Datenbank enthält noch mindestens einen '), b('weiteren'), r(' Fehler, der Herrn Koreander bisher nicht aufgefallen ist. Benennen und erläutern Sie ihn und geben Sie eine Korrektur an.')]),

  h1('Aufgabe 3 – SQL', '(ca. 1 + 3 + 3 + 4 + 4 Pkt.)'),
  p('Erstellen Sie SQL-Befehle, welche die beschriebenen Tabellen ausgeben. Die Tabellen sollen genau die angegebenen Attribute enthalten. Verwenden Sie die Datenbank so, wie Herr Koreander sie angelegt hat (A1).'),
  item('a3', [r('Alle Bücher, die weniger als 20 € kosten. '), attrs('Titel, Preis')]),
  item('a3', [r('Alle Fantasy-Bücher – auch die, die zusätzlich zu einem weiteren Genre gehören –, das teuerste zuerst. '), attrs('Titel, Genre, Preis')]),
  item('a3', [r('Eine Tabelle, aus der hervorgeht, wie viele Bücher jede Autorin und jeder Autor im Sortiment hat. '), attrs('Name, Anzahl_Buecher')]),
  item('a3', [r('Alle Kundinnen und Kunden, die ein Buch von Michael Ende gekauft haben. '), attrs('Vorname, Nachname, Titel')]),
  item('a3', [r('Wie viel Geld jede Kundin und jeder Kunde bisher im Laden ausgegeben hat, nach Betrag absteigend sortiert. '), attrs('Vorname, Nachname, Umsatz')]),

  h1('Aufgabe 4 – Datenbank verändern', '(ca. 2 + 3 + 3 Pkt.)'),
  item('a4', 'Wegen gestiegener Papierpreise erhöht der Carlsen-Verlag seine Preise um 10 %. Formulieren Sie einen SQL-Befehl, der die Preise aller Carlsen-Bücher in der Datenbank um 10 % erhöht.'),
  item('a4', 'Herr Koreander möchte J. K. Rowling aus seinem Sortiment nehmen, weil er ihre öffentlichen Äußerungen nicht mit den Werten seines Ladens vereinbaren kann.'),
  item('a4', 'Geben Sie die nötigen SQL-Befehle an, mit denen alle Bücher von J. K. Rowling und die Autorin selbst aus der Datenbank gelöscht werden.', 1),
  item('a4', 'Beurteilen Sie im Hinblick auf die Beispieldaten, ob das Löschen dieser Informationen sinnvoll ist.', 1),

  pageBreak(),
  h1('Aufgabe 5 – Kundschaft im Blick', '(ca. 4 + 6 Pkt.)'),
  box([
    p('Herr Koreander möchte wissen, welche Ecken seines Ladens besonders gut funktionieren. Dafür hat er an fünf Stellen kleine Bluetooth-Sensoren angebracht. Eine Kundenkarte oder App gibt es nicht: Die Sensoren erkennen Handys in der Nähe, bei denen Bluetooth eingeschaltet ist, und speichern Daten, mit denen sich das Gerät wiedererkennen lässt – seine Kennung (Bluetooth-Adresse) und seinen Namen.'),
    p('Bisher weiß Herr Koreander damit nur, wann welches Gerät wo im Laden war. Mit der Zeit möchte er die Bewegungsdaten aber mit seinen Kundendaten verknüpfen, sodass er weiß, welches Gerät zu wem gehört.')
  ]),
  gap(100),
  bild('diagramm-tracking.png', 600, 150),
  p(r('Die neuen Tabellen. Die rote, gestrichelte Verbindung zu Kunde gibt es noch nicht.', { size: 18, color: MUTED }), { alignment: AlignmentType.CENTER, spacing: { after: 160 } }),
  tables([T.Sensor(), T.Bewegung()], 400),
  gap(60),
  item('a5', 'Erläutern Sie, wie Herr Koreander herausfinden kann, welches Gerät zu welcher Kundin bzw. welchem Kunden gehört. Beziehen Sie dazu die Beispieldaten (hier und in A2) ein und ergänzen Sie das Klassendiagramm um die nötige Verknüpfung.'),
  item('a5', [r('Beurteilen Sie das System: Welchen Nutzen hat es für Herrn Koreander, und was ist daran kritisch? Vergleichen Sie es dazu auch mit dem Tracking in '), b('YourSozialNet'), r(', wo in den Tabellen '), m('sessions'), r(' und '), m('views'), r(' im Hintergrund mitgespeichert wurde, wer das Netzwerk wann besucht und welches Foto wie lange angesehen hat.')]),

  gap(300),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [r('Viel Erfolg!', { bold: true, size: 26 })] }),

  pageBreak(),
  h1('Anlage A1 – Klassendiagramm (so hat Herr Koreander die Datenbank angelegt)'),
  bild('diagramm-haupt.png', 640, 362),
  legende(),

  pageBreak(),
  h1('Anlage A2 – Beispieldaten'),
  tables([T.Kunde()]), gap(),
  tables([T.Buch()]), gap(),
  tables([T.Autor(), T.Buch_Autor()], 500), gap(),
  tables([T.Kauf()])
];

/* ═════════════════════════════════════════════════════════════
   ERWARTUNGSHORIZONT
   ═════════════════════════════════════════════════════════════ */
const pk = s => r(' [' + s + ']', { bold: true, color: ACC });
const erg = s => p(r(s, { size: 19, color: MUTED }), { indent: { left: 400 } });
const eh = [
  ...kopf('Erwartungshorizont – Klausur Nr. 2 „Buchladen Koreander“'),
  box([p([b('Hinweis. '), r('Gesamt ca. 52 Punkte. Die Datenbank enthält absichtlich mehr Schwachstellen, als in Aufgabe 2 verlangt sind; jede sachlich richtige ist zu werten. Die SQL-Lösungen sind gegen die Beispieldaten geprüft (pruefen.py). Andere korrekte Schreibweisen (Aliase, Join über WHERE, Unterabfragen) sind gleichwertig.')])]),

  h1('Aufgabe 1 – Beziehungen (AFB I/II)', '10 Pkt.'),
  item('e1', [b('Fremdschlüssel'), pk('3')]),
  dot('Attribut (oder Attributkombination) einer Tabelle, das auf den Primärschlüssel einer anderen (oder derselben) Tabelle verweist.'),
  dot('Aufgabe: stellt die Beziehung zwischen Tabellen her, ohne Daten doppelt zu speichern; sorgt für referenzielle Integrität (es darf nur auf vorhandene Datensätze verwiesen werden).'),
  dot('Beispiel: Kauf.ISBN ↑ verweist auf Buch.ISBN – Kauf 1 mit 978-3-522-20260-1 → „Die unendliche Geschichte“. Ebenso Kauf.Vorname → Kunde, Buch_Autor.Autor_Id → Autor.'),
  item('e1', [b('n:m-Beziehungen')]),
  item('e1', [r('Kunde – Buch über Kauf'), pk('4')], 1),
  dot('Eine Person kauft viele Bücher: Bastian kauft „Die unendliche Geschichte“, „Tintenherz“ und „Momo“ (Kauf 1, 2, 8).'),
  dot('Ein Buch wird von vielen gekauft: „Die unendliche Geschichte“ kaufen Bastian und Anna (Kauf 1, 4).'),
  dot('Umsetzung: Zwischentabelle (Verknüpfungstabelle) Kauf mit den Fremdschlüsseln Vorname ↑ und ISBN ↑. Sie löst die n:m-Beziehung in zwei 1:n-Beziehungen auf (Kunde 1 – n Kauf n – 1 Buch) und speichert zusätzlich Angaben zur Beziehung selbst (Zeitpunkt).'),
  item('e1', [r('Warum Autor – Buch n:m'), pk('3')], 1),
  dot('Eine Autorin schreibt viele Bücher (Michael Ende: „Die unendliche Geschichte“, „Momo“; Rowling: zwei Harry-Potter-Bände).'),
  dot('Ein Buch kann von mehreren Personen geschrieben werden, z. B. „Ein gutes Omen“ von Terry Pratchett und Neil Gaiman, Schulbücher, Sachbücher, Sammelbände.'),
  dot('Die Struktur einer Datenbank muss alle Fälle abbilden, die vorkommen können – nicht nur die, die zufällig gerade in den Daten stehen. Mit einem Fremdschlüssel Autor_Id in Buch (1:n) könnte ein Buch nur auf eine einzige Person verweisen; ein zweiter Autor ließe sich nur über eine Fantasie-Person („Pratchett & Gaiman“) oder ein weiteres Attribut (Autor2_Id, starre Höchstzahl) eintragen. Die Zwischentabelle Buch_Autor erlaubt beliebig viele.'),

  h1('Aufgabe 2 – Schwachstellen (AFB II)', '9 Pkt.'),
  item('e2', [b('Probleme aus dem Alltag'), r(' – je 1 Pkt. Ursache benennen, 1 Pkt. erläutern, 1 Pkt. Korrektur')]),
  item('e2', [b('Anna Schmidt'), pk('3')], 1),
  dot('Primärschlüssel von Kunde ist nur der Vorname. Ein Primärschlüssel muss eindeutig sein; da es bereits „Anna“ gibt, weist die Datenbank den neuen Datensatz ab. Vornamen wiederholen sich ständig.'),
  dot('Auch Vorname + Nachname reicht nicht: Beide Frauen heißen Anna Schmidt. Kein natürliches Attribut ist hier sicher eindeutig.'),
  dot('Korrektur: künstlicher Schlüssel Kunde.Id INT (AUTO_INCREMENT); Kauf verweist dann mit Kunde_Id ↑ statt mit Vorname auf Kunde.'),
  item('e2', [b('Telefonnummern'), pk('3')], 1),
  dot('Telefon hat den Datentyp INT. Zahlen werden ohne führende Null gespeichert (01712233445 → 1712233445). Außerdem gehen +49, Leerzeichen, Schrägstrich nicht, lange Nummern sprengen den Wertebereich von INT.'),
  dot('Mit Telefonnummern wird nicht gerechnet – es sind Zeichenketten aus Ziffern. Korrektur: Telefon VARCHAR(20).'),
  item('e2', [b('Weiterer Fehler'), r(' – einer genügt'), pk('3')]),
  dot([b('Genre enthält mehrere Werte'), r(' („Fantasy, Jugendbuch“): nicht atomar, Suchen nur mit LIKE, Tippfehler erzeugen neue Genres. → Tabelle Genre(Id, Bezeichnung) und Zwischentabelle Buch_Genre(ISBN ↑, Genre_Id ↑).')]),
  dot([b('Verlag und Verlagsort stehen in Buch'), r(': redundant (Carlsen, Hamburg mehrfach); zieht ein Verlag um, müssen mehrere Zeilen geändert werden, sonst widersprüchliche Daten (Änderungsanomalie). → Tabelle Verlag(Id, Name, Ort), Buch.Verlag_Id ↑.')]),
  dot([b('Kauf speichert keinen Preis'), r(': ändert sich Buch.Preis (z. B. Aufgabe 4 a), ändern sich rückwirkend alle alten Umsätze. → Preis DECIMAL(5,2) in Kauf (Verkaufspreis zum Zeitpunkt des Kaufs).')]),

  h1('Aufgabe 3 – SQL (AFB II)', '15 Pkt.'),
  item('e3', [b('Bücher unter 20 €'), pk('1')]),
  ...code(['SELECT Titel, Preis', 'FROM Buch', 'WHERE Preis < 20;']),
  erg('Ergebnis: Momo, Der Ruf des Kuckucks, Sommerby, Die Farben der Magie.'),
  item('e3', [b('Fantasy-Bücher, teuerstes zuerst'), pk('3'), r(' – LIKE mit % (1), ORDER BY … DESC (1), Rest (1). Mit Genre = \'Fantasy\' findet man nur „Kammer des Schreckens“ (max. 1 Pkt.).')]),
  ...code(['SELECT Titel, Genre, Preis', 'FROM Buch', "WHERE Genre LIKE '%Fantasy%'", 'ORDER BY Preis DESC;']),
  erg('Ergebnis: 6 Bücher, Tintenherz (24,00) zuerst, Die Farben der Magie (12,00) zuletzt.'),
  item('e3', [b('Anzahl Bücher je Autor'), pk('3'), r(' – Join über Buch_Autor (1), COUNT mit Alias (1), GROUP BY (1). Ein zusätzlicher Join mit Buch ist ebenfalls richtig.')]),
  ...code(['SELECT Autor.Name, COUNT(*) AS Anzahl_Buecher', 'FROM Autor', 'JOIN Buch_Autor ON Buch_Autor.Autor_Id = Autor.Id', 'GROUP BY Autor.Name;']),
  item('e3', [b('Käufe von Büchern von Michael Ende'), pk('4'), r(' – Joins über Kauf, Buch(_Autor) und Autor (2), Bedingung (1), Attribute inkl. Nachname über Kunde (1).')]),
  ...code(['SELECT Kunde.Vorname, Kunde.Nachname, Buch.Titel', 'FROM Kunde', 'JOIN Kauf       ON Kauf.Vorname = Kunde.Vorname', 'JOIN Buch       ON Buch.ISBN = Kauf.ISBN', 'JOIN Buch_Autor ON Buch_Autor.ISBN = Buch.ISBN', 'JOIN Autor      ON Autor.Id = Buch_Autor.Autor_Id', "WHERE Autor.Name = 'Michael Ende';"]),
  erg('Ergebnis: Bastian Bux – Die unendliche Geschichte; Anna Schmidt – Die unendliche Geschichte; Bastian Bux – Momo.'),
  item('e3', [b('Umsatz je Person'), pk('4'), r(' – zwei Joins (1), SUM (1), GROUP BY (1), ORDER BY … DESC (1).')]),
  ...code(['SELECT Kunde.Vorname, Kunde.Nachname, SUM(Buch.Preis) AS Umsatz', 'FROM Kunde', 'JOIN Kauf ON Kauf.Vorname = Kunde.Vorname', 'JOIN Buch ON Buch.ISBN = Kauf.ISBN', 'GROUP BY Kunde.Vorname, Kunde.Nachname', 'ORDER BY Umsatz DESC;']),
  erg('Ergebnis: Bastian Bux 61,00 · Leonie Park 35,00 · Mia Kaya 32,00 · Anna Schmidt 22,00 · Jonas Weber 14,00.'),

  h1('Aufgabe 4 – Datenbank verändern (AFB II/III)', '8 Pkt.'),
  item('e4', [b('Preiserhöhung Carlsen'), pk('2')]),
  ...code(['UPDATE Buch', 'SET Preis = Preis * 1.1', "WHERE Verlag = 'Carlsen';"]),
  item('e4', [b('J. K. Rowling löschen')]),
  item('e4', [r('Befehle'), pk('3')], 1),
  ...code(['DELETE FROM Kauf       WHERE ISBN IN (SELECT ISBN FROM Buch_Autor WHERE Autor_Id = 2);',
    "DELETE FROM Buch_Autor WHERE Autor_Id = 2;",
    "DELETE FROM Buch       WHERE ISBN IN ('978-3-551-55167-3', '978-3-551-55168-4');",
    'DELETE FROM Autor      WHERE Id = 2;'], 900),
  dot('Reihenfolge: Ein Datensatz, auf den noch ein Fremdschlüssel zeigt, darf nicht gelöscht werden (referenzielle Integrität). Kauf 3 und 7 verweisen auf die Harry-Potter-Bücher, Buch_Autor verweist auf Buch und Autor – also erst Kauf, dann Buch_Autor, dann Buch, dann Autor.'),
  dot('Stolperstein: Nach dem Löschen aus Buch_Autor findet die Unterabfrage die ISBNs nicht mehr. Daher ISBNs direkt angeben, Buch vorher über eine Unterabfrage merken oder Bücher ohne Eintrag in Buch_Autor löschen (WHERE ISBN NOT IN (SELECT ISBN FROM Buch_Autor)). Mit ON DELETE CASCADE ginge es einfacher – wer das begründet nutzt, bekommt die Punkte.'),
  item('e4', [r('Beurteilung'), pk('3')], 1),
  dot('Verloren gehen die Käufe von Mia (Kauf 3) und Leonie (Kauf 7): Umsätze und Kaufhistorie stimmen nicht mehr (Aufgabe 3 e liefert weniger), Verkäufe müssen für die Buchhaltung aufbewahrt werden.'),
  dot('Laut Bestand stehen noch 6 Harry-Potter-Bücher im Regal – sie sind danach in der Datenbank nicht mehr vorhanden, obwohl sie im Laden liegen.'),
  dot('Besser: nicht löschen, sondern als „nicht mehr im Sortiment“ markieren (Attribut im_Sortiment BOOLEAN) und nicht nachbestellen.'),
  dot([b('Nicht vollständig: '), r('„Robert Galbraith“ ist ein Pseudonym von J. K. Rowling – „Der Ruf des Kuckucks“ bliebe im Laden. Die Datenbank kann das nicht erkennen (Zusatzpunkt, Fachwissen nicht vorausgesetzt).')]),

  h1('Aufgabe 5 – Kundschaft im Blick (AFB II/III)', '10 Pkt.'),
  item('e5', [b('Gerät einer Person zuordnen'), pk('4')]),
  dot([b('Abgleich an der Kasse: '), r('Ein Gerät, das kurz vor einem Kauf am Sensor 5 (Kasse) erfasst wird, gehört wahrscheinlich der Person, die gekauft hat. 7C:D1:… ist am 03.09. um 15:11 an der Kasse, Kauf 8 um 15:12 → Bastian. E5:3F:… um 15:17 an der Kasse, Kauf 9 um 15:18 → Leonie. Je öfter sich das wiederholt, desto sicherer die Zuordnung.')]),
  dot([b('Gerätename: '), r('„Leonies Pixel“ verrät den Namen direkt. Das Galaxy A54 war nie an der Kasse – es bleibt (vorerst) unbekannt.')]),
  dot('Weitere Wege: WLAN-Anmeldung im Laden, Zahlung mit dem Handy, Gewinnspiel/Newsletter mit Handy-Kopplung.'),
  dot('Im Diagramm: neue Tabelle Geraet(Geraet VARCHAR(17) PK, Geraetename, Kunde ↑) – ein Gerät gehört zu einer Person, eine Person kann mehrere Geräte haben (Kunde 1 – n Geraet), Bewegung.Geraet ↑ verweist dann auf Geraet. Gleichwertig: Fremdschlüssel auf Kunde direkt in Bewegung.'),
  dot('Abfrage (nicht verlangt, als Zusatz):'),
  ...code(['SELECT Bewegung.Geraet, Kauf.Vorname', 'FROM Bewegung JOIN Kauf', '  ON Kauf.Zeitpunkt BETWEEN Bewegung.Zeitpunkt', "                     AND Bewegung.Zeitpunkt + INTERVAL 2 MINUTE", 'WHERE Bewegung.Sensor_Id = 5;'], 900),
  item('e5', [b('Nutzen und Kritik'), r(' – Nutzen 2, Kritik 2, Vergleich YourSozialNet 1, begründetes Urteil 1'), pk('6')]),
  dot([b('Nutzen: '), r('Welche Ecken ziehen Kundschaft an und wie lange bleibt sie (Fantasy-Ecke: Bastian 15:03–15:11)? Wirkt das Schaufenster? Wer schaut nur und kauft nichts (Galaxy: 5 Minuten Krimis, ohne Kauf)? Regale umstellen, Personal zu Stoßzeiten einplanen. Mit Verknüpfung: wiederkehrende Kundschaft erkennen, gezielte Angebote („Bastian mag Fantasy“).')]),
  dot([b('Kritisch: '), r('Die Kundschaft weiß nichts davon und hat nicht eingewilligt; Gerätekennungen sind personenbezogene Daten (DSGVO: Information, Rechtsgrundlage, Löschfristen). Auch Menschen, die nie etwas kaufen, werden erfasst. Durch die Verknüpfung mit Kunde entstehen Personenprofile mit Geburtsdatum, Wohnort, Telefon und Interessen – bei Kindern (Bastian 12, Leonie 15) besonders heikel. Bestimmte Regale (Gesundheit, Religion, Ratgeber) erlauben sensible Rückschlüsse. Fehlzuordnungen sind möglich (zwei Personen an der Kasse, Familienhandy; moderne Handys wechseln die Bluetooth-Adresse).')]),
  dot([b('Vergleich YourSozialNet: '), r('Bewegung entspricht views (Ecke ↔ Foto, Verweildauer), der Ladenbesuch entspricht sessions. Beides läuft unbemerkt im Hintergrund. In YourSozialNet waren alle angemeldet, die Daten hingen sofort an einer Person; bei Herrn Koreander entsteht der Personenbezug erst durch die Verknüpfung – genau das macht aus „anonymen“ Messwerten Überwachung. Unterschied: echte Welt, keine App, keine Möglichkeit, es abzulehnen (außer Bluetooth aus).')]),
  dot('Urteil, z. B.: Für die Frage „welche Ecken funktionieren?“ reichen anonyme Zählungen ohne Gerätekennung (Datensparsamkeit, Zweckbindung); die Verknüpfung mit Kundendaten ist ohne Einwilligung nicht vertretbar. Bewertet wird die Begründung, nicht die Position.')
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
    [klausur, 'Q1 Informatik · Klausur Nr. 2 · Datenbanken und SQL', 'Klausur_DB_Buchladen.docx'],
    [eh, 'Erwartungshorizont · Klausur Nr. 2 · Datenbanken und SQL', 'Erwartungshorizont_DB_Buchladen.docx']
  ]) {
    fs.writeFileSync(path.join(DIR, file), await Packer.toBuffer(doc(kids, label)));
    console.log('geschrieben:', file);
  }
})();
