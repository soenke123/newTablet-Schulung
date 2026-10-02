/**
 * Passt-auf-einen-Bildschirm-Prüfstand für Knowledge Stack.
 *
 * Der uitest.js daneben prüft, WAS im Bild steht. Dieser hier prüft,
 * ob es HINEINPASST — und das kann nur ein echter Browser sagen: die
 * Höhe des Rahmens wird gemessen (fit() in tool.js), die Schriften
 * rechnen aus clamp(), und beides gibt es in linkedom nicht.
 *
 * Gemessen wird in echtem Chromium bei den Größen, die in der Schule
 * vorkommen, für beide Rollen und alle vier Bilder:
 *
 *   1. Die Seite läuft nicht waagerecht über.
 *   2. Der Rahmen endet an der unteren Bildschirmkante — nicht
 *      darunter (dann fehlt etwas) und nicht weit darüber (dann ist
 *      Fläche verschenkt).
 *   3. NICHTS im Bild ragt aus dem Rahmen. Ausgenommen sind die zwei
 *      Kästen, die scrollen DÜRFEN: die Wesenwand am Beamer und die
 *      Wesenwahl auf dem Tablet.
 *   4. Die Bühne selbst scrollt nicht (scrollHeight == clientHeight).
 *      Das ist der Punkt, an dem die erste Fassung scheiterte: dort
 *      stand `min-height: 100vh`, und über dem Werkzeug stehen
 *      Kopfzeile und Reiterleiste — die Bühne war damit immer um
 *      deren Höhe zu hoch.
 *   5. Tippflächen ≥ 44 px (Fingermaß).
 *   6. Schriftgrößen über der Lesbarkeitsgrenze.
 *
 * Die Seite drumherum wird NICHT erfunden: Kopfzeile und
 * Reiterleiste stehen hier genauso wie in lehrer.html/j.html, mit
 * demselben style.css. Ohne sie wäre die gemessene Höhe zu groß und
 * der Prüfstand grün, wo der Beamer rot ist.
 *
 * ⚠️ `pointer: coarse` schaltet Playwright mit `hasTouch` NICHT frei
 * (feedback_pointer_coarse_needs_cdp). Dieses tool.css hat dort auch
 * keine eigenen Maße — die Mindesthöhen gelten unbedingt. Käme das
 * einmal dazu, muss die Umschaltung über CDP kommen.
 *
 * Aufruf:  node MPSkills/tools/KnowledgeStack/tools/fitcheck.js
 *          … fitcheck.js --shots     zusätzlich Bilder nach shots/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');          // Repo-Wurzel
const SHOTS = path.join(HERE, 'shots');
const EXE = process.env.CHROME || 'C:/Users/snke/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const MIT_BILDERN = process.argv.includes('--shots');

let fails = 0;
const ok = (label, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`);
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'
};

/* ── Die Seite drumherum ───────────────────────────────────────
   Kopfzeile und Reiterleiste wörtlich wie in lehrer.html (Pult) und
   j.html (Tablet) — darum geht es hier: um die Höhe, die ÜBER dem
   Werkzeug schon vergeben ist.                                    */
