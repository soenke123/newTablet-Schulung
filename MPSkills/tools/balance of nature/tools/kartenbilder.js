/**
 * Bilder fuer die Infofenster der Karten: Ausschnitte der echten Inselkarte
 * (headless Chromium, Playwright). Je Karte wird eine Insel geladen, gelandet,
 * die Karte gespielt und so lange simuliert, bis die Szene zu sehen ist
 * (z. B. ein Jaeger nahe bei Woelfen). Dann wird um diese Stelle ausgeschnitten.
 *
 *   node tools/kartenbilder.js [karte ...] [--seed=482917] [--landung=0.17,0.5]
 *
 * Schreibt assets/karte_<id>.png (960 x 480, im Infofenster 480 x 240).
 * Ohne Angabe alle Karten. Nach Aenderungen an Grafiken neu erzeugen.
 */
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')));
}

const W = 960, H = 480;

/*
 * Je Karte: welche Karten nach der Landung gespielt werden, wie viele Tage
 * danach mindestens vergehen, worauf dann Tick fuer Tick gewartet wird
 * (wait liefert den Mittelpunkt des Bildes in Weltkoordinaten oder null) und
 * wie viele Weltunits das Bild breit ist.
 * Die Funktionen laufen in der Seite (BT ist dort global).
 */
const SCENES = {
  landung: {
    cards: [], days: 0, width: 380,
    wait: () => {
      const H = BT.app.sim.humans, s = H.ships[0];
      if (!s || s.phase !== 'liegt' || !H.houses.length || s.t < 8) return null;
      const v = H.villages[0];
      return { x: (s.x * 0.5 + v.x * 0.5), y: (s.y * 0.5 + v.y * 0.5) };
    }
  },
  dorf: {
    cards: ['dorf'], days: 40, width: 340,
    wait: () => {
      const H = BT.app.sim.humans, v = H.villages[0];
      if (H.ships.length) return null;
      let x = 0, y = 0;
      v.houses.forEach((h) => { x += h.x; y += h.y; });
      return { x: x / v.houses.length, y: y / v.houses.length };
    }
  },
  acker: {
    cards: ['acker'], days: 5, width: 300,
    wait: () => {
      const sim = BT.app.sim, H = sim.humans, f = H.fields[0], v = H.villages[0];
      // im Sommer steht das Getreide, Siedler arbeiten auf dem Acker
      if (!f || sim.calendar.season !== 1 || sim.calendar.dayOfSeason < 8) return null;
      const workers = H.people.filter((p) => !p.inside && Math.hypot(p.x - f.x, p.y - f.y) < 70).length;
      if (workers < 2) return null;
      return { x: f.x * 0.75 + v.x * 0.25, y: f.y * 0.75 + v.y * 0.25 };
    }
  },
  schafe: {
    cards: ['schafe'], days: 12, width: 260,
    wait: () => {
      const p = BT.app.sim.humans.pastures[0];
      return p && !BT.app.sim.humans.night ? { x: p.x, y: p.y } : null;
    }
  },
  hunde: {
    cards: ['schafe', 'hunde'], days: 12, width: 260,
    wait: () => {
      const H = BT.app.sim.humans, p = H.pastures[0];
      if (!p || H.night) return null;
      const near = H.dogs.filter((d) => Math.hypot(d.x - p.x, d.y - p.y) < 90);
      if (near.length < 2) return null;
      let x = p.x, y = p.y;
      near.forEach((d) => { x += d.x; y += d.y; });
      return { x: x / (near.length + 1), y: y / (near.length + 1) };
    }
  },
  woelfeJagen: { cards: ['woelfeJagen'], days: 3, width: 260, wait: () => hunterNearPrey('wolf') },
  wildJagen: { cards: ['wildJagen'], days: 3, width: 240, wait: () => hunterNearPrey('wild') },
  sammeln: {
    cards: ['sammeln'], days: 3, width: 200,
    wait: () => {
      const H = BT.app.sim.humans;
      const g = H.hunters.filter((h) => h.kind === 'sammel' && h.state === 'unterwegs');
      const a = g.find((h) => h.gathering && h.load > 10);
      if (!a) return null;
      // Laufvoegel in der Naehe machen das Bild besser, sind aber kein Muss
      const birds = BT.app.sim.herbivoreGroups.some((gr) => gr.spec.id === 'laufvogel' && Math.hypot(gr.x - a.x, gr.y - a.y) < 140);
      window.kbTries = (window.kbTries || 0) + 1;
      if (!birds && window.kbTries < 600) return null;
      return { x: a.x, y: a.y };
    }
  },
  ratten: {
    cards: ['ratten'], days: 0, width: 260,
    wait: () => {
      const sim = BT.app.sim, s = sim.humans.ships.find((sh) => sh.supply);
      if (!s || s.phase !== 'liegt' || s.t < 4 || !sim.rats.total) return null;
      const v = s.supply;
      return { x: (s.x * 0.55 + v.x * 0.45), y: (s.y * 0.55 + v.y * 0.45) };
    }
  }
};

