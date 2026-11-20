/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/neurolab.js   ·   Schaufenster für NeuroLab
   ══════════════════════════════════════════════════════════════
   NeuroLab wurde am 20.11.2026 neu gebaut: drei Bereiche (Das Neuron ·
   Netze bauen · Netze trainieren), feste Ausgänge zum Andocken, echte
   Greifvogel-Daten zum Trennen mit Geraden und Ebenen.

   Im Modal läuft das ECHTE NeuroLab im <iframe> mit ?demo=1: nichts wird
   gespeichert, und zwei Szenarien starten fertig aufgebaut (sc.demo in
   tools/NeuroLab/js/szenarien.js). Der Regisseur klickt nur über feste
   ids und Kacheln (.tile[data-id]) — nie in Eingabefelder.

   Ablauf: Übersicht → Netze bauen „UND, ODER, NICHT“ (Neuronen hängen
   absichtlich nicht in der Reihenfolge der Ausgänge, Testen zeigt ✓) →
   Netze trainieren „Der Vogel in der Mitte“ (zwei Geraden wandern, bis
   die Testvögel stimmen) → Zeitlupe (ein Lernschritt) → zurück.
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
    if (!await api.waitFor('.tile[data-id="b-gatter"]', 6000)) return;
    api.caption('Drei Bereiche: das Neuron verstehen · Netze bauen · Netze trainieren');
    if (!await api.wait(2600)) return;

    // Netze bauen: feste Ausgänge, die Reihenfolge der Neuronen ist egal
    api.click('.tile[data-id="b-gatter"]');
    if (!await api.waitFor('#steps', 3000)) return;
    api.caption('Netze bauen: Neuronen an feste Ausgänge andocken, Gewichte von Hand');
    if (!await api.wait(2600)) return;
    api.click('#steps button[data-step="1"]');
    api.caption('Testen: jede Zeile der Wertetabelle bekommt ✓ oder ✗');
    if (!await api.wait(3200)) return;

    // Netze trainieren: echte Greifvögel
    api.click('#back');
    if (!await api.waitFor('.tile[data-id="t-vogel2"]', 3000)) return;
    api.click('.tile[data-id="t-vogel2"]');
    if (!await api.waitFor('#steps', 3000)) return;
    api.caption('Netze trainieren: 180 echte Greifvögel — wer ist der Vogel in der Mitte?');
    if (!await api.wait(2200)) return;
    api.click('#steps button[data-step="1"]');
    if (!await api.waitFor('#train-go', 3000)) return;
    api.click('#train-go');
    api.caption('Das Training verschiebt zwei Geraden, bis sie die Arten trennen');
    for (let t = 0; t < 16000; t += 600) {
      if (!await api.wait(600)) return;
      const v = parseInt(api.text('#stat-test') || '0', 10);
      if (v >= 95 && t > 3000) break;
    }
    api.click('#train-go');
    if (!await api.wait(1500)) return;

    api.caption('Zeitlupe: ein Beispiel, der Fehler läuft rückwärts, jedes Gewicht rückt ein Stück');
    api.click('#slow-btn');
    if (!await api.wait(3000)) return;
    api.click('#slow-next');
    if (!await api.wait(3000)) return;

    api.caption('');
    api.click('#back');
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
      <p>Neuronale Netze in drei Schritten: Im Bereich <strong>Das Neuron</strong>
         erarbeitet die Klasse an sechs Stationen Gewichte, Summe, Bias und
         Aktivierungsfunktion. Bei <strong>Netze bauen</strong> stellt sie Gewichte
         von Hand ein, bis Rätsel wie UND, XOR oder der Halbaddierer stimmen. Die
         Ausgänge stehen fest, die Neuronen werden angedockt.</p>
      <p>Bei <strong>Netze trainieren</strong> findet das Netz die Gewichte selbst –
         an echten Greifvögeln. Ein Neuron zieht eine Gerade, zwei trennen den Vogel
         in der Mitte, mit drei Eingängen werden es Ebenen im Raum. Eine Zeitlupe
         zeigt einen einzelnen Lernschritt.</p>
      <p>Die Lehrkraft gibt Bereiche und einzelne Aufgaben frei. Für Arbeitsblätter
         gibt es eine Druckansicht, in der man wählt, was auf dem Blatt steht.</p>`
  });
})();
