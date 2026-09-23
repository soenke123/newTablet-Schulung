/* Einzelprobe Überlauf — Aufruf: node probeueberlauf.js <breite>
   Beantwortet „WER genau ragt hier raus?".
   Gesucht wird der TIEFSTE Knoten, dessen Inhalt breiter ist als sein
   Kasten — bei `overflow: visible` malt der einfach darüber hinaus, ohne
   dass irgendein Element-Rechteck den Rand überschreitet. Genau deshalb
   greift der Rand-Test des Prüfstands hier nicht. */
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
const W = Number(process.argv[2] || 375);
const ctx = await browser.newContext({ viewport: { width: W, height: 800 }, hasTouch: true });
await ctx.route('**://cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({})},rpc:async()=>({data:null,error:null})})};' }));
await ctx.route('**/_vercel/**', r => r.abort());
await ctx.addInitScript(fs.readFileSync(path.join(HERE, '_stub.js'), 'utf8'));

const page = await ctx.newPage();
await page.goto(base + '/GameHub/index.html', { waitUntil: 'load' });
await page.waitForSelector('.game-card', { timeout: 10000 });
await page.waitForTimeout(1200);

const report = await page.evaluate(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const lbl = el => {
    const id = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className) ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const vis = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  /* A) Inhalt breiter als Kasten — unabhängig vom overflow-Modus.
        Nur die TIEFSTEN melden: ein überlaufendes Kind macht jeden
        Vorfahren mit-„schuldig". */
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const d = el.scrollWidth - el.clientWidth;
    if (d <= 1) continue;
    wide.push({ el, sel: lbl(el), by: d, cw: el.clientWidth, sw: el.scrollWidth, ov: getComputedStyle(el).overflowX });
  }
  const deepest = wide.filter(a => !wide.some(b => b !== a && a.el.contains(b.el)));

  /* B) Echte Tinte jenseits des rechten Rands — über Text-Ranges, damit
        auch ein einzelnes zu langes Wort auffindbar ist. */
  const ink = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (r.right > vw + 1 && r.width > 0) {
        ink.push({ sel: lbl(n.parentElement), over: Math.round(r.right - vw), text: n.nodeValue.trim().slice(0, 44) });
      }
    }
  }

  /* C) Auch Grafik zählt: Bilder/SVG jenseits des Rands */
  const gfx = [];
  for (const el of document.querySelectorAll('img, svg, canvas')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) gfx.push({ sel: lbl(el), over: Math.round(r.right - vw), w: Math.round(r.width) });
  }

  /* D) Drilldown: WAS genau ragt in einer einzelnen Spielkachel über
        deren rechten Rand? Die Kachel selbst meldet auf jeder Größe ein
        paar Pixel Überhang — hier steht, von wem sie kommen. */
  const card = document.querySelector('.game-card');
  const cr = card?.getBoundingClientRect();
  const drill = !card ? [] : [...card.querySelectorAll('*')].map(el => {
    const r = el.getBoundingClientRect();
    return { sel: lbl(el), over: Math.round(r.right - cr.right), pos: getComputedStyle(el).position };
  }).filter(x => x.over > 0).sort((a, b) => b.over - a.over).slice(0, 5);

  return {
    drill,
    vw, scrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth,
    overflow: de.scrollWidth - de.clientWidth,
    deepest: deepest.map(({ sel, by, cw, sw, ov }) => ({ sel, by, cw, sw, ov })).sort((a, b) => b.by - a.by).slice(0, 15),
    ink: [...new Map(ink.map(i => [i.sel + i.text, i])).values()].sort((a, b) => b.over - a.over).slice(0, 12),
    gfx: gfx.sort((a, b) => b.over - a.over).slice(0, 10),
  };
});

console.log(`\nViewport ${report.vw}px · scrollWidth ${report.scrollW} · Überlauf ${report.overflow}px\n`);
console.log('── Inhalt breiter als sein Kasten (tiefste Knoten) ──');
for (const d of report.deepest) console.log(`  ${d.sel.padEnd(52)} +${d.by}px  (${d.cw}→${d.sw}, overflow-x: ${d.ov})`);
console.log('\n── Tinte jenseits des rechten Rands ──');
if (!report.ink.length) console.log('  keine');
for (const i of report.ink) console.log(`  ${i.sel.padEnd(40)} +${i.over}px  „${i.text}"`);
console.log('\n── Überhang in der ersten Spielkachel ──');
if (!report.drill.length) console.log('  keiner');
for (const d of report.drill) console.log(`  ${d.sel.padEnd(46)} +${d.over}px  (${d.pos})`);
console.log('\n── Grafik jenseits des rechten Rands ──');
if (!report.gfx.length) console.log('  keine');
for (const g of report.gfx) console.log(`  ${g.sel.padEnd(52)} +${g.over}px  (breit ${g.w})`);

await browser.close();
server.close();
