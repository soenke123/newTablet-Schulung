/* Zeichnet die Klassendiagramme der Klausur aus diagramm.html (Code von SQL Studio).  node bild.cjs */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [v, w, h] of [['haupt', 1060, 600], ['tracking', 1000, 250]]) {
    const p = await b.newPage({ deviceScaleFactor: 3, viewport: { width: w, height: h } });
    await p.goto('file://' + __dirname + '/diagramm.html?v=' + v);
    await p.waitForFunction('window.done');
    await p.waitForTimeout(300);
    await (await p.$('#h')).screenshot({ path: __dirname + '/diagramm-' + v + '.png' });
    await p.close();
  }
  await b.close();
})();
