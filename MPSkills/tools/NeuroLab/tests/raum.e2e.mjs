// Browser-Prüfstand für NeuroLab (Playwright, ohne Server-Datenbank).
//   node MPSkills/tools/NeuroLab/tests/raum.e2e.mjs        (FOTOS=1 legt Bilder in tests/fotos/ ab, nicht einchecken)
// Prüft: Freigaben im Raum (Lehrkraft teilt → nl:parts, Klasse sieht nur Geteiltes,
// Szenario-Auswahl nur Freigegebenes, „Alle Neuronen“ hängt an n-wie), Bereiche öffnen,
// Revier der Wildkatzen (rechnen → Gerade → Netz → Karte → Overfitting), Netz durchrechnen,
// Szenario-Wahl im Modus, Lernen mit festem Ausgang (Gatter inkl. XOR, Greifvögel),
// Schicht dazu/weg, Druckansicht, keine Konsolenfehler.
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

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
// „Netze trainieren“ ist ein Knopf; das Szenario wählt man im Modus (#scen-picker)
async function openSc(p, id) {
  await p.click('.tile[data-id="trainieren"]');
  await p.locator('#scen-picker .tile[data-id="' + id + '"]').click();
}

/* 1. Klasse: nur geteilte Bereiche/Kacheln */
{
  const pg = await page();
  await pg.goto(BASE + '/host?rolle=schueler&parts=' + encodeURIComponent(JSON.stringify(['neuron', 'n-wie', 'trainieren', 'sc-vogel'])));
  const fr = pg.frameLocator('#f');
  await fr.locator('.tile[data-id="n-wie"]').waitFor();
  ok(await fr.locator('.area').count() === 2, 'Klasse sieht nur die zwei geteilten Bereiche');
  ok(await fr.locator('.tile.locked').count() === 0, 'Übersicht: n-wie und „Netze trainieren“ offen');
  ok(await fr.locator('.share').count() === 0, 'Klasse sieht keine Teilen-Knöpfe');
  ok(await fr.locator('#btn-print').isHidden(), 'Klasse hat keinen Druck-Knopf');
  await fr.locator('.tile[data-id="trainieren"]').click();
  ok(await fr.locator('#scen-picker .tile.locked').count() === 4, 'Szenario-Wahl: nicht geteilte Szenarien gesperrt');
  await fr.locator('#scen-picker .tile[data-id="sc-vogel"]').click();
  await fr.locator('#learn-scenario-select').waitFor();
  await fr.locator('.learn-custom-select-btn').click();
  const items = await fr.locator('.learn-custom-select-item').allTextContents();
  ok(JSON.stringify(items) === JSON.stringify(['– wählen –', 'Greifvögel']), 'Szenario-Auswahl zeigt nur Freigegebenes: ' + items.join(', '));
  await pg.evaluate(() => push(['neuron', 'n-wie']));
  await pg.waitForTimeout(200);
  ok(await fr.locator('.area').count() === 1 && await fr.locator('#home').isVisible(), 'Entziehen wirkt sofort (zurück zur Übersicht)');
  await pg.evaluate(() => push([]));
  await pg.waitForTimeout(150);
  ok(await fr.locator('#wait').isVisible(), 'ohne Freigabe: Wartehinweis');
  await pg.close();
}

