/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/synir.js   ·   Schaufenster für SYNIR
   ══════════════════════════════════════════════════════════════
   Achtes Drehbuch, gebaut wie das von Wild Clusters: eine eigene
   Anwendung in einem <iframe>, und der Regisseur greift durch den
   Rahmen hindurch (q() in lib/preview.js sucht erst im Wirt, dann
   im Rahmen).

   ── Warum die Rolle 'presenter' ───────────────────────────────
   Was SYNIR im Raum von SYNIR allein unterscheidet, hat nur die
   Lehrkraft: Szenarien teilen, den Aufgabentext, „Stand der
   Klasse" mit der Spiegelung und „Schüler blind". Genau das will
   sehen, wer überlegt, ob er damit eine Stunde macht. Das Netz
   selbst sieht auf dem Tablet genauso aus.

   ── Der erfundene Server (show.server) ────────────────────────
   Drei Aufrufe beantwortet das Drehbuch selbst, damit die Auslage
   mehr zeigt als eine leere Liste:

     synir_scenarios_list  zwei „eigene" Szenarien, damit der Reiter
                           „Eigene" nicht leer dasteht
     synir_work_list       drei Kinder mit Stand
     synir_work_get        Mias Netz — ein anderes als das der
                           Lehrkraft, damit man sieht, DASS der
                           Beamer umspringt

   Mias Netz wird aus dem Rahmen gelesen (window.SZENARIEN): die
   mitgelieferten Szenarien liegen dort und nirgends sonst, und eine
   zweite Kopie hier veraltete beim nächsten Umbau still.

   Im Rahmen gilt `vorschau=1` (tool.js hängt es an die Adresse):
   kein Gerätespeicher, keine Rückfragen. In der Auslage darf nichts
   hängenbleiben, und eine Rückfrage, die niemand beantwortet,
   hielte das Drehbuch an.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return {
      role: ROLE,
      room: { title: 'SYNIR', code: 'SCHAU', settings: {} },
      state: { phase: 1, data: {} },
      limits: {},
      people: [
        { id: 'pv-mia', name: 'Mia', online: true },
        { id: 'pv-ben', name: 'Ben', online: true },
        { id: 'pv-lea', name: 'Lea', online: true }
      ],
      entries: []
    };
  }

  /* ─── Der erfundene Server ─────────────────────────────────── */
  const vorhin = (s) => new Date(Date.now() - s * 1000).toISOString();

  function frameWin() {
    const f = document.querySelector('#pvHost iframe');
    try { return (f && f.contentWindow) || null; } catch (e) { return null; }
  }

  function server(fn, args) {
    if (fn === 'synir_scenarios_list') {
      return { ok: true, items: [
        { id: 'pv-eigen-1', title: 'Routing mit zwei Routern' },
        { id: 'pv-eigen-2', title: 'Klassenarbeit: Fehlersuche' }
      ] };
    }
    if (fn === 'synir_work_list') {
      return { ok: true, items: [
        { participant: 'pv-mia', name: 'Mia', seat: 1, updated_at: vorhin(4),  titel: '4 · Fehlersuche', geraete: 6 },
        { participant: 'pv-ben', name: 'Ben', seat: 2, updated_at: vorhin(19), titel: '3 · Zwei Netze, ein Router', geraete: 7 },
        { participant: 'pv-lea', name: 'Lea', seat: 3, updated_at: vorhin(41), titel: '3 · Zwei Netze, ein Router', geraete: 7 }
      ] };
    }
    if (fn === 'synir_work_get') {
      const w = frameWin();
      const S = w && w.SZENARIEN;
      const key = args.p_participant === 'pv-mia' ? 'fehler' : 'router';
      const s = S && S[key];
      if (!s) return { ok: false, error: 'not_found' };
      // Nur beim ersten Mal „neu" — sonst legte jeder Takt das Netz
      // neu auf, und die Auslage flackerte alle drei Sekunden.
      if (args.p_since) return { ok: true, changed: false, updated_at: args.p_since };
      const stand = Object.assign(JSON.parse(JSON.stringify(s.netz)),
        { szenario: 'builtin:' + key, titel: s.titel, aufgabe: s.aufgabe });
      return { ok: true, changed: true, updated_at: vorhin(4), stand };
    }
    return { ok: false, error: 'unknown_fn' };
  }

  /* ─── Das Drehbuch ────────────────────────────────────────────
     Fünf Bilder, jedes beantwortet eine eigene Frage:

       1. Menü auf, Szenario teilen.     Wie kommt eine Aufgabe zur Klasse?
       2. Szenario laden, Auftrag lesen. Wie sieht so eine Aufgabe aus?
       3. „Aufgabentext" öffnen.         Kann ich eigene schreiben?
       4. Stand der Klasse → Mia.        Kann ich zeigen, was ein Kind gebaut hat?
       5. „Schüler blind".               Bekomme ich die Klasse wieder nach vorn?

     Danach wird alles zurückgestellt — mit denselben Knöpfen, die
     vorne auch ein Finger drückt. */
  async function play(api) {
    if (!await api.waitFor('#szenarioBtn', 20000)) return;
    if (!await api.waitFor('.sy-desk', 4000)) return;
    if (!await api.wait(900)) return;

    // 1 · Teilen
    api.click('#szenarioBtn');
    if (!await api.wait(1400)) return;
    api.click('.szm-item[data-id="builtin:router"] .szm-share');
    if (!await api.wait(1800)) return;

    // 2 · Laden. Der Auftrag liegt über der Fläche — erst lesen
    // lassen, dann einklappen, damit das Netz darunter zu sehen ist.
    api.click('.szm-item[data-id="builtin:router"] .szm-name');
    if (!await api.wait(3200)) return;
    api.click('#aufgabeHead');
    if (!await api.wait(1800)) return;

    // 3 · Aufgabentext
    api.click('#aufgabeBtn');
    if (!await api.wait(2800)) return;
    api.click('.sy-dlg [data-x]');
    if (!await api.wait(700)) return;

    // 4 · Stand der Klasse, Mia auf den Beamer
    api.click('#syList');
    if (!await api.wait(1600)) return;
    api.click('.sy-person[data-pid="pv-mia"]');
    if (!await api.wait(2600)) return;
    api.click('#aufgabeHead');
    if (!await api.wait(2400)) return;

    // 5 · Blind
    api.click('#syBlind');
    if (!await api.wait(2600)) return;
    api.click('#syBlind');
    if (!await api.wait(900)) return;

    // Zurückstellen
    api.click('#syStop');
    if (!await api.wait(600)) return;
    api.click('#syList');
    api.click('#szenarioBtn');
    if (!await api.wait(700)) return;
    api.click('.szm-item[data-id="builtin:router"] .szm-share');
    if (!await api.wait(900)) return;
    api.click('#szenarioBtn');
    await api.wait(1200);
  }

  /* ═══════════════════════════════════════════════════════════
     Das Standbild für die Kachel
     ═══════════════════════════════════════════════════════════
     Ein leichter Nachbau und nicht die Anwendung (28 Skripte für
     eine Kachel wären absurd). Nachgebaut ist das dritte
     mitgelieferte Szenario: zwei Netze, zwei Switches, ein Router
     dazwischen — mit den Adressen in den Farben ihres Subnetzes,
     so wie die Fläche sie zeigt.

     Beim Darüberfahren passiert das, worum es in SYNIR geht: ein
     Paket fliegt von E1 durch Switch und Router bis E3, das Kabel,
     auf dem es gerade ist, leuchtet, und im Terminal steht die
     Antwort. Genau EIN Kabel zur Zeit (siehe LIESMICH, „Flugzeit")
     — die Kachel hält sich an dieselbe Regel wie die Anwendung.

     Farben aus tools/synir/css/app.css (hell). aria-hidden: für eine
     Vorlesestimme ist das ein Bild.
     ═══════════════════════════════════════════════════════════ */

  const SURF = '#ffffff', LINE = '#c6cbdb', INK = '#171b24', INK3 = '#8891a6',
        SN0 = '#2f6fd6', SN1 = '#c26a12', ACC = '#0fb389';

  // Geräte: x, y (Mitte), Name, Art
  const DEV = {
    E1:  { x: 42,  y: 62,  n: 'E1',  k: 'host' },
    E2:  { x: 42,  y: 142, n: 'E2',  k: 'host' },
    SW1: { x: 112, y: 102, n: 'SW1', k: 'switch' },
    R1:  { x: 170, y: 102, n: 'R1',  k: 'router' },
    SW2: { x: 228, y: 102, n: 'SW2', k: 'switch' },
    E3:  { x: 298, y: 62,  n: 'E3',  k: 'host' },
    S1:  { x: 298, y: 142, n: 'S1',  k: 'server' }
  };
  const CAB = [['E1', 'SW1'], ['E2', 'SW1'], ['SW1', 'R1'], ['R1', 'SW2'], ['SW2', 'E3'], ['SW2', 'S1']];
  // Der Weg des Pakets: E1 → SW1 → R1 → SW2 → E3 (die Kabel 0, 2, 3, 4)
  const WEG = [0, 2, 3, 4];

  function icon(k, x, y) {
    const s = 'fill="none" stroke="' + INK + '" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
    if (k === 'host') return `<g ${s}><rect x="${x - 7}" y="${y - 5}" width="14" height="9" rx="1"/><path d="M${x - 9} ${y + 7}h18"/></g>`;
    if (k === 'server') return `<g ${s}><rect x="${x - 6}" y="${y - 7}" width="12" height="6" rx="1"/><rect x="${x - 6}" y="${y + 1}" width="12" height="6" rx="1"/></g>`;
    if (k === 'switch') return `<g ${s}><rect x="${x - 9}" y="${y - 4}" width="18" height="7" rx="1"/><path d="M${x - 5} ${y + 3}v3M${x} ${y + 3}v3M${x + 5} ${y + 3}v3"/></g>`;
    return `<g ${s}><circle cx="${x}" cy="${y}" r="7.5" stroke="${ACC}"/><path d="M${x - 4} ${y - 2}h8l-2.5-2.5M${x + 4} ${y + 2}h-8l2.5 2.5" stroke="${ACC}"/></g>`;
  }

  function tileHTML() {
    const cables = CAB.map(([a, b], i) => {
      const A = DEV[a], B = DEV[b];
      return `<line class="syp-cab${WEG.indexOf(i) >= 0 ? ' syp-weg syp-w' + WEG.indexOf(i) : ''}"
                    x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
    }).join('');

    const nodes = Object.keys(DEV).map(id => {
      const d = DEV[id];
      return `<g class="syp-node">
        <rect x="${d.x - 16}" y="${d.y - 17}" width="32" height="30" rx="7"
              fill="${SURF}" stroke="${LINE}"/>
        <text x="${d.x}" y="${d.y - 8}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${INK}">${d.n}</text>
        ${icon(d.k, d.x, d.y + 3)}
      </g>`;
    }).join('');

    // Adressen in der Farbe ihres Subnetzes: Netzteil farbig, Gerät dunkel.
    const ip = (x, y, net, host, c) =>
      `<text x="${x}" y="${y}" text-anchor="middle" font-size="7" font-family="ui-monospace, Menlo, Consolas, monospace">`
      + `<tspan fill="${c}" font-weight="700">${net}</tspan><tspan fill="${INK}" font-weight="700">${host}</tspan></text>`;

    // Der Weg des Pakets als ein Streckenzug (für offset-path).
    const P = ['E1', 'SW1', 'R1', 'SW2', 'E3'].map(k => DEV[k].x + ' ' + DEV[k].y).join(' L ');

    return `<div class="tprev tprev--sy" aria-hidden="true">
      <svg class="syp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="sypGrid" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M14 0H0V14" fill="none" stroke="#d9dce6" stroke-width=".6"/>
          </pattern>
        </defs>
        <rect x="-60" y="-40" width="460" height="270" fill="#e9ebf1"/>
        <rect x="-60" y="-40" width="460" height="270" fill="url(#sypGrid)"/>

        <!-- Die beiden Subnetze als Flächen, so wie „Subnetze" sie färbt. -->
        <rect class="syp-sn" x="14" y="36" width="126" height="132" rx="16" fill="${SN0}" opacity=".07"/>
        <rect class="syp-sn" x="200" y="36" width="126" height="132" rx="16" fill="${SN1}" opacity=".08"/>

        ${cables}
        ${nodes}
        <!-- Über den Geräten: das Paket fliegt durch sie hindurch und
             soll dabei nicht hinter ihnen verschwinden. -->
        <circle class="syp-pkt" r="4.2" style="offset-path: path('M ${P}')"/>

        ${ip(42, 90, '192.168.1.', '10', SN0)}
        ${ip(42, 170, '192.168.1.', '11', SN0)}
        ${ip(298, 90, '192.168.2.', '10', SN1)}
        ${ip(298, 170, '192.168.2.', '20', SN1)}

        <!-- Das Terminal: beim Darüberfahren kommt die Antwort. -->
        <g class="syp-term">
          <rect x="96" y="140" width="148" height="36" rx="7" fill="#12151f"/>
          <text x="104" y="154" font-size="7" fill="#eef0f8"
                font-family="ui-monospace, Menlo, Consolas, monospace">&gt; ping 192.168.2.10</text>
          <text class="syp-ant" x="104" y="167" font-size="7" fill="${ACC}"
                font-family="ui-monospace, Menlo, Consolas, monospace">Antwort von 192.168.2.10</text>
        </g>

        <!-- Oben: das Menü mit einem geteilten Szenario. -->
        <g class="syp-menu">
          <rect x="196" y="8" width="136" height="20" rx="10" fill="${ACC}" opacity=".18" stroke="${ACC}" stroke-opacity=".55"/>
          <text x="206" y="21.5" font-size="7.5" fill="${INK}">Zwei Netze, ein Router</text>
          <rect x="296" y="11" width="32" height="14" rx="7" fill="${ACC}"/>
          <text x="312" y="20.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="#fff">geteilt</text>
        </g>
        <text x="14" y="22" font-size="11" font-weight="800" letter-spacing=".5" fill="#4fc3f7">SYN<tspan fill="#16295c">IR</tspan></text>
        <text x="60" y="21.5" font-size="6.5" fill="${INK3}">Class Wide Web</text>
      </svg>
    </div>`;
  }

  window.MPPreview.register('synir', {
    role: ROLE,
    view, play, server, tile: tileHTML,

    /* Breite Bühne wie bei NeuroLab und Wild Clusters: das hier ist
       eine ganze Anwendung (Kopfleiste, Geräteleiste, Fläche,
       Mitschnitt) und darüber das Pult der Lehrkraft. */
    wide: true,
    fade: false,

    blurb: `
      <p>Ein <strong>Netzwerksimulator</strong> nach dem Vorbild von Filius: Geräte auf die
         Fläche ziehen, verkabeln, Adressen vergeben — und dann zusehen, wie jedes Paket
         über jedes Kabel fliegt. ARP, DHCP, DNS, Routing, TCP, Web und E-Mail laufen
         Schicht für Schicht im Mitschnitt mit.</p>
      <p>Die Lehrkraft entscheidet, welche <strong>Szenarien</strong> die Klasse bekommt:
         ein Tipp auf das Symbol dahinter gibt frei, geteilte sind grün. Eigene Szenarien
         samt <strong>Aufgabentext</strong> lassen sich speichern und in jedem neuen Raum
         wiederverwenden.</p>
      <p>Über <strong>Stand der Klasse</strong> kommt das Netz eines Kindes auf den Beamer
         und folgt ihm live — bis die Lehrkraft selbst etwas ändert, dann ist es ihre Kopie.
         Mit <strong>Schüler blind</strong> zeigen alle Tablets nur noch das Logo: „Wir
         machen jetzt am Beamer weiter."</p>`
  });
})();
