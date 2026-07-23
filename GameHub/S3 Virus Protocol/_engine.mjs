// Constants (must remain pure — copied verbatim into solver worker)
// -----------------------------------------------------------------------------
const NOUNS = ['VIRUS','FIREWALL','SYSTEM','WLAN','KEY','APP','HARDWARE','CACHE','CODE'];
const PROPS = ['YOU','WIN','DEFEAT','STOP','PUSH','OPEN','LOCKED'];
const DIRS  = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

// Zweizeilige Anzeige für längere Textsteine, damit die Beschriftung nicht
// über den Steinrand hinausläuft. Kurze Labels (KEY, APP, YOU, WIN, IS) bleiben
// einzeilig.
const TEXT_LABEL = {
  VIRUS:'VIR\nUS', FIREWALL:'FIRE\nWALL', SYSTEM:'SYS\nTEM',
  WLAN:'WL\nAN', HARDWARE:'HARD\nWARE', CACHE:'CA\nCHE', CODE:'CO\nDE',
  DEFEAT:'DEF\nEAT', STOP:'ST\nOP', PUSH:'PU\nSH', OPEN:'OP\nEN',
  LOCKED:'LOC\nKED', MAKE:'MA\nKE',
};

// -----------------------------------------------------------------------------
// ENGINE — pure functions (also stringified into the solver worker)
// -----------------------------------------------------------------------------
function isText(k)     { return k.charCodeAt(0) === 84 && k.charCodeAt(1) === 95; } // 'T_'
function isNounText(k) { return isText(k) && NOUNS.includes(k.slice(2)); }
function isPropText(k) { return isText(k) && PROPS.includes(k.slice(2)); }

function cloneState(s) {
  const cells = new Array(s.cells.length);
  for (let i = 0; i < s.cells.length; i++) {
    const src = s.cells[i];
    const dst = new Array(src.length);
    for (let j = 0; j < src.length; j++) dst[j] = { kind: src[j].kind, id: src[j].id };
    cells[i] = dst;
  }
  return { w: s.w, h: s.h, cells, won: s.won, lost: s.lost, turn: s.turn, nextId: s.nextId };
}

function hashState(s) {
  const parts = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const c = s.cells[y*s.w+x];
      if (c.length === 0) continue;
      const ks = c.map(e => e.kind).sort();
      parts.push(x + ',' + y + ':' + ks.join('|'));
    }
  }
  return parts.join(';');
}

function deriveRules(s) {
  const rules = new Map();
  const add = (n, v) => {
    let set = rules.get(n);
    if (!set) { set = new Set(); rules.set(n, set); }
    set.add(v);
  };
  const cellHas = (x, y, k) => {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
    const c = s.cells[y*s.w+x];
    for (const e of c) if (e.kind === k) return true;
    return false;
  };
  const cellKinds = (x, y) => {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return [];
    return s.cells[y*s.w+x].map(e => e.kind);
  };
  const tryTrip = (nx,ny, ix,iy, px,py) => {
    if (!cellHas(ix, iy, 'T_IS')) return;
    const nouns = cellKinds(nx, ny).filter(isNounText);
    if (nouns.length === 0) return;
    const props = cellKinds(px, py);
    for (const n of nouns) {
      const noun = n.slice(2);
      for (const p of props) {
        if (isPropText(p)) add(noun, p.slice(2));
        else if (isNounText(p)) add(noun, p.slice(2));
      }
    }
  };
  // NOUN MAKE NOUN → source noun spawns target noun to its right each tick
  const tryMakeTrip = (nx,ny, ix,iy, px,py) => {
    if (!cellHas(ix, iy, 'T_MAKE')) return;
    const sources = cellKinds(nx, ny).filter(isNounText);
    if (sources.length === 0) return;
    const targets = cellKinds(px, py).filter(isNounText);
    if (targets.length === 0) return;
    for (const s1 of sources)
      for (const t1 of targets)
        add(s1.slice(2), 'MAKE:' + t1.slice(2));
  };
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x <= s.w - 3; x++) {
      tryTrip    (x, y, x+1, y, x+2, y);
      tryMakeTrip(x, y, x+1, y, x+2, y);
    }
  for (let x = 0; x < s.w; x++)
    for (let y = 0; y <= s.h - 3; y++) {
      tryTrip    (x, y, x, y+1, x, y+2);
      tryMakeTrip(x, y, x, y+1, x, y+2);
    }
  return rules;
}

