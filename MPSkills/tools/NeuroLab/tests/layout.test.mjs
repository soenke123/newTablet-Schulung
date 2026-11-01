/* ══════════════════════════════════════════════════════════════
   NeuroLab — tests/layout.test.mjs
   ══════════════════════════════════════════════════════════════
   Prüfstand für das Aussehen: öffnet NeuroLab in mehreren Tablet-
   und Bildschirmgrößen, baut verschiedene Netze auf und prüft jedes
   Mal, ob

     1. jeder Kasten (Neuron, Eingang, Spaltenkopf) in seiner Spalte
        steht und nicht abgeschnitten wird,
     2. das Lernpanel ganz im Bild ist,
     3. JEDE eingeschaltete Verbindung eine Linie hat — auch Gewicht 0,
        auch beim Herauszoomen —, die auf dem Schirm mindestens 1 px
        dick ist und an ihren Kästen hängt (nicht ins Leere zeigt),
     4. sich keine zwei sichtbaren Gewichts-Beschriftungen überdecken,
     5. kein Text aus seinem Eingangsfeld läuft (sonst muss er gekürzt
        sein).

   Aufruf:  node MPSkills/tools/NeuroLab/tests/layout.test.mjs
            (mit FOTOS=1 legt er Bildschirmfotos in tests/fotos/ ab)
   ══════════════════════════════════════════════════════════════ */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP  = pathToFileURL(path.join(HERE, '..', 'index.html')).href;
const FOTOS = process.env.FOTOS ? path.join(HERE, 'fotos') : null;
if (FOTOS) fs.mkdirSync(FOTOS, { recursive: true });

const SIZES = [
  [1024, 768], [768, 1024], [1180, 820], [820, 1180],
  [1366, 1024], [1280, 800], [900, 600],
];

/* Jeder Aufbau ist Code, der IN der Seite läuft (state, render … sind dort
   global). Danach wird gemessen. */
const FULL = `(n) => { for (let l = 0; l < 4; l++) { const L = state.layers[l];
  L.count = n[l]; L.neurons = [];
  for (let i = 0; i < n[l]; i++) L.neurons.push(makeNeuron(l === 0 ? state.numInputs : n[l - 1])); } }`;
const CSV = fs.readFileSync(path.join(HERE, '..', 'Regen und Sonne.csv'), 'utf8');

const SETUPS = {
  'build-start':  `resetState(); state.phase = 'build'; render();`,
  'gatter':       `resetState(); state.phase = 'learn'; applyScenario('gates'); render();`,
  'gatter-info-zu': `resetState(); state.phase = 'learn'; applyScenario('gates'); state.learn.infoPanelOpen = false; render();`,
  '7-segment':    `resetState(); state.phase = 'learn'; applyScenario('seg7'); render();`,
  'zielscheibe':  `resetState(); state.phase = 'learn'; applyScenario('zielscheibe'); render();`,
  'zielscheibe-build': `resetState(); state.phase = 'learn'; applyScenario('zielscheibe'); state.phase = 'build'; render();`,
  'eigene-csv':   `resetState(); state.phase = 'learn'; state.learn.customData = parseCustomCSV(${JSON.stringify(CSV)});
                   state.learn.scenario = 'custom'; applyCustomScenarioInputsOnly(); render();`,
  'gross-run':    `resetState(); state.numInputs = 10; (${FULL})([10, 10, 10, 10]); state.phase = 'run'; render();`,
  'gross-build':  `resetState(); state.numInputs = 10; (${FULL})([10, 10, 10, 10]); state.phase = 'build'; render();`,
  /* Gewichte genau 0 und knapp daneben — früher verschwanden diese Kanten. */
  'gewichte-null': `resetState(); state.numInputs = 3; (${FULL})([3, 2, 0, 0]);
                   state.layers[0].neurons.forEach(n => n.weights = [0, 0.004, -0.009]);
                   state.layers[1].neurons.forEach(n => n.weights = [0, 0, 0.5]); state.phase = 'run'; render();`,
  /* Alter Stand: Kästen weit aus der Spalte verschoben, Panel weit rechts. */
  'verschoben':   `resetState(); state.phase = 'learn'; applyScenario('gates');
                   state.inputSpacing[0] = 3000; state.inputSpacing[1] = -3000;
                   state.layers[0].neurons[0].spacing = -5000; state.layers[0].neurons[5].spacing = 5000;
                   state.learn.panelX = 5000; state.learn.panelY = 5000; render();`,
  'trainiert':    `resetState(); state.phase = 'learn'; applyScenario('seg7'); render();
                   state.learn.speed = 50; for (let i = 0; i < 40; i++) trainTick(); render();`,
  'herausgezoomt': `resetState(); state.numInputs = 10; (${FULL})([10, 10, 10, 10]); state.phase = 'run'; render();
                   zoomBy(1 / 4);`,
  'herangezoomt': `resetState(); state.phase = 'learn'; applyScenario('seg7'); render(); zoomBy(3);`,
  'druck':        `resetState(); state.phase = 'learn'; applyScenario('gates'); printMode = true; render();`,
};

