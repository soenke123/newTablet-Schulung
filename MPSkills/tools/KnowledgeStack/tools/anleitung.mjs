/**
 * Das Erklär-Quiz „Knowledge Stack: Was das Quiz alles kann“.
 *
 * Ein Quiz, das sich selbst erklärt: jede Frage zeigt eine Funktion
 * und hat als Foto ein Bildschirmfoto genau dieser Funktion. Die
 * Fragetypen kommen darin selbst vor (Auswahl, mehrere richtig,
 * Wahr/Falsch, Skala, Münzen) — wer mitspielt, probiert sie aus.
 *
 * Dieses Skript macht beides:
 *   1. Bildschirmfotos der ECHTEN Oberfläche (tool.js / editor.js),
 *      in Chromium, mit erfundenen Daten wie in fitcheck.js — kein
 *      Server, keine echten Schüler.
 *   2. Die Migration supabase/migrations/0238_knowledgestack_anleitung.sql:
 *      eine Vorlage (is_template, visibility 'hub') mit fester id —
 *      damit sieht sie jede freigeschaltete Lehrkraft im Katalog.
 *
 * Ändert sich die Oberfläche, einfach neu laufen lassen und die
 * Migration noch einmal einspielen (idempotent: on conflict, die
 * Fragen werden ersetzt).
 *
 * Aufruf:  node MPSkills/tools/KnowledgeStack/tools/anleitung.mjs
 *          … --nur-bilder   schreibt nur die Bilder nach shots/anleitung/
 *          CHROME=…         anderes Chromium
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SHOTS = path.join(HERE, 'shots', 'anleitung');
const MIGRATION = path.join(ROOT, 'supabase/migrations/0238_knowledgestack_anleitung.sql');
const NUR_BILDER = process.argv.includes('--nur-bilder');

const CATALOG_ID = '00000000-0000-4000-8000-000000000238';
const TITEL = 'Knowledge Stack: Was das Quiz alles kann';
const THEMA = 'Tablet & Medien';

/* Breite der Bilder in der Datenbank. Der Beamer zeigt das Foto in
   der Mitte zwischen Frage und Antworten — mehr als 900 Punkte
   sieht dort niemand, und die Migration bleibt klein genug für den
   SQL-Editor im Supabase-Dashboard. */
const BREITE = 900;
const QUALI = 0.62;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};

/* ── Die Seiten ──────────────────────────────────────────────────
   Raum (Beamer/Tablet) wie in fitcheck.js: Kopfzeile + Reiter wie in
   lehrer.html/j.html, darunter das echte Werkzeug. Die Durchreiche
   antwortet aus window.__V (ks_view/ks_room_get) und window.__R
   (alles andere, nach Funktionsname). */
const raum = (role) => `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anleitung</title>
<link href="../fonts/outfit-inter-jetbrainsmono-985fda.css" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script src="../viewport.js"></script>
</head>
<body class="${role === 'presenter' ? 'roomview beamer pane-tool' : 'roomview'}">
<header class="topbar">
  <a class="wordmark" href="#"><img class="wordmark-logo" src="../LogoMPSkills.png" alt="" /><span class="wordmark-text">MP<span>Skills</span></span></a>
  <div class="topbar-spacer"></div>
</header>
${role === 'presenter' ? `
<div id="lehrerHost">
  <nav class="rtabs" aria-label="Raum">
    <div class="rtabs-tabs" role="tablist">
      <button type="button" class="rtab" role="tab"><span class="rtab-n">1</span><span class="rtab-t">Einstellungen</span></button>
      <button type="button" class="rtab" role="tab"><span class="rtab-n">2</span><span class="rtab-t">Onboarding</span></button>
      <button type="button" class="rtab on" role="tab"><span class="rtab-n">3</span><span class="rtab-t">Knowledge Stack</span></button>
    </div>
    <div class="rtabs-side">
      <code class="rtabs-code">K7M2QX</code>
      <button type="button" class="rtabs-fs">⛶</button>
    </div>
  </nav>
  <section class="rpane rpane--tool" role="tabpanel">
    <div class="beam-tool" id="host"></div>
  </section>
</div>` : `
<div id="tabHost">
  <nav class="rtabs" aria-label="Raum">
    <div class="rtabs-tabs" role="tablist">
      <button type="button" class="rtab" role="tab"><span class="rtab-t">Raum</span></button>
      <button type="button" class="rtab on" role="tab"><span class="rtab-t">Knowledge Stack</span></button>
    </div>
  </nav>
</div>
<div id="host" class="toolhost"></div>`}
<script src="lib/tool.js"></script>
<script>
window.__R = {};
window.__ctx = {
  role: '${role}', preview: false, title: 'Klasse 7b',
  esc: s => String(s == null ? '' : s),
  errText: c => 'Fehler: ' + c,
  toast: () => {}, confirm: () => Promise.resolve(true), refresh: () => {},
  actions: {
    role: '${role}',
    call: (fn, args) => {
      if (fn === 'ks_sig' || fn === 'ks_room_sig') return Promise.resolve({ ok: true, sig: 'fest', server_now: new Date().toISOString() });
      if (fn === 'ks_view' || fn === 'ks_room_get') return Promise.resolve(Object.assign({ ok: true }, window.__V));
      if (fn in window.__R) return Promise.resolve(window.__R[fn]);
      return Promise.resolve({ ok: true });
    }
  }
};
window.__mount = async (raumAnsicht) => {
  const impl = await window.MPTool.load('knowledgestack', 'KnowledgeStack');
  window.__impl = impl;
  await impl.mount(document.getElementById('host'), window.__ctx);
  if (raumAnsicht) impl.update(raumAnsicht);
};
</script>
</body></html>`;