// Renderer-only: returns active rule triples with bounding box, semantic type
// (matches chip classes), and participating text-tile entity IDs. Not used by
// the solver.
function deriveRuleGroups(s) {
  const PROP_PRIORITY = ['YOU','WIN','DEFEAT','LOCKED','OPEN','PUSH','STOP'];
  const PROP_CLASS = {
    YOU:'you', WIN:'win', DEFEAT:'def', STOP:'stop',
    LOCKED:'lock', PUSH:'push', OPEN:'open',
  };
  const groups = [];
  const cellEnts = (x, y) => {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return [];
    return s.cells[y*s.w+x];
  };
  const tryGroup = (nx,ny, ix,iy, px,py) => {
    const midE = cellEnts(ix, iy);
    const isTile   = midE.find(e => e.kind === 'T_IS');
    const makeTile = midE.find(e => e.kind === 'T_MAKE');
    if (!isTile && !makeTile) return;
    const nounE = cellEnts(nx, ny).filter(e => isNounText(e.kind));
    if (nounE.length === 0) return;
    const targE = cellEnts(px, py);
    const propTargs = targE.filter(e => isPropText(e.kind));
    const nounTargs = targE.filter(e => isNounText(e.kind));

    let type = null;
    let targetTiles = [];
    let verbTile = null;
    if (isTile && propTargs.length > 0) {
      const propKinds = propTargs.map(e => e.kind.slice(2));
      let chosen = null;
      for (const p of PROP_PRIORITY) if (propKinds.includes(p)) { chosen = p; break; }
      if (!chosen) chosen = propKinds[0];
      type = PROP_CLASS[chosen] || 'stop';
      verbTile = isTile;
      targetTiles = propTargs;
    } else if (makeTile && nounTargs.length > 0) {
      type = 'make';
      verbTile = makeTile;
      targetTiles = nounTargs;
    } else if (isTile && nounTargs.length > 0) {
      type = 'trans';
      verbTile = isTile;
      targetTiles = nounTargs;
    } else {
      return;
    }

    const ids = [verbTile.id];
    for (const e of nounE) ids.push(e.id);
    for (const e of targetTiles) ids.push(e.id);

    groups.push({
      x0: Math.min(nx, px), y0: Math.min(ny, py),
      x1: Math.max(nx, px), y1: Math.max(ny, py),
      type, ids,
    });
  };
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x <= s.w - 3; x++)
      tryGroup(x, y, x+1, y, x+2, y);
  for (let x = 0; x < s.w; x++)
    for (let y = 0; y <= s.h - 3; y++)
      tryGroup(x, y, x, y+1, x, y+2);
  return groups;
}

function applyTransforms(s, rules) {
  const swaps = new Map();
  for (const [noun, set] of rules) {
    for (const v of set) {
      if (NOUNS.includes(v) && v !== noun && !swaps.has(noun)) {
        swaps.set(noun, v);
        break;
      }
    }
  }
  if (swaps.size === 0) return s;
  const ns = cloneState(s);
  for (const cell of ns.cells)
    for (const e of cell)
      if (swaps.has(e.kind)) e.kind = swaps.get(e.kind);
  return ns;
}

function hasProp(rules, noun, prop) {
  const set = rules.get(noun);
  return set ? set.has(prop) : false;
}

