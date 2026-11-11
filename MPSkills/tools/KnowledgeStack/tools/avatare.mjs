/**
 * Profilbilder der 40 Wesen neu rendern — aus creatures.js, damit die
 * Bilder im Profil dieselben Wesen zeigen wie das Quiz.
 *
 * Schreibt nach „avatare MPSkills/KnowlegeStack/“ je Wesen zwei Dateien
 * (256 × 256, durchsichtig):
 *     NN_Name_avatar.png        Farbe 1, Kopf groß im Bild, Ruhe
 *     NN_Name_gold_avatar.png   dasselbe Bild in Gold (Platz 1)
 * Die Dateinamen stehen in avatars.js (MPS_CATALOG.mps_knowledgestack)
 * und dürfen sich nicht ändern.
 *
 * Aufruf (braucht Playwright mit Chromium):
 *     node MPSkills/tools/KnowledgeStack/tools/avatare.mjs
 *     node …/avatare.mjs 6 37        nur einzelne Wesen
 *
 * Nach einer Änderung an einer Zeichnung in creatures.js neu laufen
 * lassen — sonst zeigt das Profil das alte Wesen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(DIR, '../../../avatare MPSkills/KnowlegeStack');
const PX = 256;

/* Bei diesen Wesen ist der „Kopf“ des Skeletts nur ein Teil der Figur
   (Schneckenkopf, Truhendeckel, Krabbe ohne Tasse) — da kommt die
   ganze Figur ins Bild. */
const GANZ = new Set([16, 28, 31]);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(DIR, 'creatures.css'))}">
<style>
  html, body { margin: 0; background: transparent; }
  #b { width: ${PX}px; height: ${PX}px; overflow: hidden; }
  #b svg { width: ${PX}px; height: ${PX}px; display: block; overflow: hidden !important; }
  /* Standbild: nichts bewegt sich, nichts Flüchtiges im Bild */
  #b * { animation: none !important; transition: none !important; }
  #b .cr-shadow, #b .cr-ov, #b .bubble, #b .steam, #b .q-sweat, #b .zap, #b .q-spark,
  #b .rainfx, #b .speed, #b .ringfx, #b .thread, #b .tw { display: none !important; }
  #b .pulse { opacity: .22; }
  #b .gum { opacity: 1; }
</style></head><body><div id="b"></div>
<script src="${pathToFileURL(path.join(DIR, 'creatures.js'))}"></script></body></html>`;

const nur = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
const tmp = path.join(OUT, '.avatare-tmp.html');
fs.writeFileSync(tmp, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: PX, height: PX }, deviceScaleFactor: 1 });
  page.on('pageerror', e => { throw e; });
  await page.goto(pathToFileURL(tmp).href);
  const liste = await page.evaluate(() => window.KSCreatures.list.map(c => ({ id: c.id, name: c.name })));

  for (const c of liste) {
    if (nur.length && !nur.includes(c.id)) continue;
    await page.evaluate(({ id, ganz }) => {
      const b = document.getElementById('b');
      b.innerHTML = window.KSCreatures.svg(id, 0, 'c-idle');
      const svg = b.querySelector('svg');
      const box = svg.querySelector(ganz ? '.cr-root' : '.head-node').getBBox();
      /* Quadrat um den Kopf, mit etwas Luft; nie kleiner als 58 und
         nie größer als das ganze Bild. */
      const s = Math.min(104, Math.max(58, Math.max(box.width, box.height) * 1.16));
      let x = box.x + box.width / 2 - s / 2, y = box.y + box.height / 2 - s / 2;
      x = Math.max(-4, Math.min(104 - s, x)); y = Math.max(-4, Math.min(100 - s, y));
      svg.setAttribute('viewBox', x + ' ' + y + ' ' + s + ' ' + s);
    }, { id: c.id, ganz: GANZ.has(c.id) });
    await page.evaluate(() => document.fonts.ready);

    const nn = String(c.id).padStart(2, '0');
    const datei = path.join(OUT, nn + '_' + c.name + '_avatar.png');
    const el = await page.$('#b');
    const png = await el.screenshot({ omitBackground: true });
    fs.writeFileSync(datei, png);

    /* Gold: Helligkeit des Bilds auf einen Goldverlauf legen (dunkle
       Linie → Braun, Mitte → Gold, hell → Creme), dazu ein Glanzstern. */
    const gold = await page.evaluate(async ({ data, PX }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = data; });
      const cv = document.createElement('canvas'); cv.width = cv.height = PX;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, PX, PX), a = d.data;
      const stops = [[0, 74, 46, 16], [0.3, 150, 96, 22], [0.55, 226, 164, 36], [0.8, 252, 214, 92], [1, 255, 247, 210]];
      for (let i = 0; i < a.length; i += 4) {
        if (!a[i + 3]) continue;
        const l = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255;
        let k = 1; while (k < stops.length - 1 && l > stops[k][0]) k++;
        const p = stops[k - 1], q = stops[k], t = Math.max(0, Math.min(1, (l - p[0]) / (q[0] - p[0])));
        a[i] = p[1] + (q[1] - p[1]) * t; a[i + 1] = p[2] + (q[2] - p[2]) * t; a[i + 2] = p[3] + (q[3] - p[3]) * t;
      }
      g.putImageData(d, 0, 0);
      const stern = (x, y, s) => {
        g.beginPath();
        g.moveTo(x, y - s); g.quadraticCurveTo(x + s * 0.18, y - s * 0.18, x + s, y);
        g.quadraticCurveTo(x + s * 0.18, y + s * 0.18, x, y + s); g.quadraticCurveTo(x - s * 0.18, y + s * 0.18, x - s, y);
        g.quadraticCurveTo(x - s * 0.18, y - s * 0.18, x, y - s); g.closePath();
        g.fillStyle = '#fffdf0'; g.strokeStyle = 'rgba(120,80,10,.55)'; g.lineWidth = 1.5; g.fill(); g.stroke();
      };
      stern(212, 44, 17); stern(232, 70, 7);
      return cv.toDataURL('image/png');
    }, { data: 'data:image/png;base64,' + png.toString('base64'), PX });
    fs.writeFileSync(datei.replace(/_avatar\.png$/, '_gold_avatar.png'), Buffer.from(gold.split(',')[1], 'base64'));
    console.log('ok', nn, c.name);
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