/* Der Editor ohne Raum, wie quiz.html — nur der Gastgeber ist
   erfunden. */
const editorSeite = () => `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Editor</title>
<link href="../fonts/outfit-inter-jetbrainsmono-985fda.css" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="tools/KnowledgeStack/tool.css">
<style>
  .ks-frame.ks-frame--seite { --ks-h: 720px; height: auto; min-height: 600px; overflow: visible; }
  .ks-frame--seite .ks-stage { position: relative; inset: auto; overflow: visible; }
  .ks-frame--seite .ks-stage > .kse-wrap { overflow: visible; }
  .quiz-wrap { max-width: 1040px; padding-top: 22px; }
</style>
<script src="../viewport.js"></script>
</head>
<body>
<header class="topbar">
  <a class="wordmark" href="#"><img class="wordmark-logo" src="../LogoMPSkills.png" alt="" /><span class="wordmark-text">MP<span>Skills</span></span></a>
  <div class="topbar-spacer"></div>
</header>
<main class="wrap quiz-wrap" id="quizHost"></main>
<script src="tools/KnowledgeStack/parse.js"></script>
<script src="tools/KnowledgeStack/editor.js"></script>
<script>
window.__R = {};
window.__start = async (student) => {
  const host = document.getElementById('quizHost');
  host.innerHTML = '<div class="ks-frame ks-frame--beam ks-frame--seite">'
    + '<div class="ks-stage ks-stage--beam ks-stage--editor"></div></div>';
  const stage = host.querySelector('.ks-stage');
  if (!document.getElementById('kse-css')) {
    const st = document.createElement('style'); st.id = 'kse-css';
    st.textContent = window.KSEditor.CSS; document.head.appendChild(st);
  }
  const call = (fn) => Promise.resolve(window.__R[fn] || { ok: true });
  let ed = null;
  const zeichne = () => { stage.innerHTML = ed.html(); ed.bind(stage); };
  ed = window.KSEditor.create({
    call, student: !!student,
    catalogs: () => (window.__R.ks_catalogs_list || {}).catalogs || [],
    categories: () => ((window.__R.ks_catalogs_list || {}).categories || []).map(k => k.name),
    reloadCatalogs: () => Promise.resolve(), redraw: zeichne,
    toast: () => {}, confirm: () => Promise.resolve(true), errText: c => c,
    closeLabel: '← MPSkills', onClose: () => {}
  });
  window.__ed = ed;
  ed.openList();
};
</script>
</body></html>`;

