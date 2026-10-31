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

   Das Standbild für die Kachel (tile()) ist ein leichter Nachbau:
   ein Tic-Tac-Toe-Brett mitten in der Partie, daneben die
   Möglichkeiten der KI (★ gewinnt direkt, ✕ verliert direkt) und
   die Lernkurve. Beim Darüberfahren setzt die KI ihren Siegzug und
   die Kurve wächst weiter.
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
     Farben wie in der App: KI = Akzent der Seite (--accent), Du =
     Orange (--ttt-du in index.html). Klassen .ryp-* in style.css. */
  const X = (cx, cy, r, cls) =>
    `<path class="${cls}" d="M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}"/>`;
  const O = (cx, cy, r) => `<circle class="ryp-o" cx="${cx}" cy="${cy}" r="${r}"/>`;

  // Stellung: K = KI (X), D = du (O). Du hast begonnen, die KI ist dran
  // und gewinnt mit Feld 6 (Diagonale 2-4-6).
  const BOARD = [null, 'D', 'K', 'D', 'K', null, null, null, 'D'];
  const WIN = 2;    // Anfang der Siegerlinie
  const WIN2 = 6;   // der Siegzug

  function board(x, y, s, cells, extra) {
    const c = s / 3;
    let h = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.06}" class="ryp-board"/>`;
    h += `<path class="ryp-grid" d="M${x + c} ${y + 4}V${y + s - 4}M${x + 2 * c} ${y + 4}V${y + s - 4}M${x + 4} ${y + c}H${x + s - 4}M${x + 4} ${y + 2 * c}H${x + s - 4}"/>`;
    cells.forEach((v, i) => {
      const cx = x + c * (i % 3) + c / 2, cy = y + c * ((i / 3) | 0) + c / 2;
      if (v === 'K') h += X(cx, cy, c * 0.24, 'ryp-x');
      if (v === 'D') h += O(cx, cy, c * 0.27);
    });
    return h + (extra || '');
  }

  function tile() {
    // Großes Brett links.
    const bx = 14, by = 30, bs = 140, c = bs / 3;
    const cell = i => [bx + c * (i % 3) + c / 2, by + c * ((i / 3) | 0) + c / 2];
    const [wx, wy] = cell(WIN2);
    const [ax, ay] = cell(WIN);
    const big = board(bx, by, bs, BOARD,
      `<g class="ryp-new">${X(wx, wy, c * 0.24, 'ryp-x')}</g>` +
      `<line class="ryp-line" x1="${ax + 12}" y1="${ay - 12}" x2="${wx - 12}" y2="${wy + 12}" pathLength="100"/>`);

    // Möglichkeiten der KI: drei Mini-Bretter, je mit dem gedachten Zug.
    const mini = (x, y, pick, kind) => {
      const s = 40, mc = s / 3;
      const cells = BOARD.slice();
      const px = x + mc * (pick % 3) + mc / 2, py = y + mc * ((pick / 3) | 0) + mc / 2;
      return `<g class="ryp-opt ryp-opt--${kind}">` +
        board(x, y, s, cells, `<rect x="${px - mc / 2 + 1.5}" y="${py - mc / 2 + 1.5}" width="${mc - 3}" height="${mc - 3}" rx="2.5" class="ryp-pick"/>` +
          X(px, py, mc * 0.24, 'ryp-x ryp-x--ghost')) +
        `<text x="${x + s / 2}" y="${y + s + 12}" text-anchor="middle" class="ryp-tag ryp-tag--${kind}">${kind === 'win' ? '★ gewinnt' : kind === 'lose' ? '✕ verliert' : 'offen'}</text>` +
        '</g>';
    };

    // Lernkurve: Anteil Unentschieden steigt.
    const pts = [4, 6, 5, 9, 12, 16, 22, 27, 33, 38, 42, 45];
    const more = [48, 50, 52, 53];
    const cx0 = 176, cy0 = 172, cw = 150, ch = 46;
    const step = cw / (pts.length + more.length - 1);
    const path = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${(cx0 + i * step).toFixed(1)} ${(cy0 - v / 55 * ch).toFixed(1)}`).join('');
    const tail = [pts[pts.length - 1], ...more];
    const tailPath = tail.map((v, i) => `${i ? 'L' : 'M'}${(cx0 + (pts.length - 1 + i) * step).toFixed(1)} ${(cy0 - v / 55 * ch).toFixed(1)}`).join('');

    return `<div class="tprev tprev--ry" aria-hidden="true">
      <svg class="ryp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <text x="${bx}" y="20" class="ryp-head">Gegen die KI</text>
        <text x="${bx + bs}" y="20" text-anchor="end" class="ryp-status"><tspan class="ryp-s0">Die KI wählt …</tspan><tspan class="ryp-s1" x="${bx + bs}">Die KI gewinnt</tspan></text>
        ${big}

        <rect x="168" y="8" width="164" height="112" rx="10" class="ryp-card"/>
        <text x="178" y="24" class="ryp-head">Möglichkeiten der KI</text>
        ${mini(178, 34, WIN2, 'win')}
        ${mini(230, 34, 5, 'lose')}
        ${mini(282, 34, 7, 'open')}

        <rect x="168" y="126" width="164" height="58" rx="10" class="ryp-card"/>
        <text x="178" y="140" class="ryp-small">Lernkurve · Unentschieden</text>
        <path d="M${cx0} ${cy0}H${cx0 + cw}" class="ryp-axis"/>
        <path d="${path(pts)}" class="ryp-curve"/>
        <path d="${tailPath}" class="ryp-curve ryp-tail" pathLength="100"/>
      </svg>
    </div>`;
  }

  window.MPPreview.register('reinforce', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p><strong>Reinforcement Learning zum Selbermachen</strong>: Niemand erklärt der KI die Regeln.
         Sie probiert aus – und merkt sich, was belohnt wurde.</p>
      <p><strong>Du trainierst die KI</strong> (Tic-Tac-Toe gegen eine KI, die aus jeder Partie
         lernt; man sieht ihre Möglichkeiten und die Lernkurve) ·
         <strong>Du lernst wie eine KI</strong> (Training mit Zuständen und Aktionen, nur Sieg oder
         Niederlage als Rückmeldung, dann zwei Umgebungen und ein Entscheidungsbaum).</p>
      <p>Die Lehrkraft teilt jede Kachel einzeln mit der Klasse; jede Person trainiert ihre
         <strong>eigene</strong> KI im Gerät. Der Skill ist noch in der <strong>Beta</strong>.</p>`
  });
})();
