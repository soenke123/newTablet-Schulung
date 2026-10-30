/* ══════════════════════════════════════════════════════════════
   MPSkills — preview/derby.js   ·   Schaufenster für How to Fachbegriffe
   ══════════════════════════════════════════════════════════════
   Es läuft das ECHTE tools/DefinitionsDerby/tool.js. Mit ctx.preview
   steht es im Schaufenster-Betrieb (demo in tool.js): die Lehrkraft-
   Ansicht mit den Beispielstapeln „Die Zelle“ und „Brüche“
   (DEMO_STACKS), Lernstand und Teilen nur im Arbeitsspeicher, kein
   Serveraufruf. Die gefälschten Verben aus lib/preview.js rührt es
   nie an.

   ── Das Drehbuch (Sönke 30.10.2026: „die Vielseitigkeit sehen“) ──
     1. Stapel: als Text einfügen, die Vorschau baut die Karten mit,
        speichern (nur beim ersten Durchgang, danach liegt er schon da).
     2. Übersicht: Glossar, Suche tippt „zell“.
     3. Karteikarten: umdrehen, „Sicher“ stempeln, noch eine.
     4. Insel: eine Runde starten, das erste Ei schlüpft.
     5. Memory: einen Begriff und eine Definition aufdecken, „Nein“.
     6. Duell: zwei ziehen GLEICHZEITIG, einer zieht einmal falsch
        (Sperre), Sieg bei 3.
     7. Kistenturm: braucht die ganze Klasse und den Server — im
        Schaufenster öffnet die Kachel die Beschreibung mit dem
        Bildschirmfoto (startGame in tool.js, demo).
   Oben im Kopf wandert die Leiste mit (api.caption).

   Welcher Begriff passt, verrät das Werkzeug nur im Schaufenster
   (data-cid an Definition, Begriffen und Aufgabe, nur wenn demo).
   Gezogen wird mit erfundenen Zeiger-Ereignissen auf demselben Weg
   wie mit dem Finger (bindDuelDrag); sie sind nicht isTrusted, halten
   das Drehbuch also nicht selbst an.

   ── Das Standbild der Kachel ──────────────────────────────────
   Ein leichter Nachbau im Kleid des Skills (Kork, Pappe, Papier):
   links der Pappstapel mit Klebeband, daneben sechs Zettel, einer je
   Lernform (Übersicht · Karteikarten · Insel · Memory · Duell ·
   Kistenturm) — aus einem Stapel werden sechs Arten zu lernen. Alle
   Farben stehen im SVG, wie das Werkzeug sieht es hell und dunkel
   gleich aus.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (!window.MPPreview) return;

  const ROLE = 'presenter';
  const STEPS = ['Stapel', 'Übersicht', 'Karteikarten', 'Insel', 'Memory', 'Duell', 'Kistenturm'];

  // Der Stapel, den das Drehbuch als Text einfügt (parse.js erkennt Kopfzeilen und „Begriff: Definition“).
  const TEXT = 'Titel: Das Wetter\nFach: Erdkunde\n\n'
    + 'Niederschlag: Wasser, das aus der Luft auf die Erde fällt\n'
    + 'Luftdruck: Gewicht der Luft, die auf einer Fläche lastet\n'
    + 'Front: Grenze zwischen warmer und kalter Luft';

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

  // Zurück zur Startseite und eine Lernform öffnen.
  async function form(api, g, waitSel) {
    api.click('[data-act=home]');
    if (!await api.waitFor('.dd-game[data-g="' + g + '"]', 4000)) return false;
    if (!await api.wait(500)) return false;
    api.click('.dd-game[data-g="' + g + '"]');
    return api.waitFor(waitSel, 8000);
  }

  async function play(api) {
    // Von wo auch immer: zurück zur Startseite (Rückweg aus der Lernform).
    api.click('[data-act=info-x]');
    api.click('[data-act=home]');
    leiste(api, 0);
    if (!await api.waitFor('.dd-game[data-g="cards"]', 15000)) return;
    if (!await api.wait(1800)) return;

    /* 1 · Stapel als Text einfügen — nur, solange er noch nicht da ist */
    const da = Array.from(host().querySelectorAll('[data-act=open]')).some(el => /Das Wetter/.test(el.textContent || ''));
    if (!da && api.click('[data-act=new]')) {
      if (!await api.waitFor('[data-act=ed-mode][data-v=text]', 4000)) return;
      if (!await api.wait(700)) return;
      api.click('[data-act=ed-mode][data-v=text]');
      if (!await api.waitFor('#ddText', 3000)) return;
      if (!await api.wait(500)) return;
      if (!await api.type('#ddText', TEXT)) return;
      if (!await api.wait(2200)) return;
      api.click('[data-act=ed-save]');
      if (!await api.waitFor('.dd-game[data-g="cards"]', 4000)) return;
      if (!await api.wait(1800)) return;
    }

    /* 2 · Übersicht */
    leiste(api, 1);
    if (!await form(api, 'overview', '[data-ov=q]')) return;
    if (!await api.wait(1400)) return;
    if (!await api.type('[data-ov=q]', 'zell')) return;
    if (!await api.wait(2200)) return;

    /* 3 · Karteikarten */
    leiste(api, 2);
    if (!await form(api, 'cards', '[data-act=flip]')) return;
    for (const v of ['3', '2']) {
      if (!await api.wait(1300)) return;
      api.click('[data-act=flip]');
      if (!await api.wait(1500)) return;
      api.click('[data-act=rate][data-v="' + v + '"]');
      if (!await api.wait(900)) return;
    }

    /* 4 · Insel */
    leiste(api, 3);
    if (!await form(api, 'island', '[data-act=isl-round]')) return;
    if (!await api.wait(3000)) return;
    api.click('[data-act=isl-round]');
    if (!await api.waitFor('#ddTask:not([hidden]) [data-act=isl-opt]', 4000)) return;
    if (!await api.wait(1600)) return;
    const task = $('#ddTask');
    const id = task && task.dataset.cid;
    if (id && !api.click('[data-act=isl-opt][data-id="' + CSS.escape(id) + '"]')) api.click('[data-act=isl-opt]');
    if (!await api.wait(2600)) return;
    api.click('[data-act=isl-close]');
    if (!await api.wait(1400)) return;

    /* 5 · Memory */
    leiste(api, 4);
    if (!await form(api, 'memory', '[data-act=mm-pick][data-side=t]')) return;
    if (!await api.wait(1400)) return;
    api.click('[data-act=mm-pick][data-side=t]');
    if (!await api.wait(900)) return;
    api.click('[data-act=mm-pick][data-side=d]');
    if (await api.waitFor('[data-act=mm-no]', 4000)) {
      if (!await api.wait(1800)) return;
      api.click('[data-act=mm-no]');
    }
    if (!await api.wait(1600)) return;

    /* 6 · Duell */
    leiste(api, 5);
    if (!await form(api, 'duel', '[data-act=du-start]')) return;
    const goal = $('[data-du=goal]');
    if (goal) { goal.value = '3'; goal.dispatchEvent(new Event('change', { bubbles: true })); }
    if (!await api.waitFor('[data-act=du-start]', 2000)) return;
    if (!await api.wait(1400)) return;
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
    if (!await api.wait(4000)) return;

    /* 7 · Kistenturm: Beschreibung mit Bildschirmfoto */
    leiste(api, 6);
    if (!await form(api, 'storm', '.dd-sheet .dd-shot img')) return;
    if (!await api.wait(6500)) return;
    api.click('[data-act=info-x]');
    if (!await api.wait(600)) return;
  }

  /* Ein Zettel je Lernform: Bild oben, Name unten. */
  function zettel(x, y, rot, name, pic) {
    return `<g transform="translate(${x} ${y}) rotate(${rot} 37 33)">
        <rect x="2" y="3" width="74" height="66" rx="3" fill="#000" opacity=".16"/>
        <rect width="74" height="66" rx="3" fill="#fbf7ee"/>
        <rect x="27" y="-4" width="20" height="9" fill="#7fb0c9" opacity=".75"/>
        <g transform="translate(37 28)">${pic}</g>
        <text x="37" y="58" text-anchor="middle" font-size="9.5" font-weight="800" fill="#2b2620">${name}</text>
      </g>`;
  }

  const PICS = {
    overview: `<rect x="-18" y="-16" width="36" height="5" rx="2" fill="#2b2620"/><rect x="-18" y="-7" width="28" height="4" rx="2" fill="#c9c2b6"/>
      <rect x="-18" y="1" width="36" height="5" rx="2" fill="#2b2620"/><rect x="-18" y="10" width="24" height="4" rx="2" fill="#c9c2b6"/>`,
    cards: `<rect x="-17" y="-15" width="34" height="27" rx="2" fill="#fff" stroke="#c9c2b6"/><rect x="-12" y="-9" width="24" height="6" fill="#fff07a"/>
      <g transform="translate(7 7) rotate(-12)"><rect x="-11" y="-5" width="22" height="10" rx="2" fill="none" stroke="#3d7a52" stroke-width="1.8"/></g>`,
    island: `<ellipse cx="0" cy="4" rx="22" ry="11" fill="#7fb0c9"/><path d="M-15 5c2-8 10-11 16-10s13 4 14 10c-8 4-22 4-30 0z" fill="#7aa65a"/>
      <ellipse cx="2" cy="-3" rx="5" ry="6.5" fill="#f1e6c8" stroke="#b49a63" stroke-width="1.2"/>`,
    memory: `<rect x="-18" y="-16" width="16" height="14" rx="2" fill="#5b88b4"/><rect x="2" y="-16" width="16" height="14" rx="2" fill="#c08f2c"/>
      <rect x="-18" y="1" width="16" height="14" rx="2" fill="#5b88b4"/><rect x="2" y="1" width="16" height="14" rx="2" fill="#fff" stroke="#c08f2c"/>
      <text x="-10" y="-5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">?</text><text x="10" y="-5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">?</text>
      <text x="-10" y="12" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">?</text>`,
    duel: `<rect x="-6" y="-9" width="14" height="8" rx="1.5" fill="#fff" stroke="#9a8f7e" transform="rotate(-8)"/>
      <path d="M-20 10h9M-14 6l-5 4 5 4" stroke="#a2402e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M20 10h-9M14 6l5 4-5 4" stroke="#3d6fa8" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <circle cx="-17" cy="-10" r="4" fill="#a2402e"/><circle cx="17" cy="-10" r="4" fill="#3d6fa8"/>`,
    storm: [[-16, 3], [-16, -6], [-16, -15], [3, 3], [3, -6]].map(([x, y], i) =>
      `<rect x="${x}" y="${y}" width="15" height="8" rx="1" fill="#d6ad72" stroke="#9c7440"/><rect x="${x + 6}" y="${y}" width="3" height="8" fill="${i < 3 ? '#d79a1f' : '#3f8f4f'}"/>`).join('')
      + '<path d="M-21 -19h42" stroke="#c0392b" stroke-width="2" stroke-dasharray="4 3"/>'
  };

  function tile() {
    const dots = Array.from({ length: 70 }, (_, i) =>
      `<circle cx="${(i * 47) % 340 + 4}" cy="${(i * 29) % 190 + 3}" r="1.1" fill="#8a5a2f" opacity=".35"/>`).join('');
    const F = [['overview', 'Übersicht'], ['cards', 'Karteikarten'], ['island', 'Insel'],
               ['memory', 'Memory'], ['duel', 'Duell'], ['storm', 'Kistenturm']];
    const ROT = [-3, 2, -1.5, 2.5, -2, 1.5];
    return `<div class="tprev" aria-hidden="true" style="padding:0;border-color:#8a5a33">
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;font-family:'Outfit',system-ui,sans-serif">
        <rect width="340" height="190" fill="#c99d66"/>
        ${dots}
        <!-- Pappstapel mit Klebeband -->
        <rect x="18" y="56" width="66" height="88" rx="3" fill="#c6b08b"/>
        <rect x="14" y="51" width="66" height="88" rx="3" fill="#d6c4a2"/>
        <rect x="10" y="46" width="66" height="88" rx="3" fill="#e9dcc3" stroke="#c6b08b"/>
        <rect x="26" y="38" width="34" height="13" fill="#7fb0c9" opacity=".8" transform="rotate(-4 43 45)"/>
        <text x="18" y="73" font-size="10.5" font-weight="800" fill="#2b2620">Die Zelle</text>
        <circle cx="58" cy="114" r="14" fill="none" stroke="#a2402e" stroke-width="2"/>
        <text x="58" y="118" text-anchor="middle" font-size="11" font-weight="800" fill="#a2402e">8</text>
        <!-- ein Stapel, sechs Lernformen -->
        <path d="M82 92 q8 0 12 -4 M82 92 q8 0 12 4" stroke="#6b4a26" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
        ${F.map(([k, n], i) => zettel(98 + (i % 3) * 80, 18 + Math.floor(i / 3) * 82, ROT[i], n, PICS[k])).join('')}
      </svg>
    </div>`;
  }

  window.MPPreview.register('derby', {
    role: ROLE,
    view, play, tile,
    wide: true,
    fade: false,
    blurb: `
      <p>Fachbegriffe und ihre <strong>Definitionen lernen</strong> – in jedem Fach. Die Lehrkraft legt
         <strong>Stapel</strong> an, Karte für Karte (auch mit Bild) oder als eingefügter Text
         („Begriff: Definition“, auch aus Excel), und teilt sie mit der Klasse.</p>
      <p>Aus <strong>einem Stapel</strong> werden sechs <strong>Lernformen</strong>:</p>
      <ul>
        <li><strong>Allein:</strong> <strong>Übersicht</strong> (Glossar mit Suche und Selbsttest) ·
            <strong>Karteikarten</strong> (Unsicheres kommt öfter wieder) ·
            <strong>Insel</strong> (jeder Begriff ein Wesen, das mit jeder Aufgabe wächst, vom Ei bis zum Leuchten).</li>
        <li><strong>Zu zweit an einem Gerät:</strong> <strong>Memory</strong> · <strong>Duell</strong>
            (beide gleichzeitig: wer zieht schneller den passenden Begriff?).</li>
        <li><strong>Die ganze Klasse:</strong> <strong>Kistenturm</strong> – Teams stapeln um die Wette,
            jede richtige Antwort ist eine Kiste, mit Items wie bei Mario Kart.</li>
      </ul>
      <p>Die Aufgaben werden mit dem Lernstand schwerer: vom Begriff wählen bis zum Lückentext.
         Mit Anmeldung bleibt der Lernstand im Konto. Der Skill ist in der <strong>Beta</strong>.</p>`
  });
})();
