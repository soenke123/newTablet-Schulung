/* ══════════════════════════════════════════════════════════════
   Nebeltal — js/pfad.js   ·   Übersicht als Lernpfad (19.11.2026)
   ══════════════════════════════════════════════════════════════
   Sönke 19.11.2026: „Die Unterrichtsempfehlung in der UI erzählen …
   dieser Pfad mit dem Abstieg ist toll“. Zweite Ansicht der Übersicht
   neben „Freie Nutzung“ (Phasen-Reihen in spiel.js renderMenu):

     Die Stunde ist selbst ein Gradientenabstieg. Pinguin Main steigt
     vom Gipfel (oben links, dichter Nebel) Halt für Halt ins Tal
     (unten rechts, Flagge); je tiefer, desto klarer die Sicht.

   Halte (STATIONS):  1 Einstieg (Level 1–3, gemeinsam) · 2 Erarbeitung
   (Tafel) · 3 Übung (Level 4–7 allein + Arbeitsblatt) · 4 Sicherung
   (kommt noch) · 5 Finale (Level 8, im Team). Keine Zeitangaben
   (60- und 90-Minuten-Stunden). Je Halt: Sozialform als Symbol, für
   die Lehrkraft ein „i“ mit Ziel, Ablauf und Impuls.

   Wo die Klasse steht: im Raum aus data.levels (geteilt bzw. gemeinsam
   gespielt – mehr.js gibt ein Level nach der Runde im Lernpfad frei),
   allein aus dem Gerät (Sterne, nt.done.erarb, nt.done.8). Halt mit
   etwas Freigegebenem = erreicht; ist er ganz frei, geht es zum nächsten.

   api (aus spiel.js): { R, tileHtml(key), doneLocal(key), mehr(), share(list) }
   ══════════════════════════════════════════════════════════════ */
