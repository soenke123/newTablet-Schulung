/* Prüfstand für den Solo-Showroom (Echsen als Karteikasten).

   Kein Browser: linkedom baut das Dokument, ein vm-Sandkasten führt
   das eingebettete Skript aus, und eine gefälschte Leinwand nimmt
   alles entgegen, was gemalt werden soll. Geprüft wird, was ohne
   Pixel prüfbar ist — und das ist mehr, als es zunächst aussieht:

     · Steht in keinem SVG-Pfad ein NaN?
     · Werden aus einer Feldliste wirklich sieben getrennte Inseln,
       und findet der Küstenzug für jede genau einen Ring?
     · Trifft feldAt für JEDEN Feldmittelpunkt sein eigenes Feld?
       (Die Umkehrung des versetzten Sechseckgitters — die Stelle,
       an der man sich am leichtesten um eine Reihe vertut, und man
       sähe es nur daran, dass Tiere im Berg stecken.)
     · Schläft nach zweitausend Schritten irgendeine Echse über
       offenem Wasser? Läuft ein Läufer ins Meer?
     · Liefert die Farbrechnung für bekannte Werte die bekannten
       Farben? (Gegen feste Sollwerte, nicht gegen sich selbst —
       ein selbst geschriebener Leser prüft seinen eigenen Erzeuger
       nicht.)

   Was er NICHT kann: sagen, ob die Insel mit 500 Tieren schön
   aussieht. Dafür ist der Showroom selbst da.

   Aufruf:  node MPSkills/tools/wordisland/tools/solotest.mjs        */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

const hier = dirname(fileURLToPath(import.meta.url));
const datei = join(hier, '..', 'solo-showroom.html');
const html = readFileSync(datei, 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];

let ok = true;
const fail = m => { ok = false; console.error('  ✗ ' + m); };
const pass = m => console.log('  ✓ ' + m);
const pruef = (b, m) => b ? pass(m) : fail(m);

/* ── Die eingebackenen Bilder ─────────────────────────────────────
   Ausgeführt wird solo-sprites.js hier nicht — es steht nur zur
   Prüfung an und wandert als Zeichenkette in den Sandkasten. OB die
   Bilder gültige PNG sind, kann dieser Prüfstand nicht sagen: das
   entschiede sein eigener Dekodierer über die Bilder seines eigenen
   Kodierers, und das beweist nichts. Diesen Beweis führt der
   Browser, wenn er sie anzeigt. Hier wird geprüft, was von außen
   nachzählbar ist: sind alle neun da, und sehen sie aus wie PNG? */
const spriteJs = readFileSync(join(hier, '..', 'solo-sprites.js'), 'utf8');
const spriteCtx = { window: {} };
vm.runInNewContext(spriteJs, spriteCtx);      // scheitert schon hier, wenn es kaputt ist
const SOLO_SPRITES = spriteCtx.window.SOLO_SPRITES;

/* Die echten Maße aus dem PNG-Kopf (IHDR steht immer an Byte 16..24).
   Ohne sie wüsste der Sandkasten nicht, dass eine schlafende Echse
   flacher ist als eine stehende — und genau das soll er wissen. */
function masse(dataUrl) {
  const b = Buffer.from(dataUrl.split(',')[1], 'base64');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const MASSE = {};
for (const k in SOLO_SPRITES.bilder) MASSE[k] = masse(SOLO_SPRITES.bilder[k].d);

function machKontext(c) {
  const g = {
    canvas: c,
    filter: 'none', fillStyle: '#000', globalAlpha: 1,
    globalCompositeOperation: 'source-over', imageSmoothingQuality: 'low',
    drawImage() {}, fillRect() {}, clearRect() {},
    save() {}, restore() {}, translate() {}, scale() {}, setTransform() {},
    putImageData() {},
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    /* Ein durchgehend grünes Bild — das Ausgangsgrün der Echsen.
       Damit läuft die Farbrechnung über echte Werte statt über
       Nullen, und ein NaN darin fiele auf. */
    getImageData(x, y, w, h) {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        d[p] = 127; d[p + 1] = 178; d[p + 2] = 92; d[p + 3] = 255;
      }
      return { width: w, height: h, data: d };
    }
  };
  return g;
}