function serve(root) {
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(req.url.split('?')[0]);
    const seiten = {
      '/MPSkills/__anl_presenter.html': () => raum('presenter'),
      '/MPSkills/__anl_participant.html': () => raum('participant'),
      '/MPSkills/__anl_editor.html': editorSeite
    };
    if (seiten[clean]) {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(seiten[clean]());
      return;
    }
    let file = path.join(root, clean);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); }
    catch { res.writeHead(404).end('nope'); return; }
    try {
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end('nope'); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

/* ── Erfundene Klasse ─────────────────────────────────────────── */
const NAMEN = ['Mia', 'Leon', 'Emma', 'Noah', 'Hannah', 'Elias', 'Lina', 'Paul', 'Ella', 'Ben',
               'Lea', 'Finn', 'Clara', 'Jonas', 'Ida', 'Luis', 'Marie', 'Emil', 'Sophie', 'Anton',
               'Nele', 'Jakob', 'Frieda', 'Theo'];
const kind = (n, o = {}) => Object.assign({
  participant_id: 'p' + n, seat: n, creature_id: (n * 7) % 40, skin_idx: n % 3,
  nickname: NAMEN[(n - 1) % NAMEN.length],
  score: 5200 - n * 173, rank: n, rank_change: (n % 3) - 1, delta: 300 + (n * 97) % 900,
  emote: null, correct: n % 3 !== 0, answered: true
}, o);
const klasse = (n, f) => Array.from({ length: n }, (_, i) => kind(i + 1, f ? f(i + 1) : {}));
const EMO = ['wave', 'jump', 'cheer', 'dance', null, null];

const ICH = { participant_id: 'p4', seat: 4, nickname: 'Noah', creature_id: 28, skin_idx: 1,
              score: 3880, streak: 3, rank: 4, rank_change: 2, delta: 1240, emote: null };

const jetzt = () => new Date().toISOString();
const bald = s => new Date(Date.now() + s * 1000).toISOString();

const F_AUSWAHL = {
  text: 'Welcher Planet ist der größte in unserem Sonnensystem?',
  options: ['Mars', 'Jupiter', 'Saturn', 'Erde'], time_limit: 20
};

const KATALOGE = [
  { id: 'c1', title: TITEL, subject: THEMA, visibility: 'hub', is_template: true, mine: false,
    author_name: 'MPSkills', count: 20, has_thumb: true, updated_at: '2026-10-29T08:00:00Z' },
  { id: 'c2', title: 'Bruchrechnen: Erweitern und Kürzen', subject: 'Mathematik', visibility: 'private',
    mine: true, author_name: 'Frau Berger', count: 14, has_thumb: true, updated_at: '2026-10-27T15:00:00Z' },
  { id: 'c3', title: 'Das Sonnensystem', subject: 'Physik', visibility: 'school', mine: true,
    author_name: 'Frau Berger', count: 12, has_thumb: true, updated_at: '2026-10-25T10:00:00Z' },
  { id: 'c4', title: 'Tablet-Schulung: Grundlagen', subject: THEMA, visibility: 'hub', is_template: true,
    mine: false, author_name: 'MPSkills', count: 12, has_thumb: false, updated_at: '2026-09-01T10:00:00Z' },
  { id: 'c5', title: 'Irregular Verbs – Simple Past', subject: 'Englisch', visibility: 'school', mine: false,
    author_name: 'Herr Kaya', count: 20, has_thumb: true, updated_at: '2026-10-20T10:00:00Z' },
  { id: 'c6', title: 'Zellen und ihre Bestandteile', subject: 'Biologie', visibility: 'hub', mine: false,
    author_name: 'Frau Okafor', count: 16, has_thumb: true, updated_at: '2026-10-12T10:00:00Z' },
  { id: 'c7', title: 'Kennenlern-Quiz für den ersten Schultag', subject: 'Kennenlernen & Klasse',
    visibility: 'hub', mine: false, author_name: 'Herr Weiß', count: 10, has_thumb: true,
    updated_at: '2026-08-30T10:00:00Z' }
];
const KATEGORIEN = ['Mathematik', 'Deutsch', 'Englisch', 'Biologie', 'Physik', 'Chemie', 'Informatik',
  'Geschichte', 'Geografie', 'Politik & Gesellschaft', 'Religion & Ethik', 'Musik', 'Kunst', 'Sport',
  'Allgemeinwissen', 'Spaß & Rätsel', 'Kennenlernen & Klasse', 'Tablet & Medien', 'Natur & Umwelt',
  'Alltag & Beruf', 'Andere'].map(name => ({ name }));

/* Vorschaubilder für die Karten im Katalog: schlichte Flächen, damit
   das Bild nicht nach Clipart aussieht. */
const kachel = (a, b, zeichen) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="480" height="360" fill="url(#g)"/>
    <text x="240" y="230" font-size="170" text-anchor="middle" font-family="sans-serif">${zeichen}</text></svg>`);
const THUMBS = {
  c1: kachel('#4f46e5', '#06b6d4', '❓'), c2: kachel('#f59e0b', '#ef4444', '½'),
  c3: kachel('#0f172a', '#6366f1', '🪐'), c5: kachel('#16a34a', '#84cc16', '🇬🇧'),
  c6: kachel('#0d9488', '#22c55e', '🔬'), c7: kachel('#ec4899', '#f97316', '👋')
};

const BEISPIEL_QUIZ = {
  ok: true, catalog_id: 'c3', title: 'Das Sonnensystem', subject: 'Physik', visibility: 'school',
  mine: true, thumbnail: THUMBS.c3, thumb_custom: true,
  questions: [
    { kind: 'mc', question_text: F_AUSWAHL.text, options: F_AUSWAHL.options, correct_idx: 1,
      correct_indices: [1], time_limit_sec: 20, explanation: 'Jupiter ist mehr als doppelt so schwer wie alle anderen Planeten zusammen.' },
    { kind: 'tf', question_text: 'Die Sonne ist ein Stern.', options: ['Wahr', 'Falsch'], correct_idx: 0,
      correct_indices: [0], time_limit_sec: 15, explanation: null },
    { kind: 'scale', question_text: 'Wie viele Minuten braucht das Licht von der Sonne zur Erde?',
      options: [], correct_idx: 0, correct_indices: [0], time_limit_sec: 25,
      scale: { min: 0, max: 30, target: 8.3, step: 0.1, unit: 'min' }, explanation: 'Etwa 8 Minuten und 20 Sekunden.' },
    { kind: 'bet', question_text: 'Welche Planeten haben Ringe?', options: ['Saturn', 'Mars', 'Uranus', 'Venus'],
      correct_idx: 0, correct_indices: [0, 2], time_limit_sec: 30, explanation: 'Alle vier Gasriesen haben Ringe – Saturn die auffälligsten.' }
  ]
};

/* ── Die Bilder ───────────────────────────────────────────────────
   Je Bild: Seite, Bildschirm, wie es aufgebaut wird. */
const BEAMER = { w: 1280, h: 720 };
const TABLET = { w: 1024, h: 768 };
const EDITOR = { w: 1280, h: 800 };

const BILDER = {
  beam_lobby: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'lobby', current_q_idx: 0, question_count: 20, phase_ends_at: null, server_now: jetzt(),
    catalog_id: 'c1', catalog_title: TITEL, catalog_count: 20, catalog_subject: THEMA,
    catalogs: KATALOGE, question: null, answers_dist: {}, answers_total: 0, leaderboard: [],
    players: klasse(18, n => ({ answered: false, score: 0, emote: EMO[n % EMO.length] }))
  }) },
  beam_lesen: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'question', current_q_idx: 2, question_count: 12, phase_ends_at: bald(23.5), server_now: jetzt(),
    catalog_id: 'c3', question: Object.assign({ correct_idx: null, explanation: null }, F_AUSWAHL),
    answers_dist: {}, answers_total: 0, leaderboard: [], players: klasse(24, () => ({ answered: false }))
  }) },
  beam_frage: { seite: 'presenter', schirm: BEAMER, foto: true, v: () => ({
    phase: 'question', current_q_idx: 2, question_count: 12, phase_ends_at: bald(13.4), server_now: jetzt(),
    catalog_id: 'c3', question: Object.assign({ qid: 'q-foto', has_image: true, correct_idx: null, explanation: null }, F_AUSWAHL),
    answers_dist: { 0: 2, 1: 9, 2: 3 }, answers_total: 14, leaderboard: [],
    players: klasse(24, n => ({ answered: n <= 14 }))
  }) },
  beam_reveal: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'reveal', current_q_idx: 2, question_count: 12, phase_ends_at: null, server_now: jetzt(), catalog_id: 'c3',
    question: Object.assign({}, F_AUSWAHL, { correct_idx: 1, correct_indices: [1],
      explanation: 'Jupiter ist mehr als doppelt so schwer wie alle anderen Planeten zusammen.' }),
    answers_dist: { 0: 3, 1: 15, 2: 5, 3: 1 }, answers_total: 24,
    leaderboard: [1, 2, 3, 4, 5].map(r => kind(r, { rank: r })), players: klasse(24)
  }) },
  beam_tf: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'question', current_q_idx: 3, question_count: 12, phase_ends_at: bald(9.4), server_now: jetzt(), catalog_id: 'c3',
    question: { text: 'Die Sonne ist ein Stern.', options: ['Wahr', 'Falsch'], kind: 'tf', time_limit: 15, correct_idx: null, explanation: null },
    answers_dist: {}, answers_total: 17, leaderboard: [], players: klasse(24, n => ({ answered: n <= 17 }))
  }) },
  beam_skala: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'reveal', current_q_idx: 4, question_count: 12, phase_ends_at: null, server_now: jetzt(), catalog_id: 'c3',
    question: { text: 'Wie viele Minuten braucht das Licht von der Sonne zur Erde?', options: [], kind: 'scale',
      scale: { min: 0, max: 30, step: 0.1, unit: 'min', target: 8.3 }, correct_idx: 0, time_limit: 25,
      explanation: 'Etwa 8 Minuten und 20 Sekunden.' },
    scale_values: [2, 4.5, 5, 6, 7.5, 8, 8, 8.2, 8.5, 9, 10, 10, 12, 15, 20, 7, 8.3, 9.5, 11, 6.5],
    answers_dist: {}, answers_total: 20,
    leaderboard: [1, 2, 3, 4, 5].map(r => kind(r, { rank: r })), players: klasse(20)
  }) },
  beam_wette: { seite: 'presenter', schirm: BEAMER, v: () => ({
    phase: 'reveal', current_q_idx: 5, question_count: 12, phase_ends_at: null, server_now: jetzt(), catalog_id: 'c3',
    question: { text: 'Welche Planeten haben Ringe?', options: ['Saturn', 'Mars', 'Uranus', 'Venus'], kind: 'bet',
      correct_idx: 0, correct_indices: [0, 2], time_limit: 30,
      explanation: 'Alle vier Gasriesen haben Ringe – Saturn die auffälligsten.' },
    answers_dist: { 0: 58, 1: 14, 2: 31, 3: 17 }, bet_coins: 120, answers_total: 24,
    leaderboard: [1, 2, 3, 4, 5].map(r => kind(r, { rank: r })), players: klasse(24)
  }) },
  beam_ende: { seite: 'presenter', schirm: BEAMER, warte: 15000, bewegung: true, v: () => ({
    phase: 'ended', current_q_idx: 11, question_count: 12, phase_ends_at: null, server_now: jetzt(), catalog_id: 'c3',
    question: null, answers_dist: {}, answers_total: 0,
    leaderboard: [1, 2, 3, 4, 5].map(r => kind(r, { rank: r, emote: r === 1 ? 'wave' : 'cheer' })),
    players: klasse(24, n => ({ emote: n === 1 ? 'wave' : n <= 3 ? 'cheer' : null }))
  }) },
  beam_hell: { seite: 'presenter', schirm: BEAMER, hell: true, v: () => BILDER.beam_reveal.v() },
  beam_werk: { seite: 'presenter', schirm: BEAMER, raum: { room: { settings: { mode: 'create' } } },
    r: { ks_room_drafts: { ok: true, sig: 'w1',
      people: [['Mia', 2, 1], ['Leon', 1, 1], ['Emma', 1, 0], ['Noah', 0, 0], ['Hannah', 3, 1], ['Elias', 1, 0], ['Lina', 1, 1], ['Paul', 0, 0]]
        .map(([name, drafts, sent]) => ({ name, drafts, sent })),
      sent: [
        { catalog_id: 'd1', title: 'Haustiere von Mia', count: 6, updated_at: bald(-600), mine: true },
        { catalog_id: 'd2', title: 'Fußball-Quiz von Leon', count: 8, updated_at: bald(-420), mine: true },
        { catalog_id: 'd3', title: 'Das Mittelalter von Hannah', count: 10, updated_at: bald(-120), mine: true },
        { catalog_id: 'd4', title: 'Vulkane von Lina', count: 5, updated_at: bald(-60), mine: true }
      ] } }, v: () => ({ phase: 'lobby', players: [], catalogs: KATALOGE }) },

  tab_lobby: { seite: 'participant', schirm: TABLET, v: () => ({
    phase: 'lobby', current_q_idx: 0, question_count: 20, phase_ends_at: null, server_now: jetzt(), player_count: 18,
    me: Object.assign({}, ICH, { score: 0, rank: 1 }), my_answer: null, question: null,
    neighbor_before: null, neighbor_after: null
  }) },
  tab_frage: { seite: 'participant', schirm: TABLET, v: () => ({
    phase: 'question', current_q_idx: 2, question_count: 12, phase_ends_at: bald(13.4), server_now: jetzt(),
    player_count: 24, me: ICH, my_answer: null,
    question: { text: null, options: F_AUSWAHL.options, time_limit: 20, correct_idx: null, explanation: null },
    neighbor_before: null, neighbor_after: null
  }) },
  tab_skala: { seite: 'participant', schirm: TABLET, v: () => ({
    phase: 'question', current_q_idx: 4, question_count: 12, phase_ends_at: bald(18.4), server_now: jetzt(),
    player_count: 24, me: ICH, my_answer: null,
    question: { text: null, options: [], kind: 'scale', time_limit: 25,
      scale: { min: 0, max: 30, step: 0.1, unit: 'min' }, correct_idx: null, explanation: null },
    neighbor_before: null, neighbor_after: null
  }) },
  tab_wette: { seite: 'participant', schirm: TABLET, v: () => ({
    phase: 'question', current_q_idx: 5, question_count: 12, phase_ends_at: bald(21.4), server_now: jetzt(),
    player_count: 24, me: ICH,
    my_answer: { chosen_idx: 0, bets: [3, 0, 1, 0], is_correct: null, points_awarded: null },
    question: { text: null, options: ['Saturn', 'Mars', 'Uranus', 'Venus'], kind: 'bet', time_limit: 30, correct_idx: null, explanation: null },
    neighbor_before: null, neighbor_after: null
  }) },
  tab_reveal: { seite: 'participant', schirm: TABLET, v: () => ({
    phase: 'reveal', current_q_idx: 2, question_count: 12, phase_ends_at: null, server_now: jetzt(), player_count: 24,
    me: ICH, my_answer: { chosen_idx: 1, is_correct: true, points_awarded: 1240 },
    question: Object.assign({}, F_AUSWAHL, { correct_idx: 1, explanation: 'x' }),
    neighbor_before: { creature_id: 21, skin_idx: 0, nickname: 'Emma', score: 4100, rank: 3, emote: 'cheer' },
    neighbor_after: { creature_id: 14, skin_idx: 2, nickname: 'Hannah', score: 3500, rank: 5, emote: null }
  }) },
  tab_sieg: { seite: 'participant', schirm: TABLET, warte: 16000, v: () => ({
    phase: 'ended', current_q_idx: 11, question_count: 12, phase_ends_at: null, server_now: jetzt(), player_count: 24,
    me: Object.assign({}, ICH, { rank: 1, score: 9120 }), my_answer: { chosen_idx: 0, is_correct: true, points_awarded: 1200 },
    question: null, neighbor_before: null,
    neighbor_after: { creature_id: 21, skin_idx: 0, nickname: 'Emma', score: 8700, rank: 2, emote: null }
  }) },

  ed_liste: { seite: 'editor', schirm: EDITOR },
  ed_edit: { seite: 'editor', schirm: EDITOR, klick: ['[data-ed="edit"][data-cat="c3"]'], rolle: '.kse-frage:nth-of-type(2)' },
  ed_vorschau: { seite: 'editor', schirm: EDITOR, klick: ['[data-ed="edit"][data-cat="c3"]', '[data-ed="preview"]'] },
  ed_import: { seite: 'editor', schirm: EDITOR, klick: ['[data-ed="imp-open"]', '[data-ed="imp-example"]'] },
  ed_schueler: { seite: 'editor', schirm: TABLET, student: true, klick: ['[data-ed="edit"][data-cat="e1"]'] }
};

const EDITOR_R = () => ({
  ks_catalogs_list: { ok: true, catalogs: KATALOGE, categories: KATEGORIEN },
  ks_catalog_thumbs: { ok: true, thumbs: THUMBS },
  ks_catalog_get: BEISPIEL_QUIZ,
  ks_drafts_list: { ok: true, drafts: [
    { id: 'e1', title: 'Vulkane', count: 5, updated_at: bald(-60), sent_at: null },
    { id: 'e2', title: 'Mein Lieblingsbuch', count: 3, updated_at: bald(-3000), sent_at: bald(-2800), changed: false }
  ] },
  ks_draft_get: { ok: true, draft: { id: 'e1', title: 'Vulkane', subject: 'Geografie', questions: [
    { kind: 'mc', question_text: 'Wie heißt flüssiges Gestein, das aus einem Vulkan austritt?',
      options: ['Magma', 'Lava', 'Asche', 'Basalt'], correct_idx: 1, correct_indices: [1], time_limit_sec: 20,
      explanation: 'Unter der Erde heißt es Magma, an der Oberfläche Lava.' },
    { kind: 'tf', question_text: 'Der Ätna ist der höchste aktive Vulkan Europas.', options: ['Wahr', 'Falsch'],
      correct_idx: 0, correct_indices: [0], time_limit_sec: 15, explanation: null }
  ] } }
});

/* ── Das Quiz ─────────────────────────────────────────────────────
   kind: mc | tf | scale | bet. correct: Index oder Liste. Jede Frage
   hat ein Bild (bild = Schlüssel aus BILDER). Kurz halten: die
   Antworten stehen am Beamer in vier Kacheln, die Erklärung steht in
   der Auflösung unter den Füllständen. */
const FRAGEN = [
  { kind: 'mc', bild: 'beam_frage', zeit: 25,
    q: 'Was ist Knowledge Stack?',
    a: ['Ein Live-Quiz: Fragen am Beamer, Antworten auf den Tablets', 'Ein Karteikarten-Programm zum Allein-Lernen',
        'Eine Abgabe-Box für Hausaufgaben', 'Ein Chat für die Klasse'], correct: 0,
    e: 'Die Lehrkraft öffnet in MPSkills einen Raum, die Klasse tritt per Code oder QR-Code bei. Gespielt wird gemeinsam und live.' },
  { kind: 'tf', bild: 'tab_frage', zeit: 15,
    q: 'Auf dem Tablet steht die Frage noch einmal zum Nachlesen.', correct: 1,
    e: 'Falsch: Die Frage steht nur am Beamer, das Tablet zeigt nur die farbigen Antwortfelder. So schauen alle nach vorn.' },
  { kind: 'mc', bild: 'tab_lobby', zeit: 20,
    q: 'Was machen die Schülerinnen und Schüler in der Lobby, bevor es losgeht?',
    a: ['Sie suchen sich ein Wesen aus und schicken Emotes', 'Sie beantworten schon die erste Frage',
        'Sie stellen die Zeit für jede Frage ein', 'Nichts – das Tablet bleibt schwarz'], correct: 0,
    e: 'Jedes Kind wählt sein Wesen und eine Farbe. Mit den Emotes (winken, springen, jubeln, tanzen, schlafen) bewegt es sich am Beamer.' },
  { kind: 'scale', bild: 'beam_lobby', zeit: 25,
    q: 'Wie viele verschiedene Wesen gibt es zur Auswahl?', scale: { min: 0, max: 100, target: 40, unit: 'Wesen' },
    e: 'Es sind 40 Wesen, jedes in 3 Farben. Am Beamer fallen sie auf die Wiese und laufen herum. – Das hier war übrigens eine Skala-Frage.' },
  { kind: 'mc', bild: 'beam_lesen', zeit: 20,
    q: 'Was passiert am Anfang jeder Frage, bevor die Antworten erscheinen?',
    a: ['5 Sekunden Vorlesezeit, dann erscheinen die Antworten überall gleichzeitig', 'Die Lehrkraft muss jede Antwort einzeln freigeben',
        'Die Schnellsten sehen die Antworten zuerst', 'Nichts, die Uhr läuft sofort'], correct: 0,
    e: 'Erst wird die Frage gelesen, dann decken Beamer und alle Tablets im selben Moment auf. Langsames WLAN ist kein Nachteil.' },
  { kind: 'bet', bild: 'tab_wette', zeit: 30,
    q: 'Was bringt bei einer normalen Auswahlfrage Punkte? Setze deine Münzen!',
    a: ['Richtig antworten', 'Schnell antworten', 'Mehrmals hintereinander richtig', 'Die Farbe der Antwort'], correct: [0, 1, 2],
    e: 'Richtig, schnell und eine Serie zählen. Das war eine Münzen-Frage: 5 Münzen à 200 Punkte auf die Antworten ziehen oder tippen – umsetzen geht, bis die Uhr abläuft.' },
  { kind: 'mc', bild: 'beam_reveal', zeit: 20,
    q: 'Was zeigt der Beamer nach jeder Frage (Auflösung)?',
    a: ['Wie viele was gewählt haben, die Top 5 und eine Erklärung', 'Nur die richtige Antwort',
        'Die Namen aller, die falsch lagen', 'Die Antworten jedes einzelnen Kindes'], correct: 0,
    e: 'Füllstände zeigen die Verteilung, die fünf Ersten tauschen die Plätze, darunter steht die Erklärung – so wie dieser Text.' },
  { kind: 'mc', bild: 'tab_reveal', zeit: 20,
    q: 'Was sieht ein Kind nach der Frage auf seinem Tablet?',
    a: ['Richtig oder falsch, seine Punkte und wer direkt vor und hinter ihm liegt', 'Die komplette Rangliste der Klasse',
        'Nur „Weiter“', 'Die Lösung aller Fragen'], correct: 0,
    e: 'Jedes Kind sieht seinen Platz zwischen dem Nachbarn davor und dahinter. Wer falsch lag, dessen Wesen ist kurz traurig.' },
  { kind: 'tf', bild: 'beam_tf', zeit: 15,
    q: 'Es gibt auch Wahr/Falsch-Fragen – so wie diese hier.', correct: 0,
    e: 'Wahr. Die Knöpfe heißen „Wahr“ und „Falsch“, lassen sich aber umbenennen (z. B. Ja/Nein).' },
  { kind: 'tf', bild: 'beam_skala', zeit: 15,
    q: 'Bei einer Skala-Frage bekommt nur Punkte, wer die Zahl genau trifft.', correct: 1,
    e: 'Falsch. Genau getroffen gibt 1000 Punkte, je weiter weg, desto weniger. Erst ab 30 % der Spanne daneben gibt es 0.' },
  { kind: 'mc', bild: 'beam_wette', zeit: 20,
    q: 'Bei einer Münzen-Frage dürfen mehrere Antworten richtig sein. Was zählt der Beamer in der Auflösung?',
    a: ['Die gesetzten Münzen je Antwort', 'Die Köpfe je Antwort', 'Nur die Zeit', 'Gar nichts'], correct: 0,
    e: 'Bei Münzen zählen die Füllstände Münzen statt Köpfe. Jede Münze auf einer richtigen Antwort bringt 200 Punkte.' },
  { kind: 'mc', bild: 'beam_ende', zeit: 20,
    q: 'Wie endet ein Quiz?',
    a: ['Siegerehrung: Platz 3, 2 und mit Trommelwirbel Platz 1 springen aufs Treppchen', 'Der Beamer wird einfach schwarz',
        'Alle bekommen eine Note', 'Die Punkte werden per Mail verschickt'], correct: 0,
    e: 'Danach gibt es Konfetti, alle klatschen. „↺ Nochmal“ startet dasselbe Quiz von vorn.' },
  { kind: 'tf', bild: 'tab_sieg', zeit: 15,
    q: 'Wer angemeldet mitspielt, kann sein Quiz-Wesen danach als Profilbild bekommen.', correct: 0,
    e: 'Wahr. Wer mindestens eine Antwort gegeben hat, schaltet sein Wesen als Profilbild frei. Platz 1 bekommt zusätzlich die Gold-Fassung.' },
  { kind: 'mc', bild: 'ed_liste', zeit: 20,
    q: 'Wo schreibt man ein Quiz, ohne dafür einen Raum zu öffnen?',
    a: ['Im „Quiz-Editor“ auf der Knowledge-Stack-Kachel', 'Nur im Raum während des Spiels',
        'In einer Word-Datei, die man hochlädt', 'Das geht nur über den Admin'], correct: 0,
    e: 'Der Quiz-Editor öffnet den Katalog: eigene Quizze, die der Schule und alle geteilten, mit Suche und Filtern nach Themenfeld.' },
  { kind: 'mc', bild: 'ed_edit', zeit: 25,
    q: 'Welche Fragetypen bietet der Editor an?',
    a: ['Auswahl, Wahr/Falsch, Skala und Münzen setzen', 'Nur Auswahl mit vier Antworten',
        'Nur Freitext', 'Auswahl und Lückentext'], correct: 0,
    e: 'Der Typ wird je Frage über der Frage gewählt. Bei der Auswahl dürfen auch mehrere Antworten richtig sein, die Zeit je Frage ist einstellbar.' },
  { kind: 'tf', bild: 'ed_vorschau', zeit: 15,
    q: 'Ein Foto an einer Frage sehen auch die Kinder auf ihren Tablets.', correct: 1,
    e: 'Falsch – Fotos stehen nur am Beamer zwischen Frage und Antworten. Die Vorschau im Editor zeigt, wie es dort aussieht.' },
  { kind: 'mc', bild: 'ed_import', zeit: 25,
    q: 'Deine Fragen stehen schon in einem Dokument. Wie kommen sie am schnellsten ins Quiz?',
    a: ['„📋 Aus Text“: einfügen, der Editor erkennt Fragen und Antworten', 'Jede Frage einzeln abtippen',
        'Als Foto hochladen', 'Gar nicht'], correct: 0,
    e: 'Richtige Antworten mit * oder „(richtig)“ markieren. Auch „Skala: 0 - 100“ und „Münzen“ werden erkannt.' },
  { kind: 'mc', bild: 'ed_liste', zeit: 20,
    q: 'Wer sieht ein Quiz mit dem Status „🏫 Schule“?',
    a: ['Alle freigeschalteten Lehrkräfte deiner Schule', 'Nur du', 'Alle Schülerinnen und Schüler', 'Jeder im Internet'], correct: 0,
    e: '🔒 Privat = nur du, 🏫 Schule = Lehrkräfte deiner Schule, 🌍 Hub = alle Lehrkräfte. Fremde Quizze öffnest du mit „⧉ Kopie“ als eigenes.' },
  { kind: 'mc', bild: 'ed_schueler', zeit: 25,
    q: 'Wofür ist der Raum-Modus „gemeinsam erstellen“?',
    a: ['Die Klasse schreibt eigene Quizze und sendet sie an die Lehrkraft', 'Zwei Lehrkräfte spielen gegeneinander',
        'Das Quiz läuft ohne Beamer', 'Die Klasse bewertet die Fragen'], correct: 0,
    e: 'Die Tablets bekommen den Editor, Entwürfe sichern sich von selbst. „✉️ An Lehrkraft senden“ legt das Quiz privat in deinen Katalog.' },
  { kind: 'mc', bild: 'beam_hell', zeit: 20,
    q: 'Der Beamer ist im hellen Raum schlecht zu lesen. Was hilft?',
    a: ['Oben hell/dunkel umschalten – das gilt nur für dieses Gerät', 'Das Quiz neu anlegen',
        'Alle Tablets umstellen', 'Geht nicht'], correct: 0,
    e: 'Jedes Gerät hat seine eigene Einstellung. Fertig! Mit „↺ Nochmal“ geht es von vorn – viel Spaß beim eigenen Quiz.' }
];

/* ── Fotografieren ─────────────────────────────────────────────── */
async function ruhe(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(a => { try { return a.effect.getComputedTiming().iterations !== Infinity; } catch (e) { return false; } })
      .map(a => a.finished.catch(() => {}))
  ));
  await page.waitForTimeout(250);
}

/* PNG → verkleinertes JPEG, im Browser (kein sharp nötig). */
async function alsJpeg(page, png, breite) {
  return page.evaluate(async ({ b64, breite, quali }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const s = Math.min(1, breite / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quali);
  }, { b64: png.toString('base64'), breite, quali: QUALI });
}

const server = await serve(ROOT);
const port = server.address().port;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
fs.mkdirSync(SHOTS, { recursive: true });

// Das Foto am Beamer (Frage mit Foto): das MPSkills-Logo.
const FOTO = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'LogoMPSkills.png')).toString('base64');

const fertig = {};
for (const [name, b] of Object.entries(BILDER)) {
  const ctx = await browser.newContext({
    viewport: { width: b.schirm.w, height: b.schirm.h }, deviceScaleFactor: 2,
    hasTouch: b.seite === 'participant', reducedMotion: b.bewegung ? 'no-preference' : 'reduce',
    colorScheme: b.hell ? 'light' : 'dark'
  });
  const page = await ctx.newPage();
  const kaputt = [];
  page.on('pageerror', e => kaputt.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/MPSkills/__anl_${b.seite}.html`, { waitUntil: 'load' });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), b.hell ? 'light' : 'dark');

  if (b.seite === 'editor') {
    await page.evaluate(r => { window.__R = r; }, EDITOR_R());
    await page.evaluate(s => window.__start(s), !!b.student);
    await page.waitForTimeout(300);
    for (const sel of b.klick || []) {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      await page.waitForTimeout(400);
    }
    // Nach dem Umschalten bleibt die Seite sonst irgendwo stehen.
    await page.evaluate(sel => {
      const z = sel && document.querySelector(sel);
      window.scrollTo(0, z ? z.getBoundingClientRect().top + window.scrollY - 12 : 0);
    }, b.rolle || null);
    await page.waitForTimeout(200);
  } else {
    const r = Object.assign({}, b.r || {});
    if (b.foto) r.ks_room_image = { ok: true, qid: 'q-foto', image: FOTO };
    await page.evaluate(({ v, r }) => { window.__V = v; window.__R = r; }, { v: b.v(), r });
    await page.evaluate(raum => window.__mount(raum), b.raum || null);
    await page.waitForSelector('.ks-stage > :not(.ks-booting)', { timeout: 8000 }).catch(() => {});
    await ruhe(page);
  }
  if (b.warte) await page.waitForTimeout(b.warte);
  await page.waitForTimeout(300);

  if (kaputt.length) console.log('  ! ' + name + ': ' + kaputt.join(' | '));
  const png = await page.screenshot({ type: 'png' });
  const jpg = await alsJpeg(page, png, BREITE);
  fs.writeFileSync(path.join(SHOTS, name + '.jpg'), Buffer.from(jpg.split(',')[1], 'base64'));
  fertig[name] = jpg;
  if (name === 'beam_reveal') fertig.__thumb = await alsJpeg(page, png, 480);
  console.log(`ok  ${name.padEnd(12)} ${Math.round(jpg.length / 1024)} KB`);
  await ctx.close();
}
await browser.close();
server.close();

