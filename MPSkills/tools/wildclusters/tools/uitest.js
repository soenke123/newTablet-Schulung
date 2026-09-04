/**
 * UI-Test ohne Browser: minimaler DOM-Mock fuer die Signalliste.
 *
 * Die Liste rechts neben der Karte ist reine Zustandslogik ueber DOM-Knoten -
 * Nummerierung, Mischung, Auswahl, Auge je Kachel, Auge je Cluster, Auge fuer
 * alle - und dazu das Gruppieren per Ziehen. Sie laesst sich deshalb ohne
 * Layout pruefen; gemockt wird nur so viel vom DOM, wie js/ui/signals.js
 * tatsaechlich anfasst.
 *
 * Das Ziehen wird echt durchgespielt, nicht simuliert: die Testhilfe feuert
 * dieselben Pointer-Events, die auch ein Finger ausloest, und laesst
 * document.elementFromPoint auf das gewuenschte Ziel zeigen. Damit laufen die
 * Schwelle, die Ahnenkette vom getroffenen Knoten zum Griff und die Frage
 * "bewirkt das Loslassen hier ueberhaupt etwas" durch denselben Code wie im
 * Browser. Nur die Geometrie fehlt.
 *
 * Am Ende steht der Abspieler (js/ui/player.js). Auch er ist Zustandslogik
 * ueber ein paar Knoten, und die eine Regel, die dort schiefgehen kann, ist die
 * Landung am Ende der Aufzeichnung: dort haelt er an und laesst das volle Netz
 * stehen. Das laesst sich nur pruefen, indem die Bilder wirklich einzeln
 * abgespielt werden - der Mock sammelt sie ohnehin schon.
 *
 * Was hier *nicht* geprueft wird: das Aussehen. Dass ein ausgeblendetes Tier
 * auch wirklich nicht mehr gezeichnet wird, steht in tools/rendertest.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const FILES = [
  'js/render/palette.js', 'js/ui/clusters.js', 'js/ui/signals.js',
  'js/sim/time.js', 'js/ui/player.js'
];

// ------------------------------------------------------------------ Mock

function El(tag) {
  const classes = new Set();
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    parentNode: null,
    innerHTML: '',
    style: {},
    attrs: {},
    handlers: {},
    title: '',
    type: '',
    disabled: false,
    _text: '',
    // Wie im echten DOM: textContent zu setzen wirft die Kinder weg - genau
    // darauf verlaesst sich der Neuaufbau nach jedem Gruppieren.
    get textContent() { return el._text; },
    set textContent(v) {
      el._text = String(v);
      el.children.forEach((c) => { c.parentNode = null; });
      el.children.length = 0;
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); }
    },
    get className() { return [...classes].join(' '); },
    set className(v) {
      classes.clear();
      String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) {
      const at = el.children.indexOf(child);
      if (at >= 0) { el.children.splice(at, 1); child.parentNode = null; }
      return child;
    },
    addEventListener(name, fn) { (el.handlers[name] = el.handlers[name] || []).push(fn); },
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return el.attrs[k] === undefined ? null : el.attrs[k]; },
    /*
     * Mit Blasen nach oben, nicht nur am getroffenen Knoten: das Auge sitzt im
     * Clusterkopf, und der Kopf waehlt aus. Ob das Auge seinen Klick wirklich
     * anhaelt (stopPropagation), laesst sich nur so pruefen.
     */
    click() {
      const event = { type: 'click', target: el, _stopped: false };
      event.stopPropagation = () => { event._stopped = true; };
      let node = el;
      while (node) {
        (node.handlers.click || []).forEach((fn) => fn(event));
        if (event._stopped) return;
        node = node.parentNode;
      }
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    scrollIntoView() {}
  };
  return el;
}

const documentMock = { createElement: El, body: El('body'), elementFromPoint: () => documentMock._hit };

// Waehrend des Ziehens laeuft ein Timer, der die Liste am Rand weiterrollt.
// Hier wird er nur gezaehlt - geprueft wird, dass kein Ziehvorgang einen
// zurueckliegen laesst.
let liveTimers = 0;

/*
 * Waehrend des Ziehens wird die Arbeit je Fingerbewegung (Schwebekasten
 * nachfuehren, Ziel unter dem Finger suchen) auf ein Bild gebuendelt - ein
 * Tablet liefert Bewegungen schneller, als der Browser zeichnet. Der Mock
 * fuehrt sie deshalb nicht sofort aus, sondern sammelt sie; frames() sagt,
 * wie oft wirklich gearbeitet wurde, flush() spielt das naechste Bild ab.
 */
const pendingFrames = new Map();
let nextFrameId = 1;
let framesRun = 0;
const flushFrames = () => {
  const due = [...pendingFrames.values()];
  pendingFrames.clear();
  due.forEach((fn) => { framesRun++; fn(); });
};

/*
 * Der zweite Weg in die Ziehgeste ist das Stillhalten (HOLD_MS in
 * js/ui/signals.js). Ohne eine Uhr laesst sich das nicht pruefen - und mit
 * einer echten muesste der Test warten. Der Mock legt die Rueckrufe deshalb
 * beiseite; hold() zieht die Uhr vor, wenn der Test es will.
 */
const pendingHolds = new Map();
let nextHoldId = 1;
const runHolds = () => {
  const due = [...pendingHolds.values()];
  pendingHolds.clear();
  due.forEach((fn) => fn());
};

const sandbox = {
  console, document: documentMock, Math, Object, Array, String, Number, parseInt, isFinite,
  setInterval: () => ++liveTimers,
  clearInterval: () => { liveTimers--; },
  setTimeout: (fn) => { pendingHolds.set(nextHoldId, fn); return nextHoldId++; },
  clearTimeout: (id) => { pendingHolds.delete(id); },
  requestAnimationFrame: (fn) => { pendingFrames.set(nextFrameId, fn); return nextFrameId++; },
  cancelAnimationFrame: (id) => { pendingFrames.delete(id); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}
const WL = sandbox.WL;

let failures = 0;
function check(name, ok, info) {
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (info ? ' (' + info + ')' : ''));
}

// ------------------------------------------------------- Clustermodell

