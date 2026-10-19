/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/balance.js   ·   Schaufenster für Balance of Nature
   ══════════════════════════════════════════════════════════════
   Im Modal läuft die ECHTE Simulation im Rahmen, mit ?demo=1 — dann
   erzählt sie ihre Geschichte von selbst (tools/balance of nature/
   js/ui/demo.js): die Insel mit Wölfen und Hirschen samt Seitenleiste
   und echten Diagrammen (Jahresmittel, 90 Jahre im Zeitraffer), dann
   landen Menschen, legen eine Schafweide an, und die Schafe brechen
   aus. Die Schleife steckt im Rahmen; das Drehbuch hier wartet nur.

   Das Standbild für die Kachel ist bewusst abstrakt (siehe tile()):
   Beute und Räuber als Punktgruppen und als zwei versetzte Wellen.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Balance of Nature', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  async function play(api) {
    if (!await api.waitFor('.chart canvas', 15000)) return;
    await api.wait(60000);
  }

  /* ── Das Standbild: abstrakt, nicht die Insel ─────────────────
     Wie bei den anderen Kacheln zeigt sie nicht das Spiel, sondern
     den einen Gedanken dahinter: Beute und Räuber schwanken, und der
     Räuber hinkt eine Viertelwelle hinterher. Links zwei Gruppen aus
     Punkten (viele Hirsche, wenige Wölfe), rechts ihre Kurven über
     die Zeit. Farben aus der App (js/ui/app.js): Zwerghirsch orange,
     Inselwolf violett.

     Beim Darüberfahren läuft ein Zeitstrich durch das Diagramm, und
     die Gruppen links wachsen und schrumpfen im selben Takt wie ihre
     Kurve (style.css, .bnp-*). Eine Welle = T = 3 s, zwei Wellen im
     Bild, der Strich braucht also 6 s. */
  const PREY = '#d95926', PRED = '#9085e9';
  const INK = '#1c2530', INK3 = '#7a8594', LINE = '#d6dae2';
  const CX0 = 132, CX1 = 326, CY = 98;          // Diagramm: x-Bereich, Mittellinie

  function wave(amp, lag) {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      const x = CX0 + (CX1 - CX0) * u;
      const y = CY - amp * Math.sin(2 * Math.PI * 2 * u - lag);
      pts.push(x.toFixed(1) + ',' + y.toFixed(1));
    }
    return pts.join(' ');
  }

  // Punkte in einem lockeren Kreis — fest gestreut, damit das Bild
  // bei jedem Laden dasselbe ist.
  function herd(cx, cy, n, r, col, spread) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, d = spread * Math.sqrt((i + .5) / n);
      out += `<circle cx="${(cx + d * Math.cos(a)).toFixed(1)}" cy="${(cy + d * Math.sin(a)).toFixed(1)}" r="${r}" fill="${col}"/>`;
    }
    return out;
  }

  function tile() {
    return `<div class="tprev tprev--bn" aria-hidden="true">
      <svg class="bnp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <!-- Links: die beiden Gruppen. -->
        <g class="bnp-herd bnp-prey" style="transform-origin:62px 62px">${herd(62, 62, 14, 4.2, PREY, 26)}</g>
        <text x="62" y="108" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">Beute</text>
        <g class="bnp-herd bnp-pred" style="transform-origin:62px 140px">${herd(62, 140, 4, 5.4, PRED, 13)}</g>
        <text x="62" y="174" text-anchor="middle" font-size="9" font-weight="700" fill="${INK}">Räuber</text>

        <!-- Rechts: Bestand über die Zeit. -->
        <line x1="${CX0}" x2="${CX1}" y1="160" y2="160" stroke="${LINE}" stroke-width="1.2"/>
        <line x1="${CX0}" x2="${CX0}" y1="28" y2="160" stroke="${LINE}" stroke-width="1.2"/>
        <text x="${CX0}" y="20" font-size="8" font-weight="700" fill="${INK3}">Bestand</text>
        <text x="${CX1}" y="174" text-anchor="end" font-size="8" fill="${INK3}">Zeit →</text>
        <polyline points="${wave(42, 0)}" fill="none" stroke="${PREY}" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${wave(26, Math.PI / 2)}" fill="none" stroke="${PRED}" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round"/>
        <line class="bnp-now" x1="${CX0}" x2="${CX0}" y1="30" y2="160" stroke="${INK}" stroke-width="1.4" stroke-dasharray="3 3"/>
      </svg>
    </div>`;
  }

  window.MPPreview.register('balance', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Eine <strong>Insel mit eigenem Ökosystem</strong>: Zwerghirsche, Laufvögel, Inselwölfe und
         Inseladler, dazu Pflanzen, Jahreszeiten und gute wie magere Jahre. Die Klasse
         programmiert nichts, sie <strong>beobachtet und greift ein</strong>.</p>
      <p>Im Raum gibt es <strong>vier Szenarien</strong>: Wolf und Hirsch · Adler und Laufvogel ·
         alle vier · alle vier mit Menschen. Die Lehrkraft startet sie für sich oder
         <strong>teilt</strong> sie mit der Klasse und kann sie wieder entziehen. Hinter dem
         <em>i</em> jeder Kachel stehen kurze Infos für den Unterricht: Räuber-Beute-Wellen,
         knappe Nahrung, eingeschleppte Arten.</p>
      <p>Jedes Tablet rechnet seine eigene Insel. Diagramme, Todesursachen und Karten für die
         Menschen (Landung, Schafweide, Jagd, Ratten …) gehören dazu. Der Skill ist noch in der
         <strong>Beta</strong>.</p>`
  });
})();