const RECT_W = 1200, RECT_H = 760;
const { window, document } = parseHTML(html);

const origCreate = document.createElement.bind(document);
document.createElement = tag => {
  const e = origCreate(tag);
  if (String(tag).toLowerCase() === 'canvas') {
    e.width = 300; e.height = 150;
    e.getContext = () => machKontext(e);
  }
  return e;
};

/* Auch die Leinwand, die schon IM Dokument steht (#tiere), braucht
   ihren Kontext — die kommt nicht durch createElement. */
for (const c of document.querySelectorAll('canvas')) {
  c.width = RECT_W; c.height = RECT_H;
  c.getContext = () => machKontext(c);
}

/* Maße. Ohne sie steht in sicht.s eine Division durch null, und ab da
   ist jeder Bildschirmpunkt NaN. */
const RECT = { left: 0, top: 0, width: RECT_W, height: RECT_H, right: RECT_W, bottom: RECT_H };
for (const el of document.querySelectorAll('*')) el.getBoundingClientRect = () => RECT;

/* Das gefälschte Bild kennt seine ECHTEN Maße — sie stehen ja in der
   Daten-Adresse, die ihm zugewiesen wird. */
class FakeImage {
  constructor() { this.width = 1; this.height = 1; }
  set src(v) {
    this._src = v;
    if (typeof v === 'string' && v.startsWith('data:image/png;base64,')) {
      const m = masse(v); this.width = m.w; this.height = m.h;
    }
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() { return this._src; }
}

let rafCb = null;
const sandbox = {
  window, document, Image: FakeImage,
  requestAnimationFrame: fn => { rafCb = fn; return 1; },
  performance: { now: () => Date.now() },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
  console, Math, Date, JSON, Promise,
  Array, Object, String, Number, Boolean, Map, Set, Error,
  Uint8ClampedArray, Float32Array,
  URLSearchParams, Event: window.Event,
  parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined
};
sandbox.globalThis = sandbox;
window.SOLO_SPRITES = SOLO_SPRITES;
window.devicePixelRatio = 2;
/* Die Adresszeile. Sie ist der einzige Weg, den Showroom von hier aus
   fernzusteuern — und damit der einzige, auf dem ausAdresse()
   überhaupt ausgeführt wird. */
const ADRESSE = process.argv[2] || '?anzahl=500&nacht=100&glow=2&farbe=lumi';
window.location = { search: ADRESSE };
window.requestAnimationFrame = sandbox.requestAnimationFrame;

console.log('\nSolo-Showroom — Prüfstand\n');

vm.runInNewContext(code, vm.createContext(sandbox));

/* Der Aufbau ist asynchron (Bilder laden, einfärben, Insel bauen). */
const warten = () => new Promise(r => setTimeout(r, 40));
let versuche = 0;
while (!window.__solo && versuche++ < 60) await warten();

if (!window.__solo) {
  console.error('  ✗ Der Aufbau ist nicht durchgelaufen — __solo fehlt.');
  process.exit(1);
}
const S = window.__solo;
pass('Aufbau läuft durch (Bilder, Einfärben, Insel, Bedienung)');

/* ── 1 · Die eingebackenen Bilder ──────────────────────────────── */
const SOLL = ['ei', 's1', 's1z', 's2', 's2z', 's3a', 's3az', 's3b', 's3bz'];
{
  const B = SOLO_SPRITES.bilder;
  const da = SOLL.filter(k => B[k]);
  pruef(da.length === 9, `solo-sprites.js hat alle neun Bilder (${da.length})`);

  /* Die PNG-Signatur steht am Anfang der Daten: 89 50 4E 47 →
     base64 „iVBORw0KGgo". Ein Bild, das anders anfängt, ist keines. */
  const falsch = SOLL.filter(k => B[k] && !B[k].d.startsWith('data:image/png;base64,iVBORw0KGgo'));
  pruef(falsch.length === 0, 'alle tragen die PNG-Signatur');

  const kb = SOLL.reduce((a, k) => a + (B[k] ? B[k].d.length : 0), 0) / 1024;
  pruef(kb > 200 && kb < 2000, `zusammen ${Math.round(kb)} kB — plausibel, nicht leer und nicht ausufernd`);

  const bl = SOLO_SPRITES.blatt;
  pruef(bl && bl.h > 0 && bl.w > 0 && bl.ankerX > 0 && bl.ankerY > 0,
    `das Blatt ist beschrieben: ${bl.w}×${bl.h}, Anker ${bl.ankerX},${bl.ankerY}`);

  /* Jeder Zuschnitt muss INS Blatt passen. Tut er es nicht, stimmt der
     gemeinsame Maßstab nicht, und die Tiere stünden versetzt. */
  const raus = SOLL.filter(k =>
    B[k].x < -1 || B[k].y < -1 ||
    B[k].x + MASSE[k].w > bl.w + 1 || B[k].y + MASSE[k].h > bl.h + 1);
  pruef(raus.length === 0, 'jeder Zuschnitt liegt im Blatt');
}

/* ── 1b · Schlafen darf nicht wachsen ──────────────────────────────
   DER Fehler aus dem ersten Anlauf: jede Datei wurde auf dieselbe
   Höhe gebracht, also wurde die zusammengerollte Schlaf-Echse auf die
   Größe der stehenden aufgeblasen — sie wuchs beim Einschlafen.
   Ein zusammengerolltes Tier ist FLACHER als ein stehendes; wenn das
   hier je wieder kippt, ist der gemeinsame Maßstab kaputt. */
{
  /* Die SIGNATUR des Fehlers ist, dass alle neun gleich hoch werden —
     das war ja die Vorschrift, an der er hing. Neun verschiedene Höhen
     heißt: es wird mit dem Blatt skaliert und nicht mit dem Tier. */
  const hoehen = SOLL.map(k => MASSE[k].h);
  pruef(new Set(hoehen).size >= 7,
    `die neun Bilder haben eigene Höhen (${new Set(hoehen).size} verschiedene: ${hoehen.join(', ')})`);

  /* Und keines darf beim Einschlafen nennenswert WACHSEN. Nicht auf
     null geprüft: Echse1snooze ist als Zeichnung fünf Vorlagen-Pixel
     höher als Echse1 — ein zusammengerollter Ball ist eben etwas
     höher als ein flach kriechendes Tier. Der Fehler war ein Faktor
     zwei, nicht ein Prozent. */
  const paare = [['s1', 's1z'], ['s2', 's2z'], ['s3a', 's3az'], ['s3b', 's3bz']];
  const gewachsen = [];
  const text = [];
  for (const [wach, schlaf] of paare) {
    const a = MASSE[wach].h, b = MASSE[schlaf].h;
    if (b > a * 1.15) gewachsen.push(`${wach}→${schlaf}`);
    text.push(`${wach} ${a} → ${schlaf} ${b}`);
  }
  pruef(gewachsen.length === 0,
    'keines wächst beim Einschlafen: ' + text.join(' · '));

  /* Und die Grundlinie: alle neun müssen mit ihrer Unterkante nahe am
     Anker liegen oder darüber schweben — keines darf tief darunter
     hängen, sonst steckt es im Boden. Ausnahme ist Echse3b, deren
     Schwanz absichtlich herunterhängt. */
  const bl = SOLO_SPRITES.blatt, B = SOLO_SPRITES.bilder;
  const tief = SOLL.filter(k => k !== 's3b' &&
    (B[k].y + MASSE[k].h) - bl.ankerY > bl.h * .06);
  pruef(tief.length === 0,
    'keines hängt merklich unter der Grundlinie' + (tief.length ? ' — ' + tief.join(', ') : ''));
}

/* ── 2 · Die Karte ─────────────────────────────────────────────── */
const svg = document.getElementById('karte');
{
  const vb = svg.getAttribute('viewBox') || '';
  pruef(/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(vb) && !vb.includes('NaN'),
    'viewBox ist sauber: ' + vb);

  let schlecht = 0, pfade = 0;
  for (const el of svg.querySelectorAll('*')) {
    for (const a of ['d', 'x', 'y', 'width', 'height', 'cx', 'cy', 'stroke-width', 'transform']) {
      const v = el.getAttribute(a);
      if (v == null) continue;
      if (a === 'd') pfade++;
      if (/NaN|Infinity|undefined|null/.test(v)) schlecht++;
    }
  }
  pruef(schlecht === 0, `kein NaN in ${pfade} Pfaden und allen Maßen (${svg.querySelectorAll('*').length} Elemente)`);
  pruef(pfade > 300, `die Karte ist gebaut (${pfade} Pfade)`);
}

/* ── 3 · Getrennte Inseln ──────────────────────────────────────── */
{
  const inseln = S.welt.inseln;
  pruef(inseln.length >= 5 && inseln.length <= 7,
    `${inseln.length} Landmassen: Hauptinsel + Satelliten`);
  pruef(inseln[0].cells.length > 100,
    `die Hauptinsel ist die größte (${inseln[0].cells.length} Felder, kleinste ${inseln[inseln.length - 1].cells.length})`);

  const ringe = S.coastRings(S.welt.isl, 1.0);
  pruef(ringe.length === inseln.length,
    `je Landmasse genau ein Küstenring (${ringe.length} Ringe zu ${inseln.length} Inseln)`);

  const gesamt = inseln.reduce((a, i) => a + i.cells.length, 0);
  pruef(gesamt === S.welt.isl.cells.length,
    `jedes der ${gesamt} Felder gehört zu genau einer Landmasse`);
}

/* ── 3b · Keine Landbrücken, über viele Würfe ──────────────────────
   Seit die Nebeninseln dreimal so groß sind, ist das Zusammenwachsen
   eine echte Gefahr: zwei Küstenringe, die sich berühren, werden EIN
   Ring, und aus zwei Inseln wird eine Wurst. Die Platzierung lehnt
   solche Plätze ab — geprüft wird das hier über den Durchmesser einer
   Landmasse, denn eine verschmolzene ist zwangsläufig länger als die
   größte, die ein einzelner Wurf erzeugen kann.

   Eine Zählung allein reichte nicht: „nur fünf Inseln" kann heißen
   „zwei sind verschmolzen" ODER „eine hat keinen Platz gefunden" —
   das erste ist ein Fehler, das zweite ist die Notbremse bei der
   Arbeit. Der Durchmesser trennt die beiden Fälle. */
{
  const HAUPT_MAX = 21, SAT_MAX = 18;
  let schlecht = 0, wenige = 0, minInseln = 99, felder = 0, felderMax = 0;
  const hauptGr = [], satGr = [];
  const WUERFE = 40;
  for (let i = 0; i < WUERFE; i++) {
    const isl = S.inselDaten(S.wuerfelInseln(1000 + i * 7717), 'p' + i);
    const gruppen = S.findeInseln(isl);
    minInseln = Math.min(minInseln, gruppen.length);
    if (gruppen.length < 5) wenige++;
    felder += isl.cells.length;
    felderMax = Math.max(felderMax, isl.cells.length);
    gruppen.forEach((g, n) => {
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const z of g.cells) {
        a = Math.min(a, z.x); b = Math.max(b, z.x);
        c = Math.min(c, z.y); d = Math.max(d, z.y);
      }
      const durch = Math.max(b - a, d - c);
      if (durch > (n === 0 ? HAUPT_MAX : SAT_MAX)) schlecht++;
      (n === 0 ? hauptGr : satGr).push(g.cells.length);
    });
  }
  const spanne = a => `${Math.min(...a)}–${Math.max(...a)} (im Schnitt ${Math.round(a.reduce((x, y) => x + y, 0) / a.length)})`;