const seite = (role) => `<!doctype html>
<html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fit-Prüfstand</title>
<link rel="stylesheet" href="style.css">
<script src="../viewport.js"></script>
</head>
<body class="${role === 'presenter' ? 'roomview beamer pane-tool' : 'roomview'}">

<header class="topbar">
  <a class="wordmark" href="#"><span class="wordmark-text">MP<span>Skills</span></span></a>
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
      <code class="rtabs-code">ABCDEF</code>
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

<footer class="foot" id="pagefoot"><a href="#">MPSkills</a></footer>

<script src="lib/tool.js"></script>
<script>
/* Der Kontext, den lib/tool.js sonst aus lehrer.js bzw. j.js
   bekommt. Die Durchreiche antwortet aus window.__V — der Prüfstand
   setzt es je Bild, bevor er montiert. */
window.__RUFE = [];
window.__ctx = {
  role: '${role}', preview: false, title: 'Testraum',
  esc: s => String(s == null ? '' : s),
  errText: c => 'Fehler: ' + c,
  toast: () => {}, confirm: () => Promise.resolve(true), refresh: () => {},
  actions: {
    role: '${role}',
    call: (fn, args) => {
      window.__RUFE.push(fn);
      if (fn === 'ks_sig' || fn === 'ks_room_sig') return Promise.resolve({ ok: true, sig: 'fest' });
      if (fn === 'ks_view' || fn === 'ks_room_get')
        return Promise.resolve(Object.assign({ ok: true }, window.__V));
      if (fn === 'ks_room_image')
        return Promise.resolve({ ok: true, qid: 'q-foto', image: 'data:image/svg+xml;utf8,'
          + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">'
          + '<rect width="1600" height="1000" fill="#3b82f6"/><circle cx="800" cy="500" r="300" fill="#facc15"/></svg>') });
      return Promise.resolve({ ok: true });
    }
  }
};
window.__mount = async () => {
  const impl = await window.MPTool.load('knowledgestack', 'KnowledgeStack');
  window.__impl = impl;
  await impl.mount(document.getElementById('host'), window.__ctx);
};
</script>
</body></html>`;

