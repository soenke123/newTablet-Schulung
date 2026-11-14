const { chromium } = require('playwright');
const S = __dirname + '/bilder/';
const URL = 'file:///workspace/newTablet-Schulung/MPSkills/tools/TinyLM/index.html?demo=1';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const want = n => !only || only.includes(String(n));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 940 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(URL);
  await p.waitForTimeout(1500);
  const pane = n => p.locator(`.phase-pane[data-phase="${n}"]`);
  const go = async n => { await p.click(`.phase-btn[data-n="${n}"]`); await p.waitForTimeout(1000); };
  const slider = async (n, spot, v) => {
    await pane(n).locator(`[data-spot="${spot}"] input`).evaluate((i, v) => { i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await p.waitForTimeout(300);
  };
  const shot = async (loc, name) => { await loc.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await loc.screenshot({ path: S + name + '.png' }); console.log('ok', name); };
  const clickN = async (loc, k) => { for (let i = 0; i < k; i++) { await loc.click(); await p.waitForTimeout(60); } };
  const view = async name => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200); await p.screenshot({ path: S + name + '.png' }); console.log('ok', name); };

  /* ---------- Phase 1 ---------- */
  if (want(1)) {
    const P = pane(1);
    await clickN(P.locator('[data-spot="step"]'), 28);
    await p.waitForTimeout(500);
    await view('p1-gesamt');
    await shot(P.locator('.phone'), 'p1-handy');
    await shot(P.locator('.p1-col[data-card="cand"]'), 'p1-kandidaten');
    await shot(P.locator('.p1-col[data-card="ctx"]'), 'p1-kontext');
    await shot(P.locator('.p1-col[data-card="src"]'), 'p1-quellen');
    // 1-Gramm: Wortsalat
    await P.locator('[data-spot="reset"]').click(); await p.waitForTimeout(300);
    await slider(1, 'nslider', 1);
    await clickN(P.locator('[data-spot="step"]'), 22);
    await shot(P.locator('.phone'), 'p1-handy-1gramm');
    // 6-Gramm: Abschreiben
    await P.locator('[data-spot="reset"]').click(); await p.waitForTimeout(300);
    await slider(1, 'nslider', 6);
    await clickN(P.locator('[data-spot="step"]'), 22);
    await shot(P.locator('.phone'), 'p1-handy-6gramm');
    await shot(P.locator('.p1-col[data-card="src"]'), 'p1-quellen-6gramm');
    // Temperatur hoch
    await P.locator('[data-spot="reset"]').click(); await p.waitForTimeout(300);
    await slider(1, 'nslider', 3);
    await slider(1, 'temp', 2);
    await clickN(P.locator('[data-spot="step"]'), 4);
    await shot(P.locator('.p1-col[data-card="cand"]'), 'p1-kandidaten-wild');
    await slider(1, 'temp', 0.2);
    await shot(P.locator('.p1-col[data-card="cand"]'), 'p1-kandidaten-sicher');
    // Quellen-Fenster
    await p.click('[data-spot="alle-quellen"]'); await p.waitForTimeout(800);
    await view('p1-alle-quellen');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  }

  /* ---------- Phase 2 ---------- */
  if (want(2)) {
    await go(2);
    const P = pane(2);
    const ask = async q => { await P.locator('.qform input').fill(q); await P.locator('.qform button[type=submit]').click(); await p.waitForTimeout(500); };
    await ask('Was frisst ein Hund?');
    await clickN(P.locator('[data-spot="step2"]'), 18);
    await p.waitForTimeout(400);
    await view('p2-gesamt');
    await shot(P.locator('.phone'), 'p2-handy');
    await shot(P.locator('.p1-col[data-card="ask"]'), 'p2-frage-zerlegen');
    await shot(P.locator('.p1-col[data-card="gram"]'), 'p2-kontext');
    await shot(P.locator('.p1-col[data-card="src"]'), 'p2-quellen');
    await P.locator('[data-spot="again"]').click(); await p.waitForTimeout(300);
    await ask('Wie hoch ist der Eiffelturm?');
    await clickN(P.locator('[data-spot="step2"]'), 18);
    await shot(P.locator('.phone'), 'p2-handy-eiffelturm');
    await P.locator('[data-spot="again"]').click(); await p.waitForTimeout(300);
    await ask('Ist die Erde eine Scheibe?');
    await clickN(P.locator('[data-spot="step2"]'), 18);
    await shot(P.locator('.phone'), 'p2-handy-erde');
    await shot(P.locator('.p1-col[data-card="ask"]'), 'p2-frage-erde');
  }

  /* ---------- Phase 3 ---------- */
  if (want(3)) {
    await go(3);
    const P = pane(3);
    await P.locator('.qform input').fill('Was frisst ein Welpe?');
    await P.locator('.qform button[type=submit]').click(); await p.waitForTimeout(800);
    await slider(3, 'jump3', 0.15);
    await clickN(P.locator('[data-spot="step3"]'), 16);
    await p.waitForTimeout(600);
    await view('p3-gesamt');
    await shot(P.locator('.phone'), 'p3-handy');
    await shot(P.locator('.p1-col[data-card="mean"]'), 'p3-frage-punkt');
    await shot(P.locator('.p1-col[data-card="jump"]'), 'p3-sprung');
    await shot(P.locator('.p1-col[data-card="cloud"]'), 'p3-wolke');
  }

  /* ---------- Phase 4 ---------- */
  if (want(4)) {
    await go(4);
    const P = pane(4);
    await view('p4-start');
    await P.locator('[data-spot="train"]').click();
    await p.waitForTimeout(25000);
    await shot(P.locator('.p1-col[data-card="train"]'), 'p4-training-frueh');
    await p.waitForTimeout(110000);
    await P.locator('[data-spot="train"]').click(); await p.waitForTimeout(600);
    await shot(P.locator('.p1-col[data-card="train"]'), 'p4-training');
    await P.locator('.qform input').fill('Was frisst ein Hund?');
    await P.locator('.qform button[type=submit]').click(); await p.waitForTimeout(600);
    await clickN(P.locator('[data-spot="genstep"]'), 14);
    await p.waitForTimeout(500);
    await view('p4-gesamt');
    await shot(P.locator('.phone'), 'p4-handy');
    await shot(P.locator('.p1-col[data-card="frage"]'), 'p4-frage');
    await shot(P.locator('.p1-col[data-card="cand"]'), 'p4-kandidaten');
    await shot(P.locator('.p1-col[data-card="embed"]'), 'p4-kontext');
    const net = P.locator('.p1-col[data-card="net"]');
    await net.locator('.p1-col-toggle').click(); await p.waitForTimeout(1200);
    await shot(net, 'p4-netz');
    await slider(4, 'qstrength', 3);
    await P.locator('[data-spot="genreset"]').click(); await p.waitForTimeout(300);
    await P.locator('.qform input').fill('Was frisst ein Hund?');
    await P.locator('.qform button[type=submit]').click(); await p.waitForTimeout(600);
    await clickN(P.locator('[data-spot="genstep"]'), 14);
    await shot(P.locator('.phone'), 'p4-handy-fragestaerke3');
  }
  await b.close();
})();