  /* Sönkes Maße, 09.09.2026: Hauptinsel 200–220, Nebeninseln 25–60.
     Nach oben wird eine kleine Überschreitung zugelassen, weil die
     Feldzahl in Stufen springt: ein größerer Radius nimmt immer gleich
     mehrere Felder auf einmal dazu, und der kleinste Radius, der 220
     erreicht, liegt eben manchmal bei 223. Nach UNTEN gibt es keine
     Toleranz — dort wäre es einfach zu wenig. */
  const LUFT = 6;
  pruef(Math.min(...hauptGr) >= 200 && Math.max(...hauptGr) <= 220 + LUFT,
    `Hauptinsel ${spanne(hauptGr)} Felder — Vorgabe 200–220`);
  pruef(Math.min(...satGr) >= 25 && Math.max(...satGr) <= 60 + LUFT,
    `Nebeninseln ${spanne(satGr)} Felder — Vorgabe 25–60`);

  /* Die eigene Insel muss die größte bleiben — sie ist der Ort, an dem
     ein Kind seine Tiere sucht. */
  pruef(Math.max(...satGr) < Math.min(...hauptGr),
    `kein Satellit wird größer als die Hauptinsel (größter ${Math.max(...satGr)} zu kleinster ${Math.min(...hauptGr)})`);
  pruef(schlecht === 0, `${WUERFE} Würfe, keine zusammengewachsene Insel`);
  pruef(wenige === 0, `nie weniger als fünf Inseln (kleinste Zahl: ${minInseln})`);
  /* Unter der Kostenbremse (1100) bleiben, damit JEDER Wurf dieselbe
     Karte zeigt — mal mit und mal ohne Bäumchen wäre kein Prüfstand. */
  pruef(felderMax < 1000,
    `die Feldzahl bleibt unter der Kostenbremse (im Schnitt ${Math.round(felder / WUERFE)}, höchstens ${felderMax})`);
}

