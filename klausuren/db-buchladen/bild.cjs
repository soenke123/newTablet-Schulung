/* Zeichnet diagramm.png aus diagramm.html (Klassendiagramm mit dem Code von SQL Studio). node bild.cjs */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ deviceScaleFactor: 3, viewport: { width: 1060, height: 600 } });
  await p.goto('file://' + __dirname + '/diagramm.html');
  await p.waitForFunction('window.done');
  await p.waitForTimeout(300);
  await (await p.$('#h')).screenshot({ path: __dirname + '/diagramm.png' });
  await b.close();
})();
