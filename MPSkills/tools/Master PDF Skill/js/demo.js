/**
 * Beispieldokument für die Vorschau auf der MPSkills-Startseite (?demo=1): ein erfundener Elternbrief mit drei Seiten,
 * dazu ein paar Zeichnungen und Kommentare. Alles entsteht im Speicher; es wird nichts geladen und nichts gespeichert.
 * Die Koordinaten der Markierungen passen zu den Textzeilen unten (PDF-Punkte, Ursprung links unten).
 */
import { PDFDocument, StandardFonts, rgb } from '../lib/pdf-lib/pdf-lib.esm.min.js';

const W = 595.28, H = 841.89;
const SEITEN = [
  { titel: 'Klassenfahrt nach Berlin', zeilen: [
    'Liebe Eltern der Klasse 8b,',
    'vom 12. bis 16. Mai fahren wir gemeinsam nach Berlin. Wir wohnen in der',
    'Jugendherberge am Wannsee und besuchen unter anderem den Bundestag,',
    'das Technikmuseum und die Gedenkstätte Berliner Mauer.',
    'Die Kosten betragen 245 Euro pro Schüler. Bitte überweisen Sie den',
    'Betrag bis zum 15. März auf das Schulkonto.',
    'Bitte geben Sie die Einverständniserklärung bis Freitag zurück.',
  ] },
  { titel: 'Zeitplan', zeilen: [
    'Montag      Anreise mit dem Zug, Check-in in der Jugendherberge',
    'Dienstag    Bundestag und Reichstagskuppel, Stadtrundfahrt',
    'Mittwoch    Technikmuseum, am Abend Freizeit',
    'Donnerstag  Gedenkstätte Berliner Mauer, Workshop',
    'Freitag     Rückreise, Ankunft gegen 18 Uhr',
  ] },
  { titel: 'Packliste', zeilen: [
    'Personalausweis oder Schülerausweis',
    'Regenjacke und bequeme Schuhe',
    'Hausschuhe und Handtuch',
    'Ladegerät für das Tablet',
    'Trinkflasche und kleines Frühstück für die Zugfahrt',
  ] },
];

// y-Wert der n-ten Textzeile (Grundlinie)
const zeileY = n => 700 - n * 26;

export async function createDemoPdf() {
  const doc = await PDFDocument.create();
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const norm = await doc.embedFont(StandardFonts.Helvetica);
  for (const s of SEITEN) {
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: rgb(0.1, 0.35, 0.33) });
    page.drawText('Max-Planck-Schule', { x: 56, y: H - 60, size: 11, font: norm, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(s.titel, { x: 56, y: H - 110, size: 26, font: fett, color: rgb(0.09, 0.19, 0.3) });
    s.zeilen.forEach((z, i) => page.drawText(z, { x: 56, y: zeileY(i), size: 12.5, font: norm, color: rgb(0.1, 0.1, 0.1) }));
  }
  return doc.save();
}

const quad = (x0, y0, x1, y1) => [x0, y1, x1, y1, x0, y0, x1, y0];
const kommentar = (id, kind, extra) => ({ id, kind, color: '#facc15', text: '', author: 'Frau Becker', date: '2026-10-12T09:30:00.000Z', replies: [], ...extra });

/** Zeichnungen und Kommentare je Seite (Index wie in SEITEN). */
export function demoDecor() {
  const z = zeileY;
  return [
    {
      marks: [
        { id: 'd1', type: 'ink', color: '#fde047', width: 15, opacity: 0.45, blend: 'multiply', points: [56, z(4) + 4, 505, z(4) + 4] },
        { id: 'd2', type: 'ellipse', color: '#dc2626', width: 2.2, points: [50, z(6) - 8, 395, z(6) + 14] },
        { id: 'd3', type: 'arrow', color: '#2563eb', width: 2.5, points: [520, z(6) + 60, 470, z(6) + 16] },
      ],
      comments: [
        kommentar('c1', 'highlight', { rect: [56, z(5) - 3, 300, z(5) + 12], quads: quad(56, z(5) - 3, 300, z(5) + 12), text: 'Frist im Kalender eintragen!' }),
        kommentar('c2', 'note', { color: '#facc15', rect: [535, z(2) + 6, 553, z(2) + 24], text: 'Wer begleitet uns als zweite Lehrkraft?' }),
      ],
    },
    { marks: [{ id: 'd4', type: 'rect', color: '#16a34a', width: 2.2, points: [50, z(1) - 8, 520, z(1) + 17] }], comments: [] },
    { marks: [], comments: [kommentar('c3', 'note', { color: '#38bdf8', rect: [470, z(3) + 4, 488, z(3) + 22], text: 'Ladegerät nicht vergessen.' })] },
  ];
}
