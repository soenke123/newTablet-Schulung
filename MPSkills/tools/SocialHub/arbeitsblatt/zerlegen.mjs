/* Zerlegt Sönkes PDF (aus Word gespeichert) in die Bausteine fürs Arbeitsmaterial.
   Seit 09.11.2026 ist Sönkes Word-Datei das Original: seine Umbrüche, sein PDF.

     node MPSkills/tools/SocialHub/arbeitsblatt/zerlegen.mjs <Skript.pdf> [<Skript.docx>]

   - kopiert Skript (PDF, Word) nach ../material/
   - sucht je Teil seine Überschrift (TEILE.kopf) und schneidet dort; Teile von
     Kapitel II müssen oben auf einer Seite beginnen, sonst bricht es ab
   - Kapitel I als Stände: beginnt ein Teil mitten auf einer Seite (2.1 unter I.2),
     deckt der Stand davor diese Seite ab der Überschrift weiß ab
   - deckt in allen Teilen die alte Seitenzahl ab (die Seite stempelt neu)
   - schreibt ../material/material.json
   Braucht pdftotext (poppler). Das Lösungsheft-PDF macht weiter build.mjs. */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { TEILE, STUFEN } from './inhalt.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MAT = HERE + '../material/';
const [SRC, DOCX] = process.argv.slice(2);
if (!SRC) { console.error('Aufruf: node zerlegen.mjs <Skript.pdf> [<Skript.docx>]'); process.exit(1); }
const { PDFDocument, rgb } = await import(pathToFileURL(HERE + '../../Master PDF Skill/lib/pdf-lib/pdf-lib.esm.min.js').href);

// Überschrift, an der jeder Teil beginnt
const KOPF = {
  'I-1': 'I. Begriffe rund um die Datenwelt', 'I-2': '2.1 Primärschlüssel', 'I-3': '2.2 Fremdschlüssel', 'I-4': '2.4 n-zu-m-Kardinalität',
  'II-1': 'II. SQL (Structured Query Language)', 'II-1b': '1.3 Selektion', 'II-2': '2. Photos und Comments', 'II-3': '3. Tags, Follows und Likes',
  'II-4': '4. Tiefer in SQL', 'II-5': '5. Alles zusammen', 'II-6': '6. Datenbankinhalte ändern', 'II-7': '7. Analytics', 'II-8': '8. Werbung'
};

