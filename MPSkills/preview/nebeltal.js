/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/nebeltal.js   ·   Schaufenster für Nebeltal
   ══════════════════════════════════════════════════════════════
   Im Modal läuft das ECHTE Nebeltal im Rahmen (wie Reinforce
   Yourself), mit ?demo=1: kein Raum, alle Level offen, Bestwerte
   und Welt-Nummer nur im Arbeitsspeicher (js/spiel.js, LS).

   Drehbuch: Übersicht → Level 3 „Sprünge“ (ein paar Sprünge in
   Pfeilrichtung, dann Lernrate größer → weitere Sprünge, Fertig)
   → Übersicht → Level 5 „Pinguine sortieren“ (Training starten:
   das Neuron springt von selbst bergab, die Trennlinie wandert)
   → Übersicht. Geklickt wird nur auf feste ids bzw. data-lv.

   Das Standbild für die Kachel (tile()) zeigt die Idee des Skills
   im Querschnitt: eine Landschaft im Nebel, Höhe = Fehler, der
   Pinguin (Sönkes Zeichnung „Pinguin Main“ mit Schal) sieht nur
   seine Stelle und den Bergab-Pfeil (Gradient). Beim Darüberfahren
   lichtet sich der Nebel, er springt in immer kürzeren Sprüngen
   ins Tal (Lernrate × Steilheit), und rechts oben fällt die
   Fehlerkurve. Klassen .ntp-* in style.css.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';

  function view() {
    return { role: ROLE, room: { title: 'Nebeltal', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  const lvTile = lv => `#levels .tile[data-lv="${lv}"]`;
  const GO = '#card:not([hidden]) .card-btns .btn.primary';

  async function play(api) {
    if (!await api.waitFor(lvTile(3), 15000)) return;
    api.caption('Wie lernt eine KI? Sie sucht im Nebel den tiefsten Punkt');
    if (!await api.wait(3200)) return;

    // Level 3: springen mit Lernrate
    api.click(lvTile(3));
    if (!await api.waitFor(GO, 5000)) return;
    api.caption('Level 3 · Du springst immer in Pfeilrichtung – bergab');
    if (!await api.wait(3600)) return;
    api.click(GO);
    if (!await api.waitFor('#btnJump', 3000)) return;
    if (!await api.wait(1200)) return;
    api.caption('Pfeil = Gradient · Sprungweite = Lernrate × Steilheit');
    for (let i = 0; i < 4; i++) {
      api.click('#btnJump');
      if (!await api.wait(1500)) return;
    }
    api.caption('Größere Lernrate = weitere Sprünge');
    for (let i = 0; i < 6; i++) { api.click('#lrPlus'); if (!await api.wait(120)) return; }
    for (let i = 0; i < 3; i++) {
      api.click('#btnJump');
      if (!await api.wait(1500)) return;
    }
    api.click('#btnStay');
    if (!await api.wait(3800)) return;
    api.click('#btnMenu');
    if (!await api.waitFor(lvTile(5), 4000)) return;
    if (!await api.wait(1200)) return;

    // Level 5: ein echtes Neuron trainiert sich selbst
    api.click(lvTile(5));
    if (!await api.waitFor(GO, 5000)) return;
    api.caption('Level 5 · Die Landschaft ist jetzt der Fehler eines echten Neurons');
    if (!await api.wait(3600)) return;
    api.click(GO);
    if (!await api.waitFor('#btnAuto', 3000)) return;
    if (!await api.wait(1500)) return;
    api.caption('Training: Jeder Sprung bergab sortiert die Pinguine etwas besser');
    api.click('#btnAuto');
    if (!await api.wait(9000)) return;
    api.click('#btnAuto');
    if (!await api.wait(1500)) return;

    api.caption('');
    api.click('#btnMenu');
    await api.wait(1200);
  }

  /* ── Das Standbild ─────────────────────────────────────────────
     Querschnitt einer Landschaft: Höhe = Fehler. Links oben steht der
     Pinguin, nur um ihn herum ist der Nebel licht (Maske), unter ihm
     zeigt der Bergab-Pfeil ins Tal. Beim Darüberfahren lichtet sich
     der Nebel, die Sprungbögen zeichnen sich, der Pinguin hüpft sie
     nach (Keyframes aus denselben Punkten gerechnet) und die
     Fehlerkurve rechts oben fällt. */
  const W = 340;
  const ground = x => 172 - 80 * (1 - Math.exp(-Math.pow((x - 232) / 100, 2))) + 5 * Math.sin(x / 17);
  const HOPS = [34, 98, 148, 186, 212, 226, 231];       // Sprünge werden kürzer: Steilheit nimmt ab
  const PH = 34, PW = PH * 0.68;                         // Pinguin-Größe (main.webp 285 × 420)
  const f1 = v => v.toFixed(1);

  function landPath() {
    let d = `M0 190L0 ${f1(ground(0))}`;
    for (let x = 4; x <= W; x += 4) d += `L${x} ${f1(ground(x))}`;
    return d + `L${W} 190Z`;
  }
  function ridge() {
    let d = `M0 ${f1(ground(0))}`;
    for (let x = 4; x <= W; x += 4) d += `L${x} ${f1(ground(x))}`;
    return d;
  }
  function arcs() {
    let d = '';
    for (let i = 0; i < HOPS.length - 1; i++) {
      const a = HOPS[i], b = HOPS[i + 1], ya = ground(a) - 2, yb = ground(b) - 2;
      const lift = 10 + (b - a) * 0.35;
      d += `M${a} ${f1(ya)}Q${(a + b) / 2} ${f1(Math.min(ya, yb) - lift)} ${b} ${f1(yb)}`;
    }
    return d;
  }
  // Keyframes: je Sprung Absprung, Scheitel, Landung (relativ zum Start).
  function hopKeys() {
    const x0 = HOPS[0], y0 = ground(x0);
    const n = HOPS.length - 1, rows = [];
    const at = (p, x, y) => rows.push(`${p.toFixed(1)}%{transform:translate(${f1(x - x0)}px,${f1(y - y0)}px)}`);
    at(0, x0, y0);
    for (let i = 0; i < n; i++) {
      const a = HOPS[i], b = HOPS[i + 1], ya = ground(a), yb = ground(b);
      const lift = 10 + (b - a) * 0.35;
      const p0 = 6 + i * (88 / n), p1 = 6 + (i + 1) * (88 / n);
      at((p0 + p1) / 2, (a + b) / 2, Math.min(ya, yb) - lift * 0.55);
      at(p1, b, yb);
    }
    at(100, HOPS[n], ground(HOPS[n]));
    return `@keyframes ntp-hop{${rows.join('')}}`;
  }

  function tile() {
    const sx = HOPS[0], sy = ground(sx);
    // Bergab-Pfeil unter dem Pinguin (Richtung des Abhangs, Länge ~ Steilheit)
    const dx = 26, ey = ground(sx + dx) - sy;
    const ang = Math.atan2(ey, dx);
    const ax = sx + 6 + Math.cos(ang) * 30, ay = sy + 6 + Math.sin(ang) * 30;
    const head = (t) => `${f1(ax + Math.cos(ang + t) * -7)} ${f1(ay + Math.sin(ang + t) * -7)}`;
    const errPts = [[0, 0], [10, 14], [20, 23], [30, 29], [40, 32], [50, 33.5], [60, 34]]
      .map(([x, y]) => `${254 + x} ${f1(22 + y)}`).join('L');

    return `<div class="tprev tprev--nt" aria-hidden="true">
      <svg class="ntp" viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice">
        <style>${hopKeys()}</style>
        <defs>
          <linearGradient id="ntpSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="ntp-sky0"/><stop offset="1" class="ntp-sky1"/>
          </linearGradient>
          <linearGradient id="ntpLand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="ntp-land0"/><stop offset="1" class="ntp-land1"/>
          </linearGradient>
          <radialGradient id="ntpHole" cx="${sx + 4}" cy="${sy - 14}" r="52" gradientUnits="userSpaceOnUse">
            <stop offset=".35" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
          </radialGradient>
          <mask id="ntpFogMask" maskUnits="userSpaceOnUse" x="0" y="0" width="340" height="190">
            <rect width="340" height="190" fill="url(#ntpHole)"/>
          </mask>
        </defs>

        <rect width="340" height="190" fill="url(#ntpSky)"/>
        <path class="ntp-aurora" d="M-10 40C60 10 120 52 190 26S300 8 350 30L350 46C300 26 250 44 190 42S70 30 -10 58Z"/>
        <g class="ntp-stars">
          <circle cx="40" cy="18" r="1"/><circle cx="96" cy="10" r=".8"/><circle cx="150" cy="22" r="1"/>
          <circle cx="210" cy="12" r=".8"/><circle cx="128" cy="44" r=".7"/><circle cx="20" cy="50" r=".7"/>
        </g>

        <path d="${landPath()}" fill="url(#ntpLand)"/>
        <path d="${ridge()}" class="ntp-ridge"/>
        <path d="${arcs()}" class="ntp-arcs" pathLength="100"/>
        ${HOPS.slice(1).map((x, i) => `<circle cx="${x}" cy="${f1(ground(x) - 1)}" r="2.2" class="ntp-dot" style="transition-delay:${(0.25 + i * 0.3).toFixed(2)}s"/>`).join('')}
        <g class="ntp-goal"><circle cx="${HOPS.at(-1)}" cy="${f1(ground(HOPS.at(-1)) + 4)}" r="3.4"/></g>

        <g class="ntp-arrow">
          <path d="M${sx + 6} ${f1(sy + 6)}L${f1(ax)} ${f1(ay)}"/>
          <path d="M${head(0.5)}L${f1(ax)} ${f1(ay)}L${head(-0.5)}"/>
        </g>

        <rect width="340" height="190" class="ntp-fog" mask="url(#ntpFogMask)"/>

        <g transform="translate(${f1(sx - PW / 2)} ${f1(sy - PH + 2)})">
          <g class="ntp-peng">
            <image href="tools/Nebeltal/img/frei/main.webp" width="${f1(PW)}" height="${PH}"/>
          </g>
        </g>

        <g class="ntp-chips">
          <rect x="116" y="10" width="122" height="17" rx="8.5"/><text x="177" y="22" text-anchor="middle">Höhe = Fehler</text>
          <rect x="116" y="31" width="122" height="17" rx="8.5"/><text x="177" y="43" text-anchor="middle">Pfeil = Gradient</text>
          <rect x="116" y="52" width="122" height="17" rx="8.5"/><text x="177" y="64" text-anchor="middle">Sprungweite = Lernrate</text>
        </g>

        <g class="ntp-err">
          <rect x="246" y="10" width="84" height="56" rx="9"/>
          <text x="254" y="22" class="ntp-err-t">Fehler</text>
          <path d="M254 58H322" class="ntp-axis"/>
          <path d="M${errPts}" class="ntp-curve" pathLength="100"/>
        </g>
      </svg>
    </div>`;
  }

  window.MPPreview.register('nebeltal', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p><strong>Wie lernt ein neuronales Netz?</strong> Die Klasse sucht im Nebel den tiefsten
         Punkt einer 3D-Landschaft – und sieht nur die Stelle, an der sie gerade steht. Genau so
         geht es einer KI beim Lernen: Die <strong>Höhe ist ihr Fehler</strong>, der
         <strong>Bergab-Pfeil der Gradient</strong> und die <strong>Sprungweite die Lernrate</strong>
         (Gradient Descent).</p>
      <p>Acht Level in einer Pinguin-Geschichte: vom freien Suchen im Schneesturm über den
         Bergab-Pfeil und das Springen mit Lernrate bis zu echten Modellen – ein Neuron schätzt das
         Gewicht von Pinguinen, sortiert zwei Arten, scheitert am Nest (XOR) und schafft es mit
         zwei Neuronen. Die Messdaten stammen von 342 echten Pinguinen.</p>
      <p>Die Lehrkraft gibt die Level einzeln frei oder startet <strong>„Gemeinsam spielen“</strong>:
         Alle Tablets laufen in derselben Welt um die Wette, am Ende zeigt der Beamer die Wege
         aller. Der Skill ist noch in der <strong>Beta</strong>.</p>`
  });
})();