/* 2. Lehrkraft teilt */
{
  const pg = await page();
  await pg.goto(BASE + '/host?rolle=lehrer&parts=null');
  const fr = pg.frameLocator('#f');
  await fr.locator('.tile[data-id="trainieren"]').waitFor();
  ok(!(await fr.locator('#wait').isVisible()), 'Lehrkraft sieht keinen Wartehinweis');
  await fr.locator('.area[data-area="trainieren"] .area-share').click();
  await pg.waitForTimeout(150);
  const sent = await pg.evaluate(() => window.sent);
  ok(sent.length === 1 && sent[0].includes('trainieren') && sent[0].includes('sc-eigene'), 'Bereich teilen nimmt seine Kacheln mit');
  ok(/5 von 5 Szenarien/.test(await fr.locator('.tile[data-id="trainieren"]').textContent()), 'Kachel zählt die geteilten Szenarien');
  await fr.locator('.tile[data-id="trainieren"]').click();
  await fr.locator('#scen-picker .tile[data-id="sc-eigene"] .share').click();
  await pg.waitForTimeout(150);
  const s2 = await pg.evaluate(() => window.sent.at(-1));
  ok(!s2.includes('sc-eigene') && s2.includes('trainieren'), 'einzelnes Szenario in der Szenario-Wahl entziehen');
  await fr.locator('.scen-close').click();
  await fr.locator('#btn-home').click();
  await fr.locator('.tile[data-id="n-wie"] .share').click();
  await pg.waitForTimeout(150);
  const s3 = await pg.evaluate(() => window.sent.at(-1));
  ok(!s3.includes('n-wie') && !s3.includes('n-typen'), '„Wie arbeitet ein Neuron?“ entziehen nimmt „Alle Neuronen“ mit');
  await fr.locator('.tile[data-id="n-wie"] .share').click();
  await pg.waitForTimeout(150);
  const s4 = await pg.evaluate(() => window.sent.at(-1));
  ok(s4.includes('n-wie') && s4.includes('n-typen'), '… und teilen auch');
  ok(await fr.locator('.area[data-area="bauen"] .tile').count() === 3, 'Vom Neuron zum Netz: drei Kacheln');
  await pg.close();
}

/* 3. Allein: Bereiche, Bauen, Lernen */
const pg = await page();
await pg.goto(BASE + '/MPSkills/tools/NeuroLab/index.html');
await pg.evaluate(() => localStorage.clear());
await pg.reload();
ok(await pg.locator('.tile').count() === 1 + 3 + 1 && await pg.locator('.tile.locked').count() === 0, 'allein: fünf Kacheln, alle offen');
await pg.click('.tile-sub[data-open="n-typen"]');
ok(await pg.locator('.nt-card').count() === 5, 'Alle Neuronen: fünf kleine Karten');
await pg.click('.nt-card[data-type="sigmoid"]');
ok(await pg.locator('.nt-detail .nw.is-typed').count() === 1 && await pg.locator('.nw-plane canvas').count() === 1, 'Karte antippen: Neuron + Pinguin-Ebene mit diesem Typ');
ok(/% Zügel/.test(await pg.locator('.nw-ytxt').textContent()), 'Sigmoid: Ausgabe als Sicherheit in %');
await pg.click('.nt-chip[data-type="relu"]');
ok((await pg.locator('.nw-tname').textContent()) === 'ReLU', 'oben auf einen anderen Typ umschalten');
await pg.click('.nt-back');
ok(await pg.locator('.nt-card').count() === 5, 'zurück zur Übersicht');
await pg.click('.nn-tab[data-id="n-wie"]');
ok(await pg.locator('.nn-step').count() === 7, 'Wie arbeitet ein Neuron: sieben Schritte');
ok(await pg.locator('.nw.is-fixed').count() === 1, 'Schritt Nervenzelle: Neuron nur zum Ansehen');
await pg.click('.nn-step[data-step="in"]');
await pg.waitForTimeout(900);
const z = () => pg.locator('.nw-calc .mrow').first().locator('.res span').last().textContent();
ok(await pg.locator('.nw[data-show="1"]').count() === 1 && await pg.locator('.nw-wpill .nw-val').first().isHidden(), 'Schritt Eingänge: Gewichte noch grau, ohne Zahl');
ok((await z()) === '?', 'Schritt Eingänge: z noch unbekannt');
const x1 = pg.locator('.nw-val[data-v="x1"] .nw-num');
await pg.click('.nw-val[data-v="x1"] .nw-pm[data-d="1"]');
ok((await x1.textContent()) === '2,5', '+ am Eingang zählt hoch');
await pg.click('.nw-val[data-v="x1"] .nw-pm[data-d="-1"]');
await pg.click('.nn-step[data-step="w"]');
ok(/multipliziert/.test(await pg.locator('.nn-lead-p').textContent()), 'Gewichte: „multipliziert“');
await pg.click('.nn-step[data-step="b"]');
await pg.waitForTimeout(900);
ok((await z()) === '0,5', 'Schritt Summe & Bias: z = 2·1 + 1·0,5 − 2 = 0,5');
await pg.click('.nw-val[data-v="b"] .nw-num');
ok(await pg.locator('.nw-pop .nw-vs').isVisible(), 'Zahl antippen öffnet den senkrechten Regler am Feld');
for (let i = 0; i < 10; i++) await pg.keyboard.press('ArrowDown');
ok((await z()) === '−0,5' && (await pg.locator('.nw-y').textContent()) === '0', 'Regler ändert Bias, Rechnung und Ausgabe');
const vb = await pg.locator('.nw-vs').boundingBox();
await pg.mouse.click(vb.x + vb.width / 2, vb.y + 2);
ok(+(await pg.locator('.nw-val[data-v="b"] .nw-num').textContent()).replace(',', '.') >= 7.5, 'Regler oben antippen = fast der größte Wert');
await pg.mouse.click(5, 5);
ok(await pg.locator('.nw-pop').isHidden(), 'Tippen daneben schließt den Regler');
await pg.click('.nn-step[data-step="line"]');
ok(await pg.locator('.nw-plane canvas').count() === 1 && await pg.locator('.nw-split .nw-left .nw').count() === 1, 'Schritt Gerade: Neuron links, Ebene rechts');
await pg.click('.nn-step[data-step="data"]');
const msg = await pg.locator('.nn-task-msg b').first().textContent();
ok(/von 30/.test(msg) && !/30 von 30/.test(msg), 'Pinguine: 30 Punkte, am Anfang nicht alle richtig');
ok((await pg.locator('.nw-cap').first().textContent()) === 'Schnabellänge', 'echte Eingänge beschriftet');
for (let i = 0; i < 2; i++) await pg.click('.nw-val[data-v="w1"] .nw-pm[data-d="1"]');
for (let i = 0; i < 6; i++) await pg.click('.nw-val[data-v="w2"] .nw-pm[data-d="-1"]');
for (let i = 0; i < 5; i++) await pg.click('.nw-val[data-v="b"] .nw-pm[data-d="1"]');
ok(/30 von 30/.test(await pg.locator('.nn-task-msg b').first().textContent()), 'w = (1, −1), b = −25 trennt alle Pinguine');
await shot(pg, 'pinguine');
ok(await pg.locator('.nn-next').count() === 1, 'Übergang: Perzeptron – welche gibt es noch?');
await pg.click('.nn-next .nn-btn');
ok(await pg.locator('.nt-card').count() === 5, 'Knopf führt zu „Alle Neuronen“');
await pg.click('#btn-home');

