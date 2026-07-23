// Headless solver — extracts engine + levels from index.html and runs BFS.
// Usage: node verify.mjs [levelIndex]
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const jsSrc = html.slice(scriptStart + 8, scriptEnd);

// Strip browser-only bits: document, window, addEventListener at top-level, Worker, DOM refs.
// Simpler: eval only up through LEVELS definition and MAKE state; skip UI.
// We take the substring from "// Constants" to "// -- STATE FACTORY end (right after makeStateFromLevel).

const startMarker = '// Constants (must remain pure';
const endMarker = 'function makeStateFromLevel';
const si = jsSrc.indexOf(startMarker);
const ei = jsSrc.indexOf(endMarker);
if (si < 0 || ei < 0) { console.error('markers not found'); process.exit(1); }

// Take from start marker through end of LEVELS (i.e., through the `];` closing LEVELS)
// We'll cut at "// STATE FACTORY" header (right before makeStateFromLevel).
const engineAndLevels = jsSrc.slice(si, ei);

// Now also grab makeStateFromLevel itself:
const factoryStart = jsSrc.indexOf('function makeStateFromLevel');
const factoryEnd   = jsSrc.indexOf('}\n', factoryStart) + 2;
const factorySrc   = jsSrc.slice(factoryStart, factoryEnd);

const src = engineAndLevels + '\n' + factorySrc + `
export { NOUNS, PROPS, DIRS, LEVELS, makeStateFromLevel, step, cloneState, hashState, deriveRules };
`;

// Write to temp module and import
const tmp = new URL('./_engine.mjs', import.meta.url);
fs.writeFileSync(tmp, src);
const eng = await import('./_engine.mjs');

function bfs(state, maxDepth, nodeCap, deadlineMs) {
  const t0 = Date.now();
  const visited = new Set([eng.hashState(state)]);
  const queue = [{ s: state, path: '' }];
  let head = 0, nodes = 0;
  const dirs = ['up','right','down','left'];
  while (head < queue.length) {
    if (nodes >= nodeCap) return { status: 'cap', nodes };
    if (Date.now() - t0 > deadlineMs) return { status: 'timeout', nodes };
    const { s, path } = queue[head++];
    if (path.length >= maxDepth) continue;
    for (const d of dirs) {
      const ns = eng.step(s, d);
      if (ns.won) return { status: 'ok', moves: path + d[0].toUpperCase(), nodes };
      if (ns.lost) continue;
      const h = eng.hashState(ns);
      if (visited.has(h)) continue;
      visited.add(h);
      queue.push({ s: ns, path: path + d[0].toUpperCase() });
      nodes++;
    }
  }
  return { status: 'exhausted', nodes };
}

const only = process.argv[2] ? parseInt(process.argv[2], 10) : null;
for (let i = 0; i < eng.LEVELS.length; i++) {
  if (only !== null && i !== only) continue;
  const lvl = eng.LEVELS[i];
  const state = eng.makeStateFromLevel(lvl);
  console.log(`\n=== Level ${i+1}: ${lvl.name} (${lvl.w}x${lvl.h}) ===`);
  let last = null;
  for (const d of [20, 40, 70, 100]) {
    last = bfs(state, d, 800_000, 12_000);
    if (last.status === 'ok') break;
    if (last.status === 'timeout' || last.status === 'cap') break;
    console.log(`  depth ${d}: ${last.status} (nodes ${last.nodes})`);
  }
  if (last.status === 'ok') {
    console.log(`  ✓ SOLVED in ${last.moves.length} moves: ${last.moves}`);
  } else {
    console.log(`  ✗ UNVERIFIED (${last.status}, nodes ${last.nodes})`);
  }
}
