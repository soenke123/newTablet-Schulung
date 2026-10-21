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

   ── Vier Fragen, vier Fragenarten (Oktober 2026) ──────────────
   Wer die Vorschau öffnet, soll in den ersten Sekunden sehen: das
   ist ein QUIZ. Deshalb keine Wiese vorweg und ein kurzer Auftritt,
   und dann je eine Frage jeder Art aus Migration 0217 — Auswahl,
   Wahr/Falsch, Skala, Münzen setzen. Welche gerade läuft, steht
   oben im Kopf des Schaufensters als Leiste (api.caption), denn
   „Auswahl" trägt am Beamer keinen eigenen Hinweis.

   Die Vorlesezeit ist hier kürzer als im Raum (READ_SEC): das
   Werkzeug liest sie aus phase_ends_at, nicht aus einer Konstante,
   und am Schaufenster liest niemand zwanzig Sekunden lang Fragen.

   ── Was das Drehbuch NICHT zeigt ──────────────────────────────
   Die Tablet-Seite. Die Auslage steht auf der Beamer-Rolle; was die
   Kinder in der Hand haben, steht im Text darunter.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  /* INTRO_SEC muss zu tool.js passen (dort 9): was über der Vorlesezeit
     liegt, ist Auftritt. Hier steigt das Schaufenster nach INTRO_SKIP
     Sekunden ein — die Wesen sind dann schon gelandet, der Titel steht. */
  const INTRO_SEC = 9, INTRO_SKIP = 4, READ_SEC = 2.5, LIMIT = 15;

  // Je eine Frage jeder Art (tool.js artVon, editor.js ARTEN).
  const FRAGEN = [
    { kind: 'mc', art: '🔤 Auswahl',
      text: 'Wie viele Bit hat ein Byte?',
      options: ['4', '8', '16', '32'], correct: 1, dist: [1, 5, 1, 0],
      why: 'Ein Byte sind acht Bit — die Grundeinheit der Speichergrößen.' },
    { kind: 'tf', art: '⚖️ Wahr/Falsch',
      text: 'Wale sind Fische.',
      options: ['Wahr', 'Falsch'], correct: 1, dist: [2, 5],
      why: 'Wale sind Säugetiere: Sie atmen Luft und säugen ihre Jungen.' },
    { kind: 'scale', art: '📏 Skala',
      text: 'Wie hoch ist der Eiffelturm?',
      scale: { min: 0, max: 600, step: 10, unit: 'm', target: 330 },
      werte: [300, 320, 340, 250, 400, 330, 180],
      why: 'Mit Antenne gut 330 Meter — gebaut für die Weltausstellung 1889.' },
    { kind: 'bet', art: '🪙 Münzen setzen',
      text: 'Welcher Planet ist der größte?',
      options: ['Saturn', 'Jupiter', 'Erde', 'Mars'], correct: 1, dist: [11, 21, 1, 2],
      why: 'Jupiter — in ihn passen über 1.300 Erden.' }
  ];

  const KIDS = [
    { n: 'Mia',   c: 7,  s: 1 }, { n: 'Ben',  c: 12, s: 0 },
    { n: 'Lea',   c: 21, s: 2 }, { n: 'Jonas', c: 3, s: 1 },
    { n: 'Emma',  c: 30, s: 0 }, { n: 'Noah', c: 16, s: 2 },
    { n: 'Lina',  c: 25, s: 1 }
  ];
  /* Punkte nach jeder Frage (Spalte = Kind wie in KIDS). Die Reihen
     sind so gewählt, dass auf dem Podest jedes Mal jemand überholt. */
  const PUNKTE = [
    [ 860,  940,  620,  410,  980,  300,  150],
    [1700, 1820, 1480,  820, 1650,  640,  540],
    [2560, 2410, 2440, 1700, 2120,  980,  760],
    [3560, 3210, 2840, 2500, 2320, 1380,  960]
  ];
  const TITEL = 'Allgemeinwissen';

  /* ─── Der Stand des erfundenen Raums ─────────────────────────── */
  let G = null;
  function neu() {
    G = { rev: 1, phase: 'lobby', idx: 0, ends: null, open: null };
  }
  neu();

  const spieler = (i, o) => Object.assign({
    participant_id: 'pv-' + i, seat: i + 1, creature_id: KIDS[i].c, skin_idx: KIDS[i].s,
    nickname: KIDS[i].n, score: 0, rank: i + 1, rank_change: 0, delta: 0,
    emote: null, correct: null, answered: false
  }, o);

  function antworten() {
    // Wie viele schon getippt haben: in vier Sekunden nach dem
    // Aufdecken füllt sich die Reihe.
    if (G.phase === 'reveal' || G.phase === 'ended') return KIDS.length;
    if (G.phase !== 'question' || !G.open) return 0;
    const f = Math.max(0, Math.min(1, (Date.now() - G.open) / 4000));
    return Math.round(f * KIDS.length);
  }

  // Die Rangliste nach Frage idx — mit Pfeilen gegen den Stand davor.
  function rangliste(idx) {
    const nach = s => KIDS.map((_, i) => i).sort((a, b) => s[b] - s[a]);
    const jetzt = nach(PUNKTE[idx]);
    const vorher = idx > 0 ? nach(PUNKTE[idx - 1]) : jetzt;
    return jetzt.map((i, r) => spieler(i, {
      score: PUNKTE[idx][i], rank: r + 1,
      rank_change: vorher.indexOf(i) - r,
      delta: PUNKTE[idx][i] - (idx > 0 ? PUNKTE[idx - 1][i] : 0)
    }));
  }

  function frageFuer(q, auf) {
    const out = {
      qid: 'pv-q' + G.idx, kind: q.kind, text: q.text,
      options: q.options ? q.options.slice() : [],
      correct_idx: auf && q.correct != null ? q.correct : null,
      correct_indices: auf && q.correct != null ? [q.correct] : null,
      explanation: auf ? q.why : null, time_limit: LIMIT, has_image: false
    };
    // Das Ziel kennt das Gerät erst in der Auflösung (wie ks_view).
    if (q.scale) out.scale = Object.assign({}, q.scale, { target: auf ? q.scale.target : null });
    return out;
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

    if (G.phase === 'question') {
      const n = antworten();
      base.question = frageFuer(q, false);
      base.answers_total = n;
      base.players = KIDS.map((_, i) => spieler(i, { answered: i < n }));
      return base;
    }

    const rang = rangliste(G.idx);
    if (G.phase === 'reveal') {
      base.question = frageFuer(q, true);
      base.answers_total = KIDS.length;
      if (q.dist) {
        q.dist.forEach((n, i) => { base.answers_dist[i] = n; });
        if (q.kind === 'bet') base.bet_coins = q.dist.reduce((a, b) => a + b, 0);
      }
      if (q.werte) base.scale_values = q.werte.slice();
      const richtig = p => p.delta >= 600;
      base.leaderboard = rang.slice(0, 5).map(p => Object.assign(p, { correct: richtig(p) }));
      base.players = rang.map(p => Object.assign(p, { answered: true, correct: richtig(p) }));
      return base;
    }

    // ended
    base.leaderboard = rang.slice(0, 5);
    base.player_count = KIDS.length;
    base.players = rang;
    return base;
  }

  /* ─── Der erfundene Server ─────────────────────────────────── */
  function setze(phase, idx) {
    G.rev++;
    G.phase = phase;
    G.idx = idx;
    if (phase === 'question') {
      // Die erste Frage trägt den Auftritt — wie ks_step (0191).
      const extra = idx === 0 ? INTRO_SEC - INTRO_SKIP : 0;
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

  /* ─── Die Leiste im Kopf: welche Fragenart gerade läuft ─────── */
  function leiste(api, jetzt) {
    api.caption('<span class="pv-steps" aria-label="Fragenarten">'
      + FRAGEN.map((f, i) => '<span class="pv-step'
        + (i === jetzt ? ' is-an' : i < jetzt ? ' is-fertig' : '') + '">' + f.art + '</span>').join('')
      + '</span>');
  }

  /* ─── Das Drehbuch ────────────────────────────────────────────
       1. „Quiz startet".       Sofort klar: hier wird gequizzt.
       2. Vier Fragen, jede eine andere Art — Frage, Antworten laufen
          ein, Auflösung mit Podest. Oben wandert die Leiste mit.
       3. Die Siegerehrung.     Wie endet es?                        */
  async function play(api) {
    neu();
    leiste(api, -1);
    api.refresh();
    if (!await api.waitFor('[data-act=start]', 20000)) return;
    if (!await api.wait(700)) return;

    api.click('[data-act=start]');
    for (let i = 0; i < FRAGEN.length; i++) {
      leiste(api, i);
      const extra = i === 0 ? INTRO_SEC - INTRO_SKIP : 0;
      if (!await api.wait((extra + READ_SEC) * 1000 + 300)) return;
      if (!await api.wait(4600)) return;             // die Antworten laufen ein
      api.click('[data-act=now]');                   // Auflösung
      if (!await api.wait(i === 0 ? 6500 : 5500)) return;
      // „Nächste Frage" — nach der letzten heißt derselbe Knopf „Siegerehrung".
      api.click('[data-act=next]');
    }

    leiste(api, FRAGEN.length);                      // Siegerehrung
    if (!await api.wait(15000)) return;
  }

  /* ─── Das Standbild der Kachel ───────────────────────────────
     Ein leichter Nachbau und nicht das Werkzeug (Begründung im Kopf
     von lib/preview.js). Auf einen Blick soll es QUIZ sagen: oben eine
     echte, lesbare Frage mit Fragezeichen und Uhr, darunter die vier
     bunten Antwortfelder, eines als richtig aufgelöst — und unten die
     vier Fragenarten. Das Werkzeug ist dunkel; so steht auch die
     Kachel da, in beiden Kleidern. */
  function tileHTML() {
    const A = ['#e11d48', '#2563eb', '#eab308', '#059669'];
    const T = ['4', '8', '16', '32'];
    const OK = 1;
    const felder = [[16, 66], [174, 66], [16, 100], [174, 100]].map(([x, y], i) => {
      const ok = i === OK;
      return `<g opacity="${ok ? 1 : .5}">
        <rect x="${x}" y="${y}" width="150" height="28" rx="8" fill="${ok ? '#059669' : A[i]}"
              ${ok ? 'stroke="#6ee7b7" stroke-width="2.5"' : ''}/>
        <text x="${x + 75}" y="${y + 19}" text-anchor="middle" font-size="14" font-weight="800"
              fill="${i === 2 ? '#1c1917' : '#fff'}">${T[i]}</text>
        ${ok ? `<circle cx="${x + 18}" cy="${y + 14}" r="9" fill="#fff"/>
          <path d="M${x + 13.5} ${y + 14.5} l3 3 l6 -7" fill="none" stroke="#059669" stroke-width="2.6"
                stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      </g>`;
    }).join('');
    const arten = ['🔤 Auswahl', '⚖️ Wahr/Falsch', '📏 Skala', '🪙 Münzen'];
    const breit = [62, 84, 54, 64];
    let x = 16;
    const chips = arten.map((a, i) => {
      const w = breit[i] + 8;
      const g = `<rect x="${x}" y="142" width="${w}" height="22" rx="11" fill="#171a26" stroke="#2a3145"/>
        <text x="${x + w / 2}" y="157" text-anchor="middle" font-size="10.5" font-weight="700" fill="#cbd5e1">${a}</text>`;
      x += w + 6;
      return g;
    }).join('');
    return `<div class="tprev tprev--ks" aria-hidden="true">
      <svg class="ksp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice">
        <rect width="340" height="190" fill="#0c0e15"/>
        <rect x="16" y="12" width="308" height="44" rx="10" fill="#fff"/>
        <circle cx="38" cy="34" r="13" fill="#facc15"/>
        <text x="38" y="40" text-anchor="middle" font-size="17" font-weight="900" fill="#0c0e15">?</text>
        <text x="60" y="39" font-size="15" font-weight="800" fill="#0c0e15">Wie viele Bit hat ein Byte?</text>
        <circle cx="302" cy="34" r="10" fill="none" stroke="#e2e8f0" stroke-width="4"/>
        <path d="M302 24 a10 10 0 0 1 9.5 13" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round"/>
        ${felder}
        ${chips}
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
         spielt als <strong>Wesen</strong> mit, eines aus 40, in drei Farben.</p>
      <p><strong>Vier Fragenarten</strong>, frei gemischt in einem Quiz:</p>
      <ul>
        <li><strong>🔤 Auswahl</strong> — vier Antworten, eine oder mehrere richtig; wer schneller richtig tippt, bekommt mehr Punkte.</li>
        <li><strong>⚖️ Wahr/Falsch</strong> — eine Behauptung, zwei Felder.</li>
        <li><strong>📏 Skala</strong> — schätzen mit dem Regler; Punkte nach der Nähe zum Ziel, Tempo zählt nicht.</li>
        <li><strong>🪙 Münzen setzen</strong> — fünf Münzen auf die Antworten verteilen und umsetzen, bis die Zeit um ist: Sicherheit statt Tempo.</li>
      </ul>
      <p>Nach jeder Frage zeigt die <strong>Auflösung</strong>, wie die Klasse getippt hat, und die
         fünf Ersten laufen auf ihre Plätze. Zum Schluss gibt es eine <strong>Siegerehrung</strong>
         mit Treppchen und Konfetti.</p>
      <p>Die Fragen kommen aus <strong>mitgelieferten Katalogen</strong> oder aus dem eigenen
         Quiz-Editor — auch ohne Raum vorzubereiten.</p>`
  });
})();
