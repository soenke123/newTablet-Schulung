/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/neurolab.js   ·   Schaufenster für NeuroLab
   ══════════════════════════════════════════════════════════════
   NeuroLab (überarbeitet 20.11.2026): Startseite mit drei Bereichen –
   „Wie funktioniert ein Neuron?“ (So rechnet ein Neuron · Alle Neuronen),
   „Netze bauen“ (das freie Feld, Build · Run) und „Netze trainieren“
   (Szenario legt Ein- und Ausgänge fest, dazwischen baut man frei; das
   verschiebbare Lernfenster mit Lernrate).

   Im Modal läuft das ECHTE NeuroLab im <iframe> mit ?demo=1: nichts wird
   gespeichert, alles ist offen, „Netze trainieren“ startet mit XOR als
   „Eigene Daten“ und einem fertigen Netz 2 → 3 → 3 → 1 (demoState in
   tools/NeuroLab/app.js). Der Regisseur klickt nur über feste ids und
   Kacheln (.tile[data-id]) — nie in Eingabefelder.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';
  function view() {
    return {
      role: ROLE,
      room: { title: 'NeuroLab', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      me: { may_write: true },
      entries: []
    };
  }

  async function play(api) {
    if (!await api.waitFor('.tile[data-id="n-typen"]', 6000)) return;
    api.caption('Drei Bereiche: das Neuron verstehen · Netze frei bauen · Netze trainieren');
    if (!await api.wait(2600)) return;

    api.click('.tile[data-id="n-typen"]');
    if (!await api.waitFor('.nn-type', 3000)) return;
    api.caption('Alle Neuronen: Perceptron, Linear, ReLU, Sigmoid, Tanh – mit Formel und Kurve');
    if (!await api.wait(3000)) return;

    api.click('#btn-home');
    if (!await api.waitFor('.tile[data-id="b-frei"]', 3000)) return;
    api.click('.tile[data-id="b-frei"]');
    if (!await api.waitFor('#btn-run', 3000)) return;
    api.caption('Netze bauen: Schichten und Neuronen setzen, Gewichte und Bias festlegen');
    if (!await api.wait(2600)) return;
    api.click('#btn-run');
    api.caption('Run: Eingaben ändern und sehen, was am Ende herauskommt');
    if (!await api.wait(2400)) return;

    api.click('#btn-home');
    if (!await api.waitFor('.tile[data-id="sc-eigene"]', 3000)) return;
    api.click('.tile[data-id="sc-eigene"]');
    if (!await api.waitFor('#learn-btn-start', 3000)) return;
    api.caption('Netze trainieren: Ein- und Ausgänge stehen fest, dazwischen baut man selbst');
    if (!await api.wait(2400)) return;
    api.click('#learn-btn-start');
    api.caption('Das Netz lernt XOR – die Kanten ändern sich, bis die Ausgabe stimmt');
    for (let t = 0; t < 14000; t += 500) {
      if (!await api.wait(500)) return;
      const l = parseFloat(api.text('#learn-loss-display') || '1');
      if (t > 2500 && l < 0.02) break;
    }
    api.click('#learn-btn-pause');
    if (!await api.wait(2200)) return;

    api.caption('');
    api.click('#btn-home');
    await api.wait(1500);
  }

  /* ── Standbild der Kachel ──────────────────────────────────
     Ein Neuron-Netz (2 → 2 → 1) neben einem Diagramm mit echten
     Greifvögeln. In Ruhe liegen die zwei Geraden falsch (vor dem
     Training), beim Darüberfahren rücken sie an ihren Platz und der
     Ausgang zeigt ✓ (nach dem Training). Klassen .nlp-build/.nlp-run
     wie bisher (MPSkills/style.css). */
  function tile() {
    const dots = (pts, c) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${c}"/>`).join('');
    const net = `
      <g class="nlp-static">
        <path class="nlp-edge" d="M40 70 L82 52 M40 70 L82 112 M40 128 L82 52 M40 128 L82 112 M118 52 L150 90 M118 112 L150 90"/>
        <rect x="14" y="58" width="34" height="24" rx="12" fill="#fff" stroke="#e3a008" stroke-width="2"/>
        <rect x="14" y="116" width="34" height="24" rx="12" fill="#fff" stroke="#e3a008" stroke-width="2"/>
        <text x="31" y="74" text-anchor="middle" font-size="8.5" font-weight="700" fill="#475569">Flügel</text>
        <text x="31" y="132" text-anchor="middle" font-size="8.5" font-weight="700" fill="#475569">Gewicht</text>
        <rect x="82" y="38" width="36" height="28" rx="8" fill="#fff" stroke="#2f80ed" stroke-width="2.4"/>
        <rect x="82" y="98" width="36" height="28" rx="8" fill="#fff" stroke="#e5484d" stroke-width="2.4"/>
        <rect x="150" y="76" width="36" height="28" rx="8" fill="#fff" stroke="#00b37e" stroke-width="2.4"/>
        <text x="100" y="57" text-anchor="middle" font-size="13" fill="#475569">Σ</text>
        <text x="100" y="117" text-anchor="middle" font-size="13" fill="#475569">Σ</text>
        <text x="168" y="95" text-anchor="middle" font-size="13" fill="#475569">Σ</text>
        <path d="M186 90 H196" stroke="#00b37e" stroke-width="2.5"/>
      </g>`;
    const plot = `
      <rect x="200" y="20" width="132" height="150" rx="8" fill="#fff" stroke="#dfe7e5"/>
      ${dots([[214, 155], [220, 150], [218, 160], [226, 156], [222, 147]], '#3f8fe0')}
      ${dots([[236, 145], [242, 140], [238, 150], [246, 143]], '#8d63d2')}
      ${dots([[262, 118], [270, 112], [266, 124], [276, 116], [258, 110]], '#e39a2d')}
      ${dots([[300, 52], [310, 46], [306, 60], [318, 40], [314, 54]], '#d64b4b')}`;
    return `<div class="tprev tprev--nl" aria-hidden="true">
      <svg class="nlp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        ${net}${plot}
        <g class="nlp-build">
          <line x1="215" y1="40" x2="320" y2="160" stroke="#2f80ed" stroke-width="2.4" stroke-dasharray="6 4"/>
          <line x1="230" y1="170" x2="330" y2="80" stroke="#e5484d" stroke-width="2.4" stroke-dasharray="6 4"/>
          <text x="266" y="186" text-anchor="middle" font-size="9" fill="#7b8a86">vor dem Training</text>
        </g>
        <g class="nlp-run">
          <line x1="212" y1="118" x2="290" y2="170" stroke="#2f80ed" stroke-width="2.4" stroke-dasharray="6 4"/>
          <line x1="246" y1="70" x2="330" y2="130" stroke="#e5484d" stroke-width="2.4" stroke-dasharray="6 4"/>
          <circle cx="168" cy="122" r="9" fill="#00b37e"/>
          <text x="168" y="126" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">✓</text>
          <text x="266" y="186" text-anchor="middle" font-size="9" fill="#00714f" font-weight="700">nach dem Training</text>
        </g>
      </svg>
    </div>`;
  }

  window.MPPreview.register('neurolab', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Neuronale Netze in drei Bereichen: <strong>Wie funktioniert ein Neuron?</strong>
         erklärt Gewichte, Summe, Bias und Aktivierung zum Ausprobieren, mit einer
         Impulsaufgabe und einer Übersicht aller Neuronen-Typen.</p>
      <p>Bei <strong>Netze bauen</strong> klickt die Klasse ein Netz frei zusammen,
         legt Gewichte und Bias fest und sieht, was herauskommt. Bei
         <strong>Netze trainieren</strong> gibt ein Szenario Ein- und Ausgänge vor
         (Logik-Gatter, 7-Segment-Ziffer, Zielscheibe, echte Greifvögel oder eigene
         CSV-Daten), Schichten und Neuronen dazwischen wählt man selbst – dann lernt
         das Netz mit einstellbarer Lernrate.</p>
      <p>Die Lehrkraft gibt Bereiche und einzelne Szenarien frei. Für Arbeitsblätter
         gibt es eine Druckansicht mit Auswahl, was auf dem Blatt steht.</p>`
  });
})();
