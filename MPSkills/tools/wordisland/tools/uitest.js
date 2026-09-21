/**
 * UI-Prüfstand für Myth of Wordisland — die ECHTE tool.js, ohne Browser.
 *
 * Gebaut auf linkedom (liegt schon im Projekt). Geprüft wird das, was in
 * einer Klasse als „weißer Bildschirm" auffiele und sonst nirgends:
 *
 *   · Beide Rollen bauen ihr DOM und stürzen nicht ab.
 *   · Die Karte entsteht aus `map` und wird aus `own` eingefärbt —
 *     ein Zeichen je Feld, in derselben Reihenfolge.
 *   · Die drei Stufen der Antwort erscheinen als das, was sie sind:
 *     Eingabefeld, Schreibweisen-Auswahl, Wort-Auswahl.
 *   · Die freie Wahl schaltet die Karte scharf und schickt r/c.
 *   · Eine neue Runde (anderer map_key) baut die Insel neu.
 *   · Die Lobby (0133): Wappenreihe, Segment-Schalter, eine Spalte je
 *     Volk am Pult — und am Tablet das eigene Volk mit den Namen der
 *     Gruppe. Dazu die Übersetzung Slot → Volk: wählt die Lehrkraft
 *     die Völker 4 und 5, muss Slot 0 auch LILA werden.
 *
 * Was hier NICHT geprüft wird: das Aussehen. Ob ein Nebelfeld dunkler ist
 * als das Meer, entscheidet tool.css, und das sieht man nur mit Augen.
 *
 * Aufruf:  node MPSkills/tools/wordisland/tools/uitest.js
 *          … uitest.js insel          nur einen Bereich (siehe BEREICHE
 *                                     ganz unten: raum · insel · level · ruinen)
 *          WI_MASS_TEILER=1 node …    mit den echten Bildmaßen, viermal langsamer
 */
// ESM, weil package.json "type": "module" trägt — die Prüfstände von
// Wild Clusters sind älter und laufen noch über require.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'tool.js');

let fails = 0;
const js = v => JSON.stringify(v);
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};

/* ─── Umgebung ──────────────────────────────────────────────
   So viel Browser, wie die tool.js anfasst — und keinen Halm mehr. */
function makeEnv() {
  const { window, document } = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>');
  window.document = document;
  if (!document.hidden) document.hidden = false;

  const impls = {};
  window.MPTool = { register: (id, impl) => { impls[id] = impl; } };

  const ctxBase = {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
          c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    errText: code => 'Fehler: ' + code,
    toast: msg => { ctxBase.toasts.push(msg); },
    toasts: [],
    confirm: () => Promise.resolve(true),
    refresh: () => {},
    preview: false
  };

  /* Ein echter Ablagestub statt gar keiner. Bis 15.09.2026 gab es
     hier nichts, und jeder Zugriff der tool.js lief in sein
     try/catch — geprüft war damit nie, ob das Werkzeug sich etwas
     MERKT, sondern nur, dass es am Fehlen nicht zerbricht. Der
     Unit-Baum (0150) merkt sich, welche Unit zugeklappt ist, und
     genau das gehört geprüft. */
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: k => { store.delete(String(k)); },
    clear: () => store.clear()
  };

  const sandbox = {
    window, document, localStorage,
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Map, Set,
    Promise, Infinity, encodeURI, isNaN, parseInt, parseFloat, Error
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(TOOL, 'utf8'), sandbox, { filename: 'tool.js' });

  // `sandbox` kommt mit heraus, damit die Solo-Rolle weiter unten
  // Leinwand, Bild und die Zeichenschleife nachrüsten kann — sie
  // braucht mehr Browser als die beiden Raum-Rollen.
  return { window, document, impls, ctxBase, sandbox, store, localStorage };
}

const click = (el, doc) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ─── Eine Antwort abschicken ───────────────────────────────
   Das Antwortfeld ist seit 11.09.2026 kein <input> in einem <form>
   mehr, sondern ein contenteditable (kein Formularfeld = keine
   Ausfüll-Leiste von Chrome über der Tastatur; siehe feldBauen in
   tool.js). Getippt wird deshalb in `textContent`, und abgeschickt
   wird mit Enter statt mit `submit`. */
function antworte(root, doc, text, sel = '.wi-in') {
  const el = root.querySelector(sel);
  if (!el) return null;
  el.textContent = text;
  const ev = new doc.defaultView.Event('keydown', { bubbles: true });
  ev.key = 'Enter';
  el.dispatchEvent(ev);
  return el;
}

/* ─── Ein erfundener Server ─────────────────────────────────
   Dieselbe Gestalt wie wi_view/wi_room_get in 0131 + 0133. */
function island(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Das dritte Element ist seit 0146 die KLASSE des Ortes:
      // 0 nichts, 1 klein (Klo, Tor), 2 groß (Arena, Tempel).
      cells.push([r, c, (r === 1 && c === 2) ? 2 : 0, (r === 0 && c === 0) ? 1 : 0]);
    }
  }
  return cells;
}

/* Eine runde Insel mit vier Landeplätzen an der Küste — dieselbe
   Gestalt, die wi_build_island liefert. Gebraucht für die Karte:
   ein Rechteck hätte keine Bucht, keine Ecke offenes Wasser und
   keinen Nebelkern. */
function rundeInsel(R) {
  const cells = [];
  const drin = new Map();
  for (let r = -R - 1; r <= R + 1; r++) {
    for (let c = -R - 1; c <= R + 1; c++) {
      const x = c + 0.5 * (((r % 2) + 2) % 2), y = r * 0.8660254;
      const d = Math.hypot(x, y);
      if (d <= R * (0.86 + 0.1 * Math.sin(3 * Math.atan2(y, x)))) {
        drin.set(r + ',' + c, cells.length);
        cells.push([r, c, 0, 0, d]);
      }
    }
  }
  // Vier Ruinen und vier Landeplätze am äußeren Rand, gleichmäßig verteilt.
  const rand = cells.filter(z => z[4] > R * 0.62).sort((a, b) =>
    Math.atan2(a[0] * 0.866, a[1]) - Math.atan2(b[0] * 0.866, b[1]));
  [0, 1, 2, 3].forEach(k => { const z = rand[Math.floor(k * rand.length / 4)]; if (z) z[3] = 1; });
  cells.filter(z => !z[3] && z[4] < R * 0.5).forEach((z, i) => { if (i % 9 === 0) z[2] = 1 + (i % 2); });
  return cells.map(z => [z[0], z[1], z[2], z[3]]);
}

const MAP = island(4, 5);           // 20 Felder
const OWN_START = '0' + '.'.repeat(MAP.length - 1);

/* `meOver` bildet nach, was der echte Server tut: er hat die Antwort
   schon verbucht, wenn das Werkzeug gleich danach nachfragt. Ein
   Mock, der stur die alte Aufgabe zurückgäbe, prüfte einen Fall,
   den es nicht gibt — und ließe den Nachschlag nach jeder richtigen
   Antwort wie einen Rücksetzer aussehen. */
function viewFor(over, meOver) {
  const v = Object.assign({
    ok: true, role: 'participant', phase: 'running', mode: 'type',
    team_count: 2, factions: [0, 1],
    teams: [{ i: 0, tiles: 1, ruins: 0, score: 1, people: 3 },
            { i: 1, tiles: 1, ruins: 0, score: 1, people: 3 }],
    my_team_members: [{ name: 'Ada', me: false, online: true },
                      { name: 'Tablet 3', me: true, online: true },
                      { name: 'Cem', me: false, online: false }],
    online_count: 5, room_total: 6,
    map_key: 'raum:1', map: null, own: OWN_START,
    ends_at: new Date(Date.now() + 300000).toISOString(),
    countdown_ends_at: null,
    me: { seat: 3, name: 'Tablet 3', team: 0, streak: 0, picks: 0,
          correct: 0, wrong: 0, locked_for: 0,
          task: { prompt: 'das Haus', dir: 'de_en', stage: 'type', options: [] } }
  }, over || {});
  if (meOver) v.me = Object.assign({}, v.me, meOver);
  return v;
}

/* Dasselbe für die Pult-Rolle. Sie bekommt keine eigene Aufgabe und
   kein `me`, dafür die Leute im Raum — und sie ist die einzige
   Rolle, die noch die Reliefkarte sieht (16.09.2026). */
function pultView(over) {
  return Object.assign({
    ok: true, role: 'presenter', phase: 'running', mode: 'type', direction: 'mixed',
    team_count: 4, factions: [0, 1, 2, 3], duration: 600, radius: 7, seed: 3,
    teams: [0, 1, 2, 3].map(i => ({ i, tiles: i ? 1 : 4, ruins: 0, score: i ? 1 : 4, people: 1 })),
    map_key: 'raum:relief', map: null, own: OWN_START,
    ends_at: new Date(Date.now() + 300000).toISOString(),
    countdown_ends_at: null, winner_team: null, sets: ['s1'],
    online_count: 2, room_total: 3,
    people: [{ seat: 1, name: 'Ada', team: 0, online: true, correct: 2, wrong: 1 }]
  }, over || {});
}

/* ═══════════════════════════════════════════════════════════
   Tablet — Arena
   ═══════════════════════════════════════════════════════════ */
async function testTablet() {
  console.log('\n— Tablet —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  ok('Werkzeug meldet sich an', !!tool && typeof tool.mount === 'function');
  if (!tool) return;

  const calls = [];
  let answer = null;
  let srv = null;          // Stand, den der Server nach der Antwort hätte
  const reply = a => { answer = a; srv = { task: a.task, streak: a.streak, picks: a.picks }; };

  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_view') {
          return Promise.resolve(viewFor(args.p_full ? { map: MAP } : {}, srv));
        }
        if (fn === 'wi_answer') return Promise.resolve(answer);
        if (fn === 'wi_pick_tile') {
          if (srv) srv.picks = 0;
          return Promise.resolve({ ok: true, picks: 0, tile: { r: 0, c: 1, ruin: 0 } });
        }
        return Promise.resolve({ ok: false, error: 'not_allowed' });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  ok('erster Abruf holt die Karte', calls[0][0] === 'wi_view' && calls[0][1].p_full === true);
  const cells = root.querySelectorAll('.wi-cell');
  ok('alle Felder gezeichnet', cells.length === MAP.length, `${cells.length}/${MAP.length}`);
  ok('Landeplatz eingefärbt', cells[0].dataset.t === '0');
  ok('Nebel bleibt Nebel', cells[5].dataset.t === '.');
  ok('besonderer Ort gezeichnet', root.querySelectorAll('.wi-place').length === 1);

  /* ── Die Schiffe (08.09.2026) ────────────────────────────────
     „Die Schiffe sind keine Felder auf dem Spielfeld. Sie fahren von
     außen an das Spielfeld ran." Also: ein Schiff je Landeplatz, im
     Wasser NEBEN dem Feld, mit dem Wappen des Volkes an Deck. */
  const ship = root.querySelector('.wi-ship');
  ok('ein Schiff je Landeplatz',
     !!ship && root.querySelectorAll('.wi-ship').length === 1);
  ok('kein Wappen mehr auf dem Feld', root.querySelectorAll('.wi-home').length === 0);
  ok('Schiff trägt das Volk des Landeplatzes', ship.dataset.t === '0');
  /* Das Schiffsbild kommt aus tools/wordisland/sprites/ und wird
     erst beim Malen gesetzt — der Server kennt nur `is_home`, nicht
     das Volk. Ein fehlendes <image> zeichnet in SVG stillschweigend
     NICHTS: genau so lag die Karte im Showroom einmal ohne Schiffe
     da, nachdem die Dateien umbenannt worden waren. Deshalb wird
     hier nicht nur der Pfad geprüft, sondern die DATEI. */
  const shipHref = ship.querySelector('.wi-shipimg').getAttribute('href') || '';
  /* Seit dem 14.09.2026 der ZUSCHNITT aus sprites/boot/ und nicht
     mehr Sönkes Vorlage „red Schiff.png": die ist 1984 × 2176 groß
     und wird 2,6 Kacheln breit gezeichnet — bei 30 Tablets eine halbe
     Gigabyte je Runde. Das Seitenverhältnis ist dasselbe, das Bild
     sitzt also unverändert. */
  ok('Schiffsbild gesetzt', /wordisland\/sprites\/boot\/0\.png$/.test(shipHref), shipHref);
  ok('Schiffsbild liegt auch wirklich da',
     fs.existsSync(path.join(HERE, '..', '..', '..', decodeURI(shipHref))), shipHref);
  /* Und es läuft NICHT durch den Freistell-Filter. Die Schiffe sind
     freigestellte RGBA-PNG; der Filter schnitte nach Helligkeit und
     nähme als Erstes die Segel mit. */
  ok('Schiffsbild ohne Freistell-Filter',
     !ship.querySelector('.wi-shipimg').getAttribute('filter'));
  // Der Landeplatz liegt bei (0,0) — das Schiff muss deutlich daneben
  // liegen, sonst ist es doch wieder ein Feld.
  const at = /translate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(ship.getAttribute('transform') || '');
  ok('Schiff liegt im Wasser, nicht auf dem Feld',
     !!at && Math.hypot(+at[1], +at[2]) > 1, ship.getAttribute('transform'));
  ok('Planke vom Schiff zum Landeplatz', root.querySelectorAll('.wi-plank').length === 1);
  // Die Anfahrt: erst weit draußen, kurz danach auf null — daraus
  // macht der Übergang in tool.css die Fahrt.
  await wait(90);
  ok('Schiff fährt heran',
     /translate\(\s*0px/.test(ship.querySelector('.wi-shipglide').style.transform || ''),
     ship.querySelector('.wi-shipglide').style.transform);
  ok('Spieltafel offen, Wartetafel zu',
     root.querySelector('[data-part="tplay"]').hidden === false &&
     root.querySelector('[data-part="tlobby"]').hidden === true);
  ok('Volk im Kopf', /Toast-Ritter/.test(root.querySelector('.wi-me').textContent));
  /* Das Bild im Kopf ist die Crew des eigenen Volkes auf Stufe 1
     (14.09.2026, Sönke: „bei den Völkern die Level 1 Sprites der
     Crew"). Geprüft wird der Pfad UND die Datei: aus clash-of-math
     ist hier nichts mehr geliehen, und ein <img> auf eine Datei, die
     es nicht gibt, zeigt am Tablet ein kaputtes Bild. */
  const kopfBild = root.querySelector('.wi-mepic').getAttribute('src') || '';
  ok('Crew Stufe 1 im Kopf', /sprites\/held\/0_1\.png$/.test(kopfBild), kopfBild);
  ok('und das Bild liegt auch da',
     fs.existsSync(path.join(HERE, '..', '..', '..', decodeURI(kopfBild))), kopfBild);
  ok('keine Leihgabe aus Kingdoms mehr',
     !/clash-of-math\/sprites/.test(root.innerHTML) &&
     !/clash-of-math\/sprites/.test(fs.readFileSync(TOOL, 'utf8')));
  ok('Wort steht da', root.querySelector('.wi-word').textContent === 'das Haus');
  ok('Frage passt zur Richtung', /Englisch/.test(root.querySelector('.wi-ask').textContent));
  ok('Eingabefeld offen', !root.querySelector('.wi-type').hidden);
  /* Warum das kein <input> in einem <form> sein darf, steht in
     tool.js bei feldBauen(): Chrome auf Android legt über jedes
     Formularfeld seine Ausfüll-Leiste (Passkey · Karte · Standort),
     und die frisst auf einem Telefon genau die Zeile, an der es eng
     ist. Wer hier wieder ein Formularfeld einbaut, holt sie zurück —
     ohne dass es am Rechner auffiele. */
  ok('das Antwortfeld ist kein Formularfeld',
     !root.querySelector('.wi-task form, .wi-task input, .wi-task textarea'));
  ok('und trotzdem beschreibbar',
     root.querySelector('.wi-in').getAttribute('contenteditable') != null);

  /* Fast richtig → Schreibweisen */
  reply({ ok: true, result: 'spell', streak: 0, picks: 0,
          task: { prompt: 'das Haus', dir: 'de_en', stage: 'spell',
                  options: ['hous', 'house', 'housse', 'huose'] } });
  antworte(root, document, 'hous');
  await wait(40);
  ok('Antwort ging raus', calls.some(([fn, a]) => fn === 'wi_answer' && a.p_input === 'hous'));
  ok('Schreibweisen als Knöpfe', root.querySelectorAll('.wi-opts button').length === 4);
  ok('Eingabefeld weicht der Auswahl', root.querySelector('.wi-type').hidden === true);
  ok('Rückmeldung „fast"', /Fast/.test(root.querySelector('.wi-fb').textContent));
  /* Und das Feld ist leer — bei einem contenteditable ist das keine
     Selbstverständlichkeit: `textContent = ''` lässt gern ein <br>
     zurück, und dann käme der Platzhalter nie wieder. */
  ok('das Feld ist danach leer', root.querySelector('.wi-in').innerHTML === '');

  /* Auswahl richtig → Feld */
  reply({ ok: true, result: 'correct', streak: 1, picks: 0,
          tile: { r: 0, c: 1, kind: 'fog', ruin: 0 },
          task: { prompt: 'die Schule', dir: 'de_en', stage: 'type', options: [] } });
  click(root.querySelectorAll('.wi-opts button')[1], document);
  await wait(40);
  ok('gewählte Fassung ging raus',
     calls.some(([fn, a]) => fn === 'wi_answer' && a.p_input === 'house'));
  ok('neues Wort steht da', root.querySelector('.wi-word').textContent === 'die Schule');
  ok('Eingabefeld ist zurück', root.querySelector('.wi-type').hidden === false);

  /* ── Das Serien-Abzeichen (14.09.2026) ───────────────────────
     „Klein nach rechts … einfach eine Flamme und dann ein x von y."
     Bei Serie 0 steht es gar nicht da; sonst zählt es zum NÄCHSTEN
     VIELFACHEN von drei hin.

     Der Takt ist der zweite Auftrag desselben Tages: „Eine Streak ist
     alle 3 richtige. Also zuerst 3, dann 6 und so weiter. Das sollte
     auch die UI zeigen." Bis Migration 0148 stand hier eine Schwelle
     — ab drei brannte das Abzeichen dauerhaft und trug gar kein Ziel
     mehr, weil ab dort jede Antwort eine Wahl brachte. Genau das war
     der Fehler; die Anzeige war nur ehrlich. */
  const chip = root.querySelector('.wi-streak');
  ok('Serien-Abzeichen im Kopf, nicht als Satz', !!chip && !root.querySelector('.wi-pickbar'));
  ok('Flamme steht dran', /🔥/.test(chip.textContent));
  reply({ ok: true, result: 'correct', streak: 2, picks: 0, tile: { r: 0, c: 2, kind: 'fog', ruin: 0 },
          task: { prompt: 'der Stift', dir: 'de_en', stage: 'type', options: [] } });
  antworte(root, document, 'school');
  await wait(40);
  ok('Serie 2 von 3', chip.hidden === false &&
     root.querySelector('[data-part="streakn"]').textContent === '2' &&
     root.querySelector('[data-part="streakgoal"]').textContent === '/3',
     chip.textContent.trim());
  ok('noch eine: es wird wärmer, brennt aber nicht',
     chip.classList.contains('is-near') && !chip.classList.contains('is-hot'));

  /* ── Die Tastatur geht weg, wenn die Karte aufgeht ───────────
     Sönke, 16.09.2026: „Wenn sich die Map öffnet, um eine Streak oder
     einen Effekt zu nutzen, dann muss sich die Tastatur schließen."

     Sichtbar ist das hier nur an zwei Aufrufen: linkedom kennt kein
     `activeElement`, wohl aber `focus()`/`blur()`. Gezählt wird
     deshalb, wer gerufen wird — und die zweite Zusage ist die
     wichtigere: NACH dem blur darf niemand den Fokus zurückholen.
     Genau das tat das Werkzeug bis zum 16.09.2026, in der finally-
     Zeile von `send` (feldHer), einen Wimpernschlag nach dem
     Aufgehen des Kastens. */
  const feld = root.querySelector('.wi-in');
  let blurs = 0, fokus = 0;
  const echtBlur = feld.blur.bind(feld), echtFokus = feld.focus.bind(feld);
  feld.blur  = () => { blurs++; echtBlur(); };
  feld.focus = () => { fokus++; echtFokus(); };

  /* Serie → freie Wahl */
  reply({ ok: true, result: 'correct', streak: 3, picks: 1, tile: null,
          task: { prompt: 'das Buch', dir: 'de_en', stage: 'type', options: [] } });
  antworte(root, document, 'pen');
  await wait(40);
  ok('der Wahl-Kasten schickt die Tastatur weg', blurs === 1, `blur ×${blurs}`);
  ok('… und niemand holt sie gleich wieder', fokus === 0, `focus ×${fokus}`);
  ok('bei drei brennt es', chip.classList.contains('is-hot') &&
     !chip.classList.contains('is-near'), chip.textContent.trim());
  ok('… und zählt sofort zur SECHS weiter (0148)',
     root.querySelector('[data-part="streakn"]').textContent === '3' &&
     root.querySelector('[data-part="streakgoal"]').textContent === '/6',
     chip.textContent.trim());
  ok('Karte ist scharf', root.querySelector('.wi-map').classList.contains('is-picking'));

  /* Die vierte richtige bringt KEINE Wahl mehr (0148) — das
     Abzeichen zählt zur sechs weiter und hört auf zu brennen. Genau
     hier stand Sönkes Meldung: „gerade habe ich bei allem > 3 eine
     Streak". Die Wahl von eben bleibt offen, deshalb picks weiter 1. */
  reply({ ok: true, result: 'correct', streak: 4, picks: 1, tile: { r: 0, c: 3, kind: 'fog', ruin: 0 },
          task: { prompt: 'das Heft', dir: 'de_en', stage: 'type', options: [] } });
  antworte(root, document, 'book');
  await wait(40);
  ok('Serie 4 zeigt 4/6 und brennt nicht mehr',
     !chip.classList.contains('is-hot') &&
     root.querySelector('[data-part="streakn"]').textContent === '4' &&
     root.querySelector('[data-part="streakgoal"]').textContent === '/6',
     chip.textContent.trim());

  /* ── Der Wahl-Kasten geht von selbst auf ─────────────────────
     Sönke: „Sobald ich eine Streak habe, öffnet sich das Feld." Und
     die Karte ist DIESELBE — sie hängt jetzt im Kasten und nicht
     mehr in der eingebetteten Hülle. */
  const ov = root.querySelector('[data-part="pickov"]');
  ok('Wahl-Kasten steht offen', ov.hidden === false);
  ok('und die Karte hängt darin',
     root.querySelector('[data-part="pickwrap"] .wi-map') === root.querySelector('.wi-map'));

  /* ── Wenig Text, klare Worte, große Zahl (15.09.2026) ────────
     Sönke: „Die Info, was ich auf dem Streak- oder Ruinen-Effekt-
     Bildschirm machen muss, ist nicht gut lesbar. Hier muss wenig
     Text sein und klare Worte. Und die Zahl groß. ‚Nimm 1 Feld
     gezielt ein!' (die 1 größer)."

     Geprüft wird der ganze Satz und nicht ein Wort daraus: „wenig
     Text" ist die Zusage, und ein zweiter Satz, der sich
     dazuschleicht, fiele sonst niemandem auf. */
  const gross = root.querySelector('[data-part="pickbig"]');
  ok('die Ansage ist EIN Satz mit der Zahl darin',
     gross.textContent.replace(/\s+/g, ' ') === 'Nimm 1 Feld gezielt ein!',
     gross.textContent);
  /* Die Ziffer ist ein eigener Knoten — nur so kann sie größer sein
     als der Satz drumherum. Eine „1" im Fließtext wäre genau das,
     was gemeldet war. */
  const ziffer = gross.querySelector('.wi-picknum');
  ok('und die Ziffer steht als eigener Knoten da',
     !!ziffer && ziffer.textContent === '1', gross.innerHTML);
  ok('bei der gewöhnlichen Serie steht nichts darüber',
     root.querySelector('[data-part="picktitle"]').textContent === '',
     root.querySelector('[data-part="picktitle"]').textContent);
  const hinweis = root.querySelector('[data-part="pickhint"]').textContent;
  ok('der Handgriff steht klein darunter, in einem kurzen Satz',
     /markiertes Feld/.test(hinweis) && hinweis.length <= 34, hinweis);

  /* ── Die erreichbaren Felder sind markiert, der Nebel bleibt ──
     Beides gehört zusammen: markiert wird, WELCHES Feld geht, und
     zwar ohne zu verraten, was darunter liegt. Feld 0 gehört dem
     eigenen Volk (OWN_START), Feld 1 und 5 grenzen daran — aber Feld
     0 ist der Landeplatz und darf selbst nicht markiert sein. */
  const marken = root.querySelectorAll('.wi-mark');
  ok('erreichbare Felder markiert', marken.length > 0, `${marken.length}`);
  ok('Marken liegen ÜBER dem Nebel',
     [...root.querySelectorAll('.wi-map > g')].findIndex(g => g.classList.contains('wi-marks')) >
     [...root.querySelectorAll('.wi-map > g')].findIndex(g => g.classList.contains('wi-fog')));
  /* Und die Marken nehmen keinen Fingertipp weg — sie liegen genau
     dort, wohin gezielt wird. Geprüft wird die Regel in tool.css,
     weil man das im DOM nicht sieht. */
  const css = fs.readFileSync(path.join(HERE, '..', 'tool.css'), 'utf8');
  ok('Markenschicht ist für Zeiger durchlässig',
     /\.wi-marks[^{]*\{[^}]*pointer-events:\s*none/.test(css.replace(/\n/g, ' ')));
  /* „Die 1 größer" ist eine Aussage über die CSS und im DOM nicht zu
     sehen: die Ziffer muss ein Vielfaches der Satzgröße tragen. In
     `em` gemessen, damit die Zusage auch dann hält, wenn der Satz
     selbst eines Tages anders groß ist. */
  const zifferGross = /\.wi-picknum[^{]*\{[^}]*font-size:\s*([\d.]+)em/
    .exec(css.replace(/\n/g, ' '));
  ok('die Ziffer ist größer als der Satz um sie herum',
     !!zifferGross && parseFloat(zifferGross[1]) >= 1.6,
     zifferGross ? zifferGross[1] + 'em' : 'keine Regel');
  /* ⚠️ Die Kernzusage dieses Tages: der Nebel wird beim Wählen NICHT
     aufgehellt (Sönke: „Der Nebel ist nicht weg! Der bleibt."). Eine
     Regel, die .wi-fog beim Wählen durchsichtig macht, verrät genau
     das, was der Nebel verbergen soll. */
  ok('der Nebel bleibt beim Wählen stehen',
     !/is-picking[^{]*\.wi-fog/.test(css));

  const target = root.querySelectorAll('.wi-cell')[1];
  click(target, document);
  await wait(40);
  const pick = calls.find(([fn]) => fn === 'wi_pick_tile');
  ok('freie Wahl schickt r/c', !!pick && pick[1].p_r === 0 && pick[1].p_c === 1,
     JSON.stringify(pick && pick[1]));
  ok('Kasten geht mit der verbrauchten Wahl zu', ov.hidden === true);
  ok('und die Karte ist wieder eingebettet',
     root.querySelector('[data-part="mapwrap"] .wi-map') === root.querySelector('.wi-map'));
  /* Und erst JETZT darf die Tastatur zurück — sonst wäre das
     Wegschicken oben nur eine Schikane. */
  ok('nach dem Schließen ist das Feld wieder dran', fokus > 0, `focus ×${fokus}`);
  ok('ohne Wahl keine Marken', root.querySelectorAll('.wi-mark').length === 0);

  /* Falsch → Lösung und Sperre */
  reply({ ok: true, result: 'wrong', streak: 0, picks: 0, solution: 'book',
          locked_for: 2, task: { prompt: 'das Heft', dir: 'de_en', stage: 'type', options: [] } });
  antworte(root, document, 'blubb');
  await wait(40);
  ok('Lösung wird gezeigt', /book/.test(root.querySelector('.wi-fb').textContent));
  /* Gesperrt heißt seit 11.09.2026 `is-locked` und nicht mehr
     `disabled`: das Feld behält den Fokus, damit auf dem Handy
     zwischen zwei Fragen nicht die Tastatur ein- und ausfährt. */
  ok('Eingabe gesperrt', root.querySelector('.wi-in').classList.contains('is-locked'));

  tool.unmount();
  ok('unmount ohne Krach', true);
}

/* ═══════════════════════════════════════════════════════════
   Tablet — Wartetafel und Countdown (0133)
   ═══════════════════════════════════════════════════════════ */
async function testTabletLobby() {
  console.log('\n— Tablet: Wartetafel —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  let phase = 'lobby';
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        if (fn !== 'wi_view') return Promise.resolve({ ok: false, error: 'not_allowed' });
        return Promise.resolve(viewFor({
          phase,
          // Wie der echte Server: in der Lobby steht das Board, aber
          // noch keine Insel — `map` ist dann eine LEERE Liste.
          map_key: 'raum:' + phase,
          map: args.p_full ? (phase === 'running' ? MAP : []) : null,
          // Vier Völker, und zwar die HINTEREN: Slot 0 ist damit Volk 4
          // (Kosmische Katzen), nicht die Toast-Ritter.
          team_count: 4, factions: [2, 3, 4, 5],
          teams: [{ i: 0, tiles: 0, ruins: 0, score: 0, people: 3 },
                  { i: 1, tiles: 0, ruins: 0, score: 0, people: 2 },
                  { i: 2, tiles: 0, ruins: 0, score: 0, people: 2 },
                  { i: 3, tiles: 0, ruins: 0, score: 0, people: 2 }],
          countdown_ends_at: phase === 'countdown'
            ? new Date(Date.now() + 4000).toISOString() : null
        }, /* Eine Serie und zwei offene Wahlen aus der Runde davor —
              gebraucht für die Zusage „in der Lobby geht nichts auf". */
           { streak: 3, picks: 2 }));
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  ok('Wartetafel offen', root.querySelector('[data-part="tlobby"]').hidden === false);
  ok('Spieltafel zu',    root.querySelector('[data-part="tplay"]').hidden === true);
  const mine = root.querySelector('.wi-lteam--mine');
  ok('eigenes Volk als Spalte', !!mine);
  ok('Slot 0 ist das gewählte Volk',
     /Brokkoli-Giraffen/.test(mine.textContent), mine.querySelector('.wi-lteamname').textContent.trim());
  ok('Namen der Gruppe stehen da', /Ada/.test(mine.textContent) && /Cem/.test(mine.textContent));
  ok('„du" ist markiert', mine.querySelector('.wi-lteamme').textContent === 'Tablet 3');
  ok('Abwesender ist markiert', mine.querySelector('.wi-lteamoff').textContent === 'Cem');
  ok('Kopfzahl vom Server', mine.querySelector('.wi-lteamn').textContent === '3');
  ok('die anderen drei Völker', root.querySelectorAll('.wi-other').length === 3);
  ok('keine fremden Namen', !/Ada/.test(root.querySelector('[data-part="others"]').textContent));
  ok('Hinweis auf Abwesende',
     /5 von 6/.test(root.querySelector('[data-part="onlinehint"]').textContent));

  /* ── Das Üben im Raum ist WEG (20.09.2026) ───────────────────
     Sönkes Ansage: „die Funktion ‚Vokabeln in der Lobby üben‘ … muss
     raus." Wer im Raum wartet, wartet; geübt wird auf der eigenen
     Insel (Rolle `solo`). Der Prüfstand hält beides fest — den
     verschwundenen Knopf UND die Folge daraus: in der Lobby ist die
     Spieltafel zu, obwohl der Server eine Serie und zwei offene
     Wahlen meldet. (Genau die waren früher der Grund für einen
     Wahl-Kasten über einer leeren Karte.) */
  ok('kein Üben-Knopf auf der Wartetafel',
     root.querySelector('[data-part="practice"]') === null);
  ok('und kein Zurück-Knopf mehr', root.querySelector('[data-part="back"]') === null);
  ok('die Spieltafel bleibt in der Lobby zu',
     root.querySelector('[data-part="tplay"]').hidden === true);
  ok('und der Wahl-Kasten auch',
     root.querySelector('[data-part="pickov"]').hidden === true &&
     root.querySelector('[data-part="pickback"]').hidden === true);

  /* Countdown */
  phase = 'countdown';
  await tool.update();
  await wait(300);
  ok('Countdown-Tafel offen', root.querySelector('[data-part="tcount"]').hidden === false);
  ok('Wartetafel zu',         root.querySelector('[data-part="tlobby"]').hidden === true);
  ok('Zahl läuft',            /^[0-5]$|Los/.test(root.querySelector('[data-part="big"]').textContent),
     root.querySelector('[data-part="big"]').textContent);

  /* Und los: die Insel muss in der Farbe des GEWÄHLTEN Volkes stehen */
  phase = 'running';
  await tool.update();
  await wait(80);
  ok('Spieltafel offen', root.querySelector('[data-part="tplay"]').hidden === false);
  ok('Slot 0 wird als Volk 2 gemalt',
     root.querySelector('.wi-cell').dataset.t === '2',
     root.querySelector('.wi-cell').dataset.t);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Neue Runde: andere Insel
   ═══════════════════════════════════════════════════════════ */
async function testNewRound() {
  console.log('\n— Neue Runde —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const MAP2 = island(3, 3);
  let round = 1;
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        if (fn !== 'wi_view') return Promise.resolve({ ok: false, error: 'not_allowed' });
        const m = round === 1 ? MAP : MAP2;
        return Promise.resolve(viewFor({
          map_key: 'raum:' + round,
          map: args.p_full ? m : null,
          own: '0' + '.'.repeat(m.length - 1)
        }));
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  ok('erste Insel steht', root.querySelectorAll('.wi-cell').length === MAP.length);

  round = 2;
  await tool.update();
  await wait(80);
  ok('zweite Insel ersetzt die erste',
     root.querySelectorAll('.wi-cell').length === MAP2.length,
     `${root.querySelectorAll('.wi-cell').length}`);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Die Reliefkarte mit Tonstufen-Nebel (08.09.2026)
   ═══════════════════════════════════════════════════════════
   Übernommen aus showroom.html. Geprüft wird das, was hier
   lautlos kaputtgehen kann und dann trotzdem „eine Karte" ergibt:

     · Jede Kachel ist eine SÄULE — Deckfläche und Seitenfläche.
     · Erobertes Land steht HÖHER als verhülltes. Das ist die
       ganze Idee des Reliefs; fällt sie aus, sieht man es nicht,
       man merkt es nur daran, dass nichts mehr passiert.
     · Die Deckfläche trägt eine GEMISCHTE Farbe (Boden × Volk)
       und nicht die nackte Volksfarbe. Eine CSS-Regel auf `fill`
       würde genau das kaputtmachen, und zwar unsichtbar für
       jeden Test, der nur data-t prüft.
     · Die Tonstufen sind drei ineinanderliegende Maskenschichten.
       Wäre die unterste kleiner als der Nebel, bliebe außen ein
       unmaskierter Streifen stehen — ausgerechnet der, der am
       durchsichtigsten sein soll.
     · Nirgends NaN. Ein SVG-Attribut mit NaN wird still verworfen,
       und dann fehlt einfach ein Stück Karte.                  */
async function testRelief() {
  console.log('\n— Reliefkarte —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  /* Eine RUNDE Insel und kein Rechteck. Das ist kein Schönheits-
     wunsch: der Server baut runde (wi_build_island, Umriss aus drei
     Wellen), und mehreres an der Karte hängt genau daran — die
     Küstenringe, die Tiefenstufen, und vor allem das offene Wasser
     in den Ecken des Ausschnitts, in dem die Wellen liegen. Ein
     Rechteck füllt seinen eigenen Ausschnitt aus und hat gar keins. */
  const BIG = rundeInsel(7);
  let own = '0' + '.'.repeat(BIG.length - 1);
  /* ⚠️ PULT-Rolle, seit dem 16.09.2026. Bis dahin lief dieser
     Prüfstand am Tablet — dort gibt es das Relief nicht mehr (siehe
     testFlach). Die Karte selbst ist dieselbe Funktion, nur der
     Schalter `mini` unterscheidet sie, und der hängt an der Rolle. */
  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => fn === 'wi_room_get'
        ? Promise.resolve(pultView({ map: args.p_full ? BIG : null, own }))
        : Promise.resolve({ ok: true })
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  const tops = [...root.querySelectorAll('.wi-cell')];
  ok('jede Kachel eine Säule',
     tops.length === BIG.length && root.querySelectorAll('.wi-side').length === BIG.length,
     `${tops.length} Deck / ${root.querySelectorAll('.wi-side').length} Seite`);

  /* Der Meeresgrund: vier Tiefenlinien, jede in drei Lagen
     (zwei Kanten und die Fläche). Dazu Brandung und Wellen. */
  ok('vier Tiefenstufen im Wasser',
     root.querySelectorAll('.wi-sea > path').length === 13,   // 12 Stufen + Schaumlinie
     `${root.querySelectorAll('.wi-sea > path').length}`);
  ok('Brandung an der Küste', root.querySelectorAll('.wi-surf').length > 8,
     `${root.querySelectorAll('.wi-surf').length}`);
  /* Die Prüfinsel ist ein RECHTECK und füllt ihren eigenen
     Ausschnitt aus — offenes Wasser gibt es hier fast nur um die
     Schiffsplätze herum, und weiter als 3.4 Kacheln von jedem Feld
     weg passt kaum etwas. Auf einer runden Insel sind es zwanzig.
     Geprüft wird deshalb nur, DASS Wellen entstehen. */
  ok('Wellen auf hoher See', root.querySelectorAll('.wi-swell').length > 0,
     `${root.querySelectorAll('.wi-swell').length}`);

  const yOf = p => {
    const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(p.getAttribute('d') || '');
    return m ? +m[2] : NaN;
  };
  /* Ein Feld im Landesinneren, einmal im Nebel und einmal erobert.
     DASSELBE Feld, damit nur die Höhe den Unterschied macht: der
     Strand am Rand steht ohnehin niedriger als die Mitte, ein
     Vergleich zweier verschiedener Felder verglich also auch das.
     Genommen wird das innerste — dort ist der Aufstand am größten. */
  const mitte = BIG.reduce((best, z, i) => {
    const d = Math.hypot(z[1] + 0.5 * (((z[0] % 2) + 2) % 2), z[0] * 0.8660254);
    return d < best.d ? { i, d } : best;
  }, { i: 0, d: Infinity }).i;
  const innen = tops.find(p => +p.dataset.r === BIG[mitte][0] && +p.dataset.c === BIG[mitte][1]);
  const yVorher = yOf(innen);

  const fill0 = tops[0].getAttribute('fill');
  ok('Deckfläche ist gemischt, nicht die nackte Volksfarbe',
     /^#[0-9a-f]{6}$/.test(fill0) && fill0 !== '#ef4444', fill0);

  /* ── Die Tonstufen ─────────────────────────────────────────
     Jede Maskenschicht ist eine Vereinigung von Sechsecken; jedes
     Sechseck fängt mit einem M an, also zählt das die Felder. */
  const felder = d => ((d || '').match(/M/g) || []).length;
  const lagen = [...root.querySelectorAll('mask path')].map(p => felder(p.getAttribute('d')));
  ok('drei Tonstufen', lagen.length === 3, JSON.stringify(lagen));
  ok('Stufen liegen ineinander (außen groß, Kern klein)',
     lagen[0] > lagen[1] && lagen[1] > lagen[2] && lagen[2] > 0, JSON.stringify(lagen));
  ok('unterste Stufe deckt sich mit dem Nebel',
     lagen[0] === felder(root.querySelector('.wi-fogbody').getAttribute('d')),
     `${lagen[0]} vs ${felder(root.querySelector('.wi-fogbody').getAttribute('d'))}`);

  /* Und der Nebel muss WANDERN: nimmt die Klasse Land, schrumpft
     jede Schicht mit. Eine Stufenrechnung, die nur beim Aufbau
     läuft, sähe beim ersten Blick richtig aus und stünde danach
     für den Rest der Runde still. */
  own = BIG.map((z, i) => (i < 30 || i === mitte) ? '0' : '.').join('');
  await tool.update();
  await wait(60);
  const spaeter = [...root.querySelectorAll('mask path')].map(p => felder(p.getAttribute('d')));
  ok('Nebelrand wandert mit dem Fortschritt',
     spaeter[0] < lagen[0] && spaeter[1] < lagen[1], JSON.stringify(spaeter));

  /* Und dasselbe Feld steht jetzt auf. Das ist die ganze Idee des
     Reliefs — fällt sie aus, sieht man keinen Fehler, es passiert
     nur nichts mehr. */
  ok('erobertes Land steht höher als verhülltes',
     yOf(innen) < yVorher - .25, `${yOf(innen)} statt ${yVorher}`);
  ok('und bekommt eine Seitenfläche',
     (root.querySelectorAll('.wi-side')[0].getAttribute('d') || '').length > 20);

  /* Nirgends NaN, undefined oder null — ein SVG-Attribut mit so
     einem Wert wird still verworfen, und dann fehlt ein Stück
     Karte, ohne dass irgendwo ein Fehler steht. */
  let kaputt = null;
  for (const n of root.querySelectorAll('.wi-map *')) {
    for (const a of (n.attributes || [])) {
      if (/NaN|undefined|(^|[^-\w])null([^-\w]|$)/.test(a.value)) {
        kaputt = `${n.tagName}.${a.name}="${a.value}"`; break;
      }
    }
    if (kaputt) break;
  }
  ok('keine kaputten Attribute im SVG', !kaputt, kaputt || '');

  /* ── Die Schiffe liegen längsseits ─────────────────────────
     Sönke, 09.09.2026: „die schiffe (gerade an der oberen kante)
     sind viel zu weit vom festland entfernt."

     Die Ursache war die Verankerung. Ein Bildkasten dreht in SVG
     nicht mit: hing er UNTER dem Anker, lag der Schiffskörper immer
     oberhalb davon — im Norden zeigte er von der Insel weg und
     stand scheinbar doppelt so weit draußen, im Süden ragte er
     über das Land. Geprüft wird deshalb nicht ein Abstand (der war
     schon vorher „richtig"), sondern dass der Kasten UM seinen
     Anker steht. Nur dann heißt der Abstand in alle sechs
     Richtungen dasselbe. */
  const schiffe = [...root.querySelectorAll('.wi-ship')];
  ok('ein Schiff je Landeplatz', schiffe.length === 4, `${schiffe.length}`);

  let schief = null, weiten = [];
  for (const s of schiffe) {
    const t = /translate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(s.getAttribute('transform') || '');
    const im = s.querySelector('.wi-shipimg');
    const bx = +im.getAttribute('x'), by = +im.getAttribute('y');
    const bw = +im.getAttribute('width'), bh = +im.getAttribute('height');
    if (Math.abs(bx + bw / 2) > .01 || Math.abs(by + bh / 2) > .01) {
      schief = `x=${bx} y=${by} ${bw}×${bh}`;
    }
    // Abstand Anker ↔ Landeplatz. Das Landefeld ist das nächstgelegene.
    let nah = Infinity;
    for (const p of tops) {
      const z = BIG[+p.dataset.i];
      const x = z[1] + 0.5 * (((z[0] % 2) + 2) % 2), y = z[0] * 0.8660254;
      if (z[3]) nah = Math.min(nah, Math.hypot(x - +t[1], y - +t[2]));
    }
    weiten.push(Math.round(nah * 100) / 100);
  }
  ok('Bildkasten steht um den Anker, nicht darüber', !schief, schief || '');
  ok('und jedes Schiff gleich weit vor seinem Landeplatz',
     Math.max(...weiten) - Math.min(...weiten) < .01 && Math.max(...weiten) <= 2.05,
     JSON.stringify(weiten));

  /* ── Der Grenzstrich ───────────────────────────────────────
     Er gehört seit dem 16.09.2026 ausschließlich hierher: am Tablet
     ist die Karte flach und zieht stattdessen einen Rahmen um das
     ganze Gebiet (testBesitzKlar). Im Relief geht das nicht — jede
     Kachel steht auf ihrer eigenen Höhe, ein gemeinsamer Umriss
     liefe quer durch die Säulen.

     Gezogen wird an den Kanten zu FREMDEM (Nebel, Meer, anderes
     Volk) und nirgends sonst: `own` ist hier „Feld 0 gehört Slot 0,
     alles andere Nebel", also müssen alle sechs Kanten stehen. */
  const striche = [...root.querySelectorAll('.wi-cell')].map(c => {
    const e = c.parentNode.querySelector('.wi-edge');
    return { t: c.dataset.t, n: e ? ((e.getAttribute('d') || '').match(/M/g) || []).length : 0 };
  });
  ok('erobertes Land zieht einen Grenzstrich',
     striche.some(s => s.t !== '.' && s.n > 0));
  ok('ein Nebelfeld bekommt keinen', striche.every(s => s.t !== '.' || s.n === 0));
  ok('und keiner zieht mehr als sechs Kanten', striche.every(s => s.n <= 6),
     JSON.stringify(striche.filter(s => s.n > 6).slice(0, 3)));

  tool.unmount();
}

/* ══════════════════════════════════════════════════════════
   Das Wörter-Fenster mit Units (15.09.2026, Migration 0150)
   ══════════════════════════════════════════════════════════
   Dieselbe Gliederung wie in der Leiste der Insel, nur in der
   Optik des Pults. Sönke wollte sie ausdrücklich in BEIDEN Rollen.

   Ein eigenes, schlankes Pult statt testPult zu erweitern: dort
   hängen dreißig Zusagen an drei Sätzen OHNE Units, und die sind
   der Rückfallweg (Datenbank ohne 0150) — den will ich nicht
   verlieren, indem ich ihm Units unterschiebe. */
async function testPultUnits() {
  console.log('\n— Wörter-Fenster mit Units —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  const calls = [];
  let gewaehlt = ['b1'];

  const SETS = [
    { id: 'a1', title: 'Station 1 — Schule', count: 30, mine: '0',
      unit: 'u-test', utitle: 'Test', grade: 5, island: 'en:5', station: 1 },
    { id: 'a2', title: 'Station 2 — Zuhause', count: 30, mine: '0',
      unit: 'u-test', utitle: 'Test', grade: 5, island: 'en:5', station: 2 },
    { id: 'a3', title: 'Station 3 — Essen', count: 30, mine: '0',
      unit: 'u-test', utitle: 'Test', grade: 5, island: 'en:5', station: 3 },
    { id: 'b1', title: 'Food', count: 24, mine: '0',
      unit: 'u-food', utitle: 'Food', grade: 6, island: 'en:6', station: 1 }
  ];

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_sets_list') {
          return Promise.resolve({ ok: true, chosen: gewaehlt.slice(), sets: SETS });
        }
        if (fn === 'wi_room_setup') {
          if (args.p_sets) gewaehlt = args.p_sets.slice();
          return Promise.resolve({ ok: true });
        }
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type',
            direction: 'mixed', team_count: 2, factions: [0, 1], duration: 600,
            radius: 5, seed: 1, teams: [], map_key: 'raum:lobby', map: [],
            own: '', ends_at: null, countdown_ends_at: null, winner_team: null,
            sets: gewaehlt.slice(), online_count: 0, room_total: 0, people: []
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  click(root.querySelector('[data-part="setsbtn"]'), document);
  await wait(20);

  /* ── Die Reiter: ein Jahrgang je Reiter (20.09.2026) ─────────
     Sönke: „beim Lehrer am Board sollen oben statt Units Jhg 5,
     Jhg 6, … eigene stehen." Bis dahin waren es zwei feste Reiter
     und eine graue Zwischenüberschrift je Jahrgang. */
  const reiter = () => [...root.querySelectorAll('.wi-tab')];
  const namen = reiter().map(b => b.textContent.trim());
  ok('drei Reiter: zwei Jahrgänge und „Eigene"',
     namen.length === 3, JSON.stringify(namen));
  ok('… und sie nennen den Jahrgang kurz',
     namen[0] === 'Jhg 5' && namen[1] === 'Jhg 6' && namen[2] === 'Eigene',
     JSON.stringify(namen));
  /* „Eigene" steht da, obwohl es keine einzige eigene Liste gibt:
     er ist der Weg zum Einfügeformular. */
  ok('„Eigene" steht auch ohne eine einzige eigene Liste da',
     namen[2] === 'Eigene', JSON.stringify(namen));
  ok('der erste Jahrgang liegt vorn',
     reiter()[0].classList.contains('is-on'), reiter()[0].className);
  /* Die Überschrift IM Fenster ist damit weg — sie wiederholte nur
     den Reiter, unter dem sie hing. */
  ok('keine Jahrgangs-Überschrift mehr in der Liste',
     root.querySelectorAll('.wi-sgrp').length === 0,
     String(root.querySelectorAll('.wi-sgrp').length));

  /* ── Was unter dem Reiter steht ───────────────────────────── */
  const kisten = root.querySelectorAll('.wi-sunit');
  ok('genau EINE Unit ist aufklappbar', kisten.length === 1, String(kisten.length));
  ok('… mit ihren drei Stationen als Kacheln',
     kisten[0].querySelectorAll('.wi-sstats .wi-set').length === 3,
     String(kisten[0].querySelectorAll('.wi-sstats .wi-set').length));
  ok('die Unit-Zeile zählt Stationen und Wörter',
     /3 Stationen/.test(kisten[0].textContent) && /90 Wörter/.test(kisten[0].textContent),
     kisten[0].querySelector('.wi-suall span').textContent);
  /* ⚠️ Der andere Jahrgang ist NICHT da. Das ist der ganze Zweck:
     bei zwei Lehrwerksbänden lägen sonst fünfundsiebzig Stationen
     untereinander in einem scrollenden Kasten. */
  ok('der zweite Jahrgang steht nicht mit im Fenster',
     root.querySelectorAll('.wi-srow > .wi-set').length === 0,
     String(root.querySelectorAll('.wi-srow > .wi-set').length));

  /* Und auf seinem Reiter steht er — als einzelne Kachel, genau wie
     das ganze Fenster vor 0150 aussah. Ein Reiterwechsel ist eine
     Ansichtssache: er darf nichts an den Server schicken. */
  const vorWechsel = calls.filter(c => c[0] === 'wi_room_setup').length;
  click(reiter()[1], document);
  await wait(20);
  ok('der zweite Reiter zeigt die Unit am Stück als einzelne Kachel',
     root.querySelectorAll('.wi-srow > .wi-set').length === 1,
     String(root.querySelectorAll('.wi-srow > .wi-set').length));
  ok('… und den ersten Jahrgang nicht mehr',
     root.querySelectorAll('.wi-sunit').length === 0,
     String(root.querySelectorAll('.wi-sunit').length));
  ok('ein Reiterwechsel schickt nichts an den Server',
     calls.filter(c => c[0] === 'wi_room_setup').length === vorWechsel);
  /* Das Einfügeformular gehört zu „Eigene" — bei einem Lehrwerk gibt
     es nichts einzufügen. */
  ok('das Einfügeformular ist auf einem Jahrgangs-Reiter zu',
     root.querySelector('[data-part="import"]').hidden === true);
  click(reiter()[2], document);
  await wait(20);
  ok('… und auf „Eigene" offen',
     root.querySelector('[data-part="import"]').hidden === false);

  click(reiter()[0], document);
  await wait(20);

  /* ── Auf- und Zuklappen ─────────────────────────────────────
     ⚠️ Frisch gesucht und nicht `kisten` von oben: der Reiterwechsel
     hat das Fenster neu geschrieben, die alten Knoten hängen an
     nichts mehr. */
  ok('bei wenigen Stationen steht sie offen',
     root.querySelector('.wi-sunit .wi-sstats').hidden === false);
  const rufeVorher = calls.filter(c => c[0] === 'wi_room_setup').length;
  click(root.querySelector('.wi-sunit [data-sauf]'), document);
  await wait(20);
  ok('der Pfeil klappt die Stationen zu',
     root.querySelector('.wi-sstats').hidden === true);
  /* ⚠️ Zuklappen ist eine Ansichtssache und keine Auswahl. Ginge es
     an den Server, verlöre die Lehrkraft beim Aufräumen ihre
     Wörter. */
  ok('… ohne etwas an den Server zu schicken',
     calls.filter(c => c[0] === 'wi_room_setup').length === rufeVorher);
  click(root.querySelector('[data-sauf]'), document);
  await wait(20);
  ok('und wieder auf', root.querySelector('.wi-sstats').hidden === false);

  /* ── Der Sammelschalter ───────────────────────────────────── */
  click(root.querySelector('[data-sall]'), document);
  await wait(30);
  let letzte = calls.filter(c => c[0] === 'wi_room_setup').pop();
  ok('der Sammelschalter geht an den Server', !!letzte && !!letzte[1].p_sets,
     JSON.stringify(letzte && letzte[1]));
  ok('… und wählt ALLE drei Stationen auf einmal',
     ['a1', 'a2', 'a3'].every(x => letzte[1].p_sets.includes(x)),
     JSON.stringify(letzte[1].p_sets));
  /* ⚠️ Nach außen bleibt es eine FLACHE Liste von Satz-Nummern.
     Der Server kennt keine Units (wi_room_sets ist set-basiert),
     und eine Unit-Nummer darin wäre dort ein Fremdkörper. */
  ok('… als flache Liste von Satz-Nummern, ohne Unit-Nummer',
     letzte[1].p_sets.every(x => /^[ab]\d$/.test(x)),
     JSON.stringify(letzte[1].p_sets));
  ok('die Unit-Zeile ist danach ganz an',
     root.querySelector('.wi-suhead').classList.contains('is-on'));

  /* Eine einzelne Station abwählen macht die Unit „teilweise". */
  click(root.querySelector('.wi-sstats .wi-set'), document);
  await wait(30);
  const kopf = root.querySelector('.wi-suhead');
  ok('eine Station ab macht die Unit „teilweise"',
     kopf.classList.contains('is-halb') && !kopf.classList.contains('is-on'),
     kopf.className);
  ok('… und die Zeile sagt, wie viele gewählt sind',
     /2 gewählt/.test(kopf.textContent),
     kopf.querySelector('.wi-suall span').textContent);

  tool.unmount();

  /* ── Die Klapp-Vorgabe gilt je REITER ───────────────────────
     Ein großer Band klappt zu, damit die Lehrkraft ihre Unit nicht
     im Gescrolle sucht (SETS_AUF_MAX). Gerechnet wurde das bis zum
     20.09.2026 über ALLES Mitgelieferte — und das ist falsch, seit
     jeder Band seinen eigenen Reiter hat: der kleine Band stünde
     zugeklappt da, nur weil daneben ein großer existiert, den man
     gerade gar nicht sieht. */
  const eng = makeEnv();
  const VIELE = [];
  for (let i = 1; i <= 7; i++) {
    VIELE.push({ id: 'g' + i, title: 'Station ' + i, count: 10, mine: '0',
                 unit: 'u-gross', utitle: 'Großer Band', grade: 5,
                 island: 'en:5', station: i });
  }
  VIELE.push(
    { id: 'h1', title: 'Station 1', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 1 },
    { id: 'h2', title: 'Station 2', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 2 },
    { id: 'h3', title: 'Station 3', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 3 },
    { id: 'h4', title: 'Station 4', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 4 },
    { id: 'h5', title: 'Station 5', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 5 },
    { id: 'h6', title: 'Station 6', count: 10, mine: '0', unit: 'u-klein',
      utitle: 'Auch groß', grade: 5, island: 'en:5', station: 6 },
    /* Der kleine Band: EINE Unit mit zwei Stationen. Allein läge er
       weit unter der Schwelle. */
    { id: 'k1', title: 'Station 1', count: 10, mine: '0', unit: 'u-jg6',
      utitle: 'Kleiner Band', grade: 6, island: 'en:6', station: 1 },
    { id: 'k2', title: 'Station 2', count: 10, mine: '0', unit: 'u-jg6',
      utitle: 'Kleiner Band', grade: 6, island: 'en:6', station: 2 });

  const engCtx = Object.assign({}, eng.ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: fn => {
        if (fn === 'wi_sets_list')
          return Promise.resolve({ ok: true, chosen: [], sets: VIELE });
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type',
            direction: 'mixed', team_count: 2, factions: [0, 1], duration: 600,
            radius: 5, seed: 1, teams: [], map_key: 'raum:lobby', map: [],
            own: '', ends_at: null, countdown_ends_at: null, winner_team: null,
            sets: [], online_count: 0, room_total: 0, people: []
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });
  const engRoot = eng.document.getElementById('root');
  eng.impls.wordisland.mount(engRoot, engCtx);
  await wait(60);
  click(engRoot.querySelector('[data-part="setsbtn"]'), eng.document);
  await wait(20);

  ok('der große Band startet zugeklappt',
     [...engRoot.querySelectorAll('.wi-sunit')].every(
       k => k.querySelector('.wi-sstats').hidden === true),
     [...engRoot.querySelectorAll('.wi-sunit')]
       .map(k => k.querySelector('.wi-sstats').hidden).join(','));

  const reiter6 = [...engRoot.querySelectorAll('.wi-tab')]
    .find(b => b.dataset.tab === 'jg:6');
  click(reiter6, eng.document);
  await wait(20);
  ok('… der kleine daneben aber NICHT',
     engRoot.querySelector('.wi-sunit .wi-sstats').hidden === false,
     engRoot.querySelector('.wi-sunit').className);

  eng.impls.wordisland.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Die Wörter einer Station (0154)
   ═══════════════════════════════════════════════════════════
   Sönkes Wunsch: „an jeder Station ein icon, was zu der vokabelliste
   führt … simple einfache tabelle". Geprüft wird das, was in der
   Klasse auffiele: das Zeichen ist da, es öffnet die Liste OHNE die
   Auswahl zu verändern, die Tabelle trägt jede Vokabel genau einmal,
   und der Weg zurück führt zur Auswahl und nicht hinaus. */
async function testPultWoerter() {
  console.log('\n— Wörter einer Station —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  const calls = [];
  let gewaehlt = ['a1'];

  const SETS = [
    { id: 'a1', title: 'Station 1 — Schule', count: 3, mine: '0', from: 'de', to: 'en',
      unit: 'u-test', utitle: 'Unit 1', grade: 5, island: 'en:5', station: 1 },
    { id: 'm1', title: 'Eigene Liste', count: 1, mine: '1', from: 'de', to: 'en',
      unit: 'u-m1', utitle: 'Eigene Liste', grade: null, island: null, station: 1 }
  ];
  const WOERTER = {
    a1: {
      ok: true,
      set: { id: 'a1', title: 'Station 1 — Schule', from: 'de', to: 'en',
             unit: 'u-test', utitle: 'Unit 1', grade: 5 },
      words: [
        { t: 'die Schule', x: 'school', a: [], at: [] },
        { t: 'der Schüler', x: 'pupil', a: ['student'], at: [] },
        { t: 'die Tafel', x: 'board', a: [], at: [] }
      ]
    },
    m1: { ok: true, set: { id: 'm1', title: 'Eigene Liste', from: 'de', to: 'en' },
          words: [{ t: 'das Haus', x: 'house', a: [], at: [] }] }
  };

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_sets_list')
          return Promise.resolve({ ok: true, chosen: gewaehlt.slice(), sets: SETS });
        if (fn === 'wi_set_words')
          return Promise.resolve(WOERTER[args.p_set] || { ok: false, error: 'not_found' });
        if (fn === 'wi_room_setup') {
          if (args.p_sets) gewaehlt = args.p_sets.slice();
          return Promise.resolve({ ok: true });
        }
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type',
            direction: 'mixed', team_count: 2, factions: [0, 1], duration: 600,
            radius: 5, seed: 1, teams: [], map_key: 'raum:lobby', map: [],
            own: '', ends_at: null, countdown_ends_at: null, winner_team: null,
            sets: gewaehlt.slice(), online_count: 0, room_total: 0, people: []
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  click(root.querySelector('[data-part="setsbtn"]'), document);
  await wait(20);

  /* ── Das Zeichen steht auf JEDER Kachel ─────────────────────
     Die eigenen Listen haben ihr eigenes Blatt („Eigene"), deshalb
     wird auch dort nachgesehen. */
  const kacheln = [...root.querySelectorAll('.wi-set')];
  ok('die mitgelieferte Station trägt ein Listen-Zeichen',
     kacheln.length === 1 && !!kacheln[0].querySelector('[data-peek]'),
     String(kacheln.length));

  click([...root.querySelectorAll('.wi-tab')].find(b => b.dataset.tab === 'own'), document);
  await wait(20);
  const eigene = root.querySelector('.wi-set');
  ok('die eigene Liste auch', !!eigene && !!eigene.querySelector('[data-peek]'),
     eigene && eigene.className);
  /* ⚠️ Auf eigenen Listen sitzt schon das Löschzeichen in derselben
     Ecke. Stünden beide übereinander, träfe ein Fingertipp das
     falsche — und das Falsche ist hier „endgültig löschen". */
  ok('… und beide Zeichen stehen nebeneinander, nicht übereinander',
     !!eigene && !!eigene.querySelector('[data-del]') &&
     eigene.classList.contains('wi-set--mine'),
     eigene && eigene.className);

  click([...root.querySelectorAll('.wi-tab')].find(b => b.dataset.tab === 'jg:5'), document);
  await wait(20);

  /* ── Ein Blick in die Wörter ändert die Auswahl NICHT ──────── */
  const setupVorher = calls.filter(c => c[0] === 'wi_room_setup').length;
  click(root.querySelector('.wi-set [data-peek]'), document);
  await wait(30);
  ok('das Zeichen fragt die Wörter dieser Station an',
     (calls.find(c => c[0] === 'wi_set_words') || [])[1].p_set === 'a1',
     js(calls.filter(c => c[0] === 'wi_set_words')));
  ok('… und wählt die Station dabei nicht an oder ab',
     calls.filter(c => c[0] === 'wi_room_setup').length === setupVorher);

  /* ── Die Tabelle ──────────────────────────────────────────── */
  const box = root.querySelector('[data-part="wordsbox"]');
  ok('die Wörterliste ist offen, die Auswahl dahinter zu',
     box.hidden === false && root.querySelector('[data-part="setsbox"]').hidden === true);
  ok('das Fenster selbst bleibt offen',
     root.querySelector('[data-part="setsov"]').hidden === false);
  ok('der Kopf nennt die Station',
     /Station 1/.test(root.querySelector('[data-part="wordstitle"]').textContent),
     root.querySelector('[data-part="wordstitle"]').textContent);
  ok('die Zeile darunter zählt die Wörter',
     /3 Wörter/.test(root.querySelector('[data-part="wordshint"]').textContent),
     root.querySelector('[data-part="wordshint"]').textContent);

  const zeilen = [...box.querySelectorAll('.wi-vrow')];
  ok('Spaltenkopf plus drei Zeilen', zeilen.length === 4, String(zeilen.length));
  ok('der Spaltenkopf nennt beide Sprachen',
     /Deutsch/.test(zeilen[0].textContent) && /Englisch/.test(zeilen[0].textContent),
     zeilen[0].textContent.replace(/\s+/g, ' ').trim());
  /* Der Kopf muss beim Scrollen stehen bleiben — sonst weiß bei
     vierzig Wörtern niemand mehr, welche Spalte welche ist. Dass er
     `sticky` ist, entscheidet tool.css; hier wird nur zugesagt, dass
     er die Klasse trägt, an der die Regel hängt. */
  ok('… und trägt die Klasse, an der die stehende Kopfzeile hängt',
     zeilen[0].classList.contains('wi-vhead'), zeilen[0].className);
  ok('jede Vokabel steht mit beiden Seiten da',
     /die Schule/.test(zeilen[1].textContent) && /school/.test(zeilen[1].textContent),
     zeilen[1].textContent.replace(/\s+/g, ' ').trim());
  ok('die Zeilen sind durchnummeriert',
     zeilen.slice(1).map(z => z.querySelector('.wi-vnum').textContent).join(',') === '1,2,3',
     zeilen.slice(1).map(z => z.querySelector('.wi-vnum').textContent).join(','));
  /* Nebenformen sind Inhalt: „pupil / student" steht im Import in
     EINER Zeile, und wer nur „pupil" liest, hält „student" für
     falsch. */
  ok('Nebenformen stehen klein daneben',
     /student/.test(zeilen[2].textContent) &&
     !!zeilen[2].querySelector('.wi-valt'),
     zeilen[2].textContent.replace(/\s+/g, ' ').trim());

  /* ── Zurück führt zur Auswahl, nicht hinaus ────────────────── */
  click(root.querySelector('[data-part="wordsback"]'), document);
  await wait(20);
  ok('zurück zeigt wieder die Auswahl',
     root.querySelector('[data-part="setsbox"]').hidden === false &&
     root.querySelector('[data-part="wordsbox"]').hidden === true);
  ok('… im selben Fenster',
     root.querySelector('[data-part="setsov"]').hidden === false);

  /* ── Zweiter Blick: aus dem Speicher ───────────────────────── */
  const rufe = calls.filter(c => c[0] === 'wi_set_words').length;
  click(root.querySelector('.wi-set [data-peek]'), document);
  await wait(30);
  ok('derselbe zweite Blick fragt den Server nicht noch einmal',
     calls.filter(c => c[0] === 'wi_set_words').length === rufe,
     String(calls.filter(c => c[0] === 'wi_set_words').length));
  ok('… und zeigt die Wörter trotzdem',
     root.querySelectorAll('[data-part="wordsbox"] .wi-vrow').length === 4);

  /* ── Und die Auswahl ist unversehrt ───────────────────────── */
  click(root.querySelector('[data-part="wordsclose"]'), document);
  await wait(20);
  ok('das Kreuz schließt das ganze Fenster',
     root.querySelector('[data-part="setsov"]').hidden === true);
  ok('die gewählte Station ist dieselbe geblieben',
     js(gewaehlt) === js(['a1']), js(gewaehlt));

  tool.unmount();
}

/* Fehlt 0154 in der Datenbank, sagt das Fenster genau das — und
   nicht „Fehler: fn_missing". Sonst sucht jemand eine halbe Stunde
   am Netz (Regel: feedback_missing_migration_looks_like_network). */
async function testWoerterOhneMigration() {
  console.log('\n— Wörterliste ohne Migration 0154 —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const SETS = [{ id: 'a1', title: 'Station 1', count: 3, mine: '0',
                  unit: 'u1', utitle: 'Unit 1', grade: 5, station: 1 }];
  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn) => {
        if (fn === 'wi_sets_list')
          return Promise.resolve({ ok: true, chosen: ['a1'], sets: SETS });
        if (fn === 'wi_set_words')
          return Promise.resolve({ ok: false, error: 'fn_missing' });
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type',
            direction: 'mixed', team_count: 2, factions: [0, 1], duration: 600,
            radius: 5, seed: 1, teams: [], map_key: 'raum:lobby', map: [],
            own: '', ends_at: null, countdown_ends_at: null, winner_team: null,
            sets: ['a1'], online_count: 0, room_total: 0, people: []
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  click(root.querySelector('[data-part="setsbtn"]'), document);
  await wait(20);
  click(root.querySelector('[data-peek]'), document);
  await wait(30);

  const txt = root.querySelector('[data-part="wordsbody"]').textContent;
  ok('die Meldung nennt die fehlende Migration', /0154/.test(txt), txt.trim());
  ok('… und nicht den nackten Fehlernamen', !/fn_missing/.test(txt), txt.trim());
  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Pult
   ═══════════════════════════════════════════════════════════ */
async function testPult() {
  console.log('\n— Pult —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const calls = [];
  let phase = 'lobby';
  let factions = [0, 1, 2, 3];
  let mode = 'type', direction = 'mixed', duration = 600;

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_sets_list') {
          return Promise.resolve({ ok: true, chosen: ['s1'], sets: [
            { id: 's1', title: 'Schule', count: 30, level: '5/6', mine: '0' },
            { id: 's2', title: 'Essen',  count: 30, level: '5/6', mine: '0' },
            { id: 'm1', title: 'Unit 3', count: 12, level: null,  mine: '1' }
          ] });
        }
        if (fn === 'wi_room_set_factions') {
          factions = args.p_factions.slice();
          return Promise.resolve({ ok: true, factions, team_count: factions.length });
        }
        if (fn === 'wi_room_setup') {
          if (args.p_mode) mode = args.p_mode;
          if (args.p_direction) direction = args.p_direction;
          if (args.p_duration) duration = args.p_duration;
          return Promise.resolve({ ok: true });
        }
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase, mode, direction,
            team_count: factions.length, factions, duration, radius: 5, seed: 1,
            teams: factions.map((_, i) => ({ i, tiles: i === 0 ? 4 : 2, ruins: i === 0 ? 3 : 0,
                                             score: i === 0 ? 7 : 2, people: 1 })),
            map_key: 'raum:' + phase,
            map: args.p_full ? (phase === 'lobby' ? [] : MAP) : null,
            own: phase === 'lobby' ? '' : OWN_START,
            ends_at: new Date(Date.now() + 60000).toISOString(),
            countdown_ends_at: null, winner_team: null, sets: ['s1'],
            online_count: 2, room_total: 3,
            people: [{ seat: 1, name: 'Ada', team: 0, online: true,  correct: 2, wrong: 1 },
                     { seat: 2, name: 'Bo',  team: 1, online: false, correct: 0, wrong: 0 },
                     { seat: 3, name: 'Cem', team: null, online: true, correct: 0, wrong: 0 }]
          });
        }
        if (fn === 'wi_hard_words') {
          return Promise.resolve({ ok: true, words: [{ term: 'die Tafel', trans: 'board', wrong: 5, seen: 9 }] });
        }
        // 0134: aus der Auswertung zurück in die Lobby, ohne Start.
        if (fn === 'wi_room_to_lobby') {
          phase = 'lobby';
          return Promise.resolve({ ok: true, phase: 'lobby' });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  ok('Lobby offen', root.querySelector('[data-part="lobby"]').hidden === false);

  /* ── Wappenreihe ── */
  const picks = root.querySelectorAll('.wi-pickbtn');
  /* Acht seit dem 09.09.2026 (Sönke: „ich hätte gerne 8 völker") —
     Wolken-Piraten und Spuk-Einhorn kamen ans Ende der Liste, weil
     die Nummer eines Volkes in laufenden Räumen gespeichert ist.
     Steht hier wieder 6, hat jemand eingeschoben statt angehängt. */
  ok('acht Wappen', picks.length === 8, `${picks.length}`);
  ok('die beiden neuen stehen hinten',
     picks[6].getAttribute('title') === 'Wolken-Piraten' &&
     picks[7].getAttribute('title') === 'Spuk-Einhorn',
     `${picks[6].getAttribute('title')} · ${picks[7].getAttribute('title')}`);
  ok('und die alten haben ihre Nummer behalten',
     picks[0].getAttribute('title') === 'Toast-Ritter' &&
     picks[5].getAttribute('title') === 'Okto-Pferdchen');
  ok('vier davon gewählt',
     root.querySelectorAll('.wi-pickbtn.is-on').length === 4);
  ok('Wappen tragen ihren Namen', picks[4].getAttribute('title') === 'Kosmische Katzen');

  click(picks[4], document);
  await wait(60);
  const setFac = calls.find(([fn]) => fn === 'wi_room_set_factions');
  ok('Wappen-Klick geht an den Server', !!setFac, JSON.stringify(setFac && setFac[1]));
  ok('Auswahl sortiert übergeben',
     JSON.stringify(setFac[1].p_factions) === '[0,1,2,3,4]');
  ok('fünf Wappen leuchten', root.querySelectorAll('.wi-pickbtn.is-on').length === 5);
  ok('fünf Spalten', root.querySelectorAll('.wi-lteam').length === 5,
     `${root.querySelectorAll('.wi-lteam').length}`);

  // Abwählen bis auf zwei geht, das dritte Mal nicht mehr.
  ctxBase.toasts.length = 0;
  for (const i of [4, 3, 2]) { click(root.querySelectorAll('.wi-pickbtn')[i], document); await wait(40); }
  ok('zwei Völker bleiben stehen', root.querySelectorAll('.wi-pickbtn.is-on').length === 2);
  click(root.querySelectorAll('.wi-pickbtn')[1], document);
  await wait(40);
  ok('das letzte Paar lässt sich nicht abwählen',
     root.querySelectorAll('.wi-pickbtn.is-on').length === 2 &&
     ctxBase.toasts.some(t => /Mindestens zwei/.test(t)));

  /* ── Segment-Schalter ── */
  ok('Abfrage-Modus markiert',
     root.querySelector('[data-part="modeseg"] .wi-modebtn.is-on').dataset.mode === 'type');
  ok('Richtung markiert',
     root.querySelector('[data-part="dirseg"] .wi-modebtn.is-on').dataset.dir === 'mixed');
  ok('Spieldauer markiert',
     root.querySelector('[data-part="durrow"] .wi-levelbtn.is-on').dataset.secs === '600');
  ok('Dauer erklärt sich', /Insel aus etwa/.test(root.querySelector('[data-part="durtext"]').textContent),
     root.querySelector('[data-part="durtext"]').textContent);

  click(root.querySelectorAll('[data-part="dirseg"] .wi-modebtn')[2], document);
  await wait(60);
  ok('Richtung ging raus',
     calls.some(([fn, a]) => fn === 'wi_room_setup' && a.p_direction === 'en_de'));
  ok('Richtung ist übernommen',
     root.querySelector('[data-part="dirseg"] .wi-modebtn.is-on').dataset.dir === 'en_de');

  click(root.querySelectorAll('[data-part="durrow"] .wi-levelbtn')[3], document);
  await wait(60);
  ok('Spieldauer ging raus',
     calls.some(([fn, a]) => fn === 'wi_room_setup' && a.p_duration === 1200));

  /* ── Spalten und Nachzügler ── */
  const cols = root.querySelectorAll('.wi-lteam');
  ok('Ada steht in ihrer Spalte', /Ada/.test(cols[0].textContent));
  /* In der Lobby-Spalte stand bis zum 14.09.2026 das geliehene
     Gruppenbild mit Burg aus Kingdoms („Burgen und die Teamups
     brauche ich nicht"). Jetzt das Schiff des Teams. */
  const spaltenBild = cols[0].querySelector('.wi-lteampic img').getAttribute('src') || '';
  ok('Lobby-Spalte zeigt das Schiff', /sprites\/boot\/\d\.png$/.test(spaltenBild), spaltenBild);
  /* Und die Wappenreihe zeigt die Crew auf Stufe 1 — die VÖLKER, also
     Figuren, nicht Schiffe. */
  const wappenBild = root.querySelector('.wi-pickbtn img').getAttribute('src') || '';
  ok('Wappenreihe zeigt die Crew (Stufe 1)',
     /sprites\/held\/0_1k\.png$/.test(wappenBild), wappenBild);
  ok('und der Daumennagel liegt da',
     fs.existsSync(path.join(HERE, '..', '..', '..', decodeURI(wappenBild))), wappenBild);
  ok('Bo ist als abwesend markiert',
     cols[1].querySelector('.wi-lteamoff') &&
     cols[1].querySelector('.wi-lteamoff').textContent === 'Bo');
  ok('Cem wartet noch auf sein Volk',
     /Cem/.test(root.querySelector('[data-part="waiting"]').textContent) &&
     root.querySelector('[data-part="waiting"]').hidden === false);
  ok('und bekommt beim Start eines',
     /beim Start/.test(root.querySelector('[data-part="waiting"]').textContent));

  /* ── Das Wörter-Fenster ── */
  ok('Fenster ist zu', root.querySelector('[data-part="setsov"]').hidden === true);
  ok('gewählte Liste in der Kurzform',
     /Schule/.test(root.querySelector('[data-part="setsum"]').textContent));
  click(root.querySelector('[data-part="setsbtn"]'), document);
  await wait(20);
  ok('Fenster geht auf', root.querySelector('[data-part="setsov"]').hidden === false);
  ok('Units als Kacheln', root.querySelectorAll('.wi-set').length === 2,
     `${root.querySelectorAll('.wi-set').length}`);
  ok('gewählte Unit markiert', root.querySelector('.wi-set').classList.contains('is-on'));

  click(root.querySelectorAll('.wi-tab')[1], document);
  await wait(20);
  ok('eigene Liste sichtbar', /Unit 3/.test(root.querySelector('[data-part="sets"]').textContent));
  ok('Import-Formular offen', root.querySelector('[data-part="import"]').hidden === false);
  click(root.querySelector('[data-part="setsclose"]'), document);
  await wait(20);
  ok('Fenster geht wieder zu', root.querySelector('[data-part="setsov"]').hidden === true);

  /* ── Start ── */
  click(root.querySelector('[data-part="start"]'), document);
  phase = 'running';
  await wait(80);
  ok('Start ging raus', calls.some(([fn]) => fn === 'wi_room_start'));
  ok('Spielfeld offen', root.querySelector('[data-part="play"]').hidden === false);
  ok('Insel am Beamer', root.querySelectorAll('.wi-cell').length === MAP.length);
  ok('Völkerleiste steht', root.querySelectorAll('.wi-team').length === 2);
  ok('Punkte sichtbar', /7/.test(root.querySelector('.wi-score').textContent));

  /* ── Links · Karte · rechts (14.09.2026) ─────────────────────
     Sönkes Vorgabe: „links und rechts die Teams, in der Mitte die
     Karte." Zwei Spalten, abwechselnd gefüllt — bei zwei Völkern also
     eines links und eines rechts. Und die Reihenfolge im DOM IST die
     Anordnung: die linke Spalte steht vor der Arena, die rechte
     dahinter. Das prüft linkedom, die Optik nicht. */
  const beam = root.querySelector('[data-part="beam"]');
  const kinder = [...beam.children];
  ok('Bühne mit drei Teilen', kinder.length === 3, `${kinder.length}`);
  ok('links · Arena · rechts',
     kinder[0].classList.contains('wi-rost--left') &&
     kinder[1].classList.contains('wi-arena') &&
     kinder[2].classList.contains('wi-rost--right'),
     kinder.map(k => k.className).join(' | '));
  ok('die Karte liegt in der Mitte', !!kinder[1].querySelector('.wi-map'));
  ok('je ein Volk links und rechts',
     kinder[0].querySelectorAll('.wi-team').length === 1 &&
     kinder[2].querySelectorAll('.wi-team').length === 1);
  /* ⚠️ Die Bühne heißt `wi-beam` und nicht `wi-stage` — das ist schon
     die Leinwand-Bühne der eigenen Insel, und eine tool.css bedient
     alle drei Rollen. Ein gesetzte Höhe hätte dort die Tiere
     verschoben. */
  ok('und sie heißt nicht wie die Insel-Bühne', !beam.classList.contains('wi-stage'));
  /* Das Bild einer Team-Karte ist das SCHIFF (Sönke: „bei den Teams
     die Schiffe"). Pfad UND Datei, wie beim Schiff auf der Karte. */
  const kartenBild = kinder[0].querySelector('.wi-teampic img').getAttribute('src') || '';
  ok('Team-Karte zeigt das Schiff', /sprites\/boot\/0\.png$/.test(kartenBild), kartenBild);
  ok('und das Schiff liegt da',
     fs.existsSync(path.join(HERE, '..', '..', '..', decodeURI(kartenBild))), kartenBild);

  /* ── Ende ── */
  phase = 'ended';
  await tool.update();
  await wait(80);
  ok('Auswertung offen', root.querySelector('[data-part="end"]').hidden === false);
  ok('schwerste Wörter geholt', calls.some(([fn]) => fn === 'wi_hard_words'));
  ok('schweres Wort steht da', /Tafel/.test(root.querySelector('[data-part="hard"]').textContent));

  /* ── Zurück in die Lobby (0134) ──────────────────────────────
     Der Knopf in der Auswertung darf NICHT starten. Sönke,
     2026-09-08: „Ich will dann erstmal in der Lobby landen, um
     Sachen zu ändern." */
  const startsVorher = calls.filter(([fn]) => fn === 'wi_room_start').length;
  click(root.querySelector('[data-part="again"]'), document);
  await wait(80);
  ok('Auswertung führt in die Lobby', calls.some(([fn]) => fn === 'wi_room_to_lobby'));
  ok('und startet dabei nichts',
     calls.filter(([fn]) => fn === 'wi_room_start').length === startsVorher);
  ok('Lobby ist wieder offen', root.querySelector('[data-part="lobby"]').hidden === false);
  ok('Auswertung ist zu', root.querySelector('[data-part="end"]').hidden === true);
  ok('Wappen wieder wählbar', root.querySelectorAll('.wi-pickbtn.is-on').length > 0);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Fehlende Migration: der Aufruf, den der Server nicht kennt
   ═══════════════════════════════════════════════════════════
   lib/tool.js macht aus einem 404 seit dem 08.09.2026 `fn_missing`
   statt `network`. Hier wird nur geprüft, dass das Werkzeug den
   Fehler auch WEITERSAGT und die Auswahl zurückdreht — sonst steht
   in der Lobby eine Wahl, die der Server nie bekommen hat. */
async function testFehlendeMigration() {
  console.log('\n— Fehlende Migration —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        if (fn === 'wi_sets_list') return Promise.resolve({ ok: true, chosen: ['s1'], sets: [] });
        if (fn === 'wi_room_set_factions') return Promise.resolve({ ok: false, error: 'fn_missing' });
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type', direction: 'mixed',
            team_count: 2, factions: [0, 1], duration: 600,
            teams: [0, 1].map(i => ({ i, tiles: 0, ruins: 0, score: 0, people: 1 })),
            map_key: 'raum:1', map: args.p_full ? [] : null, own: '', sets: ['s1'],
            people: [], online_count: 1, room_total: 1
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  const aus = root.querySelectorAll('.wi-pickbtn:not(.is-on)')[0];
  click(aus, document);
  await wait(80);
  // Und zwar so, dass man weiß, was zu tun ist: die Nummer der
  // fehlenden Migration steht im Satz.
  ok('Fehler nennt die fehlende Migration',
     ctxBase.toasts.some(t => /0133/.test(t)), ctxBase.toasts.join(' | '));
  ok('Auswahl fällt auf den Serverstand zurück',
     root.querySelectorAll('.wi-pickbtn.is-on').length === 2,
     String(root.querySelectorAll('.wi-pickbtn.is-on').length));

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Ohne Migration 0133: das Alte muss weiterlaufen
   ═══════════════════════════════════════════════════════════
   `factions` fehlt in der Antwort — dann gilt Volk = Slot, wie vor
   der Migration. Ein Werkzeug, das dabei leer bliebe, würde die
   Klasse genau in der Stunde treffen, in der das Einspielen noch
   aussteht. */
async function testOhneMigration() {
  console.log('\n— Ohne 0133 —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        if (fn === 'wi_sets_list') return Promise.resolve({ ok: true, chosen: [], sets: [] });
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase: 'lobby', mode: 'type', direction: 'mixed',
            team_count: 3, duration: 600,
            teams: [0, 1, 2].map(i => ({ i, tiles: 0, ruins: 0, score: 0, people: 1 })),
            map_key: 'raum:1', map: args.p_full ? [] : null, own: '',
            ends_at: null, countdown_ends_at: null, winner_team: null, sets: [],
            people: [{ seat: 1, name: 'Ada', team: 0, correct: 0, wrong: 0 }]
          });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  ok('Lobby steht trotzdem', root.querySelector('[data-part="lobby"]').hidden === false);
  ok('drei Wappen leuchten (Volk = Slot)',
     root.querySelectorAll('.wi-pickbtn.is-on').length === 3);
  ok('drei Spalten', root.querySelectorAll('.wi-lteam').length === 3);
  ok('ohne Wörter kein Start', root.querySelector('[data-part="start"]').disabled === true);
  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Die eigene Insel — Rolle `solo` (Migration 0136)
   ═══════════════════════════════════════════════════════════
   Die dritte Rolle malt ihre Tiere auf eine LEINWAND, und die gibt
   es in linkedom nicht. Also dieselbe Fälschung wie in
   tools/solotest.mjs: ein Kontext, der alles entgegennimmt, und ein
   Bild, das seine echten Maße aus der echten Datei liest.

   Genau das ist hier mehr als Beiwerk. Ein fehlendes <img> zeichnet
   stillschweigend NICHTS — die neun Zuschnitte werden erzeugt
   (tools/solosprites.mjs), und ob sie im Deployment liegen, sagt
   sonst niemand. */

/* Die echten Maße aus dem PNG-Kopf (IHDR steht immer bei Byte 16) —
   VERKLEINERT.

   Warum: die teuerste Rechnung des ganzen Werkzeugs ist faerbeSatz().
   Sie dreht jeden Bildpunkt jeder Vorlage in acht Völkerfarben — bei
   echten Maßen sind das rund 14 Millionen Punkte JE Aufbau, und der
   Prüfstand baut vierzigmal auf. Das waren allein dafür gut zwei
   Minuten.

   Geprüft wird davon nichts. Der Kontext-Stummel liefert ein
   durchgehend grünes Bild und wirft das Ergebnis weg (putImageData
   ist leer) — beweisbar ist also nur, dass die Farbrechnung über
   echte Werte läuft und kein NaN erzeugt. Das fällt bei 62×75
   Punkten genauso auf wie bei 249×299.

   Was hier NICHT wegfallen darf, ist die UNTERSCHEIDBARKEIT der
   Zuschnitte: `gemalt` erkennt die einunddreißig Tiervorlagen allein
   an ihren Maßen (testFunkelBild). Nach dem Teilen fallen manche
   zusammen — deshalb wird der ganze Ordner auf einmal vergeben, nach
   Namen sortiert, und eine Dopplung um einen Punkt in der Breite
   aufgelöst. Sortiert, damit dabei nicht zählt, wer zuerst fragt.

   WI_MASS_TEILER=1 stellt die echten Maße wieder her — für den Tag,
   an dem eine Frage doch am Zuschnitt selbst hängt. */
const MASS_TEILER = Number(process.env.WI_MASS_TEILER || 4);
const massRoh = d => {
  const b = fs.readFileSync(d);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const massCache = new Map();
function pngMasse(datei) {
  if (!(MASS_TEILER > 1)) return massRoh(datei);
  const key = path.resolve(datei);
  if (massCache.has(key)) return massCache.get(key);
  const belegt = new Set();
  for (const f of fs.readdirSync(path.dirname(key)).filter(x => /\.png$/i.test(x)).sort()) {
    const q = path.join(path.dirname(key), f);
    const m = massRoh(q);
    let w = Math.max(2, Math.round(m.w / MASS_TEILER));
    const h = Math.max(2, Math.round(m.h / MASS_TEILER));
    while (belegt.has(w + '×' + h)) w++;
    belegt.add(w + '×' + h);
    massCache.set(q, { w, h });
  }
  return massCache.get(key) || massRoh(key);
}

/* `gemalt` sammelt, WIE GROSS ein Bild gezeichnet wurde. Gebraucht
   wird das seit dem 11.09.2026: die Figur hat einen Maßstab je Volk
   (HELD_SKAL), und ob der wirklich bis auf die Leinwand durchkommt,
   steht in keinem Attribut — nur im Aufruf. */
function machKontext(c, gemalt) {
  return {
    canvas: c,
    filter: 'none', fillStyle: '#000', globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000', lineWidth: 1,
    drawImage(im, ...a) {
      // drawImage(im, dx, dy, dw, dh) und drawImage(im, sx…, dw, dh):
      // die Zielmaße sind in beiden Formen die letzten beiden Zahlen.
      if (!gemalt || !im || a.length < 4) return;
      /* Die Echsen kommen NICHT als <img> auf die Leinwand, sondern
         als eingefärbte Leinwand — sie haben also kein `_src`, an dem
         man sie erkennen könnte. Woran man sie trotzdem erkennt, ist
         ihr ZUSCHNITT (iw/ih): jede der einunddreißig Vorlagen hat
         ihre eigene Größe. Nur so ist seit dem 13.09.2026 prüfbar,
         dass eine funkelnde Echse wirklich ihr eigenes Bild trägt und
         nicht das der ausgewachsenen.

         Gedeckelt, weil in dieser Liste sonst jeder Funke jedes Tieres
         in jedem Bild landet. */
      if (!im._src && gemalt.length >= 20000) return;
      /* Der FILTER kommt mit. Ohne ihn wäre das Gold von Level 5
         (0145) nicht prüfbar: es steht in keinem Attribut und in
         keinem Maß — nur in der Einstellung, die im Augenblick des
         Zeichnens gilt. */
      gemalt.push({ src: String(im._src || ''),
                    iw: im.width | 0, ih: im.height | 0,
                    w: a[a.length - 2], h: a[a.length - 1],
                    filter: this.filter });
    },
    fillRect() {}, clearRect() {},
    save() {}, restore() {}, translate() {}, scale() {}, setTransform() {},
    putImageData() {},
    /* Ab der Verwandlung auf der Übungskarte kommen Pfade dazu:
       Bodenschatten, Ring und die aufspringende Eischale zeichnen
       nicht mehr nur Bilder. Fehlt einer dieser Stummel, fällt die
       Zeichenschleife mit einem TypeError aus — und der sieht dann
       aus, als sei die Karte leer. */
    rotate() {}, beginPath() {}, closePath() {}, clip() {},
    rect() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {},
    /* Seit dem Glitzerstern der obersten Stufe (13.09.2026) auch
       Bögen — er wird aus vier davon gezeichnet. */
    quadraticCurveTo() {}, bezierCurveTo() {},
    fill() {}, stroke() {},
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
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
}

const RECT = { left: 0, top: 0, width: 1200, height: 760, right: 1200, bottom: 760 };
const MPSKILLS = path.join(HERE, '..', '..', '..');

/* makeEnv() für die Solo-Rolle. Alles, was die Zeichenschleife
   anfasst — und keinen Halm mehr. */
function makeSoloEnv() {
  const env = makeEnv();
  const { window, document } = env;

  const origCreate = document.createElement.bind(document);
  document.createElement = tag => {
    const e = origCreate(tag);
    if (String(tag).toLowerCase() === 'canvas') {
      e.width = 300; e.height = 150;
      e.getContext = () => machKontext(e, env.gemalt);
      /* Seit 10.09.2026 backt das Werkzeug das kleine Monster der
         Vokabelliste als data:-URL ein (monsterUrl). Ohne diesen
         Stummel wirft die Zeile — und die Unit-Übersicht bliebe
         leer, ohne dass irgendwo ein Fehler stünde. */
      e.toDataURL = () => 'data:image/png;base64,00';
    }
    return e;
  };

  env.fehlendeBilder = [];
  // Womit angefangen wurde: Figur und Schiff werden erst beim
  // Aufstellen und dann bei jedem Volkswechsel geholt — dass das
  // RICHTIGE Bild geholt wird, sieht man nur hier.
  env.geladeneBilder = [];
  // Was die Zeichenschleife gemalt hat, mit Zielmaßen (machKontext).
  env.gemalt = [];
  class FakeImage {
    constructor() { this.width = 1; this.height = 1; }
    set src(v) {
      this._src = v;
      env.geladeneBilder.push(String(v));
      const datei = path.join(MPSKILLS, decodeURI(String(v)));
      setTimeout(() => {
        if (!fs.existsSync(datei)) { env.fehlendeBilder.push(v); this.onerror?.(); return; }
        const m = pngMasse(datei);
        this.width = m.w; this.height = m.h;
        this.onload?.();
      }, 0);
    }
    get src() { return this._src; }
  }

  /* Die Zeichenschleife läuft normalerweise INS LEERE: gezählt wird
     nur, dass sie sich anmeldet. Das reicht, solange sie beim ersten
     Bild alles anfasst.

     Für die Verwandlung reicht es nicht. Sie ist ein VERLAUF —
     Eischale, Blitz und Funken kommen erst in ihrer Mitte, und ein
     Tippfehler darin fiele beim ersten Bild nie auf. Mit `rafLive`
     ruft die Attrappe deshalb wirklich zurück; was dabei fliegt,
     wird eingesammelt statt den Prozess zu zerlegen. Ohne den Fang
     stünde da ein nackter Stapelauszug ohne die Frage, zu der er
     gehört. */
  env.rafs = 0;
  env.rafLive = false;
  env.rafFehler = [];
  Object.assign(window, { devicePixelRatio: 2 });
  const g = env.sandbox;
  g.Image = FakeImage;
  g.requestAnimationFrame = fn => {
    env.rafs++;
    // Der Deckel ist ein Riegel gegen eine Schleife, die niemand
    // mehr abbestellt — kein Maß für irgendetwas.
    if (env.rafLive && env.rafs < 6000) {
      setTimeout(() => {
        try { fn(Date.now()); } catch (e) { env.rafFehler.push(e); }
      }, 4);
    }
    return env.rafs;
  };
  g.cancelAnimationFrame = () => {};
  g.performance = { now: () => Date.now() };
  g.Uint8ClampedArray = Uint8ClampedArray;
  g.Float32Array = Float32Array;
  g.isFinite = isFinite;
  return env;
}

/* Ein erfundener Insel-Server. `stufen` sagt, welches Wort auf
   welcher Stufe steht — das ist alles, was wi_solo_view an Inhalt
   trägt.

   `player` (Migration 0145) kommt nur mit, wenn es angefragt wird:
   ohne die Migration gibt es den Block nicht, und das ist ein Fall,
   den das Werkzeug überleben muss (testLevelOhneMigration). */
function soloView(n, stufen, ohneUnits, player) {
  const words = [];
  for (let i = 0; i < n; i++) {
    const w = { i: 'w-' + i, s: stufen ? stufen(i) : 0 };
    // `u` seit Migration 0142 — die Unit am Wort. `ohneUnits`
    // spielt die ältere Datenbank nach.
    if (!ohneUnits) w.u = i % 2 ? 'set-b' : 'set-a';
    words.push(w);
  }
  const learner = {
    token: 'tok', seed: 4711, settings: {},
    words: n, grown: words.filter(w => w.s >= 3).length,
    sets: [{ id: 'set-a', title: 'Unit 1', count: Math.ceil(n / 2) },
           { id: 'set-b', title: 'Unit 2', count: Math.floor(n / 2) }]
  };
  if (player) learner.player = player;
  return { ok: true, learner, words_list: words, due: 0 };
}

/* Dieselbe Insel, aber mit dem Unit-Dach aus Migration 0150. Drei
   Ebenen, damit der Baum etwas zu tun hat:

     Jahrgang 5 · Unit „Test"   → drei Stationen   (aufklappbar)
     Jahrgang 6 · Unit „Food"   → eine  Station    (am Stück)
     ohne Jahrgang · „Klassenarbeit" → eine Station (am Stück)

   Die Wörter verteilen sich reihum auf die fünf Sätze — so trägt
   jede Station Tiere, und die Stufenpunkte der Unit sind wirklich
   die Summe ihrer Stationen und keine abgeschriebene Zahl. */
const BAUM_SETS = [
  { id: 'set-a', title: 'Station 1 — Schule',  unit: 'u-test', utitle: 'Test',
    grade: 5, island: 'en:5', station: 1 },
  { id: 'set-b', title: 'Station 2 — Zuhause', unit: 'u-test', utitle: 'Test',
    grade: 5, island: 'en:5', station: 2 },
  { id: 'set-c', title: 'Station 3 — Essen',   unit: 'u-test', utitle: 'Test',
    grade: 5, island: 'en:5', station: 3 },
  { id: 'set-d', title: 'Food',                unit: 'u-food', utitle: 'Food',
    grade: 6, island: 'en:6', station: 1 },
  { id: 'set-e', title: 'Klassenarbeit',       unit: 'u-eig',  utitle: 'Klassenarbeit',
    grade: null, island: 'en:x', station: 1 }
];

function soloBaum(n, stufen) {
  const words = [];
  for (let i = 0; i < n; i++) {
    words.push({ i: 'w-' + i, s: stufen ? stufen(i) : 0,
                 u: BAUM_SETS[i % BAUM_SETS.length].id });
  }
  const sets = BAUM_SETS.map(s => Object.assign({}, s, {
    count: words.filter(w => w.u === s.id).length }));
  return {
    ok: true,
    learner: { token: 'tok', seed: 4711, settings: {},
               words: n, grown: words.filter(w => w.s >= 3).length, sets },
    words_list: words, due: 0
  };
}

/* Der Stand, den wi_solo_level_refresh zurückgibt — dieselben
   Schwellen wie in der Migration (Sekunden). Von Hand gesetzte
   Zahlen wären hier eine zweite Wahrheit; die Tabelle steht deshalb
   an EINER Stelle und rechnet up/down aus dem Level. */
const AUF = { 1: 120, 2: 300, 3: 420, 4: 600, 5: null };
const AB  = { 1: null, 2: 60, 3: 180, 4: 360, 5: 480 };
function playerStand(level, avg, over) {
  return Object.assign({
    level, level_max: level, today_secs: 0, avg_secs: avg,
    bonus_secs: 0, pct_max: 0,
    up_secs: AUF[level], down_secs: AB[level]
  }, over || {});
}

/* Die Antwort von wi_solo_unit zu einer der beiden Units. Die
   Zahlenform ist die von wi_solo_task_json.stats:
   [richtig, mit Hilfe, gesamt, falsch] je Richtung. */
function soloUnit(setId, n, stufen) {
  const words = [];
  for (let i = 0; i < n; i++) {
    if ((i % 2 ? 'set-b' : 'set-a') !== setId) continue;
    words.push({
      i: 'w-' + i, t: 'wort' + i, x: 'Wort ' + i,
      s: stufen ? stufen(i) : 0,
      st: i % 4 === 0 ? {} : { en_de: [2, 1, 4, 1], de_en: [3, 0, 3, 0] }
    });
  }
  return {
    ok: true,
    set: { id: setId, title: setId === 'set-a' ? 'Unit 1' : 'Unit 2',
           level: '5', theme: 'Test', count: words.length },
    total: { en_de: [8, 4, 16, 4], de_en: [12, 0, 12, 0] },
    words
  };
}

/* Ein Zeigerereignis mit Koordinaten. linkedom kennt kein
   PointerEvent — gebraucht werden ohnehin nur vier Felder. */
function zeig(el, doc, typ, x, y) {
  const e = new doc.defaultView.Event(typ, { bubbles: true });
  e.pointerId = 1; e.pointerType = 'touch'; e.buttons = 1;
  e.clientX = x; e.clientY = y;
  e.preventDefault = () => {};
  el.dispatchEvent(e);
  return e;
}

/* Dasselbe, aber auf etwas, das AUF der Bühne liegt (ein Schild).
   Ausgelöst wird am Ziel, gehört wird an der Bühne — nur so trägt
   das Ereignis sein `target`, und genau daran erkennt tool.js, dass
   jemand ein Schild gemeint hat und nicht das Wasser darunter.
   `stage` steht im Aufruf, damit die Absicht („die Bühne hört zu")
   an der Aufrufstelle lesbar bleibt. */
function zeigAuf(stage, ziel, doc, typ, x, y) {
  if (!stage.contains(ziel)) throw new Error('Ziel liegt nicht auf der Bühne');
  return zeig(ziel, doc, typ, x, y);
}

/* Einen Punkt suchen, an dem wirklich etwas steht. Wo Tiere und
   Figur herumlaufen, weiß nur die Zeichenschleife — also wird das
   Feld abgesucht. Weil zwischen zwei synchronen Tipps kein Bild
   dazwischenkommt, steht die Herde dabei still.

   Abgesucht wird in MEHREREN DURCHGÄNGEN mit versetztem Anfang, und
   das hat einen Grund in jede Richtung:

     · Feiner als 34 darf ein einzelner Durchgang nicht werden. Zwei
       Tipps, die weniger als 30 px auseinanderliegen und schnell
       aufeinander folgen, sind ein DOPPELTIPP — der setzt die Kamera
       zurück und unterdrückt die Auswahl.
     · Gröber als das Ziel darf das Raster aber auch nicht sein, und
       genau das war es geworden. Der alte Kommentar rechnete mit
       einer Figur von 39 × 73 Bildpunkten; gemessen sind es heute
       rund 20 × 46. Die Hauptinsel ist am 15.09.2026 von ~210 auf
       435 Felder gewachsen, die Kacheln wurden kleiner, und die
       Figur hängt über HELD_HOCH an der Kachel. Zwanzig Punkte sind
       SCHMALER als der Schritt: je nachdem, wo die Figur gerade
       stand, rutschte das Raster an ihr vorbei — und der Prüfstand
       war in etwa jedem vierten Lauf ohne eigenes Zutun rot.

   Der Versatz löst beides: innerhalb eines Durchgangs bleibt der
   Abstand 34, zusammen decken die Durchgänge ein Raster von 11 × 17
   ab. Gefunden wird fast immer im ersten. */
const VERSATZ = [];
for (const dy of [0, 17]) for (const dx of [0, 11, 22]) VERSATZ.push([dx, dy]);

function suchePunkt(root, document, offen, schritt = 34) {
  const stage = root.querySelector('[data-part="stage"]');
  for (const [dx, dy] of VERSATZ) {
    for (let y = 20 + dy; y < RECT.height; y += schritt) {
      for (let x = 20 + dx; x < RECT.width; x += schritt) {
        zeig(stage, document, 'pointerdown', x, y);
        zeig(stage, document, 'pointerup', x, y);
        if (offen()) return { x, y };
      }
    }
  }
  return null;
}

function tippeAufTier(root, document, schritt = 34) {
  const karte = root.querySelector('[data-part="card"]');
  return suchePunkt(root, document, () => !karte.hidden, schritt);
}

/* Dasselbe für die eigene Figur (oder das Schiff): suchen, bis der
   Kasten „Wer bist du?" aufgeht. Das Schiff ist rund dreimal so
   breit wie die Figur und wird deshalb ohnehin früher gefunden —
   seit 11.09.2026 sind sieben der acht Völker 30 % kleiner. */
function tippeAufFigur(root, document, schritt = 34) {
  const kasten = root.querySelector('[data-part="volkov"]');
  return suchePunkt(root, document, () => !kasten.hidden, schritt);
}

// Die Felder der gebauten Insel als Menge „r,c" — für die Frage,
// ob eine wachsende Insel wirklich nur DAZU bekommt.
const felderVon = root => new Set(
  [...root.querySelectorAll('.wi-cell')].map(e => e.dataset.r + ',' + e.dataset.c));

/* Zusammenhängende Landmassen aus so einer Menge — dasselbe, was
   `findeInseln` drinnen macht, aber von außen und nur aus dem, was
   im DOM steht. Die Hex-Nachbarschaft ist die von cx(): ungerade
   Zeilen liegen eine halbe Spalte weiter rechts, ihre schrägen
   Nachbarn sind also c und c+1 statt c-1 und c. */
function landmassen(felder) {
  const offen = new Set(felder), raus = [];
  while (offen.size) {
    const start = offen.values().next().value;
    offen.delete(start);
    const stapel = [start], grp = [];
    while (stapel.length) {
      const k = stapel.pop(); grp.push(k);
      const [r, c] = k.split(',').map(Number);
      const s = ((r % 2) + 2) % 2 ? 1 : -1;   // Versatz der Nachbarzeilen
      for (const [nr, nc] of [[r, c - 1], [r, c + 1],
                              [r - 1, c], [r - 1, c + s],
                              [r + 1, c], [r + 1, c + s]]) {
        const n = nr + ',' + nc;
        if (!offen.has(n)) continue;
        offen.delete(n); stapel.push(n);
      }
    }
    raus.push(grp);
  }
  return raus.sort((a, b) => b.length - a.length);   // größte zuerst
}

async function mountSolo(view, extra, opt) {
  const env = makeSoloEnv();
  // Vor dem Aufhängen, nicht danach: eine Schleife, die einmal ins
  // Leere gelaufen ist, bestellt sich nie wieder.
  env.rafLive = !!(opt && opt.live);
  const tool = env.impls.wordisland;
  const calls = [];
  const ctx = Object.assign({}, env.ctxBase, {
    role: 'solo',
    actions: {
      role: 'solo',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_solo_view') return Promise.resolve(view);
        if (extra && extra[fn]) return Promise.resolve(extra[fn](args));
        return Promise.resolve({ ok: false, error: 'not_allowed' });
      }
    }
  });
  const root = env.document.getElementById('root');
  tool.mount(root, ctx);

  /* Bühne und Leinwände kommen aus innerHTML und laufen damit NICHT
     durch createElement — sie brauchen ihre Fälschung hier.

     Die Maße sind kein Beiwerk: ohne sie steht in sicht.s eine
     Division durch null, und ab da ist jeder Bildschirmpunkt NaN. */
  for (const el of root.querySelectorAll('*')) el.getBoundingClientRect = () => RECT;
  for (const c of root.querySelectorAll('canvas')) {
    if (!c.width) { c.width = RECT.width; c.height = RECT.height; }
    c.getContext = () => machKontext(c, env.gemalt);
  }

  /* Bilder laden (setTimeout 0 je Bild), einfärben, Insel bauen.

     Das ist eine KETTE: ein geladenes Bild zieht das nächste nach
     sich, und jedes Glied braucht seinen eigenen Durchlauf der
     Schlange. Früher standen hier zwölf feste Pausen à 20 ms — bei
     vierzig Aufbauten acht Sekunden, die zum größten Teil
     Liegenbleiben waren, und bei der Figur mit ihren vier Fassungen
     trotzdem manchmal zu wenig.

     Jetzt wird gewartet, bis nichts mehr NACHGEFORDERT wird: drei
     stille Durchgänge, dann ist die Kette durch. Der Deckel ist ein
     Riegel gegen eine Kette, die nie zur Ruhe kommt — kein Maß für
     irgendetwas. */
  let still = 0;
  for (let i = 0, vorher = -1; i < 60 && still < 3; i++) {
    const jetzt = env.geladeneBilder.length;
    still = jetzt === vorher ? still + 1 : 0;
    vorher = jetzt;
    await wait(4);
  }
  return { env, tool, root, calls, ctx, document: env.document };
}

async function testSolo() {
  console.log('\n— Meine Insel —');
  const { env, tool, root, calls } = await mountSolo(soloView(40, i => i % 5));

  /* Seit dem 11.09.2026 sind es zwanzig: drei Fassungen der
     gewachsenen Echse, fünf der ausgewachsenen, dazu das Wasserbild
     der Schwimmerin. Seit dem 13.09.2026 einunddreißig — die
     funkelnde Stufe hat eigene Zeichnungen, eine je Fassung. Ein
     fehlendes <img> zeichnet still NICHTS — gezählt wird deshalb,
     dass ALLE geholten Bilder da waren. */
  ok('alle Tierbilder liegen wirklich da',
     env.fehlendeBilder.length === 0, env.fehlendeBilder.join(', '));
  const tierBilder = env.geladeneBilder.filter(v => /sprites\/tier\//.test(v));
  ok('und es sind die einunddreißig Fassungen', tierBilder.length === 31,
     String(tierBilder.length));
  for (const n of ['s2a.png', 's2bz.png', 's3c.png', 's3d.png', 's3e.png', 's3es.png',
                   's4a.png', 's4cz.png', 's4d.png', 's4es.png']) {
    ok('  · ' + n, tierBilder.some(v => v.endsWith('/' + n)));
  }
  ok('die Insel wird geholt', calls.some(c => c[0] === 'wi_solo_view'));
  ok('kein Poller — die Insel ändert sich nur durch mich',
     calls.filter(c => c[0] === 'wi_solo_view').length === 1);
  ok('der Ladehinweis ist weg', root.querySelector('[data-part="load"]').hidden === true);

  const felder = root.querySelectorAll('.wi-cell');
  ok('die Hauptinsel steht', felder.length > 150, String(felder.length));
  ok('keine Nebelfelder — hier gibt es nichts zu erobern',
     [...felder].every(f => f.dataset.t === '.'));
  ok('kein Schiff, keine Flagge, kein Nebel',
     root.querySelectorAll('.wi-ship, .wi-flag, .wi-fog').length === 0);

  /* Ein NaN in einem Pfad ist der Fehler, der wie „die Karte ist
     leer" aussieht und sich sonst nirgends zeigt. */
  const schlecht = [...root.querySelectorAll('path')]
    .filter(p => /NaN|Infinity|undefined/.test(p.getAttribute('d') || ''));
  ok('kein NaN in den Pfaden', schlecht.length === 0, String(schlecht.length));

  /* Seit 10.09.2026 steht die Zahl im Kopf der Unit-Leiste und nicht
     mehr unten; seit dem 20.09.2026 zählt sie ausgeschrieben TIERE
     statt „Units (40)" — dieselbe Zahl, nur bei ihrem Namen genannt
     (Sönke: „einfach die Gesamtwerte, x Tiere"). */
  ok('die Zahl im Kopf der Unit-Leiste zählt Tiere',
     root.querySelector('[data-part="swords"]').textContent === '40',
     root.querySelector('[data-part="swords"]').textContent);
  ok('… und das Wort „Tiere" steht daneben',
     /40\s*Tiere/.test(root.querySelector('[data-part="ugriff"]').textContent),
     root.querySelector('[data-part="ugriff"]').textContent.trim());
  ok('die untere Leiste trägt keine Zahlen mehr',
     !root.querySelector('.wi-sbar .wi-lg') &&
     !root.querySelector('.wi-sbar [data-part="swords"]'));
  /* Drinnen stehen genau drei Dinge: die Level-Gruppe, das Zahnrad
     und „Vokabeln üben" (13.09.2026). Der alte Abstandhalter ist weg
     und darf nicht zurückkommen — die Knöpfe schiebt die Gruppe an
     das rechte Ende, weil sie als einzige wächst. */
  ok('und trägt die Level-Gruppe plus die zwei Knöpfe',
     !root.querySelector('.wi-sspacer') &&
     [...root.querySelectorAll('.wi-sbar > *')].map(e => e.dataset.part).join() ===
       'lvl,ssets,sgo',
     [...root.querySelectorAll('.wi-sbar > *')].map(e => e.dataset.part).join());
  /* Die Legende ist eine Auskunft: fünf Stufen, je acht Wörter aus
     dem `i % 5` oben. Stufen ohne Tiere fielen weg — hier sind alle
     fünf besetzt. */
  /* Gefragt ist die Legende der LEISTE. Seit 10.09.2026 trägt jede
     Unit-Zeile dieselbe Punktreihe — `.wi-slegend` allein träfe
     inzwischen drei Kästen. */
  ok('die Legende zählt alle fünf Stufen',
     root.querySelectorAll('[data-part="slegend"] .wi-lg').length === 5,
     String(root.querySelectorAll('[data-part="slegend"] .wi-lg').length));

  ok('die Zeichenschleife läuft', env.rafs > 0);
  ok('und die beiden Knöpfe sind frei',
     root.querySelector('[data-part="sgo"]').disabled === false &&
     root.querySelector('[data-part="ssets"]').disabled === false);
  tool.unmount();
}

/* Die Insel WÄCHST — und zwar monoton. Das ist die eine Zusage der
   Metapher, die man nicht sehen kann, bevor sie gebrochen ist: ein
   Kind, dessen Hauptinsel sich beim Dazulernen umformt, hat nicht
   mehr dieselbe Insel. */
async function testInselWaechst() {
  console.log('\n— Die Insel wächst —');
  const klein = await mountSolo(soloView(30));
  const kleinFelder = felderVon(klein.root);
  const kleinZahl = kleinFelder.size;
  const kleinTeile = klein.root.querySelectorAll('.wi-det').length;
  const kleinMassen = landmassen(kleinFelder);

  /* Drei große statt sechs kleiner (15.09.2026). Die Hauptinsel
     trägt Ei, Stufe 1 und Stufe 2 ganz allein — bei rund 1000
     Wörtern je Jahrgang ist SIE das Maß, nicht die Gesamtfläche. */
  ok('die Hauptinsel trägt ein ganzes Lehrwerk', kleinMassen[0].length >= 400,
     kleinMassen[0].length + ' Felder');
  /* Und schon das erste Bild zeigt ein Archipel: eine einzelne
     Insel sähe nicht aus wie eine, die noch wächst. */
  ok('von Anfang an liegt ein Satellit daneben', kleinMassen.length === 2,
     kleinMassen.map(m => m.length).join(' · '));
  klein.tool.unmount();

  const gross = await mountSolo(soloView(700));
  const grossFelder = felderVon(gross.root);
  const grossMassen = landmassen(grossFelder);

  ok('mit mehr Wörtern kommt Land dazu', grossFelder.size > kleinZahl,
     `${kleinZahl} → ${grossFelder.size}`);
  ok('am Ende stehen drei Satelliten', grossMassen.length === 4,
     grossMassen.map(m => m.length).join(' · '));
  /* „Groß" ist die halbe Ansage. Sechs Inseln à 25 Feldern trugen
     zusammen so viel wie ein Viertel der Hauptinsel — auf drei
     davon soll am Jahresende die Mehrheit der Tiere leben. */
  ok('und die Satelliten sind groß',
     grossMassen.slice(1).every(m => m.length >= 100),
     grossMassen.slice(1).map(m => m.length).join(' · '));
  /* Der Kern: JEDES Feld von vorher liegt noch da. Kommt hier auch
     nur eines nicht vor, hat sich die Insel umgeformt statt
     gewachsen. */
  const fehlt = [...kleinFelder].filter(k => !grossFelder.has(k));
  ok('und kein einziges altes Feld verschwindet', fehlt.length === 0,
     fehlt.slice(0, 5).join(' · '));
  /* Die Kostenbremse `dicht` darf auf der eigenen Insel nirgends
     greifen: sie nähme der Karte die Bäumchen, und zwar irgendwann
     mitten im Schuljahr. Eine Insel, die beim Dazulernen ihre
     Ausstattung verliert, ist so wenig die eigene wie eine, die
     sich umformt. */
  const grossTeile = gross.root.querySelectorAll('.wi-det').length;
  ok('die Karte behält ihre Kleinteile, auch wenn sie wächst',
     kleinTeile > 0 && grossTeile > kleinTeile,
     `${kleinTeile} → ${grossTeile}`);
  gross.tool.unmount();

  /* Und derselbe Startwert gibt zweimal dieselbe Insel — sonst
     stünde nach jedem Öffnen eine andere da. */
  const nochmal = await mountSolo(soloView(30));
  const gleich = felderVon(nochmal.root);
  ok('derselbe Startwert, dieselbe Insel',
     gleich.size === kleinZahl && [...kleinFelder].every(k => gleich.has(k)));
  nochmal.tool.unmount();
}

/* ─── Die Inselwelt ───────────────────────────────────────────────
   Ein Archipel je `island_key`. Eine Ansicht, in der genau die
   Inseln vorkommen, die man vorgibt — mit einer Station je Insel,
   damit „so viele Wörter" auch „so viele Wörter DORT" heißt. */
const weltSetId = key => 'set-' + key.replace(':', '-');

function soloWelt(plan, gewaehlt) {
  const sets = [], words = [];
  let n = 0;
  for (const p of plan) {
    const id = weltSetId(p.key);
    sets.push({ id, title: 'Station 1', unit: 'u-' + id, utitle: p.key,
                grade: p.grade === undefined ? null : p.grade,
                island: p.key, station: 1, count: p.woerter });
    for (let i = 0; i < p.woerter; i++) words.push({ i: 'w-' + (n++), s: 0, u: id });
  }
  /* `gewaehlt` sind die Stationen im Beutel. Ohne Angabe ist am
     Server „nichts gewählt" gleich „alles" (wi_solo_chosen) — dann
     sind alle Archipele wach, so wie bei einem Kind, das noch nie
     etwas abgewählt hat. */
  const settings = gewaehlt ? { sets: gewaehlt.map(weltSetId) } : {};
  return {
    ok: true,
    learner: { token: 'tok', seed: 4711, settings,
               words: words.length, grown: 0, sets },
    words_list: words, due: 0
  };
}

/* Feldschlüssel „r,c" → Weltkoordinaten. Dieselbe Rechnung wie cx()
   und cy() in tool.js: ungerade Zeilen liegen eine halbe Spalte
   weiter rechts, der Zeilenabstand ist √3/2. */
const ROWH_T = 0.8660254;
const ortVon = k => {
  const [r, c] = k.split(',').map(Number);
  return { x: c + 0.5 * (((r % 2) + 2) % 2), y: r * ROWH_T };
};

/* Der kleinste Abstand zwischen zwei Feldmengen. Die einzige Zahl,
   die „diese beiden Archipele sind nicht zusammengewachsen"
   wirklich belegt — eine Zählung der Landmassen tut es nicht: zwei
   zusammengewachsene sind EINE, und das sähe nach einer Insel
   weniger aus und nicht nach einem Fehler. */
function abstand(a, b) {
  const A = [...a].map(ortVon), B = [...b].map(ortVon);
  let d = Infinity;
  for (const p of A) for (const q of B) {
    d = Math.min(d, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return d;
}

async function testInselwelt() {
  console.log('\n— Die Inselwelt —');

  /* Ein Jahrgang allein: genau eine Insel plus ihr erster Satellit,
     also der Stand von vorher. Die Inselwelt darf ein Kind, das nur
     Klasse 5 hat, nicht anders behandeln als bisher. */
  const nur5 = await mountSolo(soloWelt([{ key: 'en:5', grade: 5, woerter: 120 }]));
  const f5 = felderVon(nur5.root);
  const m5 = landmassen(f5);
  ok('ein Jahrgang allein ergibt ein Archipel', m5.length === 2,
     m5.map(m => m.length).join(' · '));
  ok('und seine Hauptinsel trägt ein ganzes Lehrwerk', m5[0].length >= 400,
     m5[0].length + ' Felder');
  nur5.tool.unmount();

  /* Klasse 6 kommt dazu. Das ist der Kern: Klasse 5 darf sich dabei
     nicht um ein einziges Feld bewegen — sonst hat sich die Insel
     umgeformt und nicht die Welt erweitert. */
  const beide = await mountSolo(soloWelt([
    { key: 'en:5', grade: 5, woerter: 120 },
    { key: 'en:6', grade: 6, woerter: 120 }
  ]));
  const fB = felderVon(beide.root);
  const mB = landmassen(fB);
  ok('zwei Jahrgänge ergeben zwei Archipele', mB.length === 4,
     mB.map(m => m.length).join(' · '));

  const fehlt = [...f5].filter(k => !fB.has(k));
  ok('Klasse 5 behält JEDES Feld, wenn Klasse 6 dazukommt',
     fehlt.length === 0, fehlt.slice(0, 5).join(' · '));

  /* Was nicht zu Klasse 5 gehört, ist Klasse 6 — der Trick, mit dem
     die Zusage ohne eine Zuordnung von außen auskommt. */
  const f6 = new Set([...fB].filter(k => !f5.has(k)));
  ok('und Klasse 6 ist wirklich dazugekommen', f6.size > 400, f6.size + ' Felder');
  const d = abstand(f5, f6);
  ok('die beiden Archipele sind nicht zusammengewachsen', d >= 10,
     'kleinster Abstand ' + d.toFixed(1) + ' Kacheln');

  /* Die Hauptinsel von Klasse 6 ist genauso groß wie die von
     Klasse 5: das Archipel wächst nicht über einen Lehrwerksband
     hinaus, es kommt eines dazu. */
  const eigen = landmassen(f6);
  ok('Klasse 6 bekommt ihre eigene Hauptinsel', eigen[0].length >= 400,
     eigen[0].length + ' Felder');

  /* Die Kostenbremse darf auch bei zwei wachen Archipelen nicht
     greifen — 1762 Felder liegen über der 1100, und ohne eine
     Entscheidung JE ARCHIPEL verlöre Klasse 5 ihre Bäumchen in dem
     Augenblick, in dem Klasse 6 auftaucht. */
  ok('und die Karte behält ihre Kleinteile',
     beide.root.querySelectorAll('.wi-det').length > 0,
     beide.root.querySelectorAll('.wi-det').length + ' Kleinteile');
  beide.tool.unmount();

  /* Eine neue SPRACHE darf die bestehenden Jahrgänge genauso wenig
     verschieben. Genau daran ist der naheliegende Weg gescheitert
     (Winkel = i/N·2π wie bei den Satelliten): dort dreht jeder neue
     Platz alle alten mit. */
  const mitLatein = await mountSolo(soloWelt([
    { key: 'en:5', grade: 5, woerter: 120 },
    { key: 'en:6', grade: 6, woerter: 120 },
    { key: 'la:6', grade: 6, woerter: 80 }
  ]));
  const fL = felderVon(mitLatein.root);
  const fehltL = [...fB].filter(k => !fL.has(k));
  ok('Latein verschiebt kein Feld von Englisch', fehltL.length === 0,
     fehltL.slice(0, 5).join(' · '));
  ok('… und bringt ein drittes Archipel mit',
     landmassen(fL).length === 6, landmassen(fL).map(m => m.length).join(' · '));
  mitLatein.tool.unmount();

  /* ⚠️ Die eigentliche Zusage der Slot-Spirale: ein Jahrgang, der
     sich VOR die bestehenden schiebt. Ein Kind hat Klasse 6 und
     eigene Listen, die Lehrkraft schaltet danach Klasse-5-Stationen
     frei — Slot 4 kommt also vor Slot 5 und 13 dazu. Würde der Platz
     aus der Reihenfolge der belegten Slots kommen (der naheliegende
     Weg), rutschte hier alles um einen Platz weiter und beide alten
     Archipele lägen woanders. */
  const spaet5a = await mountSolo(soloWelt([
    { key: 'en:6', grade: 6, woerter: 120 },
    { key: 'en:x', grade: null, woerter: 40 }
  ]));
  const fVor = felderVon(spaet5a.root);
  spaet5a.tool.unmount();

  const spaet5b = await mountSolo(soloWelt([
    { key: 'en:5', grade: 5, woerter: 120 },
    { key: 'en:6', grade: 6, woerter: 120 },
    { key: 'en:x', grade: null, woerter: 40 }
  ]));
  const fNach = felderVon(spaet5b.root);
  const fehltV = [...fVor].filter(k => !fNach.has(k));
  ok('ein Jahrgang, der sich davorschiebt, verrückt nichts',
     fehltV.length === 0, fehltV.slice(0, 5).join(' · '));
  spaet5b.tool.unmount();

  /* Eigene Listen einer Lehrkraft haben keinen Jahrgang. Sie
     bekommen ihren eigenen Platz und wandern nicht auf die Insel
     des zuletzt freigeschalteten Jahrgangs. */
  const mitEigen = await mountSolo(soloWelt([
    { key: 'en:5', grade: 5, woerter: 120 },
    { key: 'en:x', grade: null, woerter: 40 }
  ]));
  const fE = felderVon(mitEigen.root);
  const eigene = new Set([...fE].filter(k => !f5.has(k)));
  ok('eigene Listen bekommen ein eigenes Archipel', eigene.size > 0,
     eigene.size + ' Felder');
  ok('… und liegen nicht an der Insel des Jahrgangs',
     abstand(f5, eigene) >= 10,
     'kleinster Abstand ' + abstand(f5, eigene).toFixed(1) + ' Kacheln');
  mitEigen.tool.unmount();
}

/* ─── Die schlafende Insel ────────────────────────────────────────
   Ein Archipel, an dem gerade nicht gearbeitet wird, wird zur
   Silhouette: kein Relief, keine Bäumchen, keine Brandung. Das ist
   nicht Zierde, sondern die Statik — ohne sie wären sechs Jahrgänge
   rund 31.000 SVG-Knoten. */
async function testSchlafendeInsel() {
  console.log('\n— Die schlafende Insel —');

  const PLAN = [
    { key: 'en:5', grade: 5, woerter: 120 },
    { key: 'en:6', grade: 6, woerter: 120 }
  ];

  const wach = await mountSolo(soloWelt(PLAN));
  const wachFelder = wach.root.querySelectorAll('.wi-cell').length;
  const wachTeile = wach.root.querySelectorAll('.wi-det').length;
  const wachSurf = wach.root.querySelectorAll('.wi-surf').length;
  ok('beide wach: beide Archipele stehen im Relief', wachFelder > 1100,
     wachFelder + ' Kacheln');
  ok('… und keine Silhouette weit und breit',
     wach.root.querySelectorAll('.wi-schlaf').length === 0);
  wach.tool.unmount();

  /* Jetzt ist nur Klasse 5 im Beutel. */
  const halb = await mountSolo(soloWelt(PLAN, ['en:5']));
  const halbFelder = halb.root.querySelectorAll('.wi-cell').length;
  const schlaf = halb.root.querySelectorAll('.wi-schlaf');
  ok('schläft Klasse 6, wird sie eine Silhouette', schlaf.length === 1,
     schlaf.length + ' Silhouetten');
  ok('… und ihre Kacheln sind gar nicht erst gebaut',
     halbFelder > 400 && halbFelder < wachFelder * .62,
     `${wachFelder} → ${halbFelder} Kacheln`);

  /* Die eigentliche Zusage: es ist BILLIGER, nicht bloß anders.
     Eine Silhouette kostet zwei Elemente je Landmasse. */
  ok('eine Silhouette kostet fast nichts',
     schlaf[0].querySelectorAll('path').length <= 4,
     schlaf[0].querySelectorAll('path').length + ' Pfade für zwei Landmassen');
  ok('… und die schlafende Insel bekommt keine Brandung',
     halb.root.querySelectorAll('.wi-surf').length < wachSurf * .62,
     `${wachSurf} → ${halb.root.querySelectorAll('.wi-surf').length} Wellen`);

  /* Klasse 5 verliert dabei NICHTS. Eine Insel, die ihre
     Ausstattung verliert, weil nebenan eine zweite eingeschlafen
     ist, wäre derselbe Fehler wie eine, die sich umformt. */
  ok('Klasse 5 behält ihr Relief samt Kleinteilen',
     halb.root.querySelectorAll('.wi-det').length > wachTeile * .38,
     `${wachTeile} → ${halb.root.querySelectorAll('.wi-det').length} Kleinteile`);

  /* Das Meer bleibt EIN Meer: die Tiefenstufen laufen um alles
     herum, auch um das, was schläft. Sonst endete die Welt an der
     Küste der wachen Insel. */
  ok('das Meer umschließt weiter die ganze Welt',
     halb.root.querySelectorAll('.wi-sea').length === 1);
  halb.tool.unmount();
}

/* Und die Tiere darauf. Der Prüfstand braucht dafür echte Bilder
   (`live: true`) — mit der Attrappe wäre von jeder Bewegung immer
   nur das erste gesehen, und „bewegt sich nicht" ließe sich gar
   nicht von „bewegt sich" unterscheiden. */
async function testSchlafendeTiere() {
  console.log('\n— Die Tiere schlafen mit —');

  const PLAN = [
    { key: 'en:5', grade: 5, woerter: 40 },
    { key: 'en:6', grade: 6, woerter: 40 }
  ];
  /* Stufe 1, damit sie laufen: ein Ei bewegt sich auch wach nicht,
     und dann bewiese ein Stillstand gar nichts. */
  const view = soloWelt(PLAN, ['en:5']);
  for (const w of view.words_list) w.s = 1;

  const { env, tool, root } = await mountSolo(view, null, { live: true });
  const welt = tool.stand();
  ok('die Welt gibt ihren Stand preis', !!welt && welt.archipele.length === 2,
     welt ? welt.archipele.length + ' Archipele' : 'kein Zugriff');

  const wach = welt.tiere.filter(t => !t.schlaeft);
  const schlaf = welt.tiere.filter(t => t.schlaeft);
  ok('die Tiere der wachen Insel sind wach', wach.length === 40, wach.length + '');
  ok('die der schlafenden schlafen', schlaf.length === 40, schlaf.length + '');
  ok('und nur die wachen stehen in der Schrittliste',
     welt.wachTiere.length === 40, welt.wachTiere.length + '');
  ok('ein schlafendes Tier trägt sein Schlafbild',
     schlaf.every(t => t.zustand === 'schlafen'));

  /* Der Kern: über mehrere Bilder hinweg rührt sich auf der
     schlafenden Insel nichts, auf der wachen schon. */
  const merk = ts => ts.map(t => t.x.toFixed(4) + ',' + t.y.toFixed(4)).join('|');
  const schlafVor = merk(schlaf), wachVor = merk(wach);
  await wait(260);
  ok('die schlafenden Tiere rühren sich über Sekunden nicht',
     merk(schlaf) === schlafVor);
  ok('die wachen dagegen schon', merk(wach) !== wachVor);
  ok('und die Zeichenschleife lief dabei wirklich',
     env.rafs > 3 && env.rafFehler.length === 0,
     env.rafs + ' Bilder ' + (env.rafFehler[0] || ''));

  /* Solange man auf der wachen Insel steht, ist die schlafende gar
     nicht im Bild — und was nicht im Bild ist, wird nicht gezeichnet
     (`_a` bleibt unbesetzt). Das ist die Sichtfeld-Auslese, und sie
     ist der Grund, warum die Zusage darunter erst nach einem
     Doppeltipp etwas zu messen hat. */
  ok('vom Nachbar-Archipel wird nichts gezeichnet, solange man woanders steht',
     schlaf.every(t => t._a === undefined) && wach.some(t => t._a !== undefined));

  /* Jetzt hinüberfahren. Der Weg wird gerechnet und nicht geraten:
     die Mittelpunkte beider Archipele stehen in `stand()`, der
     Maßstab der Bühne folgt aus viewBox und Bühnengröße, und die
     Zoomstufe steht im `transform` der Karte. Ein geratener Wisch
     wäre ein Prüfstand, der bei jeder Maßänderung rot wird.

     ⚠️ Herausgezoomt geht das NICHT: dort wäre ein Tier ein bis zwei
     Bildpunkte, und genau dann lässt die Karte die Schläfer
     absichtlich weg (SCHLAF_SICHT_PX). Die Ferne ist der Silhouette
     und ihrem Schild vorbehalten. */
  const stage = root.querySelector('[data-part="stage"]');
  const wrap = root.querySelector('[data-part="mapwrap2"]')
            || root.querySelector('.wi-mapwrap2');
  const k = Number((/scale\(([-\d.]+)\)/.exec(wrap.style.transform) || [])[1] || 1);
  const s = Math.min(RECT.width / welt.vb[2], RECT.height / welt.vb[3]);
  const P = s * k;
  const dx = (welt.archipele[1].mx - welt.archipele[0].mx) * P;
  const dy = (welt.archipele[1].my - welt.archipele[0].my) * P;

  const mx = RECT.width / 2, my = RECT.height / 2;
  zeig(stage, env.document, 'pointerdown', mx, my);
  for (let i = 1; i <= 6; i++) {
    zeig(stage, env.document, 'pointermove',
         mx - dx * i / 6, my - dy * i / 6);
  }
  zeig(stage, env.document, 'pointerup', mx - dx, my - dy);
  await wait(120);

  const gemalt = schlaf.filter(t => t._a !== undefined);
  ok('auf der schlafenden Insel stehen die Tiere sichtbar herum',
     gemalt.length > 0, gemalt.length + ' von ' + schlaf.length);

  /* Sönkes Ansage: „nur schlafen und nicht leuchten." Nachts würde
     ein Tier der Stufe 1 sonst mitglühen; `_a` ist die EINE Zahl
     dafür, wie laut ein Tier sein darf. */
  ok('… und keiner von ihnen leuchtet',
     gemalt.every(t => t._a <= .72),
     'lautester ' + Math.max(0, ...gemalt.map(t => t._a)).toFixed(2));

  tool.unmount();
}

/* ─── Wecken ──────────────────────────────────────────────────────
   Sönkes Entscheid vom 20.09.2026: ein Tipp auf eine schlafende
   Insel fliegt hin UND weckt den ganzen Jahrgang. */
async function testWecken() {
  console.log('\n— Eine Insel wecken —');

  const PLAN = [
    { key: 'en:5', grade: 5, woerter: 40 },
    { key: 'en:6', grade: 6, woerter: 40 }
  ];
  const view = soloWelt(PLAN, ['en:5']);
  for (const w of view.words_list) w.s = 1;

  const { env, tool, root, calls } = await mountSolo(view, {
    wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } })
  });
  const welt = tool.stand();

  /* Das Schild ist die Trefferfläche: aus der Übersicht ist eine
     Insel klein, ein beschriftetes Schild nicht. */
  const schilder = [...root.querySelectorAll('.wi-schild')];
  ok('jedes Archipel bekommt ein Schild', schilder.length === 2,
     schilder.length + '');
  ok('… und genau eines ist als wach ausgezeichnet',
     schilder.filter(s => s.className.includes('is-wach')).length === 1);
  const schlafend = schilder.find(s => !s.className.includes('is-wach'));
  ok('… das schlafende sagt, was ein Tipp bewirkt',
     /antippen/i.test(schlafend.textContent), schlafend.textContent.trim());
  ok('… und beide tragen ihren Jahrgang',
     schilder.map(s => s.querySelector('b').textContent).join(' · ')
       === 'Jahrgang 5 · Jahrgang 6',
     schilder.map(s => s.querySelector('b').textContent).join(' · '));

  const felderVor = root.querySelectorAll('.wi-cell').length;
  const wachVor = welt.wachTiere.length;

  /* Tippen. Der Weg ist derselbe wie mit dem Finger: aufsetzen und
     loslassen auf dem Schild, und die Bühne fängt beides in der
     Einfang-Phase ab. */
  const stage = root.querySelector('[data-part="stage"]');
  zeigAuf(stage, schlafend, env.document, 'pointerdown', 300, 200);
  zeigAuf(stage, schlafend, env.document, 'pointerup', 300, 200);
  await wait(30);

  const setz = calls.filter(c => c[0] === 'wi_solo_settings');
  ok('der Tipp schickt eine neue Auswahl an den Server', setz.length === 1,
     JSON.stringify(setz));
  ok('… und darin liegt der GANZE Jahrgang',
     setz.length === 1 && setz[0][1].p_sets.length === 2
       && setz[0][1].p_sets.includes('set-en-6'),
     setz.length ? JSON.stringify(setz[0][1].p_sets) : '—');

  ok('die geweckte Insel steht jetzt im Relief',
     root.querySelectorAll('.wi-cell').length > felderVor * 1.6,
     `${felderVor} → ${root.querySelectorAll('.wi-cell').length} Kacheln`);
  ok('… ihre Silhouette ist weg',
     root.querySelectorAll('.wi-schlaf').length === 0);
  ok('… ihre Tiere sind aufgewacht',
     tool.stand().wachTiere.length === wachVor * 2,
     `${wachVor} → ${tool.stand().wachTiere.length}`);
  ok('… und beide Schilder sind wach',
     [...root.querySelectorAll('.wi-schild')]
       .every(s => s.className.includes('is-wach')));

  /* Die Gegenrichtung ist ausdrücklich NICHT der Tipp: wer auf
     seiner eigenen Insel herumtippt, darf nicht aus Versehen den
     Jahrgang abwählen, an dem er gerade arbeitet. */
  const jetztWach = root.querySelector('.wi-schild');
  zeigAuf(stage, jetztWach, env.document, 'pointerdown', 300, 200);
  zeigAuf(stage, jetztWach, env.document, 'pointerup', 300, 200);
  await wait(30);
  ok('ein Tipp auf eine WACHE Insel ändert nichts',
     calls.filter(c => c[0] === 'wi_solo_settings').length === 1);

  tool.unmount();
}

/* ─── Der Jahrgangs-Schalter im Kopf ──────────────────────────────
   Der Jahrgang ist seit der Inselwelt ein Schalter mit Dreizustand —
   und der EINZIGE Weg, eine Insel wieder schlafen zu legen. Er stand
   bis zum 20.09.2026 als Zeile in der Liste; seit Sönkes „das ist
   doppelt drin … nur oben als Chip" ist er der antippbare Zustand
   rechts in der Zahlen-Zeile (`.wi-jschlaf`). */
async function testJahrgangsLeiste() {
  console.log('\n— Der Jahrgang im Kopf der Leiste —');

  const PLAN = [
    { key: 'en:5', grade: 5, woerter: 40 },
    { key: 'en:6', grade: 6, woerter: 40 }
  ];
  const { tool, root, calls, ctx, document } = await mountSolo(
    soloWelt(PLAN), {
      wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } })
    });

  const chips = () => [...root.querySelectorAll('.wi-jchip')];
  const chip = n => chips().find(c => c.textContent.trim() === n);
  const schalter = () => root.querySelector('.wi-jschlaf');

  ok('die Jahrgangs-Zeilen sind aus der Liste verschwunden',
     root.querySelectorAll('.wi-jrow').length === 0,
     root.querySelectorAll('.wi-jrow').length + ' Zeilen');
  ok('dafür steht der Zustand als Schalter im Kopf',
     !!schalter() && schalter().textContent.trim() === 'wach',
     schalter() ? schalter().textContent.trim() : '—');

  /* Er legt den GEWÄHLTEN Jahrgang schlafen — den, dessen Units
     darunter stehen. */
  click(chip('Jhg 6'), document);
  await wait(30);
  click(schalter(), document);
  await wait(40);
  const letzte = calls.filter(c => c[0] === 'wi_solo_settings').pop();
  ok('der Schalter nimmt ALLE Stationen des Jahrgangs weg',
     letzte && letzte[1].p_sets.length === 1 && letzte[1].p_sets[0] === 'set-en-5',
     letzte ? JSON.stringify(letzte[1].p_sets) : '—');
  ok('… und die Insel schläft daraufhin ein',
     root.querySelectorAll('.wi-schlaf').length === 1,
     root.querySelectorAll('.wi-schlaf').length + ' Silhouetten');
  ok('… ihre Tiere auch',
     tool.stand().wachTiere.length === 40, tool.stand().wachTiere.length + '');
  ok('… und der Schalter sagt es jetzt selbst',
     schalter().textContent.trim() === 'schläft', schalter().textContent.trim());
  ok('… ebenso der Chip', chip('Jhg 6').classList.contains('is-schlaf'),
     chip('Jhg 6').className);

  /* ⚠️ Die Liste räumt sich nicht selbst weg: ein schlafender
     Jahrgang bleibt gewählt, seine Units stehen weiter da — nur
     alle pausiert. Sonst käme man an den Schalter nicht zurück. */
  ok('der schlafende Jahrgang bleibt gewählt',
     chip('Jhg 6').classList.contains('is-on'), chip('Jhg 6').className);
  ok('… und seine Units stehen weiter in der Liste',
     root.querySelectorAll('.wi-uone').length === 1 &&
     root.querySelectorAll('.wi-uone.is-on').length === 0,
     root.querySelectorAll('.wi-uone').length + ' Zeilen');

  /* Und wieder an. */
  click(schalter(), document);
  await wait(40);
  ok('derselbe Schalter weckt sie wieder',
     root.querySelectorAll('.wi-schlaf').length === 0
       && tool.stand().wachTiere.length === 80,
     tool.stand().wachTiere.length + ' wache Tiere');

  /* Der letzte Jahrgang lässt sich nicht abschalten: am Server
     heißt „nichts gewählt" nämlich „alles" (wi_solo_chosen). */
  /* ⚠️ Nach JEDEM Klick neu suchen: renderJChips zeichnet die Zeile
     neu, und ein vorher eingesammelter Knoten hängt danach nicht
     mehr im Dokument. Ein Klick darauf geht ins Leere — und der
     Prüfstand hielte den Schalter für kaputt. */
  ctx.toasts.length = 0;
  click(schalter(), document);          // Jhg 6 schläft
  await wait(40);
  click(chip('Jhg 5'), document);
  await wait(30);
  click(schalter(), document);          // … und Jhg 5 soll nicht mehr
  await wait(40);
  ok('der letzte Jahrgang bleibt an',
     tool.stand().archipele.filter(a => a.wach).length === 1,
     tool.stand().archipele.map(a => a.key + ':' + a.wach).join(' · '));
  ok('… und es wird gesagt, warum',
     ctx.toasts.some(t => /Jahrgang muss anbleiben/.test(t)),
     JSON.stringify(ctx.toasts));
  /* Und die Welt bleibt heil: genau eine Insel lebt, die andere
     schläft — kein Meer aus lauter Silhouetten. */
  ok('… also lebt weiter genau eine Insel',
     root.querySelectorAll('.wi-schlaf').length === 1
       && root.querySelectorAll('.wi-cell').length > 400,
     root.querySelectorAll('.wi-cell').length + ' Kacheln');

  tool.unmount();
}

/* ─── Die Jahrgangs-Chips im Kopf der Leiste ──────────────────────
   Sönke, 20.09.2026: „die Werte von alle Tiere ganz oben … müssen
   hinter alle Tiere … in eine Zeile. Hier sollen die Chips Jhg 5 /
   Jhg 6 und so auch für die Auswahl sein … im Bereich darunter gibt
   es jetzt gerade auch noch Jahrgang 5 und Jahrgang 6 … das ist
   doppelt drin … nur oben als Chip."

   Drei Zusagen, an denen alles hängt:
     · der Gesamtstand steht in EINER Zeile — Zahl, Wort, Punkte
     · der Chip WÄHLT: darunter steht genau ein Jahrgang
     · und er wählt nur — der Beutel bleibt unberührt, sonst legt
       ein Blick nebenbei eine Insel schlafen */
async function testJahrgangsChips() {
  console.log('\n— Die Jahrgangs-Chips —');

  const PLAN = [
    { key: 'en:5', grade: 5, woerter: 40 },
    { key: 'en:6', grade: 6, woerter: 30 },
    { key: 'en:x', woerter: 10 }
  ];
  const { tool, root, calls, document } = await mountSolo(
    soloWelt(PLAN), {
      wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } })
    });

  /* ── Oben das Ganze, in EINER Zeile ──────────────────────── */
  const griff = root.querySelector('[data-part="ugriff"]');
  ok('der Kopf zählt ALLE Tiere, auch die schlafenden',
     root.querySelector('[data-part="swords"]').textContent === '80',
     root.querySelector('[data-part="swords"]').textContent);
  ok('… und die Stufenreihe steht HINTER der Zahl, im selben Griff',
     griff.querySelectorAll('[data-part="slegend"] .wi-lg').length > 0,
     griff.textContent.replace(/\s+/g, ' ').trim());

  /* ── Darunter die Jahrgänge ──────────────────────────────── */
  const chips = () => [...root.querySelectorAll('.wi-jchip')];
  const chip = n => chips().find(c => c.textContent.trim() === n);
  ok('ein Chip je Jahrgang', chips().length === 3, chips().length + '');
  ok('… kurz beschriftet, „Eigene" für die Listen ohne Jahrgang',
     chips().map(c => c.textContent.trim()).join('|') === 'Jhg 5|Jhg 6|Eigene',
     chips().map(c => c.textContent.trim()).join('|'));

  /* Einer ist immer gewählt: die Liste darunter muss ja etwas
     zeigen. Voreingestellt ist der Jahrgang, an dem gearbeitet wird
     — das ist der, der in der Karte in der Mitte liegt. */
  const stat = () => root.querySelector('[data-part="jstat"]');
  ok('beim Öffnen ist genau ein Chip an',
     chips().filter(c => c.classList.contains('is-on')).length === 1,
     chips().map(c => c.className).join(' | '));
  ok('… und die Zahlen dieses Jahrgangs stehen darunter',
     stat().hidden === false && /40\s*Tiere/.test(stat().textContent),
     stat().textContent.replace(/\s+/g, ' ').trim());
  /* Die Units heißen in dieser Ansicht nach ihrem Insel-Schlüssel
     (soloWelt setzt `utitle: p.key`) — so sieht man an der Zeile
     selbst, aus welchem Jahrgang sie kommt. */
  ok('… und die Liste zeigt nur SEINE Unit',
     root.querySelectorAll('.wi-uone').length === 1 &&
     /en:5/.test(root.querySelector('.wi-uone').textContent),
     root.querySelector('.wi-uone').textContent.replace(/\s+/g, ' ').trim());

  const vorher = calls.filter(c => c[0] === 'wi_solo_settings').length;
  click(chip('Jhg 6'), document);
  await wait(30);
  ok('ein Tipp auf „Jhg 6" bringt seine Zahlen',
     /30\s*Tiere/.test(stat().textContent),
     stat().textContent.replace(/\s+/g, ' ').trim());
  ok('… mit derselben Stufenreihe wie oben',
     stat().querySelectorAll('.wi-lg').length > 0);
  ok('… der Chip ist markiert, der andere nicht mehr',
     chip('Jhg 6').classList.contains('is-on') &&
     !chip('Jhg 5').classList.contains('is-on'),
     chips().map(c => c.className).join(' | '));
  ok('… und die Liste darunter hat gewechselt',
     root.querySelectorAll('.wi-uone').length === 1 &&
     /en:6/.test(root.querySelector('.wi-uone').textContent),
     root.querySelector('.wi-uone').textContent.replace(/\s+/g, ' ').trim());
  ok('⚠️ und nirgends steht der Jahrgang ein zweites Mal',
     root.querySelectorAll('.wi-jrow').length === 0);

  /* ⚠️ DIE Zusage: wählen ist kein Eingriff. */
  ok('… ohne dass etwas an den Server geht',
     calls.filter(c => c[0] === 'wi_solo_settings').length === vorher);
  ok('… und ohne dass eine Insel einschläft',
     tool.stand().archipele.filter(a => a.wach).length === 3,
     tool.stand().archipele.map(a => a.key + ':' + a.wach).join(' · '));

  /* Ein zweiter Tipp auf denselben Chip ist folgenlos: irgendein
     Jahrgang steht immer unten, sonst wäre die Liste leer, ohne dass
     jemand etwas abgeschaltet hätte. */
  click(chip('Jhg 6'), document);
  await wait(30);
  ok('derselbe Chip noch einmal lässt alles, wie es ist',
     chip('Jhg 6').classList.contains('is-on') &&
     root.querySelectorAll('.wi-uone').length === 1,
     chips().map(c => c.className).join(' | '));

  /* ── Der Chip zeigt, was die Insel tut ───────────────────────
     Damit ist die Reihe nebenbei eine kleine Karte der Welt: man
     liest an ihr ab, woran gerade gearbeitet wird. */
  ok('noch schläft kein Chip',
     chips().every(c => !c.classList.contains('is-schlaf')),
     chips().map(c => c.className).join(' | '));
  click(root.querySelector('.wi-jschlaf'), document);
  await wait(40);
  ok('ein schlafend gelegter Jahrgang ist auch als Chip blass',
     chip('Jhg 6').classList.contains('is-schlaf')
       && !chip('Jhg 5').classList.contains('is-schlaf'),
     chips().map(c => c.className).join(' | '));
  ok('… und der Gesamtstand oben bleibt, was er war',
     root.querySelector('[data-part="swords"]').textContent === '80',
     root.querySelector('[data-part="swords"]').textContent);

  tool.unmount();

  /* ── Ein einziger Jahrgang: keine Reihe ─────────────────────
     Dieselbe Regel wie bei den Schildern und den Jahrgangs-Zeilen.
     Ein Chip, der wiederholt, was zwei Zeilen höher steht, kostet in
     einer Leiste neben einer Karte eine Zeile und sagt nichts. */
  const allein = await mountSolo(soloWelt([{ key: 'en:5', grade: 5, woerter: 40 }]));
  ok('bei einem einzigen Jahrgang steht keine Chip-Reihe da',
     allein.root.querySelectorAll('.wi-jchip').length === 0 &&
     allein.root.querySelector('[data-part="jchips"]').hidden === true);
  ok('… der Gesamtstand steht trotzdem im Kopf',
     allein.root.querySelector('[data-part="swords"]').textContent === '40',
     allein.root.querySelector('[data-part="swords"]').textContent);
  allein.tool.unmount();
}

/* Der Antwortweg. Derselbe wie im Raum, nur ohne Feld und ohne
   Serie — und mit dem Tier als eigentlicher Rückmeldung. */
async function testSoloUeben() {
  console.log('\n— Üben auf der eigenen Insel —');
  let stufe = 1;
  const { env, tool, root, calls, document } = await mountSolo(soloView(20, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] }
    }),
    wi_solo_answer: args => {
      if (args.p_input === 'house') {
        stufe = 2;
        return { ok: true, result: 'correct', item: 'w-3',
                 level_before: 1, level_after: 2, locked_for: 0,
                 task: { item: 'w-4', prompt: 'die Tafel', dir: 'de_en',
                         stage: 'type', level: 0, options: [] } };
      }
      return { ok: true, result: 'choice', item: 'w-3',
               task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'choice',
                       level: 1, options: ['house', 'mouse', 'horse', 'hose',
                                           'home', 'hound', 'hour', 'host'] } };
    },
    wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets || [] } })
  }, { live: true });

  const play = root.querySelector('[data-part="playov"]');
  ok('das Üben ist zu, solange niemand darauf tippt', play.hidden === true);

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);
  ok('„Vokabeln üben" öffnet den Kasten', play.hidden === false);
  ok('die Frage steht da',
     root.querySelector('[data-part="pword"]').textContent === 'das Haus');
  /* Die Aufschrift zählt ab EINS (13.09.2026): am Server ist das
     Stufe 1, auf dem Schirm steht „Stufe 2".

     Nur die Zahl, seit dem 14.09.2026 — Sönke: „schreibe nur Level 4,
     das reicht". Der Name der Stufe („geschlüpft") stand daneben und
     sagte dasselbe wie das Bild darüber. */
  ok('und das Tier mit seiner Stufe',
     root.querySelector('[data-part="pstage"]').textContent === 'Stufe 2',
     root.querySelector('[data-part="pstage"]').textContent);
  /* Die Lösung darf im DOM nirgends stehen — ein Kind mit
     Entwicklerwerkzeugen liest sie sonst ab, und nach der ersten
     Stunde steht sie im Klassenchat. */
  ok('die Lösung steht nirgends im Kasten', !/house/i.test(play.innerHTML));

  /* ── Was die Tastatur nicht wegschieben darf ──────────────────
     Eine Lage-Zusage und keine Optik-Zusage: das Eingabefeld und
     die Rückmeldung liegen AUSSERHALB des scrollenden Teils
     (.wi-ovbody). Solange das gilt, kann der Streifen, der neben
     einer Bildschirmtastatur übrig bleibt, sie nicht verschlucken —
     genau das war der Fehler vom 10.09.2026. Höhen und Abstände
     stehen in tool.css und werden hier nicht geprüft. */
  const scroller = play.querySelector('.wi-ovbody');
  ok('das Eingabefeld steht außerhalb des scrollenden Teils',
     !scroller.contains(root.querySelector('[data-part="pin"]')));
  /* Dieselbe Zusage wie im Raum, und aus demselben Grund: kein
     Formularfeld, keine Ausfüll-Leiste von Chrome über der
     Tastatur (Sönke, 11.09.2026). */
  ok('auch beim Üben ist das Antwortfeld kein Formularfeld',
     !play.querySelector('form, input, textarea'));
  ok('die Rückmeldung ebenso',
     !scroller.contains(root.querySelector('[data-part="pfb"]')));
  ok('die Frage aber steht darin — sie klebt oben',
     scroller.contains(root.querySelector('[data-part="pword"]')));

  const eingabe = antworte(root, document, 'hauz', '[data-part="pin"]');
  await wait(30);
  ok('daneben → acht Wörter zur Auswahl',
     root.querySelectorAll('[data-part="popts"] button').length === 8);
  ok('und das Eingabefeld tritt zurück',
     root.querySelector('[data-part="pform"]').hidden === true);

  // In diesem Prüflauf zeichnen beide Schleifen wirklich: die Karte
  // ihre Verwandlung, die Insel ihren Funkenkranz.
  const rafsVor = env.rafs;

  click([...root.querySelectorAll('[data-part="popts"] button')]
        .find(b => b.dataset.v === 'house'), document);
  await wait(30);
  ok('richtig → das Tier wächst',
     root.querySelector('.wi-lg--2') !== null && stufe === 2);

  /* ── Der Moment ────────────────────────────────────────────────
     Der Stufensprung ist die einzige Belohnung, die dieses Werkzeug
     zu vergeben hat. Geprüft wird nicht, wie sie aussieht — das
     sieht man —, sondern dass sie überhaupt STATTFINDET und dass
     ihr niemand dazwischenfunkt. */
  const jubel = root.querySelector('[data-part="plevel"]');
  ok('die Verwandlung wird angesagt',
     jubel.hidden === false &&
     /Gewachsen/.test(root.querySelector('[data-part="plevelb"]').textContent),
     root.querySelector('[data-part="plevelb"]').textContent);
  ok('und das Wort steht darin',
     /das Haus/.test(root.querySelector('[data-part="plevels"]').textContent),
     root.querySelector('[data-part="plevels"]').textContent);
  ok('die Stufe steht schon auf der neuen',
     root.querySelector('[data-part="pstage"]').textContent === 'Stufe 3',
     root.querySelector('[data-part="pstage"]').textContent);

  /* Sönkes Ansage vom 10.09.2026: die Verwandlung gehört aufs
     DISPLAY und nicht in den Übungskasten. Beim Tippen steht auf
     dem Tablet die Tastatur, und der Kasten ist dann ein Streifen —
     eine Belohnung, die man suchen muss, ist keine. */
  const buehne = root.querySelector('[data-part="cheer"]');
  ok('die Feier läuft auf der großen Bühne', buehne.hidden === false);
  ok('und der Übungskasten tritt dafür zurück',
     play.classList.contains('is-cheer'));
  ok('der Jubel steht auf der Bühne und nicht in der Karte',
     jubel.closest('[data-part="cheer"]') === buehne);
  /* Der Kern der Pause: solange die Verwandlung läuft, steht noch
     das Wort von eben da. Käme die nächste Frage sofort, liefe die
     Belohnung zwar ab, aber der Blick wäre schon unten. */
  ok('solange wartet die nächste Frage',
     root.querySelector('[data-part="pword"]').textContent === 'das Haus');
  ok('und es lässt sich nichts antworten',
     root.querySelector('[data-part="pin"]').classList.contains('is-locked') &&
     root.querySelector('[data-part="popts"]').classList.contains('is-wait'));

  /* Und ein zweiter Tipp auf die alte Auswahl darf NICHT durchgehen:
     die acht Knöpfe stehen noch da, das Wort ist aber durch. */
  const vorher = calls.filter(c => c[0] === 'wi_solo_answer').length;
  click([...root.querySelectorAll('[data-part="popts"] button')]
        .find(b => b.dataset.v === 'mouse'), document);
  await wait(20);
  ok('ein zweiter Tipp während der Feier geht ins Leere',
     calls.filter(c => c[0] === 'wi_solo_answer').length === vorher);

  await wait(1200);
  ok('danach kommt die nächste Frage',
     root.querySelector('[data-part="pword"]').textContent === 'die Tafel');
  ok('und sie ist wieder zum Tippen',
     root.querySelector('[data-part="pform"]').hidden === false);
  ok('der Jubel ist wieder weg', jubel.hidden === true);
  ok('die Bühne auch', buehne.hidden === true && !play.classList.contains('is-cheer'));
  ok('und das Feld ist frei',
     !root.querySelector('[data-part="pin"]').classList.contains('is-locked'));

  /* Und sie ist DURCHgezeichnet worden. Eischale, Blitz und Funken
     liegen in der Mitte des Verlaufs — wer nur das erste Bild prüft,
     prüft von dieser Feier genau nichts. */
  ok('die Verwandlung läuft ohne Fehler durch',
     env.rafFehler.length === 0,
     env.rafFehler.slice(0, 2).map(e => e.message).join(' · '));
  ok('und sie hat viele Bilder gebraucht', env.rafs - rafsVor > 40,
     `${env.rafs - rafsVor} Bilder`);

  /* ── Die Einstellungen ─────────────────────────────────────── */
  /* Seit 11.09.2026 trägt der Knopf nur noch ein Zahnrad. Ein Bild
     ohne aria-label ist für die Vorlesefunktion ein leerer Knopf —
     und das sieht man am Bildschirm nie. */
  const zahnrad = root.querySelector('[data-part="ssets"]');
  ok('das Zahnrad sagt trotzdem, was es ist',
     zahnrad.getAttribute('aria-label') === 'Einstellungen' &&
     zahnrad.querySelector('svg') !== null &&
     zahnrad.textContent.trim() === '');
  click(root.querySelector('[data-part="ssets"]'), document);
  await wait(20);
  const sets = root.querySelector('[data-part="setsov"]');
  ok('die Einstellungen gehen auf', sets.hidden === false);
  // Die Units sind seit 10.09.2026 in der Leiste. Hier stehen nur
  // noch Richtung und Abfrage-Art.
  ok('und tragen keine Unit-Kacheln mehr',
     root.querySelectorAll('.wi-setchip').length === 0);
  ok('dafür beide Segment-Schalter',
     root.querySelectorAll('[data-part="solodir"] .wi-modebtn').length === 3 &&
     root.querySelectorAll('[data-part="solomode"] .wi-modebtn').length === 2);

  click(root.querySelector('[data-part="setsclose"]'), document);
  ok('und wieder zu', sets.hidden === true);
  tool.unmount();
}

/* ══════════════════════════════════════════════════════════
   Die Unit-Leiste (10.09.2026)
   ══════════════════════════════════════════════════════════
   Sönke: „am Rand die Unit-Liste […] Ich kann eine durch
   Draufklicken aktivieren oder deaktivieren […] Jede Unit hat das i
   an der Seite."

   Geprüft wird das, was in einer Klasse als „geht nicht" auffiele:
   die Liste steht, der Schalter geht an den Server, das „i" holt die
   Unit und schreibt eine Vokabelliste, und die letzte Unit lässt
   sich nicht abschalten. */
async function testUnitLeiste() {
  console.log('\n— Die Unit-Leiste —');
  const { tool, root, calls, ctx, document } = await mountSolo(soloView(40, i => i % 5), {
    wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } }),
    wi_solo_unit: args => soloUnit(args.p_set, 40, i => i % 5)
  });

  const leiste = root.querySelector('[data-part="units"]');
  ok('die Leiste steht', leiste && leiste.hidden === false);
  const zeilen = root.querySelectorAll('.wi-urow');
  ok('eine Zeile je Unit', zeilen.length === 2, String(zeilen.length));
  ok('und beide sind an — leer heißt „alles"',
     root.querySelectorAll('.wi-urow.is-on').length === 2);
  /* Die Stufenpunkte je Unit kommen aus words_list und nicht vom
     Server: 20 Wörter je Unit über fünf Stufen. */
  ok('jede Unit zeigt ihre Stufen',
     zeilen[0].querySelectorAll('.wi-lg').length === 5,
     String(zeilen[0].querySelectorAll('.wi-lg').length));
  /* „Unit 1 (20)" — dieselbe Form wie „Units (40)" darüber. 40
     Wörter, abwechselnd auf zwei Units verteilt. */
  ok('und ihre Wortzahl in Klammern',
     zeilen[0].querySelector('.wi-uzahl').textContent.trim() === '(20)',
     zeilen[0].querySelector('.wi-uzahl').textContent);

  /* ── Abwählen ─────────────────────────────────────────────── */
  click(zeilen[0].querySelector('.wi-utoggle'), document);
  await wait(30);
  const letzte = calls.filter(c => c[0] === 'wi_solo_settings').pop();
  ok('das Abwählen geht an den Server', !!letzte && Array.isArray(letzte[1].p_sets),
     JSON.stringify(letzte && letzte[1]));
  ok('und zwar ohne die abgewählte Unit',
     letzte && letzte[1].p_sets.length === 1 && letzte[1].p_sets[0] === 'set-b',
     JSON.stringify(letzte && letzte[1].p_sets));
  ok('die Zeile ist danach blass',
     root.querySelectorAll('.wi-urow.is-on').length === 1);

  /* Die LETZTE bleibt an. Am Server heißt „nichts gewählt" nämlich
     „alles" — wer sie ausschalten könnte, bekäme alle zurück. */
  const vorher = calls.filter(c => c[0] === 'wi_solo_settings').length;
  ctx.toasts.length = 0;
  click(root.querySelectorAll('.wi-urow')[1].querySelector('.wi-utoggle'), document);
  await wait(30);
  ok('die letzte Unit lässt sich nicht abschalten',
     calls.filter(c => c[0] === 'wi_solo_settings').length === vorher &&
     ctx.toasts.length === 1, ctx.toasts.join(' · '));
  ok('und es steht auch da, warum',
     /Unit/.test(ctx.toasts[0] || ''), ctx.toasts[0]);

  /* ── Das „i" ──────────────────────────────────────────────── */
  click(root.querySelectorAll('.wi-urow')[0].querySelector('.wi-uinfo'), document);
  await wait(40);
  ok('das „i" holt die Unit',
     calls.some(c => c[0] === 'wi_solo_unit' && c[1].p_set === 'set-a'),
     JSON.stringify(calls.filter(c => c[0] === 'wi_solo_unit').map(c => c[1])));
  const det = root.querySelector('[data-part="udet"]');
  ok('die Übersicht ersetzt die Liste',
     det.hidden === false && root.querySelector('[data-part="ulist"]').hidden === true);
  /* Dasselbe Schema wie im Kopf der Leiste: erst „Titel (Anzahl)",
     dann die Stufenpunkte, dann die Zahlen. */
  ok('die Übersicht führt Titel und Wortzahl',
     det.querySelector('.wi-utitle').textContent.replace(/\s+/g, ' ').trim()
       === 'Unit 1 (20)',
     det.querySelector('.wi-utitle').textContent);
  ok('mit der Gesamt-Tabelle der Unit',
     det.querySelectorAll('.wi-stgrid .wi-stdir').length === 2);
  const woerter = det.querySelectorAll('.wi-wrow');
  ok('und einer Zeile je Wort', woerter.length === 20, String(woerter.length));
  ok('jede Zeile trägt ihr Monster und ihr Wort',
     woerter[0].querySelector('.wi-wmon') &&
     /wort0/.test(woerter[0].textContent), woerter[0].textContent.trim().slice(0, 40));
  ok('und vier Zahlen', woerter[1].querySelectorAll('.wi-wnum b').length === 4);

  /* Die Zahlen der Zeile sind die Summe beider Richtungen —
     [2,1,4,1] + [3,0,3,0] = richtig 5, mit Hilfe 1, falsch 1,
     gesamt 7. */
  const zahlen = [...woerter[1].querySelectorAll('.wi-wnum b')].map(b => b.textContent.trim());
  ok('und die Summe stimmt', zahlen.join('/') === '5/1/1/7', zahlen.join('/'));

  click(woerter[1], document);
  await wait(20);
  ok('ein Tipp auf die Zeile klappt beide Richtungen auf',
     det.querySelectorAll('.wi-wdet').length === 1 &&
     det.querySelectorAll('.wi-wdet .wi-stdir').length === 2);
  click(det.querySelectorAll('.wi-wrow')[1], document);
  await wait(20);
  ok('und wieder zu', det.querySelectorAll('.wi-wdet').length === 0);

  /* Zweimal dieselbe Unit = ein Aufruf. Eine Unit ändert sich
     zwischen zwei Übungen nicht. */
  const rufe = calls.filter(c => c[0] === 'wi_solo_unit').length;
  click(det.querySelector('[data-zurueck]'), document);
  await wait(20);
  ok('„zurück" zeigt wieder die Liste',
     root.querySelector('[data-part="ulist"]').hidden === false && det.hidden === true);
  click(root.querySelectorAll('.wi-urow')[0].querySelector('.wi-uinfo'), document);
  await wait(40);
  ok('und die zweite Ansicht kommt aus dem Speicher',
     calls.filter(c => c[0] === 'wi_solo_unit').length === rufe, String(rufe));

  /* ── Einklappen ───────────────────────────────────────────── */
  /* `--wi-rand` ist die gemessene Breite der Leiste. Zwei lesen
     sie: die Kamera (sie zentriert die Insel auf den Rest) und das
     Kärtchen unten rechts (es muss NEBEN die Leiste). Steht die
     Zahl nicht mehr, liegt beides hinter der Leiste — und das sieht
     man erst am Gerät. */
  const rand = () => {
    const m = /--wi-rand:\s*(\d+)px/.exec(root.getAttribute('style') || '');
    return m ? +m[1] : null;
  };
  ok('die offene Leiste meldet ihre Breite', rand() > 0, String(rand()));

  click(root.querySelector('[data-part="ugriff"]'), document);
  await wait(20);
  ok('der Griff klappt die Leiste zu',
     leiste.classList.contains('is-zu') &&
     root.querySelector('[data-part="ubody"]').hidden === true);
  ok('die Stufenpunkte gehen mit zu',
     root.querySelector('[data-part="slegend"]').hidden === true);
  ok('und die Insel bekommt ihren Platz zurück', rand() === 0, String(rand()));

  click(root.querySelector('[data-part="ugriff"]'), document);
  await wait(20);
  ok('und wieder auf',
     !leiste.classList.contains('is-zu') &&
     root.querySelector('[data-part="ubody"]').hidden === false &&
     root.querySelector('[data-part="slegend"]').hidden === false);

  tool.unmount();
}

/* ══════════════════════════════════════════════════════════
   Der Unit-Baum (15.09.2026, Migration 0150)
   ══════════════════════════════════════════════════════════
   Sönke: „unit anklicken und auswählen und in der unit die
   unterkathegorien wählen".

   Geprüft wird, was in einer Klasse als „geht nicht" auffiele: die
   Stationen stecken unter ihrer Unit, der Pfeil klappt sie auf und
   zu und merkt sich das, der Sammelschalter legt alle auf einmal
   um — und die letzte Station lässt sich auch über ihn nicht
   abschalten. */
async function testUnitBaum() {
  console.log('\n— Der Unit-Baum —');
  const { env, tool, root, calls, ctx, document } = await mountSolo(
    soloBaum(40, i => i % 5), {
      wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } })
    });

  /* ── Die Gliederung ─────────────────────────────────────────
     Seit dem 20.09.2026 wählt der Chip im Kopf den Jahrgang, und
     die Liste zeigt GENAU DIESEN einen. Die Jahrgangs-Zeilen, die
     vorher zwischen den Units standen, sind weg — Sönke: „das ist
     doppelt drin … nur oben als Chip." */
  const chips = () => [...root.querySelectorAll('.wi-jchip')];
  const chip = n => chips().find(c => c.textContent.trim() === n);
  const grp = chips().map(c => c.textContent.trim());
  ok('drei Jahrgangs-Chips', grp.length === 3, JSON.stringify(grp));
  ok('… und sie heißen nach dem Jahrgang',
     grp[0] === 'Jhg 5' && grp[1] === 'Jhg 6', JSON.stringify(grp));
  /* Eine eigene Liste hat keinen Jahrgang. „Jahrgang null" wäre
     eine Behauptung — sie bekommt einen eigenen Chip. */
  ok('… die jahrgangslose Liste steht unter „Eigene"',
     grp[2] === 'Eigene', JSON.stringify(grp));
  ok('… und keine davon steht ein zweites Mal in der Liste',
     root.querySelectorAll('.wi-jrow').length === 0);
  /* Die Zahlen-Zeile zählt die Wörter der gewählten Insel — das ist
     dieselbe Zahl, die auf dem Schild draußen steht. 40 Wörter
     reihum auf fünf Sätze = 8 je Satz, Jahrgang 5 hat drei. */
  const stat = () => root.querySelector('[data-part="jstat"]');
  ok('… die Zahlen-Zeile zählt die Tiere des gewählten Jahrgangs',
     /\b24\s*Tiere/.test(stat().textContent),
     stat().textContent.replace(/\s+/g, ' ').trim());

  const kisten = root.querySelectorAll('.wi-ubox');
  ok('Jahrgang 5 bringt genau EINE aufklappbare Unit',
     kisten.length === 1, String(kisten.length));
  ok('… nämlich die mit drei Stationen',
     kisten[0].querySelectorAll('.wi-ustat').length === 3,
     String(kisten[0].querySelectorAll('.wi-ustat').length));
  ok('… und keine Unit am Stück',
     root.querySelectorAll('.wi-uone').length === 0,
     String(root.querySelectorAll('.wi-uone').length));

  /* Die Zahl an der Unit ist die Summe ihrer Stationen. */
  ok('die Unit zählt die Wörter ihrer Stationen',
     kisten[0].querySelector('.wi-utop .wi-uzahl').textContent.trim() === '(24)',
     kisten[0].querySelector('.wi-utop .wi-uzahl').textContent);

  /* ── Der Chip wechselt die Liste ────────────────────────────
     Die beiden anderen Jahrgänge bringen je eine Unit am Stück. */
  click(chip('Jhg 6'), document);
  await wait(20);
  ok('der Chip „Jhg 6" bringt seine Unit am Stück',
     root.querySelectorAll('.wi-uone').length === 1 &&
     root.querySelectorAll('.wi-ubox').length === 0,
     root.querySelectorAll('.wi-uone').length + ' am Stück, ' +
     root.querySelectorAll('.wi-ubox').length + ' aufklappbar');
  /* ⚠️ Das ist die Zusage hinter „eine Unit mit einer Station IST
     eine Unit am Stück": ein Pfeil, der eine einzige Zeile
     freilegt, ist eine Bitte um einen Klick ohne Gegenwert. */
  ok('… und trägt KEINEN Aufklapp-Pfeil',
     root.querySelectorAll('.wi-uone .wi-uchevb').length === 0);
  ok('… dafür ihr „i" selbst',
     root.querySelectorAll('.wi-uone .wi-uinfo').length === 1);
  click(chip('Eigene'), document);
  await wait(20);
  ok('„Eigene" bringt die Liste ohne Jahrgang',
     /Klassenarbeit/.test((root.querySelector('.wi-uone') || {}).textContent || ''),
     (root.querySelector('.wi-uone') || {}).textContent);

  click(chip('Jhg 5'), document);
  await wait(20);

  /* ── Auf- und Zuklappen ─────────────────────────────────────
     ⚠️ Neu suchen: die Chip-Klicks oben haben die Liste dreimal neu
     gezeichnet, und `kisten` von vorhin hängt nicht mehr im
     Dokument. */
  const kiste = root.querySelector('.wi-ubox');
  ok('bei wenigen Units steht sie offen',
     kiste.classList.contains('is-auf') &&
     kiste.querySelector('.wi-ustats').hidden === false);
  click(kiste.querySelector('.wi-utop .wi-uchevb'), document);
  await wait(20);
  const zu = root.querySelector('.wi-ubox');
  ok('der Pfeil klappt die Stationen zu',
     !zu.classList.contains('is-auf') &&
     zu.querySelector('.wi-ustats').hidden === true);
  /* ⚠️ Nicht bloß „unsichtbar": das Zuklappen muss die Wahl der
     Stationen UNBERÜHRT lassen. Wer zuklappt, hört nicht auf zu
     üben. */
  ok('… ohne etwas an den Server zu schicken',
     calls.filter(c => c[0] === 'wi_solo_settings').length === 0);
  ok('… und es ist gemerkt',
     /u-test/.test(env.localStorage.getItem('mpskills.wordisland.unitklapp') || ''),
     env.localStorage.getItem('mpskills.wordisland.unitklapp'));
  click(root.querySelector('.wi-ubox .wi-uchevb'), document);
  await wait(20);
  ok('und wieder auf',
     root.querySelector('.wi-ubox').classList.contains('is-auf'));

  /* ── Der Sammelschalter ─────────────────────────────────────
     Gezählt wird, was WÖRTER trägt und gerade dasteht: die drei
     Stationen von Jahrgang 5. Die Unit-Kopfzeile ist auch eine
     `.wi-urow` und wäre hier eine vierte, die nichts eigenes
     anschaltet. */
  const anZahl = () => root.querySelectorAll('.wi-ustat.is-on, .wi-uone.is-on').length;
  ok('am Anfang sind alle an — leer heißt „alles"', anZahl() === 3, String(anZahl()));

  click(root.querySelector('.wi-utop .wi-utoggle'), document);
  await wait(30);
  let letzte = calls.filter(c => c[0] === 'wi_solo_settings').pop();
  ok('der Sammelschalter geht an den Server', !!letzte,
     JSON.stringify(letzte && letzte[1]));
  ok('… und nimmt ALLE drei Stationen auf einmal weg',
     letzte && letzte[1].p_sets.length === 2 &&
     !letzte[1].p_sets.some(x => ['set-a', 'set-b', 'set-c'].includes(x)),
     JSON.stringify(letzte && letzte[1].p_sets));
  ok('die Stationen sind danach alle blass',
     root.querySelectorAll('.wi-ustat.is-on').length === 0);

  /* Zurück: eine halb angeschaltete Unit geht ZUERST ganz an.
     „teilweise" ist ein Zustand, den man ohne drei Tipps verlassen
     können muss. */
  click(root.querySelector('.wi-ustat .wi-utoggle'), document);
  await wait(30);
  const halb = root.querySelector('.wi-utop');
  ok('eine Station an macht die Unit „teilweise"',
     halb.classList.contains('is-halb') &&
     /teilweise/.test(halb.textContent), halb.textContent.replace(/\s+/g, ' ').trim());
  click(halb.querySelector('.wi-utoggle'), document);
  await wait(30);
  letzte = calls.filter(c => c[0] === 'wi_solo_settings').pop();
  ok('… und der Sammelschalter macht daraus GANZ an',
     ['set-a', 'set-b', 'set-c'].every(x => letzte[1].p_sets.includes(x)),
     JSON.stringify(letzte[1].p_sets));

  /* ── Die letzte Station bleibt an ─────────────────────────── */
  /* Erst die beiden Einzel-Units aus — die wohnen in den anderen
     beiden Jahrgängen, also über den Chip —, dann die Unit mit den
     drei Stationen: die darf nicht gehen. Am Server heißt „nichts
     gewählt" nämlich „alles" (wi_solo_chosen, 0136). */
  /* ⚠️ Nach JEDEM Klick neu suchen: renderUnits zeichnet die Liste
     neu, und eine vorher eingesammelte Knotenliste zeigt danach auf
     Elemente, die nicht mehr im Dokument hängen. Ein Klick darauf
     geht ins Leere — und der Prüfstand hielte den zweiten Schalter
     für kaputt. */
  for (const name of ['Jhg 6', 'Eigene']) {
    click(chip(name), document);
    await wait(20);
    const one = root.querySelector('.wi-uone.is-on .wi-utoggle');
    if (!one) continue;
    click(one, document);
    await wait(30);
    ok(`die Einzel-Unit in „${name}" lässt sich abschalten`,
       root.querySelectorAll('.wi-uone.is-on').length === 0,
       String(root.querySelectorAll('.wi-uone.is-on').length));
  }
  click(chip('Jhg 5'), document);
  await wait(20);

  const vorher = calls.filter(c => c[0] === 'wi_solo_settings').length;
  ctx.toasts.length = 0;
  click(root.querySelector('.wi-utop .wi-utoggle'), document);
  await wait(30);
  ok('⚠️ der Sammelschalter kann die LETZTE Unit nicht abschalten',
     calls.filter(c => c[0] === 'wi_solo_settings').length === vorher &&
     ctx.toasts.length === 1, ctx.toasts.join(' · '));
  ok('… und sagt auch, warum',
     /Station/.test(ctx.toasts[0] || ''), ctx.toasts[0]);

  tool.unmount();
}

/* Der Tipp auf eine Echse. Er ist der einzige Griff im ganzen
   Werkzeug, der nicht auf ein DOM-Element zeigt: die Tiere liegen
   auf einer Leinwand, getroffen wird gegen das zuletzt gezeichnete
   Bild. */
async function testTierTipp() {
  console.log('\n— Eine Echse antippen —');
  const { tool, root, calls, document } = await mountSolo(soloView(40, i => i % 5), {
    wi_solo_unit: args => soloUnit(args.p_set, 40, i => i % 5)
  }, { live: true });
  // Ein paar Bilder, damit die Herde steht und ihre Geometrie
  // frisch ist.
  await wait(60);

  const karte = root.querySelector('[data-part="card"]');
  ok('das Kärtchen ist zu, solange niemand tippt', karte.hidden === true);

  const treffer = tippeAufTier(root, document);
  ok('ein Tipp auf ein Tier öffnet das Kärtchen', !!treffer,
     treffer ? `bei ${treffer.x}/${treffer.y}` : 'kein Tier getroffen');
  if (treffer) {
    await wait(40);
    ok('und darin steht die Vokabel', /wort\d/.test(karte.textContent),
       karte.textContent.trim().slice(0, 60).replace(/\s+/g, ' '));
    ok('mit beiden Richtungen',
       karte.querySelectorAll('.wi-stgrid .wi-stdir').length === 2);
    ok('geholt wurde die Unit des Wortes',
       calls.some(c => c[0] === 'wi_solo_unit'),
       JSON.stringify(calls.filter(c => c[0] === 'wi_solo_unit').map(c => c[1])));
    /* Es hängt unten rechts und wird nicht mehr an den Finger
       gesetzt (Sönke, 10.09.2026). Ein inline gesetztes left/top
       wäre der Rückfall — dann liefe es wieder über die Tiere. */
    ok('das Kärtchen hat einen festen Platz und klebt nicht am Finger',
       !/left|top/.test(karte.getAttribute('style') || ''),
       karte.getAttribute('style') || '(ohne style)');
    ok('und trägt seinen eigenen Namen — nicht den der Raum-Karten',
       karte.classList.contains('wi-tcard') && !karte.classList.contains('wi-card'));

    /* Derselbe nachgereichte Klick wie beim Volks-Kasten: das
       Kärtchen steht unten rechts, und wer dort eine Echse antippt,
       trifft danach sein eigenes Schließkreuz. Es ginge auf und im
       selben Augenblick wieder zu. */
    click(karte.querySelector('[data-zu]'), document);
    ok('der Klick, der dem Tipp hinterherkommt, macht es NICHT zu',
       karte.hidden === false);

    await wait(470);
    click(karte.querySelector('[data-zu]'), document);
    ok('der Schließer macht es wieder zu', karte.hidden === true);
  }

  /* Ein Ziehen ist kein Tipp. Ohne diese Trennung wäre das
     Verschieben der Insel unbenutzbar: bei jedem Loslassen spränge
     ein Kärtchen auf. */
  const stage = root.querySelector('[data-part="stage"]');
  zeig(stage, document, 'pointerdown', 600, 300);
  zeig(stage, document, 'pointermove', 700, 380);
  zeig(stage, document, 'pointerup', 700, 380);
  ok('ein Ziehen öffnet nichts', karte.hidden === true);

  tool.unmount();
}

/* Die funkelnde Stufe hat ihr eigenes Bild (13.09.2026).

   Sönkes Meldung war „die funkelnden Echsen erkennt man gar nicht",
   und der erste Grund dafür war der einfachste: sie trugen das Bild
   der ausgewachsenen. Das ist seitdem anders — und weil man es auf
   der Leinwand nicht ablesen kann (die Tiere sind eingefärbte
   Leinwände ohne Adresse), wird hier der ZUSCHNITT geprüft: jede
   Vorlage hat ihre eigene Größe, und die Größen der Stufe 4 sind
   andere als die der Stufe 3.

   Ohne diese Zusage wäre der Prüfstand grün, während auf dem Tablet
   weiter eine ausgewachsene Echse steht — genau der Zustand, der
   gemeldet wurde. */
async function testFunkelBild() {
  console.log('\n— Die funkelnde Stufe —');
  const dir = path.join(HERE, '..', 'sprites', 'tier');
  const masse = k => { const m = pngMasse(path.join(dir, k + '.png')); return m.w + '×' + m.h; };
  const KEYS = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4));
  const tierMasse = new Map();           // „249×299" → Schlüssel
  for (const k of KEYS) tierMasse.set(masse(k), k);
  ok('die Zuschnitte sind unterscheidbar', tierMasse.size === KEYS.length,
     `${tierMasse.size} von ${KEYS.length}`);

  // Eine Insel, auf der JEDES Wort ganz gelernt ist.
  const { env, tool } = await mountSolo(soloView(24, () => 4), null, { live: true });
  await wait(60);

  const gemalteTiere = env.gemalt
    .map(g => tierMasse.get(g.iw + '×' + g.ih))
    .filter(Boolean);
  ok('die Tiere werden gezeichnet', gemalteTiere.length > 0,
     String(gemalteTiere.length));
  const falsch = [...new Set(gemalteTiere.filter(k => !/^s4/.test(k)))];
  ok('und auf einer Insel aus lauter Stufe-4-Wörtern sind es die Stufe-4-Bilder',
     falsch.length === 0, falsch.join(', ') || [...new Set(gemalteTiere)].join(', '));
  tool.unmount();

  /* Die Gegenprobe: eine Insel aus ausgewachsenen Wörtern darf KEIN
     Stufe-4-Bild zeigen. Sonst wäre die Zusage oben auch dann grün,
     wenn alle Tiere dasselbe Bild tragen. */
  {
    const m3 = await mountSolo(soloView(24, () => 3), null, { live: true });
    await wait(60);
    const k3 = m3.env.gemalt.map(g => tierMasse.get(g.iw + '×' + g.ih)).filter(Boolean);
    const zuHoch = [...new Set(k3.filter(k => /^s4/.test(k)))];
    ok('und die ausgewachsene bleibt bei ihrem', k3.length > 0 && zuHoch.length === 0,
       zuHoch.join(', ') || [...new Set(k3)].join(', '));
    m3.tool.unmount();
  }
}

/* Die eigene Figur und das eigene Schiff (11.09.2026).

   Geprüft wird, was man am Schreibtisch prüfen kann: dass die
   Bilder wirklich daliegen, dass ein Tipp auf die Figur den richtigen
   Kasten öffnet (und nicht das Kärtchen der Echsen), dass die
   Voreinstellung die Brokkoli-Giraffen sind und dass ein Wechsel
   sofort gilt und am Server ankommt. Wie es AUSSIEHT, prüft linkedom
   nicht — das bleibt der Blick aufs Gerät. */
async function testFigur() {
  console.log('\n— Figur und Schiff —');
  const gesetzt = [];
  const { tool, root, env, calls, document } = await mountSolo(soloView(40, i => i % 5), {
    wi_solo_avatar: args => { gesetzt.push(args.p_faction); return { ok: true, settings: { faction: args.p_faction } }; },
    wi_solo_unit: args => soloUnit(args.p_set, 40, i => i % 5)
  }, { live: true });
  await wait(60);

  ok('die Bilder von Figur und Schiff liegen wirklich da',
     env.fehlendeBilder.length === 0, env.fehlendeBilder.join(', '));
  // Voreinstellung: Brokkoli-Giraffen, also Volk 2 (Sönkes Vorgabe).
  // Ohne Serverstand ist das eigene Level 1, also die erste der vier
  // Bildstufen (`_1`) — siehe testFigurLevel für die anderen.
  ok('geladen wird die Figur des voreingestellten Volkes',
     env.geladeneBilder.includes('tools/wordisland/sprites/held/2_1.png'));
  ok('und sein Schiff',
     env.geladeneBilder.includes('tools/wordisland/sprites/boot/2.png'));

  /* Die Maße, mit denen wirklich gemalt wurde. Sie stehen in keinem
     Attribut — nur im Aufruf, den machKontext mitschreibt. */
  const gemalt = teil => {
    for (let i = env.gemalt.length - 1; i >= 0; i--) {
      if (env.gemalt[i].src.includes(teil)) return env.gemalt[i];
    }
    return null;
  };
  const figur2 = gemalt('sprites/held/2_1.png');
  const schiff2 = gemalt('sprites/boot/2.png');
  ok('beide werden auch gezeichnet', !!figur2 && !!schiff2);

  const kasten = root.querySelector('[data-part="volkov"]');
  const karte = root.querySelector('[data-part="card"]');
  ok('der Kasten ist zu, solange niemand tippt', kasten.hidden === true);

  const treffer = tippeAufFigur(root, document);
  ok('ein Tipp auf Figur oder Schiff öffnet ihn', !!treffer,
     treffer ? `bei ${treffer.x}/${treffer.y}` : 'nichts getroffen');
  if (!treffer) { tool.unmount(); return; }

  /* Und zwar IHN und nicht das Kärtchen der Echsen. Beide hängen am
     selben Tipp; wer das verwechselt, merkt es sonst erst am Gerät. */
  ok('und nicht das Kärtchen einer Vokabel', karte.hidden === true);
  ok('darin steht die Figur, nicht das Schiff',
     /held\/2_1\.png$/.test(root.querySelector('[data-part="vbig"]').getAttribute('src') || ''),
     root.querySelector('[data-part="vbig"]').getAttribute('src'));
  ok('der Name des Volkes steht daneben',
     root.querySelector('[data-part="vname"]').textContent === 'Brokkoli-Giraffen');

  /* ── Umgezogen wird woanders (13.09.2026) ────────────────────
     Sönke: „die Volkswechsel-Geschichte muss da, wo sie ist, weg —
     ich brauche ein kleines Icon an dem Charakter, welches mich zum
     Wechselmenü führt." Der Kasten „Wer bist du?" handelt seitdem
     von Erreichtem; die acht Knöpfe gibt es erst NACH dem Zeichen
     an der Figur. */
  const wechsel = root.querySelector('[data-part="volkwov"]');
  ok('die acht Völker stehen nicht mehr im Charakter-Kasten',
     wechsel.hidden === true
     && root.querySelector('[data-part="volkov"] .wi-vbtn') === null
     && root.querySelectorAll('.wi-vbtn').length === 0,
     String(root.querySelectorAll('.wi-vbtn').length));

  /* ⚠️ Der Klick, der dem Tipp hinterherkommt. Auf dem Tablet
     schickt der Browser nach dem Loslassen an DERSELBEN Stelle noch
     einen Klick nach — und dort steht jetzt das Zeichen an der
     Figur. Sönkes Meldung vom 11.09.2026, seit dem Umbau gilt sie
     für dieses Zeichen. */
  click(root.querySelector('[data-part="vswap"]'), document);
  await wait(30);
  ok('der Klick, der dem Tipp hinterherkommt, öffnet NICHTS',
     wechsel.hidden === true);
  click(root.querySelector('[data-part="volkclose"]'), document);
  ok('und macht den Kasten auch nicht gleich wieder zu', kasten.hidden === false);

  // Nach der Sperre (450 ms) ist wieder jeder Klick gemeint.
  await wait(470);
  click(root.querySelector('[data-part="vswap"]'), document);
  await wait(30);
  ok('das Zeichen an der Figur führt zum Wechselmenü', wechsel.hidden === false);
  ok('und der Charakter-Kasten bleibt dahinter stehen', kasten.hidden === false);

  const knoepfe = [...root.querySelectorAll('.wi-vbtn')];
  ok('dort stehen alle acht Völker zur Wahl', knoepfe.length === 8, String(knoepfe.length));
  ok('das eigene ist hervorgehoben',
     knoepfe.filter(b => b.classList.contains('is-on')).map(b => b.dataset.v).join() === '2');
  ok('kein Hinweis, solange der Server mitspielt',
     root.querySelector('[data-part="vhint"]').hidden === true);

  click(knoepfe[5], document);
  await wait(30);
  ok('ein anderes Volk wird sofort übernommen',
     root.querySelector('[data-part="vname"]').textContent === 'Okto-Pferdchen');
  ok('und beim Server gemerkt', gesetzt.join() === '5', js(gesetzt));
  ok('die neuen Bilder werden geholt',
     env.geladeneBilder.includes('tools/wordisland/sprites/held/5_1.png')
     && env.geladeneBilder.includes('tools/wordisland/sprites/boot/5.png'));
  ok('gesetzt wird über wi_solo_avatar und nicht über wi_solo_settings',
     calls.some(c => c[0] === 'wi_solo_avatar')
     && !calls.some(c => c[0] === 'wi_solo_settings'));

  /* ── Die Maßstäbe (Sönke, 11.09.2026) ────────────────────────
     „Das Schiff kann 10 % größer. Die Brokkoli-Giraffen 10 %
     kleiner. Die anderen Völker 30 % kleiner (die Giraffen sind
     halt lang und dünn)."

     Gemessen wird die HÖHE der Figur: sie ist das, was HELD_SKAL
     stellt, und sie hängt nicht am Seitenverhältnis des Bildes.
     Zwischen den beiden Messungen bewegt sich die Kamera nicht,
     die Kachelgröße ist also dieselbe. */
  await wait(80);
  const figur5 = gemalt('sprites/held/5_1.png');
  ok('auch die neue Figur wird gezeichnet', !!figur5);
  if (figur2 && figur5) {
    const v = figur5.h / figur2.h;
    ok('die Giraffen sind größer als die anderen sieben Völker (7 zu 9)',
       Math.abs(v - 7 / 9) < .02, v.toFixed(3));
  }
  if (figur2 && schiff2) {
    /* Das Schiff wird über seine BREITE gestellt (BOOT_BREIT). Vor
       dem 11.09.2026 stand es bei 3.6 zu 2.6 Kacheln = 1.38 mal der
       Figurenhöhe, jetzt bei 3.96 zu 2.34 = 1.69. Die Grenze liegt
       dazwischen: sie fällt, wenn eine der beiden Zahlen still
       zurückgedreht wird. */
    const v = schiff2.w / figur2.h;
    ok('und das Schiff überragt die Figur deutlicher als vorher',
       v > 1.6, v.toFixed(3));
  }

  /* Zurück aus dem Abstecher: das Wechselmenü geht zu, der
     Charakter-Kasten steht noch — und trägt jetzt das neue Volk. */
  click(root.querySelector('[data-part="volkwclose"]'), document);
  ok('das Wechselmenü lässt den Charakter-Kasten zurück',
     wechsel.hidden === true && kasten.hidden === false);
  ok('und der zeigt das neue Volk',
     /held\/5_1\.png$/.test(root.querySelector('[data-part="vbig"]').getAttribute('src') || ''),
     root.querySelector('[data-part="vbig"]').getAttribute('src'));

  // Ein Ziehen ist kein Tipp — dieselbe Trennung wie bei den Echsen.
  const stage = root.querySelector('[data-part="stage"]');
  click(root.querySelector('[data-part="volkclose"]'), document);
  ok('der Schließer macht ihn wieder zu', kasten.hidden === true);
  zeig(stage, document, 'pointerdown', treffer.x, treffer.y);
  zeig(stage, document, 'pointermove', treffer.x + 90, treffer.y + 70);
  zeig(stage, document, 'pointerup', treffer.x + 90, treffer.y + 70);
  ok('ein Ziehen über die Figur öffnet nichts', kasten.hidden === true);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Die Figur trägt ihr Level — 14.09.2026
   ═══════════════════════════════════════════════════════════
   Sönke: „ich bin mit meinem Charakter eigentlich Level 2, habe aber
   immer noch das Sprite von Level 1. […] und alle Icons in der
   Auswahl [sollen] auf Level 2 gehen."

   Es ist ein Prüfstand mit zwei Hälften, und die zweite ist die
   wichtigere:

   1. Der PFAD stimmt — held/<volk>_<stufe>.png, und die Stufe kommt
      aus dem Level und nicht aus der Luft.
   2. Die DATEI liegt da. Das ist der Teil, der den Fehler vom
      14.09.2026 überhaupt erst möglich gemacht hat: der Pfad war
      schon richtig gebaut, nur zeigte er ins Leere, und der
      onerror-Rückfall hat das so gründlich verdeckt, dass es nach
      „das Sprite ändert sich nicht" aussah statt nach „das Bild
      fehlt". Ein Prüfstand, der nur Zeichenketten vergleicht,
      wäre an genau diesem Fehler grün geblieben.

   Deshalb werden die acht Daumennägel hier vom Blatt gelesen und auf
   der Platte nachgeschlagen — die Attrappe FakeImage sieht sie
   nicht, weil sie <img>-Knoten im Blatt sind und keine `new Image`. */
async function testFigurLevel() {
  console.log('\n— Die Figur trägt ihr Level —');

  const pfadDa = p => fs.existsSync(path.join(MPSKILLS, decodeURI(String(p))));
  const src = el => (el && el.getAttribute('src')) || '';

  /* Level 2, Volk bleibt die Voreinstellung (Brokkoli-Giraffen). */
  const m = await mountSolo(
    soloView(30, () => 1, false, playerStand(2, 290, { level_max: 2 })),
    { wi_solo_avatar: args => ({ ok: true, settings: { faction: args.p_faction } }) },
    { live: true });
  await wait(60);

  ok('auf der Insel läuft die zweite Fassung',
     m.env.geladeneBilder.includes('tools/wordisland/sprites/held/2_2.png'),
     m.env.geladeneBilder.filter(v => /held\//.test(v)).join(', '));
  ok('und keine davon fehlt', m.env.fehlendeBilder.length === 0,
     m.env.fehlendeBilder.join(', '));

  ok('der Tipp auf die Figur öffnet den Kasten', !!tippeAufFigur(m.root, m.document));
  ok('darin steht dieselbe zweite Fassung',
     /held\/2_2\.png$/.test(src(m.root.querySelector('[data-part="vbig"]'))),
     src(m.root.querySelector('[data-part="vbig"]')));

  await wait(470);   // die Sperre gegen den nachgereichten Klick
  click(m.root.querySelector('[data-part="vswap"]'), m.document);
  await wait(30);

  const daumen = [...m.root.querySelectorAll('.wi-vbtn img')];
  ok('in der Auswahl stehen acht Daumennägel', daumen.length === 8, String(daumen.length));
  /* Alle acht auf Level 2 — nicht nur das eigene Volk. Genau das war
     Sönkes zweiter Satz: man wählt eine Gestalt und soll sehen,
     welche man bekommt, und das ist die auf dem eigenen Stand. */
  ok('und alle acht tragen die zweite Fassung',
     daumen.every((im, i) => new RegExp('held/' + i + '_2k\\.png$').test(src(im))),
     daumen.map(src).join(', '));
  ok('alle acht Bilder liegen wirklich auf der Platte',
     daumen.every(im => pfadDa(src(im))),
     daumen.map(src).filter(p => !pfadDa(p)).join(', ') || '—');
  ok('und keines davon trägt Gold',
     daumen.every(im => !(im.getAttribute('style') || '').includes('sepia')));
  m.tool.unmount();

  /* ── Level 5: vier Bilder, fünf Level ────────────────────────
     Die oberste Stufe hat KEIN eigenes Bild. Sie ist die vierte in
     Gold (HELD_GOLD_FILTER) — sonst müsste Sönke acht Bilder mehr
     zeichnen, um „noch etwas mehr als Stufe 4" zu sagen. */
  const g = await mountSolo(
    soloView(30, () => 4, false, playerStand(5, 700, { level_max: 5 })),
    { wi_solo_avatar: args => ({ ok: true, settings: { faction: args.p_faction } }) },
    { live: true });
  await wait(60);

  ok('Level 5 holt kein fünftes Bild, sondern das vierte',
     g.env.geladeneBilder.includes('tools/wordisland/sprites/held/2_4.png')
     && !g.env.geladeneBilder.some(v => /held\/\d+_5/.test(v)),
     g.env.geladeneBilder.filter(v => /held\//.test(v)).join(', '));
  ok('und auch bei Level 5 fehlt kein Bild', g.env.fehlendeBilder.length === 0,
     g.env.fehlendeBilder.join(', '));

  tippeAufFigur(g.root, g.document);
  const gross = g.root.querySelector('[data-part="vbig"]');
  ok('im Kasten steht die vierte Fassung',
     /held\/2_4\.png$/.test(src(gross)), src(gross));
  ok('und sie trägt Gold',
     (gross.getAttribute('style') || '').includes('sepia'),
     gross.getAttribute('style'));

  await wait(470);
  click(g.root.querySelector('[data-part="vswap"]'), g.document);
  await wait(30);
  const gDaumen = [...g.root.querySelectorAll('.wi-vbtn img')];
  ok('auch die acht Daumennägel sind golden',
     gDaumen.length === 8
     && gDaumen.every(im => (im.getAttribute('style') || '').includes('sepia')
                         && /_4k\.png$/.test(src(im))),
     gDaumen.map(src).join(', '));
  g.tool.unmount();
}

/* Dieselbe Wahl an einer Datenbank ohne 0143. Sie muss GELTEN (das
   Gerät merkt sie sich) und sie muss SICHTBAR anders sein als eine
   gemerkte — sonst wundert sich am nächsten Tablet jemand. */
async function testFigurOhneMigration() {
  console.log('\n— Volk wählen ohne Migration 0143 —');
  const { tool, root, document } = await mountSolo(soloView(30, () => 1), {
    wi_solo_avatar: () => ({ ok: false, error: 'fn_missing' })
  }, { live: true });
  await wait(60);

  const treffer = tippeAufFigur(root, document);
  ok('die Figur steht auch ohne 0143 auf der Insel', !!treffer);
  if (!treffer) { tool.unmount(); return; }

  await wait(470);   // die Sperre gegen den nachgereichten Klick
  click(root.querySelector('[data-part="vswap"]'), document);
  await wait(30);
  click([...root.querySelectorAll('.wi-vbtn')][7], document);
  await wait(30);
  ok('die Wahl gilt trotzdem sofort',
     root.querySelector('[data-part="vname"]').textContent === 'Spuk-Einhorn');
  const hint = root.querySelector('[data-part="vhint"]');
  ok('und der Kasten sagt, dass sie nur an diesem Gerät hängt',
     hint.hidden === false && /Gerät/.test(hint.textContent), hint.textContent);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Das eigene Level — Migration 0145
   ═══════════════════════════════════════════════════════════
   Hier werden ZAHLEN zu Längen, und zwar an zwei Orten: die drei
   Kreise unten im Knopf-Kasten (seit 13.09.2026; davor ein Balken
   oben links, den die Unit-Leiste zudeckte) und die ganze Leiter im
   Kasten „Wer bist du?". Ein Vorzeichenfehler darin sähe nicht nach
   einem Fehler aus — der Ring stünde nur immer voll oder immer
   leer, und niemand wüsste, ob das nun am Lernen liegt.

   Deshalb steht hier die Rechnung als SOLLWERT und nicht als
   Nachbau: „8 Minuten von 12 → zwei Drittel" ist eine Aussage, die
   man nachrechnen kann, ohne den Code zu lesen. */
const breite = el => parseFloat(el.style.width || '0');
const links  = el => parseFloat(el.style.left  || '0');
// Die Skala der LEITER (Sekunden → Prozent), wie in tool.js.
const ENDE = 720;
const pct = s => 100 * s / ENDE;

/* Die Ringe der zwei Kreise. Ihre Länge steht als Bogenlänge in
   `stroke-dasharray: <Länge> <Umfang>` — zurück in Prozent gerechnet
   heißt das dasselbe wie vorher die Breite des Balkens. Der Umfang
   steht auch in tool.js (RING_U): r = 19 im 44er-Feld. */
const RING_U = 2 * Math.PI * 19;
const ring = el => 100 * parseFloat(el.style.strokeDasharray || '0') / RING_U;
// Wo der Bogen ANSETZT — der Versatz ist negativ (nach vorn).
const ringAb = el => -100 * parseFloat(el.style.strokeDashoffset || '0') / RING_U;

/* Die Kernzusage der Leiter: der Abschnitt, in dem der eigene
   Strich steht, IST das Level, das der Server rechnet. Geprüft wird
   sie an den gezeichneten Kästchen und nicht an der Formel — nur so
   fällt sie auf, wenn jemand die Abschnitte anders sortiert, als er
   sie füllt. */
function abschnitte(root, wahl = '.wi-vseg') {
  return [...root.querySelectorAll(wahl)].map((e, i) => ({
    k: i + 1, links: links(e), rechts: links(e) + breite(e),
    an: e.classList.contains('is-on')
  }));
}
function abschnittMit(root, p, wahl) {
  const x = pct((p.avg_secs || 0) + (p.bonus_secs || 0));
  return abschnitte(root, wahl).find(a => x >= a.links - .05 && x < a.rechts + .05);
}

// Sieben Tage bis heute, mit Ortsdatum (nicht UTC — der Client liest
// den Wochentag mit new Date(tag) lokal ein).
function histTage(secs) {
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                 + `-${String(d.getDate()).padStart(2, '0')}`;
  const heute = new Date();
  return secs.map((s, i) => {
    const d = new Date(heute);
    d.setDate(heute.getDate() - (secs.length - 1 - i));
    return { day: iso(d), secs: s };
  });
}

async function testLevel() {
  console.log('\n— Das eigene Level —');
  /* Level 4, Schnitt 8:00 min, heute 1:35. Die Skala läuft über die
     ganze Leiter (0…12:00), die vier Grenzen liegen für jemanden auf
     Level 4 bei 1:00 · 3:00 · 6:00 (Abstiegsgrenzen, er ist ja schon
     oben) und 10:00 (seine Aufstiegsgrenze). */
  const { tool, root, document, calls } = await mountSolo(
    soloView(40, i => i % 5, false, playerStand(4, 480, { today_secs: 95 })),
    { wi_solo_level_history: () => ({
        ok: true,
        days: histTage([480, 420, 0, 540, 360, 480, 300]),
        totals: { active_days: 6, total_days: 9, total_secs: 2580 } }) },
    { live: true });
  await wait(40);

  /* ── Die drei Kreise (13.09.2026) ───────────────────────────
     Level · Schnitt · heute, unten im Knopf-Kasten. Die zwei Ringe
     messen von NULL bis zur Grenze des nächsten Levels (hier 10:00):
     voller Kreis = nächstes Level. */
  const bar = root.querySelector('[data-part="lvl"]');
  ok('die drei Kreise stehen im Kasten unten', bar.hidden === false);
  ok('der erste nennt nur die Zahl',
     root.querySelector('[data-part="lvlnum"]').textContent === '4',
     root.querySelector('[data-part="lvlnum"]').textContent);
  /* Die Krone ist der DAUERHAFTE Erfolg und darf nur dastehen, wenn
     es wirklich einen gibt: level_max === level heißt „noch nichts
     verloren", und dann wäre sie eine Auszeichnung fürs Jetzt. */
  ok('keine Krone, solange das Höchste das Jetzige ist',
     root.querySelector('[data-part="lvlcrown"]').hidden === true);
  ok('der zweite Kreis nennt den Schnitt der Woche',
     root.querySelector('[data-part="avgnum"]').textContent === '8:00',
     root.querySelector('[data-part="avgnum"]').textContent);
  ok('und sein Ring steht bei 8:00 von 10:00 (vier Fünftel)',
     Math.abs(ring(root.querySelector('[data-part="avgarc"]')) - 80) < .6,
     ring(root.querySelector('[data-part="avgarc"]')).toFixed(1) + '%');
  ok('ohne Mastery bleibt der Bonus-Bogen leer',
     ring(root.querySelector('[data-part="avgbonus"]')) === 0);
  ok('der dritte Kreis nennt die heutige Lernzeit',
     root.querySelector('[data-part="lvltoday"]').textContent === '1:35',
     root.querySelector('[data-part="lvltoday"]').textContent);
  /* Derselbe Maßstab wie beim Schnitt — nur so sagt der Vergleich
     der zwei Kreise etwas: 1:35 von 10:00 sind knapp 16 %. */
  ok('und sein Ring misst auf derselben Skala (1:35 von 10:00)',
     Math.abs(ring(root.querySelector('[data-part="todayarc"]')) - 100 * 95 / 600) < .6,
     ring(root.querySelector('[data-part="todayarc"]')).toFixed(1) + '%');
  /* Die Historie ist teuer und wird NICHT beim Aufbau geholt — sie
     hängt am Öffnen des Kastens. Ein Aufruf je Insel-Aufbau wäre
     eine Auskunft, die dabei niemand ansieht. */
  ok('die Wochen-Historie wird beim Aufbau noch nicht geholt',
     !calls.some(c => c[0] === 'wi_solo_level_history'));

  /* ── Der Kasten dahinter ──────────────────────────────────── */
  const kasten = root.querySelector('[data-part="volkov"]');
  click(root.querySelector('[data-part="lvlbtn"]'), document);
  await wait(40);
  ok('ein Tipp auf einen Kreis öffnet „Wer bist du?"', kasten.hidden === false);
  ok('jetzt wird die Historie geholt',
     calls.some(c => c[0] === 'wi_solo_level_history'));

  const lvlText = root.querySelector('[data-part="vlvl"]').textContent;
  ok('der Kasten nennt Level und Namen', /Level 4/.test(lvlText) && /Erfahren/.test(lvlText), lvlText);
  ok('und den Schnitt der Woche', /8:00 min/.test(lvlText), lvlText);
  ok('sagt, was noch fehlt (10:00 − 8:00 = 2:00)', /Noch 2:00 min bis Level 5/.test(lvlText), lvlText);
  /* Und was man VERLIEREN kann. Das ist der halbe Sinn des Puffers:
     ein Kind soll wissen, dass ein schwacher Tag nichts kostet. */
  ok('und ab wann das Level verloren geht', /unter 6:00 min/.test(lvlText), lvlText);

  /* ── Die ganze Leiter ───────────────────────────────────────
     Sie steht seit 13.09.2026 nur noch HIER, im Kasten: fünf
     Abschnitte, vier Grenzen, die Zeiten daran und die zwei Zeiger.
     Sönke: „an dem Balken sieht man, wo man heute ist und wo der
     aktuelle Wert ist."

     Auf Level 4 liegen die drei unteren Grenzen auf den ABSTIEGS-
     Werten (1:00 · 3:00 · 6:00) und nur die obere auf dem
     Aufstiegswert (10:00) — genau das meint „die Levelgrenzen
     verschieben sich beim Aufstieg". */
  const gross = abschnitte(root);
  ok('der große Balken zeigt alle fünf Level', gross.length === 5, String(gross.length));
  ok('die vier Grenzen stehen auf 1:00 · 3:00 · 6:00 · 10:00',
     [60, 180, 360, 600].every((s, i) => Math.abs(gross[i + 1].links - pct(s)) < .6),
     gross.map(a => a.links.toFixed(1)).join(' | '));
  ok('der eigene Abschnitt ist hervorgehoben — und nur er',
     gross.filter(a => a.an).map(a => a.k).join() === '4');
  /* Die Kernzusage: der Strich steht in dem Abschnitt, dessen
     Nummer der Server als Level schickt. */
  const wo = abschnittMit(root, playerStand(4, 480));
  ok('und der eigene Stand liegt genau darin', wo && wo.k === 4, wo ? String(wo.k) : 'daneben');
  const marken = [...root.querySelectorAll('.wi-vmark')].map(e => e.textContent.trim());
  ok('die Zeiten stehen an den Grenzen',
     marken.join(' ') === '1:00 3:00 6:00 10:00', marken.join(' '));
  /* ⚠️ EIN Zeiger, nicht zwei (Sönke, 13.09.2026: „das ‚Heute 4:24'
     kannst du rausnehmen"). Der heutige Tag hat auf dieser Skala
     nichts mehr zu suchen — er entscheidet nichts, und er steht
     unten in der Woche mit einem Ring um seinen Namen. Beides wird
     hier zugesagt: dass die Nadel weg ist UND dass der Ersatz da
     ist (weiter unten bei den Säulen). */
  ok('der heutige Tag steht nicht mehr am großen Balken',
     !root.querySelector('.wi-vz--heute') && !root.querySelector('.wi-vnow'));
  const zAvg = root.querySelector('.wi-vz--avg');
  ok('ein Zeiger sagt, welcher Wert gerade zählt — mit dem Ø davor',
     /^Ø 8:00$/.test(zAvg.textContent.trim()) && Math.abs(links(zAvg) - pct(480)) < .6,
     zAvg.textContent + ' @ ' + zAvg.style.left);
  /* Bei 8:00 von 12:00 steht er mitten im Balken: dort hängt er um
     seinen Mittelpunkt und braucht keinen der beiden Randgriffe. */
  ok('und hängt in der Mitte an seinem Wert',
     !zAvg.classList.contains('is-links') && !zAvg.classList.contains('is-rechts'),
     zAvg.className);
  /* ⚠️ Der Satz sprach bis 13.09.2026 von „funkelnden Wörtern" —
     ein Wort aus der Bilderwelt an einer Stelle, an der es um eine
     Rechnung geht (Sönke: „müssen wir umformulieren"). Jetzt steht
     dort die Stufe, und zwar die, wie sie auf dem Schirm heißt: 5. */
  ok('ohne Mastery lädt der Kasten dazu ein, sie zu holen',
     /Stufe 5/.test(root.querySelector('.wi-vbonhint').textContent) &&
     !/funkelnd/.test(root.querySelector('.wi-vbonhint').textContent),
     root.querySelector('.wi-vbonhint').textContent);

  /* ── Die Woche als Säulen (13.09.2026) ──────────────────────
     Tage: 8:00 · 7:00 · 0:00 · 9:00 · 6:00 · 8:00 · 5:00 (heute).
     Der stärkste ist Nr. 3 (9:00), der schwächste Nr. 2 (0:00). */
  const hoehe = el => parseFloat(el.querySelector('i').style.height || '0');
  const saeulen = [...root.querySelectorAll('.wi-vday')];
  ok('sieben Tage als Säulen', saeulen.length === 7, String(saeulen.length));
  ok('die Zeit steht über der Säule',
     saeulen[0].querySelector('.wi-vday__val').textContent === '8:00',
     saeulen[0].querySelector('.wi-vday__val').textContent);
  /* Der heutige Tag ist hervorgehoben — und seit dem 13.09.2026 ist
     das die EINZIGE Stelle, an der „heute" noch steht (der Ring um
     den Wochentag hängt in tool.css an dieser Klasse). Steht sie
     nicht oder steht sie zweimal, ist die Auskunft „heute" ganz weg
     oder doppelt. */
  ok('der heutige Tag ist hervorgehoben',
     saeulen.filter(z => z.classList.contains('is-heute')).length === 1 &&
     saeulen[6].classList.contains('is-heute'));
  /* ── Gold gehört dem besten Tag (14.09.2026) ────────────────
     Sönke: „der letzte Tag ist ja immer heute, der Kreis markiert es.
     Gerade ist er aber noch gold. Ich will, dass der beste Tag gold
     ist." Zwei Auszeichnungen an einer Reihe müssen zwei
     verschiedene Dinge sagen — sonst ist eine davon umsonst.

     Hier ist heute (5:00) ausdrücklich NICHT der beste (9:00): nur
     so fällt auf, wenn das Gold wieder ans Ende rutscht. */
  ok('golden ist der stärkste Tag — und nur er',
     saeulen.filter(z => z.classList.contains('is-best'))
            .map(z => saeulen.indexOf(z)).join() === '3',
     saeulen.filter(z => z.classList.contains('is-best')).length + ' Stück');
  ok('und heute ist nicht mehr golden, nur noch markiert',
     saeulen[6].classList.contains('is-heute')
     && !saeulen[6].classList.contains('is-best'));
  /* Der stärkste Tag (9:00) ist der Maßstab, nicht die Schwelle:
     eine Woche mit lauter kurzen Tagen soll trotzdem ein lesbares
     Bild geben. */
  ok('der stärkste Tag füllt die Säule ganz',
     Math.abs(hoehe(saeulen[3].querySelector('.wi-vday__bar')) - 100) < .6,
     hoehe(saeulen[3].querySelector('.wi-vday__bar')) + '%');
  ok('und ein Tag ohne Lernzeit bleibt fast leer',
     hoehe(saeulen[2].querySelector('.wi-vday__bar')) <= 2,
     hoehe(saeulen[2].querySelector('.wi-vday__bar')) + '%');
  /* ⚠️ Der ausgegraute Tag ist genau der, den wi_solo_level_avg_secs
     herauswirft: der schwächste, bei Gleichstand der frühere. Steht
     die Blässe woanders, behauptet der Kasten etwas Falsches über
     die Rechnung. */
  ok('der schwächste Tag ist ausgegraut — und nur er',
     saeulen.filter(z => z.classList.contains('is-schwach')).map(z => saeulen.indexOf(z)).join() === '2',
     saeulen.filter(z => z.classList.contains('is-schwach')).length + ' Stück');
  ok('und darunter steht, warum',
     /schwächste Tag/.test(root.querySelector('[data-part="vweak"]').textContent),
     root.querySelector('[data-part="vweak"]').textContent);
  const tot = root.querySelector('[data-part="vtot"]').textContent;
  ok('die Gesamtzahlen stehen da',
     /6/.test(tot) && /aktive Lerntage/.test(tot) && /9/.test(tot) && /43:00 min/.test(tot), tot);

  tool.unmount();
}

/* Die zwei Wochen, in denen „der beste Tag" keine Selbstverständ-
   lichkeit ist. Beides sind echte erste Wochen und keine Spitzfindig-
   keiten: die leere Woche sieht jedes Kind am ersten Tag, die
   gleichmäßige jedes, das jeden Tag seine Runde macht. */
async function testBesterTagRaender() {
  console.log('\n— Der goldene Tag in Grenzfällen —');

  const woche = async secs => {
    const m = await mountSolo(
      soloView(20, () => 1, false, playerStand(1, 60)),
      { wi_solo_level_history: () => ({
          ok: true, days: histTage(secs),
          totals: { active_days: secs.filter(s => s > 0).length,
                    total_days: 7, total_secs: secs.reduce((a, b) => a + b, 0) } }) },
      { live: true });
    await wait(20);
    click(m.root.querySelector('[data-part="lvlbtn"]'), m.document);
    await wait(40);
    const s = [...m.root.querySelectorAll('.wi-vday')];
    const wer = k => s.filter(z => z.classList.contains(k)).map(z => s.indexOf(z)).join();
    const r = { best: wer('is-best'), schwach: wer('is-schwach'), heute: wer('is-heute') };
    m.tool.unmount();
    return r;
  };

  /* Eine Woche ohne eine einzige Minute. Eine goldene Null wäre ein
     Lob für nichts — und schlimmer: sie behauptete, dieser Tag sei
     besser gewesen als die anderen sechs. */
  const leer = await woche([0, 0, 0, 0, 0, 0, 0]);
  ok('in einer leeren Woche bleibt die Reihe ohne Gold', leer.best === '', leer.best);
  ok('der Ring um heute steht trotzdem', leer.heute === '6', leer.heute);

  /* Sieben gleich lange Tage. Hier zeigt sich, warum die beiden
     Auswahlregeln bei Gleichstand in verschiedene Richtungen
     greifen (besterTag: der spätere, schwaechsterTag: der frühere) —
     sonst stünde derselbe Balken blass UND golden da, und das ist
     keine Auszeichnung mehr, sondern ein Widerspruch. */
  const gleich = await woche([60, 60, 60, 60, 60, 60, 60]);
  ok('bei lauter gleichen Tagen ist der beste der letzte', gleich.best === '6', gleich.best);
  ok('und der gestrichene der erste', gleich.schwach === '0', gleich.schwach);
  ok('nie derselbe Balken golden und blass',
     gleich.best !== gleich.schwach && leer.best !== leer.schwach);
}

/* Die Ränder der Skala. Level 1 hat keine Abstiegsgrenze, Level 5
   keine Aufstiegsgrenze — an beiden Enden fehlt also die Zahl, aus
   der die Skala sonst gebaut wird. Ein `null`, das hier als 0
   durchrutscht, ergäbe einen Ring, der immer voll ist. */
async function testLevelRaender() {
  console.log('\n— Level: die Ränder der Skala —');

  /* Level 1: alle vier Grenzen sind AUFSTIEGS-Grenzen (2:00 · 5:00 ·
     7:00 · 10:00) — unter Level 1 gibt es nichts, was man verlieren
     könnte. Schnitt 1:00, Grenze zu Level 2 bei 2:00 → halber Ring. */
  {
    const { tool, root, document } = await mountSolo(
      soloView(20, () => 1, false, playerStand(1, 60)),
      { wi_solo_level_history: () => ({ ok: true, days: histTage([60, 60, 60, 60, 60, 60, 60]),
                                        totals: { active_days: 7, total_days: 7, total_secs: 420 } }) },
      { live: true });
    await wait(20);
    ok('Level 1 rechnet von null an (1:00 von 2:00)',
       Math.abs(ring(root.querySelector('[data-part="avgarc"]')) - 50) < .6,
       ring(root.querySelector('[data-part="avgarc"]')).toFixed(1) + '%');
    click(root.querySelector('[data-part="lvlbtn"]'), document);
    await wait(40);
    const s = abschnitte(root);
    ok('und zeigt lauter Aufstiegsgrenzen (2:00 · 5:00 · 7:00 · 10:00)',
       [120, 300, 420, 600].every((x, i) => Math.abs(s[i + 1].links - pct(x)) < .6),
       s.map(a => a.links.toFixed(1)).join(' | '));
    const wo = abschnittMit(root, playerStand(1, 60));
    ok('der Stand liegt im ersten Abschnitt', wo && wo.k === 1 && wo.an);
    /* 1:00 von 12:00 sind 8 % — um seinen Mittelpunkt gesetzt, hinge
       die Beschriftung dort halb aus dem Kasten (Sönke: „achte
       drauf, dass das nicht aus dem Fenster fällt"). Am linken Rand
       hängt sie deshalb an ihrer linken Kante. */
    const z = root.querySelector('.wi-vz--avg');
    ok('am linken Rand fällt der Zeiger nicht aus dem Kasten',
       z.classList.contains('is-links') && !z.classList.contains('is-rechts'),
       z.className + ' @ ' + z.style.left);
    tool.unmount();
  }

  // Level 5: keine Aufstiegsgrenze mehr.
  {
    const { tool, root, env, document } = await mountSolo(
      soloView(20, () => 4, false, playerStand(5, 600, { level_max: 5 })),
      { wi_solo_level_history: () => ({ ok: true, days: histTage([600, 600, 600, 600, 600, 600, 600]),
                                        totals: { active_days: 7, total_days: 7, total_secs: 4200 } }) },
      { live: true });
    await wait(40);
    /* Ohne Aufstiegsgrenze tritt das Ende der Skala an ihre Stelle
       (12:00): der Ring füllt sich auf 10:00/12:00 und läuft NICHT
       über. Ein `null`, das als 0 durchrutscht, gäbe hier eine
       Division durch null. */
    const r = ring(root.querySelector('[data-part="avgarc"]'));
    ok('Level 5 füllt den Ring, ohne ihn zu überlaufen',
       Math.abs(r - 100 * 600 / 720) < .6, r.toFixed(1) + '%');
    ok('und der Ring ist als „oben angekommen" gezeichnet',
       root.querySelector('[data-part="avgring"]').classList.contains('is-max'));
    click(root.querySelector('[data-part="lvlbtn"]'), document);
    await wait(40);
    /* Oben angekommen sind ALLE vier Grenzen Abstiegsgrenzen
       (1:00 · 3:00 · 6:00 · 8:00) — die Leiter, die man hinter sich
       hat, sieht anders aus als die, die man vor sich hatte. Und
       Level 5 ist ein Abschnitt und kein Strich am Rand: dafür geht
       die Skala bis 12:00. */
    const s = abschnitte(root);
    ok('auf Level 5 sind alle Grenzen Abstiegsgrenzen',
       [60, 180, 360, 480].every((x, i) => Math.abs(s[i + 1].links - pct(x)) < .6),
       s.map(a => a.links.toFixed(1)).join(' | '));
    const wo = abschnittMit(root, playerStand(5, 600));
    ok('und der Stand steht im fünften Abschnitt', wo && wo.k === 5 && wo.an,
       wo ? String(wo.k) : 'daneben');
    const t = root.querySelector('[data-part="vlvl"]').textContent;
    ok('und sagt, dass es das höchste ist', /Höchstes Level erreicht/.test(t), t);
    ok('nennt aber weiter die Abstiegsgrenze', /unter 8:00 min/.test(t), t);

    /* ── Das Gold ──────────────────────────────────────────────
       Level 5 bekommt kein fünftes Bild, sondern die vierte Figur
       mit einem Filter. Der steht in keinem Attribut und in keinem
       Maß — nur in der Einstellung, die im Augenblick des Zeichnens
       gilt, und die hält machKontext fest. Ohne diese Prüfung wäre
       die ganze Belohnung von Level 5 unbelegt. */
    await wait(80);
    const figur = env.gemalt.filter(g => /sprites\/held\//.test(g.src)).pop();
    ok('die Figur wird gezeichnet', !!figur, figur ? figur.src : 'nichts');
    if (figur) {
      ok('und zwar mit dem goldenen Filter',
         /sepia/.test(figur.filter || ''), String(figur.filter));
    }
    /* Und die Tiere daneben NICHT — der Filter gilt für die Figur
       und wird danach zurückgenommen. Bliebe er stehen, wäre die
       ganze Insel golden. */
    const tier = env.gemalt.filter(g => /sprites\/tier\//.test(g.src)).pop();
    if (tier) {
      ok('die Echsen bleiben dabei ungefärbt',
         !/sepia/.test(tier.filter || ''), String(tier.filter));
    }
    tool.unmount();
  }

  // Ein Schnitt weit über der Aufstiegsgrenze darf nicht überlaufen.
  {
    const { tool, root, document } = await mountSolo(
      soloView(20, () => 1, false, playerStand(2, 9999)));
    await wait(20);
    ok('ein sehr hoher Schnitt läuft nicht über 100 %',
       Math.abs(ring(root.querySelector('[data-part="avgarc"]')) - 100) < .01,
       ring(root.querySelector('[data-part="avgarc"]')).toFixed(1) + '%');
    /* Und derselbe Fall am großen Balken: bei 100 % hinge die
       Beschriftung halb rechts heraus. Dort hängt sie an ihrer
       rechten Kante — die Gegenprobe zum linken Rand oben. */
    click(root.querySelector('[data-part="lvlbtn"]'), document);
    await wait(20);
    const z = root.querySelector('.wi-vz--avg');
    ok('am rechten Rand ebenso wenig',
       z.classList.contains('is-rechts') && !z.classList.contains('is-links'),
       z.className + ' @ ' + z.style.left);
    tool.unmount();
  }
}

/* Der Mastery-Bonus. Er ist ein Bonus auf die MESSGRÖSSE und keine
   eigene Zone — im Ring muss er deshalb als zweiter Bogen HINTER
   dem eigenen Stand liegen und nicht an dessen Stelle. Läge er
   darunter, sähe ein Kind seine echte Lernzeit nicht mehr. */
async function testLevelBonus() {
  console.log('\n— Level: der Mastery-Bonus —');
  /* Level 4, Schnitt 7:00, Bonus 2:00, Grenze zu Level 5 bei 10:00.
     Im Ring liegt der eigene Stand bei 7/10, der Bonus trägt 2/10
     dazu — zusammen 90 %, also knapp unter dem vollen Kreis. */
  const { tool, root, document } = await mountSolo(
    soloView(40, () => 4, false,
             playerStand(4, 420, { bonus_secs: 120, pct_max: 80, level_max: 4 })),
    { wi_solo_level_history: () => ({ ok: true, days: histTage([420, 420, 420, 420, 420, 420, 420]),
                                      totals: { active_days: 7, total_days: 7, total_secs: 2940 } }) },
    { live: true });
  await wait(40);

  const f = ring(root.querySelector('[data-part="avgarc"]'));
  const bo = root.querySelector('[data-part="avgbonus"]');
  ok('der eigene Stand steht bei 7:00 von 10:00', Math.abs(f - 70) < .6, f.toFixed(1) + '%');
  ok('der Bonus setzt genau dort an und nicht bei null',
     Math.abs(ringAb(bo) - 70) < .6, ringAb(bo).toFixed(1) + '%');
  ok('und trägt die zwei Bonus-Minuten',
     Math.abs(ring(bo) - 20) < .6, ring(bo).toFixed(1) + '%');
  /* 7:00 + 2:00 = 9:00, die Grenze zu Level 5 liegt bei 10:00: der
     Bonus schiebt den Stand an die Grenze heran, aber nicht darüber.
     Genau so rechnet der Server (0145: der Bonus zählt mit, BEVOR
     die Schwellen geprüft werden), und genau das muss man sehen —
     sonst wäre der Kreis voll und der Satz im Kasten sagte
     „noch 1:00 min bis Level 5". */
  ok('… und reicht bis kurz vor den vollen Kreis',
     ringAb(bo) + ring(bo) > 85 && ringAb(bo) + ring(bo) < 99.5,
     (ringAb(bo) + ring(bo)).toFixed(1) + '%');
  ok('die Zahl im Kreis ist die, die zählt (7:00 + 2:00)',
     root.querySelector('[data-part="avgnum"]').textContent === '9:00',
     root.querySelector('[data-part="avgnum"]').textContent);

  click(root.querySelector('[data-part="lvlbtn"]'), document);
  await wait(40);
  /* Und auf der ganzen Leiter im Kasten bleibt der Stand MIT Bonus
     im Abschnitt 4 — er reicht an die Grenze heran, nicht darüber. */
  const wo = abschnittMit(root, playerStand(4, 420, { bonus_secs: 120 }));
  ok('mit Bonus steht er weiter in Abschnitt 4 …',
     wo && wo.k === 4, wo ? String(wo.k) : 'daneben');
  const t = root.querySelector('[data-part="vlvl"]').textContent;
  ok('der Kasten weist den Bonus aus', /\+ 2:00 min Bonus/.test(t), t);
  ok('und sagt, woher er kommt',
     /\+ 2:00 min/.test(root.querySelector('.wi-vbonhint').textContent) &&
     /80 %/.test(root.querySelector('.wi-vbonhint').textContent),
     root.querySelector('.wi-vbonhint').textContent);
  /* Und das Restliche rechnet MIT ihm: 10:00 − 7:00 − 2:00 = 1:00.
     Ohne den Bonus in dieser Zeile stünde dort 3:00, und das Kind
     käme schon bei 2:00 vorher an. */
  ok('und rechnet ihn auf das Restliche an', /Noch 1:00 min bis Level 5/.test(t), t);

  tool.unmount();
}

/* Der Aufstieg. Er UNTERBRICHT das Üben — Sönke, 14.09.2026: „das
   Spiel [muss] kurz unterbrochen werden und ich sehe, wie mein
   Charakter das nächste Level erreicht. Also da steht dann Level 2,
   das neue Sprite wird geladen."

   Bis dahin lief er nebenher (ein Banner über den Kreisen), und
   genau das prüfte dieser Prüfstand vorher — mit der Begründung, ein
   Aufstieg sei „zu selten", um anzuhalten. Die Begründung war
   falsch herum: WEIL er selten ist, muss man ihn sehen.

   Geprüft wird die ganze Kette:
     · Der Kasten geht auf und zeigt zuerst das ALTE Level.
     · Nach LVUP_SPRUNG springt die Zahl auf das neue, der Satz
       kommt dazu, das Bild der Figur wird neu gesetzt.
     · Solange er steht, kommt KEINE neue Frage.
     · Danach kommt sie, und der Kasten ist wieder zu. */
async function testLevelAufstieg() {
  console.log('\n— Level: der Aufstieg —');
  let stand = playerStand(2, 290, { level_max: 2, today_secs: 60 });
  const { tool, root, document } = await mountSolo(
    soloView(20, () => 1, false, stand),
    {
      wi_solo_start: () => ({ ok: true,
        task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] } }),
      wi_solo_answer: () => ({
        ok: true, result: 'correct', item: 'w-3',
        // Das Tier bleibt, wo es ist — sonst wäre nicht zu trennen,
        // welche der beiden Feiern gerade läuft.
        level_before: 1, level_after: 1, locked_for: 0,
        player: playerStand(3, 310, { level_max: 3, today_secs: 80, level_before: 2 }),
        task: { item: 'w-4', prompt: 'die Tafel', dir: 'de_en', stage: 'type', level: 1, options: [] } })
    }, { live: true });
  await wait(40);

  ok('vorher steht Level 2 da',
     root.querySelector('[data-part="lvlnum"]').textContent === '2');
  const lvup = root.querySelector('[data-part="lvup"]');
  ok('und niemand feiert', lvup.hidden === true);

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);
  antworte(root, document, 'house', '[data-part="pin"]');
  await wait(40);

  /* ── Der erste Schlag: der Kasten steht, mit dem ALTEN Level ── */
  ok('der Aufstieg macht einen eigenen Kasten auf', lvup.hidden === false);
  ok('und zeigt zuerst das alte Level',
     root.querySelector('[data-part="lvupnum"]').textContent === '2',
     root.querySelector('[data-part="lvupnum"]').textContent);
  ok('die Figur steht darin',
     /held\//.test(root.querySelector('[data-part="lvupimg"]').getAttribute('src') || ''),
     root.querySelector('[data-part="lvupimg"]').getAttribute('src'));
  /* Der Kern von Sönkes Ansage: das Üben steht. Die Antwort war
     richtig, die nächste Frage ist längst da — sie darf nur nicht
     im Kasten stehen. */
  ok('das Üben ist unterbrochen — die nächste Frage kommt NICHT sofort',
     root.querySelector('[data-part="pword"]').textContent === 'das Haus',
     root.querySelector('[data-part="pword"]').textContent);

  ok('der Kreis unten steht schon auf dem neuen Level',
     root.querySelector('[data-part="lvlnum"]').textContent === '3',
     root.querySelector('[data-part="lvlnum"]').textContent);
  ok('und die heutige Zeit ist nachgeführt',
     root.querySelector('[data-part="lvltoday"]').textContent === '1:20',
     root.querySelector('[data-part="lvltoday"]').textContent);

  /* ── Der zweite Schlag: die Zahl springt (LVUP_SPRUNG = 760) ── */
  await wait(900);
  ok('dann springt die Zahl auf das neue Level',
     root.querySelector('[data-part="lvupnum"]').textContent === '3',
     root.querySelector('[data-part="lvupnum"]').textContent);
  ok('die Überschrift sagt es in Worten',
     /Level 3/.test(root.querySelector('[data-part="lvuptitle"]').textContent),
     root.querySelector('[data-part="lvuptitle"]').textContent);
  ok('und ein Satz sagt, wofür es das Level gab',
     (root.querySelector('[data-part="lvupsub"]').textContent || '').length > 10,
     root.querySelector('[data-part="lvupsub"]').textContent);
  ok('das Üben steht immer noch',
     root.querySelector('[data-part="pword"]').textContent === 'das Haus');

  /* ── Der Schluss: LVUP_DAUER(3) = 2200 + 600 = 2800 ms ──────── */
  await wait(2100);
  ok('danach ist der Kasten wieder zu', lvup.hidden === true);
  ok('und die nächste Frage steht da',
     root.querySelector('[data-part="pword"]').textContent === 'die Tafel',
     root.querySelector('[data-part="pword"]').textContent);

  tool.unmount();
}

/* Beide Feiern in EINER Antwort: das Wort steigt eine Stufe UND das
   eigene Level steigt. Sie dürfen nicht übereinander liegen — erst
   das Tier auf seiner Bühne, dann die Figur in ihrem Kasten. */
async function testLevelAufstiegMitTier() {
  console.log('\n— Level: Aufstieg zusammen mit einem Stufensprung —');
  const { tool, root, document } = await mountSolo(
    soloView(20, () => 1, false, playerStand(1, 110, { level_max: 1, today_secs: 60 })),
    {
      wi_solo_start: () => ({ ok: true,
        task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] } }),
      wi_solo_answer: () => ({
        ok: true, result: 'correct', item: 'w-3',
        // Diesmal steigt auch das Tier: von Stufe 1 auf 2.
        level_before: 1, level_after: 2, locked_for: 0,
        player: playerStand(2, 130, { level_max: 2, today_secs: 80, level_before: 1 }),
        task: { item: 'w-4', prompt: 'die Tafel', dir: 'de_en', stage: 'type', level: 1, options: [] } })
    }, { live: true });
  await wait(40);

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);
  antworte(root, document, 'house', '[data-part="pin"]');
  await wait(40);

  const cheer = root.querySelector('[data-part="cheer"]');
  const lvup  = root.querySelector('[data-part="lvup"]');
  ok('zuerst feiert das Tier auf seiner Bühne', cheer.hidden === false);
  ok('und die Figur wartet noch', lvup.hidden === true);

  // FEIER_DAUER.grow = 1150 ms — danach gehört die Bühne der Figur.
  await wait(1300);
  ok('dann geht die Tier-Bühne zu', cheer.hidden === true);
  ok('und die Figur ist dran', lvup.hidden === false);
  ok('die Frage ist immer noch die alte',
     root.querySelector('[data-part="pword"]').textContent === 'das Haus');

  // LVUP_DAUER(2) = 2200 + 400 = 2600 ms ab dem Beginn der Figur.
  await wait(2500);
  ok('erst danach kommt die nächste Frage',
     root.querySelector('[data-part="pword"]').textContent === 'die Tafel',
     root.querySelector('[data-part="pword"]').textContent);
  ok('und beide Kästen sind zu',
     cheer.hidden === true && lvup.hidden === true);

  tool.unmount();
}

/* Kein Aufstieg, keine Feier. Der Server schickt `player` bei JEDER
   Antwort mit — käme der Jubel schon davon, blitzte er bei jeder
   Vokabel auf und wäre nach zwei Minuten Tapete. */
async function testLevelKeinAufstieg() {
  console.log('\n— Level: ohne Aufstieg keine Feier —');
  const { tool, root, document } = await mountSolo(
    soloView(20, () => 1, false, playerStand(3, 400, { level_max: 4 })),
    {
      wi_solo_start: () => ({ ok: true,
        task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] } }),
      wi_solo_answer: () => ({
        ok: true, result: 'correct', item: 'w-3',
        level_before: 1, level_after: 1, locked_for: 0,
        player: playerStand(3, 405, { level_max: 4, level_before: 3 }),
        task: { item: 'w-4', prompt: 'die Tafel', dir: 'de_en', stage: 'type', level: 1, options: [] } })
    }, { live: true });
  await wait(40);

  /* Die Krone. Hier ist sie wirklich verdient: level_max 4 über
     einem aktuellen Level 3 — einmal erreicht, nie wieder weg. */
  ok('die Krone steht, wenn das Höchste über dem Jetzigen liegt',
     root.querySelector('[data-part="lvlcrown"]').hidden === false);

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);
  antworte(root, document, 'house', '[data-part="pin"]');
  await wait(40);
  ok('eine Antwort ohne Aufstieg feiert nicht',
     root.querySelector('[data-part="lvltoast"]').hidden === true
     && root.querySelector('[data-part="lvup"]').hidden === true);
  /* Und sie hält deshalb auch nichts an: der Kasten, der beim
     Aufstieg das Üben unterbricht, darf bei jeder normalen Antwort
     nicht einmal eine Zehntelsekunde kosten. */
  ok('und hält das Üben nicht an',
     root.querySelector('[data-part="pword"]').textContent === 'die Tafel',
     root.querySelector('[data-part="pword"]').textContent);
  ok('die Kreise stehen trotzdem noch da',
     root.querySelector('[data-part="lvl"]').hidden === false);

  tool.unmount();
}

/* Eine Datenbank ohne 0145: `player` fehlt in der Antwort. Dann gibt
   es kein Level — und das darf nicht bedeuten, dass es keine Insel
   gibt. Derselbe Fall wie bei 0142/0143, und derselbe Anspruch. */
async function testLevelOhneMigration() {
  console.log('\n— Level ohne Migration 0145 —');
  const { tool, root, env, document } = await mountSolo(soloView(30, () => 1), {
    wi_solo_level_history: () => ({ ok: false, error: 'fn_missing' }),
    wi_solo_avatar: args => ({ ok: true, settings: { faction: args.p_faction } })
  }, { live: true });
  await wait(60);

  ok('die Insel steht trotzdem', root.querySelectorAll('.wi-cell').length > 100);
  ok('die Level-Kreise bleiben einfach weg',
     root.querySelector('[data-part="lvl"]').hidden === true);
  ok('und die Zeichenschleife läuft ohne Krach',
     env.rafs > 0 && env.rafFehler.length === 0,
     env.rafFehler.map(e => e.message).join(' | '));
  /* Die Figur muss weiter da sein — sie hängt an 0143 und nicht an
     0145. Ohne Level gibt es keine Bildstufe: dann greift `meinLevel`
     auf 1 zurück, und das ist die erste Fassung. Nicht das alte
     einzelne Bild (das ist der onerror-Rückfall) und schon gar kein
     leerer Rahmen. */
  ok('die Figur trägt die erste Fassung',
     env.geladeneBilder.includes('tools/wordisland/sprites/held/2_1.png'));
  ok('und es fehlt kein einziges Bild',
     env.fehlendeBilder.length === 0, env.fehlendeBilder.join(', '));

  const treffer = tippeAufFigur(root, document);
  ok('der Kasten „Wer bist du?" geht weiter auf', !!treffer);
  if (treffer) {
    ok('nur ohne Wochen-Historie',
       root.querySelector('[data-part="vhist"]').hidden === true);
    ok('und ohne Level-Angabe',
       root.querySelector('[data-part="vlvl"]').textContent === '');
    /* Ein leerer Balken wäre eine Aussage („du stehst bei null") und
       keine fehlende: ohne Zahlen bleibt die Leiter ganz weg. */
    ok('die Leiter bleibt weg statt leer dazustehen',
       root.querySelector('[data-part="vbar"]').hidden === true);
    await wait(470);   // die Sperre gegen den nachgereichten Klick
    click(root.querySelector('[data-part="vswap"]'), document);
    await wait(20);
    ok('die acht Völker stehen aber weiter zur Wahl',
       root.querySelectorAll('.wi-vbtn').length === 8);
  }

  tool.unmount();
}

/* ── Die Uhr beim Üben (13.09.2026) ───────────────────────────
   Sönke: „eine Uhr, die hochzählt, wenn ich aktiv lerne, und
   stoppt, wenn ich nichts mache. Ein ehrlicher Hinweis."

   Geprüft wird genau diese Ehrlichkeit, und zwar an drei Stellen:
   sie steht auf der Zahl des Servers, sie läuft nach einer Antwort
   weiter, und sie rechnet mit DEMSELBEN Deckel wie Migration 0145.
   Der Deckel ist der Punkt, an dem eine Uhr sonst lügt: zwanzig
   Minuten Kasten-offen sind zwanzig SEKUNDEN Lernzeit. */
async function testUhr() {
  console.log('\n— Die Uhr beim Üben —');

  /* Der Deckel steht in zwei Dateien, und das muss so sein (die
     eine läuft im Browser, die andere in Postgres). Hier wird
     zugesagt, dass es dieselbe Zahl ist — sonst zählt die Uhr
     etwas anderes als die Datenbank, und niemand merkt es, weil
     beide für sich plausibel aussehen. */
  const toolQuelle = fs.readFileSync(TOOL, 'utf8');
  const deckel = (toolQuelle.match(/UHR_DECKEL\s*=\s*(\d+)/) || [])[1];
  const sqlDatei = path.join(HERE, '..', '..', '..', '..',
                             'supabase', 'migrations', '0145_wordisland_solo_level.sql');
  const sql = fs.existsSync(sqlDatei) ? fs.readFileSync(sqlDatei, 'utf8') : '';
  const sqlDeckel = (sql.match(/least\(greatest\(extract\(epoch from \(p_now - p_prev\)\)::int, 0\), (\d+)\)/) || [])[1];
  ok('die Uhr rechnet mit demselben Deckel wie der Server',
     !!deckel && deckel === sqlDeckel, deckel + ' / ' + sqlDeckel);

  let heute = 95;                       // 1:35, wie sie der Server kennt
  const { tool, root, document } = await mountSolo(
    soloView(20, () => 1, false, playerStand(3, 300, { today_secs: heute })), {
      wi_solo_start: () => ({
        ok: true,
        task: { item: 'w-3', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] }
      }),
      /* Der Server verbucht bei jeder Antwort den gedeckelten
         Abstand — hier zwölf Sekunden. Genau diese Zahl muss die
         Uhr danach zeigen: sie läuft der Antwort nicht davon und
         fällt nicht hinter sie zurück. */
      wi_solo_answer: () => {
        heute += 12;
        return { ok: true, result: 'correct', item: 'w-3',
                 player: playerStand(3, 300, { today_secs: heute }),
                 task: { item: 'w-4', prompt: 'die Tafel', dir: 'de_en',
                         stage: 'type', level: 0, options: [] } };
      }
    }, { live: true });

  const uhr = root.querySelector('[data-part="puhr"]');
  const zahl = () => root.querySelector('[data-part="puhrnum"]').textContent;
  ok('vor dem Üben gibt es keine Uhr', uhr.hidden === true);

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(40);
  ok('der Übungskasten bringt sie mit', uhr.hidden === false);
  ok('sie steht auf der heutigen Lernzeit des Servers', zahl() === '1:35', zahl());
  /* Noch keine Antwort, also steht sie — und sagt das auch. Ein
     Zähler, der aussieht, als liefe er, und dabei steht, ist eine
     Lüge mit Ziffern. */
  ok('und sie steht still, solange nichts beantwortet wurde',
     uhr.classList.contains('is-still'), uhr.className);

  antworte(root, document, 'house', '[data-part="pin"]');
  await wait(40);
  ok('nach einer Antwort steht die Zahl des Servers da (1:35 + 12 s)',
     zahl() === '1:47', zahl());
  ok('und die Uhr läuft', !uhr.classList.contains('is-still'), uhr.className);

  // Eine Sekunde später ist sie eine Sekunde weiter. Das ist der
  // ganze Unterschied zur Anzeige von vorher, die nur bei Antworten
  // sprang — und es ist der Grund für den Zeitgeber.
  await wait(1100);
  /* Eine Spanne und keine Zahl: der Prüfstand rechnet mit echten
     Zeitgebern, und eine ausgelastete Maschine braucht für eine
     Sekunde manchmal anderthalb. Die Zusage ist „sie zählt weiter",
     nicht „sie zählt auf die Millisekunde genau". */
  ok('eine Sekunde später zählt sie weiter',
     ['1:48', '1:49'].includes(zahl()), zahl());

  /* Zumachen hält sie an. Ohne das liefe ein Zeitgeber auf einer
     Anzeige weiter, die niemand sieht — und beim nächsten Öffnen
     stünde dort eine Zahl, die der Server nie verbuchen wird. */
  click(root.querySelector('[data-part="pclose"]'), document);
  const stand = zahl();
  await wait(1100);
  ok('der geschlossene Kasten hält sie an', zahl() === stand, zahl() + ' statt ' + stand);

  tool.unmount();

  /* Ohne Migration 0145 gibt es keine Lernzeit. Dann steht dort
     nichts — und nicht 0:00: „der Server kennt die Frage nicht" und
     „du hast heute nichts getan" dürfen nie gleich aussehen. */
  {
    const { tool, root, document } = await mountSolo(soloView(20, () => 1), {
      wi_solo_start: () => ({
        ok: true,
        task: { item: 'w-1', prompt: 'das Haus', dir: 'de_en', stage: 'type', level: 1, options: [] }
      })
    }, { live: true });
    click(root.querySelector('[data-part="sgo"]'), document);
    await wait(40);
    ok('ohne 0145 bleibt die Uhr weg statt auf 0:00 zu stehen',
       root.querySelector('[data-part="puhr"]').hidden === true);
    tool.unmount();
  }
}

/* Eine Datenbank ohne 0142: words_list kommt ohne `u`. Das ist
   NICHT „die Wörter gehören zu keiner Unit" — es darf also nichts
   blass werden und nichts abstürzen. */
async function testUnitsOhneMigration() {
  console.log('\n— Unit-Leiste ohne Migration 0142 —');
  const { tool, root, env, document } = await mountSolo(soloView(30, () => 1, true), {
    wi_solo_unit: () => ({ ok: false, error: 'fn_missing' })
  }, { live: true });
  await wait(60);

  ok('die Insel steht trotzdem', root.querySelectorAll('.wi-cell').length > 100);
  ok('die Leiste auch', root.querySelectorAll('.wi-urow').length === 2);
  ok('nur ohne Stufenpunkte je Unit',
     root.querySelectorAll('.wi-urow .wi-lg').length === 0);
  ok('und die Zeichenschleife läuft ohne Fehler',
     env.rafFehler.length === 0,
     env.rafFehler.slice(0, 2).map(e => e.message).join(' · '));

  click(root.querySelector('.wi-uinfo'), document);
  await wait(40);
  const det = root.querySelector('[data-part="udet"]');
  ok('das „i" sagt, dass die Migration fehlt — und nennt die Nummer',
     /0142/.test(det.textContent), det.textContent.trim().slice(0, 80));
  tool.unmount();
}

/* Eine abgewählte Unit wird blass gezeichnet, eine hervorgehobene
   bekommt einen Ring. Beides passiert auf der Leinwand und ist
   deshalb nicht abzulesen — was hier geprüft wird, ist, dass die
   Zeichenschleife dabei nicht auf die Nase fällt. Genau das wäre
   der teure Fehler: eine Insel, die nach einem Klick stehen
   bleibt. */
async function testBlassUndRing() {
  console.log('\n— Blass und hervorgehoben —');
  const { tool, root, env, document } = await mountSolo(soloView(40, i => i % 5), {
    wi_solo_settings: args => ({ ok: true, settings: { sets: args.p_sets } }),
    wi_solo_unit: args => soloUnit(args.p_set, 40, i => i % 5)
  }, { live: true });
  await wait(40);

  click(root.querySelectorAll('.wi-urow')[0].querySelector('.wi-utoggle'), document);
  await wait(40);
  click(root.querySelectorAll('.wi-urow')[1].querySelector('.wi-uinfo'), document);
  await wait(80);
  const bilder = env.rafs;
  await wait(60);

  ok('die Schleife läuft weiter', env.rafs > bilder, `${bilder} → ${env.rafs}`);
  ok('und zwar ohne Fehler', env.rafFehler.length === 0,
     env.rafFehler.slice(0, 2).map(e => e.message).join(' · '));
  tool.unmount();
}

/* Der eine Sprung, der anders aussieht als alle anderen: aus dem Ei
   kommt etwas heraus. Er hat eigenen Code — die Schale wird in zwei
   Hälften geschnitten und weggeschleudert —, und der wird von keiner
   anderen Stufe angefasst. */
async function testSchluepfen() {
  console.log('\n— Es schlüpft —');
  const { env, tool, root, document } = await mountSolo(soloView(12, () => 0), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-2', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 0, options: [] }
    }),
    wi_solo_answer: () => ({
      ok: true, result: 'correct', item: 'w-2',
      level_before: 0, level_after: 1, locked_for: 0,
      task: { item: 'w-5', prompt: 'der Stuhl', dir: 'de_en', stage: 'type', level: 0, options: [] }
    })
  }, { live: true });

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(40);
  ok('vor der Antwort liegt ein Ei da',
     root.querySelector('[data-part="pstage"]').textContent === 'Stufe 1',
     root.querySelector('[data-part="pstage"]').textContent);

  const fehlerVor = env.rafFehler.length;
  antworte(root, document, 'tree', '[data-part="pin"]');

  /* Mitten in den Verlauf hinein: bei rund 700 ms ist die Schale
     gebrochen und die Hälften fliegen. Genau dort steht der Code,
     der sonst nirgends läuft. */
  await wait(700);
  ok('es schlüpft',
     /Geschlüpft/.test(root.querySelector('[data-part="plevelb"]').textContent),
     root.querySelector('[data-part="plevelb"]').textContent);
  ok('die neue Stufe steht schon da',
     root.querySelector('[data-part="pstage"]').textContent === 'Stufe 2',
     root.querySelector('[data-part="pstage"]').textContent);
  ok('und die Schale zerbricht ohne Fehler',
     env.rafFehler.length === fehlerVor,
     env.rafFehler.slice(-1).map(e => e.message).join(''));

  await wait(900);
  ok('danach kommt die nächste Frage',
     root.querySelector('[data-part="pword"]').textContent === 'der Stuhl');
  tool.unmount();
}

/* „Wie oft hattest du dieses Wort?" — das kleine i beim Tier.
   Die Zahlen fahren in der Aufgabe mit (Migration 0138, seit 0139
   mit einer vierten), es geht also kein Ruf zum Server. Geprüft
   wird deshalb genau zweierlei: dass die Zahlen an der richtigen
   Stelle landen, und dass eine fehlende Migration NICHT wie „noch
   nie geübt" aussieht. */
async function testStats() {
  console.log('\n— Wie oft hattest du das Wort? —');
  const AUFGABE = {
    item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 2, options: [],
    pts: { de_en: 7, en_de: 6 }, pass: { no: 1, offen: 10, gesamt: 10 },
    stats: { en_de: [7, 2, 11, 2], de_en: [4, 3, 8, 1] }
  };
  const { tool, root, document } = await mountSolo(soloView(10, () => 2), {
    wi_solo_start: () => ({ ok: true, task: AUFGABE })
  });

  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);
  const panel = root.querySelector('[data-part="pstats"]');
  ok('die Übersicht ist zu, bis jemand auf das i tippt', panel.hidden === true);

  click(root.querySelector('[data-part="pinfo"]'), document);
  await wait(10);
  ok('das i klappt sie auf', panel.hidden === false);

  const kopf = [...panel.querySelectorAll('.wi-sthead')].map(e => e.textContent);
  ok('vier Spalten: richtig, mit Hilfe, falsch, gesamt',
     js(kopf) === js(['richtig', 'mit Hilfe', 'falsch', 'gesamt']), js(kopf));

  const dirs = [...panel.querySelectorAll('.wi-stdir')].map(e => e.textContent);
  ok('oben EN→DE, unten DE→EN', js(dirs) === js(['EN→DE', 'DE→EN']), js(dirs));

  const zahlen = [...panel.querySelectorAll('.wi-stn')].map(e => e.textContent);
  ok('und die Zahlen stehen in ihrer Zeile',
     js(zahlen) === js(['7', '2', '2', '11', '4', '3', '1', '8']), js(zahlen));

  /* „Falsch" kommt seit 0139 vom Server und wird NICHT mehr als Rest
     gerechnet: 2 von 11 sind 18,18 %. Der Unterschied fällt erst bei
     Altdaten auf — dort ist der Rest zu hoch, weil die Chronik erst
     mit 0138 zu zählen begann. */
  const bad = panel.querySelector('.wi-stbar i.is-bad');
  ok('der Balken zeigt auch die falschen',
     bad && /18\.18%/.test(bad.getAttribute('style') || ''), bad?.getAttribute('style'));

  click(root.querySelector('[data-part="pinfo"]'), document);
  await wait(10);
  ok('noch ein Tipp aufs i macht sie wieder zu', panel.hidden === true);
  tool.unmount();

  /* Eine Datenbank auf dem Stand von 0138 schickt drei Zahlen. Dann
     bleibt die Spalte nicht leer, sondern wird wie früher aus dem
     Rest gerechnet — schlechter, aber nicht falsch aussehend. */
  const drei = await mountSolo(soloView(10, () => 2), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 2,
              options: [], stats: { de_en: [4, 3, 8] } }
    })
  });
  click(drei.root.querySelector('[data-part="sgo"]'), drei.document);
  await wait(30);
  click(drei.root.querySelector('[data-part="pinfo"]'), drei.document);
  await wait(10);
  const dreiZ = [...drei.root.querySelectorAll('.wi-stn')].map(e => e.textContent);
  ok('kommen nur drei Zahlen, wird „falsch" wie früher als Rest gerechnet',
     js(dreiZ.slice(4)) === js(['4', '3', '1', '8']), js(dreiZ));
  drei.tool.unmount();

  /* Und der Fall, der sonst wie „dieses Wort hattest du noch nie"
     aussähe: die Datenbank ist älter als das Werkzeug. Die beiden
     zu verwechseln hat am 08.09.2026 eine halbe Stunde gekostet. */
  const alt = await mountSolo(soloView(10, () => 2), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 2, options: [] }
    })
  });
  click(alt.root.querySelector('[data-part="sgo"]'), alt.document);
  await wait(30);
  click(alt.root.querySelector('[data-part="pinfo"]'), alt.document);
  await wait(10);
  const note = alt.root.querySelector('[data-part="pstats"]');
  ok('ohne die Chronik keine erfundenen Nullen',
     !note.querySelector('.wi-stn') && /0139/.test(note.textContent), note.textContent);
  /* Das Schildchen mit der Richtung hängt an KEINER gerechneten Zahl
     — deshalb steht es auch hier. Genau das unterscheidet es von den
     drei Kästchen, die bis 10.09.2026 an derselben Stelle saßen und
     ohne Punktekonto verschwanden. */
  ok('das Schildchen mit der Richtung braucht die Chronik nicht',
     alt.root.querySelector('[data-part="pdir"]').hidden === false
     && alt.root.querySelector('[data-part="pdir"]').textContent === 'DE→EN',
     alt.root.querySelector('[data-part="pdir"]').textContent);
  alt.tool.unmount();
}

/* ─── Das Schildchen und der Balken der Runde ───────────────
   Beides sind ANZEIGEN von Feldern, die der Server liefert (0139,
   0141) — geprüft wird deshalb nicht die Regel, sondern die
   Übersetzung:

     · Das Schildchen trägt die GEFRAGTE Richtung, nicht die des
       Tiers, und wechselt mit der Frage.
     · Über dem Wort steht keine ausgeschriebene Frage mehr.
     · In der Kopfzeile steht nur noch die Runde. Der Stand steckt im
       Balken darunter, und der bekommt den NACHKOMMAWERT: eine Runde
       hat gut 180 Kopien, gerundet stünde er bei jeder zweiten
       Antwort still. Die Zahl daneben ist gerundet — sie soll man im
       Vorbeisehen lesen.
     · Ein Zahlenpaar („noch 12 von 30") stand bis 10.09.2026 hier.
       Sönke: „die versteht man ja nicht."
     · Nach der Antwort steht die Zahl da (+3 / −3) — SOFORT, nicht
       erst nach der Pause, die eine Feier einlegt.               */
async function testPunkte() {
  console.log('\n— Schildchen und Balken der Runde —');
  const { tool, root, document } = await mountSolo(soloView(30, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 1,
              options: [], pts: { de_en: 7, en_de: 3 },
              pass: { no: 2, offen: 12, gesamt: 30, kopien: 61, erledigt: 9, pct: 12.9 } }
    }),
    wi_solo_answer: () => ({
      ok: true, result: 'correct', item: 'w-1', dir: 'de_en', helped: false,
      delta: 3, points: 10, level_before: 1, level_after: 1, locked_for: 0,
      task: { item: 'w-2', prompt: 'der Stuhl', dir: 'en_de', stage: 'type', level: 0,
              options: [], pts: { de_en: 0, en_de: 12 },
              pass: { no: 2, offen: 11, gesamt: 30, kopien: 60, erledigt: 10, pct: 14.3 } }
    })
  });
  click(root.querySelector('[data-part="sgo"]'), document);
  await wait(30);

  const pdir = root.querySelector('[data-part="pdir"]');
  const prog = root.querySelector('[data-part="pprog"]');
  const balken = root.querySelector('[data-part="pprogi"]');
  const zahl = root.querySelector('[data-part="pprogn"]');
  ok('das Schildchen steht da', pdir.hidden === false);
  ok('und trägt die gefragte Richtung — sonst nichts',
     pdir.textContent === 'DE→EN' && pdir.children.length === 0, pdir.innerHTML);
  ok('über dem Wort steht keine ausgeschriebene Frage mehr',
     root.querySelector('[data-part="pask"]') === null);

  ok('in der Kopfzeile steht nur noch die Runde',
     root.querySelector('[data-part="pmeta"]').textContent === 'Runde 2',
     root.querySelector('[data-part="pmeta"]').textContent);
  ok('der Balken steht da', prog.hidden === false);
  ok('und trägt den Anteil auf eine Stelle genau',
     balken.style.width === '12.9%', balken.style.width);
  ok('die Zahl daneben ist gerundet', zahl.textContent === '13 %', zahl.textContent);
  ok('und Vorlesegeräte bekommen denselben Wert',
     prog.getAttribute('aria-valuenow') === '13', prog.getAttribute('aria-valuenow'));

  antworte(root, document, 'tree', '[data-part="pin"]');
  await wait(40);

  const delta = root.querySelector('[data-part="pdelta"]');
  ok('nach der Antwort steht die Zahl da', delta.hidden === false && delta.textContent === '+3',
     delta.textContent);
  ok('und sie ist als Gewinn gefärbt', /is-plus/.test(delta.className), delta.className);

  /* Ohne Stufensprung steht die nächste Frage SOFORT da — genau
     deshalb darf sie die Zahl nicht mitnehmen. Sie hat einen eigenen
     Zeitgeber; hier steht sie also noch, obwohl das Wort schon
     gewechselt hat. */
  ok('die nächste Frage bringt die andere Richtung mit',
     root.querySelector('[data-part="pdir"]').textContent === 'EN→DE',
     root.querySelector('[data-part="pdir"]').textContent);
  ok('die Zahl überlebt den Wechsel der Frage',
     root.querySelector('[data-part="pdelta"]').hidden === false);
  ok('der Balken ist ein Stück gewachsen',
     balken.style.width === '14.3%' && zahl.textContent === '14 %',
     balken.style.width + ' / ' + zahl.textContent);

  await wait(1500);
  ok('und geht dann von selbst', root.querySelector('[data-part="pdelta"]').hidden === true);
  tool.unmount();

  /* Ein Fehler beim Tippen legt zwei Kopien zurück, wo er eine
     genommen hat — ab der Hälfte der Runde SINKT der Anteil dadurch
     um ein paar Zehntel. Der Balken darf das nicht mitmachen: er
     stockt, statt zu fallen. (Die Zahl vom Server bleibt ehrlich,
     hier steht nur, was man sieht.) */
  const rueck = await mountSolo(soloView(30, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 1,
              options: [], pass: { no: 2, offen: 10, gesamt: 30, pct: 66.7 } }
    }),
    wi_solo_answer: () => ({
      ok: true, result: 'wrong', solution: 'tree', item: 'w-1', dir: 'de_en',
      helped: false, delta: -3, points: 4, level_before: 1, level_after: 1, locked_for: 0,
      task: { item: 'w-2', prompt: 'der Stuhl', dir: 'de_en', stage: 'type', level: 1,
              options: [], pass: { no: 2, offen: 10, gesamt: 30, pct: 66.3 } }
    })
  });
  click(rueck.root.querySelector('[data-part="sgo"]'), rueck.document);
  await wait(30);
  antworte(rueck.root, rueck.document, 'daneben', '[data-part="pin"]');
  await wait(1200);
  ok('nach einer falschen Antwort stockt der Balken, statt zu fallen',
     rueck.root.querySelector('[data-part="pprogi"]').style.width === '66.7%',
     rueck.root.querySelector('[data-part="pprogi"]').style.width);
  rueck.tool.unmount();

  /* Eine Runde, die gerade neu begonnen hat: erledigt 0, also 0 %.
     Der Balken muss dabei OHNE Bewegung zurückspringen — ein Balken,
     der zurückläuft, liest sich wie ein Verlust. Geprüft wird hier,
     was danach im DOM steht (die Bewegung selbst hat linkedom nicht):
     die Breite ist gesetzt, und der Übergang ist wieder freigegeben. */
  const neu = await mountSolo(soloView(30, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 0,
              options: [],
              pass: { no: 3, offen: 30, gesamt: 30, kopien: 90, erledigt: 0, pct: 0 } }
    })
  });
  click(neu.root.querySelector('[data-part="sgo"]'), neu.document);
  await wait(30);
  const nBalken = neu.root.querySelector('[data-part="pprogi"]');
  ok('die frische Runde steht bei null',
     nBalken.style.width === '0.0%'
     && neu.root.querySelector('[data-part="pprogn"]').textContent === '0 %',
     nBalken.style.width);
  ok('und der Übergang ist danach wieder frei',
     !nBalken.style.transition, nBalken.style.transition);
  ok('die Runde selbst steht in der Kopfzeile',
     neu.root.querySelector('[data-part="pmeta"]').textContent === 'Runde 3',
     neu.root.querySelector('[data-part="pmeta"]').textContent);
  neu.tool.unmount();

  /* Datenbank ohne 0141: `pct` fehlt. Dann wird in Wörtern gerechnet
     — gröber (Sprünge von gut 3 %), aber der Balken steht und zeigt
     etwas Richtiges. Ein leerer Kasten wäre die schlechtere Antwort
     (Regel: feedback_missing_migration_looks_like_network). */
  const alt = await mountSolo(soloView(30, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 0,
              options: [], pass: { no: 2, offen: 12, gesamt: 30 } }
    })
  });
  click(alt.root.querySelector('[data-part="sgo"]'), alt.document);
  await wait(30);
  ok('ohne 0141 rechnet der Balken in Wörtern weiter',
     alt.root.querySelector('[data-part="pprogi"]').style.width === '60.0%'
     && alt.root.querySelector('[data-part="pprogn"]').textContent === '60 %',
     alt.root.querySelector('[data-part="pprogi"]').style.width);
  alt.tool.unmount();

  /* Und ohne jeden Rundenstand (Datenbank vor 0139) verschwindet der
     Balken ganz. 0 % wäre eine Behauptung über eine Runde, von der
     das Gerät nichts weiß. */
  const ohne = await mountSolo(soloView(30, () => 1), {
    wi_solo_start: () => ({
      ok: true,
      task: { item: 'w-1', prompt: 'der Baum', dir: 'de_en', stage: 'type', level: 0, options: [] }
    })
  });
  click(ohne.root.querySelector('[data-part="sgo"]'), ohne.document);
  await wait(30);
  ok('ohne Rundenstand kein Balken',
     ohne.root.querySelector('[data-part="pprog"]').hidden === true);
  ok('und die Kopfzeile fällt auf ihren Namen zurück',
     ohne.root.querySelector('[data-part="pmeta"]').textContent === 'Vokabeln üben',
     ohne.root.querySelector('[data-part="pmeta"]').textContent);
  ohne.tool.unmount();
}

/* Ohne Migration 0136 antwortet der Server mit 404 → fn_missing.
   Die Insel muss das AUSHALTEN und sagen, was FEHLT — nicht „hier
   ist noch nichts". Die beiden zu verwechseln hat am 08.09.2026
   eine halbe Stunde gekostet (Regel:
   feedback_missing_migration_looks_like_network). */
async function testSoloOhneMigration() {
  console.log('\n— Ohne 0136 —');
  const fehlt = await mountSolo({ ok: false, error: 'fn_missing' });
  const load = fehlt.root.querySelector('[data-part="load"]');
  ok('die Bühne bleibt stehen', !!fehlt.root.querySelector('.wi--solo'));
  /* Geprüft wird der CODE und nicht der Satz: den Satz („In der
     Datenbank fehlt die neueste Migration") liefert ctx.errText aus
     lib/tool.js, hier steht dafür nur ein Platzhalter. Die Aufgabe
     der tool.js ist, `fn_missing` überhaupt bis dorthin
     durchzureichen — genau das fällt sonst weg. */
  ok('und die Meldung trägt den Fehlercode weiter',
     !!load && load.hidden !== true && /fn_missing/.test(load.textContent), load?.textContent);
  ok('und sagt gerade NICHT „hier ist noch nichts"',
     !!load && !/noch nichts/i.test(load.textContent));
  /* Und die Knöpfe bleiben gesperrt. Ein „Vokabeln üben", das auf
     eine Insel führt, die es nicht gibt, wäre die zweite
     Fehlermeldung für denselben Fehler. */
  ok('die Knöpfe bleiben gesperrt',
     fehlt.root.querySelector('[data-part="sgo"]').disabled === true);
  fehlt.tool.unmount();

  /* Der andere Fall, und er sieht mit Absicht anders aus: die
     Migration ist da, das Kind war nur noch in keinem Raum. */
  const leer = await mountSolo({ ok: true, learner: null });
  const load2 = leer.root.querySelector('[data-part="load"]');
  ok('ohne Raum: „hier ist noch nichts"',
     !!load2 && /noch nichts/i.test(load2.textContent), load2?.textContent);
  leer.tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Die Ruinen (Migration 0146)
   ═══════════════════════════════════════════════════════════ */

/* Eine Karte mit zwei Orten: ein großer (Klasse 2) und ein kleiner
   (Klasse 1). Vier mal fünf Felder, Landeplatz oben links. */
function ruinInsel() {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const kl = (r === 1 && c === 2) ? 2 : (r === 2 && c === 3) ? 1 : 0;
      cells.push([r, c, kl, (r === 0 && c === 0) ? 1 : 0]);
    }
  }
  return cells;
}
const RMAP = ruinInsel();
const R_GROSS = 1 * 5 + 2;      // Index des großen Ortes
const R_KLEIN = 2 * 5 + 3;      // Index des kleinen
const zeichenkette = (len, belegt, leer) => {
  const a = new Array(len).fill(leer);
  for (const k in belegt) a[k] = belegt[k];
  return a.join('');
};
const platz = (root, i) => root.querySelectorAll('.wi-place')[i];
const koerper = p => p.querySelector('g:not(.wi-hearts)');
const herzZahl = p => p.querySelector('.wi-hearts').querySelectorAll('path').length;

/* Ein Tablet mit Ruinen. `stand` ist der Server: was er jetzt sagt,
   kommt beim nächsten Takt an. */
async function mountRuinen(stand, mehr) {
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  const calls = [];
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        calls.push([fn, args]);
        if (fn === 'wi_view') {
          return Promise.resolve(viewFor(Object.assign(
            { map: args.p_full ? RMAP : null, own: stand.own,
              ruins: stand.ruins, hearts: stand.hearts }, stand.over || {}), stand.me));
        }
        if (mehr && mehr[fn]) return Promise.resolve(mehr[fn](args));
        return Promise.resolve({ ok: false, error: 'not_allowed' });
      }
    }
  });
  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);
  return { tool, root, document, calls };
}

async function testRuinen() {
  console.log('\n— Die Ruinen auf der Karte —');
  const len = RMAP.length;
  const stand = {
    own: zeichenkette(len, { 0: '0' }, '.'),
    ruins: '.'.repeat(len),
    // Der Server schickt die Herzen auch für unaufgedeckte Ruinen —
    // verraten wird dadurch nichts, weil sie erst mit dem Gebäude
    // gezeichnet werden.
    hearts: zeichenkette(len, { [R_GROSS]: '4', [R_KLEIN]: '1' }, '0'),
    me: { picks: 1, streak: 3 }
  };
  let getroffen = null;
  const { tool, root, document, calls } = await mountRuinen(stand, {
    wi_pick_tile: args => {
      getroffen = args;
      // Der erste Schlag deckt auf und nimmt ein Herz.
      stand.ruins = zeichenkette(len, { [R_GROSS]: 'L' }, '.');
      stand.hearts = zeichenkette(len, { [R_GROSS]: '3', [R_KLEIN]: '1' }, '0');
      return { ok: true, picks: 0, shadow_pick: 0, effect: null,
               tile: { r: args.p_r, c: args.p_c, result: 'hit', ruin: 'licht', hearts: 3 } };
    }
  });

  ok('beide Orte stehen auf der Karte', root.querySelectorAll('.wi-place').length === 2,
     `${root.querySelectorAll('.wi-place').length}`);
  /* Im Nebel sieht man die KLASSE und sonst nichts: der große Ort hat
     den größeren Schein, das Gebäude ist unsichtbar, Herzen gibt es
     keine. Das ist Sönkes „aber was verbirgt sich da?". */
  const gr = +platz(root, 0).querySelector('.wi-halo').getAttribute('r');
  const kl = +platz(root, 1).querySelector('.wi-halo').getAttribute('r');
  ok('der große Ort schimmert breiter', gr > kl, `${gr} / ${kl}`);
  ok('im Nebel steht kein Gebäude da',
     koerper(platz(root, 0)).getAttribute('opacity') === '0' &&
     koerper(platz(root, 1)).getAttribute('opacity') === '0');
  ok('und keine Herzen', herzZahl(platz(root, 0)) === 0 && herzZahl(platz(root, 1)) === 0);

  /* Ein Schlag mit der freien Wahl. */
  ok('die Karte ist scharf', root.querySelector('.wi-map').classList.contains('is-picking'));
  click(root.querySelectorAll('.wi-cell')[R_GROSS], document);
  await wait(60);
  ok('der Schlag ging an wi_pick_tile', !!getroffen && getroffen.p_r === 1 && getroffen.p_c === 2,
     js(getroffen));
  const fb = root.querySelector('.wi-fb').textContent;
  ok('die Rückmeldung nennt Ruine und Rest', /Lichttempel/.test(fb) && /3/.test(fb), fb);

  /* Und die Karte zeigt jetzt, was dort steht — noch im Nebel, denn
     erobert ist er nicht. */
  ok('das Gebäude ist aufgedeckt',
     koerper(platz(root, 0)).getAttribute('opacity') === '1');
  const href = platz(root, 0).querySelector('image').getAttribute('href') || '';
  ok('und es ist der Lichttempel', /sprites\/ruine\/licht\.png$/.test(href), href);
  /* Ein fehlendes <image> zeichnet in SVG stillschweigend NICHTS —
     deshalb wird die DATEI geprüft und nicht nur der Pfad (dieselbe
     Falle wie bei den Schiffen). */
  ok('das Bild liegt auch wirklich da',
     fs.existsSync(path.join(HERE, '..', '..', '..', decodeURI(href))), href);
  ok('drei Herzen über dem Tempel', herzZahl(platz(root, 0)) === 3,
     `${herzZahl(platz(root, 0))}`);
  ok('der kleine Ort bleibt geheim',
     koerper(platz(root, 1)).getAttribute('opacity') === '0' && herzZahl(platz(root, 1)) === 0);

  /* ── Ein Ort ist so groß wie ein Feld (14.09.2026) ────────────
     Sönke: „Die Ruinen sind nicht gut klickbar, da sie zu viel Platz
     wegnehmen. Mach sie mal so groß wie alle Felder … die Felder sind
     gleich groß." Der SOCKEL ist damit in beiden Klassen genau eine
     Kachel — gemessen an der Deckfläche eines gewöhnlichen Feldes,
     nicht an einer Zahl im Quelltext. Überlappen darf nur das
     Gebäudebild: klein leicht, groß etwas mehr.

     Gemessen wird die Breite aus dem Pfad (Sechseck um 0/0, also die
     Spanne zwischen dem kleinsten und größten x). */
  const spanne = d => {
    const xs = (d.match(/-?\d+(?:\.\d+)?(?= )/g) || []).map(Number);
    return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  };
  const feldBreit = spanne(root.querySelector('.wi-cell').getAttribute('d'));
  const sockelG = spanne(platz(root, 0).querySelector('.wi-plate').getAttribute('d'));
  const sockelK = spanne(platz(root, 1).querySelector('.wi-plate').getAttribute('d'));
  ok('beide Sockel sind genau ein Feld breit',
     Math.abs(sockelG - feldBreit) < .02 && Math.abs(sockelK - feldBreit) < .02,
     `Feld ${feldBreit.toFixed(2)} · groß ${sockelG.toFixed(2)} · klein ${sockelK.toFixed(2)}`);
  const bildG = +platz(root, 0).querySelector('image').getAttribute('width');
  const bildK = +platz(root, 1).querySelector('image').getAttribute('width');
  ok('das große Gebäude überlappt mehr als das kleine',
     bildG > bildK && bildK > feldBreit, `groß ${bildG} · klein ${bildK}`);
  /* Und nicht beliebig weit: ein Bild, das über den Nachbarn hinaus
     ragt, deckt genau das Feld zu, das man als nächstes antippen
     will. Eine halbe Kachel Überstand ist die Grenze. */
  ok('und keines weiter als eine halbe Kachel', bildG <= feldBreit * 1.5,
     `${bildG} / ${feldBreit}`);

  tool.unmount();
}

/* Der zweite Weg, auf dem ein Herz fällt: nicht die freie Wahl,
   sondern der ganz normale Zufallsgriff nach einer richtigen
   Antwort. Er landet seit 0146 manchmal auf einem geschützten Feld
   — und dann MUSS das dastehen, sonst sucht das Kind auf der Karte
   nach einem Feld, das es nicht bekommen hat. */
async function testAntwortAufSchild() {
  console.log('\n— Richtig, aber geschützt —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  let answer = null, srv = null;
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        if (fn === 'wi_view') return Promise.resolve(viewFor(args.p_full ? { map: RMAP } : {}, srv));
        if (fn === 'wi_answer') return Promise.resolve(answer);
        return Promise.resolve({ ok: false, error: 'not_allowed' });
      }
    }
  });
  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  answer = { ok: true, result: 'correct', streak: 1, picks: 0,
             tile: { r: 1, c: 0, kind: 'guard', hearts: 0 },
             task: { prompt: 'die Schule', dir: 'de_en', stage: 'type', options: [] } };
  srv = { task: answer.task, streak: 1, picks: 0 };
  antworte(root, document, 'house');
  await wait(40);
  const fb = root.querySelector('.wi-fb').textContent;
  ok('die Rückmeldung sagt, dass das Feld geschützt war',
     /Richtig/.test(fb) && /geschützt/.test(fb), fb);

  answer = Object.assign({}, answer, { tile: { r: 1, c: 0, kind: 'fog' } });
  antworte(root, document, 'school');
  await wait(40);
  ok('ein normaler Griff meldet weiter „ein Feld ist frei"',
     /Feld ist frei/.test(root.querySelector('.wi-fb').textContent),
     root.querySelector('.wi-fb').textContent);

  tool.unmount();
}

async function testSchildUndSchatten() {
  console.log('\n— Schutzherzen und der Nebelkranz —');
  const len = RMAP.length;
  const stand = {
    own: zeichenkette(len, { 0: '0', 5: '0', 6: '0' }, '.'),
    ruins: '.'.repeat(len),
    hearts: zeichenkette(len, { 5: '2', [R_GROSS]: '4' }, '0'),
    me: { picks: 0, streak: 0, shadow_pick: 1 }
  };
  let strike = null;
  const { tool, root, document, calls } = await mountRuinen(stand, {
    wi_shadow_strike: args => {
      strike = args;
      stand.me = { picks: 0, streak: 0, shadow_pick: 0 };
      stand.own = zeichenkette(len, { 0: '0' }, '.');
      stand.hearts = zeichenkette(len, { [R_GROSS]: '4' }, '0');
      return { ok: true, fogged: 7, shadow_pick: 0 };
    },
    wi_pick_tile: () => ({ ok: false, error: 'no_pick' })
  });

  /* Ein Schutzherz ist dieselbe Auskunft wie ein Ruinenherz: „hier
     musst du zweimal treffen". Auf einem normalen Feld malt es die
     eigene Schicht — die Orte malen ihre selbst. */
  const guards = root.querySelector('.wi-guards');
  ok('das geschützte Feld trägt zwei Herzen',
     guards.querySelectorAll('path').length === 2,
     `${guards.querySelectorAll('path').length}`);
  ok('die Ruine ist dabei nicht mitgezählt', guards.querySelectorAll('g').length === 1);

  /* Der Nebelkranz hat Vorrang vor der freien Wahl — und ohne
     picks > 0 wäre die Karte sonst gar nicht scharf. Seit dem
     14.09.2026 steht die Aufforderung im Wahl-Kasten und nicht mehr
     in einer Leiste unter der Aufgabe. */
  const kasten = root.querySelector('[data-part="pickov"]');
  ok('der Wahl-Kasten fordert zum Nebelkranz auf',
     kasten.hidden === false && kasten.classList.contains('is-shadow') &&
     /Schattentempel/.test(root.querySelector('[data-part="picktitle"]').textContent),
     root.querySelector('[data-part="picktitle"]').textContent);
  /* Und zwar mit Sönkes Worten vom 15.09.2026: „Beim Schattentempel
     steht: Erzeuge Nebel. Wähle ein Feld." Zwei kurze Sätze, keine
     Erklärung, wie der Nebelkranz wirkt — das steht in der Lobby. */
  ok('„Erzeuge Nebel." steht groß da',
     root.querySelector('[data-part="pickbig"]').textContent.trim() === 'Erzeuge Nebel.',
     root.querySelector('[data-part="pickbig"]').textContent);
  ok('„Wähle ein Feld." steht klein darunter',
     root.querySelector('[data-part="pickhint"]').textContent.trim() === 'Wähle ein Feld.',
     root.querySelector('[data-part="pickhint"]').textContent);
  /* Beim Nebelkranz gibt es keine Zahl: er ist einer, und „Nimm 1"
     wäre hier die falsche Aufforderung. */
  ok('und keine Ziffer, wo keine hingehört',
     !root.querySelector('[data-part="pickbig"] .wi-picknum'));
  /* Und zwar OHNE Marken: beim Nebelkranz ist die ganze Insel
     erlaubt, und 400 goldene Ringe sagen nichts. */
  ok('keine Marken beim Nebelkranz', root.querySelectorAll('.wi-mark').length === 0);
  ok('die Karte ist auch ohne freie Wahl scharf',
     root.querySelector('.wi-map').classList.contains('is-picking') &&
     root.querySelector('.wi-map').classList.contains('is-shadow'));

  click(root.querySelectorAll('.wi-cell')[8], document);
  await wait(60);
  ok('der Tipp geht an wi_shadow_strike, nicht an wi_pick_tile',
     !!strike && !calls.some(([fn]) => fn === 'wi_pick_tile'), js(strike));
  ok('und er schickt das getippte Feld', strike.p_r === 1 && strike.p_c === 3, js(strike));
  ok('die Rückmeldung zählt die Felder',
     /7/.test(root.querySelector('.wi-fb').textContent),
     root.querySelector('.wi-fb').textContent);
  ok('danach ist die Aufforderung weg',
     kasten.hidden === true && !kasten.classList.contains('is-shadow'));
  ok('die Schutzherzen sind mit dem Nebel verschwunden',
     root.querySelector('.wi-guards').querySelectorAll('path').length === 0);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Was auf dem Bildschirm steht, wenn etwas zu tun ist (15.09.2026)
   ═══════════════════════════════════════════════════════════
   Sönkes Ansage in vier Teilen: „Nimm 1 Feld gezielt ein!" (die 1
   größer) · „beim 12 dann 2 und bei der Arena 3" · bei der Arena
   steht darüber „Arena eingenommen" · „beim Lichttempel kommt nur
   eine Nachricht kurz".

   Geprüft wird jedes Mal der VOLLSTÄNDIGE Satz. Die Zusage ist ja
   gerade, dass wenig dasteht — ein `/Arena/`-Test wäre auch dann
   grün, wenn drei Nebensätze danebenstünden. */
async function testAnsagen() {
  console.log('\n— Die Ansage im Wahl-Kasten —');
  const len = RMAP.length;
  const stand = {
    own: zeichenkette(len, { 0: '0' }, '.'),
    ruins: '.'.repeat(len),
    hearts: zeichenkette(len, { [R_GROSS]: '0' }, '0'),
    me: { picks: 1, streak: 3 }
  };
  let antwort = null;
  const { tool, root, document } = await mountRuinen(stand, {
    wi_pick_tile: args => antwort(args)
  });
  const titel = () => root.querySelector('[data-part="picktitle"]').textContent.trim();
  const satz  = () => root.querySelector('[data-part="pickbig"]').textContent.replace(/\s+/g, ' ').trim();
  const num   = () => {
    const b = root.querySelector('[data-part="pickbig"] .wi-picknum');
    return b ? b.textContent : null;
  };

  /* ── Die Arena schenkt drei ───────────────────────────────── */
  antwort = args => {
    // 0146: die Arena wechselt den Besitzer und schenkt drei Wahlen;
    // die eine, mit der zugeschlagen wurde, ist verbraucht.
    stand.me = { picks: 3, streak: 3 };
    return { ok: true, picks: 3, shadow_pick: 0,
             effect: { kind: 'arena', guarded: 0 },
             tile: { r: args.p_r, c: args.p_c, result: 'taken', ruin: 'arena', hearts: 3 } };
  };
  click(root.querySelectorAll('.wi-cell')[R_GROSS], document);
  await wait(60);
  ok('Arena: der Grund steht über der Ansage', titel() === 'Arena eingenommen', titel());
  ok('Arena: drei Felder, und die Drei ist die Ziffer',
     satz() === 'Nimm 3 Felder gezielt ein!' && num() === '3', satz());
  /* ⚠️ Und KEINE zweite Meldung unter der Aufgabe: die Ruine sagt
     sich einmal an, dort, wo es weitergeht. */
  ok('Arena: keine zweite Meldung unter der Aufgabe',
     root.querySelector('.wi-fb').hidden === true,
     root.querySelector('.wi-fb').textContent);

  /* ── Zwölf richtige am Stück bringen zwei (0149) ─────────────
     ⚠️ Erst alle Wahlen aufbrauchen. Solange noch eine offene Wahl
     aus der Arena steht, ist „Arena eingenommen" ja richtig — der
     Grund verfällt mit der letzten Wahl und nicht mit der nächsten
     Antwort. */
  stand.me = { picks: 0, streak: 11 };
  await tool.update();
  await wait(60);
  ok('ohne offene Wahl ist der Kasten zu',
     root.querySelector('[data-part="pickov"]').hidden === true);
  stand.me = { picks: 2, streak: 12 };
  await tool.update();
  await wait(60);
  ok('Serie 12: zwei Felder, und die Zwei ist die Ziffer',
     satz() === 'Nimm 2 Felder gezielt ein!' && num() === '2', satz());
  ok('Serie 12: und wieder nichts darüber — die Arena ist vorbei',
     titel() === '', titel());
  const chip = root.querySelector('.wi-streak');
  ok('Serie 12: das Abzeichen brennt und verspricht ZWEI',
     chip.classList.contains('is-hot') && /ZWEI/.test(chip.title), chip.title);
  /* Angekündigt wird der große Schritt VORHER: bei 10 steht „/12",
     und das Ziel ist hervorgehoben. */
  stand.me = { picks: 0, streak: 10 };
  await tool.update();
  await wait(60);
  ok('Serie 10: das Ziel ist der Zwölferschritt und sticht hervor',
     root.querySelector('[data-part="streakgoal"]').textContent === '/12' &&
     chip.classList.contains('is-big'), chip.textContent.trim());

  /* ── Der Lichttempel verlangt nichts ───────────────────────── */
  stand.me = { picks: 1, streak: 3 };
  await tool.update();
  await wait(60);
  antwort = args => {
    stand.me = { picks: 0, streak: 3 };
    return { ok: true, picks: 0, shadow_pick: 0,
             effect: { kind: 'licht', guarded: 5 },
             tile: { r: args.p_r, c: args.p_c, result: 'taken', ruin: 'licht', hearts: 4 } };
  };
  click(root.querySelectorAll('.wi-cell')[R_GROSS], document);
  await wait(60);
  const tafel = root.querySelector('[data-part="flash"]');
  ok('Lichttempel: eine kurze Tafel statt eines Kastens',
     tafel.hidden === false &&
     root.querySelector('[data-part="pickov"]').hidden === true);
  ok('Lichttempel: und sie sagt es in einem Satz',
     root.querySelector('[data-part="flashbig"]').textContent === 'Deine Felder sind beschützt!',
     root.querySelector('[data-part="flashbig"]').textContent);
  ok('Lichttempel: darüber steht, woher es kommt',
     root.querySelector('[data-part="flashkick"]').textContent === 'Lichttempel eingenommen');
  ok('Lichttempel: keine zweite Meldung unter der Aufgabe',
     root.querySelector('.wi-fb').hidden === true,
     root.querySelector('.wi-fb').textContent);
  /* ⚠️ Sie liegt über der Karte — und darf deshalb keinen Fingertipp
     schlucken. Das steht nur in der CSS. */
  const css = fs.readFileSync(path.join(HERE, '..', 'tool.css'), 'utf8');
  ok('die Tafel nimmt keinen Fingertipp weg',
     /\.wi-flash[^{-][^{]*\{[^}]*pointer-events:\s*none/.test(css.replace(/\n/g, ' ')));

  /* „Nur kurz" ist die halbe Zusage: sie geht von selbst wieder. */
  await wait(3000);
  ok('… und sie geht von selbst wieder weg', tafel.hidden === true);

  tool.unmount();
}

async function testRuinenOhneMigration() {
  console.log('\n— Ruinen ohne Migration 0146 —');
  const len = RMAP.length;
  /* Ein Server ohne 0146 schickt weder `ruins` noch `hearts`. Dann
     zeichnet die Karte die alten Lichtpunkte und KEINE Herzen —
     alt, nicht kaputt. Und die Lobby verspricht keine Regeln, die
     es nicht gibt. */
  const stand = { own: zeichenkette(len, { 0: '0' }, '.'), me: { picks: 0 },
                  over: { phase: 'lobby' } };
  const { tool, root } = await mountRuinen(stand);
  ok('die Karte steht trotzdem', root.querySelectorAll('.wi-place').length === 2);
  ok('keine Herzen auf der Karte',
     root.querySelector('.wi-guards').querySelectorAll('path').length === 0 &&
     herzZahl(platz(root, 0)) === 0);
  ok('kein Gebäude aufgedeckt', koerper(platz(root, 0)).getAttribute('opacity') === '0');
  ok('und die Lobby erklärt keine Ruinen',
     root.querySelector('[data-part="rulwrap"]').hidden === true);
  tool.unmount();
}

async function testLobbyRegeln() {
  console.log('\n— Die Sonderregeln in der Lobby —');
  const len = RMAP.length;
  const stand = {
    own: zeichenkette(len, { 0: '0' }, '.'),
    ruins: '.'.repeat(len), hearts: '0'.repeat(len),
    over: { phase: 'lobby' }, me: { picks: 0 }
  };
  const { tool, root, document } = await mountRuinen(stand);
  const wrap = root.querySelector('[data-part="rulwrap"]');
  ok('die Erklärung steht in der Wartetafel', wrap.hidden === false);
  ok('sie stellt Sönkes Frage',
     /was verbirgt sich da/i.test(root.querySelector('.wi-rultitle').textContent));
  const karten = root.querySelectorAll('.wi-rulcard');
  ok('zwei Kacheln: kleine und große Ruinen', karten.length === 2 &&
     /Kleine/.test(karten[0].textContent) && /Große/.test(karten[1].textContent));
  ok('und nichts davon steht schon offen da',
     root.querySelector('.wi-rulbody').hidden === true);

  click(karten[1], document);
  const body = root.querySelector('.wi-rulbody');
  ok('große Ruinen: die drei Fähigkeiten',
     body.hidden === false &&
     /Schütze deine Felder/.test(body.textContent) &&
     /Hol den Nebel zurück/.test(body.textContent) &&
     /Nimm mehr Land ein/.test(body.textContent), body.textContent.replace(/\s+/g, ' '));

  click(karten[0], document);
  ok('kleine Ruinen: Bonuspunkte und Zahlen',
     /Bonus-Punkte/.test(body.textContent) && /10 Punkte/.test(body.textContent),
     body.textContent.replace(/\s+/g, ' '));
  ok('immer nur eine Kachel offen',
     karten[0].getAttribute('aria-expanded') === 'true' &&
     karten[1].getAttribute('aria-expanded') === 'false');
  click(karten[0], document);
  ok('noch einmal tippen macht sie wieder zu', body.hidden === true);

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   „Wem gehört dieses Feld?" (14.09.2026)
   ═══════════════════════════════════════════════════════════
   Sönke nach dem ersten Durchgang im Raum: „Man kann am Boden nicht
   gut erkennen, was zu welchem Volk gehört — gelber Strand und
   grüner Wald sind sehr nah an dem dran, was Team Grün und Team Rot
   haben. Hier muss die UI sich besser abheben, dass ich die Felder
   eindeutig erkenne."

   Geprüft wird nicht die Zahl im Quelltext, sondern die FARBE, die
   auf der Kachel landet — gegen die beiden Tabellen, aus denen sie
   entsteht (KARTE.land und TEAMS, beide aus tool.js gelesen). Eine
   Zusage über `KARTE.mix = .82` wäre genau so lange richtig, bis
   jemand die Mischung anders rechnet. */
const hex2 = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const farbAbstand = (a, b) => {
  const A = hex2(a), B = hex2(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
/* Die beiden Tabellen aus tool.js — dieselbe Technik wie
   testRuinTabelle. */
function palette() {
  const quelle = fs.readFileSync(TOOL, 'utf8');
  const l = /land: \{ sand: '(#\w+)', gras: '(#\w+)', wald: '(#\w+)', fels: '(#\w+)' \}/.exec(quelle);
  const voelker = [];
  /* Hinter der Farbe darf noch etwas stehen: seit dem 18.09.2026
     trägt jede Zeile zusätzlich `viele` (Ein- oder Mehrzahl des
     Namens, fürs Siegerbild). Ein Muster, das auf `' }` endete, fand
     danach KEINE einzige Farbe mehr — und der Prüfstand zerbrach
     erst zwei Zusagen später an einem `undefined`. */
  const re = /\{ name: '[^']+',\s*color: '(#\w+)'/g;
  let m;
  while ((m = re.exec(quelle))) voelker.push(m[1]);
  return { boden: l ? l.slice(1, 5) : [], voelker };
}

async function testBesitzKlar() {
  console.log('\n— Wem gehört dieses Feld? —');
  const { boden, voelker } = palette();
  ok('vier Bodenfarben aus tool.js gelesen', boden.length === 4, js(boden));
  ok('acht Volksfarben aus tool.js gelesen', voelker.length === 8, `${voelker.length}`);

  const len = RMAP.length;
  /* Feld 0 und 1 gehören Slot 0, Feld 5 gehört Slot 1. Feld 0 und 1
     sind Nachbarn (gerade Zeile: (0,0) → (0,1) und (1,0)), Feld 5 ist
     (1,0) — also liegt zwischen 0 und 5 eine echte Grenze und
     zwischen 0 und 1 keine. */
  const stand = {
    own: zeichenkette(len, { 0: '0', 1: '0', 5: '1' }, '.'),
    ruins: '.'.repeat(len),
    hearts: '0'.repeat(len),
    me: { picks: 0, streak: 0 }
  };
  const { tool, root } = await mountRuinen(stand);

  /* ── Die Einfärbung ──────────────────────────────────────── */
  const zellen = [...root.querySelectorAll('.wi-cell')];
  const meine = zellen.filter(c => c.dataset.t !== '.');
  ok('drei Felder sind in Besitz', meine.length === 3, `${meine.length}`);
  let klar = true, wo = '';
  for (const c of meine) {
    const fill = c.getAttribute('fill');
    const volk = voelker[+c.dataset.t];
    const zuVolk = farbAbstand(fill, volk);
    const zuBoden = Math.min(...boden.map(b => farbAbstand(fill, b)));
    if (!(zuVolk < zuBoden)) { klar = false; wo += ` ${fill}: Volk ${zuVolk.toFixed(0)} ≥ Boden ${zuBoden.toFixed(0)}`; }
  }
  ok('eine eroberte Kachel liegt näher an ihrer Volksfarbe als an JEDER Bodenfarbe',
     klar, wo);
  /* Und die Bodenart bleibt trotzdem lesbar. Das lässt sich an der
     Testinsel nicht ablesen — sie hat vier Reihen und ist damit
     ringsum Küste, also überall Strand. Geprüft wird deshalb die
     Rechnung selbst: die vier Bodenfarben, mit DERSELBEN Volksfarbe
     gemischt, müssen vier unterscheidbare Töne ergeben. Wäre der
     Anteil 1.0, läge die ganze Insel unter einem Farbeimer, und die
     erste Zusage oben wäre trotzdem grün. */
  const quelle = fs.readFileSync(TOOL, 'utf8');
  const anteil = parseFloat((/\n\s*mix: ([\d.]+)/.exec(quelle) || [])[1]);
  ok('KARTE.mix steht in tool.js', anteil > 0 && anteil <= 1, `${anteil}`);
  const misch = (a, b, t) => {
    const A = hex2(a), B = hex2(b);
    return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t)
      .toString(16).padStart(2, '0')).join('');
  };
  const toene = boden.map(b => misch(b, voelker[0], anteil));
  let unterscheidbar = true;
  for (let i = 0; i < toene.length; i++) {
    for (let j = i + 1; j < toene.length; j++) {
      if (farbAbstand(toene[i], toene[j]) < 6) unterscheidbar = false;
    }
  }
  ok('der Boden scheint durch die Volksfarbe noch durch', unterscheidbar, js(toene));

  /* ── Der Rahmen um ein Volksgebiet (16.09.2026) ──────────────
     Am Tablet ist die Karte flach, und damit tritt an die Stelle des
     Grenzstrichs (Kante für Kante, siehe testRelief am Pult) ein
     geschlossener Zug um das ganze Gebiet. Sönke: „damit man sofort
     sieht, das gehört zusammen."

     Feld 0 und 1 gehören Slot 0 und sind Nachbarn, Feld 5 gehört
     Slot 1. Es müssen also ZWEI Gebiete umrissen sein, und der Zug
     um die beiden zusammenhängenden Felder darf ihre gemeinsame
     Kante NICHT enthalten — sonst ist er eine Wabenkette und sagt
     nichts mehr. Zehn Kanten um zwei Waben, nicht zwölf. */
  const rahmen = [...root.querySelectorAll('.wi-area')].filter(p => (p.getAttribute('d') || '').length > 2);
  ok('zwei Völker, zwei Rahmen (je zwei Lagen)', rahmen.length === 4, `${rahmen.length}`);
  const kantenZahl = d => (d.match(/Q/g) || []).length;
  const zuege = rahmen.map(p => kantenZahl(p.getAttribute('d'))).sort((a, b) => a - b);
  ok('der Zug um zwei Felder hat zehn Kanten, nicht zwölf',
     zuege[3] === 10 && zuege[0] === 6, js(zuege));
  /* Die Farbe ist die aufgehellte Volksfarbe — heller als sie, und
     näher an ihr als an der des anderen Volkes. */
  const hell = rahmen.map(p => p.getAttribute('stroke'))
                     .filter(s => /^#/.test(s || ''));
  ok('die helle Lage trägt die Volksfarbe, aufgehellt',
     hell.length === 2 &&
     farbAbstand(hell[0], voelker[0]) < farbAbstand(hell[0], voelker[1]) &&
     hex2(hell[0]).reduce((a, b) => a + b, 0) > hex2(voelker[0]).reduce((a, b) => a + b, 0),
     `${js(hell)} gegen ${voelker[0]}`);
  /* ⚠️ Der Rahmen läuft genau an der Front entlang — also dort, wohin
     man bei der freien Wahl tippt. Ohne die Sammelregel markiert die
     Karte das Ziel und schluckt den Tipp. */
  const css2 = fs.readFileSync(path.join(HERE, '..', 'tool.css'), 'utf8').replace(/\n/g, ' ');
  ok('der Grenzstrich ist für Zeiger durchlässig',
     /\.wi-edge[^{]*\{[^}]*pointer-events:\s*none/.test(css2));
  ok('der Areal-Rahmen ist es auch',
     /\.wi-areas[^{]*\{[^}]*pointer-events:\s*none/.test(css2));

  /* ── Und die flache Karte ist wirklich flach ─────────────────
     Die drei Zusagen, an denen die ganze Umstellung hängt: keine
     Säulen, kein Nebel, kein Filter. Fällt eine davon, ist die
     Reliefkarte zurück auf dem Handy und niemand merkt es, außer
     dass es ruckelt. */
  ok('die Karte weist sich als flach aus',
     root.querySelector('.wi-map').classList.contains('wi-map--flach'));
  ok('keine Säulen am Tablet', root.querySelectorAll('.wi-side').length === 0,
     `${root.querySelectorAll('.wi-side').length}`);
  ok('kein Nebel am Tablet', root.querySelectorAll('.wi-fog').length === 0);
  ok('kein Weichzeichner und keine Wolke',
     root.querySelectorAll('feGaussianBlur, feTurbulence, feDisplacementMap, mask').length === 0);
  ok('und kein Element verweist auf einen Filter',
     [...root.querySelectorAll('.wi-map *')].every(n => !n.getAttribute('filter')
        || /tint/.test(n.getAttribute('filter'))));
  /* Eine Kachel ist EIN Pfad. Das ist der Grund für alles andere. */
  ok('eine Wabe je Feld, mehr nicht',
     root.querySelectorAll('.wi-cell').length === RMAP.length,
     `${root.querySelectorAll('.wi-cell').length} von ${RMAP.length}`);

  tool.unmount();
}

/* Die Ruine in der Volksfarbe und die Herzen darauf — Sönkes zwei
   Nachsätze vom 14.09.2026: „Können auch die Bilder der Ruinen die
   Farbe des Volkes einnehmen? Und die Herzen der Ruinen sollten auf
   der Ruine sein." */
async function testRuineInVolksfarbe() {
  console.log('\n— Die Ruine trägt die Farbe ihres Volkes —');
  const len = RMAP.length;
  const { voelker } = palette();
  const stand = {
    // Der große Ort ist erobert (Slot 1), der kleine nur aufgedeckt.
    own: zeichenkette(len, { 0: '0', [R_GROSS]: '1' }, '.'),
    ruins: zeichenkette(len, { [R_GROSS]: 'L', [R_KLEIN]: 'K' }, '.'),
    hearts: zeichenkette(len, { [R_GROSS]: '4', [R_KLEIN]: '1' }, '0'),
    me: { picks: 0, streak: 0 }
  };
  const { tool, root } = await mountRuinen(stand);

  const gross = platz(root, 0), klein = platz(root, 1);
  const bilder = gross.querySelectorAll('image');
  ok('der Tempel steht als Bild UND als Wasche da', bilder.length === 2, `${bilder.length}`);
  ok('beide zeigen dieselbe Datei',
     bilder[0].getAttribute('href') === bilder[1].getAttribute('href'),
     bilder[1].getAttribute('href'));
  /* Die Wasche liegt ÜBER dem Bild und deckt es nicht zu: sichtbar,
     aber durchsichtig. Wäre sie voll, stünde dort eine Silhouette
     ohne Gebäude. */
  const ton = +bilder[1].getAttribute('opacity');
  ok('die Wasche ist sichtbar, aber durchsichtig', ton > .2 && ton < .9, `${ton}`);
  ok('und sie läuft durch den Farbfilter des Volkes',
     /tint1\)$/.test(bilder[1].getAttribute('filter') || ''),
     bilder[1].getAttribute('filter'));
  /* Der Filter muss es auch geben — ein `filter="url(#…)"`, das ins
     Leere zeigt, lässt das Element GAR NICHT zeichnen (dieselbe
     Falle wie bei `el()`), der Tempel wäre also weg. Und er muss die
     richtige Farbe fluten. */
  const fid = (bilder[1].getAttribute('filter') || '').replace(/^url\(#|\)$/g, '');
  const flut = root.querySelector(`#${fid} feFlood`);
  ok('den Filter gibt es, und er flutet die Volksfarbe',
     !!flut && flut.getAttribute('flood-color').toLowerCase() === voelker[1].toLowerCase(),
     flut && flut.getAttribute('flood-color'));
  /* Eine Ruine, die niemandem gehört, trägt keine Farbe. */
  ok('der neutrale Ort bleibt ungefärbt',
     +klein.querySelectorAll('image')[1].getAttribute('opacity') === 0);

  /* ── Die Herzen sitzen AUF dem Gebäude ────────────────────── */
  const bild = bilder[0];
  const oben = +bild.getAttribute('y');
  const hoch = +bild.getAttribute('height');
  const herz = gross.querySelector('.wi-hearts path');
  const hy = +/translate\([-\d.]+ ([-\d.]+)\)/.exec(herz.getAttribute('transform'))[1];
  ok('vier Herzen am Tempel', herzZahl(gross) === 4, `${herzZahl(gross)}`);
  ok('sie liegen zwischen Dach und Sockel, nicht darüber',
     hy > oben && hy < oben + hoch, `Bild ${oben}…${(oben + hoch).toFixed(2)}, Herzen ${hy}`);
  /* Und sie bekommen ein Kissen: auf einer gezeichneten Fassade
     zerfällt eine Reihe weiß umrandeter Herzen sonst optisch. */
  ok('ein dunkles Kissen trägt die Reihe',
     !!gross.querySelector('.wi-hearts rect'));
  /* Schutzherzen auf einem gewöhnlichen Feld bekommen KEINS — dort
     wäre es ein Fleck ohne Grund. */
  ok('ein Schutzherz auf freiem Feld kommt ohne Kissen aus',
     !root.querySelector('.wi-guards rect'));

  tool.unmount();
}

/* ═══════════════════════════════════════════════════════════
   Stillgelegt (0152) und die Wörter DIESER Runde (0153)
   ═══════════════════════════════════════════════════════════
   Zwei Meldungen von Sönke in einem Durchgang: ein gesperrtes Tablet
   darf in keiner Volksspalte stehen, und die Auswertung am Ende darf
   nicht tagelang dieselben Wörter zeigen. */
async function testStillgelegt() {
  console.log('\n— Stillgelegte und die Wörter der Runde —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;
  let phase = 'lobby';
  let scope = 'round';

  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        if (fn === 'wi_sets_list') return Promise.resolve({ ok: true, chosen: ['s1'],
          sets: [{ id: 's1', title: 'Schule', count: 30, level: '5/6', mine: '0' }] });
        if (fn === 'wi_room_get') return Promise.resolve({
          ok: true, role: 'presenter', phase, mode: 'type', direction: 'mixed',
          team_count: 2, factions: [0, 1], duration: 600, radius: 5, seed: 1,
          teams: [{ i: 0, tiles: 4, ruins: 0, score: 4, people: 1 },
                  { i: 1, tiles: 2, ruins: 0, score: 2, people: 1 }],
          map_key: 'raum:' + phase,
          map: args.p_full ? (phase === 'lobby' ? [] : MAP) : null,
          own: phase === 'lobby' ? '' : OWN_START,
          ends_at: new Date(Date.now() + 60000).toISOString(),
          countdown_ends_at: null, winner_team: 0, sets: ['s1'],
          online_count: 3, room_total: 3,
          people: [{ seat: 1, name: 'Ada', team: 0, online: true, blocked: false, correct: 0, wrong: 0 },
                   { seat: 2, name: 'Bo',  team: 1, online: true, blocked: false, correct: 0, wrong: 0 },
                   { seat: 3, name: 'Cem', team: 0, online: true, blocked: true,  correct: 0, wrong: 0 }]
        });
        if (fn === 'wi_hard_words') {
          const r = { ok: true, words: [{ term: 'die Tafel', trans: 'board', wrong: 5, seen: 9 }] };
          if (scope) r.scope = scope;
          return Promise.resolve(r);
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  const spalten = [...root.querySelectorAll('.wi-lteam')].map(c => c.textContent).join(' ');
  ok('ein stillgelegtes Kind steht in keiner Volksspalte', !/Cem/.test(spalten), spalten);
  const warte = root.querySelector('[data-part="waiting"]');
  ok('es steht aber in einer eigenen Zeile darunter',
     warte.hidden === false && /Stillgelegt \(1\)/.test(warte.textContent) && /Cem/.test(warte.textContent),
     warte.textContent.replace(/\s+/g, ' '));
  ok('und die Inselgröße rechnet mit zwei Kindern, nicht mit dreien',
     /bei 2 Kindern/.test(root.querySelector('[data-part="durtext"]').textContent),
     root.querySelector('[data-part="durtext"]').textContent);

  phase = 'ended';
  await tool.update();
  await wait(80);
  const hart = () => root.querySelector('[data-part="hard"]').textContent;
  ok('die Auswertung zeigt das Wort', /Tafel/.test(hart()));
  ok('und sagt nichts von einer fehlenden Migration', !/0153/.test(hart()), hart());

  /* Ohne `scope` ist 0153 nicht eingespielt — dann steht das da,
     statt dass die Überschrift still etwas Falsches behauptet. */
  scope = null;
  phase = 'lobby'; await tool.update(); await wait(40);
  phase = 'ended'; await tool.update(); await wait(80);
  ok('ohne 0153 steht der Hinweis darunter', /0153/.test(hart()), hart());

  tool.unmount();
}

/* Die Balance steht zwangsläufig in zwei Dateien: im Browser
   (RUINEN) und in Postgres (wi_ruin_def). Hier wird zugesagt, dass
   es dieselben Zahlen sind — dasselbe Muster wie beim Uhr-Deckel.
   Ohne diese Zusage verspricht die Lobby irgendwann vier Herzen,
   während der Server mit fünf rechnet, und beides sieht für sich
   plausibel aus. */
async function testRuinTabelle() {
  console.log('\n— Dieselben Zahlen wie im Server —');
  const quelle = fs.readFileSync(TOOL, 'utf8');
  const imTool = {};
  const re = /\b[KTALS]: \{ art: '(\w+)',\s*name: '[^']+',\s*leben: (\d+), herzen: (\d+), wert: (\d+),\s*gross: (true|false)/g;
  let m;
  while ((m = re.exec(quelle))) {
    imTool[m[1]] = { herzen: +m[3], leben: +m[2], wert: +m[4], gross: m[5] === 'true' };
  }
  ok('das Gerät kennt fünf Ruinen', Object.keys(imTool).length === 5, js(Object.keys(imTool)));

  const sqlDatei = path.join(HERE, '..', '..', '..', '..',
                             'supabase', 'migrations', '0146_wordisland_ruins.sql');
  const sql = fs.existsSync(sqlDatei) ? fs.readFileSync(sqlDatei, 'utf8') : '';
  const imServer = {};
  const re2 = /\('(klo|tor|arena|licht|schatten)',\s*(\d+),\s*(\d+),\s*(true|false)\)/g;
  while ((m = re2.exec(sql))) {
    imServer[m[1]] = { herzen: +m[2], wert: +m[3], gross: m[4] === 'true' };
  }
  ok('der Server auch', Object.keys(imServer).length === 5, js(Object.keys(imServer)));

  let gleich = true, wo = '';
  for (const art in imTool) {
    const a = imTool[art], b = imServer[art];
    if (!b || a.herzen !== b.herzen || a.wert !== b.wert || a.gross !== b.gross) {
      gleich = false; wo += ` ${art}: ${js(a)} ≠ ${js(b)}`;
    }
    // Sönkes Zahl ist „Leben", die Anzeige zeigt Herzen — das Feld
    // selbst ist das letzte Leben.
    if (a.leben !== a.herzen + 1) { gleich = false; wo += ` ${art}: Leben ≠ Herzen + 1`; }
  }
  ok('Herzen, Wertigkeit und Klasse stimmen überein', gleich, wo);

  for (const art in imTool) {
    const datei = path.join(HERE, '..', 'sprites', 'ruine', art + '.png');
    ok(`das Bild für ${art} liegt da`, fs.existsSync(datei));
  }
}

/* ═══════════════════════════════════════════════════════════
   Auswahl-Modus: der Takt kommt vom Server (0151)
   ═══════════════════════════════════════════════════════════
   Sönke, 16.09.2026: „Wenn die Lehrkraft ‚nur auswählen' auswählt,
   gibt es gerade keine Streaks … hier brauchen wir auch eine Streak
   (alle 5 wählen und alle 20 2 wählen)."

   Die Zahlen stehen seit 0151 im Server (wi_streak_goals) und fahren
   in jeder Antwort und in jedem wi_view mit. Geprüft wird deshalb
   nicht „steht 5 in der tool.js", sondern: das Gerät RECHNET mit dem,
   was es bekommt. Der bisherige Tablet-Test liefert gar keine
   streak_goals — er ist damit zugleich die Zusage über den Rückfall
   (3/12, der Tipp-Modus), und die beiden zusammen sind die ganze
   Aussage. */
async function testAuswahlTakt() {
  console.log('\n— Auswahl-Modus: Takt 5/20 —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const ZIELE = { step: 5, big: 20 };
  const OPTS = ['book', 'pen', 'house', 'school', 'chair', 'table', 'door', 'window'];
  const aufgabe = () => ({ prompt: 'das Buch', dir: 'de_en', stage: 'choice', options: OPTS });
  let me = { seat: 3, name: 'Tablet 3', team: 0, streak: 0, picks: 0,
             correct: 0, wrong: 0, locked_for: 0, task: aufgabe() };
  let antwort = null;

  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        if (fn === 'wi_view') {
          return Promise.resolve(viewFor(
            Object.assign({ mode: 'choice', streak_goals: ZIELE },
                          args.p_full ? { map: MAP } : {}), me));
        }
        if (fn === 'wi_answer') return Promise.resolve(antwort);
        return Promise.resolve({ ok: false, error: 'not_allowed' });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  const chip  = root.querySelector('.wi-streak');
  const zahl  = () => root.querySelector('[data-part="streakn"]').textContent;
  const ziel  = () => root.querySelector('[data-part="streakgoal"]').textContent;
  const opts  = root.querySelector('[data-part="opts"]');
  /* Geantwortet wird hier durch Antippen einer Kachel — im
     Auswahl-Modus steht gar kein Feld da. */
  const tippe = async (a) => {
    antwort = a;
    me = Object.assign({}, me, { streak: a.streak, picks: a.picks, task: a.task });
    click(opts.querySelector('button'), document);
    await wait(40);
  };

  ok('acht Kacheln statt eines Feldes',
     opts.hidden === false && opts.querySelectorAll('button').length === 8 &&
     root.querySelector('[data-part="typeform"]').hidden === true);

  await tippe({ ok: true, result: 'correct', streak: 2, picks: 0, streak_goals: ZIELE,
                tile: { r: 0, c: 2, kind: 'fog', ruin: 0 }, task: aufgabe() });
  ok('Serie 2 zählt zur FÜNF, nicht zur drei',
     chip.hidden === false && zahl() === '2' && ziel() === '/5', chip.textContent.trim());

  await tippe({ ok: true, result: 'correct', streak: 4, picks: 0, streak_goals: ZIELE,
                tile: { r: 0, c: 3, kind: 'fog', ruin: 0 }, task: aufgabe() });
  ok('bei vier wird es warm', chip.classList.contains('is-near') &&
     !chip.classList.contains('is-hot'), chip.textContent.trim());

  await tippe({ ok: true, result: 'correct', streak: 5, picks: 1, streak_goals: ZIELE,
                tile: null, task: aufgabe() });
  ok('die FÜNFTE bringt die freie Wahl', chip.classList.contains('is-hot') &&
     zahl() === '5' && ziel() === '/10', chip.textContent.trim());
  ok('und der Wahl-Kasten geht auf',
     root.querySelector('[data-part="pickov"]').hidden === false);
  ok('die Ansage nennt EIN Feld',
     root.querySelector('[data-part="pickbig"]').textContent.replace(/\s+/g, ' ').trim()
       === 'Nimm 1 Feld gezielt ein!');

  /* Der große Schlag wird ANGEKÜNDIGT und nicht überrascht. Drei
     Stufen, und sie hängen alle am Takt vom Server:
       15  gerade verdient, das nächste Ziel ist die ZWANZIG
       18  das Ziel sticht hervor (dort warten zwei Felder)
       19  noch eine — und der Satz sagt, dass es ZWEI werden */
  await tippe({ ok: true, result: 'correct', streak: 15, picks: 4, streak_goals: ZIELE,
                tile: null, task: aufgabe() });
  ok('Serie 15: verdient, und das nächste Ziel ist die ZWANZIG',
     chip.classList.contains('is-hot') && ziel() === '/20', chip.textContent.trim());

  await tippe({ ok: true, result: 'correct', streak: 18, picks: 4, streak_goals: ZIELE,
                tile: { r: 1, c: 2, kind: 'fog', ruin: 0 }, task: aufgabe() });
  ok('Serie 18: das Ziel sticht hervor — dort warten zwei Felder',
     ziel() === '/20' && chip.classList.contains('is-big') &&
     !chip.classList.contains('is-hot'), chip.textContent.trim());

  await tippe({ ok: true, result: 'correct', streak: 19, picks: 4, streak_goals: ZIELE,
                tile: { r: 1, c: 3, kind: 'fog', ruin: 0 }, task: aufgabe() });
  ok('Serie 19: noch eine — und der Satz verspricht ZWEI Felder',
     chip.classList.contains('is-near') && /ZWEI/.test(chip.title), chip.title);

  await tippe({ ok: true, result: 'correct', streak: 20, picks: 6, streak_goals: ZIELE,
                tile: null, task: aufgabe() });
  ok('Serie 20: zwei auf einmal sind gutgeschrieben',
     chip.classList.contains('is-hot') && /ZWEI Felder/.test(chip.title), chip.title);

  /* ── Die Sperre muss man SEHEN ────────────────────────────────
     Im Auswahl-Modus gibt es kein Eingabefeld, das grau werden
     könnte — die acht Kacheln SIND die Eingabe. Ohne diese Zeile
     tippt ein Kind weiter und bekommt nur Fehlermeldungen zurück. */
  await tippe({ ok: true, result: 'wrong', streak: 0, picks: 0, streak_goals: ZIELE,
                solution: 'book', locked_for: 2, task: aufgabe() });
  ok('eine Sperre legt die acht Kacheln still',
     opts.classList.contains('is-wait'));
  await wait(2100);
  ok('… und gibt sie von selbst wieder frei',
     !opts.classList.contains('is-wait'));

  /* Ohne Sperre (die bedachte falsche Antwort seit 0151) passiert
     genau nichts — das ist der eigentliche Gewinn der Migration. */
  await tippe({ ok: true, result: 'wrong', streak: 0, picks: 0, streak_goals: ZIELE,
                solution: 'pen', locked_for: 0, task: aufgabe() });
  ok('eine bedachte falsche Antwort hält niemanden auf',
     !opts.classList.contains('is-wait'));
  ok('… zeigt aber die Lösung', /pen/.test(root.querySelector('.wi-fb').textContent),
     root.querySelector('.wi-fb').textContent);

  tool.unmount();
}

/* Der Takt steht zwangsläufig an zwei Orten: als Rückfall im Gerät
   und maßgeblich im Server. Hier wird zugesagt, dass der Rückfall
   der TIPP-Modus ist — fehlt 0151 in der Datenbank, zählt der Server
   in Dreien, und das Abzeichen muss dasselbe tun. */
async function testTaktTabelle() {
  console.log('\n— Der Takt: Gerät und Server —');
  const quelle = fs.readFileSync(TOOL, 'utf8');
  const m = /TAKT_RUECKFALL = \{ step: (\d+), big: (\d+) \}/.exec(quelle);
  ok('das Gerät hat einen Rückfall', !!m, m && m[0]);

  const sqlDatei = path.join(HERE, '..', '..', '..', '..',
                             'supabase', 'migrations', '0151_wordisland_choice_streak_lock.sql');
  const sql = fs.existsSync(sqlDatei) ? fs.readFileSync(sqlDatei, 'utf8') : '';
  const tipp = /else jsonb_build_object\('step', (\d+), 'big', (\d+)\)/.exec(sql);
  const wahl = /then jsonb_build_object\('step', (\d+), 'big', (\d+)\)/.exec(sql);
  ok('der Server kennt beide Takte', !!tipp && !!wahl,
     `${tipp && tipp[0]} | ${wahl && wahl[0]}`);
  if (!m || !tipp || !wahl) return;
  ok('der Rückfall im Gerät ist der Tipp-Modus des Servers',
     m[1] === tipp[1] && m[2] === tipp[2], `${m[1]}/${m[2]} ↔ ${tipp[1]}/${tipp[2]}`);
  ok('Sönkes Zahlen für den Auswahl-Modus: 5 und 20',
     wahl[1] === '5' && wahl[2] === '20', `${wahl[1]}/${wahl[2]}`);
  /* ⚠️ Der große Schlag muss auf eine Antwort fallen, die ohnehin
     eine Wahl bringt — sonst fiele er ins Leere. */
  ok('big ist in beiden Modi ein Vielfaches von step',
     +tipp[2] % +tipp[1] === 0 && +wahl[2] % +wahl[1] === 0);
}

/* ─── Was wann läuft ────────────────────────────────────────
   Vier Bereiche, geschnitten nach dem, was man an EINEM Tag anfasst.
   Wer an den Ruinen arbeitet, braucht die Level-Feier nicht — und
   umgekehrt.

     node …/uitest.js            alles (vor dem Einspielen)
     node …/uitest.js raum       Tablet, Pult, Lobby
     node …/uitest.js insel      die eigene Insel
     node …/uitest.js level      Figur, Level, Uhr
     node …/uitest.js ruinen     Ruinen und Ansagen
     node …/uitest.js sieger     das Siegerbild beider Rollen
     node …/uitest.js insel level    mehrere Bereiche

   Eine Prüfung darf in mehreren Bereichen stehen; gelaufen wird sie
   trotzdem nur einmal. */
/* ═══════════════════════════════════════════════════════════
   DAS SIEGERBILD  (18.09.2026)
   ═══════════════════════════════════════════════════════════
   Sönke: „wir brauchen sowohl am Tablet als auch am Beamer ein
   richtig guten Siegerscreen (analog zu Mathoria)."

   Geprüft wird, was man an EINEM Blick festmachen kann: wer oben
   steht, in welcher Reihenfolge die Karten in der DOM liegen, ob
   das Kind seinen eigenen Platz erfährt — und die zwei Fälle, in
   denen frühere Wordisland-Fehler saßen:

     · Der Sieger kommt vom SERVER (winner_team) und wird nicht aus
       den Punkten geraten. Steht dort ein Volk, das nach Punkten
       zweiter wäre, gewinnt trotzdem es.
     · Ohne Migration 0158 fehlt `correct`. Dann darf die Karte die
       Angabe WEGLASSEN und nicht „0 richtig" behaupten.

   Das Aussehen prüft das hier nicht — ob das Podest wirklich als
   2·1·3 dasteht, entscheidet tool.css (order), und das sieht man
   nur mit Augen. Geprüft ist die DOM-Reihenfolge 1·2·3: sie ist die
   Vorlese-Reihenfolge und die Grundlage der CSS-Regel.            */
const podNamen = root =>
  [...root.querySelectorAll('.wi-pod')].map(p =>
    p.querySelector('.wi-podname').textContent.trim());

async function testSiegerPult() {
  console.log('\n— Siegerbild am Beamer —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  /* Fünf Völker, damit es ein Podest UND Zeilen darunter gibt.
     Die Völker sind wieder die HINTEREN (factions), sonst deckt
     Slot = Volk den Fehler zu, der uns hierher gebracht hat. */
  let correct = true;
  let sieger = 1;
  const teams = [
    { i: 0, tiles: 3, ruins: 1, score: 4, people: 2, correct: 11 },
    { i: 1, tiles: 8, ruins: 2, score: 10, people: 2, correct: 20 },
    { i: 2, tiles: 5, ruins: 0, score: 5, people: 2, correct: 9  },
    { i: 3, tiles: 0, ruins: 0, score: 0, people: 2, correct: 3  },
    { i: 4, tiles: 0, ruins: 0, score: 0, people: 2, correct: 1  }
  ];
  const ctx = Object.assign({}, ctxBase, {
    role: 'presenter',
    actions: {
      role: 'presenter',
      call: (fn, args) => {
        if (fn === 'wi_hard_words') return Promise.resolve({ ok: true, scope: 'round', words: [] });
        if (fn !== 'wi_room_get') return Promise.resolve({ ok: true });
        /* ⚠️ Die Karte MUSS mitkommen, sobald sie erfragt wird. Ohne
           sie sieht applyView einen neuen map_key ohne `map`, fordert
           nach — und bekommt wieder keine: die Tafel bliebe leer, und
           der Prüfstand meldete einen Fehler, der keiner ist. */
        return Promise.resolve(pultView({
          phase: 'ended', winner_team: sieger,
          map_key: 'raum:ended', map: args && args.p_full ? MAP : null,
          team_count: 5, factions: [2, 3, 4, 5, 7],
          teams: teams.map(t => {
            const c = Object.assign({}, t);
            if (!correct) delete c.correct;
            return c;
          })
        }));
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(80);

  const end = root.querySelector('[data-part="end"]');
  ok('Siegertafel offen', end.hidden === false);
  /* Slot 1 ist bei factions [2,3,4,5,7] das Volk 3 — die Mal-Hasen.
     Genau darum steht hier ein Name und keine Slot-Nummer: stünde in
     der Überschrift „Brokkoli-Giraffen" (Volk 2, also Slot 0), wäre
     die Übersetzung Slot → Volk wieder kaputt. */
  ok('die Überschrift nennt das Siegervolk',
     /Mal-Hasen/.test(root.querySelector('[data-part="winner"]').textContent),
     root.querySelector('[data-part="winner"]').textContent.replace(/\s+/g, ' ').trim());
  /* Slot 1 → Volk 3 (Mal-Hasen) ist Mehrzahl, Slot 4 → Volk 7
     (Spuk-Einhorn) wäre Einzahl. Das Verb muss sich beugen. */
  ok('und beugt das Verb in die Mehrzahl',
     /gewinnen!/.test(root.querySelector('[data-part="winner"]').textContent));

  ok('drei Karten auf dem Podest', root.querySelectorAll('.wi-pod').length === 3);
  /* Sieger zuerst in der DOM — 2·1·3 macht erst tool.css daraus.
     Slot 1 = Mal-Hasen (10 P.), Slot 2 = Kosmische Katzen (5 P.),
     Slot 0 = Brokkoli-Giraffen (4 P.). */
  ok('und zwar in der Vorlese-Reihenfolge 1·2·3',
     js(podNamen(root)) === js(['Mal-Hasen', 'Kosmische Katzen', 'Brokkoli-Giraffen']),
     podNamen(root).join(' · '));
  ok('der Sieger trägt Gold',
     root.querySelector('.wi-pod--1 .wi-podmedal').textContent.trim() === '🥇');
  ok('die Punkte stehen auf der Karte',
     /10/.test(root.querySelector('.wi-pod--1 .wi-podscore').textContent),
     root.querySelector('.wi-pod--1 .wi-podscore').textContent.trim());
  ok('darunter Felder, Ruinen und richtige Wörter',
     /8 Felder/.test(root.querySelector('.wi-pod--1 .wi-podsub').textContent) &&
     /2 aus Ruinen/.test(root.querySelector('.wi-pod--1 .wi-podsub').textContent) &&
     /20 richtig/.test(root.querySelector('.wi-pod--1 .wi-podsub').textContent),
     root.querySelector('.wi-pod--1 .wi-podsub').textContent.replace(/\s+/g, ' ').trim());

  const rest = root.querySelector('[data-part="end-rest"]');
  ok('ab Platz 4 stehen Zeilen', rest.hidden === false &&
     rest.querySelectorAll('.wi-erow').length === 2);
  /* Slot 3 und 4 stehen beide auf 0 Punkten — den Stichentscheid
     macht `correct` (3 gegen 1), also bleibt die Reihenfolge, aber
     die PLÄTZE sind verschieden. Wären auch die gleich, müsste
     zweimal dieselbe Zahl dastehen. */
  ok('und tragen verschiedene Plätze, weil correct entscheidet',
     js([...rest.querySelectorAll('.wi-eplace')].map(e => e.textContent.trim())) === js(['4.', '5.']),
     [...rest.querySelectorAll('.wi-eplace')].map(e => e.textContent.trim()).join(' '));

  /* ── Der Sieger kommt vom Server ───────────────────────────── */
  sieger = 2;            // nach Punkten wäre das nur der Zweite
  await tool.update();
  await wait(60);
  ok('ein vom Server gesetzter Sieger steht vorn, auch gegen die Punkte',
     podNamen(root)[0] === 'Kosmische Katzen' &&
     /Kosmische Katzen/.test(root.querySelector('[data-part="winner"]').textContent),
     podNamen(root).join(' · '));
  ok('und die Karte dahinter ist die punktstärkste',
     podNamen(root)[1] === 'Mal-Hasen', podNamen(root).join(' · '));

  /* ── Ohne 0158 fehlt `correct` ─────────────────────────────── */
  correct = false; sieger = 1;
  await tool.update();
  await wait(60);
  const sub = root.querySelector('.wi-pod--1 .wi-podsub').textContent;
  ok('ohne 0158 fehlt die Wortzahl, statt „0 richtig" zu behaupten',
     !/richtig/.test(sub) && /8 Felder/.test(sub), sub.replace(/\s+/g, ' ').trim());

  tool.unmount();
}

async function testSiegerTablet() {
  console.log('\n— Siegerbild am Tablet —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  let meinVolk = 2;          // Slot 2 → nicht der Sieger
  let richtig = 14, falsch = 5;
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => {
        if (fn !== 'wi_view') return Promise.resolve({ ok: true });
        return Promise.resolve(viewFor({
          phase: 'ended', winner_team: 0,
          team_count: 4, factions: [2, 3, 4, 5],
          map_key: 'raum:ended', map: args && args.p_full ? MAP : null,
          teams: [{ i: 0, tiles: 9, ruins: 1, score: 10, people: 2, correct: 21 },
                  { i: 1, tiles: 6, ruins: 0, score: 6,  people: 2, correct: 15 },
                  { i: 2, tiles: 4, ruins: 1, score: 5,  people: 2, correct: 12 },
                  { i: 3, tiles: 1, ruins: 0, score: 1,  people: 2, correct: 4  }]
        }, { team: meinVolk, correct: richtig, wrong: falsch }));
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(80);

  ok('Siegertafel offen',   root.querySelector('[data-part="tend"]').hidden === false);
  ok('Wartetafel zu',       root.querySelector('[data-part="tlobby"]').hidden === true);
  ok('Spieltafel zu',       root.querySelector('[data-part="tplay"]').hidden === true);
  ok('die Überschrift nennt das Siegervolk',
     /Brokkoli-Giraffen/.test(root.querySelector('[data-part="twinner"]').textContent),
     root.querySelector('[data-part="twinner"]').textContent.replace(/\s+/g, ' ').trim());

  /* Zwei Karten: der Sieger und das eigene Volk — die anderen zwei
     fehlen mit Absicht. */
  ok('zwei Karten: Sieger und eigenes Volk',
     js(podNamen(root)) === js(['Brokkoli-Giraffen', 'Kosmische Katzen']),
     podNamen(root).join(' · '));
  ok('die eigene Karte ist als solche gezeichnet',
     !!root.querySelector('.wi-pod--mine') &&
     /Kosmische Katzen/.test(root.querySelector('.wi-pod--mine').textContent));
  ok('der eigene Platz steht als Satz da',
     /Ihr seid/.test(root.querySelector('[data-part="tplace"]').textContent) &&
     /Dritte/.test(root.querySelector('[data-part="tplace"]').textContent),
     root.querySelector('[data-part="tplace"]').textContent.trim());

  /* ── Die eigene Wort-Bilanz (Sönkes Wunsch) ────────────────── */
  const tally = root.querySelector('[data-part="tmine"]');
  ok('die eigene Bilanz steht darunter', tally.hidden === false &&
     /14/.test(tally.textContent) && /5/.test(tally.textContent),
     tally.textContent.replace(/\s+/g, ' ').trim());

  /* ── Auch nach der Runde wird im Raum nicht mehr geübt ──────
     Der zweite „Bis dahin üben"-Knopf ist am 20.09.2026 mit dem
     ersten gegangen: zwei Wege in dieselbe Übung, und die Übung
     gehört auf die eigene Insel. Das Siegerbild bleibt stehen, bis
     die Lehrkraft weitermacht. */
  ok('kein Üben-Knopf auf dem Siegerbild',
     root.querySelector('[data-part="epractice"]') === null);
  ok('das Siegerbild bleibt stehen', root.querySelector('[data-part="tend"]').hidden === false);

  /* ── Wer selbst gewonnen hat, sieht EINE Karte ─────────────── */
  meinVolk = 0;
  await tool.update();
  await wait(60);
  ok('im Siegervolk steht die eigene Karte nicht zweimal da',
     root.querySelectorAll('.wi-pod').length === 1, podNamen(root).join(' · '));
  ok('und der Satz feiert statt zu zählen',
     /gewonnen/.test(root.querySelector('[data-part="tplace"]').textContent),
     root.querySelector('[data-part="tplace"]').textContent.trim());

  /* ── Wer kein Wort beantwortet hat, bekommt keine Bilanz ───── */
  richtig = 0; falsch = 0;
  await tool.update();
  await wait(60);
  ok('ohne eine einzige Antwort fehlt die Bilanz ganz',
     root.querySelector('[data-part="tmine"]').hidden === true);

  tool.unmount();
}

const BEREICHE = {
  raum: [testTablet, testAuswahlTakt, testTaktTabelle, testTabletLobby,
         testNewRound, testRelief, testPult, testPultUnits,
         testPultWoerter, testWoerterOhneMigration,
         testFehlendeMigration, testOhneMigration, testLobbyRegeln,
         testStillgelegt, testSiegerPult, testSiegerTablet],
  sieger: [testSiegerPult, testSiegerTablet],
  insel: [testSolo, testInselWaechst, testInselwelt, testSchlafendeInsel,
          testSchlafendeTiere, testWecken, testJahrgangsLeiste, testJahrgangsChips,
          testSoloUeben, testSchluepfen,
          testStats, testPunkte, testSoloOhneMigration, testUnitLeiste,
          testUnitBaum, testTierTipp, testFunkelBild, testUnitsOhneMigration],
  level: [testFigur, testFigurLevel, testFigurOhneMigration, testLevel,
          testBesterTagRaender, testLevelRaender, testLevelBonus,
          testLevelAufstieg, testLevelAufstiegMitTier, testLevelKeinAufstieg,
          testLevelOhneMigration, testUhr],
  ruinen: [testBlassUndRing, testBesitzKlar, testRuineInVolksfarbe, testRuinen,
           testAntwortAufSchild, testSchildUndSchatten, testAnsagen,
           testRuinenOhneMigration, testRuinTabelle]
};

(async () => {
  const wahl = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const unbekannt = wahl.filter(b => !BEREICHE[b]);
  if (unbekannt.length) {
    console.error(`Unbekannter Bereich: ${unbekannt.join(', ')}\n` +
                  `Bekannt sind: ${Object.keys(BEREICHE).join(', ')}`);
    process.exit(2);
  }
  const lauf = [];
  for (const b of (wahl.length ? wahl : Object.keys(BEREICHE)))
    for (const t of BEREICHE[b]) if (!lauf.includes(t)) lauf.push(t);

  const start = Date.now();
  for (const t of lauf) await t();
  const dauer = ((Date.now() - start) / 1000).toFixed(1);
  const umfang = wahl.length ? wahl.join(' + ') : 'alles';
  console.log(fails ? `\n${fails} Fehler.   (${umfang}, ${dauer} s)`
                    : `\nfertig, alles grün.   (${umfang}, ${dauer} s)`);
  process.exit(fails ? 1 : 0);
})();
