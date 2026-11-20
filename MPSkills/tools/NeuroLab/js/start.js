/* ══════════════════════════════════════════════════════════════
   NeuroLab · start.js — Startseite, Freigaben, Navigation
   ══════════════════════════════════════════════════════════════
   Drei Bereiche (20.11.2026):
     neuron      Wie funktioniert ein Neuron?   Kacheln n-wie · n-typen
     bauen       Netze bauen (Build · Run, frei) Kachel b-frei
     trainieren  Netze trainieren (Lernen)       Kacheln = Szenarien sc-*
   Das Feld selbst ist das NeuroLab von vorher (app.js), es bekommt nur
   den Bereich gesagt: NLApp.enterArea('bauen' | 'lernen', szenario).

   Im Raum (?raum=lehrer|schueler) entscheidet die Lehrkraft, was die Klasse
   öffnen darf: skill_room_state.data.parts = Bereichs- + Kachel-ids. Eine
   Kachel ist offen, wenn Bereich UND Kachel geteilt sind. Fehlt parts: nur
   „Wie funktioniert ein Neuron?“. Botschaften mit tool.js:
     hinein  { type: 'nl:cmd', parts }   heraus  { type: 'nl:ready' } · { type: 'nl:parts', parts }
   Ohne Raum (allein) und im Schaufenster (?demo=1) ist alles offen.
   ⚠️ ids nie umbenennen — sie stehen in laufenden Räumen.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const ROOM = Q.get('raum') === 'lehrer' || Q.get('raum') === 'schueler' ? Q.get('raum') : null;
  const TEACHER = ROOM === 'lehrer', STUDENT = ROOM === 'schueler';
  const DEMO = Q.has('demo');
  const App = window.NLApp;

  const ICON = {
    neuron: '<svg viewBox="0 0 64 40"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="30" r="6"/><path d="M16 11 L28 18 M16 29 L28 22"/><rect x="28" y="11" width="22" height="18" rx="9"/><path d="M50 20 H60"/></svg>',
    bauen: '<svg viewBox="0 0 64 40"><circle cx="8" cy="12" r="5"/><circle cx="8" cy="28" r="5"/><rect x="26" y="5" width="12" height="10" rx="4"/><rect x="26" y="25" width="12" height="10" rx="4"/><rect x="48" y="15" width="12" height="10" rx="4"/><path d="M13 12 L26 10 M13 12 L26 30 M13 28 L26 10 M13 28 L26 30 M38 10 L48 20 M38 30 L48 20"/></svg>',
    trainieren: '<svg viewBox="0 0 64 40"><path d="M4 6 V36 H60"/><path d="M8 10 C18 12 20 28 30 30 S50 33 58 33" class="hl"/></svg>',
  };
  const SC_ICON = {
    gates: '<b class="t-big">&amp; ≥1 ⊕</b>',
    seg7: '<svg viewBox="0 0 30 46"><path class="hl" d="M7 4 H23 M25 6 V21 M25 25 V40 M7 42 H23 M5 25 V40 M5 6 V21 M7 23 H23"/></svg>',
    zielscheibe: '<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="20"/><circle cx="23" cy="23" r="12"/><circle cx="23" cy="23" r="4" class="fill"/></svg>',
    voegel: '<svg viewBox="0 0 60 40"><path class="hl" d="M4 22 C14 10 22 12 30 20 C38 12 46 10 56 22 C46 18 38 20 30 28 C22 20 14 18 4 22 Z"/></svg>',
    custom: '<b class="t-big">CSV</b>',
  };
  const SC_TEXT = {
    gates: 'AND, OR, NOT A und XOR gleichzeitig lernen – XOR geht nicht mit einer Schicht.',
    seg7: 'Welche Ziffer zeigt die 7-Segment-Anzeige? Sieben Eingänge, eine Zahl als Ausgabe.',
    zielscheibe: 'Wo trifft der Pfeil? Aus (x, y) die Punkte vorhersagen – 1500 Würfe.',
    voegel: '180 echte Greifvögel: Aus Flügel und Gewicht die Art erkennen.',
    custom: 'Eigene Tabelle als CSV hochladen: Spalten „input“ und „output“.',
  };

  const AREAS = [
    { id: 'neuron', title: 'Wie funktioniert ein Neuron?', text: 'Was in einem Neuron passiert – und welche Neuronen es gibt.',
      items: [
        { id: 'n-wie', title: 'Wie arbeitet ein Neuron?', text: 'Ein Neuron Stück für Stück aufdecken: Eingänge, Gewichte, Bias, Aktivierung – bis es Punkte trennt.' },
        { id: 'n-typen', title: 'Alle Neuronen', text: 'Perceptron, Linear, ReLU, Sigmoid und Tanh im Überblick.' },
      ] },
    { id: 'bauen', title: 'Netze bauen', text: 'Ein Netz frei zusammenklicken, Werte festlegen und sehen, was am Ende herauskommt.',
      items: [
        { id: 'b-frei', title: 'Freies Bauen', text: 'Schichten und Neuronen setzen, Typ wählen, Gewichte und Bias festlegen (Build) – dann Eingaben ändern und rechnen lassen (Run).' },
      ] },
    { id: 'trainieren', title: 'Netze trainieren', text: 'Ein- und Ausgänge gibt das Szenario vor. Wie viele Schichten und Neuronen dazwischen, entscheidest du.',
      items: App.scenarios().map(e => ({ id: e.id, key: e.key, title: e.name, text: SC_TEXT[e.key] || '' })) },
  ];
  const ALL_PARTS = AREAS.flatMap(a => [a.id, ...a.items.map(i => i.id)]);
  const DEFAULT_PARTS = ['neuron', 'n-wie', 'n-typen'];

  /* ── Freigaben ───────────────────────────────────────────── */
  let parts = ROOM ? null : ALL_PARTS.slice();
  const areaOf = id => AREAS.find(a => a.id === id || a.items.some(i => i.id === id));
  const shared = id => !!parts && parts.includes(id);
  function usable(id) {
    if (!STUDENT || DEMO) return true;
    const a = areaOf(id);
    return !!a && shared(a.id) && (id === a.id || shared(id));
  }
  function sendUp(m) { if (window.parent === window) return; try { window.parent.postMessage(m, location.origin); } catch (e) { /* zu */ } }
  function setParts(list, fromServer) {
    parts = (list || []).filter(x => ALL_PARTS.includes(x));
    if (!fromServer) sendUp({ type: 'nl:parts', parts });
    if (!booted) { boot(); return; }
    // Schüler: Teil entzogen, während man drin ist → Übersicht
    if (STUDENT && where.id && !usable(where.id)) goHome();
    else if (where.view === 'home') renderHome();
    else if (where.view === 'neuron') renderNeuron();
    else if (where.view === 'lab' && where.area === 'lernen') App.render();  // Szenario-Auswahl neu
  }
  function toggleShare(id) {
    if (!TEACHER || !parts) return;
    const a = AREAS.find(x => x.id === id);
    let next;
    if (shared(id)) next = parts.filter(x => x !== id);
    else if (a && !a.items.some(i => shared(i.id))) next = parts.concat(id, a.items.map(i => i.id));
    else next = parts.concat(id);
    setParts(next, false);
  }

  /* ── Speicher für „wo war ich“ ───────────────────────────── */
  const mem = {};
  const store = {
    get(k) { if (DEMO) return mem[k] ?? null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (DEMO) { mem[k] = v; return; } try { localStorage.setItem(k, v); } catch (e) { /* egal */ } },
  };
  let where = { view: 'home' };
  function saveWhere() { store.set('nl.where', JSON.stringify(where)); }

  const SHARE_SVG = '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── Ansichten ───────────────────────────────────────────── */
  function setView(v, title) {
    document.documentElement.dataset.view = v;
    $('area-title').textContent = title || '';
    $('btn-print').hidden = STUDENT;
    if (v !== 'lab') document.body.className = DEMO ? 'demo-mode' : '';
  }

  function renderHome() {
    const box = $('areas');
    const visible = AREAS.filter(a => !STUDENT || DEMO || shared(a.id));
    $('wait').hidden = visible.length > 0;
    box.innerHTML = visible.map(a => {
      const tiles = a.items.map(it => {
        const ok = usable(it.id);
        const art = a.id === 'trainieren' ? (SC_ICON[it.key] || '') : ICON[a.id];
        const share = TEACHER ? `<button class="share${shared(it.id) ? ' on' : ''}" data-share="${it.id}" title="${shared(it.id) ? 'Geteilt – antippen zum Entziehen' : 'Mit der Klasse teilen'}">${SHARE_SVG}<span>${shared(it.id) ? 'Geteilt' : 'Teilen'}</span></button>` : '';
        return `<div class="tile${ok ? '' : ' locked'}" data-id="${it.id}" role="button" tabindex="0">
          <div class="tile-art">${art}</div>
          <div class="tile-body"><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div>
          ${ok ? '' : `<span class="lock">${LOCK_SVG}</span>`}${share}
        </div>`;
      }).join('');
      const share = TEACHER ? `<button class="share area-share${shared(a.id) ? ' on' : ''}" data-share="${a.id}">${SHARE_SVG}<span>${shared(a.id) ? 'Bereich geteilt' : 'Bereich teilen'}</span></button>` : '';
      return `<section class="area area-${a.id}" data-area="${a.id}">
        <div class="area-head"><div><h2>${esc(a.title)}</h2><p>${esc(a.text)}</p></div>${share}</div>
        <div class="tiles">${tiles}</div>
      </section>`;
    }).join('');
    box.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); toggleShare(b.dataset.share); }));
    box.querySelectorAll('.tile').forEach(t => {
      const go = () => open(t.dataset.id);
      t.addEventListener('click', go);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  function open(id) {
    if (!usable(id)) return;
    const a = areaOf(id);
    if (!a) return;
    if (a.id === 'neuron') { where = { view: 'neuron', id }; renderNeuron(); }
    else if (a.id === 'bauen') { where = { view: 'lab', area: 'bauen', id }; setView('lab', a.title); App.enterArea('bauen'); }
    else {
      const it = a.items.find(i => i.id === id);
      where = { view: 'lab', area: 'lernen', id };
      setView('lab', a.title);
      App.enterArea('lernen', it && it.key);
    }
    saveWhere();
  }

  function renderNeuron() {
    setView('neuron', AREAS[0].title);
    const tabs = AREAS[0].items.filter(i => usable(i.id));
    if (!tabs.some(t => t.id === where.id)) where.id = tabs[0] && tabs[0].id;
    window.NLNeuron.render($('neuron-page'), {
      tabs, current: where.id,
      go: id => { where.id = id; saveWhere(); renderNeuron(); },
    });
  }

  function goHome() {
    if (where.view === 'lab') App.leaveArea();
    where = { view: 'home' };
    saveWhere();
    setView('home');
    renderHome();
    $('home').scrollTop = 0;
  }
  $('btn-home').addEventListener('click', goHome);

  /* ── Start ───────────────────────────────────────────────── */
  let booted = false;
  function boot() {
    booted = true;
    let w = null;
    try { w = JSON.parse(store.get('nl.where') || 'null'); } catch (e) { /* egal */ }
    if (w && w.id && usable(w.id)) open(w.id);
    else { setView('home'); renderHome(); }
  }

  /* Hell/Dunkel gewechselt: was mit Canvas gezeichnet ist, neu zeichnen
     (SVG und CSS folgen von selbst, js/theme.js). */
  window.addEventListener('nl:theme-redraw', () => {
    if (!booted) return;
    if (where.view === 'neuron') renderNeuron();
    else if (where.view === 'lab') App.render();
  });

  window.NLStart = { usable, goHome, open, get parts() { return parts; } };

  setView('home');
  if (STUDENT) renderHome();            // erst einmal leer, bis die Freigaben da sind
  if (!ROOM) boot();
  else {
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== window.parent || !e.data || e.data.type !== 'nl:cmd') return;
      setParts(Array.isArray(e.data.parts) ? e.data.parts.map(String) : DEFAULT_PARTS.slice(), true);
    });
    sendUp({ type: 'nl:ready' });
    // Lehrkraft ohne Antwort (z. B. allein getestet): nach kurzer Zeit trotzdem starten
    if (TEACHER) setTimeout(() => { if (!booted) { parts = DEFAULT_PARTS.slice(); boot(); } }, 1500);
  }
})();
