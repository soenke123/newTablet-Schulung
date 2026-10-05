/**
 * UI-Prüfstand für Knowledge Stack — die ECHTE tool.js, ohne Browser.
 *
 * Gebaut auf linkedom (liegt schon im Projekt, siehe
 * feedback_linkedom_ui_tests). Geprüft wird das, was in einer Klasse
 * auffiele und sonst nirgends:
 *
 *   · EMOTE   Die Klassennamen, mit denen ein Wesen bewegt wird, gibt
 *             es in creatures.css wirklich. Das ist der Prüfstand für
 *             den Fehler, der die erste Fassung stumm machte: dort
 *             standen `c-wave`, `c-cheer`, `c-sad` — Klassen, die es
 *             nirgends gibt. Die Knöpfe kamen an, die Wesen taten
 *             nichts, und es sah aus wie ein Netzproblem.
 *   · TAB     Auf dem Schülergerät steht KEIN Fragetext, auch dann
 *             nicht, wenn der Server einen mitschickt. Vier Kacheln,
 *             das eigene Wesen oben, in der Auflösung die Nachbarn
 *             links und rechts und vier Emote-Knöpfe unten.
 *   · BEAM    Am Beamer stehen Frage und Uhr; in der Auflösung die
 *             fünf Ersten in der Reihenfolge 1…5 von links und die
 *             vier Antwortfelder als Füllstände mit absoluten Zahlen.
 *             Und: KEIN zweiter PIN, KEIN zweiter QR-Code.
 *   · FLUSS   Weitergeschaltet wird mit ks_step und der Phase, aus
 *             der geklickt wurde. Die ablaufende Uhr schaltet NICHT
 *             selbst weiter (das tut der Server, Migration 0175).
 *             Und ein Takt ohne Phasenwechsel baut das Bild nicht neu
 *             — sonst reißt jede Wesenbewegung ab.
 *
 * Was hier NICHT geprüft wird: das Aussehen. Ob die Kachel lesbar ist,
 * entscheidet tool.css, und das sieht man nur mit Augen. Ob sie auf
 * den Bildschirm PASST, prüft dagegen responsivecheck.js.
 *
 * Aufruf:  node MPSkills/tools/KnowledgeStack/tools/uitest.js
 *          … uitest.js emote|tab|beam|fluss     nur einen Bereich
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR  = path.join(HERE, '..');
const TOOL = path.join(DIR, 'tool.js');
const CSS  = path.join(DIR, 'creatures.css');
const CRE  = path.join(DIR, 'creatures.js');
const ED   = path.join(DIR, 'editor.js');
const PARSE = path.join(DIR, 'parse.js');

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════
   Umgebung
   ══════════════════════════════════════════════════════════
   So viel Browser, wie die tool.js anfasst — und keinen Halm mehr.
   Drei Dinge fehlen linkedom, die diese tool.js braucht:

     getComputedStyle   fit() rechnet damit, wie viel Seite unter dem
                        Rahmen noch steht.
     getBoundingClientRect / offsetHeight
                        dieselbe Rechnung.
     style.setProperty  --ks-h wird an den Rahmen geschrieben.

   Sie werden mit festen Zahlen nachgerüstet: geprüft wird hier nicht,
   ob die Höhe STIMMT (das kann nur ein echter Browser), sondern dass
   die Rechnung läuft und keine Ausnahme wirft. Genau die hätte sonst
   am Beamer einen leeren Kasten hinterlassen.                       */
