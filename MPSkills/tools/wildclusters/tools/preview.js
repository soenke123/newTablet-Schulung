/**
 * Sichtpruefung ohne Browser: rendert die Welt aus denselben geglaetteten
 * Polygonen, die auch das Canvas benutzt, in eine PNG-Datei (eigener
 * Scanline-Rasterizer + minimaler PNG-Encoder, 2x supersampled).
 * Dient nur der Kontrolle waehrend der Entwicklung.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = process.argv[2] || require('path').join(__dirname, '..');
const OUT = process.argv[3] || 'preview.png';
const SEEDS = (process.argv[4] || '482917').split(',').map(Number);

const FILES = [
  'js/core/rng.js', 'js/core/noise.js', 'js/core/grid.js', 'js/core/geometry.js', 'js/core/contour.js',
  'js/world/config.js', 'js/world/terrain.js', 'js/world/rules.js', 'js/world/objects.js',
  'js/world/validate.js', 'js/world/world.js',
  'js/sim/time.js', 'js/sim/species.js', 'js/sim/habitat.js', 'js/sim/land.js', 'js/sim/agents.js',
  'js/sim/duck.js', 'js/sim/perch.js', 'js/sim/deer.js', 'js/sim/boar.js', 'js/sim/rabbit.js',
  'js/sim/bat.js', 'js/sim/dachs.js', 'js/sim/fox.js', 'js/sim/buzzard.js', 'js/sim/pike.js', 'js/sim/hedgehog.js',
  'js/sim/recording.js', 'js/sim/tracker.js',
  'js/sim/simulation.js',
  'js/render/palette.js', 'js/render/shapes.js'
];

const sandbox = {
  console, Math, Date, Map, Set, Object, Array, JSON, String, Number,
  Uint8Array, Int16Array, Int32Array, Float32Array, Float64Array, isFinite, parseInt, Infinity,
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const WL = sandbox.WL;
const P = WL.PALETTE;

// ------------------------------------------------------------- Rasterizer
const SS = 2; // Supersampling

function hex(c) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function Canvas(w, h, bg) {
  this.w = w; this.h = h;
  this.buf = Buffer.alloc(w * h * 3);
  const [r, g, b] = hex(bg);
  for (let i = 0; i < w * h; i++) { this.buf[i * 3] = r; this.buf[i * 3 + 1] = g; this.buf[i * 3 + 2] = b; }
}

Canvas.prototype.px = function (x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  const i = (y * this.w + x) * 3;
  if (alpha === undefined || alpha >= 1) {
    this.buf[i] = rgb[0]; this.buf[i + 1] = rgb[1]; this.buf[i + 2] = rgb[2];
  } else {
    this.buf[i] += (rgb[0] - this.buf[i]) * alpha;
    this.buf[i + 1] += (rgb[1] - this.buf[i + 1]) * alpha;
    this.buf[i + 2] += (rgb[2] - this.buf[i + 2]) * alpha;
  }
};

/** Even-odd Scanline-Fuellung ueber alle Ringe einer Flaeche. */
Canvas.prototype.fillPolygons = function (rings, color, tf) {
  const rgb = hex(color);
  for (let y = 0; y < this.h; y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = tf(ring[i]), b = tf(ring[(i + 1) % n]);
        if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) {
          xs.push(a.x + (sy - a.y) / (b.y - a.y) * (b.x - a.x));
        }
      }
    }
    if (!xs.length) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) this.px(x, y, rgb);
    }
  }
};

Canvas.prototype.circle = function (cx, cy, r, color, alpha) {
  const rgb = hex(color);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) this.px(x, y, rgb, alpha);
    }
  }
};

/** Innenkantenband: Punkte nahe der Kontur einfaerben (Naeherung des Canvas-Strichs). */
Canvas.prototype.strokePolygons = function (rings, color, width, tf) {
  const rgb = hex(color);
  const half = width / 2;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = tf(ring[i]), b = tf(ring[(i + 1) % n]);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, half, color, 1);
      }
    }
  }
};