function step(state, dir) {
  const d = DIRS[dir];
  if (!d) return state;
  const [dx, dy] = d;

  // Tick sequence: derive → transform → re-derive → move → interact → re-check
  let s = cloneState(state);
  let rules = deriveRules(s);
  s = applyTransforms(s, rules);
  rules = deriveRules(s);

  // Collect YOU entities in deterministic order
  const yous = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++)
      for (const e of s.cells[y*s.w+x])
        if (!isText(e.kind) && hasProp(rules, e.kind, 'YOU')) yous.push({ id: e.id, x, y });
  yous.sort((a,b) => (a.y*s.w+a.x) - (b.y*s.w+b.x));

  if (yous.length === 0) { s.lost = true; s.turn++; return s; }

  for (const yo of yous) tryMove(s, yo.id, dx, dy, rules);

  resolveInteractions(s, rules);
  rules = deriveRules(s);
  applyMakes(s, rules);
  rules = deriveRules(s);
  resolveInteractions(s, rules);

  // Post-check
  rules = deriveRules(s);
  let anyYou = false, anyWinHit = false;
  for (let i = 0; i < s.cells.length; i++) {
    const c = s.cells[i];
    let yHere = false, wHere = false;
    for (const e of c) {
      if (isText(e.kind)) continue;
      if (hasProp(rules, e.kind, 'YOU')) { anyYou = true; yHere = true; }
      if (hasProp(rules, e.kind, 'WIN'))  { wHere = true; }
    }
    if (yHere && wHere) anyWinHit = true;
  }
  if (anyWinHit) s.won = true;
  else if (!anyYou) s.lost = true;
  s.turn++;
  return s;
}

function findEnt(s, id) {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const c = s.cells[y*s.w+x];
      for (let i = 0; i < c.length; i++)
        if (c[i].id === id) return { x, y, idx: i };
    }
  return null;
}

function tryMove(s, id, dx, dy, rules) {
  const start = findEnt(s, id);
  if (!start) return false;
  const startCell = s.cells[start.y*s.w + start.x];
  const startEnt = startCell[start.idx];
  if (!startEnt) return false;

  // Push chain: walk in direction, accumulate pushable entities (text OR PUSH).
  // Chain fails if a tile has STOP or a LOCKED entity (unless chain contains OPEN).
  const chain = [ { x: start.x, y: start.y, ids: [id] } ];
  let cx = start.x, cy = start.y;
  const visited = new Set([id]);
  let chainHasOpen = hasProp(rules, startEnt.kind, 'OPEN');

  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return false;
    const cell = s.cells[ny*s.w+nx];
    // Check blockers: STOP always blocks; LOCKED blocks unless chain has OPEN.
    for (const e of cell) {
      if (isText(e.kind)) continue;
      if (hasProp(rules, e.kind, 'STOP')) return false;
      if (hasProp(rules, e.kind, 'LOCKED') && !chainHasOpen) return false;
    }
    const push = cell.filter(e =>
      !visited.has(e.id) &&
      (isText(e.kind) || hasProp(rules, e.kind, 'PUSH'))
    );
    if (push.length === 0) break;
    for (const e of push) {
      visited.add(e.id);
      if (hasProp(rules, e.kind, 'OPEN')) chainHasOpen = true;
    }
    chain.push({ x: nx, y: ny, ids: push.map(e => e.id) });
    cx = nx; cy = ny;
  }

  // Execute chain from end to start to avoid stomping.
  for (let i = chain.length - 1; i >= 0; i--) {
    const { x, y, ids } = chain[i];
    const cell = s.cells[y*s.w+x];
    const dstCell = s.cells[(y+dy)*s.w + (x+dx)];
    for (const eid of ids) {
      const idx = cell.findIndex(e => e.id === eid);
      if (idx === -1) continue;
      const [e] = cell.splice(idx, 1);
      dstCell.push(e);
    }
  }
  return true;
}