// Zeilen je Seite mit Höhe (pdftotext -bbox-layout)
const xml = execFileSync('pdftotext', ['-bbox-layout', SRC, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const pages = [];
for (const pg of xml.split('<page ').slice(1)) {
  const lines = [];
  for (const m of pg.matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)) {
    const t = [...m[5].matchAll(/<word[^>]*>([^<]*)<\/word>/g)].map(w => w[1]).join(' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    lines.push({ y: +m[2], t });
  }
  pages.push(lines);
}
const textTop = Math.min(...pages.slice(1).map(l => Math.min(...l.map(x => x.y))));   // oberste Textzeile einer Seite

const start = {};
for (const t of TEILE) {
  const k = KOPF[t.id];
  let hit = null;
  pages.forEach((lines, i) => { if (hit || i === 0) return; const l = lines.find(x => x.t.startsWith(k)); if (l) hit = { page: i, y: l.y }; });
  if (!hit) { console.error('Überschrift nicht gefunden: „' + k + '“ (' + t.id + ')'); process.exit(1); }
  hit.top = hit.y - textTop < 6;
  start[t.id] = hit;
}
const ids = TEILE.map(t => t.id);
for (const t of TEILE) if (t.kap === 'II' && !start[t.id].top) {
  console.error('„' + KOPF[t.id] + '“ beginnt mitten auf Seite ' + (start[t.id].page + 1) + ' – davor fehlt ein Seitenumbruch.'); process.exit(1);
}

const src = await PDFDocument.load(readFileSync(SRC));
const W = src.getPage(0).getWidth(), H = src.getPage(0).getHeight();
// Seitenzahl unten rechts finden (letztes Wort in der Fußzeile, nur Ziffern) – einmal messen, für alle gleich
const foot = execFileSync('pdftotext', ['-f', '2', '-l', '2', '-bbox', SRC, '-'], { encoding: 'utf8' });
const nums = [...foot.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(\d+)<\/word>/g)].filter(m => +m[2] > H - 70);
if (!nums.length) { console.error('Seitenzahl unten nicht gefunden'); process.exit(1); }
const N = nums[nums.length - 1];
const numBox = { x: +N[1] - 14, y: H - +N[4] - 2, w: (+N[3] - +N[1]) + 18, h: (+N[4] - +N[2]) + 4 };
const numAt = { right: +N[3], base: H - +N[4] + 1.8 };
const footLine = Math.min(...pages[1].filter(l => l.y > H - 80).map(l => l.y)) - 14;   // Oberkante Fußzeile (mit Linie)

async function part(pageIdx, cut) {   // cut = { page, y }: ab y auf dieser Seite weiß
  const out = await PDFDocument.create();
  const cp = await out.copyPages(src, pageIdx);
  cp.forEach((p, i) => {
    out.addPage(p);
    p.drawRectangle({ x: numBox.x, y: numBox.y, width: numBox.w, height: numBox.h, color: rgb(1, 1, 1) });
    if (cut && pageIdx[i] === cut.page) {
      const yTop = H - (cut.y - 4);
      p.drawRectangle({ x: 0, y: H - footLine, width: W, height: yTop - (H - footLine), color: rgb(1, 1, 1) });
    }
  });
  return out.save();
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

rmSync(MAT + 'teile', { recursive: true, force: true });
mkdirSync(MAT + 'teile', { recursive: true });
copyFileSync(SRC, MAT + 'Datenbanksysteme.pdf');
if (DOCX) copyFileSync(DOCX, MAT + 'Datenbanksysteme.docx');
writeFileSync(MAT + 'teile/deckblatt.pdf', await part([0]));

const IT = TEILE.filter(t => t.kap === 'I'), IIT = TEILE.filter(t => t.kap === 'II');
const staende = [];
for (let k = 0; k < IT.length; k++) {
  const next = start[ids[ids.indexOf(IT[k].id) + 1]];
  const last = next.top ? next.page - 1 : next.page;
  const pg = range(start[IT[0].id].page, last);
  writeFileSync(MAT + 'teile/I-stand' + (k + 1) + '.pdf', await part(pg, next.top ? null : next));
  staende.push({ id: IT[k].id, label: IT[k].label, datei: 'teile/I-stand' + (k + 1) + '.pdf', seiten: pg.length });
}
const teile = [];
for (const t of IIT) {
  const i = ids.indexOf(t.id), next = start[ids[i + 1]];
  const pg = range(start[t.id].page, next ? next.page - 1 : src.getPageCount() - 1);
  writeFileSync(MAT + 'teile/' + t.id + '.pdf', await part(pg));
  teile.push({ ...t, datei: 'teile/' + t.id + '.pdf', seiten: pg.length });
}
const old = (() => { try { return JSON.parse(readFileSync(MAT + 'material.json', 'utf8')); } catch (e) { return {}; } })();
const manifest = {
  titel: 'Datenbanksysteme', untertitel: 'Relationale Datenbanken und SQL – mit YourSozialNet',
  erstellt: new Date().toISOString().slice(0, 10),
  dateien: { word: 'Datenbanksysteme.docx', pdf: 'Datenbanksysteme.pdf' },
  loesungen: old.loesungen || 'Datenbanksysteme_Loesungen.pdf',
  deckblatt: 'teile/deckblatt.pdf',
  seitenzahl: numAt,
  staende, teile, stufen: STUFEN,
  version: Date.now().toString(36)
};
writeFileSync(MAT + 'material.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Seiten:', staende.map(s => s.id + '=' + s.seiten).join(' '), '|', teile.map(s => s.id + '=' + s.seiten).join(' '));
console.log('Schnitt Kapitel I:', IT.map(t => t.id + '@S.' + (start[t.id].page + 1) + (start[t.id].top ? '' : '(mitten)')).join(' '));