console.log('\nClustermodell (ohne DOM):');
{
  const farben = WL.PALETTE.signals.build(8);
  const m = WL.Clusters.create();
  m.setCount(8, farben);
  const S = WL.Clusters.signal;
  const G = WL.Clusters.group;

  check('Am Anfang steckt nichts in einer Gruppe',
    m.loose().length === 8 && m.groups().length === 0);
  check('Jedes Signal hat seine eigene Farbe', new Set(farben).size === 8);

  check('Zwei Signale ergeben ein Cluster', m.join(S(3), S(5)) === true);
  check('… mit beiden Mitgliedern',
    m.groups().length === 1 && m.groups()[0].members.join(',') === '3,5');
  check('… in der Farbe des Ziels',
    m.colorOf(3) === farben[5] && m.colorOf(5) === farben[5],
    m.colorOf(3) + ' / ' + farben[5]);
  check('… und aus dem freien Bereich verschwunden', m.loose().indexOf(3) < 0);

  const id = m.groups()[0].id;
  check('Ein drittes Signal kommt dazu', m.join(S(1), G(id)) === true &&
    m.groups()[0].members.join(',') === '1,3,5');
  check('Das Cluster behaelt beim Hineinziehen seine Farbe', m.colorOf(1) === farben[5]);

  // Eine Kachel *innerhalb* eines Clusters meint das Cluster - mit dem Finger
  // trifft man die Kachel, nicht den Rahmen darum.
  check('Auf ein Mitglied gezogen heisst: in dessen Cluster',
    m.join(S(7), S(3)) === true && m.groups()[0].members.join(',') === '1,3,5,7');

  m.join(S(0), S(2));
  check('Ein zweites Cluster steht daneben', m.groups().length === 2);
  const zweitId = m.groups()[1].id;
  const zweitFarbe = m.groups()[1].color;
  check('Cluster in Cluster ziehen fuegt zusammen', m.join(G(id), G(zweitId)) === true);
  check('… zu einem einzigen', m.groups().length === 1 &&
    m.groups()[0].members.join(',') === '0,1,2,3,5,7');
  check('… in der Farbe des Ziels', m.colorOf(5) === zweitFarbe);

  check('Ein Signal laesst sich herausziehen', m.detach(S(5)) === true);
  check('… und steht wieder allein in seiner eigenen Farbe',
    m.loose().indexOf(5) >= 0 && m.colorOf(5) === farben[5]);

  check('Ein Cluster loest sich ganz auf', m.detach(G(m.groups()[0].id)) === true);
  check('… und alle stehen wieder allein', m.loose().length === 8 && m.groups().length === 0);

  // Ein Cluster aus einem Tier ist keine Gruppe, sondern ein Tier mit Rahmen.
  m.join(S(4), S(6));
  m.detach(S(4));
  check('Dem vorletzten Mitglied entzogen faellt das Cluster auseinander',
    m.groups().length === 0 && m.loose().length === 8);

  check('Auf sich selbst gezogen passiert nichts', m.join(S(2), S(2)) === false);
  check('Ohne Cluster gibt es nichts herauszuziehen', m.detach(S(2)) === false);
  m.join(S(2), S(4));
  check('Was schon drin ist, kommt nicht noch einmal hinein',
    m.join(S(2), S(4)) === false);
  check('canJoin und join sind sich einig',
    m.canJoin(S(2), S(4)) === false && m.canJoin(S(0), S(4)) === true);
}

// ------------------------------------------------------------- Aufbau

const grid = El('div');
const allBtn = El('button');
const undoBtn = El('button');

// Die Auswahl ist eine Menge von Tieren, kein einzelnes: eine Kachel meint
// eines, ein Clusterkopf alle seine Mitglieder.
let selected = [];
let visibility = [];
let colors = [];
// Beginn und Ende einer Ziehgeste: daran haengt in app.js das Anhalten der
// Uhr, damit die Karte waehrend der Geste nicht um denselben Hauptthread
// kaempft.
let dragEvents = [];
// Die Gruppierung nach aussen. Daran haengt im Raum (MPSkills) der Beitrag
// auf dem Server - und damit, ob eine Welt, die jemand verlaesst, ihre
// Gruppen behaelt.
let clusterReports = [];
const panel = WL.Signals.create({ grid: grid, allBtn: allBtn, undoBtn: undoBtn }, {
  onSelect: function (list) { selected = list; panel.setSelection(list); },
  onVisibility: function (indices, hidden) { visibility.push([indices, hidden]); },
  onColors: function (c) { colors = c; },
  onClusters: function (g) { clusterReports.push(g); },
  onDrag: function (active) { dragEvents.push(active); }
});

/**
 * Eine Aufzeichnung braucht die Liste nicht - nur, wie viele Tiere es sind
 * und in welcher Reihenfolge sie unter den Kacheln stecken. Die Mischung ist
 * hier eine feste Verschiebung: sie muss nur *keine* Identitaet sein.
 */
function fakeSim(count) {
  const order = [];
  for (let i = 0; i < count; i++) order.push((i * 7 + 3) % count);
  return { agents: new Array(count).fill(0).map(() => ({})), signalOrder: order };
}

const COUNT = 45;
const sim = fakeSim(COUNT);

const looseZone = () => grid.children[grid.children.length - 1];
const clusterBoxes = () => grid.children.slice(0, -1);
const allTiles = () => {
  const out = [];
  const walk = (el) => {
    if (el.getAttribute && el.getAttribute('data-signal') != null) { out.push(el); return; }
    el.children.forEach(walk);
  };
  grid.children.forEach(walk);
  return out;
};
const tileOf = (signal) =>
  allTiles().find((t) => t.getAttribute('data-signal') === String(signal));
const pickBtn = (signal) => tileOf(signal).children[0];
const eyeBtn = (signal) => tileOf(signal).children[1];
const label = (signal) => pickBtn(signal).textContent;
/*
 * Wie viele Kacheln sind gerade sichtbar? Frueher stand diese Zahl als
 * "44/45" im Kopf der Liste; sie ist raus, weil die Gesamtzahl der Tiere eine
 * Angabe ueber die Welt ist. Die Rechnung dahinter gibt es weiter - sie
 * steuert den Alle-Knopf -, also wird sie hier am sichtbaren Zustand der
 * Kacheln geprueft statt an einer Beschriftung.
 */
const visibleTiles = () => allTiles().filter((t) => !t.classList.contains('off')).length;
const markedTiles = () => allTiles().filter((t) => t.classList.contains('on')).length;

/*
 * Die Auswahl als vergleichbare Zeichenkette. Verglichen wird in *Tiernummern*,
 * denn genau die gehen nach aussen - waeren es Kachelnummern, ginge die
 * Mischung durch, ohne dass es auffiele.
 */
const aufsteigend = (a, b) => a - b;
const auswahl = () => selected.slice().sort(aufsteigend).join(',');
const tiereHinter = (...signals) =>
  signals.map((s) => sim.signalOrder[s]).sort(aufsteigend).join(',');
const nichtsAusgewaehlt = () => { selected = []; panel.setSelection([]); };

console.log('\nSignalliste - Aufbau:');
panel.setSimulation(sim);
check('Eine Kachel je Tier', allTiles().length === COUNT, allTiles().length + ' Kacheln');
check('Alles steht zunaechst im freien Bereich',
  looseZone().children.length === COUNT && clusterBoxes().length === 0);
check('Nummern zweistellig und fortlaufend',
  label(0) === '01' && label(9) === '10' && label(44) === '45', label(0) + ' … ' + label(44));
check('Die Nummern stehen sortiert nebeneinander',
  looseZone().children.every((t, i) => t.children[0].textContent === String(i + 1).padStart(2, '0')));