if (NUR_BILDER) process.exit(0);

/* ── Die Migration ─────────────────────────────────────────────── */
const sql = s => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const json = v => `${sql(JSON.stringify(v))}::jsonb`;

// Vorschaubild 4:3 (480 × 360) aus der Auflösung, mittig zugeschnitten.
const thumbBrowser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const tp = await thumbBrowser.newPage();
const thumb = await tp.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = 480; c.height = 360;
  const h = img.naturalHeight, w = h * 4 / 3, x = (img.naturalWidth - w) / 2;
  c.getContext('2d').drawImage(img, x, 0, w, h, 0, 0, 480, 360);
  return c.toDataURL('image/jpeg', 0.75);
}, fertig.beam_reveal);
await thumbBrowser.close();

const zeilen = FRAGEN.map((f, i) => {
  const ci = Array.isArray(f.correct) ? f.correct : [f.correct || 0];
  const options = f.kind === 'scale' ? [] : f.kind === 'tf' ? ['Wahr', 'Falsch'] : f.a;
  const scale = f.kind === 'scale'
    ? { min: f.scale.min, max: f.scale.max, target: f.scale.target, step: f.scale.step || 1, unit: f.scale.unit || '' } : null;
  if (f.kind !== 'scale' && ci.some(x => x >= options.length)) throw new Error('Frage ' + (i + 1) + ': richtige Antwort fehlt');
  if (!fertig[f.bild]) throw new Error('Frage ' + (i + 1) + ': Bild ' + f.bild + ' fehlt');
  return `(${sql(CATALOG_ID)}, ${i}, ${sql(f.kind)}, ${sql(f.q)},
 ${json(options)}, ${f.kind === 'scale' ? 0 : ci[0]}, array[${f.kind === 'scale' ? 0 : ci.join(', ')}]::smallint[],
 ${f.zeit || 20}, ${sql(f.e)}, ${scale ? json(scale) : 'null'},
 ${sql(f.bild + '.jpg')}, ${sql(fertig[f.bild])})`;
});