/* ── 4 · feldAt trifft sein eigenes Feld ───────────────────────── */
{
  let daneben = 0;
  for (const z of S.welt.isl.cells) {
    const f = S.feldAt(z.x, z.y);
    if (!f || f.i !== z.i) daneben++;
  }
  pruef(daneben === 0, `feldAt trifft alle ${S.welt.isl.cells.length} Feldmittelpunkte`);

  /* Und weit draußen darf es NICHTS finden — sonst stünden Tiere auf
     dem Wasser, ohne dass es auffiele. */
  const vb = S.welt.vb;
  let falschPositiv = 0;
  for (let i = 0; i < 500; i++) {
    const x = vb[0] - 8 + Math.random() * 4;
    const y = vb[1] - 8 + Math.random() * 4;
    if (S.feldAt(x, y)) falschPositiv++;
  }
  pruef(falschPositiv === 0, 'feldAt findet weit draußen kein Land');

  /* Die Bodenhöhe muss zur Kachel passen: Strand niedrig, Fels hoch. */
  const sand = S.welt.isl.cells.find(z => z.boden === 'sand');
  const fels = S.welt.isl.cells.find(z => z.boden === 'fels');
  if (sand && fels) {
    pruef(S.bodenY(sand.x, sand.y) > S.bodenY(fels.x, fels.y),
      'der Fels steht höher als der Strand (Bodenhöhe wird mitgenommen)');
  } else {
    pass('Bodenhöhe: kein Fels auf dieser Insel, übersprungen');
  }
}