function serve(root) {
  const server = http.createServer((req, res) => {
    const clean = decodeURIComponent(req.url.split('?')[0]);
    if (clean === '/MPSkills/__fit_presenter.html' || clean === '/MPSkills/__fit_participant.html') {
      const role = clean.includes('presenter') ? 'presenter' : 'participant';
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(seite(role));
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

/* ── Bildschirmgrößen ─────────────────────────────────────────
   Dieselben Zahlen wie in responsivecheck.js, plus die zwei
   Beamer-Formate. Der Beamer läuft in der Schule auf 1024×768 —
   deshalb steht das hier und nicht nur „laptop".                 */
const SCHIRME = [
  { name: 'iphone-se-hoch',  w: 375,  h: 667,  touch: true,  rollen: ['participant'] },
  { name: 'iphone-14-hoch',  w: 390,  h: 844,  touch: true,  rollen: ['participant'] },
  { name: 'iphone-14-quer',  w: 844,  h: 390,  touch: true,  rollen: ['participant'] },
  { name: 'ipad-splitview',  w: 507,  h: 1024, touch: true,  rollen: ['participant'] },
  { name: 'ipad-mini-hoch',  w: 744,  h: 1133, touch: true,  rollen: ['participant'] },
  { name: 'ipad-hoch',       w: 768,  h: 1024, touch: true,  rollen: ['participant'] },
  { name: 'ipad-quer',       w: 1024, h: 768,  touch: true,  rollen: ['participant', 'presenter'] },
  { name: 'beamer-xga',      w: 1024, h: 768,  touch: false, rollen: ['presenter'] },
  { name: 'beamer-720',      w: 1280, h: 720,  touch: false, rollen: ['presenter'] },
  { name: 'beamer-1080',     w: 1920, h: 1080, touch: false, rollen: ['presenter'] },
  { name: 'laptop',          w: 1280, h: 800,  touch: false, rollen: ['presenter'] }
];

/* ── Die Bilder ───────────────────────────────────────────────── */
const OPTS = [
  'Nachname_Vorname_Klasse_Fach_Aufgabe.pdf',
  'Ein Arbeitsgerät und kein Freizeitgerät',
  'Ein Spielgerät',
  'Ein Ersatz für Papier und Stift im Unterricht'
];
const FRAGE = 'Wie lautet das Standard-Namensformat für Abgaben, und warum ist es so festgelegt?';

const spieler = (n, o = {}) => Object.assign({
  participant_id: 'p' + n, seat: n, creature_id: (n * 5) % 36, skin_idx: n % 3,
  nickname: ['Maximiliane', 'Bo', 'Jonas-Frederik', 'Mia', 'Lea', 'Ahmet', 'Luca', 'Emilia'][n % 8],
  score: 4200 - n * 137, rank: n, rank_change: (n % 3) - 1, delta: n * 90,
  emote: n % 4 === 0 ? 'wave' : null, correct: n % 3 !== 0, answered: true
}, o);

const ME = {
  participant_id: 'p3', seat: 3, nickname: 'Jonas-Frederik', creature_id: 7, skin_idx: 1,
  score: 3620, streak: 3, rank: 4, rank_change: 2, delta: 1220, emote: null
};

const BILDER = {
  presenter: {
    // 28 Kinder: eine echte Klasse, und der Fall, in dem die Wand
    // überläuft, wenn die Spaltenbreite eine geratene Zahl wäre.
    lobby: () => ({
      phase: 'lobby', current_q_idx: 0, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), catalog_id: 'k1',
      catalog_title: 'Tablet-Schulung: Grundlagen',
      catalogs: [{ id: 'k1', title: 'Tablet-Schulung: Grundlagen', count: 12, mine: false },
                 { id: 'k2', title: 'Bruchrechnen Klasse 6 — Erweitern und Kürzen', count: 18, mine: true }],
      question: null, answers_dist: {}, answers_total: 0, leaderboard: [],
      players: Array.from({ length: 28 }, (_, i) => spieler(i + 1, { answered: false, score: 0 }))
    }),
    /* EIN Kind. Der Fall, der am 26.09.2026 gemeldet wurde: „der
       eine Avatar war viel zu groß". `auto-fit` wirft leere Spalten
       weg, `1fr` gab der letzten die ganze Breite, und die Karte
       darunter ist ein Quadrat — also stand am Beamer ein 700
       Punkte hohes Wesen. Die Prüfung dazu steht unten
       (`karte`): eine Karte ist eine Karte, egal wie viele es
       sind. */
    lobby1: () => ({
      phase: 'lobby', current_q_idx: 0, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), catalog_id: 'k1',
      catalog_title: 'Tablet-Schulung: Grundlagen',
      catalogs: [{ id: 'k1', title: 'Tablet-Schulung: Grundlagen', count: 12, mine: false }],
      question: null, answers_dist: {}, answers_total: 0, leaderboard: [],
      players: [spieler(1, { answered: false, score: 0, emote: 'jump' })]
    }),
    question: () => ({
      phase: 'question', current_q_idx: 4, question_count: 12,
      phase_ends_at: new Date(Date.now() + 14000).toISOString(),
      server_now: new Date().toISOString(), catalog_id: 'k1', catalogs: null,
      question: { text: FRAGE, options: OPTS, correct_idx: null, explanation: null, time_limit: 20 },
      answers_dist: { 0: 4, 1: 9 }, answers_total: 13, leaderboard: [],
      players: Array.from({ length: 28 }, (_, i) => spieler(i + 1, { answered: i < 13 }))
    }),
    /* Eine Frage MIT Foto (0186): das Foto steht zwischen Frage und
       Kacheln und darf die Kacheln nicht unter das Fingermaß drücken
       und nichts aus dem Rahmen schieben. */
    foto: () => ({
      phase: 'question', current_q_idx: 4, question_count: 12,
      phase_ends_at: new Date(Date.now() + 14000).toISOString(),
      server_now: new Date().toISOString(), catalog_id: 'k1', catalogs: null,
      question: { qid: 'q-foto', has_image: true, text: FRAGE, options: OPTS,
                  correct_idx: null, explanation: null, time_limit: 20 },
      answers_dist: { 0: 4, 1: 9 }, answers_total: 13, leaderboard: [],
      players: Array.from({ length: 28 }, (_, i) => spieler(i + 1, { answered: i < 13 }))
    }),
    reveal: () => ({
      phase: 'reveal', current_q_idx: 4, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), catalog_id: 'k1', catalogs: null,
      question: {
        text: FRAGE, options: OPTS, correct_idx: 0, time_limit: 20,
        explanation: 'Nachname_Vorname_Klasse_Fach_Aufgabe.pdf — das erleichtert Lehrkräften '
                   + 'die Zuordnung, wenn 28 Abgaben in einem Ordner liegen. (Kapitel 4)'
      },
      answers_dist: { 0: 14, 1: 6, 2: 2, 3: 6 }, answers_total: 28,
      leaderboard: [1, 2, 3, 4, 5].map(r => spieler(r, { rank: r })),
      players: Array.from({ length: 28 }, (_, i) => spieler(i + 1))
    }),
    ended: () => ({
      phase: 'ended', current_q_idx: 11, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), catalog_id: 'k1', catalogs: null,
      question: null, answers_dist: {}, answers_total: 0,
      leaderboard: [1, 2, 3, 4, 5].map(r => spieler(r, { rank: r, emote: 'cheer' })),
      players: Array.from({ length: 28 }, (_, i) => spieler(i + 1, { emote: 'dance' }))
    })
  },
  participant: {
    lobby: () => ({
      phase: 'lobby', current_q_idx: 0, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), player_count: 28,
      me: Object.assign({}, ME, { score: 0, rank: 1 }),
      my_answer: null, question: null, neighbor_before: null, neighbor_after: null
    }),
    question: () => ({
      phase: 'question', current_q_idx: 4, question_count: 12,
      phase_ends_at: new Date(Date.now() + 14000).toISOString(),
      server_now: new Date().toISOString(), player_count: 28, me: ME,
      my_answer: null,
      question: { text: null, options: OPTS, time_limit: 20, correct_idx: null, explanation: null },
      neighbor_before: null, neighbor_after: null
    }),
    reveal: () => ({
      phase: 'reveal', current_q_idx: 4, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), player_count: 28, me: ME,
      my_answer: { chosen_idx: 0, is_correct: true, points_awarded: 1220 },
      question: { text: FRAGE, options: OPTS, time_limit: 20, correct_idx: 0, explanation: 'x' },
      neighbor_before: { creature_id: 31, skin_idx: 0, nickname: 'Maximiliane', score: 3900, rank: 3, emote: 'cheer' },
      neighbor_after:  { creature_id: 19, skin_idx: 2, nickname: 'Bo', score: 3100, rank: 5, emote: null }
    }),
    ended: () => ({
      phase: 'ended', current_q_idx: 11, question_count: 12, phase_ends_at: null,
      server_now: new Date().toISOString(), player_count: 28, me: ME,
      my_answer: { chosen_idx: 0, is_correct: true, points_awarded: 1220 },
      question: null,
      neighbor_before: { creature_id: 31, skin_idx: 0, nickname: 'Maximiliane', score: 3900, rank: 3, emote: null },
      neighbor_after:  { creature_id: 19, skin_idx: 2, nickname: 'Bo', score: 3100, rank: 5, emote: null }
    })
  }
};

