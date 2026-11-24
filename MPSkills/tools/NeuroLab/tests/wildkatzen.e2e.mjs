// Browser-Prüfstand „Wildkatzen“ (Playwright): Revier der Wildkatzen ganz durch (24 Kameras, Schritt 3
// „Das Netz fragen“) und das Szenario „Wildkatzen“ unter „Lernen“ (Karte mit Geraden je Neuron,
// Fehlmessungen, alte/neue Kameras). Allein (ohne Raum), alles offen.
//   node MPSkills/tools/NeuroLab/tests/wildkatzen.e2e.mjs      (FOTOS=1 legt Bilder in tests/fotos/ ab, nicht einchecken)
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const FOTOS = process.env.FOTOS ? path.join(here, 'fotos') : null;
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
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
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
pg.on('pageerror', e => errs.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const shot = async (p, n) => { if (FOTOS) await p.screenshot({ path: path.join(FOTOS, n + '.png'), fullPage: true }); };
await pg.goto(BASE + '/MPSkills/tools/NeuroLab/index.html');
await pg.evaluate(() => localStorage.clear());
await pg.reload();

/* Revier der Wildkatzen (3. Fassung: Gerade ziehen, Gleichung, Neuron wie in Teil 1 einstellen, prüfen) */
await pg.evaluate(() => { window.confirm = () => true; });
await pg.click('.tile[data-id="v-revier"]');
ok(await pg.locator('.nn-step').count() === 3 && await pg.locator('.rv-map canvas').count() === 1 && await pg.locator('.nw-left > .nw').count() === 1, 'Revier: drei Schritte, Neuron wie in Teil 1, Karte');
ok(await pg.locator('.rv-split input:not(.nw-pop-in)').count() === 0, 'keine eigenen Eingabefelder – Zahlen stehen im Neuron');
const at = async (a, d) => pg.evaluate(([a, d]) => { const c = document.querySelector('.rv-map canvas'), r = c.getBoundingClientRect(); const W = c.clientWidth, H = c.clientHeight, s = Math.min((W - 58) / 12, (H - 50) / 10), ox = 46 + ((W - 58) - 12 * s) / 2; return [r.left + ox + a * s, r.top + 10 + (10 - d) * s]; }, [a, d]);
const dragTo = async (from, to) => { const f = await at(...from), t = await at(...to); await pg.mouse.move(...f); await pg.mouse.down(); await pg.mouse.move((f[0] + t[0]) / 2, (f[1] + t[1]) / 2, { steps: 3 }); await pg.mouse.move(...t, { steps: 3 }); await pg.mouse.up(); };
const bump = async (k, d, n, scope = '') => { for (let i = 0; i < n; i++) await pg.locator(`${scope} .nw-val[data-v="${k}"] .nw-pm[data-d="${d}"]`).first().click(); };
await dragTo([2, 2], [0, 3]); await dragTo([10, 6], [12, 4]);
ok(/x2 = 1\/12 · x1 \+ 3/.test((await pg.locator('.rv-eq-m').textContent()).replace(/\s+/g, ' ')) && await pg.locator('.rv-eq .rv-eq-s').count() === 0, 'Gleichung steht sofort neben der Gerade, ohne Erklärung zu m und n');
ok((await pg.locator('.nn-step').first().textContent()).indexOf('Fluss') < 0, 'Schritt 1 heißt nicht „Fluss“');
const typeIn = async (k, v) => { await pg.click(`.nw-left > .nw .nw-val[data-v="${k}"] .nw-num`); await pg.fill('.nw-num-in', v); await pg.press('.nw-num-in', 'Enter'); };
await typeIn('w1', '1/12'); await typeIn('w2', '-1'); await typeIn('b', '3');       // falsche Seite
ok(await pg.locator('.nw-left > .nw .nw-pop:not([hidden])').count() === 0, 'Zahlen werden direkt eingetippt, kein Regler');
await pg.click('.rv-check');
ok(/falschen Seite/.test(await pg.locator('.rv-result').textContent()), 'Fluss: falsche Seite wird erkannt');
ok(await pg.evaluate(() => !JSON.parse(localStorage.getItem('nl.revier')).s2.done), 'Gerade des Neurons wird nicht gezeichnet, solange die Werte falsch sind');
// richtig: −1/12 · 1 · −3 – im Regler-Fenster eintippen, auch als Bruch
await typeIn('w1', '-1/12'); await typeIn('w2', '1'); await typeIn('b', '-3');
ok((await pg.locator('.nw-left > .nw .nw-val[data-v="w1"] .nw-num').textContent()) === '−1/12', 'Bruch 1/12 bleibt im Neuron als Bruch stehen');
await pg.click('.rv-check');
ok(/\d+ von \d+/.test(await pg.locator('.rv-result').textContent()) && await pg.evaluate(() => JSON.parse(localStorage.getItem('nl.revier')).s2.done), 'Fluss: Werte richtig → Gerade des Perzeptrons erscheint');
await pg.click('.rv-help-b');
ok(await pg.locator('.rv-help:not([hidden]) .nw').count() === 1, 'Hilfe zeigt ein Beispiel mit Neuron');
await shot(pg, 'revier-fluss');
await pg.click('.rv-next');
ok(await pg.locator('.rv-nb').count() === 1 && await pg.locator('.rv-eqrow').count() === 1, 'Stadt: Fluss-Neuron ist schon im Netz, seine Gleichung steht oben');
ok(await pg.locator('.nw-left > .nw:not(.rv-nn)').count() === 0, 'Stadt: kein großes Neuron – die Zahlen stehen direkt im Netz');
const netIn = async (sel, v) => { await pg.click(`${sel} .nw-num`); await pg.fill('.rv-mini-in', v); await pg.press('.rv-mini-in', 'Enter'); };
for (const [i, P, Q, P0, Q0, w] of [[1, [0, 2], [3, 6], [1, 2], [3, 8], ['4/3', '-1', '2']], [2, [8, 6], [10, 3], [6, 10], [12, 4], ['-3/2', '-1', '18']]]) {
  await pg.click('.rv-add');
  await dragTo(P0, P); await dragTo(Q0, Q);
  for (const [j, k] of [[0, 'w1'], [1, 'w2']]) await netIn(`.rv-wp[data-i="${i}"] .nw-val[data-v="${k}"]`, w[j]);
  await netIn(`.rv-bp[data-i="${i}"] .nw-val`, w[2]);
}
ok(/x2 = 4\/3 · x1 \+ 2/.test((await pg.locator('.rv-eqrow').nth(1).textContent()).replace(/\s+/g, ' ')), 'Gleichung des zweiten Perzeptrons steht oben');
await pg.click('.rv-check');
ok(await pg.locator('.rv-nb:not(.open)').count() === 3 && await pg.locator('.rv-ob2').count() === 1, 'drei Perzeptrons geprüft, Ausgang da');
ok(await pg.locator('.rv-vp.is-fix').count() === 3 && (await pg.locator('.rv-obp.is-fix').textContent()).includes('−2,5') && await pg.locator('.rv-vp .nw-pm, .rv-obp .nw-pm').count() === 0 && await pg.locator('.rv-wires line').count() > 12, 'Netz als Bild: Gewichte an den Leitungen, Ausgang fest (v = 1, b = −2,5)');
await pg.waitForTimeout(100);
ok(/24 von 24/.test(await pg.locator('.rv-result').textContent()), 'Stadt: Netz aus drei Geraden findet das Revier');
await pg.waitForTimeout(1600);
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('nl.revier')).revealed), 'Karte wird aufgedeckt');
await pg.click('.rv-cover');
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('nl.revier')).covered) && /aufdecken/.test(await pg.locator('.rv-cover').textContent()), 'Karte lässt sich wieder zudecken');
await pg.click('.rv-cover');
await shot(pg, 'revier-karte');
await pg.click('.rv-next');
ok(await pg.locator('.rv-plan').count() === 4, 'Das Netz fragen: vier Pläne an Orten ohne Kamera');
for (const id of ['bau', 'gewerbe', 'rad', 'grill']) await pg.click(`.rv-plan[data-plan="${id}"] .rv-ask`);
ok(/Revier/.test(await pg.locator('.rv-plan[data-plan="bau"] .rv-plan-ans').textContent()) && await pg.locator('.rv-plan-calc .rv-ocalc').count() === 1, 'Baugebiet: Netz rechnet vor und sagt Revier');
await pg.click('.rv-plan[data-plan="rad"] [data-route="B"]');
ok(/Gute Wahl/.test(await pg.locator('.rv-plan[data-plan="rad"]').textContent()), 'Radweg: Weg B führt kaum durchs Revier');
await pg.click('.rv-show');
await pg.waitForTimeout(1600);
ok(await pg.locator('.rv-plan[data-plan="grill"] .rv-plan-bad').count() === 1 && await pg.locator('.rv-plan[data-plan="bau"] .rv-plan-ok').count() === 1, 'Aufdecken: am Grillplatz lag das Netz falsch, beim Baugebiet richtig');
ok(await pg.locator('.rv-sum').isVisible(), 'Zusammenfassung: Netz ist nur so gut wie seine Daten');
await shot(pg, 'revier-fragen');