/* Revier der Wildkatzen */
await pg.evaluate(() => { window.confirm = () => true; });
await pg.click('.tile[data-id="v-revier"]');
ok(await pg.locator('.rv-probe').count() === 3 && await pg.locator('.rv-map canvas').count() === 1, 'Revier: drei Kameras prüfen, Karte');
for (const [l, zz, f] of [['A', '-3', 0], ['B', '2', 1], ['C', '0', 0]]) {
  await pg.fill(`.rv-probe[data-l="${l}"] input`, l === 'C' ? '1' : zz);
  await pg.click(`.rv-probe[data-l="${l}"] [data-yn="${f}"]`);
  await pg.click(`.rv-probe[data-l="${l}"] .rv-chk`);
  if (l === 'C') {
    ok(/nochmal/i.test(await pg.locator('.rv-probe[data-l="C"] .rv-msg').textContent()), 'falsches z wird nicht angenommen');
    await pg.fill('.rv-probe[data-l="C"] input', '0'); await pg.click('.rv-probe[data-l="C"] [data-yn="1"]'); await pg.click('.rv-probe[data-l="C"] .rv-chk');
    ok(/nicht größer/.test(await pg.locator('.rv-probe[data-l="C"] .rv-msg').textContent()), 'z = 0 feuert nicht');
    await pg.click('.rv-probe[data-l="C"] [data-yn="0"]'); await pg.click('.rv-probe[data-l="C"] .rv-chk');
  }
}
ok(/18 von 27/.test(await pg.locator('.rv-result').textContent()), 'Janas Neuron: 18 von 27 Kameras');
const at = async (a, d) => pg.evaluate(([a, d]) => { const c = document.querySelector('.rv-map canvas'), r = c.getBoundingClientRect(); const W = c.clientWidth, H = c.clientHeight, s = Math.min((W - 58) / 12, (H - 50) / 10), ox = 46 + ((W - 58) - 12 * s) / 2; return [r.left + ox + a * s, r.top + 10 + (10 - d) * s]; }, [a, d]);
await pg.click('.rv-next');
await pg.mouse.click(...await at(2, 3)); await pg.mouse.click(...await at(8, 6));
await pg.fill('[data-f="w1"]', '1/2'); await pg.fill('[data-f="w2"]', '-1'); await pg.fill('[data-f="b"]', '2');
await pg.click('.rv-check');
ok(/falschen Seite/.test(await pg.locator('.rv-result').textContent()), 'Fluss: falsche Seite wird erkannt');
await pg.fill('[data-f="w1"]', '-0,5'); await pg.fill('[data-f="w2"]', '1'); await pg.fill('[data-f="b"]', '−2');
await pg.click('.rv-check');
ok(/27 von 27/.test(await pg.locator('.rv-result').textContent()) && /durch P und Q/.test(await pg.locator('.rv-result').textContent()), 'Fluss: Gerade durch P und Q, alle Kameras richtig');
await pg.click('.rv-next');
ok(await pg.locator('.rv-hcard').count() === 1, 'Stadt: Fluss-Neuron ist schon im Netz');
await pg.click('.rv-chip'); await pg.click('.rv-chip');
ok(await pg.locator('.rv-hcard').count() === 3 && await pg.locator('.rv-ocard').count() === 1, 'Perzeptrons dazu, Ausgangsneuron da');
const hc = i => pg.locator('.rv-hcard').nth(i).locator('input');
for (const [i, v] of [[1, ['3', '-1', '-3']], [2, ['-1', '-1', '15']]]) for (let k = 0; k < 3; k++) await hc(i).nth(k).fill(v[k]);
const oc = pg.locator('.rv-ocard input');
for (const [k, v] of ['1', '1', '1', '-2,5'].entries()) await oc.nth(k).fill(v);
await pg.waitForTimeout(100);
ok(/79 von 79/.test(await pg.locator('.rv-result').textContent()), 'Stadt: Netz aus drei Geraden findet das Revier');
await pg.waitForTimeout(1600);
ok(await pg.evaluate(() => JSON.parse(localStorage.getItem('nl.revier')).revealed), 'Karte wird aufgedeckt');
await shot(pg, 'revier-karte');
await pg.click('.rv-next');
await pg.click('[data-c="kim"]'); await pg.click('.rv-run');
const cards = await pg.locator('.rv-test-res .rv-big').allTextContents();
const [mine, kimT] = cards.map(t => +t.split('/')[0]);
ok(mine > kimT, `Overfitting: eigenes Netz ${mine}, Kims Netz ${kimT} bei neuen Kameras`);
ok(await pg.locator('.rv-sum').isVisible(), 'Erklärung Overfitting');
await pg.click('#btn-home');