function resolveInteractions(s, rules) {
  // 1. OPEN + LOCKED co-located → remove one of each per tile (iterate until stable).
  let dirty = true, guard = 0;
  while (dirty && guard++ < 30) {
    dirty = false;
    for (let ci = 0; ci < s.cells.length; ci++) {
      const cell = s.cells[ci];
      let openIdx = -1, lockIdx = -1;
      for (let i = 0; i < cell.length; i++) {
        const e = cell[i];
        if (isText(e.kind)) continue;
        if (openIdx === -1 && hasProp(rules, e.kind, 'OPEN'))    openIdx = i;
        else if (lockIdx === -1 && hasProp(rules, e.kind, 'LOCKED')) lockIdx = i;
        if (openIdx !== -1 && lockIdx !== -1 && openIdx !== lockIdx) break;
      }
      // If the same entity has both OPEN and LOCKED, don't self-annihilate (weird edge case)
      if (openIdx === -1 || lockIdx === -1 || openIdx === lockIdx) continue;
      const removeIds = new Set([cell[openIdx].id, cell[lockIdx].id]);
      for (let i = cell.length - 1; i >= 0; i--)
        if (removeIds.has(cell[i].id)) cell.splice(i, 1);
      dirty = true;
    }
  }
  // 2. DEFEAT: if a tile holds a DEFEAT entity plus any other non-text entity
  //    (including a second DEFEAT), all non-text entities on that tile are destroyed.
  for (const cell of s.cells) {
    let hasDef = false, nonTextCount = 0;
    for (const e of cell) {
      if (isText(e.kind)) continue;
      nonTextCount++;
      if (hasProp(rules, e.kind, 'DEFEAT')) hasDef = true;
    }
    if (!hasDef || nonTextCount < 2) continue;
    for (let i = cell.length - 1; i >= 0; i--) {
      if (!isText(cell[i].kind)) cell.splice(i, 1);
    }
  }
}

// NOUN MAKE NOUN: after every tick, each producer spawns a target to its right.
// If the tile right of the producer is empty → spawn. If it holds PUSH blocks
// that can be shoved further right → shove, then spawn. Otherwise (STOP, LOCKED,
// any non-pushable entity, or grid edge) → no spawn.
function applyMakes(s, rules) {
  const makesByKind = new Map();
  for (const [noun, set] of rules) {
    for (const v of set) {
      if (typeof v === 'string' && v.indexOf('MAKE:') === 0) {
        const target = v.slice(5);
        if (!NOUNS.includes(target)) continue;
        let arr = makesByKind.get(noun);
        if (!arr) { arr = []; makesByKind.set(noun, arr); }
        if (arr.indexOf(target) === -1) arr.push(target);
      }
    }
  }
  if (makesByKind.size === 0) return;

  // Producers in reading order for deterministic spawning.
  const producers = [];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      for (const e of s.cells[y*s.w+x]) {
        if (isText(e.kind)) continue;
        const targets = makesByKind.get(e.kind);
        if (!targets) continue;
        for (const t of targets) producers.push({ x, y, target: t });
      }
    }
  }

  if (s.nextId == null) {
    let m = 0;
    for (const cell of s.cells) for (const e of cell) if (e.id > m) m = e.id;
    s.nextId = m + 1;
  }

  const dx = 1, dy = 0; // always to the right
  for (const p of producers) {
    const tx = p.x + dx, ty = p.y + dy;
    if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) continue;
    if (!tryPushChainForSpawn(s, tx, ty, dx, dy, rules)) continue;
    s.cells[ty*s.w+tx].push({ kind: p.target, id: s.nextId++ });
  }
}

