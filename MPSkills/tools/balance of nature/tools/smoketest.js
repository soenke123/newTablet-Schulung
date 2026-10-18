/**
 * Prueft den Inselgenerator ohne Browser ueber viele Seeds:
 *   - gleicher Seed => identisches Raster (Reproduzierbarkeit)
 *   - Landanteil im Zielbereich, genau eine zusammenhaengende Insel
 *   - die tragenden Lebensraeume sind vorhanden (fuer die spaetere Simulation)
 *   - Laufzeit
 *
 *   node tools/smoketest.js [anzahlSeeds]
 */
const { load } = require('./load.js');
const BT = load();
const B = BT.BIOME;

const N = +(process.argv[2] || 20);
const failures = [];
const times = [];
const sums = {};

function check(cond, msg) { if (!cond) failures.push(msg); }

for (const size of ['klein', 'mittel', 'gross']) {
  for (let k = 0; k < (size === 'mittel' ? N : Math.ceil(N / 4)); k++) {
    const seed = 1000 + k * 7919;
    const t0 = Date.now();
    const w = BT.World.generate(seed, { size });
    times.push({ size, ms: Date.now() - t0 });
    const tag = `${size}/${seed}`;
    const s = w.areaShares;

    if (k < 3) {
      const again = BT.World.generate(seed, { size });
      check(BT.Grid.hash(again.biome) === BT.Grid.hash(w.biome), `${tag}: nicht reproduzierbar`);
    }
    check(s.land >= 0.30 && s.land <= 0.60, `${tag}: Landanteil ${(s.land * 100).toFixed(1)} %`);

    const landMask = new Uint8Array(w.biome.data.length);
    for (let i = 0; i < landMask.length; i++) landMask[i] = w.biome.data[i] !== B.DEEP && w.biome.data[i] !== B.SHALLOW ? 1 : 0;
    const cc = BT.Grid.connectedComponents(landMask, w.cols, w.rows);
    check(cc.components.length === 1, `${tag}: ${cc.components.length} Landmassen statt 1`);

    for (const key of ['tussock', 'scrub', 'fern', 'rock']) check(s[key] > 0.02, `${tag}: zu wenig ${key} (${(s[key] * 100).toFixed(1)} %)`);
    check(s.lake + s.river > 0.005, `${tag}: kaum Suesswasser`);
    check(w.features.rivers.length > 0, `${tag}: keine Fluesse`);

    if (size === 'mittel') for (const key in s) sums[key] = (sums[key] || 0) + s[key];
  }
}

console.log('Mittlere Flaechenanteile (mittel, Anteil am Land):');
for (const key of Object.keys(sums)) console.log('  ' + key.padEnd(9) + (sums[key] / N * 100).toFixed(1).padStart(6) + ' %');
for (const size of ['klein', 'mittel', 'gross']) {
  const t = times.filter((x) => x.size === size).map((x) => x.ms);
  console.log(`Laufzeit ${size}: Mittel ${Math.round(t.reduce((a, b) => a + b, 0) / t.length)} ms, max ${Math.max(...t)} ms`);
}
if (failures.length) {
  console.log(`\n${failures.length} Fehler:\n  ` + failures.join('\n  '));
  process.exitCode = 1;
} else {
  console.log('\nAlles in Ordnung.');
}
