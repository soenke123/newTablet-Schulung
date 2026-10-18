/**
 * Beispieldokument für die Vorschau auf der MPSkills-Startseite (?demo=1): ein erfundenes Referat über Lemuren mit drei Seiten,
 * dazu ein paar Zeichnungen und Kommentare. Alles entsteht im Speicher; es wird nichts geladen und nichts gespeichert.
 * Die Koordinaten der Markierungen passen zu den Textzeilen unten (PDF-Punkte, Ursprung links unten).
 */
import { PDFDocument, StandardFonts, rgb } from '../lib/pdf-lib/pdf-lib.esm.min.js';

const W = 595.28, H = 841.89;
const SEITEN = [
  { titel: 'Lemuren auf Madagaskar', zeilen: [
    'Lemuren sind Halbaffen und leben in freier Natur nur auf Madagaskar.',
    'Dort hat sich über Millionen von Jahren eine einzigartige Vielfalt entwickelt:',
    'mehr als 100 Arten, vom winzigen Mausmaki bis zum Indri.',
    'Katta, Sifaka und Indri gehören zu den bekanntesten Arten.',
    'Doch ihr Lebensraum schrumpft: Über 80 % des Waldes sind schon weg.',
    'Brandrodung und Holzkohle für Felder und Feuerholz zerstören den Wald.',
    'Ohne Wald verlieren die Lemuren Nahrung, Schlafplätze und Schutz.',
  ] },
  { titel: 'Verhalten', zeilen: [
    'Katta: Sonnenbad am Morgen, Ringelschwanz als Signal, Weibchen führen.',
    'Sifaka: springt aufrecht seitwärts von Baum zu Baum, am Boden „tanzend“.',
    'Indri: größter Lemur, sein Gesang ist kilometerweit zu hören.',
    'Alle leben in Gruppen und markieren ihr Revier mit Duftstoffen.',
    'Schutzgebiete und Aufforstung geben den Tieren Raum zurück.',
  ] },
  { titel: 'Was wir tun können', zeilen: [
    'Regenwald-Projekte in Madagaskar unterstützen',
    'Tropenholz und Palmöl bewusst einkaufen',
    'Aufforstung und Schutzgebiete mit Spenden fördern',
    'Anderen von den Lemuren erzählen',
    'Eigene Recherche: Wo leben Katta, Sifaka und Indri?',
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
    page.drawText('Referat Biologie · Klasse 8b', { x: 56, y: H - 60, size: 11, font: norm, color: rgb(0.4, 0.4, 0.4) });
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
        { id: 'd2', type: 'ellipse', color: '#dc2626', width: 2.2, points: [50, z(6) - 8, 448, z(6) + 14] },
        { id: 'd3', type: 'arrow', color: '#2563eb', width: 2.5, points: [535, z(6) + 60, 480, z(6) + 18] },
      ],
      comments: [
        kommentar('c1', 'highlight', { rect: [56, z(5) - 3, 466, z(5) + 12], quads: quad(56, z(5) - 3, 466, z(5) + 12), text: 'Beispiele für Brandrodung suchen!' }),
        kommentar('c2', 'note', { color: '#facc15', rect: [535, z(2) + 6, 553, z(2) + 24], text: 'Quelle für die 80 % ergänzen?' }),
      ],
    },
    { marks: [{ id: 'd4', type: 'rect', color: '#16a34a', width: 2.2, points: [50, z(1) - 8, 520, z(1) + 17] }], comments: [] },
    { marks: [], comments: [kommentar('c3', 'note', { color: '#38bdf8', rect: [470, z(3) + 4, 488, z(3) + 22], text: 'Welche Organisation schützt den Indri?' })] },
  ];
}
