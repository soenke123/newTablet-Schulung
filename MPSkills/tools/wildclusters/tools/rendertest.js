/**
 * Render-Smoketest ohne Browser: minimaler Canvas-2D-Mock.
 * Prueft, dass Shapes, Kamera, Terrain-/Objekt-Renderer und der Cache-Pfad
 * fehlerfrei durchlaufen - inklusive Zoom, Pan und Fenstergroessen von Handy
 * bis Desktop. Ausserdem die Kamera-Mathematik (Zoompunkt bleibt stehen).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || require('path').join(__dirname, '..');
const FILES = [
  'js/core/rng.js', 'js/core/noise.js', 'js/core/grid.js', 'js/core/geometry.js', 'js/core/contour.js',
  'js/world/config.js', 'js/world/terrain.js', 'js/world/rules.js', 'js/world/objects.js',
  'js/world/validate.js', 'js/world/world.js',
  'js/sim/time.js', 'js/sim/species.js', 'js/sim/habitat.js', 'js/sim/land.js', 'js/sim/agents.js',
  'js/sim/duck.js', 'js/sim/perch.js', 'js/sim/deer.js', 'js/sim/boar.js', 'js/sim/rabbit.js',
  'js/sim/bat.js', 'js/sim/dachs.js', 'js/sim/fox.js', 'js/sim/buzzard.js', 'js/sim/pike.js', 'js/sim/hedgehog.js',
  'js/sim/recording.js', 'js/sim/tracker.js',
  'js/sim/simulation.js',
  'js/render/palette.js', 'js/render/shapes.js', 'js/render/camera.js',
  'js/render/terrainRenderer.js', 'js/render/objectRenderer.js',
  'js/render/sprites.js', 'js/render/agentRenderer.js', 'js/render/renderer.js'
];

// ---------------------------------------------------------------- Mocks
const opCounts = {};
function count(name) { opCounts[name] = (opCounts[name] || 0) + 1; }

class Path2DMock {
  constructor() { this.ops = 0; this.log = []; }
  // Die Spuren wachsen als Path2D mit der Abspielzeit weiter (agentRenderer);
  // mitgeschrieben wird deshalb nicht nur wie viel, sondern was - nur so laesst
  // sich pruefen, dass der gewachsene Pfad derselbe ist wie ein frisch
  // gebauter.
  moveTo(x, y) { this.ops++; this.log.push('M' + r(x) + ',' + r(y)); }
  lineTo(x, y) { this.ops++; this.log.push('L' + r(x) + ',' + r(y)); }
  closePath() { this.ops++; } arc() { this.ops++; }
}
const r = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));

function makeCtx() {
  const ctx = {
    canvas: null,
    setTransform: () => count('setTransform'),
    save: () => count('save'),
    restore: () => count('restore'),
    beginPath: () => count('beginPath'),
    moveTo: () => count('moveTo'),
    lineTo: () => count('lineTo'),
    arc: () => count('arc'),
    ellipse: () => count('ellipse'),
    translate: () => count('translate'),
    scale: () => count('scale'),
    closePath: () => {},
    fill: (p) => { count('fill'); if (p && !(p instanceof Path2DMock)) throw new Error('fill() ohne Path2D'); },
    stroke: (p) => { count('stroke'); if (p && !(p instanceof Path2DMock)) throw new Error('stroke() ohne Path2D'); },
    clip: (p) => { count('clip'); if (!(p instanceof Path2DMock)) throw new Error('clip() ohne Path2D'); },
    fillRect: () => count('fillRect'),
    strokeRect: () => count('strokeRect'),
    drawImage: (img) => { count('drawImage'); if (!img) throw new Error('drawImage ohne Bild'); },
    fillText: (t) => { count('fillText'); ctx._texts.push(String(t)); },
    strokeText: () => count('strokeText')
  };
  // Geschriebene Zeichenketten mitschreiben: die Kachelnummern der verdeckten
  // Sicht sind das einzige, was dieser Renderer als Text aufs Blatt bringt.
  ctx._texts = [];
  // Die benutzten Farben mitschreiben: seit die Tiere ihre Farbe von der
  // Signalliste bekommen, ist "welche Farbe ist ueberhaupt aufs Blatt
  // gekommen?" die einzige Frage, die ein Canvas-Mock beantworten kann.
  ctx._styles = [];
  for (const key of ['fillStyle', 'strokeStyle']) {
    let value = null;
    Object.defineProperty(ctx, key, {
      get: () => value,
      set: (v) => { value = v; ctx._styles.push(String(v)); }
    });
  }
  return ctx;
}

function makeCanvas(w, h) {
  const canvas = {
    width: w, height: h, style: {},
    classList: { add() {}, remove() {} },
    getContext: () => canvas._ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: canvas._cssW, height: canvas._cssH }),
    addEventListener() {}, setPointerCapture() {}
  };
  canvas._ctx = makeCtx();
  canvas._ctx.canvas = canvas;
  canvas._cssW = w; canvas._cssH = h;
  return canvas;
}

const sandbox = {
  console, Math, Date, Map, Set, Object, Array, JSON, String, Number,
  Uint8Array, Int16Array, Int32Array, Float32Array, Float64Array, isFinite, parseInt, Infinity,
  Path2D: Path2DMock,
  devicePixelRatio: 2,
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  requestAnimationFrame: (fn) => { fn(); return 1; },
  setTimeout: (fn) => { return 1; },
  clearTimeout: () => {},
  document: { createElement: (tag) => makeCanvas(64, 64) }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const WL = sandbox.WL;

// ------------------------------------------------------------- Testlauf
let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log('  ok   ' + label + (detail ? ' (' + detail + ')' : ''));
  else { console.log('  FEHL ' + label + (detail ? ' (' + detail + ')' : '')); failures++; }
}

const world = WL.World.generate(482917);

// Konturen
const shapes = WL.Shapes.build(world);
console.log('Konturen:');
for (const key of ['grass', 'forest', 'water']) {
  const s = shapes[key];
  check(key + ' hat Polygone und Path2D', s.polygons.length > 0 && s.path instanceof Path2DMock,
    s.polygons.length + ' Ringe');
}
check('Shapes werden zwischengespeichert', WL.Shapes.build(world) === shapes);

// Renderer bei verschiedenen Fenstergroessen
const sizes = [
  ['Handy hoch', 360, 560], ['Handy quer', 740, 340],
  ['Tablet', 1024, 700], ['Desktop', 1600, 900]
];
console.log('\nRenderer:');
for (const [label, w, h] of sizes) {
  const canvas = makeCanvas(w, h);
  const renderer = new WL.Renderer(canvas);
  let error = null;
  try {
    renderer.setWorld(world);
    renderer.draw();
    // Zoomen und verschieben
    renderer.camera.zoomAt(w / 2, h / 2, 3.0);
    renderer.draw();
    renderer.camera.panByScreen(-120, -80);
    renderer.draw();
    renderer.camera.zoomAt(10, 10, 100); // ueber das Maximum hinaus
    renderer.draw();
    renderer.camera.reset();
    renderer.draw();
  } catch (e) { error = e; }
  check(label + ' ' + w + 'x' + h + ' rendert fehlerfrei', !error, error ? error.message : renderer.stats().cachePixels / 1e6 + ' MPx');
}

// Kamera-Mathematik
console.log('\nKamera:');
const canvas = makeCanvas(1200, 800);
const renderer = new WL.Renderer(canvas);
renderer.setWorld(world);
const cam = renderer.camera;

check('Start zeigt die ganze Welt', cam.isFitted() &&
  cam.viewWidth / cam.scale >= world.width - 1 &&
  cam.viewHeight / cam.scale >= world.height - 1);

const before = cam.screenToWorld(300, 220);
cam.zoomAt(300, 220, 2.5);
const after = cam.screenToWorld(300, 220);
check('Punkt unter dem Finger bleibt beim Zoom stehen',
  Math.abs(before.x - after.x) < 0.6 && Math.abs(before.y - after.y) < 0.6,
  'Abweichung ' + Math.abs(before.x - after.x).toFixed(3) + ' Units');

cam.panByScreen(9000, 9000);
check('Welt laesst sich nicht aus dem Bild schieben (links/oben)', cam.x >= -0.01 && cam.y >= -0.01,
  'x=' + cam.x.toFixed(1) + ' y=' + cam.y.toFixed(1));
cam.panByScreen(-99999, -99999);
const visW = cam.viewWidth / cam.scale, visH = cam.viewHeight / cam.scale;
check('Welt laesst sich nicht aus dem Bild schieben (rechts/unten)',
  cam.x + visW <= world.width + 0.01 && cam.y + visH <= world.height + 0.01);

cam.zoomAt(600, 400, 0.001);
check('Nicht weiter als bis zur Gesamtansicht herauszoombar', cam.isFitted());

// Dynamische Layer (Hook fuer spaetere Phasen)
let layerCalled = false;
renderer.setDynamicLayers([function (ctx, w, view, scale) { layerCalled = true; }]);
renderer.draw();
check('Hook fuer spaetere dynamische Layer funktioniert', layerCalled);

// Tiere, Spuren und Nachtfaerbung ueber die dynamische Ebene
console.log('\nTiere:');
{
  // Ein Tag statt fuenf - geprueft wird das Zeichnen, nicht das Verhalten.
  const sim = WL.Simulation.run(world, { seconds: WL.SimTime.DAY_SECONDS });
  const layer = WL.AgentRenderer.create();
  layer.setSimulation(sim);
  const perSpecies = {};
  for (const a of sim.agents) perSpecies[a.speciesId] = (perSpecies[a.speciesId] || 0) + 1;
  check('Simulation liefert Tiere', sim.agents.length > 0,
    Object.entries(perSpecies).map(([k, v]) => v + 'x ' + k).join(', '));

  /*
   * Zeichenreihenfolge: der Barsch schwimmt unter der Wasseroberflaeche, die
   * Ente sitzt darauf. Gezeichnet werden muss deshalb erst der Fisch. Die
   * Nummern der Tiere duerfen davon unberuehrt bleiben - sie stammen aus der
   * Aufzeichnung.
   */
  const layers = layer._order.map((i) => sim.agents[i].spec.layer || 0);
  check('Tiere werden nach Ebene gezeichnet (Fisch unter Ente)',
    layers.every((v, i) => i === 0 || layers[i - 1] <= v),
    'Ebenen ' + layers.join(''));
  check('Die Reihenfolge der Aufzeichnung bleibt davon unberührt',
    layer._order.length === sim.agents.length &&
    new Set(layer._order).size === sim.agents.length);

  renderer.setDynamicLayers([layer.draw]);
  let error = null;
  const times = [0, 60, 150, 240, sim.duration];
  try {
    for (const zoom of [1, 3.4]) {
      renderer.camera.reset();
      if (zoom !== 1) renderer.camera.zoomAt(600, 400, zoom);
      for (const t of times) { layer.setTime(t); renderer.draw(); }
    }
    // Ausgewaehltes Tier: kraeftige Spur, Auswahlring
    layer.setSelection(0);
    layer.setTime(sim.duration * 0.5);
    renderer.draw();
    // Und dasselbe fuer ein ganzes Cluster - die Auswahl ist eine Menge.
    layer.setSelection([0, 1, 2]);
    renderer.draw();
    // Neutrale Form statt Sprite - der Schalter fuer die spaetere Spielphase
    WL.Sprites.setMode('neutral');
    renderer.draw();
    WL.Sprites.setMode('sprite');
  } catch (e) { error = e; }
  check('Tiere, Spuren und Nachtfaerbung zeichnen fehlerfrei', !error, error ? error.message : '');

  /*
   * Die Auswahl ist eine Menge, kein einzelnes Tier: ein Tipp auf eine Kachel
   * meint eines, einer auf einen Clusterkopf alle Mitglieder. Beide Formen
   * gehen durch dieselbe Tuer - die Karte kennt nur einzelne Nummern.
   */
  check('Eine Liste waehlt mehrere Tiere aus',
    layer.isSelected(0) && layer.isSelected(2) && !layer.isSelected(3) &&
    layer.selectedCount() === 3, layer.selectedCount() + ' ausgewaehlt');
  layer.setSelection(4);
  check('Eine blanke Nummer waehlt genau eines aus',
    layer.isSelected(4) && layer.selectedCount() === 1);
  layer.setSelection(-1);
  check('-1 waehlt nichts aus', layer.selectedCount() === 0);

  const trail = sim.recording.trail(0);
  check('Spur wird ausgeduennt abgelegt', trail.count > 10 && trail.count < sim.recording.sampleCount,
    trail.count + ' von ' + sim.recording.sampleCount + ' Stützstellen');

  /*
   * Die Grobheitsstufen: die Spur waechst linear mit der Abspielzeit, am
   * fuenften Tag ist sie fuenfmal so lang wie am ersten. Gezeichnet wird sie
   * deshalb nur so genau, wie der Zoom es hergibt. Die Zusicherung ist der
   * *garantierte Fehler* - nicht, wie viele Punkte dabei herauskommen.
   */
  console.log('\nGrobheitsstufen der Spur:');
  {
    // Groesster senkrechter Abstand der groben Linie zur feinen.
    const abweichung = (fein, grob) => {
      let worst = 0;
      let k = 0;
      for (let g = 1; g < grob.count; g++) {
        const ax = grob.xs[g - 1], ay = grob.ys[g - 1];
        const ux = grob.xs[g] - ax, uy = grob.ys[g] - ay;
        const len2 = ux * ux + uy * uy;
        while (k < fein.count && fein.idx[k] <= grob.idx[g]) {
          const px = fein.xs[k] - ax, py = fein.ys[k] - ay;
          let t = len2 === 0 ? 0 : (px * ux + py * uy) / len2;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = px - t * ux, qy = py - t * uy;
          worst = Math.max(worst, Math.sqrt(qx * qx + qy * qy));
          k++;
        }
      }
      return worst;
    };

    const stufen = WL.Recording.TRAIL_LODS;
    check('Stufe 0 ist die ungekuerzte Spur',
      sim.recording.trailAt(0, 0) === sim.recording.trail(0));

    let feinerAlsGrob = true;
    let fehlerOk = true;
    let bericht = [];
    for (let s = 1; s < stufen.length; s++) {
      const tol = stufen[s];
      let punkte = 0, gesamt = 0, schlimmster = 0;
      for (let i = 0; i < sim.agents.length; i++) {
        const fein = sim.recording.trail(i);
        const grob = sim.recording.trailAt(i, tol);
        punkte += grob.count; gesamt += fein.count;
        if (grob.count > fein.count) feinerAlsGrob = false;
        schlimmster = Math.max(schlimmster, abweichung(fein, grob));
      }
      // Etwas Luft fuer die Rundung auf Float32 beim Ablegen der Spur.
      if (schlimmster > tol + 0.05) fehlerOk = false;
      bericht.push(tol + ': ' + Math.round(punkte / gesamt * 100) + '% / ' +
        schlimmster.toFixed(2) + 'u');
    }
    check('Jede Stufe haelt ihre zugesagte Abweichung ein', fehlerOk, bericht.join(' · '));
    check('… und keine ist feiner als das Original', feinerAlsGrob);

    // Der Wechsel Boden <-> Flug muss jede Stufe ueberleben, sonst laufen
    // Schwimmspur und Flugbahn ineinander.
    const wechsel = (t) => {
      let n = 0;
      for (let i = 1; i < t.count; i++) if (t.air[i] !== t.air[i - 1]) n++;
      return n;
    };
    let flieger = -1;
    for (let i = 0; i < sim.agents.length; i++) if (wechsel(sim.recording.trail(i)) > 4) { flieger = i; break; }
    const fein = wechsel(sim.recording.trail(flieger));
    const grob = wechsel(sim.recording.trailAt(flieger, stufen[stufen.length - 1]));
    check('Auch die groebste Stufe behaelt jeden Wechsel Boden <-> Flug',
      flieger >= 0 && grob === fein, fein + ' Wechsel, gröbste Stufe ' + grob);
  }
  check('Spur waechst mit der Abspielzeit',
    sim.recording.trailLengthAt(0, 0) < sim.recording.trailLengthAt(0, sim.duration));

  /*
   * Die Spurpfade bleiben liegen und wachsen am Ende weiter, statt in jedem
   * Bild neu gebaut zu werden - das ist der Unterschied zwischen fluessig und
   * zaeh. Der Preis waere ein anderes Bild, wenn dabei etwas anderes
   * herauskaeme als beim Neubau. Also genau das pruefen: einmal in vielen
   * kleinen Schritten hingelaufen, einmal direkt hingesprungen.
   */
  const pathsAt = (target, steps) => {
    const l = WL.AgentRenderer.create();
    l.setSimulation(sim);
    l.setColors(sim.agents.map(() => '#ff8800'));
    for (let s = 1; s <= steps; s++) {
      l.setTime(target * s / steps);
      l.draw(canvas._ctx, world, { x: 0, y: 0, width: world.width, height: world.height }, 1.4);
    }
    return l._paths.map((p) => (p ? p.all.path.log.join(' ') + '|' + p.ground.path.log.join(' ') +
      '|' + p.air.path.log.join(' ') : ''));
  };
  const grown = pathsAt(sim.duration * 0.8, 60);
  const fresh = pathsAt(sim.duration * 0.8, 1);
  check('Gewachsene Spur ist Punkt fuer Punkt die frisch gebaute',
    grown.length === fresh.length && grown.every((v, i) => v === fresh[i]),
    grown.filter((v, i) => v !== fresh[i]).length + ' von ' + grown.length + ' abweichend');
  check('… und sie enthaelt wirklich etwas', grown.some((v) => v.length > 200));

  /*
   * Zurueckspringen darf keine Spur stehenlassen, die laenger ist als die
   * Zeit: ein Pfad laesst sich nicht kuerzen, er muss dann neu gebaut werden.
   */
  {
    const l = WL.AgentRenderer.create();
    l.setSimulation(sim);
    l.setColors(sim.agents.map(() => '#ff8800'));
    const rect = { x: 0, y: 0, width: world.width, height: world.height };
    l.setTime(sim.duration); l.draw(canvas._ctx, world, rect, 1.4);
    const long = l._paths[0].all.path.log.length;
    l.setTime(sim.duration * 0.25); l.draw(canvas._ctx, world, rect, 1.4);
    const short = l._paths[0].all.path.log.length;
    check('Zurueckspringen kuerzt die Spur', short < long, short + ' statt ' + long + ' Punkte');
    /*
     * Die Spur wird nur so genau gezeichnet, wie der Zoom es hergibt - beim
     * Hineinzoomen kommen also Punkte dazu. Ein Zoomwechsel muss den Pfad
     * dabei *neu bauen*: haengte er an den alten an, laege die grobe Spur unter
     * der feinen und der Saum saehe mit jedem Zoom dunkler aus. Nachweisbar
     * ist das, indem man zur alten Stufe zurueckkehrt - dann muss auch die
     * alte Punktzahl wieder herauskommen.
     */
    l.draw(canvas._ctx, world, rect, 4.0);
    l.draw(canvas._ctx, world, rect, 4.0);
    const zoomed = l._paths[0].all.path.log.length;
    check('Feinerer Zoom zeichnet die Spur genauer', zoomed > short,
      zoomed + ' Punkte statt ' + short);
    l.draw(canvas._ctx, world, rect, 1.4);
    check('Zurueck zum groben Zoom baut sie neu statt sie zu verlaengern',
      l._paths[0].all.path.log.length === short,
      l._paths[0].all.path.log.length + ' Punkte, erwartet ' + short);
  }

  const p0 = sim.recording.at(0, 0);
  const pMid = sim.recording.at(0, sim.duration * 0.5);
  check('Abtasten liefert Positionen in der Welt',
    p0.x >= 0 && p0.x <= world.width && pMid.y >= 0 && pMid.y <= world.height);

  const found = layer.pick(pMid.x, pMid.y, 20);
  layer.setTime(sim.duration * 0.5);
  check('Antippen findet das Tier unter dem Finger',
    layer.pick(layer.positions()[0].x, layer.positions()[0].y, 20) >= 0, 'Treffer ' + found);

  // Ausblenden ueber die Signalliste: unsichtbar heisst auch unantippbar,
  // sonst waehlte ein Tipp ins Leere ein Tier aus, das gar nicht da ist.
  const hit = layer.positions()[0];
  layer.setHidden(0, true);
  check('Ausgeblendetes Tier ist nicht mehr antippbar', layer.pick(hit.x, hit.y, 20) !== 0);

  // Jedes gezeichnete Tier verschiebt einmal den Ursprung (drawAgent) - das
  // ist der verlaesslichste Zaehler, denn ohne geladene Sprites zeichnet der
  // Renderer unter Node die neutrale Form statt eines Bildes.
  const translatesPerDraw = () => {
    const before = opCounts.translate || 0;
    renderer.draw();
    return (opCounts.translate || 0) - before;
  };

  layer.setAllHidden(true);
  let hiddenError = null;
  let whenHidden = -1;
  try { whenHidden = translatesPerDraw(); } catch (e) { hiddenError = e; }
  check('Karte ohne jedes Tier zeichnet fehlerfrei', !hiddenError, hiddenError ? hiddenError.message : '');
  check('Ausgeblendete Tiere werden nicht gezeichnet', whenHidden === 0, whenHidden + ' Tiere gezeichnet');

  layer.setAllHidden(false);
  const whenVisible = translatesPerDraw();
  check('Eingeblendete Tiere sind wieder da', whenVisible === sim.agents.length,
    whenVisible + ' von ' + sim.agents.length);

  // Eine Farbe je Tier statt einer je Art - und sie kommt von aussen, weil sie
  // sich mit jeder Gruppierung aendert.
  console.log('\nSignalfarben:');
  const stylesDuring = (fn) => {
    canvas._ctx._styles.length = 0;
    fn();
    return canvas._ctx._styles;
  };

  const signalColors = WL.PALETTE.signals.build(sim.agents.length);
  check('Eine Farbe je Tier, alle verschieden',
    signalColors.length === sim.agents.length &&
    new Set(signalColors).size === sim.agents.length);
  check('Dieselbe Nummer ergibt immer dieselbe Farbe',
    WL.PALETTE.signals.build(8).join() === signalColors.slice(0, 8).join());
  // Gleiche wahrgenommene Helligkeit: sonst verschwaenden die gelben Spuren
  // auf dem Mittagshimmel und die blauen auf dem Nachthimmel.
  const lightness = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (v) => (v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const y = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
    return y > 0.008856 ? 116 * Math.pow(y, 1 / 3) - 16 : 903.3 * y;
  };
  const spread = signalColors.map(lightness);
  check('Alle gleich hell (CIE L*)', Math.max(...spread) - Math.min(...spread) < 1,
    Math.min(...spread).toFixed(1) + ' … ' + Math.max(...spread).toFixed(1));

  layer.setColors(signalColors);
  layer.setSelection(-1);
  const drawnColors = new Set(stylesDuring(() => renderer.draw()));
  check('Die Farbe eines Tieres landet wirklich auf der Karte',
    signalColors.every((c) => drawnColors.has(c)));

  // Der Fall, um den es bei der Gruppierung geht: mehrere Tiere in einer Farbe.
  const clustered = signalColors.slice();
  clustered[1] = clustered[0];
  clustered[2] = clustered[0];
  layer.setColors(clustered);
  const afterCluster = new Set(stylesDuring(() => renderer.draw()));
  check('Ein Cluster faerbt seine Mitglieder auf der Karte um',
    afterCluster.has(clustered[0]) && !afterCluster.has(signalColors[1]));
  layer.setColors(signalColors);

  // Der Bau ist ein ortsfester Punkt, den nur eine Art hat - offen gehoert er
  // aufs Bild, verdeckt waere er ein verschenktes Artmerkmal.
  const burrowRim = WL.PALETTE.burrow.rim;
  check('Offen ist der Bau zu sehen',
    new Set(stylesDuring(() => renderer.draw())).has(burrowRim));

  // Spuren aus: der zweite Blick auf dieselbe Aufzeichnung. Offen faellt dann
  // auch die Signalfarbe am Tier weg - sonst bliebe genau ein bunter Fleck als
  // letzter Rest einer Gruppierung stehen, die die Karte gerade nicht zeigt.
  console.log('\nSpuren:');
  layer.setTrails(false);
  const withoutTrails = new Set(stylesDuring(() => renderer.draw()));
  check('Ohne Spuren keine Signalfarbe auf der offenen Karte',
    !signalColors.some((c) => withoutTrails.has(c)));
  check('… das Tier bleibt, nur farblos', withoutTrails.has(WL.PALETTE.agents.plain));
  check('… und es sind noch alle da', translatesPerDraw() === sim.agents.length);
  layer.setTrails(true);
  check('Mit Spuren ist die Signalfarbe wieder da',
    signalColors.every((c) => new Set(stylesDuring(() => renderer.draw())).has(c)));

  // Verdeckte Sicht: kein Terrain, kein Objekt, eine Farbe fuer alle Tiere.
  console.log('\nVerdeckte Sicht:');
  const sky = WL.PALETTE.masked.skyAt;
  check('Himmel wechselt von Nacht zu Tag',
    sky(0) === WL.PALETTE.masked.night && sky(1) === WL.PALETTE.masked.day &&
    sky(0.5) !== sky(0) && sky(0.5) !== sky(1),
    sky(0) + ' -> ' + sky(0.5) + ' -> ' + sky(1));
  check('Helligkeit ausserhalb 0..1 wird geklemmt',
    sky(-3) === sky(0) && sky(9) === sky(1));

  renderer.setMasked(true);
  layer.setMasked(true);
  let maskError = null;
  let maskedDrawn = -1;
  try {
    for (const t of times) { layer.setTime(t); renderer.draw(); }
    layer.setSelection(0);
    // Auch mit geladenem Sprite bleibt es in der verdeckten Sicht bei der
    // Silhouette - ein Fuchsbild waere die Antwort auf die Aufgabe.
    WL.Sprites.setMode('sprite');
    maskedDrawn = translatesPerDraw();
  } catch (e) { maskError = e; }
  check('Verdeckte Sicht zeichnet fehlerfrei', !maskError, maskError ? maskError.message : '');
  check('Alle Tiere werden auch verdeckt gezeichnet', maskedDrawn === sim.agents.length,
    maskedDrawn + ' von ' + sim.agents.length);

  layer.setSelection(-1);
  const maskedStyles = new Set(stylesDuring(() => renderer.draw()));
  check('Verdeckt bleibt der Bau weg', !maskedStyles.has(burrowRim));
  check('… die Signalfarben aber da', signalColors.every((c) => maskedStyles.has(c)));

  // Verdeckt ist das Tier nur ein Punkt: nimmt man ihm mit der Spur auch die
  // Farbe, sind alle gleich und die Karte gehoert zu keiner Kachel mehr.
  layer.setTrails(false);
  const maskedNoTrails = new Set(stylesDuring(() => renderer.draw()));
  check('Verdeckt behaelt der Punkt seine Farbe auch ohne Spur',
    signalColors.every((c) => maskedNoTrails.has(c)) &&
    !maskedNoTrails.has(WL.PALETTE.agents.plain));
  layer.setTrails(true);

  // Verdeckt sind alle Tiere gleich gross und gleich geformt - ohne die
  // Kachelnummer waere bei fuenfzig dicht beieinanderliegenden Farbtoenen
  // nicht mehr zu sagen, welches Signal man vor sich hat.
  const textsDuring = (fn) => { canvas._ctx._texts.length = 0; fn(); return canvas._ctx._texts; };
  const maskedTexts = textsDuring(() => renderer.draw());
  const width = String(sim.agents.length).length < 2 ? 2 : String(sim.agents.length).length;
  const expected = sim.agents.map((a, i) => String(sim.signalOf[i] + 1).padStart(width, '0'));
  check('Verdeckt traegt jedes Tier seine Kachelnummer',
    maskedTexts.length === sim.agents.length &&
    expected.every((t) => maskedTexts.indexOf(t) >= 0),
    maskedTexts.length + ' Nummern fuer ' + sim.agents.length + ' Tiere');
  // Genau die Nummer der Kachel, nicht die Nummer in der Aufzeichnung: eine
  // "7" auf der Karte neben einer "07" in der Liste waeren zwei Nummern fuer
  // dasselbe Tier.
  check('… und zwar die aus der Signalliste',
    maskedTexts.every((t) => t.length === width) &&
    new Set(maskedTexts).size === sim.agents.length);
  layer.setAllHidden(true);
  check('Ausgeblendete Tiere zeigen auch keine Nummer',
    textsDuring(() => renderer.draw()).length === 0);
  layer.setAllHidden(false);

  // Der Puffer der offenen Sicht bleibt liegen: Zurueckschalten kostet nichts.
  const cacheBefore = renderer.cache;
  renderer.draw();
  check('Verdeckte Sicht baut keinen Terrain-Puffer', renderer.cache === cacheBefore);

  // ------------------------------------------------------------ halb offen
  //
  // Im Unterricht wird nicht in einem Zug aufgedeckt: erst die Landschaft
  // (worin hat sich das abgespielt?) oder erst die Tiere (wer war das
  // ueberhaupt?). Die beiden Schleier muessen sich deshalb einzeln heben
  // lassen - und der haeufigste Fehler dabei ist, dass die deckende Flaeche
  // der Tierebene an der falschen Haelfte haengt und die aufgedeckte
  // Landschaft gleich wieder zumalt.
  console.log('\nHalb aufgedeckt:');
  const skyNow = () => WL.PALETTE.masked.skyAt(WL.SimTime.daylight(layer.time));

  renderer.setMasked(false);
  layer.setMaskedWorld(false);
  layer.setMaskedAgents(true);
  const worldOnly = new Set(stylesDuring(() => renderer.draw()));
  check('Nur die Welt: der deckende Himmel ist weg', !worldOnly.has(skyNow()));
  check('… die Tiere bleiben Nummern',
    textsDuring(() => renderer.draw()).length === sim.agents.length);
  check('… und der Bau bleibt weg', !worldOnly.has(burrowRim));

  renderer.setMasked(true);
  layer.setMaskedWorld(true);
  layer.setMaskedAgents(false);
  const agentsOnly = new Set(stylesDuring(() => renderer.draw()));
  check('Nur die Tiere: die Landschaft ist wieder zugedeckt', agentsOnly.has(skyNow()));
  // Das ist der Augenblick der Aufloesung: das Bild steht neben der Zahl.
  // Faellt die Nummer hier weg, ist die Zuordnung zur Kachel genau dann
  // verloren, wenn sie gezogen werden soll.
  check('… und die Nummer bleibt neben dem Tier stehen',
    textsDuring(() => renderer.draw()).length === sim.agents.length);
  check('… der Bau ist da, er gehoert zum Tier', agentsOnly.has(burrowRim));

  renderer.setMasked(false);
  layer.setMasked(false);
  let backError = null;
  try { renderer.draw(); } catch (e) { backError = e; }
  check('Zurueck zur offenen Sicht zeichnet fehlerfrei', !backError, backError ? backError.message : '');
  // Offen steht das Sprite fuer sich; fuenfzig Zahlen ueber der Landschaft
  // waeren nur Rauschen.
  check('Offen steht keine Nummer auf der Karte',
    textsDuring(() => renderer.draw()).length === 0);
}