/* ── Die Messung, im Browser ───────────────────────────────────── */
function messe(touch) {
  const de = document.documentElement;
  const frame = document.querySelector('.ks-frame');
  const stage = document.querySelector('.ks-stage');
  if (!frame || !stage) return { fehlt: true };

  const label = el => {
    const cls = (typeof el.className === 'string' && el.className)
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  };
  const sichtbar = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };

  const fr = frame.getBoundingClientRect();

  /* Wer ragt aus dem Rahmen? Zwei Kästen dürfen scrollen und damit
     Kinder außerhalb ihres eigenen Fensters haben — die werden
     übersprungen, ihr Kasten selbst aber gemessen. */
  const scroller = Array.from(document.querySelectorAll('.ks-wall, .ks-picker'));
  const raus = [];
  for (const el of stage.querySelectorAll('*')) {
    if (el.tagName.toLowerCase() === 'svg' || el.closest('svg')) continue;
    if (scroller.some(s => s !== el && s.contains(el))) continue;
    if (!sichtbar(el)) continue;
    const r = el.getBoundingClientRect();
    const unten = Math.round(r.bottom - fr.bottom);
    const rechts = Math.round(r.right - fr.right);
    if (unten <= 1 && rechts <= 1) continue;
    if (raus.some(o => o.el.contains(el))) continue;
    raus.push({ el, sel: label(el), unten: Math.max(0, unten), rechts: Math.max(0, rechts) });
  }

  /* Tippflächen. Die Wesenwahl ist ein Raster aus 36 Feldern — dort
     gilt dieselbe Grenze, deshalb steht sie mit in der Liste. */
  const klein = [];
  if (touch) {
    for (const el of document.querySelectorAll(
      '.ks-k, .ks-emo, .ks-skin, .ks-pick, .ks-go, .ks-now, .ks-fertig, .ks-wechsel')) {
      if (!sichtbar(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) {
        klein.push(label(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
      }
    }
  }

  /* Schriftgrößen. Zwei Klassen: was gelesen werden MUSS (Frage,
     Antworten, Punkte) und was nur begleitet (Namen im Raster). */
  const gross = { '.ks-q': 20, '.ks-kt': 13, '.ks-kn': 14, '.ks-inr': 14, '.ks-ipkt': 12,
                  '.ks-urteil': 14, '.ks-clock': 15, '.ks-spkt': 10, '.ks-sname': 9,
                  '.ks-kname': 9, '.ks-nname': 9 };
  const zuKlein = [];
  for (const [sel, min] of Object.entries(gross)) {
    for (const el of document.querySelectorAll(sel)) {
      if (!sichtbar(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < min - 0.01) zuKlein.push(sel + ' ' + fs.toFixed(1) + 'px < ' + min);
      break;   // einer je Klasse reicht — sie tragen dieselbe Regel
    }
  }

  /* Die größte Wesen-Karte und ihr Abstand zum Boden der Wand.
     Beides gehört zusammen: die Karte darf nicht wachsen, nur weil
     sie allein dasteht, und die Klasse steht UNTEN in der Wand und
     schwebt nicht in der Mitte. */
  let karte = null;
  const wand = document.querySelector('.ks-wall');
  const karten = Array.from(document.querySelectorAll('.ks-karte')).filter(sichtbar);
  if (wand && karten.length) {
    const w = wand.getBoundingClientRect();
    const boxen = karten.map(k => k.getBoundingClientRect());
    karte = {
      n: karten.length,
      breit: Math.round(Math.max(...boxen.map(b => b.width))),
      hoch: Math.round(Math.max(...boxen.map(b => b.height))),
      // Abstand der untersten Karte zum unteren Rand der Wand.
      boden: Math.round(w.bottom - Math.max(...boxen.map(b => b.bottom)))
    };
  }

  return {
    seitenUeberlauf: de.scrollWidth - de.clientWidth,
    rahmenUnten: Math.round(fr.bottom - window.innerHeight),
    rahmenHoehe: Math.round(fr.height),
    buehneUeber: Math.round(stage.scrollHeight - stage.clientHeight),
    raus: raus.map(r => r.sel + (r.unten ? ' unten+' + r.unten : '') + (r.rechts ? ' rechts+' + r.rechts : '')),
    klein, zuKlein, karte,
    wandScrollt: Math.round((document.querySelector('.ks-wall')?.scrollHeight || 0)
               - (document.querySelector('.ks-wall')?.clientHeight || 0))
  };
}

/* ── Kontrast, in beiden Fassungen ─────────────────────────────
   Hell/dunkel ist keine Frage der Größe, sondern der Lesbarkeit —
   und die kann nur der Browser beantworten, weil erst er die
   Variablen auflöst und durchsichtige Flächen übereinanderlegt.

   Gemessen wird nach WCAG: die Schriftfarbe gegen die Fläche, auf
   der sie WIRKLICH liegt. Dafür wird nach oben gelaufen, bis eine
   Fläche deckend ist, und alles Durchsichtige darüber
   daraufgerechnet. Ohne das käme bei jedem zweiten Element
   „rgba(0,0,0,0) gegen Weiß" heraus — also immer grün.          */
function messeKontrast() {
  const zahlen = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
  };
  const ueber = (vorn, hinten) => {
    const a = vorn[3] === undefined ? 1 : vorn[3];
    return [0, 1, 2].map(i => vorn[i] * a + hinten[i] * (1 - a));
  };
  /* Die Durchsichtigkeit ÜBER dem Element zählt mit. Das ist keine
     Feinheit: die falschen Antworten in der Auflösung stehen auf
     `opacity: .62`, und was im Dunkeln dunkler wird, wird im Hellen
     blasser — dieselbe Zahl, das andere Ergebnis. Ohne diese Zeile
     misst der Prüfstand Farben, die so nie auf dem Schirm sind. */
  const durchsicht = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity;
    return o;
  };
  const flaeche = (el) => {
    const stapel = [];
    for (let n = el; n; n = n.parentElement) {
      const c = zahlen(getComputedStyle(n).backgroundColor);
      if (c.length < 3) continue;
      if (c[3] === 0) continue;
      c[3] = (c[3] === undefined ? 1 : c[3]) * durchsicht(n);
      stapel.push(c);
      if (c[3] >= 1) break;
    }
    let unten = [255, 255, 255];
    for (let i = stapel.length - 1; i >= 0; i--) unten = ueber(stapel[i], unten);
    return unten;
  };

  const ziele = ['.ks-q', '.ks-kt', '.ks-clock', '.ks-sname', '.ks-spkt', '.ks-kname',
                 '.ks-kpkt', '.ks-tname', '.ks-trang', '.ks-qnr', '.ks-qsmall', '.ks-expl',
                 '.ks-twarte', '.ks-leer', '.ks-antz', '.ks-nname', '.ks-iname', '.ks-inr',
                 '.ks-wname', '.ks-skin', '.ks-pick', '.ks-urteil', '.ks-catwrap',
                 // Die abgeblendeten Kacheln: in der Auflösung wird
                 // über sie geredet, also müssen sie lesbar bleiben.
                 '.ks-k.is-blass .ks-kt', '.ks-k.is-blass .ks-kn', '.ks-k.is-still .ks-kt',
                 '.ks-nb .ks-nname', '.ks-nb .ks-npkt'];
  const schwach = [];
  for (const sel of ziele) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < .5 || r.height < .5) continue;
    const farbe = zahlen(s.color);
    farbe[3] = (farbe[3] === undefined ? 1 : farbe[3]) * durchsicht(el);
    const vorn = ueber(farbe, flaeche(el));
    const a = lum(vorn), b = lum(flaeche(el));
    const v = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    // 3.0 für große/fette Schrift (ab 24 px), sonst 4.5 — die
    // Grenzen aus WCAG AA. Das Zeichen in den Emote-Knöpfen ist ein
    // Bild und steht nicht in der Liste.
    const grenze = parseFloat(s.fontSize) >= 24 ? 3 : 4.5;
    if (v < grenze) {
      schwach.push(sel + ' ' + v.toFixed(2) + ' < ' + grenze
        + ' (' + s.color + ' auf rgb(' + flaeche(el).map(Math.round) + ')'
        + ', Deckung ' + durchsicht(el).toFixed(2) + ')');
    }
  }
  const rahmen = document.querySelector('.ks-frame');
  return { schwach, grund: Math.round(lum(flaeche(rahmen)) * 100) / 100 };
}

