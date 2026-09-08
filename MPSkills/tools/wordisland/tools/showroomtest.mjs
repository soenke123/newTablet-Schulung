/* Prüfstand für den Wordisland-Karten-Showroom.
   Kein Browser: linkedom baut das Dokument, ein vm-Sandkasten führt
   das eingebettete Skript aus. Geprüft wird, was ohne Pixel prüfbar
   ist — läuft es durch, entstehen fünf Ansichten, steht in keinem
   Pfad ein NaN, und die Insel ist vollständig (jedes Feld gehört
   entweder einem Volk oder liegt unter der Wolke).

   Was er NICHT kann: sagen, ob das Wasser nach Wasser aussieht.
   Dafür gibt es Bildschirmfotos. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const file = process.argv[2];
const html = readFileSync(file, 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];

let ok = true;
const fail = (m) => { ok = false; console.error('  ✗ ' + m); };
const pass = (m) => console.log('  ✓ ' + m);

/* Ein Durchlauf. `search` ist die Adresszeile — damit lässt sich der
   Showroom von hier aus fernsteuern, und das ist der einzige Weg, die
   Nebelarten 1 bis 3 überhaupt auszuführen: sie hängen an ?fog=…, und
   ohne `location` im Sandkasten fällt das Skript still auf die erste
   zurück. Genau darum stand hier lange „läuft durch" für Code, der nie
   gelaufen ist. */
function boot(search) {
  const { window, document } = parseHTML(html);
  const timers = [];
  const sandbox = {
    window, document,
    location: { search },
    URLSearchParams,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    setTimeout: (fn) => { timers.push(fn); return 0; },
    setInterval: () => 0,
    console,
    Math, Date, parseFloat, parseInt, Array, Object, String, Number, Map, Set, JSON, Infinity, NaN
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'showroom.js' });
  timers.forEach(fn => { try { fn(); } catch (e) { fail('Zeitgeber: ' + e.message); } });
  return document;
}

let document;
try {
  document = boot('');
  pass('Skript läuft ohne Ausnahme durch');
} catch (e) {
  fail('Ausnahme: ' + e.message + '\n' + e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}

const secs = document.querySelectorAll('#stage .wv');
secs.length === 5 ? pass('fünf Varianten aufgebaut') : fail('Varianten: ' + secs.length);

const minis = document.querySelectorAll('#grid .sr-mini');
minis.length === 5 ? pass('fünf Vorschaukarten') : fail('Vorschaukarten: ' + minis.length);

document.querySelectorAll('svg.wi-map').forEach((svg, i) => {
  const vb = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
  if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    fail(`Karte ${i}: viewBox „${svg.getAttribute('viewBox')}"`);
  }
});
pass('alle viewBox-Angaben endlich und positiv');

/* Kein NaN/undefined/null in irgendeiner Angabe. `null` steht hier
   ausdrücklich mit drin: filter="null" zeigt auf einen Filter, den es
   nicht gibt, und lässt das Element still verschwinden. */
