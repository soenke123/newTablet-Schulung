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

  /* linkedom kennt select.value nur als Getter. Im Browser ist es
     schreibbar, also wird hier die Umgebung nachgerüstet und nicht
     das Werkzeug verbogen — ein Mock, der weniger kann als das
     Original, ist kein Grund, das Original umzubauen. */
  const Sel = window.HTMLSelectElement;
  if (Sel && !(Object.getOwnPropertyDescriptor(Sel.prototype, 'value') || {}).set) {
    Object.defineProperty(Sel.prototype, 'value', {
      configurable: true,
      get() {
        const o = this.querySelector('option[selected]') || this.querySelector('option');
        return o ? (o.getAttribute('value') || o.textContent) : '';
      },
      set(v) {
        for (const o of this.querySelectorAll('option')) {
          if ((o.getAttribute('value') || o.textContent) === String(v)) o.setAttribute('selected', '');
          else o.removeAttribute('selected');
        }
      }
    });
  }

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

  return { window, document, impls, ctxBase };
}

/* ─── Ein erfundener Server ─────────────────────────────────
   Dieselbe Gestalt wie wi_view/wi_room_get in Migration 0131. */
function island(rows, cols) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push([r, c, (r === 1 && c === 2) ? 3 : 0, (r === 0 && c === 0) ? 1 : 0]);
    }
  }
  return cells;
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
    teams: [{ i: 0, tiles: 1, ruins: 0, score: 1, people: 3 },
            { i: 1, tiles: 1, ruins: 0, score: 1, people: 3 }],
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

const wait = ms => new Promise(r => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════
   Tablet
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
  ok('Lichtpunkt gezeichnet', root.querySelectorAll('.wi-ruin').length === 1);
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
  root.querySelectorAll('.wi-opts button')[1].dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }));
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
  target.dispatchEvent(new document.defaultView.Event('click', { bubbles: true }));
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
   Pult
   ═══════════════════════════════════════════════════════════ */
async function testPult() {
  console.log('\n— Pult —');
  const { document, impls, ctxBase } = makeEnv();
  const tool = impls.wordisland;

  const calls = [];
  let phase = 'lobby';
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
        if (fn === 'wi_room_get') {
          return Promise.resolve({
            ok: true, role: 'presenter', phase, mode: 'type', direction: 'mixed',
            team_count: 4, duration: 600, radius: 5, seed: 1,
            teams: [{ i: 0, tiles: 4, ruins: 3, score: 7, people: 3 },
                    { i: 1, tiles: 2, ruins: 0, score: 2, people: 3 }],
            map_key: 'raum:1', map: args.p_full ? MAP : null, own: OWN_START,
            ends_at: new Date(Date.now() + 60000).toISOString(),
            countdown_ends_at: null, winner_team: null, sets: ['s1'],
            people: [{ seat: 1, name: 'Ada', team: 0, correct: 2, wrong: 1 },
                     { seat: 2, name: 'Bo',  team: 1, correct: 0, wrong: 0 }]
          });
        }
        if (fn === 'wi_hard_words') {
          return Promise.resolve({ ok: true, words: [{ term: 'die Tafel', trans: 'board', wrong: 5, seen: 9 }] });
        }
        return Promise.resolve({ ok: true });
      }
    }
  });

  const root = document.getElementById('root');
  tool.mount(root, ctx);
  await wait(60);

  ok('Lobby offen', root.querySelector('[data-part="lobby"]').hidden === false);
  ok('Units als Kacheln', root.querySelectorAll('.wi-set').length === 2,
     `${root.querySelectorAll('.wi-set').length}`);
  ok('gewählte Unit markiert', root.querySelector('.wi-set').classList.contains('is-on'));
  ok('Aufstellung mit Namen', /Ada/.test(root.querySelector('[data-part="people"]').textContent));
  ok('Völkerzahl übernommen', root.querySelector('[data-part="teams"]').value === '4');

  // Reiter „Eigene": andere Liste, Import-Formular geht auf
  root.querySelectorAll('.wi-tab')[1].dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }));
  await wait(20);
  ok('eigene Liste sichtbar', /Unit 3/.test(root.querySelector('[data-part="sets"]').textContent));
  ok('Import-Formular offen', root.querySelector('[data-part="import"]').hidden === false);

  // Start
  root.querySelector('[data-part="start"]').dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }));
  phase = 'running';
  await wait(60);
  ok('Start ging raus', calls.some(([fn]) => fn === 'wi_room_start'));
  ok('Spielfeld offen', root.querySelector('[data-part="play"]').hidden === false);
  ok('Insel am Beamer', root.querySelectorAll('.wi-cell').length === MAP.length);
  ok('Völkerleiste steht', root.querySelectorAll('.wi-team').length === 2);
  ok('Punkte sichtbar', /7/.test(root.querySelector('.wi-score').textContent));

  // Ende
  phase = 'ended';
  await tool.update();
  await wait(80);
  ok('Auswertung offen', root.querySelector('[data-part="end"]').hidden === false);
  ok('schwerste Wörter geholt', calls.some(([fn]) => fn === 'wi_hard_words'));
  ok('schweres Wort steht da', /Tafel/.test(root.querySelector('[data-part="hard"]').textContent));

  tool.unmount();
}

(async () => {
  await testTablet();
  await testNewRound();
  await testPult();
  console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
  process.exit(fails ? 1 : 0);
})();
