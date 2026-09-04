/**
 * Wild Clusters im Raum: die Seite um den Rahmen herum (../tool.js).
 *
 * Die anderen fünf Werkzeuge prüfen die Anwendung. Dieses prüft das
 * MPSkills-Werkzeug daneben — die Datei, die den Raum-Zustand in einen Befehl
 * übersetzt und das, was zurückkommt, in einen Beitrag. Sie kennt kein Canvas
 * und keine Welt, nur Nachrichten: genau deshalb lässt sie sich ohne Browser
 * durchspielen, und genau deshalb lohnt es sich.
 *
 * Nachgestellt sind beide Gegenüber:
 *
 * * **der Rahmen** — ein `contentWindow`, das die Befehle mitschreibt, plus
 *   `fromFrame()` für den Rückweg (`ready` · `world` · `clusters` ·
 *   `world-pick`). `frameAnswers()` antwortet so, wie es die Anwendung tut:
 *   Welt bauen, melden, und melden, was auf ihr liegt.
 * * **der Raum** — `ctx` mit den Aktionen und ein `view` mit Raumcode,
 *   Sitzplatz, Phase und Beiträgen.
 *
 * Das DOM ist ein Stummel: `tool.js` fasst außer dem eigenen Kasten nichts an,
 * und was es dort tut (Knöpfe zeichnen, Höhe messen), ist nicht das, was hier
 * schiefgehen kann.
 *
 * Geprüft wird die eine Regel, an der die Arbeit einer Stunde hängt:
 * **bewahrt werden die drei Welten des Raums, und sonst nichts.**
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TOOL = process.env.WC_TOOL || path.join(__dirname, '..', 'tool.js');

const CSS = {
  paddingBottom: '0', borderBottomWidth: '0', marginBottom: '0',
  marginTop: '0', display: 'block', position: 'static'
};

/* Ein Element, das alles kann, was tool.js von ihm verlangt, und nichts
   davon wirklich tut. Kinder entstehen beim ersten Fragen, damit jeder
   querySelector zweimal dasselbe liefert - daran haengt, dass ein
   aria-Attribut nicht ins Leere gesetzt wird. */
function el(name) {
  const e = {
    name, style: {}, dataset: {}, hidden: false, innerHTML: '', href: '',
    offsetHeight: 0, nextElementSibling: null, parentElement: null,
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, closest() { return null; },
    getBoundingClientRect() { return { top: 0 }; },
    querySelector(sel) { return e._kids[sel] || (e._kids[sel] = el(sel)); },
    _kids: Object.create(null)
  };
  return e;
}

/**
 * Ein aufgesetztes Werkzeug in seiner eigenen Sandbox.
 *
 * @param role        'student' (Tablet) oder 'presenter' (Beamer)
 * @param entriesFor  optional: (worlds) => Beitraege, die VOR dem ersten
 *                    update() im Raum liegen. Nur so laeuft absorb() - danach
 *                    steht `restored` und der Server kommt zu spaet.
 */
function run(role, entriesFor) {
  const posted = [];
  const frameWin = { postMessage(m) { posted.push(JSON.parse(JSON.stringify(m))); } };

  const root = el('root');
  root._kids['.wl-host'] = el('.wl-host');
  const frame = el('.wl-frame');
  frame.contentWindow = frameWin;
  root._kids['.wl-frame'] = frame;

  const mem = Object.create(null);
  const listeners = Object.create(null);

  const sandbox = {
    console,
    location: { origin: 'https://x.test' },
    setTimeout, clearTimeout,
    requestAnimationFrame() {},
    innerHeight: 900,
    getComputedStyle: () => CSS,
    sessionStorage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); }
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener() {}, removeEventListener() {},
      fullscreenElement: null
    },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    removeEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  let impl = null;
  sandbox.MPTool = { register(id, i) { impl = i; } };

  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(TOOL, 'utf8'), sandbox, { filename: 'tool.js' });

  const saved = [];
  const ctx = {
    role, preview: false,
    esc: (s) => String(s == null ? '' : s),
    toast() {}, errText: (s) => s, refresh() {},
    actions: {
      upsert: async (payload) => {
        saved.push(JSON.parse(JSON.stringify(payload)));
        return { ok: true, id: 'e1' };
      },
      setData: async () => ({ ok: true }),
      setPhase: async () => ({ ok: true })
    }
  };
  const view = {
    room: { code: 'RAUM7' }, me: { seat: 3 },
    state: { phase: 1, data: {} }, entries: [], limits: {}
  };

  if (entriesFor) view.entries = entriesFor(probeWorlds());

  impl.mount(root, ctx);
  impl.update(view);

  const fromFrame = (event, data) => {
    const msg = Object.assign({ type: 'wc:event', event }, data);
    for (const fn of (listeners.message || [])) {
      fn({ source: frameWin, origin: sandbox.location.origin, data: msg });
    }
  };

  return { impl, view, posted, saved, fromFrame, last: () => posted[posted.length - 1] };
}