const out = `-- ══════════════════════════════════════════════════════════════
-- Migration 0238 — Knowledge Stack: das Erklär-Quiz
-- ══════════════════════════════════════════════════════════════
--
-- „${TITEL}“ — ${FRAGEN.length} Fragen, die alle
-- Funktionen zeigen: Raum und Lobby, Wesen und Emotes, Vorlesezeit,
-- Auflösung, Siegerehrung, Profilbild, die vier Fragetypen (die im
-- Quiz selbst vorkommen), Editor, Text-Import, Status im Katalog,
-- Raum-Modus „gemeinsam erstellen“, hell/dunkel. Jede Frage hat als
-- Foto ein Bildschirmfoto der echten Oberfläche.
--
-- Eine Vorlage (is_template, visibility 'hub'): sichtbar für jede
-- freigeschaltete Lehrkraft (ks_catalog_can_see), niemandem gehörend,
-- bearbeitet wird sie nur hier. „⧉ Kopie“ im Katalog legt eine eigene an.
--
-- ERZEUGT von MPSkills/tools/KnowledgeStack/tools/anleitung.mjs — nicht
-- von Hand ändern, sondern dort und neu laufen lassen.
-- Braucht 0186 (Fotos), 0194 (Katalog), 0217 (Fragetypen).
-- Idempotent: on conflict, die Fragen werden ersetzt.
-- ══════════════════════════════════════════════════════════════

insert into ks_catalogs (id, owner_id, school_id, title, subject, is_template,
                         visibility, thumbnail, thumb_custom, updated_at)
values (${sql(CATALOG_ID)}, null, null, ${sql(TITEL)}, ${sql(THEMA)}, true,
        'hub', ${sql(thumb)}, true, now())
on conflict (id) do update set
  title        = excluded.title,
  subject      = excluded.subject,
  is_template  = true,
  visibility   = 'hub',
  thumbnail    = excluded.thumbnail,
  thumb_custom = true,
  updated_at   = now();

delete from ks_questions where catalog_id = ${sql(CATALOG_ID)};

insert into ks_questions (catalog_id, sort_order, kind, question_text,
                          options, correct_idx, correct_indices,
                          time_limit_sec, explanation, scale,
                          image_name, image) values
${zeilen.join(',\n\n')};
`;
fs.writeFileSync(MIGRATION, out);
console.log(`\n${path.relative(ROOT, MIGRATION)}: ${Math.round(out.length / 1024)} KB, ${FRAGEN.length} Fragen`);
