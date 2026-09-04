/**
 * Die Bruecke (js/ui/bridge.js) gegen einen nachgestellten Rahmen.
 *
 * Die anderen Werkzeuge pruefen die Anwendung, roomtest.js prueft die Seite
 * daneben - dazwischen lag bis zum 04.09.2026 eine Naht, die niemand ansah,
 * und genau in ihr steckte der Fehler, an dem eine Klasse ihre Arbeit verlor:
 *
 *   Ein Weltaufbau ist zweistufig und laeuft ueber zwei setTimeout. Mittendrin
 *   baut sich die Signalliste neu auf und meldet dabei eine LEERE Gruppierung
 *   (setSimulation -> publishColors). Zu diesem Zeitpunkt zeigt `lastSeed` in
 *   der Bruecke noch auf die Welt, die gerade noch dastand. Ging diese Meldung
 *   nach oben, sah sie aus wie "die Person hat in Welt I alles aufgeloest" -
 *   und der naechste Speichervorgang loeschte ihre Arbeit, im Geraet wie auf
 *   dem Server.
 *
 * Gesperrt war das nur fuer Aufbauten, die von OBEN kamen (`busy` in applyNow).
 * "Neue Welt" und das Seed-Feld sitzen aber in der Anwendung selbst.
 *
 * Geprueft wird deshalb zweierlei:
 *
 * 1. **die Regel** - waehrend eines Aufbaus geht keine Gruppierung nach oben,
 *    egal wer ihn angestossen hat. Dafuer laeuft die echte bridge.js gegen ein
 *    Doppel von WILDCLUSTERS.
 * 2. **die Naht selbst** - dass app.js seinen buildHook wirklich VOR
 *    `signals.setSimulation` ruft. Das Doppel unten stellt diese Reihenfolge
 *    nach, und ein Doppel beweist nur, was ich glaube; deshalb steht die
 *    Reihenfolge zusaetzlich als Textpruefung gegen die echte Datei.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.join(__dirname, '..');

let fails = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('ok     ' + name); return; }
  fails++;
  console.log('FEHLT  ' + name, extra === undefined ? '' : JSON.stringify(extra));
}

/* Ein Element, das alles kann, was bridge.js von ihm verlangt. */
function el(tag) {
  const e = {
    tag, className: '', id: '', hidden: false, disabled: false,
    innerHTML: '', textContent: '', title: '', type: '',
    children: [], firstChild: null,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, appendChild(c) { e.children.push(c); },
    insertBefore(c) { e.children.push(c); },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  return e;
}

/** Bruecke + Doppel in einer Sandbox. */
function run() {
  const up = [];                       // was nach oben ging
  const parent = { postMessage(m) { up.push(JSON.parse(JSON.stringify(m))); } };

  const controls = el('div');
  const ids = Object.create(null);

  const sandbox = {
    console, setTimeout, clearTimeout,
    parent,
    location: { origin: 'https://x.test' },
    document: {
      body: { classList: { toggle() {} } },
      createElement: (t) => el(t),
      querySelector: (sel) => (sel === '.controls' ? controls : null),
      getElementById: (id) => ids[id] || (ids[id] = el('div'))
    },
    addEventListener(type, fn) { (sandbox._on[type] || (sandbox._on[type] = [])).push(fn); },
    _on: Object.create(null)
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  /* Das Doppel. Sein rebuild() stellt die Reihenfolge aus app.js nach: erst
     der buildHook, dann die Signalliste (die leer meldet), dann die Phase, und
     ganz zuletzt der worldHook. Genau diese Reihenfolge ist der Fehler-
     kandidat, und sie wird unten zusaetzlich gegen die echte Datei geprueft. */
  let buildHook = null, worldHook = null, clusterHook = null;
  let groups = [];
  const WC = {
    phase: 0, maskedWorld: true, maskedAnimals: true,
    signals: { groups: () => groups.slice() },
    rebuild(seedValue) {
      if (buildHook) buildHook();
      groups = [];                                   // signals.setSimulation
      if (clusterHook) clusterHook(groups.slice());  //   -> publishColors
      if (clusterHook) clusterHook(groups.slice());  // setPhase(0) -> dito
      if (worldHook) worldHook(String(seedValue));   // ganz zuletzt
    },
    applyGroups(list) {
      groups = (list || []).slice();
      if (clusterHook) clusterHook(groups.slice());
    },
    setPhase(p) { WC.phase = p; if (clusterHook) clusterHook(groups.slice()); },
    setMaskedParts(w, a) { WC.maskedWorld = w; WC.maskedAnimals = a; },
    hideDetails() {},
    setBuildHook(f) { buildHook = f || null; },
    setWorldHook(f) { worldHook = f || null; },
    setClusterHook(f) { clusterHook = f || null; }
  };
  sandbox.WILDCLUSTERS = WC;

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js', 'ui', 'bridge.js'), 'utf8'),
    sandbox, { filename: 'bridge.js' });

  const down = (cmd) => {
    const msg = Object.assign({ type: 'wc:cmd' }, cmd);
    for (const fn of (sandbox._on.message || [])) {
      fn({ source: parent, origin: sandbox.location.origin, data: msg });
    }
  };

  /** Eine Kachel ziehen: das ist die einzige Meldung, die ein Mensch ausloest. */
  const drag = (list) => { groups = list.slice(); if (clusterHook) clusterHook(groups.slice()); };

  const events = (name) => up.filter(m => m.event === name);
  return { up, down, drag, events, WC };
}

/* ══════════════════════════════════════════════════════════
   Ein Aufbau, den die Anwendung selbst anstoesst
   ══════════════════════════════════════════════════════════
   „Neue Welt" und das Seed-Feld sitzen IN der Anwendung. Was sie dabei an
   Gruppierung meldet, gehoert dem Aufbau - und darf nicht als Arbeit an der
   Welt nach oben gehen, die gerade noch dastand. */
function eigenerAufbauSchweigt() {
  const t = run();
  ok('die Brücke meldet sich', t.events('ready').length === 1, t.up);

  t.down({ seed: 'A', worlds: ['A', 'B', 'C'], phase: 0, masked: { w: true, a: true }, locks: {} });
  ok('Welt A steht', t.events('world').length === 1 && t.events('world')[0].seed === 'A',
     t.events('world'));

  const g = [{ m: [1, 2], c: '#a' }];
  t.drag(g);
  const nach = t.events('clusters');
  ok('eine gezogene Gruppierung geht nach oben',
     nach.length && nach[nach.length - 1].seed === 'A'
     && JSON.stringify(nach[nach.length - 1].groups) === JSON.stringify(g), nach);

  // Und jetzt der Fall: die Anwendung baut von sich aus.
  const vorher = t.events('clusters').length;
  t.WC.rebuild('R');
  const neu = t.events('clusters').slice(vorher);
  const leerAufA = neu.filter(m => m.seed === 'A' && (!m.groups || !m.groups.length));
  ok('„Neue Welt" meldet keine leere Gruppierung auf Welt A', leerAufA.length === 0, neu);
  ok('gemeldet wird erst die fertige neue Welt',
     neu.length === 1 && neu[0].seed === 'R', neu);
}

/* Dasselbe fuer einen Aufbau von oben - das war schon vorher dicht und muss
   es bleiben. */
function aufbauVonObenSchweigtWeiter() {
  const t = run();
  t.down({ seed: 'A', worlds: ['A', 'B'], phase: 0, masked: { w: true, a: true }, locks: {} });
  t.drag([{ m: [1, 2], c: '#a' }]);

  const vorher = t.events('clusters').length;
  t.down({ seed: 'B', worlds: ['A', 'B'], phase: 0, masked: { w: true, a: true }, locks: {} });
  const neu = t.events('clusters').slice(vorher);
  ok('Weltwechsel von oben meldet nichts auf der alten Welt',
     neu.every(m => m.seed === 'B'), neu);
}

/* Und eine Gruppierung, die von oben aufgelegt wird, ist keine Handlung -
   sonst schriebe der Beamer die Arbeit eines Kindes als seine eigene fort. */
function aufgelegtesSchweigt() {
  const t = run();
  t.down({ seed: 'A', worlds: ['A'], phase: 0, masked: { w: true, a: true }, locks: {} });
  const vorher = t.events('clusters').length;
  t.down({ seed: 'A', groups: [{ m: [3, 4], c: '#b' }] });
  ok('eine aufgelegte Gruppierung meldet sich nicht zurück',
     t.events('clusters').length === vorher, t.events('clusters').slice(vorher));
}

/* Die Naht selbst. Das Doppel oben stellt die Reihenfolge aus app.js nach,
   und ein Doppel beweist nur, was der Schreiber glaubt - deshalb hier gegen
   die echte Datei: der buildHook muss im build() VOR signals.setSimulation
   stehen, sonst ist die Sperre einen Wimpernschlag zu spaet. */
function nahtStimmt() {
  const src = fs.readFileSync(path.join(DIR, 'js', 'ui', 'app.js'), 'utf8');
  const von = src.indexOf('function build(');
  ok('app.js hat ein build()', von >= 0);
  if (von < 0) return;
  const bis = src.indexOf('function setPhase(', von);
  const body = src.slice(von, bis > 0 ? bis : src.length);
  const hook = body.indexOf('buildHook(');
  const liste = body.indexOf('signals.setSimulation(');
  ok('app.js meldet den Aufbau an, bevor die Signalliste sich neu baut',
     hook >= 0 && liste >= 0 && hook < liste, { hook, liste });
}

eigenerAufbauSchweigt();
aufbauVonObenSchweigtWeiter();
aufgelegtesSchweigt();
nahtStimmt();

console.log(fails ? '\n' + fails + ' Prüfung(en) offen' : '\nalles grün');
process.exit(fails ? 1 : 0);