/** In der Seite: ein Jaeger der Sorte kind ist nah an seiner Beute (Mitte zwischen beiden). */
function hunterNearPrey(kind) {
  const H = BT.app.sim.humans;
  for (const h of H.hunters) {
    const g = h.target;
    if (h.kind !== kind || h.state !== 'unterwegs' || !g || !g.members.length) continue;
    const d = Math.hypot(g.x - h.x, g.y - h.y);
    if (d < 110 && d > 50) return { x: h.x * 0.6 + g.x * 0.4, y: h.y * 0.6 + g.y * 0.4 };
  }
  return null;
}

(async () => {
  const argv = process.argv.slice(2);
  const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
  const ids = argv.filter((a) => !a.startsWith('--'));
  const seed = flags.seed || '482917';
  const [fx, fy] = (flags.landung || '0.17,0.5').split(',').map(Number);
  const browser = await chromium.launch();
  let failed = 0;
  for (const id of ids.length ? ids : Object.keys(SCENES)) {
    const sc = SCENES[id];
    if (!sc) { console.log('unbekannte Karte:', id); failed++; continue; }
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file://' + path.join(__dirname, '..', 'index.html') + '#seed=' + seed + '&size=mittel');
    await page.waitForFunction(() => window.BT && BT.app && BT.app.world && BT.app.sim, null, { timeout: 30000 });
    await page.addStyleTag({ content: '#season { display: none !important; }' });
    await page.addScriptTag({ content: hunterNearPrey.toString() });
    const at = await page.evaluate(({ fx, fy, cards, days, wait }) => {
      const app = BT.app, sim = app.sim;
      const waitFn = eval('(' + wait + ')');
      app.runDays(20);
      let err = app.play('landung', { x: app.world.width * fx, y: app.world.height * fy });
      app.setRunning(false);
      if (err) return { err: 'Landung: ' + err };
      // bis das Dorf steht
      for (let t = 0; t < 2000 && !sim.humans.villages.length; t++) sim.step();
      if (cards.length) {
        sim.cardPause = 0;
        for (const c of cards) {
          err = app.play(c, {});
          if (err) return { err: c + ': ' + err };
        }
        app.setRunning(false);
      }
      if (days) app.runDays(days);
      for (let t = 0; t < sim.ticksPerDay * 400; t++) {
        // Fruehling oder Sommer: das sieht freundlicher aus als Herbst und Winter
        const p = sim.calendar.season < 2 && waitFn();
        if (p) return p;
        sim.step();
      }
      return { err: 'Szene nicht gefunden' };
    }, { fx, fy, cards: sc.cards, days: sc.days, wait: sc.wait.toString() });
    if (at.err) { console.log(id + ':', at.err); failed++; await page.close(); continue; }
    const box = await page.evaluate(({ at, width }) => {
      const cam = BT.app.camera, canvas = document.getElementById('map');
      const r = canvas.getBoundingClientRect();
      // naeher heran, als man in der Oberflaeche zoomen darf; die Seite soll es nicht zuruecksetzen
      cam.setViewport = () => {};
      cam.scale = 960 / width;
      cam.x = at.x - r.width / cam.scale / 2;
      cam.y = at.y - r.height / cam.scale / 2;
      BT.app.updatePanel && BT.app.updatePanel();
      BT.app.redraw();
      return { x: r.left + r.width / 2 - 480, y: r.top + r.height / 2 - 240 };
    }, { at, width: sc.width });
    // zwei Bilder abwarten, damit alles gezeichnet und alle Bilder geladen sind
    await page.waitForTimeout(800);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => { BT.app.redraw(); setTimeout(() => requestAnimationFrame(res), 300); })));
    const out = path.join(__dirname, '..', 'assets', 'karte_' + id + '.png');
    await page.screenshot({ path: out, clip: { x: box.x, y: box.y, width: W, height: H } });
    console.log(errors.length ? id + ': Fehler\n' + errors.join('\n') : 'geschrieben: ' + path.relative(process.cwd(), out));
    if (errors.length) failed++;
    await page.close();
  }
  await browser.close();
  if (failed) process.exitCode = 1;
})();
