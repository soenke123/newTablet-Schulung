// Fotografiert jedes <section class="d"> aus diagramme.html als bilder/d-<id>.png.
// Aufruf: node schaubilder.cjs   (Screenshots der App: node screenshots.cjs [1,2,3,4], Phase 4 trainiert ~2,5 Min.)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/diagramme.html');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  for (const id of await p.$$eval('section.d', s => s.map(x => x.id))) {
    await p.locator('#' + id).screenshot({ path: __dirname + '/bilder/d-' + id + '.png' });
    console.log('ok', id);
  }
  await b.close();
})();