/* ── 5 · Zweitausend Schritte ──────────────────────────────────── */
{
  const w = S.welt;
  S.baueTiere(500, [.2, .2, .2, .2, .2]);
  const vb = w.vb;
  let t = 0, nan = 0, weg = 0;
  for (let i = 0; i < 2000; i++) {
    t += 1 / 30;
    for (const tier of w.tiere) S.schritt(tier, 1 / 30, t);
  }
  for (const tier of w.tiere) {
    if (!isFinite(tier.x) || !isFinite(tier.y) || !isFinite(tier.z)) nan++;
    if (tier.x < vb[0] - 6 || tier.x > vb[0] + vb[2] + 6 ||
        tier.y < vb[1] - 6 || tier.y > vb[1] + vb[3] + 6) weg++;
  }
  pruef(nan === 0, '500 Tiere, 2000 Schritte: keine ungültige Lage');
  pruef(weg === 0, 'keines ist aus dem Bild gelaufen oder geflogen');

  /* Die Kernregel: geschlafen wird auf LAND. */
  let schlafend = 0, schlafImWasser = 0;
  for (const tier of w.tiere) {
    if (tier.zustand !== 'schlafen') continue;
    schlafend++;
    if (!S.feldAt(tier.x, tier.y)) schlafImWasser++;
  }
  pruef(schlafend > 0, `es wird überhaupt geschlafen (${schlafend} von 500)`);
  pruef(schlafImWasser === 0,
    `keine schlafende Echse über offenem Wasser (${schlafImWasser} gefunden)`);

  /* Läufer bleiben an Land — auch nach 2000 Schritten. */
  let laeuferImWasser = 0;
  for (const tier of w.tiere) {
    if (tier.stufe === 0 || tier.stufe >= 3) continue;
    if (!S.feldAt(tier.x, tier.y)) laeuferImWasser++;
  }
  pruef(laeuferImWasser === 0, `kein Läufer im Wasser (${laeuferImWasser} gefunden)`);

  /* Sönkes Regel: die Insel verlassen darf nur, wer fliegen kann.
     Eier, Babys und die mittlere Stufe bleiben auf der Hauptinsel —
     geprüft am FELD und nicht am gemerkten Inselindex, sonst prüfte
     der Test nur, ob eine Variable zu sich selbst passt. */
  let daheim = 0, ausgebuext = 0;
  for (const tier of w.tiere) {
    if (tier.stufe >= 3) continue;
    daheim++;
    const z = S.feldAt(tier.x, tier.y);
    if (!z || !S.aufHauptinsel(z)) ausgebuext++;
  }
  pruef(daheim > 0, `es gibt überhaupt Nichtflieger (${daheim} von 500)`);
  pruef(ausgebuext === 0,
    `kein Nichtflieger hat die Hauptinsel verlassen (${ausgebuext} gefunden)`);
  pruef(w.tiere.every(t => t.stufe >= 3 || t.inselIdx === 0),
    'und alle Nichtflieger führen die Hauptinsel als ihre Insel');

  /* Umgekehrt: die Satelliten werden von den FLIEGERN auch benutzt —
     sonst wäre die halbe Karte Zierde. */
  const besucht = new Set();
  for (const tier of w.tiere) {
    if (tier.stufe < 3) continue;
    if (S.feldAt(tier.x, tier.y)) besucht.add(S.naechsteInsel(tier.x, tier.y));
  }
  pruef(besucht.size >= 4,
    `die kleinen Inseln werden beflogen (${besucht.size} von 7 Landmassen belegt)`);
}

