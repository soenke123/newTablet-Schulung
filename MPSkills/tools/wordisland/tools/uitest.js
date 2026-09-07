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

  return { window, document, impls, ctxBase };
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
  ok('Lichtpunkt gezeichnet', root.querySelectorAll('.wi-ruin').length === 1);
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
  ok('sechs Wappen', picks.length === 6, `${picks.length}`);
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

(async () => {
  await testTablet();
  await testTabletLobby();
  await testNewRound();
  await testPult();
  await testOhneMigration();
  console.log(fails ? `\n${fails} Fehler.` : '\nfertig, alles grün.');
  process.exit(fails ? 1 : 0);
})();
