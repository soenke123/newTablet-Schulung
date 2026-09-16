/* Prüfstand für die minimale Karte (mini-showroom.html).
   Kein Browser: linkedom baut das Dokument, ein vm-Sandkasten führt
   das eingebettete Skript aus — dasselbe Verfahren wie in
   showroomtest.mjs.

   Geprüft wird, was ohne Pixel prüfbar ist:
     · das Skript läuft durch,
     · in keinem Pfad steht NaN/undefined/null,
     · die Insel ist vollständig (eine Wabe je Feld),
     · jeder Landeplatz hat ein Schiff und eine Planke,
     · fünf Ruinen, und aufgedeckte tragen ihr Sprite,
     · KEIN einziger Filter, keine Maske, kein clipPath —
       das ist die eigentliche Zusage dieser Karte,
     · und sie ist deutlich leichter als die große.

   Was er NICHT kann: sagen, ob sie schön aussieht. Dafür ist die
   Seite selbst da.                                                 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

/* fileURLToPath statt `.pathname`: der Projektpfad enthält ein
   Leerzeichen („MPS TabletSchlung"), und in einer URL steht dort
   %20. Der alte Handgriff schnitt nur den Laufwerksbuchstaben
   zurecht und ließ das %20 stehen — der Prüfstand stürzte seitdem
   beim Lesen ab, ohne je eine Zusage geprüft zu haben. */
const file = process.argv[2]
  || fileURLToPath(new URL('../mini-showroom.html', import.meta.url));
const html = readFileSync(file, 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];

let ok = true;
const fail = m => { ok = false; console.error('  ✗ ' + m); };
const pass = m => console.log('  ✓ ' + m);

const { window, document } = parseHTML(html);
const timers = [];
const rafs = [];
/* linkedom kennt weder Maße noch Zeiger; beides wird nur von der
   Bedienung gebraucht und darf hier Attrappe sein. */
Object.defineProperty(window.Element.prototype, 'clientWidth', { get: () => 390, configurable: true });
Object.defineProperty(window.Element.prototype, 'clientHeight', { get: () => 560, configurable: true });
window.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 560 });
window.Element.prototype.setPointerCapture = () => {};