/* Warten, bis das Bild steht — und zwar auf die Bewegungen selbst
   und nicht auf eine Zahl. Eine feste Wartezeit war hier zweimal
   falsch: die Karten kommen mit `ks-rein` herein (0,32 s, mit
   Überschwingen über 1,0), und wer mittendrin misst, misst einmal
   121 px, wo 118 stehen, und einmal eine halb durchsichtige Karte —
   was dann als „schwacher Kontrast" gemeldet wird, obwohl die Farbe
   stimmt. Mit 160 ms war es immer falsch, mit 400 ms nur manchmal,
   und „manchmal rot" ist das Schlimmste, was ein Prüfstand sein
   kann.

   Gewartet wird auf die Bewegungen, die ein ENDE haben. Die Wesen
   atmen, winken und springen endlos — auf die zu warten, hieße
   ewig. */
async function ruhe(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter(a => {
        try { return a.effect.getComputedTiming().iterations !== Infinity; }
        catch (e) { return false; }
      })
      .map(a => a.finished.catch(() => {}))
  ));
  // Ein Bild obendrauf: die Füllstände haben eine Übergangszeit.
  await page.waitForTimeout(80);
}

/* ── Lauf ──────────────────────────────────────────────────────── */
const server = await serve(ROOT);
const port = server.address().port;
const browser = await chromium.launch({ executablePath: EXE });
if (MIT_BILDERN) fs.mkdirSync(SHOTS, { recursive: true });

