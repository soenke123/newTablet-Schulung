/**
 * Headless-Smoketest der Weltgenerierung.
 * Laedt die Browser-Skripte in einen globalen Kontext und prueft ueber viele
 * Seeds: Reproduzierbarkeit, Flaechenanteile, Objektzahlen, Regelverstoesse.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || require('path').join(__dirname, '..');
const FILES = [
  'js/core/rng.js',
  'js/core/noise.js',
  'js/core/grid.js',
  'js/core/geometry.js',
  'js/core/contour.js',
  'js/world/config.js',
  'js/world/terrain.js',
  'js/world/rules.js',
  'js/world/objects.js',
  'js/world/validate.js',
  'js/world/world.js'
];

const sandbox = { console, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, Math, Date };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: f });
  } catch (e) {
    console.error('FEHLER beim Laden von ' + f + ': ' + e.message);
    process.exit(1);
  }
}

const WL = sandbox.WL;
const seeds = [482917, 839214, 100001, 234567, 777777, 13579, 999999, 424242, 606060, 315927, 8, 5551212];
// zusaetzlich eine breite Streuung, damit Ausreisser auffallen
for (let i = 1; i <= 18; i++) seeds.push(i * 37913 + 1000);

let failures = 0;
console.log('Seed      | Gras  Wald  Wass  Bode | Was Wal Gra | Baum Res(P) Apf(G) Ame | ms   | Status');
console.log('-'.repeat(104));

const pct = (v) => (v * 100).toFixed(1).padStart(5);

for (const seed of seeds) {
  const w = WL.World.generate(seed);
  const r = w.areaRatios;
  const c = w.validation.counts;
  const v = w.validation.violations;
  const warn = w.validation.warnings;

  const status = v.length === 0
    ? (warn.length ? 'ok (' + warn.map(x => x.id).join(',') + ')' : 'ok')
    : 'VERSTOSS: ' + v.map(x => x.id + 'x' + x.count).join(', ');
  if (v.length) failures++;

  console.log(
    String(seed).padEnd(9) + ' |' +
    pct(r.grass) + pct(r.forest) + pct(r.water) + pct(r.visibleGround) + ' |' +
    String(c.waterBodies).padStart(4) + String(c.forestRegions).padStart(4) + String(c.grasslands).padStart(4) + ' |' +
    String(c.trees).padStart(5) + String(c.resources + '(' + c.resourcePatches + ')').padStart(7) +
    String(c.appleTrees + '(' + c.appleGroups + ')').padStart(7) + String(c.anthills).padStart(4) + ' |' +
    String(w.meta.generationMs).padStart(6) + ' | ' + status
  );
}

// Reproduzierbarkeit
const a = WL.World.generate(482917);
const b = WL.World.generate(482917);
const same = a.meta.gridHash === b.meta.gridHash &&
  JSON.stringify(a.objects.trees) === JSON.stringify(b.objects.trees) &&
  JSON.stringify(a.objects.anthills) === JSON.stringify(b.objects.anthills) &&
  JSON.stringify(a.objects.appleTrees) === JSON.stringify(b.objects.appleTrees);
console.log('\nReproduzierbarkeit (Seed 482917 zweimal): ' + (same ? 'IDENTISCH' : 'ABWEICHUNG!'));
if (!same) failures++;

const c1 = WL.World.generate(482917).meta.gridHash;
const c2 = WL.World.generate(839214).meta.gridHash;
console.log('Verschiedene Seeds ergeben verschiedene Welten: ' + (c1 !== c2 ? 'ja' : 'NEIN!'));
if (c1 === c2) failures++;

// Konturen
const world = WL.World.generate(482917);
for (const [name, type] of [['Gras', 1], ['Wald', 2], ['Wasser', 3]]) {
  const t0 = Date.now();
  const polys = WL.Contour.polygonsFromMask(
    world.terrain.grid.mask(type), world.cols, world.rows,
    { cellSize: world.cellSize, smoothing: 3, minArea: 400 }
  );
  const pts = polys.reduce((s, p) => s + p.length, 0);
  console.log('Konturen ' + name + ': ' + polys.length + ' Ringe, ' + pts + ' Punkte, ' + (Date.now() - t0) + ' ms');
}

console.log('\n' + (failures === 0 ? 'ALLE PRUEFUNGEN BESTANDEN' : failures + ' FEHLGESCHLAGEN'));
process.exit(failures === 0 ? 0 : 1);