let bad = 0, geo = 0;
for (const attr of ['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'transform', 'filter', 'fill', 'stroke', 'clip-path', 'opacity']) {
  document.querySelectorAll(`[${attr}]`).forEach(n => {
    const v = n.getAttribute(attr); geo++;
    if (/NaN|undefined|Infinity|^null$/.test(v)) { if (bad++ < 4) fail(`<${n.localName} ${attr}="${String(v).slice(0, 70)}">`); }
  });
}
bad === 0 ? pass(`${geo} Angaben, keine davon kaputt`) : fail(`${bad} kaputte Angaben`);

/* Die Insel selbst. Die Kacheln stecken in einem Sammelpfad je Volk,
   also wird nicht gezählt, wie viele Elemente es gibt, sondern wie
   viele Sechsecke in den Pfaden stehen. Ein „M" ist der Anfang
   eines Sechsecks. */
const view = document.querySelector('#stage .wv:not([hidden])');
const areas = [...view.querySelectorAll('.wi-area')];
areas.length === 6 ? pass('eine Besitzfläche je Volk') : fail('Besitzflächen: ' + areas.length);

const perTeam = areas.map(a => ((a.getAttribute('d') || '').match(/M/g) || []).length);
const hexes = perTeam.reduce((s, n) => s + n, 0);
hexes > 100 ? pass(`${hexes} eroberte Kacheln bei 42 %`) : fail('zu wenige Kacheln: ' + hexes);

const ships = view.querySelectorAll('.wi-ship').length;
ships === 6 ? pass('sechs Schiffe') : fail('Schiffe: ' + ships);

const places = view.querySelectorAll('.wi-place').length;
places >= 9 ? pass(`${places} besondere Orte`) : fail('besondere Orte: ' + places);

const slots = view.querySelectorAll('.wi-slot').length;
slots === places ? pass('jeder Ort hat einen Sprite-Platz') : fail(`Plätze: ${slots} bei ${places} Orten`);

const plates = view.querySelectorAll('.wi-plate').length;
plates === places ? pass('jeder Ort hat einen Sockel') : fail('Sockel: ' + plates);

/* Die Völker-Leiste zählt mit.
   textContent taugt hier nicht: die Zahl und der Zusatz „N Punkte"
   stehen im selben Element, „12" + „1 Punkte" läse sich als 121. */
const nums = [...view.querySelectorAll('.wi-rnum')].map(n => parseInt(n.childNodes[0].nodeValue, 10));
nums.length === 6 ? pass('Leiste hat sechs Zeilen: ' + nums.join(' · ')) : fail('Leiste: ' + nums.length);
nums.every(n => n > 0) ? pass('bei 42 % hat jedes Volk Land') : fail('ein Volk ohne Land: ' + nums.join(' · '));

/* Kreuzprobe: was die Leiste zählt, muss auch auf der Karte liegen.
   Zwei Wege zur selben Zahl — geht einer schief, sieht man es. */
nums.join() === perTeam.join()
  ? pass('Leiste und Karte zählen dasselbe: ' + perTeam.join(' · '))
  : fail(`Leiste ${nums.join(' · ')} ≠ Karte ${perTeam.join(' · ')}`);

/* Bilder: alle Pfade zeigen auf vorhandene Dateien. Die Namen der
   PNG enthalten Leerzeichen und Umlaute und sind deshalb kodiert —
   zum Nachsehen auf der Platte muss man sie wieder dekodieren. */
const base = dirname(file);
const srcs = new Set([...document.querySelectorAll('img')].map(n => n.getAttribute('src')));
[...document.querySelectorAll('image')].forEach(n => srcs.add(n.getAttribute('href')));
let miss = 0;
for (const s of srcs) if (s && !existsSync(join(base, decodeURIComponent(s)))) { miss++; fail('fehlt: ' + s); }
miss === 0 ? pass(`${srcs.size} Bildpfade zeigen auf vorhandene Dateien`) : null;

/* Die Burgen sind von der Karte runter, die Landeplätze tragen jetzt
   eine Fahne. Beides wird geprüft — „raus" ist eine Zusage, die man
   genauso nachhalten muss wie „rein". */
const castles = document.querySelectorAll('image[href*="carstle"]').length;
castles === 0 ? pass('keine Burgen mehr auf der Karte') : fail('Burgen: ' + castles);

const flags = view.querySelectorAll('.wi-flag').length;
flags === 6 ? pass('sechs Landeplatz-Fahnen') : fail('Fahnen: ' + flags);

/* Brandung und hohe See. Nur Anwesenheit — wie es aussieht, sagt
   kein Prüfstand. Beides gibt es jetzt in JEDER Variante. */
const surf = view.querySelectorAll('.wi-surf').length;
surf > 12 ? pass(`${surf} Brandungswellen an der Küste`) : fail('Brandung: ' + surf);

const swellPerView = [...document.querySelectorAll('#stage .wv')]
  .map(s => s.querySelectorAll('.wi-swell').length);
swellPerView.every(n => n > 8)
  ? pass('Wellen auf hoher See in allen fünf Varianten: ' + swellPerView.join(' · '))
  : fail('hohe See: ' + swellPerView.join(' · '));

/* Der Nebel darf nicht mehr aus Kugeln bestehen. Die Papierwolke
   des Papierschnitts ist die einzige erlaubte Ausnahme — sie ist
   ausdrücklich aus Kreisen geschnitten. */
const balls = view.querySelectorAll('.wi-fogin circle').length;
balls === 0 ? pass('keine Nebelkugeln mehr') : fail('Nebelkugeln: ' + balls);

/* Und jede der vier Nebelarten muss auch wirklich bauen. Ohne
   diesen Durchgang wären drei von vier Arten ungeprüfter Code:
   angesehen hat der Prüfstand immer nur die erste. */
const fogNames = [...document.querySelectorAll('#fogsw button')].map(b => b.textContent);
fogNames.length === 5 ? pass('fünf Nebelarten im Schalter: ' + fogNames.join(' · ')) : fail('Nebelarten: ' + fogNames.length);

fogNames.forEach((name, f) => {
  let d;
  try { d = boot(`?fog=${f}&still`); } catch (e) { fail(`Nebel „${name}": ${e.message}`); return; }
  const an = [...d.querySelectorAll('#fogsw button')].findIndex(b => b.className.includes('on'));
  if (an !== f) { fail(`Nebel „${name}": Schalter steht auf ${an}`); return; }
  /* Je Karte eine Nebelschicht mit Inhalt — und keine kaputten
     Angaben darin. Ein Verlauf ohne Kennung oder ein Muster mit
     NaN-Breite fällt sonst erst am Beamer auf. */
  const inhalt = [...d.querySelectorAll('#stage .wv:not([hidden]) .wi-fogin')]
    .map(n => n.children.length);
  let kaputt = 0;
  for (const attr of ['d', 'cx', 'cy', 'rx', 'ry', 'x', 'y', 'width', 'height', 'transform', 'filter', 'fill', 'opacity']) {
    d.querySelectorAll(`.wi-fogin [${attr}]`).forEach(n => {
      if (/NaN|undefined|Infinity|^null$/.test(n.getAttribute(attr))) kaputt++;
    });
  }
  inhalt.length === 1 && inhalt[0] > 0 && kaputt === 0
    ? pass(`Nebel „${name}" baut auf (${inhalt[0]} Lagen, nichts kaputt)`)
    : fail(`Nebel „${name}": Lagen ${inhalt.join('/')}, ${kaputt} kaputte Angaben`);
});

/* Die Tonstufen im Einzelnen. Ihre Schichten liegen übereinander,
   also MUSS jede echt weniger Felder haben als die unter ihr, und
   die unterste muss der ganze Nebel sein. Wäre die Tiefenrechnung
   verdreht, sähe man auf der Karte trotzdem „irgendwie Nebel" —
   hier fällt es auf. */
const iStufen = fogNames.indexOf('Tonstufen');
if (iStufen < 0) fail('Nebelart „Tonstufen" fehlt');
else {
  const dS = boot(`?fog=${iStufen}&still`);
  const vS = dS.querySelector('#stage .wv:not([hidden])');
  const felder = (n) => ((n && n.getAttribute('d') || '').match(/M/g) || []).length;
  const lagen = [...vS.querySelectorAll('mask path')].map(felder);
  lagen.length === 3 && lagen[0] > lagen[1] && lagen[1] > lagen[2] && lagen[2] > 0
    ? pass(`Tonstufen: drei Schichten von außen nach innen (${lagen.join(' → ')} Felder)`)
    : fail('Tonstufen-Schichten: ' + lagen.join(' → '));
  /* Kreuzprobe gegen den Nebelkörper: die unterste Schicht MUSS
     genau der ganze Nebel sein. Wäre sie kleiner, bliebe außen ein
     Streifen unmaskiert — also voll deckend, obwohl er der
     durchsichtigste sein sollte. */
  const koerper = felder(vS.querySelector('.wi-fogbody'));
  lagen[0] === koerper
    ? pass(`Tonstufen: unterste Schicht deckt sich mit dem Nebel (${koerper} Felder)`)
    : fail(`Tonstufen: unterste Schicht ${lagen[0]}, Nebelkörper ${koerper}`);
}

console.log(ok ? '\nALLES GRÜN' : '\nFEHLER');
process.exit(ok ? 0 : 1);
