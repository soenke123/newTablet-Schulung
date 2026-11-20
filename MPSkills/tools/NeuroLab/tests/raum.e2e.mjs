// Browser-Prüfstand für NeuroLab (Playwright, ohne Server-Datenbank).
//   node MPSkills/tools/NeuroLab/tests/raum.e2e.mjs        (FOTOS=1 legt Bilder in tests/fotos/ ab, nicht einchecken)
// Prüft: Freigaben im Raum (Lehrkraft teilt → nl:parts, Klasse sieht nur Geteiltes),
// Andocken per Ziehen und per Antippen, Testen mit Wertetabelle, Training bis zum Ziel,
// Zeitlupe, Druckansicht, und den Ablauf des Schaufensters (preview/neurolab.js).
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')); }

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const FOTOS = process.env.FOTOS ? path.join(here, 'fotos') : null;
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };

// Wirt-Seite: spielt tool.js — antwortet auf nl:ready mit den Freigaben, merkt sich nl:parts.
const HOST = (rolle, parts) => `<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="f" src="/MPSkills/tools/NeuroLab/index.html?raum=${rolle}" style="width:1280px;height:800px;border:0"></iframe>
<script>
  window.sent = []; let parts = ${JSON.stringify(parts)};
  const f = document.getElementById('f');
  window.push = (p) => { parts = p; f.contentWindow.postMessage({ type: 'nl:cmd', parts }, location.origin); };
  addEventListener('message', e => {
    if (e.data.type === 'nl:ready') push(parts);
    if (e.data.type === 'nl:parts') { window.sent.push(e.data.parts); push(e.data.parts); }
  });
</script>`;

const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/host') {
    r.writeHead(200, { 'content-type': 'text/html' });
    r.end(HOST(u.searchParams.get('rolle'), JSON.parse(u.searchParams.get('parts') || 'null')));
    return;
  }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(r);
}).listen(0);
const BASE = 'http://localhost:' + srv.address().port;

