/* Prüft die Behauptung: beim Drehen vom Quer- ins Hochformat bleiben
   STEHENDE Galerie-Tiere an ihrem alten Platz und verschwinden hinter
   dem `overflow:hidden` der Leiste.
   Grund laut Code: initGalleryWalk() läuft nur einmal (kein resize-
   Listener), und _walkStep klemmt die Position jeden Frame neu ein —
   aber erst NACH `if (w.stationary) continue;`. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE = 'C:/Users/snke/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = await new Promise(ok => {
  const s = http.createServer((req, res) => {
    let f = path.join(HERE, decodeURIComponent(req.url.split('?')[0]));
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }
    catch { res.writeHead(404).end(); }
  });
  s.listen(0, '127.0.0.1', () => ok(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},rpc:async()=>({data:null,error:null})})};' }));
await ctx.route('**/_vercel/**', r => r.abort());
await ctx.addInitScript({ path: path.join(HERE, '_stub.js') });

const page = await ctx.newPage();
await page.goto(base + '/GameHub/index.html', { waitUntil: 'load' });
await page.waitForSelector('.gallery-walker', { timeout: 10000 });
await page.waitForTimeout(1500);

const snap = () => page.evaluate(() => {
  const bar = document.getElementById('galleryBar');
  const bw = bar.clientWidth;
  const ws = [...document.querySelectorAll('.gallery-walker')].map(el => {
    const r = el.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    return {
      stationary: (el.querySelector('.creature-img')?.dataset.stage|0)===0,
      left: Math.round(parseFloat(el.style.left) || 0),
      // offsetWidth, nicht das Rechteck: der Code selbst rechnet damit,
      // und ein Rechteck kann mitten im Umbruch einen Zwischenwert liefern.
      w: el.offsetWidth,
      // Wie weit ragt das Tier über den rechten Rand SEINER Leiste?
      over: Math.round(r.right - br.right),
    };
  });
  return { barW: bw, walkerW: ws[0]?.w ?? 0, ws };
});

const before = await snap();
console.log(`\nQuerformat 1024px · Leiste ${before.barW}px · Läufer ${before.walkerW}px`);
console.log(`  Positionen: ${before.ws.map(w => w.left + (w.stationary?"(steht)":"")).join(", ")}`);
console.log(`  davon jenseits des Leistenrands: ${before.ws.filter(w => w.over > 1).length}`);

// Drehen ins Hochformat
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(1800);   // Zeit für etwaige resize-Reaktion + viele Frames

const after = await snap();
console.log(`\nHochformat 768px · Leiste ${after.barW}px · Läufer ${after.walkerW}px`);
console.log(`  Positionen: ${after.ws.map(w => w.left + (w.stationary?"(steht)":"")).join(", ")}`);
const stuck = after.ws.filter(w => w.over > 1);
console.log(`  davon jenseits des Leistenrands: ${stuck.length}`);
if (stuck.length) {
  for (const s of stuck) console.log(`    left=${s.left}px ragt ${s.over}px über die Leiste → abgeschnitten`);
  console.log('\n  ⇒ BESTÄTIGT: stehende Tiere werden beim Drehen nicht neu eingeklemmt.');
} else {
  console.log('\n  ⇒ NICHT bestätigt: alle Tiere sind nach dem Drehen im Rahmen.');
}

const maxX = after.barW - after.walkerW;
console.log(`\n  (erlaubtes Maximum wäre left = ${maxX}px)`);

await page.screenshot({ path: path.join(HERE, 'shots', 'galerie-nach-drehung.png'), clip: { x: 0, y: 0, width: 768, height: 420 } });
await browser.close();
server.close();
