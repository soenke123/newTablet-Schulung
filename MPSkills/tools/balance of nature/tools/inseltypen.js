/**
 * Flaechenanteile der Lebensraeume je Inseltyp (BT.ISLAND_TYPES), gemittelt ueber
 * mehrere Seeds, als Anteil am Land:
 *
 *   node tools/inseltypen.js [seeds=8] [--size=mittel]
 */
const { load } = require('./load.js');
const BT = load();

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')));
const N = +(args.find((a) => !a.startsWith('--')) || 8);
const size = flags.size || 'mittel';
const B = BT.BIOME;
// Gruppen wie im Unterricht: offen, Wald, Fels
const GROUPS = {
  Gras: [B.TUSSOCK], Busch: [B.SCRUB], Wald: [B.FERN, B.MOSS], Sumpf: [B.SWAMP],
  Fels: [B.ROCK, B.PEAK, B.THERMAL], Strand: [B.BEACH]
};

console.log(`${N} Seeds (${size}), Anteil am Land in %`);
console.log('Typ'.padEnd(12) + Object.keys(GROUPS).map((g) => g.padStart(8)).join(''));
for (const type of Object.keys(BT.ISLAND_TYPES)) {
  const sums = {};
  for (let s = 0; s < N; s++) {
    const w = BT.World.generate(1000 + s * 7919, { size, type });
    const d = w.biome.data, count = new Array(BT.BIOME_INFO.length).fill(0);
    let land = 0;
    for (let i = 0; i < d.length; i++) if (BT.BIOME_INFO[d[i]].land) { count[d[i]]++; land++; }
    for (const g in GROUPS) sums[g] = (sums[g] || 0) + GROUPS[g].reduce((a, b) => a + count[b], 0) / land;
  }
  console.log(type.padEnd(12) + Object.keys(GROUPS).map((g) => (sums[g] / N * 100).toFixed(1).padStart(8)).join(''));
}