/* Netz durchrechnen */
await pg.click('.tile[data-id="v-rechnen"]');
ok(await pg.locator('.rc-n').count() === 4 && await pg.locator('.rc-ans input').count() === 8, 'Netz durchrechnen: 3 + 1 Neuronen, z und y′ je Neuron');
await pg.click('.rc-check');
ok(/0 von 8/.test(await pg.textContent('.rc-fb')), 'leere Felder zählen nicht');
await pg.click('.rc-show'); await pg.click('.rc-check');
ok(/Alles richtig/.test(await pg.textContent('.rc-fb')), 'Lösung (2 Nachkommastellen) wird angenommen');
await pg.click('[data-lv="rueck"]');
ok(await pg.locator('.rc-w.miss').count() === 1, 'Rückwärts: ein Gewicht fehlt');
await pg.click('#btn-home');

await pg.click('.tile[data-id="b-frei"]');
ok(await pg.locator('#btn-build').isVisible() && await pg.locator('#btn-run').isVisible(), 'Bauen: Build und Run');
await pg.click('#btn-add-layer');
ok(await pg.evaluate(() => NLApp.state.layers.length) === 5, 'Schicht dazu');
await pg.locator('.col-remove-btn').first().click();
ok(await pg.evaluate(() => NLApp.state.layers.length) === 4, 'leere Schicht wieder weg');
await pg.click('#btn-home');

