/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/derby.js   ·   Schaufenster für How to Fachbegriffe
   ══════════════════════════════════════════════════════════════
   Es läuft das ECHTE tools/DefinitionsDerby/tool.js. Mit ctx.preview
   steht es im Schaufenster-Betrieb (demo in tool.js): die Lehrkraft-
   Ansicht mit den Beispielstapeln „Die Zelle“ und „Brüche“
   (DEMO_STACKS), Lernstand und Teilen nur im Arbeitsspeicher, kein
   Serveraufruf. Die gefälschten Verben aus lib/preview.js rührt es
   nie an.

   ── Das Drehbuch ──────────────────────────────────────────────
     1. Startseite: Lernformen links, Stapel rechts.
     2. Karteikarten: umdrehen, „Sicher“ stempeln, noch eine.
     3. Insel: eine Runde starten, das erste Ei schlüpft.
     4. Duell: zwei ziehen GLEICHZEITIG, einer zieht einmal falsch
        (Sperre), Sieg bei 3.
   Oben im Kopf wandert die Leiste mit (api.caption).

   Welcher Begriff passt, verrät das Werkzeug nur im Schaufenster
   (data-cid an Definition, Begriffen und Aufgabe, nur wenn demo).
   Gezogen wird mit erfundenen Zeiger-Ereignissen auf demselben Weg
   wie mit dem Finger (bindDuelDrag); sie sind nicht isTrusted, halten
   das Drehbuch also nicht selbst an.

   ── Das Standbild der Kachel ──────────────────────────────────
   Ein leichter Nachbau im Kleid des Skills (Kork, Pappe, Papier):
   links der Pappstapel mit Klebeband, in der Mitte die Karteikarte
   mit Büroklammer und Textmarker, darauf der grüne „Sicher“-Stempel,
   rechts die drei Stempel. Alle Farben stehen im SVG, wie das
   Werkzeug sieht es hell und dunkel gleich aus (Kork bzw. Holz wäre
   in der Kachel zu laut).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';
  const STEPS = ['Stapel', 'Karteikarten', 'Insel', 'Duell'];

  function view() {
    return { role: ROLE, room: { title: 'Biologie 7b', settings: {} },
             state: { phase: 1, data: {} }, limits: {}, me: { may_write: true }, entries: [] };
  }

  function leiste(api, jetzt) {
    api.caption('<span class="pv-steps" aria-label="Lernformen">'
      + STEPS.map((s, i) => '<span class="pv-step'
        + (i === jetzt ? ' is-an' : i < jetzt ? ' is-fertig' : '') + '">' + s + '</span>').join('')
      + '</span>');
  }

  const host = () => document.getElementById('pvHost');
  const $ = sel => { const h = host(); return h ? h.querySelector(sel) : null; };
  const mid = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  function pe(el, type, p, id) {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1,
      clientX: p.x, clientY: p.y, button: 0
    }));
  }

  /* Seite k zieht einen Begriff zu sich: den richtigen oder (right =
     false) einen, der weder hier noch drüben gesucht ist. */
  async function zieh(api, k, right) {
    const def = $('#ddDuDef' + k), other = $('#ddDuDef' + (k === 1 ? 2 : 1));
    if (!def || !def.dataset.cid) return false;
    const chips = Array.from(host().querySelectorAll('.dd-duchip[data-cid]:not(.is-away):not(.is-drag)'));
    const chip = right
      ? chips.find(c => c.dataset.cid === def.dataset.cid)
      : chips.find(c => c.dataset.cid !== def.dataset.cid && (!other || c.dataset.cid !== other.dataset.cid));
    if (!chip) return false;
    const a = mid(chip), b = mid(def), N = 18;
    pe(chip, 'pointerdown', a, k);
    for (let i = 1; i <= N; i++) {
      if (!await api.wait(30)) return false;
      const t = i / N, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      pe(chip, 'pointermove', { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(t * Math.PI) * 30 }, k);
    }
    pe(chip, 'pointerup', b, k);
    return true;
  }

  async function play(api) {
    // Von wo auch immer: zurück zur Startseite (Rückweg aus der Lernform).
    api.click('[data-act=home]');
    leiste(api, 0);
    if (!await api.waitFor('.dd-game[data-g="cards"]', 15000)) return;
    if (!await api.wait(2600)) return;

    /* 2 · Karteikarten */
    leiste(api, 1);
    api.click('.dd-game[data-g="cards"]');
    if (!await api.waitFor('[data-act=flip]', 6000)) return;
    for (const v of ['3', '2']) {
      if (!await api.wait(1500)) return;
      api.click('[data-act=flip]');
      if (!await api.wait(1700)) return;
      api.click('[data-act=rate][data-v="' + v + '"]');
      if (!await api.wait(900)) return;
    }

    /* 3 · Insel */
    leiste(api, 2);
    api.click('[data-act=home]');
    if (!await api.waitFor('.dd-game[data-g="island"]', 4000)) return;
    if (!await api.wait(500)) return;
    api.click('.dd-game[data-g="island"]');
    if (!await api.waitFor('[data-act=isl-round]', 8000)) return;
    if (!await api.wait(3200)) return;
    api.click('[data-act=isl-round]');
    if (!await api.waitFor('#ddTask:not([hidden]) [data-act=isl-opt]', 4000)) return;
    if (!await api.wait(1800)) return;
    const task = $('#ddTask');
    const id = task && task.dataset.cid;
    if (id && !api.click('[data-act=isl-opt][data-id="' + CSS.escape(id) + '"]')) api.click('[data-act=isl-opt]');
    if (!await api.wait(2800)) return;
    api.click('[data-act=isl-close]');
    if (!await api.wait(1800)) return;

    /* 4 · Duell */
    leiste(api, 3);
    api.click('[data-act=home]');
    if (!await api.waitFor('.dd-game[data-g="duel"]', 4000)) return;
    if (!await api.wait(500)) return;
    api.click('.dd-game[data-g="duel"]');
    if (!await api.waitFor('[data-act=du-start]', 4000)) return;
    const goal = $('[data-du=goal]');
    if (goal) { goal.value = '3'; goal.dispatchEvent(new Event('change', { bubbles: true })); }
    if (!await api.waitFor('[data-act=du-start]', 2000)) return;
    if (!await api.wait(1600)) return;
    api.click('[data-act=du-start]');
    if (!await api.waitFor('#ddDuDef1[data-cid]:not([data-cid=""])', 5000)) return;
    if (!await api.wait(900)) return;
    // Beide gleichzeitig — darum geht es.
    await Promise.all([zieh(api, 1, true), zieh(api, 2, true)]);
    if (!await api.wait(1500)) return;
    await Promise.all([zieh(api, 1, false), zieh(api, 2, true)]);
    if (!await api.wait(1700)) return;
    await Promise.all([zieh(api, 1, true), zieh(api, 2, false)]);
    if (!await api.wait(1700)) return;
    await zieh(api, 1, true);
    if (!await api.wait(6000)) return;
  }

  function tile() {
    const dots = Array.from({ length: 70 }, (_, i) =>
      `<circle cx="${(i * 47) % 340 + 4}" cy="${(i * 29) % 190 + 3}" r="1.1" fill="#8a5a2f" opacity=".35"/>`).join('');
    const stamp = (y, c, t, r) => `<g transform="translate(286 ${y}) rotate(${r})">
        <rect x="-38" y="-13" width="76" height="26" rx="4" fill="#f6f0e4" stroke="${c}" stroke-width="2.5"/>
        <text y="5" text-anchor="middle" font-size="11" font-weight="800" letter-spacing=".06em" fill="${c}">${t}</text></g>`;
    return `<div class="tprev" aria-hidden="true" style="padding:0;border-color:#8a5a33">
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;font-family:'Outfit',system-ui,sans-serif">
        <rect width="340" height="190" fill="#c99d66"/>
        ${dots}
        <!-- Pappstapel mit Klebeband -->
        <rect x="22" y="58" width="74" height="96" rx="3" fill="#c6b08b"/>
        <rect x="18" y="53" width="74" height="96" rx="3" fill="#d6c4a2"/>
        <rect x="14" y="48" width="74" height="96" rx="3" fill="#e9dcc3" stroke="#c6b08b"/>
        <rect x="32" y="40" width="38" height="14" fill="#7fb0c9" opacity=".8" transform="rotate(-4 51 47)"/>
        <text x="24" y="76" font-size="11" font-weight="800" fill="#2b2620">Die Zelle</text>
        <circle cx="66" cy="118" r="15" fill="none" stroke="#a2402e" stroke-width="2"/>
        <text x="66" y="122" text-anchor="middle" font-size="12" font-weight="800" fill="#a2402e">8</text>
        <!-- Karteikarte mit Büroklammer -->
        <g transform="rotate(-2.5 170 100)">
          <rect x="108" y="38" width="132" height="112" rx="3" fill="#000" opacity=".18" transform="translate(3 5)"/>
          <rect x="108" y="38" width="132" height="112" rx="3" fill="#fff"/>
          <path d="M128 30 v22 a6 6 0 0 0 12 0 v-18 a4 4 0 0 0 -8 0 v16" fill="none" stroke="#9aa3ad" stroke-width="2.4" stroke-linecap="round"/>
          <rect x="119" y="62" width="110" height="18" fill="#fff07a"/>
          <text x="174" y="76" text-anchor="middle" font-size="14" font-weight="800" fill="#2b2620">Mitochondrium</text>
          <rect x="122" y="92" width="104" height="5" rx="2" fill="#c9c2b6"/>
          <rect x="122" y="104" width="92" height="5" rx="2" fill="#c9c2b6"/>
          <rect x="122" y="116" width="98" height="5" rx="2" fill="#c9c2b6"/>
          <g transform="translate(206 130) rotate(-12)" opacity=".9">
            <rect x="-30" y="-11" width="60" height="22" rx="4" fill="none" stroke="#3d7a52" stroke-width="2.6"/>
            <text y="5" text-anchor="middle" font-size="11" font-weight="800" letter-spacing=".08em" fill="#3d7a52">SICHER</text>
          </g>
        </g>
        <!-- die drei Stempel -->
        ${stamp(62, '#a2402e', 'UNSICHER', -3)}
        ${stamp(98, '#94650f', 'TEILWEISE', 2)}
        ${stamp(134, '#3d7a52', 'SICHER', -2)}
      </svg>
    </div>`;
  }

  window.MPPreview.register('derby', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Begriffe und ihre <strong>Definitionen lernen</strong>, mit Karten aus Pappe und Papier.
         Die Lehrkraft legt <strong>Stapel</strong> an — Karte für Karte oder als eingefügter Text
         („Begriff: Definition“) — und teilt sie mit der Klasse.</p>
      <p>Aus denselben Karten werden mehrere <strong>Lernformen</strong>:</p>
      <ul>
        <li><strong>Übersicht</strong> — das Glossar zum Nachschlagen, mit Suche und Selbsttest.</li>
        <li><strong>Karteikarten</strong> — umdrehen, ehrlich stempeln; Unsicheres kommt öfter wieder.</li>
        <li><strong>Insel</strong> — jeder Begriff ist ein Wesen, das mit jeder gelösten Aufgabe wächst, vom Ei bis zum Leuchten.</li>
        <li><strong>Memory</strong> — zu zweit Begriff und Definition finden.</li>
        <li><strong>Duell</strong> — zu zweit gleichzeitig an einem Tablet: wer zieht schneller den passenden Begriff?</li>
      </ul>
      <p>Mit Anmeldung bleibt der Lernstand im Konto, ohne nur auf dem Gerät. Der Skill ist in der
         <strong>Beta</strong>.</p>`
  });
})();
