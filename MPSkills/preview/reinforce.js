/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/reinforce.js   ·   Schaufenster für Reinforce Yourself
   ══════════════════════════════════════════════════════════════
   Im Modal läuft das ECHTE Reinforce Yourself im Rahmen (wie Tiny LM),
   mit ?demo=1: dann ersetzt index.html den localStorage durch einen
   Speicher im Arbeitsspeicher (startet frisch, überschreibt nicht den
   Stand auf diesem Gerät), und die Knöpfe „+50 Runden" sind da, obwohl
   keine Lehrkraft im Raum ist (body.is-demo).

   Drehbuch: Startseite → „Gegen die KI" (Aufgabe zu, zwei Partien
   spielen, dann sechsmal „+50 Runden Optimal": die KI verliert immer
   seltener) → zurück → „Training" (du bist die KI, +50 Runden)
   → Startseite. Geklickt wird nur auf feste ids/onclick-Knöpfe.

   Das Standbild für die Kachel (tile()) zeigt den Perspektivwechsel:
   links „Du trainierst die KI", rechts „Du bist die KI" (Zustand,
   Aktionen, Belohnung) – ohne die Umgebungen zu verraten. Begründung
   beim Standbild unten.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Reinforce Yourself', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];   // Mitte, Ecken, Kanten
  const over = api => /gewinn|Unentschieden/.test(api.text('#ttt-status-t') || '');

  // Eine Partie zu Ende spielen: „Du" setzt nach einfacher Reihenfolge.
  async function playGame(api) {
    for (let guard = 0; guard < 40 && !over(api); guard++) {
      if (!await api.wait(650)) return false;
      if (over(api)) break;
      for (const i of ORDER) {
        if (api.click(`#ttt-board > .ttt-cell.can:nth-child(${i + 1})`)) break;
      }
    }
    return api.wait(1600);
  }

  async function play(api) {
    if (!await api.waitFor('[data-part="ttt"] .tile-open', 15000)) return;
    api.caption('Wie lernt eine KI durch Belohnung?');
    if (!await api.wait(2600)) return;

    // Gegen die KI
    api.click('[data-part="ttt"] .tile-open');
    if (!await api.waitFor('#task-dialog[open]', 4000)) return;
    api.caption('Du trainierst die KI · Tic-Tac-Toe');
    if (!await api.wait(2800)) return;
    api.click('#task-ok');
    if (!await api.wait(600)) return;
    api.click('[data-first="du"]');
    if (!await api.wait(700)) return;

    api.caption('Du trainierst die KI · Sie merkt sich, welcher Zug gewinnt oder verliert');
    for (let g = 0; g < 2; g++) {
      if (!await playGame(api)) return;
      api.click('#ttt-new');
    }

    // Gegen einen perfekten Gegner kann die KI nicht gewinnen; man sieht das
    // Lernen an immer mehr Unentschieden (nach ~300 Partien etwa die Hälfte).
    api.caption('+50 Runden: die KI übt gegen einen perfekten Gegner');
    for (let k = 0; k < 6; k++) {
      if (!await api.wait(1100)) return;
      api.click('button[onclick^="tttPlay50"]');
    }
    if (!await api.wait(1200)) return;
    api.caption('Die Lernkurve: die KI verliert immer seltener');
    if (!await api.wait(4500)) return;

    // Training
    api.click('#ry-back');
    if (!await api.waitFor('[data-part="train"] .tile-open', 3000)) return;
    if (!await api.wait(1200)) return;
    api.click('[data-part="train"] .tile-open');
    if (!await api.waitFor('#task-dialog[open]', 4000)) return;
    api.caption('Du lernst wie eine KI · Nur Sieg oder Niederlage als Rückmeldung');
    if (!await api.wait(3000)) return;
    api.click('#task-ok');
    if (!await api.wait(2400)) return;
    api.caption('+50 Runden: die Gewichte werden verstärkt oder geschwächt');
    api.click('button[onclick^="trainPlay50"]');
    if (!await api.wait(4500)) return;

    api.caption('');
    api.click('#ry-back');
    await api.wait(1200);
  }

  /* ── Das Standbild ─────────────────────────────────────────────
     Der Kern des Skills ist der PERSPEKTIVWECHSEL, nicht ein Spiel:
     links trainierst du eine KI (angedeutet mit Tic-Tac-Toe, klein),
     rechts BIST du die KI – nur Zustand, Aktionen, Belohnung, so wie
     im Training. Die Umgebungen A/B (was hinter K0x/E0x steckt) zeigt
     die Kachel bewusst NICHT; das sollen die Schüler selbst entdecken.
     Beim Darüberfahren drehen sich die Pfeile, links setzt die KI
     ihren Siegzug, rechts wird eine Aktion gewählt, belohnt und ihr
     Gewicht wächst. Farben: KI = --accent, Du = Orange. Klassen
     .ryp-* in style.css. */
  const X = (cx, cy, r, cls) =>
    `<path class="${cls}" d="M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}"/>`;
  const O = (cx, cy, r) => `<circle class="ryp-o" cx="${cx}" cy="${cy}" r="${r}"/>`;

  // Stellung: K = KI (X), D = du (O). Die KI gewinnt mit Feld 6 (2-4-6).
  const BOARD = [null, 'D', 'K', 'D', 'K', null, null, null, 'D'];

  function board(x, y, s) {
    const c = s / 3;
    let h = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="6" class="ryp-board"/>`;
    h += `<path class="ryp-grid" d="M${x + c} ${y + 4}V${y + s - 4}M${x + 2 * c} ${y + 4}V${y + s - 4}M${x + 4} ${y + c}H${x + s - 4}M${x + 4} ${y + 2 * c}H${x + s - 4}"/>`;
    const at = i => [x + c * (i % 3) + c / 2, y + c * ((i / 3) | 0) + c / 2];
    BOARD.forEach((v, i) => {
      const [cx, cy] = at(i);
      if (v === 'K') h += X(cx, cy, c * 0.24, 'ryp-x');
      if (v === 'D') h += O(cx, cy, c * 0.27);
    });
    const [wx, wy] = at(6), [ax, ay] = at(2);
    h += `<g class="ryp-new">${X(wx, wy, c * 0.24, 'ryp-x')}</g>`;
    h += `<line class="ryp-line" x1="${ax + 8}" y1="${ay - 8}" x2="${wx - 8}" y2="${wy + 8}" pathLength="100"/>`;
    return h;
  }

  // Kleiner Roboter-Kopf (wie die Kachel „Training" in der App).
  const bot = (x, y, s, cls) => `<g class="ryp-bot ${cls || ''}" transform="translate(${x} ${y}) scale(${s / 64})">
      <path d="M32 6v8"/><rect x="12" y="14" width="40" height="32" rx="10"/>
      <circle cx="24" cy="29" r="4" class="ryp-eye"/><circle cx="40" cy="29" r="4" class="ryp-eye"/><path d="M25 38h14"/></g>`;
  // Mensch (Kopf + Schultern).
  const person = (x, y, s) => `<g class="ryp-you" transform="translate(${x} ${y}) scale(${s / 64})">
      <circle cx="32" cy="22" r="11"/><path d="M12 56c2-13 10-20 20-20s18 7 20 20"/></g>`;

  // Aktionen im Training: Name, Gewicht vorher, Gewicht nach der Belohnung.
  const ACTS = [['E0x03', 0.45, 0.45], ['E0x04', 0.55, 0.9], ['E0x02', 0.25, 0.25]];

  function tile() {
    const L = 8, R = 176, W = 156, T = 34, H = 150;

    // Links: du trainierst die KI.
    const left = `
      <rect x="${L}" y="${T}" width="${W}" height="${H}" rx="12" class="ryp-card"/>
      <text x="${L + 10}" y="${T + 17}" class="ryp-num">1</text>
      <text x="${L + 22}" y="${T + 17}" class="ryp-head">Du trainierst die KI</text>
      ${person(L + 8, T + 30, 30)}
      <path d="M${L + 42} ${T + 46}h10m-4 -4l4 4-4 4" class="ryp-arrow"/>
      ${bot(L + 56, T + 28, 32)}
      ${board(L + 98, T + 26, 50)}
      <text x="${L + 10}" y="${T + 96}" class="ryp-small">Sie probiert aus und lernt</text>
      <text x="${L + 10}" y="${T + 107}" class="ryp-small">aus jeder Partie.</text>
      <path d="M${L + 10} ${T + 138}H${L + W - 10}" class="ryp-axis"/>
      <path d="M${L + 10} ${T + 136}L${L + 30} ${T + 134}L${L + 50} ${T + 130}L${L + 70} ${T + 126}L${L + 90} ${T + 122}" class="ryp-curve"/>
      <path d="M${L + 90} ${T + 122}L${L + 110} ${T + 119}L${L + 130} ${T + 117}L${L + 146} ${T + 116}" class="ryp-curve ryp-tail" pathLength="100"/>
      <text x="${L + W - 10}" y="${T + 112}" text-anchor="end" class="ryp-tag ryp-tag--win">Lernkurve</text>`;

    // Rechts: du BIST die KI – Zustand, Aktionen, Belohnung.
    const acts = ACTS.map(([n, w0, w1], i) => {
      const y = T + 70 + i * 19;
      return `<g class="ryp-act${i === 1 ? ' ryp-act--pick' : ''}">
        <rect x="${R + 10}" y="${y - 11}" width="44" height="15" rx="4" class="ryp-chip"/>
        <text x="${R + 32}" y="${y}" text-anchor="middle" class="ryp-mono ryp-mono--s">${n}</text>
        <rect x="${R + 62}" y="${y - 6}" width="80" height="5" rx="2.5" class="ryp-track"/>
        <rect x="${R + 62}" y="${y - 6}" width="${80 * w0}" height="5" rx="2.5" class="ryp-w ryp-w0"/>
        ${w1 !== w0 ? `<rect x="${R + 62}" y="${y - 6}" width="${80 * w1}" height="5" rx="2.5" class="ryp-w ryp-w1"/>` : ''}
      </g>`;
    }).join('');
    const right = `
      <rect x="${R}" y="${T}" width="${W}" height="${H}" rx="12" class="ryp-card ryp-card--me"/>
      <text x="${R + 10}" y="${T + 17}" class="ryp-num">2</text>
      <text x="${R + 22}" y="${T + 17}" class="ryp-head">Du bist die KI</text>
      ${bot(R + W - 34, T + 4, 22, 'ryp-bot--me')}
      <rect x="${R + 10}" y="${T + 26}" width="${W - 20}" height="26" rx="6" class="ryp-state"/>
      <text x="${R + 18}" y="${T + 43}" class="ryp-small">Zustand</text>
      <text x="${R + W - 18}" y="${T + 44}" text-anchor="end" class="ryp-mono">K0x01</text>
      ${acts}
      <g class="ryp-fb">
        <rect x="${R + 10}" y="${T + 128}" width="${W - 20}" height="16" rx="8" class="ryp-fb-bg"/>
        <text x="${R + W / 2}" y="${T + 139.5}" text-anchor="middle" class="ryp-fb-t">Sieg → Aktion wird verstärkt</text>
      </g>
      <text x="${R + 10}" y="${T + 140}" class="ryp-small ryp-fb-q">Keine Regeln – nur Belohnung.</text>`;

    return `<div class="tprev tprev--ry" aria-hidden="true">
      <svg class="ryp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <rect x="112" y="6" width="116" height="20" rx="10" class="ryp-pill"/>
        <g class="ryp-swap" transform="translate(126 16)"><g class="ryp-swap-in">
          <path d="M-6 -2.5h11m-3 -3l3 3-3 3M6 2.5h-11m3 -3l-3 3 3 3"/></g></g>
        <text x="${170 + 8}" y="20" text-anchor="middle" class="ryp-pill-t">Perspektivwechsel</text>
        ${left}
        ${right}
      </svg>
    </div>`;
  }

  window.MPPreview.register('reinforce', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Es geht um einen <strong>Perspektivwechsel</strong>: Erst <strong>trainierst du eine KI</strong>
         und siehst zu, wie sie ohne Regeln nur aus Belohnung und Bestrafung lernt – mit ihren
         Möglichkeiten und ihrer Lernkurve. Dann <strong>wirst du selbst zur KI</strong>: Du kennst
         weder Spiel noch Regeln, siehst nur Zustände und Aktionen und erfährst am Ende nur, ob du
         gewonnen oder verloren hast.</p>
      <p>Was du dabei gelernt hast, wendest du danach an – und verstehst, was in einer KI passiert,
         die durch Belohnung lernt (Reinforcement Learning).</p>
      <p>Die Lehrkraft gibt die Teile einzeln für die Klasse frei; jede Person trainiert ihre
         <strong>eigene</strong> KI im Gerät.`
  });
})();