/* Läuft in der Seite und gibt eine Liste von Fehlern zurück. */
function measure() {
  const errs = [];
  const W = innerWidth, H = innerHeight;
  const s = view.scale;
  const port = document.getElementById('network').getBoundingClientRect();
  const name = el => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || el.tagName;

  // 1. Kästen in ihrer Spalte
  document.querySelectorAll('#net-stage > .col').forEach(col => {
    const c = col.getBoundingClientRect();
    col.querySelectorAll('.neuron-card, .input-node-row, .col-header > *, .random-btn').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1)
        errs.push(`${name(el)} ragt aus Spalte „${col.querySelector('.col-name')?.textContent}“`);
    });
  });

  // 5. Text läuft nicht aus seinem Feld (oder ist sichtbar gekürzt)
  document.querySelectorAll('.node-run-input-label, .node-circle, .col-name').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis')
      errs.push(`Text läuft über: „${el.textContent}“`);
  });

  // 2. Lernpanel im Bild
  const g = document.getElementById('learn-group');
  if (g) {
    const r = g.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > W + 0.5 || r.bottom > H + 0.5)
      errs.push(`Lernpanel ragt aus dem Bild: ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)} bei ${W}×${H}`);
  }

  // 3. Jede Verbindung hat eine sichtbare Linie
  let expected = 0;
  for (let li = 0; li < 4; li++) {
    const L = state.layers[li];
    if (!L.count) continue;
    const nSrc = li === 0 ? state.numInputs : state.layers[li - 1].count;
    L.neurons.forEach(n => { for (let si = 0; si < nSrc; si++) if (!n.disabled?.[si]) expected++; });
  }
  const lines = [...document.querySelectorAll('.edge-overlay line')];
  if (lines.length !== expected) errs.push(`${lines.length} Linien statt ${expected}`);

  const anchors = [...document.querySelectorAll('.neuron-svg, .node-run-input, .node-circle')]
    .map(el => el.getBoundingClientRect());
  const stage = document.getElementById('net-stage').getBoundingClientRect();
  const near = (x, y) => anchors.some(r => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3);
  let thin = 0, loose = 0;
  for (const l of lines) {
    const sw = parseFloat(getComputedStyle(l).strokeWidth);
    if (!(sw * s >= 0.99)) thin++;
    const x1 = stage.left + l.x1.baseVal.value * s, y1 = stage.top + l.y1.baseVal.value * s;
    const x2 = stage.left + l.x2.baseVal.value * s, y2 = stage.top + l.y2.baseVal.value * s;
    if (!near(x1, y1) || !near(x2, y2) || Math.hypot(x2 - x1, y2 - y1) < 2) loose++;
  }
  if (thin)  errs.push(`${thin} Linien dünner als 1 px auf dem Schirm (Maßstab ${s.toFixed(2)})`);
  if (loose) errs.push(`${loose} Linien hängen nicht an ihren Kästen`);

  // 4. Beschriftungen überdecken sich nicht
  const boxes = [...document.querySelectorAll('.edge-label')]
    .map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
  let overlap = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) overlap++;
  }
  if (overlap) errs.push(`${overlap} Gewichts-Beschriftungen überdecken sich`);

  // Die Ansicht selbst: kein Neuron außerhalb der Tafel-Ansicht beim Überblick
  if (!view.touched) {
    document.querySelectorAll('.neuron-card').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.left < port.left - 1 || r.right > port.right + 1 || r.top < port.top - 1 || r.bottom > port.bottom + 1)
        errs.push('Neuron im Überblick nicht ganz zu sehen');
    });
  }
  return [...new Set(errs)];
}

const browser = await pw.chromium.launch();
let failed = 0, runs = 0;
for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(APP);
  await page.evaluate(() => document.fonts.ready);
  for (const [key, js] of Object.entries(SETUPS)) {
    await page.evaluate(js);
    // ResizeObserver und Schrift sind einen Frame später dran.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const errs = await page.evaluate(measure);
    await page.evaluate(() => { printMode = false; });
    runs++;
    if (errs.length || pageErrors.length) {
      failed++;
      console.log(`✗ ${w}×${h} ${key}`);
      [...errs, ...pageErrors.splice(0)].forEach(e => console.log('    ' + e));
    }
    if (FOTOS) await page.screenshot({ path: path.join(FOTOS, `${key}_${w}x${h}.png`) });
  }
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} von ${runs} Ansichten mit Fehlern` : `✓ alle ${runs} Ansichten in Ordnung`);
process.exit(failed ? 1 : 0);