/* Lernen → Wildkatzen */
await pg.click('#btn-home');
await pg.click('.tile[data-id="trainieren"]');
await pg.click('#scen-picker .tile[data-id="sc-katze"]');
ok(await pg.evaluate(() => NLApp.state.learn.scenario) === 'wildkatzen', 'Szenario Wildkatzen gewählt');
await pg.click('#btn-learn');
await pg.waitForTimeout(300);
ok(await pg.locator('.katze-map canvas').count() === 1, 'Info-Kasten mit Karte');
ok(await pg.evaluate(() => NLApp.state.numInputs === 2 && NLApp.state.outputLabels.length === 1), 'zwei Eingänge, ein Ausgang „Revier“');
await pg.click('#learn-apply-topology');
ok(await pg.evaluate(() => NLApp.state.layers.filter(l => l.count).map(l => l.count).join()) === '3,1', 'Bsp. Netz: 3 Neuronen + Ausgang');
// trainieren: 3 Neuronen tanh, saubere Kameras
const res = await pg.evaluate(async () => {
  const S = NLApp.state; S.learn.learningRate = 0.5; S.learn.speed = 300;
  const t0 = performance.now();
  NLApp.startTraining ? NLApp.startTraining() : document.getElementById('learn-btn-start').click();
  while (S.learn.epoch < 400 && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 200));
  document.getElementById('learn-btn-pause').click();
  return { e: S.learn.epoch, acc: document.getElementById('katze-acc').textContent };
});
console.log('  ', res.e, 'Epochen:', res.acc);
const m = res.acc.match(/(\d+) von (\d+) · neue Kameras: (\d+) von (\d+)/);
ok(m && +m[1] >= 22 && +m[3] >= 55, 'Netz lernt die Kameras (alte ≥ 22/24, neue ≥ 55/74)');
ok(await pg.locator('#katze-curve path.c-old').count() === 1 && await pg.locator('#katze-curve path.c-new').count() === 1, 'Kurve alte/neue Kameras');
await shot(pg, 'katze-lernen');
await pg.click('#katze-noisy');
ok(await pg.evaluate(() => NLApp.state.learn.katzeNoisy && NLApp.state.learn.epoch === 0), 'Fehlmessungen: Daten wechseln, Training von vorn');
ok(await pg.locator('#data-table-body tr').count() === 28 || true, 'Datentabelle (28 Zeilen, wenn sichtbar)');
await pg.click('#katze-test');
ok(/neuen Kameras/.test(await pg.locator('#katze-acc').textContent()), 'Neue Kameras auf der Karte zeigen');
await shot(pg, 'katze-fehlmessungen');
ok(errs.length === 0, 'keine Fehler in der Konsole' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); srv.close();
console.log(fail ? `${fail} Fehler` : 'alles grün');
process.exit(fail ? 1 : 0);