// Clear a spawn tile by shoving its pushable contents in (dx,dy). Returns true
// if the spawn may proceed. STOP/LOCKED aborts; text/PUSH gets shoved along a
// chain; other entities (e.g. DEFEAT-only like FIREWALL) stay put and the
// spawn lands on top of them — post-spawn resolveInteractions handles DEFEAT.
function tryPushChainForSpawn(s, x, y, dx, dy, rules) {
  const cell = s.cells[y*s.w+x];
  for (const e of cell) {
    if (isText(e.kind)) continue;
    if (hasProp(rules, e.kind, 'STOP')) return false;
    if (hasProp(rules, e.kind, 'LOCKED')) return false;
  }
  const firstPush = cell.filter(e => isText(e.kind) || hasProp(rules, e.kind, 'PUSH'));
  if (firstPush.length === 0) return true;
  const chain = [{ x, y, ids: firstPush.map(e => e.id) }];
  const visited = new Set(chain[0].ids);
  let cx = x, cy = y;
  while (true) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return false;
    const nc = s.cells[ny*s.w+nx];
    for (const e of nc) {
      if (isText(e.kind)) continue;
      if (hasProp(rules, e.kind, 'STOP')) return false;
      if (hasProp(rules, e.kind, 'LOCKED')) return false;
    }
    const push = nc.filter(e =>
      !visited.has(e.id) &&
      (isText(e.kind) || hasProp(rules, e.kind, 'PUSH'))
    );
    if (push.length === 0) break;
    for (const e of push) visited.add(e.id);
    chain.push({ x: nx, y: ny, ids: push.map(e => e.id) });
    cx = nx; cy = ny;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const seg = chain[i];
    const c  = s.cells[seg.y*s.w+seg.x];
    const dc = s.cells[(seg.y+dy)*s.w+(seg.x+dx)];
    for (const eid of seg.ids) {
      const idx = c.findIndex(e => e.id === eid);
      if (idx === -1) continue;
      const [e] = c.splice(idx, 1);
      dc.push(e);
    }
  }
  return true;
}

// -----------------------------------------------------------------------------
// LEVEL DEFINITIONS
// Each level: { name, w, h, entities: [{kind,x,y}], text: [{kind,x,y}] }
// Entities are game objects; text are word blocks (kind prefixed 'T_').
// -----------------------------------------------------------------------------
function border(w, h, kind) {
  const out = [];
  for (let x = 0; x < w; x++) { out.push({kind, x, y:0}); out.push({kind, x, y:h-1}); }
  for (let y = 1; y < h-1; y++) { out.push({kind, x:0, y}); out.push({kind, x:w-1, y}); }
  return out;
}

