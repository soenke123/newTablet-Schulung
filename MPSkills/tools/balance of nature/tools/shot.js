/**
 * Screenshot der echten Seite in headless Chromium (Playwright).
 * Nur ein Entwicklungswerkzeug - die Anwendung selbst braucht nichts davon.
 *
 *   node tools/shot.js <out.png> [seed] [size] [zoom] [cx] [cy] [tage] [ohne]
 *
 *   zoom  Vergroesserung relativ zur Gesamtansicht (Standard 1)
 *   cx,cy Mittelpunkt des Ausschnitts als Anteil der Welt (0..1)
 *   ohne  Arten ohne Startbestand, z. B. inselwolf,inseladler
 *
 *   --landung=fx,fy  vor dem Simulieren an dieser Stelle (Anteil der Welt) landen;
 *                    der Ausschnitt (cx, cy) kann dann z. B. auf das Dorf zeigen
 *   --karten=schafe,hunde  nach der Landung (10 Tage spaeter) diese Karten spielen, ohne Pause
 *   --gross          die Grossansicht der Diagramme oeffnen (mit --mittel: Jahresmittel)
 *   --reiter=menschen  diesen Bereich der Seitenleiste aufklappen (bestand, menschen, verlauf, insel); --breit: Leiste zweispaltig
 */
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')));
}

(async () => {
  const argv = process.argv.slice(2);
  const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
  const [out = 'shot.png', seed = '482917', size = 'mittel', zoom = '1', cx = '0.5', cy = '0.5', days = '0', ohne = ''] = argv.filter((a) => !a.startsWith('--'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = 'file://' + path.join(__dirname, '..', 'index.html') + '#seed=' + seed + '&size=' + size;
  await page.goto(url);
  await page.waitForFunction(() => window.BT && BT.app && BT.app.world && BT.app.sim, null, { timeout: 30000 });
  if (ohne) {
    await page.evaluate((ids) => BT.app.restartWith(Object.fromEntries(ids.map((id) => [id, 0]))), ohne.split(','));
  }
  if (flags.landung) {
    const [fx, fy] = flags.landung.split(',').map(Number);
    const err = await page.evaluate(({ fx, fy }) => {
      const r = BT.app.play('landung', { x: BT.app.world.width * fx, y: BT.app.world.height * fy });
      BT.app.setRunning(false);
      return r;
    }, { fx, fy });
    if (err) errors.push('Landung: ' + err);
  }
  if (flags.karten) {
    const errs = await page.evaluate((ids) => {
      BT.app.runDays(10);
      BT.app.sim.cardPause = 0;
      const out = ids.map((id) => BT.app.play(id, {})).filter(Boolean);
      BT.app.setRunning(false);
      return out;
    }, flags.karten.split(','));
    errs.forEach((e) => errors.push('Karte: ' + e));
  }
  if (+days > 0) {
    const t0 = Date.now();
    await page.evaluate((d) => BT.app.runDays(d), +days);
    console.log(days, 'Tage simuliert in', Date.now() - t0, 'ms');
  }
  if (flags.reiter) await page.evaluate((n) => BT.app.fold(n, true), flags.reiter);
  if ('breit' in flags) await page.evaluate(() => BT.app.wide(true));
  if ('gross' in flags) await page.evaluate((mean) => { BT.app.big(true); if (mean) document.querySelector('.mean-toggle').click(); }, 'mittel' in flags);
  await page.evaluate(({ zoom, cx, cy }) => {
    const cam = BT.app.camera, w = BT.app.world;
    if (zoom !== 1) {
      cam.scale = Math.min(cam.maxScale, cam.minScale * zoom);
      cam.x = w.width * cx - cam.viewWidth / cam.scale / 2;
      cam.y = w.height * cy - cam.viewHeight / cam.scale / 2;
      cam.clampPosition();
    }
    BT.app.redraw();
  }, { zoom: +zoom, cx: +cx, cy: +cy });
  const t = await page.evaluate(() => new Promise((res) => {
    requestAnimationFrame(() => { const t0 = performance.now(); BT.app.redraw(); requestAnimationFrame(() => res(performance.now() - t0)); });
  }));
  await page.screenshot({ path: out });
  console.log('geschrieben:', out, '· Bild in ca.', Math.round(t), 'ms');
  if (errors.length) { console.log('Fehler:\n' + errors.join('\n')); process.exitCode = 1; }
  await browser.close();
})();