window.NTPfad = (function () {
  'use strict';

  const SO = {   // Sozialform: Symbol + Text
    mp: { t: 'Gemeinsam · alle gegeneinander', ic: 'group' },
    tafel: { t: 'Lehrkraft am Beamer', ic: 'board' },
    solo: { t: 'Allein · mit Arbeitsblatt', ic: 'solo' },
    plenum: { t: 'Im Plenum', ic: 'talk' },
    team: { t: 'Gemeinsam · im Team', ic: 'team' }
  };
  const STATIONS = [
    { k: 'ein', t: 'Einstieg', sub: 'Den tiefsten Punkt im Nebel suchen', items: [1, 2, 3], so: 'mp', mp: true,
      info: { ziel: 'Spielerischer Einstieg: Wer findet im Nebel den tiefsten Punkt? Von KI ist hier noch keine Rede – die Klasse spielt um die Wette und merkt nebenbei, was hilft: der Pfeil bergab und die richtige Sprungweite.',
        tun: ['„Gemeinsam spielen“ – alle Tablets kommen in die Lobby.',
              'Level 1 → 2 → 3 nacheinander. Nach jeder Runde kurz die Karte mit allen Wegen ansehen: Wer kam am tiefsten – und wie?',
              'Nach Level 3 „Weiter zur Erarbeitung“: Die Runde endet für alle, Level 1–3 sind danach zum Allein-Spielen frei.'],
        impuls: 'Stellt eine Vermutung auf: Was hat ein Pinguin, der im Nebel das tiefste Tal sucht, mit dem Lernen eines neuronalen Netzes zu tun? Begründet eure Vermutung mit dem, was euch in Level 1–3 geholfen hat.' } },
    { k: 'erarb', t: 'Erarbeitung', sub: 'Wie lernt ein Neuron?', items: ['erarb'], so: 'tafel',
      info: { ziel: 'Die Lernregel verstehen: raten, mit dem Soll vergleichen, Gewichte anpassen – jede Anpassung ist ein Sprung ins Tal.',
        tun: ['Erarbeitung am Beamer öffnen, die vier Schritte gemeinsam durchgehen.',
              'Die Rechnung für w₁ vormachen, w₂ rechnet die Klasse selbst nach.',
              'Wer will, teilt die Erarbeitung – dann klicken die Tablets selbst mit.'],
        impuls: 'Was passiert, wenn die Lernrate zu groß ist?' } },
    { k: 'ueb', t: 'Übung', sub: 'Jede Welt ist ein echtes Neuron', items: [4, 5, 6, 7], so: 'solo', sheet: true,
      info: { ziel: 'Gradientenabstieg an echten Modellen üben – bis ein Neuron an seine Grenze kommt (das Nest) und ein zweites hilft.',
        tun: ['Arbeitsblatt austeilen (2 Seiten).',
              'Level 4–7 freigeben – einzeln am Teilen-Symbol oder mit „Alle freigeben“.',
              'Jede Person im eigenen Tempo. Level 7 geht gut zu zweit an einem Tablet.'],
        impuls: 'Warum schafft ein Neuron das Nest nicht – und was ändert ein zweites?' } },
    { k: 'sich', t: 'Sicherung', sub: 'Was haben wir gelernt?', items: ['sich'], so: 'plenum', soon: true,
      info: { ziel: 'Die Begriffe sichern: Fehler, Gewicht, Gradient, Lernrate, Training.', tun: ['Kommt bald.'], impuls: '' } },
    { k: 'fin', t: 'Finale', sub: 'Ein ganzes Netz im Team', items: [8], so: 'team', mp: true, goal: true,
      info: { ziel: 'Erleben, dass ein Netz aus vielen Gewichten besteht, die alle zusammen lernen – und dass man sich absprechen muss.',
        tun: ['„Gemeinsam spielen“ mit Level 8, Teams in der Lobby einteilen (Vorgabe 8 pro Team).',
              'Nach der Runde Rangliste und Team-Netz am Beamer besprechen, dann zusammen weiter trainieren.'],
        impuls: 'Ihr habt jede Welt von Hand gezogen – was macht das Training stattdessen?' } }
  ];

  const ICON = {
    group: '<circle cx="7" cy="9" r="2.6"/><circle cx="17" cy="9" r="2.6"/><circle cx="12" cy="7" r="3"/><path d="M2.5 19c.4-3 2.2-4.6 4.5-4.6M21.5 19c-.4-3-2.2-4.6-4.5-4.6M6.5 20c.5-3.6 2.7-5.6 5.5-5.6s5 2 5.5 5.6"/>',
    team: '<circle cx="8" cy="8" r="2.8"/><circle cx="16" cy="8" r="2.8"/><path d="M3 19c.5-3.5 2.4-5.4 5-5.4s4.5 1.9 5 5.4M11 19c.5-3.5 2.4-5.4 5-5.4s4.5 1.9 5 5.4"/><path d="M12 2.5v2"/>',
    solo: '<circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20c.6-4 3.1-6.3 6.5-6.3s5.9 2.3 6.5 6.3"/>',
    board: '<rect x="3" y="4" width="18" height="12" rx="1.6"/><path d="M8 20l4-4 4 4M7 12l3-3 3 2 4-4"/>',
    talk: '<path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v2.5L16 17h-3"/>',
    doc: '<path d="M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 21z"/><path d="M14 2.5V7h4M9 12h6M9 15.5h6M9 19h4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  const svg = (k, cls) => '<svg class="' + (cls || 'pic') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';
  const SHEET = 'arbeitsblatt/Nebeltal_Arbeitsblatt';

  let ro = null;

  /* ── Wo steht die Klasse? ── */
  function progress(api) {
    const R = api.R;
    const has = k => (R.inRoom ? (R.levels || []).some(x => String(x) === String(k)) : api.doneLocal(k));
    const touched = STATIONS.map(s => !s.soon && s.items.some(has));
    const full = STATIONS.map(s => !s.soon && s.items.every(has));
    let last = -1;
    touched.forEach((t, i) => { if (t) last = i; });
    const cur = last < 0 ? 0 : full[last] ? Math.min(last + 1, STATIONS.length - 1) : last;
    return { has, cur, allDone: last === STATIONS.length - 1 && full[last] };
  }

  function render(el, api) {
    const R = api.R, T = R.isTeacher, ST = R.isStudent, P = progress(api);
    const showInfo = T || !R.inRoom;
    const html = STATIONS.map((s, i) => {
      const st = P.allDone || i < P.cur ? 'done' : i === P.cur ? 'cur' : 'fut';
      const so = SO[s.so];
      let act = '';
      if (T && s.mp) {
        const next = s.items.find(k => !P.has(k)), again = next == null;
        act = '<button class="btn ' + (again ? '' : 'primary ') + 'pst-go" type="button" data-go="' + (again ? s.items[0] : next) + '">' + svg('play', 'pic sm') +
          (again ? 'Nochmal gemeinsam · Level ' + s.items[0] : 'Gemeinsam spielen · Level ' + next) + '</button>';
      } else if (T && s.k === 'ueb') {
        const all = s.items.every(P.has);
        act = '<button class="btn pst-all" type="button" data-all="' + (all ? 'off' : 'on') + '">' +
          (all ? 'Allen wieder entziehen' : 'Level 4–7 freigeben') + '</button>';
      }
      const note = s.mp && ST && !s.items.every(P.has) ? '<p class="pst-note">Spielt ihr gemeinsam – danach hier frei zum Üben.</p>'
        : s.mp && !R.inRoom ? '<p class="pst-note">Im Raum gemeinsam, hier allein.</p>' : '';
      const sheet = s.sheet && !ST ? '<div class="pst-sheet">' + svg('doc') + '<b>Arbeitsblatt</b><span>zu Level 4–7</span>' +
        '<a class="btn sm" href="' + SHEET + '.pdf" target="_blank" rel="noopener">PDF</a>' +
        '<a class="btn sm" href="' + SHEET + '.docx" download>Word</a></div>' : '';
      return '<section class="pst ' + st + (s.soon ? ' soon' : '') + (s.goal ? ' goal' : '') + '" style="--i:' + i + '" data-st="' + i + '">' +
        '<div class="pst-mark" aria-hidden="true"><span class="pst-n">' + (st === 'done' ? svg('check', 'pic ck') : i + 1) + '</span>' +
          (st === 'cur' && !P.allDone ? '<img class="pst-main" src="img/frei/main.webp" alt="">' : '') +
          (s.goal ? '<svg class="pst-flag" viewBox="0 0 30 40"><path d="M6 38V3"/><path class="fl" d="M7 4h18l-5 6 5 6H7z"/></svg>' : '') +
        '</div>' +
        '<div class="pst-card">' +
          '<div class="pst-h"><div class="pst-tt"><span class="pst-k">' + s.t + (s.soon ? ' · kommt bald' : '') + '</span><b>' + s.sub + '</b></div>' +
            '<span class="pst-meta"><span class="pst-so" title="' + so.t + '">' + svg(so.ic) + '<span>' + so.t + '</span></span>' +
            (showInfo ? '<button class="pst-i" type="button" data-info="' + i + '" aria-label="Unterrichtshinweise zu ' + s.t + '">i</button>' : '') +
          '</span></div>' +
          '<div class="pst-row n' + s.items.length + '">' + s.items.map(api.tileHtml).join('') + '</div>' +
          sheet + note + (act ? '<div class="pst-act">' + act + '</div>' : '') +
        '</div></section>';
    }).join('');
    el.innerHTML = '<div class="pfad' + (P.allDone ? ' all' : '') + '"><svg class="pfad-bg" aria-hidden="true"></svg>' + html + '</div>';

    el.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => info(+b.dataset.info)));
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const m = api.mehr();
      if (m && m.go) { b.disabled = true; m.go(+b.dataset.go).finally(() => { b.disabled = false; }); }
    }));
    el.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => {
      const cur = (R.levels || []).filter(x => ![4, 5, 6, 7].includes(x));
      api.share(b.dataset.all === 'on' ? cur.concat([4, 5, 6, 7]) : cur);
    }));
    const pf = el.querySelector('.pfad');
    if (ro) ro.disconnect();
    if (window.ResizeObserver) { ro = new ResizeObserver(() => draw(pf)); ro.observe(pf); }
    requestAnimationFrame(() => draw(pf));
  }

  /* ── Berg + Weg hinter den Halten (SVG, nach dem Layout) ──
     Weg = weiche Kurve durch die Marken; Berg = alles links vom Weg (oben schmaler Gipfel,
     unten breit) mit Talboden rechts unten. Bis zum aktuellen Halt durchgezogen, danach gestrichelt. */
  function draw(pf) {
    if (!pf || !pf.isConnected) return;
    const bg = pf.querySelector('.pfad-bg'), box = pf.getBoundingClientRect();
    const W = box.width, H = box.height;
    if (!W || !H) return;
    const pts = [...pf.querySelectorAll('.pst-mark')].map(m => {
      const r = m.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    });
    if (pts.length < 2) return;
    const curI = [...pf.querySelectorAll('.pst')].findIndex(s => s.classList.contains('cur'));
    const seg = (a, b) => {
      const my = (a.y + b.y) / 2;
      return ' C' + a.x + ',' + my + ' ' + b.x + ',' + my + ' ' + b.x + ',' + b.y;
    };
    const p0 = pts[0], pn = pts[pts.length - 1];
    let line = 'M' + p0.x + ',' + p0.y;
    for (let i = 1; i < pts.length; i++) line += seg(pts[i - 1], pts[i]);
    const upto = curI < 0 ? pts.length - 1 : curI;
    let walked = 'M' + p0.x + ',' + p0.y;
    for (let i = 1; i <= upto; i++) walked += seg(pts[i - 1], pts[i]);
    const top = Math.max(0, p0.y - 70);
    const mt = 'M0,' + (top + 30) + ' L' + (p0.x - 6) + ',' + top + ' L' + p0.x + ',' + p0.y + line.slice(line.indexOf(' C')) +
      ' C' + (pn.x + 40) + ',' + (pn.y + 20) + ' ' + (pn.x + 80) + ',' + (pn.y + 26) + ' ' + W + ',' + (pn.y + 26) +
      ' L' + W + ',' + H + ' L0,' + H + ' Z';
    // Höhenlinien: der Weg nach links/oben verschoben, nur im Berg sichtbar (wie die Welten ab Level 4)
    const cts = [26, 58, 96, 140, 190].map((d, k) =>
      '<path class="pf-ct" d="' + line + '" transform="translate(' + (-d) + ',' + (-d * 0.35) + ')" style="opacity:' + (0.75 - k * 0.12) + '"/>').join('');
    const cap = 'M' + (p0.x - 6) + ',' + top + ' L' + (p0.x + 14) + ',' + (top + 26) + ' L' + (p0.x + 2) + ',' + (top + 22) +
      ' L' + (p0.x - 8) + ',' + (top + 34) + ' L' + (p0.x - 20) + ',' + (top + 24) + ' L' + Math.max(0, p0.x - 40) + ',' + (top + 30) + ' Z';
    bg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    bg.innerHTML =
      '<defs><linearGradient id="pfMt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient>' +
        '<linearGradient id="pfFog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f0"/><stop offset=".55" class="f1"/></linearGradient>' +
        '<clipPath id="pfClip"><path d="' + mt + '"/></clipPath></defs>' +
      '<path class="pf-mt" d="' + mt + '" fill="url(#pfMt)"/>' +
      '<g clip-path="url(#pfClip)">' + cts + '<path class="pf-cap" d="' + cap + '"/>' +
        '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#pfFog)"/></g>' +
      '<path class="pf-line" d="' + line + '"/>' +
      '<path class="pf-walk" d="' + walked + '"/>';
  }

  /* ── „i“ der Lehrkraft: Ziel, Ablauf, Impuls ── */
  function info(i) {
    // direkt an <body>: der Glaskasten der Übersicht (backdrop-filter) würde position:fixed einfangen
    const s = STATIONS[i];
    let el = document.getElementById('pInfo');
    if (!el) { el = document.createElement('div'); el.id = 'pInfo'; el.className = 'pinfo'; el.hidden = true; document.body.appendChild(el); }
    const I = s.info;
    el.innerHTML = '<div class="pinfo-in glass" role="dialog" aria-modal="true" aria-label="' + s.t + '">' +
      '<div class="pinfo-h"><span class="pst-k">Halt ' + (i + 1) + ' · ' + s.t + '</span><b>' + s.sub + '</b>' +
        '<button class="pinfo-x" type="button" aria-label="Schließen">×</button></div>' +
      '<div class="pinfo-so">' + svg(SO[s.so].ic) + SO[s.so].t + '</div>' +
      '<h4>Ziel</h4><p>' + I.ziel + '</p>' +
      '<h4>So läuft es</h4><ol>' + I.tun.map(t => '<li>' + t + '</li>').join('') + '</ol>' +
      (I.impuls ? '<h4>Impuls zum nächsten Halt</h4><p class="pinfo-q">„' + I.impuls + '“</p>' : '') +
      '</div>';
    el.hidden = false;
    const close = () => { el.hidden = true; el.innerHTML = ''; document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    el.querySelector('.pinfo-x').addEventListener('click', close);
    el.onclick = e => { if (e.target === el) close(); };
    document.addEventListener('keydown', esc);
  }

  function clear() { if (ro) { ro.disconnect(); ro = null; } }

  return { render, clear, STATIONS };
})();