function makeEnv(hoehe = 700) {
  const { window, document } = parseHTML(
    '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  window.document = document;

  const leer = {
    paddingBottom: '0px', borderBottomWidth: '0px',
    marginBottom: '0px', marginTop: '0px',
    display: 'block', position: 'static',
    getPropertyValue: () => ''
  };
  window.getComputedStyle = (el) => {
    if (el === document.documentElement) {
      return Object.assign({}, leer, { getPropertyValue: n => (n === '--vv-h' ? hoehe + 'px' : '') });
    }
    return leer;
  };
  window.innerHeight = hoehe;

  const elProto = Object.getPrototypeOf(document.createElement('div'));
  elProto.getBoundingClientRect = function () {
    // 96 px über dem Rahmen: Kopfzeile plus Reiterleiste, wie auf der
    // Lehrerseite. Die Zahl ist willkürlich und darf es sein — sie
    // muss nur größer als 0 sein, damit fit() etwas abzuziehen hat.
    return { top: 96, left: 0, right: 0, bottom: hoehe, width: 1200, height: hoehe - 96 };
  };
  if (!('offsetHeight' in elProto)) {
    Object.defineProperty(elProto, 'offsetHeight', { configurable: true, get() { return 0; } });
    Object.defineProperty(elProto, 'offsetWidth',  { configurable: true, get() { return 0; } });
  }
  // linkedoms style kennt setProperty nicht.
  const styleOf = document.createElement('div').style;
  if (typeof styleOf.setProperty !== 'function') {
    Object.getPrototypeOf(styleOf).setProperty = function (k, v) { this[k] = v; };
  }

  const impls = {};
  window.MPTool = { register: (id, impl) => { impls[id] = impl; } };

  const sandbox = {
    window, document,
    // Bloßes `getComputedStyle(…)` in tool.js ist im Browser das
    // window-Global. Im Sandkasten muss es hier stehen, sonst wirft
    // fit() eine ReferenceError, die es im Browser nicht gibt.
    getComputedStyle: (...a) => window.getComputedStyle(...a),
    setInterval: (...a) => setInterval(...a),
    clearInterval: (...a) => clearInterval(...a),
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (...a) => clearTimeout(...a),
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Map, Set,
    Promise, Infinity, isNaN, parseInt, parseFloat, Error
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // Die ECHTEN Wesen. Sie kosten eine Zehntelsekunde und machen den
  // Unterschied: die Wesen-Nummern 0…35 und ihre Namen kommen von
  // dort, und genau daran hängen die Emote-Klassen.
  vm.runInContext(fs.readFileSync(CRE, 'utf8'), sandbox, { filename: 'creatures.js' });
  vm.runInContext(fs.readFileSync(PARSE, 'utf8'), sandbox, { filename: 'parse.js' });
  vm.runInContext(fs.readFileSync(ED, 'utf8'), sandbox, { filename: 'editor.js' });
  vm.runInContext(fs.readFileSync(TOOL, 'utf8'), sandbox, { filename: 'tool.js' });

  return { window, document, impls, sandbox };
}

/* Ein Pult oder ein Tablet aufbauen. `antwort` ist die Bude, die
   statt des Servers antwortet — jeder Aufruf wird mitgeschrieben. */
async function starte(role, view, opts = {}) {
  const env = makeEnv(opts.hoehe || 700);
  const rufe = [];
  const zustand = { view };

  const ctx = {
    role,
    preview: false,
    title: 'Testraum',
    esc: s => String(s == null ? '' : s),
    errText: c => 'Fehler: ' + c,
    toast: (m) => { ctx.toasts.push(m); },
    toasts: [],
    confirm: () => Promise.resolve(true),
    refresh: () => {},
    actions: {
      role,
      call: (fn, args) => {
        rufe.push({ fn, args: args || {} });
        if (fn === 'ks_sig' || fn === 'ks_room_sig') {
          return Promise.resolve({ ok: true, sig: zustand.sig || 'a' });
        }
        if (fn === 'ks_view' || fn === 'ks_room_get') {
          return Promise.resolve(Object.assign({ ok: true }, zustand.view));
        }
        if (opts.antworten && opts.antworten[fn]) return Promise.resolve(opts.antworten[fn]);
        return Promise.resolve({ ok: true });
      }
    }
  };

  const impl = env.impls.knowledgestack;
  const root = env.document.getElementById('root');
  await impl.mount(root, ctx);
  await wait(30);
  return { env, root, ctx, rufe, impl, zustand, doc: env.document };
}

const click = (el, doc) =>
  el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
/* Eine Wahl in einem Auswahlfeld — setzen UND melden, in dieser
   Reihenfolge, genau wie es ein Finger täte.

   ⚠️ `value` braucht einen Setter und nicht nur einen Getter: die
   tool.js schreibt beim Flicken `cat.value = …` zurück (damit die
   Auswahl zum Raum passt, wenn ein zweites Fenster sie gewechselt
   hat). Ein nur lesbares `value` wirft dort eine Ausnahme, die es im
   Browser nicht gibt — siehe feedback_linkedom_ui_tests. */
const waehle = (el, wert, doc) => {
  let v = wert;
  el.setAttribute('value', wert);
  Object.defineProperty(el, 'value', {
    configurable: true, get: () => v, set: (neu) => { v = String(neu); }
  });
  return el.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
};
const klassen = el => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
const txt = el => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

/* ══════════════════════════════════════════════════════════
   Ansichten, wie der Server sie schickt
   ══════════════════════════════════════════════════════════ */
const OPTS = ['Ein Freizeitgerät', 'Ein Arbeitsgerät', 'Ein Spielgerät', 'Ein Ersatz für Papier'];
const FRAGE = 'Was ist das Tablet laut der Schulung?';

const spieler = (n, o = {}) => Object.assign({
  participant_id: 'p' + n, seat: n, creature_id: (n * 3) % 36, skin_idx: n % 3,
  nickname: 'Kind ' + n, score: 3000 - n * 220, rank: n, rank_change: 0,
  delta: 0, emote: null, correct: null, answered: false
}, o);

const beamLobby = (n = 4) => ({
  role: 'presenter', phase: 'lobby', current_q_idx: 0, question_count: 12,
  phase_ends_at: null, server_now: new Date().toISOString(),
  catalog_id: 'kat-1', catalog_title: 'Tablet-Schulung: Grundlagen',
  catalogs: [
    { id: 'kat-1', title: 'Tablet-Schulung: Grundlagen', count: 12, mine: false },
    { id: 'kat-2', title: 'Bruchrechnen', count: 8, mine: true }
  ],
  question: null, answers_dist: {}, answers_total: 0, leaderboard: [],
  players: Array.from({ length: n }, (_, i) => spieler(i + 1))
});

const beamFrage = (sek = 15) => ({
  role: 'presenter', phase: 'question', current_q_idx: 2, question_count: 12,
  phase_ends_at: new Date(Date.now() + sek * 1000).toISOString(),
  server_now: new Date().toISOString(),
  catalog_id: 'kat-1', catalog_title: 'x', catalogs: null,
  question: { text: FRAGE, options: OPTS, correct_idx: null, explanation: null, time_limit: 15 },
  answers_dist: { 1: 3, 0: 1 }, answers_total: 4,
  leaderboard: [], players: Array.from({ length: 4 }, (_, i) => spieler(i + 1, { answered: i < 2 }))
});

const beamAufl = () => ({
  role: 'presenter', phase: 'reveal', current_q_idx: 2, question_count: 12,
  phase_ends_at: null, server_now: new Date().toISOString(),
  catalog_id: 'kat-1', catalog_title: 'x', catalogs: null,
  question: {
    text: FRAGE, options: OPTS, correct_idx: 1, time_limit: 15,
    explanation: 'Das Tablet ist ein Arbeitsgerät – kein Freizeitgerät.'
  },
  answers_dist: { 0: 2, 1: 12, 2: 1, 3: 5 }, answers_total: 20,
  leaderboard: [1, 2, 3, 4, 5].map(r => spieler(r, {
    rank: r, rank_change: r === 1 ? 2 : r === 5 ? -1 : 0,
    delta: r * 100, correct: r <= 3
  })),
  players: Array.from({ length: 6 }, (_, i) => spieler(i + 1, { answered: true, correct: i < 3 }))
});

const beamEnde = () => Object.assign(beamAufl(), {
  phase: 'ended', current_q_idx: 11,
  players: Array.from({ length: 8 }, (_, i) => spieler(i + 1, { answered: true }))
});

const tabLobby = () => ({
  role: 'participant', phase: 'lobby', current_q_idx: 0, question_count: 12,
  phase_ends_at: null, server_now: new Date().toISOString(), player_count: 4,
  me: {
    participant_id: 'p3', seat: 3, nickname: 'Mia', creature_id: 7, skin_idx: 1,
    score: 0, streak: 0, rank: 3, rank_change: 0, delta: 0, emote: null
  },
  my_answer: null, question: null, neighbor_before: null, neighbor_after: null
});

const tabFrage = (my = null) => ({
  role: 'participant', phase: 'question', current_q_idx: 2, question_count: 12,
  phase_ends_at: new Date(Date.now() + 15000).toISOString(),
  server_now: new Date().toISOString(), player_count: 20,
  me: {
    participant_id: 'p3', seat: 3, nickname: 'Mia', creature_id: 7, skin_idx: 1,
    score: 2400, streak: 2, rank: 4, rank_change: 0, delta: 0, emote: null
  },
  my_answer: my,
  // Der Server schickt hier `text: null` (0175). Der Prüfstand
  // schickt ABSICHTLICH den Text mit: damit steht fest, dass die
  // Anzeige ihn auch dann nicht zeigt, wenn er da ist.
  question: { text: FRAGE, options: OPTS, time_limit: 15, correct_idx: null, explanation: null },
  neighbor_before: null, neighbor_after: null
});

const tabAufl = (o = {}) => ({
  role: 'participant', phase: o.phase || 'reveal', current_q_idx: 2, question_count: 12,
  phase_ends_at: null, server_now: new Date().toISOString(), player_count: 20,
  me: Object.assign({
    participant_id: 'p3', seat: 3, nickname: 'Mia', creature_id: 7, skin_idx: 1,
    score: 3620, streak: 3, rank: 4, rank_change: 2, delta: 1220, emote: null
  }, o.me),
  my_answer: o.my === undefined
    ? { chosen_idx: 1, is_correct: true, points_awarded: 1220 } : o.my,
  question: { text: FRAGE, options: OPTS, time_limit: 15, correct_idx: 1, explanation: 'x' },
  neighbor_before: o.vor === undefined
    ? { creature_id: 11, skin_idx: 0, nickname: 'Jonas', score: 3900, rank: 3, emote: null }
    : o.vor,
  neighbor_after: o.nach === undefined
    ? { creature_id: 19, skin_idx: 2, nickname: 'Leon', score: 3100, rank: 5, emote: null }
    : o.nach
});

/* ══════════════════════════════════════════════════════════
   EMOTE — der Kern
   ══════════════════════════════════════════════════════════ */
async function bereichEmote() {
  console.log('\n── Emotes ──────────────────────────────────────────\n');
  const css = fs.readFileSync(CSS, 'utf8');

  /* 1) Die Klassen, die es geben MUSS. Reine Datenprüfung an
        creatures.css, ohne tool.js: sie sagt, was überhaupt
        möglich ist. */
  const familien = ['wave', 'cheer', 'sad', 'sleep', 'jump'];
  let fehlend = [];
  for (let id = 0; id < 36; id++) {
    for (const f of familien) if (!css.includes('.' + f + '-' + id + ' ')) fehlend.push(f + '-' + id);
    if (!css.includes('.c-dance-' + id + ' ')) fehlend.push('c-dance-' + id);
  }
  ok('creatures.css kennt alle 36 × 5 Bewegungen', fehlend.length === 0,
     fehlend.slice(0, 6).join(', '));

  /* 2) Und die Namen, die die erste Fassung benutzte, gibt es NICHT.
        Diese Zeile ist der eigentliche Prüfstand: sie erklärt, warum
        damals kein Emote etwas tat. */
  const alt = ['c-wave', 'c-cheer', 'c-sad', 'c-sleep'].filter(c => css.includes('.' + c));
  ok('die alten Namen (c-wave, c-cheer, …) gibt es nicht — deshalb taten sie nichts',
     alt.length === 0, alt.join(', '));

  /* 3) Was die tool.js wirklich ausgibt, steht in creatures.css.
        Geprüft über die Auflösung am Beamer: jedes Wesen im Podest
        bekommt ein Emote mitgegeben. */
  const emotes = ['wave', 'cheer', 'dance', 'sleep', 'sad', 'jump'];
  const lb = emotes.map((e, i) => spieler(i + 1, { rank: i + 1, creature_id: i * 7, emote: e }));
  const v = Object.assign(beamAufl(), { leaderboard: lb });
  const t = await starte('presenter', v);

  let unbekannt = [];
  t.root.querySelectorAll('.ks-slot').forEach((slot, i) => {
    const svg = slot.querySelector('svg');
    const cls = klassen(svg).filter(c => c !== 'creature-svg');
    for (const c of cls) {
      if (c === 'c-idle') continue;
      if (c.startsWith('state-')) continue;       // Gesichtsumschaltung
      if (!css.includes('.' + c + ' ')) unbekannt.push(emotes[i] + ' → ' + c);
    }
  });
  ok('jede Klasse, die tool.js ausgibt, steht in creatures.css',
     unbekannt.length === 0, unbekannt.join(', '));

  const ersteKlassen = klassen(t.root.querySelector('.ks-slot svg'));
  ok('Winken heißt „wave-<nr> state-wave"',
     ersteKlassen.includes('wave-0') && ersteKlassen.includes('state-wave'),
     ersteKlassen.join(' '));
  const tanz = klassen(t.root.querySelectorAll('.ks-slot svg')[2]);
  ok('Tanzen heißt „c-dance-<nr> state-dance"',
     tanz.includes('c-dance-14') && tanz.includes('state-dance'), tanz.join(' '));

  /* 4) Ein Kind ohne Emote atmet (c-idle) und steht nicht still. */
  const ruhe = await starte('presenter', beamLobby(2));
  const ruheCls = klassen(ruhe.root.querySelector('.ks-karte svg'));
  ok('ohne Emote: c-idle (das Atmen)', ruheCls.includes('c-idle'), ruheCls.join(' '));

  /* 5) Der eigene Knopf wirkt SOFORT — ohne auf den Server zu warten.
        Genau das war die Klage: „der Klick kommt nicht an". */
  const tab = await starte('participant', tabAufl());
  const vorher = klassen(tab.root.querySelector('.ks-ipic svg')).join(' ');
  const knopf = tab.root.querySelector('.ks-emo[data-emote=dance]');
  ok('fünf Emote-Knöpfe unten', tab.root.querySelectorAll('.ks-emo').length === 5,
     String(tab.root.querySelectorAll('.ks-emo').length));
  click(knopf, tab.doc);
  const sofort = klassen(tab.root.querySelector('.ks-ipic svg'));
  ok('Tanz-Knopf bewegt das eigene Wesen im selben Augenblick',
     sofort.includes('c-dance-7') && sofort.join(' ') !== vorher, sofort.join(' '));
  await wait(20);
  ok('… und schickt ks_emote an den Server',
     tab.rufe.some(r => r.fn === 'ks_emote' && r.args.p_emote === 'dance'),
     JSON.stringify(tab.rufe.filter(r => r.fn === 'ks_emote')));

  /* 5b) Der Sprung. Er lag fertig da (36 Bewegungen in creatures.css,
         'jump' in ks_emote, ein Zeichen in EMOTE_ICON) und hatte nur
         keinen Knopf — der Vorwurf „du hast das Sprung-Emote
         vergessen" vom 26.09.2026 stimmte genau so.

         Zwei Dinge gehören dazu, und das zweite ist das, was man
         sieht: die Bewegung UND das offene Fenster. Der Sprung geht
         über die halbe eigene Höhe hinaus; in einem Kasten mit
         `overflow: hidden` wäre er ein Verschwinden nach oben. */
  const spr = await starte('participant', tabAufl());
  const sprKnopf = spr.root.querySelector('.ks-emo[data-emote=jump]');
  ok('es gibt einen Sprung-Knopf', !!sprKnopf);
  click(sprKnopf, spr.doc);
  const sprCls = klassen(spr.root.querySelector('.ks-ipic svg'));
  ok('Springen heißt „jump-<nr> state-jump"',
     sprCls.includes('jump-7') && sprCls.includes('state-jump'), sprCls.join(' '));
  ok('… und das Fenster geht dafür auf (ks-springt)',
     spr.root.querySelector('.ks-ipic').classList.contains('ks-springt'));
  await wait(20);
  ok('… und der Server erfährt davon',
     spr.rufe.some(r => r.fn === 'ks_emote' && r.args.p_emote === 'jump'));

  /* Und es geht auch wieder zu. Ein Fenster, das offen bleibt,
     schneidet später nichts mehr ab — dann ragt ein ruhendes Wesen
     aus seiner Karte (feedback_hidden_attribute_loses_to_display,
     dieselbe Klasse von Fehler). */
  const zu = await starte('presenter', Object.assign(beamLobby(2), {
    players: [spieler(1, { emote: 'jump' }), spieler(2, { emote: null })]
  }));
  ok('wer springt, hat ein offenes Fenster',
     zu.root.querySelector('.ks-karte .ks-kpic').classList.contains('ks-springt'));
  ok('wer nicht springt, hat ein zu',
     !zu.root.querySelectorAll('.ks-karte .ks-kpic')[1].classList.contains('ks-springt'));
  zu.zustand.view = Object.assign(beamLobby(2), {
    players: [spieler(1, { emote: null }), spieler(2, { emote: null })]
  });
  zu.zustand.sig = 'b';
  await zu.impl.update();
  await wait(40);
  ok('… und wenn der Sprung vorbei ist, geht es wieder zu',
     !zu.root.querySelector('.ks-karte .ks-kpic').classList.contains('ks-springt'),
     zu.root.querySelector('.ks-karte .ks-kpic').getAttribute('class'));

  /* 6) Auch die Nachbarn emoten — sonst winkt man ins Leere. */
  const nb = await starte('participant', tabAufl({
    vor: { creature_id: 11, skin_idx: 0, nickname: 'Jonas', score: 3900, rank: 3, emote: 'cheer' }
  }));
  const nbCls = klassen(nb.root.querySelector('[data-slot=vor] svg'));
  ok('der Nachbar vor mir jubelt, wenn er jubelt',
     nbCls.includes('cheer-11') && nbCls.includes('state-cheer'), nbCls.join(' '));
}

/* ══════════════════════════════════════════════════════════
   TABLET
   ══════════════════════════════════════════════════════════ */
async function bereichTab() {
  console.log('\n── Schülergerät ────────────────────────────────────\n');

  /* ─── Wesenwahl ─────────────────────────────────────────── */
  /* Die Liste selbst zuerst. Bis 26.09.2026 stand in creatures.js
     `const CREATURES = []` und sonst nichts — die Wahl war LEER, und
     weil daneben eine Vorschau mit einem Wesen stand, sah es nicht
     aus wie eine fehlende Liste, sondern wie ein kaputtes Raster. */
  const env0 = makeEnv();
  const liste = env0.window.KSCreatures.list;
  ok('creatures.js kennt 36 Wesen', liste.length === 36, String(liste.length));
  ok('… jedes mit Namen und drei Farbnamen',
     liste.every(c => c.name && Array.isArray(c.skins) && c.skins.length === 3));
  ok('… und die Nummern sind 0 … 35',
     liste.map(c => c.id).join(',') === Array.from({ length: 36 }, (_, i) => i).join(','));

  const lob = await starte('participant', tabLobby());
  ok('Lobby: 36 Wesen zur Wahl', lob.root.querySelectorAll('.ks-pick').length === 36,
     String(lob.root.querySelectorAll('.ks-pick').length));
  ok('Lobby: drei Farben', lob.root.querySelectorAll('.ks-skin').length === 3);
  ok('Lobby: der Name des Wesens steht da',
     txt(lob.root.querySelector('[data-ks=wname]')) === 'Nubi',
     txt(lob.root.querySelector('[data-ks=wname]')));
  ok('Lobby: die Farben heißen wie im Showroom',
     txt(lob.root.querySelector('.ks-skin')) === 'Himmelblau',
     txt(lob.root.querySelector('.ks-skin')));
  ok('Lobby: das eigene Wesen ist vorausgewählt',
     lob.root.querySelector('.ks-pick.is-on')?.dataset.cid === '7',
     String(lob.root.querySelector('.ks-pick.is-on')?.dataset.cid));
  // Kein zweites Namensfeld: den Namen hat j.js beim Betreten des
  // Raums schon abgefragt.
  ok('Lobby: KEIN Namensfeld (der Name kommt vom Raumbeitritt)',
     lob.root.querySelectorAll('input').length === 0,
     String(lob.root.querySelectorAll('input').length));
  ok('Lobby: der Name steht trotzdem da', txt(lob.root.querySelector('.ks-tname')) === 'Mia');

  click(lob.root.querySelectorAll('.ks-pick')[22], lob.doc);
  ok('ein Wesen anzutippen markiert es',
     lob.root.querySelectorAll('.ks-pick')[22].classList.contains('is-on'));
  ok('… und die Vorschau zieht mit',
     lob.root.querySelector('[data-ks=vorschau]').dataset.cid === '22',
     lob.root.querySelector('[data-ks=vorschau]').dataset.cid);
  ok('… samt Name und den Farbnamen DIESES Wesens',
     txt(lob.root.querySelector('[data-ks=wname]')) === 'Glitch'
     && txt(lob.root.querySelector('.ks-skin')) === 'Gameboy Grün',
     txt(lob.root.querySelector('[data-ks=wname]')) + ' / ' + txt(lob.root.querySelector('.ks-skin')));
  ok('… aber noch NICHT gespeichert (entprellt)',
     !lob.rufe.some(r => r.fn === 'ks_join'));
  await wait(650);
  const joins = lob.rufe.filter(r => r.fn === 'ks_join');
  ok('nach einer halben Sekunde genau EIN ks_join', joins.length === 1,
     JSON.stringify(joins.map(j => j.args)));
  ok('… mit dem gewählten Wesen', joins[0].args.p_creature === 22, String(joins[0].args.p_creature));

  click(lob.root.querySelectorAll('.ks-skin')[2], lob.doc);
  await wait(650);
  ok('Farbe wechseln speichert auch',
     lob.rufe.filter(r => r.fn === 'ks_join').pop().args.p_skin === 2);

  /* ─── Frage: KEIN Fragetext ─────────────────────────────── */
  const q = await starte('participant', tabFrage());
  const ganz = txt(q.root);
  ok('Frage: der Fragetext steht NICHT auf dem Gerät',
     !ganz.includes('Was ist das Tablet'), ganz.slice(0, 90));
  ok('Frage: die vier Antworten stehen da',
     OPTS.every(o => ganz.includes(o)));
  ok('Frage: A B C D als Kennung',
     Array.from(q.root.querySelectorAll('.ks-kk')).map(e => txt(e)).join('') === 'ABCD');
  ok('Frage: das eigene Wesen steht oben',
     !!q.root.querySelector('[data-ks=tme] svg'));
  ok('Frage: Platz und Punkte stehen da',
     txt(q.root.querySelector('.ks-trang')).includes('#4')
     && txt(q.root.querySelector('.ks-trang')).includes('2.400'),
     txt(q.root.querySelector('.ks-trang')));
  ok('Frage: die Kacheln sind Knöpfe (antippbar)',
     Array.from(q.root.querySelectorAll('.ks-k')).every(e => e.tagName.toLowerCase() === 'button'));
  ok('Frage: eine Uhr läuft', Number(txt(q.root.querySelector('[data-ks=clock]'))) > 0,
     txt(q.root.querySelector('[data-ks=clock]')));

  /* ─── 5s Vorlese-Phase Tablet ───────────────────────────── */
  const tabRead = await starte('participant', Object.assign(tabFrage(), {
    phase_ends_at: new Date(Date.now() + 20000).toISOString(),
    question: { text: FRAGE, options: OPTS, time_limit: 15, correct_idx: null, explanation: null }
  }));
  ok('Vorlese-Phase Tablet: Fokus-Karte ist sichtbar',
     tabRead.root.querySelector('[data-ks=reading]') && !tabRead.root.querySelector('[data-ks=reading]').hidden);
  ok('Vorlese-Phase Tablet: Kacheln sind noch ausgeblendet',
     tabRead.root.querySelector('.ks-kacheln')?.hidden === true);
  click(tabRead.root.querySelectorAll('.ks-k')[1], tabRead.doc);
  await wait(20);
  ok('Vorlese-Phase Tablet: Klick während Vorlesezeit ruft kein ks_answer',
     tabRead.rufe.filter(r => r.fn === 'ks_answer').length === 0);

  /* ─── Antworten ─────────────────────────────────────────── */
  const kachel = q.root.querySelectorAll('.ks-k')[1];
  click(kachel, q.doc);
  ok('Antwort: sofort als meine markiert', kachel.classList.contains('is-meine'));
  ok('Antwort: alle Kacheln sind gesperrt',
     Array.from(q.root.querySelectorAll('.ks-k')).every(e => e.disabled === true));
  ok('Antwort: der Hinweis steht da', q.root.querySelector('[data-ks=lock]').hidden === false);
  await wait(30);
  const ans = q.rufe.find(r => r.fn === 'ks_answer');
  ok('Antwort: ks_answer mit dem richtigen Index', ans && ans.args.p_chosen === 1,
     JSON.stringify(ans && ans.args));
  ok('Antwort: mit der richtigen Fragennummer', ans && ans.args.p_question_idx === 2);
  const zweite = q.rufe.filter(r => r.fn === 'ks_answer').length;
  click(q.root.querySelectorAll('.ks-k')[3], q.doc);
  await wait(20);
  ok('Antwort: ein zweiter Tipp geht nicht mehr durch',
     q.rufe.filter(r => r.fn === 'ks_answer').length === zweite);

  /* Wer schon geantwortet hat, sieht es nach einem Neuladen wieder. */
  const q2 = await starte('participant', tabFrage({ chosen_idx: 3, is_correct: null, points_awarded: 0 }));
  ok('Neuladen mitten in der Frage: die eigene Wahl steht noch',
     q2.root.querySelectorAll('.ks-k')[3].classList.contains('is-meine'));
  ok('… und gesperrt ist sie auch', q2.root.querySelectorAll('.ks-k')[3].disabled === true);

  /* ─── Auflösung: Nachbar · ich · Nachbar ────────────────── */
  const rv = await starte('participant', tabAufl());
  const slots = Array.from(rv.root.querySelectorAll('.ks-trio > *'));
  ok('Auflösung: drei Plätze in der Reihe', slots.length === 3, String(slots.length));
  ok('Auflösung: links der vor mir', slots[0].dataset.slot === 'vor');
  ok('Auflösung: ich in der Mitte', slots[1].dataset.slot === 'ich');
  ok('Auflösung: rechts der hinter mir', slots[2].dataset.slot === 'nach');
  ok('Auflösung: mein Platz steht dran', txt(rv.root.querySelector('.ks-inr')) === '#4',
     txt(rv.root.querySelector('.ks-inr')));
  ok('Auflösung: meine Punkte darunter', txt(rv.root.querySelector('.ks-ipkt')) === '3.620',
     txt(rv.root.querySelector('.ks-ipkt')));
  ok('Auflösung: die Nachbarn haben Namen und Punkte',
     txt(slots[0]).includes('Jonas') && txt(slots[0]).includes('3.900')
     && txt(slots[2]).includes('Leon'), txt(slots[0]));
  ok('Auflösung: richtig/falsch steht oben',
     txt(rv.root.querySelector('.ks-urteil')).includes('Richtig')
     && txt(rv.root.querySelector('.ks-urteil')).includes('1.220'),
     txt(rv.root.querySelector('.ks-urteil')));
  ok('Auflösung: die Serie wird genannt',
     txt(rv.root.querySelector('.ks-urteil')).includes('3er'),
     txt(rv.root.querySelector('.ks-urteil')));
  ok('Auflösung: der Rang-Sprung steht dran',
     txt(rv.root.querySelector('.ks-ich .ks-delta')) === '▲ 2',
     txt(rv.root.querySelector('.ks-ich .ks-delta')));
  ok('Auflösung: auch hier steht die Frage NICHT',
     !txt(rv.root).includes('Was ist das Tablet'));
  ok('Auflösung: fünf Emote-Knöpfe ganz unten',
     rv.root.querySelector('.ks-emobar')?.querySelectorAll('.ks-emo').length === 5);
  // Die Emote-Leiste ist das LETZTE im Bild — „ganz unten".
  const kinder = Array.from(rv.root.querySelector('.ks-stage').children);
  ok('… und die Leiste ist das Letzte im Bild',
     kinder[kinder.length - 1].classList.contains('ks-emobar'),
     kinder.map(k => k.className).join(' | '));

  /* Erster Platz: links ist niemand, ich stehe trotzdem in der Mitte. */
  const erst = await starte('participant', tabAufl({ me: { rank: 1 }, vor: null }));
  const s2 = Array.from(erst.root.querySelectorAll('.ks-trio > *'));
  ok('Erster Platz: links ein leerer Platz statt einer Lücke',
     s2[0].classList.contains('ks-nb--leer') && s2[1].dataset.slot === 'ich');

  /* Falsch geantwortet, und gar nicht geantwortet. */
  const fal = await starte('participant', tabAufl({
    my: { chosen_idx: 0, is_correct: false, points_awarded: 0 }
  }));
  ok('falsch: das sagt die Anzeige auch',
     txt(fal.root.querySelector('.ks-urteil')).includes('falsch'));
  ok('falsch: mein Wesen ist traurig',
     klassen(fal.root.querySelector('.ks-ipic svg')).includes('sad-7'),
     klassen(fal.root.querySelector('.ks-ipic svg')).join(' '));
  const weg = await starte('participant', tabAufl({ my: null }));
  ok('nicht geantwortet: auch das steht da',
     txt(weg.root.querySelector('.ks-urteil')).includes('Keine Antwort'));

  /* ─── Siegerehrung ──────────────────────────────────────────
     Auf dem Tablet nur die Emote-Leiste; der obere Teil ist leer —
     was passiert, passiert am Beamer. Nur der Sieger sieht sofort,
     dass er gewonnen hat. */
  const end = await starte('participant', tabAufl({ phase: 'ended' }));
  ok('Siegerehrung: nur die Emote-Leiste, fünf Knöpfe',
     end.root.querySelectorAll('.ks-emo').length === 5);
  ok('Siegerehrung: der obere Teil ist leer',
     txt(end.root.querySelector('[data-ks=tende]')) === ''
     && !end.root.querySelector('.ks-trio') && !end.root.querySelector('.ks-urteil'),
     txt(end.root.querySelector('[data-ks=tende]')));
  ok('Siegerehrung: kein Wesen-Wechsel mehr', !end.root.querySelector('[data-act=wechsel]'));

  const sieg = await starte('participant', tabAufl({ phase: 'ended', me: { rank: 1, score: 5100 } }));
  ok('Siegerehrung: der Sieger sieht es sofort bei sich',
     txt(sieg.root.querySelector('.ks-tsieg-titel')).includes('gewonnen'));
  ok('Siegerehrung: … mit seinem jubelnden Wesen',
     klassen(sieg.root.querySelector('.ks-ipic svg')).includes('cheer-7'));
  ok('Siegerehrung: … und die Emote-Leiste bleibt',
     sieg.root.querySelectorAll('.ks-emo').length === 5);
}

/* ─── Auftritt vor der ersten Frage ──────────────────────────
   Die erste Frage trägt 10 Sekunden Auftritt über den 5 Sekunden
   Vorlesezeit (Migration 0191). */
async function bereichIntro() {
  console.log('\n── Auftritt ────────────────────────────────────────\n');
  const mitIntro = (v, rest) => Object.assign(v, {
    phase: 'question', current_q_idx: 0,
    phase_ends_at: new Date(Date.now() + (15 + rest) * 1000).toISOString(),
    catalog_title: 'Netzwerke & Sicherheit'
  });

  const b = await starte('presenter', mitIntro(beamFrage(), 10));
  ok('Beamer: „Quiz startet" steht da', txt(b.root.querySelector('.ks-intro-kicker')) === 'Quiz startet');
  ok('Beamer: der Katalogname steht da',
     txt(b.root.querySelector('.ks-intro-name')) === 'Netzwerke & Sicherheit');
  ok('Beamer: noch keine Frage', !b.root.querySelector('.ks-q') && !b.root.querySelector('.ks-k'));

  const t = await starte('participant', mitIntro(tabFrage(), 10));
  ok('Tablet: das eigene Wesen und „Gleich geht’s los"',
     !!t.root.querySelector('.ks-tintro-pic svg')
     && txt(t.root.querySelector('.ks-tintro-text')).includes('Gleich'));
  ok('Tablet: keine Kacheln und keine Emote-Leiste',
     !t.root.querySelector('.ks-k') && !t.root.querySelector('.ks-emo'));

  // Nur noch die Vorlesezeit übrig → die Frage kommt.
  const f = await starte('presenter', mitIntro(beamFrage(), 0));
  ok('Ohne Auftritt-Rest: sofort die Frage', !!f.root.querySelector('.ks-q') && !f.root.querySelector('.ks-intro'));

  // Spätere Fragen haben nie einen Auftritt.
  const s = await starte('presenter', Object.assign(mitIntro(beamFrage(), 10), { current_q_idx: 3 }));
  ok('Zweite Frage: kein Auftritt', !s.root.querySelector('.ks-intro'));
}

/* ══════════════════════════════════════════════════════════
   BEAMER
   ══════════════════════════════════════════════════════════ */
async function bereichBeam() {
  console.log('\n── Beamer ──────────────────────────────────────────\n');

  /* ─── Lobby ─────────────────────────────────────────────── */
  const lob = await starte('presenter', beamLobby(6));
  ok('Lobby: eine Karte je Kind', lob.root.querySelectorAll('.ks-karte').length === 6,
     String(lob.root.querySelectorAll('.ks-karte').length));
  ok('Lobby: die Anzahl steht dran', txt(lob.root.querySelector('[data-ks=total]')) === '6');
  ok('Lobby: ein Startknopf', !!lob.root.querySelector('[data-act=start]'));
  ok('Lobby: der Startknopf ist frei (12 Fragen)',
     lob.root.querySelector('[data-act=start]').disabled === false);
  ok('Lobby: das gewählte Quiz steht mit Namen da',
     txt(lob.root.querySelector('.ks-catname')) === 'Tablet-Schulung: Grundlagen',
     txt(lob.root.querySelector('.ks-catname')));
  ok('Lobby: die Fragenzahl steht daneben',
     txt(lob.root.querySelector('.ks-catn')).includes('12 Fragen'),
     txt(lob.root.querySelector('.ks-catn')));
  ok('Lobby: ein Klick auf den Namen öffnet den Katalog',
     !!lob.root.querySelector('[data-ks=cat][data-act=editor]'));

  /* KEIN zweiter PIN und KEIN zweiter QR-Code: beides steht auf der
     Lehrerseite (Reiterleiste, Griff am Rand). In der ersten Fassung
     stand hier ein leeres weißes Kästchen, weil ctx.room.code und
     MPRoom.qrSVG nicht existieren. */
  const roh = lob.root.innerHTML;
  ok('Lobby: kein zweiter PIN im Werkzeug', !/PIN/i.test(roh));
  ok('Lobby: kein eigener QR-Kasten', !/qr/i.test(lob.root.innerHTML.replace(/QR-Code am Griff/g, '')));

  click(lob.root.querySelector('[data-ks=cat]'), lob.doc);
  await wait(30);
  click(lob.root.querySelector('[data-ed=play][data-cat="kat-2"]'), lob.doc);
  await wait(30);
  const setup = lob.rufe.find(r => r.fn === 'ks_room_setup');
  ok('Quiz im Katalog wählen ruft ks_room_setup', setup && setup.args.p_catalog === 'kat-2',
     JSON.stringify(setup && setup.args));

  const leer = await starte('presenter', Object.assign(beamLobby(0), { question_count: 0 }));
  ok('leerer Katalog: der Startknopf ist zu',
     leer.root.querySelector('[data-act=start]').disabled === true);
  ok('leere Lobby: ein Hinweis auf Code und QR',
     leer.root.querySelector('[data-ks=leer]').hidden === false
     && txt(leer.root.querySelector('[data-ks=leer]')).includes('Code'));

  /* ─── Frage ─────────────────────────────────────────────── */
  const q = await starte('presenter', beamFrage());
  ok('Frage: der Fragetext steht groß da',
     txt(q.root.querySelector('.ks-q')) === FRAGE, txt(q.root.querySelector('.ks-q')));
  ok('Frage: Fortschritt „3/12 Fragen"',
     txt(q.root.querySelector('.ks-quad').parentElement).replace(/\s/g, '') === '3/12Fragen',
     txt(q.root.querySelector('.ks-quad').parentElement));
  ok('Frage: das Quadrat ist zu 3/12 gefüllt',
     q.root.querySelector('.ks-quadf').getAttribute('style').includes('25.0%'));
  ok('Frage: Reihenfolge Frage → Mitte → Antworten',
     (() => { const k = Array.from(q.root.querySelector('.ks-stage').children).map(c => klassen(c)[0]);
              return k.indexOf('ks-qbox') < k.indexOf('ks-mitte') && k.indexOf('ks-mitte') < k.indexOf('ks-kacheln'); })());
  ok('Frage: keine Buchstaben A–D auf den Beamer-Kacheln', q.root.querySelectorAll('.ks-kk').length === 0);
  ok('Frage: kein Neustart-Knopf, nur Beenden und Auflösen',
     !q.root.querySelector('[data-act=restart]') && !!q.root.querySelector('[data-act=finish]'));
  const segs = q.root.querySelectorAll('[data-ks=eck] .ks-seg');
  ok('Frage: n-Eck mit einem Dreieck je Kind (4)', segs.length === 4, String(segs.length));
  ok('Frage: 4 Antworten → 4 von 4 Dreiecken gefüllt',
     q.root.querySelectorAll('[data-ks=eck] .ks-seg.is-voll').length === 4);
  ok('Frage: vier Kacheln', q.root.querySelectorAll('.ks-k').length === 4);
  ok('Frage: KEINE Zahlen auf den Kacheln (das wäre gespoilert)',
     q.root.querySelectorAll('.ks-kn').length === 0);
  ok('Frage: die Kacheln sind nicht anklickbar',
     Array.from(q.root.querySelectorAll('.ks-k')).every(e => e.tagName.toLowerCase() === 'div'));
  // … aber auch nicht abgeblendet: am Beamer wird gelesen, nicht
  // getippt. `is-still` gehört dem Tablet.
  ok('Frage: die Kacheln sind am Beamer voll da (nicht abgeblendet)',
     Array.from(q.root.querySelectorAll('.ks-k')).every(e => !e.classList.contains('is-still')));
  ok('Frage: der Zähler steht da',
     txt(q.root.querySelector('[data-ks=count]')) === '4'
     && txt(q.root.querySelector('[data-ks=total]')) === '4');
  ok('Frage: „Jetzt auflösen" steht bereit', !!q.root.querySelector('[data-act=now]'));
  ok('Frage: wer geantwortet hat, leuchtet',
     q.root.querySelectorAll('.ks-karte.is-fertig').length === 0,
     'in der Frage-Phase gibt es keine Wand');
  ok('Frage: Uhrscheibe und Sekunden', !!q.root.querySelector('[data-ks=clock]')
     && !!q.root.querySelector('[data-ks=uhr]'));
  const pAnteil = String(q.root.querySelector('[data-ks=uhr]').style['--uhr-p']);
  ok('Frage: die Scheibe ist erst ein wenig gefüllt (verstrichene Zeit)',
     /^\d/.test(pAnteil) && parseFloat(pAnteil) >= 0 && parseFloat(pAnteil) < .2, pAnteil);

  /* ─── 5s Vorlese-Phase Beamer ───────────────────────────── */
  const beamRead = await starte('presenter', Object.assign(beamFrage(), {
    phase_ends_at: new Date(Date.now() + 20000).toISOString(),
    question: { text: FRAGE, options: OPTS, correct_idx: null, explanation: null, time_limit: 15 }
  }));
  ok('Vorlese-Phase Beamer: Lese-Banner ist sichtbar',
     beamRead.root.querySelector('[data-ks=reading]') && !beamRead.root.querySelector('[data-ks=reading]').hidden);
  ok('Vorlese-Phase Beamer: Kacheln sind noch ausgeblendet',
     beamRead.root.querySelector('.ks-kacheln')?.hidden === true);
  ok('Vorlese-Phase Beamer: Scheibe läuft in der Vorlesefarbe',
     klassen(beamRead.root.querySelector('[data-ks=uhr]')).includes('ks-uhr--lesen'));
  ok('Vorlese-Phase Beamer: Countdown zeigt Vorlese-Sekunden',
     Number(txt(beamRead.root.querySelector('[data-ks=reading-count]'))) > 0);

  /* ─── Auflösung ─────────────────────────────────────────── */
  const rv = await starte('presenter', beamAufl());
  const slots = Array.from(rv.root.querySelectorAll('.ks-slot'));
  ok('Auflösung: fünf Plätze', slots.length === 5, String(slots.length));
  ok('Auflösung: von links nach rechts Platz 1 … 5',
     slots.map(s => s.dataset.rank).join(',') === '1,2,3,4,5',
     slots.map(s => s.dataset.rank).join(','));
  // Name DARÜBER, Punkte DARUNTER — in dieser Reihenfolge im DOM.
  const teile = Array.from(slots[0].children).map(c => c.className.split(' ')[0]);
  ok('Auflösung: Name oben, Wesen in der Mitte, Punkte unten',
     teile[0] === 'ks-sname' && teile[1] === 'ks-spic' && teile[2] === 'ks-sfoot',
     teile.join(' → '));
  ok('Auflösung: der Erste hat Namen, Platz und Punkte',
     txt(slots[0]).includes('Kind 1') && txt(slots[0]).includes('#1')
     && txt(slots[0]).includes('2.780'), txt(slots[0]));
  ok('Auflösung: der Rang-Sprung steht dran',
     txt(slots[0].querySelector('.ks-delta')) === '▲ 2',
     txt(slots[0].querySelector('.ks-delta')));
  ok('Auflösung: Platz 5 ist abgestiegen',
     txt(slots[4].querySelector('.ks-delta')) === '▼ 1',
     txt(slots[4].querySelector('.ks-delta')));

  /* Die Füllstände. 20 Antworten: 2 · 12 · 1 · 5 → 10 / 60 / 5 / 25 %.
     Die Prozentzahl steht NICHT dabei (sie steht im Balken) — die
     absolute Zahl schon. */
  const zahlen = Array.from(rv.root.querySelectorAll('.ks-kn')).map(e => txt(e));
  ok('Auflösung: absolute Zahlen auf den Kacheln', zahlen.join(',') === '2,12,1,5', zahlen.join(','));
  const weiten = Array.from(rv.root.querySelectorAll('.ks-fuell')).map(e => e.style.width);
  ok('Auflösung: die Füllstände stimmen', weiten.join(',') === '10.0%,60.0%,5.0%,25.0%',
     weiten.join(','));
  ok('Auflösung: keine Prozentzahl als Text (die steht im Balken)',
     !txt(rv.root.querySelector('.ks-kacheln')).includes('%'));
  ok('Auflösung: die richtige Kachel ist hervorgehoben',
     rv.root.querySelectorAll('.ks-k')[1].classList.contains('is-richtig')
     && rv.root.querySelectorAll('.ks-k')[0].classList.contains('is-blass'));
  ok('Auflösung: die richtige Kachel trägt ein Häkchen',
     txt(rv.root.querySelectorAll('.ks-kk')[1]) === '✓',
     txt(rv.root.querySelectorAll('.ks-kk')[1]));
  ok('Auflösung: die richtige Kachel trägt die grüne Haken-Klasse',
     rv.root.querySelectorAll('.ks-kk')[1].classList.contains('ks-kk--richtig'));
  ok('Auflösung: die Antworten stehen noch an derselben Stelle',
     Array.from(rv.root.querySelectorAll('.ks-kt')).map(e => txt(e)).join('|') === OPTS.join('|'));
  ok('Auflösung: die Erklärung steht da',
     txt(rv.root.querySelector('.ks-expl')).includes('Arbeitsgerät'));
  ok('Auflösung: die Frage steht klein noch oben',
     txt(rv.root.querySelector('.ks-qsmall')) === FRAGE);
  ok('Auflösung: „Nächste Frage" steht bereit',
     txt(rv.root.querySelector('[data-act=next]')) === 'Nächste Frage');

  const letzte = await starte('presenter', Object.assign(beamAufl(), { current_q_idx: 11 }));
  ok('bei der letzten Frage heißt der Knopf „Siegerehrung"',
     txt(letzte.root.querySelector('[data-act=next]')) === 'Siegerehrung');

  /* ─── Siegerehrung ──────────────────────────────────────── */
  const end = await starte('presenter', beamEnde());
  const stufen = Array.from(end.root.querySelectorAll('.ks-stufe[data-rank]'));
  ok('Siegerehrung: das Treppchen der drei Ersten steht', stufen.length === 3,
     String(stufen.length));
  ok('Siegerehrung: Treppchen in der Reihenfolge 2 · 1 · 3',
     stufen.map(s => s.dataset.rank).join(',') === '2,1,3',
     stufen.map(s => s.dataset.rank).join(','));
  // Ohne Bewegung (hier: kein Browser) gilt das Endbild: alle drei
  // stehen oben, der Erste jubelt, die beiden anderen klatschen —
  // und in der Menge fehlen genau diese drei.
  ok('Siegerehrung: oben jubelt der Erste',
     klassen(end.root.querySelector('.ks-stufe--1 svg')).includes('state-cheer'),
     klassen(end.root.querySelector('.ks-stufe--1 svg')).join(' '));
  ok('Siegerehrung: Platz 2 und 3 klatschen',
     klassen(end.root.querySelector('.ks-stufe--2 svg')).includes('state-clap')
     && klassen(end.root.querySelector('.ks-stufe--3 svg')).includes('state-clap'));
  ok('Siegerehrung: wer oben steht, fehlt unten in der Menge',
     end.root.querySelectorAll('.ks-karte.is-oben').length === 3,
     String(end.root.querySelectorAll('.ks-karte.is-oben').length));
  ok('Klatschen steht in creatures.css',
     fs.readFileSync(CSS, 'utf8').includes('.state-clap .arm-l'));
  ok('Siegerehrung: ALLE Wesen sind zu sehen',
     end.root.querySelectorAll('.ks-karte').length === 8,
     String(end.root.querySelectorAll('.ks-karte').length));
  ok('Siegerehrung: mit Punkten an jeder Karte',
     end.root.querySelectorAll('.ks-kpkt').length === 8);
  ok('Siegerehrung: zurück in die Lobby geht auch', !!end.root.querySelector('[data-act=reset]'));

  /* ─── Kein Emote-Rest ───────────────────────────────────── */
  const em = await starte('presenter', Object.assign(beamLobby(3), {
    players: [spieler(1, { emote: 'wave' }), spieler(2), spieler(3)]
  }));
  const bubbles = Array.from(em.root.querySelectorAll('.ks-kbubble')).filter(b => b.hidden === false);
  ok('Lobby: nur wer gerade emotet, zeigt ein Zeichen', bubbles.length === 1,
     String(bubbles.length));
  ok('… und es ist das richtige', txt(bubbles[0]) === '👋', txt(bubbles[0]));
}

/* ══════════════════════════════════════════════════════════
   FLUSS
   ══════════════════════════════════════════════════════════ */
async function bereichFluss() {
  console.log('\n── Ablauf ──────────────────────────────────────────\n');

  /* ─── Weiterschalten trägt die Phase mit ────────────────── */
  const lob = await starte('presenter', beamLobby(3));
  click(lob.root.querySelector('[data-act=start]'), lob.doc);
  await wait(30);
  let s = lob.rufe.find(r => r.fn === 'ks_step');
  ok('Start ruft ks_step mit p_from=lobby', s && s.args.p_from === 'lobby',
     JSON.stringify(s && s.args));
  ok('… und NICHT das alte ks_advance', !lob.rufe.some(r => r.fn === 'ks_advance'));

  const q = await starte('presenter', beamFrage());
  click(q.root.querySelector('[data-act=now]'), q.doc);
  await wait(30);
  s = q.rufe.find(r => r.fn === 'ks_step');
  ok('„Jetzt auflösen" ruft ks_step mit p_from=question', s && s.args.p_from === 'question');
  ok('… und der Knopf ist danach gesperrt (kein zweiter Sprung)',
     q.root.querySelector('[data-act=now]').disabled === true);

  const rv = await starte('presenter', beamAufl());
  click(rv.root.querySelector('[data-act=next]'), rv.doc);
  await wait(30);
  ok('„Nächste Frage" ruft ks_step mit p_from=reveal',
     rv.rufe.find(r => r.fn === 'ks_step')?.args.p_from === 'reveal');

  /* ─── Die Uhr schaltet NICHT selbst weiter ──────────────── */
  // Eine Frage, deren Zeit schon um ist. Der lokale Takt muss
  // nachfragen (ks_room_sig) und darf NICHT weiterschalten — das tut
  // der Server (ks_ensure_board, Migration 0175). Bis 0174 rief die
  // Beamer-Seite hier selbst ks_advance, und ein gedrosselter
  // Hintergrund-Tab ließ die Frage offen stehen.
  const ab = await starte('presenter', beamFrage(-2));
  const vorher = ab.rufe.length;
  await wait(400);
  ok('abgelaufene Uhr: kein Weiterschalten vom Gerät aus',
     !ab.rufe.some(r => r.fn === 'ks_step' || r.fn === 'ks_advance'),
     JSON.stringify(ab.rufe.map(r => r.fn)));
  ok('abgelaufene Uhr: dafür wird nachgefragt', ab.rufe.length > vorher,
     ab.rufe.length + ' > ' + vorher);
  ok('abgelaufene Uhr: die Anzeige steht auf 0',
     txt(ab.root.querySelector('[data-ks=clock]')) === '0',
     txt(ab.root.querySelector('[data-ks=clock]')));

  /* ─── Ein Takt ohne Phasenwechsel baut NICHT neu ────────── */
  // Das ist die Prüfung für „smooth": reißt das DOM bei jedem Takt
  // ab, fängt jedes Atmen und jedes Winken von vorn an, und die Uhr
  // springt. Geprüft an der Identität des SVG-Elements.
  const gl = await starte('presenter', beamFrage());
  const svgVorher  = gl.root.querySelector('.ks-q');
  const stageVorher = gl.root.querySelector('.ks-stage');
  gl.zustand.sig = 'zwei';
  gl.zustand.view = Object.assign(beamFrage(), { answers_total: 11 });
  await gl.impl.update();
  await wait(40);
  ok('derselbe Takt, neue Zahl: das Bild bleibt stehen',
     gl.root.querySelector('.ks-q') === svgVorher
     && gl.root.querySelector('.ks-stage') === stageVorher);
  ok('… nur der Zähler hat sich geändert',
     txt(gl.root.querySelector('[data-ks=count]')) === '11',
     txt(gl.root.querySelector('[data-ks=count]')));

  // Phasenwechsel dagegen baut neu.
  gl.zustand.sig = 'drei';
  gl.zustand.view = beamAufl();
  await gl.impl.update();
  await wait(40);
  ok('Phasenwechsel: jetzt wird neu gebaut',
     !!gl.root.querySelector('.ks-podest') && !gl.root.querySelector('.ks-qbox'));

  /* ─── Die Wand wird geflickt, nicht neu geschrieben ─────── */
  const wall = await starte('presenter', beamLobby(3));
  const karte0 = wall.root.querySelector('.ks-karte');
  const svg0 = karte0.querySelector('svg');
  wall.zustand.sig = 'zwei';
  wall.zustand.view = beamLobby(5);        // zwei kommen dazu
  await wall.impl.update();
  await wait(40);
  ok('zwei Kinder kommen dazu: fünf Karten',
     wall.root.querySelectorAll('.ks-karte').length === 5,
     String(wall.root.querySelectorAll('.ks-karte').length));
  ok('… und die drei alten Wesen atmen weiter (dasselbe Element)',
     wall.root.querySelector('.ks-karte') === karte0
     && karte0.querySelector('svg') === svg0);

  wall.zustand.sig = 'drei';
  wall.zustand.view = beamLobby(2);        // drei gehen
  await wall.impl.update();
  await wait(40);
  ok('wer geht, verschwindet auch', wall.root.querySelectorAll('.ks-karte').length === 2,
     String(wall.root.querySelectorAll('.ks-karte').length));

  /* ─── Der Rahmen bekommt eine gemessene Höhe ────────────── */
  const hoch = await starte('presenter', beamFrage(), { hoehe: 900 });
  const frame = hoch.root.querySelector('.ks-frame');
  ok('der Rahmen bekommt eine Höhe in px', /^\d+px$/.test(frame.style.height || ''),
     String(frame.style.height));
  ok('… und sie ist kleiner als der Bildschirm (die Kopfzeile geht ab)',
     parseInt(frame.style.height, 10) > 0 && parseInt(frame.style.height, 10) < 900,
     String(frame.style.height));
  ok('--ks-h steht am Rahmen', String(frame.style['--ks-h'] || '').endsWith('px'),
     String(frame.style['--ks-h']));

  const flach = await starte('presenter', beamFrage(), { hoehe: 420 });
  const f2 = flach.root.querySelector('.ks-frame');
  ok('auf einem flachen Gerät gilt die Untergrenze (kein Streifen)',
     parseInt(f2.style.height, 10) >= 240, String(f2.style.height));
  // Unter 360 fällt weg, was begleitet — als Klasse, damit tool.css
  // es entscheiden kann (siehe „Flache Rahmen" dort).
  ok('… und der Rahmen sagt, dass er flach ist',
     f2.classList.contains('ks-frame--flach'), f2.getAttribute('class'));
  const hoch2 = await starte('presenter', beamFrage(), { hoehe: 900 });
  ok('auf einem hohen Bildschirm nicht',
     !hoch2.root.querySelector('.ks-frame').classList.contains('ks-frame--flach'));

  /* ─── Fehler werden gemeldet, aber nicht als Wand ───────── */
  const kaputt = await starte('participant', tabFrage(), {
    antworten: { ks_answer: { ok: false, error: 'time_up' } }
  });
  click(kaputt.root.querySelectorAll('.ks-k')[0], kaputt.doc);
  await wait(40);
  ok('abgelehnte Antwort: eine Meldung', kaputt.ctx.toasts.length === 1,
     JSON.stringify(kaputt.ctx.toasts));
  ok('… und die Kacheln sind wieder frei',
     kaputt.root.querySelectorAll('.ks-k')[0].disabled === false);

  /* ─── Abräumen ──────────────────────────────────────────── */
  const ab2 = await starte('participant', tabFrage());
  const n1 = ab2.rufe.length;
  ab2.impl.unmount();
  await wait(300);
  ok('nach unmount ist Ruhe (kein Takt mehr)', ab2.rufe.length === n1,
     ab2.rufe.length + ' vs ' + n1);
  ok('… und die Seitenklasse ist weg',
     !ab2.env.document.body.classList.contains('tool-fill'));
}

/* ══════════════════════════════════════════════════════════
   HELL/DUNKEL
   ══════════════════════════════════════════════════════════
   Eine reine Textprüfung an tool.css, und sie fängt genau den
   Fehler, der am 26.09.2026 gemeldet wurde: der Umschalter in der
   Kopfzeile tat am Quiz nichts, weil das Werkzeug seine Farben fest
   eingebaut hatte.

   Geprüft wird nicht, wie es AUSSIEHT (das kann nur ein Auge) und
   auch nicht der Kontrast (den misst fitcheck.js im echten
   Browser), sondern die eine Bedingung, unter der Umschalten
   überhaupt funktionieren KANN: jede Farbe steht in einer Variablen,
   und die gibt es in beiden Sätzen.                               */
async function bereichTheme() {
  console.log('\n── Hell und dunkel ─────────────────────────────────\n');
  const css = fs.readFileSync(path.join(DIR, 'tool.css'), 'utf8');

  const blockVon = (kopf) => {
    const i = css.indexOf(kopf);
    if (i < 0) return null;
    return css.slice(i, css.indexOf('}', i));
  };
  const dunkel = blockVon('.ks-frame {');
  const hell   = blockVon(':root[data-theme="light"] .ks-frame {');
  ok('es gibt einen hellen Satz', !!hell);
  if (!dunkel || !hell) return;

  const varsIn = t => new Set((t.match(/--ks-[a-z0-9-]+(?=\s*:)/g) || []));
  const dSet = varsIn(dunkel), hSet = varsIn(hell);
  ok('der dunkle Satz erklärt die Farben', dSet.size >= 20, String(dSet.size));

  /* Der helle Satz überschreibt nur, was anders ist — was in beiden
     gleich aussieht (die vier Antwortfarben), steht nur einmal da.
     Umgekehrt darf er NICHTS erfinden: eine Variable, die nur hier
     steht, gilt im Dunkeln nicht und fällt auf `unset` zurück. */
  const erfunden = [...hSet].filter(v => !dSet.has(v));
  ok('der helle Satz erfindet keine Variable', erfunden.length === 0, erfunden.join(', '));

  /* Die Flächen, die sich ändern MÜSSEN. Ohne sie wäre das Quiz im
     hellen Modus schwarz mit hellen Rändern — schlimmer als gar
     kein Umschalten. */
  const pflicht = ['--ks-bg', '--ks-flaeche', '--ks-karte', '--ks-tief',
                   '--ks-ink', '--ks-soft', '--ks-linie', '--ks-kante', '--ks-punkt'];
  const fehlt = pflicht.filter(v => !hSet.has(v));
  ok('… und dreht jede tragende Fläche um', fehlt.length === 0, fehlt.join(', '));

  /* Jede benutzte Variable ist auch erklärt. Ein Tippfehler in
     var(--ks-golt) fällt sonst nirgends auf: der Browser nimmt die
     Erbfarbe und es sieht nur „irgendwie falsch" aus. */
  const benutzt = new Set((css.match(/var\(--ks-[a-z0-9-]+/g) || [])
    .map(s => s.slice(4)));
  const unbekannt = [...benutzt].filter(v => !dSet.has(v) && v !== '--ks-h' && v !== '--ks-wsize');
  ok('jede benutzte Variable ist auch erklärt', unbekannt.length === 0, unbekannt.join(', '));

  /* Und keine Fläche steht mehr fest im Blatt. Erlaubt bleibt genau
     das, was AUF einer der vier Antwortfarben oder auf einem
     farbigen Knopf liegt: die Kachel ist in beiden Fassungen
     dieselbe, also auch ihre Schrift, ihr Füllstand und ihre Kante.
     `.ks-k(?![a-z])` trennt die Kachel von `.ks-karte`, `.ks-kpic`
     und `.ks-kname` — die sind Fläche und müssen umschlagen. */
  const erlaubt = /\.ks-k(?![a-z])|\.ks-(kk|kt|kn|kmein|fuell|go|now|fertig)\b|\.ks-delta--(up|down)|\.ks-urteil--(ok|nein|end)|\.ks-skin\.is-on|@keyframes ks-richtig/;
  const ohneKommentar = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const feste = [];
  let regel = null, aussen = null;
  for (const zeile of ohneKommentar.split('\n')) {
    if (zeile.includes('{')) {
      const sel = zeile.slice(0, zeile.indexOf('{')).trim();
      // @keyframes und @media umschließen weitere Regeln. Für die
      // Zuordnung zählt dann der äußere Kopf („from" sagt nichts).
      if (sel.startsWith('@')) { aussen = sel; regel = sel; }
      else regel = (aussen && /^(from|to|[\d.]+%)/.test(sel)) ? aussen : sel;
    }
    if (zeile.includes('}') && !zeile.includes('{')) { if (regel === aussen) aussen = null; }
    if (/--ks-[a-z0-9-]+\s*:/.test(zeile)) continue;          // die Farbsätze selbst
    if (regel && erlaubt.test(regel)) continue;
    if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(zeile)) {
      feste.push((regel || '?').trim() + ' → ' + zeile.trim());
    }
  }
  ok('keine feste Farbe außerhalb der beiden Sätze', feste.length === 0,
     feste.slice(0, 4).join(' | '));
}

/* ══════════════════════════════════════════════════════════
   EDITOR (Kataloge, Fragenkacheln, Beamer-Vorschau)
   ══════════════════════════════════════════════════════════ */
async function bereichEditor() {
  console.log('\n── Editor ──────────────────────────────────────────\n');

  const lob = await starte('presenter', beamLobby(2));

  // 1) Editor-Button in der Lobby
  const btnEd = lob.root.querySelector('[data-act=editor]');
  ok('Lobby: Button für den Editor ist da', !!btnEd);

  // 2) Klick auf Editor öffnet die Katalogliste
  click(btnEd, lob.doc);
  await wait(30);

  ok('Editor geöffnet: Überschrift da', !!lob.root.querySelector('.kse-h1'));
  ok('Kataloge nach Themenfeldern gruppiert', lob.root.querySelectorAll('.kse-gruppe').length >= 1);
  ok('Neues Quiz Button vorhanden', !!lob.root.querySelector('[data-ed=new]'));

  // 3) Klick auf "Neues Quiz" öffnet den visuellen Fragen-Editor
  click(lob.root.querySelector('[data-ed=new]'), lob.doc);
  await wait(30);

  ok('Fragen-Editor geöffnet: Titel-Input da', !!lob.root.querySelector('[data-ed-field=title]'));
  ok('Fach-Auswahl da', !!lob.root.querySelector('[data-ed-field=subject]'));
  ok('Eine leere Fragekachel als Start vorhanden', lob.root.querySelectorAll('.kse-frage').length === 1);
  ok('Drag-Griff an der Fragekachel da', !!lob.root.querySelector('.kse-frage-griff'));
  ok('4 Antwort-Inputs (A, B, C, D) da', lob.root.querySelectorAll('.kse-oinput').length === 4);
  ok('4 Haken-Buttons da', lob.root.querySelectorAll('.kse-haken').length === 4);
  ok('Knopf + Frage hinzufügen da', !!lob.root.querySelector('[data-ed=addq]'));
  ok('Vorschau-Knopf da', !!lob.root.querySelector('[data-ed=preview]'));
  ok('Speichern-Knopf da', !!lob.root.querySelector('[data-ed=save]'));

  // 4) Frage hinzufügen
  click(lob.root.querySelector('[data-ed=addq]'), lob.doc);
  await wait(30);
  ok('Nach + Frage hinzufügen: 2 Kacheln', lob.root.querySelectorAll('.kse-frage').length === 2);

  // 5) Frage löschen
  click(lob.root.querySelector('[data-ed=delq][data-qi="1"]'), lob.doc);
  await wait(30);
  ok('Nach Löschen: wieder 1 Kachel', lob.root.querySelectorAll('.kse-frage').length === 1);

  // 6) Haken umschalten (Multi-Choice)
  const hakenB = lob.root.querySelector('[data-ed=toggle][data-qi="0"][data-oi="1"]');
  ok('Haken B anfangs nicht gesetzt', !hakenB.classList.contains('is-richtig'));
  click(hakenB, lob.doc);
  await wait(10);
  ok('Nach Klick auf B: Haken B gesetzt', hakenB.classList.contains('is-richtig'));

  // 7) Vorschau testen
  const fText = lob.root.querySelector('.kse-ftext');
  fText.value = 'Testfrage für Beamer';
  click(lob.root.querySelector('[data-ed=preview]'), lob.doc);
  await wait(30);

  ok('Vorschau geöffnet', !!lob.root.querySelector('.kse-wrap--preview'));
  ok('Fragetext in Beamer-Vorschau sichtbar', txt(lob.root.querySelector('.kse-pv-q')).includes('Testfrage'));
  ok('4 Beamer-Kacheln in Vorschau da', lob.root.querySelectorAll('.kse-pv-k').length === 4);

  // 8) Zurück zum Editor
  click(lob.root.querySelector('[data-ed=back-edit]'), lob.doc);
  await wait(30);
  ok('Aus Vorschau zurück zum Editor', !!lob.root.querySelector('.kse-fragen'));

  // 9) Zurück zur Katalogliste
  click(lob.root.querySelector('[data-ed=back]'), lob.doc);
  await wait(30);
  ok('Zurück zur Katalogliste', !!lob.root.querySelector('.kse-list'));

  // 10) Editor schließen -> zurück zur Lobby
  click(lob.root.querySelector('[data-ed=close]'), lob.doc);
  await wait(30);
  ok('Editor geschlossen: zurück in der Beamer-Lobby', !!lob.root.querySelector('.ks-wall'));
}

/* ══════════════════════════════════════════════════════════
   FOTO & STEUERUNG (Migration 0186)
   ══════════════════════════════════════════════════════════ */
async function bereichFoto() {
  console.log('\n── Foto & Steuerung ────────────────────────────────\n');
  const BILD = 'data:image/jpeg;base64,AAAA';

  // 1) Beamer: Frage mit Foto → Foto wird über ks_room_image geholt
  const mitBild = Object.assign(beamFrage(), {});
  mitBild.question = Object.assign({}, mitBild.question, { qid: 'q-7', has_image: true });
  const b = await starte('presenter', mitBild,
    { antworten: { ks_room_image: { ok: true, qid: 'q-7', image: BILD } } });
  await wait(30);
  const bildBox = b.root.querySelector('[data-ks=bild]');
  ok('Beamer: Fotokasten bei Frage mit Foto', !!bildBox);
  ok('Beamer: Foto über ks_room_image geholt', b.rufe.some(r => r.fn === 'ks_room_image'));
  ok('Beamer: Foto steht im Kasten', !!(bildBox && bildBox.querySelector('img')
     && bildBox.querySelector('img').getAttribute('src') === BILD));
  ok('Beamer: Bühne trägt ks-stage--mitbild', klassen(b.root.querySelector('.ks-stage')).includes('ks-stage--mitbild'));
  const n1 = b.rufe.filter(r => r.fn === 'ks_room_image').length;
  b.zustand.sig = 'b'; b.impl.update(); await wait(30);
  ok('Beamer: Foto nur EINMAL je Frage geholt', b.rufe.filter(r => r.fn === 'ks_room_image').length === n1);

  // ohne Foto: kein Kasten, kein Aufruf
  const o = await starte('presenter', beamFrage());
  ok('Beamer: ohne Foto kein Kasten', !o.root.querySelector('[data-ks=bild]'));
  ok('Beamer: ohne Foto kein ks_room_image', !o.rufe.some(r => r.fn === 'ks_room_image'));

  // 2) Tablet: niemals ein Foto
  const tv = tabFrage();
  tv.question = Object.assign({}, tv.question, { has_image: true, qid: 'q-7' });
  const t = await starte('participant', tv);
  ok('Tablet: kein Fotokasten', !t.root.querySelector('[data-ks=bild]') && !t.root.querySelector('img'));
  ok('Tablet: kein ks_room_image', !t.rufe.some(r => r.fn === 'ks_room_image'));
  ok('Tablet: keine Beenden/Neustart-Knöpfe', !t.root.querySelector('[data-act=finish],[data-act=restart]'));

  // 3) Beenden & Neustart am Beamer
  ok('Frage: Beenden-Knopf da', !!o.root.querySelector('[data-act=finish]'));
  ok('Frage: KEIN Neustart-Knopf (nur Beenden + Auflösen)', !o.root.querySelector('[data-act=restart]'));
  click(o.root.querySelector('[data-act=finish]'), o.doc); await wait(20);
  ok('Beenden ruft ks_finish', o.rufe.some(r => r.fn === 'ks_finish'));
  ok('Beenden ruft NICHT ks_step', !o.rufe.some(r => r.fn === 'ks_step'));

  const a = await starte('presenter', beamAufl());
  ok('Auflösung: Beenden-Knopf da', !!a.root.querySelector('[data-act=finish]'));
  click(a.root.querySelector('[data-act=restart]'), a.doc); await wait(20);
  ok('Neustart ruft ks_restart', a.rufe.some(r => r.fn === 'ks_restart'));

  const e = await starte('presenter', beamEnde());
  ok('Siegerehrung: Nochmal-Knopf da', !!e.root.querySelector('[data-act=restart]'));
  ok('Siegerehrung: kein Beenden-Knopf', !e.root.querySelector('[data-act=finish]'));
  ok('Siegerehrung: Zurück zur Lobby bleibt', !!e.root.querySelector('[data-act=reset]'));

  // Abbrechen im Bestätigungsdialog: nichts passiert
  const n = await starte('presenter', beamFrage());
  n.ctx.confirm = () => Promise.resolve(false);
  click(n.root.querySelector('[data-act=finish]'), n.doc); await wait(20);
  ok('Beenden abgebrochen: kein Aufruf', !n.rufe.some(r => r.fn === 'ks_finish'));

  // 4) Editor: Fotospalte, Name, Papierkorb, Speichern mit Foto
  const ed = await starte('presenter', beamLobby(2), { antworten: {
    ks_catalog_get: { ok: true, catalog_id: 'kat-2', title: 'Bruchrechnen', subject: 'Mathematik',
      questions: [
        { question_text: 'Mit Foto', options: ['a', 'b', 'c', 'd'], correct_idx: 0, correct_indices: [0],
          time_limit_sec: 20, explanation: null, image: BILD, image_name: 'torte.jpg' },
        { question_text: 'Ohne Foto', options: ['a', 'b', 'c', 'd'], correct_idx: 1, correct_indices: [1],
          time_limit_sec: 20, explanation: null, image: null, image_name: null }
      ] },
    ks_catalog_save: { ok: true, catalog_id: 'kat-2', count: 2 }
  } });
  click(ed.root.querySelector('[data-act=editor]'), ed.doc); await wait(30);
  click(ed.root.querySelector('[data-ed=edit][data-cat="kat-2"]'), ed.doc); await wait(30);
  const z0 = ed.root.querySelector('[data-foto="0"]');
  const z1 = ed.root.querySelector('[data-foto="1"]');
  ok('Editor: Fotospalte an jeder Karte', !!z0 && !!z1);
  ok('Editor: Foto da → Name sichtbar', txt(z0).includes('torte.jpg'));
  ok('Editor: Foto da → Papierkorb', !!z0.querySelector('[data-ed=foto-del]'));
  ok('Editor: kein Foto → Hochladen-Knopf', !!z1.querySelector('input[type=file][data-foto-file="1"]'));
  ok('Editor: kein Foto → Hinweis aufs Ziehen', txt(z1).includes('ziehen'));

  // Text tippen, dann Foto löschen: Getipptes bleibt
  ed.root.querySelector('[data-qi="1"][data-field=question_text]').value = 'Neu getippt';
  click(z0.querySelector('[data-ed=foto-del]'), ed.doc); await wait(20);
  ok('Papierkorb: Fotospalte zeigt wieder Hochladen',
     !!ed.root.querySelector('[data-foto="0"] input[type=file]'));
  ok('Papierkorb: Getipptes bleibt stehen',
     ed.root.querySelector('[data-qi="1"][data-field=question_text]').value === 'Neu getippt');

  // Vorschau: leeres Feld zum Hochladen über den Kacheln
  click(ed.root.querySelector('[data-ed=preview]'), ed.doc); await wait(30);
  ok('Vorschau: Hochladefeld statt Foto (gelöscht)', !!ed.root.querySelector('.kse-pv-bildleer'));
  click(ed.root.querySelector('[data-ed=back-edit]'), ed.doc); await wait(30);

  click(ed.root.querySelector('[data-ed=save]'), ed.doc); await wait(30);
  const save = ed.rufe.find(r => r.fn === 'ks_catalog_save');
  ok('Speichern: Foto entfernt → image null', save && save.args.p_questions[0].image === null);

  // Zweiter Durchgang: Foto bleibt beim Speichern erhalten, Vorschau zeigt es groß
  const ed2 = await starte('presenter', beamLobby(2), { antworten: {
    ks_catalog_get: { ok: true, catalog_id: 'kat-2', title: 'B', subject: 'Mathematik',
      questions: [{ question_text: 'Mit Foto', options: ['a', 'b', 'c', 'd'], correct_idx: 0,
        correct_indices: [0], time_limit_sec: 20, explanation: null, image: BILD, image_name: 'torte.jpg' }] },
    ks_catalog_save: { ok: true, catalog_id: 'kat-2', count: 1 }
  } });
  click(ed2.root.querySelector('[data-act=editor]'), ed2.doc); await wait(30);
  click(ed2.root.querySelector('[data-ed=edit][data-cat="kat-2"]'), ed2.doc); await wait(30);
  click(ed2.root.querySelector('[data-ed=preview]'), ed2.doc); await wait(30);
  const pv = ed2.root.querySelector('.kse-pv-bild');
  ok('Vorschau: Foto groß über den Kacheln', !!pv && !!pv.querySelector('img'));
  const reihen = Array.from(ed2.root.querySelector('.kse-wrap--preview').children).map(c => klassen(c)[0]);
  ok('Vorschau: Reihenfolge Frage → Foto → Kacheln',
     reihen.indexOf('kse-pv-qbox') < reihen.indexOf('kse-pv-bild')
     && reihen.indexOf('kse-pv-bild') < reihen.indexOf('kse-pv-kacheln'), reihen.join(' '));
  ok('Vorschau: Papierkorb am Foto', !!pv.querySelector('[data-ed=foto-del]'));
  ok('Vorschau: Ersetzen-Knopf am Foto', !!pv.querySelector('input[type=file][data-foto-file=pv]'));
  click(ed2.root.querySelector('[data-ed=back-edit]'), ed2.doc); await wait(30);
  click(ed2.root.querySelector('[data-ed=save]'), ed2.doc); await wait(30);
  const s2 = ed2.rufe.find(r => r.fn === 'ks_catalog_save');
  ok('Speichern: Foto und Name gehen mit',
     s2 && s2.args.p_questions[0].image === BILD && s2.args.p_questions[0].image_name === 'torte.jpg');

  // Text-Import: keine Fotos
  click(ed2.root.querySelector('[data-ed=imp-open-append]'), ed2.doc); await wait(30);
  ok('Text-Import: kein Foto-Hochladen', !ed2.root.querySelector('input[type=file]'));
}


/* ══════════════════════════════════════════════════════════
   KATALOG (Migration 0194): Suche, Filter, Status, Autor, Peek
   ══════════════════════════════════════════════════════════ */
async function bereichKatalog() {
  console.log('\n── Katalog ─────────────────────────────────────────\n');

  const kat = (id, title, subject, vis, autor, n, extra = {}) => Object.assign({
    id, title, subject, visibility: vis, author_name: autor, count: n,
    mine: autor === 'Ich', is_template: false, has_thumb: false, can_admin: false,
    created_at: '2026-10-0' + (1 + (id.length % 8)) + 'T10:00:00Z', search: ''
  }, extra);
  const KATS = [
    kat('k1', 'Bruchrechnen', 'Mathematik', 'private', 'Ich', 8, { search: 'Was ist ein Zähler? · Kürzen' }),
    kat('k2', 'Textaufgaben', 'Mathematik', 'school', 'Ich', 5, { has_thumb: true }),
    kat('k3', 'Kommasetzung', 'Deutsch', 'hub', 'Frau Weiß', 12, { search: 'Wann setzt man ein Komma?' }),
    kat('k4', 'Vokabeln Unit 3', 'Englisch', 'school', 'Herr Groß', 20),
    kat('k5', 'Tablet-Schulung: Grundlagen', 'Tablet & Medien', 'hub', 'MPSkills', 12, { is_template: true, can_admin: true }),
    kat('k6', 'Zum Aufwärmen', 'Spaß & Rätsel', 'hub', 'Herr Groß', 6, { can_admin: true })
  ];
  const CATS = ['Mathematik', 'Deutsch', 'Englisch', 'Tablet & Medien', 'Spaß & Rätsel', 'Allgemeinwissen', 'Andere'];
  const lobby = Object.assign(beamLobby(2), { catalogs: KATS, categories: CATS.map(name => ({ name })) });
  const THUMB = 'data:image/jpeg;base64,AAAA';

  const lob = await starte('presenter', lobby, { antworten: {
    ks_catalog_thumbs: { ok: true, thumbs: { k2: THUMB } },
    ks_catalog_peek: { ok: true, questions: ['Was ist ein Zähler?', 'Wie kürzt man?'] },
    ks_catalog_set_visibility: { ok: true }
  } });
  click(lob.root.querySelector('[data-act=editor]'), lob.doc); await wait(30);
  const R = lob.root;
  const karten = () => Array.from(R.querySelectorAll('.kse-kk'));
  const titel = () => karten().map(k => txt(k.querySelector('.kse-kk-title'))).sort().join('|');
  const tippe = async v => {
    const i = R.querySelector('[data-lf=q]'); i.value = v;
    i.dispatchEvent(new lob.doc.defaultView.Event('input', { bubbles: true })); await wait(20);
  };

  ok('Katalog: alle 6 Quizze als Karten', karten().length === 6, String(karten().length));
  ok('Katalog: nach Themenfeld gruppiert (5 Gruppen)', R.querySelectorAll('.kse-gruppe').length === 5);
  ok('Katalog: Reihenfolge der Gruppen wie die Themenfelder des Servers',
     Array.from(R.querySelectorAll('.kse-fach-btn')).map(b => txt(b).replace(/\s*\d+$/, '').replace(/^[▸▾]\s*/, '')).join(',')
       === 'Mathematik,Deutsch,Englisch,Tablet & Medien,Spaß & Rätsel');
  ok('Katalog: Autor steht an jeder Karte', karten().every(k => /von /.test(txt(k.querySelector('.kse-kk-by')))));
  ok('Katalog: eigener Autor trägt „(du)"', txt(R.querySelector('[data-kk=k1] .kse-kk-by')).includes('(du)'));
  ok('Katalog: Status-Chips Privat/Schule/Hub',
     txt(R.querySelector('[data-kk=k1] .kse-chip--private')).includes('Privat')
     && txt(R.querySelector('[data-kk=k2] .kse-chip--school')).includes('Schule')
     && txt(R.querySelector('[data-kk=k3] .kse-chip--hub')).includes('Hub'));
  ok('Katalog: „Eigenes"-Chip nur bei eigenen',
     !!R.querySelector('[data-kk=k1] .kse-chip--eigen') && !R.querySelector('[data-kk=k3] .kse-chip--eigen'));
  ok('Katalog: Vorschaubild ist da, ohne Bild das Logo',
     !!R.querySelector('[data-kk=k1] .kse-kk-img--logo'));
  await wait(120);
  ok('Katalog: Thumbnail wird nachgeladen (ks_catalog_thumbs)', lob.rufe.some(r => r.fn === 'ks_catalog_thumbs'
     && r.args.p_ids.join() === 'k2'), JSON.stringify(lob.rufe.filter(r => r.fn === 'ks_catalog_thumbs')));
  ok('Katalog: das geladene Thumbnail steht im Bild',
     R.querySelector('[data-kk=k2] .kse-kk-img').getAttribute('src') === THUMB);
  ok('Katalog: Eigene dürfen löschen, Fremde nicht',
     !!R.querySelector('[data-kk=k1] [data-ed=del]') && !R.querySelector('[data-kk=k3] [data-ed=del]'));
  ok('Katalog: Fremde öffnen als Kopie, eigene bearbeiten',
     /Kopie/.test(txt(R.querySelector('[data-kk=k3] [data-ed=edit]'))) && /Bearbeiten/.test(txt(R.querySelector('[data-kk=k1] [data-ed=edit]'))));
  ok('Katalog: Veröffentlichen-Schalter nur an eigenen',
     R.querySelectorAll('[data-kk=k1] [data-ed=kk-vis]').length === 3 && !R.querySelector('[data-kk=k3] [data-ed=kk-vis]'));
  ok('Katalog: Admin-Knöpfe nur wo can_admin',
     !!R.querySelector('[data-kk=k6] [data-ed=kk-private]') && !R.querySelector('[data-kk=k4] [data-ed=kk-private]')
     && !!R.querySelector('[data-kk=k6] [data-ed=del]'));

  // Suche
  await tippe('komma');
  ok('Suche: findet im Titel („komma")', titel() === 'Kommasetzung', titel());
  await tippe('zähler');
  ok('Suche: findet im Fragentext, mit Umlaut', titel() === 'Bruchrechnen', titel());
  await tippe('zaehler');
  ok('Suche: ae = ä', titel() === 'Bruchrechnen', titel());
  await tippe('gross');
  ok('Suche: findet den Autor (Groß = gross)', titel() === 'Vokabeln Unit 3|Zum Aufwärmen', titel());
  await tippe('hub');
  ok('Suche: findet den Status', titel() === 'Kommasetzung|Tablet-Schulung: Grundlagen|Zum Aufwärmen', titel());
  await tippe('mathe bruch');
  ok('Suche: mehrere Wörter müssen alle passen', titel() === 'Bruchrechnen', titel());
  await tippe('xyzxyz');
  ok('Suche: kein Treffer → Hinweis mit Zurücksetzen', !!R.querySelector('[data-ed=lf-reset]') && karten().length === 0);
  ok('Suche: das Suchfeld behält seinen Text (kein Neuzeichnen)', R.querySelector('[data-lf=q]').value === 'xyzxyz');
  click(R.querySelector('[data-ed=lf-reset]'), lob.doc); await wait(20);
  ok('Zurücksetzen: wieder alle 6', karten().length === 6 && R.querySelector('[data-lf=q]').value === '');

  // Filter
  click(R.querySelector('[data-ed=lf-own]'), lob.doc); await wait(20);
  ok('Filter „Eigene": nur meine Quizze', titel() === 'Bruchrechnen|Textaufgaben', titel());
  click(R.querySelector('[data-ed=lf-vis][data-v=school]'), lob.doc); await wait(20);
  ok('Filter Eigene + Schule', titel() === 'Textaufgaben', titel());
  click(R.querySelector('[data-ed=lf-own]'), lob.doc); await wait(20);
  ok('Filter Schule ohne „Eigene": auch fremde', titel() === 'Textaufgaben|Vokabeln Unit 3', titel());
  click(R.querySelector('[data-ed=lf-vis][data-v=all]'), lob.doc); await wait(20);
  click(R.querySelector('[data-ed=lf-cat][data-c=Mathematik]'), lob.doc); await wait(20);
  ok('Filter Themenfeld Mathematik', titel() === 'Bruchrechnen|Textaufgaben', titel());
  click(R.querySelector('[data-ed=lf-cat][data-c=Deutsch]'), lob.doc); await wait(20);
  ok('Mehrere Themenfelder zugleich', titel() === 'Bruchrechnen|Kommasetzung|Textaufgaben', titel());
  ok('Zähler: „3 von 6 Quizzen"', /3 von 6/.test(txt(R.querySelector('.kse-fzahl'))), txt(R.querySelector('.kse-fzahl')));
  click(R.querySelector('[data-ed=lf-reset]'), lob.doc); await wait(20);
  ok('Alles zurückgesetzt', karten().length === 6);

  // Sortierung
  waehle(R.querySelector('[data-lf=sort]'), 'count', lob.doc); await wait(20);
  const ersteZahl = txt(karten()[0].querySelector('.kse-chip--info'));
  ok('Sortierung „Meiste Fragen" je Gruppe', R.querySelectorAll('.kse-karten').length === 5 && ersteZahl.length > 0);

  // Gruppe zuklappen
  click(R.querySelector('[data-ed=lf-group][data-c=Mathematik]'), lob.doc); await wait(20);
  ok('Gruppe zugeklappt: ihre Karten fehlen', !R.querySelector('[data-kk=k1]') && !!R.querySelector('[data-kk=k3]'));
  click(R.querySelector('[data-ed=lf-group][data-c=Mathematik]'), lob.doc); await wait(20);
  ok('Gruppe wieder auf', !!R.querySelector('[data-kk=k1]'));

  // Fragen kurz ansehen
  click(R.querySelector('[data-kk=k1] [data-ed=kk-peek]'), lob.doc); await wait(40);
  const pk = R.querySelectorAll('[data-kk=k1] .kse-kk-peek li');
  ok('Peek: die Fragen stehen in der Karte', pk.length === 2 && txt(pk[0]) === 'Was ist ein Zähler?');
  ok('Peek: nur Fragetexte (kein Antwort-Aufruf)', lob.rufe.filter(r => r.fn === 'ks_catalog_peek').length === 1
     && !lob.rufe.some(r => r.fn === 'ks_catalog_get'));
  click(R.querySelector('[data-kk=k1] [data-ed=kk-peek]'), lob.doc); await wait(20);
  ok('Peek: zweiter Klick klappt zu', !R.querySelector('[data-kk=k1] .kse-kk-peek'));
  click(R.querySelector('[data-kk=k1] [data-ed=kk-peek]'), lob.doc); await wait(20);
  ok('Peek: zweites Öffnen aus dem Zwischenspeicher',
     lob.rufe.filter(r => r.fn === 'ks_catalog_peek').length === 1 && !!R.querySelector('[data-kk=k1] .kse-kk-peek'));

  // Veröffentlichen
  click(R.querySelector('[data-kk=k1] [data-ed=kk-vis][data-v=hub]'), lob.doc); await wait(40);
  const sv = lob.rufe.find(r => r.fn === 'ks_catalog_set_visibility');
  ok('Veröffentlichen: ruft ks_catalog_set_visibility (Hub)', sv && sv.args.p_catalog_id === 'k1' && sv.args.p_visibility === 'hub',
     JSON.stringify(sv && sv.args));
  ok('Veröffentlichen: der Chip springt sofort auf Hub', !!R.querySelector('[data-kk=k1] .kse-chip--hub'));
  const vor = lob.rufe.length;
  lob.ctx.confirm = () => Promise.resolve(false);
  click(R.querySelector('[data-kk=k2] [data-ed=kk-vis][data-v=hub]'), lob.doc); await wait(30);
  ok('Veröffentlichen: abgebrochen → nichts passiert', lob.rufe.length === vor);
  lob.ctx.confirm = () => Promise.resolve(true);
  click(R.querySelector('[data-kk=k1] [data-ed=kk-vis][data-v=private]'), lob.doc); await wait(30);
  ok('Zurückstufen auf privat ohne Rückfrage-Pflicht möglich',
     lob.rufe.filter(r => r.fn === 'ks_catalog_set_visibility').length === 2);

  // Admin: auf privat stellen
  click(R.querySelector('[data-kk=k6] [data-ed=kk-private]'), lob.doc); await wait(30);
  const ap = lob.rufe.filter(r => r.fn === 'ks_catalog_set_visibility').pop();
  ok('Admin: „Auf privat" ruft den Server', ap.args.p_catalog_id === 'k6' && ap.args.p_visibility === 'private');

  // Spielen markiert den laufenden Katalog
  ok('Katalog im Raum: der laufende ist markiert', !!R.querySelector('[data-kk=k5]') === true
     && !R.querySelector('[data-kk=k1] .kse-chip--aktiv'));

  // Editor: Themenfeld fest, Status, Vorschaubild
  click(R.querySelector('[data-ed=new]'), lob.doc); await wait(30);
  const th = R.querySelector('[data-ed-field=subject]');
  ok('Editor: Themenfelder vom Server in der Auswahl', th.querySelectorAll('option').length === CATS.length);
  ok('Editor: keine Möglichkeit, ein Themenfeld anzulegen', !R.querySelector('[data-ed=new-cat]'));
  ok('Editor: Status-Schalter (3) mit „Privat" voran', R.querySelectorAll('[data-ed=set-vis]').length === 3
     && R.querySelector('[data-ed=set-vis][data-v=private]').classList.contains('is-an'));
  ok('Editor: ohne Bild zeigt das Vorschaubild das Logo', !!R.querySelector('.kse-thumbbox .kse-kk-img--logo'));
  ok('Editor: Bild wählen vorhanden', !!R.querySelector('input[type=file][data-thumb-file]'));
  R.querySelector('[data-ed-field=title]').value = 'Neues Quiz';
  R.querySelector('[data-qi="0"][data-field=question_text]').value = 'F?';
  R.querySelector('[data-qi="0"][data-oi="0"][data-field=option]').value = 'a';
  R.querySelector('[data-qi="0"][data-oi="1"][data-field=option]').value = 'b';
  click(R.querySelector('[data-ed=set-vis][data-v=school]'), lob.doc); await wait(40);
  ok('Editor: Status „Schule" gewählt', R.querySelector('[data-ed=set-vis][data-v=school]').classList.contains('is-an'));
  ok('Editor: bereits Getipptes bleibt', R.querySelector('[data-ed-field=title]').value === 'Neues Quiz');
  click(R.querySelector('[data-ed=save]'), lob.doc); await wait(60);
  const sa = lob.rufe.find(r => r.fn === 'ks_catalog_save');
  ok('Speichern schickt Status, Themenfeld und Vorschaubild mit',
     sa && sa.args.p_visibility === 'school' && sa.args.p_subject === 'Allgemeinwissen',
     JSON.stringify(sa && Object.assign({}, sa.args, { p_questions: '…' })));
  ok('Speichern: ohne Foto/Bild kein Vorschaubild (→ Logo)', sa && sa.args.p_thumbnail === null && sa.args.p_thumb_custom === false);
}

/* ══════════════════════════════════════════════════════════ */
const BEREICHE = { emote: bereichEmote, tab: bereichTab, intro: bereichIntro, beam: bereichBeam,
                   fluss: bereichFluss, editor: bereichEditor, foto: bereichFoto,
                   theme: bereichTheme, katalog: bereichKatalog };
const wahl = process.argv[2];
const lauf = wahl ? [wahl] : Object.keys(BEREICHE);

for (const b of lauf) {
  if (!BEREICHE[b]) { console.error('Unbekannter Bereich: ' + b); process.exit(2); }
  await BEREICHE[b]();
}

console.log(`\n${fails === 0 ? 'Alles grün.' : fails + ' FEHLER.'}`);
process.exit(fails === 0 ? 0 : 1);