for (const s of SCHIRME) {
  for (const role of s.rollen) {
    const ctxB = await browser.newContext({
      viewport: { width: s.w, height: s.h },
      deviceScaleFactor: 1, hasTouch: s.touch, isMobile: false
    });
    const page = await ctxB.newPage();
    const kaputt = [];
    page.on('pageerror', e => kaputt.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/MPSkills/__fit_${role}.html`, { waitUntil: 'load' });

    for (const [phase, bau] of Object.entries(BILDER[role])) {
      await page.evaluate(v => { window.__V = v; }, bau());
      // Neu montieren statt umzuschalten: so wird auch der Aufbau
      // jedes Bildes einmal wirklich durchlaufen.
      await page.evaluate(() => {
        if (window.__impl) { try { window.__impl.unmount(); } catch (e) {} }
        document.getElementById('host').innerHTML = '';
      });
      await page.evaluate(() => window.__mount());
      await page.waitForSelector('.ks-stage > :not(.ks-booting)', { timeout: 5000 }).catch(() => {});
      await ruhe(page);

      const m = await page.evaluate(messe, s.touch);
      const wo = `${s.name} · ${role} · ${phase}`;

      if (m.fehlt) { ok(wo + ': Bühne steht', false, 'kein .ks-stage'); continue; }

      ok(`${wo}: kein waagerechter Überlauf`, m.seitenUeberlauf <= 1, String(m.seitenUeberlauf));
      // −1 bis +1: der Rahmen soll die Kante TREFFEN. Mehr als 1 px
      // darunter heißt „etwas ist abgeschnitten".
      ok(`${wo}: der Rahmen endet an der Kante`, m.rahmenUnten <= 1,
         m.rahmenUnten + ' px über die Kante');
      ok(`${wo}: die Bühne scrollt nicht`, m.buehneUeber <= 1, m.buehneUeber + ' px zu hoch');
      ok(`${wo}: nichts ragt aus dem Rahmen`, m.raus.length === 0, m.raus.slice(0, 4).join(' | '));
      if (s.touch) ok(`${wo}: Tippflächen ≥ 44 px`, m.klein.length === 0, m.klein.slice(0, 4).join(' | '));
      ok(`${wo}: Schrift lesbar`, m.zuKlein.length === 0, m.zuKlein.slice(0, 4).join(' | '));
      ok(`${wo}: keine Ausnahme im Browser`, kaputt.length === 0, kaputt.slice(0, 2).join(' | '));

      /* Eine Karte ist eine Karte — auch wenn nur ein Kind da ist.
         152 px ist die Obergrenze aus tool.css plus Rand; ohne sie
         stand hier bei einem einzigen Kind eine Karte über den
         halben Beamer. Und sie steht unten: mehr als 12 px Luft
         unter der untersten Karte heißt, die Wand hat wieder
         mittig ausgerichtet. */
      if (m.karte) {
        ok(`${wo}: die Wesen-Karte bleibt kartengroß (${m.karte.n} Kind(er))`,
           m.karte.breit <= 152, m.karte.breit + '×' + m.karte.hoch + ' px');
        // Nur wenn alle hineinpassen. Läuft die Wand über, ist sie
        // ein Rollfeld und fängt oben an — das ist so gewollt
        // (`safe end`), und die unterste Karte liegt dann unter dem
        // sichtbaren Rand.
        if (m.wandScrollt <= 1) {
          ok(`${wo}: die Wesen stehen unten in der Wand`,
             m.karte.boden >= -1 && m.karte.boden <= 12,
             m.karte.boden + ' px Luft darunter');
        }
        /* Und in der Lobby ist die ganze Klasse zu sehen. Das ist
           der Sinn der Wand: wer hereinkommt, taucht auf, und man
           sieht auf einen Blick, wer noch fehlt. Eine Wand, die
           rollt, versteckt die letzte Reihe — am Beamer scrollt
           niemand. In der Siegerehrung gilt das nicht: dort steht
           das Podest darüber und bekommt den Platz zuerst. */
        if (phase.startsWith('lobby') && role === 'presenter') {
          ok(`${wo}: alle ${m.karte.n} passen ohne Rollen hinein`,
             m.wandScrollt <= 1, m.wandScrollt + ' px zu viel');
        }
      }

      if (MIT_BILDERN) {
        await page.screenshot({ path: path.join(SHOTS, `${role}-${phase}-${s.name}.png`) });
      }
    }
    await ctxB.close();
  }
}

/* ── Hell und dunkel ───────────────────────────────────────────
   Zwei Bildschirme reichen: die Lesbarkeit hängt an den Farben und
   nicht an der Breite. Geprüft werden beide Rollen in allen Bildern
   und in beiden Fassungen — die helle ist die neue (26.09.2026),
   und sie ist die, in der ein übersehener dunkler Rest auffällt.  */
console.log('\n── Hell und dunkel ─────────────────────────────────\n');
for (const [role, s] of [['presenter', { name: 'beamer-720', w: 1280, h: 720, touch: false }],
                         ['participant', { name: 'iphone-14-hoch', w: 390, h: 844, touch: true }]]) {
  const ctxB = await browser.newContext({
    viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, hasTouch: s.touch
  });
  const page = await ctxB.newPage();
  await page.goto(`http://127.0.0.1:${port}/MPSkills/__fit_${role}.html`, { waitUntil: 'load' });

  for (const thema of ['dark', 'light']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), thema);
    for (const [phase, bau] of Object.entries(BILDER[role])) {
      await page.evaluate(v => { window.__V = v; }, bau());
      await page.evaluate(() => {
        if (window.__impl) { try { window.__impl.unmount(); } catch (e) {} }
        document.getElementById('host').innerHTML = '';
      });
      await page.evaluate(() => window.__mount());
      await page.waitForSelector('.ks-stage > :not(.ks-booting)', { timeout: 5000 }).catch(() => {});
      await ruhe(page);

      const k = await page.evaluate(messeKontrast);
      const wo = `${thema} · ${role} · ${phase}`;
      ok(`${wo}: alles lesbar`, k.schwach.length === 0, k.schwach.slice(0, 4).join(' | '));
      // Und die Fassung schlägt wirklich um: dunkel ist dunkel,
      // hell ist hell. Ohne diese Zeile wären beide Läufe derselbe,
      // und „alles lesbar" hieße nichts.
      ok(`${wo}: der Grund passt zur Fassung`,
         thema === 'dark' ? k.grund < .2 : k.grund > .7, 'Helligkeit ' + k.grund);

      if (MIT_BILDERN) {
        await page.screenshot({ path: path.join(SHOTS, `${thema}-${role}-${phase}.png`) });
      }
    }
  }
  await ctxB.close();
}

await browser.close();
server.close();
console.log(`\n${fails === 0 ? 'Alles grün.' : fails + ' FEHLER.'}`);
process.exit(fails === 0 ? 0 : 1);
