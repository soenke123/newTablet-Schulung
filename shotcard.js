/* Nahaufnahme einer einzelnen Kachel — für Befunde, die im
   Gesamtbild zu klein sind. Aufruf: node shotcard.js <breite> <spieltitel> */
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

const W = Number(process.argv[2] || 375);
const NEEDLE = process.argv[3] || 'Projekt_FINAL';
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, hasTouch: true });
await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},rpc:async()=>({data:null,error:null})})};' }));
await ctx.route('**/_vercel/**', r => r.abort());
await ctx.addInitScript({ path: path.join(HERE, '_stub.js') });

const page = await ctx.newPage();
await page.goto(base + '/GameHub/index.html', { waitUntil: 'load' });
await page.waitForSelector('.game-card', { timeout: 10000 });
await page.waitForTimeout(1200);

// Season-1-Abschnitt aufklappen ist nicht nötig — alle Kacheln sind im DOM.
const box = await page.evaluate((needle) => {
  const card = [...document.querySelectorAll('.game-card')]
    .find(c => c.textContent.includes(needle));
  if (!card) return null;
  card.scrollIntoView({ block: 'center' });
  const r = card.getBoundingClientRect();
  // clip rechnet in SEITEN-Koordinaten, getBoundingClientRect in
  // Sichtfeld-Koordinaten — ohne scrollY landet der Ausschnitt im Nichts.
  return { y: Math.max(0, r.top + window.scrollY - 20), height: r.height + 40 };
}, NEEDLE);

if (!box) { console.log('Kachel „' + NEEDLE + '" nicht gefunden'); }
else {
  await page.waitForTimeout(400);
  const out = path.join(HERE, 'shots', `card-${NEEDLE.replace(/\W+/g, '')}-${W}.png`);
  // Ganzen Streifen inkl. Seitenrand zeigen, damit sichtbar wird, WIE weit
  // der Text über den Rand hinausläuft.
  await page.screenshot({ path: out, fullPage: true, clip: { x: 0, y: box.y, width: W, height: box.height } });
  console.log('→ ' + out);
}

await browser.close();
server.close();
