/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/balance.js   ·   Schaufenster für Balance of Nature
   ══════════════════════════════════════════════════════════════
   Im Modal läuft die ECHTE Simulation im Rahmen, mit ?demo=1 — dann
   erzählt sie ihre Geschichte von selbst (tools/balance of nature/
   js/ui/demo.js): die Insel mit Wölfen und Hirschen samt Seitenleiste
   und echten Diagrammen (Jahresmittel, 90 Jahre im Zeitraffer), dann
   landen Menschen, legen eine Schafweide an, und die Schafe brechen
   aus. Die Schleife steckt im Rahmen; das Drehbuch hier wartet nur.

   Das Standbild für die Kachel (siehe tile()): eine vereinfachte
   Insel mit laufenden Punkten und daneben die wandernden Kurven.
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

  /* ── Das Standbild ─────────────────────────────────────────────
     Vereinfacht, aber erkennbar das Spiel: links eine Insel im Meer,
     auf der Punkte herumlaufen (orange = Beute, violett = Räuber),
     rechts das Diagramm, in dem die beiden Kurven durchlaufen. Keine
     Grafik aus der App, nur Flächen und Punkte. Farben der Tiere aus
     js/ui/app.js (Zwerghirsch orange, Inselwolf violett), etwas
     aufgehellt, damit sie auf dem dunklen Meer leuchten.

     Alles läuft im selben Takt T = 4 s (style.css, .bnp-*): die
     Kurven rücken je T eine Welle nach links, am rechten Rand ist
     „jetzt". Dort hat die Beute ihren Gipfel bei T/4 — und genau
     dann sind auf der Insel die meisten orangen Punkte zu sehen.
     Die Räuber hinken eine Viertelwelle hinterher, Kurve wie Punkte. */
  const PREY = '#ff7a3d', PRED = '#a493ff';
  const INK = '#e8f6fb', INK3 = '#9fc3d3';

  // Diagramm: Fenster rechts, anderthalb Wellen breit.
  const GX = 226, GW = 96, LAM = GW / 1.5, GY = 104;

  /* Eine Kurve als Band aus drei Wellen, das per CSS um eine Welle
     nach links rückt. Phase so gewählt, dass am rechten Fensterrand
     zur Zeit t gilt: Beute = sin(2πt/T), Räuber = sin(2πt/T − π/2). */
  function wave(amp, lag) {
    const pts = [];
    for (let i = 0; i <= 150; i++) {
      const xl = 3 * LAM * i / 150;
      const y = GY - amp * Math.sin(2 * Math.PI * xl / LAM + Math.PI - lag);
      pts.push((GX + xl).toFixed(1) + ',' + y.toFixed(1));
    }
    return pts.join(' ');
  }

  // Die Insel: eine unregelmäßige, geschlossene Kurve (Catmull-Rom).
  function blob(cx, cy, rx, ry, rad) {
    const P = rad.map((r, i) => {
      const a = i / rad.length * 2 * Math.PI;
      return [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)];
    });
    const n = P.length, f = v => v.toFixed(1);
    let d = `M${f(P[0][0])} ${f(P[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} `
         + `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  }
  const SHAPE = [1, .9, 1.02, .86, .95, 1.06, .9, .97, 1.04, .88];

  /* Die Tiere. [x, y, Laufweg 1–3, Dauer s, Gruppe]
     Gruppe: '' = immer da, 'a' = in guten Zeiten, 'b' = nur am Gipfel. */
  const DEER = [
    [70, 72, 1, 7, ''], [96, 60, 2, 9, ''], [124, 70, 3, 8, ''], [58, 104, 2, 10, ''],
    [142, 98, 1, 9, ''], [100, 128, 3, 7, ''],
    [84, 92, 3, 8, 'a'], [118, 112, 1, 10, 'a'], [150, 124, 2, 8, 'a'], [76, 126, 1, 9, 'a'],
    [108, 84, 2, 7, 'b'], [134, 84, 3, 9, 'b'], [62, 88, 1, 8, 'b'], [124, 136, 2, 10, 'b']
  ];
  const WOLF = [
    [92, 108, 2, 11, ''], [128, 58, 3, 12, ''],
    [154, 108, 1, 10, 'a'], [68, 120, 3, 11, 'b']
  ];
  function animals(list, col, r, kind) {
    return list.map(([x, y, w, dur, g], i) =>
      `<g class="bnp-a bnp-w${w}" style="animation-duration:${dur}s;animation-delay:-${(i * 1.7) % dur}s">`
      + `<circle class="${g ? `bnp-${kind}${g}` : ''}" cx="${x}" cy="${y}" r="${r}" fill="${col}"`
      + ` stroke="#fff" stroke-opacity=".85" stroke-width=".9"/></g>`).join('');
  }

  function tile() {
    const isl = blob(108, 98, 84, 62, SHAPE);
    const inner = blob(108, 98, 74, 53, SHAPE);
    return `<div class="tprev tprev--bn" aria-hidden="true">
      <svg class="bnp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="bnpWin"><rect x="${GX}" y="52" width="${GW}" height="104"/></clipPath>
          <radialGradient id="bnpSea" cx="32%" cy="52%" r="80%">
            <stop offset="0" stop-color="#0f6f8f"/><stop offset=".55" stop-color="#0a3f5e"/>
            <stop offset="1" stop-color="#061f33"/>
          </radialGradient>
          <radialGradient id="bnpShallow" cx="50%" cy="50%" r="50%">
            <stop offset=".7" stop-color="#3fd8d0" stop-opacity=".55"/>
            <stop offset="1" stop-color="#3fd8d0" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="bnpGrass" x1="0" y1="0" x2=".4" y2="1">
            <stop offset="0" stop-color="#8fe36b"/><stop offset="1" stop-color="#2f9e57"/>
          </linearGradient>
          <filter id="bnpGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect x="-80" y="-60" width="500" height="310" fill="url(#bnpSea)"/>
        <path d="M14 30q6-4 12 0t12 0M250 172q6-4 12 0t12 0M30 170q6-4 12 0t12 0M196 22q6-4 12 0t12 0"
              fill="none" stroke="#7fe9ff" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>

        <!-- Die Insel: Flachwasser, Strand, Wiese, ein paar Büsche. -->
        <path d="${blob(108, 98, 104, 82, SHAPE)}" fill="url(#bnpShallow)"/>
        <path d="${isl}" fill="#f4dc9a"/>
        <path d="${inner}" fill="url(#bnpGrass)"/>
        <g fill="#1f7a45" fill-opacity=".75">
          <circle cx="86" cy="76" r="9"/><circle cx="138" cy="116" r="11"/>
          <circle cx="122" cy="62" r="7"/><circle cx="66" cy="112" r="7"/>
        </g>

        <g filter="url(#bnpGlow)">
          ${animals(DEER, PREY, 3.6, 'd')}
          ${animals(WOLF, PRED, 4.8, 'v')}
        </g>

        <!-- Rechts: das Diagramm, dunkles Glas. -->
        <rect x="${GX - 12}" y="26" width="${GW + 24}" height="142" rx="10"
              fill="#061a2b" fill-opacity=".72" stroke="#7fe9ff" stroke-opacity=".25"/>
        <text x="${GX}" y="42" font-size="9" font-weight="700" fill="${INK}">Bestand</text>
        <circle cx="${GX + 4}" cy="160" r="3" fill="${PREY}"/>
        <text x="${GX + 10}" y="163" font-size="7.5" fill="${INK3}">Beute</text>
        <circle cx="${GX + 48}" cy="160" r="3" fill="${PRED}"/>
        <text x="${GX + 54}" y="163" font-size="7.5" fill="${INK3}">Räuber</text>
        <line x1="${GX}" x2="${GX + GW}" y1="148" y2="148" stroke="#7fe9ff" stroke-opacity=".2" stroke-width="1.2"/>
        <g clip-path="url(#bnpWin)">
          <g class="bnp-scroll" filter="url(#bnpGlow)">
            <polyline points="${wave(36, 0)}" fill="none" stroke="${PREY}" stroke-width="2.6"
                      stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="${wave(22, Math.PI / 2)}" fill="none" stroke="${PRED}" stroke-width="2.6"
                      stroke-linecap="round" stroke-linejoin="round"/>
          </g>
        </g>
        <line x1="${GX + GW}" x2="${GX + GW}" y1="54" y2="148" stroke="#fff" stroke-opacity=".45"
              stroke-width="1.2" stroke-dasharray="3 3"/>
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
         Menschen (Landung, Schafweide, Jagd, Ratten …) gehören dazu.</p>`
  });
})();