/* Die drei Welten haengen nur an Raumcode + Sitzplatz, sind aber in der IIFE
   eingeschlossen (seedsFor). Wer sie vor dem Aufsetzen braucht - fuer einen
   Beitrag, der schon im Raum liegt -, holt sie sich hier aus einem Probelauf. */
let probed = null;
function probeWorlds() {
  if (probed) return probed;
  const t = run('student');
  t.fromFrame('ready', {});
  probed = t.last().worlds.map(String);
  return probed;
}

/* Der Rahmen antwortet auf einen Befehl so, wie es die Anwendung tut: er baut
   die Welt, meldet sie, und meldet dann, was auf ihr liegt. Kam eine
   Gruppierung mit, ist genau die es - sonst das, was der Aufbau selbst
   gebildet hat (in Phase 2 der Haufen der Nachzuegler). */
function frameAnswers(t, groupsOnBuild) {
  const cmd = t.last();
  t.fromFrame('world', { seed: cmd.seed });
  t.fromFrame('clusters', {
    seed: cmd.seed, phase: cmd.phase,
    groups: cmd.groups !== undefined ? cmd.groups : (groupsOnBuild || [])
  });
  return cmd;
}

let fails = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('ok     ' + name); return; }
  fails++;
  console.log('FEHLT  ' + name, extra === undefined ? '' : JSON.stringify(extra));
}

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ══════════════════════════════════════════════════════════
   Die Lehrkraft hat drei eigene Welten - und behaelt sie
   ══════════════════════════════════════════════════════════
   Am Pult wird nichts gespeichert, aber der Notizblock darf zwischen zwei
   Welten nicht verschwinden: wer in Welt I etwas aufgebaut hat, um es zu
   zeigen, will es nach einem Blick in Welt II wiederfinden. */
function pultBehaeltSeineWelten() {
  const t = run('presenter');
  t.fromFrame('ready', {});
  const first = frameAnswers(t, []);
  const w = first.worlds.slice();
  ok('Pult startet in Welt I', String(first.seed) === String(w[0]), first.seed);

  const gruppe = [{ m: [3, 7], c: '#abc' }];
  t.fromFrame('clusters', { seed: w[0], phase: 0, groups: gruppe });

  t.fromFrame('world-pick', { seed: w[1] });
  const zwei = frameAnswers(t, []);
  ok('Wechsel baut Welt II', String(zwei.seed) === String(w[1]), zwei.seed);
  ok('Welt II bekommt keine fremde Gruppierung', zwei.groups === undefined, zwei.groups);

  t.fromFrame('world-pick', { seed: w[0] });
  ok('Welt I bringt die Gruppierung wieder mit', gleich(t.last().groups, gruppe), t.last().groups);
}

/* Phase 2: der Haufen der Nachzuegler ist keine Handlung, aber ein Stand -
   und ein mitgeschicktes leeres [] raeumte ihn beim naechsten Aufbau weg. */
function pultBehaeltDieNachzuegler() {
  const t = run('presenter');
  t.view.state.phase = 2;
  t.impl.update(t.view);
  t.fromFrame('ready', {});
  const w = frameAnswers(t, []).worlds.slice();
  const nach = [{ m: [40, 41, 42, 43, 44], c: '#fff' }];

  t.fromFrame('world-pick', { seed: w[1] });
  ok('Phase 2: kein leeres [] in den Rahmen', t.last().groups === undefined, t.last().groups);
  frameAnswers(t, nach);

  t.fromFrame('world-pick', { seed: w[0] });
  frameAnswers(t, []);
  t.fromFrame('world-pick', { seed: w[1] });
  ok('Der Haufen der Nachzügler ist beim zweiten Besuch wieder da',
     gleich(t.last().groups, nach), t.last().groups);
}