const sandbox = {
  window, document,
  requestAnimationFrame: fn => { rafs.push(fn); return rafs.length; },
  performance: { now: () => Date.now() },
  setTimeout: fn => { timers.push(fn); return 0; },
  setInterval: () => 0,
  console,
  Math, Date, parseFloat, parseInt, isFinite, Array, Object, String, Number,
  Map, Set, JSON, Infinity, NaN
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* Die Zeitgeber laufen AB: jeder Kartenaufbau legt einen neuen an
   (die Anfahrt der Schiffe). Würde die Liste nicht geleert, liefe
   nach dem zweiten Aufbau der erste noch einmal — und die Prüfung
   „alle Schiffe sind am Platz" hinge davon ab, in welcher
   Reihenfolge. */
const laufZeitgeber = () => timers.splice(0).forEach(fn => fn());

try {
  vm.runInContext(code, sandbox, { filename: 'mini-showroom.js' });
  laufZeitgeber();
  pass('Skript läuft ohne Ausnahme durch');
} catch (e) {
  fail('Ausnahme: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}

/* ⚠️ linkedom spiegelt `checked=""` aus dem Markup nicht in die
   Eigenschaft. Ohne diese drei Zeilen läuft der ganze Prüfstand
   gegen eine Karte ohne Gelände und ohne Areal-Rahmen — und meldet
   grün, dass beides fehlt. Also einmal ausdrücklich setzen und neu
   bauen lassen. */
for (const id of ['cGelaende', 'cRing', 'cHandy']) document.getElementById(id).checked = true;
document.getElementById('cRing').dispatchEvent(new window.Event('change'));
laufZeitgeber();

const svg = document.getElementById('map');
const vb = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
(vb.length === 4 && vb.every(n => isFinite(n)) && vb[2] > 0 && vb[3] > 0)
  ? pass('viewBox endlich und positiv: ' + svg.getAttribute('viewBox'))
  : fail('viewBox „' + svg.getAttribute('viewBox') + '"');

let bad = 0, geo = 0;
for (const attr of ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height',
                    'transform', 'fill', 'stroke', 'stroke-width', 'opacity', 'href']) {
  svg.querySelectorAll(`[${attr}]`).forEach(n => {
    const v = n.getAttribute(attr); geo++;
    if (/NaN|undefined|Infinity|^null$/.test(v)) { if (bad++ < 4) fail(`<${n.localName} ${attr}="${String(v).slice(0, 70)}">`); }
  });
}
bad === 0 ? pass(`${geo} Angaben, keine davon kaputt`) : fail(`${bad} kaputte Angaben`);

/* Die Zusage dieser Karte: kein einziger Filter. Ein Filter ist der
   Grund, warum die große Karte beim Zoomen neu rastern muss. */
const teuer = ['filter', 'mask', 'clipPath', 'feTurbulence', 'feGaussianBlur', 'feDisplacementMap']
  .map(t => [t, svg.querySelectorAll(t).length]).filter(([, n]) => n);
teuer.length === 0 ? pass('kein Filter, keine Maske, kein clipPath')
                   : fail('teure Bauteile: ' + teuer.map(([t, n]) => `${t}×${n}`).join(', '));
const filterAttr = svg.querySelectorAll('[filter]').length;
filterAttr === 0 ? pass('kein Element verweist auf einen Filter') : fail(filterAttr + ' Elemente mit filter=');

/* Eine Wabe je Feld — nicht mehr (kein Relief) und nicht weniger. */
const waben = svg.querySelectorAll('.mini-cell');
const felder = new Set([...waben].map(w => w.getAttribute('data-i'))).size;
(waben.length > 0 && waben.length === felder)
  ? pass(`${waben.length} Waben, jede mit eigener Feldnummer`)
  : fail(`Waben ${waben.length}, Feldnummern ${felder}`);
/* Der Regler sagt FELDER — er muss auch Felder liefern. */
Math.abs(waben.length - 420) <= 20
  ? pass(`Regler 420 → ${waben.length} Felder`)
  : fail(`Regler 420, aber ${waben.length} Felder`);

/* Die Landeplätze: je ein Schiff mit Sprite und eine Planke. */
const schiffe = svg.querySelectorAll('.mini-shipbob');
const bilder = [...svg.getElementsByTagName('image')];
const boote = bilder.filter(b => /sprites\/boot\//.test(b.getAttribute('href') || ''));
(schiffe.length === boote.length && schiffe.length >= 2)
  ? pass(`${schiffe.length} Schiffe, jedes mit Sprite`)
  : fail(`Schiffe ${schiffe.length}, Bilder ${boote.length}`);
/* Sie fahren herein: der Zeitgeber setzt den Zielwert auf 0,0. */
const steht = [...svg.querySelectorAll('.mini-shipglide')]
  .every(g => /translate\(0px, 0px\)/.test(g.style.transform || ''));
steht ? pass('alle Schiffe sind nach der Anfahrt am Platz') : fail('ein Schiff bleibt draußen stehen');

/* Fünf Ruinen. Aufgedeckte tragen ihr Sprite, verdeckte einen
   goldenen Punkt — zusammen müssen es fünf sein. */
const ruinen = bilder.filter(b => /sprites\/ruine\//.test(b.getAttribute('href') || '')).length;
const punkte = svg.querySelectorAll('circle').length / 2;   // Punkt + Ring
Math.round(ruinen + punkte) === 5
  ? pass(`fünf Ruinen (${ruinen} aufgedeckt, ${punkte} verdeckt)`)
  : fail(`Ruinen: ${ruinen} aufgedeckt + ${punkte} verdeckt`);

/* Das Gewicht. Die große Karte kommt bei rund 500 Feldern auf etwa
   2500 Elemente (Relief 4 je Feld plus Nebel und Brandung); hier
   soll ein Feld ungefähr ein Element sein. */
const alle = svg.querySelectorAll('*').length;
const proFeld = alle / waben.length;
proFeld < 1.25
  ? pass(`${alle} Elemente für ${waben.length} Felder (${proFeld.toFixed(2)} je Feld)`)
  : fail(`zu schwer: ${proFeld.toFixed(2)} Elemente je Feld`);

/* ── Oben steht NUR das eigene Volk ───────────────────────────
   Sönke, 16.09.2026: „die anderen Völker sehe ich hier nicht."
   Also keine Völkerliste, dafür Felder UND Prozent beim eigenen. */
document.querySelectorAll('#voelker, .volk').length === 0
  ? pass('keine Völkerliste auf der Seite')
  : fail('es steht noch eine Völkerliste da');

const kopfFelder = parseInt(document.getElementById('kFelder').textContent, 10);
kopfFelder === waben.length
  ? pass(`Kopfzeile nennt ${kopfFelder} Felder — so viele liegen auch da`)
  : fail(`Kopfzeile ${kopfFelder}, Waben ${waben.length}`);

const stand = document.getElementById('kopfStand').textContent;
const mFelder = stand.match(/(\d+)\s*Felder/);
const mPct = stand.match(/([\d,.]+)\s*%/);
if (!mFelder || !mPct) fail('eigener Stand: „' + stand + '"');
else {
  /* Die Zahl muss aus DERSELBEN Karte kommen: eigene Felder =
     Waben in der eigenen Farbe. Nachgezählt wird über die Ringe
     der freien Wahl nicht — die hängen an den Nachbarn —, sondern
     über den Anteil: Felder / alle Felder = Prozent. */
    const f = +mFelder[1], p = parseFloat(mPct[1].replace(',', '.'));
  const soll = f * 100 / waben.length;
  (f > 0 && Math.abs(soll - p) < .6)
    ? pass(`eigener Stand: ${f} Felder = ${mPct[1]} % von ${waben.length}`)
    : fail(`eigener Stand: ${f} Felder, aber ${mPct[1]} % (gerechnet ${soll.toFixed(1)})`);
}

/* Die Serie gehört zur Vokabel und nicht zum Volk. */
(document.querySelector('.frage .flamme') && !document.querySelector('.kopf .flamme'))
  ? pass('Serien-Abzeichen steht bei der Vokabel')
  : fail('Serien-Abzeichen sitzt noch im Kopf');

/* ── Der Rahmen um jedes Volksgebiet ──────────────────────────
   Ein geschlossener Zug je Volk mit Gebiet (zwei Lagen: dunkel
   darunter, hell darüber). Dass er die Kacheln UMSCHLIESST und
   nicht jede einzeln umrandet, zeigt sich an der Länge: ein Zug
   um 100 zusammenhängende Waben hat viel weniger Kanten als 600
   einzelne Sechseckseiten. */
const gebiete = [...svg.querySelectorAll('path')].filter(p =>
  /^rgba\(7, ?22, ?33/.test(p.getAttribute('stroke') || ''));
gebiete.length === 4
  ? pass('ein Umriss je Volk (4)')
  : fail('Gebiets-Umrisse: ' + gebiete.length);
const kanten = gebiete.reduce((s, p) => s + (p.getAttribute('d').match(/Q/g) || []).length, 0);
kanten < waben.length * 6
  ? pass(`${kanten} Umrisskanten für ${waben.length} Waben — ein Zug, keine Wabenkette`)
  : fail(`${kanten} Umrisskanten: das umrandet jede Kachel einzeln`);

/* Der Rahmen: Leiste über der Karte, gerahmter Kasten, eigener Kopf. */
(document.querySelector('.karte .kbar') && document.querySelector('.karte .mapwrap'))
  ? pass('Karte sitzt im Rahmen mit Leiste darüber')
  : fail('Kartenrahmen fehlt');
/sprites\/held\//.test(document.getElementById('kopfPic').getAttribute('src') || '')
  ? pass('eigener Kopf trägt die Crew des Volkes')
  : fail('Kopfbild: ' + document.getElementById('kopfPic').getAttribute('src'));

/* Und noch einmal mit anderen Reglern: acht Völker, große Insel,
   nichts erobert, freie Wahl an. Dort steckt die Sonderbehandlung
   „noch niemand gelandet". */
document.getElementById('fVoelker').value = '8';
document.getElementById('fFelder').value = '900';
document.getElementById('fErobert').value = '0';
document.getElementById('cWahl').checked = true;
try {
  document.getElementById('bNeu').dispatchEvent(new window.Event('click'));
  laufZeitgeber();
  const w2 = svg.querySelectorAll('.mini-cell').length;
  const s2 = svg.querySelectorAll('.mini-shipbob').length;
  (Math.abs(w2 - 900) <= 40 && s2 === 8)
    ? pass(`große Insel: ${w2} Felder (Regler 900), 8 Schiffe`)
    : fail(`große Insel: ${w2} Felder (Regler 900), ${s2} Schiffe`);
  /* Bei 0 % gehört jedem Volk genau sein Landeplatz — so fängt auch
     das echte Spiel an. Also höchstens die sechs Nachbarn des
     eigenen Landeplatzes als Wahl-Ringe, und nicht null. */
  const m0 = svg.querySelectorAll('.mini-mark').length;
  (m0 > 0 && m0 <= 6)
    ? pass(`Spielbeginn: ${m0} Wahl-Ringe rund um den eigenen Landeplatz`)
    : fail(`Wahl-Ringe bei 0 %: ${m0}`);
} catch (e) {
  fail('zweiter Durchgang: ' + e.message);
}

/* Mit Besitz muss die freie Wahl Ringe zeigen — sonst prüft der
   Fall oben nur, dass nichts passiert. */
document.getElementById('fErobert').value = '40';
document.getElementById('fErobert').dispatchEvent(new window.Event('input'));
svg.querySelectorAll('.mini-mark').length > 0
  ? pass(`freie Wahl: ${svg.querySelectorAll('.mini-mark').length} Ringe`)
  : fail('freie Wahl zeigt keine Ringe');

console.log(ok ? '\nAlles grün.' : '\nFehler gefunden.');
process.exit(ok ? 0 : 1);