check('Alle Kacheln sind zunaechst sichtbar', visibleTiles() === 45, String(visibleTiles()));
check('Kacheln nennen die Art nicht',
  allTiles().every((t) => /^\d+$/.test(t.children[0].textContent)));

// Der Kern von Punkt 2: die Nummern sind sortiert, die Tiere dahinter nicht.
console.log('\nMischung:');
check('Die Tiere hinter den Kacheln sind gemischt',
  sim.signalOrder.some((agent, signal) => agent !== signal),
  'Kachel 01 zeigt Tier ' + sim.signalOrder[0]);
pickBtn(0).click();
check('Die Kachel waehlt das Tier hinter der Mischung aus',
  auswahl() === tiereHinter(0), 'Tier ' + auswahl());
pickBtn(0).click();

console.log('\nFarben:');
check('Jedes Tier hat eine Farbe', colors.length === COUNT &&
  colors.every((c) => /^#[0-9a-f]{6}$/.test(c)));
check('Die Farben sind alle verschieden', new Set(colors).size === COUNT);
check('Die Farbe liegt auf der Kachel',
  pickBtn(0).style.background === colors[sim.signalOrder[0]],
  pickBtn(0).style.background);
check('… und wird nach Tiernummer gemeldet, nicht nach Kachelnummer',
  colors[sim.signalOrder[7]] === pickBtn(7).style.background);

console.log('\nAuswahl:');
pickBtn(3).click();
check('Kachel waehlt das Tier aus', auswahl() === tiereHinter(3), auswahl());
check('Ausgewaehlte Kachel ist markiert', tileOf(3).classList.contains('on'));
check('Nur eine Kachel ist markiert', markedTiles() === 1, markedTiles() + ' markiert');
pickBtn(3).click();
check('Zweiter Tipp hebt die Auswahl auf', auswahl() === '', auswahl());
check('Markierung ist wieder weg', !tileOf(3).classList.contains('on'));

// Die Auswahl kann auch auf der Karte entstehen - dann kommt sie von aussen
// und ist eine *Tiernummer*, keine Kachelnummer. Von dort kommt immer genau
// ein Tier, deshalb nimmt setSelection auch eine blanke Nummer an.
panel.setSelection(sim.signalOrder[12]);
check('Auswahl von der Karte markiert die richtige Kachel',
  tileOf(12).classList.contains('on') && markedTiles() === 1);
panel.setSelection(-1);
check('-1 von der Karte heisst: nichts ausgewaehlt', markedTiles() === 0);

console.log('\nAuge je Kachel:');
visibility = [];
eyeBtn(5).click();
check('Auge meldet das Ausblenden des Tieres',
  visibility.length === 1 && visibility[0][0].join(',') === String(sim.signalOrder[5]) &&
  visibility[0][1] === true, JSON.stringify(visibility));
check('Ausgeblendete Kachel ist gekennzeichnet', tileOf(5).classList.contains('off'));
check('Eine Kachel weniger ist sichtbar', visibleTiles() === 44, String(visibleTiles()));
visibility = [];
eyeBtn(5).click();
check('Zweiter Tipp blendet wieder ein',
  visibility.length === 1 && visibility[0][1] === false && !tileOf(5).classList.contains('off'));

// Eine unsichtbare Auswahl faende niemand - also holt der Tipp das Tier zurueck.
eyeBtn(7).click();
visibility = [];
pickBtn(7).click();
check('Tipp auf eine ausgeblendete Kachel blendet sie ein',
  visibility.length === 1 && visibility[0][1] === false && !tileOf(7).classList.contains('off'));
check('… und waehlt das Tier aus', auswahl() === tiereHinter(7), auswahl());
pickBtn(7).click();

console.log('\nAuge fuer alle:');
visibility = [];
allBtn.click();
check('Alle-Knopf blendet alle aus',
  visibility.length === 1 && visibility[0][0] === null && visibility[0][1] === true,
  JSON.stringify(visibility));
check('Keine Kachel bleibt sichtbar', allTiles().every((t) => t.classList.contains('off')));
check('Keine ist mehr sichtbar', visibleTiles() === 0, String(visibleTiles()));
check('Der Knopf zeigt den durchgestrichenen Zustand', allBtn.classList.contains('off'));
visibility = [];
allBtn.click();
check('Erst wenn alles weg ist, holt der Knopf alles zurueck',
  visibility[0][1] === false && visibleTiles() === 45);
check('Keine Kachel bleibt ausgeblendet', allTiles().every((t) => !t.classList.contains('off')));

// Teils ausgeblendet: der Knopf raeumt auf, statt umzuschalten.
eyeBtn(1).click();
visibility = [];
allBtn.click();
check('Bei gemischtem Zustand blendet der Knopf alle aus',
  visibility[0][1] === true && visibleTiles() === 0, String(visibleTiles()));
allBtn.click();

// ------------------------------------------------------------- Ziehen

/**
 * Ein Ziehvorgang, wie ihn der Finger ausloest: aufsetzen, ueber die Schwelle
 * bewegen, ueber dem Ziel loslassen. Die Handler haengen delegiert am Rahmen
 * der Liste - genau dorthin gehen die Events, das Ziel steht im target.
 */
function fire(type, target, x, y, extra) {
  const event = Object.assign({
    type: type, target: target, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y
  }, extra || {});
  (grid.handlers[type] || []).forEach((fn) => fn(event));
}

/**
 * Ein Tipp, wie ihn der Browser liefert: erst die Pointer-Events, dann der
 * Klick. Nur .click() zu rufen waere schoener, aber unehrlich - genau an
 * dieser Reihenfolge haengt die Sperre, die den Klick nach einem Ziehen
 * verschluckt.
 */
function tap(el) {
  fire('pointerdown', el, 0, 0);
  fire('pointerup', el, 0, 0);
  el.click();
}

function dragOnto(sourceEl, targetEl, distance) {
  documentMock._hit = targetEl;
  fire('pointerdown', sourceEl, 0, 0);
  fire('pointermove', sourceEl, distance === undefined ? 40 : distance, 0);
  fire('pointerup', sourceEl, distance === undefined ? 40 : distance, 0);
  documentMock._hit = null;
}

const groupOf = (signal) => panel.clusters().groupOf(signal);
const boxFor = (signal) => {
  const id = groupOf(signal);
  return clusterBoxes().find((b) => b.getAttribute('data-group') === String(id));
};
const headOf = (signal) => boxFor(signal).children[0];

console.log('\nZiehen und Gruppieren:');
panel.setSimulation(fakeSim(45));

// Punkt 4: zwei Kacheln ineinander ergeben ein Cluster.
dragOnto(pickBtn(2), tileOf(6));
check('Zwei Kacheln ineinander ergeben ein Cluster',
  clusterBoxes().length === 1 && groupOf(2) >= 0 && groupOf(2) === groupOf(6));
check('Das Cluster steht als eigener Kasten in der Liste',
  boxFor(2).children.length === 2 && boxFor(2).children[1].children.length === 2);
check('Der Rest bleibt im freien Bereich', looseZone().children.length === 43);
check('Beide Mitglieder tragen dieselbe Farbe',
  pickBtn(2).style.background === pickBtn(6).style.background);
check('… und die Karte erfaehrt davon',
  colors[sim.signalOrder[2]] === colors[sim.signalOrder[6]]);
check('Der Kopf des Clusters zaehlt seine Mitglieder',
  headOf(2).children[0].textContent === '2 Signale', headOf(2).children[0].textContent);

// Punkt 5: mehr Tiere hinein, und Cluster ineinander.
const farbeVorher = pickBtn(2).style.background;
dragOnto(pickBtn(9), boxFor(2));
check('Eine weitere Kachel laesst sich hineinziehen',
  groupOf(9) === groupOf(2) && looseZone().children.length === 42);
check('Das Cluster behaelt dabei seine Farbe',
  pickBtn(9).style.background === farbeVorher);

dragOnto(pickBtn(20), tileOf(21));
check('Ein zweites Cluster entsteht daneben', clusterBoxes().length === 2);
dragOnto(headOf(20), boxFor(2));
check('Cluster in Cluster ziehen fuegt sie zusammen',
  clusterBoxes().length === 1 && groupOf(20) === groupOf(2) &&
  boxFor(2).children[1].children.length === 5);
check('Alle fuenf tragen jetzt eine Farbe',
  [2, 6, 9, 20, 21].every((s) => pickBtn(s).style.background === farbeVorher));

// Punkt 6: wieder heraus.
dragOnto(pickBtn(9), looseZone());
check('Eine Kachel laesst sich aus dem Cluster ziehen',
  groupOf(9) === -1 && boxFor(2).children[1].children.length === 4);
check('… und traegt wieder ihre eigene Farbe',
  pickBtn(9).style.background !== farbeVorher);
check('… und steht wieder sortiert im freien Bereich',
  looseZone().children.some((t) => t.getAttribute('data-signal') === '9'));

dragOnto(headOf(2), looseZone());
check('Ein ganzes Cluster laesst sich aufloesen',
  clusterBoxes().length === 0 && looseZone().children.length === 45);
check('Danach hat jedes Tier wieder seine eigene Farbe',
  new Set(colors).size === 45);

console.log('\nZiehen - Grenzfaelle:');
// Punkt 7 setzt voraus, dass nur markiert wird, was auch etwas bewirkt.
dragOnto(pickBtn(4), tileOf(4));
check('Auf sich selbst gezogen entsteht kein Cluster', clusterBoxes().length === 0);

// Unterhalb der Schwelle ist es ein Tipp, kein Ziehen - sonst waere die
// Auswahl per Kachel nicht mehr zu treffen.
nichtsAusgewaehlt();
documentMock._hit = tileOf(8);
fire('pointerdown', pickBtn(4), 0, 0);
fire('pointermove', pickBtn(4), 2, 1);
fire('pointerup', pickBtn(4), 2, 1);
pickBtn(4).click();
check('Ein Wackeln unter der Schwelle bleibt ein Tipp',
  clusterBoxes().length === 0 && auswahl() === tiereHinter(4), auswahl());
pickBtn(4).click();

// Nach einem echten Ziehen darf der nachfolgende Klick die Auswahl nicht mehr
// umschalten - stehen bleibt, was das Ziehen ergeben hat.
nichtsAusgewaehlt();
documentMock._hit = tileOf(8);
fire('pointerdown', pickBtn(4), 0, 0);
fire('pointermove', pickBtn(4), 40, 0);
fire('pointerup', pickBtn(4), 40, 0);
const nachDemZiehen = auswahl();
pickBtn(4).click();
check('Nach dem Ziehen aendert der Klick die Auswahl nicht',
  groupOf(4) >= 0 && auswahl() === nachDemZiehen && auswahl() === tiereHinter(4, 8),
  auswahl());

// Mit dem Finger gehoert die senkrechte Bewegung dem Scrollen der Liste -
// solange der Finger gleich losgewandert ist.
panel.setSimulation(fakeSim(45));
documentMock._hit = tileOf(12);
fire('pointerdown', pickBtn(11), 0, 0, { pointerType: 'touch' });
fire('pointermove', pickBtn(11), 2, 60, { pointerType: 'touch' });
fire('pointerup', pickBtn(11), 2, 60, { pointerType: 'touch' });
check('Senkrecht wischen scrollt und gruppiert nicht',
  clusterBoxes().length === 0, clusterBoxes().length + ' Cluster');
check('… und laesst keine Uhr laufen', pendingHolds.size === 0, pendingHolds.size + ' offen');
documentMock._hit = tileOf(12);
fire('pointerdown', pickBtn(11), 0, 0, { pointerType: 'touch' });
fire('pointermove', pickBtn(11), 40, 6, { pointerType: 'touch' });
fire('pointerup', pickBtn(11), 40, 6, { pointerType: 'touch' });
check('Waagerecht ziehen gruppiert', clusterBoxes().length === 1);

/*
 * Und der Weg, ohne den die Aufgabe mit dem Finger nicht zu machen ist: die
 * Cluster stehen OBEN, die freien Kacheln darunter - das Ziehen geht also
 * fast immer nach oben, und senkrecht gehoert dem Blaettern. Wer vorher
 * stillhaelt, hat kein Blaettern gemeint; danach zaehlt jede Richtung.
 */
panel.setSimulation(fakeSim(45));
documentMock._hit = tileOf(31);
fire('pointerdown', pickBtn(30), 0, 0, { pointerType: 'touch' });
check('Aufsetzen stellt die Uhr', pendingHolds.size === 1);
runHolds();
fire('pointermove', pickBtn(30), 1, -70, { pointerType: 'touch' });
fire('pointerup', pickBtn(30), 1, -70, { pointerType: 'touch' });
check('Nach dem Stillhalten zieht auch die senkrechte Bewegung',
  clusterBoxes().length === 1 && groupOf(30) === groupOf(31),
  clusterBoxes().length + ' Cluster');

// Abbruch: der Browser nimmt die Geste zurueck (Anruf, Systemgeste).
panel.setSimulation(fakeSim(45));
documentMock._hit = tileOf(30);
fire('pointerdown', pickBtn(29), 0, 0);
fire('pointermove', pickBtn(29), 40, 0);
fire('pointercancel', pickBtn(29), 40, 0);
check('Ein abgebrochenes Ziehen aendert nichts', clusterBoxes().length === 0);
check('… und laesst keinen Schwebekasten zurueck', documentMock.body.children.length === 0);
check('… und keinen laufenden Rolltimer', liveTimers === 0, liveTimers + ' offen');
check('… und kein offenes Bild', pendingFrames.size === 0, pendingFrames.size + ' offen');

/*
 * Die Uhr steht, solange der Finger unten ist. Ein Bild der Karte zeichnet die
 * Spuren aller Tiere; laeuft sie waehrend der Geste weiter, kaempfen Ziehen
 * und Zeichnen um denselben Hauptthread und das Ziehen verliert. Gemeldet wird
 * nur das *echte* Ziehen - ein Tipp haelt nichts an.
 */
console.log('\nZiehen haelt die Uhr an:');
panel.setSimulation(fakeSim(45));
dragEvents = [];
tap(pickBtn(5));
check('Ein Tipp haelt die Uhr nicht an', dragEvents.length === 0, JSON.stringify(dragEvents));

dragEvents = [];
dragOnto(pickBtn(5), tileOf(6));
check('Ein Ziehen haelt sie an und laesst sie wieder laufen',
  dragEvents.join(',') === 'true,false', JSON.stringify(dragEvents));

// Auch ein abgebrochenes Ziehen muss die Uhr wieder freigeben - sonst steht
// sie nach einem Anruf mitten in der Geste fuer immer.
dragEvents = [];
documentMock._hit = tileOf(20);
fire('pointerdown', pickBtn(19), 0, 0);
fire('pointermove', pickBtn(19), 40, 0);
fire('pointercancel', pickBtn(19), 40, 0);
documentMock._hit = null;
check('Ein abgebrochenes Ziehen gibt sie ebenfalls frei',
  dragEvents.join(',') === 'true,false', JSON.stringify(dragEvents));

/*
 * Und die Arbeit je Fingerbewegung wird gebuendelt: ein Tablet meldet
 * Bewegungen schneller, als der Browser Bilder baut, und die Suche nach dem
 * Ziel unter dem Finger (elementFromPoint) zwingt ihn jedes Mal, das Layout
 * der ganzen Liste neu zu rechnen.
 */
panel.setSimulation(fakeSim(45));
documentMock._hit = tileOf(9);
fire('pointerdown', pickBtn(8), 0, 0);
fire('pointermove', pickBtn(8), 40, 0);
const nachErstemZug = framesRun;
for (let i = 0; i < 20; i++) fire('pointermove', pickBtn(8), 41 + i, 0);
check('Zwanzig Fingerbewegungen ergeben ein Bild, nicht zwanzig',
  pendingFrames.size === 1, pendingFrames.size + ' Bilder angefordert');
flushFrames();
check('… und das Bild arbeitet einmal', framesRun === nachErstemZug + 1);
fire('pointerup', pickBtn(8), 60, 0);
documentMock._hit = null;
check('… und trifft trotzdem das Ziel unter dem Finger', groupOf(8) >= 0 && groupOf(8) === groupOf(9));

console.log('\nAuge am Cluster:');
panel.setSimulation(fakeSim(45));
dragOnto(pickBtn(1), tileOf(2));
dragOnto(pickBtn(3), boxFor(1));
visibility = [];
tap(headOf(1).children[1]);
check('Das Auge blendet alle Mitglieder auf einmal aus',
  visibility.length === 1 && visibility[0][1] === true &&
  visibility[0][0].length === 3, JSON.stringify(visibility));
check('… und meldet Tiernummern, keine Kachelnummern',
  visibility[0][0].sort((a, b) => a - b).join(',') ===
  [1, 2, 3].map((s) => sim.signalOrder[s]).sort((a, b) => a - b).join(','));
check('Drei Kacheln weniger sind sichtbar', visibleTiles() === 42, String(visibleTiles()));
check('Der Kasten zeigt sich als ausgeblendet', boxFor(1).classList.contains('off'));
visibility = [];
tap(headOf(1).children[1]);
check('Erst wenn alle weg sind, holt das Auge alle zurueck',
  visibility[0][1] === false && visibleTiles() === 45);

// Ein einzelnes Mitglied bleibt einzeln bedienbar.
tap(eyeBtn(2));
check('Ein einzelnes Mitglied laesst sich weiter allein ausblenden',
  visibleTiles() === 44 && !boxFor(1).classList.contains('off'),
  String(visibleTiles()));

/*
 * Die Auswahl folgt dem Gruppieren. Sie ist der Blick auf die Karte: dort
 * traegt das Ausgewaehlte eine kraeftige Spur und einen Ring. Wer Tiere
 * zusammenlegt, will genau die sehen - und zwar ohne sie danach noch einmal
 * einzeln antippen zu muessen.
 */
console.log('\nAuswahl beim Gruppieren:');
panel.setSimulation(fakeSim(45));

nichtsAusgewaehlt();
documentMock._hit = null;
fire('pointerdown', pickBtn(14), 0, 0);
fire('pointermove', pickBtn(14), 40, 0);
check('Was angefasst wird, ist ausgewaehlt', auswahl() === tiereHinter(14), auswahl());
fire('pointerup', pickBtn(14), 40, 0);
check('… und bleibt es, wenn darunter kein Ziel lag',
  auswahl() === tiereHinter(14) && clusterBoxes().length === 0, auswahl());

dragOnto(pickBtn(14), tileOf(15));
check('Nach dem Zusammenfuegen ist das ganze neue Cluster ausgewaehlt',
  auswahl() === tiereHinter(14, 15), auswahl());
check('… und der Kasten traegt den Ring', boxFor(14).classList.contains('on'));

dragOnto(pickBtn(16), boxFor(14));
check('Ein hineingezogenes Signal waehlt das gewachsene Cluster aus',
  auswahl() === tiereHinter(14, 15, 16), auswahl());

dragOnto(pickBtn(16), looseZone());
check('Herausgezogen ist nur das Herausgezogene ausgewaehlt',
  auswahl() === tiereHinter(16), auswahl());
check('… und der Kasten traegt keinen Ring mehr', !boxFor(14).classList.contains('on'));

// Der Kopf ist Griff und Schalter zugleich.
nichtsAusgewaehlt();
tap(headOf(14));
check('Ein Tipp auf den Clusterkopf waehlt alle Mitglieder aus',
  auswahl() === tiereHinter(14, 15), auswahl());
check('… und markiert jede Kachel darin',
  markedTiles() === 2 && [14, 15].every((s) => tileOf(s).classList.contains('on')));
tap(headOf(14));
check('Zweiter Tipp auf den Kopf hebt die Auswahl auf',
  auswahl() === '' && markedTiles() === 0, auswahl());

// Ein Mitglied engt ein, statt die ganze Gruppe vom Bild zu raeumen - sonst
// waere der Blick auf ein einzelnes Tier ein Weg ohne Rueckkehr.
tap(headOf(14));
pickBtn(15).click();
check('Ein Mitglied antippen engt die Auswahl darauf ein',
  auswahl() === tiereHinter(15), auswahl());
check('… und der Kasten verliert seinen Ring', !boxFor(14).classList.contains('on'));

// Das Auge sitzt im Kopf, waehlt aber nichts aus: sonst haengte an jedem
// Ausblenden auch noch ein Wechsel des Blicks.
nichtsAusgewaehlt();
visibility = [];
tap(headOf(14).children[1]);
check('Das Auge im Clusterkopf waehlt nichts aus',
  auswahl() === '' && visibility.length === 1 && visibility[0][1] === true,
  auswahl() + ' / ' + JSON.stringify(visibility));
tap(headOf(14).children[1]);

/*
 * Der Weg zurueck.
 *
 * Geprueft wird nicht der Knopf, sondern die Regel dahinter: aufgehoben wird
 * der ganze Stand vor jedem Zug, und zwar nur dann, wenn wirklich etwas
 * passiert ist. Der Fall, der sonst durchginge, ist das Zusammenziehen zweier
 * Cluster - danach ist von Hand nicht mehr zu rekonstruieren, welche Kachel in
 * welchem lag, und genau dafuer gibt es diesen Weg.
 */
console.log('\nRueckgaengig:');
{
  const welt = fakeSim(20);
  panel.setSimulation(welt);
  const stand = () => JSON.stringify(panel.groups());

  check('Am Anfang gibt es nichts zurueckzunehmen',
    panel.canUndo() === false && undoBtn.disabled === true);
  check('… und der Knopf sagt das auch', /Nichts/.test(undoBtn.title), undoBtn.title);

  const leer = stand();
  dragOnto(pickBtn(2), tileOf(6));
  check('Ein Zug legt einen Schritt an',
    panel.canUndo() === true && undoBtn.disabled === false);

  check('Der Schritt zurueck meldet sich', panel.undo() === true);
  check('… und die Gruppierung steht wieder auf Anfang', stand() === leer, stand());
  check('… die Kacheln stehen wieder im freien Bereich',
    looseZone().children.length === 20 && clusterBoxes().length === 0);
  check('… und mehr gibt es nicht zurueckzunehmen',
    panel.canUndo() === false && panel.undo() === false);

  // Der Kern: zwei gewachsene Cluster ineinander. Herausziehen brauchte
  // danach die Kenntnis, welche Kachel woher kam - die ist weg.
  dragOnto(pickBtn(2), tileOf(6));
  dragOnto(pickBtn(3), tileOf(2));
  dragOnto(pickBtn(8), tileOf(9));
  const zwei = stand();
  dragOnto(headOf(2), boxFor(8));
  check('Cluster in Cluster ziehen fuegt zusammen',
    clusterBoxes().length === 1 && groupOf(2) === groupOf(8));
  panel.undo();
  check('Ein Schritt zurueck trennt sie wieder', stand() === zwei, stand());
  check('… mit denselben Mitgliedern in denselben Kaesten',
    clusterBoxes().length === 2 && groupOf(2) === groupOf(3) &&
    groupOf(2) === groupOf(6) && groupOf(8) === groupOf(9) && groupOf(2) !== groupOf(8));

  // Die Farbe gehoert zum Stand: sie ist beim Zusammenfuegen die des Ziels und
  // aus den Mitgliedern allein nicht zurueckzurechnen.
  check('… und in ihren Farben',
    colors[welt.signalOrder[2]] === panel.clusters().colorOf(2) &&
    panel.clusters().colorOf(2) !== panel.clusters().colorOf(8),
    panel.clusters().colorOf(2) + ' / ' + panel.clusters().colorOf(8));

  // Aufloesen ist auch ein Zug.
  dragOnto(headOf(2), looseZone());
  check('Ein aufgeloestes Cluster ist weg', groupOf(2) === -1);
  panel.undo();
  check('… und kommt zurueck', groupOf(2) === groupOf(3) && groupOf(2) === groupOf(6));

  // Was von aussen kommt, ist nicht der eigene letzte Zug.
  panel.applyGroups([{ m: [1, 4], c: '#123456' }]);
  check('Eine aufgelegte Gruppierung raeumt den Weg zurueck',
    panel.canUndo() === false && undoBtn.disabled === true);

  /*
   * Ein Ablegen, das nichts bewirkt, darf keinen Schritt anlegen: der erste
   * Druck auf den Knopf taete sonst nichts Sichtbares, und das sieht aus wie
   * ein kaputter Knopf. Geprueft auf leerem Weg, damit ein faelschlich
   * angelegter Schritt nicht hinter einem echten verschwindet.
   */
  dragOnto(pickBtn(1), tileOf(4));       // 1 und 4 liegen schon zusammen
  check('Ein wirkungsloses Ablegen legt keinen Schritt an',
    panel.canUndo() === false && stand() === JSON.stringify([{ m: [1, 4], c: '#123456' }]),
    stand());

  // Zurueckgenommen wird bis zum Anfang, nicht nur einen Schritt.
  dragOnto(pickBtn(10), tileOf(11));
  dragOnto(pickBtn(12), tileOf(10));
  dragOnto(pickBtn(13), tileOf(10));
  const nachDrei = stand();
  panel.undo(); panel.undo(); panel.undo();
  check('Drei Zuege lassen sich einzeln zuruecknehmen',
    panel.groups().length === 1 && panel.groups()[0].m.join('-') === '1-4', stand());
  check('… und danach ist der Knopf wieder gesperrt', undoBtn.disabled === true);
  check('… (Gegenprobe: die drei Zuege waren wirklich drei)',
    nachDrei !== stand());

  // Der Weg zurueck gehoert der Welt, in der er gegangen wurde: hinter der
  // "17" steckt in der naechsten ein anderes Tier.
  dragOnto(pickBtn(5), tileOf(7));
  panel.setSimulation(fakeSim(20));
  check('Eine neue Welt raeumt den Weg zurueck', panel.canUndo() === false);

  /*
   * Und der Bruch bei Tag 5 raeumt ihn auch. Der Nachzuegler-Haufen ist nicht
   * die Arbeit der Klasse, und er ist nicht wiederherstellbar
   * (zusammengeschoben wird genau einmal je Welt) - ein Schritt zurueck ueber
   * ihn hinweg loeste eine Gruppe auf, die niemand zurueckholen kann.
   */
  const spaet = fakeSim(20);
  spaet.baseCount = 16;
  spaet.newcomers = spaet.signalOrder.slice(16);
  panel.setSimulation(spaet);
  panel.setPhase(0);
  dragOnto(pickBtn(1), tileOf(2));
  check('Vor dem Bruch laesst sich der Zug zuruecknehmen', panel.canUndo() === true);
  panel.setPhase(1);
  check('Über den Bruch hinweg gibt es kein Zurück',
    panel.canUndo() === false && undoBtn.disabled === true);
  check('… und die Nachzügler stehen trotzdem zusammen',
    panel.clusters().groupOf(16) >= 0 && panel.clusters().groupOf(16) === panel.clusters().groupOf(19));
  nichtsAusgewaehlt();
}

/*
 * Der Bruch bei Tag 5. Fuenf Tiere kommen dazu, und sie kommen als *ein*
 * Cluster an, in einer Farbe, die keine Kachel haben kann.
 *
 * Zwei Dinge sind daran nicht offensichtlich und deshalb hier geprueft:
 * vor dem Bruch darf das Cluster nicht schon als leerer Kasten in der Liste
 * stehen (das kuendigte die Neuen an, bevor es sie gibt), und nach dem
 * Aufloesen darf ein zweites Umschalten sie nicht wieder zusammenschieben -
 * was die Klasse mit ihnen macht, ist ihre Entscheidung.
 */
console.log('\nNachzügler am Bruch:');
{
  const GESAMT = 45;
  const START = 40;
  const spaet = fakeSim(GESAMT);
  spaet.baseCount = START;
  // Wie in der Simulation: die Nachzuegler haengen hinten in der Mischung,
  // hereingereicht werden aber Tiernummern.
  spaet.newcomers = spaet.signalOrder.slice(START);
  const neuenKacheln = [40, 41, 42, 43, 44];
  const tiereDahinter = (signals) =>
    signals.map((s) => spaet.signalOrder[s]).sort(aufsteigend).join(',');

  panel.setSimulation(spaet);
  panel.setPhase(0);
  check('Phase 1 zeigt nur den Startbestand', allTiles().length === START,
    allTiles().length + ' Kacheln');
  check('… und keinen Kasten, der die Neuen ankündigt', clusterBoxes().length === 0);

  nichtsAusgewaehlt();
  panel.setPhase(1);
  check('Phase 2 zeigt alle Signale', allTiles().length === GESAMT, String(allTiles().length));
  check('Die Nachzügler stehen zusammen in einem Cluster',
    clusterBoxes().length === 1 &&
    neuenKacheln.every((s) => groupOf(s) === groupOf(40) && groupOf(s) >= 0));
  check('… und niemand sonst steckt darin',
    boxFor(40).children[1].children.length === 5 &&
    looseZone().children.length === START);
  check('… in einer Farbe, die keine Kachel haben kann',
    neuenKacheln.every((s) => pickBtn(s).style.background === WL.PALETTE.signals.newcomer) &&
    colors.indexOf(WL.PALETTE.signals.newcomer) >= 0,
    pickBtn(40).style.background);
  check('… und die Karte zeigt genau sie hervorgehoben',
    auswahl() === tiereDahinter(neuenKacheln), auswahl());
  check('… der Kasten trägt den Ring', boxFor(40).classList.contains('on'));

  // Die Arbeit aus Phase 1 muss den Bruch ueberleben: dass ueberhaupt ein
  // Cluster dazukommt, darf die vorhandenen nicht anfassen.
  dragOnto(pickBtn(3), tileOf(4));
  check('Ein selbst gebildetes Cluster bleibt daneben bestehen',
    clusterBoxes().length === 2 && groupOf(3) === groupOf(4) && groupOf(3) !== groupOf(40));

  // Aufgeloest bleibt aufgeloest.
  dragOnto(headOf(40), looseZone());
  check('Das Nachzügler-Cluster lässt sich auflösen', groupOf(40) === -1);
  check('… und jedes bekommt seine eigene Farbe zurück',
    neuenKacheln.every((s) => pickBtn(s).style.background !== WL.PALETTE.signals.newcomer));
  panel.setPhase(0);
  panel.setPhase(1);
  check('… und ein zweites Umschalten schiebt sie nicht wieder zusammen',
    groupOf(40) === -1 && clusterBoxes().length === 1);
}

console.log('\nNeue Welt:');
panel.setSimulation(fakeSim(7));
check('Die Liste wird neu gebaut', allTiles().length === 7 && label(0) === '01');
check('Nichts bleibt ausgeblendet', visibleTiles() === 7, String(visibleTiles()));
check('Nichts bleibt ausgewaehlt', allTiles().every((t) => !t.classList.contains('on')));
check('Keine Gruppierung bleibt stehen', clusterBoxes().length === 0);
panel.setSimulation(null);
check('Ohne Simulation bleibt die Liste leer', allTiles().length === 0);
check('… und der Alle-Knopf ist gesperrt', allBtn.disabled === true);

// ------------------------------------------------------------ Abspieler

/*
 * Die Landung am Ende der Aufzeichnung. Fuenf Tage Spur liegen dann
 * vollstaendig auf der Karte - das Bild, mit dem gearbeitet wird -, und genau
 * deshalb faengt der Abspieler nicht von vorn an, sondern haelt an.
 *
 * Gefahren wird mit echten Bildern: ein Bild ist ein Aufruf des gesammelten
 * rAF-Rueckrufs mit einem Zeitstempel. Anders ist "haelt er wirklich an oder
 * fordert er nur weiter Bilder an" nicht zu unterscheiden.
 */
console.log('\nAbspieler am Ende der Aufzeichnung:');
{
  const btn = El('button');
  const slider = El('input');
  const zeiten = [];
  const player = WL.Player.create(
    { playBtn: btn, slider: slider, label: El('span'), phase: El('span'), speedBtns: [] },
    { onFrame: (t) => zeiten.push(t) }
  );

  const DAUER = 1500;
  let uhr = 0;
  // Ein Bild alle 100 ms, bis niemand mehr eines anfordert.
  const spiele = (bilder) => {
    for (let i = 0; i < bilder && pendingFrames.size; i++) {
      uhr += 100;
      const faellig = [...pendingFrames.values()];
      pendingFrames.clear();
      faellig.forEach((fn) => fn(uhr));
    }
  };

  player.setDuration(DAUER);
  player.seek(DAUER - 3);
  player.play();
  spiele(200);

  check('Der Abspieler haelt am Ende an', player.isPlaying() === false);
  check('… genau auf der letzten Stuetzstelle', player.time() === DAUER, String(player.time()));
  check('… und faengt nicht von vorn an', Math.min(...zeiten.slice(1)) > DAUER - 4,
    String(Math.min(...zeiten.slice(1))));
  check('… fordert kein Bild mehr an', pendingFrames.size === 0);
  check('… und der Knopf zeigt wieder Abspielen', btn.textContent === '▶');

  // Sonst waere der Knopf am Ende tot: dort gibt es nichts mehr abzuspielen.
  player.play();
  check('Abspielen am Ende faengt von vorn an',
    player.isPlaying() === true && player.time() === 0, String(player.time()));
  player.pause();

  // Zwischendrin darf nichts anhalten - das Ende ist die einzige Stelle.
  zeiten.length = 0;
  player.seek(600);
  player.play();
  spiele(5);
  check('Mitten in der Aufzeichnung laeuft er weiter',
    player.isPlaying() === true && player.time() > 600 && player.time() < DAUER);
  player.pause();
}

// -------------------------------------------------- Der Weg in die 2. Phase

/*
 * Der Abspieler laeuft ueber eine Phase, nicht ueber die ganze Aufzeichnung,
 * und am Ende von Tag 5 erscheint der Knopf in die zweite.
 *
 * Die Sichtbarkeitsregel ist die eigentliche Falle und deshalb der Grund fuer
 * diesen Abschnitt: sie darf *nicht* an isPlaying() haengen. Der Abspieler
 * meldet beim Anhalten den letzten Augenblick, bevor er stehenbleibt - playing
 * steht dort noch auf true -, und danach meldet er gar nichts mehr. Wer auf
 * "steht und ist am Ende" prueft, bekommt den Knopf nie zu sehen. Geprueft
 * wird deshalb nur die Zeit; nachgebildet ist hier genau die Bedingung aus
 * updateAdvanceBtn in js/ui/app.js.
 */
console.log('\nDer Weg in die zweite Phase:');
{
  const btn = El('button');
  const slider = El('input');
  const player = WL.Player.create(
    { playBtn: btn, slider: slider, label: El('span'), phase: El('span'), speedBtns: [] },
    { onFrame: () => { sichtbar = zeigeKnopf(); } }
  );

  const Time = WL.SimTime;
  const p0 = Time.phaseSamples(0);
  const p1 = Time.phaseSamples(1);
  const sek = (n) => n / Time.SAMPLE_HZ;
  let phase = 0;
  let sichtbar = false;
  const zeigeKnopf = () =>
    phase < Time.PHASE_COUNT - 1 && player.time() >= player.rangeEnd() - 0.5;

  let uhr = 0;
  const spiele = (bilder) => {
    for (let i = 0; i < bilder && pendingFrames.size; i++) {
      uhr += 100;
      const faellig = [...pendingFrames.values()];
      pendingFrames.clear();
      faellig.forEach((fn) => fn(uhr));
    }
  };

  player.setRange(sek(p0.from), sek(p0.to));
  check('Phase 1 beginnt bei 0', player.time() === 0 && player.rangeStart() === 0);
  check('… und endet vor dem Bruch, nicht danach',
    player.rangeEnd() === sek(p0.to) && player.rangeEnd() < Time.BREAK_SECONDS,
    player.rangeEnd() + ' s, Bruch bei ' + Time.BREAK_SECONDS + ' s');
  check('Am Anfang steht kein Knopf da', zeigeKnopf() === false);

  player.seek(player.rangeEnd() - 3);
  check('Kurz vor Schluss immer noch nicht', zeigeKnopf() === false);

  player.play();
  spiele(200);
  check('Der Abspieler haelt am Ende von Tag 5 an', player.isPlaying() === false);
  check('… und *dort* erscheint der Knopf', sichtbar === true);
  check('… obwohl playing im letzten gemeldeten Bild noch true war',
    zeigeKnopf() === true);

  // Der zweite Weg ans Ende: mit dem Finger auf der Zeitleiste.
  player.seek(0);
  check('Zurueckgezogen verschwindet er wieder', zeigeKnopf() === false);
  player.seek(player.rangeEnd());
  check('Ans Ende gezogen ist er auch da', zeigeKnopf() === true);

  // Umschalten, wie setPhase in app.js es tut.
  phase = 1;
  player.setRange(sek(p1.from), sek(p1.to));
  check('Phase 2 beginnt am Bruch', player.time() === Time.BREAK_SECONDS,
    player.time() + ' s');
  check('… und laeuft bis zum Ende der Aufzeichnung',
    player.rangeEnd() === Time.DAY_SECONDS * Time.DAYS);
  check('… der Knopf ist weg', zeigeKnopf() === false);

  player.seek(player.rangeEnd());
  check('… und kommt am Ende von Tag 10 nicht wieder', zeigeKnopf() === false);

  // Die Zeitleiste zeigt in Phase 2 nur noch Tag 6-10.
  check('Die Zeitleiste beginnt in Phase 2 beim Bruch',
    Number(slider.min) === Time.BREAK_SECONDS, slider.min);
  player.seek(Time.BREAK_SECONDS - 600);
  check('… und laesst sich nicht in Phase 1 zurueckziehen',
    player.time() === Time.BREAK_SECONDS, String(player.time()));
}

/*
 * Die Gruppierung mitnehmen und zurueckgeben.
 *
 * Das ist die Tuer, durch die im Raum (MPSkills) der Weltwechsel geht: wer
 * von Welt I nach II und zurueck geht, soll seine Gruppen wiederfinden -
 * mitsamt ihren Farben, denn ein Haufen, der beim Wiederherstellen die Farbe
 * wechselt, ist fuer den, der ihn gebaut hat, ein anderer Haufen.
 *
 * Geprueft wird hier bewusst OHNE Ziehen: das Ziehen hat seine eigenen
 * Pruefungen weiter oben, und was hier schiefgehen kann, liegt im Uebergang
 * zwischen Modell und Liste.
 */
console.log('\nDie Gruppierung mitnehmen und zurueckgeben:');
{
  panel.setSimulation(sim);
  const vorher = clusterReports.length;

  panel.applyGroups([{ m: [3, 5, 7], c: '#123456' }, { m: [1, 2], c: '#abcdef' }]);
  const g = panel.groups();
  check('Zwei Gruppen aufgelegt', g.length === 2, g.length + ' Gruppen');
  check('… mit ihren Mitgliedern',
    g.map((x) => x.m.join('-')).sort().join('|') === '1-2|3-5-7',
    g.map((x) => x.m.join('-')).join(' | '));
  check('… und in ihren Farben',
    g.map((x) => x.c).sort().join(',') === '#123456,#abcdef');
  check('Die Kaesten stehen auch in der Liste', clusterBoxes().length === 2,
    clusterBoxes().length + ' Kaesten');
  check('Die Farbe erreicht die Karte', colors[sim.signalOrder[3]] === '#123456',
    String(colors[sim.signalOrder[3]]));
  check('Aufgelegt meldet sich nach aussen', clusterReports.length > vorher);

  const zurueck = JSON.stringify(panel.groups());
  panel.applyGroups(panel.groups());
  check('Herausgeben und wieder hineingeben aendert nichts',
    JSON.stringify(panel.groups()) === zurueck);

  panel.applyGroups([{ m: [9, 11], c: '#00ff00' }]);
  check('Auflegen ersetzt und ergaenzt nicht',
    panel.groups().length === 1 && panel.groups()[0].m.join('-') === '9-11');
  check('… und die alten Mitglieder stehen wieder allein',
    panel.clusters().groupOf(3) < 0 && panel.clusters().groupOf(5) < 0);

  panel.applyGroups([{ m: [4], c: '#ff0000' }]);
  check('Ein einzelnes Signal ist auch von aussen keine Gruppe',
    panel.groups().length === 0);

  panel.applyGroups([]);
  check('Eine leere Gruppierung raeumt die Liste',
    panel.groups().length === 0 && clusterBoxes().length === 0);
}

console.log('\n' + (failures === 0 ? 'ALLE UI-PRUEFUNGEN BESTANDEN' : failures + ' FEHLGESCHLAGEN'));
process.exit(failures ? 1 : 0);
