/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/tinylm.js   ·   Schaufenster für Tiny LM
   ══════════════════════════════════════════════════════════════
   Im Modal läuft das ECHTE Tiny LM im Rahmen (wie NeuroLab), mit
   ?demo=1: dann ersetzt tools/TinyLM/js/demo.js den localStorage
   durch einen Speicher im Arbeitsspeicher. Die Vorschau startet so
   immer frisch in Phase 1 und schreibt nichts in den Stand, mit dem
   jemand auf diesem Gerät arbeitet.

   Das Drehbuch geht einmal durch alle drei Phasen — das ist die
   Geschichte des Skills: (1) die KI schreibt frei aus gezählten
   Wortfolgen, (2) sie beantwortet eine Frage aus ihren Texten,
   (3) ein echtes kleines Netz lernt, und danach sagt es vorher.
   Geklickt wird nur auf Knöpfe mit festem data-spot bzw. auf die
   Phasen-Reiter (im Schaufenster sind alle Phasen offen und es
   gibt keine Tour); zurückgestellt wird mit den eigenen ↺-Knöpfen.

   Das Standbild für die Kachel (tile()) ist ein leichter Nachbau:
   ein Satz, dessen letzte zwei Wörter das Kontextfenster sind, und
   daneben die Kandidaten mit Wahrscheinlichkeiten. Beim Darüber-
   fahren gewinnt „Garten" und rückt in den Satz.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Tiny LM', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  const P = n => `.phase-pane[data-phase="${n}"] `;

  async function play(api) {
    if (!await api.waitFor(P(1) + '[data-spot="play"]', 15000)) return;
    if (!await api.wait(1400)) return;

    // Phase 1: frei schreiben lassen, dann anhalten.
    api.caption('Phase 1 · Die KI schreibt aus gezählten Wortfolgen');
    api.click(P(1) + '[data-spot="play"]');
    if (!await api.wait(7000)) return;
    api.click(P(1) + '[data-spot="play"]');
    if (!await api.wait(1800)) return;

    // Phase 2: eine Frage stellen.
    api.click('.phase-btn:nth-child(2)');
    if (!await api.waitFor(P(2) + '.qform input', 5000)) return;
    api.caption('Phase 2 · Frage & Antwort aus den eigenen Texten');
    if (!await api.wait(900)) return;
    if (!await api.type(P(2) + '.qform input', 'Was frisst eine Kornnatter?')) return;
    if (!await api.wait(400)) return;
    api.click(P(2) + '.qform button[type="submit"]');
    if (!await api.wait(7500)) return;

    // Phase 3: ein echtes Netz trainieren, dann vorhersagen lassen.
    api.click('.phase-btn:nth-child(3)');
    if (!await api.waitFor(P(3) + '[data-spot="train"]', 8000)) return;
    api.caption('Phase 3 · Ein echtes kleines Netz lernt');
    if (!await api.wait(1200)) return;
    api.click(P(3) + '[data-spot="train"]');
    if (!await api.wait(10000)) return;
    api.click(P(3) + '[data-spot="train"]');
    if (!await api.wait(600)) return;
    api.caption('Phase 3 · Jetzt sagt das Netz Wort für Wort vorher');
    api.click(P(3) + '[data-spot="gen"]');
    if (!await api.wait(6000)) return;
    api.click(P(3) + '[data-spot="gen"]');
    if (!await api.wait(2400)) return;

    // Zurückstellen mit den eigenen Knöpfen, dann wieder vorn anfangen.
    api.caption('');
    api.click(P(3) + '[data-spot="gen"] ~ .btn:last-child');      // ↺ Von vorn
    api.click(P(3) + '[data-spot="train"] ~ .btn');                // ↺ Netz zurücksetzen
    api.click(P(1) + '[data-spot="play"] ~ .btn:last-child');      // ↺ Neu starten
    api.click('.phase-btn:nth-child(1)');
    await api.wait(1000);
  }

  /* ── Das Standbild ─────────────────────────────────────────────
     Farben aus tools/TinyLM/css/tokens.css (Schritt ① Kontext teal,
     ③ Kandidaten koralle, ④ Zufall violett), gesetzt über Klassen in
     style.css (.tlp-*), damit die Kachel mit dem Kleid der Seite kippt
     — genau wie die App, die die Hell/Dunkel-Wahl der Seite übernimmt.
     Schrift im Blatt: Mono, damit die Lage der Wörter ohne Messen
     stimmt (7,2 px je Zeichen bei 12 px). */
  const CW = 7.2;
  const CANDS = [['Garten', 46], ['Park', 27], ['Haus', 15], ['Meer', 8]];
  const STEPS = [['① Kontext', 'ctx'], ['② Quellen', 'org'], ['③ Kandidaten', 'cand'], ['④ Zufall', 'rnd']];

  function tile() {
    const x0 = 22;
    const ctxX = x0 - 4, ctxW = 7 * CW + 8;               // „gern im"
    const slot = x0 + 8 * CW;                              // dahinter das neue Wort
    const word = (txt, x, y, cls) =>
      `<text x="${x}" y="${y}" class="tlp-mono">${txt}</text>` +
      `<rect x="${x}" y="${y + 4}" width="${txt.length * CW}" height="2.2" rx="1" class="${cls}"/>`;

    return `<div class="tprev tprev--tl" aria-hidden="true">
      <svg class="tlp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        ${STEPS.map(([t, c], i) => `
          <rect x="${10 + i * 81}" y="9" width="75" height="18" rx="9" class="tlp-pill tlp-pill--${c}"/>
          <text x="${47.5 + i * 81}" y="21.5" text-anchor="middle" class="tlp-pt tlp-pt--${c}">${t}</text>`).join('')}

        <!-- Das Blatt: die KI schreibt. Unterstrichen = aus welchem Text das Wort stammt. -->
        <rect x="10" y="38" width="188" height="142" rx="12" class="tlp-card"/>
        ${word('Der', x0, 68, 'tlp-src-a')}
        ${word('Hund', x0 + 4 * CW, 68, 'tlp-src-a')}
        ${word('spielt', x0 + 9 * CW, 68, 'tlp-src-b')}
        <rect x="${ctxX}" y="${80}" width="${ctxW}" height="24" rx="6" class="tlp-ctx"/>
        ${word('gern', x0, 96, 'tlp-src-b')}
        ${word('im', x0 + 5 * CW, 96, 'tlp-src-b')}
        <g class="tlp-new">${word('Garten', slot, 96, 'tlp-src-c')}</g>
        <rect x="${slot + 1}" y="84" width="2" height="15" class="tlp-cursor tlp-cur0"/>
        <rect x="${slot + 6 * CW + 2}" y="84" width="2" height="15" class="tlp-cursor tlp-cur1"/>
        <text x="${x0}" y="128" class="tlp-small tlp-small--ctx">Kontextfenster: 2 Wörter</text>
        <text x="${x0}" y="150" class="tlp-small">Welches Wort kommt als Nächstes?</text>
        <text x="${x0}" y="164" class="tlp-small">Die KI zählt nach — in ihren Texten.</text>

        <!-- Rechts: die Kandidaten mit Wahrscheinlichkeit, darunter der Zufall. -->
        <rect x="206" y="38" width="124" height="142" rx="12" class="tlp-card"/>
        <text x="216" y="57" class="tlp-head">Kandidaten</text>
        ${CANDS.map(([w, p], i) => {
          const y = 74 + i * 21;
          return `<g class="tlp-row${i === 0 ? ' tlp-win' : ''}">
            <text x="216" y="${y}" class="tlp-cw">${w}</text>
            <text x="320" y="${y}" text-anchor="end" class="tlp-cp">${p} %</text>
            <rect x="216" y="${y + 4}" width="104" height="5" rx="2.5" class="tlp-track"/>
            <rect x="216" y="${y + 4}" width="${(104 * p / 50).toFixed(1)}" height="5" rx="2.5" class="tlp-bar"/>
          </g>`;
        }).join('')}
        <text x="216" y="165" class="tlp-small tlp-small--rnd">Zufall</text>
        <rect x="248" y="161" width="72" height="3" rx="1.5" class="tlp-track"/>
        <circle cx="270" cy="162.5" r="5" class="tlp-knob"/>
      </svg>
    </div>`;
  }

  window.MPPreview.register('tinylm', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Ein <strong>Mini-Sprachmodell zum Aufschrauben</strong>: Die Klasse wählt, mit welchen
         Texten die KI gefüttert wird, und sieht in drei Phasen zu, wie daraus Text entsteht —
         Wort für Wort, mit allen Wahrscheinlichkeiten.</p>
      <p><strong>Frei schreiben</strong> (gezählte Wortfolgen, Kontextfenster, Zufall) ·
         <strong>Frage &amp; Antwort</strong> (passende Texte nachschlagen, Wortkarte) ·
         <strong>Echtes Netz</strong> (ein kleines neuronales Netz lernt live, Netz-Bild mit echten
         Gewichten). Ein Leitfaden mit Aufgaben hakt sich von selbst ab, Erklärungen stehen kurz
         hinter den ?-Knöpfen.</p>
      <p>Jede Person arbeitet <strong>für sich</strong>, nichts wird geteilt. Der Skill ist noch in
         der <strong>Beta</strong>.</p>`
  });
})();
