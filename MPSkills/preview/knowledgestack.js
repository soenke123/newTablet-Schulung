/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/knowledgestack.js   ·   Schaufenster für
   Knowledge Stack
   ══════════════════════════════════════════════════════════════
   Neuntes Drehbuch, gebaut wie das von Wordisland: Knowledge Stack
   sitzt auf eigenen Tabellen und eigenen RPC-Namen (ks_*, 0174ff.)
   und nicht auf der generischen Inhaltsschicht. Die gefälschten
   Verben aus lib/preview.js laufen deshalb ins Leere; stattdessen
   beantwortet `server(fn, args)` genau die Aufrufe, die die
   Beamer-Ansicht macht — ks_room_sig, ks_room_get, ks_step,
   ks_finish. Es läuft die ECHTE tools/KnowledgeStack/tool.js, auch
   der Auftritt vor der ersten Frage und die Siegerehrung.

   ── Der erfundene Server hat eine Uhr ─────────────────────────
   Er rechnet wie der echte mit phase_ends_at: die erste Frage trägt
   10 Sekunden Auftritt über den 5 Sekunden Vorlesezeit (0191). Die
   Antworten der Kinder „laufen ein", gerechnet aus der Zeit seit
   dem Aufdecken — kein Zufall, die Auslage soll bei jedem Aufruf
   dasselbe zeigen.

   ── Was das Drehbuch NICHT zeigt ──────────────────────────────
   Die Tablet-Seite. Die Auslage steht auf der Beamer-Rolle; was die
   Kinder in der Hand haben, steht im Text darunter.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  // Muss zu v_intro in Migration 0191 und INTRO_SEC in tool.js passen.
  const INTRO_SEC = 10, READ_SEC = 5, LIMIT = 15;

  const FRAGEN = [
    { text: 'Wie viele Bit hat ein Byte?',
      options: ['4', '8', '16', '32'], correct: 1,
      why: 'Ein Byte sind acht Bit — die Grundeinheit der Speichergrößen.' },
    { text: 'Welches Gerät verbindet dein Netz mit dem Internet?',
      options: ['Switch', 'Drucker', 'Router', 'Monitor'], correct: 2,
      why: 'Der Router leitet Pakete zwischen Netzen weiter.' }
  ];

  const KIDS = [
    { n: 'Mia',   c: 7,  s: 1 }, { n: 'Ben',  c: 12, s: 0 },
    { n: 'Lea',   c: 21, s: 2 }, { n: 'Jonas', c: 3, s: 1 },
    { n: 'Emma',  c: 30, s: 0 }, { n: 'Noah', c: 16, s: 2 },
    { n: 'Lina',  c: 25, s: 1 }
  ];
  const PUNKTE = [2860, 2410, 2120, 1740, 1200, 980, 540];
  const TITEL = 'Netzwerke: Grundlagen';

  /* ─── Der Stand des erfundenen Raums ─────────────────────────── */
  let G = null;
  function neu() {
    G = { rev: 1, phase: 'lobby', idx: 0, ends: null, open: null, still: false };
  }
  neu();

  const spieler = (i, o) => Object.assign({
    participant_id: 'pv-' + i, seat: i + 1, creature_id: KIDS[i].c, skin_idx: KIDS[i].s,
    nickname: KIDS[i].n, score: 0, rank: i + 1, rank_change: 0, delta: 0,
    emote: null, correct: null, answered: false
  }, o);

  function antworten() {
    // Wie viele schon getippt haben: in sechs Sekunden nach dem
    // Aufdecken füllt sich die Reihe.
    if (G.phase === 'reveal' || G.phase === 'ended') return KIDS.length;
    if (G.phase !== 'question' || !G.open) return 0;
    const f = Math.max(0, Math.min(1, (Date.now() - G.open) / 6000));
    return Math.round(f * KIDS.length);
  }

  function view() {
    const base = {
      ok: true, role: ROLE, phase: G.phase, current_q_idx: G.idx,
      question_count: FRAGEN.length, phase_ends_at: G.ends,
      server_now: new Date().toISOString(),
      catalog_id: 'pv-kat', catalog_title: TITEL,
      catalogs: [{ id: 'pv-kat', title: TITEL, count: FRAGEN.length, mine: false }],
      question: null, answers_dist: {}, answers_total: 0, leaderboard: [],
      players: KIDS.map((_, i) => spieler(i)),
      offline_members: [], blocked_members: []
    };
    if (G.phase === 'lobby') return base;

    const q = FRAGEN[G.idx];
    const rang = KIDS.map((_, i) => spieler(i, { score: PUNKTE[i] })).slice(0, 5);

    if (G.phase === 'question') {
      const n = antworten();
      base.question = { qid: 'pv-q' + G.idx, text: q.text, options: q.options,
        correct_idx: null, explanation: null, time_limit: LIMIT, has_image: false };
      base.answers_total = n;
      base.answers_dist = { 1: Math.ceil(n / 2) };
      base.players = KIDS.map((_, i) => spieler(i, { answered: i < n }));
      return base;
    }

    if (G.phase === 'reveal') {
      base.question = { qid: 'pv-q' + G.idx, text: q.text, options: q.options,
        correct_idx: q.correct, explanation: q.why, time_limit: LIMIT, has_image: false };
      const dist = {}; dist[q.correct] = 4; dist[(q.correct + 1) % 4] = 2; dist[(q.correct + 2) % 4] = 1;
      base.answers_dist = dist;
      base.answers_total = KIDS.length;
      base.leaderboard = rang.map((p, i) => Object.assign(p, {
        rank_change: i === 0 ? 1 : i === 4 ? -1 : 0, delta: 900 - i * 120, correct: i < 4 }));
      base.players = KIDS.map((_, i) => spieler(i, { score: PUNKTE[i], answered: true, correct: i < 4 }));
      return base;
    }

    // ended
    base.leaderboard = rang;
    base.player_count = KIDS.length;
    base.players = KIDS.map((_, i) => spieler(i, { score: PUNKTE[i] }));
    return base;
  }

  /* ─── Der erfundene Server ─────────────────────────────────── */
  function setze(phase, idx) {
    G.rev++;
    G.phase = phase;
    G.idx = idx;
    if (phase === 'question') {
      // Die erste Frage trägt den Auftritt — wie ks_step (0191).
      const extra = idx === 0 ? INTRO_SEC : 0;
      G.ends = new Date(Date.now() + (LIMIT + READ_SEC + extra) * 1000).toISOString();
      G.open = Date.now() + (READ_SEC + extra) * 1000;
    } else {
      G.ends = null; G.open = null;
    }
  }

  function server(fn, args) {
    if (fn === 'ks_room_sig') {
      return { ok: true, sig: G.rev + '|' + G.phase + '|' + G.idx + '|' + antworten(),
               server_now: new Date().toISOString() };
    }
    if (fn === 'ks_room_get') return view();
    if (fn === 'ks_step') {
      if (args.p_from && args.p_from !== G.phase) return { ok: true, stale: true, phase: G.phase };
      if (G.phase === 'lobby') setze('question', 0);
      else if (G.phase === 'question') setze('reveal', G.idx);
      else if (G.phase === 'reveal') {
        if (G.idx + 1 < FRAGEN.length) setze('question', G.idx + 1); else setze('ended', G.idx);
      } else setze('lobby', 0);
      return { ok: true, phase: G.phase, idx: G.idx };
    }
    if (fn === 'ks_finish')  { setze('ended', G.idx); return { ok: true }; }
    if (fn === 'ks_restart') { setze('lobby', 0); return { ok: true }; }
    if (fn === 'ks_room_setup') return { ok: true };
    return { ok: false, error: 'unknown_fn' };
  }

  /* ─── Das Drehbuch ────────────────────────────────────────────
     Fünf Bilder, jedes beantwortet eine eigene Frage:

       1. Die Wiese.            Wer ist im Raum?
       2. „Quiz startet".       Wie fängt eine Runde an?
       3. Frage und Antworten.  Was sehen 28 Köpfe am Beamer?
       4. Die Auflösung.        Wer ist vorn, wie hat die Klasse getippt?
       5. Die Siegerehrung.     Wie endet es?                        */
  async function play(api) {
    neu();
    api.refresh();
    if (!await api.waitFor('[data-act=start]', 20000)) return;
    if (!await api.wait(3600)) return;               // die Wesen fallen auf die Wiese

    api.click('[data-act=start]');                   // 2 · Auftritt
    if (!await api.wait((INTRO_SEC + READ_SEC) * 1000 + 600)) return;

    if (!await api.wait(6800)) return;               // 3 · die Antworten laufen ein
    api.click('[data-act=now]');                     // 4 · Auflösung
    if (!await api.wait(7000)) return;

    api.click('[data-act=finish]');                  // 5 · Siegerehrung
    if (!await api.wait(17000)) return;
  }

  /* ─── Das Standbild der Kachel ───────────────────────────────
     Ein leichter Nachbau und nicht das Werkzeug (Begründung im Kopf
     von lib/preview.js): der Beamer in Kurzform — die Frage oben, die
     vier Antwortfelder in den Farben des Werkzeugs, unten die Wesen
     am Treppchen. Das Werkzeug ist dunkel; so steht auch die
     Kachel da, in beiden Kleidern. */
  function tileHTML() {
    const A = ['#e11d48', '#2563eb', '#eab308', '#059669'];
    const felder = [[16, 62], [176, 62], [16, 96], [176, 96]].map(([x, y], i) =>
      `<rect x="${x}" y="${y}" width="148" height="28" rx="8" fill="${A[i]}"/>
       <rect x="${x + 12}" y="${y + 11}" width="${i === 1 ? 92 : 64 + i * 10}" height="6" rx="3" fill="#fff" opacity=".85"/>`).join('');
    // Das Treppchen: Platz 2 · 1 · 3, und auf jeder Stufe steht ein Wesen.
    const stufen = [[92, 46, 140, '#2a3145', '#22d3ee', 12], [138, 58, 124, '#facc15', '#f472b6', 14],
                    [196, 46, 148, '#d97706', '#a3e635', 12]];
    const podest = stufen.map(([x, w, y, f]) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${190 - y}" rx="4" fill="${f}"/>`).join('');
    const wesen = stufen.map(([x, w, y, , c, r]) => {
      const cx = x + w / 2, cy = y - r * .85;
      return `<g><ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * .9}" fill="${c}" stroke="#0c0e15" stroke-width="2"/>
         <circle cx="${cx - r * .35}" cy="${cy - r * .15}" r="${r * .18}" fill="#0c0e15"/>
         <circle cx="${cx + r * .35}" cy="${cy - r * .15}" r="${r * .18}" fill="#0c0e15"/></g>`;
    }).join('');
    return `<div class="tprev tprev--ks" aria-hidden="true">
      <svg class="ksp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice">
        <rect width="340" height="190" fill="#0c0e15"/>
        <rect x="16" y="14" width="308" height="40" rx="10" fill="#171a26" stroke="#fff" stroke-width="2"/>
        <rect x="34" y="30" width="190" height="8" rx="4" fill="#fff"/>
        <rect x="34" y="42" width="120" height="5" rx="2.500" fill="#94a3b8"/>
        <circle cx="296" cy="34" r="12" fill="none" stroke="#facc15" stroke-width="4"/>
        ${felder}
        ${podest}
        ${wesen}
      </svg>
    </div>`;
  }

  window.MPPreview.register('knowledgestack', {
    role: ROLE,
    view, play, server, tile: tileHTML,

    // Breite Bühne: der Beamer ist ein ganzes Bild, kein Werkzeug im Kasten.
    wide: true,
    fade: true,

    blurb: `
      <p>Ein <strong>Live-Quiz für die ganze Klasse</strong>: Am Beamer steht die Frage, auf den
         Tablets stehen nur die Antworten — der Blick der Klasse geht nach vorn. Jedes Kind
         ist ein <strong>Wesen</strong> aus 40, in drei Farben, und steht schon in der Lobby
         auf der Wiese.</p>
      <p>Eine Runde beginnt mit einem <strong>Auftritt</strong>: „Quiz startet", der Name des
         Fragenkatalogs, und alle Wesen regnen von oben herein, landen und laufen rechts aus
         dem Bild. Danach kommt die erste Frage — erst fünf Sekunden zum Lesen, dann erscheinen
         die Antworten auf allen Geräten im selben Augenblick.</p>
      <p>Schnell und richtig bringt Punkte. In der Auflösung laufen die <strong>fünf Ersten</strong> auf
         ihre Plätze, und zum Schluss gibt es eine <strong>Siegerehrung</strong> mit Treppchen,
         Trommelwirbel und Konfetti: Wer gewonnen hat, sieht es sofort auf dem eigenen Gerät,
         alle anderen jubeln über die Emote-Tasten mit.</p>
      <p>Die Fragen kommen aus <strong>mitgelieferten Katalogen</strong> oder aus dem eigenen
         Quiz-Editor — auch ohne Raum vorzubereiten.</p>`
  });
})();