/* ── 6 · Wachsen und Schrumpfen ────────────────────────────────── */
{
  const w = S.welt;
  S.baueTiere(200, [1, 0, 0, 0, 0]);
  pruef(w.tiere.every(t => t.stufe === 0), '200 Eier gesetzt');

  /* ueben() zieht ABSICHTLICH zufällig — „eine zufällige Echse
     wächst". Nach 200 Zügen ist deshalb nicht jedes Tier genau
     einmal an der Reihe gewesen. Also großzügig ziehen, bis oben
     alle angekommen sind, und den einen Übergang, auf den es
     ankommt, danach gezielt auslösen. */
  for (let i = 0; i < 12; i++) S.ueben(+1, 200);
  pruef(w.tiere.every(t => t.stufe === 4), 'oft genug richtig → alle auf Stufe 4');
  pruef(w.tiere.every(t => ['fliegen', 'zumSchlafen', 'schlafen'].includes(t.zustand)),
    'alle Stufe-4-Tiere sind in einem Flieger-Zustand');

  /* Erst ein Stück fliegen lassen, damit ein Teil der Herde wirklich
     über offenem Wasser steht — sonst prüft der nächste Schritt
     nichts. */
  let t0 = 0;
  for (let i = 0; i < 600; i++) { t0 += 1 / 30; for (const t of w.tiere) S.schritt(t, 1 / 30, t0); }
  const ueberWasser = w.tiere.filter(t => !S.feldAt(t.x, t.y)).length;
  pruef(ueberWasser > 0, `${ueberWasser} von 200 Fliegern stehen über offenem Wasser`);

  /* DER Fall, den man beim Ansehen nie erwischt: ein Tier, das mitten
     über dem Meer zum Läufer wird. Gezielt ausgelöst, nicht
     erwürfelt. */
  for (const t of w.tiere) S.setzeStufe(t, 2, true);
  pruef(w.tiere.every(t => t.stufe === 2), 'Stufe 4 → 2 für alle gesetzt');
  const imMeer = w.tiere.filter(t => !S.feldAt(t.x, t.y)).length;
  pruef(imMeer === 0, `beim Schrumpfen ist jedes auf Land gelandet (${imMeer} im Meer)`);
  /* Und zwar zu Hause. Wer über einem Satelliten die Flugfähigkeit
     verliert, säße dort sonst für immer fest. */
  const fremd = w.tiere.filter(t => {
    const z = S.feldAt(t.x, t.y);
    return !z || !S.aufHauptinsel(z);
  }).length;
  pruef(fremd === 0, `alle sind auf der Hauptinsel gelandet (${fremd} anderswo)`);
  pruef(w.tiere.every(t => t.z === 0), 'und keines steht mehr in der Luft');
  pruef(w.tiere.every(t => t.zustand === 'laufen'), 'alle sind wieder Läufer');

  /* Und der Weg nach unten über ueben() darf nirgends hängen. */
  for (let i = 0; i < 12; i++) S.ueben(-1, 200);
  pruef(w.tiere.every(t => t.stufe === 0), 'oft genug falsch → alle wieder Ei');
}

