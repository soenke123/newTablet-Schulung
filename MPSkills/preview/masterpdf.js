/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/masterpdf.js   ·   Schaufenster für Master PDF Skill
   ══════════════════════════════════════════════════════════════
   Wie bei Scrum und Tiny LM läuft im Modal die ECHTE App im Rahmen,
   mit ?demo=1 — dann öffnet sie ein erfundenes Beispieldokument (ein
   Elternbrief mit Markierung, Kreis, Pfeil und Kommentaren, siehe
   tools/Master PDF Skill/js/demo.js) und merkt sich nichts. Master PDF
   hat keinen Raum und keinen Server; das Drehbuch ruft deshalb keine
   einzige Handlung auf. Es zeigt: lesen → Bearbeiten → Zeichnen →
   Kommentieren mit Kommentarliste → zurück ins Lesen.

   Das Standbild für die Kachel ist ein leichter Nachbau: Kopfleiste,
   Seitenleiste mit drei Miniaturen und ein Blatt mit Markierung, Kreis
   und Notiz. Feste Farben aus der App (Marine, Blau) — die App hat ihr
   eigenes Kleid und kippt nicht in den Darkmode, also tut es ihr Bild
   auch nicht.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Master PDF Skill', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    // Die App baut das Beispieldokument erst, wenn pdf.js geladen ist.
    if (!await api.waitFor('.reader-page canvas', 12000)) return;
    if (!await api.wait(3200)) return;
    api.click('#mode-edit');
    if (!await api.wait(2400)) return;
    api.click('#tab-draw');
    if (!await api.wait(3000)) return;
    api.click('#tab-comment');
    if (!await api.wait(2600)) return;
    api.click('#comment-list-toggle');
    if (!await api.wait(3200)) return;
    api.click('#mode-read');
    await api.wait(1500);
  }

  function tile() {
    const line = (x, y, w, c) => `<rect x="${x}" y="${y}" width="${w}" height="3.2" rx="1.6" fill="${c || '#c5ccd8'}"/>`;
    const thumb = (y, sel, extra) => `
      <rect x="12" y="${y}" width="46" height="60" rx="3" fill="#fff" stroke="${sel ? '#2f5fd0' : '#d5dbe6'}" stroke-width="${sel ? 1.6 : 1}"/>
      <rect x="12" y="${y}" width="46" height="4" fill="#1d5955"/>
      ${line(18, y + 12, 28, '#9aa6bb')}${line(18, y + 20, 34)}${line(18, y + 26, 30)}${line(18, y + 32, 33)}${extra || ''}`;
    return `<div class="tprev" aria-hidden="true" style="background:#e8edf5">
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">
        <rect x="0" y="0" width="340" height="24" fill="#fff"/>
        <rect x="0" y="24" width="340" height="1" fill="#d5dbe6"/>
        <rect x="8" y="3" width="18" height="18" rx="5" fill="#16465a"/>
        <text x="17" y="15.5" font-size="6.5" font-weight="800" fill="#fff" text-anchor="middle">PDF</text>
        <text x="31" y="15.5" font-size="8.5" fill="#172b4d">Master <tspan font-weight="700">PDF Skill</tspan></text>
        <rect x="112" y="5" width="86" height="14" rx="7" fill="#eef1f6"/>
        <rect x="114" y="7" width="40" height="10" rx="5" fill="#fff"/>
        <text x="134" y="14.5" font-size="6" font-weight="700" fill="#2f5fd0" text-anchor="middle">Lesemodus</text>
        <text x="176" y="14.5" font-size="6" fill="#5a6577" text-anchor="middle">Bearbeiten</text>
        <rect x="262" y="5" width="34" height="14" rx="4" fill="#2f5fd0"/>
        <rect x="300" y="5" width="34" height="14" rx="4" fill="#fff" stroke="#d5dbe6"/>
        <rect x="0" y="25" width="70" height="165" fill="#fbfcfe"/>
        <rect x="70" y="25" width="1" height="165" fill="#d5dbe6"/>
        ${thumb(34, true)}${thumb(100, false)}
        <rect x="112" y="32" width="170" height="170" rx="2" fill="#fff" style="filter:drop-shadow(0 2px 4px rgba(23,43,77,.2))"/>
        <rect x="112" y="32" width="170" height="7" fill="#1d5955"/>
        <rect x="128" y="50" width="52" height="4" rx="2" fill="#9aa6bb"/>
        <rect x="128" y="62" width="104" height="9" rx="2" fill="#172b4d"/>
        ${line(128, 84, 138)}${line(128, 93, 126)}${line(128, 102, 134)}
        <rect x="126" y="109" width="116" height="9" fill="#fde047" opacity=".6"/>
        ${line(128, 111, 108, '#8d97a8')}${line(128, 126, 120)}
        <ellipse cx="190" cy="141" rx="62" ry="9" fill="none" stroke="#dc2626" stroke-width="1.6"/>
        ${line(128, 139.5, 96, '#8d97a8')}
        <path d="M262 112 L242 134" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M242 134 l1 -7 M242 134 l7 -2" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
        <g transform="translate(258 70)"><rect width="15" height="13" rx="2.5" fill="#facc15"/>
          <path d="M3 13 l0 4 l4 -4" fill="#facc15"/>${line(3.5, 4, 8, '#7a5c00')}${line(3.5, 8, 6, '#7a5c00')}</g>
        <rect x="294" y="64" width="40" height="68" rx="4" fill="#fff" stroke="#d5dbe6"/>
        <text x="299" y="76" font-size="6" font-weight="700" fill="#172b4d">Kommentare</text>
        <rect x="299" y="82" width="30" height="16" rx="3" fill="#fef9c3"/>${line(302, 86, 20, '#7a5c00')}${line(302, 91, 14, '#7a5c00')}
        <rect x="299" y="103" width="30" height="16" rx="3" fill="#e0f2fe"/>${line(302, 107, 18, '#075985')}${line(302, 112, 22, '#075985')}
      </svg>
    </div>`;
  }

  window.MPPreview.register('masterpdf', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>PDFs <strong>lesen, sortieren und bearbeiten</strong> — direkt im Browser, ohne Raum
         und ohne Anmeldung. Die Datei bleibt auf deinem Gerät: nichts wird hochgeladen
         („Lokal verarbeitet").</p>
      <p><strong>Lesen:</strong> alle Seiten untereinander oder paarweise, Zoom, Textsuche,
         Vollbild. <strong>Seiten:</strong> sortieren per Drag &amp; Drop, drehen, doppeln, löschen,
         leere Seiten einfügen und mehrere PDFs zu einer zusammenfügen — mit Rückgängig und
         Wiederholen. <strong>Zeichnen:</strong> Stift, Textmarker, Linien, Pfeile, Rechtecke und
         Ellipsen mit Radierer. <strong>Kommentieren:</strong> echte PDF-Kommentare — Notizen,
         Markierungen, Unterstreichen, Textfelder —, auch vorhandene Kommentare aus anderen
         Programmen werden eingelesen und stehen in der Kommentarliste.</p>
      <p>Am Ende exportierst du das ganze Dokument, die aktuelle Seite oder eine Auswahl
         (z. B. <em>1-3, 5</em>) als neue PDF. Das Beispiel oben ist ein erfundener Elternbrief.
         Der Skill ist noch in der <strong>Beta</strong>.</p>`
  });
})();
