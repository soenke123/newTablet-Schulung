/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/sqlstudio.js   ·   Schaufenster für SQL Studio
   ══════════════════════════════════════════════════════════════
   Im Modal läuft das ECHTE SQL Studio im Rahmen, mit ?demo=1 und
   ohne Raum (tools/SQLStudio/tool.js): die App steht dann in der
   Betriebsart „allein", hält ihre Datenbanken nur im Arbeitsspeicher
   und schreibt nichts in localStorage (DEMO in js/app.js). Sie fragt
   den Server also nie — die gefälschten Handlungen aus lib/preview.js
   bleiben unberührt.

   Das Drehbuch: in der Vorlage „Haustiere" eine Abfrage mit JOIN
   tippen und ausführen, die Tabelle im Reiter Daten ansehen, dann das
   Klassendiagramm — und zum Schluss die größere Vorlage „Schule" im
   Diagramm. Geklickt wird auf feste IDs/Attribute der App (#btnRun,
   .tab[data-tab], [data-open]).

   Das Standbild für die Kachel (tile()): ein Editor mit drei Zeilen
   SQL, darunter das Ergebnis, rechts zwei Tabellen mit Fremdschlüssel.
   Beim Darüberfahren läuft die Abfrage noch einmal.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'SQL Studio', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  const QUERY =
    'SELECT t.name, t.art, b.vorname AS besitzer\n' +
    'FROM tier t\n' +
    'JOIN besitzer b ON b.id = t.besitzer_id\n' +
    "WHERE t.art = 'Hund';";

  async function play(api) {
    if (!await api.waitFor('.res-empty, .rc-h', 15000)) return;
    if (!await api.waitFor('[data-open="sample:haustiere"].on', 8000)) return;
    if (!await api.wait(1200)) return;

    api.caption('SQL schreiben und ausführen');
    if (!await api.type('.ed-ta', QUERY)) return;
    if (!await api.wait(500)) return;
    api.click('#btnRun');
    if (!await api.wait(3800)) return;

    api.caption('Daten ansehen und ändern');
    api.click('.tab[data-tab="data"]');
    if (!await api.wait(3200)) return;

    api.caption('Das Klassendiagramm der Datenbank');
    api.click('.tab[data-tab="diagram"]');
    if (!await api.wait(3600)) return;

    api.click('[data-open="sample:schule"]');
    if (!await api.wait(5000)) return;

    // Zurück an den Anfang.
    api.caption('');
    api.click('[data-open="sample:haustiere"]');
    if (!await api.waitFor('[data-open="sample:haustiere"].on', 5000)) return;
    api.click('.tab[data-tab="sql"]');
    await api.wait(900);
  }

  /* ── Das Standbild ─────────────────────────────────────────────
     Farben über Klassen in style.css (.sqp-*), damit die Kachel mit
     dem Kleid der Seite kippt — wie die App selbst. Mono-Schrift wie
     im Editor der App; 5,7 px je Zeichen bei 9,5 px. */
  const MW = 5.7;

  // Zeile Code als Folge von [Text, Klasse].
  const CODE = [
    [['SELECT', 'kw'], [' name, art', '']],
    [['FROM', 'kw'], [' tier', '']],
    [['WHERE', 'kw'], [' art = ', ''], ["'Hund'", 'str'], [';', '']]
  ];
  const ROWS = [['Bello', 'Hund'], ['Rex', 'Hund'], ['Nala', 'Hund']];

  function codeLine(parts, x, y) {
    let cx = x;
    return parts.map(([t, c]) => {
      const out = `<text x="${cx.toFixed(1)}" y="${y}" class="sqp-code${c ? ' sqp-' + c : ''}" xml:space="preserve">${t}</text>`;
      cx += t.length * MW;
      return out;
    }).join('');
  }

  function box(x, y, w, name, cols) {
    const h = 18 + cols.length * 13 + 4;
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="sqp-card"/>
      <path d="M${x} ${y + 6}a6 6 0 0 1 6-6h${w - 12}a6 6 0 0 1 6 6v12h-${w}z" class="sqp-bh"/>
      <text x="${x + 7}" y="${y + 13}" class="sqp-bt">${name}</text>
      ${cols.map(([c, k], i) => {
        const cy = y + 30 + i * 13;
        return (k ? `<rect x="${x + 6}" y="${cy - 7.5}" width="13" height="9" rx="2" class="sqp-${k.toLowerCase()}"/>
                     <text x="${x + 12.5}" y="${cy - 0.8}" text-anchor="middle" class="sqp-kt">${k}</text>` : '')
          + `<text x="${x + 23}" y="${cy}" class="sqp-col">${c}</text>`;
      }).join('')}
    </g>`;
  }

  function tile() {
    return `<div class="tprev tprev--sq" aria-hidden="true">
      <svg class="sqp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <!-- Editor -->
        <rect x="10" y="10" width="170" height="86" rx="10" class="sqp-card"/>
        <rect x="18" y="18" width="64" height="16" rx="8" class="sqp-run"/>
        <path d="M27 22.5v7l6-3.5z" class="sqp-run-ic"/>
        <text x="37" y="29.5" class="sqp-run-t">Ausführen</text>
        ${CODE.map((p, i) => `<text x="20" y="${53 + i * 14}" class="sqp-ln">${i + 1}</text>` + codeLine(p, 32, 53 + i * 14)).join('')}

        <!-- Ergebnis -->
        <rect x="10" y="104" width="170" height="76" rx="10" class="sqp-card"/>
        <text x="20" y="120" class="sqp-ok">✓ 3 Zeilen</text>
        <line x1="20" x2="170" y1="127" y2="127" class="sqp-grid"/>
        <text x="22" y="137" class="sqp-th">name</text>
        <text x="96" y="137" class="sqp-th">art</text>
        ${ROWS.map(([a, b], i) => `<g class="sqp-row" style="--i:${i}">
          <text x="22" y="${151 + i * 12}" class="sqp-td">${a}</text>
          <text x="96" y="${151 + i * 12}" class="sqp-td">${b}</text></g>`).join('')}

        <!-- Diagramm: tier n — 1 besitzer -->
        ${box(250, 12, 80, 'besitzer', [['id', 'PK'], ['vorname', ''], ['wohnort', '']])}
        ${box(190, 96, 84, 'tier', [['id', 'PK'], ['name', ''], ['art', ''], ['besitzer_id', 'FK']])}
        <path d="M274 165H298V73" class="sqp-fk"/>
        <text x="279" y="161" class="sqp-mult">n</text>
        <text x="302" y="84" class="sqp-mult">1</text>
      </svg>
    </div>`;
  }

  window.MPPreview.register('sqlstudio', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Ein <strong>Datenbank-Werkzeug wie phpMyAdmin</strong>, entschlackt für die Schule:
         SQL schreiben und ausführen, Tabellen ansehen und bearbeiten, Struktur per Formular,
         dazu ein <strong>Klassendiagramm</strong> mit Schlüsseln und Beziehungen.</p>
      <p>Die Datenbanken laufen als <strong>SQLite im Browser</strong>, MySQL-Schreibweise wird
         übersetzt. Vorlagen (Haustiere, Schule, Bibliothek, Online-Shop) sind dabei; die Lehrkraft
         teilt eigene Datenbanken mit der Klasse und legt fest, ob nur <strong>abgefragt</strong>
         oder auch die <strong>Struktur geändert</strong> werden darf. Jedes Kind arbeitet auf
         seiner eigenen Kopie.</p>`
  });
})();