let fail = 0;
const ok = (c, m) => { if (c) console.log('✓', m); else { fail++; console.log('✗', m); } };
const b = await chromium.launch();
const errs = [];
async function page(vp) {
  const pg = await b.newPage({ viewport: vp || { width: 1280, height: 820 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  return pg;
}
const shot = async (pg, n) => { if (FOTOS) await pg.screenshot({ path: path.join(FOTOS, n + '.png') }); };

/* 1. Klasse: nur geteilte Bereiche/Kacheln */
{
  const pg = await page();
  await pg.goto(BASE + '/host?rolle=schueler&parts=' + encodeURIComponent(JSON.stringify(['neuron', 'n1', 'n2', 'bauen', 'b-xor'])));
  const fr = pg.frameLocator('#f');
  await fr.locator('.tile[data-id="n1"]').waitFor();
  ok(await fr.locator('.area').count() === 2, 'Klasse sieht nur die zwei geteilten Bereiche');
  ok(await fr.locator('.tile.locked').count() === 4 + 9, 'nicht geteilte Kacheln sind gesperrt');
  ok(await fr.locator('.share').count() === 0, 'Klasse sieht keine Teilen-Knöpfe');
  await pg.evaluate(() => push(['neuron', 'n1']));
  await pg.waitForTimeout(150);
  ok(await fr.locator('.area').count() === 1, 'Entziehen wirkt sofort');
  await pg.evaluate(() => push([]));
  await pg.waitForTimeout(150);
  ok(await fr.locator('#wait').isVisible(), 'ohne Freigabe: Wartehinweis');
  await shot(pg, 'klasse');
  await pg.close();
}

/* 2. Lehrkraft teilt */
{
  const pg = await page();
  await pg.goto(BASE + '/host?rolle=lehrer&parts=null');
  const fr = pg.frameLocator('#f');
  await fr.locator('.tile[data-id="b-xor"]').waitFor();
  await fr.locator('.area').nth(1).locator('.area-tools .share').click();
  await pg.waitForTimeout(150);
  const sent = await pg.evaluate(() => window.sent);
  ok(sent.length === 1 && sent[0].includes('bauen') && sent[0].includes('b-xor'), 'Bereich teilen nimmt seine Kacheln mit');
  await fr.locator('.tile[data-id="b-xor"] .share').click();
  await pg.waitForTimeout(150);
  const s2 = await pg.evaluate(() => window.sent.at(-1));
  ok(!s2.includes('b-xor') && s2.includes('bauen'), 'einzelne Kachel entziehen');
  await fr.locator('.tile[data-id="b-xor"] .info-i').click();
  ok(await fr.locator('#dlg[open]').isVisible(), 'Lehrkraft-Info („i“) öffnet sich');
  await pg.close();
}

/* 3. Bauen: Andocken, Testen */
const pg = await page();
await pg.goto(BASE + '/MPSkills/tools/NeuroLab/index.html?demo=1');
await pg.evaluate(() => NL.openScenario('b-gatter', false));
async function drag(a, z) {
  const A = await a.boundingBox(), B = await z.boundingBox();
  await pg.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await pg.mouse.down();
  await pg.mouse.move(A.x + 50, A.y + 20, { steps: 4 }); await pg.mouse.move(B.x + B.width / 2, B.y + B.height / 2, { steps: 8 });
  await pg.mouse.up(); await pg.waitForTimeout(120);
}
await pg.evaluate(() => { NL.ws.net.outputs.forEach(o => { o.src = null; }); NL.refresh(); });
await drag((await pg.$$('.knob-hit'))[2], (await pg.$$('.slot .sbody'))[0]);
await (await pg.$$('.knob-hit'))[0].click();
await (await pg.$$('.slot .sbody'))[1].click({ force: true });
await drag((await pg.$$('.knob-hit'))[1], (await pg.$$('.slot .sbody'))[2]);
const src = await pg.evaluate(() => NL.ws.net.outputs.map(o => o.src && o.src.n));
ok(JSON.stringify(src) === '[2,0,1]', 'Andocken per Ziehen und per Antippen: ' + JSON.stringify(src));
await pg.click('#steps button[data-step="1"]');
await pg.waitForTimeout(200);
ok((await pg.textContent('.score')).startsWith('4 von 4'), 'Testen: Wertetabelle 4 von 4 (Neuronen in beliebiger Reihenfolge)');
await shot(pg, 'bauen-testen');

/* 4. Trainieren: Vogel in der Mitte, Zeitlupe */
await pg.evaluate(() => NL.openScenario('t-vogel2', false));
ok(await pg.isDisabled('#steps button[data-step="1"]') === false, 'Schaufenster startet fertig aufgebaut');
await pg.click('#steps button[data-step="1"]');
await pg.evaluate(() => { NL.ws.speed = 5; });
await pg.click('#train-go');
await pg.waitForFunction(() => parseInt(document.getElementById('stat-test')?.textContent || '0', 10) >= 93, null, { timeout: 15000 }).catch(() => {});
ok(parseInt(await pg.textContent('#stat-test'), 10) >= 93, 'Training erreicht das Ziel bei den Testvögeln');
await pg.click('#train-go');
await pg.click('#slow-btn');
ok(await pg.isVisible('#slow-next'), 'Zeitlupe zeigt den Lernschritt');
await pg.click('#slow-next');
ok((await pg.textContent('.slow h3')).includes('Schritt 2'), 'Zeitlupe wendet die Änderung an');
await shot(pg, 'trainieren');

/* 5. Druckansicht */
await pg.click('#btn-print');
ok(await pg.isVisible('#print-sheet svg'), 'Druckansicht zeigt das Netz');
await pg.selectOption('#print-opts select[data-k="weights"]', 'gap');
ok((await pg.textContent('#print-sheet')).includes('____'), 'Gewichte als Lücken');
await shot(pg, 'druck');
await pg.click('#pr-close');

/* 6. Das Neuron: Station 5 lösen */
await pg.evaluate(() => NL.openNeuron('n5'));
await pg.evaluate(() => {
  const r = document.querySelectorAll('#st-card input[type=range]');
  const set = (i, v) => { r[i].value = v; r[i].dispatchEvent(new Event('input')); };
  set(0, 1); set(1, 1); set(2, -1.5);
});
ok(await pg.isVisible('.st-task.ok'), 'Station 5: Gerade trennt alle Punkte → ✓');
await shot(pg, 'neuron');

/* 7. Schmal (Tablet hochkant) */
const pt = await page({ width: 768, height: 1024 });
await pt.goto(BASE + '/MPSkills/tools/NeuroLab/index.html?demo=1');
await pt.evaluate(() => NL.openScenario('t-vogel3d', false));
const over = await pt.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok(!over, 'hochkant kein seitliches Scrollen');
await shot(pt, 'hochkant');

ok(errs.length === 0, 'keine Fehler in der Konsole' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
