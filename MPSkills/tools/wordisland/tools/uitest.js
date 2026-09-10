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

  const sandbox = {
    window, document,
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
  return { window, document, impls, ctxBase, sandbox };
}

const click = (el, doc) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ─── Ein erfundener Server ─────────────────────────────────
   Dieselbe Gestalt wie wi_view/wi_room_get in 0131 + 0133. */
function island(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([r, c, (r === 1 && c === 2) ? 3 : 0, (r === 0 && c === 0) ? 1 : 0]);
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
  cells.filter(z => !z[3] && z[4] < R * 0.5).forEach((z, i) => { if (i % 9 === 0) z[2] = 1 + (i % 3); });
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
  ok('Schiffsbild gesetzt', /wordisland\/sprites\/red%20Schiff\.png$/.test(shipHref), shipHref);
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
  ok('Wort steht da', root.querySelector('.wi-word').textContent === 'das Haus');
  ok('Frage passt zur Richtung', /Englisch/.test(root.querySelector('.wi-ask').textContent));
  ok('Eingabefeld offen', !root.querySelector('.wi-type').hidden);

  /* Fast richtig → Schreibweisen */
  reply({ ok: true, result: 'spell', streak: 0, picks: 0,
          task: { prompt: 'das Haus', dir: 'de_en', stage: 'spell',
                  options: ['hous', 'house', 'housse', 'huose'] } });
  root.querySelector('.wi-in').value = 'hous';
  root.querySelector('.wi-type').dispatchEvent(new document.defaultView.Event('submit'));
  await wait(40);
  ok('Antwort ging raus', calls.some(([fn, a]) => fn === 'wi_answer' && a.p_input === 'hous'));
  ok('Schreibweisen als Knöpfe', root.querySelectorAll('.wi-opts button').length === 4);
  ok('Eingabefeld weicht der Auswahl', root.querySelector('.wi-type').hidden === true);
  ok('Rückmeldung „fast"', /Fast/.test(root.querySelector('.wi-fb').textContent));

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

  /* Serie → freie Wahl */
  reply({ ok: true, result: 'correct', streak: 3, picks: 1, tile: null,
          task: { prompt: 'das Buch', dir: 'de_en', stage: 'type', options: [] } });
  root.querySelector('.wi-in').value = 'school';
  root.querySelector('.wi-type').dispatchEvent(new document.defaultView.Event('submit'));
  await wait(40);
  ok('Aufforderung zur freien Wahl', !root.querySelector('.wi-pickbar').hidden);
  ok('Karte ist scharf', root.querySelector('.wi-map').classList.contains('is-picking'));

  const target = root.querySelectorAll('.wi-cell')[1];
  click(target, document);
  await wait(40);
  const pick = calls.find(([fn]) => fn === 'wi_pick_tile');
  ok('freie Wahl schickt r/c', !!pick && pick[1].p_r === 0 && pick[1].p_c === 1,
     JSON.stringify(pick && pick[1]));

  /* Falsch → Lösung und Sperre */
  reply({ ok: true, result: 'wrong', streak: 0, picks: 0, solution: 'book',
          locked_for: 2, task: { prompt: 'das Heft', dir: 'de_en', stage: 'type', options: [] } });
  root.querySelector('.wi-in').value = 'blubb';
  root.querySelector('.wi-type').dispatchEvent(new document.defaultView.Event('submit'));
  await wait(40);
  ok('Lösung wird gezeigt', /book/.test(root.querySelector('.wi-fb').textContent));
  ok('Eingabe gesperrt', root.querySelector('.wi-in').disabled === true);

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
        }));
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

  /* Üben, bis es losgeht */
  click(root.querySelector('[data-part="practice"]'), document);
  await wait(20);
  ok('Üben öffnet die Aufgabe', root.querySelector('[data-part="tplay"]').hidden === false);
  ok('Übungsrunde steht im Kopf', /Übungsrunde/.test(root.querySelector('.wi-me').textContent));
  ok('keine Karte beim Üben', root.querySelector('[data-part="mapwrap"]').hidden === true);
  click(root.querySelector('[data-part="back"]'), document);
  await wait(20);
  ok('Zurück zur Aufstellung', root.querySelector('[data-part="tlobby"]').hidden === false);

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
  const ctx = Object.assign({}, ctxBase, {
    role: 'participant',
    actions: {
      role: 'participant',
      call: (fn, args) => fn === 'wi_view'
        ? Promise.resolve(viewFor({ map: args.p_full ? BIG : null, own }))
        : Promise.resolve({ ok: false, error: 'not_allowed' })
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

/* Die echten Maße aus dem PNG-Kopf (IHDR steht immer bei Byte 16). */
function pngMasse(datei) {
  const b = fs.readFileSync(datei);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function machKontext(c) {
  return {
    canvas: c,
    filter: 'none', fillStyle: '#000', globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000', lineWidth: 1,
    drawImage() {}, fillRect() {}, clearRect() {},
    save() {}, restore() {}, translate() {}, scale() {}, setTransform() {},
    putImageData() {},
    /* Ab der Verwandlung auf der Übungskarte kommen Pfade dazu:
       Bodenschatten, Ring und die aufspringende Eischale zeichnen
       nicht mehr nur Bilder. Fehlt einer dieser Stummel, fällt die
       Zeichenschleife mit einem TypeError aus — und der sieht dann
       aus, als sei die Karte leer. */
    rotate() {}, beginPath() {}, closePath() {}, clip() {},
    rect() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {},
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
      e.getContext = () => machKontext(e);
      /* Seit 10.09.2026 backt das Werkzeug das kleine Monster der
         Vokabelliste als data:-URL ein (monsterUrl). Ohne diesen
         Stummel wirft die Zeile — und die Unit-Übersicht bliebe
         leer, ohne dass irgendwo ein Fehler stünde. */
      e.toDataURL = () => 'data:image/png;base64,00';
    }
    return e;
  };

  env.fehlendeBilder = [];
  class FakeImage {
    constructor() { this.width = 1; this.height = 1; }
    set src(v) {
      this._src = v;
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
   trägt. */
function soloView(n, stufen, ohneUnits) {
  const words = [];
  for (let i = 0; i < n; i++) {
    const w = { i: 'w-' + i, s: stufen ? stufen(i) : 0 };
    // `u` seit Migration 0142 — die Unit am Wort. `ohneUnits`
    // spielt die ältere Datenbank nach.
    if (!ohneUnits) w.u = i % 2 ? 'set-b' : 'set-a';
    words.push(w);
  }
  return {
    ok: true,
    learner: {
      token: 'tok', seed: 4711, settings: {},
      words: n, grown: words.filter(w => w.s >= 3).length,
      sets: [{ id: 'set-a', title: 'Unit 1', count: Math.ceil(n / 2) },
             { id: 'set-b', title: 'Unit 2', count: Math.floor(n / 2) }]
    },
    words_list: words,
    due: 0
  };
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

/* Einen Punkt suchen, an dem wirklich ein Tier steht. Wo sie
   herumlaufen, weiß nur die Zeichenschleife — also wird das Feld
   abgesucht. Weil zwischen zwei synchronen Tipps kein Bild
   dazwischenkommt, steht die Herde dabei still. */
function tippeAufTier(root, document, schritt = 34) {
  const stage = root.querySelector('[data-part="stage"]');
  const karte = root.querySelector('[data-part="card"]');
  for (let y = 20; y < RECT.height; y += schritt) {
    for (let x = 20; x < RECT.width; x += schritt) {
      zeig(stage, document, 'pointerdown', x, y);
      zeig(stage, document, 'pointerup', x, y);
      if (!karte.hidden) return { x, y };
    }
  }
  return null;
}

// Die Felder der gebauten Insel als Menge „r,c" — für die Frage,
// ob eine wachsende Insel wirklich nur DAZU bekommt.
const felderVon = root => new Set(
  [...root.querySelectorAll('.wi-cell')].map(e => e.dataset.r + ',' + e.dataset.c));

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
    c.getContext = () => machKontext(c);
  }

  // Bilder laden (setTimeout 0 je Bild), einfärben, Insel bauen.
  for (let i = 0; i < 12; i++) await wait(20);
  return { env, tool, root, calls, ctx, document: env.document };
}

async function testSolo() {
  console.log('\n— Meine Insel —');
  const { env, tool, root, calls } = await mountSolo(soloView(40, i => i % 5));

  ok('die neun Tierbilder liegen wirklich da',
     env.fehlendeBilder.length === 0, env.fehlendeBilder.join(', '));
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

  /* Seit 10.09.2026 steht die Wortzahl im Kopf der Unit-Leiste und
     nicht mehr unten: „Units (40)". Unten sind nur noch die zwei
     Knöpfe. */
  ok('die Wortzahl steht im Kopf der Unit-Leiste',
     root.querySelector('[data-part="swords"]').textContent === '(40)',
     root.querySelector('[data-part="swords"]').textContent);
  ok('die untere Leiste trägt keine Zahlen mehr',
     !root.querySelector('.wi-sbar .wi-lg') &&
     !root.querySelector('.wi-sbar [data-part="swords"]'));
  /* Sie ist ein KASTEN unten rechts und kein Balken über die ganze
     Breite: der Abstandhalter, der die Knöpfe ans rechte Ende schob,
     wäre in einem Kasten eine unsichtbare Sperre gegen die eigene
     Breite. Er ist weg und darf nicht zurückkommen — sonst steht der
     Kasten wieder quer über der Unit-Leiste, die bis ganz nach unten
     reicht (Sönke, 10.09.2026). */
  ok('und ist nur so breit wie ihre zwei Knöpfe',
     !root.querySelector('.wi-sspacer') &&
     root.querySelectorAll('.wi-sbar > *').length === 2);
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
  klein.tool.unmount();

  const gross = await mountSolo(soloView(700));
  const grossFelder = felderVon(gross.root);

  ok('mit mehr Wörtern kommt Land dazu', grossFelder.size > kleinZahl,
     `${kleinZahl} → ${grossFelder.size}`);
  /* Der Kern: JEDES Feld von vorher liegt noch da. Kommt hier auch
     nur eines nicht vor, hat sich die Insel umgeformt statt
     gewachsen. */
  const fehlt = [...kleinFelder].filter(k => !grossFelder.has(k));
  ok('und kein einziges altes Feld verschwindet', fehlt.length === 0,
     fehlt.slice(0, 5).join(' · '));
  gross.tool.unmount();

  /* Und derselbe Startwert gibt zweimal dieselbe Insel — sonst
     stünde nach jedem Öffnen eine andere da. */
  const nochmal = await mountSolo(soloView(30));
  const gleich = felderVon(nochmal.root);
  ok('derselbe Startwert, dieselbe Insel',
     gleich.size === kleinZahl && [...kleinFelder].every(k => gleich.has(k)));
  nochmal.tool.unmount();
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
  ok('und das Tier mit seiner Stufe',
     root.querySelector('[data-part="pstage"]').textContent === 'geschlüpft');
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
  ok('die Rückmeldung ebenso',
     !scroller.contains(root.querySelector('[data-part="pfb"]')));
  ok('die Frage aber steht darin — sie klebt oben',
     scroller.contains(root.querySelector('[data-part="pword"]')));

  const eingabe = root.querySelector('[data-part="pin"]');
  eingabe.value = 'hauz';
  root.querySelector('[data-part="pform"]')
      .dispatchEvent(new document.defaultView.Event('submit', { bubbles: true }));
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
     root.querySelector('[data-part="pstage"]').textContent === 'gewachsen');

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
     root.querySelector('[data-part="pin"]').disabled === true &&
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
     root.querySelector('[data-part="pin"]').disabled === false);

  /* Und sie ist DURCHgezeichnet worden. Eischale, Blitz und Funken
     liegen in der Mitte des Verlaufs — wer nur das erste Bild prüft,
     prüft von dieser Feier genau nichts. */
  ok('die Verwandlung läuft ohne Fehler durch',
     env.rafFehler.length === 0,
     env.rafFehler.slice(0, 2).map(e => e.message).join(' · '));
  ok('und sie hat viele Bilder gebraucht', env.rafs - rafsVor > 40,
     `${env.rafs - rafsVor} Bilder`);

  /* ── Die Einstellungen ─────────────────────────────────────── */
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
     root.querySelector('[data-part="pstage"]').textContent === 'Eier');

  const fehlerVor = env.rafFehler.length;
  root.querySelector('[data-part="pin"]').value = 'tree';
  root.querySelector('[data-part="pform"]')
      .dispatchEvent(new document.defaultView.Event('submit', { bubbles: true }));

  /* Mitten in den Verlauf hinein: bei rund 700 ms ist die Schale
     gebrochen und die Hälften fliegen. Genau dort steht der Code,
     der sonst nirgends läuft. */
  await wait(700);
  ok('es schlüpft',
     /Geschlüpft/.test(root.querySelector('[data-part="plevelb"]').textContent),
     root.querySelector('[data-part="plevelb"]').textContent);
  ok('die neue Stufe steht schon da',
     root.querySelector('[data-part="pstage"]').textContent === 'geschlüpft');
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

  root.querySelector('[data-part="pin"]').value = 'tree';
  root.querySelector('[data-part="pform"]')
      .dispatchEvent(new document.defaultView.Event('submit', { bubbles: true }));
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
  rueck.root.querySelector('[data-part="pin"]').value = 'daneben';
  rueck.root.querySelector('[data-part="pform"]')
       .dispatchEvent(new rueck.document.defaultView.Event('submit', { bubbles: true }));
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

(async () => {
  await testTablet();
  await testTabletLobby();
  await testNewRound();
  await testRelief();
  await testPult();
  await testFehlendeMigration();
  await testOhneMigration();
  await testSolo();
  await testInselWaechst();
  await testSoloUeben();
  await testSchluepfen();
  await testStats();
  await testPunkte();
  await testSoloOhneMigration();
  await testUnitLeiste();
  await testTierTipp();
  await testUnitsOhneMigration();
  await testBlassUndRing();
  console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
  process.exit(fails ? 1 : 0);
})();
