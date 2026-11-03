/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/diagramm.js   ·   Schaufenster für „Diagramm"
   ══════════════════════════════════════════════════════════════
   Im Modal läuft das echte Werkzeug (tools/Diagramm/tool.js) in der
   Rolle der Lehrkraft mit ctx.preview: es fragt dann keinen Server,
   sondern zeigt eine erfundene Klasse (DEMO_PEOPLE in tool.js) —
   Mia und Leon nebeneinander, Leon „zeichnet" noch und läuft mit.

   Drehbuch: Vergleich ansehen → Emmas Mindmap dazunehmen → zurück
   zu Mia + Leon → „Mein Diagramm": Wirkungsgefüge wählen und eine
   Größe anlegen.

   Das Standbild für die Kachel (tile()): zwei Diagramme im geteilten
   Bildschirm, links eine Mindmap, rechts ein Wirkungsgefüge.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Diagramm', code: 'DEMO', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    if (!await api.waitFor('.dg-cmp .dg-node', 8000)) return;
    api.caption('Zwei Diagramme der Klasse nebeneinander vergleichen');
    if (!await api.wait(6000)) return;
    api.caption('Was gerade gezeichnet wird, läuft vorne mit');
    if (!await api.wait(5000)) return;
    api.caption('Ein anderes Diagramm dazunehmen');
    api.click('.dg-li[data-pp="d3"]');
    if (!await api.wait(4000)) return;
    api.click('.dg-li[data-pp="d1"]');
    if (!await api.wait(3500)) return;
    api.caption('Selbst zeichnen: Mindmap, Wirkungsgefüge, Klassen- und Objektdiagramm');
    api.click('.dg-tab[data-tab="own"]');
    if (!await api.wait(3500)) return;
    api.click('[data-pick="wirkung"]');
    if (!await api.wait(1200)) return;
    api.click('[data-act="add"][data-type="box"]');
    if (!await api.wait(400)) return;
    if (!await api.type('.dg-edit textarea', 'Niederschlag')) return;
    if (!await api.wait(2500)) return;
    api.click('[data-act="editok"]');
    if (!await api.wait(2000)) return;
    api.caption('');
    api.click('.dg-tab[data-tab="class"]');
    await api.wait(1000);
  }

  /* ── Standbild ───────────────────────────────────────────── */
  const node = (x, y, w, t, f, s, rx) =>
    `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="22" rx="${rx}" fill="${f}" stroke="${s}" stroke-width="1.5"/>`
    + `<text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" fill="#0f172a">${t}</text>`;
  const sign = (x, y, plus) =>
    `<circle cx="${x}" cy="${y}" r="7" fill="${plus ? '#16a34a' : '#dc2626'}" stroke="#fff" stroke-width="1.4"/>`
    + `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${plus ? '+' : '−'}</text>`;

  function tile() {
    return `<div class="tprev tprev--dg" aria-hidden="true">
      <svg viewBox="0 0 340 186" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;font-family:system-ui,sans-serif">
        <g>
          <rect x="8" y="8" width="158" height="170" rx="10" fill="#fbfcfc" stroke="#dfe7e5"/>
          <circle cx="20" cy="21" r="6" fill="#2563eb"/><text x="20" y="24" text-anchor="middle" font-size="8" font-weight="800" fill="#fff">1</text>
          <text x="31" y="25" font-size="10" font-weight="700" fill="#0d1a17">Emma</text>
          <path d="M86 102 C104 102 104 72 118 72" fill="none" stroke="#16a34a" stroke-width="2.5"/>
          <path d="M86 102 C104 102 104 132 118 132" fill="none" stroke="#db2777" stroke-width="2.5"/>
          <path d="M60 102 C44 102 44 72 32 72" fill="none" stroke="#d97706" stroke-width="2.5"/>
          <path d="M60 102 C44 102 44 132 32 132" fill="none" stroke="#7c3aed" stroke-width="2.5"/>
          <ellipse cx="73" cy="102" rx="28" ry="14" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
          <text x="73" y="106" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">Wald</text>
          ${node(136, 72, 40, 'Tiere', '#dcfce7', '#16a34a', 10)}
          ${node(136, 132, 40, 'Boden', '#fce7f3', '#db2777', 10)}
          ${node(26, 72, 40, 'Klima', '#fef3c7', '#d97706', 10)}
          ${node(26, 132, 40, 'Wasser', '#ede9fe', '#7c3aed', 10)}
        </g>
        <g>
          <rect x="174" y="8" width="158" height="170" rx="10" fill="#fbfcfc" stroke="#dfe7e5"/>
          <circle cx="186" cy="21" r="6" fill="#2563eb"/><text x="186" y="24" text-anchor="middle" font-size="8" font-weight="800" fill="#fff">2</text>
          <text x="197" y="25" font-size="10" font-weight="700" fill="#0d1a17">Leon</text>
          <path d="M224 62 Q253 50 281 62" fill="none" stroke="#334155" stroke-width="1.4"/><path d="M276 57l6 5-7 3z" fill="#334155"/>
          <path d="M281 82 Q253 94 224 82" fill="none" stroke="#334155" stroke-width="1.4"/><path d="M229 87l-6-5 7-3z" fill="#334155"/>
          <path d="M240 145 L210 84" fill="none" stroke="#334155" stroke-width="1.4"/><path d="M208 90l2-7 4 6z" fill="#334155"/>
          ${node(208, 72, 44, 'Hasen', '#fff', '#16a34a', 4)}
          ${node(298, 72, 44, 'Füchse', '#fff', '#ea580c', 4)}
          ${node(252, 155, 40, 'Gras', '#fff', '#16a34a', 4)}
          ${sign(253, 56, true)}${sign(253, 88, false)}${sign(226, 116, true)}
        </g>
      </svg>
    </div>`;
  }

  window.MPPreview.register('diagramm', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Ein <strong>Zeichenwerkzeug für Diagramme</strong>, schlank wie Papier: Mindmap,
         Wirkungsgefüge (mit + und − und Kreisläufen), Klassen- und Objektdiagramm nach UML.
         Bausteine antippen, an den blauen Punkten verbinden, doppelt tippen zum Schreiben.</p>
      <p>Jedes Kind zeichnet auf seinem Tablet, gespeichert wird von selbst. Die Lehrkraft holt
         <strong>ein oder zwei Diagramme nebeneinander</strong> an den Beamer – sie laufen live mit,
         während weitergezeichnet wird. Beim Anlegen des Raums lässt sich die Diagrammart festlegen.</p>`
  });
})();