/* ── 7 · Die Farbrechnung ──────────────────────────────────────── */
{
  /* Gegen feste Sollwerte aus der HSL-Definition, nicht gegen die
     eigene Umkehrfunktion. */
  const f = S.hsl2rgb;
  const nah = (a, b) => Math.abs(a - b) < 1.5;
  const prob = [
    [[0, 1, .5], [255, 0, 0], 'Rot'],
    [[120, 1, .5], [0, 255, 0], 'Grün'],
    [[240, 1, .5], [0, 0, 255], 'Blau'],
    [[60, 1, .5], [255, 255, 0], 'Gelb'],
    [[0, 0, .5], [127.5, 127.5, 127.5], 'Grau']
  ];
  let schlecht = 0;
  for (const [ein, soll] of prob) {
    const r = f(...ein);
    if (!nah(r[0], soll[0]) || !nah(r[1], soll[1]) || !nah(r[2], soll[2])) schlecht++;
  }
  pruef(schlecht === 0, `hsl2rgb trifft ${prob.length} bekannte Farben`);

  const h = S.rgb2hsl(127, 178, 92);        // das Grün der Echsen
  pruef(h[0] > 80 && h[0] < 110,
    `das Ausgangsgrün liegt bei ${Math.round(h[0])}° — die Annahme BASIS_H = 95 stimmt`);

  pruef(S.FARBEN.length === 8, 'acht Farbvarianten');
  pruef(S.GLUEHEN[0] === 0 && S.GLUEHEN[1] < S.GLUEHEN[2] && S.GLUEHEN[2] < S.GLUEHEN[3],
    'das Leuchten steigt mit der Stufe, das Ei leuchtet nicht');
}

/* ── 8 · Ein Bild malen ────────────────────────────────────────── */
{
  pruef(typeof rafCb === 'function', 'die Zeichenschleife ist angemeldet');
  let fehler = null;
  try { rafCb(performance.now()); } catch (e) { fehler = e; }
  pruef(!fehler, 'ein Bild malen wirft keinen Fehler' + (fehler ? ': ' + fehler.message : ''));
}

console.log('\n' + (ok ? '  ALLES DURCH' : '  FEHLER — siehe oben') + '\n');
process.exit(ok ? 0 : 1);
