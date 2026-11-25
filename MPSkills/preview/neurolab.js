/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/neurolab.js   ·   Schaufenster für NeuroLab
   ══════════════════════════════════════════════════════════════
   NeuroLab (Übersicht neu 21.11.2026): drei Bereiche –
   „Wie funktioniert ein Neuron?“ (Kachel mit Knopf „Alle Neuronen“),
   „Vom Neuron zum Netz“ (Revier der Wildkatzen · Netz durchrechnen ·
   Freies Bauen) und „Netze trainieren“ (ein Knopf, Szenario wählt man im
   Modus: #scen-picker .tile[data-id="sc-…"]).

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
    if (!await api.waitFor('.tile-sub[data-open="n-typen"]', 6000)) return;
    api.caption('Drei Schritte: Wie arbeitet ein Neuron? · Neuronen treffen Entscheidungen · Ein Netz findet Lösungen – und Frei bauen');
    if (!await api.wait(2600)) return;

    api.click('.tile-sub[data-open="n-typen"]');
    if (!await api.waitFor('.nt-card', 3000)) return;
    api.caption('Alle Neuronen: Perceptron, Linear, ReLU, Sigmoid, Tanh – mit Formel und Kurve');
    if (!await api.wait(3000)) return;

    api.click('#btn-home');
    if (!await api.waitFor('.tile[data-id="v-revier"]', 3000)) return;
    api.click('.tile[data-id="v-revier"]');
    if (!await api.waitFor('.rv-map canvas', 3000)) return;
    api.caption('Das Revier der Wildkatzen: Jede Grenze ist ein Neuron – erst rechnen, dann sehen');
    if (!await api.wait(3000)) return;
    api.click('.nn-step[data-step="jahr"]');
    if (!await api.waitFor('.rv-need, .rv-plans', 3000)) return;
    api.caption('Aus Geraden wird ein Netz – und das Netz antwortet auch dort, wo keine Kamera hängt');
    if (!await api.wait(2400)) return;

    api.click('#btn-home');
    if (!await api.waitFor('.tile[data-id="trainieren"]', 3000)) return;
    api.click('.tile[data-id="trainieren"]');
    if (!await api.waitFor('#scen-picker .tile[data-id="sc-katze"]', 3000)) return;
    api.caption('Ein Netz findet Lösungen: erst das Szenario wählen – Wildkatzen: das Netz findet seine Geraden selbst');
    if (!await api.wait(1800)) return;
    api.click('#btn-home');
    if (!await api.waitFor('.tile[data-id="b-frei"]', 3000)) return;
    api.click('.tile[data-id="b-frei"]');
    if (!await api.waitFor('#learn-btn-start', 3000)) return;
    api.caption('Frei: eigene Daten (hier XOR), dazwischen baut man selbst');
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
      <p><strong>Wildkatzen</strong>: Im <em>Revier der Wildkatzen</em>
         rechnet die Klasse aus Wildtierkameras Geraden aus, jede Gerade ist ein
         Perzeptron, zusammen ergeben sie ein Netz – am Ende deckt sich die Karte auf,
         und ein Vergleich zeigt, was Overfitting ist. Bei <strong>Lernen</strong>
         gibt ein Szenario Ein- und Ausgänge vor (Logik-Gatter, 7-Segment-Ziffer,
         Zielscheibe, echte Greifvögel), Schichten und Neuronen dazwischen wählt man
         selbst – dann lernt das Netz mit einstellbarer Lernrate. <strong>Frei</strong>
         ist die offene Werkstatt: alles selbst bauen und eine eigene CSV-Tabelle laden.</p>
      <p>Die Lehrkraft gibt Bereiche, Kacheln und einzelne Szenarien frei. Arbeitsblätter
         druckt sie direkt: das Revier mit Lösungsseite, Netz-Aufgaben und die
         Druckansicht des freien Feldes.</p>`
  });
})();
