/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/scrum.js   ·   Schaufenster für die Scrum Werkstatt
   ══════════════════════════════════════════════════════════════
   Wie NeuroLab: im Modal läuft die ECHTE Werkstatt im Rahmen, mit
   ?demo=1 — dann zeigt sie das Beispielprojekt („Smart Solar") und
   merkt sich nichts (siehe tools/ScrumWerkstatt/bridge.js). Das
   Drehbuch blättert nur durch die Reiter: Board, Backlog, Team.

   Das Standbild für die Kachel ist ein leichter Nachbau des Boards:
   vier Spalten, ein paar Zettel, der letzte mit Haken. Gezeichnet
   mit festen Farben aus der Werkstatt (Papier, Petrol, Marker) — die
   Werkstatt hat ihr eigenes Kleid und kippt nicht in den Darkmode,
   also tut es ihr Bild auch nicht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Scrum Werkstatt', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    if (!await api.waitFor('.tab[data-view="backlog"]', 6000)) return;
    if (!await api.wait(3200)) return;
    api.click('.tab[data-view="backlog"]');
    if (!await api.wait(3000)) return;
    api.click('.tab[data-view="team"]');
    if (!await api.wait(2800)) return;
    api.click('.tab[data-view="history"]');
    if (!await api.wait(2600)) return;
    api.click('.tab[data-view="sprint"]');
    await api.wait(1500);
  }

  // Zettel: Spalte, Zeile, Farbe
  const NOTES = [
    [0, 0, '#fdf3a8'], [0, 1, '#cbe7f7'], [0, 2, '#dfd8f3'],
    [1, 0, '#cdebd2'], [1, 1, '#f8d4e0'],
    [2, 0, '#fdf3a8'],
    [3, 0, '#cbe7f7'], [3, 1, '#cdebd2']
  ];
  const HEADS = [['Sprint Backlog', '#8a8373'], ['In Arbeit', '#2b6694'], ['Prüfen', '#b5801a'], ['Fertig', '#2d7a4d']];

  function tile() {
    const colW = 78, x0 = 10;
    const cols = HEADS.map(([t, c], i) => `
      <rect x="${x0 + i * (colW + 4)}" y="30" width="${colW}" height="150" rx="5" fill="#fbf9f4" stroke="#d9d2c2"/>
      <circle cx="${x0 + i * (colW + 4) + 9}" cy="41" r="3" fill="${c}"/>
      <text x="${x0 + i * (colW + 4) + 16}" y="44.5" font-size="8.5" font-weight="700" fill="#514d43"
            letter-spacing=".04em">${t.toUpperCase()}</text>`).join('');
    const notes = NOTES.map(([c, r, f], i) => {
      const x = x0 + c * (colW + 4) + 8, y = 54 + r * 40;
      const rot = ((i * 7) % 5 - 2) * 0.9;
      return `<g transform="rotate(${rot} ${x + 31} ${y + 16})">
        <rect x="${x}" y="${y}" width="62" height="32" rx="2" fill="${f}"
              style="filter:drop-shadow(1px 2px 1.5px rgba(27,26,22,.22))"/>
        <rect x="${x + 6}" y="${y + 8}" width="${34 + (i % 3) * 7}" height="3.5" rx="1.5" fill="rgba(0,0,0,.28)"/>
        <rect x="${x + 6}" y="${y + 15}" width="${24 + (i % 2) * 10}" height="3" rx="1.5" fill="rgba(0,0,0,.16)"/>
        ${c === 3 ? `<path d="M${x + 46} ${y + 22}l3 3 6-7" fill="none" stroke="#2d7a4d" stroke-width="2.2"
                          stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      </g>`;
    }).join('');
    return `<div class="tprev" aria-hidden="true" style="background:#e8e2d5">
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">
        <rect x="0" y="0" width="340" height="22" fill="#17302e"/>
        <rect x="8" y="5" width="12" height="12" rx="3" fill="#ca5a1c"/>
        <text x="26" y="15" font-size="9" font-weight="700" fill="#eef3f1">Sprint 2 · Messreihe auswerten</text>
        <rect x="236" y="7" width="64" height="5" rx="2.5" fill="rgba(0,0,0,.35)"/>
        <rect x="236" y="7" width="38" height="5" rx="2.5" fill="#e8954f"/>
        ${cols}${notes}
      </svg>
    </div>`;
  }

  window.MPPreview.register('scrum', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Projektarbeit nach Scrum: Das Team formuliert sein <strong>Product Goal</strong>,
         schreibt User Stories ins <strong>Product Backlog</strong>, plant Sprints und
         schiebt Zettel über das Board. Review, Retro und Archiv halten fest, was
         geschafft wurde.</p>
      <p><strong>Ein Raum ist ein Team.</strong> Wer beitritt, wählt: Teammitglied oder
         Beobachter. Mitglieder bekommen einen persönlichen Code und finden ihr Team
         damit auf jedem Gerät wieder — ohne Konto, auch bei geschlossener Tür.</p>`
  });
})();
