/**
 * Beispieldokument für die Vorschau auf der MPSkills-Startseite (?demo=1): ein erfundenes Referat „Zahlensysteme im
 * Tierreich“ mit drei Seiten (Seite 2 mit Tabelle), dazu ein paar Zeichnungen und Kommentare. Alles entsteht im Speicher;
 * es wird nichts geladen und nichts gespeichert. Die Koordinaten der Markierungen passen zu den Textzeilen unten
 * (PDF-Punkte, Ursprung links unten).
 */
import { PDFDocument, StandardFonts, rgb } from '../lib/pdf-lib/pdf-lib.esm.min.js';

const W = 595.28, H = 841.89;
// y-Wert der n-ten Textzeile (Grundlinie)
const zeileY = n => 700 - n * 26;

// Zählt man mit beiden Händen, ist die Basis die Zahl aller Finger: Mensch 5+5, Ratte 4+4, Faultier 3+3, Panda 6+6.
const TABELLE = {
  kopf: ['Zahl', 'Mensch (10)', 'Ratte (8)', 'Faultier (6)', 'Panda (12)'],
  zeilen: [
    ['7', '7', '7', '11', '7'],
    ['8', '8', '10', '12', '8'],
    ['10', '10', '12', '14', 'A'],
    ['12', '12', '14', '20', '10'],
    ['15', '15', '17', '23', '13'],
    ['20', '20', '24', '32', '18'],
  ],
  x: [56, 140, 252, 346, 452],
  y: zeileY(2), zeilenhoehe: 26,
};

const SEITEN = [
  { titel: 'Zahlensysteme im Tierreich', zeilen: [
    'Wir zählen im Zehnersystem, weil wir zehn Finger haben: beide Hände.',
    'Fünf Finger je Hand, zwei Hände ergeben eine volle Zehnerstelle.',
    'Tiere zählen nicht, aber was wäre, wenn sie es täten?',
    'Ratte: 4 Finger je Vorderpfote, zusammen 8 – das Achtersystem.',
    'Faultier: 3 Finger je Hand, zusammen 6 – das Sechsersystem.',
    'Panda: 5 Finger + „falscher Daumen“ = 6 je Pfote, 12 – das Zwölfersystem.',
    'Die Basis ist die Zahl aller Finger beider Hände.',
  ] },
  { titel: 'Zahlen im Vergleich', zeilen: [
    'Dieselbe Menge, vier Schreibweisen:',
    'Beim Panda stehen A und B für zehn und elf.',
  ], tabelle: TABELLE },
  { titel: 'Zwölf in unserem Alltag', zeilen: [
    'Mit dem Daumen lassen sich die 12 Fingerglieder einer Hand abzählen.',
    'Die andere Hand merkt sich die Zwölferpäckchen: 5 × 12 = 60.',
    'Das passt zu 12 Monaten, 2 × 12 Stunden, 60 Minuten und 360 Grad.',
    'Auch Dutzend und Gros sind Zwölfer.',
    'Ob dies der Ursprung ist, gilt als Vermutung, nicht als bewiesen.',
    'In Teilen Asiens wird so bis heute gezählt.',
  ] },
];

export async function createDemoPdf() {
  const doc = await PDFDocument.create();
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const norm = await doc.embedFont(StandardFonts.Helvetica);
  for (const s of SEITEN) {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: rgb(0.1, 0.35, 0.33) });
    page.drawText('Referat Mathematik · Klasse 8b', { x: 56, y: H - 60, size: 11, font: norm, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(s.titel, { x: 56, y: H - 110, size: 26, font: fett, color: rgb(0.09, 0.19, 0.3) });
    // Mit Tabelle stehen die beiden Textzeilen oberhalb bzw. unterhalb davon.
    s.zeilen.forEach((z, i) => page.drawText(z, { x: 56, y: s.tabelle && i ? zeileY(2) - 26 * (s.tabelle.zeilen.length + 2) : zeileY(i), size: 12.5, font: norm, color: rgb(0.1, 0.1, 0.1) }));
    if (s.tabelle) {
      const t = s.tabelle;
      page.drawRectangle({ x: 50, y: t.y - 8, width: 495, height: t.zeilenhoehe, color: rgb(0.88, 0.93, 0.92) });
      t.kopf.forEach((k, c) => page.drawText(k, { x: t.x[c], y: t.y, size: 12, font: fett, color: rgb(0.09, 0.19, 0.3) }));
      t.zeilen.forEach((r, i) => {
        const y = t.y - t.zeilenhoehe * (i + 1);
        page.drawLine({ start: { x: 50, y: y + 17 }, end: { x: 545, y: y + 17 }, thickness: 0.6, color: rgb(0.75, 0.78, 0.8) });
        r.forEach((v, c) => page.drawText(v, { x: t.x[c], y, size: 12.5, font: c ? norm : fett, color: rgb(0.1, 0.1, 0.1) }));
      });
    }
  }
  return doc.save();
}

const quad = (x0, y0, x1, y1) => [x0, y1, x1, y1, x0, y0, x1, y0];
const kommentar = (id, kind, extra) => ({ id, kind, color: '#facc15', text: '', author: 'Frau Becker', date: '2026-10-12T09:30:00.000Z', replies: [], ...extra });

/** Zeichnungen und Kommentare je Seite (Index wie in SEITEN). */
export function demoDecor() {
  const z = zeileY, t = TABELLE;
  const zeile12 = t.y - t.zeilenhoehe * 4;   // Zeile „12“ der Tabelle
  return [
    {
      marks: [
        { id: 'd1', type: 'ink', color: '#fde047', width: 15, opacity: 0.45, blend: 'multiply', points: [56, z(4) + 4, 410, z(4) + 4] },
        { id: 'd2', type: 'ellipse', color: '#dc2626', width: 2.2, points: [50, z(6) - 8, 360, z(6) + 14] },
        { id: 'd3', type: 'arrow', color: '#2563eb', width: 2.5, points: [470, z(6) + 55, 372, z(6) + 12] },
      ],
      comments: [
        kommentar('c1', 'highlight', { rect: [56, z(5) - 3, 470, z(5) + 12], quads: quad(56, z(5) - 3, 470, z(5) + 12), text: 'Der falsche Daumen ist ein umgebauter Handwurzelknochen.' }),
        kommentar('c2', 'note', { color: '#facc15', rect: [535, z(2) + 6, 553, z(2) + 24], text: 'Stimmt das für alle Faultierarten?' }),
      ],
    },
    {
      marks: [{ id: 'd4', type: 'rect', color: '#16a34a', width: 2.2, points: [48, zeile12 - 8, 548, zeile12 + 17] }],
      comments: [kommentar('c3', 'note', { color: '#38bdf8', rect: [552, t.y - 2, 570, t.y + 16], text: 'Warum sieht die 12 beim Panda aus wie eine 10?' })],
    },
    {
      marks: [
        { id: 'd5', type: 'ink', color: '#fde047', width: 15, opacity: 0.45, blend: 'multiply', points: [56, z(2) + 4, 440, z(2) + 4] },
        { id: 'd6', type: 'rect', color: '#dc2626', width: 2, points: [50, z(4) - 7, 420, z(4) + 16] },
      ],
      comments: [kommentar('c4', 'note', { color: '#38bdf8', rect: [420, z(3) + 4, 438, z(3) + 22], text: 'Quelle zur Vermutung (Georges Ifrah) ergänzen.' })],
    },
  ];
}