// -------------------------------------------------------------- Nachzuegler
//
// Vor dem Bruch ist ein Nachzuegler nicht ausgeblendet, sondern nicht da. Der
// Unterschied ist auf dem Bild derselbe (kein Sprite, keine Spur), im Code
// aber nicht: das Auge darf ihn nicht hervorzaubern, und die Aufzeichnung
// haelt an seiner Stelle bereits den kuenftigen Startplatz. Ohne diese Pruefung
// stuende dort in Phase 1 fuenf Tage lang ein reglos wartendes Tier.
console.log('\nNachzügler:');
{
  const half = WL.SimTime.DAY_SECONDS / 2;
  const sim = WL.Simulation.run(world, { seconds: WL.SimTime.DAY_SECONDS, breakSeconds: half });
  const layer = WL.AgentRenderer.create();
  layer.setSimulation(sim);

  check('Der Lauf hat Nachzügler', sim.newcomers.length > 0,
    sim.newcomers.length + ' von ' + sim.agents.length + ' Tieren');

  // Die Phasenfenster von SimTime passen hier nicht (der Lauf ist kuerzer als
  // eine Phase), deshalb wird die Abwesenheit direkt aus der Aufzeichnung
  // gelesen - genau so, wie der Renderer sie sieht.
  const ABSENT = WL.Agents.STATES.abwesend;
  const rec = sim.recording;
  const idx = sim.newcomers[0];
  check('… und ist vor dem Bruch als abwesend aufgezeichnet',
    rec.state[idx * rec.sampleCount] === ABSENT);
  check('… danach nicht mehr',
    rec.state[idx * rec.sampleCount + rec.sampleCount - 1] !== ABSENT);

  layer._absent = sim.agents.map((a, i) => sim.newcomers.indexOf(i) >= 0);
  layer.setTime(0);
  check('Abwesende Tiere sind nicht antippbar',
    layer.pick(rec.x[idx * rec.sampleCount], rec.y[idx * rec.sampleCount], 60) !== idx);
  layer.setAllHidden(false);
  check('… auch "alle einblenden" holt sie nicht zurück',
    layer.pick(rec.x[idx * rec.sampleCount], rec.y[idx * rec.sampleCount], 60) !== idx);

  // Und die Spur eines Nachzueglers beginnt bei seiner Ankunft, nicht bei 0.
  const trail = rec.trail(idx);
  check('Die Spur beginnt erst bei der Ankunft',
    trail.count === 0 || trail.idx[0] >= Math.round(half * WL.SimTime.SAMPLE_HZ),
    'erster Punkt bei Stützstelle ' + (trail.count ? trail.idx[0] : '-'));
}

console.log('\nGezeichnete Operationen: ' + Object.entries(opCounts).map(([k, v]) => k + '=' + v).join(', '));
console.log('\n' + (failures === 0 ? 'ALLE RENDER-PRUEFUNGEN BESTANDEN' : failures + ' FEHLGESCHLAGEN'));
process.exit(failures ? 1 : 0);
