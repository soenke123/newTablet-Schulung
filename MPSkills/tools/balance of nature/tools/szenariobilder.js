/**
 * Bilder fuer die Szenario-Kacheln im Raum (js/ui/room.js): Ausschnitte der
 * echten Inselkarte (headless Chromium, Playwright), wie tools/kartenbilder.js.
 * Je Szenario wird die Insel mit dessen Startbestand geladen und so lange
 * simuliert, bis die Tiere des Szenarios nah beieinander zu sehen sind.
 *
 *   node tools/szenariobilder.js [1 2 3 4] [--seed=482917]
 *
 * Schreibt assets/szenario_<n>.jpg (800 x 450). Die grossen Tierbilder liegen
 * in der Kachel darueber (HTML), nicht im Bild.
 */
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')));
}

const W = 800, H = 450;
const NONE = { zwerghirsch: 0, laufvogel: 0, inselwolf: 0, inseladler: 0 };

/*
 * start: Startbestand (fehlende Arten wie empfohlen), humans: Landung + Schafweide,
 * days: so viele Tage vorher simulieren, pair: diese zwei Arten sollen nah
 * beieinander im Bild sein, width: Bildbreite in Welteinheiten.
 */
const SCENES = {
  1: { start: { laufvogel: 0, inseladler: 0 }, days: 70, pair: ['inselwolf', 'zwerghirsch'], width: 330 },
  2: { start: { zwerghirsch: 0, inselwolf: 0 }, days: 70, pair: ['inseladler', 'laufvogel'], width: 300 },
  3: { start: {}, days: 70, pair: ['inselwolf', 'zwerghirsch'], also: 'laufvogel', width: 380 },
  4: { start: {}, days: 20, humans: true, width: 420 }
};

(async () => {
  const argv = process.argv.slice(2);
  const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
  const ids = argv.filter((a) => !a.startsWith('--'));
  const seed = flags.seed || '482917';
  const browser = await chromium.launch();
  let failed = 0;
  for (const id of ids.length ? ids : Object.keys(SCENES)) {
    const sc = SCENES[id];
    if (!sc) { console.log('unbekanntes Szenario:', id); failed++; continue; }
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html') + '#seed=' + seed + '&size=mittel');
    await page.waitForFunction(() => window.BT && BT.app && BT.app.world && BT.app.sim, null, { timeout: 30000 });
    await page.addStyleTag({ content: '#season { display: none !important; }' });
    const at = await page.evaluate(({ sc, NONE }) => {
      const app = BT.app;
      app.restartWith(Object.assign({}, sc.start));
      const sim = app.sim;
      app.setRunning(false);
      const groupsOf = (id) => sim.groups.filter((g) => g.spec.id === id && g.members.length);
      if (sc.humans) {
        app.runDays(sc.days);
        let err = app.play('landung', { x: app.world.width * 0.17, y: app.world.height * 0.5 });
        app.setRunning(false);
        if (err) return { err: 'Landung: ' + err };
        for (let t = 0; t < 2000 && !sim.humans.villages.length; t++) sim.step();
        sim.cardPause = 0;
        err = app.play('schafe', {});
        app.setRunning(false);
        if (err) return { err: 'Schafe: ' + err };
        app.runDays(30);
        // warten, bis Schafe ausgebrochen sind und es Tag und Sommer ist
        for (let t = 0; t < sim.ticksPerDay * 600; t++) {
          const wild = groupsOf('schaf');
          const p = sim.humans.pastures[0];
          if (wild.length && p && !sim.humans.night && sim.calendar.season < 2) {
            const v = sim.humans.villages[0];
            return { x: (v.x + p.x + wild[0].x) / 3, y: (v.y + p.y + wild[0].y) / 3 };
          }
          sim.step();
        }
        return { err: 'keine ausgebrochenen Schafe' };
      }
      app.runDays(sc.days);
      for (let t = 0; t < sim.ticksPerDay * 600; t++) {
        if (sim.calendar.season < 2) {
          const a = groupsOf(sc.pair[0]), b = groupsOf(sc.pair[1]);
          for (const ga of a) {
            for (const gb of b) {
              const d = Math.hypot(ga.x - gb.x, ga.y - gb.y);
              if (d > 40 && d < 110) {
                if (sc.also && !groupsOf(sc.also).some((g) => Math.hypot(g.x - ga.x, g.y - ga.y) < 170)) continue;
                return { x: (ga.x + gb.x) / 2, y: (ga.y + gb.y) / 2 };
              }
            }
          }
        }
        sim.step();
      }
      return { err: 'Szene nicht gefunden' };
    }, { sc, NONE });
    if (at.err) { console.log(id + ':', at.err); failed++; await page.close(); continue; }
    const box = await page.evaluate(({ at, width, W, H }) => {
      const cam = BT.app.camera, canvas = document.getElementById('map');
      const r = canvas.getBoundingClientRect();
      cam.setViewport = () => {};
      cam.scale = W / width;
      cam.x = at.x - r.width / cam.scale / 2;
      cam.y = at.y - r.height / cam.scale / 2;
      BT.app.redraw();
      return { x: r.left + r.width / 2 - W / 2, y: r.top + r.height / 2 - H / 2 };
    }, { at, width: sc.width, W, H });
    await page.waitForTimeout(800);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => { BT.app.redraw(); setTimeout(() => requestAnimationFrame(res), 300); })));
    const out = path.join(__dirname, '..', 'assets', 'szenario_' + id + '.jpg');
    await page.screenshot({ path: out, type: 'jpeg', quality: 84, clip: { x: box.x, y: box.y, width: W, height: H } });
    console.log(errors.length ? id + ': Fehler\n' + errors.join('\n') : 'geschrieben: ' + path.relative(process.cwd(), out));
    if (errors.length) failed++;
    await page.close();
  }
  await browser.close();
  if (failed) process.exitCode = 1;
})();