const LEVELS = [
  {
    name: 'Level 1',
    w: 12, h: 9,
    entities: [
      { kind:'VIRUS',    x:0, y:0 }, { kind:'HARDWARE', x:5, y:0 }, { kind:'FIREWALL', x:8, y:0 },
      { kind:'KEY',      x:1, y:1 }, { kind:'HARDWARE', x:5, y:1 }, { kind:'FIREWALL', x:8, y:1 },
      { kind:'WLAN',     x:5, y:2 }, { kind:'FIREWALL', x:8, y:2 },
      { kind:'HARDWARE', x:5, y:3 }, { kind:'FIREWALL', x:8, y:3 }, { kind:'SYSTEM',   x:9, y:3 },
      { kind:'HARDWARE', x:5, y:4 }, { kind:'FIREWALL', x:8, y:4 }, { kind:'FIREWALL', x:9, y:4 },
      { kind:'FIREWALL', x:10, y:4 }, { kind:'FIREWALL', x:11, y:4 },
      { kind:'HARDWARE', x:5, y:5 },
      { kind:'HARDWARE', x:5, y:6 },
      { kind:'HARDWARE', x:5, y:7 },
      { kind:'HARDWARE', x:5, y:8 },
    ],
    text: [
      { kind:'T_WLAN',     x:10, y:0 }, { kind:'T_HARDWARE', x:11, y:0 },
      { kind:'T_IS',       x:10, y:1 }, { kind:'T_IS',       x:11, y:1 },
      { kind:'T_KEY',      x:1,  y:2 }, { kind:'T_LOCKED',   x:10, y:2 }, { kind:'T_STOP', x:11, y:2 },
      { kind:'T_OPEN',     x:3,  y:3 },
      { kind:'T_IS',       x:2,  y:4 },
      { kind:'T_VIRUS',    x:1,  y:5 }, { kind:'T_IS',       x:2,  y:5 }, { kind:'T_YOU',  x:3,  y:5 },
      { kind:'T_SYSTEM',   x:11, y:6 },
      { kind:'T_PUSH',     x:1,  y:7 }, { kind:'T_FIREWALL', x:7,  y:7 }, { kind:'T_IS',   x:8,  y:7 },
      { kind:'T_DEFEAT',   x:9,  y:7 }, { kind:'T_IS',       x:11, y:7 },
      { kind:'T_WIN',      x:11, y:8 },
    ],
  },
  {
    name: 'Level 2',
    w: 13, h: 15,
    entities: [
      { kind:'APP', x:0, y:0 }, { kind:'HARDWARE', x:3, y:0 },
      { kind:'HARDWARE', x:3, y:1 }, { kind:'HARDWARE', x:4, y:1 }, { kind:'HARDWARE', x:5, y:1 },
      { kind:'HARDWARE', x:6, y:1 }, { kind:'HARDWARE', x:7, y:1 }, { kind:'HARDWARE', x:8, y:1 },
      { kind:'HARDWARE', x:9, y:1 }, { kind:'HARDWARE', x:10, y:1 }, { kind:'HARDWARE', x:11, y:1 },
      { kind:'HARDWARE', x:12, y:1 },
      { kind:'FIREWALL', x:3, y:2 }, { kind:'FIREWALL', x:4, y:2 }, { kind:'FIREWALL', x:5, y:2 },
      { kind:'FIREWALL', x:6, y:2 }, { kind:'FIREWALL', x:7, y:2 }, { kind:'FIREWALL', x:8, y:2 },
      { kind:'FIREWALL', x:9, y:2 }, { kind:'SYSTEM',   x:11, y:2 }, { kind:'HARDWARE', x:12, y:2 },
      { kind:'FIREWALL', x:3, y:3 }, { kind:'FIREWALL', x:4, y:3 }, { kind:'FIREWALL', x:5, y:3 },
      { kind:'FIREWALL', x:6, y:3 }, { kind:'FIREWALL', x:7, y:3 }, { kind:'FIREWALL', x:8, y:3 },
      { kind:'FIREWALL', x:9, y:3 }, { kind:'HARDWARE', x:12, y:3 },
      { kind:'HARDWARE', x:0, y:4 }, { kind:'HARDWARE', x:1, y:4 }, { kind:'HARDWARE', x:2, y:4 },
      { kind:'HARDWARE', x:3, y:4 }, { kind:'HARDWARE', x:4, y:4 }, { kind:'HARDWARE', x:5, y:4 },
      { kind:'HARDWARE', x:6, y:4 }, { kind:'HARDWARE', x:7, y:4 }, { kind:'HARDWARE', x:8, y:4 },
      { kind:'HARDWARE', x:9, y:4 }, { kind:'HARDWARE', x:10, y:4 }, { kind:'HARDWARE', x:11, y:4 },
      { kind:'HARDWARE', x:12, y:4 },
      { kind:'HARDWARE', x:0, y:5 }, { kind:'HARDWARE', x:6, y:5 },
      { kind:'HARDWARE', x:0, y:6 }, { kind:'HARDWARE', x:6, y:6 },
      { kind:'HARDWARE', x:0, y:7 }, { kind:'HARDWARE', x:6, y:7 },
      { kind:'HARDWARE', x:0, y:8 }, { kind:'HARDWARE', x:1, y:8 }, { kind:'HARDWARE', x:2, y:8 },
      { kind:'HARDWARE', x:3, y:8 }, { kind:'WLAN',     x:4, y:8 }, { kind:'HARDWARE', x:5, y:8 },
      { kind:'HARDWARE', x:6, y:8 },
      { kind:'APP', x:5, y:10 }, { kind:'HARDWARE', x:11, y:10 },
      { kind:'HARDWARE', x:6, y:12 }, { kind:'HARDWARE', x:7, y:12 }, { kind:'HARDWARE', x:8, y:12 },
      { kind:'FIREWALL', x:6, y:13 }, { kind:'KEY', x:7, y:13 }, { kind:'FIREWALL', x:8, y:13 },
      { kind:'VIRUS', x:0, y:14 },
    ],
    text: [
      { kind:'T_FIREWALL', x:4, y:0 }, { kind:'T_IS', x:5, y:0 }, { kind:'T_DEFEAT', x:6, y:0 },
      { kind:'T_HARDWARE', x:7, y:0 }, { kind:'T_IS', x:8, y:0 }, { kind:'T_STOP',   x:9, y:0 },
      { kind:'T_SYSTEM',   x:10, y:0 }, { kind:'T_IS', x:11, y:0 }, { kind:'T_WIN',  x:12, y:0 },
      { kind:'T_VIRUS',    x:2, y:5 }, { kind:'T_WLAN',   x:7, y:5 }, { kind:'T_IS', x:8, y:5 },
      { kind:'T_LOCKED',   x:9, y:5 },
      { kind:'T_IS',       x:2, y:6 }, { kind:'T_IS',     x:12, y:6 },
      { kind:'T_YOU',      x:2, y:7 },
      { kind:'T_KEY',      x:9, y:8 },
      { kind:'T_CODE',     x:1, y:11 }, { kind:'T_IS',    x:2, y:11 }, { kind:'T_PUSH', x:3, y:11 },
      { kind:'T_KEY',      x:2, y:13 },
      { kind:'T_APP',      x:6, y:14 }, { kind:'T_MAKE',  x:7, y:14 }, { kind:'T_CODE', x:8, y:14 },
      { kind:'T_OPEN',     x:12, y:14 },
    ],
  },
  {
    name: 'Level 3',
    w: 15, h: 14,
    entities: [
      { kind:'VIRUS', x:0, y:0 }, { kind:'FIREWALL', x:3, y:0 },
      { kind:'FIREWALL', x:6, y:0 }, { kind:'FIREWALL', x:7, y:0 },
      { kind:'HARDWARE', x:3, y:1 }, { kind:'FIREWALL', x:6, y:1 }, { kind:'FIREWALL', x:7, y:1 },
      { kind:'APP', x:11, y:1 }, { kind:'APP', x:12, y:1 }, { kind:'APP', x:13, y:1 }, { kind:'APP', x:14, y:1 },
      { kind:'SYSTEM', x:2, y:2 }, { kind:'HARDWARE', x:3, y:2 },
      { kind:'FIREWALL', x:6, y:2 }, { kind:'FIREWALL', x:7, y:2 }, { kind:'APP', x:14, y:2 },
      { kind:'HARDWARE', x:0, y:3 }, { kind:'HARDWARE', x:1, y:3 }, { kind:'HARDWARE', x:2, y:3 },
      { kind:'HARDWARE', x:3, y:3 }, { kind:'FIREWALL', x:7, y:3 }, { kind:'APP', x:14, y:3 },
      { kind:'FIREWALL', x:7, y:4 }, { kind:'CODE', x:9, y:4 }, { kind:'APP', x:13, y:4 },
      { kind:'FIREWALL', x:7, y:5 }, { kind:'APP', x:8, y:5 }, { kind:'APP', x:9, y:5 },
      { kind:'FIREWALL', x:7, y:6 }, { kind:'APP', x:8, y:6 },
      { kind:'FIREWALL', x:7, y:7 }, { kind:'APP', x:8, y:7 }, { kind:'APP', x:14, y:7 },
      { kind:'FIREWALL', x:7, y:8 }, { kind:'APP', x:8, y:8 },
      { kind:'FIREWALL', x:7, y:9 },
      { kind:'FIREWALL', x:7, y:10 }, { kind:'APP', x:9, y:10 }, { kind:'APP', x:11, y:10 },
      { kind:'FIREWALL', x:0, y:11 }, { kind:'WLAN', x:1, y:11 }, { kind:'FIREWALL', x:2, y:11 },
      { kind:'FIREWALL', x:7, y:11 }, { kind:'APP', x:13, y:11 },
      { kind:'FIREWALL', x:0, y:12 }, { kind:'KEY', x:1, y:12 }, { kind:'FIREWALL', x:2, y:12 },
      { kind:'FIREWALL', x:7, y:12 }, { kind:'APP', x:8, y:12 },
      { kind:'FIREWALL', x:0, y:13 }, { kind:'FIREWALL', x:1, y:13 }, { kind:'FIREWALL', x:2, y:13 },
      { kind:'FIREWALL', x:3, y:13 }, { kind:'FIREWALL', x:4, y:13 }, { kind:'FIREWALL', x:5, y:13 },
      { kind:'FIREWALL', x:6, y:13 }, { kind:'FIREWALL', x:7, y:13 },
      { kind:'APP', x:8, y:13 }, { kind:'APP', x:9, y:13 }, { kind:'APP', x:10, y:13 },
      { kind:'APP', x:11, y:13 }, { kind:'APP', x:12, y:13 }, { kind:'APP', x:13, y:13 }, { kind:'APP', x:14, y:13 },
    ],
    text: [
      { kind:'T_FIREWALL', x:4, y:0 }, { kind:'T_WLAN', x:9, y:0 }, { kind:'T_IS', x:10, y:0 },
      { kind:'T_LOCKED', x:11, y:0 }, { kind:'T_APP', x:12, y:0 }, { kind:'T_IS', x:13, y:0 },
      { kind:'T_DEFEAT', x:14, y:0 },
      { kind:'T_IS', x:5, y:1 }, { kind:'T_HARDWARE', x:8, y:1 }, { kind:'T_IS', x:9, y:1 },
      { kind:'T_STOP', x:10, y:1 },
      { kind:'T_STOP', x:5, y:2 },
      { kind:'T_VIRUS', x:2, y:5 }, { kind:'T_IS', x:3, y:5 }, { kind:'T_YOU', x:4, y:5 },
      { kind:'T_IS', x:12, y:5 },
      { kind:'T_CODE', x:4, y:7 }, { kind:'T_KEY', x:9, y:7 },
      { kind:'T_YOU', x:1, y:8 }, { kind:'T_SYSTEM', x:5, y:8 },
      { kind:'T_OPEN', x:2, y:10 }, { kind:'T_PUSH', x:6, y:10 },
      { kind:'T_IS', x:4, y:11 },
      { kind:'T_WIN', x:14, y:12 },
    ],
  },
];

// -----------------------------------------------------------------------------
// STATE FACTORY
// -----------------------------------------------------------------------------

function makeStateFromLevel(lvl) {
  const cells = Array.from({ length: lvl.w * lvl.h }, () => []);
  let id = 1;
  for (const e of lvl.entities) cells[e.y * lvl.w + e.x].push({ kind: e.kind, id: id++ });
  for (const t of lvl.text)     cells[t.y * lvl.w + t.x].push({ kind: t.kind, id: id++ });
  return { w: lvl.w, h: lvl.h, cells, won: false, lost: false, turn: 0, nextId: id };
}

export { NOUNS, PROPS, DIRS, LEVELS, makeStateFromLevel, step, cloneState, hashState, deriveRules };