/* Das Tablet: die drei Welten des Raums werden bewahrt, ein selbst
   eingetippter Seed (Aufloesungsphase) nicht - weder im Geraet noch im
   Beitrag. */
function tabletBewahrtNurDieDrei(next) {
  const t = run('student');
  t.fromFrame('ready', {});
  const w = frameAnswers(t, []).worlds.slice();
  const eigen = 123456;

  const g1 = [{ m: [1, 2], c: '#a' }];
  t.fromFrame('clusters', { seed: w[0], phase: 0, groups: g1 });

  t.view.state.phase = 3;
  t.impl.update(t.view);
  t.fromFrame('world', { seed: eigen });
  t.fromFrame('clusters', { seed: eigen, phase: 1, groups: [{ m: [5, 6], c: '#b' }] });

  t.fromFrame('world-pick', { seed: w[0] });
  ok('Tablet: Welt I bringt ihre Gruppierung mit', gleich(t.last().groups, g1), t.last().groups);
  frameAnswers(t, []);

  t.fromFrame('world-pick', { seed: eigen });
  ok('Tablet: der eigene Seed fängt wieder leer an',
     t.last().groups === undefined, t.last().groups);

  // Der Beitrag geht gebremst raus (1,5 s), also erst danach nachsehen.
  setTimeout(() => {
    const p = t.saved[t.saved.length - 1];
    ok('Beitrag: die eigene Welt steht drin', !!(p && p.w && p.w[String(w[0])]), p && p.w);
    ok('Beitrag: der freie Seed steht NICHT drin', !!(p && p.w && !p.w[String(eigen)]), p && p.w);
    next();
  }, 1800);
}

/* Ein Beitrag aus einer frueheren Fassung kann Welten tragen, die heute nicht
   mehr bewahrt werden - ein selbst eingetippter Seed, oder die drei eines
   anderen Sitzplatzes. Beim Aufsetzen wird gestutzt, sonst legte push() eine
   Arbeit auf, die es nicht mehr geben soll. */
function alterBestandWirdGestutzt(next) {
  const alt = [{ m: [9, 10], c: '#c' }];
  const fremd = 999111;
  const w = probeWorlds();

  const t = run('student', (worlds) => [{
    id: 'e9', is_mine: true, kind: 'gruppierung', author: 'ich',
    payload: {
      cur: Number(worlds[0]), ws: worlds.map(Number),
      w: { [worlds[1]]: alt, [fremd]: [{ m: [1, 2], c: '#d' }] }
    }
  }]);

  t.fromFrame('ready', {});
  ok('Alter Beitrag: die zuletzt gesehene Welt kommt zurück',
     String(t.last().seed) === String(w[0]), t.last().seed);
  frameAnswers(t, []);

  t.fromFrame('world-pick', { seed: Number(w[1]) });
  ok('Alter Beitrag: die Gruppierung einer eigenen Welt lebt',
     gleich(t.last().groups, alt), t.last().groups);
  frameAnswers(t, []);

  t.view.state.phase = 3;
  t.impl.update(t.view);
  t.fromFrame('world-pick', { seed: fremd });
  ok('Alter Beitrag: der fremde Seed ist weggeräumt',
     t.last().groups === undefined, t.last().groups);

  setTimeout(() => {
    const p = t.saved[t.saved.length - 1];
    ok('Alter Beitrag: der fremde Seed geht auch nicht zurück auf den Server',
       !!(p && p.w && !p.w[String(fremd)]), p && p.w);
    next();
  }, 1800);
}

pultBehaeltSeineWelten();
pultBehaeltDieNachzuegler();
tabletBewahrtNurDieDrei(() => alterBestandWirdGestutzt(() => {
  console.log(fails ? '\n' + fails + ' Prüfung(en) offen' : '\nalles grün');
  process.exit(fails ? 1 : 0);
}));