await pg.click('.tile[data-id="trainieren"]');
ok(await pg.locator('#scen-picker .tile').count() === 5 && await pg.locator('#scen-picker').isVisible(), 'Netze trainieren: erst das Szenario wählen');
await pg.click('#scen-picker .tile[data-id="sc-gatter"]');
await pg.locator('#learn-btn-start').waitFor();
ok(await pg.locator('#btn-build').isHidden(), 'Lernen: kein Build/Run');
// Ausgänge = eigene Spalte mit Steckplätzen; leeres Netz hängt sie an Schicht 1
ok(await pg.locator('.col-outputs .out-slot').count() === 4, 'Gatter: vier Ausgänge als Steckplätze');
ok(await pg.evaluate(() => NLApp.state.outMap.every(m => m && m.li === 0)), 'leeres Netz: alle Ausgänge an Schicht 1');
// Schicht 2 mit einem Neuron, XOR dorthin umstecken (Ausgang antippen → Neuron antippen)
await pg.click('#btn-add-layer');
ok((await pg.evaluate(() => [...document.querySelectorAll('#net-stage > .col')].map(c => c.className.split(' ')[1]).join())).includes('col-layer,col-addlayer,col-outputs'), '+ Schicht steht vor den Ausgängen');
await pg.locator('.col-layer[data-layer="1"] .counter-btn').nth(1).click();
await pg.locator('.col-layer[data-layer="0"] .counter-btn').nth(0).click();
await pg.click('.out-slot[data-slot="3"]');
await pg.waitForTimeout(400);
await pg.click('.col-layer[data-layer="1"] .neuron-card');
await pg.waitForTimeout(200);
ok(await pg.evaluate(() => JSON.stringify(NLApp.state.outMap)) === '[{"li":0,"ni":0},{"li":0,"ni":1},{"li":0,"ni":2},{"li":1,"ni":0}]', 'XOR an Schicht 2, AND/OR/NOT A an Schicht 1');
ok(await pg.locator('.edge-overlay .out-line').count() === 4, 'vier Leitungen zu den Ausgängen');
await pg.click('#learn-apply-topology');
await pg.evaluate(() => { NLApp.state.learn.speed = 300; NLApp.state.learn.learningRate = 0.5; });
await pg.click('#learn-btn-start');
await pg.waitForFunction(() => NLApp.state.learn.epoch > 400 && NLApp.state.learn.loss < 0.01, null, { timeout: 20000 }).catch(() => {});
await pg.click('#learn-btn-pause');
const L = await pg.evaluate(() => NLApp.state.learn.loss);
ok(L < 0.01, 'Gatter (inkl. XOR) gelernt, Verlust ' + L.toFixed(4));
await shot(pg, 'gatter');

await pg.click('#btn-scen');
await pg.click('#scen-picker .tile[data-id="sc-vogel"]');
ok(await pg.evaluate(() => NLApp.state.learn.scenario) === 'voegel', 'Knopf „Szenario wählen“ im Modus wechselt das Szenario');
await pg.click('#learn-apply-topology');
await pg.evaluate(() => { NLApp.state.learn.speed = 300; NLApp.state.learn.learningRate = 0.5; });
await pg.click('#learn-btn-start');
await pg.waitForFunction(() => /(\d+) %/.test(document.getElementById('vogel-acc')?.textContent || '') && +RegExp.$1 >= 93, null, { timeout: 25000 }).catch(() => {});
await pg.click('#learn-btn-pause');
const acc = await pg.textContent('#vogel-acc');
ok(+(acc.match(/(\d+) %/) || [0, 0])[1] >= 93, 'Greifvögel: ' + acc);
await shot(pg, 'voegel');

await pg.click('#btn-print');
ok(await pg.locator('#print-opts').isVisible(), 'Druckansicht mit Auswahl');
await pg.selectOption('#print-opts select[data-k="weights"]', 'gap');
ok((await pg.locator('.edge-label text').first().textContent()).includes('___'), 'Gewichte als Lücken');
await shot(pg, 'druck');
await pg.click('#btn-print');

// Stand je Bereich bleibt erhalten
await pg.click('#btn-home');
await pg.click('.tile[data-id="b-frei"]');
ok(await pg.evaluate(() => NLApp.state.layers.length) === 4 && await pg.evaluate(() => NLApp.state.phase) !== 'learn', 'Bauen behält sein eigenes Netz');

/* 4. Schmal (Tablet hochkant) */
const pt = await page({ width: 768, height: 1024 });
await pt.goto(BASE + '/MPSkills/tools/NeuroLab/index.html?demo=1');
const over = await pt.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
ok(!over, 'hochkant kein seitliches Scrollen');
await shot(pt, 'hochkant');

ok(errs.length === 0, 'keine Fehler in der Konsole' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); srv.close();
process.exit(fail ? 1 : 0);
