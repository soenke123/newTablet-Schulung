/**
 * Laedt die Browser-Skripte in einen Node-Sandbox-Kontext (wie die Tools in
 * Wild Clusters). Reihenfolge = Ladereihenfolge in index.html.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/rng.js', 'js/core/dmath.js', 'js/core/noise.js', 'js/core/grid.js', 'js/core/geometry.js', 'js/core/contour.js',
  'js/world/config.js', 'js/world/island.js', 'js/world/decor.js', 'js/world/world.js',
  'js/eco/time.js', 'js/eco/species.js', 'js/eco/fields.js', 'js/eco/landuse.js', 'js/eco/movement.js', 'js/eco/weather.js', 'js/eco/rats.js',
  'js/eco/cards.js', 'js/eco/humans.js',
  'js/eco/behavior.js', 'js/eco/stats.js', 'js/eco/simulation.js'
];

function load() {
  const sandbox = {
    console, Math, Date, Map, Set, Object, Array, JSON, String, Number,
    Uint8Array, Int32Array, Float32Array, Float64Array, isFinite, parseInt, Infinity
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
  return sandbox.BT;
}

module.exports = { load, FILES };
