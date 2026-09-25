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
  const familien = ['wave', 'cheer', 'sad', 'sleep'];
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
  const emotes = ['wave', 'cheer', 'dance', 'sleep', 'sad'];
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
  ok('vier Emote-Knöpfe unten', tab.root.querySelectorAll('.ks-emo').length === 4);
  click(knopf, tab.doc);
  const sofort = klassen(tab.root.querySelector('.ks-ipic svg'));
  ok('Tanz-Knopf bewegt das eigene Wesen im selben Augenblick',
     sofort.includes('c-dance-7') && sofort.join(' ') !== vorher, sofort.join(' '));
  await wait(20);
  ok('… und schickt ks_emote an den Server',
     tab.rufe.some(r => r.fn === 'ks_emote' && r.args.p_emote === 'dance'),
     JSON.stringify(tab.rufe.filter(r => r.fn === 'ks_emote')));

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
  ok('Auflösung: vier Emote-Knöpfe ganz unten',
     rv.root.querySelector('.ks-emobar')?.querySelectorAll('.ks-emo').length === 4);
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

  /* ─── Siegerehrung ──────────────────────────────────────── */
  const end = await starte('participant', tabAufl({ phase: 'ended' }));
  ok('Siegerehrung: der Endplatz steht da',
     txt(end.root.querySelector('.ks-urteil')).includes('Platz 4')
     && txt(end.root.querySelector('.ks-urteil')).includes('20'),
     txt(end.root.querySelector('.ks-urteil')));
  ok('Siegerehrung: emoten geht auch hier',
     end.root.querySelectorAll('.ks-emo').length === 4);
  ok('Siegerehrung: alle jubeln',
     klassen(end.root.querySelector('.ks-ipic svg')).includes('cheer-7'));

  const w = end.root.querySelector('[data-act=wechsel]');
  ok('Siegerehrung: das Wesen lässt sich für die nächste Runde ändern', !!w);
  click(w, end.doc);
  await wait(20);
  ok('… die Wesenwahl geht auf', end.root.querySelectorAll('.ks-pick').length === 36);
  // Und bleibt offen: ein Takt (Emote eines anderen Kindes) darf sie
  // nicht wegräumen.
  end.zustand.sig = 'b';
  end.zustand.view = tabAufl({ phase: 'ended', me: { score: 3700 } });
  await end.impl.update();
  await wait(40);
  ok('… und ein Takt räumt sie NICHT weg',
     end.root.querySelectorAll('.ks-pick').length === 36,
     String(end.root.querySelectorAll('.ks-pick').length));
  click(end.root.querySelector('[data-act=fertig]'), end.doc);
  await wait(20);
  ok('„Fertig" führt zurück zur Rangliste', !!end.root.querySelector('.ks-trio'));
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
  ok('Lobby: der Katalog lässt sich wählen',
     lob.root.querySelectorAll('[data-ks=cat] option').length === 2);
  ok('Lobby: die Fragenzahl steht in der Auswahl',
     txt(lob.root.querySelector('[data-ks=cat] option')).includes('12 Fragen'),
     txt(lob.root.querySelector('[data-ks=cat] option')));

  /* KEIN zweiter PIN und KEIN zweiter QR-Code: beides steht auf der
     Lehrerseite (Reiterleiste, Griff am Rand). In der ersten Fassung
     stand hier ein leeres weißes Kästchen, weil ctx.room.code und
     MPRoom.qrSVG nicht existieren. */
  const roh = lob.root.innerHTML;
  ok('Lobby: kein zweiter PIN im Werkzeug', !/PIN/i.test(roh));
  ok('Lobby: kein eigener QR-Kasten', !/qr/i.test(lob.root.innerHTML.replace(/QR-Code am Griff/g, '')));

  waehle(lob.root.querySelector('[data-ks=cat]'), 'kat-2', lob.doc);
  await wait(30);
  const setup = lob.rufe.find(r => r.fn === 'ks_room_setup');
  ok('Katalog wechseln ruft ks_room_setup', setup && setup.args.p_catalog === 'kat-2',
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
  ok('Frage: Nummer und Anzahl',
     txt(q.root.querySelector('.ks-qnr')).replace(/\s/g, '') === 'Frage3/12',
     txt(q.root.querySelector('.ks-qnr')));
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
  ok('Frage: Uhr und Balken', !!q.root.querySelector('[data-ks=clock]')
     && !!q.root.querySelector('[data-ks=bar]'));
  const breite = q.root.querySelector('[data-ks=bar]').style.width;
  ok('Frage: der Balken steht auf einem Anteil, nicht auf 100 %',
     /^\d/.test(breite) && parseFloat(breite) > 80 && parseFloat(breite) <= 100, breite);

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
  ok('Siegerehrung: das Podest der fünf Ersten steht',
     end.root.querySelectorAll('.ks-slot').length === 5);
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

/* ══════════════════════════════════════════════════════════ */
const BEREICHE = { emote: bereichEmote, tab: bereichTab, beam: bereichBeam, fluss: bereichFluss };
const wahl = process.argv[2];
const lauf = wahl ? [wahl] : Object.keys(BEREICHE);

for (const b of lauf) {
  if (!BEREICHE[b]) { console.error('Unbekannter Bereich: ' + b); process.exit(2); }
  await BEREICHE[b]();
}

console.log(`\n${fails === 0 ? 'Alles grün.' : fails + ' FEHLER.'}`);
process.exit(fails === 0 ? 0 : 1);
