/**
 * Abstimmwerkzeug: rechnet mehrere Inseln ueber viele Jahre ohne Grafik und
 * meldet, ob das Oekosystem haelt.
 *
 *   node tools/balance.js [seeds=6] [jahre=30] [--verlauf] [--size=mittel] [--typ=gras|wald|fels] [--seed=1000]
 *                         [--ohne=inselwolf,inseladler] [--karten=schafe@1,hunde@3]
 *
 * --verlauf  zeigt fuer den ersten Seed die Bestaende am Ende jedes Jahres
 * --ohne     startet ohne diese Arten (z. B. Vergleich mit und ohne Raeuber)
 * --karten   landet zu Beginn an der Kueste (nahe der Mitte der Westseite) und
 *            spielt die Karten zu Beginn des angegebenen Jahres (ohne Pause)
 */
const { load } = require('./load.js');
const BT = load();

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const pos = args.filter((a) => !a.startsWith('--'));
const SEEDS = +(pos[0] || 6);
const YEARS = +(pos[1] || 30);
const size = flags.size || 'mittel';
const type = flags.typ || 'ausgewogen';
const cards = flags.karten ? String(flags.karten).split(',').map((c) => { const [id, y] = c.split('@'); return { id, year: +(y || 0) }; }) : [];
// Eingeschleppte Arten (Schafe, Hunde) nur, wenn Karten gespielt werden
const ids = BT.SPECIES_ORDER.filter((id) => !BT.SPECIES[id].introduced || cards.length);
const without = flags.ohne ? String(flags.ohne).split(',') : [];
const start = Object.fromEntries(without.map((id) => [id, 0]));
const HEALTH = BT.FOOD_ORDER.filter((k) => BT.FOOD[k].damage);
const short = { zwerghirsch: 'Hirsch', laufvogel: 'Vogel', inselwolf: 'Wolf', inseladler: 'Adler', schaf: 'Schaf', hund: 'Hund' };

/** Landepunkt: die Kuestenzelle, die der Mitte der Westseite am naechsten liegt. */
function coastPoint(world) {
  let best = null, bestD = Infinity;
  const tx = world.width * 0.1, ty = world.height * 0.5;
  for (let gy = 0; gy < world.rows; gy++) {
    for (let gx = 0; gx < world.cols; gx++) {
      const i = gy * world.cols + gx;
      if (!BT.BIOME_INFO[world.biome.data[i]].land || world.fields.distSea[i] > 1.5) continue;
      const x = (gx + 0.5) * world.cellSize, y = (gy + 0.5) * world.cellSize;
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

const summary = [];
for (let s = 0; s < SEEDS; s++) {
  const seed = flags.seed ? +flags.seed + s * 7919 : 1000 + s * 7919;
  const world = BT.World.generate(seed, { size, type });
  const t0 = Date.now();
  const sim = new BT.Simulation(world, cards.length ? { start, cardPause: 0 } : { start });
  if (cards.length) {
    const err = sim.play('landung', coastPoint(world));
    if (err) console.log(`  ${seed}: Landung: ${err}`);
    sim.runDays(10);
  }
  const yearly = [];
  for (let y = 0; y < YEARS; y++) {
    for (const c of cards) {
      if (c.year !== y) continue;
      const err = sim.play(c.id, {});
      if (err) console.log(`  ${seed}: Karte ${c.id} in Jahr ${y}: ${err}`);
    }
    sim.runDays(BT.Time.DAYS_PER_YEAR);
    const r = sim.stats.latest();
    yearly.push(r);
    if (ids.every((id) => r.count[id] === 0)) break;
  }
  if (cards.length) {
    const ev = sim.events.filter((e) => BT.CARDS[e.card].kind !== 'info').map((e) => BT.CARDS[e.card].icon + ' J' + BT.Time.calendar(e.day).year + (e.at && e.at.text ? ' (' + e.at.text + ')' : ''));
    console.log(`  ${seed}: ` + ev.join(' · '));
  }
  const ms = Date.now() - t0;
  const hist = sim.stats.history;
  const range = {}, mean = {};
  const late = hist.slice(Math.floor(hist.length / 3));
  for (const id of ids) {
    const vals = late.map((r) => r.count[id]);
    range[id] = [Math.min(...vals), Math.max(...vals)];
    mean[id] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const food = {};
  for (const k of BT.FOOD_ORDER) food[k] = late.reduce((a, r) => a + r.food[k], 0) / late.length;
  const health = {};
  for (const k of HEALTH) health[k] = late.reduce((a, r) => a + r.health[k], 0) / late.length;
  summary.push({ seed, sim, range, mean, food, health, ms, years: yearly.length });

  if (flags.verlauf && s === 0) {
    console.log(`Seed ${seed}: Bestand am Jahresende (Jungtiere in Klammern) · Nahrung in %`);
    console.log('Jahr  ' + ids.map((id) => short[id].padStart(11)).join('') + '   Gras Laub Frucht Insekt  Zustand ' + HEALTH.join(' '));
    yearly.forEach((r, i) => {
      console.log(String(i + 1).padStart(4) + '  ' + ids.map((id) => `${r.count[id]}(${r.young[id]})`.padStart(11)).join('') +
        '   ' + BT.FOOD_ORDER.map((k) => String(Math.round(r.food[k] * 100)).padStart(5)).join('') +
        '         ' + HEALTH.map((k) => String(Math.round(r.health[k] * 100)).padStart(5)).join(''));
    });
    console.log('Todesursachen:');
    for (const id of ids) console.log('  ' + short[id].padEnd(7) + JSON.stringify(sim.stats.deaths[id]) + '  Geburten ' + sim.stats.births[id]);
    console.log('');
  }
}

console.log(`${SEEDS} Inseln × ${YEARS} Jahre (${size}, ${type})`);
for (const r of summary) {
  const ext = ids.filter((id) => r.sim.stats.extinct[id] != null).map((id) => short[id] + ' J' + BT.Time.calendar(r.sim.stats.extinct[id]).year);
  console.log(`  ${r.seed}: ` + ids.map((id) => `${short[id]} ${r.range[id][0]}–${r.range[id][1]}`).join(' · ') +
    (ext.length ? '  ✗ ausgestorben: ' + ext.join(', ') : '  ✓') + `  (${(r.ms / 1000).toFixed(1)} s)`);
}
const survived = summary.filter((r) => ids.every((id) => r.sim.stats.extinct[id] == null)).length;
console.log(`Alle Arten überlebt: ${survived} von ${SEEDS}`);
const avgOf = (f) => summary.reduce((a, r) => a + f(r), 0) / summary.length;
console.log('Mittlerer Bestand (ab Jahr ' + Math.ceil(YEARS / 3) + '): ' +
  ids.map((id) => short[id] + ' ' + Math.round(avgOf((r) => r.mean[id]))).join(' · ') +
  ' · Nahrung ' + BT.FOOD_ORDER.map((k) => k + ' ' + Math.round(avgOf((r) => r.food[k]) * 100) + ' %').join(', ') +
  ' · Zustand ' + HEALTH.map((k) => k + ' ' + Math.round(avgOf((r) => r.health[k]) * 100) + ' %').join(', '));