/** Offener Streckenzug - fuer die Bewegungsspuren der Tiere. */
Canvas.prototype.polyline = function (points, color, width, alpha) {
  const half = width / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, half, color, alpha);
    }
  }
};

Canvas.prototype.downsample = function (factor) {
  const w = Math.floor(this.w / factor), h = Math.floor(this.h / factor);
  const out = new Canvas(w, h, '#000000');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * this.w + (x * factor + dx)) * 3;
          r += this.buf[i]; g += this.buf[i + 1]; b += this.buf[i + 2];
        }
      }
      const n = factor * factor, o = (y * w + x) * 3;
      out.buf[o] = r / n; out.buf[o + 1] = g / n; out.buf[o + 2] = b / n;
    }
  }
  return out;
};

// ------------------------------------------------------------ PNG-Encoder
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(canvas) {
  const raw = Buffer.alloc((canvas.w * 3 + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) {
    raw[y * (canvas.w * 3 + 1)] = 0;
    canvas.buf.copy(raw, y * (canvas.w * 3 + 1) + 1, y * canvas.w * 3, (y + 1) * canvas.w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0); ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ----------------------------------------------------------------- Zeichnen
function renderWorld(world, tileW, tileH, offsetX, offsetY, canvas) {
  const shapes = WL.Shapes.build(world);
  const s = Math.min(tileW / world.width, tileH / world.height);
  const tf = (p) => ({ x: offsetX + p.x * s, y: offsetY + p.y * s });
  const px = (v) => v * s;

  // Boden
  canvas.fillPolygons([[{ x: 0, y: 0 }, { x: world.width, y: 0 },
    { x: world.width, y: world.height }, { x: 0, y: world.height }]], P.ground.base, tf);
  for (const d of world.decor.groundSpecks) {
    const p = tf(d);
    canvas.circle(p.x, p.y, Math.max(px(d.r), 0.8), d.shade < 0 ? P.ground.speckDark : P.ground.speckLight);
  }

  // Gras
  canvas.fillPolygons(shapes.grass.polygons, P.grass.base, tf);
  canvas.strokePolygons(shapes.grass.polygons, P.grass.shade, Math.max(px(14), 1), tf);
  for (const d of world.decor.grassTufts) {
    const p = tf(d);
    canvas.circle(p.x, p.y, Math.max(px(d.r * 0.8), 0.7), d.shade < 0 ? P.grass.tuftDark : P.grass.tuftLight);
  }

  // Wald
  canvas.fillPolygons(shapes.forest.polygons, P.forest.floorShade, tf);
  canvas.strokePolygons(shapes.forest.polygons, P.forest.floor, Math.max(px(22), 1), tf);

  // Wasser
  canvas.fillPolygons(shapes.water.polygons, P.water.deep, tf);
  canvas.strokePolygons(shapes.water.polygons, P.water.base, Math.max(px(30), 1), tf);
  canvas.strokePolygons(shapes.water.polygons, P.water.shallow, Math.max(px(11), 1), tf);

  // Objekte
  for (const t of world.objects.trees) {
    const p = tf(t);
    canvas.circle(p.x + px(t.r * 0.16), p.y + px(t.r * 0.22), px(t.r * 0.95), P.forest.canopyDark, 0.25);
    canvas.circle(p.x, p.y, px(t.r * 0.86), P.forest.canopy);
    canvas.circle(p.x - px(t.r * 0.26), p.y - px(t.r * 0.3), px(t.r * 0.4), P.forest.canopyLight);
  }
  for (const r of world.objects.resources) {
    const p = tf(r);
    canvas.circle(p.x, p.y, Math.max(px(r.r), 1), r.variant === 2 ? P.resource.nut : P.resource.cap);
  }
  for (const a of world.objects.appleTrees) {
    const p = tf(a);
    canvas.circle(p.x, p.y, px(a.r), P.appleTree.canopy);
    canvas.circle(p.x - px(a.r * 0.28), p.y - px(a.r * 0.3), px(a.r * 0.46), P.appleTree.canopyLight);
    for (const ap of a.apples) canvas.circle(p.x + px(ap.dx), p.y + px(ap.dy), Math.max(px(ap.r), 1), P.appleTree.apple);
  }
  for (const h of world.objects.anthills) {
    const p = tf(h);
    canvas.circle(p.x, p.y, px(h.r), P.anthill.dark);
    canvas.circle(p.x, p.y, px(h.r * 0.76), P.anthill.base);
    canvas.circle(p.x - px(h.r * 0.14), p.y - px(h.r * 0.16), px(h.r * 0.42), P.anthill.light);
  }
}

/**
 * Verdeckte Sicht: statt der Landschaft nur der Himmel der jeweiligen
 * Tageszeit. Denselben Verlauf benutzt der Browser (WL.PALETTE.masked.skyAt) -
 * die Farbe steht deshalb in der Palette und nicht hier.
 */
function renderSky(world, tileW, tileH, offsetX, offsetY, canvas) {
  const s = Math.min(tileW / world.width, tileH / world.height);
  const tf = (p) => ({ x: offsetX + p.x * s, y: offsetY + p.y * s });
  canvas.fillPolygons([[{ x: 0, y: 0 }, { x: world.width, y: 0 },
    { x: world.width, y: world.height }, { x: 0, y: world.height }]],
  P.masked.skyAt(MASK_LIGHT), tf);
}

/**
 * Die Tiere kommen nur auf Wunsch dazu (Schalter --tiere), weil dafuer die
 * vollen 5 Tage gerechnet werden muessen. Gezeichnet wird die ganze
 * Aufzeichnung auf einmal: Schwimmspur, Flugbahnen und die Endposition.
 *
 * Zwei Sichten, zwei Farbquellen - und das ist Absicht:
 *
 * - **Offen** faerbt nach *Art* (P.agents). Der Browser tut das nicht mehr,
 *   dort gehoert jede Farbe einem Signal. Hier ist die Artfarbe aber genau
 *   das, was das Werkzeug leisten soll: "laeuft der Fuchs sein Revier ab?"
 *   ist mit 45 Einzelfarben nicht zu beantworten.
 * - **Verdeckt** faerbt nach *Signal*, wie der Browser. Das ist die Sicht, in
 *   der geprueft wird, ob die Spuren auf jedem Himmel lesbar bleiben
 *   (--verdeckt=0.5, die Daemmerung) - dafuer muessen es dieselben Farben
 *   sein.
 */
function renderAgents(world, tileW, tileH, offsetX, offsetY, canvas) {
  const sim = WL.Simulation.run(world, NEWCOMER ? { lateArrivals: lateListWith(NEWCOMER) } : {});
  // Wie im Browser: gezeichnet wird immer *eine* Phase, nie beide zusammen.
  // Ohne das laegen zehn Tage Spur uebereinander, und der Bruch - der auf dem
  // Bild ja gerade zu sehen sein soll - waere nicht mehr zu erkennen.
  const window = WL.SimTime.phaseSamples(PHASE);
  sim.recording.setWindow(window.from, window.to);
  const phaseEnd = window.to * sim.recording.sampleSeconds;
  const feat = sim.featuresByPhase[Math.min(PHASE, sim.featuresByPhase.length - 1)];
  const signalColors = P.signals.build(sim.agents.length);
  const s = Math.min(tileW / world.width, tileH / world.height);
  const tf = (p) => ({ x: offsetX + p.x * s, y: offsetY + p.y * s });

  // Wie im Browser: nach Ebene, damit der Barsch unter der Ente liegt.
  const order = sim.agents.map((a, i) => i).sort((a, b) =>
    ((sim.agents[a].spec.layer || 0) - (sim.agents[b].spec.layer || 0)) || a - b);

  // 12 Barsche auf einem Teich legen 12 Spuren uebereinander und decken ihn
  // zu. Je mehr Tiere einer Art, desto blasser deshalb die einzelne Spur -
  // die Dichte bleibt lesbar, das Wasser darunter auch.
  const alphaOf = (id) => Math.max(0.22, Math.min(0.8,
    0.8 / Math.sqrt(feat.species[id].count)));

  // Die Reviergrenzen der Fuechse zuerst, damit die Spur darauf liegt. Sie
  // sind das einzige Revier des Katalogs, das eine sichtbare Linie ist - ohne
  // sie laesst sich am Bild nicht beurteilen, ob der Fuchs sie wirklich
  // ablaeuft (data/tiere.md, Fuchs).
  if (!ONLY || ONLY === 'fuchs') {
    const drawn = [];
    for (const a of sim.agents) {
      if (a.speciesId !== 'fuchs' || !a.territory || drawn.indexOf(a.territory) >= 0) continue;
      drawn.push(a.territory);
      const ring = [];
      for (let k = 0; k <= a.territory.samples; k++) {
        const idx = k % a.territory.samples;
        const ang = idx / a.territory.samples * Math.PI * 2;
        ring.push(tf({
          x: a.territory.x + Math.cos(ang) * a.territory.radii[idx],
          y: a.territory.y + Math.sin(ang) * a.territory.radii[idx]
        }));
      }
      canvas.polyline(ring, MASKED ? P.masked.ink : P.agents.fuchs.trail, 1.0 * SS, 0.30);
    }
  }

  for (const i of order) {
    if (ONLY && sim.agents[i].speciesId !== ONLY) continue;
    // In dieser Phase gar nicht da (ein Nachzuegler vor dem Bruch): kein
    // Punkt, keine Spur. Die Aufzeichnung haelt an seiner Stelle den kuenftigen
    // Startplatz - ohne diese Zeile stuende dort fuenf Tage lang ein Tier.
    if (!feat.agents[i].present) continue;
    const colors = P.agents[sim.agents[i].speciesId] || P.agents.ente;
    const alpha = alphaOf(sim.agents[i].speciesId);
    const trail = LOD ? sim.recording.trailAt(i, LOD) : sim.recording.trail(i);

    if (MASKED) {
      // Ein Zug in einer Farbe: keine getrennten Flugbahnen, keine Artfarbe -
      // die Farbe gehoert der Kachelnummer. Der dunkle Saum darunter haelt die
      // Linie auch in der Daemmerung lesbar, wenn der Himmel ihre eigene
      // Helligkeit durchlaeuft.
      const ink = signalColors[sim.signalOf[i]];
      const line = [];
      for (let k = 0; k < trail.count; k++) line.push(tf({ x: trail.xs[k], y: trail.ys[k] }));
      canvas.polyline(line, P.masked.halo, 2.4 * SS, alpha * 0.4);
      canvas.polyline(line, ink, 1.2 * SS, alpha);
      const tip = tf(sim.recording.at(i, phaseEnd));
      canvas.circle(tip.x, tip.y, 4.5 * SS, P.masked.halo, 0.45);
      canvas.circle(tip.x, tip.y, 3.0 * SS, ink, 1);
      continue;
    }

    let run = [];
    let runAir = 0;
    for (let k = 0; k < trail.count; k++) {
      const air = trail.air[k];
      if (air !== runAir && run.length) {
        canvas.polyline(run, runAir ? colors.flight : colors.trail, runAir ? 1.6 * SS : 1.2 * SS, alpha);
        run = [run[run.length - 1]];
      }
      runAir = air;
      run.push(tf({ x: trail.xs[k], y: trail.ys[k] }));
    }
    if (run.length > 1) canvas.polyline(run, runAir ? colors.flight : colors.trail, 1.2 * SS, alpha);

    const end = sim.recording.at(i, phaseEnd);
    const p = tf(end);
    canvas.circle(p.x, p.y, 4.5 * SS, '#ffffff', 0.95);
    canvas.circle(p.x, p.y, 3.0 * SS, colors.head, 1);
  }

  const days = WL.SimTime.PHASE_DAYS;
  const lines = [];
  for (const id of Object.keys(feat.species)) {
    const f = feat.species[id];
    const parts = [f.count + ' ' + f.name, f.places.toFixed(1) + ' feste Orte',
      (100 * f.shareWater).toFixed(0) + '% am Wasser',
      // Eine Art, die als einzelnes Tier auftaucht (ein Nachzuegler), hat
      // keinen naechsten Artgenossen - der Tracker liefert dort null, und das
      // ist eine Aussage und kein fehlender Wert. Ungeprueft stand hier "NaN u".
      f.neighbourDistance == null ? 'allein auf der Karte'
        : Math.round(f.neighbourDistance) + ' u zum Artgenossen'];
    if (f.waterChanges / days >= 0.05) {
      parts.splice(1, 0, (f.waterChanges / days).toFixed(1) + ' Wechsel/Tag');
    }
    lines.push(parts.join(', '));
  }
  lines.push(sim.meta.agentCount + ' Tiere in ' + sim.meta.simulationMs + ' ms');
  return lines.join('\n           ');
}

const WITH_AGENTS = process.argv.indexOf('--tiere') >= 0;
/**
 * --art=<id> zeichnet nur eine Art. Gerechnet werden trotzdem alle: die Tiere
 * beeinflussen sich gegenseitig, und ein Bild ohne diesen Einfluss zeigte
 * nicht die Welt, ueber die geredet wird. Gefiltert wird nur, was gemalt wird -
 * bei acht Arten deckt sonst eine die andere zu.
 */
const ONLY = (process.argv.find((a) => a.indexOf('--art=') === 0) || '').slice(6) || null;
/**
 * --verdeckt zeigt dieselbe Aufzeichnung so, wie sie in der verdeckten Sicht
 * des Browsers aussieht: keine Landschaft, alle Tiere in einer Farbe. Der
 * optionale Wert ist die Helligkeit (0 Nacht, 1 Tag, 0.5 Daemmerung) - die
 * Daemmerung ist der Fall, in dem die Spuren am wenigsten Kontrast haben und
 * der deshalb am ehesten geprueft werden muss.
 */
const MASK_ARG = process.argv.find((a) => a === '--verdeckt' || a.indexOf('--verdeckt=') === 0);
const MASKED = !!MASK_ARG;
/**
 * --grob=<weltunits> zeichnet die Spur in der Grobheitsstufe, die der Browser
 * bei diesem Zoom nimmt (siehe WL.Recording.TRAIL_LODS). Ohne das Flag ist es
 * die ungekuerzte Spur. Gedacht fuer genau einen Vergleich: zwei Bilder
 * nebeneinander, eines mit und eines ohne - sieht man den Unterschied, ist die
 * Stufe zu grob gewaehlt.
 */
const LOD = Number((process.argv.find((a) => a.indexOf('--grob=') === 0) || '').slice(7)) || 0;
/**
 * --phase=1 zeigt Tag 1-5 (Startbestand, die Vorgabe), --phase=2 die Tage 6-10
 * mit den Nachzueglern. Beides sind fuenf Tage und damit vergleichbar; ein Bild
 * ueber alle zehn Tage gibt es absichtlich nicht, es waere nur ein Knaeuel aus
 * zwei verschiedenen Welten.
 */
const PHASE = Math.max(0, Math.min(WL.SimTime.PHASE_COUNT - 1,
  (Number((process.argv.find((a) => a.indexOf('--phase=') === 0) || '').slice(8)) || 1) - 1));
/**
 * --neu=<id> nagelt die neue Art der zweiten Phase fest, statt sie aus dem Seed
 * ziehen zu lassen.
 *
 * Ohne das ist ein Blick auf eine Nachzuegler-Art Gluecksache: je Welt werden
 * zwei aus WL.NEW_SPECIES gezogen, bei dreien also zwei von drei Seeds. Fuer
 * tools/simtest.js ist genau dieselbe Luecke schon geschlossen (fullWith) -
 * dort hat sie sechs von zehn Seeds als "kein Bussard" gemeldet, ohne dass ein
 * Fehler vorlag. "Ansehen und nachjustieren" braucht sie genauso, sonst
 * justiert man an einem Bild, auf dem das Tier gar nicht ist.
 *
 * Die bekannten Nachzuegler kommen dabei aus den Daten und nicht als Namen
 * hier: waechst der Pool, waechst diese Zeile mit. Die Form ist dieselbe wie in
 * der Produktion (verschiedene bekannte Arten, alle Neu-Plaetze besetzt), nur
 * steht die gewuenschte Art vorne statt gezogen zu werden.
 */
const NEWCOMER = (process.argv.find((a) => a.indexOf('--neu=') === 0) || '').slice(6) || null;
function lateListWith(id) {
  const cfg = WL.LATE_ARRIVALS;
  const known = WL.SPECIES_ORDER.filter((s) => WL.SPECIES[s] && WL.SPECIES[s].lateArrival);
  const out = known.slice(0, cfg.known || 0);
  const fresh = (WL.NEW_SPECIES || []).filter((s) => s !== id);
  // Hinten, genau wie in tools/simtest.js: die Position in dieser Liste ist der
  // Zufallsstrom des Nachzueglers (fork('nachzuegler-' + tag)). Ein Bild, an dem
  // justiert wird, soll dasselbe Tier zeigen wie die Messung daneben.
  while (out.length < (cfg.known || 0) + (cfg.newcomer || 0) - 1 && fresh.length) {
    out.push(fresh.shift());
  }
  out.push(id);
  return out;
}
if (NEWCOMER && (WL.NEW_SPECIES || []).indexOf(NEWCOMER) < 0) {
  console.error('Abbruch: "' + NEWCOMER + '" ist keine Nachzügler-Art. Möglich: ' +
    (WL.NEW_SPECIES || []).join(', '));
  process.exit(1);
}
const MASK_LIGHT = MASK_ARG && MASK_ARG.indexOf('=') > 0 ? Number(MASK_ARG.split('=')[1]) : 0;
// Die Sprites liegen im selben Wurzelverzeichnis, in das die Vorschau schreibt. Ein verrutschtes
// Argument ("preview.js . Hecht.png") ueberschreibt damit ein Tierbild mit einer Weltkarte, und
// das Original steht danach nur noch in der OneDrive-Versionshistorie.
const SPRITES = Object.keys(WL.SPECIES).map((k) => WL.SPECIES[k].sprite).filter(Boolean);
if (SPRITES.indexOf(path.basename(OUT)) >= 0) {
  console.error('Abbruch: "' + path.basename(OUT) + '" ist ein Tier-Sprite, keine Ausgabedatei.');
  console.error('Gemeint war vermutlich: --art=<id> statt eines Dateinamens.');
  process.exit(1);
}

const cols = SEEDS.length > 1 ? 2 : 1;
const rows = Math.ceil(SEEDS.length / cols);
const tileW = 900, tileH = 563, gap = 14;
const canvas = new Canvas((tileW * cols + gap * (cols + 1)) * SS, (tileH * rows + gap * (rows + 1)) * SS,
  MASKED ? P.masked.halo : P.outside);

SEEDS.forEach((seed, i) => {
  const world = WL.World.generate(seed);
  const cx = i % cols, cy = Math.floor(i / cols);
  const ox = (gap + cx * (tileW + gap)) * SS;
  const oy = (gap + cy * (tileH + gap)) * SS;
  if (MASKED) renderSky(world, tileW * SS, tileH * SS, ox, oy, canvas);
  else renderWorld(world, tileW * SS, tileH * SS, ox, oy, canvas);
  console.log('Seed ' + seed + ': Wald ' + (world.areaRatios.forest * 100).toFixed(1) + '%, ' +
    world.terrain.forestRegions.length + ' Waldgebiete, ' + world.terrain.waterBodies.length + ' Wasserflächen, ' +
    world.objects.trees.length + ' Bäume, Verstöße: ' + world.validation.violations.length);
  if (WITH_AGENTS) {
    console.log('           ' + renderAgents(world, tileW * SS, tileH * SS, ox, oy, canvas));
  }
});

fs.writeFileSync(OUT, encodePNG(canvas.downsample(SS)));
console.log('geschrieben: ' + OUT);
